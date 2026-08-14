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
//   (w1)–(w10) #893 — the archive mirror `cmdFinalize --project P --keep-worktree` leaves UNTRACKED
//       in the MAIN checkout is this sink's own artifact, awaiting its own archive_commit step. It
//       must not be classified as bucket-3 foreign dirt (the documented worktree finishing sequence
//       blocked itself), it must not be silently removed (main holds the run's ONLY copy of the
//       finalization summary + mission list), and the widening must stay bounded: a SIBLING
//       project's archive tree, a project-name PREFIX look-alike, and a copy the branch carries at
//       CONFLICTING bytes all stay bucket-3. (w5)–(w7) hold the bound when the branch copy cannot be
//       READ — unreadable (w5) and larger than the read buffer (w6) are both "we could not verify",
//       which is NOT "the branch does not carry it", and (w7) pins that such a run still ends in a
//       typed envelope rather than crashing past preflight into an unhandled git error.
//       (w8)–(w10) close the other half: the exemption covers a DIRECTORY and archive_commit stages
//       that whole pathspec, so a file no finalize ever wrote is committed and pushed with the rest.
//       The sink does not refuse it and cannot tell it apart (the archive is untracked in main, so
//       git holds no record of what finalize produced, and no name list could stand in for one) —
//       so it REPORTS instead: every own-archive path it commits is named on receipt.archived_paths
//       and in the durable archived ## Sink Findings, scoped to this project, present-and-empty when
//       it commits nothing.
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
//   (y1)–(y6) #901 — the same consumer rule at a NARROWER granularity than (q)'s: a basename
//       `.cache/` leaves the archive DIRECTORY un-ignored, so the dir probe answered "not ignored",
//       the honest-skip arm never fired, and `git add <archive>/` exited 1 with git's ignore report
//       while still staging the non-ignored siblings — inside `catch (_) {}`. archive_commit read
//       "done" at exit 0 over a commit carrying 3 of 8 files. (y1) pins that the evidence lands as
//       BLOBS at HEAD and in a FRESH CLONE (every archived-evidence assertion in this corpus reads
//       the disk, and the lost files were on disk the whole time — a disk pin passes against the
//       bug), with (y2) the single-axis irrelevant-rule control. (y3) holds #832's decision and
//       sharpens it: force-add and honest-skip are mutually exclusive, and the skip now itemizes
//       what it leaves behind. (y4) is the armed-gate pin — one required file unreadable, so the
//       force-add cannot take: refuse sink_incomplete, name every missing path, surface the git add
//       failure, keep the step NOT done, and retain the branch and the archive. (y5)/(y6) repeat the
//       axis in the OTHER posture, where archive_dest is set and the #700 guard is live but reads a
//       tree that a partial commit also satisfies.
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
//   (x1)/(x4) the archive that did not happen, through BOTH its doors: a throw the finalize step
//       swallows (x1), and a return that reports it archived nothing (x4). Either one left the run
//       reporting status:sinked over an archive that never occurred — publishing the live run record
//       to the remote and closing the issue. A failed archive must stop the sink, name itself, and
//       stay retryable, and the two doors are held to one assertion set
//       (assertArchiveFailureStopsTheSink) so neither can end up guarded more weakly than the other.
//   (x2)/(x3) the two fences that keep the (x1) fix from being a blanket one: a run with NOTHING to
//       archive leaves the dest unset exactly as a swallowed throw does and must still complete, and
//       the export-drift class must keep failing on its own terms (driven through a scratch mirror
//       of scripts/, with an undoctored control run proving the mirror itself is sound).
//   (n1)–(n3) #931 — the collision the record did not name. When archive/<project>/ already exists
//       the archive is written to archive/<project>.archived-<ts>/ and THAT is what gets committed:
//       every path in the durable record sits under the suffixed dir, so nothing there names the
//       directory that caused the suffix or says a second archive is sitting beside this one. The
//       collision must be discoverable from the committed bytes alone. Held over BOTH shapes of
//       prior archive — tracked residue (n2) and the untracked incident shape (n1), where the
//       abandoned copy is the run's ONLY one — through one assertion set, with (n3) the no-collision
//       control that keeps the statement informative rather than unconditional. (n4) carries the same
//       disclosure to all FOUR sink copies: the suffix logic is in every port, and a gitlab-only or
//       gitea-only omission is invisible to validate-script-sync.js and edition-sync.js --check alike.
//       (n5) holds the BICONDITIONAL behaviourally on every edition — the statement appears when a prior
//       archive was there and NOT when it was not — over the posture (n3)'s fixture could not reach: main
//       holding no live folder, where the sink manufactures its own archive skeleton and an existence
//       probe reads it as a pre-existing archive.
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
  // `-b main` is not decoration: without it the bare remote's HEAD comes from the OPERATOR's
  // init.defaultBranch, which is `master` where that is unset. The fixture repo is `main`, so
  // the remote ends up with a HEAD pointing at a branch nobody ever pushes — and every
  // assertion that reads evidence back through a fresh `git clone` of this remote sees an
  // empty checkout instead of the tree. Pin it here; never let the host decide.
  G.raw(['init', '--bare', '-b', 'main', remotePath], { encoding: 'utf8' });
  git(tmp, ['remote', 'add', 'origin', remotePath]);
  git(tmp, ['push', '-u', 'origin', 'main']);
  return remotePath;
}

// A stateful gh mock: `issue view N --jq .state` returns a bare state ('open'/'closed'), derived from
// the log — closed once `close:N` is logged, re-opened by `reopen:N`. Every mutating call is logged.
//
// #936: it also holds an ISSUE-COMMENT STORE, so a `kw:claim` marker comment is a thing that exists
// on a fixture issue and can be observed to be gone afterwards, rather than a call the sink is
// asserted to have made. The store lives at `<binDir>/issue-comments.json`
// (`{ "<issue>": [ { id, body, updated_at } ] }`) and is served by two routes the pre-#936 mock
// answered from its catch-all:
//   `api repos/{owner}/{repo}/issues/N/comments`                → the array for issue N
//   `api --method DELETE repos/{owner}/{repo}/issues/comments/I` → drops comment I from the store
// The DELETE route is tested FIRST because both argv contain the substring `comments`.
// A scenario that plants no store gets `[]` from the list route, which is what the catch-all's empty
// stdout already parsed to — so every pre-#936 scenario is behaviourally unchanged.
function writeGhMock(binDir, logFile) {
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, 'gh.js'), [
    "'use strict';",
    'const fs = require("fs");',
    'const path = require("path");',
    'const argv = process.argv.slice(2);',
    'const a = argv.join(" ");',
    'const logFile = ' + JSON.stringify(logFile) + ';',
    'const storeFile = ' + JSON.stringify(path.join(binDir, 'issue-comments.json')) + ';',
    'function log(m){ try { fs.appendFileSync(logFile, m + "\\n"); } catch(_){} }',
    'function loadStore(){ try { return JSON.parse(fs.readFileSync(storeFile, "utf8")); } catch(_){ return {}; } }',
    'function saveStore(s){ try { fs.writeFileSync(storeFile, JSON.stringify(s, null, 2)); } catch(_){} }',
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
    // #936 comment-store routes. DELETE before LIST — both argv carry "comments".
    'const delM = a.match(/issues\\/comments\\/(\\d+)/);',
    'if (a.includes("api") && (a.includes("--method DELETE") || a.includes("-X DELETE")) && delM) {',
    '  const id = Number(delM[1]); const s = loadStore(); let hit = false;',
    '  for (const k of Object.keys(s)) {',
    '    const before = (s[k] || []).length;',
    '    s[k] = (s[k] || []).filter(function(c){ return Number(c && c.id) !== id; });',
    '    if (s[k].length !== before) hit = true;',
    '  }',
    '  saveStore(s);',
    '  log("comment-deleted:" + id + (hit ? "" : ":no-such-comment"));',
    '  process.stdout.write("{}\\n"); process.exit(0);',
    '}',
    'const listM = a.match(/issues\\/(\\d+)\\/comments/);',
    'if (a.includes("api") && listM) {',
    '  log("comments-listed:" + listM[1]);',
    '  process.stdout.write(JSON.stringify(loadStore()[listM[1]] || []) + "\\n"); process.exit(0);',
    '}',
    'process.stdout.write("\\n"); process.exit(0);',
  ].join('\n'));
}

// #936 store accessors. `plantIssueComments` seeds it; `issueCommentBodies` reads the store BACK
// after a run, which is what makes the marker assertions statements about the remote's end state
// rather than about the call the sink happened to make.
function commentStorePath(binDir) { return path.join(binDir, 'issue-comments.json'); }
function claimMarker(project) { return '<!-- kw:claim project=' + project + ' -->'; }
function plantIssueComments(binDir, byIssue) {
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(commentStorePath(binDir), JSON.stringify(byIssue, null, 2) + '\n');
}
function issueCommentBodies(binDir, issue) {
  let store = {};
  try { store = JSON.parse(fs.readFileSync(commentStorePath(binDir), 'utf8')); } catch (_) { return []; }
  return (store[String(issue)] || []).map(c => String((c && c.body) || ''));
}
// A marker comment as the claim path actually posts it (claim.js posts the HTML comment followed by
// prose on the next line), so a deleter matching the exact literal is matching what ships.
function markerComment(id, project) {
  return {
    id,
    body: claimMarker(project) + '\nKaola-Workflow started local work for `' + project + '`.',
    updated_at: new Date().toISOString(),
  };
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
//   opts.extraLiveFiles — { <name>: <content> } committed into the live folder on the BRANCH
//     alongside workflow-state.md, for a scenario that needs to name a second run-record file by
//     path. Omit for the plain shape.
//   opts.gitignoreBody — a consumer root .gitignore, committed on main ahead of the branch so its
//     rules are in force for every later staging decision. Omit for the plain shape (no .gitignore
//     at all, exactly as before).
//   opts.liveCacheFiles — { <name>: <content> } written into the live folder's OWN .cache/ on the
//     branch and force-added, so the run's evidence is branch-tracked the way a real sole-archiver
//     run leaves it. Forcing is what keeps preflight clean in BOTH #901 legs, so the .gitignore body
//     stays the single axis between them.
//   opts.noPriorArchive — do NOT plant the pre-existing archive/<project>/ dir, so the archive lands
//     at the PLAIN path and there is no collision. Two #931 callers: the no-collision control, and
//     the untracked arm, which plants its own copy after every commit. Omit for the plain shape.
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
  if (!opts.noPriorArchive) {
    fs.mkdirSync(path.join(tmpRoot, 'kaola-workflow', 'archive', project), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'kaola-workflow', 'archive', project, 'placeholder.txt'), 'prior cycle residue\n');
  }
  if (opts.gitignoreBody) {
    fs.writeFileSync(path.join(tmpRoot, '.gitignore'), opts.gitignoreBody);
    git(tmpRoot, ['add', '.gitignore']);
  }
  git(tmpRoot, ['add', 'kaola-workflow']);
  git(tmpRoot, ['commit', '-m', 'chore: roadmap + pre-existing archive']);
  git(tmpRoot, ['push', 'origin', 'main']);

  // feature branch: the live folder (sole-archiver) + a deliverable.
  git(tmpRoot, ['checkout', '-b', branch]);
  const liveDir = path.join(tmpRoot, 'kaola-workflow', project);
  fs.mkdirSync(path.join(liveDir, '.cache'), { recursive: true });
  fs.writeFileSync(path.join(liveDir, 'workflow-state.md'), liveState(project, issue, opts.claimTs || new Date().toISOString(), opts.issueAction));
  fs.writeFileSync(path.join(liveDir, 'finalization-summary.md'), '# Finalization Summary\n\nREADY FOR FINAL GIT GATE\n');
  for (const name of Object.keys(opts.extraLiveFiles || {})) {
    fs.writeFileSync(path.join(liveDir, name), opts.extraLiveFiles[name]);
  }
  for (const name of Object.keys(opts.liveCacheFiles || {})) {
    fs.writeFileSync(path.join(liveDir, '.cache', name), opts.liveCacheFiles[name]);
  }
  fs.writeFileSync(path.join(tmpRoot, 'DELIVERABLE.txt'), 'deliverable\n');
  git(tmpRoot, ['add', '-A']);
  if (opts.liveCacheFiles) git(tmpRoot, ['add', '-f', '--', 'kaola-workflow/' + project + '/.cache/']);
  git(tmpRoot, ['commit', '-m', 'feat: deliverable + live state']);
  git(tmpRoot, ['push', '-u', 'origin', branch]);
  git(tmpRoot, ['checkout', 'main']);

  return { tmpRoot, remotePath, binDir, logFile, branch };
}

// Drive the --sink transaction from an EXPLICIT script path. Every scenario but (x3) runs the
// shipped one; (x3) needs a byte-identical copy sitting next to a doctored dependency, and the
// script path is the only thing that differs between the two.
function runSinkAt(script, fx, extraArgs, extraEnv) {
  const args = [script, '--branch', fx.branch, '--project', fx.projectName, '--sink', '--json'].concat(extraArgs || []);
  return spawnSync(process.execPath, args, {
    cwd: fx.tmpRoot, encoding: 'utf8', timeout: 90000,
    env: Object.assign({}, process.env, {
      KAOLA_WORKFLOW_OFFLINE: '0',
      KAOLA_WORKFLOW_SKIP_TESTGATE: '1',
      KAOLA_GH_MOCK_SCRIPT: path.join(fx.binDir, 'gh.js'),
    }, extraEnv || {}),
  });
}

function runSink(fx, extraArgs, extraEnv) {
  return runSinkAt(sinkMergeScript, fx, extraArgs, extraEnv);
}

// The LEGACY (non---sink) entry point. It is where the two branch-shape preconditions live, so it
// is the only way to drive them end to end. Split from an EXPLICIT script path for the same reason
// runSinkAt is (#973): the worktree data-loss guard is hand-ported per forge and must be driven
// through each edition's own copy on this entry point too.
function runSinkLegacy(fx, extraArgs, extraEnv) {
  return runSinkLegacyAt(sinkMergeScript, fx, extraArgs, extraEnv);
}

