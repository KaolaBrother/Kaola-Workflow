#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// test-content-locator.js — U9: the per-node content locator, and the ledger column that
// carries it.
//
// TEST INFRASTRUCTURE ONLY. Nothing here is shipped, installed, or imported by a production
// script.
//
// THE MEASUREMENT THAT WAS COMPUTED AND THROWN AWAY. The barrier resolves, by CONTENT, from a
// ref-anchored real commit, exactly the path set one node wrote. Only the COMPLEMENT
// (`outOfAllow`) ever escaped, and on a `pass` nothing did — so a node that delivered its whole
// declared set and a node that delivered nothing emitted byte-identical envelopes. `actualPaths`
// + `declared` are that measurement, kept.
//
//   PART A — the headline: DELIVERED and WROTE-NOTHING are distinguishable, driven through the
//            real CLI against a real git baseline. Both `pass`; the envelopes differ.
//   PART B — `declared` minus `actualPaths` — the direction that existed NOWHERE in the repo, and
//            the one #864 needs. Pinned as a computation over driven data, not as a field.
//   PART C — THE POSITIONAL HAZARD. `kaola-workflow-ledger-compare.js` reads `cells[2]`
//            positionally and its contract is FAIL-OPEN, so a column inserted before `status`
//            silently counts zero complete rows and waves a regression through.
//   PART D — `—` never blank, and the two ledger-row writers agree on the marker.
//   PART E — the D3 carve-out: leg scope still REFUSES while per-node and group ANSWER.
//   PART F — `revert-overflow` is gone from every edition's CLI.
//   PART G — the capture is EFFECT-TRIGGERED and BOUND: a real close writes the paths into the
//            provenance journal against the baseline SHA they were measured from.
//
// ---------------------------------------------------------------------------
// A CORRECTION TO THE PREMISE THIS SUITE WAS COMMISSIONED UNDER — measured, not argued.
//
// The property was described to me as `actualPaths:[...]` versus `actualPaths:[]`. **The
// wrote-nothing node's `actualPaths` is NOT empty.** Driven through the CLI it is:
//
//     ["kaola-workflow/<project>/.cache/barrier-base-quiet",
//      "kaola-workflow/<project>/.cache/barrier-open-quiet"]
//
// — the run's OWN bookkeeping, which the barrier itself writes between `--record-base` and
// `--barrier-check`. Every real node's raw set carries a floor of workflow artifacts (a real
// close measures nine of them). The distinction the campaign claims is REAL, but it lives one
// filter later: after the barrier's own exempt band (`^kaola-workflow/`) the delivering node has
// two ATTRIBUTABLE paths and the quiet node has zero, which is exactly what `renderWroteCell`
// filters on and why a bookkeeping-only node renders `—`.
//
// So this suite pins the ATTRIBUTABLE distinction and asserts the bookkeeping floor explicitly
// rather than pretending it is absent. A pin written to the original description would have been
// false against the shipped implementation, and a pin that asserted `actualPaths.length === 0`
// would have failed on arrival.
// ---------------------------------------------------------------------------
//
// ---------------------------------------------------------------------------
// MUTATION LOG. Every property below was un-wired in the PRODUCTION source against a full-repo
// scratch mirror and observed RED (`git checkout --` is unusable here — the tree carries
// uncommitted work by other agents). Mirror control green before and after. Verbatim casualties:
//
//   the locator is discarded again (`actualPaths` + `declared` deleted from the envelope)
//     "THE MEASUREMENT SURVIVES: ... delivered=undefined quiet=undefined"
//   `actualPaths` echoes `declared` instead of the measured diff — the FABRICATION case
//     "the quiet node measured ZERO attributable files — got ["scripts/c.js"]"
//   the `wrote` column is INSERTED before `status` instead of appended  [THE FAIL-OPEN HAZARD]
//     "THE POSITIONAL GUARD SURVIVES: ... 0 !== 2"
//   renderWroteCell returns a BLANK cell for an empty set
//     "the bookkeeping-only node renders `—` ... '' !== '—'"
//   reconcileLedger fills extra columns with '' again (the two writers disagree)
//     "THE TWO WRITERS AGREE: ... got "| extra | pending |  |"   '' !== '—'"
//   the leg-scope carve-out is deleted
//     "THE CARVE-OUT: LEG scope still REFUSES ... 'answer' !== 'refuse'"
//   the per-node/group conversion is reverted
//     "PER-NODE scope ANSWERS the overflow   'refuse' !== 'answer'"
//   the close stops carrying the locator into the provenance entry
//     "THE CLOSE ENTRY CARRIES THE MEASUREMENT: ... got []"
//   the recorded base is replaced with a zero SHA (the binding laundered)
//     "and the SHA it records IS the baseline the barrier measured against — not a fresh HEAD
//      read at write time, which would be a laundered receipt"
//
// ONE MUTATION INITIALLY SURVIVED, and it is worth recording rather than quietly fixing. The
// reconcileLedger marker pin passed under its own mutation because its row lookup was not scoped
// to `## Node Ledger`: the `## Nodes` row for the same id matches the same pattern and its last
// cell is ALREADY `—`, so the assertion read the plan grammar and passed whatever the reconciler
// had written. Three assertions in this file had that bug; all are now scoped through
// `ledgerSection`, and a SUITE-side mutation that removes the scoping is red
// ("and it is the row of the node that just closed, got "| deliver | implementer | — | ...").
// The lesson generalises: in this repo `## Nodes` and `## Node Ledger` share id-prefixed row
// shapes, so any `.find(/^\| *<id>/)` over whole plan text is a vacuous-pass waiting to happen.
// ---------------------------------------------------------------------------
//
// Run: node scripts/test-content-locator.js

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

