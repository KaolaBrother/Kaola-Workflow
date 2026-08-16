#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// test-forge-bundle-lane.js — the BUNDLE claim lane, DRIVEN on every edition.
//
// TEST INFRASTRUCTURE ONLY. Nothing here is shipped, installed, or imported by a production
// script.
//
// THE DEFECT THIS EXISTS FOR, measured. Both forge claim scripts once received the two
// `persistSelectionRecord` call sites but NOT the `opts` threading, so `claimExplicitBundle`
// never passed `selectionRecordBytes` down and both forge bundle lanes silently persisted
// NOTHING. Scalar lanes were correct; bundle lanes were dead. All four chains were green on that
// state, and it was found by comparing site counts across editions — `root 4 · codex 4 ·
// gitlab 3 · gitea 3` — not by any test. The fix restored correctness without adding a pin.
//
// A green forge chain certifies STRUCTURE, not behaviour. `test-bundle-claim.js` is root-only,
// and no forge walkthrough drives a bundle claim carrying a selection record. This is that
// oracle, and it is deliberately per-edition: a both-forges-at-once mutant is killed by covering
// either one, which is exactly how a sibling path stays unwitnessed.
//
// WHY THE READ-BACK IS THE ASSERTION, and an envelope check is not. `completeSelectionOrigin`
// stamps `selection_record_digest` onto the emitted claim REGARDLESS of whether the bytes were
// persisted — it stopped writing the record itself, and the write now lives inside the claim
// transaction. So under the dead-port shape the envelope carries a digest for a file that does
// not exist: a record that is complete, coherent and FALSE, which is the one thing a successor
// cannot route around. PART A therefore reads the persisted bytes back and compares them to what
// was authored; PART B pins the falsehood directly.
//
//   PART A — a bundle claim with a selection record, driven per edition, bytes READ BACK.
//   PART B — the contrast: no record ⇒ the canonical `none-recorded` substitute, different bytes.
//            Plus the envelope-digest-without-a-file falsehood, stated as an assertion.
//   PART C — cross-edition agreement: the same authored bytes yield the same persisted bytes and
//            the same digest in all four editions.
//
// ---------------------------------------------------------------------------
// MUTATION LOG — the acceptance criterion, per forge INDEPENDENTLY.
//
// Method: full-repo rsync to a scratch mirror, mutate the MIRROR, run from there (`git checkout
// --` is unusable — sibling agents hold uncommitted work in this tree). The mutation restores the
// pre-#862 shape: drop `selectionRecordBytes` from the opts `claimExplicitBundle` passes to
// `claimBundle`. TWO SEPARATE MUTANTS, one per forge, never both at once.
//
// Four mutants, four runs. Every one RED at 7 assertions, and — the property the issue actually
// asks for — every one reddened ONLY ITS OWN EDITION:
//
//   root alone   -> RED   editions that reddened: ["root"]
//   codex alone  -> RED   editions that reddened: ["codex"]
//   gitlab alone -> RED   editions that reddened: ["gitlab"]
//   gitea alone  -> RED   editions that reddened: ["gitea"]
//
// Verbatim first casualties (identical modulo the edition tag):
//   "<edition>: the selection record was PERSISTED at .cache/origin/selection-record.json —
//    this is the exact byte the dead port dropped"
//   "<edition>: the persisted selection record is BYTE-IDENTICAL to what the caller authored"
//   "<edition>: and those bytes hash to the expected digest"
//   "<edition>: the canonical substitute record was written in its place"
//
// That last one is worth reading twice: the dead port also dropped the `none-recorded`
// SUBSTITUTE, so a bundle claim carrying no record left no account of itself either. The defect
// was not "an authored record is lost" but "this lane writes no selection record at all".
//
// Mirror control green before and after. No mutant was ever applied to two editions at once,
// because a both-forges mutant is killed by covering either one — which is exactly how a sibling
// path stays unwitnessed.
//
// ---------------------------------------------------------------------------
// THE COUNT-RECONCILIATION ORACLE IS NOT BUILT, and the number is recorded so it is not
// re-proposed on a refuted premise.
//
// The hoped-for guard was: a cross-edition symbol count that must reconcile is a cheap oracle
// that a hand-port is COMPLETE, where reading the hunks only confirms what you believe you wrote.
// Measured over a mechanically-derived population — every identifier of >= 8 characters present
// in all four `claim.js` copies, so forge vocabulary is excluded by construction:
//
//     population 1695 · reconcile exactly 1429 · DIVERGE 266  (84.3% clean)
//
// A 266-entry exemption list on day one is a guard that ships disarmed. Worse, it cannot separate
// the defect from ordinary divergence: 238 of the 266 have root == codex && gitlab == gitea,
// which is EXACTLY the signature the real defect had (4 · 4 · 3 · 3). The shape that would have
// caught #862 is indistinguishable from 238 legitimate ports.
//
// A NARROW version over just the selection-record custody symbols IS quiet (all four reconcile
// today) — but it is an opt-in allowlist, so it only guards seams someone already thought of,
// which is the opposite of generalising to the next dead port. And for THIS seam it is now
// redundant: the behaviour is driven per edition below, which is a strictly stronger witness.
// ---------------------------------------------------------------------------
//
// Run: node scripts/test-forge-bundle-lane.js

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

