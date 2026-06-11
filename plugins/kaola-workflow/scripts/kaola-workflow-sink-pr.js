#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, spawnSync } = require('child_process');
// #354 (#353-rest): crash-safe atomic durable-state write (tmp + fsync + rename) so a sink-block
// rewrite can never leave a torn workflow-state.md (silently skipped by readActiveFolders).
const adaptiveSchema = require('./kaola-workflow-adaptive-schema');
// #394: resolve the default branch (origin/HEAD probe chain, offline-safe) so the fallback PR
// sink targets master/other-default repos correctly — the old hardcoded `--base main` broke them.
const { defaultBranch } = require('./kaola-workflow-claim.js');

const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';
const CONFIG_PATH = path.join(os.homedir(), '.config', 'kaola-workflow', 'config.json');
const REMOTE_TIMEOUT_MS = (() => {
  const n = parseInt(process.env.KAOLA_GH_REMOTE_TIMEOUT_MS || '30000', 10);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 600000) : 30000;
})();

function assert(cond, msg) { if (!cond) throw new Error(msg); }

function isSafeName(name) {
  return typeof name === 'string' && name.length > 0 &&
    !name.includes('/') && !name.includes('\\') &&
    !name.includes('\0') && name !== '.' && name !== '..';
}

function ghExec(args) {
  if (OFFLINE) return '';
  return execFileSync('gh', args, { encoding: 'utf8', timeout: REMOTE_TIMEOUT_MS }).trim();
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

function readConfig() {
  const defaults = { pr_auto_merge: false };
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Object.assign({}, defaults, parsed);
  } catch (_) {
    try {
      fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaults, null, 2) + '\n');
    } catch (_2) {}
    return defaults;
  }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--branch' && argv[i + 1]) { args.branch = argv[++i]; continue; }
    if (argv[i] === '--issue' && argv[i + 1]) { args.issue = parseInt(argv[++i], 10); continue; }
    if (argv[i] === '--project' && argv[i + 1]) { args.project = argv[++i]; continue; }
  }
  return args;
}

