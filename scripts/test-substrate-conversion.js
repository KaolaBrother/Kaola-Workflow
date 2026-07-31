#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// test-substrate-conversion.js — the ONE actionable-result predicate, and the exit-0 REPORT
// that has to keep carrying its finding.
//
// TEST INFRASTRUCTURE ONLY. Nothing here is shipped, installed, or imported by a production
// script.
//
// THE PROPERTY THE WHOLE CONVERSION WAVE RESTS ON. A converted site changes its verdict and its
// exit code and NOTHING ELSE: `result: 'answer'` at exit 0, still carrying `condition`,
// `refusal_family`, `refusal_locus` and `refusal_route`. Delete the verdict, keep the
// measurement. A conversion that emits a verdict and drops the projection is not a conversion —
// it is a deletion, and it is a SILENT one, because the envelope still looks well-formed and
// simply carries less truth.
//
// The predicate that decides who gets that projection was the identical literal triple
// (`refuse` / `halt` / `warn`) written out at THREE sites. It is now one exported kernel
// function, `isActionableResult`, with `answer` as a fourth member.
//
//   PART 1 — an `answer` carrying a real condition keeps the FULL projection, and it is the
//            IDENTICAL projection the same token gets at `result: 'refuse'`. That equality is
//            the conversion's whole claim, stated as an assertion rather than as prose.
//   PART 1b— and the route it keeps is REACHABLE: driven at the CLI boundary, with a bogus verb
//            as the control. An exit that does not work is a build-time red, not a surprise.
//   PART 2 — the claim surface's SHIPPED `answer` envelopes are NOT retro-stamped. Driven
//            through the real CLI, then compared byte-for-byte against a pre-serialized copy.
//   PART 3 — `buildOutcomeRecord` classifies an `answer` as `family`, never as `'other'`.
//   PART 4 — `refuse` / `halt` / `warn` are unchanged.
//   PART 5 — the predicate is GENUINELY SHARED: the aggregator's `decorateOperatorHint` and the
//            kernel's `stampRefusalEnvelope` are DRIVEN and must agree for every member and for
//            non-members; plus an in-suite mutation of the kernel predicate that the aggregator
//            must FOLLOW. A second copy of the same four words passes the agreement arm and
//            fails the mutation arm — which is why both are here.
//   PART 6 — cross-edition parity. The schema is the drift anchor; all four trees are DRIVEN,
//            not read.
//
// ---------------------------------------------------------------------------
// MUTATION LOG — every pin here was un-wired against the production code and OBSERVED RED. A
// green suite is not evidence a guard is armed, so this block is the evidence, and it records
// the observed failure text rather than the intent.
//
// METHOD. `scripts/` and the three `plugins/*/scripts/` kernels are copied to a scratch mirror,
// the mutation is applied to the MIRROR, and the suite runs from there. The working tree is
// never mutated — it carries uncommitted work by other agents, so `git checkout --` would have
// destroyed the very implementation under test. Where a mutation's first casualty is in an
// EARLIER part (the suite aborts on first failure), the later part was ALSO driven on its own
// against the same mutant; those rows say `[part alone]`.
//
//   M1  ACTIONABLE_RESULTS loses 'answer'                             -> PART 1 RED, PART 3 RED
//       PART 1: "an `answer` carrying a real condition mirrors its legacy token into
//                `condition` — the census metric"  + undefined  - 'scheduler_lock_stale'
//       PART 3 [part alone]: "an `answer` classifies into the kernel vocabulary"
//                null !== 'family'
//
//   M2  the stamp gains `|| envelope.status` as a legacy token        -> PART 2 RED (transcribed arm)
//       "a `status`/`reasoning`-shaped `answer` (target_unverified) is never retro-stamped"
//       + ...,"reasoning":"unverified","condition":"target_unverified"}
//       HONEST NOTE: this mutation does NOT reach the DRIVEN arm — the shipped `pick-next`
//       envelope keys its verdict as `verdict`, not `status` — so the driven pin needed its own
//       mutation, M2b. Recorded because "PART 2 went red" would have been true and misleading.
//
//   M2b the stamp gains `|| envelope.verdict`                         -> PART 2 RED (driven arm)
//       "DRIVEN: the shipped claim-surface `answer` envelope survives the stamp BYTE-IDENTICAL"
//       + {"verdict":"no_target",...,"reasoning":"usage: --target-issue <N> ...","condition":"no_target"}
//
//   M3  decorateOperatorHint reverts to its own literal TRIPLE        -> PART 5 (agreement) RED
//       "result 'answer': the aggregator and the kernel agree on the projection"
//       false !== true
//
//   M4  decorateOperatorHint keeps a local FOUR-member literal        -> PART 5 (mutation) RED
//       "MUTATION: with 'answer' removed from the KERNEL predicate the aggregator must decline
//        it too — a local copy would still stamp"   true !== false
//       The AGREEMENT arm stays GREEN under M4, which is precisely why both arms exist: a copy
//       that is currently in step is invisible to agreement and visible only to mutation.
//
//   M5  ACTIONABLE_RESULTS loses 'refuse'                             -> PART 1 RED, PART 4 RED
//       PART 1: "DELETE THE VERDICT, KEEP THE MEASUREMENT: the projection is byte-identical
//                between the refusing and the reporting form of the same finding"
//       PART 4 [part alone]: "a classified L1 refusal still projects family/locus/route
//                unchanged"   + undefined  - 'kernel_evidence_missing'
//
//   M6  the gitea edition's ACTIONABLE_RESULTS loses 'answer'         -> PART 6 RED
//       "plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js:
//        ACTIONABLE_RESULTS agrees with the root kernel"   - 'answer'
//
//   M7  the lock route names `unlok` instead of `unlock`              -> PART 1b RED [part alone]
//       "the `answer` envelope routes to a verb the CLI ACTUALLY DISPATCHES (unlok), got
//        {"result":"refuse","errors":["unknown subcommand: unlok"]}"
//
// NO PIN IN THIS FILE SURVIVED ITS OWN MUTATION. The one thing that could not be mutation-proved
// is stated in PART 4: `result: 'warn'` has no production emitter, so its arm is a pin on the
// predicate member, not on a live surface.
//
// Run: node scripts/test-substrate-conversion.js
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
const REPO = path.resolve(__dirname, '..');
const CLAIM = path.join(SCRIPTS, 'kaola-workflow-claim.js');
const ADAPTIVE_NODE = path.join(SCRIPTS, 'kaola-workflow-adaptive-node.js');
const PROJECT = 'issue-871';
const STDIO_Q = { stdio: ['ignore', 'ignore', 'ignore'] };
const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Substrate Conversion', GIT_AUTHOR_EMAIL: 'adr16@example.com',
  GIT_COMMITTER_NAME: 'Substrate Conversion', GIT_COMMITTER_EMAIL: 'adr16@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
};