// Git FIXTURE arrangement routes through the shared library — one process-boundary decision for
// the repo instead of one per line. Rolling my own `execFileSync('git', ...)` here would add two
// unclassified spawn sites to a file whose ceiling is (correctly) zero.
const G = require('./test-git-fixture');

const SCRIPTS = __dirname;
const REPO = path.resolve(__dirname, '..');
const VALIDATOR = path.join(SCRIPTS, 'kaola-workflow-plan-validator.js');
const ADAPTIVE_NODE = path.join(SCRIPTS, 'kaola-workflow-adaptive-node.js');
const PROJECT = 'issue-871';

const validator = require('./kaola-workflow-plan-validator');
const node = require('./kaola-workflow-adaptive-node');
const ledgerCompare = require('./kaola-workflow-ledger-compare');

// The barrier's OWN exempt band — the paths it can never attribute against a declared write set.
// Restated from the production filter rather than imported, because the claim under test is that
// the cell and `declared` range over the same universe; importing the filter would make that true
// by construction. A drift here is a red, which is the point.
const WORKFLOW_ARTIFACT = /^kaola-workflow\//;
const attributable = paths => (paths || []).filter(p => !WORKFLOW_ARTIFACT.test(p));

// ledgerSection / ledgerHeaderCols — the `## Nodes` table ALSO starts `| id | role | ...`, so a
// bare `/^\| *id/` scan finds the wrong header and the positional assertions below read the plan
// grammar instead of the ledger. Scope to the section first.
function ledgerSection(content) {
  const lines = String(content).split('\n');
  const start = lines.findIndex(l => /^##[ \t]+Node Ledger[ \t]*$/.test(l));
  if (start < 0) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(l => /^##[ \t]/.test(l));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
}
function ledgerHeaderCols(content) {
  const header = ledgerSection(content).split('\n').find(l => l.trim().startsWith('|'));
  if (!header) return null;
  return header.split('|').slice(1, -1).map(c => c.trim().toLowerCase());
}

const GIT_ENV = {
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Content Locator', GIT_AUTHOR_EMAIL: 'u9@example.com',
  GIT_COMMITTER_NAME: 'Content Locator', GIT_COMMITTER_EMAIL: 'u9@example.com',
};

let passed = 0;
function ok(value, message) { assert.ok(value, message); passed++; }
function equal(actual, expected, message) { assert.strictEqual(actual, expected, message); passed++; }
function deepEqual(actual, expected, message) { assert.deepStrictEqual(actual, expected, message); passed++; }
function notDeepEqual(actual, expected, message) { assert.notDeepStrictEqual(actual, expected, message); passed++; }

const STDIO_Q = { stdio: ['ignore', 'ignore', 'ignore'] };
function cleanup(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* best-effort */ } }

// buildPlan — a FROZEN plan whose `## Nodes` is a TABLE. The section is a table, not a set of
// subsections; an authored-as-subsections plan is `nodes_unparseable` and every barrier below
// would refuse before measuring anything.
function buildPlan(rows, ledgerRows, compliance) {
  let plan = [
    '# Workflow Plan — ' + PROJECT, '', '## Meta', 'project: ' + PROJECT, 'plan_form: spine',
    'labels: enhancement', 'speculative_open_policy: auto',
    'validation_command: node -e "process.exit(0)"', 'validation_timeout_minutes: 30',
    'plan_schema_version: 2', '', '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape | model | gate_claim | gate_surface | gate_aggregation | certifies |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ].concat(rows).concat([
    '', '## Design', '',
    'Decompose the spine into concrete role nodes; every sequence edge is a real data dependency (S1) or a gate ordering. Done means validation passes.',
    '', '## Acceptance', '', 'A1: the declared write set lands the change the issue asked for.',
    'A2: the recorded validation_command passes over the candidate.',
    '', '## Node Ledger', '', '| id | status |', '| --- | --- |',
  ]).concat(ledgerRows).concat([
    '', '## Required Agent Compliance', '', '| Requirement | Status | Evidence | Skip Reason |',
    '| --- | --- | --- | --- |',
  ]).concat(compliance).concat(['']).join('\n');
  const hash = validator.computePlanHash(plan);
  return {
    content: plan.replace(/^# Workflow Plan[^\n]*\n/, m => m + '\n<!-- plan_hash: ' + hash + ' -->\n'),
    hash,
  };
}

// The two-node shape PART A turns on: one node that DELIVERS its declared set, one that declares
// a file and writes nothing at all.
const LOCATOR_ROWS = [
  '| deliver | implementer | — | scripts/a.js, scripts/b.js | 1 | sequence | standard | — | — | — | — |',
  '| quiet | code-explorer | deliver | scripts/c.js | 1 | sequence | standard | — | — | — | — |',
  '| finalize | finalize | quiet | — | 1 | sequence | — | — | — | — | — |',
];
const LOCATOR_LEDGER = ['| deliver | pending |', '| quiet | pending |', '| finalize | pending |'];
const LOCATOR_COMPLIANCE = ['| implementer (deliver) | pending | | |',
  '| code-explorer (quiet) | pending | | |', '| finalize (finalize) | pending | | |'];

function makeRepo(tag, plan) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-locator-' + tag + '-')));
  G.init(root, { branch: 'main', email: GIT_ENV.GIT_AUTHOR_EMAIL, name: GIT_ENV.GIT_AUTHOR_NAME });
  G.git(root, ['config', 'commit.gpgsign', 'false'], STDIO_Q);
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'scripts', 'a.js'), '// a v0\n');
  fs.writeFileSync(path.join(root, 'scripts', 'b.js'), '// b v0\n');
  fs.writeFileSync(path.join(root, 'scripts', 'untouched.js'), '// untouched\n');
  const projectDir = path.join(root, 'kaola-workflow', PROJECT);
  fs.mkdirSync(path.join(projectDir, '.cache'), { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'workflow-plan.md'), plan.content);
  fs.writeFileSync(path.join(projectDir, 'workflow-state.md'), [
    '# Kaola-Workflow State', '', '## Project', 'name: ' + PROJECT, 'status: active', '',
    '## Current Position', 'phase: adaptive', 'phase_name: Adaptive', 'workflow_path: adaptive',
    'step: start', 'next_command: /kaola-workflow-plan-run ' + PROJECT,
    'next_skill: kaola-workflow-plan-run ' + PROJECT,
    '', '## Planning Evidence', 'plan_hash: ' + plan.hash, 'decision: auto-run',
    'risk: sensitivity=false blast_radius=false uncertain=false reasons=—',
    'first_node_id: deliver', 'first_node_role: implementer', '', '## Sink', 'branch: workflow/' + PROJECT,
    'issue_number: 871', 'sink: merge', 'main_root: ' + root, 'session_marker: locator-suite',
    'claim_ts: 2026-07-29T00:00:00.000Z', 'worktree_path: ' + root, '',
  ].join('\n'));
  G.commitAll(root, 'seed', undefined, STDIO_Q);
  G.checkout(root, 'workflow/' + PROJECT, { create: true }, STDIO_Q);
  return { root, projectDir, planPath: path.join(projectDir, 'workflow-plan.md') };
}

