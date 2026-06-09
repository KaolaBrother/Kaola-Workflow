#!/usr/bin/env node
'use strict';

// Unit/integration tests for bundle CLAIM path (issue #328 claim-startup node).
// Hand-rolled assert + counter; repo style (no framework) — mirrors test-bundle-state.js.
//
// SCOPE: AC#2, AC#3, AC#7 of issue #328 — the multi-target bundle claim path added to
//   kaola-workflow-claim.js by the claim-startup node.
//
// Covered scenarios:
//   (1) Successful bundle claim: creates ONE active folder, state has issue_numbers/bundle_id/
//       closure_policy, label+comment applied per member (mocked gh).
//   (2) Refused bundle (closed member): leaves NO active folder, NO lingering label (rollback).
//   (3) target_ambiguity when both --target-issue and --target-issues set.
//   (4) target_set_too_large above the cap (default 4).
//   (5) Single-issue --target-issue N still works unchanged (AC#1 regression).
//   (6) target_set_empty when --target-issues is missing/empty.
//   (7) target_set_not_adaptive when workflow_path is not adaptive.
//   (8) Rollback path: when postAdvisoryClaim for a member fails mid-provision, the folder
//       and previously applied labels are torn down.
//
// OFFLINE-safe strategy: use KAOLA_GH_MOCK_SCRIPT (the existing pattern from
// simulate-workflow-walkthrough.js) rather than KAOLA_WORKFLOW_OFFLINE, so that
// (a) the classifier subprocess also routes through the mock, getting a definitive online
//     verdict (not target_unverified), and
// (b) gh label/comment calls can be intercepted and logged for assertion.
//
// All fixtures are written to $TMPDIR — NOTHING is written inside the repo tree.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const claimScript = path.join(repoRoot, 'scripts', 'kaola-workflow-claim.js');

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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kw-bundle-claim-'));
}

function initGitRepo(tmp) {
  spawnSync('git', ['init', '-b', 'main'], { cwd: tmp, encoding: 'utf8' });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: tmp, encoding: 'utf8' });
  spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: tmp, encoding: 'utf8' });
  fs.writeFileSync(path.join(tmp, 'README.md'), 'fixture\n');
  spawnSync('git', ['add', 'README.md'], { cwd: tmp, encoding: 'utf8' });
  spawnSync('git', ['commit', '-m', 'init'], { cwd: tmp, encoding: 'utf8' });
}

// Write a roadmap file for an issue so OFFLINE classify returns green (not target_unverified).
// In the mock-gh (online) path this is less critical, but harmless.
function writeRoadmapFile(tmpRoot, issueNum, extraLines) {
  const dir = path.join(tmpRoot, 'kaola-workflow', '.roadmap');
  fs.mkdirSync(dir, { recursive: true });
  const lines = ['# Issue ' + issueNum, 'title: Test issue ' + issueNum];
  if (extraLines) lines.push(...extraLines);
  fs.writeFileSync(path.join(dir, 'issue-' + issueNum + '.md'), lines.join('\n') + '\n');
}