// The probe token: a `kernel_lock_held` member, which is on the conversion list and whose route
// is a REAL adaptive-node verb (proved reachable at the process boundary in PART 1).
const LOCK_TOKEN = 'scheduler_lock_stale';

let passed = 0;
function ok(value, message) { assert.ok(value, message); passed++; }
function equal(actual, expected, message) { assert.strictEqual(actual, expected, message); passed++; }
function deepEqual(actual, expected, message) { assert.deepStrictEqual(actual, expected, message); passed++; }

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* best-effort */ }
}

// makeRepo — the minimum a CLI probe needs: a real repository root, so `getRoot()` resolves to
// somewhere this test owns rather than to whatever tree the suite happens to run under.
function makeRepo(tag) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-substrate-' + tag + '-')));
  G.init(root, { branch: 'main', email: GIT_ENV.GIT_AUTHOR_EMAIL, name: GIT_ENV.GIT_AUTHOR_NAME });
  G.git(root, ['config', 'commit.gpgsign', 'false'], STDIO_Q);
  fs.writeFileSync(path.join(root, 'product.js'), 'module.exports = 1;\n');
  G.commitAll(root, 'seed', undefined, STDIO_Q);
  return root;
}

function runCli(script, root, args) {
  // The shipped envelope only exists at the process boundary: argv -> handler -> envelope ->
  // exit code. Transcribing the object literal out of the source would pin my reading of the
  // code rather than what the surface actually emits, which is the whole point of PART 2.
  // spawn-class: cli-contract
  const r = spawnSync(process.execPath, [script].concat(args), {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: Object.assign({}, process.env, GIT_ENV, { KAOLA_WORKFLOW_OFFLINE: '1' }),
  });
  let envelope = null;
  try { envelope = JSON.parse(String(r.stdout || '').trim().split('\n').filter(Boolean).pop()); }
  catch (_) { envelope = null; }
  return { status: r.status, envelope, stdout: String(r.stdout || ''), stderr: String(r.stderr || '') };
}