// runValidator / runNode — the process boundary is where the MEASUREMENT lives. `barrierCheck` is
// a pure function that takes `actualPaths` as a PARAMETER; the git tree-diff that computes that
// parameter happens only in the CLI handler. Driving the function in-process would therefore pin
// whatever array the test itself passed in, which measures nothing about the locator.
function runValidator(root, planPath, args) {
  // spawn-class: cli-contract
  const r = spawnSync(process.execPath, [VALIDATOR, planPath, '--json'].concat(args), {
    cwd: root, encoding: 'utf8', env: Object.assign({}, process.env, GIT_ENV),
  });
  let json = null;
  try { json = JSON.parse(String(r.stdout || '').trim().split('\n').filter(Boolean).pop()); } catch (_) {}
  return { status: r.status, json, stdout: String(r.stdout || ''), stderr: String(r.stderr || '') };
}
function runNode(root, args, script) {
  // spawn-class: cli-contract
  const r = spawnSync(process.execPath, [script || ADAPTIVE_NODE].concat(args), {
    cwd: root, encoding: 'utf8', env: Object.assign({}, process.env, GIT_ENV),
  });
  let json = null;
  try { json = JSON.parse(String(r.stdout || '').trim().split('\n').filter(Boolean).pop()); } catch (_) {}
  return { status: r.status, json, stdout: String(r.stdout || ''), stderr: String(r.stderr || '') };
}

// ===========================================================================
// PART A — DELIVERED and WROTE-NOTHING are distinguishable.
// ===========================================================================

