#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const forge = require('./kaola-gitea-forge');
// #354 (#353-rest): crash-safe atomic durable-state write (tmp + fsync + rename).
const adaptiveSchema = require('./kaola-workflow-adaptive-schema');
const { getCoordRoot, readActiveFolders } = require('./kaola-gitea-workflow-claim');

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
  const defaults = { pr_auto_merge: false };
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

function updateStateSinkBlock(stateFile, prUrl, prNumber, fullName, projectHtmlUrl) {
  if (!fs.existsSync(stateFile)) return false;
  const content = fs.readFileSync(stateFile, 'utf8');
  const section = sinkBlock(content);
  if (!section) return false;
  let updatedSection = section;
  updatedSection = replaceOrAppendLine(updatedSection, 'sink', 'pr');
  updatedSection = replaceOrAppendLine(updatedSection, 'pr_url', prUrl);
  updatedSection = replaceOrAppendLine(updatedSection, 'pr_number', prNumber);
  updatedSection = replaceOrAppendLine(updatedSection, 'full_name', fullName);
  updatedSection = replaceOrAppendLine(updatedSection, 'project_html_url', projectHtmlUrl);
  adaptiveSchema.writeFileAtomicReplace(stateFile, content.replace(section, updatedSection));
  return true;
}

function appendSummary(summaryFile, prUrl, prNumber) {
  if (!fs.existsSync(path.dirname(summaryFile))) return false;
  fs.appendFileSync(summaryFile, '\nPR URL: ' + prUrl + '\nPR Number: ' + prNumber + '\n');
  return true;
}

function routePullRequestState(pr) {
  const state = forge.normalizeState(pr && pr.state);
  if (state === 'merged') return 'merged';
  if (state === 'closed') return 'closed';
  if (state === 'open') return 'open';
  return 'unknown';
}

function findPullRequestForBranch(branch) {
  return forge.listPullRequests({ state: 'opened' }).find(pr =>
    pr.source_branch === branch && routePullRequestState(pr) === 'open'
  ) || null;
}