// projectRoute — the route as a comparable shape. `args` is operator prose and is asserted
// separately as non-empty; pinning its wording here would make a reworded hint read as a
// deleted route.
function projectRoute(route) {
  if (!route || typeof route !== 'object') return route;
  return { verb: route.verb, script: route.script };
}

// ===========================================================================
// PART 1 — an `answer` keeps the full projection, identically to a `refuse`.
// ===========================================================================

function partAnswerProjection() {
  // The exact envelope a converted `kernel_lock_held` site emits: exit-0 report, legacy token
  // intact, nothing else set by the caller.
  const answer = { result: 'answer', reason: LOCK_TOKEN };
  schema.stampRefusalEnvelope(answer);

  equal(answer.condition, LOCK_TOKEN,
    'an `answer` carrying a real condition mirrors its legacy token into `condition` — the census metric');
  equal(answer.refusal_family, 'kernel_lock_held',
    'an `answer` carrying a real condition is stamped with its family');
  equal(answer.refusal_locus, 'L1', 'an `answer` carries its locus');
  ok(answer.refusal_route && typeof answer.refusal_route === 'object',
    'an `answer` carries a route — the only thing telling a reader what to do about a finding '
    + 'that no longer stops them, got ' + JSON.stringify(answer.refusal_route));

  // THE FIVE KERNEL FIELDS, as one assertion rather than five. Projecting the envelope down to
  // exactly these keys is what makes a DELETION red while leaving the envelope free to carry more.
  //
  // This deliberately does NOT assert "and nothing else". It used to, and that was wrong: the
  // stamp also writes back the classifier's derived DISCRIMINATOR (`kind` for a lock, `record`
  // for a CAS loss), which is additive measurement of exactly the sort this campaign exists to
  // keep. A no-more-no-less pin makes every future field a red and pushes back against adding
  // the very data the design wants — it protects the shape instead of the content. What must
  // never happen is one of these five going missing, and that is what is pinned.
  const KERNEL_FIELDS = ['result', 'reason', 'condition', 'refusal_family', 'refusal_locus', 'refusal_route'];
  const projectKernel = (e) => {
    const out = {};
    for (const k of KERNEL_FIELDS) if (k in e) out[k] = k === 'refusal_route' ? projectRoute(e[k]) : e[k];
    return out;
  };
  deepEqual(projectKernel(answer), {
    result: 'answer', reason: LOCK_TOKEN, condition: LOCK_TOKEN,
    refusal_family: 'kernel_lock_held', refusal_locus: 'L1',
    refusal_route: { verb: 'unlock', script: 'adaptive-node' },
  }, 'the `answer` projection carries all five kernel fields with exactly these values');
  ok(typeof answer.refusal_route.args === 'string' && answer.refusal_route.args,
    'the route carries pasteable arguments, got ' + JSON.stringify(answer.refusal_route.args));
  // Anything BEYOND the five is discriminating payload, never a null-filled placeholder. Absence
  // must not render as a value, so an extra key with no content is the "filled-in lie" the design
  // warns about rather than extra measurement.
  for (const key of Object.keys(answer)) {
    if (KERNEL_FIELDS.indexOf(key) >= 0) continue;
    ok(answer[key] != null && answer[key] !== '',
      'an extra field on a converted envelope is real discriminating data, never an empty '
      + 'placeholder: `' + key + '` = ' + JSON.stringify(answer[key]));
  }

  // THE CONVERSION'S WHOLE CLAIM, as an equality rather than as prose: the same token at
  // `refuse` and at `answer` measures the SAME thing. Only the verdict differs.
  const refusal = { result: 'refuse', reason: LOCK_TOKEN };
  schema.stampRefusalEnvelope(refusal);
  deepEqual(Object.assign({}, answer, { result: null }), Object.assign({}, refusal, { result: null }),
    'DELETE THE VERDICT, KEEP THE MEASUREMENT: the projection is byte-identical between the '
    + 'refusing and the reporting form of the same finding');

  // Idempotent, as the stamp contract says everywhere else. A converted site that is stamped
  // twice (the aggregator seam stamps envelopes `refuse()` already stamped) must not drift.
  const once = JSON.stringify(answer);
  schema.stampRefusalEnvelope(answer);
  equal(JSON.stringify(answer), once, 'the stamp is idempotent on an `answer` — a second pass changes nothing');

  // A caller's own answer still wins. The stamp supplies a default; it never overrides a site
  // that computed the exit from state.
  const preset = { result: 'answer', reason: LOCK_TOKEN, refusal_route: { verb: 'orient', script: 'adaptive-node', args: '--json' } };
  schema.stampRefusalEnvelope(preset);
  equal(preset.refusal_route.verb, 'orient',
    'the stamp steps aside for a caller that already decided the route — additive, never a rewrite');
}