// measureBothNodes — record a baseline for `deliver`, do real work, measure it; then record a
// baseline for `quiet`, do NOTHING, measure that. Both through the real CLI against real commits.
function measureBothNodes() {
  const fx = makeRepo('headline', buildPlan(LOCATOR_ROWS, LOCATOR_LEDGER, LOCATOR_COMPLIANCE));
  try {
    const rb1 = runValidator(fx.root, fx.planPath, ['--record-base', '--node-id', 'deliver']);
    equal(rb1.status, 0, 'baseline recorded for the delivering node\n' + rb1.stdout + rb1.stderr);

    fs.writeFileSync(path.join(fx.root, 'scripts', 'a.js'), '// a v1 DELIVERED\n');
    fs.writeFileSync(path.join(fx.root, 'scripts', 'b.js'), '// b v1 DELIVERED\n');
    const delivered = runValidator(fx.root, fx.planPath, ['--barrier-check', '--node-id', 'deliver']);

    const rb2 = runValidator(fx.root, fx.planPath, ['--record-base', '--node-id', 'quiet']);
    equal(rb2.status, 0, 'baseline recorded for the quiet node\n' + rb2.stdout + rb2.stderr);
    // Deliberately no writes between the baseline and the barrier.
    const quiet = runValidator(fx.root, fx.planPath, ['--barrier-check', '--node-id', 'quiet']);

    return { delivered, quiet, base1: rb1.json && rb1.json.base };
  } finally { cleanup(fx.root); }
}

function partHeadline() {
  const { delivered, quiet } = measureBothNodes();

  ok(delivered.json && quiet.json,
    'both barriers emitted an envelope\ndelivered=' + delivered.stdout + delivered.stderr
      + '\nquiet=' + quiet.stdout + quiet.stderr);
  equal(delivered.json.result, 'pass', 'the delivering node PASSES its barrier');
  equal(quiet.json.result, 'pass', 'the quiet node PASSES its barrier too — this is the whole difficulty: '
    + 'the verdicts are identical, so the verdict cannot be what distinguishes them');
  equal(delivered.status, 0, 'and both exit 0');
  equal(quiet.status, 0, 'and both exit 0');

  // THE HEADLINE. Before the locator these two envelopes were byte-identical.
  notDeepEqual(delivered.json.actualPaths, quiet.json.actualPaths,
    'THE MEASUREMENT SURVIVES: a node that delivered and a node that wrote nothing no longer emit '
    + 'the same envelope — delivered=' + JSON.stringify(delivered.json.actualPaths)
    + ' quiet=' + JSON.stringify(quiet.json.actualPaths));

  // ...and the difference is the ATTRIBUTABLE work, which is the honest form of the claim. See the
  // correction at the top of this file: the raw sets are never empty.
  deepEqual(attributable(delivered.json.actualPaths).sort(), ['scripts/a.js', 'scripts/b.js'],
    'the delivering node measured EXACTLY its two attributable files, by content, from its own baseline');
  deepEqual(attributable(quiet.json.actualPaths), [],
    'the quiet node measured ZERO attributable files — got ' + JSON.stringify(quiet.json.actualPaths));

  // THE BOOKKEEPING FLOOR, asserted rather than wished away. A future reader comparing raw sets
  // must know these are there; a pin that assumed an empty array would be false on arrival.
  ok(quiet.json.actualPaths.length > 0,
    'the quiet node still measured the run\'s OWN bookkeeping — the raw set is NOT empty, got '
    + JSON.stringify(quiet.json.actualPaths));
  ok(quiet.json.actualPaths.every(p => WORKFLOW_ARTIFACT.test(p)),
    'and every one of those paths is a workflow artifact, got ' + JSON.stringify(quiet.json.actualPaths));

  // `declared` is the other half, and it is NOT a restatement of one plan row: it is built four
  // different ways upstream. At per-node scope it is this node's own set.
  deepEqual(delivered.json.declared, ['scripts/a.js', 'scripts/b.js'], 'the delivering node reports what it was permitted to write');
  deepEqual(quiet.json.declared, ['scripts/c.js'], 'the quiet node reports its declared set even though it wrote none of it');

  // The derived ledger cell is the human-readable half of the same distinction.
  equal(node.renderWroteCell(delivered.json.actualPaths), 'scripts/a.js, scripts/b.js',
    'the delivering node renders its work into the ledger cell');
  equal(node.renderWroteCell(quiet.json.actualPaths), '—',
    'the bookkeeping-only node renders `—` — the honest reading of "delivered no attributable work"');
}

// ===========================================================================
// PART B — `declared` minus `actualPaths`: the direction that existed nowhere.
//
// `outOfAllow` has always been the FORWARD difference (wrote-but-not-declared). The REVERSE
// (declared-but-not-written) was computed in no file in this repository, and it is the one #864
// needs to attribute a diff in both directions. This pins that the emitted data SUPPORTS it —
// the computation is the caller's, the obligation here is that the inputs exist and are honest.
// ===========================================================================

