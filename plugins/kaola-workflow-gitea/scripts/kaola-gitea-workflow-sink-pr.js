#!/usr/bin/env node
'use strict';
// sink-pr — the Gitea request sink. #1098 contract, the Gitea port of the GitHub sink-pr rules:
//   All project-directory reads/writes target the MAIN checkout (a linked dev worktree resolving
//   its own toplevel lost the archive, re-created a live folder inside the worktree, and bypassed
//   the keep-open guard). An existing PR is looked up BEFORE any push: the durable record
//   (.cache/sink-pr-result.json, then the state's pr_url) identifies it, else an open-PR scan for
//   this source branch. An OPEN PR is reused (its target branch and every member's `Closes #n`
//   verified — a bundle closes all or none); a MERGED PR reports already_merged and touches nothing
//   (watch-pr reconciles it); a CLOSED-unmerged PR is refused as pr_closed_unmerged. Writes are
//   idempotent so a re-entry mints nothing new. The run's archive rides the PR itself: the archive
//   commit is built from the main checkout's working tree through the kernel's private index onto
//   the branch tip, the local branch is advanced (ff-only where checked out, CAS update-ref
//   otherwise), then pushed — never the default branch, never a force. The main checkout's index
//   and HEAD are never touched. Keep-open stays merge-sink-only (#336, D4=(a)).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const forge = require('./kaola-gitea-forge');
// #354 (#353-rest): crash-safe atomic durable-state write (tmp + fsync + rename).
const adaptiveSchema = require('./kaola-workflow-adaptive-schema');
// #394: resolve the default branch (offline-safe probe chain) so the fallback PR sink targets the
// real default — the old hardcoded targetBranch:'main' broke master/other-default repos.
const { getCoordRoot, readActiveFolders, defaultBranch } = require('./kaola-gitea-workflow-claim');

const GIT_MAX_BUFFER = 64 * 1024 * 1024;

// #394: resolve the project folder — LIVE first, then the ARCHIVE folder (the standard exit-3 lane
// archives before the fallback sink runs).
function resolveProjectDir(root, project) {
  const live = path.join(root, 'kaola-workflow', project);
  if (fs.existsSync(live)) return live;
  const archived = path.join(root, 'kaola-workflow', 'archive', project);
  if (fs.existsSync(archived)) return archived;
  return live;
}

// #394: record pr_url to a DURABLE location BEFORE any throwable step after PR creation, so a later
// crash never leaves an orphaned open PR invisible to watch-pr. #1098: idempotent — when
// {project, branch, pr_url, pr_number} are unchanged the file is NOT rewritten; a fresh timestamp
// would mint a new archive commit on every re-entry.
function recordPrResult(projectDir, project, prUrl, prNumber, branch) {
  try {
    const cacheDir = path.join(projectDir, '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const recordPath = path.join(cacheDir, 'sink-pr-result.json');
    const next = { project, branch, pr_url: prUrl, pr_number: prNumber, timestamp: new Date().toISOString() };
    try {
      const prev = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
      if (prev && typeof prev === 'object' &&
          prev.project === next.project && prev.branch === next.branch &&
          prev.pr_url === next.pr_url && prev.pr_number === next.pr_number) return;
    } catch (_) {}
    // Atomic (tmp + fsync + rename): the whole point of this record is to be DURABLE before any step
    // that can throw after PR creation. A bare write is neither fsynced nor all-or-nothing, so the
    // very crash it guards against could leave watch-pr a truncated, unparseable pr_url.
    adaptiveSchema.writeFileAtomicReplace(recordPath, JSON.stringify(next, null, 2) + '\n');
  } catch (_) { /* best-effort durable record; never block the PR flow */ }
}

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
    // #1094: the claimed member set (finalize's `--issue-numbers`) — one `Closes #n` per member.
    if (key === '--issue-numbers' && argv[i + 1]) { args.issueNumbers = parseIssueNumbers(argv[++i]); continue; }
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

function parseIssueNumbers(raw) {
  const nums = String(raw || '').split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isInteger(n) && n > 0);
  return Array.from(new Set(nums)).sort((a, b) => a - b);
}

// #1094: the members this request closes. The `--issue-numbers` flag wins; when it is absent, the
// state's `issue_numbers` line (live or archived) supplies the set, as sink-merge's #393a does, so
// a flag omission cannot leave bundle members open. The primary `--issue` is always a member.
// A singleton claim has no issue_numbers line and closes only `--issue`, exactly as before.
function resolveMemberSet(args, stateFile) {
  let members = Array.isArray(args.issueNumbers) ? args.issueNumbers.slice() : [];
  if (members.length === 0) {
    try {
      const m = fs.readFileSync(stateFile, 'utf8').match(/^issue_numbers:\s*(.+?)\s*$/m);
      if (m) members = parseIssueNumbers(m[1]);
    } catch (_) {}
  }
  if (args.issue != null && !members.includes(args.issue)) members.push(args.issue);
  return Array.from(new Set(members)).sort((a, b) => a - b);
}

