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

// U3 — acquireProjectLock's CORRUPT/EMPTY-payload classifier branch.
// A lockfile can be observed between its O_EXCL create and its payload write: the payload is
// unparseable but the holder is very much alive. That window is classified by the lockfile's MTIME,
// and the direction is safety-critical — a FRESH corrupt lock must read NOT stale (protect the
// holder mid-write), an AGED one must read stale (a real leftover). Neither branch is reachable
// through the parseable-payload cases the T-585 suite drives.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-oracle-u3-'));
  try {
    const lockPath = path.join(dir, '.cache', schema.SCHEDULER_LOCK_NAME);
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });

    // (a) fresh + unparseable -> refuse, holder null, NOT stale.
    const corrupt = '{"pid": 12';
    fs.writeFileSync(lockPath, corrupt);
    const fresh = schema.acquireProjectLock(lockPath, { subcommand: 'open-ready' });
    eq(fresh.ok, false, 'U3(a): a corrupt-payload lock still refuses the acquire');
    eq(fresh.holder, null, 'U3(a): an unparseable payload yields holder:null (never a fabricated holder)');
    eq(fresh.stale, false,
      'U3(a): a FRESH corrupt lock is NOT stale — a holder caught between O_EXCL and its payload write is protected');
    eq(fs.readFileSync(lockPath, 'utf8'), corrupt,
      'U3(a): the refused caller leaves the lockfile byte-untouched (never a non-holder unlink)');

    // (b) same corrupt payload, backdated past the staleness window -> stale.
    const aged = Date.now() - schema.LANE_STALENESS_MS - 3600000;
    fs.utimesSync(lockPath, new Date(aged), new Date(aged));
    const old = schema.acquireProjectLock(lockPath, { subcommand: 'open-ready' });
    eq(old.ok, false, 'U3(b): an aged corrupt-payload lock refuses');
    eq(old.holder, null, 'U3(b): an aged unparseable payload still yields holder:null');
    eq(old.stale, true,
      'U3(b): a corrupt lock older than LANE_STALENESS_MS classifies stale (mtime fallback)');
    eq(fs.readFileSync(lockPath, 'utf8'), corrupt,
      'U3(b): the stale-classified lockfile is byte-untouched (classification never takes over)');

    // (c) an EMPTY lockfile is the same branch (read succeeds, JSON.parse fails).
    fs.writeFileSync(lockPath, '');
    const empty = schema.acquireProjectLock(lockPath, { subcommand: 'close-node' });
    check(empty.ok === false && empty.holder === null,
      'U3(c): an empty lockfile refuses with holder:null, got ' + JSON.stringify(empty));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// U4 — isStaleLock's NON-NUMERIC timestamp branch.