function partReverseDifference() {
  const fx = makeRepo('reverse', buildPlan(LOCATOR_ROWS, LOCATOR_LEDGER, LOCATOR_COMPLIANCE));
  try {
    runValidator(fx.root, fx.planPath, ['--record-base', '--node-id', 'deliver']);
    // Deliver only HALF the declared set: `a.js` lands, `b.js` never does.
    fs.writeFileSync(path.join(fx.root, 'scripts', 'a.js'), '// a v1 PARTIAL DELIVERY\n');
    const r = runValidator(fx.root, fx.planPath, ['--barrier-check', '--node-id', 'deliver']);
    ok(r.json && r.json.result === 'pass',
      'a partial delivery still PASSES — under-delivery is not an overflow, which is exactly why '
      + 'nothing used to notice it\n' + r.stdout + r.stderr);

    const wrote = new Set(r.json.actualPaths);
    const undelivered = r.json.declared.filter(p => !wrote.has(p));
    deepEqual(undelivered, ['scripts/b.js'],
      'THE REVERSE DIFFERENCE is computable from the emitted envelope: declared-but-not-written = '
      + JSON.stringify(undelivered));

    // Non-vacuity in both directions: the forward difference is EMPTY here, so this row cannot be
    // passing because everything happens to be out of allowlist.
    deepEqual(r.json.outOfAllow, [],
      'and the FORWARD difference is empty — the two directions are genuinely different data, got '
      + JSON.stringify(r.json.outOfAllow));
    ok(r.json.declared.length > undelivered.length,
      'NON-VACUITY: the declared set is not wholly undelivered, so the difference is a real subset');
  } finally { cleanup(fx.root); }
}

// ===========================================================================
// PART C — THE POSITIONAL HAZARD. This is the one that fails OPEN.
//
// `kaola-workflow-ledger-compare.js` splits a ledger row on `|` and reads `cells[2]` as the
// status. With `| id | status | wrote |` the status stays at index 2. Put `wrote` BEFORE `status`
// and `countComplete` returns 0 — and its contract treats 0 as "no ledger to protect" and
// returns `safe: true`. The worktree-regression guard would then wave a regression through with
// no error, no red and no stall.
// ===========================================================================

function partPositionalHazard() {
  const plan = buildPlan(LOCATOR_ROWS,
    ['| deliver | complete |', '| quiet | complete |', '| finalize | pending |'], LOCATOR_COMPLIANCE);

  const before = ledgerCompare.countComplete(plan.content);
  equal(before, 2, 'NON-VACUITY: the guard counts the complete rows BEFORE the column exists, got ' + before);

  const spliced = node.spliceLedgerWrote(plan.content, 'deliver', ['scripts/a.js', 'scripts/b.js']);
  ok(spliced.changed, 'the column was spliced in');
  equal(ledgerCompare.countComplete(spliced.content), before,
    'THE POSITIONAL GUARD SURVIVES: the regression guard still counts the same complete rows after '
    + 'the column is appended. A column inserted BEFORE `status` makes this 0, and countComplete\'s '
    + 'own contract reads 0 as "nothing to protect" and returns safe:true — the guard fails OPEN.');

  // Said structurally as well, because the arithmetic above could coincide. `cells[2]` is the
  // status cell, so `status` must be the SECOND column and `wrote` must come after it.
  const cols = ledgerHeaderCols(spliced.content);
  ok(cols, 'the spliced ledger has a header row');
  equal(cols[0], 'id', 'column 0 is id, got ' + JSON.stringify(cols));
  equal(cols[1], 'status', 'column 1 is status — this is what `cells[2]` reads, got ' + JSON.stringify(cols));
  ok(cols.indexOf('wrote') > cols.indexOf('status'),
    'the `wrote` column is APPENDED AFTER status, never inserted before it, got ' + JSON.stringify(cols));

  // The guard, driven end to end: a dest ledger that is strictly more complete than the source
  // must still be protected once the column exists.
  const stale = buildPlan(LOCATOR_ROWS,
    ['| deliver | pending |', '| quiet | pending |', '| finalize | pending |'], LOCATOR_COMPLIANCE);
  const verdict = ledgerCompare.compareLedgers(stale.content, spliced.content);
  equal(verdict.safe, false,
    'DRIVEN: with the column present, copying a STALER ledger over a more complete one is still '
    + 'refused — got ' + JSON.stringify(verdict));
  equal(verdict.destComplete, 2, 'and the dest completeness is read through the new column layout, got '
    + JSON.stringify(verdict.destComplete));
}

// ===========================================================================
// PART D — absence never renders as a value, and the two row writers agree.
// ===========================================================================

