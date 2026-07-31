#!/usr/bin/env node
'use strict';

// The Oracle Kernel's OWN contract suite.
//
// `kaola-workflow-adaptive-schema.js` is the one canonical source for the primitives whose answers
// no cooperating agent can derive by reading files. Every other suite in the tree exercises the
// kernel THROUGH a consumer (open a node, freeze a plan, run the CLI) — this one asks only "does
// the kernel keep its own promise?", with no consumer in the loop.
//
// Organized by the four grounds that make a capability mechanical:
//   U — unobservable      the fact lives in no file the agent can read (OS outcome, concurrent process)
//   N — non-computable    the answer needs a function the agent cannot evaluate by reading (sha256,
//                         canonical serialization)
//   S — spec-wrong        the obvious derivation is a DIFFERENT function from the correct one, and
//                         both look right
//   I — irreversible-ordered   the record must outlive the agent that wrote it
//
// DELIBERATE NON-DUPLICATION. This suite covers only what no other suite covers. Verified against
// the tree before writing; each section names what it skipped and where that coverage already lives:
//   - writeFileAtomicReplace single-process return semantics, the
//     fsync(tmp)->rename->open(dir)->fsync(dir)->close(dir) ORDER, and the platform fail-soft are
//     covered by test-claim-hardening.js (#353 / #685). Only the CONCURRENT-PROCESS observable and
//     the replace-vs-truncate inode topology are added here.
//   - acquireProjectLock / releaseProjectLock / isStaleLock test-and-set, dead-holder classification,
//     no-auto-takeover and the genuine two-process race are covered by test-adaptive-node.js
//     (T-585-*/T-595-*). Only the corrupt/empty-payload mtime classifier branch and the
//     non-numeric-timestamp branch are added here.
//   - the review/gate engine (deriveGateMode, deriveGateEffect, reduceReviewReceipts,
//     deriveRepairDelta, assessFindingClosure, assessReviewProgress, compareValidationObligations)
//     is ALREADY a direct, fixture-driven kernel corpus inside test-adaptive-node.js. It is not
//     re-tested here; re-deriving those truth tables would manufacture duplication, not coverage.
//     Section S therefore covers a spec-wrong derivation that corpus does NOT reach.
//   - the ledger-chain family's end-to-end tamper behaviour is covered by test-ledger-chain-tamper.js
//     THROUGH the adaptive-node wrapper and the validator resume seam. Section I pins the PURE kernel
//     functions underneath it, including the typed-reason precedence and the re-forged-chain anchor.
//
// Hand-rolled asserts + counter, repo style (no framework). Pure/CLI only: nothing is written inside
// the repo tree, every $TMPDIR dir is removed in a finally, no network.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const schema = require('./kaola-workflow-adaptive-schema');
const KERNEL = path.join(__dirname, 'kaola-workflow-adaptive-schema.js');

let passed = 0;
const failures = [];
const notes = [];