// Write a mock gh script to tmpDir/gh.js. Behaviour:
//   - `issue view N` returns open JSON for any issue in openIssues set, closed for closedIssues set.
//   - `issue edit ... --add-label` logs "label-added:<N>" to logFile.
//   - `issue comment N --body ...` logs "comment:<N>" to logFile.
//   - `label create ...` is a no-op (exit 0).
//   - `api repos/.../issues/N/comments` returns [].
//   - `issue edit ... --remove-label` logs "label-removed:<N>" to logFile.
//   - throwOnIssueEdit: if a number, throw on add-label for that issue (to test rollback).
//   - throwOnRemoveLabel: if a number, throw on remove-label for that issue (to test rollback-failed).
function writeGhMockScript(binDir, opts) {
  const logFile = opts && opts.logFile ? JSON.stringify(opts.logFile) : 'null';
  const openIssues = opts && opts.openIssues ? JSON.stringify(opts.openIssues) : '[]';
  const closedIssues = opts && opts.closedIssues ? JSON.stringify(opts.closedIssues) : '[]';
  const throwOnEdit = opts && opts.throwOnIssueEdit != null ? String(opts.throwOnIssueEdit) : 'null';
  const throwOnRemove = opts && opts.throwOnRemoveLabel != null ? String(opts.throwOnRemoveLabel) : 'null';

  fs.mkdirSync(binDir, { recursive: true });
  const script = [
    "'use strict';",
    'const fs = require("fs");',
    'const argv = process.argv.slice(2);',
    'const a = argv.join(" ");',
    'const logFile = ' + logFile + ';',
    'const openIssues = new Set(' + openIssues + '.map(String));',
    'const closedIssues = new Set(' + closedIssues + '.map(String));',
    'const throwOnEdit = ' + throwOnEdit + ';',
    'const throwOnRemove = ' + throwOnRemove + ';',
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
    '// issue view N --json state',
    'const viewM = a.match(/issue view (\\d+)/);',
    'if (viewM) {',
    '  const n = viewM[1];',
    '  if (closedIssues.has(n)) {',
    '    process.stdout.write(JSON.stringify({number:parseInt(n),state:"closed",title:"issue "+n,body:"",labels:[]}) + "\\n");',
    '  } else {',
    '    process.stdout.write(JSON.stringify({number:parseInt(n),state:"open",title:"issue "+n,body:"",labels:[]}) + "\\n");',
    '  }',
    '  process.exit(0);',
    '}',
    '',
    '// issue edit N --add-label',
    'if (a.includes("issue edit") && a.includes("--add-label")) {',
    '  const em = a.match(/issue edit (\\d+)/);',
    '  const n = em ? em[1] : "?";',
    '  if (throwOnEdit !== "null" && n === String(throwOnEdit)) {',
    '    process.stderr.write("mock gh: forced error on add-label for issue " + n + "\\n");',
    '    process.exit(1);',
    '  }',
    '  log("label-added:" + n);',
    '  process.exit(0);',
    '}',
    '',
    '// issue edit N --remove-label',
    'if (a.includes("issue edit") && a.includes("--remove-label")) {',
    '  const em = a.match(/issue edit (\\d+)/);',
    '  const n = em ? em[1] : "?";',
    '  if (throwOnRemove !== "null" && n === String(throwOnRemove)) {',
    '    process.stderr.write("mock gh: forced error on remove-label for issue " + n + "\\n");',
    '    process.exit(1);',
    '  }',
    '  log("label-removed:" + n);',
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
    '// api repos/.../issues/N/comments => []',
    'if (a.includes("api") && a.includes("comments")) {',
    '  process.stdout.write("[]\\n");',
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

function runClaim(args, cwd, binDir, extraEnv) {
  const mockEnv = fs.existsSync(path.join(binDir, 'gh.js'))
    ? { KAOLA_GH_MOCK_SCRIPT: path.join(binDir, 'gh.js') }
    : {};
  const result = spawnSync(process.execPath, [claimScript, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 60000,
    env: Object.assign({}, process.env, {
      KAOLA_WORKFLOW_OFFLINE: '0',
      KAOLA_WORKTREE_NATIVE: '1',  // use worktrees (git repos initialised in $TMPDIR)
      KAOLA_ENABLE_ADAPTIVE: '1',  // adaptive must be ON for bundle lane
    }, mockEnv, extraEnv || {})
  });
  return result;
}

function parseClaim(result) {
  const lines = (result.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
  if (!lines.length) return null;
  try { return JSON.parse(lines[lines.length - 1]); } catch (_) { return null; }
}

function readLog(logFile) {
  try { return fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean); } catch (_) { return []; }
}

function readState(tmpRoot, project) {
  const sf = path.join(tmpRoot, 'kaola-workflow', project, 'workflow-state.md');
  try { return fs.readFileSync(sf, 'utf8'); } catch (_) { return null; }
}

// ---------------------------------------------------------------------------
// Test (1): Successful bundle claim
// Creates ONE active folder, state has issue_numbers/bundle_id/closure_policy,
// label+comment applied per member.
// ---------------------------------------------------------------------------

(function testSuccessfulBundleClaim() {
  console.log('Test (1): successful bundle claim [42,47,53]');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  const logFile = path.join(tmpRoot, 'gh-calls.log');
  try {
    initGitRepo(tmpRoot);
    writeRoadmapFile(tmpRoot, 42);
    writeRoadmapFile(tmpRoot, 47);
    writeRoadmapFile(tmpRoot, 53);
    writeGhMockScript(binDir, {
      logFile,
      openIssues: [42, 47, 53],
    });

    const result = runClaim(
      ['startup', '--target-issues', '42,47,53', '--workflow-path', 'adaptive'],
      tmpRoot, binDir
    );

    const out = parseClaim(result);
    assert(result.status === 0, 'bundle startup exits 0, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out !== null, 'bundle startup emits JSON');
    assert(out.claim === 'acquired', 'claim is acquired, got ' + JSON.stringify(out && out.claim));
    assert(out.status === 'acquired', 'status is acquired, got ' + JSON.stringify(out && out.status));
    assert(out.bundle_id === 'bundle-42-47-53', 'bundle_id is bundle-42-47-53, got ' + JSON.stringify(out && out.bundle_id));

    // Issue_numbers in the result
    assert(Array.isArray(out.issue_numbers), 'result has issue_numbers array');
    if (Array.isArray(out.issue_numbers)) {
      assert(out.issue_numbers.length === 3, 'issue_numbers has 3 members');
      assert(out.issue_numbers[0] === 42, 'issue_numbers[0] is 42 (primary/lowest)');
    }

    // State file exists and has correct fields
    const state = readState(tmpRoot, 'bundle-42-47-53');
    assert(state !== null, 'state file was created at bundle-42-47-53/workflow-state.md');
    assert(/^issue_number:\s*42\s*$/m.test(state), 'state has issue_number: 42 (primary)');
    assert(/^issue_numbers:\s*42,47,53\s*$/m.test(state), 'state has issue_numbers: 42,47,53');
    assert(/^bundle_id:\s*bundle-42-47-53\s*$/m.test(state), 'state has bundle_id: bundle-42-47-53');
    assert(/^closure_policy:\s*all_or_nothing\s*$/m.test(state), 'state has closure_policy: all_or_nothing');
    assert(/^workflow_path:\s*adaptive\s*$/m.test(state), 'state has workflow_path: adaptive');

    // Labels and comments applied per member via mock gh
    const calls = readLog(logFile);
    const labelsAdded = calls.filter(c => c.startsWith('label-added:'));
    const comments = calls.filter(c => c.startsWith('comment:'));
    assert(labelsAdded.some(c => c === 'label-added:42'), 'label added for member 42');
    assert(labelsAdded.some(c => c === 'label-added:47'), 'label added for member 47');
    assert(labelsAdded.some(c => c === 'label-added:53'), 'label added for member 53');
    assert(comments.some(c => c === 'comment:42'), 'comment posted for member 42');
    assert(comments.some(c => c === 'comment:47'), 'comment posted for member 47');
    assert(comments.some(c => c === 'comment:53'), 'comment posted for member 53');

  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// ---------------------------------------------------------------------------
// Test (2): Refused bundle (closed member) — no active folder, no lingering label
// ---------------------------------------------------------------------------

(function testRefusedBundleClosedMember() {
  console.log('Test (2): refused bundle — closed member #47 leaves no active folder, no label');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  const logFile = path.join(tmpRoot, 'gh-calls.log');
  try {
    initGitRepo(tmpRoot);
    writeRoadmapFile(tmpRoot, 42);
    writeRoadmapFile(tmpRoot, 47);
    writeRoadmapFile(tmpRoot, 53);
    writeGhMockScript(binDir, {
      logFile,
      openIssues: [42, 53],
      closedIssues: [47],
    });

    const result = runClaim(
      ['startup', '--target-issues', '42,47,53', '--workflow-path', 'adaptive'],
      tmpRoot, binDir
    );

    const out = parseClaim(result);
    assert(result.status === 1, 'refused bundle exits 1, got ' + result.status);
    assert(out !== null, 'refused bundle emits JSON');
    // probeIssueState runs BEFORE classifyIssue in the per-member loop (Fix 1), so a closed
    // member always gets the dedicated code (not target_set_red from the classifier).
    assert(
      out.status === 'target_set_has_closed_issue',
      'status is target_set_has_closed_issue for closed member, got ' + JSON.stringify(out && out.status)
    );
    assert(out.issue === 47, 'refused on issue 47, got ' + JSON.stringify(out && out.issue));

    // No active folder created (pre-mutation refusal)
    const bundleDir = path.join(tmpRoot, 'kaola-workflow', 'bundle-42-47-53');
    assert(!fs.existsSync(bundleDir) || !fs.existsSync(path.join(bundleDir, 'workflow-state.md')),
      'no active folder after refusal');

    // No labels were applied (refusal was pre-mutation)
    const calls = readLog(logFile);
    const labelsAdded = calls.filter(c => c.startsWith('label-added:'));
    assert(labelsAdded.length === 0, 'no labels added after pre-mutation refusal, got: ' + labelsAdded.join(', '));

  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// ---------------------------------------------------------------------------
// Test (3): target_ambiguity — both --target-issue and --target-issues set
// ---------------------------------------------------------------------------

(function testTargetAmbiguity() {
  console.log('Test (3): target_ambiguity when both --target-issue and --target-issues set');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  try {
    initGitRepo(tmpRoot);
    writeGhMockScript(binDir, { openIssues: [42, 47] });

    const result = runClaim(
      ['startup', '--target-issue', '42', '--target-issues', '42,47', '--workflow-path', 'adaptive'],
      tmpRoot, binDir
    );

    const out = parseClaim(result);
    assert(result.status === 1, 'target_ambiguity exits 1, got ' + result.status);
    assert(out !== null, 'target_ambiguity emits JSON');
    assert(out.status === 'target_ambiguity' || out.verdict === 'target_ambiguity',
      'status/verdict is target_ambiguity, got: ' + JSON.stringify(out));

  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// ---------------------------------------------------------------------------
// Test (4): target_set_too_large — above KAOLA_BUNDLE_MAX_ISSUES (default 4)
// ---------------------------------------------------------------------------

(function testTargetSetTooLarge() {
  console.log('Test (4): target_set_too_large when more than 4 issues (default cap)');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  try {
    initGitRepo(tmpRoot);
    writeGhMockScript(binDir, { openIssues: [1, 2, 3, 4, 5] });

    const result = runClaim(
      ['startup', '--target-issues', '1,2,3,4,5', '--workflow-path', 'adaptive'],
      tmpRoot, binDir
    );

    const out = parseClaim(result);
    assert(result.status === 1, 'target_set_too_large exits 1, got ' + result.status);
    assert(out !== null, 'target_set_too_large emits JSON');
    assert(out.status === 'target_set_too_large',
      'status is target_set_too_large, got ' + JSON.stringify(out && out.status));

  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// ---------------------------------------------------------------------------
// Test (5): AC#1 regression — single-issue --target-issue N still works unchanged
// ---------------------------------------------------------------------------

(function testSingleIssueRegression() {
  console.log('Test (5): AC#1 regression — single-issue --target-issue N works unchanged');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  try {
    initGitRepo(tmpRoot);
    writeRoadmapFile(tmpRoot, 99);
    writeGhMockScript(binDir, { openIssues: [99] });

    const result = runClaim(
      ['startup', '--target-issue', '99', '--workflow-path', 'full'],
      tmpRoot, binDir
      // KAOLA_ENABLE_ADAPTIVE='1' from runClaim default is fine; full path is always legal
    );

    const out = parseClaim(result);
    assert(result.status === 0, 'single-issue startup exits 0, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out !== null, 'single-issue startup emits JSON');
    assert(out.claim === 'acquired', 'single-issue claim acquired, got ' + JSON.stringify(out && out.claim));

    // State file must NOT have issue_numbers/bundle_id/closure_policy (AC#1 byte-identical)
    const state = readState(tmpRoot, out.selected_project || 'issue-99');
    assert(state !== null, 'single-issue state file exists');
    assert(!/^issue_numbers:/m.test(state), 'state has NO issue_numbers line (AC#1)');
    assert(!/^bundle_id:/m.test(state), 'state has NO bundle_id line (AC#1)');
    assert(!/^closure_policy:/m.test(state), 'state has NO closure_policy line (AC#1)');

  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// ---------------------------------------------------------------------------
// Test (6): target_set_empty when --target-issues is missing
// ---------------------------------------------------------------------------

(function testTargetSetEmpty() {
  console.log('Test (6): target_set_empty when startup called without --target-issue or --target-issues');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  try {
    initGitRepo(tmpRoot);
    writeGhMockScript(binDir, {});

    // Call startup with no target at all — claimExplicitBundle would get empty targets
    // Actually test KAOLA_TARGET_ISSUES='' env path
    const result = runClaim(
      ['startup', '--workflow-path', 'adaptive'],
      tmpRoot, binDir,
      { KAOLA_TARGET_ISSUES: '' }
    );

    const out = parseClaim(result);
    assert(result.status === 1, 'no-target startup exits 1, got ' + result.status);
    // Either no_target or target_set_empty is acceptable
    assert(out !== null, 'no-target emits JSON');
    assert(out.status === 'no_target' || out.verdict === 'no_target' || out.status === 'target_set_empty',
      'status is no_target or target_set_empty, got: ' + JSON.stringify(out));

  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// ---------------------------------------------------------------------------
// Test (7): target_set_not_adaptive when workflow_path != adaptive
// ---------------------------------------------------------------------------

(function testTargetSetNotAdaptive() {
  console.log('Test (7): target_set_not_adaptive when --workflow-path is not adaptive');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  try {
    initGitRepo(tmpRoot);
    writeGhMockScript(binDir, { openIssues: [42, 47] });

    const result = runClaim(
      ['startup', '--target-issues', '42,47', '--workflow-path', 'full'],
      tmpRoot, binDir,
      { KAOLA_ENABLE_ADAPTIVE: '1' }
    );

    const out = parseClaim(result);
    assert(result.status === 1, 'target_set_not_adaptive exits 1, got ' + result.status);
    assert(out !== null, 'emits JSON');
    assert(out.status === 'target_set_not_adaptive',
      'status is target_set_not_adaptive, got ' + JSON.stringify(out && out.status));

  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// ---------------------------------------------------------------------------
// Test (8): Rollback path — add-label throws for member 47 (second member).
// Verifies: member 42's label WAS added then rolled back (label-removed:42 in log),
// no bundle folder remains, result is target_set_unavailable (rollback clean).
// This exercises the claimBundle catch block + reverse-order label teardown that
// was previously unreachable because postAdvisoryClaim swallows gh errors.
// ---------------------------------------------------------------------------

(function testRollbackOnMidProvisionLabelFailure() {
  console.log('Test (8): rollback — add-label fails for member 47, member-42 label torn down, no folder remains');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  const logFile = path.join(tmpRoot, 'gh-calls.log');
  try {
    initGitRepo(tmpRoot);
    writeRoadmapFile(tmpRoot, 42);
    writeRoadmapFile(tmpRoot, 47);
    writeGhMockScript(binDir, {
      logFile,
      openIssues: [42, 47],
      throwOnIssueEdit: 47,  // add-label for #47 throws -> triggers claimBundle rollback
    });

    const result = runClaim(
      ['startup', '--target-issues', '42,47', '--workflow-path', 'adaptive'],
      tmpRoot, binDir
    );

    const out = parseClaim(result);
    // Claim must fail
    assert(result.status === 1, 'rollback claim exits 1, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out !== null, 'rollback emits JSON');
    // After clean rollback the status is target_set_unavailable
    assert(
      out.status === 'target_set_unavailable' || out.status === 'target_set_label_rollback_failed',
      'rollback status is target_set_unavailable or target_set_label_rollback_failed, got: ' + JSON.stringify(out && out.status)
    );

    // No bundle folder remains (rolled back)
    const bundleDir = path.join(tmpRoot, 'kaola-workflow', 'bundle-42-47');
    assert(!fs.existsSync(bundleDir) || !fs.existsSync(path.join(bundleDir, 'workflow-state.md')),
      'no bundle state file remains after rollback');

    // member-42 label was added (logged) and then removed in teardown (label-removed:42 in log)
    const calls = readLog(logFile);
    const labelsAdded = calls.filter(c => c.startsWith('label-added:'));
    const labelsRemoved = calls.filter(c => c.startsWith('label-removed:'));
    assert(labelsAdded.some(c => c === 'label-added:42'), 'member 42 label was added before rollback');
    assert(labelsRemoved.some(c => c === 'label-removed:42'), 'member 42 label was removed during rollback teardown');
    // member-47 label was NOT added (gh threw before log)
    assert(!labelsAdded.some(c => c === 'label-added:47'), 'member 47 label was NOT added (threw before log)');

  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// ---------------------------------------------------------------------------
// Test (8b): target_set_label_rollback_failed — rollback teardown itself fails.
// Forces: add-label for member 47 throws (triggers rollback),
//         remove-label for member 42 also throws (teardown fails).
// Verifies: result is target_set_label_rollback_failed with partial evidence.
// ---------------------------------------------------------------------------

(function testRollbackFailedWhenTeardownFails() {
  console.log('Test (8b): target_set_label_rollback_failed — teardown remove-label also fails');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  const logFile = path.join(tmpRoot, 'gh-calls.log');
  try {
    initGitRepo(tmpRoot);
    writeRoadmapFile(tmpRoot, 42);
    writeRoadmapFile(tmpRoot, 47);
    writeGhMockScript(binDir, {
      logFile,
      openIssues: [42, 47],
      throwOnIssueEdit: 47,     // add-label for #47 throws -> triggers rollback
      throwOnRemoveLabel: 42,   // remove-label for #42 also throws -> teardown fails
    });

    const result = runClaim(
      ['startup', '--target-issues', '42,47', '--workflow-path', 'adaptive'],
      tmpRoot, binDir
    );

    const out = parseClaim(result);
    assert(result.status === 1, 'rollback-failed claim exits 1, got ' + result.status);
    assert(out !== null, 'rollback-failed emits JSON');
    assert(out.status === 'target_set_label_rollback_failed',
      'status is target_set_label_rollback_failed, got: ' + JSON.stringify(out && out.status));
    assert(out.partial != null, 'rollback-failed result includes partial evidence');

  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// ---------------------------------------------------------------------------
// Test (9): Bundle ID is canonical — sorted ascending and deduped
// --target-issues 53,42,47 must produce bundle-42-47-53 (same as 42,47,53)
// ---------------------------------------------------------------------------

(function testBundleIdSorting() {
  console.log('Test (9): bundle_id is sorted ascending — 53,42,47 -> bundle-42-47-53');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  try {
    initGitRepo(tmpRoot);
    writeRoadmapFile(tmpRoot, 42);
    writeRoadmapFile(tmpRoot, 47);
    writeRoadmapFile(tmpRoot, 53);
    writeGhMockScript(binDir, { openIssues: [42, 47, 53] });

    const result = runClaim(
      ['startup', '--target-issues', '53,42,47', '--workflow-path', 'adaptive'],
      tmpRoot, binDir
    );

    const out = parseClaim(result);
    assert(result.status === 0, 'sorted bundle claim exits 0, got ' + result.status + '\nstderr: ' + result.stderr);
    assert(out !== null && out.claim === 'acquired', 'sorted bundle acquired');
    assert(out.bundle_id === 'bundle-42-47-53',
      'bundle_id sorted: expected bundle-42-47-53, got ' + JSON.stringify(out && out.bundle_id));
    assert(out.issue_numbers && out.issue_numbers[0] === 42,
      'primary (lowest) is 42, got ' + JSON.stringify(out && out.issue_numbers));

  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// ---------------------------------------------------------------------------
// Test (10): KAOLA_TARGET_ISSUES env var triggers bundle path
// ---------------------------------------------------------------------------

(function testEnvVarTargetIssues() {
  console.log('Test (10): KAOLA_TARGET_ISSUES env var triggers bundle claim');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  try {
    initGitRepo(tmpRoot);
    writeRoadmapFile(tmpRoot, 10);
    writeRoadmapFile(tmpRoot, 20);
    writeGhMockScript(binDir, { openIssues: [10, 20] });

    const result = runClaim(
      ['startup', '--workflow-path', 'adaptive'],
      tmpRoot, binDir,
      { KAOLA_TARGET_ISSUES: '10,20' }
    );

    const out = parseClaim(result);
    assert(result.status === 0, 'env var bundle claim exits 0, got ' + result.status + '\nstderr: ' + result.stderr);
    assert(out !== null && out.claim === 'acquired', 'env var bundle acquired');
    assert(out.bundle_id === 'bundle-10-20',
      'bundle_id from env: expected bundle-10-20, got ' + JSON.stringify(out && out.bundle_id));

  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('');
if (failed > 0) {
  console.error('test-bundle-claim: ' + failed + ' test(s) FAILED, ' + passed + ' passed');
  process.exit(1);
} else {
  console.log('test-bundle-claim: all ' + passed + ' tests passed');
  process.exit(0);
}