function partEmptyMarker() {
  const MARKER = '—';
  equal(node.renderWroteCell([]), MARKER, 'a measured-and-empty set renders the marker, never a blank cell');
  equal(node.renderWroteCell(['kaola-workflow/x/.cache/barrier-base-n1']), MARKER,
    'a bookkeeping-only set renders the marker too');
  equal(node.renderWroteCell(null), MARKER, 'and a missing set does not throw');

  // The SPLICE writer: rows it did not measure must carry the marker, not an empty cell — a blank
  // is indistinguishable from a row written before the column existed.
  const plan = buildPlan(LOCATOR_ROWS, LOCATOR_LEDGER, LOCATOR_COMPLIANCE);
  const spliced = node.spliceLedgerWrote(plan.content, 'deliver', ['scripts/a.js']);
  // Scoped to the LEDGER — the `## Nodes` table carries rows with the same ids.
  const rows = ledgerSection(spliced.content).split('\n')
    .filter(l => /^\|\s*(quiet|finalize)\s*\|/.test(l.trim()));
  equal(rows.length, 2, 'NON-VACUITY: both unmeasured rows are present, got ' + JSON.stringify(rows));
  for (const row of rows) {
    const cells = row.split('|').slice(1, -1).map(c => c.trim());
    equal(cells[cells.length - 1], MARKER,
      'an unmeasured row carries the marker, never a blank cell: ' + JSON.stringify(row));
  }

  // THE TWO WRITERS AGREE. `reconcileLedger` (plan-validator) fills extra columns on a row it
  // ADDS; `spliceLedgerWrote` (adaptive-node) fills them on rows it PASSES OVER. They used to
  // disagree — `''` versus `—` — so one plan could carry both spellings depending on which verb
  // touched it. Both are DRIVEN here rather than compared by reading their source.
  const withColumn = node.spliceLedgerWrote(plan.content, 'deliver', ['scripts/a.js']).content;
  const plusNode = withColumn.replace(
    '| finalize | finalize | quiet | — | 1 | sequence | — | — | — | — | — |',
    '| finalize | finalize | quiet | — | 1 | sequence | — | — | — | — | — |\n'
      + '| extra | code-explorer | deliver | scripts/d.js | 1 | sequence | standard | — | — | — | — |');
  const reconciled = validator.reconcileLedger(plusNode);
  deepEqual(reconciled.added, ['extra'], 'NON-VACUITY: the reconciler really did add the missing row, got '
    + JSON.stringify(reconciled.added));
  // SCOPED TO THE LEDGER. The `## Nodes` row for `extra` matches the same pattern and its own last
  // cell is already `—`, so an unscoped lookup here reads the plan grammar and passes whatever the
  // reconciler filled. That pin was vacuous until a mutation exposed it.
  const addedRow = ledgerSection(reconciled.content).split('\n')
    .find(l => /^\|\s*extra\s*\|/.test(l.trim()));
  ok(addedRow, 'the reconciled LEDGER row is present, got ledger:\n' + ledgerSection(reconciled.content));
  const addedCells = addedRow.split('|').slice(1, -1).map(c => c.trim());
  equal(addedCells.length, 3,
    'NON-VACUITY: the reconciled row has the three-column shape, so there IS an extra column to '
    + 'fill — got ' + JSON.stringify(addedRow));
  equal(addedCells[addedCells.length - 1], MARKER,
    'THE TWO WRITERS AGREE: reconcileLedger fills the extra column with the SAME marker '
    + 'spliceLedgerWrote uses — got ' + JSON.stringify(addedRow));
}

// ===========================================================================
// PART E — the D3 carve-out. Same contrast shape as a converted/unconverted pair: it is only a
// carve-out if the two scopes genuinely differ, so both halves are asserted together.
//
// Leg scope keeps REFUSING because an undeclared write inside an isolated leg SILENTLY
// BOTH-APPLIES at the synthesis merge — a live merge-correctness event, not a future reader's
// epistemic state. Per-node and group scope ANSWER: the files are on the branch either way,
// nothing has published, and the finding survives to the whole-plan barrier that guards the merge.
// ===========================================================================

function partCarveOut() {
  const plan = buildPlan(LOCATOR_ROWS, LOCATOR_LEDGER, LOCATOR_COMPLIANCE).content;
  const overflow = ['scripts/a.js', 'scripts/UNDECLARED.js'];

  const perNode = validator.barrierCheck(plan, overflow, { nodeId: 'deliver' });
  const group = validator.barrierCheck(plan, overflow, { groupMembers: ['deliver', 'quiet'] });
  const leg = validator.barrierCheck(plan, overflow, { nodeId: 'deliver', legScoped: true });
  const wholePlan = validator.barrierCheck(plan, overflow.concat(['scripts/c.js']), {});

  // Non-vacuity: all four saw the SAME finding. Only the verdict differs.
  for (const [label, r] of [['per-node', perNode], ['group', group], ['leg', leg], ['whole-plan', wholePlan]]) {
    equal(r.reason, 'write_set_overflow', label + ': the same overflow was detected');
    ok((r.outOfAllow || []).indexOf('scripts/UNDECLARED.js') >= 0,
      label + ': and it names the same path, got ' + JSON.stringify(r.outOfAllow));
  }

  equal(perNode.result, 'answer', 'PER-NODE scope ANSWERS the overflow');
  equal(perNode.mutation_performed, false,
    'and carries the load-bearing bit the exit code stopped carrying, got ' + JSON.stringify(perNode.mutation_performed));
  equal(group.result, 'answer', 'GROUP scope ANSWERS the overflow');
  equal(group.mutation_performed, false, 'and carries mutation_performed:false');

  equal(leg.result, 'refuse',
    'THE CARVE-OUT: LEG scope still REFUSES — an undeclared leg write silently BOTH-APPLIES at the '
    + 'synthesis merge, which is a live merge-correctness event rather than an epistemic one');
  equal(wholePlan.result, 'refuse',
    'and WHOLE-PLAN scope still refuses — it is the pre-publication door');

  // THE CONTRAST, in one place, so a future edit that makes the scopes agree is red here rather
  // than silently deleting the only place a both-apply is visible.
  notDeepEqual([leg.result, wholePlan.result], [perNode.result, group.result],
    'the refusing scopes and the answering scopes must NOT classify alike — leg/whole='
    + JSON.stringify([leg.result, wholePlan.result]) + ' node/group=' + JSON.stringify([perNode.result, group.result]));
  equal(leg.mutation_performed, undefined,
    'a refusing scope emits NO mutation_performed — the field is the converted arm\'s, so a `refuse` '
    + 'envelope is byte-unchanged, got ' + JSON.stringify(leg.mutation_performed));

  // A CLEAN per-node barrier is unchanged by the conversion: `pass` never carries the bit either.
  const clean = validator.barrierCheck(plan, ['scripts/a.js'], { nodeId: 'deliver' });
  equal(clean.result, 'pass', 'a clean per-node barrier still passes');
  equal(clean.mutation_performed, undefined, 'and a `pass` envelope carries no mutation_performed');
}

