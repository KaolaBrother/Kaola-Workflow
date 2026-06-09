#!/usr/bin/env node
'use strict';

// Unit tests for bundle state parsing + active-folder overlap detection (issue #328)
// Hand-rolled assert + counter; repo style (no framework) — mirrors
// test-adaptive-node.js / test-parallel-batch.js.
//
// SCOPE: state-foundation node (tdd-guide) — Phase-1 foundation:
//   (a) parseStateFile reads issue_numbers into an array
//   (b) old single-issue state file yields issue_numbers: [] and unchanged scalar issue_number (AC#1 regression)
//   (c) classifier/active-folder overlap blocks a member of a live bundle (exit code 2)
//   (d) a non-member issue is NOT blocked (exit code 0)
//
// All fixtures are written to $TMPDIR (mkdtempSync) — NOTHING is written inside
// the repo's kaola-workflow/ tree (the per-node barrier checks write-set containment
// against the 5 declared files; a stray repo write trips it).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

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
  'next_command: /kaola-workflow-phase2',
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
  'next_command: /kaola-workflow-phase3',
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
    assert(folder.issue_numbers[0] === 42, 'issue_numbers[0] is 42');
    assert(folder.issue_numbers[1] === 47, 'issue_numbers[1] is 47');
    assert(folder.issue_numbers[2] === 53, 'issue_numbers[2] is 53');
    assert(folder.bundle_id === 'bundle-42-47-53', 'bundle_id is bundle-42-47-53, got ' + folder.bundle_id);
    assert(folder.closure_policy === 'all_or_nothing', 'closure_policy is all_or_nothing, got ' + folder.closure_policy);
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