// A cross-host payload may carry an ISO-8601 `ts` (or garbage). The classifier parses it; an
// unparseable value must fail CLOSED to stale rather than reading as "age 0, therefore live".
// T-585-stale only drives numeric timestamps.
{
  const ghost = () => 'ghost-host-' + Math.random().toString(16).slice(2);
  eq(schema.isStaleLock({ pid: 4242, host: ghost(), ts: new Date(Date.now() - schema.LANE_STALENESS_MS - 60000).toISOString() }), true,
    'U4: cross-host ISO-8601 ts older than LANE_STALENESS_MS -> stale');
  eq(schema.isStaleLock({ pid: 4242, host: ghost(), ts: new Date().toISOString() }), false,
    'U4: cross-host ISO-8601 ts inside the window -> not stale');
  eq(schema.isStaleLock({ pid: 4242, host: ghost(), ts: 'not-a-timestamp' }), true,
    'U4: an unparseable ts fails CLOSED to stale (never "age 0, therefore live")');
  eq(schema.isStaleLock({ pid: 4242, host: ghost() }), true,
    'U4: a missing ts fails closed to stale');
  eq(schema.isStaleLock('a string, not an object'), true,
    'U4: a non-object holder is stale');
  eq(schema.isStaleLock({ pid: 0, host: os.hostname(), ts: Date.now() }), false,
    'U4: same-host with a non-positive pid falls through to the fresh-age path -> not stale');
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

// N3 — snapshotManifestDigest: the self-digest exclusion.
// The manifest carries its own digest, so the digest function MUST ignore that one field and
// nothing else. Every use in the tree only STAMPS a fixture with it; the defining property was
// never asserted, and getting it wrong either wedges every manifest or lets any field drift free.
{
  const manifest = {
    schema_version: 1,
    parent_plan_epoch: 1,
    epoch_lineage_id: 'a'.repeat(64),
    transaction_id: 'b'.repeat(64),
    files: [
      { path: 'workflow-plan.md', size: 128, mode: '0644', digest: 'c'.repeat(64) },
      { path: 'workflow-state.md', size: 64, mode: '0644', digest: 'd'.repeat(64) },
    ],
  };
  const bare = schema.snapshotManifestDigest(manifest);
  eq(schema.snapshotManifestDigest(Object.assign({}, manifest, { manifest_self_digest: 'e'.repeat(64) })), bare,
    'N3: manifest_self_digest is EXCLUDED — stamping it cannot change the digest');
  eq(schema.snapshotManifestDigest(Object.assign({}, manifest, { manifest_self_digest: 'f'.repeat(64) })), bare,
    'N3: a DIFFERENT self-digest value is equally excluded');
  digestContract('N3 snapshotManifestDigest', manifest, schema.snapshotManifestDigest, [
    ['transaction_id', m => { m.transaction_id = '0'.repeat(64); }],
    ['epoch_lineage_id', m => { m.epoch_lineage_id = '0'.repeat(64); }],
    ['parent_plan_epoch', m => { m.parent_plan_epoch = 2; }],
    ['a file digest', m => { m.files[0].digest = '0'.repeat(64); }],
    ['a file size', m => { m.files[0].size = 129; }],
    ['a file path', m => { m.files[0].path = 'renamed.md'; }],
    ['a file mode', m => { m.files[0].mode = '0755'; }],
    ['file ORDER', m => { m.files.reverse(); }],
    ['dropping a file', m => { m.files.pop(); }],
  ]);
  throwsWith(() => schema.snapshotManifestDigest('not an object'), 'snapshot_manifest_invalid',
    'N3: a non-object manifest REFUSES rather than digesting a coerced value');

  // The shape validator recomputes the self-digest — a post-stamp edit cannot survive it.
  const stamped = clone(manifest);
  stamped.manifest_self_digest = schema.snapshotManifestDigest(stamped);
  eq(schema.validateSnapshotManifestShape(stamped).ok, true,
    'N3: a correctly self-stamped schema-1 manifest validates');
  const edited = clone(stamped);
  edited.files[0].digest = '9'.repeat(64);
  check(schema.validateSnapshotManifestShape(edited).ok === false
    && schema.validateSnapshotManifestShape(edited).reason === 'snapshot_manifest_invalid',
    'N3: editing a file digest AFTER stamping fails the self-digest recomputation');
}

// N4 — digestCandidateView: the reviewed-surface identity.
// Stability across input spelling (entry order) is what makes two runs agree; sensitivity to every
// covered field is what makes the digest a binding rather than a label. Neither buildCandidateView
// nor digestCandidateView is referenced by ANY other suite in the tree.
{
  const input = {
    schema_version: schema.EPOCH_SCHEMA_VERSION,
    claim_root_base_digest: 'a'.repeat(64),
    base_tree: 'b'.repeat(40),
    entries: [
      { path: 'src/b.js', kind: 'modified', mode: '100644', blob_digest: 'c'.repeat(64), code_relevant: true, security_relevant: false },
      { path: 'src/a.js', kind: 'added', mode: '100644', blob_digest: 'd'.repeat(64), code_relevant: true, security_relevant: true },
    ],
  };
  const digestOf = value => schema.digestCandidateView(value).candidate_digest;
  digestContract('N4 digestCandidateView', input, digestOf, [
    ['a blob_digest', v => { v.entries[0].blob_digest = '0'.repeat(64); }],
    ['code_relevant', v => { v.entries[0].code_relevant = false; }],
    ['security_relevant', v => { v.entries[0].security_relevant = true; }],
    ['an entry kind', v => { v.entries[0].kind = 'deleted'; }],
    ['an entry path', v => { v.entries[0].path = 'src/z.js'; }],
    ['an entry mode', v => { v.entries[0].mode = '100755'; }],
    ['base_tree', v => { v.base_tree = '0'.repeat(40); }],
    ['claim_root_base_digest', v => { v.claim_root_base_digest = '0'.repeat(64); }],
    ['dropping an entry', v => { v.entries.pop(); }],
  ], [
    ['entry ORDER in the input', v => { v.entries.reverse(); }],
    ['uppercase digest spelling', v => {
      v.claim_root_base_digest = v.claim_root_base_digest.toUpperCase();
      v.base_tree = v.base_tree.toUpperCase();
      v.entries[0].blob_digest = v.entries[0].blob_digest.toUpperCase();
    }],
  ]);
  const view = schema.digestCandidateView(input).candidate_view;
  eq(view.entries.map(e => e.path).join(','), 'src/a.js,src/b.js',
    'N4: the normalized view is sorted by path (the digest input is canonical, not the caller\'s order)');
  throwsWith(() => schema.digestCandidateView(Object.assign(clone(input), { base_tree: 'nope' })),
    'candidate_view_invalid', 'N4: a malformed base_tree REFUSES rather than digesting garbage');
  throwsWith(() => {
    const dup = clone(input);
    dup.entries.push(clone(dup.entries[0]));
    schema.digestCandidateView(dup);
  }, 'candidate_entry_duplicate', 'N4: a duplicate (path, kind) REFUSES — two entries can never alias one slot');
  throwsWith(() => {
    const bad = clone(input);
    bad.entries[0].path = '../escape.js';
    schema.digestCandidateView(bad);
  }, 'candidate_entry_invalid', 'N4: a path escaping the tree REFUSES');
}

// N5 — digestInheritedFrontierView + buildScopeLineageId.
// Both feed review-scope identity; neither is referenced by any other suite.
{
  const input = {
    schema_version: schema.EPOCH_SCHEMA_VERSION,
    claim_root_base_digest: 'a'.repeat(64),
    candidate_digest: 'b'.repeat(64),
    code_digest: 'c'.repeat(64),
    security_digest: 'd'.repeat(64),
    inherited_frontier_classes: ['security', 'code'],
    changed_entry_digests: ['e'.repeat(64), 'f'.repeat(64)],
    validation_obligation_digests: ['1'.repeat(64)],
    scope_lineage_ids: ['2'.repeat(64)],
  };
  const digestOf = value => schema.digestInheritedFrontierView(value).inherited_frontier_digest;
  digestContract('N5 digestInheritedFrontierView', input, digestOf, [
    ['candidate_digest', v => { v.candidate_digest = '0'.repeat(64); }],
    ['code_digest', v => { v.code_digest = '0'.repeat(64); }],
    ['security_digest', v => { v.security_digest = '0'.repeat(64); }],
    ['claim_root_base_digest', v => { v.claim_root_base_digest = '0'.repeat(64); }],
    ['dropping a frontier class', v => { v.inherited_frontier_classes = ['code']; }],
    ['a changed_entry_digest', v => { v.changed_entry_digests[0] = '0'.repeat(64); }],
    ['adding a validation obligation', v => { v.validation_obligation_digests.push('3'.repeat(64)); }],
    ['a scope_lineage_id', v => { v.scope_lineage_ids[0] = '0'.repeat(64); }],
  ], [
    ['class ORDER', v => { v.inherited_frontier_classes = ['code', 'security']; }],
    ['duplicate changed_entry_digests', v => { v.changed_entry_digests.push('e'.repeat(64)); }],
    ['digest-list ORDER', v => { v.changed_entry_digests.reverse(); }],
    ['uppercase digest spelling', v => {
      v.changed_entry_digests = v.changed_entry_digests.map(d => d.toUpperCase());
      v.candidate_digest = v.candidate_digest.toUpperCase();
    }],
  ]);
  throwsWith(() => {
    const bad = clone(input);
    bad.inherited_frontier_classes = ['code', 'performance'];
    schema.digestInheritedFrontierView(bad);
  }, 'inherited_frontier_classes_invalid', 'N5: an unknown frontier class REFUSES (closed vocabulary)');
  throwsWith(() => {
    const bad = clone(input);
    bad.changed_entry_digests = ['not-a-digest'];
    schema.digestInheritedFrontierView(bad);
  }, 'inherited_frontier_entry_digests_invalid', 'N5: a malformed entry digest REFUSES');

  const lineageInput = {
    epoch_lineage_id: 'a'.repeat(64),
    claim_identity_digest: 'b'.repeat(64),
    claim_root_base_digest: 'c'.repeat(64),
    acceptance_contract_digest: 'd'.repeat(64),
    reviewed_surface_digest: 'e'.repeat(64),
  };
  digestContract('N5 buildScopeLineageId', lineageInput, schema.buildScopeLineageId, [
    ['epoch_lineage_id', v => { v.epoch_lineage_id = '0'.repeat(64); }],
    ['claim_identity_digest', v => { v.claim_identity_digest = '0'.repeat(64); }],
    ['claim_root_base_digest', v => { v.claim_root_base_digest = '0'.repeat(64); }],
    ['acceptance_contract_digest', v => { v.acceptance_contract_digest = '0'.repeat(64); }],
    ['reviewed_surface_digest', v => { v.reviewed_surface_digest = '0'.repeat(64); }],
  ], [
    ['uppercase spelling', v => { v.claim_identity_digest = v.claim_identity_digest.toUpperCase(); }],
    ['an extra unknown field', v => { v.ignored_by_the_view = 'noise'; }],
  ]);
  throwsWith(() => schema.buildScopeLineageId(Object.assign(clone(lineageInput), { reviewed_surface_digest: 'short' })),
    'scope_lineage_digest_invalid', 'N5: a malformed component digest REFUSES');
}

// N6 — the ledger-chain digest inputs.
// ledgerChainMapDigest must agree byte-for-byte between write time (a parsed map) and verify time
// (raw plan content) or the whole chain wedges honest runs; and it must move on any status flip or
// the chain detects nothing.
{
  const planWith = rows => [
    '# Workflow Plan', '', '<!-- plan_hash: ' + 'f'.repeat(64) + ' -->', '',
    '## ' + schema.LEDGER_HEADING, '', '| id | status |', '| --- | --- |',
  ].concat(rows).concat(['', '## Meta', 'labels: none', '']).join('\n');

  const content = planWith(['| n1 | pending |', '| n2 | in_progress |']);
  const map = schema.ledgerChainStatusMap(content);
  eq(JSON.stringify(map), JSON.stringify({ n1: 'pending', n2: 'in_progress' }),
    'N6: ledgerChainStatusMap is header-driven and skips the separator row');
  eq(schema.ledgerChainMapDigest(content), schema.ledgerChainMapDigest(map),
    'N6: the raw-content and parsed-map input forms produce the SAME digest (write-time == verify-time)');
  eq(schema.ledgerChainMapDigest({ n2: 'in_progress', n1: 'pending' }), schema.ledgerChainMapDigest(map),
    'N6: map insertion order does not change the digest');
  check(schema.ledgerChainMapDigest({ n1: 'complete', n2: 'in_progress' }) !== schema.ledgerChainMapDigest(map),
    'N6 SENSITIVITY: flipping ONE status changes the ledger digest (the tamper signal)');
  check(schema.ledgerChainMapDigest({ n1: 'pending', n2: 'in_progress', n3: 'pending' }) !== schema.ledgerChainMapDigest(map),
    'N6 SENSITIVITY: adding a row changes the ledger digest');
  check(schema.ledgerChainMapDigest({ n1: 'pending' }) !== schema.ledgerChainMapDigest(map),
    'N6 SENSITIVITY: removing a row changes the ledger digest');
  check(schema.ledgerChainMapDigest({ nA: 'pending', n2: 'in_progress' }) !== schema.ledgerChainMapDigest(map),
    'N6 SENSITIVITY: renaming a node id changes the ledger digest');
  eq(JSON.stringify(schema.ledgerChainStatusMap('no ledger section here')), '{}',
    'N6: an absent ledger section yields an empty map (never a throw)');

  const noExpansion = schema.ledgerChainExpansionDigest(content);
  eq(noExpansion, schema.sha256Canonical(''),
    'N6: an absent ## Expansion Records section digests to the empty-string constant');
  const withExpansion = content + '\n## Expansion Records\n\nunit-a#1 | writer | 2\n';
  check(schema.ledgerChainExpansionDigest(withExpansion) !== noExpansion,
    'N6 SENSITIVITY: adding an ## Expansion Records section changes the expansion digest');
  check(schema.ledgerChainExpansionDigest(withExpansion.replace('unit-a#1', 'unit-a#2'))
    !== schema.ledgerChainExpansionDigest(withExpansion),
    'N6 SENSITIVITY: a one-token edit inside ## Expansion Records changes the expansion digest');
}

// ===========================================================================
// S — SPEC-WRONG
// The obvious derivation is a DIFFERENT function from the correct one, and both look right.
//
// SCOPE NOTE: the review/gate engine's spec-wrong derivations (deriveGateMode, deriveGateEffect,
// reduceReviewReceipts, deriveRepairDelta, assessFindingClosure, assessReviewProgress,
// compareValidationObligations) already have a direct, fixture-driven kernel corpus inside
// test-adaptive-node.js and are DELIBERATELY not re-tested here. What follows is the spec-wrong
// derivation that corpus does not reach, and that no suite in the tree covers at all.
// ===========================================================================

// S1 — validateEpochStateAuthority: "legacy" is not "missing".
// The obvious derivation is `no epoch_schema_version => legacy, read it the old way`. The CORRECT
// function is `no epoch_schema_version AND no other epoch scalar => legacy; otherwise a MALFORMED
// current authority`. The two agree on every honest file and disagree exactly on a partially
// stripped schema-2 state — where the obvious one silently downgrades a tampered/truncated
// authority to the permissive legacy path. Referenced by no other suite.
{
  const v = schema.validateEpochStateAuthority.bind(schema);

  eq(v('not an object').reason, 'state_epoch_authority_invalid', 'S1: a non-object input REFUSES');
  eq(v(null).reason, 'state_epoch_authority_invalid', 'S1: null REFUSES');

  // A genuinely pre-epoch state: NO envelope scalar at all -> legacy, readable.
  const legacy = v({ name: 'issue-1', status: 'active' });
  check(legacy.ok === true && legacy.legacy === true,
    'S1: a state carrying NO epoch scalar at all reads as legacy, got ' + JSON.stringify(legacy));

  // THE DISCRIMINATION. Same missing epoch_schema_version, but one other envelope scalar survives.
  // The obvious derivation calls this legacy; the correct one calls it malformed.
  for (const survivor of ['claim_identity_digest', 'epoch_lineage_id', 'claim_root_base_digest', 'plan_epoch', 'replan_status']) {
    const partial = { name: 'issue-1' };
    partial[survivor] = 'x';
    eq(v(partial).reason, 'state_epoch_schema_missing',
      'S1: a partially stripped schema-2 state (only ' + survivor + ' left) is MALFORMED, never legacy');
  }
  eq(v({ epoch_schema_version: 'none', epoch_lineage_id: 'a'.repeat(64) }).reason, 'state_epoch_schema_missing',
    'S1: the literal "none" sentinel counts as absent, and the surviving scalar still forces malformed');
  eq(v({ epoch_schema_version: '   ', epoch_lineage_id: 'a'.repeat(64) }).reason, 'state_epoch_schema_missing',
    'S1: a whitespace-only version counts as absent');
  check(v({ epoch_schema_version: 'none' }).ok === true && v({ epoch_schema_version: 'none' }).legacy === true,
    'S1: "none" with NO other scalar is still legacy (the discrimination is on the OTHER scalars)');

  eq(v({ epoch_schema_version: '1', epoch_lineage_id: 'a'.repeat(64) }).reason, 'state_epoch_schema_unsupported',
    'S1: a schema version this kernel does not implement REFUSES distinctly from missing');
  eq(v({ epoch_schema_version: String(schema.EPOCH_SCHEMA_VERSION) }).reason, 'state_epoch_lineage_missing',
    'S1: schema 2 with no lineage id REFUSES lineage_missing');
  eq(v({ epoch_schema_version: '2', epoch_lineage_id: 'none' }).reason, 'state_epoch_lineage_missing',
    'S1: a "none" lineage id counts as missing');
  eq(v({ epoch_schema_version: '2', epoch_lineage_id: 'not-hex' }).reason, 'state_epoch_lineage_invalid',
    'S1: a malformed lineage id REFUSES distinctly from missing');
  eq(v({ epoch_schema_version: '2', epoch_lineage_id: 'a'.repeat(64) }).reason, 'state_epoch_lineage_basis_invalid',
    'S1: a lineage id with no basis digests REFUSES basis_invalid');

  // The binding itself: the lineage id must be the canonical RECOMPUTATION of its own basis, not
  // merely a well-formed 64-hex string sitting next to two well-formed 64-hex strings.
  const identityDigest = 'b'.repeat(64);
  const rootDigest = 'c'.repeat(64);
  const correct = schema.sha256Canonical({
    schema_version: schema.EPOCH_SCHEMA_VERSION,
    claim_identity_digest: identityDigest,
    claim_root_base_digest: rootDigest,
  });
  eq(v({ epoch_schema_version: '2', epoch_lineage_id: 'a'.repeat(64),
    claim_identity_digest: identityDigest, claim_root_base_digest: rootDigest }).reason,
  'state_epoch_lineage_mismatch',
  'S1: a well-formed lineage id that is NOT the recomputation of its basis REFUSES mismatch');
  const ok = v({ epoch_schema_version: ' 2 ', epoch_lineage_id: ' ' + correct + ' ',
    claim_identity_digest: ' ' + identityDigest + ' ', claim_root_base_digest: rootDigest });
  check(ok.ok === true && ok.epoch_lineage_id === correct && ok.claim_identity_digest === identityDigest
    && ok.epoch_schema_version === schema.EPOCH_SCHEMA_VERSION,
  'S1: the recomputed-consistent authority passes and echoes trimmed fields, got ' + JSON.stringify(ok));
  eq(schema.EPOCH_SCHEMA_VERSION, 2, 'S1: EPOCH_SCHEMA_VERSION is the load-bearing value 2');
}

// ===========================================================================
// I — IRREVERSIBLE-ORDERED
// The act cannot be undone and its record must outlive the agent that performed it.
//
// SCOPE NOTE: test-ledger-chain-tamper.js drives this family END-TO-END through the adaptive-node
// write wrapper and the validator resume seam. This section pins the PURE kernel functions beneath
// it — the entry-digest identity, the typed-reason precedence per branch, the head-anchor property,
// and stripLedgerChainHead, which no suite in the tree references.
// ===========================================================================

const LINEAGE = 'a'.repeat(64);
const PLAN_HASH = 'f'.repeat(64);
const EMPTY_EXPANSION = schema.sha256Canonical('');

function freshChain() {
  const oldMap = { n1: 'pending', n2: 'pending' };
  const newMap = { n1: 'in_progress', n2: 'pending' };
  const extended = schema.extendLedgerChain({
    oldHead: null, oldJournal: null,
    epochLineageId: LINEAGE, planHash: PLAN_HASH, subcommand: 'open-next',
    oldLedgerDigest: schema.ledgerChainMapDigest(oldMap),
    newLedgerDigest: schema.ledgerChainMapDigest(newMap),
    deltas: schema.ledgerChainDeltas(oldMap, newMap),
    oldExpansionDigest: EMPTY_EXPANSION, newExpansionDigest: EMPTY_EXPANSION,
  });
  return {
    oldMap, newMap, extended,
    journal: { schema_version: schema.LEDGER_CHAIN_SCHEMA_VERSION, epoch_lineage_id: LINEAGE, entries: extended.entries },
    currentLedgerDigest: schema.ledgerChainMapDigest(newMap),
  };
}
// Re-seal a mutated entries array so every digest and back-link is internally perfect again — the
// re-forger's best effort. Only the plan's committed head can still tell.
function reseal(entries) {
  let previous = null;
  return entries.map(entry => {
    const base = Object.assign({}, entry, { previous_entry_digest: previous });
    delete base.entry_digest;
    const sealed = Object.assign({}, base, { entry_digest: schema.sha256Canonical(base) });
    previous = sealed.entry_digest;
    return sealed;
  });
}

// I1 — buildLedgerChainEntry's digest identity + field sensitivity.
{
  const fields = {
    epoch_lineage_id: LINEAGE, plan_hash: PLAN_HASH, subcommand: 'close-node', genesis: false,
    deltas: [{ id: 'n1', from: 'in_progress', to: 'complete' }],
    post_ledger_digest: 'b'.repeat(64), expansion_records_digest: EMPTY_EXPANSION,
    previous_entry_digest: 'c'.repeat(64),
  };
  const entry = schema.buildLedgerChainEntry(fields);
  const recomputed = Object.assign({}, entry);
  delete recomputed.entry_digest;
  eq(schema.sha256Canonical(recomputed), entry.entry_digest,
    'I1: entry_digest is exactly sha256Canonical(the entry without entry_digest)');
  eq(entry.schema_version, schema.LEDGER_CHAIN_SCHEMA_VERSION,
    'I1: every entry carries the chain schema version');
  eq(JSON.stringify(Object.keys(entry).sort()),
    JSON.stringify(['deltas', 'entry_digest', 'epoch_lineage_id', 'expansion_records_digest', 'genesis',
      'plan_hash', 'post_ledger_digest', 'previous_entry_digest', 'schema_version', 'subcommand']),
    'I1: the entry is a CLOSED record — no caller field rides along uncovered by the digest');
  eq(schema.buildLedgerChainEntry(Object.assign({}, fields, { extra_field: 'ignored' })).entry_digest,
    entry.entry_digest, 'I1: an unknown caller field is DROPPED, never smuggled into the record');
  eq(schema.buildLedgerChainEntry(Object.assign({}, fields, { previous_entry_digest: null })).previous_entry_digest,
    null, 'I1: a null back-link (genesis) is preserved as null, not coerced to "null"');
  for (const [name, patch] of [
    ['subcommand', { subcommand: 'open-next' }],
    ['genesis', { genesis: true }],
    ['post_ledger_digest', { post_ledger_digest: '0'.repeat(64) }],
    ['expansion_records_digest', { expansion_records_digest: '0'.repeat(64) }],
    ['previous_entry_digest', { previous_entry_digest: '0'.repeat(64) }],
    ['plan_hash', { plan_hash: '0'.repeat(64) }],
    ['epoch_lineage_id', { epoch_lineage_id: '0'.repeat(64) }],
    ['a delta status', { deltas: [{ id: 'n1', from: 'in_progress', to: 'n/a' }] }],
    ['a delta id', { deltas: [{ id: 'n2', from: 'in_progress', to: 'complete' }] }],
    ['delta count', { deltas: [] }],
  ]) {
    check(schema.buildLedgerChainEntry(Object.assign({}, fields, patch)).entry_digest !== entry.entry_digest,
      'I1 SENSITIVITY: changing ' + name + ' MUST change entry_digest');
  }
}

// I2 — extendLedgerChain: genesis adoption, residue truncation, and the laundering refusals.
{
  const base = freshChain();
  eq(base.extended.ok, true, 'I2: a headless plan extends (genesis adoption)');
  eq(base.extended.entries.length, 2, 'I2: genesis adoption writes [genesis, transition]');
  eq(base.extended.entries[0].genesis, true, 'I2: entry 0 is the genesis snapshot');
  eq(base.extended.entries[0].previous_entry_digest, null, 'I2: genesis has a null back-link');
  eq(base.extended.entries[0].post_ledger_digest, schema.ledgerChainMapDigest(base.oldMap),
    'I2: genesis snapshots the PRE-transition ledger (never forged history)');
  eq(base.extended.entries[1].previous_entry_digest, base.extended.entries[0].entry_digest,
    'I2: the transition back-links to genesis');
  eq(base.extended.head, base.extended.entries[1].entry_digest,
    'I2: the returned head is the last entry digest');
  eq(JSON.stringify(base.extended.entries[1].deltas),
    JSON.stringify([{ id: 'n1', from: 'pending', to: 'in_progress' }]),
    'I2: the transition carries exactly the flipped rows');

  // Extending from a committed head requires the on-disk ledger to MATCH that head's recorded state.
  const laundered = schema.extendLedgerChain({
    oldHead: base.extended.head, oldJournal: base.journal,
    epochLineageId: LINEAGE, planHash: PLAN_HASH, subcommand: 'close-node',
    oldLedgerDigest: schema.ledgerChainMapDigest({ n1: 'complete', n2: 'complete' }), // NOT the head's state
    newLedgerDigest: schema.ledgerChainMapDigest({ n1: 'complete', n2: 'complete' }),
    deltas: [], oldExpansionDigest: EMPTY_EXPANSION, newExpansionDigest: EMPTY_EXPANSION,
  });
  check(laundered.ok === false && laundered.reason === 'ledger_chain_ledger_mismatch',
    'I2: extending from a ledger that disagrees with the committed head REFUSES (the laundering guard), got '
      + JSON.stringify(laundered));
  const noJournal = schema.extendLedgerChain({
    oldHead: base.extended.head, oldJournal: null,
    epochLineageId: LINEAGE, planHash: PLAN_HASH, subcommand: 'close-node',
    oldLedgerDigest: base.currentLedgerDigest, newLedgerDigest: base.currentLedgerDigest,
    deltas: [], oldExpansionDigest: EMPTY_EXPANSION, newExpansionDigest: EMPTY_EXPANSION,
  });
  eq(noJournal.reason, 'ledger_chain_journal_missing',
    'I2: a head with no journal REFUSES rather than re-adopting a fresh genesis');
  const strayHead = schema.extendLedgerChain({
    oldHead: '9'.repeat(64), oldJournal: base.journal,
    epochLineageId: LINEAGE, planHash: PLAN_HASH, subcommand: 'close-node',
    oldLedgerDigest: base.currentLedgerDigest, newLedgerDigest: base.currentLedgerDigest,
    deltas: [], oldExpansionDigest: EMPTY_EXPANSION, newExpansionDigest: EMPTY_EXPANSION,
  });
  eq(strayHead.reason, 'ledger_chain_head_not_in_journal',
    'I2: a head absent from the journal REFUSES');

  // Crash roll-forward residue: entries recorded AFTER the committed head are truncated, not kept.
  const residueJournal = {
    schema_version: schema.LEDGER_CHAIN_SCHEMA_VERSION, epoch_lineage_id: LINEAGE,
    entries: base.journal.entries.concat([schema.buildLedgerChainEntry({
      epoch_lineage_id: LINEAGE, plan_hash: PLAN_HASH, subcommand: 'crashed-write', genesis: false,
      deltas: [{ id: 'n2', from: 'pending', to: 'in_progress' }],
      post_ledger_digest: '7'.repeat(64), expansion_records_digest: EMPTY_EXPANSION,
      previous_entry_digest: base.extended.head,
    })]),
  };
  const truncated = schema.extendLedgerChain({
    oldHead: base.extended.head, oldJournal: residueJournal,
    epochLineageId: LINEAGE, planHash: PLAN_HASH, subcommand: 'close-node',
    oldLedgerDigest: base.currentLedgerDigest,
    newLedgerDigest: schema.ledgerChainMapDigest({ n1: 'complete', n2: 'pending' }),
    deltas: [{ id: 'n1', from: 'in_progress', to: 'complete' }],
    oldExpansionDigest: EMPTY_EXPANSION, newExpansionDigest: EMPTY_EXPANSION,
  });
  eq(truncated.ok, true, 'I2: extending past crash residue succeeds');
  eq(truncated.entries.length, 3,
    'I2: roll-forward residue AFTER the committed head is TRUNCATED, not carried forward');
  check(!truncated.entries.some(e => e.subcommand === 'crashed-write'),
    'I2: the un-committed crash entry is gone from the extended chain');
  eq(truncated.entries[2].previous_entry_digest, base.extended.head,
    'I2: the new transition back-links to the committed head, not to the residue');
}

// I3 — verifyLedgerChain: migration, the honest path, and one typed reason per tamper shape.
{
  const base = freshChain();
  const verify = patch => schema.verifyLedgerChain(Object.assign({
    head: base.extended.head, journal: base.journal, epochLineageId: LINEAGE,
    currentLedgerDigest: base.currentLedgerDigest,
  }, patch || {}));

  const migration = verify({ head: null });
  check(migration.ok === true && migration.in_force === false,
    'I3: NO head means the chain is not in force — a pre-chain plan PASSES untouched (migration)');
  const honest = verify();
  check(honest.ok === true && honest.in_force === true && honest.head === base.extended.head,
    'I3: an honest chain verifies in_force with its head echoed, got ' + JSON.stringify(honest));

  // THE tamper case: the plan's ledger no longer matches what the committed head recorded.
  eq(verify({ currentLedgerDigest: schema.ledgerChainMapDigest({ n1: 'complete', n2: 'complete' }) }).reason,
    'ledger_chain_ledger_mismatch',
    'I3: an out-of-band ledger edit REFUSES ledger_chain_ledger_mismatch');

  eq(verify({ journal: null }).reason, 'ledger_chain_journal_missing',
    'I3: deleting the journal is not a bypass');
  eq(verify({ journal: Object.assign({}, base.journal, { schema_version: 99 }) }).reason,
    'ledger_chain_journal_missing', 'I3: a journal at an unknown schema version cannot vouch');
  eq(verify({ journal: Object.assign({}, base.journal, { epoch_lineage_id: 'b'.repeat(64) }) }).reason,
    'ledger_chain_journal_missing', 'I3: a journal from ANOTHER epoch cannot vouch for this one');
  eq(verify({ epochLineageId: 'b'.repeat(64) }).reason, 'ledger_chain_journal_missing',
    'I3: a journal whose lineage disagrees with the caller\'s epoch cannot vouch');

  // Field-level tampering, each landing on its OWN typed reason.
  {
    const entries = clone(base.journal.entries);
    entries[1].post_ledger_digest = '0'.repeat(64); // digest left stale on purpose
    eq(verify({ journal: Object.assign({}, base.journal, { entries }) }).reason,
      'ledger_chain_entry_digest_mismatch',
      'I3: editing an entry field without re-sealing it REFUSES entry_digest_mismatch');
  }
  {
    // Break ONLY the back-link, re-sealing the digest so the digest check cannot mask it.
    const entries = clone(base.journal.entries);
    entries[1].previous_entry_digest = '0'.repeat(64);
    const base1 = Object.assign({}, entries[1]);
    delete base1.entry_digest;
    entries[1].entry_digest = schema.sha256Canonical(base1);
    eq(verify({ journal: Object.assign({}, base.journal, { entries }) }).reason,
      'ledger_chain_broken_link',
      'I3: a re-sealed entry with a wrong back-link still REFUSES broken_link (the walk is ordered)');
  }
  {
    const entries = clone(base.journal.entries);
    entries[0].schema_version = 99;
    eq(verify({ journal: Object.assign({}, base.journal, { entries }) }).reason,
      'ledger_chain_invalid', 'I3: an entry at an unknown schema version REFUSES invalid');
  }
  {
    const entries = clone(base.journal.entries);
    delete entries[1].deltas;
    eq(verify({ journal: Object.assign({}, base.journal, { entries }) }).reason,
      'ledger_chain_invalid', 'I3: a structurally incomplete entry REFUSES invalid');
  }
  {
    const entries = clone(base.journal.entries);
    entries[1].genesis = 'false'; // string, not boolean
    eq(verify({ journal: Object.assign({}, base.journal, { entries }) }).reason,
      'ledger_chain_invalid', 'I3: a wrongly-typed entry field REFUSES invalid (no coercion)');
  }

  // THE HEAD ANCHOR — the strongest property here. A re-forger edits the recorded ledger state and
  // then re-seals EVERY digest and back-link, so the chain is internally perfect. It still fails,
  // because the head committed in the plan is not a digest the re-forged chain can produce.
  {
    const entries = clone(base.journal.entries);
    entries[1].post_ledger_digest = schema.ledgerChainMapDigest({ n1: 'complete', n2: 'complete' });
    const forged = reseal(entries);
    const forgedJournal = Object.assign({}, base.journal, { entries: forged });
    // Sanity: the forged chain really is internally consistent (it verifies against its OWN head).
    const selfConsistent = schema.verifyLedgerChain({
      head: forged[forged.length - 1].entry_digest, journal: forgedJournal, epochLineageId: LINEAGE,
      currentLedgerDigest: schema.ledgerChainMapDigest({ n1: 'complete', n2: 'complete' }),
    });
    eq(selfConsistent.ok, true,
      'I3: the re-forged chain IS internally perfect (digests and back-links all recompute) — the '
      + 'refusal below is therefore the head anchor, not a broken forgery');
    eq(schema.verifyLedgerChain({
      head: base.extended.head, journal: forgedJournal, epochLineageId: LINEAGE,
      currentLedgerDigest: schema.ledgerChainMapDigest({ n1: 'complete', n2: 'complete' }),
    }).reason, 'ledger_chain_head_not_in_journal',
    'I3: a fully re-forged chain still REFUSES — the plan\'s committed head anchors the record');
  }
  eq(schema.LEDGER_CHAIN_SCHEMA_VERSION, 1, 'I3: LEDGER_CHAIN_SCHEMA_VERSION is the load-bearing value 1');
}

// I4 — ledgerChainDeltas: the per-write symmetric diff.
{
  const before = { keep: 'pending', flip: 'pending', drop: 'complete' };
  const after = { keep: 'pending', flip: 'in_progress', add: 'pending' };
  eq(JSON.stringify(schema.ledgerChainDeltas(before, after)), JSON.stringify([
    { id: 'add', from: null, to: 'pending' },
    { id: 'drop', from: 'complete', to: null },
    { id: 'flip', from: 'pending', to: 'in_progress' },
  ]), 'I4: added/removed/changed rows are reported, unchanged rows are omitted, sorted by id');
  eq(JSON.stringify(schema.ledgerChainDeltas(before, before)), '[]',
    'I4: an unchanged ledger produces NO delta (a no-op write appends no history)');
  eq(JSON.stringify(schema.ledgerChainDeltas(null, { n1: 'pending' })),
    JSON.stringify([{ id: 'n1', from: null, to: 'pending' }]),
    'I4: a null prior map is treated as empty, not a throw');
}

// I5 — stamp / strip / read of the head marker.
// stripLedgerChainHead is referenced by NO other suite; it is the chain-RESET point that --freeze
// depends on, so a silent regression there would strand every post-freeze run on a stale head.
{
  const HEAD = 'a'.repeat(64);
  const OTHER = 'b'.repeat(64);
  const withPlanHash = '# Workflow Plan\n\n<!-- plan_hash: ' + PLAN_HASH + ' -->\n\n## Meta\nlabels: none\n';

  const stamped = schema.stampLedgerChainHead(withPlanHash, HEAD);
  eq(schema.ledgerChainHeadFromContent(stamped), HEAD, 'I5: the stamped head reads back');
  eq(schema.stripLedgerChainHead(stamped), withPlanHash,
    'I5: strip(stamp(content)) is BYTE-IDENTICAL on the production shape (a plan_hash-marked plan)');
  eq(schema.ledgerChainHeadFromContent(schema.stripLedgerChainHead(stamped)), null,
    'I5: after strip, no head is in force (the chain-reset point)');

  const restamped = schema.stampLedgerChainHead(stamped, OTHER);
  eq(schema.ledgerChainHeadFromContent(restamped), OTHER, 'I5: re-stamping replaces the head in place');
  eq((restamped.match(/ledger_chain_head:/g) || []).length, 1,
    'I5: re-stamping leaves exactly ONE marker (idempotent, never appended twice)');
  eq(restamped.length, stamped.length,
    'I5: an in-place replacement does not grow the file');
  check(stamped.indexOf('<!-- plan_hash:') < stamped.indexOf('<!-- ledger_chain_head:'),
    'I5: the head marker is a SIBLING placed after plan_hash (outside every ## section)');
  check(stamped.indexOf('<!-- ledger_chain_head:') < stamped.indexOf('## Meta'),
    'I5: the head marker sits before the first ## section, so it cannot move a section-scoped hash');

  eq(schema.ledgerChainHeadFromContent(withPlanHash), null, 'I5: an unstamped plan reports no head');
  eq(schema.ledgerChainHeadFromContent('<!-- ledger_chain_head: ' + HEAD.toUpperCase() + ' -->'), HEAD,
    'I5: a head read back from uppercase content is lowercased');
  eq(schema.ledgerChainHeadFromContent(null), null, 'I5: null content reports no head (never a throw)');
  eq(schema.stripLedgerChainHead(withPlanHash), withPlanHash,
    'I5: stripping a plan with no head is a no-op');

  // The other two placement shapes: strip must still remove the head (byte-identity is NOT claimed —
  // stamping into a bare H1 / headingless file inserts a blank line that strip does not take back).
  for (const [name, body] of [['H1-only', '# Workflow Plan\nbody\n'], ['no heading', 'body only\n']]) {
    const s = schema.stampLedgerChainHead(body, HEAD);
    eq(schema.ledgerChainHeadFromContent(s), HEAD, 'I5: the head stamps into a ' + name + ' document');
    eq(schema.ledgerChainHeadFromContent(schema.stripLedgerChainHead(s)), null,
      'I5: the head strips out of a ' + name + ' document');
  }
}

// ===========================================================================

for (const note of notes) console.log('note: ' + note);

if (failures.length) {
  console.error('');
  console.error('test-oracle-kernel: ' + failures.length + ' assertion(s) FAILED of ' + (passed + failures.length));
  process.exit(1);
}
console.log('test-oracle-kernel: all ' + passed + ' assertions passed');
