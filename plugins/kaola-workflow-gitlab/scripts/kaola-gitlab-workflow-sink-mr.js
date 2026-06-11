#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const forge = require('./kaola-gitlab-forge');
// #354 (#353-rest): crash-safe atomic durable-state write (tmp + fsync + rename).
const adaptiveSchema = require('./kaola-workflow-adaptive-schema');

const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';

function assert(cond, msg) { if (!cond) throw new Error(msg); }

function isSafeName(name) {
  return typeof name === 'string' && name.length > 0 &&
    !name.includes('/') && !name.includes('\\') &&
    !name.includes('\0') && name !== '.' && name !== '..';
}

function getRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch (_) {
    return process.cwd();
  }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--branch' && argv[i + 1]) { args.branch = argv[++i]; continue; }
    if (key === '--issue' && argv[i + 1]) { args.issue = parseInt(argv[++i], 10); continue; }
    if (key === '--project' && argv[i + 1]) { args.project = argv[++i]; continue; }
    if (key === '--title' && argv[i + 1]) { args.title = argv[++i]; continue; }
    if (key === '--description' && argv[i + 1]) { args.description = argv[++i]; continue; }
    if (key === '--merge') { args.merge = true; continue; }
    if (key === '--auto-merge') { args.autoMerge = true; continue; }
    if (key === '--squash') { args.squash = true; continue; }
    if (key === '--remove-source-branch') { args.removeSourceBranch = true; continue; }
    if (key === '--sha' && argv[i + 1]) { args.sha = argv[++i]; continue; }
  }
  return args;
}

function readConfig() {
  const configPath = path.join(os.homedir(), '.config', 'kaola-workflow', 'config.json');
  let raw = '{}';
  try { raw = fs.readFileSync(configPath, 'utf8'); } catch (_) {}
  let config;
  try { config = JSON.parse(raw); } catch (_) { config = {}; }
  if (typeof config !== 'object' || config === null) config = {};
  const defaults = { mr_auto_merge: false };
  return Object.assign({}, defaults, config);
}

