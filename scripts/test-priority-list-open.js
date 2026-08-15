#!/usr/bin/env node
'use strict';

// test-priority-list-open.js — pins ADR 0018 §5 item 2 / §8 step 2: connecting the dormant
// priority-tier sorter (`readPriorityConfig` / `priorityTier` / `listOpenIssues`,
// kaola-workflow-claim.js:254-291) to a CLI entry point the pick step can call INSTEAD OF the
// raw `gh issue list` splice (`templates/routing/slots.js`'s `nx-issue-list`).
//
// TEST CUSTODY: this file is authored by tdd-guide and pins a RESULT, never a method. It does
// not touch scripts/kaola-workflow-claim.js (implementer-owned) or templates/routing/*
// (owned by two other concurrently-dispatched agents on this same bundle).
//
// THE ACCEPTANCE SURFACE THIS SUITE DEFINES (there is no shipped contract yet — this IS it):
//   CLI:    node kaola-workflow-claim.js list-open
//   stdin:  none
//   stdout: exactly one line of JSON: { "issues": [ <issue>, ... ] }
//           - the array is `listOpenIssues`'s existing gh --json field shape
//             (number, title, labels, updatedAt, url), tier-sorted then number-sorted.
//           - ALWAYS the full open-issue list, reordered — never truncated, filtered, or
//             reduced to a single "winner". Ordering is not selecting
//             (next.skeleton.md:39 — "You select the target. No script picks for you.").
//   exit:   0 on success, including under KAOLA_WORKFLOW_OFFLINE=1 (must not throw/crash).
//
// The subcommand name (`list-open`) and the `{ issues: [...] }` envelope are this suite's own
// design choice — the brief explicitly left both unspecified and asked the test author to design
// the surface. Both follow existing conventions read off the shipped tree: kebab-case
// subcommands (`pick-next`, `worktree-status`, `stale-worktree-check`, ...) and the `output()`
// helper's established pattern of wrapping a listing in a named array key rather than printing a
// bare array (`cmdStatus` -> `{active, drift, count}`, `cmdWorktreeStatus` -> `{worktrees}`).
// Whoever implements this may rename either — this suite is what they must then satisfy.
//
// Mock forge: KAOLA_GH_MOCK_SCRIPT (kaola-workflow-claim.js:213, the established seam also used
// by simulate-workflow-walkthrough.js and test-bundle-claim.js) — a node script invoked in place
// of `gh`, so `gh` is never shelled for real. Hand-rolled assert + counter; no framework, per
// repo convention (test-bundle-claim.js header).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const G = require('./test-git-fixture');

// Hermetic HOME: kaola-workflow-claim.js's module load path can reach other HOME-rooted config
// (e.g. the global `~/.config/kaola-workflow/config.json`) even though `readPriorityConfig`
// itself only reads the project-local file under `root`; sandbox it so a developer machine's
// real config can never leak into a fixture run (same precaution as test-bundle-claim.js).
const kwSandboxHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sandbox-home-'));
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
// Fixture helpers
// ---------------------------------------------------------------------------

function makeTmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kw-list-open-'));
}

function initGitRepo(tmp) {
  G.init(tmp, { branch: 'main' });
  fs.writeFileSync(path.join(tmp, 'README.md'), 'fixture\n');
  G.commitAll(tmp, 'init');
}

function writeConfig(tmp, obj) {
  const dir = path.join(tmp, 'kaola-workflow');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(obj));
}

// issues: array of { number, title, labels: string[], updatedAt, url }. Mirrors the exact gh
// --json field set `listOpenIssues` requests (number,title,labels,updatedAt,url); label objects
// use gh's real shape ({name: ...}) since `labelName()` in kaola-workflow-claim.js reads `.name`.
function writeIssueListGhMock(binDir, issues) {
  fs.mkdirSync(binDir, { recursive: true });
  const payload = issues.map(i => ({
    number: i.number,
    title: i.title || ('issue ' + i.number),
    labels: (i.labels || []).map(name => ({ name })),
    updatedAt: i.updatedAt || '2026-01-01T00:00:00Z',
    url: i.url || ('https://example.invalid/issues/' + i.number)
  }));
  const script = [
    "'use strict';",
    'const argv = process.argv.slice(2);',
    'const a = argv.join(" ");',
    'const payload = ' + JSON.stringify(payload) + ';',
    'if (a.includes("issue list")) {',
    '  process.stdout.write(JSON.stringify(payload) + "\\n");',
    '  process.exit(0);',
    '}',
    '// anything else this suite does not expect to be asked for.',
    'process.stdout.write("[]\\n");',
    'process.exit(0);'
  ].join('\n');
  fs.writeFileSync(path.join(binDir, 'gh.js'), script);
}

