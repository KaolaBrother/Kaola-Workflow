#!/usr/bin/env node
'use strict';

// test-forge-claim-rollback-scoping.js — what a FAILED claim's rollback is allowed to delete,
// per edition.
//
// TEST INFRASTRUCTURE ONLY. Nothing here is shipped, installed, or imported by a production script.
//
// > A failed claim must not delete anything the claim did not create.
//
// WHY PER EDITION. The four `claim.js` copies are HAND-PORTED, and this rollback lives in the
// diverging part of them. `validate-script-sync.js` compares only `scripts/<name>` against
// `plugins/kaola-workflow/scripts/<name>`, so the forge-renamed `kaola-<forge>-workflow-claim.js`
// is compared to nothing — it is in neither COMMON_SCRIPTS nor RENAME_NORMALIZED_FAMILIES. Mutating
// the root copy alone makes validate-script-sync exit 1; mutating root AND the github plugin makes
// it exit 0, and a gitlab-only or gitea-only regression is invisible to that check, to
// `edition-sync --check`, and to every export-superset guard. The walkthrough and
// `test-bundle-claim.js` pin this behaviour on canonical alone. So an incomplete four-copy fix
// ships silently unless a behavioural pin drives each edition's own CLI, which is what the
// EDITIONS table below exists to do — the same argument, and the same shape, as the sibling
// `scripts/test-forge-archive-scoping.js`.
//
// THE DEFECT. The claim's `fs.mkdirSync(dir)` is non-recursive, and its EEXIST arm falls through
// whenever the directory carries no workflow-state.md — the documented crash-orphan reclaim. A
// directory that was ALREADY on disk with content in it is therefore adopted on the same line, and
// the transaction's rollback was a single unscoped `fs.rmSync(dir, { recursive: true, force: true })`
// over the whole adopted tree. A claim that threw anywhere between adoption and the completed write
// deleted work nobody agreed to lose — under an ordinary project name, not only a reserved one, and
// on the bundle lane at exit 0 behind a routine `target_set_unavailable` answer.
//
// WHAT IS PINNED, AND WHAT IS NOT. The RESULT: content that predates the claim is still on disk,
// byte for byte. Nothing here reads a guard name, a refusal token or an error string, and the two
// faults are interchangeable stand-ins — the rollback does not inspect the error, so which one
// fires is immaterial to what it deletes.
//
// ...AND ITS OTHER HALF, which is why "delete nothing" is not the answer. Leg A drives the same
// fault over a directory the claim itself CREATED and requires it gone: a rollback that stops
// cleaning up has only traded lost data for orphaned folders, and an orphan with a half-written
// state file makes the NEXT claim read the folder as occupied. Leg A's created half is the liveness
// witness for its adopted half — if the fault ever stops firing, the claim SUCCEEDS and its own
// folder is still there afterwards, so the created half reds rather than the adopted half going
// quietly green.
//
// THE FAULT: `claim --project <p> --codex-dispatch-mode <value with a newline>` — a registered
// value flag that `cmdClaim` hands straight to `claimProject`, refused by writeState's
// anti-injection fence INSIDE the transaction. `cmdClaim` never sets `selectionRecordBytes`, so on
// this door NOTHING has been written when it throws — a shipped guard, not a planted one.
//
// ADR 0018 §5 RETIRED THREE OF THIS FILE'S FOUR LEGS. Legs B, C and D drove `startup
// --target-issue(s)` (the only door that reaches the "record written, then taken back out" branch,
// and the bundle lane), and all three reached classification only through a seeded
// `kaola-workflow/.roadmap/issue-N.md` as OFFLINE local evidence — the classifier's offline arm,
// itself retired as a named accepted loss. An OFFLINE claim for an issue with no active folder now
// always answers `target_unverified` before classification ever reaches the adopt-and-rollback
// code these legs drove; see the note where they stood, further down this file. Leg D's own
// built-in non-vacuity check is what caught this at the time of the retirement — it was written
// for precisely this failure shape: "a fixture that silently refused earlier reds instead of
// reading as nothing was destroyed."
//
// Usage
//   node scripts/test-forge-claim-rollback-scoping.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const G = require('./test-git-fixture');

