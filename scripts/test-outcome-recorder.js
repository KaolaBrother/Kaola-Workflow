#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// test-outcome-recorder.js — ADR 0013 M2: the refusal/outcome RECORDER, and the
// parent-owned sidecar SET that has to ship with it.
//
//   PART A — THE RECORD. `buildOutcomeRecord` called DIRECTLY off the kernel, not through a
//            lifecycle verb: that is what catches a dead layer, and this campaign already
//            shipped one (seven registry hint bodies calling a function nobody wrote, every
//            one throwing ReferenceError into a swallowing catch, 541 assertions green).
//
//   PART B + C — THE JOIN. These are the Layer-0 half. The recorder is a leg-side writer, so
//            every leg dirties its own copy of the sidecar and the octopus merge sees add/add
//            unless the capture sweep excludes it. The membership rule is therefore enforced
//            from the artifact ruling: excluding a `record` path from that sweep would DROP
//            leg-authored kernel content from the merge — an evidence-loss defect wearing a
//            merge fix. Proved on two REAL leg worktrees dirtied by the REAL writer and
//            merged by the REAL `synthesizeLevel`, and mutation-proved by removing a member
//            from the set as the PRODUCTION module sees it.
//
//   PART D — FAIL-OPEN. Telemetry that can refuse or wedge is a mid-run serializer, the class
//            P3 exists to make impossible. A real injected fault, and a real CLI verb still ok.
//
//   PART E — THE WIRING. The recorder hook lives in `main()` and is unreachable in-process.
//
//   PART F — THE REPORT. The other half of M2: the interruption-cost RANKING the recorder
//            exists to feed. A recorder nobody reads measures nothing, so the ranking contract
//            is pinned here BYTE-EXACTLY — key order included — against synthetic logs. The
//            properties that make the number honest (a total order with a defined tie-break, an
//            empty log that is not a special case, report-all over malformed lines, unmeasured
//            distinguishable from free, and a reporter that does not write) are pinned as
//            scenarios, not as prose. See THE RANKING CONTRACT below.
//
// Run: node scripts/test-outcome-recorder.js
// ---------------------------------------------------------------------------

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const G = require('./test-git-fixture');
const schema = require('./kaola-workflow-adaptive-schema');
const node = require('./kaola-workflow-adaptive-node');

const SCRIPTS = __dirname;
const ADAPTIVE_NODE = path.join(SCRIPTS, 'kaola-workflow-adaptive-node.js');
const TELEMETRY_REPORT = path.join(SCRIPTS, 'kaola-workflow-telemetry-report.js');
const VALIDATOR = path.join(SCRIPTS, 'kaola-workflow-plan-validator.js');
const PROJECT = 'issue-843';
const OUTCOME_REL = '.cache/' + schema.OUTCOME_LOG_NAME;
const STDIO_Q = { stdio: ['ignore', 'ignore', 'ignore'] };
const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Outcome Recorder', GIT_AUTHOR_EMAIL: 'm2@example.com',
  GIT_COMMITTER_NAME: 'Outcome Recorder', GIT_COMMITTER_EMAIL: 'm2@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
};

let passed = 0;
function ok(value, message) { assert.ok(value, message); passed++; }
function equal(actual, expected, message) { assert.strictEqual(actual, expected, message); passed++; }
function deepEqual(actual, expected, message) { assert.deepStrictEqual(actual, expected, message); passed++; }

// ===========================================================================
// PART A — the record.
// ===========================================================================

// Every line carries every key, in this order. A uniform shape is what lets a consumer project
// a column without presence-testing, and pinning the ORDER is what makes a silently reshaped
// record red rather than merely different.
const RECORD_KEYS = ['v', 'ts', 'script', 'op', 'project', 'node', 'result', 'reason',
  'condition', 'family', 'locus', 'route', 'classified', 'ms'];

function partA() {
  // --- a classified L1 refusal: the full projection, resolved off the ONE registry. -------
  const refusal = schema.refuse('evidence_absent', { node_id: 'n3', role: 'tdd-guide' });
  const rec = schema.buildOutcomeRecord({
    script: 'adaptive-node', op: 'close-and-open-next', project: PROJECT, node: 'n3',
    envelope: refusal, duration_ms: 934,
  });
  deepEqual(Object.keys(rec), RECORD_KEYS, 'the record shape is uniform and ordered');
  ok(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(rec.ts), 'ts is an ISO instant: ' + rec.ts);
  // The whole projection at once. Field-by-field would let an unexpected EXTRA value through;
  // the load-bearing cells are family / locus / route, all resolved through the ONE kernel
  // registry rather than a second table, plus `condition`, which is the P2 census metric.
  deepEqual(Object.assign({}, rec, { ts: null }), {
    v: schema.OUTCOME_LOG_SCHEMA_VERSION, ts: null, script: 'adaptive-node',
    op: 'close-and-open-next', project: PROJECT, node: 'n3', result: 'refuse',
    reason: 'evidence_absent', condition: 'evidence_absent', family: 'kernel_evidence_missing',
    locus: 'L1', route: 'adaptive-node:record-evidence', classified: 'family', ms: 934,
  }, 'the classified L1 refusal projects exactly, family/locus/route off the kernel registry');

  // The three classifications are all reachable, and they are the census. `excluded` is a
  // deliberate silence; `unclassified` is the remaining-migration-work signal, and counting it
  // is the entire reason the field exists.
  const excluded = schema.buildOutcomeRecord({ op: 'open-next', project: PROJECT,
    envelope: { result: 'refuse', reason: 'no_ready_node' } });
  equal(excluded.classified, 'excluded', 'a token a rule deliberately excludes records as excluded, not as a gap');
  equal(excluded.family, null, 'an excluded token carries no family');

  const unknown = schema.buildOutcomeRecord({ op: 'open-next', project: PROJECT,
    envelope: { result: 'refuse', reason: 'a_token_no_rule_matches_9f2c' } });
  equal(unknown.classified, 'unclassified', 'an unmatched token records as unclassified — the P2 remaining-work signal');
  equal(unknown.reason, 'a_token_no_rule_matches_9f2c', 'the unmatched token itself is preserved for the census');
  ok(schema.OUTCOME_CLASSIFICATIONS.indexOf(unknown.classified) >= 0
    && schema.OUTCOME_CLASSIFICATIONS.indexOf(excluded.classified) >= 0
    && schema.OUTCOME_CLASSIFICATIONS.indexOf(rec.classified) >= 0,
  'every emitted classification is in the declared vocabulary');

  // A success is recorded too. P4 is an economics claim about whole runs, so a log holding only
  // refusals could not answer it: the denominator is the successful calls.
  const success = schema.buildOutcomeRecord({ script: 'adaptive-node', op: 'orient',
    project: PROJECT, envelope: { result: 'ok', readySet: ['n1'] }, duration_ms: 12 });
  equal(success.result, 'ok', 'a successful outcome is recorded, not only a refusal');
  deepEqual([success.reason, success.condition, success.family, success.locus, success.route, success.classified],
    [null, null, null, null, null, null],
    'a success carries no family projection — the fields are null, never a fabricated classification');

  // A consent halt is actionable and routes to the A3 valve.
  const halt = schema.buildOutcomeRecord({ op: 'close-node', project: PROJECT,
    envelope: schema.refuse('halt_pending', { result: 'halt' }) });
  equal(halt.family, 'consent_required', 'a halt classifies into the A3 family');
  equal(halt.locus, 'A3', 'the A3 valve is recorded as its own locus');
  equal(halt.route, 'consent', 'a terminal route records as the bare terminal verb');

  // TOTALITY. The recorder sits on the emit path of every subcommand, so a shape it cannot read
  // must produce a value, never an exception.
  equal(schema.buildOutcomeRecord(null), null, 'a null input yields null, not a throw');
  equal(schema.buildOutcomeRecord({ project: PROJECT, envelope: { result: 'ok' } }), null,
    'an event with no phase yields null — an unattributable event is noise, not a measurement');
  equal(schema.buildOutcomeRecord({ op: 'orient', envelope: 'not-an-object' }).result, 'ok',
    'a non-object envelope reads as an empty one');
  equal(schema.buildOutcomeRecord({ op: 'orient', envelope: { result: 'weird' } }).result, 'other',
    'an unrecognised result records as other rather than being dropped');
  equal(schema.buildOutcomeRecord({ op: 'orient', duration_ms: -5, envelope: {} }).ms, null,
    'a nonsensical duration records as absent, never as a negative measurement');
  equal(schema.buildOutcomeRecord({ op: 'orient', duration_ms: NaN, envelope: {} }).ms, null,
    'a non-finite duration records as absent, never as the string NaN');
}