function updateStateSinkBlock(stateFile, prUrl, prNumber) {
  if (!fs.existsSync(stateFile)) return;
  const content = fs.readFileSync(stateFile, 'utf8');

  // Find the ## Sink block; skip silently if absent
  if (!/^## Sink\s*$/m.test(content)) return;

  // Replace or insert pr_url and pr_number within the Sink block.
  // The Sink block ends at the next ## header or EOF.
  const SINK_BLOCK_RE = /(^## Sink\s*$[\s\S]*?)(?=\n## |\s*$)/m;
  const match = SINK_BLOCK_RE.exec(content);
  if (!match) return;

  let sinkSection = match[1];
  const prUrlLine = 'pr_url: ' + prUrl;
  const prNumberLine = 'pr_number: ' + prNumber;

  if (/^pr_url:.*$/m.test(sinkSection)) {
    sinkSection = sinkSection.replace(/^pr_url:.*$/m, prUrlLine);
  } else {
    sinkSection = sinkSection.trimEnd() + '\n' + prUrlLine;
  }

  if (/^pr_number:.*$/m.test(sinkSection)) {
    sinkSection = sinkSection.replace(/^pr_number:.*$/m, prNumberLine);
  } else {
    sinkSection = sinkSection.trimEnd() + '\n' + prNumberLine;
  }

  const updated = content.replace(SINK_BLOCK_RE, sinkSection);
  adaptiveSchema.writeFileAtomicReplace(stateFile, updated);
}

function appendSummary(summaryFile, prUrl, prNumber) {
  // #394: guard — the STANDARD exit-3 lane archives the project before the fallback sink runs, so the
  // live finalization-summary.md is gone. A raw appendFileSync then crashed with ENOENT AFTER the PR
  // was created (the orphaned-open-PR bug). Skip silently when the parent dir is absent (the durable
  // pr_url record is written separately, before any throwable step).
  if (!fs.existsSync(path.dirname(summaryFile))) return;
  fs.appendFileSync(summaryFile, '\nPR URL: ' + prUrl + '\nPR number: ' + prNumber + '\n');
}

// #394: resolve the project folder — LIVE first, then the ARCHIVE folder (the standard exit-3 lane
// archives before the fallback sink runs). Returns the dir that exists, or the live dir as the
// default (callers presence-guard their writes).
function resolveProjectDir(root, project) {
  const live = path.join(root, 'kaola-workflow', project);
  if (fs.existsSync(live)) return live;
  const archived = path.join(root, 'kaola-workflow', 'archive', project);
  if (fs.existsSync(archived)) return archived;
  return live;
}

// #394: record pr_url to a DURABLE location BEFORE any step that can throw after PR creation, so a
// later crash (metadata commit / push / appendSummary) never leaves an orphaned open PR invisible to
// watch-pr. Written into the resolved project's .cache (archive folder in the standard exit-3 lane).
function recordPrResult(projectDir, project, prUrl, prNumber, branch) {
  try {
    const cacheDir = path.join(projectDir, '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      path.join(cacheDir, 'sink-pr-result.json'),
      JSON.stringify({ project, branch, pr_url: prUrl, pr_number: prNumber, timestamp: new Date().toISOString() }, null, 2) + '\n'
    );
  } catch (_) { /* best-effort durable record; never block the PR flow */ }
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  assert(
    args.branch && args.branch !== 'TBD' &&
    !args.branch.startsWith('-') && !args.branch.includes('\0') &&
    args.branch !== '.' && args.branch !== '..',
    '--branch is invalid or TBD'
  );
  assert(args.project && isSafeName(args.project), '--project must be a safe folder name');
  if (args.issue != null) {
    assert(Number.isFinite(args.issue) && args.issue > 0, '--issue must be a positive integer');
  }

  const root = getRoot();
  const config = readConfig();
  // #394: resolve the project dir — LIVE first, then ARCHIVE (the standard exit-3 fallback lane
  // archives before this sink runs). All durable writes target the resolved dir; appendSummary +
  // updateStateSinkBlock presence-guard, and recordPrResult writes the pr_url there before any
  // throwable step.
  const projectFolder = resolveProjectDir(root, args.project);
  const stateFile = path.join(projectFolder, 'workflow-state.md');
  const summaryFile = path.join(projectFolder, 'finalization-summary.md');

  // #336: keep-open is merge-sink-only — the PR body 'Closes #N' would auto-close the
  // kept-open issue, and watch-pr's archive-on-merge would delete the preserved roadmap source.
  // The ARCHIVED path is the one that fires in the real exit-3 fallback flow (the contractor
  // finalize archives the project BEFORE the sink runs, so the live state file is already gone);
  // the LIVE path covers a sink: pr project that gained issue_action by mistake. Guard sits
  // BEFORE the OFFLINE early-return (mode-independent, OFFLINE-testable).
  const keepOpenRe = /^issue_action:\s*comment_keep_open\s*$/m;
  for (const f of [stateFile, path.join(root, 'kaola-workflow', 'archive', args.project, 'workflow-state.md')]) {
    let s = ''; try { s = fs.readFileSync(f, 'utf8'); } catch (_) { continue; }
    assert(!keepOpenRe.test(s),
      'sink-pr: refusing: project ' + args.project + ' carries issue_action: comment_keep_open. ' +
      'Keep-open is merge-sink-only (a PR would auto-close the issue on merge). ' +
      'Remediate the merge sink and re-run sink-merge instead.');
  }

  if (OFFLINE) {
    const prUrl = 'OFFLINE_PLACEHOLDER';
    const prNumber = 0;
    updateStateSinkBlock(stateFile, prUrl, prNumber);
    appendSummary(summaryFile, prUrl, prNumber);
    // Metadata commit in OFFLINE mode (no push — no remote)
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
    return;
  }

  // Step 3 — push branch
  execFileSync('git', ['push', 'origin', args.branch], { encoding: 'utf8' });

  // #394: resolve the PR base from the default branch (origin/HEAD probe chain) — the prior
  // hardcoded `--base main` made the fallback PR sink fail on a master-default repo (the #350
  // resolution never reached this sink). A sink-fallback.json receipt (written by sink-merge) may
  // carry the already-resolved branch; prefer it, else probe.
  let baseBranch = 'main';
  try {
    const fbPath = path.join(projectFolder, '.cache', 'sink-fallback.json');
    if (fs.existsSync(fbPath)) {
      const fb = JSON.parse(fs.readFileSync(fbPath, 'utf8'));
      if (fb && typeof fb.resolved_default_branch === 'string' && fb.resolved_default_branch) baseBranch = fb.resolved_default_branch;
    }
  } catch (_) {}
  if (baseBranch === 'main') {
    try { baseBranch = defaultBranch(root) || 'main'; } catch (_) { baseBranch = 'main'; }
  }

  // Step 4 — create PR
  const prCreateArgs = [
    'pr', 'create',
    '--head', args.branch,
    '--base', baseBranch,
    '--fill',
  ];
  if (args.issue != null) {
    prCreateArgs.push('--body', 'Closes #' + args.issue);
  }

  const prUrl = ghExec(prCreateArgs);

  // Step 5 — assert URL
  assert(prUrl.startsWith('https://'), 'gh pr create did not return a valid URL: ' + prUrl);

  // Step 6 — parse PR number
  const prNumMatch = prUrl.match(/\/pull\/(\d+)/);
  const prNumber = prNumMatch ? parseInt(prNumMatch[1], 10) : 0;

  // #394 RECORD-BEFORE-THROW: persist pr_url to a durable location IMMEDIATELY after `gh pr create`,
  // BEFORE updateStateSinkBlock / appendSummary / the metadata commit+push (any of which can throw).
  // Without this, a crash after PR creation left an orphaned open PR with no durable pr_url — watch-pr
  // never saw it. The record lives in the resolved project's .cache (archive folder in the exit-3 lane).
  recordPrResult(projectFolder, args.project, prUrl, prNumber, args.branch);

  // Step 7 — update workflow-state.md Sink block
  updateStateSinkBlock(stateFile, prUrl, prNumber);

  // Step 8 — append to finalization-summary.md
  appendSummary(summaryFile, prUrl, prNumber);

  // Metadata commit — deliberate follow-up commit for clean worktree
  const relState = path.relative(root, stateFile);
  const relSummary = path.relative(root, summaryFile);
  spawnSync('git', ['-C', root, 'add', relState, relSummary], { stdio: 'pipe' });
  const diffResult = spawnSync('git', ['-C', root, 'diff', '--cached', '--quiet'], { stdio: 'pipe' });
  if (diffResult.status !== 0) {
    const commitResult = spawnSync('git', ['-C', root, 'commit', '-m',
      'chore: record PR metadata for ' + args.project], { stdio: 'pipe' });
    if (commitResult.status !== 0) {
      throw new Error(
        'PR created at ' + prUrl + ' but metadata commit failed.\n' +
        'Manual recovery: git add ' + relState + ' ' + relSummary +
        " && git commit -m 'chore: record PR metadata for " + args.project + "'" +
        ' && git push origin ' + args.branch
      );
    }
    const pushResult = spawnSync('git', ['-C', root, 'push', 'origin', args.branch], { stdio: 'pipe' });
    if (pushResult.status !== 0) {
      throw new Error(
        'PR created at ' + prUrl + ' but metadata push failed.\n' +
        'Manual recovery: git push origin ' + args.branch
      );
    }
  }

  // Step 9 — optional auto-merge
  if (config.pr_auto_merge === true) {
    try {
      ghExec(['pr', 'merge', prUrl, '--auto', '--squash', '--delete-branch']);
    } catch (mergeErr) {
      process.stderr.write('Warning: pr auto-merge failed: ' + mergeErr.message + '\n');
    }
  }
}

try { main(); } catch (err) { process.stderr.write(err.message + '\n'); process.exitCode = 1; }
