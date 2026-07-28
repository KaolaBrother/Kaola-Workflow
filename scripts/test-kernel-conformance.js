#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// Layer-0 kernel conformance.
//
// The durable kernel is EXACTLY four records — plan / position / evidence / forge. Everything
// else a run leaves on disk is derivable from those four or a preference a successor may
// re-decide. This suite is what makes that a checkable statement instead of a slogan:
//
//   PART A — the ruling is WELL-FORMED. Closed vocabularies, an owner for every record row, no
//            row shadowed by an earlier pattern, the broad bands last.
//   PART B — the ruling is SINGLE-SOURCED. The registry in `kaola-workflow-adaptive-schema.js`
//            and the table in `docs/workflow-state-contract.md` are equal, row for row, in order.
//   PART C — the ruling is TOTAL. Every durable artifact a real archived run left behind, and
//            every artifact-name constant the production scripts declare, classifies. Nothing is
//            `unclassified`, and the corpus is asserted non-empty so this cannot pass vacuously.
//   PART D — the atomic-write obligation, COMPLETENESS half. Observed at runtime: no production
//            script writes a `record` path by any means other than the atomic replace, except
//            through an enumerated exempt class that carries its reason.
//   PART E — the atomic-write obligation, SCOPING half. The reverse direction: the atomic replace
//            is used ON the kernel and not elsewhere.
//
// D and E are observed, not grepped. A static scan can only rule on the call sites it knows how
// to resolve, and the writes that matter travel through helpers, injected `writeFile` options and
// spawned CLIs. `kernel-write-observer.js` is preloaded into a set of vehicle suites that drive
// the real production writers over real fixtures, and the resulting write stream is adjudicated.
// The relevant failure is not hypothetical: a kernel write that silently failed while the run
// reported `done` is a shipped defect this class of guard exists to catch.
//
// Run: node scripts/test-kernel-conformance.js        (~70s; the vehicles do real git work)
// Reuse an existing observation instead of re-running the vehicles:
//   KAOLA_KERNEL_CONFORMANCE_LOG=<path>  node scripts/test-kernel-conformance.js
// ---------------------------------------------------------------------------

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const schema = require('./kaola-workflow-adaptive-schema');
const observer = require('./kernel-write-observer');

const ROOT = path.resolve(__dirname, '..');
const REGISTRY = schema.KERNEL_ARTIFACT_REGISTRY;

let passed = 0;
function ok(value, message) { assert.ok(value, message); passed++; }
function equal(actual, expected, message) { assert.strictEqual(actual, expected, message); passed++; }
function deepEqual(actual, expected, message) { assert.deepStrictEqual(actual, expected, message); passed++; }

// ===========================================================================
// PART A — the ruling is well-formed.
// ===========================================================================

// The rows whose matcher is a broad band: they exist to catch what the named rows do not, so they
// MUST sit last. Named here by their source text so a reorder is a deliberate edit to this list.
const BROAD_BANDS = [
  '/^\\.cache\\/origin\\//',
  '/^\\.cache\\/[^/]+\\.(?:md|log|txt|json|jsonl|diff|patch)$/',
  '/^[^/]+\\.md$/',
];

function partA() {
  ok(REGISTRY.length >= 40, 'registry covers the artifact surface (' + REGISTRY.length + ' rows)');

  const seen = new Set();
  for (const row of REGISTRY) {
    equal(row.length, 5, 'row is a 5-tuple [matcher, ruling, record, writer, note]: ' + String(row[0]));
    const [matcher, ruling, record, writer, note] = row;
    const label = String(matcher);
    ok(!seen.has(label), 'no duplicate matcher: ' + label);
    seen.add(label);
    ok(schema.KERNEL_RULINGS.includes(ruling), 'ruling in the closed vocabulary: ' + label + ' -> ' + ruling);
    if (ruling === 'record') {
      ok(schema.KERNEL_RECORDS.includes(record),
        'a record row names WHICH of the four it is — a null owner is a fifth record wearing a label: ' + label);
    } else {
      equal(record, null, 'a non-record row owns no record: ' + label);
    }
    ok(writer === 'script' || writer === 'agent', 'writer is script|agent: ' + label);
    ok(typeof note === 'string' && note.trim().length >= 20,
      'every row carries its one-line justification — the derivation, the loss-safety argument, or the question it answers: ' + label);
  }

  // No row is shadowed by an earlier one. For a literal matcher this is exact; for a pattern it is
  // checked through a witness path the pattern generates. A shadowed row is a ruling that silently
  // never applies, which is how the first draft of this registry classified `findings-route.json`
  // (ruled derivable, matched by the evidence band three rows earlier) as an Evidence record.
  for (const [matcher, ruling, record] of REGISTRY) {
    const witness = (typeof matcher === 'string') ? matcher : witnessFor(matcher);
    if (witness === null) continue;
    const got = schema.classifyDurableArtifact(witness);
    equal(got.matcher, String(matcher), 'row is reachable, not shadowed: ' + String(matcher) + ' (witness ' + witness + ')');
    equal(got.ruling, ruling, 'witness carries the row ruling: ' + witness);
    equal(got.record, record, 'witness carries the row record owner: ' + witness);
  }

  const tail = REGISTRY.slice(-BROAD_BANDS.length).map(row => String(row[0]));
  deepEqual(tail, BROAD_BANDS, 'the broad bands are the LAST rows — otherwise they swallow named rulings');
}

