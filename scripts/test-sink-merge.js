#!/usr/bin/env node
'use strict';

// Integration tests for the --sink transaction (kaola-workflow-sink-merge.js) — issues
// #694/#700/#705/#707. Hand-rolled assert + counter; repo style (no framework) — mirrors
// test-bundle-finalize.js.
//
// Covered scenarios:
//   (a) #694 — a STALE cross-run sink-receipt.json (older claim_ts) with a FLIPPED keep-open intent
//       must NOT replay its recorded closure step: the transaction reinitializes fresh (loud stderr),
//       honors THIS run's --keep-issue-open, and never closes the kept-open issue.
//   (b) #694 — a legitimate SAME-cycle crash-resume (receipt whose claim_ts matches the current run)
//       resumes and completes without a spurious cross-run reinit (skips the done steps).
//   (c) #700 — a sole-archiver sink with a pre-existing UNSUFFIXED archive/<project>/ dir: the
//       collision-suffixed archive/<project>.archived-<ts>/ is COMMITTED (with the roadmap-source
//       removal + regenerated ROADMAP.md), the ## Closure block is persisted, and no dirty main
//       checkout remains after status:sinked.
//   (d) #700/#694 — journal disposal covers the collision-suffixed archive path.
//   (e) #705 — a keep-open SOLE-archiver sink RETAINS the kept-open issue's roadmap source: the
//       source survives at HEAD, the regenerated ROADMAP.md still lists the (still-open) issue, the
//       issue is never closed, and the sink still reports status:sinked with a clean main checkout.
//   (f) #705 — a normal CLOSING sole-archiver sink still REMOVES the roadmap source (the keep-open
//       retention must not regress the close path).
//   (g) #705 — a MIXED bundle (one close + one keep-open) removes ONLY the closing issue's roadmap
//       source and keeps the kept-open member's — the per-member excludeIssues scoping of
//       archiveProjectDir/reconcileRoadmapForClosure.
//   (h) #707 — a WORKTREE-POSTURED sink must land the worktree's untracked .cache evidence into
//       the archive: the merge step's staged worktree copy is union-landed per FILE into the live
//       folder (branch-tracked content still wins), so the finalize step's archive carries the
//       run's REAL evidence and archive_commit makes it durable at HEAD.
//   (iii — via c/d/e/f) the plan-less singleton / collision-suffixed archive paths stay green.
//   (k) #715 — a SIBLING project's interrupted-sink archive receipt
//       (kaola-workflow/archive/<sibling>/.cache/sink-receipt.json, untracked, mid-cycle steps)
//       must NOT block this sink as foreign dirt: the preflight exemption is an EXACT-path match
//       across ANY project (live or archived), classification-only — the sink completes and the
//       sibling receipt is byte-untouched afterward (never staged/touched/mutated).
//   (l) #715 — over-exemption guard: a sibling NON-receipt file and receipt look-alikes
//       (sink-receipt.json.tmp, a nested x/.cache/sink-receipt.json, a sink-receipt.json
//       DIRECTORY) stay bucket-3 foreign dirt and refuse sink_blocked with ZERO mutation.
//   (m) #715/#518 — regression lock: THIS sink's own live + archive receipts remain exempt.
//   (o) #746 — a live folder that recorded nothing (journal residue only, no workflow-state.md)
//       must not be classified as an archive refusal: the sink skips it and still reaches
//       status:sinked.
//   (p) #832 / ADR 0013 R3 — when the run archive exists ONLY inside the tree being deleted, the
//       teardown RESCUES it up into main, verifies every file landed, and only then removes the
//       tree; a rescue that cannot land fails closed under `mirror_sync_failed` with the tree left
//       standing. Two negative controls: a worktree whose archive is also on main, and one that
//       never held an archive.
//   (q) #832 — receipt honesty: on a consumer whose .gitignore covers kaola-workflow/archive, git
//       REFUSES the archive pathspec, so archive_commit must record 'skipped_gitignored' — the
//       keep-worktree flow's unconditional stepDone() reports "done" for an operation git refused.
//   (r) the workflow-only branch verdict became a MEASUREMENT: assertBranchHasNonWorkflowChanges
//       returns a typed finding instead of throwing, carries a way forward, announces itself on
//       stderr, and keeps every skip arm that made it safe (no false positive on a mixed branch, no
//       fabricated finding when the base or the diff is unavailable).
//   (s)/(t) the settled conversion contract, end to end on the legacy entry point: a converted
//       verdict STOPS the sink without merging. An unfinalized run (s) and a branch carrying no
//       implementation (t) each emit their typed finding on the envelope, exit non-success, and
//       leave the default branch — local and remote — exactly where they found it.
//   (u)/(v) the post-rebase witness, in BOTH directions: a GREEN measurement is written down
//       (receipt + a durable post_rebase_tests line at HEAD) instead of scrolling past unrecorded,
//       and RED stops the sink at the publication door with a chains_red finding on the envelope,
//       the measurement on the surviving journal, and the merge step left NOT done.
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
// Git FIXTURE arrangement routes through the shared library — one process-boundary
// decision for the repo instead of one per line. See scripts/test-git-fixture.js.
const G = require('./test-git-fixture');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) { passed++; } else { failed++; console.error('FAIL: ' + message); }
}

// --------------------------------------------------------------------------- helpers

