#!/usr/bin/env node
'use strict';

// Integration tests for the --sink transaction (kaola-workflow-sink-merge.js) — issues #694/#700/#705.
// Hand-rolled assert + counter; repo style (no framework) — mirrors test-bundle-finalize.js.
//
// Covered scenarios:
//   (a) #694 — a STALE cross-run sink-receipt.json (older claim_ts) with a FLIPPED keep-open intent
//       must NOT replay its recorded closure step: the transaction reinitializes fresh (loud stderr),
//       honors THIS run's --keep-issue-open, and never closes the kept-open issue.
//   (b) #694 — a legitimate SAME-cycle crash-resume (receipt whose claim_ts matches the current run)
//       resumes and completes without a spurious cross-run reinit (skips the done steps).
//   (c) #700 — a sole-archiver sink with a pre-existing UNSUFFIXED archive/<project>/ dir: the
//       collision-suffixed archive/<project>.archived-<ts>/ is COMMITTED (with the roadmap-source
//       removal + regenerated ROADMAP.md), the ## Closure + ## Attestation blocks are persisted, and
//       no dirty main checkout remains after status:sinked.
//   (d) #700/#694 — journal disposal covers the collision-suffixed archive path.
//   (e) #705 — a keep-open SOLE-archiver sink RETAINS the kept-open issue's roadmap source: the
//       source survives at HEAD, the regenerated ROADMAP.md still lists the (still-open) issue, the
//       issue is never closed, and the sink still reports status:sinked with a clean main checkout.
//   (f) #705 — a normal CLOSING sole-archiver sink still REMOVES the roadmap source (the keep-open
//       retention must not regress the close path).
//   (g) #705 — a MIXED bundle (one close + one keep-open) removes ONLY the closing issue's roadmap
//       source and keeps the kept-open member's — the per-member excludeIssues scoping of
//       archiveProjectDir/reconcileRoadmapForClosure.
//
// OFFLINE-safe strategy: the KAOLA_GH_MOCK_SCRIPT pattern (same as test-bundle-finalize.js). All
// fixtures live in $TMPDIR — nothing is written inside the repo tree. The --sink transaction is
// driven end-to-end against a bare remote.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const sinkMergeScript = path.join(repoRoot, 'scripts', 'kaola-workflow-sink-merge.js');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) { passed++; } else { failed++; console.error('FAIL: ' + message); }
}

// --------------------------------------------------------------------------- helpers

function makeTmpRoot() { return fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-')); }

function git(cwd, args) { return spawnSync('git', ['-C', cwd].concat(args), { encoding: 'utf8' }); }

function initGitRepoWithBareRemote(tmp) {
  spawnSync('git', ['init', '-b', 'main'], { cwd: tmp, encoding: 'utf8' });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: tmp, encoding: 'utf8' });
  spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: tmp, encoding: 'utf8' });
  fs.writeFileSync(path.join(tmp, 'README.md'), 'fixture\n');
  git(tmp, ['add', 'README.md']);
  git(tmp, ['commit', '-m', 'init']);
  const remotePath = tmp + '-remote';
  spawnSync('git', ['init', '--bare', remotePath], { encoding: 'utf8' });
  git(tmp, ['remote', 'add', 'origin', remotePath]);
  git(tmp, ['push', '-u', 'origin', 'main']);
  return remotePath;
}

