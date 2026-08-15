#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// Layer-0 kernel conformance — T1 (the kernel is exactly four records) and T2 (kernel writes
// are atomic), made checkable rather than asserted.
//
//   PART A — the ruling is WELL-FORMED. Closed vocabularies, an owner for every record row, no
//            row shadowed by an earlier pattern, the broad bands last. A shadowed row is a
//            ruling that silently never applies.
//   PART B — the ruling is SINGLE-SOURCED against `docs/workflow-state-contract.md`, which is
//            where a human reads which artifacts a successor may delete.
//   PART C — the ruling is TOTAL over the artifact names the production scripts declare. An
//            unclassified artifact inherits neither the atomic-write obligation nor resume
//            coverage. The second, EMPIRICAL corpus this used to check — what real archived runs
//            wrote — is gone; see the note above PART C for why, and what that costs.
//   PART D/E — the atomic-write obligation, both directions: no production script writes a
//            `record` path off the atomic replace, and the atomic replace is not used off the
//            kernel. OBSERVED, not grepped: the writes that matter travel through helpers,
//            injected `writeFile` options and spawned CLIs, so `kernel-write-observer.js` is
//            preloaded into vehicle suites that drive the real writers over real fixtures.
//            The failure class is not hypothetical — a kernel write that silently failed while
//            the run reported `done` is a shipped defect. Four of the six vehicles went with the
//            node executor; what that costs is named at the foot of PART E.
//   PART F — the static ratchet for writers no vehicle reaches.
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
  // Non-vacuity, DERIVED rather than a magic count: the ruling has to cover the whole closed
  // record vocabulary, so every one of the four records must be owned by at least one row. A
  // hard-coded row floor tracks whatever the registry happened to be the day it was written and
  // has to be edited down every time the artifact surface shrinks, which makes it evidence of
  // nothing.
  const owned = new Set(REGISTRY.filter(row => row[1] === 'record').map(row => row[2]));
  deepEqual([...owned].sort(), [...schema.KERNEL_RECORDS].sort(),
    'every one of the four records is owned by at least one registry row, and no row owns a fifth');
  ok(REGISTRY.length > owned.size,
    'the ruling covers more than the bare records — derivable and preference bands are ruled too ('
    + REGISTRY.length + ' rows)');

  const seen = new Set();
  for (const row of REGISTRY) {
    equal(row.length, 5, 'row is a 5-tuple [matcher, ruling, record, writer, note]: ' + String(row[0]));
    const [matcher, ruling, record, writer] = row;
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
  '/^\\.cache\\/validation-vectors\\/[^/]+\\.json$/': '.cache/validation-vectors/v1.json',
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
//
// THE EMPIRICAL HALF IS GONE, and it is worth saying why rather than letting a shorter function
// look like a tidy-up. Totality used to be checked over TWO corpora: what real archived runs
// actually wrote (~350 of them, empirical — "not a list someone typed"), and what the production
// scripts declare (forward-looking). Every archived run in this repository was produced by the
// node executor, and its artifacts — `barrier-base-*`, `barrier-open-*`, `workflow-tasks.json`,
// the epoch and review families — are exactly what the ruling stopped ruling when that machinery
// was deleted. Keeping the arm would mean either re-adding rows for machinery that is gone or
// hand-listing a hundred historical names, and either one turns the check into the typed list it
// exists to avoid. So only the forward half survives, and totality is no longer witnessed against
// anything a run really produced. It re-arms on its own the day a mission-list run archives.
// ===========================================================================

// collectDeclaredArtifactNames — every artifact path the production scripts name as a literal.
// The archive corpus is historical; this is the FORWARD half, so an artifact introduced by a new
// feature and not yet present in any archived run still has to be ruled.
//
// The character class MUST admit `/`. A nested artifact is declared one of two ways — as a whole
// nested literal (`.cache/origin/selection-record.json`) or as the band prefix its concrete path is
// concatenated from (`'.cache/aborted-transactions/' + id + '.json'`) — and a scanner whose class
// cannot match a slash sees NEITHER. Measured on the draft that excluded it: the journal-ahead
// durable record `replan abort` writes classified `unclassified`, in a suite that passed 654
// assertions, because the totality half could not see the band at all.
function collectDeclaredArtifactNames() {
  const names = new Set();
  const files = fs.readdirSync(path.join(ROOT, 'scripts'))
    .filter(name => /^kaola-workflow-[a-z0-9-]+\.js$/.test(name));
  for (const file of files) {
    const text = fs.readFileSync(path.join(ROOT, 'scripts', file), 'utf8');
    for (const m of text.matchAll(/['"]\.cache\/([A-Za-z0-9_./-]+)['"]/g)) names.add('.cache/' + m[1]);
    for (const m of text.matchAll(/^const [A-Z0-9_]*(?:NAME|MIRROR_NAME) = '([A-Za-z0-9_.-]+\.(?:json|jsonl|md|lock))';$/gm)) {
      names.add('.cache/' + m[1]);
    }
  }
  return names;
}

// literalHead — the fixed text every path a start-anchored pattern matches must begin with.
// `/^\.cache\/epochs\/[^/]+\/manifest\.json$/` -> `.cache/epochs/`. Reading stops at the first
// metacharacter, so the result is a sound prefix (it may be shorter than the true one, never longer)
// and an unanchored pattern yields '' — both directions fail CLOSED, into the audit rather than out.
function literalHead(matcher) {
  const src = matcher.source;
  if (!src.startsWith('^')) return '';
  let head = '';
  for (let i = 1; i < src.length; i++) {
    const ch = src[i];
    if (ch === '\\') {
      const next = src[i + 1];
      // Only a punctuation escape is a literal character; `\d`, `\w`, `\s` are classes.
      if (next === undefined || !/[.\/+*?^$(){}|[\]\\-]/.test(next)) break;
      head += next; i += 1; continue;
    }
    if ('[](){}.*+?|^$'.includes(ch)) break;
    head += ch;
  }
  return head;
}

// bandRowUnder — a registry row whose every match lies INSIDE `prefix`, or null. This is what
// discharges a declared band prefix: not "it is a directory, so it is not an artifact" (which
// excuses precisely the nested families the ruling has to cover), but a ruling anchored under it.
function bandRowUnder(prefix) {
  for (const [matcher] of REGISTRY) {
    const head = (typeof matcher === 'string') ? matcher : literalHead(matcher);
    if (head.startsWith(prefix)) return String(matcher);
  }
  return null;
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
  const declared = collectDeclaredArtifactNames();

  // The declared-name floor is DERIVED from the registry rather than typed: every literal
  // `.cache/…` row the ruling carries names an artifact some production script declares, so the
  // scan must find all of them. A hand-set count would have to be edited down every time the
  // artifact surface shrinks, which is exactly when a blind scanner would be hardest to notice.
  const literalCacheRows = REGISTRY
    .map(row => row[0])
    .filter(matcher => typeof matcher === 'string' && matcher.startsWith('.cache/'));
  const missed = literalCacheRows.filter(rel => !declared.has(rel));
  deepEqual(missed, [],
    'the declared-name scan finds every literal .cache/ artifact the ruling names — a scan that '
    + 'missed one is reading less of the source than the registry claims to rule');

  // Non-vacuity, NESTED half. The scan must actually reach below `.cache/`, or the totality claim
  // is total only over the flat band and every subdirectory family is silently exempt. Re-narrowing
  // the scanner's character class reddens HERE, at the cause, instead of at the next unruled band.
  const nestedNames = [...declared].filter(rel => rel.slice('.cache/'.length).includes('/'));
  ok(nestedNames.length >= 1,
    'the declared-name scan SEES nested artifact paths (' + nestedNames.length + ') — a scanner that cannot match a "/" is blind to every artifact under a subdirectory');
  // The BAND-PREFIX half has no witness left: every family whose concrete paths were built by
  // concatenation (`.cache/epochs/`, `.cache/committed-transactions/`, `.cache/replan-sources/`)
  // went with the machinery that wrote them. The discharge logic below still runs, so a band
  // reintroduced tomorrow is still checked — but nothing currently proves the scan can see one.

  const unclassified = [];
  for (const rel of declared) {
    if (DECLARED_NOT_ARTIFACT.has(rel)) continue;
    // A declared BAND prefix names a family whose concrete paths are built by concatenation, so
    // there is no literal file name to classify. It is discharged by a registry row anchored inside
    // the band — and by nothing else. `.cache/aborted-transactions/` is why: every sibling band
    // (`committed-transactions/`, `epochs/`, `replan-sources/`) carries such a row and it did not.
    if (rel.endsWith('/')) {
      if (!bandRowUnder(rel)) {
        unclassified.push('declared band: ' + rel + ' (no registry row is anchored under it)');
      }
      continue;
    }
    if (schema.classifyDurableArtifact(rel).ruling === 'unclassified') unclassified.push('declared: ' + rel);
  }
  deepEqual(unclassified, [],
    'every durable artifact is ruled record / derivable / preference — an unclassified one inherits neither the atomic-write obligation nor resume coverage');

  // The two contested rows this block used to pin — the review journal and the re-plan
  // transaction — were dedicated rows because the state contract called them AUTHORITATIVE. Both
  // the review oracle and the re-plan epoch machinery are retired, the contract no longer names
  // either, and neither has a row of its own any more. There is nothing contested left to pin.
}

// ===========================================================================
// PARTS D + E — the atomic-write obligation, observed.
// ===========================================================================

// The vehicles. Each drives the REAL production writers over real fixtures; together they cover
// the position/evidence/forge bands, the mirror and the archive copy. They are run, not imported,
// so a spawned CLI is observed too.
//
// FOUR VEHICLES WENT WITH THE NODE EXECUTOR — `test-commit-node.js`, `test-adaptive-handoff.js`,
// `test-ledger-chain-tamper.js` and `test-barrier-base-integrity.js`, plus a fifth vehicle this
// file drove itself (a spawned `kaola-workflow-adaptive-node.js` CLI over a frozen plan, which
// existed because the in-process vehicles injected their own writeFile doubles and never reached
// the CLI's own durable-write wiring). What they covered and nothing else now does is named at the
// foot of PART E.
const VEHICLES = [
  'test-sink-merge.js',             // forge journals, sink-staged evidence union
  'test-claim-hardening.js',        // the main<->worktree mirror and the archive copy
  'simulate-workflow-walkthrough.js', // claim/state/evidence writes end to end
];

// The exempt classes. Default-ON: anything not listed here that writes a `record` path by a
// non-atomic route FAILS. Keyed by (file, api) rather than by line, so an unrelated edit above the
// site cannot redden the suite while a NEW non-atomic API in the same file still does.
const EXEMPT_CLASSES = ['atomic-helper-internal', 'exclusive-create-verified', 'mirror-copy',
  'append-only', 'outside-project-space', 'non-record-target'];

// Only THESE classes excuse an OBSERVED non-atomic write to a record path — they are the ones
// where a torn result is impossible or re-derivable. The rest are claims about WHERE a writer
// points ("it targets a derivable artifact", "it writes outside project space"), and the whole
// value of observing the runtime is that such a claim can be falsified; exempting them
// dynamically would let an entry saying "this pair never writes a record" silence the evidence
// that it just did. Measured on the first draft, which exempted by (file, api) alone:
// de-atomizing the CLI's durable-write injection produced a `workflow-plan.md <- writeFileSync`
// observation that the `non-record-target` entry for that same pair absorbed, and the suite
// passed. That mutation is now red.
const DYNAMIC_EXEMPT_CLASSES = ['exclusive-create-verified', 'mirror-copy', 'append-only'];

// Non-record artifacts that legitimately take the atomic replace anyway (see PART E). Empty, and
// that is the tighter state: the one entry that stood here — `workflow-tasks.json`, the derivable
// task mirror written through the re-plan fork's journaled primitive — went with the task mirror
// and the re-plan machinery. With no exemptions, every non-record path taking the atomic replace
// is a finding.
const ATOMIC_SCOPE_EXEMPT = [];

const NON_ATOMIC_EXEMPT = [
  {
    file: 'kaola-workflow-adaptive-schema.js', api: 'writeFileSync', klass: 'atomic-helper-internal',
    why: 'the atomic replace filling its own temp file through an fd — this IS the atomic path, not a bypass of it',
  },
  {
    file: 'kaola-workflow-adaptive-schema.js', api: 'openSync', klass: 'atomic-helper-internal',
    why: 'the atomic replace creating its temp file — it does not open a record path for in-place writing',
  },
  {
    file: 'kaola-workflow-adaptive-schema.js', api: 'renameSync', klass: 'atomic-helper-internal',
    why: 'the rename that COMPLETES the atomic replace; this is the obligation being met, not a bypass of it',
  },
  {
    file: 'kaola-workflow-adaptive-schema.js', api: 'appendFileSync', klass: 'append-only',
    why: 'appendOutcomeRecord writing outcome-log.jsonl — a parent-owned run sidecar ruled preference, whose writer swallows every error and whose reader reports a diagnostic, never a verdict. It moved into this file when the module that used to host it was deleted, and this ledger row moved with it',
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

function runVehicles() {
  const reuse = process.env.KAOLA_KERNEL_CONFORMANCE_LOG;
  if (reuse) return fs.readFileSync(reuse, 'utf8');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-kernel-conformance-'));
  const log = path.join(dir, 'writes.jsonl');
  fs.writeFileSync(log, '');
  for (const vehicle of VEHICLES) {
    // Each vehicle runs under the --require write observer, which can only see writes made by
    // a real process. The whole atomic-write obligation is a claim about what lands on disk
    // when a process exits, so observing it in-process would beg the question.
    // spawn-class: durable-handoff
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
  //
  // NODE'S OWN DELEGATION IS NOT A SECOND CALL SITE. `fs.appendFileSync` calls `fs.writeFileSync`
  // internally with an append flag, so the observer — which patches both — records ONE append as
  // two events at the SAME production frame. Adjudicating the delegated `writeFileSync` separately
  // turns every append onto a record path into a violation the ledger cannot excuse, because the
  // frame's `writeFileSync` row carries a different class than its `appendFileSync` row. Measured:
  // `finalization-summary.md <- writeFileSync at kaola-workflow-sink-pr.js:108`, where line 108 is
  // an `appendFileSync` and there is no `writeFileSync` in that function at all. This never fired
  // before only because no observed append targeted a `record` path.
  const violations = [];
  for (const [rel, slot] of paths) {
    if (schema.classifyDurableArtifact(rel).ruling !== 'record') continue;
    const appendFrames = slot.direct.get('appendFileSync') || new Set();
    for (const [api, frames] of slot.direct) {
      for (const frame of frames) {
        if (api === 'writeFileSync' && appendFrames.has(frame)) continue;
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
    ok(paths.has(entry.path),
      'scoping exemption still describes an observed write — a stale one covers the next mis-ruling: ' + entry.path);
    ok(schema.classifyDurableArtifact(entry.path).ruling !== 'record',
      'a scoping exemption is only meaningful for a NON-record artifact: ' + entry.path);
  }

  // Non-vacuity for the scoping half, by WITNESS rather than by count. The position record is
  // written through `writeFileAtomicReplace` on every claim, so an observation in which it never
  // took the atomic path did not reach the writers at all — and a bare count would go on passing
  // as the observed surface shrinks, which is exactly when a blind observation is hardest to spot.
  const atomicPathList = [...paths.entries()].filter(([, slot]) => slot.atomic.size > 0).map(([rel]) => rel);
  ok(atomicPathList.includes('workflow-state.md'),
    'the scoping half is non-vacuous: the position record was observed taking the atomic replace ('
    + atomicPathList.length + ' atomic paths: ' + atomicPathList.sort().join(', ') + ')');
}

// ---------------------------------------------------------------------------
// WHAT THE OBSERVED HALVES NO LONGER REACH, named so it is a known gap rather than a silence.
//
// Four vehicles and one in-file CLI driver went with the node executor. The writers they were the
// only observers of:
//
//   * the barrier baselines and the ledger flip (`test-commit-node.js`) — the writers themselves
//     are gone, so nothing is uncovered here;
//   * the freeze transaction's plan / state / acceptance-anchor writes (`test-adaptive-handoff.js`)
//     — gone with the freeze chain;
//   * the ledger-chain journal (`test-ledger-chain-tamper.js`) — gone with the ledger;
//   * the re-plan epoch snapshot staging and its transaction writers
//     (`test-barrier-base-integrity.js`) — gone with the epochs;
//   * the SPAWNED-CLI wiring itself (the in-file `driveKernelCli`). This is the one that is NOT
//     merely gone with its subject. Its argument was that in-process vehicles inject their own
//     `writeFile` doubles and therefore never reach a CLI's own durable-write injection — measured,
//     de-atomizing that injection left every in-process vehicle green. That argument still holds
//     for `kaola-workflow-claim.js`, and no surviving vehicle drives a CLI whose durable writes are
//     observed under the preload. PART F's static ratchet is what stands in its place, and a static
//     ratchet is exactly what the observed halves exist because grep cannot do.
// ---------------------------------------------------------------------------

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
  // Non-vacuity, DERIVED: a scan that found nothing would satisfy the `unledgered` half below by
  // measuring nothing at all. The one file guaranteed by construction to carry write APIs is the
  // one that OWNS the atomic replace — a scanner that cannot see it is blind, not clean. The
  // `dead` half then covers the rest: every ledger entry must still be found by this same scan.
  ok(surface.has('kaola-workflow-adaptive-schema.js'),
    'the static scan reaches the file that owns the atomic replace ('
    + surface.size + ' files scanned)');

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

module.exports = { parseRulingTable, NON_ATOMIC_EXEMPT, ATOMIC_SCOPE_EXEMPT, VEHICLES };