// witnessFor — a concrete path a pattern row matches, so pattern rows are shadow-checked too.
// Returns null for a pattern with no registered witness (and PART A then fails on the coverage
// assertion below, rather than silently skipping the row).
const PATTERN_WITNESSES = {
  '/^\\.cache\\/epochs\\/[^/]+\\/manifest\\.json$/': '.cache/epochs/1/manifest.json',
  '/^\\.cache\\/committed-transactions\\/[^/]+\\.json$/': '.cache/committed-transactions/tx-1.json',
  '/^\\.cache\\/barrier-base-[^/]+$/': '.cache/barrier-base-n1',
  '/^\\.cache\\/barrier-open-[^/]+$/': '.cache/barrier-open-n1',
  '/^\\.cache\\/replan-sources\\/[^/]+\\.json$/': '.cache/replan-sources/a1.json',
  '/^\\.cache\\/review-contexts\\/[^/]+\\.json$/': '.cache/review-contexts/g1.json',
  '/^\\.cache\\/review-receipts\\//': '.cache/review-receipts/g1/r1.json',
  '/^\\.cache\\/review-claim-roots\\/[^/]+\\.json$/': '.cache/review-claim-roots/g1.json',
  '/^\\.cache\\/review-certifiers\\//': '.cache/review-certifiers/g1.json',
  '/^\\.cache\\/review-findings\\//': '.cache/review-findings/g1.json',
  '/^\\.cache\\/validation-vectors\\/[^/]+\\.json$/': '.cache/validation-vectors/v1.json',
  '/^\\.cache\\/epochs\\/[^/]+\\/files\\//': '.cache/epochs/1/files/workflow-plan.md',
  '/^\\.cache\\/epoch-projections\\//': '.cache/epoch-projections/owner-projection.json',
  '/^\\.cache\\/[a-z-]+-envelope\\.json$/': '.cache/orient-envelope.json',
  '/^phase[0-9]+-[a-z-]+\\.md$/': 'phase3-plan.md',
  '/^\\.cache\\/\\.cache\\//': '.cache/.cache/n1.md',
  '/^\\.cache\\/origin\\//': '.cache/origin/survey.md',
  '/^\\.cache\\/[^/]+\\.(?:md|log|txt|json|jsonl|diff|patch)$/': '.cache/n1-impl.md',
  '/^[^/]+\\.md$/': 'post-run-gap-audit-2026-06-09.md',
};
function witnessFor(matcher) {
  const witness = PATTERN_WITNESSES[String(matcher)];
  return witness === undefined ? null : witness;
}

function partAWitnessCoverage() {
  for (const [matcher] of REGISTRY) {
    if (typeof matcher === 'string') continue;
    ok(witnessFor(matcher) !== null,
      'every pattern row registers a witness path, so none escapes the shadow check: ' + String(matcher));
  }
}

// ===========================================================================
// PART B — the ruling is single-sourced.
// ===========================================================================

const CONTRACT_DOC = path.join(ROOT, 'docs', 'workflow-state-contract.md');
const RULING_HEADING = '## Layer-0 Durable-Artifact Ruling';