function makeTmpRoot() { return fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-')); }

function git(cwd, args) { return spawnSync('git', ['-C', cwd].concat(args), { encoding: 'utf8' }); }

function initGitRepoWithBareRemote(tmp) {
  G.git(tmp, ['init', '-b', 'main'], { encoding: 'utf8' });
  G.git(tmp, ['config', 'user.email', 'test@example.com'], { encoding: 'utf8' });
  G.git(tmp, ['config', 'user.name', 'Test User'], { encoding: 'utf8' });
  fs.writeFileSync(path.join(tmp, 'README.md'), 'fixture\n');
  git(tmp, ['add', 'README.md']);
  git(tmp, ['commit', '-m', 'init']);
  const remotePath = tmp + '-remote';
  G.raw(['init', '--bare', remotePath], { encoding: 'utf8' });
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

// The LEGACY (non---sink) entry point. It is where the two branch-shape preconditions live, so it
// is the only way to drive them end to end.
function runSinkLegacy(fx, extraArgs, extraEnv) {
  const args = [sinkMergeScript, '--branch', fx.branch, '--project', fx.projectName, '--json'].concat(extraArgs || []);
  // The measured properties are the process's OWN exit code and its emitted envelope, and the
  // preconditions under test run in main() before any exported seam — there is nothing to call
  // in-process that would carry either.
  // spawn-class: cli-contract
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
// Pull one typed finding off an emitted envelope. Returns null when the envelope has no findings at
// all, which is a DIFFERENT failure from "the wrong classification" and must read differently.
function findingOf(out, classification) {
  if (!out || !Array.isArray(out.findings)) return null;
  return out.findings.find(f => f && f.classification === classification) || null;
}
// "Nothing was merged and nothing was published" as a git fact rather than as a claim in a message.
// Every clause is checked because they fail independently: a sink can advance the local default
// branch without pushing, push without closing, or close without merging.
function assertNothingPublished(fx, label, opts) {
  const o = opts || {};
  const mainAfter = git(fx.tmpRoot, ['rev-parse', 'main']).stdout.trim();
  const remoteAfter = git(fx.tmpRoot, ['rev-parse', 'origin/main']).stdout.trim();
  assert(mainAfter === o.mainBefore, label + ': the local default branch must NOT advance; ' + o.mainBefore + ' -> ' + mainAfter);
  assert(remoteAfter === o.remoteBefore, label + ': origin/main must NOT advance; ' + o.remoteBefore + ' -> ' + remoteAfter);
  assert(git(fx.tmpRoot, ['merge-base', '--is-ancestor', fx.branch, 'main']).status !== 0,
    label + ': the feature branch must NOT be an ancestor of the default branch (nothing merged)');
  const calls = readLog(fx.logFile);
  assert(!calls.some(c => c.startsWith('close:')),
    label + ': no issue may be closed over unpublished work; calls=' + JSON.stringify(calls));
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

    // The other half of the reporting conversion, and the one that is easy to lose: a run that found
    // NOTHING must emit exactly what it emitted before findings existed. sinkEmit attaches `findings`
    // only when the array is non-empty, so the key must be ABSENT here — not present-and-empty. A
    // consumer that branches on `'findings' in out` is the reason this is a presence test rather than
    // a length test. This scenario is the flagship clean sink, so it is where the null case belongs.
    assert(out && !('findings' in out),
      '#700 c: a sink that found nothing must not carry a findings key at all; got ' + JSON.stringify(out && out.findings));
    assert(!/sink-merge: FINDING/.test(result.stderr || ''),
      '#700 c: a sink that found nothing must write no FINDING line to stderr; stderr:\n' + result.stderr);

    // The archive dest carried through the receipt must be the collision-SUFFIXED path.
    const receipt = out && out.receipt;
    assert(receipt && typeof receipt.archive_dest === 'string' && /kaola-workflow\/archive\/issue-70001\.archived-/.test(receipt.archive_dest),
      '#700 c: receipt.archive_dest must be the collision-suffixed path; got ' + JSON.stringify(receipt && receipt.archive_dest));

    const archRel = suffixedArchiveRel(fx.tmpRoot, project) || (receipt && receipt.archive_dest);
    assert(archRel != null, '#700 c: a collision-suffixed archive dir must exist');

    // The suffixed archive must be COMMITTED at HEAD (not left uncommitted).
    assert(catFileType(fx.tmpRoot, 'HEAD:' + archRel) === 'tree',
      '#700 c: the collision-suffixed archive must be committed at HEAD (a tree object)');

    // ## Closure persisted (and committed).
    //
    // DELETED alongside it: the companion `## Attestation` assertion. It pinned
    // persistSinkClosureMetadata calling claim.js's persistAttestationToSummary over a receipt
    // filled by checkDispatchAttestations, and claim.js retired BOTH exports — so the block has no
    // producer left anywhere in the tree. UNCOVERED as a result: that a sole-archiver sink records
    // whether the claim/author seam was actually dispatched (claim_planner_attested) rather than run
    // inline. That is not a gap in this suite's coverage of a live mechanism; it is a mechanism that
    // no longer exists, and re-adding the pin would only re-assert the crash the retirement fixed.
    const stateAtHead = showAtHead(fx.tmpRoot, archRel + '/workflow-state.md');
    assert(stateAtHead && /^## Closure$/m.test(stateAtHead), '#700 c: archived workflow-state.md must carry a ## Closure block at HEAD');

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
    G.git(tmpRoot, ['init', '-b', 'main'], { encoding: 'utf8' });
    G.git(tmpRoot, ['config', 'user.email', 'test@example.com'], { encoding: 'utf8' });
    G.git(tmpRoot, ['config', 'user.name', 'Test User'], { encoding: 'utf8' });
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

// --------------------------------------------------------------------------- (h) #707

// A run-plan document, present so the run folder has the shape a real run leaves behind. Its
// CONTENT is inert: the sink names `workflow-plan.md` only as one entry in its untracked
// project-state dirt bucket and never parses it. It used to carry a `## Nodes` / `## Node Ledger`
// pair because the archive evidence floor derived its required-evidence set from the ledger; that
// derivation is gone, so the tables would now be dead vocabulary pinned by a surviving suite.
function runPlanDoc(note) {
  return ['# Workflow Plan', '', note || 'fixture plan — content is not read by the sink.', ''].join('\n');
}

// Worktree-postured sole-archiver fixture: the feature branch carries the live folder (state +
// plan + summary) — the worktree-native shape — and a REAL linked worktree at the canonical
// .kw/worktrees/<project> path holds the branch with UNTRACKED .cache evidence (the shape a run
// leaves behind: evidence is never committed). opts.evidence: { 'n1.md': content } written into
// the WORKTREE's .cache only; omit to build the evidence-lost shape (no worktree at all).
function buildWorktreeEvidenceFixture(project, issue, opts) {
  opts = opts || {};
  const tmpRoot = makeTmpRoot();
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-mock-'));
  const logFile = path.join(binDir, 'gh-calls.log');
  const branch = 'workflow/' + project;
  const remotePath = initGitRepoWithBareRemote(tmpRoot);
  writeGhMock(binDir, logFile);

  // main: roadmap source + mirror.
  fs.mkdirSync(path.join(tmpRoot, 'kaola-workflow', '.roadmap'), { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, 'kaola-workflow', '.roadmap', 'issue-' + issue + '.md'), roadmapSource(issue));
  fs.writeFileSync(path.join(tmpRoot, 'kaola-workflow', 'ROADMAP.md'), roadmapMirror([issue]));
  git(tmpRoot, ['add', 'kaola-workflow']);
  git(tmpRoot, ['commit', '-m', 'chore: roadmap']);
  git(tmpRoot, ['push', 'origin', 'main']);

  // feature branch: live folder with state + plan + summary, and a deliverable.
  git(tmpRoot, ['checkout', '-b', branch]);
  const liveDir = path.join(tmpRoot, 'kaola-workflow', project);
  fs.mkdirSync(liveDir, { recursive: true });
  fs.writeFileSync(path.join(liveDir, 'workflow-state.md'), liveState(project, issue, new Date().toISOString()));
  fs.writeFileSync(path.join(liveDir, 'workflow-plan.md'), runPlanDoc('worktree-postured run'));
  fs.writeFileSync(path.join(liveDir, 'finalization-summary.md'), '# Finalization Summary\n\nREADY FOR FINAL GIT GATE\n');
  fs.writeFileSync(path.join(tmpRoot, 'DELIVERABLE.txt'), 'deliverable\n');
  git(tmpRoot, ['add', '-A']);
  git(tmpRoot, ['commit', '-m', 'feat: deliverable + live state']);
  git(tmpRoot, ['push', '-u', 'origin', branch]);
  git(tmpRoot, ['checkout', 'main']);

  // Linked worktree on the branch at the canonical path, holding UNTRACKED node evidence.
  if (opts.evidence) {
    const wtPath = path.join(tmpRoot, '.kw', 'worktrees', project);
    git(tmpRoot, ['worktree', 'add', wtPath, branch]);
    const wtCache = path.join(wtPath, 'kaola-workflow', project, '.cache');
    fs.mkdirSync(wtCache, { recursive: true });
    for (const name of Object.keys(opts.evidence)) {
      fs.writeFileSync(path.join(wtCache, name), opts.evidence[name]);
    }
  }

  return { tmpRoot, remotePath, binDir, logFile, branch };
}

(function testWorktreePosturedSinkArchivesWorktreeCacheEvidence() {
  console.log('Test (#707 h): a worktree-postured sink must archive the worktree\'s untracked .cache node evidence — landed into the live folder before archive, committed at HEAD');
  const project = 'issue-70701';
  const issue = 70701;
  const evidence = {
    'n1-impl.md': 'binding: n1-impl nonce70701\n\nimplementer evidence (worktree copy)\n',
    'n2-review.md': 'binding: n2-review nonce70701\n\nverdict: pass\n',
  };
  const fx = buildWorktreeEvidenceFixture(project, issue, { evidence });
  fx.projectName = project;
  try {
    const result = runSink(fx, ['--issue', String(issue)]);
    const out = lastJson(result);

    assert(result.status === 0, '#707 h: sink exits 0; got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out && out.status === 'sinked', '#707 h: status must be sinked; got ' + JSON.stringify(out && out.status));

    const archRel = (out && out.receipt && out.receipt.archive_dest) || suffixedArchiveRel(fx.tmpRoot, project) || ('kaola-workflow/archive/' + project);
    // The run's REAL node evidence must be IN the archive on disk...
    for (const name of Object.keys(evidence)) {
      const onDisk = path.join(fx.tmpRoot, archRel, '.cache', name);
      assert(fs.existsSync(onDisk), '#707 h: archived .cache/' + name + ' must exist on disk at ' + archRel + '; .cache holds: '
        + JSON.stringify((() => { try { return fs.readdirSync(path.join(fx.tmpRoot, archRel, '.cache')); } catch (_) { return fs.existsSync(path.join(fx.tmpRoot, archRel)) ? fs.readdirSync(path.join(fx.tmpRoot, archRel)) : '<no archive dir>'; } })()));
      if (fs.existsSync(onDisk)) {
        assert(fs.readFileSync(onDisk, 'utf8') === evidence[name], '#707 h: archived .cache/' + name + ' must carry the WORKTREE copy byte-for-byte');
      }
      // ... and durable at HEAD (archive_commit), so a later squash/cleanup cannot orphan it.
      assert(catFileType(fx.tmpRoot, 'HEAD:' + archRel + '/.cache/' + name) === 'blob',
        '#707 h: archived .cache/' + name + ' must be committed at HEAD');
    }

    // Branch-tracked live content still wins the union landing: the archived state is the
    // checkout-resolved one (it carries the ## Sink block committed on the branch).
    const archState = showAtHead(fx.tmpRoot, archRel + '/workflow-state.md');
    assert(archState && archState.includes('claim_ts:'), '#707 h: archived workflow-state.md must be the branch-tracked copy');

    const status = git(fx.tmpRoot, ['status', '--porcelain']).stdout.trim();
    assert(status === '', '#707 h: main checkout must be clean after status:sinked; got:\n' + status);
    const calls = readLog(fx.logFile);
    assert(calls.includes('close:' + issue), '#707 h: the issue must be closed; calls=' + JSON.stringify(calls));
  } finally {
    cleanup(fx);
  }
})();

// DELETED: #707 i (evidence-empty live folder refuses via the ledger-proven evidence set) and
// #707 j (verifyArchiveComplete --requireLedgerEvidence). Both pinned an archive completeness
// floor DERIVED from the `## Node Ledger`: every `complete` row implies its .cache/<id>.md.
// There is no ledger to derive it from any more. The completeness PROPERTY survives as a
// measurement — every file present under the run folder before the move must be present after
// it — and it still refuses; it is the derived required-set, and only that, which is gone.

// --------------------------------------------------------------------------- #711 branchless

// A branchless / in-place fixture: the commit is on main (no feature branch, no worktree). The
// project folder has branch: TBD + claimed_at: N/A in its workflow-state ## Sink block, mirroring a
// prior research session that pre-created the folder without a claim. The sink must complete the
// branchless path: push main, close the issue, archive the project, record branch_mode:'branchless'.
function buildBranchlessFixture(project, issue) {
  const tmpRoot = makeTmpRoot();
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-mock-'));
  const logFile = path.join(binDir, 'gh-calls.log');
  const remotePath = initGitRepoWithBareRemote(tmpRoot);
  writeGhMock(binDir, logFile);

  // main: roadmap source + mirror.
  fs.mkdirSync(path.join(tmpRoot, 'kaola-workflow', '.roadmap'), { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, 'kaola-workflow', '.roadmap', 'issue-' + issue + '.md'), roadmapSource(issue));
  fs.writeFileSync(path.join(tmpRoot, 'kaola-workflow', 'ROADMAP.md'), roadmapMirror([issue]));
  git(tmpRoot, ['add', 'kaola-workflow']);
  git(tmpRoot, ['commit', '-m', 'chore: roadmap']);
  git(tmpRoot, ['push', 'origin', 'main']);

  // in-place run: project folder + deliverable committed STRAIGHT TO MAIN (no feature branch).
  const liveDir = path.join(tmpRoot, 'kaola-workflow', project);
  fs.mkdirSync(path.join(liveDir, '.cache'), { recursive: true });
  // workflow-state ## Sink carries branch: TBD + claimed_at: N/A (the branchless signature).
  const stateLines = [
    '# Kaola-Workflow State', '',
    '## Project', 'name: ' + project, 'status: active', '',
    '## Current Position', 'phase: adaptive', 'runtime: opencode', 'step: start', '',
    '## Last Updated', new Date().toISOString(), '',
    '## Sink',
    'branch: TBD',
    'issue_number: ' + issue,
    'sink: merge',
    'run_posture: in-place',
    'main_root: (test)',
    'session_marker: test-session',
    'claim_ts: ' + new Date().toISOString(),
    'claimed_at: N/A',
  ];
  fs.writeFileSync(path.join(liveDir, 'workflow-state.md'), stateLines.join('\n') + '\n');
  fs.writeFileSync(path.join(liveDir, 'finalization-summary.md'), '# Finalization Summary\n\nREADY FOR FINAL GIT GATE\n');
  // ledger with one complete node + its evidence (the #707 requireNodeEvidence gate).
  fs.writeFileSync(path.join(liveDir, 'workflow-plan.md'), runPlanDoc('branchless run'));
  fs.writeFileSync(path.join(liveDir, '.cache', 'n1.md'), '# n1 evidence\n\nverdict: pass\n');
  fs.writeFileSync(path.join(tmpRoot, 'DELIVERABLE.txt'), 'branchless deliverable\n');
  git(tmpRoot, ['add', '-A']);
  git(tmpRoot, ['commit', '-m', 'feat: in-place deliverable (branchless)']);
  // NOTE: deliberately NOT pushed yet — the sink's push_main step must publish main.
  return { tmpRoot, remotePath, binDir, logFile, branch: 'TBD', projectName: project };
}

(function testBranchlessInPlaceSink() {
  console.log('Test (#711): branchless / in-place sink — --branch TBD with --sink completes without a feature branch (push main + close + archive)');
  const project = 'issue-71101';
  const issue = 71101;
  const fx = buildBranchlessFixture(project, issue);
  try {
    // (1) --branch TBD WITHOUT --sink must refuse (branch_tbd_requires_sink).
    const noSink = spawnSync(process.execPath,
      [sinkMergeScript, '--branch', 'TBD', '--project', project, '--issue', String(issue), '--json'],
      { cwd: fx.tmpRoot, encoding: 'utf8', timeout: 90000,
        env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_WORKFLOW_SKIP_TESTGATE: '1', KAOLA_GH_MOCK_SCRIPT: path.join(fx.binDir, 'gh.js') }) });
    const noSinkOut = lastJson(noSink);
    assert(noSink.status !== 0 && noSinkOut && noSinkOut.reason === 'branch_tbd_requires_sink',
      '#711: --branch TBD without --sink must refuse branch_tbd_requires_sink; got status=' + noSink.status + ' reason=' + JSON.stringify(noSinkOut && noSinkOut.reason));

    // Capture pre-sink main HEAD (the in-place commit, not yet on remote).
    const preMainHead = git(fx.tmpRoot, ['rev-parse', 'main']).stdout.trim();
    const remoteMainBefore = git(fx.tmpRoot, ['rev-parse', 'origin/main']).stdout.trim();
    assert(preMainHead !== remoteMainBefore,
      '#711: pre-sink main must be AHEAD of origin/main (the in-place commit is local-only)');

    // (2) --branch TBD WITH --sink completes the branchless sink.
    const result = runSink(fx, ['--issue', String(issue)]);
    const out = lastJson(result);

    assert(result.status === 0, '#711: branchless sink exits 0; got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out && out.status === 'sinked', '#711: status must be sinked; got ' + JSON.stringify(out && out.status));

    // branch_mode recorded in the receipt.
    const receipt = out && out.receipt;
    assert(receipt && receipt.branch_mode === 'branchless',
      '#711: receipt.branch_mode must be "branchless"; got ' + JSON.stringify(receipt && receipt.branch_mode));

    // main was PUSHED (the in-place commit reached the remote). The archive_commit step adds a
    // further commit, so check the pre-sink commit is an ANCESTOR of origin/main (not equality).
    const remoteMainAfter = git(fx.tmpRoot, ['rev-parse', 'origin/main']).stdout.trim();
    const ancestry = git(fx.tmpRoot, ['merge-base', '--is-ancestor', preMainHead, 'origin/main']);
    assert(ancestry.status === 0 && remoteMainAfter !== remoteMainBefore,
      '#711: push_main must publish the in-place commit to origin/main (pre-sink HEAD must be an ancestor of the new origin/main)');

    // the issue was CLOSED.
    const log = readLog(fx.logFile);
    assert(log.some(l => l === 'close:' + issue),
      '#711: the issue must be closed by the branchless sink; log=' + JSON.stringify(log));

    // the project folder was archived (no longer live).
    assert(!fs.existsSync(path.join(fx.tmpRoot, 'kaola-workflow', project)),
      '#711: the live project folder must be archived (moved to archive/)');
    const archRel = (receipt && receipt.archive_dest) || ('kaola-workflow/archive/' + project);
    assert(catFileType(fx.tmpRoot, 'HEAD:' + archRel) === 'tree',
      '#711: the archive must be committed at HEAD');

    // main checkout is CLEAN post-sink (no residual untracked/staged state).
    const status = git(fx.tmpRoot, ['status', '--porcelain']).stdout.trim();
    assert(status === '',
      '#711: main checkout must be clean post-sink; got ' + JSON.stringify(status));

    // roadmap source removed + mirror regenerated (issue closed).
    assert(catFileType(fx.tmpRoot, 'HEAD:kaola-workflow/.roadmap/issue-' + issue + '.md') === null,
      '#711: the closed issue roadmap source must be removed at HEAD');
  } finally {
    cleanup(fx);
  }
})();

// --------------------------------------------------------------------------- (k)/(l)/(m) #715

(function testSiblingArchiveReceiptExemptAndUntouched() {
  console.log('Test (#715 k): a sibling project\'s interrupted-sink archive receipt must NOT block this sink (exact-path exemption) and stays byte-untouched');
  const project = 'issue-71501';
  const issue = 71501;
  const sibling = 'sibling-71591';
  const fx = buildSoleArchiverFixture(project, issue, {});
  fx.projectName = project;
  try {
    // Plant the sibling's in-progress receipt at main (untracked, mid-cycle steps) — the exact
    // residue an interrupted sibling sink leaves behind (#715 repro b).
    const receiptRel = 'kaola-workflow/archive/' + sibling + '/.cache/sink-receipt.json';
    const receiptAbs = path.join(fx.tmpRoot, receiptRel);
    fs.mkdirSync(path.dirname(receiptAbs), { recursive: true });
    const receiptBody = JSON.stringify({
      project: sibling, branch: 'workflow/' + sibling, issue_number: 71591, issue_numbers: [71591],
      resolved_default_branch: 'main', branch_head: '1'.repeat(40),
      keep_open_requested: false,
      claim_ts: new Date().toISOString(),
      started_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      stash_ref: null, removed_duplicates: [],
      steps: { preflight: 'done', push_upstream: 'done', merge: 'pending', finalize: 'pending',
        stash_restore: 'pending', archive_commit: 'pending', push_main: 'pending', closure: 'pending' },
    }, null, 2) + '\n';
    fs.writeFileSync(receiptAbs, receiptBody);

    const result = runSink(fx, ['--issue', String(issue)]);
    const out = lastJson(result);

    assert(result.status === 0, '#715 k: sink must exit 0 (the sibling receipt is exempt, not foreign dirt); got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out && out.status === 'sinked', '#715 k: status must be sinked; got ' + JSON.stringify(out && out.status));
    assert(!(out && Array.isArray(out.foreign_dirt) && out.foreign_dirt.includes(receiptRel)),
      '#715 k: the sibling receipt must NOT be listed in foreign_dirt; got ' + JSON.stringify(out && out.foreign_dirt));
    // Classification-only: the sink never stages/touches/mutates the sibling receipt.
    assert(fs.existsSync(receiptAbs) && fs.readFileSync(receiptAbs, 'utf8') === receiptBody,
      '#715 k: the sibling receipt must be byte-untouched after the sink');
  } finally {
    cleanup(fx);
  }
})();

(function testSiblingNonReceiptStaysForeignDirt() {
  console.log('Test (#715 l): over-exemption guard — sibling NON-receipt files and receipt look-alikes stay bucket-3 foreign dirt (sink_blocked, zero mutation)');
  const project = 'issue-71502';
  const issue = 71502;
  const sibling = 'sibling-71592';
  const fx = buildSoleArchiverFixture(project, issue, {});
  fx.projectName = project;
  try {
    const sibBase = path.join(fx.tmpRoot, 'kaola-workflow', 'archive', sibling);
    // (1) a genuine sibling NON-receipt file.
    fs.mkdirSync(sibBase, { recursive: true });
    fs.writeFileSync(path.join(sibBase, 'workflow-state.md'), 'status: active\n');
    // (2) look-alike: a receipt name with a suffix.
    const sibCache = path.join(sibBase, '.cache');
    fs.mkdirSync(sibCache, { recursive: true });
    fs.writeFileSync(path.join(sibCache, 'sink-receipt.json.tmp'), '{}\n');
    // (3) look-alike: a NESTED x/.cache/sink-receipt.json (not the exact one-segment shape).
    const nested = path.join(sibBase, 'x', '.cache');
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(nested, 'sink-receipt.json'), '{}\n');
    // (4) look-alike: a DIRECTORY named sink-receipt.json (the trailing-slash form).
    const dirReceipt = path.join(sibCache, 'sink-receipt.json');
    fs.mkdirSync(dirReceipt, { recursive: true });
    fs.writeFileSync(path.join(dirReceipt, 'inner.txt'), 'not a receipt\n');

    const expected = [
      'kaola-workflow/archive/' + sibling + '/workflow-state.md',
      'kaola-workflow/archive/' + sibling + '/.cache/sink-receipt.json.tmp',
      'kaola-workflow/archive/' + sibling + '/x/.cache/sink-receipt.json',
      'kaola-workflow/archive/' + sibling + '/.cache/sink-receipt.json/inner.txt',
    ];
    const statusBefore = git(fx.tmpRoot, ['status', '--porcelain', '-uall']).stdout;

    const result = runSink(fx, ['--issue', String(issue)]);
    const out = lastJson(result);

    assert(result.status !== 0, '#715 l: sink must refuse (non-zero exit) on sibling non-receipt dirt; got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out && out.reason === 'sink_blocked', '#715 l: reason must be sink_blocked; got ' + JSON.stringify(out && out.reason));
    for (const rel of expected) {
      assert(out && Array.isArray(out.foreign_dirt) && out.foreign_dirt.includes(rel),
        '#715 l: foreign_dirt must list the exact path ' + rel + '; got ' + JSON.stringify(out && out.foreign_dirt));
    }
    // ZERO MUTATION: git status must be byte-identical to before.
    const statusAfter = git(fx.tmpRoot, ['status', '--porcelain', '-uall']).stdout;
    assert(statusBefore === statusAfter, '#715 l: git status must be unchanged after sink_blocked refuse\nbefore: ' + JSON.stringify(statusBefore) + '\nafter: ' + JSON.stringify(statusAfter));
  } finally {
    cleanup(fx);
  }
})();

(function testOwnProjectReceiptsRemainExempt() {
  console.log('Test (#715 m): regression lock for #518 — THIS sink\'s own live + archive receipts remain exempt');
  const project = 'issue-71503';
  const issue = 71503;
  const fx = buildSoleArchiverFixture(project, issue, {});
  fx.projectName = project;
  try {
    const receiptBody = JSON.stringify({
      project, branch: fx.branch, issue_number: issue, issue_numbers: [issue],
      resolved_default_branch: 'main', branch_head: '2'.repeat(40),
      keep_open_requested: false,
      claim_ts: new Date().toISOString(),
      started_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      stash_ref: null, removed_duplicates: [],
      // All steps pending so the resume actually RUNS the preflight scan (a 'done' preflight
      // would be skipped and the foreign-dirt classification never exercised).
      steps: { preflight: 'pending', push_upstream: 'pending', merge: 'pending', finalize: 'pending',
        stash_restore: 'pending', archive_commit: 'pending', push_main: 'pending', closure: 'pending' },
    }, null, 2) + '\n';
    // Own LIVE receipt + own ARCHIVE receipt (both untracked at main).
    const liveRel = 'kaola-workflow/' + project + '/.cache/sink-receipt.json';
    const archRel = 'kaola-workflow/archive/' + project + '/.cache/sink-receipt.json';
    fs.mkdirSync(path.dirname(path.join(fx.tmpRoot, liveRel)), { recursive: true });
    fs.writeFileSync(path.join(fx.tmpRoot, liveRel), receiptBody);
    fs.mkdirSync(path.dirname(path.join(fx.tmpRoot, archRel)), { recursive: true });
    fs.writeFileSync(path.join(fx.tmpRoot, archRel), receiptBody);
    // A genuinely-foreign file forces the refusal so the exemption is observable on the listing.
    const foreignRel = 'kaola-workflow/foreign-71593/workflow-state.md';
    fs.mkdirSync(path.dirname(path.join(fx.tmpRoot, foreignRel)), { recursive: true });
    fs.writeFileSync(path.join(fx.tmpRoot, foreignRel), 'status: active\n');

    const result = runSink(fx, ['--issue', String(issue)]);
    const out = lastJson(result);

    assert(result.status !== 0, '#715 m: sink must refuse on the planted foreign file; got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out && out.reason === 'sink_blocked', '#715 m: reason must be sink_blocked; got ' + JSON.stringify(out && out.reason));
    assert(out && Array.isArray(out.foreign_dirt) && out.foreign_dirt.includes(foreignRel),
      '#715 m: foreign_dirt must list the planted foreign file; got ' + JSON.stringify(out && out.foreign_dirt));
    assert(out && Array.isArray(out.foreign_dirt) && !out.foreign_dirt.includes(liveRel),
      '#715 m: the own LIVE receipt must remain exempt (#518); got ' + JSON.stringify(out && out.foreign_dirt));
    assert(out && Array.isArray(out.foreign_dirt) && !out.foreign_dirt.includes(archRel),
      '#715 m: the own ARCHIVE receipt must remain exempt (#518); got ' + JSON.stringify(out && out.foreign_dirt));
  } finally {
    cleanup(fx);
  }
})();

// --------------------------------------------------------------------------- (o) #746
//
// DELETED: #746 (n) — "a swallowed epoch-authority refusal fails loud". Its fixture built a
// schema-2 epoch envelope (claim identity, claim-root base, epoch lineage, a stored plan_hash over
// a `## Nodes` / `## Node Ledger` table) purely to make verifyCurrentEpochAuthority return
// state_ledger_progress_invalid with an empty missing[]. Epochs, the re-plan CAS machinery and the
// ledger are gone, so the refusal it drove has no producer left. (o) below is what survives: the
// over-tighten guard on the ONE benign silent skip, which reads no plan at all.

// A journal-only live dir with NO workflow-state.md at all — nothing was recorded there, so there
// is nothing an archive could lose and refusing would brick benign resumes.
//
// This scenario was named for the `snapshot_error` allowlist (BENIGN_ARCHIVE_SKIP_REASONS =
// {'state_missing'}), and that is no longer what it measures: the sink's `swallowedAuthorityRefusal`
// arm reads `archiveResult.snapshot_error`, and NOTHING assigns that field any more — its producers
// were the epoch/plan-authority checks, which are gone. Every remaining mention across claim.js and
// sink-merge.js is a read. So the allowlist is currently unreachable and this passes because the
// arm cannot fire, not because the allowlist exempts the shape.
//
// What it still discriminates, and the reason it stays: the OTHER refusal arm, `evidenceLosing`
// (`missing.length > 0`). Mutation-proved — making archiveProjectDir return
// `{archive_incomplete: true, missing: ['workflow-state.md']}` when the state file is absent turns
// this green into `archive_refusal: archive_incomplete`, so the scenario does pin that a folder
// which recorded nothing is not treated as a folder that LOST something.
function buildJournalOnlyLiveDirFixture(project, issue) {
  const tmpRoot = makeTmpRoot();
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-mock-'));
  const logFile = path.join(binDir, 'gh-calls.log');
  const branch = 'workflow/' + project;
  const remotePath = initGitRepoWithBareRemote(tmpRoot);
  writeGhMock(binDir, logFile);

  fs.mkdirSync(path.join(tmpRoot, 'kaola-workflow', '.roadmap'), { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, 'kaola-workflow', '.roadmap', 'issue-' + issue + '.md'), roadmapSource(issue));
  fs.writeFileSync(path.join(tmpRoot, 'kaola-workflow', 'ROADMAP.md'), roadmapMirror([issue]));
  git(tmpRoot, ['add', 'kaola-workflow']);
  git(tmpRoot, ['commit', '-m', 'chore: roadmap']);
  git(tmpRoot, ['push', 'origin', 'main']);

  git(tmpRoot, ['checkout', '-b', branch]);
  const liveDir = path.join(tmpRoot, 'kaola-workflow', project);
  fs.mkdirSync(path.join(liveDir, '.cache'), { recursive: true });
  fs.writeFileSync(path.join(liveDir, '.cache', 'notes.md'), 'journal residue only — no workflow-state.md\n');
  fs.writeFileSync(path.join(tmpRoot, 'DELIVERABLE.txt'), 'deliverable\n');
  git(tmpRoot, ['add', '-A']);
  git(tmpRoot, ['commit', '-m', 'feat: deliverable + journal-only folder']);
  git(tmpRoot, ['push', '-u', 'origin', branch]);
  git(tmpRoot, ['checkout', 'main']);

  return { tmpRoot, remotePath, binDir, logFile, branch, projectName: project };
}


(function testJournalOnlyLiveDirKeepsHistoricalSilentSkip() {
  console.log('Test (#746 o): a journal-only live dir with no workflow-state.md recorded nothing an archive could lose — the sink must skip it and still reach status:sinked, never classify it as evidence-losing');
  const project = 'issue-74602';
  const issue = 74602;
  const fx = buildJournalOnlyLiveDirFixture(project, issue);
  try {
    const result = runSink(fx, ['--issue', String(issue)]);
    const out = lastJson(result);

    assert(result.status === 0, '#746 o: the benign journal-only shape must still exit 0; got ' + result.status
      + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out && out.status === 'sinked', '#746 o: the benign journal-only shape must still reach status:sinked; got ' + JSON.stringify(out));
  } finally {
    cleanup(fx);
  }
})();

// --------------------------------------------------------------------------- (p)/(q) #832

// (p) The archive-presence precondition on worktree teardown. `removeWorktree` is the ONE choke
// point every destructive caller funnels through — the merge step's pre-checkout removal, the
// terminal teardown, the legacy non---sink Step 3, and cmdFinalize's own removal — so the probe
// belongs here rather than replicated per call site (the exact per-call-site duplication that let
// #676/#707/#746/#497 each fix one site and leave the family alive).
(function testRemoveWorktreeRefusesWhenArchiveOnlyInWorktree832() {
  console.log('Test (#832 p / ADR 0013 R3): removeWorktree must RESCUE the run archive up into main and then tear down — the precondition is discharged, not demanded');
  const claim = require(path.join(repoRoot, 'scripts', 'kaola-workflow-claim.js'));
  const project = 'issue-83201';
  const tmpRoot = makeTmpRoot();
  const remotePath = initGitRepoWithBareRemote(tmpRoot);
  try {
    const wtPath = path.join(tmpRoot, '.kw', 'worktrees', project);
    git(tmpRoot, ['worktree', 'add', '-b', 'workflow/' + project, wtPath, 'HEAD']);
    const wtArchive = path.join(wtPath, 'kaola-workflow', 'archive', project);
    fs.mkdirSync(path.join(wtArchive, '.cache'), { recursive: true });
    fs.writeFileSync(path.join(wtArchive, 'workflow-state.md'), 'status: closed\nissue_number: 83201\n');
    fs.writeFileSync(path.join(wtArchive, '.cache', 'n1.md'), 'binding: n1 nonce83201\nverdict: pass\n');

    // MAIN carries no copy: removing the worktree blind would be unrecoverable data loss. The
    // teardown therefore RESCUES the archive first — the R2 green arc for the retired
    // `archive_only_in_worktree` refusal: the tree really does come down, and the evidence really
    // does survive, which a refusal-only pin could never show.
    const mainArchive = path.join(tmpRoot, 'kaola-workflow', 'archive', project);
    const rescued = claim.removeWorktree(tmpRoot, project, { worktree_path: wtPath });
    assert(rescued && rescued.removed === true && rescued.archive_rescued === true,
      '#832 p: removeWorktree must rescue the archive and complete the teardown; got ' + JSON.stringify(rescued));
    assert(!fs.existsSync(wtPath), '#832 p: the worktree must actually be gone after the rescue');
    assert(fs.readFileSync(path.join(mainArchive, '.cache', 'n1.md'), 'utf8').includes('nonce83201'),
      '#832 p: the run evidence must survive BYTE-FOR-BYTE in the main checkout, not merely exist');
    assert(fs.readFileSync(path.join(mainArchive, 'workflow-state.md'), 'utf8').includes('issue_number: 83201'),
      '#832 p: the whole archive tree is rescued, not just the top level');

    // …and the fail-closed half is intact: when the rescue cannot land, the tree is NOT removed and
    // the machine failure reports under the shipped `mirror_sync_failed` reason (no second code).
    // Isolated in its own root, because the block is a non-directory at `kaola-workflow/archive`
    // and would otherwise poison the negative controls below.
    {
      const blockedRoot = makeTmpRoot();
      const blockedRemote = initGitRepoWithBareRemote(blockedRoot);
      const blocked = 'issue-83201b';
      try {
        const wtPathB = path.join(blockedRoot, '.kw', 'worktrees', blocked);
        git(blockedRoot, ['worktree', 'add', '-b', 'workflow/' + blocked, wtPathB, 'HEAD']);
        fs.mkdirSync(path.join(wtPathB, 'kaola-workflow', 'archive', blocked), { recursive: true });
        fs.writeFileSync(path.join(wtPathB, 'kaola-workflow', 'archive', blocked, 'workflow-state.md'), 'status: closed\n');
        // A plain FILE where the destination's PARENT directory must be created: mkdirSync throws
        // ENOTDIR, so the rescue cannot land and `archive/<project>` still does not exist.
        fs.mkdirSync(path.join(blockedRoot, 'kaola-workflow'), { recursive: true });
        fs.writeFileSync(path.join(blockedRoot, 'kaola-workflow', 'archive'), 'not a directory');
        const failed = claim.removeWorktree(blockedRoot, blocked, { worktree_path: wtPathB });
        assert(failed && failed.removed === false && failed.reason === 'mirror_sync_failed',
          '#832 p: an unlandable rescue must fail closed under mirror_sync_failed; got ' + JSON.stringify(failed));
        assert(fs.existsSync(wtPathB), '#832 p: a failed rescue must leave the worktree standing');
        assert(fs.existsSync(path.join(wtPathB, 'kaola-workflow', 'archive', blocked, 'workflow-state.md')),
          '#832 p: a failed rescue must leave the worktree archive byte-untouched');
      } finally {
        try { fs.rmSync(blockedRoot, { recursive: true, force: true }); } catch (_) {}
        try { fs.rmSync(blockedRemote, { recursive: true, force: true }); } catch (_) {}
      }
    }

    // Negative control 1 — MAIN carries the archive too, so teardown proceeds exactly as before.
    // Its own worktree, so the assertion stands or falls independently of the refusal above.
    const project2 = 'issue-83202';
    const wtPath2 = path.join(tmpRoot, '.kw', 'worktrees', project2);
    git(tmpRoot, ['worktree', 'add', '-b', 'workflow/' + project2, wtPath2, 'HEAD']);
    const wtArchive2 = path.join(wtPath2, 'kaola-workflow', 'archive', project2);
    fs.mkdirSync(wtArchive2, { recursive: true });
    fs.writeFileSync(path.join(wtArchive2, 'workflow-state.md'), 'status: closed\nissue_number: 83202\n');
    const mainArchive2 = path.join(tmpRoot, 'kaola-workflow', 'archive', project2);
    fs.mkdirSync(mainArchive2, { recursive: true });
    fs.writeFileSync(path.join(mainArchive2, 'workflow-state.md'), 'status: closed\nissue_number: 83202\n');
    const removed = claim.removeWorktree(tmpRoot, project2, { worktree_path: wtPath2 });
    assert(removed && removed.removed === true,
      '#832 p: with main holding the archive the worktree is removed as before; got ' + JSON.stringify(removed));
    assert(!fs.existsSync(wtPath2), '#832 p: the worktree is actually gone in the negative control');

    // Negative control 2 — a worktree that never held an archive is removed as before (the probe
    // must not become a blanket teardown block).
    const project3 = 'issue-83203p';
    const wtPath3 = path.join(tmpRoot, '.kw', 'worktrees', project3);
    git(tmpRoot, ['worktree', 'add', '-b', 'workflow/' + project3, wtPath3, 'HEAD']);
    const plain = claim.removeWorktree(tmpRoot, project3, { worktree_path: wtPath3 });
    assert(plain && plain.removed === true,
      '#832 p: an archive-free worktree is removed as before; got ' + JSON.stringify(plain));
  } finally {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(remotePath, { recursive: true, force: true }); } catch (_) {}
  }
})();

// (q) Receipt honesty on a consumer whose .gitignore covers kaola-workflow/archive. git REFUSES
// the archive pathspec ("The following paths are ignored by one of your .gitignore files"), yet the
// keep-worktree flow's archive_commit step runs stepDone() unconditionally — its honesty guard is
// scoped to receipt.archive_dest, which is unset precisely on this flow. The result is
// steps.archive_commit:"done" for an operation git refused, on every run, silently.
function buildGitignoredArchiveSinkFixture(project, issue) {
  const tmpRoot = makeTmpRoot();
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-mock-'));
  const logFile = path.join(binDir, 'gh-calls.log');
  const branch = 'workflow/' + project;
  const remotePath = initGitRepoWithBareRemote(tmpRoot);
  writeGhMock(binDir, logFile);

  // main: the consumer's .gitignore covers the archive band + roadmap source/mirror.
  fs.writeFileSync(path.join(tmpRoot, '.gitignore'), 'kaola-workflow/archive/\n');
  fs.mkdirSync(path.join(tmpRoot, 'kaola-workflow', '.roadmap'), { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, 'kaola-workflow', '.roadmap', 'issue-' + issue + '.md'), roadmapSource(issue));
  fs.writeFileSync(path.join(tmpRoot, 'kaola-workflow', 'ROADMAP.md'), roadmapMirror([issue]));
  git(tmpRoot, ['add', '-A']);
  git(tmpRoot, ['commit', '-m', 'chore: roadmap + gitignore']);
  git(tmpRoot, ['push', 'origin', 'main']);

  // feature branch: the deliverable only. The keep-worktree finalize already ran — it archived the
  // project and tried to commit the archive; git refused the ignored paths, so the branch carries
  // NO archive and no live folder.
  git(tmpRoot, ['checkout', '-b', branch]);
  fs.writeFileSync(path.join(tmpRoot, 'DELIVERABLE.txt'), 'deliverable\n');
  git(tmpRoot, ['add', '-A']);
  git(tmpRoot, ['commit', '-m', 'feat: deliverable']);
  git(tmpRoot, ['push', '-u', 'origin', branch]);
  git(tmpRoot, ['checkout', 'main']);

  // ...and the archive itself sits on MAIN's disk, untracked because it is ignored (#832 R1: the
  // destination resolves against main's project root regardless of invocation cwd).
  const archiveDir = path.join(tmpRoot, 'kaola-workflow', 'archive', project);
  fs.mkdirSync(path.join(archiveDir, '.cache'), { recursive: true });
  fs.writeFileSync(path.join(archiveDir, 'workflow-state.md'),
    liveState(project, issue, new Date().toISOString()).replace('status: active', 'status: closed'));
  fs.writeFileSync(path.join(archiveDir, 'workflow-plan.md'), runPlanDoc('archived run'));
  fs.writeFileSync(path.join(archiveDir, 'finalization-summary.md'), '# Finalization Summary\n\nARCHIVED AFTER FINAL GIT GATE\n');
  fs.writeFileSync(path.join(archiveDir, '.cache', 'n1-impl.md'), 'binding: n1-impl nonce83203\nverdict: pass\n');

  return { tmpRoot, remotePath, binDir, logFile, branch, projectName: project, archiveDir };
}

(function testArchiveCommitNeverClaimsDoneForGitignoredPaths832() {
  console.log('Test (#832 q): on a consumer whose .gitignore covers kaola-workflow/archive, the sink must record archive_commit:"skipped_gitignored" — never a silent success for an operation git refused');
  const project = 'issue-83203';
  const issue = 83203;
  const fx = buildGitignoredArchiveSinkFixture(project, issue);
  try {
    const result = runSink(fx, ['--issue', String(issue)]);
    const out = lastJson(result);

    // The consumer CHOSE to ignore the archive band, so this is not a failure — refusing here would
    // brick every run on such a repo. It must be HONEST, not silent.
    assert(result.status === 0, '#832 q: the sink must still complete; got ' + result.status
      + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out && out.status === 'sinked', '#832 q: status must be sinked; got ' + JSON.stringify(out && out.status));

    // Precondition — git genuinely refused: nothing under kaola-workflow/archive/ reached HEAD.
    const tree = git(fx.tmpRoot, ['ls-tree', '-r', '--name-only', 'HEAD']).stdout || '';
    assert(!/kaola-workflow\/archive\//.test(tree),
      '#832 q: precondition — the ignored archive genuinely never reached HEAD; got:\n' + tree);

    // ...therefore the receipt must SAY so. 'done' / any success token here is the false claim.
    const receipt = (out && out.receipt) || {};
    assert(receipt.archive_commit === 'skipped_gitignored',
      '#832 q: receipt.archive_commit must be "skipped_gitignored" (git refused the ignored paths); got '
        + JSON.stringify(receipt.archive_commit) + '\nfull receipt: ' + JSON.stringify(receipt));

    // The honest skip must not also destroy the archive it declined to commit.
    assert(fs.existsSync(path.join(fx.archiveDir, '.cache', 'n1-impl.md')),
      '#832 q: the on-disk archive must survive an honest skipped_gitignored');
  } finally {
    cleanup(fx);
  }
})();

// --------------------------------------------------------------------------- (r) the R3 conversion
//
// "This branch carries no implementation" used to be a bare `throw new Error('sink-merge refused:
// …')`. It is a judgement about the work — a docs-only or roadmap-only branch is a legitimate
// deliverable — so it converted into a MEASUREMENT that reports.
//
// The conversion is only real if the report is at least as informative as the refusal was, so the
// arms below pin all four halves of it and not merely "it stopped throwing":
//   1. the measurement still MEASURES — the same workflow-only branch is still detected;
//   2. it is TYPED — a classification a caller can branch on, plus the evidence (which files) that
//      the refusal's prose used to carry;
//   3. it carries a WAY FORWARD — an operator_hint naming a sanctioned next move, which is the one
//      thing a report owes that a refusal does not;
//   4. it ANNOUNCES itself on stderr, so a run watched live is not silently different.
// …and the skip arms are pinned in the same breath, because a measurement that fires on a branch
// carrying real implementation, or that fabricates a finding when it could not measure, is worse
// than the refusal it replaced.
//
// Driven by direct in-process calls on the exported helper (as the walkthrough's older arms do):
// the envelope/durability half needs the whole transaction, but WHAT IS MEASURED is decided here,
// and here it can be pinned without a rebase, a push or a forge.
(function testWorkflowOnlyBranchReportsInsteadOfRefusing() {
  console.log('Test (r): a workflow-only branch yields a typed no_implementation_changes FINDING with a way forward — never a throw — and the skip arms stay silent');
  const { assertBranchHasNonWorkflowChanges } = require(sinkMergeScript);

  // Call the helper with stderr captured, so the announcement half is observable and the suite's own
  // output stays clean. Returns { value, threw, err, stderr }.
  function measure(root, branch, defBranch) {
    const chunks = [];
    const realWrite = process.stderr.write;
    process.stderr.write = function (chunk) { chunks.push(String(chunk)); return true; };
    let value = null; let threw = false; let err = null;
    try { value = assertBranchHasNonWorkflowChanges(root, branch, defBranch); }
    catch (e) { threw = true; err = e; }
    finally { process.stderr.write = realWrite; }
    return { value, threw, err, stderr: chunks.join('') };
  }

  // --- arm 1: workflow-only branch → a typed finding, not a throw.
  {
    const tmp = fs.realpathSync(makeTmpRoot());
    const remotePath = initGitRepoWithBareRemote(tmp);
    try {
      git(tmp, ['checkout', '-b', 'workflow/issue-87701']);
      const arch = path.join(tmp, 'kaola-workflow', 'archive', 'issue-87701');
      fs.mkdirSync(path.join(arch, '.cache'), { recursive: true });
      fs.writeFileSync(path.join(arch, 'workflow-state.md'), 'status: closed\n');
      fs.writeFileSync(path.join(arch, '.cache', 'n1.md'), 'verdict: pass\n');
      git(tmp, ['add', '-A']);
      git(tmp, ['commit', '-m', 'chore: archive only, no implementation']);

      const m = measure(tmp, 'workflow/issue-87701', 'main');
      assert(!m.threw, '(r) 1: the workflow-only measurement must NOT throw; threw: ' + (m.err && m.err.message));
      const f = m.value;
      assert(f && f.classification === 'no_implementation_changes',
        '(r) 1: must return a no_implementation_changes finding; got ' + JSON.stringify(f));
      // Typed AND evidenced: the refusal's prose listed the offending files, so the finding must too
      // — as a machine-readable array, not only inside the sentence.
      assert(f && Array.isArray(f.workflow_only_files)
        && f.workflow_only_files.includes('kaola-workflow/archive/issue-87701/workflow-state.md')
        && f.workflow_only_files.includes('kaola-workflow/archive/issue-87701/.cache/n1.md'),
        '(r) 1: the finding must carry the measured workflow-only file list; got ' + JSON.stringify(f && f.workflow_only_files));
      assert(f && f.branch === 'workflow/issue-87701' && f.base_ref === 'origin/main',
        '(r) 1: the finding must name what it measured against; got branch=' + JSON.stringify(f && f.branch)
          + ' base_ref=' + JSON.stringify(f && f.base_ref));
      assert(f && Array.isArray(f.detail) && f.detail.length > 0 && /kaola-workflow/.test(f.detail.join(' ')),
        '(r) 1: detail must be a non-empty array naming the workflow artifacts; got ' + JSON.stringify(f && f.detail));
      // The way forward is the whole difference between a report and a refusal. A finding whose hint
      // is empty is a refusal wearing a report's shape.
      assert(f && typeof f.operator_hint === 'string' && f.operator_hint.trim().length > 0,
        '(r) 1: the finding must name a sanctioned way forward in operator_hint; got ' + JSON.stringify(f && f.operator_hint));
      assert(f && /re-run the sink/i.test(f.operator_hint),
        '(r) 1: operator_hint must tell the operator how to proceed, not merely restate the problem; got ' + JSON.stringify(f && f.operator_hint));
      // …and it says so out loud, immediately, under the classification a caller greps for.
      assert(/^sink-merge: FINDING no_implementation_changes:/m.test(m.stderr),
        '(r) 1: the finding must announce itself on stderr under its classification; got:\n' + m.stderr);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(remotePath, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // --- arm 2: a branch carrying real implementation → silent. The no-false-positive arm: a
  // measurement that fires here would report every ordinary sink.
  {
    const tmp = fs.realpathSync(makeTmpRoot());
    const remotePath = initGitRepoWithBareRemote(tmp);
    try {
      git(tmp, ['checkout', '-b', 'workflow/issue-87702']);
      fs.writeFileSync(path.join(tmp, 'impl-87702.txt'), 'implementation\n');
      fs.mkdirSync(path.join(tmp, 'kaola-workflow', 'archive', 'issue-87702'), { recursive: true });
      fs.writeFileSync(path.join(tmp, 'kaola-workflow', 'archive', 'issue-87702', 'workflow-state.md'), 'status: closed\n');
      git(tmp, ['add', '-A']);
      git(tmp, ['commit', '-m', 'feat: impl + archived workflow artifacts']);

      const m = measure(tmp, 'workflow/issue-87702', 'main');
      assert(!m.threw, '(r) 2: a branch with implementation must not throw; threw: ' + (m.err && m.err.message));
      assert(m.value === null, '(r) 2: a branch with implementation must record NO finding; got ' + JSON.stringify(m.value));
      assert(!/FINDING/.test(m.stderr), '(r) 2: nothing may be announced for a branch with implementation; got:\n' + m.stderr);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(remotePath, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // --- arm 3: no resolvable base → silent. "Cannot judge, do not report" is the posture the refusal
  // had and the conversion must keep: a repo with no origin/<defBranch> yields no diff to reason
  // over, and inventing a finding there would report every remote-less repo as empty.
  {
    const tmp = fs.realpathSync(makeTmpRoot());
    try {
      G.git(tmp, ['init', '-b', 'main'], { encoding: 'utf8' });
      G.git(tmp, ['config', 'user.email', 'test@example.com'], { encoding: 'utf8' });
      G.git(tmp, ['config', 'user.name', 'Test User'], { encoding: 'utf8' });
      fs.writeFileSync(path.join(tmp, 'README.md'), 'fixture\n');
      git(tmp, ['add', '-A']);
      git(tmp, ['commit', '-m', 'init']);
      git(tmp, ['checkout', '-b', 'workflow/issue-87703']);
      fs.mkdirSync(path.join(tmp, 'kaola-workflow', 'archive', 'issue-87703'), { recursive: true });
      fs.writeFileSync(path.join(tmp, 'kaola-workflow', 'archive', 'issue-87703', 'workflow-state.md'), 'status: closed\n');
      git(tmp, ['add', '-A']);
      git(tmp, ['commit', '-m', 'chore: archive only, no remote to diff against']);
      // Precondition: the base genuinely does not resolve, so arm 3 is measuring what it claims to.
      assert(git(tmp, ['rev-parse', '--verify', 'origin/main']).status !== 0,
        '(r) 3: precondition — origin/main must NOT resolve in this fixture');

      const m = measure(tmp, 'workflow/issue-87703', 'main');
      assert(!m.threw, '(r) 3: an unresolvable base must not throw; threw: ' + (m.err && m.err.message));
      assert(m.value === null, '(r) 3: an unresolvable base must record NO finding; got ' + JSON.stringify(m.value));
      assert(!/FINDING/.test(m.stderr), '(r) 3: nothing may be announced when the base cannot be resolved; got:\n' + m.stderr);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  // --- arm 4: a branch identical to the base → silent. An empty diff is not "workflow-only"; it is
  // the already-up-to-date / fast-forward case, which the merge logic owns.
  {
    const tmp = fs.realpathSync(makeTmpRoot());
    const remotePath = initGitRepoWithBareRemote(tmp);
    try {
      git(tmp, ['checkout', '-b', 'workflow/issue-87704']);
      const m = measure(tmp, 'workflow/issue-87704', 'main');
      assert(!m.threw, '(r) 4: an empty diff must not throw; threw: ' + (m.err && m.err.message));
      assert(m.value === null, '(r) 4: a branch with NO changes at all must record no finding (that is the FF case, not an empty deliverable); got ' + JSON.stringify(m.value));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(remotePath, { recursive: true, force: true }); } catch (_) {}
    }
  }
})();

// --------------------------------------------------------------------------- (s)/(t) stop, report
//
// THE SETTLED CONTRACT, and the reason these two exist. A converted verdict does not become
// "merge anyway and report" — it becomes "measure, report, and STOP WITHOUT MERGING". Stopping is
// not a softer refusal; it is what keeps every option open (fix and re-run, file a pull request,
// or decide to publish knowingly), where merging forecloses all of them. So CONVERT changes the
// vocabulary and adds a way forward; it never changes whether the sink stops.
//
// Four clauses, all four asserted, because three of them passing is how the regression below
// shipped:
//   1. NOTHING MERGED and nothing published — checked as git facts, not as a sentence in a message;
//   2. the typed finding is on the emitted envelope under `findings[]`;
//   3. the exit is non-success, so an output-blind caller still stops;
//   4. the finding survives the process — durably where the run's record lives, or (for a
//      precondition that stops before any checkout, where no run record exists on disk to write
//      into) on the envelope that IS the record.
//
// Both preconditions live on the LEGACY entry point, and both used to `throw`. The conversion made
// them return a finding, and at the time of writing BOTH call sites discard that return — so the
// sink measures, announces the problem, and then merges and publishes anyway. Clause 1 is what
// catches that, and clause 1 is precisely the clause a "did it report?" test would not have.

// Legacy-path fixture whose branch carries a LIVE run folder (the run was never finalized) PLUS a
// real implementation file — the impl file keeps the workflow-only measurement silent, so this
// scenario pins one finding and not two.
function buildUnfinalizedBranchFixture(project, issue) {
  const tmpRoot = makeTmpRoot();
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-mock-'));
  const logFile = path.join(binDir, 'gh-calls.log');
  const branch = 'workflow/' + project;
  const remotePath = initGitRepoWithBareRemote(tmpRoot);
  writeGhMock(binDir, logFile);

  fs.mkdirSync(path.join(tmpRoot, 'kaola-workflow', '.roadmap'), { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, 'kaola-workflow', '.roadmap', 'issue-' + issue + '.md'), roadmapSource(issue));
  fs.writeFileSync(path.join(tmpRoot, 'kaola-workflow', 'ROADMAP.md'), roadmapMirror([issue]));
  git(tmpRoot, ['add', 'kaola-workflow']);
  git(tmpRoot, ['commit', '-m', 'chore: roadmap']);
  git(tmpRoot, ['push', 'origin', 'main']);

  git(tmpRoot, ['checkout', '-b', branch]);
  const liveDir = path.join(tmpRoot, 'kaola-workflow', project);
  fs.mkdirSync(path.join(liveDir, '.cache'), { recursive: true });
  // The signature of an unfinalized run: workflow-state.md still COMMITTED on the branch tip.
  fs.writeFileSync(path.join(liveDir, 'workflow-state.md'), liveState(project, issue, new Date().toISOString()));
  fs.writeFileSync(path.join(tmpRoot, 'IMPL-' + issue + '.txt'), 'real implementation\n');
  git(tmpRoot, ['add', '-A']);
  git(tmpRoot, ['commit', '-m', 'feat: implementation, run never finalized']);
  git(tmpRoot, ['push', '-u', 'origin', branch]);
  git(tmpRoot, ['checkout', 'main']);

  return { tmpRoot, remotePath, binDir, logFile, branch, projectName: project };
}

(function testUnfinalizedRunStopsWithoutPublishing() {
  console.log('Test (s): a branch whose run was never finalized must STOP the sink — a run_not_finalized finding on the envelope, non-success exit, and the default branch untouched');
  const project = 'issue-87705';
  const issue = 87705;
  const fx = buildUnfinalizedBranchFixture(project, issue);
  try {
    const mainBefore = git(fx.tmpRoot, ['rev-parse', 'main']).stdout.trim();
    const remoteBefore = git(fx.tmpRoot, ['rev-parse', 'origin/main']).stdout.trim();
    // Precondition — the live run state really is on the branch tip, so the measurement has
    // something to find and a green here cannot be vacuous.
    assert(catFileType(fx.tmpRoot, fx.branch + ':kaola-workflow/' + project + '/workflow-state.md') === 'blob',
      '(s): precondition — the branch tip must carry a live workflow-state.md');

    const result = runSinkLegacy(fx, ['--issue', String(issue)]);
    const out = lastJson(result);

    // Clause 1 — the one that matters, and the one a report-shaped test would miss. Publishing a
    // branch whose run never finalized commits live run state onto the mainline; that is the harm
    // the original throw prevented, and conversion must not have cost it.
    assertNothingPublished(fx, '(s)', { mainBefore, remoteBefore });
    assert(catFileType(fx.tmpRoot, 'main:IMPL-' + issue + '.txt') === null,
      '(s): the branch content must NOT be on the default branch');
    assert(catFileType(fx.tmpRoot, 'main:kaola-workflow/' + project + '/workflow-state.md') === null,
      '(s): live run state must NEVER reach the default branch');

    // Clause 2 — typed, on the envelope, greppable by classification.
    const f = findingOf(out, 'run_not_finalized');
    assert(out && Array.isArray(out.findings),
      '(s): the envelope must carry findings[]; got ' + JSON.stringify(out));
    assert(f, '(s): findings[] must carry a run_not_finalized finding; got '
      + JSON.stringify(out && out.findings));
    assert(f && typeof f.operator_hint === 'string' && f.operator_hint.trim().length > 0,
      '(s): the finding must name a way forward; got ' + JSON.stringify(f && f.operator_hint));

    // Clause 3 — an output-blind caller (a shell `if`, a CI step, a wrapper that reads only the
    // exit code) must still stop. This is transport, not a verdict.
    assert(result.status !== 0, '(s): a stop must exit non-success; got ' + result.status
      + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);

    // Clause 4 — the finding outlives the process. This precondition stops before any checkout, so
    // there is no run record on disk to write into (the live folder is on the branch, the archive
    // does not exist) and the emitted envelope IS the durable record. Asserted as "recoverable",
    // not as "some particular file exists", so a later change that gives it a file is not a
    // failure — but a stop that leaves the finding NOWHERE is.
    assert(/^sink-merge: FINDING run_not_finalized:/m.test(result.stderr || '') && f,
      '(s): the finding must survive the process — announced on stderr and carried on the envelope; stderr:\n' + result.stderr);
  } finally {
    cleanup(fx);
  }
})();

// Legacy-path fixture whose branch carries ONLY kaola-workflow/** — an archived run folder and
// nothing else. The folder is ARCHIVED (not live) so the unfinalized-run measurement stays silent
// and this scenario pins one finding and not two.
function buildWorkflowOnlyBranchFixture(project, issue) {
  const tmpRoot = makeTmpRoot();
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-mock-'));
  const logFile = path.join(binDir, 'gh-calls.log');
  const branch = 'workflow/' + project;
  const remotePath = initGitRepoWithBareRemote(tmpRoot);
  writeGhMock(binDir, logFile);

  fs.mkdirSync(path.join(tmpRoot, 'kaola-workflow', '.roadmap'), { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, 'kaola-workflow', '.roadmap', 'issue-' + issue + '.md'), roadmapSource(issue));
  fs.writeFileSync(path.join(tmpRoot, 'kaola-workflow', 'ROADMAP.md'), roadmapMirror([issue]));
  git(tmpRoot, ['add', 'kaola-workflow']);
  git(tmpRoot, ['commit', '-m', 'chore: roadmap']);
  git(tmpRoot, ['push', 'origin', 'main']);

  git(tmpRoot, ['checkout', '-b', branch]);
  const archDir = path.join(tmpRoot, 'kaola-workflow', 'archive', project);
  fs.mkdirSync(path.join(archDir, '.cache'), { recursive: true });
  fs.writeFileSync(path.join(archDir, 'workflow-state.md'), 'status: closed\nissue_number: ' + issue + '\n');
  fs.writeFileSync(path.join(archDir, 'finalization-summary.md'), '# Finalization Summary\n\nARCHIVED\n');
  fs.writeFileSync(path.join(archDir, '.cache', 'n1.md'), 'verdict: pass\n');
  git(tmpRoot, ['add', '-A']);
  git(tmpRoot, ['commit', '-m', 'chore: archive only, no implementation']);
  git(tmpRoot, ['push', '-u', 'origin', branch]);
  git(tmpRoot, ['checkout', 'main']);

  return { tmpRoot, remotePath, binDir, logFile, branch, projectName: project };
}

(function testWorkflowOnlyBranchStopsWithoutPublishing() {
  console.log('Test (t): a branch carrying no implementation must STOP the sink — a no_implementation_changes finding on the envelope, non-success exit, and the default branch untouched');
  const project = 'issue-87706';
  const issue = 87706;
  const fx = buildWorkflowOnlyBranchFixture(project, issue);
  try {
    const mainBefore = git(fx.tmpRoot, ['rev-parse', 'main']).stdout.trim();
    const remoteBefore = git(fx.tmpRoot, ['rev-parse', 'origin/main']).stdout.trim();

    const result = runSinkLegacy(fx, ['--issue', String(issue)]);
    const out = lastJson(result);

    // Clause 1 — an empty branch is very often a run that lost its implementation commit. Publishing
    // it forecloses ever noticing; stopping costs one re-run.
    assertNothingPublished(fx, '(t)', { mainBefore, remoteBefore });
    assert(catFileType(fx.tmpRoot, 'main:kaola-workflow/archive/' + project + '/workflow-state.md') === null,
      '(t): the branch content must NOT be on the default branch');

    // Clause 2 — typed, on the envelope, with the evidence the old refusal prose carried.
    const f = findingOf(out, 'no_implementation_changes');
    assert(out && Array.isArray(out.findings),
      '(t): the envelope must carry findings[]; got ' + JSON.stringify(out));
    assert(f, '(t): findings[] must carry a no_implementation_changes finding; got '
      + JSON.stringify(out && out.findings));
    assert(f && Array.isArray(f.workflow_only_files) && f.workflow_only_files.length === 3,
      '(t): the finding must carry the measured file list; got ' + JSON.stringify(f && f.workflow_only_files));

    // Clause 3.
    assert(result.status !== 0, '(t): a stop must exit non-success; got ' + result.status
      + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);

    // Clause 4 — same reasoning as (s): the stop happens before any checkout, so the envelope plus
    // the stderr announcement are the record that outlives the process.
    assert(/^sink-merge: FINDING no_implementation_changes:/m.test(result.stderr || '') && f,
      '(t): the finding must survive the process — announced on stderr and carried on the envelope; stderr:\n' + result.stderr);
  } finally {
    cleanup(fx);
  }
})();

// --------------------------------------------------------------------------- (u)/(v) the witness
//
// The post-rebase validation gate is the third converted verdict and the only one that runs a
// suite. It used to `execFileSync('npm', ['test'])` and let the throw kill the sink, so on RED the
// one measurement bound to the exact bytes about to be published died as an untyped stack trace,
// and on GREEN — under `stdio: 'inherit'` — it scrolled past and left no trace at all. "The chains
// were green over the merged content" was not a fact anyone could recover afterwards.
//
// Both directions are pinned, because a witness that only leaves a mark when it fails is not a
// witness. (u) is the green record; (v) is the red stop.
//
// Making the gate actually RUN takes two things the other fixtures deliberately avoid: the test-gate
// skip hook OFF, and a base that has MOVED (the gate only ever ran after a rebase, which is why "a
// red suite blocks the sink" was never true of a branch already on top of the default branch). So
// the fixture advances origin/<default> under the branch, and carries a package.json whose
// `test:kaola-workflow:*` script makes resolveChains classify it as a self-host repo.
function buildPostRebaseGateFixture(project, issue, opts) {
  opts = opts || {};
  const tmpRoot = makeTmpRoot();
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-mock-'));
  const logFile = path.join(binDir, 'gh-calls.log');
  const branch = 'workflow/' + project;
  const remotePath = initGitRepoWithBareRemote(tmpRoot);
  writeGhMock(binDir, logFile);

  // main: roadmap + the package.json that makes this a self-host (npm-edition) repo. `test` is what
  // the gate shells; the `test:kaola-workflow:claude` key is only there so resolveChains does not
  // classify the fixture as a consumer repo and skip the measurement entirely.
  fs.mkdirSync(path.join(tmpRoot, 'kaola-workflow', '.roadmap'), { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, 'kaola-workflow', '.roadmap', 'issue-' + issue + '.md'), roadmapSource(issue));
  fs.writeFileSync(path.join(tmpRoot, 'kaola-workflow', 'ROADMAP.md'), roadmapMirror([issue]));
  fs.writeFileSync(path.join(tmpRoot, 'package.json'), JSON.stringify({
    name: 'sink-gate-fixture', version: '1.0.0', private: true,
    scripts: { test: 'exit ' + (opts.testExit != null ? opts.testExit : 0), 'test:kaola-workflow:claude': 'exit 0' },
  }, null, 2) + '\n');
  git(tmpRoot, ['add', '-A']);
  git(tmpRoot, ['commit', '-m', 'chore: roadmap + npm-edition package.json']);
  git(tmpRoot, ['push', 'origin', 'main']);

  // feature branch: the live folder (sole-archiver) + a deliverable.
  git(tmpRoot, ['checkout', '-b', branch]);
  const liveDir = path.join(tmpRoot, 'kaola-workflow', project);
  fs.mkdirSync(path.join(liveDir, '.cache'), { recursive: true });
  fs.writeFileSync(path.join(liveDir, 'workflow-state.md'), liveState(project, issue, new Date().toISOString()));
  fs.writeFileSync(path.join(liveDir, 'finalization-summary.md'), '# Finalization Summary\n\nREADY FOR FINAL GIT GATE\n');
  fs.writeFileSync(path.join(tmpRoot, 'DELIVERABLE.txt'), 'deliverable\n');
  git(tmpRoot, ['add', '-A']);
  git(tmpRoot, ['commit', '-m', 'feat: deliverable + live state']);
  git(tmpRoot, ['push', '-u', 'origin', branch]);
  git(tmpRoot, ['checkout', 'main']);

  // ADVANCE origin/<default> under the branch, from a separate clone, so the sink's up-to-date check
  // resolves false and the rebase — and therefore the gate — actually happens. Without this the gate
  // is skipped and both scenarios below would pass vacuously.
  const advanceDir = tmpRoot + '-advance';
  G.raw(['clone', remotePath, advanceDir], { encoding: 'utf8' });
  git(advanceDir, ['config', 'user.email', 'test@example.com']);
  git(advanceDir, ['config', 'user.name', 'Test User']);
  fs.writeFileSync(path.join(advanceDir, 'OTHER-LANE.txt'), 'another lane landed first\n');
  git(advanceDir, ['add', '-A']);
  git(advanceDir, ['commit', '-m', 'feat: another lane']);
  git(advanceDir, ['push', 'origin', 'main']);
  git(tmpRoot, ['fetch', 'origin']);

  return { tmpRoot, remotePath, binDir, logFile, branch, projectName: project, advanceDir };
}

function cleanupGateFixture(fx) {
  cleanup(fx);
  try { fs.rmSync(fx.advanceDir, { recursive: true, force: true }); } catch (_) {}
}

// The gate must RUN, so the skip hook is off. Everything else matches runSink.
function runSinkWithGate(fx, extraArgs) {
  return runSink(fx, extraArgs, { KAOLA_WORKFLOW_SKIP_TESTGATE: '0' });
}

(function testGreenPostRebaseWitnessIsRecorded() {
  console.log('Test (u): a GREEN post-rebase measurement must be written down — receipt.post_rebase_tests and a durable post_rebase_tests line, not merely a suite that scrolled past');
  const project = 'issue-87707';
  const issue = 87707;
  const fx = buildPostRebaseGateFixture(project, issue, { testExit: 0 });
  try {
    // Precondition — the base really did move, so the gate really does run. A green here with an
    // up-to-date base would prove nothing at all.
    assert(git(fx.tmpRoot, ['rev-parse', 'main']).stdout.trim() !== git(fx.tmpRoot, ['rev-parse', 'origin/main']).stdout.trim(),
      '(u): precondition — origin/main must be AHEAD of local main so the rebase (and the gate) happens');

    const result = runSinkWithGate(fx, ['--issue', String(issue)]);
    const out = lastJson(result);

    assert(result.status === 0, '(u): a green gate must not stop the sink; got ' + result.status
      + '\nstdout: ' + result.stdout + '\nstderr: ' + (result.stderr || '').slice(-2000));
    assert(out && out.status === 'sinked', '(u): status must be sinked; got ' + JSON.stringify(out && out.status));

    // The measurement was TAKEN and says so — 'green', never 'skipped'. `skipped` here would mean
    // the fixture failed to make the gate run, which is the one way this scenario could lie.
    const receipt = (out && out.receipt) || {};
    assert(receipt.post_rebase_tests === 'green',
      '(u): the receipt must record the green measurement; got ' + JSON.stringify(receipt.post_rebase_tests)
        + '\nfull receipt: ' + JSON.stringify(receipt));

    // …and it OUTLIVES the run. The journal is disposed on a successful sink, so the archived
    // summary is the only thing left that can answer "were the chains green over what was
    // published?". Asserted at HEAD, not just on disk: an uncommitted answer does not survive a
    // fresh clone.
    const archRel = receipt.archive_dest || suffixedArchiveRel(fx.tmpRoot, project) || ('kaola-workflow/archive/' + project);
    const summaryAtHead = showAtHead(fx.tmpRoot, archRel + '/finalization-summary.md');
    assert(summaryAtHead && /^## Sink Findings$/m.test(summaryAtHead),
      '(u): the archived finalization-summary.md must carry a ## Sink Findings section at HEAD; got:\n' + summaryAtHead);
    assert(summaryAtHead && /^post_rebase_tests: green$/m.test(summaryAtHead),
      '(u): the GREEN measurement must be durably recorded, not only the red one; got:\n' + summaryAtHead);
  } finally {
    cleanupGateFixture(fx);
  }
})();

(function testRedPostRebaseChainsStopTheSink() {
  console.log('Test (v): RED post-rebase chains must STOP the sink — a chains_red finding on the envelope, nothing merged or published, and the measurement durable on the surviving journal');
  const project = 'issue-87708';
  const issue = 87708;
  const fx = buildPostRebaseGateFixture(project, issue, { testExit: 7 });
  try {
    const mainBefore = git(fx.tmpRoot, ['rev-parse', 'main']).stdout.trim();
    const remoteBefore = git(fx.tmpRoot, ['rev-parse', 'origin/main']).stdout.trim();

    const result = runSinkWithGate(fx, ['--issue', String(issue)]);
    const out = lastJson(result);

    // Clause 1 — the publication door. Red chains over the content being published is exactly the
    // case where merging anyway is worst, and it is the case the old throw covered by accident.
    assertNothingPublished(fx, '(v)', { mainBefore, remoteBefore });
    assert(catFileType(fx.tmpRoot, 'main:DELIVERABLE.txt') === null,
      '(v): the branch content must NOT reach the default branch over red chains');

    // Clause 2 — typed, under its OWN name. This arm used to be laundered into "FF race: exhausted
    // retries", which told the operator the wrong thing happened.
    const f = findingOf(out, 'chains_red');
    assert(out && Array.isArray(out.findings), '(v): the envelope must carry findings[]; got ' + JSON.stringify(out));
    assert(f, '(v): findings[] must carry a chains_red finding; got ' + JSON.stringify(out && out.findings));
    assert(f && f.npm_test_exit_code === 7,
      '(v): the finding must carry the exit code it measured, not just "non-zero"; got ' + JSON.stringify(f && f.npm_test_exit_code));
    assert(f && typeof f.operator_hint === 'string' && f.operator_hint.trim().length > 0,
      '(v): the finding must name a way forward; got ' + JSON.stringify(f && f.operator_hint));
    assert(out && out.post_rebase_tests === 'red',
      '(v): the envelope must name the measurement that stopped the sink; got ' + JSON.stringify(out && out.post_rebase_tests));

    // Clause 3.
    assert(result.status !== 0, '(v): a stop must exit non-success; got ' + result.status);

    // Clause 4 — durable. This stop happens INSIDE the transaction, so unlike (s)/(t) there is a
    // journal to carry it, and a resumed successor that never saw stdout must still learn both the
    // verdict and the finding behind it. The merge step must also be left NOT done, or the re-run
    // resumes past the thing that stopped it.
    const journal = path.join(fx.tmpRoot, 'kaola-workflow', project, '.cache', 'sink-receipt.json');
    const archJournal = path.join(fx.tmpRoot, 'kaola-workflow', 'archive', project, '.cache', 'sink-receipt.json');
    const journalPath = fs.existsSync(journal) ? journal : (fs.existsSync(archJournal) ? archJournal : null);
    assert(journalPath, '(v): the sink journal must survive the stop so a resume can read it; looked at '
      + journal + ' and ' + archJournal);
    if (journalPath) {
      let saved = null;
      try { saved = JSON.parse(fs.readFileSync(journalPath, 'utf8')); } catch (e) { saved = null; }
      assert(saved && saved.post_rebase_tests === 'red',
        '(v): the journal must record the red measurement; got ' + JSON.stringify(saved && saved.post_rebase_tests));
      assert(saved && Array.isArray(saved.findings) && saved.findings.some(x => x && x.classification === 'chains_red'),
        '(v): the journal must carry the chains_red finding itself, not only the verdict; got ' + JSON.stringify(saved && saved.findings));
      assert(saved && saved.steps && saved.steps.merge !== 'done',
        '(v): the merge step must be left NOT done so a re-run resumes at the stop; got ' + JSON.stringify(saved && saved.steps));
    }
  } finally {
    cleanupGateFixture(fx);
  }
})();

// --------------------------------------------------------------------------- summary

if (failed === 0) {
  console.log('\nSink-merge (#694/#700/#705/#707/#711/#715/#746/#832) test suite passed: ' + passed + ' assertions.');
  process.exit(0);
} else {
  console.error('\nSink-merge (#694/#700/#705/#707/#711/#715/#746/#832) test suite FAILED: ' + failed + ' failed, ' + passed + ' passed.');
  process.exit(1);
}
