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
//   (4) a wide bundle acquires and carries size advice; (4b) an ordinary one carries none.
//   (5) Single-issue --target-issue N still works unchanged (AC#1 regression).
//   (6) target_set_empty when --target-issues is missing/empty.
//   (7) #770: a stale --workflow-path (e.g. full) on the bundle lane silently acquires (no
//       refusal) — bundle_requires_adaptive is retired along with the path SELECTOR itself.
//   (8) Rollback path: when postAdvisoryClaim for a member fails mid-provision, the folder
//       and previously applied labels are torn down — and, the teardown having SUCCEEDED, the
//       claim ANSWERS at exit 0.
//   (8b) The same failure with the teardown ALSO failing: a claim label survives on the forge,
//       so this one keeps refusing at exit 1.
//   (8c) The PAIR, asserted together: a clean world and a world with surviving forge residue
//       must not classify alike. That contrast is the whole justification for (8b)'s carve-out.
//   (11) THE TWIN RULE: a `target_set_X` classifies and exits exactly like its scalar twin `X`.
//       A property over `TARGET_SET_TWINS` read as data, plus a driven comparison of both lanes
//       — not nine hand-written token pins, which cannot catch the token added to one half only.
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
// Git FIXTURE arrangement routes through the shared library — one process-boundary
// decision for the repo instead of one per line. See scripts/test-git-fixture.js.
const G = require('./test-git-fixture');

