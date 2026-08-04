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
// state file makes the NEXT claim read the folder as occupied. Leg B requires the same of the two
// artifacts the transaction writes INTO an adopted folder.
//
// NON-VACUITY IS MECHANICAL, never a claim in a comment:
//   * leg A's created half is the liveness witness for its adopted half — if a fault ever stops
//     firing, the claim SUCCEEDS and its own folder is still there afterwards, so the created half
//     reds rather than the adopted half going quietly green;
//   * leg B runs the SAME fixture twice, once WITHOUT the fault, and asserts the selection record
//     really is written into the adopted folder on that door — otherwise "the record was removed"
//     is unfalsifiable;
//   * the bundle leg asserts the run reached the bundle project and declined to acquire it, so a
//     fixture that silently refused earlier (classifier drift, roadmap-source rename) reds instead
//     of reading as "nothing was destroyed".
//
// THREE FAULTS, all shipped guards or ordinary I/O errors, none planted in production code. Which
// one a leg uses is decided by WHERE in the transaction it has to fire, and each was A/B'd against
// a reverted tree before being relied on — a fault that turns out to fire before the adoption makes
// every survival assertion behind it true for a reason that has nothing to do with the rollback.
//
//   * `claim --project <p> --codex-dispatch-mode <value with a newline>` — a registered value flag
//     that `cmdClaim` hands straight to `claimProject` (only `cmdStartup` strips it), refused by
//     writeState's anti-injection fence INSIDE the transaction. `cmdClaim` never sets
//     `selectionRecordBytes`, so on this door NOTHING has been written when it throws.
//   * a repo whose own PATH contains a newline, claimed through `startup` — writeState resolves
//     `main_root` from the root it was handed and puts it through the same fence, and `cmdStartup`
//     DOES set `selectionRecordBytes`, so the selection record has already been written into the
//     adopted folder when this one fires. It is the only fault reaching the "record written, then
//     taken back out" branch from a shipped entry point: `--codex-dispatch-mode` is stripped on
//     this door, and `--branch` with a newline never gets near the transaction — `assertSafeBranchArg`
//     puts the branch through the fence at the front door, before the mkdir, with zero mutation.
//   * `<project>/.cache` planted as a regular FILE, so the record write hits ENOTDIR — the bundle
//     lane's fault, since that lane runs only through `cmdStartup` and its branch is derived rather
//     than supplied. Permissions are left untouched, so the rollback that follows is fully able to
//     delete and survival is the code's choice rather than the filesystem's.
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
// The `startup`-door fault is the repo's own path (see the header), not an argument.
const NEWLINE_DIRNAME = 'repo\nsecond-line';

const RECORD_REL = path.join('.cache', 'origin', 'selection-record.json');

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

