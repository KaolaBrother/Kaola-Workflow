#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// test-kernel-state-machine.js — P6 made mechanical (ADR 0013, § the kernel state
// machine, drawn).
//
// TEST INFRASTRUCTURE ONLY. Nothing here is shipped, installed, or imported by a
// production script. It spawns no processes: every property it checks is a pure function
// of source text plus one required module, so there is no property living at the process
// boundary to justify a child.
//
// Why
// ---
// P6 asserts the drawn machine is EXHAUSTIVE over reachable states and transitions.
// Amendment 4 added `n/a` to the unit states after a reader noticed it was reachable and
// unnamed; amendment 10 found five more omissions and one phantom by enumerating the
// code. Both were hand repairs of a property, and a property re-established by hand each
// time it is violated is not a property — it is a habit with a good track record. This
// suite converts it: the drawing is parsed and compared, in BOTH directions, against what
// the lifecycle code can actually reach.
//
// Both directions, because they fail differently and only one of them is ever noticed:
//   MISSING  a state or transition the code reaches and the drawing omits. Someone
//            eventually trips over it in production (that is how amendment 4 happened).
//   PHANTOM  a state or transition the drawing names and the code cannot reach. Nothing
//            ever fails on account of a state that never occurs, so this half is
//            invisible forever — and a machine with phantom states is exactly as
//            undeclared as one with missing states.
//
// What the code side is derived FROM (never hand-listed here — a hand-listed expectation
// is a second copy of the drawing, and two copies of a drawing agree with each other
// while both disagree with the system):
//   * unit states           `LEDGER_STATUSES` in kaola-workflow-adaptive-schema.js
//   * unit transitions      every `spliceLedgerNode(…, '<to>', { allowFrom: [<from>…] })`
//                           call site in kaola-workflow-adaptive-node.js
//   * mid-run row creation  `appendLedgerRows`, which seeds new rows `pending`
//   * the verb on a row     the CLI subcommand that reaches that call site, resolved by
//                           walking the static call graph UPWARD from the splice site to
//                           the argv dispatch
//   * run statuses          the `status:` literals kaola-workflow-claim.js can stamp
//   * verb existence        each script's own argv dispatch (the #840 dead-verb class)
//
// The fence is read by its INFO-STRING, never by locating a markdown table under a
// heading literal. That is not a style preference: ADR 0013 amendment 9 records a
// heading-keyed parser returning null the moment the heading was reworded, and a long ADR
// holds many pipe tables a table regex can wander into. An info-string is a contract.
//
// Every checker below is a pure function, and the mutation battery at the end feeds each
// one a deliberately broken input and asserts it REJECTS — including two mutations of the
// REAL ADR file on disk, because a green suite is not evidence a guard is armed.
//
// Usage
//   node scripts/test-kernel-state-machine.js
//   node scripts/test-kernel-state-machine.js --json   # the measured derivation
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const ADR_REL = 'docs/decisions/0013-successor-test-two-gate-target-architecture.md';
const NODE_REL = 'scripts/kaola-workflow-adaptive-node.js';
const CLAIM_REL = 'scripts/kaola-workflow-claim.js';
const SCHEMA_REL = 'scripts/kaola-workflow-adaptive-schema.js';

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.error('FAIL: ' + msg); } }
function read(rel) { return fs.readFileSync(path.join(REPO, rel), 'utf8'); }

const schema = require('./kaola-workflow-adaptive-schema');

// ===========================================================================
// (0) THE FENCE PARSER — pure, and keyed by the info-string.
// ===========================================================================

const FENCE = '```kernel-state-machine';

const SCOPES = Object.freeze(['unit', 'run']);
const TERMINALITY = Object.freeze(['terminal', 'live']);
const CARRIER_KINDS = Object.freeze(['ledger', 'marker', 'state', 'field', 'derived', 'none']);
// The evidence token names WHICH mechanical check backs a row. It is closed on purpose:
// a row whose evidence token nothing checks is a row that means whatever its author hoped.
const EVIDENCE_KINDS = Object.freeze([
  'ledger-splice', 'ledger-append', 'plan-freeze', 'halt-marker', 'state-stamp',
  'epoch-snapshot', 'forge',
]);
// Who moves the run. `orchestrator` and `human` are distinct from `agent` because A3 turns
// on exactly that distinction.
const ACTORS = Object.freeze(['planner', 'agent', 'orchestrator', 'human', 'script']);

// parseStateMachine(content) — PURE. Returns { states, edges, malformed } or null when the
// fence is absent, unterminated, or carries no rows. Returning null rather than an empty
// machine is deliberate: an empty machine passes every set-inclusion check vacuously.
//
// `malformed` is not a courtesy. A row that does not parse is DROPPED, and a dropped row
// shrinks the machine silently — the drawing looks complete to a reader and is a row short
// to every check below. (Measured, on this suite's own first run: the guard clause
// "only reason consent|security clears" contains a pipe, which split the row into six cells
// and deleted `halted -> open` from the machine.) Hence: the guard is the LAST field and
// keeps its pipes, and anything still unparseable is surfaced rather than skipped.
function parseStateMachine(content) {
  if (typeof content !== 'string') return null;
  const start = content.indexOf(FENCE);
  if (start < 0) return null;
  const body = content.slice(start + FENCE.length);
  const end = body.indexOf('\n```');
  if (end < 0) return null;
  const states = [];
  const edges = [];
  const malformed = [];
  for (const raw of body.slice(0, end).split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('state ')) {
      const cells = line.slice('state '.length).split('|').map(c => c.trim());
      if (cells.length !== 4) { malformed.push(line); continue; }
      const carrier = cells[2];
      const sep = carrier.indexOf(':');
      states.push({
        name: cells[0],
        scope: cells[1],
        carrier,
        carrier_kind: sep < 0 ? carrier : carrier.slice(0, sep),
        carrier_value: sep < 0 ? '' : carrier.slice(sep + 1).trim(),
        terminal: cells[3] === 'terminal',
        terminality: cells[3],
        line,
      });
      continue;
    }
    if (line.startsWith('edge ')) {
      const parts = line.slice('edge '.length).split('|');
      if (parts.length < 5) { malformed.push(line); continue; }
      // Fields 1-4 are structured; everything after the fourth pipe is the guard, pipes and
      // all. Splitting on every pipe would make a guard that reads "consent|security" a
      // parse failure, and parse failures here are invisible.
      const cells = parts.slice(0, 4).map(c => c.trim()).concat([parts.slice(4).join('|').trim()]);
      const m = /^([^\s]+)\s*->\s*([^\s]+)$/.exec(cells[0]);
      if (!m) { malformed.push(line); continue; }
      edges.push({
        from: m[1],
        to: m[2],
        actor: cells[1],
        verbs: cells[2] === '-' ? [] : cells[2].split(',').map(v => v.trim()).filter(Boolean),
        evidence: cells[3],
        guard: cells[4],
        line,
      });
      continue;
    }
    malformed.push(line);
  }
  if (!states.length || !edges.length) return null;
  return { states, edges, malformed };
}

const MACHINE = parseStateMachine(read(ADR_REL));
assert(MACHINE !== null,
  'ADR: ' + ADR_REL + ' must carry a parseable `kernel-state-machine` fenced block — the drawn '
    + 'machine is the single left-hand side of this check and there is nothing to compare against '
    + 'without it');

// A total accessor so the whole file does not die on a missing fence: each dependent block
// is gated, and the gate above is the one red.
const STATES = MACHINE ? MACHINE.states : [];
const EDGES = MACHINE ? MACHINE.edges : [];
const stateByName = new Map(STATES.map(s => [s.name, s]));