// parseRulingTable — read the prose ruling back out of the state contract. The doc is the human
// half of a two-sided single source, so it is PARSED, never merely eyeballed: a row edited in one
// place and not the other fails here.
function parseRulingTable(text) {
  const start = text.indexOf(RULING_HEADING);
  if (start < 0) return null;
  const after = text.slice(start + RULING_HEADING.length);
  const end = after.search(/\n## /);
  const section = end < 0 ? after : after.slice(0, end);
  const rows = [];
  for (const line of section.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed.slice(1, trimmed.endsWith('|') ? -1 : undefined)
      .split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|'));
    if (cells.length < 4) continue;
    if (/^-+$/.test(cells[0].replace(/[: ]/g, '-'))) continue;
    if (cells[0].toLowerCase() === 'artifact') continue;
    rows.push({
      matcher: cells[0].replace(/^`|`$/g, ''),
      ruling: cells[1],
      record: cells[2] === '—' ? null : cells[2],
      writer: cells[3],
    });
  }
  return rows;
}

function partB() {
  const text = fs.readFileSync(CONTRACT_DOC, 'utf8');
  const doc = parseRulingTable(text);
  ok(doc !== null, 'the state contract carries the "' + RULING_HEADING + '" section');
  const code = REGISTRY.map(([matcher, ruling, record, writer]) => ({
    matcher: String(matcher), ruling, record, writer,
  }));
  equal(doc.length, code.length, 'the prose ruling and the registry have the same number of rows');
  for (let i = 0; i < code.length; i++) {
    deepEqual(doc[i], code[i], 'ruling row ' + (i + 1) + ' agrees between the registry and the state contract');
  }
}

// ===========================================================================
// PART C — the ruling is total.
// ===========================================================================

// Artifacts that a project folder can hold which the ruling deliberately does NOT cover, with the
// reason. Kept tiny and explicit: an entry here is a hole in the four-record claim, so each one is
// a statement someone must defend, not a convenience.
const CORPUS_EXCLUDED = [
  // Directories are not artifacts; the files inside them are ruled individually.
];

// collectArchiveCorpus — every distinct project-relative artifact path a real archived run left in
// this repository. This is the corpus the ruling has to be total over: not a list someone typed,
// but what the workflow actually wrote, across ~350 archived runs.
function collectArchiveCorpus() {
  const archive = path.join(ROOT, 'kaola-workflow', 'archive');
  const corpus = new Set();
  let projects = [];
  try { projects = fs.readdirSync(archive, { withFileTypes: true }); } catch (_) { return corpus; }
  for (const project of projects) {
    if (!project.isDirectory()) continue;
    const base = path.join(archive, project.name);
    walk(base, base);
  }
  function walk(dir, base) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full, base); continue; }
      if (!entry.isFile()) continue;
      corpus.add(path.relative(base, full).split(path.sep).join('/'));
    }
  }
  return corpus;
}