// --- PART 1b: the route is REACHABLE, not merely well-shaped. --------------------------------
//
// A route naming a verb the CLI does not dispatch is an exit that does not work, which the
// design calls a build-time red rather than a runtime surprise. Driven at the process boundary,
// with a bogus verb as the control — without the control this probe could pass by never
// discriminating anything.
function partRouteReachable() {
  const root = makeRepo('route');
  try {
    const answer = schema.stampRefusalEnvelope({ result: 'answer', reason: LOCK_TOKEN });
    const verb = answer.refusal_route.verb;
    const real = runCli(ADAPTIVE_NODE, root, [verb, '--project', PROJECT, '--json']);
    const bogus = runCli(ADAPTIVE_NODE, root, ['zz-not-a-verb', '--project', PROJECT, '--json']);
    const unknown = (r) => JSON.stringify((r.envelope && r.envelope.errors) || []).indexOf('unknown subcommand') >= 0;
    ok(unknown(bogus),
      'CONTROL: a verb the CLI does not dispatch answers `unknown subcommand` — the probe can fail, got '
      + JSON.stringify(bogus.envelope));
    ok(!unknown(real),
      'the `answer` envelope routes to a verb the CLI ACTUALLY DISPATCHES (' + verb + '), got '
      + JSON.stringify(real.envelope));
  } finally { cleanup(root); }
}

// ===========================================================================
// PART 2 — the claim surface's shipped `answer` envelopes are not retro-stamped.
//
// `answer` is not new vocabulary: it already ships, at exit 0, on the claim surface, where it
// carries `status` / `verdict` / `reasoning` and NEITHER `reason` NOR `condition`. Adding it to
// the actionable set moves those envelopes past a gate they used to fail, so the ONLY thing
// still keeping them untouched is the stamp's legacy-token check two lines later. That is a
// regression guard on a live surface, so it is asserted as BYTE equality against a
// pre-serialized copy rather than field-by-field: a field-by-field check only catches the
// fields it thought to name.
// ===========================================================================