// Spawns `node kaola-workflow-claim.js list-open` — THE CLI CONTRACT THIS SUITE DEFINES.
function runListOpen(cwd, binDir, extraEnv) {
  const mockEnv = binDir && fs.existsSync(path.join(binDir, 'gh.js'))
    ? { KAOLA_GH_MOCK_SCRIPT: path.join(binDir, 'gh.js') }
    : {};
  return spawnSync(process.execPath, [claimScript, 'list-open'], {
    cwd,
    encoding: 'utf8',
    timeout: 30000,
    env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '0' }, mockEnv, extraEnv || {})
  });
}

function parseLastJsonLine(stdout) {
  const lines = (stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
  if (!lines.length) return null;
  try { return JSON.parse(lines[lines.length - 1]); } catch (_) { return null; }
}

// ---------------------------------------------------------------------------
// Test 1 — tier ordering, then issue-number ascending within a tier (ADR item 1)
// ---------------------------------------------------------------------------
// Arrival order is deliberately scrambled WITHIN each tier (20 before 10; 50 before 5) so a
// stable sort that orders by tier alone, preserving arrival order as its number tiebreak, would
// produce a DIFFERENT sequence (20,10,99,50,5) than the correct one (10,20,99,5,50) — this
// assertion fails against that plausible near-miss, not just against "no sort at all".
function testTierOrdering() {
  const tmp = makeTmpRoot();
  initGitRepo(tmp);
  const binDir = path.join(tmp, '.bin');
  writeIssueListGhMock(binDir, [
    { number: 20, labels: ['P0'] },
    { number: 5, labels: ['P2'] },
    { number: 99, labels: ['P1'] },
    { number: 10, labels: ['P0'] },
    { number: 50, labels: ['P2'] }
  ]);

  const r = runListOpen(tmp, binDir);
  assert(r.status === 0, 'testTierOrdering: list-open exits 0, got ' + r.status + ' stderr=' + r.stderr);
  const parsed = parseLastJsonLine(r.stdout);
  assert(parsed && Array.isArray(parsed.issues),
    'testTierOrdering: stdout is { issues: [...] }, got ' + JSON.stringify(r.stdout));
  if (parsed && Array.isArray(parsed.issues)) {
    const numbers = parsed.issues.map(i => i.number);
    assert(JSON.stringify(numbers) === JSON.stringify([10, 20, 99, 5, 50]),
      'testTierOrdering: expected tier-then-number order [10,20,99,5,50], got ' + JSON.stringify(numbers));
  }
}

// ---------------------------------------------------------------------------
// Test 2 — an issue with no P label is present, sorted last (tier 99) — never dropped
// (ADR item 2, and doubles as the "ordering is not selecting" count/presence check, item 4)
// ---------------------------------------------------------------------------
function testUnlabeledSortsLastAndSurvives() {
  const tmp = makeTmpRoot();
  initGitRepo(tmp);
  const binDir = path.join(tmp, '.bin');
  writeIssueListGhMock(binDir, [
    { number: 30, labels: ['P1'] },
    { number: 7, labels: ['documentation'] }, // no P-label at all -> tier 99
    { number: 12, labels: ['P0'] }
  ]);

  const r = runListOpen(tmp, binDir);
  assert(r.status === 0, 'testUnlabeledSortsLastAndSurvives: exits 0, got ' + r.status + ' stderr=' + r.stderr);
  const parsed = parseLastJsonLine(r.stdout);
  const numbers = parsed && Array.isArray(parsed.issues) ? parsed.issues.map(i => i.number) : [];

  // Never dropped: THE FULL input set comes back, not a subset. A "return only the top tier" or
  // "return the top one" mutant fails this line specifically.
  assert(numbers.length === 3,
    'testUnlabeledSortsLastAndSurvives: all 3 input issues must be present (ordering is not '
    + 'selecting — next.skeleton.md:39), got ' + JSON.stringify(numbers));
  assert(numbers.includes(7),
    'testUnlabeledSortsLastAndSurvives: the unlabeled issue #7 (tier 99) must still be in the '
    + 'list, got ' + JSON.stringify(numbers));
  assert(JSON.stringify(numbers) === JSON.stringify([12, 30, 7]),
    'testUnlabeledSortsLastAndSurvives: expected [12,30,7] (P0, P1, then unlabeled last), got '
    + JSON.stringify(numbers));
}

// ---------------------------------------------------------------------------
// Test 3 — ordering is not selecting: a WIDER fixture (7 issues, every tier populated) asserts
// the returned set is a bijection with the input set, by number. This is the assertion that
// would fail if a later change made the entry point return "the top one" or any truncated
// subset — count alone can coincidentally match a wrong subset; set-equality cannot.
// (ADR item 4)
// ---------------------------------------------------------------------------
function testOrderingIsNotSelecting() {
  const tmp = makeTmpRoot();
  initGitRepo(tmp);
  const binDir = path.join(tmp, '.bin');
  const inputNumbers = [1, 2, 3, 4, 5, 6, 7];
  writeIssueListGhMock(binDir, [
    { number: 1, labels: ['P0'] },
    { number: 2, labels: ['P3'] },
    { number: 3, labels: ['P1'] },
    { number: 4, labels: [] },
    { number: 5, labels: ['P2'] },
    { number: 6, labels: ['bug'] },
    { number: 7, labels: ['P0'] }
  ]);

  const r = runListOpen(tmp, binDir);
  const parsed = parseLastJsonLine(r.stdout);
  const numbers = parsed && Array.isArray(parsed.issues) ? parsed.issues.map(i => i.number) : [];
  const gotSet = new Set(numbers);
  const wantSet = new Set(inputNumbers);
  const sameSet = gotSet.size === wantSet.size && inputNumbers.every(n => gotSet.has(n));
  assert(numbers.length === inputNumbers.length,
    'testOrderingIsNotSelecting: length must equal the input open-issue count ('
    + inputNumbers.length + '), got ' + numbers.length + ' -> ' + JSON.stringify(numbers));
  assert(sameSet,
    'testOrderingIsNotSelecting: the returned issue numbers must be EXACTLY the input set '
    + '(reordered, never filtered) — expected {' + inputNumbers.join(',') + '}, got {'
    + numbers.join(',') + '}');
  // A truncate-to-one-winner mutant would return exactly 1 element; make that failure explicit
  // rather than relying on the length check above alone to communicate why it matters.
  assert(numbers.length > 1,
    'testOrderingIsNotSelecting: a 7-issue backlog must not collapse to a single "picked" issue');
}

// ---------------------------------------------------------------------------
// Test 4 — `priority_top_tier_labels` override honoured; its ABSENCE falls back to the shipped
// default (["P0","P1"]) rather than throwing or promoting nothing. Run the identical two-issue
// fixture twice — once with no config.json, once with a config.json overriding a non-P label to
// top tier — and assert the relative order of the two issues FLIPS. A flip is a sharper
// assertion than "tier changed": it is only possible if the override was actually read AND
// actually applied to the sort, not merely parsed and discarded. (ADR item 3)
// ---------------------------------------------------------------------------
function testPriorityTopTierLabelsOverride() {
  const issues = [
    { number: 1, labels: ['hotfix'] }, // no bare P-label; tier 99 unless overridden
    { number: 2, labels: ['P2'] }
  ];

  // (a) no project-local config.json -> falls back to the shipped default ["P0","P1"], which
  // does not contain "hotfix", so #1 stays tier 99 and sorts AFTER #2 (tier 2).
  const tmpA = makeTmpRoot();
  initGitRepo(tmpA);
  const binA = path.join(tmpA, '.bin');
  writeIssueListGhMock(binA, issues);
  const rA = runListOpen(tmpA, binA);
  const parsedA = parseLastJsonLine(rA.stdout);
  const numbersA = parsedA && Array.isArray(parsedA.issues) ? parsedA.issues.map(i => i.number) : [];
  assert(rA.status === 0, 'testPriorityTopTierLabelsOverride(no config): exits 0, got ' + rA.status);
  assert(JSON.stringify(numbersA) === JSON.stringify([2, 1]),
    'testPriorityTopTierLabelsOverride(no config): default fallback must NOT promote "hotfix" — '
    + 'expected [2,1], got ' + JSON.stringify(numbersA));

  // (b) same two issues, but kaola-workflow/config.json overrides "hotfix" to top tier (1) —
  // #1 must now sort BEFORE #2 (tier 1 < tier 2), the exact reverse of (a).
  const tmpB = makeTmpRoot();
  initGitRepo(tmpB);
  writeConfig(tmpB, { priority_top_tier_labels: ['hotfix'] });
  const binB = path.join(tmpB, '.bin');
  writeIssueListGhMock(binB, issues);
  const rB = runListOpen(tmpB, binB);
  const parsedB = parseLastJsonLine(rB.stdout);
  const numbersB = parsedB && Array.isArray(parsedB.issues) ? parsedB.issues.map(i => i.number) : [];
  assert(rB.status === 0, 'testPriorityTopTierLabelsOverride(with config): exits 0, got ' + rB.status);
  assert(JSON.stringify(numbersB) === JSON.stringify([1, 2]),
    'testPriorityTopTierLabelsOverride(with config): priority_top_tier_labels:["hotfix"] must '
    + 'promote #1 ahead of #2 — expected [1,2], got ' + JSON.stringify(numbersB));

  // The flip itself, asserted directly: same input, config is the only variable, order reverses.
  assert(JSON.stringify(numbersA) !== JSON.stringify(numbersB) && numbersA[0] === numbersB[1] && numbersA[1] === numbersB[0],
    'testPriorityTopTierLabelsOverride: order must FLIP between the no-config and with-config '
    + 'runs on the identical fixture — got ' + JSON.stringify(numbersA) + ' then ' + JSON.stringify(numbersB));
}

// ---------------------------------------------------------------------------
// Test 5 — offline (KAOLA_WORKFLOW_OFFLINE=1) behaves sanely: exit 0, parseable JSON, an
// `issues` array (even if empty) — never a thrown/crashed process. (ADR item 5)
// ---------------------------------------------------------------------------
function testOfflineIsSaneNotThrown() {
  const tmp = makeTmpRoot();
  initGitRepo(tmp);
  // No gh mock at all: offline must never attempt a forge call in the first place.
  const r = spawnSync(process.execPath, [claimScript, 'list-open'], {
    cwd: tmp,
    encoding: 'utf8',
    timeout: 30000,
    env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' })
  });
  assert(r.status === 0,
    'testOfflineIsSaneNotThrown: KAOLA_WORKFLOW_OFFLINE=1 must exit 0 (not throw), got status='
    + r.status + ' stderr=' + r.stderr);
  const parsed = parseLastJsonLine(r.stdout);
  assert(parsed !== null, 'testOfflineIsSaneNotThrown: stdout must be parseable JSON, got ' + JSON.stringify(r.stdout));
  assert(parsed && Array.isArray(parsed.issues),
    'testOfflineIsSaneNotThrown: response must carry an `issues` array even offline, got ' + JSON.stringify(parsed));
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

testTierOrdering();
testUnlabeledSortsLastAndSurvives();
testOrderingIsNotSelecting();
testPriorityTopTierLabelsOverride();
testOfflineIsSaneNotThrown();

console.log('');
if (failed > 0) {
  console.error('test-priority-list-open: ' + failed + ' test(s) FAILED, ' + passed + ' passed');
  process.exit(1);
} else {
  console.log('test-priority-list-open: all ' + passed + ' tests passed');
  process.exit(0);
}
