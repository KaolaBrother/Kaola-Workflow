#!/usr/bin/env node
'use strict';

// Integration tests for bundle FINALIZE path (issue #328 finalization node).
// Hand-rolled assert + counter; repo style (no framework) — mirrors test-bundle-claim.js.
//
// SCOPE: AC#11 (all-or-nothing closure), AC#12 (bundle receipt fields), AC#13 (warning-first
//   on single remote-close failure), AC#1 (single-issue finalize regression).
//
// Covered scenarios:
//   (1) Bundle finalize closes all 3 members, removes all 3 .roadmap/issue-N.md sources,
//       regenerates ROADMAP.md once, archives ONE folder, receipt has closed_issues +
//       failed_issue_closures + roadmap_sources_removed.
//   (2) Warning-first: one member remote-close fails -> recorded in failed_issue_closures,
//       closure still completes (exit 0).
//   (3) Single-issue finalize regression (AC#1 / dogfooding): one issue closed, one roadmap
//       source removed, receipt has NO bundle fields (or empty), invariants pass.
//   (4) checkClosureInvariants per-issue: violation when a bundle member's .roadmap source
//       still exists.
//   (5) checkClosureInvariants roadmap-mirror-clean is row-anchored (#339): a legitimate
//       cross-reference to #N inside ANOTHER issue's row does not violate; an actual
//       active `| #N | ...` row still does.
//
// OFFLINE-safe strategy: same KAOLA_GH_MOCK_SCRIPT pattern as test-bundle-claim.js.
// All fixtures are written to $TMPDIR — NOTHING is written inside the repo tree.
//
// Driving approach for receipt assertions (per advisor): run finalize as a subprocess and
// inspect closure_receipt in the JSON output rather than calling buildClosureReceipt directly,
// since the bundle fields are attached in cmdFinalize AFTER the builder call.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
// Git FIXTURE arrangement routes through the shared library — one process-boundary decision
// for the repo instead of one per line. See scripts/test-git-fixture.js for why arrangement
// git is neither classifiable under the four boundary classes nor convertible in-process.
const G = require('./test-git-fixture');

const repoRoot = path.resolve(__dirname, '..');
const claimScript = path.join(repoRoot, 'scripts', 'kaola-workflow-claim.js');
const sinkMergeScript = path.join(repoRoot, 'scripts', 'kaola-workflow-sink-merge.js');
const adaptiveSchema = require('./kaola-workflow-adaptive-schema.js');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error('FAIL: ' + message);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kw-bundle-finalize-'));
}

function initGitRepo(tmp) {
  G.init(tmp, { branch: 'main' });
  fs.writeFileSync(path.join(tmp, 'README.md'), 'fixture\n');
  G.commitPaths(tmp, 'README.md', 'init');
}

// #592: a git repo with a bare remote — needed to drive the real `--sink` transaction
// (kaola-workflow-sink-merge.js --sink) end to end (push_upstream/merge/push_main all
// operate against a real origin). Mirrors simulate-workflow-walkthrough.js's
// initGitRepoWithBareRemote.
function initGitRepoWithBareRemote(tmp) {
  initGitRepo(tmp);
  const remotePath = tmp + '-remote';
  G.initBare(remotePath);
  G.remoteAdd(tmp, 'origin', remotePath);
  G.git(tmp, ['push', '-u', 'origin', 'main']);
  return remotePath;
}

// Write a roadmap source file for an issue.
function writeRoadmapFile(tmpRoot, issueNum) {
  const dir = path.join(tmpRoot, 'kaola-workflow', '.roadmap');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'issue-' + issueNum + '.md'), [
    'issue: #' + issueNum,
    'title: Test issue ' + issueNum,
    'status: active',
    'workflow_project: bundle-test',
    'next_step: TBD'
  ].join('\n') + '\n');
}

// Write a minimal ROADMAP.md that references the given issue numbers.
function writeRoadmapMirror(tmpRoot, issueNums) {
  const roadmapDir = path.join(tmpRoot, 'kaola-workflow');
  fs.mkdirSync(roadmapDir, { recursive: true });
  let content = '# Kaola-Workflow Roadmap\n\n';
  content += '| Issue | Title | Status | Project | Next Step |\n';
  content += '|-------|-------|--------|---------|----------|\n';
  for (const n of issueNums) {
    content += '| #' + n + ' | Test issue ' + n + ' | active | bundle-test | TBD |\n';
  }
  fs.writeFileSync(path.join(roadmapDir, 'ROADMAP.md'), content);
}

// These fixtures jump straight from a hand-rolled state to finalize to exercise terminal
// archive/closure normalization, not a run. They used to seed a frozen workflow-plan.md purely so
// finalize's `adaptive_plan_missing` refusal would not fire before the archive behavior each
// fixture asserts. Both the plan and that refusal are gone — a finalize with no plan is not an
// error — so the fixture only has to make the project folder exist. It still records a passing
// consumer-mode validation, because finalize now READS that and reports it: seeding it keeps each
// fixture's report shaped like the green case it is meant to represent, and nothing here refuses
// either way.
function seedAdaptiveFinalizeFixture(tmpRoot, project) {
  const dir = path.join(tmpRoot, 'kaola-workflow', project);
  fs.mkdirSync(path.join(dir, '.cache'), { recursive: true });
  let cand = '';
  // Pass the shared constant explicitly rather than letting it default. It is `[]` today, so this
  // is behaviour-preserving — but the gate reads the same constant when it recomputes the hash, and
  // a fixture that omitted it would silently stop tracking the gate the moment the constant grew.
  try {
    cand = adaptiveSchema.computeCodeTreeHash(tmpRoot, project, adaptiveSchema.VALIDATION_TEST_CONSUMES) || '';
  } catch (_) { cand = ''; }
  fs.writeFileSync(path.join(dir, '.cache', 'final-validation.md'),
    'verdict: pass\nfindings_blocking: 0\nvalidated_candidate_hash: ' + cand + '\n');
}

// Write a bundle workflow-state.md file for a given project/members.
function writeBundleStateFile(tmpRoot, project, primaryIssue, memberIssues, opts) {
  opts = opts || {};
  const dir = path.join(tmpRoot, 'kaola-workflow', project);
  fs.mkdirSync(dir, { recursive: true });
  const sinkLines = opts.sink === 'pr'
    ? ['sink: pr', 'pr_url: ' + (opts.prUrl || 'https://example.test/pr/1')]
    : ['sink: merge'];
  const lines = [
    '# Kaola-Workflow State',
    '',
    '## Project',
    'name: ' + project,
    'status: active',
    '',
    '## Current Position',
    // These fixtures exercise bundle closure, sink, and archive behavior, not a run.
    'phase: adaptive',
    'phase_name: Adaptive',
    'workflow_path: adaptive',
    'runtime: claude',
    'step: complete',
    'next_command: /kaola-workflow-finalize ' + project,
    'next_skill: kaola-workflow-finalize ' + project,
    'main_session_role: orchestrator',
    'implementation_owner: N/A',
    'fix_owner: N/A',
    'inline_emergency_fallback_authorized: no',
    '',
    '## Pending Gates',
    '- finalization',
    '',
    '## Last Evidence',
    'phase_file: N/A',
    'cache_file: N/A',
    'last_command: startup',
    'last_result: folder_claimed',
    '',
    '## Last Updated',
    new Date().toISOString(),
    '',
    '## Sink',
    'branch: workflow/' + project,
    'issue_number: ' + primaryIssue,
    ...sinkLines,
    'run_posture: in-place',
    'issue_numbers: ' + memberIssues.join(','),
    'bundle_id: ' + project,
    'closure_policy: all_or_nothing'
  ];
  fs.writeFileSync(path.join(dir, 'workflow-state.md'), lines.join('\n') + '\n');
}

// Write a single-issue adaptive state for closure-only Finalization fixtures.
function writeSingleStateFile(tmpRoot, project, issueNumber) {
  const dir = path.join(tmpRoot, 'kaola-workflow', project);
  fs.mkdirSync(dir, { recursive: true });
  const lines = [
    '# Kaola-Workflow State',
    '',
    '## Project',
    'name: ' + project,
    'status: active',
    '',
    '## Current Position',
    'phase: adaptive',
    'phase_name: Adaptive',
    'workflow_path: adaptive',
    'runtime: claude',
    'step: complete',
    'next_command: /kaola-workflow-finalize ' + project,
    'next_skill: kaola-workflow-finalize ' + project,
    'main_session_role: orchestrator',
    'implementation_owner: N/A',
    'fix_owner: N/A',
    'inline_emergency_fallback_authorized: no',
    '',
    '## Pending Gates',
    '- finalization',
    '',
    '## Last Evidence',
    'phase_file: N/A',
    'cache_file: N/A',
    'last_command: startup',
    'last_result: folder_claimed',
    '',
    '## Last Updated',
    new Date().toISOString(),
    '',
    '## Sink',
    'branch: workflow/issue-' + issueNumber,
    'issue_number: ' + issueNumber,
    'sink: merge',
    'run_posture: in-place'
  ];
  fs.writeFileSync(path.join(dir, 'workflow-state.md'), lines.join('\n') + '\n');
  seedAdaptiveFinalizeFixture(tmpRoot, project);
}

