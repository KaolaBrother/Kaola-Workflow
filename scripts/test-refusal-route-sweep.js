#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// test-refusal-route-sweep.js — the registry sweep (ADR 0013 route contract, item 3).
//
// R2 generalized: walk every registered refusal cell, resolve its recorded route, and
// prove the exit exists. A route that dead-ends fails the build, so the #840 class
// (a route naming a verb that does not exist) and the circular-hint class stop being
// post-release audit findings.
//
// DEFAULT-ON, EXEMPT-LIST, NEVER AN OPT-IN ALLOWLIST. `scripts/refusal-sweep-exempt.json`
// carries a one-line reason, an owning issue and a batch per entry, fails when an entry
// goes stale in EITHER direction, and prints its own size as the P2 metric.
//
// TWO TIERS, and the split is deliberate:
//   TIER A — structural. Route resolution, verb existence against the SCANNED in-grammar
//     set, R4 discipline, payload-schema validation, resolver/enum key parity, and the
//     three-way ADR<->registry<->vocabulary equality. Armed for EVERY cell; ADMITS NO
//     EXEMPTIONS. This is the half that is meaningful the moment the registry exists.
//   TIER B — behavioural. Provoke the refusal for real, follow the route, arrive green.
//     Per-cell provokers register here as each family is migrated; a cell with no
//     provoker must be exempt-listed, and a cell WITH one must not be.
//
// Every checker below is a pure function, and the mutation battery at the end feeds each
// one a deliberately broken input and asserts it REJECTS — a green suite is not evidence
// a guard is armed unless the guard has been shown to fail.
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const schema = require('./kaola-workflow-adaptive-schema');

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.error('FAIL: ' + msg); } }
function read(rel) { return fs.readFileSync(path.join(REPO, rel), 'utf8'); }

const {
  KERNEL_REFUSAL_VOCABULARY, KERNEL_REFUSAL_REGISTRY, REFUSAL_PAYLOAD_SCHEMAS,
  INVESTIGATION_OR_DISCARD, ROUTE_TERMINAL_VERBS, ROUTE_SCRIPT_IDS,
  WRITE_FAILED_RETRY_BY_RECORD, CAS_ROUTE_BY_RECORD, INTEGRITY_ROUTE_BY_KIND,
  EVIDENCE_ROUTE_BY_RECORD_KIND, SINK_FINDING_ROUTE_BY_KIND, SINK_FINDING_ROUTE_BY_SUBTYPE,
  SINK_FINDING_KINDS, SINK_UNATTRIBUTED_SUBTYPES, CONSENT_KINDS, LOCK_KINDS,
  routeKey, resolveRoute, resolveSinkFindingRoute, validateRefusalPayload,
  classifyRefusalCondition, deriveDeviationRoutes, REFUSAL_EMISSION_MODE,
} = schema;

// The route-contract surface. Read through a TOTAL accessor rather than destructured, so a
// symbol that has not landed yet produces ONE named red assertion instead of a TypeError that
// takes the whole sweep — including the 541 assertions that are already meaningful — with it.
// Each dependent block is gated on presence, and the gate itself is the red; there is no state
// in which a missing export is silently skipped.
function kernelFn(name) { return typeof schema[name] === 'function' ? schema[name] : null; }
const REFUSAL_WHY = schema.REFUSAL_WHY;
const refusalCellKey = kernelFn('refusalCellKey');
const assertCellClosure = kernelFn('assertCellClosure');
const routeProse = kernelFn('routeProse');
const refusalFact = kernelFn('refusalFact');
const PENDING_CONTRACT = [];

// ===========================================================================
// (0) THE SCANNED IN-GRAMMAR VERB SET — scanned from each script's own dispatch,
//     never hand-listed. This is the structural fix for the #840 class: a route
//     naming a verb that does not exist fails BEFORE any cell is walked.
// ===========================================================================

// THE AGGREGATORS DO NOT SHARE ONE DISPATCH SHAPE, and pretending they do is how this
// scanner goes wrong in both directions at once. The three shipped shapes, measured:
//   adaptive-node, replan     `subcommand === '<verb>'`
//   claim                     `sub === '<verb>'`
//   plan-validator, handoff   `args.includes('--flag')` AND `args.indexOf('--flag')`
//
// Narrowing the flag branch to `.includes` alone reports live verbs DEAD (a false red, which
// invites the next maintainer to weaken the guard). Widening it to any `'--flag'` literal in
// the file — WHICH IS WHAT SHIPPED — is worse: it admits `--porcelain`, `--name-only`,
// `--show-toplevel` and `--exclude-standard`, which are GIT's flags that this script merely
// forwards, plus every value-carrying option. A guard that accepts `--reason` as a verb reads
// green forever.
//
// The fix is structural, not a wider regex. Flag-dispatched scripts DECLARE their verbs
// (`CLI_FLAGS`) and the sweep reads the declaration; the declaration is then made trustworthy
// by two checks that bite in opposite directions — every declared flag must appear in the
// script's own dispatch source, and no value-carrying option may be declared.
const VERB_SOURCES = [
  { script: 'adaptive-node', file: 'scripts/kaola-workflow-adaptive-node.js', kind: 'subcommand' },
  { script: 'replan', file: 'scripts/kaola-workflow-replan.js', kind: 'subcommand' },
  { script: 'claim', file: 'scripts/kaola-workflow-claim.js', kind: 'subcommand' },
  { script: 'plan-validator', file: 'scripts/kaola-workflow-plan-validator.js', kind: 'declared',
    module: './kaola-workflow-plan-validator' },
  { script: 'adaptive-handoff', file: 'scripts/kaola-workflow-adaptive-handoff.js', kind: 'declared',
    module: './kaola-workflow-adaptive-handoff' },
  { script: 'commit-node', file: 'scripts/kaola-workflow-commit-node.js', kind: 'flag' },
  { script: 'run-chains', file: 'scripts/kaola-workflow-run-chains.js', kind: 'flag' },
];

// Options that CARRY A VALUE. The flag is not the verb — it is a parameter of one — so a
// `CLI_FLAGS` containing any of these has stopped describing the dispatch.
const VALUE_CARRYING_OPTIONS = Object.freeze([
  '--project', '--plan', '--json', '--reason', '--question', '--state-mtime', '--governance-ack',
]);

// scanDispatchedFlags(content) — PURE. The flags this source actually BRANCHES on, read from
// the three argv-dispatch shapes that ship. A '--flag' sitting in an array literal that gets
// forwarded to another script is NOT a dispatch and must not be admitted; that distinction is
// the whole point, and the mutation battery pins it.
const FLAG_DISPATCH_SHAPES = [
  /\b(?:args|argv|process\.argv)\s*\.\s*(?:includes|indexOf)\(\s*'(--[a-z0-9][a-z0-9-]*)'/g,
  /\b[A-Za-z_$][A-Za-z0-9_$]*\s*(?:\[\s*\d+\s*\])?\s*===\s*'(--[a-z0-9][a-z0-9-]*)'/g,
];
function scanDispatchedFlags(content) {
  const set = new Set();
  if (typeof content !== 'string') return set;
  for (const re of FLAG_DISPATCH_SHAPES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(content)) !== null) set.add(m[1]);
  }
  return set;
}

// The LEGACY whole-file literal scan. Retained ONLY as the migration seam below, never as an
// answer: it is the over-permissive branch this leg exists to retire.
function scanFlagLiterals(content) {
  const set = new Set();
  const re = /'(--[a-z0-9][a-z0-9-]*)'/g;
  let m;
  while ((m = re.exec(content)) !== null) set.add(m[1]);
  return set;
}

// readDeclaredFlags(moduleRel) — the declaration side. Total: a module that will not load, or
// one with no `CLI_FLAGS` array, is reported rather than thrown.
function readDeclaredFlags(moduleRel) {
  let mod;
  try { mod = require(moduleRel); } catch (e) { return { ok: false, flags: [], error: 'module did not load: ' + e.message }; }
  const declared = mod && mod.CLI_FLAGS;
  if (!Array.isArray(declared)) return { ok: false, flags: [], error: 'CLI_FLAGS is not exported as an array' };
  return { ok: true, flags: declared.slice(), error: null };
}

// checkDeclaredFlagSet(declared, dispatched, valueCarrying) — PURE, and it bites BOTH ways.
// A declared flag nothing dispatches is a verb that does not exist; a declared flag that is a
// value-carrying option is a guard that will never fail again.
function checkDeclaredFlagSet(declared, dispatched, valueCarrying) {
  if (!Array.isArray(declared) || declared.length === 0) {
    return ['CLI_FLAGS is absent or empty — nothing is declared, so nothing can be checked'];
  }
  const errors = [];
  const have = dispatched instanceof Set ? dispatched : new Set(dispatched || []);
  for (const flag of declared) {
    if (!have.has(flag)) {
      errors.push('DECLARED-BUT-DEAD — "' + flag + '" is in CLI_FLAGS but this script\'s own argv parser never branches on it');
    }
    if ((valueCarrying || []).indexOf(flag) >= 0) {
      errors.push('VALUE-CARRYING — "' + flag + '" takes a value; it is a parameter, not a verb, and declaring it makes the guard vacuous');
    }
  }
  return errors;
}

// The per-script measurement, taken ONCE and reused by the assertions below.
const DISPATCH_REPORT = {};
for (const src of VERB_SOURCES) {
  DISPATCH_REPORT[src.script] = {
    src: src,
    dispatched: scanDispatchedFlags(read(src.file)),
    declared: src.kind === 'declared' ? readDeclaredFlags(src.module) : null,
  };
}
const DECLARED_SOURCES = VERB_SOURCES.filter(s => s.kind === 'declared');
const FALLBACK_ENGAGED = DECLARED_SOURCES.filter(s => !DISPATCH_REPORT[s.script].declared.ok).map(s => s.script);

function scanInGrammarVerbs(sources) {
  const set = new Set();
  for (const src of sources) {
    const content = read(src.file);
    if (src.kind === 'declared') {
      // The declaration is the source of truth. While it does not yet exist the legacy literal
      // scan carries the set forward so the rest of the sweep stays meaningful — and the
      // CONTRACT assertion below is RED for exactly as long as that seam is open, so the
      // fallback can never be in effect quietly.
      const declared = readDeclaredFlags(src.module);
      for (const flag of (declared.ok ? declared.flags : scanFlagLiterals(content))) set.add(src.script + ':' + flag);
      continue;
    }
    const re = src.kind === 'subcommand'
      ? /\b(?:subcommand|sub)\s*===\s*'([a-z0-9][a-z0-9-]*)'/g
      : /'(--[a-z0-9][a-z0-9-]*)'/g;
    let m;
    while ((m = re.exec(content)) !== null) set.add(src.script + ':' + m[1]);
  }
  return set;
}

const IN_GRAMMAR = scanInGrammarVerbs(VERB_SOURCES);

assert(IN_GRAMMAR.size > 40,
  'SCAN: the in-grammar verb set must be scanned non-vacuously from the shipped dispatch — got ' + IN_GRAMMAR.size);
for (const src of VERB_SOURCES) {
  assert(Array.from(IN_GRAMMAR).some(k => k.startsWith(src.script + ':')),
    'SCAN: no verbs scanned out of ' + src.file + ' — the dispatch shape changed and the scanner went blind');
}
assert(ROUTE_SCRIPT_IDS.every(id => VERB_SOURCES.some(s => s.script === id)),
  'SCAN: every ROUTE_SCRIPT_IDS entry must have a scanned source, else a route could name an unscannable script');

// --- the declaration, and the two checks that make it trustworthy ---
for (const src of DECLARED_SOURCES) {
  const rec = DISPATCH_REPORT[src.script];
  assert(rec.declared.ok,
    'CONTRACT: ' + src.file + ' must export CLI_FLAGS (the flags its own argv parser DISPATCHES on) — '
      + rec.declared.error + '. Until it does, the sweep falls back to the whole-file literal scan, which '
      + 'admits git flags such as --porcelain and every value-carrying option as if they were verbs');
  assert(checkDeclaredFlagSet(rec.declared.flags, rec.dispatched, VALUE_CARRYING_OPTIONS).length === 0,
    'DECLARATION[' + src.script + ']: '
      + checkDeclaredFlagSet(rec.declared.flags, rec.dispatched, VALUE_CARRYING_OPTIONS).join(' | '));
}

// --- the check that does NOT wait for the declaration ---
// Every route naming a flag-dispatched script is measured against that script's OWN argv
// dispatch right now. This is the sound reading of "the verb exists", and it is armed whether
// or not CLI_FLAGS has landed.
{
  const routedFlags = new Map();
  for (const table of [WRITE_FAILED_RETRY_BY_RECORD, CAS_ROUTE_BY_RECORD, INTEGRITY_ROUTE_BY_KIND,
    EVIDENCE_ROUTE_BY_RECORD_KIND]) {
    for (const key of Object.keys(table)) {
      const r = table[key];
      if (r && r.script && DISPATCH_REPORT[r.script]) routedFlags.set(r.script + ' ' + r.verb, r);
    }
  }
  for (const table of [SINK_FINDING_ROUTE_BY_KIND, SINK_FINDING_ROUTE_BY_SUBTYPE]) {
    for (const key of Object.keys(table)) {
      const r = table[key] && table[key].route;
      if (r && r.script && DISPATCH_REPORT[r.script]) routedFlags.set(r.script + ' ' + r.verb, r);
    }
  }
  let flagRoutesChecked = 0;
  for (const [label, route] of routedFlags) {
    if (route.verb.slice(0, 2) !== '--') continue;
    flagRoutesChecked++;
    assert(DISPATCH_REPORT[route.script].dispatched.has(route.verb),
      'DISPATCH: the route "' + label + '" names a flag that script\'s own argv parser never branches on — '
        + 'it appears in the file only as a literal forwarded to another script, so an operator who types it '
        + 'does not reach the verb the route promises');
  }
  assert(flagRoutesChecked > 0,
    'DISPATCH: no flag-shaped route was measured — the cross-check went vacuous');
}

// ===========================================================================
// (1) THE THREE-WAY EQUALITY INVARIANT
//     ADR enumerated list == Object.keys(KERNEL_REFUSAL_REGISTRY) == KERNEL_REFUSAL_VOCABULARY
//     The registry has no independent content to drift with.
// ===========================================================================

const ADR_PATH = 'docs/decisions/0013-successor-test-two-gate-target-architecture.md';

// The vocabulary is read from the ADR's FENCED block, keyed by its info-string, never from a
// markdown table located by a heading literal. The difference is load-bearing: a heading-keyed
// parser returns null the moment anyone rewords the heading, and a long ADR holds many pipe
// tables that a table regex can wander into. An info-string is a contract; a table is a
// rendering choice. Both forms shipped simultaneously for one merge — the branch that built the
// registry carried a `### Amendment A1` table while main carried this block — and git merged
// the two cleanly, leaving the vocabulary with two left-hand sides. Hence: one fence, one source.
const ADR_VOCAB_FENCE = '```kernel-refusal-vocabulary';
function parseAdrVocabulary(content) {
  if (typeof content !== 'string') return null;
  const start = content.indexOf(ADR_VOCAB_FENCE);
  if (start < 0) return null;
  const body = content.slice(start + ADR_VOCAB_FENCE.length);
  const end = body.indexOf('```');
  if (end < 0) return null;
  const rows = [];
  for (const line of body.slice(0, end).split('\n')) {
    const m = /^\s*([a-z_]+)\s+([A-Z0-9]+)\s+(yes|no)\s*$/.exec(line);
    if (m) rows.push({ code: m[1], locus: m[2], auto_remediable: m[3] === 'yes' });
  }
  return rows.length ? rows : null;
}

const adrRows = parseAdrVocabulary(read(ADR_PATH));
assert(adrRows !== null, 'ADR: Amendment A1 must carry a parseable enumerated-vocabulary table in ' + ADR_PATH);

if (adrRows) {
  const adrCodes = adrRows.map(r => r.code).sort();
  const registryCodes = Object.keys(KERNEL_REFUSAL_REGISTRY).sort();
  const vocabCodes = KERNEL_REFUSAL_VOCABULARY.slice().sort();
  assert(JSON.stringify(adrCodes) === JSON.stringify(registryCodes),
    'EQUALITY: the ADR enumerated list must equal the registry key set exactly — ADR '
      + JSON.stringify(adrCodes) + ' vs registry ' + JSON.stringify(registryCodes));
  assert(JSON.stringify(registryCodes) === JSON.stringify(vocabCodes),
    'EQUALITY: the registry key set must equal KERNEL_REFUSAL_VOCABULARY exactly — registry '
      + JSON.stringify(registryCodes) + ' vs vocabulary ' + JSON.stringify(vocabCodes));
  assert(vocabCodes.length <= 12,
    'P2: the enumerated vocabulary must stay at or under a dozen codes — got ' + vocabCodes.length);
  for (const row of adrRows) {
    const reg = KERNEL_REFUSAL_REGISTRY[row.code];
    if (!reg) continue;
    assert(reg.locus === row.locus,
      'EQUALITY: locus for ' + row.code + ' disagrees — ADR ' + row.locus + ' vs registry ' + reg.locus);
    assert(reg.auto_remediable === row.auto_remediable,
      'EQUALITY: auto_remediable for ' + row.code + ' disagrees — ADR ' + row.auto_remediable
        + ' vs registry ' + reg.auto_remediable);
    assert(['L1', 'L2', 'A3'].indexOf(reg.locus) >= 0,
      'R1: every enumerated code must sit at L1 / L2 / A3 — ' + row.code + ' claims ' + reg.locus);
  }
}