// Git FIXTURE arrangement routes through the shared library — one process-boundary decision for
// the repo instead of one per line, and it keeps this file inside the spawn-classification budget.
const G = require('./test-git-fixture');

const REPO = path.resolve(__dirname, '..');
const BUNDLE_PROJECT = 'bundle-42-47';
const RECORD_RELPATH = path.join('.cache', 'origin', 'selection-record.json');

// EVERY edition, because every one of them is a hand-port that nothing executed on this lane.
// `mockEnv` is pointed at a HOSTILE script: if the claim ever shells the forge CLI under
// KAOLA_WORKFLOW_OFFLINE=1 the run fails loudly instead of quietly reaching the network.
const EDITIONS = Object.freeze([
  { name: 'root', claim: 'scripts/kaola-workflow-claim.js', mockEnv: 'KAOLA_GH_MOCK_SCRIPT' },
  { name: 'codex', claim: 'plugins/kaola-workflow/scripts/kaola-workflow-claim.js', mockEnv: 'KAOLA_GH_MOCK_SCRIPT' },
  { name: 'gitlab', claim: 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js', mockEnv: 'KAOLA_GLAB_MOCK_SCRIPT' },
  { name: 'gitea', claim: 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js', mockEnv: 'KAOLA_TEA_MOCK_SCRIPT' },
]);

// ONE authored record, shared by every edition — that is what makes PART C's cross-edition
// agreement meaningful. Serialized once and reused verbatim so "byte-identical" means bytes.
const RECORD_BYTES = JSON.stringify({
  selection_mode: 'explicit-target',
  targets: [42, 47],
  frontier: 'user-directed bundle',
  reasoning: 'the orchestrator selected this pair and recorded why',
}, null, 2) + '\n';
const RECORD_DIGEST = crypto.createHash('sha256').update(RECORD_BYTES).digest('hex');

const STDIO_Q = { stdio: ['ignore', 'ignore', 'ignore'] };
const GIT_ENV = {
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Forge Bundle', GIT_AUTHOR_EMAIL: 'f876@example.com',
  GIT_COMMITTER_NAME: 'Forge Bundle', GIT_COMMITTER_EMAIL: 'f876@example.com',
};

let passed = 0;
let failed = 0;
function assertThat(cond, message) { if (cond) { passed++; } else { failed++; console.error('FAIL: ' + message); } }
function equal(actual, expected, message) {
  assertThat(actual === expected, message + '\n  expected: ' + JSON.stringify(expected) + '\n  actual:   ' + JSON.stringify(actual));
}

// A hermetic HOME: the shared ~/.config/kaola-workflow/config.json (os.homedir()) is user-owned, so
// point HOME at a throwaway sandbox rather than let a spawned subprocess reach the developer's real
// one. Nothing is seeded — an absent config is the shape a fresh machine has.
const SANDBOX_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-fbl-home-'));

// The hostile forge shim. Reached only if something shells the forge CLI while offline; it exits
// non-zero and leaves a marker file, so hermeticity is PROVEN rather than assumed.
const HOSTILE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-fbl-hostile-'));
const HOSTILE_MARKER = path.join(HOSTILE_DIR, 'forge-was-called');
const HOSTILE_SHIM = path.join(HOSTILE_DIR, 'hostile-forge.js');
fs.writeFileSync(HOSTILE_SHIM,
  "'use strict';\nrequire('fs').writeFileSync(" + JSON.stringify(HOSTILE_MARKER)
  + ", process.argv.slice(2).join(' ') + '\\n');\n"
  + "process.stderr.write('hostile forge shim: the offline claim must not shell the forge CLI\\n');\n"
  + 'process.exit(97);\n');

// ADR 0018 §5 retired the classifier's OFFLINE local-roadmap-evidence read: OFFLINE + no active
// folder for the target now unconditionally answers target_unverified (both bundle members would
// refuse the claim with target_set_unverified, making every assertion below vacuous). Re-bootstrap
// through the same seam Job 1 (simulate-workflow-walkthrough.js's seedClassifierVerdictFromBody) uses:
// KAOLA_CLASSIFIER_MOCK_SCRIPT (#495, claim.js:1096-1101), which classifyIssue() spawns in place of
// the real classifier when set. Every scenario in this file wants the SAME answer for both bundle
// members (42 and 47) — an unconditional green, with no per-issue branching — so a static mock
// suffices; there is no delegate-when-unregistered need like the walkthrough's, since this file has
// no scenario that wants the REAL classifier's OFFLINE answer for anything.
const CLASSIFIER_MOCK_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-fbl-classifier-mock-'));
const CLASSIFIER_MOCK_SCRIPT = path.join(CLASSIFIER_MOCK_DIR, 'mock-classifier.js');
fs.writeFileSync(CLASSIFIER_MOCK_SCRIPT,
  "'use strict';\nprocess.stdout.write(JSON.stringify({ verdict: 'green', reasoning: 'no dependency block' }) + '\\n');\n"
  + 'process.exit(0);\n');

// KAOLA_CLASSIFIER_MOCK_SCRIPT is honoured by all four editions now: gitlab and gitea's
// `classifyIssue` spawns it too (kaola-{gitlab,gitea}-workflow-claim.js), the same shape canonical
// and codex already used, with the shipped in-process classify path left byte-identical behind an
// early return. Was a two-edition limit (root/codex only, tracked by a now-deleted
// `editionSupportsClassifierMock` helper) while gitlab/gitea classified in-process with no hook to
// redirect; the seam has since been ported into production for all four.

function cleanup(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* best-effort */ } }

// makeRepo — a real repository for the bundle claim to run in. ADR 0018 §5: this used to also seed
// `.roadmap/issue-N.md` for both bundle members — the classifier's retired OFFLINE local-evidence
// read that fed. No production code anywhere reads that file any more (in ANY of the four editions),
// so nothing plants it now; CLASSIFIER_MOCK_SCRIPT above is what makes OFFLINE classify answer green
// instead, for all four editions.
function makeRepo(tag) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-fbl-' + tag + '-')));
  G.init(root, { branch: 'main', email: GIT_ENV.GIT_AUTHOR_EMAIL, name: GIT_ENV.GIT_AUTHOR_NAME });
  G.git(root, ['config', 'commit.gpgsign', 'false'], STDIO_Q);
  fs.writeFileSync(path.join(root, 'README.md'), 'fixture\n');
  G.commitAll(root, 'seed', undefined, STDIO_Q);
  return root;
}