// This box has no global `init.defaultBranch`, and the fixtures must not inherit whatever a
// developer's global config says about excludes, autocrlf or safe.directory either. Neutralised for
// the fixture git calls AND for the spawned CLI, which inherits this environment.
process.env.GIT_CONFIG_GLOBAL = '/dev/null';
process.env.GIT_CONFIG_SYSTEM = '/dev/null';

const repoRoot = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.error('FAIL: ' + msg); } }

const EDITIONS = Object.freeze([
  { key: 'canonical', label: 'claude/canonical', claim: 'scripts/kaola-workflow-claim.js' },
  { key: 'codex', label: 'codex', claim: 'plugins/kaola-workflow/scripts/kaola-workflow-claim.js' },
  { key: 'gitlab', label: 'gitlab', claim: 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js' },
  { key: 'gitea', label: 'gitea', claim: 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js' },
]);

// A newline in a durable field value. Passed as ONE argv element, so no shell quoting is involved.
const FAULT_CLAIM_DOOR = Object.freeze(['--codex-dispatch-mode', 'v2-task-name\ninjected']);
// The `startup`-door fault is the repo's own path (see the header), not an argument. No leg passes
// `newlineInPath` any more — legs B/C/D (the only `startup`-door legs) are retired, see the note
// where they stood — so this constant's only reference (in newRepo below) is now unreachable.
const NEWLINE_DIRNAME = 'repo\nsecond-line';

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

/**
 * A one-commit repo with a roadmap mirror. `opts.newlineInPath` puts the repo one level down, in a
 * directory whose NAME carries a newline — legal on this filesystem, and the whole of the
 * `startup`-door fault. `outer` is always the throwaway to remove afterwards.
 */
function newRepo(ed, tag, opts) {
  const outer = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw932-' + tag + '-' + ed.key + '-')));
  const root = (opts && opts.newlineInPath) ? path.join(outer, NEWLINE_DIRNAME) : outer;
  if (root !== outer) fs.mkdirSync(root);
  G.init(root, { branch: 'main' });
  fs.writeFileSync(path.join(root, 'README.md'), 'fixture\n');
  fs.writeFileSync(path.join(root, '.gitignore'), '.kw/\n');
  G.commitAll(root, 'init');
  return { root, outer };
}

/** Content that PREDATES the claim, inside the directory the claim will adopt. */
function seedFolder(root, project, files) {
  for (const [rel, body] of Object.entries(files)) {
    const f = path.join(root, 'kaola-workflow', project, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, body);
  }
}

/** Everything under a directory, as a sorted list of relative paths. */
function listTree(dir) {
  const out = [];
  (function walk(d, rel) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), r); else out.push(r);
    }
  })(dir, '');
  return out.sort();
}

/** The edition's own CLI, driven for real. */
function runClaim(ed, root, argv) {
  // spawn-class: cli-contract
  return spawnSync(process.execPath, [path.join(repoRoot, ed.claim), ...argv],
    { cwd: root, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
}

/** The claim envelope: the LAST JSON object on stdout. A throwing door emits none. */
function parseEnvelope(stdout) {
  const lines = String(stdout || '').split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line.startsWith('{')) continue;
    try { return JSON.parse(line); } catch (_) { /* keep looking */ }
  }
  return null;
}

const ctx = r => '\nexit: ' + r.status + '\nstdout: ' + String(r.stdout).trim()
  + '\nstderr: ' + String(r.stderr).trim();

/** The foreign content every leg plants. Nested, so a directory prune has something to get wrong. */
const FOREIGN = Object.freeze({
  'evidence.md': 'measurements a successor still needs\n',
  'notes/handoff.md': 'what the crashed run had figured out\n',
});