/** The roadmap source the claim resolves its project name from. */
function seedRoadmap(root, issue) {
  const dir = path.join(root, 'kaola-workflow', '.roadmap');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'issue-' + issue + '.md'), [
    'issue: #' + issue,
    'title: the claimed issue',
    'status: open',
    'workflow_project: —',
    'next_step: ready',
    ''
  ].join('\n'));
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

  // =========================================================================================
  // LEG B — the record is WRITTEN into the adopted folder, and then taken back out.
  // The `startup` door sets selectionRecordBytes, so persistSelectionRecord has already written
  // `.cache/origin/selection-record.json` inside the adopted folder by the time the fault fires.
  // This is the branch no canonical-only test reaches: both walkthrough scenarios fault BEFORE
  // the write. Two runs on the same fixture shape — one without the fault — because "the record
  // was removed" is unfalsifiable unless the record is known to have been written.
  //
  // The two repos differ in exactly one thing: the faulted one lives one directory deeper, under a
  // name carrying a newline. That is the fault (see the header).
  // =========================================================================================
  {
    const tag = '#932[' + ed.label + '/B]';
    const control = newRepo(ed, 'Bc');
    const faulted = newRepo(ed, 'Bf', { newlineInPath: true });
    try {
      for (const fx of [control, faulted]) {
        seedRoadmap(fx.root, 9410);
        seedFolder(fx.root, 'issue-9410', FOREIGN);
        G.commitAll(fx.root, 'seed content the claim did not create');
      }

      // (B1) THE WITNESS: on this door, and with no fault, the record really is written into the
      // adopted folder. Without this the removal assertion below could not fail.
      const ok = runClaim(ed, control.root, ['startup', '--target-issue', '9410']);
      assert(fs.existsSync(path.join(control.root, 'kaola-workflow', 'issue-9410', RECORD_REL)),
        tag + ' WITNESS: an unfaulted claim on this door must write ' + RECORD_REL + ' into the '
          + 'adopted folder, or "the record was removed" below is unfalsifiable' + ctx(ok));

      const r = runClaim(ed, faulted.root, ['startup', '--target-issue', '9410']);
      const dir = path.join(faulted.root, 'kaola-workflow', 'issue-9410');

      // (B2) THE DEMANDED RESULT.
      assertForeignSurvived(tag, faulted.root, 'issue-9410', r);

      // (B3) ...and the transaction took its OWN artifacts with it, directories included. A
      // half-written state file or an orphaned `.cache` in a folder the claim disowned is the
      // other half of the same contract: the next claim reads a folder with a state file as
      // occupied. Stated as the folder's whole content, so a partial cleanup cannot pass.
      const after = listTree(dir);
      assert(JSON.stringify(after) === JSON.stringify(Object.keys(FOREIGN).sort()),
        tag + ' the adopted folder must hold exactly what it held before — the claim\'s own '
          + 'artifacts go with it and the directories it made are pruned; got '
          + JSON.stringify(after) + ctx(r));
    } finally {
      fs.rmSync(control.outer, { recursive: true, force: true });
      fs.rmSync(faulted.outer, { recursive: true, force: true });
    }
  }

  // =========================================================================================
  // LEG C — a selection record that was ALREADY THERE is not the transaction's to remove.
  // The sharpest reading of the sentence, at file granularity rather than folder granularity:
  // the rollback must tell its own artifact apart from one of the same name it found.
  // =========================================================================================
  {
    const tag = '#932[' + ed.label + '/C]';
    const { root, outer } = newRepo(ed, 'C', { newlineInPath: true });
    try {
      seedRoadmap(root, 9420);
      seedFolder(root, 'issue-9420', Object.assign({}, FOREIGN, {
        [RECORD_REL]: '{"note":"a record from an earlier run"}\n',
      }));
      G.commitAll(root, 'seed content the claim did not create');

      const r = runClaim(ed, root, ['startup', '--target-issue', '9420']);
      const dir = path.join(root, 'kaola-workflow', 'issue-9420');

      assertForeignSurvived(tag, root, 'issue-9420', r);
      assert(fs.existsSync(path.join(dir, RECORD_REL)),
        tag + ' a selection record that predates the claim must survive the rollback — the '
          + 'transaction may only take back the one it wrote itself; folder now holds '
          + JSON.stringify(listTree(dir)) + ctx(r));
      for (const d of ['.cache', path.join('.cache', 'origin')]) {
        assert(fs.existsSync(path.join(dir, d)),
          tag + ' kaola-workflow/issue-9420/' + d + ' predates the claim and must not be pruned'
            + ctx(r));
      }

      // The record's BYTES are deliberately not pinned. `persistSelectionRecord` is an
      // unconditional write — "the record is the authority, so a staged file of the same name
      // never wins" — so a claim over this fixture that SUCCEEDS leaves the new run's bytes too.
      // The overwrite is the shipped transaction's on every path, not the rollback's, and #932 is
      // about what a failed claim DELETES.
    } finally { fs.rmSync(outer, { recursive: true, force: true }); }
  }

  // =========================================================================================
  // LEG D — the bundle lane. Its project name is a computed `bundle-<targets>` literal, so it can
  // never be a reserved directory and no name-based guard reaches it; the adopted-folder case is
  // the only shape it has. It also runs only through `cmdStartup`, which strips the first fault's
  // flag — hence the third stand-in, `<project>/.cache` planted as a regular FILE.
  // =========================================================================================
  {
    const tag = '#932[' + ed.label + '/D]';
    const { root, outer } = newRepo(ed, 'D');
    const project = 'bundle-9430-9431';
    try {
      seedRoadmap(root, 9430);
      seedRoadmap(root, 9431);
      seedFolder(root, project, FOREIGN);
      G.commitAll(root, 'seed content the claim did not create');
      const dir = path.join(root, 'kaola-workflow', project);
      assert(!fs.existsSync(path.join(dir, 'workflow-state.md')),
        tag + ' fixture: the adopted folder carries no state file, which is what makes the claim '
          + 'adopt it rather than conflict');
      fs.writeFileSync(path.join(dir, '.cache'), 'not a directory\n');

      const r = runClaim(ed, root, ['startup', '--target-issues', '9430,9431']);
      const env = parseEnvelope(r.stdout);

      // NON-VACUITY. This lane destroys at EXIT 0 behind a routine `target_set_unavailable`
      // answer, so the envelope is no evidence about the files — but it is evidence that the run
      // got as far as the name those files sit under. Deriving the bundle project is the last step
      // before the mkdir and is downstream of every pre-mutation refusal, so a fixture that
      // silently stopped earlier reds here instead of reading as "nothing was destroyed".
      assert(env !== null && env.project === project && env.claim !== 'acquired',
        tag + ' NON-VACUITY: the run must reach this bundle project and not acquire it, got '
          + JSON.stringify(env && { project: env.project, claim: env.claim }) + ctx(r));

      assertForeignSurvived(tag, root, project, r);
    } finally { fs.rmSync(outer, { recursive: true, force: true }); }
  }

  console.log('#932[' + ed.label + '] claim rollback scoping: done');
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