// Write a mock gh script. Behaviour:
//   - `issue view N` returns closed JSON for closedIssues, open for others.
//   - `issue edit N --remove-label` logs "label-removed:N" to logFile.
//   - `issue comment N --body ...` logs "comment:N" to logFile.
//   - `throwOnIssueView`: if a number, throw on `issue view N` for that issue.
//   - other calls: no-op exit 0.
function writeGhMockScript(binDir, opts) {
  const logFile = opts && opts.logFile ? JSON.stringify(opts.logFile) : 'null';
  const closedIssues = opts && opts.closedIssues ? JSON.stringify(opts.closedIssues) : '[]';
  const throwOnView = opts && opts.throwOnIssueView != null ? String(opts.throwOnIssueView) : 'null';
  // #371: `pr view` route for cmdWatchPr coverage — configurable PR state (MERGED/CLOSED/OPEN).
  const prState = opts && opts.prState ? JSON.stringify(opts.prState) : 'null';
  // #937: opt-in mutable issue-comment store; see the two comment routes at the tail.
  const storeFile = opts && opts.commentStore ? JSON.stringify(opts.commentStore) : 'null';

  fs.mkdirSync(binDir, { recursive: true });
  const script = [
    "'use strict';",
    'const fs = require("fs");',
    'const argv = process.argv.slice(2);',
    'const a = argv.join(" ");',
    'const logFile = ' + logFile + ';',
    'const closedIssues = new Set(' + closedIssues + '.map(String));',
    'const throwOnView = ' + throwOnView + ';',
    'const prState = ' + prState + ';',
    '',
    'function log(msg) {',
    '  if (!logFile) return;',
    '  try { fs.appendFileSync(logFile, msg + "\\n"); } catch(_) {}',
    '}',
    '',
    '// repo view',
    'if (a.includes("repo view")) {',
    '  process.stdout.write(JSON.stringify({owner:{login:"test"},name:"repo"}) + "\\n");',
    '  process.exit(0);',
    '}',
    '',
    '// #371: pr view <url> --json state,number',
    'if (a.includes("pr view")) {',
    '  log("pr-view");',
    '  process.stdout.write(JSON.stringify({state: prState || "OPEN", number: 999}) + "\\n");',
    '  process.exit(0);',
    '}',
    '',
    '// issue view N --json state',
    'const viewM = a.match(/issue view (\\d+)/);',
    'if (viewM) {',
    '  const n = viewM[1];',
    '  if (throwOnView !== "null" && n === String(throwOnView)) {',
    '    process.stderr.write("mock gh: forced error on issue view " + n + "\\n");',
    '    process.exit(1);',
    '  }',
    '  if (closedIssues.has(n)) {',
    '    process.stdout.write(JSON.stringify({number:parseInt(n),state:"closed",title:"issue "+n,body:"",labels:[]}) + "\\n");',
    '  } else {',
    '    process.stdout.write(JSON.stringify({number:parseInt(n),state:"open",title:"issue "+n,body:"",labels:[]}) + "\\n");',
    '  }',
    '  process.exit(0);',
    '}',
    '',
    '// #617: issue close N --comment ... -> logged as close:N (proves whether/when a real close was attempted)',
    'const closeM = a.match(/^issue close (\\d+)/);',
    'if (closeM) {',
    '  log("close:" + closeM[1]);',
    '  process.stdout.write("\\n");',
    '  process.exit(0);',
    '}',
    '',
    '// issue edit N --remove-label',
    'if (a.includes("issue edit") && a.includes("--remove-label")) {',
    '  const em = a.match(/issue edit (\\d+)/);',
    '  const n = em ? em[1] : "?";',
    '  log("label-removed:" + n);',
    '  process.exit(0);',
    '}',
    '',
    '// issue edit N --add-label',
    'if (a.includes("issue edit") && a.includes("--add-label")) {',
    '  const em = a.match(/issue edit (\\d+)/);',
    '  const n = em ? em[1] : "?";',
    '  log("label-added:" + n);',
    '  process.exit(0);',
    '}',
    '',
    '// issue comment N --body ...',
    'if (a.includes("issue comment")) {',
    '  const cm = a.match(/issue comment (\\d+)/);',
    '  const n = cm ? cm[1] : "?";',
    '  log("comment:" + n);',
    '  process.exit(0);',
    '}',
    '',
    '// label create ...',
    'if (a.includes("label create")) { process.exit(0); }',
    '',
    '// #937: the ISSUE-COMMENT STORE. Without opts.commentStore these are the two pre-existing',
    '// routes unchanged — the list answers [] and a DELETE is a silent no-op — so every scenario',
    '// that configures no store behaves exactly as before. With one, a kw:claim marker is a thing',
    '// that EXISTS on a fixture issue and can be observed to be gone (or still sitting there)',
    '// afterwards. That is the only way to tell a delete that ran from a delete whose composed',
    '// marker matched nothing: both make the same calls and both report the same way.',
    '// DELETE is tested FIRST — both argv carry the substring "comments".',
    'const storeFile = ' + storeFile + ';',
    'function loadStore(){ try { return JSON.parse(fs.readFileSync(storeFile, "utf8")); } catch(_) { return {}; } }',
    'const delM = a.match(/issues\\/comments\\/(\\d+)/);',
    'if (a.includes("api") && a.includes("DELETE") && delM) {',
    '  if (storeFile) {',
    '    const id = Number(delM[1]);',
    '    const s = loadStore();',
    '    for (const k of Object.keys(s)) s[k] = (s[k] || []).filter(function(c){ return Number(c && c.id) !== id; });',
    '    try { fs.writeFileSync(storeFile, JSON.stringify(s, null, 2)); } catch(_) {}',
    '    log("comment-deleted:" + id);',
    '  }',
    '  process.stdout.write("{}\\n");',
    '  process.exit(0);',
    '}',
    '',
    '// api repos/.../issues/N/comments => the store for N, or [] when none is configured',
    'const listM = a.match(/issues\\/(\\d+)\\/comments/);',
    'if (a.includes("api") && (listM || a.includes("comments"))) {',
    '  if (storeFile && listM) log("comments-listed:" + listM[1]);',
    '  process.stdout.write(JSON.stringify(storeFile && listM ? (loadStore()[listM[1]] || []) : []) + "\\n");',
    '  process.exit(0);',
    '}',
    '',
    '// api --method DELETE ...',
    'if (a.includes("api") && a.includes("DELETE")) { process.exit(0); }',
    '',
    'process.stdout.write("\\n");',
    'process.exit(0);',
  ].join('\n');
  fs.writeFileSync(path.join(binDir, 'gh.js'), script);
}

function runFinalize(args, cwd, binDir, extraEnv) {
  const mockEnv = fs.existsSync(path.join(binDir, 'gh.js'))
    ? { KAOLA_GH_MOCK_SCRIPT: path.join(binDir, 'gh.js') }
    : {};
  const result = spawnSync(process.execPath, [claimScript, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 60000,
    env: Object.assign({}, process.env, {
      KAOLA_WORKFLOW_OFFLINE: '0',
      KAOLA_WORKTREE_NATIVE: '0',  // in-place mode: avoid git worktree ops in $TMPDIR
    }, mockEnv, extraEnv || {})
  });
  return result;
}

function parseOutput(result) {
  const lines = (result.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
  if (!lines.length) return null;
  try { return JSON.parse(lines[lines.length - 1]); } catch (_) { return null; }
}

function readLog(logFile) {
  try { return fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean); } catch (_) { return []; }
}

// Also import checkClosureInvariants for direct per-issue invariant testing.
const { checkClosureInvariants, verifyArchiveComplete, archiveProjectDir,
  buildClaimAnchors } = require('./kaola-workflow-claim');
const { archiveSucceeded } = require('./kaola-workflow-closure-contract');

// ---------------------------------------------------------------------------
// Test (1): Bundle finalize — closes all 3 members
// ---------------------------------------------------------------------------