function partClaimSurfaceUntouched() {
  const root = makeRepo('claim');
  let shipped;
  try {
    const r = runCli(CLAIM, root, ['pick-next', '--json']);
    equal(r.status, 0, 'the claim surface answers a missing target at EXIT 0\n' + r.stdout + r.stderr);
    shipped = r.envelope;
    ok(shipped && shipped.result === 'answer',
      'the claim surface emits a shipped `answer` envelope, got ' + JSON.stringify(shipped));
    equal(shipped.reason, undefined, 'the shipped `answer` carries NO `reason` — it emits `reasoning`');
    equal(shipped.condition, undefined, 'the shipped `answer` carries NO `condition`');
  } finally { cleanup(root); }

  const before = JSON.stringify(shipped);
  schema.stampRefusalEnvelope(shipped);
  equal(JSON.stringify(shipped), before,
    'DRIVEN: the shipped claim-surface `answer` envelope survives the stamp BYTE-IDENTICAL');
  deepEqual(shipped, JSON.parse(before), 'and structurally identical — no field added, none rewritten');

  // The aggregator seam leaves it alone too, for its own reason (no `reason` to hint on). Both
  // seams, because a conversion that fixed one and not the other would still be a live defect.
  const forHint = JSON.parse(before);
  node.decorateOperatorHint(forHint);
  deepEqual(forHint, JSON.parse(before), 'the aggregator seam leaves the shipped `answer` untouched as well');

  // The other two shipped shapes on that surface, TRANSCRIBED from the claim script's object
  // literals rather than driven — reaching them requires a live forge probe, which this suite
  // deliberately does not make. Stated as a transcription so nobody reads them as measurements.
  const transcribed = [
    { status: 'target_unverified', result: 'answer', claim: 'none', issue: 871, project: PROJECT, reasoning: 'unverified' },
    { status: 'target_indeterminate', result: 'answer', claim: 'none', issue: 871, project: PROJECT,
      reasoning_class: 'classifier_error', reasoning: 'probe failed' },
  ];
  for (const envelope of transcribed) {
    const raw = JSON.stringify(envelope);
    schema.stampRefusalEnvelope(envelope);
    equal(JSON.stringify(envelope), raw,
      'a `status`/`reasoning`-shaped `answer` (' + JSON.parse(raw).status + ') is never retro-stamped');
  }

  // NON-VACUITY. The exemption must come from the ABSENT legacy token, not from `answer` being
  // inert: the same shape with a `reason` IS stamped. Without this, PART 2 would still pass
  // against an implementation that had simply dropped `answer` from the predicate — which is
  // exactly the deletion PART 1 exists to forbid.
  const withReason = { status: 'no_target', result: 'answer', claim: 'none', reason: LOCK_TOKEN };
  schema.stampRefusalEnvelope(withReason);
  equal(withReason.refusal_family, 'kernel_lock_held',
    'NON-VACUITY: the SAME shape carrying a legacy token IS stamped — the exemption is the '
    + 'missing token, not an inert `answer`');
}

// ===========================================================================
// PART 3 — the durable outcome log classifies an `answer` as `family`.
// ===========================================================================

function partOutcomeRecord() {
  ok(schema.OUTCOME_RESULTS.indexOf('answer') >= 0,
    'the recorder vocabulary carries `answer`, got ' + JSON.stringify(schema.OUTCOME_RESULTS));

  const rec = schema.buildOutcomeRecord({
    script: 'adaptive-node', op: 'open-ready', project: PROJECT, node: 'n4',
    envelope: { result: 'answer', reason: LOCK_TOKEN }, duration_ms: 42,
  });
  equal(rec.result, 'answer',
    'an `answer` records as itself, NOT as the string `other` — a converted site must not read, '
    + 'in the one durable log that measures outcomes, like an unrecognised result');
  equal(rec.classified, 'family', 'an `answer` classifies into the kernel vocabulary');
  equal(rec.family, 'kernel_lock_held', 'and carries its family');
  equal(rec.locus, 'L1', 'and its locus');
  ok(rec.route != null && rec.route !== '', 'and a non-null route, got ' + JSON.stringify(rec.route));

  deepEqual(Object.assign({}, rec, { ts: null }), {
    v: schema.OUTCOME_LOG_SCHEMA_VERSION, ts: null, script: 'adaptive-node', op: 'open-ready',
    project: PROJECT, node: 'n4', result: 'answer', reason: LOCK_TOKEN, condition: LOCK_TOKEN,
    family: 'kernel_lock_held', locus: 'L1', route: 'adaptive-node:unlock',
    classified: 'family', ms: 42,
  }, 'the `answer` record projects exactly, family/locus/route off the ONE kernel registry');

  // The record and the envelope agree BY CONSTRUCTION, which is the reason the predicate was
  // unified in the first place. Driven both ways rather than assumed.
  const stamped = schema.stampRefusalEnvelope({ result: 'answer', reason: LOCK_TOKEN });
  const fromStamped = schema.buildOutcomeRecord({
    script: 'adaptive-node', op: 'open-ready', project: PROJECT, node: 'n4',
    envelope: stamped, duration_ms: 42,
  });
  deepEqual(Object.assign({}, fromStamped, { ts: null }), Object.assign({}, rec, { ts: null }),
    'the recorder reaches the same projection whether or not the envelope was stamped first');

  // An unrecognised result is still `other`: adding a member must not have turned the fallback
  // into an accept-anything.
  equal(schema.buildOutcomeRecord({ op: 'orient', envelope: { result: 'answerish' } }).result, 'other',
    'a result outside the vocabulary still records as `other` — the member was added, not the floor removed');
}

