#!/usr/bin/env node
'use strict';

// Unit tests for bundle state parsing + active-folder overlap detection (issue #328)
// Hand-rolled assert + counter; repo style (no framework) — mirrors
// test-adaptive-node.js.
//
// SCOPE: state-foundation node (tdd-guide) — Phase-1 foundation:
//   (a) parseStateFile reads issue_numbers into an array
//   (b) old single-issue state file yields issue_numbers: [] and unchanged scalar issue_number (AC#1 regression)
//   (c) classifier/active-folder overlap blocks a member of a live bundle (exit code 2)
//   (d) a non-member issue is NOT blocked (exit code 0)
//
// The classifier's OTHER blocking door — the ONLINE remote-claim block — is pinned beside (c)/(d)
// because this is where the suite already drives `kaola-workflow-classifier.js classify`:
//   (e) a claim held by the workflow:in-progress LABEL names the label
//   (f) a claim held by a kw:claim MARKER comment names the marker
//   (g) control: a marker older than 24h with no label does not block at all
//
// All fixtures are written to $TMPDIR (mkdtempSync) — NOTHING is written inside
// the repo's kaola-workflow/ tree (the per-node barrier checks write-set containment
// against the 5 declared files; a stray repo write trips it).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

// Hermetic HOME — the shared ~/.config/kaola-workflow/config.json (os.homedir()) is user-owned; point
// HOME/USERPROFILE at a throwaway sandbox so no spawned subprocess reads or writes the developer's
// real one. Nothing is seeded: an absent config is the shape a fresh machine has.
const kwSandboxHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sandbox-home-'));
process.env.HOME = kwSandboxHome;
process.env.USERPROFILE = kwSandboxHome;

const repoRoot = path.resolve(__dirname, '..');
const activeFoldersScript = path.join(repoRoot, 'scripts', 'kaola-workflow-active-folders.js');
const classifierScript = path.join(repoRoot, 'scripts', 'kaola-workflow-classifier.js');

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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kw-bundle-state-'));
}

function writeProject(tmpRoot, project, stateContent) {
  const dir = path.join(tmpRoot, 'kaola-workflow', project);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'workflow-state.md'), stateContent);
}

function writeRoadmapFile(tmpRoot, issueNum) {
  const dir = path.join(tmpRoot, 'kaola-workflow', '.roadmap');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'issue-' + issueNum + '.md'), '# Issue ' + issueNum + '\n');
}

function runActivefolders(tmpRoot) {
  const result = spawnSync(process.execPath, [activeFoldersScript], {
    cwd: tmpRoot,
    encoding: 'utf8',
    env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' })
  });
  if (result.error) throw result.error;
  return result;
}

function runClassifier(tmpRoot, issueNum) {
  const result = spawnSync(
    process.execPath,
    [classifierScript, 'classify', '--issue', String(issueNum)],
    {
      cwd: tmpRoot,
      encoding: 'utf8',
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' })
    }
  );
  if (result.error) throw result.error;
  return result;
}

// ---------------------------------------------------------------------------
// Fixture state file contents
// ---------------------------------------------------------------------------

// A bundle state file for project bundle-42-47-53 with primary #42
const BUNDLE_STATE = [
  'name: bundle-42-47-53',
  'phase: 1',
  'status: active',
  'issue_number: 42',
  'issue_numbers: 42,47,53',
  'bundle_id: bundle-42-47-53',
  'closure_policy: all_or_nothing',
  'branch: workflow/bundle-42-47-53',
  'sink: merge',
  'next_command: /kaola-workflow-plan-run',
  ''
].join('\n');

// An old single-issue state file — no issue_numbers/bundle_id/closure_policy lines
const SINGLE_ISSUE_STATE = [
  'name: issue-99',
  'phase: 2',
  'status: active',
  'issue_number: 99',
  'branch: workflow/issue-99',
  'sink: merge',
  'next_command: /kaola-workflow-plan-run',
  ''
].join('\n');

// ---------------------------------------------------------------------------
// Test (a): parseStateFile reads issue_numbers into an array
// ---------------------------------------------------------------------------