(function testBundleFinalizeAllMembers() {
  console.log('Test (1): bundle finalize closes all 3 members, archives one folder');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  const logFile = path.join(tmpRoot, 'gh-calls.log');
  const project = 'bundle-42-47-53';
  try {
    initGitRepo(tmpRoot);
    writeBundleStateFile(tmpRoot, project, 42, [42, 47, 53]);
    writeRoadmapFile(tmpRoot, 42);
    writeRoadmapFile(tmpRoot, 47);
    writeRoadmapFile(tmpRoot, 53);
    writeRoadmapMirror(tmpRoot, [42, 47, 53]);

    // All issues are "closed" so the receipt shows closed_issues=[42,47,53]
    writeGhMockScript(binDir, {
      logFile,
      closedIssues: [42, 47, 53],
    });
    // Seed LAST, after every fixture file (gh mock, roadmap) is in place, so the
    // recorded validated_candidate_hash matches the tree finalize will recompute over.
    seedAdaptiveFinalizeFixture(tmpRoot, project);

    const result = runFinalize(
      ['finalize', '--project', project],
      tmpRoot, binDir
    );
    const out = parseOutput(result);

    assert(result.status === 0, 'bundle finalize exits 0; got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out !== null, 'finalize emits JSON');
    assert(out.status === 'closed', 'output status is closed, got ' + JSON.stringify(out && out.status));

    // Archive folder exists; live project dir is gone
    const archiveBase = path.join(tmpRoot, 'kaola-workflow', 'archive');
    const archiveDest = out && out.dest;
    assert(archiveDest != null, 'finalize output has dest');
    assert(fs.existsSync(archiveDest), 'archive folder exists at ' + archiveDest);
    const liveDir = path.join(tmpRoot, 'kaola-workflow', project);
    assert(!fs.existsSync(liveDir), 'live project dir is gone after finalize');

    // Closure receipt fields
    const receipt = out && out.closure_receipt;
    assert(receipt != null, 'closure_receipt present in output');
    if (receipt) {
      // closed_issues: all three members
      assert(Array.isArray(receipt.closed_issues), 'receipt has closed_issues array');
      if (Array.isArray(receipt.closed_issues)) {
        assert(receipt.closed_issues.length === 3, 'closed_issues has 3 entries, got ' + receipt.closed_issues.length);
        assert(receipt.closed_issues.includes(42), 'closed_issues includes 42');
        assert(receipt.closed_issues.includes(47), 'closed_issues includes 47');
        assert(receipt.closed_issues.includes(53), 'closed_issues includes 53');
      }

      // failed_issue_closures: empty (all succeeded)
      assert(Array.isArray(receipt.failed_issue_closures), 'receipt has failed_issue_closures array');
      if (Array.isArray(receipt.failed_issue_closures)) {
        assert(receipt.failed_issue_closures.length === 0, 'failed_issue_closures is empty');
      }

      // issue_numbers on the receipt
      assert(Array.isArray(receipt.issue_numbers), 'receipt has issue_numbers');
      if (Array.isArray(receipt.issue_numbers)) {
        assert(receipt.issue_numbers.length === 3, 'receipt.issue_numbers has 3 entries');
      }
    }

    // Labels were removed for all members
    const calls = readLog(logFile);
    const labelsRemoved = calls.filter(c => c.startsWith('label-removed:'));
    assert(labelsRemoved.some(c => c === 'label-removed:42'), 'label removed for member 42');
    assert(labelsRemoved.some(c => c === 'label-removed:47'), 'label removed for member 47');
    assert(labelsRemoved.some(c => c === 'label-removed:53'), 'label removed for member 53');

    // Closure invariants pass
    const invariants = out && out.closure_invariants;
    assert(invariants != null, 'closure_invariants present');
    assert(invariants && invariants.ok === true, 'closure invariants pass; violations: ' + JSON.stringify(invariants && invariants.violations));

  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// ---------------------------------------------------------------------------
// Test (2): Warning-first — one member remote-close probe fails
// ---------------------------------------------------------------------------

(function testBundleFinalizeWarningFirst() {
  console.log('Test (2): warning-first — issue view fails for member 47, recorded in failed_issue_closures, closure still completes');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  const project = 'bundle-42-47-53';
  try {
    initGitRepo(tmpRoot);
    writeBundleStateFile(tmpRoot, project, 42, [42, 47, 53]);
    writeRoadmapFile(tmpRoot, 42);
    writeRoadmapFile(tmpRoot, 47);
    writeRoadmapFile(tmpRoot, 53);
    writeRoadmapMirror(tmpRoot, [42, 47, 53]);

    // issue view throws for member 47 -> that member lands in failed_issue_closures
    // issues 42 and 53 are closed normally
    writeGhMockScript(binDir, {
      closedIssues: [42, 53],
      throwOnIssueView: 47,
    });
    seedAdaptiveFinalizeFixture(tmpRoot, project);

    const result = runFinalize(
      ['finalize', '--project', project],
      tmpRoot, binDir
    );
    const out = parseOutput(result);

    // Closure must complete successfully despite the probe failure
    assert(result.status === 0, 'warning-first finalize exits 0; got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out !== null, 'warning-first finalize emits JSON');
    assert(out.status === 'closed', 'status is closed, got ' + JSON.stringify(out && out.status));

    // Archive folder should exist
    assert(out && out.dest && fs.existsSync(out.dest), 'archive folder exists');

    const receipt = out && out.closure_receipt;
    assert(receipt != null, 'receipt present');
    if (receipt) {
      // failed_issue_closures includes member 47
      assert(Array.isArray(receipt.failed_issue_closures), 'receipt has failed_issue_closures');
      if (Array.isArray(receipt.failed_issue_closures)) {
        assert(receipt.failed_issue_closures.includes(47), 'failed_issue_closures includes 47');
      }
      // closed_issues includes 42 and 53 (probed successfully as closed)
      assert(Array.isArray(receipt.closed_issues), 'receipt has closed_issues');
      if (Array.isArray(receipt.closed_issues)) {
        assert(receipt.closed_issues.includes(42), 'closed_issues includes 42');
        assert(receipt.closed_issues.includes(53), 'closed_issues includes 53');
        assert(!receipt.closed_issues.includes(47), 'failed member 47 not in closed_issues');
      }
    }

  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// ---------------------------------------------------------------------------
// Test (2b) #369 + #396.4 (D2): partial-closure truthfulness at the cmdFinalize MERGE LANE — a member
// probed STILL OPEN while online lands in open_issues (never silently neither, AC2) and the token is
// `partial` not `skipped_offline` (AC2). BUT cmdFinalize runs BEFORE sink-merge closes members, so on
// the NORMAL bundle merge-lane finalize every member is open → the old code fired remote-members-closed
// (ok:false) on the HAPPY PATH (alarm fatigue, the #396.4/D2 bug). The fix: cmdFinalize tags its receipt
// close_disposition:'close_pending' and checkClosureInvariants SKIPS remote-members-closed for it. The
// bucket arrays + token stay truthful; only the premature ALARM is defused (it fires truthfully at
// sink-merge/watch-pr, where close_disposition is unset — see Test (#371) watch-pr below + test-gitlab/gitea-sinks).
// ---------------------------------------------------------------------------

(function testBundleFinalizePartialOpenMember() {
  console.log('Test (2b) #369+#396.4 (D2): merge-lane finalize — member 47 open → open_issues + partial token, close_pending suppresses the premature alarm');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  const project = 'bundle-42-47-53';
  try {
    initGitRepo(tmpRoot);
    writeBundleStateFile(tmpRoot, project, 42, [42, 47, 53]);
    writeRoadmapFile(tmpRoot, 42);
    writeRoadmapFile(tmpRoot, 47);
    writeRoadmapFile(tmpRoot, 53);
    writeRoadmapMirror(tmpRoot, [42, 47, 53]);
    // 42 + 53 closed; 47 returns state:open (not in closedIssues, no throw).
    writeGhMockScript(binDir, { closedIssues: [42, 53] });
    seedAdaptiveFinalizeFixture(tmpRoot, project);

    // #427: merge-lane finalize uses --keep-worktree (sink-merge closes members later).
    // Without --keep-worktree, #427's closeIssueIdempotent would close 47 here.
    const result = runFinalize(['finalize', '--project', project, '--keep-worktree'], tmpRoot, binDir);
    const out = parseOutput(result);
    assert(result.status === 0, 'partial finalize still exits 0 (warn-first); got ' + result.status);
    const receipt = out && out.closure_receipt;
    assert(receipt != null, 'receipt present');
    if (receipt) {
      assert(Array.isArray(receipt.open_issues) && receipt.open_issues.includes(47),
        '#369 AC2: member 47 (open online) recorded in open_issues, got ' + JSON.stringify(receipt.open_issues));
      assert(!(receipt.closed_issues || []).includes(47), '#369: 47 not in closed_issues');
      assert(!(receipt.failed_issue_closures || []).includes(47), '#369: 47 not in failed_issue_closures');
      assert(receipt.remote_issue_closed === 'partial',
        '#369 AC2: online partial close → remote_issue_closed === partial (never skipped_offline), got ' + receipt.remote_issue_closed);
      // #396.4 (D2): the merge-lane finalize tags close_pending so the premature alarm is suppressed.
      assert(receipt.close_disposition === 'close_pending',
        '#396.4 (D2): merge-lane finalize tags close_disposition: close_pending, got ' + receipt.close_disposition);
    }
    const inv = out && out.closure_invariants;
    // #396.4 (D2): remote-members-closed is SKIPPED at the close-pending merge lane (the members will
    // close at sink). The invariant set is therefore clean for THIS reason — assert it is NOT flagged.
    assert(inv && !(Array.isArray(inv.violations) && inv.violations.some(v => v.id === 'remote-members-closed')),
      '#396.4 (D2): remote-members-closed is suppressed (close_pending) at the merge lane, got ' + JSON.stringify(inv && inv.violations));
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// ---------------------------------------------------------------------------
// Test (2c) #396.4 (D2) FIRING DIRECTION — the post-sink partial-failure MUST still fire
// remote-members-closed (close_disposition UNSET). Test (2b) proved the pre-sink merge lane
// SUPPRESSES it; this proves the gate is not a blanket suppression. The contrast pair (same
// receipt, only close_disposition differs) locks the gate exactly: a future bug that always
// suppresses (or stamps close_pending on a post-sink receipt) breaks exactly one of the two.
// Closes the R1 coverage gap the cluster-L adversarial review flagged (Test (2b) inverted the
// only firing assertion with no replacement).
// ---------------------------------------------------------------------------

(function testRemoteMembersClosedFiresPostSink() {
  console.log('Test (2c) #396.4 (D2): post-sink partial (close_disposition UNSET) FIRES remote-members-closed; close_pending suppresses the SAME receipt');
  const tmpRoot = makeTmpRoot();
  try {
    const archiveDest = path.join(tmpRoot, 'kaola-workflow', 'archive', 'bundle-42-47-53');
    fs.mkdirSync(archiveDest, { recursive: true });
    // A post-sink partial: member 47 failed to close; sink-merge/watch-pr leave close_disposition UNSET.
    const postSink = { issue_numbers: [42, 47, 53], closed_issues: [42, 53], failed_issue_closures: [47], remote_issue_closed: 'partial' };
    const invFires = checkClosureInvariants(tmpRoot, postSink, archiveDest);
    assert(invFires && Array.isArray(invFires.violations) && invFires.violations.some(function(v) { return v.id === 'remote-members-closed'; }),
      '#396.4 (D2) FIRING: a post-sink partial (no close_disposition) MUST fire remote-members-closed, got ' + JSON.stringify(invFires && invFires.violations));
    assert(invFires && invFires.ok === false, '#396.4 (D2) FIRING: ok===false on a real post-sink partial');
    // The SAME receipt tagged close_pending (the pre-sink merge lane) suppresses it — the gate flips ONLY on the disposition.
    const prePending = Object.assign({}, postSink, { close_disposition: 'close_pending' });
    const invSuppressed = checkClosureInvariants(tmpRoot, prePending, archiveDest);
    assert(invSuppressed && !(Array.isArray(invSuppressed.violations) && invSuppressed.violations.some(function(v) { return v.id === 'remote-members-closed'; })),
      '#396.4 (D2): close_pending on the SAME receipt suppresses remote-members-closed, got ' + JSON.stringify(invSuppressed && invSuppressed.violations));
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// ---------------------------------------------------------------------------
// Test (3): Single-issue finalize regression (AC#1 / dogfooding)
// ---------------------------------------------------------------------------

(function testSingleIssueFinalizeRegression() {
  console.log('Test (3): single-issue finalize — one issue closed, receipt has NO bundle fields');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  const project = 'issue-99';
  try {
    initGitRepo(tmpRoot);
    writeSingleStateFile(tmpRoot, project, 99);
    writeRoadmapFile(tmpRoot, 99);
    writeRoadmapMirror(tmpRoot, [99]);

    writeGhMockScript(binDir, {
      closedIssues: [99],
    });
    seedAdaptiveFinalizeFixture(tmpRoot, project);

    const result = runFinalize(
      ['finalize', '--project', project],
      tmpRoot, binDir
    );
    const out = parseOutput(result);

    assert(result.status === 0, 'single-issue finalize exits 0; got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out !== null, 'single-issue finalize emits JSON');
    assert(out.status === 'closed', 'status is closed, got ' + JSON.stringify(out && out.status));

    // Archive folder exists; live project dir gone
    assert(out && out.dest && fs.existsSync(out.dest), 'archive folder exists');
    assert(!fs.existsSync(path.join(tmpRoot, 'kaola-workflow', project)), 'live project dir gone');

    // Receipt has NO bundle-specific fields (or empty arrays)
    const receipt = out && out.closure_receipt;
    assert(receipt != null, 'receipt present');
    if (receipt) {
      // closed_issues / failed_issue_closures must be absent or empty
      assert(
        receipt.closed_issues == null || (Array.isArray(receipt.closed_issues) && receipt.closed_issues.length === 0),
        'single-issue receipt has no closed_issues bundle field; got ' + JSON.stringify(receipt.closed_issues)
      );
      assert(
        receipt.failed_issue_closures == null || (Array.isArray(receipt.failed_issue_closures) && receipt.failed_issue_closures.length === 0),
        'single-issue receipt has no failed_issue_closures bundle field; got ' + JSON.stringify(receipt.failed_issue_closures)
      );
    }

    // Closure invariants pass for the single-issue path
    const invariants = out && out.closure_invariants;
    assert(invariants != null, 'closure_invariants present');
    assert(invariants && invariants.ok === true, 'single-issue closure invariants pass; violations: ' + JSON.stringify(invariants && invariants.violations));

  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// Tests (4)/(5) stood here: checkClosureInvariants' roadmap-source-absent and
// roadmap-mirror-clean checks (the latter #339's row-anchored cross-reference-vs-active-row
// distinction). Both checks are retired under ADR 0018 §5 — there is no local roadmap source or
// mirror left for a closure to leave clean. Deleted with their mechanism.

// ---------------------------------------------------------------------------
// Test (#371): cmdRelease bundle path — clears the advisory claim for EVERY member
// (the per-member clearAdvisoryClaim loop had zero test references).
// ---------------------------------------------------------------------------
(function testReleaseBundleClearsEveryMember() {
  console.log('Test (#371): release bundle clears the advisory claim for every member');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  const logFile = path.join(tmpRoot, 'gh-calls.log');
  try {
    initGitRepo(tmpRoot);
    writeBundleStateFile(tmpRoot, 'bundle-42-47-53', 42, [42, 47, 53]);
    writeRoadmapFile(tmpRoot, 42); writeRoadmapFile(tmpRoot, 47); writeRoadmapFile(tmpRoot, 53);
    writeGhMockScript(binDir, { logFile });

    const result = runFinalize(['release', '--project', 'bundle-42-47-53'], tmpRoot, binDir);
    assert(result.status === 0, '#371 release: exit 0, got ' + result.status + '\nstderr: ' + (result.stderr || ''));
    const calls = readLog(logFile);
    for (const n of [42, 47, 53]) {
      assert(calls.includes('label-removed:' + n), '#371 release: advisory claim cleared for member ' + n + ', got: ' + JSON.stringify(calls));
    }
    // The active folder is gone (archived as discarded).
    const active = fs.readdirSync(path.join(tmpRoot, 'kaola-workflow')).filter(n => n.startsWith('bundle-42-47-53'));
    assert(active.length === 0, '#371 release: active bundle folder removed (discarded), got: ' + JSON.stringify(active));
  } finally { fs.rmSync(tmpRoot, { recursive: true, force: true }); }
})();

// ---------------------------------------------------------------------------
// Test (#371): cmdWatchPr bundle MERGED — per-member close buckets + truthful token.
// The watch-pr bundle MERGED path (per-member probe + closed/open buckets + `partial`
// token) had zero test references. This is also the planted-regression target: a
// change that drops a member from the receipt buckets fails here.
// ---------------------------------------------------------------------------
(function testWatchPrBundleMergedReceipt() {
  console.log('Test (#371): watch-pr bundle MERGED → per-member buckets + partial token');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  const logFile = path.join(tmpRoot, 'gh-calls.log');
  try {
    initGitRepo(tmpRoot);
    writeBundleStateFile(tmpRoot, 'bundle-42-47-53', 42, [42, 47, 53], { sink: 'pr', prUrl: 'https://example.test/pr/7' });
    writeRoadmapFile(tmpRoot, 42); writeRoadmapFile(tmpRoot, 47); writeRoadmapFile(tmpRoot, 53);
    // PR merged; members 42 + 53 closed online, 47 still OPEN → partial.
    writeGhMockScript(binDir, { logFile, prState: 'MERGED', closedIssues: [42, 53] });

    const result = runFinalize(['watch-pr'], tmpRoot, binDir);
    assert(result.status === 0, '#371 watch-pr: exit 0, got ' + result.status + '\nstderr: ' + (result.stderr || ''));
    const out = parseOutput(result);
    assert(out && Array.isArray(out.cleanups) && out.cleanups.length === 1, '#371 watch-pr: one cleanup emitted, got ' + JSON.stringify(out && out.cleanups));
    const r = out.cleanups[0].receipt;
    assert(JSON.stringify(r.issue_numbers) === JSON.stringify([42, 47, 53]), '#371 watch-pr: receipt.issue_numbers=[42,47,53], got ' + JSON.stringify(r.issue_numbers));
    assert(JSON.stringify(r.closed_issues) === JSON.stringify([42, 53]), '#371 watch-pr: closed_issues=[42,53], got ' + JSON.stringify(r.closed_issues));
    assert(JSON.stringify(r.open_issues) === JSON.stringify([47]), '#371 watch-pr: open_issues=[47] (member still open never silently dropped), got ' + JSON.stringify(r.open_issues));
    assert(r.remote_issue_closed === 'partial', '#371 watch-pr: truthful `partial` token (not skipped_offline), got ' + JSON.stringify(r.remote_issue_closed));
    const calls = readLog(logFile);
    for (const n of [42, 47, 53]) {
      assert(calls.includes('label-removed:' + n), '#371 watch-pr: advisory claim cleared for member ' + n + ', got ' + JSON.stringify(calls));
    }
  } finally { fs.rmSync(tmpRoot, { recursive: true, force: true }); }
})();

// ---------------------------------------------------------------------------
// Test (#371): cmdWatchPr bundle CLOSED (PR closed unmerged) — abandoned archive,
// every member's advisory claim cleared, bundle receipt carries issue_numbers.
// ---------------------------------------------------------------------------
(function testWatchPrBundleClosed() {
  console.log('Test (#371): watch-pr bundle CLOSED → abandoned archive + per-member label clear');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  const logFile = path.join(tmpRoot, 'gh-calls.log');
  try {
    initGitRepo(tmpRoot);
    writeBundleStateFile(tmpRoot, 'bundle-42-47-53', 42, [42, 47, 53], { sink: 'pr', prUrl: 'https://example.test/pr/8' });
    writeRoadmapFile(tmpRoot, 42); writeRoadmapFile(tmpRoot, 47); writeRoadmapFile(tmpRoot, 53);
    writeGhMockScript(binDir, { logFile, prState: 'CLOSED' });

    const result = runFinalize(['watch-pr'], tmpRoot, binDir);
    assert(result.status === 0, '#371 watch-pr CLOSED: exit 0, got ' + result.status + '\nstderr: ' + (result.stderr || ''));
    const out = parseOutput(result);
    assert(out && Array.isArray(out.cleanups) && out.cleanups.length === 1, '#371 watch-pr CLOSED: one cleanup, got ' + JSON.stringify(out && out.cleanups));
    assert(JSON.stringify(out.cleanups[0].receipt.issue_numbers) === JSON.stringify([42, 47, 53]),
      '#371 watch-pr CLOSED: receipt.issue_numbers preserved, got ' + JSON.stringify(out.cleanups[0].receipt.issue_numbers));
    const calls = readLog(logFile);
    for (const n of [42, 47, 53]) {
      assert(calls.includes('label-removed:' + n), '#371 watch-pr CLOSED: claim cleared for member ' + n);
    }
    // Live folder discarded (archived abandoned).
    const live = fs.readdirSync(path.join(tmpRoot, 'kaola-workflow')).filter(n => n === 'bundle-42-47-53');
    assert(live.length === 0, '#371 watch-pr CLOSED: live bundle folder archived, got ' + JSON.stringify(live));
  } finally { fs.rmSync(tmpRoot, { recursive: true, force: true }); }
})();

// ---------------------------------------------------------------------------
// Test (#371) crash interleaving (a): kill mid-label-loop after writeState leaves a
// live folder with partial labels; recovery via `release` must clear EVERY member's
// advisory claim (idempotent — clears all, regardless of which were added pre-crash).
// ---------------------------------------------------------------------------
(function testCrashRecoveryReleaseClearsAllMembers() {
  console.log('Test (#371) crash-a: release after a mid-claim crash clears every member');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  const logFile = path.join(tmpRoot, 'gh-calls.log');
  try {
    initGitRepo(tmpRoot);
    // Simulate the post-crash state: a live bundle folder exists (writeState ran) but
    // assume the label loop only got partway — release must still clear ALL members.
    writeBundleStateFile(tmpRoot, 'bundle-42-47-53', 42, [42, 47, 53]);
    writeRoadmapFile(tmpRoot, 42); writeRoadmapFile(tmpRoot, 47); writeRoadmapFile(tmpRoot, 53);
    writeGhMockScript(binDir, { logFile });

    const result = runFinalize(['release', '--project', 'bundle-42-47-53'], tmpRoot, binDir);
    assert(result.status === 0, '#371 crash-a: release exit 0, got ' + result.status + '\nstderr: ' + (result.stderr || ''));
    const calls = readLog(logFile);
    for (const n of [42, 47, 53]) {
      assert(calls.includes('label-removed:' + n), '#371 crash-a: member ' + n + ' advisory claim cleared on recovery, got ' + JSON.stringify(calls));
    }
  } finally { fs.rmSync(tmpRoot, { recursive: true, force: true }); }
})();

// ---------------------------------------------------------------------------
// Test (#371) crash interleaving (b): a finalize RE-RUN after a post-rename crash —
// the live source folder is already archived, so the second run must NOT crash and
// must NOT silently succeed-with-leaked-labels. Documents the actual recovery shape.
// ---------------------------------------------------------------------------
(function testCrashRecoveryFinalizeRerunAfterArchive() {
  console.log('Test (#371) crash-b: finalize re-run after the source folder is already archived');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  const logFile = path.join(tmpRoot, 'gh-calls.log');
  try {
    initGitRepo(tmpRoot);
    writeBundleStateFile(tmpRoot, 'bundle-42-47-53', 42, [42, 47, 53]);
    writeRoadmapFile(tmpRoot, 42); writeRoadmapFile(tmpRoot, 47); writeRoadmapFile(tmpRoot, 53);
    writeGhMockScript(binDir, { logFile, closedIssues: [42, 47, 53] });
    seedAdaptiveFinalizeFixture(tmpRoot, 'bundle-42-47-53');

    // First finalize: closes + archives the bundle.
    const first = runFinalize(['finalize', '--project', 'bundle-42-47-53'], tmpRoot, binDir);
    assert(first.status === 0, '#371 crash-b: first finalize exit 0, got ' + first.status + '\nstderr: ' + (first.stderr || ''));
    const liveAfter = fs.readdirSync(path.join(tmpRoot, 'kaola-workflow')).filter(n => n === 'bundle-42-47-53');
    assert(liveAfter.length === 0, '#371 crash-b: first finalize archived the live folder, got ' + JSON.stringify(liveAfter));

    // Second finalize (the post-rename crash re-run): the live folder is gone. Must not crash
    // (graceful no-active-folder refusal), never a stack trace.
    const second = runFinalize(['finalize', '--project', 'bundle-42-47-53'], tmpRoot, binDir);
    assert(second.status !== null, '#371 crash-b: finalize re-run did not crash/timeout');
    assert(!/Error:|TypeError|at Object\.|at Module\./.test(second.stderr || ''),
      '#371 crash-b: finalize re-run is a graceful refusal, not an uncaught exception, got stderr: ' + (second.stderr || '').slice(0, 300));
  } finally { fs.rmSync(tmpRoot, { recursive: true, force: true }); }
})();

// ---------------------------------------------------------------------------
// Test (#371): worktree-suppression posture — in-place (KAOLA_WORKTREE_NATIVE=0)
// finalize leaves NO `.worktrees/` provisioned for the bundle (posture contract).
// ---------------------------------------------------------------------------
(function testBundleWorktreePostureInPlace() {
  console.log('Test (#371): in-place finalize provisions no worktree for the bundle');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  try {
    initGitRepo(tmpRoot);
    writeBundleStateFile(tmpRoot, 'bundle-42-47-53', 42, [42, 47, 53]);
    writeRoadmapFile(tmpRoot, 42); writeRoadmapFile(tmpRoot, 47); writeRoadmapFile(tmpRoot, 53);
    writeGhMockScript(binDir, { closedIssues: [42, 47, 53] });
    seedAdaptiveFinalizeFixture(tmpRoot, 'bundle-42-47-53');
    runFinalize(['finalize', '--project', 'bundle-42-47-53'], tmpRoot, binDir);
    const kwDir = path.join(tmpRoot, '.kw', 'worktrees');
    const hasWorktrees = fs.existsSync(kwDir) && fs.readdirSync(kwDir).length > 0;
    assert(!hasWorktrees, '#371 posture: NATIVE=0 in-place finalize provisions no worktree, got ' + (hasWorktrees ? fs.readdirSync(kwDir).join(',') : 'none'));
  } finally { fs.rmSync(tmpRoot, { recursive: true, force: true }); }
})();

// ---------------------------------------------------------------------------
// Test (#508): bundle merge-lane close-accounting — all-open case
//
// BUG: on the merge lane (--keep-worktree), when ALL members are open, the probe
// loop at line ~2175 computes remote_issue_closed='partial' (because
// closedIssues.length===0 !== issueNumbers.length===3, so the 'already_closed'
// arm misses and falls to the else). But closed_issues is [], so the token
// ('partial') disagrees with the list ([]): "some closed" vs "none".
//
// The #497 invariant: no remote member should be closed before sink-merge on the
// merge lane. The no-close assertion (no `issue close` calls) must hold.
//
// FIX: extend the ternary to add a close_pending arm when closedIssues.length===0:
//   closed_all → 'already_closed'
//   none_closed → 'close_pending'   ← the fix
//   some_closed → 'partial'          ← mixed, already-correct
// ---------------------------------------------------------------------------

(function testBundleMergeLaneAllOpenAccountingFix() {
  console.log('Test (#508): merge-lane --keep-worktree all-open bundle → remote_issue_closed:close_pending + closed_issues:[] + zero close calls');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  const logFile = path.join(tmpRoot, 'gh-calls.log');
  const project = 'bundle-496-497';
  try {
    initGitRepo(tmpRoot);
    writeBundleStateFile(tmpRoot, project, 496, [496, 497]);
    writeRoadmapFile(tmpRoot, 496);
    writeRoadmapFile(tmpRoot, 497);
    writeRoadmapMirror(tmpRoot, [496, 497]);

    // ALL members are OPEN on the forge (none in closedIssues).
    // Write a custom mock that also logs `issue close N` calls so we can assert none happen
    // on the --keep-worktree merge lane (#497 invariant: no pre-sink remote close).
    const customScript = [
      "'use strict';",
      'const fs = require("fs");',
      'const argv = process.argv.slice(2);',
      'const a = argv.join(" ");',
      'const logFile = ' + JSON.stringify(logFile) + ';',
      'function log(msg) {',
      '  try { fs.appendFileSync(logFile, msg + "\\n"); } catch(_) {}',
      '}',
      '// repo view',
      'if (a.includes("repo view")) {',
      '  process.stdout.write(JSON.stringify({owner:{login:"test"},name:"repo"}) + "\\n");',
      '  process.exit(0);',
      '}',
      '// issue close N (must NOT be called on --keep-worktree merge lane)',
      'if (a.match(/^issue close \\d+/)) {',
      '  const m = a.match(/issue close (\\d+)/);',
      '  const n = m ? m[1] : "?";',
      '  log("issue-close:" + n);',
      '  process.stdout.write("\\n");',
      '  process.exit(0);',
      '}',
      '// issue view N → open (all members are open)',
      'const viewM = a.match(/issue view (\\d+)/);',
      'if (viewM) {',
      '  const n = viewM[1];',
      '  process.stdout.write(JSON.stringify({number:parseInt(n),state:"open",title:"issue "+n,body:"",labels:[]}) + "\\n");',
      '  process.exit(0);',
      '}',
      '// issue edit N --remove-label',
      'if (a.includes("issue edit") && a.includes("--remove-label")) {',
      '  const em = a.match(/issue edit (\\d+)/);',
      '  log("label-removed:" + (em ? em[1] : "?"));',
      '  process.exit(0);',
      '}',
      '// issue edit N --add-label',
      'if (a.includes("issue edit") && a.includes("--add-label")) { process.exit(0); }',
      '// issue comment N --body ...',
      'if (a.includes("issue comment")) {',
      '  const cm = a.match(/issue comment (\\d+)/);',
      '  log("comment:" + (cm ? cm[1] : "?"));',
      '  process.exit(0);',
      '}',
      '// label create',
      'if (a.includes("label create")) { process.exit(0); }',
      '// api repos/.../issues/N/comments => []',
      'if (a.includes("api") && a.includes("comments")) {',
      '  process.stdout.write("[]\\n");',
      '  process.exit(0);',
      '}',
      '// api --method DELETE',
      'if (a.includes("api") && a.includes("DELETE")) { process.exit(0); }',
      'process.stdout.write("\\n");',
      'process.exit(0);',
    ].join('\n');
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(path.join(binDir, 'gh.js'), customScript);
    seedAdaptiveFinalizeFixture(tmpRoot, project);

    const result = runFinalize(
      ['finalize', '--project', project, '--keep-worktree'],
      tmpRoot, binDir
    );
    const out = parseOutput(result);

    assert(result.status === 0, '#508 merge-lane finalize exits 0; got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out !== null, '#508 finalize emits JSON');

    const receipt = out && out.closure_receipt;
    assert(receipt != null, '#508 receipt present');
    if (receipt) {
      // THE BUG: pre-fix, remote_issue_closed is 'partial' even though closed_issues=[]
      // POST-FIX: when all members are open (closed_issues=[]), token must be 'close_pending'
      assert(receipt.remote_issue_closed === 'close_pending',
        '#508: all-open merge-lane bundle must report remote_issue_closed=close_pending, got ' + JSON.stringify(receipt.remote_issue_closed));

      // closed_issues must be empty — no member was closed before sink-merge
      assert(Array.isArray(receipt.closed_issues) && receipt.closed_issues.length === 0,
        '#508: closed_issues must be [] on merge lane (no pre-sink close), got ' + JSON.stringify(receipt.closed_issues));

      // close_disposition must be close_pending (consistent with the token)
      assert(receipt.close_disposition === 'close_pending',
        '#508: close_disposition must be close_pending, got ' + JSON.stringify(receipt.close_disposition));

      // closure.closed must be empty
      const closure = out && out.closure_receipt && out.closure_receipt.closure;
      assert(Array.isArray(closure && closure.closed) && closure.closed.length === 0,
        '#508: closure.closed must be [] on merge lane, got ' + JSON.stringify(closure && closure.closed));
    }

    // #497 invariant: zero `issue close` calls (no pre-sink remote close)
    const calls = readLog(logFile);
    const closeCalls = calls.filter(c => c.startsWith('issue-close:'));
    assert(closeCalls.length === 0,
      '#508 #497-invariant: zero gh issue-close calls on --keep-worktree merge lane, got ' + JSON.stringify(closeCalls));

  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// ---------------------------------------------------------------------------
// Test (#992/#993/#994): the CLOSURE DELTA — what this run took off the backlog and what it put
// back on. The archived `## Closure` block records five terminal facts and none of them is a
// quantity, so the one question a successor asks of a finished run — did the backlog get smaller
// or larger — is answerable only by re-reading the forge. Four fields answer it in the record:
// `issues_closed`, `follow_ups_filed`, `follow_up_numbers`, `net_backlog_delta`.
//
// WHY THE BUNDLE LANE IS WHERE `issues_closed` IS PINNED. On the shipped merge lane cmdFinalize
// closes ZERO issues — `mergeLaneDeferred` defaults true and the real `gh issue close` calls happen
// later, in sink-merge.js, after `appendClosureBlock` has already written a heading-guarded block
// the sink can never revise (this is exactly what the neighbouring #508 test measures: `closure.closed
// === []` and zero close calls). So `issues_closed` is NOT a count of closes this process made; it is
// the size of the set this run's closure decision is closing — `closure.attempted`, the claimed set.
// A four-member bundle makes that distinguishable from every plausible near-miss: an implementation
// stamping `closed.length` would say 0 here, and one stamping 1 would be reading the scalar
// `issue_number` instead of the member array.
//
// WHY THE THREE LEGS. `net_backlog_delta = follow_ups_filed - issues_closed`, rendered with an
// explicit sign when non-zero. Three renderings exist and each leg produces exactly one of them
// against the SAME four-member claimed set, so the delta cannot be right by coincidence:
//   4 filed  ->  `0`    (the issue's own worked example: a run that replaced what it closed)
//  14 filed  -> `+10`   (its second: a run that found ten more problems than it fixed)
//   0 filed  ->  `-4`   (and the measured-zero half: parsed, empty, NOT unmeasurable)
//
// The `noise:` row in leg A is load-bearing. The `## Run gaps` grammar carries two kinds of entry
// and only one of them is a FILING; an implementation counting rows rather than `filed:` refs reads
// 5 here and gets both the count and the delta wrong.
//
// ZERO NEW FORGE CALLS. The gap section is on disk, in the run's own finalization-summary.md, and
// resolving it must cost nothing on the wire. The mock logs every invocation; the three legs claim
// identical members under an identical project name in three separate roots, so their call logs must
// come out BYTE-IDENTICAL however many follow-ups the summary names.
// ---------------------------------------------------------------------------

// The `## Closure` block of an ARCHIVED state, as a field map. That copy is the only one: the block
// is appended after archiveProjectDir has already renamed the live folder away.
function closureBlockFields(dest) {
  let s = '';
  try { s = fs.readFileSync(path.join(dest, 'workflow-state.md'), 'utf8'); } catch (_) { return null; }
  const m = s.match(/^## Closure$/m);
  if (!m) return null;
  const rest = s.slice(m.index + m[0].length);
  const end = rest.indexOf('\n## ');
  const fields = {};
  for (const line of (end < 0 ? rest : rest.slice(0, end)).split('\n')) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (kv) fields[kv[1]] = kv[2].trim();
  }
  return fields;
}

// A gh mock that logs EVERY invocation twice: `calls.log` gets the verb + subject (argv[0..2]),
// `full.log` gets the whole argv line. The first is what the byte-identity comparison across legs
// reads; the second is what proves no call anywhere NAMED a follow-up issue number.
function writeLoggingGhMock(binDir, callsLog, fullLog) {
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, 'gh.js'), [
    "'use strict';",
    'const fs = require("fs");',
    'const argv = process.argv.slice(2);',
    'const a = argv.join(" ");',
    'try { fs.appendFileSync(' + JSON.stringify(callsLog) + ', argv.slice(0, 3).join(" ") + "\\n"); } catch (_) {}',
    'try { fs.appendFileSync(' + JSON.stringify(fullLog) + ', a + "\\n"); } catch (_) {}',
    'if (a.includes("repo view")) {',
    '  process.stdout.write(JSON.stringify({owner:{login:"test"},name:"repo"}) + "\\n");',
    '  process.exit(0);',
    '}',
    'const closeM = a.match(/^issue close (\\d+)/);',
    'if (closeM) { process.stdout.write("\\n"); process.exit(0); }',
    'const viewM = a.match(/issue view (\\d+)/);',
    'if (viewM) {',
    '  process.stdout.write(JSON.stringify({number:parseInt(viewM[1]),state:"open",title:"issue "+viewM[1],body:"",labels:[]}) + "\\n");',
    '  process.exit(0);',
    '}',
    'if (a.includes("api") && a.includes("comments")) { process.stdout.write("[]\\n"); process.exit(0); }',
    'if (a.includes("api")) { process.exit(0); }',
    'process.stdout.write("\\n");',
    'process.exit(0);',
  ].join('\n'));
}

// One leg: a four-member bundle finalized on the merge lane over a summary whose `## Run gaps`
// section carries `gapRows`. Returns the archived block's fields plus both call logs.
function runClosureDeltaLeg(gapRows) {
  const project = 'bundle-9201-9204';
  const members = [9201, 9202, 9203, 9204];
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  const callsLog = path.join(tmpRoot, 'gh-calls.log');
  const fullLog = path.join(tmpRoot, 'gh-full.log');
  try {
    initGitRepo(tmpRoot);
    writeBundleStateFile(tmpRoot, project, members[0], members);
    // The run's own summary, written by the orchestrator at Step 6 and archived with the folder.
    // `## Run gaps` rows are in the scanner's STRICT grammar — the same one parseGapSection owns —
    // because a free-text bullet is dropped by design and would make this fixture measure nothing.
    fs.writeFileSync(
      path.join(tmpRoot, 'kaola-workflow', project, 'finalization-summary.md'),
      ['# Finalization Summary', '', '## Run gaps', ''].concat(gapRows).join('\n') + '\n');
    writeLoggingGhMock(binDir, callsLog, fullLog);
    seedAdaptiveFinalizeFixture(tmpRoot, project);

    const result = runFinalize(['finalize', '--project', project, '--keep-worktree'], tmpRoot, binDir);
    const out = parseOutput(result);
    return {
      project, members, status: result.status, out,
      fields: out && out.dest ? closureBlockFields(out.dest) : null,
      calls: readLog(callsLog),
      full: readLog(fullLog),
      stderr: result.stderr,
    };
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

(function testClosureBlockRecordsBacklogDelta() {
  console.log('Test (#992/#993/#994): the archived ## Closure block records the run\'s backlog delta');

  // Leg A — four filings and one noise row against four claimed issues: the delta is 0.
  const legA = runClosureDeltaLeg([
    '- manual:flaky-probe (a transient probe timeout): filed: #7001',
    '- manual:slow-suite (the suite ran 12m over budget): filed: #7002',
    '- deferred_red_chain (codex:99): noise: a one-off, not worth an issue',
    '- manual:doc-drift (the docs lagged the code): filed: #7003',
    '- manual:missing-pin (the guard had no mutation proof): filed: #7004',
  ]);
  // Leg B — fourteen filings against the same four: the delta is +10, the issue's worked example.
  const legB = runClosureDeltaLeg(Array.from({ length: 14 }, (_, i) =>
    '- manual:gap-' + (i + 1) + ' (observation ' + (i + 1) + '): filed: #' + (7101 + i)));
  // Leg C — a `## Run gaps` section that is PRESENT and EMPTY: nothing was filed, and that is a
  // MEASUREMENT. The delta is -4. Its twin (a section that is absent, which is not a measurement at
  // all) is in scripts/test-finalize-door.js, where the two `unknown` legs live.
  const legC = runClosureDeltaLeg([]);

  for (const [label, leg] of [['A (4 filed)', legA], ['B (14 filed)', legB], ['C (0 filed)', legC]]) {
    assert(leg.status === 0,
      '#992 ' + label + ': merge-lane bundle finalize must exit 0; got ' + leg.status
      + '\nstderr: ' + String(leg.stderr || '').slice(0, 400));
    assert(leg.fields !== null,
      '#992 ' + label + ': the archived state must carry a parseable ## Closure block; dest='
      + JSON.stringify(leg.out && leg.out.dest));
  }

  // ---- Coverage 1: the claimed-set size, on the lane that closes nothing ----
  for (const [label, leg] of [['A', legA], ['B', legB], ['C', legC]]) {
    const f = leg.fields || {};
    assert(f.issue_disposition === 'close-pending',
      '#992 ' + label + ': the merge lane is honestly close-pending — this is the premise the '
      + '`issues_closed` reading rests on, and if it moved, the count below is measuring a '
      + 'different lane; got ' + JSON.stringify(f.issue_disposition));
    assert(f.issues_closed === '4',
      '#992 ' + label + ': `issues_closed` is the size of the set this run\'s closure decision is '
      + 'closing — the four claimed members the sink will close after the merge — NOT the number of '
      + '`gh issue close` calls this process made, which is zero on this lane by design (#508). A `0` '
      + 'here is `closure.closed.length`; a `1` is the scalar `issue_number` instead of the member '
      + 'array; got ' + JSON.stringify(f.issues_closed) + ' with closure='
      + JSON.stringify(leg.out && leg.out.closure_receipt && leg.out.closure_receipt.closure));
  }

  // ---- Coverage 3: filings, their numbers, and the signed delta ----
  const fA = legA.fields || {};
  assert(fA.follow_ups_filed === '4',
    '#992 A: `follow_ups_filed` counts the `filed:` refs in `## Run gaps`, and that section carries '
    + 'FIVE rows of which one is `noise:` — a noise row is an observation the run decided not to '
    + 'file, so counting rows rather than filings reads 5; got ' + JSON.stringify(fA.follow_ups_filed));
  assert(fA.follow_up_numbers === '7001,7002,7003,7004',
    '#992 A: `follow_up_numbers` lists the filed issue numbers in the order the section names them, '
    + 'comma-separated with no spaces — and the `noise:` row contributes none, because it has no '
    + 'number to contribute; got ' + JSON.stringify(fA.follow_up_numbers));
  assert(fA.net_backlog_delta === '0',
    '#992 A: four closed and four filed is a net-zero run, and zero renders bare — the sign is '
    + 'explicit only when there is a direction to state; got ' + JSON.stringify(fA.net_backlog_delta));

  const fB = legB.fields || {};
  assert(fB.follow_ups_filed === '14',
    '#992 B: fourteen `filed:` rows is fourteen filings; got ' + JSON.stringify(fB.follow_ups_filed));
  assert(fB.follow_up_numbers === '7101,7102,7103,7104,7105,7106,7107,7108,7109,7110,7111,7112,7113,7114',
    '#992 B: every filed number is listed, in section order; got ' + JSON.stringify(fB.follow_up_numbers));
  assert(fB.net_backlog_delta === '+10',
    '#992 B: fourteen filed against four closed GREW the backlog by ten, and a growth reported as '
    + '`10` reads as a magnitude with no direction — the leading `+` is what makes the sign of the '
    + 'delta legible without arithmetic; got ' + JSON.stringify(fB.net_backlog_delta));

  const fC = legC.fields || {};
  assert(fC.follow_ups_filed === '0',
    '#992 C: a `## Run gaps` section that is PRESENT and carries no filing is a measured zero, and '
    + 'it must read as one; got ' + JSON.stringify(fC.follow_ups_filed));
  assert(fC.follow_up_numbers === 'none',
    '#992 C: with nothing filed the number list is `none` — an empty value would be '
    + 'indistinguishable from a field that failed to render; got ' + JSON.stringify(fC.follow_up_numbers));
  assert(fC.net_backlog_delta === '-4',
    '#992 C: four closed and nothing filed SHRANK the backlog by four; got '
    + JSON.stringify(fC.net_backlog_delta));

  // ---- Coverage 5: zero new forge calls ----
  //
  // These three are CONTROLS, not red-first pins: before the fields exist there is no new call to
  // make, so they pass on the baseline and can only ever fire against an implementation that
  // resolved the gap section over the wire instead of off the disk it is already sitting on.
  for (const [label, leg] of [['A', legA], ['B', legB], ['C', legC]]) {
    // NON-VACUITY. Every assertion below is over the call log, and two empty logs are byte-identical
    // and name no follow-up either — a mock that was never reached would satisfy all of them while
    // watching nothing.
    assert(leg.calls.length >= 4,
      '#992 ' + label + ': the gh mock must actually have been reached, or the forge-traffic '
      + 'assertions below are true of nothing; got ' + JSON.stringify(leg.calls));
    const closeCalls = leg.calls.filter(c => c.startsWith('issue close'));
    assert(closeCalls.length === 0,
      '#992 ' + label + ' (#497 invariant): zero `gh issue close` calls on the merge lane — the '
      + 'closure delta is a REPORT about the claimed set, never an instruction to close it early; '
      + 'got ' + JSON.stringify(closeCalls));
    const followUpNumbers = leg.full.join('\n').match(/\b7(0|1)\d\d\b/g) || [];
    assert(followUpNumbers.length === 0,
      '#992 ' + label + ': no forge call may NAME a follow-up issue number — the numbers are in the '
      + 'run\'s own finalization-summary.md, and a filing this run already made needs no probe to '
      + 'confirm it exists; got ' + JSON.stringify(followUpNumbers.slice(0, 8)));
  }
  assert(legA.calls.join('\n') === legC.calls.join('\n'),
    '#992: legs A and C claim the SAME four members under the SAME project name and differ only in '
    + 'how many follow-ups their summary names, so their forge traffic must be identical. A '
    + 'difference here is the new fields buying their answer on the wire. A=\n'
    + legA.calls.join('\n') + '\nC=\n' + legC.calls.join('\n'));
  assert(legB.calls.join('\n') === legC.calls.join('\n'),
    '#992: and fourteen filings cost no more forge traffic than zero. B=\n'
    + legB.calls.join('\n') + '\nC=\n' + legC.calls.join('\n'));
})();

// ---------------------------------------------------------------------------
// Test (#592): `--sink --issue-numbers A,B` (no `--issue`) must actually run the
// closure loop — not skip it. Pre-fix, the closure step's gate was
// `!OFFLINE && args.issue != null`; with only `--issue-numbers` (no `--issue`), the
// gate is false, the entire close loop is skipped, yet execution falls through to
// stepDone('closure') unconditionally — the receipt reports closure:done having
// closed zero issues, and status:sinked, while both issues remain open on the forge.
// Drives the real `--sink` transaction end to end (kaola-workflow-sink-merge.js) with
// a bare remote — the exact shape reported live on bundle-587-589.
// ---------------------------------------------------------------------------

(function testSinkIssueNumbersOnlyRunsClosureLoop() {
  console.log('Test (#592): --sink --issue-numbers A,B (no --issue) must close every member, not skip closure');
  const tmpRoot = makeTmpRoot();
  // The gh mock lives OUTSIDE the repo root — a mock file inside the repo would be
  // classified as foreign-dirt by the sink preflight and refuse before closure ever runs.
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink592-mock-'));
  const logFile = path.join(binDir, 'gh-calls.log');
  const project = 'bundle-9601-9602';
  const branch = 'workflow/' + project;
  let remotePath = null;
  try {
    remotePath = initGitRepoWithBareRemote(tmpRoot);

    // A dedicated gh mock (mirrors simulate-workflow-walkthrough.js's #497-close style):
    // both issues start OPEN, `issue close N` is logged so the test can assert it was
    // actually ATTEMPTED (the pre-fix bug never calls it at all).
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(path.join(binDir, 'gh.js'), [
      "'use strict';",
      'const fs = require("fs");',
      'const argv = process.argv.slice(2);',
      'const a = argv.join(" ");',
      'const logFile = ' + JSON.stringify(logFile) + ';',
      'function log(msg) { try { fs.appendFileSync(logFile, msg + "\\n"); } catch(_) {} }',
      'if (a.includes("repo view")) {',
      '  process.stdout.write(JSON.stringify({owner:{login:"test"},name:"repo"}) + "\\n");',
      '  process.exit(0);',
      '}',
      // #619(2): the sink now probes `issue view --jq .state` on the CLOSE SUCCESS path too (not
      // just in the catch branch), so this mock must be STATEFUL — open until a matching `issue
      // close N` has actually been logged, then closed (mirrors real gh --jq output: a bare state
      // string, not a JSON blob). A constant 'open' would make the new post-close probe wrongly
      // bucket every real close as failed.
      'const viewM = a.match(/issue view (\\d+)/);',
      'if (viewM) {',
      '  const n = viewM[1];',
      '  let alreadyClosed = false;',
      '  try { alreadyClosed = fs.readFileSync(logFile, "utf8").split("\\n").includes("close:" + n); } catch (_) {}',
      '  process.stdout.write((alreadyClosed ? "closed" : "open") + "\\n");',
      '  process.exit(0);',
      '}',
      '// issue close N --comment ... -> succeeds, logged as close:N',
      'const closeM = a.match(/^issue close (\\d+)/);',
      'if (closeM) {',
      '  log("close:" + closeM[1]);',
      '  process.stdout.write("\\n");',
      '  process.exit(0);',
      '}',
      '// issue edit N --remove-label -> logged as label-removed:N',
      'if (a.includes("issue edit") && a.includes("--remove-label")) {',
      '  const em = a.match(/issue edit (\\d+)/);',
      '  log("label-removed:" + (em ? em[1] : "?"));',
      '  process.exit(0);',
      '}',
      'process.stdout.write("\\n");',
      'process.exit(0);',
    ].join('\n'));

    // Feature branch carrying a deliverable — pushed upstream, mirrors the real sink shape.
    G.checkout(tmpRoot, branch, { create: true });
    G.git(tmpRoot, ['push', '-u', 'origin', branch]);
    fs.writeFileSync(path.join(tmpRoot, 'DELIVERABLE.txt'), 'deliverable\n');
    G.commitPaths(tmpRoot, 'DELIVERABLE.txt', 'feat: deliverable');
    G.git(tmpRoot, ['push', 'origin', branch]);
    G.checkout(tmpRoot, 'main');

    // The bundle sink shape from the issue: --issue-numbers only, NO --issue.
    const result = spawnSync(process.execPath, [
      sinkMergeScript, '--branch', branch, '--project', project,
      '--issue-numbers', '9601,9602', '--sink', '--json',
    ], {
      cwd: tmpRoot,
      encoding: 'utf8',
      timeout: 60000,
      env: Object.assign({}, process.env, {
        KAOLA_WORKFLOW_OFFLINE: '0',
        KAOLA_GH_MOCK_SCRIPT: path.join(binDir, 'gh.js'),
      }),
    });
    const out = parseOutput(result);

    assert(result.status === 0, '#592: --issue-numbers-only sink should exit 0 once closure genuinely runs and succeeds; got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);

    // THE BUG: pre-fix, the close loop is gated on args.issue != null, so with only
    // --issue-numbers neither issue's `gh issue close` is ever invoked.
    const calls = readLog(logFile);
    const closeCalls = calls.filter(c => c.startsWith('close:'));
    assert(closeCalls.includes('close:9601'), '#592: issue 9601 close must be ATTEMPTED (bug: closure loop is skipped entirely when --issue is absent); calls=' + JSON.stringify(calls));
    assert(closeCalls.includes('close:9602'), '#592: issue 9602 close must be ATTEMPTED; calls=' + JSON.stringify(calls));

    // The receipt must record the actually-closed set (not report closure:done having
    // closed zero issues) so a resume can verify rather than skip.
    assert(out !== null, '#592: sink transaction emits JSON');
    const receipt = out && out.receipt;
    assert(receipt != null, '#592: output has an embedded receipt');
    if (receipt) {
      assert(receipt.steps && receipt.steps.closure === 'done', '#592: closure step reports done once it genuinely ran; got ' + JSON.stringify(receipt.steps));
      assert(Array.isArray(receipt.closed_issues) && receipt.closed_issues.length === 2,
        '#592: receipt.closed_issues must record both actually-closed members, got ' + JSON.stringify(receipt.closed_issues));
      if (Array.isArray(receipt.closed_issues)) {
        assert(receipt.closed_issues.includes(9601) && receipt.closed_issues.includes(9602),
          '#592: receipt.closed_issues must include 9601 and 9602, got ' + JSON.stringify(receipt.closed_issues));
      }
    }
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.rmSync(binDir, { recursive: true, force: true });
    if (remotePath) fs.rmSync(remotePath, { recursive: true, force: true });
  }
})();

// ---------------------------------------------------------------------------
// Issue #617 — a GitHub issue could be closed by cmdFinalize even though the merge sink (push to
// main) never actually ran; the recorded implementation commit never became an ancestor of main.
// ---------------------------------------------------------------------------

// (A) cmdFinalize's issue-close guard must derive merge-lane deferral from durable state (the
// `sink:` field), not solely from the caller remembering --keep-worktree.
(function testMergeLaneFinalizeDefersActualClose() {
  console.log('Test (#617 A): merge-lane finalize (sink:merge, no --keep-worktree) must NOT close an open issue online — defers to the merge sink');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  const logFile = path.join(tmpRoot, 'gh-calls.log');
  const project = 'issue-61701';
  try {
    initGitRepo(tmpRoot);
    writeSingleStateFile(tmpRoot, project, 61701);
    writeRoadmapFile(tmpRoot, 61701);
    writeRoadmapMirror(tmpRoot, [61701]);
    // Issue starts OPEN (never pre-closed) — a genuine close attempt is the observable bug.
    writeGhMockScript(binDir, { logFile });
    seedAdaptiveFinalizeFixture(tmpRoot, project);

    const result = runFinalize(['finalize', '--project', project], tmpRoot, binDir);
    const out = parseOutput(result);

    assert(result.status === 0, '#617 A: finalize exits 0; got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out !== null, '#617 A: finalize emits JSON');

    const calls = readLog(logFile);
    assert(!calls.some(c => c.startsWith('close:')),
      '#617 A: merge-lane finalize (no --keep-worktree) must NOT call `gh issue close` before the merge sink runs; calls=' + JSON.stringify(calls));

    const receipt = out && out.closure_receipt;
    assert(receipt != null, '#617 A: closure_receipt present');
    assert(receipt && receipt.remote_issue_closed === 'close_pending',
      '#617 A: receipt.remote_issue_closed must be close_pending (deferred to the merge sink), got ' + JSON.stringify(receipt && receipt.remote_issue_closed));
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// (B) the --sink transaction: closure must run AFTER push_main, never before. Proven with the
// existing KAOLA_WORKFLOW_FORCE_PUSH_MAIN_FAIL test hook — if closure ran before push_main (the
// pre-fix SINK_STEPS order), a forced push_main failure would still have already closed the issue.
(function testSinkTransactionClosureNeverBeforePushMain() {
  console.log('Test (#617 B): --sink transaction — closure must run AFTER push_main; a forced push_main failure must NOT have already closed the issue');
  const tmpRoot = makeTmpRoot();
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink617-mock-'));
  const logFile = path.join(binDir, 'gh-calls.log');
  const project = 'issue-61702';
  const branch = 'workflow/' + project;
  let remotePath = null;
  try {
    remotePath = initGitRepoWithBareRemote(tmpRoot);

    fs.writeFileSync(path.join(binDir, 'gh.js'), [
      "'use strict';",
      'const fs = require("fs");',
      'const argv = process.argv.slice(2);',
      'const a = argv.join(" ");',
      'const logFile = ' + JSON.stringify(logFile) + ';',
      'function log(msg) { try { fs.appendFileSync(logFile, msg + "\\n"); } catch(_) {} }',
      'if (a.includes("repo view")) {',
      '  process.stdout.write(JSON.stringify({owner:{login:"test"},name:"repo"}) + "\\n");',
      '  process.exit(0);',
      '}',
      // #619(2): stateful — open until a matching `issue close N` has been logged (mirrors real
      // gh --jq bare-state output). Unreached in this test (FORCE_PUSH_MAIN_FAIL fails before
      // closure ever runs) but kept consistent with the #592 mock above for defensive correctness.
      'const viewM = a.match(/issue view (\\d+)/);',
      'if (viewM) {',
      '  const n = viewM[1];',
      '  let alreadyClosed = false;',
      '  try { alreadyClosed = fs.readFileSync(logFile, "utf8").split("\\n").includes("close:" + n); } catch (_) {}',
      '  process.stdout.write((alreadyClosed ? "closed" : "open") + "\\n");',
      '  process.exit(0);',
      '}',
      '// issue close N -> logged as close:N',
      'const closeM = a.match(/^issue close (\\d+)/);',
      'if (closeM) {',
      '  log("close:" + closeM[1]);',
      '  process.stdout.write("\\n");',
      '  process.exit(0);',
      '}',
      '// issue edit N --remove-label -> logged as label-removed:N',
      'if (a.includes("issue edit") && a.includes("--remove-label")) {',
      '  const em = a.match(/issue edit (\\d+)/);',
      '  log("label-removed:" + (em ? em[1] : "?"));',
      '  process.exit(0);',
      '}',
      'process.stdout.write("\\n");',
      'process.exit(0);',
    ].join('\n'));

    // Feature branch carrying a deliverable — pushed upstream, mirrors the real sink shape.
    G.checkout(tmpRoot, branch, { create: true });
    G.git(tmpRoot, ['push', '-u', 'origin', branch]);
    fs.writeFileSync(path.join(tmpRoot, 'DELIVERABLE.txt'), 'deliverable\n');
    G.commitPaths(tmpRoot, 'DELIVERABLE.txt', 'feat: deliverable');
    G.git(tmpRoot, ['push', 'origin', branch]);
    G.checkout(tmpRoot, 'main');

    const result = spawnSync(process.execPath, [
      sinkMergeScript, '--branch', branch, '--project', project, '--issue', '61702', '--sink', '--json',
    ], {
      cwd: tmpRoot,
      encoding: 'utf8',
      timeout: 60000,
      env: Object.assign({}, process.env, {
        KAOLA_WORKFLOW_OFFLINE: '0',
        KAOLA_GH_MOCK_SCRIPT: path.join(binDir, 'gh.js'),
        KAOLA_WORKFLOW_FORCE_PUSH_MAIN_FAIL: '1',
      }),
    });
    const out = parseOutput(result);

    assert(result.status !== 0, '#617 B: forced push_main failure must exit non-zero; got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out && out.result === 'refuse' && out.reason === 'sink_incomplete' && out.step === 'push_main',
      '#617 B: refusal reason must be sink_incomplete at step push_main, got ' + JSON.stringify(out));

    const calls = readLog(logFile);
    assert(!calls.some(c => c.startsWith('close:')),
      '#617 B: closure must NEVER run before push_main succeeds — the issue must not be closed when push_main fails; calls=' + JSON.stringify(calls));
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.rmSync(binDir, { recursive: true, force: true });
    if (remotePath) fs.rmSync(remotePath, { recursive: true, force: true });
  }
})();

// (C) checkClosureInvariants — the remote-closed-after-publish invariant (declared in
// kaola-workflow-closure-contract.js, previously never evaluated) must fire when the recorded
// implementation commit is NOT an ancestor of the sink target, and clear once it actually is.
(function testRemoteClosedAfterPublishInvariant() {
  console.log('Test (#617 C): checkClosureInvariants — remote-closed-after-publish fires when the impl commit is not an ancestor of the sink target, clears once merged');
  const tmpRoot = makeTmpRoot();
  try {
    initGitRepo(tmpRoot);
    G.checkout(tmpRoot, 'workflow/issue-61703', { create: true });
    fs.writeFileSync(path.join(tmpRoot, 'feature.txt'), 'feature\n');
    G.commitPaths(tmpRoot, 'feature.txt', 'feat: unmerged');
    const implSha = G.head(tmpRoot);
    G.checkout(tmpRoot, 'main');

    const archiveDest = path.join(tmpRoot, 'kaola-workflow', 'archive', 'issue-61703');
    fs.mkdirSync(archiveDest, { recursive: true });
    fs.writeFileSync(path.join(archiveDest, 'workflow-state.md'),
      '# Kaola-Workflow State\nname: issue-61703\nstatus: closed\nstep: complete\n');

    const receipt = {
      project: 'issue-61703', issue_number: 61703,
      archive: 'closed', roadmap_source_removed: 'absent', roadmap_regenerated: 'skipped',
      remote_issue_closed: 'closed', claim_label_removed: 'removed',
      worktree_removed: 'missing', branch_removed: 'kept',
      claim_planner_attested: 'missing', warnings: []
    };

    // Not yet merged — the invariant must fire.
    const bad = checkClosureInvariants(tmpRoot, receipt, archiveDest, { implRef: implSha, sinkTarget: 'main' });
    assert(bad.ok === false, '#617 C: closure invariants must fail when the impl commit is not an ancestor of the sink target; got ' + JSON.stringify(bad.violations));
    assert(bad.violations.some(v => v.id === 'remote-closed-after-publish'),
      '#617 C: remote-closed-after-publish violation must fire, got ' + JSON.stringify(bad.violations));
    assert(receipt.remote_closed_after_publish === 'failed',
      '#617 C: receipt.remote_closed_after_publish must be failed, got ' + receipt.remote_closed_after_publish);

    // Merge it — the SAME check must now pass.
    G.git(tmpRoot, ['merge', '--no-ff', 'workflow/issue-61703', '-m', 'merge']);
    const receipt2 = Object.assign({}, receipt, { remote_closed_after_publish: undefined });
    const good = checkClosureInvariants(tmpRoot, receipt2, archiveDest, { implRef: implSha, sinkTarget: 'main' });
    assert(!good.violations.some(v => v.id === 'remote-closed-after-publish'),
      '#617 C: after the real merge, remote-closed-after-publish must NOT fire, got ' + JSON.stringify(good.violations));
    assert(receipt2.remote_closed_after_publish === 'verified',
      '#617 C: receipt.remote_closed_after_publish must be verified once actually merged, got ' + receipt2.remote_closed_after_publish);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// (D) the standalone `verify-sink` subcommand — an audit an operator can run independently —
// must detect an orphaned close: an archived (closed) project whose recorded branch was never
// actually merged into the sink target.
(function testVerifySinkDetectsOrphanedClose() {
  console.log('Test (#617 D): verify-sink subcommand detects an orphaned close (archived project, commit not an ancestor of the sink target)');
  const tmpRoot = makeTmpRoot();
  try {
    initGitRepo(tmpRoot);
    const project = 'issue-61704';
    // Unmerged feature branch — mirrors the incident: the implementation only ever landed on
    // the stale branch, never merged into main.
    G.checkout(tmpRoot, 'workflow/' + project, { create: true });
    fs.writeFileSync(path.join(tmpRoot, 'impl.txt'), 'implementation\n');
    G.commitPaths(tmpRoot, 'impl.txt', 'feat: unmerged implementation');
    G.checkout(tmpRoot, 'main');

    // Archived + closed — active folder gone, archive present — but the branch was NEVER merged.
    const archiveDir = path.join(tmpRoot, 'kaola-workflow', 'archive', project);
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, 'workflow-state.md'), [
      '# Kaola-Workflow State',
      'name: ' + project, 'status: closed', 'step: complete',
      '## Sink', 'branch: workflow/' + project, 'issue_number: 61704', 'sink: merge'
    ].join('\n') + '\n');

    const result = spawnSync(process.execPath, [claimScript, 'verify-sink', '--project', project], {
      cwd: tmpRoot, encoding: 'utf8', timeout: 30000,
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }),
    });
    const out = parseOutput(result);

    assert(result.status !== 0, '#617 D: verify-sink must exit non-zero for an orphaned close, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out !== null, '#617 D: verify-sink emits JSON');
    assert(out && out.ok === false, '#617 D: ok must be false, got ' + JSON.stringify(out));
    assert(out && Array.isArray(out.reasons) && out.reasons.includes('impl_commit_not_ancestor'),
      '#617 D: reasons must include impl_commit_not_ancestor, got ' + JSON.stringify(out && out.reasons));
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// ---------------------------------------------------------------------------
// #699: linked-worktree archive verification is recursive for epoch snapshots,
// including non-Markdown proof files. A dropped or tampered descendant must
// refuse before either live copy is removed.
// ---------------------------------------------------------------------------
(function testRecursiveEpochArchiveCompleteness() {
  console.log('Test (#699): verifyArchiveComplete recursively preserves epoch snapshots');
  const src = makeTmpRoot();
  const dest = makeTmpRoot();
  try {
    fs.writeFileSync(path.join(src, 'workflow-state.md'), 'status: closed\n');
    fs.mkdirSync(path.join(src, '.cache', 'epochs', '1', 'files', '.cache'), { recursive: true });
    fs.writeFileSync(path.join(src, '.cache', 'epochs', '1', 'manifest.json'), '{"manifest_self_digest":"fixture"}\n');
    fs.writeFileSync(path.join(src, '.cache', 'epochs', '1', 'files', '.cache', 'receipt.bin'), Buffer.from([0, 1, 2, 3]));
    fs.mkdirSync(path.join(dest, '.cache', 'epochs', '1', 'files', '.cache'), { recursive: true });
    fs.writeFileSync(path.join(dest, 'workflow-state.md'), 'status: closed\n');
    fs.writeFileSync(path.join(dest, '.cache', 'epochs', '1', 'manifest.json'), '{"manifest_self_digest":"fixture"}\n');
    let checked = verifyArchiveComplete(src, dest);
    assert(checked.ok === false && checked.missing.some(p => p.endsWith('receipt.bin')),
      '#699: a missing non-md epoch receipt makes archive completeness fail, got ' + JSON.stringify(checked));
    fs.writeFileSync(path.join(dest, '.cache', 'epochs', '1', 'files', '.cache', 'receipt.bin'), Buffer.from([9, 9, 9, 9]));
    checked = verifyArchiveComplete(src, dest);
    assert(checked.ok === false && Array.isArray(checked.mismatched) && checked.mismatched.some(p => p.endsWith('receipt.bin')),
      '#699: a digest-mismatched epoch receipt makes archive completeness fail, got ' + JSON.stringify(checked));
    fs.copyFileSync(path.join(src, '.cache', 'epochs', '1', 'files', '.cache', 'receipt.bin'), path.join(dest, '.cache', 'epochs', '1', 'files', '.cache', 'receipt.bin'));
    checked = verifyArchiveComplete(src, dest);
    assert(checked.ok === true, '#699: byte-identical recursive epoch archive verifies, got ' + JSON.stringify(checked));
  } finally {
    fs.rmSync(src, { recursive: true, force: true });
    fs.rmSync(dest, { recursive: true, force: true });
  }
})();

// #699: every archive caller shares one fail-closed success predicate. Only a
// completed archive or the idempotent source-missing retry is success; every
// partial, malformed, or absent result is a refusal.
(function testArchiveSuccessPredicate699() {
  assert(typeof archiveSucceeded === 'function', '#699: closure contract exports archiveSucceeded');
  if (typeof archiveSucceeded !== 'function') return;
  assert(archiveSucceeded({ archived: true }) === true, '#699: archived:true is archive success');
  assert(archiveSucceeded({ skipped: 'source-missing' }) === true, '#699: source-missing retry is archive success');
  for (const result of [null, undefined, {}, { archived: false }, { archive_incomplete: true },
    { snapshot_error: 'invalid' }, { skipped: 'other' }]) {
    assert(archiveSucceeded(result) === false,
      '#699: malformed/refused archive result fails closed: ' + JSON.stringify(result));
  }
})();

// #699: a plan-absent claim record is positive authority, not a missing-plan error.
// Archive it directly and prove the live folder is removed only after the shared
// verifier accepts the complete shape.
(function testCanonicalPlanlessArchive699() {
  const root = makeTmpRoot();
  const project = 'issue-69901';
  const projectDir = path.join(root, 'kaola-workflow', project);
  try {
    initGitRepo(root);
    const anchors = buildClaimAnchors(root, {
      issue_number: 69901,
      branch: 'workflow/' + project,
      claim_ts: '2026-01-01T00:00:00Z',
      session_marker: 'bundle-finalize-699',
    });
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'workflow-state.md'), [
      '# Kaola-Workflow State', '', '## Project', 'name: ' + project,
      'status: active', '',
      '## Claim Identity',
      'claim_repository_id: ' + anchors.claim_repository_id,
      'claim_identity_digest: ' + anchors.claim_identity_digest, '',
      '## Sink', 'issue_number: 69901', 'branch: workflow/' + project, 'sink: merge',
      'main_root: ' + root, 'session_marker: bundle-finalize-699',
      'claim_ts: 2026-01-01T00:00:00Z', '',
    ].join('\n'));
    const result = archiveProjectDir(root, project, 'abandoned', '.planless');
    assert(result && result.archived === true && result.dest
      && !fs.existsSync(projectDir) && fs.existsSync(result.dest),
    '#699 a plan-absent claim record archives successfully, got ' + JSON.stringify(result));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
})();

// ---------------------------------------------------------------------------
// (#937) cmdFinalize and the slug that only LOOKED right
//
// `clearAdvisoryClaim` composes the marker comment it deletes by EXACT, case-sensitive substring
// from the project name it is handed: `'<!-- kw:claim project=' + project + ' -->'`. cmdFinalize
// hands it `args.project` — the OPERATOR's spelling — from both arms: once per member in the bundle
// loop, and once on the single-issue path. The marker on the forge carries the name the run was
// CLAIMED with, which is the name of the folder on disk.
//
// On a case-insensitive filesystem those can differ with nothing local to notice.
// `finalize --project Issue-N` finds `kaola-workflow/issue-N` exactly as the lowercase spelling
// would, so the whole finalize succeeds: exit 0, `status: closed`, `claim_label_removed: removed`,
// `closure_invariants.ok: true` — and the comment LIST goes out, matches nothing, and every member
// keeps its claim. The label is removed by ISSUE NUMBER and so is unaffected, which is what makes
// the receipt read healthy.
//
// The owner ruled RESOLVE AND REPORT: resolve the supplied name to the on-disk folder once, early,
// and state the correction in the run's own output. Refusing was declined.
// ---------------------------------------------------------------------------

// The operator's spelling — one byte from the on-disk name, which is the difference a
// case-insensitive filesystem cannot see and an exact substring match cannot miss.
function misCaseSlug(project) { return project.replace(/^issue-/, 'Issue-'); }

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
// A marker comment as the claim path actually posts it — postAdvisoryClaim writes the HTML comment
// followed by prose on the next line — so a deleter matching the exact literal is matching what
// ships rather than a shape this file invented.
function markerComment(id, project) {
  return {
    id,
    body: claimMarker(project) + '\nKaola-Workflow started local work for `' + project + '`.',
    updated_at: new Date().toISOString(),
  };
}

// Did the run TELL the operator that the name it was given is not the folder it used? Every value
// in the envelope is searched for a string naming BOTH spellings. The shape is deliberately left
// open — a note field (what `reserved_project` / `reserved_project_note` do for the same class of
// correction on the claim envelope), a typed finding's detail line, or a receipt field all satisfy
// it. What cannot is silence, or the two spellings appearing in SEPARATE fields, which an archive
// path and a project name do by coincidence rather than by saying anything.
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

// One assertion set over both cmdFinalize arms and both spellings. `supplied` is what goes on the
// command line; `project` is what is on disk and what the marker carries. Equal spellings make this
// the POSITIVE CONTROL — same fixture, same assertions, a slug that needs no resolving. Without it
// "the marker is gone" could be true of a fixture in which nothing is ever deleted.
function assertFinalizeResolvesTheProjectSlug937(label, project, members, supplied) {
  const misCased = supplied !== project;
  const primary = members[0];
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  const logFile = path.join(tmpRoot, 'gh-calls.log');
  try {
    initGitRepo(tmpRoot);
    if (members.length > 1) writeBundleStateFile(tmpRoot, project, primary, members);
    else writeSingleStateFile(tmpRoot, project, primary);
    for (const n of members) writeRoadmapFile(tmpRoot, n);
    writeRoadmapMirror(tmpRoot, members);
    writeGhMockScript(binDir, { logFile, closedIssues: members, commentStore: commentStorePath(binDir) });
    plantIssueComments(binDir, Object.assign(
      {
        [primary]: [
          markerComment(93731, project),
          markerComment(93732, 'issue-OTHER'),
          { id: 93733, body: 'an ordinary human comment mentioning nothing in particular', updated_at: new Date().toISOString() },
        ],
      },
      ...members.slice(1).map((n, i) => ({ [n]: [markerComment(93740 + i, project)] }))
    ));
    // Seed LAST, after every fixture file is in place, so the recorded candidate hash matches the
    // tree finalize recomputes over.
    seedAdaptiveFinalizeFixture(tmpRoot, project);

    const result = runFinalize(['finalize', '--project', supplied], tmpRoot, binDir);
    const out = parseOutput(result);
    const calls = readLog(logFile);

    // FIXTURE PREMISE. A finalize that stopped measures nothing about claim release — and resolving
    // the slug must not turn this run into a refusal, which the owner declined.
    assert(result.status === 0 && out && out.status === 'closed',
      label + ' premise: finalize must complete — a mis-cased --project resolves to the on-disk folder, it does not refuse; got exit=' + result.status +
      ' status=' + JSON.stringify(out && (out.status || out.reason)) + '\nstdout: ' + String(result.stdout || '').slice(-800) +
      '\nstderr: ' + String(result.stderr || '').slice(-800));
    if (!(result.status === 0 && out && out.status === 'closed')) return;
    assert(out.closure_invariants && out.closure_invariants.ok === true,
      label + ' premise: closure_invariants.ok must stay true; got ' + JSON.stringify(out.closure_invariants));

    // The comment list must have gone out at all — otherwise "the marker is still there" would be
    // reporting a deleter that was never reached rather than one that matched nothing.
    assert(calls.some(l => l.startsWith('comments-listed:')),
      label + ': clearAdvisoryClaim must LIST the issue comments; without that call every marker '
      + 'assertion below is about a code path the run never entered. calls=' + JSON.stringify(calls));

    // THE PIN, per member. Stated as the issue's END STATE, so a deleter that composed a marker
    // nothing matches fails exactly as one that never ran.
    for (const n of members) {
      assert(calls.includes('label-removed:' + n),
        label + ': the claim LABEL must be removed from member ' + n + '; calls=' + JSON.stringify(calls));
      assert(!issueCommentBodies(binDir, n).some(b => b.includes(claimMarker(project))),
        label + ': the kw:claim MARKER posted for the on-disk project "' + project + '" must be gone from member ' + n +
        ', and the run was driven with --project "' + supplied + '". The deleter composes its marker from the supplied spelling by exact substring, so a name differing only in CASE matches nothing on the forge and every delete is silently skipped — while the label removal (keyed on the issue NUMBER) still succeeds and the receipt reads healthy. Comments still on #' + n + ': ' +
        JSON.stringify(issueCommentBodies(binDir, n)));
    }

    // Scoping is not widened by the resolution.
    assert(issueCommentBodies(binDir, primary).some(b => b.includes(claimMarker('issue-OTHER'))),
      label + ': a marker belonging to a DIFFERENT project is another run\'s live claim and must NOT be deleted; comments=' +
      JSON.stringify(issueCommentBodies(binDir, primary)));
    assert(issueCommentBodies(binDir, primary).some(b => b.includes('an ordinary human comment')),
      label + ': ordinary comments must be left alone; comments=' + JSON.stringify(issueCommentBodies(binDir, primary)));

    // The archive is named from the same supplied string. Compared case-SENSITIVELY on the basename,
    // because fs.existsSync cannot tell the two apart on this filesystem and git's index can.
    // `startsWith` rather than equality: a collision suffix (`.archived-<ts>`) is legitimate here.
    const destName = String(out.dest || '').split(path.sep).filter(Boolean).pop() || '';
    assert(destName.startsWith(project),
      label + ': the run archive was written under the SUPPLIED spelling "' + destName + '" instead of the on-disk project name "' +
      project + '" — on a case-sensitive index that is a second, differently-named archive directory. dest=' + JSON.stringify(out.dest));

    if (misCased) {
      // REPORTED, not silently corrected: an operator who is not told keeps typing the same name.
      const sentences = slugCorrectionSentences(out, supplied, project);
      assert(sentences.length > 0,
        label + ': the run was given --project "' + supplied + '" and used "' + project + '", and its output says so nowhere. ' +
        'Report the substitution the way the claim envelope reports a reserved project name — one value naming what was supplied and what was used. Envelope: ' +
        JSON.stringify(out));
    }
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

// The mis-cased legs FIRST, so an implementation that resolves nothing fails there rather than
// quietly satisfying the control.
(function () {
  console.log('Test (#937 e): bundle finalize with a --project that differs from the on-disk folder ONLY IN CASE must still release the kw:claim marker on every member, and must say it corrected the name');
  assertFinalizeResolvesTheProjectSlug937('#937 e (bundle, mis-cased)', 'issue-93705', [93705, 93715], misCaseSlug('issue-93705'));
})();

(function () {
  console.log('Test (#937 f): the SINGLE-issue finalize arm composes the same marker from the same supplied name — the bundle loop and the scalar call are separate call sites and neither reaches the other');
  assertFinalizeResolvesTheProjectSlug937('#937 f (single, mis-cased)', 'issue-93706', [93706], misCaseSlug('issue-93706'));
})();

(function () {
  console.log('Test (#937 g, positive control): the same bundle finalize driven with the EXACT on-disk slug still deletes the marker on every member — without this, "the marker is gone" could be true of a fixture that deletes nothing');
  assertFinalizeResolvesTheProjectSlug937('#937 g (bundle, exact)', 'issue-93707', [93707, 93717], 'issue-93707');
})();

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('');
if (failed > 0) {
  console.error('test-bundle-finalize: ' + failed + ' test(s) FAILED, ' + passed + ' passed');
  process.exit(1);
} else {
  console.log('test-bundle-finalize: all ' + passed + ' tests passed');
  process.exit(0);
}