// ===========================================================================
// PART 4 — refuse / halt / warn are unchanged.
// ===========================================================================

function partLegacyResultsUnchanged() {
  // REFUSE — a classified L1 refusal, through the shared constructor.
  const refusal = schema.refuse('evidence_absent', { node_id: 'n3', role: 'test-author' });
  equal(refusal.refusal_family, 'kernel_evidence_missing',
    'a classified L1 refusal still projects family/locus/route unchanged');
  equal(refusal.refusal_locus, 'L1', 'refuse: locus unchanged');
  equal(refusal.condition, 'evidence_absent', 'refuse: the legacy token still rides in `condition`');
  ok(refusal.refusal_route && refusal.refusal_route.verb, 'refuse: still routed');
  const refuseRec = schema.buildOutcomeRecord({ op: 'close-and-open-next', project: PROJECT, node: 'n3', envelope: refusal });
  deepEqual([refuseRec.result, refuseRec.family, refuseRec.locus, refuseRec.classified],
    ['refuse', 'kernel_evidence_missing', 'L1', 'family'], 'refuse: the recorded projection is unchanged');

  // HALT — the consent valve, at its own locus.
  const halt = schema.refuse('halt_pending', { result: 'halt' });
  equal(halt.refusal_family, 'consent_required', 'a halt still classifies into the A3 family');
  equal(halt.refusal_locus, 'A3', 'halt: the consent valve keeps its own locus');
  const haltRec = schema.buildOutcomeRecord({ op: 'close-node', project: PROJECT, envelope: halt });
  deepEqual([haltRec.result, haltRec.family, haltRec.locus, haltRec.route],
    ['halt', 'consent_required', 'A3', 'consent'], 'halt: the recorded projection is unchanged');

  // WARN — MEASURED CAVEAT: no production script emits `result: 'warn'` today (the token appears
  // only in the two kernel constants). So this pins the PREDICATE MEMBER, not a live surface —
  // it is the arm that stays honest if a converted site later reports at `warn` instead.
  const warn = schema.stampRefusalEnvelope({ result: 'warn', reason: 'evidence_absent' });
  equal(warn.refusal_family, 'kernel_evidence_missing', 'a warn is actionable and carries its family');
  equal(warn.refusal_locus, 'L1', 'warn: locus stamped');
  const warnRec = schema.buildOutcomeRecord({ op: 'record-evidence', project: PROJECT, envelope: warn });
  deepEqual([warnRec.result, warnRec.family, warnRec.classified],
    ['warn', 'kernel_evidence_missing', 'family'], 'warn: the recorded projection is unchanged');

  // OK — the negative arm. A success carries NO projection: the presence of a family is itself
  // the "there is a finding here" signal, so fabricating one on a success would be worse than
  // omitting it on a refusal.
  const success = schema.stampRefusalEnvelope({ result: 'ok', reason: 'evidence_absent' });
  deepEqual([success.condition, success.refusal_family, success.refusal_locus, success.refusal_route],
    [undefined, undefined, undefined, undefined],
    'an `ok` is NOT actionable — no condition, no family, no locus, no route');
  const okRec = schema.buildOutcomeRecord({ op: 'orient', project: PROJECT, envelope: { result: 'ok' } });
  deepEqual([okRec.condition, okRec.family, okRec.locus, okRec.route, okRec.classified],
    [null, null, null, null, null], 'a success records no family projection — nulls, never a fabrication');
}