// ===========================================================================
// PART B — the parent-owned sidecar set.
// ===========================================================================

function partB() {
  const set = schema.PARENT_OWNED_SIDECARS;
  ok(Array.isArray(set) && set.length >= 4, 'the sidecar set is a real list (' + set.length + ' members)');
  ok(Object.isFrozen(set), 'the set is frozen — it is a kernel constant, not a mutable registry');
  deepEqual(set.slice().sort(), [...new Set(set)].sort(), 'no duplicate members');

  // THE MEMBERSHIP RULE, enforced. A member is parent-owned run telemetry, which the Layer-0
  // ruling states as `preference`. A `record` path in this set would be excluded from the leg
  // capture sweep and its leg-authored content would vanish from the merge — the exact defect
  // shape this set exists to prevent, inverted.
  for (const member of set) {
    ok(member.indexOf('.cache/') === 0, 'a sidecar lives under .cache/: ' + member);
    const ruling = schema.classifyDurableArtifact(member);
    equal(ruling.ruling, 'preference',
      'every sidecar is ruled preference — excluding a record path from the capture sweep would DROP leg content: '
      + member + ' is ruled ' + ruling.ruling);
    equal(ruling.matcher, member,
      'the sidecar has its OWN literal ruling row and is not swallowed by a broad band: ' + member);
    ok(schema.isParentOwnedSidecar(member), 'membership test agrees with the set: ' + member);
  }

  ok(set.indexOf(OUTCOME_REL) >= 0, 'the M2 outcome log is IN the set — the whole point of shipping it as a set');
  ok(set.indexOf('.cache/' + schema.NODE_TIMINGS_LOG_NAME) >= 0, 'the original hard-coded exclusion is still a member');

  // Not a member, and it must not become one by accident — a kernel record wrongly admitted
  // here is dropped from the capture sweep and vanishes from the merge.
  ok(!schema.isParentOwnedSidecar('workflow-plan.md'), 'the plan record is not a sidecar');
  ok(!schema.isParentOwnedSidecar('.cache/review-attempts.json'), 'an Evidence record is not a sidecar');
  ok(schema.isParentOwnedSidecar('./' + OUTCOME_REL), 'a ./-prefixed path normalizes to the same member');
}

// ===========================================================================
// PART C — the join, over real legs, and its mutation.
// ===========================================================================

// makeLegFixture — a REAL git repository with a project folder and two REAL leg worktrees on
// their own branches, disjoint work in each. This is the shape `synthesizeLevel` reconciles.
function makeLegFixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-m2-legs-')));
  G.init(root, { branch: 'main', email: GIT_ENV.GIT_AUTHOR_EMAIL, name: GIT_ENV.GIT_AUTHOR_NAME });
  G.git(root, ['config', 'commit.gpgsign', 'false'], STDIO_Q);
  const projectDir = path.join(root, 'kaola-workflow', PROJECT);
  const cacheDir = path.join(projectDir, '.cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  const planPath = path.join(projectDir, 'workflow-plan.md');
  fs.writeFileSync(planPath, '# Workflow Plan — ' + PROJECT + '\n');
  fs.writeFileSync(path.join(root, 'product.js'), 'module.exports = 0;\n');
  // The evidence seeds are not decoration: git does not track an empty directory, so without a
  // file in `.cache/` the leg checkouts would have no `.cache/` at all and the sidecar residue
  // this fixture exists to reproduce could not arise. A real leg is opened with its evidence
  // already seeded, which is exactly what makes the leg-side sidecar write land.
  for (const id of ['A', 'B']) fs.writeFileSync(path.join(cacheDir, id + '.md'), '# evidence ' + id + '\n');
  G.commitAll(root, 'seed', undefined, STDIO_Q);

  const legs = {};
  for (const id of ['A', 'B']) {
    const legPath = path.join(root, '.kw', 'legs', PROJECT, id);
    const legBranch = 'kw/legs/' + PROJECT + '/' + id;
    G.git(root, ['worktree', 'add', '-b', legBranch, '--', legPath, 'HEAD'], STDIO_Q);
    legs[id] = { legPath, legBranch, baseline: G.head(root) };
  }
  return { root, projectDir, cacheDir, planPath, legs };
}

function cleanup(root) {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) { /* best-effort */ }
}

// pathInTree — does `treeish` contain `rel`? Keyed on the EXIT STATUS, not on stdout: a failing
// `git rev-parse <treeish>:<path>` echoes its own argument back on stdout, so a stdout-equality
// check reads "absent" and "present" as two different non-empty strings and passes either way.
function pathInTree(root, treeish, rel) {
  return G.git(root, ['rev-parse', '--verify', '--quiet', treeish + ':' + rel]).status === 0;
}

// Dirty both legs the way a real run does: each leg's agent writes its declared file, and a
// leg-side lifecycle invocation appends to the leg's OWN copy of the sidecar. The sidecar write
// goes through the PRODUCTION writer at the REAL leg path — not a hand-written line — so the
// residue this fixture merges is the residue the runtime actually produces.
function dirtyBothLegs(fixture) {
  fs.writeFileSync(path.join(fixture.legs.A.legPath, 'ax.js'), '// A leg work\n');
  fs.writeFileSync(path.join(fixture.legs.B.legPath, 'by.js'), '// B leg work\n');
  for (const id of ['A', 'B']) {
    const legCache = path.join(fixture.legs[id].legPath, 'kaola-workflow', PROJECT, '.cache');
    const wrote = node.appendOutcomeRecord(legCache, schema.buildOutcomeRecord({
      script: 'adaptive-node', op: 'close-node', project: PROJECT, node: id,
      envelope: { result: 'ok' }, duration_ms: 100,
    }));
    ok(wrote === true, 'the PRODUCTION writer dirties leg ' + id + "'s own sidecar copy (the defect's precondition)");
  }
  // Non-vacuity: the merge below is only interesting if both legs really are carrying the path.
  for (const id of ['A', 'B']) {
    equal(G.out(fixture.legs[id].legPath, ['status', '--porcelain', '--', OUTCOME_REL.replace('.cache/', 'kaola-workflow/' + PROJECT + '/.cache/')]),
      '?? kaola-workflow/' + PROJECT + '/' + OUTCOME_REL,
      'leg ' + id + ' carries the sidecar as UNTRACKED residue before the capture');
  }
}

function partCJoin() {
  const fx = makeLegFixture();
  try {
    dirtyBothLegs(fx);
    const synth = node.synthesizeLevel(fx.root, fx.legs, 'lg-A-B', fx.planPath);
    ok(synth && synth.ok === true && typeof synth.mergeCommit === 'string',
      'THE JOIN: two legs both carrying the M2 sidecar capture and octopus-merge CLEAN, got ' + JSON.stringify(synth));

    const rel = 'kaola-workflow/' + PROJECT + '/' + OUTCOME_REL;
    ok(!pathInTree(fx.root, synth.mergeCommit, rel),
      'the sidecar is ABSENT from the merge commit tree — parent-owned, never leg-carried');
    for (const id of ['A', 'B']) {
      const tree = G.out(fx.root, ['ls-tree', '-r', '--name-only', fx.legs[id].legBranch]).split('\n');
      ok(tree.indexOf(rel) === -1, 'leg branch ' + id + ' does not track the sidecar — the add/add vector itself is gone');
    }
    // The exclusion must not have eaten the real work. This is the half that would make a
    // "fix" by over-excluding indistinguishable from a fix.
    ok(pathInTree(fx.root, synth.mergeCommit, 'ax.js') && pathInTree(fx.root, synth.mergeCommit, 'by.js'),
      "both legs' REAL writes are still captured into the merge commit");
    // And the parent's own copy is untouched by the merge: it stays where the run's telemetry
    // lives. (The parent never wrote one here — the point is that the merge did not plant one.)
    ok(!fs.existsSync(path.join(fx.cacheDir, schema.OUTCOME_LOG_NAME)),
      'the merge did not materialize a sidecar in the parent worktree');
  } finally { cleanup(fx.root); }
}