(function testBundleStateParsing() {
  console.log('Test (a): parseStateFile reads issue_numbers into an array');
  const tmpRoot = makeTmpRoot();
  try {
    writeProject(tmpRoot, 'bundle-42-47-53', BUNDLE_STATE);
    const result = runActivefolders(tmpRoot);
    assert(result.status === 0, 'active-folders exits 0; got ' + result.status + '\nstderr: ' + result.stderr);

    let folders;
    try { folders = JSON.parse(result.stdout); } catch (e) { assert(false, 'active-folders output is not valid JSON: ' + result.stdout); return; }

    assert(Array.isArray(folders), 'active-folders returns an array');
    assert(folders.length === 1, 'expected 1 folder, got ' + folders.length);

    const folder = folders[0];
    assert(folder.project === 'bundle-42-47-53', 'project name matches');
    assert(folder.issue_number === 42, 'issue_number (primary) is 42, got ' + folder.issue_number);
    assert(Array.isArray(folder.issue_numbers), 'issue_numbers is an array, got ' + typeof folder.issue_numbers);
    assert(folder.issue_numbers.length === 3, 'issue_numbers has 3 members, got ' + folder.issue_numbers.length);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// ---------------------------------------------------------------------------
// Test (b): old single-issue state file yields issue_numbers: [] and unchanged scalar issue_number (AC#1 regression)
// ---------------------------------------------------------------------------

(function testSingleIssueRegression() {
  console.log('Test (b): single-issue state file yields issue_numbers: [] (AC#1 regression)');
  const tmpRoot = makeTmpRoot();
  try {
    writeProject(tmpRoot, 'issue-99', SINGLE_ISSUE_STATE);
    const result = runActivefolders(tmpRoot);
    assert(result.status === 0, 'active-folders exits 0; got ' + result.status + '\nstderr: ' + result.stderr);

    let folders;
    try { folders = JSON.parse(result.stdout); } catch (e) { assert(false, 'active-folders output is not valid JSON: ' + result.stdout); return; }

    assert(Array.isArray(folders), 'active-folders returns an array');
    assert(folders.length === 1, 'expected 1 folder, got ' + folders.length);

    const folder = folders[0];
    assert(folder.project === 'issue-99', 'project name is issue-99');
    assert(folder.issue_number === 99, 'scalar issue_number is 99 (unchanged)');
    assert(Array.isArray(folder.issue_numbers), 'issue_numbers is an array for old state file');
    assert(folder.issue_numbers.length === 0, 'issue_numbers is empty [] for old state file, got length ' + folder.issue_numbers.length);
    // bundle_id and closure_policy should be empty strings (absent fields)
    assert(folder.bundle_id === '' || folder.bundle_id == null, 'bundle_id is absent for single-issue folder');
    assert(folder.closure_policy === '' || folder.closure_policy == null, 'closure_policy is absent for single-issue folder');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// ---------------------------------------------------------------------------
// Test (c): classifier blocks a member of a live bundle (exit code 2)
// ---------------------------------------------------------------------------

(function testClassifierBlocksBundleMember() {
  console.log('Test (c): classifier blocks issue #47 (member of live bundle [42,47,53])');
  const tmpRoot = makeTmpRoot();
  try {
    writeProject(tmpRoot, 'bundle-42-47-53', BUNDLE_STATE);
    // The classifier in OFFLINE mode needs a roadmap file to NOT return target_unverified
    // but the bundle-member block should happen BEFORE the roadmap check (exit code 2 = no stdout)
    const result = runClassifier(tmpRoot, 47);
    assert(result.status === 2, 'classifier exits 2 (blocked) for bundle member #47, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(result.stdout.trim() === '', 'classifier emits no stdout when blocked (exit 2), got: ' + result.stdout);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// ---------------------------------------------------------------------------
// Test (d): a non-member issue is NOT blocked (exit code 0)
// ---------------------------------------------------------------------------

(function testClassifierDoesNotBlockNonMember() {
  console.log('Test (d): classifier does NOT block issue #77 (non-member)');
  const tmpRoot = makeTmpRoot();
  try {
    writeProject(tmpRoot, 'bundle-42-47-53', BUNDLE_STATE);
    // Write a roadmap file so OFFLINE classifier can evaluate (without it → target_unverified)
    writeRoadmapFile(tmpRoot, 77);
    const result = runClassifier(tmpRoot, 77);
    // Non-member should NOT get exit code 2 (blocked). It may get 0 with green/yellow verdict.
    assert(result.status !== 2, 'classifier does NOT return exit 2 for non-member #77, got ' + result.status);
    // status 0 with some JSON output expected (target_unverified, green, or yellow)
    assert(result.status === 0, 'classifier exits 0 for non-member #77, got ' + result.status + '\nstderr: ' + result.stderr);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// The orient-driven bundle-coherence scenarios stood here. They drove
// `kaola-workflow-adaptive-node.js orient` and asserted a `bundle_state_incoherent` refusal —
// a subcommand and a refusal class that both no longer exist. Deleted with their mechanism.


// ---------------------------------------------------------------------------
// Tests (e)/(f)/(g): a remote-claim BLOCK must name WHICH artifact holds the claim
// ---------------------------------------------------------------------------
//
// Tests (c)/(d) above pin the OTHER blocking door — the local active-folder/bundle overlap, which
// exits 2 with no stdout. This block pins the ONLINE door beside it: `blocked` is
// `label OR marker`, and both arms emitted the SAME undiscriminating sentence
// ("issue #N has a remote workflow claim"), so an operator reading it could not tell which of two
// artifacts to go and clear. The two are not interchangeable:
//
//   * the `workflow:in-progress` LABEL has no expiry anywhere — it blocks forever;
//   * the `kw:claim` MARKER comment expires 24h after its `updated_at`.
//
// The caller already knows which fired: the label is evaluated FIRST and short-circuits, so when
// it is present the marker probe never runs. Nothing about the probe signatures has to change for
// the message to say so.
//
// WHAT IS PINNED — the RESULT, not a wording. Each arm's `reasoning` names its OWN artifact by the
// token an operator would search for, and the two arms do not emit the same sentence. A message
// that names both artifacts on both arms satisfies the two contains-checks and fails the
// differ-check, which is the near-miss this exists to catch. Asserted against the JSON the
// classifier subprocess actually emitted — never a string reconstructed here.
//
// BOTH ARMS DRIVE THE SAME ISSUE NUMBER, deliberately. The undiscriminating sentence interpolates
// the issue number, so two arms on two numbers differ ALREADY — the differ-check would have been
// green at HEAD and pinned nothing. Same number, so at HEAD the two strings are byte-identical.
//
// ONLINE, so KAOLA_WORKFLOW_OFFLINE is REMOVED from the child env (the classifier captures it at
// module load) and `gh` is routed at a per-case mock written OUTSIDE the fixture repo.

const CLAIM_LABEL_TOKEN = 'workflow:in-progress';   // the exact label the classifier matches
const CLAIM_MARKER_TOKEN = 'kw:claim';              // the exact marker the classifier greps for

// A gh mock answering the three calls the online classify path makes: the issue fetch, the
// repo-identity probe behind the comment fetch, and the comment fetch itself.
function writeGhMock(dir, labels, comments) {
  const mockPath = path.join(dir, 'gh-mock.js');
  fs.writeFileSync(mockPath, [
    'const a = process.argv.slice(2);',
    'const labels = ' + JSON.stringify(labels) + ';',
    'const comments = ' + JSON.stringify(comments) + ';',
    "if (a[0] === 'issue' && a[1] === 'view') {",
    "  process.stdout.write(JSON.stringify({ number: parseInt(a[2], 10), title: 'fixture', body: '', labels: labels, state: 'OPEN' }));",
    "} else if (a[0] === 'repo' && a[1] === 'view') {",
    "  process.stdout.write(JSON.stringify({ owner: { login: 'kw-fixture' }, name: 'repo' }));",
    "} else if (a[0] === 'api') {",
    '  process.stdout.write(JSON.stringify(comments));',
    '} else {',
    "  process.stdout.write('');",
    '}',
  ].join('\n'));
  return mockPath;
}

// A fixture repo of its own (`git init -b main`) so the classifier's `git rev-parse --show-toplevel`
// resolves HERE and never at the repository this suite lives in. The mock lives in a sibling dir,
// outside the repo, so nothing under test ever sees it as tree content.
function runClassifierOnline(issueNum, labels, comments) {
  const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-claim-artifact-'));
  const root = path.join(outer, 'repo');
  const binDir = path.join(outer, 'bin');
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });
  try {
    // spawn-class: environment
    spawnSync('git', ['init', '-b', 'main'], { cwd: root, encoding: 'utf8' });
    const env = Object.assign({}, process.env, {
      KAOLA_GH_MOCK_SCRIPT: writeGhMock(binDir, labels, comments),
      KAOLA_CLASSIFIER_BACKOFF_MS: '0',
    });
    delete env.KAOLA_WORKFLOW_OFFLINE;
    // spawn-class: cli-contract
    const result = spawnSync(
      process.execPath,
      [classifierScript, 'classify', '--issue', String(issueNum)],
      { cwd: root, encoding: 'utf8', env }
    );
    if (result.error) throw result.error;
    let json = null;
    try { json = JSON.parse(String(result.stdout).trim()); } catch (_) {}
    return { result, json };
  } finally {
    fs.rmSync(outer, { recursive: true, force: true });
  }
}

const freshMarker = [{
  body: '<!-- kw:claim project=issue-501 sess=abc -->',
  updated_at: new Date().toISOString()
}];

let labelBlockedReasoning = null;
let markerBlockedReasoning = null;

// ---------------------------------------------------------------------------
// Test (e): the LABEL arm names the label
// ---------------------------------------------------------------------------

(function testLabelBlockNamesTheLabel() {
  console.log('Test (e): a label-held claim names the ' + CLAIM_LABEL_TOKEN + ' label');
  // No comments at all: the marker probe cannot be what produced this block even if it ran.
  const { result, json } = runClassifierOnline(501, [{ name: CLAIM_LABEL_TOKEN }], []);
  assert(result.status === 0, 'classifier exits 0 on the label arm, got ' + result.status
    + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
  // Liveness: a fixture that stopped reaching the emitter reds HERE rather than passing vacuously
  // through the message assertions behind it.
  assert(json && json.verdict === 'blocked',
    'label arm must still reach the blocked emitter, got ' + JSON.stringify(json));
  const reasoning = String((json && json.reasoning) || '');
  labelBlockedReasoning = reasoning;
  assert(reasoning.includes(CLAIM_LABEL_TOKEN),
    'a label-held claim must NAME the label an operator has to remove — the label never expires, '
    + 'so "has a remote workflow claim" sends them looking for a marker that is not there; got: '
    + JSON.stringify(reasoning));
})();

// ---------------------------------------------------------------------------
// Test (f): the MARKER arm names the marker
// ---------------------------------------------------------------------------

(function testMarkerBlockNamesTheMarker() {
  console.log('Test (f): a marker-held claim names the ' + CLAIM_MARKER_TOKEN + ' marker comment');
  // No label at all: the label arm cannot be what produced this block. Same issue number as test
  // (e) — see the header: a different number makes the differ-check below pass for free.
  const { result, json } = runClassifierOnline(501, [], freshMarker);
  assert(result.status === 0, 'classifier exits 0 on the marker arm, got ' + result.status
    + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
  assert(json && json.verdict === 'blocked',
    'marker arm must still reach the blocked emitter, got ' + JSON.stringify(json));
  const reasoning = String((json && json.reasoning) || '');
  markerBlockedReasoning = reasoning;
  assert(reasoning.includes(CLAIM_MARKER_TOKEN),
    'a marker-held claim must NAME the marker comment — it expires 24h after its updated_at, and '
    + 'that is the whole difference from the label; got: ' + JSON.stringify(reasoning));
  // The discrimination itself, bound to the two arms' own emitted strings: one sentence for both
  // artifacts is exactly the message #936's reporter could not act on.
  assert(labelBlockedReasoning !== null && markerBlockedReasoning !== labelBlockedReasoning,
    'the label arm and the marker arm must not emit the SAME sentence; both got: '
    + JSON.stringify(markerBlockedReasoning));
})();

// ---------------------------------------------------------------------------
// Test (g): positive control — an EXPIRED marker with no label does not block
// ---------------------------------------------------------------------------

(function testAgedMarkerDoesNotBlock() {
  console.log('Test (g): control — a >24h ' + CLAIM_MARKER_TOKEN + ' marker with no label acquires');
  const aged = [{
    body: '<!-- kw:claim project=issue-503 sess=abc -->',
    updated_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
  }];
  const { result, json } = runClassifierOnline(503, [], aged);
  assert(result.status === 0, 'classifier exits 0 on the aged-marker control, got ' + result.status
    + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
  // Without this the two arms above could both be blocking for some reason the fixture supplies
  // incidentally rather than the artifact each one plants.
  assert(json && json.verdict !== 'blocked',
    'a marker older than 24h with no label must NOT block — this control is what proves tests (e) '
    + 'and (f) block BECAUSE of the artifact each plants; got ' + JSON.stringify(json));
})();


// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('');
if (failed > 0) {
  console.error('test-bundle-state: ' + failed + ' test(s) FAILED, ' + passed + ' passed');
  process.exit(1);
} else {
  console.log('test-bundle-state: all ' + passed + ' tests passed');
  process.exit(0);
}