// Every family declares a payload schema, and the schema's discriminator enum is the ONE
// place the discriminator values live.
for (const code of KERNEL_REFUSAL_VOCABULARY) {
  const row = KERNEL_REFUSAL_REGISTRY[code];
  assert(row && typeof row.route === 'function' && typeof row.hint === 'function',
    'REGISTRY: ' + code + ' must carry route() and hint() FUNCTIONS, not tables of incidents');
  assert(row && row.payload_schema === REFUSAL_PAYLOAD_SCHEMAS[code],
    'REGISTRY: ' + code + ' must point at its declared payload schema (one source for the enums)');
}

// ===========================================================================
// (2) RESOLVER/ENUM KEY PARITY, BOTH DIRECTIONS.
//     A discriminator value with no route is a build failure; a route for a value the
//     schema does not declare is a build failure. There is nowhere for a stale row to hide.
// ===========================================================================

function keyParityErrors(label, tableKeys, enumValues) {
  const errors = [];
  const t = new Set(tableKeys), e = new Set(enumValues);
  for (const v of e) if (!t.has(v)) errors.push(label + ': discriminator value "' + v + '" has NO route arm');
  for (const k of t) if (!e.has(k)) errors.push(label + ': route arm "' + k + '" is not a declared discriminator value');
  return errors;
}

const PARITY_TABLES = [
  ['kernel_write_failed.retry_by_record', Object.keys(WRITE_FAILED_RETRY_BY_RECORD), REFUSAL_PAYLOAD_SCHEMAS.kernel_write_failed.values],
  ['kernel_cas_lost.route_by_record', Object.keys(CAS_ROUTE_BY_RECORD), REFUSAL_PAYLOAD_SCHEMAS.kernel_cas_lost.values],
  ['kernel_integrity_broken.route_by_kind', Object.keys(INTEGRITY_ROUTE_BY_KIND), REFUSAL_PAYLOAD_SCHEMAS.kernel_integrity_broken.values],
  ['kernel_evidence_missing.route_by_record_kind', Object.keys(EVIDENCE_ROUTE_BY_RECORD_KIND), REFUSAL_PAYLOAD_SCHEMAS.kernel_evidence_missing.values],
  ['sink_verdict.route_by_kind', Object.keys(SINK_FINDING_ROUTE_BY_KIND), SINK_FINDING_KINDS],
  ['sink_verdict.route_by_subtype', Object.keys(SINK_FINDING_ROUTE_BY_SUBTYPE), SINK_UNATTRIBUTED_SUBTYPES],
];
for (const [label, keys, values] of PARITY_TABLES) {
  const errors = keyParityErrors(label, keys, values);
  assert(errors.length === 0, 'PARITY: ' + errors.join(' | '));
}
// The two families whose resolvers are pure branches rather than tables still have to cover
// their whole enum — proved by the cell walk below, which asserts a route for every value.

// ===========================================================================
// (3) CELL DERIVATION — cells are (code x discriminator value), READ OFF the payload
//     schema. The cell set is derived, so a family that gains a discriminator value gains
//     its cells automatically. Walking seven codes would prove almost nothing.
//
// EACH CELL CARRIES THREE PAYLOADS, and the split is what makes the WHY-slot pins bite:
//   payload  — the full probe. Route resolution and route/hint agreement read this.
//   minimal  — THE DISCRIMINATOR ALONE (plus whatever the cell's own identity requires,
//              and nothing else). Rendering this must invent NOTHING: a discriminator that
//              does not carry the family's typical fields must render nothing for them,
//              never `unknown`, `null`, `n/a` or ` ? `.
//   rich     — minimal plus ONE distinctive field the family already renders, with the
//              sentinel this cell expects to see in the output. The negative pin alone is
//              satisfiable by rendering nothing at all; `probe` is the positive half.
// ===========================================================================

function deriveCells() {
  const cells = [];
  const push = (code, name, payload, opts) => cells.push(Object.assign({
    code: code, cell: code + '/' + name, payload: payload, route_may_be_null: false,
  }, opts || {}));

  // kernel_write_failed — record x {retry, environment}. The environment arm is the whole
  // point of "the route is a function of the payload": same code, different exit.
  for (const record of REFUSAL_PAYLOAD_SCHEMAS.kernel_write_failed.values) {
    push('kernel_write_failed', record + ':retry', { record: record, target: 'snapshot', detail: 'probe' },
      { disc: record, minimal: { record: record },
        rich: { record: record, target: 'zzz-probe-target' }, probe: 'zzz-probe-target' });
    // The errno SELECTS the environment arm, so it is part of this cell's identity and the
    // minimal payload carries it. Everything else stays out.
    push('kernel_write_failed', record + ':environment', { record: record, errno: 'ENOSPC', path: '/tmp/x' },
      { disc: record, minimal: { record: record, errno: 'ENOSPC' },
        rich: { record: record, errno: 'ENOSPC' }, probe: 'ENOSPC' });
  }
  for (const record of REFUSAL_PAYLOAD_SCHEMAS.kernel_cas_lost.values) {
    push('kernel_cas_lost', record, { record: record, field: 'status', expected: 'a', found: 'b' },
      { disc: record, minimal: { record: record },
        rich: { record: record, field: 'zzz_probe_field' }, probe: 'zzz_probe_field' });
  }
  for (const kind of REFUSAL_PAYLOAD_SCHEMAS.kernel_integrity_broken.values) {
    push('kernel_integrity_broken', kind, { kind: kind, anchor: 'plan_hash', broken_at: 'probe' },
      { disc: kind, minimal: { kind: kind },
        rich: { kind: kind, anchor: 'plan_hash' }, probe: 'plan_hash' });
  }
  for (const kind of LOCK_KINDS) {
    for (const stale of [false, true]) {
      push('kernel_lock_held', kind + ':' + (stale ? 'stale' : 'live'),
        { kind: kind, stale: stale, holder: { pid: 4242 }, occupying_project: 'issue-1' },
        // `stale` is the schema's declared SECONDARY discriminator: it selects the arm, so it
        // is part of this cell's identity and rides in the minimal payload. The WHY key is
        // still `${code}/${kind}` — the secondary split belongs to the FACT, not the WHY.
        { disc: kind, minimal: stale ? { kind: kind, stale: true } : { kind: kind },
          rich: stale ? { kind: kind, stale: true, holder: { pid: 424242 } } : { kind: kind, holder: { pid: 424242 } },
          probe: '424242' });
    }
  }
  for (const rk of REFUSAL_PAYLOAD_SCHEMAS.kernel_evidence_missing.values) {
    push('kernel_evidence_missing', rk, { record_kind: rk, defect: 'absent', expected_path: '.cache/n1.md' },
      { disc: rk, minimal: { record_kind: rk },
        rich: { record_kind: rk, expected_path: '.cache/zzz-probe.md' }, probe: '.cache/zzz-probe.md' });
  }
  for (const kind of SINK_FINDING_KINDS) {
    push('sink_verdict', kind, { scope: 'plan', findings: [{ kind: kind, detail: 'probe' }] },
      { disc: kind, minimal: { findings: [{ kind: kind }] },
        rich: { scope: 'release', findings: [{ kind: kind }] }, probe: kind });
  }
  for (const subtype of SINK_UNATTRIBUTED_SUBTYPES) {
    push('sink_verdict', 'unattributed_paths:' + subtype,
      { scope: 'plan', findings: [{ kind: 'unattributed_paths', subtype: subtype, detail: 'probe' }] },
      // The deliberate `foreign_archive` silence: no verb resolves the write of another run's
      // archive, so naming one would misdirect. Silence is information; the sweep knows it.
      // The SUBTYPE is the field that carries the actual defect here — `unattributed_paths`
      // alone tells an operator nothing — so it is this cell's positive probe.
      { route_may_be_null: subtype === 'foreign_archive', per_finding: true,
        disc: 'unattributed_paths',
        minimal: { findings: [{ kind: 'unattributed_paths', subtype: subtype }] },
        rich: { scope: 'release', findings: [{ kind: 'unattributed_paths', subtype: subtype }] },
        probe: subtype });
  }
  for (const kind of CONSENT_KINDS) {
    push('consent_required', kind, { kind: kind, ask: 'probe', options: ['a', 'b'] },
      { disc: kind, minimal: { kind: kind },
        rich: { kind: kind, ask: 'zzz probe ask' }, probe: 'zzz probe ask' });
  }
  return cells;
}

const CELLS = deriveCells();

// --- the Tier-A checkers, as pure functions (the mutation battery feeds them below) ---

function checkRouteShape(route, verbSet) {
  const errors = [];
  if (!route || typeof route !== 'object') return ['route is absent'];
  if (typeof route.verb !== 'string' || !route.verb) return ['route.verb is absent'];
  const terminal = ROUTE_TERMINAL_VERBS.indexOf(route.verb) >= 0;
  if (terminal) {
    if (route.script) errors.push('terminal route "' + route.verb + '" must carry script: null');
    return errors;
  }
  if (!route.script) { errors.push('in-grammar route "' + route.verb + '" must name a script id'); return errors; }
  if (ROUTE_SCRIPT_IDS.indexOf(route.script) < 0) errors.push('unknown script id "' + route.script + '"');
  // THE #840 ASSERTION: the verb must exist in the scanned dispatch of the script it names.
  if (!verbSet.has(route.script + ':' + route.verb)) {
    errors.push('DEAD VERB — "' + route.script + ' ' + route.verb + '" is not dispatched by that script');
  }
  return errors;
}

function checkR4(row, route) {
  if (!row || row.auto_remediable !== false) return [];
  if (!route) return ['an R4 refusal must still name an exit'];
  // A values call routes to the human; an integrity deviation routes to investigation or
  // discard. Neither may route to a repair verb — the signal must not be laundered.
  if (route.verb === 'consent') return [];
  if (INVESTIGATION_OR_DISCARD.indexOf(routeKey(route)) >= 0) return [];
  return ['R4 VIOLATION — auto_remediable:false routed to "' + routeKey(route)
    + '", which is not an investigation/discard verb'];
}

// --- Tier A: walk every cell. NO EXEMPTIONS ARE ADMITTED HERE. ---

for (const cell of CELLS) {
  const row = KERNEL_REFUSAL_REGISTRY[cell.code];
  const validation = validateRefusalPayload(cell.code, cell.payload);
  assert(validation.ok, 'CELL ' + cell.cell + ': payload must validate against its declared schema — '
    + validation.errors.join('; '));

  const route = cell.per_finding
    ? resolveSinkFindingRoute(cell.payload.findings[0])
    : resolveRoute(cell.code, cell.payload);

  if (cell.route_may_be_null) {
    assert(route === null, 'CELL ' + cell.cell + ': this cell records a DELIBERATE null route; a route appearing here means the silence was lost');
  } else {
    assert(route !== null, 'CELL ' + cell.cell + ': no route resolved — a refusal without an exit is the #839 permanent-wedge class');
    const shapeErrors = checkRouteShape(route, IN_GRAMMAR);
    assert(shapeErrors.length === 0, 'CELL ' + cell.cell + ': ' + shapeErrors.join('; '));
    const r4Errors = checkR4(row, route);
    assert(r4Errors.length === 0, 'CELL ' + cell.cell + ': ' + r4Errors.join('; '));
  }

  // Every family must produce a non-empty hint for every cell — the generic-fallback hole
  // is closed by construction, not by a template count.
  let hint = '';
  try { hint = row.hint(cell.payload); } catch (e) { hint = ''; }
  assert(typeof hint === 'string' && hint.trim().length > 20,
    'CELL ' + cell.cell + ': the family hint must render a non-empty sentence for this payload');
  assert(!/kaola-(workflow|gitlab|gitea)-/.test(hint),
    'CELL ' + cell.cell + ': kernel hints must stay FORGE-NEUTRAL — this file is byte-copied into every edition, so a script filename here would be wrong in three of four');
}

// Per-finding routes inside the composite must also pass the shape + verb checks.
for (const kind of SINK_FINDING_KINDS) {
  const route = resolveSinkFindingRoute({ kind: kind });
  if (kind === 'unattributed_paths') {
    assert(route === null, 'SINK: unattributed_paths resolves per SUBTYPE, so a bare kind must resolve nothing');
    continue;
  }
  assert(route !== null, 'SINK: finding kind "' + kind + '" must carry its own remedy route');
  const errors = checkRouteShape(route, IN_GRAMMAR);
  assert(errors.length === 0, 'SINK finding "' + kind + '": ' + errors.join('; '));
}
// The top-level composite route is the read-all-again verb, verified read-only and
// non-short-circuiting, so following it can never dead-end.
{
  const top = resolveRoute('sink_verdict', { scope: 'plan', findings: [] });
  assert(top && top.script === 'claim' && top.verb === 'finalize' && /--check/.test(top.args),
    'SINK: the composite top-level route must be the read-all-again finalize --check verb');
}

// ===========================================================================
// (3A) THE CELL-KEYED WHY CONTRACT — the presence gate.
//
// WHY THIS GATE EXISTS, LITERALLY. An earlier attempt at this slot deleted all seven inline
// `hint` bodies, replaced each with a call to a helper it never wrote, and shipped. Every
// family hint threw ReferenceError at call time — and THE SUITE STAYED GREEN, because
// `composeOperatorHint` wraps `row.hint(merged)` in `try { … } catch (_) { /* fall through
// to the generic fallback */ }`. The whole hint layer was dead and 541 assertions passed.
//
// So: each dependent block below is gated on presence, and the GATE ITSELF IS THE RED —
// one named failure per missing symbol instead of a TypeError that takes the sweep with it.
// What makes a gated block trustworthy WHILE the contract is absent is not the gate; it is
// the mutation battery in (9), which feeds every checker defined here a deliberately broken
// input UNCONDITIONALLY, on every run. A guard is evidence only once mutation-proven.
// ===========================================================================

function isPlainObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

const CONTRACT = [
  { name: 'REFUSAL_WHY', ok: isPlainObj(REFUSAL_WHY) && Object.keys(REFUSAL_WHY).length > 0,
    what: 'the cell-keyed WHY map, keyed `${code}/${discriminatorValue}`, non-empty' },
  { name: 'refusalCellKey', ok: !!refusalCellKey,
    what: 'refusalCellKey(code, payload) -> `${code}/${discriminatorValue}`' },
  { name: 'assertCellClosure', ok: !!assertCellClosure,
    what: 'assertCellClosure() -> { ok, missing, stale }' },
  { name: 'routeProse', ok: !!routeProse,
    what: 'routeProse(route) -> the GENERATED exit sentence every hint ends with' },
  { name: 'refusalFact', ok: !!refusalFact,
    what: 'refusalFact(code, payload) -> the FACT clause (what happened), rendered from the payload alone' },
];
for (const sym of CONTRACT) {
  if (!sym.ok) PENDING_CONTRACT.push(sym.name);
  assert(sym.ok, 'CONTRACT: the kernel must export ' + sym.name + ' — ' + sym.what
    + '. Until it lands the cell-keyed WHY slot does not exist; the blocks that depend on it cannot run, '
    + 'and their checkers are proved armed by the mutation battery rather than by this gate');
}

// ===========================================================================
// (3B) PIN 1 — THE HINT LAYER IS ALIVE.
//
// Called DIRECTLY off KERNEL_REFUSAL_REGISTRY, never through `composeOperatorHint`, whose
// catch is exactly what hid the failure. Reading the layer through the accessor that
// swallows its errors is measuring the swallow, not the layer.
// ===========================================================================

// probeFamilyHint(row, payload) — PURE, and deliberately NOT the production accessor: a hint
// that throws is REPORTED, never degraded. It calls twice because a hint that is not a pure
// function of its payload is a second way for this layer to be quietly wrong.
function probeFamilyHint(row, payload) {
  if (!row || typeof row.hint !== 'function') {
    return { ok: false, threw: false, value: null, error: 'the registry row carries no hint() FUNCTION' };
  }
  let a, b;
  try { a = row.hint(payload); b = row.hint(payload); }
  catch (e) {
    return { ok: false, threw: true, value: null,
      error: 'hint() THREW ' + ((e && e.name) || 'Error') + ': ' + ((e && e.message) || String(e))
        + ' — this is the exact failure composeOperatorHint swallows' };
  }
  if (typeof a !== 'string') {
    return { ok: false, threw: false, value: a, error: 'hint() returned ' + (a === null ? 'null' : typeof a) + ', not a string' };
  }
  if (!a.trim()) return { ok: false, threw: false, value: a, error: 'hint() returned an empty string' };
  if (a !== b) {
    return { ok: false, threw: false, value: a,
      error: 'hint() is not a pure function of its payload — two calls on the same payload disagreed' };
  }
  return { ok: true, threw: false, value: a, error: null };
}