// ===========================================================================
// PART 5 — the predicate is genuinely shared.
//
// TWO ARMS, and both are needed:
//   AGREEMENT — the kernel's stamp and the aggregator's `decorateOperatorHint` are DRIVEN over
//   the same result tokens and must reach the same verdict. This catches a copy that fell
//   BEHIND (the old three-member triple).
//   MUTATION  — the KERNEL predicate is un-wired and the aggregator must FOLLOW. This catches a
//   copy that is currently in step, which the agreement arm structurally cannot see. A local
//   four-member literal in the aggregator passes AGREEMENT and fails MUTATION.
// ===========================================================================

// The tokens are enumerated HERE rather than read off ACTIONABLE_RESULTS: driving both sides
// over the constant they both derive from would make the agreement true by construction. The
// non-members are included so "they agree" cannot mean "they both accept everything".
const RESULT_PROBES = Object.freeze([
  'refuse', 'halt', 'warn', 'answer',            // expected members
  'ok', 'ready_to_run', 'ANSWER', 'answerish', '', 'other',   // expected non-members
]);

// kernelAccepts / aggregatorAccepts — the observable consequence of the predicate at each seam,
// read off DRIVEN behaviour. The kernel's consequence is the family stamp; the aggregator's is
// the family stamp PLUS the operator hint it adds on top, so a seam that reached the stamp by
// some other path would still be distinguishable.
function kernelAccepts(result) {
  const envelope = { result: result, reason: LOCK_TOKEN };
  schema.stampRefusalEnvelope(envelope);
  return envelope.refusal_family === 'kernel_lock_held';
}
function aggregatorAccepts(mod, result) {
  const envelope = { result: result, reason: LOCK_TOKEN };
  mod.decorateOperatorHint(envelope);
  return envelope.refusal_family === 'kernel_lock_held'
    && typeof envelope.operator_hint === 'string' && envelope.operator_hint.length > 0;
}

function partSharedPredicateAgreement() {
  const accepted = [];
  for (const result of RESULT_PROBES) {
    const k = kernelAccepts(result);
    const a = aggregatorAccepts(node, result);
    equal(a, k, "result '" + result + "': the aggregator and the kernel agree on the projection");
    if (k) accepted.push(result);
  }
  // NON-VACUITY, both directions: the agreement is not "both always decline" or "both always
  // accept". The accepted set is exactly the four members, and it is compared against the
  // exported constant HERE — once, as an assertion about the outcome, not as the source of it.
  deepEqual(accepted.slice().sort(), schema.ACTIONABLE_RESULTS.slice().sort(),
    'the DRIVEN accept set is exactly ACTIONABLE_RESULTS — neither seam accepts more or fewer');
  ok(accepted.length === 4 && accepted.indexOf('answer') >= 0,
    'and `answer` is one of the four, got ' + JSON.stringify(accepted));

  // The predicate answers about strings only. A non-string result must not throw and must not
  // be accepted — the seam sits on the emit path of every subcommand.
  for (const weird of [null, undefined, 42, {}, ['answer']]) {
    equal(schema.isActionableResult(weird), false,
      'a non-string result is not actionable and does not throw: ' + JSON.stringify(weird));
  }
  ok(Object.isFrozen(schema.ACTIONABLE_RESULTS), 'the member list is frozen — a kernel constant, not a mutable registry');
}

// withKernelPredicate — re-require the adaptive-node aggregator against a kernel whose
// `isActionableResult` has been replaced. This mutates the predicate AS THE PRODUCTION MODULE
// SEES IT, which is what makes the negative result evidence about the code path rather than
// about a fixture. The kernel's own `stampRefusalEnvelope` is untouched and still accepts
// `answer`, so the ONLY thing that can change the aggregator's behaviour is that it really does
// read the exported predicate.
function withKernelPredicate(predicate, fn) {
  const schemaPath = require.resolve('./kaola-workflow-adaptive-schema');
  const nodePath = require.resolve('./kaola-workflow-adaptive-node');
  const savedSchema = require.cache[schemaPath];
  const savedNode = require.cache[nodePath];
  const mutantSchema = Object.assign({}, schema, { isActionableResult: predicate });
  require.cache[schemaPath] = {
    id: schemaPath, filename: schemaPath, loaded: true, exports: mutantSchema, children: [], paths: [],
  };
  delete require.cache[nodePath];
  try {
    return fn(require(nodePath));
  } finally {
    if (savedSchema) require.cache[schemaPath] = savedSchema; else delete require.cache[schemaPath];
    delete require.cache[nodePath];
    if (savedNode) require.cache[nodePath] = savedNode;
  }
}

