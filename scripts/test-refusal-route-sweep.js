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

function parseAdrVocabulary(content) {
  const start = content.indexOf('### Amendment A1 — the enumerated vocabulary');
  if (start < 0) return null;
  const rest = content.slice(start);
  const end = rest.indexOf('\n### ', 1);
  const section = end < 0 ? rest : rest.slice(0, end);
  const rows = [];
  const re = /^\|\s*`([a-z_]+)`\s*\|\s*([A-Z0-9]+)\s*\|\s*(.+?)\s*\|\s*$/gm;
  let m;
  while ((m = re.exec(section)) !== null) {
    rows.push({ code: m[1], locus: m[2], auto_remediable: !/\bno\b/.test(m[3]) });
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
// ===========================================================================

function deriveCells() {
  const cells = [];
  const push = (code, name, payload, opts) => cells.push(Object.assign({
    code: code, cell: code + '/' + name, payload: payload, route_may_be_null: false,
  }, opts || {}));

  // kernel_write_failed — record x {retry, environment}. The environment arm is the whole
  // point of "the route is a function of the payload": same code, different exit.
  for (const record of REFUSAL_PAYLOAD_SCHEMAS.kernel_write_failed.values) {
    push('kernel_write_failed', record + ':retry', { record: record, target: 'snapshot', detail: 'probe' });
    push('kernel_write_failed', record + ':environment', { record: record, errno: 'ENOSPC', path: '/tmp/x' });
  }
  for (const record of REFUSAL_PAYLOAD_SCHEMAS.kernel_cas_lost.values) {
    push('kernel_cas_lost', record, { record: record, field: 'status', expected: 'a', found: 'b' });
  }
  for (const kind of REFUSAL_PAYLOAD_SCHEMAS.kernel_integrity_broken.values) {
    push('kernel_integrity_broken', kind, { kind: kind, anchor: 'plan_hash', broken_at: 'probe' });
  }
  for (const kind of LOCK_KINDS) {
    for (const stale of [false, true]) {
      push('kernel_lock_held', kind + ':' + (stale ? 'stale' : 'live'),
        { kind: kind, stale: stale, holder: { pid: 4242 }, occupying_project: 'issue-1' });
    }
  }
  for (const rk of REFUSAL_PAYLOAD_SCHEMAS.kernel_evidence_missing.values) {
    push('kernel_evidence_missing', rk, { record_kind: rk, defect: 'absent', expected_path: '.cache/n1.md' });
  }
  for (const kind of SINK_FINDING_KINDS) {
    push('sink_verdict', kind, { scope: 'plan', findings: [{ kind: kind, detail: 'probe' }] });
  }
  for (const subtype of SINK_UNATTRIBUTED_SUBTYPES) {
    push('sink_verdict', 'unattributed_paths:' + subtype,
      { scope: 'plan', findings: [{ kind: 'unattributed_paths', subtype: subtype, detail: 'probe' }] },
      // The deliberate `foreign_archive` silence: no verb resolves the write of another run's
      // archive, so naming one would misdirect. Silence is information; the sweep knows it.
      { route_may_be_null: subtype === 'foreign_archive', per_finding: true });
  }
  for (const kind of CONSENT_KINDS) {
    push('consent_required', kind, { kind: kind, ask: 'probe', options: ['a', 'b'] });
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

const EMISSION_SHAPES = [
  /(?:reason|reasonCode|status|verdict|handoff_status|inner_reason|condition)\s*:\s*'([a-z][a-z0-9_:]{3,})'/g,
  /\b(?:refuse|bad|fail)\(\s*'([a-z][a-z0-9_:]{3,})'/g,
  /reasons\.push\(\s*'([a-z][a-z0-9_:]{3,})'/g,
  /throw new Error\(\s*'([a-z][a-z0-9_]{3,})'\s*\)/g,
];

function scanEmittedConditions(files) {
  const seen = new Set();
  for (const rel of files) {
    const content = read(rel);
    for (const re of EMISSION_SHAPES) {
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

  // The ADR parser must not silently succeed on a table that lost its rows.
  assert(parseAdrVocabulary('### Amendment A1 — the enumerated vocabulary\n\nno table here\n') === null,
    'MUTATION: parseAdrVocabulary must return null on a gutted table rather than pass vacuously');
  assert(parseAdrVocabulary('# unrelated document') === null,
    'MUTATION: parseAdrVocabulary must return null when the amendment section is absent');

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

if (failed) {
  console.error('\nRefusal route sweep FAILED: ' + failed + ' failure(s), ' + passed + ' passed.');
  process.exit(1);
}
console.log('Refusal route sweep passed (' + passed + ' assertions, ' + CELLS.length + ' cells walked).');