function runSinkLegacyAt(script, fx, extraArgs, extraEnv) {
  const args = [script, '--branch', fx.branch, '--project', fx.projectName, '--json'].concat(extraArgs || []);
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
// #901: the BLOBS under `pathspec` at `ref`. `ls-tree -r` enumerates blobs, never directories, and
// that distinction is the whole reason #901 survived this corpus: every archived-evidence assertion
// here reads the DISK (fs.existsSync / readFileSync), and the five files the incident lost were on
// disk the entire time — untracked, absent from every commit, absent from a fresh clone, while the
// sink reported archive_commit "done" at exit 0. A durability pin that reads the disk passes against
// the broken sink; only a blob probe can tell the two apart.
// Entries, so a caller that needs the MODE (a symlink is a 120000 blob, not a 100644 one) does not
// need a second ls-tree helper. `-z` records are `<mode> SP <type> SP <sha> TAB <path>`.
//
// NUL-split ONLY — never `.trim()`. That normalization is the whole reason `-z` was chosen: git emits
// no trailing newline here, so trimming destroys leading/trailing whitespace that is genuinely part of
// a pathname. Trimming a `-z` stream in the SINK is what made a run permanently unsinkable (D3), and
// this reader had the identical bug: it silently trimmed the space out of an observed blob path while
// the expected name kept it, which would have made the whitespace pin below red against a correct
// sink. The three shipped `-z` readers and these two are held to the same rule.
function treeEntriesUnder(cwd, ref, pathspec) {
  const r = git(cwd, ['ls-tree', '-r', '-z', ref, '--', pathspec]);
  if (r.status !== 0) return [];
  return (r.stdout || '').split('\0').filter(Boolean).map((rec) => {
    const tab = rec.indexOf('\t');
    const meta = (tab < 0 ? rec : rec.slice(0, tab)).split(' ');
    return { mode: meta[0], type: meta[1], sha: meta[2], path: tab < 0 ? '' : rec.slice(tab + 1) };
  });
}
function blobsUnder(cwd, ref, pathspec) {
  return treeEntriesUnder(cwd, ref, pathspec).map(e => e.path).filter(Boolean);
}
// The archive commit itself, located by its own subject rather than assumed to be HEAD, so the
// "3 files changed / 8 files changed" claim is made about the commit that actually carries it.
function archiveCommitOf(cwd, project) {
  const subject = 'chore: archive ' + project + ' [sink]';
  const r = git(cwd, ['log', '--format=%H%x1f%s']);
  if (r.status !== 0) return null;
  for (const line of (r.stdout || '').split('\n')) {
    const i = line.indexOf('\x1f');
    if (i > 0 && line.slice(i + 1) === subject) return line.slice(0, i);
  }
  return null;
}
// The paths one non-merge commit touched. `-z` so a pathname is never quoted or split — and, per the
// note above, NUL-split only, never trimmed.
function pathsInCommit(cwd, sha) {
  const r = git(cwd, ['diff-tree', '--no-commit-id', '-r', '-z', '--name-only', sha]);
  if (r.status !== 0) return [];
  return (r.stdout || '').split('\0').filter(Boolean);
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
//
// #973: three more optional knobs, all off by default so every pre-existing caller is byte-unchanged.
//   opts.untracked  { '<wt-relative path>': content } — planted UNTRACKED in the linked worktree at
//                   an arbitrary path, so a scenario can carry genuine work (src/…) as well as the
//                   workflow's own lane content (kaola-workflow/<project>/…). Also builds the
//                   worktree on its own, so a scenario needs no .cache evidence to get one.
//   opts.symlinks   { '<wt-relative path>': '<link target>' } — the same, as a SYMLINK. A regular
//                   file is not a proxy for this: the artifact that motivated the issue is a link.
//   opts.gitignore  a .gitignore body COMMITTED on main before the branch, so `opts.untracked` can
//                   plant content git is required to ignore (the third population at this seam).
// The worktree path is returned as `wtPath` — the destructive step under test removes exactly that
// directory, so a scenario has to be able to name it.
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
  if (opts.gitignore) fs.writeFileSync(path.join(tmpRoot, '.gitignore'), opts.gitignore);
  git(tmpRoot, ['add', '-A']);
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
  let wtPath = null;
  if (opts.evidence || opts.untracked || opts.symlinks) {
    wtPath = path.join(tmpRoot, '.kw', 'worktrees', project);
    git(tmpRoot, ['worktree', 'add', wtPath, branch]);
    if (opts.evidence) {
      const wtCache = path.join(wtPath, 'kaola-workflow', project, '.cache');
      fs.mkdirSync(wtCache, { recursive: true });
      for (const name of Object.keys(opts.evidence)) {
        fs.writeFileSync(path.join(wtCache, name), opts.evidence[name]);
      }
    }
    plantWorktreeUntracked973(wtPath, opts);
  }

  return { tmpRoot, remotePath, binDir, logFile, branch, wtPath };
}

// #973: plant `opts.untracked` (regular files) and `opts.symlinks` (links) into a linked worktree.
// Shared by the two fixture builders that need it so the symlink shape is expressed in one place —
// it is easy to add the file case to a builder and quietly leave the link case only in one of them.
function plantWorktreeUntracked973(wtPath, opts) {
  for (const rel of Object.keys((opts && opts.untracked) || {})) {
    const abs = path.join(wtPath, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, opts.untracked[rel]);
  }
  for (const rel of Object.keys((opts && opts.symlinks) || {})) {
    const abs = path.join(wtPath, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.symlinkSync(opts.symlinks[rel], abs);
  }
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

    // #980, the FALSE-ALARM control. This is the path the staged-journal note must stay silent on: a
    // worktree-postured sink that stages, removes, merges and LANDS. (w) proves the note fires when
    // it should; nothing but this proves it stops.
    //
    // Measured, so it is not read as more than it is: this clause is held by the handler's existsSync
    // probe rather than by the disarm — dropping both disarm calls leaves this arm GREEN, because the
    // landing deletes the stage and the probe then finds nothing to report. The disarm covers the
    // case behind that probe (a cleanup rmSync that fails leaves the directory on disk), which this
    // fixture does not reach; (w2) is what holds the disarm, and it says so in its own words.
    assert(!/staged run journal|kw-wtsync-/.test(String(result.stderr || '')),
      '#707 h (#980): a COMPLETED worktree sink must not warn about an un-landed staged journal — it '
      + 'landed and deleted the stage. stderr:\n' + String(result.stderr || '').slice(-800));
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

// --------------------------------------------------------------------------- (w1)–(w10) #893

// The archive tree `cmdFinalize --project P --keep-worktree` leaves in the MAIN checkout. The file
// set is the one observed on issue-891 verbatim (the four paths the refusal listed).
function archiveMirrorFiles(project, issue) {
  return {
    '.cache/origin/selection-record.json': JSON.stringify({ project, selected: [issue] }, null, 2) + '\n',
    'finalization-summary.md': '# Finalization Summary\n\nREADY FOR FINAL GIT GATE\n',
    'mission-list.md': '# ' + project + ' — close the issue\n\n### item: pin the exemption\nstatus: done\nresult: inline\n',
    'workflow-state.md': liveState(project, issue, new Date().toISOString()),
  };
}
// Re-key a { <rel>: <content> } archive map onto repo-relative paths under one project's archive dir.
function mirrorPlant(project, mirror) {
  const out = {};
  for (const rel of Object.keys(mirror)) out['kaola-workflow/archive/' + project + '/' + rel] = mirror[rel];
  return out;
}

// The shape a `--keep-worktree` finish ACTUALLY leaves for the sink, per archiveProjectDir
// (kaola-workflow-claim.js): on a LINKED run the archive always lands under MAIN's root and stays
// UNTRACKED there, and the feature branch never carries the archive path at all — cmdFinalize
// cannot stage a path outside its own worktree, so it defers the commit to the sink's own
// archive_commit step. So the branch here carries the deliverable and NO live folder, and main
// carries the archive as untracked residue. That asymmetry is the whole scenario: an exemption
// keyed on "the branch already carries this file" can never fire on it.
//   opts.branchArchive — { <rel>: <content> } committed on the BRANCH under this project's archive
//     path (the conflicting-copy shape). Omit for the observed shape.
//   opts.plant — { <repo-rel>: <content> } written UNTRACKED into main once the fixture is built.
function buildKeepWorktreeArchiveMirrorFixture(project, issue, opts) {
  opts = opts || {};
  const tmpRoot = makeTmpRoot();
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-mock-'));
  const logFile = path.join(binDir, 'gh-calls.log');
  const branch = 'workflow/' + project;
  const remotePath = initGitRepoWithBareRemote(tmpRoot);
  writeGhMock(binDir, logFile);

  // main: roadmap source + mirror. No pre-existing archive dir — this run is the first to archive
  // this project, so no collision suffix muddies which path the assertions are about.
  fs.mkdirSync(path.join(tmpRoot, 'kaola-workflow', '.roadmap'), { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, 'kaola-workflow', '.roadmap', 'issue-' + issue + '.md'), roadmapSource(issue));
  fs.writeFileSync(path.join(tmpRoot, 'kaola-workflow', 'ROADMAP.md'), roadmapMirror([issue]));
  git(tmpRoot, ['add', 'kaola-workflow']);
  git(tmpRoot, ['commit', '-m', 'chore: roadmap']);
  git(tmpRoot, ['push', 'origin', 'main']);

  // feature branch: the deliverable. The live folder lived in the linked worktree and was never
  // main-tracked; the keep-worktree finalize commit already took it off the branch.
  git(tmpRoot, ['checkout', '-b', branch]);
  fs.writeFileSync(path.join(tmpRoot, 'DELIVERABLE.txt'), 'deliverable\n');
  for (const rel of Object.keys(opts.branchArchive || {})) {
    const abs = path.join(tmpRoot, 'kaola-workflow', 'archive', project, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, opts.branchArchive[rel]);
  }
  git(tmpRoot, ['add', '-A']);
  git(tmpRoot, ['commit', '-m', 'feat: deliverable']);
  git(tmpRoot, ['push', '-u', 'origin', branch]);
  git(tmpRoot, ['checkout', 'main']);

  // main working tree: finalize's untracked residue, plus whatever else the scenario plants.
  for (const rel of Object.keys(opts.plant || {})) {
    const abs = path.join(tmpRoot, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, opts.plant[rel]);
  }

  return { tmpRoot, remotePath, binDir, logFile, branch };
}

// (w1) NEW BEHAVIOUR. The headline claim, end to end on the observed shape: the mirror is the only
// dirt, and the documented finishing sequence must complete rather than block itself.
(function testKeepWorktreeArchiveMirrorDoesNotBlockOwnSink() {
  console.log('Test (#893 w1): the untracked archive mirror a --keep-worktree finalize leaves in MAIN must NOT block this sink — the documented worktree finishing sequence completes, and the mirror lands at HEAD byte-for-byte');
  const project = 'issue-89301';
  const issue = 89301;
  const mirror = archiveMirrorFiles(project, issue);
  const fx = buildKeepWorktreeArchiveMirrorFixture(project, issue, { plant: mirrorPlant(project, mirror) });
  fx.projectName = project;
  try {
    const result = runSink(fx, ['--issue', String(issue)]);
    const out = lastJson(result);

    assert(!(out && out.reason === 'sink_blocked'),
      '#893 w1: the sink must NOT refuse sink_blocked on its OWN archive mirror; foreign_dirt=' + JSON.stringify(out && out.foreign_dirt)
      + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(result.status === 0, '#893 w1: sink must exit 0; got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out && out.status === 'sinked', '#893 w1: status must be sinked; got ' + JSON.stringify(out && out.status));

    // NO DATA LOSS. Main holds the run's ONLY copy of these files — the branch never carried them —
    // so archive_commit must land every one of them. An exemption that REMOVES the mirror the way
    // bucket 2 removes its duplicates would destroy the finalization summary and the mission list,
    // which is the failure mode the manual recipe warns about. finalization-summary.md is checked
    // as a PREFIX, not for equality: the sink appends its own `## Sink Findings` section to that
    // one file before staging the archive, and that append is the sink's, not a loss.
    for (const rel of Object.keys(mirror)) {
      const headRel = 'kaola-workflow/archive/' + project + '/' + rel;
      const atHead = showAtHead(fx.tmpRoot, headRel);
      const ok = rel === 'finalization-summary.md'
        ? (atHead !== null && atHead.startsWith(mirror[rel]))
        : atHead === mirror[rel];
      assert(ok, '#893 w1: ' + headRel + ' must be committed at HEAD carrying the mirrored content after the sink; got ' + JSON.stringify(atHead));
    }
    const status = git(fx.tmpRoot, ['status', '--porcelain']).stdout.trim();
    assert(status === '', '#893 w1: main checkout must be clean after status:sinked; got:\n' + status);
  } finally {
    cleanup(fx);
  }
})();

// (w2) The same classification claim isolated from the rest of the transaction: a genuinely foreign
// file forces the refusal, so the mirror's absence from the listing is directly observable (the
// #715 (m) idiom). The "foreign file is listed" and "zero mutation" clauses are FENCES; the "mirror
// paths are absent" clauses are NEW BEHAVIOUR.
(function testKeepWorktreeArchiveMirrorNotListedAsForeignDirt() {
  console.log('Test (#893 w2): with a genuinely foreign file forcing the refusal, this project\'s own untracked archive mirror must NOT appear in foreign_dirt and must be left byte-untouched');
  const project = 'issue-89302';
  const issue = 89302;
  const mirror = archiveMirrorFiles(project, issue);
  const foreignRel = 'kaola-workflow/foreign-89392/workflow-state.md';
  const plant = Object.assign(mirrorPlant(project, mirror), { [foreignRel]: 'status: active\n' });
  const fx = buildKeepWorktreeArchiveMirrorFixture(project, issue, { plant });
  fx.projectName = project;
  try {
    const statusBefore = git(fx.tmpRoot, ['status', '--porcelain', '-uall']).stdout;
    const result = runSink(fx, ['--issue', String(issue)]);
    const out = lastJson(result);

    assert(result.status !== 0, '#893 w2: sink must refuse on the planted foreign file; got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out && out.reason === 'sink_blocked', '#893 w2: reason must be sink_blocked; got ' + JSON.stringify(out && out.reason));
    assert(out && Array.isArray(out.foreign_dirt) && out.foreign_dirt.includes(foreignRel),
      '#893 w2: foreign_dirt must still list the genuinely foreign file; got ' + JSON.stringify(out && out.foreign_dirt));
    for (const rel of Object.keys(mirror)) {
      const dirtRel = 'kaola-workflow/archive/' + project + '/' + rel;
      assert(out && Array.isArray(out.foreign_dirt) && !out.foreign_dirt.includes(dirtRel),
        '#893 w2: ' + dirtRel + ' is this sink\'s own archive mirror and must NOT be listed as foreign dirt; got ' + JSON.stringify(out && out.foreign_dirt));
      const abs = path.join(fx.tmpRoot, dirtRel);
      assert(fs.existsSync(abs) && fs.readFileSync(abs, 'utf8') === mirror[rel],
        '#893 w2: ' + dirtRel + ' must be byte-untouched after a refusal (the exemption is classification-only)');
    }
    const statusAfter = git(fx.tmpRoot, ['status', '--porcelain', '-uall']).stdout;
    assert(statusBefore === statusAfter, '#893 w2: git status must be unchanged after sink_blocked refuse\nbefore: ' + JSON.stringify(statusBefore) + '\nafter: ' + JSON.stringify(statusAfter));
  } finally {
    cleanup(fx);
  }
})();

// (w3) The bound the widening must not cross. "This sink never touches another project's files" is
// the invariant, so a SIBLING project's archive tree stays bucket-3 — and so does a project-name
// PREFIX look-alike (kaola-workflow/archive/<project>-sibling/…), which a path test written without
// a segment boundary would silently swallow. The "sibling/look-alike is listed" and "zero mutation"
// clauses are FENCES (green today, and the reason they exist is that nothing else would notice the
// widening going unbounded); the "own mirror is absent" clauses are NEW BEHAVIOUR.
(function testSiblingArchiveTreeStaysForeignDirt() {
  console.log('Test (#893 w3): over-exemption guard — a SIBLING project\'s archive tree and a project-name PREFIX look-alike stay bucket-3 foreign dirt while this project\'s own mirror is exempt');
  const project = 'issue-89303';
  const issue = 89303;
  const sibling = 'issue-89393';
  const mirror = archiveMirrorFiles(project, issue);
  const siblingRels = [
    'kaola-workflow/archive/' + sibling + '/mission-list.md',
    'kaola-workflow/archive/' + sibling + '/.cache/origin/selection-record.json',
    // Prefix look-alike: shares this project's archive prefix but is a DIFFERENT path segment.
    'kaola-workflow/archive/' + project + '-sibling/mission-list.md',
  ];
  const plant = mirrorPlant(project, mirror);
  for (const rel of siblingRels) plant[rel] = 'sibling in-progress artifact\n';
  const fx = buildKeepWorktreeArchiveMirrorFixture(project, issue, { plant });
  fx.projectName = project;
  try {
    const statusBefore = git(fx.tmpRoot, ['status', '--porcelain', '-uall']).stdout;
    const result = runSink(fx, ['--issue', String(issue)]);
    const out = lastJson(result);

    assert(result.status !== 0, '#893 w3: sink must refuse on a sibling project\'s archive tree; got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out && out.reason === 'sink_blocked', '#893 w3: reason must be sink_blocked; got ' + JSON.stringify(out && out.reason));
    for (const rel of siblingRels) {
      assert(out && Array.isArray(out.foreign_dirt) && out.foreign_dirt.includes(rel),
        '#893 w3: foreign_dirt must list ' + rel + ' — the widening is keyed on THIS project only; got ' + JSON.stringify(out && out.foreign_dirt));
      const abs = path.join(fx.tmpRoot, rel);
      assert(fs.existsSync(abs) && fs.readFileSync(abs, 'utf8') === 'sibling in-progress artifact\n',
        '#893 w3: ' + rel + ' must be byte-untouched (this sink never touches another project\'s files)');
    }
    for (const rel of Object.keys(mirror)) {
      const ownRel = 'kaola-workflow/archive/' + project + '/' + rel;
      assert(out && Array.isArray(out.foreign_dirt) && !out.foreign_dirt.includes(ownRel),
        '#893 w3: ' + ownRel + ' is this sink\'s own mirror and must NOT be listed; got ' + JSON.stringify(out && out.foreign_dirt));
    }
    const statusAfter = git(fx.tmpRoot, ['status', '--porcelain', '-uall']).stdout;
    assert(statusBefore === statusAfter, '#893 w3: git status must be unchanged after sink_blocked refuse\nbefore: ' + JSON.stringify(statusBefore) + '\nafter: ' + JSON.stringify(statusAfter));
  } finally {
    cleanup(fx);
  }
})();

// (w4) The exemption is superset-verified against the branch, not a blanket path allowance. Read
// together with (w1) — where the branch carries NOTHING under the archive path and the mirror is
// still exempt — the only rule that satisfies both is "exempt unless the branch carries a
// CONFLICTING version": absent on the branch is the observed shape and safe; present at different
// bytes is two divergent archives, which must refuse loudly with zero mutation rather than let one
// silently win. FENCE today (current code refuses everything under the path).
(function testConflictingBranchCopyStaysForeignDirt() {
  console.log('Test (#893 w4): the exemption is superset-verified, not a blanket path allowance — a mirrored file the BRANCH carries at conflicting bytes must still refuse, with the main copy left untouched');
  const project = 'issue-89304';
  const issue = 89304;
  const mirror = archiveMirrorFiles(project, issue);
  const conflictRel = 'kaola-workflow/archive/' + project + '/mission-list.md';
  const fx = buildKeepWorktreeArchiveMirrorFixture(project, issue, {
    // The branch carries a DIFFERENT mission list at the same path than the one main holds.
    branchArchive: { 'mission-list.md': '# ' + project + ' — a DIVERGENT run record\n\n### item: not the same bytes\nstatus: todo\n' },
    plant: mirrorPlant(project, mirror),
  });
  fx.projectName = project;
  try {
    const statusBefore = git(fx.tmpRoot, ['status', '--porcelain', '-uall']).stdout;
    const result = runSink(fx, ['--issue', String(issue)]);
    const out = lastJson(result);

    assert(result.status !== 0, '#893 w4: sink must refuse when the branch carries a conflicting copy; got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out && out.reason === 'sink_blocked', '#893 w4: reason must be sink_blocked; got ' + JSON.stringify(out && out.reason));
    assert(out && Array.isArray(out.foreign_dirt) && out.foreign_dirt.includes(conflictRel),
      '#893 w4: foreign_dirt must list ' + conflictRel + ' — the branch carries different bytes at that path, so it is not this mirror\'s duplicate; got ' + JSON.stringify(out && out.foreign_dirt));
    const abs = path.join(fx.tmpRoot, conflictRel);
    assert(fs.existsSync(abs) && fs.readFileSync(abs, 'utf8') === mirror['mission-list.md'],
      '#893 w4: the conflicting main copy must be left byte-untouched — an exemption that removed it would resolve the divergence by deleting one side');
    const statusAfter = git(fx.tmpRoot, ['status', '--porcelain', '-uall']).stdout;
    assert(statusBefore === statusAfter, '#893 w4: git status must be unchanged after sink_blocked refuse\nbefore: ' + JSON.stringify(statusBefore) + '\nafter: ' + JSON.stringify(statusAfter));
  } finally {
    cleanup(fx);
  }
})();

// (w5)–(w7) #893 — the READ-FAULT arm of the same three-way rule. (w4) proves a divergent branch
// copy refuses when the copy can be READ. These cover what happens when it cannot be. "git show
// failed" is not evidence that the branch does not carry the path, so resolving every read fault
// toward "exempt" gives away precisely the case (w4) exists to catch — and it gives it away on a
// healthy repo, not only a broken one. The distinguishing probe has to be an EXISTENCE question
// (`git cat-file -e <key>:<path>`), which answers under both faults below and emits no output of its
// own to overflow: a failed content read on a path the branch demonstrably CARRIES is
// UNVERIFIABLE, and unverifiable is foreign dirt, not a duplicate. Absence — the observed shape
// (w1) is about — is untouched by all three.

// The on-disk loose object a ref names. Making it unreadable leaves the branch TREE naming the blob
// exactly as it was, so the fault is a failure to READ and not an absence — which is the entire
// distinction the exemption has to draw.
function looseObjectOf(tmpRoot, ref) {
  const sha = git(tmpRoot, ['rev-parse', ref]).stdout.trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) return { sha, abs: null };
  return { sha, abs: path.join(tmpRoot, '.git', 'objects', sha.slice(0, 2), sha.slice(2)) };
}

// The sink's own git buffer ceiling, read out of the shipped source rather than restated here: an
// oversize fixture proves nothing unless it exceeds the limit the running code actually compiles
// with. Returns null if the declaration cannot be found, which the scenario asserts on rather than
// silently substituting a number of its own.
function sinkGitMaxBuffer() {
  const m = fs.readFileSync(sinkMergeScript, 'utf8').match(/const GIT_MAX_BUFFER\s*=\s*([\d\s*]+);/);
  if (!m) return null;
  return m[1].split('*').reduce((acc, t) => acc * Number(t.trim()), 1);
}

// (w5) NEW BEHAVIOUR. Classification isolated (the (w2)/(w4) idiom): the branch carries a DIVERGENT
// copy at THIS project's own archive path, and the object backing it cannot be read. A genuinely
// foreign file forces the refusal, so the divergent copy's classification is directly observable.
(function testUnreadableBranchCopyStaysForeignDirt() {
  console.log('Test (#893 w5): the branch carries a DIVERGENT archive copy whose object cannot be READ — unreadable is unverifiable, not absent, so it must stay bucket-3 foreign dirt');
  const project = 'issue-89305';
  const issue = 89305;
  const mirror = archiveMirrorFiles(project, issue);
  const conflictRel = 'kaola-workflow/archive/' + project + '/mission-list.md';
  const foreignRel = 'kaola-workflow/foreign-89395/workflow-state.md';
  const plant = Object.assign(mirrorPlant(project, mirror), { [foreignRel]: 'status: active\n' });
  const fx = buildKeepWorktreeArchiveMirrorFixture(project, issue, {
    branchArchive: { 'mission-list.md': '# ' + project + ' — a DIVERGENT run record\n\n### item: not the same bytes\nstatus: todo\n' },
    plant,
  });
  fx.projectName = project;
  let objAbs = null;
  try {
    // PRECONDITIONS. Without them the scenario is unfalsifiable: if the object stayed READABLE the
    // path would be listed by (w4)'s own rule, and every assertion below would pass for a reason
    // that has nothing to do with read faults.
    const obj = looseObjectOf(fx.tmpRoot, fx.branch + ':' + conflictRel);
    assert(obj.abs !== null && fs.existsSync(obj.abs),
      '#893 w5 precondition: the branch copy must be a LOOSE object for the fixture to make it unreadable; sha=' + JSON.stringify(obj.sha));
    objAbs = obj.abs;
    try { fs.chmodSync(objAbs, 0o000); } catch (_) {}
    assert(git(fx.tmpRoot, ['show', fx.branch + ':' + conflictRel]).status !== 0,
      '#893 w5 precondition: git show must now FAIL — if it still succeeds the fixture is not exercising a read fault at all');
    assert(git(fx.tmpRoot, ['ls-tree', fx.branch, '--', conflictRel]).stdout.includes(obj.sha),
      '#893 w5 precondition: the branch TREE must still name the blob — the branch DOES carry this path, so this is a read fault and not an absence');

    const statusBefore = git(fx.tmpRoot, ['status', '--porcelain', '-uall']).stdout;
    const result = runSink(fx, ['--issue', String(issue)]);
    const out = lastJson(result);

    assert(out && out.reason === 'sink_blocked',
      '#893 w5: reason must be sink_blocked (the planted foreign file forces the refusal); got ' + JSON.stringify(out && (out.reason || out.status))
      + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out && Array.isArray(out.foreign_dirt) && out.foreign_dirt.includes(conflictRel),
      '#893 w5: foreign_dirt must list ' + conflictRel + ' — the branch carries DIVERGENT bytes there and the copy could not be read, which is unverifiable, not exempt; got ' + JSON.stringify(out && out.foreign_dirt));
    const abs = path.join(fx.tmpRoot, conflictRel);
    assert(fs.existsSync(abs) && fs.readFileSync(abs, 'utf8') === mirror['mission-list.md'],
      '#893 w5: the main copy must be left byte-untouched — an unresolvable divergence is not resolved by deleting one side');
    const statusAfter = git(fx.tmpRoot, ['status', '--porcelain', '-uall']).stdout;
    assert(statusBefore === statusAfter, '#893 w5: git status must be unchanged after sink_blocked refuse\nbefore: ' + JSON.stringify(statusBefore) + '\nafter: ' + JSON.stringify(statusAfter));
  } finally {
    try { if (objAbs) fs.chmodSync(objAbs, 0o444); } catch (_) {}
    cleanup(fx);
  }
})();

// (w6) NEW BEHAVIOUR. The same loss with NOTHING tampered with anywhere: the branch's divergent copy
// is simply larger than the buffer the content read allocates, so the read overflows on a repo where
// every object is intact and readable. This is the trigger that arrives by accident.
(function testOversizeBranchCopyStaysForeignDirt() {
  console.log('Test (#893 w6): the branch carries a DIVERGENT archive copy larger than the sink\'s own git buffer — a read that OVERFLOWS is unverifiable too, and nothing about the repo is broken');
  const project = 'issue-89306';
  const issue = 89306;
  const ceiling = sinkGitMaxBuffer();
  assert(ceiling !== null && ceiling > 0,
    '#893 w6: GIT_MAX_BUFFER must be readable out of scripts/kaola-workflow-sink-merge.js — the fixture is sized against the ceiling the SHIPPED code uses, not one restated here; got ' + JSON.stringify(ceiling));
  const cap = ceiling || 64 * 1024 * 1024;
  const mirror = archiveMirrorFiles(project, issue);
  const conflictRel = 'kaola-workflow/archive/' + project + '/mission-list.md';
  const foreignRel = 'kaola-workflow/foreign-89396/workflow-state.md';
  const plant = Object.assign(mirrorPlant(project, mirror), { [foreignRel]: 'status: active\n' });
  // Deliberately incompressible-free filler: one MiB past the ceiling inflates well beyond the
  // buffer while the loose object zlib's down to a few hundred KiB, so the whole fixture (write,
  // hash, commit, push) costs a fraction of a second rather than paying for 65 MiB of real I/O.
  const big = '# ' + project + ' — a DIVERGENT run record\n' + 'x'.repeat(cap + 1024 * 1024) + '\n';
  const fx = buildKeepWorktreeArchiveMirrorFixture(project, issue, { branchArchive: { 'mission-list.md': big }, plant });
  fx.projectName = project;
  try {
    // PRECONDITIONS: the blob really is over the ceiling, and a read at that ceiling really does
    // overflow. The second one is what ties the fixture to the fault — a merely large file the
    // buffer could still hold would make every assertion below meaningless.
    const sz = Number(git(fx.tmpRoot, ['cat-file', '-s', fx.branch + ':' + conflictRel]).stdout.trim());
    assert(sz > cap, '#893 w6 precondition: the branch blob must exceed the ' + cap + '-byte ceiling; got ' + sz);
    // The measured property is a failure mode of INVOKING git as a child process: ENOBUFS is what
    // the parent's child-process buffer reports when the child's stdout outruns it, so the property
    // lives entirely at the process boundary and has no in-process form — no function call can
    // overflow a spawn buffer. Asserting the blob size instead would only restate the fixture; this
    // is what proves the read the sink performs actually fails on it.
    // spawn-class: cli-contract
    const overflow = spawnSync('git', ['-C', fx.tmpRoot, 'show', fx.branch + ':' + conflictRel], { maxBuffer: cap });
    assert(overflow.error && overflow.error.code === 'ENOBUFS',
      '#893 w6 precondition: a content read at that ceiling must overflow (ENOBUFS) — that IS the fault under test; got ' + JSON.stringify(overflow.error && overflow.error.code));
    // And the probe that CAN answer here answers cleanly, which is why the repair is possible at all.
    assert(git(fx.tmpRoot, ['cat-file', '-e', fx.branch + ':' + conflictRel]).status === 0,
      '#893 w6 precondition: an existence probe must still answer 0 — the branch demonstrably carries this path');

    const statusBefore = git(fx.tmpRoot, ['status', '--porcelain', '-uall']).stdout;
    const result = runSink(fx, ['--issue', String(issue)]);
    const out = lastJson(result);

    assert(out && out.reason === 'sink_blocked',
      '#893 w6: reason must be sink_blocked (the planted foreign file forces the refusal); got ' + JSON.stringify(out && (out.reason || out.status))
      + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out && Array.isArray(out.foreign_dirt) && out.foreign_dirt.includes(conflictRel),
      '#893 w6: foreign_dirt must list ' + conflictRel + ' — a branch copy too large for the read buffer is unverifiable, not absent; got ' + JSON.stringify(out && out.foreign_dirt));
    const abs = path.join(fx.tmpRoot, conflictRel);
    assert(fs.existsSync(abs) && fs.readFileSync(abs, 'utf8') === mirror['mission-list.md'],
      '#893 w6: the main copy must be left byte-untouched');
    const statusAfter = git(fx.tmpRoot, ['status', '--porcelain', '-uall']).stdout;
    assert(statusBefore === statusAfter, '#893 w6: git status must be unchanged after sink_blocked refuse\nbefore: ' + JSON.stringify(statusBefore) + '\nafter: ' + JSON.stringify(statusAfter));
  } finally {
    cleanup(fx);
  }
})();

// (w7) NEW BEHAVIOUR. The end-to-end consequence, and the reason this arm is not merely a
// mis-classification. (w5)'s shape with NO foreign file, so nothing else forces a refusal: whatever
// the sink concludes, the contract is that it concludes it in a TYPED envelope. An exemption that
// swallows the read fault instead lets the run past preflight into the merge steps, where the very
// divergence it swallowed resurfaces as an unhandled git error — a non-zero exit carrying no
// envelope at all, which leaves the orchestrator nothing to route on. (w4) emits a clean
// sink_blocked on this shape when the object is readable; the read fault must not change that.
(function testUnverifiableBranchCopyEmitsTypedRefusal() {
  console.log('Test (#893 w7): with the divergence unverifiable and nothing else dirty, the sink must still emit a well-formed TYPED envelope and refuse — never crash past preflight with an unparseable failure');
  const project = 'issue-89307';
  const issue = 89307;
  const mirror = archiveMirrorFiles(project, issue);
  const conflictRel = 'kaola-workflow/archive/' + project + '/mission-list.md';
  const fx = buildKeepWorktreeArchiveMirrorFixture(project, issue, {
    branchArchive: { 'mission-list.md': '# ' + project + ' — a DIVERGENT run record\n\n### item: not the same bytes\nstatus: todo\n' },
    plant: mirrorPlant(project, mirror),
  });
  fx.projectName = project;
  let objAbs = null;
  try {
    const obj = looseObjectOf(fx.tmpRoot, fx.branch + ':' + conflictRel);
    assert(obj.abs !== null && fs.existsSync(obj.abs),
      '#893 w7 precondition: the branch copy must be a LOOSE object for the fixture to make it unreadable; sha=' + JSON.stringify(obj.sha));
    objAbs = obj.abs;
    try { fs.chmodSync(objAbs, 0o000); } catch (_) {}
    assert(git(fx.tmpRoot, ['show', fx.branch + ':' + conflictRel]).status !== 0,
      '#893 w7 precondition: git show must now FAIL — if it still succeeds the fixture is not exercising a read fault at all');

    const statusBefore = git(fx.tmpRoot, ['status', '--porcelain', '-uall']).stdout;
    const mainBefore = git(fx.tmpRoot, ['rev-parse', 'main']).stdout.trim();
    const remoteBefore = git(fx.tmpRoot, ['rev-parse', 'origin/main']).stdout.trim();
    const result = runSink(fx, ['--issue', String(issue)]);
    const out = lastJson(result);

    // The envelope FIRST, on its own: "emitted nothing parseable" and "emitted the wrong verdict"
    // are different failures and must read differently. This is the clause an untyped crash trips.
    assert(out !== null,
      '#893 w7: the sink must emit a well-formed JSON envelope — an unhandled error past preflight gives the orchestrator nothing to route on; exit=' + result.status
      + '\nstdout: ' + JSON.stringify(result.stdout) + '\nstderr: ' + JSON.stringify((result.stderr || '').slice(0, 800)));
    assert(out && out.result === 'refuse', '#893 w7: the envelope must be a typed refusal; got ' + JSON.stringify(out));
    assert(out && out.reason === 'sink_blocked', '#893 w7: reason must be sink_blocked; got ' + JSON.stringify(out && (out.reason || out.status)));
    assert(result.status !== 0, '#893 w7: sink must exit non-zero on the refusal; got ' + result.status);
    assert(out && Array.isArray(out.foreign_dirt) && out.foreign_dirt.includes(conflictRel),
      '#893 w7: foreign_dirt must name the unverifiable divergent path so the refusal says WHICH file to resolve; got ' + JSON.stringify(out && out.foreign_dirt));

    // ZERO MUTATION: a preflight refusal happens before anything is merged, pushed or closed.
    assertNothingPublished(fx, '#893 w7', { mainBefore, remoteBefore });
    const statusAfter = git(fx.tmpRoot, ['status', '--porcelain', '-uall']).stdout;
    assert(statusBefore === statusAfter, '#893 w7: git status must be unchanged after sink_blocked refuse\nbefore: ' + JSON.stringify(statusBefore) + '\nafter: ' + JSON.stringify(statusAfter));
  } finally {
    try { if (objAbs) fs.chmodSync(objAbs, 0o444); } catch (_) {}
    cleanup(fx);
  }
})();

// (w8)–(w10) #893 — the REPORT. The exemption covers a DIRECTORY, and archive_commit stages that
// whole `kaola-workflow/archive/<project>` pathspec, so every file sitting there when the sink runs
// is committed to the default branch and pushed — including one no finalize ever wrote.
//
// The sink does NOT refuse it, and does not try to tell a stray from the mirror. It cannot: the
// archive is a copy of the run's project folder, which lives UNTRACKED in the main checkout and is
// committed nowhere, so git holds no record of what finalize legitimately produced; and no list of
// names could stand in for one, because the archive carries whatever artifacts a given run needed —
// routing briefs, demolition manifests, gap audits, summaries — under names nobody can enumerate in
// advance. A discriminator that does not exist cannot be tested into existence.
//
// So the harm being closed is SILENCE, not the commit. The sink reports what it found and the
// orchestrator gets the branch right: every own-archive path this sink commits must be NAMED, so a
// stray is visible in the record instead of arriving unannounced on the default branch.
//
// WHERE the report lives — two homes, chosen from what the sink already does rather than invented:
//   receipt.archived_paths — an array of repo-relative paths on the emitted envelope's receipt,
//     modelled on `removed_duplicates` (paths bucket 2 removed) and `closed_issues` (issues the sink
//     closed): same snake_case, same plural, same "things this sink acted on", and `removed_duplicates`
//     already ships PRESENT-AND-EMPTY on a run that removed nothing, which is the property (w10)
//     pins. This is what the orchestrator routes on.
//   the archived `## Sink Findings` — the sink's own durable section in finalization-summary.md,
//     which the code calls "what outlives this" because the journal is disposed and the envelope is
//     stdout. A report that vanishes when the process exits only half-closes a silence.
// Both, because they serve different readers at different times: the envelope answers "what is
// happening now", the committed summary answers "what did we publish, and when did it get there".
// The list is UNIFORM — it names the stray exactly as it names the mirror — because the whole ruling
// rests on the two being indistinguishable to the sink.

// (w8) NEW BEHAVIOUR. The headline: a stray rides the exemption into the commit, and must not do it
// quietly. `.env.local` because the stakes are legible — this is the shape where the sink publishes
// a credential file to the default branch and pushes it.
(function testArchivedPathsReportNamesEveryCommittedOwnArchivePath() {
  console.log('Test (#893 w8): a stray under this project\'s own archive dir is COMMITTED by archive_commit — the accepted behaviour — but the sink must NAME every own-archive path it commits, on the envelope and in the durable summary, so nothing lands silently');
  const project = 'issue-89308';
  const issue = 89308;
  const mirror = archiveMirrorFiles(project, issue);
  const strayRel = 'kaola-workflow/archive/' + project + '/.env.local';
  const plant = Object.assign(mirrorPlant(project, mirror), { [strayRel]: 'AWS_SECRET_ACCESS_KEY=planted\n' });
  const fx = buildKeepWorktreeArchiveMirrorFixture(project, issue, { plant });
  fx.projectName = project;
  try {
    const result = runSink(fx, ['--issue', String(issue)]);
    const out = lastJson(result);

    // The ruling, pinned as a fence: no refusal. A future implementer reaching for a discriminator
    // has to fail this first, which is the point — the sink is not entitled to guess.
    assert(result.status === 0, '#893 w8: the sink must NOT refuse on a stray under its own archive dir — it reports, it does not adjudicate; got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out && out.status === 'sinked', '#893 w8: status must be sinked; got ' + JSON.stringify(out && (out.status || out.reason)));
    assert(showAtHead(fx.tmpRoot, strayRel) === 'AWS_SECRET_ACCESS_KEY=planted\n',
      '#893 w8: the stray IS committed at HEAD — that is the accepted behaviour this scenario exists to make VISIBLE, not to prevent; got ' + JSON.stringify(showAtHead(fx.tmpRoot, strayRel)));

    const reported = out && out.receipt && out.receipt.archived_paths;
    assert(Array.isArray(reported),
      '#893 w8: receipt.archived_paths must be an array naming what archive_commit committed — a consumer cannot route on undefined; got ' + JSON.stringify(reported));
    for (const rel of Object.keys(mirror)) {
      const ownRel = 'kaola-workflow/archive/' + project + '/' + rel;
      assert(Array.isArray(reported) && reported.includes(ownRel),
        '#893 w8: receipt.archived_paths must name ' + ownRel + '; got ' + JSON.stringify(reported));
    }
    // THE ASSERTION THAT CONVERTS A SILENT COMMIT INTO A VISIBLE ONE.
    assert(Array.isArray(reported) && reported.includes(strayRel),
      '#893 w8: receipt.archived_paths must name ' + strayRel + ' — it was committed to the default branch and pushed, and the report is uniform precisely because the sink cannot tell it from the mirror; got ' + JSON.stringify(reported));

    // DURABLE. The envelope is stdout and the journal is disposed; the archived summary is what a
    // reader has months later when asking what this sink published.
    const summaryAtHead = showAtHead(fx.tmpRoot, 'kaola-workflow/archive/' + project + '/finalization-summary.md');
    assert(summaryAtHead !== null && summaryAtHead.includes(strayRel),
      '#893 w8: the committed finalization-summary.md must name ' + strayRel + ' in its ## Sink Findings — a report that exists only on stdout leaves the record silent; got ' + JSON.stringify(summaryAtHead));
  } finally {
    cleanup(fx);
  }
})();

// (w9) NEW BEHAVIOUR. The report's bound. A sibling's interrupted-sink receipt is the one sibling
// archive path that does NOT block this sink (#715 exempts it by exact path), so it is the only way
// to observe the report's scope on a run that actually reaches archive_commit: the sink must neither
// commit it nor name it. Reporting a path this sink never touched would be a different lie from
// staying silent about one it did, and equally worth catching.
(function testArchivedPathsReportIsScopedToThisProject() {
  console.log('Test (#893 w9): the committed-paths report covers THIS project only — a sibling\'s archive receipt is neither committed nor named, and is left byte-untouched');
  const project = 'issue-89309';
  const issue = 89309;
  const sibling = 'issue-89399';
  const mirror = archiveMirrorFiles(project, issue);
  const siblingReceiptRel = 'kaola-workflow/archive/' + sibling + '/.cache/sink-receipt.json';
  const siblingBytes = JSON.stringify({ project: sibling, steps: { merge: 'done' } }, null, 2) + '\n';
  const plant = Object.assign(mirrorPlant(project, mirror), { [siblingReceiptRel]: siblingBytes });
  const fx = buildKeepWorktreeArchiveMirrorFixture(project, issue, { plant });
  fx.projectName = project;
  try {
    const result = runSink(fx, ['--issue', String(issue)]);
    const out = lastJson(result);

    assert(result.status === 0, '#893 w9: the sibling receipt is #715-exempt, so the sink must still complete; got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out && out.status === 'sinked', '#893 w9: status must be sinked; got ' + JSON.stringify(out && (out.status || out.reason)));

    const reported = out && out.receipt && out.receipt.archived_paths;
    assert(Array.isArray(reported), '#893 w9: receipt.archived_paths must be an array; got ' + JSON.stringify(reported));
    assert(Array.isArray(reported) && reported.includes('kaola-workflow/archive/' + project + '/mission-list.md'),
      '#893 w9: the report must still name this project\'s own committed paths; got ' + JSON.stringify(reported));
    assert(Array.isArray(reported) && !reported.includes(siblingReceiptRel),
      '#893 w9: receipt.archived_paths must NOT name ' + siblingReceiptRel + ' — this sink never touched another project\'s file, and must not claim to have committed one; got ' + JSON.stringify(reported));
    assert(showAtHead(fx.tmpRoot, siblingReceiptRel) === null,
      '#893 w9: the sibling receipt must NOT be committed at HEAD; got ' + JSON.stringify(showAtHead(fx.tmpRoot, siblingReceiptRel)));
    const siblingAbs = path.join(fx.tmpRoot, siblingReceiptRel);
    assert(fs.existsSync(siblingAbs) && fs.readFileSync(siblingAbs, 'utf8') === siblingBytes,
      '#893 w9: the sibling receipt must be left byte-untouched on disk');
  } finally {
    cleanup(fx);
  }
})();

// (w10) NEW BEHAVIOUR. The shape where the sink commits nothing under the archive path at all. The
// report must be PRESENT and EMPTY, never absent: a consumer that has to distinguish "committed
// nothing" from "this sink does not report" cannot rely on the field, and the difference between an
// empty list and a missing one is exactly the silence the report exists to close.
//
// The fixture is (#832 q)'s — a consumer whose .gitignore covers the archive band, so git REFUSES
// the archive pathspec and `archive_commit` records `skipped_gitignored`. That is the real shape in
// which this sink commits nothing under the archive; an empty plant is NOT, because the sink writes
// its own finalization-summary.md there and commits that. Asserting against a shape production never
// produces is how a suite ends up pinning fiction, so the emptiness here is a measured emptiness.
(function testArchivedPathsReportIsEmptyNotAbsentWhenNothingIsCommitted() {
  console.log('Test (#893 w10): when git refuses the ignored archive band and the sink commits nothing there, receipt.archived_paths must be present and EMPTY, never undefined — absent and empty are different answers and only one is a report');
  const project = 'issue-89310';
  const issue = 89310;
  const fx = buildGitignoredArchiveSinkFixture(project, issue);
  try {
    const result = runSink(fx, ['--issue', String(issue)]);
    const out = lastJson(result);

    assert(result.status === 0, '#893 w10: the sink must still complete on an archive-ignoring consumer; got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out && out.status === 'sinked', '#893 w10: status must be sinked; got ' + JSON.stringify(out && (out.status || out.reason)));
    // Precondition — the emptiness is real: git genuinely committed nothing under the archive band.
    const tree = git(fx.tmpRoot, ['ls-tree', '-r', '--name-only', 'HEAD']).stdout || '';
    assert(!/kaola-workflow\/archive\//.test(tree),
      '#893 w10 precondition: nothing under kaola-workflow/archive/ may have reached HEAD, or the empty report would be a lie about a non-empty commit; got:\n' + tree);

    const reported = out && out.receipt && out.receipt.archived_paths;
    assert(Array.isArray(reported),
      '#893 w10: receipt.archived_paths must be PRESENT even when nothing was committed — absent and empty are different answers, and only one of them is a report; got ' + JSON.stringify(reported));
    assert(Array.isArray(reported) && reported.length === 0,
      '#893 w10: receipt.archived_paths must be EMPTY when archive_commit committed nothing; got ' + JSON.stringify(reported));
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
//   opts.gitignoreBody — the consumer's root .gitignore, the ONE axis the (y1)–(y4) #901 legs vary.
//     Defaults to the archive band, i.e. (q)'s own fixture unchanged.
//   opts.cacheFiles — { <name>: <content> } written into the archive's own .cache/. Defaults to
//     (q)'s single evidence file; the #901 legs pass the five the incident names. A name may contain
//     `/` (its parent is created) and may carry leading/trailing whitespace or an embedded newline —
//     those are legal pathname bytes and (y7) turns on them.
//   opts.cacheSymlinks — { <name>: <target> } created with symlinkSync inside the archive's .cache/,
//     after the regular files so a link may point at one. (y8) turns on these.
function buildGitignoredArchiveSinkFixture(project, issue, opts) {
  const o = opts || {};
  const gitignoreBody = o.gitignoreBody || 'kaola-workflow/archive/\n';
  const cacheFiles = o.cacheFiles || { 'n1-impl.md': 'binding: n1-impl nonce83203\nverdict: pass\n' };
  const tmpRoot = makeTmpRoot();
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-mock-'));
  const logFile = path.join(binDir, 'gh-calls.log');
  const branch = 'workflow/' + project;
  const remotePath = initGitRepoWithBareRemote(tmpRoot);
  writeGhMock(binDir, logFile);

  // main: the consumer's .gitignore covers the archive band + roadmap source/mirror.
  fs.writeFileSync(path.join(tmpRoot, '.gitignore'), gitignoreBody);
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
  for (const name of Object.keys(cacheFiles)) {
    const dest = path.join(archiveDir, '.cache', name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, cacheFiles[name]);
  }
  for (const name of Object.keys(o.cacheSymlinks || {})) {
    fs.symlinkSync(o.cacheSymlinks[name], path.join(archiveDir, '.cache', name));
  }

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

// --------------------------------------------------------------------------- (y1)–(y6) #901
//
// (q) above covers a rule over the whole archive BAND. A consumer's common basename rule `.cache/`
// is a DIFFERENT question at a different granularity: it leaves the archive DIRECTORY un-ignored
// (measured: check-ignore exits 1) while covering every evidence file beneath it. The dir probe
// therefore answered "not ignored", the honest-skip arm never fired, `git add <archive>/` exited 1
// with git's ignore report while STILL writing the non-ignored siblings to the index, and both add
// sites sat inside `catch (_) {}`. The run reported steps.archive_commit "done" at exit 0 over an
// archive commit carrying 3 of its 8 files, with archived_paths naming the 3 survivors as the whole
// set — and no code path could have noticed.
//
// Two independent reasons no test in this corpus could catch that shape, and both are what these
// pins are built against:
//   1. Every .gitignore fixture writes the archive band, an ANCHORED `/.cache/` (which matches only
//      the repo root), or `kaola-workflow/` wholesale. None matches an archive .cache SUBTREE.
//   2. No assertion anywhere checks that an archived .cache file became a git BLOB. The one ls-files
//      assertion touching an archive .cache checks the INVERSE (#520: journals stay untracked). So
//      even a fixture that had the rule would have passed — a disk probe cannot see this defect.
// Hence: the fixture body is exactly `.cache/`, and every durability clause below reads `ls-tree`,
// never the disk.
const CACHE_EVIDENCE_901 = {
  'final-validation.md': '# Final Validation\n\nall four chains green\n',
  'doc-updater.md': '# Doc Updater\n\nREADME + CHANGELOG updated\n',
  'doc-docking.md': '# Doc Docking\n\ndocked into docs/api.md\n',
  'run-gaps-manual.md': '# Run Gaps (manual)\n\nnone\n',
  'run-gaps.json': '{"gaps":[]}\n',
};
function cacheEvidenceRel(archiveRel) {
  return Object.keys(CACHE_EVIDENCE_901).map(n => archiveRel + '/.cache/' + n).sort();
}

// (y1) and (y2) are held to ONE assertion set so neither the ignored leg nor its control can end up
// checked more weakly than the other — the same discipline assertArchiveFailureStopsTheSink applies
// to the two archive-failure doors. `opts.expectForced` is the only thing that differs, and it is
// the axis: under an irrelevant rule nothing may be force-added at all.
function assertArchivedEvidenceIsDurable(fx, label, opts) {
  const o = opts || {};
  const out = o.out;
  const archiveRel = 'kaola-workflow/archive/' + fx.projectName;
  const want = cacheEvidenceRel(archiveRel);

  assert(o.exit === 0, label + ': the sink must complete; got exit ' + o.exit
    + '\nstdout: ' + o.stdout + '\nstderr: ' + o.stderr);
  assert(out && out.status === 'sinked', label + ': status must be sinked; got ' + JSON.stringify(out && out.status));
  // The token lives on steps.archive_commit. receipt.archive_commit is UNDEFINED in this posture (it
  // is only ever assigned 'skipped_gitignored' or 'failed'), so asserting that field instead would
  // pass against anything at all.
  const steps = (out && out.receipt && out.receipt.steps) || {};
  assert(steps.archive_commit === 'done', label + ': steps.archive_commit must be "done"; got '
    + JSON.stringify(steps.archive_commit) + '\nsteps: ' + JSON.stringify(steps));

  // THE clause #901 turns on: each evidence file is a BLOB in the published commit, not a file on
  // disk. This is the one assertion whose absence let the incident ship.
  const blobs = blobsUnder(fx.tmpRoot, 'HEAD', archiveRel);
  const notBlobs = want.filter(p => !blobs.includes(p));
  assert(notBlobs.length === 0, label + ': every archived .cache evidence file must be a BLOB at HEAD'
    + ' (on-disk presence is what the broken sink already satisfied); missing ' + JSON.stringify(notBlobs)
    + '\nblobs under ' + archiveRel + ': ' + JSON.stringify(blobs));

  // ...and the archive commit carries the WHOLE archive. 3 of 8 was the incident's own number.
  const archiveSha = archiveCommitOf(fx.tmpRoot, fx.projectName);
  assert(archiveSha != null, label + ': the archive commit must exist; git log carries no '
    + '"chore: archive ' + fx.projectName + ' [sink]" subject');
  const inCommit = pathsInCommit(fx.tmpRoot, archiveSha).filter(p => p.startsWith(archiveRel + '/'));
  assert(inCommit.length === 8, label + ': the archive commit must carry all 8 archive files, not the 3'
    + ' non-ignored survivors; got ' + inCommit.length + ': ' + JSON.stringify(inCommit));

  // archived_paths becomes the durable record via persistArchivedPathsToSummary. A complete-looking
  // list of an incomplete archive is what the incident wrote into the archive it had just truncated.
  const named = (out && out.receipt && out.receipt.archived_paths) || [];
  const unnamed = want.filter(p => !named.includes(p));
  assert(unnamed.length === 0, label + ': archived_paths must name every evidence file the commit'
    + ' carries; unnamed ' + JSON.stringify(unnamed) + '\narchived_paths: ' + JSON.stringify(named));

  // "Durable" is a claim about a FRESH CLONE, so make a fresh clone the witness rather than inferring
  // it from the local tree.
  const cloneDir = fx.tmpRoot + '-clone';
  try {
    G.clone(fx.remotePath, cloneDir, ['-q']);
    const cloned = blobsUnder(cloneDir, 'HEAD', archiveRel);
    const gone = want.filter(p => !cloned.includes(p));
    assert(gone.length === 0, label + ': the evidence must survive a fresh clone of the pushed remote;'
      + ' missing ' + JSON.stringify(gone) + '\nthe clone carries: ' + JSON.stringify(cloned));
  } finally { try { fs.rmSync(cloneDir, { recursive: true, force: true }); } catch (_) {} }

  // #520 under the force-add: forcing paths past the consumer's rule is the ONE new way a transaction
  // journal could leak into a commit, so neither the forced list nor the tracked tree may hold one.
  const forced = (out && out.receipt && out.receipt.archive_forced_paths);
  assert(!(forced || []).some(p => /\/sink-(?:receipt|fallback)\.json$/.test(p)),
    label + ': #520 — archive_forced_paths must never name a transaction journal; got ' + JSON.stringify(forced));
  const trackedJournals = git(fx.tmpRoot, ['ls-files', '--', '*/sink-receipt.json', '*/sink-fallback.json']).stdout.trim();
  assert(trackedJournals === '', label + ': #520 — no sink journal may be tracked after the archive'
    + ' commit; got:\n' + trackedJournals);

  if (o.expectForced) {
    assert(JSON.stringify((forced || []).slice().sort()) === JSON.stringify(want),
      label + ': archive_forced_paths must name exactly the ignored evidence files — overriding a rule'
      + ' the consumer wrote is recorded, never silent; got ' + JSON.stringify(forced) + '\nwant ' + JSON.stringify(want));
  } else {
    assert(forced === undefined, label + ': nothing here is ignored, so no path may be force-added at'
      + ' all; got ' + JSON.stringify(forced));
  }
}

// (y1)/(y2) The defect and its single-axis control. The ONLY difference between these two runs is the
// body of the consumer's root .gitignore.
(function testBasenameCacheRuleStillCommitsArchiveEvidence901() {
  console.log('Test (#901 y1): a consumer whose .gitignore carries the basename rule ".cache/" must still get its run evidence into the archive commit — asserted as BLOBS at HEAD and in a fresh clone, never as files on disk');
  const project = 'issue-90101';
  const issue = 90101;
  const fx = buildGitignoredArchiveSinkFixture(project, issue, {
    gitignoreBody: '.cache/\n', cacheFiles: CACHE_EVIDENCE_901,
  });
  try {
    // Precondition — the granularity mismatch is really present in this fixture: the archive DIR is
    // not ignored (exit 1) while a file beneath it is (exit 0). Without this the leg could pass for
    // the wrong reason, e.g. a rule that never matched anything.
    assert(git(fx.tmpRoot, ['check-ignore', '-q', '--', 'kaola-workflow/archive/' + project]).status === 1,
      '#901 y1: precondition — a basename rule must leave the archive DIRECTORY un-ignored (that is why the dir probe answered "not ignored")');
    assert(git(fx.tmpRoot, ['check-ignore', '-q', '--', 'kaola-workflow/archive/' + project + '/.cache/run-gaps.json']).status === 0,
      '#901 y1: precondition — the same rule must cover a FILE beneath the archive');

    const result = runSink(fx, ['--issue', String(issue)]);
    assertArchivedEvidenceIsDurable(fx, '#901 y1 IGNORED', {
      out: lastJson(result), exit: result.status, stdout: result.stdout, stderr: result.stderr,
      expectForced: true,
    });
  } finally {
    cleanup(fx);
  }
})();

(function testIrrelevantIgnoreRuleIsUnchanged901() {
  console.log('Test (#901 y2): the single-axis control — an irrelevant .gitignore rule leaves the archive commit exactly as before and force-adds nothing');
  const project = 'issue-90102';
  const issue = 90102;
  const fx = buildGitignoredArchiveSinkFixture(project, issue, {
    gitignoreBody: 'node_modules/\n', cacheFiles: CACHE_EVIDENCE_901,
  });
  try {
    assert(git(fx.tmpRoot, ['check-ignore', '-q', '--', 'kaola-workflow/archive/' + project + '/.cache/run-gaps.json']).status === 1,
      '#901 y2: precondition — the control rule must cover nothing under the archive');
    const result = runSink(fx, ['--issue', String(issue)]);
    assertArchivedEvidenceIsDurable(fx, '#901 y2 CONTROL', {
      out: lastJson(result), exit: result.status, stdout: result.stdout, stderr: result.stderr,
      expectForced: false,
    });
  } finally {
    cleanup(fx);
  }
})();

// (y3) The #832 decision is preserved, and sharpened: force-add and honest-skip are mutually
// exclusive. A band rule is a consumer saying "no tracked archives at all", so overriding it would
// be the opposite of honoring it — and nothing pinned that they stay exclusive.
(function testArchiveBandRuleKeepsHonestSkipAndNeverForceAdds901() {
  console.log('Test (#901 y3 / #832): a rule over the whole archive band keeps its honest skip — skipped_gitignored, exit 0, NO force-add, archive retained on disk — and now itemizes every required file the skip leaves uncommitted');
  const project = 'issue-90103';
  const issue = 90103;
  const fx = buildGitignoredArchiveSinkFixture(project, issue, {
    gitignoreBody: 'kaola-workflow/archive/\n', cacheFiles: CACHE_EVIDENCE_901,
  });
  try {
    const result = runSink(fx, ['--issue', String(issue)]);
    const out = lastJson(result);
    const archiveRel = 'kaola-workflow/archive/' + project;
    const receipt = (out && out.receipt) || {};

    assert(result.status === 0, '#901 y3: the honest skip must still complete; got exit ' + result.status
      + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out && out.status === 'sinked', '#901 y3: status must be sinked; got ' + JSON.stringify(out && out.status));
    assert(receipt.archive_commit === 'skipped_gitignored',
      '#901 y3: the band rule must still record skipped_gitignored; got ' + JSON.stringify(receipt.archive_commit));
    assert(receipt.archive_forced_paths === undefined,
      '#901 y3: the force-add must be DECLINED when the rule covers the whole band; got ' + JSON.stringify(receipt.archive_forced_paths));
    assert(blobsUnder(fx.tmpRoot, 'HEAD', archiveRel).length === 0,
      '#901 y3: nothing under the ignored archive may reach HEAD; got '
        + JSON.stringify(blobsUnder(fx.tmpRoot, 'HEAD', archiveRel)));

    // What the skip gained is the inventory: every required file it leaves uncommitted, named.
    // "Announced" was already true; itemized was not.
    const missing = receipt.archive_missing_paths || [];
    const want = cacheEvidenceRel(archiveRel);
    assert(missing.length === 8 && want.every(p => missing.includes(p)),
      '#901 y3: the skip must itemize all 8 uncommitted required files; got ' + JSON.stringify(missing));

    // ...and it still does not destroy the archive it declined to commit.
    for (const name of Object.keys(CACHE_EVIDENCE_901)) {
      assert(fs.existsSync(path.join(fx.archiveDir, '.cache', name)),
        '#901 y3: the on-disk archive must survive an honest skip; ' + name + ' is gone');
    }
  } finally {
    cleanup(fx);
  }
})();

// (y4) The armed-gate pin. A happy path cannot tell the per-path blob verdict from a no-op: it is
// green either way once the force-add works. Break the force-add on ONE required file and the gate
// has to be the thing that speaks.
(function testPartiallyCommittedArchiveRefusesAndRetainsEverything901() {
  console.log('Test (#901 y4): with one required evidence file unreadable the force-add cannot take — the sink must refuse sink_incomplete, name every missing path, surface the git add failure that used to be swallowed, and retain the branch and the on-disk archive');
  const project = 'issue-90104';
  const issue = 90104;
  const fx = buildGitignoredArchiveSinkFixture(project, issue, {
    gitignoreBody: '.cache/\n', cacheFiles: CACHE_EVIDENCE_901,
  });
  const archiveRel = 'kaola-workflow/archive/' + project;
  const blocked = path.join(fx.archiveDir, '.cache', 'run-gaps.json');
  try {
    // The ONE axis versus (y1): a required file git cannot index. Verified in-fixture rather than
    // assumed — a chmod that silently did not take would turn this pin into a second happy path.
    fs.chmodSync(blocked, 0o000);
    let stillReadable = true;
    try { fs.readFileSync(blocked); } catch (_) { stillReadable = false; }
    assert(!stillReadable,
      '#901 y4: arming axis — the required file must be genuinely unreadable, else this leg proves nothing');

    const result = runSink(fx, ['--issue', String(issue)]);
    const out = lastJson(result);

    assert(result.status === 1, '#901 y4: a partially committed archive must exit 1; got ' + result.status
      + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out && out.result === 'refuse' && out.reason === 'sink_incomplete' && out.step === 'archive_commit',
      '#901 y4: must emit result:refuse reason:sink_incomplete step:archive_commit; got ' + JSON.stringify(out));
    assert(!(out && out.status === 'sinked'),
      '#901 y4: status must NOT be sinked over an archive the commit does not carry; got ' + JSON.stringify(out && out.status));

    // Left NOT done, so a re-run retries the step rather than skipping it as already satisfied. A
    // refusal envelope carries no `receipt` key at all, so reading out.receipt.steps here would be
    // vacuous — the surviving on-disk journal is the record, and the refusal returns before the #653
    // disposal precisely so it survives.
    const journal = path.join(fx.archiveDir, '.cache', 'sink-receipt.json');
    assert(findSinkJournal(fx.tmpRoot, project) === journal,
      '#901 y4: the refusal must leave its journal on disk at ' + journal + '; found '
        + JSON.stringify(findSinkJournal(fx.tmpRoot, project)));
    // Read defensively: a sink that DISPOSED of its journal (i.e. completed) must fail these clauses
    // as assertions, not abort the suite before the scenarios after this one get to run.
    let persisted = null;
    try { persisted = JSON.parse(fs.readFileSync(journal, 'utf8')); } catch (_) { persisted = null; }
    assert(persisted && persisted.steps && persisted.steps.archive_commit !== 'done',
      '#901 y4: the journal must leave steps.archive_commit NOT done so a re-run retries it; got '
        + JSON.stringify(persisted && persisted.steps));
    assert(persisted && persisted.archive_commit === 'failed',
      '#901 y4: the journal must record archive_commit:"failed"; got '
        + JSON.stringify(persisted && persisted.archive_commit));
    assert(persisted && Array.isArray(persisted.archive_missing_paths) && persisted.archive_missing_paths.length > 0,
      '#901 y4: the journal must itemize the missing paths durably, not only on the envelope; got '
        + JSON.stringify(persisted && persisted.archive_missing_paths));

    // EVERY missing required path is named — a count is not a diagnosis.
    const missing = (out && out.archive_missing_paths) || [];
    const want = cacheEvidenceRel(archiveRel);
    assert(want.every(p => missing.includes(p)),
      '#901 y4: archive_missing_paths must name every required path absent from the commit; got '
        + JSON.stringify(missing) + '\nwant all of ' + JSON.stringify(want));

    // ...and the signal `catch (_) {}` used to throw away rides the envelope. It is the diagnosis for
    // WHY the paths are absent, and it was the only evidence git ever produced.
    const addErrors = (out && out.archive_add_errors) || [];
    assert(addErrors.length > 0 && addErrors.some(e => /git add/.test(String(e))),
      '#901 y4: the swallowed git add failure must reach archive_add_errors; got ' + JSON.stringify(addErrors));

    // #520 stays subtracted even on this path: the journal asserted above is on disk under the
    // archive .cache and IS covered by the consumer's rule — and must still be neither demanded of
    // the commit nor tracked. This is the leg where that is observable rather than vacuous, since a
    // terminally successful sink disposes of its journal before anything can look.
    assert(!missing.some(p => /sink-(?:receipt|fallback)\.json$/.test(p)),
      '#901 y4: #520 — a transaction journal must never be demanded of the archive commit; got ' + JSON.stringify(missing));
    assert(git(fx.tmpRoot, ['ls-files', '--', '*/sink-receipt.json', '*/sink-fallback.json']).stdout.trim() === '',
      '#901 y4: #520 — no journal may be tracked');

    // The refusal destroys nothing recoverable: it returns BEFORE teardown, so the branch and the
    // on-disk archive both survive and a re-run can retry.
    assert(git(fx.tmpRoot, ['rev-parse', '--verify', fx.branch]).status === 0,
      '#901 y4: the feature branch must be RETAINED by the refusal');
    for (const name of Object.keys(CACHE_EVIDENCE_901)) {
      assert(fs.existsSync(path.join(fx.archiveDir, '.cache', name)),
        '#901 y4: the on-disk archive must survive the refusal; ' + name + ' is gone');
    }
  } finally {
    try { fs.chmodSync(blocked, 0o644); } catch (_) {}
    cleanup(fx);
  }
})();

// (y5)/(y6) The OTHER archiver posture. (y1)–(y4) run with receipt.archive_dest unset, which is where
// the #700 completeness guard is dormant; here the sink archives the folder itself, the dest IS set
// and that guard is live — and the incident lost the same files anyway, because a partially committed
// archive still yields a `tree` for cat-file. The live folder's evidence is branch-tracked here, so
// the pre-fix commit stages the DELETION of the live copies without adding the archive ones.
(function testSoleArchiverPostureCommitsIgnoredEvidence901() {
  console.log('Test (#901 y5/y6): sole-archiver posture (archive_dest SET, so the #700 completeness guard is live) — a basename .cache/ rule must not clip the run evidence out of the collision-suffixed archive commit; irrelevant-rule control alongside');
  for (const leg of [
    { label: '#901 y5 IGNORED', project: 'issue-90105', issue: 90105, body: '.cache/\n', expectForced: true },
    { label: '#901 y6 CONTROL', project: 'issue-90106', issue: 90106, body: 'node_modules/\n', expectForced: false },
  ]) {
    const fx = buildSoleArchiverFixture(leg.project, leg.issue, {
      gitignoreBody: leg.body, liveCacheFiles: CACHE_EVIDENCE_901,
    });
    fx.projectName = leg.project;
    try {
      const result = runSink(fx, ['--issue', String(leg.issue)]);
      const out = lastJson(result);
      const receipt = (out && out.receipt) || {};

      assert(result.status === 0, leg.label + ': the sink must complete; got exit ' + result.status
        + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
      assert(out && out.status === 'sinked', leg.label + ': status must be sinked; got ' + JSON.stringify(out && out.status));
      assert(typeof receipt.archive_dest === 'string' && receipt.archive_dest.length > 0,
        leg.label + ': precondition — this posture must record an archive_dest, which is what makes the'
        + ' #700 completeness guard live; got ' + JSON.stringify(receipt.archive_dest));

      const archRel = suffixedArchiveRel(fx.tmpRoot, leg.project) || receipt.archive_dest;
      const want = cacheEvidenceRel(archRel);
      const blobs = blobsUnder(fx.tmpRoot, 'HEAD', archRel);
      const notBlobs = want.filter(p => !blobs.includes(p));
      assert(notBlobs.length === 0, leg.label + ': every .cache evidence file must be a BLOB at HEAD under '
        + archRel + '; missing ' + JSON.stringify(notBlobs) + '\nblobs: ' + JSON.stringify(blobs));

      const named = receipt.archived_paths || [];
      assert(want.every(p => named.includes(p)), leg.label + ': archived_paths must name the evidence it'
        + ' committed; got ' + JSON.stringify(named));

      if (leg.expectForced) {
        assert(JSON.stringify((receipt.archive_forced_paths || []).slice().sort()) === JSON.stringify(want),
          leg.label + ': archive_forced_paths must name exactly the ignored evidence files; got '
            + JSON.stringify(receipt.archive_forced_paths) + '\nwant ' + JSON.stringify(want));
      } else {
        assert(receipt.archive_forced_paths === undefined,
          leg.label + ': nothing is ignored here, so no path may be force-added; got '
            + JSON.stringify(receipt.archive_forced_paths));
      }

      // The archive move RENAMED tracked live paths, so a commit that adds the archive copies without
      // the matching deletions (or the reverse) leaves main dirty after status:sinked.
      const st = git(fx.tmpRoot, ['status', '--porcelain']).stdout.trim();
      assert(st === '', leg.label + ': main must be clean after status:sinked; got:\n' + st);
    } finally {
      cleanup(fx);
    }
  }
})();

// (y7) The repair the guard exists to perform must actually REACH the file it refuses over. `-z` was
// chosen so a pathname is never mangled, and then its output was `.trim()`ed — while the required set
// is built from readdirSync, which preserves the name exactly. So an archive file named `notes.md `
// (one trailing space) could never match the ignored-untracked set, was never force-added, and was
// then refused over: three consecutive re-runs produced the identical `sink_incomplete`. A refusal
// that says "a re-run retries it" over a deterministic computation is a bricked repository.
//
// The failure mode was OVER-refusal, so the naive fix weakens the guard until it stops firing. The
// non-regression shapes therefore ride in the SAME fixture rather than a separate green run: non-ASCII,
// an embedded newline, a nested directory and a 0-byte file all have to land as blobs too, so a fix
// that simply stopped requiring awkward names would fail here.
(function testWhitespaceBearingArchiveNameSinksOnTheFirstRun901() {
  console.log('Test (#901 y7): an archive filename carrying trailing whitespace must be force-added and land as a BLOB on the FIRST run — the -z readers are NUL-split only, never trimmed, and the non-ASCII / embedded-newline / nested / 0-byte shapes must not regress');
  const project = 'issue-90107';
  const issue = 90107;
  // Every name is a legal pathname; the trailing space in 'notes.md ' is the axis. `deep/x.md` is the
  // nested shape and `zero.md` the 0-byte one.
  const names = {
    'plain.md': 'plain evidence\n',
    'notes.md ': 'trailing space in the NAME, not the content\n',
    'ünïcödé-日本.md': 'non-ASCII name\n',
    'a\nb.md': 'embedded newline in the name\n',
    'deep/x.md': 'nested evidence\n',
    'zero.md': '',
  };
  const fx = buildGitignoredArchiveSinkFixture(project, issue, {
    gitignoreBody: '.cache/\n', cacheFiles: names,
  });
  const archiveRel = 'kaola-workflow/archive/' + project;
  const want = Object.keys(names).map(n => archiveRel + '/.cache/' + n).sort();
  try {
    // Precondition — the space really is on disk, and git really does report it raw under `-z`. A
    // fixture whose filesystem silently normalized the name would make the whole leg vacuous.
    assert(fs.readdirSync(path.join(fx.archiveDir, '.cache')).includes('notes.md '),
      '#901 y7: precondition — the space-bearing name must exist on disk verbatim; got '
        + JSON.stringify(fs.readdirSync(path.join(fx.archiveDir, '.cache'))));
    const ignoredRaw = git(fx.tmpRoot, ['ls-files', '-o', '-i', '--exclude-standard', '-z', '--', archiveRel]).stdout || '';
    assert(ignoredRaw.split('\0').filter(Boolean).includes(archiveRel + '/.cache/notes.md '),
      '#901 y7: precondition — git must report the ignored path with its space intact under -z; got '
        + JSON.stringify(ignoredRaw.split('\0').filter(Boolean)));

    const result = runSink(fx, ['--issue', String(issue)]);
    const out = lastJson(result);

    // CONVERGENCE: the first run must suffice. This is the whole point — the defect was not that the
    // sink failed once, it is that it could never succeed. (A second --sink on an already-sinked
    // fixture exits 1 at push_upstream for reasons that predate this and are the same for plain
    // names, so re-running here would measure that instead and is deliberately not asserted.)
    assert(result.status === 0, '#901 y7: the sink must converge on the FIRST run; got exit ' + result.status
      + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out && out.status === 'sinked', '#901 y7: status must be sinked; got ' + JSON.stringify(out && out.status));
    assert(!(out && out.reason), '#901 y7: no refusal reason may be emitted; got ' + JSON.stringify(out && out.reason));
    assert(out && out.receipt && out.receipt.archive_missing_paths === undefined,
      '#901 y7: nothing may be reported missing — the over-refusal is what this pins; got '
        + JSON.stringify(out && out.receipt && out.receipt.archive_missing_paths));

    // ...and every name, the space-bearing one included, is a BLOB in the published commit. Read
    // through ls-tree -z with NUL-split only: an assertion that trimmed its own input could not tell
    // "the space survived" from "the space was lost".
    const blobs = blobsUnder(fx.tmpRoot, 'HEAD', archiveRel);
    const notBlobs = want.filter(p => !blobs.includes(p));
    assert(notBlobs.length === 0, '#901 y7: every archived evidence name must be a BLOB at HEAD; missing '
      + JSON.stringify(notBlobs) + '\nblobs: ' + JSON.stringify(blobs));

    // The force-add must NAME the space-bearing path with its space — that set is what the trim
    // mismatch emptied, and it is the direct measurement that the repair reached the file.
    const forced = (out && out.receipt && out.receipt.archive_forced_paths) || [];
    assert(forced.includes(archiveRel + '/.cache/notes.md '),
      '#901 y7: archive_forced_paths must name the space-bearing path verbatim; got ' + JSON.stringify(forced));
    assert(JSON.stringify(forced.slice().sort()) === JSON.stringify(want),
      '#901 y7: archive_forced_paths must name exactly the ignored evidence set; got '
        + JSON.stringify(forced) + '\nwant ' + JSON.stringify(want));

    // #520 still subtracted: the journal appears in the ignored set and must never be force-added.
    assert(!forced.some(p => /\/sink-(?:receipt|fallback)\.json$/.test(p)),
      '#901 y7: #520 — no journal may be force-added; got ' + JSON.stringify(forced));
  } finally {
    cleanup(fx);
  }
})();

// (y8) A symlink in the archive. The exclusion that produced this rested on an in-comment claim that
// neither a symlink nor its target becomes a blob under the archive path — and that claim is false:
// `git add -f` stages a symlink as a mode-120000 blob whose content is the target string. So a
// gitignored symlink was dropped from the required set, nothing forced it in, nothing missed it, and
// the run reported steps.archive_commit:"done" at exit 0 over an entry a fresh clone did not carry.
//
// `steps.archive_commit === 'done'` is therefore USELESS as the pin here — the bug already satisfied
// it — and so is anything that reads the run's own working tree, where the symlink was present the
// whole time. What separates the two is the published commit and a clone made from it.
(function testGitignoredArchiveSymlinkSurvivesAFreshClone901() {
  console.log('Test (#901 y8): a gitignored SYMLINK in the archive must reach the commit as a 120000 blob and survive a FRESH CLONE — "done" at exit 0 is what the defect already reported, and the run\'s own disk held the symlink throughout');
  const project = 'issue-90108';
  const issue = 90108;
  const fx = buildGitignoredArchiveSinkFixture(project, issue, {
    gitignoreBody: '.cache/\n',
    cacheFiles: { 'plain.md': 'plain evidence\n' },
    cacheSymlinks: { 'link.md': 'plain.md' },
  });
  const archiveRel = 'kaola-workflow/archive/' + project;
  const linkRel = archiveRel + '/.cache/link.md';
  try {
    // Preconditions: it really is a symlink, and the consumer's rule really does cover it (so the
    // force-add is the only way it can land).
    assert(fs.lstatSync(path.join(fx.archiveDir, '.cache', 'link.md')).isSymbolicLink(),
      '#901 y8: precondition — the fixture entry must be a symlink');
    assert(git(fx.tmpRoot, ['check-ignore', '-q', '--', linkRel]).status === 0,
      '#901 y8: precondition — the consumer rule must cover the symlink, else nothing needs forcing');

    const result = runSink(fx, ['--issue', String(issue)]);
    const out = lastJson(result);
    assert(result.status === 0, '#901 y8: the sink must complete; got exit ' + result.status
      + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out && out.status === 'sinked', '#901 y8: status must be sinked; got ' + JSON.stringify(out && out.status));

    // THE pin, half one: the symlink is an entry in the published commit, at mode 120000. Asserting
    // mere path presence would not distinguish a symlink from a regular file, and the mode is the
    // measured fact the false comment denied.
    const entries = treeEntriesUnder(fx.tmpRoot, 'HEAD', archiveRel);
    const linkEntry = entries.find(e => e.path === linkRel) || null;
    assert(linkEntry != null, '#901 y8: the symlink must be an entry in the commit at HEAD; entries: '
      + JSON.stringify(entries.map(e => e.mode + ' ' + e.path)));
    // Read defensively throughout this scenario: when the symlink is absent from the commit — the
    // defect's own shape — every later clause must still report as an assertion rather than abort the
    // suite before the fresh-clone clause, which is the one that matters most, gets to run.
    assert(linkEntry != null && linkEntry.mode === '120000',
      '#901 y8: the symlink must be recorded as a 120000 blob; got ' + JSON.stringify(linkEntry));
    assert(out && out.receipt && (out.receipt.archive_forced_paths || []).includes(linkRel),
      '#901 y8: archive_forced_paths must name the force-added symlink; got '
        + JSON.stringify(out && out.receipt && out.receipt.archive_forced_paths));

    // THE pin, half two: a FRESH CLONE of the pushed remote holds it — as a symlink, pointing where it
    // pointed. This is the clause the defect failed while reporting success, and no probe of the run's
    // own tree can stand in for it.
    const cloneDir = fx.tmpRoot + '-clone';
    try {
      G.clone(fx.remotePath, cloneDir, ['-q']);
      const clonedLink = path.join(cloneDir, linkRel);
      const clonedBlobs = blobsUnder(cloneDir, 'HEAD', archiveRel);
      let isLink = false;
      let target = null;
      try { isLink = fs.lstatSync(clonedLink).isSymbolicLink(); } catch (_) { isLink = false; }
      try { target = fs.readlinkSync(clonedLink); } catch (_) { target = null; }
      assert(isLink, '#901 y8: the fresh clone must materialize it as a SYMLINK — this is the clause the'
        + ' defect failed while reporting archive_commit:"done" at exit 0; the clone holds '
        + JSON.stringify(clonedBlobs));
      assert(target === 'plain.md',
        '#901 y8: the cloned symlink must point where it pointed; got ' + JSON.stringify(target));
      assert(clonedBlobs.includes(linkRel),
        '#901 y8: the clone\'s own HEAD must carry the symlink as a blob; got ' + JSON.stringify(clonedBlobs));
    } finally { try { fs.rmSync(cloneDir, { recursive: true, force: true }); } catch (_) {} }
  } finally {
    cleanup(fx);
  }
})();

// (y9) The cheapest guard against the exact regression, at the source level: the `-z` readers must
// stay NUL-split ONLY. A `.trim()` here is invisible to every behavioural test whose fixtures use
// tidy filenames, which is precisely how it shipped — so the guard reads the bytes.
//
// Scoped to THIS edition's copies. `plugins/kaola-workflow/scripts/` is byte-identical by
// validate-script-sync, so asserting the canonical pair covers it; each forge port is defended by its
// own suite, because there is no cross-edition coverage comparison here.
(function testZReadersStayNulSplitOnly901() {
  console.log('Test (#901 y9): the -z readers in the shipped sink and claim scripts must split on NUL and nothing else — a .trim() here is invisible to any fixture with tidy filenames');
  const readers = [
    ['scripts/kaola-workflow-sink-merge.js', 'ignoredUntrackedUnder'],
    ['scripts/kaola-workflow-sink-merge.js', 'blobPathsUnder'],
    ['scripts/kaola-workflow-claim.js', 'ignoredArchiveEvidence'],
  ];
  for (const [rel, fnName] of readers) {
    const src = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
    const at = src.indexOf('function ' + fnName + '(');
    assert(at >= 0, '#901 y9: ' + rel + ' must still define ' + fnName + ' — if it was renamed or removed, '
      + 'this pin is stale and belongs deleted with its mechanism, not repaired');
    // The function body, bounded by the next top-level function declaration (or EOF), with whole-line
    // comments dropped. Stripping them matters: these readers CARRY a comment explaining why a
    // `.trim()` must never come back, and a guard that matched its own rationale would fail on the
    // correct code — measured, on the first run of this pin.
    const next = src.indexOf('\nfunction ', at + 1);
    const code = src.slice(at, next < 0 ? src.length : next)
      .split('\n').filter(line => !/^\s*\/\//.test(line)).join('\n');
    // Stated as the required FORM rather than a blocklist: NUL-split, then drop empty records, with
    // nothing in between. Dropping empties is the only normalization the stream needs (measured: it is
    // purely NUL-terminated, no trailing newline), so any step wedged in there is doing something the
    // `-z` flag was chosen to prevent.
    assert(/\.split\('\\0'\)\s*\.filter\(Boolean\)/.test(code),
      '#901 y9: ' + fnName + ' in ' + rel + " must read its -z output as .split('\\0').filter(Boolean) "
      + 'with nothing between the two. Code:\n' + code);
    assert(!/\.trim\(\)/.test(code),
      '#901 y9: ' + fnName + ' in ' + rel + ' must NOT trim a -z record — trimming destroys the '
      + 'leading/trailing whitespace -z exists to preserve, and made a run permanently unsinkable. Code:\n' + code);
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

    // Clause 2 — typed, on the envelope, greppable by classification. The result token must NOT read
    // `refuse`: that is the one distinction a converted stop draws against a KEEP guard, and a
    // consumer branching on `result === 'refuse'` is exactly who is misled if it regresses. Asserted
    // as the negative rather than as `=== 'report'` so the vocabulary can be renamed without a false
    // red, while a silent relapse to the refusal token still fails.
    assert(out && out.result && out.result !== 'refuse',
      '(s): a converted stop must not report itself as a refusal; got result=' + JSON.stringify(out && out.result));
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

    // Clause 2 — typed, on the envelope, with the evidence the old refusal prose carried. Same
    // not-a-refusal pin as (s): a docs-only branch is a legitimate deliverable the sink declined to
    // publish unasked, which is a report, and it must not read as a guard refusing to destroy.
    assert(out && out.result && out.result !== 'refuse',
      '(t): a converted stop must not report itself as a refusal; got result=' + JSON.stringify(out && out.result));
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

  // #980: optional WORKTREE posture. The staged-journal window only exists on a run whose linked
  // worktree gets removed, so the arms that measure it need the branch checked out at the canonical
  // .kw/worktrees/<project> path with worktree-ONLY (untracked) journal content inside it — content
  // that exists nowhere else, so "was it preserved" and "can it be found" are both answerable.
  let wtPath = null;
  if (opts.worktreeUntracked) {
    wtPath = path.join(tmpRoot, '.kw', 'worktrees', project);
    git(tmpRoot, ['worktree', 'add', wtPath, branch]);
    for (const rel of Object.keys(opts.worktreeUntracked)) {
      const abs = path.join(wtPath, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, opts.worktreeUntracked[rel]);
    }
  }

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

  return { tmpRoot, remotePath, binDir, logFile, branch, projectName: project, advanceDir, wtPath };
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
    // retries", which told the operator the wrong thing happened. Same not-a-refusal pin as (s)/(t):
    // a red suite is a verdict on the WORK, which is the class the sink no longer pronounces, so it
    // must not reach a consumer wearing the token reserved for guards that refuse to destroy.
    assert(out && out.result && out.result !== 'refuse',
      '(v): a converted stop must not report itself as a refusal; got result=' + JSON.stringify(out && out.result));
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

// --------------------------------------------------------------------------- (w) #980
//
// (v) drives the red stop; this drives the SAME stop on a worktree-postured run, where it opens a
// window (v)'s fixture has no worktree to expose. Both sink routes copy <wt>/kaola-workflow/<project>/
// into an OS tmpdir (kw-wtsync-*) and force-remove the worktree BEFORE the merge, then land the copy
// per-file (#707 h) only after the merge succeeds. Every stop between those two — this red gate, a
// red chain during FF recovery, a failed fast-forward, a rebase conflict, and the uncaught
// `git checkout` throw sitting between them — ended the process with the staged copy the ONLY
// surviving journal, parked under a generated name reported nowhere the operator would look, until
// OS tmp reaping took it. #619(4) is the same class for the destroy case.
//
// THE PIN IS DISCOVERABILITY, not a mechanism. Naming the path in the failure output, landing it into
// the archive band before stopping, and deferring the removal until the landing commits are all
// admissible answers; parking it silently is the one forbidden outcome. So the oracle asks only
// whether the journal is reachable from what the run said, or already sitting where the operator
// reads — never how it got there.
(function testStagedJournalIsFindableWhenTheSinkStopsBeforeLanding980() {
  console.log('Test (#980 w): a run that stages the worktree journal and then stops before landing it must leave the operator able to FIND the staged copy — not park it under a generated tmpdir name reported nowhere');
  const project = 'issue-87709';
  const issue = 87709;
  const NONCE = 'kw980-staged-journal-nonce-' + issue;
  const JOURNAL_REL = 'kaola-workflow/' + project + '/.cache/n7-worktree-only.md';
  const fx = buildPostRebaseGateFixture(project, issue, {
    testExit: 7,
    worktreeUntracked: {
      [JOURNAL_REL]: '# per-node evidence\n' + NONCE + '\n',
    },
  });
  try {
    if (!assertUnderTmpdir973('w', fx.tmpRoot)) return;

    // Premise 1 — the journal is genuinely worktree-ONLY, so finding it afterwards can only mean the
    // staged copy survived. This is the survival oracle's positive control.
    const preHits = filesContaining973(fx.tmpRoot, NONCE);
    assert(preHits.length === 1 && preHits[0].startsWith('.kw' + path.sep),
      '#980 (w) premise: before the run the NONCE must be found in exactly the ONE worktree copy; got '
      + JSON.stringify(preHits));
    assert(fs.existsSync(fx.wtPath),
      '#980 (w) premise: the linked worktree must exist before the sink runs; expected ' + fx.wtPath);

    const result = runSinkWithGate(fx, ['--issue', String(issue)]);
    const out = lastJson(result);
    const combined = String(result.stdout || '') + String(result.stderr || '');
    // The staged copy lands in os.tmpdir(), NOT under the fixture root — that displacement is the
    // whole defect — so "did the bytes survive" has to be asked of both places. Scoped to the
    // kw-wtsync-* prefix rather than a walk of the whole temp dir, and the NONCE is unique per issue,
    // so a stage left by a concurrent scenario cannot answer for this one.
    const stageDirs = (() => {
      try {
        return fs.readdirSync(os.tmpdir())
          .filter(n => n.startsWith('kw-wtsync-'))
          .map(n => path.join(os.tmpdir(), n));
      } catch (_) { return []; }
    })();
    const inFixture = filesContaining973(fx.tmpRoot, NONCE);
    const inStage = stageDirs.filter(d => filesContaining973(d, NONCE).length > 0);
    const survivors = inFixture.concat(inStage);
    const seen = 'exit=' + result.status
      + ' reason=' + JSON.stringify(out && out.reason)
      + ' worktree_still_present=' + fs.existsSync(fx.wtPath)
      + ' survivors=' + JSON.stringify(survivors)
      + '\nstderr: ' + String(result.stderr || '').slice(-1200);

    // Premise 2 — the run stopped for the reason this arm is about. A stop on some earlier
    // precondition never reaches the stage or the removal, and would satisfy the clause below while
    // measuring nothing (the failure mode (m) and (i) both carry premises against).
    assert(out && out.reason === 'chains_red',
      '#980 (w) premise: the run must stop at the RED post-rebase gate — that is the stop that opens '
      + 'the window between the removal and the landing. ' + seen);

    // Premise 3 — the removal actually HAPPENED. Without it the worktree still holds the journal, it
    // is trivially findable, and the pin below is vacuous. This is the clause that makes the arm
    // about the staged copy rather than about the original.
    assert(!fs.existsSync(fx.wtPath),
      '#980 (w) premise: the linked worktree must be GONE after the stop — the stage-then-remove-then-'
      + 'stop ordering is the whole window this arm measures, and a surviving worktree means the run '
      + 'never reached it. ' + seen);

    // Premise 4 — the bytes were not destroyed. If they were, that is a strictly worse defect than
    // the one this arm pins, and it must not be reported as this one.
    assert(survivors.length > 0,
      '#980 (w) premise: the staged copy must still exist somewhere after the stop. The worktree is '
      + 'gone and the stage is the only copy left; losing it outright is a destroy defect (#619(4)), '
      + 'not the naming defect this arm measures. ' + seen);

    // ================================ THE PIN ================================
    // Findable means one of two things, and the arm accepts either: a path the run NAMED leads to the
    // journal, or the journal is already in the band the operator reads (the live/archive folder).
    // Anything else is a generated name nobody was told about.
    const namedPaths = (combined.match(/\/[^\s'"()\n]+/g) || []);
    const reachableFromOutput = namedPaths.some(p => {
      try {
        if (!fs.existsSync(p)) return false;
        if (fs.statSync(p).isDirectory()) return filesContaining973(p, NONCE).length > 0;
        return fs.readFileSync(p, 'utf8').includes(NONCE);
      } catch (_) { return false; }
    });
    const inOperatorBand = inFixture.some(rel => rel.startsWith('kaola-workflow' + path.sep));

    assert(reachableFromOutput || inOperatorBand,
      '#980 (w): the staged run journal must be FINDABLE after a stop that leaves it un-landed. The '
      + 'worktree it came from is gone, so this staged copy is the run\'s only surviving journal, and '
      + 'it currently sits under a generated kw-wtsync-* name that appears nowhere in the output and '
      + 'nowhere the operator looks — OS tmp reaping eventually takes it. Naming the path in the '
      + 'failure output, landing it into the archive band before stopping, or deferring the removal '
      + 'until the landing commits all satisfy this; parking it silently does not. '
      + 'survivors=' + JSON.stringify(survivors) + ' ' + seen);
  } finally {
    cleanupGateFixture(fx);
    // The un-landed stage is the artifact under test, so nothing in the sink deletes it — this arm
    // owns that cleanup or it leaks a temp dir on every run. Only the one carrying THIS arm's nonce.
    try {
      for (const n of fs.readdirSync(os.tmpdir())) {
        if (!n.startsWith('kw-wtsync-')) continue;
        const abs = path.join(os.tmpdir(), n);
        if (filesContaining973(abs, NONCE).length > 0) fs.rmSync(abs, { recursive: true, force: true });
      }
    } catch (_) {}
  }
})();

// (w2) — the same three-copy blind spot (#931 n4) exists for this fix. (w) drives the CANONICAL sink
// only, and the gitlab and gitea sinks are hand-ported: a canonical-only repair leaves both of them
// staging a journal and stopping without naming it, with every behavioural arm green. The window is
// opened by the stage and closed by the landing, so what each copy must carry is the pair — an arm at
// every stage site and a disarm at every landing site. Counting them is what makes a copy that armed
// ONE of its two routes fail here rather than pass on a partial port.
(function testStagedJournalNoteReachesEveryEdition980() {
  console.log('Test (#980 w2): the staged-journal note must reach all FOUR sink copies, armed at BOTH stage sites — a canonical-only or single-route fix leaves the same silent tmpdir behind on the copies (w) never drives');
  const copies = [
    ['root', path.join(repoRoot, 'scripts', 'kaola-workflow-sink-merge.js')],
    ['codex', path.join(repoRoot, 'plugins', 'kaola-workflow', 'scripts', 'kaola-workflow-sink-merge.js')],
    ['gitlab', path.join(repoRoot, 'plugins', 'kaola-workflow-gitlab', 'scripts', 'kaola-gitlab-workflow-sink-merge.js')],
    ['gitea', path.join(repoRoot, 'plugins', 'kaola-workflow-gitea', 'scripts', 'kaola-gitea-workflow-sink-merge.js')],
  ];
  const texts = new Map();
  let allPresent = true;
  for (const [label, file] of copies) {
    let text = null;
    try { text = fs.readFileSync(file, 'utf8'); } catch (_) {}
    assert(text !== null, '#980 (w2/' + label + '): the edition sink module must exist at ' + file);
    if (text === null) { allPresent = false; continue; }
    texts.set(label, text);
  }
  if (!allPresent) return;

  // CALIBRATION on the canonical copy (w) actually drove: the counts below are only a measurement if
  // the canonical really carries the pair, and the stage/landing sites are counted from the source
  // rather than assumed, so a future route added to the sink raises the bar for every copy at once.
  const root = texts.get('root');
  const stageSites = (root.match(/^[ \t]*sinkCopyDir\(wtProjDir, wtStageDir\);$/gm) || []).length;
  const landSites = (root.match(/^[ \t]*try \{ fs\.rmSync\(wtStageDir, \{ recursive: true, force: true \}\); \} catch \(_\) \{\}$/gm) || []).length;
  assert(stageSites >= 2 && landSites >= 2,
    '#980 (w2) calibration: the canonical sink must carry both staging routes and both landing sites, '
    + 'or there is nothing for the legs below to count against; got stage=' + stageSites + ' land=' + landSites);
  if (!(stageSites >= 2 && landSites >= 2)) return;

  for (const [label] of copies) {
    const text = texts.get(label);
    const armed = (text.match(/armStagedJournalNote\(wtStageDir\)/g) || []).length;
    const disarmed = (text.match(/^[ \t]*disarmStagedJournalNote\(\);/gm) || []).length;
    assert(armed === stageSites,
      '#980 (w2/' + label + '): every staging site must arm the note. A route that stages without arming '
      + 'reaches its stops with the copy parked under an unreported kw-wtsync-* name — the exact defect, '
      + 'surviving on one route; expected ' + stageSites + ' armed, got ' + armed);
    assert(disarmed === landSites,
      '#980 (w2/' + label + '): every landing site must disarm the note. The handler\'s existsSync probe '
      + 'already covers the ordinary completed path — the stage is deleted immediately after landing, so '
      + 'there is nothing left to report — which is why (#707 h) stays green without the disarm. What the '
      + 'disarm covers is the case that probe cannot see: a cleanup rmSync that FAILS leaves the directory '
      + 'on disk after a successful landing, and an un-disarmed note then warns about a copy the run '
      + 'already landed. Expected ' + landSites + ' disarmed, got ' + disarmed);
    assert(/kw-wtsync|staged run journal/.test(text) && text.includes('stagedJournalDir'),
      '#980 (w2/' + label + '): the copy must carry the note itself, not only the call sites');
  }
})();

// --------------------------------------------------------------------------- (x1)–(x3) the archive that did not happen
//
// The finalize step calls archiveProjectDir inside a try whose catch rethrows ONLY TypeError and
// ReferenceError — deliberately, for the export-drift class — and swallows everything else. A
// swallowed throw leaves receipt.archive_dest UNSET, and the never-committed guard in archive_commit
// is scoped to a SET dest, so it cannot fire on that shape. The transaction then walks the rest of
// its steps: it pushes the merged default branch — which still carries the live run folder the
// archive was supposed to take off it — closes the issue, and reports status:sinked. A wholly failed
// archive reports success, and the run record it failed to archive is what gets published.
//
// This is not a verdict about the WORK, and converting it is not what "nothing refuses" asks for:
// the same rule carves out the operation that would DESTROY something, and reports it loudly. What
// (x1) pins is narrower still — a sink may not CLAIM an archive it did not perform.
//
// (x2) and (x3) are the fences. The fix cannot key on the missing dest, because a legitimate run
// with nothing to archive leaves it unset too (x2); and it cannot widen into a blanket catch-all,
// because the one class the catch deliberately rethrows must keep failing on its own terms (x3).

// Where a stopped sink's journal can legitimately be. resolveSinkReceiptPath writes to the live
// folder, the plain archive, or a collision-suffixed archive depending on what exists when it runs,
// so a scenario that asserts the journal SURVIVED has to look in all three — pinning one location
// would turn a correct stop that wrote elsewhere into a false red.
function findSinkJournal(tmpRoot, project) {
  const candidates = [
    path.join(tmpRoot, 'kaola-workflow', project, '.cache', 'sink-receipt.json'),
    path.join(tmpRoot, 'kaola-workflow', 'archive', project, '.cache', 'sink-receipt.json'),
  ];
  const suffixed = suffixedArchiveRel(tmpRoot, project);
  if (suffixed) candidates.push(path.join(tmpRoot, suffixed, '.cache', 'sink-receipt.json'));
  for (const p of candidates) { if (fs.existsSync(p)) return p; }
  return null;
}

// "An archive that did not happen must stop the sink", as ONE assertion set, because it is one
// contract reached through two independent doors: archiveProjectDir can THROW (x1), or it can RETURN
// while reporting it archived nothing (x4). Holding the two doors to the same six clauses is the
// whole point of factoring this out — the half that gets a bespoke, slightly weaker assertion set is
// the half whose guard quietly stops being falsifiable, which is exactly how the return arm shipped
// pinned by nothing.
//
// Every clause is checked because they fail independently: a sink can stop without saying why, say
// why while still exiting 0, or stop cleanly having already pushed. Callers pass the label so a
// failure names which door it came through.
function assertArchiveFailureStopsTheSink(fx, label, opts) {
  const o = opts || {};
  const result = o.result;
  const out = o.out;
  const project = fx.projectName;

  // Clause 1 — a well-formed envelope, asserted FIRST and on its own. "Emitted nothing parseable"
  // and "emitted the wrong verdict" are different failures and must read differently; a bare rethrow
  // out of the transaction would trip exactly this one.
  assert(out !== null,
    label + ': the sink must emit a well-formed JSON envelope — an unhandled throw past finalize leaves the orchestrator nothing to route on; exit=' + result.status
    + '\nstdout: ' + JSON.stringify(result.stdout) + '\nstderr: ' + JSON.stringify((result.stderr || '').slice(-1200)));

  // Clause 2 — THE CLAIM. status:sinked over an archive that did not happen asserts that a thing
  // happened which did not, and it is the assertion every downstream reader trusts.
  assert(!(out && out.status === 'sinked'),
    label + ': a sink whose archive did not happen must not report status:sinked; got ' + JSON.stringify(out && out.status)
    + '\nreceipt: ' + JSON.stringify(out && out.receipt));

  // Clause 3 — an output-blind caller (a shell `if`, a wrapper reading only the exit code) must stop
  // too. Transport, not a verdict.
  assert(result.status !== 0, label + ': a failed archive must exit non-success; got ' + result.status
    + '\nstdout: ' + result.stdout + '\nstderr: ' + (result.stderr || '').slice(-1200));

  // Clause 4 — NAMED, not merely non-zero. Asserted over the routable fields rather than against one
  // exact schema, so the report may take the shipped refusal shape (`reason` + `detail`) or the
  // findings[] shape without a false red — but a stop that never says the ARCHIVE is what failed
  // sends the operator looking in the wrong place, and a stop with no machine-readable token at all
  // is not something an orchestrator can route on.
  const routable = !!(out && ((typeof out.reason === 'string' && out.reason.trim().length > 0)
    || (Array.isArray(out.findings) && out.findings.some(f => f && f.classification))));
  const named = [out && out.reason, out && out.step, out && out.archive_refusal, out && out.detail]
    .concat((out && Array.isArray(out.findings) ? out.findings : []).map(f => JSON.stringify(f)))
    .filter(Boolean).join(' ');
  assert(routable && /archiv/i.test(named),
    label + ': the envelope must carry a routable token AND name the ARCHIVE as what failed; got reason='
    + JSON.stringify(out && out.reason) + ' findings=' + JSON.stringify(out && out.findings)
    + ' detail=' + JSON.stringify(out && out.detail));

  // Clause 5 — the observed harm, as git facts rather than as a sentence in a message. push_main and
  // closure are steps AFTER finalize, so a sink that stops at the archive leaves the remote and the
  // forge exactly where it found them. Checked per FILE as well as by ref, because the loss of
  // containment is specifically that the live run record — the folder the archive exists to take off
  // the mainline — is what gets published.
  assert(git(fx.tmpRoot, ['rev-parse', 'origin/main']).stdout.trim() === o.remoteBefore,
    label + ': origin/main must NOT advance over an archive that failed; ' + o.remoteBefore + ' -> '
    + git(fx.tmpRoot, ['rev-parse', 'origin/main']).stdout.trim());
  for (const rel of ['workflow-state.md', 'mission-list.md']) {
    assert(catFileType(fx.tmpRoot, 'origin/main:kaola-workflow/' + project + '/' + rel) === null,
      label + ': the live ' + rel + ' must NEVER reach the remote as part of a sink whose archive failed');
  }
  const calls = readLog(fx.logFile);
  assert(!calls.some(c => c.startsWith('close:')),
    label + ': no issue may be closed over an archive that did not happen; calls=' + JSON.stringify(calls));

  // Clause 6 — RETRYABLE. The archive failure is transient (the directory becomes writable again, the
  // seam is switched off), so the record of it must be resumable: a disposed journal, or a journal
  // whose finalize step reads `done`, is how a re-run walks straight past the step that failed and
  // lands in exactly the same false success. Same idiom as (v).
  const journalPath = findSinkJournal(fx.tmpRoot, project);
  assert(journalPath,
    label + ': the sink journal must survive the stop so a re-run resumes at the archive; nothing at the live, plain-archive or suffixed-archive path');
  if (journalPath) {
    let saved = null;
    try { saved = JSON.parse(fs.readFileSync(journalPath, 'utf8')); } catch (_) { saved = null; }
    assert(saved && saved.steps && saved.steps.finalize !== 'done',
      label + ': the finalize step must be left NOT done — a `done` archive step is a second claim that the archive happened, and it makes the re-run skip it; got '
      + JSON.stringify(saved && saved.steps));
  }
}

// (x1) THE THROW DOOR. The unwritable-archive shape is the whole fixture: an in-place archive is an
// fs.renameSync INTO kaola-workflow/archive/, so a directory the process cannot write to makes it
// throw EACCES with nothing else about the repo broken, no test-only env var, and no tampering with
// git objects. The mode is restored in the finally — an archive directory left at 0555 cannot be
// torn down, and the fixture would outlive the suite.
(function testSwallowedArchiveThrowMustNotReportSuccess() {
  console.log('Test (x1): an archive that THREW must not be reported as a sink that happened — no status:sinked, the failure NAMED, the live run record kept off the remote, the issue not closed, and the finalize step left retryable');
  const project = 'issue-89901';
  const issue = 89901;
  const missionList = '# ' + project + ' — close the issue\n\n### item: pin the archive failure\nstatus: done\nresult: inline\n';
  const fx = buildSoleArchiverFixture(project, issue, { extraLiveFiles: { 'mission-list.md': missionList } });
  fx.projectName = project;
  const archiveBase = path.join(fx.tmpRoot, 'kaola-workflow', 'archive');
  try {
    // PRECONDITION 1 — the run record really is on the branch. Without it, "the live run record must
    // not reach the remote" would hold for every sink and prove nothing.
    for (const rel of ['workflow-state.md', 'mission-list.md']) {
      assert(catFileType(fx.tmpRoot, fx.branch + ':kaola-workflow/' + project + '/' + rel) === 'blob',
        '(x1) precondition: the branch must carry the live ' + rel + ' — that is what a failed archive leaves behind for the push to publish');
    }
    // PRECONDITION 2 — the archive directory really is unwritable. If a directory can still be
    // created there (a privileged runner, an ACL) the archive never throws and every assertion below
    // would pass for a reason that has nothing to do with the defect.
    fs.chmodSync(archiveBase, 0o555);
    const probeDir = path.join(archiveBase, 'writability-probe');
    let wrote = false;
    try { fs.mkdirSync(probeDir); wrote = true; } catch (_) { wrote = false; }
    if (wrote) { try { fs.rmdirSync(probeDir); } catch (_) {} }
    assert(!wrote, '(x1) precondition: kaola-workflow/archive must be UNWRITABLE for the archive to fail — a directory was still created there, so this scenario is not exercising a failed archive at all');

    const remoteBefore = git(fx.tmpRoot, ['rev-parse', 'origin/main']).stdout.trim();

    const result = runSink(fx, ['--issue', String(issue)]);
    const out = lastJson(result);

    assertArchiveFailureStopsTheSink(fx, '(x1) throw door', { result, out, remoteBefore });

    // …and it really was the THROW door. The catch arm records its own reason, so a run that reached
    // the stop any other way would be pinning (x4)'s door twice and this one not at all.
    assert(out && out.archive_refusal === 'archive_exception',
      '(x1): the stop must have come through the CATCH arm (an EACCES thrown out of archiveProjectDir); got archive_refusal='
      + JSON.stringify(out && out.archive_refusal));
  } finally {
    try { fs.chmodSync(archiveBase, 0o755); } catch (_) {}
    cleanup(fx);
  }
})();

// (x4) THE RETURN DOOR — the other half of the same contract, and the half nothing reached. (x1)
// arrives at the stop by making archiveProjectDir THROW, so it exercises the catch arm and only the
// catch arm. archiveProjectDir can also return NORMALLY while reporting that it archived nothing —
// `{archived: false, reason: …}` — and that return walks straight past a catch. With only (x1), the
// return-side check could be deleted outright and the suite would stay green: found by mutation, not
// by reading, which is the only way a hole of this shape ever is found.
//
// The lever is KAOLA_WORKFLOW_FORCE_ARCHIVE_REFUSAL=1 (kaola-workflow-claim.js), the deterministic
// refusal seam that returns `{archived: false, reason: 'archive_forced_refusal'}` before any
// mutation. It needs no chmod and it is the shape the closure contract's archiveSucceeded() exists to
// reject, so this drives the boundary the rest of the workflow already archives by rather than a
// bespoke one.
//
// Same fixture as (x1) and the same six clauses, deliberately: the two scenarios differ in the DOOR
// and in nothing else, so a difference in outcome can only be the door.
(function testReturnedArchiveRefusalMustNotReportSuccess() {
  console.log('Test (x4): an archive that RETURNED without archiving must stop the sink exactly as a thrown one does — the catch arm is not the only door, and a fix written at the catch alone leaves this one open');
  const project = 'issue-89905';
  const issue = 89905;
  const missionList = '# ' + project + ' — close the issue\n\n### item: pin the returned refusal\nstatus: done\nresult: inline\n';
  const fx = buildSoleArchiverFixture(project, issue, { extraLiveFiles: { 'mission-list.md': missionList } });
  fx.projectName = project;
  try {
    // PRECONDITION — the run record really is on the branch, so "must not reach the remote" is a
    // claim about something that exists to be published.
    for (const rel of ['workflow-state.md', 'mission-list.md']) {
      assert(catFileType(fx.tmpRoot, fx.branch + ':kaola-workflow/' + project + '/' + rel) === 'blob',
        '(x4) precondition: the branch must carry the live ' + rel + ' — that is what a failed archive leaves behind for the push to publish');
    }

    const remoteBefore = git(fx.tmpRoot, ['rev-parse', 'origin/main']).stdout.trim();

    const result = runSink(fx, ['--issue', String(issue)], { KAOLA_WORKFLOW_FORCE_ARCHIVE_REFUSAL: '1' });
    const out = lastJson(result);

    assertArchiveFailureStopsTheSink(fx, '(x4) return door', { result, out, remoteBefore });

    // THE DOOR ITSELF, and the assertion without which this scenario is (x1) wearing a different
    // fixture. The catch arm records `archive_exception`; a stop carrying that token would mean
    // something THREW and the return path is still untested. What is pinned is the negative — that
    // nothing threw — rather than the exact returned token, so the seam's reason may be renamed
    // without a false red while a silent relapse to "only the catch arm stops the sink" still fails.
    assert(out && out.archive_refusal && out.archive_refusal !== 'archive_exception',
      '(x4): the stop must have come through the RETURN arm — an archive_exception here means something threw and the returned-refusal door is still unpinned; got archive_refusal='
      + JSON.stringify(out && out.archive_refusal));

    // Nothing was destroyed on the way to the stop. The seam returns before archiveProjectDir stamps
    // or moves anything, so the live folder the sink declined to archive must still be there for the
    // re-run clause 6 promises.
    assert(fs.existsSync(path.join(fx.tmpRoot, 'kaola-workflow', project, 'workflow-state.md')),
      '(x4): the live project folder must survive a refused archive — the stop exists to keep the run record, not to trade it for a clean tree');
  } finally {
    cleanup(fx);
  }
})();

// (x2) FENCE, green today and the reason the (x1) fix cannot be written the easy way. An unset
// archive_dest is NOT evidence that an archive failed: archiveProjectDir returns source-missing for
// a run with no live folder to archive, which is an ordinary, legitimate no-op, and it leaves the
// receipt looking exactly like the swallowed throw in (x1) does. The discriminator has to be the
// FAILURE, never the absent dest.
//
// buildKeepWorktreeArchiveMirrorFixture with an EMPTY plant is precisely this shape — main carries
// the roadmap and no archive at all, the branch carries the deliverable and no live folder — so it is
// reused rather than duplicated.
(function testNothingToArchiveStillCompletes() {
  console.log('Test (x2): a run with NOTHING to archive — no live folder, no archive on main — must still complete; an unset archive_dest is not evidence that an archive failed');
  const project = 'issue-89902';
  const issue = 89902;
  const fx = buildKeepWorktreeArchiveMirrorFixture(project, issue, {});
  fx.projectName = project;
  try {
    // Precondition — there really is nothing to archive, so the run below is the legitimate no-op
    // this fence is about and not a sink that quietly archived something.
    assert(!fs.existsSync(path.join(fx.tmpRoot, 'kaola-workflow', project)),
      '(x2) precondition: main must hold no live project folder');
    assert(catFileType(fx.tmpRoot, fx.branch + ':kaola-workflow/' + project) === null,
      '(x2) precondition: the branch must carry no live project folder either');

    const result = runSink(fx, ['--issue', String(issue)]);
    const out = lastJson(result);

    assert(result.status === 0, '(x2): a run with nothing to archive must exit 0; got ' + result.status
      + '\nstdout: ' + result.stdout + '\nstderr: ' + (result.stderr || '').slice(-1200));
    assert(out && out.status === 'sinked', '(x2): status must be sinked; got ' + JSON.stringify(out && (out.status || out.reason)));
    // …and the observable it shares with the defect: this run archived NOTHING, so no dest was
    // recorded. That is what makes the fence bite — a fix keyed on the missing dest turns this run
    // into a refusal.
    assert(out && out.receipt && out.receipt.archive_dest === undefined,
      '(x2): precondition + the point — a source-missing archive records NO dest, the same observable a swallowed throw leaves; got '
      + JSON.stringify(out && out.receipt && out.receipt.archive_dest));
    assert(!(out && out.receipt && out.receipt.archive_refusal),
      '(x2): nothing to archive is not an archive refusal; got ' + JSON.stringify(out && out.receipt && out.receipt.archive_refusal));
  } finally {
    cleanup(fx);
  }
})();

// (x3) FENCE, green today. The catch has ONE deliberate rethrow arm: a missing or renamed
// archiveProjectDir export is a programmer error, and it is singled out because a forge port can drop
// an export and every consumer would otherwise sink over a silently skipped archive. The (x1) fix
// must WIDEN what is not swallowed; it must not narrow this by folding the programmer-error class
// into whatever it does with the operational one.
//
// Driven through a scratch MIRROR of scripts/: the sink resolves ./kaola-workflow-claim.js relative
// to its own file, so the only way to present it with a drifted export is to run a byte-identical
// copy of the shipped script beside a doctored copy of its dependency. The subject under test is
// still the shipped sink; what is isolated is its environment.
//
// The CONTROL run is what makes this falsifiable. A mirror broken for any unrelated reason would
// exit non-zero for reasons that have nothing to do with export drift, and the fence would then pass
// forever without measuring anything — so the undoctored mirror must first sink cleanly.
(function testExportDriftStillFailsLoud() {
  console.log('Test (x3): a DRIFTED archiveProjectDir export must still fail loudly and name itself — the deliberate rethrow arm survives, with an undoctored mirror control proving the fixture is not failing for its own reasons');
  const mirrorRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-mirror-'));
  const mirrorScripts = path.join(mirrorRoot, 'scripts');
  const controlFx = buildSoleArchiverFixture('issue-89903', 89903, {});
  controlFx.projectName = 'issue-89903';
  const driftFx = buildSoleArchiverFixture('issue-89904', 89904, {});
  driftFx.projectName = 'issue-89904';
  try {
    fs.cpSync(path.join(repoRoot, 'scripts'), mirrorScripts, { recursive: true });
    const mirrorSink = path.join(mirrorScripts, 'kaola-workflow-sink-merge.js');
    const mirrorClaim = path.join(mirrorScripts, 'kaola-workflow-claim.js');
    assert(fs.existsSync(mirrorSink) && fs.existsSync(mirrorClaim),
      '(x3) precondition: the scratch mirror must carry both the sink and its claim.js dependency');

    // CONTROL — the undoctored mirror behaves exactly like the shipped tree.
    const control = runSinkAt(mirrorSink, controlFx, ['--issue', '89903']);
    const controlOut = lastJson(control);
    assert(control.status === 0 && controlOut && controlOut.status === 'sinked',
      '(x3) control: the UNDOCTORED scratch mirror must sink normally — otherwise the drift run below fails for a reason that has nothing to do with the export, and this fence measures nothing; got '
      + control.status + ' / ' + JSON.stringify(controlOut && (controlOut.status || controlOut.reason))
      + '\nstderr: ' + (control.stderr || '').slice(-1200));

    // DRIFT — remove the export the finalize step destructures, and nothing else.
    fs.appendFileSync(mirrorClaim,
      '\n// scratch mirror only: simulate the cross-edition export-drift class.\ndelete module.exports.archiveProjectDir;\n');
    // The mirrored module must be loaded in a FRESH process to observe the appended deletion: this
    // suite's own require cache already holds the shipped copy, so an in-process require would
    // answer about the wrong file.
    // spawn-class: cli-contract
    const exportProbe = spawnSync(process.execPath,
      ['-e', 'process.stdout.write(String(typeof require(process.argv[1]).archiveProjectDir))', mirrorClaim],
      { encoding: 'utf8' });
    assert(exportProbe.stdout === 'undefined',
      '(x3) precondition: the mirrored claim.js must no longer export archiveProjectDir — otherwise no drift is being exercised; got '
      + JSON.stringify(exportProbe.stdout) + ' stderr: ' + (exportProbe.stderr || '').slice(-400));

    const result = runSinkAt(mirrorSink, driftFx, ['--issue', '89904']);
    const out = lastJson(result);

    assert(result.status !== 0, '(x3): export drift must exit non-success; got ' + result.status
      + '\nstdout: ' + result.stdout + '\nstderr: ' + (result.stderr || '').slice(-1200));
    assert(!(out && out.status === 'sinked'),
      '(x3): a vanished archiveProjectDir export must NEVER reach status:sinked — that is the silent skip the rethrow arm exists to prevent; got '
      + JSON.stringify(out && out.status));
    assert(/archiveProjectDir is not a function|TypeError|ReferenceError/.test((result.stderr || '') + ' ' + JSON.stringify(out || {})),
      '(x3): the drifted export must NAME itself — a stop that does not say which symbol vanished sends a forge port hunting; stderr:\n'
      + (result.stderr || '').slice(-1200));
    assert(!readLog(driftFx.logFile).some(c => c.startsWith('close:')),
      '(x3): no issue may be closed over a run whose archive step could not even be called');
  } finally {
    try { fs.rmSync(mirrorRoot, { recursive: true, force: true }); } catch (_) {}
    cleanup(controlFx);
    cleanup(driftFx);
  }
})();

// (z1) #907 — AN EMBEDDED GIT REPOSITORY INSIDE THE ARCHIVE MUST NOT BE A PERMANENT, UNCLEARABLE BLOCK.
//
// A CORRECTION TO #907 FIRST, so nobody re-derives the wrong mechanism: a `.git`-named FILE is NOT a
// defect. `requiredArchiveFiles` skips an entry named `.git`, it has done so since the function was
// written, and the file is simply never committed. The real block is next door.
//
// A `.git` DIRECTORY (a nested repository, or a valid gitfile pointing at a live gitdir) makes git
// collapse the whole subtree into ONE `160000` gitlink. Measured consequences, all three:
//   * `ls-tree -r -z` returns only the gitlink, so `blobPathsUnder` sees no blobs beneath it;
//   * `requiredArchiveFiles` walks the DISK and still demands the siblings under that directory;
//   * the operator's own lever fails too — `git add -f -- <archive>/<dir>/<file>` exits 128 with
//     `fatal: … is in submodule`.
// So `missingBlobs` is non-empty on every run, `forcePaths` is empty so the force-add never fires,
// and the refusal's own advice ("the step is left NOT done so a re-run retries it") describes a
// deterministic computation. Every re-run is byte-identical. That is a bricked repository, and it is
// the one shape the "nothing refuses" posture says must not exist: a refusal nobody can clear.
//
// The current `.git` skip does not cover it — it skips the ENTRY, while the gitlink boundary is what
// makes the entry's SIBLINGS unreachable.
//
// WHAT IS PINNED, and what deliberately is not. Not a token, not a wording, and not which of the two
// outcomes is chosen: the sink may carry the archive (dropping, excluding or flattening the embedded
// repository is a decision about someone's data and belongs to whoever owns the fix), or it may
// decline — but every path a decline itemizes has to be one the operator's own lever can take. See
// the oracle note inside; it is an operation, not a reading of prose, because the first version of
// this leg asked a prose question and the broken sink answered it by accident.
//
// DRIVEN ON EVERY EDITION. The GitLab and Gitea sink ports are hand-maintained and compared by
// nothing, so a fix landing on three copies is invisible until a user on the fourth hits it.
function assertEmbeddedRepositoryIsClearable907(label, sinkScript, project, issue, mockEnvName) {
  console.log('Test (#907 z1 ' + label + '): an archive carrying an embedded git repository must either sink, or decline over paths `git add -f` can take — a refusal whose only named remedy exits 128 is a permanent block');
  // An irrelevant ignore rule: the archive band itself is fully committable, so the blob gate is LIVE.
  // Under the (q) fixture's default rule the whole band is ignored and archive_commit honestly skips —
  // which would make this leg green while measuring nothing.
  const fx = buildGitignoredArchiveSinkFixture(project, issue, { gitignoreBody: 'node_modules/\n' });
  const archiveRel = 'kaola-workflow/archive/' + project;
  const embeddedRel = archiveRel + '/vendored';
  const innerRel = embeddedRel + '/inner.md';
  try {
    // The embedded repository: a real one, with its own commit, so git genuinely collapses it.
    const embeddedAbs = path.join(fx.archiveDir, 'vendored');
    fs.mkdirSync(embeddedAbs, { recursive: true });
    fs.writeFileSync(path.join(embeddedAbs, 'inner.md'), 'evidence inside an embedded repository\n');
    git(embeddedAbs, ['init', '-q', '-b', 'main']);
    git(embeddedAbs, ['config', 'user.email', 'test@example.com']);
    git(embeddedAbs, ['config', 'user.name', 'Test User']);
    git(embeddedAbs, ['add', '-A']);
    git(embeddedAbs, ['commit', '-q', '-m', 'inner']);

    // --- PREMISE, measured in a SCRATCH INDEX so the fixture the sink is about to read is untouched.
    // Without these three the leg below could pass on a fixture where nothing was ever collapsed.
    const scratchIndex = path.join(fx.binDir, 'premise.index');
    // Routed through the shared git fixture library, like every other git call in this suite — the
    // only thing this needs beyond `git()` is GIT_INDEX_FILE, which the library forwards verbatim.
    const withScratchIndex = args => G.git(fx.tmpRoot, args, {
      encoding: 'utf8', env: Object.assign({}, process.env, { GIT_INDEX_FILE: scratchIndex }),
    });
    withScratchIndex(['read-tree', 'HEAD']);
    withScratchIndex(['add', '--', archiveRel]);
    const staged = (withScratchIndex(['ls-files', '--stage', '-z', '--', archiveRel]).stdout || '')
      .split('\0').filter(Boolean);
    assert(staged.some(rec => rec.indexOf('160000 ') === 0 && rec.indexOf(embeddedRel) > 0),
      '#907 z1 (' + label + ') premise: git must collapse the embedded repository into a 160000 gitlink — that '
      + 'collapse is the whole mechanism; got ' + JSON.stringify(staged));
    assert(!staged.some(rec => rec.indexOf(innerRel) > 0),
      '#907 z1 (' + label + ') premise: and the file beneath it must NOT be in the index; got ' + JSON.stringify(staged));
    const forceAdd = withScratchIndex(['add', '-f', '--', innerRel]);
    assert(forceAdd.status !== 0,
      '#907 z1 (' + label + ') premise: the operator\'s own lever must fail too — `git add -f` on the file the refusal '
      + 'names exits non-zero (`is in submodule`). That failure is what the oracle below asks about, '
      + 'so a fixture where it succeeds measures nothing; got status=' + forceAdd.status
      + ' stderr=' + JSON.stringify(String(forceAdd.stderr || '').slice(0, 200)));
    try { fs.rmSync(scratchIndex, { force: true }); } catch (_) {}

    // A forge port shells its OWN CLI, so its shim is pointed at the same offline mock the canonical
    // leg gets. Without it the port would reach for a real `glab`/`tea` and the leg would be
    // measuring the absence of a binary instead of the archive gate.
    const extraEnv = mockEnvName ? { [mockEnvName]: path.join(fx.binDir, 'gh.js') } : null;
    // `--keep-issue-open` takes the forge CLOSURE step out of the picture on every edition. The
    // offline mock speaks gh's argv, not glab's or tea's, so a forge port would otherwise refuse at
    // `step: 'closure'` — a fixture artefact that reads exactly like an archive-gate red and would
    // make this leg measure the mock instead of the gate. Applied to ALL editions, so the axis
    // between them stays the sink script.
    const result = runSinkAt(sinkScript, fx, ['--issue', String(issue), '--keep-issue-open'], extraEnv);
    const out = lastJson(result);
    const sank = result.status === 0 && out && out.status === 'sinked';

    // FIXTURE PREMISE: the run reached the gate under test. A refusal at some other step is neither a
    // pass nor evidence about the archive gate, and it must say which step it stopped at rather than
    // arriving as an unexplained red below.
    const step = out && out.step;
    assert(sank || step === 'archive_commit',
      '#907 z1 (' + label + ') premise: the run must reach the ARCHIVE gate — it either sinks or '
      + 'refuses at step archive_commit. A stop anywhere else is a fixture fault, not a measurement; '
      + 'got exit=' + result.status + ' step=' + JSON.stringify(step)
      + ' reason=' + JSON.stringify(out && out.reason)
      + '\nstderr: ' + String(result.stderr || '').slice(-500));

    // THE ORACLE IS MECHANICAL, not textual. An earlier version of this leg asked whether the report
    // "names the embedded directory" — and passed on the broken sink, because the journal's
    // `archived_paths` happens to list the gitlink at exactly that path. Bookkeeping satisfied a
    // prose question. So the question is asked as an operation instead:
    //
    //   EVERY PATH THE REFUSAL NAMES MUST BE ONE `git add -f` CAN TAKE.
    //
    // That is precisely "a refusal the operator can clear", it cannot be satisfied by accident, and it
    // fixes NOTHING about the method: dropping the subtree from the required set (the sink then
    // completes and names nothing), or naming the containing directory instead of the file beneath it
    // (`git add -f` on a gitlink exits 0), both satisfy it. What does not satisfy it is today's
    // behaviour — itemizing a path whose force-add exits 128.
    const missing = (out && Array.isArray(out.archive_missing_paths)) ? out.archive_missing_paths : [];
    const unclearable = [];
    for (const rel of missing) {
      const probeIndex = path.join(fx.binDir, 'clearable.index');
      try { fs.rmSync(probeIndex, { force: true }); } catch (_) {}
      const probe = args => G.git(fx.tmpRoot, args, {
        encoding: 'utf8', env: Object.assign({}, process.env, { GIT_INDEX_FILE: probeIndex }),
      });
      probe(['read-tree', 'HEAD']);
      const add = probe(['add', '-f', '--', rel]);
      if (add.status !== 0) unclearable.push(rel + ' -> ' + String(add.stderr || '').trim().slice(0, 160));
      try { fs.rmSync(probeIndex, { force: true }); } catch (_) {}
    }

    assert(sank || (missing.length > 0 && unclearable.length === 0),
      '#907 z1 (' + label + '): an archive carrying an embedded git repository must either SINK, or be declined over '
      + 'paths the operator can actually act on. Every path the refusal itemizes has to be one '
      + '`git add -f` can take — today it names ' + JSON.stringify(missing) + ', and force-adding it '
      + 'fails: ' + JSON.stringify(unclearable) + '. The force-add set the sink builds is empty (the '
      + 'file is not ignored, it is unreachable), so no re-run can change the outcome and the '
      + 'repository is bricked rather than gated. got exit=' + result.status
      + ' status=' + JSON.stringify(out && out.status)
      + ' reason=' + JSON.stringify(out && out.reason)
      + '\nstderr: ' + String(result.stderr || '').slice(-600));

    // Whichever way it goes, nothing is destroyed: the archive's own evidence, and the embedded
    // repository's file, are still on disk. A "fix" that cleared the block by deleting the subtree
    // would satisfy the assertion above and lose someone's data.
    assert(fs.existsSync(path.join(fx.archiveDir, 'workflow-state.md')),
      '#907 z1 (' + label + '): the archived run record must survive whichever way the sink decides');
    assert(fs.existsSync(path.join(embeddedAbs, 'inner.md')),
      '#907 z1 (' + label + '): and so must the embedded repository\'s own content — clearing the block by deleting '
      + 'the subtree is not a fix, it is the data loss the archive gate exists to prevent');
  } finally {
    cleanup(fx);
  }
}

// The four sink copies. `mockEnv` points each forge port's own CLI shim at the SAME offline mock the
// canonical leg uses, so the axis between editions stays the sink script and nothing else.
[
  ['root', path.join(repoRoot, 'scripts', 'kaola-workflow-sink-merge.js'), null],
  ['codex', path.join(repoRoot, 'plugins', 'kaola-workflow', 'scripts', 'kaola-workflow-sink-merge.js'), null],
  ['gitlab', path.join(repoRoot, 'plugins', 'kaola-workflow-gitlab', 'scripts', 'kaola-gitlab-workflow-sink-merge.js'), 'KAOLA_GLAB_MOCK_SCRIPT'],
  ['gitea', path.join(repoRoot, 'plugins', 'kaola-workflow-gitea', 'scripts', 'kaola-gitea-workflow-sink-merge.js'), 'KAOLA_TEA_MOCK_SCRIPT'],
].forEach(([label, script, mockEnv], index) => {
  if (!fs.existsSync(script)) {
    assert(false, '#907 z1 (' + label + '): the edition sink script exists at ' + script);
    return;
  }
  const issue = 90701 + index;
  assertEmbeddedRepositoryIsClearable907(label, script, 'issue-' + issue, issue, mockEnv);
});

// (z2) #907 — THE BOUNDARY DISCRIMINATOR MUST AGREE WITH GIT, IN BOTH DIRECTIONS.
//
// (z1) above plants exactly ONE shape: a plain nested repository. That is the shape every probe gets
// right, so (z1) is green against a discriminator that asks the WRONG REPOSITORY — which is what the
// first fix did. It ran `rev-parse --show-toplevel` from INSIDE the candidate directory, i.e. it asked
// the INNER repo where its work tree is. Two inner configurations answer in a way that reads as "not a
// boundary" while the OUTER git stages a `160000` gitlink anyway:
//
//   core.bare=true          inner answers `fatal: this operation must be run in a work tree`
//   core.worktree=<other>   inner answers <other>, which is not the directory being asked about
//
// For those two the siblings stayed in `required[]`, could never become blobs, and `git add -f` on
// them exits 128 `is in submodule` — the permanent unclearable `sink_incomplete` (z1) exists to
// remove, surviving inside the fix for it. A pin that cannot see the defect it names is worse than no
// pin, so this leg plants the shapes (z1) cannot.
//
// THE ORACLE IS GIT ITSELF, not a table in this file. Ground truth is measured per run, in a
// HEAD-seeded SCRATCH index (the fixture the sink is about to read is never touched): whichever
// directories the outer repository collapses into a `160000` entry ARE the boundaries, and the set the
// sink reports on `receipt.archive_embedded_repos` must equal that set exactly. Equality, not
// containment, because BOTH directions are load-bearing and each has its own failure:
//   * a MISSED boundary is the bricked repository — required files git can never commit;
//   * a FALSE boundary silently drops a whole subtree out of the blob gate, so real evidence that git
//     would have committed stops being checked at all — the gate disarms itself and says nothing.
// A shape git's behaviour changes under would break the PREMISE assertions loudly rather than quietly
// turn this leg vacuous.
//
// DRIVEN ON EVERY EDITION, for (z1)'s reason: the GitLab and Gitea sink ports are hand-maintained.
function assertBoundaryDiscriminationMatchesGit907(label, sinkScript, project, issue, mockEnvName) {
  console.log('Test (#907 z2 ' + label + '): the archive-boundary inventory must equal the set the OUTER git actually collapses into a gitlink — a `.git` directory carrying core.bare or core.worktree collapses just as a plain nested repo does, and a benign `.git` must not be mistaken for one');
  const fx = buildGitignoredArchiveSinkFixture(project, issue, { gitignoreBody: 'node_modules/\n' });
  const archiveRel = 'kaola-workflow/archive/' + project;
  // The gitdirs c6's symlink points at live OUTSIDE the repository, so they are not themselves walked.
  const outsideDir = path.join(fx.binDir, 'outside-gitdirs');
  try {
    const mkRepo = (abs) => {
      fs.mkdirSync(abs, { recursive: true });
      fs.writeFileSync(path.join(abs, 'inner.md'), 'evidence inside a repository boundary\n');
      G.git(abs, ['init', '-q', '-b', 'main']);
      G.git(abs, ['config', 'user.email', 'test@example.com']);
      G.git(abs, ['config', 'user.name', 'Test User']);
      G.git(abs, ['add', '-A']);
      G.git(abs, ['commit', '-q', '-m', 'inner']);
      return abs;
    };
    const shapeDir = (name) => {
      const abs = path.join(fx.archiveDir, name);
      fs.mkdirSync(abs, { recursive: true });
      fs.writeFileSync(path.join(abs, 'sibling.md'), 'run evidence beside a ' + name + ' .git entry\n');
      return abs;
    };
    // c1 — a plain nested repository. The one shape (z1) already covers; kept so this leg's ground
    // truth carries a case both probes agree on.
    mkRepo(shapeDir('c1'));
    // c2 — a real repository whose own config says it is BARE. The inner repo then refuses to answer
    // "where is your work tree", which the first fix read as "not a boundary".
    const c2 = mkRepo(shapeDir('c2'));
    G.git(fx.tmpRoot, ['config', '--file', path.join(c2, '.git', 'config'), 'core.bare', 'true']);
    // c3 — a real repository whose config points core.worktree somewhere else entirely. The inner repo
    // answers with that other path, which is not itself, which the first fix also read as "not one".
    const c3 = mkRepo(shapeDir('c3'));
    const elsewhere = path.join(fx.binDir, 'elsewhere-worktree');
    fs.mkdirSync(elsewhere, { recursive: true });
    G.git(fx.tmpRoot, ['config', '--file', path.join(c3, '.git', 'config'), 'core.worktree', elsewhere]);
    // c4/c5/c7 — the BENIGN shapes. git commits their siblings as ordinary blobs, so calling any of
    // them a boundary would drop real evidence out of the blob gate. This is the direction a blunt
    // "any `.git` entry ends the walk" rule gets wrong.
    fs.writeFileSync(path.join(shapeDir('c4'), '.git'), 'this is not a gitfile at all\n');
    fs.writeFileSync(path.join(shapeDir('c5'), '.git'), 'gitdir: /nonexistent/kw-c5-gitdir\n');
    shapeDir('c7');
    // c6 — a `.git` SYMLINK to a live gitdir outside the archive. git follows it and collapses.
    fs.mkdirSync(outsideDir, { recursive: true });
    const c6Repo = mkRepo(path.join(outsideDir, 'c6repo'));
    fs.symlinkSync(path.join(c6Repo, '.git'), path.join(shapeDir('c6'), '.git'));

    // --- GROUND TRUTH, measured in a SCRATCH INDEX. What does the OUTER repository actually do?
    const scratchIndex = path.join(fx.binDir, 'z2-premise.index');
    const withScratchIndex = args => G.git(fx.tmpRoot, args, {
      encoding: 'utf8', env: Object.assign({}, process.env, { GIT_INDEX_FILE: scratchIndex }),
    });
    withScratchIndex(['read-tree', 'HEAD']);
    withScratchIndex(['add', '--', archiveRel]);
    const staged = (withScratchIndex(['ls-files', '--stage', '-z', '--', archiveRel]).stdout || '')
      .split('\0').filter(Boolean).map((rec) => {
        const tab = rec.indexOf('\t');
        return { mode: rec.slice(0, rec.indexOf(' ')), path: tab < 0 ? '' : rec.slice(tab + 1) };
      });
    try { fs.rmSync(scratchIndex, { force: true }); } catch (_) {}
    const collapsed = staged.filter(e => e.mode === '160000').map(e => e.path).sort();
    const shapeRel = n => archiveRel + '/' + n;

    // PREMISE 1 — the two shapes this leg exists for genuinely collapse HERE. If a future git stopped
    // collapsing them the defect would be gone, and this assertion says so instead of going quiet.
    assert(collapsed.indexOf(shapeRel('c2')) !== -1 && collapsed.indexOf(shapeRel('c3')) !== -1,
      '#907 z2 (' + label + ') premise: the OUTER git must collapse BOTH the core.bare repository (c2) and the '
      + 'core.worktree-elsewhere repository (c3) into 160000 gitlinks — those two are the shapes (z1) does not '
      + 'plant and the whole reason this leg exists; got collapsed=' + JSON.stringify(collapsed));
    // PREMISE 2 — and the benign shapes genuinely do NOT collapse, so the equality below is a real
    // two-sided test rather than "everything is a boundary".
    assert(['c4', 'c5', 'c7'].every(n => collapsed.indexOf(shapeRel(n)) === -1
      && staged.some(e => e.path === shapeRel(n) + '/sibling.md')),
      '#907 z2 (' + label + ') premise: git must commit the siblings of the BENIGN `.git` shapes (a junk `.git` '
      + 'file, a broken gitfile, no `.git` at all) as ordinary blobs — if git collapsed those too there would '
      + 'be no false-positive direction to test; got staged=' + JSON.stringify(staged));

    const extraEnv = mockEnvName ? { [mockEnvName]: path.join(fx.binDir, 'gh.js') } : null;
    // `--keep-issue-open` for (z1)'s reason: the offline mock speaks gh's argv, so a forge port would
    // otherwise refuse at step 'closure' and this leg would measure the mock.
    const result = runSinkAt(sinkScript, fx, ['--issue', String(issue), '--keep-issue-open'], extraEnv);
    const out = lastJson(result);
    const sank = result.status === 0 && out && out.status === 'sinked';
    const step = out && out.step;
    assert(sank || step === 'archive_commit',
      '#907 z2 (' + label + ') premise: the run must reach the ARCHIVE gate — a stop anywhere else is a fixture '
      + 'fault, not a measurement; got exit=' + result.status + ' step=' + JSON.stringify(step)
      + ' reason=' + JSON.stringify(out && out.reason)
      + '\nstderr: ' + String(result.stderr || '').slice(-500));

    // THE ORACLE. The inventory the sink publishes must be exactly what git did.
    //
    // Read from the envelope on success and from the SURVIVING JOURNAL on a refusal: a refusal
    // envelope carries no `receipt` key at all, so an envelope-only read would report `[]` for every
    // failure mode and say "the sink named nothing" where the truth is "the sink named the wrong set
    // and then refused". The inventory is written before the add either way, so both are the same
    // field; taking whichever exists keeps the failure message about the discriminator.
    let receipt = (out && out.receipt) || null;
    if (!receipt) {
      const journal = findSinkJournal(fx.tmpRoot, project);
      try { receipt = JSON.parse(fs.readFileSync(journal, 'utf8')); } catch (_) { receipt = {}; }
    }
    const reported = Array.isArray(receipt.archive_embedded_repos) ? receipt.archive_embedded_repos.slice().sort() : [];
    assert(JSON.stringify(reported) === JSON.stringify(collapsed),
      '#907 z2 (' + label + '): receipt.archive_embedded_repos must equal the set the outer git collapses into '
      + 'gitlinks, EXACTLY. A boundary the sink misses is a required file it can never commit and no operator '
      + 'can force in — the permanent block; a boundary it invents drops a whole subtree out of the blob gate, '
      + 'so evidence git WOULD have committed stops being checked and the gate goes silent about its own '
      + 'blind spot. got ' + JSON.stringify(reported) + '\ngit collapses ' + JSON.stringify(collapsed)
      + '\nstderr: ' + String(result.stderr || '').slice(-600));

    // (z1)'s oracle, re-asked on the shapes (z1) cannot plant: every path a refusal names has to be one
    // `git add -f` can take. With the boundaries recognised there is nothing to name and the sink runs.
    const missing = (out && Array.isArray(out.archive_missing_paths)) ? out.archive_missing_paths : [];
    const unclearable = [];
    for (const rel of missing) {
      const probeIndex = path.join(fx.binDir, 'z2-clearable.index');
      try { fs.rmSync(probeIndex, { force: true }); } catch (_) {}
      const probe = args => G.git(fx.tmpRoot, args, {
        encoding: 'utf8', env: Object.assign({}, process.env, { GIT_INDEX_FILE: probeIndex }),
      });
      probe(['read-tree', 'HEAD']);
      if (probe(['add', '-f', '--', rel]).status !== 0) unclearable.push(rel);
      try { fs.rmSync(probeIndex, { force: true }); } catch (_) {}
    }
    assert(sank || (missing.length > 0 && unclearable.length === 0),
      '#907 z2 (' + label + '): an archive holding a core.bare / core.worktree repository must SINK, or be '
      + 'declined over paths the operator can act on — `git add -f` on a path inside a gitlink exits 128, so a '
      + 'refusal naming one is a repository nobody can unbrick; got exit=' + result.status
      + ' missing=' + JSON.stringify(missing) + ' unclearable=' + JSON.stringify(unclearable)
      + '\nstderr: ' + String(result.stderr || '').slice(-600));

    // The benign siblings must have TRAVELLED. This is the false-boundary direction read at the commit
    // rather than on the receipt: a subtree wrongly skipped is a subtree nothing is watching.
    const blobs = new Set(blobsUnder(fx.tmpRoot, 'HEAD', archiveRel));
    for (const n of ['c4', 'c5', 'c7']) {
      assert(blobs.has(shapeRel(n) + '/sibling.md'),
        '#907 z2 (' + label + '): the evidence beside a BENIGN `.git` entry (' + n + ') must be a blob at HEAD — '
        + 'it is ordinary run evidence and git has no trouble with it; got ' + JSON.stringify([...blobs]));
    }
    // ...and nothing was cleared by deletion. A "fix" that removed the embedded repositories would
    // satisfy every assertion above and lose someone's data.
    for (const n of ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7']) {
      assert(fs.existsSync(path.join(fx.archiveDir, n, 'sibling.md')) || fs.existsSync(path.join(fx.archiveDir, n, 'inner.md')),
        '#907 z2 (' + label + '): ' + n + '\'s content must survive on disk whichever way the sink decides');
    }
  } finally {
    cleanup(fx);
  }
}

// (z2b) #907 — AND THE OTHER HALF OF THE SAME ANSWER, AT THE LEVEL WHERE IT COSTS SOMETHING.
//
// (z2)'s equality catches a false boundary on the RECEIPT. This leg catches what a false boundary
// COSTS: `scanArchiveTree` skips a boundary's whole subtree, so every file under it leaves
// `required[]` and the #901 blob gate stops asking about it. On a happy path that is invisible — the
// broad `git add` commits those files anyway and the two answers look identical. Break the add on one
// file next to a BENIGN `.git` entry and they separate: the shipped sink refuses and names it, while a
// discriminator that called that directory a boundary reports a complete archive over a file no commit
// carries. Same shape as (y4), one axis moved: the unreadable file has a `.git`-bearing neighbour.
function assertBenignGitEntryKeepsTheBlobGateArmed907(label, sinkScript, project, issue, mockEnvName) {
  console.log('Test (#907 z2b ' + label + '): a benign `.git` FILE must not disarm the blob gate for its siblings — with one of them unreadable the sink must still refuse sink_incomplete and name it, never report a complete archive over a file the commit does not carry');
  const fx = buildGitignoredArchiveSinkFixture(project, issue, { gitignoreBody: 'node_modules/\n' });
  const archiveRel = 'kaola-workflow/archive/' + project;
  const benignDir = path.join(fx.archiveDir, 'has-a-git-file');
  const blocked = path.join(benignDir, 'unreadable-evidence.md');
  try {
    fs.mkdirSync(benignDir, { recursive: true });
    // A `.git`-named regular FILE: git treats the directory as ordinary and commits what is in it.
    fs.writeFileSync(path.join(benignDir, '.git'), 'this is not a gitfile at all\n');
    fs.writeFileSync(path.join(benignDir, 'readable-evidence.md'), 'evidence beside a junk .git file\n');
    fs.writeFileSync(blocked, 'evidence git will not be able to read\n');
    fs.chmodSync(blocked, 0o000);
    let stillReadable = true;
    try { fs.readFileSync(blocked); } catch (_) { stillReadable = false; }
    assert(!stillReadable,
      '#907 z2b (' + label + '): arming axis — the sibling must be genuinely unreadable, else this leg is a '
      + 'second happy path and proves nothing');

    const extraEnv = mockEnvName ? { [mockEnvName]: path.join(fx.binDir, 'gh.js') } : null;
    const result = runSinkAt(sinkScript, fx, ['--issue', String(issue), '--keep-issue-open'], extraEnv);
    const out = lastJson(result);

    assert(out && out.result === 'refuse' && out.reason === 'sink_incomplete' && out.step === 'archive_commit',
      '#907 z2b (' + label + '): the sink must refuse sink_incomplete at archive_commit. A `.git`-named FILE is '
      + 'not a repository boundary — git commits its neighbours normally — so treating that directory as one '
      + 'would take this file out of the required set and publish a complete-looking record of an archive '
      + 'missing it; got ' + JSON.stringify(out) + '\nstderr: ' + String(result.stderr || '').slice(-600));
    assert(!(out && out.status === 'sinked'),
      '#907 z2b (' + label + '): status must NOT be sinked; got ' + JSON.stringify(out && out.status));
    const missing = (out && out.archive_missing_paths) || [];
    assert(missing.indexOf(archiveRel + '/has-a-git-file/unreadable-evidence.md') !== -1,
      '#907 z2b (' + label + '): the refusal must NAME the sibling the commit does not carry — a count is not a '
      + 'diagnosis, and an unnamed loss under a `.git`-bearing directory is exactly the silence this pin '
      + 'exists to break; got ' + JSON.stringify(missing));
    // The `.git` file itself is never demanded of the commit: the ENTRY skip is correct and unchanged.
    assert(!missing.some(p => p.endsWith('/.git')),
      '#907 z2b (' + label + '): the `.git` entry itself must never be a required path; got ' + JSON.stringify(missing));
    assert(fs.existsSync(path.join(benignDir, 'readable-evidence.md')),
      '#907 z2b (' + label + '): the refusal must destroy nothing — the on-disk archive survives for the re-run');
  } finally {
    try { fs.chmodSync(blocked, 0o644); } catch (_) {}
    cleanup(fx);
  }
}

// (z3) #907 — A COMMITTED SYMLINK POINTING OUT OF THE ARCHIVE MUST BE REPORTED, NEVER SILENTLY GREEN.
//
// The blob gate structurally cannot ask this. `blobPathsUnder` reads `ls-tree --name-only`, which
// lists a `120000` entry by name exactly like a `100644` one, and `scanArchiveTree` deliberately
// admits symlinks into `required[]` (#901 — a link IS staged, as a blob whose content is the target
// string). Both halves are right alone; together they answer "carried" for a POINTER to content the
// archive does not hold. `missingBlobs` comes back empty, `archive_commit` reads done, the sink exits
// 0 reporting `status: sinked`, and a fresh clone gets a dangling link that `git status` calls clean.
// That is a green completeness verdict over content that did not travel.
//
// POSTURE IS REPORT, NEVER REFUSE, and that is pinned as hard as the report itself: the only path that
// puts a link in the archive band is the crash-resume rescue, and refusing over rescued evidence would
// destroy more than it protects. Exit 0 stays 0, `missingBlobs` stays untouched, `archive_commit`
// stays done — what changes is that `receipt.archive_unbacked_symlinks` names the links.
//
// BOTH HALVES, AS AN EXACT SET. Over-reporting is as wrong as under-reporting: a link to a sibling
// INSIDE the archive travels with the archive and resolves in any clone, so naming it would be a false
// alarm on a healthy run, and an alarm that fires on healthy runs is how a real one gets ignored. The
// five links below are one archive, so both directions are decided by the same code on the same run.
function assertUnbackedSymlinksAreReported907(label, sinkScript, project, issue, mockEnvName) {
  console.log('Test (#907 z3 ' + label + '): an archived symlink whose target the archive does not carry must be NAMED on the receipt while the sink still completes — and a link pointing INSIDE the archive must not be named at all');
  const fx = buildGitignoredArchiveSinkFixture(project, issue, { gitignoreBody: 'node_modules/\n' });
  const archiveRel = 'kaola-workflow/archive/' + project;
  try {
    // The out-of-archive target lives OUTSIDE the repository entirely — inside it, it would be
    // untracked foreign dirt and the sink would refuse at preflight over the fixture rather than
    // reach the gate.
    const outsideAbs = path.join(fx.binDir, 'outside-the-run-folder', 'big-evidence.md');
    fs.mkdirSync(path.dirname(outsideAbs), { recursive: true });
    fs.writeFileSync(outsideAbs, 'the real bytes, outside the archive\n');
    const subDir = path.join(fx.archiveDir, 'sub');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(fx.archiveDir, '.cache', 'inside-target.md'), 'a target the archive itself carries\n');

    const L1 = path.join(fx.archiveDir, 'L1-absolute-outside.md');
    const L2 = path.join(subDir, 'L2-relative-inside.md');
    const L3 = path.join(fx.archiveDir, 'L3-dangling.md');
    const L4 = path.join(subDir, 'L4-relative-escape.md');
    const L5 = path.join(fx.archiveDir, 'L5-relative-inside-shallow.md');
    fs.symlinkSync(outsideAbs, L1);                                              // absolute, outside
    fs.symlinkSync('../.cache/inside-target.md', L2);                            // relative, inside
    fs.symlinkSync('/nonexistent/kw-z3/gone.md', L3);                            // dangling
    fs.symlinkSync(path.relative(subDir, outsideAbs), L4);                       // relative, escapes
    fs.symlinkSync('.cache/inside-target.md', L5);                               // relative, inside
    // The escape must genuinely leave the archive, else the "reported" half would be asserting about a
    // link that is in fact inside it.
    assert(path.resolve(subDir, fs.readlinkSync(L4)) === outsideAbs,
      '#907 z3 (' + label + ') premise: the relative-escape link must resolve OUTSIDE the archive; '
      + JSON.stringify(fs.readlinkSync(L4)) + ' -> ' + path.resolve(subDir, fs.readlinkSync(L4)));

    const extraEnv = mockEnvName ? { [mockEnvName]: path.join(fx.binDir, 'gh.js') } : null;
    const result = runSinkAt(sinkScript, fx, ['--issue', String(issue), '--keep-issue-open'], extraEnv);
    const out = lastJson(result);

    // REPORT, NEVER REFUSE — all four clauses, because the incident is that the run looks healthy and
    // a fix that made it refuse would be a different defect on a rescue path.
    assert(result.status === 0, '#907 z3 (' + label + '): the sink must still exit 0 — the bytes are not lost, they '
      + 'are unreachable from the archive, and refusing over rescued evidence destroys more than it protects; got '
      + result.status + '\nstderr: ' + String(result.stderr || '').slice(-600));
    assert(out && out.status === 'sinked',
      '#907 z3 (' + label + '): status must stay sinked; got ' + JSON.stringify(out && out.status));
    const receipt = (out && out.receipt) || {};
    assert(!(Array.isArray(receipt.archive_missing_paths) && receipt.archive_missing_paths.length),
      '#907 z3 (' + label + '): missingBlobs must be untouched — a committed link IS a blob, and re-routing it '
      + 'through the refusal path would brick the one posture that produces one; got '
      + JSON.stringify(receipt.archive_missing_paths));
    assert(receipt.steps && receipt.steps.archive_commit === 'done',
      '#907 z3 (' + label + '): archive_commit must still read done; got ' + JSON.stringify(receipt.steps));

    // PREMISE — git committed all five as 120000. Without this the discrimination below could pass
    // because nothing was ever a symlink in the commit.
    const modes = new Map(treeEntriesUnder(fx.tmpRoot, 'HEAD', archiveRel).map(e => [e.path, e.mode]));
    const rel = {
      L1: archiveRel + '/L1-absolute-outside.md',
      L2: archiveRel + '/sub/L2-relative-inside.md',
      L3: archiveRel + '/L3-dangling.md',
      L4: archiveRel + '/sub/L4-relative-escape.md',
      L5: archiveRel + '/L5-relative-inside-shallow.md',
    };
    for (const k of Object.keys(rel)) {
      assert(modes.get(rel[k]) === '120000',
        '#907 z3 (' + label + ') premise: ' + k + ' must be committed as a 120000 symlink blob — that mode is '
        + 'exactly what the blob gate cannot distinguish from content; got ' + JSON.stringify(modes.get(rel[k]))
        + ' of ' + JSON.stringify([...modes]));
    }

    // THE DISCRIMINATION, as an exact set. Entries are `<path> -> <target>`; matched on the path.
    const named = (Array.isArray(receipt.archive_unbacked_symlinks) ? receipt.archive_unbacked_symlinks : [])
      .map(s => String(s).split(' -> ')[0]).sort();
    const want = [rel.L1, rel.L3, rel.L4].sort();
    assert(JSON.stringify(named) === JSON.stringify(want),
      '#907 z3 (' + label + '): receipt.archive_unbacked_symlinks must name EXACTLY the three links whose target '
      + 'the archive does not carry — an absolute path outside it, a dangling one, and one that escapes by '
      + 'relative traversal — and must NOT name the two that point back inside it, which travel with the archive '
      + 'and resolve in any clone. Under-reporting is the green verdict over content that did not travel; '
      + 'over-reporting cries wolf on every healthy run until nobody reads the field. got '
      + JSON.stringify(named) + '\nwant ' + JSON.stringify(want)
      + '\nstderr: ' + String(result.stderr || '').slice(-600));
  } finally {
    cleanup(fx);
  }
}

// (z4) #906/#520 — A SINK TRANSACTION JOURNAL MUST NOT REACH GIT HISTORY, AT ANY DEPTH.
//
// The journals are the one class of file the workflow declares must never be committed anywhere
// (`claim.js`'s SINK_JOURNAL_RE, "never part of the deliverable, never committed"). The sink expressed
// that rule as four EXACT `:(exclude)` pathspecs, each naming `<prefix>/.cache/<journal>` — exactly one
// directory deep. #906's crash-resume backstop then began moving main's surviving live folder to
// `<archive>/<project>/.orphan-main-live-<ts>/`, whose journals sit one level DEEPER than any of them,
// and the broad `git add -- <archive>/` took them into the commit.
//
// READ WHY NOTHING CAUGHT IT, because it decides what this pin is allowed to look at: `SINK_STAGE_SKIP`
// drops both journal basenames from `required[]`, so the blob gate has nothing to report here and
// `archive_missing_paths` is silent BY DESIGN. Asking the sink's own bookkeeping would measure the
// bookkeeping. So this leg reads what git ACTUALLY COMMITTED, and nothing else.
//
// AND THE CONTROL IS HALF THE PIN. `:(exclude,glob)…/**/<name>` is only correct if it excludes nothing
// else: every planted evidence file — including the ones sitting in the same directories as the
// journals, at depth 0 and at depth 2 — must still be a blob at HEAD. An exclusion that swallowed the
// rescued run record would be a worse defect than the leak it fixes.
function assertJournalsNeverReachHistory906(label, sinkScript, project, issue, mockEnvName) {
  console.log('Test (#906 z4 ' + label + '): sink transaction journals must be absent from the published tree at EVERY depth — including the crash-resume orphan the fixed-depth pathspecs missed — while every evidence file beside them still lands');
  const fx = buildGitignoredArchiveSinkFixture(project, issue, { gitignoreBody: 'node_modules/\n' });
  const archiveRel = 'kaola-workflow/archive/' + project;
  const orphan = '.orphan-main-live-2026-08-01T22-52-06-988Z';
  const JOURNAL_BODY = '{"schema":1,"steps":{},"note":"a transaction journal, never a deliverable"}\n';
  try {
    // The three depths, relative to the archive root. Depth 1 is what the pre-#906 pathspecs covered;
    // depth 0 and depth 2+ are what they missed, and the orphan folder is the shape that produced them.
    const journalRels = [
      'sink-receipt.json',                        // depth 0 — sitting in the archive root
      'sink-fallback.json',                       // depth 0
      '.cache/sink-fallback.json',                // depth 1 — the shape that was always covered
      orphan + '/.cache/sink-receipt.json',       // depth 2 — the leak
      orphan + '/.cache/sink-fallback.json',      // depth 2
      orphan + '/.cache/nested/sink-receipt.json',// depth 3 — `**/` spans any number, not exactly one
    ];
    // Real run evidence sharing every one of those directories. If the exclusion is written as a
    // subtree rule rather than a basename rule, these disappear with the journals.
    const evidenceRels = [
      'orphan-neighbour.md',
      orphan + '/workflow-state.md',
      orphan + '/.cache/main-only-evidence.md',
      orphan + '/.cache/nested/deep-evidence.md',
    ];
    for (const r of journalRels) {
      const abs = path.join(fx.archiveDir, r);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, JOURNAL_BODY);
      assert(fs.existsSync(abs),
        '#906 z4 (' + label + ') premise: the journal ' + r + ' is on disk before the sink runs — the exclusion '
        + 'clauses below are about a file that was there to be excluded');
    }
    for (const r of evidenceRels) {
      const abs = path.join(fx.archiveDir, r);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, 'rescued run evidence at ' + r + '\n');
    }

    const extraEnv = mockEnvName ? { [mockEnvName]: path.join(fx.binDir, 'gh.js') } : null;
    const result = runSinkAt(sinkScript, fx, ['--issue', String(issue), '--keep-issue-open'], extraEnv);
    const out = lastJson(result);
    assert(result.status === 0 && out && out.status === 'sinked',
      '#906 z4 (' + label + ') premise: the run must complete, else nothing was committed and the clauses below '
      + 'are vacuous; got exit=' + result.status + ' status=' + JSON.stringify(out && out.status)
      + ' step=' + JSON.stringify(out && out.step) + '\nstderr: ' + String(result.stderr || '').slice(-600));

    // What git actually published — the ONLY thing this leg trusts.
    const published = blobsUnder(fx.tmpRoot, 'HEAD', '.');
    const leaked = published.filter(p => /(?:^|\/)sink-(?:receipt|fallback)\.json$/.test(p));
    assert(leaked.length === 0,
      '#906 z4 (' + label + '): no sink transaction journal may exist anywhere in the published tree. These are '
      + 'disposable crash-resume scratch files the workflow declares must never be committed, and the archive '
      + 'commit is the one place a rescued folder can smuggle them in at a depth the exclude pathspecs did not '
      + 'reach; got ' + JSON.stringify(leaked));
    // ...and it stayed out by NOT BEING STAGED, not by being deleted — a "fix" that removed the files
    // would satisfy the clause above while destroying the crash-resume state they exist for. Scoped to
    // the journals the sink does not own: #653 deliberately disposes of its OWN
    // `<archive>/.cache/sink-{receipt,fallback}.json` on terminal success (sink-merge.js:1090-1092),
    // so the depth-1 entry is expected to be gone and its absence says nothing about the exclusion.
    for (const r of journalRels.filter(j => j.indexOf('.cache/') !== 0)) {
      assert(fs.existsSync(path.join(fx.archiveDir, r)),
        '#906 z4 (' + label + '): the planted journal ' + r + ' must still be on disk — an exclusion works by not '
        + 'staging the file, never by deleting it, and this one is not the sink\'s own journal to dispose of');
    }
    // THE OVER-EXCLUSION CONTROL: the evidence beside them all travelled.
    const publishedSet = new Set(published);
    for (const r of evidenceRels) {
      assert(publishedSet.has(archiveRel + '/' + r),
        '#906 z4 (' + label + '): the rescued evidence at ' + r + ' must be a BLOB at HEAD — it shares a directory '
        + 'with an excluded journal, so an exclusion written as a subtree rule instead of a basename rule would '
        + 'silently take the run record with it; got ' + JSON.stringify(published));
    }
    // ...and so did the ordinary archive evidence, unchanged by any of this.
    for (const r of ['workflow-state.md', 'finalization-summary.md', '.cache/n1-impl.md']) {
      assert(publishedSet.has(archiveRel + '/' + r),
        '#906 z4 (' + label + '): the ordinary archive evidence at ' + r + ' must still be committed; got '
        + JSON.stringify(published));
    }
  } finally {
    cleanup(fx);
  }
}

// The four sink copies again, for (z2)/(z2b)/(z3)/(z4). Same table as (z1)'s and for the same reason:
// the GitLab and Gitea sink ports are hand-maintained and compared by nothing, so a fix landing on
// three copies is invisible until a user on the fourth hits it.
[
  ['root', path.join(repoRoot, 'scripts', 'kaola-workflow-sink-merge.js'), null],
  ['codex', path.join(repoRoot, 'plugins', 'kaola-workflow', 'scripts', 'kaola-workflow-sink-merge.js'), null],
  ['gitlab', path.join(repoRoot, 'plugins', 'kaola-workflow-gitlab', 'scripts', 'kaola-gitlab-workflow-sink-merge.js'), 'KAOLA_GLAB_MOCK_SCRIPT'],
  ['gitea', path.join(repoRoot, 'plugins', 'kaola-workflow-gitea', 'scripts', 'kaola-gitea-workflow-sink-merge.js'), 'KAOLA_TEA_MOCK_SCRIPT'],
].forEach(([label, script, mockEnv], index) => {
  if (!fs.existsSync(script)) {
    assert(false, '#907 z2/z3 + #906 z4 (' + label + '): the edition sink script exists at ' + script);
    return;
  }
  assertBoundaryDiscriminationMatchesGit907(label, script, 'issue-' + (90711 + index), 90711 + index, mockEnv);
  assertBenignGitEntryKeepsTheBlobGateArmed907(label, script, 'issue-' + (90721 + index), 90721 + index, mockEnv);
  assertUnbackedSymlinksAreReported907(label, script, 'issue-' + (90731 + index), 90731 + index, mockEnv);
  assertJournalsNeverReachHistory906(label, script, 'issue-' + (90641 + index), 90641 + index, mockEnv);
});

// --------------------------------------------------------------------------- #912 preflight guard

// #912: HOW sinkPreflight asserts a clean worktree, stated once for every edition.
//
//   Every run goes through the guard. A dirty linked worktree refuses, and an unprobeable one
//   refuses too (fail closed) — "we could not verify" is never "there is nothing there".
//
// This is the expectation the GitLab and Gitea suites pin for their own copies (they cannot require
// across trees, so each edition states it in its own suite rather than importing one). The arms here
// cover the two copies those suites cannot reach.
//
// The fault comes from the script's own KAOLA_WORKFLOW_FORCE_WT_LIST_FAIL hook (#506), so what is
// exercised is the probe the shipped guard already runs. KAOLA_WORKFLOW_SINK_ABORT_AFTER=preflight
// halts the transaction the instant the preflight step records `done`, so each arm measures the
// preflight DECISION and nothing downstream of it: exit 99 is "preflight passed", and a refusal
// exits 1 carrying its typed reason on the envelope.
function assertPreflightGuardScope912(label, script) {
  const PREFLIGHT_PASSED = 99;

  const state912 = (project, branch, issue) => [
    '# Kaola-Workflow State', '',
    '## Project', 'name: ' + project, 'status: active', '',
    '## Sink', 'branch: ' + branch, 'issue_number: ' + issue, 'sink: merge', ''
  ].join('\n') + '\n';

  const mkBranched = (project, issue, dirty) => {
    const tmpRoot = makeTmpRoot();
    const remotePath = initGitRepoWithBareRemote(tmpRoot);
    const branch = 'workflow/' + project;
    git(tmpRoot, ['checkout', '-b', branch]);
    const dir = path.join(tmpRoot, 'kaola-workflow', project);
    fs.mkdirSync(path.join(dir, '.cache'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'workflow-state.md'), state912(project, branch, issue));
    fs.writeFileSync(path.join(dir, 'finalization-summary.md'), '# Finalization Summary\n\nREADY FOR FINAL GIT GATE\n');
    fs.writeFileSync(path.join(tmpRoot, 'FEATURE.txt'), 'feature\n');
    git(tmpRoot, ['add', '-A']);
    git(tmpRoot, ['commit', '-m', 'feat: deliverable']);
    git(tmpRoot, ['push', '-u', 'origin', branch]);
    git(tmpRoot, ['checkout', 'main']);
    const wt = tmpRoot + '-linked-wt';
    git(tmpRoot, ['worktree', 'add', wt, branch]);
    if (dirty) fs.writeFileSync(path.join(wt, 'FEATURE.txt'), 'uncommitted edit\n');
    return { tmpRoot, remotePath, project, issue, branch, wt };
  };

  const drop = (fx) => {
    if (fx.wt) { git(fx.tmpRoot, ['worktree', 'remove', '--force', fx.wt]); }
    for (const p of [fx.tmpRoot, fx.remotePath, fx.wt]) {
      if (!p) continue;
      try { fs.rmSync(p, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch (_) {}
    }
  };

  const preflight = (fx, extraEnv) => {
    // The measured property is this process's own exit code and the reason on its OWN envelope —
    // 'worktree_dirty' seen anywhere in aggregated output is a different fact from this preflight
    // returning it.
    // spawn-class: cli-contract
    const r = spawnSync(process.execPath,
      [script, '--branch', fx.branch, '--project', fx.project, '--issue', String(fx.issue), '--sink', '--json'],
      { cwd: fx.tmpRoot, encoding: 'utf8', timeout: 90000,
        env: Object.assign({}, process.env, {
          KAOLA_WORKFLOW_OFFLINE: '1',
          KAOLA_WORKFLOW_SINK_ABORT_AFTER: 'preflight',
        }, extraEnv || {}) });
    const out = lastJson(r);
    return { exit: r.status, envelope: out, reason: (out && out.reason) || null,
      seen: 'exit=' + r.status + ' envelope=' + JSON.stringify(out) + '\nstderr: ' + String(r.stderr || '').slice(0, 600) };
  };

  // Same arm lettering as the GitLab and Gitea suites carry, so one expectation reads the same in
  // all three.

  // (b) the data-loss guard (#346/#496/#562).
  {
    const fx = mkBranched('issue-91203', 91203, true);
    try {
      const r = preflight(fx);
      assert(r.reason === 'worktree_dirty',
        '#912 (b/' + label + '): a branch-postured run whose linked worktree has uncommitted changes must STILL '
        + 'refuse worktree_dirty — the sink force-removes that worktree, so proceeding destroys the work. Got ' + r.seen);
      assert(r.exit !== 0, '#912 (b/' + label + '): the dirty-worktree refusal must exit non-zero. Got ' + r.seen);
      assert(fs.existsSync(fx.wt) && fs.readFileSync(path.join(fx.wt, 'FEATURE.txt'), 'utf8') === 'uncommitted edit\n',
        '#912 (b/' + label + '): the refusal must leave the linked worktree and its uncommitted file byte-intact');
    } finally { drop(fx); }
  }

  // (c) the other half of (b): a clean linked worktree proceeds.
  {
    const fx = mkBranched('issue-91202', 91202, false);
    try {
      const r = preflight(fx);
      assert(r.reason === null && r.exit === PREFLIGHT_PASSED,
        '#912 (c/' + label + '): a branch-postured run with a clean linked worktree must pass preflight and refuse '
        + 'nothing. Got ' + r.seen);
    } finally { drop(fx); }
  }

  // (d) the fail-closed half of the guard (#506): a run whose probe faults must still refuse even
  // though the worktree is clean — unprobeable is "could not verify", never "nothing there".
  // Swallowing the probe fault leaves (b) and (c) green and breaks this one.
  {
    const fx = mkBranched('issue-91204', 91204, false);
    try {
      const r = preflight(fx, { KAOLA_WORKFLOW_FORCE_WT_LIST_FAIL: '1' });
      assert(r.reason === 'worktree_dirty',
        '#912 (d/' + label + '): a run whose worktree-list probe faults must STILL refuse worktree_dirty '
        + '(fail closed) — a transient enumeration fault is not evidence that there is no worktree to '
        + 'protect. Got ' + r.seen);
      assert(fs.existsSync(fx.wt),
        '#912 (d/' + label + '): the fail-closed refusal must leave the linked worktree in place');
    } finally { drop(fx); }
  }
}

// Root and codex only. The GitLab and Gitea copies are pinned by the same three arms inside their own
// suites, which is where a forge-only diff's own chain will run them.
[
  ['root', path.join(repoRoot, 'scripts', 'kaola-workflow-sink-merge.js')],
  ['codex', path.join(repoRoot, 'plugins', 'kaola-workflow', 'scripts', 'kaola-workflow-sink-merge.js')],
].forEach(([label, script]) => {
  if (!fs.existsSync(script)) {
    assert(false, '#912 (' + label + '): the edition sink script exists at ' + script);
    return;
  }
  assertPreflightGuardScope912(label, script);
});

// ------------------------------------------------- #973 the UNTRACKED half of the data-loss guard

// `assertWorktreeClean` is the only thing standing between a linked worktree carrying uncommitted
// work and `git worktree remove --force`. (#912 b) holds its TRACKED half. This holds the untracked
// half, which the tracked half does not imply: the probe is
// `git status --porcelain --untracked-files=no`, and that flag form structurally cannot report an
// untracked file — so a worktree whose only uncommitted content is untracked probes CLEAN and the
// forced removal takes it. CLAUDE.md states the invariant this restores: an operation that would
// destroy something still fails loudly, "a sink over a tree carrying uncommitted work".
//
// THE FLAG IS NOT AN ACCIDENT, and that is what makes this more than a one-character fix. It is what
// lets an ordinary run through: a run's linked worktree carries `kaola-workflow/<project>/.cache/…`
// UNTRACKED by design — the sink says so itself where it stages that directory before removing the
// worktree ("genuinely worktree-only (untracked) content, e.g. a .cache/ crash-resume journal, still
// survives"), and (#707 h) pins the sink archiving exactly that content. So three arms, and the two
// controls are the ones with teeth:
//
//   (e) GENUINE untracked work — a path that is not the workflow's own bookkeeping — must not be
//       silently destroyed.  RED at baseline.
//   (f) the workflow's OWN untracked lane content must still sink, exit unchanged.  A repair that
//       merely widens the flag passes (e) and breaks every run in the field; this is the arm that
//       says so.
//   (g) IGNORED content must still sink. Measured, and it is why (g) is a control and not a third
//       red: `--untracked-files=all` does NOT list an ignored path (a worktree whose only extra
//       content is `node_modules/…` under a committed `node_modules/` rule reports an entirely empty
//       `status --porcelain -uall`), so widening the flag cannot break this one. It is the control
//       against a repair that reaches past the flag and adds `--ignored`, which would refuse over
//       every generated tree this repo carries (`.claude/`, `.codex/`, `node_modules/`, …).
//   (h) the same as (e) over a SYMLINK, because a link is the shape actually observed — a guard
//       proven only against a regular file is unproven against the artifact that produced this.
//   (i) the same as (e) on the LEGACY (non---sink) entry point, which reaches the same forced
//       removal by a different route. A probe-side repair covers both; a repair placed inside the
//       --sink transaction covers only one, and nothing else in the corpus would notice.
//
// WHAT IS PINNED IS THE RESULT, NOT THE MECHANISM. (e) does not demand a refusal. Refusing,
// reporting-and-preserving and moving the artifact aside all satisfy it; the pair it forbids is
// "the bytes are gone" AND "nothing said so". The measurement is end to end over the real
// destructive step — no abort hook, so `git worktree remove --force` actually runs — and survival is
// searched for by NONCE across the fixture rather than tested at a fixed path, so a repair that
// relocates the file is not mistaken for one that destroyed it.
//
// Every arm runs `--keep-issue-open`, as (#906 z4) does and for the same reason: the closure
// terminal is far downstream of the guard under test, and the shared gh-shaped mock cannot serve
// every edition's close call from this fixture (the GitLab and Gitea close paths reach it from a cwd
// the cwd-honest mock rejects). Keep-open reaches the same terminal past the same worktree removal,
// so nothing these arms measure is changed by it.

// Every file under `root` whose bytes contain `needle`. Bounded (depth and hit count) because it
// runs over a live fixture, and `.git` is skipped: a committed blob is zlib-deflated and would never
// match anyway, while a stray match in git's own scratch would be a survival claim about nothing.
function filesContaining973(root, needle) {
  const hits = [];
  const walk = (dir, depth) => {
    if (depth > 12 || hits.length >= 25) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.git') continue;
        walk(abs, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      try { if (fs.readFileSync(abs, 'utf8').includes(needle)) hits.push(path.relative(root, abs)); } catch (_) {}
    }
  };
  walk(root, 0);
  return hits;
}

// Every SYMLINK under `root` whose target is `target`. The survival oracle for (h), and it cannot be
// built out of the same parts as filesContaining973 — three measured reasons, each of which would
// make the search pass silently over the very artifact it exists to find:
//   * `fs.existsSync` on `plugins/plugins -> plugins` answers FALSE: the link resolves to itself, so
//     "does it exist" is the wrong question and would report the artifact as already gone.
//   * a `Dirent` carries lstat semantics, so a symlink answers false to BOTH isFile() and
//     isDirectory() — filesContaining973's `if (!entry.isFile()) continue` walks straight past it.
//   * there are no bytes to search: the link's content is its target, read with readlink.
// Not following the link is also load-bearing — a self-referential one is an infinite descent.
function symlinksTo973(root, target) {
  const hits = [];
  const walk = (dir, depth) => {
    if (depth > 12 || hits.length >= 25) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        let link = null;
        try { link = fs.readlinkSync(abs); } catch (_) { continue; }
        if (link === target) hits.push(path.relative(root, abs));
        continue;
      }
      if (entry.isDirectory() && entry.name !== '.git') walk(abs, depth + 1);
    }
  };
  walk(root, 0);
  return hits;
}

// `git worktree remove --force` is the operation under test. A fixture that escaped the temp dir
// would run it over a real tree, so the path is proven before anything destructive is spawned.
function assertUnderTmpdir973(label, p) {
  let real = p;
  let tmp = os.tmpdir();
  try { real = fs.realpathSync(p); } catch (_) {}
  try { tmp = fs.realpathSync(tmp); } catch (_) {}
  assert(real.startsWith(tmp + path.sep),
    '#973 (' + label + ') SAFETY: the fixture must live under the temp dir before any destructive '
    + 'sink runs over it; got ' + real + ' (tmpdir ' + tmp + ')');
  return real.startsWith(tmp + path.sep);
}

function assertUntrackedWorkIsNotSilentlyDestroyed973(label, sinkScript, project, issue, mockEnvName) {
  console.log('Test (#973 e ' + label + '): a linked worktree carrying GENUINE untracked work must not be force-removed silently — the bytes survive somewhere and the operator is told');
  const NONCE = 'kw973-untracked-nonce-' + issue;
  const GENUINE_REL = 'src/util/helper.js';
  const fx = buildWorktreeEvidenceFixture(project, issue, {
    untracked: {
      // The workflow's own lane content, present exactly as an ordinary run leaves it, so this arm
      // measures the genuine file and not "the worktree had something in it".
      ['kaola-workflow/' + project + '/.cache/n1-impl.md']: 'binding: n1-impl nonce' + issue + '\n',
      // The work #975 leaves untracked in the worktree: a path finalize could not attribute, so it
      // is neither staged nor committed and nothing but this guard stands between it and the force.
      [GENUINE_REL]: '// ' + NONCE + '\nmodule.exports = function helper() { return ' + issue + '; };\n',
    },
  });
  fx.projectName = project;
  try {
    if (!assertUnderTmpdir973(label + '/e', fx.tmpRoot)) return;
    const genuineAbs = path.join(fx.wtPath, GENUINE_REL);
    assert(fs.existsSync(genuineAbs),
      '#973 (e/' + label + ') premise: the untracked file must be on disk in the linked worktree before the '
      + 'sink runs, else every clause below is vacuous; expected ' + genuineAbs);
    // The premise that makes this arm about the guard and not about git: in the flag form the guard
    // probes with, this worktree is indistinguishable from an empty one. A repair therefore cannot
    // come from that probe as written — it has to see the file some other way, or protect it later.
    const blindProbe = git(fx.wtPath, ['status', '--porcelain', '--untracked-files=no']).stdout.trim();
    assert(blindProbe === '',
      '#973 (e/' + label + ') premise: `status --porcelain --untracked-files=no` must report NOTHING over an '
      + 'untracked-only worktree — that is why the guard cannot see this file; got ' + JSON.stringify(blindProbe));

    const extraEnv = mockEnvName ? { [mockEnvName]: path.join(fx.binDir, 'gh.js') } : null;
    const result = runSinkAt(sinkScript, fx, ['--issue', String(issue), '--keep-issue-open'], extraEnv);
    const out = lastJson(result);
    const combined = String(result.stdout || '') + String(result.stderr || '');
    const survivors = filesContaining973(fx.tmpRoot, NONCE);
    // Deliberately generous, because "the operator was told" has more than one honest shape: a
    // refusal (non-zero exit), a typed finding on the envelope, or the path named in what the run
    // printed. Any one of them is being told; none of them is a mechanism this arm requires.
    const told = result.status !== 0
      || !!(out && out.reason)
      || combined.includes(GENUINE_REL)
      || combined.includes('helper.js');
    const seen = 'exit=' + result.status
      + ' status=' + JSON.stringify(out && out.status)
      + ' reason=' + JSON.stringify(out && out.reason)
      + ' worktree_still_present=' + fs.existsSync(fx.wtPath)
      + ' survivors=' + JSON.stringify(survivors)
      + '\nstderr: ' + String(result.stderr || '').slice(-500);

    assert(survivors.length > 0,
      '#973 (e/' + label + '): the untracked work must still exist after the sink. `git worktree remove --force` '
      + 'is what runs here, and nothing else in the transaction is holding this file: it is not staged, not '
      + 'committed and not under kaola-workflow/. Leaving the worktree standing, preserving the file elsewhere '
      + 'and copying it aside all satisfy this; destroying it does not. ' + seen);
    assert(told,
      '#973 (e/' + label + '): the sink must not report unqualified success over a worktree carrying uncommitted '
      + 'work. A non-zero exit, a typed reason on the envelope, or the path named in the output all count — '
      + 'silence does not. ' + seen);
  } finally {
    cleanup(fx);
  }
}

function assertOwnLaneContentStillSinks973(label, sinkScript, project, issue, mockEnvName) {
  console.log('Test (#973 f ' + label + '): a worktree carrying ONLY the workflow\'s own untracked lane content must still sink, exit unchanged — the flag the guard uses is what lets an ordinary run through');
  const fx = buildWorktreeEvidenceFixture(project, issue, {
    untracked: {
      ['kaola-workflow/' + project + '/.cache/n1-impl.md']: 'binding: n1-impl nonce' + issue + '\n',
      ['kaola-workflow/' + project + '/.cache/n2-review.md']: 'binding: n2-review nonce' + issue + '\n\nverdict: pass\n',
      ['kaola-workflow/' + project + '/.cache/sink-fallback.json']: '{"schema":1}\n',
    },
  });
  fx.projectName = project;
  try {
    if (!assertUnderTmpdir973(label + '/f', fx.tmpRoot)) return;
    // The premise: this content IS untracked, so a guard that counts untracked files at all counts
    // these. Without this the arm could pass because the fixture accidentally committed them.
    const wide = git(fx.wtPath, ['status', '--porcelain', '-uall']).stdout.trim();
    assert(wide.split('\n').filter(Boolean).length === 3,
      '#973 (f/' + label + ') premise: the three lane files must be UNTRACKED in the worktree — otherwise this '
      + 'control cannot catch a guard that refuses on untracked content; got ' + JSON.stringify(wide));

    const extraEnv = mockEnvName ? { [mockEnvName]: path.join(fx.binDir, 'gh.js') } : null;
    const result = runSinkAt(sinkScript, fx, ['--issue', String(issue), '--keep-issue-open'], extraEnv);
    const out = lastJson(result);
    assert(result.status === 0 && out && out.status === 'sinked',
      '#973 (f/' + label + '): the run must still complete. Every run leaves untracked lane content in its '
      + 'worktree, so a guard that treats untracked-means-dirty refuses EVERY sink — green in isolation on the '
      + 'destructive arm, and broken in the field. got exit=' + result.status
      + ' status=' + JSON.stringify(out && out.status)
      + ' reason=' + JSON.stringify(out && out.reason)
      + '\nstderr: ' + String(result.stderr || '').slice(-600));
  } finally {
    cleanup(fx);
  }
}

function assertIgnoredContentStillSinks973(label, sinkScript, project, issue, mockEnvName) {
  console.log('Test (#973 g ' + label + '): a worktree carrying only GITIGNORED content must still sink — the third population at this seam, and the control against a guard that reaches past --untracked-files into --ignored');
  const fx = buildWorktreeEvidenceFixture(project, issue, {
    gitignore: 'node_modules/\nbuild/\n',
    untracked: {
      'node_modules/left-pad/index.js': 'module.exports = function () { return ' + issue + '; };\n',
      'build/out.js': '// generated\n',
    },
  });
  fx.projectName = project;
  try {
    if (!assertUnderTmpdir973(label + '/g', fx.tmpRoot)) return;
    // The measured answer to "should ignored files count?": git does not offer them to any
    // --untracked-files setting, so a repair that widens the flag never sees them, and a repair
    // that asks for them has gone looking. Recorded here so the boundary is a fact, not a choice.
    const wide = git(fx.wtPath, ['status', '--porcelain', '-uall']).stdout.trim();
    assert(wide === '',
      '#973 (g/' + label + ') premise: `status --porcelain -uall` must report NOTHING over ignored-only content '
      + '— ignored is a population NO --untracked-files setting reaches; got ' + JSON.stringify(wide));

    const extraEnv = mockEnvName ? { [mockEnvName]: path.join(fx.binDir, 'gh.js') } : null;
    const result = runSinkAt(sinkScript, fx, ['--issue', String(issue), '--keep-issue-open'], extraEnv);
    const out = lastJson(result);
    assert(result.status === 0 && out && out.status === 'sinked',
      '#973 (g/' + label + '): the run must still complete over ignored content. Ignored trees are generated and '
      + 'disposable — this repo carries several in every checkout — so a guard that counts them refuses every '
      + 'sink. got exit=' + result.status
      + ' status=' + JSON.stringify(out && out.status)
      + ' reason=' + JSON.stringify(out && out.reason)
      + '\nstderr: ' + String(result.stderr || '').slice(-600));
  } finally {
    cleanup(fx);
  }
}

function assertUntrackedSymlinkIsNotSilentlyDestroyed973(label, sinkScript, project, issue, mockEnvName) {
  console.log('Test (#973 h ' + label + '): the same, over a SYMLINK — the shape actually observed. A guard proven only against a regular file is unproven against the artifact that produced this');
  const LINK_REL = 'plugins/plugins';
  const LINK_TARGET = 'plugins';
  const fx = buildWorktreeEvidenceFixture(project, issue, {
    untracked: { ['kaola-workflow/' + project + '/.cache/n1-impl.md']: 'binding: n1-impl nonce' + issue + '\n' },
    symlinks: { [LINK_REL]: LINK_TARGET },
  });
  fx.projectName = project;
  try {
    if (!assertUnderTmpdir973(label + '/h', fx.tmpRoot)) return;
    const linkAbs = path.join(fx.wtPath, LINK_REL);
    assert(fs.lstatSync(linkAbs).isSymbolicLink() && fs.readlinkSync(linkAbs) === LINK_TARGET,
      '#973 (h/' + label + ') premise: the untracked path must really be a symlink to ' + LINK_TARGET
      + ' before the sink runs; expected ' + linkAbs);
    // The premise that dictates the oracle, and it is worth asserting rather than assuming: this link
    // resolves to itself, so `existsSync` answers FALSE while the link is sitting right there. A
    // survivor check written on existsSync would report the artifact destroyed before the sink ran.
    assert(fs.existsSync(linkAbs) === false,
      '#973 (h/' + label + ') premise: `existsSync` must answer false on the self-referential link — that is why '
      + 'the survival oracle is lstat and not existsSync');
    const wide = git(fx.wtPath, ['status', '--porcelain', '-uall']).stdout;
    assert(wide.includes('?? ' + LINK_REL),
      '#973 (h/' + label + ') premise: git must report the link as UNTRACKED, else there is nothing for a widened '
      + 'probe to have seen; got ' + JSON.stringify(wide.trim()));
    const blindProbe = git(fx.wtPath, ['status', '--porcelain', '--untracked-files=no']).stdout.trim();
    assert(blindProbe === '',
      '#973 (h/' + label + ') premise: the guard\'s own flag form must report NOTHING over it; got '
      + JSON.stringify(blindProbe));

    const extraEnv = mockEnvName ? { [mockEnvName]: path.join(fx.binDir, 'gh.js') } : null;
    const result = runSinkAt(sinkScript, fx, ['--issue', String(issue), '--keep-issue-open'], extraEnv);
    const out = lastJson(result);
    const combined = String(result.stdout || '') + String(result.stderr || '');
    const survivors = symlinksTo973(fx.tmpRoot, LINK_TARGET);
    const told = result.status !== 0 || !!(out && out.reason) || combined.includes(LINK_REL);
    const seen = 'exit=' + result.status
      + ' status=' + JSON.stringify(out && out.status)
      + ' reason=' + JSON.stringify(out && out.reason)
      + ' worktree_still_present=' + fs.existsSync(fx.wtPath)
      + ' surviving_links=' + JSON.stringify(survivors)
      + '\nstderr: ' + String(result.stderr || '').slice(-500);

    assert(survivors.length > 0,
      '#973 (h/' + label + '): the untracked SYMLINK must still exist after the sink, by lstat. A link is what the '
      + 'run that motivated this actually left behind, and `git worktree remove --force` unlinks it like anything '
      + 'else. ' + seen);
    assert(told,
      '#973 (h/' + label + '): the sink must not report unqualified success over a worktree carrying an uncommitted '
      + 'symlink. ' + seen);
  } finally {
    cleanup(fx);
  }
}

// (i) The LEGACY (non---sink) entry point reaches the same `git worktree remove --force` by a
// different route: main() runs its preconditions and then Step 3 removes the worktree, where the
// transaction runs sinkPreflight and removes it inside the merge step. Both call the SAME
// assertWorktreeClean, so a probe-side repair satisfies both — but a repair written into the --sink
// transaction satisfies only one, and nothing else in this corpus drives the legacy path over a
// worktree that has anything to lose. Pinning the result on both entry points says which repairs are
// complete without saying where the repair belongs.
//
// THE FIXTURE POSTURE IS FORCED, from both ends, and every constraint below was measured by trying
// the alternative and reading what came back:
//   * the run folder must NOT be on the BRANCH TIP — the legacy path reports `run_not_finalized`
//     there and stops;
//   * it must NOT be archived either — the GitLab and Gitea legacy paths early-exit 3
//     ("project archived … fallback receipt written") over an already-archived project, before
//     touching git. Root and codex do not, which is why an archived fixture looks fine on two
//     editions and dies on the other two;
//   * it must therefore be LIVE in the main root and UNTRACKED there: untracked keeps it invisible
//     to `assertCleanWorktree` (`--untracked-files=no`) and out of the branch, so `git checkout
//     <branch>` has nothing to collide with;
//   * and `finalization-summary.md` must satisfy /Final Validation/i AND /pass/i AND no
//     /blocked|failed/ — the GitLab and Gitea `finalValidationPassed` gate, which root and codex do
//     not carry. The `READY FOR FINAL GIT GATE` body the other legacy fixture here uses fails it;
//     the pre-existing legacy tests drive the root script only, so nothing had ever run that gate.
// This is the in-place posture — a live run in the main root, its deliverable on the branch, and a
// linked worktree still standing. (i-control) is what keeps all of it honest: if any constraint
// drifts, the fixture stops completing and (i-control) reds rather than (i) passing on silence.
function buildLegacyWorktreeFixture973(project, issue, opts) {
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
  git(tmpRoot, ['add', '-A']);
  git(tmpRoot, ['commit', '-m', 'chore: roadmap']);
  git(tmpRoot, ['push', 'origin', 'main']);

  // branch: the deliverable, and nothing under kaola-workflow/ — real implementation, no run state.
  git(tmpRoot, ['checkout', '-b', branch]);
  fs.writeFileSync(path.join(tmpRoot, 'IMPL-' + issue + '.txt'), 'real implementation\n');
  git(tmpRoot, ['add', '-A']);
  git(tmpRoot, ['commit', '-m', 'feat: implementation']);
  git(tmpRoot, ['push', '-u', 'origin', branch]);
  git(tmpRoot, ['checkout', 'main']);

  // The live run folder, written back on main and never committed anywhere. Order matters: writing
  // it before the branch commit would sweep it into that commit via `git add -A`.
  const liveDir = path.join(tmpRoot, 'kaola-workflow', project);
  fs.mkdirSync(path.join(liveDir, '.cache'), { recursive: true });
  fs.writeFileSync(path.join(liveDir, 'workflow-state.md'), liveState(project, issue, new Date().toISOString()));
  fs.writeFileSync(path.join(liveDir, 'workflow-plan.md'), runPlanDoc('legacy in-place run'));
  fs.writeFileSync(path.join(liveDir, 'finalization-summary.md'),
    '# Finalization Summary\n\n## Final Validation\n\nverdict: pass\n\nREADY FOR FINAL GIT GATE\n');
  fs.writeFileSync(path.join(liveDir, '.cache', 'n1.md'), '# n1 evidence\n\nverdict: pass\n');

  const wtPath = path.join(tmpRoot, '.kw', 'worktrees', project);
  git(tmpRoot, ['worktree', 'add', wtPath, branch]);
  plantWorktreeUntracked973(wtPath, opts);

  return { tmpRoot, remotePath, binDir, logFile, branch, projectName: project, wtPath };
}

function assertLegacyEntryPointHoldsTheSameLine973(label, sinkScript, project, issue, mockEnvName, laneControlCompleted) {
  console.log('Test (#973 i ' + label + '): the LEGACY (non---sink) entry point reaches the same forced removal — genuine untracked work must not be silently destroyed there either');
  const NONCE = 'kw973-legacy-nonce-' + issue;
  const GENUINE_REL = 'src/util/helper.js';
  const fx = buildLegacyWorktreeFixture973(project, issue, {
    untracked: {
      ['kaola-workflow/' + project + '/.cache/n1-impl.md']: 'binding: n1-impl nonce' + issue + '\n',
      [GENUINE_REL]: '// ' + NONCE + '\nmodule.exports = function helper() { return ' + issue + '; };\n',
    },
  });
  try {
    if (!assertUnderTmpdir973(label + '/i', fx.tmpRoot)) return;
    const genuineAbs = path.join(fx.wtPath, GENUINE_REL);
    assert(fs.existsSync(genuineAbs),
      '#973 (i/' + label + ') premise: the untracked file must be on disk in the linked worktree before the legacy '
      + 'sink runs; expected ' + genuineAbs);

    const extraEnv = mockEnvName ? { [mockEnvName]: path.join(fx.binDir, 'gh.js') } : null;
    const result = runSinkLegacyAt(sinkScript, fx, ['--issue', String(issue), '--keep-issue-open'], extraEnv);
    const out = lastJson(result);
    const combined = String(result.stdout || '') + String(result.stderr || '');
    const survivors = filesContaining973(fx.tmpRoot, NONCE);
    const told = result.status !== 0
      || !!(out && out.reason)
      || combined.includes(GENUINE_REL)
      || combined.includes('helper.js');
    const seen = 'exit=' + result.status
      + ' status=' + JSON.stringify(out && out.status)
      + ' reason=' + JSON.stringify(out && out.reason)
      + ' worktree_still_present=' + fs.existsSync(fx.wtPath)
      + ' survivors=' + JSON.stringify(survivors)
      + '\nstderr: ' + String(result.stderr || '').slice(-500);

    // ================= NON-VACUITY, and it is the load-bearing part of this arm =================
    //
    // Any early stop for a reason this arm is not about leaves the worktree standing AND exits
    // non-zero — which satisfies the survival clause and the `told` clause at once, while measuring
    // nothing. This is not hypothetical: it was live here. The GitLab and Gitea legacy paths carry
    // two preconditions root and codex do not — `finalValidationPassed` (gitlab :1079, gitea :1090)
    // and an archived early-exit returning exit 3 (gitlab :1103) — and an earlier fixture posture
    // tripped both, so this arm was GREEN on two editions and measuring nothing on them.
    //
    // The check CANNOT be "an envelope was emitted". main()'s terminal is
    // `catch (err) { stderr; exitCode = 1 }` (:3275), so this entry point emits no JSON for ANY
    // throw — including a legitimate refusal repair inside assertWorktreeClean. Requiring an
    // envelope would forbid that repair family, which is pinning the mechanism.
    //
    // What is required instead is POSITIVE evidence that this edition drives this fixture to the
    // destructive step at all, and (i-control) is exactly that measurement: same builder, same entry
    // point, lane-only content, run to completion. It is passed in rather than re-run, so the two
    // arms cost one run each and cannot disagree about the fixture.
    assert(laneControlCompleted === true,
      '#973 (i/' + label + ') premise: (i-control) must have COMPLETED on this edition. This arm measures nothing '
      + 'on an edition where the legacy path stops before the guard — the worktree survives and the non-zero exit '
      + 'reads as "told", so both clauses below pass on silence. If (i-control) is red, read that first: this arm '
      + 'is not evidence here. ' + seen);
    // The archived early-exit's own code, called out separately because it is the one stop that
    // reports SUCCESS-ish (a fallback receipt) rather than an error, and no repair can legitimately
    // produce it here.
    assert(result.status !== 3,
      '#973 (i/' + label + ') premise: exit 3 is the sink\'s "project already archived — nothing done" fallback. '
      + 'It means the run never reached the worktree removal, so neither clause below is about this guard. ' + seen);
    const unrelated = ['run_not_finalized', 'no_implementation_changes', 'sink_blocked', 'unknown_flag'];
    assert(!(out && unrelated.includes(out.reason)),
      '#973 (i/' + label + ') premise: the legacy run must not stop on a precondition this arm is not about — it '
      + 'would leave the worktree standing for the wrong reason and pass both clauses vacuously. ' + seen);

    assert(survivors.length > 0,
      '#973 (i/' + label + '): the untracked work must still exist after the LEGACY sink. Step 3 of main() force-'
      + 'removes the same worktree the transaction does; a repair that covers only the --sink path leaves this '
      + 'entry point destroying work. ' + seen);
    assert(told,
      '#973 (i/' + label + '): the legacy sink must not report unqualified success over a worktree carrying '
      + 'uncommitted work. ' + seen);
  } finally {
    cleanup(fx);
  }
}

// (i-control) the must-not-break half of (i), and — because it RETURNS its outcome — (i)'s
// non-vacuity premise on this edition. Without it a legacy-path repair may refuse on the untracked
// lane content every run leaves (the same trap (f) holds for the transaction path), and nothing
// would notice an (i) that never reached the guard at all.
//
// The success terminal is the legacy path's own and is NOT `sinked`: main() reports `status:merged`
// (`kaola-workflow-sink-merge.js:1131`); `sinked` belongs to the --sink transaction. What is required
// here is that the run completed and refused nothing; which word it completes with belongs to that
// entry point, not to this arm. Every pre-existing legacy test asserts exit 0 and never the token.
//
// Returns true iff this edition drove the fixture to a clean completion.
function assertLegacyOwnLaneContentStillSinks973(label, sinkScript, project, issue, mockEnvName) {
  console.log('Test (#973 i-control ' + label + '): the LEGACY entry point over a worktree carrying ONLY the workflow\'s own untracked lane content must still complete');
  const fx = buildLegacyWorktreeFixture973(project, issue, {
    untracked: {
      ['kaola-workflow/' + project + '/.cache/n1-impl.md']: 'binding: n1-impl nonce' + issue + '\n',
      ['kaola-workflow/' + project + '/.cache/n2-review.md']: 'binding: n2-review nonce' + issue + '\n\nverdict: pass\n',
    },
  });
  try {
    if (!assertUnderTmpdir973(label + '/i-control', fx.tmpRoot)) return false;
    const wide = git(fx.wtPath, ['status', '--porcelain', '-uall']).stdout.trim();
    assert(wide.split('\n').filter(Boolean).length === 2,
      '#973 (i-control/' + label + ') premise: the two lane files must be UNTRACKED in the worktree; got '
      + JSON.stringify(wide));

    const extraEnv = mockEnvName ? { [mockEnvName]: path.join(fx.binDir, 'gh.js') } : null;
    const result = runSinkLegacyAt(sinkScript, fx, ['--issue', String(issue), '--keep-issue-open'], extraEnv);
    const out = lastJson(result);
    const completed = result.status === 0 && !!out && !out.reason && out.result !== 'refuse' && out.result !== 'report';
    assert(completed,
      '#973 (i-control/' + label + '): the legacy run must still complete over lane-only untracked content — every '
      + 'run leaves it, so a guard that counts it refuses every legacy sink. This also carries (i)\'s non-vacuity: '
      + 'if this fixture cannot complete, (i) proves nothing. got exit='
      + result.status + ' status=' + JSON.stringify(out && out.status)
      + ' result=' + JSON.stringify(out && out.result)
      + ' reason=' + JSON.stringify(out && out.reason)
      + '\nstderr: ' + String(result.stderr || '').slice(-600));
    return completed;
  } finally {
    cleanup(fx);
  }
}

// All four sink copies. The data-loss guard is hand-ported per forge (the GitLab and Gitea sinks are
// separate files, compared by nothing), and all four carry the same blind probe — so a repair that
// lands on three of them is invisible until a user on the fourth loses work.
[
  ['root', path.join(repoRoot, 'scripts', 'kaola-workflow-sink-merge.js'), null],
  ['codex', path.join(repoRoot, 'plugins', 'kaola-workflow', 'scripts', 'kaola-workflow-sink-merge.js'), null],
  ['gitlab', path.join(repoRoot, 'plugins', 'kaola-workflow-gitlab', 'scripts', 'kaola-gitlab-workflow-sink-merge.js'), 'KAOLA_GLAB_MOCK_SCRIPT'],
  ['gitea', path.join(repoRoot, 'plugins', 'kaola-workflow-gitea', 'scripts', 'kaola-gitea-workflow-sink-merge.js'), 'KAOLA_TEA_MOCK_SCRIPT'],
].forEach(([label, script, mockEnv], index) => {
  if (!fs.existsSync(script)) {
    assert(false, '#973 (' + label + '): the edition sink script exists at ' + script);
    return;
  }
  assertUntrackedWorkIsNotSilentlyDestroyed973(label, script, 'issue-' + (97301 + index), 97301 + index, mockEnv);
  assertOwnLaneContentStillSinks973(label, script, 'issue-' + (97311 + index), 97311 + index, mockEnv);
  assertIgnoredContentStillSinks973(label, script, 'issue-' + (97321 + index), 97321 + index, mockEnv);
  assertUntrackedSymlinkIsNotSilentlyDestroyed973(label, script, 'issue-' + (97331 + index), 97331 + index, mockEnv);
  // (i-control) runs FIRST and its outcome is (i)'s non-vacuity premise — see the note inside (i).
  const laneControlCompleted =
    assertLegacyOwnLaneContentStillSinks973(label, script, 'issue-' + (97351 + index), 97351 + index, mockEnv);
  assertLegacyEntryPointHoldsTheSameLine973(label, script, 'issue-' + (97341 + index), 97341 + index, mockEnv,
    laneControlCompleted);
});

// ------------------------------------------------- #978 three shapes the lane exemption still hands to the force

// (#973 e–i) armed the untracked half of the data-loss guard, and its exemption — isParkedLanePath
// over the DECODED porcelain record, empty owned set — is what lets an ordinary run's own lane
// content through ((f) holds why that exemption must exist). #978 is the residue of that boundary:
// three shapes where uncommitted work still reaches `git worktree remove --force` with nothing
// said. All three were destroyed by the pre-#973 blind probe too — residuals, not regressions.
// Three arms, all four editions, same lettering space as (e)–(i):
//
//   (j) a file literally NAMED `kaola-workflow\<seg>\<name>` — ONE root-level path component with
//       backslashes in it. git C-quotes the record (`?? "kaola-workflow\\<seg>\\<name>"`, under
//       either core.quotePath setting), the porcelain parser decodes the quoting back to the
//       literal on-disk name — correctly; that contract is what keeps `git add -- <path>` matching
//       the file — and the classifier then normalises `\` to `/` and reads a parked lane where the
//       disk holds a single file that is not under kaola-workflow/ at all. The probe REPORTS the
//       file (premised below); the guard passes over it anyway, and the --sink stage cannot save
//       it (it copies the own-project lane directory only, and this name is not under it).
//   (k) an embedded git repository under a FOREIGN lane segment. `-uall` emits ONE collapsed
//       record for an embedded repo (`?? kaola-workflow/<seg>/` — a plain foreign-lane directory
//       reports per-file; the collapse is the embedded-repo behaviour, premised below). The
//       collapse does not flip the classifier — plain files under a foreign lane are individually
//       exempt by design — it changes the POPULATION: an entire repository, uncommitted files AND
//       its own .git holding committed-but-unpushed history, hides behind one exempted segment. A
//       parked lane is throwaway bookkeeping; a repository is not.
//   (l) the LEGACY (non---sink) entry point and the run's OWN journal. The --sink merge step
//       stages `<wt>/kaola-workflow/<project>/` before removing the worktree and lands the
//       worktree-only files after checkout — (#707 h) pins that content reaching the archive — so
//       preserving the crash journal is the transaction's ORDINARY outcome. Step 3 of main()
//       reaches the same forced removal with no stage anywhere on its route, and (i-control)
//       forbids the other repair — refusing over lane content refuses every legacy sink — so on
//       this entry point survival is the only outcome that holds both.
//
// WHAT IS PINNED IS THE RESULT, NOT THE MECHANISM, exactly as (e) pins it: the bytes still exist
// somewhere — searched by NONCE across the fixture, with a pre-run positive control proving the
// search sees them while they exist, so a repair that relocates them is not mistaken for one that
// destroyed them — and, for (j)/(k), no unqualified success is reported over them. A stricter lane
// predicate, a refusal on the undecodable shapes, a descent into collapsed records, a legacy-route
// stage: any of them satisfies these arms; which one ships is the fixer's call. (l) accepts no
// "told" in place of survival: its content is the workflow's own journal, and a completed run that
// named the file while destroying it would still have destroyed the only copy.

function assertBackslashLaneNameIsNotSilentlyDestroyed978(label, sinkScript, project, issue, mockEnvName) {
  console.log('Test (#978 j ' + label + '): a file literally NAMED kaola-workflow\\<seg>\\<name> — one root-level component — must not be force-removed silently; the classifier reads a parked lane where the disk holds genuine work');
  const NONCE = 'kw978-backslash-nonce-' + issue;
  const SEG = 'proj' + issue;
  const BS_REL = 'kaola-workflow\\' + SEG + '\\notes.md'; // ONE component: backslash is a name char here, not a separator
  const fx = buildWorktreeEvidenceFixture(project, issue, {
    untracked: {
      // The workflow's own lane content, present exactly as an ordinary run leaves it, so the
      // guard's decision is about the backslash name and not about an otherwise-empty worktree.
      ['kaola-workflow/' + project + '/.cache/n1-impl.md']: 'binding: n1-impl nonce' + issue + '\n',
      [BS_REL]: '// ' + NONCE + '\nsurvey notes — genuine work, not lane bookkeeping\n',
    },
  });
  fx.projectName = project;
  try {
    if (!assertUnderTmpdir973(label + '/j', fx.tmpRoot)) return;
    assert(fs.readdirSync(fx.wtPath).includes(BS_REL),
      '#978 (j/' + label + ') premise: the worktree ROOT must hold a single entry named ' + BS_REL
      + ' — if the fixture split it into directories this arm is measuring a lane tree, not the name');
    // The premise that separates this arm from (e): the guard\'s own probe form REPORTS this file.
    // Blindness is not the failure here; classification is.
    const wide = git(fx.wtPath, ['status', '--porcelain', '-uall']).stdout;
    assert(wide.includes('?? "kaola-workflow\\\\' + SEG + '\\\\notes.md"'),
      '#978 (j/' + label + ') premise: `status --porcelain -uall` must report the C-quoted record for the '
      + 'backslash name — the guard SEES this file; got ' + JSON.stringify(wide.trim()));
    // Positive control for the survival oracle: it finds the file while it exists, and finds it
    // ONLY in the worktree — so "found afterwards" can only mean preserved past the removal.
    const preHits = filesContaining973(fx.tmpRoot, NONCE);
    assert(preHits.length === 1 && preHits[0].startsWith('.kw/'),
      '#978 (j/' + label + ') premise: before the sink the NONCE must be found exactly once, inside the '
      + 'worktree; got ' + JSON.stringify(preHits));

    const extraEnv = mockEnvName ? { [mockEnvName]: path.join(fx.binDir, 'gh.js') } : null;
    const result = runSinkAt(sinkScript, fx, ['--issue', String(issue), '--keep-issue-open'], extraEnv);
    const out = lastJson(result);
    const combined = String(result.stdout || '') + String(result.stderr || '');
    const survivors = filesContaining973(fx.tmpRoot, NONCE);
    // Same generous shape as (e): any honest signal counts and no mechanism is required. The named
    // token is the SEGMENT, which survives C-quoting unchanged — the full literal name would fail
    // to match its own quoted form in a refusal message.
    const told = result.status !== 0 || !!(out && out.reason) || combined.includes(SEG);
    const seen = 'exit=' + result.status
      + ' status=' + JSON.stringify(out && out.status)
      + ' reason=' + JSON.stringify(out && out.reason)
      + ' worktree_still_present=' + fs.existsSync(fx.wtPath)
      + ' survivors=' + JSON.stringify(survivors)
      + '\nstderr: ' + String(result.stderr || '').slice(-500);

    assert(survivors.length > 0,
      '#978 (j/' + label + '): the backslash-named file must still exist after the sink. It is one untracked '
      + 'file at the worktree root — not under kaola-workflow/, not reached by the --sink stage — and the '
      + 'decoded-then-normalised NAME is the only reading under which it looks like lane bookkeeping. '
      + 'Refusing, preserving it elsewhere and copying it aside all satisfy this; destroying it does not. ' + seen);
    assert(told,
      '#978 (j/' + label + '): the sink must not report unqualified success over it. A non-zero exit, a typed '
      + 'reason on the envelope, or the name in the output all count — silence does not. ' + seen);
  } finally {
    cleanup(fx);
  }
}

function assertEmbeddedRepoUnderLanePrefixIsNotSilentlyDestroyed978(label, sinkScript, project, issue, mockEnvName) {
  console.log('Test (#978 k ' + label + '): an embedded git repository under a FOREIGN lane segment must not be force-removed silently — one collapsed record hides a whole repo, unpushed history included, behind the exemption');
  const NONCE = 'kw978-nested-repo-nonce-' + issue;
  const SEG = 'crashed-' + issue;
  const fx = buildWorktreeEvidenceFixture(project, issue, {
    untracked: {
      ['kaola-workflow/' + project + '/.cache/n1-impl.md']: 'binding: n1-impl nonce' + issue + '\n',
    },
  });
  fx.projectName = project;
  try {
    if (!assertUnderTmpdir973(label + '/k', fx.tmpRoot)) return;
    // A real repository under the foreign lane segment: one commit that exists nowhere else (no
    // remote), plus two uncommitted files — the 2026-08 crash shape, a run's scratch clone parked
    // where a successor's worktree inherits it.
    const nested = path.join(fx.wtPath, 'kaola-workflow', SEG);
    fs.mkdirSync(path.join(nested, 'sub'), { recursive: true });
    G.git(nested, ['init', '-b', 'main'], { encoding: 'utf8' });
    git(nested, ['config', 'user.email', 'test@example.com']);
    git(nested, ['config', 'user.name', 'Test User']);
    fs.writeFileSync(path.join(nested, 'history.md'), '# committed, never pushed\n' + NONCE + '\n');
    git(nested, ['add', 'history.md']);
    git(nested, ['commit', '-m', 'work: history']);
    fs.writeFileSync(path.join(nested, 'precious.md'), NONCE + ' — uncommitted\n');
    fs.writeFileSync(path.join(nested, 'sub', 'deeper.txt'), NONCE + ' — uncommitted, nested\n');

    assert(fs.existsSync(path.join(nested, '.git'))
      && git(nested, ['rev-parse', '--verify', 'HEAD']).status === 0
      && git(nested, ['remote']).stdout.trim() === '',
      '#978 (k/' + label + ') premise: the lane segment must hold a REAL embedded repository carrying a '
      + 'commit and no remote — committed-but-unpushed history is part of what the removal destroys');
    const inner = git(nested, ['status', '--porcelain', '-uall']).stdout;
    assert(inner.includes('?? precious.md') && inner.includes('?? sub/deeper.txt'),
      '#978 (k/' + label + ') premise: the two files must be uncommitted INSIDE the embedded repo; got '
      + JSON.stringify(inner.trim()));
    // The collapse premise: the outer probe emits ONE record and never descends. Without this the
    // arm would be re-measuring the per-file exemption (f) already holds.
    const wide = git(fx.wtPath, ['status', '--porcelain', '-uall']).stdout;
    assert(wide.includes('?? kaola-workflow/' + SEG + '/') && !wide.includes('precious.md'),
      '#978 (k/' + label + ') premise: `-uall` must report ONE collapsed record for the embedded repo and no '
      + 'per-file records — the collapse is the embedded-repo behaviour, and it is what hides the population; '
      + 'got ' + JSON.stringify(wide.trim()));
    const preHits = filesContaining973(fx.tmpRoot, NONCE);
    assert(preHits.length === 3 && preHits.every(p => p.startsWith('.kw/')),
      '#978 (k/' + label + ') premise: before the sink the NONCE must be found in exactly the three files '
      + 'inside the worktree — the survival oracle\'s positive control; got ' + JSON.stringify(preHits));

    const extraEnv = mockEnvName ? { [mockEnvName]: path.join(fx.binDir, 'gh.js') } : null;
    const result = runSinkAt(sinkScript, fx, ['--issue', String(issue), '--keep-issue-open'], extraEnv);
    const out = lastJson(result);
    const combined = String(result.stdout || '') + String(result.stderr || '');
    const survivors = filesContaining973(fx.tmpRoot, NONCE);
    const told = result.status !== 0 || !!(out && out.reason) || combined.includes(SEG);
    const seen = 'exit=' + result.status
      + ' status=' + JSON.stringify(out && out.status)
      + ' reason=' + JSON.stringify(out && out.reason)
      + ' worktree_still_present=' + fs.existsSync(fx.wtPath)
      + ' survivors=' + JSON.stringify(survivors)
      + '\nstderr: ' + String(result.stderr || '').slice(-500);

    assert(survivors.length > 0,
      '#978 (k/' + label + '): the embedded repository\'s work must still exist after the sink. Plain files '
      + 'under a foreign lane are exempt by design — but this segment holds a REPOSITORY: uncommitted files '
      + 'and a .git whose commits exist nowhere else, all behind one exempted record, and `git worktree '
      + 'remove --force` takes every byte of it. Refusing, preserving the directory elsewhere and copying it '
      + 'aside all satisfy this; destroying it does not. ' + seen);
    assert(told,
      '#978 (k/' + label + '): the sink must not report unqualified success over an embedded repository it '
      + 'is about to destroy. A non-zero exit, a typed reason, or the segment named in the output all count '
      + '— silence does not. ' + seen);
  } finally {
    cleanup(fx);
  }
}

function assertLegacyRouteKeepsTheWorktreeOnlyJournal978(label, sinkScript, project, issue, mockEnvName) {
  console.log('Test (#978 l ' + label + '): the LEGACY entry point must not destroy the worktree-only run journal the --sink route preserves — same forced removal, no stage on its route, and (i-control) forbids refusing over it');
  const NONCE = 'kw978-journal-nonce-' + issue;
  const fx = buildLegacyWorktreeFixture973(project, issue, {
    untracked: {
      ['kaola-workflow/' + project + '/.cache/n7-worktree-only.md']: '# per-node evidence\n' + NONCE + '\n',
      ['kaola-workflow/' + project + '/.cache/sink-fallback.json']: '{"schema":1,"nonce":"' + NONCE + '"}\n',
    },
  });
  try {
    if (!assertUnderTmpdir973(label + '/l', fx.tmpRoot)) return;
    const wide = git(fx.wtPath, ['status', '--porcelain', '-uall']).stdout.trim();
    assert(wide.split('\n').filter(Boolean).length === 2,
      '#978 (l/' + label + ') premise: the two journal files must be UNTRACKED in the worktree; got '
      + JSON.stringify(wide));
    // Positive control for the survival oracle, and the worktree-only premise in one: the NONCE
    // exists in exactly the two worktree copies, so finding it afterwards can only mean the legacy
    // route preserved what only the worktree held.
    const preHits = filesContaining973(fx.tmpRoot, NONCE);
    assert(preHits.length === 2 && preHits.every(p => p.startsWith('.kw/')),
      '#978 (l/' + label + ') premise: before the run the NONCE must be found in exactly the two WORKTREE '
      + 'copies; got ' + JSON.stringify(preHits));

    const extraEnv = mockEnvName ? { [mockEnvName]: path.join(fx.binDir, 'gh.js') } : null;
    const result = runSinkLegacyAt(sinkScript, fx, ['--issue', String(issue), '--keep-issue-open'], extraEnv);
    const out = lastJson(result);
    const survivors = filesContaining973(fx.tmpRoot, NONCE);
    const seen = 'exit=' + result.status
      + ' status=' + JSON.stringify(out && out.status)
      + ' result=' + JSON.stringify(out && out.result)
      + ' reason=' + JSON.stringify(out && out.reason)
      + ' survivors=' + JSON.stringify(survivors)
      + '\nstderr: ' + String(result.stderr || '').slice(-500);

    // Non-vacuity, not a second pin: a legacy run that stops early leaves the worktree standing and
    // the journal trivially alive. (i-control) holds this same posture to completion on every
    // edition — if this clause is red alongside (i-control), read (i-control) first.
    const completed = result.status === 0 && !!out && !out.reason && out.result !== 'refuse' && out.result !== 'report';
    assert(completed,
      '#978 (l/' + label + ') premise: the legacy run must COMPLETE over lane-only untracked content — '
      + 'refusing here refuses every legacy sink ((i-control) is the arm that says so), and a run that '
      + 'stopped early never reached the removal this arm measures. ' + seen);
    assert(survivors.length > 0,
      '#978 (l/' + label + '): the worktree-only journal must still exist somewhere after a completed legacy '
      + 'sink. The --sink route preserves exactly this content as its ordinary outcome — staged before the '
      + 'removal, landed after checkout, archived ((#707 h)) — while Step 3 of main() reaches the same '
      + '`git worktree remove --force` with no stage anywhere on its route. Landed into the live folder, '
      + 'archived, or copied aside all satisfy this; destroyed does not. ' + seen);
  } finally {
    cleanup(fx);
  }
}

// (m) R1 — the rescue's own failure mode. The legacy stage that closes (l) is best-effort by
// design (a stage fault must not hard-stop every sink — that is (i-control)'s line), and its copy
// loop opens every non-directory entry: a DANGLING symlink (ENOENT) or a SELF-REFERENTIAL one
// (ELOOP) inside kaola-workflow/<project>/ makes the copy throw, the catch nulls the whole stage,
// and the run proceeds to the same forced removal reporting `merged` at exit 0 — the journal is
// destroyed with nothing said. That is the exact silent-destruction shape (l) exists to close,
// reached through a trigger (l)'s fixture does not model; and a link is not an exotic guest at
// this seam — (h) is in this file because a run actually left one.
//
// THE PIN IS A DISJUNCTION, unlike (l): when the stage CANNOT preserve the journal, refusing and
// reporting are both honest outcomes, and so is surviving anyway (a copy that handles links).
// What is forbidden is the pair — the journal is gone AND nothing said so. An unreadable-FILE
// trigger (EACCES) exists too and is deliberately not fixtured: a permission probe reads
// differently under root, and a fixture that changes meaning by operator is worse than a named
// omission.
function assertLegacyStageFailureIsNotSilent978(label, sinkScript, project, issue, mockEnvName) {
  console.log('Test (#978 m ' + label + '): a symlink the legacy stage cannot copy must not turn the rescue back into silent destruction — the journal survives, or the run says what it could not preserve');
  const NONCE = 'kw978-stagefail-nonce-' + issue;
  const LANE = 'kaola-workflow/' + project + '/.cache/';
  const fx = buildLegacyWorktreeFixture973(project, issue, {
    untracked: {
      [LANE + 'n7-worktree-only.md']: '# per-node evidence\n' + NONCE + '\n',
      [LANE + 'n8-timings.md']: '# timings\n' + NONCE + '\n',
    },
    symlinks: {
      // Both measured trigger shapes, in one fixture: whichever the copy meets first, the whole
      // stage is lost at once — so one arm covers both without caring about readdir order.
      [LANE + 'dangling-link']: 'no-such-target-' + issue,
      [LANE + 'self-link']: 'self-link',
    },
  });
  try {
    if (!assertUnderTmpdir973(label + '/m', fx.tmpRoot)) return;
    const dangling = path.join(fx.wtPath, LANE + 'dangling-link');
    const selfRef = path.join(fx.wtPath, LANE + 'self-link');
    assert(fs.lstatSync(dangling).isSymbolicLink() && fs.existsSync(dangling) === false
      && fs.lstatSync(selfRef).isSymbolicLink() && fs.existsSync(selfRef) === false,
      '#978 (m/' + label + ') premise: both links must exist by lstat and resolve to NOTHING by existsSync — '
      + 'dangling and self-referential are the two shapes that make a naive per-entry copy throw');
    const preHits = filesContaining973(fx.tmpRoot, NONCE);
    assert(preHits.length === 2 && preHits.every(p => p.startsWith('.kw/')),
      '#978 (m/' + label + ') premise: before the run the NONCE must be found in exactly the two WORKTREE '
      + 'journal files — the survival oracle\'s positive control; got ' + JSON.stringify(preHits));

    const extraEnv = mockEnvName ? { [mockEnvName]: path.join(fx.binDir, 'gh.js') } : null;
    const result = runSinkLegacyAt(sinkScript, fx, ['--issue', String(issue), '--keep-issue-open'], extraEnv);
    const out = lastJson(result);
    const combined = String(result.stdout || '') + String(result.stderr || '');
    const survivors = filesContaining973(fx.tmpRoot, NONCE);
    const told = result.status !== 0
      || !!(out && out.reason)
      || combined.includes('n7-worktree-only.md')
      || combined.includes('dangling-link')
      || combined.includes('self-link');
    const seen = 'exit=' + result.status
      + ' status=' + JSON.stringify(out && out.status)
      + ' result=' + JSON.stringify(out && out.result)
      + ' reason=' + JSON.stringify(out && out.reason)
      + ' survivors=' + JSON.stringify(survivors)
      + '\nstderr: ' + String(result.stderr || '').slice(-500);

    // Non-vacuity: a stop for a reason this arm is not about would satisfy `told` while measuring
    // nothing — the same premises (i) carries, for the same reason.
    assert(result.status !== 3,
      '#978 (m/' + label + ') premise: exit 3 is the "project already archived — nothing done" fallback; the '
      + 'run never reached the stage or the removal, so the clause below is not about this trigger. ' + seen);
    const unrelated978m = ['run_not_finalized', 'no_implementation_changes', 'sink_blocked', 'unknown_flag'];
    assert(!(out && unrelated978m.includes(out.reason)),
      '#978 (m/' + label + ') premise: the run must not stop on a precondition this arm is not about. ' + seen);

    assert(survivors.length > 0 || told,
      '#978 (m/' + label + '): a stage that throws must not hand the journal back to silent destruction. '
      + 'Best-effort is the stage\'s contract and refusing every sink over a fault is (i-control)\'s line to '
      + 'hold — but "could not preserve" has to surface: keep the bytes anyway (a copy that handles links), '
      + 'or say so (a non-zero exit, a typed reason on the envelope, the artifacts named in the output). '
      + 'Destroyed at exit 0 under an unqualified terminal is the one forbidden pair. ' + seen);
  } finally {
    cleanup(fx);
  }
}

// (n) the --sink twin of (m), and the more reachable half: the transaction's merge step carries
// the IDENTICAL stage — same sinkCopyDir over the same `<wt>/kaola-workflow/<project>/`, same
// swallow nulling the stage — and the legacy route is reachable only by a direct invocation that
// omits the flag, while every shipped finalize surface passes `--sink`. So the same symlink loses
// the same journal on the route every real run takes, under the transaction's own success
// terminal (`sinked` at exit 0). The blast radius is the same CONTENT as (m) — both stages copy
// exactly the own-project lane dir, both land through the same per-file union — on a route with
// strictly more traffic. Same disjunction, same fixture shapes, same named omission of the
// EACCES trigger (a permission fixture reads differently under root; a named omission beats a
// fixture that passes for the wrong reason).
function assertSinkRouteStageFailureIsNotSilent978(label, sinkScript, project, issue, mockEnvName) {
  console.log('Test (#978 n ' + label + '): the --sink route\'s stage has the same throw-and-swallow — a symlink it cannot copy must not cost the journal silently on the route every shipped finalize takes');
  const NONCE = 'kw978-sinkstagefail-nonce-' + issue;
  const LANE = 'kaola-workflow/' + project + '/.cache/';
  const fx = buildWorktreeEvidenceFixture(project, issue, {
    untracked: {
      [LANE + 'n7-worktree-only.md']: '# per-node evidence\n' + NONCE + '\n',
      [LANE + 'n8-timings.md']: '# timings\n' + NONCE + '\n',
    },
    symlinks: {
      // Both trigger shapes in one fixture, exactly as (m): whichever the copy meets first loses
      // the whole stage, so the arm covers both without depending on readdir order.
      [LANE + 'dangling-link']: 'no-such-target-' + issue,
      [LANE + 'self-link']: 'self-link',
    },
  });
  fx.projectName = project;
  try {
    if (!assertUnderTmpdir973(label + '/n', fx.tmpRoot)) return;
    const dangling = path.join(fx.wtPath, LANE + 'dangling-link');
    const selfRef = path.join(fx.wtPath, LANE + 'self-link');
    assert(fs.lstatSync(dangling).isSymbolicLink() && fs.existsSync(dangling) === false
      && fs.lstatSync(selfRef).isSymbolicLink() && fs.existsSync(selfRef) === false,
      '#978 (n/' + label + ') premise: both links must exist by lstat and resolve to NOTHING by existsSync — '
      + 'dangling and self-referential are the two shapes that make a naive per-entry copy throw');
    const preHits = filesContaining973(fx.tmpRoot, NONCE);
    assert(preHits.length === 2 && preHits.every(p => p.startsWith('.kw/')),
      '#978 (n/' + label + ') premise: before the run the NONCE must be found in exactly the two WORKTREE '
      + 'journal files — the survival oracle\'s positive control; got ' + JSON.stringify(preHits));

    const extraEnv = mockEnvName ? { [mockEnvName]: path.join(fx.binDir, 'gh.js') } : null;
    const result = runSinkAt(sinkScript, fx, ['--issue', String(issue), '--keep-issue-open'], extraEnv);
    const out = lastJson(result);
    const combined = String(result.stdout || '') + String(result.stderr || '');
    const survivors = filesContaining973(fx.tmpRoot, NONCE);
    const told = result.status !== 0
      || !!(out && out.reason)
      || combined.includes('n7-worktree-only.md')
      || combined.includes('dangling-link')
      || combined.includes('self-link');
    const seen = 'exit=' + result.status
      + ' status=' + JSON.stringify(out && out.status)
      + ' reason=' + JSON.stringify(out && out.reason)
      + ' survivors=' + JSON.stringify(survivors)
      + '\nstderr: ' + String(result.stderr || '').slice(-500);

    // Non-vacuity: the disjunction reads ANY non-zero exit as told, so a stop on a precondition
    // this arm is not about would pass while measuring nothing. `worktree_dirty` is deliberately
    // NOT on this list — a guard that refuses over an uncopyable lane entry is a legitimate
    // repair, not an unrelated stop.
    const unrelated978n = ['run_not_finalized', 'no_implementation_changes', 'chains_red',
      'non_fast_forward', 'sink_blocked', 'unknown_flag'];
    assert(!(out && unrelated978n.includes(out.reason)),
      '#978 (n/' + label + ') premise: the run must not stop on a precondition this arm is not about. ' + seen);

    assert(survivors.length > 0 || told,
      '#978 (n/' + label + '): the --sink stage that throws must not hand the journal back to silent '
      + 'destruction on the one route every shipped finalize takes. Keep the bytes anyway (a copy that '
      + 'handles links), or say so (a non-zero exit, a typed reason on the envelope, the artifacts named in '
      + 'the output). Destroyed under an unqualified `sinked` at exit 0 is the one forbidden pair. ' + seen);
  } finally {
    cleanup(fx);
  }
}

// All four sink copies, exactly as (e)–(i) and for the same reason: the guard and its exemption
// call is hand-ported per forge, while the classifier itself lives in the byte-identical kernel —
// so a repair may land in one file or in four, and only arms that drive every edition can tell a
// complete repair from a root-only one.
[
  ['root', path.join(repoRoot, 'scripts', 'kaola-workflow-sink-merge.js'), null],
  ['codex', path.join(repoRoot, 'plugins', 'kaola-workflow', 'scripts', 'kaola-workflow-sink-merge.js'), null],
  ['gitlab', path.join(repoRoot, 'plugins', 'kaola-workflow-gitlab', 'scripts', 'kaola-gitlab-workflow-sink-merge.js'), 'KAOLA_GLAB_MOCK_SCRIPT'],
  ['gitea', path.join(repoRoot, 'plugins', 'kaola-workflow-gitea', 'scripts', 'kaola-gitea-workflow-sink-merge.js'), 'KAOLA_TEA_MOCK_SCRIPT'],
].forEach(([label, script, mockEnv], index) => {
  if (!fs.existsSync(script)) {
    assert(false, '#978 (' + label + '): the edition sink script exists at ' + script);
    return;
  }
  assertBackslashLaneNameIsNotSilentlyDestroyed978(label, script, 'issue-' + (97801 + index), 97801 + index, mockEnv);
  assertEmbeddedRepoUnderLanePrefixIsNotSilentlyDestroyed978(label, script, 'issue-' + (97811 + index), 97811 + index, mockEnv);
  assertLegacyRouteKeepsTheWorktreeOnlyJournal978(label, script, 'issue-' + (97821 + index), 97821 + index, mockEnv);
  assertLegacyStageFailureIsNotSilent978(label, script, 'issue-' + (97831 + index), 97831 + index, mockEnv);
  assertSinkRouteStageFailureIsNotSilent978(label, script, 'issue-' + (97841 + index), 97841 + index, mockEnv);
});

// --------------------------------------------------------------------------- #923 a branch that is not there

// A `--branch` naming a ref that DOES NOT EXIST must never be silently accepted.
//
// The sink verifies no branch into existence — there is no `show-ref`, no `rev-parse --verify`, no
// `branch_missing` anywhere in it — so "the named branch is not there" is only ever discovered
// downstream, by an operation that needs the ref and cannot get it. That is enough, but only as
// long as it stays loud: a run that reported status:sinked over a branch that never existed would
// have closed the issue and published the run record on the strength of a merge that never
// happened. Nothing else in this corpus feeds the sink a name with no ref behind it.
//
// TWO ARMS, ONE ASSERTION SET, and the pairing is the point. The control arm names an obviously
// absent branch and holds the general property. The 'TBD' arm holds that TBD is NOT a special
// value: it is a name like any other, and it buys no exemption from the control's outcome. Held to
// one assertion set so neither can end up guarded more weakly than the other.
//
// The fixture is deliberately self-contained (it shares only the module-level helpers): the run it
// stands up — a live folder and a deliverable committed straight to the default branch, with a
// workflow-state whose recorded branch has no ref — is the shape that produces this input in the
// field, and this pin must not depend on a fixture built for anything else.
function buildInPlaceFixture923(project, issue, recordedBranch) {
  const tmpRoot = makeTmpRoot();
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-mock-'));
  const logFile = path.join(binDir, 'gh-calls.log');
  const remotePath = initGitRepoWithBareRemote(tmpRoot);
  writeGhMock(binDir, logFile);

  fs.mkdirSync(path.join(tmpRoot, 'kaola-workflow', '.roadmap'), { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, 'kaola-workflow', '.roadmap', 'issue-' + issue + '.md'), roadmapSource(issue));
  fs.writeFileSync(path.join(tmpRoot, 'kaola-workflow', 'ROADMAP.md'), roadmapMirror([issue]));
  git(tmpRoot, ['add', 'kaola-workflow']);
  git(tmpRoot, ['commit', '-m', 'chore: roadmap']);
  git(tmpRoot, ['push', 'origin', 'main']);

  const liveDir = path.join(tmpRoot, 'kaola-workflow', project);
  fs.mkdirSync(path.join(liveDir, '.cache'), { recursive: true });
  fs.writeFileSync(path.join(liveDir, 'workflow-state.md'), [
    '# Kaola-Workflow State', '',
    '## Project', 'name: ' + project, 'status: active', '',
    '## Current Position', 'phase: adaptive', 'runtime: claude', 'step: start', '',
    '## Last Updated', new Date().toISOString(), '',
    '## Sink',
    'branch: ' + recordedBranch,
    'issue_number: ' + issue,
    'sink: merge',
    'run_posture: in-place',
    'main_root: (test)',
    'session_marker: test-session',
    'claim_ts: ' + new Date().toISOString(),
  ].join('\n') + '\n');
  fs.writeFileSync(path.join(liveDir, 'finalization-summary.md'), '# Finalization Summary\n\nREADY FOR FINAL GIT GATE\n');
  fs.writeFileSync(path.join(liveDir, 'workflow-plan.md'), runPlanDoc('in-place run'));
  fs.writeFileSync(path.join(liveDir, '.cache', 'n1.md'), '# n1 evidence\n\nverdict: pass\n');
  fs.writeFileSync(path.join(tmpRoot, 'DELIVERABLE.txt'), 'in-place deliverable\n');
  git(tmpRoot, ['add', '-A']);
  git(tmpRoot, ['commit', '-m', 'feat: in-place deliverable']);
  // Deliberately NOT pushed: origin/main sitting BEHIND local main is what makes "the sink
  // published anyway" observable at all.
  return { tmpRoot, remotePath, binDir, logFile, branch: recordedBranch, projectName: project };
}

function assertMissingBranchIsNotSilentlyAccepted923(arm, project, issue) {
  const fx = buildInPlaceFixture923(project, issue, arm.branch);
  try {
    const remoteMainBefore = git(fx.tmpRoot, ['rev-parse', 'origin/main']).stdout.trim();
    const localMainBefore = git(fx.tmpRoot, ['rev-parse', 'main']).stdout.trim();
    assert(localMainBefore !== remoteMainBefore,
      '#923 (' + arm.label + ') precondition: local main must start AHEAD of origin/main, or "the sink published '
      + 'anyway" is unobservable and every assertion below passes for the wrong reason');
    assert(git(fx.tmpRoot, ['rev-parse', '--verify', '--quiet', arm.branch + '^{commit}']).status !== 0,
      '#923 (' + arm.label + ') precondition: no ref named ' + arm.branch + ' may exist in the fixture — this pin '
      + 'measures a branch that is NOT there');

    const result = runSink(fx, ['--issue', String(issue)]);
    const out = lastJson(result);
    const seen = 'exit=' + result.status + ' envelope=' + JSON.stringify(out)
      + '\nstderr: ' + String(result.stderr || '').slice(-800);

    assert(result.status !== 0,
      '#923 (' + arm.label + '): a --branch naming a ref that does not exist must exit NON-ZERO. ' + seen);
    assert(!(out && (out.status === 'sinked' || out.result === 'ok')),
      '#923 (' + arm.label + '): a --branch naming a ref that does not exist must NEVER reach status:sinked — that '
      + 'reports a merge that could not have happened. ' + seen);
    assert(!readLog(fx.logFile).some(l => l === 'close:' + issue),
      '#923 (' + arm.label + '): no issue may be closed over a branch that does not exist. gh log='
      + JSON.stringify(readLog(fx.logFile)));
    assert(git(fx.tmpRoot, ['rev-parse', 'origin/main']).stdout.trim() === remoteMainBefore,
      '#923 (' + arm.label + '): origin/main must not advance — nothing was verifiably merged. ' + seen);
    assert(fs.existsSync(path.join(fx.tmpRoot, 'kaola-workflow', project)),
      '#923 (' + arm.label + '): the live project folder must survive — a run that did not complete must stay '
      + 'resumable, not be archived out from under itself. ' + seen);
    assert(((result.stdout || '') + (result.stderr || '')).includes(arm.branch),
      '#923 (' + arm.label + '): the stop must NAME the branch it could not find, or the operator cannot tell a '
      + 'missing ref from any other sink fault. ' + seen);
  } finally {
    cleanup(fx);
  }
}

(function testMissingBranchIsNeverSilentlyAccepted() {
  console.log('Test (#923): a --branch naming a ref that does not exist is never silently accepted — it exits non-zero, never reports sinked, closes no issue, advances no remote, and names the branch; TBD is not exempt');
  // CONTROL first: an obviously absent name. It establishes that the assertion set is satisfiable
  // and that the fixture is sound, so the arm below is attributable to the VALUE of the branch.
  assertMissingBranchIsNotSilentlyAccepted923(
    { label: 'control/absent-name', branch: 'workflow/never-created' }, 'issue-92301', 92301);
  // THE ARM: the same input with the name 'TBD'.
  assertMissingBranchIsNotSilentlyAccepted923(
    { label: 'TBD', branch: 'TBD' }, 'issue-92302', 92302);
})();

// --------------------------------------------------------------------------- (n1)–(n3) #931 the collision the record did not name
//
// archiveProjectDir writes to kaola-workflow/archive/<project>.archived-<ts>/ when
// kaola-workflow/archive/<project>/ already exists, and the sink commits THAT directory. The archive
// that was already there is not moved, not merged and not mentioned: archive_dest, every
// archived_paths entry and the archive's own directory name all sit under the suffixed path, so a
// reader of the committed record has to already know what produces the `.archived-` token before
// they can tell a collision happened — and nothing anywhere in those bytes names the directory that
// caused it, or says a second archive is sitting beside this one holding the rest of the evidence.
//
// The demanded result is a RECORD, not a refusal: the sink still completes, still commits its own
// destination, and the pre-existing path is named in the bytes it commits. Two consequences are
// pinned below rather than left to taste.
//
//   BOTH SHAPES, ONE ASSERTION SET. The prior archive may be TRACKED (committed residue from an
//   earlier cycle — nothing at risk) or UNTRACKED (the 2026-08-03 incident: a complete archive that
//   git holds no record of, abandoned on disk while the sink reports status:sinked at exit 0). The
//   two are the same collision and the acceptance is unconditional, so they are held to
//   assertCollisionIsNamedInTheCommittedRecord and neither can end up guarded more weakly than the
//   other. A report that also says WHICH shape it found is welcome — one that goes silent on an arm
//   is not. Whether tracked-ness itself is recorded is deliberately left open.
//
//   NO FABRICATION (n3). A statement that appears whether or not a collision happened carries no
//   information, and "discoverable from the record alone" is then false. (n3) is the single-axis
//   control: the same fixture with no pre-existing archive, where the same statement must be absent.
//
// WHAT IS PINNED IS THE RESULT, NOT THE METHOD — a line in the COMMITTED finalization-summary.md
// that names the pre-existing unsuffixed directory and is not merely an entry of the path list that
// commit already carries. Field name, wording, section, and which of the two summary writers
// produces it are the implementer's to choose.
//
// NOT ROUTED THROUGH A FINDING, and that is a live pin rather than a preference: (#700 c) at the top
// of this file drives the TRACKED collision and asserts the envelope carries no `findings` key and
// stderr carries no FINDING line. The tracked arm below runs that same fixture, so the disclosure it
// demands has to be a durable record.

// The suffixed archive directory AS COMMITTED. Derived from the tree at HEAD rather than from the
// disk or from the sink's own receipt: what #931 asks for is that the collision be discoverable from
// the committed record alone, so these scenarios read git and nothing else.
function committedSuffixedArchiveRel(cwd, project) {
  const prefix = 'kaola-workflow/archive/' + project + '.archived-';
  for (const p of blobsUnder(cwd, 'HEAD', 'kaola-workflow/archive/')) {
    if (!p.startsWith(prefix)) continue;
    const slash = p.indexOf('/', prefix.length);
    if (slash > 0) return p.slice(0, slash);
  }
  return null;
}

// Lines of a committed summary that name the UNSUFFIXED archive directory as something other than an
// entry of the path list that same commit carries.
//
// The discount is what lets the pin and its control be one rule instead of two. On a collision run
// every path the sink commits sits under <project>.archived-<ts>/, so a line naming <project>/ can
// only be a statement ABOUT the directory that was already there. On a no-collision run the archive
// IS <project>/ and its own path entries name it on every line, so a bare substring test would read
// the ordinary record as a collision report and (n3) could never fail. Discounting a path the commit
// demonstrably carries also closes the cheap way out: smuggling the pre-existing directory's files
// into archived_paths is a claim to have committed them, not a disclosure that they were left behind.
//
// `- ` is stripped WITHOUT trimming: the writer emits '- ' + rel verbatim, and a pathname's own
// trailing space is real (see treeEntriesUnder — trimming a path is what made a run unsinkable).
function collisionStatementLines(summary, project, committedPaths) {
  const dir = 'kaola-workflow/archive/' + project + '/';
  const listed = new Set(committedPaths || []);
  return (summary || '').split('\n')
    .filter(l => l.includes(dir))
    .filter(l => !listed.has(l.replace(/^- /, '')));
}

// The disclosure as one measured run actually produced it — the project, the suffixed destination it
// landed at, and the statement line(s) the committed summary carried. Set by the shared assertion set
// below, consumed by the cross-edition sweep (n4). Null means no arm ever observed one, which is the
// baseline and which (n4) reports as its own failure rather than skipping.
let observedDisclosure = null;

// ARMING CONTROL for the citation clause in the shared set below. That clause passes when
// archiveCitedMissing returns nothing, and "nothing cited is missing" must not be indistinguishable
// from "this reader no longer flags anything" — a scanner that quietly stopped matching would make
// the clause pass forever against exactly the regression it exists to catch. Driven once, in
// process, on a scratch archive whose summary cites a file it does not hold.
(function testArchiveCitationScannerIsArmed() {
  console.log('Test (#931 n0): arming control — closure-audit\'s summary-citation scanner really does flag a bare-relative .cache/ citation the archive does not hold, so an empty result in (n1)/(n2) is a measurement rather than a dead reader');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-cite-'));
  try {
    const { archiveCitedMissing } = require('./kaola-workflow-closure-audit.js');
    fs.writeFileSync(path.join(dir, 'finalization-summary.md'),
      '## Sink Findings\n\nalso cited: .cache/does-not-exist.md\n');
    assert(archiveCitedMissing(dir).includes('.cache/does-not-exist.md'),
      '#931 n0: archiveCitedMissing must flag a cited-but-absent .cache/ file, or the (n1)/(n2) citation clause is vacuous; got '
      + JSON.stringify(archiveCitedMissing(dir)));
    // The other half of arming: a repo-relative path is NOT a citation of this archive, which is the
    // form the disclosure has to take. If this ever flags, the clause below becomes unsatisfiable
    // for the correct fix rather than a fence against the careless one.
    fs.writeFileSync(path.join(dir, 'finalization-summary.md'),
      '## Sink Findings\n\nprior archive: kaola-workflow/archive/issue-93100/ (and its .cache)\n');
    assert(archiveCitedMissing(dir).length === 0,
      '#931 n0: a repo-relative kaola-workflow/archive/<project>/ mention must NOT read as a citation of THIS archive; got '
      + JSON.stringify(archiveCitedMissing(dir)));
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }
})();

// "The collision is named in the committed record", as ONE assertion set over both shapes of prior
// archive. Callers pass the label so a failure names which shape it came through, and the prior
// archive's paths plus its tracked-ness so each arm also proves it is the shape it claims to be.
//
// Every clause is checked because they fail independently: a sink can disclose the collision on
// stdout and nowhere durable, disclose it durably in the working tree and never commit it, or
// disclose it in a form that makes a downstream reader report a loss that did not happen.
function assertCollisionIsNamedInTheCommittedRecord(fx, label, opts) {
  const o = opts || {};
  const project = fx.projectName;
  const result = o.result;
  const out = o.out;

  // Clause 1 — the sink still COMPLETES. #931 asks the record to say more, not the transaction to
  // stop; a fix that refuses the collision would fail here first, which is the point.
  assert(result.status === 0, label + ': the sink must still complete over a collision — the demanded result is a record, not a refusal; got '
    + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + (result.stderr || '').slice(-1200));
  assert(out && out.status === 'sinked', label + ': status must be sinked; got ' + JSON.stringify(out && (out.status || out.reason)));

  // Clause 2 — the collision really happened AND reached the commit. Read from the tree, so a
  // scenario whose fixture stopped colliding fails loudly instead of passing vacuously.
  const suffixedRel = committedSuffixedArchiveRel(fx.tmpRoot, project);
  assert(suffixedRel !== null,
    label + ' precondition: the collision must have forced a suffixed archive INTO the commit, or there is no collision for the record to disclose; archive blobs at HEAD='
    + JSON.stringify(blobsUnder(fx.tmpRoot, 'HEAD', 'kaola-workflow/archive/')));
  if (suffixedRel === null) return;

  // Clause 3 — the shape this arm claims to be. The pre-existing archive is still sitting at the
  // unsuffixed path either way; whether the commit carries it is the single axis between the arms,
  // and in the untracked case its absence from the commit IS the loss the record has to disclose.
  for (const rel of (o.priorFiles || [])) {
    assert(fs.existsSync(path.join(fx.tmpRoot, rel)),
      label + ' precondition: ' + rel + ' must still sit at the unsuffixed path after the sink — the archive is left behind, not merged');
    const atHead = showAtHead(fx.tmpRoot, rel) !== null;
    assert(atHead === !!o.priorTracked,
      label + ' precondition: ' + rel + ' must be ' + (o.priorTracked ? 'PRESENT in' : 'ABSENT from')
      + ' the commit — that is the axis between the two arms; got at-HEAD=' + atHead);
  }

  // Clause 4 — THE DEMANDED RESULT. Read out of git, never off the disk: the envelope is stdout and
  // the crash-resume journal is disposed on success, so the committed summary is the whole of what a
  // reader has afterwards. It must name the directory that was already there.
  const summary = showAtHead(fx.tmpRoot, suffixedRel + '/finalization-summary.md');
  assert(summary !== null,
    label + ': the committed archive must carry a finalization-summary.md — it is the only durable carrier the sink has, and without it there is nowhere for the disclosure to live');
  const committedPaths = blobsUnder(fx.tmpRoot, 'HEAD', 'kaola-workflow/archive/');
  const statements = collisionStatementLines(summary, project, committedPaths);
  // Hand the OBSERVED disclosure to the cross-edition sweep (n4). It is derived from a measured run
  // rather than declared anywhere, which is what keeps that sweep a pin on the result instead of on
  // one implementation's field name. First arm to see one wins; the rest are identical by (n2).
  if (statements.length > 0 && observedDisclosure === null) {
    observedDisclosure = { project, suffixedRel, statements: statements.slice() };
  }
  assert(statements.length > 0,
    label + ': the committed record must NAME kaola-workflow/archive/' + project + '/ — the destination that already existed and forced the suffix. Everything this commit carries sits under '
    + suffixedRel + '/, so as it stands the collision is legible only to a reader who already knows what produces the `.archived-` token, and the archive still holding the rest of the run\'s evidence is named nowhere at all.'
    + '\ncommitted ' + suffixedRel + '/finalization-summary.md:\n' + JSON.stringify(summary));

  // Clause 5 — the disclosure must not manufacture a downstream loss report. closure-audit reads
  // this same archived summary back and reports every bare-relative `.cache/...` token the archive
  // does not hold as archive_summary_citation_missing. The abandoned archive's own evidence lives at
  // .cache/ paths, so naming its CONTENTS in that form claims files are missing from THIS archive
  // that were never in it — a second false statement in the same record the fix exists to make true.
  // Repo-relative paths (kaola-workflow/archive/<project>/...) are not citations and are unaffected.
  // Asserted through the shipped function rather than a copy of its regex; armed by (n0) above.
  const { archiveCitedMissing } = require('./kaola-workflow-closure-audit.js');
  const cited = archiveCitedMissing(path.join(fx.tmpRoot, suffixedRel));
  assert(cited.length === 0,
    label + ': the disclosure must not read as a bare-relative citation of files THIS archive does not hold — closure-audit reports those as archive_summary_citation_missing, inventing a loss from the sentence that was supposed to disclose the real one. Name the directory repo-relative. got '
    + JSON.stringify(cited));
}

// (n1) THE INCIDENT SHAPE. The pre-existing archive is UNTRACKED, so it is the run's only copy of
// what it holds: committed nowhere, absent from a fresh clone, and left behind at exit 0 while the
// sink reports status:sinked over a two-file archive it wrote beside it.
(function testCollisionWithUntrackedPriorArchiveIsNamedInTheCommittedRecord() {
  console.log('Test (#931 n1): a collision with an UNTRACKED pre-existing archive — the run\'s only copy of that evidence — must be named in the committed record: the suffixed archive is committed as always, and the bytes it commits say which directory was already there');
  const project = 'issue-93101';
  const issue = 93101;
  const fx = buildSoleArchiverFixture(project, issue, { noPriorArchive: true });
  fx.projectName = project;
  try {
    // Planted AFTER every commit and after the checkout back to main, so git holds no record of it —
    // which is precisely why the incident lost it. Preflight exempts it (#893's own-archive-mirror
    // arm: untracked, under this project's archive prefix, not carried by the branch), so the
    // transaction runs exactly as it did on 2026-08-03 rather than refusing at sink_blocked.
    const priorDir = path.join(fx.tmpRoot, 'kaola-workflow', 'archive', project);
    fs.mkdirSync(path.join(priorDir, '.cache'), { recursive: true });
    fs.writeFileSync(path.join(priorDir, 'workflow-state.md'), '# prior cycle state\n');
    fs.writeFileSync(path.join(priorDir, '.cache', 'prior-note.md'), '# prior run evidence\n');

    const result = runSink(fx, ['--issue', String(issue)]);
    assertCollisionIsNamedInTheCommittedRecord(fx, '#931 n1', {
      result,
      out: lastJson(result),
      priorTracked: false,
      priorFiles: [
        'kaola-workflow/archive/' + project + '/workflow-state.md',
        'kaola-workflow/archive/' + project + '/.cache/prior-note.md',
      ],
    });
  } finally {
    cleanup(fx);
  }
})();

// (n2) THE OTHER SHAPE, same assertion set. The pre-existing archive is TRACKED — nothing is at risk
// of being lost — and the collision is still a collision: two archives now stand for one project and
// the record has to say so. This is (#700 c)'s fixture unchanged, which is what makes the disclosure
// a RECORD: that scenario pins the same run emitting no findings key and no FINDING line.
(function testCollisionWithTrackedPriorArchiveIsNamedInTheCommittedRecord() {
  console.log('Test (#931 n2): the same disclosure is owed when the pre-existing archive is TRACKED — a report that only speaks up for the untracked shape leaves the other collision exactly as silent as before');
  const project = 'issue-93102';
  const issue = 93102;
  const fx = buildSoleArchiverFixture(project, issue, {});
  fx.projectName = project;
  try {
    const result = runSink(fx, ['--issue', String(issue)]);
    assertCollisionIsNamedInTheCommittedRecord(fx, '#931 n2', {
      result,
      out: lastJson(result),
      priorTracked: true,
      priorFiles: ['kaola-workflow/archive/' + project + '/placeholder.txt'],
    });
  } finally {
    cleanup(fx);
  }
})();

// (n3) THE CONTROL, single-axis: the identical fixture with no pre-existing archive. The archive
// lands at the plain path, no collision happened, and the record must not say one did. Without this
// the whole pin is satisfiable by a line that is always printed — which discloses nothing, because a
// reader could no longer tell the two runs apart from their records.
(function testNoCollisionRecordMakesNoCollisionClaim() {
  console.log('Test (#931 n3): control — with NO pre-existing archive the sink must claim no collision, so the disclosure carries information instead of being unconditional boilerplate');
  const project = 'issue-93103';
  const issue = 93103;
  const fx = buildSoleArchiverFixture(project, issue, { noPriorArchive: true });
  fx.projectName = project;
  try {
    const result = runSink(fx, ['--issue', String(issue)]);
    const out = lastJson(result);
    assert(result.status === 0, '#931 n3: the sink must complete; got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + (result.stderr || '').slice(-1200));
    assert(out && out.status === 'sinked', '#931 n3: status must be sinked; got ' + JSON.stringify(out && (out.status || out.reason)));
    // Precondition — the axis really moved: nothing suffixed exists, so the archive is at the plain path.
    assert(committedSuffixedArchiveRel(fx.tmpRoot, project) === null,
      '#931 n3 precondition: with no pre-existing archive nothing may be suffixed, or this is not the control it claims to be; archive blobs at HEAD='
      + JSON.stringify(blobsUnder(fx.tmpRoot, 'HEAD', 'kaola-workflow/archive/')));

    const archiveRel = 'kaola-workflow/archive/' + project;
    const summary = showAtHead(fx.tmpRoot, archiveRel + '/finalization-summary.md');
    assert(summary !== null, '#931 n3: the plain archive must carry a committed finalization-summary.md');
    const statements = collisionStatementLines(summary, project, blobsUnder(fx.tmpRoot, 'HEAD', 'kaola-workflow/archive/'));
    assert(statements.length === 0,
      '#931 n3: the committed record of a run that collided with NOTHING must say nothing about a pre-existing '
      + archiveRel + '/ beyond listing the paths it actually committed there — an unconditional statement is not a disclosure, since the collision then cannot be told from its absence. Offending line(s): '
      + JSON.stringify(statements) + '\ncommitted summary:\n' + JSON.stringify(summary));
  } finally {
    cleanup(fx);
  }
})();

// --------------------------------------------------------------------------- (n4) #931 on every edition
//
// (n1)–(n3) drive ONE sink script. The collision-suffix logic exists in all four, and a fix landing on
// three of them is invisible: the root↔codex pair is the only one machine-enforced (mutating root
// alone exits 1 out of validate-script-sync.js; root+codex together exits 0), and a gitlab-only or
// gitea-only omission is seen by NEITHER validate-script-sync.js NOR `edition-sync.js --check`. So the
// hand-maintained ports are exactly where an incomplete fix ships silently — the same reason (z1)–(z4)
// and (#912) are driven on every edition.
//
// This sweep is STATIC where those are behavioural, and the reason is a capability, not a preference:
// `glab` and `tea` are absent here, and the forge ports shell their own CLI. A static sweep is the
// weaker instrument and is worth having anyway, since the alternative is nothing at all.
//
// WHAT KEEPS IT A PIN ON THE RESULT. Nothing here names a field, a function or a wording. The marker
// is DERIVED, at run time, from the disclosure (n1)/(n2) actually observed in the committed record:
// cut out every runtime-substituted token, and what remains had to be literal text inside the
// producer. That text is then required in every edition's shipped sink modules. The implementer
// chooses the words; the sweep only insists that whatever words they chose reach all four copies —
// which is what "one rule, one wording" already asks of a rule with no capability difference behind it.
//
// ITS HONEST LIMIT, stated because a sweep that oversells itself is worse than one that does not
// exist: it reads TEXT, not behaviour. A port that carries the sentence but never reaches the code
// that writes it passes. It catches the omission — the actual measured risk — not a miswiring, and
// only a run of the port's own suite can close that.

// Longest substring of `text` appearing verbatim in `source`. Greedy extension per start, with the
// early break that keeps it cheap against a 150 KB module: nothing beginning at i can beat `best`
// once fewer than best.length characters remain.
function longestFragmentIn(text, source) {
  let best = '';
  for (let i = 0; i < text.length; i++) {
    if (text.length - i <= best.length) break;
    let len = best.length + 1;
    while (i + len <= text.length && source.indexOf(text.slice(i, i + len)) !== -1) {
      best = text.slice(i, i + len);
      len++;
    }
  }
  return best;
}

// The literal text the observed disclosure is MADE OF.
//
// Every runtime-substituted token is cut out first — the suffixed destination, the unsuffixed one,
// and the bare project name — leaving pieces that had to be literals in the producer. Each piece is
// then reduced to its longest run appearing verbatim in `source`, because this codebase splits long
// sentences across `+` and a whole piece is routinely NOT contiguous in the file; requiring one would
// red a correct fix. Runs under 8 characters are dropped: too unspecific to be evidence of anything.
function disclosureFragments(observed, source) {
  const runtimeTokens = [
    observed.suffixedRel + '/', observed.suffixedRel,
    'kaola-workflow/archive/' + observed.project + '/', 'kaola-workflow/archive/' + observed.project,
    observed.project,
  ];
  let pieces = observed.statements.slice();
  for (const tok of runtimeTokens) pieces = pieces.reduce((acc, s) => acc.concat(s.split(tok)), []);
  const frags = [];
  for (const piece of pieces) {
    if (!piece.trim()) continue;
    const frag = longestFragmentIn(piece, source);
    if (frag.length >= 8 && !frags.includes(frag)) frags.push(frag);
  }
  return frags;
}

// The SHIPPED modules the sink transaction composes, per edition. Named rather than globbed, and
// tests are deliberately not among them: a guard reads what ships, not what was authored, and a port
// whose own test suite quotes the wording while its script does not is exactly the pass this must not
// give. adaptive-schema and closure-contract are included because they are byte-identical across all
// four editions, so a disclosure written into one of them genuinely does reach every port — leaving
// them out would red a correct fix.
const EDITION_SINK_MODULES = [
  ['root', path.join(repoRoot, 'scripts'),
    ['kaola-workflow-sink-merge.js', 'kaola-workflow-claim.js']],
  ['codex', path.join(repoRoot, 'plugins', 'kaola-workflow', 'scripts'),
    ['kaola-workflow-sink-merge.js', 'kaola-workflow-claim.js']],
  ['gitlab', path.join(repoRoot, 'plugins', 'kaola-workflow-gitlab', 'scripts'),
    ['kaola-gitlab-workflow-sink-merge.js', 'kaola-gitlab-workflow-claim.js']],
  ['gitea', path.join(repoRoot, 'plugins', 'kaola-workflow-gitea', 'scripts'),
    ['kaola-gitea-workflow-sink-merge.js', 'kaola-gitea-workflow-claim.js']],
].map(([label, dir, names]) => [label, dir,
  names.concat(['kaola-workflow-adaptive-schema.js', 'kaola-workflow-closure-contract.js'])]);

(function testCollisionDisclosureReachesEveryEdition() {
  console.log('Test (#931 n4): the disclosure must reach all FOUR sink copies — a gitlab-only or gitea-only omission is invisible to validate-script-sync.js and to edition-sync.js --check alike, so nothing but this would catch a three-copy fix');

  // Nothing observed means (n1)/(n2) found no disclosure to propagate. That is the baseline, and it
  // is reported here as this scenario's OWN failure rather than skipped: a sweep that goes quiet
  // exactly when the thing it sweeps for is missing is not a sweep.
  if (observedDisclosure === null) {
    assert(false, '#931 n4: no disclosure was observed by (n1)/(n2), so there is no marker to sweep the editions for. '
      + 'This scenario cannot measure anything until the committed record names the pre-existing archive — fix (n1)/(n2) first.');
    return;
  }

  // Every named module must exist, per edition, before anything is read from it — a missing or
  // renamed port file must read as a fault here and not as an empty source that trivially matches.
  const sources = new Map();
  let allPresent = true;
  for (const [label, dir, names] of EDITION_SINK_MODULES) {
    const texts = [];
    for (const name of names) {
      const file = path.join(dir, name);
      let text = null;
      try { text = fs.readFileSync(file, 'utf8'); } catch (_) {}
      assert(text !== null, '#931 n4 (' + label + '): the edition sink module exists at ' + file);
      if (text === null) { allPresent = false; continue; }
      texts.push(text);
    }
    sources.set(label, texts.join('\n'));
  }
  if (!allPresent) return;

  // CALIBRATION, on the canonical copy the behavioural arms actually drove. It is what turns the
  // legs below into measurements: the marker is the disclosure's own words as this repository's own
  // fix wrote them, and if the fix carries no recognisable literal text at all then the sweep has
  // nothing specific enough to look for and must say so instead of passing three empty legs.
  const marker = disclosureFragments(observedDisclosure, sources.get('root'));
  const markerLen = marker.join('').length;
  assert(marker.length > 0 && markerLen >= 16,
    '#931 n4 calibration: the disclosure must be made of literal text in the canonical sink modules, or there is no marker to propagate. '
    + 'A sweep that cannot execute the forge ports has only their bytes to read, so give the statement wording a reader (and this sweep) can recognise. '
    + 'observed statement(s)=' + JSON.stringify(observedDisclosure.statements) + ' derived fragment(s)=' + JSON.stringify(marker));
  if (!(marker.length > 0 && markerLen >= 16)) return;

  // THE LEGS. Root is the calibration source and is green by construction, so it is not asserted
  // again as if it were evidence; what is measured is the three copies a canonical-only fix leaves
  // behind.
  for (const [label] of EDITION_SINK_MODULES) {
    if (label === 'root') continue;
    const src = sources.get(label);
    const absent = marker.filter(frag => src.indexOf(frag) === -1);
    assert(absent.length === 0,
      '#931 n4 (' + label + '): this edition\'s sink modules do not carry the collision disclosure the canonical copy emits. '
      + 'The collision-suffix logic exists in every port, and an omission here reaches a user with nothing in between: '
      + 'validate-script-sync.js and edition-sync.js --check are both blind to a ' + label + '-only difference. '
      + 'Missing fragment(s): ' + JSON.stringify(absent)
      + '\nfull marker: ' + JSON.stringify(marker)
      + '\nobserved statement(s): ' + JSON.stringify(observedDisclosure.statements));
  }
})();

// --------------------------------------------------------------------------- (n5) #931 the disclosure must TRACK the collision
//
// (n3) is the right control aimed at the right thing, and its FIXTURE defeats it. buildSoleArchiverFixture
// creates `<liveDir>/.cache` and, with no `liveCacheFiles`, leaves it empty and UNTRACKED; `git checkout
// main` removes the tracked live files but cannot remove a directory holding an untracked child, so
// `kaola-workflow/<project>/` survives on main. resolveSinkReceiptPath then returns the LIVE receipt path,
// no archive skeleton is manufactured, the destination stays plain — and (n3) passes for a reason that has
// nothing to do with whether the producer is honest. Measured single-axis: a tracked live `.cache/` leaves
// the live directory ABSENT after the checkout, an empty untracked one leaves it PRESENT, and nothing else
// differs.
//
// The shape it therefore could not see: with main holding no live folder at sink start,
// resolveSinkReceiptPath's #832 fallback returns the ARCHIVE receipt path and the first
// stepDone → writeSinkReceipt `mkdir -p`s `kaola-workflow/archive/<project>/.cache/`. The sink has now
// created the plain archive directory itself. archiveProjectDir sees it, suffixes the destination, and an
// existence-only probe calls the sink's own transaction skeleton a pre-existing archive — after which
// disposeSinkJournals prunes it, so the committed record names a directory that is not there. Every
// load-bearing clause of that sentence is false, and it is committed to the default branch and pushed.
//
// So the property is not "a collision is disclosed" but the BICONDITIONAL: the statement appears when a
// prior archive was there and does not when it was not. Both directions are held to one assertion set,
// with the SAME fixture and one axis between them — whether a prior archive is planted. A control that
// shares no code with the arm it controls is a control of something else.
//
// DRIVEN ON EVERY EDITION, and behaviourally rather than textually. (n4) reads bytes and says so; this
// executes each port's own sink through its own forge mock hook (KAOLA_GLAB_MOCK_SCRIPT /
// KAOLA_TEA_MOCK_SCRIPT — the ports never reach for `glab`/`tea` when those are set), which is the same
// reason (z1)–(z4) and (#912) are driven per edition: the ports are hand-maintained, this defect
// reproduces in all of them, and text cannot tell a port that carries a sentence from one that reaches
// the code writing it.

// The archive directory this run actually committed, suffixed or plain, read out of the tree at HEAD.
// The no-collision arm must NOT presume the plain path: the sink's own skeleton pushes the destination
// off it, and pinning the suffix here would pin behaviour that predates #931 and is not what is claimed.
function committedArchiveRelAtHead(cwd, project) {
  const suffixed = committedSuffixedArchiveRel(cwd, project);
  if (suffixed) return suffixed;
  const plain = 'kaola-workflow/archive/' + project;
  return blobsUnder(cwd, 'HEAD', plain + '/').length > 0 ? plain : null;
}

// One assertion set, two modes. `mode` is the only axis: 'collision' plants a real pre-existing archive,
// 'none' plants nothing. Everything else — the fixture, the flags, the reads — is identical, so a
// disagreement between the two legs is attributable to the plant and to nothing else.
function assertDisclosureTracksTheCollision931(label, sinkScript, mockEnvName, mode, project, issue) {
  console.log('Test (' + label + '/' + mode + '): the collision statement in the committed record must track whether a prior archive was REALLY there — driven through this edition\'s own sink');
  // A TRACKED live .cache/ is the whole point: it is what lets `git checkout main` remove the live
  // directory outright, putting the run in the posture where the sink manufactures its own archive
  // skeleton. An untracked empty one leaves the directory standing and silently suppresses the trigger.
  const fx = buildSoleArchiverFixture(project, issue, {
    noPriorArchive: true,
    liveCacheFiles: { 'chain-receipt.json': '{"green":true}\n' },
  });
  fx.projectName = project;
  try {
    const liveDir = path.join(fx.tmpRoot, 'kaola-workflow', project);
    const plainArchiveRel = 'kaola-workflow/archive/' + project;
    const plainArchiveDir = path.join(fx.tmpRoot, plainArchiveRel);
    if (mode === 'collision') {
      // A real prior archive, untracked — the 2026-08-03 shape, and the only thing that differs.
      fs.mkdirSync(path.join(plainArchiveDir, '.cache'), { recursive: true });
      fs.writeFileSync(path.join(plainArchiveDir, 'workflow-state.md'), '# prior cycle state\n');
      fs.writeFileSync(path.join(plainArchiveDir, '.cache', 'prior-note.md'), '# prior run evidence\n');
    }

    // THE AXIS, MEASURED AT SINK START. (n3) passed because its fixture was quietly the other shape, so
    // neither of these is assumed here. The first is what makes the sink take the #832 receipt-path
    // fallback at all; the second is the mode.
    assert(!fs.existsSync(liveDir),
      label + '/' + mode + ' precondition: main must hold NO live kaola-workflow/' + project + '/ at sink start — that is what routes the receipt to the archive path and makes the sink manufacture its own skeleton. A surviving directory (an untracked child git could not remove) silently suppresses the whole shape; got entries='
      + JSON.stringify(fs.existsSync(liveDir) ? fs.readdirSync(liveDir) : null));
    assert(fs.existsSync(plainArchiveDir) === (mode === 'collision'),
      label + '/' + mode + ' precondition: ' + plainArchiveRel + ' must be ' + (mode === 'collision' ? 'PRESENT' : 'ABSENT')
      + ' at sink start — it is the single axis between the two legs');

    // `--keep-issue-open` for (z1)'s reason: the offline mock speaks gh's argv, not glab's or tea's, so a
    // forge port would otherwise refuse at the closure step and this leg would measure the mock instead
    // of the disclosure. Applied to ALL editions so the axis between them stays the sink script.
    const extraEnv = mockEnvName ? { [mockEnvName]: path.join(fx.binDir, 'gh.js') } : null;
    const result = runSinkAt(sinkScript, fx, ['--issue', String(issue), '--keep-issue-open'], extraEnv);
    const out = lastJson(result);

    // FIXTURE PREMISE: the run reached the archive. A stop anywhere else is neither a pass nor evidence
    // about the disclosure, and it must say so rather than arrive as an unexplained red below.
    assert(result.status === 0 && out && out.status === 'sinked',
      label + '/' + mode + ' premise: the run must reach and complete the archive, or nothing below measures the disclosure; got exit='
      + result.status + ' status=' + JSON.stringify(out && (out.status || out.reason)) + ' step=' + JSON.stringify(out && out.step)
      + '\nstderr: ' + String(result.stderr || '').slice(-600));
    if (!(result.status === 0 && out && out.status === 'sinked')) return;

    const archRel = committedArchiveRelAtHead(fx.tmpRoot, project);
    assert(archRel !== null, label + '/' + mode + ' premise: this run must have committed an archive somewhere under kaola-workflow/archive/; blobs at HEAD='
      + JSON.stringify(blobsUnder(fx.tmpRoot, 'HEAD', 'kaola-workflow/archive/')));
    if (archRel === null) return;
    const summary = showAtHead(fx.tmpRoot, archRel + '/finalization-summary.md');
    assert(summary !== null, label + '/' + mode + ': the committed archive must carry a finalization-summary.md at ' + archRel);
    const statements = collisionStatementLines(summary, project, blobsUnder(fx.tmpRoot, 'HEAD', 'kaola-workflow/archive/'));

    if (mode === 'collision') {
      assert(statements.length > 0,
        label + '/collision: a prior archive really was there and the committed record must name it; committed ' + archRel + '/finalization-summary.md:\n' + JSON.stringify(summary));
      assert(fs.existsSync(plainArchiveDir),
        label + '/collision: the pre-existing archive must still be on disk afterwards — the record says it was left where it was, and that has to be true');
    } else {
      // THE R1 CLAUSE. Nothing pre-existed, so no statement may name the plain path. What the sink found
      // there was its OWN transaction journal skeleton, created by this same process minutes earlier and
      // deleted again before the run ended — so a sentence about it is false in every clause and points a
      // reader at a directory that is not there.
      assert(statements.length === 0,
        label + '/none: NOTHING pre-existed at ' + plainArchiveRel + ', so the committed record must not say anything did. '
        + 'The only thing at that path during this run was the sink\'s OWN receipt skeleton, which it created and then pruned — a statement about it is false in every clause, is committed to the default branch and pushed, and sends a reader to a directory that does not exist. '
        + 'An existence probe cannot tell a prior archive from the sink\'s own skeleton. Offending line(s): ' + JSON.stringify(statements)
        + '\ncommitted ' + archRel + '/finalization-summary.md:\n' + JSON.stringify(summary)
        + '\nplain path on disk afterwards: ' + (fs.existsSync(plainArchiveDir) ? JSON.stringify(fs.readdirSync(plainArchiveDir)) : 'ABSENT'));
    }
  } finally {
    cleanup(fx);
  }
}

// The four sink copies, both modes. `mockEnv` points each forge port's own CLI shim at the same offline
// mock the canonical leg gets, so the axis between editions stays the sink script and nothing else.
[
  ['root', path.join(repoRoot, 'scripts', 'kaola-workflow-sink-merge.js'), null],
  ['codex', path.join(repoRoot, 'plugins', 'kaola-workflow', 'scripts', 'kaola-workflow-sink-merge.js'), null],
  ['gitlab', path.join(repoRoot, 'plugins', 'kaola-workflow-gitlab', 'scripts', 'kaola-gitlab-workflow-sink-merge.js'), 'KAOLA_GLAB_MOCK_SCRIPT'],
  ['gitea', path.join(repoRoot, 'plugins', 'kaola-workflow-gitea', 'scripts', 'kaola-gitea-workflow-sink-merge.js'), 'KAOLA_TEA_MOCK_SCRIPT'],
].forEach(([label, script, mockEnv], index) => {
  if (!fs.existsSync(script)) {
    assert(false, '#931 n5 (' + label + '): the edition sink script exists at ' + script);
    return;
  }
  // The collision leg FIRST, so a port that never discloses at all fails there rather than quietly
  // satisfying the no-collision leg by doing nothing.
  assertDisclosureTracksTheCollision931('#931 n5 ' + label, script, mockEnv, 'collision', 'issue-' + (93150 + index), 93150 + index);
  assertDisclosureTracksTheCollision931('#931 n5 ' + label, script, mockEnv, 'none', 'issue-' + (93160 + index), 93160 + index);
});

// --------------------------------------------------------------------------- (#936) the half-released claim
//
// A claim is TWO artifacts, not one: the `workflow:in-progress` LABEL and a
// `<!-- kw:claim project=<slug> -->` MARKER COMMENT posted at claim time. The classifier blocks a
// re-claim on (label present) OR (marker present), so releasing one and leaving the other leaves the
// issue blocked. `clearAdvisoryClaim` in claim.js removes both. sink-merge removes only the label —
// and on the `--sink` keep-open path, neither.
//
// Every assertion below is about the STORE, not about a call: the marker either is or is not on the
// issue when the run ends. That is deliberate, and it is what makes this suite able to tell a
// correct fix from the one that is easy to reach for and silently does nothing:
//
//   THE cwd TRAP. Both sink entry points `process.chdir(os.tmpdir())` before doing any work, which
//   is why every forge call in sink-merge passes `{ cwd: mainRoot }` explicitly. `clearAdvisoryClaim`
//   calls `ghExec` with NO opts, and its marker-deletion block sits inside four swallowed
//   `catch (_) {}`. A fix that simply calls it from the sink therefore runs `gh` in tmpdir — outside
//   any git repository, where real gh cannot resolve a base repo — and deletes nothing, forever
//   silently, forever green against a test that asserts only that the deleter was invoked.
//   The mock above is cwd-honest for exactly this reason: it fails like real gh does. So a cwd-less
//   fix leaves the marker sitting in the store and every assertion here goes red, and the
//   REJECTED-wrong-cwd clause names the cause instead of leaving a bare "still there".

// The mock is the instrument every assertion below reads, so its two discriminating behaviours are
// measured FIRST and directly: (1) it rejects a call made from outside a repository, and (2) its
// DELETE route really removes the comment from the store. Without this, "the marker is gone" and
// "no call was rejected" could both be true of an instrument that does nothing at all.
(function testTheMockDiscriminatesWrongCwdAndReallyDeletes() {
  console.log('Test (#936 control): the gh mock is the instrument — it must reject a call made outside a git repo (as real gh does) and its DELETE route must really remove the comment from the store');
  const fx = buildSoleArchiverFixture('issue-93600', 93600, { noPriorArchive: true });
  fx.projectName = 'issue-93600';
  const ghMock = path.join(fx.binDir, 'gh.js');
  const listArgs = ['api', 'repos/{owner}/{repo}/issues/93600/comments'];
  const delArgs = ['api', '--method', 'DELETE', 'repos/{owner}/{repo}/issues/comments/93611'];
  try {
    plantIssueComments(fx.binDir, { 93600: [markerComment(93611, 'issue-93600')] });

    // All three spawns below drive the mock as the CLI it stands in for: argv (and the cwd it is
    // launched from) in, exit code and stdout out. The exit code IS the measured property in each
    // — the mock has no in-process form to call, and an exit code does not exist below a process.
    //
    // (1a) inside the repo: the list route answers.
    // spawn-class: cli-contract
    const inRepo = spawnSync(process.execPath, [ghMock].concat(listArgs), { cwd: fx.tmpRoot, encoding: 'utf8' });
    assert(inRepo.status === 0, '#936 control: a list call from inside the repo must succeed; got ' + inRepo.status + ' stderr: ' + inRepo.stderr);
    let listed = null;
    try { listed = JSON.parse(inRepo.stdout); } catch (_) { listed = null; }
    assert(Array.isArray(listed) && listed.length === 1 && Number(listed[0].id) === 93611,
      '#936 control: the list route must serve the planted store; got ' + JSON.stringify(inRepo.stdout));

    // (1b) outside any repo — the shape a cwd-less fix produces. This is the POSITIVE CONTROL for
    // every "no REJECTED-wrong-cwd" clause below: without it those clauses could be vacuously true.
    // spawn-class: cli-contract
    const outOfRepo = spawnSync(process.execPath, [ghMock].concat(listArgs), { cwd: os.tmpdir(), encoding: 'utf8' });
    assert(outOfRepo.status !== 0,
      '#936 control: a call made from outside any git repository must FAIL like real gh; got exit ' + outOfRepo.status +
      ' — if this passes, every cwd clause below is measuring nothing');
    assert(readLog(fx.logFile).some(l => l.startsWith('REJECTED-wrong-cwd:')),
      '#936 control: the rejection must be recorded in the call log so a cwd-less fix is diagnosable; log=' + JSON.stringify(readLog(fx.logFile)));

    // (2) the DELETE route mutates the store, so "the marker is gone" can only become true by
    // something actually deleting it.
    assert(issueCommentBodies(fx.binDir, 93600).length === 1, '#936 control: precondition — the store holds the planted marker');
    // spawn-class: cli-contract
    const del = spawnSync(process.execPath, [ghMock].concat(delArgs), { cwd: fx.tmpRoot, encoding: 'utf8' });
    assert(del.status === 0, '#936 control: a DELETE from inside the repo must succeed; got ' + del.status + ' stderr: ' + del.stderr);
    assert(issueCommentBodies(fx.binDir, 93600).length === 0,
      '#936 control: the DELETE route must remove the comment from the store; still there: ' + JSON.stringify(issueCommentBodies(fx.binDir, 93600)));
    assert(!readLog(fx.logFile).some(l => l === 'comment-deleted:93611:no-such-comment'),
      '#936 control: the DELETE must have matched a real stored comment, not silently missed');
  } finally {
    cleanup(fx);
  }
})();

// AC1 — `--sink --keep-issue-open` (runSinkTransaction), single issue. Today the entire closure step
// is wrapped in `if (!keepIssueOpen)` with no else arm, so this path does NOTHING: no close, no
// comment, no label, no marker. The issue stays claimed forever by both artifacts.
(function testSinkKeepOpenReleasesBothClaimArtifacts() {
  console.log('Test (#936 a): --sink --keep-issue-open must release BOTH claim artifacts on the issue it leaves open — the label AND the kw:claim marker comment');
  const project = 'issue-93601';
  const issue = 93601;
  const fx = buildSoleArchiverFixture(project, issue, { noPriorArchive: true });
  fx.projectName = project;
  try {
    // Three comments on the issue: this project's marker, ANOTHER project's marker (a live claim
    // that must survive), and ordinary prose (which must survive).
    plantIssueComments(fx.binDir, {
      [issue]: [
        markerComment(93621, project),
        markerComment(93622, 'issue-OTHER'),
        { id: 93623, body: 'an ordinary human comment mentioning nothing in particular', updated_at: new Date().toISOString() },
      ],
    });

    const result = runSink(fx, ['--issue', String(issue), '--keep-issue-open']);
    const out = lastJson(result);

    // FIXTURE PREMISE — a run that stopped early measures nothing about claim release.
    assert(result.status === 0 && out && out.status === 'sinked',
      '#936 a premise: the keep-open sink must complete, or nothing below is about claim release; got exit=' + result.status +
      ' status=' + JSON.stringify(out && (out.status || out.reason)) + '\nstderr: ' + String(result.stderr || '').slice(-800));
    if (!(result.status === 0 && out && out.status === 'sinked')) return;

    const calls = readLog(fx.logFile);
    const bodies = issueCommentBodies(fx.binDir, issue);

    // The issue really was left open — otherwise this is a close-path run wearing a keep-open flag
    // and the claim-release requirement below is not the one under test.
    assert(!calls.includes('close:' + issue),
      '#936 a premise: a keep-open run must not close the issue; calls=' + JSON.stringify(calls));

    // Artifact 1 — the label.
    assert(calls.includes('label-removed:' + issue),
      '#936 a: the claim LABEL must be removed from an issue the sink leaves open; calls=' + JSON.stringify(calls));

    // Artifact 2 — the marker. Stated as the issue's END STATE, so a deleter that ran in the wrong
    // cwd (and had its failure swallowed) fails here exactly as a deleter that never ran.
    assert(!bodies.some(b => b.includes(claimMarker(project))),
      '#936 a: the kw:claim MARKER COMMENT must be gone from an issue the sink leaves open — the classifier blocks a re-claim on (label OR marker), so releasing only the label leaves the issue claimed. Comments still on #' + issue + ': ' + JSON.stringify(bodies));

    // The cause, named. A fix that calls the deleter without `{ cwd: mainRoot }` runs gh from
    // os.tmpdir() (both sink entry points chdir there) and every one of its errors is swallowed.
    assert(!calls.some(l => l.startsWith('REJECTED-wrong-cwd:')),
      '#936 a: every forge call must carry a cwd that resolves the repository — the sink chdirs to os.tmpdir(), so a call made without { cwd: mainRoot } fails invisibly inside a swallowed catch. Rejected: ' +
      JSON.stringify(calls.filter(l => l.startsWith('REJECTED-wrong-cwd:'))));

    // Project scoping — the deleter is scoped to THIS project's marker and nothing else.
    assert(bodies.some(b => b.includes(claimMarker('issue-OTHER'))),
      '#936 a: a marker belonging to a DIFFERENT project is another run\'s live claim and must NOT be deleted; comments=' + JSON.stringify(bodies));
    assert(bodies.some(b => b.includes('an ordinary human comment')),
      '#936 a: ordinary comments must be left alone; comments=' + JSON.stringify(bodies));
  } finally {
    cleanup(fx);
  }
})();

// AC1 (bundle arm) — every issue the keep-open `--sink` run leaves OPEN, not just the primary.
(function testSinkKeepOpenBundleReleasesEveryMember() {
  console.log('Test (#936 b): --sink --keep-issue-open on a BUNDLE must release the label and the kw:claim marker on every member it leaves open, not only the primary');
  const project = 'issue-93602';
  const primary = 93602;
  const member = 93632;
  const fx = buildSoleArchiverFixture(project, primary, { noPriorArchive: true });
  fx.projectName = project;
  try {
    plantIssueComments(fx.binDir, {
      [primary]: [markerComment(93641, project)],
      [member]: [markerComment(93642, project), markerComment(93643, 'issue-OTHER')],
    });

    const result = runSink(fx, ['--issue', String(primary), '--issue-numbers', primary + ',' + member, '--keep-issue-open']);
    const out = lastJson(result);

    assert(result.status === 0 && out && out.status === 'sinked',
      '#936 b premise: the keep-open bundle sink must complete; got exit=' + result.status +
      ' status=' + JSON.stringify(out && (out.status || out.reason)) + '\nstderr: ' + String(result.stderr || '').slice(-800));
    if (!(result.status === 0 && out && out.status === 'sinked')) return;

    const calls = readLog(fx.logFile);
    for (const n of [primary, member]) {
      assert(!calls.includes('close:' + n), '#936 b premise: keep-open must not close member ' + n + '; calls=' + JSON.stringify(calls));
      assert(calls.includes('label-removed:' + n),
        '#936 b: the claim LABEL must be removed from bundle member ' + n + '; calls=' + JSON.stringify(calls));
      assert(!issueCommentBodies(fx.binDir, n).some(b => b.includes(claimMarker(project))),
        '#936 b: the kw:claim MARKER must be gone from bundle member ' + n + ' — a bundle leaves EVERY member open, so every member needs both artifacts released. Comments still on #' + n + ': ' +
        JSON.stringify(issueCommentBodies(fx.binDir, n)));
    }
    assert(issueCommentBodies(fx.binDir, member).some(b => b.includes(claimMarker('issue-OTHER'))),
      '#936 b: another project\'s marker on a bundle member must survive; comments=' + JSON.stringify(issueCommentBodies(fx.binDir, member)));
    assert(!calls.some(l => l.startsWith('REJECTED-wrong-cwd:')),
      '#936 b: every forge call must carry a cwd that resolves the repository; rejected: ' +
      JSON.stringify(calls.filter(l => l.startsWith('REJECTED-wrong-cwd:'))));
  } finally {
    cleanup(fx);
  }
})();

// AC2 — the LEGACY (non-`--sink`) terminal, postMergeCleanup. This path already removes the label in
// both modes, primary and bundle member; what it never does is delete the marker. So the label
// clauses here are green before and after, and the marker clauses are the whole measurement.
//
// The legacy entry point stops on a branch tip carrying a LIVE run folder, so this fixture commits
// the folder ARCHIVED plus a real implementation file — the shape a finalized keep-open run leaves.
function buildLegacyKeepOpenFixture(project, issue) {
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
  fs.writeFileSync(path.join(archDir, 'workflow-state.md'),
    'status: closed\nstep: complete\nissue_number: ' + issue + '\nlast_result: closed_keep_open\n\n## Sink\nbranch: ' + branch +
    '\nissue_number: ' + issue + '\nsink: merge\nissue_action: comment_keep_open\n');
  fs.writeFileSync(path.join(archDir, 'finalization-summary.md'), '# Finalization Summary\n\nREADY FOR FINAL GIT GATE\n');
  fs.writeFileSync(path.join(archDir, '.cache', 'final-validation.md'), 'verdict: pass\nfindings_blocking: 0\n');
  fs.writeFileSync(path.join(tmpRoot, 'IMPL-' + issue + '.txt'), 'real implementation\n');
  git(tmpRoot, ['add', '-A']);
  git(tmpRoot, ['commit', '-m', 'feat: implementation + archived keep-open run']);
  git(tmpRoot, ['push', '-u', 'origin', branch]);
  git(tmpRoot, ['checkout', 'main']);

  return { tmpRoot, remotePath, binDir, logFile, branch, projectName: project };
}

(function testLegacyKeepOpenCleanupDeletesTheMarkerToo() {
  console.log('Test (#936 c): the legacy postMergeCleanup keep-open terminal removes the label on the primary and on every bundle member — it must delete their kw:claim markers too');
  const project = 'issue-93603';
  const primary = 93603;
  const member = 93653;
  const fx = buildLegacyKeepOpenFixture(project, primary);
  try {
    plantIssueComments(fx.binDir, {
      [primary]: [markerComment(93661, project), markerComment(93662, 'issue-OTHER')],
      [member]: [markerComment(93663, project)],
    });

    const result = runSinkLegacy(fx, ['--issue', String(primary), '--issue-numbers', primary + ',' + member, '--keep-issue-open']);
    const out = lastJson(result);
    const calls = readLog(fx.logFile);

    // FIXTURE PREMISE — postMergeCleanup really ran in keep-open mode. Both clauses are needed: a
    // stop before the cleanup, or a run that closed the issues, would make everything below vacuous.
    assert(result.status === 0,
      '#936 c premise: the legacy keep-open sink must complete; got exit=' + result.status +
      ' out=' + JSON.stringify(out && (out.status || out.reason)) + '\nstderr: ' + String(result.stderr || '').slice(-800));
    assert(calls.includes('label-removed:' + primary) && calls.includes('label-removed:' + member),
      '#936 c premise: postMergeCleanup\'s keep-open arms must have run (they are what removes each member\'s label); calls=' + JSON.stringify(calls));
    if (!(result.status === 0 && calls.includes('label-removed:' + primary))) return;
    assert(!calls.includes('close:' + primary) && !calls.includes('close:' + member),
      '#936 c premise: a keep-open run must leave every member OPEN; calls=' + JSON.stringify(calls));

    for (const n of [primary, member]) {
      assert(!issueCommentBodies(fx.binDir, n).some(b => b.includes(claimMarker(project))),
        '#936 c: postMergeCleanup removes the claim label from #' + n + ' but leaves the kw:claim marker, so the classifier still blocks a re-claim on it. Comments still on #' + n + ': ' +
        JSON.stringify(issueCommentBodies(fx.binDir, n)));
    }
    assert(issueCommentBodies(fx.binDir, primary).some(b => b.includes(claimMarker('issue-OTHER'))),
      '#936 c: another project\'s marker must survive; comments=' + JSON.stringify(issueCommentBodies(fx.binDir, primary)));
    assert(!calls.some(l => l.startsWith('REJECTED-wrong-cwd:')),
      '#936 c: every forge call must carry a cwd that resolves the repository — the legacy path also chdirs to os.tmpdir(); rejected: ' +
      JSON.stringify(calls.filter(l => l.startsWith('REJECTED-wrong-cwd:'))));
  } finally {
    cleanup(fx);
  }
})();

// AC3 — the CLOSE path is not in scope and must not change. A leftover marker on a CLOSED issue is
// harmless (the classifier short-circuits on closed state before any claim check), so nothing is
// asserted about markers here; what is asserted is that the close terminal still closes, still
// removes the label, and still reports the same way.
//
// DECLARED CONTROL: unlike (a)–(c) this is GREEN on the unfixed code, deliberately. It exists to
// catch a fix that reaches the marker by restructuring the closure step and breaks the close path
// on the way — a regression the other three cannot see because none of them closes anything.
(function testCloseTerminalIsUnchanged() {
  console.log('Test (#936 d, control): the CLOSE terminal is out of scope and must be unchanged — it still closes the issue, still removes the label, and still reports status:sinked (green before AND after the fix)');
  const project = 'issue-93604';
  const issue = 93604;
  const fx = buildSoleArchiverFixture(project, issue, { noPriorArchive: true });
  fx.projectName = project;
  try {
    plantIssueComments(fx.binDir, { [issue]: [markerComment(93671, project)] });
    const result = runSink(fx, ['--issue', String(issue)]);
    const out = lastJson(result);
    const calls = readLog(fx.logFile);

    assert(result.status === 0 && out && out.status === 'sinked',
      '#936 d: the close terminal must still reach status:sinked; got exit=' + result.status +
      ' status=' + JSON.stringify(out && (out.status || out.reason)) + '\nstderr: ' + String(result.stderr || '').slice(-800));
    assert(calls.includes('close:' + issue),
      '#936 d: the close terminal must still close the issue; calls=' + JSON.stringify(calls));
    assert(calls.includes('label-removed:' + issue),
      '#936 d: the close terminal must still remove the claim label; calls=' + JSON.stringify(calls));
    assert(!calls.some(l => l.startsWith('REJECTED-wrong-cwd:')),
      '#936 d: no forge call on the close path may be made from outside the repository; rejected: ' +
      JSON.stringify(calls.filter(l => l.startsWith('REJECTED-wrong-cwd:'))));
  } finally {
    cleanup(fx);
  }
})();

// --------------------------------------------------------------------------- (#937) the slug that only LOOKED right
//
// `clearAdvisoryClaim` composes the marker it deletes by EXACT, case-sensitive substring from the
// project name the OPERATOR supplied: `'<!-- kw:claim project=' + project + ' -->'`. Both keep-open
// terminals in this file hand it `args.project` verbatim — postMergeCleanup's primary and
// bundle-member arms on the legacy path, and runSinkTransaction's keep-open terminal under `--sink`.
// The PRODUCER posted the marker under the name the run was CLAIMED with, which is the name of the
// folder on disk.
//
// On a case-insensitive filesystem those two can differ and nothing local notices. `--project
// Issue-N` resolves `kaola-workflow/issue-N` exactly as the lowercase spelling would, so every local
// step succeeds, the run reports status:sinked at exit 0 and the receipt says the claim label was
// removed — while the marker string composed from the supplied spelling matches nothing on the
// forge, every delete is skipped, and the claim survives on every member the run left open. git's
// index is case-SENSITIVE where the filesystem is not, so the same run also publishes its archive
// under the supplied spelling and leaves the live folder tracked beside it.
//
// The owner ruled RESOLVE AND REPORT: the supplied name is resolved to the actual on-disk folder
// once, early, and the correction is stated in the run's own output. Refusing was declined — a
// case-SENSITIVE volume already refuses today for its own reasons and that is not in scope here.

// The operator's spelling. `Issue-` differs from the on-disk `issue-` in exactly one byte, which is
// the whole point: it is the difference a case-insensitive filesystem cannot see and a substring
// match cannot miss.
function misCaseSlug(project) { return project.replace(/^issue-/, 'Issue-'); }

// Did this run TELL the operator that the name it was given is not the folder it used? Every value
// in the envelope is searched for a string naming BOTH spellings, and the shape is deliberately
// left open: a note field (what #933's `reserved_project` / `reserved_project_note` pair does for
// the same class of correction on the claim envelope), a typed finding's detail line, or a receipt
// field all satisfy it. What cannot satisfy it is silence — nor the two spellings turning up in
// SEPARATE fields, which is what an archive path and a project name do by coincidence rather than
// by saying anything.
function slugCorrectionSentences(out, supplied, resolved) {
  const hits = [];
  const walk = v => {
    if (typeof v === 'string') { if (v.includes(supplied) && v.includes(resolved)) hits.push(v); return; }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (v && typeof v === 'object') { for (const k of Object.keys(v)) walk(v[k]); }
  };
  walk(out);
  return hits;
}

// One assertion set over both keep-open terminals and both spellings. `supplied` is what goes on the
// command line; `project` is what is on disk and what the producer's marker carries. When they are
// equal this is the POSITIVE CONTROL: the same fixture, the same assertions, a slug that needs no
// resolving — without it "the marker is gone" could be true of a run that deletes nothing anywhere.
function assertKeepOpenResolvesTheProjectSlug937(label, entry, project, primary, member, supplied) {
  const misCased = supplied !== project;
  const fx = entry === 'sink'
    ? buildSoleArchiverFixture(project, primary, { noPriorArchive: true })
    : buildLegacyKeepOpenFixture(project, primary);
  // The operator's spelling reaches the CLI here and nowhere else — the fixture on disk is built
  // under the real name, exactly as a claim would have left it.
  fx.projectName = supplied;
  try {
    plantIssueComments(fx.binDir, {
      [primary]: [
        markerComment(93721, project),
        markerComment(93722, 'issue-OTHER'),
        { id: 93723, body: 'an ordinary human comment mentioning nothing in particular', updated_at: new Date().toISOString() },
      ],
      [member]: [markerComment(93724, project)],
    });

    const args = ['--issue', String(primary), '--issue-numbers', primary + ',' + member, '--keep-issue-open'];
    const result = entry === 'sink' ? runSink(fx, args) : runSinkLegacy(fx, args);
    const out = lastJson(result);
    const calls = readLog(fx.logFile);

    // FIXTURE PREMISE. A run that stopped early, or one that closed the issues, measures nothing
    // about claim release. Resolving the slug must not turn this run into a refusal either — the
    // owner declined that — so this clause is also the pin against over-correcting.
    if (entry === 'sink') {
      assert(result.status === 0 && out && out.status === 'sinked',
        label + ' premise: the keep-open sink must complete — a mis-cased --project resolves to the on-disk folder, it does not refuse; got exit=' + result.status +
        ' status=' + JSON.stringify(out && (out.status || out.reason)) + '\nstderr: ' + String(result.stderr || '').slice(-800));
      if (!(result.status === 0 && out && out.status === 'sinked')) return;
    } else {
      assert(result.status === 0,
        label + ' premise: the legacy keep-open sink must complete; got exit=' + result.status +
        ' out=' + JSON.stringify(out && (out.status || out.reason)) + '\nstderr: ' + String(result.stderr || '').slice(-800));
      assert(calls.includes('label-removed:' + primary) && calls.includes('label-removed:' + member),
        label + ' premise: postMergeCleanup\'s keep-open arms must have run (they are what removes each member\'s label); calls=' + JSON.stringify(calls));
      if (!(result.status === 0 && calls.includes('label-removed:' + primary))) return;
    }
    for (const n of [primary, member]) {
      assert(!calls.includes('close:' + n),
        label + ' premise: a keep-open run must leave member ' + n + ' OPEN; calls=' + JSON.stringify(calls));
    }

    // THE PIN. Stated as the issue's END STATE on every member, so a deleter that composed a marker
    // nothing matches fails here exactly as a deleter that never ran — both leave the claim standing.
    for (const n of [primary, member]) {
      assert(calls.includes('label-removed:' + n),
        label + ': the claim LABEL must be removed from member ' + n + '; calls=' + JSON.stringify(calls));
      assert(!issueCommentBodies(fx.binDir, n).some(b => b.includes(claimMarker(project))),
        label + ': the kw:claim MARKER posted for the on-disk project "' + project + '" must be gone from member ' + n +
        ', and the run was driven with --project "' + supplied + '". The deleter composes its marker from the supplied spelling by exact substring, so a name that differs only in CASE matches nothing on the forge and every delete is silently skipped — the run still exits 0 and still reports the label removed. Comments still on #' + n + ': ' +
        JSON.stringify(issueCommentBodies(fx.binDir, n)));
    }

    // Scoping is NOT widened by the resolution. A case-insensitive or looser match would sweep up a
    // marker that belongs to a live run somewhere else.
    assert(issueCommentBodies(fx.binDir, primary).some(b => b.includes(claimMarker('issue-OTHER'))),
      label + ': a marker belonging to a DIFFERENT project is another run\'s live claim and must NOT be deleted; comments=' +
      JSON.stringify(issueCommentBodies(fx.binDir, primary)));
    assert(issueCommentBodies(fx.binDir, primary).some(b => b.includes('an ordinary human comment')),
      label + ': ordinary comments must be left alone; comments=' + JSON.stringify(issueCommentBodies(fx.binDir, primary)));

    assert(!calls.some(l => l.startsWith('REJECTED-wrong-cwd:')),
      label + ': every forge call must carry a cwd that resolves the repository — both entry points chdir to os.tmpdir(); rejected: ' +
      JSON.stringify(calls.filter(l => l.startsWith('REJECTED-wrong-cwd:'))));

    if (misCased) {
      // REPORTED, not silently corrected. The operator asked for one name and got another; a run
      // that fixes itself without saying so leaves them believing the name they typed is the name
      // on disk, and the next command they type carries the same spelling.
      const sentences = slugCorrectionSentences(out, supplied, project);
      assert(sentences.length > 0,
        label + ': the run was given --project "' + supplied + '" and used "' + project + '", and its output says so nowhere. ' +
        'Report the substitution the way the claim envelope reports a reserved project name — one value naming what was supplied and what was used. Envelope: ' +
        JSON.stringify(out));
    }

    if (entry === 'sink') {
      // The same one-byte difference reaches GIT, whose index is case-sensitive where the
      // filesystem is not: the archive is written under the supplied spelling and the removal
      // pathspec for the live folder matches nothing, so the published tree carries both.
      const published = blobsUnder(fx.tmpRoot, 'origin/main', 'kaola-workflow/');
      const strayArchive = published.filter(p => p.startsWith('kaola-workflow/archive/' + supplied + '/'));
      assert(!misCased || strayArchive.length === 0,
        label + ': the archive was published under the SUPPLIED spelling "kaola-workflow/archive/' + supplied +
        '/" instead of the on-disk project name — a second, mis-cased archive directory on the default branch. Paths: ' +
        JSON.stringify(strayArchive));
      const liveStillTracked = published.filter(p => p.startsWith('kaola-workflow/' + project + '/'));
      assert(liveStillTracked.length === 0,
        label + ': the LIVE run folder is still tracked at origin/main after the sink — the removal pathspec was composed from the supplied spelling and matched nothing in a case-sensitive index. Paths: ' +
        JSON.stringify(liveStillTracked));
      const dirty = git(fx.tmpRoot, ['status', '--porcelain']).stdout.trim();
      assert(dirty === '',
        label + ': the default-branch checkout must be clean after the sink; git status --porcelain:\n' + dirty);
    }
  } finally {
    cleanup(fx);
  }
}

// (#937 a/b) the `--sink` keep-open terminal — runSinkTransaction. The mis-cased leg FIRST, so a
// terminal that resolves nothing fails there rather than quietly satisfying the control.
console.log('Test (#937 a): --sink --keep-issue-open with a --project that differs from the on-disk folder ONLY IN CASE must still release the claim on every member, and must say it corrected the name');
assertKeepOpenResolvesTheProjectSlug937('#937 a (--sink, mis-cased)', 'sink', 'issue-93701', 93701, 93711, misCaseSlug('issue-93701'));
console.log('Test (#937 b, positive control): the same --sink run driven with the EXACT on-disk slug still deletes both markers — without this, "the marker is gone" could be true of a fixture that deletes nothing');
assertKeepOpenResolvesTheProjectSlug937('#937 b (--sink, exact)', 'sink', 'issue-93702', 93702, 93712, 'issue-93702');

// (#937 c/d) the LEGACY (non-`--sink`) terminal — postMergeCleanup. It never reaches the `--sink`
// terminal above and the `--sink` path never reaches it, so both need their own fixture.
console.log('Test (#937 c): the legacy postMergeCleanup keep-open terminal must resolve a mis-cased --project too — its primary and bundle-member arms compose the same marker from the same supplied name');
assertKeepOpenResolvesTheProjectSlug937('#937 c (legacy, mis-cased)', 'legacy', 'issue-93703', 93703, 93713, misCaseSlug('issue-93703'));
console.log('Test (#937 d, positive control): the legacy terminal driven with the EXACT on-disk slug still deletes both markers');
assertKeepOpenResolvesTheProjectSlug937('#937 d (legacy, exact)', 'legacy', 'issue-93704', 93704, 93714, 'issue-93704');

// --------------------------------------------------------------------------- summary

if (failed === 0) {
  console.log('\nSink-merge (#694/#700/#705/#707/#715/#746/#832/#893/#923/#931) test suite passed: ' + passed + ' assertions.');
  process.exit(0);
} else {
  console.error('\nSink-merge (#694/#700/#705/#707/#715/#746/#832/#893/#923/#931) test suite FAILED: ' + failed + ' failed, ' + passed + ' passed.');
  process.exit(1);
}