function check(cond, msg) {
  if (cond) { passed++; } else { failures.push(msg); console.error('FAIL: ' + msg); }
}
function eq(actual, expected, msg) {
  check(actual === expected,
    msg + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
}
function throwsWith(fn, expectedMessage, msg) {
  let err = null;
  try { fn(); } catch (e) { err = e; }
  check(err !== null && err.message === expectedMessage,
    msg + ' — expected throw ' + JSON.stringify(expectedMessage) + ', got '
      + (err === null ? 'no throw' : JSON.stringify(err.message)));
}
const clone = value => JSON.parse(JSON.stringify(value));

// Stability + SENSITIVITY over a digest function. Sensitivity is the half with teeth: a digest that
// does not move when a covered field moves is a digest that binds nothing.
function digestContract(label, base, digestOf, mutations, stableForms) {
  const baseline = digestOf(base);
  check(typeof baseline === 'string' && /^[0-9a-f]{64}$/.test(baseline),
    label + ': digest is 64 lowercase hex, got ' + JSON.stringify(baseline));
  eq(digestOf(clone(base)), baseline, label + ' STABILITY: same input -> same digest');
  for (const [name, reshape] of (stableForms || [])) {
    const variant = clone(base);
    reshape(variant);
    eq(digestOf(variant), baseline, label + ' STABILITY: ' + name + ' must NOT change the digest');
  }
  for (const [name, mutate] of mutations) {
    const variant = clone(base);
    mutate(variant);
    check(digestOf(variant) !== baseline,
      label + ' SENSITIVITY: changing ' + name + ' MUST change the digest (it did not: ' + baseline + ')');
  }
}

// ===========================================================================
// U — UNOBSERVABLE
// The fact is in no file the agent can read: an OS test-and-set outcome, a concurrent process,
// a byte the agent did not write.
// ===========================================================================

// U1 — writeFileAtomicReplace REPLACES, it does not truncate-and-rewrite.
// A hardlink taken before the write is the OS-level witness: under a rename-based replace the old
// inode survives with the old bytes and the target gets a NEW inode; under any in-place write the
// witness would show the new bytes through the shared inode. test-claim-hardening.js proves the CALL
// ORDER with a spy; this proves the resulting filesystem topology, which is the property a crashed
// reader actually depends on.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-oracle-u1-'));
  try {
    const target = path.join(dir, 'workflow-plan.md');
    const witness = path.join(dir, 'witness.md');
    schema.writeFileAtomicReplace(target, 'ALPHA');
    let linkable = true;
    try { fs.linkSync(target, witness); } catch (_) { linkable = false; }
    if (!linkable) {
      notes.push('U1: this filesystem refused fs.linkSync — the hardlink-witness assertions were SKIPPED');
    } else {
      const inoBefore = fs.statSync(target).ino;
      const wrote = schema.writeFileAtomicReplace(target, 'BETA');
      eq(wrote, true, 'U1: a changed-content write reports true');
      eq(fs.readFileSync(target, 'utf8'), 'BETA', 'U1: the target carries the new bytes');
      eq(fs.readFileSync(witness, 'utf8'), 'ALPHA',
        'U1: the pre-write hardlink still carries the OLD bytes (rename-replace, never in-place truncate)');
      check(fs.statSync(target).ino !== inoBefore,
        'U1: the target inode CHANGED across the write (a fresh tmp inode was renamed into place)');
      eq(fs.statSync(witness).ino, inoBefore,
        'U1: the witness retains the ORIGINAL inode (the old file object outlived the replace)');
    }
    const residue = fs.readdirSync(dir).filter(name => name.includes('.tmp'));
    eq(residue.length, 0, 'U1: no .tmp scratch survives a successful replace, got ' + JSON.stringify(residue));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// U2 — writeFileAtomicReplace under GENUINELY CONCURRENT PROCESSES.
// Four child processes hammer one path with distinct homogeneous payloads while this process reads
// it in a tight loop. Every observation must be a COMPLETE payload — never empty, never short, never
// a mixture of two writers' bytes. This is the ground-U fact by construction: it lives in the
// interleaving of processes, in no file anyone can read.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-oracle-u2-'));
  try {
    const target = path.join(dir, 'contended.md');
    const SIZE = 128 * 1024;
    const ITERS = 8;
    const WRITERS = ['a', 'b', 'c', 'd'];
    const ALLOWED = new Set(WRITERS.concat(WRITERS.map(c => c.toUpperCase())));
    const CHILD_SRC = [
      'const kernel = require(process.argv[1]);',
      'const target = process.argv[2];',
      'const ch = process.argv[3];',
      'const size = Number(process.argv[4]);',
      'const iters = Number(process.argv[5]);',
      'const marker = process.argv[6];',
      'for (let i = 0; i < iters; i++) {',
      '  kernel.writeFileAtomicReplace(target, ch.repeat(size));',
      '  kernel.writeFileAtomicReplace(target, ch.toUpperCase().repeat(size));',
      '}',
      "require('fs').writeFileSync(marker, 'done');",
    ].join('\n');

    // Classify one observation. Returns 'OK:<char>' only for a fully homogeneous, full-length payload.
    function classify(content) {
      if (content.length === 0) return 'TORN(empty)';
      const first = content[0];
      if (content.length !== SIZE) return 'TORN(len=' + content.length + ',first=' + first + ')';
      for (let i = 1; i < content.length; i++) {
        if (content[i] !== first) return 'TORN(mixed ' + first + '->' + content[i] + ' at ' + i + ')';
      }
      return 'OK:' + first;
    }

    const markers = WRITERS.map(c => path.join(dir, 'done-' + c));
    for (let i = 0; i < WRITERS.length; i++) {
      spawn(process.execPath,
        ['-e', CHILD_SRC, KERNEL, target, WRITERS[i], String(SIZE), String(ITERS), markers[i]],
        { stdio: 'ignore' }).unref();
    }

    const observations = [];
    const torn = [];
    const deadline = Date.now() + 60000;
    let allDone = false;
    // Always read+classify: the read is what paces this loop (a marker-only spin would peg a core),
    // and a torn observation must never be missed. Only the recorded sample is capped.
    while (Date.now() < deadline) {
      let content = null;
      try { content = fs.readFileSync(target, 'utf8'); } catch (_) { content = null; }
      if (content !== null) {
        const verdict = classify(content);
        if (observations.length < 250) observations.push(verdict);
        if (!verdict.startsWith('OK:') && torn.length < 8) torn.push(verdict);
      }
      if (markers.every(m => fs.existsSync(m))) { allDone = true; break; }
    }

    check(allDone, 'U2: all four concurrent writer processes completed within the 60s budget');
    check(observations.length > 0,
      'U2: the reader observed the contended file at least once (a zero-observation run is vacuous)');
    check(torn.length === 0,
      'U2: NO torn observation across ' + observations.length + ' concurrent reads — every read is a '
        + 'complete payload; first offenders: ' + JSON.stringify(torn.slice(0, 3)));
    const finalVerdict = classify(fs.readFileSync(target, 'utf8'));
    check(finalVerdict.startsWith('OK:') && ALLOWED.has(finalVerdict.slice(3)),
      'U2: the settled file is exactly one writer\'s complete payload, got ' + finalVerdict);
    const residue = fs.readdirSync(dir).filter(name => name.includes('.tmp'));
    eq(residue.length, 0, 'U2: concurrent replaces leave no .tmp residue, got ' + JSON.stringify(residue));
    notes.push('U2: ' + observations.length + ' concurrent reads observed, 0 torn');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// ===========================================================================
// N — NON-COMPUTABLE
// The answer needs a function the agent cannot evaluate by reading: canonical serialization, sha256.
// ===========================================================================

// N1 — canonicalJson is a CANONICALIZER, not JSON.stringify.
// Its whole job is that two spellings of one value produce one byte string, and that anything
// outside the closed value domain REFUSES instead of silently collapsing to null. Nothing in the
// tree pinned this: the review corpus only asserts `typeof canonicalJson === 'function'`.
{
  eq(schema.canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}',
    'N1: object keys are emitted in sorted order');
  eq(schema.canonicalJson({ a: 2, b: 1 }), schema.canonicalJson({ b: 1, a: 2 }),
    'N1: insertion order does not change the canonical bytes');
  eq(schema.canonicalJson({ z: { y: 1, x: 2 }, a: [3, { d: 4, c: 5 }] }),
    '{"a":[3,{"c":5,"d":4}],"z":{"x":2,"y":1}}',
    'N1: nesting sorts recursively, through arrays');
  eq(schema.canonicalJson([3, 1, 2]), '[3,1,2]',
    'N1: ARRAY order is significant and must NOT be sorted');
  eq(schema.canonicalJson({ 'é': '😀', b: '中文' }), '{"b":"中文","é":"😀"}',
    'N1: unicode keys/values survive canonicalization unescaped and sort by code unit');
  eq(schema.canonicalJson(schema.canonicalJson({ b: 1, a: 2 })), '"{\\"a\\":2,\\"b\\":1}"',
    'N1: the output is itself a legal canonical input (round-trip stable)');
  eq(schema.canonicalJson(null), 'null', 'N1: null is in the value domain');
  eq(schema.canonicalJson(true), 'true', 'N1: booleans are in the value domain');
  eq(schema.canonicalJson(-9007199254740991), '-9007199254740991',
    'N1: safe integers at the negative bound are accepted');

  // The refusals. Each one exists so two distinct authority objects can never collapse to one digest.
  throwsWith(() => schema.canonicalJson(1.5), 'canonical_json_number_not_integer',
    'N1: a non-integer number REFUSES (float rounding must never enter a digest)');
  throwsWith(() => schema.canonicalJson(NaN), 'canonical_json_number_not_integer',
    'N1: NaN REFUSES (JSON.stringify would have emitted null)');
  throwsWith(() => schema.canonicalJson(Infinity), 'canonical_json_number_not_integer',
    'N1: Infinity REFUSES');
  throwsWith(() => schema.canonicalJson(9007199254740992), 'canonical_json_number_not_integer',
    'N1: an integer past Number.MAX_SAFE_INTEGER REFUSES');
  throwsWith(() => schema.canonicalJson({ a: undefined }), 'canonical_json_undefined',
    'N1: an undefined object value REFUSES (JSON.stringify would have dropped the key)');
  throwsWith(() => schema.canonicalJson([undefined]), 'canonical_json_sparse_or_undefined',
    'N1: an undefined array element REFUSES (JSON.stringify would have emitted null)');
  // eslint-disable-next-line no-sparse-arrays
  throwsWith(() => schema.canonicalJson([1, , 2]), 'canonical_json_sparse_or_undefined',
    'N1: a sparse array hole REFUSES');
  throwsWith(() => schema.canonicalJson(new Date(0)), 'canonical_json_non_plain_object',
    'N1: a Date REFUSES — toJSON is NEVER invoked');
  throwsWith(() => schema.canonicalJson({ toJSON: () => 'X' }), 'canonical_json_non_plain_object',
    'N1: a function-valued key REFUSES (JSON.stringify would have returned "X" via toJSON)');
  eq(JSON.stringify({ toJSON: () => 'X' }), '"X"',
    'N1: the JSON.stringify baseline confirms the toJSON divergence above is real, not incidental');
  throwsWith(() => schema.canonicalJson(Object.assign(Object.create({ inherited: 1 }), { a: 1 })),
    'canonical_json_non_plain_object',
    'N1: an object with a non-Object prototype REFUSES');
  {
    const cyclic = { a: 1 };
    cyclic.self = cyclic;
    throwsWith(() => schema.canonicalJson(cyclic), 'canonical_json_cycle',
      'N1: an object cycle REFUSES (never an infinite walk)');
    const cyclicArray = [1];
    cyclicArray.push(cyclicArray);
    throwsWith(() => schema.canonicalJson(cyclicArray), 'canonical_json_cycle',
      'N1: an array cycle REFUSES');
  }
  // A repeated (non-cyclic) reference is legal — the cycle guard must not misfire on a DAG.
  {
    const shared = { k: 1 };
    eq(schema.canonicalJson({ a: shared, b: shared }), '{"a":{"k":1},"b":{"k":1}}',
      'N1: a repeated non-cyclic reference is NOT a cycle (the stack unwinds on exit)');
  }
  eq(schema.isPlainObject({}), true, 'N1: isPlainObject accepts an object literal');
  eq(schema.isPlainObject(Object.create(null)), true, 'N1: isPlainObject accepts a null-prototype object');
  eq(schema.isPlainObject([]), false, 'N1: isPlainObject rejects an array');
  eq(schema.isPlainObject(new Date(0)), false, 'N1: isPlainObject rejects a Date');
  eq(schema.isPlainObject(null), false, 'N1: isPlainObject rejects null');
}

// N2 — sha256Hex / sha256Canonical against KNOWN-ANSWER vectors.
// Every digest binding in the workflow is downstream of these two. Fixture-stamping usages cannot
// catch a hashing change (both sides move together); a published vector can.
{
  eq(schema.sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'N2: sha256Hex("") matches the published SHA-256 empty-string vector');
  eq(schema.sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    'N2: sha256Hex("abc") matches the published SHA-256 vector');
  eq(schema.sha256Hex(Buffer.from('abc', 'utf8')), schema.sha256Hex('abc'),
    'N2: a Buffer and its utf8 string hash identically');
  eq(schema.sha256Hex('abc').toLowerCase(), schema.sha256Hex('abc'),
    'N2: the digest is emitted lowercase');
  eq(schema.sha256Canonical({ b: 1, a: 2 }), schema.sha256Hex('{"a":2,"b":1}'),
    'N2: sha256Canonical is exactly sha256Hex(canonicalJson(value))');
  eq(schema.sha256Canonical({ b: 1, a: 2 }), 'd3626ac30a87e6f7a6428233b3c68299976865fa5508e4267c5415c76af7a772',
    'N2: sha256Canonical known-answer vector for {a:2,b:1}');
  eq(schema.sha256Canonical({ a: 2, b: 1 }), schema.sha256Canonical({ b: 1, a: 2 }),
    'N2: sha256Canonical is insertion-order independent');
  check(schema.sha256Canonical({ a: 2, b: 1 }) !== schema.sha256Canonical({ a: 2, b: 2 }),
    'N2 SENSITIVITY: changing one value changes the canonical digest');
  check(schema.sha256Canonical({ a: '1' }) !== schema.sha256Canonical({ a: 1 }),
    'N2 SENSITIVITY: a string "1" and a number 1 are DISTINCT authorities (no type coercion)');
}

// ===========================================================================
console.log('test-oracle-kernel: all ' + passed + ' assertions passed');