function partSharedPredicateMutation() {
  const withoutAnswer = (r) => typeof r === 'string' && ['refuse', 'halt', 'warn'].indexOf(r) >= 0;
  withKernelPredicate(withoutAnswer, (mutant) => {
    ok(mutant !== node, 'the mutation loaded a SEPARATE module instance, not the cached real one');
    equal(aggregatorAccepts(mutant, 'answer'), false,
      "MUTATION: with 'answer' removed from the KERNEL predicate the aggregator must decline it "
      + 'too — a local copy would still stamp');
    equal(aggregatorAccepts(mutant, 'refuse'), true,
      'and the mutation is SURGICAL: the aggregator still projects a refuse, so the arm above is '
      + 'not measuring a module that simply stopped working');
  });
  // And the real module is back: a leaked mutant would make every later suite in the chain
  // measure a tampered kernel.
  equal(aggregatorAccepts(node, 'answer'), true, 'the real aggregator is restored after the mutation');
}

// ===========================================================================
// PART 6 — cross-edition parity.
//
// `kaola-workflow-adaptive-schema.js` is the cross-edition drift anchor. Whole-file byte
// identity is `edition-sync --check`'s claim and is deliberately NOT restated here — this is the
// BEHAVIOURAL half: all four copies are LOADED and DRIVEN, so an edition that shipped a
// different member list is red even if some future sync rule stopped comparing bytes.
// ===========================================================================

const EDITION_SCHEMAS = Object.freeze([
  'scripts/kaola-workflow-adaptive-schema.js',
  'plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js',
  'plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js',
  'plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js',
]);

function partEditionParity() {
  equal(EDITION_SCHEMAS.length, 4, 'NON-VACUITY: all four edition trees are under test');
  for (const rel of EDITION_SCHEMAS) {
    const abs = path.join(REPO, rel);
    ok(fs.existsSync(abs), 'the edition kernel exists: ' + rel);
    const mod = require(abs);
    deepEqual(mod.ACTIONABLE_RESULTS, schema.ACTIONABLE_RESULTS,
      rel + ': ACTIONABLE_RESULTS agrees with the root kernel');
    equal(typeof mod.isActionableResult, 'function', rel + ': exports the predicate itself, not only the list');
    // DRIVEN, not read: the constant and the function are two things, and an edition that
    // shipped the list but a stale predicate would pass the comparison above.
    for (const probe of RESULT_PROBES) {
      equal(mod.isActionableResult(probe), schema.isActionableResult(probe),
        rel + ": the predicate agrees with the root kernel on '" + probe + "'");
    }
    // The consequence, not just the predicate: the same converted envelope must project the
    // same way in every edition.
    const envelope = mod.stampRefusalEnvelope({ result: 'answer', reason: LOCK_TOKEN });
    deepEqual([envelope.condition, envelope.refusal_family, envelope.refusal_locus],
      [LOCK_TOKEN, 'kernel_lock_held', 'L1'],
      rel + ': an `answer` projects identically in this edition');
  }
}

// ===========================================================================

function main() {
  partAnswerProjection();
  partRouteReachable();
  partClaimSurfaceUntouched();
  partOutcomeRecord();
  partLegacyResultsUnchanged();
  partSharedPredicateAgreement();
  partSharedPredicateMutation();
  partEditionParity();
  process.stdout.write('substrate conversion tests passed (' + passed + ' assertions)\n');
}

if (require.main === module) main();

module.exports = {
  RESULT_PROBES, LOCK_TOKEN, kernelAccepts, aggregatorAccepts, withKernelPredicate,
  partAnswerProjection, partRouteReachable, partClaimSurfaceUntouched, partOutcomeRecord,
  partLegacyResultsUnchanged, partSharedPredicateAgreement, partSharedPredicateMutation,
  partEditionParity,
};