function closesBody(members) {
  return members.map(n => 'Closes #' + n).join('\n');
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

function updateStateSinkBlock(stateFile, prUrl, prNumber, fullName, projectHtmlUrl) {
  if (!fs.existsSync(stateFile)) return false;
  const content = fs.readFileSync(stateFile, 'utf8');
  const lines = content.split('\n');
  const start = lines.findIndex(l => /^## Sink\s*$/.test(l));
  if (start === -1) return false; // no Sink block: skip silently, exactly as before
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) { end = i; break; }
  }
  const block = lines.slice(start + 1, end);
  const tail = [];
  while (block.length > 0 && block[block.length - 1].trim() === '') tail.unshift(block.pop());
  const upsert = (key, value) => {
    const idx = block.findIndex(l => new RegExp('^' + key + ':').test(l));
    const line = key + ': ' + value;
    if (idx === -1) block.push(line);
    else block[idx] = line;
  };
  upsert('sink', 'pr');
  upsert('pr_url', prUrl);
  upsert('pr_number', prNumber);
  upsert('full_name', fullName);
  upsert('project_html_url', projectHtmlUrl);
  const updated = lines.slice(0, start + 1).concat(block, tail, lines.slice(end)).join('\n');
  // #1098: idempotent re-entry — a byte-identical result is not rewritten (no mtime churn, and no
  // new archive commit minted by the publish that follows).
  if (updated === content) return false;
  adaptiveSchema.writeFileAtomicReplace(stateFile, updated);
  return true;
}