// ===========================================================================
// PART F — `revert-overflow` is gone from every edition's CLI.
//
// The route half is covered by the DEAD VERB reachability guard. This is the VERB half: the
// subcommand itself must not dispatch, in all four trees, driven at the process boundary.
// ===========================================================================

const EDITION_NODE_CLIS = Object.freeze([
  'scripts/kaola-workflow-adaptive-node.js',
  'plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js',
  'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js',
  'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js',
]);

function partRevertOverflowGone() {
  const fx = makeRepo('deadverb', buildPlan(LOCATOR_ROWS, LOCATOR_LEDGER, LOCATOR_COMPLIANCE));
  try {
    equal(EDITION_NODE_CLIS.length, 4, 'NON-VACUITY: all four edition CLIs are under test');
    for (const rel of EDITION_NODE_CLIS) {
      const abs = path.join(REPO, rel);
      ok(fs.existsSync(abs), 'the edition CLI exists: ' + rel);
      const r = runNode(fx.root, ['revert-overflow', '--project', PROJECT, '--json'], abs);
      const errors = JSON.stringify((r.json && r.json.errors) || []);
      ok(errors.indexOf('unknown subcommand') >= 0,
        rel + ': `revert-overflow` must not dispatch — got ' + JSON.stringify(r.json));
    }
    // CONTROL. Without it this part passes for a CLI that dispatches nothing at all.
    const live = runNode(fx.root, ['orient', '--project', PROJECT, '--json']);
    const liveErrors = JSON.stringify((live.json && live.json.errors) || []);
    ok(liveErrors.indexOf('unknown subcommand') < 0,
      'CONTROL: a verb that DOES exist still dispatches, so the probe discriminates — got '
      + JSON.stringify(live.json));
  } finally { cleanup(fx.root); }
}

// ===========================================================================
// PART G — the capture is EFFECT-TRIGGERED and BOUND to the world-state it measured.
//
// A field saying what a node wrote is only honest if it is written by the code path that WATCHED
// it be written. So this drives a REAL node lifecycle — open, do work, close — and reads the
// journal the close left behind. And it asserts the BINDING, not the presence: a path list with
// no base is an assertion, a path list with its base is a receipt a stranger can replay. (A
// presence-only check on a field the same code path wrote cannot fail while the field exists.)
// ===========================================================================