// withSidecarRemoved — run `fn` against a copy of the adaptive-node module whose kernel reports
// the sidecar set MINUS one member. This mutates the set as the PRODUCTION code sees it (the
// module is re-evaluated against a tampered kernel), which is what makes the negative result
// evidence about the code path rather than about a fixture.
function withSidecarRemoved(member, fn) {
  const schemaPath = require.resolve('./kaola-workflow-adaptive-schema');
  const nodePath = require.resolve('./kaola-workflow-adaptive-node');
  const savedSchema = require.cache[schemaPath];
  const savedNode = require.cache[nodePath];
  const mutantSchema = Object.assign({}, schema, {
    PARENT_OWNED_SIDECARS: Object.freeze(schema.PARENT_OWNED_SIDECARS.filter(p => p !== member)),
  });
  require.cache[schemaPath] = {
    id: schemaPath, filename: schemaPath, loaded: true, exports: mutantSchema, children: [], paths: [],
  };
  delete require.cache[nodePath];
  try {
    const mutant = require(nodePath);
    return fn(mutant);
  } finally {
    if (savedSchema) require.cache[schemaPath] = savedSchema; else delete require.cache[schemaPath];
    delete require.cache[nodePath];
    if (savedNode) require.cache[nodePath] = savedNode;
  }
}

function partCMutation() {
  // MUTATION 1 — drop the M2 sidecar from the set. The SAME fixture must now FAIL the merge. If
  // it does not, the join test above is not reaching the exclusion and proves nothing.
  const fx = makeLegFixture();
  try {
    dirtyBothLegs(fx);
    const synth = withSidecarRemoved(OUTCOME_REL, (mutant) => {
      ok(mutant !== node, 'the mutation loaded a SEPARATE module instance, not the cached real one');
      return mutant.synthesizeLevel(fx.root, fx.legs, 'lg-A-B', fx.planPath);
    });
    ok(synth && synth.ok === false && synth.reason === 'merge_conflict',
      'MUTATION: with the M2 sidecar removed from the SET, the same two legs fail the octopus merge add/add — '
      + 'the exclusion is load-bearing, got ' + JSON.stringify(synth));
    equal(G.out(fx.root, ['rev-parse', 'HEAD']), fx.legs.A.baseline,
      'the failed merge left HEAD unadvanced (the abort is clean), so the mutation is observed, not merely survived');
  } finally { cleanup(fx.root); }
  // The second member needs no mutation of its own: partCJoin is the control (the same fixture
  // merges clean with the set intact), and MUTATION 1 removing one member and breaking the merge
  // can only happen if the sweep iterates the set rather than naming a path.
}

// ===========================================================================
// PART D + E — fail-open, and the CLI wiring.
// ===========================================================================

// makeCliRepo — a real repository with a real FROZEN plan, the minimum a lifecycle verb needs to
// return ok. Mirrors the fixture the kernel-conformance CLI vehicle drives.
function makeCliRepo() {
  const validator = require('./kaola-workflow-plan-validator');
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-m2-cli-')));
  G.init(root, { branch: 'main', email: GIT_ENV.GIT_AUTHOR_EMAIL, name: GIT_ENV.GIT_AUTHOR_NAME });
  G.git(root, ['config', 'commit.gpgsign', 'false'], STDIO_Q);
  fs.writeFileSync(path.join(root, 'product.js'), 'module.exports = 1;\n');
  G.commitAll(root, 'root', undefined, STDIO_Q);
  G.checkout(root, 'workflow/' + PROJECT, { create: true }, STDIO_Q);

  const projectDir = path.join(root, 'kaola-workflow', PROJECT);
  const cacheDir = path.join(projectDir, '.cache');
  fs.mkdirSync(cacheDir, { recursive: true });

  let plan = [
    '# Workflow Plan — ' + PROJECT, '', '## Meta', 'project: ' + PROJECT, 'plan_form: spine',
    'labels: enhancement', 'speculative_open_policy: auto',
    'validation_command: node -e "process.exit(0)"', 'validation_timeout_minutes: 30',
    'plan_schema_version: 2', '', '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape | model | gate_claim | gate_surface | gate_aggregation | certifies |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    '| impl | tdd-guide | — | product.js | 1 | sequence | standard | — | — | — | — |',
    '| finalize | finalize | impl | — | 1 | sequence | — | — | — | — | — |',
    '', '## Design', '',
    'Decompose the spine into concrete role nodes; every sequence edge is a real data dependency (S1) or a gate ordering. Done means validation passes.',
    '', '## Acceptance', '', 'A1: the declared write set lands the change the issue asked for.',
    'A2: the recorded validation_command passes over the candidate.',
    '', '## Node Ledger', '', '| id | status |', '| --- | --- |',
    '| impl | pending |', '| finalize | pending |',
    '', '## Required Agent Compliance', '', '| Requirement | Status | Evidence | Skip Reason |',
    '| --- | --- | --- | --- |', '| tdd-guide (impl) | pending | | |', '| finalize (finalize) | pending | | |', '',
  ].join('\n');
  const planHash = validator.computePlanHash(plan);
  plan = plan.replace(/^# Workflow Plan[^\n]*\n/, match => match + '\n<!-- plan_hash: ' + planHash + ' -->\n');
  fs.writeFileSync(path.join(projectDir, 'workflow-plan.md'), plan);
  fs.writeFileSync(path.join(projectDir, 'workflow-state.md'), [
    '# Kaola-Workflow State', '', '## Project', 'name: ' + PROJECT, 'status: active', '',
    '## Current Position', 'phase: adaptive', 'phase_name: Adaptive', 'workflow_path: adaptive',
    'step: start', 'next_command: /kaola-workflow-plan-run ' + PROJECT,
    'next_skill: kaola-workflow-plan-run ' + PROJECT,
    '', '## Planning Evidence', 'plan_hash: ' + planHash, 'decision: auto-run',
    'risk: sensitivity=false blast_radius=false uncertain=false reasons=—',
    'first_node_id: impl', 'first_node_role: tdd-guide', '', '## Sink', 'branch: workflow/' + PROJECT,
    'issue_number: 843', 'sink: merge', 'main_root: ' + root, 'session_marker: m2-recorder',
    'claim_ts: 2026-07-28T00:00:00.000Z', 'worktree_path: ' + root, '',
  ].join('\n'));
  G.commitAll(root, 'seed', undefined, STDIO_Q);
  return { root, projectDir, cacheDir, logPath: path.join(cacheDir, schema.OUTCOME_LOG_NAME) };
}

function runCli(root, args) {
  // The recorder hook lives in the CLI's own `main()`, which is unreachable in-process: an
  // in-process call to a subcommand body never passes through the emit point the hook sits on.
  // argv -> handler -> envelope -> exit code -> recorded line is the whole property here.
  // spawn-class: cli-contract
  const r = spawnSync(process.execPath, [ADAPTIVE_NODE, ...args], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: Object.assign({}, process.env, GIT_ENV),
  });
  let envelope = {};
  try { envelope = JSON.parse(String(r.stdout || '').trim().split('\n').filter(Boolean).pop()); } catch (_) { envelope = {}; }
  return { status: r.status, envelope, stdout: String(r.stdout || ''), stderr: String(r.stderr || '') };
}

function readLog(logPath) {
  let raw = '';
  try { raw = fs.readFileSync(logPath, 'utf8'); } catch (_) { return []; }
  return raw.split('\n').filter(Boolean).map(line => JSON.parse(line));
}