// A stateful gh mock: `issue view N --jq .state` returns a bare state ('open'/'closed'), derived from
// the log — closed once `close:N` is logged, re-opened by `reopen:N`. Every mutating call is logged.
function writeGhMock(binDir, logFile) {
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, 'gh.js'), [
    "'use strict';",
    'const fs = require("fs");',
    'const path = require("path");',
    'const argv = process.argv.slice(2);',
    'const a = argv.join(" ");',
    'const logFile = ' + JSON.stringify(logFile) + ';',
    'function log(m){ try { fs.appendFileSync(logFile, m + "\\n"); } catch(_){} }',
    // cwd-honest, like real gh: without --repo, gh resolves its target repo from the invoking cwd.
    // The sink transaction chdirs to os.tmpdir(), so any call site that drops { cwd: mainRoot }
    // must FAIL here exactly as real gh does — a cwd-blind mock is how the #694 keep-open guard
    // shipped as a silent no-op.
    'let d = process.cwd(); let inRepo = false;',
    'for (;;) { if (fs.existsSync(path.join(d, ".git"))) { inRepo = true; break; } const p = path.dirname(d); if (p === d) break; d = p; }',
    'if (!inRepo) { log("REJECTED-wrong-cwd:" + process.cwd() + " args=" + a); process.stderr.write("gh: could not determine base repo, use --repo (cwd not a git repository)\\n"); process.exit(1); }',
    'function lines(){ try { return fs.readFileSync(logFile,"utf8").split("\\n"); } catch(_){ return []; } }',
    'if (a.includes("repo view")) { process.stdout.write(JSON.stringify({owner:{login:"t"},name:"r"})+"\\n"); process.exit(0); }',
    'const viewM = a.match(/issue view (\\d+)/);',
    'if (viewM) {',
    '  const n = viewM[1]; const ls = lines();',
    '  let closed = false;',
    '  for (const l of ls) { if (l === "close:"+n) closed = true; else if (l === "reopen:"+n) closed = false; }',
    '  process.stdout.write((closed ? "closed" : "open") + "\\n"); process.exit(0);',
    '}',
    'const closeM = a.match(/^issue close (\\d+)/);',
    'if (closeM) { log("close:"+closeM[1]); process.stdout.write("\\n"); process.exit(0); }',
    'const reopenM = a.match(/^issue reopen (\\d+)/);',
    'if (reopenM) { log("reopen:"+reopenM[1]); process.stdout.write("\\n"); process.exit(0); }',
    'if (a.includes("issue edit") && a.includes("--remove-label")) { const m=a.match(/issue edit (\\d+)/); log("label-removed:"+(m?m[1]:"?")); process.exit(0); }',
    'const commentM = a.match(/issue comment (\\d+)/);',
    'if (commentM) { log("comment:"+commentM[1]); process.exit(0); }',
    'process.stdout.write("\\n"); process.exit(0);',
  ].join('\n'));
}

// A live-project workflow-state.md (## Sink block with a claim_ts). Written on the feature branch —
// the sole-archiver shape the sink then archives itself.
function liveState(project, issue, claimTs, issueAction) {
  const lines = [
    '# Kaola-Workflow State', '',
    '## Project', 'name: ' + project, 'status: active', '',
    '## Current Position', 'phase: adaptive', 'runtime: claude', 'step: start', '',
    '## Last Updated', new Date().toISOString(), '',
    '## Sink',
    'branch: workflow/' + project,
    'issue_number: ' + issue,
    'sink: merge',
    'run_posture: in-place',
    'main_root: (test)',
    'session_marker: test-session',
    'claim_ts: ' + claimTs,
  ];
  if (issueAction) lines.push('issue_action: ' + issueAction);
  return lines.join('\n') + '\n';
}

function roadmapSource(issue) {
  return ['issue: #' + issue, 'title: Test issue ' + issue, 'status: active',
    'workflow_project: sink-test', 'next_step: TBD'].join('\n') + '\n';
}

function roadmapMirror(issues) {
  let c = '# Kaola-Workflow Roadmap\n\n| Issue | Title | Status | Project | Next Step |\n|---|---|---|---|---|\n';
  for (const n of issues) c += '| #' + n + ' | Test issue ' + n + ' | active | sink-test | TBD |\n';
  return c;
}