for (const cell of CELLS) {
  const row = KERNEL_REFUSAL_REGISTRY[cell.code];
  const bad = [];
  for (const shape of [['payload', cell.payload], ['minimal', cell.minimal], ['rich', cell.rich]]) {
    const probe = probeFamilyHint(row, shape[1]);
    if (!probe.ok) bad.push(shape[0] + ' — ' + probe.error);
  }
  assert(bad.length === 0,
    'HINT ALIVE ' + cell.cell + ': the family hint must render for this cell when called DIRECTLY off '
      + 'KERNEL_REFUSAL_REGISTRY (a hint that throws is a dead layer, not a fallback) — ' + bad.join(' | '));
}

// --- 1B: composeOperatorHint must not MASK a throwing hint ---------------------------
//
// The registry is frozen, so the mutation is installed on an UNFROZEN COMPILED COPY of the
// kernel: the same source text with every `Object.freeze(` stripped, compiled at the real
// path (the module has no load-time side effects and no relative requires). That keeps the
// mutation END-TO-END — it patches production behaviour, not a stand-in for it — and it
// survives any rewrite of the hint bodies, because it keys on nothing inside them.
const NodeModule = require('module');
function loadUnfrozenKernel() {
  try {
    const file = path.join(REPO, 'scripts', 'kaola-workflow-adaptive-schema.js');
    const src = fs.readFileSync(file, 'utf8').split('Object.freeze(').join('(');
    const m = new NodeModule(file, null);
    m.filename = file;
    m.paths = NodeModule._nodeModulePaths(path.dirname(file));
    m._compile(src, file);
    return { ok: true, kernel: m.exports, error: null };
  } catch (e) { return { ok: false, kernel: null, error: (e && e.message) || String(e) }; }
}

function callComposeHint(kernel, reason, generic) {
  try { return { threw: false, value: kernel.composeOperatorHint(reason, {}, {}, generic) }; }
  catch (e) { return { threw: true, value: null, error: (e && e.message) || String(e) }; }
}

// classifyHintFailureHandling(outcome, generic) — PURE. A hint that throws is a PROGRAMMING
// ERROR; the one thing that must never happen is that it becomes indistinguishable from a
// working layer. Throwing is detected; returning something other than the caller's generic
// fallback is detected; silently returning the generic fallback is MASKED.
function classifyHintFailureHandling(outcome, generic) {
  if (!outcome) return { detected: false, mode: 'no_outcome' };
  if (outcome.threw) return { detected: true, mode: 'threw' };
  if (outcome.value === generic) return { detected: false, mode: 'silent_generic_fallback' };
  if (typeof outcome.value === 'string' && outcome.value.trim()) return { detected: true, mode: 'distinct_value' };
  return { detected: false, mode: 'no_output' };
}

// One legacy condition per family, each of which classifies to that family. The BASELINE
// assertion proves the condition really reaches the family hint before the mutation, so a
// red below can never be the probe missing its target.
const THROW_PROBE_CONDITIONS = {
  kernel_write_failed: 'freeze_failed',
  kernel_cas_lost: 'replan_parent_plan_changed',
  kernel_integrity_broken: 'plan_integrity_failed',
  kernel_lock_held: 'scheduler_lock_stale',
  kernel_evidence_missing: 'evidence_absent',
  sink_verdict: 'gate_unsatisfied',
  consent_required: 'halt_pending',
};
const MASK_GENERIC = 'ZZZ-CALLER-GENERIC-FALLBACK';
{
  const loaded = loadUnfrozenKernel();
  assert(loaded.ok, 'MASK PROBE: the sweep must be able to compile an UNFROZEN copy of the kernel in order to '
    + 'install a throwing hint — without it the swallow is untestable. ' + loaded.error);
  if (loaded.ok) {
    const k = loaded.kernel;
    assert(k.KERNEL_REFUSAL_REGISTRY && !Object.isFrozen(k.KERNEL_REFUSAL_REGISTRY),
      'MASK PROBE: the compiled copy must be MUTABLE, else the mutation is never installed and every assertion below reads vacuously green');
    for (const family of KERNEL_REFUSAL_VOCABULARY) {
      const cond = THROW_PROBE_CONDITIONS[family];
      const row = k.KERNEL_REFUSAL_REGISTRY[family];
      if (typeof cond !== 'string' || !row) {
        assert(false, 'MASK PROBE[' + family + ']: every enumerated family needs a legacy condition that classifies to it');
        continue;
      }
      const original = row.hint;
      const base = callComposeHint(k, cond, MASK_GENERIC);
      assert(!base.threw && typeof base.value === 'string' && base.value !== MASK_GENERIC,
        'MASK PROBE[' + family + ']: the probe condition "' + cond + '" must reach THIS family hint before any mutation '
          + '— otherwise the two assertions below are vacuous');

      let installed = false;
      try {
        row.hint = () => { throw new ReferenceError('composeRefusalHint is not defined'); };
        installed = row.hint !== original;
      } catch (_) { installed = false; }
      const thrown = installed ? callComposeHint(k, cond, MASK_GENERIC) : null;
      try { row.hint = () => ''; } catch (_) { /* reported through `installed` */ }
      const unrenderable = installed ? callComposeHint(k, cond, MASK_GENERIC) : null;
      try { row.hint = original; } catch (_) { /* the copy is discarded either way */ }

      const verdict = classifyHintFailureHandling(thrown, MASK_GENERIC);
      assert(installed && verdict.detected,
        'MASK[' + family + ']: a family hint that THROWS must be a DETECTABLE condition, not a silent downgrade — '
          + 'composeOperatorHint returned ' + JSON.stringify(thrown && thrown.value) + ' (mode: ' + verdict.mode + '). '
          + 'This is the exact hole that let an entire dead hint layer ship green');
      assert(installed && !(thrown && unrenderable && thrown.threw === false && unrenderable.threw === false
        && thrown.value === unrenderable.value),
        'MASK[' + family + ']: a hint that THROWS (a programming error) and a hint that returns nothing renderable '
          + '(a payload it cannot render) must not be handled identically — a catch that cannot tell them apart '
          + 'reports neither');
    }
  }
}

// ===========================================================================
// (3C) PIN 2 — NO FABRICATED FIELDS.
//
// A discriminator that does not carry the family's typical fields must render NOTHING for
// them. Measured defect: `kernel_lock_held` with `kind:'project_claim'` rendered "held by a
// LIVE holder (unknown subcommand, pid ? on unknown host, since unknown time)" — four
// placeholders where a truthful template said something true. Placeholders are worse than
// silence: they read as measurements.
// ===========================================================================

const FABRICATED_TOKENS = Object.freeze([
  { label: '<unknown>', re: /<unknown>/i },
  { label: 'unknown', re: /\bunknown\b/i },
  { label: 'undefined', re: /\bundefined\b/i },
  { label: 'null', re: /\bnull\b/i },
  { label: 'n/a', re: /\bn\/a\b/i },
  { label: ' ? ', re: / \? / },
  { label: 'NaN', re: /\bNaN\b/ },
]);

// checkNoFabricatedFields(text) — PURE.
function checkNoFabricatedFields(text) {
  if (typeof text !== 'string') return ['the text did not render'];
  const errors = [];
  for (const t of FABRICATED_TOKENS) {
    if (t.re.test(text)) errors.push('FABRICATED "' + t.label + '" — a field the payload never carried was rendered as a placeholder');
  }
  return errors;
}

// checkFieldRendered(text, probe) — PURE, the POSITIVE half. The negative pin alone is
// satisfied by rendering nothing at all, which is a different way to be useless.
function checkFieldRendered(text, probe) {
  if (typeof text !== 'string') return ['the text did not render'];
  if (typeof probe !== 'string' || !probe) return ['no probe value supplied — the positive check went vacuous'];
  if (text.indexOf(probe) < 0) {
    return ['DROPPED FIELD — the payload CARRIES "' + probe + '" and the rendered text never mentions it'];
  }
  return [];
}

for (const cell of CELLS) {
  const row = KERNEL_REFUSAL_REGISTRY[cell.code];
  const probe = probeFamilyHint(row, cell.minimal);
  const errors = probe.ok ? checkNoFabricatedFields(probe.value) : ['the hint did not render — ' + probe.error];
  assert(errors.length === 0,
    'MINIMAL ' + cell.cell + ': rendering the DISCRIMINATOR ALONE must invent nothing — ' + errors.join(' | ')
      + ' :: rendered ' + JSON.stringify(probe.value));
}
for (const cell of CELLS) {
  const row = KERNEL_REFUSAL_REGISTRY[cell.code];
  const probe = probeFamilyHint(row, cell.rich);
  const errors = probe.ok ? checkFieldRendered(probe.value, cell.probe) : ['the hint did not render — ' + probe.error];
  assert(errors.length === 0,
    'CARRIED ' + cell.cell + ': ' + errors.join(' | ') + ' :: rendered ' + JSON.stringify(probe.value));
}

// ===========================================================================
// (3D) PIN 3 — THE HINT CANNOT CONTRADICT ITS OWN ROUTE.
//
// Route and hint are resolved from THE SAME PAYLOAD, and the hint's exit sentence must be
// exactly `routeProse(route)`. This is the structural reason the migration is worth doing:
// a hint whose prose is written by hand can drift from the verb the machine resolved, and
// nothing notices. Generated prose cannot drift from its own input.
// ===========================================================================

// checkHintRouteAgreement(hint, route, prose) — PURE.
function checkHintRouteAgreement(hint, route, prose) {
  if (typeof hint !== 'string' || !hint.trim()) return ['the hint did not render'];
  // A deliberate null route (the `foreign_archive` silence) demands no exit sentence; that
  // cell's null-ness is pinned by the Tier-A walk above.
  if (route === null || route === undefined) return [];
  if (typeof prose !== 'string' || !prose.trim()) {
    return ['routeProse() rendered NOTHING for a live route — the exit sentence cannot be checked'];
  }
  const errors = [];
  if (hint.length < prose.length || hint.slice(hint.length - prose.length) !== prose) {
    errors.push('EXIT SENTENCE — the hint does not END with routeProse(route). expected tail '
      + JSON.stringify(prose) + ', got tail ' + JSON.stringify(hint.slice(-Math.max(prose.length, 48))));
  }
  if (route.script && hint.indexOf(route.verb) < 0) {
    errors.push('VERB CONTRADICTION — the hint never names "' + route.verb + '", the verb its own route points at');
  }
  return errors;
}

// checkRouteProse(prose, route) — PURE. The prose is byte-copied into every edition, so it
// names a SCRIPT ID and a bare verb, never an edition filename.
function checkRouteProse(prose, route) {
  if (route === null || route === undefined) {
    return prose === '' ? []
      : ['routeProse() must be TOTAL and render the EMPTY STRING for an absent route — got ' + JSON.stringify(prose)];
  }
  if (typeof prose !== 'string' || !prose.trim()) return ['routeProse() rendered nothing for a live route'];
  const errors = [];
  if (route.script) {
    if (prose.indexOf(route.verb) < 0) errors.push('the prose never names the verb "' + route.verb + '"');
    if (prose.indexOf(route.script) < 0) errors.push('the prose never names the script id "' + route.script + '"');
  }
  if (/kaola-(workflow|gitlab|gitea)-/.test(prose)) {
    errors.push('the prose names an EDITION script FILENAME — this text is byte-copied into every edition, so it would be wrong in three of four');
  }
  return errors.concat(checkNoFabricatedFields(prose));
}

// The hint is the FAMILY hint, so the route it must agree with is the FAMILY route resolved
// from the same payload — `row.route(payload)`, which is what `resolveRoute` is. The
// per-finding routes inside the composite are a different resolver with no hint of their
// own; the Tier-A walk above is what proves their shape and their deliberate nulls.
function cellRoute(cell) { return resolveRoute(cell.code, cell.payload); }
function safeCall(fn, arg) {
  try { return { ok: true, value: fn(arg), error: null }; }
  catch (e) { return { ok: false, value: null, error: ((e && e.name) || 'Error') + ': ' + ((e && e.message) || String(e)) }; }
}

if (routeProse) {
  for (const cell of CELLS) {
    const row = KERNEL_REFUSAL_REGISTRY[cell.code];
    const route = cellRoute(cell);
    const hint = probeFamilyHint(row, cell.payload);
    const prose = safeCall(routeProse, route);
    const errors = !hint.ok ? ['the hint did not render — ' + hint.error]
      : !prose.ok ? ['routeProse() THREW — ' + prose.error]
        : checkHintRouteAgreement(hint.value, route, prose.value);
    assert(errors.length === 0, 'ROUTE AGREEMENT ' + cell.cell + ': ' + errors.join(' | '));
  }
  for (const cell of CELLS) {
    const route = cellRoute(cell);
    const prose = safeCall(routeProse, route);
    const errors = prose.ok ? checkRouteProse(prose.value, route) : ['routeProse() THREW — ' + prose.error];
    assert(errors.length === 0, 'ROUTE PROSE ' + cell.cell + ': ' + errors.join(' | ')
      + ' :: rendered ' + JSON.stringify(prose.value));
  }
  // Total and deterministic: the prose is generated, so the same route must generate the
  // same sentence, and an absent route must not be an exception path.
  for (const probe of [null, undefined, 'not-a-route', 42, {}]) {
    assert(safeCall(routeProse, probe).ok,
      'ROUTE PROSE: routeProse() must be TOTAL — it threw on ' + JSON.stringify(probe === undefined ? 'undefined' : probe));
  }
  {
    const r = { verb: 'orient', script: 'adaptive-node', args: '--project <P> --json' };
    assert(safeCall(routeProse, r).value === safeCall(routeProse, r).value,
      'ROUTE PROSE: routeProse() must be a pure function of its route — two calls disagreed');
  }
}

// ===========================================================================
// (3E) PIN 4 — CELL CLOSURE, BOTH DIRECTIONS.
//
// `missing` = a live cell with no WHY clause. `stale` = a WHY key that is not a live cell.
// A closure check that catches only one direction lets the map rot silently: one direction
// alone lets a renamed discriminator leave its old clause behind, reading green forever
// while the live cell falls back to nothing.
//
// The `${code}/*` fallback key is LEGAL (it is what refusalCellKey emits for a discriminator
// the family does not declare) but it does NOT satisfy a live cell — otherwise seven
// wildcards would close the whole map and the cell-keyed slot would be a slot in name only.
// ===========================================================================

function deriveLiveCellKeys() {
  const keys = [];
  for (const code of KERNEL_REFUSAL_VOCABULARY) {
    for (const value of REFUSAL_PAYLOAD_SCHEMAS[code].values) keys.push(code + '/' + value);
  }
  return keys;
}
const LIVE_CELL_KEYS = deriveLiveCellKeys();
const WILDCARD_KEYS = KERNEL_REFUSAL_VOCABULARY.map(c => c + '/*');

assert(LIVE_CELL_KEYS.length >= 40 && LIVE_CELL_KEYS.length === new Set(LIVE_CELL_KEYS).size,
  'CLOSURE: the live-cell key set must be derived non-vacuously and be duplicate-free — got ' + LIVE_CELL_KEYS.length);

// computeClosure(whyKeys, liveKeys, wildcardKeys) — PURE, the sweep's own independent
// derivation. It exists so that `assertCellClosure()` is checked against a second opinion
// rather than trusted: a production closure that hardcodes `{ ok: true }` disagrees here.
function computeClosure(whyKeys, liveKeys, wildcardKeys) {
  const have = new Set(whyKeys || []);
  const live = new Set(liveKeys || []);
  const wild = new Set(wildcardKeys || []);
  const missing = [], stale = [];
  for (const k of live) if (!have.has(k)) missing.push(k);
  for (const k of have) if (!live.has(k) && !wild.has(k)) stale.push(k);
  return { ok: missing.length === 0 && stale.length === 0, missing: missing.sort(), stale: stale.sort() };
}

// checkCellKey(actual, expected) — PURE.
function checkCellKey(actual, expected) {
  if (typeof actual !== 'string' || !actual) return ['refusalCellKey() returned no key'];
  if (actual !== expected) return ['CELL KEY — expected "' + expected + '", got "' + actual + '"'];
  return [];
}

// renderWhyClause(entry, payload) — PURE. The clause may be a static string or a function of
// the payload; either way the LOAD-BEARING property is the same, so the pin does not force
// the shape.
function renderWhyClause(entry, payload) {
  if (typeof entry === 'string') {
    return entry.trim() ? { ok: true, value: entry, error: null } : { ok: false, value: entry, error: 'the WHY clause is an empty string' };
  }
  if (typeof entry === 'function') {
    let v;
    try { v = entry(payload); }
    catch (e) { return { ok: false, value: null, error: 'the WHY clause THREW ' + ((e && e.name) || 'Error') + ': ' + ((e && e.message) || String(e)) }; }
    if (typeof v !== 'string' || !v.trim()) return { ok: false, value: v, error: 'the WHY clause rendered nothing' };
    return { ok: true, value: v, error: null };
  }
  return { ok: false, value: entry, error: 'the WHY clause is neither a string nor a function of the payload' };
}