function partE() {
  const fx = makeCliRepo();
  try {
    const orient = runCli(fx.root, ['orient', '--project', PROJECT, '--json']);
    equal(orient.status, 0, 'CLI vehicle: orient succeeds\n' + orient.stdout + orient.stderr);
    let lines = readLog(fx.logPath);
    equal(lines.length, 1, 'the CLI wrote exactly ONE record for one invocation, got ' + lines.length);
    deepEqual([lines[0].script, lines[0].op, lines[0].project, lines[0].result],
      ['adaptive-node', 'orient', PROJECT, 'ok'],
      'the CLI record is attributed: script, subcommand-as-phase, project, result');
    ok(typeof lines[0].ms === 'number' && lines[0].ms >= 0,
      'the CLI record carries a real invocation wall-clock, got ' + JSON.stringify(lines[0].ms));

    // A REFUSAL, through the real CLI. What the process boundary adds over PART A is that the
    // record describes the envelope the CALLER actually received.
    const bad = runCli(fx.root, ['close-and-open-next', '--project', PROJECT, '--node-id', 'impl', '--json']);
    lines = readLog(fx.logPath);
    equal(lines.length, 2, 'the converted answer appended a SECOND record (append-only), got ' + lines.length);
    const r = lines[1];
    // Closing an unopened node is a CONVERTED site: it reports at exit 0 rather than stopping.
    // The recorder's contract is unchanged by that and is what is pinned here — the record
    // describes the envelope the CALLER actually received, whatever result that envelope carries.
    equal(bad.status, 0, 'the converted site reports rather than stopping');
    equal(bad.envelope.result, 'answer', 'and it reports as an answer');
    deepEqual([r.op, r.node, r.result, r.reason],
      ['close-and-open-next', 'impl', 'answer', bad.envelope.reason],
      'the recorded reason IS the emitted reason, under the phase and node the invocation named');
    equal(r.condition, bad.envelope.condition == null ? bad.envelope.reason : bad.envelope.condition,
      'the recorded condition mirrors the envelope, which is the P2 census metric');
    // The discriminating payload survives the conversion INTO THE RECORD. This is the half that
    // makes a converted site auditable: exit 0 alone would leave a reader unable to tell a quiet
    // success from a reported finding.
    equal(r.family, bad.envelope.refusal_family,
      'the family rides into the record, so a report is still classifiable by a successor');
    equal(r.locus, bad.envelope.refusal_locus, 'as does the locus');

    // ...AND A SURVIVING REFUSAL, through the same vehicle. Pinning only the converted arm would
    // let a future change turn `result` into a constant and stay green: this file would then be
    // tracking the conversion rather than pinning it. The consent fence is the R2 survivor —
    // silence is never consent, so it still stops the run — which makes it the honest contrast.
    const halted = runCli(fx.root,
      ['write-halt', '--project', PROJECT, '--node-id', 'impl', '--reason', 'consent', '--json']);
    const beforeFence = readLog(fx.logPath).length;
    const fenced = runCli(fx.root, ['close-and-open-next', '--project', PROJECT, '--node-id', 'impl', '--json']);
    equal(halted.status, 0, 'the consent fence was planted (setup precondition for the contrast below)');
    const fenceLines = readLog(fx.logPath);
    equal(fenceLines.length, beforeFence + 1,
      'the fenced call appended exactly one record, got ' + (fenceLines.length - beforeFence));
    const f = fenceLines[fenceLines.length - 1];

    // The contrast, asserted as the two separate facts it is. A surviving refusal keeps BOTH the
    // non-zero exit and the `refuse` result; the converted site above keeps neither. If a later
    // change collapsed the distinction in either direction, exactly one of these two arms goes red.
    equal(fenced.status, 1, 'an unanswered consent fence still STOPS the run — silence is never consent');
    equal(fenced.envelope.result, 'refuse', 'and it is a refusal, not a report');
    deepEqual([f.op, f.node, f.result, f.reason],
      ['close-and-open-next', 'impl', 'refuse', 'halt_pending'],
      'and the recorder captures the surviving refusal under the same phase and node');
    equal(f.family, 'consent_required', 'classified into the consent family, which is what makes it a survivor');
    ok(f.result !== r.result,
      'THE PIN: the same subcommand records different results for a converted site and a surviving '
      + 'refusal. A `result` that became constant would satisfy either arm alone and is caught here, '
      + 'got ' + JSON.stringify(f.result) + ' and ' + JSON.stringify(r.result));

    // Ordering is monotonic, which is what makes triage wall-clock derivable at report time.
    ok(lines[0].ts <= lines[1].ts, 'records are appended in emit order, so inter-event gaps are derivable');
  } finally { cleanup(fx.root); }
}

function partD() {
  // --- unit: the writer absorbs a real fault. ---------------------------------------------
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-m2-open-')));
  try {
    const cacheDir = path.join(dir, '.cache');
    equal(node.appendOutcomeRecord(cacheDir, { v: 1 }), false,
      'the recorder CREATES NOTHING: an absent .cache is a silent no-op, not a mkdir');
    ok(!fs.existsSync(cacheDir), 'and the absent .cache is still absent afterwards');

    fs.mkdirSync(cacheDir);
    equal(node.appendOutcomeRecord(cacheDir, null), false, 'a null record is a no-op');

    // A REFUSAL NEVER CREATES THE LOG. Several refusals in this runtime are contractually pure
    // no-ops checked against the whole worktree porcelain (the sink-owned final-fix register
    // ladder is), and a measurement must not be the thing that breaks one. The rule is derived
    // from the outcome, not from a hand-kept list of exempt subcommands.
    equal(node.appendOutcomeRecord(cacheDir, { v: 1, op: 'final-fix-commit', result: 'refuse' }), false,
      'a refusal does NOT create the log — a zero-write refusal stays byte-for-byte zero-write');
    ok(!fs.existsSync(path.join(cacheDir, schema.OUTCOME_LOG_NAME)),
      'and no file appeared: the refusal left the worktree untouched');

    ok(node.appendOutcomeRecord(cacheDir, { v: 1, op: 'orient', result: 'ok' }) === true,
      'a SUCCESS seeds the log — it has already written whatever it writes, so this costs nothing');
    equal(node.appendOutcomeRecord(cacheDir, { v: 1, op: 'final-fix-commit', result: 'refuse' }), true,
      'and once the log exists every refusal IS recorded — which is the real-run case, since a success always precedes one');
    equal(readLog(path.join(cacheDir, schema.OUTCOME_LOG_NAME)).length, 2,
      'both lines landed, append-only');

    // Inject a REAL fault at the write: the log path is a directory, so appendFileSync throws
    // EISDIR. Asserting fail-open through a lifecycle verb alone could not distinguish "the
    // write failed and was absorbed" from "the write was never attempted".
    const faultDir = path.join(dir, 'fault', '.cache');
    fs.mkdirSync(path.join(faultDir, schema.OUTCOME_LOG_NAME), { recursive: true });
    equal(node.appendOutcomeRecord(faultDir, { v: 1, op: 'orient', result: 'ok' }), false,
      'FAIL-OPEN: a real write fault returns false and never throws');
  } finally { cleanup(dir); }

  // --- end to end: the lifecycle verb still succeeds while the recorder is failing. --------
  const fx = makeCliRepo();
  try {
    fs.rmSync(fx.logPath, { force: true });
    fs.mkdirSync(fx.logPath, { recursive: true });   // every append into this path now throws

    const orient = runCli(fx.root, ['orient', '--project', PROJECT, '--json']);
    equal(orient.status, 0,
      'FAIL-OPEN: orient still exits 0 with the recorder write failing\n' + orient.stdout + orient.stderr);
    equal(orient.envelope.result, 'ok', 'FAIL-OPEN: the envelope is unchanged by the failed recorder write');

    const open = runCli(fx.root, ['open-next', '--project', PROJECT, '--json']);
    equal(open.status, 0,
      'FAIL-OPEN: a MUTATING lifecycle verb still succeeds with the recorder write failing\n'
      + open.stdout + open.stderr);
    equal(open.envelope.result, 'ok', 'FAIL-OPEN: open-next returns ok — telemetry never refuses');
    ok(fs.statSync(fx.logPath).isDirectory(), 'the planted fault is still in place — the writes really did fail');
  } finally { cleanup(fx.root); }
}