// #531/#770: hermetic HOME. The classifier reads parallel_mode from
// ~/.config/kaola-workflow/config.json (os.homedir()). Pin a sandbox HOME seeded with the
// DEFAULT-install shape (parallel_mode:'auto') so a dev-local config can't change verdict and turn
// these assertions spurious. Adaptive is the ONLY workflow path — the bundle lane always runs it
// unconditionally, and the retired path SELECTOR (KAOLA_PATH/--workflow-path) no longer gates or
// refuses anything (a stale request is silently ignored). A stale installed_paths field is
// tolerated on read but is no longer written.
const kwSandboxHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sandbox-home-'));
fs.mkdirSync(path.join(kwSandboxHome, '.config', 'kaola-workflow'), { recursive: true });
fs.writeFileSync(
  path.join(kwSandboxHome, '.config', 'kaola-workflow', 'config.json'),
  JSON.stringify({ parallel_mode: 'auto' }, null, 2) + '\n'
);
process.env.HOME = kwSandboxHome;
process.env.USERPROFILE = kwSandboxHome;

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
  G.git(tmp, ['init', '-b', 'main'], { encoding: 'utf8' });
  G.git(tmp, ['config', 'user.email', 'test@example.com'], { encoding: 'utf8' });
  G.git(tmp, ['config', 'user.name', 'Test User'], { encoding: 'utf8' });
  fs.writeFileSync(path.join(tmp, 'README.md'), 'fixture\n');
  G.git(tmp, ['add', 'README.md'], { encoding: 'utf8' });
  G.git(tmp, ['commit', '-m', 'init'], { encoding: 'utf8' });
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

  // viewFails: `issue view N` emits a GENUINE-negative 404 on stderr and exits 1, so the probe
  // reports `unavailable` (not transient). This is the only way to reach the
  // target_unavailable / target_set_unavailable pair hermetically — without it the claim would
  // shell the real `gh`.
  const viewFails = opts && opts.viewFails ? 'true' : 'false';

  // logViews: also record the state probe, giving a "no labels were applied" assertion a
  // live-log control. OPT-IN, and deliberately so: the probe runs BEFORE the dirty-tree check,
  // so logging it unconditionally creates an untracked file inside the fixture repo and an
  // in-place (KAOLA_WORKTREE_NATIVE=0) claim then reads the tree as dirty and asks for consent
  // instead of acquiring. Measured, not theorised — turning this on for every fixture reddened
  // the five #370 in-place assertions.
  const logViews = opts && opts.logViews ? 'true' : 'false';

  fs.mkdirSync(binDir, { recursive: true });
  const script = [
    "'use strict';",
    'const fs = require("fs");',
    'const argv = process.argv.slice(2);',
    'const a = argv.join(" ");',
    'const viewFails = ' + viewFails + ';',
    'const logViews = ' + logViews + ';',
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
    '  if (logViews) log("view:" + n);',
    '  if (viewFails) {',
    '    process.stderr.write("GraphQL: Could not resolve to an Issue with the number of " + n + ". (repository.issue)\\n");',
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
      // #770: adaptive is the ONLY workflow path — the bundle lane always runs it unconditionally,
      // and the path SELECTOR (KAOLA_PATH/--workflow-path) no longer gates or refuses anything, so
      // no config/switch env is required here.
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

    // #370: with KAOLA_WORKTREE_NATIVE=1 the bundle now provisions a worktree (parity with
    // single-issue claimProject; the prior "matches adaptive single-issue" suppression was false).
    assert(typeof out.worktree_path === 'string' && out.worktree_path.length > 0,
      '#370: bundle claim provisions a worktree (worktree_path non-empty), got ' + JSON.stringify(out && out.worktree_path));
    assert(fs.existsSync(out.worktree_path), '#370: provisioned worktree directory exists at ' + out.worktree_path);
    assert(/^worktree_path:\s*\S+\s*$/m.test(state), '#370: state records a non-empty worktree_path');
    assert(/^run_posture:\s*worktree\s*$/m.test(state), '#370: state records run_posture: worktree');

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
      logViews: true,   // live-log control for the "no labels added" assertion below
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

    // No active folder created (pre-mutation refusal). Asserted as the STRONG form: the folder
    // must not exist AT ALL. The disjunction this replaces (`no dir OR no state file`) could
    // never fail on its second clause here — a pre-mutation refusal never creates the directory,
    // so the first clause was always true and the assertion could not do any work.
    const bundleDir = path.join(tmpRoot, 'kaola-workflow', 'bundle-42-47-53');
    assert(!fs.existsSync(bundleDir),
      'a PRE-MUTATION refusal creates no bundle folder at all, but ' + bundleDir + ' exists'
        + (fs.existsSync(bundleDir) ? ' containing ' + JSON.stringify(fs.readdirSync(bundleDir)) : ''));

    // No labels were applied (refusal was pre-mutation).
    const calls = readLog(logFile);
    const labelsAdded = calls.filter(c => c.startsWith('label-added:'));
    // LIVE-LOG CONTROL, and it is the point of this pair: "zero labels" and "the log never
    // recorded anything" are indistinguishable without it, so the assertion below could pass
    // against a mock that had stopped writing entirely. The state probe DID reach the mock and
    // DID write, so the empty label set is a measurement.
    assert(calls.some(c => c.startsWith('view:')),
      'CONTROL: the gh mock really did write to the log during this fixture (otherwise "no labels" '
        + 'is unfalsifiable), got: ' + JSON.stringify(calls));
    assert(labelsAdded.length === 0, 'no labels added after pre-mutation refusal, got: ' + labelsAdded.join(', '));

  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// ---------------------------------------------------------------------------
// Test (3): target_ambiguity — both --target-issue and --target-issues set. An argv usage
// ANSWER: nothing is written either way, so it exits 0 and the caller re-runs with one of the two.
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
    assert(result.status === 0, 'both targets set is a usage answer at exit 0, got ' + result.status);
    assert(out !== null, 'the usage answer emits JSON');
    assert(out.claim === 'none', 'the usage answer claims nothing, got: ' + JSON.stringify(out.claim));
    assert(out.result === 'answer', 'the usage answer is typed as an answer, got: ' + JSON.stringify(out.result));
    assert(typeof out.reasoning === 'string' && out.reasoning.indexOf('usage:') === 0,
      'the usage answer leads with usage text, got: ' + JSON.stringify(out.reasoning));
    assert(!fs.existsSync(path.join(tmpRoot, 'kaola-workflow', 'issue-42')),
      'the usage answer writes nothing');

  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// ---------------------------------------------------------------------------
// Test (4) — bundle size is ADVICE, not a ceiling. How many issues one claim takes is a decision
// about the work, so nothing enforces it: a bundle wider than the recommended shape acquires, and
// the count plus the recommendation ride out on the envelope for the orchestrator to weigh.
// ---------------------------------------------------------------------------

(function testWideBundleAcquiresWithAdvice() {
  console.log('Test (4): a 9-issue bundle acquires and carries size advice');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  const wide = [11, 12, 13, 14, 15, 16, 17, 18, 19];
  try {
    initGitRepo(tmpRoot);
    for (const n of wide) writeRoadmapFile(tmpRoot, n);
    writeGhMockScript(binDir, { openIssues: wide });

    const result = runClaim(
      ['startup', '--target-issues', wide.join(','), '--workflow-path', 'adaptive'],
      tmpRoot, binDir
    );

    const out = parseClaim(result);
    assert(result.status === 0,
      'a wide bundle exits 0, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out !== null && out.claim === 'acquired',
      'a wide bundle is acquired, got ' + JSON.stringify(out && (out.status || out.claim)));
    assert(out && out.bundle_id === 'bundle-' + wide.join('-'),
      'wide bundle_id is bundle-' + wide.join('-') + ', got ' + JSON.stringify(out && out.bundle_id));
    assert(typeof out.bundle_size_note === 'string' && out.bundle_size_note.indexOf('9 issues') >= 0,
      'the advice names the actual count, got ' + JSON.stringify(out && out.bundle_size_note));

  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// ---------------------------------------------------------------------------
// Test (4b) — the advice is silent at or below the recommended shape, so an ordinary bundle's
// envelope carries no note to read past.
// ---------------------------------------------------------------------------

(function testOrdinaryBundleCarriesNoAdvice() {
  console.log('Test (4b): a 5-issue bundle acquires with no size advice');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  try {
    initGitRepo(tmpRoot);
    for (const n of [11, 12, 13, 14, 15]) writeRoadmapFile(tmpRoot, n);
    writeGhMockScript(binDir, { openIssues: [11, 12, 13, 14, 15] });

    const result = runClaim(
      ['startup', '--target-issues', '11,12,13,14,15', '--workflow-path', 'adaptive'],
      tmpRoot, binDir
    );

    const out = parseClaim(result);
    assert(result.status === 0,
      'a 5-issue bundle exits 0, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out !== null && out.claim === 'acquired',
      'a 5-issue bundle is acquired, got ' + JSON.stringify(out && (out.status || out.claim)));
    assert(out && out.bundle_size_note === undefined,
      'no advice below the recommended shape, got ' + JSON.stringify(out && out.bundle_size_note));

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
      ['startup', '--target-issue', '99'],
      tmpRoot, binDir
      // #538: no --workflow-path → defaults to adaptive (always legal). The single-issue regression
      // is path-incidental; explicit-installed-path coverage lives in test-claim-hardening.js.
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
    assert(result.status === 0, 'a no-target startup is a usage answer at exit 0, got ' + result.status);
    assert(out !== null, 'no-target emits JSON');
    assert(out.claim === 'none', 'the no-target answer claims nothing, got: ' + JSON.stringify(out.claim));
    assert(typeof out.reasoning === 'string' && out.reasoning.indexOf('--target-issue') >= 0,
      'the no-target answer names the flag it wanted, got: ' + JSON.stringify(out.reasoning));

  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// ---------------------------------------------------------------------------
// Test (7): #770 — a stale --workflow-path on the bundle lane no longer refuses
// (bundle_requires_adaptive is retired along with the path SELECTOR itself)
// ---------------------------------------------------------------------------

(function testBundleRequiresAdaptive() {
  console.log('Test (7): #770 a stale --workflow-path (e.g. full) on the bundle lane silently acquires — no refusal');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  try {
    initGitRepo(tmpRoot);
    writeRoadmapFile(tmpRoot, 42);
    writeRoadmapFile(tmpRoot, 47);
    writeGhMockScript(binDir, { openIssues: [42, 47] });

    // #770: the bundle lane's own path-legality check (bundle_requires_adaptive) is retired along
    // with the path SELECTOR — the bundle lane always runs adaptive now, so a stale/retired
    // --workflow-path value (here the retired `full`) is silently ignored and the bundle ACQUIRES,
    // same as `adaptive` would. Unlike the single-issue claim path (which echoes the raw requested
    // value into the persisted `workflow_path` field as a diagnostic-only record), the bundle path
    // has always hardcoded `workflow_path: adaptive` in state regardless of what was requested —
    // that hardcode predates and is unaffected by #770, so it still reads `adaptive` here.
    const result = runClaim(
      ['startup', '--target-issues', '42,47', '--workflow-path', 'full'],
      tmpRoot, binDir
    );

    const out = parseClaim(result);
    assert(result.status === 0, 'bundle startup exits 0, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out !== null, 'bundle startup emits JSON');
    assert(out.claim === 'acquired', 'claim is acquired, got ' + JSON.stringify(out && out.claim));
    assert(out.status === 'acquired', 'status is acquired, got ' + JSON.stringify(out && out.status));
    assert(out.bundle_id === 'bundle-42-47', 'bundle_id is bundle-42-47, got ' + JSON.stringify(out && out.bundle_id));
    assert((result.stderr || '').includes('--workflow-path is retired; running adaptive'),
      'the retired flag must print its one-line warn-and-ignore stderr notice, got stderr: ' + result.stderr);

    const state = readState(tmpRoot, 'bundle-42-47');
    assert(state !== null, 'state file was created at bundle-42-47/workflow-state.md');
    assert(/^workflow_path:\s*adaptive\s*$/m.test(state),
      'state has workflow_path: adaptive (the bundle path hardcodes this regardless of the requested value), got:\n' + state);

  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// ---------------------------------------------------------------------------
// THE ROLLBACK DISCRIMINATOR — Test (8) and Test (8b) are ONE property in two halves.
//
// Both fixtures start the same way: add-label throws for member 47, so provisioning fails and
// the bundle rolls back. What separates them is what the FORGE looks like afterwards, and that
// difference is now the difference between an answer and a refusal:
//
//   (8)  teardown SUCCEEDS  -> nothing was written anywhere that outlives the process. The world
//        is clean, the caller has learned a fact about its targets and can act on it, so the
//        claim ANSWERS at exit 0 (`target_set_unavailable`, twin of the scalar
//        `target_unavailable`, which has always answered).
//   (8b) teardown ALSO FAILS -> a claim label SURVIVES on the forge. This is the one code on
//        this surface where a mutation outlives the report, so the "nothing was written"
//        argument that demotes every other claim-time stop does not reach it. It keeps
//        `refuse` / exit 1, and `TARGET_SET_TWINS` records that by giving it `twin: null`.
//
// The two are asserted TOGETHER below (testRollbackDiscriminatorPair) as well as separately,
// because the whole justification for the carve-out is the CONTRAST. Test (8) used to accept
// EITHER status with a single exit code, which flattened exactly this distinction — the two
// worlds are now different exit codes, so an `or` here could no longer discriminate anything.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// MUTATION LOG for (8) / (8b) / (8c) / (11). Each pin was un-wired in `kaola-workflow-claim.js`
// and observed RED. Method: the repository is rsync'd to a scratch mirror, the mutation is
// applied to the MIRROR and the suite is run from there — `git checkout --` is unusable while
// several agents hold uncommitted work in this tree. Verbatim first casualties:
//
//   target_set_unavailable -> {twin:null, result:'refuse'}
//     "clean rollback ANSWERS at exit 0, got 1" · "clean rollback carries result:answer, got
//     "refuse"" · "THE DISCRIMINATOR: ... clean=["refuse",1] residue=["refuse",1]" ·
//     "fixture drift: TARGET_SET_TWINS says `target_set_unavailable` twins `null`" (7 assertions)
//
//   target_set_label_rollback_failed given a twin that ANSWERS
//     "rollback-failed claim exits 1, got 0" · "the surviving-residue token keeps result:refuse,
//     got "answer"" · "THE DISCRIMINATOR: ... clean=["answer",0] residue=["answer",0]" (6)
//
//   a CLEAN rollback reports the residue token (the two worlds flattened)
//     "a CLEAN rollback reports exactly target_set_unavailable, got:
//     "target_set_label_rollback_failed"" · "a clean rollback carries NO partial-teardown
//     evidence, got {...}" (7)
//
//   a token dropped from TARGET_SET_TWINS   -> "ADDED TO ONE HALF ONLY: `target_set_red` is
//     emitted by the claim surface but has NO entry in TARGET_SET_TWINS."
//   a dead entry added to TARGET_SET_TWINS  -> "DEAD TWIN ENTRY: ... `target_set_never_emitted_zz`"
//   a SECOND token opting out (twin:null)   -> "exactly ONE token may carry `twin: null` ..."
//   a twin naming a status not in the scalar table -> "`target_set_unverified` names the twin
//     `target_unverified_zz`, which is not in CLAIM_SCALAR_RESULTS"
//   claimResult stops consulting the scalar table -> 11 assertions, incl. "THE TWIN RULE
//     (result): `target_set_invalid_token` emitted result="refuse" but its scalar twin
//     `no_target` emitted "answer"" and the matching exit-code arm for three pairs.
//
// AND THE VACUITY AUDIT — four assertions in this block could not fail independently, and were
// rewritten. Each replacement was then mutation-proved in turn:
//
//   the rollback stops removing the project directory
//     "and the bundle folder itself is gone, not left orphaned — .../bundle-42-47 exists
//     containing [".cache","workflow-state.md"]" AND the same for (8b) (3 assertions).
//     The DISJUNCTION this replaced (`no dir OR no state file`) is red here on one clause only,
//     which is what it was hiding: it accepted an orphaned directory.
//
//   the PRE-MUTATION closed-member refusal creates the folder first
//     "a PRE-MUTATION refusal creates no bundle folder at all, but .../bundle-42-47-53 exists
//     containing []" — the old disjunction at that site could never reach its second clause,
//     because a pre-mutation refusal never creates the directory in the first place.
//
//   the partial record is emitted EMPTY (`partial: {}`)
//     "the partial record NAMES the label that survived (#42)" AND the folder-creation
//     non-vacuity arm. THE OLD `out.partial != null` STAYED GREEN under this mutation — that is
//     the whole finding: a presence check on a field this code path itself wrote cannot fail
//     while the field exists at all.
//
//   FIXTURE mutation — the gh mock stops writing its log
//     13 assertions, incl. "CONTROL: the gh mock really did write to the log during this fixture
//     (otherwise "no labels" is unfalsifiable), got: []". Without that control, Test (2)'s
//     "no labels added" could not tell zero labels from a dead log.
//
// Nothing here survived a mutation aimed at it. The mirror control is green before and after.
// ---------------------------------------------------------------------------

// Recorded by (8) and (8b) for the joint assertion that follows them.
const rollbackOutcomes = {};

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
    assert(out !== null, 'rollback emits JSON');
    // A CLEAN rollback ANSWERS. The rule: a `target_set_X` classifies and exits exactly like its
    // scalar twin `X`, and `target_set_unavailable`'s twin `target_unavailable` has always
    // answered at exit 0. Nothing was written that survives, so the caller reads the reason and
    // claims something else — an exit code saying "refused" only invited it to stop.
    assert(result.status === 0, 'clean rollback ANSWERS at exit 0, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out.result === 'answer', 'clean rollback carries result:answer, got ' + JSON.stringify(out.result));
    assert(out.claim === 'none', 'and `claim: none` is what says the claim did not happen — not the exit code, got ' + JSON.stringify(out.claim));
    // EXACTLY the clean status. The old `or` accepted target_set_label_rollback_failed here too;
    // that status now exits 1, so accepting either would make this pin unable to tell the clean
    // world from the one with surviving forge residue — the distinction (8b) exists to draw.
    assert(out.status === 'target_set_unavailable',
      'a CLEAN rollback reports exactly target_set_unavailable, got: ' + JSON.stringify(out && out.status));

    // member-42 label was added (logged) and then removed in teardown (label-removed:42 in log)
    const calls = readLog(logFile);
    const labelsAdded = calls.filter(c => c.startsWith('label-added:'));
    const labelsRemoved = calls.filter(c => c.startsWith('label-removed:'));

    // The local half of the teardown, as a CONJUNCTION. The disjunction this replaces
    // (`no dir OR no state file`) accepted a rollback that left an orphaned directory behind, and
    // it was additionally unfalsifiable whenever provisioning failed before the mkdir — the first
    // clause would be true for a reason that has nothing to do with teardown. So: the folder is
    // gone, the state file is gone, and provisioning is known to have got PAST the point where
    // the folder is created (the label went on after it), which is what makes the absence
    // evidence of an unwind rather than of an early exit.
    const bundleDir = path.join(tmpRoot, 'kaola-workflow', 'bundle-42-47');
    assert(labelsAdded.length > 0,
      'NON-VACUITY: provisioning must have got past folder creation for its absence to mean '
        + 'anything — gh log: ' + JSON.stringify(calls));
    assert(!fs.existsSync(path.join(bundleDir, 'workflow-state.md')),
      'no bundle state file remains after rollback');
    assert(!fs.existsSync(bundleDir),
      'and the bundle folder itself is gone, not left orphaned — ' + bundleDir + ' exists'
        + (fs.existsSync(bundleDir) ? ' containing ' + JSON.stringify(fs.readdirSync(bundleDir)) : ''));
    assert(labelsAdded.some(c => c === 'label-added:42'), 'member 42 label was added before rollback');
    assert(labelsRemoved.some(c => c === 'label-removed:42'), 'member 42 label was removed during rollback teardown');
    // member-47 label was NOT added (gh threw before log)
    assert(!labelsAdded.some(c => c === 'label-added:47'), 'member 47 label was NOT added (threw before log)');
    // THE WORLD IS CLEAN. This is the premise the exit-0 answer rests on, so it is asserted
    // rather than assumed: every label this claim added was taken back off.
    assert(labelsAdded.length > 0 && labelsAdded.every(c => labelsRemoved.includes(c.replace('label-added:', 'label-removed:'))),
      'NO FORGE RESIDUE SURVIVES: every added label was removed — added=' + JSON.stringify(labelsAdded)
        + ' removed=' + JSON.stringify(labelsRemoved));
    assert(out.partial == null,
      'a clean rollback carries NO partial-teardown evidence, got ' + JSON.stringify(out.partial));

    rollbackOutcomes.clean = { code: result.status, status: out.status, result: out.result,
      labelsAdded, labelsRemoved, partial: out.partial };
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
    // THE CARVE-OUT, stated as behaviour. This token keeps `refuse` / exit 1 while its five
    // siblings demoted to `answer` — not as an exception to the twin rule but because it has no
    // scalar twin (`twin: null`) AND a forge mutation survives the report.
    assert(out.result === 'refuse',
      'the surviving-residue token keeps result:refuse, got ' + JSON.stringify(out.result));

    // THE PARTIAL EVIDENCE, by CONTENT. `partial != null` accepted `{}` — a presence check on a
    // field this very code path wrote, which cannot fail while the field exists at all and tells
    // a human nothing. What the evidence is FOR is finishing the cleanup by hand, so what it must
    // carry is the identity of the mutation that survived.
    assert(out.partial != null && typeof out.partial === 'object',
      'rollback-failed result includes partial evidence, got ' + JSON.stringify(out.partial));
    assert(out.partial && Array.isArray(out.partial.labeled) && out.partial.labeled.indexOf(42) >= 0,
      'the partial record NAMES the label that survived (#42) — without the identity a human cannot '
        + 'finish the cleanup, got ' + JSON.stringify(out.partial));

    // THE RESIDUE ITSELF — the fact that justifies the carve-out, measured rather than assumed.
    // Member 42's label went on and the teardown could NOT take it off, so the forge is left in a
    // state this process created and did not undo.
    const calls = readLog(logFile);
    assert(calls.includes('label-added:42'), 'member 42 label was added before the failed teardown');
    assert(!calls.includes('label-removed:42'),
      'FORGE RESIDUE SURVIVES: the label removal never landed, so the mutation outlives the report — '
        + 'gh log: ' + JSON.stringify(calls));

    // ...and the LOCAL half still unwinds. This was unpinned entirely: a failed FORGE teardown
    // must not also leave a half-provisioned folder on disk, or the refusal would be covering two
    // different failures and the operator could not tell which one it is being asked about.
    const bundleDir8b = path.join(tmpRoot, 'kaola-workflow', 'bundle-42-47');
    assert(!fs.existsSync(bundleDir8b),
      'a failed LABEL teardown still removes the local bundle folder — ' + bundleDir8b + ' exists'
        + (fs.existsSync(bundleDir8b) ? ' containing ' + JSON.stringify(fs.readdirSync(bundleDir8b)) : ''));
    assert(out.partial.dir === true,
      'NON-VACUITY: the partial record confirms the folder WAS created, so its absence above is an '
        + 'unwind rather than an early exit, got ' + JSON.stringify(out.partial));

    rollbackOutcomes.residue = { code: result.status, status: out.status, result: out.result,
      calls, partial: out.partial };
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// ---------------------------------------------------------------------------
// Test (8c): THE PAIR. Asserted in ONE place so the distinction cannot be flattened later by
// someone who is looking at only one of the two halves.
//
// The failure this guards against is not "8 is wrong" or "8b is wrong" — it is a future edit
// that makes them AGREE. Both answering deletes the one place on this surface where a surviving
// forge mutation is visible; both refusing puts a hard stop back in front of a clean world, which
// is the thing D5 removed. So the property is the CONTRAST, and it is stated as one assertion
// over both recorded outcomes.
// ---------------------------------------------------------------------------

(function testRollbackDiscriminatorPair() {
  console.log('Test (8c): the rollback pair — clean world ANSWERS, surviving forge residue REFUSES');
  const clean = rollbackOutcomes.clean;
  const residue = rollbackOutcomes.residue;
  assert(clean && residue, 'both rollback halves ran and recorded an outcome');
  if (!clean || !residue) return;

  assert(clean.result !== residue.result && clean.code !== residue.code,
    'THE DISCRIMINATOR: the two rollback worlds must NOT classify alike — clean='
      + JSON.stringify([clean.result, clean.code]) + ' residue=' + JSON.stringify([residue.result, residue.code]));
  assert(clean.result === 'answer' && clean.code === 0,
    'the CLEAN half answers at exit 0, got ' + JSON.stringify([clean.result, clean.code]));
  assert(residue.result === 'refuse' && residue.code === 1,
    'the RESIDUE half refuses at exit 1, got ' + JSON.stringify([residue.result, residue.code]));

  // ...and the world-state really is what separates them, not the status token. Same trigger,
  // same failed provision; the only difference either fixture introduced is whether the teardown
  // landed, so this is the causal claim rather than a restatement of the two statuses.
  assert(clean.labelsRemoved.includes('label-removed:42'),
    'the clean half really did take the label back off');
  assert(!residue.calls.includes('label-removed:42'),
    'the residue half really did leave the label on');
  assert(clean.partial == null && residue.partial != null,
    'partial-teardown evidence appears on exactly the half where the teardown failed — clean='
      + JSON.stringify(clean.partial) + ' residue=' + JSON.stringify(residue.partial));
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
// Test (#370): malformed --target-issues token refuses target_set_invalid_token (zero mutation)
// ---------------------------------------------------------------------------
(function testBundleInvalidToken() {
  console.log('Test (#370): --target-issues 42,4x,53 → target_set_invalid_token naming 4x');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  try {
    initGitRepo(tmpRoot);
    writeGhMockScript(binDir, { logFile: path.join(tmpRoot, 'gh.log'), openIssues: [42, 53] });
    const result = runClaim(['startup', '--target-issues', '42,4x,53', '--workflow-path', 'adaptive'], tmpRoot, binDir);
    const out = parseClaim(result);
    assert(out && out.status === 'target_set_invalid_token',
      '#370: 42,4x,53 → target_set_invalid_token, got ' + JSON.stringify(out && out.status));
    assert(out && /4x/.test(out.reasoning || ''),
      '#370: refusal echoes the offending token 4x, got ' + JSON.stringify(out && out.reasoning));
    assert(!fs.existsSync(path.join(tmpRoot, 'kaola-workflow', 'bundle-42-53')),
      '#370: invalid-token refusal creates no bundle folder (zero mutation)');
    assert(!fs.existsSync(path.join(tmpRoot, 'kaola-workflow', 'bundle-4-42-53')),
      '#370: 4x is NOT coerced to 4 (parseInt trap)');
  } finally { fs.rmSync(tmpRoot, { recursive: true, force: true }); }
})();

// ---------------------------------------------------------------------------
// Test (#370): --attest-planner-spawn back-fills the dispatch log on the bundle path
// ---------------------------------------------------------------------------
(function testBundleAttestPlannerSpawn() {
  console.log('Test (#370): --attest-planner-spawn back-fills dispatch-log.jsonl on the bundle path');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  try {
    initGitRepo(tmpRoot);
    writeRoadmapFile(tmpRoot, 42); writeRoadmapFile(tmpRoot, 47);
    writeGhMockScript(binDir, { logFile: path.join(tmpRoot, 'gh.log'), openIssues: [42, 47] });
    const result = runClaim(
      ['startup', '--target-issues', '42,47', '--workflow-path', 'adaptive', '--attest-planner-spawn'],
      tmpRoot, binDir
    );
    const out = parseClaim(result);
    assert(out && out.claim === 'acquired', '#370 attest: claim acquired, got ' + JSON.stringify(out && out.status));
    const logPath = path.join(tmpRoot, 'kaola-workflow', 'bundle-42-47', '.cache', 'dispatch-log.jsonl');
    assert(fs.existsSync(logPath), '#370 attest: dispatch-log.jsonl back-filled on the bundle path');
    assert(/workflow-planner/.test(fs.readFileSync(logPath, 'utf8')),
      '#370 attest: dispatch log carries a workflow-planner entry');
  } finally { fs.rmSync(tmpRoot, { recursive: true, force: true }); }
})();

// ---------------------------------------------------------------------------
// Test (#370): NATIVE=0 bundle creates the in-place branch + records base_branch + run_posture
// ---------------------------------------------------------------------------
(function testBundleInPlaceBranch() {
  console.log('Test (#370): NATIVE=0 bundle creates the in-place branch + records base_branch');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  try {
    initGitRepo(tmpRoot);
    writeRoadmapFile(tmpRoot, 42); writeRoadmapFile(tmpRoot, 47);
    writeGhMockScript(binDir, { logFile: path.join(tmpRoot, 'gh.log'), openIssues: [42, 47] });
    // treeDirty includes untracked files (same gate as claimProject) — commit the fixture so the
    // in-place dirty-gate sees a clean tree.
    G.git(tmpRoot, ['add', '-A'], { encoding: 'utf8' });
    G.git(tmpRoot, ['commit', '-m', 'fixture'], { encoding: 'utf8' });
    const result = runClaim(
      ['startup', '--target-issues', '42,47', '--workflow-path', 'adaptive'],
      tmpRoot, binDir, { KAOLA_WORKTREE_NATIVE: '0' }
    );
    const out = parseClaim(result);
    assert(out && out.claim === 'acquired', '#370 in-place: claim acquired, got ' + JSON.stringify(out));
    const state = readState(tmpRoot, 'bundle-42-47');
    assert(/^run_posture:\s*in-place\s*$/m.test(state || ''), '#370 in-place: state records run_posture: in-place');
    assert(/^base_branch:\s*main\s*$/m.test(state || ''), '#370 in-place: state records base_branch: main');
    const cur = G.git(tmpRoot, ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    assert(cur === out.branch, '#370 in-place: HEAD is on the created bundle branch ' + out.branch + ', got ' + cur);
  } finally { fs.rmSync(tmpRoot, { recursive: true, force: true }); }
})();

// ---------------------------------------------------------------------------
// Test (#370-B1): THE DIRTY-TREE CONSENT ASK ON THE BUNDLE PATH.
//
// `claimBundle` asks before creating an in-place branch over uncommitted work, exactly as
// `claimProject` does — and until now nothing pinned it on this path. Every consent pin was
// scalar-only, and the in-place bundle test directly above deliberately commits its fixture so
// the gate never fires, which is correct for what THAT test measures and is precisely why the
// gate could be deleted with this file green.
//
// It is the one claim-time stop that survives the Gate-1 demotion, and it is a stop about the
// USER'S OWN uncommitted work: an in-place branch would carry those changes onto it. Losing it
// silently is the shape that matters — no refusal disappears, no envelope changes, the claim just
// starts succeeding over work nobody agreed to move.
//
// The CLEAN control is what makes this a measurement rather than a restatement: the identical
// fixture, committed, claims normally. So the difference between the two arms is the dirt and
// nothing else — a fixture that had broken for some unrelated reason would fail the control too.
// ---------------------------------------------------------------------------
(function testBundleDirtyTreeConsentAsk() {
  console.log('Test (#370-B1): the bundle path asks before branching over uncommitted work');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  try {
    initGitRepo(tmpRoot);
    writeRoadmapFile(tmpRoot, 42); writeRoadmapFile(tmpRoot, 47);
    writeGhMockScript(binDir, { logFile: path.join(tmpRoot, 'gh.log'), openIssues: [42, 47] });
    // Commit the fixture, so the ONLY uncommitted thing in the tree is the file below. Without
    // this the roadmap files and the gh mock are themselves untracked and the arm would pass for
    // a reason it did not choose.
    G.git(tmpRoot, ['add', '-A'], { encoding: 'utf8' });
    G.git(tmpRoot, ['commit', '-m', 'fixture'], { encoding: 'utf8' });

    const headBefore = G.git(tmpRoot, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    const branchBefore = G.git(tmpRoot, ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    const branchesBefore = G.git(tmpRoot, ['branch', '--list'], { encoding: 'utf8' }).stdout.trim();

    // The user's uncommitted work. A tracked modification, not an untracked file: an in-place
    // `checkout -b` carries it onto the new branch, which is the thing being consented to.
    fs.writeFileSync(path.join(tmpRoot, 'README.md'), 'fixture\nuncommitted work the user has not agreed to move\n');

    const result = runClaim(
      ['startup', '--target-issues', '42,47', '--workflow-path', 'adaptive'],
      tmpRoot, binDir, { KAOLA_WORKTREE_NATIVE: '0' }
    );
    const out = parseClaim(result);

    assert(result.status === 1,
      '#370-B1: the dirty-tree ask exits non-zero — a caller reading exit 0 would take the claim '
      + 'as acquired, got ' + result.status);
    assert(out && out.result === 'consent' && out.consent_kind === 'disambiguation',
      '#370-B1: ...as a consent ASK, not a refusal — this is a value call about the user\'s own '
      + 'work, got ' + JSON.stringify(out && { result: out.result, consent_kind: out.consent_kind }));
    assert(out && out.claim === 'none',
      '#370-B1: ...and nothing was claimed, got ' + JSON.stringify(out && out.claim));
    assert(out && Array.isArray(out.options) && out.options.join(',') === 'commit,stash,worktree',
      '#370-B1: ...and the ask offers the three ways out, so the human is not left to invent one: '
      + JSON.stringify(out && out.options));
    assert(out && Array.isArray(out.issue_numbers) && out.issue_numbers.join(',') === '42,47',
      '#370-B1: ...naming the bundle it was about to claim, got ' + JSON.stringify(out && out.issue_numbers));

    // ZERO WRITES — the durable half, and the half a successor can check. The envelope promises
    // "no project folder, no branch, HEAD unmoved"; these are those three facts on disk.
    assert(!fs.existsSync(path.join(tmpRoot, 'kaola-workflow', 'bundle-42-47')),
      '#370-B1: ...no project folder was created');
    assert(G.git(tmpRoot, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim() === headBefore
      && G.git(tmpRoot, ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).stdout.trim() === branchBefore,
      '#370-B1: ...and HEAD is unmoved, still on ' + branchBefore);
    // Compared against the branch list CAPTURED BEFORE, not against a guessed name pattern. The
    // first version of this line asserted `!/wf\//` and survived deleting the very gate it was
    // meant to pin, because a bundle branch is not named `wf/...` — a negative match on a string
    // the artifact never contains is green by construction and pins nothing.
    const branchesAfter = G.git(tmpRoot, ['branch', '--list'], { encoding: 'utf8' }).stdout.trim();
    assert(branchesAfter === branchesBefore,
      '#370-B1: ...and no branch was created: expected ' + JSON.stringify(branchesBefore)
      + ', got ' + JSON.stringify(branchesAfter));

  } finally { fs.rmSync(tmpRoot, { recursive: true, force: true }); }

  // THE CONTROL, ON ITS OWN FIXTURE. Identical setup and identical command with the tree CLEAN:
  // the same claim acquires, so the arm above measured the dirt and not a broken fixture.
  //
  // A separate tmpRoot deliberately. Running it as a second claim in the same repo couples it to
  // the arm above: if the ask is ever lost, that arm ACQUIRES, and the control then hits an
  // already-owned bundle and fails for a reason that has nothing to do with what it checks. A
  // control that only works while the thing it controls for is working is not a control.
  const ctlRoot = makeTmpRoot();
  const ctlBin = path.join(ctlRoot, 'bin');
  try {
    initGitRepo(ctlRoot);
    writeRoadmapFile(ctlRoot, 42); writeRoadmapFile(ctlRoot, 47);
    writeGhMockScript(ctlBin, { logFile: path.join(ctlRoot, 'gh.log'), openIssues: [42, 47] });
    G.git(ctlRoot, ['add', '-A'], { encoding: 'utf8' });
    G.git(ctlRoot, ['commit', '-m', 'fixture'], { encoding: 'utf8' });
    const clean = parseClaim(runClaim(
      ['startup', '--target-issues', '42,47', '--workflow-path', 'adaptive'],
      ctlRoot, ctlBin, { KAOLA_WORKTREE_NATIVE: '0' }
    ));
    assert(clean && clean.claim === 'acquired',
      '#370-B1 control: with a CLEAN tree the identical bundle claim acquires — so the ask above '
      + 'is what the dirty arm measured, got ' + JSON.stringify(clean && clean.claim));
  } finally { fs.rmSync(ctlRoot, { recursive: true, force: true }); }
})();

// ---------------------------------------------------------------------------
// Test (9): the selection record on the BUNDLE lane.
//
// The bundle claim is the second entry into claimProject-shaped provisioning, and it is exactly
// the lane a no-target orchestrator survey produces (a same-scope bundle is the guarded exception
// the ranking rules allow). If the record is only wired into the scalar path, a bundle run loses
// its whole account of why it exists. Three properties, mirroring the scalar coverage in
// test-claim-hardening.js:
//   (a) an orchestrator-selected bundle claim with no --selection-record still CLAIMS, on the
//       canonical self-describing record, and reports that on the envelope;
//   (b) a plain (user-directed) bundle claim writes the canonical record + digest under the
//       bundle project name;
//   (c) kaola-workflow/.origin/<bundle-id>/ folds into <bundle-id>/.cache/origin/ and is removed.
// ---------------------------------------------------------------------------

(function testBundleSelectionRecordGate() {
  console.log('Test (9): the bundle lane carries the selection record + .origin fold');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  try {
    initGitRepo(tmpRoot);
    writeRoadmapFile(tmpRoot, 42);
    writeRoadmapFile(tmpRoot, 47);
    writeGhMockScript(binDir, { openIssues: [42, 47] });

    // (a) orchestrator-selected, no record → claims anyway, on the canonical record, and says so.
    const noRecord = runClaim(
      ['startup', '--target-issues', '42,47', '--target-source', 'orchestrator_selected'],
      tmpRoot, binDir
    );
    const noRecordOut = parseClaim(noRecord);
    assert(noRecord.status === 0, 'bundle: a claim with no selection record answers at exit 0, got ' + noRecord.status);
    assert(noRecordOut && noRecordOut.claim === 'acquired',
      'bundle: an orchestrator-selected bundle claim without --selection-record still acquires, got '
        + JSON.stringify(noRecordOut)
        + '\nstdout: ' + noRecord.stdout + '\nstderr: ' + noRecord.stderr);
    const synthesized = path.join(tmpRoot, 'kaola-workflow', 'bundle-42-47', '.cache', 'origin', 'selection-record.json');
    let synthRec = null; try { synthRec = JSON.parse(fs.readFileSync(synthesized, 'utf8')); } catch (_) {}
    assert(synthRec && synthRec.selection_mode === 'none-recorded',
      'bundle: the record written in place of the missing one must SAY it recorded nothing, got '
        + JSON.stringify(synthRec && synthRec.selection_mode));
    assert(noRecordOut && typeof noRecordOut.selection_record_note === 'string'
      && noRecordOut.selection_record_note.indexOf('orchestrator_selected') >= 0,
      'bundle: the envelope must REPORT that no record came with the claim, got '
        + JSON.stringify(noRecordOut && noRecordOut.selection_record_note));
    fs.rmSync(path.join(tmpRoot, 'kaola-workflow', 'bundle-42-47'), { recursive: true, force: true });

    // (b)+(c) a user-directed bundle claim: canonical record + digest, and the staging fold.
    const staging = path.join(tmpRoot, 'kaola-workflow', '.origin', 'bundle-42-47');
    fs.mkdirSync(staging, { recursive: true });
    fs.writeFileSync(path.join(staging, 'survey.md'), '# pre-claim recon\n');

    const result = runClaim(
      ['startup', '--target-issues', '42,47', '--workflow-path', 'adaptive'],
      tmpRoot, binDir
    );
    const out = parseClaim(result);
    assert(out && out.claim === 'acquired',
      'bundle: a user-directed bundle claim still acquires, got ' + JSON.stringify(out)
        + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);

    const recPath = path.join(tmpRoot, 'kaola-workflow', 'bundle-42-47', '.cache', 'origin', 'selection-record.json');
    assert(fs.existsSync(recPath),
      'bundle: the bundle claim must write the canonical record at ' + recPath);
    let rec = null; try { rec = JSON.parse(fs.readFileSync(recPath, 'utf8')); } catch (_) {}
    assert(rec && rec.selection_mode === 'explicit-target',
      'bundle: the canonical bundle record carries selection_mode: explicit-target, got '
        + JSON.stringify(rec && rec.selection_mode));
    const state = readState(tmpRoot, 'bundle-42-47') || '';
    assert(/^selection_record_digest:\s*[0-9a-f]{64}\s*$/m.test(state),
      'bundle: the bundle state must stamp selection_record_digest, got:\n' + state);

    assert(fs.existsSync(path.join(tmpRoot, 'kaola-workflow', 'bundle-42-47', '.cache', 'origin', 'survey.md')),
      'bundle: kaola-workflow/.origin/<bundle-id>/ must fold into <bundle-id>/.cache/origin/');
    assert(!fs.existsSync(staging),
      'bundle: the staging dir must be REMOVED after the fold, still at ' + staging);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// ===========================================================================
// Test (11): THE TWIN RULE — a `target_set_X` classifies and exits exactly like its scalar
// twin `X`.
//
// This replaces what would otherwise be nine hand-written token pins. A pin per token cannot
// catch the failure the rule exists to prevent: a NEW `target_set_*` token added to the emission
// sites and not to the map. `claimResult` returns null for such a token, `claimExitCode`
// fail-closes it to 1, and the envelope goes out carrying `result: null` — a bundle lane silently
// classifying a fact as a HARD STOP that the scalar lane calls act-on-it. No existing pin moves.
//
// TWO ARMS.
//
//   STRUCTURAL — the map, the scalar table and the emission sites are three independently
//   authored lists, and the rule is a set relation over them. This is where "added to one half
//   only" dies. Read as DATA (the literals are evaluated out of the production source, never
//   transcribed), so a table edit is picked up without touching this file.
//
//   DRIVEN — for every pair both lanes can reach, the real CLI is run on BOTH sides and the
//   emitted `result` and exit code are compared to each other. This is what makes the structural
//   arm mean something: it proves the map is the thing the surface actually consults, rather than
//   a table that agrees with itself.
//
// WHAT IS NOT DRIVEN, and why — stated rather than silently omitted:
//   * `target_set_empty` — UNREACHABLE from the CLI. `cmdStartup` routes to `claimExplicitBundle`
//     only when `--target-issues` parsed to a non-empty array, so the empty arm answers only to a
//     direct call. It is driven IN-PROCESS against the exported function instead (result only).
//   * `user_target_closed` — its exit code is not observable anywhere. The only surface that
//     emits it is `cmdClaim`, which calls `output()` with no code and therefore always exits 0
//     regardless of `claimExitCode`. Its `result` IS driven; its exit code is structural only.
//   * `target_set_red` — no hermetic trigger found: the bundle loop probes issue state BEFORE it
//     classifies, so a closed member takes the `target_set_has_closed_issue` arm and the
//     classifier's `red` verdict is not reachable through this fixture harness. Structural only.
// ===========================================================================

(function testTwinRule() {
  console.log('Test (11): the twin rule — every target_set_X classifies and exits like its scalar twin X');

  // --- the two tables, as DATA out of the production source. -------------------------------
  // Evaluating the literal is deliberate: a hand-transcribed copy here would be a second
  // authoring surface for the very rule that exists to have only one.
  const claimSrc = fs.readFileSync(claimScript, 'utf8');
  function literalAfter(name) {
    const marker = 'const ' + name + ' = ';
    const start = claimSrc.indexOf(marker);
    if (start < 0) return null;
    const from = start + marker.length;
    // Balance parentheses from `Object.freeze(` to its close; the values hold no parens.
    let depth = 0;
    for (let i = from; i < claimSrc.length; i++) {
      const ch = claimSrc[i];
      if (ch === '(') depth++;
      else if (ch === ')') { depth--; if (depth === 0) return claimSrc.slice(from, i + 1); }
    }
    return null;
  }
  let TWINS = null;
  let SCALARS = null;
  try {
    TWINS = new Function('return ' + literalAfter('TARGET_SET_TWINS'))();
    SCALARS = new Function('return ' + literalAfter('CLAIM_SCALAR_RESULTS'))();
  } catch (e) { /* asserted below */ }

  // NON-VACUITY. Every assertion below is a set relation, and a set relation over an empty set
  // is trivially true — so the read itself is checked first. The floors are deliberately LOOSE:
  // they exist to catch a parse that silently returned nothing, not to pin today's token count.
  // A count pin here would red on a legitimate token retirement, which is a tax on subtraction.
  assert(TWINS && typeof TWINS === 'object' && Object.keys(TWINS).length >= 5,
    'the twin map was read as data from ' + path.basename(claimScript) + ', got '
      + JSON.stringify(TWINS && Object.keys(TWINS)));
  assert(SCALARS && typeof SCALARS === 'object' && Object.keys(SCALARS).length >= 5,
    'the scalar result table was read as data, got ' + JSON.stringify(SCALARS && Object.keys(SCALARS)));
  if (!TWINS || !SCALARS) return;

  // --- ARM 1 (structural): the three lists agree. -------------------------------------------
  // Every `target_set_*` token this surface can EMIT. `claimAnswer` is the ONE constructor for a
  // non-acquiring bundle envelope, so its call sites are the emission set by construction.
  const emitted = new Set();
  const re = /claimAnswer\(\s*'([a-z_]+)'/g;
  let m;
  while ((m = re.exec(claimSrc)) !== null) emitted.add(m[1]);
  assert(emitted.size >= 7,
    'NON-VACUITY: the emission-site scan found ' + emitted.size + ' tokens — it is looking in the wrong place');

  for (const token of emitted) {
    assert(Object.prototype.hasOwnProperty.call(TWINS, token),
      'ADDED TO ONE HALF ONLY: `' + token + '` is emitted by the claim surface but has NO entry in '
        + 'TARGET_SET_TWINS. claimResult returns null for it, claimExitCode fail-closes it to 1, and '
        + 'the envelope ships `result: null` — a bundle lane calling a fact a HARD STOP that the '
        + 'scalar lane acts on. Add the entry, do not add a pin.');
  }
  for (const token of Object.keys(TWINS)) {
    assert(emitted.has(token),
      'DEAD TWIN ENTRY: TARGET_SET_TWINS names `' + token + '` but nothing emits it. A map row for a '
        + 'token that does not ship is a rule about nothing — delete the row.');
    const entry = TWINS[token];
    if (entry.twin === null) continue;
    assert(Object.prototype.hasOwnProperty.call(SCALARS, entry.twin),
      '`' + token + '` names the twin `' + entry.twin + '`, which is not in CLAIM_SCALAR_RESULTS — '
        + 'the derivation resolves to null and the token fail-closes.');
  }

  // The carve-out is a property of the DATA, not a comment: exactly one token may opt out of the
  // rule, and it must be the one where a forge mutation survives the report (Test 8b drives it).
  const twinless = Object.keys(TWINS).filter(t => TWINS[t].twin === null);
  assert(twinless.length === 1 && twinless[0] === 'target_set_label_rollback_failed',
    'exactly ONE token may carry `twin: null` (the one whose forge mutation outlives the answer), got '
      + JSON.stringify(twinless));
  assert(TWINS.target_set_label_rollback_failed.result === 'refuse',
    'and the twinless token authors its own result: refuse, got '
      + JSON.stringify(TWINS.target_set_label_rollback_failed.result));

  // --- the driven vehicle. -------------------------------------------------------------------
  // Reuses runClaim (one spawn site for the whole file); each scenario owns a throwaway repo.
  function drive(scenario) {
    const tmpRoot = makeTmpRoot();
    const binDir = path.join(tmpRoot, 'bin');
    try {
      initGitRepo(tmpRoot);
      for (const n of scenario.roadmap || []) writeRoadmapFile(tmpRoot, n);
      for (const f of scenario.folders || []) {
        const p = path.join(tmpRoot, 'kaola-workflow', f.project);
        fs.mkdirSync(p, { recursive: true });
        fs.writeFileSync(path.join(p, 'workflow-state.md'),
          'name: ' + f.project + '\nissue_number: ' + f.issue + '\nstatus: ' + f.status + '\nphase: 2\n');
      }
      if (scenario.gh) writeGhMockScript(binDir, scenario.gh);
      const r = runClaim(scenario.argv, tmpRoot, binDir, scenario.env);
      const out = parseClaim(r);
      // The token rides on `status` almost everywhere, but the no-target answer is emitted as a
      // bare `verdict` with no `status` at all. Reading only `status` there yields undefined, and
      // two undefineds compare EQUAL — the comparison would have passed for the wrong reason.
      return { code: r.status, status: out && (out.status || out.verdict), result: out && out.result,
        stdout: r.stdout, stderr: r.stderr };
    } finally { fs.rmSync(tmpRoot, { recursive: true, force: true }); }
  }

  // Each row: [bundle token, scalar twin, bundle scenario, scalar scenario, compareExit].
  // `compareExit: false` marks a pair whose scalar side emits from a surface that never applies
  // claimExitCode — the result correspondence is still real, the exit-code half is not observable.
  const OPEN = { openIssues: [42, 47] };
  const PAIRS = [
    ['target_set_invalid_token', 'no_target',
      { argv: ['startup', '--target-issues', '42,4x'], roadmap: [42] },
      { argv: ['startup'], roadmap: [42] }, true],
    ['target_set_unavailable', 'target_unavailable',
      { argv: ['startup', '--target-issues', '42,47'], roadmap: [42, 47], gh: { viewFails: true } },
      { argv: ['startup', '--target-issue', '42'], roadmap: [42], gh: { viewFails: true } }, true],
    ['target_set_unverified', 'target_unverified',
      { argv: ['startup', '--target-issues', '42,47'], env: { KAOLA_WORKFLOW_OFFLINE: '1' } },
      { argv: ['startup', '--target-issue', '42'], env: { KAOLA_WORKFLOW_OFFLINE: '1' } }, true],
    ['target_set_conflicts_active_work', 'target_occupied',
      { argv: ['startup', '--target-issues', '42,47'], roadmap: [42, 47], gh: OPEN,
        folders: [{ project: 'issue-42', issue: 42, status: 'in_progress' }] },
      // The scalar twin needs a folder that readActiveFolders SKIPS (so the claim is not `owned`)
      // whose state file nonetheless survives — that is the EEXIST arm that emits target_occupied.
      { argv: ['startup', '--target-issue', '42'], roadmap: [42], gh: OPEN,
        folders: [{ project: 'issue-42', issue: 42, status: 'released' }] }, true],
    ['target_set_has_closed_issue', 'user_target_closed',
      { argv: ['startup', '--target-issues', '42,47'], roadmap: [42, 47], gh: { openIssues: [42], closedIssues: [47] } },
      // `startup --target-issue` classifies a closed issue as user_target_red before it can reach
      // this arm, so the twin is driven through `claim`, which is the only surface that emits it.
      { argv: ['claim', '--project', 'issue-47', '--issue', '47'], roadmap: [47], gh: { closedIssues: [47] } }, false],
  ];

  let drivenPairs = 0;
  for (const [bundleToken, scalarToken, bundleScenario, scalarScenario, compareExit] of PAIRS) {
    const entry = TWINS[bundleToken];
    assert(entry && entry.twin === scalarToken,
      'fixture drift: TARGET_SET_TWINS says `' + bundleToken + '` twins `'
        + (entry && entry.twin) + '`, this row drives `' + scalarToken + '`');
    if (!entry || entry.twin !== scalarToken) continue;

    const b = drive(bundleScenario);
    const s = drive(scalarScenario);
    // The fixtures must actually have produced the tokens under test; otherwise the comparison
    // below is between two unrelated envelopes and passes for the wrong reason.
    assert(b.status === bundleToken,
      'fixture: the bundle lane produced ' + JSON.stringify(b.status) + ', expected ' + bundleToken
        + '\nstdout: ' + b.stdout + '\nstderr: ' + b.stderr);
    assert(s.status === scalarToken,
      'fixture: the scalar lane produced ' + JSON.stringify(s.status) + ', expected ' + scalarToken
        + '\nstdout: ' + s.stdout + '\nstderr: ' + s.stderr);
    if (b.status !== bundleToken || s.status !== scalarToken) continue;

    assert(b.result === s.result,
      'THE TWIN RULE (result): `' + bundleToken + '` emitted result=' + JSON.stringify(b.result)
        + ' but its scalar twin `' + scalarToken + '` emitted ' + JSON.stringify(s.result)
        + '. A fact does not change its classification because it was asked about three issues '
        + 'instead of one.');
    if (compareExit) {
      assert(b.code === s.code,
        'THE TWIN RULE (exit code): `' + bundleToken + '` exited ' + b.code + ' but its scalar twin `'
          + scalarToken + '` exited ' + s.code + '.');
    }
    drivenPairs++;
  }

  // NON-VACUITY on the driven arm itself: a fixture regression that quietly stopped reaching the
  // tokens would leave every assertion above unexecuted and this test reading green.
  assert(drivenPairs === PAIRS.length,
    'DRIVEN COVERAGE: expected all ' + PAIRS.length + ' twin pairs to be exercised on BOTH lanes, got '
      + drivenPairs);

  // --- `target_set_empty`: driven in-process, because the CLI cannot reach it. ---------------
  const claimApi = require('./kaola-workflow-claim.js');
  const emptyEnvelope = claimApi.claimExplicitBundle(os.tmpdir(), { targetIssues: [] });
  assert(emptyEnvelope && emptyEnvelope.status === 'target_set_empty',
    'fixture: the empty bundle arm produced ' + JSON.stringify(emptyEnvelope && emptyEnvelope.status));
  assert(emptyEnvelope && emptyEnvelope.result === SCALARS[TWINS.target_set_empty.twin],
    'THE TWIN RULE (result): `target_set_empty` emitted ' + JSON.stringify(emptyEnvelope && emptyEnvelope.result)
      + ' but its twin `' + TWINS.target_set_empty.twin + '` is '
      + JSON.stringify(SCALARS[TWINS.target_set_empty.twin]));

  // --- the ONE deliberate deviation, stated as such. -----------------------------------------
  // `route` replaces the twin's result with a strictly MORE specific non-stopping answer. It is
  // not an exception to the exit rule: `escalate` is an answer, so the exit code is unchanged.
  const routed = Object.keys(TWINS).filter(t => TWINS[t].route);
  assert(routed.length === 1 && routed[0] === 'target_set_indeterminate',
    'exactly one token may override its twin with a `route`, got ' + JSON.stringify(routed));
  for (const t of routed) {
    assert(TWINS[t].route !== 'refuse' && TWINS[t].route !== 'consent',
      '`' + t + '` routes to ' + JSON.stringify(TWINS[t].route) + ' — a route may only make an answer '
        + 'MORE specific, never turn it into a stop.');
    assert(SCALARS[TWINS[t].twin] === 'answer',
      'and its twin `' + TWINS[t].twin + '` answers, so the exit code is unchanged by the route, got '
        + JSON.stringify(SCALARS[TWINS[t].twin]));
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