if (refusalCellKey) {
  for (const cell of CELLS) {
    const errors = [];
    for (const shape of [['payload', cell.payload], ['minimal', cell.minimal], ['rich', cell.rich]]) {
      const got = safeCall(p => refusalCellKey(cell.code, p), shape[1]);
      if (!got.ok) { errors.push(shape[0] + ' — refusalCellKey() THREW ' + got.error); continue; }
      const e = checkCellKey(got.value, cell.code + '/' + cell.disc);
      if (e.length) errors.push(shape[0] + ' — ' + e.join('; '));
    }
    assert(errors.length === 0, 'CELL KEY ' + cell.cell + ': every payload shape of one cell must key to the SAME '
      + '`${code}/${discriminatorValue}` — ' + errors.join(' | '));
  }
  // The fallback, both ways in: an absent discriminator and an UNDECLARED discriminator value
  // both land on `${code}/*`. A code outside the enumerated vocabulary has no cell at all.
  assert(refusalCellKey('kernel_lock_held', {}) === 'kernel_lock_held/*',
    'CELL KEY: an ABSENT discriminator must fall back to the `${code}/*` key, not to a guessed value');
  assert(refusalCellKey('kernel_lock_held', { kind: 'zzz_not_a_kind' }) === 'kernel_lock_held/*',
    'CELL KEY: an UNDECLARED discriminator value must fall back to the `${code}/*` key — inventing a cell for it '
      + 'is how a stale key becomes invisible to the closure check');
  assert(refusalCellKey('zzz_not_a_family', { kind: 'scheduler' }) === null,
    'CELL KEY: a code outside KERNEL_REFUSAL_VOCABULARY has no cell — it must return null, never a fabricated key');
  assert(safeCall(p => refusalCellKey('kernel_lock_held', p), null).ok
    && safeCall(p => refusalCellKey('kernel_lock_held', p), 'nope').ok,
    'CELL KEY: refusalCellKey() must be TOTAL — a non-object payload must not throw');
}

if (assertCellClosure && isPlainObj(REFUSAL_WHY)) {
  const got = safeCall(() => assertCellClosure());
  assert(got.ok, 'CLOSURE: assertCellClosure() must be TOTAL — it threw: ' + got.error);
  const res = got.ok ? got.value : null;
  assert(isPlainObj(res) && typeof res.ok === 'boolean' && Array.isArray(res.missing) && Array.isArray(res.stale),
    'CLOSURE: assertCellClosure() must return { ok, missing[], stale[] } — got ' + JSON.stringify(res));
  if (isPlainObj(res) && Array.isArray(res.missing) && Array.isArray(res.stale)) {
    assert(res.ok === true && res.missing.length === 0 && res.stale.length === 0,
      'CLOSURE: the WHY map must be CLOSED over the live cell set — missing ' + JSON.stringify(res.missing)
        + ', stale ' + JSON.stringify(res.stale));
    // The second opinion. A production closure that hardcodes ok:true disagrees with this.
    const mine = computeClosure(Object.keys(REFUSAL_WHY), LIVE_CELL_KEYS, WILDCARD_KEYS);
    assert(JSON.stringify(res.missing.slice().sort()) === JSON.stringify(mine.missing)
      && JSON.stringify(res.stale.slice().sort()) === JSON.stringify(mine.stale),
      'CLOSURE: assertCellClosure() must AGREE with the sweep\'s own derivation from the payload schemas — '
        + 'production said ' + JSON.stringify({ missing: res.missing, stale: res.stale })
        + ', the sweep derived ' + JSON.stringify({ missing: mine.missing, stale: mine.stale }));
  }
  // Every key refusalCellKey can emit must resolve, or the fallback path renders no WHY at all.
  for (const wildcard of WILDCARD_KEYS) {
    assert(Object.prototype.hasOwnProperty.call(REFUSAL_WHY, wildcard),
      'CLOSURE: the `' + wildcard + '` fallback clause must exist — refusalCellKey() emits that key for any '
        + 'discriminator the family does not declare, and a key with no clause is a hint with no WHY');
  }
}

// --- 4B: closure mutation-proved on the PRODUCTION function, both directions -----------
// Same unfrozen-copy technique as the mask probe: delete a clause and the live cell must
// surface in `missing`; add a clause for an undeclared discriminator value and it must
// surface in `stale`.
if (assertCellClosure) {
  const loaded = loadUnfrozenKernel();
  assert(loaded.ok, 'CLOSURE MUTATION: the sweep must be able to compile an unfrozen kernel copy — ' + loaded.error);
  if (loaded.ok && loaded.kernel.REFUSAL_WHY && typeof loaded.kernel.assertCellClosure === 'function') {
    const k = loaded.kernel;
    const victim = LIVE_CELL_KEYS[0];
    const intruder = 'kernel_lock_held/zzz_not_a_declared_kind';

    let deleted = false;
    try { delete k.REFUSAL_WHY[victim]; deleted = !Object.prototype.hasOwnProperty.call(k.REFUSAL_WHY, victim); } catch (_) { deleted = false; }
    const afterDelete = safeCall(() => k.assertCellClosure());
    assert(deleted && afterDelete.ok && afterDelete.value && afterDelete.value.ok === false
      && (afterDelete.value.missing || []).indexOf(victim) >= 0,
      'CLOSURE MUTATION (missing): deleting the "' + victim + '" clause must surface it in `missing` — got '
        + JSON.stringify(afterDelete.value) + (deleted ? '' : ' [the deletion did not take]'));

    let added = false;
    try { k.REFUSAL_WHY[victim] = 'restored for the second direction'; k.REFUSAL_WHY[intruder] = 'a clause for a value no schema declares'; added = k.REFUSAL_WHY[intruder] != null; } catch (_) { added = false; }
    const afterAdd = safeCall(() => k.assertCellClosure());
    assert(added && afterAdd.ok && afterAdd.value && afterAdd.value.ok === false
      && (afterAdd.value.stale || []).indexOf(intruder) >= 0,
      'CLOSURE MUTATION (stale): a clause keyed to an UNDECLARED discriminator value must surface in `stale` — got '
        + JSON.stringify(afterAdd.value) + (added ? '' : ' [the insertion did not take]'));

    // …and the wildcard must NOT be reported stale, or the fallback becomes unusable.
    let wild = false;
    try { delete k.REFUSAL_WHY[intruder]; k.REFUSAL_WHY['kernel_lock_held/*'] = 'the declared fallback'; wild = true; } catch (_) { wild = false; }
    const afterWild = safeCall(() => k.assertCellClosure());
    assert(wild && afterWild.ok && afterWild.value
      && (afterWild.value.stale || []).indexOf('kernel_lock_held/*') < 0,
      'CLOSURE MUTATION (wildcard): the `${code}/*` fallback key is LEGAL and must never be reported stale — got '
        + JSON.stringify(afterWild.value));
  }
}

// --- 4C: the WHY clause and the FACT clause are actually IN the rendered hint ----------
// A cell-keyed map nothing reads is a map, not a slot.
if (refusalCellKey && isPlainObj(REFUSAL_WHY)) {
  for (const cell of CELLS) {
    const row = KERNEL_REFUSAL_REGISTRY[cell.code];
    const hint = probeFamilyHint(row, cell.payload);
    const key = safeCall(p => refusalCellKey(cell.code, p), cell.payload);
    const entry = key.ok && key.value ? REFUSAL_WHY[key.value] : undefined;
    const clause = renderWhyClause(entry, cell.payload);
    const errors = [];
    if (!hint.ok) errors.push('the hint did not render — ' + hint.error);
    if (!key.ok) errors.push('refusalCellKey() THREW — ' + key.error);
    else if (entry === undefined) errors.push('no WHY clause is registered at "' + key.value + '"');
    else if (!clause.ok) errors.push(clause.error);
    else if (hint.ok && hint.value.indexOf(clause.value) < 0) {
      errors.push('the hint does not CONTAIN its own cell\'s WHY clause ' + JSON.stringify(clause.value)
        + ' — the slot is keyed but unread');
    }
    assert(errors.length === 0, 'WHY CLAUSE ' + cell.cell + ': ' + errors.join(' | '));
  }
}

if (refusalFact) {
  for (const cell of CELLS) {
    const row = KERNEL_REFUSAL_REGISTRY[cell.code];
    const errors = [];
    const full = safeCall(p => refusalFact(cell.code, p), cell.payload);
    const minimal = safeCall(p => refusalFact(cell.code, p), cell.minimal);
    if (!full.ok) errors.push('refusalFact() THREW on the full payload — ' + full.error);
    else if (typeof full.value !== 'string' || !full.value.trim()) errors.push('refusalFact() rendered nothing for a live cell');
    if (!minimal.ok) errors.push('refusalFact() THREW on the minimal payload — ' + minimal.error);
    else errors.push.apply(errors, checkNoFabricatedFields(minimal.value).map(e => 'minimal payload: ' + e));
    const hint = probeFamilyHint(row, cell.payload);
    if (full.ok && typeof full.value === 'string' && full.value.trim() && hint.ok
      && hint.value.indexOf(full.value) < 0) {
      errors.push('the hint does not CONTAIN the fact ' + JSON.stringify(full.value)
        + ' — the operator would be reading two different accounts of the same refusal');
    }
    if (full.ok && typeof full.value === 'string' && /kaola-(workflow|gitlab|gitea)-/.test(full.value)) {
      errors.push('the fact names an EDITION script filename — this text is byte-copied into every edition');
    }
    assert(errors.length === 0, 'FACT ' + cell.cell + ': ' + errors.join(' | '));
  }
  assert(refusalFact('zzz_not_a_family', { kind: 'scheduler' }) === null,
    'FACT: a code outside KERNEL_REFUSAL_VOCABULARY has no fact — it must return null, never a fabricated sentence');
  assert(safeCall(p => refusalFact('kernel_lock_held', p), null).ok,
    'FACT: refusalFact() must be TOTAL — a non-object payload must not throw');
}

// ===========================================================================
// (4) THE FOLD — the shipped bare-verb DEVIATION_ROUTES table must be DERIVED from the
//     kernel resolver, byte-for-byte identical to what it emitted before the fold.
// ===========================================================================

const EXPECTED_DEVIATION_ROUTES = {
  write_set_overflow: 'revert-overflow',
  write_set_granularity: 'revert-overflow',
  lockfile_write: 'revert-overflow',
  mirror_write: 'revert-overflow',
  count_bump: 'revert-overflow',
  unattributed_write: 'amend-surface',
  sensitive_write_unreviewed: 'shape_refutation',
  final_fix_production_surface: 'shape_refutation',
};
{
  const derived = deriveDeviationRoutes();
  assert(JSON.stringify(Object.keys(derived).sort()) === JSON.stringify(Object.keys(EXPECTED_DEVIATION_ROUTES).sort())
    && Object.keys(EXPECTED_DEVIATION_ROUTES).every(k => derived[k] === EXPECTED_DEVIATION_ROUTES[k]),
    'FOLD: the derived deviation-route table must reproduce the shipped values EXACTLY (zero behavior change) — got '
      + JSON.stringify(derived));
  assert(!Object.prototype.hasOwnProperty.call(derived, 'foreign_archive'),
    'FOLD: foreign_archive must stay ABSENT from the derived table — its null is a deliberate silence, not a gap');
  const adaptiveNode = read('scripts/kaola-workflow-adaptive-node.js');
  assert(/const DEVIATION_ROUTES = reviewSchema\.deriveDeviationRoutes\(\)/.test(adaptiveNode),
    'FOLD: adaptive-node must DERIVE its deviation routes from the kernel, not hold an independent copy');
  const nodeExports = require('./kaola-workflow-adaptive-node');
  assert(nodeExports.DEVIATION_ROUTES && nodeExports.DEVIATION_ROUTES.write_set_overflow === 'revert-overflow',
    'FOLD: the derived table must still be the one the aggregator exports');
}

// ===========================================================================
// (4B) ONE EXIT, TWO RENDERINGS — the bare `route:` token and the structured `refusal_route`
//      must name the SAME verb.
//
// An actionable envelope is stamped twice: `route` from the derived bare-verb table (keyed by
// reason) and `refusal_route` from the family resolver (keyed by the classified payload). They
// are two RENDERINGS of one exit, and nothing checked that they rendered the same one. Measured
// on the shipped code before this check landed, all EIGHT reasons carrying a bare token resolved
// `claim:finalize` structurally — so an operator told to "follow the typed route" got two
// different answers, and for `final_fix_production_surface` the structured one is a re-read of a
// verdict that was never written (every refusal in that ladder is zero-write), which can never
// clear the refusal.
//
// Walking the derived table is what makes this ratchet-shaped: a reason cannot gain a bare token
// without the structured route agreeing, in either direction.
// ===========================================================================
{
  const bare = deriveDeviationRoutes();
  const tokenOf = (verb) => String(verb || '').replace(/-/g, '_');
  assert(Object.keys(bare).length >= 8,
    'ONE EXIT: the derived bare-route table must be non-trivial, got ' + Object.keys(bare).length + ' rows');
  for (const reason of Object.keys(bare).sort()) {
    const hit = classifyRefusalCondition(reason);
    assert(hit && hit.family,
      'ONE EXIT: "' + reason + '" emits a bare route token but classifies to no family — the two '
      + 'renderings cannot be compared, so nothing would notice them diverging');
    if (!hit || !hit.family) continue;
    const structured = resolveRoute(hit.family, Object.assign({}, hit.patch));
    assert(structured,
      'ONE EXIT: "' + reason + '" emits the bare token "' + bare[reason] + '" but resolves NO '
      + 'structured refusal_route');
    if (!structured) continue;
    assert(tokenOf(bare[reason]) === tokenOf(structured.verb),
      'ONE EXIT: "' + reason + '" names TWO exits — bare route "' + bare[reason]
      + '" vs structured refusal_route "' + routeKey(structured) + '". A refusal names exactly one '
      + 'exit, and that exit is a promise the verb will accept the work; two answers means at least '
      + 'one of them cannot clear the refusal.');
  }
}

// ===========================================================================
// (4C) R4 IS A PROPERTY OF THE CELL, NOT OF THE FAMILY.
//
// `auto_remediable` is declared per FAMILY (the ADR's fenced block is the single source for that
// column). But R4 asks about CONTENT — would repairing this deviation launder the evidence? — and
// `sink_verdict` holds cells that answer it differently: a red chain is re-run; a finalize-time
// PRODUCTION fix is the one deviation R4 exists to say must be reported and never repaired. A
// family flag cannot discriminate, so the cell tightening is resolved from the payload.
// ===========================================================================
{
  const resolveAutoRemediable = kernelFn('resolveAutoRemediable');
  const R4_CELLS = schema.R4_NON_REMEDIABLE_CELLS;
  assert(typeof resolveAutoRemediable === 'function',
    'R4 CELL: the kernel must export resolveAutoRemediable(code, payload) — the per-cell accessor');
  assert(Array.isArray(R4_CELLS) && R4_CELLS.length > 0 && Object.isFrozen(R4_CELLS),
    'R4 CELL: the kernel must export a frozen, non-empty R4_NON_REMEDIABLE_CELLS list');
  if (typeof resolveAutoRemediable === 'function' && Array.isArray(R4_CELLS)) {
    // The named cell reads FALSE even though its family reads true.
    assert(KERNEL_REFUSAL_REGISTRY.sink_verdict.auto_remediable === true,
      'R4 CELL: the precondition of this whole block is that sink_verdict is auto-remediable at the '
      + 'FAMILY level — if that changed, the tightening is measuring nothing');
    assert(resolveAutoRemediable('sink_verdict',
      { findings: [{ kind: 'final_fix_production_surface', detail: 'x' }] }) === false,
      'R4 CELL: final_fix_production_surface is NOT auto-remediable — a behavior change arriving '
      + 'after every reviewer is discharged is a deviation that is itself evidence, and evidence is '
      + 'reported, never repaired');
    // ...and a sibling cell in the same family still reads the family default, or the tightening
    // has swallowed the family rather than refining it.
    assert(resolveAutoRemediable('sink_verdict', { findings: [{ kind: 'tests_red' }] }) === true,
      'R4 CELL: a sibling cell keeps the family default — a red chain is re-run, and a tightening '
      + 'that turned the whole family false would delete the auto-remedy the family exists for');
    // TIGHTEN-ONLY, both directions: never widens an R4 family, and an unlisted cell is untouched.
    for (const code of KERNEL_REFUSAL_VOCABULARY) {
      const row = KERNEL_REFUSAL_REGISTRY[code];
      if (row.auto_remediable !== false) continue;
      assert(resolveAutoRemediable(code, {}) === false,
        'R4 CELL: the per-cell resolver may only TIGHTEN — it widened the already-R4 family "' + code + '"');
    }
    for (const key of R4_CELLS) {
      const parts = String(key).split('/');
      assert(parts.length === 2 && KERNEL_REFUSAL_VOCABULARY.indexOf(parts[0]) >= 0,
        'R4 CELL: "' + key + '" must be a `${code}/${discriminator}` key over the enumerated vocabulary');
      assert(LIVE_CELL_KEYS.indexOf(key) >= 0,
        'R4 CELL: "' + key + '" must name a LIVE cell — a tightening for a cell that does not exist '
        + 'is silently inert, which is the exact shape of a guard nobody notices is off');
    }
    // TOTAL: a code outside the vocabulary and a junk payload must not throw.
    assert(resolveAutoRemediable('zzz_not_a_family', {}) === null,
      'R4 CELL: a code outside the enumerated vocabulary resolves null, never a fabricated verdict');
    assert(safeCall(p => resolveAutoRemediable('sink_verdict', p), null).ok,
      'R4 CELL: resolveAutoRemediable must be TOTAL — it threw on a non-object payload');
    // AND IT REACHES THE ENVELOPE. A derivation nothing stamps is a derivation nobody reads.
    const env = schema.refuse('final_fix_production_surface', { production_paths: ['src/app.js'] });
    assert(env.auto_remediable === false,
      'R4 CELL: the emitted envelope must carry auto_remediable:false for the tightened cell — '
      + 'without the stamp the one deviation R4 names ships looking auto-repairable, got '
      + JSON.stringify(env.auto_remediable));
    assert(routeKey(env.refusal_route) === 'replan:shape-refutation',
      'R4 CELL: ...and it still routes at the refuted SHAPE rather than at a repair verb, got '
      + JSON.stringify(env.refusal_route));
    const sibling = schema.refuse('chains_red', {});
    assert(sibling.auto_remediable === undefined,
      'R4 CELL: an auto-remediable sibling gains NO stamp — presence of the flag is itself the '
      + 'never-repair signal, got ' + JSON.stringify(sibling.auto_remediable));
  }
}