// collectDeclaredArtifactNames — every artifact path the production scripts name as a literal.
// The archive corpus is historical; this is the FORWARD half, so an artifact introduced by a new
// feature and not yet present in any archived run still has to be ruled.
function collectDeclaredArtifactNames() {
  const names = new Set();
  const files = fs.readdirSync(path.join(ROOT, 'scripts'))
    .filter(name => /^kaola-workflow-[a-z0-9-]+\.js$/.test(name));
  for (const file of files) {
    const text = fs.readFileSync(path.join(ROOT, 'scripts', file), 'utf8');
    for (const m of text.matchAll(/['"]\.cache\/([A-Za-z0-9_.-]+)['"]/g)) names.add('.cache/' + m[1]);
    for (const m of text.matchAll(/^const [A-Z0-9_]*(?:NAME|MIRROR_NAME) = '([A-Za-z0-9_.-]+\.(?:json|jsonl|md|lock))';$/gm)) {
      names.add('.cache/' + m[1]);
    }
  }
  return names;
}

// Literal `.cache/...` strings that are NOT durable project artifacts: usage/help text, fixture
// paths in self-tests, and repo-level (not project-level) caches. Each is excluded by name.
const DECLARED_NOT_ARTIFACT = new Set([
  '.cache/release-receipt.jsonl',   // repo-level release journal at kaola-workflow/.cache/, not a project artifact
  '.cache/epochs',                  // a directory prefix used to build paths, not a file
  '.cache/attestation-removed.json',// self-test fixture name inside the adaptive-node --selftest block
  '.cache/conc.json', '.cache/serial.json', '.cache/t30-concurrent.json',
  '.cache/t30-serial.json', '.cache/t31.json',   // run-chains concurrency self-test fixtures
]);

function partC() {
  const archive = collectArchiveCorpus();
  const declared = collectDeclaredArtifactNames();

  // Non-vacuity: this suite must not pass because it looked at nothing.
  ok(archive.size >= 200, 'the archived-run corpus is real (' + archive.size + ' distinct artifact paths)');
  ok(declared.size >= 20, 'the declared-name corpus is real (' + declared.size + ' names)');

  const unclassified = [];
  for (const rel of archive) {
    if (CORPUS_EXCLUDED.includes(rel)) continue;
    if (schema.classifyDurableArtifact(rel).ruling === 'unclassified') unclassified.push('archive: ' + rel);
  }
  for (const rel of declared) {
    if (DECLARED_NOT_ARTIFACT.has(rel)) continue;
    if (schema.classifyDurableArtifact(rel).ruling === 'unclassified') unclassified.push('declared: ' + rel);
  }
  deepEqual(unclassified, [],
    'every durable artifact is ruled record / derivable / preference — an unclassified one inherits neither the atomic-write obligation nor resume coverage');

  // The corpus must also EXERCISE the ruling, not just avoid tripping it: a registry whose rows
  // never match anything real would pass the totality check above while ruling nothing.
  const hit = new Set();
  for (const rel of archive) hit.add(schema.classifyDurableArtifact(rel).matcher);
  ok(hit.size >= 15, 'the archived corpus exercises at least 15 distinct ruling rows (' + hit.size + ')');

  // And the two contested rows specifically: both are called AUTHORITATIVE in the state contract,
  // so their ruling is a substantive claim and it must be the one the registry actually returns.
  equal(schema.classifyDurableArtifact('.cache/review-attempts.json').ruling, 'record',
    'the review journal is ruled a record');
  equal(schema.classifyDurableArtifact('.cache/review-attempts.json').record, 'evidence',
    'the review journal is the Evidence record (the settled state of the review oracle)');
  equal(schema.classifyDurableArtifact('.cache/replan-transaction.json').ruling, 'record',
    'the re-plan transaction is ruled a record');
  equal(schema.classifyDurableArtifact('.cache/replan-transaction.json').record, 'plan',
    'the re-plan transaction is the Plan record (epoch lineage)');
}

// ===========================================================================
// PARTS D + E — the atomic-write obligation, observed.
// ===========================================================================

// The vehicles. Each drives the REAL production writers over real fixtures; together they cover
// the plan/position/evidence/forge bands, the mirror and archive copies, and the epoch-snapshot
// staging writer. They are run, not imported, so a spawned CLI is observed too.
const VEHICLES = [
  'test-commit-node.js',            // barrier baselines, ledger flips, plan/state writes
  'test-adaptive-handoff.js',       // freeze: plan, state, acceptance anchor
  'test-ledger-chain-tamper.js',    // the ledger chain journal
  'test-barrier-base-integrity.js', // re-plan epoch snapshot staging + transaction writes
  'test-sink-merge.js',             // forge journals, sink-staged evidence union
  'test-claim-hardening.js',        // the main<->worktree mirror and the archive copy
];

// The exempt classes. Default-ON: anything not listed here that writes a `record` path by a
// non-atomic route FAILS. Keyed by (file, api) rather than by line so an unrelated edit above the
// site cannot redden the suite, while a NEW non-atomic API in the same file still does.
//
// Every entry states why the atomicity argument is discharged some other way. "It is inconvenient"
// is not one of the reasons, and a torn write that is merely unlikely is not exempt: the classes
// below are the ones where a torn result is either impossible or re-derivable from a source that
// is still on disk.
const EXEMPT_CLASSES = ['atomic-helper-internal', 'exclusive-create-verified', 'mirror-copy',
  'append-only', 'outside-project-space', 'non-record-target', 'selftest-fixture'];

// Only THESE classes excuse an observed non-atomic write to a record path. The others are claims
// about WHERE a writer points — "it targets a derivable artifact", "it writes outside project
// space", "it is a self-test fixture" — and the whole value of observing the runtime is that such a
// claim can be falsified. Exempting them dynamically would make the ledger self-certifying: an
// entry saying "this pair never writes a record" would silence the evidence that it just did.
//
// Measured, on the first draft, which did exempt by (file, api) alone: de-atomizing the CLI's
// durable-write injection produced `workflow-plan.md <- writeFileSync at adaptive-node.js:16671` in
// the observation, and the suite still passed — the `non-record-target` entry for that same pair
// absorbed it. The mutation is now red.
const DYNAMIC_EXEMPT_CLASSES = ['exclusive-create-verified', 'mirror-copy', 'append-only'];

// Non-record artifacts that legitimately take the atomic replace anyway (see PART E).
const ATOMIC_SCOPE_EXEMPT = [
  {
    path: 'workflow-tasks.json',
    why: 'the re-plan epoch fork routes all 41 of its durable writes through one journaled primitive under an asserted transaction label; the task mirror is derivable, but writing it by a second, unjournaled route would put a fork-time write outside the transaction that has to resume it',
  },
];

const NON_ATOMIC_EXEMPT = [
  {
    file: 'kaola-workflow-adaptive-schema.js', api: 'writeFileSync', klass: 'atomic-helper-internal',
    why: 'the two writes are the atomic replace filling its own temp file through an fd, and the O_EXCL scheduler lock — the first IS the atomic path and the second targets a preference artifact',
  },
  {
    file: 'kaola-workflow-adaptive-schema.js', api: 'openSync', klass: 'atomic-helper-internal',
    why: 'the atomic replace creating its temp file, and the scheduler lock taking O_EXCL — neither opens a record path for in-place writing',
  },
  {
    file: 'kaola-workflow-adaptive-schema.js', api: 'renameSync', klass: 'atomic-helper-internal',
    why: 'the rename that COMPLETES the atomic replace; this is the obligation being met, not a bypass of it',
  },
  {
    file: 'kaola-workflow-replan.js', api: 'openSync', klass: 'exclusive-create-verified',
    why: 'epoch-snapshot staging and the transaction writers create a path that does not yet exist with O_EXCL, fsync it, and verify the bytes against a recorded digest before the manifest seals — a torn create fails snapshot_copy_verify_failed instead of replacing a live record',
  },
  {
    file: 'kaola-workflow-replan.js', api: 'writeFileSync', klass: 'exclusive-create-verified',
    why: 'the fd writes inside those O_EXCL create sequences; every durable replan mutation itself routes through durableWriteFile, which calls the atomic replace under an asserted transaction label',
  },
  {
    file: 'kaola-workflow-replan.js', api: 'writeSync', klass: 'exclusive-create-verified',
    why: 'the chunked fd write inside durableCreateExclusiveFile, fsynced and digest-verified before the transaction advances',
  },
  {
    file: 'kaola-workflow-replan.js', api: 'renameSync', klass: 'atomic-helper-internal',
    why: 'durableRename fsyncs the destination directory after the rename and fires its transaction failpoint — the journaled form of a rename, not an in-place write',
  },
  {
    file: 'kaola-workflow-adaptive-node.js', api: 'openSync', klass: 'exclusive-create-verified',
    why: 'the rotated repair-source history is written O_EXCL + fsync onto a fresh path and read back with a digest and byte-equality check before use; it never overwrites a live record',
  },
  {
    file: 'kaola-workflow-adaptive-node.js', api: 'writeFileSync', klass: 'non-record-target',
    why: 'the fd writes inside its own O_EXCL and temp-and-rename sequences, the derivable projections (run-progress, findings-route, the cached subcommand envelope), and two --selftest fixtures; no site writes a record path in place, which the observed half re-checks at runtime',
  },
  {
    file: 'kaola-workflow-adaptive-node.js', api: 'renameSync', klass: 'atomic-helper-internal',
    why: 'the rename completing the repair-source publish, and an injected rename option threaded into the mirror',
  },
  {
    file: 'kaola-workflow-adaptive-node.js', api: 'appendFileSync', klass: 'append-only',
    why: 'node-timings.jsonl and provenance-log.jsonl are preference artifacts whose writers swallow every error and whose readers report diagnostics, never verdicts',
  },
  {
    file: 'kaola-workflow-adaptive-node.js', api: 'copyFileSync', klass: 'mirror-copy',
    why: 'the injected copyFile option used by the idempotent project mirror, which copies from a source folder still on disk',
  },
  {
    file: 'kaola-workflow-claim.js', api: 'copyFileSync', klass: 'mirror-copy',
    why: 'the main<->worktree project mirror, the residue fold-in and the archive copy read from a source folder that is still on disk when they run, so a torn destination is re-derived by re-running the idempotent copy rather than lost',
  },
  {
    file: 'kaola-workflow-claim.js', api: 'writeFileSync', klass: 'outside-project-space',
    why: 'the worktree-diff salvage patch under kaola-workflow/archive/exports/ (not project state), and the capability fallback in writeFile taken only if the schema module fails to expose the atomic helper at all',
  },
  {
    file: 'kaola-workflow-claim.js', api: 'appendFileSync', klass: 'append-only',
    why: 'the dispatch-log.jsonl attestation backfill — a preference artifact whose consumer is warn-first',
  },
  {
    file: 'kaola-workflow-claim.js', api: 'renameSync', klass: 'atomic-helper-internal',
    why: 'the archive move renames the project DIRECTORY, which is atomic on the filesystem and is not a file write at all',
  },
  {
    file: 'kaola-workflow-sink-merge.js', api: 'copyFileSync', klass: 'mirror-copy',
    why: 'the sink-staged union copies only into paths that do not exist yet, from a staged worktree copy that outlives the step',
  },
  {
    file: 'kaola-workflow-sink-merge.js', api: 'writeFileSync', klass: 'outside-project-space',
    why: 'a cwd probe written only when KAOLA_WORKFLOW_DEBUG_CWD names a path, which is a diagnostic target outside any project folder',
  },
  {
    file: 'kaola-workflow-sink-pr.js', api: 'appendFileSync', klass: 'append-only',
    why: 'the PR URL/number lines appended to finalization-summary.md; an append cannot tear the prose already recorded, and the record it belongs to is agent-authored',
  },
  {
    file: 'kaola-workflow-sink-pr.js', api: 'writeFileSync', klass: 'outside-project-space',
    why: 'the repo-level adaptive config default, which is not project state',
  },
  {
    file: 'kaola-workflow-repair-state.js', api: 'renameSync', klass: 'non-record-target',
    why: 'renames the retired phase6-summary.md marker forward; both names are preference artifacts',
  },
  {
    file: 'kaola-workflow-roadmap.js', api: 'writeFileSync', klass: 'outside-project-space',
    why: 'the roadmap mirror and issue sources live at kaola-workflow/ and kaola-workflow/.roadmap/, outside every project folder — and are written through this file\'s own atomic replace regardless',
  },
  {
    file: 'kaola-workflow-roadmap.js', api: 'openSync', klass: 'outside-project-space',
    why: 'the same writer\'s temp create and its O_EXCL new-issue create, both outside project space',
  },
  {
    file: 'kaola-workflow-roadmap.js', api: 'renameSync', klass: 'atomic-helper-internal',
    why: 'the rename that completes this file\'s own copy of the atomic replace, which is how the roadmap mirror is published; the destination is outside project space in any case',
  },
  {
    file: 'kaola-workflow-run-chains.js', api: 'writeFileSync', klass: 'atomic-helper-internal',
    why: 'the fd write inside this file\'s own copy of the atomic replace, which is how chain-receipt.json is recorded',
  },
  {
    file: 'kaola-workflow-run-chains.js', api: 'openSync', klass: 'atomic-helper-internal',
    why: 'that same atomic replace creating its temp file with O_EXCL before the fsync-and-rename that publishes the receipt',
  },
  {
    file: 'kaola-workflow-run-chains.js', api: 'renameSync', klass: 'atomic-helper-internal',
    why: 'the rename that completes it — this is the atomic obligation being met for chain-receipt.json, not a bypass of it',
  },
  {
    file: 'kaola-workflow-task-mirror.js', api: 'writeFileSync', klass: 'non-record-target',
    why: 'workflow-tasks.json is ruled derivable — this very file is its derivation',
  },
  {
    file: 'kaola-workflow-classifier.js', api: 'writeFileSync', klass: 'outside-project-space',
    why: 'the repo-level adaptive config default, which is not project state',
  },
  {
    file: 'kaola-workflow-release.js', api: 'writeFileSync', klass: 'outside-project-space',
    why: 'CHANGELOG.md, package.json, README.md and the plugin manifests at the repository root',
  },
  {
    file: 'kaola-workflow-release.js', api: 'appendFileSync', klass: 'outside-project-space',
    why: 'the repo-level release receipt journal at kaola-workflow/.cache/, outside every project folder',
  },
];

// Residual, recorded rather than hidden: `mirror-copy` discharges the obligation by re-derivation,
// and the completeness gate that follows the archive copy checks EXISTENCE, not digest — so a copy
// torn by a crash is re-derivable but is not currently DETECTED as torn. Closing that means giving
// the archive gate a digest comparison; it is named here so the gap is a filed item, not folklore.

function exemptFor(file, api) {
  return NON_ATOMIC_EXEMPT.find(entry => entry.file === file && entry.api === api) || null;
}

// The dynamic gate: an observed non-atomic write to a record path is excused only by a ledger entry
// whose class is one where that is the expected, argued-for behavior.
function dynamicallyExempt(file, api) {
  const entry = exemptFor(file, api);
  return !!entry && DYNAMIC_EXEMPT_CLASSES.includes(entry.klass);
}

// ---------------------------------------------------------------------------
// The CLI vehicle, and why it is not optional.
//
// The suite vehicles above call the production FUNCTIONS in-process, and several of them inject
// their own `writeFile` test double. That exercises the logic but not the wiring: the CLI's own
// durable-write injection — the one line every ledger and plan write actually flows through in a
// real run — is only reached when the script is invoked as a process. Measured: de-atomizing that
// injection left every in-process vehicle green.
//
// So this drives the real `kaola-workflow-adaptive-node.js` CLI over a real git repository with a
// real frozen plan, as a spawned process, and the observer rides in through NODE_OPTIONS. With the
// same mutation planted it reports `workflow-plan.md <- writeFileSync`, which is the finding.
// ---------------------------------------------------------------------------
const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Kernel Conformance', GIT_AUTHOR_EMAIL: 'kernel@example.com',
  GIT_COMMITTER_NAME: 'Kernel Conformance', GIT_COMMITTER_EMAIL: 'kernel@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
};

function driveKernelCli(log) {
  const validator = require('./kaola-workflow-plan-validator');
  const env = Object.assign({}, process.env, GIT_ENV);
  const git = args => spawnSync('git', ['-C', repoRoot, ...args],
    { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] });

  const repoRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-kernel-cli-')));
  git(['init', '-b', 'main']);
  git(['config', 'user.name', 'Kernel Conformance']);
  git(['config', 'user.email', 'kernel@example.com']);
  git(['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(repoRoot, 'product.js'), 'module.exports = 1;\n');
  git(['add', '-A']); git(['commit', '-m', 'root']);
  git(['checkout', '-b', 'workflow/issue-777']);

  const project = 'issue-777';
  const projectDir = path.join(repoRoot, 'kaola-workflow', project);
  fs.mkdirSync(path.join(projectDir, '.cache'), { recursive: true });

  let plan = [
    '# Workflow Plan — ' + project, '', '## Meta', 'project: ' + project, 'plan_form: spine',
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
    '# Kaola-Workflow State', '', '## Project', 'name: ' + project, 'status: active', '',
    '## Current Position', 'phase: adaptive', 'phase_name: Adaptive', 'workflow_path: adaptive',
    'step: start', 'next_command: /kaola-workflow-plan-run ' + project,
    'next_skill: kaola-workflow-plan-run ' + project,
    '', '## Planning Evidence', 'plan_hash: ' + planHash, 'decision: auto-run',
    'risk: sensitivity=false blast_radius=false uncertain=false reasons=—',
    'first_node_id: impl', 'first_node_role: tdd-guide', '', '## Sink', 'branch: workflow/issue-777',
    'issue_number: 777', 'sink: merge', 'main_root: ' + repoRoot, 'session_marker: kernel-conformance',
    'claim_ts: 2026-07-28T00:00:00.000Z', 'worktree_path: ' + repoRoot, '',
  ].join('\n'));
  git(['add', '-A']); git(['commit', '-m', 'seed']);

  const cliEnv = Object.assign({}, env, {
    KAOLA_KERNEL_WRITE_LOG: log,
    NODE_OPTIONS: [process.env.NODE_OPTIONS || '', '--require',
      path.join(ROOT, 'scripts', 'kernel-write-observer.js')].filter(Boolean).join(' '),
  });
  for (const args of [['orient', '--project', project, '--json'],
                      ['open-next', '--project', project, '--json']]) {
    const result = spawnSync(process.execPath,
      [path.join(ROOT, 'scripts', 'kaola-workflow-adaptive-node.js'), ...args],
      { cwd: repoRoot, encoding: 'utf8', env: cliEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    ok(result.status === 0, 'CLI vehicle stays green under observation: ' + args[0]
      + (result.status === 0 ? '' : '\n' + String(result.stdout || '') + String(result.stderr || '')));
  }
}

function runVehicles() {
  const reuse = process.env.KAOLA_KERNEL_CONFORMANCE_LOG;
  if (reuse) return fs.readFileSync(reuse, 'utf8');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-kernel-conformance-'));
  const log = path.join(dir, 'writes.jsonl');
  fs.writeFileSync(log, '');
  driveKernelCli(log);
  for (const vehicle of VEHICLES) {
    const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts', vehicle)], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: Object.assign({}, process.env, {
        KAOLA_KERNEL_WRITE_LOG: log,
        NODE_OPTIONS: [process.env.NODE_OPTIONS || '', '--require', path.join(ROOT, 'scripts', 'kernel-write-observer.js')]
          .filter(Boolean).join(' '),
      }),
    });
    ok(result.status === 0, 'vehicle stays green under observation: ' + vehicle
      + (result.status === 0 ? '' : '\n' + String(result.stdout || '').slice(-2000) + String(result.stderr || '').slice(-2000)));
  }
  return fs.readFileSync(log, 'utf8');
}