function sinkBlock(content) {
  const match = /(^## Sink\s*$[\s\S]*?)(?=\n## |\s*$)/m.exec(content);
  return match ? match[1] : '';
}

function replaceOrAppendLine(section, key, value) {
  const line = key + ': ' + value;
  const re = new RegExp('^' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':.*$', 'm');
  return re.test(section) ? section.replace(re, line) : section.trimEnd() + '\n' + line;
}

function updateStateSinkBlock(stateFile, mrUrl, mrIid) {
  if (!fs.existsSync(stateFile)) return false;
  const content = fs.readFileSync(stateFile, 'utf8');
  const section = sinkBlock(content);
  if (!section) return false;
  let updatedSection = section;
  updatedSection = replaceOrAppendLine(updatedSection, 'sink', 'mr');
  updatedSection = replaceOrAppendLine(updatedSection, 'mr_url', mrUrl);
  updatedSection = replaceOrAppendLine(updatedSection, 'mr_iid', mrIid);
  adaptiveSchema.writeFileAtomicReplace(stateFile, content.replace(section, updatedSection));
  return true;
}

function appendSummary(summaryFile, mrUrl, mrIid) {
  if (!fs.existsSync(path.dirname(summaryFile))) return false;
  fs.appendFileSync(summaryFile, '\nMR URL: ' + mrUrl + '\nMR IID: ' + mrIid + '\n');
  return true;
}

function routeMergeRequestState(mr) {
  const state = forge.normalizeState(mr && mr.state);
  if (state === 'merged') return 'merged';
  if (state === 'closed') return 'closed';
  if (state === 'open') return 'open';
  return 'unknown';
}

function findMergeRequestForBranch(branch) {
  return forge.listMergeRequests({ state: 'opened' }).find(mr =>
    mr.source_branch === branch && routeMergeRequestState(mr) === 'open'
  ) || null;
}

function ensureMergeRequest(args, opts) {
  const options = opts || {};
  // Default true when gitExec stub or skipPush — both indicate test context without real git repo.
  const skipMetadataCommit = options.skipMetadataCommit !== undefined
    ? options.skipMetadataCommit
    : !!(options.gitExec || options.skipPush);
  assert(
    args.branch && args.branch !== 'TBD' &&
    !args.branch.startsWith('-') && !args.branch.includes('\0') &&
    args.branch !== '.' && args.branch !== '..',
    '--branch is invalid or TBD'
  );
  assert(args.project && isSafeName(args.project), '--project must be a safe folder name');
  if (args.issue != null) assert(Number.isFinite(args.issue) && args.issue > 0, '--issue must be a positive integer');

  const root = options.root || getRoot();

  // #336: keep-open is merge-sink-only — the MR body 'Closes #N' would auto-close the
  // kept-open issue, and watch-mr's archive-on-merge would delete the preserved roadmap source.
  // The ARCHIVED path is the one that fires in the real exit-3 fallback flow (the contractor
  // finalize archives the project BEFORE the sink runs, so the live state file is already gone);
  // the LIVE path covers a sink: mr project that gained issue_action by mistake. Guard sits
  // BEFORE the OFFLINE early-return (mode-independent, OFFLINE-testable).
  {
    const keepOpenRe = /^issue_action:\s*comment_keep_open\s*$/m;
    for (const f of [
      path.join(root, 'kaola-workflow', args.project, 'workflow-state.md'),
      path.join(root, 'kaola-workflow', 'archive', args.project, 'workflow-state.md')
    ]) {
      let s = ''; try { s = fs.readFileSync(f, 'utf8'); } catch (_) { continue; }
      assert(!keepOpenRe.test(s),
        'sink-mr: refusing: project ' + args.project + ' carries issue_action: comment_keep_open. ' +
        'Keep-open is merge-sink-only (an MR would auto-close the issue on merge). ' +
        'Remediate the merge sink and re-run sink-merge instead.');
    }
  }

  if (OFFLINE) {
    const mrUrl = 'OFFLINE_PLACEHOLDER';
    const mrIid = 0;
    const stateFile = path.join(root, 'kaola-workflow', args.project, 'workflow-state.md');
    const summaryFile = path.join(root, 'kaola-workflow', args.project, 'finalization-summary.md');
    updateStateSinkBlock(stateFile, mrUrl, mrIid);
    appendSummary(summaryFile, mrUrl, mrIid);
    const relState = path.relative(root, stateFile);
    const relSummary = path.relative(root, summaryFile);
    spawnSync('git', ['-C', root, 'add', relState, relSummary], { stdio: 'pipe' });
    const diffResult = spawnSync('git', ['-C', root, 'diff', '--cached', '--quiet'], { stdio: 'pipe' });
    if (diffResult.status !== 0) {
      const commitResult = spawnSync('git', ['-C', root, 'commit', '-m',
        'chore: record MR metadata for ' + args.project], { stdio: 'pipe' });
      if (commitResult.status !== 0) {
        process.stderr.write('[offline] metadata commit skipped: ' +
          (commitResult.stderr ? commitResult.stderr.toString().trim() : 'unknown error') + '\n');
      }
    }
    return { mr_url: mrUrl, mr_iid: mrIid };
  }

  const gitExec = options.gitExec || execFileSync;
  if (!options.skipPush) gitExec('git', ['push', 'origin', args.branch], { encoding: 'utf8' });

  const existing = findMergeRequestForBranch(args.branch);
  const mr = existing || forge.createMergeRequest({
    sourceBranch: args.branch,
    targetBranch: 'main',
    title: args.title || ('Workflow branch ' + args.branch),
    description: args.description || (args.issue ? 'Closes #' + args.issue : '')
  });

  assert(mr && mr.mr_iid, 'GitLab MR creation did not return an IID');
  assert(mr.mr_url || mr.web_url, 'GitLab MR creation did not return a URL');

  const stateFile = path.join(root, 'kaola-workflow', args.project, 'workflow-state.md');
  const summaryFile = path.join(root, 'kaola-workflow', args.project, 'finalization-summary.md');
  updateStateSinkBlock(stateFile, mr.mr_url || mr.web_url, mr.mr_iid);
  appendSummary(summaryFile, mr.mr_url || mr.web_url, mr.mr_iid);
  if (!skipMetadataCommit) {
    const relState = path.relative(root, stateFile);
    const relSummary = path.relative(root, summaryFile);
    spawnSync('git', ['-C', root, 'add', relState, relSummary], { stdio: 'pipe' });
    const diffResult = spawnSync('git', ['-C', root, 'diff', '--cached', '--quiet'], { stdio: 'pipe' });
    if (diffResult.status !== 0) {
      const commitResult = spawnSync('git', ['-C', root, 'commit', '-m',
        'chore: record MR metadata for ' + args.project], { stdio: 'pipe' });
      if (commitResult.status !== 0) {
        const mrUrl = mr.mr_url || mr.web_url;
        throw new Error(
          'MR created at ' + mrUrl + ' but metadata commit failed.\n' +
          'Manual recovery: git add ' + relState + ' ' + relSummary +
          " && git commit -m 'chore: record MR metadata for " + args.project + "'" +
          ' && git push origin ' + args.branch
        );
      }
      if (!options.skipPush) {
        const pushResult = spawnSync('git', ['-C', root, 'push', 'origin', args.branch], { stdio: 'pipe' });
        if (pushResult.status !== 0) {
          throw new Error(
            'MR created at ' + (mr.mr_url || mr.web_url) + ' but metadata push failed.\n' +
            'Manual recovery: git push origin ' + args.branch
          );
        }
      }
    }
  }
  return mr;
}

function mergeMergeRequest(mrIid, args) {
  const options = args || {};
  return forge.mergeMergeRequest(mrIid, {
    autoMerge: Boolean(options.autoMerge),
    squash: Boolean(options.squash),
    removeSourceBranch: Boolean(options.removeSourceBranch),
    sha: options.sha
  });
}

function maybeAutoMergeFromConfig(mr, configOverride) {
  const config = configOverride !== undefined ? configOverride : readConfig();
  if (config.mr_auto_merge === true) {
    try {
      mergeMergeRequest(mr.mr_iid, { autoMerge: true, squash: true, removeSourceBranch: true });
    } catch (mergeErr) {
      process.stderr.write('Warning: mr auto-merge failed: ' + mergeErr.message + '\n');
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const mr = ensureMergeRequest(args);
  if (args.merge && !OFFLINE) mergeMergeRequest(mr.mr_iid, args);
  else if (!OFFLINE) maybeAutoMergeFromConfig(mr);
  process.stdout.write('MR URL: ' + (mr.mr_url || mr.web_url) + '\nMR IID: ' + mr.mr_iid + '\n');
}

if (require.main === module) {
  try { main(); } catch (err) { process.stderr.write(err.message + '\n'); process.exitCode = 1; }
}

module.exports = {
  appendSummary,
  ensureMergeRequest,
  findMergeRequestForBranch,
  maybeAutoMergeFromConfig,
  mergeMergeRequest,
  routeMergeRequestState,
  updateStateSinkBlock
};