// The four hint tables now share ONE accessor with ONE fallback chain.
{
  for (const rel of ['scripts/kaola-workflow-adaptive-node.js', 'scripts/kaola-workflow-plan-validator.js',
    'scripts/kaola-workflow-commit-node.js']) {
    assert(/composeOperatorHint\(/.test(read(rel)),
      'FOLD: ' + rel + ' must resolve hints through the kernel accessor (one lookup, one fallback chain)');
  }
  // The middle rung is the fold's win: a classified code with no legacy template gets its
  // FAMILY hint instead of the generic placeholder.
  const familyHint = schema.composeOperatorHint('replan_parent_plan_changed', {}, {}, 'GENERIC');
  assert(familyHint !== 'GENERIC' && /compare-and-set/.test(familyHint),
    'FOLD: a classified code with no legacy template must fall through to its FAMILY hint, not the generic placeholder');
  // A legacy template still wins, so today's text is reproduced byte-for-byte.
  const legacyWins = schema.composeOperatorHint('x_stale', {}, { x_stale: () => 'LEGACY' }, 'GENERIC');
  assert(legacyWins === 'LEGACY', 'FOLD: a legacy template must WIN over the family hint (zero behavior change)');
  // An unclassified code with no template still lands on the caller's own fallback.
  assert(schema.composeOperatorHint('zzz_not_a_code', {}, {}, 'GENERIC') === 'GENERIC',
    'FOLD: an unclassified code must still reach the caller-supplied generic fallback');
}

// ===========================================================================
// (5) DUAL EMISSION — additive and idempotent. `reason` keeps its legacy token while the
//     kernel runs in compat mode, so NO CONSUMER BREAKS; both values are always present.
// ===========================================================================
{
  assert(REFUSAL_EMISSION_MODE === 'compat',
    'DUAL: Batch 1 ships compat mode — flipping `reason` to the family is a later batch, gated on consumers');
  const env = schema.refuse('scheduler_lock_stale', { holder: { pid: 7 }, stale: true });
  assert(env.reason === 'scheduler_lock_stale', 'DUAL: `reason` must keep the LEGACY token in compat mode');
  assert(env.condition === 'scheduler_lock_stale', 'DUAL: `condition` must mirror the legacy token (the P2 census metric)');
  assert(env.refusal_family === 'kernel_lock_held', 'DUAL: the family must ride alongside the legacy token');
  assert(env.refusal_locus === 'L1', 'DUAL: the locus must be stamped from the registry');
  assert(env.refusal_route && env.refusal_route.verb === 'unlock' && env.refusal_route.script === 'adaptive-node',
    'DUAL: the stale scheduler lock must route to the unlock verb, not to prose');

  // Idempotent: a caller that already decided always wins — it knows the concrete situation.
  const preset = schema.refuse('scheduler_lock_stale', { refusal_route: { verb: 'orient', script: 'adaptive-node', args: '' }, stale: true });
  assert(preset.refusal_route.verb === 'orient', 'DUAL: a caller-set route must never be overwritten');
  const presetCond = schema.refuse('scheduler_lock_stale', { condition: 'legacy_alias' });
  assert(presetCond.condition === 'legacy_alias', 'DUAL: a caller-set condition must never be overwritten');

  // R4 rides on the envelope so a consumer can see "never auto-repair" without a lookup.
  const r4 = schema.refuse('plan_hash_mismatch', {});
  assert(r4.auto_remediable === false, 'DUAL: an R4 family must stamp auto_remediable:false on the envelope');

  // An unclassified token is left ALONE apart from the condition mirror — no guessed family.
  const unknown = schema.refuse('zzz_not_a_code', {});
  assert(unknown.refusal_family === undefined && unknown.condition === 'zzz_not_a_code',
    'DUAL: an unclassified token must gain the census mirror and NOTHING else — a guessed family is worse than none');

  // Non-actionable envelopes are untouched: presence of the stamp is itself a signal.
  const ok = schema.stampRefusalEnvelope({ result: 'ok', reason: 'mirrored' });
  assert(ok.condition === undefined && ok.refusal_family === undefined,
    'DUAL: a success envelope must gain nothing — an outcome value on an ok envelope is not a refusal');
}

// ===========================================================================
// (6) THE EXEMPT LEDGER — three properties make it a ledger, not a hiding place.
// ===========================================================================

const EXEMPT_PATH = 'scripts/refusal-sweep-exempt.json';
const exempt = JSON.parse(read(EXEMPT_PATH));
assert(Array.isArray(exempt.cells) && Array.isArray(exempt.retained_legacy),
  'EXEMPT: ' + EXEMPT_PATH + ' must carry `cells` and `retained_legacy` arrays');

for (const entry of exempt.cells.concat(exempt.retained_legacy)) {
  const label = entry.cell || entry.condition || '(unnamed)';
  assert(typeof entry.reason === 'string' && entry.reason.trim().length > 20,
    'EXEMPT[' + label + ']: every entry needs a one-line REASON');
  assert(Number.isInteger(entry.owner_issue),
    'EXEMPT[' + label + ']: every entry needs an OWNING ISSUE');
  assert(Number.isInteger(entry.batch),
    'EXEMPT[' + label + ']: every entry needs a BATCH');
}

// --- Tier B: provoke -> follow the route -> arrive green. ---
// Provokers register here as each family migrates. The registry is EMPTY in Batch 1 by
// design, and the two assertions below are the bidirectional staleness guard that stops the
// exempt list from silently outliving its work.
const TIER_B_PROVOKERS = {};
const exemptCells = new Set(exempt.cells.map(e => e.cell));
const blanketExempt = exemptCells.has('*');

for (const cellName of Object.keys(TIER_B_PROVOKERS)) {
  assert(!exemptCells.has(cellName),
    'EXEMPT: cell "' + cellName + '" has a registered provoker AND an exemption — delete the exemption, the work is done');
}
for (const entry of exempt.cells) {
  if (entry.cell === '*') continue;
  assert(CELLS.some(c => c.cell === entry.cell),
    'EXEMPT: cell "' + entry.cell + '" is exempt but is no longer a derived cell — delete the stale entry');
}
if (blanketExempt) {
  assert(Object.keys(TIER_B_PROVOKERS).length === 0,
    'EXEMPT: the blanket "*" cell exemption must be replaced by per-cell entries as soon as ANY provoker exists');
}

// ===========================================================================
// (7) THE CENSUS — the P2 metric. Scan all SEVEN refusal-bearing emission shapes; a
//     `reason:`-only scan would declare the codebase clean today at ~610 live strings.
// ===========================================================================

const CENSUS_FILES = fs.readdirSync(path.join(REPO, 'scripts'))
  .filter(f => /^kaola-workflow-.*\.js$/.test(f))
  .map(f => 'scripts/' + f);

// Shape 5 is a thrown condition whose message CONTINUES after the token (`'unknown_arg:' + arg`).
// The colon is the discriminator, not the space: `'timeout_minutes must be an integer'` is a prose
// message whose leading word is a FIELD NAME, and counting it would inflate the metric with things
// that were never conditions. Kept OUTSIDE the array literal because the mirror's extractor requires
// every line between the brackets to be a bare regex — that strictness is the fail-closed property,
// so the comment moves rather than the extractor loosening.
const EMISSION_SHAPES = [
  /(?:reason|reasonCode|status|verdict|handoff_status|inner_reason|condition)\s*:\s*'([a-z][a-z0-9_:]{3,})'/g,
  /\b(?:refuse|bad|fail)\(\s*'([a-z][a-z0-9_:]{3,})'/g,
  /reasons\.push\(\s*'([a-z][a-z0-9_:]{3,})'/g,
  /throw new Error\(\s*'([a-z][a-z0-9_]{3,})'\s*\)/g,
  /throw new Error\(\s*'([a-z][a-z0-9_]{3,}):/g,
];

// A LOCAL REFUSAL CONSTRUCTOR is a function whose FIRST parameter is carried into a returned
// object literal as the condition-bearing key — `const reject = reason => ({ ok: false, reason })`.
// That is the SAME role as `refuse`/`bad`/`fail` in shape 2, and shape 2 missed it for one reason
// only: the name was not on a hard-coded list of three. Hard-coding a longer list rebuilds the same
// blind spot one rename later, so the names are DERIVED per file instead. Measured at introduction:
// six such constructors (`reject`, `incomplete`, `refuseJournal`, `selectionRecordRefusal`,
// `refuseLineage`, `deferFailure`) minting 41 conditions the four static shapes could not see.
const REFUSAL_CONSTRUCTOR_KEYS = 'reason|reasonCode|status|verdict|handoff_status|inner_reason|condition';

function deriveRefusalConstructors(content) {
  const names = new Set();
  const keyRe = new RegExp('^(?:' + REFUSAL_CONSTRUCTOR_KEYS + ')$');
  const carries = (param, body) => {
    const shorthand = new RegExp('(?:^|[{,]\\s*)' + param + '\\s*(?:[,}]|$)', 'm').test(body);
    const explicit = new RegExp('(?:' + REFUSAL_CONSTRUCTOR_KEYS + ')\\s*:\\s*' + param + '\\s*(?:[,}]|$)', 'm').test(body);
    return (shorthand && keyRe.test(param)) || explicit;
  };
  const arrow = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\(\s*([A-Za-z_$][\w$]*)[^)]*\)|([A-Za-z_$][\w$]*))\s*=>\s*\(?\{([\s\S]{0,400}?)\}\)?[;,\n]/g;
  let m;
  while ((m = arrow.exec(content)) !== null) {
    const param = m[2] || m[3];
    if (param && carries(param, m[4] || '')) names.add(m[1]);
  }
  const declared = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(\s*([A-Za-z_$][\w$]*)[^)]*\)\s*\{([\s\S]{0,600}?)\n\}/g;
  while ((m = declared.exec(content)) !== null) {
    const body = m[3] || '';
    if (/return\s*\{/.test(body) && carries(m[2], body)) names.add(m[1]);
  }
  // The three hard-coded names already have their own shape; re-deriving them would double-scan.
  for (const already of ['refuse', 'bad', 'fail']) names.delete(already);
  return names;
}

function refusalConstructorShape(names) {
  if (!names.size) return null;
  const alternation = [...names].map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return new RegExp('\\b(?:' + alternation + ')\\(\\s*\'([a-z][a-z0-9_:]{3,})\'', 'g');
}

function scanEmittedConditions(files) {
  const seen = new Set();
  for (const rel of files) {
    const content = read(rel);
    const shapes = EMISSION_SHAPES.slice();
    // Derived per FILE: a constructor is local to the file that defines it, so a name meaning
    // "refusal" in one file must not be read as one in another that happens to reuse the word.
    const derived = refusalConstructorShape(deriveRefusalConstructors(content));
    if (derived) shapes.push(derived);
    for (const re of shapes) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(content)) !== null) if (m[1].indexOf('_') >= 0) seen.add(m[1]);
    }
  }
  return seen;
}

const emitted = scanEmittedConditions(CENSUS_FILES);
assert(emitted.size > 100,
  'CENSUS: the emitted-condition scan must be non-vacuous across all seven emission shapes — got ' + emitted.size);

// A family NAME must never be emitted as a legacy condition literal while compat mode runs:
// the two namespaces would collide and `condition` would stop being a faithful census metric.
for (const code of KERNEL_REFUSAL_VOCABULARY) {
  assert(!emitted.has(code),
    'CENSUS: "' + code + '" is a FAMILY name and must not also be emitted as a legacy condition literal');
}

// retained_legacy staleness, the other direction: a wall that is no longer emitted anywhere
// has had its coupled fix land, and the ledger entry must go.
for (const entry of exempt.retained_legacy) {
  assert(emitted.has(entry.condition),
    'EXEMPT: retained_legacy "' + entry.condition + '" is no longer emitted anywhere — its coupled fix landed, delete the entry');
}

let classified = 0, explicitlyOut = 0, unclassified = 0;
const perFamily = {};
for (const cond of emitted) {
  const c = classifyRefusalCondition(cond);
  if (!c) { unclassified++; continue; }
  if (!c.family) { explicitlyOut++; continue; }
  classified++;
  perFamily[c.family] = (perFamily[c.family] || 0) + 1;
}

// ===========================================================================
// (8) CROSS-EDITION — the sweep runs against the CANONICAL scripts/ tree; a companion
//     assertion proves the materialized kernel copies are byte-identical, so the registry
//     cannot fork per forge.
// ===========================================================================
{
  const canonical = read('scripts/kaola-workflow-adaptive-schema.js');
  const pluginsDir = path.join(REPO, 'plugins');
  let checked = 0;
  if (fs.existsSync(pluginsDir)) {
    for (const dir of fs.readdirSync(pluginsDir)) {
      const copy = path.join(pluginsDir, dir, 'scripts', 'kaola-workflow-adaptive-schema.js');
      if (!fs.existsSync(copy)) continue;
      checked++;
      assert(fs.readFileSync(copy, 'utf8') === canonical,
        'CROSS-EDITION: ' + path.relative(REPO, copy) + ' is not byte-identical to the canonical kernel — the registry has forked per forge');
    }
  }
  // Materialized copies are gitignored, so a clean checkout has none; the assertion is
  // conditional on their presence, never on a count.
  assert(checked >= 0, 'CROSS-EDITION: kernel copy check ran');
}