function partEffectTriggered() {
  const closePlan = buildPlan(
    ['| deliver | implementer | — | scripts/a.js, scripts/b.js | 1 | sequence | standard | — | — | — | — |',
      '| finalize | finalize | deliver | — | 1 | sequence | — | — | — | — | — |'],
    ['| deliver | pending |', '| finalize | pending |'],
    ['| implementer (deliver) | pending | | |', '| finalize (finalize) | pending | | |']);
  const fx = makeRepo('close', closePlan);
  try {
    const opened = runNode(fx.root, ['open-next', '--project', PROJECT, '--json']);
    equal(opened.status, 0, 'the node opens\n' + opened.stdout + opened.stderr);
    const nonce = opened.json && opened.json.opened && opened.json.opened.nonce;

    fs.writeFileSync(path.join(fx.root, 'scripts', 'a.js'), '// a CLOSED\n');
    fs.writeFileSync(path.join(fx.root, 'scripts', 'b.js'), '// b CLOSED\n');

    // Fill the seeded verification token so the close precondition is met.
    const evPath = path.join(fx.projectDir, '.cache', 'deliver.md');
    ok(fs.existsSync(evPath), 'the open seeded an evidence file at ' + evPath);
    fs.writeFileSync(evPath, fs.readFileSync(evPath, 'utf8')
      .replace(/tests-green:\s*$/m, 'tests-green: driven by test-content-locator'));

    const closed = runNode(fx.root, ['close-and-open-next', '--project', PROJECT, '--node-id', 'deliver', '--json']);
    equal(closed.status, 0, 'the node closes\n' + closed.stdout + closed.stderr);
    equal(closed.json && closed.json.closed, 'deliver', 'and it is the node we opened');

    // THE JOURNAL — written by the same code path, one call after the barrier that observed the diff.
    const provPath = path.join(fx.projectDir, '.cache', 'provenance-log.jsonl');
    ok(fs.existsSync(provPath), 'the close left a provenance journal at ' + provPath);
    const entries = fs.readFileSync(provPath, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
    const closeEntry = entries.find(e => e.event === 'close' && e.nodeId === 'deliver');
    ok(closeEntry, 'the journal carries a close entry for the node, got ' + JSON.stringify(entries.map(e => e.event)));

    deepEqual(attributable(closeEntry.actual_paths).sort(), ['scripts/a.js', 'scripts/b.js'],
      'THE CLOSE ENTRY CARRIES THE MEASUREMENT: the attributable paths this node actually wrote, got '
      + JSON.stringify(closeEntry.actual_paths));
    deepEqual(closeEntry.declared, ['scripts/a.js', 'scripts/b.js'],
      'and what it was permitted to write, so the difference is computable from the journal alone');

    // THE BINDING. Without it the list floats free of any world-state and cannot be replayed.
    ok(typeof closeEntry.base === 'string' && /^[0-9a-f]{40}$/.test(closeEntry.base),
      'the entry is BOUND to a real commit SHA, got ' + JSON.stringify(closeEntry.base));
    const recordedBase = fs.readFileSync(path.join(fx.projectDir, '.cache', 'barrier-base-deliver'), 'utf8').trim();
    equal(closeEntry.base, recordedBase,
      'and the SHA it records IS the baseline the barrier measured against — not a fresh HEAD read '
      + 'at write time, which would be a laundered receipt');
    // The anchoring ref must still resolve to it: a base that git cannot resolve is unreplayable.
    const refSha = G.out(fx.root, ['rev-parse', '--verify', '--quiet',
      'refs/kaola-workflow/barrier/' + PROJECT.replace(/[^A-Za-z0-9_-]/g, '_') + '/deliver^{commit}']);
    equal(refSha, closeEntry.base,
      'and the gc-anchored ref still resolves to it, so a stranger can replay the diff');
    if (nonce) equal(closeEntry.base.slice(0, nonce.length), nonce,
      'the open nonce is the baseline SHA prefix, so evidence, journal and baseline all name ONE world-state');

    // THE DERIVED HALF: the ledger row the close wrote, and the positional guard over it.
    const planAfter = fs.readFileSync(fx.planPath, 'utf8');
    // SCOPED TO THE LEDGER. The `## Nodes` row for this node is also `| deliver | ...` and it
    // carries the declared_write_set cell verbatim — `scripts/a.js, scripts/b.js` — so an unscoped
    // `.find` returns the plan-grammar row and the assertion below passes without the close having
    // written anything at all. (Found by mutation-proving this very part.)
    const row = ledgerSection(planAfter).split('\n').find(l => /^\|\s*deliver\s*\|/.test(l.trim()));
    ok(row && row.indexOf('scripts/a.js, scripts/b.js') >= 0,
      'the close wrote the derived cell into the LEDGER row, got ' + JSON.stringify(row));
    ok(row && /\|\s*complete\s*\|/.test(row),
      'and it is the row of the node that just closed, got ' + JSON.stringify(row));
    const cols = ledgerHeaderCols(planAfter);
    deepEqual([cols && cols[0], cols && cols[1]], ['id', 'status'],
      'and `status` is still the SECOND ledger column after a REAL close — the positional '
      + 'regression guard reads cells[2], got ' + JSON.stringify(cols));
    ok(cols.indexOf('wrote') > cols.indexOf('status'),
      'with `wrote` appended after it, got ' + JSON.stringify(cols));
    equal(ledgerCompare.countComplete(planAfter), 1,
      'so the fail-open regression guard still counts the closed row, got '
      + ledgerCompare.countComplete(planAfter));
  } finally { cleanup(fx.root); }
}

// ===========================================================================

function main() {
  partHeadline();
  partReverseDifference();
  partPositionalHazard();
  partEmptyMarker();
  partCarveOut();
  partRevertOverflowGone();
  partEffectTriggered();
  process.stdout.write('content locator tests passed (' + passed + ' assertions)\n');
}

if (require.main === module) main();

module.exports = {
  buildPlan, makeRepo, runValidator, runNode, attributable,
  LOCATOR_ROWS, LOCATOR_LEDGER, LOCATOR_COMPLIANCE, EDITION_NODE_CLIS,
  partHeadline, partReverseDifference, partPositionalHazard, partEmptyMarker,
  partCarveOut, partRevertOverflowGone, partEffectTriggered,
};