// ===========================================================================
// PART F — THE REPORT.
//
// ---------------------------------------------------------------------------
// THE RANKING CONTRACT (pinned here; `kaola-workflow-telemetry-report.js` implements it).
//
// VERB. `node scripts/kaola-workflow-telemetry-report.js --project <name> --json`, run from the
// repository root. An ANSWER verb: exit 0 always, `result: 'ok'` always, no refusal token, no
// new mid-run halt. It is an instrument, so it also WRITES NOTHING — a reporter that appended
// its own outcome record would corrupt the very log it reads (partFPurity).
//
// INPUTS. `kaola-workflow/{project}/.cache/` — `outcome-log.jsonl` (the ranked population),
// plus `node-timings.jsonl` and `dispatch-log.jsonl` (re-dispatch evidence only). Each of the
// three is INDEPENDENTLY optional: all three writers are error-swallowing best-effort sidecars,
// so an absent one is the ordinary case and never an error (partFResults runs with neither
// re-dispatch source present). The reporter PROJECTS what the recorder wrote and re-derives
// nothing: `route` is read off the record, never re-resolved, so the report and the record can
// never disagree.
//
// ENVELOPE. `{result, v, project, totals, ranking}` in that key order. `v` is the REPORT schema
// version (1), independent of the record's own `v`.
//   totals = {events, malformed_lines, refusals, unattributed_refusals} — the denominators, so
//   a partial report says so instead of reading complete. `events` counts well-formed
//   outcome-log records ONLY. `refusals` counts `result: 'refuse'` records including the ones
//   with no reason token; `unattributed_refusals` counts that subset, which is the gap between
//   `refusals` and the sum of `count` over the ranking. Dropping them silently would let the
//   ranking understate itself.
//
// POPULATION. A row exists for each DISTINCT non-null `reason` on a `result: 'refuse'` record.
//   * `halt` is NOT ranked: the consent valve is a legitimate interrupt by design, and ranking
//     it would put a thing that must never be subtracted at the top of a subtraction list.
//   * `warn` / `ok` / `other` are NOT ranked either — but they ARE read, because the natural
//     resume after a refusal is an `ok`, and that is what closes the triage window.
//   * A reason that FIRED but never caused a re-dispatch has a ROW with `redispatch_count: 0`.
//     A reason that never fired has NO ROW. Those mean opposite things for subtraction, so
//     conflating them (a zero-filled row for every known token) is a defect, not a nicety.
//
// ROW, in this key order, every key on every row:
//   reason              the token, verbatim off the record.
//   count               refusals carrying it.
//   redispatch_count    how many of those refusals were followed by a re-dispatch inside their
//                       triage window — at most one per refusal, however many signals fire.
//                       This is the signal that the refusal cost REAL WORK rather than being
//                       self-clearing.
//   median_triage_ms    median of the MEASURED windows; even n = mean of the two middles,
//                       Math.round. `null` when nothing was measurable — never 0, because 0 is
//                       a real observation (a refusal cleared in the same millisecond) and
//                       "we could not see it" must not be reported as "it was free".
//   total_triage_ms     SUM of the measured windows. THE RANK KEY: measured aggregate
//                       interruption time is the interruption cost M3 subtracts by.
//   measured_count      how many of `count` yielded a window — the denominator that keeps the
//                       two numbers above honest.
//   routeless_count     refusals whose record carries `route: null` — an exit-less refusal, the
//                       ADR 0013 route-contract gap.
//
// TRIAGE WINDOW. For a refusal at t0 on `(script, op, node)`, the window ends at the NEXT
// outcome-log record with the same triple in APPEND order (the recorder's order is emit order).
// A window is MEASURED only when both instants parse and the delta is >= 0; a missing successor,
// an unparseable instant, and a negative delta are all UNMEASURED — never a fabricated 0.
//
// RE-DISPATCH. A `dispatch-log.jsonl` entry or a `node-timings.jsonl` `opened` event whose `ts`
// falls in (t0, t_end]. Strictly after the refusal (a spawn at the refusal instant cannot have
// been caused by it) and at-or-before the resume (a spawn at the resume instant IS the resume).
// An UNMEASURED refusal has no window and therefore contributes 0 — the instrument never
// inflates by treating "end of log" as a window.
//
// ORDER — a TOTAL order, because "the exact JSON" is flaky by construction without one:
//   1. `total_triage_ms` DESC   — cost, not frequency. A cheap refusal that fires often ranks
//                                 BELOW one expensive refusal (partFOrder).
//   2. `reason` ASC             — lexicographic, and `reason` is unique per row, so the order is
//                                 total. Deliberately only two tiers: when two reasons cost the
//                                 same measured time we have no further evidence, and inventing
//                                 a weighting over the remaining columns would be a number the
//                                 instrument cannot support.
//
// REPORT-ALL (ADR 0013 Layer 1). One malformed line degrades to one `malformed_lines` tick; it
// never takes the report down and never breaks the window pairing across it. A line is
// well-formed iff it parses as JSON to a plain object; blank lines are neither (the writer
// appends '\n', so a trailing newline must not read as damage).
//
// EMPTY IS NOT A SPECIAL CASE. An empty log, a log of blank lines, and NO LOG AT ALL produce the
// SAME well-formed empty report, byte for byte.
// ---------------------------------------------------------------------------

const EMPTY_REPORT = {
  result: 'ok', v: 1, project: PROJECT,
  totals: { events: 0, malformed_lines: 0, refusals: 0, unattributed_refusals: 0 },
  ranking: [],
};

// exactJson — BYTE equality on the canonical serialization: values, key ORDER, and no extra
// keys. `deepStrictEqual` alone would let a reshuffled or pretty-printed-by-another-name report
// through, and a "contains" assertion would pin nothing at all.
function exactJson(actual, expected, label) {
  assert.deepStrictEqual(actual, expected, label + ' (structure)');
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new assert.AssertionError({
      message: label + ' (key ORDER / bytes)\n  expected: ' + e + '\n  actual:   ' + a,
      actual: a, expected: e, operator: 'exactJson', stackStartFn: exactJson,
    });
  }
  passed += 2;
}

function at(base, seconds) {
  return new Date(Date.parse(base) + Math.round(seconds * 1000)).toISOString();
}

// outcomeLine — a fixture line built by the PRODUCTION builder, not by hand. The synthetic log is
// therefore the log the runtime actually writes; a hand-rolled shape would let the reporter be
// pinned against a record the recorder never emits.
function outcomeLine(o) {
  const rec = schema.buildOutcomeRecord({
    script: o.script || 'adaptive-node',
    op: o.op,
    project: PROJECT,
    node: o.node || null,
    ts: o.ts,
    duration_ms: o.ms == null ? 7 : o.ms,
    envelope: o.envelope || { result: o.result || 'ok', reason: o.reason || null },
  });
  assert.ok(rec && rec.op === o.op, 'fixture: buildOutcomeRecord produced a record for op ' + o.op);
  return JSON.stringify(rec);
}

function timingLine(node_, event, ts) { return JSON.stringify({ node: node_, event: event, ts: ts }); }

function dispatchLine(ts, agentType, agentId, cwd) {
  return JSON.stringify({ ts: ts, agent_type: agentType, agent_id: agentId, cwd: cwd,
    model: 'standard', model_planned: 'standard' });
}

// makeReportFixture — a real repository root carrying only the three `.cache/` sidecars. A log
// value of `null` means the file is DELIBERATELY ABSENT; a string is written verbatim (so a
// blank-line-only file can be expressed); an array is joined and newline-terminated the way the
// append-only writers leave it.
function makeReportFixture(logs) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-m2-report-')));
  G.init(root, { branch: 'main', email: GIT_ENV.GIT_AUTHOR_EMAIL, name: GIT_ENV.GIT_AUTHOR_NAME });
  G.git(root, ['config', 'commit.gpgsign', 'false'], STDIO_Q);
  const cacheDir = path.join(root, 'kaola-workflow', PROJECT, '.cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  const write = (name, value) => {
    if (value == null) return;
    const content = typeof value === 'string' ? value : (value.length ? value.join('\n') + '\n' : '');
    fs.writeFileSync(path.join(cacheDir, name), content);
  };
  write(schema.OUTCOME_LOG_NAME, logs.outcome);
  write(schema.NODE_TIMINGS_LOG_NAME, logs.timings);
  write(schema.DISPATCH_LOG_NAME, logs.dispatch);
  return { root, cacheDir };
}