// Build a sole-archiver fixture: main carries the roadmap source + mirror + a PRE-EXISTING
// archive/<project>/ dir (forces the collision suffix); the feature branch carries the live folder
// + a deliverable. Returns { tmpRoot, remotePath, binDir, logFile, branch }.
function buildSoleArchiverFixture(project, issue, opts) {
  opts = opts || {};
  const tmpRoot = makeTmpRoot();
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-mock-'));
  const logFile = path.join(binDir, 'gh-calls.log');
  const branch = 'workflow/' + project;
  const remotePath = initGitRepoWithBareRemote(tmpRoot);
  writeGhMock(binDir, logFile);

  // main: roadmap source + mirror + a pre-existing (collision) archive dir.
  fs.mkdirSync(path.join(tmpRoot, 'kaola-workflow', '.roadmap'), { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, 'kaola-workflow', '.roadmap', 'issue-' + issue + '.md'), roadmapSource(issue));
  fs.writeFileSync(path.join(tmpRoot, 'kaola-workflow', 'ROADMAP.md'), roadmapMirror([issue]));
  fs.mkdirSync(path.join(tmpRoot, 'kaola-workflow', 'archive', project), { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, 'kaola-workflow', 'archive', project, 'placeholder.txt'), 'prior cycle residue\n');
  git(tmpRoot, ['add', 'kaola-workflow']);
  git(tmpRoot, ['commit', '-m', 'chore: roadmap + pre-existing archive']);
  git(tmpRoot, ['push', 'origin', 'main']);

  // feature branch: the live folder (sole-archiver) + a deliverable.
  git(tmpRoot, ['checkout', '-b', branch]);
  const liveDir = path.join(tmpRoot, 'kaola-workflow', project);
  fs.mkdirSync(path.join(liveDir, '.cache'), { recursive: true });
  fs.writeFileSync(path.join(liveDir, 'workflow-state.md'), liveState(project, issue, opts.claimTs || new Date().toISOString(), opts.issueAction));
  fs.writeFileSync(path.join(liveDir, 'finalization-summary.md'), '# Finalization Summary\n\nREADY FOR FINAL GIT GATE\n');
  fs.writeFileSync(path.join(tmpRoot, 'DELIVERABLE.txt'), 'deliverable\n');
  git(tmpRoot, ['add', '-A']);
  git(tmpRoot, ['commit', '-m', 'feat: deliverable + live state']);
  git(tmpRoot, ['push', '-u', 'origin', branch]);
  git(tmpRoot, ['checkout', 'main']);

  return { tmpRoot, remotePath, binDir, logFile, branch };
}

function runSink(fx, extraArgs, extraEnv) {
  const args = [sinkMergeScript, '--branch', fx.branch, '--project', fx.projectName, '--sink', '--json'].concat(extraArgs || []);
  return spawnSync(process.execPath, args, {
    cwd: fx.tmpRoot, encoding: 'utf8', timeout: 90000,
    env: Object.assign({}, process.env, {
      KAOLA_WORKFLOW_OFFLINE: '0',
      KAOLA_WORKFLOW_SKIP_TESTGATE: '1',
      KAOLA_GH_MOCK_SCRIPT: path.join(fx.binDir, 'gh.js'),
    }, extraEnv || {}),
  });
}

