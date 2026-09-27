#!/usr/bin/env node
// sink-pr — the GitHub request sink. #1098 contract, in one paragraph:
//   All project-directory reads/writes target the MAIN checkout (a linked dev worktree resolving
//   its own toplevel lost the archive, re-created a live folder inside the worktree, and bypassed
//   the keep-open guard). An existing PR is looked up BEFORE any push: the durable record
//   (.cache/sink-pr-result.json, then the state's pr_url) identifies it, else `gh pr list` for
//   this head/base. An OPEN PR is reused (its base and every member's `Closes #n` verified — a
//   bundle closes all or none); a MERGED PR reports `sink_pr: already_merged` and touches nothing
//   (watch-pr reconciles it); a CLOSED-unmerged PR is refused as pr_closed_unmerged. Writes are
//   idempotent so a re-entry mints nothing new. The run's archive rides the PR itself: the
//   archive commit is built from the main checkout's working tree through the kernel's private
//   index onto the branch tip, the local branch is advanced (ff-only where checked out, CAS
//   update-ref otherwise), then pushed — never the default branch, never a force. The main
//   checkout's index and HEAD are never touched. The final stdout line is machine-readable:
//   `sink_pr: created | reused | already_merged`. Keep-open stays merge-sink-only (#336, D4=(a)).
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, spawnSync } = require('child_process');
// #354 (#353-rest): crash-safe atomic durable-state write (tmp + fsync + rename) so a sink-block
// rewrite can never leave a torn workflow-state.md (silently skipped by readActiveFolders).
const adaptiveSchema = require('./kaola-workflow-adaptive-schema');
// #394: resolve the default branch (origin/HEAD probe chain, offline-safe) so the fallback PR
// sink targets master/other-default repos correctly — the old hardcoded `--base main` broke them.
// #1055: defaultBranch moved from claim.js into adaptive-schema.js (claim.js re-exports it), so this
// module no longer needs to require claim.js at all.
const { defaultBranch } = adaptiveSchema;

const GIT_MAX_BUFFER = 64 * 1024 * 1024;

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
    // #1094: the claimed member set (finalize's `--issue-numbers`) — one `Closes #n` per member.
    if (argv[i] === '--issue-numbers' && argv[i + 1]) { args.issueNumbers = parseIssueNumbers(argv[++i]); continue; }
    if (argv[i] === '--project' && argv[i + 1]) { args.project = argv[++i]; continue; }
  }
  return args;
}

function parseIssueNumbers(raw) {
  const nums = String(raw || '').split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isInteger(n) && n > 0);
  return Array.from(new Set(nums)).sort((a, b) => a - b);
}

// #1094: the members this PR closes. The `--issue-numbers` flag wins; when it is absent, the
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