function runReport(root, args) {
  // The reporter's whole contract lives at the process boundary: argv -> logs on disk -> ONE
  // JSON document -> exit code. An in-process call could not observe the exit code, which is
  // half of "this verb never refuses".
  // spawn-class: cli-contract
  const r = spawnSync(process.execPath, [TELEMETRY_REPORT].concat(args), {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: Object.assign({}, process.env, GIT_ENV),
  });
  return { status: r.status, stdout: String(r.stdout || ''), stderr: String(r.stderr || '') };
}

function reportOf(root, label) {
  const r = runReport(root, ['--project', PROJECT, '--json']);
  equal(r.status, 0, label + ': the reporter is an ANSWER verb — exit 0, always, for every input\n'
    + r.stdout + r.stderr);
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch (e) {
    throw new assert.AssertionError({
      message: label + ': --json stdout must be ONE JSON document; got ' + JSON.stringify(r.stdout)
        + (r.stderr ? '\n  stderr: ' + r.stderr : ''),
      actual: r.stdout, expected: '<one JSON document>', operator: 'JSON.parse', stackStartFn: reportOf,
    });
  }
  return { parsed: parsed, raw: r.stdout };
}

// snapshotTree — content-addressed listing of everything under `dir` except `.git`. Timestamps
// and inode noise are deliberately excluded: the claim is about BYTES, so that a "no writes"
// verdict is about the artifact rather than about the filesystem's bookkeeping.
function snapshotTree(dir) {
  const out = [];
  const walk = (d, rel) => {
    const entries = fs.readdirSync(d, { withFileTypes: true })
      .filter(e => !(rel === '' && e.name === '.git'))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      const p = path.join(d, e.name);
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) { out.push('d ' + r); walk(p, r); continue; }
      out.push('f ' + r + ' ' + crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'));
    }
  };
  walk(dir, '');
  return out.join('\n');
}

// --- F0: the artifact itself. ---------------------------------------------------------------
function partFExists() {
  ok(fs.existsSync(TELEMETRY_REPORT),
    'ADR 0013 M2 acceptance: the ranking reporter must exist at ' + TELEMETRY_REPORT
    + ' — a recorder nobody reads measures nothing');
}

// --- F1: THE HEADLINE — two reasons and one re-dispatch, exact ranking JSON. ------------------
//
// The acceptance bullet, literally. Everything in this fixture is load-bearing:
//   * A MALFORMED line sits BETWEEN the first refusal and its resume, so an implementation that
//     aborts on it — or that loses window pairing across it — produces a different report.
//   * The first refusal's window carries BOTH re-dispatch signals (a dispatch-log entry AND a
//     node-timings `opened`). `redispatch_count` is per-REFUSAL, so a signal-counting
//     implementation reports 2 where the contract says 1.
//   * A node-timings `closed` sits inside the second refusal's window: only `opened` counts.
//   * A dispatch entry sits AFTER every window: out-of-window signals count nowhere.
//   * `record-evidence` sits between the first refusal and its resume on the SAME node — a
//     different `op`, so it does NOT close the window. The window is the whole stop-to-resume
//     interval, recovery work included, which is the interruption cost being measured.
//   * `no_ready_node` FIRED and was never re-dispatched: it has a row reading 0, which is a
//     different fact from `halt_pending`, which never fired and has no row at all.
function partFHeadline() {
  const B = '2026-07-28T10:00:00.000Z';
  const fx = makeReportFixture({
    outcome: [
      outcomeLine({ op: 'orient', ts: at(B, 0), result: 'ok' }),
      outcomeLine({ op: 'close-and-open-next', node: 'n2', ts: at(B, 10), result: 'refuse', reason: 'evidence_absent' }),
      '{"v":1,"op":"close-and-open-next"',                       // truncated: report-all, not report-none
      outcomeLine({ op: 'record-evidence', node: 'n2', ts: at(B, 25), result: 'ok' }),
      outcomeLine({ op: 'close-and-open-next', node: 'n2', ts: at(B, 40), result: 'ok' }),
      outcomeLine({ op: 'close-and-open-next', node: 'n5', ts: at(B, 55), result: 'refuse', reason: 'evidence_absent' }),
      outcomeLine({ op: 'close-and-open-next', node: 'n5', ts: at(B, 60), result: 'ok' }),
      outcomeLine({ op: 'open-next', ts: at(B, 70), result: 'refuse', reason: 'no_ready_node' }),
      outcomeLine({ op: 'open-next', ts: at(B, 80), result: 'ok' }),
    ],
    timings: [
      timingLine('n2', 'opened', at(B, 30)),   // in window 1 — the SECOND signal for the same refusal
      timingLine('n5', 'closed', at(B, 57)),   // in window 2, but `closed` is not a re-dispatch
      timingLine('n9', 'opened', at(B, 95)),   // after every window
    ],
    dispatch: [
      dispatchLine(at(B, 20), 'tdd-guide', 'd1', '/tmp/leg'),    // in window 1
      dispatchLine(at(B, 90), 'implementer', 'd2', '/tmp/leg'),  // after every window
    ],
  });
  try {
    const { parsed } = reportOf(fx.root, 'headline');
    exactJson(parsed, {
      result: 'ok', v: 1, project: PROJECT,
      totals: { events: 8, malformed_lines: 1, refusals: 3, unattributed_refusals: 0 },
      ranking: [
        { reason: 'evidence_absent', count: 2, redispatch_count: 1, median_triage_ms: 17500,
          total_triage_ms: 35000, measured_count: 2, routeless_count: 0 },
        { reason: 'no_ready_node', count: 1, redispatch_count: 0, median_triage_ms: 10000,
          total_triage_ms: 10000, measured_count: 1, routeless_count: 1 },
      ],
    }, 'THE HEADLINE: two reasons and one re-dispatch yield the EXACT ranking JSON');

    // Said again as a claim rather than as a shape, because this is the distinction the whole
    // subtraction campaign turns on and an exact-JSON assertion states it only implicitly.
    const fired = parsed.ranking.filter(r => r.reason === 'no_ready_node');
    equal(fired.length, 1, 'a reason that FIRED has a row even with redispatch_count 0');
    equal(fired[0].redispatch_count, 0, 'and that row reads 0 — self-clearing, not free');
    equal(parsed.ranking.filter(r => r.reason === 'halt_pending').length, 0,
      'a reason that NEVER FIRED has NO row — the opposite fact, and it must not be zero-filled');
  } finally { cleanup(fx.root); }
}

// --- F2: empty is not a special case. --------------------------------------------------------
function partFEmpty() {
  const cases = [
    ['an EMPTY log file', { outcome: '' }],
    ['NO log file at all', { outcome: null }],
    ['a log of BLANK LINES (the writer appends \\n; a trailing newline is not damage)', { outcome: '\n\n\n' }],
  ];
  const seen = [];
  for (const [label, logs] of cases) {
    const fx = makeReportFixture(logs);
    try {
      const { parsed } = reportOf(fx.root, label);
      exactJson(parsed, EMPTY_REPORT, label + ' produces the WELL-FORMED empty report');
      seen.push(JSON.stringify(parsed));
    } finally { cleanup(fx.root); }
  }
  equal(new Set(seen).size, 1,
    'absent, empty and blank-only are the SAME report byte for byte — no special case for any of them');

  // ...and "empty ranking" is not the same as "empty log": a run with successes and no refusals
  // reports a real denominator. A reporter that returned EMPTY_REPORT here would be measuring
  // nothing while reading correct.
  const B = '2026-07-28T14:00:00.000Z';
  const fx = makeReportFixture({ outcome: [
    outcomeLine({ op: 'orient', ts: at(B, 0), result: 'ok' }),
    outcomeLine({ op: 'open-next', node: 'n1', ts: at(B, 1), result: 'ok' }),
    outcomeLine({ op: 'close-node', node: 'n1', ts: at(B, 2), result: 'ok' }),
  ] });
  try {
    const { parsed } = reportOf(fx.root, 'successes only');
    exactJson(parsed, {
      result: 'ok', v: 1, project: PROJECT,
      totals: { events: 3, malformed_lines: 0, refusals: 0, unattributed_refusals: 0 },
      ranking: [],
    }, 'a log of pure successes ranks nothing but still reports its denominator');
  } finally { cleanup(fx.root); }
}