assert(!MACHINE || MACHINE.malformed.length === 0,
  'DRAWING: ' + (MACHINE ? MACHINE.malformed.length : 0) + ' row(s) inside the fence did not parse and were '
    + 'therefore DROPPED from the machine — a dropped row shrinks the drawing silently, which is worse than '
    + 'a syntax error: ' + (MACHINE ? MACHINE.malformed.slice(0, 3).join(' // ') : ''));

// ===========================================================================
// (1) THE CODE SIDE — derived, never hand-listed.
// ===========================================================================

// --- 1a0. stripNonCode(src) — blank every comment, string and regex literal, preserving
// byte count and line structure so offsets and line numbers stay usable.
//
// This is not tidiness. The call graph below is built by regex, and this repo's scripts are
// heavily commented WITH CODE: `runReopenNode(...)`, `close-and-open-next` choreography and
// worked call examples all appear inside `//` blocks. Every one of those manufactures a
// call edge that does not exist, and a handful of false edges into widely-called helpers is
// enough to turn the reverse graph inside out — measured here, before this function existed:
// `runReopenNode` acquired `checkEvidenceShape` as a "caller" from a comment, and eight
// splice sites then resolved to the read-only `orient`.
const REGEX_PREFIX_CHARS = '(,=:[!&|?{};+-*%~^<>';
const REGEX_PREFIX_KEYWORDS = Object.freeze(['return', 'typeof', 'case', 'in', 'of', 'new',
  'delete', 'void', 'instanceof', 'do', 'else', 'yield', 'await']);

// A `/` opens a regex literal iff the preceding significant token cannot end an expression.
// The preceding token is tracked INCREMENTALLY: re-deriving it by scanning the accumulated
// output made this O(n^2) and hung on a 1 MB script (measured — the suite timed out at 2
// minutes before this was fixed).
function stripNonCode(src) {
  if (typeof src !== 'string') return '';
  const out = [];
  let i = 0;
  const n = src.length;
  let lastCh = '';      // last significant code character emitted
  let lastWord = '';    // trailing identifier, for the keyword cases
  const isIdent = (ch) => /[A-Za-z0-9_$]/.test(ch);
  const asValue = () => { lastCh = ')'; lastWord = ''; };   // a literal just ended
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') { out.push(' '); i++; }
      continue;                                            // a comment changes no token state
    }
    if (c === '/' && d === '*') {
      out.push('  '); i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out.push(src[i] === '\n' ? '\n' : ' '); i++; }
      if (i < n) { out.push('  '); i += 2; }
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      out.push(' '); i++;
      while (i < n) {
        if (src[i] === '\\') { out.push('  '); i += 2; continue; }
        if (src[i] === c) { out.push(' '); i++; break; }
        out.push(src[i] === '\n' ? '\n' : ' '); i++;
      }
      asValue();
      continue;
    }
    const regexHere = c === '/' && (lastCh === ''
      || REGEX_PREFIX_CHARS.indexOf(lastCh) >= 0
      || REGEX_PREFIX_KEYWORDS.indexOf(lastWord) >= 0);
    if (regexHere) {
      out.push(' '); i++;
      let inClass = false;
      while (i < n) {
        if (src[i] === '\\') { out.push('  '); i += 2; continue; }
        if (src[i] === '\n') break;                        // unterminated — it was division
        if (src[i] === '[') inClass = true;
        else if (src[i] === ']') inClass = false;
        else if (src[i] === '/' && !inClass) { out.push(' '); i++; break; }
        out.push(' '); i++;
      }
      asValue();
      continue;
    }
    out.push(c);
    if (!/\s/.test(c)) {
      lastCh = c;
      lastWord = isIdent(c) ? lastWord + c : '';
    }
    i++;
  }
  return out.join('');
}

// --- 1a. the static skeleton of a script: top-level function ranges + a reverse call graph.
// stripNonCode preserves offsets and line breaks 1:1, so line numbers and the raw text of a
// function body stay addressable alongside the code-only view the graph is built from.
function functionIndex(rawSrc) {
  const src = stripNonCode(rawSrc);
  const lines = src.split('\n');
  const rawLines = String(rawSrc || '').split('\n');
  const fns = [];
  lines.forEach((l, i) => {
    const m = /^(?:async\s+)?function\s+([A-Za-z0-9_$]+)/.exec(l);
    if (m) fns.push({ name: m[1], start: i });
  });
  fns.forEach((f, i) => { f.end = i + 1 < fns.length ? fns[i + 1].start : lines.length; });
  const byName = new Map(fns.map(f => [f.name, f]));
  const bodyOf = (name) => {
    const f = byName.get(name);
    return f ? lines.slice(f.start, f.end).join('\n') : '';
  };
  const rawBodyOf = (name) => {
    const f = byName.get(name);
    return f ? rawLines.slice(f.start, f.end).join('\n') : '';
  };
  const enclosing = (lineIdx) => {
    for (let k = fns.length - 1; k >= 0; k--) {
      if (fns[k].start <= lineIdx && lineIdx < fns[k].end) return fns[k].name;
    }
    return null;
  };
  // callee -> callers, restricted to top-level declarations in this file.
  const callers = new Map();
  for (const f of fns) {
    const body = bodyOf(f.name);
    for (const g of fns) {
      if (g.name === f.name) continue;
      const re = new RegExp('\\b' + g.name.replace(/\$/g, '\\$') + '\\s*\\(');
      if (re.test(body)) {
        if (!callers.has(g.name)) callers.set(g.name, new Set());
        callers.get(g.name).add(f.name);
      }
    }
  }
  return { lines, fns, byName, bodyOf, rawBodyOf, enclosing, callers };
}