// ---------------------------------------------------------------------------
// The per-leg predicate: content that predates the claim is still there, byte for byte.
// ---------------------------------------------------------------------------
function assertForeignSurvived(tag, root, project, r) {
  const dir = path.join(root, 'kaola-workflow', project);
  assert(fs.existsSync(dir),
    tag + ' kaola-workflow/' + project + ' must still exist after a claim that failed — the claim '
      + 'did not create it' + ctx(r));
  for (const [rel, body] of Object.entries(FOREIGN)) {
    const f = path.join(dir, rel);
    assert(fs.existsSync(f),
      tag + ' the failed claim deleted kaola-workflow/' + project + '/' + rel
        + ' — a file it did not create' + ctx(r));
    assert(fs.existsSync(f) && fs.readFileSync(f, 'utf8') === body,
      tag + ' the failed claim altered kaola-workflow/' + project + '/' + rel + ctx(r));
  }
}

for (const ed of EDITIONS) {
  // =========================================================================================
  // LEG A — the same fault over a directory the claim CREATED and one it ADOPTED.
  // One door, one fault, one code path; the only variable is whether the folder was already
  // on disk. The created half is the control AND the liveness witness for the adopted half.
  // =========================================================================================
  {
    const tag = '#932[' + ed.label + '/A]';
    const { root, outer } = newRepo(ed, 'A');
    try {
      seedFolder(root, 'issue-9402', FOREIGN);
      G.commitAll(root, 'seed content the claim did not create');

      const createdDir = path.join(root, 'kaola-workflow', 'issue-9401');
      assert(!fs.existsSync(createdDir), tag + ' fixture: the created half starts with no folder');

      const created = runClaim(ed, root, ['claim', '--project', 'issue-9401', '--issue', '9401', ...FAULT_CLAIM_DOOR]);
      const adopted = runClaim(ed, root, ['claim', '--project', 'issue-9402', '--issue', '9402', ...FAULT_CLAIM_DOOR]);

      // (A1) THE CONTROL: what the claim MADE is still cleaned up. Green before the fix as well
      // as after — what it forbids is an answer to #932 that leaves orphans instead of data loss.
      // It is also this leg's liveness witness: a fault that stopped firing would let this claim
      // succeed, and the folder would still be here.
      assert(!fs.existsSync(createdDir),
        tag + ' a rollback must still remove the folder the claim itself created — '
          + 'kaola-workflow/issue-9401 is still there' + ctx(created));

      // (A2) THE DEMANDED RESULT: what the claim FOUND is untouched.
      assertForeignSurvived(tag, root, 'issue-9402', adopted);

      // (A3) ...and nothing was left inside it either. On THIS door `selectionRecordBytes` is
      // never set, so the transaction had written nothing at all when it threw; the adopted
      // folder must therefore be exactly what it was.
      const after = listTree(path.join(root, 'kaola-workflow', 'issue-9402'));
      assert(JSON.stringify(after) === JSON.stringify(Object.keys(FOREIGN).sort()),
        tag + ' the adopted folder must hold exactly what it held before — got '
          + JSON.stringify(after) + ctx(adopted));
    } finally { fs.rmSync(outer, { recursive: true, force: true }); }
  }

  // LEGS B, C, D stood here: the record-write-then-rollback case, the pre-existing-record
  // survival case, and the bundle lane's adopt-and-decline case. All three reached their adopt
  // code only through an OFFLINE `startup --target-issue(s)` call whose classification depended
  // on a seeded `kaola-workflow/.roadmap/issue-N.md` as local evidence. ADR 0018 §5 retired that
  // evidence path (the classifier's offline arm) as a named accepted loss: an OFFLINE claim for an
  // issue with no active folder now always answers target_unverified, before classification ever
  // reaches the adopt-and-rollback code these legs drove. Deleted with the mechanism that let them
  // reach their subject; leg A (the `claim --project` door, unaffected by the retirement) survives
  // below as the file's only remaining coverage of rollback scoping.

  console.log('#932[' + ed.label + '] claim rollback scoping: done');
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