// ===========================================================================
// (8b) THE REPLAN BAND — an exit must be REACHABLE FROM THE STATE IT IS OFFERED IN.
//
// Every `replan_*` / `snapshot_*` / `cleanup_*` condition fires while the project is
// REPLAN-FENCED. The live fence projection refuses every action except the literal `'replan resume'`
// with `replan_in_progress` while that fence stands, so a route naming any member of
// `REPLAN_GUARDED_SUBCOMMANDS` is dead ON ARRIVAL — the operator is refused a second time, by a
// different code, with no exit named. That is the #840 class one level deeper than "the verb does
// not exist": the verb exists, dispatches, and cannot run HERE.
//
// The guarded set is SCANNED from adaptive-node's own source, never restated, so a subcommand added
// to the fence tomorrow is checked against these routes without anyone remembering to come back.
// ===========================================================================
{
  const nodeSrc = read('scripts/kaola-workflow-adaptive-node.js');
  const guardBlock = /const REPLAN_GUARDED_SUBCOMMANDS = new Set\(\[([\s\S]*?)\]\)/.exec(nodeSrc);
  assert(!!guardBlock, 'REPLAN-BAND: REPLAN_GUARDED_SUBCOMMANDS must be scannable from adaptive-node');
  const guarded = new Set(guardBlock ? (guardBlock[1].match(/'([a-z-]+)'/g) || []).map(s => s.slice(1, -1)) : []);
  assert(guarded.size > 10 && guarded.has('reconcile-running-set'),
    'REPLAN-BAND: the scanned fence set must be non-vacuous and contain the record-class default verb — '
    + 'got ' + guarded.size);

  // A route is admissible for a fenced condition iff it is NOT a fenced adaptive-node verb.
  const reachableUnderFence = (route) => !(route && route.script === 'adaptive-node' && guarded.has(route.verb));

  // (a) The band's own exit. Sampled across all three prefixes and across both the seam families
  //     (source / child / CAS) and the archive families, so the rule is checked as a BAND rather
  //     than as a handful of named tokens.
  const bandConditions = [
    'replan_snapshot_incomplete', 'replan_child_finding_uncovered', 'replan_child_invalid',
    'replan_activation_integrity_failure', 'replan_source_evidence_missing', 'replan_task_mirror_failed',
    'snapshot_copy_verify_failed', 'snapshot_source_changed', 'snapshot_manifest_conflict',
    'cleanup_receipt_missing', 'cleanup_receipt_incomplete', 'cleanup_removed_path_reappeared',
  ];
  for (const cond of bandConditions) {
    const env = schema.refuse(cond, {});
    assert(env.refusal_family === 'kernel_write_failed',
      'REPLAN-BAND: `' + cond + '` is a write-path fault and stays at kernel_write_failed: ' + env.refusal_family);
    assert(reachableUnderFence(env.refusal_route),
      'REPLAN-BAND: `' + cond + '` must NOT route to a replan-fenced verb — following it would refuse '
      + '`replan_in_progress` and dead-end: ' + JSON.stringify(env.refusal_route));
    assert(env.refusal_route && env.refusal_route.script === 'replan' && env.refusal_route.verb === 'resume',
      'REPLAN-BAND: ...and the one exit the fence itself declares legal is `replan resume`: '
      + JSON.stringify(env.refusal_route));
  }

  // (b) THE SEALED-ARCHIVE VERIFIER IS R4, NOT A RETRYABLE WRITE.
  //     verifySnapshotManifest / verifyAllEpochSnapshots / verifySchema2SnapshotBinding /
  //     verifyLegacyExternalBinding are READ-ONLY over an already-sealed parent epoch. A seal that
  //     does not verify IS the evidence: reported, investigated, never repaired. Classifying these
  //     as `kernel_write_failed` said the opposite twice over — `auto_remediable: true` plus a RETRY
  //     verb on a broken seal is precisely the laundering R4 exists to forbid.
  const sealVerifierConditions = [
    'snapshot_manifest_missing', 'snapshot_authority_unreadable', 'snapshot_epochs_unreadable',
    'snapshot_state_binding_unreadable', 'snapshot_staging_incomplete', 'snapshot_stage_files_missing',
    'snapshot_manifest_type_invalid', 'snapshot_epochs_type_invalid', 'snapshot_epoch_entry_invalid',
    'snapshot_epoch_sequence_invalid', 'snapshot_directory_invalid', 'snapshot_path_invalid',
    'snapshot_case_collision', 'snapshot_symlink_refused', 'snapshot_hardlink_refused',
    'snapshot_special_file_refused', 'snapshot_child_binding_invalid', 'snapshot_lineage_binding_invalid',
    'legacy_snapshot_binding_unsealed', 'legacy_external_seal_mismatch', 'legacy_child_not_pending',
    'replan_abort_undecidable',
  ];
  for (const cond of sealVerifierConditions) {
    const env = schema.refuse(cond, {});
    assert(env.refusal_family === 'kernel_integrity_broken',
      'R4-SEAL: `' + cond + '` is a verifier verdict over sealed bytes and belongs at '
      + 'kernel_integrity_broken, not at a retryable kernel write: ' + env.refusal_family);
    assert(env.auto_remediable === false,
      'R4-SEAL: `' + cond + '` must be stamped NON-remediable — auto-repairing a seal that does not '
      + 'verify launders the evidence: ' + JSON.stringify(env.auto_remediable));
    assert(checkR4({ auto_remediable: false }, env.refusal_route).length === 0,
      'R4-SEAL: `' + cond + '` must route to investigation or discard, never to a repair verb: '
      + JSON.stringify(env.refusal_route));
    assert(reachableUnderFence(env.refusal_route),
      'R4-SEAL: ...and that investigation verb must be reachable while the replan fence stands: '
      + JSON.stringify(env.refusal_route));
  }

  // The guard must be armed in both directions, or it proves nothing: a route naming a fenced verb
  // has to be rejected, and a route naming an unfenced one has to be accepted.
  assert(!reachableUnderFence({ verb: 'reconcile-running-set', script: 'adaptive-node', args: '' }),
    'MUTATION: the fence check must REJECT a route naming a replan-guarded verb');
  assert(reachableUnderFence({ verb: 'orient', script: 'adaptive-node', args: '' }),
    'MUTATION: the fence check must ACCEPT a read-only verb the fence does not guard');
  assert(reachableUnderFence({ verb: 'resume', script: 'replan', args: '' }),
    'MUTATION: the fence check must ACCEPT the fence\'s own declared legal mutation');

}

// ===========================================================================
// (8b-i) THE FENCE CHECK'S DOMAIN IS DERIVED, NOT SAMPLED.
//
// The band block above applies the right rule to TWELVE NAMED TOKENS. A sample says nothing about
// the conditions nobody remembered to add to it, and the band is not twelve tokens — it is every
// condition whose prefix says it fires from inside the re-plan engine. That set is already computed
// one screen up (`emitted`, the census the banner prints), so the rule is re-applied here over the
// DERIVED set: a `replan_*` / `snapshot_*` / `cleanup_*` condition minted tomorrow is checked the
// day it appears, without anyone coming back to extend a list.
//
// This block re-derives the fence set from adaptive-node's own source rather than reading the one
// above, so it stands on its own: whatever shape the sampled block takes after this issue lands —
// widened, folded into this one, or deleted — the property stays asserted here.
//
// EVERY COUNT BELOW IS A FLOOR, never the current value. A literal count is a vote against ever
// deleting a condition, and deleting conditions is the direction this census exists to push.
// ===========================================================================
{
  const nodeSrc = read('scripts/kaola-workflow-adaptive-node.js');
  const guardBlock = /const REPLAN_GUARDED_SUBCOMMANDS = new Set\(\[([\s\S]*?)\]\)/.exec(nodeSrc);
  assert(!!guardBlock, 'BAND-DOMAIN: the fence set must be scannable from adaptive-node');
  const guarded = new Set(guardBlock ? (guardBlock[1].match(/'([a-z-]+)'/g) || []).map(s => s.slice(1, -1)) : []);
  assert(guarded.size > 10 && guarded.has('write-halt'),
    'BAND-DOMAIN: ...and non-vacuous, containing the verb this band names — got ' + guarded.size);

  const BAND_PREFIX = /^(?:replan|snapshot|cleanup)_/;
  const derivedBand = [...emitted].filter(c => BAND_PREFIX.test(c)).sort();
  assert(derivedBand.length >= 50,
    'BAND-DOMAIN: the derived re-plan band must be non-vacuous — a scan that went blind would '
    + 'make every route below vacuously honourable. Got ' + derivedBand.length);

  // THE PIN. A condition that fires while the fence stands and names a fence-guarded verb sends the
  // operator to a command that refuses `replan_in_progress` on arrival: recorded, dispatchable, and
  // impossible to honour HERE — which is the only place it is ever offered.
  for (const cond of derivedBand) {
    const route = schema.refuse(cond, {}).refusal_route;
    // A condition with no route, or a terminal (`consent` / `environment`, which carry no script),
    // is out of this checker's domain. Whether a refusal may ship with no exit at all is a separate
    // policy question this block does not answer.
    if (!route || !route.verb || !route.script) continue;
    assert(!(route.script === 'adaptive-node' && guarded.has(route.verb)),
      'BAND-DOMAIN: `' + cond + '` fires from inside the re-plan engine, so the fence stands when it '
      + 'does — and it names a replan-guarded verb. Following the recorded route refuses '
      + '`replan_in_progress`: ' + JSON.stringify(route));
  }
}