function partDE(text) {
  const { paths, events } = observer.reduceObservedWrites(text);

  // Non-vacuity FIRST. An observation that saw nothing would pass every assertion below.
  ok(events.length >= 300, 'the observation is real (' + events.length + ' writes into project folders)');
  ok(paths.size >= 30, 'the observation spans the artifact surface (' + paths.size + ' distinct paths)');

  const records = [...paths.keys()].filter(rel => schema.classifyDurableArtifact(rel).ruling === 'record');
  ok(records.length >= 20, 'the observation covers the kernel itself (' + records.length + ' record paths written)');
  const owners = new Set(records.map(rel => schema.classifyDurableArtifact(rel).record));
  ok(owners.size >= 3, 'the observation covers at least three of the four records: ' + [...owners].sort().join(', '));

  // --- PART D: completeness. No production writer reaches a record path off the atomic path.
  const violations = [];
  for (const [rel, slot] of paths) {
    if (schema.classifyDurableArtifact(rel).ruling !== 'record') continue;
    for (const [api, frames] of slot.direct) {
      for (const frame of frames) {
        const file = frame.split(':')[0];
        if (dynamicallyExempt(file, api)) continue;
        violations.push(rel + ' <- ' + api + ' at ' + frame);
      }
    }
  }
  deepEqual(violations, [],
    'COMPLETENESS: every production write to one of the four records goes through the atomic replace, or through an exempt class that carries its reason');

  // --- PART E: scoping. The atomic replace is used ON the kernel, and not off it.
  //
  // What this catches is MIS-RULING. A production writer that reaches for the crash-safe replace is
  // saying the artifact is kernel-critical; if the ruling disagrees, one of the two is wrong. So a
  // non-record path taking the atomic path is a finding unless it is on the short list below with a
  // reason — being stricter than required is admissible, being silently stricter is not.
  const misscoped = [];
  for (const [rel, slot] of paths) {
    if (slot.atomic.size === 0) continue;
    const ruling = schema.classifyDurableArtifact(rel).ruling;
    if (ruling === 'record') continue;
    if (ATOMIC_SCOPE_EXEMPT.some(entry => entry.path === rel)) continue;
    misscoped.push(ruling + ' ' + rel + ' <- ' + [...slot.atomic].join(', '));
  }
  deepEqual(misscoped, [],
    'SCOPING: the crash-safe atomic replace is scoped to the four records — a derivable or preference artifact taking it is either mis-ruled or mis-written');

  for (const entry of ATOMIC_SCOPE_EXEMPT) {
    ok(typeof entry.why === 'string' && entry.why.length >= 60,
      'scoping exemption states why a non-record artifact legitimately takes the atomic path: ' + entry.path);
    ok(paths.has(entry.path),
      'scoping exemption still describes an observed write — a stale one covers the next mis-ruling: ' + entry.path);
    ok(schema.classifyDurableArtifact(entry.path).ruling !== 'record',
      'a scoping exemption is only meaningful for a NON-record artifact: ' + entry.path);
  }

  const atomicPaths = [...paths.values()].filter(slot => slot.atomic.size > 0).length;
  ok(atomicPaths >= 15, 'the scoping half is non-vacuous (' + atomicPaths + ' paths written through the atomic replace)');
}