function runClaim(edition, root, args) {
  const env = Object.assign({}, process.env, GIT_ENV, {
    HOME: SANDBOX_HOME, USERPROFILE: SANDBOX_HOME,
    KAOLA_WORKFLOW_OFFLINE: '1',
    KAOLA_WORKTREE_NATIVE: '1',
    KAOLA_GH_REMOTE_TIMEOUT_MS: '500',
    KAOLA_CLASSIFIER_MOCK_SCRIPT: CLASSIFIER_MOCK_SCRIPT,
  });
  env[edition.mockEnv] = HOSTILE_SHIM;
  // The whole contract is at the process boundary: argv -> claim transaction -> files on disk ->
  // envelope -> exit code. An in-process call could not observe the persisted bytes the defect
  // silently dropped, which is the entire point of this suite.
  // spawn-class: cli-contract
  const r = spawnSync(process.execPath, [path.join(REPO, edition.claim)].concat(args), {
    cwd: root, encoding: 'utf8', timeout: 90000, env,
  });
  let json = null;
  try { json = JSON.parse(String(r.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{')).pop()); } catch (_) {}
  return { status: r.status, json, stdout: String(r.stdout || ''), stderr: String(r.stderr || '') };
}

function persistedRecordPath(root) {
  return path.join(root, 'kaola-workflow', BUNDLE_PROJECT, RECORD_RELPATH);
}
function readState(root) {
  try { return fs.readFileSync(path.join(root, 'kaola-workflow', BUNDLE_PROJECT, 'workflow-state.md'), 'utf8'); }
  catch (_) { return ''; }
}

// ===========================================================================
// PART A — the driven read-back, per edition.
// ===========================================================================

// claimWithRecord — returns everything the assertions need, so PART C can compare editions.
function claimWithRecord(edition) {
  const root = makeRepo(edition.name);
  try {
    const recordPath = path.join(root, 'selection-record-authored.json');
    fs.writeFileSync(recordPath, RECORD_BYTES);
    const r = runClaim(edition, root, ['startup', '--target-issues', '42,47',
      '--selection-record', recordPath, '--target-source', 'orchestrator_selected', '--json']);
    const dest = persistedRecordPath(root);
    return {
      status: r.status, json: r.json, stdout: r.stdout, stderr: r.stderr,
      exists: fs.existsSync(dest),
      bytes: fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : null,
      state: readState(root),
    };
  } finally { cleanup(root); }
}

function partDrivenReadBack(results) {
  for (const edition of EDITIONS) {
    const tag = edition.name + ': ';
    const out = results[edition.name];

    equal(out.status, 0, tag + 'the bundle claim exits 0\n' + out.stdout + out.stderr);
    assertThat(out.json && out.json.claim === 'acquired',
      tag + 'the bundle claim ACQUIRES — a non-acquiring claim persists nothing and would make '
      + 'every assertion below vacuous, got ' + JSON.stringify(out.json && out.json.claim)
      + '\n' + out.stdout + out.stderr);

    // THE ACCEPTANCE ASSERTION. Not "a file exists" — the BYTES, compared to what was authored.
    // Structure-green is precisely what failed here.
    assertThat(out.exists, tag + 'the selection record was PERSISTED at ' + RECORD_RELPATH
      + ' — this is the exact byte the dead port dropped');
    equal(out.bytes, RECORD_BYTES,
      tag + 'the persisted selection record is BYTE-IDENTICAL to what the caller authored');

    // THE BINDING. A digest that does not hash the persisted bytes is a receipt for another file.
    const digestOfPersisted = out.bytes == null ? null
      : crypto.createHash('sha256').update(out.bytes).digest('hex');
    equal(digestOfPersisted, RECORD_DIGEST, tag + 'and those bytes hash to the expected digest');
    equal(out.json && out.json.selection_record_digest, RECORD_DIGEST,
      tag + 'the emitted envelope carries the digest OF THE PERSISTED BYTES');

    // The durable half: a successor reads the digest out of state, not out of a dead envelope.
    assertThat(new RegExp('^selection_record_digest:\\s*' + RECORD_DIGEST + '\\s*$', 'm').test(out.state),
      tag + 'workflow-state.md stamps the same digest, so a zero-context successor can bind the '
      + 'record without the envelope — state was:\n' + out.state);

    // HERMETICITY, proven rather than assumed.
    assertThat(!fs.existsSync(HOSTILE_MARKER),
      tag + 'the offline claim never shelled the forge CLI (hostile shim was invoked with: '
      + (fs.existsSync(HOSTILE_MARKER) ? fs.readFileSync(HOSTILE_MARKER, 'utf8') : '') + ')');
  }
}

// ===========================================================================
// PART B — the contrast, and the falsehood the envelope alone would have hidden.
// ===========================================================================

function partSubstituteContrast() {
  for (const edition of EDITIONS) {
    const tag = edition.name + ': ';
    const root = makeRepo(edition.name + '-norecord');
    try {
      const r = runClaim(edition, root, ['startup', '--target-issues', '42,47',
        '--target-source', 'orchestrator_selected', '--json']);
      equal(r.status, 0, tag + 'a bundle claim with NO record still exits 0\n' + r.stdout + r.stderr);
      assertThat(r.json && r.json.claim === 'acquired',
        tag + 'and still ACQUIRES — a missing record is not a door, got ' + JSON.stringify(r.json && r.json.claim));

      const dest = persistedRecordPath(root);
      assertThat(fs.existsSync(dest), tag + 'the canonical substitute record was written in its place');
      const bytes = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : null;
      let parsed = null; try { parsed = JSON.parse(bytes); } catch (_) {}
      equal(parsed && parsed.selection_mode, 'none-recorded',
        tag + 'and it SAYS it recorded nothing rather than pretending, got ' + JSON.stringify(parsed && parsed.selection_mode));

      // NON-VACUITY FOR PART A. Without this, PART A's read-back could be passing against a file
      // that the claim would have written anyway — the two paths must produce DIFFERENT bytes.
      assertThat(bytes !== RECORD_BYTES,
        tag + 'the substitute bytes DIFFER from an authored record, so PART A is comparing against '
        + 'something only the authored path can produce');
    } finally { cleanup(root); }
  }
}

// THE FALSEHOOD, stated as an assertion rather than as a comment. `completeSelectionOrigin` stamps
// the digest onto the envelope whether or not the bytes were persisted, so an envelope-only check
// passes on a dead lane. This pins that the two are checked SEPARATELY — a future edit that made
// the envelope the sole witness would be exactly the regression #862 shipped.
function partEnvelopeIsNotTheWitness(results) {
  for (const edition of EDITIONS) {
    const out = results[edition.name];
    const tag = edition.name + ': ';
    assertThat(out.json && typeof out.json.selection_record_digest === 'string' && out.exists,
      tag + 'the envelope digest and the persisted file are asserted as TWO facts — the digest is '
      + 'stamped by a code path that does not write the file, so an envelope-only oracle reads '
      + 'green on a lane that persisted nothing');
  }
}

// ===========================================================================
// PART C — cross-edition agreement. A behavioural cross-edition oracle, which is what the
// refuted count oracle was reaching for: the same authored bytes must land identically and
// digest identically in every hand-port.
// ===========================================================================

function partCrossEditionAgreement(results) {
  const distinctBytes = new Set(EDITIONS.map(e => results[e.name].bytes));
  const distinctDigests = new Set(EDITIONS.map(e => results[e.name].json && results[e.name].json.selection_record_digest));
  equal(distinctBytes.size, 1,
    'ALL FOUR EDITIONS persist byte-identical selection records for the same authored bytes — got '
    + distinctBytes.size + ' distinct results across ' + EDITIONS.map(e => e.name).join(', '));
  equal(distinctDigests.size, 1,
    'and all four agree on the digest — got ' + JSON.stringify([...distinctDigests]));
  equal(EDITIONS.length, 4, 'NON-VACUITY: all four hand-ports are under test');
}

// ===========================================================================

function main() {
  const results = {};
  for (const edition of EDITIONS) results[edition.name] = claimWithRecord(edition);

  partDrivenReadBack(results);
  partSubstituteContrast();
  partEnvelopeIsNotTheWitness(results);
  partCrossEditionAgreement(results);

  cleanup(SANDBOX_HOME);
  cleanup(HOSTILE_DIR);

  if (failed) {
    console.error('\ntest-forge-bundle-lane: ' + failed + ' FAILED, ' + passed + ' passed');
    process.exit(1);
  }
  console.log('forge bundle lane: all ' + passed + ' assertions passed');
}

if (require.main === module) main();

module.exports = { EDITIONS, RECORD_BYTES, RECORD_DIGEST, makeRepo, runClaim, claimWithRecord };