// #1098: write pr_url/pr_number into the state file's `## Sink` block — in place when the line
// already exists, appended to the block otherwise, and SKIPPED entirely when the result would be
// byte-identical. Re-entry used to re-insert the two lines because the block's extent was matched
// with a lazy regex that only ever captured the heading line.
function updateStateSinkBlock(stateFile, prUrl, prNumber) {
  if (!fs.existsSync(stateFile)) return;
  const content = fs.readFileSync(stateFile, 'utf8');
  const lines = content.split('\n');
  const start = lines.findIndex(l => /^## Sink\s*$/.test(l));
  if (start === -1) return; // no Sink block: skip silently, exactly as before
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
  upsert('pr_url', prUrl);
  upsert('pr_number', prNumber);
  const updated = lines.slice(0, start + 1).concat(block, tail, lines.slice(end)).join('\n');
  if (updated === content) return; // idempotent re-entry: no byte change, no rewrite
  adaptiveSchema.writeFileAtomicReplace(stateFile, updated);
}

function appendSummary(summaryFile, prUrl, prNumber) {
  // #394: guard — the STANDARD exit-3 lane archives the project before the fallback sink runs, so the
  // live finalization-summary.md is gone. A raw appendFileSync then crashed with ENOENT AFTER the PR
  // was created (the orphaned-open-PR bug). Skip silently when the parent dir is absent (the durable
  // pr_url record is written separately, before any throwable step).
  if (!fs.existsSync(path.dirname(summaryFile))) return;
  // #1098: re-entry must not mint duplicate lines — skip when this PR URL is already recorded.
  let existing = '';
  try { existing = fs.readFileSync(summaryFile, 'utf8'); } catch (_) {}
  if (('\n' + existing + '\n').includes('\nPR URL: ' + prUrl + '\n')) return;
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
// #1098: idempotent — when {project, branch, pr_url, pr_number} are unchanged the file is NOT
// rewritten; a fresh timestamp would mint a new archive commit on every re-entry.
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

// #1098: the durable identity of this project's PR — the .cache record first, then the state Sink
// block's pr_url. An OFFLINE placeholder is not an identity. Returns '' when there is none.
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

// #1098 §2.1-2: a PR view normalized to the fields reuse routing needs.
function normalizePrView(data) {
  if (!data || typeof data !== 'object') return null;
  const url = typeof data.url === 'string' && data.url ? data.url : '';
  const num = Number(data.number);
  if (!url || !Number.isFinite(num) || num <= 0) return null;
  return {
    url: url,
    number: parseInt(num, 10),
    state: String(data.state || '').toUpperCase(),
    head: String(data.headRefName || ''),
    base: String(data.baseRefName || ''),
    body: String(data.body || '')
  };
}

// #1098 §2.1-2: the recorded PR's CURRENT state — merged and closed are as load-bearing as open
// (a merged PR must never be re-pushed or re-created; a closed one is the orchestrator's call).
// Any probe failure returns null so the caller falls back to the head-based discovery.
function viewRecordedPr(prUrl) {
  try {
    return normalizePrView(JSON.parse(ghExec(['pr', 'view', prUrl, '--json', 'url,number,state,headRefName,baseRefName,body'])));
  } catch (_) { return null; }
}

// #1098 §2.1-2: record-less discovery — open PRs for this head/base. Empty output or [] is
// "no PR" and falls through to the create flow. The base is verified at reuse, not here, so a
// PR that exists on a different base is REFUSED with its name rather than silently missing
// (gh would then fail the later `pr create` with "already exists" — the #1098 scenario C).
function listOpenPrs(branch, baseBranch) {
  let raw = '';
  try {
    raw = ghExec(['pr', 'list', '--head', branch, '--base', baseBranch, '--state', 'open',
      '--json', 'url,number,state,headRefName,baseRefName,body']);
  } catch (_) { return []; }
  let list = null;
  try { list = JSON.parse(raw || '[]'); } catch (_) { return []; }
  if (!Array.isArray(list)) return [];
  return list.map(normalizePrView).filter(Boolean)
    .filter(p => p.state === 'OPEN' && p.head === branch);
}

// #1098 §2.1-4 helpers — the archive-commit path rules mirror sink-merge's archive_commit arm.

// The paths under `pathspec` git would REFUSE to stage — untracked AND covered by an ignore rule
// (#901 granularity; mirrors sink-merge's copy, NUL-split and nothing else).
function ignoredUntrackedUnder(mainRoot, pathspec) {
  try {
    const out = execFileSync('git', ['-C', mainRoot, 'ls-files', '-o', '-i', '--exclude-standard', '-z', '--', pathspec],
      { encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER, stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\0').filter(Boolean);
  } catch (_) { return []; }
}

// The members of `rels` ignored BY NAME ALONE — a rule about what a file is called is never
// overridden by this sink (mirrors sink-merge's copy). Location rules (#901's authorization)
// are; name rules (.DS_Store, *.log) are not ours to force.
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

// The worktree that has `branch` checked out, or null (mirrors the kernel's default-branch scan,
// parameterized for the run branch).
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
// forced. A refusal is reported and thrown — never retried, never forced — and the durable PR
// record makes re-entry resume exactly here.
function publishArchiveWithPr(root, project, branch, projectFolder, prUrl) {
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
      const pushResult = spawnSync('git', ['-C', root, 'push', 'origin', branch], { stdio: 'pipe' });
      if (pushResult.status !== 0) {
        throw new Error(
          'PR at ' + prUrl + ' but metadata push failed.\n' +
          'Manual recovery: git push origin ' + branch
        );
      }
    }
    return;
  }
  const archiveRel = 'kaola-workflow/archive/' + project + '/';
  // A live (not yet archived) project has no archive band to publish; its records stay with the
  // finalize transaction, and a re-entry after archive publishes them.
  if (!fs.existsSync(path.join(root, archiveRel))) return;
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
  // Path rules mirror sink-merge's archive_commit arm: the project's own archive band, journals
  // excluded, ignored-untracked files force-added unless the rule is about the file's NAME.
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
  // Tree identical to the tip — a re-entry is a no-op.
  if (!commitRes.committed) return;
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

  // #1098 §2.1-1: every project-directory read/write targets the MAIN checkout — a linked dev
  // worktree resolving its own toplevel found no archive, re-created a live folder inside the
  // worktree, and bypassed the keep-open guard. In a non-linked checkout resolveMainRoot is the
  // toplevel itself, so existing behavior is unchanged.
  const root = adaptiveSchema.resolveMainRoot(getRoot());
  const config = readConfig();
  // #394: resolve the project dir — LIVE first, then ARCHIVE (the standard exit-3 fallback lane
  // archives before this sink runs). All durable writes target the resolved dir; appendSummary +
  // updateStateSinkBlock presence-guard, and recordPrResult writes the pr_url there before any
  // throwable step.
  const projectFolder = resolveProjectDir(root, args.project);
  // #1098 §2.1-1: recordPrResult no longer mkdirs a project folder back into existence — a folder
  // that is neither live nor archived is a caller error, refused BEFORE any PR is created.
  assert(fs.existsSync(projectFolder),
    'sink-pr: project folder not found (neither kaola-workflow/' + args.project +
    '/ nor kaola-workflow/archive/' + args.project + ') — refusing before creating a PR');
  const stateFile = path.join(projectFolder, 'workflow-state.md');
  const summaryFile = path.join(projectFolder, 'finalization-summary.md');
  const members = resolveMemberSet(args, stateFile);

  // #336: keep-open is merge-sink-only — the PR body 'Closes #N' would auto-close the
  // kept-open issue, and watch-pr's archive-on-merge would delete the preserved roadmap source.
  // The ARCHIVED path is the one that fires in the real exit-3 fallback flow (the finalize
  // transaction archives the project BEFORE the sink runs, so the live state file is already gone);
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

  // #394: resolve the PR base from the default branch (origin/HEAD probe chain) — the prior
  // hardcoded `--base main` made the fallback PR sink fail on a master-default repo (the #350
  // resolution never reached this sink). A sink-fallback.json receipt (written by sink-merge) may
  // carry the already-resolved branch; prefer it, else probe. #1098: moved BEFORE the existing-PR
  // lookup and the push so reuse validation compares against the resolved default branch.
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

  // #1098 §2.1-2: find the existing PR BEFORE any push. Identity comes from the durable record
  // first; record-less discovery queries open PRs for this head/base.
  const recordedUrl = readRecordedPrUrl(projectFolder, stateFile);
  let existing = null;
  if (recordedUrl) {
    existing = viewRecordedPr(recordedUrl);
  }
  if (!existing) {
    const open = listOpenPrs(args.branch, baseBranch);
    if (open.length > 0) existing = open[0];
  }

  if (existing) {
    if (existing.state === 'MERGED') {
      // Merged: no push, no create, no merge — the remote branch (even deleted) stays exactly as
      // the forge left it, and §2.2's reconciliation owns the disposition.
      process.stdout.write('sink_pr: already_merged\n');
      return;
    }
    if (existing.state !== 'OPEN') {
      // CLOSED without merging: the archive is the only run record, and reopening is the
      // orchestrator's decision — refuse, modify nothing.
      assert(false,
        'sink-pr: refusing: PR ' + existing.url + ' is closed without merging (pr_closed_unmerged). ' +
        'The orchestrator decides whether to reopen; nothing was pushed or created.');
    }
    // OPEN → reuse. Candidate identity: head==branch, base==resolved default branch.
    assert(existing.head === args.branch,
      'sink-pr: refusing to reuse PR ' + existing.url + ': head is ' +
      (existing.head || '(empty)') + ', expected ' + args.branch);
    assert(existing.base === baseBranch,
      'sink-pr: refusing to reuse PR ' + existing.url + ': base is ' +
      (existing.base || '(empty)') + ', expected ' + baseBranch);
    const missingCloses = members.filter(n =>
      !new RegExp('^Closes\\s+#' + n + '\\s*$', 'm').test(existing.body));
    assert(missingCloses.length === 0,
      'sink-pr: refusing to reuse PR ' + existing.url + ': body is missing "Closes #' +
      missingCloses[0] + '" for issue(s): ' + missingCloses.join(', ') +
      '. A bundle closes every member or none (#592/#1094); the PR was not modified.');
  }

  const reused = !!existing;
  let prUrl;
  let prNumber;
  if (!reused) {
    // Step 3 — push branch (the lookup above already ruled out an existing PR on this head)
    execFileSync('git', ['push', 'origin', args.branch], { encoding: 'utf8' });

    // Step 4 — create PR
    const prCreateArgs = [
      'pr', 'create',
      '--head', args.branch,
      '--base', baseBranch,
      '--fill',
    ];
    if (members.length > 0) {
      prCreateArgs.push('--body', closesBody(members));
    }

    const raw = ghExec(prCreateArgs);

    // Step 5 — assert URL
    assert(raw.startsWith('https://'), 'gh pr create did not return a valid URL: ' + raw);

    // Step 6 — parse PR number
    const prNumMatch = raw.match(/\/pull\/(\d+)/);
    prUrl = raw;
    prNumber = prNumMatch ? parseInt(prNumMatch[1], 10) : 0;
  } else {
    prUrl = existing.url;
    prNumber = existing.number;
  }

  // #394 RECORD-BEFORE-THROW: persist pr_url to a durable location IMMEDIATELY after the PR is
  // identified, BEFORE updateStateSinkBlock / appendSummary / the archive publish (any of which
  // can throw). Without this, a crash after PR creation left an orphaned open PR with no durable
  // pr_url — watch-pr never saw it. The record lives in the resolved project's .cache.
  recordPrResult(projectFolder, args.project, prUrl, prNumber, args.branch);

  // Step 7 — update workflow-state.md Sink block
  updateStateSinkBlock(stateFile, prUrl, prNumber);

  // Step 8 — append to finalization-summary.md
  appendSummary(summaryFile, prUrl, prNumber);

  // #1098 §2.1-4 — the archive rides the PR (replaces the metadata commit that landed on local
  // main in the linked posture, publishing only two files and never reaching origin).
  publishArchiveWithPr(root, args.project, args.branch, projectFolder, prUrl);

  // Step 9 — optional auto-merge. Only an OPEN PR ever reaches here: a merged or closed PR was
  // routed above (#1098 §2.1-5).
  if (config.pr_auto_merge === true) {
    try {
      ghExec(['pr', 'merge', prUrl, '--auto', '--squash', '--delete-branch']);
    } catch (mergeErr) {
      process.stderr.write('Warning: pr auto-merge failed: ' + mergeErr.message + '\n');
    }
  }

  // #1098 §2.1-6: the machine-readable result line — additive; this sink had no stdout contract.
  process.stdout.write('sink_pr: ' + (reused ? 'reused' : 'created') + '\n');
}

if (require.main === module) {
  try { main(); } catch (err) { process.stderr.write(err.message + '\n'); process.exitCode = 1; }
}

module.exports = { parseArgs, resolveMemberSet, closesBody };