// --- F3: report-all — a wholly damaged log still answers. -------------------------------------
function partFReportAll() {
  const fx = makeReportFixture({ outcome:
    ['not json at all', '[1,2,3]', '"a string"', 'null', '', '{"unterminated": '].join('\n') + '\n' });
  try {
    const { parsed } = reportOf(fx.root, 'wholly damaged log');
    exactJson(parsed, {
      result: 'ok', v: 1, project: PROJECT,
      totals: { events: 0, malformed_lines: 5, refusals: 0, unattributed_refusals: 0 },
      ranking: [],
    }, 'REPORT-ALL: five damaged lines are five ticks, not a crash — and the blank line is not damage');
  } finally { cleanup(fx.root); }
}

// --- F4: the order is TOTAL, and it ranks cost rather than frequency. -------------------------
//
// Two arms, both non-vacuous by construction:
//   COST > FREQUENCY. `mm_cheap` fires THREE times and is written FIRST; it ranks LAST, because
//   the three stops cost 1.5s between them where `xx_costly` cost 9s in one. A count-ordered or
//   insertion-ordered implementation is red here.
//   TIE-BREAK. `zz_tied` and `aa_tied` cost exactly the same, and `zz_tied` is written FIRST. The
//   contract says lexicographic, so `aa_tied` must come first; a stable sort over input order is
//   red here. Without this arm the "exact JSON" assertion would be flaky by construction.
// `mm_cheap` also fires under TWO different scripts: the ranking is per REASON, aggregated across
// every instrumented CLI, which is the whole point of a cross-CLI recorder.
function partFOrder() {
  const B = '2026-07-28T11:00:00.000Z';
  const fx = makeReportFixture({ outcome: [
    outcomeLine({ script: 'claim', op: 'startup', ts: at(B, 0), result: 'refuse', reason: 'mm_cheap' }),
    outcomeLine({ script: 'claim', op: 'startup', ts: at(B, 0.5), result: 'ok' }),
    outcomeLine({ op: 'open-next', ts: at(B, 2), result: 'refuse', reason: 'zz_tied' }),
    outcomeLine({ op: 'open-next', ts: at(B, 4), result: 'ok' }),
    outcomeLine({ op: 'close-node', node: 'n1', ts: at(B, 6), result: 'refuse', reason: 'aa_tied' }),
    outcomeLine({ op: 'close-node', node: 'n1', ts: at(B, 8), result: 'ok' }),
    outcomeLine({ op: 'open-ready', ts: at(B, 10), result: 'refuse', reason: 'mm_cheap' }),
    outcomeLine({ op: 'open-ready', ts: at(B, 10.5), result: 'ok' }),
    outcomeLine({ op: 'record-evidence', node: 'n2', ts: at(B, 12), result: 'refuse', reason: 'mm_cheap' }),
    outcomeLine({ op: 'record-evidence', node: 'n2', ts: at(B, 12.5), result: 'ok' }),
    outcomeLine({ op: 'expand-close', node: 'n3', ts: at(B, 14), result: 'refuse', reason: 'xx_costly' }),
    outcomeLine({ op: 'expand-close', node: 'n3', ts: at(B, 23), result: 'ok' }),
  ] });
  try {
    const { parsed } = reportOf(fx.root, 'ordering');
    exactJson(parsed, {
      result: 'ok', v: 1, project: PROJECT,
      totals: { events: 12, malformed_lines: 0, refusals: 6, unattributed_refusals: 0 },
      ranking: [
        { reason: 'xx_costly', count: 1, redispatch_count: 0, median_triage_ms: 9000,
          total_triage_ms: 9000, measured_count: 1, routeless_count: 1 },
        { reason: 'aa_tied', count: 1, redispatch_count: 0, median_triage_ms: 2000,
          total_triage_ms: 2000, measured_count: 1, routeless_count: 1 },
        { reason: 'zz_tied', count: 1, redispatch_count: 0, median_triage_ms: 2000,
          total_triage_ms: 2000, measured_count: 1, routeless_count: 1 },
        { reason: 'mm_cheap', count: 3, redispatch_count: 0, median_triage_ms: 500,
          total_triage_ms: 1500, measured_count: 3, routeless_count: 3 },
      ],
    }, 'THE ORDER: cost outranks frequency, and equal cost breaks lexicographically');
  } finally { cleanup(fx.root); }
}

// --- F5: unmeasured is not free, and a measurement is never fabricated. -----------------------
//
// Four refusals, none of which yields a positive window, and the four outcomes are deliberately
// NOT the same number:
//   tail_unmeasured  no successor at all               -> median null, measured 0
//   clock_skew       successor stamped EARLIER          -> a negative delta is not a measurement
//   bad_clock        its own instant does not parse     -> unmeasurable
//   instant_clear    successor in the SAME millisecond  -> median 0, measured 1 (a real zero)
// `median_triage_ms: null` beside `median_triage_ms: 0` is the honesty pin: an unseen cost
// reported as zero would rank a wedge at the bottom of the subtraction list.
// A dispatch entry and a node-timings `opened` sit just after the unmeasured tail refusal: with
// no window they belong to nothing, so an implementation that runs an open window to end-of-log
// reports a re-dispatch the run never made.
function partFUnmeasured() {
  const B = '2026-07-28T12:00:00.000Z';
  const fx = makeReportFixture({
    outcome: [
      outcomeLine({ op: 'orient', ts: at(B, 0), result: 'ok' }),
      outcomeLine({ op: 'close-node', node: 'n1', ts: at(B, 1), result: 'refuse', reason: 'tail_unmeasured' }),
      outcomeLine({ op: 'open-next', ts: at(B, 2), result: 'refuse', reason: 'clock_skew' }),
      outcomeLine({ op: 'open-next', ts: at(B, 1), result: 'ok' }),               // EARLIER than the refusal
      outcomeLine({ op: 'unlock', ts: 'not-a-timestamp', result: 'refuse', reason: 'bad_clock' }),
      outcomeLine({ op: 'unlock', ts: at(B, 6), result: 'ok' }),
      outcomeLine({ op: 'repair-node', node: 'n4', ts: at(B, 7), result: 'refuse', reason: 'instant_clear' }),
      outcomeLine({ op: 'repair-node', node: 'n4', ts: at(B, 7), result: 'ok' }), // same instant
    ],
    timings: [timingLine('n1', 'opened', at(B, 4))],
    dispatch: [dispatchLine(at(B, 3), 'tdd-guide', 'd1', '/tmp/leg')],
  });
  try {
    const { parsed } = reportOf(fx.root, 'unmeasured');
    exactJson(parsed, {
      result: 'ok', v: 1, project: PROJECT,
      totals: { events: 8, malformed_lines: 0, refusals: 4, unattributed_refusals: 0 },
      ranking: [
        { reason: 'bad_clock', count: 1, redispatch_count: 0, median_triage_ms: null,
          total_triage_ms: 0, measured_count: 0, routeless_count: 1 },
        { reason: 'clock_skew', count: 1, redispatch_count: 0, median_triage_ms: null,
          total_triage_ms: 0, measured_count: 0, routeless_count: 1 },
        { reason: 'instant_clear', count: 1, redispatch_count: 0, median_triage_ms: 0,
          total_triage_ms: 0, measured_count: 1, routeless_count: 1 },
        { reason: 'tail_unmeasured', count: 1, redispatch_count: 0, median_triage_ms: null,
          total_triage_ms: 0, measured_count: 0, routeless_count: 1 },
      ],
    }, 'UNMEASURED is null, not 0 — and a real 0 is still a measurement');
  } finally { cleanup(fx.root); }
}