function ensurePullRequest(args, opts) {
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

  // #336: keep-open is merge-sink-only — the PR body 'Closes #N' would auto-close the
  // kept-open issue, and watch-pr's archive-on-merge would delete the preserved roadmap source.
  // The ARCHIVED path is the one that fires in the real exit-3 fallback flow (the contractor
  // finalize archives the project BEFORE the sink runs, so the live state file is already gone);
  // the LIVE path covers a sink: pr project that gained issue_action by mistake. Guard sits
  // BEFORE the OFFLINE early-return (mode-independent, OFFLINE-testable).
  {
    const keepOpenRe = /^issue_action:\s*comment_keep_open\s*$/m;
    for (const f of [
      path.join(root, 'kaola-workflow', args.project, 'workflow-state.md'),
      path.join(root, 'kaola-workflow', 'archive', args.project, 'workflow-state.md')
    ]) {
      let s = ''; try { s = fs.readFileSync(f, 'utf8'); } catch (_) { continue; }
      assert(!keepOpenRe.test(s),
        'sink-pr: refusing: project ' + args.project + ' carries issue_action: comment_keep_open. ' +
        'Keep-open is merge-sink-only (a PR would auto-close the issue on merge). ' +
        'Remediate the merge sink and re-run sink-merge instead.');
    }
  }

  if (OFFLINE) {
    const prUrl = 'OFFLINE_PLACEHOLDER';
    const prNumber = 0;
    const project = {
      full_name: 'OFFLINE_PLACEHOLDER',
      html_url: 'OFFLINE_PLACEHOLDER',
      owner: 'OFFLINE',
      name: 'PLACEHOLDER'
    };
    const stateFile = path.join(root, 'kaola-workflow', args.project, 'workflow-state.md');
    const summaryFile = path.join(root, 'kaola-workflow', args.project, 'finalization-summary.md');
    updateStateSinkBlock(stateFile, prUrl, prNumber, project.full_name, project.html_url);
    appendSummary(summaryFile, prUrl, prNumber);
    const relState = path.relative(root, stateFile);
    const relSummary = path.relative(root, summaryFile);
    spawnSync('git', ['-C', root, 'add', relState, relSummary], { stdio: 'pipe' });
    const diffResult = spawnSync('git', ['-C', root, 'diff', '--cached', '--quiet'], { stdio: 'pipe' });
    if (diffResult.status !== 0) {
      const commitResult = spawnSync('git', ['-C', root, 'commit', '-m',
        'chore: record PR metadata for ' + args.project], { stdio: 'pipe' });
      if (commitResult.status !== 0) {
        process.stderr.write('[offline] metadata commit skipped: ' +
          (commitResult.stderr ? commitResult.stderr.toString().trim() : 'unknown error') + '\n');
      }
    }
    return { pr: { pr_url: prUrl, pr_number: prNumber }, project };
  }

  const gitExec = options.gitExec || execFileSync;
  if (!options.skipPush) gitExec('git', ['push', 'origin', args.branch], { encoding: 'utf8' });

  const project = forge.discoverProject(options);

  const existing = findPullRequestForBranch(args.branch);
  const pr = existing || forge.createPullRequest({
    sourceBranch: args.branch,
    targetBranch: 'main',
    title: args.title || ('Workflow branch ' + args.branch),
    description: args.description || (args.issue ? 'Closes #' + args.issue : '')
  });

  assert(pr && pr.pr_number, 'Gitea PR creation did not return a number');
  assert(pr.pr_url || pr.web_url, 'Gitea PR creation did not return a URL');

  const stateFile = path.join(root, 'kaola-workflow', args.project, 'workflow-state.md');
  const summaryFile = path.join(root, 'kaola-workflow', args.project, 'finalization-summary.md');
  updateStateSinkBlock(stateFile, pr.pr_url || pr.web_url, pr.pr_number, project.full_name, project.html_url);
  appendSummary(summaryFile, pr.pr_url || pr.web_url, pr.pr_number);
  if (!skipMetadataCommit) {
    const relState = path.relative(root, stateFile);
    const relSummary = path.relative(root, summaryFile);
    spawnSync('git', ['-C', root, 'add', relState, relSummary], { stdio: 'pipe' });
    const diffResult = spawnSync('git', ['-C', root, 'diff', '--cached', '--quiet'], { stdio: 'pipe' });
    if (diffResult.status !== 0) {
      const commitResult = spawnSync('git', ['-C', root, 'commit', '-m',
        'chore: record PR metadata for ' + args.project], { stdio: 'pipe' });
      if (commitResult.status !== 0) {
        const prUrl = pr.pr_url || pr.web_url;
        throw new Error(
          'PR created at ' + prUrl + ' but metadata commit failed.\n' +
          'Manual recovery: git add ' + relState + ' ' + relSummary +
          " && git commit -m 'chore: record PR metadata for " + args.project + "'" +
          ' && git push origin ' + args.branch
        );
      }
      if (!options.skipPush) {
        const pushResult = spawnSync('git', ['-C', root, 'push', 'origin', args.branch], { stdio: 'pipe' });
        if (pushResult.status !== 0) {
          throw new Error(
            'PR created at ' + (pr.pr_url || pr.web_url) + ' but metadata push failed.\n' +
            'Manual recovery: git push origin ' + args.branch
          );
        }
      }
    }
  }
  return { pr, project };
}

function mergePullRequest(pr, project, args) {
  const options = args || {};
  return forge.mergePullRequest(project, pr.pr_number, {
    autoMerge: Boolean(options.autoMerge),
    squash: Boolean(options.squash),
    removeSourceBranch: Boolean(options.removeSourceBranch),
    sha: options.sha
  });
}

function maybeAutoMergeFromConfig(pr, project, configOverride) {
  const config = configOverride !== undefined ? configOverride : readConfig();
  if (config.pr_auto_merge === true) {
    try {
      mergePullRequest(pr, project, { autoMerge: true, squash: true, removeSourceBranch: true });
    } catch (mergeErr) {
      process.stderr.write('Warning: pr auto-merge failed: ' + mergeErr.message + '\n');
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { pr, project } = ensurePullRequest(args);
  if (args.merge && !OFFLINE) mergePullRequest(pr, project, args);
  else if (!OFFLINE) maybeAutoMergeFromConfig(pr, project);
  process.stdout.write('PR URL: ' + (pr.pr_url || pr.web_url) + '\nPR Number: ' + pr.pr_number + '\n');
}

if (require.main === module) {
  try { main(); } catch (err) { process.stderr.write(err.message + '\n'); process.exitCode = 1; }
}

module.exports = {
  appendSummary,
  ensurePullRequest,
  findPullRequestForBranch,
  maybeAutoMergeFromConfig,
  mergePullRequest,
  routePullRequestState,
  updateStateSinkBlock
};
