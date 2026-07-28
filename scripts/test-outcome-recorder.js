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
// Run: node scripts/test-outcome-recorder.js
// ---------------------------------------------------------------------------

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const G = require('./test-git-fixture');
const schema = require('./kaola-workflow-adaptive-schema');
const node = require('./kaola-workflow-adaptive-node');

const SCRIPTS = __dirname;
const ADAPTIVE_NODE = path.join(SCRIPTS, 'kaola-workflow-adaptive-node.js');
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
    ok(bad.status !== 0, 'CLI vehicle: closing an unopened node refuses');
    lines = readLog(fx.logPath);
    equal(lines.length, 2, 'the refusal appended a SECOND record (append-only), got ' + lines.length);
    const r = lines[1];
    deepEqual([r.op, r.node, r.result, r.reason],
      ['close-and-open-next', 'impl', 'refuse', bad.envelope.reason],
      'the recorded reason IS the emitted reason, under the phase and node the invocation named');
    equal(r.condition, bad.envelope.condition == null ? bad.envelope.reason : bad.envelope.condition,
      'the recorded condition mirrors the envelope, which is the P2 census metric');

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

function main() {
  partA();
  partB();
  partCJoin();
  partCMutation();
  partE();
  partD();
  process.stdout.write('outcome recorder tests passed (' + passed + ' assertions)\n');
}

if (require.main === module) main();

module.exports = { makeLegFixture, makeCliRepo, withSidecarRemoved, RECORD_KEYS };