function lastJson(result) {
  const ls = (result.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
  if (!ls.length) return null;
  try { return JSON.parse(ls[ls.length - 1]); } catch (_) { return null; }
}
function readLog(logFile) { try { return fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean); } catch (_) { return []; } }
function catFileType(cwd, ref) {
  const r = git(cwd, ['cat-file', '-t', ref]);
  return r.status === 0 ? (r.stdout || '').trim() : null;
}
function showAtHead(cwd, relPath) {
  const r = git(cwd, ['show', 'HEAD:' + relPath]);
  return r.status === 0 ? r.stdout : null;
}
function cleanup(fx) {
  try { fs.rmSync(fx.tmpRoot, { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(fx.binDir, { recursive: true, force: true }); } catch (_) {}
  try { if (fx.remotePath) fs.rmSync(fx.remotePath, { recursive: true, force: true }); } catch (_) {}
}
function suffixedArchiveRel(tmpRoot, project) {
  const base = path.join(tmpRoot, 'kaola-workflow', 'archive');
  let found = null;
  try { for (const e of fs.readdirSync(base)) if (e.startsWith(project + '.archived-')) found = e; } catch (_) {}
  return found ? ('kaola-workflow/archive/' + found) : null;
}

// --------------------------------------------------------------------------- (c) + (d)

(function testCollisionSuffixedArchiveCommittedAndDisposed() {
  console.log('Test (#700 c/d): sole-archiver sink with a pre-existing archive dir — collision-suffixed archive is committed with closure/attestation metadata, main stays clean, journal disposed');
  const project = 'issue-70001';
  const issue = 70001;
  const fx = buildSoleArchiverFixture(project, issue, {});
  fx.projectName = project;
  try {
    const result = runSink(fx, ['--issue', String(issue)]);
    const out = lastJson(result);

    assert(result.status === 0, '#700 c: sink exits 0; got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out && out.status === 'sinked', '#700 c: status must be sinked; got ' + JSON.stringify(out && out.status));

    // The archive dest carried through the receipt must be the collision-SUFFIXED path.
    const receipt = out && out.receipt;
    assert(receipt && typeof receipt.archive_dest === 'string' && /kaola-workflow\/archive\/issue-70001\.archived-/.test(receipt.archive_dest),
      '#700 c: receipt.archive_dest must be the collision-suffixed path; got ' + JSON.stringify(receipt && receipt.archive_dest));

    const archRel = suffixedArchiveRel(fx.tmpRoot, project) || (receipt && receipt.archive_dest);
    assert(archRel != null, '#700 c: a collision-suffixed archive dir must exist');

    // The suffixed archive must be COMMITTED at HEAD (not left uncommitted).
    assert(catFileType(fx.tmpRoot, 'HEAD:' + archRel) === 'tree',
      '#700 c: the collision-suffixed archive must be committed at HEAD (a tree object)');

    // ## Closure + ## Attestation persisted (and committed).
    const stateAtHead = showAtHead(fx.tmpRoot, archRel + '/workflow-state.md');
    assert(stateAtHead && /^## Closure$/m.test(stateAtHead), '#700 c: archived workflow-state.md must carry a ## Closure block at HEAD');
    const summaryAtHead = showAtHead(fx.tmpRoot, archRel + '/finalization-summary.md');
    assert(summaryAtHead && /^## Attestation$/m.test(summaryAtHead), '#700 c: archived finalization-summary.md must carry a ## Attestation block at HEAD');

    // roadmap-source removal + regenerated mirror committed (issue no longer active).
    assert(catFileType(fx.tmpRoot, 'HEAD:kaola-workflow/.roadmap/issue-' + issue + '.md') === null,
      '#700 c: the roadmap source must be removed from HEAD');
    const mirrorAtHead = showAtHead(fx.tmpRoot, 'kaola-workflow/ROADMAP.md');
    assert(mirrorAtHead != null && !new RegExp('^\\| #' + issue + ' \\|', 'm').test(mirrorAtHead),
      '#700 c: ROADMAP.md at HEAD must no longer list the closed issue as active');

    // main checkout must be CLEAN after status:sinked (no dirty tree, journal disposed → not even untracked).
    const status = git(fx.tmpRoot, ['status', '--porcelain']).stdout.trim();
    assert(status === '', '#700 c: main checkout must be clean after status:sinked; got:\n' + status);

    // (d) journal disposal covers the suffixed path.
    assert(out && out.journal_disposed === true, '#700 d: journal_disposed must be true');
    const suffixedJournal = path.join(fx.tmpRoot, archRel, '.cache', 'sink-receipt.json');
    assert(!fs.existsSync(suffixedJournal), '#700 d: the suffixed archive .cache/sink-receipt.json must be disposed');
    assert(!fs.existsSync(path.join(fx.tmpRoot, 'kaola-workflow', 'archive', project, '.cache', 'sink-receipt.json')),
      '#700 d: no plain-archive journal residue must remain');

    // The issue was actually closed (this is a close run, not keep-open).
    const calls = readLog(fx.logFile);
    assert(calls.includes('close:' + issue), '#700 c: the issue must be closed on this (non-keep-open) run; calls=' + JSON.stringify(calls));
  } finally {
    cleanup(fx);
  }
})();

// --------------------------------------------------------------------------- (a)

(function testCrossRunStaleReceiptFlippedKeepOpenNotReplayed() {
  console.log('Test (#694 a): a stale cross-run receipt with flipped keep-open intent must NOT replay closure — reinit + honor --keep-issue-open, issue stays open');
  const project = 'issue-69401';
  const issue = 69401;
  const fx = buildSoleArchiverFixture(project, issue, { issueAction: 'comment_keep_open' });
  fx.projectName = project;
  try {
    // Plant a STALE receipt (an earlier run of the same project) at the plain-archive .cache — where
    // resolveSinkReceiptPath finds it. Older claim_ts + a CLOSE intent (keep_open_requested:false),
    // all steps done. It must NOT be replayed; the current run is --keep-issue-open.
    const staleCache = path.join(fx.tmpRoot, 'kaola-workflow', 'archive', project, '.cache');
    fs.mkdirSync(staleCache, { recursive: true });
    const doneSteps = {};
    for (const s of ['preflight', 'push_upstream', 'merge', 'finalize', 'stash_restore', 'archive_commit', 'push_main', 'closure']) doneSteps[s] = 'done';
    fs.writeFileSync(path.join(staleCache, 'sink-receipt.json'), JSON.stringify({
      project, branch: fx.branch, issue_number: issue, issue_numbers: [issue],
      resolved_default_branch: 'main', branch_head: '0'.repeat(40),
      keep_open_requested: false,
      claim_ts: '2020-01-01T00:00:00.000Z',
      started_at: '2020-01-01T00:00:00.000Z', updated_at: '2020-01-01T00:00:00.000Z',
      stash_ref: null, removed_duplicates: [], steps: doneSteps,
    }, null, 2) + '\n');

    const result = runSink(fx, ['--issue', String(issue), '--keep-issue-open']);
    const out = lastJson(result);

    assert(result.status === 0, '#694 a: sink exits 0 after cross-run reinit; got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out && out.status === 'sinked', '#694 a: status must be sinked; got ' + JSON.stringify(out && out.status));

    // Loud on stderr + recorded on the receipt.
    assert(/cross-run stale receipt/i.test(result.stderr || ''), '#694 a: must fail loud (cross-run stale receipt) on stderr; stderr:\n' + result.stderr);
    assert(out && out.receipt && out.receipt.cross_run_reinit === true, '#694 a: receipt.cross_run_reinit must be true; got ' + JSON.stringify(out && out.receipt && out.receipt.cross_run_reinit));

    // THE BUG: the stale receipt's closure step must NOT be replayed → the kept-open issue is never closed.
    const calls = readLog(fx.logFile);
    assert(!calls.includes('close:' + issue), '#694 a: keep-open issue must NEVER be closed (no replayed closure); calls=' + JSON.stringify(calls));
    assert(out && out.receipt && out.receipt.keep_open_requested === true, '#694 a: reinit receipt must record keep_open_requested:true (this run intent)');
  } finally {
    cleanup(fx);
  }
})();

// --------------------------------------------------------------------------- (b)

(function testSameCycleCrashResumeCompletes() {
  console.log('Test (#694 b): a same-cycle crash-resume (matching claim_ts) resumes and completes without a spurious cross-run reinit');
  const project = 'issue-69402';
  const issue = 69402;
  const claimTs = new Date().toISOString();
  const fx = buildSoleArchiverFixture(project, issue, { claimTs });
  fx.projectName = project;
  try {
    // First run: abort AFTER archive_commit (a mid-transaction crash) — merge/finalize/archive done,
    // push_main + closure still pending. Leaves a receipt from THIS run (matching claim_ts).
    const first = runSink(fx, ['--issue', String(issue)], { KAOLA_WORKFLOW_SINK_ABORT_AFTER: 'archive_commit' });
    assert(first.status === 99, '#694 b: first run aborts after archive_commit (exit 99); got ' + first.status + '\nstderr: ' + first.stderr);

    // Second run: resume. Must NOT emit a cross-run reinit (same-cycle claim_ts), and must complete.
    const second = runSink(fx, ['--issue', String(issue)]);
    const out = lastJson(second);
    assert(second.status === 0, '#694 b: resume exits 0; got ' + second.status + '\nstdout: ' + second.stdout + '\nstderr: ' + second.stderr);
    assert(out && out.status === 'sinked', '#694 b: resume must reach status:sinked; got ' + JSON.stringify(out && out.status));
    assert(!/cross-run stale receipt/i.test(second.stderr || ''), '#694 b: a same-cycle resume must NOT trigger a cross-run reinit; stderr:\n' + second.stderr);
    assert(!(out && out.receipt && out.receipt.cross_run_reinit === true), '#694 b: resume receipt must NOT be flagged cross_run_reinit');

    // Closure ran exactly on the resume (the aborted first run stopped before push_main/closure).
    const calls = readLog(fx.logFile);
    assert(calls.filter(c => c === 'close:' + issue).length === 1, '#694 b: the issue is closed exactly once (on resume); calls=' + JSON.stringify(calls));
  } finally {
    cleanup(fx);
  }
})();

// --------------------------------------------------------------------------- (c)

(function testKeepOpenEndStateGuardReopensWithRealCwd() {
  console.log('Test (#694 c): the terminal keep-open guard actually probes + reopens a closed issue against a cwd-honest forge (regression: bare {} gh opts made it a silent no-op)');
  const project = 'issue-69403';
  const issue = 69403;
  // Keep-open intent comes ONLY from the archived state (issue_action: comment_keep_open), so the
  // push_main #517 reopen (gated on args.keepIssueOpen) is skipped and the TERMINAL guard is the
  // sole reopen point — the exact backstop path it exists for.
  const fx = buildSoleArchiverFixture(project, issue, { issueAction: 'comment_keep_open' });
  fx.projectName = project;
  try {
    // The issue is CLOSED on the forge before the sink runs (auto-close analog).
    fs.appendFileSync(fx.logFile, 'close:' + issue + '\n');

    const result = runSink(fx, ['--issue', String(issue)]);
    const out = lastJson(result);
    const calls = readLog(fx.logFile);

    // The guard must reach the forge from a real repo cwd (the mock rejects non-repo cwds like gh).
    assert(!calls.some(c => c.startsWith('REJECTED-wrong-cwd')), '#694 c: no gh call may run outside the repo cwd; calls=' + JSON.stringify(calls));
    assert(calls.includes('reopen:' + issue), '#694 c: the terminal guard must reopen the closed kept-open issue; calls=' + JSON.stringify(calls));
    assert(result.status === 0, '#694 c: sink exits 0 after a successful backstop reopen; got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out && out.status === 'sinked', '#694 c: status must be sinked; got ' + JSON.stringify(out && out.status));
    assert(out && out.receipt && out.receipt.remote_issue_closed === 'reopened_after_autoclose',
      '#694 c: receipt must record reopened_after_autoclose; got ' + JSON.stringify(out && out.receipt && out.receipt.remote_issue_closed));
    // Ground truth from the mock state machine: last close/reopen event leaves the issue OPEN.
    let closed = false;
    for (const c of calls) { if (c === 'close:' + issue) closed = true; else if (c === 'reopen:' + issue) closed = false; }
    assert(!closed, '#694 c: the issue must actually be OPEN at end of run; calls=' + JSON.stringify(calls));
    // Post-finalize receipt writes follow the archive dest — no phantom live .cache/ resurrection.
    assert(!fs.existsSync(path.join(fx.tmpRoot, 'kaola-workflow', project)),
      '#694 c: the archived live project dir must NOT be resurrected by post-finalize receipt writes');
  } finally {
    cleanup(fx);
  }
})();

// --------------------------------------------------------------------------- (e) #705

(function testKeepOpenSoleArchiverRetainsRoadmapSource() {
  console.log('Test (#705 e): a keep-open sole-archiver sink RETAINS the kept-open issue roadmap source — source survives at HEAD, ROADMAP.md still lists it, issue never closed, status sinked, main clean');
  const project = 'issue-70501';
  const issue = 70501;
  const fx = buildSoleArchiverFixture(project, issue, { issueAction: 'comment_keep_open' });
  fx.projectName = project;
  try {
    const result = runSink(fx, ['--issue', String(issue), '--keep-issue-open']);
    const out = lastJson(result);

    assert(result.status === 0, '#705 e: sink exits 0; got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out && out.status === 'sinked', '#705 e: status must be sinked; got ' + JSON.stringify(out && out.status));

    // THE FIX: the kept-open issue's roadmap source must SURVIVE at HEAD (an open issue stays tracked).
    assert(catFileType(fx.tmpRoot, 'HEAD:kaola-workflow/.roadmap/issue-' + issue + '.md') === 'blob',
      '#705 e: the kept-open roadmap source must SURVIVE at HEAD (a blob); got ' + JSON.stringify(catFileType(fx.tmpRoot, 'HEAD:kaola-workflow/.roadmap/issue-' + issue + '.md')));
    // ... and the regenerated mirror must still list the (still-open) issue as active.
    const mirrorAtHead = showAtHead(fx.tmpRoot, 'kaola-workflow/ROADMAP.md');
    assert(mirrorAtHead != null && new RegExp('^\\| #' + issue + ' \\|', 'm').test(mirrorAtHead),
      '#705 e: ROADMAP.md at HEAD must still list the kept-open issue as active; got:\n' + mirrorAtHead);

    // The issue must NEVER be closed (keep-open).
    const calls = readLog(fx.logFile);
    assert(!calls.includes('close:' + issue), '#705 e: a kept-open issue must NEVER be closed; calls=' + JSON.stringify(calls));

    // main checkout must be CLEAN after status:sinked (the retained source is committed at HEAD, not
    // left as a staged/unstaged deletion).
    const status = git(fx.tmpRoot, ['status', '--porcelain']).stdout.trim();
    assert(status === '', '#705 e: main checkout must be clean after status:sinked; got:\n' + status);
  } finally {
    cleanup(fx);
  }
})();

// --------------------------------------------------------------------------- (f) #705

(function testClosingSoleArchiverStillRemovesRoadmapSource() {
  console.log('Test (#705 f): a normal CLOSING sole-archiver sink still REMOVES the roadmap source (keep-open retention must not regress the close path)');
  const project = 'issue-70502';
  const issue = 70502;
  const fx = buildSoleArchiverFixture(project, issue, {});
  fx.projectName = project;
  try {
    const result = runSink(fx, ['--issue', String(issue)]);
    const out = lastJson(result);

    assert(result.status === 0, '#705 f: sink exits 0; got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out && out.status === 'sinked', '#705 f: status must be sinked; got ' + JSON.stringify(out && out.status));

    // The close path is unchanged: the roadmap source is removed from HEAD and the mirror drops it.
    assert(catFileType(fx.tmpRoot, 'HEAD:kaola-workflow/.roadmap/issue-' + issue + '.md') === null,
      '#705 f: the roadmap source must be removed from HEAD on a close run');
    const mirrorAtHead = showAtHead(fx.tmpRoot, 'kaola-workflow/ROADMAP.md');
    assert(mirrorAtHead != null && !new RegExp('^\\| #' + issue + ' \\|', 'm').test(mirrorAtHead),
      '#705 f: ROADMAP.md at HEAD must no longer list the closed issue as active');

    const calls = readLog(fx.logFile);
    assert(calls.includes('close:' + issue), '#705 f: the issue must be closed on a non-keep-open run; calls=' + JSON.stringify(calls));
  } finally {
    cleanup(fx);
  }
})();

// --------------------------------------------------------------------------- (g) #705

// A mix of close + keep-open is a PER-MEMBER property, expressed at the archiveProjectDir /
// reconcileRoadmapForClosure seam via excludeIssues (the sink CLI carries a whole-run keep-open
// posture, so a genuine intra-run mix is only reachable at this mechanism level). Drive it directly:
// a bundle of two members, one excluded (kept open), one removed (closing).
(function testMixedBundleExcludeIssuesScopesRetention() {
  console.log('Test (#705 g): archiveProjectDir excludeIssues keeps ONLY the kept-open member roadmap source in a mixed bundle; the closing member is removed and the regenerated mirror reflects both');
  const claim = require(path.join(repoRoot, 'scripts', 'kaola-workflow-claim.js'));
  const project = 'issue-70503';
  const keepN = 70503; // kept-open member (excluded from removal)
  const closeN = 70504; // closing member (source removed)
  const tmpRoot = fs.realpathSync(makeTmpRoot());
  try {
    // Minimal in-place repo: .roadmap sources for both members + a mirror + a live bundle project.
    spawnSync('git', ['init', '-b', 'main'], { cwd: tmpRoot, encoding: 'utf8' });
    spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: tmpRoot, encoding: 'utf8' });
    spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: tmpRoot, encoding: 'utf8' });
    const roadmapDir = path.join(tmpRoot, 'kaola-workflow', '.roadmap');
    fs.mkdirSync(roadmapDir, { recursive: true });
    fs.writeFileSync(path.join(roadmapDir, 'issue-' + keepN + '.md'), roadmapSource(keepN));
    fs.writeFileSync(path.join(roadmapDir, 'issue-' + closeN + '.md'), roadmapSource(closeN));
    fs.writeFileSync(path.join(tmpRoot, 'kaola-workflow', 'ROADMAP.md'), roadmapMirror([keepN, closeN]));
    const liveDir = path.join(tmpRoot, 'kaola-workflow', project);
    fs.mkdirSync(path.join(liveDir, '.cache'), { recursive: true });
    // Bundle state: issue_numbers carries BOTH members so archiveProjectDir reconciles both.
    const state = [
      '# Kaola-Workflow State', '',
      '## Project', 'name: ' + project, 'status: active', '',
      '## Current Position', 'phase: adaptive', 'runtime: claude', 'step: start', '',
      '## Last Updated', new Date().toISOString(), '',
      '## Sink',
      'branch: workflow/' + project,
      'issue_number: ' + keepN,
      'issue_numbers: ' + keepN + ',' + closeN,
      'sink: merge',
      '',
    ].join('\n') + '\n';
    fs.writeFileSync(path.join(liveDir, 'workflow-state.md'), state);

    // Archive with the kept-open member excluded from roadmap-source removal.
    const res = claim.archiveProjectDir(tmpRoot, project, 'closed', undefined, { excludeIssues: [keepN] });
    assert(res && res.archived === true, '#705 g: archiveProjectDir must succeed; got ' + JSON.stringify(res));

    const keepSrc = path.join(roadmapDir, 'issue-' + keepN + '.md');
    const closeSrc = path.join(roadmapDir, 'issue-' + closeN + '.md');
    assert(fs.existsSync(keepSrc), '#705 g: the kept-open member roadmap source must SURVIVE');
    assert(!fs.existsSync(closeSrc), '#705 g: the closing member roadmap source must be REMOVED');
    assert(!res.roadmap_sources_removed.includes('issue-' + keepN + '.md'), '#705 g: kept member must NOT be in roadmap_sources_removed');
    assert(res.roadmap_sources_removed.includes('issue-' + closeN + '.md'), '#705 g: closing member MUST be in roadmap_sources_removed; got ' + JSON.stringify(res.roadmap_sources_removed));

    // The regenerated mirror lists ONLY the still-open member.
    const mirror = fs.readFileSync(path.join(tmpRoot, 'kaola-workflow', 'ROADMAP.md'), 'utf8');
    assert(new RegExp('^\\| #' + keepN + ' \\|', 'm').test(mirror), '#705 g: mirror must still list the kept-open member; got:\n' + mirror);
    assert(!new RegExp('^\\| #' + closeN + ' \\|', 'm').test(mirror), '#705 g: mirror must NOT list the closed member; got:\n' + mirror);
  } finally {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
  }
})();

// --------------------------------------------------------------------------- summary

if (failed === 0) {
  console.log('\nSink-merge (#694/#700/#705) test suite passed: ' + passed + ' assertions.');
  process.exit(0);
} else {
  console.error('\nSink-merge (#694/#700/#705) test suite FAILED: ' + failed + ' failed, ' + passed + ' passed.');
  process.exit(1);
}