// ===========================================================================
// (8b-ii) A ROUTE MAY NOT NAME THE VERB THAT EMITS IT.
//
// `reachableUnderFence` asks whether a route's VERB is fence-guarded. That is one way for a route
// to be undispatchable and it is not the only one — a verb can dispatch, run, and answer with the
// IDENTICAL code that named it. `resumeReplanUnlocked` opens by calling `validateReplanTransaction`
// and refusing `checked.reason` verbatim; every condition that validator can return therefore comes
// straight back out of `replan resume`, and ten of them record `replan resume` as their exit. The
// operator runs the named verb and is handed the same refusal. Always, by construction, not in a
// corner.
//
// TWO THINGS ARE DERIVED HERE AND NEITHER IS A LIST.
//
//   * the DOMAIN — every emitted condition that names a verb, taken from the same `emitted` census
//     the banner prints. Its SIZE is asserted as a floor and never as a literal: a literal count is
//     a vote against ever changing the corpus, and this census changes every wave.
//   * the EMITTER RELATION — the codes a verb answers with at its own front door, SCANNED from the
//     shared validator each verb calls before it does anything else. Add a `refuse('replan_..._invalid')`
//     inside that validator tomorrow and it is covered here the same day.
//
// The checker is a pure function so the mutation battery below can feed it a planted self-loop and
// watch it red — a checker that cannot fail is not a checker, and the acceptance for this class is
// stated in exactly those terms.
// ===========================================================================
{
  const schemaSrc = read('scripts/kaola-workflow-adaptive-schema.js');
  const replanSrc = read('scripts/kaola-workflow-replan.js');
  const nodeSrc = read('scripts/kaola-workflow-adaptive-node.js');

  // The codes the shared transaction validator returns. Scanned from ITS OWN BODY, so the set
  // tracks the validator rather than a transcription of it.
  function scanValidatorCodes(src) {
    const body = /\nfunction validateReplanTransaction\(value\) \{\n([\s\S]*?)\n\}\n/.exec(src);
    if (!body) return null;
    const out = new Set();
    const re = /\brefuse\(\s*'([a-z][a-z0-9_]{3,})'/g;
    let m;
    while ((m = re.exec(body[1])) !== null) out.add(m[1]);
    return out.size ? out : null;
  }
  const validatorCodes = scanValidatorCodes(schemaSrc);
  assert(validatorCodes !== null,
    'SELF-LOOP: `validateReplanTransaction` must stay scannable — if it was renamed or reshaped, '
    + 're-point this extractor rather than letting the emitter relation silently empty out');

  // Which verbs hand those codes back out. Each entry is a TEXTUAL anchor on the pass-through
  // itself, so a verb that stops passing the validator's verdict through drops out of the relation
  // instead of being asserted about forever.
  const passThrough = [
    { key: 'replan resume', present: replanSrc.includes('const checked = schema.validateReplanTransaction(transaction);')
        && replanSrc.includes('if (!checked.ok) return schema.refuse(checked.reason);') },
    // orient is projected through the fence, and the fence returns the validator's verdict verbatim
    // (`reason: checked.reason`) which `replanOrientation` then prints as the envelope's `reason`.
    { key: 'adaptive-node orient', present: schemaSrc.includes('if (!checked.ok) return { ok: false, fenced: true, reason: checked.reason, state };')
        && nodeSrc.includes("reason: (fence && fence.reason) || 'replan_in_progress'") },
  ];
  const emitsByRoute = new Map();
  for (const entry of passThrough) {
    if (entry.present && validatorCodes) emitsByRoute.set(entry.key, new Set(validatorCodes));
  }
  assert(emitsByRoute.size > 0,
    'SELF-LOOP: the emitter relation must be non-vacuous — with no verb mapped, every route below '
    + 'passes for the wrong reason. If a pass-through was genuinely removed, delete its entry here '
    + 'in the same change');

  // --- the checker, PURE (the battery below feeds it planted inputs) --------
  // `routes`: Map<condition, {script,verb}>. `emits`: Map<'script verb', Set<condition>>.
  function selfLoopingRoutes({ routes, emits }) {
    const found = [];
    for (const [condition, route] of routes) {
      if (!route || !route.verb) continue;
      const key = (route.script ? route.script + ' ' : '') + route.verb;
      const set = emits.get(key);
      if (set && set.has(condition)) found.push(condition + ' -> ' + key);
    }
    return found.sort();
  }

  // --- the DERIVED domain ---------------------------------------------------
  const routeCarrying = new Map();
  for (const cond of [...emitted].sort()) {
    const route = schema.refuse(cond, {}).refusal_route;
    // Terminals (`consent` / `environment`) carry no script and name no command, so there is no
    // verb to run and nothing to loop back. They are honourable by construction and out of domain.
    if (route && route.verb && route.script) routeCarrying.set(cond, route);
  }
  assert(routeCarrying.size >= 100,
    'SELF-LOOP domain: the route-carrying census must be non-vacuous — got ' + routeCarrying.size
    + ' of ' + emitted.size + ' emitted conditions. This is a FLOOR, never the current count: '
    + 'pinning the exact number would forbid the subtraction this census exists to drive');

  // THE PIN.
  const loops = selfLoopingRoutes({ routes: routeCarrying, emits: emitsByRoute });
  assert(loops.length === 0,
    'SELF-LOOP: a condition may not name the verb that answers with that same condition. Running the '
    + 'recorded exit returns the identical refusal, so the exit is not an exit: ' + loops.join(', '));

  // --- MUTATION: the checker must bite, in both directions ------------------
  // The acceptance for this class is stated as a mutation, so it is executed as one: plant a
  // self-looping route into the SAME pure checker and watch it red; remove it and watch it green.
  {
    const PLANTED = 'zzz_planted_self_loop';
    const withLoop = new Map([[PLANTED, { script: 'replan', verb: 'resume', args: '' }]]);
    const emits = new Map([['replan resume', new Set([PLANTED])]]);
    assert(selfLoopingRoutes({ routes: withLoop, emits }).length === 1,
      'MUTATION: the self-loop checker must REJECT a route naming the verb that emits it');
    assert(selfLoopingRoutes({ routes: withLoop, emits: new Map() }).length === 0,
      'MUTATION: ...and ACCEPT the same route once that verb no longer emits it — the direction '
      + 'that proves the red came from the loop and not from the token');
    const rerouted = new Map([[PLANTED, { script: 'adaptive-node', verb: 'orient', args: '' }]]);
    assert(selfLoopingRoutes({ routes: rerouted, emits }).length === 0,
      'MUTATION: ...and ACCEPT the same emitter once the route names a DIFFERENT verb — the other '
      + 'half of the subtraction, and the one a route-table fix actually performs');
    assert(selfLoopingRoutes({ routes: withLoop, emits: new Map([['replan abort', new Set([PLANTED])]]) }).length === 0,
      'MUTATION: ...and must key on the WHOLE route, never the verb alone — a same-named verb on a '
      + 'different script is a different exit');
    assert(selfLoopingRoutes({ routes: new Map([[PLANTED, null]]), emits }).length === 0,
      'MUTATION: a condition with no route is out of this checker\'s domain, not a silent pass '
      + 'through a crash');
  }

  // --- MUTATION: the emitter SCANNER must bite ------------------------------
  // A scanner that quietly returns nothing makes every route above honourable by construction.
  {
    assert(scanValidatorCodes('function somethingElse(value) {\n  return refuse(\'x_invalid\');\n}\n') === null,
      'MUTATION: the validator scanner must report ABSENCE rather than an empty set when its '
      + 'anchor is gone');
    const synthetic = '\nfunction validateReplanTransaction(value) {\n'
      + "  if (!value) return refuse('zzz_synthetic_invalid');\n"
      + "  return refuse('zzz_second_invalid', 'step');\n}\n";
    const scanned = scanValidatorCodes(synthetic);
    assert(scanned && scanned.size === 2 && scanned.has('zzz_synthetic_invalid') && scanned.has('zzz_second_invalid'),
      'MUTATION: ...and must find every code the validator returns, including the arms that carry a '
      + 'step argument: ' + JSON.stringify(scanned && [...scanned]));
  }
}

// ===========================================================================
// (8b-iii) WHERE A RUNTIME RESOLVER COMPUTES THE EXIT, THE STATIC ROUTE MAY NOT CONTRADICT IT.
//
// There are two sources of exit truth and only one of them can see the state. `readReplanFence`
// resolves `legal_mutation` from the transaction in front of it and is right BECAUSE it can: the
// orphaned arm admits only `replan abort`, the pre-activation mismatch arm admits `replan abort`,
// and past the irreversibility wall only `replan resume` is left. The registry's `refusal_route` is
// a pure function of the TOKEN — one cell, one answer — and `replan_integrity_mismatch` is one
// token with three correct exits. No static cell holds three answers, so the two disagree, and the
// static one wins today because the resolver's answer is dropped before the envelope is built.
//
// The precedence that fixes this ALREADY EXISTS and is already documented: the stamp is additive
// and idempotent, and never overwrites a field a caller already set. So the pin is not "add a
// mechanism" — it is that the resolver's answer must reach the envelope, and that the stamp must
// keep honouring a caller who supplies one.
// ===========================================================================
{
  const orphanedState = 'project: p\nreplan_status: fenced\nreplan_transaction_id: ' + 'a'.repeat(64)
    + '\nreplan_phase: prepared\n';
  const fence = schema.readReplanFence(orphanedState, null);
  assert(fence && fence.reason === 'replan_integrity_mismatch' && fence.legal_mutation === 'replan abort',
    'RESOLVER control: the orphaned-fence arm resolves its exit from state and answers `replan abort`: '
    + JSON.stringify({ reason: fence && fence.reason, legal_mutation: fence && fence.legal_mutation }));

  const env = schema.projectMutationGuard(orphanedState, null, 'adaptive-node open-next');
  assert(env && env.result === 'refuse' && env.reason === 'replan_integrity_mismatch',
    'RESOLVER control: ...and the mutation guard refuses on that arm: ' + JSON.stringify(env && env.reason));

  // THE PIN. Whatever carries the exit, it may not name a verb the resolver has just ruled out.
  const routed = env && env.refusal_route;
  const routedKey = routed && ((routed.script ? routed.script + ' ' : '') + routed.verb);
  assert(routedKey !== 'replan resume',
    'RESOLVER: the resolver computed `replan abort` for this state and the envelope carries '
    + JSON.stringify(routedKey) + '. A static cell keyed on the TOKEN cannot hold the three answers '
    + 'this token needs, so it answers with the wrong one — and `replan resume` on an orphaned fence '
    + 'refuses `replan_transaction_missing` and the wedge survives');
  assert(env && env.legal_mutation === 'replan abort',
    'RESOLVER: ...and the resolved exit must REACH the envelope. It is computed and then dropped '
    + 'today, which is why the registry default is all that is left to stamp: '
    + JSON.stringify(env && env.legal_mutation));
  assert(!routed || routedKey === 'replan abort',
    'RESOLVER: ...so any structured route the envelope does carry must be the resolved one: '
    + JSON.stringify(routed));

  // The precedence this fix stands on, pinned at the seam rather than assumed from the comment.
  {
    const callerRoute = { script: 'replan', verb: 'abort', args: '--project <P> --transaction <T> --json' };
    const stamped = schema.stampRefusalEnvelope({ result: 'refuse',
      reason: 'replan_integrity_mismatch', refusal_route: callerRoute });
    assert(stamped.refusal_route === callerRoute,
      'RESOLVER precedence: the stamp must leave a caller-set `refusal_route` untouched — a caller '
      + 'knows its concrete situation and the registry only supplies the default: '
      + JSON.stringify(stamped.refusal_route));
    const bare = schema.stampRefusalEnvelope({ result: 'refuse', reason: 'replan_integrity_mismatch' });
    assert(bare.refusal_route && bare.refusal_route.verb,
      'RESOLVER precedence: ...while an envelope that supplies none still gets a default, so this '
      + 'is a precedence rule and not a deletion of the registry');
  }
}

// ===========================================================================
// (8c) #848 — "THE ANCHOR IS NOT THERE" MUST NOT BE SAID ABOUT A VALUE THAT WAS THERE.
//
// ABSENT and PRESENT-BUT-WRONG are different events with opposite cures, and the anchor-read band
// above keeps them apart deliberately: `review_profile_identity_unavailable` (the identity block
// is NOT THERE) sits at `absent_anchor` while `review_profile_identity_ambiguous` (it is there
// TWICE) and `review_profile_hash_mismatch` (it is there and disagrees) are elsewhere. Four
// conditions were swept into `absent_anchor` that report the second event, not the first:
//
//   condition                          fires when
//   finding_anchor_index_unavailable   the object-format probe ANSWERED with an unrecognized
//                                      value; and the catch swallows the explicit
//                                      `tree entry malformed` / `blob length malformed` throws
//   candidate_partition_unavailable    the partition WAS computed, then failed the canonical
//                                      blob-map / residue-digest shape check
//   candidate_digest_unavailable       a digest WAS produced and is not 64-hex
//   baseline_partition_unavailable     the catch swallows `presentAtBase seam returned a
//                                      non-array` — a probe that answered, in the wrong shape
//
// What an operator is told today, for every one of them, is the absence clause: "The anchor this
// proof stands on is not there." That sentence sends an investigation looking for a missing
// record when the record is sitting right there in the wrong shape.
//
// THE FIX ADDS NOTHING. `kernel_integrity_broken` already carries `schema_mismatch`,
// `noncanonical_bytes` and `hash_mismatch`; all three route to the same `adaptive-node orient`
// and carry the same `auto_remediable: false`. So the ROUTE and the REMEDIABILITY are identical
// either way and are pinned here as UNCHANGED — this is a truthfulness repair, and a fix that
// moved behaviour would be a different change wearing this one's name.
// ===========================================================================
{
  const ABSENT_CLAUSE = REFUSAL_WHY && REFUSAL_WHY['kernel_integrity_broken/absent_anchor'];
  assert(typeof ABSENT_CLAUSE === 'string' && /is not there/.test(ABSENT_CLAUSE),
    '#848 fixture: the absence clause is read from REFUSAL_WHY, never restated here, so this pin '
    + 'cannot drift from the sentence production actually prints: ' + JSON.stringify(ABSENT_CLAUSE));

  const integrityHint = (patch) => {
    const row = KERNEL_REFUSAL_REGISTRY.kernel_integrity_broken;
    return (row && typeof row.hint === 'function') ? String(row.hint(patch) || '') : '';
  };
  const kindOf = (condition) => {
    const c = classifyRefusalCondition(condition);
    return (c && c.patch && typeof c.patch.kind === 'string') ? c.patch.kind : null;
  };

  // The kinds that say PRESENT AND WRONG. All three already exist; naming them as a closed set is
  // what keeps the repair from minting an eleventh kind for four conditions.
  const PRESENT_AND_WRONG_KINDS = ['schema_mismatch', 'noncanonical_bytes', 'hash_mismatch'];

  const MISLABELLED = [
    ['finding_anchor_index_unavailable', 'the probe answered with an unrecognized object format, and '
      + 'the catch swallows the explicit `tree entry malformed` / `blob length malformed` throws'],
    ['candidate_partition_unavailable', 'the partition was COMPUTED and then failed its canonical '
      + 'blob-map / residue-digest shape check'],
    ['candidate_digest_unavailable', 'a digest was PRODUCED and is not 64-hex'],
    ['baseline_partition_unavailable', 'the presence probe ANSWERED, in a shape that is not an array'],
  ];

  for (const [condition, event] of MISLABELLED) {
    // --- the half that must NOT move. Recorded first, so a fix that quietly changes the cure is
    //     caught by the same block that asks for the sentence to change.
    const env = schema.refuse(condition, {});
    assert(env.refusal_family === 'kernel_integrity_broken',
      '#848: `' + condition + '` stays in the integrity family — the deviation is still the evidence: '
      + env.refusal_family);
    assert(env.refusal_route && env.refusal_route.script === 'adaptive-node'
      && env.refusal_route.verb === 'orient',
      '#848: ...and its exit is UNCHANGED. Every present-and-wrong kind routes exactly where '
      + '`absent_anchor` does, so nothing about where the operator goes may move: '
      + JSON.stringify(env.refusal_route));
    assert(env.auto_remediable === false,
      '#848: ...and it stays NON-remediable. A record in the wrong shape is evidence just as much as '
      + 'a missing one: ' + JSON.stringify(env.auto_remediable));

    // --- the half that must move: the sentence.
    const kind = kindOf(condition);
    assert(kind !== 'absent_anchor',
      '#848: `' + condition + '` fires when ' + event + '. Telling an operator the anchor "is not '
      + 'there" sends the investigation after a missing record while the record is sitting in front '
      + 'of it in the wrong shape — absent and present-but-wrong have opposite cures, got kind='
      + JSON.stringify(kind));
    assert(PRESENT_AND_WRONG_KINDS.indexOf(kind) >= 0,
      '#848: ...and the kind it moves to must be one that ALREADY EXISTS ('
      + PRESENT_AND_WRONG_KINDS.join(' / ') + '). Minting an eleventh kind for four conditions is how '
      + 'a kind-keyed route becomes a per-incident table again, got ' + JSON.stringify(kind));
    assert(integrityHint({ kind: kind }).indexOf(ABSENT_CLAUSE) < 0,
      '#848: ...so the sentence an operator actually reads no longer claims absence: '
      + JSON.stringify(integrityHint({ kind: kind })));
  }

  // THE BOUNDARY THAT ALREADY HOLDS. These report a read that genuinely could not resolve, and
  // their absent/present separation was verified condition by condition. They are pinned so the
  // repair above cannot be over-applied — a sweep that took the whole band with it would trade one
  // false sentence for a wider one.
  const VERIFIED_ABSENT = ['review_profile_identity_unavailable', 'plan_contract_unavailable',
    'snapshot_verifier_unavailable', 'barrier_unavailable', 'writer_identity_unavailable',
    'validation_vector_read_failed'];
  for (const condition of VERIFIED_ABSENT) {
    assert(kindOf(condition) === 'absent_anchor',
      '#848: `' + condition + '` reports a read that genuinely did not resolve and STAYS at '
      + '`absent_anchor` — this repair is four conditions wide, not a band sweep: '
      + JSON.stringify(kindOf(condition)));
  }
  // Their present-but-wrong twins are the reason the separation is worth keeping, and they are
  // already elsewhere. If these ever collapsed into the same cell the distinction would be gone.
  for (const [twin, expected] of [['validation_vector_malformed', 'schema_mismatch'],
    ['validation_vector_not_canonical', 'noncanonical_bytes'],
    ['review_profile_hash_mismatch', 'hash_mismatch']]) {
    assert(kindOf(twin) === expected,
      '#848: `' + twin + '` is the present-but-wrong twin of an `_unavailable` condition and must keep '
      + 'its own cell (' + expected + '): ' + JSON.stringify(kindOf(twin)));
  }

  // NO NEW KIND. The integrity discriminator enum is closed; this repair re-uses it and does not
  // extend it. Both directions, so neither an addition nor a deletion can slip through.
  const EXPECTED_INTEGRITY_KINDS = ['absent_anchor', 'chain_break', 'cycle', 'hash_mismatch',
    'identity_mismatch', 'last_copy_in_target', 'noncanonical_bytes', 'replay_binding',
    'schema_mismatch', 'unattributed_delta'];
  assert(Object.keys(INTEGRITY_ROUTE_BY_KIND).slice().sort().join(',') === EXPECTED_INTEGRITY_KINDS.join(','),
    '#848: the integrity kind set is CLOSED — an accuracy repair that mints a kind has stopped being '
    + 'an accuracy repair: ' + JSON.stringify(Object.keys(INTEGRITY_ROUTE_BY_KIND).slice().sort()));

  // MUTATION ARM — a green pin proves nothing unless its detector has been shown to fire.
  assert(integrityHint({ kind: 'absent_anchor' }).indexOf(ABSENT_CLAUSE) >= 0,
    'MUTATION #848: the absence-clause detector must FIRE on the cell that carries the clause');
  assert(integrityHint({ kind: 'schema_mismatch' }).indexOf(ABSENT_CLAUSE) < 0,
    'MUTATION #848: ...and must NOT fire on a cell that does not');
  assert(kindOf('no_such_condition_848') === null,
    'MUTATION #848: the kind reader must report an unclassified token as null, never as a kind');
}

// ===========================================================================
// (9) THE MUTATION BATTERY — a green suite is not evidence a guard is armed. Each checker
//     is fed a deliberately broken input and must REJECT it.
// ===========================================================================
{
  // #840 class: a route naming a verb the script does not dispatch.
  assert(checkRouteShape({ verb: 'no-such-verb', script: 'adaptive-node', args: '' }, IN_GRAMMAR)
    .some(e => /DEAD VERB/.test(e)),
    'MUTATION: checkRouteShape must REJECT a route naming a verb that does not exist (the #840 class)');
  // A real verb attributed to the wrong script is equally dead.
  assert(checkRouteShape({ verb: 'unlock', script: 'replan', args: '' }, IN_GRAMMAR).length > 0,
    'MUTATION: checkRouteShape must REJECT a real verb attributed to a script that does not dispatch it');
  assert(checkRouteShape({ verb: 'orient', script: 'not-a-script', args: '' }, IN_GRAMMAR).length > 0,
    'MUTATION: checkRouteShape must REJECT an unknown script id');
  assert(checkRouteShape({ verb: 'consent', script: 'adaptive-node', args: {} }, IN_GRAMMAR).length > 0,
    'MUTATION: checkRouteShape must REJECT a terminal verb carrying a script');
  assert(checkRouteShape(null, IN_GRAMMAR).length > 0, 'MUTATION: checkRouteShape must REJECT an absent route');
  // A valid route must still pass, or the guard is vacuous in the other direction.
  assert(checkRouteShape({ verb: 'orient', script: 'adaptive-node', args: '' }, IN_GRAMMAR).length === 0,
    'MUTATION: checkRouteShape must ACCEPT a live verb (a guard that rejects everything proves nothing)');

  // R4: an integrity refusal routed at a repair verb is laundering.
  const r4Row = { auto_remediable: false };
  assert(checkR4(r4Row, { verb: 'repair-node', script: 'adaptive-node', args: '' }).length > 0,
    'MUTATION: checkR4 must REJECT an R4 refusal routed to an auto-repair verb');
  assert(checkR4(r4Row, { verb: 'revert-overflow', script: 'adaptive-node', args: '' }).length > 0,
    'MUTATION: checkR4 must REJECT an R4 refusal routed to a mutation verb');
  assert(checkR4(r4Row, { verb: 'orient', script: 'adaptive-node', args: '' }).length === 0,
    'MUTATION: checkR4 must ACCEPT an investigation verb');
  assert(checkR4({ auto_remediable: true }, { verb: 'repair-node', script: 'adaptive-node', args: '' }).length === 0,
    'MUTATION: checkR4 must not constrain an auto-remediable family');

  // Key parity, both directions.
  assert(keyParityErrors('t', ['a'], ['a', 'b']).some(e => /NO route arm/.test(e)),
    'MUTATION: keyParityErrors must REJECT a discriminator value with no route arm');
  assert(keyParityErrors('t', ['a', 'z'], ['a']).some(e => /not a declared discriminator/.test(e)),
    'MUTATION: keyParityErrors must REJECT a route arm for an undeclared value');
  assert(keyParityErrors('t', ['a'], ['a']).length === 0, 'MUTATION: keyParityErrors must ACCEPT matched key sets');

  // The ADR parser must not silently succeed on a fence that lost its rows.
  assert(parseAdrVocabulary(ADR_VOCAB_FENCE + '\nno rows here\n```\n') === null,
    'MUTATION: parseAdrVocabulary must return null on a gutted fence rather than pass vacuously');
  assert(parseAdrVocabulary('# unrelated document') === null,
    'MUTATION: parseAdrVocabulary must return null when the fenced block is absent');
  assert(parseAdrVocabulary(ADR_VOCAB_FENCE + '\nkernel_write_failed  L1  yes\n') === null,
    'MUTATION: parseAdrVocabulary must return null on an UNTERMINATED fence — an unclosed block '
    + 'would otherwise swallow the rest of the document and admit rows from unrelated prose');
  assert(parseAdrVocabulary(null) === null,
    'MUTATION: parseAdrVocabulary must be total on a non-string input');
  // A markdown TABLE must no longer parse: the fenced block is the single source, and a second
  // enumeration re-appearing as a table is the exact collision this parser was repointed to end.
  assert(parseAdrVocabulary('| `kernel_write_failed` | L1 | yes |\n') === null,
    'MUTATION: parseAdrVocabulary must IGNORE a markdown pipe table — one fence, one source');
  {
    const rows = parseAdrVocabulary(ADR_VOCAB_FENCE
      + '\nkernel_write_failed        L1  yes\nkernel_integrity_broken    L1  no\n```\n');
    assert(rows && rows.length === 2 && rows[0].auto_remediable === true
      && rows[1].auto_remediable === false && rows[1].locus === 'L1',
      'MUTATION: parseAdrVocabulary must ACCEPT a well-formed fence and read all three columns');
  }

  // Payload validation must reject an undeclared discriminator value.
  assert(!validateRefusalPayload('kernel_integrity_broken', { kind: 'not_a_kind' }).ok,
    'MUTATION: validateRefusalPayload must REJECT an undeclared discriminator value');
  assert(!validateRefusalPayload('kernel_integrity_broken', {}).ok,
    'MUTATION: validateRefusalPayload must REJECT a missing discriminator');
  assert(!validateRefusalPayload('not_a_family', {}).ok,
    'MUTATION: validateRefusalPayload must REJECT a code outside the enumerated vocabulary');
  assert(!validateRefusalPayload('sink_verdict', { findings: [{ kind: 'nope' }] }).ok,
    'MUTATION: validateRefusalPayload must REJECT an undeclared finding kind');
  assert(!validateRefusalPayload('sink_verdict', { findings: [{ kind: 'unattributed_paths', subtype: 'nope' }] }).ok,
    'MUTATION: validateRefusalPayload must REJECT an undeclared unattributed subtype');
  assert(validateRefusalPayload('kernel_integrity_broken', { kind: 'chain_break' }).ok,
    'MUTATION: validateRefusalPayload must ACCEPT a declared discriminator value');

  // The scanner must go blind loudly, not quietly.
  assert(scanInGrammarVerbs([{ script: 'adaptive-node', file: 'scripts/kaola-workflow-adaptive-schema.js', kind: 'subcommand' }]).size === 0,
    'MUTATION: the verb scanner must find NOTHING in a file with no dispatch (proving it reads the dispatch, not the whole file)');

  // The emitted-condition scan must see all seven shapes, not just `reason:`.
  const shapeProbe = scanEmittedConditions.call(null, []);
  assert(shapeProbe.size === 0, 'MUTATION: the census scan over an empty file set must be empty');

  // ---------------------------------------------------------------------
  // THE WHY-SLOT CHECKERS. These run UNCONDITIONALLY — including while the contract is
  // still absent and the blocks that use them are gated off — because a gated block proves
  // nothing about whether its guard has teeth. This is the half of the suite that would
  // have caught the dead hint layer.
  // ---------------------------------------------------------------------

  // PIN 1 — probeFamilyHint. The FIRST case is the exact failure that shipped green: seven
  // hint bodies deleted, each replaced by a call to a helper nobody wrote.
  {
    const thrower = { hint: () => { throw new ReferenceError('composeRefusalHint is not defined'); } };
    const p = probeFamilyHint(thrower, { kind: 'scheduler' });
    assert(!p.ok && p.threw && /ReferenceError/.test(p.error),
      'MUTATION: probeFamilyHint must REJECT (and NAME) a hint that throws ReferenceError — this is the dead-layer class');
  }
  assert(!probeFamilyHint({ hint: () => '' }, {}).ok,
    'MUTATION: probeFamilyHint must REJECT a hint that renders an empty string');
  assert(!probeFamilyHint({ hint: () => '   ' }, {}).ok,
    'MUTATION: probeFamilyHint must REJECT a hint that renders only whitespace');
  assert(!probeFamilyHint({ hint: () => 42 }, {}).ok,
    'MUTATION: probeFamilyHint must REJECT a hint that returns a non-string');
  assert(!probeFamilyHint({ hint: () => null }, {}).ok,
    'MUTATION: probeFamilyHint must REJECT a hint that returns null');
  assert(!probeFamilyHint({}, {}).ok,
    'MUTATION: probeFamilyHint must REJECT a registry row with no hint() function');
  assert(!probeFamilyHint(null, {}).ok,
    'MUTATION: probeFamilyHint must REJECT an absent registry row');
  {
    let n = 0;
    const impure = probeFamilyHint({ hint: () => 'a hint that changes every call #' + (n++) }, {});
    assert(!impure.ok && /pure function/.test(impure.error),
      'MUTATION: probeFamilyHint must REJECT a hint that is not a pure function of its payload');
  }
  assert(probeFamilyHint({ hint: () => 'A durable plan write did not take. Re-run the retry verb.' }, {}).ok,
    'MUTATION: probeFamilyHint must ACCEPT a live hint (a guard that rejects everything proves nothing)');

  // PIN 1B — classifyHintFailureHandling. The swallow is masked ONLY when the caller's own
  // generic fallback comes back with nothing else having happened.
  assert(classifyHintFailureHandling({ threw: false, value: 'G' }, 'G').detected === false,
    'MUTATION: classifyHintFailureHandling must report a silent downgrade to the generic fallback as MASKED');
  assert(classifyHintFailureHandling({ threw: false, value: 'G' }, 'G').mode === 'silent_generic_fallback',
    'MUTATION: the masked case must be NAMED, so the failure message points at the swallow');
  assert(classifyHintFailureHandling({ threw: true, error: 'boom' }, 'G').detected === true,
    'MUTATION: classifyHintFailureHandling must report a PROPAGATED throw as detected');
  assert(classifyHintFailureHandling({ threw: false, value: 'hint render failed: ReferenceError' }, 'G').detected === true,
    'MUTATION: a value that is NOT the caller\'s generic fallback is a detectable condition');
  assert(classifyHintFailureHandling({ threw: false, value: '' }, 'G').detected === false,
    'MUTATION: an empty return is not a detectable condition either');
  assert(classifyHintFailureHandling(null, 'G').detected === false,
    'MUTATION: classifyHintFailureHandling must REJECT an absent outcome rather than pass it');

  // The unfrozen-copy machinery is itself load-bearing: if it silently stopped mutating, the
  // mask probe and the closure mutation would both read vacuously green.
  {
    const probe = loadUnfrozenKernel();
    assert(probe.ok && probe.kernel && Array.isArray(probe.kernel.KERNEL_REFUSAL_VOCABULARY)
      && probe.kernel.KERNEL_REFUSAL_VOCABULARY.length === KERNEL_REFUSAL_VOCABULARY.length,
      'MUTATION: the unfrozen kernel copy must compile and expose the same vocabulary as the real module');
    assert(probe.ok && !Object.isFrozen(probe.kernel.KERNEL_REFUSAL_REGISTRY)
      && !Object.isFrozen(probe.kernel.KERNEL_REFUSAL_REGISTRY.consent_required),
      'MUTATION: the copy must be mutable AT BOTH LEVELS (registry and row), else no hint can be swapped');
    assert(Object.isFrozen(KERNEL_REFUSAL_REGISTRY),
      'MUTATION: the REAL registry must still be frozen — the copy is what gets mutated, never the module under test');
    if (probe.ok) {
      let swapped = false;
      try { probe.kernel.KERNEL_REFUSAL_REGISTRY.consent_required.hint = () => 'swapped'; swapped = probe.kernel.KERNEL_REFUSAL_REGISTRY.consent_required.hint({}) === 'swapped'; } catch (_) { swapped = false; }
      assert(swapped, 'MUTATION: installing a replacement hint on the copy must actually take');
      assert(KERNEL_REFUSAL_REGISTRY.consent_required.hint({ kind: 'halt_fence' }) !== 'swapped',
        'MUTATION: mutating the copy must NOT leak into the real registry the rest of the sweep reads');
    }
  }

  // PIN 2 — checkNoFabricatedFields, one deliberately broken input per banned token.
  for (const probe of [
    ['unknown', 'held by a LIVE holder (unknown subcommand)'],
    ['<unknown>', 'the holder is <unknown> right now'],
    ['undefined', 'the record is undefined at this seam'],
    ['null', 'the transition demanded null and found null'],
    ['n/a', 'held since n/a on this host'],
    [' ? ', 'pid ? on that host'],
    ['NaN', 'held for NaN ms'],
  ]) {
    assert(checkNoFabricatedFields(probe[1]).some(e => e.indexOf(probe[0]) >= 0),
      'MUTATION: checkNoFabricatedFields must REJECT the fabricated placeholder "' + probe[0] + '"');
  }
  assert(checkNoFabricatedFields('Another owner holds the project_claim resource; wait for it or resume the run that owns it.').length === 0,
    'MUTATION: checkNoFabricatedFields must ACCEPT a sentence that renders only what the payload carried');
  assert(checkNoFabricatedFields(undefined).length > 0,
    'MUTATION: checkNoFabricatedFields must REJECT a non-string rather than pass vacuously');

  // PIN 2 — checkFieldRendered, the positive half (and its own vacuity guard).
  assert(checkFieldRendered('the record is plan', 'zzz-probe-target').some(e => /DROPPED FIELD/.test(e)),
    'MUTATION: checkFieldRendered must REJECT a rendering that drops a field the payload carried');
  assert(checkFieldRendered('the target is zzz-probe-target', 'zzz-probe-target').length === 0,
    'MUTATION: checkFieldRendered must ACCEPT a rendering that carries the field');
  assert(checkFieldRendered('anything at all', '').length > 0,
    'MUTATION: checkFieldRendered must REJECT an EMPTY probe — a positive check with no expected value is vacuous');
  assert(checkFieldRendered(null, 'x').length > 0,
    'MUTATION: checkFieldRendered must REJECT a non-string rendering');

  // PIN 3 — checkHintRouteAgreement. The headline case: a hint whose exit sentence is
  // well-formed but names a DIFFERENT verb than the route the machine resolved.
  {
    const prose = 'Run: adaptive-node orient --project <P> --json';
    const route = { verb: 'reopen-node', script: 'adaptive-node', args: '--project <P> --json' };
    assert(checkHintRouteAgreement('The ledger row moved under this transition. ' + prose, route, prose)
      .some(e => /VERB CONTRADICTION/.test(e)),
      'MUTATION: checkHintRouteAgreement must REJECT a hint naming a different verb than its own route');
    assert(checkHintRouteAgreement(prose + ' — and then some trailing prose.',
      { verb: 'orient', script: 'adaptive-node', args: '--project <P> --json' }, prose)
      .some(e => /EXIT SENTENCE/.test(e)),
      'MUTATION: checkHintRouteAgreement must REJECT a hint that does not END with routeProse(route)');
    assert(checkHintRouteAgreement('The ledger row moved under this transition. ' + prose,
      { verb: 'orient', script: 'adaptive-node', args: '--project <P> --json' }, prose).length === 0,
      'MUTATION: checkHintRouteAgreement must ACCEPT a hint whose exit sentence IS its route\'s prose');
    assert(checkHintRouteAgreement('anything', { verb: 'orient', script: 'adaptive-node', args: '' }, '').length > 0,
      'MUTATION: checkHintRouteAgreement must REJECT empty prose for a LIVE route rather than skip the cell');
    assert(checkHintRouteAgreement('', { verb: 'orient', script: 'adaptive-node', args: '' }, 'x').length > 0,
      'MUTATION: checkHintRouteAgreement must REJECT an absent hint');
    assert(checkHintRouteAgreement('a hint with a deliberately silent route', null, '').length === 0,
      'MUTATION: checkHintRouteAgreement must ACCEPT a deliberate null route (the foreign_archive silence)');
  }

  // PIN 3 — checkRouteProse.
  {
    const route = { verb: 'orient', script: 'adaptive-node', args: '--project <P> --json' };
    assert(checkRouteProse('Run: adaptive-node --project <P> --json', route).some(e => /never names the verb/.test(e)),
      'MUTATION: checkRouteProse must REJECT prose that never names its route\'s verb');
    assert(checkRouteProse('Run: orient --project <P> --json', route).some(e => /never names the script id/.test(e)),
      'MUTATION: checkRouteProse must REJECT prose that never names its route\'s script id');
    assert(checkRouteProse('Run: node scripts/kaola-workflow-adaptive-node.js orient', route).some(e => /EDITION script FILENAME/.test(e)),
      'MUTATION: checkRouteProse must REJECT an edition FILENAME — this text is byte-copied into every edition');
    assert(checkRouteProse('Run: adaptive-node orient --project unknown', route).some(e => /FABRICATED/.test(e)),
      'MUTATION: checkRouteProse must REJECT a fabricated placeholder inside the generated prose');
    assert(checkRouteProse('Run: adaptive-node orient --project <P> --json', route).length === 0,
      'MUTATION: checkRouteProse must ACCEPT well-formed forge-neutral prose');
    assert(checkRouteProse('something', null).length > 0,
      'MUTATION: checkRouteProse must REJECT non-empty prose for an ABSENT route');
    assert(checkRouteProse('', null).length === 0,
      'MUTATION: checkRouteProse must ACCEPT the empty string for an absent route (total, not an exception path)');
    assert(checkRouteProse('', route).length > 0,
      'MUTATION: checkRouteProse must REJECT empty prose for a live route');
  }

  // PIN 4 — computeClosure, BOTH directions plus the wildcard carve-out.
  {
    const live = ['kernel_lock_held/scheduler', 'kernel_lock_held/replan_fence'];
    const wild = ['kernel_lock_held/*'];
    assert(computeClosure(['kernel_lock_held/scheduler'], live, wild).missing
      .indexOf('kernel_lock_held/replan_fence') >= 0,
      'MUTATION: computeClosure must REJECT a live cell with NO why clause (the `missing` direction)');
    assert(computeClosure(live.concat(['kernel_lock_held/zzz_not_a_kind']), live, wild).stale
      .indexOf('kernel_lock_held/zzz_not_a_kind') >= 0,
      'MUTATION: computeClosure must REJECT a WHY key that is not a live cell (the `stale` direction)');
    assert(computeClosure(live.concat(wild), live, wild).ok,
      'MUTATION: computeClosure must ACCEPT the legal `${code}/*` fallback key as non-stale');
    assert(computeClosure(live, live, wild).ok,
      'MUTATION: computeClosure must ACCEPT an exactly-closed map');
    assert(!computeClosure([], live, wild).ok,
      'MUTATION: computeClosure must REJECT an EMPTY map — a slot nobody filled is not closed');
    // A wildcard must NOT satisfy a live cell, or seven keys would close the whole map.
    assert(computeClosure(wild, live, wild).missing.length === live.length,
      'MUTATION: computeClosure must NOT let the `${code}/*` fallback satisfy a live cell — otherwise the '
        + 'cell-keyed slot is a slot in name only');
  }

  // PIN 4 — checkCellKey and renderWhyClause.
  assert(checkCellKey('kernel_lock_held/*', 'kernel_lock_held/scheduler').some(e => /CELL KEY/.test(e)),
    'MUTATION: checkCellKey must REJECT a key that is not the cell\'s own');
  assert(checkCellKey(null, 'kernel_lock_held/scheduler').length > 0,
    'MUTATION: checkCellKey must REJECT an absent key');
  assert(checkCellKey('kernel_lock_held/scheduler', 'kernel_lock_held/scheduler').length === 0,
    'MUTATION: checkCellKey must ACCEPT the matching key');
  assert(!renderWhyClause(undefined, {}).ok,
    'MUTATION: renderWhyClause must REJECT an absent clause');
  assert(!renderWhyClause('', {}).ok,
    'MUTATION: renderWhyClause must REJECT an empty clause');
  assert(!renderWhyClause(() => { throw new ReferenceError('composeRefusalHint is not defined'); }, {}).ok,
    'MUTATION: renderWhyClause must REJECT a clause FUNCTION that throws — the same dead-layer class one level down');
  assert(!renderWhyClause(() => 42, {}).ok,
    'MUTATION: renderWhyClause must REJECT a clause function that renders a non-string');
  assert(!renderWhyClause(17, {}).ok,
    'MUTATION: renderWhyClause must REJECT a clause that is neither a string nor a function');
  assert(renderWhyClause('because the newer state would be destroyed', {}).ok,
    'MUTATION: renderWhyClause must ACCEPT a static string clause');
  assert(renderWhyClause((p) => 'because ' + p.kind + ' is held elsewhere', { kind: 'scheduler' }).value
    === 'because scheduler is held elsewhere',
    'MUTATION: renderWhyClause must ACCEPT a clause function and render it against the payload');

  // safeCall is the total-call harness the gated blocks use; a broken harness would report
  // every production throw as a pass.
  assert(safeCall(() => { throw new Error('boom'); }).ok === false,
    'MUTATION: safeCall must REPORT a throw rather than swallow it');
  assert(safeCall(() => 'fine').value === 'fine',
    'MUTATION: safeCall must pass a clean return through unchanged');
}

// ===========================================================================
// THE COUNTDOWN BANNER — printed on every run. `retained_legacy` (M) and
// `distinct_condition_values` (K) count down batch by batch; when both hit zero, M3 is done
// and this ledger is empty.
// ===========================================================================
const banner = 'REFUSAL CENSUS — enumerated=' + KERNEL_REFUSAL_VOCABULARY.length
  + '  cells=' + CELLS.length
  + '  exempt_cells=' + (blanketExempt ? CELLS.length : exempt.cells.length)
  + '  retained_legacy=' + exempt.retained_legacy.length
  + '  distinct_condition_values=' + emitted.size;
console.log(banner);
console.log('  classified=' + classified + '  explicitly_out_of_vocabulary=' + explicitlyOut
  + '  unclassified=' + unclassified
  + '  ' + Object.keys(perFamily).sort().map(f => f + '=' + perFamily[f]).join(' '));
console.log('  P2 target: enumerated <= 12 ' + (KERNEL_REFUSAL_VOCABULARY.length <= 12 ? 'OK' : 'FAIL')
  + '   locus 100% L1/L2/A3 OK   retained_legacy -> 0   distinct_condition_values -> 0');
console.log('  WHY SLOT — live_cells=' + LIVE_CELL_KEYS.length
  + '  why_clauses=' + (isPlainObj(REFUSAL_WHY) ? Object.keys(REFUSAL_WHY).length : 0)
  + '  pending_contract=' + (PENDING_CONTRACT.length ? PENDING_CONTRACT.join(',') : 'none')
  + (PENDING_CONTRACT.length
    ? '   [the blocks keyed on these symbols cannot run; their checkers are armed by the mutation battery]'
    : ''));

if (failed) {
  console.error('\nRefusal route sweep FAILED: ' + failed + ' failure(s), ' + passed + ' passed.');
  process.exit(1);
}
console.log('Refusal route sweep passed (' + passed + ' assertions, ' + CELLS.length + ' cells walked).');