// --- 1b. the argv dispatch: verb -> the run* functions that verb's branch names.
// Both of the subcommand shapes that ship (`subcommand === 'x'`, `sub === 'x'`); the slice
// runs to the next dispatch literal, which is how the else-if chain is delimited.
function dispatchMap(src, byName) {
  // The dispatch LITERALS are found in the raw text (they are string literals, which the
  // code-only view blanks); the run* calls inside a branch are read from the code-only view
  // at the SAME offsets, so a worked example in a branch comment cannot invent a call.
  const code = stripNonCode(src);
  const hits = [];
  const re = /\b(?:subcommand|sub)\s*===\s*'([a-z0-9][a-z0-9-]*)'/g;
  let m;
  while ((m = re.exec(src)) !== null) hits.push({ verb: m[1], idx: m.index });
  const verbToFns = new Map();
  const fnToVerbs = new Map();
  hits.forEach((h, i) => {
    const slice = code.slice(h.idx, i + 1 < hits.length ? hits[i + 1].idx : code.length);
    const rr = /\b(run[A-Z][A-Za-z0-9_$]*)\s*\(/g;
    let x;
    while ((x = rr.exec(slice)) !== null) {
      if (!byName.has(x[1])) continue;
      if (!verbToFns.has(h.verb)) verbToFns.set(h.verb, new Set());
      verbToFns.get(h.verb).add(x[1]);
      if (!fnToVerbs.has(x[1])) fnToVerbs.set(x[1], new Set());
      fnToVerbs.get(x[1]).add(h.verb);
    }
  });
  return { verbToFns, fnToVerbs };
}

// --- 1c. attribution: which subcommands reach a given function.
// The walk is UPWARD (splice site -> its callers -> the dispatched entry points). Walking
// downward instead saturates — every helper ends up attributed to every verb — which reads
// green against any drawing at all. That failure mode was measured on the first draft of
// this scanner, which is why the mutation battery pins the difference explicitly.
//
// Reaching a dispatched function does NOT stop the walk: `runExpandOpen` is dispatched by
// `expand-open` and is also called by `runReExpandOpen`, so `reexpand-open` reaches
// everything inside it. Stopping at the first dispatched ancestor under-reports, and an
// under-reported verb is a way through the machine that nothing requires the drawing to name.
//
// `main` is a WALL. It is the entry point — nothing above it is an ancestor of anything —
// and the call graph is built by regex, so a mention of `main()` in a comment inside some
// low-level helper manufactures a back-edge out of the entry point. Walking through it turns
// the graph inside out and every helper resolves to every verb. That saturation was measured
// here (foldSelectorArms resolved to all 18 subcommands, including the read-only `orient`),
// and it fails LOUD rather than silent — an over-attributed verb is a false RED — but a
// false red is still a broken instrument, so the wall stands and the `orient` guard below
// pins it.
function attributeVerbs(fnName, fnToVerbs, callers, opts) {
  const out = new Set();
  if (!fnName) return out;
  const walls = (opts && opts.walls) || new Set(['main']);
  const maxDepth = (opts && opts.maxDepth) || 12;
  const seen = new Set([fnName]);
  let frontier = [fnName];
  for (let d = 0; d < maxDepth && frontier.length; d++) {
    const next = [];
    for (const f of frontier) {
      if (fnToVerbs.has(f)) fnToVerbs.get(f).forEach(v => out.add(v));
      if (walls.has(f)) continue;
      for (const c of (callers.get(f) || [])) {
        if (!seen.has(c)) { seen.add(c); next.push(c); }
      }
    }
    frontier = next;
  }
  return out;
}

// Subcommands that MUST never be attributed to a ledger write. `orient` and `mirror-project`
// are the declared read-only lifecycle entries (they are the two exempt from the worktree
// split guard for exactly that reason). If attribution ever claims one of them flips a row,
// attribution is broken — which is a far more useful thing to be told than a wall of
// downstream mismatches.
const READ_ONLY_SUBCOMMANDS = Object.freeze(['orient', 'mirror-project']);

// --- 1d. the ledger write sites themselves.
// `spliceLedgerNode(content, id, '<to>', { allowFrom: ['<from>', …] })` is the ONE seam
// through which a `## Node Ledger` row status changes; every mutating subcommand routes
// through it. Each call site is therefore a drawn-machine transition, stated in code.
function spliceSites(src, idx) {
  const out = [];
  src.split('\n').forEach((l, i) => {
    const m = /spliceLedgerNode\([^,]+,\s*[^,]+,\s*'([a-z/_.]+)'\s*,\s*\{\s*allowFrom:\s*\[([^\]]*)\]/.exec(l);
    if (!m) return;
    const from = m[2].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
    out.push({ line: i + 1, to: m[1], from, fn: idx.enclosing(i) });
  });
  return out;
}

// --- 1e. verb existence, per script, from that script's OWN dispatch.
const VERB_SOURCES = Object.freeze([
  { id: 'adaptive-node', file: NODE_REL, kind: 'subcommand' },
  { id: 'replan', file: 'scripts/kaola-workflow-replan.js', kind: 'subcommand' },
  { id: 'claim', file: CLAIM_REL, kind: 'subcommand' },
  { id: 'plan-validator', file: 'scripts/kaola-workflow-plan-validator.js', kind: 'flag',
    module: './kaola-workflow-plan-validator' },
  { id: 'adaptive-handoff', file: 'scripts/kaola-workflow-adaptive-handoff.js', kind: 'flag',
    module: './kaola-workflow-adaptive-handoff' },
  { id: 'sink-merge', file: 'scripts/kaola-workflow-sink-merge.js', kind: 'flag' },
]);

// The three dispatch shapes that ship. A bare '--flag' literal anywhere in a file is NOT
// admitted: those are overwhelmingly git's own flags this repo forwards (--porcelain,
// --name-only) and value-carrying options, and admitting them makes a dead-verb check
// green forever.
const FLAG_SHAPES = [
  /\b[A-Za-z_$][A-Za-z0-9_$]*\s*\.\s*(?:includes|indexOf)\(\s*'(--[a-z0-9][a-z0-9-]*)'/g,
  /\b[A-Za-z_$][A-Za-z0-9_$]*\s*(?:\[\s*\d+\s*\])?\s*===\s*'(--[a-z0-9][a-z0-9-]*)'/g,
];

function scanVerbs(src, kind) {
  const set = new Set();
  if (typeof src !== 'string') return set;
  if (kind === 'subcommand') {
    const re = /\b(?:subcommand|sub)\s*===\s*'([a-z0-9][a-z0-9-]*)'/g;
    let m;
    while ((m = re.exec(src)) !== null) set.add(m[1]);
    return set;
  }
  for (const re of FLAG_SHAPES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) set.add(m[1]);
  }
  return set;
}

const IN_GRAMMAR = new Map();
for (const src of VERB_SOURCES) {
  const verbs = scanVerbs(read(src.file), src.kind);
  if (src.module) {
    // A flag-dispatched script DECLARES its verbs; the declaration is additive to the scan
    // (the scan is what makes the declaration trustworthy, and the route sweep already
    // checks the declaration against the same dispatch in the other direction).
    try {
      const declared = require(src.module).CLI_FLAGS;
      if (Array.isArray(declared)) declared.forEach(f => verbs.add(f));
    } catch (_) { /* reported by the non-vacuity assertion below */ }
  }
  IN_GRAMMAR.set(src.id, verbs);
}

// --- 1f. the run `status:` values kaola-workflow-claim.js can stamp.
// Three writers, all literal: the claim-time default, and the two terminal stamps.
function runStatusLiterals(src) {
  const set = new Set();
  if (typeof src !== 'string') return set;
  const def = /'status: '\s*\+\s*\(\s*data\.status\s*\|\|\s*'([a-z_]+)'\s*\)/.exec(src);
  if (def) set.add(def[1]);
  for (const re of [
    /stampTerminalState\([^,]+,\s*'([a-z_]+)'/g,
    /archiveProjectDir(?:Safely)?\([^,]+,\s*[^,]+,\s*'([a-z_]+)'/g,
  ]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) set.add(m[1]);
  }
  return set;
}

// --- 1g. the declared ledger-mutating subcommand set, parsed from its own literal.
function declaredSetLiteral(src, name) {
  const re = new RegExp('const\\s+' + name + '\\s*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\)');
  const m = re.exec(src);
  if (!m) return null;
  const out = new Set();
  const rr = /'([a-z0-9][a-z0-9-]*)'/g;
  let x;
  while ((x = rr.exec(m[1])) !== null) out.add(x[1]);
  return out.size ? out : null;
}

// --- the measurement, taken once.
const NODE_SRC = read(NODE_REL);
const NODE_IDX = functionIndex(NODE_SRC);
const NODE_DISPATCH = dispatchMap(NODE_SRC, NODE_IDX.byName);
const SPLICES = spliceSites(NODE_SRC, NODE_IDX).filter(s => s.fn !== 'spliceLedgerNode');
for (const s of SPLICES) {
  s.verbs = Array.from(attributeVerbs(s.fn, NODE_DISPATCH.fnToVerbs, NODE_IDX.callers)).sort();
}
// (from-status -> to-status) => the set of subcommands that can perform it.
const CODE_PAIRS = new Map();
for (const s of SPLICES) {
  for (const f of s.from) {
    const key = f + '->' + s.to;
    if (!CODE_PAIRS.has(key)) CODE_PAIRS.set(key, new Set());
    s.verbs.forEach(v => CODE_PAIRS.get(key).add(v));
  }
}
const LEDGER_STATUSES = Array.isArray(schema.LEDGER_STATUSES) ? schema.LEDGER_STATUSES.slice() : [];
const RUN_STATUSES = runStatusLiterals(read(CLAIM_REL));
const LEDGER_MUTATING = declaredSetLiteral(NODE_SRC, 'LEDGER_MUTATING_SUBCOMMANDS');
const APPEND_FN = 'appendLedgerRows';
const APPEND_CALLERS = new Set();
stripNonCode(NODE_SRC).split('\n').forEach((l, i) => {
  if (!new RegExp('\\b' + APPEND_FN + '\\s*\\(').test(l)) return;
  const fn = NODE_IDX.enclosing(i);
  if (!fn || fn === APPEND_FN) return;
  attributeVerbs(fn, NODE_DISPATCH.fnToVerbs, NODE_IDX.callers).forEach(v => APPEND_CALLERS.add(v));
});

// ===========================================================================
// (2) NON-VACUITY. Every check below is a set comparison, and a set comparison
//     against an empty derived side passes while proving nothing. Pin the
//     derivation itself first.
// ===========================================================================

assert(LEDGER_STATUSES.length >= 4,
  'DERIVE: LEDGER_STATUSES must be readable from the schema — got ' + JSON.stringify(LEDGER_STATUSES));
assert(SPLICES.length >= 20,
  'DERIVE: the spliceLedgerNode scanner found ' + SPLICES.length + ' call sites; the shipped tree has '
    + '25. Below 20 the scanner has gone blind on a shape change and every comparison under it is vacuous');
assert(CODE_PAIRS.size >= 5,
  'DERIVE: only ' + CODE_PAIRS.size + ' distinct (from -> to) ledger pairs were derived — the allowFrom '
    + 'parse has stopped working');
{
  const unresolved = SPLICES.filter(s => !s.verbs.length);
  assert(unresolved.length === 0,
    'DERIVE: ' + unresolved.length + ' splice site(s) could not be attributed to any CLI subcommand ('
      + unresolved.map(s => s.fn + '@' + s.line).join(', ') + '). Attribution is what makes the per-row '
      + 'verb check meaningful; unattributed sites silently exempt themselves from it');
  // The saturation guard. Over-attribution is the failure mode this scanner is prone to, and
  // it does not announce itself as "the scanner is broken" — it announces itself as dozens of
  // rows suddenly being wrong. Naming the read-only subcommands makes it announce itself.
  for (const verb of READ_ONLY_SUBCOMMANDS) {
    const bogus = SPLICES.filter(s => s.verbs.indexOf(verb) >= 0);
    assert(bogus.length === 0,
      'DERIVE: attribution claims the READ-ONLY subcommand `' + verb + '` reaches ' + bogus.length
        + ' ledger write(s) (' + bogus.slice(0, 3).map(s => s.fn + '@' + s.line).join(', ')
        + '). That cannot be true, so the call-graph walk has saturated and every verb it reports is '
        + 'suspect');
  }
}
assert(RUN_STATUSES.size >= 3,
  'DERIVE: fewer than three run `status:` literals were found in ' + CLAIM_REL + ' — got '
    + JSON.stringify(Array.from(RUN_STATUSES)) + '; the claim/archive stamp scan has gone blind');
assert(LEDGER_MUTATING && LEDGER_MUTATING.size >= 8,
  'DERIVE: LEDGER_MUTATING_SUBCOMMANDS could not be parsed out of ' + NODE_REL);
assert(APPEND_CALLERS.size >= 1,
  'DERIVE: no subcommand was attributed to ' + APPEND_FN + ' — mid-run row creation cannot be checked');
for (const src of VERB_SOURCES) {
  assert((IN_GRAMMAR.get(src.id) || new Set()).size > 0,
    'DERIVE: no verbs scanned out of ' + src.file + ' — that script\'s dispatch shape changed and the '
      + 'dead-verb check went blind for it');
}
assert(STATES.length >= 10 && EDGES.length >= 15,
  'DERIVE: the fence parsed ' + STATES.length + ' states and ' + EDGES.length + ' edges; the drawn '
    + 'machine is larger than that, so the row grammar has drifted from the parser');

// ===========================================================================
// (3) THE DRAWING, CHECKED AGAINST ITSELF.
//     A machine can be internally incoherent before it is ever compared to code.
// ===========================================================================

// checkStateRows(states) — PURE. Returns a list of complaint strings.
function checkStateRows(states) {
  const errors = [];
  const seen = new Set();
  for (const s of states) {
    if (seen.has(s.name)) errors.push('DUPLICATE state "' + s.name + '"');
    seen.add(s.name);
    if (SCOPES.indexOf(s.scope) < 0) {
      errors.push('state "' + s.name + '" declares scope "' + s.scope + '", not one of ' + SCOPES.join('/'));
    }
    if (TERMINALITY.indexOf(s.terminality) < 0) {
      errors.push('state "' + s.name + '" must be marked terminal or live, got "' + s.terminality + '"');
    }
    if (CARRIER_KINDS.indexOf(s.carrier_kind) < 0) {
      errors.push('state "' + s.name + '" carrier "' + s.carrier + '" does not open with a known kind ('
        + CARRIER_KINDS.join('/') + ')');
    }
    if (!s.carrier_value) {
      errors.push('state "' + s.name + '" carrier "' + s.carrier + '" names no value — a carrier with no '
        + 'right-hand side declares nothing, and `derived`/`none` in particular must say WHY there is no '
        + 'durable witness rather than leaving it implied');
    }
  }
  return errors;
}

// checkEdgeRows(edges, stateNames) — PURE.
function checkEdgeRows(edges, stateNames) {
  const errors = [];
  for (const e of edges) {
    if (!stateNames.has(e.from)) errors.push('edge "' + e.line + '" leaves undeclared state "' + e.from + '"');
    if (!stateNames.has(e.to)) errors.push('edge "' + e.line + '" enters undeclared state "' + e.to + '"');
    if (ACTORS.indexOf(e.actor) < 0) {
      errors.push('edge "' + e.from + ' -> ' + e.to + '" names actor "' + e.actor + '", outside the closed '
        + 'set ' + ACTORS.join('/'));
    }
    if (EVIDENCE_KINDS.indexOf(e.evidence) < 0) {
      errors.push('edge "' + e.from + ' -> ' + e.to + '" claims evidence "' + e.evidence + '", which no '
        + 'check in this suite backs — an unchecked evidence token means whatever its author hoped');
    }
    if (!e.guard) errors.push('edge "' + e.from + ' -> ' + e.to + '" states no guard');
  }
  return errors;
}

// checkExhaustive(states, edges) — PURE. THIS IS P6 IN ONE FUNCTION.
//   * a `live` state with no way out is a wedge with a label (the #839 shape);
//   * a `terminal` state with a way out is a lie about terminality;
//   * a state nothing enters is unreachable — drawn, but not part of the machine.
// Initial states (carrier kind `none`: the record does not exist yet) are exempt from the
// incoming rule and only from that one.
function checkExhaustive(states, edges) {
  const errors = [];
  const out = new Map();
  const inc = new Map();
  for (const s of states) { out.set(s.name, 0); inc.set(s.name, 0); }
  for (const e of edges) {
    if (out.has(e.from)) out.set(e.from, out.get(e.from) + 1);
    if (inc.has(e.to)) inc.set(e.to, inc.get(e.to) + 1);
  }
  for (const s of states) {
    if (!s.terminal && out.get(s.name) === 0) {
      errors.push('EXIT-LESS: state "' + s.name + '" is live but has no outgoing transition — that is a '
        + 'reachable condition with no named way out, which is the exact defect P3 forbids');
    }
    if (s.terminal && out.get(s.name) > 0) {
      errors.push('FALSE-TERMINAL: state "' + s.name + '" is marked terminal yet has ' + out.get(s.name)
        + ' outgoing transition(s)');
    }
    if (s.carrier_kind !== 'none' && inc.get(s.name) === 0) {
      errors.push('UNREACHABLE: nothing enters state "' + s.name + '" — it is drawn but is not part of '
        + 'the machine');
    }
  }
  return errors;
}

if (MACHINE) {
  for (const e of checkStateRows(STATES)) assert(false, 'DRAWING: ' + e);
  for (const e of checkEdgeRows(EDGES, new Set(STATES.map(s => s.name)))) assert(false, 'DRAWING: ' + e);
  for (const e of checkExhaustive(STATES, EDGES)) assert(false, 'P6: ' + e);
  assert(checkStateRows(STATES).length === 0 && checkEdgeRows(EDGES, new Set(STATES.map(s => s.name))).length === 0
    && checkExhaustive(STATES, EDGES).length === 0,
    'P6: the drawn machine must be internally coherent (see the itemised failures above)');
}

// ===========================================================================
// (4) CARRIERS — every drawn state is anchored to something durable, or says it is not.
// ===========================================================================

const ledgerStates = STATES.filter(s => s.carrier_kind === 'ledger');
const drawnLedgerValues = new Set(ledgerStates.map(s => s.carrier_value));

if (MACHINE) {
  // Both directions. A status added to the enum with no drawn state is the amendment-4
  // defect recurring; a drawn state naming no status is a phantom.
  for (const st of LEDGER_STATUSES) {
    assert(drawnLedgerValues.has(st),
      'MISSING UNIT STATE: ledger status "' + st + '" is in the schema\'s LEDGER_STATUSES and no drawn '
        + 'state carries it. An unnamed reachable state is precisely the undeclared state this ADR '
        + 'levels at the 474 refusals');
  }
  for (const s of ledgerStates) {
    assert(LEDGER_STATUSES.indexOf(s.carrier_value) >= 0,
      'PHANTOM UNIT STATE: drawn state "' + s.name + '" claims ledger status "' + s.carrier_value
        + '", which is not in LEDGER_STATUSES (' + LEDGER_STATUSES.join(', ') + ')');
    assert(s.scope === 'unit', 'DRAWING: "' + s.name + '" carries a ledger status but is scoped '
      + s.scope + ' rather than unit');
  }
  {
    const dupes = ledgerStates.map(s => s.carrier_value).filter((v, i, a) => a.indexOf(v) !== i);
    assert(dupes.length === 0,
      'DRAWING: ledger status(es) ' + JSON.stringify(dupes) + ' are carried by more than one drawn state — '
        + 'the mapping must be one-to-one or "which state is the run in" has two answers');
  }

  // Run statuses, both directions, against the literals claim.js can actually stamp.
  const drawnRunValues = new Set(STATES.filter(s => s.carrier_kind === 'state').map(s => s.carrier_value));
  for (const v of RUN_STATUSES) {
    assert(drawnRunValues.has(v),
      'MISSING RUN STATE: ' + CLAIM_REL + ' can stamp `status: ' + v + '` and no drawn state carries it');
  }
  for (const v of drawnRunValues) {
    assert(RUN_STATUSES.has(v),
      'PHANTOM RUN STATE: a drawn state claims `status: ' + v + '`, which ' + CLAIM_REL + ' never writes');
  }

  // Marker carriers must name a token the runtime actually writes, in both the schema and
  // the writer. `halted` is the live instance: the ledger row stays in_progress, so the ONLY
  // witness of the state is the marker, and a marker nothing writes is a drawn state with no
  // observable.
  const schemaSrc = read(SCHEMA_REL);
  for (const s of STATES.filter(x => x.carrier_kind === 'marker')) {
    assert(schemaSrc.indexOf(s.carrier_value) >= 0,
      'CARRIER: drawn state "' + s.name + '" is witnessed by marker "' + s.carrier_value
        + '", which does not appear in ' + SCHEMA_REL);
    assert(NODE_SRC.indexOf("'" + s.carrier_value + ":") >= 0,
      'CARRIER: marker "' + s.carrier_value + '" is never WRITTEN by ' + NODE_REL + ' — a state whose only '
        + 'witness is a marker nothing writes is unobservable');
  }

  // Field carriers must name a declared durable state field.
  const durableFields = new Set(
    [].concat(schema.SHARED_STATE_FIELDS || [], schema.EPOCH_STATE_FIELD_ORDER || []));
  for (const s of STATES.filter(x => x.carrier_kind === 'field')) {
    assert(durableFields.has(s.carrier_value),
      'CARRIER: drawn state "' + s.name + '" is witnessed by durable field "' + s.carrier_value
        + '", which is in neither SHARED_STATE_FIELDS nor EPOCH_STATE_FIELD_ORDER');
  }
}

// ===========================================================================
// (5) TRANSITIONS — the drawing against the code, BOTH directions.
// ===========================================================================

// The ledger status a drawn state carries, or null.
function ledgerOf(name) {
  const s = stateByName.get(name);
  return s && s.carrier_kind === 'ledger' ? s.carrier_value : null;
}

const spliceEdges = EDGES.filter(e => e.evidence === 'ledger-splice');
// (from-status -> to-status) => the drawn edges that claim it.
const DRAWN_PAIRS = new Map();
for (const e of spliceEdges) {
  const f = ledgerOf(e.from), t = ledgerOf(e.to);
  if (f === null || t === null) continue;
  const key = f + '->' + t;
  if (!DRAWN_PAIRS.has(key)) DRAWN_PAIRS.set(key, []);
  DRAWN_PAIRS.get(key).push(e);
}

if (MACHINE) {
  // 5a. CODE -> DRAWING. Every ledger transition the lifecycle can perform is drawn.
  for (const [key, verbs] of CODE_PAIRS) {
    const sites = SPLICES.filter(s => s.from.indexOf(key.split('->')[0]) >= 0 && s.to === key.split('->')[1]);
    assert(DRAWN_PAIRS.has(key),
      'MISSING TRANSITION: ' + NODE_REL + ' performs the ledger transition `' + key + '` (at line'
        + (sites.length === 1 ? ' ' : 's ') + sites.map(s => s.line).join(', ') + ', via '
        + Array.from(verbs).sort().join(' / ') + ') and the drawn machine has no `ledger-splice` edge for '
        + 'it. A transition the code takes and the drawing omits is an undeclared state change');
  }

  // 5b. DRAWING -> CODE. Every drawn ledger transition is one the lifecycle can perform.
  for (const [key, drawn] of DRAWN_PAIRS) {
    assert(CODE_PAIRS.has(key),
      'PHANTOM TRANSITION: the drawn machine claims `' + drawn[0].from + ' -> ' + drawn[0].to + '` (ledger `'
        + key + '`) and no spliceLedgerNode call site in ' + NODE_REL + ' can produce it. A machine with '
        + 'phantom transitions is as undeclared as one with missing transitions, and this is the half '
        + 'nothing ever fails on, because a transition that never happens never breaks anything');
  }

  // 5c. Every state marked terminal must be terminal IN THE CODE too, and every live
  //     ledger state must actually have somewhere to go. This is the terminality flag
  //     stopping being an assertion about intent and becoming one about behaviour.
  for (const s of ledgerStates) {
    const outbound = Array.from(CODE_PAIRS.keys()).filter(k => k.split('->')[0] === s.carrier_value);
    if (s.terminal) {
      assert(outbound.length === 0,
        'FALSE-TERMINAL: drawn state "' + s.name + '" (ledger `' + s.carrier_value + '`) is marked terminal, '
          + 'but the code can move a row out of it: ' + outbound.join(', '));
    } else {
      assert(outbound.length > 0,
        'DEAD LEDGER STATE: drawn state "' + s.name + '" (ledger `' + s.carrier_value + '`) is marked live, '
          + 'but no spliceLedgerNode call site can move a row out of it — either it is terminal in fact, or '
          + 'the exit is carried by something other than the ledger and the row should say so');
    }
  }

  // 5d. Per-row verbs. A row can be present and still be wrong: a NEW subcommand that
  //     performs an already-drawn transition adds a way through the machine that the
  //     drawing does not name. The route is part of the transition, not decoration.
  for (const s of SPLICES) {
    for (const f of s.from) {
      const key = f + '->' + s.to;
      const drawn = DRAWN_PAIRS.get(key) || [];
      if (!drawn.length) continue;   // already reported by 5a
      const named = new Set();
      for (const e of drawn) {
        for (const v of e.verbs) {
          if (v.slice(0, 'adaptive-node:'.length) === 'adaptive-node:') named.add(v.slice('adaptive-node:'.length));
        }
      }
      for (const verb of s.verbs) {
        assert(named.has(verb),
          'UNNAMED VERB: subcommand `' + verb + '` performs the ledger transition `' + key + '` (splice at '
            + NODE_REL + ':' + s.line + ', in ' + s.fn + ') and no drawn edge for that transition names it');
      }
    }
  }

  // 5e. The reverse of 5d: a drawn verb that performs no such transition.
  for (const e of spliceEdges) {
    const f = ledgerOf(e.from), t = ledgerOf(e.to);
    if (f === null || t === null) continue;
    const actual = CODE_PAIRS.get(f + '->' + t) || new Set();
    for (const v of e.verbs) {
      if (v.slice(0, 'adaptive-node:'.length) !== 'adaptive-node:') continue;
      const verb = v.slice('adaptive-node:'.length);
      assert(actual.has(verb),
        'PHANTOM VERB: the drawn edge `' + e.from + ' -> ' + e.to + '` names `' + v + '`, but no splice site '
          + 'reachable from that subcommand performs `' + f + ' -> ' + t + '`');
    }
  }

  // 5f. Mid-run row creation. Units enter the machine after freeze as well as at it, and
  //     the drawing has to say so or it quietly asserts a fixed unit set.
  const appendEdges = EDGES.filter(e => e.evidence === 'ledger-append');
  assert(appendEdges.length > 0,
    'MISSING TRANSITION: ' + NODE_REL + ' creates ledger rows mid-run through ' + APPEND_FN + ' (reached by '
      + Array.from(APPEND_CALLERS).sort().join(' / ') + ') and the drawn machine has no `ledger-append` edge');
  for (const e of appendEdges) {
    assert(ledgerOf(e.to) === 'pending',
      'DRAWING: a `ledger-append` edge must land on the state carrying ledger `pending` — ' + APPEND_FN
        + ' seeds every appended row `pending` — but "' + e.line + '" lands on "' + e.to + '"');
    const drawnVerbs = new Set(e.verbs.filter(v => v.indexOf('adaptive-node:') === 0)
      .map(v => v.slice('adaptive-node:'.length)));
    for (const v of APPEND_CALLERS) {
      assert(drawnVerbs.has(v),
        'UNNAMED VERB: subcommand `' + v + '` reaches ' + APPEND_FN + ' and the ledger-append edge does not '
          + 'name it');
    }
    for (const v of drawnVerbs) {
      assert(APPEND_CALLERS.has(v),
        'PHANTOM VERB: the ledger-append edge names `adaptive-node:' + v + '`, which never reaches ' + APPEND_FN);
    }
  }
  assert(NODE_IDX.rawBodyOf(APPEND_FN).indexOf("'pending'") >= 0,
    'DERIVE: ' + APPEND_FN + ' no longer seeds appended rows `pending`; the ledger-append edge\'s target '
      + 'state is asserted against that fact and would now be checking nothing');
}

// ===========================================================================
// (6) VERBS EXIST. The #840 class: a route naming a verb that does not exist.
// ===========================================================================

const drawnVerbTokens = new Set();
for (const e of EDGES) e.verbs.forEach(v => drawnVerbTokens.add(v));

if (MACHINE) {
  for (const token of drawnVerbTokens) {
    const at = token.indexOf(':');
    assert(at > 0, 'VERB: "' + token + '" is not in `<script>:<verb>` form');
    if (at <= 0) continue;
    const script = token.slice(0, at);
    const verb = token.slice(at + 1);
    assert(IN_GRAMMAR.has(script),
      'VERB: "' + token + '" names script "' + script + '", which this suite does not scan — a verb in an '
        + 'unscanned script is an unchecked promise');
    if (!IN_GRAMMAR.has(script)) continue;
    assert(IN_GRAMMAR.get(script).has(verb),
      'DEAD VERB: the drawn machine routes through `' + token + '`, and that script\'s own argv dispatch '
        + 'never branches on it. An operator who types it does not reach the transition the row promises — '
        + 'this is the #840 class the route contract exists to make a build failure');
  }

  // Every subcommand the runtime DECLARES as ledger-mutating must appear on some row. This
  // catches the case 5d cannot: a verb that flips a row through a path this scanner cannot
  // see still has to be drawn.
  if (LEDGER_MUTATING) {
    for (const verb of LEDGER_MUTATING) {
      assert(drawnVerbTokens.has('adaptive-node:' + verb),
        'UNDRAWN VERB: `' + verb + '` is in ' + NODE_REL + '\'s own LEDGER_MUTATING_SUBCOMMANDS and appears '
          + 'on no drawn edge — the runtime declares it changes ledger state and the machine does not say '
          + 'which change');
    }
  }
}

// ===========================================================================
// (7) THE MUTATION BATTERY.
//     Two halves. The first feeds each pure checker a broken input in memory. The
//     second mutates the REAL ADR ON DISK and re-runs the whole suite as a child
//     process, because a checker that is correct in isolation is worth nothing if
//     the wiring between it and the shipped file is wrong — which is exactly how the
//     seven hint bodies that threw ReferenceError kept 541 assertions green.
// ===========================================================================

function mutationBattery() {
  // --- the parser ---
  assert(parseStateMachine('# nothing here') === null,
    'MUTATION: parseStateMachine must return null when the fence is absent');
  assert(parseStateMachine(FENCE + '\nstate a | unit | ledger:x | live\n') === null,
    'MUTATION: parseStateMachine must return null on an unterminated fence rather than half-parse it');
  assert(parseStateMachine(FENCE + '\n# only comments\n```\n') === null,
    'MUTATION: parseStateMachine must return null on a gutted fence rather than pass vacuously');
  assert(parseStateMachine(FENCE + '\nstate a | unit | ledger:x | live\n```\n') === null,
    'MUTATION: a fence with states but no edges is not a machine and must not parse');
  {
    // A markdown table must NOT parse — this is amendment 9's collision, in the state
    // machine's own terms: two left-hand sides that git will merge cleanly.
    const table = '| Transition | Actor | Guard |\n|---|---|---|\n| open(unit) | agent | readiness |\n';
    assert(parseStateMachine(table) === null,
      'MUTATION: a markdown transition table must not parse as the machine — one fence, one source');
  }
  {
    const ok = parseStateMachine(FENCE + '\nstate a | unit | ledger:pending | live\n'
      + 'edge a -> a | agent | adaptive-node:open-next | ledger-splice | g\n```\n');
    assert(ok && ok.states.length === 1 && ok.edges.length === 1 && ok.edges[0].verbs.length === 1,
      'MUTATION: parseStateMachine must parse a minimal well-formed machine (else every rejection above '
        + 'is trivially satisfied by a parser that rejects everything)');
  }

  // --- checkStateRows ---
  assert(checkStateRows([{ name: 'a', scope: 'galaxy', carrier: 'ledger:pending', carrier_kind: 'ledger', carrier_value: 'pending', terminality: 'live' }]).length > 0,
    'MUTATION: checkStateRows must reject an out-of-vocabulary scope');
  assert(checkStateRows([{ name: 'a', scope: 'unit', carrier: 'derived:', carrier_kind: 'derived', carrier_value: '', terminality: 'live' }]).length > 0,
    'MUTATION: checkStateRows must reject a carrier with no right-hand side');
  assert(checkStateRows([{ name: 'a', scope: 'unit', carrier: 'vibes:x', carrier_kind: 'vibes', carrier_value: 'x', terminality: 'live' }]).length > 0,
    'MUTATION: checkStateRows must reject an unknown carrier kind');
  assert(checkStateRows([
    { name: 'a', scope: 'unit', carrier: 'ledger:pending', carrier_kind: 'ledger', carrier_value: 'pending', terminality: 'live' },
    { name: 'a', scope: 'unit', carrier: 'ledger:pending', carrier_kind: 'ledger', carrier_value: 'pending', terminality: 'live' },
  ]).length > 0, 'MUTATION: checkStateRows must reject a duplicated state name');
  assert(checkStateRows([{ name: 'a', scope: 'unit', carrier: 'ledger:pending', carrier_kind: 'ledger', carrier_value: 'pending', terminality: 'live' }]).length === 0,
    'MUTATION: checkStateRows must ACCEPT a well-formed row');

  // --- checkEdgeRows ---
  const names = new Set(['a', 'b']);
  assert(checkEdgeRows([{ from: 'a', to: 'ghost', actor: 'agent', verbs: [], evidence: 'forge', guard: 'g' }], names).length > 0,
    'MUTATION: checkEdgeRows must reject an edge into an undeclared state');
  assert(checkEdgeRows([{ from: 'a', to: 'b', actor: 'wizard', verbs: [], evidence: 'forge', guard: 'g' }], names).length > 0,
    'MUTATION: checkEdgeRows must reject an out-of-vocabulary actor');
  assert(checkEdgeRows([{ from: 'a', to: 'b', actor: 'agent', verbs: [], evidence: 'vibes', guard: 'g' }], names).length > 0,
    'MUTATION: checkEdgeRows must reject an evidence token no check backs');
  assert(checkEdgeRows([{ from: 'a', to: 'b', actor: 'agent', verbs: [], evidence: 'forge', guard: '' }], names).length > 0,
    'MUTATION: checkEdgeRows must reject an edge with no stated guard');
  assert(checkEdgeRows([{ from: 'a', to: 'b', actor: 'agent', verbs: [], evidence: 'forge', guard: 'g' }], names).length === 0,
    'MUTATION: checkEdgeRows must ACCEPT a well-formed edge');

  // --- checkExhaustive: the three P6 failures, each planted on its own ---
  const live = (n) => ({ name: n, terminal: false, carrier_kind: 'ledger' });
  const term = (n) => ({ name: n, terminal: true, carrier_kind: 'ledger' });
  const init = (n) => ({ name: n, terminal: false, carrier_kind: 'none' });
  const edge = (f, t) => ({ from: f, to: t });
  assert(checkExhaustive([init('s'), live('x')], [edge('s', 'x')]).some(e => e.indexOf('EXIT-LESS') === 0),
    'MUTATION: checkExhaustive must flag a live state with no way out (the wedge shape)');
  assert(checkExhaustive([init('s'), term('x'), live('y')], [edge('s', 'x'), edge('x', 'y'), edge('y', 'x')])
    .some(e => e.indexOf('FALSE-TERMINAL') === 0),
    'MUTATION: checkExhaustive must flag a terminal state with an outgoing transition');
  assert(checkExhaustive([init('s'), live('x'), term('orphan')], [edge('s', 'x'), edge('x', 's')])
    .some(e => e.indexOf('UNREACHABLE') === 0),
    'MUTATION: checkExhaustive must flag a state nothing enters');
  assert(checkExhaustive([init('s'), term('x')], [edge('s', 'x')]).length === 0,
    'MUTATION: checkExhaustive must ACCEPT a coherent two-state machine');

  // --- the derivation functions ---
  assert(spliceSites('function f(){ }\n', functionIndex('function f(){ }\n')).length === 0,
    'MUTATION: spliceSites must find nothing in a source with no ledger writes');
  {
    const src = 'function runFoo(o) {\n'
      + "  const r = spliceLedgerNode(c, id, 'complete', { allowFrom: ['in_progress'] });\n"
      + '}\n';
    const idx = functionIndex(src);
    const sites = spliceSites(src, idx);
    assert(sites.length === 1 && sites[0].to === 'complete' && sites[0].from.join(',') === 'in_progress'
      && sites[0].fn === 'runFoo',
      'MUTATION: spliceSites must read to-status, allowFrom and the enclosing function from a real call shape');
  }
  assert(scanVerbs("const x = ['--porcelain', '--name-only'];", 'flag').size === 0,
    'MUTATION: the flag scan must NOT admit flags that merely appear as literals in a forwarded array — '
      + 'admitting git\'s own flags is what makes a dead-verb check green forever');
  assert(scanVerbs("if (rawArgv.includes('--sink')) { }", 'flag').has('--sink'),
    'MUTATION: the flag scan must admit a flag the script really branches on');
  assert(scanVerbs("if (subcommand === 'open-next') { }", 'subcommand').has('open-next'),
    'MUTATION: the subcommand scan must admit a real dispatch literal');
  assert(runStatusLiterals("stampTerminalState(c, 'closed', d);").has('closed'),
    'MUTATION: runStatusLiterals must read a terminal stamp literal');
  assert(runStatusLiterals('nothing here').size === 0,
    'MUTATION: runStatusLiterals must find nothing in an unrelated source');
  {
    // Attribution must NOT saturate. This is the first draft's measured failure mode: a
    // downward walk attributed every helper to every verb, which reads green against any
    // drawing at all.
    // main() LAST, mirroring the shipped layout: a dispatch branch's slice runs to the next
    // dispatch literal, so a trailing `else if` slice that ran over further declarations
    // would attribute them to the last verb.
    const src = 'function runAlpha(){ helperA(); }\n'
      + 'function runBeta(){ helperB(); }\n'
      + 'function helperA(){ shared(); }\n'
      + 'function helperB(){ shared(); }\n'
      + 'function shared(){ }\n'
      + "function main(){ if (subcommand === 'alpha') { runAlpha(); } else if (subcommand === 'beta') { runBeta(); } }\n";
    const idx = functionIndex(src);
    const d = dispatchMap(src, idx.byName);
    const a = attributeVerbs('helperA', d.fnToVerbs, idx.callers);
    assert(a.has('alpha') && !a.has('beta'),
      'MUTATION: attribution must resolve a helper to its OWN callers only — got ' + JSON.stringify(Array.from(a)));
    const both = attributeVerbs('shared', d.fnToVerbs, idx.callers);
    assert(both.has('alpha') && both.has('beta'),
      'MUTATION: a genuinely shared helper must resolve to every verb that reaches it');
  }
  assert(declaredSetLiteral('const S = new Set([]);', 'S') === null,
    'MUTATION: declaredSetLiteral must return null on an empty set rather than an empty answer');
  assert(declaredSetLiteral("const S = new Set(['a', 'b']);", 'S').size === 2,
    'MUTATION: declaredSetLiteral must read a real literal set');
  assert(declaredSetLiteral("const S = new Set(['a']);", 'MISSING') === null,
    'MUTATION: declaredSetLiteral must return null when the named set is absent');
}

// --- the on-disk half: mutate the SHIPPED ADR and re-run this suite for real. ---
// A fixture would prove the checkers work on a fixture. The property under test is that
// they are wired to the file the decision actually lives in.
// The mutated file is a DECISION RECORD, not a fixture, so the restore has to survive more
// than the happy path. A `.mutation-backup` sidecar is written before the first mutation and
// removed only on a clean finish; signal handlers restore from it; and a stale sidecar found
// at startup is restored and reported. (Measured, on this suite's own development: a 2-minute
// harness timeout SIGTERMed the process mid-mutation and left a row deleted from the shipped
// ADR. `finally` does not run for a signal.)
const BACKUP_REL = ADR_REL + '.mutation-backup';

function restoreFromBackup(reason) {
  const backup = path.join(REPO, BACKUP_REL);
  if (!fs.existsSync(backup)) return false;
  try {
    fs.writeFileSync(path.join(REPO, ADR_REL), fs.readFileSync(backup, 'utf8'));
    fs.unlinkSync(backup);
    if (reason) console.error('NOTE: restored ' + ADR_REL + ' from its mutation backup (' + reason + ')');
    return true;
  } catch (err) {
    console.error('CRITICAL: ' + ADR_REL + ' was left MUTATED and the restore failed: ' + err.message
      + ' — recover it from ' + BACKUP_REL + ' or from git before trusting anything downstream.');
    return false;
  }
}

function realFileMutations() {
  const { execFileSync } = require('child_process');
  const adrPath = path.join(REPO, ADR_REL);
  const backupPath = path.join(REPO, BACKUP_REL);

  // A sidecar left by a previous killed run means the file on disk is not the decision.
  if (restoreFromBackup('a previous run was interrupted mid-mutation')) {
    assert(false, 'MUTATION(real): ' + ADR_REL + ' was found mutated from an interrupted previous run and '
      + 'has been restored. Re-run; the measurement in between was taken against a corrupted decision');
  }

  const original = fs.readFileSync(adrPath, 'utf8');
  fs.writeFileSync(backupPath, original);
  const onSignal = () => { restoreFromBackup('interrupted'); process.exit(130); };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  process.on('SIGHUP', onSignal);
  const onExit = () => { restoreFromBackup('process exited mid-proof'); };
  process.on('exit', onExit);

  // The property under test lives AT the process boundary: that a FRESH process, with no
  // parsed-fence constant and no shared assertion counters, reaches a RED verdict from the
  // bytes now on disk. An in-process re-invocation would reuse this run's already-parsed
  // MACHINE and this run's `passed`/`failed`, which is the false green being ruled out.
  const runSelf = () => {
    try {
      // spawn-class: cli-contract
      const out = execFileSync(process.execPath, [path.join(REPO, 'scripts', 'test-kernel-state-machine.js')],
        { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return { code: 0, out };
    } catch (err) {
      return { code: err.status == null ? -1 : err.status, out: String(err.stdout || '') + String(err.stderr || '') };
    }
  };

  try {
    // (a) DELETE a drawn row the code reaches -> the suite must go red AND name it.
    const victim = 'edge done -> pending |';
    const vIdx = original.indexOf(victim);
    assert(vIdx >= 0, 'MUTATION(real): the row this proof deletes must exist in ' + ADR_REL);
    if (vIdx >= 0) {
      const lineEnd = original.indexOf('\n', vIdx);
      const mutated = original.slice(0, vIdx) + original.slice(lineEnd + 1);
      fs.writeFileSync(adrPath, mutated);
      const r = runSelf();
      assert(r.code !== 0,
        'MUTATION(real): deleting the `done -> pending` row must turn this suite RED — it did not, so the '
          + 'code->drawing direction is not wired to the shipped file');
      assert(/MISSING TRANSITION: .*complete->pending/.test(r.out),
        'MUTATION(real): the failure for a deleted row must NAME the missing transition, not merely count '
          + 'a mismatch. Got: ' + r.out.split('\n').filter(l => l.indexOf('FAIL') === 0).slice(0, 3).join(' | '));
    }

    // (b) ADD a row for a transition the code cannot reach -> the suite must go red AND
    //     name it as a phantom. A machine with phantom states is as undeclared as one
    //     with missing states, and this is the half nothing ever trips over in production.
    {
      const anchor = 'edge done -> pending |';
      const aIdx = original.indexOf(anchor);
      const phantom = 'edge n/a -> open | agent | adaptive-node:open-next | ledger-splice | a transition no '
        + 'splice site can perform\n';
      const mutated = original.slice(0, aIdx) + phantom + original.slice(aIdx);
      fs.writeFileSync(adrPath, mutated);
      const r = runSelf();
      assert(r.code !== 0,
        'MUTATION(real): drawing a transition the code cannot reach must turn this suite RED');
      assert(/PHANTOM TRANSITION: .*n\/a -> open/.test(r.out) || /FALSE-TERMINAL: .*"n\/a"/.test(r.out),
        'MUTATION(real): the failure for an unreachable row must NAME it as a phantom (or as the false '
          + 'terminality it also implies). Got: '
          + r.out.split('\n').filter(l => l.indexOf('FAIL') === 0).slice(0, 3).join(' | '));
    }

    // (c) A verb that does not exist -> the #840 class.
    {
      const mutated = original.replace('adaptive-node:open-next,', 'adaptive-node:open-nextt,');
      assert(mutated !== original, 'MUTATION(real): the verb this proof corrupts must exist in ' + ADR_REL);
      fs.writeFileSync(adrPath, mutated);
      const r = runSelf();
      assert(r.code !== 0 && /DEAD VERB: .*open-nextt/.test(r.out),
        'MUTATION(real): a drawn verb that no script dispatches must turn this suite RED and name the verb. '
          + 'Got: ' + r.out.split('\n').filter(l => l.indexOf('FAIL') === 0).slice(0, 3).join(' | '));
    }
  } finally {
    fs.writeFileSync(adrPath, original);
    try { fs.unlinkSync(backupPath); } catch (_) {}
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    process.removeListener('SIGHUP', onSignal);
    process.removeListener('exit', onExit);
  }

  // The restore must be exact, and it must be checked — a proof that leaves the decision
  // mutated is worse than no proof.
  assert(fs.readFileSync(adrPath, 'utf8') === original,
    'MUTATION(real): the ADR must be restored byte-identically after the mutation proofs');
  assert(!fs.existsSync(backupPath),
    'MUTATION(real): the mutation backup sidecar must be removed on a clean finish — a leftover '
      + BACKUP_REL + ' would make the next run report a phantom interruption');
  const r = runSelf();
  assert(r.code === 0,
    'MUTATION(real): the suite must be GREEN again against the restored ADR — otherwise the mutations '
      + 'above proved nothing about the shipped file');
}

// ===========================================================================

function main() {
  mutationBattery();
  // The on-disk proofs re-enter this file as a child process; running them from the child
  // too would recurse without bound. The child is told to skip them, and the parent asserts
  // it actually ran them.
  if (process.env.KAOLA_STATE_MACHINE_CHILD !== '1') {
    process.env.KAOLA_STATE_MACHINE_CHILD = '1';
    realFileMutations();
    delete process.env.KAOLA_STATE_MACHINE_CHILD;
  }

  if (process.argv.indexOf('--json') >= 0) {
    process.stdout.write(JSON.stringify({
      states: STATES.length,
      edges: EDGES.length,
      splice_sites: SPLICES.length,
      code_pairs: Array.from(CODE_PAIRS.keys()).sort(),
      drawn_pairs: Array.from(DRAWN_PAIRS.keys()).sort(),
      ledger_statuses: LEDGER_STATUSES,
      run_statuses: Array.from(RUN_STATUSES).sort(),
      verbs: Array.from(drawnVerbTokens).sort(),
    }, null, 2) + '\n');
  }

  console.log('KERNEL STATE MACHINE — states=' + STATES.length + '  edges=' + EDGES.length
    + '  splice_sites=' + SPLICES.length
    + '  code_pairs=' + CODE_PAIRS.size + '  drawn_ledger_pairs=' + DRAWN_PAIRS.size
    + '  ledger_statuses=' + LEDGER_STATUSES.length + '  run_statuses=' + RUN_STATUSES.size
    + '  verbs=' + drawnVerbTokens.size);

  if (failed) {
    console.error('\nKernel state-machine check FAILED: ' + failed + ' failure(s), ' + passed + ' passed.');
    process.exit(1);
  }
  console.log('Kernel state-machine check passed (' + passed + ' assertions).');
}

if (require.main === module) main();

module.exports = {
  parseStateMachine, checkStateRows, checkEdgeRows, checkExhaustive,
  functionIndex, dispatchMap, attributeVerbs, spliceSites, scanVerbs,
  runStatusLiterals, declaredSetLiteral,
};