function appendSummary(summaryFile, prUrl, prNumber) {
  if (!fs.existsSync(path.dirname(summaryFile))) return false;
  // #1098: re-entry must not mint duplicate lines — skip when this PR URL is already recorded.
  let existing = '';
  try { existing = fs.readFileSync(summaryFile, 'utf8'); } catch (_) {}
  if (('\n' + existing + '\n').includes('\nPR URL: ' + prUrl + '\n')) return false;
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

// #1098 §2.1-2: the durable identity of this project's PR — the .cache record first, then the
// state Sink block's pr_url. An OFFLINE placeholder is not an identity. Returns '' when none.
function readRecordedPrUrl(projectFolder, stateFile) {
  try {
    const rec = JSON.parse(fs.readFileSync(path.join(projectFolder, '.cache', 'sink-pr-result.json'), 'utf8'));
    if (rec && typeof rec === 'object' && typeof rec.pr_url === 'string' &&
        rec.pr_url && rec.pr_url !== 'OFFLINE_PLACEHOLDER') return rec.pr_url;
  } catch (_) {}
  try {
    const m = fs.readFileSync(stateFile, 'utf8').match(/^pr_url:\s*(\S+)\s*$/m);
    if (m && m[1] && m[1] !== 'OFFLINE_PLACEHOLDER') return m[1];
  } catch (_) {}
  return '';
}

// #1098 §2.1-2: a PR view normalized to the fields reuse routing needs. `body` is carried because a
// bundle's reuse check reads every member's `Closes #n` out of it.
function normalizePrView(data) {
  if (!data || typeof data !== 'object') return null;
  const url = typeof data.pr_url === 'string' && data.pr_url ? data.pr_url
    : (typeof data.web_url === 'string' && data.web_url ? data.web_url : '');
  const num = Number(data.pr_number);
  if (!url || !Number.isFinite(num) || num <= 0) return null;
  return {
    url: url,
    number: parseInt(num, 10),
    state: routePullRequestState(data),
    head: String(data.source_branch || ''),
    base: String(data.target_branch || ''),
    body: String(data.body || data.description || '')
  };
}

// #1098 §2.1-2: the recorded PR's CURRENT state — merged and closed are as load-bearing as open.
// Any probe failure returns null so the caller falls back to the head-based discovery.
function viewRecordedPr(prUrl) {
  try {
    const numMatch = String(prUrl).match(/\/(\d+)\/?\s*$/);
    const num = numMatch ? parseInt(numMatch[1], 10) : 0;
    if (!num) return null;
    return normalizePrView(forge.viewPullRequest(num));
  } catch (_) { return null; }
}

// #1098 §2.1-2: record-less discovery — open PRs for this source branch.
function listOpenPrs(branch) {
  try {
    return forge.listPullRequests({ state: 'opened' })
      .filter(pr => pr.source_branch === branch && routePullRequestState(pr) === 'open')
      .map(normalizePrView).filter(Boolean);
  } catch (_) { return []; }
}

// #1098 §2.1-4 helpers — the archive-commit path rules mirror sink-merge's archive_commit arm.

function ignoredUntrackedUnder(mainRoot, pathspec) {
  try {
    const out = execFileSync('git', ['-C', mainRoot, 'ls-files', '-o', '-i', '--exclude-standard', '-z', '--', pathspec],
      { encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER, stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\0').filter(Boolean);
  } catch (_) { return []; }
}

function repoWideIgnoredNames(root, rels) {
  const names = Array.from(new Set(rels.map(r => String(r).split('/').pop()).filter(Boolean)));
  if (!names.length) return new Set();
  try {
    const out = execFileSync('git', ['-C', root, 'check-ignore', '--stdin', '-z', '--no-index'],
      { input: names.join('\0') + '\0', encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER,
        stdio: ['pipe', 'pipe', 'ignore'] });
    return new Set(out.split('\0').filter(Boolean));
  } catch (_) { return new Set(); }
}

function worktreeHoldingBranch(mainRoot, branch) {
  let out = '';
  try {
    out = execFileSync('git', ['-C', mainRoot, 'worktree', 'list', '--porcelain'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (_) { return null; }
  let current = null;
  for (const line of String(out).split('\n')) {
    if (line.indexOf('worktree ') === 0) { current = line.slice('worktree '.length); continue; }
    if (line === 'branch refs/heads/' + branch) return current;
  }
  return null;
}

function firstLineOf(result) {
  const text = String((result && (result.stderr || result.stdout)) || '');
  return text.split('\n').map(l => l.trim()).filter(Boolean)[0] || 'unknown error';
}

// #1098 §2.1-4: the run's archive rides the PR. NON-LINKED posture (main checkout HEAD == branch):
// the legacy commit-on-HEAD flow, staging the whole resolved project dir instead of two files.
// LINKED posture (HEAD != branch): the archive commit is built from the main checkout's working
// tree through the kernel's private index onto the branch tip, the local branch is advanced
// (ff-only merge in the worktree that holds it, CAS update-ref otherwise), then pushed. The main
// checkout's index and HEAD are never touched; the default branch is never pushed; a push is never
// forced. A refusal is reported and thrown — never retried, never forced.
function publishArchiveWithPr(root, project, branch, projectFolder, prUrl, options) {
  const options_ = options || {};
  let head = '';
  try {
    head = execFileSync('git', ['-C', root, 'rev-parse', '--abbrev-ref', 'HEAD'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (_) {}
  const relDir = path.relative(root, projectFolder).split(path.sep).join('/');
  if (head === branch) {
    spawnSync('git', ['-C', root, 'add', '--', relDir], { stdio: 'pipe' });
    const diffResult = spawnSync('git', ['-C', root, 'diff', '--cached', '--quiet'], { stdio: 'pipe' });
    if (diffResult.status !== 0) {
      const commitResult = spawnSync('git', ['-C', root, 'commit', '-m',
        'chore: record PR metadata for ' + project], { stdio: 'pipe' });
      if (commitResult.status !== 0) {
        throw new Error(
          'PR at ' + prUrl + ' but metadata commit failed.\n' +
          'Manual recovery: git add ' + relDir +
          " && git commit -m 'chore: record PR metadata for " + project + "'" +
          ' && git push origin ' + branch
        );
      }
      if (!options_.skipPush) {
        const pushResult = spawnSync('git', ['-C', root, 'push', 'origin', branch], { stdio: 'pipe' });
        if (pushResult.status !== 0) {
          throw new Error(
            'PR at ' + prUrl + ' but metadata push failed.\n' +
            'Manual recovery: git push origin ' + branch
          );
        }
      }
    }
    return;
  }
  const archiveRel = 'kaola-workflow/archive/' + project + '/';
  // A live (not yet archived) project has no archive band to publish; its records stay with the
  // finalize transaction, and a re-entry after archive publishes them.
  if (!fs.existsSync(path.join(root, archiveRel))) return;
  if (options_.skipPush) return; // test context without a real remote/branch
  let tip = '';
  try {
    tip = execFileSync('git', ['-C', root, 'rev-parse', '--verify', 'refs/heads/' + branch],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (_) {
    throw new Error(
      'PR at ' + prUrl + ' but the local branch ' + branch + ' is missing — the archive cannot ride the PR.\n' +
      'Manual recovery: re-create the branch from the PR head, then re-run sink-pr (the PR record is durable).'
    );
  }
  const ignoredHere = ignoredUntrackedUnder(root, archiveRel);
  const byName = repoWideIgnoredNames(root, ignoredHere);
  const forcePaths = ignoredHere.filter(p => {
    const base = p.split('/').pop();
    return !byName.has(base) && base !== 'sink-receipt.json' && base !== 'sink-fallback.json';
  });
  const commitRes = adaptiveSchema.commitPathsOntoCandidate(root, {
    candidate: tip,
    arms: [{
      paths: [archiveRel],
      excludes: [
        ':(exclude,glob)kaola-workflow/archive/' + project + '/**/sink-receipt.json',
        ':(exclude,glob)kaola-workflow/archive/' + project + '/**/sink-fallback.json'
      ]
    }],
    forcePaths: forcePaths,
    message: 'chore: record PR metadata for ' + project
  });
  if (commitRes.error) {
    throw new Error('PR at ' + prUrl + ' but the archive commit failed: ' + commitRes.error +
      '\nNot retried, not forced; re-run sink-pr to continue from here (the PR record is durable).');
  }
  if (!commitRes.committed) return; // tree identical to the tip — a re-entry is a no-op
  const holder = worktreeHoldingBranch(root, branch);
  if (holder) {
    const merge = spawnSync('git', ['-C', holder, 'merge', '--ff-only', '--no-edit', commitRes.committed], { stdio: 'pipe' });
    if (merge.status !== 0) {
      throw new Error(
        'PR at ' + prUrl + ' but the fast-forward of ' + branch + ' in ' + holder + ' was refused (' +
        firstLineOf(merge) + ').\nNot retried, not forced; clear the worktree and re-run sink-pr.'
      );
    }
  } else {
    const cas = spawnSync('git', ['-C', root, 'update-ref', 'refs/heads/' + branch, commitRes.committed, tip], { stdio: 'pipe' });
    if (cas.status !== 0) {
      throw new Error(
        'PR at ' + prUrl + ' but the compare-and-swap update of refs/heads/' + branch + ' was refused (' +
        firstLineOf(cas) + ').\nNot retried, not forced; re-run sink-pr to continue from here.'
      );
    }
  }
  const push = spawnSync('git', ['-C', root, 'push', 'origin', branch], { stdio: 'pipe' });
  if (push.status !== 0) {
    throw new Error(
      'PR at ' + prUrl + ' but the archive push to origin/' + branch + ' was refused (' +
      firstLineOf(push) + ').\nNot retried, not forced; re-run sink-pr to continue from here.'
    );
  }
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

  // #1098 §2.1-1: every project-directory read/write targets the MAIN checkout — a linked dev
  // worktree resolving its own toplevel found no archive, re-created a live folder inside the
  // worktree, and bypassed the keep-open guard. In a non-linked checkout resolveMainRoot is the
  // toplevel itself, so existing behavior is unchanged. An explicit test `root` is authoritative.
  const root = options.root || adaptiveSchema.resolveMainRoot(getRoot());

  // #336: keep-open is merge-sink-only — the PR body 'Closes #N' would auto-close the
  // kept-open issue, and watch-pr's archive-on-merge would delete the preserved roadmap source.
  // The ARCHIVED path is the one that fires in the real exit-3 fallback flow (the finalize
  // transaction archives the project BEFORE the sink runs, so the live state file is already gone);
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

  // #394: resolve the PR target branch from the default branch (a sink-fallback.json receipt from
  // sink-merge may carry the already-resolved branch; prefer it, else probe). The prior hardcoded
  // 'main' made the fallback PR sink fail on a master-default repo. #1098: moved BEFORE the
  // existing-PR lookup and the push so reuse validation compares against the resolved default.
  const projectFolder = resolveProjectDir(root, args.project);
  // #1098 §2.1-1: a folder that is neither live nor archived is a caller error, refused BEFORE any
  // push or PR creation (the old resolveProjectDir returned the live path and let writes mkdir it
  // back into existence).
  assert(fs.existsSync(projectFolder),
    'sink-pr: project folder not found (neither kaola-workflow/' + args.project +
    '/ nor kaola-workflow/archive/' + args.project + ') — refusing before creating a PR');
  const stateFile = path.join(projectFolder, 'workflow-state.md');
  let targetBranch = 'main';
  try {
    const fbPath = path.join(projectFolder, '.cache', 'sink-fallback.json');
    if (fs.existsSync(fbPath)) {
      const fb = JSON.parse(fs.readFileSync(fbPath, 'utf8'));
      if (fb && typeof fb.resolved_default_branch === 'string' && fb.resolved_default_branch) targetBranch = fb.resolved_default_branch;
    }
  } catch (_) {}
  if (targetBranch === 'main') {
    try { targetBranch = defaultBranch(root) || 'main'; } catch (_) { targetBranch = 'main'; }
  }

  // #1098 §2.1-2: find the existing PR BEFORE any push. Identity comes from the durable record
  // first; record-less discovery scans open PRs for this source branch.
  let existing = null;
  const recordedUrl = readRecordedPrUrl(projectFolder, stateFile);
  if (recordedUrl) existing = viewRecordedPr(recordedUrl);
  if (!existing) {
    const open = listOpenPrs(args.branch);
    if (open.length > 0) existing = open[0];
  }
  const project = forge.discoverProject(options);
  if (existing) {
    if (existing.state === 'merged') {
      // Merged: no push, no create, no merge — §2.2's reconciliation owns the disposition.
      return { pr: { pr_url: existing.url, pr_number: existing.number }, project, already_merged: true };
    }
    if (existing.state !== 'open') {
      // CLOSED without merging: the archive is the only run record, and reopening is the
      // orchestrator's decision — refuse, modify nothing.
      assert(false,
        'sink-pr: refusing: PR ' + existing.url + ' is closed without merging (pr_closed_unmerged). ' +
        'The orchestrator decides whether to reopen; nothing was pushed or created.');
    }
    // OPEN → reuse. Candidate identity: head==branch, base==resolved default branch.
    assert(existing.head === args.branch,
      'sink-pr: refusing to reuse PR ' + existing.url + ': source branch is ' +
      (existing.head || '(empty)') + ', expected ' + args.branch);
    assert(existing.base === targetBranch,
      'sink-pr: refusing to reuse PR ' + existing.url + ': target branch is ' +
      (existing.base || '(empty)') + ', expected ' + targetBranch);
    const members = resolveMemberSet(args, stateFile);
    const missingCloses = members.filter(n =>
      !new RegExp('^Closes\\s+#' + n + '\\s*$', 'm').test(existing.body));
    assert(missingCloses.length === 0,
      'sink-pr: refusing to reuse PR ' + existing.url + ': body is missing "Closes #' +
      missingCloses[0] + '" for issue(s): ' + missingCloses.join(', ') +
      '. A bundle closes every member or none (#592/#1094); the PR was not modified.');
  }

  const reused = !!existing;
  let pr;
  if (!reused) {
    if (!options.skipPush) gitExec('git', ['push', 'origin', args.branch], { encoding: 'utf8' });
    pr = forge.createPullRequest({
      sourceBranch: args.branch,
      targetBranch: targetBranch,
      title: args.title || ('Workflow branch ' + args.branch),
      description: args.description || closesBody(resolveMemberSet(args, stateFile))
    });
    assert(pr && pr.pr_number, 'Gitea PR creation did not return a number');
    assert(pr.pr_url || pr.web_url, 'Gitea PR creation did not return a URL');
  } else {
    pr = {
      pr_number: existing.number,
      pr_url: existing.url,
      web_url: existing.url,
      state: 'open',
      source_branch: existing.head,
      target_branch: existing.base
    };
  }

  // #394 RECORD-BEFORE-THROW: persist pr_url durably IMMEDIATELY after the PR is identified,
  // BEFORE the throwable updateStateSinkBlock / appendSummary / archive publish.
  recordPrResult(projectFolder, args.project, pr.pr_url || pr.web_url, pr.pr_number, args.branch);

  // #394: target the resolved project folder (archive folder in the exit-3 lane) for durable writes.
  const summaryFile = path.join(projectFolder, 'finalization-summary.md');
  updateStateSinkBlock(stateFile, pr.pr_url || pr.web_url, pr.pr_number, project.full_name, project.html_url);
  appendSummary(summaryFile, pr.pr_url || pr.web_url, pr.pr_number);
  if (!skipMetadataCommit) {
    // #1098 §2.1-4 — the archive rides the PR (replaces the two-file metadata commit that landed
    // on local main in the linked posture and never reached origin).
    publishArchiveWithPr(root, args.project, args.branch, projectFolder, pr.pr_url || pr.web_url, options);
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
  parseArgs,
  resolveMemberSet,
  closesBody,
  appendSummary,
  ensurePullRequest,
  findPullRequestForBranch,
  maybeAutoMergeFromConfig,
  mergePullRequest,
  routePullRequestState,
  updateStateSinkBlock
};