// ===========================================================================
// PART F — the static surface ratchet.
//
// The observed halves adjudicate what the vehicles reach, which is most of the kernel but not all
// of it: some writers only fire inside long re-plan scenarios no vehicle can afford to run. So the
// ledger above is ALSO checked against the source, in both directions:
//
//   * every (file, non-atomic write API) pair present in the production scripts is in the ledger,
//     so a NEW non-atomic writer cannot appear without someone writing down why it is safe;
//   * every ledger entry still corresponds to a real call site, so an exemption cannot outlive the
//     code it excused and sit there covering the next writer that shows up in its place.
//
// Default-on, and tighten-only: this is the guard that would have caught the two writers fixed in
// the same change as this suite — a kernel Evidence record written with a plain writeFileSync.
// ===========================================================================

const WRITE_APIS = ['writeFileSync', 'appendFileSync', 'copyFileSync', 'createWriteStream',
  'renameSync', 'openSync', 'writeSync', 'truncateSync'];

// A write-intent openSync. `fs.openSync(p, 'r')` is a read and is not a write site. The flag is
// read from a string literal, or from an O_* constant expression; anything else counts as a write,
// so an obfuscated flag fails closed into the ledger rather than out of the audit.
function isWriteOpen(argText) {
  const literal = /^[^,]*,\s*(['"])([^'"]*)\1/.exec(argText);
  if (literal) return /[wa+]/.test(literal[2]);
  const constants = /^[^,]*,\s*((?:fs\.constants\.O_[A-Z]+\s*\|?\s*)+)/.exec(argText);
  if (constants) return /O_(?:WRONLY|RDWR|CREAT|APPEND|TRUNC)\b/.test(constants[1]);
  return true;
}

function collectWriteSurface() {
  const surface = new Map();       // file -> Set(api)
  const files = fs.readdirSync(path.join(ROOT, 'scripts'))
    .filter(name => /^kaola-workflow-[a-z0-9-]+\.js$/.test(name));
  for (const file of files) {
    const text = fs.readFileSync(path.join(ROOT, 'scripts', file), 'utf8');
    for (const api of WRITE_APIS) {
      // Both spellings of the module handle. `require('fs').writeFileSync(...)` is a real way to
      // introduce a writer without touching the file's imports, and an `fs\.` anchor misses it —
      // measured: a planted `require('fs').writeFileSync` in a production script passed the scan.
      const re = new RegExp('(?:^|[^A-Za-z0-9_$])(?:fs|fsp|fsSync|require\\((?:\'fs\'|"fs")\\))\\.'
        + api + '\\(([^)\\n]*)', 'gm');
      let match;
      while ((match = re.exec(text)) !== null) {
        if (api === 'openSync' && !isWriteOpen(match[1])) continue;
        if (!surface.has(file)) surface.set(file, new Set());
        surface.get(file).add(api);
      }
    }
  }
  return surface;
}

function partF() {
  const surface = collectWriteSurface();
  ok(surface.size >= 10, 'the static scan found the production write surface (' + surface.size + ' files)');

  const ledger = new Set(NON_ATOMIC_EXEMPT.map(entry => entry.file + ' ' + entry.api));

  const unledgered = [];
  for (const [file, apis] of surface) {
    for (const api of apis) {
      if (!ledger.has(file + ' ' + api)) unledgered.push(file + ' ' + api);
    }
  }
  deepEqual(unledgered.sort(), [],
    'every non-atomic write API in a production script is accounted for in the exempt ledger with a stated reason — an unledgered one is a writer nobody has ruled on');

  const dead = [];
  for (const entry of NON_ATOMIC_EXEMPT) {
    const apis = surface.get(entry.file);
    if (!apis || !apis.has(entry.api)) dead.push(entry.file + ' ' + entry.api);
  }
  deepEqual(dead.sort(), [],
    'every exempt-ledger entry still describes a real call site — a stale exemption is a hole nobody is looking at');

  for (const entry of NON_ATOMIC_EXEMPT) {
    ok(typeof entry.why === 'string' && entry.why.length >= 60,
      'exempt entry states why the atomicity argument is discharged another way: ' + entry.file + ' ' + entry.api);
    ok(EXEMPT_CLASSES.includes(entry.klass),
      'exempt entry names a known class: ' + entry.file + ' ' + entry.api + ' -> ' + entry.klass);
  }
}

// ===========================================================================

function main() {
  partA();
  partAWitnessCoverage();
  partB();
  partC();
  partF();
  const observation = runVehicles();
  partDE(observation);
  process.stdout.write('kernel conformance tests passed (' + passed + ' assertions)\n');
}

if (require.main === module) main();

module.exports = { driveKernelCli, parseRulingTable, NON_ATOMIC_EXEMPT, ATOMIC_SCOPE_EXEMPT, VEHICLES };