// --- F5b: the two window boundaries, which are the whole difference between `>` and `>=`. -----
//
// Both instants are pinned because both are decidable and neither is obvious. A spawn stamped at
// the REFUSAL instant cannot have been caused by the refusal, so the window opens strictly after
// it; a spawn stamped at the RESUME instant IS the resume, so the window closes inclusively. Left
// unpinned this is prose, and an off-by-one here silently inflates the one number the whole
// subtraction campaign is ranked by. The two signal SOURCES are split across the two boundaries
// so neither source is pinned at only one edge.
// The pair also ties on cost, so the lexicographic tie-break decides — and it decides AGAINST the
// order the log was written in.
function partFWindowBoundary() {
  const B = '2026-07-28T15:00:00.000Z';
  const fx = makeReportFixture({
    outcome: [
      outcomeLine({ op: 'orient', ts: at(B, 0), result: 'ok' }),
      outcomeLine({ op: 'close-node', node: 'n1', ts: at(B, 10), result: 'refuse', reason: 'boundary_open' }),
      outcomeLine({ op: 'close-node', node: 'n1', ts: at(B, 20), result: 'ok' }),
      outcomeLine({ op: 'open-next', ts: at(B, 30), result: 'refuse', reason: 'boundary_close' }),
      outcomeLine({ op: 'open-next', ts: at(B, 40), result: 'ok' }),
    ],
    timings: [timingLine('n1', 'opened', at(B, 10))],                        // AT the refusal instant
    dispatch: [dispatchLine(at(B, 40), 'tdd-guide', 'd1', '/tmp/leg')],      // AT the resume instant
  });
  try {
    const { parsed } = reportOf(fx.root, 'window boundary');
    exactJson(parsed, {
      result: 'ok', v: 1, project: PROJECT,
      totals: { events: 5, malformed_lines: 0, refusals: 2, unattributed_refusals: 0 },
      ranking: [
        { reason: 'boundary_close', count: 1, redispatch_count: 1, median_triage_ms: 10000,
          total_triage_ms: 10000, measured_count: 1, routeless_count: 1 },
        { reason: 'boundary_open', count: 1, redispatch_count: 0, median_triage_ms: 10000,
          total_triage_ms: 10000, measured_count: 1, routeless_count: 1 },
      ],
    }, 'THE WINDOW IS (t0, t_end]: a signal at the refusal instant is not caused by it; one at the resume instant IS the resume');
  } finally { cleanup(fx.root); }
}

// --- F6: what is NOT ranked, and what is not silently dropped. --------------------------------
//
// A `halt` is the consent valve — a legitimate interrupt by design, and the one thing on this
// list that must never be subtracted, so it is never ranked. A `warn` carrying the SAME token as
// a real refusal must not inflate that refusal's row. An unrecognised result is neither. And a
// refusal with NO reason token cannot be ranked but must not vanish: it is counted twice over, in
// `refusals` and in `unattributed_refusals`, so the gap between the ranking and the population is
// visible instead of silent.
function partFResults() {
  const B = '2026-07-28T13:00:00.000Z';
  const fx = makeReportFixture({ outcome: [
    outcomeLine({ op: 'orient', ts: at(B, 0), result: 'ok' }),
    outcomeLine({ op: 'close-node', node: 'n1', ts: at(B, 1), result: 'refuse', reason: 'evidence_absent' }),
    outcomeLine({ op: 'close-node', node: 'n1', ts: at(B, 3), result: 'ok' }),
    outcomeLine({ op: 'open-next', ts: at(B, 5), envelope: { result: 'halt', reason: 'halt_pending' } }),
    outcomeLine({ op: 'open-next', ts: at(B, 6), result: 'ok' }),
    outcomeLine({ op: 'record-evidence', node: 'n2', ts: at(B, 7), envelope: { result: 'warn', reason: 'evidence_absent' } }),
    outcomeLine({ op: 'record-evidence', node: 'n2', ts: at(B, 8), result: 'ok' }),
    outcomeLine({ op: 'unlock', ts: at(B, 9), envelope: { result: 'refuse' } }),   // no reason token
    outcomeLine({ op: 'unlock', ts: at(B, 10), result: 'ok' }),
    outcomeLine({ op: 'mirror-project', ts: at(B, 11), envelope: { result: 'weird' } }),
  ] });
  try {
    const { parsed } = reportOf(fx.root, 'result vocabulary');
    exactJson(parsed, {
      result: 'ok', v: 1, project: PROJECT,
      totals: { events: 10, malformed_lines: 0, refusals: 2, unattributed_refusals: 1 },
      ranking: [
        { reason: 'evidence_absent', count: 1, redispatch_count: 0, median_triage_ms: 2000,
          total_triage_ms: 2000, measured_count: 1, routeless_count: 0 },
      ],
    }, 'only `refuse` is ranked; a halt/warn/other is read but never counted, and a reason-less refusal is never dropped');

    // routeless_count is read OFF the record, not re-derived: `evidence_absent` ships a route, so
    // its row reads 0 while every fabricated token in F4/F5 reads its full count.
    equal(parsed.ranking[0].routeless_count, 0,
      'a refusal whose record carries a route is NOT routeless — the reporter projects, it does not re-classify');
  } finally { cleanup(fx.root); }
}

// --- F7: the instrument does not change what it measures. -------------------------------------
//
// The reporter reads the very log the recorder appends to. If it recorded its own invocation —
// or created a `.cache/`, or rewrote a sidecar — every later report would be measuring the
// reporter. It is a read-only ANSWER verb, and that is checked on BYTES, not on intent.
function partFPurity() {
  const B = '2026-07-28T10:00:00.000Z';
  const fx = makeReportFixture({
    outcome: [
      outcomeLine({ op: 'orient', ts: at(B, 0), result: 'ok' }),
      outcomeLine({ op: 'close-node', node: 'n1', ts: at(B, 1), result: 'refuse', reason: 'evidence_absent' }),
      outcomeLine({ op: 'close-node', node: 'n1', ts: at(B, 4), result: 'ok' }),
    ],
    timings: [timingLine('n1', 'opened', at(B, 2))],
    dispatch: [dispatchLine(at(B, 3), 'tdd-guide', 'd1', '/tmp/leg')],
  });
  try {
    const before = snapshotTree(fx.root);
    const first = reportOf(fx.root, 'purity/1');
    const after = snapshotTree(fx.root);
    equal(after, before,
      'THE INSTRUMENT DOES NOT MOVE THE NEEDLE: the reporter left the project tree byte-identical — '
      + 'no self-recorded outcome line, no created directory, no rewritten sidecar');

    // Two re-dispatch signals, one refusal: the row reads 1.
    exactJson(first.parsed, {
      result: 'ok', v: 1, project: PROJECT,
      totals: { events: 3, malformed_lines: 0, refusals: 1, unattributed_refusals: 0 },
      ranking: [
        { reason: 'evidence_absent', count: 1, redispatch_count: 1, median_triage_ms: 3000,
          total_triage_ms: 3000, measured_count: 1, routeless_count: 0 },
      ],
    }, 'purity fixture ranks as specified');

    const second = reportOf(fx.root, 'purity/2');
    equal(second.raw, first.raw,
      'the report is a PURE FUNCTION of the logs — a second run is byte-identical, so no wall-clock, '
      + 'path or iteration-order value leaked into it');
  } finally { cleanup(fx.root); }
}

// ===========================================================================

function main() {
  partA();
  partB();
  partCJoin();
  partCMutation();
  partE();
  partD();
  partFExists();
  partFHeadline();
  partFEmpty();
  partFReportAll();
  partFOrder();
  partFUnmeasured();
  partFWindowBoundary();
  partFResults();
  partFPurity();
  process.stdout.write('outcome recorder tests passed (' + passed + ' assertions)\n');
}

if (require.main === module) main();

// The PART F scenarios are exported individually so the reporter can be driven one property at a
// time while it is being built — the suite itself aborts on the first failure, which is the wrong
// granularity for that loop.
module.exports = {
  makeLegFixture, makeCliRepo, withSidecarRemoved, RECORD_KEYS,
  EMPTY_REPORT, makeReportFixture, runReport,
  partFExists, partFHeadline, partFEmpty, partFReportAll, partFOrder, partFUnmeasured,
  partFWindowBoundary, partFResults, partFPurity,
};
