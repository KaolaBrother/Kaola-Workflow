#!/usr/bin/env node
'use strict';

// A relative TMPDIR/TMP/TEMP resolves against the CURRENT DIRECTORY: `os.tmpdir()` returns the
// value VERBATIM, so every fixture root this process or its children build — the HOME sandboxes
// created at MODULE LOAD included — would land in the checkout, and a measured full run under
// `TMPDIR=.` modified a tracked file (and left a new untracked artifact) under
// kaola-workflow/archive/ before failing (#976).
// Normalised HERE, first, because nothing loaded earlier can do it. Absolute-or-/tmp is the
// established shape (tmpBase() in test-install-all.js, KW_TMPDIR in install-all.sh); the two
// look-alike idioms are measured dead — realpathSync(mkdtempSync(…)) absolutises the STRING
// after the directory already landed in the cwd, and path.resolve of a relative TMPDIR IS the
// cwd. Children inherit the normalised value, so one statement covers the whole process tree;
// scripts/test-relative-tmpdir-escape.js pins the result for the root walkthrough.
for (const k of ['TMPDIR', 'TMP', 'TEMP']) {
  if (process.env[k] && !require('path').isAbsolute(process.env[k])) process.env[k] = '/tmp';
}

// Advisory spawn census. Installed BEFORE the child_process destructure below so the
// counted wrappers are what this file (and anything it requires) binds. Pass-through and
// fail-open: it can change no assertion and fail no run.
const spawnCensus = require('./test-spawn-census');
// Git FIXTURE arrangement routes through the shared library — one process-boundary
// decision for the repo instead of one per line. See scripts/test-git-fixture.js.
const G = require('./test-git-fixture');
spawnCensus.install('simulate-workflow-walkthrough');

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync, execFileSync } = require('child_process');

// Hermetic HOME — the shared ~/.config/kaola-workflow/config.json (os.homedir()) is user-owned and
// read live by the PR sink. Point HOME/USERPROFILE (os.homedir() honors whichever the platform uses)
// at a throwaway sandbox so no spawned subprocess reads or writes the developer's real one. Nothing
// is seeded: an absent config is the shape a fresh machine has, and every reader defaults from it.
const kwSandboxHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sandbox-home-'));
process.env.HOME = kwSandboxHome;
process.env.USERPROFILE = kwSandboxHome;

const repoRoot = path.resolve(__dirname, '..');
const claimScript = path.join(repoRoot, 'scripts', 'kaola-workflow-claim.js');
const sinkMergeScript = path.join(repoRoot, 'scripts', 'kaola-workflow-sink-merge.js');
const sinkPrScript = path.join(repoRoot, 'scripts', 'kaola-workflow-sink-pr.js');
const activeFoldersScript = path.join(repoRoot, 'scripts', 'kaola-workflow-active-folders.js');
const closureAuditScript = path.join(repoRoot, 'scripts', 'kaola-workflow-closure-audit.js');
const runChainsScript = path.join(repoRoot, 'scripts', 'kaola-workflow-run-chains.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runNode(script, args, cwd, extraEnv, opts) {
  // Scrub inherited KAOLA_* vars from the parent shell — tests supply their own.
  const baseEnv = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('KAOLA_'))
  );
  // #984/ADR 0018: KAOLA_CLASSIFIER_MOCK_SCRIPT is the one KAOLA_* var this scrub must not drop — it
  // is the seam seedClassifierVerdictFromBody's OFFLINE bootstrap depends on (see classifierMockScript below,
  // near seedClassifierVerdictFromBody). Re-added ahead of extraEnv so a caller supplying its own mock still wins.
  baseEnv.KAOLA_CLASSIFIER_MOCK_SCRIPT = classifierMockScript;
  // Git isolation: prevent developer gpgsign/hooksPath from breaking fixture commits.
  baseEnv.GIT_CONFIG_GLOBAL = '/dev/null';
  baseEnv.GIT_CONFIG_NOSYSTEM = '1';
  // The timeout is a HANG guard, not an assertion. It scales with KAOLA_TEST_TIMEOUT_SCALE so a
  // runner that puts this suite under concurrent load can widen the guard rather than take a false
  // red. Nothing exports that variable since the within-chain step pool was retired (#960), and the
  // read is fail-open, so the scale is 1 and the original bound holds exactly.
  const timeoutScale = Math.max(1, Number(process.env.KAOLA_TEST_TIMEOUT_SCALE) || 1);
  const timeout = ((opts && opts.timeout != null) ? opts.timeout : 120000) * timeoutScale;
  // Every adaptive-lifecycle scenario drives this helper as a CHAIN of separate CLI
  // processes: one writes the ledger row, the barrier baseline and the .cache evidence
  // and EXITS; the next re-derives the entire run from those bytes with no shared heap.
  // That re-derivation is the assertion, so collapsing it in-process deletes it.
  // spawn-class: durable-handoff
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: 'utf8',
    timeout,
    // opts.input feeds STDIN (the --stdin transit used by record-evidence / expand-open).
    // Absent ⇒ undefined ⇒ spawnSync behaves exactly as before.
    ...(opts && opts.input != null ? { input: opts.input } : {}),
    env: { ...baseEnv, ...(extraEnv || {}), KAOLA_WORKFLOW_OFFLINE: '1' }
  });
  if (result.error) throw result.error;
  return result;
}

function runNodeAsync(script, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', status => resolve({ status, stdout, stderr }));
  });
}

function json(result) {
  assert(result.status === 0, 'expected exit 0, got ' + result.status + '\nstderr: ' + result.stderr);
  return JSON.parse(result.stdout);
}

function statePath(root, project) {
  return path.join(root, 'kaola-workflow', project, 'workflow-state.md');
}

// A run folder that is FINALIZE-READY and carries no plan.
//
// These fixtures jump straight from claim to finalize to exercise terminal archive/closure
// normalization — never a run — so what they need from this helper is the ONE thing finalize
// still measures: the validation record. Everything else it used to plant (a frozen plan with a
// `## Nodes` table, a `## Node Ledger`, a compliance table, a plan_hash bound into the state
// envelope, a derived task mirror) existed to satisfy two doors that are gone: the
// `adaptive_plan_missing` refusal, and the attribution sweep that demanded every committed
// production file be covered by some complete node's declared write set. With no plan grammar
// there is nothing to declare and nothing to sweep.
//
// `writeSet` is retained in the signature and deliberately unused: its ~40 call sites name the
// production paths each fixture commits, which is still the clearest local documentation of what
// the branch carries, and dropping it would churn every one of them to say nothing new.
//
// The validation record is the CONSUMER-mode arm (`.cache/final-validation.md`), which is what a
// non-npm fixture repo is classified as. It must be BOUND to the tree: an unbound pass reads as
// final_validation_unbound, and a pass bound to a different tree reads as final_validation_stale.
// The hash therefore comes from the same kernel function the door recomputes with, so the fixture
// and the gate can never disagree about what "this tree" means.
function seedAdaptiveFinalizeFixture(root, project, writeSet) {   // eslint-disable-line no-unused-vars
  const dir = path.join(root, 'kaola-workflow', project);
  fs.mkdirSync(path.join(dir, '.cache'), { recursive: true });
  const schema = require('./kaola-workflow-adaptive-schema');
  let cand = '';
  try { cand = schema.computeCodeTreeHash(root, project, schema.VALIDATION_TEST_CONSUMES) || ''; } catch (_) { cand = ''; }
  fs.writeFileSync(path.join(dir, '.cache', 'final-validation.md'),
    'verdict: pass\nfindings_blocking: 0\nvalidated_candidate_hash: ' + cand + '\n');
}

// The candidate hash a consumer-mode `final-validation.md` must be BOUND to, computed with the
// same kernel function the finalize door recomputes with. It used to come out of the plan
// validator's `--candidate-hash` verb; the hash band never had anything to do with the plan, and
// the function that computes it moved to the cross-edition anchor with the rest of the finalize
// door's measurements.
function candidateHashFor(root, project) {
  const schema = require('./kaola-workflow-adaptive-schema');
  try { return schema.computeCodeTreeHash(root, project, schema.VALIDATION_TEST_CONSUMES) || ''; } catch (_) { return ''; }
}

// The adaptive routing command + skill, read from the kernel constants the WRITER uses rather than
// spelled out here. Routing assertions below name these instead of a literal: a literal survived
// long enough for `/kaola-workflow-plan-run` to be deleted out from under it, leaving pins that
// named a command which no longer existed. The property is "routing is adaptive", never "the
// command is spelled <x>".
const { NEXT_COMMAND: ADAPTIVE_NEXT_COMMAND, NEXT_SKILL: ADAPTIVE_NEXT_SKILL } =
  require('./kaola-workflow-adaptive-schema');

// #816: cmdFinalize's Step-8a artifact mirror pushes the MAIN checkout's Finalization artifacts
// into the linked worktree, so the main copy is the authoritative one at the gate. A fixture that
// seeds both roots independently records a per-root candidate hash; align them the way a real run
// does (the orchestrator authors ONE final-validation record) so the mirror is a no-op in content.
function alignFinalizeFixtureAcrossRoots(mainRoot, wtRoot, project) {
  const rel = path.join('kaola-workflow', project, '.cache', 'final-validation.md');
  try {
    const to = path.join(mainRoot, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(wtRoot, rel), to);
  } catch (_) {}
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function assertNoLegacyCoordDirs(root) {
  for (const name of ['lo' + 'cks', 'sess' + 'ions', 'tick' + 'ers']) {
    assert(!fs.existsSync(path.join(root, 'kaola-workflow', '.' + name)), 'legacy coordination dir must not exist: .' + name);
  }
}

function writeProject(root, project, files) {
  const dir = path.join(root, 'kaola-workflow', project);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content);
  }
}

// ADR 0018 §5 HELD, not deleted (owner ruling): the claim -> status -> release lifecycle this
// pins is not retired — only its bootstrap (the OFFLINE local-roadmap-evidence read this helper
// used to perform) is dead now that nothing reads that file. Re-pointing the shared helper at
// `KAOLA_CLASSIFIER_MOCK_SCRIPT` (#495, claim.js:1096-1101) repairs this in place with no edit here
// at all — that re-pointing is test authoring and belongs to tdd-guide, alongside
// test-forge-bundle-lane.js and this same helper. Left exactly as authored; expected RED until then.
function testClaimStatusRelease(tmp) {
  seedClassifierVerdictFromBody(63, '');
  const first = json(runNode(claimScript, ['startup', '--target-issue', '63', '--runtime', 'claude', '--sink', 'pr'], tmp));
  assert(first.claim === 'acquired', 'startup should acquire explicit issue');
  assert(first.project === 'issue-63', 'project should default from issue number');
  const state = read(statePath(tmp, 'issue-63'));
  assert(state.includes('status: active'), 'state must be active');
  assert(state.includes('issue_number: 63'), 'state must record issue number');
  assert(state.includes('sink: pr'), 'state must record PR sink');
  assert(/^run_posture: (worktree|in-place)$/m.test(state), 'M4 (#277): state must contain run_posture: worktree or in-place');
  assert(!state.includes('## ' + 'Lease'), 'state must not contain a retired ownership block');
  assertNoLegacyCoordDirs(tmp);

  const second = json(runNode(claimScript, ['startup', '--target-issue', '63'], tmp));
  assert(second.claim === 'owned', 'second startup should reuse the active folder');

  const status = json(runNode(claimScript, ['status'], tmp));
  assert(status.count === 1, 'status should list one active folder');
  assert(status.active[0].issue_number === 63, 'status should include issue number');

  json(runNode(claimScript, ['patch-branch', '--project', 'issue-63', '--branch', 'workflow/issue-63'], tmp));
  assert(read(statePath(tmp, 'issue-63')).includes('branch: workflow/issue-63'), 'patch-branch should update Sink branch');

  const release = json(runNode(claimScript, ['release', '--project', 'issue-63', '--reason', 'simulation'], tmp));
  assert(release.released === true, 'release should archive active folder');
  assert(!fs.existsSync(path.join(tmp, 'kaola-workflow', 'issue-63')), 'released folder should leave active set');
  assert(fs.existsSync(path.join(tmp, 'kaola-workflow', 'archive')), 'release should create archive');
  assertNoLegacyCoordDirs(tmp);
}

function testFinalize(tmp) {
  seedClassifierVerdictFromBody(164, '');
  json(runNode(claimScript, ['startup', '--target-issue', '164', '--runtime', 'claude'], tmp));
  // This fixture exercises terminal archive normalization directly rather than an
  // authored adaptive run, so it seeds a bound, passing consumer-mode validation record.
  seedAdaptiveFinalizeFixture(tmp, 'issue-164');
  const retiredBlock = '## ' + 'Lease';
  const retiredSessionField = 'sess' + 'ion_id:';
  const retiredHeartbeatField = 'last_' + 'heart' + 'beat:';
  fs.appendFileSync(statePath(tmp, 'issue-164'), [
    retiredBlock,
    retiredSessionField + ' legacy-session',
    'expires: 2026-01-01T00:00:00.000Z',
    retiredHeartbeatField + ' 2026-01-01T00:00:00.000Z',
    ''
  ].join('\n'));
  // #324: seed a PRE-SINK finalization-summary carrying the terminal-mistakable sentinels the
  // Step-5 template writes; after archive they must be neutralized (a later audit reading only the
  // archive must not see a merged/closed run as still "READY FOR FINAL GIT GATE").
  fs.writeFileSync(path.join(tmp, 'kaola-workflow', 'issue-164', 'finalization-summary.md'),
    '# Finalization Summary\n\n## Status\nREADY FOR FINAL GIT GATE\n\n## Commit And Push\nPending final git gate. Final hash reported after push.\n');
  // #324 AC3: append a false-absolute validation claim below the gate-passing verdict the
  // fixture seed already wrote, so the finalize gate still passes AND the claim is present to
  // be neutralized in the archived copy.
  fs.appendFileSync(path.join(tmp, 'kaola-workflow', 'issue-164', '.cache', 'final-validation.md'),
    'All four edition test chains run during n16.\nNo files changed after those runs.\n');
  const result = json(runNode(claimScript, ['finalize', '--project', 'issue-164'], tmp));
  assert(result.status === 'closed', 'finalize should report closed');
  assert(!fs.existsSync(path.join(tmp, 'kaola-workflow', 'issue-164')), 'finalize should remove active folder');
  const archived = fs.readdirSync(path.join(tmp, 'kaola-workflow', 'archive')).filter(name => name.startsWith('issue-164'));
  assert(archived.length === 1, 'finalize should archive folder');
  const archivedState = read(path.join(tmp, 'kaola-workflow', 'archive', archived[0], 'workflow-state.md'));
  assert(archivedState.includes('status: closed'), 'finalize should mark archived state closed');
  assert(archivedState.includes('step: complete'), 'finalize should mark archived state complete');
  assert(!archivedState.includes(retiredBlock), 'finalize should remove legacy lease blocks before archive');
  assert(!archivedState.includes(retiredSessionField), 'finalize should remove legacy session fields before archive');
  // #324: closure normalization of the pre-run evidence writeState seeded at startup. The
  // `## Pending Gates` half of this pin went with the block: the claim no longer seeds a gate
  // list naming a frozen plan, so there is nothing left to normalize at closure.
  assert(!archivedState.includes('last_command: startup'), '#324: archived state must not keep last_command: startup after closure');
  assert(archivedState.includes('last_command: finalize'), '#324: archived state last_command normalized to finalize');
  assert(archivedState.includes('last_result: closed'), '#324: archived state last_result normalized to closed');
  // #324: finalization-summary sentinels neutralized in the archived copy.
  const archivedSummary = read(path.join(tmp, 'kaola-workflow', 'archive', archived[0], 'finalization-summary.md'));
  assert(!archivedSummary.includes('READY FOR FINAL GIT GATE'),
    '#324: archived finalization-summary must not retain the pre-sink "READY FOR FINAL GIT GATE" sentinel');
  assert(!archivedSummary.includes('Pending final git gate'),
    '#324: archived finalization-summary must not retain the pre-sink "Pending final git gate" sentinel');
  // #324 AC3: the false-absolute validation claim is neutralized in the archived cache evidence.
  const archivedFinalVal = read(path.join(tmp, 'kaola-workflow', 'archive', archived[0], '.cache', 'final-validation.md'));
  assert(!archivedFinalVal.includes('No files changed after those runs'),
    '#324 AC3: archived final-validation.md must not retain the false-absolute "No files changed after those runs"');
  assert(archivedFinalVal.includes('Validation reuse covers'),
    '#324 AC3: archived final-validation.md states the actual reuse boundary instead of the false absolute');
  // #333: an archived state must not advertise an active resume command. startup --runtime claude
  // seeds next_command: /kaola-workflow-phase1 issue-164 / next_skill: kaola-workflow-research issue-164.
  assert(archivedState.includes('next_command: none (archived)'),
    '#333: archived state next_command must be neutralized to "none (archived)", got: ' + archivedState);
  assert(archivedState.includes('next_skill: none (archived)'),
    '#333: archived state next_skill must be neutralized to "none (archived)", got: ' + archivedState);
  assert(!archivedState.includes('/kaola-workflow-phase1 issue-164'),
    '#333: archived state must not retain the active /kaola-workflow-phase1 resume command');
}

// #333: a keep-open partial-close archive must be terminal+truthful. A complete
// schema-2 adaptive run is archived through `finalize --keep-open`; the
// archived state must read closed/complete, gates - none, last_result:
// closed_keep_open, preserve the verified plan hash, refresh ## Last Updated,
// neutralize next_command, and carry a ## Closure block with kept-open state.
function testKeepOpenArchiveStamp() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-keepopen-')));
  try {
    // #522: initGitRepo so the finalize gate's attribution sweep can resolve `git diff main...HEAD`.
    // On a plain main branch with no feature branch, the diff is empty → no unattributed files.
    initGitRepo(tmp);
    const STALE_UPDATED = '2020-01-01T00:00:00.000Z';
    const dir = path.join(tmp, 'kaola-workflow', 'issue-333');
    seedClassifierVerdictFromBody(333, '');
    json(runNode(claimScript, ['startup', '--target-issue', '333'], tmp,
      { KAOLA_WORKTREE_NATIVE: '0' }));
    // A stale `## Last Updated` is the point of the fixture (the archive stamp must be rewritten,
    // not inherited), so it is the one state edit that survives. The plan_hash / first-node /
    // active_plan_hash rewrites and the derived task mirror went with the plan grammar.
    let state333 = read(statePath(tmp, 'issue-333'));
    state333 = state333.replace(/(^## Last Updated\n)[^\n]+/m, '$1' + STALE_UPDATED);
    fs.writeFileSync(statePath(tmp, 'issue-333'), state333);
    // Consumer-mode repo (no package.json), so finalize measures the agent-recorded
    // final-validation.md and this makes it green and BOUND to the tree.
    //
    // DELETED: the #653 NEGATIVE LEG — a wrong validated_candidate_hash refusing
    // final_validation_stale before any archive side effect. The BINDING CHECK is intact and still
    // classifies that exact case `final_validation_stale`; the refusal that followed it is gone, so
    // the finalize completes and carries the finding to the orchestrator instead.
    seedAdaptiveFinalizeFixture(tmp, 'issue-333');

    const result = json(runNode(claimScript, ['finalize', '--project', 'issue-333', '--keep-open'], tmp));
    assert(result.status === 'closed', '#333: keep-open finalize should report closed');
    assert(result.issue_disposition === 'kept-open',
      '#333: JSON output issue_disposition must be kept-open, got: ' + JSON.stringify(result.issue_disposition));
    const archived = fs.readdirSync(path.join(tmp, 'kaola-workflow', 'archive')).filter(n => n.startsWith('issue-333'));
    assert(archived.length === 1, '#333: keep-open finalize should archive folder');
    const st = read(path.join(tmp, 'kaola-workflow', 'archive', archived[0], 'workflow-state.md'));
    assert(st.includes('status: closed'), '#333: keep-open archived state must be closed');
    assert(st.includes('step: complete'), '#333: keep-open archived state must be complete');
    assert(st.includes('last_result: closed_keep_open'),
      '#333: keep-open archived last_result must be closed_keep_open, got: ' + st);
    assert(!st.includes('next_command: ' + ADAPTIVE_NEXT_COMMAND),
      '#333: keep-open archived next_command must not advertise the live adaptive route ('
        + ADAPTIVE_NEXT_COMMAND + '), got: ' + st);
    assert(st.includes('next_command: none (archived)'),
      '#333: keep-open archived next_command must be neutralized');
    // DELETED: "the archived plan_hash is refreshed from the final plan file". There is no plan
    // file and no hash of one. The stamp-refresh property the scenario is named for survives on the
    // ## Last Updated assertion immediately below, which is the same mechanism reading a live field.
    assert(!st.includes(STALE_UPDATED),
      '#333: keep-open archived ## Last Updated must be refreshed, got: ' + st);
    assert(/^## Closure$/m.test(st), '#333: keep-open archived state must carry a ## Closure block');
    assert(st.includes('issue_disposition: kept-open'),
      '#333: keep-open archived ## Closure must record issue_disposition: kept-open');
    // #992: the closure DELTA, on the one lane whose decision closes nothing. `issues_closed` is the
    // size of the set this run's closure decision is closing, and a keep-open run decided to close
    // NONE of its claimed set — so the honest count is 0 even though the set is non-empty
    // (`closure.attempted` is [333] and `closure.kept_open` is [333]). This is the half of the field
    // its bundle twin cannot reach: over in test-bundle-finalize.js a merge-lane bundle stamps 4, so
    // an implementation that hardcodes `closure.attempted.length` reds HERE and one that hardcodes
    // `closure.closed.length` reds THERE. Neither alone pins the field; the pair does.
    assert(/^issues_closed: 0$/m.test(st),
      '#992: a keep-open run closes nothing, so its ## Closure block must record issues_closed: 0 — '
      + 'stamping the claimed-set size here would report a closure that was explicitly declined; got: ' + st);
    // ADR 0018 §5: the roadmap-source-preservation checks stood here — "must PRESERVE
    // kaola-workflow/.roadmap/issue-333.md" and the JSON/receipt `roadmap_source_removed: 'kept'`
    // assertions. There is no local roadmap source left to keep or remove; the envelope field is
    // retired with the mechanism (claim.js's cmdFinalize JSON envelope, §1/slice 2). Surviving
    // coverage: remote_issue_closed and closure_invariants.ok below, mirroring the trim already
    // applied to testKeepOpenMergeFullChain / testKeepOpenFinalizeFlagAlias.
    assert(result.closure_receipt && result.closure_receipt.remote_issue_closed === 'kept_open',
      '#336: keep-open receipt remote_issue_closed must be kept_open, got: ' + JSON.stringify(result.closure_receipt && result.closure_receipt.remote_issue_closed));
    assert(result.closure_invariants && result.closure_invariants.ok === true,
      '#336: keep-open closure_invariants.ok must be true (keep-open-roadmap-preserved holds), got: ' + JSON.stringify(result.closure_invariants));
    assert(st.includes('last_result: closed_keep_open'),
      '#336: keep-open archived last_result must remain closed_keep_open');
    console.log('testKeepOpenArchiveStamp: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// #333: #210-class repro — a project archived MANUALLY (fs.renameSync bypassing the script)
// is not proof that archiveProjectDir completed its pre-rename gates. Re-running finalize must
// refuse the active/nonterminal archive without stamping or closure side effects.
function testManualArchiveBackstop() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-backstop-')));
  try {
    const dir = path.join(tmp, 'kaola-workflow', 'issue-210');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'workflow-state.md'), [
      '# Kaola-Workflow State', '',
      '## Project', 'name: issue-210', 'status: active', '',
      '## Current Position',
      'phase: adaptive', 'workflow_path: adaptive', 'step: start',
      'next_command: /kaola-workflow-plan-run issue-210',
      'next_skill: kaola-workflow-plan-run issue-210', '',
      '## Last Evidence', 'last_command: startup', 'last_result: folder_claimed', '',
      '## Last Updated', '2020-01-01T00:00:00.000Z', '',
      '## Sink', 'branch: workflow/issue-210', 'issue_number: 210', 'sink: merge', ''
    ].join('\n'));
    // Manual archive: bypass archiveProjectDir entirely.
    const archiveDest = path.join(tmp, 'kaola-workflow', 'archive', 'issue-210');
    fs.mkdirSync(path.join(tmp, 'kaola-workflow', 'archive'), { recursive: true });
    fs.renameSync(dir, archiveDest);

    const before = read(path.join(archiveDest, 'workflow-state.md'));
    const finalizeResult = runNode(claimScript, ['finalize', '--project', 'issue-210'], tmp);
    let result = null;
    try { result = JSON.parse(finalizeResult.stdout); } catch (_) {}
    assert(finalizeResult.status !== 0 && result && result.reason === 'finalize_gate_unverified'
      && result.inner_reason === 'archive_state_not_closed',
    '#333: manually archived active state must refuse through archive_state_not_closed, got: ' + JSON.stringify(result));
    const st1 = read(path.join(archiveDest, 'workflow-state.md'));
    assert(st1 === before, '#333: manual-archive refusal must leave archived state byte-identical');
    assert(st1.includes('status: active') && !/^## Closure$/m.test(st1),
      '#333: manual-archive refusal must neither terminal-stamp nor append closure evidence');
    console.log('testManualArchiveBackstop: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}


// issue #283: sink-pr must read/write finalization-summary.md (not phase6-summary.md).
function testSinkPrUsesFinalizationSummary() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-pr-fin-'));
  try {
    G.git(tmp, ['init'], { stdio: 'pipe' });
    G.git(tmp, ['config', 'user.email', 'test@example.com'], { stdio: 'pipe' });
    G.git(tmp, ['config', 'user.name', 'Test User'], { stdio: 'pipe' });
    const kwDir = path.join(tmp, 'kaola-workflow', 'issue-2830');
    fs.mkdirSync(kwDir, { recursive: true });
    fs.writeFileSync(path.join(kwDir, 'workflow-state.md'), [
      '# Kaola-Workflow State',
      '## Project',
      'name: issue-2830',
      'status: active',
      '## Sink',
      'branch: workflow/issue-2830',
      'issue_number: 2830',
      'sink: pr',
    ].join('\n') + '\n');
    // Plant finalization-summary.md (the new canonical file)
    fs.writeFileSync(path.join(kwDir, 'finalization-summary.md'), '# Finalization Summary\n');
    G.git(tmp, ['add', '-A'], { stdio: 'pipe' });
    G.git(tmp, ['commit', '-m', 'initial'], { stdio: 'pipe' });

    const result = spawnSync(process.execPath, [
      sinkPrScript,
      '--branch', 'workflow/issue-2830',
      '--project', 'issue-2830',
      '--issue', '2830',
    ], {
      cwd: tmp,
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' },
      stdio: 'pipe',
    });
    assert(result.status === 0,
      'sink-pr (finalization-summary) offline should exit 0, got ' + result.status + '. stderr: ' + result.stderr);

    // finalization-summary.md must exist and contain PR URL
    const finSummaryPath = path.join(kwDir, 'finalization-summary.md');
    assert(fs.existsSync(finSummaryPath),
      'sink-pr must write to finalization-summary.md, not phase6-summary.md');
    const finContent = fs.readFileSync(finSummaryPath, 'utf8');
    assert(finContent.includes('PR URL:'),
      'finalization-summary.md must contain PR URL after sink-pr, got: ' + finContent);

    // phase6-summary.md must NOT be created
    assert(!fs.existsSync(path.join(kwDir, 'phase6-summary.md')),
      'sink-pr must NOT create phase6-summary.md');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('testSinkPrUsesFinalizationSummary: PASSED');
}

function testHookShapeNoPhantomAdvisor() {
  // #372: the phantom-advisor PostToolUse hook is retired — hooks.json must carry NO PostToolUse
  // event. #725: the pre-commit-guard and write-lane PreToolUse hooks are retired, so the surviving
  // id set is: compact-context (SessionStart), subagent-dispatch-log (SubagentStart).
  const hooks = JSON.parse(fs.readFileSync(path.join(repoRoot, 'hooks', 'hooks.json'), 'utf8')).hooks;
  const events = Object.keys(hooks);
  assert(!events.includes('PostToolUse'), '#372: hooks.json must have NO PostToolUse event, got ' + events.join(','));
  const ids = [];
  for (const ev of events) for (const block of hooks[ev]) ids.push(block.id);
  ids.sort();
  assert(JSON.stringify(ids) === JSON.stringify(['kaola-workflow:compact-context', 'kaola-workflow:subagent-dispatch-log']),
    '#372/#725: expected hook id set (compact-context, subagent-dispatch-log), got ' + JSON.stringify(ids));
  const raw = fs.readFileSync(path.join(repoRoot, 'hooks', 'hooks.json'), 'utf8');
  assert(!/phantom-advisor/.test(raw), '#372: no phantom-advisor reference in hooks.json');
  assert(!fs.existsSync(path.join(repoRoot, 'hooks', 'kaola-workflow-phantom-advisor.sh')), '#372: phantom-advisor.sh deleted');
}


function testSubagentDispatchHookExists() {
  // M1 (#277): dispatch-log hook must be installed in the root hooks directory.
  const hooksDir = path.join(repoRoot, 'hooks');
  const dispatchLog = path.join(hooksDir, 'kaola-workflow-subagent-dispatch-log.sh');
  assert(fs.existsSync(dispatchLog), 'M1 (#277): hooks/kaola-workflow-subagent-dispatch-log.sh must exist');
  const hooksJson = path.join(hooksDir, 'hooks.json');
  assert(fs.existsSync(hooksJson), 'M1 (#277): hooks/hooks.json must exist');
  const hooks = JSON.parse(fs.readFileSync(hooksJson, 'utf8'));
  const subagentHooks = (hooks.hooks && hooks.hooks.SubagentStart) || [];
  assert(
    subagentHooks.some(e => e.id === 'kaola-workflow:subagent-dispatch-log'),
    'M1 (#277): hooks.json must have a SubagentStart entry with id: kaola-workflow:subagent-dispatch-log'
  );
  console.log('testSubagentDispatchHookExists: PASSED');
}

// ---------------------------------------------------------------------------
// Shared classifier fixtures — `classifierScript` and `plantActiveFolder` below
// are used by scenarios throughout this file, followed here by the adaptive
// on/off startup and claim scenarios. Each scenario uses its own mkdtempSync to
// keep state isolated from the other tests in this file.
//
// The classifier's file-set-overlap axis is gone: #891 removed folder-based
// overlap and the status:released exclusion scenarios along with the mechanism
// they asserted through. What survives of that behaviour is covered directly
// instead of through a classifier verdict — the closed-issue exclusion by
// testActiveFoldersExcludesClosedIssue895 in this file, and the released-status
// exclusion by the twin-rule row in scripts/test-bundle-claim.js.
// ---------------------------------------------------------------------------

const classifierScript = path.join(repoRoot, 'scripts', 'kaola-workflow-classifier.js');

// ADR 0018 §5 retired the classifier's OFFLINE local-roadmap-evidence read (`.roadmap/issue-N.md`),
// so seedClassifierVerdictFromBody below no longer writes a file the classifier ever reads. It re-bootstraps
// through the seam #495 already built for this purpose — KAOLA_CLASSIFIER_MOCK_SCRIPT
// (claim.js:1096-1101) — instead: classifyIssue() spawns this mock in place of the real classifier
// whenever the env var is set, so a test can hand it a canned verdict.
//
// One process-wide mock script and one JSON registry file, safe for the following reasons:
//   - The walkthrough drives every scenario through synchronous spawnSync, one at a time, never
//     concurrently (see runNode's spawn-class notes) — so one registry file is never read by two
//     scenarios at once.
//   - The mock only ever intercepts an OFFLINE classify: it reads its OWN KAOLA_WORKFLOW_OFFLINE (the
//     value the spawning test set, forwarded verbatim by classifyIssue's env) and immediately
//     delegates to the real classifier when that is not '1'. This mirrors the retired mechanism
//     exactly — the roadmap file was only ever consulted on the OFFLINE arm; ONLINE classification
//     never read it — so an ONLINE scenario that also happens to call seedClassifierVerdictFromBody (e.g.
//     testStartupExplicitTargetRedAnswers, which needs the REAL online red verdict from a gh mock)
//     is unaffected.
//   - An issue number nothing registered also delegates, so a scenario that spawns the real
//     classifier binary directly (bypassing classifyIssue entirely) is unaffected — this env var is
//     never consumed by the classifier binary itself, only by claim.js's classifyIssue().
const classifierMockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-classifier-mock-'));
const classifierMockRegistryFile = path.join(classifierMockDir, 'registry.json');
const classifierMockScript = path.join(classifierMockDir, 'mock-classifier.js');
fs.writeFileSync(classifierMockRegistryFile, '{}');
fs.writeFileSync(classifierMockScript, [
  '#!/usr/bin/env node',
  "'use strict';",
  'const fs = require(' + JSON.stringify('fs') + ');',
  'const { spawnSync } = require(' + JSON.stringify('child_process') + ');',
  'const REGISTRY = ' + JSON.stringify(classifierMockRegistryFile) + ';',
  'const REAL = ' + JSON.stringify(classifierScript) + ';',
  'const argv = process.argv.slice(2);',
  'const idx = argv.indexOf(' + JSON.stringify('--issue') + ');',
  'const issue = idx >= 0 ? argv[idx + 1] : null;',
  'function delegate() {',
  '  const env = Object.assign({}, process.env);',
  '  delete env.KAOLA_CLASSIFIER_MOCK_SCRIPT;',
  '  const res = spawnSync(process.execPath, [REAL].concat(argv), { stdio: ' + JSON.stringify('inherit') + ', env: env });',
  '  process.exit(res.status == null ? 1 : res.status);',
  '}',
  'if (process.env.KAOLA_WORKFLOW_OFFLINE !== ' + JSON.stringify('1') + ') { delegate(); }',
  'var registry = {};',
  'try { registry = JSON.parse(fs.readFileSync(REGISTRY, ' + JSON.stringify('utf8') + ')); } catch (e) {}',
  'if (issue == null || !Object.prototype.hasOwnProperty.call(registry, issue)) { delegate(); }',
  'process.stdout.write(JSON.stringify(registry[issue]) + ' + JSON.stringify('\n') + ');',
  'process.exit(0);'
].join('\n'));
// Every raw spawnSync call site in this file that spreads `...process.env` (the overwhelming
// majority of the OFFLINE-forcing sites) inherits this for free; only runNode's KAOLA_* scrub needed
// a surgical re-add (above).
process.env.KAOLA_CLASSIFIER_MOCK_SCRIPT = classifierMockScript;

// Registers a canned classifier verdict for `issueNumber`, read by classifierMockScript above.
function registerClassifierVerdict(issueNumber, verdict) {
  let registry = {};
  try { registry = JSON.parse(fs.readFileSync(classifierMockRegistryFile, 'utf8')); } catch (_) {}
  registry[String(issueNumber)] = verdict;
  fs.writeFileSync(classifierMockRegistryFile, JSON.stringify(registry));
}

function plantActiveFolder(root, project, issueNumber, phase3Body, status) {
  const dir = path.join(root, 'kaola-workflow', project);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'workflow-state.md'), [
    '# Kaola-Workflow State', '',
    '## Project',
    'name: ' + project,
    'status: ' + (status || 'active'),
    '',
    '## Sink',
    'branch: workflow/issue-' + issueNumber,
    'issue_number: ' + issueNumber,
    'sink: merge',
    ''
  ].join('\n'));
  if (phase3Body != null) {
    fs.writeFileSync(path.join(dir, 'phase3-plan.md'), phase3Body);
  }
}

// ADR 0018 §5: the classifier's OFFLINE arm no longer reads a local `kaola-workflow/.roadmap/
// issue-N.md` — the file this used to write is no longer a producer of anything. Re-bootstraps
// through the KAOLA_CLASSIFIER_MOCK_SCRIPT seam instead (see the classifierMockScript block above):
// registers the SAME verdict the retired offline read produced for a freshly-planted, unblocked
// source. `next_step: ready` never itself carried a `blocked by #N` hint, so every historical call
// through this OFFLINE arm resolved to plain green; `body` is still inspected for that one shape
// (the retired inference classifier.js used to parse out of `next_step`) so a caller that plants a
// dependency hint still gets `blocked`, not a blanket green. The retirement first kept the old
// name and a vestigial `root` argument so call sites were untouched; both are gone now, because a
// name is read at every call site whether or not the body ever is.
function seedClassifierVerdictFromBody(issueNumber, body) {
  const m = /blocked by #(\d+)/i.exec(String(body || ''));
  registerClassifierVerdict(issueNumber, m
    ? { verdict: 'blocked', reasoning: 'OFFLINE and depends-on:#' + m[1] + ' label present; conservative block' }
    : { verdict: 'green', reasoning: 'no dependency block' });
}

// ===========================================================================
// issue #227: adaptive-path cases. Each uses its own temp root. Under #538
// adaptive is the unconditional default (no KAOLA_ENABLE_ADAPTIVE switch);
// legality derives from installed_paths in the hermetic HOME config.
// They exercise: claim legality gate, routeAdaptive resume, validator governance.
// ===========================================================================

function adaptiveTmp(slug) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-adaptive-' + slug + '-'));
  fs.mkdirSync(path.join(tmp, 'kaola-workflow'), { recursive: true });
  return tmp;
}







// testAdaptiveOffStartupRefusal (a) stood here — its central pin, `assert(out.claim === 'acquired',
// ...)` after `startup --target-issue 901` OFFLINE, asserted exactly the local-roadmap-evidence
// acquisition capability ADR 0018 §5 retired. The underlying property this scenario existed to
// prove ("adaptive is unconditionally legal") is not lost — (b) below proves it through the
// `claim --project` door, which never depended on that evidence. Deleted with the mechanism.

// (b) #538: claim --workflowPath adaptive -> acquired (adaptive is the unconditional default).
function testAdaptiveOffClaimRefusal() {
  const tmp = adaptiveTmp('off-claim');
  try {
    initGitRepo(tmp);
    const result = runNode(claimScript, ['claim', '--project', 'issue-902', '--workflowPath', 'adaptive'], tmp);
    const out = JSON.parse(result.stdout);
    assert(out.status === 'acquired',
      '#538: claim adaptive must acquire (always legal), got: ' + result.stdout);
    assert(fs.existsSync(statePath(tmp, 'issue-902')), 'acquired claim must write state');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptiveOffClaimRefusal: PASSED');
}

// (c) #770: the path selector is retired — a stale --workflow-path naming a retired path (fast) or
// a bogus value (wizard) is no longer refused. The claim silently ignores it and acquires (adaptive
// is the only path; there is nothing left to refuse on this axis). Needs a real git repo now — the
// old path-legality gate used to refuse BEFORE any git-touching code ran; now the claim proceeds
// all the way to writeState (buildClaimAnchors reads git HEAD), so the fixture must init one.
function testAdaptiveOffPreservesTwoWay() {
  const tmp = adaptiveTmp('off-twoway');
  try {
    initGitRepo(tmp);
    const staleFast = JSON.parse(runNode(claimScript, ['claim', '--project', 'issue-903', '--workflowPath', 'fast'], tmp).stdout);
    assert(staleFast.status === 'acquired',
      '#770: a stale --workflow-path fast request must silently acquire (no path_not_installed refusal), got: ' + JSON.stringify(staleFast));
    const bogus = JSON.parse(runNode(claimScript, ['claim', '--project', 'issue-904', '--workflowPath', 'wizard'], tmp).stdout);
    assert(bogus.status === 'acquired',
      '#770: a bogus --workflow-path value must silently acquire (no path_not_installed refusal), got: ' + JSON.stringify(bogus));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptiveOffPreservesTwoWay: PASSED');
}

// testAdaptiveOnStartupAcquires (d) stood here — its central pin, `assert(out.claim === 'acquired',
// ...)` after `startup --target-issue 905` OFFLINE, asserted the same retired acquisition
// capability as (a) above, this time as the precondition for asserting the adaptive routing
// (workflow_path / next_command / next_skill) that `startup` writes into state. There is no
// non-authored way to reach that written state once the acquisition itself is gone (a real
// `startup` run is what this test's routing assertions actually needed to exercise). Deleted with
// the mechanism it pinned.




// (h) toggle gates SELECTION only: an in-flight adaptive project resumes via
// `claim resume` to plan-run even after the switch is flipped OFF (toggle-agnostic).
// #236 (document-as-designed): an in-flight adaptive project resumes to plan-run.
// Under #538 resume is unconditionally toggle-agnostic (no switch exists) — still exercised
// to lock the no-toggle-read contract (a future regression adding a toggle read fails here).
function testAdaptiveResumeAfterFlipOff() {
  const tmp = adaptiveTmp('resume-flipoff');
  try {
    writeProject(tmp, 'issue-909', {
      'workflow-state.md': [
        'name: issue-909', 'issue_number: 909', 'status: active',
        'phase: adaptive', 'workflow_path: adaptive', 'next_command:', ''
      ].join('\n')
    });
    const out = JSON.parse(runNode(claimScript, ['resume'], tmp).stdout);
    assert(out.resumed === true, 'in-flight adaptive must resume');
    assert(out.next_command === ADAPTIVE_NEXT_COMMAND + ' issue-909',
      'adaptive resume must emit the adaptive executor (not phaseN), got: ' + out.next_command);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptiveResumeAfterFlipOff: PASSED');
}














// ---------------------------------------------------------------------------
// THE PRE-TAG RELEASE GATE (`--release-check`).
//
// Extracted from testBundle424432433ValidatorGates, whose other half — the barrier allowband,
// the role-token registry and the finalize attribution sweep — fell with the plan grammar. This
// block did not: the gate is plan-independent (it reads only
// <git-toplevel>/.cache/chain-receipt.json and local git), and it is deliberately NOT converted
// to a report. Release tooling is a human-invoked door in front of an irreversible, published
// act, so it still REFUSES, and every refusal below is a live contract.
//
// Its host moved to the file that PRODUCES the receipt it reads (kaola-workflow-run-chains.js
// --release-check). Same argv, same typed envelope, same precedence family:
//   chains_unverified > chains_stale > chains_empty > repo_kind_undetermined > chains_incomplete
//   > chains_red > chains_waived.
//
// The FOUR-CHAIN demand stays — full coverage of every declared chain, unwaived, all green, no
// dirty stamp — and the receipt binds to the candidate by STRICT headSha equality and nothing
// else. There is no second acceptance route. A release-prep carry-over briefly existed here (it
// let a receipt bound to an ANCESTOR bind when the intervening diff stayed inside RELEASE_FILES),
// and it was deleted: its precondition is unreachable through the only release sequence the
// workflow has, because the sink's `chore: archive <project>` commit — whose entire content is
// kaola-workflow/archive/<project>/** — always interposes between the finishing receipt and the
// release candidate, putting off-surface paths in the diff by construction. The run at the
// release commit is mandatory. Cases (1)-(13) are the whole contract.
//
// mkReleaseRepo / writeRootReceipt / greenChains651 are re-derived here rather than deleted: the
// originals were function-locals shared with the dying attribution cases.
// ---------------------------------------------------------------------------
function testReleaseCheckPreTagGate() {
  const headOf = g => G.git(g, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const cleanup = g => { fs.rmSync(g, { recursive: true, force: true }); fs.rmSync(g + '-remote', { recursive: true, force: true }); };
  // === #651 PRE-TAG RELEASE GATE (--release-check): a check-only, plan-independent twin of the
  // --finalize-check chain-receipt arm, pinned STRICTLY to the release-candidate commit. Key deltas
  // vs finalize: (1) NO plan path — at release time the run is archived, so the gate reads only
  // <git-toplevel>/.cache/chain-receipt.json (or --receipt); (2) STRICT headSha EQUALITY against the
  // candidate (default HEAD, or --candidate) — never the #547 codeTreeHash content-address relaxation
  // (a release tag names an exact commit); (3) headSha 'unknown'/missing REFUSES (release.js's
  // chainReceiptGreenness treats 'unknown' as green — the gate must NOT copy that leniency);
  // (4) a WAIVED chain (accepted_red) refuses chains_waived — legal at adaptive finalize, never for
  // a release tag; (5) the receipt must COVER the full resolved chain set (every test:kaola-workflow:*
  // edition chain package.json declares) — a legitimately-produced SUBSET receipt (run-chains
  // --chains claude) refuses chains_incomplete, and an unresolvable chain set (no/corrupt
  // package.json) fails CLOSED. Precedence: chains_unverified > chains_stale > chains_empty >
  // repo_kind_undetermined (unresolvable chain set) > chains_incomplete > chains_red >
  // chains_waived. Fixtures mirror the real repo: root /.cache/ is gitignored, so the untracked
  // receipt itself never pollutes the culprit hints; package.json declares all four edition chains.
  // Delta (2) has no carve-out: strict headSha equality is the entire binding rule.
  const mkReleaseRepo = () => {
    const grepo = adaptiveTmp('release651-git');
    initGitRepo(grepo);
    fs.writeFileSync(path.join(grepo, '.gitignore'), '/.cache/\n');
    fs.writeFileSync(path.join(grepo, 'package.json'), JSON.stringify({ scripts: {
      'test:kaola-workflow:claude': 'true', 'test:kaola-workflow:codex': 'true',
      'test:kaola-workflow:gitlab': 'true', 'test:kaola-workflow:gitea': 'true' } }) + '\n');
    G.git(grepo, ['add', '.gitignore', 'package.json'], { encoding: 'utf8' });
    G.git(grepo, ['commit', '-m', 'ignore root .cache + self-host chains'], { encoding: 'utf8' });
    return grepo;
  };
  const writeRootReceipt = (grepo, obj) => {
    fs.mkdirSync(path.join(grepo, '.cache'), { recursive: true });
    fs.writeFileSync(path.join(grepo, '.cache', 'chain-receipt.json'),
      typeof obj === 'string' ? obj : JSON.stringify(obj));
  };
  const greenChains651 = () => ['claude', 'codex', 'gitlab', 'gitea'].map(
    name => ({ name, exitCode: 0, accepted_red: false }));

  // --- #651 (1) PASS: a green, unwaived, clean-stamped receipt at the candidate sha (default HEAD)
  //     passes with a typed envelope (mode + candidate + chains).
  { const grepo = mkReleaseRepo();
    try {
      writeRootReceipt(grepo, { headSha: headOf(grepo), workTreeHash: 'clean', chains: greenChains651() });
      const r = runNode(runChainsScript, ['--release-check', '--json'], grepo);
      const out = JSON.parse(r.stdout);
      assert(r.status === 0 && out.result === 'pass' && out.mode === 'release-check'
        && out.candidate === headOf(grepo) && Array.isArray(out.chains) && out.chains.length === 4,
        '#651 (1): a green unwaived receipt at the candidate sha must pass with a typed envelope, got status ' + r.status + ' ' + r.stdout);
    } finally { cleanup(grepo); } }

  // --- #651 (2) MISSING receipt → chains_unverified (typed, never a pass).
  { const grepo = mkReleaseRepo();
    try {
      const r = runNode(runChainsScript, ['--release-check', '--json'], grepo);
      assert(r.status === 1 && JSON.parse(r.stdout).reason === 'chains_unverified',
        '#651 (2): release-check with no chain receipt must refuse chains_unverified, got status ' + r.status + ' ' + r.stdout);
    } finally { cleanup(grepo); } }

  // --- #651 (3) UNPARSEABLE receipt → chains_unverified.
  { const grepo = mkReleaseRepo();
    try {
      writeRootReceipt(grepo, '{not json');
      const r = runNode(runChainsScript, ['--release-check', '--json'], grepo);
      assert(r.status === 1 && JSON.parse(r.stdout).reason === 'chains_unverified',
        '#651 (3): release-check with an unparseable receipt must refuse chains_unverified, got status ' + r.status + ' ' + r.stdout);
    } finally { cleanup(grepo); } }

  // --- #651 (4) OLDER-SHA receipt → chains_stale WITH the culprit hint payload (stale_paths /
  //     stale_kind), exactly the finalize-gate diagnostics reused.
  { const grepo = mkReleaseRepo();
    try {
      writeRootReceipt(grepo, { headSha: headOf(grepo), workTreeHash: 'clean', chains: greenChains651() });
      fs.writeFileSync(path.join(grepo, 'newcode.js'), 'module.exports = 651;\n');
      G.git(grepo, ['add', 'newcode.js'], { encoding: 'utf8' });
      G.git(grepo, ['commit', '-m', 'code after receipt'], { encoding: 'utf8' });
      const r = runNode(runChainsScript, ['--release-check', '--json'], grepo);
      const out = JSON.parse(r.stdout);
      assert(r.status === 1 && out.reason === 'chains_stale'
        && out.stale_kind === 'code'
        && JSON.stringify(out.stale_paths) === JSON.stringify(['newcode.js']),
        '#651 (4): a receipt at an older sha must refuse chains_stale with culprit hints, got status ' + r.status + ' ' + r.stdout);
    } finally { cleanup(grepo); } }

  // --- #651 (5) headSha 'unknown' → chains_stale (generic — diagnostics degrade), NEVER a pass.
  //     Negative control on the release.js chainReceiptGreenness leniency ('unknown' passes there).
  { const grepo = mkReleaseRepo();
    try {
      writeRootReceipt(grepo, { headSha: 'unknown', workTreeHash: 'clean', chains: greenChains651() });
      const r = runNode(runChainsScript, ['--release-check', '--json'], grepo);
      const out = JSON.parse(r.stdout);
      assert(r.status === 1 && out.reason === 'chains_stale'
        && out.stale_paths === undefined && out.stale_kind === undefined,
        '#651 (5): a headSha:"unknown" receipt must refuse chains_stale (never pass), got status ' + r.status + ' ' + r.stdout);
    } finally { cleanup(grepo); } }

  // --- #651 (6) WAIVED chain (accepted_red) → chains_waived, naming the waived chain. A waiver is
  //     legal at adaptive finalize but a release tag demands an UNWAIVED four-chain receipt.
  { const grepo = mkReleaseRepo();
    try {
      const chains = greenChains651();
      chains[1] = { name: 'codex', exitCode: 1, accepted_red: true, accepted_red_issue: '234' };
      writeRootReceipt(grepo, { headSha: headOf(grepo), workTreeHash: 'clean', chains });
      const r = runNode(runChainsScript, ['--release-check', '--json'], grepo);
      const out = JSON.parse(r.stdout);
      assert(r.status === 1 && out.reason === 'chains_waived' && /codex/.test(JSON.stringify(out.waivedChains)),
        '#651 (6): a waived (accepted_red) chain must refuse chains_waived naming the chain, got status ' + r.status + ' ' + r.stdout);
    } finally { cleanup(grepo); } }

  // --- #651 (7) UNWAIVED red chain → chains_red; precedence over a waived sibling (red > waived).
  { const grepo = mkReleaseRepo();
    try {
      const chains = greenChains651();
      chains[1] = { name: 'codex', exitCode: 1, accepted_red: false };
      chains[2] = { name: 'gitlab', exitCode: 1, accepted_red: true, accepted_red_issue: '234' };
      writeRootReceipt(grepo, { headSha: headOf(grepo), workTreeHash: 'clean', chains });
      const r = runNode(runChainsScript, ['--release-check', '--json'], grepo);
      assert(r.status === 1 && JSON.parse(r.stdout).reason === 'chains_red',
        '#651 (7): an unwaived red chain must refuse chains_red (precedence over chains_waived), got status ' + r.status + ' ' + r.stdout);
    } finally { cleanup(grepo); } }

  // --- #651 (8) EMPTY chains[] → chains_empty (zero chains verified is never green).
  { const grepo = mkReleaseRepo();
    try {
      writeRootReceipt(grepo, { headSha: headOf(grepo), workTreeHash: 'clean', chains: [] });
      const r = runNode(runChainsScript, ['--release-check', '--json'], grepo);
      assert(r.status === 1 && JSON.parse(r.stdout).reason === 'chains_empty',
        '#651 (8): an empty chains[] receipt must refuse chains_empty, got status ' + r.status + ' ' + r.stdout);
    } finally { cleanup(grepo); } }

  // --- #651 (9) EXPLICIT --candidate: a receipt at commit C passes against --candidate C even after
  //     HEAD advanced (the tag names C, not HEAD) — and the same receipt refuses against HEAD.
  { const grepo = mkReleaseRepo();
    try {
      const c1 = headOf(grepo);
      writeRootReceipt(grepo, { headSha: c1, workTreeHash: 'clean', chains: greenChains651() });
      fs.writeFileSync(path.join(grepo, 'later.js'), 'module.exports = 652;\n');
      G.git(grepo, ['add', 'later.js'], { encoding: 'utf8' });
      G.git(grepo, ['commit', '-m', 'later work'], { encoding: 'utf8' });
      const rPass = runNode(runChainsScript, ['--release-check', '--json', '--candidate', c1], grepo);
      const outPass = JSON.parse(rPass.stdout);
      assert(rPass.status === 0 && outPass.result === 'pass' && outPass.candidate === c1,
        '#651 (9a): a receipt at commit C must pass against --candidate C, got status ' + rPass.status + ' ' + rPass.stdout);
      const rStale = runNode(runChainsScript, ['--release-check', '--json'], grepo);
      assert(rStale.status === 1 && JSON.parse(rStale.stdout).reason === 'chains_stale',
        '#651 (9b): the same receipt must refuse chains_stale against the advanced HEAD, got status ' + rStale.status + ' ' + rStale.stdout);
    } finally { cleanup(grepo); } }

  // --- #651 (10) DIRTY-STAMPED receipt (workTreeHash != 'clean') → chains_stale: the chains
  //     validated HEAD + uncommitted edits, NOT the candidate commit's tree.
  { const grepo = mkReleaseRepo();
    try {
      writeRootReceipt(grepo, { headSha: headOf(grepo), workTreeHash: 'a'.repeat(64), chains: greenChains651() });
      const r = runNode(runChainsScript, ['--release-check', '--json'], grepo);
      assert(r.status === 1 && JSON.parse(r.stdout).reason === 'chains_stale',
        '#651 (10): a dirty-stamped receipt must refuse chains_stale even at the candidate sha, got status ' + r.status + ' ' + r.stdout);
    } finally { cleanup(grepo); } }

  // --- #651 (11) SUBSET receipt → chains_incomplete: a green, fresh, clean-stamped receipt covering
  //     only ONE declared chain (legitimately producible via run-chains --chains claude) must refuse
  //     with the missing chains named STRUCTURALLY — one green chain is not four-chain evidence.
  { const grepo = mkReleaseRepo();
    try {
      writeRootReceipt(grepo, { headSha: headOf(grepo), workTreeHash: 'clean',
        chains: [{ name: 'claude', exitCode: 0, accepted_red: false }] });
      const r = runNode(runChainsScript, ['--release-check', '--json'], grepo);
      const out = JSON.parse(r.stdout);
      assert(r.status === 1 && out.reason === 'chains_incomplete'
        && JSON.stringify(out.missingChains) === JSON.stringify(['codex', 'gitlab', 'gitea']),
        '#651 (11): a subset (claude-only) receipt must refuse chains_incomplete naming the missing chains, got status ' + r.status + ' ' + r.stdout);
    } finally { cleanup(grepo); } }

  // --- #651 (12) PRECEDENCE slot: an incomplete receipt whose one chain is also RED refuses
  //     chains_incomplete (coverage before greenness — the family's empty > red ordering extended);
  //     chains_empty stays ABOVE it (case 8: an empty receipt refuses chains_empty, not incomplete).
  { const grepo = mkReleaseRepo();
    try {
      writeRootReceipt(grepo, { headSha: headOf(grepo), workTreeHash: 'clean',
        chains: [{ name: 'claude', exitCode: 1, accepted_red: false }] });
      const r = runNode(runChainsScript, ['--release-check', '--json'], grepo);
      assert(r.status === 1 && JSON.parse(r.stdout).reason === 'chains_incomplete',
        '#651 (12): an incomplete receipt with a red member must refuse chains_incomplete (precedence over chains_red), got status ' + r.status + ' ' + r.stdout);
    } finally { cleanup(grepo); } }

  // --- #651 (13) UNRESOLVABLE chain set (no package.json) → repo_kind_undetermined, fail-closed:
  //     with no declared test:kaola-workflow:* set to verify coverage against, a full green receipt
  //     must NOT pass (an empty expected set would make the coverage check vacuous — a fail-open).
  { const grepo = adaptiveTmp('release651-nopkg-git');
    try {
      initGitRepo(grepo);
      fs.writeFileSync(path.join(grepo, '.gitignore'), '/.cache/\n');
      G.git(grepo, ['add', '.gitignore'], { encoding: 'utf8' });
      G.git(grepo, ['commit', '-m', 'ignore root .cache'], { encoding: 'utf8' });
      writeRootReceipt(grepo, { headSha: headOf(grepo), workTreeHash: 'clean', chains: greenChains651() });
      const r = runNode(runChainsScript, ['--release-check', '--json'], grepo);
      assert(r.status === 1 && JSON.parse(r.stdout).reason === 'repo_kind_undetermined',
        '#651 (13): an unresolvable chain set (no package.json) must refuse repo_kind_undetermined, got status ' + r.status + ' ' + r.stdout);
    } finally { cleanup(grepo); } }

  console.log('testReleaseCheckPreTagGate: PASSED');
}












function testClassifierDependsOnGate() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-classifier-depson-'));
  try {
    const binDir = path.join(tmp, 'bin');
    fs.mkdirSync(binDir, { recursive: true });

    // Sub-case A: dependency is CLOSED → should yield green (regression test for the bug)
    writeShimFiles(path.join(binDir, 'gh'), [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('repo view')) { process.stdout.write('{\"owner\":{\"login\":\"test\"},\"name\":\"repo\"}\\n'); }",
      "else if (a.includes('issue view 91')) { process.stdout.write('{\"number\":91,\"title\":\"dependent\",\"body\":\"README docs\",\"labels\":[{\"name\":\"depends-on:#90\"}],\"state\":\"OPEN\"}\\n'); }",
      "else if (a.includes('issue view 90')) { process.stdout.write('{\"state\":\"CLOSED\",\"closedAt\":\"2026-01-01T00:00:00Z\"}\\n'); }",
      "else if (a.includes('issue list')) { process.stdout.write('[\\n'); }",
      "else { process.stdout.write('[\\n'); }"
    ]);
    const resultA = spawnSync(process.execPath, [classifierScript, 'classify', '--issue', '91'], {
      cwd: tmp, encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '0', ...ghMockEnv(binDir), PATH: binDir + path.delimiter + path.dirname(process.execPath) + path.delimiter + (process.env.PATH || '') }
    });
    assert(resultA.status === 0, 'classifier exit 0 expected for dep-closed case, got ' + resultA.status + '\nstderr: ' + resultA.stderr);
    const parsedA = JSON.parse(resultA.stdout.trim());
    assert(parsedA.verdict !== 'blocked',
      'dep CLOSED: expected verdict not blocked (regression for #189), got ' + parsedA.verdict);
    assert(parsedA.verdict === 'green',
      'dep CLOSED: expected green, got ' + parsedA.verdict + ' reasoning: ' + parsedA.reasoning);

    // Sub-case B: dependency is OPEN → should yield blocked
    writeShimFiles(path.join(binDir, 'gh'), [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('repo view')) { process.stdout.write('{\"owner\":{\"login\":\"test\"},\"name\":\"repo\"}\\n'); }",
      "else if (a.includes('issue view 91')) { process.stdout.write('{\"number\":91,\"title\":\"dependent\",\"body\":\"README docs\",\"labels\":[{\"name\":\"depends-on:#90\"}],\"state\":\"OPEN\"}\\n'); }",
      "else if (a.includes('issue view 90')) { process.stdout.write('{\"state\":\"OPEN\"}\\n'); }",
      "else if (a.includes('issue list')) { process.stdout.write('[\\n'); }",
      "else { process.stdout.write('[\\n'); }"
    ]);
    const resultB = spawnSync(process.execPath, [classifierScript, 'classify', '--issue', '91'], {
      cwd: tmp, encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '0', ...ghMockEnv(binDir), PATH: binDir + path.delimiter + path.dirname(process.execPath) + path.delimiter + (process.env.PATH || '') }
    });
    assert(resultB.status === 0, 'classifier exit 0 expected for dep-open case, got ' + resultB.status + '\nstderr: ' + resultB.stderr);
    const parsedB = JSON.parse(resultB.stdout.trim());
    assert(parsedB.verdict === 'blocked',
      'dep OPEN: expected blocked, got ' + parsedB.verdict);
    assert(parsedB.reasoning && parsedB.reasoning.includes('depends-on:#90'),
      'dep OPEN: reasoning should mention depends-on:#90, got: ' + parsedB.reasoning);

    console.log('testClassifierDependsOnGate: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Issue #155 — probeIssueState unit tests
// Each test spawns a subprocess driver to avoid OFFLINE/env freeze from module
// load at the top of this file.
// ---------------------------------------------------------------------------

function callProbeIssueState(argExpr, env, binDir) {
  const driver = [
    "const m = require(" + JSON.stringify(activeFoldersScript) + ");",
    "process.stdout.write(JSON.stringify(m.probeIssueState(" + argExpr + ")));"
  ].join('\n');
  const mockEnv = binDir ? ghMockEnv(binDir) : {};
  // A fresh-environment driver: the module runs under an OFFLINE flag and a gh shim first
  // on PATH that the parent process cannot hold, because its own env and require cache are
  // already resolved.
  // spawn-class: environment
  const r = spawnSync(process.execPath, ['-e', driver], {
    encoding: 'utf8',
    env: Object.assign({}, process.env, env || {}, mockEnv, {
      PATH: (binDir ? binDir + path.delimiter : '') + (process.env.PATH || '')
    })
  });
  if (r.status !== 0) throw new Error('probeIssueState driver failed: ' + r.stderr);
  return JSON.parse(r.stdout);
}

function testProbeIssueStateOffline() {
  const result = callProbeIssueState('42', { KAOLA_WORKFLOW_OFFLINE: '1' });
  assert(result.state === 'open', 'OFFLINE=1 must return state open, got: ' + result.state);
  assert(result.reason === 'offline-or-null', 'OFFLINE=1 must return reason offline-or-null, got: ' + result.reason);
}

function testProbeIssueStateNullIssue() {
  const result = callProbeIssueState('null', { KAOLA_WORKFLOW_OFFLINE: '0' });
  assert(result.state === 'open', 'null issueNumber must return state open, got: ' + result.state);
  assert(result.reason === 'offline-or-null', 'null issueNumber must return reason offline-or-null, got: ' + result.reason);
}

function testProbeIssueStateEmptyGhResponse() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-probe-empty-'));
  try {
    const binDir = path.join(tmp, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    writeShimFiles(path.join(binDir, 'gh'), [
      '// outputs nothing, exits 0 → ghExec trims to empty string',
      'process.stdout.write("");',
      'process.exit(0);'
    ]);
    const result = callProbeIssueState('99', { KAOLA_WORKFLOW_OFFLINE: '0' }, binDir);
    assert(result.state === 'unavailable', 'empty gh response must return state unavailable, got: ' + result.state);
    assert(result.reason === 'empty gh response', 'empty gh response must return reason "empty gh response", got: ' + result.reason);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testProbeIssueStateGhThrows() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-probe-throws-'));
  try {
    const binDir = path.join(tmp, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    writeShimFiles(path.join(binDir, 'gh'), [
      '// exits 1 → execFileSync throws',
      'process.exit(1);'
    ]);
    const result = callProbeIssueState('99', { KAOLA_WORKFLOW_OFFLINE: '0' }, binDir);
    assert(result.state === 'unavailable', 'gh exit 1 must return state unavailable, got: ' + result.state);
    assert(result.reason === 'gh issue fetch failed', 'gh exit 1 must return reason "gh issue fetch failed", got: ' + result.reason);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// #895 — readActiveFolders drops a CLOSED issue's folder on its DEFAULT options path.
//
// That exclusion is what stops a stale folder from making a re-claimable issue look owned:
// cmdClassify reads readActiveFolders(root) with no options, and a hit there exits 2 (`owned`)
// with no stdout — so a folder left behind for a since-closed issue would make that issue
// permanently unclaimable. Every other canonical caller in the suites passes the flag OFF, which
// measures the unfiltered path only.
//
// Driven through a subprocess: OFFLINE freezes at module load, and this process is already
// resolved, so an in-process call would short-circuit issueIsClosed and read green whatever the
// filter did. Sub-case E spends that same driver on the OFFLINE path itself — the flag the driver
// exists for is the one thing an in-process call could never measure.
//
// Three sub-cases beyond the exclusion: the filter must not read a FAILED probe, an EMPTY answer,
// or an OFFLINE run as "closed". Each of those evicts a folder for a still-open issue, and the
// exclusion assertion alone cannot tell that apart from a correct exclusion.
// ---------------------------------------------------------------------------

function callReadActiveFolders(root, binDir, offlineFlag) {
  const driver = [
    'const m = require(' + JSON.stringify(activeFoldersScript) + ');',
    'const root = ' + JSON.stringify(root) + ';',
    // The CONTROL runs first and makes no probe (excludeClosedIssues:false skips prefetch and
    // issueIsClosed entirely), so it cannot seed the memo the default call is measured on. It is
    // here for non-vacuity: without it a fixture that planted one folder would satisfy the
    // filtered assertion below while proving nothing.
    'const control = m.readActiveFolders(root, { excludeClosedIssues: false });',
    'const filtered = m.readActiveFolders(root);',
    'process.stdout.write(JSON.stringify({',
    '  control: control.map(f => f.project),',
    '  projects: filtered.map(f => f.project),',
    '  issue_numbers: filtered.map(f => f.issue_number)',
    '}));'
  ].join('\n');
  // Scrub inherited KAOLA_* — the mock wiring and the offline flag are supplied here, and an
  // inherited KAOLA_ISSUE_STATE_SNAPSHOT would pre-seed the very memo under test.
  const baseEnv = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('KAOLA_'))
  );
  // The module reads its OFFLINE flag once at load and routes gh through a mock named by env, so
  // the wiring under test only exists in a process this one does not already own.
  // spawn-class: environment
  const r = spawnSync(process.execPath, ['-e', driver], {
    encoding: 'utf8',
    timeout: 30000,
    env: Object.assign({}, baseEnv, ghMockEnv(binDir), {
      KAOLA_WORKFLOW_OFFLINE: offlineFlag || '0',
      PATH: binDir + path.delimiter + path.dirname(process.execPath) + path.delimiter + (process.env.PATH || '')
    })
  });
  assert(r.status === 0, 'readActiveFolders driver failed (exit ' + r.status + '): ' + r.stderr);
  return JSON.parse(r.stdout);
}

function testActiveFoldersExcludesClosedIssue895() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-active-closed-895-'));
  try {
    // The folder names carry no state, and the two sub-cases INVERT which issue is closed: 11 is
    // closed in A, 10 is closed in B. So no fixed property of a folder — its number's parity or
    // magnitude, its name, its sort position — predicts the survivor in BOTH sub-cases, and a
    // filter keyed on one of those passes one sub-case and reds the other. Measured, not assumed:
    // with both sub-cases sharing 10-open/11-closed, replacing the exclusion with
    // `state.issue_number % 2 === 1` left the scenario green.
    plantActiveFolder(tmp, 'alpha-project', 10);
    plantActiveFolder(tmp, 'beta-project', 11);

    // Sub-case A — the BATCHED path answers, 11 closed. `gh issue list` carries both states and
    // every per-issue `gh issue view` fails, so a prefetch that stopped memoizing would fall
    // through to a throwing probe, issueIsClosed would return false, and the closed folder would
    // survive.
    const binA = path.join(tmp, 'bin-batch');
    fs.mkdirSync(binA, { recursive: true });
    writeShimFiles(path.join(binA, 'gh'), [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue list')) { process.stdout.write('[{\"number\":10,\"state\":\"OPEN\"},{\"number\":11,\"state\":\"CLOSED\"}]\\n'); }",
      "else if (a.includes('issue view')) { process.exit(1); }",
      "else { process.stdout.write('[\\n'); }"
    ]);
    const batched = callReadActiveFolders(tmp, binA);
    assert(batched.control.length === 2,
      '#895 fixture (batched): both folders must be visible with the filter OFF, got ' + JSON.stringify(batched.control));
    assert(batched.projects.length === 1 && batched.projects[0] === 'alpha-project',
      '#895 (batched): default options must keep ONLY the open issue\'s folder, got ' + JSON.stringify(batched.projects));
    assert(batched.issue_numbers[0] === 10,
      '#895 (batched): the surviving folder must be issue 10, got ' + JSON.stringify(batched.issue_numbers));

    // Sub-case B — the PER-ISSUE fallback answers, and the roles are INVERTED: 10 closed, 11 open.
    // `gh issue list` returns nothing to memoize, so the exclusion has to come from issueIsClosed's
    // own `gh issue view` probe.
    const binB = path.join(tmp, 'bin-probe');
    fs.mkdirSync(binB, { recursive: true });
    writeShimFiles(path.join(binB, 'gh'), [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue list')) { process.stdout.write('[]\\n'); }",
      "else if (a.includes('issue view 10')) { process.stdout.write('{\"state\":\"CLOSED\"}\\n'); }",
      "else if (a.includes('issue view 11')) { process.stdout.write('{\"state\":\"OPEN\"}\\n'); }",
      "else { process.stdout.write('[\\n'); }"
    ]);
    const probed = callReadActiveFolders(tmp, binB);
    assert(probed.control.length === 2,
      '#895 fixture (per-issue): both folders must be visible with the filter OFF, got ' + JSON.stringify(probed.control));
    assert(probed.projects.length === 1 && probed.projects[0] === 'beta-project',
      '#895 (per-issue): default options must keep ONLY the open issue\'s folder, got ' + JSON.stringify(probed.projects));
    assert(probed.issue_numbers[0] === 11,
      '#895 (per-issue): the surviving folder must be issue 11, got ' + JSON.stringify(probed.issue_numbers));

    // Sub-case C — an UNREACHABLE issue is not a closed one. `gh issue list` memoizes nothing, 10's
    // `gh issue view` fails outright, and 11 answers CLOSED. 10 must SURVIVE: a probe that cannot
    // answer says nothing about the issue, and a catch that swallowed the error and reported
    // "closed" would evict a folder whose issue is still open. 11's exclusion is the non-vacuity
    // control — it proves the shim is wired and the filter is live on this run.
    const binC = path.join(tmp, 'bin-unreachable');
    fs.mkdirSync(binC, { recursive: true });
    writeShimFiles(path.join(binC, 'gh'), [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue list')) { process.stdout.write('[]\\n'); }",
      "else if (a.includes('issue view 10')) { process.stderr.write('could not resolve host: api.github.com\\n'); process.exit(1); }",
      "else if (a.includes('issue view 11')) { process.stdout.write('{\"state\":\"CLOSED\"}\\n'); }",
      "else { process.stdout.write('[\\n'); }"
    ]);
    const unreachable = callReadActiveFolders(tmp, binC);
    assert(unreachable.control.length === 2,
      '#895 fixture (unreachable): both folders must be visible with the filter OFF, got ' + JSON.stringify(unreachable.control));
    assert(unreachable.projects.length === 1 && unreachable.projects[0] === 'alpha-project',
      '#895 (unreachable): a FAILED probe must not be read as closed — issue 10\'s folder must survive and issue 11\'s (genuinely CLOSED) must not, got ' + JSON.stringify(unreachable.projects));
    assert(unreachable.issue_numbers[0] === 10,
      '#895 (unreachable): the surviving folder must be issue 10, got ' + JSON.stringify(unreachable.issue_numbers));

    // Sub-case D — an EMPTY answer is not a closed one, roles INVERTED against C: 10 answers
    // CLOSED, 11 answers nothing at all (exit 0, no stdout). 11 must SURVIVE. Inverted because a
    // filter keyed on the number rather than the answer would otherwise pass C and D together.
    const binD = path.join(tmp, 'bin-empty');
    fs.mkdirSync(binD, { recursive: true });
    writeShimFiles(path.join(binD, 'gh'), [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue list')) { process.stdout.write('[]\\n'); }",
      "else if (a.includes('issue view 10')) { process.stdout.write('{\"state\":\"CLOSED\"}\\n'); }",
      "else if (a.includes('issue view 11')) { /* exit 0, no stdout */ }",
      "else { process.stdout.write('[\\n'); }"
    ]);
    const emptyAnswer = callReadActiveFolders(tmp, binD);
    assert(emptyAnswer.control.length === 2,
      '#895 fixture (empty answer): both folders must be visible with the filter OFF, got ' + JSON.stringify(emptyAnswer.control));
    assert(emptyAnswer.projects.length === 1 && emptyAnswer.projects[0] === 'beta-project',
      '#895 (empty answer): an EMPTY gh response must not be read as closed — issue 11\'s folder must survive and issue 10\'s (genuinely CLOSED) must not, got ' + JSON.stringify(emptyAnswer.projects));
    assert(emptyAnswer.issue_numbers[0] === 11,
      '#895 (empty answer): the surviving folder must be issue 11, got ' + JSON.stringify(emptyAnswer.issue_numbers));

    // Sub-case E — OFFLINE excludes NOTHING. One fixture and ONE shim, run twice, differing only in
    // KAOLA_WORKFLOW_OFFLINE. The online run is the control: it proves this shim really does report
    // 10 as closed and the filter really does act on it. The offline run must then keep BOTH
    // folders — offline means no probe was made, and no probe means no folder can be judged closed.
    // This is the assertion the subprocess driver was bought for: OFFLINE freezes at module load,
    // so nothing in this process can measure it.
    const binE = path.join(tmp, 'bin-offline');
    fs.mkdirSync(binE, { recursive: true });
    writeShimFiles(path.join(binE, 'gh'), [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue list')) { process.stdout.write('[{\"number\":10,\"state\":\"CLOSED\"},{\"number\":11,\"state\":\"OPEN\"}]\\n'); }",
      "else if (a.includes('issue view 10')) { process.stdout.write('{\"state\":\"CLOSED\"}\\n'); }",
      "else if (a.includes('issue view 11')) { process.stdout.write('{\"state\":\"OPEN\"}\\n'); }",
      "else { process.stdout.write('[\\n'); }"
    ]);
    const online = callReadActiveFolders(tmp, binE, '0');
    assert(online.projects.length === 1 && online.projects[0] === 'beta-project',
      '#895 fixture (offline control): with OFFLINE=0 this shim must exclude issue 10\'s folder, got ' + JSON.stringify(online.projects));
    const offline = callReadActiveFolders(tmp, binE, '1');
    assert(offline.control.length === 2,
      '#895 fixture (offline): both folders must be visible with the filter OFF, got ' + JSON.stringify(offline.control));
    assert(offline.projects.length === 2 &&
           offline.projects[0] === 'alpha-project' && offline.projects[1] === 'beta-project',
      '#895 (offline): KAOLA_WORKFLOW_OFFLINE=1 must short-circuit the closed-issue probe entirely — BOTH folders must survive the same shim that excluded issue 10 online, got ' + JSON.stringify(offline.projects));
    assert(offline.issue_numbers.length === 2 &&
           offline.issue_numbers.includes(10) && offline.issue_numbers.includes(11),
      '#895 (offline): both issue numbers must survive, got ' + JSON.stringify(offline.issue_numbers));

    console.log('testActiveFoldersExcludesClosedIssue895: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// On macOS 15 (Darwin 25.4.0), execFileSync(scriptPath, args) hangs when
// scriptPath has ANY shebang (node or shell). Only execFileSync(process.execPath,
// [jsPath, ...args]) works. Solution: write only the .js logic file; callers set
// KAOLA_GH_MOCK_SCRIPT in the subprocess env so ghExec routes through process.execPath.
function writeShimFiles(shimPath, jsLines) {
  fs.writeFileSync(shimPath + '.js', jsLines.join('\n'));
}

function writeGhShimForStartup(binDir) {
  fs.mkdirSync(binDir, { recursive: true });
  writeShimFiles(path.join(binDir, 'gh'), [
    "const a = process.argv.slice(2).join(' ');",
    "if (a.includes('repo view')) { process.stdout.write('{\"owner\":{\"login\":\"test\"},\"name\":\"repo\"}\\n'); }",
    "else if (a.includes('issue view')) { process.stdout.write('{\"number\":0,\"title\":\"fixture\",\"body\":\"README.md\",\"labels\":[],\"state\":\"open\"}\\n'); }",
    "else if (a.includes('api')) { process.stdout.write('[\\n'); }",
    "else { process.stdout.write('\\n'); }"
  ]);
}

// #328: Write a mock gh.js that logs label/comment events and returns issues as open or closed.
// Used by bundle-lane E2E tests in the walkthrough (same pattern as test-bundle-claim.js).
// opts: { logFile, openIssues: number[], closedIssues: number[] }
function writeBundleGhMockScript(binDir, opts) {
  const logFile = opts && opts.logFile ? JSON.stringify(opts.logFile) : 'null';
  const openIssues = opts && opts.openIssues ? JSON.stringify(opts.openIssues) : '[]';
  const closedIssues = opts && opts.closedIssues ? JSON.stringify(opts.closedIssues) : '[]';
  fs.mkdirSync(binDir, { recursive: true });
  const script = [
    "'use strict';",
    'const fs = require("fs");',
    'const argv = process.argv.slice(2);',
    'const a = argv.join(" ");',
    'const logFile = ' + logFile + ';',
    'const openIssues = new Set(' + openIssues + '.map(String));',
    'const closedIssues = new Set(' + closedIssues + '.map(String));',
    'function log(msg) { if (!logFile) return; try { fs.appendFileSync(logFile, msg + "\\n"); } catch(_) {} }',
    'if (a.includes("repo view")) { process.stdout.write(JSON.stringify({owner:{login:"test"},name:"repo"}) + "\\n"); process.exit(0); }',
    'const viewM = a.match(/issue view (\\d+)/);',
    'if (viewM) {',
    '  const n = viewM[1];',
    '  const state = closedIssues.has(n) ? "closed" : "open";',
    '  process.stdout.write(JSON.stringify({number:parseInt(n),state,title:"issue "+n,body:"",labels:[]}) + "\\n");',
    '  process.exit(0);',
    '}',
    'if (a.includes("issue edit") && a.includes("--add-label")) { const m = a.match(/issue edit (\\d+)/); log("label-added:" + (m ? m[1] : "?")); process.exit(0); }',
    'if (a.includes("issue edit") && a.includes("--remove-label")) { const m = a.match(/issue edit (\\d+)/); log("label-removed:" + (m ? m[1] : "?")); process.exit(0); }',
    'if (a.includes("issue comment")) { const m = a.match(/issue comment (\\d+)/); log("comment:" + (m ? m[1] : "?")); process.exit(0); }',
    'if (a.includes("label create")) { process.exit(0); }',
    'if (a.includes("api") && a.includes("comments")) { process.stdout.write("[]\\n"); process.exit(0); }',
    'if (a.includes("api") && a.includes("DELETE")) { process.exit(0); }',
    'process.stdout.write("\\n"); process.exit(0);',
  ].join('\n');
  fs.writeFileSync(path.join(binDir, 'gh.js'), script);
}

// Git isolation env: prevents developer commit.gpgsign / core.hooksPath from
// breaking fixture commits regardless of the developer's global git config.
const GIT_ISOLATION_ENV = {
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1'
};

function initGitRepo(tmp) {
  const env = { ...process.env, ...GIT_ISOLATION_ENV };
  G.git(tmp, ['init', '-b', 'main'], { encoding: 'utf8', env });
  G.git(tmp, ['config', 'user.email', 'test@example.com'], { encoding: 'utf8', env });
  G.git(tmp, ['config', 'user.name', 'Test User'], { encoding: 'utf8', env });
  fs.writeFileSync(path.join(tmp, 'README.md'), 'fixture\n');
  G.git(tmp, ['add', 'README.md'], { encoding: 'utf8', env });
  G.git(tmp, ['commit', '-m', 'init'], { encoding: 'utf8', env });
}

function initGitRepoWithBareRemote(tmp) {
  initGitRepo(tmp);
  const remotePath = tmp + '-remote';
  const env = { ...process.env, ...GIT_ISOLATION_ENV };
  G.raw(['init', '--bare', remotePath], { env });
  G.git(tmp, ['remote', 'add', 'origin', remotePath], { env });
  G.git(tmp, ['push', '-u', 'origin', 'main'], { env });
  return remotePath;
}

function ghMockEnv(binDir) {
  const jsPath = path.join(binDir, 'gh.js');
  if (!fs.existsSync(jsPath)) {
    throw new Error(
      'ghMockEnv: shim file not found at ' + jsPath +
      ' — call writeGhShimForStartup (or equivalent) before using ghMockEnv'
    );
  }
  return { KAOLA_GH_MOCK_SCRIPT: jsPath };
}

function runClaimOnline(args, cwd, binDir, extraEnv) {
  // The shared envelope vehicle for the claim CLI's success path — no signal, an exit code,
  // and a parseable stdout envelope are the whole of what this site asserts.
  // spawn-class: cli-contract
  const result = spawnSync(process.execPath, [claimScript, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 60000,
    env: {
      ...process.env,
      KAOLA_WORKTREE_NATIVE: '1',
      ...(extraEnv || {}),
      KAOLA_WORKFLOW_OFFLINE: '0',
      ...ghMockEnv(binDir),
      PATH: binDir + path.delimiter + path.dirname(process.execPath) + path.delimiter + (process.env.PATH || '')
    }
  });
  assert(!result.signal, 'online claim timed out or was killed: ' + result.signal + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
  assert(result.status === 0, 'online claim should exit 0, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
  return JSON.parse(result.stdout);
}

// Like runClaimOnline but parses the last non-empty JSON line from stdout.
// Needed for commands (e.g. worktree-finalize) that emit git progress text
// before the final JSON object on the last line.
function runClaimOnlineLastJson(args, cwd, binDir, extraEnv) {
  // A distinct stdout-envelope contract: this CLI emits git progress text BEFORE its JSON,
  // so what is proven here is 'the last non-empty stdout line is the envelope'. That shape
  // exists only at the process boundary — in-process there is no stdout to interleave.
  // spawn-class: cli-contract
  const result = spawnSync(process.execPath, [claimScript, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 60000,
    env: {
      ...process.env,
      KAOLA_WORKTREE_NATIVE: '1',
      ...(extraEnv || {}),
      KAOLA_WORKFLOW_OFFLINE: '0',
      ...ghMockEnv(binDir),
      PATH: binDir + path.delimiter + path.dirname(process.execPath) + path.delimiter + (process.env.PATH || '')
    }
  });
  assert(!result.signal, 'online claim timed out or was killed: ' + result.signal + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
  assert(result.status === 0, 'online claim should exit 0, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
  const lastLine = result.stdout.trim().split('\n').filter(l => l.trim().startsWith('{')).pop();
  assert(lastLine, 'expected a JSON object line in stdout, got: ' + result.stdout);
  return JSON.parse(lastLine);
}

// probeTimeoutEnv — scales KAOLA_GH_REMOTE_TIMEOUT_MS for parallel test runs.
// When TEST_PARALLEL=1 (4-chain concurrent load), raises the probe margin to 2000ms
// (~6.7x) to absorb scheduling starvation; defaults to 300ms for serial runs.
// Byte-verbatim across all three driver files (simulate-workflow-walkthrough.js,
// test-gitlab-workflow-scripts.js, test-gitea-workflow-scripts.js).
function probeTimeoutEnv() { return { KAOLA_GH_REMOTE_TIMEOUT_MS: process.env.TEST_PARALLEL === '1' ? '2000' : '300' }; }

// testProbeTimeoutEnv — RED→GREEN seam: asserts probeTimeoutEnv() returns '2000' under
// TEST_PARALLEL=1 and '300' otherwise (set/restore around the assertion).
function testProbeTimeoutEnv() {
  const prev = process.env.TEST_PARALLEL;
  try {
    process.env.TEST_PARALLEL = '1';
    const r1 = probeTimeoutEnv();
    if (r1.KAOLA_GH_REMOTE_TIMEOUT_MS !== '2000') {
      throw new Error('probeTimeoutEnv must return "2000" under TEST_PARALLEL=1, got: ' + r1.KAOLA_GH_REMOTE_TIMEOUT_MS);
    }
    delete process.env.TEST_PARALLEL;
    const r2 = probeTimeoutEnv();
    if (r2.KAOLA_GH_REMOTE_TIMEOUT_MS !== '300') {
      throw new Error('probeTimeoutEnv must return "300" when TEST_PARALLEL is unset, got: ' + r2.KAOLA_GH_REMOTE_TIMEOUT_MS);
    }
    process.env.TEST_PARALLEL = '0';
    const r3 = probeTimeoutEnv();
    if (r3.KAOLA_GH_REMOTE_TIMEOUT_MS !== '300') {
      throw new Error('probeTimeoutEnv must return "300" when TEST_PARALLEL="0", got: ' + r3.KAOLA_GH_REMOTE_TIMEOUT_MS);
    }
  } finally {
    if (prev === undefined) delete process.env.TEST_PARALLEL;
    else process.env.TEST_PARALLEL = prev;
  }
  console.log('testProbeTimeoutEnv: PASSED');
}

// Run closure-audit online (mock gh via KAOLA_GH_MOCK_SCRIPT). Mirrors runClaimOnline.
function runClosureAudit(args, cwd, binDir, extraEnv) {
  // The envelope vehicle for the closure-audit CLI's online path: no signal, exit 0, and a
  // parseable stdout object.
  // spawn-class: cli-contract
  const result = spawnSync(process.execPath, [closureAuditScript, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 60000,
    env: {
      ...process.env,
      ...(extraEnv || {}),
      KAOLA_WORKFLOW_OFFLINE: '0',
      ...ghMockEnv(binDir),
      PATH: binDir + path.delimiter + path.dirname(process.execPath) + path.delimiter + (process.env.PATH || '')
    }
  });
  assert(!result.signal, 'closure-audit timed out or was killed: ' + result.signal + '\nstderr: ' + result.stderr);
  assert(result.status === 0, 'closure-audit should exit 0, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
  return JSON.parse(result.stdout);
}

// Run closure-audit offline (no gh shim; remote classes must report skipped_offline).
function runClosureAuditOffline(args, cwd) {
  // The envelope vehicle for the closure-audit CLI's offline path: exit 0 plus a parseable
  // stdout object.
  // spawn-class: cli-contract
  const result = spawnSync(process.execPath, [closureAuditScript, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 60000,
    env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
  });
  assert(result.status === 0, 'offline closure-audit should exit 0, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
  return JSON.parse(result.stdout);
}

function testStartupJsonAndSiblingWorktrees() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-startup-worktrees-'));
  const kwRoot = fs.realpathSync(tmp) + '.kw';
  try {
    initGitRepo(tmp);
    const binDir = path.join(tmp, 'bin');
    writeGhShimForStartup(binDir);

    const first = runClaimOnline(['startup', '--target-issue', '501'], tmp, binDir);
    assert(first.worktree_path === path.join(kwRoot, 'issue-501'), 'first worktree should be canonical sibling path');

    const second = runClaimOnline(['startup', '--target-issue', '502'], first.worktree_path, binDir);
    assert(second.worktree_path === path.join(kwRoot, 'issue-502'), 'nested startup should still create canonical sibling worktree');
    assert(!second.worktree_path.includes('issue-501.kw'), 'nested startup must not create issue-501.kw paths');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(kwRoot, { recursive: true, force: true });
  }
}

function testWorktreeNativeDefaultOff() {
  // Test: KAOLA_WORKTREE_NATIVE=0 must suppress worktree provisioning AND create in-place branch
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-wt-native-off-'));
  const kwRoot = fs.realpathSync(tmp) + '.kw';
  try {
    initGitRepo(tmp);
    // Commit a .gitignore so the bin/ shim + kaola-workflow/ folder don't dirty the tree
    fs.writeFileSync(path.join(tmp, '.gitignore'), 'bin/\nkaola-workflow/\n.kw/\n');
    G.git(tmp, ['add', '.gitignore'], { encoding: 'utf8' });
    G.git(tmp, ['commit', '-m', 'add gitignore'], { encoding: 'utf8' });
    const binDir = path.join(tmp, 'bin');
    writeGhShimForStartup(binDir);
    const result = runClaimOnlineLastJson(['startup', '--target-issue', '505'], tmp, binDir, { KAOLA_WORKTREE_NATIVE: '0' });
    assert(result.claim === 'acquired', 'startup 505 should acquire');
    assert(result.worktree_path === '', 'worktree_path must be empty when KAOLA_WORKTREE_NATIVE=0, got: ' + JSON.stringify(result.worktree_path));
    assert(result.worktree_error === undefined, 'worktree_error must be absent when KAOLA_WORKTREE_NATIVE=0 (gate-off path must not surface error field)');
    // Case A: in-place branch must be created and checked out
    const headBranch = G.git(tmp, ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    assert(headBranch === 'workflow/issue-505', 'NATIVE=0 must checkout in-place branch workflow/issue-505, got: ' + headBranch);
    // Tree must be clean (all untracked entries should be gitignored)
    const status = G.git(tmp, ['status', '--porcelain'], { encoding: 'utf8' }).stdout.trim();
    assert(status === '', 'tree must be clean after in-place claim, got: ' + JSON.stringify(status));
    // State file must record base_branch: main
    const stateContent = fs.readFileSync(path.join(tmp, 'kaola-workflow', 'issue-505', 'workflow-state.md'), 'utf8');
    assert(/^base_branch:\s*main\s*$/m.test(stateContent), 'state file must contain base_branch: main, got: ' + stateContent);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
  }
}

function testWorktreeNativeInPlaceIdempotentReclaim() {
  // Case B: idempotent re-claim — folder-absent but branch present -> re-claim uses existing branch
  // Setup: claim 505, then directly remove the project folder (keep branch + HEAD on feature branch),
  // then re-claim. Must not error, claim===acquired, base_branch empty (cur===branch guard).
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-wt-native-idempotent-'));
  const kwRoot = fs.realpathSync(tmp) + '.kw';
  try {
    initGitRepo(tmp);
    fs.writeFileSync(path.join(tmp, '.gitignore'), 'bin/\nkaola-workflow/\n.kw/\n');
    G.git(tmp, ['add', '.gitignore'], { encoding: 'utf8' });
    G.git(tmp, ['commit', '-m', 'add gitignore'], { encoding: 'utf8' });
    const binDir = path.join(tmp, 'bin');
    writeGhShimForStartup(binDir);
    // First claim
    const first = runClaimOnlineLastJson(['startup', '--target-issue', '505'], tmp, binDir, { KAOLA_WORKTREE_NATIVE: '0' });
    assert(first.claim === 'acquired', 'first claim should acquire, got: ' + JSON.stringify(first));
    // Directly remove the project folder — leave branch present, HEAD on workflow/issue-505
    const projDir = path.join(tmp, 'kaola-workflow', 'issue-505');
    fs.rmSync(projDir, { recursive: true, force: true });
    // Verify HEAD is still on feature branch
    const headAfterRemove = G.git(tmp, ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    assert(headAfterRemove === 'workflow/issue-505', 'HEAD should still be on workflow/issue-505 after folder removal, got: ' + headAfterRemove);
    // Re-claim: should use existing branch (not -b), no error, base_branch empty
    const second = runClaimOnlineLastJson(['startup', '--target-issue', '505'], tmp, binDir, { KAOLA_WORKTREE_NATIVE: '0' });
    assert(second.claim === 'acquired', 'second claim should acquire (idempotent), got: ' + JSON.stringify(second));
    const headAfter = G.git(tmp, ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    assert(headAfter === 'workflow/issue-505', 'HEAD should remain workflow/issue-505 after re-claim, got: ' + headAfter);
    // base_branch should be empty (cur === branch guard prevents recording feature as its own base)
    const stateContent = fs.readFileSync(path.join(tmp, 'kaola-workflow', 'issue-505', 'workflow-state.md'), 'utf8');
    const baseBranchMatch = stateContent.match(/^base_branch:\s*(.*)$/m);
    const baseBranch = baseBranchMatch ? baseBranchMatch[1].trim() : '';
    assert(baseBranch === '', 'base_branch must be empty on idempotent re-claim (cur===branch guard), got: ' + JSON.stringify(baseBranch));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
  }
}

// Case C: a dirty tree is a QUESTION about the user's own uncommitted work, not a verdict on it.
// The claim writes nothing and hands back an ask with named options; what happens to somebody's
// unstaged edits is theirs to decide.
function testWorktreeNativeDirtyTreeAsksConsent() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-wt-native-dirty-'));
  const kwRoot = fs.realpathSync(tmp) + '.kw';
  try {
    initGitRepo(tmp);
    // Dirty the tree by modifying a tracked file (README.md is committed)
    fs.writeFileSync(path.join(tmp, 'README.md'), 'dirty\n');
    const binDir = path.join(tmp, 'bin');
    writeGhShimForStartup(binDir);
    const spawnResult = spawnSync(process.execPath, [claimScript, 'startup', '--target-issue', '505'], {
      cwd: tmp,
      encoding: 'utf8',
      timeout: 60000,
      env: {
        ...process.env,
        KAOLA_WORKTREE_NATIVE: '0',
        KAOLA_WORKFLOW_OFFLINE: '0',
        ...ghMockEnv(binDir),
        PATH: binDir + path.delimiter + path.dirname(process.execPath) + path.delimiter + (process.env.PATH || '')
      }
    });
    const lastLine = spawnResult.stdout.trim().split('\n').filter(l => l.trim().startsWith('{')).pop();
    assert(lastLine, 'expected JSON output from the dirty-tree ask, got: ' + spawnResult.stdout);
    const parsed = JSON.parse(lastLine);
    assert(parsed.result === 'consent', 'a dirty tree must route to the consent valve, got: ' + JSON.stringify(parsed.result));
    // The consent valve is a DOOR, not an answer: unlike every demoted claim-time finding, the
    // question is still open and the caller must not read this as "proceed". Exit stays non-zero,
    // matching the halt_pending consent refusal elsewhere in the workflow.
    assert(spawnResult.status !== 0, 'the consent ask keeps a non-zero exit, got: ' + spawnResult.status);
    assert(typeof parsed.ask === 'string' && parsed.ask.indexOf('?') > 0,
      'the consent route must carry an ASK, got: ' + JSON.stringify(parsed.ask));
    assert(Array.isArray(parsed.options) && parsed.options.join(',') === 'commit,stash,worktree',
      'the ask must name the choices its owner picks between, got: ' + JSON.stringify(parsed.options));
    assert(parsed.claim === 'none', 'the ask must claim nothing, got: ' + JSON.stringify(parsed.claim));
    // No project folder should be created
    assert(!fs.existsSync(path.join(tmp, 'kaola-workflow', 'issue-505')), 'project folder must not be created while the ask is open');
    // No feature branch should be created
    const branchCheck = G.git(tmp, ['show-ref', '--verify', '--quiet', 'refs/heads/workflow/issue-505'], { encoding: 'utf8' });
    assert(branchCheck.status !== 0, 'feature branch must not be created while the ask is open');
    // HEAD must remain on main
    const head = G.git(tmp, ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    assert(head === 'main', 'HEAD must remain on main while the ask is open, got: ' + head);
    // And the user's own uncommitted work is exactly where they left it.
    assert(fs.readFileSync(path.join(tmp, 'README.md'), 'utf8') === 'dirty\n',
      'the uncommitted work the ask is ABOUT must be untouched');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
  }
}

// #557: an UNPROBEABLE tree must fail CLOSED (treeDirty returns true). With the KAOLA_WORKFLOW_FORCE_STATUS_FAIL
// [TEST ONLY] seam set on a CLEAN tree, the in-place feature-branch path must STILL stop and ask —
// not proceed on a false "clean". RED before the fix (treeDirty caught the probe fault → returned false →
// "clean" → claim acquired); GREEN after (catch → return true → the consent ask). Mirrors the #496 fix.
// The ask replaced the exit-1 refusal, and the property under test is unchanged: an unverifiable
// tree does not claim, and leaves no folder and no branch behind.
function testTreeDirtyFailsClosedOnProbeFault() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-557-treedirty-fault-'));
  const kwRoot = fs.realpathSync(tmp) + '.kw';
  try {
    initGitRepo(tmp); // CLEAN tree (README committed, nothing modified)
    const binDir = path.join(tmp, 'bin');
    writeGhShimForStartup(binDir);
    const spawnResult = spawnSync(process.execPath, [claimScript, 'startup', '--target-issue', '557'], {
      cwd: tmp, encoding: 'utf8', timeout: 60000,
      env: {
        ...process.env,
        KAOLA_WORKTREE_NATIVE: '0',
        KAOLA_WORKFLOW_OFFLINE: '0',
        KAOLA_WORKFLOW_FORCE_STATUS_FAIL: '1', // [TEST] simulate an unprobeable `git status`
        ...ghMockEnv(binDir),
        PATH: binDir + path.delimiter + path.dirname(process.execPath) + path.delimiter + (process.env.PATH || '')
      }
    });
    const lastLine = spawnResult.stdout.trim().split('\n').filter(l => l.trim().startsWith('{')).pop();
    assert(lastLine, '#557: expected JSON output, got: ' + spawnResult.stdout + ' / ' + spawnResult.stderr);
    const parsed = JSON.parse(lastLine);
    assert(parsed.claim === 'none' && parsed.result === 'consent',
      '#557: an unprobeable tree must fail CLOSED — no claim, and the ask raised instead of a guess, got: ' + JSON.stringify(parsed));
    assert(!fs.existsSync(path.join(tmp, 'kaola-workflow', 'issue-557')), '#557: no project folder on the fail-closed stop');
    const branchCheck = G.git(tmp, ['show-ref', '--verify', '--quiet', 'refs/heads/workflow/issue-557'], { encoding: 'utf8' });
    assert(branchCheck.status !== 0, '#557: no feature branch on the fail-closed stop');
    const head557 = G.git(tmp, ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    assert(head557 === 'main', '#557: HEAD must be unmoved on the fail-closed stop, got: ' + head557);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
  }
}

function testWorktreeNativeDetachedHeadRecordOnly() {
  // Case D: detached HEAD -> claim acquires, no branch created, base_branch absent/empty, note present
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-wt-native-detached-'));
  const kwRoot = fs.realpathSync(tmp) + '.kw';
  try {
    initGitRepo(tmp);
    fs.writeFileSync(path.join(tmp, '.gitignore'), 'bin/\nkaola-workflow/\n.kw/\n');
    G.git(tmp, ['add', '.gitignore'], { encoding: 'utf8' });
    G.git(tmp, ['commit', '-m', 'add gitignore'], { encoding: 'utf8' });
    // Enter detached HEAD state
    const sha = G.git(tmp, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    G.git(tmp, ['checkout', '--detach', sha], { encoding: 'utf8' });
    const binDir = path.join(tmp, 'bin');
    writeGhShimForStartup(binDir);
    const result = runClaimOnlineLastJson(['startup', '--target-issue', '505'], tmp, binDir, { KAOLA_WORKTREE_NATIVE: '0' });
    assert(result.claim === 'acquired', 'detached HEAD must still acquire, got: ' + JSON.stringify(result));
    // No feature branch should be created
    const branchCheck = G.git(tmp, ['show-ref', '--verify', '--quiet', 'refs/heads/workflow/issue-505'], { encoding: 'utf8' });
    assert(branchCheck.status !== 0, 'feature branch must not be created in detached HEAD mode');
    // State file: base_branch should be absent or empty
    const stateContent = fs.readFileSync(path.join(tmp, 'kaola-workflow', 'issue-505', 'workflow-state.md'), 'utf8');
    const baseBranchMatch = stateContent.match(/^base_branch:\s*(.*)$/m);
    const baseBranch = baseBranchMatch ? baseBranchMatch[1].trim() : '';
    assert(baseBranch === '', 'base_branch must be empty/absent in detached HEAD mode, got: ' + JSON.stringify(baseBranch));
    // Note should be present in result
    assert(result.inPlaceNote && result.inPlaceNote.includes('detached'), 'detached HEAD must surface a note, got: ' + JSON.stringify(result.inPlaceNote));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
  }
}

function testWorktreeNativeDiscardRestoresBase() {
  // Case F: discard restores base branch (HEAD->main) and deletes workflow/issue-505
  // Run release from cwd OUTSIDE the project folder to avoid the cwdInside guard.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-wt-native-discard-'));
  const kwRoot = fs.realpathSync(tmp) + '.kw';
  try {
    initGitRepo(tmp);
    fs.writeFileSync(path.join(tmp, '.gitignore'), 'bin/\nkaola-workflow/\n.kw/\n');
    G.git(tmp, ['add', '.gitignore'], { encoding: 'utf8' });
    G.git(tmp, ['commit', '-m', 'add gitignore'], { encoding: 'utf8' });
    const binDir = path.join(tmp, 'bin');
    writeGhShimForStartup(binDir);
    // Claim: should create workflow/issue-505 and base_branch: main
    const claimed = runClaimOnlineLastJson(['startup', '--target-issue', '505'], tmp, binDir, { KAOLA_WORKTREE_NATIVE: '0' });
    assert(claimed.claim === 'acquired', 'startup must acquire, got: ' + JSON.stringify(claimed));
    // Verify we are on the feature branch
    const headOnFeature = G.git(tmp, ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    assert(headOnFeature === 'workflow/issue-505', 'should be on feature branch before release, got: ' + headOnFeature);
    // Release from tmp root (NOT from inside the project folder)
    const releaseResult = runClaimOnlineLastJson(['release', '--project', 'issue-505'], tmp, binDir, { KAOLA_WORKTREE_NATIVE: '0' });
    assert(releaseResult.released === true, 'release must succeed, got: ' + JSON.stringify(releaseResult));
    // HEAD must be restored to main
    const headAfter = G.git(tmp, ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    assert(headAfter === 'main', 'HEAD must be restored to main after discard, got: ' + headAfter);
    // workflow/issue-505 branch must be deleted
    const branchGone = G.git(tmp, ['show-ref', '--verify', '--quiet', 'refs/heads/workflow/issue-505'], { encoding: 'utf8' });
    assert(branchGone.status !== 0, 'workflow/issue-505 branch must be deleted after discard');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
  }
}

function testWorktreeNativeDiscardRestoresNonDefaultBase() {
  // Discriminating test: base_branch is a non-default branch (develop), not 'main'.
  // Verifies that base_branch is actually read (not just defaultBranch() falling back to main).
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-wt-native-discard-develop-'));
  const kwRoot = fs.realpathSync(tmp) + '.kw';
  try {
    initGitRepo(tmp);
    fs.writeFileSync(path.join(tmp, '.gitignore'), 'bin/\nkaola-workflow/\n.kw/\n');
    G.git(tmp, ['add', '.gitignore'], { encoding: 'utf8' });
    G.git(tmp, ['commit', '-m', 'add gitignore'], { encoding: 'utf8' });
    // Create and checkout a non-default base branch 'develop'
    G.git(tmp, ['checkout', '-b', 'develop'], { encoding: 'utf8' });
    fs.writeFileSync(path.join(tmp, 'DEV.md'), 'dev\n');
    G.git(tmp, ['add', 'DEV.md'], { encoding: 'utf8' });
    G.git(tmp, ['commit', '-m', 'dev commit'], { encoding: 'utf8' });
    const binDir = path.join(tmp, 'bin');
    writeGhShimForStartup(binDir);
    // Claim from develop -> base_branch should be 'develop'
    const claimed = runClaimOnlineLastJson(['startup', '--target-issue', '505'], tmp, binDir, { KAOLA_WORKTREE_NATIVE: '0' });
    assert(claimed.claim === 'acquired', 'startup must acquire from develop, got: ' + JSON.stringify(claimed));
    assert(claimed.base_branch === 'develop', 'base_branch must be develop, got: ' + JSON.stringify(claimed.base_branch));
    const stateContent = fs.readFileSync(path.join(tmp, 'kaola-workflow', 'issue-505', 'workflow-state.md'), 'utf8');
    assert(/^base_branch:\s*develop\s*$/m.test(stateContent), 'state must contain base_branch: develop, got: ' + stateContent);
    // Discard from tmp root
    const releaseResult = runClaimOnlineLastJson(['release', '--project', 'issue-505'], tmp, binDir, { KAOLA_WORKTREE_NATIVE: '0' });
    assert(releaseResult.released === true, 'release must succeed, got: ' + JSON.stringify(releaseResult));
    // HEAD must be restored to 'develop' (not 'main')
    const headAfter = G.git(tmp, ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    assert(headAfter === 'develop', 'HEAD must be restored to develop (recorded base_branch) after discard, got: ' + headAfter);
    // workflow/issue-505 branch must be deleted
    const branchGone = G.git(tmp, ['show-ref', '--verify', '--quiet', 'refs/heads/workflow/issue-505'], { encoding: 'utf8' });
    assert(branchGone.status !== 0, 'workflow/issue-505 branch must be deleted after discard (develop base)');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
  }
}

function testWorktreeNativeOfflineWins() {
  // Test: OFFLINE wins over NATIVE — worktree must not be provisioned when offline even if KAOLA_WORKTREE_NATIVE=1
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-wt-offline-wins-'));
  const kwRoot = fs.realpathSync(tmp) + '.kw';
  try {
    initGitRepo(tmp);
    seedClassifierVerdictFromBody(506, '');
    const binDir = path.join(tmp, 'bin');
    writeGhShimForStartup(binDir);
    const spawnResult = spawnSync(process.execPath, [claimScript, 'startup', '--target-issue', '506'], {
      cwd: tmp,
      encoding: 'utf8',
      timeout: 60000,
      env: {
        ...process.env,
        KAOLA_WORKTREE_NATIVE: '1',
        KAOLA_WORKFLOW_OFFLINE: '1',
        PATH: binDir + path.delimiter + path.dirname(process.execPath) + path.delimiter + (process.env.PATH || '')
      }
    });
    assert(!spawnResult.signal, 'offline startup timed out or was killed: ' + spawnResult.signal);
    assert(spawnResult.status === 0, 'offline startup should exit 0, got ' + spawnResult.status + '\nstdout: ' + spawnResult.stdout + '\nstderr: ' + spawnResult.stderr);
    const parsed = JSON.parse(spawnResult.stdout.trim());
    assert(parsed.worktree_path === '', 'worktree_path must be empty when KAOLA_WORKFLOW_OFFLINE=1 even if KAOLA_WORKTREE_NATIVE=1, got: ' + JSON.stringify(parsed.worktree_path));
    assert(parsed.worktree_error === undefined, 'worktree_error must be absent when KAOLA_WORKFLOW_OFFLINE=1 (offline path must not surface error field)');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(kwRoot, { recursive: true, force: true });
  }
}

function testWorktreeNativeSurfacesProvisionFailure() {
  // Regression test for #246: when provisionWorktree throws (EEXIST — a regular file
  // blocks the .kw parent dir), claim must still succeed (acquired), set worktree_path
  // to '', and surface worktree_error matching /EEXIST/.
  // Updated for #264: worktrees now live at <root>/.kw/worktrees/<project>.
  // Block <root>/.kw with a regular file so mkdirSync(<root>/.kw/worktrees, {recursive}) throws EEXIST.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-wt-provision-fail-'));
  // Legacy sibling path (old scheme) — may never be created by new code; harmless cleanup attempt below.
  const kwRoot = fs.realpathSync(tmp) + '.kw';
  // New hidden-local .kw dir inside tmp (block this to cause EEXIST)
  const kwLocal = path.join(fs.realpathSync(tmp), '.kw');
  try {
    initGitRepo(tmp);
    const binDir = path.join(tmp, 'bin');
    writeGhShimForStartup(binDir);
    // Plant a regular FILE at the hidden-local .kw path so mkdirSync(.kw/worktrees, {recursive:true}) throws EEXIST.
    // Must be done AFTER initGitRepo (which needs the dir to be absent), BEFORE the claim.
    fs.writeFileSync(kwLocal, 'x');
    const result = runClaimOnlineLastJson(['startup', '--target-issue', '507'], tmp, binDir);
    assert(result.claim === 'acquired', 'startup 507 should acquire even when provisionWorktree throws, got: ' + JSON.stringify(result.claim));
    assert(result.worktree_path === '', 'worktree_path must be empty when provision fails, got: ' + JSON.stringify(result.worktree_path));
    assert(/EEXIST|ENOTDIR/.test(result.worktree_error), 'worktree_error must match /EEXIST|ENOTDIR/ when provision fails due to file collision, got: ' + JSON.stringify(result.worktree_error));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(kwRoot, { force: true }); } catch (_) {}
  }
}

function testWorktreeAdaptiveSuppressed() {
  // Worktree is ON by default for full/fast, but FORCED OFF for the adaptive path (the adaptive
  // orchestrator does not operate in the worktree). Even with KAOLA_WORKTREE_NATIVE=1, an adaptive
  // claim must NOT provision a worktree, and must NOT surface a worktree_error (policy suppression,
  // not a failed provision attempt).
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-wt-adaptive-suppressed-'));
  const kwRoot = fs.realpathSync(tmp) + '.kw';
  try {
    initGitRepo(tmp);
    const binDir = path.join(tmp, 'bin');
    writeGhShimForStartup(binDir);
    // runClaimOnline hardcodes KAOLA_WORKTREE_NATIVE=1; adaptive is always legal (#538).
    const result = runClaimOnlineLastJson(
      ['startup', '--workflow-path', 'adaptive', '--target-issue', '507'],
      tmp, binDir);
    assert(result.claim === 'acquired', 'adaptive startup 507 should acquire');
    assert(result.worktree_path === '', 'adaptive path must NOT provision a worktree even with KAOLA_WORKTREE_NATIVE=1, got: ' + JSON.stringify(result.worktree_path));
    assert(result.worktree_error === undefined, 'adaptive worktree suppression must not surface worktree_error (policy suppression, not a failed attempt)');
    // Confirm the adaptive path was actually applied (so the empty worktree_path is the guard, not a refusal).
    const state = fs.readFileSync(path.join(tmp, 'kaola-workflow', 'issue-507', 'workflow-state.md'), 'utf8');
    assert(/^workflow_path:\s*adaptive\s*$/m.test(state), 'workflow-state.md must record workflow_path: adaptive (confirms the adaptive path was applied)');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(kwRoot, { recursive: true, force: true });
  }
}

function testClassifierCurrentClaimMarkerBlocks() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-classifier-current-claim-'));
  try {
    const binDir = path.join(tmp, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    writeShimFiles(path.join(binDir, 'gh'), [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('repo view')) { process.stdout.write('{\"owner\":{\"login\":\"test\"},\"name\":\"repo\"}\\n'); }",
      "else if (a.includes('issue view 504')) { process.stdout.write('{\"number\":504,\"title\":\"claimed\",\"body\":\"README.md\",\"labels\":[],\"state\":\"open\"}\\n'); }",
      "else if (a.includes('api repos/test/repo/issues/504/comments')) { process.stdout.write('[{\"body\":\"<!-- kw:claim project=issue-504 -->\",\"updated_at\":\"2099-01-01T00:00:00Z\"}]\\n'); }",
      "else { process.stdout.write('[\\n'); }"
    ]);
    const result = spawnSync(process.execPath, [classifierScript, 'classify', '--issue', '504'], {
      cwd: tmp,
      encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '0', ...ghMockEnv(binDir), PATH: binDir + path.delimiter + path.dirname(process.execPath) + path.delimiter + (process.env.PATH || '') }
    });
    assert(result.status === 0, 'classifier should exit 0 for current claim marker');
    const parsed = JSON.parse(result.stdout.trim());
    assert(parsed.verdict === 'blocked', 'current kw:claim project marker should block remote claimed issue');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testWatchPrArchivesClosedIssuePrFolder() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-watchpr-archive-'));
  const kwRoot = fs.realpathSync(tmp) + '.kw';
  try {
    initGitRepo(tmp);
    const binDir = path.join(tmp, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    writeShimFiles(path.join(binDir, 'gh'), [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue view 200')) { process.stdout.write('{\"state\":\"CLOSED\"}\\n'); }",
      "else if (a.includes('pr view')) { process.stdout.write('{\"state\":\"MERGED\",\"number\":1}\\n'); }",
      "else if (a.includes('repo view')) { process.stdout.write('{\"owner\":{\"login\":\"test\"},\"name\":\"repo\"}\\n'); }",
      "else { process.stdout.write('[\\n'); }"
    ]);
    const projDir = path.join(tmp, 'kaola-workflow', 'watch-pr-test');
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, 'workflow-state.md'), [
      '# Kaola-Workflow State', '',
      '## Project',
      'name: watch-pr-test',
      'status: active',
      '',
      '## Sink',
      'branch: workflow/issue-200',
      'issue_number: 200',
      'sink: pr',
      'pr_url: https://github.com/test/repo/pull/1',
      ''
    ].join('\n'));
    const result = runClaimOnline(['watch-pr'], tmp, binDir);
    assert(result.watched === 1, 'watch-pr should watch the pr-sink folder, got: ' + JSON.stringify(result));
    assert(!fs.existsSync(projDir), 'watch-pr should archive the folder after PR merges');
    assert(fs.existsSync(path.join(tmp, 'kaola-workflow', 'archive')), 'archive dir should exist after watch-pr');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(kwRoot, { recursive: true, force: true });
  }
}

function testSinkFallbackSkipsArchivedProject() {
  const tmp1 = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sinkfb-guard-'));
  try {
    const r1 = json(runNode(claimScript, ['sink-fallback', '--project', 'already-archived'], tmp1));
    assert(r1.updated === false, 'sink-fallback should skip when project is archived, got: ' + JSON.stringify(r1));
    assert(r1.reason === 'project archived', 'sink-fallback should report project archived, got: ' + r1.reason);
    assert(!fs.existsSync(path.join(tmp1, 'kaola-workflow', 'already-archived')), 'sink-fallback must not recreate the archived directory');
  } finally {
    fs.rmSync(tmp1, { recursive: true, force: true });
  }
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sinkfb-positive-'));
  try {
    const projDir = path.join(tmp2, 'kaola-workflow', 'active-project');
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, 'workflow-state.md'), [
      '# Kaola-Workflow State', '',
      '## Project',
      'name: active-project',
      'status: active',
      '',
      '## Sink',
      'branch: workflow/issue-300',
      'issue_number: 300',
      'sink: merge',
      ''
    ].join('\n'));
    const r2 = json(runNode(claimScript, ['sink-fallback', '--project', 'active-project'], tmp2));
    assert(r2.updated === true, 'sink-fallback should succeed for active folder, got: ' + JSON.stringify(r2));
    assert(r2.sink === 'pr', 'sink-fallback should set sink to pr, got: ' + r2.sink);
  } finally {
    fs.rmSync(tmp2, { recursive: true, force: true });
  }
  const tmp3 = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sinkfb-unsafe-'));
  try {
    const r3 = runNode(claimScript, ['sink-fallback', '--project', '../escape'], tmp3);
    assert(r3.status === 1, 'sink-fallback should reject unsafe project name, got exit ' + r3.status);
    assert(r3.stderr.includes('unsafe project name'), 'error should mention unsafe project name, got: ' + r3.stderr);
  } finally {
    fs.rmSync(tmp3, { recursive: true, force: true });
  }
}

function testFinalizeReleaseCleansWorktree() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-finalize-worktree-'));
  const kwRoot = fs.realpathSync(tmp) + '.kw';
  try {
    initGitRepo(tmp);
    const binDir = path.join(tmp, 'bin');
    writeGhShimForStartup(binDir);
    const s601 = runClaimOnline(['startup', '--target-issue', '601'], tmp, binDir);
    assert(s601.claim === 'acquired', 'startup 601 should acquire');
    const wt601 = s601.worktree_path;
    assert(fs.existsSync(wt601), 'worktree 601 should exist after startup');
    seedAdaptiveFinalizeFixture(tmp, 'issue-601');
    runClaimOnline(['finalize', '--project', 'issue-601'], tmp, binDir);
    assert(!fs.existsSync(wt601), 'worktree 601 should be gone after finalize');
    const s602 = runClaimOnline(['startup', '--target-issue', '602'], tmp, binDir);
    assert(s602.claim === 'acquired', 'startup 602 should acquire');
    const wt602 = s602.worktree_path;
    assert(fs.existsSync(wt602), 'worktree 602 should exist after startup');
    runClaimOnline(['release', '--project', 'issue-602', '--reason', 'test'], tmp, binDir);
    assert(!fs.existsSync(wt602), 'worktree 602 should be gone after release');
    const s603 = runClaimOnline(['startup', '--target-issue', '603'], tmp, binDir);
    assert(s603.claim === 'acquired', 'startup 603 should acquire');
    const wt603 = s603.worktree_path;
    assert(fs.existsSync(wt603), 'worktree 603 should exist after startup');
    seedAdaptiveFinalizeFixture(tmp, 'issue-603');
    runClaimOnline(['finalize', '--project', 'issue-603', '--keep-worktree'], tmp, binDir);
    assert(fs.existsSync(wt603), 'keep-worktree finalize should preserve worktree for final commit');
    assert(fs.existsSync(path.join(tmp, 'kaola-workflow', 'archive', 'issue-603')), 'keep-worktree finalize should still archive active folder');
    const s604 = runClaimOnline(['startup', '--target-issue', '604'], tmp, binDir);
    assert(s604.claim === 'acquired', 'startup 604 should acquire');
    const wt604 = s604.worktree_path;
    assert(fs.existsSync(wt604), 'worktree 604 should exist after startup');
    runClaimOnline(['release', '--project', 'issue-604', '--reason', 'git-freshness-block'], tmp, binDir);
    assert(!fs.existsSync(wt604), 'worktree 604 should be gone after git-freshness-block release');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(kwRoot, { recursive: true, force: true });
  }
}

function testFinalizeFromLinkedWorktreeCleansMainCopy() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-finalize-linked-main-')));
  const kwRoot = tmp + '.kw';
  try {
    initGitRepo(tmp);
    const binDir = path.join(tmp, 'bin');
    writeGhShimForStartup(binDir);

    // Plant active folder in main worktree
    plantActiveFolder(tmp, 'issue-701', 701, null);

    // Create linked worktree
    const wtPath = path.join(kwRoot, 'issue-701');
    fs.mkdirSync(kwRoot, { recursive: true });
    G.git(tmp, ['worktree', 'add', '-b', 'workflow/issue-701', '--', wtPath, 'HEAD'], { encoding: 'utf8' });

    // Plant active folder inside the linked worktree (mirrors main copy)
    plantActiveFolder(wtPath, 'issue-701', 701, null);
    seedAdaptiveFinalizeFixture(tmp, 'issue-701');
    seedAdaptiveFinalizeFixture(wtPath, 'issue-701');
    alignFinalizeFixtureAcrossRoots(tmp, wtPath, 'issue-701');

    // Use --keep-worktree so the linked worktree directory is not removed after archiving;
    // this lets us assert where the archive landed. archiveProjectDir runs (and performs
    // cleanup) regardless of --keep-worktree.
    const result = spawnSync(process.execPath, [claimScript, 'finalize', '--project', 'issue-701', '--keep-worktree'], {
      cwd: wtPath,
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' },
      encoding: 'utf8'
    });

    assert(
      result.status === 0,
      'finalize from linked worktree should exit 0\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr
    );
    assert(
      !fs.existsSync(path.join(tmp, 'kaola-workflow', 'issue-701')),
      'main worktree copy of issue-701 must be cleaned up after finalize from linked worktree'
    );
    // #832: the archive is anchored to MAIN's project root, not the invoking worktree. The sink
    // removes the linked worktree at cleanup, so an archive written inside it is destroyed by the
    // very next step (this assertion used to require the opposite — it pinned the data loss).
    assert(
      fs.existsSync(path.join(tmp, 'kaola-workflow', 'archive', 'issue-701')),
      'archive must exist in MAIN after finalize --keep-worktree from the linked worktree (#832)'
    );
    assert(
      !fs.existsSync(path.join(wtPath, 'kaola-workflow', 'issue-701')),
      'worktree live copy of issue-701 must be cleaned up after finalize --keep-worktree (#426)'
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(kwRoot, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// #832 — the run archive must not be written into the tree the sink is about to delete.
//
// `finalize --project P --keep-worktree` is invoked FROM the linked worktree (the documented
// node-cwd locus). The destination was derived per call site — `keepWorktree ? linkedRoot :
// mainRoot` — so the run's whole evidence trail landed at `.kw/worktrees/P/kaola-workflow/archive/P`
// and `sink-merge --sink` removed that worktree at cleanup, taking the archive with it. ONE
// resolution rule: the archive destination resolves against MAIN's project root regardless of
// invocation cwd. The last assertion is the incident itself — remove the worktree exactly as the
// sink does, and the run record must still be there.
// ---------------------------------------------------------------------------
function testArchiveDestinationResolvesAgainstMain832() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-archive-dest-832-')));
  const kwRoot = tmp + '.kw';
  const project = 'issue-8321';
  try {
    initGitRepo(tmp);
    plantActiveFolder(tmp, project, 8321, null);
    const wtPath = path.join(kwRoot, project);
    fs.mkdirSync(kwRoot, { recursive: true });
    G.git(tmp, ['worktree', 'add', '-b', 'workflow/' + project, '--', wtPath, 'HEAD'], { encoding: 'utf8' });
    plantActiveFolder(wtPath, project, 8321, null);
    seedAdaptiveFinalizeFixture(tmp, project);
    seedAdaptiveFinalizeFixture(wtPath, project);
    alignFinalizeFixtureAcrossRoots(tmp, wtPath, project);
    // The per-node gate evidence — the artifact class the incident destroyed. It lives in the
    // WORKTREE copy (the executor's cwd), which is the folder this finalize archives.
    const EVIDENCE = 'evidence-binding: n1 nonce8321\nverdict: pass\n';
    fs.writeFileSync(path.join(wtPath, 'kaola-workflow', project, '.cache', 'n1.md'), EVIDENCE);

    const result = spawnSync(process.execPath, [claimScript, 'finalize', '--project', project, '--keep-worktree'], {
      cwd: wtPath, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8'
    });
    assert(
      result.status === 0,
      '#832: finalize --keep-worktree from the linked worktree must exit 0\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr
    );
    const emitted = String(result.stdout).trim().split('\n').filter(l => l.trim().startsWith('{'));
    const out = emitted.length ? JSON.parse(emitted[emitted.length - 1]) : {};

    // (1) ONE resolution rule: the emitted destination is anchored to MAIN's project root...
    const mainArchiveBase = path.join(tmp, 'kaola-workflow', 'archive') + path.sep;
    assert(
      typeof out.dest === 'string' && out.dest.startsWith(mainArchiveBase),
      '#832: the archive destination must resolve against MAIN\'s project root regardless of '
        + 'invocation cwd; expected a path under ' + mainArchiveBase + ', got ' + JSON.stringify(out.dest)
    );
    // ...and never into the linked worktree the sink removes.
    assert(
      typeof out.dest === 'string' && !out.dest.startsWith(kwRoot + path.sep),
      '#832: the archive destination must never resolve into the linked worktree; got ' + JSON.stringify(out.dest)
    );

    // (2) the archive is really on main's disk, with the run's evidence inside it.
    const mainArchive = path.join(tmp, 'kaola-workflow', 'archive', project);
    assert(
      fs.existsSync(path.join(mainArchive, 'workflow-state.md')),
      '#832: main must hold the archived workflow-state.md after the keep-worktree finalize'
    );
    assert(
      fs.existsSync(path.join(mainArchive, '.cache', 'n1.md'))
        && fs.readFileSync(path.join(mainArchive, '.cache', 'n1.md'), 'utf8') === EVIDENCE,
      '#832: main\'s archive must carry the run\'s per-node gate evidence byte-for-byte'
    );

    // (3) THE INCIDENT: the sink removes the linked worktree at cleanup. The run record survives.
    G.git(tmp, ['worktree', 'remove', '--force', '--', wtPath], { encoding: 'utf8' });
    assert(
      !fs.existsSync(wtPath),
      '#832: precondition — the worktree teardown the sink performs actually removed the tree'
    );
    assert(
      fs.existsSync(path.join(mainArchive, '.cache', 'n1.md')),
      '#832: the run archive must SURVIVE the sink\'s worktree removal — this is the data loss'
    );
  } finally {
    try { G.git(tmp, ['worktree', 'prune'], { encoding: 'utf8' }); } catch (_) {}
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(kwRoot, { recursive: true, force: true });
  }
  console.log('testArchiveDestinationResolvesAgainstMain832: PASSED');
}

// ---------------------------------------------------------------------------
// #832 — `archive_commit` must never report success for an operation git REFUSED.
//
// On a consumer whose .gitignore covers `kaola-workflow/archive`, git prints "The following paths
// are ignored by one of your .gitignore files" and stages nothing from the archive. The staging
// failure was swallowed in a bare `catch (_)`, and the staged-ness probe that followed carried NO
// pathspec — so the roadmap bookkeeping staged alongside it was enough to make the transaction
// record archive_commit:'committed'. Every "archived" claim on such a consumer is silently false.
// The honest token is `skipped_gitignored`; 'committed' and 'nothing_to_commit' both read as success.
// ---------------------------------------------------------------------------
function testArchiveCommitHonestUnderGitignore832() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-archive-ignored-832-')));
  const kwRoot = tmp + '.kw';
  const project = 'issue-8322';
  try {
    initGitRepo(tmp);
    // The consumer ignores the archive band (the vrpai-cli shape). Committed BEFORE the worktree
    // is created so the feature branch inherits it.
    fs.writeFileSync(path.join(tmp, '.gitignore'), 'kaola-workflow/archive/\n');
    plantActiveFolder(tmp, project, 8322, null);
    seedClassifierVerdictFromBody(8322, '');
    G.git(tmp, ['add', '-A'], { encoding: 'utf8' });
    G.git(tmp, ['commit', '-m', 'plant + gitignore archive'], { encoding: 'utf8' });

    const wtPath = path.join(kwRoot, project);
    fs.mkdirSync(kwRoot, { recursive: true });
    G.git(tmp, ['worktree', 'add', '-b', 'workflow/' + project, '--', wtPath, 'HEAD'], { encoding: 'utf8' });
    plantActiveFolder(wtPath, project, 8322, null);
    seedAdaptiveFinalizeFixture(tmp, project);
    seedAdaptiveFinalizeFixture(wtPath, project);
    alignFinalizeFixtureAcrossRoots(tmp, wtPath, project);

    const result = spawnSync(process.execPath, [claimScript, 'finalize', '--project', project, '--keep-worktree'], {
      cwd: wtPath, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8'
    });
    assert(
      result.status === 0,
      '#832: finalize on a gitignored-archive consumer must still exit 0\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr
    );
    const emitted = String(result.stdout).trim().split('\n').filter(l => l.trim().startsWith('{'));
    const out = emitted.length ? JSON.parse(emitted[emitted.length - 1]) : {};

    // Precondition — git genuinely refused: no archive path reached the feature branch HEAD.
    const tree = G.git(wtPath, ['ls-tree', '-r', '--name-only', 'HEAD'], { encoding: 'utf8' }).stdout || '';
    assert(
      !/kaola-workflow\/archive\//.test(tree),
      '#832: precondition — the ignored archive genuinely never reached HEAD; got:\n' + tree
    );

    // ...so the transaction ledger must SAY so, in one word, rather than report a commit.
    const tx = out.finalize_transaction || {};
    assert(
      tx.archive_commit === 'skipped_gitignored',
      '#832: finalize_transaction.archive_commit must be "skipped_gitignored" when git refuses the '
        + 'ignored archive paths; got ' + JSON.stringify(tx.archive_commit)
        + '\nfull transaction: ' + JSON.stringify(tx)
    );

    // The honest skip must not also destroy the archive it declined to commit.
    assert(
      typeof out.dest === 'string' && fs.existsSync(path.join(out.dest, 'workflow-state.md')),
      '#832: the archive must survive on disk after an honest skipped_gitignored; dest=' + JSON.stringify(out.dest)
    );
  } finally {
    try { G.git(tmp, ['worktree', 'remove', '--force', '--', path.join(kwRoot, project)], { encoding: 'utf8' }); } catch (_) {}
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(kwRoot, { recursive: true, force: true });
  }
  console.log('testArchiveCommitHonestUnderGitignore832: PASSED');
}

// ---------------------------------------------------------------------------
// #930 — archiving must never relocate a directory that is not a project folder.
//
// `workflow_project:` is adopted verbatim and filtered only by isSafeName, which rejects nothing
// but the empty string, `.`, `..`, a separator and NUL. `.roadmap` therefore passes: the claim
// writes workflow-state.md straight into kaola-workflow/.roadmap/ beside the roadmap SOURCES, and
// finalize then archives "the project" — carrying _rules.md, .gitkeep and every unrelated
// issue-*.md into kaola-workflow/archive/.roadmap/ at exit 0, with closure_invariants
// {ok:true, violations:[]} and no finding of any kind. From a linked worktree it is worse: BOTH
// checkouts lose the folder AND the deletion is committed to the feature branch — the branch the
// sink merges to main.
//
// The claim side has moved since, in one half of it. #932 scoped the claim's ROLLBACK to what the
// transaction created, so a FAILED claim no longer destroys the directory it adopted. The other
// half stands: the claim still ADOPTS a reserved name and SUCCEEDS at exit 0, writing
// workflow-state.md and .cache/ into kaola-workflow/.roadmap/ beside the sources — that is #933,
// and this scenario does not pin it. What IS pinned here is the ARCHIVE side, and only as a
// RESULT — refusing, resolving the name, or anything else all satisfy it. The reserved directory's
// own content must still be on disk in every checkout and still on the feature branch, and no run
// may report a successful archive it did not perform.
//
// Four names run through ONE predicate, and NONE of them is a control: every one of them could be
// destroyed. `archive` in particular is not the safe sibling it looks like — whether it survived
// used to depend on the FIXTURE, not on the name. A large archive band made the completeness
// verifier refuse; a small one copies cleanly and the run deletes both live copies at exit 0. Any
// claim that one of these names is inherently safe is a claim about a fixture.
//
// `Archive` is the same directory as `archive` wherever the filesystem is case-insensitive (APFS
// and NTFS by default), so a name-equality test on the caller-supplied string is not a test about
// the directory it protects. That arm runs only where the aliasing is real, probed rather than
// assumed, and it pins the RESULT there — not a casing rule, which is the implementer's to choose.
//
// FOREIGN vs the run's own: only content that predates the claim is pinned. workflow-state.md,
// .cache/ and the run's OWN roadmap source are the run's to move — closure removing the closed
// issue's source file is the documented contract, not the damage.
// ---------------------------------------------------------------------------
function testArchiveNeverRelocatesReservedDir930() {
  // Is this filesystem case-insensitive? Probed, because it decides whether `Archive` and
  // `archive` name the same directory and therefore whether the aliasing arm has a subject at all.
  const caseProbeDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-case-probe-930-')));
  let caseInsensitiveFs = false;
  try {
    fs.writeFileSync(path.join(caseProbeDir, 'CaseProbe'), '');
    caseInsensitiveFs = fs.existsSync(path.join(caseProbeDir, 'caseprobe'));
  } finally { fs.rmSync(caseProbeDir, { recursive: true, force: true }); }

  const CASES = [
    {
      reserved: '.roadmap',
      issue: 9301,
      // The roadmap sources. issue-9301.md is the RUN's own source (closure may remove it) and is
      // planted separately; everything below is the rest of the backlog and the project rules.
      foreign: {
        '.gitkeep': '',
        '_rules.md': '# Project rules\n\nEvery run reads this file.\n',
        'issue-9302.md': 'issue: #9302\ntitle: unrelated backlog item\nstatus: open\nworkflow_project: —\nnext_step: ready\n',
        'issue-9303.md': 'issue: #9303\ntitle: second unrelated backlog item\nstatus: open\nworkflow_project: —\nnext_step: ready\n',
      },
      forbiddenDest: true,
    },
    {
      reserved: '.origin',
      issue: 9304,
      foreign: {
        'dead-exports-audit.md': 'a durable origin note\n',
        '877/loadbearing.md': 'a nested origin artifact\n',
      },
      forbiddenDest: true,
    },
    {
      reserved: 'archive',
      issue: 9305,
      foreign: {
        'issue-9300/workflow-state.md': '# Kaola-Workflow State\n\n## Project\nname: issue-9300\nstatus: closed\n',
      },
      // `archive/archive` is not forbidden here: an attempt that ends in refusal can leave a
      // partial self-copy of the band behind, and that residue destroys nothing. Preservation, the
      // directory's SET and honesty carry this case; the copy is the mechanism's business.
      forbiddenDest: false,
    },
    {
      // The SAME directory, addressed in a casing the caller chose. Only runs where the filesystem
      // actually aliases the two; elsewhere `Archive` is a genuinely separate name and there is
      // nothing here to protect.
      reserved: 'archive',
      given: 'Archive',
      issue: 9306,
      skip: !caseInsensitiveFs,
      foreign: {
        'issue-9300/workflow-state.md': '# Kaola-Workflow State\n\n## Project\nname: issue-9300\nstatus: closed\n',
        'issue-9300/mission-list.md': '# a prior run record\n',
      },
      forbiddenDest: false,
    },
  ];

  const seedForeign = (root, c) => {
    for (const [rel, body] of Object.entries(c.foreign)) {
      const f = path.join(root, 'kaola-workflow', c.reserved, rel);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, body);
    }
  };

  // Everything under a directory, as a sorted list of relative paths.
  const listTree = dir => {
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
  };

  // The only files finalize is KNOWN to create inside the project folder before it ever reaches the
  // archive step — the finalization-summary writers, which run ahead of the archive call. Named
  // rather than tolerated silently: a refusal that reports it touched nothing still leaves this
  // behind, and (1b) below exists so the next addition cannot arrive unseen.
  const KNOWN_ADDITIONS = new Set(['finalization-summary.md']);

  // ONE predicate, applied to every name in every lane.
  const assertSurvived = (c, label, result, roots, mainRoot, branchRoot, before) => {
    const emitted = String(result.stdout).trim().split('\n').filter(l => l.trim().startsWith('{'));
    let out = {};
    try { out = emitted.length ? JSON.parse(emitted[emitted.length - 1]) : {}; } catch (_) { out = {}; }

    // (1) THE DEMANDED RESULT: the reserved directory and its own content are still in place —
    // in EVERY checkout, byte for byte.
    for (const [rootLabel, root] of roots) {
      const dir = path.join(root, 'kaola-workflow', c.reserved);
      assert(
        fs.existsSync(dir),
        '#930 ' + label + ': kaola-workflow/' + c.reserved + ' must still exist in the ' + rootLabel
          + ' checkout after finalize\nexit: ' + result.status + '\nstdout: ' + result.stdout
      );
      for (const [rel, body] of Object.entries(c.foreign)) {
        const f = path.join(dir, rel);
        assert(
          fs.existsSync(f),
          '#930 ' + label + ': ' + rootLabel + ' checkout lost kaola-workflow/' + c.reserved + '/' + rel
            + ' — archiving relocated a directory that is not a project folder'
            + '\nexit: ' + result.status + '\nstdout: ' + result.stdout
        );
        assert(
          read(f) === body,
          '#930 ' + label + ': ' + rootLabel + ' checkout altered kaola-workflow/' + c.reserved + '/' + rel
        );
      }
    }

    // (1b) THE DIRECTORY AS A SET. Presence-and-bytes above cannot see a file ADDED inside the
    // reserved directory, so a future step could quietly write into a directory the run reports it
    // did not touch. Everything present that was not there before must be a declared addition.
    for (const [rootLabel, root] of roots) {
      const after = listTree(path.join(root, 'kaola-workflow', c.reserved));
      const seen = (before && before.get(rootLabel)) || [];
      const added = after.filter(p => !seen.includes(p) && !KNOWN_ADDITIONS.has(p));
      assert(
        added.length === 0,
        '#930 ' + label + ': the ' + rootLabel + ' checkout gained undeclared entries inside '
          + 'kaola-workflow/' + c.reserved + '/: ' + JSON.stringify(added)
          + ' — archiving must not write into a directory that is not a project folder. If the '
          + 'addition is intended, declare it in KNOWN_ADDITIONS with the writer that makes it.'
          + '\nexit: ' + result.status
      );
    }

    // (2) and it was not relocated into the archive under its own name.
    if (c.forbiddenDest) {
      const dest = path.join(mainRoot, 'kaola-workflow', 'archive', c.reserved);
      assert(
        !fs.existsSync(dest),
        '#930 ' + label + ': nothing may be archived under ' + path.join('kaola-workflow', 'archive', c.reserved)
          + ' — ' + c.reserved + ' is not a project folder; found: '
          + JSON.stringify(fs.existsSync(dest) ? fs.readdirSync(dest) : [])
      );
    }

    // (3) NOT A SILENT SUCCESS. A run that did not archive the reserved directory must not report
    // that it did. Exiting non-zero satisfies this outright; an exit-0 report-and-continue
    // satisfies it by not claiming the archive.
    const receiptArchive = (out.closure_receipt || {}).archive;
    assert(
      result.status !== 0 || (out.archived !== true && receiptArchive !== 'closed'),
      '#930 ' + label + ': finalize must not exit 0 reporting a successful archive of ' + c.reserved
        + ' that it did not perform — got archived=' + JSON.stringify(out.archived)
        + ', closure_receipt.archive=' + JSON.stringify(receiptArchive)
        + ', closure_invariants=' + JSON.stringify(out.closure_invariants)
        + '\nstdout: ' + result.stdout
    );

    // (4) THE WORST LANE: the deletion must never reach the branch the sink merges to main.
    if (branchRoot) {
      for (const [rel, body] of Object.entries(c.foreign)) {
        const show = G.git(branchRoot, ['show', 'HEAD:kaola-workflow/' + c.reserved + '/' + rel], { encoding: 'utf8' });
        assert(
          show.status === 0,
          '#930 ' + label + ': the feature-branch HEAD no longer carries kaola-workflow/' + c.reserved + '/' + rel
            + ' — finalize committed the deletion onto the branch the sink merges to main'
            + '\ngit show: ' + String(show.stderr || '').trim()
            + '\nbranch log:\n' + String(G.git(branchRoot, ['log', '--oneline', '-3'], { encoding: 'utf8' }).stdout || '')
        );
        assert(
          String(show.stdout) === body,
          '#930 ' + label + ': the feature-branch HEAD altered kaola-workflow/' + c.reserved + '/' + rel
        );
      }
    }
  };

  let ranCases = 0;
  for (const c of CASES) {
    if (c.skip) {
      console.log('  #930 skipped ' + JSON.stringify(c.given || c.reserved)
        + ': this filesystem is case-sensitive, so it does not alias the reserved directory');
      continue;
    }
    ranCases++;
    // The name the CALLER supplies. It is the directory's own name except in the aliasing arm,
    // where the point is that the two differ as strings and not on disk.
    const given = c.given || c.reserved;

    // ---- lane 1: in place, finalize invoked from the main checkout ----
    {
      const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-reserved-main-930-')));
      try {
        initGitRepo(tmp);
        seedForeign(tmp, c);
        seedClassifierVerdictFromBody(c.issue, '');            // the RUN's own source; closure may remove it
        G.git(tmp, ['add', '-A'], { encoding: 'utf8' });
        G.git(tmp, ['commit', '-m', 'seed reserved directory'], { encoding: 'utf8' });
        plantActiveFolder(tmp, given, c.issue, null);
        seedAdaptiveFinalizeFixture(tmp, given);
        const before = new Map([['main', listTree(path.join(tmp, 'kaola-workflow', c.reserved))]]);

        const result = spawnSync(process.execPath, [claimScript, 'finalize', '--project', given], {
          cwd: tmp, env: { ...process.env, ...GIT_ISOLATION_ENV, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8'
        });
        assertSurvived(c, given + ' / main lane', result, [['main', tmp]], tmp, null, before);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    }

    // ---- lane 2: linked worktree, finalize invoked from the worktree (what a real run does) ----
    {
      const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-reserved-wt-930-')));
      const kwRoot = tmp + '.kw';
      const wtPath = path.join(kwRoot, 'issue-' + c.issue);
      try {
        initGitRepo(tmp);
        seedForeign(tmp, c);
        seedClassifierVerdictFromBody(c.issue, '');
        G.git(tmp, ['add', '-A'], { encoding: 'utf8' });
        G.git(tmp, ['commit', '-m', 'seed reserved directory'], { encoding: 'utf8' });
        fs.mkdirSync(kwRoot, { recursive: true });
        G.git(tmp, ['worktree', 'add', '-b', 'workflow/issue-' + c.issue, '--', wtPath, 'HEAD'], { encoding: 'utf8' });
        plantActiveFolder(tmp, given, c.issue, null);
        plantActiveFolder(wtPath, given, c.issue, null);
        seedAdaptiveFinalizeFixture(tmp, given);
        seedAdaptiveFinalizeFixture(wtPath, given);
        alignFinalizeFixtureAcrossRoots(tmp, wtPath, given);
        const before = new Map([
          ['main', listTree(path.join(tmp, 'kaola-workflow', c.reserved))],
          ['worktree', listTree(path.join(wtPath, 'kaola-workflow', c.reserved))],
        ]);

        const result = spawnSync(
          process.execPath, [claimScript, 'finalize', '--project', given, '--keep-worktree'],
          { cwd: wtPath, env: { ...process.env, ...GIT_ISOLATION_ENV, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' }
        );
        assertSurvived(c, given + ' / linked-worktree lane', result,
          [['main', tmp], ['worktree', wtPath]], tmp, wtPath, before);
      } finally {
        try { G.git(tmp, ['worktree', 'remove', '--force', '--', wtPath], { encoding: 'utf8' }); } catch (_) {}
        try { G.git(tmp, ['worktree', 'prune'], { encoding: 'utf8' }); } catch (_) {}
        fs.rmSync(tmp, { recursive: true, force: true });
        fs.rmSync(kwRoot, { recursive: true, force: true });
      }
    }
  }
  // The count is printed, not asserted: on a case-sensitive filesystem the aliasing arm has no
  // subject and is skipped above with a reason. A silent skip is what this line prevents.
  console.log('testArchiveNeverRelocatesReservedDir930: PASSED (' + ranCases + '/' + CASES.length
    + ' names x 2 lanes)');
}

// testClaimNeverDeletesWhatItDidNotCreate932 stood here — #932's rollback-safety pin (a FAILED
// claim must not delete adopted-but-foreign content), driven through `startup --target-issue`
// specifically so its first case could resolve the project name to the reserved `.roadmap` via a
// planted `workflow_project:` field. ADR 0018 §5 retired projectNameForIssue's read of that field
// entirely (it now always returns the issue-N fallback) — the vulnerability this case pinned, a
// claim resolving to a reserved directory via workflow_project:, can no longer occur through any
// path. The rollback-safety property itself is not lost: testClaimRollbackRemovesOnlyWhatItCreated932
// below covers the identical created-vs-adopted contrast through the `claim --project` door, which
// never depended on this field. Deleted with the mechanism.


// ---------------------------------------------------------------------------
// #932 — the SAME rollback, over a directory the claim CREATED and one it ADOPTED.
//
// The PAIR is the point. The test above says foreign content survives; on its own that is
// satisfiable by a rollback that stops cleaning up at all, which only trades lost data for orphaned
// folders. So this one holds the fault, the entry point and the code path fixed and varies exactly
// ONE thing — whether the project directory was already on disk — and requires the two outcomes to
// differ: what the claim MADE is removed, what it FOUND is not.
//
// ONE fault for both legs, with nothing planted on the filesystem. `--codex-dispatch-mode` is a
// registered value flag that `cmdClaim` hands straight to `claimProject` (only `cmdStartup` strips
// it), and a newline in it makes writeState's #398.2 anti-injection fence refuse INSIDE the
// transaction. A shipped guard, on a shipped CLI door, landing in the rollback exactly as an ENOSPC
// or an EIO would — the rollback does not inspect the error, it rm -rf's on any throw. It is also a
// second, unrelated fault reaching the same destruction as the `.cache`-ENOTDIR one above, which is
// what makes the finding about the rollback rather than about either injection.
//
// THE CREATED LEG IS ALSO THIS TEST'S LIVENESS CONTROL, which is why it earns its cost twice. If
// the fault ever stops firing — the flag retired, the fence moved, the shim widened to `claim` —
// the claim SUCCEEDS, its folder is still on disk afterwards, and the created leg reds. The adopted
// leg cannot go quietly vacuous behind it.
//
// GREEN ON BASELINE IS EXPECTED FOR THE CREATED LEG: it is a control, not a falsifier. Baseline
// already removes what it created. What it forbids is a fix that answers #932 by not deleting.
//
// NO additions-set assertion on the adopted leg. On THIS door nothing has been written when the
// fence throws — `cmdClaim` never sets `selectionRecordBytes` (that assignment lives in
// `cmdStartup`), so `persistSelectionRecord` does not run at all and the adopted folder is still
// byte-for-byte what it was. So the assertion would be sound here; it is simply already carried,
// per edition and on this same door, by leg A of scripts/test-forge-claim-rollback-scoping.js.
// That suite's leg B covers what no scenario here can reach: the `startup` door DOES set the bytes,
// so the record is written into the adopted folder and then taken back out with its directories.
// ---------------------------------------------------------------------------
function testClaimRollbackRemovesOnlyWhatItCreated932() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-claim-created-vs-adopted-932-')));
  // A newline in a durable field. Passed as one argv element, so no shell quoting is involved.
  const FAULT = ['--codex-dispatch-mode', 'v2-task-name\ninjected'];
  try {
    initGitRepo(tmp);

    // The ADOPTED leg's folder: already on disk, stateless, holding work the claim did not create.
    const adoptedDir = path.join(tmp, 'kaola-workflow', 'issue-9324');
    const foreign = {
      'evidence.md': 'measurements a successor still needs\n',
      'notes/handoff.md': 'what the crashed run had figured out\n',
    };
    for (const [rel, body] of Object.entries(foreign)) {
      const f = path.join(adoptedDir, rel);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, body);
    }
    G.git(tmp, ['add', '-A'], { encoding: 'utf8' });
    G.git(tmp, ['commit', '-m', 'seed content the claim did not create'], { encoding: 'utf8' });

    // The CREATED leg's folder does not exist yet. That absence is the whole variable.
    const createdDir = path.join(tmp, 'kaola-workflow', 'issue-9323');
    assert(!fs.existsSync(createdDir), 'fixture: the created leg starts with no folder of its own');
    assert(!fs.existsSync(path.join(adoptedDir, 'workflow-state.md')),
      'fixture: the adopted folder carries no state file, which is what makes the claim adopt it');

    const created = runNode(claimScript, ['claim', '--project', 'issue-9323', '--issue', '9323', ...FAULT], tmp);
    const adopted = runNode(claimScript, ['claim', '--project', 'issue-9324', '--issue', '9324', ...FAULT], tmp);
    const ctx = r => '\nexit: ' + r.status + '\nstdout: ' + String(r.stdout).trim()
      + '\nstderr: ' + String(r.stderr).trim();

    // (1) THE CONTROL: what the claim MADE is still cleaned up. Green on baseline by design, and
    // the liveness witness for (2) — a fault that stopped firing leaves this folder behind.
    assert(!fs.existsSync(createdDir),
      '#932 control: a rollback must still remove the folder the claim itself created, or the '
      + 'answer to #932 is orphans instead of data loss — kaola-workflow/issue-9323 is still there'
      + ctx(created));

    // (2) THE DEMANDED RESULT: what the claim FOUND is untouched. Same fault, same door, same
    // rollback line; the only difference from (1) is that this folder was already on disk.
    assert(fs.existsSync(adoptedDir),
      '#932: kaola-workflow/issue-9324 must still exist after a claim that failed — the claim did '
      + 'not create it' + ctx(adopted));
    for (const [rel, body] of Object.entries(foreign)) {
      const f = path.join(adoptedDir, rel);
      assert(fs.existsSync(f),
        '#932: the failed claim deleted kaola-workflow/issue-9324/' + rel
        + ' — a file it did not create' + ctx(adopted));
      assert(read(f) === body,
        '#932: the failed claim altered kaola-workflow/issue-9324/' + rel + ctx(adopted));
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('testClaimRollbackRemovesOnlyWhatItCreated932: PASSED (created removed, adopted intact)');
}

// ---------------------------------------------------------------------------
// #933 — a claim must not write RUN STATE into a directory that is not a project folder.
//
// #930 closed the ARCHIVE side and said in as many words that the claim side was deliberately
// unchanged; #932 scoped the FAILED claim's rollback. Neither reaches the claim that SUCCEEDS.
// `isReservedWorkflowDirName` has exactly one call site, inside `archiveProjectDir`, and no
// claim-path caller at all — so a claim resolving `.roadmap` or `archive` still acquires it at
// exit 0 and writes workflow-state.md, and through the startup door `.cache/origin/`, in among
// the roadmap SOURCES or the archive band. The state it writes carries the reserved name forward:
// `name:` and `next_command:` both name it, so every later resume addresses it too.
//
// THE OWNER RULED THE BEHAVIOUR: resolve around the reserved name and REPORT the swap. The claim
// SUCCEEDS. So this is not a refusal scenario — exit 0 and an acquiring envelope are REQUIRED here,
// and an answer to #933 that refuses at the claim site reds this on purpose.
//
// TWO DOORS, NOT TWO VARIANTS OF ONE. In the flag cases an operator types the name. In the
// roadmap-data case NOBODY types anything: `workflow_project: .roadmap` sits in
// kaola-workflow/.roadmap/issue-<N>.md and `projectNameForIssue` reads it back out verbatim, gated
// only by `isSafeName` — which is path safety (no separator, no NUL, not `.` or `..`), not policy,
// and passes both names. A guard on the roadmap-AUTHORING side answers the second and not the first.
//
// `Archive` is the same directory as `archive` wherever the filesystem is case-insensitive (APFS
// and NTFS by default), which is the whole reason it is here: on such a volume the claim's mkdir
// puts its state INSIDE the archive band under a name that merely looks new. That arm runs only
// where the aliasing is real, probed rather than assumed — on a case-sensitive volume `Archive` is
// a genuinely distinct name that could legitimately be a project, and folding it anyway is the
// implementer's call, not this scenario's.
//
// TWO ENVELOPE KEYS, PINNED BY NAME — a deliberate exception to pinning results only. The
// substitution has to be VISIBLE to whatever reads a claim envelope, and "some field somewhere
// mentions the string" is not falsifiable in this fixture: the run's own roadmap source is at a
// path containing `.roadmap`, so a scan across every field would go green on an unrelated echo.
// So the pair is a contract and is asserted as one:
//
//   * `reserved_project` — the declined name, DISCRETE, exactly as the caller supplied it;
//   * `reserved_project_note` — the prose, which a human reads.
//
// The pairing is this tree's own, not an invention: #403.8 put `worktree_error_class` beside
// `worktree_error` so a caller "has a machine-readable signal instead of having to parse a raw git
// error string", and a substitution reported only in prose would re-make the mistake that corrected.
// `reserved_project` is what a consumer keys on; the note's WORDING is pinned no further than
// naming the declined directory case-insensitively, and whether it also names the substitute is the
// implementer's — the substitute is already on `project` and in workflow-state.md.
//
// VERBATIM, on the aliasing arm, means `Archive` and not `archive`. Which directory it collided
// with is what `project` and the filesystem assertions already establish; what only the caller
// knows is what the caller ASKED for, so that is what the discrete field has to carry back.
//
// FOREIGN vs the run's own: only content that predates the claim AND does not belong to this run is
// pinned byte-for-byte. The run's own roadmap source lives inside `.roadmap` and is pinned as
// still-PRESENT only, so a fix that records the resolved project name back into it stays legal.
// ---------------------------------------------------------------------------
function testClaimNeverAdoptsReservedDir933() {
  // The envelope keys carrying the substitution report — the discrete one a consumer keys on, and
  // the prose beside it. See the header: these two names are a contract rather than a mechanism,
  // because an any-field scan is vacuous against this fixture.
  const NAME_KEY = 'reserved_project';
  const NOTE_KEY = 'reserved_project_note';

  // Is this filesystem case-insensitive? Probed, because it decides whether `Archive` and `archive`
  // name the same directory and therefore whether the aliasing arm has a subject at all.
  const caseProbeDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-case-probe-933-')));
  let caseInsensitiveFs = false;
  try {
    fs.writeFileSync(path.join(caseProbeDir, 'CaseProbe'), '');
    caseInsensitiveFs = fs.existsSync(path.join(caseProbeDir, 'caseprobe'));
  } finally { fs.rmSync(caseProbeDir, { recursive: true, force: true }); }

  // The roadmap SOURCES: the project rules and the rest of the backlog. Losing or burying these
  // leaves the repository with no backlog at all.
  const ROADMAP_FOREIGN = {
    '.gitkeep': '',
    '_rules.md': '# Project rules\n\nEvery run reads this file.\n',
    'issue-9339.md': 'issue: #9339\ntitle: unrelated backlog item\nstatus: open\nworkflow_project: —\nnext_step: ready\n',
  };
  // The archive band: a completed run's record, which the claim would be writing alongside.
  const ARCHIVE_FOREIGN = {
    'issue-9300/workflow-state.md': '# Kaola-Workflow State\n\n## Project\nname: issue-9300\nstatus: closed\n',
    'issue-9300/mission-list.md': '# a prior run record\n',
  };

  // ADR 0018 §5: the fourth case (issue 9331, 'roadmap data / .roadmap (no flag anywhere)',
  // door: 'startup', viaRoadmapData: true) stood here. Its subject — a reserved name reaching
  // `claimProject` via the `workflow_project:` field of a roadmap source — is not merely
  // unbootstrappable, it is gone from the tree: `projectNameForIssue` is now always
  // `return 'issue-' + issueNumber;` regardless of roadmap content, so that door cannot fire again
  // under any fixture. Deleted with the mechanism it pinned, unlike the eleven walkthrough tests held
  // elsewhere in this run, whose bootstrap (not subject) is what died. Its `door` discriminator went
  // with it: every surviving case reaches the claim through the same `--project` flag, so the field
  // and the argv branch it selected are collapsed to that one surviving form below rather than left
  // as an unreachable branch this deletion would otherwise have authored.
  const CASES = [
    { label: 'operator flag / .roadmap', reserved: '.roadmap', given: '.roadmap',
      issue: 9330, foreign: ROADMAP_FOREIGN },
    { label: 'operator flag / archive', reserved: 'archive', given: 'archive',
      issue: 9332, foreign: ARCHIVE_FOREIGN },
    { label: 'operator flag / Archive (aliases the archive band)', reserved: 'archive',
      given: 'Archive', issue: 9333, foreign: ARCHIVE_FOREIGN,
      skip: !caseInsensitiveFs },
  ];

  // Everything under a directory, as a sorted list of relative paths.
  const listTree = dir => {
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
  };

  let ranCases = 0;
  for (const c of CASES) {
    if (c.skip) {
      console.log('  #933 skipped ' + JSON.stringify(c.given)
        + ': this filesystem is case-sensitive, so it does not alias the reserved directory');
      continue;
    }
    ranCases++;
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-claim-reserved-933-')));
    const resolved = 'issue-' + c.issue;
    try {
      initGitRepo(tmp);

      // The foreign content, inside the directory the claim must not adopt.
      const reservedDir = path.join(tmp, 'kaola-workflow', c.reserved);
      for (const [rel, body] of Object.entries(c.foreign)) {
        const f = path.join(reservedDir, rel);
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, body);
      }

      // The run's OWN roadmap source. Written by hand rather than through seedClassifierVerdictFromBody: that
      // helper hard-codes `workflow_project: —`, and `field()` reads the FIRST match, so an
      // appended line loses.
      const ownSourceRel = path.join('kaola-workflow', '.roadmap', 'issue-' + c.issue + '.md');
      const ownSource = path.join(tmp, ownSourceRel);
      fs.mkdirSync(path.dirname(ownSource), { recursive: true });
      fs.writeFileSync(ownSource, [
        'issue: #' + c.issue,
        'title: the claimed issue',
        'status: open',
        'workflow_project: —',
        'next_step: ready',
        ''
      ].join('\n'));

      G.git(tmp, ['add', '-A'], { encoding: 'utf8' });
      G.git(tmp, ['commit', '-m', 'seed the reserved directory'], { encoding: 'utf8' });

      const before = listTree(reservedDir);
      const argv = ['claim', '--project', c.given, '--issue', String(c.issue)];
      const result = runNode(claimScript, argv, tmp);
      const where = '\ncommand: kaola-workflow-claim.js ' + argv.join(' ')
        + '\nexit: ' + result.status
        + '\nstdout: ' + String(result.stdout).trim()
        + '\nstderr: ' + String(result.stderr).trim();
      const emitted = String(result.stdout).trim().split('\n').filter(l => l.trim().startsWith('{'));
      let env = {};
      try { env = emitted.length ? JSON.parse(emitted[emitted.length - 1]) : {}; } catch (_) { env = {}; }

      // (0) THE CLAIM STILL SUCCEEDS. Required by the ruling, and this scenario's LIVENESS witness
      // besides: a fixture that stopped reaching the claim, or a fix that answers #933 by refusing,
      // reds here instead of passing vacuously through everything below.
      assert(result.status === 0,
        '#933 ' + c.label + ': the claim must still succeed at exit 0 — the ruling is resolve and '
        + 'report, not refuse' + where);
      assert(env.status === 'acquired' && env.verdict === 'green' && env.claim === 'acquired',
        '#933 ' + c.label + ': the claim must still report an acquiring envelope — got status='
        + JSON.stringify(env.status) + ', verdict=' + JSON.stringify(env.verdict)
        + ', claim=' + JSON.stringify(env.claim) + where);

      // (1) IT ACQUIRED A LEGITIMATE FOLDER AND SAYS SO. This is also "the run does not report
      // itself as having acquired the reserved folder", stated positively so a red names the value
      // that was wrong.
      assert(env.project === resolved,
        '#933 ' + c.label + ': the claim must resolve to kaola-workflow/' + resolved
        + ', not the reserved name — got project=' + JSON.stringify(env.project) + where);
      if (Object.prototype.hasOwnProperty.call(env, 'selected_project')) {
        assert(env.selected_project === resolved,
          '#933 ' + c.label + ': selected_project must agree with project (' + resolved
          + ') — got ' + JSON.stringify(env.selected_project) + where);
      }
      const resolvedState = path.join(tmp, 'kaola-workflow', resolved, 'workflow-state.md');
      assert(fs.existsSync(resolvedState),
        '#933 ' + c.label + ': the run state must land in kaola-workflow/' + resolved
        + '/workflow-state.md' + where);
      // DURABLE STATE MUST AGREE WITH THE ENVELOPE. `name:` is what every later resume reads, so an
      // envelope that says issue-<N> over a state file still naming the reserved directory has
      // moved the report and not the run.
      const stateName = (read(resolvedState).match(/^name:\s*(\S+)\s*$/m) || [])[1];
      assert(stateName === resolved,
        '#933 ' + c.label + ': workflow-state.md must record name: ' + resolved
        + ' — got ' + JSON.stringify(stateName) + where);

      // (2) THE SWAP IS REPORTED, naming what was declined. Pinned by KEY (see the header).
      // The discrete field first — it is what a consumer keys on, so it carries the name the caller
      // supplied EXACTLY, casing and all, rather than something a reader has to extract from prose.
      assert(env[NAME_KEY] === c.given,
        '#933 ' + c.label + ': the envelope must carry `' + NAME_KEY + '`: ' + JSON.stringify(c.given)
        + ' — the declined directory, verbatim as supplied, as a discrete field rather than only '
        + 'inside prose. Got ' + JSON.stringify(env[NAME_KEY]) + where);
      // ...and the prose beside it. Wording unpinned; it must merely name the declined directory.
      const note = env[NOTE_KEY];
      assert(typeof note === 'string' && note.trim() !== '',
        '#933 ' + c.label + ': the envelope must carry a non-empty `' + NOTE_KEY + '` reporting '
        + 'that ' + c.given + ' was declined and ' + resolved + ' used instead — got '
        + JSON.stringify(note) + where);
      assert(typeof note === 'string' && note.toLowerCase().includes(c.given.toLowerCase()),
        '#933 ' + c.label + ': `' + NOTE_KEY + '` must name the declined directory ' + c.given
        + ' — got ' + JSON.stringify(note) + where);

      // (3) THE RESERVED DIRECTORY IS UNTOUCHED. The two artifacts this defect was MEASURED writing
      // are named first, so a red says which write landed; (3b) is what catches the next one.
      assert(fs.existsSync(reservedDir),
        '#933 ' + c.label + ': kaola-workflow/' + c.reserved + ' must still exist' + where);
      assert(!fs.existsSync(path.join(reservedDir, 'workflow-state.md')),
        '#933 ' + c.label + ': the claim wrote run state to kaola-workflow/' + c.reserved
        + '/workflow-state.md — that directory is not a project folder' + where);
      assert(!fs.existsSync(path.join(reservedDir, '.cache')),
        '#933 ' + c.label + ': the claim wrote kaola-workflow/' + c.reserved + '/.cache/ — that '
        + 'directory is not a project folder' + where);
      for (const [rel, body] of Object.entries(c.foreign)) {
        const f = path.join(reservedDir, rel);
        assert(fs.existsSync(f),
          '#933 ' + c.label + ': the claim removed kaola-workflow/' + c.reserved + '/' + rel + where);
        assert(read(f) === body,
          '#933 ' + c.label + ': the claim altered kaola-workflow/' + c.reserved + '/' + rel + where);
      }
      // The run's own roadmap source is pinned as PRESENT only — see the header.
      assert(fs.existsSync(ownSource),
        '#933 ' + c.label + ': the claim removed the run\'s own roadmap source ' + ownSourceRel + where);

      // (3b) THE DIRECTORY AS A SET. Presence-and-bytes cannot see a file ADDED, and the two named
      // artifacts above are only the writes this defect was observed making.
      const added = listTree(reservedDir).filter(p => !before.includes(p));
      assert(added.length === 0,
        '#933 ' + c.label + ': the claim added entries inside kaola-workflow/' + c.reserved + '/: '
        + JSON.stringify(added) + ' — a claim writes into its project folder, and this is not one'
        + where);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
  // The count is printed, not asserted: on a case-sensitive filesystem the aliasing arm has no
  // subject and is skipped above with a reason. A silent skip is what this line prevents.
  console.log('testClaimNeverAdoptsReservedDir933: PASSED (' + ranCases + '/' + CASES.length + ' doors)');
}

function testFinalizeNarrowStagingExcludesForeignArchive() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-finalize-narrow-stage-')));
  const kwRoot = tmp + '.kw';
  try {
    initGitRepo(tmp);
    // Plant active folder and roadmap issue in main worktree, then commit
    plantActiveFolder(tmp, 'issue-701', 701, null);
    seedClassifierVerdictFromBody(701, '');
    G.git(tmp, ['add', '-A'], { encoding: 'utf8' });
    G.git(tmp, ['commit', '-m', 'plant'], { encoding: 'utf8' });
    // Create linked worktree on a feature branch
    const wtPath = path.join(kwRoot, 'issue-701');
    fs.mkdirSync(kwRoot, { recursive: true });
    G.git(tmp, ['worktree', 'add', '-b', 'workflow/issue-701', '--', wtPath, 'HEAD'], { encoding: 'utf8' });
    // Mirror active folder in linked worktree
    plantActiveFolder(wtPath, 'issue-701', 701, null);
    seedAdaptiveFinalizeFixture(tmp, 'issue-701');
    seedAdaptiveFinalizeFixture(wtPath, 'issue-701');
    alignFinalizeFixtureAcrossRoots(tmp, wtPath, 'issue-701');
    // Plant a stray UNTRACKED foreign archive dir+file before finalize
    const foreignDir = path.join(wtPath, 'kaola-workflow', 'archive', 'issue-999');
    fs.mkdirSync(foreignDir, { recursive: true });
    fs.writeFileSync(path.join(foreignDir, 'x.md'), 'stray foreign archive\n');
    // Run finalize from the linked worktree with --keep-worktree
    const result = spawnSync(process.execPath, [claimScript, 'finalize', '--project', 'issue-701', '--keep-worktree'], {
      cwd: wtPath,
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' },
      encoding: 'utf8'
    });
    assert(
      result.status === 0,
      'finalize narrow staging: should exit 0\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr
    );
    // --keep-worktree causes an archive commit on the feature branch; check what was committed
    // Use --no-renames so renamed files show as both delete (source) and add (dest) paths
    const showResult = G.git(wtPath, ['show', 'HEAD', '--name-only', '--no-renames'], { encoding: 'utf8' });
    const showOutput = showResult.stdout;
    // #832: the archive resolves against MAIN's project root, so it is NOT in the feature branch's
    // commit at all — it is on main's disk, and the sink's own archive_commit step lands it there.
    // (This assertion used to require the opposite; it pinned the destination the sink then deleted.)
    assert(
      !/kaola-workflow\/archive\/issue-701\//.test(showOutput),
      'committed HEAD must NOT carry the issue-701 archive — it resolves against MAIN (#832)'
        + '\ngit show output:\n' + showOutput
    );
    assert(
      fs.existsSync(path.join(tmp, 'kaola-workflow', 'archive', 'issue-701', 'workflow-state.md')),
      '#832: main must hold the issue-701 archive after finalize --keep-worktree'
    );
    // ADR 0018 §5: the "committed HEAD must include ROADMAP.md regeneration" assertion stood here —
    // archiveProjectDir no longer regenerates the mirror, so the archive commit has no ROADMAP.md
    // payload to require.
    // Must include live folder path (source of rename, appears as deleted in --no-renames)
    assert(
      /kaola-workflow\/issue-701\//.test(showOutput),
      'committed HEAD must include kaola-workflow/issue-701/ live folder path\ngit show output:\n' + showOutput
    );
    // Must NOT include the foreign archive (issue-999)
    assert(
      !/kaola-workflow\/archive\/issue-999\//.test(showOutput),
      'committed HEAD must NOT include foreign archive kaola-workflow/archive/issue-999/\ngit show output:\n' + showOutput
    );
  } finally {
    try { G.git(tmp, ['worktree', 'remove', '--force', kwRoot + '/issue-701'], { encoding: 'utf8' }); } catch (_) {}
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(kwRoot, { recursive: true, force: true });
  }
  console.log('testFinalizeNarrowStagingExcludesForeignArchive: PASSED');
}

function testFinalizeFromMainRootNoSpuriousRemoval() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-finalize-main-noop-')));
  try {
    // Main root with no linked worktree: mainRootFromCoord returns tmp,
    // realpathSync(tmp) === realpathSync(root), so the cleanup block is a no-op and
    // the archive rename still happens normally. A real git repo (on main) is needed
    // for the adaptive finalize gate's candidate-hash + attribution sweep.
    initGitRepo(tmp);
    plantActiveFolder(tmp, 'issue-702', 702, null);
    seedAdaptiveFinalizeFixture(tmp, 'issue-702');

    const result = spawnSync(process.execPath, [claimScript, 'finalize', '--project', 'issue-702'], {
      cwd: tmp,
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' },
      encoding: 'utf8'
    });

    assert(
      result.status === 0,
      'finalize from main root should exit 0\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr
    );
    assert(
      !fs.existsSync(path.join(tmp, 'kaola-workflow', 'issue-702')),
      'active folder for issue-702 must be renamed away after finalize'
    );
    assert(
      fs.existsSync(path.join(tmp, 'kaola-workflow', 'archive', 'issue-702')),
      'archive must exist and must not be spuriously erased after finalize from main root'
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testReleaseFromLinkedWorktreeCleansMainCopy() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-release-linked-main-')));
  const kwRoot = tmp + '.kw';
  try {
    initGitRepo(tmp);
    const binDir = path.join(tmp, 'bin');
    writeGhShimForStartup(binDir);

    // Plant active folder in main worktree
    plantActiveFolder(tmp, 'issue-703', 703, null);

    // Create linked worktree
    const wtPath = path.join(kwRoot, 'issue-703');
    fs.mkdirSync(kwRoot, { recursive: true });
    G.git(tmp, ['worktree', 'add', '-b', 'workflow/issue-703', '--', wtPath, 'HEAD'], { encoding: 'utf8' });

    // Plant active folder inside the linked worktree
    plantActiveFolder(wtPath, 'issue-703', 703, null);

    // cwd is the linked worktree ROOT, not the project subdir inside it,
    // so cwdInside(folder.project_dir) guard in cmdRelease does not fire.
    // Note: release always calls removeWorktree, which removes the linked worktree directory
    // after archiving. We therefore verify archive creation via the JSON result rather than
    // post-call filesystem inspection of the now-removed wtPath.
    // The release process COMMITS its discard archive and exits; the sink process below re-reads
    // that committed tree from disk and must not classify it as foreign dirt. This site is the
    // writer half of that handoff.
    // spawn-class: durable-handoff
    const result = spawnSync(process.execPath, [claimScript, 'release', '--project', 'issue-703', '--reason', 'test'], {
      cwd: wtPath,
      env: { ...process.env, ...GIT_ISOLATION_ENV, KAOLA_WORKFLOW_OFFLINE: '1' },
      encoding: 'utf8'
    });

    assert(
      result.status === 0,
      'release from linked worktree should exit 0\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr
    );
    assert(
      !fs.existsSync(path.join(tmp, 'kaola-workflow', 'issue-703')),
      'main worktree copy of issue-703 must be cleaned up after release from linked worktree; ' +
      'this proves cleanup lives in archiveProjectDir, not cmdFinalize-only'
    );
    const releaseJson = JSON.parse(result.stdout);
    assert(
      releaseJson.released === true,
      'release must report released:true, got: ' + JSON.stringify(releaseJson)
    );
    assert(
      releaseJson.archived === true && typeof releaseJson.dest === 'string' && releaseJson.dest.includes('issue-703.discarded-'),
      'release must report archived:true and dest path containing issue-703.discarded-, got: ' + JSON.stringify(releaseJson)
    );

    // #715 (a): release must COMMIT its discard archive — no untracked .discarded- residue may
    // remain at the main root for the next sink's preflight to refuse as foreign dirt. The commit
    // is local git, so KAOLA_WORKFLOW_OFFLINE=1 must NOT skip it.
    assert(
      releaseJson.discard_archive_committed === true,
      '#715: release must report discard_archive_committed:true, got: ' + JSON.stringify(releaseJson)
    );
    const porcelainAfterRelease = G.git(tmp, ['status', '--porcelain', '-uall'], { encoding: 'utf8' }).stdout;
    assert(
      !porcelainAfterRelease.split('\n').some(l => l.includes('.discarded-')),
      '#715: no .discarded- path may remain in git status after release; got:\n' + porcelainAfterRelease
    );
    const discardRel = path.relative(tmp, releaseJson.dest).split(path.sep).join('/');
    const discardAtHead = G.git(tmp, ['cat-file', '-t', 'HEAD:' + discardRel], { encoding: 'utf8' }).stdout.trim();
    assert(
      discardAtHead === 'tree',
      '#715: the discarded archive must be committed at HEAD (a tree); got ' + JSON.stringify(discardAtHead) + ' for ' + discardRel
    );

    // ... and a following sink for ANOTHER project must proceed without manual commits (the
    // #715 acceptance criterion: it must NOT refuse sink_blocked on the discarded archive).
    // The gh shim planted above is untracked fixture residue the OFFLINE sink never calls —
    // remove it so only genuinely workflow-owned paths remain for the preflight to classify.
    fs.rmSync(path.join(tmp, 'bin'), { recursive: true, force: true });
    G.git(tmp, ['checkout', '-b', 'workflow/issue-704'], { encoding: 'utf8' });
    fs.writeFileSync(path.join(tmp, 'impl-704.txt'), 'impl\n');
    G.git(tmp, ['add', 'impl-704.txt'], { encoding: 'utf8' });
    G.git(tmp, ['commit', '-m', 'feat: impl 704'], {
      encoding: 'utf8',
      env: { ...process.env, ...GIT_ISOLATION_ENV, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@t' }
    });
    G.git(tmp, ['checkout', 'main'], { encoding: 'utf8' });
    // A fresh sink process, sharing no heap with the release above, re-reads only what that
    // exited process committed. The #715 property IS what this second process concludes from
    // the first one's durable bytes.
    // spawn-class: durable-handoff
    const sinkAfterRelease = spawnSync(process.execPath, [
      sinkMergeScript,
      '--sink',
      '--branch', 'workflow/issue-704',
      '--issue', '704',
      '--project', 'issue-704',
      '--json'
    ], {
      cwd: tmp,
      encoding: 'utf8',
      env: { ...process.env, ...GIT_ISOLATION_ENV, KAOLA_WORKFLOW_OFFLINE: '1' }
    });
    let sinkAfterReleaseJson = null;
    try { sinkAfterReleaseJson = JSON.parse(sinkAfterRelease.stdout.trim().split('\n').filter(l => l.trim().startsWith('{')).pop()); } catch (_) {}
    assert(
      !(sinkAfterReleaseJson && sinkAfterReleaseJson.reason === 'sink_blocked' && JSON.stringify(sinkAfterReleaseJson.foreign_dirt || []).includes('.discarded-')),
      '#715: the following sink must NOT refuse sink_blocked on the discarded archive; got: ' + JSON.stringify(sinkAfterReleaseJson)
    );
    assert(
      sinkAfterRelease.status === 0 && sinkAfterReleaseJson && sinkAfterReleaseJson.status === 'sinked',
      '#715: the following sink must complete without manual commits; status=' + sinkAfterRelease.status +
        ' out=' + JSON.stringify(sinkAfterReleaseJson) + '\nstdout: ' + sinkAfterRelease.stdout + '\nstderr: ' + sinkAfterRelease.stderr
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(kwRoot, { recursive: true, force: true });
  }
}

function testReleaseInPlaceOnFeatureBranchCommitsArchiveOnBase() {
  // #715 F1 (trigger A): an in-place (NATIVE=0) release while the checkout sits ON the feature
  // branch must still land the discard-archive commit on the SURVIVING base branch. The restore
  // gate exempts exactly the archive dest this release just created (every other dirty path keeps
  // blocking), the base checkout + branch delete proceed, and the already-ordered commit lands on
  // the restored base — never stranded on the discarded feature branch, never orphaned by the
  // natural cleanup.
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-release-inplace-base-')));
  try {
    initGitRepo(tmp);
    // In-place posture: the run lives on the feature branch in the MAIN checkout.
    G.git(tmp, ['checkout', '-b', 'workflow/issue-801'], {
      encoding: 'utf8', env: { ...process.env, ...GIT_ISOLATION_ENV }
    });
    plantActiveFolder(tmp, 'issue-801', 801, null);

    const result = spawnSync(process.execPath, [claimScript, 'release', '--project', 'issue-801', '--reason', 'test'], {
      cwd: tmp,
      env: { ...process.env, ...GIT_ISOLATION_ENV, KAOLA_WORKFLOW_OFFLINE: '1' },
      encoding: 'utf8'
    });
    assert(
      result.status === 0,
      'release on the feature branch should exit 0\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr
    );
    const releaseJson = JSON.parse(result.stdout);
    assert(releaseJson.released === true, 'release must report released:true, got: ' + JSON.stringify(releaseJson));

    // The in-place base restore must proceed (the release's OWN fresh archive dest is exempt from
    // the dirty gate) — HEAD moves to the base and the discarded feature branch is deleted.
    const headAfter = G.git(tmp, ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    assert(
      headAfter === 'main',
      '#715 F1: release on the feature branch must restore the base checkout, got HEAD=' + headAfter +
        ' json=' + JSON.stringify(releaseJson)
    );
    const branchList = G.git(tmp, ['branch', '--list', 'workflow/issue-801'], { encoding: 'utf8' }).stdout.trim();
    assert(
      branchList === '',
      '#715 F1: the discarded feature branch must be deleted after the restore, got: ' + JSON.stringify(branchList)
    );

    // The archive commit lands on the surviving BASE branch, truthfully reported + disclosed.
    assert(
      releaseJson.discard_archive_committed === true,
      '#715 F1: release must report discard_archive_committed:true, got: ' + JSON.stringify(releaseJson)
    );
    assert(
      releaseJson.discard_archive_branch === 'main',
      '#715 F1: release must disclose the receiving branch (discard_archive_branch === main), got: ' + JSON.stringify(releaseJson)
    );
    const discardRel = path.relative(tmp, releaseJson.dest).split(path.sep).join('/');
    const atBase = G.git(tmp, ['cat-file', '-t', 'main:' + discardRel], { encoding: 'utf8' }).stdout.trim();
    assert(
      atBase === 'tree',
      '#715 F1: the discard archive must be a tree at the BASE branch HEAD (main:' + discardRel + '), got ' + JSON.stringify(atBase)
    );
    const porcelain = G.git(tmp, ['status', '--porcelain', '-uall'], { encoding: 'utf8' }).stdout;
    assert(
      !porcelain.split('\n').some(l => l.includes('.discarded-')),
      '#715 F1: no .discarded- residue may remain on base after the commit; got:\n' + porcelain
    );
    // Orphan proof inverted: after the (release-performed) checkout+branch-delete cleanup, the
    // archive stays REACHABLE from the base ref.
    const revList = G.git(tmp, ['rev-list', 'main', '--', discardRel], { encoding: 'utf8' }).stdout.trim();
    assert(
      revList !== '',
      '#715 F1: the discard archive commit must stay reachable from the base ref (git rev-list main -- ' + discardRel + ')'
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testWatchPrClosedSweepSkipsCommitOffBaseBranch() {
  // #715 F1 (trigger B): the watch-pr CLOSED sweep has no restore logic, so on a non-base checkout
  // the discard-archive commit must NOT bind to the arbitrary current branch — it is skipped, the
  // archive stays on disk as recoverable residue, and the cleanup entry truthfully reports
  // discard_archive_committed:false with the current branch disclosed.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-watchpr-offbase-'));
  const kwRoot = fs.realpathSync(tmp) + '.kw';
  try {
    initGitRepo(tmp);
    const binDir = path.join(tmp, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    writeShimFiles(path.join(binDir, 'gh'), [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue view 909')) { process.stdout.write('{\"state\":\"CLOSED\"}\\n'); }",
      "else if (a.includes('pr view')) { process.stdout.write('{\"state\":\"CLOSED\",\"number\":9}\\n'); }",
      "else if (a.includes('repo view')) { process.stdout.write('{\"owner\":{\"login\":\"test\"},\"name\":\"repo\"}\\n'); }",
      "else { process.stdout.write('[\\n'); }"
    ]);
    // An unrelated non-base branch carrying its own commit, checked out.
    G.git(tmp, ['checkout', '-b', 'workflow/other-lane'], {
      encoding: 'utf8', env: { ...process.env, ...GIT_ISOLATION_ENV }
    });
    fs.writeFileSync(path.join(tmp, 'other.txt'), 'other\n');
    G.git(tmp, ['add', 'other.txt'], { encoding: 'utf8', env: { ...process.env, ...GIT_ISOLATION_ENV } });
    G.git(tmp, ['commit', '-m', 'other lane work'], {
      encoding: 'utf8',
      env: { ...process.env, ...GIT_ISOLATION_ENV, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@t' }
    });
    const otherTipBefore = G.git(tmp, ['rev-parse', 'workflow/other-lane'], { encoding: 'utf8' }).stdout.trim();
    const mainTipBefore = G.git(tmp, ['rev-parse', 'main'], { encoding: 'utf8' }).stdout.trim();

    const projDir = path.join(tmp, 'kaola-workflow', 'watch-pr-offbase');
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, 'workflow-state.md'), [
      '# Kaola-Workflow State', '',
      '## Project',
      'name: watch-pr-offbase',
      'status: active',
      '',
      '## Sink',
      'branch: workflow/issue-909',
      'issue_number: 909',
      'sink: pr',
      'pr_url: https://github.com/test/repo/pull/9',
      ''
    ].join('\n'));

    const result = runClaimOnline(['watch-pr'], tmp, binDir);
    assert(result.watched === 1, 'watch-pr should watch the pr-sink folder, got: ' + JSON.stringify(result));
    const entry = (result.cleanups || [])[0] || {};
    assert(
      entry.discard_archive_committed === false,
      '#715 F1: an off-base sweep must truthfully report discard_archive_committed:false, got: ' + JSON.stringify(entry)
    );
    assert(
      entry.discard_archive_branch === 'workflow/other-lane',
      '#715 F1: the cleanup entry must disclose the current (non-receiving) branch, got: ' + JSON.stringify(entry)
    );
    // Neither ref moved: no commit was swept onto the unrelated branch, none onto the base.
    const otherTipAfter = G.git(tmp, ['rev-parse', 'workflow/other-lane'], { encoding: 'utf8' }).stdout.trim();
    assert(
      otherTipAfter === otherTipBefore,
      '#715 F1: the non-base branch tip must be unchanged by the sweep; before=' + otherTipBefore + ' after=' + otherTipAfter
    );
    const mainTipAfter = G.git(tmp, ['rev-parse', 'main'], { encoding: 'utf8' }).stdout.trim();
    assert(
      mainTipAfter === mainTipBefore,
      '#715 F1: the base ref must be unchanged by an off-base sweep; before=' + mainTipBefore + ' after=' + mainTipAfter
    );
    // The skipped archive remains on disk as recoverable residue.
    const archiveRoot = path.join(tmp, 'kaola-workflow', 'archive');
    const residue = fs.existsSync(archiveRoot) ? fs.readdirSync(archiveRoot).filter(d => d.includes('.discarded-')) : [];
    assert(
      residue.length === 1,
      '#715 F1: the skipped archive must remain on disk as recoverable residue, got: ' + JSON.stringify(residue)
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(kwRoot, { recursive: true, force: true });
  }
}

// #715 N5-A/N5-B fixtures: plant an active folder whose durable state carries an OPERATOR-
// FALSIFIED base_branch (the tooling never writes these values — claim.js clamps baseBranch for
// 'HEAD'/self — so a hand-edit or external corruption is the honest precondition). The guard
// inside commitDiscardArchive must refuse every one of them BEFORE staging.
function plantActiveFolderWithBase(root, project, issueNumber, branch, baseBranch) {
  const dir = path.join(root, 'kaola-workflow', project);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'workflow-state.md'), [
    '# Kaola-Workflow State', '',
    '## Project',
    'name: ' + project,
    'status: active',
    '',
    '## Sink',
    'branch: ' + branch,
    'issue_number: ' + issueNumber,
    'sink: merge',
    'base_branch: ' + baseBranch,
    ''
  ].join('\n'));
}

function gitLogAllSubjects(root) {
  return G.git(root, ['log', '--all', '--format=%s'], { encoding: 'utf8' }).stdout;
}

function testReleaseDetachedHeadLyingBaseSkipsArchiveCommit() {
  // #715 N5-A (B4a inverted): an in-place release entered on a DETACHED HEAD with the durable
  // base_branch falsified to the literal sentinel 'HEAD' (what `rev-parse --abbrev-ref HEAD`
  // returns when no branch is checked out). The guard must reject the sentinel as a base
  // outright: NO commit anywhere, committed:false with the branch disclosed, the archive left
  // on disk as recoverable residue, and the main ref tip unchanged.
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-release-detached-lying-base-')));
  try {
    initGitRepo(tmp);
    G.git(tmp, ['checkout', '-b', 'workflow/issue-801'], {
      encoding: 'utf8', env: { ...process.env, ...GIT_ISOLATION_ENV }
    });
    plantActiveFolderWithBase(tmp, 'issue-801', 801, 'workflow/issue-801', 'HEAD');
    const mainTipBefore = G.git(tmp, ['rev-parse', 'main'], { encoding: 'utf8' }).stdout.trim();
    G.git(tmp, ['checkout', '--detach', 'HEAD'], {
      encoding: 'utf8', env: { ...process.env, ...GIT_ISOLATION_ENV }
    });
    const detachedTipBefore = G.git(tmp, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();

    const result = spawnSync(process.execPath, [claimScript, 'release', '--project', 'issue-801', '--reason', 'test'], {
      cwd: tmp,
      env: { ...process.env, ...GIT_ISOLATION_ENV, KAOLA_WORKFLOW_OFFLINE: '1' },
      encoding: 'utf8'
    });
    assert(
      result.status === 0,
      'release on a detached HEAD should exit 0\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr
    );
    const releaseJson = JSON.parse(result.stdout);
    assert(releaseJson.released === true, 'release must report released:true, got: ' + JSON.stringify(releaseJson));
    assert(
      releaseJson.discard_archive_committed === false,
      '#715 N5-A: a detached entry with base_branch falsified to the HEAD sentinel must truthfully report ' +
        'discard_archive_committed:false, got: ' + JSON.stringify(releaseJson)
    );
    assert(
      releaseJson.discard_archive_branch === 'HEAD',
      '#715 N5-A: the emit must disclose the (non-receiving) detached HEAD sentinel, got: ' + JSON.stringify(releaseJson)
    );
    // No commit anywhere: the detached HEAD tip and the main ref tip are both byte-unchanged,
    // and no chore commit exists on ANY ref.
    const detachedTipAfter = G.git(tmp, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    assert(
      detachedTipAfter === detachedTipBefore,
      '#715 N5-A: the detached HEAD must NOT receive the archive commit; before=' + detachedTipBefore + ' after=' + detachedTipAfter
    );
    const mainTipAfter = G.git(tmp, ['rev-parse', 'main'], { encoding: 'utf8' }).stdout.trim();
    assert(
      mainTipAfter === mainTipBefore,
      '#715 N5-A: the main ref tip must be unchanged; before=' + mainTipBefore + ' after=' + mainTipAfter
    );
    assert(
      !/discard archive/.test(gitLogAllSubjects(tmp)),
      '#715 N5-A: no chore commit may exist on any ref, got: ' + gitLogAllSubjects(tmp).replace(/\n/g, ' | ')
    );
    // The skipped archive stays on disk as recoverable residue — and is manually committable on base.
    const archiveRoot = path.join(tmp, 'kaola-workflow', 'archive');
    const residue = fs.existsSync(archiveRoot) ? fs.readdirSync(archiveRoot).filter(d => d.includes('.discarded-')) : [];
    assert(
      residue.length === 1,
      '#715 N5-A: the skipped archive must remain on disk as recoverable residue, got: ' + JSON.stringify(residue)
    );
    G.git(tmp, ['checkout', 'main'], { encoding: 'utf8', env: { ...process.env, ...GIT_ISOLATION_ENV } });
    const rel = 'kaola-workflow/archive/' + residue[0];
    G.git(tmp, ['add', '-A', '--', rel], { encoding: 'utf8', env: { ...process.env, ...GIT_ISOLATION_ENV } });
    G.git(tmp, ['commit', '-m', 'manual recovery', '--', rel], {
      encoding: 'utf8',
      env: { ...process.env, ...GIT_ISOLATION_ENV, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@t' }
    });
    const recovered = G.git(tmp, ['cat-file', '-t', 'main:' + rel], { encoding: 'utf8' }).stdout.trim();
    assert(
      recovered === 'tree',
      '#715 N5-A: the residue must stay manually recoverable on the base branch, got ' + JSON.stringify(recovered)
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testReleaseOnFeatureBranchLyingBaseNamesDiscardedBranchSkips() {
  // #715 N5-A (B3 inverted): an in-place release while the checkout sits ON the feature branch,
  // with the durable base_branch falsified to name the DISCARDED feature branch itself. The
  // guard must refuse a base naming the branch the release itself discards: truthful skip, no
  // chore commit on any ref, both ref tips unchanged, residue recoverable on disk.
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-release-lying-base-discarded-')));
  try {
    initGitRepo(tmp);
    G.git(tmp, ['checkout', '-b', 'workflow/issue-801'], {
      encoding: 'utf8', env: { ...process.env, ...GIT_ISOLATION_ENV }
    });
    plantActiveFolderWithBase(tmp, 'issue-801', 801, 'workflow/issue-801', 'workflow/issue-801');
    const mainTipBefore = G.git(tmp, ['rev-parse', 'main'], { encoding: 'utf8' }).stdout.trim();
    const featTipBefore = G.git(tmp, ['rev-parse', 'workflow/issue-801'], { encoding: 'utf8' }).stdout.trim();

    const result = spawnSync(process.execPath, [claimScript, 'release', '--project', 'issue-801', '--reason', 'test'], {
      cwd: tmp,
      env: { ...process.env, ...GIT_ISOLATION_ENV, KAOLA_WORKFLOW_OFFLINE: '1' },
      encoding: 'utf8'
    });
    assert(
      result.status === 0,
      'release on the feature branch should exit 0\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr
    );
    const releaseJson = JSON.parse(result.stdout);
    assert(releaseJson.released === true, 'release must report released:true, got: ' + JSON.stringify(releaseJson));
    assert(
      releaseJson.discard_archive_committed === false,
      '#715 N5-A: a base_branch naming the discarded feature branch must truthfully report ' +
        'discard_archive_committed:false, got: ' + JSON.stringify(releaseJson)
    );
    assert(
      releaseJson.discard_archive_branch === 'workflow/issue-801',
      '#715 N5-A: the emit must disclose the current (non-receiving) branch, got: ' + JSON.stringify(releaseJson)
    );
    assert(
      typeof releaseJson.discard_archive_commit_detail === 'string' &&
        releaseJson.discard_archive_commit_detail.includes('workflow/issue-801') &&
        /discard/.test(releaseJson.discard_archive_commit_detail),
      '#715 N5-A: the refusal detail must name the discarded branch, got: ' + JSON.stringify(releaseJson)
    );
    // No chore commit on ANY ref: both tips byte-unchanged, nothing in the log, and the archive
    // is a tree at NEITHER the discarded feature branch nor main.
    assert(
      G.git(tmp, ['rev-parse', 'main'], { encoding: 'utf8' }).stdout.trim() === mainTipBefore &&
        G.git(tmp, ['rev-parse', 'workflow/issue-801'], { encoding: 'utf8' }).stdout.trim() === featTipBefore,
      '#715 N5-A: both ref tips must be unchanged (no commit on the discarded branch, none on main)'
    );
    assert(
      !/discard archive/.test(gitLogAllSubjects(tmp)),
      '#715 N5-A: no chore commit may exist on any ref, got: ' + gitLogAllSubjects(tmp).replace(/\n/g, ' | ')
    );
    const archiveRoot = path.join(tmp, 'kaola-workflow', 'archive');
    const residue = fs.existsSync(archiveRoot) ? fs.readdirSync(archiveRoot).filter(d => d.includes('.discarded-')) : [];
    assert(
      residue.length === 1,
      '#715 N5-A: the skipped archive must remain on disk as recoverable residue, got: ' + JSON.stringify(residue)
    );
    const rel = 'kaola-workflow/archive/' + residue[0];
    assert(
      G.git(tmp, ['cat-file', '-t', 'workflow/issue-801:' + rel], { encoding: 'utf8' }).status !== 0 &&
        G.git(tmp, ['cat-file', '-t', 'main:' + rel], { encoding: 'utf8' }).status !== 0,
      '#715 N5-A: the archive must be a tree at NEITHER the discarded branch nor main'
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testWatchPrClosedSweepDetachedLyingBaseHeadSkips() {
  // #715 N5-A (W5 inverted): a watch-pr CLOSED sweep on a DETACHED HEAD with the durable
  // base_branch falsified to the 'HEAD' sentinel. The guard rejects the sentinel outright:
  // truthful skip with the sentinel disclosed, the base ref tip unchanged, no chore commit on
  // any ref, residue recoverable on disk.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-watchpr-detached-lying-base-'));
  const kwRoot = fs.realpathSync(tmp) + '.kw';
  try {
    initGitRepo(tmp);
    const binDir = path.join(tmp, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    writeShimFiles(path.join(binDir, 'gh'), [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue view 909')) { process.stdout.write('{\"state\":\"CLOSED\"}\\n'); }",
      "else if (a.includes('pr view')) { process.stdout.write('{\"state\":\"CLOSED\",\"number\":9}\\n'); }",
      "else if (a.includes('repo view')) { process.stdout.write('{\"owner\":{\"login\":\"test\"},\"name\":\"repo\"}\\n'); }",
      "else { process.stdout.write('[\\n'); }"
    ]);
    const mainTipBefore = G.git(tmp, ['rev-parse', 'main'], { encoding: 'utf8' }).stdout.trim();
    G.git(tmp, ['checkout', '--detach', 'HEAD'], {
      encoding: 'utf8', env: { ...process.env, ...GIT_ISOLATION_ENV }
    });
    const detachedTipBefore = G.git(tmp, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();

    const projDir = path.join(tmp, 'kaola-workflow', 'watch-pr-detached-lying-base');
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, 'workflow-state.md'), [
      '# Kaola-Workflow State', '',
      '## Project',
      'name: watch-pr-detached-lying-base',
      'status: active',
      '',
      '## Sink',
      'branch: workflow/issue-909',
      'issue_number: 909',
      'sink: pr',
      'pr_url: https://github.com/test/repo/pull/9',
      'base_branch: HEAD',
      ''
    ].join('\n'));

    const result = runClaimOnline(['watch-pr'], tmp, binDir);
    assert(result.watched === 1, 'watch-pr should watch the pr-sink folder, got: ' + JSON.stringify(result));
    const entry = (result.cleanups || [])[0] || {};
    assert(
      entry.discard_archive_committed === false,
      '#715 N5-A: a detached sweep with base_branch falsified to the HEAD sentinel must truthfully report ' +
        'discard_archive_committed:false, got: ' + JSON.stringify(entry)
    );
    assert(
      entry.discard_archive_branch === 'HEAD',
      '#715 N5-A: the cleanup entry must disclose the (non-receiving) detached HEAD sentinel, got: ' + JSON.stringify(entry)
    );
    assert(
      G.git(tmp, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim() === detachedTipBefore &&
        G.git(tmp, ['rev-parse', 'main'], { encoding: 'utf8' }).stdout.trim() === mainTipBefore,
      '#715 N5-A: the detached HEAD and the base ref tip must both be unchanged'
    );
    assert(
      !/discard archive/.test(gitLogAllSubjects(tmp)),
      '#715 N5-A: no chore commit may exist on any ref, got: ' + gitLogAllSubjects(tmp).replace(/\n/g, ' | ')
    );
    const archiveRoot = path.join(tmp, 'kaola-workflow', 'archive');
    const residue = fs.existsSync(archiveRoot) ? fs.readdirSync(archiveRoot).filter(d => d.includes('.discarded-')) : [];
    assert(
      residue.length === 1,
      '#715 N5-A: the skipped archive must remain on disk as recoverable residue, got: ' + JSON.stringify(residue)
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(kwRoot, { recursive: true, force: true });
  }
}

function testWatchPrClosedSweepArbitraryLaneLyingBaseSkips() {
  // #715 N5-A (W6 inverted): a watch-pr CLOSED sweep on an arbitrary lane with the durable
  // base_branch falsified to name THAT lane. The sweep has no restore step, so the only base it
  // can establish as surviving is the repo's default branch — a base naming the current
  // non-default lane is refused: truthful skip with disclosure, both ref tips unchanged, no
  // chore commit on any ref, residue recoverable on disk.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-watchpr-lane-lying-base-'));
  const kwRoot = fs.realpathSync(tmp) + '.kw';
  try {
    initGitRepo(tmp);
    const binDir = path.join(tmp, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    writeShimFiles(path.join(binDir, 'gh'), [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue view 909')) { process.stdout.write('{\"state\":\"CLOSED\"}\\n'); }",
      "else if (a.includes('pr view')) { process.stdout.write('{\"state\":\"CLOSED\",\"number\":9}\\n'); }",
      "else if (a.includes('repo view')) { process.stdout.write('{\"owner\":{\"login\":\"test\"},\"name\":\"repo\"}\\n'); }",
      "else { process.stdout.write('[\\n'); }"
    ]);
    // An unrelated non-base branch carrying its own commit, checked out.
    G.git(tmp, ['checkout', '-b', 'workflow/other-lane'], {
      encoding: 'utf8', env: { ...process.env, ...GIT_ISOLATION_ENV }
    });
    fs.writeFileSync(path.join(tmp, 'other.txt'), 'other\n');
    G.git(tmp, ['add', 'other.txt'], { encoding: 'utf8', env: { ...process.env, ...GIT_ISOLATION_ENV } });
    G.git(tmp, ['commit', '-m', 'other lane work'], {
      encoding: 'utf8',
      env: { ...process.env, ...GIT_ISOLATION_ENV, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@t' }
    });
    const otherTipBefore = G.git(tmp, ['rev-parse', 'workflow/other-lane'], { encoding: 'utf8' }).stdout.trim();
    const mainTipBefore = G.git(tmp, ['rev-parse', 'main'], { encoding: 'utf8' }).stdout.trim();

    const projDir = path.join(tmp, 'kaola-workflow', 'watch-pr-lane-lying-base');
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, 'workflow-state.md'), [
      '# Kaola-Workflow State', '',
      '## Project',
      'name: watch-pr-lane-lying-base',
      'status: active',
      '',
      '## Sink',
      'branch: workflow/issue-909',
      'issue_number: 909',
      'sink: pr',
      'pr_url: https://github.com/test/repo/pull/9',
      'base_branch: workflow/other-lane',
      ''
    ].join('\n'));

    const result = runClaimOnline(['watch-pr'], tmp, binDir);
    assert(result.watched === 1, 'watch-pr should watch the pr-sink folder, got: ' + JSON.stringify(result));
    const entry = (result.cleanups || [])[0] || {};
    assert(
      entry.discard_archive_committed === false,
      '#715 N5-A: a sweep with base_branch falsified to the current arbitrary lane must truthfully report ' +
        'discard_archive_committed:false, got: ' + JSON.stringify(entry)
    );
    assert(
      entry.discard_archive_branch === 'workflow/other-lane',
      '#715 N5-A: the cleanup entry must disclose the current (non-receiving) lane, got: ' + JSON.stringify(entry)
    );
    assert(
      G.git(tmp, ['rev-parse', 'workflow/other-lane'], { encoding: 'utf8' }).stdout.trim() === otherTipBefore &&
        G.git(tmp, ['rev-parse', 'main'], { encoding: 'utf8' }).stdout.trim() === mainTipBefore,
      '#715 N5-A: both ref tips must be unchanged (no commit on the arbitrary lane, none on the base)'
    );
    assert(
      !/discard archive/.test(gitLogAllSubjects(tmp)),
      '#715 N5-A: no chore commit may exist on any ref, got: ' + gitLogAllSubjects(tmp).replace(/\n/g, ' | ')
    );
    const archiveRoot = path.join(tmp, 'kaola-workflow', 'archive');
    const residue = fs.existsSync(archiveRoot) ? fs.readdirSync(archiveRoot).filter(d => d.includes('.discarded-')) : [];
    assert(
      residue.length === 1,
      '#715 N5-A: the skipped archive must remain on disk as recoverable residue, got: ' + JSON.stringify(residue)
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(kwRoot, { recursive: true, force: true });
  }
}

function testReleaseHeadRepointRaceDowngradesArchiveCommit() {
  // #715 N5-B (RC1 inverted): a concurrent process re-points HEAD between the helper's staging
  // and its commit (deterministic git shim on PATH interposing at `add -A -- <rel>`: real add,
  // then symbolic-ref HEAD onto a pre-created 'race' branch + checkout). The post-commit
  // re-resolution must catch the moved checkout: the emit DOWNGRADES to committed:false and
  // discloses the ACTUAL receiving branch ('race') — never the stale pre-race base ('main') —
  // while the off-base commit stays recoverable on 'race'.
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-release-head-race-')));
  const shimDir = tmp + '.shim-bin'; // OUTSIDE the repo — shim files are not workflow-owned dirt
  try {
    initGitRepo(tmp);
    G.git(tmp, ['checkout', '-b', 'workflow/issue-801'], {
      encoding: 'utf8', env: { ...process.env, ...GIT_ISOLATION_ENV }
    });
    plantActiveFolderWithBase(tmp, 'issue-801', 801, 'workflow/issue-801', 'main');
    // Pre-create the race branch at main's tip so the interleave has somewhere to land.
    G.git(tmp, ['branch', 'race', 'main'], {
      encoding: 'utf8', env: { ...process.env, ...GIT_ISOLATION_ENV }
    });
    const mainTipBefore = G.git(tmp, ['rev-parse', 'main'], { encoding: 'utf8' }).stdout.trim();

    // git shim: pass every call through except the helper's `add -A`, after which HEAD is
    // re-pointed to refs/heads/race (the RC1 interleave, deterministic — no probabilistic racing).
    fs.mkdirSync(shimDir, { recursive: true });
    fs.writeFileSync(path.join(shimDir, 'git'), [
      '#!/bin/bash',
      'if [ "$3" = "add" ] && [ "$4" = "-A" ]; then',
      '  /usr/bin/git "$@"',
      '  rc=$?',
      '  /usr/bin/git -C "$2" symbolic-ref HEAD refs/heads/race',
      '  /usr/bin/git -C "$2" checkout race 2>/dev/null || true',
      '  exit $rc',
      'fi',
      'exec /usr/bin/git "$@"',
      ''
    ].join('\n'));
    fs.chmodSync(path.join(shimDir, 'git'), 0o755);

    const result = spawnSync(process.execPath, [claimScript, 'release', '--project', 'issue-801', '--reason', 'test'], {
      cwd: tmp,
      env: {
        ...process.env,
        ...GIT_ISOLATION_ENV,
        KAOLA_WORKFLOW_OFFLINE: '1',
        PATH: shimDir + path.delimiter + path.dirname(process.execPath) + path.delimiter + (process.env.PATH || '')
      },
      encoding: 'utf8'
    });
    assert(
      result.status === 0,
      'release under the HEAD re-point race should exit 0 (never stranded)\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr
    );
    const releaseJson = JSON.parse(result.stdout);
    assert(releaseJson.released === true, 'release must report released:true, got: ' + JSON.stringify(releaseJson));
    assert(
      releaseJson.discard_archive_committed === false,
      '#715 N5-B: a HEAD re-point during the commit must downgrade the emit to ' +
        'discard_archive_committed:false, got: ' + JSON.stringify(releaseJson)
    );
    assert(
      releaseJson.discard_archive_branch === 'race',
      '#715 N5-B: the downgrade must disclose the ACTUAL receiving branch (race), never the stale ' +
        'pre-race base, got: ' + JSON.stringify(releaseJson)
    );
    assert(
      !JSON.stringify(releaseJson).includes('"discard_archive_branch":"main"'),
      '#715 N5-B: the emit must never name the stale pre-race branch as the receiver, got: ' + JSON.stringify(releaseJson)
    );
    const mainTipAfter = G.git(tmp, ['rev-parse', 'main'], { encoding: 'utf8' }).stdout.trim();
    assert(
      mainTipAfter === mainTipBefore,
      '#715 N5-B: the base ref tip must be unchanged by the raced commit; before=' + mainTipBefore + ' after=' + mainTipAfter
    );
    const archiveRoot = path.join(tmp, 'kaola-workflow', 'archive');
    const residue = fs.existsSync(archiveRoot) ? fs.readdirSync(archiveRoot).filter(d => d.includes('.discarded-')) : [];
    assert(residue.length === 1, '#715 N5-B: the raced archive must still exist, got: ' + JSON.stringify(residue));
    const rel = 'kaola-workflow/archive/' + residue[0];
    assert(
      G.git(tmp, ['cat-file', '-t', 'main:' + rel], { encoding: 'utf8' }).status !== 0,
      '#715 N5-B: the archive must NOT be a tree at the base branch'
    );
    assert(
      G.git(tmp, ['cat-file', '-t', 'race:' + rel], { encoding: 'utf8' }).stdout.trim() === 'tree',
      '#715 N5-B: the off-base commit stays recoverable on the actual receiving branch (race:' + rel + ')'
    );
    assert(
      G.git(tmp, ['log', '-1', '--format=%s', 'race'], { encoding: 'utf8' }).stdout.trim() === 'chore: discard archive issue-801',
      '#715 N5-B: the raced commit landed on race (recoverable residue), got: ' +
        G.git(tmp, ['log', '-1', '--format=%s', 'race'], { encoding: 'utf8' }).stdout.trim()
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(shimDir, { recursive: true, force: true });
  }
}

function testSinkMergeFromLinkedWorktree() {
  // Regression for issue #94: sink-merge invoked from inside a linked worktree
  // must not collide with the worktree registry's lock on the feature branch.
  // The fix uses `git -C mainRoot` for every git call so the script never
  // relies on its inherited cwd. We deliberately chdir to tmpdir before
  // worktree removal, which makes any missing `-C mainRoot` fail fast.
  // Updated for #264: worktrees now live at <root>/.kw/worktrees/<project>.
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-merge-linked-')));
  const kwRoot = tmp + '.kw'; // legacy path — kept for cleanup only
  try {
    initGitRepo(tmp);
    const wtPath = path.join(tmp, '.kw', 'worktrees', 'issue-941');
    fs.mkdirSync(path.dirname(wtPath), { recursive: true });
    G.git(tmp, ['worktree', 'add', '-b', 'workflow/issue-941', '--', wtPath, 'HEAD'], { encoding: 'utf8' });

    // Add a real commit on the feature branch so the merge fast-forwards main.
    fs.writeFileSync(path.join(wtPath, 'feature.txt'), 'feature\n');
    G.git(wtPath, ['add', 'feature.txt'], { encoding: 'utf8' });
    G.git(wtPath, ['commit', '-m', 'feature commit'], { encoding: 'utf8' });

    // Plant active folder in main worktree so Step 0 sees the worktree to remove.
    plantActiveFolder(tmp, 'issue-941', 941, null);

    const mainBefore = G.git(tmp, ['rev-parse', 'main'], { encoding: 'utf8' }).stdout.trim();
    const featureHead = G.git(wtPath, ['rev-parse', 'workflow/issue-941'], { encoding: 'utf8' }).stdout.trim();
    assert(mainBefore !== featureHead, 'precondition: main should lag the feature branch');

    const result = spawnSync(process.execPath, [
      sinkMergeScript,
      '--project', 'issue-941',
      '--branch', 'workflow/issue-941',
      '--issue', '941'
    ], {
      cwd: wtPath,
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' },
      encoding: 'utf8'
    });

    assert(
      result.status === 0,
      'sink-merge from linked worktree should exit 0\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr
    );
    assert(
      !/is already used by worktree/.test(result.stderr || ''),
      'sink-merge from linked worktree must not hit branch-locked error\nstderr: ' + result.stderr
    );

    const mainAfter = G.git(tmp, ['rev-parse', 'main'], { encoding: 'utf8' }).stdout.trim();
    assert(
      mainAfter === featureHead,
      'main should advance to feature branch HEAD after sink-merge from linked worktree\n' +
      'before: ' + mainBefore + '\nfeature: ' + featureHead + '\nafter: ' + mainAfter
    );

    const branchList = G.git(tmp, ['branch', '--list', 'workflow/issue-941'], { encoding: 'utf8' }).stdout.trim();
    assert(
      branchList === '',
      'feature branch should be deleted after sink-merge (Step 9), got: ' + JSON.stringify(branchList)
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(kwRoot, { recursive: true, force: true });
  }
}

function testSinkRefusesStaleReceipt() {
  // Regression for #484/#518:
  // #484: a stale all-`done` sink-receipt committed into the tracked archive/<project>/.cache/ tree
  // must NOT false-resume to status:sinked when the branch was never merged. The #484 ancestry
  // backstop asserts the branch IS an ancestor of the resolved default branch before emitting success.
  // #518: cycle-identity guard — receipt is stamped with branch_head at init; on resume, when the
  // receipt has merge:'done' and branch_head is ABSENT or DIFFERS from the current tip (prior cycle,
  // branch name reused), the receipt is REINITIALIZED so the merge runs fresh (no false refusal).
  // Only when branch_head MATCHES the current tip does cycle-identity hold and the #484 ancestry
  // backstop apply (verifying the merge actually landed).
  // Scenario A: receipt without branch_head (old-format / prior cycle without stamp) → cycle-identity
  // fires → reinit → merge runs fresh → status:sinked (deliverable lands on main).
  // Scenario B: receipt WITH branch_head matching current tip, merge:done, branch NOT merged → the
  // cycle-identity guard passes (same branch_head), but the #484 ancestry backstop still fires →
  // refuse stale_sink_receipt. This regression-locks the ancestry backstop is NOT removed.
  // Scenario C (no false-positive): branch genuinely merged → stale all-done receipt still sinks.
  const project = 'issue-9484';
  const branch = 'workflow/issue-9484';
  const staleReceiptNoHead = (extra) => JSON.stringify(Object.assign({
    project, branch, issue_number: 9484, issue_numbers: [9484],
    resolved_default_branch: 'main',
    started_at: '2026-06-14T12:14:18.462Z', updated_at: '2026-06-14T12:14:28.928Z',
    stash_ref: null, removed_duplicates: [],
    steps: { preflight: 'done', push_upstream: 'done', merge: 'done', worktree_sync: 'done', finalize: 'done', closure: 'done', stash_restore: 'done', archive_commit: 'done', push_main: 'done' },
  }, extra || {}));
  const runSink = (tmp) => spawnSync(process.execPath, [
    sinkMergeScript, '--branch', branch, '--issue', '9484', '--project', project, '--sink', '--json',
  ], { cwd: tmp, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
  const parseLast = (out) => { try { return JSON.parse(String(out || '').trim().split('\n').pop()); } catch (_) { return {}; } };

  // --- Scenario A (#518 cycle-identity): receipt has no branch_head (old-format / prior cycle) →
  // treated as new cycle → steps reinit → merge runs fresh → status:sinked, main advances.
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-stale-')));
    try {
      initGitRepo(tmp);
      const archiveCache = path.join(tmp, 'kaola-workflow', 'archive', project, '.cache');
      fs.mkdirSync(archiveCache, { recursive: true });
      // Write a stale receipt WITHOUT branch_head — simulates an old-cycle or pre-#518 receipt.
      fs.writeFileSync(path.join(archiveCache, 'sink-receipt.json'), staleReceiptNoHead());
      G.git(tmp, ['add', '-A'], { encoding: 'utf8' });
      G.git(tmp, ['commit', '-m', 'chore: record prior-slice sink receipt'], { encoding: 'utf8' });
      // feature branch with a deliverable NOT yet merged to main
      G.git(tmp, ['branch', branch], { encoding: 'utf8' });
      G.git(tmp, ['switch', branch], { encoding: 'utf8' });
      fs.writeFileSync(path.join(tmp, 'DELIVERABLE.txt'), 'deliverable\n');
      G.git(tmp, ['add', 'DELIVERABLE.txt'], { encoding: 'utf8' });
      G.git(tmp, ['commit', '-m', 'feat: slice deliverable'], { encoding: 'utf8' });
      G.git(tmp, ['switch', 'main'], { encoding: 'utf8' });
      const mainBefore = G.git(tmp, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();

      // The cycle-identity check sees no branch_head → isNewCycle=true → reinit → merge runs fresh.
      const result = runSink(tmp);
      const parsed = parseLast(result.stdout);
      assert(parsed.status === 'sinked', '#518-A: absent branch_head must trigger cycle reinit → merge runs → status:sinked, got ' + JSON.stringify(parsed));
      assert(result.status === 0, '#518-A: cycle reinit sink must exit 0, got ' + result.status);
      const mainAfter = G.git(tmp, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
      assert(mainAfter !== mainBefore, '#518-A: main must advance after cycle reinit sink');
      assert(G.git(tmp, ['cat-file', '-e', 'main:DELIVERABLE.txt'], { encoding: 'utf8' }).status === 0, '#518-A: the deliverable must be on main after cycle reinit sink');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  // --- Scenario B (#484 ancestry backstop survives): receipt WITH branch_head matching current tip,
  // merge:done, but branch NOT an ancestor of main → the cycle-identity guard passes (head matches)
  // but the #484 ancestry backstop fires → refuse stale_sink_receipt, exit non-zero.
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-backstop-')));
    try {
      initGitRepo(tmp);
      // Create feature branch and capture its tip BEFORE writing the receipt.
      G.git(tmp, ['branch', branch], { encoding: 'utf8' });
      G.git(tmp, ['switch', branch], { encoding: 'utf8' });
      fs.writeFileSync(path.join(tmp, 'DELIVERABLE.txt'), 'deliverable\n');
      G.git(tmp, ['add', 'DELIVERABLE.txt'], { encoding: 'utf8' });
      G.git(tmp, ['commit', '-m', 'feat: slice deliverable'], { encoding: 'utf8' });
      const featureTip = G.git(tmp, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
      // Switch back to main WITHOUT merging (branch is NOT an ancestor of main).
      G.git(tmp, ['switch', 'main'], { encoding: 'utf8' });

      // Write receipt with branch_head matching the CURRENT feature tip → cycle-identity passes.
      const archiveCache = path.join(tmp, 'kaola-workflow', 'archive', project, '.cache');
      fs.mkdirSync(archiveCache, { recursive: true });
      fs.writeFileSync(path.join(archiveCache, 'sink-receipt.json'), staleReceiptNoHead({ branch_head: featureTip }));
      G.git(tmp, ['add', '-A'], { encoding: 'utf8' });
      G.git(tmp, ['commit', '-m', 'chore: record same-cycle sink receipt'], { encoding: 'utf8' });
      // Capture mainBefore AFTER the receipt commit (that commit advanced main; sink must not further advance).
      const mainBefore = G.git(tmp, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();

      const result = runSink(tmp);
      const parsed = parseLast(result.stdout);
      assert(parsed.status !== 'sinked', '#484-B: same-tip unmerged receipt must NOT emit status:sinked, got ' + JSON.stringify(parsed));
      assert(parsed.result === 'refuse' && parsed.reason === 'stale_sink_receipt', '#484-B: ancestry backstop must refuse stale_sink_receipt, got ' + JSON.stringify(parsed));
      assert(result.status !== 0, '#484-B: ancestry backstop refusal must exit non-zero, got ' + result.status);
      const mainAfter = G.git(tmp, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
      assert(mainAfter === mainBefore, '#484-B: main must NOT advance on ancestry backstop refusal');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  // --- Scenario C (no false-positive): branch genuinely merged into main → stale all-done receipt still sinks.
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-merged-')));
    try {
      initGitRepo(tmp);
      const archiveCache = path.join(tmp, 'kaola-workflow', 'archive', project, '.cache');
      fs.mkdirSync(archiveCache, { recursive: true });
      fs.writeFileSync(path.join(archiveCache, 'sink-receipt.json'), staleReceiptNoHead());
      G.git(tmp, ['add', '-A'], { encoding: 'utf8' });
      G.git(tmp, ['commit', '-m', 'chore: record prior-slice sink receipt'], { encoding: 'utf8' });
      G.git(tmp, ['branch', branch], { encoding: 'utf8' });
      G.git(tmp, ['switch', branch], { encoding: 'utf8' });
      fs.writeFileSync(path.join(tmp, 'DELIVERABLE.txt'), 'deliverable\n');
      G.git(tmp, ['add', 'DELIVERABLE.txt'], { encoding: 'utf8' });
      G.git(tmp, ['commit', '-m', 'feat: slice deliverable'], { encoding: 'utf8' });
      G.git(tmp, ['switch', 'main'], { encoding: 'utf8' });
      // the branch genuinely landed (a real prior merge)
      G.git(tmp, ['merge', '--ff-only', branch], { encoding: 'utf8' });

      const result = runSink(tmp);
      const parsed = parseLast(result.stdout);
      assert(parsed.result !== 'refuse' || parsed.reason !== 'stale_sink_receipt', '#484-C: a genuinely-merged branch must NOT be false-refused as stale, got ' + JSON.stringify(parsed));
      assert(G.git(tmp, ['cat-file', '-e', 'main:DELIVERABLE.txt'], { encoding: 'utf8' }).status === 0, '#484-C: precondition — the deliverable is on main');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
}

// #496: assertWorktreeClean must FAIL CLOSED on a transient git-status probe fault. The guard is the
// only gate before a destructive `git worktree remove --force`; treating an unprovable probe as
// "clean" (the old `catch { status = '' }`) destroys uncommitted work on a flaky probe (index.lock /
// EAGAIN / EMFILE). The fix: a probe that cannot PROVE the worktree clean refuses (treats unprovable
// as dirty). KAOLA_WORKFLOW_FORCE_WT_STATUS_FAIL is a test-only injection of the probe fault.
function testAssertWorktreeCleanFailsClosedOnProbeFault() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-wt-probe-fault-')));
  try {
    initGitRepo(tmp);
    // Provision a CLEAN linked worktree on a feature branch (no uncommitted changes).
    G.git(tmp, ['branch', 'workflow/issue-9496'], { encoding: 'utf8' });
    const wt = path.join(tmp, '.kw', 'wt-9496');
    G.git(tmp, ['worktree', 'add', wt, 'workflow/issue-9496'], { encoding: 'utf8' });
    const mainBefore = G.git(tmp, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();

    // Inject a probe fault: the worktree status probe throws. A fail-OPEN guard would treat this as
    // clean and proceed to the destructive worktree removal; a fail-CLOSED guard must refuse.
    const result = spawnSync(process.execPath, [
      sinkMergeScript, '--project', 'issue-9496', '--branch', 'workflow/issue-9496',
    ], {
      cwd: tmp,
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_WORKFLOW_FORCE_WT_STATUS_FAIL: '1' },
      encoding: 'utf8',
    });
    assert(result.status !== 0, '#496: an unprovable worktree-clean probe must refuse (fail closed), got status ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(/(could not|cannot) (be )?verif|unprovable/i.test(result.stderr || ''), '#496: refusal must name the unverifiable-clean cause, got stderr: ' + result.stderr);
    // The worktree (and any work in it) must survive the refusal.
    assert(fs.existsSync(wt), '#496: a probe-fault refusal must NOT remove the worktree, got removed: ' + wt);
    const mainAfter = G.git(tmp, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    assert(mainAfter === mainBefore, '#496: main must NOT advance on a probe-fault refusal');

    // Guard A (not over-broad): a genuinely-CLEAN worktree with NO injected fault still proceeds past
    // the clean guard (it must not now refuse every sink). We assert the run does not refuse with the
    // probe-fault cause.
    const ok = spawnSync(process.execPath, [
      sinkMergeScript, '--project', 'issue-9496', '--branch', 'workflow/issue-9496',
    ], {
      cwd: tmp,
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' },
      encoding: 'utf8',
    });
    assert(!/(could not|cannot) (be )?verif|unprovable/i.test(ok.stderr || ''), '#496: a clean worktree with no injected fault must NOT trip the fail-closed probe guard, got stderr: ' + ok.stderr);
    console.log('testAssertWorktreeCleanFailsClosedOnProbeFault: PASSED');
  } finally {
    try { G.git(tmp, ['worktree', 'remove', '--force', path.join(tmp, '.kw', 'wt-9496')], { encoding: 'utf8' }); } catch (_) {}
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// #506: assertWorktreeClean must FAIL CLOSED on a transient `git worktree list` probe fault (the
// OUTER probe — the one that enumerates linked worktrees, distinct from the #496 inner status probe).
// A fault in the outer probe silently returned as 'nothing to guard', skipping the entire clean-check
// before the destructive `git worktree remove --force`. The fix: a bounded retry, and if the probe
// still fails, throw a descriptive refusal (unverifiable list → cannot prove safety → refuse).
// KAOLA_WORKFLOW_FORCE_WT_LIST_FAIL is the test-only injection hook.
function testAssertWorktreeCleanFailsClosedOnListProbeFault() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-wt-list-fault-')));
  try {
    initGitRepo(tmp);
    // Provision a CLEAN linked worktree on a feature branch (no uncommitted changes).
    G.git(tmp, ['branch', 'workflow/issue-9506'], { encoding: 'utf8' });
    const wt = path.join(tmp, '.kw', 'wt-9506');
    G.git(tmp, ['worktree', 'add', wt, 'workflow/issue-9506'], { encoding: 'utf8' });
    const mainBefore = G.git(tmp, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();

    // Inject a list-probe fault: `git worktree list` throws. A fail-OPEN guard returns silently
    // as "nothing to guard"; a fail-CLOSED guard must refuse (cannot prove safety → reject).
    const result = spawnSync(process.execPath, [
      sinkMergeScript, '--project', 'issue-9506', '--branch', 'workflow/issue-9506',
    ], {
      cwd: tmp,
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_WORKFLOW_FORCE_WT_LIST_FAIL: '1' },
      encoding: 'utf8',
    });
    assert(result.status !== 0, '#506: an unprovable worktree-list probe must refuse (fail closed), got status ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(/worktree list|enumerate worktree/i.test(result.stderr || ''), '#506: refusal must name the unverifiable worktree-list cause, got stderr: ' + result.stderr);
    // The worktree (and any work in it) must survive the refusal.
    assert(fs.existsSync(wt), '#506: a list-probe-fault refusal must NOT remove the worktree, got removed: ' + wt);
    const mainAfter = G.git(tmp, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    assert(mainAfter === mainBefore, '#506: main must NOT advance on a list-probe-fault refusal');

    // Guard A (not over-broad): a genuinely-CLEAN worktree with NO injected fault still proceeds
    // past the list guard (must not refuse every sink). Assert the run does not refuse with the
    // list-probe-fault message.
    const ok = spawnSync(process.execPath, [
      sinkMergeScript, '--project', 'issue-9506', '--branch', 'workflow/issue-9506',
    ], {
      cwd: tmp,
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' },
      encoding: 'utf8',
    });
    assert(!/worktree list|enumerate worktree/i.test(ok.stderr || ''), '#506: a clean worktree with no injected list fault must NOT trip the fail-closed list guard, got stderr: ' + ok.stderr);
    console.log('testAssertWorktreeCleanFailsClosedOnListProbeFault: PASSED');
  } finally {
    try { G.git(tmp, ['worktree', 'remove', '--force', path.join(tmp, '.kw', 'wt-9506')], { encoding: 'utf8' }); } catch (_) {}
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// #497: the --sink TRANSACTION must NOT report status:sinked when push_main (or closure) HARD-fails.
// The old code wrapped push_main in a try whose catch only warned, then ran stepDone('push_main')
// unconditionally; the #484 freshness guard checks branch ANCESTRY (which holds on a local FF merge
// regardless of push), so the run fell through to status:sinked with the deliverable un-pushed. A
// re-run then skips the already-`done` push step → it never retries. The fix: on a hard push/close
// failure, do NOT stepDone, record the outcome in the receipt, and emit a non-sinked refusal so the
// caller can detect + retry (branch preserved). KAOLA_WORKFLOW_FORCE_PUSH_MAIN_FAIL injects the fault.
function testSinkRefusesOnPushMainFailure() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-pushfail-')));
  const remotePath = initGitRepoWithBareRemote(tmp);
  try {
    G.git(tmp, ['checkout', '-b', 'workflow/issue-9497'], { encoding: 'utf8' });
    G.git(tmp, ['push', '-u', 'origin', 'workflow/issue-9497'], { encoding: 'utf8' });
    fs.writeFileSync(path.join(tmp, 'DELIVERABLE.txt'), 'deliverable\n');
    G.git(tmp, ['add', 'DELIVERABLE.txt'], { encoding: 'utf8' });
    G.git(tmp, ['commit', '-m', 'feat: deliverable'], { encoding: 'utf8' });
    G.git(tmp, ['push', 'origin', 'workflow/issue-9497'], { encoding: 'utf8' });
    G.git(tmp, ['checkout', 'main'], { encoding: 'utf8' });

    const result = spawnSync(process.execPath, [
      sinkMergeScript, '--branch', 'workflow/issue-9497', '--project', 'issue-9497', '--sink', '--json',
    ], {
      cwd: tmp,
      // OFFLINE=0 so push_main is attempted; FORCE_PUSH_MAIN_FAIL makes that push throw deterministically.
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_WORKFLOW_FORCE_PUSH_MAIN_FAIL: '1' },
      encoding: 'utf8',
    });
    const parseLast = (out) => { try { return JSON.parse(String(out || '').trim().split('\n').pop()); } catch (_) { return {}; } };
    const parsed = parseLast(result.stdout);
    assert(parsed.status !== 'sinked', '#497: a hard push_main failure must NOT report status:sinked, got ' + JSON.stringify(parsed) + '\nstderr: ' + result.stderr);
    assert(result.status !== 0, '#497: a hard push_main failure must exit non-zero, got ' + result.status);
    // The emit must SURFACE the non-pushed outcome so the caller can detect + retry.
    assert(parsed.result === 'refuse', '#497: a hard push_main failure must emit result:refuse, got ' + JSON.stringify(parsed));
    assert(/push|main/i.test(JSON.stringify(parsed)), '#497: the refusal must surface the un-pushed push_main outcome, got ' + JSON.stringify(parsed));
    // The receipt must NOT mark push_main done (else a re-run skips the retry).
    const receiptPaths = [
      path.join(tmp, 'kaola-workflow', 'archive', 'issue-9497', '.cache', 'sink-receipt.json'),
      path.join(tmp, 'kaola-workflow', 'issue-9497', '.cache', 'sink-receipt.json'),
    ];
    const rp = receiptPaths.find(p => fs.existsSync(p));
    assert(rp, '#497: a sink-receipt must exist after the failed transaction, looked in ' + receiptPaths.join(', '));
    const receipt = JSON.parse(fs.readFileSync(rp, 'utf8'));
    assert(receipt.steps.push_main !== 'done', '#497: push_main must NOT be marked done after a hard push failure (else re-run never retries), got ' + receipt.steps.push_main);
    console.log('testSinkRefusesOnPushMainFailure: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(remotePath, { recursive: true, force: true });
  }
}

// #619(3): the --sink transaction must NOT report push_upstream:done (and must never fall through
// to status:sinked) when the push_upstream step's push genuinely fails. The old code swallowed
// EVERY push failure in a bare catch and unconditionally ran stepDone('push_upstream') — a branch
// that was never actually backed up on the remote was still attested as pushed. The fix verifies
// branch@{u} parity after the push attempt and refuses (typed sink_incomplete) on non-parity,
// leaving the step NOT done so a re-run retries it.
function testSinkRefusesOnPushUpstreamFailure() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-pushupfail-')));
  const remotePath = initGitRepoWithBareRemote(tmp);
  try {
    // A feature branch with a real (unpushed) commit and NO upstream configured — the forced push
    // failure below means `git push -u` never actually runs, so branch@{u} never resolves and the
    // parity check genuinely fails (this is not a fabricated assertion — it is the real git state).
    G.git(tmp, ['checkout', '-b', 'workflow/issue-9499'], { encoding: 'utf8' });
    fs.writeFileSync(path.join(tmp, 'DELIVERABLE.txt'), 'deliverable\n');
    G.git(tmp, ['add', 'DELIVERABLE.txt'], { encoding: 'utf8' });
    G.git(tmp, ['commit', '-m', 'feat: deliverable'], { encoding: 'utf8' });
    G.git(tmp, ['checkout', 'main'], { encoding: 'utf8' });

    const result = spawnSync(process.execPath, [
      sinkMergeScript, '--branch', 'workflow/issue-9499', '--project', 'issue-9499', '--sink', '--json',
    ], {
      cwd: tmp,
      // OFFLINE=0 so push_upstream is attempted; FORCE_PUSH_UPSTREAM_FAIL makes that push throw
      // deterministically (and — since the branch has no other upstream — the parity re-check
      // genuinely fails too, proving the refusal is not merely trusting the forced exception).
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_WORKFLOW_FORCE_PUSH_UPSTREAM_FAIL: '1' },
      encoding: 'utf8',
    });
    const parseLast = (out) => { try { return JSON.parse(String(out || '').trim().split('\n').pop()); } catch (_) { return {}; } };
    const parsed = parseLast(result.stdout);
    assert(parsed.status !== 'sinked', '#619(3): a hard push_upstream failure must NOT report status:sinked, got ' + JSON.stringify(parsed) + '\nstderr: ' + result.stderr);
    assert(result.status !== 0, '#619(3): a hard push_upstream failure must exit non-zero, got ' + result.status);
    assert(parsed.result === 'refuse' && parsed.reason === 'sink_incomplete' && parsed.step === 'push_upstream',
      '#619(3): refusal must be result:refuse reason:sink_incomplete step:push_upstream, got ' + JSON.stringify(parsed));
    // The receipt must NOT mark push_upstream done (else a re-run skips the retry).
    const receiptPaths = [
      path.join(tmp, 'kaola-workflow', 'archive', 'issue-9499', '.cache', 'sink-receipt.json'),
      path.join(tmp, 'kaola-workflow', 'issue-9499', '.cache', 'sink-receipt.json'),
    ];
    const rp = receiptPaths.find(p => fs.existsSync(p));
    assert(rp, '#619(3): a sink-receipt must exist after the failed transaction, looked in ' + receiptPaths.join(', '));
    const receipt = JSON.parse(fs.readFileSync(rp, 'utf8'));
    assert(receipt.steps.push_upstream !== 'done', '#619(3): push_upstream must NOT be marked done after a hard push failure (else re-run never retries), got ' + receipt.steps.push_upstream);
    assert(receipt.push_upstream === 'failed', '#619(3): receipt.push_upstream must be "failed", got ' + JSON.stringify(receipt.push_upstream));
    console.log('testSinkRefusesOnPushUpstreamFailure: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(remotePath, { recursive: true, force: true });
  }
}

// #619(4): the standalone `worktree_sync` SINK_STEP always ran AFTER the 'merge' step already
// removed the linked worktree, so its own `git worktree list` scan could never find a matching
// block — wtPath was always null and the copy it attempted never ran, yet stepDone('worktree_sync')
// recorded it as done every time (a no-op receipt attestation). The fix moves the copy INLINE into
// the 'merge' step, BEFORE the worktree is removed. This test proves the copy is now REAL: an
// untracked marker file that exists ONLY inside the linked worktree's project folder (mirroring a
// live kaola-workflow/<project>/.cache/dispatch-log.jsonl crash-resume journal, which is gitignored
// and therefore invisible to git checkout) must survive into mainRoot after the --sink transaction.
function testSinkTransactionSyncsUntrackedWorktreeProjectDirOnMerge() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-wtsync-')));
  const remotePath = initGitRepoWithBareRemote(tmp);
  const project = 'issue-9500';
  const branch = 'workflow/' + project;
  // The canonical worktree convention path (worktreePathFor): mainRoot/.kw/worktrees/<project>.
  const wtPath = path.join(tmp, '.kw', 'worktrees', project);
  try {
    G.git(tmp, ['branch', branch], { encoding: 'utf8' });
    G.git(tmp, ['worktree', 'add', wtPath, branch], { encoding: 'utf8' });
    fs.writeFileSync(path.join(wtPath, 'DELIVERABLE.txt'), 'deliverable\n');
    G.git(wtPath, ['add', 'DELIVERABLE.txt'], { encoding: 'utf8' });
    G.git(wtPath, ['commit', '-m', 'feat: deliverable'], {
      encoding: 'utf8',
      env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@test.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@test.com' }
    });
    // Untracked live-project marker INSIDE the worktree ONLY (never git-added) — the exact shape of
    // a gitignored kaola-workflow/<project>/.cache/ crash-resume journal.
    const markerRel = path.join('kaola-workflow', project, '.cache', 'dispatch-log.jsonl');
    fs.mkdirSync(path.dirname(path.join(wtPath, markerRel)), { recursive: true });
    fs.writeFileSync(path.join(wtPath, markerRel), '{"marker":"untracked-worktree-only"}\n');

    const result = spawnSync(process.execPath, [
      sinkMergeScript, '--branch', branch, '--project', project, '--sink', '--json',
    ], {
      cwd: tmp,
      encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '0' },
    });
    const parseLast = (out) => { try { return JSON.parse(String(out || '').trim().split('\n').pop()); } catch (_) { return {}; } };
    const parsed = parseLast(result.stdout);
    assert(result.status === 0, '#619(4): --sink must succeed, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(parsed.status === 'sinked', '#619(4): expected status:sinked, got ' + JSON.stringify(parsed));

    // The untracked marker must have survived somewhere under kaola-workflow/ — either still under
    // the live project dir, or moved into the archive dir (the normal outcome, since the 'finalize'
    // step archives kaola-workflow/<project> -> kaola-workflow/archive/<project> via a filesystem
    // rename that carries untracked content along; archiveProjectDir may suffix the destination
    // with .archived-<ts> if an archive dir already exists, e.g. from an earlier receipt write, so
    // search recursively rather than assuming one fixed landing path).
    const findMarker = (dir) => {
      let found = false;
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return false; }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { if (findMarker(full)) found = true; }
        else if (entry.name === 'dispatch-log.jsonl') {
          try { if (fs.readFileSync(full, 'utf8').includes('untracked-worktree-only')) found = true; } catch (_) {}
        }
      }
      return found;
    };
    const survived = findMarker(path.join(tmp, 'kaola-workflow'));
    assert(survived, '#619(4): the untracked worktree-only marker (dispatch-log.jsonl) must be copied into mainRoot before the worktree is destroyed; not found anywhere under kaola-workflow/');
    console.log('testSinkTransactionSyncsUntrackedWorktreeProjectDirOnMerge: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(remotePath, { recursive: true, force: true });
  }
}

// #631: cmdVerifySink's false-alarm (`impl_commit_not_ancestor`) on a clean sink whose branch was
// rebased mid-flight traces to `branch_head` being stamped ONCE at receipt init (before doRebase
// runs) and NEVER re-stamped after a rebase rewrites the branch's commits. The fix stamps a NEW,
// ADDITIVE `published_head` at the closure gate once the live (post-rebase) tip resolves as
// actually published, WITHOUT touching `branch_head` (load-bearing for the #518 cycle-identity
// guard). This test forces a genuine rebase (a concurrent main advance) and proves: (1)
// published_head is stamped, (2) branch_head is untouched (still the ORIGINAL pre-rebase SHA), and
// (3) the two values differ — proving published_head carries the fresh, rebased tip.
function testSinkTransactionStampsPublishedHeadAfterRebase() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-pubhead-')));
  const remotePath = initGitRepoWithBareRemote(tmp);
  const clone = tmp + '-clone';
  const env = { ...process.env, ...GIT_ISOLATION_ENV, KAOLA_WORKFLOW_SKIP_TESTGATE: '1', GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@t' };
  const project = 'issue-9502';
  const branch = 'workflow/' + project;
  try {
    G.git(tmp, ['checkout', '-b', branch], { env });
    fs.writeFileSync(path.join(tmp, 'feat.txt'), 'impl');
    G.git(tmp, ['add', 'feat.txt'], { env });
    G.git(tmp, ['commit', '-m', 'feat: impl 9502'], { env });
    const preRebaseHead = G.git(tmp, ['rev-parse', branch], { encoding: 'utf8', env }).stdout.trim();
    G.git(tmp, ['push', '-u', 'origin', branch], { env });
    G.git(tmp, ['checkout', 'main'], { env });

    // Advance origin/main concurrently (via a fresh clone) so the feature branch is NOT
    // fast-forwardable and doRebase genuinely rewrites its commits (a new SHA post-rebase).
    G.raw(['clone', remotePath, clone], { env });
    G.git(clone, ['checkout', '-B', 'main', 'origin/main'], { env });
    fs.writeFileSync(path.join(clone, 'concurrent.txt'), 'x');
    G.git(clone, ['add', '-A'], { env });
    G.git(clone, ['commit', '-m', 'concurrent main advance'], { env });
    G.git(clone, ['push', 'origin', 'main'], { env });

    const result = spawnSync(process.execPath, [
      sinkMergeScript, '--branch', branch, '--project', project, '--sink', '--json',
    ], { cwd: tmp, encoding: 'utf8', env: { ...env, KAOLA_WORKFLOW_OFFLINE: '0' } });
    const parseLast = (out) => { try { return JSON.parse(String(out || '').trim().split('\n').pop()); } catch (_) { return {}; } };
    const parsed = parseLast(result.stdout);
    assert(result.status === 0, '#631: --sink must succeed on a rebased branch, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(parsed.status === 'sinked', '#631: expected status:sinked, got ' + JSON.stringify(parsed));
    const receipt = parsed.receipt;
    assert(receipt && typeof receipt.published_head === 'string' && receipt.published_head.length > 0,
      '#631: receipt.published_head must be stamped, got ' + JSON.stringify(receipt));
    assert(receipt.branch_head === preRebaseHead,
      '#631: branch_head must remain the ORIGINAL pre-rebase stamp (load-bearing for the #518 cycle-identity guard) — must NOT be mutated, got ' + JSON.stringify(receipt && receipt.branch_head) + ' vs expected ' + preRebaseHead);
    assert(receipt.published_head !== receipt.branch_head,
      '#631: published_head must be the FRESH rebased tip, differing from the stale pre-rebase branch_head, got both = ' + receipt.published_head);
    console.log('testSinkTransactionStampsPublishedHeadAfterRebase: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(remotePath, { recursive: true, force: true });
    try { fs.rmSync(clone, { recursive: true, force: true }); } catch (_) {}
  }
}

// #497 (closure arm): the --sink transaction must NOT report status:sinked when a HARD issue-CLOSE
// failure occurs. The old code only warned (and bundle members swallowed with a bare catch), then
// ran stepDone('closure') unconditionally → fell through to status:sinked. The fix buckets each
// member into closed/failed, records remote_issue_closed in the receipt, and on a genuine failure
// emits a non-sinked refusal (step: 'closure') + leaves closure NOT done + returns BEFORE push_main.
// A gh mock where `issue close`→exit 1 and `issue view … state`→open makes the close GENUINELY fail
// (probeIssueClosed returns false = not already-closed) without any real network.
function testSinkRefusesOnCloseFailure() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-closefail-')));
  const remotePath = initGitRepoWithBareRemote(tmp);
  // The gh mock lives OUTSIDE the repo root — a mock file inside the repo would be classified as
  // foreign-dirt by the sink preflight and refuse before the closure step ever runs.
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-closemock-'));
  fs.mkdirSync(binDir, { recursive: true });
  // Mock gh: issue view → state open; issue close → exit 1 (genuine close failure); everything else ok.
  fs.writeFileSync(path.join(binDir, 'gh.js'), [
    "const a = process.argv.slice(2).join(' ');",
    "if (/issue view \\d+/.test(a)) { process.stdout.write('open\\n'); process.exit(0); }",
    "if (/issue close \\d+/.test(a)) { process.stderr.write('mock: close failed\\n'); process.exit(1); }",
    "if (a.includes('repo view')) { process.stdout.write('{\"owner\":{\"login\":\"test\"},\"name\":\"repo\"}\\n'); process.exit(0); }",
    "process.stdout.write('\\n'); process.exit(0);",
  ].join('\n'));
  try {
    G.git(tmp, ['checkout', '-b', 'workflow/issue-9498'], { encoding: 'utf8' });
    G.git(tmp, ['push', '-u', 'origin', 'workflow/issue-9498'], { encoding: 'utf8' });
    fs.writeFileSync(path.join(tmp, 'DELIVERABLE.txt'), 'deliverable\n');
    G.git(tmp, ['add', 'DELIVERABLE.txt'], { encoding: 'utf8' });
    G.git(tmp, ['commit', '-m', 'feat: deliverable'], { encoding: 'utf8' });
    G.git(tmp, ['push', 'origin', 'workflow/issue-9498'], { encoding: 'utf8' });
    G.git(tmp, ['checkout', 'main'], { encoding: 'utf8' });

    const result = spawnSync(process.execPath, [
      sinkMergeScript, '--branch', 'workflow/issue-9498', '--project', 'issue-9498', '--issue', '9498', '--sink', '--json',
    ], {
      cwd: tmp,
      // OFFLINE=0 so the closure step runs; the gh mock makes `issue close` genuinely fail.
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_GH_MOCK_SCRIPT: path.join(binDir, 'gh.js') },
      encoding: 'utf8',
    });
    const parseLast = (out) => { try { return JSON.parse(String(out || '').trim().split('\n').pop()); } catch (_) { return {}; } };
    const parsed = parseLast(result.stdout);
    assert(parsed.status !== 'sinked', '#497-close: a hard issue-close failure must NOT report status:sinked, got ' + JSON.stringify(parsed) + '\nstderr: ' + result.stderr);
    assert(result.status !== 0, '#497-close: a hard close failure must exit non-zero, got ' + result.status);
    assert(parsed.result === 'refuse' && parsed.step === 'closure', '#497-close: a hard close failure must emit result:refuse step:closure, got ' + JSON.stringify(parsed));
    assert(Array.isArray(parsed.failed_issue_closures) && parsed.failed_issue_closures.includes(9498), '#497-close: the refusal must surface the failed closure (9498), got ' + JSON.stringify(parsed));
    const receiptPaths = [
      path.join(tmp, 'kaola-workflow', 'archive', 'issue-9498', '.cache', 'sink-receipt.json'),
      path.join(tmp, 'kaola-workflow', 'issue-9498', '.cache', 'sink-receipt.json'),
    ];
    const rp = receiptPaths.find(p => fs.existsSync(p));
    assert(rp, '#497-close: a sink-receipt must exist after the failed transaction, looked in ' + receiptPaths.join(', '));
    const receipt = JSON.parse(fs.readFileSync(rp, 'utf8'));
    assert(receipt.steps.closure !== 'done', '#497-close: closure must NOT be marked done after a hard close failure (else re-run never retries), got ' + receipt.steps.closure);
    // #617: SINK_STEPS now runs closure LAST (after push_main), so push_main must already be
    // 'done' by the time the closure step's close-failure short-circuit fires — the merge itself
    // succeeded; only the issue-close call failed.
    assert(receipt.steps.push_main === 'done', '#497-close: push_main must already be done (closure runs after push_main), got ' + receipt.steps.push_main);
    console.log('testSinkRefusesOnCloseFailure: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(remotePath, { recursive: true, force: true });
    fs.rmSync(binDir, { recursive: true, force: true });
  }
}

// Startup NEVER auto-picks, and the number of active folders sitting there does not change that:
// zero, one and many all answer the same way. It is a usage answer, so nothing is written and the
// exit is 0 — the caller names a target and re-runs. The active-folder count is the discriminating
// variable, so it stays a loop; three copies of one property was three chances to drift.
function testNoTargetNeverAutoPicks() {
  for (const planted of [[], [600], [601, 602]]) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-no-target-' + planted.length + '-'));
    try {
      for (const n of planted) plantActiveFolder(tmp, 'issue-' + n, n, null);
      const result = runNode(claimScript, ['startup'], tmp);
      const label = planted.length + ' active folder(s)';
      assert(result.status === 0,
        'no-target with ' + label + ' is a usage answer at exit 0, got ' + result.status);
      const out = JSON.parse(result.stdout);
      assert(out.claim === 'none' && out.project === null,
        'no-target with ' + label + ' must adopt NOTHING, got ' + JSON.stringify(out));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
}

function testSoleActiveRoundTrip() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sole-active-roundtrip-'));
  try {
    plantActiveFolder(tmp, 'issue-603', 603, null);
    // Add worktree_path to the workflow-state.md Sink block
    const stateFile = path.join(tmp, 'kaola-workflow', 'issue-603', 'workflow-state.md');
    const stateContent = fs.readFileSync(stateFile, 'utf8');
    fs.writeFileSync(stateFile, stateContent + 'worktree_path: ' + path.join(tmp, 'issue-603') + '\n');

    // Step 1: read status → derive issue number
    const statusOut = json(runNode(claimScript, ['status'], tmp));
    assert(statusOut.count === 1, 'status should show count 1, got ' + statusOut.count);
    assert(statusOut.active.length === 1, 'status should have 1 active folder');
    const issueNumber = statusOut.active[0].issue_number;
    assert(issueNumber === 603, 'active issue_number should be 603, got ' + issueNumber);

    // Step 2: startup --target-issue N → owned + worktree_path non-empty
    const startupOut = json(runNode(claimScript, ['startup', '--target-issue', String(issueNumber)], tmp));
    assert(startupOut.verdict === 'owned', 'startup should return verdict: owned, got ' + startupOut.verdict);
    assert(typeof startupOut.worktree_path === 'string' && startupOut.worktree_path.length > 0,
      'startup owned result must have non-empty worktree_path, got: ' + JSON.stringify(startupOut.worktree_path));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testStatusShowsClosedIssueDrift() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-status-drift-'));
  try {
    plantActiveFolder(tmp, 'open-project', 100, null);
    plantActiveFolder(tmp, 'closed-project', 200, null);
    const binDir = path.join(tmp, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    writeShimFiles(path.join(binDir, 'gh'), [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue view 100')) { process.stdout.write('{\"state\":\"OPEN\"}\\n'); }",
      "else if (a.includes('issue view 200')) { process.stdout.write('{\"state\":\"CLOSED\"}\\n'); }",
      "else { process.stdout.write('[\\n'); }"
    ]);
    const online = runClaimOnline(['status'], tmp, binDir);
    assert(online.active.length === 1, 'online status: active should have 1 folder, got ' + online.active.length);
    assert(online.drift.length === 1, 'online status: drift should have 1 folder, got ' + online.drift.length);
    assert(online.count === 1, 'online status: count should be 1, got ' + online.count);
    const offline = json(runNode(claimScript, ['status'], tmp));
    assert(offline.active.length === 2, 'offline status: all 2 folders in active, got ' + offline.active.length);
    assert(offline.drift.length === 0, 'offline status: drift should be empty, got ' + offline.drift.length);
    assert(offline.count === 2, 'offline status: count should be 2, got ' + offline.count);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testStaleWorktreeCheck() {
  // Helper: write gh shim that handles all issue numbers used across sub-cases
  function writeGhShimForStale(binDir) {
    fs.mkdirSync(binDir, { recursive: true });
    writeShimFiles(path.join(binDir, 'gh'), [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue view 100')) { process.stdout.write('{\"state\":\"open\"}\\n'); }",
      "else if (a.includes('issue view 200')) { process.stdout.write('{\"state\":\"closed\"}\\n'); }",
      "else if (a.includes('issue view 300')) { process.stdout.write('{\"state\":\"open\"}\\n'); }",
      "else if (a.includes('issue view 400')) { process.stdout.write('{\"state\":\"closed\"}\\n'); }",
      "else if (a.includes('issue view 500')) { process.stdout.write('{\"state\":\"open\"}\\n'); }",
      "else if (a.includes('repo view')) { process.stdout.write('{\"owner\":{\"login\":\"test\"},\"name\":\"repo\"}\\n'); }",
      "else { process.stdout.write('[\\n'); }"
    ]);
  }

  // Sub-case 1: closed worktree → stale_worktrees
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-stale-wt-sc1-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeGhShimForStale(binDir);
      // Create branch and linked worktree for issue 200 (closed)
      const wtPath = path.join(kwRoot, 'issue-200');
      fs.mkdirSync(kwRoot, { recursive: true });
      G.git(tmp, ['worktree', 'add', '-b', 'workflow/issue-200', '--', wtPath, 'HEAD'], { encoding: 'utf8' });
      const result = runClaimOnline(['stale-worktree-check'], tmp, binDir);
      const entry = result.stale_worktrees.find(x => x.issue_number === 200);
      assert(entry != null, 'sc1: issue 200 must appear in stale_worktrees, got: ' + JSON.stringify(result.stale_worktrees));
      assert(result.stale_branches.find(x => x.issue_number === 200) == null, 'sc1: issue 200 must NOT appear in stale_branches when it has a registered worktree, got: ' + JSON.stringify(result.stale_branches));
      assert(result.count >= 1, 'sc1: count must be >= 1, got: ' + result.count);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 2: archived-open worktree → stale_worktrees (isArchived=true even though issue open)
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-stale-wt-sc2-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeGhShimForStale(binDir);
      // Create branch and linked worktree for issue 300 (open, but archived)
      const wtPath = path.join(kwRoot, 'issue-300');
      fs.mkdirSync(kwRoot, { recursive: true });
      G.git(tmp, ['worktree', 'add', '-b', 'workflow/issue-300', '--', wtPath, 'HEAD'], { encoding: 'utf8' });
      // Create archive directory to trigger isArchived=true
      fs.mkdirSync(path.join(tmp, 'kaola-workflow', 'archive', 'issue-300'), { recursive: true });
      const result = runClaimOnline(['stale-worktree-check'], tmp, binDir);
      const entry = result.stale_worktrees.find(x => x.issue_number === 300);
      assert(entry != null, 'sc2: issue 300 must appear in stale_worktrees (archived), got: ' + JSON.stringify(result.stale_worktrees));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 3: open worktree with active folder → active_worktrees, NOT stale
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-stale-wt-sc3-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeGhShimForStale(binDir);
      // Create branch and linked worktree for issue 100 (open)
      const wtPath = path.join(kwRoot, 'issue-100');
      fs.mkdirSync(kwRoot, { recursive: true });
      G.git(tmp, ['worktree', 'add', '-b', 'workflow/issue-100', '--', wtPath, 'HEAD'], { encoding: 'utf8' });
      // Plant active folder so issue 100 appears in activeSet
      plantActiveFolder(tmp, 'issue-100', 100, null);
      const result = runClaimOnline(['stale-worktree-check'], tmp, binDir);
      const inActive = result.active_worktrees.find(x => x.issue_number === 100);
      const inStale = result.stale_worktrees.find(x => x.issue_number === 100);
      assert(inActive != null, 'sc3: issue 100 must appear in active_worktrees, got: ' + JSON.stringify(result.active_worktrees));
      assert(inStale == null, 'sc3: issue 100 must NOT appear in stale_worktrees, got: ' + JSON.stringify(result.stale_worktrees));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 4: worktree path deleted (not via git) → state: 'missing'
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-stale-wt-sc4-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeGhShimForStale(binDir);
      // Register worktree for issue 200 (closed), then delete the directory without git
      const wtPath = path.join(kwRoot, 'issue-200');
      fs.mkdirSync(kwRoot, { recursive: true });
      G.git(tmp, ['worktree', 'add', '-b', 'workflow/issue-200', '--', wtPath, 'HEAD'], { encoding: 'utf8' });
      // Delete directory without using git worktree remove — git metadata survives
      fs.rmSync(wtPath, { recursive: true, force: true });
      const result = runClaimOnline(['stale-worktree-check'], tmp, binDir);
      const entry = result.stale_worktrees.find(x => x.issue_number === 200);
      assert(entry != null, 'sc4: issue 200 must appear in stale_worktrees after dir deletion, got: ' + JSON.stringify(result.stale_worktrees));
      assert(entry.state === 'missing', 'sc4: state must be "missing" when worktree dir deleted, got: ' + entry.state);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 5: loose branch (no registered worktree) for closed issue → stale_branches
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-stale-wt-sc5-')));
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeGhShimForStale(binDir);
      // Create local branch for issue 400 (closed) without adding a worktree
      G.git(tmp, ['branch', 'workflow/issue-400'], { encoding: 'utf8' });
      const result = runClaimOnline(['stale-worktree-check'], tmp, binDir);
      const entry = result.stale_branches.find(x => x.issue_number === 400);
      assert(entry != null, 'sc5: issue 400 must appear in stale_branches, got: ' + JSON.stringify(result.stale_branches));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  // Sub-case 6: OFFLINE=1 + archived worktree → still reported in stale_worktrees
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-stale-wt-sc6-')));
    const kwRoot = tmp + '.kw';
    try {
      initGitRepo(tmp);
      // Register worktree for issue 500
      const wtPath = path.join(kwRoot, 'issue-500');
      fs.mkdirSync(kwRoot, { recursive: true });
      G.git(tmp, ['worktree', 'add', '-b', 'workflow/issue-500', '--', wtPath, 'HEAD'], { encoding: 'utf8' });
      // Create archive directory to trigger isArchived=true
      fs.mkdirSync(path.join(tmp, 'kaola-workflow', 'archive', 'issue-500'), { recursive: true });
      // Use runNode which sets KAOLA_WORKFLOW_OFFLINE=1; no gh shim needed
      const result = json(runNode(claimScript, ['stale-worktree-check'], tmp));
      const entry = result.stale_worktrees.find(x => x.issue_number === 500);
      assert(entry != null, 'sc6: issue 500 must appear in stale_worktrees when OFFLINE+archived, got: ' + JSON.stringify(result.stale_worktrees));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  console.log('testStaleWorktreeCheck: PASSED');
}

function testStaleWorktreeCleanup() {
  // Helper: write gh shim that reports issue 200 as closed
  function writeGhShim(binDir) {
    fs.mkdirSync(binDir, { recursive: true });
    writeShimFiles(path.join(binDir, 'gh'), [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue view 200')) { process.stdout.write('{\"state\":\"closed\"}\\n'); }",
      "else if (a.includes('repo view')) { process.stdout.write('{\"owner\":{\"login\":\"test\"},\"name\":\"repo\"}\\n'); }",
      "else { process.stdout.write('[\\n'); }"
    ]);
  }

  // Sub-case 1: dry-run — clean worktree, no --execute
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-stale-cleanup-sc1-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeGhShim(binDir);
      const wtPath = path.join(kwRoot, 'wt-cleanup-200');
      fs.mkdirSync(kwRoot, { recursive: true });
      G.git(tmp, ['worktree', 'add', '-b', 'workflow/issue-200', '--', wtPath, 'HEAD'], { encoding: 'utf8' });
      const out = runClaimOnline(['stale-worktree-cleanup'], tmp, binDir);
      assert(out.dry_run === true, 'sc1: dry_run must be true, got: ' + JSON.stringify(out));
      assert(Array.isArray(out.would_remove) && out.would_remove.some(p => p === wtPath),
        'sc1: would_remove must contain wtPath, got: ' + JSON.stringify(out.would_remove));
      assert(Array.isArray(out.would_delete_branch) && out.would_delete_branch.includes('workflow/issue-200'),
        'sc1: would_delete_branch must contain workflow/issue-200, got: ' + JSON.stringify(out.would_delete_branch));
      assert(fs.existsSync(wtPath), 'sc1: worktree dir must still exist after dry-run');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 2: execute-clean — clean worktree + --execute
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-stale-cleanup-sc2-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeGhShim(binDir);
      const wtPath = path.join(kwRoot, 'wt-cleanup-200');
      fs.mkdirSync(kwRoot, { recursive: true });
      G.git(tmp, ['worktree', 'add', '-b', 'workflow/issue-200', '--', wtPath, 'HEAD'], { encoding: 'utf8' });
      const out = runClaimOnline(['stale-worktree-cleanup', '--execute'], tmp, binDir);
      assert(out.dry_run === false, 'sc2: dry_run must be false, got: ' + JSON.stringify(out));
      assert(Array.isArray(out.removed) && out.removed.some(p => p === wtPath),
        'sc2: removed must contain wtPath, got: ' + JSON.stringify(out.removed));
      assert(Array.isArray(out.deleted_branch) && out.deleted_branch.includes('workflow/issue-200'),
        'sc2: deleted_branch must contain workflow/issue-200, got: ' + JSON.stringify(out.deleted_branch));
      assert(!fs.existsSync(wtPath), 'sc2: worktree dir must be removed after execute');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 3: execute-dirty-no-flag — dirty worktree + --execute (no archive/export/force)
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-stale-cleanup-sc3-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeGhShim(binDir);
      const wtPath = path.join(kwRoot, 'wt-cleanup-200');
      fs.mkdirSync(kwRoot, { recursive: true });
      G.git(tmp, ['worktree', 'add', '-b', 'workflow/issue-200', '--', wtPath, 'HEAD'], { encoding: 'utf8' });
      fs.writeFileSync(path.join(wtPath, 'dirty.txt'), 'x');
      const out = runClaimOnline(['stale-worktree-cleanup', '--execute'], tmp, binDir);
      assert(Array.isArray(out.skipped_dirty) && out.skipped_dirty.some(p => p === wtPath),
        'sc3: skipped_dirty must contain wtPath, got: ' + JSON.stringify(out.skipped_dirty));
      assert(!out.removed || !out.removed.some(p => p === wtPath),
        'sc3: removed must not contain wtPath, got: ' + JSON.stringify(out.removed));
      assert(fs.existsSync(wtPath), 'sc3: worktree dir must still exist when skipped_dirty');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 4: execute-dirty-archive — dirty worktree + --execute --archive
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-stale-cleanup-sc4-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeGhShim(binDir);
      const wtPath = path.join(kwRoot, 'wt-cleanup-200');
      fs.mkdirSync(kwRoot, { recursive: true });
      G.git(tmp, ['worktree', 'add', '-b', 'workflow/issue-200', '--', wtPath, 'HEAD'], { encoding: 'utf8' });
      fs.writeFileSync(path.join(wtPath, 'dirty.txt'), 'x');
      const out = runClaimOnline(['stale-worktree-cleanup', '--execute', '--archive'], tmp, binDir);
      assert(Array.isArray(out.stashed) && out.stashed.some(p => p === wtPath),
        'sc4: stashed must contain wtPath, got: ' + JSON.stringify(out.stashed));
      assert(Array.isArray(out.removed) && out.removed.some(p => p === wtPath),
        'sc4: removed must contain wtPath, got: ' + JSON.stringify(out.removed));
      assert(!fs.existsSync(wtPath), 'sc4: worktree dir must be removed after archive+execute');
      const stashList = G.exec(tmp, ['stash', 'list'], { encoding: 'utf8' });
      assert(stashList.includes('kaola-cleanup-issue-200'),
        'sc4: stash list must contain kaola-cleanup-issue-200, got: ' + stashList);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 5: execute-dirty-export — dirty worktree + --execute --export
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-stale-cleanup-sc5-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeGhShim(binDir);
      const wtPath = path.join(kwRoot, 'wt-cleanup-200');
      fs.mkdirSync(kwRoot, { recursive: true });
      G.git(tmp, ['worktree', 'add', '-b', 'workflow/issue-200', '--', wtPath, 'HEAD'], { encoding: 'utf8' });
      // Modify a tracked file so git diff HEAD is non-empty
      fs.writeFileSync(path.join(wtPath, 'README.md'), 'modified-for-export\n');
      const out = runClaimOnline(['stale-worktree-cleanup', '--execute', '--export'], tmp, binDir);
      assert(Array.isArray(out.exported) && out.exported.length > 0,
        'sc5: exported must have at least one entry, got: ' + JSON.stringify(out.exported));
      const patchPath = out.exported[0];
      assert(path.basename(patchPath).includes('issue-200-'),
        'sc5: exported patch filename must contain issue-200-, got: ' + patchPath);
      assert(fs.existsSync(patchPath), 'sc5: exported patch file must exist on disk');
      assert(fs.statSync(patchPath).size > 0, 'sc5: exported patch file must be non-empty');
      assert(!fs.existsSync(wtPath), 'sc5: worktree dir must be removed after export+execute');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 6: execute-dirty-force — dirty worktree + --execute --force
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-stale-cleanup-sc6-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeGhShim(binDir);
      const wtPath = path.join(kwRoot, 'wt-cleanup-200');
      fs.mkdirSync(kwRoot, { recursive: true });
      G.git(tmp, ['worktree', 'add', '-b', 'workflow/issue-200', '--', wtPath, 'HEAD'], { encoding: 'utf8' });
      fs.writeFileSync(path.join(wtPath, 'dirty.txt'), 'x');
      const out = runClaimOnline(['stale-worktree-cleanup', '--execute', '--force'], tmp, binDir);
      assert(Array.isArray(out.removed) && out.removed.some(p => p === wtPath),
        'sc6: removed must contain wtPath, got: ' + JSON.stringify(out.removed));
      assert(!out.stashed || out.stashed.length === 0,
        'sc6: stashed must be empty with --force, got: ' + JSON.stringify(out.stashed));
      assert(!out.exported || out.exported.length === 0,
        'sc6: exported must be empty with --force, got: ' + JSON.stringify(out.exported));
      assert(!fs.existsSync(wtPath), 'sc6: worktree dir must be removed after force+execute');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 7: keep-branch — clean worktree + --execute --keep-branch
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-stale-cleanup-sc7-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeGhShim(binDir);
      const wtPath = path.join(kwRoot, 'wt-cleanup-200');
      fs.mkdirSync(kwRoot, { recursive: true });
      G.git(tmp, ['worktree', 'add', '-b', 'workflow/issue-200', '--', wtPath, 'HEAD'], { encoding: 'utf8' });
      const out = runClaimOnline(['stale-worktree-cleanup', '--execute', '--keep-branch'], tmp, binDir);
      assert(Array.isArray(out.removed) && out.removed.some(p => p === wtPath),
        'sc7: removed must contain wtPath, got: ' + JSON.stringify(out.removed));
      assert(!out.deleted_branch || out.deleted_branch.length === 0,
        'sc7: deleted_branch must be empty with --keep-branch, got: ' + JSON.stringify(out.deleted_branch));
      assert(!fs.existsSync(wtPath), 'sc7: worktree dir must be removed');
      // Branch must still exist
      G.exec(tmp, ['rev-parse', '--verify', 'refs/heads/workflow/issue-200'], { stdio: 'pipe' });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 8: execute-archive-fail — stash fails → failed_preserve, no removal
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-stale-cleanup-sc8-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    let lockFile = null;
    try {
      initGitRepo(tmp);
      writeGhShim(binDir);
      const wtPath = path.join(kwRoot, 'wt-cleanup-200');
      fs.mkdirSync(kwRoot, { recursive: true });
      G.git(tmp, ['worktree', 'add', '-b', 'workflow/issue-200', '--', wtPath, 'HEAD'], { encoding: 'utf8' });
      fs.writeFileSync(path.join(wtPath, 'dirty.txt'), 'x');
      // Make stashWorktree fail: read the real gitdir from the worktree's .git file
      // and place an index.lock there so git stash push fails
      const gitFileContent = fs.readFileSync(path.join(wtPath, '.git'), 'utf8').trim();
      const gitdirLine = gitFileContent.match(/^gitdir:\s*(.+)$/m);
      assert(gitdirLine, 'sc8: could not parse gitdir from worktree .git file');
      lockFile = path.join(gitdirLine[1].trim(), 'index.lock');
      fs.writeFileSync(lockFile, '');
      const out = runClaimOnline(['stale-worktree-cleanup', '--execute', '--archive'], tmp, binDir);
      assert(Array.isArray(out.failed_preserve) && out.failed_preserve.some(p => p === wtPath),
        'sc8: failed_preserve must contain wtPath, got: ' + JSON.stringify(out));
      assert(!out.removed || !out.removed.some(p => p === wtPath),
        'sc8: removed must NOT contain wtPath when preserve failed, got: ' + JSON.stringify(out.removed));
      assert(fs.existsSync(wtPath), 'sc8: worktree dir must still exist when preserve failed');
    } finally {
      if (lockFile) { try { fs.unlinkSync(lockFile); } catch (_) {} }
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 9: untracked-only export — worktree dirty ONLY from untracked file
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-stale-cleanup-sc9-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeGhShim(binDir);
      const wtPath = path.join(kwRoot, 'wt-cleanup-200');
      fs.mkdirSync(kwRoot, { recursive: true });
      G.git(tmp, ['worktree', 'add', '-b', 'workflow/issue-200', '--', wtPath, 'HEAD'], { encoding: 'utf8' });
      // No tracked changes — only an untracked file. git diff HEAD is empty.
      fs.writeFileSync(path.join(wtPath, 'untracked.txt'), 'hello untracked\n');
      const out = runClaimOnline(['stale-worktree-cleanup', '--execute', '--export'], tmp, binDir);
      assert(Array.isArray(out.exported) && out.exported.length >= 2,
        'sc9: exported must include patch + sidecar dir (length >= 2), got: ' + JSON.stringify(out.exported));
      const sidecars = out.exported.filter(p => p.endsWith('-untracked'));
      assert(sidecars.length === 1, 'sc9: exactly one sidecar dir ending in -untracked, got: ' + JSON.stringify(out.exported));
      assert(fs.existsSync(path.join(sidecars[0], 'untracked.txt')),
        'sc9: untracked.txt must be preserved in sidecar dir');
      assert(!out.failed_preserve || !out.failed_preserve.some(p => p === wtPath),
        'sc9: wtPath must NOT be in failed_preserve, got: ' + JSON.stringify(out.failed_preserve));
      assert(!fs.existsSync(wtPath), 'sc9: worktree dir must be removed after export+execute');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 10: mixed export — tracked modification + untracked file
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-stale-cleanup-sc10-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeGhShim(binDir);
      const wtPath = path.join(kwRoot, 'wt-cleanup-200');
      fs.mkdirSync(kwRoot, { recursive: true });
      G.git(tmp, ['worktree', 'add', '-b', 'workflow/issue-200', '--', wtPath, 'HEAD'], { encoding: 'utf8' });
      fs.writeFileSync(path.join(wtPath, 'README.md'), 'modified tracked content\n'); // tracked change
      fs.writeFileSync(path.join(wtPath, 'new-untracked.txt'), 'new file\n');          // untracked
      const out = runClaimOnline(['stale-worktree-cleanup', '--execute', '--export'], tmp, binDir);
      assert(Array.isArray(out.exported) && out.exported.length >= 2,
        'sc10: exported must include patch + sidecar dir (length >= 2), got: ' + JSON.stringify(out.exported));
      const patches = out.exported.filter(p => p.endsWith('.patch'));
      assert(patches.length === 1, 'sc10: exactly one .patch file, got: ' + JSON.stringify(out.exported));
      assert(fs.statSync(patches[0]).size > 0, 'sc10: patch must be non-empty (tracked change present)');
      const sidecars = out.exported.filter(p => p.endsWith('-untracked'));
      assert(sidecars.length === 1, 'sc10: exactly one sidecar dir ending in -untracked, got: ' + JSON.stringify(out.exported));
      assert(fs.existsSync(path.join(sidecars[0], 'new-untracked.txt')),
        'sc10: new-untracked.txt must be preserved in sidecar dir');
      assert(!fs.existsSync(wtPath), 'sc10: worktree dir must be removed after export+execute');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 11: multi-flag precedence — dirty worktree + --execute --archive --export (archive wins)
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-stale-cleanup-sc11-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeGhShim(binDir);
      const wtPath = path.join(kwRoot, 'wt-cleanup-200');
      fs.mkdirSync(kwRoot, { recursive: true });
      G.git(tmp, ['worktree', 'add', '-b', 'workflow/issue-200', '--', wtPath, 'HEAD'], { encoding: 'utf8' });
      fs.writeFileSync(path.join(wtPath, 'dirty.txt'), 'x');
      const out = runClaimOnline(['stale-worktree-cleanup', '--execute', '--archive', '--export'], tmp, binDir);
      assert(Array.isArray(out.stashed) && out.stashed.some(p => p === wtPath),
        'sc11: archive must win — stashed must contain wtPath, got: ' + JSON.stringify(out.stashed));
      assert(Array.isArray(out.exported) && out.exported.length === 0,
        'sc11: export must not fire when archive present, got: ' + JSON.stringify(out.exported));
      assert(!out.failed_preserve || out.failed_preserve.length === 0,
        'sc11: failed_preserve must be empty, got: ' + JSON.stringify(out.failed_preserve));
      assert(Array.isArray(out.removed) && out.removed.some(p => p === wtPath),
        'sc11: removed must contain wtPath, got: ' + JSON.stringify(out.removed));
      assert(!fs.existsSync(wtPath), 'sc11: worktree dir must be removed after archive+execute');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  console.log('testStaleWorktreeCleanup: PASSED');
}

async function testSinkPrLeavesCleanWorktree() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-pr-clean-'));
  try {
    // Init git repo with user config
    G.git(tmp, ['init'], { stdio: 'pipe' });
    G.git(tmp, ['config', 'user.email', 'test@example.com'], { stdio: 'pipe' });
    G.git(tmp, ['config', 'user.name', 'Test User'], { stdio: 'pipe' });
    // Write workflow state and summary
    const kwDir = path.join(tmp, 'kaola-workflow', 'issue-82');
    fs.mkdirSync(kwDir, { recursive: true });
    fs.writeFileSync(path.join(kwDir, 'workflow-state.md'), [
      '# Kaola-Workflow State',
      '## Project',
      'name: issue-82',
      'status: active',
      '## Sink',
      'branch: workflow/issue-82',
      'issue_number: 82',
      'sink: pr',
    ].join('\n') + '\n');
    fs.writeFileSync(path.join(kwDir, 'finalization-summary.md'), '# Finalization Summary\n');
    // Initial commit so HEAD exists and worktree is clean
    G.git(tmp, ['add', '-A'], { stdio: 'pipe' });
    G.git(tmp, ['commit', '-m', 'initial'], { stdio: 'pipe' });
    // Run sink-pr in OFFLINE mode
    const result = spawnSync(process.execPath, [
      sinkPrScript,
      '--branch', 'workflow/issue-82',
      '--project', 'issue-82',
      '--issue', '82',
    ], {
      cwd: tmp,
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' },
      stdio: 'pipe',
    });
    assert(result.status === 0,
      'sink-pr offline should exit 0, got ' + result.status + '. stderr: ' + result.stderr);
    // Worktree must be clean (no tracked modifications)
    const status = G.git(tmp, ['status', '--porcelain', '--untracked-files=no'], { stdio: 'pipe' });
    assert(status.stdout.toString().trim() === '',
      'worktree must be clean after sink-pr. got: ' + JSON.stringify(status.stdout.toString()));
    // workflow-state.md must contain pr_url
    const stateContents = fs.readFileSync(path.join(kwDir, 'workflow-state.md'), 'utf8');
    assert(stateContents.includes('pr_url:'), 'workflow-state.md must record pr_url');
    // Exactly 2 commits: initial + metadata follow-up
    const revCount = G.git(tmp, ['rev-list', '--count', 'HEAD'], { stdio: 'pipe' });
    assert(revCount.stdout.toString().trim() === '2',
      'expected 2 commits (initial + metadata), got: ' + revCount.stdout.toString().trim());
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testReadPriorityConfig() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-priority-config-'));
  try {
    const { readPriorityConfig } = require('./kaola-workflow-claim');
    // Case 1: missing config → default ['P0','P1']
    const defaults = readPriorityConfig(tmpRoot);
    assert(Array.isArray(defaults) && defaults.length === 2 && defaults[0] === 'P0' && defaults[1] === 'P1',
      'missing config must return ["P0","P1"], got: ' + JSON.stringify(defaults));
    // Case 2: kaola-workflow/config.json with priority_top_tier_labels → custom labels returned
    fs.mkdirSync(path.join(tmpRoot, 'kaola-workflow'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'kaola-workflow', 'config.json'),
      JSON.stringify({ priority_top_tier_labels: ['critical', 'hotfix'] }));
    const custom = readPriorityConfig(tmpRoot);
    assert(Array.isArray(custom) && custom.length === 2 && custom[0] === 'critical' && custom[1] === 'hotfix',
      'custom labels must be ["critical","hotfix"], got: ' + JSON.stringify(custom));
    // Case 3: non-array priority_top_tier_labels → default
    fs.writeFileSync(path.join(tmpRoot, 'kaola-workflow', 'config.json'),
      JSON.stringify({ priority_top_tier_labels: 'not-an-array' }));
    const nonArray = readPriorityConfig(tmpRoot);
    assert(Array.isArray(nonArray) && nonArray[0] === 'P0',
      'non-array value must fall back to ["P0","P1"], got: ' + JSON.stringify(nonArray));
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
  console.log('testReadPriorityConfig: PASSED');
}

function testE2EGitHubMergeFullChain() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-e2e-merge-')));
  const kwRoot = tmp + '.kw';
  try {
    initGitRepo(tmp);
    const binDir = path.join(tmp, 'bin');
    writeGhShimForStartup(binDir);

    // Step 1: startup
    const s850 = runClaimOnline(['startup', '--target-issue', '850'], tmp, binDir);
    assert(s850.claim === 'acquired', 'startup 850 should acquire, got: ' + JSON.stringify(s850));
    const wt850 = s850.worktree_path;
    assert(fs.existsSync(wt850), 'worktree dir must exist after startup');

    // Step 2: feature commit on linked worktree branch
    fs.writeFileSync(path.join(wt850, 'feature-850.txt'), 'feature\n');
    G.git(wt850, ['add', 'feature-850.txt']);
    G.git(wt850, ['commit', '-m', 'feat: issue 850']);

    // Step 3: worktree-finalize (cwd=tmp, reads worktree_path from main active folder)
    const wfResult = runClaimOnlineLastJson(['worktree-finalize', '--project', 'issue-850'], tmp, binDir);
    assert(wfResult.finalized === true, 'worktree-finalize should succeed');
    assert(
      fs.existsSync(path.join(wt850, 'kaola-workflow', 'issue-850', 'workflow-state.md')),
      'workflow-state.md must exist in linked worktree after worktree-finalize'
    );

    // #29: second worktree-finalize on a clean index must not create a commit (no-diff branch).
    // The copied files are identical — git add stages nothing, diff --cached --quiet exits 0,
    // so the commit is skipped. HEAD count must be unchanged.
    const headCountBefore = G.git(wt850, ['rev-list', '--count', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    const wfResult2 = runClaimOnlineLastJson(['worktree-finalize', '--project', 'issue-850'], tmp, binDir);
    assert(wfResult2.finalized === true, 'second worktree-finalize (no-diff path) must return finalized:true');
    const headCountAfter = G.git(wt850, ['rev-list', '--count', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    assert(headCountAfter === headCountBefore,
      'second worktree-finalize must not create a commit (no-diff branch); HEAD count was ' +
      headCountBefore + ', now ' + headCountAfter);

    // Seed the finalize authority in the linked worktree (where finalize runs): a bound,
    // passing consumer-mode validation record, so the finalize validation arm proceeds.
    seedAdaptiveFinalizeFixture(wt850, 'issue-850', ['feature-850.txt']);
    // Step 4: finalize --keep-worktree (cwd=wt850, cleans main worktree copy, preserves linked worktree)
    // finalize writes the archive and the closure state and EXITS; the second finalize and the
    // sink-merge below both re-derive their whole verdict from those bytes.
    // spawn-class: durable-handoff
    const finResult = spawnSync(process.execPath, [
      claimScript, 'finalize', '--project', 'issue-850', '--keep-worktree'
    ], { cwd: wt850, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
    assert(finResult.status === 0, 'finalize --keep-worktree should exit 0\nstderr: ' + finResult.stderr);
    // #832: the archive resolves against MAIN's project root — never into the linked worktree the
    // sink removes at cleanup.
    assert(
      fs.existsSync(path.join(tmp, 'kaola-workflow', 'archive', 'issue-850')),
      'archive must exist in MAIN after finalize --keep-worktree (#832)'
    );
    assert(
      !fs.existsSync(path.join(wt850, 'kaola-workflow', 'archive', 'issue-850')),
      'archive must NOT be written into the linked worktree (#832)'
    );
    assert(
      !fs.existsSync(path.join(tmp, 'kaola-workflow', 'issue-850')),
      'main active folder must be removed after finalize from linked worktree'
    );
    assert(fs.existsSync(wt850), 'linked worktree must survive --keep-worktree finalize');

    // Verify that finalize --keep-worktree removed the live folder from the feature branch
    const liveInTree = G.git(wt850, ['cat-file', '-e', 'HEAD:kaola-workflow/issue-850/workflow-state.md'], { encoding: 'utf8' });
    assert(liveInTree.status !== 0,
      'live workflow-state.md must NOT be in feature branch HEAD after finalize --keep-worktree');
    // #832: ...and the archive is main-resident, so it is NOT on the feature branch. The sink's own
    // archive_commit step lands it on the default branch (asserted after sink-merge below).
    const archiveInTree = G.git(wt850, ['cat-file', '-e', 'HEAD:kaola-workflow/archive/issue-850'], { encoding: 'utf8' });
    assert(archiveInTree.status !== 0,
      '#832: kaola-workflow/archive/issue-850 must NOT be on the feature branch — it resolves against MAIN');

    // #333: the ## Closure append must land INSIDE the `chore: archive` commit (commit-last
    // ordering). After the FIRST finalize --keep-worktree the feature worktree must be clean —
    // a dirty append would break the #217 second-finalize no-new-commit assert below.
    const cleanAfterFinalize = G.git(wt850, ['status', '--porcelain'], { encoding: 'utf8' }).stdout.trim();
    assert(cleanAfterFinalize === '',
      '#333: feature worktree must be clean after finalize --keep-worktree (## Closure append inside commit), got: ' + cleanAfterFinalize);
    const archivedState850 = fs.readFileSync(path.join(tmp, 'kaola-workflow', 'archive', 'issue-850', 'workflow-state.md'), 'utf8');
    assert(/^## Closure$/m.test(archivedState850),
      '#333: archived state must carry a ## Closure block after finalize --keep-worktree');

    // issue #217: a second finalize --keep-worktree on a clean index must be a no-op (not crash)
    const headBefore2nd = G.git(wt850, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    // A SECOND finalize process re-reads its predecessor's on-disk archive and must conclude
    // 'already done'. Idempotence across a process boundary cannot be observed inside one heap,
    // where the first call's in-memory state would answer instead of the disk.
    // spawn-class: durable-handoff
    const finResult2 = spawnSync(process.execPath, [
      claimScript, 'finalize', '--project', 'issue-850', '--keep-worktree'
    ], { cwd: wt850, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
    assert(finResult2.status === 0, 'second finalize --keep-worktree must exit 0 (idempotent)\nstderr: ' + finResult2.stderr);
    const headAfter2nd = G.git(wt850, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    assert(headAfter2nd === headBefore2nd, 'second finalize --keep-worktree must not create a commit, HEAD changed: ' + headBefore2nd + ' -> ' + headAfter2nd);

    // Capture feature HEAD before sink-merge removes the worktree
    const featureHead = G.git(tmp, ['rev-parse', 'workflow/issue-850'], { encoding: 'utf8' }).stdout.trim();

    // Step 5: sink-merge (cwd=wt850, OFFLINE)
    // sink-merge re-derives the entire merge from the archive and workflow-state the exited
    // finalize process left on disk.
    // spawn-class: durable-handoff
    const smResult = spawnSync(process.execPath, [
      sinkMergeScript, '--project', 'issue-850', '--branch', 'workflow/issue-850', '--issue', '850'
    ], { cwd: wt850, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
    assert(smResult.status === 0,
      'sink-merge should exit 0\nstdout: ' + smResult.stdout + '\nstderr: ' + smResult.stderr);

    const mainAfter = G.git(tmp, ['rev-parse', 'main'], { encoding: 'utf8' }).stdout.trim();
    assert(mainAfter === featureHead,
      'main must advance to feature HEAD after sink-merge, got: ' + mainAfter);
    const branchList = G.git(tmp, ['branch', '--list', 'workflow/issue-850'], { encoding: 'utf8' }).stdout.trim();
    assert(branchList === '', 'workflow/issue-850 branch must be deleted after sink-merge');
    assert(!fs.existsSync(wt850), 'linked worktree must be removed by sink-merge');
    const gitStatus = G.git(tmp, ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).stdout.trim();
    assert(gitStatus === '', 'main worktree must be clean after sink-merge, got: ' + gitStatus);
    assert(
      !fs.existsSync(path.join(tmp, 'kaola-workflow', 'issue-850')),
      'live workflow folder must be absent from main after sink-merge'
    );
    assert(
      fs.existsSync(path.join(tmp, 'kaola-workflow', 'archive', 'issue-850')),
      'archive folder must be present in main after sink-merge'
    );

    console.log('testE2EGitHubMergeFullChain: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
  }
}

function testSinkMergeRefusesLiveFolder() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-refuse-live-')));
  try {
    initGitRepo(tmp);
    G.git(tmp, ['checkout', '-b', 'workflow/issue-910']);
    fs.mkdirSync(path.join(tmp, 'kaola-workflow', 'issue-910'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'kaola-workflow', 'issue-910', 'workflow-state.md'), 'status: active\n');
    G.git(tmp, ['add', 'kaola-workflow/']);
    G.git(tmp, ['commit', '-m', 'feat: issue 910']);
    G.git(tmp, ['checkout', 'main']);
    const mainBefore = G.git(tmp, ['rev-parse', 'main'], { encoding: 'utf8' }).stdout.trim();
    const result = spawnSync(process.execPath, [sinkMergeScript, '--project', 'issue-910', '--branch', 'workflow/issue-910'], {
      cwd: tmp,
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' },
      encoding: 'utf8'
    });
    assert(result.status !== 0, 'sink-merge must refuse when live folder present, got status: ' + result.status);
    assert((result.stderr || '').includes('finalize before sink-merge'), 'stderr must include "finalize before sink-merge", got: ' + result.stderr);
    const mainAfter = G.git(tmp, ['rev-parse', 'main'], { encoding: 'utf8' }).stdout.trim();
    assert(mainAfter === mainBefore, 'main SHA must be unchanged after guard fires, before: ' + mainBefore + ' after: ' + mainAfter);
    console.log('testSinkMergeRefusesLiveFolder: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// #562: the --sink merge step force-removes the linked worktree (`git worktree remove --force`); before
// #562 it did so with NO clean precondition (the legacy path had assertWorktreeClean, the --sink path did
// not), so a worktree carrying uncommitted work was silently destroyed. The fix hoists assertWorktreeClean
// into sinkPreflight as a typed worktree_dirty refusal. RED-provable: drop the guard ⇒ the --sink run
// proceeds and removes the dirty worktree. GREEN: a genuinely-CLEAN worktree must NOT trip it.
function testSinkRefusesDirtyWorktree() {
  function setup(tmp) {
    initGitRepo(tmp);
    G.git(tmp, ['branch', 'workflow/issue-9562']);
    const wt = path.join(tmp, '.kw', 'wt-9562');
    G.git(tmp, ['worktree', 'add', wt, 'workflow/issue-9562']);
    return wt;
  }
  function runSink(tmp) {
    return spawnSync(process.execPath, [sinkMergeScript, '--project', 'issue-9562', '--branch', 'workflow/issue-9562', '--issue', '9562', '--sink', '--json'],
      { cwd: tmp, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
  }
  // ---- RED: a DIRTY linked worktree (uncommitted TRACKED change) must refuse worktree_dirty + survive. ----
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-562-dirty-')));
    try {
      const wt = setup(tmp);
      // assertWorktreeClean uses --untracked-files=no, so dirty a TRACKED file (README.md, committed by initGitRepo).
      fs.appendFileSync(path.join(wt, 'README.md'), 'uncommitted change\n');
      const result = runSink(tmp);
      assert(result.status !== 0, '#562 RED: a dirty linked worktree must refuse (fail closed), got status ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
      const parsed = JSON.parse(String(result.stdout || '').trim().split('\n').pop());
      assert(parsed.result === 'refuse' && parsed.reason === 'worktree_dirty',
        '#562 RED: typed refusal worktree_dirty on the --sink path, got ' + JSON.stringify(parsed));
      assert(fs.existsSync(wt), '#562 RED: a worktree_dirty refusal must NOT remove the worktree');
    } finally {
      try { G.git(tmp, ['worktree', 'remove', '--force', path.join(tmp, '.kw', 'wt-9562')], { encoding: 'utf8' }); } catch (_) {}
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
  // ---- GREEN (not over-broad): a CLEAN linked worktree must NOT refuse with worktree_dirty. ----
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-562-clean-')));
    try {
      setup(tmp);
      const result = runSink(tmp);
      let parsed = {};
      try { parsed = JSON.parse(String(result.stdout || '').trim().split('\n').pop()); } catch (_) {}
      assert(parsed.reason !== 'worktree_dirty',
        '#562 GREEN: a clean worktree must NOT trip the worktree_dirty guard, got ' + JSON.stringify(parsed));
    } finally {
      try { G.git(tmp, ['worktree', 'remove', '--force', path.join(tmp, '.kw', 'wt-9562')], { encoding: 'utf8' }); } catch (_) {}
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
  console.log('testSinkRefusesDirtyWorktree: PASSED');
}

// #563: closure-audit isDirty() + claim archiveDirDirty() must fail CLOSED on an unprobeable tree (the
// same #557 anti-pattern, already RED-proven for treeDirty). A behavioral probe-fault test for these two
// would need new production seams/exports — over-engineering for a LOW report-only flip (precedence #3).
// Instead lock the flip against a silent fail-OPEN regression: assert no `catch (_) { return false }` arm
// survives in either helper and that the expected fail-closed `return true` arms are present, across the
// canonical + both forge hand-ports (codex is byte-identical, enforced by validate-script-sync). RED-
// provable: revert any catch arm to `return false` ⇒ this guard fails.
function testProbeHelpersFailClosed() {
  const sites = [
    { file: 'scripts/kaola-workflow-closure-audit.js', fn: 'isDirty', arms: 2 },
    { file: 'scripts/kaola-workflow-claim.js', fn: 'archiveDirDirty', arms: 1 },
    { file: 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js', fn: 'isDirty', arms: 2 },
    { file: 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js', fn: 'archiveDirDirty', arms: 1 },
    { file: 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-closure-audit.js', fn: 'isDirty', arms: 2 },
    { file: 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js', fn: 'archiveDirDirty', arms: 1 },
  ];
  for (const s of sites) {
    const src = fs.readFileSync(path.join(repoRoot, s.file), 'utf8');
    const start = src.indexOf('function ' + s.fn + '(');
    assert(start !== -1, '#563 guard: ' + s.fn + '() not found in ' + s.file);
    const after = src.indexOf('\nfunction ', start + 1);
    const body = src.slice(start, after === -1 ? start + 1500 : after);
    assert(!/catch\s*\(_\)\s*\{\s*return false;/.test(body),
      '#563 guard: ' + s.file + ' ' + s.fn + '() still has a fail-OPEN `catch { return false }` probe arm — must fail CLOSED (return true)');
    const closed = (body.match(/catch\s*\(_\)\s*\{\s*return true;/g) || []).length;
    assert(closed >= s.arms,
      '#563 guard: ' + s.file + ' ' + s.fn + '() must have >=' + s.arms + ' fail-closed `catch { return true }` arm(s), found ' + closed);
  }
  console.log('testProbeHelpersFailClosed: PASSED');
}

// #832: claim.js / sink-merge.js / closure-audit.js are DIVERGENT HAND-PORTS on the gitlab + gitea
// editions — edition-sync does NOT generate them (they are COMMON_SCRIPTS byte-copies for codex
// only), so every one of the four remedies has to be carried across by hand. The behavioral
// coverage lives in the canonical suites; this is the cheap cross-edition pin that catches a hand
// port which silently skipped a remedy on one forge. Same shape as the #563 guard above.
//
// Each token is a contract string this fix OWNS, so a grep is not a proxy for behavior — it IS the
// name the emit/receipt/report must carry, per edition. The `keepWorktree ? linkedRoot : mainRoot`
// entry is the SUBTRACTION half: the per-call-site destination derivation must be gone, replaced by
// one rule anchored to main (RED today — all four copies still carry that expression).
function testArchiveIntegrityPortedToAllEditions832() {
  const claims = [
    'scripts/kaola-workflow-claim.js',
    'plugins/kaola-workflow/scripts/kaola-workflow-claim.js',
    'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js',
    'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js',
  ];
  const sinks = [
    'scripts/kaola-workflow-sink-merge.js',
    'plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js',
    'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js',
    'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js',
  ];
  const audits = [
    'scripts/kaola-workflow-closure-audit.js',
    'plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js',
    'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js',
    'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-closure-audit.js',
  ];
  const requiredIn = (files, token, label) => {
    for (const rel of files) {
      const src = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
      assert(src.includes(token),
        '#832 port guard: ' + rel + ' must carry ' + label + ' (' + JSON.stringify(token) + ') — '
          + 'these are DIVERGENT hand-ports; edition-sync will not write them for you');
    }
  };
  // R2 — the archive-presence precondition on worktree teardown. Under ADR 0013 R3 the precondition
  // is DISCHARGED rather than demanded (the teardown rescues the archive up into main, verifies it
  // landed, then removes), so the port guard tracks the token the rescue emits. The retired
  // `archive_only_in_worktree` refusal must be absent everywhere, in BOTH directions — a hand-port
  // that kept the old wall would otherwise pass a presence-only guard.
  requiredIn(claims, 'archive_rescued', 'the R2 teardown archive-rescue token');
  for (const rel of claims) {
    assert(!fs.readFileSync(path.join(repoRoot, rel), 'utf8').includes('archive_only_in_worktree'),
      '#832 port guard: ' + rel + ' still carries the RETIRED archive_only_in_worktree refusal — the '
        + 'rescue replaces it in every edition, and a surviving hand-port would refuse where the '
        + 'others repair');
  }
  // R3 — the honest archive_commit token, on both writers of that field.
  requiredIn(claims, 'skipped_gitignored', 'the R3 honest archive_commit token');
  requiredIn(sinks, 'skipped_gitignored', 'the R3 honest archive_commit token');
  // R4 — the archive-content drift class.
  requiredIn(audits, 'archive_content_incomplete', 'the R4 archive-content drift class');
  // R1 — the per-call-site destination derivation is SUBTRACTED, not patched around.
  for (const rel of claims) {
    const src = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
    assert(!src.includes('keepWorktree ? linkedRoot : mainRoot'),
      '#832 port guard: ' + rel + ' still derives the archive destination per call site '
        + '(`keepWorktree ? linkedRoot : mainRoot`) — the archive must resolve against MAIN\'s '
        + 'project root regardless of invocation cwd, by ONE rule');
  }
  console.log('testArchiveIntegrityPortedToAllEditions832: PASSED');
}

// #1002: the culprit diagnostics a `chains_stale` finding carries — `stale_paths`, `stale_kind`,
// `stale_paths_truncated` — pinned on BOTH of their writers: the `finalize --check` envelope
// (`evaluateFinalizePreconditions`) and the durable `## Validation` section
// (`persistValidationToSummary`). Same class as the #832 guard above, same reason: claim.js is a
// DIVERGENT HAND-PORT on gitlab + gitea, so nothing generates it and nothing byte-checks it. Two of
// the four copies were otherwise unguarded — disabling the gitlab `checks.stale_kind` assignment
// leaves edition-sync, validate-script-sync and the gitlab suite all green, and no gitlab/gitea test
// mentions these fields at all. The codex copy rides on whole-file byte-identity with canonical;
// gitlab and gitea ride on nothing.
//
// Pinned per COPY and per SITE, never in aggregate — an aggregate assertion cannot witness WHICH
// port dropped the line. Pinned as the GUARDED WRITE rather than a bare token, because these same
// field names appear in the `checks.*` doc comment above evaluateFinalizePreconditions in every
// copy, so a file-wide substring match would be satisfied by prose alone. The `if (...)` half is
// contract too, not formatting: absent stays absent, because an empty list here would read as
// "measured, nothing changed" — a claim nothing made.
//
// The four paths are spelled out for the same reason the #832 guard spells them out: no registry
// enumerates the claim.js ports as data (COMMON_SCRIPTS covers canonical->codex only, which is
// exactly the hole this pin fills).
function testStaleDiagnosticsPortedToAllEditions1002() {
  const claims = [
    'scripts/kaola-workflow-claim.js',
    'plugins/kaola-workflow/scripts/kaola-workflow-claim.js',
    'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js',
    'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js',
  ];
  // Both writers carry the same function name in all four ports — this pair took no port-specific
  // rename — so one site list serves every copy.
  const sites = [
    {
      fn: 'evaluateFinalizePreconditions',
      what: 'the `finalize --check` envelope',
      required: [
        { label: '`checks.stale_paths`, assigned from the finding and only when it carried one',
          re: /if\s*\(\s*diag\.stale_paths\s*\)\s*\{?\s*checks\.stale_paths\s*=\s*diag\.stale_paths\b/ },
        { label: '`checks.stale_kind`, assigned from the finding and only when it carried one',
          re: /if\s*\(\s*diag\.stale_kind\s*\)\s*\{?\s*checks\.stale_kind\s*=\s*diag\.stale_kind\b/ },
        { label: '`checks.stale_paths_truncated`, assigned from the finding and only when it carried one',
          re: /if\s*\(\s*diag\.stale_paths_truncated\s*\)\s*\{?\s*checks\.stale_paths_truncated\s*=\s*diag\.stale_paths_truncated\b/ },
      ],
    },
    {
      fn: 'persistValidationToSummary',
      what: 'the durable `## Validation` section of finalization-summary.md',
      required: [
        { label: 'the `stale_kind: ` line, emitted from the finding\'s own field',
          re: /if\s*\(\s*v\.stale_kind\s*\)\s*\{?\s*lines\.push\(\s*'stale_kind: '\s*\+\s*v\.stale_kind\b/ },
        { label: 'the `stale_paths_truncated: true` line',
          re: /if\s*\(\s*v\.stale_paths_truncated\s*\)\s*\{?\s*lines\.push\(\s*'stale_paths_truncated: true'\s*\)/ },
        { label: 'the non-empty guard on the `stale_paths` list',
          re: /if\s*\(\s*v\.stale_paths\s*&&\s*v\.stale_paths\.length\s*\)/ },
        { label: 'the `stale_paths:` list header',
          re: /lines\.push\(\s*'stale_paths:'\s*\)/ },
        { label: 'the per-path bullet the list header promises',
          re: /for\s*\(\s*const\s+\w+\s+of\s+v\.stale_paths\s*\)\s*lines\.push\(\s*'- '\s*\+\s*\w+\s*\)/ },
      ],
    },
  ];
  for (const rel of claims) {
    const src = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
    for (const site of sites) {
      const start = src.indexOf('function ' + site.fn + '(');
      assert(start !== -1,
        '#1002 port guard: ' + rel + ' has no ' + site.fn + '() — ' + site.what + ' must exist in '
          + 'every edition');
      // Scoped to the function BODY so the `checks.*` doc comment that sits ABOVE the envelope
      // writer cannot stand in for the code — and then STRIPPED OF COMMENTS, because a body-scoped
      // regex is still satisfied by the very line it is looking for sitting commented out. That is
      // not hypothetical: `// if (diag.stale_paths) checks.stale_paths = diag.stale_paths;` was
      // measured passing this guard before the strip was added. Both writers contain zero block
      // comments and zero mid-line `//` today, so dropping whole comment lines and `/* */` spans
      // cannot swallow live code or a `//` inside a string literal.
      const after = src.indexOf('\nfunction ', start + 1);
      const body = src.slice(start, after === -1 ? src.length : after)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n').filter(line => !/^\s*\/\//.test(line)).join('\n');
      for (const r of site.required) {
        assert(r.re.test(body),
          '#1002 port guard: ' + rel + ' ' + site.fn + '() must carry ' + r.label + ' in '
            + site.what + ' — claim.js is a DIVERGENT hand-port on gitlab/gitea, so nothing '
            + 'generates it and nothing byte-checks it; a line skipped here ships silently');
      }
    }
  }
  console.log('testStaleDiagnosticsPortedToAllEditions1002: PASSED');
}

// #1004: `appendSummarySection` must FILL a heading whose body is empty and LEAVE a heading whose
// body carries content exactly as written. The shipped writer declines on ANY existing heading, and
// the finalize Step 6 surface tells the orchestrator to pre-create `## Validation`,
// `## Changed Paths` and `## Mission List` — so on an obedient run all three of the finalize
// transaction's own findings are computed and then dropped. Measured over this repository's own
// archive: 15 empty `## Validation`, 17 empty `## Changed Paths`, 3 empty `## Mission List` in 157
// summaries.
//
// SAME CLASS AS THE #832 AND #1002 PORT GUARDS ABOVE, and here for the same reason: claim.js is a
// DIVERGENT HAND-PORT on gitlab and gitea. `edition-sync.js` excludes it by design,
// `validate-script-sync.js` covers canonical -> codex only, and no gitlab or gitea suite reaches
// this writer at all — so a fix landed in three copies and missed in the fourth ships silently. The
// four paths are spelled out because no registry enumerates the claim.js ports as data.
//
// BEHAVIOURAL, NOT A SOURCE REGEX — and that is a departure from the two guards above, on purpose.
// Those pin ASSIGNMENTS, which have no observable other than their text. This one pins a RULE with
// an observable: what the function leaves on disk. A regex would have to freeze a spelling, and the
// spelling is not the contract — an emptiness test can be written a dozen ways, and even the exact
// line that is wrong today (`if (!replace) return false;`) is CORRECT sitting inside a non-empty
// branch. So each copy's shipped `appendSummarySection` is lifted out of its own file and driven,
// and every assertion is about bytes. Nothing below can be satisfied by naming a variable well.
//
// THE ENVIRONMENT IS ISOLATED; THE SUBJECT NEVER IS. `fs`, `path`, `os`, the sibling
// adaptive-schema and a `writeFile` doing exactly what claim.js's own fallback branch does are
// supplied to the lifted source. Every OTHER function it calls is lifted from THE SAME FILE, so
// what runs is that edition's shipped code and not a re-implementation of it.
//
// THE ABSENT LEG IS THE HARNESS CONTROL, and it is asserted first for a reason:
// `appendSummarySection` wraps its whole body in `catch (_) { return false; }`, so a fault inside it
// is indistinguishable from a decision not to write. The absent leg passes on today's code and on
// any correct fix, so a red there means this pin could not evaluate that copy — not that the
// behaviour regressed. Read it as a message about the harness; read the other legs as verdicts.
function testFillIfEmptySummarySectionPortedToAllEditions1004() {
  const claims = [
    'scripts/kaola-workflow-claim.js',
    'plugins/kaola-workflow/scripts/kaola-workflow-claim.js',
    'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js',
    'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js',
  ];

  // A top-level `function <name>(` ... up to the next top-level `function `, or null.
  const lift = (src, name) => {
    const marker = '\nfunction ' + name + '(';
    const at = src.indexOf(marker);
    if (at === -1) return null;
    const end = src.indexOf('\nfunction ', at + 1);
    return src.slice(at + 1, end === -1 ? src.length : end);
  };
  // `name` plus every top-level function it calls, transitively. `writeFile` is deliberately NOT
  // lifted — it is the one dependency this pin substitutes, and a lifted declaration would shadow
  // the substitute and drag the atomic-replace helper in with it.
  const liftWithDeps = (src, name) => {
    const seen = new Set(['writeFile']);
    const queue = [name];
    const parts = [];
    while (queue.length) {
      const n = queue.shift();
      if (seen.has(n)) continue;
      seen.add(n);
      const body = lift(src, n);
      if (body === null) continue;
      parts.push(body);
      for (const call of body.match(/\b[A-Za-z_$][A-Za-z0-9_$]*\s*\(/g) || []) {
        queue.push(call.replace(/\s*\($/, ''));
      }
    }
    return parts.length ? parts.join('\n') : null;
  };

  // Exactly the grammar the writer commits to: the body of the FIRST `## Heading`, up to the next
  // line-initial `## ` or EOF. A `### ` sub-heading does not terminate a section, in the writer
  // (`'\n## '`) and therefore here.
  const bodyOf = (text, heading) => {
    const lines = String(text || '').split('\n');
    const at = lines.findIndex(l => l.trim() === heading);
    if (at < 0) return null;
    const out = [];
    for (let i = at + 1; i < lines.length; i++) {
      if (/^##\s/.test(lines[i])) break;
      out.push(lines[i]);
    }
    return out.join('\n');
  };
  const occurrences = (text, heading) =>
    String(text || '').split('\n').filter(l => l.trim() === heading).length;
  // Every `## ` heading, in document order — the observable that says whether a fill stayed put.
  const headingSeq = text =>
    String(text || '').split('\n').filter(l => /^##\s/.test(l)).map(l => l.trim());

  for (const rel of claims) {
    const abs = path.join(repoRoot, rel);
    const src = fs.readFileSync(abs, 'utf8');
    assert(src.indexOf('\nfunction appendSummarySection(') !== -1,
      '#1004 port guard: ' + rel + ' has no appendSummarySection() — the writer behind '
        + '`## Validation`, `## Changed Paths` and `## Mission List` must exist in every edition');

    const source = liftWithDeps(src, 'appendSummarySection');
    assert(source !== null, '#1004 port guard: ' + rel + ' — appendSummarySection() could not be '
      + 'lifted out of the file for evaluation');
    let schema = null;
    try { schema = require(path.join(path.dirname(abs), 'kaola-workflow-adaptive-schema.js')); }
    catch (_) { schema = null; }
    // claim.js's own writeFile fallback branch, verbatim in effect: the atomic-replace helper is
    // environment, not subject.
    const writeFileStub = (file, content) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    };
    const append = new Function('fs', 'path', 'os', 'adaptiveSchema', 'writeFile',
      source + '\nreturn appendSummarySection;')(fs, path, os, schema, writeFileStub);
    assert(typeof append === 'function',
      '#1004 port guard: ' + rel + ' — the lifted appendSummarySection is not callable');

    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-fill-if-empty-1004-')));
    try {
      const summaryPath = path.join(dir, 'finalization-summary.md');
      // Plant `before`, call the shipped writer, hand back what it left.
      const drive = (before, heading, lines, replace) => {
        fs.writeFileSync(summaryPath, before);
        append(dir, heading, lines, replace);
        return fs.readFileSync(summaryPath, 'utf8');
      };

      // ---- CONTROL (harness): a heading that is ABSENT is appended. True today and true after any
      // correct fix. A red here says this copy could not be evaluated in isolation — most likely it
      // gained a dependency the lift does not reach, whose ReferenceError the writer's own
      // `catch (_) { return false; }` then swallowed.
      {
        const after = drive('# Finalization — Summary: issue-1004\n\n## Delivered\n\nthe fix\n',
          '## Validation', ['classification: chains_green']);
        assert(occurrences(after, '## Validation') === 1
          && (bodyOf(after, '## Validation') || '').trim() === 'classification: chains_green',
        '#1004 port guard [harness control]: ' + rel + ' — appending an ABSENT heading is unchanged '
          + 'behaviour, so a failure here is this pin failing to evaluate the shipped function, not '
          + 'the function failing. Got:\n' + after);
      }

      // ---- THE FIX, form 1: the VERBATIM Step 6 skeleton — consecutive `## ` lines with nothing
      // between them, so the section body is the empty string.
      {
        const after = drive('# Finalization — Summary: issue-1004\n\n'
          + '## Validation\n## Changed Paths\n## Mission List\n',
        '## Validation', ['classification: chains_green', 'green: true']);
        assert((bodyOf(after, '## Validation') || '').trim() === 'classification: chains_green\ngreen: true',
          '#1004 port guard: ' + rel + ' — a `## Validation` heading planted by Step 6 with NOTHING '
            + 'under it must be FILLED. Declining here is the whole defect: the finding is computed '
            + 'and then dropped, and the archived summary is the last place it could have been read. '
            + 'Got:\n' + after);
        assert(occurrences(after, '## Validation') === 1,
          '#1004 port guard: ' + rel + ' — ...into THAT heading. A second copy appended lower down '
            + 'leaves the planted section bare and the reader looking at it. Got:\n' + after);
        assert(occurrences(after, '## Changed Paths') === 1 && occurrences(after, '## Mission List') === 1,
          '#1004 port guard: ' + rel + ' — ...and the headings that FOLLOW it survive. In this form '
            + 'the section ends at the very next line, so a fill that over-reaches consumes the next '
            + 'two headings whole. Got:\n' + after);
        // THE FILL IS IN PLACE. Reusing the `replace` machinery — cut the section, then let the tail
        // of the function append the block — also "fills" the heading, and relocates it to the end
        // of the file. Filling is not relocating: the order the orchestrator wrote is part of what
        // the record is for. Bound as ORDER so no string-slicing choice can red it.
        assert(JSON.stringify(headingSeq(after))
          === JSON.stringify(['## Validation', '## Changed Paths', '## Mission List']),
        '#1004 port guard: ' + rel + ' — ...and `## Validation` stays FIRST, where it was planted. '
          + 'A fill that cuts the section out and re-appends it at the tail moves it below every '
          + 'heading that followed it. Got: ' + JSON.stringify(headingSeq(after)) + '\n' + after);
      }

      // ---- THE FIX, form 2: the blank-line form real orchestrators write, where the empty body is
      // `\n` rather than ''. Only a rule keyed on `body.trim() === ''` reaches both forms.
      {
        const after = drive('# Finalization — Summary: issue-1004\n\n'
          + '## Validation\n\n## Changed Paths\n\n## Mission List\n\n',
        '## Changed Paths', ['Files this branch changed:', '', '- src/orphan.js']);
        assert((bodyOf(after, '## Changed Paths') || '').trim()
          === 'Files this branch changed:\n\n- src/orphan.js',
        '#1004 port guard: ' + rel + ' — the blank-line form is the shape orchestrators actually '
          + 'write, and its empty body is `\\n`, not `\'\'`. A fill keyed on the body being '
          + 'STRICTLY empty misses every real summary in the archive. Got:\n' + after);
        assert(occurrences(after, '## Changed Paths') === 1,
          '#1004 port guard: ' + rel + ' — ...exactly once. Got:\n' + after);
        // In place here too, and this leg witnesses it from the MIDDLE of the document rather than
        // the front: `## Changed Paths` has a heading on either side of it.
        assert(JSON.stringify(headingSeq(after))
          === JSON.stringify(['## Validation', '## Changed Paths', '## Mission List']),
        '#1004 port guard: ' + rel + ' — ...and it stays BETWEEN its two neighbours. Got: '
          + JSON.stringify(headingSeq(after)) + '\n' + after);
      }

      // ---- THE FIX, form 3: the heading is LAST in the file, so the section runs to EOF and there
      // is no `\n## ` terminator to find. Distinct branch, distinct leg.
      //
      // NO ORDER ASSERTION HERE, deliberately: the target is already the last heading, so a fill
      // that relocated it to the tail would land it in exactly the same place. An assertion that
      // cannot fail on the property it names is not watching it — the two legs above are where
      // relocation is witnessed, and each of them has a heading after the one being filled.
      {
        const after = drive('# Finalization — Summary: issue-1004\n\n## Delivered\n\nthe fix\n\n'
          + '## Mission List\n\n', '## Mission List', ['items: 2']);
        assert((bodyOf(after, '## Mission List') || '').trim() === 'items: 2',
          '#1004 port guard: ' + rel + ' — an empty section that runs to EOF is filled too; there is '
            + 'no next heading to bound it and it is still empty. Got:\n' + after);
        assert((bodyOf(after, '## Delivered') || '').trim() === 'the fix'
          && occurrences(after, '## Delivered') === 1,
        '#1004 port guard: ' + rel + ' — ...without taking what came BEFORE it with it. Got:\n' + after);
      }

      // ---- THE OWNER'S DECISION: a section carrying content is left exactly as written. This is
      // the half that distinguishes the ruling from `replace: true`, which is the other fix and was
      // not the one chosen. A run's own summary prose is the operator's; restating over it destroys
      // a record nobody agreed to lose.
      {
        const prose = 'Chains re-run by hand after the rebase; all four green at 14:02.';
        const before = '# Finalization — Summary: issue-1004\n\n'
          + '## Validation\n\n' + prose + '\n\n## Changed Paths\n\n';
        const after = drive(before, '## Validation', ['classification: chains_red', 'green: false']);
        assert((bodyOf(after, '## Validation') || '').trim() === prose,
          '#1004 port guard: ' + rel + ' — a `## Validation` section that already carries prose is '
            + 'LEFT EXACTLY AS WRITTEN. The ruling on #1004 is fill-if-empty, not `replace: true`: '
            + 'filling what is blank and overwriting what somebody wrote are different powers. '
            + 'Got:\n' + after);
        assert(after.indexOf('classification: chains_red') === -1,
          '#1004 port guard: ' + rel + ' — ...and the writer\'s own lines appear NOWHERE in the '
            + 'file, including under a second copy of the heading appended lower down. Got:\n' + after);
        assert(occurrences(after, '## Validation') === 1,
          '#1004 port guard: ' + rel + ' — ...and the heading still occurs exactly once. Got:\n' + after);
      }

      // ---- THE FOURTH CALLER, unchanged. `## Finalize Findings` passes `replace: true` and MUST
      // still restate: it is an accumulator flushed more than once per run, so a later flush that
      // declined would silently lose every finding after the first. Regression pin — green today,
      // and a fix that reads "fill-if-empty" as "never overwrite" breaks it.
      //
      // ITS POSITION IS DELIBERATELY NOT PINNED. `replace: true` cuts and re-appends at the tail
      // today, which RELOCATES the section — measured, shipped, working behaviour that #1004 has no
      // business moving. The in-place rule above is scoped to the fill-if-empty path alone, and
      // nothing in this leg looks at where the section ended up.
      {
        const before = '# Finalization — Summary: issue-1004\n\n'
          + '## Finalize Findings\n\n### old_fault\n\nthe first flush\n\n## Changed Paths\n\nkept\n';
        const after = drive(before, '## Finalize Findings',
          ['### old_fault', '', 'the first flush', '', '### later_fault', '', 'the second flush'], true);
        const body = bodyOf(after, '## Finalize Findings') || '';
        assert(body.includes('the second flush') && body.includes('the first flush'),
          '#1004 port guard: ' + rel + ' — `replace: true` still RESTATES the whole accumulated set. '
            + 'The findings flush is written once before the commit that carries it and again if a '
            + 'later step finds something; a flush that declined would drop everything after the '
            + 'first. Got:\n' + after);
        assert(occurrences(after, '## Finalize Findings') === 1,
          '#1004 port guard: ' + rel + ' — ...in one section, not two. Got:\n' + after);
        assert((bodyOf(after, '## Changed Paths') || '').trim() === 'kept',
          '#1004 port guard: ' + rel + ' — ...and the replace cut stops at the next `## ` heading. '
            + 'Got:\n' + after);
      }
    } finally {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* best effort */ }
    }
  }
  console.log('testFillIfEmptySummarySectionPortedToAllEditions1004: PASSED');
}

function testSinkMergeBlocksUnpushedCommits() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-merge-block-')));
  const remotePath = initGitRepoWithBareRemote(tmp);
  try {
    G.git(tmp, ['checkout', '-b', 'workflow/issue-911']);
    G.git(tmp, ['push', '-u', 'origin', 'workflow/issue-911']);
    fs.writeFileSync(path.join(tmp, 'unpushed.txt'), 'test');
    G.git(tmp, ['add', 'unpushed.txt']);
    G.git(tmp, ['commit', '-m', 'unpushed commit', '--allow-empty-message', '--no-edit'], { env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@test.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@test.com' } });
    const mainBefore = G.git(tmp, ['rev-parse', 'main'], { encoding: 'utf8' }).stdout.trim();
    const result = spawnSync(process.execPath, [sinkMergeScript, '--project', 'issue-911', '--branch', 'workflow/issue-911'], {
      cwd: tmp,
      encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '0' }
    });
    assert(result.status !== 0, 'sink-merge must refuse when branch has unpushed commits, got status: ' + result.status);
    assert((result.stderr || '').includes('workflow/issue-911'), 'stderr must include branch name, got: ' + result.stderr);
    assert((result.stderr || '').includes('unpushed'), 'stderr must include "unpushed", got: ' + result.stderr);
    const mainAfter = G.git(tmp, ['rev-parse', 'main'], { encoding: 'utf8' }).stdout.trim();
    assert(mainBefore === mainAfter, 'main must not advance when guard blocks, got: ' + mainAfter);
    console.log('testSinkMergeBlocksUnpushedCommits: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(remotePath, { recursive: true, force: true });
  }
}

// #323: a worktree-native run reaches the sink with a LOCAL-ONLY workflow branch (no upstream).
// sink-merge must self-heal (auto `git push -u origin <branch>`) and complete, instead of aborting
// with "no upstream tracking ref" and forcing a manual recovery.
function testSinkMergeAutoPushesWhenNoUpstream() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-merge-autopush-')));
  const remotePath = initGitRepoWithBareRemote(tmp);
  const genv = { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@test.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@test.com' };
  try {
    G.git(tmp, ['checkout', '-b', 'workflow/issue-913']);
    // A real (non-workflow) impl commit so assertBranchHasNonWorkflowChanges passes. The branch
    // is a descendant of origin/main → alreadyUpToDate (no rebase / no recursive npm test).
    fs.writeFileSync(path.join(tmp, 'feature.txt'), 'impl');
    G.git(tmp, ['add', 'feature.txt']);
    G.git(tmp, ['commit', '-m', 'feat: real impl'], { env: genv });
    // DELIBERATELY do NOT push the branch / set upstream (the #323 gap).
    const mainBefore = G.git(tmp, ['rev-parse', 'main'], { encoding: 'utf8' }).stdout.trim();
    const result = spawnSync(process.execPath, [sinkMergeScript, '--project', 'issue-913', '--branch', 'workflow/issue-913'], {
      cwd: tmp, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '0' }
    });
    assert(!String(result.stderr || '').includes('no upstream tracking ref'),
      '#323: sink-merge must NOT abort on a no-upstream branch (auto-push self-heal), got stderr: ' + result.stderr);
    assert(result.status === 0,
      '#323: sink-merge completes without a manual git push -u, got status ' + result.status + '\nstderr: ' + result.stderr);
    const mainAfter = G.git(tmp, ['rev-parse', 'main'], { encoding: 'utf8' }).stdout.trim();
    assert(mainBefore !== mainAfter, '#323: main advanced (FF to the feature commit)');
    // status 0 + main advanced + no "no upstream tracking ref" abort proves the auto push -u
    // self-heal ran: without it, assertBranchPushedToUpstream would have thrown (status 1).
    // (We do not assert origin/workflow/issue-913 still resolves — sink-merge cleans up the
    // merged branch afterward.)
    console.log('testSinkMergeAutoPushesWhenNoUpstream: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(remotePath, { recursive: true, force: true });
  }
}

function testSinkMergeOfflineSkipsPublishGuard() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-merge-offline-')));
  try {
    initGitRepo(tmp);
    G.git(tmp, ['checkout', '-b', 'workflow/issue-912']);
    fs.writeFileSync(path.join(tmp, 'local.txt'), 'test');
    G.git(tmp, ['add', 'local.txt']);
    G.git(tmp, ['commit', '-m', 'local commit'], { env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@test.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@test.com' } });
    const featureHead = G.git(tmp, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    const result = spawnSync(process.execPath, [sinkMergeScript, '--project', 'issue-912', '--branch', 'workflow/issue-912'], {
      cwd: tmp,
      encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
    });
    assert(result.status === 0, 'sink-merge must succeed when OFFLINE=1 even with no upstream, got: ' + result.status + '\nstderr: ' + result.stderr);
    const mainAfter = G.git(tmp, ['rev-parse', 'main'], { encoding: 'utf8' }).stdout.trim();
    assert(mainAfter === featureHead, 'main must advance to feature HEAD after offline sink-merge, got: ' + mainAfter);
    console.log('testSinkMergeOfflineSkipsPublishGuard: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// #350: sink-merge resolves the default branch (origin/HEAD), not a hardcoded 'main'. A repo whose
// default branch is `master` must merge to master — and must NOT fabricate a `main` branch.
function testSinkMergeNonDefaultBranchMaster() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-master-')));
  const remotePath = tmp + '-remote';
  const env = { ...process.env, ...GIT_ISOLATION_ENV, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@t' };
  try {
    G.raw(['init', '-b', 'master', tmp], { env });
    fs.writeFileSync(path.join(tmp, 'README.md'), 'seed');
    G.git(tmp, ['add', '-A'], { env });
    G.git(tmp, ['commit', '-m', 'seed'], { env });
    G.raw(['init', '--bare', '-b', 'master', remotePath], { env });
    G.git(tmp, ['remote', 'add', 'origin', remotePath], { env });
    G.git(tmp, ['push', '-u', 'origin', 'master'], { env });
    G.git(tmp, ['remote', 'set-head', 'origin', 'master'], { env }); // origin/HEAD → master (defaultBranch resolves it offline)
    G.git(tmp, ['checkout', '-b', 'workflow/issue-3502'], { env });
    fs.writeFileSync(path.join(tmp, 'feat.txt'), 'impl');
    G.git(tmp, ['add', 'feat.txt'], { env });
    G.git(tmp, ['commit', '-m', 'feat: impl 3502'], { env });
    const masterBefore = G.git(tmp, ['rev-parse', 'master'], { encoding: 'utf8', env }).stdout.trim();
    const result = spawnSync(process.execPath, [sinkMergeScript, '--project', 'issue-3502', '--branch', 'workflow/issue-3502'], {
      cwd: tmp, encoding: 'utf8', env: { ...env, KAOLA_WORKFLOW_OFFLINE: '1' }
    });
    assert(result.status === 0, '#350: sink-merge merges on a master default branch (offline), got status ' + result.status + '\nstderr: ' + result.stderr);
    const masterAfter = G.git(tmp, ['rev-parse', 'master'], { encoding: 'utf8', env }).stdout.trim();
    assert(masterBefore !== masterAfter, '#350: master (the resolved default branch) advanced via FF — not a hardcoded main');
    const mainBranch = G.git(tmp, ['branch', '--list', 'main'], { encoding: 'utf8', env }).stdout.trim();
    assert(mainBranch === '', '#350: sink-merge did NOT fall back to / create a hardcoded main branch');
    console.log('testSinkMergeNonDefaultBranchMaster: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(remotePath, { recursive: true, force: true });
  }
}

// #350: on a mid-flight origin advance (origin/<defBranch> moves AFTER the initial rebase, the
// only race that makes an FF fail), the FF loop re-rebases the feature branch onto the updated tip
// and the retry succeeds. The pre-#350 loop retried the IDENTICAL ff-only merge without
// re-rebasing → it could never win this race (3 futile retries → exit 2). The race is injected via
// the test-only FF_RACE_PUSH_DIR hook (a fixed `git push` from a prepared clone before the FF).
function testSinkMergeReRebasesOnFfRace() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-rerebase-')));
  const remotePath = initGitRepoWithBareRemote(tmp);
  const clone = tmp + '-clone';
  const env = { ...process.env, ...GIT_ISOLATION_ENV, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@t' };
  try {
    G.git(tmp, ['checkout', '-b', 'workflow/issue-3501'], { env });
    fs.writeFileSync(path.join(tmp, 'feat.txt'), 'impl');
    G.git(tmp, ['add', 'feat.txt'], { env });
    G.git(tmp, ['commit', '-m', 'feat: impl 3501'], { env });
    G.git(tmp, ['push', '-u', 'origin', 'workflow/issue-3501'], { env });
    // Prepare a clone with a committed-but-unpushed advance to main (pushed mid-flight by the hook).
    // (The bare remote's symbolic HEAD is 'master' under GIT_CONFIG_NOSYSTEM, so clone checks out no
    // branch — explicitly materialize local 'main' from origin/main before committing to it.)
    G.raw(['clone', remotePath, clone], { env });
    G.git(clone, ['checkout', '-B', 'main', 'origin/main'], { env });
    fs.writeFileSync(path.join(clone, 'concurrent.txt'), 'x');
    G.git(clone, ['add', '-A'], { env });
    G.git(clone, ['commit', '-m', 'concurrent main advance'], { env });
    const result = spawnSync(process.execPath, [sinkMergeScript, '--project', 'issue-3501', '--branch', 'workflow/issue-3501'], {
      cwd: tmp, encoding: 'utf8',
      env: { ...env, KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_WORKFLOW_SKIP_TESTGATE: '1', KAOLA_WORKFLOW_FF_RACE_PUSH_DIR: clone }
    });
    assert(result.status === 0, '#350: sink-merge recovers from a mid-flight origin advance via re-rebase, got status ' + result.status + '\nstderr: ' + result.stderr);
    G.git(tmp, ['fetch', '-q', 'origin'], { env }); // read the authoritative remote state, not the stale tracking ref
    const log = G.git(tmp, ['log', '--oneline', 'origin/main'], { encoding: 'utf8', env }).stdout;
    assert(/impl 3501/.test(log), '#350: feature commit landed on origin/main after re-rebase, got log: ' + log);
    assert(/concurrent main advance/.test(log), '#350: concurrent main advance preserved (feature rebased onto it)');
    console.log('testSinkMergeReRebasesOnFfRace: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(remotePath, { recursive: true, force: true });
    try { fs.rmSync(clone, { recursive: true, force: true }); } catch (_) {}
  }
}

// #548: the post-rebase runTestGate is consumer-aware. On a CONSUMER (non-npm) product repo —
// package.json declares NO `test:kaola-workflow:*` chain script — the gate runs NO suite (a
// hardcoded `npm test` would error or run an unrelated script on every origin-advance rebase).
// We force the rebase path by advancing origin/main BEFORE the sink (so alreadyUpToDate is false),
// then prove `npm test` is NOT invoked via an `npm` PATH shim that records any invocation, and that
// the sink still completes (exit 0, feature commit on origin/main). SKIP_TESTGATE is deliberately
// NOT set — the consumer discriminator, not the test-only hook, is the load-bearing skip here.
function testSinkMergeConsumerRepoSkipsNpmTestGate() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-consumer-gate-')));
  const remotePath = initGitRepoWithBareRemote(tmp);
  const clone = tmp + '-clone';
  const binDir = tmp + '-bin';
  const npmSentinel = tmp + '-npm-invoked';
  fs.mkdirSync(binDir, { recursive: true });
  // An `npm` wrapper that records any invocation to a sentinel file then exits 0. Placed first on
  // PATH: if the consumer-aware gate is wrong and runs `npm test`, the sentinel appears.
  const npmShim = path.join(binDir, 'npm');
  fs.writeFileSync(npmShim, '#!/bin/sh\nprintf "%s\\n" "$*" >> "' + npmSentinel + '"\nexit 0\n');
  fs.chmodSync(npmShim, 0o755);
  const env = { ...process.env, ...GIT_ISOLATION_ENV, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@t' };
  try {
    // Make the fixture an unambiguous CONSUMER repo: a package.json with a generic `test` script and
    // NO `test:kaola-workflow:*` chain script (the #475 self-host discriminator). Commit + push it so
    // origin/main carries it and the rebased feature branch keeps it.
    fs.writeFileSync(path.join(tmp, 'package.json'),
      JSON.stringify({ name: 'consumer-product', version: '1.0.0', scripts: { test: 'echo unrelated-consumer-suite' } }, null, 2) + '\n');
    G.git(tmp, ['add', 'package.json'], { env });
    G.git(tmp, ['commit', '-m', 'chore: consumer package.json (no chain scripts)'], { env });
    G.git(tmp, ['push', 'origin', 'main'], { env });

    G.git(tmp, ['checkout', '-b', 'workflow/issue-5480'], { env });
    fs.writeFileSync(path.join(tmp, 'feat.txt'), 'impl');
    G.git(tmp, ['add', 'feat.txt'], { env });
    G.git(tmp, ['commit', '-m', 'feat: impl 5480'], { env });
    G.git(tmp, ['push', '-u', 'origin', 'workflow/issue-5480'], { env });

    // Advance origin/main BEFORE the sink so its own `git fetch` sees the drift and alreadyUpToDate
    // is FALSE — forcing doRebase → runTestGate (the path under test). (The bare remote's symbolic
    // HEAD is 'master' under GIT_CONFIG_NOSYSTEM, so the clone checks out no branch — explicitly
    // materialize local 'main' from origin/main before committing to it.)
    G.raw(['clone', remotePath, clone], { env });
    G.git(clone, ['checkout', '-B', 'main', 'origin/main'], { env });
    fs.writeFileSync(path.join(clone, 'concurrent.txt'), 'x');
    G.git(clone, ['add', '-A'], { env });
    G.git(clone, ['commit', '-m', 'concurrent main advance'], { env });
    G.git(clone, ['push', 'origin', 'main'], { env });

    // The assertion is an environment fact, not a behavior: an `npm` shim leads PATH and the
    // absent sentinel proves the process never RESOLVED or exec'd npm through it.
    // spawn-class: environment
    const result = spawnSync(process.execPath, [sinkMergeScript, '--project', 'issue-5480', '--branch', 'workflow/issue-5480'], {
      cwd: tmp, encoding: 'utf8',
      // OFFLINE=0 + NO SKIP_TESTGATE: the gate runs, and the consumer discriminator (not the hook)
      // is what makes it run no suite. The npm shim leads PATH so any `npm test` is recorded.
      env: { ...env, KAOLA_WORKFLOW_OFFLINE: '0', PATH: binDir + path.delimiter + (process.env.PATH || '') }
    });
    assert(result.status === 0, '#548: consumer-repo sink completes (no npm-test gate to fail), got status ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(!fs.existsSync(npmSentinel),
      '#548: a CONSUMER repo (no test:kaola-workflow:* script) must NOT invoke `npm test` in the post-rebase gate; sentinel: ' +
      (fs.existsSync(npmSentinel) ? fs.readFileSync(npmSentinel, 'utf8') : '(absent)'));
    G.git(tmp, ['fetch', '-q', 'origin'], { env }); // authoritative remote state
    const log = G.git(tmp, ['log', '--oneline', 'origin/main'], { encoding: 'utf8', env }).stdout;
    assert(/impl 5480/.test(log), '#548: feature commit landed on origin/main after the rebase, got log: ' + log);
    assert(/concurrent main advance/.test(log), '#548: concurrent main advance preserved (feature rebased onto it), got log: ' + log);
    console.log('testSinkMergeConsumerRepoSkipsNpmTestGate: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(remotePath, { recursive: true, force: true });
    try { fs.rmSync(clone, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(binDir, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(npmSentinel, { force: true }); } catch (_) {}
  }
}

// #414: ONLINE bare-remote sink — the #397.1 branch-delete choreography must fire in order
// (push --delete BEFORE merge-base --is-ancestor BEFORE branch -D) and leave NO local branch and
// NO spurious branch-worktree-resolved closure violation. We trace git's own order with a wrapper
// `git` shim that logs each invocation, then assert the recorded order.
function testSinkMergeBareRemoteDeleteOrder() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-bare-order-')));
  const remotePath = initGitRepoWithBareRemote(tmp);
  const traceLog = path.join(tmp + '-trace.log');
  const binDir = path.join(tmp + '-bin');
  fs.mkdirSync(binDir, { recursive: true });
  // A `git` wrapper that appends its argv to traceLog then execs the real git. Placed first on PATH.
  // A literal PATH lookup for the real git binary, so the tracing shim can exec it.
  // spawn-class: environment
  const realGit = spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim() || '/usr/bin/git';
  const shim = path.join(binDir, 'git');
  fs.writeFileSync(shim,
    '#!/bin/sh\n' +
    'printf "%s\\n" "$*" >> "' + traceLog + '"\n' +
    'exec "' + realGit + '" "$@"\n');
  fs.chmodSync(shim, 0o755);
  const env = { ...process.env, ...GIT_ISOLATION_ENV, PATH: binDir + ':' + process.env.PATH,
    GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@t' };
  try {
    G.git(tmp, ['checkout', '-b', 'workflow/issue-4140'], { env });
    fs.writeFileSync(path.join(tmp, 'feat.txt'), 'impl');
    G.git(tmp, ['add', 'feat.txt'], { env });
    G.git(tmp, ['commit', '-m', 'feat: impl 4140'], { env });
    G.git(tmp, ['push', '-u', 'origin', 'workflow/issue-4140'], { env });
    fs.writeFileSync(traceLog, ''); // reset the trace right before the sink call
    const result = spawnSync(process.execPath, [sinkMergeScript, '--project', 'issue-4140', '--branch', 'workflow/issue-4140'], {
      cwd: tmp, encoding: 'utf8',
      env: { ...env, KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_WORKFLOW_SKIP_TESTGATE: '1' }
    });
    assert(result.status === 0, '#414: bare-remote sink must exit 0, got ' + result.status + '\nstderr: ' + result.stderr);
    const trace = fs.readFileSync(traceLog, 'utf8');
    const iDelete = trace.indexOf('push origin --delete');
    const iAncestor = trace.indexOf('merge-base --is-ancestor');
    const iBranchD = trace.search(/branch -D /);
    assert(iDelete >= 0, '#414: sink must run `push origin --delete` on the online path, trace:\n' + trace);
    assert(iAncestor >= 0, '#414: sink must run `merge-base --is-ancestor` verification, trace:\n' + trace);
    assert(iBranchD >= 0, '#414: sink must force-delete the local branch with `branch -D`, trace:\n' + trace);
    assert(iDelete < iAncestor, '#414: `push --delete` must fire BEFORE `merge-base --is-ancestor`');
    assert(iAncestor < iBranchD, '#414: `merge-base --is-ancestor` must fire BEFORE `branch -D`');
    // No spurious branch-worktree-resolved: the local feature branch is gone and the receipt's
    // branch_removed is 'removed' (the #397.1 fix), so no closure violation is recorded.
    const branchList = G.git(tmp, ['branch', '--list', 'workflow/issue-4140'], { encoding: 'utf8', env }).stdout.trim();
    assert(branchList === '', '#414: local feature branch must be deleted (no leftover → no branch-worktree-resolved alarm), got: ' + branchList);
    assert(!/branch-worktree-resolved/.test(result.stdout + result.stderr),
      '#414: no spurious branch-worktree-resolved violation, got:\n' + result.stdout + result.stderr);
    console.log('testSinkMergeBareRemoteDeleteOrder: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(remotePath, { recursive: true, force: true });
    try { fs.rmSync(binDir, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(traceLog, { force: true }); } catch (_) {}
  }
}

function testE2EGitHubPrFullChain() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-e2e-pr-')));
  const kwRoot = tmp + '.kw';
  try {
    initGitRepo(tmp);
    const binDir = path.join(tmp, 'bin');
    // Custom gh shim: handles startup calls + watch-pr pr view
    fs.mkdirSync(binDir, { recursive: true });
    writeShimFiles(path.join(binDir, 'gh'), [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('repo view')) { process.stdout.write('{\"owner\":{\"login\":\"test\"},\"name\":\"repo\"}\\n'); }",
      "else if (a.includes('issue view')) { process.stdout.write('{\"number\":860,\"title\":\"pr-chain-fixture\",\"body\":\"README.md\",\"labels\":[],\"state\":\"open\"}\\n'); }",
      "else if (a.includes('pr view')) { process.stdout.write('{\"state\":\"MERGED\",\"number\":1}\\n'); }",
      "else if (a.includes('api')) { process.stdout.write('[\\n'); }",
      "else { process.stdout.write('\\n'); }"
    ]);

    // Step 1: startup with sink=pr
    const s860 = runClaimOnline(['startup', '--target-issue', '860'], tmp, binDir, { KAOLA_SINK: 'pr' });
    assert(s860.claim === 'acquired', 'startup 860 should acquire, got: ' + JSON.stringify(s860));
    const wt860 = s860.worktree_path;
    assert(fs.existsSync(wt860), 'worktree dir must exist after startup');

    // Step 2: worktree-finalize (cwd=tmp)
    const wfResult = runClaimOnlineLastJson(['worktree-finalize', '--project', 'issue-860'], tmp, binDir);
    assert(wfResult.finalized === true, 'worktree-finalize 860 should succeed');
    const kwDir860 = path.join(wt860, 'kaola-workflow', 'issue-860');
    assert(fs.existsSync(kwDir860), 'linked worktree issue folder must exist after worktree-finalize');

    // Step 3: plant finalization-summary.md (required by sink-pr appendSummary)
    fs.writeFileSync(path.join(kwDir860, 'finalization-summary.md'), '# Finalization Summary\n');
    G.git(wt860, ['add', '-A']);
    const diff = G.git(wt860, ['diff', '--cached', '--quiet'], { stdio: 'pipe' });
    if (diff.status !== 0) {
      G.git(wt860, ['commit', '-m', 'chore: pre-sink-pr state']);
    }

    // Step 4: sink-pr (cwd=wt860, OFFLINE) — production ordering: sink-pr runs before finalize/archive
    // sink-pr writes pr_url into workflow-state.md and exits; the watch-pr process later in this
    // scenario re-reads that record from disk with no shared heap.
    // spawn-class: durable-handoff
    const spResult = spawnSync(process.execPath, [
      sinkPrScript, '--branch', 'workflow/issue-860', '--project', 'issue-860', '--issue', '860'
    ], { cwd: wt860, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
    assert(spResult.status === 0,
      'sink-pr offline should exit 0\nstdout: ' + spResult.stdout + '\nstderr: ' + spResult.stderr);

    const linkedState = fs.readFileSync(path.join(kwDir860, 'workflow-state.md'), 'utf8');
    assert(linkedState.includes('pr_url:'), 'linked worktree workflow-state.md must contain pr_url after sink-pr');
    const prStatus = G.git(wt860, ['status', '--porcelain', '--untracked-files=no'], { stdio: 'pipe' });
    assert(prStatus.stdout.toString().trim() === '', 'linked worktree must be clean after sink-pr');

    // test-only: mirror linked-worktree state to main; production runs sink-pr before finalize from main worktree
    const mainStateFile = path.join(tmp, 'kaola-workflow', 'issue-860', 'workflow-state.md');
    fs.writeFileSync(mainStateFile, linkedState);

    // Step 5: watch-pr (cwd=tmp, ONLINE via runClaimOnline; gh shim returns MERGED)
    const wpResult = runClaimOnline(['watch-pr'], tmp, binDir);
    assert(wpResult.watched === 1, 'watch-pr should watch 1 PR-sink folder, got: ' + JSON.stringify(wpResult));

    assert(
      fs.existsSync(path.join(tmp, 'kaola-workflow', 'archive', 'issue-860')),
      'archive/issue-860 must exist after watch-pr MERGED'
    );
    assert(
      !fs.existsSync(path.join(tmp, 'kaola-workflow', 'issue-860')),
      'active folder must be gone after watch-pr archives'
    );
    assert(!fs.existsSync(wt860), 'linked worktree must be removed by watch-pr');

    // #333: the watch-pr MERGED lane disposition is PROBE-derived (the gh shim answers
    // `issue view` with state: open), so a merged PR whose issue is still open archives as
    // kept-open — never an unconditional `closed`. The ## Closure block records that.
    const archivedState860 = fs.readFileSync(path.join(tmp, 'kaola-workflow', 'archive', 'issue-860', 'workflow-state.md'), 'utf8');
    assert(/^## Closure$/m.test(archivedState860),
      '#333: watch-pr archived state must carry a ## Closure block');
    assert(archivedState860.includes('issue_disposition: kept-open'),
      '#333: watch-pr MERGED archive of an open issue must record issue_disposition: kept-open (probe-derived), got: ' + archivedState860);

    console.log('testE2EGitHubPrFullChain: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
  }
}

function testParallelIssueIndependence() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-e2e-parallel-')));
  const kwRoot = tmp + '.kw';
  try {
    initGitRepo(tmp);
    const binDir = path.join(tmp, 'bin');
    // Custom shim: each issue has a distinct body with extractable file paths so the
    // classifier can compute non-empty candidatePaths and avoid the noPathInfo
    // conservative-red path that blocks the second startup when both are in phase <= 2.
    fs.mkdirSync(binDir, { recursive: true });
    writeShimFiles(path.join(binDir, 'gh'), [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('repo view')) { process.stdout.write('{\"owner\":{\"login\":\"test\"},\"name\":\"repo\"}\\n'); }",
      "else if (a.includes('issue view 870')) { process.stdout.write('{\"number\":870,\"title\":\"feature-870\",\"body\":\"scripts/feature-870.js\",\"labels\":[],\"state\":\"open\"}\\n'); }",
      "else if (a.includes('issue view 871')) { process.stdout.write('{\"number\":871,\"title\":\"feature-871\",\"body\":\"scripts/feature-871.js\",\"labels\":[],\"state\":\"open\"}\\n'); }",
      "else if (a.includes('api')) { process.stdout.write('[\\n'); }",
      "else { process.stdout.write('\\n'); }"
    ]);

    // Step 1: startup both issues from main worktree
    const s870 = runClaimOnline(['startup', '--target-issue', '870'], tmp, binDir);
    assert(s870.claim === 'acquired', 'startup 870 should acquire, got: ' + JSON.stringify(s870));
    const wt870 = s870.worktree_path;
    assert(fs.existsSync(wt870), 'wt870 must exist after startup');

    const s871 = runClaimOnline(['startup', '--target-issue', '871'], tmp, binDir);
    assert(s871.claim === 'acquired', 'startup 871 should acquire, got: ' + JSON.stringify(s871));
    const wt871 = s871.worktree_path;
    assert(fs.existsSync(wt871), 'wt871 must exist after startup');
    assert(wt870 !== wt871, 'both worktrees must be distinct directories');

    // Step 2: feature commit on 870 branch only
    fs.writeFileSync(path.join(wt870, 'feature-870.txt'), 'feature\n');
    G.git(wt870, ['add', 'feature-870.txt']);
    G.git(wt870, ['commit', '-m', 'feat: issue 870']);

    // Step 3: worktree-finalize 870 (cwd=tmp)
    const wfResult = runClaimOnlineLastJson(['worktree-finalize', '--project', 'issue-870'], tmp, binDir);
    assert(wfResult.finalized === true, 'worktree-finalize 870 should succeed');

    // Seed the finalize authority in wt870 (where finalize runs): a frozen adaptive plan whose
    // tdd-guide node attributes the committed feature file, plus a passing gate.
    seedAdaptiveFinalizeFixture(wt870, 'issue-870', ['feature-870.txt']);
    // Step 4: finalize --keep-worktree 870 (cwd=wt870)
    // finalize writes the archive and exits; the sink-merge process below re-reads it from disk.
    // spawn-class: durable-handoff
    const finResult = spawnSync(process.execPath, [
      claimScript, 'finalize', '--project', 'issue-870', '--keep-worktree'
    ], { cwd: wt870, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
    assert(finResult.status === 0,
      'finalize 870 --keep-worktree should exit 0\nstderr: ' + finResult.stderr);

    // Capture feature HEAD before sink-merge removes the worktree
    const feature870Head = G.git(tmp, ['rev-parse', 'workflow/issue-870'], { encoding: 'utf8' }).stdout.trim();

    // Step 5: sink-merge 870 (cwd=wt870, OFFLINE)
    // sink-merge re-derives the merge from what the exited finalize process wrote to disk.
    // spawn-class: durable-handoff
    const smResult = spawnSync(process.execPath, [
      sinkMergeScript, '--project', 'issue-870', '--branch', 'workflow/issue-870', '--issue', '870'
    ], { cwd: wt870, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
    assert(smResult.status === 0,
      'sink-merge 870 should exit 0\nstdout: ' + smResult.stdout + '\nstderr: ' + smResult.stderr);

    const mainAfter870 = G.git(tmp, ['rev-parse', 'main'], { encoding: 'utf8' }).stdout.trim();
    assert(mainAfter870 === feature870Head,
      'main must advance to 870 feature HEAD after sink-merge, got: ' + mainAfter870);

    const branch870 = G.git(tmp, ['branch', '--list', 'workflow/issue-870'], { encoding: 'utf8' }).stdout.trim();
    assert(branch870 === '', 'workflow/issue-870 must be deleted after sink-merge');
    assert(!fs.existsSync(wt870), 'wt870 must be removed by sink-merge');

    // Step 6: verify 871 is fully untouched
    assert(
      fs.existsSync(path.join(tmp, 'kaola-workflow', 'issue-871')),
      'issue-871 active folder must still exist after 870 completes'
    );
    assert(fs.existsSync(wt871), 'wt871 must still exist');
    const state871 = fs.readFileSync(
      path.join(tmp, 'kaola-workflow', 'issue-871', 'workflow-state.md'), 'utf8'
    );
    assert(state871.includes('status: active'), 'issue-871 state must still be active');
    const branch871 = G.git(tmp, ['branch', '--list', 'workflow/issue-871'], { encoding: 'utf8' }).stdout.trim();
    assert(branch871 !== '', 'workflow/issue-871 branch must still exist');

    console.log('testParallelIssueIndependence: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
  }
}

// ADR 0018 §5: nine test functions stood here (testFinalizeCleansRoadmapEntry,
// testFinalizeFromLinkedWorktreeCleansRoadmapEntry, the whole #916 dual-root-mirror-rebuild
// block -- testFinalizeLinkedWorktreeMainRoadmapUnreadableSourceIsRecorded916,
// testFinalizeLinkedWorktreeMainRoadmapSourceLossIsRecorded916,
// testFinalizeLinkedWorktreeMainRoadmapHealthyControl916,
// testFinalizeLinkedWorktreeKeepWorktreeSkipsMainRoadmapRebuild916,
// testFinalizeFromLinkedWorktreeCleansMainStagedRoadmapSource -- and
// testFinalizeRoadmapCleanupFailureReceipt, testWatchPrRoadmapCleanupWarning). Every one of them,
// plus their dedicated *916 helpers, existed solely to exercise archiveProjectDir's roadmap-source
// unlink, the dual-root MAIN-orphan reconcile, and reconcileRoadmapForClosure's regenerate --
// retired wholesale in slice 2/3 of this retirement. There is no local roadmap source or mirror
// left for any of these to clean, fail to clean, or reconcile across two roots. Deleted with the
// mechanism.


// ---------------------------------------------------------------------------
// Issue #155 Task 4 — fail-closed behavior on gh fetch error (ONLINE mode)
// ---------------------------------------------------------------------------

function writeGhShimFailingIssueView(binDir) {
  fs.mkdirSync(binDir, { recursive: true });
  writeShimFiles(path.join(binDir, 'gh'), [
    "const a = process.argv.slice(2).join(' ');",
    "if (a.includes('repo view')) { process.stdout.write('{\"owner\":{\"login\":\"test\"},\"name\":\"repo\"}\\n'); }",
    "else if (a.includes('issue view')) { process.stderr.write('gh: error: could not connect\\n'); process.exit(1); }",
    "else if (a.includes('api')) { process.stdout.write('[\\n'); }",
    "else { process.stdout.write('\\n'); }"
  ]);
}

function runClaimOnlineNonAcquiring(args, cwd, binDir, extraEnv) {
  // The NON-ACQUIRING-envelope vehicle for the claim CLI: callers assert on the emitted envelope
  // and on what did NOT get written, which is the argv-to-envelope mapping itself.
  // spawn-class: cli-contract
  return spawnSync(process.execPath, [claimScript, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 60000,
    env: {
      ...process.env,
      KAOLA_WORKTREE_NATIVE: '0',
      ...(extraEnv || {}),
      KAOLA_WORKFLOW_OFFLINE: '0',
      ...ghMockEnv(binDir),
      PATH: binDir + path.delimiter + path.dirname(process.execPath) + path.delimiter + (process.env.PATH || '')
    }
  });
}

function testClassifierFailClosedOnRemoteError() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-fail-closed-'));
  try {
    const binDir = path.join(tmp, 'bin');
    writeGhShimFailingIssueView(binDir);

    const result = runClaimOnlineNonAcquiring(['startup', '--target-issue', '155'], tmp, binDir);
    assert(!result.signal, 'startup must not be killed/timed out: ' + result.signal);

    // ANSWERS at exit 0: the forge would not say whether #155 is claimable. Nothing was written,
    // so the caller retries, goes offline, or picks another target on the strength of the reason.
    assert(result.status === 0,
      'startup must ANSWER at exit 0 when gh issue view fails in ONLINE mode, got ' + result.status +
      '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);

    const parsed = JSON.parse(result.stdout.trim().split('\n').filter(l => l.trim().startsWith('{')).pop());
    assert(parsed.verdict === 'target_unavailable',
      'startup must return verdict:target_unavailable when gh fetch fails, got: ' + parsed.verdict +
      '\nfull output: ' + result.stdout);
    assert(parsed.claim === 'none',
      'startup must return claim:none when gh fetch fails, got: ' + parsed.claim);

    // No folder must be created
    assert(!fs.existsSync(path.join(tmp, 'kaola-workflow', 'issue-155')),
      'kaola-workflow/issue-155 must NOT be created when gh fetch fails');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('testClassifierFailClosedOnRemoteError: PASSED');
}

function testClassifierOfflineUnverifiedNoLocalEvidence() {
  // No roadmap entry for issue 156 + OFFLINE=1 + failing gh shim → unverified verdict
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-unverified-no-evidence-'));
  try {
    const binDir = path.join(tmp, 'bin');
    writeGhShimFailingIssueView(binDir);

    const result = runNode(claimScript, ['startup', '--target-issue', '156'], tmp);
    assert(!result.signal, 'unverified startup must not be killed/timed out: ' + result.signal);
    assert(result.status === 0,
      'an unverifiable target is an ANSWER at exit 0, got ' + result.status +
      '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);

    const parsed = JSON.parse(result.stdout.trim().split('\n').filter(l => l.trim().startsWith('{')).pop());
    assert(parsed.verdict === 'target_unverified',
      'verdict must be target_unverified, got: ' + parsed.verdict +
      '\nfull output: ' + result.stdout);
    assert(parsed.claim === 'none',
      'claim must be none, got: ' + parsed.claim);
    assert((parsed.reasoning || '').includes('no local evidence'),
      'reasoning must mention no local evidence, got: ' + parsed.reasoning);

    assert(!fs.existsSync(path.join(tmp, 'kaola-workflow', 'issue-156')),
      'kaola-workflow/issue-156 must NOT be created when target is unverified');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('testClassifierOfflineUnverifiedNoLocalEvidence: PASSED');
}

// testClassifierOfflineVerifiedRoadmapAcquires stood here — "Non-regression: valid offline roadmap
// entry still acquires" was the exact local-evidence acquisition capability ADR 0018 §5 names as an
// accepted loss: OFFLINE and no active folder now always answers target_unverified, honestly,
// regardless of a planted .roadmap/issue-N.md. Deleted with the mechanism it existed to pin.

function testClassifierOfflineVerifiedOwnedFolderRoutes() {
  // Non-regression: already-active folder still routes 'owned' (via line 328 early-return)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-unverified-owned-'));
  try {
    plantActiveFolder(tmp, 'issue-201', 201, null);

    const result = runNode(claimScript, ['startup', '--target-issue', '201'], tmp);
    assert(!result.signal, 'owned-folder startup must not be killed: ' + result.signal);
    assert(result.status === 0,
      'startup must exit 0 when active folder exists for target, got ' + result.status +
      '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);

    const parsed = JSON.parse(result.stdout.trim());
    assert(parsed.claim === 'owned',
      'claim must be owned when active folder exists for target, got: ' + parsed.claim);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('testClassifierOfflineVerifiedOwnedFolderRoutes: PASSED');
}

function testClassifierOfflineUnverifiedWithUnrelatedActiveFolder() {
  // Critical case from issue #169: unrelated active folder must NOT cause user_target_red
  // Consumer-repo isolation: getRoot() resolves to tmp via git rev-parse; existing shim returns name:repo (non-Kaola).
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-unverified-unrelated-'));
  try {
    // Plant active folder for unrelated issue 300
    plantActiveFolder(tmp, 'issue-300', 300, null);

    // Target M=301: no roadmap, no active folder for 301
    const result = runNode(claimScript, ['startup', '--target-issue', '301'], tmp);
    assert(!result.signal, 'unrelated-active startup must not be killed: ' + result.signal);
    assert(result.status === 0,
      'an unverified target beside an unrelated active folder ANSWERS at exit 0, got ' + result.status +
      '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);

    const parsed = JSON.parse(result.stdout.trim().split('\n').filter(l => l.trim().startsWith('{')).pop());
    assert(parsed.verdict === 'target_unverified',
      'verdict must be target_unverified (NOT user_target_red) when unrelated active folder exists, got: ' + parsed.verdict +
      '\nfull output: ' + result.stdout);
    assert(parsed.claim === 'none',
      'claim must be none, got: ' + parsed.claim);
    // Consumer-repo isolation assertion: reasoning references the requested target #301 from cwd's context
    assert((parsed.reasoning || '').includes('#301'),
      'reasoning must reference the requested target #301 (proves cwd-resolved target), got: ' + parsed.reasoning);

    assert(!fs.existsSync(path.join(tmp, 'kaola-workflow', 'issue-301')),
      'kaola-workflow/issue-301 must NOT be created');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('testClassifierOfflineUnverifiedWithUnrelatedActiveFolder: PASSED');
}

function testStartupExplicitTargetRedAnswers() {
  // claimExplicitTarget maps the classifier's red → user_target_red, reported on the envelope.
  // cmdStartup routes through claimExplicitTarget; no active folder must be created. `red` has one
  // producer — a target that is already CLOSED on the forge — so the fixture closes issue 71.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-startup-red-'));
  try {
    seedClassifierVerdictFromBody(71, 'body: a target that turns out to be closed');
    const binDir = path.join(tmp, 'bin');
    writeBundleGhMockScript(binDir, { closedIssues: [71] });
    // ONLINE: `red` is a forge fact, so the offline runner cannot reach this arm at all.
    // runClaimOnline already asserts no-signal + exit 0 (a red target is an ANSWER, not a refusal).
    const parsed = runClaimOnline(['startup', '--target-issue', '71'], tmp, binDir);
    assert(parsed.verdict === 'user_target_red',
      'verdict must be user_target_red, got: ' + JSON.stringify(parsed));
    assert(parsed.claim === 'none',
      'claim must be none for red target, got: ' + parsed.claim);
    assert(!fs.existsSync(path.join(tmp, 'kaola-workflow', 'issue-71')),
      'kaola-workflow/issue-71 folder must NOT be created for red target');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('testStartupExplicitTargetRedAnswers: PASSED');
}

function testClassifierTopLevelIssueFlag() {
  // AC #10: classifier accepts top-level --issue N; --help works
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-cli-toplevel-'));
  try {
    // Top-level --issue (no 'classify' subcommand) + OFFLINE + no roadmap → target_unverified
    // An argv-shape contract: a top-level --issue with no subcommand must parse and exit 0.
    // spawn-class: cli-contract
    const topLevel = spawnSync(process.execPath, [classifierScript, '--issue', '999'], {
      cwd: tmp,
      encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
    });
    assert(topLevel.status === 0,
      'top-level --issue must exit 0, got ' + topLevel.status +
      '\nstdout: ' + topLevel.stdout + '\nstderr: ' + topLevel.stderr);
    const topParsed = JSON.parse(topLevel.stdout.trim());
    assert(topParsed.verdict === 'target_unverified',
      'top-level --issue must return target_unverified for no-evidence offline, got: ' + topParsed.verdict);

    // --help
    // --help must print usage on stdout and exit 0. argv in, envelope out — nothing else.
    // spawn-class: cli-contract
    const help = spawnSync(process.execPath, [classifierScript, '--help'], {
      cwd: tmp,
      encoding: 'utf8'
    });
    assert(help.status === 0,
      '--help must exit 0, got ' + help.status +
      '\nstderr: ' + help.stderr);
    assert(help.stdout.includes('usage:'),
      '--help must print usage to stdout, got: ' + help.stdout);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('testClassifierTopLevelIssueFlag: PASSED');
}

function testClaimProjectOwnedFolderFailingRemote() {
  // Issue #155: claimProject must return { status: 'owned' } when an active local folder
  // already exists, even if the remote gh probe fails (ONLINE mode, gh exits 1).
  // Previously, GitHub ordering ran probeIssueState FIRST, returning target_unavailable
  // instead of the correct owned result.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-owned-failing-remote-'));
  try {
    // Plant an active folder for issue 157 so activeByIssue finds it
    plantActiveFolder(tmp, 'issue-157', 157, null);

    const binDir = path.join(tmp, 'bin');
    writeGhShimFailingIssueView(binDir);

    // Call claimProject directly via node -e driver to bypass the classifier gate
    // in claimExplicitTarget (which also checks ownership, but via subprocess exit 2)
    const driver = [
      'const m = require(' + JSON.stringify(claimScript) + ');',
      'const result = m.claimProject(' + JSON.stringify(tmp) + ', { issue: 157, project: "issue-157" });',
      'process.stdout.write(JSON.stringify(result));'
    ].join('\n');
    // A fresh-environment driver: OFFLINE=0 plus a gh shim first on PATH, resolved by a process
    // whose environment was never the parent's.
    // spawn-class: environment
    const r = spawnSync(process.execPath, ['-e', driver], {
      encoding: 'utf8',
      timeout: 30000,
      env: Object.assign({}, process.env, {
        KAOLA_WORKFLOW_OFFLINE: '0',
        ...ghMockEnv(binDir),
        PATH: binDir + path.delimiter + path.dirname(process.execPath) + path.delimiter + (process.env.PATH || '')
      })
    });
    assert(!r.signal, 'claimProject driver must not be killed: ' + r.signal);
    assert(r.status === 0,
      'claimProject driver must exit 0, got ' + r.status + '\nstderr: ' + r.stderr);
    const result = JSON.parse(r.stdout);
    assert(result.status === 'owned',
      'claimProject must return status:owned when local folder exists, even with failing gh; got: ' +
      JSON.stringify(result));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('testClaimProjectOwnedFolderFailingRemote: PASSED');
}

// ---------------------------------------------------------------------------
// Issue #163 — clearAdvisoryClaim receipt, null-folder fallback, offline skip,
//              watch-pr cleanups[], audit-labels and repair-labels
// ---------------------------------------------------------------------------

function testFinalizeRemovesClaimLabel() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-finalize-removes-label-'));
  const binDir = path.join(tmp, 'bin');
  const marker = path.join(tmp, 'label-removed.marker');
  try {
    initGitRepo(tmp);
    plantActiveFolder(tmp, 'issue-914', 914, null);
    seedClassifierVerdictFromBody(914, '');
    fs.mkdirSync(binDir, { recursive: true });
    writeShimFiles(path.join(binDir, 'gh'), [
      "const fs = require('fs');",
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue edit') && a.includes('--remove-label')) {",
      "  fs.writeFileSync(" + JSON.stringify(marker) + ", 'x');",
      "  process.stdout.write('{}\\n');",
      "} else if (a.includes('issue view')) {",
      "  process.stdout.write('{\"state\":\"open\"}\\n');",
      "} else if (a.includes('issue comment')) {",
      "  process.stdout.write('{}\\n');",
      "} else {",
      "  process.stdout.write('{}\\n');",
      "}"
    ]);
    // Seed LAST (after every code-band write) so the candidate-hash the fixture records
    // matches the code tree finalize re-derives.
    seedAdaptiveFinalizeFixture(tmp, 'issue-914');
    const result = runClaimOnline(['finalize', '--project', 'issue-914'], tmp, binDir);
    assert(
      result.claim_label_removed === 'removed',
      'finalize must return claim_label_removed:removed, got: ' + result.claim_label_removed
    );
    assert(
      result.closure_invariants && result.closure_invariants.ok === true,
      'finalize closure_invariants.ok must be true, got: ' + JSON.stringify(result.closure_invariants)
    );
    assert(
      fs.existsSync(marker),
      'gh shim marker file must exist (--remove-label was called)'
    );
    console.log('testFinalizeRemovesClaimLabel: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testFinalizeNullFolderFallbackReadsArchive() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-finalize-null-folder-'));
  const binDir = path.join(tmp, 'bin');
  const marker = path.join(tmp, 'label-removed.marker');
  try {
    initGitRepo(tmp);
    // Plant active folder (sink: merge default) — issue-915 will appear closed to shim
    plantActiveFolder(tmp, 'issue-915', 915, null);
    seedClassifierVerdictFromBody(915, '');
    fs.mkdirSync(binDir, { recursive: true });
    writeShimFiles(path.join(binDir, 'gh'), [
      "const fs = require('fs');",
      "const a = process.argv.slice(2).join(' ');",
      // issue view returns closed so issueIsClosed=true and activeByProject returns null
      "if (a.includes('issue edit') && a.includes('--remove-label')) {",
      "  fs.writeFileSync(" + JSON.stringify(marker) + ", 'x');",
      "  process.stdout.write('{}\\n');",
      "} else if (a.includes('issue view')) {",
      "  process.stdout.write('{\"state\":\"closed\"}\\n');",
      "} else if (a.includes('issue comment')) {",
      "  process.stdout.write('{}\\n');",
      "} else {",
      "  process.stdout.write('{}\\n');",
      "}"
    ]);
    seedAdaptiveFinalizeFixture(tmp, 'issue-915');
    const result = runClaimOnline(['finalize', '--project', 'issue-915'], tmp, binDir);
    // null-folder fallback reads issue_number from archive workflow-state.md
    assert(
      result.claim_label_removed === 'removed',
      'null-folder fallback must still call clearAdvisoryClaim and get removed, got: ' + result.claim_label_removed
    );
    assert(
      fs.existsSync(path.join(tmp, 'kaola-workflow', 'archive', 'issue-915')),
      'archive folder must exist after finalize with null active folder'
    );
    assert(
      result.closure_invariants && result.closure_invariants.ok === true,
      'closure_invariants.ok must be true after null-folder fallback, got: ' + JSON.stringify(result.closure_invariants)
    );
    console.log('testFinalizeNullFolderFallbackReadsArchive: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testFinalizeOfflineSkipsLabelInvariant() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-finalize-offline-skip-'));
  try {
    initGitRepo(tmp);
    // No roadmap entry — avoids roadmap-source-absent and roadmap-mirror-clean violations
    plantActiveFolder(tmp, 'issue-916', 916, null);
    seedAdaptiveFinalizeFixture(tmp, 'issue-916');
    // Run spawnSync directly — runClaimOnline overrides OFFLINE to '0'
    const result = spawnSync(process.execPath, [claimScript, 'finalize', '--project', 'issue-916'], {
      cwd: tmp,
      encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
    });
    assert(result.status === 0, 'offline finalize should exit 0\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert(
      parsed.claim_label_removed === 'skipped_offline',
      'offline finalize must return claim_label_removed:skipped_offline, got: ' + parsed.claim_label_removed
    );
    assert(
      parsed.closure_invariants && parsed.closure_invariants.ok === true,
      'offline finalize closure_invariants.ok must be true (skipped_offline is allowed), got: ' + JSON.stringify(parsed.closure_invariants)
    );
    console.log('testFinalizeOfflineSkipsLabelInvariant: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// #938 — the offline finalize that reported a clean closure over a claim it never released.
//
// `clearAdvisoryClaim` returns 'skipped_offline' before touching the forge, so an OFFLINE finalize
// makes zero forge calls and both claim artifacts — the `workflow:in-progress` label and the
// `kw:claim` marker comment — survive on every member. The equivalence that lets the run report
// success anyway is DELIBERATE and contracted: `skipped_offline` is treated as `removed` by the
// in-progress-label-removed invariant, which is why the two legs above are green and must stay so.
// `closure_invariants.ok` is NOT the thing to change here, and this leg asserts it did not change.
//
// What was missing is the REPORT. The run's durable record was byte-identical to an online run's,
// so nothing anywhere said a claim release had been skipped, and the next reader of those issues
// had no way to learn it from the workflow. The finding goes through the channel that already
// exists for exactly this — a typed name on `finalize_transaction.findings` and a `### <type>`
// section in the archived `finalization-summary.md`.
//
// CONDITIONAL by requirement: the run holds no local record of whether the claim was ever posted
// online, so the finding may say the release was skipped and name the issues it would have touched,
// but may not assert the artifacts are on them. That is a property of the WORDING and is not pinned
// here — there is no text yet to bind a claim-must-not-be-made regex to.
const CLAIM_RELEASE_SKIPPED_FINDING = 'claim_release_skipped_offline';

function testFinalizeOfflineReportsSkippedClaimRelease() {
  // The `### <type>` body of the durable `## Finalize Findings` write.
  const findingSection = (summaryPath, type) => {
    if (!fs.existsSync(summaryPath)) return null;
    const text = fs.readFileSync(summaryPath, 'utf8');
    const start = text.indexOf('\n### ' + type + '\n');
    if (start < 0) return null;
    const rest = text.slice(start + 1);
    const next = rest.indexOf('\n### ');
    return next < 0 ? rest : rest.slice(0, next);
  };
  // A bundle, so "names the affected issues" is per MEMBER rather than a single number that could
  // have come from anywhere. plantActiveFolder writes the scalar issue only.
  const asBundle = (root, project, members) => {
    const stateFile = path.join(root, 'kaola-workflow', project, 'workflow-state.md');
    fs.writeFileSync(stateFile, fs.readFileSync(stateFile, 'utf8').trimEnd()
      + '\nissue_numbers: ' + members.join(',') + '\nbundle_id: ' + project + '\n');
  };

  // ---- OFFLINE: the release is skipped, and the run must say so ------------------------------
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-finalize-offline-claim-'));
    const project = 'issue-9380';
    const members = [9380, 9390];
    try {
      initGitRepo(tmp);
      // No roadmap entry — avoids roadmap-source-absent and roadmap-mirror-clean violations.
      plantActiveFolder(tmp, project, members[0], null);
      asBundle(tmp, project, members);
      seedAdaptiveFinalizeFixture(tmp, project);
      // Driven directly rather than through runClaimOnline, which forces OFFLINE=0.
      // spawn-class: cli-contract
      const result = spawnSync(process.execPath, [claimScript, 'finalize', '--project', project], {
        cwd: tmp,
        encoding: 'utf8',
        env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
      });
      assert(result.status === 0, '#938: offline finalize should exit 0\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
      const parsed = JSON.parse(result.stdout);

      // PREMISE — this really is the offline lane, and the contracted equivalence is untouched. Both
      // clauses guard against an over-reaching implementation: making the skip VIOLATE the invariant
      // is not the change, and it would red testFinalizeOfflineSkipsLabelInvariant by name.
      assert(parsed.claim_label_removed === 'skipped_offline',
        '#938 premise: offline finalize must still record claim_label_removed:skipped_offline, got: ' + parsed.claim_label_removed);
      assert(parsed.closure_invariants && parsed.closure_invariants.ok === true,
        '#938: closure_invariants.ok must STAY true — skipped_offline is an allowed value for the in-progress-label-removed invariant and this finding does not change that; got: '
        + JSON.stringify(parsed.closure_invariants));

      const findings = (parsed.finalize_transaction && parsed.finalize_transaction.findings) || [];
      assert(findings.includes(CLAIM_RELEASE_SKIPPED_FINDING),
        '#938: an offline finalize releases NO claim — it makes zero forge calls, so the workflow:in-progress label and the kw:claim marker are left exactly as the run found them on every member — and it reported that nowhere. Raise the typed finding "'
        + CLAIM_RELEASE_SKIPPED_FINDING + '" on finalize_transaction.findings; got: ' + JSON.stringify(findings));

      const summaryPath = path.join(tmp, 'kaola-workflow', 'archive', project, 'finalization-summary.md');
      const section = findingSection(summaryPath, CLAIM_RELEASE_SKIPPED_FINDING);
      assert(section !== null,
        '#938: the finding must also be DURABLE — the envelope is gone the moment the process exits, and the archived run record is the only thing a later reader has. Expected a "### '
        + CLAIM_RELEASE_SKIPPED_FINDING + '" section in ' + summaryPath + ', got:\n'
        + (fs.existsSync(summaryPath) ? fs.readFileSync(summaryPath, 'utf8') : '(no finalization-summary.md at all)'));
      for (const n of members) {
        assert(section !== null && new RegExp('(^|\\D)' + n + '(\\D|$)').test(section),
          '#938: the finding must name the issues whose claim release was skipped, per bundle member — #' + n
          + ' is not in the "### ' + CLAIM_RELEASE_SKIPPED_FINDING + '" section. A reader who is not told WHICH issues cannot act on it. Section:\n' + section);
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  // ---- ONLINE control: the release happened, so there is nothing to report --------------------
  // Without this the finding could be unconditional, which says nothing about any particular run.
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-finalize-online-claim-'));
    const binDir = path.join(tmp, 'bin');
    const logFile = path.join(tmp, 'gh-calls.log');
    const project = 'issue-9381';
    const members = [9381, 9391];
    try {
      initGitRepo(tmp);
      plantActiveFolder(tmp, project, members[0], null);
      asBundle(tmp, project, members);
      writeBundleGhMockScript(binDir, { logFile, closedIssues: members });
      seedAdaptiveFinalizeFixture(tmp, project);
      const parsed = runClaimOnline(['finalize', '--project', project], tmp, binDir);

      // PREMISE — the release really did happen on this run, or "no finding" is true for the wrong
      // reason and the control is measuring an offline run wearing an online flag.
      assert(parsed.claim_label_removed === 'removed',
        '#938 control premise: the online finalize must actually release the claim, got claim_label_removed=' + JSON.stringify(parsed.claim_label_removed));

      const findings = (parsed.finalize_transaction && parsed.finalize_transaction.findings) || [];
      assert(!findings.includes(CLAIM_RELEASE_SKIPPED_FINDING),
        '#938: an ONLINE finalize released the claim, so it must NOT raise "' + CLAIM_RELEASE_SKIPPED_FINDING
        + '" — a finding every run carries tells a reader nothing about the run in front of them; findings: ' + JSON.stringify(findings));
      const summaryPath = path.join(tmp, 'kaola-workflow', 'archive', project, 'finalization-summary.md');
      assert(findingSection(summaryPath, CLAIM_RELEASE_SKIPPED_FINDING) === null,
        '#938: the online run\'s archived record must carry no "### ' + CLAIM_RELEASE_SKIPPED_FINDING + '" section; '
        + summaryPath + ':\n' + (fs.existsSync(summaryPath) ? fs.readFileSync(summaryPath, 'utf8') : '(absent)'));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  console.log('testFinalizeOfflineReportsSkippedClaimRelease: PASSED');
}

// #970 — the run record that disagrees with itself.
//
// An item whose outcome is filled in while its `status` still reads something other than `done`
// is a record contradicting itself, and finalize said nothing about it: the archived run came out
// byte-identical to a coherent one, so the only reader who could catch it was a human reading the
// file line by line. It is not a one-off — 11 of the 36 mission lists in this repo's archive carry
// at least one such item, 34 items in all, counting a decorated key (`result (test leg):`) as the
// outcome it is and an empty one as no outcome at all.
//
// WHAT THIS MAY NEVER BECOME. The mission list is deliberately not attested, not frozen and not
// machine-verified, and the refusal count in the run design is zero. Every leg below therefore
// asserts the finalize is UNCHANGED apart from the report — exit 0, `status: closed`, and the
// archived record byte-for-byte the one that was planted. Nor does anything here judge whether a
// record is SUFFICIENT: an item carrying nothing but its mission is silent, not deficient, and the
// control below contains one. An EMPTY field is the same absence — an orchestrator that writes the
// four field names ahead of the work leaves `result:` standing bare, and two archived runs end on
// exactly that item. Reporting one would say an outcome landed where nothing did, which is the
// wrongness this report exists to catch, arriving through the report itself.
//
// TWO CONDITIONS, NOT ONE. "Carries an outcome while not done" is not "is in-flight". An item
// genuinely in flight with nothing to show is a different and louder problem, and over the archive
// the two sets are near-orthogonal. Every fixture below contains one of those, and this measure
// must stay silent about it: a count that mixes the two says nothing about either.
//
// CHANNEL-NEUTRAL BY CONSTRUCTION. finalize has two report channels — a measurement key beside
// `validation`/`changed_paths` with a `## Heading` in the summary, and a typed name on
// `finalize_transaction.findings` with a `### <type>` section — and this scenario pins neither. It
// locates the report by the one thing both channels share: something that NAMES the record it
// read. The weight is carried by the content assertions, which are exact.
const MISSION_REPORT_NAME = /mission/i;

// A record authored as a line array, with the item line numbers DERIVED from it. Spelling those
// numbers out by hand would make them wrong the moment anyone edits a line of prose above them,
// and the numbers ARE the assertion here.
function missionRecordFixture(lines) {
  const itemLines = [];
  lines.forEach((line, i) => { if (/^(?:- )?item:/.test(line)) itemLines.push(i + 1); });
  return { text: lines.join('\n') + '\n', itemLines };
}

function testFinalizeReportsMissionListOutcomeWithoutDone() {
  // ---- the two locators, one per channel, both keyed on the NAME and never on the shape -------

  // Everything the envelope offers AS this report: a key naming the record, at any depth, or a
  // typed finding name that does. Deliberately NOT a substring search over the whole envelope —
  // `closure_receipt` already carries the archived `mission-list.md` PATH, so a search like that
  // would "find" the report in every run ever finalized.
  const envelopeReports = (node, prefix, out) => {
    if (!node || typeof node !== 'object') return out;
    if (Array.isArray(node)) {
      // A typed-finding list: there, the names themselves are the report. Every other array on
      // this envelope is data.
      if (/findings$/.test(prefix)) {
        for (const el of node) {
          if (typeof el === 'string' && MISSION_REPORT_NAME.test(el)) out.push(prefix + ' = ' + el);
        }
      }
      return out;
    }
    for (const [k, v] of Object.entries(node)) {
      const where = prefix ? prefix + '.' + k : k;
      if (MISSION_REPORT_NAME.test(k)) out.push(where + ' = ' + JSON.stringify(v));
      else envelopeReports(v, where, out);
    }
    return out;
  };

  // Any `## ` or `### ` section of the archived finalization-summary.md whose heading names the
  // record, sliced to the next heading of either depth.
  const summaryReports = (summaryPath) => {
    if (!fs.existsSync(summaryPath)) return [];
    const out = [];
    let cur = null;
    for (const line of read(summaryPath).split('\n')) {
      if (/^#{2,3} /.test(line)) {
        if (cur) out.push(cur.join('\n'));
        cur = MISSION_REPORT_NAME.test(line) ? [line] : null;
      } else if (cur) {
        cur.push(line);
      }
    }
    if (cur) out.push(cur.join('\n'));
    return out;
  };

  // A WHOLE number: `110` does not contain `11`, and `issue-9700` does not contain `70`.
  const mentions = (text, n) => new RegExp('(^|[^0-9])' + n + '([^0-9]|$)').test(text);

  // ---- one leg: plant a record, finalize, hand the two channels to the caller ------------------
  const legWithRecord = (project, issue, fixture, body) => {
    // The absence assertions below look for a bare number, and a correct report legitimately
    // prints two small ones of its own: how many items it flagged, and how many it read. Keeping
    // every item well clear of those is what makes "this line number is NOT named" mean something.
    assert(Math.min.apply(null, fixture.itemLines) > 10,
      '#970 fixture invariant: every item must start below line 10 in ' + project
      + ' so that no item line number can collide with a count the report itself states; got: '
      + JSON.stringify(fixture.itemLines));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-mission-record-'));
    try {
      initGitRepo(tmp);
      // No roadmap entry, as in the other finalize-report scenarios: nothing for the
      // roadmap-source or mirror-clean rungs to say about this run.
      plantActiveFolder(tmp, project, issue, null);
      const recordPath = path.join(tmp, 'kaola-workflow', project, 'mission-list.md');
      fs.writeFileSync(recordPath, fixture.text);
      // Seeded AFTER the record, so the bound candidate hash is taken over the tree the finalize
      // actually measures.
      seedAdaptiveFinalizeFixture(tmp, project);
      const run = runNode(claimScript, ['finalize', '--project', project], tmp);

      // PREMISE 1 — nothing about this report may reach the outcome of the finalize. The run
      // record is not attested and not machine-verified; a contradiction inside it is something
      // the orchestrator is TOLD, never something it is stopped for.
      assert(run.status === 0,
        '#970: a self-contradicting run record must not change the exit code — the mission list is '
        + 'not attested, not frozen and not machine-verified, and nothing in the run design refuses. '
        + 'Expected exit 0 for ' + project + ', got ' + run.status + '\nstdout: ' + run.stdout
        + '\nstderr: ' + run.stderr);
      const parsed = JSON.parse(run.stdout);
      assert(parsed.status === 'closed',
        '#970: the closure verdict must be unchanged by the presence of the condition; got status='
        + JSON.stringify(parsed.status));

      const archiveDir = path.join(tmp, 'kaola-workflow', 'archive', project);
      const summaryPath = path.join(archiveDir, 'finalization-summary.md');

      // PREMISE 2 — the durable channel is alive on this lane. Without this an absent report below
      // could mean the summary was never written at all, and the negative control would be green
      // for a reason that has nothing to do with the record it was given.
      assert(fs.existsSync(summaryPath) && /^## Validation$/m.test(read(summaryPath)),
        '#970 premise: the archived finalization-summary.md must exist and already carry its other '
        + 'durable measurement (## Validation), or nothing can be concluded from a report being '
        + 'absent from it. ' + summaryPath + ':\n'
        + (fs.existsSync(summaryPath) ? read(summaryPath) : '(absent)'));

      // PREMISE 3 — reading the record is all this does. A measurement that repairs, normalizes or
      // re-serializes the run record has stopped being a measurement.
      const archivedRecord = path.join(archiveDir, 'mission-list.md');
      assert(fs.existsSync(archivedRecord) && read(archivedRecord) === fixture.text,
        '#970: the archived mission-list.md must be byte-identical to the one the run wrote — this '
        + 'report READS the record and may never rewrite it. ' + archivedRecord + ':\n'
        + (fs.existsSync(archivedRecord) ? read(archivedRecord) : '(absent)'));

      body({
        envelope: envelopeReports(parsed, '', []).join('\n'),
        sections: summaryReports(summaryPath).join('\n'),
        summaryPath: summaryPath,
        parsed: parsed
      });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  };

  // The positive legs assert an EXACT set: every offending item named, every other item not. A
  // report that flags the whole file is as useless as one that flags nothing.
  const assertReports = (project, fixture, offenderIdx, found) => {
    const flagged = offenderIdx.map(i => fixture.itemLines[i]);
    const quiet = fixture.itemLines.filter(n => !flagged.includes(n));

    assert(found.envelope !== '',
      '#970 [' + project + ']: nothing on the finalize envelope reports that this run record '
      + 'contradicts itself. ' + flagged.length + ' of its ' + fixture.itemLines.length
      + ' items carry an outcome while their status is not `done` (item lines '
      + flagged.join(', ') + '). The report is located by NAME, not by shape: an envelope key that '
      + 'names the record it read, or a typed finding that does — whichever channel is used, '
      + 'something on the envelope has to say `mission`.');
    for (const n of flagged) {
      assert(mentions(found.envelope, n),
        '#970 [' + project + ']: the item starting at line ' + n + ' carries an outcome while its '
        + 'status is not `done`, and the envelope report does not name it. A count with no line '
        + 'numbers cannot be acted on — the reader has to find the item. Envelope report:\n'
        + found.envelope);
    }
    for (const n of quiet) {
      assert(!mentions(found.envelope, n),
        '#970 [' + project + ']: the item starting at line ' + n + ' does NOT carry an outcome '
        + 'while unfinished, and the envelope report names it anyway. Expected exactly the items '
        + 'at ' + flagged.join(', ') + '. Envelope report:\n' + found.envelope);
    }

    assert(found.sections !== '',
      '#970 [' + project + ']: the report must also be DURABLE. The envelope is gone the moment '
      + 'the process exits, and the archived run folder is all a later reader has. Expected a '
      + 'section naming the record in ' + found.summaryPath + ':\n' + read(found.summaryPath));
    for (const n of flagged) {
      assert(mentions(found.sections, n),
        '#970 [' + project + ']: the durable section does not name the item at line ' + n
        + '. Section(s):\n' + found.sections);
    }
    for (const n of quiet) {
      assert(!mentions(found.sections, n),
        '#970 [' + project + ']: the durable section names the item at line ' + n + ', which does '
        + 'not carry an outcome while unfinished. Expected exactly ' + flagged.join(', ')
        + '. Section(s):\n' + found.sections);
    }
    assert(mentions(found.sections, flagged.length),
      '#970 [' + project + ']: the durable section must state HOW MANY items are in this state ('
      + flagged.length + '), not only list them. Section(s):\n' + found.sections);
  };

  // ---- POSITIVE: the bullet form, with every kind of variance the archive actually holds -------
  //
  // Fields at two spaces under a `- item:` bullet and wrapped prose at four: 425 bulleted item
  // lines and 1194 two-space field lines across the archive, and NOT ONE field name at three
  // spaces or deeper, so indent is a real boundary here. What the archive does hold is prose that
  // reads like a field — `Note for whoever implements:`, `MY DECISION:` — and, inside a result,
  // sentences quoting the record's own vocabulary. Two of those are planted where a parser
  // matching `status:`/`result:` anywhere in a line, rather than at the front of one, flips a
  // verdict: item 2's result says the repaired archive "reads status: done", and item 3 — which
  // has NO result — has "the result:" inside its dispatched prose.
  const bulletRecord = missionRecordFixture([
    '# #9700 — the run whose record disagreed with itself',
    '',
    'Branch `workflow/issue-9700`. The goal is a record a successor can read without having to',
    'guess which half of it is current: what is known, what went out, and what came back.',
    '',
    'Items are in the order they were reached, not the order they were dispatched. Nothing here',
    'is machine-verified and nothing here refuses — this file is bookkeeping for whoever picks',
    'the run up next, and the only thing it owes that reader is honesty about position.',
    '',
    'Two conventions this run followed, written down because the archive is inconsistent about',
    'both: fields sit at two spaces under their bullet and wrapped prose at four, and where a',
    'status was corrected in place the correction was written UNDER the stale line rather than',
    'over it — which is what every other run in the archive did too.',
    '',
    '---',
    '',
    '## Items',
    '',
    '- item: Read the frontier and decide the width — one pass over the open list, then decide',
    '    then and there whether to dispatch or do the work inline, and at what width.',
    '  status: done',
    '  dispatched: self, inline; the deciding was the work, so nothing went out.',
    '  result: Six items, dispatched two wide. The reasoning is in this file and nowhere else.',
    '',
    '- item: Sweep the four editions for the retired constant and report what still carries it,',
    '    naming each copy by path rather than by count.',
    '  status: in-flight',
    '  dispatched: `investigator` subagent in the worktree; findings to land in',
    '    `kaola-workflow/issue-9700/sweep.md`.',
    '  result: `sweep.md`. Three copies still carry it; the fourth was clean already.',
    '    Note for whoever implements: the copy under `plugins/` is the one that ships, so a sweep',
    '    reading only `scripts/` reports a repo cleaner than the installed one.',
    '    MY DECISION: fix all four together — they are byte-identical by contract, and a partial',
    '    edit is a drift some later guard has to catch.',
    '    One thing the next reader should know: the repaired archive now reads status: done on',
    '    every item that landed, which is exactly what made this contradiction visible.',
    '',
    '- item: Decide with the user whether the retired constant is deleted or wired up — deleting',
    '    working capability is escalation-worthy and not a call to take alone.',
    '  status: in-flight',
    '  dispatched: self, in conversation, with the sweep as the evidence; the result: is to land',
    '    in this item once the user rules, and nothing goes out until it does.',
    '',
    '- item: Port the fix to the three remaining copies and prove they are byte-identical after.',
    '  status: in-flight',
    '  status: done',
    '  dispatched: `implementer` subagent in the worktree; notes to',
    '    `kaola-workflow/issue-9700/impl.md`.',
    '  result: `impl.md`. All four copies hash identically after, produced by `cp`, so the',
    '    identity is by construction rather than by assertion.',
    '',
    '- item: Update the changelog and the two docs the change reaches.',
    '  status: todo',
    '  dispatched: self, inline.',
    '  result: One entry under `[Unreleased]`, plus the API table row and the architecture note.',
    '',
    '- item: Run the suite at full scope and quote the count rather than asserting it passed.',
    '  status: done',
    '  dispatched: self, inline.',
    '  result: Full scope, exit 0; the shard line is quoted in the finalization summary.',
    ''
  ]);
  // Item 2 (in-flight, result) and item 5 (todo, result) — and only those. Item 3 is in-flight
  // with nothing to show, item 4 was corrected in place to `done` under its stale line, and items
  // 1 and 6 are plainly finished. `todo` is not a hypothetical: two items in the archive sit in
  // exactly that state, which is why the condition is "not done" and not "in-flight".
  legWithRecord('issue-9700', 9700, bulletRecord, (found) =>
    assertReports('issue-9700', bulletRecord, [1, 4], found));

  // ---- POSITIVE: the same condition in the form three archived runs use ------------------------
  //
  // No bullet, fields at column zero, and wrapped prose at column zero too — so here the indent
  // separates nothing and the only thing telling a field from a continuation is the name at the
  // front of the line. This is where `MY DECISION:` and `Note for whoever implements:` sit at the
  // SAME offset as a real field, exactly as they do in the archive.
  const plainRecord = missionRecordFixture([
    '# #9701 — the same contradiction, in the record form without bullets',
    '',
    'Branch `workflow/issue-9701`. This run wrote its fields at column zero, which is what three',
    'of the archived runs did. Wrapped prose sits at column zero as well, so a continuation line',
    'is told from a field by its name and by nothing else.',
    '',
    'The goal was one thing: get the retired flag out of the surfaces that still advertise it,',
    'and say plainly which copies were reached and which were only inspected.',
    '',
    '---',
    '',
    'item: Sweep the installed surfaces for the retired flag and report which of them still',
    'advertise it, by path — a count would not tell the next reader which copy to open.',
    'status: in-flight',
    'dispatched: `investigator` subagent in the worktree; findings to land in',
    '`kaola-workflow/issue-9701/sweep.md`.',
    'result: `sweep.md`. Two of the six surfaces still carry it.',
    'Note for whoever implements: the generated surfaces render from a skeleton, so the fix goes',
    'in the skeleton and the render follows — never the other way round.',
    'MY DECISION: hold the port until the user has ruled on the deletion.',
    '',
    'item: Ask the user whether the flag is deleted or wired up, with the sweep as the evidence.',
    'status: done',
    'dispatched: self, in conversation.',
    'result: Ruled: delete it. Tests fall out with the mechanism, never repaired ahead of it.',
    '',
    'item: Regenerate the surfaces from the skeleton and quote the check output either side.',
    'status: todo',
    'dispatched: not yet — this is the frontier.',
    '',
    // Copied in shape from the two archived runs that actually hold this — issue-878:65 and
    // issue-899:45, both a `dock and finish` item scaffolded at the end of the file with all four
    // field NAMES written ahead of time and two of them still empty. Both are column-0 records,
    // which is why the case lives here as well as in the control: the empty field is the whole
    // point, and this leg proves it is skipped in the same file where a real outcome is reported.
    'item: dock and finish — CHANGELOG `[Unreleased]`, then run the chains, finalize and sink.',
    '`CHANGELOG.md` is test-consumed, so write ALL prose before the chain run rather than after,',
    'or the receipt is stale before it is read.',
    'status: todo',
    'dispatched:',
    'result:',
    ''
  ]);
  legWithRecord('issue-9701', 9701, plainRecord, (found) =>
    assertReports('issue-9701', plainRecord, [0], found));

  // ---- NEGATIVE CONTROL: a coherent record, and every state nearest the condition --------------
  //
  // Without this the report could be unconditional, which would say nothing about any run. The
  // control is not merely "clean": every item in it is one a wrong measure flags anyway, and the
  // reason each must stay silent is written beside it in `coherentSilence` below — the failure
  // message reads from that table, so an item added here says why it belongs without anyone having
  // to keep prose and indexes in step.
  const coherentRecord = missionRecordFixture([
    '# #9702 — a record that agrees with itself',
    '',
    'Branch `workflow/issue-9702`. Nothing in this run is in a contradictory state: what is',
    'finished says so and carries its outcome, what is out says so and carries no outcome yet,',
    'and what has not been reached says nothing at all.',
    '',
    'The goal is the same shape as the two runs above, so the only difference a reader can see',
    'between them is the one thing under measurement.',
    '',
    '---',
    '',
    '## Items',
    '',
    '- item: Read the frontier and decide the width.',
    '  status: done',
    '  dispatched: self, inline.',
    '  result: Five items, two of them dispatched wide.',
    '',
    '- item: Sweep the four editions for the retired constant and name every copy that carries it.',
    '  status: in-flight',
    '  dispatched: `investigator` subagent in the worktree; findings to land in',
    '    `kaola-workflow/issue-9702/sweep.md`, which has not come back yet.',
    '',
    '- item: Decide with the user whether the constant is deleted or wired up.',
    '  status: todo',
    '',
    '- item: Port the fix to the three remaining copies and prove byte-identity after.',
    '  status: in-flight',
    '  status: done',
    '  dispatched: `implementer` subagent in the worktree; notes to `impl.md`.',
    '  result: `impl.md`. All four copies hash identically after.',
    '',
    '- item: Update the changelog and the docs the change reaches.',
    '  status: done',
    '  dispatched: self, inline.',
    '  result: One entry under `[Unreleased]`, plus the API table row.',
    '',
    // The two SCAFFOLDED items. An orchestrator that writes the four field names ahead of the work
    // leaves `result:` standing empty, and an empty field is the absence of an outcome, not the
    // presence of one — reporting it states that something landed where nothing did, in a section
    // a successor reads as evidence. Both forms are here because a key-only match sees no
    // difference between them: nothing after the colon, and whitespace after the colon.
    '- item: Dock and finish — CHANGELOG `[Unreleased]`, then chains, finalize, sink.',
    '  status: todo',
    '  dispatched:',
    '  result:',
    '',
    '- item: Re-run the sweep once the port has landed and record what changed.',
    '  status: in-flight',
    '  dispatched: `investigator` subagent in the worktree.',
    '  result:   ',
    ''
  ]);
  // Why each item must draw silence, in fixture order. The message quotes the entry for whatever
  // was actually named, so a wrong reading is told which state it misread rather than that it was
  // wrong somewhere in a seven-item file.
  const coherentSilence = [
    'is plainly finished and carries its outcome',
    'is in flight with nothing to show — a different and louder problem, and not this one',
    'carries nothing but its mission and a status, and a thin record is not a defective one',
    'was corrected in place, `in-flight` then `done` on the next line, which is how all eleven '
      + 'duplicate-status items in the archive read: the later line is the current one, and reading '
      + 'the earlier one as authoritative reports ten items across the archive whose author wrote '
      + '`done` directly beneath',
    'is plainly finished and carries its outcome',
    'was SCAFFOLDED — the field names were written ahead of the work and `result:` is still empty. '
      + 'An empty field is the absence of an outcome; reporting it tells a later reader that '
      + 'something landed on an item where nothing did. Two archived runs hold exactly this item '
      + '(issue-878 and issue-899, both a `dock and finish` scaffolded at the end of the file)',
    'was SCAFFOLDED like the one above, with whitespace after the colon rather than nothing — the '
      + 'same absence, and a key-only match cannot tell the two apart'
  ];
  legWithRecord('issue-9702', 9702, coherentRecord, (found) => {
    assert(coherentSilence.length === coherentRecord.itemLines.length,
      '#970 fixture invariant: every item in the control needs its reason for silence — '
      + coherentRecord.itemLines.length + ' items, ' + coherentSilence.length + ' reasons.');
    const named = coherentRecord.itemLines.filter(n =>
      mentions(found.envelope, n) || mentions(found.sections, n));
    assert(named.length === 0,
      '#970 [issue-9702]: no item in this record carries an outcome while its status is not '
      + '`done`, yet the report names ' + named.length + ' of them:\n'
      + named.map(n => '  - line ' + n + ' — '
          + coherentSilence[coherentRecord.itemLines.indexOf(n)]).join('\n')
      + '\nEnvelope report:\n' + found.envelope + '\nSection(s):\n' + found.sections);
  });

  console.log('testFinalizeReportsMissionListOutcomeWithoutDone: PASSED');
}

function testWatchPrEmitsClaimLabelReceipt() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-watchpr-label-receipt-'));
  const binDir = path.join(tmp, 'bin');
  const marker = path.join(tmp, 'label-removed.marker');
  try {
    initGitRepo(tmp);
    plantActiveFolder(tmp, 'issue-917', 917, null);
    seedClassifierVerdictFromBody(917, '');
    // Patch state to sink:pr with a pr_url
    const stateFile = path.join(tmp, 'kaola-workflow', 'issue-917', 'workflow-state.md');
    let state = fs.readFileSync(stateFile, 'utf8');
    state = state.replace(/^sink:\s*.*$/m, 'sink: pr');
    if (!state.match(/^pr_url:/m)) state += 'pr_url: https://github.com/test/repo/pull/917\n';
    fs.writeFileSync(stateFile, state);
    fs.mkdirSync(binDir, { recursive: true });
    writeShimFiles(path.join(binDir, 'gh'), [
      "const fs = require('fs');",
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue edit') && a.includes('--remove-label')) {",
      "  fs.writeFileSync(" + JSON.stringify(marker) + ", 'x');",
      "  process.stdout.write('{}\\n');",
      "} else if (a.includes('pr view')) {",
      "  process.stdout.write('{\"state\":\"MERGED\",\"number\":917}\\n');",
      "} else if (a.includes('issue comment')) {",
      "  process.stdout.write('{}\\n');",
      "} else {",
      "  process.stdout.write('{}\\n');",
      "}"
    ]);
    const result = runClaimOnline(['watch-pr'], tmp, binDir);
    assert(
      Array.isArray(result.cleanups) && result.cleanups.length > 0,
      'watch-pr must emit cleanups array with at least one entry, got: ' + JSON.stringify(result)
    );
    assert(
      result.cleanups[0].claim_label_removed === 'removed',
      'watch-pr cleanups[0].claim_label_removed must be removed, got: ' + JSON.stringify(result.cleanups[0])
    );
    assert(
      fs.existsSync(path.join(tmp, 'kaola-workflow', 'archive', 'issue-917')),
      'archive folder must exist after watch-pr archives merged PR folder'
    );
    console.log('testWatchPrEmitsClaimLabelReceipt: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testAuditAndRepairLabels() {
  // (a) audit-labels: lists stale issues without removing
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-audit-labels-'));
    const binDir = path.join(tmp, 'bin');
    const marker = path.join(tmp, 'label-removed.marker');
    try {
      initGitRepo(tmp);
      fs.mkdirSync(binDir, { recursive: true });
      writeShimFiles(path.join(binDir, 'gh'), [
        "const fs = require('fs');",
        "const a = process.argv.slice(2).join(' ');",
        "if (a.includes('issue edit') && a.includes('--remove-label')) {",
        "  fs.writeFileSync(" + JSON.stringify(marker) + ", 'x');",
        "  process.stdout.write('{}\\n');",
        "} else if (a.includes('issue list')) {",
        "  process.stdout.write('[{\"number\":99,\"title\":\"stale\",\"url\":\"http://x\"}]\\n');",
        "} else {",
        "  process.stdout.write('{}\\n');",
        "}"
      ]);
      const result = runClaimOnline(['audit-labels'], tmp, binDir);
      assert(
        Array.isArray(result.stale) && result.stale.length === 1,
        'audit-labels must return stale array of length 1, got: ' + JSON.stringify(result.stale)
      );
      assert(
        result.count === 1,
        'audit-labels must return count:1, got: ' + result.count
      );
      assert(
        !fs.existsSync(marker),
        'audit-labels must NOT call --remove-label (marker must not exist)'
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  // (b) repair-labels dry-run (no --execute): reports would_remove without removing
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-repair-labels-dry-'));
    const binDir = path.join(tmp, 'bin');
    const marker = path.join(tmp, 'label-removed.marker');
    try {
      initGitRepo(tmp);
      fs.mkdirSync(binDir, { recursive: true });
      writeShimFiles(path.join(binDir, 'gh'), [
        "const fs = require('fs');",
        "const a = process.argv.slice(2).join(' ');",
        "if (a.includes('issue edit') && a.includes('--remove-label')) {",
        "  fs.writeFileSync(" + JSON.stringify(marker) + ", 'x');",
        "  process.stdout.write('{}\\n');",
        "} else if (a.includes('issue list')) {",
        "  process.stdout.write('[{\"number\":99,\"title\":\"stale\",\"url\":\"http://x\"}]\\n');",
        "} else {",
        "  process.stdout.write('{}\\n');",
        "}"
      ]);
      const result = runClaimOnline(['repair-labels'], tmp, binDir);
      assert(
        result.dry_run === true,
        'repair-labels without --execute must return dry_run:true, got: ' + result.dry_run
      );
      assert(
        Array.isArray(result.would_remove) && result.would_remove.length === 1,
        'repair-labels dry-run must return would_remove with 1 entry, got: ' + JSON.stringify(result.would_remove)
      );
      assert(
        !fs.existsSync(marker),
        'repair-labels dry-run must NOT call --remove-label (marker must not exist)'
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  // (c) repair-labels --execute: removes the label and returns removed list
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-repair-labels-exec-'));
    const binDir = path.join(tmp, 'bin');
    const marker = path.join(tmp, 'label-removed.marker');
    try {
      initGitRepo(tmp);
      fs.mkdirSync(binDir, { recursive: true });
      writeShimFiles(path.join(binDir, 'gh'), [
        "const fs = require('fs');",
        "const a = process.argv.slice(2).join(' ');",
        "if (a.includes('issue edit') && a.includes('--remove-label')) {",
        "  fs.writeFileSync(" + JSON.stringify(marker) + ", 'x');",
        "  process.stdout.write('{}\\n');",
        "} else if (a.includes('issue list')) {",
        "  process.stdout.write('[{\"number\":99,\"title\":\"stale\",\"url\":\"http://x\"}]\\n');",
        "} else {",
        "  process.stdout.write('{}\\n');",
        "}"
      ]);
      const result = runClaimOnline(['repair-labels', '--execute'], tmp, binDir);
      assert(
        result.dry_run === false,
        'repair-labels --execute must return dry_run:false, got: ' + result.dry_run
      );
      assert(
        Array.isArray(result.removed) && result.removed.includes(99),
        'repair-labels --execute must return removed containing 99, got: ' + JSON.stringify(result.removed)
      );
      assert(
        fs.existsSync(marker),
        'repair-labels --execute must call --remove-label (marker must exist)'
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  console.log('testAuditAndRepairLabels: PASSED');
}

function testFinalizeClaimLabelFailedTriggersInvariant() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-finalize-label-fail-inv-'));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    plantActiveFolder(tmp, 'issue-918', 918, null);
    seedClassifierVerdictFromBody(918, '');
    fs.mkdirSync(binDir, { recursive: true });
    writeShimFiles(path.join(binDir, 'gh'), [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue edit') && a.includes('--remove-label')) {",
      "  process.stderr.write('gh: error: could not remove label\\n');",
      "  process.exit(1);",
      "} else if (a.includes('issue view')) {",
      "  process.stdout.write('{\"state\":\"open\",\"number\":918}\\n');",
      "} else {",
      "  process.stdout.write('{}\\n');",
      "}"
    ]);
    seedAdaptiveFinalizeFixture(tmp, 'issue-918');
    const result = runClaimOnline(['finalize', '--project', 'issue-918'], tmp, binDir);
    assert(
      result.claim_label_removed === 'failed',
      'finalize must return claim_label_removed:failed when gh --remove-label exits non-zero, got: ' + result.claim_label_removed
    );
    assert(
      result.closure_invariants && result.closure_invariants.ok === false,
      'closure_invariants.ok must be false when claim label removal failed, got: ' + JSON.stringify(result.closure_invariants)
    );
    assert(
      Array.isArray(result.closure_invariants.violations) &&
        result.closure_invariants.violations.some(v => v.id === 'in-progress-label-removed'),
      'closure_invariants.violations must contain in-progress-label-removed, got: ' + JSON.stringify(result.closure_invariants.violations)
    );
    console.log('testFinalizeClaimLabelFailedTriggersInvariant: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// Issue #275 — clearAdvisoryClaim deletes the kw:claim marker comment at source
// ---------------------------------------------------------------------------

function testClearAdvisoryClaimDeletesMarkerComment() {
  // RED->GREEN: after discard, the gh api DELETE for the matched comment id MUST be called.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-clear-claim-delete-'));
  const binDir = path.join(tmp, 'bin');
  const deleteMarker = path.join(tmp, 'comment-deleted.marker');
  const listCalledMarker = path.join(tmp, 'list-called.marker');
  try {
    initGitRepo(tmp);
    plantActiveFolder(tmp, 'issue-920', 920, null);
    seedClassifierVerdictFromBody(920, '');
    fs.mkdirSync(binDir, { recursive: true });
    // Shim: --method DELETE branch MUST come before the bare list branch (both contain "comments")
    writeShimFiles(path.join(binDir, 'gh'), [
      "const fs = require('fs');",
      "const a = process.argv.slice(2).join(' ');",
      // DELETE: repos/{owner}/{repo}/issues/comments/42001
      "if ((a.includes('--method DELETE') || a.includes('-X DELETE')) && a.includes('issues/comments/42001')) {",
      "  fs.writeFileSync(" + JSON.stringify(deleteMarker) + ", 'x');",
      "  process.stdout.write('\\n');",
      // list comments for issue 920 — return one matching project-scoped marker with id 42001
      "} else if (a.includes('api') && a.includes('issues/920/comments')) {",
      "  fs.writeFileSync(" + JSON.stringify(listCalledMarker) + ", 'x');",
      "  process.stdout.write('[{\"id\":42001,\"body\":\"<!-- kw:claim project=issue-920 -->\\\\nKaola-Workflow started local work for `issue-920`.\",\"updated_at\":\"2099-01-01T00:00:00Z\"}]\\n');",
      "} else if (a.includes('issue edit') && a.includes('--remove-label')) {",
      "  process.stdout.write('{}\\n');",
      "} else if (a.includes('issue view')) {",
      "  process.stdout.write('{\"state\":\"open\"}\\n');",
      "} else if (a.includes('issue comment')) {",
      "  process.stdout.write('{}\\n');",
      "} else {",
      "  process.stdout.write('{}\\n');",
      "}"
    ]);
    seedAdaptiveFinalizeFixture(tmp, 'issue-920');
    runClaimOnline(['finalize', '--project', 'issue-920'], tmp, binDir);
    assert(
      fs.existsSync(listCalledMarker),
      'clearAdvisoryClaim must list issue comments via gh api (list-called.marker absent)'
    );
    assert(
      fs.existsSync(deleteMarker),
      'clearAdvisoryClaim must DELETE the matched project-scoped marker comment (comment-deleted.marker absent)'
    );
    console.log('testClearAdvisoryClaimDeletesMarkerComment: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClearAdvisoryClaimDoesNotDeleteOtherProjectMarker() {
  // Project-scoping: a marker for a DIFFERENT project must NOT be deleted.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-clear-claim-nodel-'));
  const binDir = path.join(tmp, 'bin');
  const deleteMarker = path.join(tmp, 'comment-deleted.marker');
  const listCalledMarker = path.join(tmp, 'list-called.marker');
  try {
    initGitRepo(tmp);
    plantActiveFolder(tmp, 'issue-921', 921, null);
    seedClassifierVerdictFromBody(921, '');
    fs.mkdirSync(binDir, { recursive: true });
    writeShimFiles(path.join(binDir, 'gh'), [
      "const fs = require('fs');",
      "const a = process.argv.slice(2).join(' ');",
      // DELETE — should NOT be called for the wrong project's comment
      "if ((a.includes('--method DELETE') || a.includes('-X DELETE')) && a.includes('issues/comments/')) {",
      "  fs.writeFileSync(" + JSON.stringify(deleteMarker) + ", 'x');",
      "  process.stdout.write('\\n');",
      // list comments — return a marker for a DIFFERENT project (issue-OTHER)
      "} else if (a.includes('api') && a.includes('issues/921/comments')) {",
      "  fs.writeFileSync(" + JSON.stringify(listCalledMarker) + ", 'x');",
      "  process.stdout.write('[{\"id\":99999,\"body\":\"<!-- kw:claim project=issue-OTHER -->\\\\nKaola-Workflow started local work for `issue-OTHER`.\",\"updated_at\":\"2099-01-01T00:00:00Z\"}]\\n');",
      "} else if (a.includes('issue edit') && a.includes('--remove-label')) {",
      "  process.stdout.write('{}\\n');",
      "} else if (a.includes('issue view')) {",
      "  process.stdout.write('{\"state\":\"open\"}\\n');",
      "} else if (a.includes('issue comment')) {",
      "  process.stdout.write('{}\\n');",
      "} else {",
      "  process.stdout.write('{}\\n');",
      "}"
    ]);
    seedAdaptiveFinalizeFixture(tmp, 'issue-921');
    runClaimOnline(['finalize', '--project', 'issue-921'], tmp, binDir);
    assert(
      fs.existsSync(listCalledMarker),
      'clearAdvisoryClaim must still list comments to check for a match (list-called.marker absent)'
    );
    assert(
      !fs.existsSync(deleteMarker),
      'clearAdvisoryClaim must NOT delete a comment from a DIFFERENT project (comment-deleted.marker must be absent)'
    );
    console.log('testClearAdvisoryClaimDoesNotDeleteOtherProjectMarker: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClearAdvisoryClaimOfflineSkipsDelete() {
  // OFFLINE: no comment list and no DELETE must happen; return stays skipped_offline.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-clear-claim-offline-'));
  const binDir = path.join(tmp, 'bin');
  const listCalledMarker = path.join(tmp, 'list-called.marker');
  const deleteMarker = path.join(tmp, 'comment-deleted.marker');
  try {
    initGitRepo(tmp);
    plantActiveFolder(tmp, 'issue-922', 922, null);
    // No roadmap entry — offline finalize skips roadmap ops
    fs.mkdirSync(binDir, { recursive: true });
    writeShimFiles(path.join(binDir, 'gh'), [
      "const fs = require('fs');",
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('api') && a.includes('issues/922/comments')) {",
      "  fs.writeFileSync(" + JSON.stringify(listCalledMarker) + ", 'x');",
      "  process.stdout.write('[{\"id\":77777,\"body\":\"<!-- kw:claim project=issue-922 -->\",\"updated_at\":\"2099-01-01T00:00:00Z\"}]\\n');",
      "} else if ((a.includes('--method DELETE') || a.includes('-X DELETE')) && a.includes('issues/comments/')) {",
      "  fs.writeFileSync(" + JSON.stringify(deleteMarker) + ", 'x');",
      "  process.stdout.write('\\n');",
      "} else {",
      "  process.stdout.write('{}\\n');",
      "}"
    ]);
    seedAdaptiveFinalizeFixture(tmp, 'issue-922');
    // Use spawnSync directly (not runClaimOnline) to set OFFLINE=1
    const result = spawnSync(process.execPath, [claimScript, 'finalize', '--project', 'issue-922'], {
      cwd: tmp,
      encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_GH_MOCK_SCRIPT: path.join(binDir, 'gh.js') }
    });
    assert(result.status === 0, 'offline finalize should exit 0\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert(
      parsed.claim_label_removed === 'skipped_offline',
      'offline finalize must return claim_label_removed:skipped_offline, got: ' + parsed.claim_label_removed
    );
    assert(
      !fs.existsSync(listCalledMarker),
      'offline clearAdvisoryClaim must NOT call gh api to list comments (list-called.marker must be absent)'
    );
    assert(
      !fs.existsSync(deleteMarker),
      'offline clearAdvisoryClaim must NOT call gh api DELETE (comment-deleted.marker must be absent)'
    );
    console.log('testClearAdvisoryClaimOfflineSkipsDelete: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// #936 — the SINK side of the same contract, and the only chain-visible leg that covers it.
//
// A claim is two artifacts: the workflow:in-progress LABEL and the kw:claim MARKER COMMENT. The
// classifier blocks a re-claim on (label OR marker), so releasing one and leaving the other leaves
// the issue claimed. The three legs above prove claim.js's clearAdvisoryClaim releases both. This
// one covers the sink — specifically `--sink --keep-issue-open`, which is the shipped finalize
// surface's invocation and the terminal that leaves an issue OPEN with the claim on it.
//
// The gh mock here is CWD-HONEST: like real gh, it fails when invoked from a directory that is not
// inside a git repository. That is load-bearing. `--sink` calls process.chdir(os.tmpdir()) before
// doing any work, which is why every forge call in sink-merge passes { cwd: mainRoot }; and
// clearAdvisoryClaim calls ghExec with no opts and swallows every error in its marker-deletion
// block. So a fix that just calls it from the sink deletes nothing, silently, forever — and would
// pass a test that asserted only that the deleter was called. The assertion below is instead about
// the issue's END STATE (the marker is not on the issue any more), which that fix cannot satisfy.
function testSinkKeepOpenReleasesClaimMarker() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-936-')));
  const remotePath = initGitRepoWithBareRemote(tmp);
  // The mock lives OUTSIDE the repo root — a file inside it is classified as foreign dirt by the
  // sink preflight, which would refuse before the closure step ever runs.
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-936-mock-'));
  const logFile = path.join(binDir, 'gh-calls.log');
  const storeFile = path.join(binDir, 'issue-comments.json');
  const project = 'issue-9360';
  const issue = 9360;
  const marker = (p) => '<!-- kw:claim project=' + p + ' -->';
  try {
    fs.writeFileSync(storeFile, JSON.stringify({
      [issue]: [
        { id: 93691, body: marker(project) + '\nKaola-Workflow started local work for `' + project + '`.', updated_at: new Date().toISOString() },
        { id: 93692, body: marker('issue-OTHER') + '\nKaola-Workflow started local work for `issue-OTHER`.', updated_at: new Date().toISOString() },
      ],
    }, null, 2));
    writeShimFiles(path.join(binDir, 'gh'), [
      "'use strict';",
      "const fs = require('fs');",
      "const path = require('path');",
      "const a = process.argv.slice(2).join(' ');",
      "const logFile = " + JSON.stringify(logFile) + ";",
      "const storeFile = " + JSON.stringify(storeFile) + ";",
      "function log(m){ try { fs.appendFileSync(logFile, m + '\\n'); } catch(_){} }",
      "function loadStore(){ try { return JSON.parse(fs.readFileSync(storeFile, 'utf8')); } catch(_){ return {}; } }",
      // cwd-honest, exactly as real gh is: without --repo, gh resolves its target repo from the
      // invoking cwd, so a call site that drops { cwd: mainRoot } must fail here too.
      "let d = process.cwd(); let inRepo = false;",
      "for (;;) { if (fs.existsSync(path.join(d, '.git'))) { inRepo = true; break; } const p = path.dirname(d); if (p === d) break; d = p; }",
      "if (!inRepo) { log('REJECTED-wrong-cwd:' + process.cwd() + ' args=' + a); process.stderr.write('gh: could not determine base repo, use --repo\\n'); process.exit(1); }",
      "if (a.includes('repo view')) { process.stdout.write(JSON.stringify({owner:{login:'test'},name:'repo'}) + '\\n'); process.exit(0); }",
      "if (/issue view \\d+/.test(a)) { process.stdout.write('open\\n'); process.exit(0); }",
      "const closeM = a.match(/issue close (\\d+)/); if (closeM) { log('close:' + closeM[1]); process.exit(0); }",
      "if (a.includes('issue edit') && a.includes('--remove-label')) { const m = a.match(/issue edit (\\d+)/); log('label-removed:' + (m ? m[1] : '?')); process.exit(0); }",
      // DELETE before LIST — both argv carry the substring 'comments'.
      "const delM = a.match(/issues\\/comments\\/(\\d+)/);",
      "if (a.includes('api') && (a.includes('--method DELETE') || a.includes('-X DELETE')) && delM) {",
      "  const id = Number(delM[1]); const s = loadStore();",
      "  for (const k of Object.keys(s)) s[k] = (s[k] || []).filter(function(c){ return Number(c && c.id) !== id; });",
      "  try { fs.writeFileSync(storeFile, JSON.stringify(s, null, 2)); } catch(_){}",
      "  log('comment-deleted:' + id); process.stdout.write('{}\\n'); process.exit(0);",
      "}",
      "const listM = a.match(/issues\\/(\\d+)\\/comments/);",
      "if (a.includes('api') && listM) { process.stdout.write(JSON.stringify(loadStore()[listM[1]] || []) + '\\n'); process.exit(0); }",
      "process.stdout.write('\\n'); process.exit(0);",
    ]);

    G.git(tmp, ['checkout', '-b', 'workflow/' + project], { encoding: 'utf8' });
    G.git(tmp, ['push', '-u', 'origin', 'workflow/' + project], { encoding: 'utf8' });
    fs.writeFileSync(path.join(tmp, 'DELIVERABLE-9360.txt'), 'deliverable\n');
    G.git(tmp, ['add', 'DELIVERABLE-9360.txt'], { encoding: 'utf8' });
    G.git(tmp, ['commit', '-m', 'feat: deliverable 9360'], { encoding: 'utf8' });
    G.git(tmp, ['push', 'origin', 'workflow/' + project], { encoding: 'utf8' });
    G.git(tmp, ['checkout', 'main'], { encoding: 'utf8' });

    // The measured properties are the sink's own exit code and the last-line JSON envelope it
    // prints, and the forge calls it makes on the way out. All three exist only at the process
    // boundary; the keep-open closure step is reachable no other way.
    // spawn-class: cli-contract
    const result = spawnSync(process.execPath, [
      sinkMergeScript, '--branch', 'workflow/' + project, '--project', project,
      '--issue', String(issue), '--keep-issue-open', '--sink', '--json',
    ], {
      cwd: tmp,
      encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_GH_MOCK_SCRIPT: path.join(binDir, 'gh.js') },
    });
    const parsed = (() => { try { return JSON.parse(String(result.stdout || '').trim().split('\n').pop()); } catch (_) { return {}; } })();
    const calls = (() => { try { return fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean); } catch (_) { return []; } })();
    const bodies = (() => {
      try { return (JSON.parse(fs.readFileSync(storeFile, 'utf8'))[String(issue)] || []).map(c => String(c.body || '')); }
      catch (_) { return []; }
    })();

    // FIXTURE PREMISE — a run that stopped early says nothing about claim release.
    assert(result.status === 0 && parsed.status === 'sinked',
      '#936: the keep-open --sink run must complete, or nothing below is about claim release; got exit=' + result.status +
      ' status=' + JSON.stringify(parsed.status || parsed.reason) + '\nstderr: ' + String(result.stderr || '').slice(-800));
    assert(!calls.includes('close:' + issue),
      '#936 premise: a keep-open run must leave the issue OPEN; calls=' + JSON.stringify(calls));

    assert(calls.includes('label-removed:' + issue),
      '#936: --sink --keep-issue-open must remove the workflow:in-progress LABEL from the issue it leaves open; calls=' + JSON.stringify(calls));
    assert(!bodies.some(b => b.includes(marker(project))),
      '#936: --sink --keep-issue-open must delete the kw:claim MARKER COMMENT from the issue it leaves open — the classifier blocks a re-claim on (label OR marker), so releasing only the label leaves the issue claimed. Comments still on #' + issue + ': ' + JSON.stringify(bodies));
    assert(!calls.some(l => l.startsWith('REJECTED-wrong-cwd:')),
      '#936: every forge call must carry a cwd that resolves the repository — --sink chdirs to os.tmpdir(), so a call made without { cwd: mainRoot } fails invisibly inside a swallowed catch and deletes nothing. Rejected: ' + JSON.stringify(calls.filter(l => l.startsWith('REJECTED-wrong-cwd:'))));
    assert(bodies.some(b => b.includes(marker('issue-OTHER'))),
      '#936: a marker belonging to a DIFFERENT project is another run\'s live claim and must NOT be deleted; comments=' + JSON.stringify(bodies));
    console.log('testSinkKeepOpenReleasesClaimMarker: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(remotePath, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(binDir, { recursive: true, force: true }); } catch (_) {}
  }
}

// The same contract stated as the OUTCOME the user actually cares about: after a sink leaves an
// issue open, that issue can be claimed again.
//
// The leg above asserts the marker string is absent from the mock's store afterwards. That is the
// assertion that mutation-catches a deleter running in the wrong cwd, but it reads the marker in a
// spelling this suite chose, so it cannot see the three parties disagreeing about what a marker IS:
//
//   PRODUCER  claim.js:937          '<!-- kw:claim project=' + project + ' -->\n…'
//   DELETER   claim.js:977-980      exact, case-sensitive, `project=`-only substring
//   DETECTOR  classifier.js:215     /<!--\s*kw:claim\s+(project|sess)=/ — tolerant of inner
//                                   whitespace, and accepts `sess=` as well
//
// The detector is strictly WIDER than the deleter, and a marker in the gap is unclearable but still
// blocking. A test that both writes and reads the marker in its own spelling is blind to that by
// construction. So this leg spells the marker NOWHERE. It seeds through the real producer, releases
// through the real sink, and reads the verdict off the real classifier by way of `startup
// --target-issue`. If any of the three ever disagrees about the bytes, the re-claim stays blocked
// and this reds — whatever the new spelling happens to be.
//
// It seeds by calling postAdvisoryClaim (claim.js's ONLY marker producer, and an export) rather
// than by running a full claim, because the composition has to leave the SINK as the only thing
// that releases: cmdFinalize clears the claim itself at claim.js:4605, so a startup→finalize→sink
// fixture would go green with the sink doing nothing and prove the opposite of what it claims.
function testKeepOpenSinkLeavesTheIssueReClaimable() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-reclaim-936-')));
  const remotePath = initGitRepoWithBareRemote(tmp);
  // Outside the repo root: a mock file inside it is foreign dirt to the sink preflight.
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-reclaim-936-mock-'));
  const stateFile = path.join(binDir, 'forge-state.json');
  const project = 'issue-9361';
  const issue = 9361;
  try {
    // A forge that remembers. Labels and comments are STATE, so the claim the producer posts is the
    // claim the classifier later reads — nothing in this fixture retypes either one.
    fs.writeFileSync(stateFile, JSON.stringify({ labels: {}, comments: {}, closed: {}, nextId: 50001 }));
    writeShimFiles(path.join(binDir, 'gh'), [
      "'use strict';",
      "const fs = require('fs');",
      'const argv = process.argv.slice(2);',
      "const a = argv.join(' ');",
      'const stateFile = ' + JSON.stringify(stateFile) + ';',
      "function load(){ try { return JSON.parse(fs.readFileSync(stateFile,'utf8')); } catch(_){ return {labels:{},comments:{},closed:{},nextId:50001}; } }",
      "function save(s){ try { fs.writeFileSync(stateFile, JSON.stringify(s,null,2)); } catch(_){} }",
      "function after(flag){ const i = argv.indexOf(flag); return i >= 0 && i + 1 < argv.length ? argv[i+1] : null; }",
      "if (a.includes('repo view')) { process.stdout.write(JSON.stringify({owner:{login:'test'},name:'repo'}) + '\\n'); process.exit(0); }",
      "if (a.includes('label create')) { process.exit(0); }",
      'const viewM = a.match(/issue view (\\d+)/);',
      'if (viewM) {',
      '  const s = load(); const n = viewM[1];',
      // the sink probes with --jq .state and wants a bare token; the classifier wants the object.
      "  if (a.includes('--jq')) { process.stdout.write((s.closed[n] ? 'closed' : 'open') + '\\n'); process.exit(0); }",
      "  process.stdout.write(JSON.stringify({ number: Number(n), title: 'reclaim fixture ' + n, body: 'README.md',",
      "    labels: (s.labels[n] || []).map(function(name){ return { name: name }; }),",
      "    state: s.closed[n] ? 'CLOSED' : 'OPEN' }) + '\\n');",
      '  process.exit(0);',
      '}',
      "const closeM = a.match(/issue close (\\d+)/);",
      "if (closeM) { const s = load(); s.closed[closeM[1]] = true; save(s); process.exit(0); }",
      "const editM = a.match(/issue edit (\\d+)/);",
      'if (editM) {',
      '  const s = load(); const n = editM[1]; const cur = s.labels[n] || [];',
      "  const add = after('--add-label'); const rm = after('--remove-label');",
      '  if (add && cur.indexOf(add) === -1) cur.push(add);',
      '  s.labels[n] = rm ? cur.filter(function(l){ return l !== rm; }) : cur;',
      '  save(s); process.exit(0);',
      '}',
      "const commentM = a.match(/issue comment (\\d+)/);",
      'if (commentM) {',
      // The body is taken from argv POSITIONALLY, never from the joined string: this is the one
      // place the producer's exact bytes enter the fixture, and joining would mangle them.
      "  const body = after('--body');",
      '  if (body !== null) {',
      '    const s = load(); const n = commentM[1];',
      '    (s.comments[n] = s.comments[n] || []).push({ id: s.nextId++, body: body, updated_at: new Date().toISOString() });',
      '    save(s);',
      '  }',
      '  process.exit(0);',
      '}',
      // DELETE before LIST — both argv carry the substring 'comments'.
      "const delM = a.match(/issues\\/comments\\/(\\d+)/);",
      "if (a.includes('api') && (a.includes('--method DELETE') || a.includes('-X DELETE')) && delM) {",
      '  const id = Number(delM[1]); const s = load();',
      '  for (const k of Object.keys(s.comments)) s.comments[k] = s.comments[k].filter(function(c){ return Number(c.id) !== id; });',
      "  save(s); process.stdout.write('{}\\n'); process.exit(0);",
      '}',
      "const listM = a.match(/issues\\/(\\d+)\\/comments/);",
      "if (a.includes('api') && listM) { process.stdout.write(JSON.stringify(load().comments[listM[1]] || []) + '\\n'); process.exit(0); }",
      "process.stdout.write('\\n'); process.exit(0);",
    ]);
    const mockEnv = { ...process.env, KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_GH_MOCK_SCRIPT: path.join(binDir, 'gh.js') };
    const readState = () => { try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch (_) { return null; } };

    // A roadmap source, so the re-claim at the end has an issue to claim.
    seedClassifierVerdictFromBody(issue, '');
    const gitEnv = { ...process.env, ...GIT_ISOLATION_ENV,
      GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@t' };
    G.git(tmp, ['add', '-A'], { encoding: 'utf8', env: gitEnv });
    G.git(tmp, ['commit', '-m', 'chore: roadmap source ' + issue], { encoding: 'utf8', env: gitEnv });
    G.git(tmp, ['push', 'origin', 'main'], { encoding: 'utf8', env: gitEnv });

    // (1) SEED through the real producer. Nothing here names the marker; whatever bytes
    // postAdvisoryClaim writes are the bytes the forge state now holds.
    // spawn-class: cli-contract
    const seed = spawnSync(process.execPath, ['-e',
      'const c = require(' + JSON.stringify(claimScript) + ');' +
      'process.stdout.write(String(c.postAdvisoryClaim(' + issue + ', ' + JSON.stringify(project) + ')));',
    ], { cwd: tmp, encoding: 'utf8', env: mockEnv });
    assert(seed.status === 0 && seed.stdout.trim() === 'posted',
      '#936 reclaim premise: the real producer (postAdvisoryClaim) must post the claim; got exit=' + seed.status +
      ' stdout=' + JSON.stringify(seed.stdout) + '\nstderr: ' + seed.stderr);
    const seeded = readState();
    assert(seeded && (seeded.labels[String(issue)] || []).length === 1 && (seeded.comments[String(issue)] || []).length === 1,
      '#936 reclaim premise: the producer must have left BOTH artifacts on the issue; forge state=' + JSON.stringify(seeded));

    // (2) THE PREMISE THAT MAKES THE VERDICT MEAN SOMETHING. With the claim in place the real
    // classifier must call this issue blocked — otherwise step (4) could pass with the sink doing
    // nothing at all, and the leg would be measuring an issue that was never claimed.
    // spawn-class: cli-contract
    const blockedProbe = spawnSync(process.execPath, [claimScript, 'startup', '--target-issue', String(issue)],
      { cwd: tmp, encoding: 'utf8', env: { ...mockEnv, KAOLA_WORKTREE_NATIVE: '1' } });
    const blockedOut = (() => { try { return JSON.parse(blockedProbe.stdout); } catch (_) { return {}; } })();
    assert(blockedOut.status === 'user_target_blocked',
      '#936 reclaim premise: a freshly claimed issue must be user_target_blocked, or the release below proves nothing; got ' +
      JSON.stringify(blockedOut) + '\nstderr: ' + String(blockedProbe.stderr || '').slice(-400));

    // (3) The branch the sink will land, then the sink itself — the ONLY thing that releases here.
    G.git(tmp, ['checkout', '-b', 'workflow/' + project], { encoding: 'utf8', env: gitEnv });
    G.git(tmp, ['push', '-u', 'origin', 'workflow/' + project], { encoding: 'utf8', env: gitEnv });
    fs.writeFileSync(path.join(tmp, 'DELIVERABLE-9361.txt'), 'deliverable\n');
    G.git(tmp, ['add', 'DELIVERABLE-9361.txt'], { encoding: 'utf8', env: gitEnv });
    G.git(tmp, ['commit', '-m', 'feat: deliverable 9361'], { encoding: 'utf8', env: gitEnv });
    G.git(tmp, ['push', 'origin', 'workflow/' + project], { encoding: 'utf8', env: gitEnv });
    G.git(tmp, ['checkout', 'main'], { encoding: 'utf8', env: gitEnv });

    // spawn-class: cli-contract
    const sink = spawnSync(process.execPath, [
      sinkMergeScript, '--branch', 'workflow/' + project, '--project', project,
      '--issue', String(issue), '--keep-issue-open', '--sink', '--json',
    ], { cwd: tmp, encoding: 'utf8', env: mockEnv });
    const sinkOut = (() => { try { return JSON.parse(String(sink.stdout || '').trim().split('\n').pop()); } catch (_) { return {}; } })();
    assert(sink.status === 0 && sinkOut.status === 'sinked',
      '#936 reclaim premise: the keep-open sink must complete; got exit=' + sink.status +
      ' status=' + JSON.stringify(sinkOut.status || sinkOut.reason) + '\nstderr: ' + String(sink.stderr || '').slice(-800));
    const afterSink = readState();
    assert(afterSink && !afterSink.closed[String(issue)],
      '#936 reclaim premise: --keep-issue-open must leave the issue OPEN; forge state=' + JSON.stringify(afterSink));

    // (4) THE OUTCOME. Same classifier, same forge state, no strings: the issue the sink left open
    // must be claimable again.
    // spawn-class: cli-contract
    const reclaim = spawnSync(process.execPath, [claimScript, 'startup', '--target-issue', String(issue)],
      { cwd: tmp, encoding: 'utf8', env: { ...mockEnv, KAOLA_WORKTREE_NATIVE: '1' } });
    const out = (() => { try { return JSON.parse(reclaim.stdout); } catch (_) { return {}; } })();
    assert(out.status !== 'user_target_blocked',
      '#936: an issue the sink LEFT OPEN must be claimable again — startup --target-issue ' + issue +
      ' still reports user_target_blocked, so the keep-open terminal released neither artifact fully. ' +
      'Forge state after the sink: ' + JSON.stringify(readState()) + '\nenvelope: ' + JSON.stringify(out));
    assert(out.claim === 'acquired' || out.claim === 'owned',
      '#936: the re-claim must actually succeed (acquired/owned), got claim=' + JSON.stringify(out.claim) +
      ' status=' + JSON.stringify(out.status) + '\nenvelope: ' + JSON.stringify(out) +
      '\nstderr: ' + String(reclaim.stderr || '').slice(-400));
    console.log('testKeepOpenSinkLeavesTheIssueReClaimable: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(remotePath, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(binDir, { recursive: true, force: true }); } catch (_) {}
  }
}

// issue-164 Task 5: tests for closure receipt shape and mockability

function testSinkMergeEmitsClosureReceipt() {
  // Exercise sink-merge (OFFLINE=1) and verify it emits a well-formed closure receipt JSON.
  // Uses the same linked-worktree setup as testSinkMergeFromLinkedWorktree so that
  // the branch can be deleted (Step 9) and the FF merge succeeds.
  // Updated for #264: worktrees now live at <root>/.kw/worktrees/<project>.
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sm-receipt-')));
  const kwRoot = tmp + '.kw'; // legacy path — kept for cleanup only
  try {
    initGitRepo(tmp);
    const wtPath = path.join(tmp, '.kw', 'worktrees', 'issue-164r');
    fs.mkdirSync(path.dirname(wtPath), { recursive: true });
    G.git(tmp, ['worktree', 'add', '-b', 'workflow/issue-164r', '--', wtPath, 'HEAD'], { encoding: 'utf8' });
    // Feature commit so the merge is a real FF.
    fs.writeFileSync(path.join(wtPath, 'feature-164r.txt'), 'feature\n');
    G.git(wtPath, ['add', 'feature-164r.txt'], { encoding: 'utf8' });
    G.git(wtPath, ['commit', '-m', 'feat: issue 164r'], { encoding: 'utf8' });
    // No plantActiveFolder: without a live active folder, active-folder-absent is satisfied.
    // Plant the archive that cmdFinalize would have created in production (finalize runs
    // BEFORE sink-merge). mainRoot resolves to tmp for this linked worktree, so sink-merge
    // probes archiveDest = tmp/kaola-workflow/archive/issue-164r — this is the path it reads.
    const archiveStateDir = path.join(tmp, 'kaola-workflow', 'archive', 'issue-164r');
    fs.mkdirSync(archiveStateDir, { recursive: true });
    const anchors164r = require(claimScript).buildClaimAnchors(tmp, {
      issue_number: 164,
      branch: 'workflow/issue-164r',
      claim_ts: '2026-01-01T00:00:00Z',
      session_marker: 'sink-receipt-164r',
    });
    fs.writeFileSync(path.join(archiveStateDir, 'workflow-state.md'), [
      '# Kaola-Workflow State', '', '## Project', 'name: issue-164r',
      'status: closed', 'step: complete', '', '## Claim Identity',
      'claim_repository_id: ' + anchors164r.claim_repository_id,
      'claim_identity_digest: ' + anchors164r.claim_identity_digest, '',
      '## Sink',
      'issue_number: 164', 'branch: workflow/issue-164r', 'sink: merge', '',
    ].join('\n'));

    const result = spawnSync(process.execPath, [
      sinkMergeScript,
      '--project', 'issue-164r',
      '--branch', 'workflow/issue-164r',
      '--issue', '164'
    ], {
      cwd: wtPath,
      encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
    });

    assert(
      result.status === 0,
      'sink-merge should exit 0\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr
    );

    // Parse the last non-empty line as JSON (sink-merge may emit progress on earlier lines)
    const lines = result.stdout.trim().split('\n').filter(l => l.trim());
    const parsed = JSON.parse(lines[lines.length - 1]);

    assert(parsed.status === 'merged', 'closure JSON must have status:merged, got: ' + JSON.stringify(parsed));
    assert(parsed.closure_receipt, 'closure JSON must have closure_receipt field');
    const receipt = parsed.closure_receipt;
    assert(typeof receipt.branch_removed === 'string', 'receipt must have branch_removed field, got: ' + JSON.stringify(receipt));
    assert(typeof receipt.worktree_removed === 'string', 'receipt must have worktree_removed field, got: ' + JSON.stringify(receipt));
    assert(
      receipt.remote_issue_closed === 'skipped_offline',
      'OFFLINE=1: receipt.remote_issue_closed must be skipped_offline, got: ' + receipt.remote_issue_closed
    );
    assert(
      receipt.claim_label_removed === 'skipped_offline',
      'OFFLINE=1: receipt.claim_label_removed must be skipped_offline, got: ' + receipt.claim_label_removed
    );
    assert(
      receipt.archive === 'closed',
      'production happy path: receipt.archive must be closed when the archive dir exists, got: ' + receipt.archive
    );
    assert(
      parsed.closure_invariants && parsed.closure_invariants.ok === true,
      'closure_invariants.ok must be true for offline receipt, got: ' + JSON.stringify(parsed.closure_invariants)
    );
    // #393a SINGLE-ISSUE NO-MISFIRE: a single-issue sink with NO --issue-numbers flag and NO
    // issue_numbers: line in the (archived) state must derive an EMPTY member set (member_source:'none')
    // → the length>1 bundle close-loop never trips → the receipt carries NO bundle fields. This proves
    // the #393a state-fallback adds zero divergence to the single-issue path.
    assert(parsed.member_source === 'none',
      '#393a: single-issue sink derives member_source:none (no issue_numbers line), got: ' + parsed.member_source);
    assert(!('issue_numbers' in receipt) && !('closed_issues' in receipt) && !('failed_issue_closures' in receipt) && !('open_issues' in receipt),
      '#393a: single-issue receipt carries NO bundle arrays (no misfire), got: ' + JSON.stringify(receipt));
    console.log('testSinkMergeEmitsClosureReceipt: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
  }
}

function testWatchPrMergedClosureReceipt() {
  // Verify that cmdWatchPr attaches a receipt sub-object to cleanups[0] when a PR is MERGED.
  // The receipt must have the fields defined by buildClosureReceipt.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-watchpr-receipt-'));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    plantActiveFolder(tmp, 'issue-164w', 164, null);
    // Patch state to sink:pr with a pr_url.
    const stateFile = path.join(tmp, 'kaola-workflow', 'issue-164w', 'workflow-state.md');
    let state = fs.readFileSync(stateFile, 'utf8');
    state = state.replace(/^sink:\s*.*$/m, 'sink: pr');
    if (!state.match(/^pr_url:/m)) state += 'pr_url: https://github.com/test/repo/pull/164\n';
    fs.writeFileSync(stateFile, state);
    fs.mkdirSync(binDir, { recursive: true });
    writeShimFiles(path.join(binDir, 'gh'), [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue edit') && a.includes('--remove-label')) {",
      "  process.stdout.write('{}\\n');",
      "} else if (a.includes('pr view')) {",
      "  process.stdout.write('{\"state\":\"MERGED\",\"number\":164}\\n');",
      "} else if (a.includes('issue comment')) {",
      "  process.stdout.write('{}\\n');",
      "} else {",
      "  process.stdout.write('{}\\n');",
      "}"
    ]);
    const result = runClaimOnline(['watch-pr'], tmp, binDir);
    assert(
      Array.isArray(result.cleanups) && result.cleanups.length > 0,
      'watch-pr must emit cleanups array with at least one entry, got: ' + JSON.stringify(result)
    );
    const cleanup = result.cleanups[0];
    assert(cleanup.receipt, 'cleanups[0] must have a receipt field, got: ' + JSON.stringify(cleanup));
    const receipt = cleanup.receipt;
    assert(
      receipt.branch_removed === 'kept',
      'watch-pr receipt.branch_removed must be kept, got: ' + receipt.branch_removed
    );
    assert(
      receipt.remote_issue_closed === 'skipped_offline',
      'watch-pr receipt.remote_issue_closed must be skipped_offline, got: ' + receipt.remote_issue_closed
    );
    assert(
      typeof receipt.worktree_removed === 'string',
      'watch-pr receipt must have worktree_removed field, got: ' + JSON.stringify(receipt)
    );
    assert(
      typeof receipt.archive === 'string',
      'watch-pr receipt must have archive field, got: ' + JSON.stringify(receipt)
    );
    // ADR 0018 §5: the receipt.roadmap_source_removed field-presence assertion stood here —
    // retired along with the field itself.
    assert(
      result.cleanups[0].closure_invariants,
      'cleanups[0] must have closure_invariants, got: ' + JSON.stringify(cleanup)
    );
    // DELETED: `receipt.claim_planner_attested === 'missing'`, which pinned checkDispatchAttestations
    // running on the watch-pr MERGED receipt. That probe was retired from claim.js with the rest of
    // the attestation chain, so the field has no producer. What is kept is the reappearance guard for
    // BOTH retired fields — the only half of this that a live mechanism can still violate.
    assert(
      !('claim_planner_attested' in receipt),
      'watch-pr MERGED receipt must NOT carry the retired planner attestation field, got: ' + JSON.stringify(Object.keys(receipt))
    );
    assert(
      !('finalize_contractor_attested' in receipt),
      '#816: watch-pr MERGED receipt must NOT carry a retired finalize-seam attestation field, got: ' + JSON.stringify(Object.keys(receipt))
    );
    console.log('testWatchPrMergedClosureReceipt: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testFinalizeOfflineClosureReceiptSkipped() {
  // Run cmdFinalize with KAOLA_WORKFLOW_OFFLINE=1 and verify the closure_receipt
  // shows skipped_offline for remote operations while closure_invariants.ok is true.
  // Uses direct spawnSync because runClaimOnline hardcodes OFFLINE=0.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-finalize-offline-receipt-'));
  try {
    initGitRepo(tmp);
    // Do NOT plant a roadmap issue — avoids roadmap-source-absent violation.
    plantActiveFolder(tmp, 'issue-164f', 164, null);
    seedAdaptiveFinalizeFixture(tmp, 'issue-164f');
    const result = spawnSync(process.execPath, [claimScript, 'finalize', '--project', 'issue-164f'], {
      cwd: tmp,
      encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
    });
    assert(
      result.status === 0,
      'offline finalize should exit 0\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr
    );
    const parsed = JSON.parse(result.stdout);
    assert(parsed.closure_receipt, 'finalize must emit closure_receipt, got: ' + JSON.stringify(parsed));
    assert(
      parsed.closure_receipt.remote_issue_closed === 'skipped_offline',
      'OFFLINE=1: closure_receipt.remote_issue_closed must be skipped_offline, got: ' + parsed.closure_receipt.remote_issue_closed
    );
    assert(
      parsed.closure_receipt.claim_label_removed === 'skipped_offline',
      'OFFLINE=1: closure_receipt.claim_label_removed must be skipped_offline, got: ' + parsed.closure_receipt.claim_label_removed
    );
    assert(
      parsed.closure_invariants && parsed.closure_invariants.ok === true,
      'OFFLINE=1: closure_invariants.ok must be true (skipped_offline is allowed), got: ' + JSON.stringify(parsed.closure_invariants)
    );
    console.log('testFinalizeOfflineClosureReceiptSkipped: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testSinkMergeMockabilityAndReceipt() {
  // Verify that KAOLA_GH_MOCK_SCRIPT is consulted by sink-merge's ghExec when OFFLINE=0.
  // Uses a bare remote so assertBranchPushedToUpstream passes, and sets up the feature
  // branch as already merged (no live workflow folder on branch HEAD) so all guards pass.
  // A marker file written by the shim proves the mock was invoked (not the real `gh`).
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sm-mock-')));
  const remotePath = initGitRepoWithBareRemote(tmp);
  const marker = path.join(tmp, 'gh-mock-called.marker');
  const cwdMarker = path.join(tmp, 'gh-mock-cwd.marker');
  try {
    const binDir = path.join(tmp, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    writeShimFiles(path.join(binDir, 'gh'), [
      "const fs = require('fs');",
      "const cp = require('child_process');",
      "const a = process.argv.slice(2).join(' ');",
      "fs.writeFileSync(" + JSON.stringify(marker) + ", a + '\\n', { flag: 'a' });",
      "let top = '';",
      "try { top = cp.execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch (_) { top = 'NOT_A_REPO:' + process.cwd(); }",
      "fs.writeFileSync(" + JSON.stringify(cwdMarker) + ", a + '\\t' + top + '\\n', { flag: 'a' });",
      // #619(2): a post-close success probe now calls `gh issue view ... --jq .state` both BEFORE
      // (#427 already-closed skip check) and AFTER a close. Make the mock STATEFUL by reading its
      // own marker log: report 'closed' only once an `issue close` call has actually been logged,
      // mirroring real gh behavior (open before close, closed after) — a constant 'closed' would
      // make the #427 pre-close probe skip the close attempt entirely (already_closed), and a
      // constant non-closed would make the new post-close probe wrongly bucket a real close failed.
      "if (a.includes('issue view')) {",
      "  let alreadyClosed = false;",
      "  try { alreadyClosed = fs.readFileSync(" + JSON.stringify(marker) + ", 'utf8').split('\\n').some(l => /^issue close /.test(l)); } catch (_) {}",
      "  process.stdout.write((alreadyClosed ? 'closed' : 'open') + '\\n');",
      "  process.exit(0);",
      "}",
      "process.stdout.write('{}\\n');"
    ]);

    // Create a feature branch, push it upstream.
    G.git(tmp, ['checkout', '-b', 'workflow/issue-164m'], { encoding: 'utf8' });
    fs.writeFileSync(path.join(tmp, 'feature-164m.txt'), 'feature\n');
    G.git(tmp, ['add', 'feature-164m.txt'], { encoding: 'utf8' });
    G.git(tmp, ['commit', '-m', 'feat: issue 164m'], {
      encoding: 'utf8',
      env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@test.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@test.com' }
    });
    G.git(tmp, ['push', '-u', 'origin', 'workflow/issue-164m'], { encoding: 'utf8' });
    // Return to main so checkout in sink-merge works.
    G.git(tmp, ['checkout', 'main'], { encoding: 'utf8' });

    const mockJs = path.join(binDir, 'gh.js');
    const result = spawnSync(process.execPath, [
      sinkMergeScript,
      '--project', 'issue-164m',
      '--branch', 'workflow/issue-164m',
      '--issue', '164'
    ], {
      cwd: tmp,
      encoding: 'utf8',
      env: {
        ...process.env,
        KAOLA_WORKFLOW_OFFLINE: '0',
        KAOLA_GH_MOCK_SCRIPT: mockJs
      }
    });

    assert(
      result.status === 0,
      'sink-merge with mock should exit 0\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr
    );
    assert(
      fs.existsSync(marker),
      'KAOLA_GH_MOCK_SCRIPT shim must be invoked by sink-merge ghExec (marker file not written)'
    );
    const markerContent = fs.readFileSync(marker, 'utf8');
    assert(
      markerContent.includes('issue close') || markerContent.includes('issue edit'),
      'mock shim must be called with gh issue close or issue edit, got: ' + markerContent
    );
    const cwdContent = fs.readFileSync(cwdMarker, 'utf8');
    assert(
      cwdContent.split('\n').filter(Boolean).every(line => line.endsWith('\t' + tmp)),
      'mock shim must run from repo cwd ' + tmp + ', got: ' + cwdContent
    );

    // Also verify the receipt is emitted.
    const lines = result.stdout.trim().split('\n').filter(l => l.trim());
    const parsed = JSON.parse(lines[lines.length - 1]);
    assert(parsed.status === 'merged', 'online mock sink-merge receipt must have status:merged, got: ' + JSON.stringify(parsed));
    assert(
      parsed.closure_receipt.remote_issue_closed === 'closed',
      'mock issue close must yield remote_issue_closed:closed, got: ' + parsed.closure_receipt.remote_issue_closed
    );
    assert(
      parsed.closure_receipt.claim_label_removed === 'removed',
      'mock issue edit --remove-label must yield claim_label_removed:removed, got: ' + parsed.closure_receipt.claim_label_removed
    );
    console.log('testSinkMergeMockabilityAndReceipt: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(remotePath, { recursive: true, force: true }); } catch (_) {}
  }
}

// ===== issue #336: keep-open partial-close sink lane =====

// #336 full chain (OFFLINE) — exercises state-field derivation (NO --keep-open flag on finalize):
// an adaptive-complete fixture with issue_action: comment_keep_open is finalized + merge-sinked,
// asserting the roadmap source is PRESERVED on the branch HEAD/main and the receipts read kept_open.
function testKeepOpenMergeFullChain() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-keepopen-chain-')));
  const kwRoot = tmp + '.kw';
  try {
    initGitRepo(tmp);
    const binDir = path.join(tmp, 'bin');
    writeGhShimForStartup(binDir);

    const s860 = runClaimOnline(['startup', '--target-issue', '860'], tmp, binDir);
    assert(s860.claim === 'acquired', 'keep-open chain: startup 860 should acquire, got: ' + JSON.stringify(s860));
    const wt860 = s860.worktree_path;

    // Mark the run keep-open (durable field) + make it an adaptive-complete fixture. The live
    // state folder is in MAIN until worktree-finalize copies it into the worktree, so patch MAIN.
    const mainState = path.join(tmp, 'kaola-workflow', 'issue-860', 'workflow-state.md');
    let stContent = fs.readFileSync(mainState, 'utf8');
    stContent = stContent.replace(/^workflow_path:.*$/m, 'workflow_path: adaptive');
    stContent = stContent.trimEnd() + '\nissue_action: comment_keep_open\n';
    fs.writeFileSync(mainState, stContent);
    fs.writeFileSync(mainState, stContent);
    // #522: seed final-validation.md (consumer-mode repo — no package.json → final-validation gate).
    // Place it in MAIN's .cache now so worktree-finalize copies it to the worktree.
    const cache860 = path.join(tmp, 'kaola-workflow', 'issue-860', '.cache');
    fs.mkdirSync(cache860, { recursive: true });
    fs.writeFileSync(path.join(cache860, 'final-validation.md'), 'verdict: pass\nfindings_blocking: 0\n');

    // ADR 0018 §5: the roadmap-source setup (so the keep-open preservation had something to keep on
    // HEAD) stood here — retired along with archiveProjectDir's keep-open roadmap-source retention.

    // Feature commit.
    fs.writeFileSync(path.join(wt860, 'feature-860.txt'), 'feature\n');
    G.git(wt860, ['add', '-A'], { encoding: 'utf8' });
    G.git(wt860, ['commit', '-m', 'feat: issue 860 + roadmap source'], {
      encoding: 'utf8',
      env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@t.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@t.com' }
    });

    runClaimOnlineLastJson(['worktree-finalize', '--project', 'issue-860'], tmp, binDir);

    // #653: bind the consumer evidence LAST — after the feature commit + worktree-finalize, so the
    // recorded hash matches the candidate the finalize gate recomputes over the worktree.
    const cand860 = candidateHashFor(wt860, 'issue-860');
    fs.appendFileSync(path.join(wt860, 'kaola-workflow', 'issue-860', '.cache', 'final-validation.md'),
      'validated_candidate_hash: ' + cand860 + '\n');
    // #816: the finalize transaction mirrors MAIN → worktree, so main's copy of the consumer
    // evidence is the authoritative one at the gate. Keep the two roots consistent.
    fs.copyFileSync(path.join(wt860, 'kaola-workflow', 'issue-860', '.cache', 'final-validation.md'),
      path.join(cache860, 'final-validation.md'));

    // finalize --keep-worktree WITHOUT --keep-open: exercises state-field derivation (OFFLINE).
    // finalize writes the keep-open closure state and exits; the sink-merge below re-reads it.
    // spawn-class: durable-handoff
    const finResult = spawnSync(process.execPath, [
      claimScript, 'finalize', '--project', 'issue-860', '--keep-worktree'
    ], { cwd: wt860, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
    assert(finResult.status === 0, 'keep-open finalize must exit 0\nstderr: ' + finResult.stderr);
    const finJson = JSON.parse(finResult.stdout.trim().split('\n').filter(Boolean).pop());
    assert(finJson.issue_disposition === 'kept-open',
      '#336: state-field derivation must yield issue_disposition kept-open, got: ' + JSON.stringify(finJson.issue_disposition));
    // ADR 0018 §5: the receipt.roadmap_source_removed assertion and the "roadmap source must STILL
    // exist in the worktree" preservation check stood here — retired with the mechanism.
    assert(finJson.closure_receipt.remote_issue_closed === 'kept_open',
      '#336: finalize receipt remote_issue_closed must be kept_open, got: ' + JSON.stringify(finJson.closure_receipt.remote_issue_closed));
    assert(finJson.closure_invariants.ok === true,
      '#336: finalize closure_invariants.ok must be true, got: ' + JSON.stringify(finJson.closure_invariants));
    // #832: the archive resolves against MAIN's project root, never the linked worktree.
    const archived860 = fs.readFileSync(path.join(tmp, 'kaola-workflow', 'archive', 'issue-860', 'workflow-state.md'), 'utf8');
    assert(archived860.includes('last_result: closed_keep_open') && archived860.includes('issue_action: comment_keep_open'),
      '#336: archived state must carry closed_keep_open + issue_action: comment_keep_open');

    const featureHead = G.git(tmp, ['rev-parse', 'workflow/issue-860'], { encoding: 'utf8' }).stdout.trim();

    // sink-merge --keep-issue-open (OFFLINE).
    // sink-merge re-derives the kept-open receipt from the state the exited finalize wrote.
    // spawn-class: durable-handoff
    const smResult = spawnSync(process.execPath, [
      sinkMergeScript, '--project', 'issue-860', '--branch', 'workflow/issue-860', '--issue', '860', '--keep-issue-open'
    ], { cwd: wt860, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
    assert(smResult.status === 0, 'keep-open sink-merge must exit 0\nstdout: ' + smResult.stdout + '\nstderr: ' + smResult.stderr);
    const mainAfter = G.git(tmp, ['rev-parse', 'main'], { encoding: 'utf8' }).stdout.trim();
    assert(mainAfter === featureHead, '#336: main must advance to feature HEAD after keep-open sink-merge');
    assert(!fs.existsSync(wt860), '#336: keep-open sink-merge must remove the worktree');
    const branchList = G.git(tmp, ['branch', '--list', 'workflow/issue-860'], { encoding: 'utf8' }).stdout.trim();
    assert(branchList === '', '#336: keep-open sink-merge must delete the branch');
    // ADR 0018 §5: the "preserved roadmap source must be on main's HEAD" check and the receipt's
    // roadmap_source_removed assertion stood here — retired with the mechanism.
    const smJson = JSON.parse(smResult.stdout.trim().split('\n').filter(Boolean).pop());
    assert(smJson.closure_receipt.remote_issue_closed === 'kept_open',
      '#336: sink-merge receipt remote_issue_closed must be kept_open, got: ' + JSON.stringify(smJson.closure_receipt.remote_issue_closed));
    assert(smJson.closure_invariants.ok === true,
      '#336: sink-merge closure_invariants.ok must be true, got: ' + JSON.stringify(smJson.closure_invariants));
    const mainStatus = G.git(tmp, ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).stdout.trim();
    assert(mainStatus === '', '#336: main worktree must be clean after keep-open sink-merge, got: ' + mainStatus);
    console.log('testKeepOpenMergeFullChain: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
  }
}

// #336 — cmdFinalize MUST honor the --keep-issue-open FLAG as the sole keep-open signal.
// Regression for the inert-flag false-green: every prose surface passes ONLY
// $SINK_KEEP_OPEN_FLAG, and the crash-resume note re-runs with --keep-issue-open
// "since the live state is gone and state-field derivation is unavailable") dispatches
// --keep-issue-open, but claim.js parseArgs only recognized --keep-open — the flag was a no-op.
// This fixture OMITS the durable `issue_action` field, so the FLAG is the only thing that can
// produce a keep-open terminal. Pre-alias this exits with close-mode (roadmap_source_removed
// 'removed', remote_issue_closed not 'kept_open', invariants fail on roadmap-source-absent).
function testKeepOpenFinalizeFlagAlias() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-keepopen-flag-')));
  const kwRoot = tmp + '.kw';
  try {
    initGitRepo(tmp);
    const binDir = path.join(tmp, 'bin');
    writeGhShimForStartup(binDir);

    const s861 = runClaimOnline(['startup', '--target-issue', '861'], tmp, binDir);
    assert(s861.claim === 'acquired', 'keep-open flag: startup 861 should acquire, got: ' + JSON.stringify(s861));
    const wt861 = s861.worktree_path;

    // Adaptive-complete fixture, but DELIBERATELY no `issue_action` field — the flag is the
    // ONLY keep-open signal (mirrors the crash-resume path where state-derivation is unavailable).
    const mainState = path.join(tmp, 'kaola-workflow', 'issue-861', 'workflow-state.md');
    let stContent = fs.readFileSync(mainState, 'utf8');
    stContent = stContent.replace(/^workflow_path:.*$/m, 'workflow_path: adaptive');
    assert(!/^issue_action:/m.test(stContent),
      '#336: flag-alias fixture must NOT carry an issue_action field (the flag is the sole signal)');
    fs.writeFileSync(mainState, stContent);
    // #522: seed final-validation.md (consumer-mode repo — no package.json → final-validation gate).
    // Place it in MAIN's .cache now so worktree-finalize copies it to the worktree.
    const cache861 = path.join(tmp, 'kaola-workflow', 'issue-861', '.cache');
    fs.mkdirSync(cache861, { recursive: true });
    fs.writeFileSync(path.join(cache861, 'final-validation.md'), 'verdict: pass\nfindings_blocking: 0\n');

    // ADR 0018 §5: the roadmap-source setup stood here — retired along with archiveProjectDir's
    // keep-open roadmap-source retention.

    fs.writeFileSync(path.join(wt861, 'feature-861.txt'), 'feature\n');
    G.git(wt861, ['add', '-A'], { encoding: 'utf8' });
    G.git(wt861, ['commit', '-m', 'feat: issue 861'], {
      encoding: 'utf8',
      env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@t.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@t.com' }
    });

    runClaimOnlineLastJson(['worktree-finalize', '--project', 'issue-861'], tmp, binDir);

    // #653: bind the consumer evidence LAST (post feature commit + worktree-finalize).
    const cand861 = candidateHashFor(wt861, 'issue-861');
    fs.appendFileSync(path.join(wt861, 'kaola-workflow', 'issue-861', '.cache', 'final-validation.md'),
      'validated_candidate_hash: ' + cand861 + '\n');
    // #816: the finalize transaction mirrors MAIN → worktree; keep the two roots consistent.
    fs.copyFileSync(path.join(wt861, 'kaola-workflow', 'issue-861', '.cache', 'final-validation.md'),
      path.join(cache861, 'final-validation.md'));

    // finalize WITH the explicit --keep-issue-open flag, NO issue_action field → the flag must
    // drive the keep-open terminal entirely on its own (OFFLINE).
    const finResult = spawnSync(process.execPath, [
      claimScript, 'finalize', '--project', 'issue-861', '--keep-worktree', '--keep-issue-open'
    ], { cwd: wt861, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
    assert(finResult.status === 0, '#336: keep-open flag finalize must exit 0\nstderr: ' + finResult.stderr);
    const finJson = JSON.parse(finResult.stdout.trim().split('\n').filter(Boolean).pop());
    assert(finJson.issue_disposition === 'kept-open',
      '#336: --keep-issue-open FLAG must yield issue_disposition kept-open (flag was inert before the alias), got: ' + JSON.stringify(finJson.issue_disposition));
    // ADR 0018 §5: the receipt.roadmap_source_removed assertion and the "roadmap source preserved
    // in the worktree" check stood here — retired with the mechanism.
    assert(finJson.closure_receipt.remote_issue_closed === 'kept_open',
      '#336: --keep-issue-open FLAG must yield receipt remote_issue_closed kept_open, got: ' + JSON.stringify(finJson.closure_receipt.remote_issue_closed));
    assert(finJson.closure_invariants.ok === true,
      '#336: --keep-issue-open FLAG must yield ok closure invariants, got: ' + JSON.stringify(finJson.closure_invariants));
    // #832: the archive resolves against MAIN's project root, never the linked worktree.
    const archived861 = fs.readFileSync(path.join(tmp, 'kaola-workflow', 'archive', 'issue-861', 'workflow-state.md'), 'utf8');
    assert(archived861.includes('last_result: closed_keep_open'),
      '#336: --keep-issue-open FLAG must stamp last_result: closed_keep_open');
    console.log('testKeepOpenFinalizeFlagAlias: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
  }
}

// #336 ONLINE-mock "must not close" proof — the load-bearing test: sink-merge Step 8's actual
// gh-call branch is dead code under OFFLINE, so a token-only cheat would pass every OFFLINE test.
// This drives the REAL gh shim with OFFLINE=0 and asserts the call stream contains 'issue comment'
// (keep-open comment) + 'issue edit' (label removal) but NEVER 'issue close'.
function testSinkMergeKeepOpenOnlineMock() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sm-keepopen-mock-')));
  const remotePath = initGitRepoWithBareRemote(tmp);
  const marker = path.join(tmp, 'gh-mock-called.marker');
  try {
    const binDir = path.join(tmp, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    writeShimFiles(path.join(binDir, 'gh'), [
      "const fs = require('fs');",
      "const a = process.argv.slice(2).join(' ');",
      "fs.writeFileSync(" + JSON.stringify(marker) + ", a + '\\n', { flag: 'a' });",
      "process.stdout.write('{}\\n');"
    ]);
    G.git(tmp, ['checkout', '-b', 'workflow/issue-164k'], { encoding: 'utf8' });
    fs.writeFileSync(path.join(tmp, 'feature-164k.txt'), 'feature\n');
    G.git(tmp, ['add', 'feature-164k.txt'], { encoding: 'utf8' });
    G.git(tmp, ['commit', '-m', 'feat: issue 164k'], {
      encoding: 'utf8',
      env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@t.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@t.com' }
    });
    G.git(tmp, ['push', '-u', 'origin', 'workflow/issue-164k'], { encoding: 'utf8' });
    G.git(tmp, ['checkout', 'main'], { encoding: 'utf8' });

    const mockJs = path.join(binDir, 'gh.js');
    const result = spawnSync(process.execPath, [
      sinkMergeScript, '--project', 'issue-164k', '--branch', 'workflow/issue-164k', '--issue', '164', '--keep-issue-open'
    ], {
      cwd: tmp,
      encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_GH_MOCK_SCRIPT: mockJs }
    });
    assert(result.status === 0, '#336: online-mock keep-open sink-merge must exit 0\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(fs.existsSync(marker), '#336: gh mock shim must be invoked');
    const markerContent = fs.readFileSync(marker, 'utf8');
    assert(markerContent.includes('issue comment'),
      '#336: keep-open online-mock must post an issue comment, marker: ' + markerContent);
    assert(markerContent.includes('issue edit'),
      '#336: keep-open online-mock must still remove the claim label (issue edit), marker: ' + markerContent);
    assert(!markerContent.includes('issue close'),
      '#336: keep-open online-mock must NOT close the issue, marker: ' + markerContent);
    const parsed = JSON.parse(result.stdout.trim().split('\n').filter(Boolean).pop());
    assert(parsed.closure_receipt.remote_issue_closed === 'kept_open',
      '#336: keep-open receipt remote_issue_closed must be kept_open, got: ' + parsed.closure_receipt.remote_issue_closed);
    assert(parsed.closure_receipt.claim_label_removed === 'removed',
      '#336: keep-open receipt claim_label_removed must be removed, got: ' + parsed.closure_receipt.claim_label_removed);
    // ADR 0018 §5: the receipt.roadmap_source_removed assertion stood here — retired with the field.
    console.log('testSinkMergeKeepOpenOnlineMock: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(remotePath, { recursive: true, force: true }); } catch (_) {}
  }
}

// #517 — post-push keep-open reopen: when --keep-issue-open is set and the forge auto-closed the
// issue after push (a "close/fix/resolve #N" keyword in the commit body), sink-merge probes the
// live issue state post-push, reopens it, and records remote_issue_closed:'reopened_after_autoclose'.
// Uses a gh mock that returns "closed" for the post-push probe to simulate the auto-close.
function testSinkMergePostPushReopenOnMock() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sm-517-reopen-')));
  const remotePath = initGitRepoWithBareRemote(tmp);
  const marker = path.join(tmp, 'gh-mock-calls.log');
  try {
    const binDir = path.join(tmp, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    // gh mock: returns "closed" for issue view (simulating GitHub auto-close post-push),
    // accepts issue reopen (no-op), and handles repo view + issue edit (label removal).
    writeShimFiles(path.join(binDir, 'gh'), [
      "'use strict';",
      "const fs = require('fs');",
      "const a = process.argv.slice(2).join(' ');",
      "fs.appendFileSync(" + JSON.stringify(marker) + ", a + '\\n');",
      "if (a.includes('repo view')) { process.stdout.write(JSON.stringify({owner:{login:'test'},name:'repo'}) + '\\n'); process.exit(0); }",
      "if (a.includes('issue view')) { process.stdout.write('closed\\n'); process.exit(0); }",
      "if (a.includes('issue reopen') || a.includes('issue edit') || a.includes('issue comment') || a.includes('issue close')) { process.stdout.write('{}\\n'); process.exit(0); }",
      "process.stdout.write('{}\\n'); process.exit(0);"
    ]);

    const gitEnv = { ...process.env, ...GIT_ISOLATION_ENV,
      GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@t' };
    G.git(tmp, ['push', 'origin', 'main'], { encoding: 'utf8', env: gitEnv });

    // Feature branch with deliverable.
    G.git(tmp, ['checkout', '-b', 'workflow/issue-517'], { encoding: 'utf8', env: gitEnv });
    fs.writeFileSync(path.join(tmp, 'feature-517.txt'), 'feature\n');
    G.git(tmp, ['add', 'feature-517.txt'], { encoding: 'utf8', env: gitEnv });
    G.git(tmp, ['commit', '-m', 'feat: issue 517'], { encoding: 'utf8', env: gitEnv });
    G.git(tmp, ['push', '-u', 'origin', 'workflow/issue-517'], { encoding: 'utf8', env: gitEnv });

    // Archive state (finalize ran first on keep-open lane).
    const archiveDir = path.join(tmp, 'kaola-workflow', 'archive', 'issue-517');
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, 'workflow-state.md'),
      'status: closed\nstep: complete\nissue_number: 517\n\n## Sink\nbranch: workflow/issue-517\nissue_number: 517\nsink: merge\nissue_action: comment_keep_open\n');
    G.git(tmp, ['add', '-A'], { encoding: 'utf8', env: gitEnv });
    G.git(tmp, ['commit', '-m', 'chore: finalize keep-open 517'], { encoding: 'utf8', env: gitEnv });

    G.git(tmp, ['checkout', 'main'], { encoding: 'utf8', env: gitEnv });

    const mockJs = path.join(binDir, 'gh.js');
    const result = spawnSync(process.execPath, [
      sinkMergeScript, '--sink',
      '--project', 'issue-517', '--branch', 'workflow/issue-517', '--issue', '517', '--keep-issue-open'
    ], {
      cwd: tmp,
      encoding: 'utf8',
      env: { ...gitEnv, KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_GH_MOCK_SCRIPT: mockJs }
    });

    assert(result.status === 0, '#517: keep-open sink with auto-close probe must exit 0\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);

    const parsed = JSON.parse(result.stdout.trim().split('\n').filter(Boolean).pop());
    assert(parsed.status === 'sinked', '#517: result must be status:sinked, got ' + JSON.stringify(parsed));
    assert(parsed.receipt && parsed.receipt.remote_issue_closed === 'reopened_after_autoclose',
      '#517: receipt.remote_issue_closed must be reopened_after_autoclose, got ' + JSON.stringify(parsed.receipt && parsed.receipt.remote_issue_closed));

    // Verify the gh mock was called with issue reopen (the forge reopen happened).
    const calls = fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8') : '';
    assert(calls.includes('issue reopen'),
      '#517: gh mock must have been called with issue reopen, got: ' + calls);

    console.log('testSinkMergePostPushReopenOnMock: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(remotePath, { recursive: true, force: true }); } catch (_) {}
  }
}

// #508 — bundle finalize on merge-lane (--keep-worktree): when all bundle members probe as OPEN
// online, the close is deferred to sink-merge and remote_issue_closed must be 'close_pending' (not
// 'partial') and closed_issues must be []. This locks the token-vs-list consistency fix: reporting
// 'partial' while closed_issues=[] was a disagreement — the token claimed "some closed" while the
// list was empty.
function testBundleFinalizeAllOpenCloseIsPending() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-508-bundle-fin-')));
  const binDir = path.join(tmp, 'bin');
  const logFile = path.join(tmp, 'gh-calls.log');
  const project = 'bundle-508-61-62';
  try {
    initGitRepo(tmp);
    // Bundle state file: merge-lane (sink: merge) so finalize runs with --keep-worktree semantics.
    const stateLines = [
      '# Kaola-Workflow State', '',
      '## Project', 'name: ' + project, 'status: active', '',
      '## Current Position', 'phase: adaptive', 'workflow_path: adaptive',
      'step: complete', 'next_command: /kaola-workflow-finalize ' + project, '',
      '## Last Evidence', 'last_command: startup', 'last_result: folder_claimed', '',
      '## Last Updated', new Date().toISOString(), '',
      '## Sink', 'branch: workflow/' + project,
      'issue_number: 61',
      'issue_numbers: 61,62',
      'bundle_id: ' + project,
      'closure_policy: all_or_nothing',
      'sink: merge', 'run_posture: in-place', ''
    ].join('\n');
    writeProject(tmp, project, { 'workflow-state.md': stateLines });

    // Plant roadmap sources for both members.
    seedClassifierVerdictFromBody(61, '');
    seedClassifierVerdictFromBody(62, '');

    // gh mock: both members probe as OPEN (not closed yet — close deferred to sink-merge).
    writeBundleGhMockScript(binDir, { logFile, openIssues: [61, 62] });

    // Seed a minimal frozen adaptive plan + passing gate (finalize refuses a plan-absent run).
    seedAdaptiveFinalizeFixture(tmp, project);
    // Run finalize WITH --keep-worktree (merge-lane: sink-merge handles closing).
    const result = spawnSync(process.execPath, [claimScript, 'finalize', '--project', project, '--keep-worktree'], {
      cwd: tmp,
      encoding: 'utf8',
      timeout: 60000,
      env: Object.assign({}, process.env, {
        KAOLA_WORKFLOW_OFFLINE: '0',
        KAOLA_WORKTREE_NATIVE: '0',
        KAOLA_GH_MOCK_SCRIPT: path.join(binDir, 'gh.js'),
      })
    });

    assert(result.status === 0,
      '#508 finalize: exit 0 expected, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);

    const lines = (result.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
    assert(lines.length > 0, '#508 finalize: expected JSON output');
    const out = JSON.parse(lines[lines.length - 1]);
    assert(out.status === 'closed', '#508 finalize: status must be closed, got ' + JSON.stringify(out.status));

    const receipt = out.closure_receipt;
    assert(receipt != null, '#508 finalize: closure_receipt must be present');
    assert(receipt.remote_issue_closed === 'close_pending',
      '#508 finalize: remote_issue_closed must be close_pending (all members open, deferred to sink-merge), got ' + JSON.stringify(receipt.remote_issue_closed));
    assert(Array.isArray(receipt.closed_issues) && receipt.closed_issues.length === 0,
      '#508 finalize: closed_issues must be [] (no pre-sink remote close), got ' + JSON.stringify(receipt.closed_issues));

    // Verify no pre-sink remote issue close was called: both members must remain in open_issues.
    // (writeBundleGhMockScript does not log 'issue close' calls, so a negative-log check would be
    // vacuous; asserting receipt.open_issues = [61,62] is the real positive lock — any pre-sink close
    // would move a member out of openIssues and into closedIssues, shrinking this array.)
    assert(Array.isArray(receipt.open_issues) && receipt.open_issues.length === 2,
      '#508 finalize: open_issues must contain both members (no pre-sink close fired), got ' + JSON.stringify(receipt.open_issues));
    assert(receipt.open_issues.includes(61) && receipt.open_issues.includes(62),
      '#508 finalize: open_issues must include both 61 and 62, got ' + JSON.stringify(receipt.open_issues));

  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testBundleFinalizeAllOpenCloseIsPending: PASSED');
}

// #336 — --keep-issue-open requires --issue (typed refusal, non-zero exit).
function testSinkMergeKeepOpenRequiresIssue() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sm-keepopen-noissue-')));
  try {
    initGitRepo(tmp);
    // A flag-dependency refusal: --keep-issue-open without --issue must map to a non-zero exit
    // and a stderr line naming the missing flag. That mapping is the assertion.
    // spawn-class: cli-contract
    const result = spawnSync(process.execPath, [
      sinkMergeScript, '--project', 'issue-700', '--branch', 'workflow/issue-700', '--keep-issue-open'
    ], { cwd: tmp, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
    assert(result.status !== 0, '#336: --keep-issue-open without --issue must exit non-zero');
    assert(/--keep-issue-open requires --issue/.test(result.stderr),
      '#336: refusal message must explain --keep-issue-open requires --issue, got: ' + result.stderr);
    console.log('testSinkMergeKeepOpenRequiresIssue: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// #336 — archived-state guard (OFFLINE): sink-merge WITHOUT the flag must honor an archived
// issue_action: comment_keep_open and record kept_open + emit the honoring warning.
function testSinkMergeKeepOpenArchivedStateGuard() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sm-keepopen-guard-')));
  try {
    initGitRepo(tmp);
    // Feature branch with a non-workflow change so the all-workflow refusal does not fire.
    G.git(tmp, ['checkout', '-b', 'workflow/issue-545'], { encoding: 'utf8' });
    fs.writeFileSync(path.join(tmp, 'feature-545.txt'), 'feature\n');
    G.git(tmp, ['add', 'feature-545.txt'], { encoding: 'utf8' });
    G.git(tmp, ['commit', '-m', 'feat: issue 545'], { encoding: 'utf8' });
    G.git(tmp, ['checkout', 'main'], { encoding: 'utf8' });
    // Archived state carrying the keep-open field (the FF merge would put it on HEAD; here we
    // place it directly so postMergeCleanup can read it).
    const archiveDir = path.join(tmp, 'kaola-workflow', 'archive', 'issue-545');
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, 'workflow-state.md'),
      'status: closed\nstep: complete\nissue_number: 545\n\n## Sink\nbranch: workflow/issue-545\nissue_number: 545\nsink: merge\nissue_action: comment_keep_open\n');

    const result = spawnSync(process.execPath, [
      sinkMergeScript, '--project', 'issue-545', '--branch', 'workflow/issue-545', '--issue', '545'
    ], { cwd: tmp, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
    assert(result.status === 0, '#336: archived-guard sink-merge must exit 0\nstderr: ' + result.stderr);
    assert(/honoring archived issue_action: comment_keep_open/.test(result.stderr),
      '#336: archived-guard must emit the honoring warning, got: ' + result.stderr);
    const parsed = JSON.parse(result.stdout.trim().split('\n').filter(Boolean).pop());
    assert(parsed.closure_receipt.remote_issue_closed === 'kept_open',
      '#336: archived-guard receipt remote_issue_closed must be kept_open (flag not passed), got: ' + parsed.closure_receipt.remote_issue_closed);
    console.log('testSinkMergeKeepOpenArchivedStateGuard: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// testClosureAuditKeepOpenExclusion and testKeepOpenInvariantUnit stood here. ADR 0018 §5 retired
// both of their subjects directly: the former pinned closure-audit's stale_roadmap_sources
// archive_closed/keep-open exclusion (slice 4 of this retirement, kaola-workflow-closure-audit.js);
// the latter pinned checkClosureInvariants' keep-open-roadmap-preserved invariant, removed from
// kaola-workflow-closure-contract.js's CLOSURE_INVARIANTS in the same retirement. Deleted with the
// mechanism each one pinned.

// #336 — sink-pr keep-open refusal: a live OR archived state carrying issue_action:
// comment_keep_open must make sink-pr refuse (merge-sink-only); without the field it exits 0.
function testSinkPrKeepOpenRefusal() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sinkpr-keepopen-')));
  try {
    initGitRepo(tmp);
    const runSinkPr = (project) => spawnSync(process.execPath, [
      sinkPrScript, '--project', project, '--branch', 'workflow/' + project, '--issue', '900'
    ], { cwd: tmp, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });

    // (a) LIVE state carrying the field → refuse.
    const liveDir = path.join(tmp, 'kaola-workflow', 'issue-900a');
    fs.mkdirSync(liveDir, { recursive: true });
    fs.writeFileSync(path.join(liveDir, 'workflow-state.md'),
      'status: active\n\n## Sink\nsink: pr\nissue_action: comment_keep_open\n');
    const liveResult = runSinkPr('issue-900a');
    assert(liveResult.status !== 0, '#336: sink-pr must refuse a live keep-open project');
    assert(/merge-sink-only/.test(liveResult.stderr),
      '#336: sink-pr live refusal must say merge-sink-only, got: ' + liveResult.stderr);

    // (b) ARCHIVED state carrying the field (the real exit-3 fallback shape) → refuse.
    const archDir = path.join(tmp, 'kaola-workflow', 'archive', 'issue-900b');
    fs.mkdirSync(archDir, { recursive: true });
    fs.writeFileSync(path.join(archDir, 'workflow-state.md'),
      'status: closed\nstep: complete\nissue_number: 900\n\n## Sink\nsink: merge\nissue_action: comment_keep_open\n');
    const archResult = runSinkPr('issue-900b');
    assert(archResult.status !== 0, '#336: sink-pr must refuse an archived keep-open project');
    assert(/merge-sink-only/.test(archResult.stderr),
      '#336: sink-pr archived refusal must say merge-sink-only, got: ' + archResult.stderr);

    // Regression: without the field, OFFLINE sink-pr exits 0.
    const cleanDir = path.join(tmp, 'kaola-workflow', 'issue-900c');
    fs.mkdirSync(cleanDir, { recursive: true });
    fs.writeFileSync(path.join(cleanDir, 'workflow-state.md'),
      'status: active\n\n## Sink\nsink: pr\n');
    const cleanResult = runSinkPr('issue-900c');
    assert(cleanResult.status === 0,
      '#336: a non-keep-open sink-pr must still exit 0 OFFLINE\nstderr: ' + cleanResult.stderr);
    console.log('testSinkPrKeepOpenRefusal: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testSinkMergeCloseFailureWarning() {
  // #619(1): a failed issue close on the LEGACY (non---sink) path must fail CLOSED — mirroring the
  // #497 fix already on the --sink transaction's closure step. Pre-fix, sink-merge emitted a stderr
  // warning but still reported status:'merged' + exit 0 (the fail-open bug); post-fix it emits a
  // typed sink_incomplete refusal and exits non-zero, while the (irreversible) merge itself still
  // stands and label removal still succeeds.
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sm-closefail-')));
  const remotePath = initGitRepoWithBareRemote(tmp);
  try {
    const binDir = path.join(tmp, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    // Shim: exit 1 for `issue close`, exit 0 for everything else (including `issue view`, which
    // returns '{}' — not 'closed' — so probeIssueClosed's catch-branch re-probe also reports open).
    writeShimFiles(path.join(binDir, 'gh'), [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue close')) { process.stderr.write('gh: simulated close failure\\n'); process.exit(1); }",
      "process.stdout.write('{}\\n');"
    ]);

    G.git(tmp, ['checkout', '-b', 'workflow/issue-168f'], { encoding: 'utf8' });
    fs.writeFileSync(path.join(tmp, 'feature-168f.txt'), 'feature\n');
    G.git(tmp, ['add', 'feature-168f.txt'], { encoding: 'utf8' });
    G.git(tmp, ['commit', '-m', 'feat: issue 168f'], {
      encoding: 'utf8',
      env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@test.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@test.com' }
    });
    G.git(tmp, ['push', '-u', 'origin', 'workflow/issue-168f'], { encoding: 'utf8' });
    G.git(tmp, ['checkout', 'main'], { encoding: 'utf8' });

    const mockJs = path.join(binDir, 'gh.js');
    const result = spawnSync(process.execPath, [
      sinkMergeScript,
      '--project', 'issue-168f',
      '--branch', 'workflow/issue-168f',
      '--issue', '168'
    ], {
      cwd: tmp,
      encoding: 'utf8',
      env: {
        ...process.env,
        KAOLA_WORKFLOW_OFFLINE: '0',
        KAOLA_GH_MOCK_SCRIPT: mockJs
      }
    });

    assert(
      result.status !== 0,
      '#619(1): sink-merge must exit non-zero when the issue close genuinely fails (fail-closed), got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr
    );
    const lines = result.stdout.trim().split('\n').filter(l => l.trim());
    const parsed = JSON.parse(lines[lines.length - 1]);
    assert(
      parsed.result === 'refuse' && parsed.reason === 'sink_incomplete' && parsed.step === 'closure',
      '#619(1): refusal must be result:refuse reason:sink_incomplete step:closure, got: ' + JSON.stringify(parsed)
    );
    assert(
      parsed.remote_issue_closed === 'failed',
      '#619(1): refusal must carry remote_issue_closed:failed, got: ' + JSON.stringify(parsed.remote_issue_closed)
    );
    assert(
      parsed.closure_receipt && parsed.closure_receipt.remote_issue_closed === 'failed',
      '#619(1): embedded closure_receipt.remote_issue_closed must still be "failed", got: ' + JSON.stringify(parsed.closure_receipt)
    );
    assert(
      parsed.closure_receipt && parsed.closure_receipt.claim_label_removed === 'removed',
      '#619(1): claim_label_removed must be "removed" (negative control — label removal is independent of the close outcome), got: ' + JSON.stringify(parsed.closure_receipt)
    );
    console.log('testSinkMergeCloseFailureWarning: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(remotePath, { recursive: true, force: true }); } catch (_) {}
  }
}

// #619(2): a `gh issue close` that exits 0 does not PROVE the issue is closed — a rare forge/API
// race can leave it open. The old code recorded success on the exit code ALONE (the post-close
// probe only ran in the catch branch), so this exact "exit-0-but-still-open" case was recorded as
// remote_issue_closed:'closed' even though the issue never actually closed. This test's mock makes
// `issue close` succeed (exit 0) while `issue view` ALWAYS reports 'open' — proving the fix probes
// the live state on the success path too, buckets it 'failed', and (via #619(1)) fails the whole
// sink closed rather than reporting a false status:'merged'.
function testSinkMergeCloseExitZeroButStillOpenFailsClosed() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sm-closezeroopen-')));
  const remotePath = initGitRepoWithBareRemote(tmp);
  try {
    const binDir = path.join(tmp, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    // Shim: `issue close` succeeds (exit 0, no real effect); `issue view` ALWAYS reports open —
    // simulating a close call that reported success but never actually took effect on the forge.
    writeShimFiles(path.join(binDir, 'gh'), [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue view')) { process.stdout.write('open\\n'); process.exit(0); }",
      "if (a.includes('issue close')) { process.stdout.write('\\n'); process.exit(0); }",
      "process.stdout.write('{}\\n');"
    ]);

    G.git(tmp, ['checkout', '-b', 'workflow/issue-169f'], { encoding: 'utf8' });
    fs.writeFileSync(path.join(tmp, 'feature-169f.txt'), 'feature\n');
    G.git(tmp, ['add', 'feature-169f.txt'], { encoding: 'utf8' });
    G.git(tmp, ['commit', '-m', 'feat: issue 169f'], {
      encoding: 'utf8',
      env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@test.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@test.com' }
    });
    G.git(tmp, ['push', '-u', 'origin', 'workflow/issue-169f'], { encoding: 'utf8' });
    G.git(tmp, ['checkout', 'main'], { encoding: 'utf8' });

    const mockJs = path.join(binDir, 'gh.js');
    const result = spawnSync(process.execPath, [
      sinkMergeScript,
      '--project', 'issue-169f',
      '--branch', 'workflow/issue-169f',
      '--issue', '169'
    ], {
      cwd: tmp,
      encoding: 'utf8',
      env: {
        ...process.env,
        KAOLA_WORKFLOW_OFFLINE: '0',
        KAOLA_GH_MOCK_SCRIPT: mockJs
      }
    });

    assert(
      result.status !== 0,
      '#619(2): an exit-0-but-still-open close must fail the sink closed, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr
    );
    const lines = result.stdout.trim().split('\n').filter(l => l.trim());
    const parsed = JSON.parse(lines[lines.length - 1]);
    assert(
      parsed.result === 'refuse' && parsed.reason === 'sink_incomplete',
      '#619(2): refusal must be result:refuse reason:sink_incomplete, got: ' + JSON.stringify(parsed)
    );
    assert(
      parsed.remote_issue_closed === 'failed',
      '#619(2): an exit-0-but-still-open close must be bucketed remote_issue_closed:failed (not closed), got: ' + JSON.stringify(parsed.remote_issue_closed)
    );
    assert(
      result.stderr.includes('still OPEN'),
      '#619(2): a diagnostic warning must name the exit-0-but-still-open condition, got stderr: ' + result.stderr
    );
    console.log('testSinkMergeCloseExitZeroButStillOpenFailsClosed: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(remotePath, { recursive: true, force: true }); } catch (_) {}
  }
}

function testSinkMergeSkipsArchivedProjectPhantom() {
  // Regression test for issue #216: postMergeCleanup in sink-merge unconditionally calls
  // fs.mkdirSync(kaola-workflow/{project}/.cache) and writes sink-fallback.json when a
  // classified merge-impossible error occurs, even when the project was already archived.
  // This resurrects the live folder (a "phantom active folder").
  //
  // RED discriminator: fs.existsSync(liveDir) is TRUE in buggy code because mkdirSync
  // creates kaola-workflow/issue-850/.cache/, making liveDir exist.
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sm-phantom-')));
  const remotePath = initGitRepoWithBareRemote(tmp);
  try {
    const binDir = path.join(tmp, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    // GH mock: return OK for all calls (they are not reached on the merge-impossible path,
    // but the mock is wired so sink-merge doesn't try the real `gh` binary).
    writeShimFiles(path.join(binDir, 'gh'), [
      "process.stdout.write('{}\\n');"
    ]);

    // Construct archived state directly on the feature branch — do NOT create a live
    // folder on disk (untracked files survive git reset --hard and would corrupt the test).
    G.git(tmp, ['checkout', '-b', 'workflow/issue-850'], { encoding: 'utf8' });
    const archiveDir = path.join(tmp, 'kaola-workflow', 'archive', 'issue-850');
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, 'workflow-state.md'), '# archived\n');
    fs.writeFileSync(path.join(archiveDir, 'phase6-summary.md'), '# summary\n');
    // #264 AC7: the branch must carry a real (non-kaola-workflow/) implementation file, otherwise
    // the new sink-merge AC7 guard (assertBranchHasNonWorkflowChanges) refuses a workflow-only branch
    // with exit 1 before the merge-impossible path is reached. A genuine archived project carried
    // implementation during its original run, so this is the realistic fixture. Root-level so it is
    // outside kaola-workflow/ and does not perturb the wasArchived (liveDir) discriminator below.
    fs.writeFileSync(path.join(tmp, 'impl-850.txt'), 'implementation for issue 850\n');
    G.git(tmp, ['add', '-A', 'kaola-workflow/', 'impl-850.txt'], { encoding: 'utf8' });
    G.git(tmp, ['commit', '-m', 'chore: archive issue-850'], {
      encoding: 'utf8',
      env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@test.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@test.com' }
    });
    G.git(tmp, ['push', '-u', 'origin', 'workflow/issue-850'], { encoding: 'utf8' });
    // Return to main — origin/main must NOT have the archive (so reset --hard origin/main wipes it)
    G.git(tmp, ['checkout', 'main'], { encoding: 'utf8' });

    // Hard gate: verify git state is correct before invoking sink-merge
    const catArchive = G.git(tmp, ['cat-file', '-e', 'workflow/issue-850:kaola-workflow/archive/issue-850/workflow-state.md'], { encoding: 'utf8' });
    const catLive = G.git(tmp, ['cat-file', '-e', 'workflow/issue-850:kaola-workflow/issue-850/workflow-state.md'], { encoding: 'utf8' });
    assert(catArchive.status === 0, 'SETUP ERROR: git state not correct for phantom-folder test — archive not committed on feature branch');
    assert(catLive.status !== 0, 'SETUP ERROR: git state not correct for phantom-folder test — live path still on feature branch');

    const liveDir = path.join(tmp, 'kaola-workflow', 'issue-850');
    // Pre-invocation gate: confirm live dir does not exist before running sink-merge
    assert(!fs.existsSync(liveDir), 'SETUP ERROR: live folder exists before sink-merge — untracked leftover would corrupt the test');

    const mockJs = path.join(binDir, 'gh.js');
    const result = spawnSync(process.execPath, [
      sinkMergeScript,
      '--project', 'issue-850',
      '--branch', 'workflow/issue-850',
      '--issue', '850'
    ], {
      cwd: tmp,
      encoding: 'utf8',
      env: {
        ...process.env,
        KAOLA_WORKFLOW_OFFLINE: '0',
        KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE: 'branch_protected',
        KAOLA_GH_MOCK_SCRIPT: mockJs
      }
    });

    // exit 3 expected in both buggy and fixed worlds (not the discriminator, but verify it)
    assert(
      result.status === 3,
      'sink-merge must exit 3 on merge-impossible, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr
    );

    // PRIMARY RED/GREEN discriminator: buggy code recreates liveDir via mkdirSync; fixed code skips it
    assert(
      !fs.existsSync(liveDir),
      'phantom folder must NOT exist after merge-impossible on archived project, but got: ' + liveDir + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr
    );

    // No receipt file written inside phantom dir
    assert(
      !fs.existsSync(path.join(liveDir, '.cache', 'sink-fallback.json')),
      'sink-fallback.json must NOT be written for an archived project'
    );

    // main must be clean — reset --hard must have run, not been skipped
    const aheadCount = G.git(tmp, ['rev-list', '--count', 'origin/main..main'], { encoding: 'utf8' }).stdout.trim();
    assert(aheadCount === '0', 'local main must be at origin/main after archived exit-3, got ahead=' + aheadCount);

    // Repo must be restored to main branch
    const headBranch = G.git(tmp, ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    assert(
      headBranch === 'main',
      'repo must be restored to main after merge-impossible, got: ' + headBranch
    );

    // stderr must mention project archived (GREEN-only: this assertion is expected to fail in RED
    // because the current code writes the receipt without checking archive status)
    assert(
      result.stderr.includes('project archived'),
      'sink-merge stderr must mention "project archived" for archived project, got stderr: ' + result.stderr
    );

    console.log('testSinkMergeSkipsArchivedProjectPhantom: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(remotePath, { recursive: true, force: true }); } catch (_) {}
  }
}

// ===== issue-165: closure-audit (kaola-workflow-closure-audit.js) =====

function closureAuditShim(binDir, lines) {
  fs.mkdirSync(binDir, { recursive: true });
  writeShimFiles(path.join(binDir, 'gh'), lines);
}

function testClosureAuditOfflineRemoteClassesSkipped() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-offline-'));
  try {
    initGitRepo(tmp);
    const result = runClosureAuditOffline([], tmp);
    assert(result.dry_run === true, 'offline audit dry_run must be true, got: ' + result.dry_run);
    assert(result.offline === true, 'offline audit offline must be true, got: ' + result.offline);
    assert(
      result.drift.stale_in_progress_labels === 'skipped_offline',
      'offline: stale_in_progress_labels must be "skipped_offline", got: ' + JSON.stringify(result.drift.stale_in_progress_labels)
    );
    assert(
      result.drift.unarchived_pr_folders === 'skipped_offline',
      'offline: unarchived_pr_folders must be "skipped_offline", got: ' + JSON.stringify(result.drift.unarchived_pr_folders)
    );
    assert(
      !('unresolved_closed_state' in result.drift),
      'offline: unresolved_closed_state must be absent when offline (omit-when-empty), got: ' + JSON.stringify(result.drift.unresolved_closed_state)
    );
    console.log('testClosureAuditOfflineRemoteClassesSkipped: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// testClosureAuditClosedRemoteRoadmapSource, testClosureAuditArchiveClosedDrift and
// testClosureAuditDedupRoadmapAndArchive stood here — all three pinned stale_roadmap_sources
// (closed_remote / archive_closed / the dedup-and-priority rule between them), retired from
// kaola-workflow-closure-audit.js in slice 4 of ADR 0018 §5. Deleted with the mechanism.

// ---------------------------------------------------------------------------
// #832 — closure-audit must prove archive CONTENT, not existence.
//
// The incident left `kaola-workflow/archive/<project>/` as a bare `.cache/` skeleton (the sink's own
// receipt writer mkdir-s that path), and the audit passed: archiveClosedIssues `continue`s on ANY
// read error, so an archive with no workflow-state.md simply drops out of the closed set and
// produces no finding. #676's verifyArchiveComplete cannot cover this — it is SOURCE-relative and
// runs at copy time, before the loss.
//
// The required set is derived from the archive's OWN record, never a blanket demand (a blanket
// "plan + summary + evidence" rule flags 76 of the 184 plan-bearing closed archives in this repo,
// which is noise, not drift). It is now exactly ONE file: workflow-state.md, the identity anchor —
// #676's unconditional rule. The two demands that used to stand beside it (workflow-plan.md when the
// state named a plan hash, and one `.cache/<id>.md` per `complete` ledger row) went with the ledger
// they were derived from, so a plan-hash-bearing archive is obliged to hold nothing but its anchor.
// Fixture (v) pins that case: it is the shape on which two forge ports silently disagreed with this
// script, and the shape no suite in any edition used to build.
// Report-only in both modes: an incomplete archive is unrepairable, so --execute must never touch it.
// ---------------------------------------------------------------------------
function testClosureAuditArchiveContentDrift832() {
  // The SHIPPED required set, read from the script rather than inferred from the arms below. The
  // behavioural fixtures can only see a demand for a file they omit; this sees any second required
  // name the moment it is written, conditional or not — which is the drift that survived unnoticed.
  const auditSrc832 = fs.readFileSync(closureAuditScript, 'utf8');
  const requiredFn832 = auditSrc832.match(/function archiveRequiredContent\(dir\) \{([\s\S]*?)\n\}/);
  assert(requiredFn832,
    '#832: archiveRequiredContent must be readable from ' + closureAuditScript);
  const shippedRequired832 = Array.from(
    new Set((requiredFn832[1].match(/'[^']*\.md'/g) || []).map(s => s.slice(1, -1)))
  ).sort();
  assert(shippedRequired832.length === 1 && shippedRequired832[0] === 'workflow-state.md',
    '#832: the required set is exactly the identity anchor. A second name here is a demand no fixture '
      + 'below omits, so nothing else would see it — the exact way a workflow-plan.md demand outlived '
      + 'its derivation in two forge ports; got ' + JSON.stringify(shippedRequired832));

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-archive-content-832-'));
  try {
    initGitRepo(tmp);
    const archiveBase = path.join(tmp, 'kaola-workflow', 'archive');
    const plan = [
      '# Workflow Plan', '', '## Meta', 'plan_form: spine', 'labels: enhancement', '',
      '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape |',
      '|---|---|---|---|---|---|',
      '| n1 | tdd-guide | — | lib/x.js | 1 | sequence |',
      '| n2 | code-reviewer | n1 | — | 1 | sequence |',
      '| n3 | finalize | n2 | — | 1 | sequence |', '',
      '## Node Ledger', '', '| id | status |', '|---|---|',
      '| n1 | complete |', '| n2 | complete |', '| n3 | n/a |', '',
    ].join('\n');

    // (i) the incident shape: an archive dir holding nothing but an empty .cache/ skeleton.
    fs.mkdirSync(path.join(archiveBase, 'issue-8324', '.cache'), { recursive: true });

    // (ii) evidence-gutted: state + plan whose ledger PROVES n1/n2 recorded evidence, but the
    //      .cache/ files are gone (the worktree that held them was deleted).
    const gutted = path.join(archiveBase, 'issue-8325');
    fs.mkdirSync(path.join(gutted, '.cache'), { recursive: true });
    fs.writeFileSync(path.join(gutted, 'workflow-state.md'),
      'status: closed\nstep: complete\nissue_number: 8325\nplan_hash: ' + 'a'.repeat(64) + '\n');
    fs.writeFileSync(path.join(gutted, 'workflow-plan.md'), plan);
    fs.writeFileSync(path.join(gutted, 'finalization-summary.md'), '# Finalization Summary\n');

    // (iii) COMPLETE — must produce no finding (the over-report guard).
    const complete = path.join(archiveBase, 'issue-8326');
    fs.mkdirSync(path.join(complete, '.cache'), { recursive: true });
    fs.writeFileSync(path.join(complete, 'workflow-state.md'),
      'status: closed\nstep: complete\nissue_number: 8326\nplan_hash: ' + 'b'.repeat(64) + '\n');
    fs.writeFileSync(path.join(complete, 'workflow-plan.md'), plan);
    fs.writeFileSync(path.join(complete, 'finalization-summary.md'), '# Finalization Summary\n');
    fs.writeFileSync(path.join(complete, '.cache', 'n1.md'), 'binding: n1\nverdict: pass\n');
    fs.writeFileSync(path.join(complete, '.cache', 'n2.md'), 'binding: n2\nverdict: pass\n');

    // (iv) a LEGACY/minimal archive (state only, no plan envelope) — must stay quiet. This repo
    //      holds 170 plan-less archives; flagging them would drown the real signal.
    fs.mkdirSync(path.join(archiveBase, 'issue-8327'), { recursive: true });
    fs.writeFileSync(path.join(archiveBase, 'issue-8327', 'workflow-state.md'),
      'status: closed\nstep: complete\nissue_number: 8327\n');

    // (v) PLAN-HASH-BEARING and PLAN-LESS — the state names a real plan_hash and there is no
    //     workflow-plan.md beside it. Nothing may be required of it but its anchor: the hash names a
    //     plan whose ledger no longer exists to derive an obligation from, so demanding the file back
    //     would be a blanket rule wearing a derivation's clothes. Distinct from (iv) — a plan-less
    //     archive that never claimed a plan cannot see a demand that keys off the claim.
    fs.mkdirSync(path.join(archiveBase, 'issue-8328'), { recursive: true });
    fs.writeFileSync(path.join(archiveBase, 'issue-8328', 'workflow-state.md'),
      'status: closed\nstep: complete\nissue_number: 8328\nplan_hash: ' + 'c'.repeat(64) + '\n');

    // The class is LOCAL — it must report the same offline, where every remote class is skipped.
    const result = runClosureAuditOffline([], tmp);
    const drift = result.drift.archive_content_incomplete;
    assert(
      Array.isArray(drift),
      '#832: closure-audit must report an archive_content_incomplete drift class; got: ' + JSON.stringify(result.drift)
    );
    const byProject = new Map((drift || []).map(d => [d.project, d]));

    assert(
      byProject.has('issue-8324')
        && Array.isArray(byProject.get('issue-8324').missing)
        && byProject.get('issue-8324').missing.includes('workflow-state.md'),
      '#832: the empty .cache/ skeleton must be reported with workflow-state.md missing; got: '
        + JSON.stringify(drift)
    );
    // DELETED: the two (ii) assertions — an evidence-gutted archive is reported because its
    // `## Node Ledger`'s `complete` rows PROVE `.cache/n1.md`/`.cache/n2.md` were recorded, and an
    // `n/a` row carries no such obligation. That required set was derived from the ledger, and the
    // ledger is going away. The audit's OTHER archive-content classes below are unchanged, and the
    // (ii) fixture is deliberately left standing as the over-report control: an archive whose
    // .cache/ is empty must NOT be reported on a derivation nothing can perform any more.
    assert(
      !byProject.has('issue-8326'),
      '#832: a COMPLETE archive must produce no finding; got: ' + JSON.stringify(byProject.get('issue-8326'))
    );
    assert(
      !byProject.has('issue-8327'),
      '#832: a legacy plan-less archive must stay quiet (record-derived, never a blanket demand); got: '
        + JSON.stringify(byProject.get('issue-8327'))
    );
    assert(
      !byProject.has('issue-8328'),
      '#832: a plan_hash-bearing archive with NO workflow-plan.md must produce NO finding — a named '
        + 'plan hash obliges nothing now that the ledger it was read through is gone. Two forge ports '
        + 'kept demanding workflow-plan.md here and reported '
        + '[{"project":...,"missing":["workflow-plan.md"]}] where this script reported []; got: '
        + JSON.stringify(byProject.get('issue-8328'))
    );
    assert(
      byProject.has('issue-8324'),
      '#832 control: the anchor-less archive in this same sweep is still reported, so the two '
        + 'must-stay-quiet arms above are measuring a live class and not a class that stopped running'
    );
    assert(
      result.counts.archive_content_incomplete === drift.length,
      '#832: counts.archive_content_incomplete must match the drift list; got '
        + JSON.stringify(result.counts.archive_content_incomplete) + ' vs ' + drift.length
    );

    // --execute is REPORT-ONLY for this class: nothing is repaired, nothing is deleted.
    const executed = runClosureAuditOffline(['--execute'], tmp);
    assert(
      Array.isArray(executed.reported_not_repaired.archive_content_incomplete)
        && executed.reported_not_repaired.archive_content_incomplete.length === drift.length,
      '#832: --execute must carry archive_content_incomplete under reported_not_repaired; got: '
        + JSON.stringify(executed.reported_not_repaired)
    );
    assert(
      fs.existsSync(path.join(archiveBase, 'issue-8324', '.cache'))
        && fs.existsSync(path.join(gutted, 'workflow-state.md')),
      '#832: --execute must never delete or rewrite an incomplete archive'
    );
    console.log('testClosureAuditArchiveContentDrift832: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// testClosureAuditArchiveOnlyNotProbed stood here — it contrasted a roadmap-sourced issue (probed)
// against an archive-only one (not probed) to prove roadmapSourceFiles was the sole reason the
// former was probed. ADR 0018 §5 retired roadmapSourceFiles' contribution to the candidate set
// entirely, so neither shape is probed any more and the contrast this test existed to draw no
// longer exists. Deleted with the mechanism.

// testClosureAuditMirrorListsClosedIssues stood here — pinned mirror_lists_closed_issues, retired
// from kaola-workflow-closure-audit.js in slice 4 of ADR 0018 §5. Deleted with the mechanism.

function testClosureAuditStaleInProgressLabels() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-labels-'));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue list')) { process.stdout.write('[{\"number\":99,\"title\":\"stale\",\"url\":\"http://x\"}]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const result = runClosureAudit([], tmp, binDir);
    const labels = result.drift.stale_in_progress_labels;
    assert(
      Array.isArray(labels) && labels.length === 1 && labels[0].number === 99,
      'stale_in_progress_labels must list issue 99, got: ' + JSON.stringify(labels)
    );
    assert(result.counts.stale_in_progress_labels === 1, 'counts.stale_in_progress_labels must be 1, got: ' + result.counts.stale_in_progress_labels);
    console.log('testClosureAuditStaleInProgressLabels: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditActiveFolderForClosedIssueReportsDirty() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-active-closed-'));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    plantActiveFolder(tmp, 'issue-904', 904, null);
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue view')) { process.stdout.write('{\"state\":\"closed\"}\\n'); }",
      "else if (a.includes('issue list')) { process.stdout.write('[]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const result = runClosureAudit([], tmp, binDir);
    const folders = result.drift.active_folder_for_closed_issue;
    assert(
      folders.length === 1 && folders[0].project === 'issue-904' && folders[0].issue_number === 904,
      'active_folder_for_closed_issue must report issue-904, got: ' + JSON.stringify(folders)
    );
    assert(folders[0].dirty === true, 'planted (uncommitted) active folder must be reported dirty:true, got: ' + folders[0].dirty);
    console.log('testClosureAuditActiveFolderForClosedIssueReportsDirty: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditUnarchivedPrFolderMerged() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-unarchived-pr-'));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    plantActiveFolder(tmp, 'issue-905', 905, null);
    const stateFile = path.join(tmp, 'kaola-workflow', 'issue-905', 'workflow-state.md');
    let state = fs.readFileSync(stateFile, 'utf8');
    state = state.replace(/^sink:\s*.*$/m, 'sink: pr');
    if (!/^pr_url:/m.test(state)) state += 'pr_url: https://github.com/test/repo/pull/905\n';
    fs.writeFileSync(stateFile, state);
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('pr view')) { process.stdout.write('{\"state\":\"MERGED\"}\\n'); }",
      "else if (a.includes('issue view')) { process.stdout.write('{\"state\":\"open\"}\\n'); }",
      "else if (a.includes('issue list')) { process.stdout.write('[]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const result = runClosureAudit([], tmp, binDir);
    const prFolders = result.drift.unarchived_pr_folders;
    assert(
      Array.isArray(prFolders) && prFolders.length === 1 && prFolders[0].project === 'issue-905' && prFolders[0].pr_state === 'MERGED',
      'unarchived_pr_folders must report merged PR folder issue-905, got: ' + JSON.stringify(prFolders)
    );
    console.log('testClosureAuditUnarchivedPrFolderMerged: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditExecuteRepairsLabels() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-exec-repair-'));
  const binDir = path.join(tmp, 'bin');
  const marker = path.join(tmp, 'label-removed.marker');
  try {
    initGitRepo(tmp);
    closureAuditShim(binDir, [
      "const fs = require('fs');",
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue edit') && a.includes('--remove-label')) { fs.writeFileSync(" + JSON.stringify(marker) + ", 'x'); process.stdout.write('{}\\n'); }",
      "else if (a.includes('issue view')) { process.stdout.write('{\"state\":\"closed\"}\\n'); }",
      "else if (a.includes('issue list')) { process.stdout.write('[{\"number\":906,\"title\":\"stale\",\"url\":\"http://x\"}]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const result = runClosureAudit(['--execute'], tmp, binDir);
    assert(result.dry_run === false, '--execute must return dry_run:false, got: ' + result.dry_run);
    // ADR 0018 §5: the roadmap_sources_removed / roadmap_regenerated repair (and its
    // precondition/postcondition assertions) stood here — retired with executeRepairs' stale-source
    // removal and ROADMAP.md regeneration in slice 4. What survives is the repair this test is
    // actually named for now: the remote label removal.
    assert(
      result.repaired.labels_removed.includes(906),
      'labels_removed must include 906, got: ' + JSON.stringify(result.repaired.labels_removed)
    );
    assert(fs.existsSync(marker), '--execute must call gh issue edit --remove-label (marker missing)');
    console.log('testClosureAuditExecuteRepairsLabels: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditExecuteNeverTouchesActiveFolders() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-exec-safe-'));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    plantActiveFolder(tmp, 'issue-907', 907, null);
    const folderDir = path.join(tmp, 'kaola-workflow', 'issue-907');
    assert(fs.existsSync(folderDir), 'precondition: active folder must exist');
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue view')) { process.stdout.write('{\"state\":\"closed\"}\\n'); }",
      "else if (a.includes('issue list')) { process.stdout.write('[]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const result = runClosureAudit(['--execute'], tmp, binDir);
    assert(result.dry_run === false, '--execute must return dry_run:false');
    assert(fs.existsSync(folderDir), '--execute must NEVER delete an active folder, even for a closed issue');
    const reported = result.reported_not_repaired.active_folder_for_closed_issue;
    assert(
      Array.isArray(reported) && reported.some(e => e.issue_number === 907),
      'closed-issue active folder must appear in reported_not_repaired, got: ' + JSON.stringify(reported)
    );
    console.log('testClosureAuditExecuteNeverTouchesActiveFolders: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditDryRunNeverCallsRemoveLabel() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-dryrun-safe-'));
  const binDir = path.join(tmp, 'bin');
  const marker = path.join(tmp, 'label-removed.marker');
  try {
    initGitRepo(tmp);
    closureAuditShim(binDir, [
      "const fs = require('fs');",
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue edit') && a.includes('--remove-label')) { fs.writeFileSync(" + JSON.stringify(marker) + ", 'x'); process.stdout.write('{}\\n'); }",
      "else if (a.includes('issue list')) { process.stdout.write('[{\"number\":99,\"title\":\"stale\",\"url\":\"http://x\"}]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const result = runClosureAudit([], tmp, binDir);
    assert(result.dry_run === true, 'no --execute must return dry_run:true, got: ' + result.dry_run);
    assert(!fs.existsSync(marker), 'dry-run must NOT call gh issue edit --remove-label (marker must not exist)');
    console.log('testClosureAuditDryRunNeverCallsRemoveLabel: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditStaleLabelsTimeout() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-stale-labels-timeout-'));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    closureAuditShim(binDir, ["process.kill(process.pid, 'SIGTERM'); setInterval(() => {}, 1 << 30);"]);
    const result = runClosureAudit([], tmp, binDir, probeTimeoutEnv());
    assert(
      result.drift.stale_in_progress_labels === 'skipped_timeout',
      'stale-labels hang must return "skipped_timeout", got: ' + JSON.stringify(result.drift.stale_in_progress_labels)
    );
    assert(
      !('unresolved_closed_state' in result.drift),
      'empty candidates must not produce unresolved_closed_state, got: ' + JSON.stringify(result.drift.unresolved_closed_state)
    );
    console.log('testClosureAuditStaleLabelsTimeout: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditUnresolvedClosedState() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-unresolved-closed-'));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    // ADR 0018 §5: closure-audit's candidate set used to fold in roadmap-source issue numbers
    // ADDITIONALLY to active-folder ones (buildAuditReport's old `candidates = srcFiles...concat
    // folders...`); that fold is retired along with roadmapSourceFiles, so a bare seedClassifierVerdictFromBody
    // no longer puts 910 in front of the probe at all — an active folder is now the ONLY candidate
    // source (buildAuditReport:429-430).
    plantActiveFolder(tmp, 'issue-910', 910, null);
    seedClassifierVerdictFromBody(910, '');
    closureAuditShim(binDir, ["process.kill(process.pid, 'SIGTERM'); setInterval(() => {}, 1 << 30);"]);
    const result = runClosureAudit([], tmp, binDir, probeTimeoutEnv());
    const unresolved = result.drift.unresolved_closed_state;
    assert(
      Array.isArray(unresolved) && unresolved.includes(910),
      'unresolved_closed_state must include 910 when issue probe times out, got: ' + JSON.stringify(unresolved)
    );
    assert(
      result.counts.unresolved_closed_state === 1,
      'counts.unresolved_closed_state must be 1, got: ' + result.counts.unresolved_closed_state
    );
    console.log('testClosureAuditUnresolvedClosedState: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditProbeFailureUnresolved() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-probe-fail-'));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    // ADR 0018 §5: see testClosureAuditUnresolvedClosedState — an active folder is now the only way
    // to put 940 in front of the probe at all.
    plantActiveFolder(tmp, 'issue-940', 940, null);
    seedClassifierVerdictFromBody(940, '');
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue view')) { process.exitCode = 1; process.stdout.write('not found\\n'); }",
      "else if (a.includes('issue list')) { process.stdout.write('[]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const result = runClosureAudit([], tmp, binDir);
    const unresolved = result.drift.unresolved_closed_state;
    assert(
      Array.isArray(unresolved) && unresolved.includes(940),
      'unresolved_closed_state must include 940 when issue view exits non-zero, got: ' + JSON.stringify(unresolved)
    );
    assert(result.counts.unresolved_closed_state === 1, 'counts.unresolved_closed_state must be 1, got: ' + result.counts.unresolved_closed_state);
    console.log('testClosureAuditProbeFailureUnresolved: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditTimeoutEnvInvalidFallsBack() {
  // NaN timeout from invalid env causes execFileSync to throw BEFORE the shim can answer.
  // A success-returning shim lets us discriminate: with invalid env (no fallback),
  // the probe would throw and route to unresolved — NOT resolve as closed.
  // With fix #2 (fallback=30000), the probe succeeds and the issue resolves as closed.
  //
  // ADR 0018 §5: the ORIGINAL discriminator here was stale_roadmap_sources' 'closed_remote' reason —
  // retired along with the roadmap-source read that fed it. The underlying property (an invalid
  // timeout env falls back rather than crashing the probe) still needs a candidate to probe, and an
  // active folder is now the only way to supply one (buildAuditReport:429-430, same as
  // testClosureAuditUnresolvedClosedState). The surviving discriminator is the SAME shape: a crashed
  // probe reports 941 unresolved; a successful one resolves it closed and reports the active folder
  // as active_folder_for_closed_issue drift instead.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-timeout-invalid-'));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    plantActiveFolder(tmp, 'issue-941', 941, null);
    seedClassifierVerdictFromBody(941, '');
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue view')) { process.stdout.write('{\"state\":\"closed\"}\\n'); }",
      "else if (a.includes('issue list')) { process.stdout.write('[]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const result = runClosureAudit([], tmp, binDir, { KAOLA_GH_REMOTE_TIMEOUT_MS: 'not-a-number' });
    const unresolved = result.drift.unresolved_closed_state;
    assert(
      !(Array.isArray(unresolved) && unresolved.includes(941)),
      'invalid KAOLA_GH_REMOTE_TIMEOUT_MS must fall back to 30000, not crash the probe into unresolved_closed_state, got: ' + JSON.stringify(unresolved)
    );
    const activeClosed = result.drift.active_folder_for_closed_issue;
    assert(
      Array.isArray(activeClosed) && activeClosed.some(f => f.issue_number === 941),
      'invalid KAOLA_GH_REMOTE_TIMEOUT_MS must fall back to 30000 and detect the closed issue as active_folder_for_closed_issue, got: ' + JSON.stringify(activeClosed)
    );
    console.log('testClosureAuditTimeoutEnvInvalidFallsBack: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// #987: testClosureAuditTimeoutEnvOverCapFallsBack stood here. DELETED, because it could not fail on
// the mechanism it was named after — and the reason is a fact about the runtime, not about the test.
//
// Its premise was that `KAOLA_GH_REMOTE_TIMEOUT_MS='999999999999999999999'` parses to 1e21, survives
// the `Number.isInteger(n) && n > 0` guard, and makes `execFileSync` throw ERR_OUT_OF_RANGE — so an
// unclamped timeout would crash the probe into `unresolved_closed_state` and the clamp is what keeps
// it resolving. On Node v24.18.0 that premise is simply false. Measured directly against
// `execFileSync`: 2**31, 2**32, 2**53, MAX_SAFE_INTEGER, 1e15, 1e21, 1e300 and Number.MAX_VALUE all
// pass WITHOUT throwing; the only value that throws is Infinity, which `Number.isInteger` already
// rejects and which `parseInt` of a digit string can never produce. There is no input that reaches
// the clamp and crashes, so there is no discriminator to build a pin on.
//
// Measured in this suite too, one mutation at a time, against `kaola-workflow-active-folders.js`
// (`probeIssueState`'s module — NOT closure-audit.js, whose same-named constant feeds a different
// probe and mutating which reds neither test):
//   - remove `Math.min(n, 600000)`, i.e. delete the exact mechanism this test named → BOTH tests
//     still PASS. That is the whole finding.
//   - remove the `Number.isInteger(n) && n > 0` guard → testClosureAuditTimeoutEnvInvalidFallsBack
//     REDS with `unresolved_closed_state: [941]`. The axis is armed; only the over-cap half is dead.
//
// So the classification #987 asked for is: NOT unreachable (the body ran, the assertions evaluated
// against real drift arrays), NOT tautological (the identical assertions discriminate in the sibling)
// — merely mutation-insensitive, because the failure it describes cannot be produced on this runtime.
// Giving it teeth was considered and is not available at a testable cost: the clamp's surviving
// effect is bounding the wait at 600000 ms, and REMOTE_TIMEOUT_MS is module-private, so witnessing it
// needs a ten-minute hang. Deleted rather than relaxed — a threshold moved to make the question go
// away is what #987 forbids, and an assertion that reads as coverage while watching nothing is worse
// than its absence, because an absent test does not claim to be looking.
//
// THE CLAMP ITSELF IS NOT DEAD AND MUST NOT BE DELETED ON THE STRENGTH OF THIS: it still bounds how
// long an audit hangs on an absurd env value. What is gone is only the ability to witness it here.

function testClosureAuditExecuteDetectionTimeoutPropagates() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-exec-det-timeout-'));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    closureAuditShim(binDir, ["process.kill(process.pid, 'SIGTERM'); setInterval(() => {}, 1 << 30);"]);
    const result = runClosureAudit(['--execute'], tmp, binDir, probeTimeoutEnv());
    assert(
      result.repaired.labels_skipped_reason === 'detection_timeout',
      '--execute with detection timeout must set labels_skipped_reason="detection_timeout", got: ' + JSON.stringify(result.repaired.labels_skipped_reason)
    );
    assert(
      Array.isArray(result.repaired.labels_removed) && result.repaired.labels_removed.length === 0,
      'labels_removed must be empty when detection timed out, got: ' + JSON.stringify(result.repaired.labels_removed)
    );
    console.log('testClosureAuditExecuteDetectionTimeoutPropagates: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditExecuteLabelRemovalTimeoutBreaks() {
  // label-removal SIGTERM mid-loop → labels_skipped_reason='timeout' + loop BREAKS.
  // Shim returns 2 stale issues (detection succeeds), then self-SIGTERMs on the first
  // issue edit --remove-label so execFileSync throws the timeout error shape deterministically.
  // Result: labels_failed.length===1 (proves loop broke before processing 2nd issue).
  // Uses the DEFAULT remote budget (no probeTimeoutEnv): the removal self-terminates instantly,
  // so the detection 'issue list' call — which must SUCCEED — is never at risk of the tight probe
  // budget killing it under CPU contention (which would wrongly report detection_timeout instead).
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-exec-label-timeout-'));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue edit') && a.includes('--remove-label')) { process.kill(process.pid, 'SIGTERM'); setInterval(() => {}, 1 << 30); }",
      "else if (a.includes('issue list')) { process.stdout.write('[{\"number\":91,\"title\":\"stale\",\"url\":\"http://x\"},{\"number\":92,\"title\":\"stale2\",\"url\":\"http://y\"}]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const result = runClosureAudit(['--execute'], tmp, binDir);
    assert(
      result.repaired.labels_skipped_reason === 'timeout',
      'label-removal timeout must set labels_skipped_reason="timeout", got: ' + JSON.stringify(result.repaired.labels_skipped_reason)
    );
    assert(
      Array.isArray(result.repaired.labels_failed) && result.repaired.labels_failed.length === 1,
      'labels_failed must have exactly 1 entry (loop broke after first), got: ' + JSON.stringify(result.repaired.labels_failed)
    );
    assert(
      Array.isArray(result.repaired.labels_removed) && result.repaired.labels_removed.length === 0,
      'labels_removed must be empty when removal timed out, got: ' + JSON.stringify(result.repaired.labels_removed)
    );
    console.log('testClosureAuditExecuteLabelRemovalTimeoutBreaks: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditExecuteLabelRemovalNonTimeoutFails() {
  // #28b: label-removal exits 1 fast (no timeout) → labelsFailed accumulates ALL issues.
  // Loop does NOT break; labels_skipped_reason must be absent (omitted for non-timeout).
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-exec-label-fail-'));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue edit') && a.includes('--remove-label')) { process.exit(1); }",
      "else if (a.includes('issue list')) { process.stdout.write('[{\"number\":93,\"title\":\"stale\",\"url\":\"http://x\"},{\"number\":94,\"title\":\"stale2\",\"url\":\"http://y\"}]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const result = runClosureAudit(['--execute'], tmp, binDir);
    assert(
      Array.isArray(result.repaired.labels_failed) &&
      result.repaired.labels_failed.includes(93) &&
      result.repaired.labels_failed.includes(94),
      'labels_failed must include both 93 and 94 (loop did not break), got: ' + JSON.stringify(result.repaired.labels_failed)
    );
    assert(
      !('labels_skipped_reason' in result.repaired),
      'labels_skipped_reason must be absent for non-timeout failure, got: ' + JSON.stringify(result.repaired.labels_skipped_reason)
    );
    assert(
      Array.isArray(result.repaired.labels_removed) && result.repaired.labels_removed.length === 0,
      'labels_removed must be empty when all removals failed, got: ' + JSON.stringify(result.repaired.labels_removed)
    );
    console.log('testClosureAuditExecuteLabelRemovalNonTimeoutFails: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditPrFolderTimeout() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-pr-folder-timeout-'));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    plantActiveFolder(tmp, 'issue-911', 911, null);
    const stateFile = path.join(tmp, 'kaola-workflow', 'issue-911', 'workflow-state.md');
    let state = fs.readFileSync(stateFile, 'utf8');
    state = state.replace(/^sink:\s*.*$/m, 'sink: pr');
    if (!/^pr_url:/m.test(state)) state += 'pr_url: https://github.com/test/repo/pull/911\n';
    fs.writeFileSync(stateFile, state);
    closureAuditShim(binDir, ["process.kill(process.pid, 'SIGTERM'); setInterval(() => {}, 1 << 30);"]);
    const result = runClosureAudit([], tmp, binDir, probeTimeoutEnv());
    assert(
      result.drift.unarchived_pr_folders === 'skipped_timeout',
      'PR-folder hang must return "skipped_timeout", got: ' + JSON.stringify(result.drift.unarchived_pr_folders)
    );
    console.log('testClosureAuditPrFolderTimeout: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ===========================================================================
// #903 — the closure audit is repository-wide by DEFAULT; --project/--issue add a scoped verdict
// on top. The regression these pin: parseArgs recognized the exact string `--execute` and had no
// `else`, so `--help` and every mistyped or invented flag was absorbed silently and answered with
// the full repository report at exit 0. An operator who believed they had scoped the audit read an
// unscoped answer — carrying another project's drift — as authoritative.
//
// Two behaviours the scoping work forced, pinned here alongside it:
//   * the candidate set now expands a bundle's `issue_numbers`, so a non-primary MEMBER is visible
//     to the archive_closed and active_folder_for_closed_issue classes. `--execute` deletes the
//     roadmap sources that set authorizes, so `closure_policy` is read before a member is trusted.
//   * `archive_summary_citation_missing` (#901): report-only, omitted when empty, and under
//     --project its findings land out-of-scope so they cannot touch a scoped verdict.
// ===========================================================================

// An archived project folder. `fields === null` plants the directory with NO workflow-state.md —
// the identity-anchor-less shape archive_content_incomplete reports.
function plantArchive903(root, name, fields) {
  const dir = path.join(root, 'kaola-workflow', 'archive', name);
  fs.mkdirSync(dir, { recursive: true });
  if (fields !== null) {
    fs.writeFileSync(path.join(dir, 'workflow-state.md'),
      Object.keys(fields).map(k => k + ': ' + fields[k]).join('\n') + '\n');
  }
  return dir;
}

// Append a line-anchored field to a planted active folder's state (plantActiveFolder writes the
// scalar primary only; a bundle also carries `issue_numbers`).
function appendStateField903(root, project, name, value) {
  fs.appendFileSync(path.join(root, 'kaola-workflow', project, 'workflow-state.md'),
    name + ': ' + value + '\n');
}

// runClosureAudit / runClosureAuditOffline assert status === 0 and JSON.parse stdout
// unconditionally, so the operator-input-error and --help paths cannot go through them. This
// returns the process result untouched. OFFLINE is set EXPLICITLY rather than inherited: every
// assertion below is about argv handling, which is decided before any remote call, and an inherited
// value would leave what the pin actually ran under unstated.
function runClosureAuditRaw(args, cwd) {
  // The argv-in / envelope-out contract of this CLI, exit code and stream separation included.
  // spawn-class: cli-contract
  return spawnSync(process.execPath, [closureAuditScript, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 60000,
    env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
  });
}

function testClosureAuditProjectScopePartitions903() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-903-scope-'));
  try {
    initGitRepo(tmp);
    // ADR 0018 §5: this fixture originally drove the partition through stale_roadmap_sources — an
    // OFFLINE, LOCAL, no-forge-needed drift class that a bare roadmap-source plant was enough to
    // produce. That class, and the roadmap-source read that fed it, are retired. The partition
    // mechanism under test (scopePredicate / partitionDriftByScope) is NOT retired — closure-audit.js
    // still names the two archive classes (archive_content_incomplete,
    // archive_summary_citation_missing) as matched BY FOLDER NAME rather than by issue number
    // (closure-audit.js:499-501), for exactly this reason: an archive finding has no active folder
    // to key off. archive_summary_citation_missing is the other LOCAL, OFFLINE-safe archive class
    // (closure-audit.js:318-330) and, unlike archive_content_incomplete, does not require
    // workflow-state.md to be MISSING — so it can coexist with the valid workflow-state.md that
    // --project's own scope resolution (resolveProjectIssues) needs to read. Two independent closed
    // archives, each with a valid workflow-state.md (for scope resolution) and a finalization-summary
    // citing a `.cache/` file that was never written (for the drift itself).
    const dir700 = plantArchive903(tmp, 'issue-700', { status: 'closed', step: 'complete', issue_number: 700 });
    const dir555 = plantArchive903(tmp, 'issue-555', { status: 'closed', step: 'complete', issue_number: 555 });
    fs.writeFileSync(path.join(dir700, 'finalization-summary.md'), 'Evidence: .cache/final-validation.md\n');
    fs.writeFileSync(path.join(dir555, 'finalization-summary.md'), 'Evidence: .cache/final-validation.md\n');
    seedClassifierVerdictFromBody(700, '');
    seedClassifierVerdictFromBody(555, '');

    // Control on the fixture: unscoped, BOTH are drift, and the unscoped envelope carries none of
    // the scoped keys. Without this leg the partition assertions could pass on a dead fixture.
    const unscoped = runClosureAuditOffline([], tmp);
    assert(
      unscoped.drift.archive_summary_citation_missing.map(s => s.project).join(',') === 'issue-555,issue-700',
      '#903 control: unscoped must report BOTH issue-555 and issue-700 as citation-missing, got: '
        + JSON.stringify(unscoped.drift.archive_summary_citation_missing)
    );
    // The repository-wide envelope is EXACT, not merely a superset: scoping is additive, so an
    // unscoped run must be the shape this script has always emitted. Nothing pinned an exact key set
    // before, which is why a new key could appear in the default report unnoticed.
    assert(JSON.stringify(Object.keys(unscoped)) === '["dry_run","offline","drift","counts"]',
      '#903: the unscoped dry-run envelope must carry exactly these four keys, got: '
        + JSON.stringify(Object.keys(unscoped)));
    assert(JSON.stringify(Object.keys(unscoped.drift))
      === '["stale_in_progress_labels","active_folder_for_closed_issue","unarchived_pr_folders",'
        + '"archive_content_incomplete","archive_summary_citation_missing"]',
      '#903: the unscoped drift keys and their order must be unchanged on a tree carrying none of the '
        + 'omit-when-empty classes, got: ' + JSON.stringify(Object.keys(unscoped.drift)));
    assert(JSON.stringify(Object.keys(unscoped.counts)) === JSON.stringify(Object.keys(unscoped.drift)),
      '#903: counts must carry one entry per drift key, in the same order, got: '
        + JSON.stringify(Object.keys(unscoped.counts)));

    const scoped = runClosureAuditOffline(['--project', 'issue-700'], tmp);
    assert(JSON.stringify(Object.keys(scoped))
      === '["dry_run","offline","scope","current_project_clean","current_project_drift",'
        + '"current_project_counts","repository_drift_outside_scope","repository_counts_outside_scope"]',
      '#903: the scoped dry-run envelope must carry the scope, the verdict, both halves and both '
        + 'count objects, got: ' + JSON.stringify(Object.keys(scoped)));
    assert(scoped.scope.project === 'issue-700',
      '#903: scope.project must echo the requested project, got: ' + JSON.stringify(scoped.scope));
    assert(JSON.stringify(scoped.scope.issue_numbers) === '[700]',
      '#903: scope.issue_numbers must come from the project\'s own record, got: ' + JSON.stringify(scoped.scope.issue_numbers));
    assert(scoped.scope.state_file === 'kaola-workflow/archive/issue-700/workflow-state.md',
      '#903: scope.state_file must name the record the scope was read from, got: ' + JSON.stringify(scoped.scope.state_file));
    assert(!('archive_name_ambiguous' in scoped.scope),
      '#903: archive_name_ambiguous must be OMITTED unless true, got: ' + JSON.stringify(scoped.scope));

    const inSources = scoped.current_project_drift.archive_summary_citation_missing;
    assert(inSources.length === 1 && inSources[0].project === 'issue-700',
      '#903: the scoped project\'s own citation-missing finding must be in current_project_drift, got: ' + JSON.stringify(inSources));
    assert(inSources[0].attribution === 'name_match',
      '#903: the scoped project\'s own finding must be attributed name_match (proves the NAME-based '
        + 'scope predicate — not an issue-number one — actually matched it), got: ' + JSON.stringify(inSources[0]));
    const outSources = scoped.repository_drift_outside_scope.archive_summary_citation_missing;
    assert(outSources.length === 1 && outSources[0].project === 'issue-555',
      '#903: an unrelated project\'s citation-missing finding must land in repository_drift_outside_scope — '
        + 'it may neither contaminate the scoped verdict nor be hidden by it, got: ' + JSON.stringify(outSources));
    assert(scoped.current_project_counts.archive_summary_citation_missing === 1,
      '#903: current_project_counts must count the scoped half, got: ' + JSON.stringify(scoped.current_project_counts));
    assert(scoped.repository_counts_outside_scope.archive_summary_citation_missing === 1,
      '#903: repository_counts_outside_scope must count the complement, got: ' + JSON.stringify(scoped.repository_counts_outside_scope));

    // LAST, because it mutates the fixture: the unscoped --execute envelope is exact too. A scoped
    // --execute swaps the two current_project_* keys for repaired/reported_not_repaired; the
    // unscoped one never grew a scope block at all.
    const unscopedExec = runClosureAuditOffline(['--execute'], tmp);
    assert(JSON.stringify(Object.keys(unscopedExec))
      === '["dry_run","offline","repaired","reported_not_repaired"]',
      '#903: the unscoped --execute envelope must be unchanged, got: '
        + JSON.stringify(Object.keys(unscopedExec)));
    console.log('testClosureAuditProjectScopePartitions903: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditRejectsUnknownFlagAndHelp903() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-903-flags-'));
  const noRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-903-norepo-'));
  try {
    initGitRepo(tmp);
    // Control: the bare invocation on this fixture answers at exit 0, so every exit 1 below is the
    // flag being rejected and not a broken fixture.
    const bare = runClosureAuditRaw([], tmp);
    assert(bare.status === 0, '#903 control: the bare invocation must still exit 0, got ' + bare.status
      + '\nstderr: ' + bare.stderr);
    assert(bare.stdout.includes('"dry_run"'),
      '#903 control: the bare invocation must print the drift report, got: ' + bare.stdout);

    const bogus = runClosureAuditRaw(['--bogus-flag-xyz'], tmp);
    assert(bogus.status === 1,
      '#903: an unknown flag must exit 1 — it was silently absorbed and answered with the full report before, got '
        + bogus.status + '\nstdout: ' + bogus.stdout);
    assert(bogus.stdout === '',
      '#903: on the operator-input-error path stdout must be EMPTY — a report there is the silent-scoping '
        + 'failure itself, got: ' + bogus.stdout);
    assert(bogus.stderr.includes('unknown flag: --bogus-flag-xyz'),
      '#903: stderr must name the rejected flag, got: ' + bogus.stderr);
    assert(bogus.stderr.includes('usage:'),
      '#903: the rejection must carry the usage text, got: ' + bogus.stderr);

    // A scoping flag with a missing or malformed value is the same class of operator error.
    for (const argv of [['--project'], ['--project', '--execute'], ['--issue'], ['--issue', 'abc'],
      ['--issue', '0700'], ['--issue', '0'], ['--issue', '-3']]) {
      const bad = runClosureAuditRaw(argv, tmp);
      assert(bad.status === 1,
        '#903: ' + JSON.stringify(argv) + ' must exit 1, got ' + bad.status + '\nstdout: ' + bad.stdout);
      assert(bad.stdout === '',
        '#903: ' + JSON.stringify(argv) + ' must leave stdout empty, got: ' + bad.stdout);
    }

    for (const flag of ['--help', '-h']) {
      const help = runClosureAuditRaw([flag], tmp);
      assert(help.status === 0, '#903: ' + flag + ' must exit 0, got ' + help.status + '\nstderr: ' + help.stderr);
      assert(help.stdout.includes('usage:'),
        '#903: ' + flag + ' must print usage on STDOUT, got: ' + help.stdout);
      assert(!help.stdout.includes('"dry_run"'),
        '#903: ' + flag + ' must print usage INSTEAD of the report — it printed the full drift JSON before, got: '
          + help.stdout);
    }

    // Flags are parsed before the repository probe, so --help answers outside a git repository too.
    const outside = runClosureAuditRaw(['--help'], noRepo);
    assert(outside.status === 0,
      '#903: --help must answer outside a git repository, got ' + outside.status + '\nstderr: ' + outside.stderr);
    assert(outside.stdout.includes('usage:'),
      '#903: --help outside a repo must still print usage, got: ' + outside.stdout);
    console.log('testClosureAuditRejectsUnknownFlagAndHelp903: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(noRepo, { recursive: true, force: true });
  }
}

function testClosureAuditMistypedProjectExitsOne903() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-903-mistyped-'));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    plantActiveFolder(tmp, 'bundle-700-701', 700, null);
    appendStateField903(tmp, 'bundle-700-701', 'issue_numbers', '700,701');

    // Control: the correctly-spelled project resolves and answers at exit 0.
    const good = runClosureAuditRaw(['--project', 'bundle-700-701'], tmp);
    assert(good.status === 0, '#903 control: a resolvable --project must exit 0, got ' + good.status
      + '\nstderr: ' + good.stderr);
    const goodParsed = JSON.parse(good.stdout);
    assert(JSON.stringify(goodParsed.scope.issue_numbers) === '[700,701]',
      '#903 control: the live folder\'s members must resolve, got: ' + JSON.stringify(goodParsed.scope));

    // The mistyped name must REFUSE. Answering "clean" for a project that does not exist is exactly
    // the silent-scoping failure #903 removes, and the old behaviour was exit 0 with an unscoped answer.
    const typo = runClosureAuditRaw(['--project', 'bundle-700-71'], tmp);
    assert(typo.status === 1,
      '#903: a --project resolving to no workflow-state.md must exit 1, got ' + typo.status
        + '\nstdout: ' + typo.stdout);
    assert(typo.stdout === '',
      '#903: a mistyped --project must print NOTHING on stdout — an unscoped report there reads as a '
        + 'scoped verdict, got: ' + typo.stdout);
    assert(typo.stderr.includes('bundle-700-71'),
      '#903: the error must name the project it could not resolve, got: ' + typo.stderr);
    assert(typo.stderr.includes('--issue'),
      '#903: the error must name the escape hatch, got: ' + typo.stderr);

    // That escape hatch: --issue makes an unresolvable --project scopeable rather than fatal.
    const withIssue = runClosureAuditRaw(['--project', 'bundle-700-71', '--issue', '701'], tmp);
    assert(withIssue.status === 0,
      '#903: an unresolvable --project plus --issue must exit 0, got ' + withIssue.status
        + '\nstderr: ' + withIssue.stderr);
    const withIssueParsed = JSON.parse(withIssue.stdout);
    assert(withIssueParsed.scope.state_file === null,
      '#903: state_file must be null when no record was read, got: ' + JSON.stringify(withIssueParsed.scope));
    assert(JSON.stringify(withIssueParsed.scope.issue_numbers) === '[701]',
      '#903: the scope must be the --issue values alone, got: ' + JSON.stringify(withIssueParsed.scope.issue_numbers));

    // --issue alone: a scope with no project at all.
    const issueOnly = runClosureAuditRaw(['--issue', '701', '--issue', '700'], tmp);
    assert(issueOnly.status === 0, '#903: --issue alone must exit 0, got ' + issueOnly.status
      + '\nstderr: ' + issueOnly.stderr);
    const issueOnlyParsed = JSON.parse(issueOnly.stdout);
    assert(issueOnlyParsed.scope.project === null && issueOnlyParsed.scope.state_file === null,
      '#903: --issue alone must report project:null and state_file:null, got: ' + JSON.stringify(issueOnlyParsed.scope));
    assert(JSON.stringify(issueOnlyParsed.scope.issue_numbers) === '[700,701]',
      '#903: repeated --issue must accumulate, sorted and deduped, got: ' + JSON.stringify(issueOnlyParsed.scope.issue_numbers));

    // ── The escape hatch's VERDICT, and it must run ONLINE ─────────────────────────────────────
    // MEASURED: `--project <typo> --issue N` answered current_project_clean:TRUE over a project
    // carrying real drift — a false clean, reached THROUGH the escape hatch rather than past the
    // assert that exists to stop it. --issue supplies numbers to scope BY; it does not supply the
    // record the name failed to resolve, so the project half of the scope never evaluated.
    //
    // Why not runClosureAuditRaw, which every leg above uses: it hardcodes KAOLA_WORKFLOW_OFFLINE=1,
    // and OFFLINE the same argv reads clean:false because two classes token 'skipped_offline'. A pin
    // written through that runner PASSES AGAINST THE DEFECT. The verdict legs therefore run with
    // OFFLINE=0 and a mock on gh's own hook.
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue view')) { process.stdout.write('{\"state\":\"open\"}\\n'); }",
      "else if (a.includes('issue list')) { process.stdout.write('[]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const unresolvedOnline = runClosureAudit(['--project', 'bundle-700-71', '--issue', '701'], tmp, binDir);
    assert(unresolvedOnline.offline === false,
      '#903: this leg must be ONLINE or it proves nothing — offline masks the false clean, got offline: '
        + unresolvedOnline.offline);
    assert(unresolvedOnline.scope.project_unresolved === true,
      '#903: an unresolvable --project accepted via --issue must SAY the name resolved to nothing, got: '
        + JSON.stringify(unresolvedOnline.scope));
    assert(unresolvedOnline.current_project_clean === false,
      '#903: and it must never read clean — nothing was read for the name the operator typed, so no '
        + 'class speaks for that project. This answered TRUE, got: ' + unresolvedOnline.current_project_clean
        + ' scope: ' + JSON.stringify(unresolvedOnline.scope));
    // clean:false above must come from the UNRESOLVED SCOPE, not from a class that failed. If the mock
    // were dead every probe would read 'unavailable', unresolved_closed_state would appear, and the
    // assertion above would pass for a reason that has nothing to do with the fix.
    assert(!('unresolved_closed_state' in unresolvedOnline.current_project_drift),
      '#903: no probe may have failed — an unresolved_closed_state class here means the gh mock never '
        + 'answered and this leg is measuring a dead axis, got: '
        + JSON.stringify(Object.keys(unresolvedOnline.current_project_drift)));
    for (const key of ['stale_in_progress_labels', 'unarchived_pr_folders']) {
      assert(Array.isArray(unresolvedOnline.current_project_drift[key]),
        '#903: ' + key + ' must be an EVALUATED array on this axis, not a skip token — a token here is '
          + 'the offline masking reappearing, got: ' + JSON.stringify(unresolvedOnline.current_project_drift[key]));
    }
    const unresolvedNonZero = Object.keys(unresolvedOnline.current_project_counts)
      .filter(k => unresolvedOnline.current_project_counts[k] !== 0);
    assert(unresolvedNonZero.length === 0,
      '#903: every scoped count must be 0, so clean:false is the UNRESOLVED verdict and not drift that '
        + 'happened to be found; nonzero: ' + JSON.stringify(unresolvedNonZero));

    // POSITIVE CONTROL — same fixture, same runner, same mock, same --issue: a RESOLVABLE --project
    // over this zero-drift repo must still read clean:TRUE. Without it an always-false verdict would
    // satisfy every assertion above.
    const resolvedOnline = runClosureAudit(['--project', 'bundle-700-701', '--issue', '701'], tmp, binDir);
    assert(resolvedOnline.current_project_clean === true,
      '#903 control: a resolvable --project with the same --issue over zero drift must still read '
        + 'clean:true — this is what separates the fix from a verdict that never says clean, got: '
        + resolvedOnline.current_project_clean + ' drift: ' + JSON.stringify(resolvedOnline.current_project_drift));
    assert(!('project_unresolved' in resolvedOnline.scope),
      '#903 control: project_unresolved is OMITTED when false, so a resolvable scope emits exactly the '
        + 'three keys it always did, got: ' + JSON.stringify(resolvedOnline.scope));

    // The scope LABEL is axis-independent, unlike the verdict: offline the same unresolvable argv still
    // reports project_unresolved, and reads clean:false there only because two classes never ran.
    assert(withIssueParsed.scope.project_unresolved === true,
      '#903: the unresolved label must be on the offline answer too — it is a fact about the NAME, not '
        + 'about what could be probed, got: ' + JSON.stringify(withIssueParsed.scope));
    console.log('testClosureAuditMistypedProjectExitsOne903: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// A `--project` value is ONE folder name under kaola-workflow/, never a path. `--project ../../outside`
// resolved a workflow-state.md from OUTSIDE the repository and answered a scoped verdict on it at exit
// 0 — a report about a tree the audit was never pointed at, carrying an issue number that appears
// nowhere inside the repo. It is the same operator-input error class as a mistyped flag (docs/api.md
// already publishes exit 1 for "a missing or malformed flag value", stdout empty), so it answers the
// same way: exit 1, EMPTY stdout, message on stderr. The empty-stdout half is the load-bearing one —
// any bytes there read as a scoped answer to whoever parses them.
//
// The fixture is a CONTAINER holding the repo and the outside tree as SIBLINGS, so `../../outside`
// from <root>/kaola-workflow/<project> lands on a file this scenario planted. Without that file the
// pre-fix run exits 1 for the unrelated unresolvable-name reason, and this pin would pass against the
// very defect it exists to catch.
function testClosureAuditProjectNameIsNotAPath903() {
  const container = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-903-traversal-')));
  const repo = path.join(container, 'repo');
  try {
    fs.mkdirSync(repo, { recursive: true });
    initGitRepo(repo);
    fs.mkdirSync(path.join(container, 'outside'), { recursive: true });
    fs.writeFileSync(path.join(container, 'outside', 'workflow-state.md'),
      'status: in_progress\nstep: implement\nissue_number: 4242\n');
    plantActiveFolder(repo, 'issue-555', 555, null);

    const traversal = runClosureAuditRaw(['--project', '../../outside'], repo);
    assert(traversal.status === 1,
      '#903: a --project that is a PATH must exit 1 — `../../outside` reported a verdict on a '
        + 'workflow-state.md outside the repository at exit 0, got ' + traversal.status
        + '\nstdout: ' + traversal.stdout);
    assert(traversal.stdout === '',
      '#903: and stdout must be EMPTY — the traversal run printed a full scoped report there, which '
        + 'every caller reads as an answer about the project it asked for, got: ' + traversal.stdout);
    assert(traversal.stderr.includes('safe folder name'),
      '#903: stderr must name the rule that rejected the value, got: ' + traversal.stderr);
    assert(!traversal.stdout.includes('4242'),
      '#903: the outside record\'s issue number must not reach stdout — resolving it was the defect, '
        + 'got: ' + traversal.stdout);

    // POSITIVE CONTROL, same fixture, same runner: a legitimate folder name still scopes at exit 0.
    // A validator that rejected every name would satisfy the assertions above on its own.
    const good = runClosureAuditRaw(['--project', 'issue-555'], repo);
    assert(good.status === 0,
      '#903 control: a legitimate project name must still scope at exit 0, got ' + good.status
        + '\nstderr: ' + good.stderr);
    const goodScope = JSON.parse(good.stdout).scope;
    assert(goodScope.project === 'issue-555'
      && goodScope.state_file === 'kaola-workflow/issue-555/workflow-state.md',
      '#903 control: the scope must resolve to the IN-REPO record, got: ' + JSON.stringify(goodScope));
    assert(JSON.stringify(goodScope.issue_numbers) === '[555]',
      '#903 control: and to that record\'s members, got: ' + JSON.stringify(goodScope.issue_numbers));
    console.log('testClosureAuditProjectNameIsNotAPath903: PASSED');
  } finally {
    fs.rmSync(container, { recursive: true, force: true });
  }
}

function testClosureAuditScopedCleanIsFailClosed903() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-903-failclosed-'));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    plantActiveFolder(tmp, 'issue-910', 910, null);
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue view')) { process.stdout.write('{\"state\":\"open\"}\\n'); }",
      "else if (a.includes('issue list')) { process.stdout.write('[]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);

    // Control FIRST, and it is what keeps the fail-closed assertion from being vacuous: the SAME
    // zero-drift project, ONLINE, with every class actually evaluated, must read clean:true. An
    // always-false verdict would satisfy the offline leg below on its own.
    const online = runClosureAudit(['--project', 'issue-910'], tmp, binDir);
    assert(online.current_project_clean === true,
      '#903 control: a scoped project with zero drift and every class EVALUATED must read clean:true, got '
        + online.current_project_clean + ' drift: ' + JSON.stringify(online.current_project_drift));

    // Fail-closed: offline, two classes never ran, so nothing can prove the project clean.
    const offline = runClosureAuditOffline(['--project', 'issue-910'], tmp);
    assert(offline.current_project_clean === false,
      '#903: current_project_clean must be FALSE when a scoped class did not evaluate — a probe that '
        + 'cannot PROVE clean must not report clean, got: ' + offline.current_project_clean);
    for (const key of ['stale_in_progress_labels', 'unarchived_pr_folders']) {
      assert(offline.current_project_drift[key] === 'skipped_offline',
        '#903: the skip reason must be readable verbatim in current_project_drift.' + key + ', got: '
          + JSON.stringify(offline.current_project_drift[key]));
      assert(offline.repository_drift_outside_scope[key] === 'skipped_offline',
        '#903: a skipped class must appear in BOTH halves — it never evaluated, so neither half may '
          + 'claim it clean; ' + key + ' got: ' + JSON.stringify(offline.repository_drift_outside_scope[key]));
      assert(offline.current_project_counts[key] === 0,
        '#903: a skip must count 0 findings, never be mistaken for a measurement; ' + key + ' got: '
          + JSON.stringify(offline.current_project_counts[key]));
    }
    // clean:false here must NOT be readable as "drift found": every scoped count is zero.
    const nonZero = Object.keys(offline.current_project_counts)
      .filter(k => offline.current_project_counts[k] !== 0);
    assert(nonZero.length === 0,
      '#903: the offline scoped run must have ZERO findings — clean:false is the un-evaluated verdict, '
        + 'not drift; nonzero counts: ' + JSON.stringify(nonZero));
    console.log('testClosureAuditScopedCleanIsFailClosed903: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// testClosureAuditBundleMemberArchiveClosed903 and testClosureAuditBundleMemberClosurePolicyNegative903
// stood here — both entirely about archiveClosedIssues' bundle closure_policy / issue_numbers
// reading (the all_or_nothing-member and partial-close-member cases feeding stale_roadmap_sources'
// archive_closed reason). archiveClosedIssues is retired in slice 4 of ADR 0018 §5. Deleted with it.

function testClosureAuditBundleMemberActiveFolderClosed903() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-903-member-folder-'));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    // (i) the previously-invisible case: primary OPEN, member CLOSED.
    plantActiveFolder(tmp, 'bundle-800-801', 800, null);
    appendStateField903(tmp, 'bundle-800-801', 'issue_numbers', '800,801');
    // (ii) over-report control: a bundle with no closed member must stay quiet.
    plantActiveFolder(tmp, 'bundle-802-803', 802, null);
    appendStateField903(tmp, 'bundle-802-803', 'issue_numbers', '802,803');
    // (iii) primary-arm control: proves the detector and the gh mock are both live, and that the
    //       pre-#903 finding shape is unchanged.
    plantActiveFolder(tmp, 'issue-804', 804, null);
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "const m = a.match(/issue view (\\d+)/);",
      "if (m) { const closed = ['801', '804'].indexOf(m[1]) !== -1;",
      "  process.stdout.write(JSON.stringify({ state: closed ? 'closed' : 'open' }) + '\\n'); }",
      "else if (a.includes('issue list')) { process.stdout.write('[]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const result = runClosureAudit([], tmp, binDir);
    const folders = result.drift.active_folder_for_closed_issue;
    const byProject = new Map(folders.map(f => [f.project, f]));
    assert(byProject.has('issue-804') && byProject.get('issue-804').issue_number === 804,
      '#903 control: a closed PRIMARY must still be reported, unchanged, got: ' + JSON.stringify(folders));
    assert(byProject.has('bundle-800-801') && byProject.get('bundle-800-801').issue_number === 801,
      '#903: a bundle folder whose MEMBER 801 is closed must be reported naming 801 — the candidate set '
        + 'read only the scalar issue_number, so 801 was never probed at all, got: ' + JSON.stringify(folders));
    assert(!byProject.has('bundle-802-803'),
      '#903 over-report control: a bundle with no closed member must produce NO finding, got: '
        + JSON.stringify(byProject.get('bundle-802-803')));
    assert(folders.length === 2,
      '#903: one finding per folder, never one per closed member, got: ' + JSON.stringify(folders));
    console.log('testClosureAuditBundleMemberActiveFolderClosed903: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// testClosureAuditScopedExecuteSparesOtherProjects903 stood here — a scoped --execute's repair of
// stale_roadmap_sources (bundle-member scoping, out-of-scope survival, whole-mirror ROADMAP.md
// regeneration). executeRepairs' roadmap-source repair is retired in slice 4 of ADR 0018 §5.
// Deleted with the mechanism; the surviving executeRepairs coverage is label removal
// (testClosureAuditExecuteRepairsLabels) and detection-timeout propagation.

function testClosureAuditCitationMissingOmittedWhenEmpty903() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-903-citation-empty-'));
  try {
    initGitRepo(tmp);
    // An archive whose summary cites an artifact that IS present. The class must then be absent
    // from the envelope entirely — that omission is what keeps the repository-wide default report
    // unchanged on a repo carrying none of this drift.
    const dir = plantArchive903(tmp, 'issue-920', { status: 'closed', step: 'complete', issue_number: 920 });
    fs.mkdirSync(path.join(dir, '.cache'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.cache', 'final-validation.md'), 'verdict: pass\n');
    fs.writeFileSync(path.join(dir, 'finalization-summary.md'),
      '# Finalization Summary\n\nEvidence: `.cache/final-validation.md`\n');

    const result = runClosureAuditOffline([], tmp);
    assert(!('archive_summary_citation_missing' in result.drift),
      '#901: the citation class must be OMITTED from drift when empty, got: '
        + JSON.stringify(result.drift.archive_summary_citation_missing));
    assert(!('archive_summary_citation_missing' in result.counts),
      '#901: ... and from counts, got keys: ' + JSON.stringify(Object.keys(result.counts)));
    // Control: the archive IS being read — its resolved citation is why nothing was reported, and
    // the other archive class stayed quiet too (the identity anchor is present).
    assert(Array.isArray(result.drift.archive_content_incomplete)
      && result.drift.archive_content_incomplete.length === 0,
      '#901 control: a complete archive must produce no archive drift at all, got: '
        + JSON.stringify(result.drift.archive_content_incomplete));

    const executed = runClosureAuditOffline(['--execute'], tmp);
    assert(!('archive_summary_citation_missing' in executed.reported_not_repaired),
      '#901: ... and from reported_not_repaired, got keys: '
        + JSON.stringify(Object.keys(executed.reported_not_repaired)));
    console.log('testClosureAuditCitationMissingOmittedWhenEmpty903: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditCitationMissingReportsAndExcludesJsonl903() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-903-citation-'));
  try {
    initGitRepo(tmp);
    // (i) a backticked citation whose file is gone — the real-loss shape.
    const a = plantArchive903(tmp, 'issue-921', { status: 'closed', step: 'complete', issue_number: 921 });
    fs.writeFileSync(path.join(a, 'finalization-summary.md'),
      '# Finalization Summary\n\nChain receipt: `.cache/chain-receipt.json` (headSha: 05590e2f)\n');
    // (ii) an UNBACKTICKED table-cell citation. Requiring backticks reads tidier and silently drops
    //      this shape, which is a measured true positive in this repo's own archive corpus.
    const b = plantArchive903(tmp, 'issue-922', { status: 'closed', step: 'complete', issue_number: 922 });
    fs.writeFileSync(path.join(b, 'finalization-summary.md'),
      '# Finalization Summary\n\n| agent | status | output |\n|---|---|---|\n'
      + '| doc-updater | invoked | .cache/doc-updater.md (report) |\n');
    // (iii) a `.jsonl` append-log citation whose file is absent must produce NO finding: disposing
    //       of it is a DOCUMENTED step, so absence there is correct rather than lost. The token must
    //       also never truncate to `.cache/release-receipt.json`, which WOULD be reported missing.
    const c = plantArchive903(tmp, 'issue-923', { status: 'closed', step: 'complete', issue_number: 923 });
    fs.writeFileSync(path.join(c, 'finalization-summary.md'),
      '# Finalization Summary\n\nDelete `.cache/release-receipt.jsonl` before the next release.\n');
    // (iv) over-report control: an archive with no summary at all must stay quiet.
    plantArchive903(tmp, 'issue-924', { status: 'closed', step: 'complete', issue_number: 924 });

    const result = runClosureAuditOffline([], tmp);
    const found = result.drift.archive_summary_citation_missing;
    assert(Array.isArray(found),
      '#901: a cited-but-absent artifact must be reported as archive_summary_citation_missing, got drift: '
        + JSON.stringify(result.drift));
    const byProject = new Map(found.map(f => [f.project, f]));
    assert(byProject.has('issue-921')
      && byProject.get('issue-921').cited_missing.join(',') === '.cache/chain-receipt.json',
      '#901: a backticked citation of an absent artifact must be reported with its path, got: '
        + JSON.stringify(found));
    assert(byProject.has('issue-922')
      && byProject.get('issue-922').cited_missing.join(',') === '.cache/doc-updater.md',
      '#901: backticks must NOT be required — an unbackticked table-cell citation is a measured true '
        + 'positive, got: ' + JSON.stringify(found));
    assert(!byProject.has('issue-923'),
      '#901: a `.jsonl` append-log citation must be EXCLUDED, and its token must never read as `.json`, got: '
        + JSON.stringify(byProject.get('issue-923')));
    assert(!byProject.has('issue-924'),
      '#901 over-report control: an archive with no finalization-summary.md must stay quiet, got: '
        + JSON.stringify(byProject.get('issue-924')));
    assert(result.counts.archive_summary_citation_missing === 2,
      '#901: counts must cover the class, got: ' + JSON.stringify(result.counts.archive_summary_citation_missing));

    // Report-only in both modes: the cited bytes are gone and nothing here can rebuild them.
    const executed = runClosureAuditOffline(['--execute'], tmp);
    const notRepaired = executed.reported_not_repaired.archive_summary_citation_missing;
    assert(Array.isArray(notRepaired) && notRepaired.length === 2,
      '#901: --execute must carry the class under reported_not_repaired, got: '
        + JSON.stringify(executed.reported_not_repaired));
    assert(fs.existsSync(path.join(a, 'finalization-summary.md'))
      && fs.existsSync(path.join(a, 'workflow-state.md')),
      '#901: --execute must never delete or rewrite an archive whose citation did not resolve');
    console.log('testClosureAuditCitationMissingReportsAndExcludesJsonl903: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// Unit-level: the four pure helpers #903 added, called in-process. No spawn buys anything here, and
// archiveNameMatchesProject's bare-prefix rule is a one-line decision that a scoped run can only
// observe indirectly.
function testClosureAuditScopingHelpers903() {
  const {
    archiveNameMatchesProject, stateIssueNumbers, driftIsClean, parseArgs, partitionDriftByScope
  } = require('./kaola-workflow-closure-audit.js');

  assert(archiveNameMatchesProject('bundle-700-701', 'bundle-700-701') === true,
    '#903: the exact archive name must match');
  assert(archiveNameMatchesProject('bundle-700-701.archived-2026-01-01T00-00-00-000Z', 'bundle-700-701') === true,
    '#903: a .archived-<ts> archive must match its project');
  assert(archiveNameMatchesProject('bundle-700-701.discarded-2026-01-01T00-00-00-000Z', 'bundle-700-701') === true,
    '#903: a .discarded-<ts> archive must match its project');
  assert(archiveNameMatchesProject('bundle-700-701-extra', 'bundle-700-701') === false,
    '#903: a bare PREFIX must NOT match — it would swallow an unrelated project whose name extends this one');
  assert(archiveNameMatchesProject('bundle-700-701.something', 'bundle-700-701') === false,
    '#903: only the two known suffixes match, not any dotted sibling');
  assert(archiveNameMatchesProject('bundle-700', 'bundle-700-701') === false,
    '#903: a shorter name must not match');

  assert(JSON.stringify(stateIssueNumbers('issue_number: 700\nissue_numbers: 701,700,703\n')) === '[700,701,703]',
    '#903: members and primary, sorted and deduped');
  assert(JSON.stringify(stateIssueNumbers('issue_number: 700\n')) === '[700]',
    '#903: a single-issue run suppresses issue_numbers, so the scalar primary must still resolve');
  assert(JSON.stringify(stateIssueNumbers('status: closed\n')) === '[]',
    '#903: a record with no issue number resolves to nothing, never to NaN');

  assert(driftIsClean({ a: [], b: [] }) === true,
    '#903 control: every class evaluated and empty IS clean — without this leg the fail-closed '
      + 'assertions below would pass on an always-false verdict');
  assert(driftIsClean({ a: [], b: 'skipped_offline' }) === false,
    '#903: a class that did not evaluate cannot prove clean');
  assert(driftIsClean({ a: [], b: 'skipped_timeout' }) === false,
    '#903: a timed-out class cannot prove clean either');
  assert(driftIsClean({ a: [1] }) === false, '#903: a finding is not clean');

  // The same fail-closed rule applied to the SCOPE rather than to a class: an unresolvable --project
  // accepted via --issue answered clean:true over a project carrying real drift. Nothing was read for
  // the name, so no class speaks for the project the operator named.
  assert(driftIsClean({ a: [] }, { project_unresolved: true }) === false,
    '#903: a scope whose --project resolved to NOTHING can never read clean, whatever the classes say '
      + 'about the issue numbers that came in beside it');
  assert(driftIsClean({ a: [] }, { project_unresolved: false }) === true,
    '#903 control: a RESOLVED scope over an evaluated empty drift set still reads clean — without this '
      + 'leg the assertion above is satisfied by a verdict that never says clean');
  assert(driftIsClean({ a: [] }) === true,
    '#903 control: the scope argument is optional, so the drift-only rule stays callable on its own');

  assert(parseArgs(['--execute']).execute === true, '#903: --execute must still parse');
  assert(parseArgs(['--project', 'p', '--issue', '7', '--issue', '9']).issues.join(',') === '7,9',
    '#903: --issue is repeatable');
  assert(parseArgs(['--project', 'a', '--project', 'b']).project === 'b',
    '#903: --project is not repeatable — a second one overwrites the first');
  // The last entry: a project is ONE folder name under kaola-workflow/, never a path. `--project
  // ../../outside` resolved a workflow-state.md from OUTSIDE the repository and answered a scoped
  // verdict on it at exit 0. The ACCEPTING control is three assertions above — `--project b` still
  // parses — so this list cannot be satisfied by a validator that rejects every name.
  for (const argv of [['--bogus'], ['--project'], ['--issue'], ['--issue', 'abc'], ['--issue', '0700'],
    ['--project', '../../outside']]) {
    let threw = false;
    try { parseArgs(argv); } catch (_) { threw = true; }
    assert(threw, '#903: parseArgs must throw for ' + JSON.stringify(argv));
  }

  // A skipped class lands in BOTH halves verbatim; an issue-keyed class splits.
  const parts = partitionDriftByScope(
    { stale_roadmap_sources: [{ issue_number: 1 }, { issue_number: 2 }], stale_in_progress_labels: 'skipped_offline' },
    { project: null, issues: new Set([1]), archive_name_ambiguous: false }
  );
  assert(JSON.stringify(parts.inScope.stale_roadmap_sources) === '[{"issue_number":1}]'
    && JSON.stringify(parts.outScope.stale_roadmap_sources) === '[{"issue_number":2}]',
    '#903: an issue-keyed class must split by the scope\'s issue set, got: ' + JSON.stringify(parts));
  assert(parts.inScope.stale_in_progress_labels === 'skipped_offline'
    && parts.outScope.stale_in_progress_labels === 'skipped_offline',
    '#903: a skipped class must appear in BOTH halves verbatim, got: ' + JSON.stringify(parts));
  console.log('testClosureAuditScopingHelpers903: PASSED');
}

function testClosureAuditScopedArchiveNameMatch903() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-903-attr-name-'));
  try {
    initGitRepo(tmp);
    // A live folder so --project resolves; two INCOMPLETE archives whose names differ only by a
    // trailing segment, so the name-match rule is the only thing deciding which is in scope. The
    // two archive classes can be attributed BY NAME ONLY: the artifact they report missing is
    // itself the record that would have carried an issue number.
    plantActiveFolder(tmp, 'proj-a', 930, null);
    plantArchive903(tmp, 'proj-a', null);
    plantArchive903(tmp, 'proj-a-extra', null);
    // A DOTTED sibling that is not one of the two archive suffixes. Planted COMPLETE so it adds no
    // finding and the counts below are untouched — it is here for the ambiguity assertion only: the
    // rule counts folders matching by NAME SHAPE, and a naive "more than one archive mentions this
    // project" count would flag `proj-a` on the strength of these two neighbours alone.
    plantArchive903(tmp, 'proj-a.something', { status: 'closed', step: 'complete', issue_number: 939 });

    const scoped = runClosureAuditOffline(['--project', 'proj-a'], tmp);
    const inFindings = scoped.current_project_drift.archive_content_incomplete;
    const outFindings = scoped.repository_drift_outside_scope.archive_content_incomplete;
    assert(inFindings.length === 1 && inFindings[0].project === 'proj-a',
      '#903: the name-matched archive must be in scope, got: ' + JSON.stringify(inFindings));
    assert(inFindings[0].attribution === 'name_match',
      '#903: a scoped archive finding must say HOW it was attributed, got: ' + JSON.stringify(inFindings[0]));
    assert(outFindings.length === 1 && outFindings[0].project === 'proj-a-extra',
      '#903: a bare prefix must not pull proj-a-extra into scope, and it must still be REPORTED; got in='
        + JSON.stringify(inFindings) + ' out=' + JSON.stringify(outFindings));
    assert(!('attribution' in outFindings[0]),
      '#903: out-of-scope findings pass through verbatim — attribution is a scoped annotation only, got: '
        + JSON.stringify(outFindings[0]));
    assert(!('archive_name_ambiguous' in scoped.scope),
      '#903: archive_name_ambiguous must be omitted when the name match is unambiguous, got: '
        + JSON.stringify(scoped.scope));

    // The repository-wide envelope must be untouched by the annotation.
    const unscoped = runClosureAuditOffline([], tmp);
    assert(unscoped.drift.archive_content_incomplete.length === 2
      && unscoped.drift.archive_content_incomplete.every(f => !('attribution' in f)),
      '#903: no unscoped finding may carry attribution, got: '
        + JSON.stringify(unscoped.drift.archive_content_incomplete));
    console.log('testClosureAuditScopedArchiveNameMatch903: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditScopedArchiveAmbiguousMatch903() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-903-attr-ambig-'));
  const ts = '2026-01-01T00-00-00-000Z';
  try {
    initGitRepo(tmp);
    // A bare `P` residue directory beside its timestamped sibling. One of the two is the archive and
    // the other is residue, and neither folder says which — so the report says the attribution is
    // ambiguous instead of adopting one reading silently. Contrast with the name_match scenario
    // above: same code path, one fixture line different, a different answer.
    plantArchive903(tmp, 'proj-b', null);
    plantArchive903(tmp, 'proj-b.archived-' + ts, { status: 'closed', step: 'complete', issue_number: 931 });

    const scoped = runClosureAuditOffline(['--project', 'proj-b'], tmp);
    assert(scoped.scope.archive_name_ambiguous === true,
      '#903: a bare `P` archive beside a timestamped sibling is ambiguous and must be REPORTED, never '
        + 'guessed, got: ' + JSON.stringify(scoped.scope));
    assert(scoped.scope.state_file === 'kaola-workflow/archive/proj-b.archived-' + ts + '/workflow-state.md',
      '#903: the resolver must fall through the anchor-less bare dir to the sibling that HAS a state '
        + 'file, got: ' + JSON.stringify(scoped.scope.state_file));
    assert(JSON.stringify(scoped.scope.issue_numbers) === '[931]',
      '#903: the scope must come from the record it actually read, got: ' + JSON.stringify(scoped.scope.issue_numbers));
    const inFindings = scoped.current_project_drift.archive_content_incomplete;
    assert(inFindings.length === 1 && inFindings[0].project === 'proj-b',
      '#903: the residue directory is the incomplete archive and it is in scope, got: ' + JSON.stringify(inFindings));
    assert(inFindings[0].attribution === 'ambiguous_name_match',
      '#903: an ambiguous name match must say so rather than implying a clean match, got: '
        + JSON.stringify(inFindings[0]));
    assert(scoped.repository_drift_outside_scope.archive_content_incomplete.length === 0,
      '#903 control: nothing else is incomplete here, so the out-of-scope half must be empty, got: '
        + JSON.stringify(scoped.repository_drift_outside_scope.archive_content_incomplete));

    // TWO TIMESTAMPED SIBLINGS AND NO BARE `P` — the commonest residue pair, and MEASURED invisible:
    // the rule demanded a bare `P` plus a suffixed sibling, so the scope adopted one of the two records
    // silently. Both halves of that defect are pinned here, because either alone still lies:
    //   * the FLAG — more than one archive folder matches, so the attribution cannot be clean;
    //   * the STAMP — annotateAttribution keyed on `finding.project === scope.project`, which only ever
    //     matched the bare-`P` half, so a timestamped sibling read `name_match` even when the flag fired.
    // Two shapes, because the suffix set has two members and a rule can be written for one of them.
    const ts2 = '2026-02-02T00-00-00-000Z';
    for (const [label, sibling] of [['archived', '.archived-' + ts2], ['discarded', '.discarded-' + ts2]]) {
      const pairTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-903-attr-ambig-pair-'));
      try {
        initGitRepo(pairTmp);
        // The record-bearing sibling the scope resolves through, and an anchor-LESS sibling whose
        // finding is what must carry the ambiguous stamp. No bare `P` anywhere.
        plantArchive903(pairTmp, 'proj-c.archived-' + ts, { status: 'closed', step: 'complete', issue_number: 941 });
        plantArchive903(pairTmp, 'proj-c' + sibling, null);

        const pair = runClosureAuditOffline(['--project', 'proj-c'], pairTmp);
        assert(pair.scope.archive_name_ambiguous === true,
          '#903 (' + label + '): two archive folders match `proj-c` and no bare `P` exists — the scope '
            + 'must report the ambiguity instead of adopting one record silently, got: ' + JSON.stringify(pair.scope));
        assert(pair.scope.state_file === 'kaola-workflow/archive/proj-c.archived-' + ts + '/workflow-state.md',
          '#903 (' + label + '): the scope still resolves through the sibling that HAS a record, got: '
            + JSON.stringify(pair.scope.state_file));
        const pairFindings = pair.current_project_drift.archive_content_incomplete;
        assert(pairFindings.length === 1 && pairFindings[0].project === 'proj-c' + sibling,
          '#903 (' + label + '): the anchor-less sibling must be pulled into scope by name shape, got: '
            + JSON.stringify(pairFindings));
        assert(pairFindings[0].attribution === 'ambiguous_name_match',
          '#903 (' + label + '): a TIMESTAMPED sibling\'s finding must carry the ambiguous stamp too — '
            + 'keyed on the bare project name it read as an unqualified name_match while the scope itself '
            + 'said ambiguous, so the two halves of one report disagreed; got: ' + JSON.stringify(pairFindings[0]));
      } finally {
        fs.rmSync(pairTmp, { recursive: true, force: true });
      }
    }

    // NEGATIVE CONTROL — a single matching archive folder is not ambiguous, and its finding keeps the
    // unqualified stamp. A count rule that flagged anything it could see, or a stamp that said
    // `ambiguous_name_match` unconditionally, would look identical to a working one on the legs above.
    // It repeats the name_match scenario's fixture shape deliberately: a control belongs beside the
    // assertions it discriminates, not one scenario away.
    const soloTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-903-attr-ambig-solo-'));
    try {
      initGitRepo(soloTmp);
      plantActiveFolder(soloTmp, 'proj-solo', 942, null);
      plantArchive903(soloTmp, 'proj-solo', null);
      const solo = runClosureAuditOffline(['--project', 'proj-solo'], soloTmp);
      assert(!('archive_name_ambiguous' in solo.scope),
        '#903 control: ONE matching archive folder is unambiguous and the key stays omitted, got: '
          + JSON.stringify(solo.scope));
      const soloFindings = solo.current_project_drift.archive_content_incomplete;
      assert(soloFindings.length === 1 && soloFindings[0].attribution === 'name_match',
        '#903 control: and its finding keeps the unqualified stamp, got: ' + JSON.stringify(soloFindings));
    } finally {
      fs.rmSync(soloTmp, { recursive: true, force: true });
    }

    // WHAT THE COUNT IS COUNTING. The rule reads the band `withFileTypes` and keeps only directories,
    // and until this leg NOTHING armed that filter: deleting it left every scenario above green,
    // because every entry those fixtures plant is already a directory. So the rule's own premise —
    // that an archive is a FOLDER — was untested, and a band entry of any other kind counted.
    //
    // The fixture is the solo control above plus ONE regular file, so the axis is the entry's TYPE and
    // nothing else. The file's name deliberately matches the `<project>.archived-<ts>` shape, which is
    // exactly what a half-finished `mv`, a tar member, or an editor swap file leaves lying in the band.
    // Both halves of the annotation discriminate: with the filter gone the scope grows an
    // `archive_name_ambiguous: true` it has no basis for, AND the real archive's finding is downgraded
    // from `name_match` to `ambiguous_name_match` — a report that tells the operator its own
    // attribution cannot be trusted, on the strength of a file.
    //
    // No export was needed. `archiveNameIsAmbiguous` stays module-private: the CLI's scope envelope
    // already carries the answer, so the previously-declined widening of the module surface is not
    // what stood between this branch and a pin.
    const fileTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-903-attr-ambig-file-'));
    try {
      initGitRepo(fileTmp);
      plantActiveFolder(fileTmp, 'proj-file', 943, null);
      plantArchive903(fileTmp, 'proj-file', null);
      const bandFile = path.join(fileTmp, 'kaola-workflow', 'archive', 'proj-file.archived-' + ts);
      fs.writeFileSync(bandFile, 'a regular file, not an archive\n');
      assert(fs.statSync(bandFile).isFile(),
        '#903 fixture premise: the planted band entry must be a regular FILE — the whole leg is about '
          + 'the entry TYPE, so a fixture that wrote a directory here would repeat the solo control');

      const filed = runClosureAuditOffline(['--project', 'proj-file'], fileTmp);
      assert(!('archive_name_ambiguous' in filed.scope),
        '#903: a regular FILE in the archive band whose name matches the project must not count as a '
          + 'second archive — an archive is a folder, and counting anything else reports an ambiguity '
          + 'that does not exist; got: ' + JSON.stringify(filed.scope));
      const filedFindings = filed.current_project_drift.archive_content_incomplete;
      assert(filedFindings.length === 1 && filedFindings[0].project === 'proj-file',
        '#903: the one real archive is still the only finding — the file is not an archive and must '
          + 'not become one; got: ' + JSON.stringify(filedFindings));
      assert(filedFindings[0].attribution === 'name_match',
        '#903: and its attribution stays unqualified. This is the second half of the same defect: a '
          + 'miscounted band entry does not merely add a flag, it downgrades a correct attribution to '
          + '`ambiguous_name_match`, so the report disowns a reading that was never in doubt; got: '
          + JSON.stringify(filedFindings[0]));
    } finally {
      fs.rmSync(fileTmp, { recursive: true, force: true });
    }
    console.log('testClosureAuditScopedArchiveAmbiguousMatch903: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testContractValidatorOfflineSkip() {
  const contractsScript = path.join(__dirname, 'validate-workflow-contracts.js');
  // The one envelope proof for this CLI: invoked with no argv under OFFLINE it must exit 0.
  // spawn-class: cli-contract
  const result = spawnSync(process.execPath, [contractsScript], {
    encoding: 'utf8',
    env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
  });
  assert(
    result.status === 0,
    'contracts script must exit 0 when KAOLA_WORKFLOW_OFFLINE=1, got: ' + result.status + '\nstderr: ' + result.stderr
  );
  console.log('testContractValidatorOfflineSkip: PASSED');
}

function testContractValidatorReflowTolerant() {
  // issue #276 RED→GREEN: assertConcept must tolerate a multi-word phrase
  // split across a newline + indentation (cosmetic Markdown reflow).
  const contractsModule = require('./validate-workflow-contracts.js');
  const { assertConcept } = contractsModule;
  const root = path.resolve(__dirname, '..');
  const tmpDir = fs.mkdtempSync(path.join(root, '.kw-contract-fixture-'));
  try {
    // Fixture A: phrase "halt for consent" wrapped across a line break.
    // assertConcept must NOT throw (concept is still present — norm collapses whitespace).
    const fixtureA = path.join(tmpDir, 'fixture-a.md');
    fs.writeFileSync(fixtureA,
      '# Doc\nThe system will halt for\n   consent before proceeding.\n');
    const relA = path.relative(root, fixtureA);
    let threw = false;
    try {
      assertConcept(relA, 'consent halt', ['halt for consent']);
    } catch (_) {
      threw = true;
    }
    assert(!threw,
      'testContractValidatorReflowTolerant: assertConcept must NOT throw for a ' +
      'line-wrapped phrase (norm should collapse whitespace)');

    // Fixture B: phrase "halt for consent" entirely absent — must still throw.
    const fixtureB = path.join(tmpDir, 'fixture-b.md');
    fs.writeFileSync(fixtureB,
      '# Doc\nThe system proceeds normally.\n');
    const relB = path.relative(root, fixtureB);
    let threwB = false;
    try {
      assertConcept(relB, 'consent halt', ['halt for consent']);
    } catch (_) {
      threwB = true;
    }
    assert(threwB,
      'testContractValidatorReflowTolerant: assertConcept must THROW when phrase is absent');

    console.log('testContractValidatorReflowTolerant: PASSED');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function testContractValidatorMissingTag() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-contracts-missing-tag-'));
  try {
    const binDir = path.join(tmp, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    // Mock git as a real executable shell script that always exits 1 (tag not found)
    const gitMock = path.join(binDir, 'git');
    fs.writeFileSync(gitMock, '#!/bin/sh\nexit 1\n');
    fs.chmodSync(gitMock, 0o755);
    const contractsScript = path.join(__dirname, 'validate-workflow-contracts.js');
    // An environment-fault probe: `git` is replaced on PATH by a binary that always fails, so
    // what is asserted is what the CLI does when its environment cannot answer at all.
    // spawn-class: environment
    const result = spawnSync(process.execPath, [contractsScript], {
      encoding: 'utf8',
      env: {
        ...process.env,
        KAOLA_WORKFLOW_OFFLINE: '0',
        PATH: binDir + path.delimiter + (process.env.PATH || '')
      }
    });
    assert(
      result.status !== 0,
      'contracts script must exit non-zero when git tag is absent, got: ' + result.status
    );
    assert(
      (result.stderr || '').includes('kaola-workflow--v'),
      'error message must include "kaola-workflow--v", got: ' + JSON.stringify(result.stderr)
    );
    console.log('testContractValidatorMissingTag: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// issue #402: the release-tag-is-ancestor-of-HEAD guard. Pure-function coverage
// with injected git primitives (no real repo): an ancestor tag passes, an
// orphaned (rebased) tag reds, an absent or indeterminate tag stays inert so a
// legitimately-tagged release never false-fails.
function testTagAncestorGuard402() {
  const { tagAncestry } = require('./release-surface-drift');
  // Ancestor tag -> ok:true reason ok.
  const ok = tagAncestry('/repo', 'kaola-workflow--v1.0.0', 'HEAD', {
    tagTarget: () => 'deadbee', isAncestor: () => true,
  });
  assert(ok.ok === true && ok.reason === 'ok',
    '#402: an ancestor tag must pass, got ' + JSON.stringify(ok));
  // Orphaned tag (rebase hazard) -> ok:false reason tag_not_ancestor_of_head.
  const orphan = tagAncestry('/repo', 'kaola-workflow--v1.0.0', 'HEAD', {
    tagTarget: () => 'orphan1', isAncestor: () => false,
  });
  assert(orphan.ok === false && orphan.reason === 'tag_not_ancestor_of_head',
    '#402: an orphaned tag must red, got ' + JSON.stringify(orphan));
  // Absent tag -> inert ok:true reason tag_absent (existing tag-existence assert owns absence).
  const absent = tagAncestry('/repo', 'kaola-workflow--vNONE', 'HEAD', {
    tagTarget: () => null, isAncestor: () => false,
  });
  assert(absent.ok === true && absent.reason === 'tag_absent',
    '#402: an absent tag must stay inert, got ' + JSON.stringify(absent));
  // Indeterminate ancestry (shallow clone / git error) -> inert ok:true.
  const indet = tagAncestry('/repo', 'kaola-workflow--v1.0.0', 'HEAD', {
    tagTarget: () => 'shallow', isAncestor: () => null,
  });
  assert(indet.ok === true && indet.reason === 'ancestry_indeterminate',
    '#402: an indeterminate ancestry must stay inert, got ' + JSON.stringify(indet));
  console.log('testTagAncestorGuard402: PASSED');
}

// ---------------------------------------------------------------------------
// Issue #223 — three lifecycle fixes (tests written first, RED before fixes)
// ---------------------------------------------------------------------------

// Test 1: watch-pr CLOSED path (archive=abandoned) must report closure_invariants clean.
//
// ADR 0018 §5: the ORIGINAL #13 regression this pinned was "checkClosureInvariants fires
// roadmap-source-absent + roadmap-mirror-clean even when the PR was CLOSED (archive=abandoned),
// because archiveProjectDir skips roadmap cleanup for 'abandoned'." checkClosureInvariants no
// longer evaluates any roadmap invariant AT ALL, for any archive disposition (claim.js:3033-3038)
// — there is nothing left for an abandoned close to wrongly fire, so that specific regression is
// now structurally unreachable rather than fixed. The setup that made it reachable (a planted
// roadmap source + a generated ROADMAP.md mirror containing #920) is retired with it. What
// survives, and is not covered elsewhere (testWatchPrMergedClosureReceipt covers the MERGED path
// only), is that a CLOSED (not merged) PR resolves to archive:'abandoned' and still reports
// closure_invariants.ok:true — kept below under its actual current meaning.
function testWatchPrAbandonedClosureInvariantsClean() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-watchpr-abandoned-inv-'));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    plantActiveFolder(tmp, 'issue-920', 920, null);
    // Patch workflow-state.md to sink:pr with a fake pr_url
    const stateFilePath = path.join(tmp, 'kaola-workflow', 'issue-920', 'workflow-state.md');
    let state = fs.readFileSync(stateFilePath, 'utf8');
    state = state.replace(/^sink:\s*.*$/m, 'sink: pr');
    if (!state.match(/^pr_url:/m)) state += 'pr_url: https://github.com/test/repo/pull/920\n';
    fs.writeFileSync(stateFilePath, state);
    // gh shim: PR state is CLOSED; label edit succeeds (so claim_label_removed = removed)
    fs.mkdirSync(binDir, { recursive: true });
    writeShimFiles(path.join(binDir, 'gh'), [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('pr view')) { process.stdout.write('{\"state\":\"CLOSED\",\"number\":920}\\n'); }",
      "else if (a.includes('issue edit') && a.includes('--remove-label')) { process.stdout.write('{}\\n'); }",
      "else if (a.includes('issue comment')) { process.stdout.write('{}\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const result = runClaimOnline(['watch-pr'], tmp, binDir);
    assert(
      Array.isArray(result.cleanups) && result.cleanups.length > 0,
      'watch-pr must emit cleanups for CLOSED PR, got: ' + JSON.stringify(result)
    );
    const cleanup = result.cleanups[0];
    assert(
      cleanup.receipt && cleanup.receipt.archive === 'abandoned',
      'cleanups[0].receipt.archive must be abandoned, got: ' + JSON.stringify(cleanup.receipt)
    );
    assert(
      cleanup.closure_invariants && cleanup.closure_invariants.ok === true,
      'cleanups[0].closure_invariants.ok must be true for an abandoned (CLOSED, not merged) PR, got: ' + JSON.stringify(cleanup.closure_invariants)
    );
    console.log('testWatchPrAbandonedClosureInvariantsClean: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// Test 2: claimProject must reclaim a stateless orphan dir (no workflow-state.md)
// and still refuse a dir that has an active workflow-state.md.
function testClaimReclaimsStatelessOrphanDir() {
  // #14 regression: EEXIST always returns target_occupied even when the dir has
  // no workflow-state.md (crash between mkdir and writeState). Fix: check for
  // stateFile existence in the EEXIST branch; fall through if absent.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-claim-orphan-'));
  try {
    initGitRepo(tmp);
    // Positive: orphan dir (mkdir succeeded, writeState never ran)
    const orphanDir = path.join(tmp, 'kaola-workflow', 'issue-888');
    fs.mkdirSync(orphanDir, { recursive: true });
    assert(!fs.existsSync(path.join(orphanDir, 'workflow-state.md')), 'fixture: no state file should exist');
    const result = json(runNode(claimScript, ['claim', '--project', 'issue-888'], tmp));
    assert(
      result.status === 'acquired',
      '#14 POSITIVE: orphan dir must be reclaimed (status acquired), got: ' + JSON.stringify(result)
    );
    assert(
      fs.existsSync(path.join(tmp, 'kaola-workflow', 'issue-888', 'workflow-state.md')),
      '#14 POSITIVE: workflow-state.md must be written after reclaim'
    );
    // Negative boundary: dir with a non-active (status: closed) state file must return
    // target_occupied. readActiveFolders skips inactive status, so claimProject reaches
    // the EEXIST guard added by fix #14 and checks existsSync(stateFile).
    const occupied = path.join(tmp, 'kaola-workflow', 'issue-889');
    fs.mkdirSync(occupied, { recursive: true });
    fs.writeFileSync(path.join(occupied, 'workflow-state.md'),
      ['# Kaola-Workflow State', '', '## Project', 'name: issue-889', 'status: closed', ''].join('\n'));
    const result2 = json(runNode(claimScript, ['claim', '--project', 'issue-889'], tmp));
    assert(
      result2.status === 'target_occupied',
      '#14 NEGATIVE: dir with non-active state file must return target_occupied, got: ' + JSON.stringify(result2)
    );
    // The routing surfaces tell an agent to classify a non-acquiring claim by `result` ALONE, so
    // every non-acquiring envelope has to carry one. This arm and the closed-target arm below are
    // the two that did not, and `result` is a FREE field here — the fixture selected this row by
    // its state file, and `status` is asserted separately above.
    assert(
      result2.result === 'refuse',
      'a non-acquiring claim must be classifiable by `result` alone; the occupied arm carried none: '
        + JSON.stringify(result2)
    );
    // Same property on the closed-target arm, which needs a live probe rather than a folder.
    const binDir890 = path.join(tmp, 'bin890');
    writeBundleGhMockScript(binDir890, { closedIssues: [890] });
    const result3 = runClaimOnline(['claim', '--project', 'issue-890', '--issue', '890'], tmp, binDir890);
    assert(
      result3.status === 'user_target_closed' && result3.result === 'refuse',
      'a claim against a CLOSED target must answer through `result`, got: ' + JSON.stringify(result3)
    );
    console.log('testClaimReclaimsStatelessOrphanDir: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// Test 3: cmdPatchBranch must guard against non-existent projects and unsafe names
function testPatchBranchGuards() {
  // #15 regression: patch-branch writes state for any project name including
  // non-existent and path-traversal names, creating arbitrary dirs. Fix: assert
  // isSafeName and activeByProject before updateState.

  // (a) ghost project: non-existent project → exit non-zero, dir not created
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-patchbranch-ghost-'));
    try {
      const before = json(runNode(claimScript, ['status'], tmp));
      const countBefore = before.count;
      const raw = spawnSync(process.execPath, [claimScript, 'patch-branch', '--project', 'ghost-proj', '--branch', 'workflow/ghost'], {
        cwd: tmp, encoding: 'utf8',
        env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
      });
      assert(raw.status !== 0, '#15(a): patch-branch ghost-proj must exit non-zero, got exit ' + raw.status);
      assert(!fs.existsSync(path.join(tmp, 'kaola-workflow', 'ghost-proj')), '#15(a): ghost-proj dir must not be created');
      const after = json(runNode(claimScript, ['status'], tmp));
      assert(after.count === countBefore, '#15(a): active count must not change');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  // (b) unsafe name: path-traversal project → exit 1 with 'unsafe project name'
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-patchbranch-escape-'));
    try {
      // argv sanitization at the shell boundary: a path-traversal --project value must map to exit
      // 1 and a stderr line naming the cause.
      // spawn-class: cli-contract
      const raw = spawnSync(process.execPath, [claimScript, 'patch-branch', '--project', '../escape-poc', '--branch', 'workflow/escape'], {
        cwd: tmp, encoding: 'utf8',
        env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
      });
      assert(raw.status === 1, '#15(b): patch-branch ../escape-poc must exit 1, got exit ' + raw.status);
      assert(
        raw.stderr.includes('unsafe project name'),
        '#15(b): stderr must contain "unsafe project name", got: ' + raw.stderr
      );
      assert(!fs.existsSync(path.join(path.dirname(tmp), 'escape-poc')), '#15(b): escape-poc must not be created outside kaola-workflow/');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  // (c) positive: active project → patch-branch succeeds
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-patchbranch-active-'));
    try {
      plantActiveFolder(tmp, 'issue-63', 63, null);
      const result = json(runNode(claimScript, ['patch-branch', '--project', 'issue-63', '--branch', 'workflow/issue-63'], tmp));
      assert(result.patched === true, '#15(c): patch-branch on active project must return patched:true');
      assert(result.branch === 'workflow/issue-63', '#15(c): branch must match');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  console.log('testPatchBranchGuards: PASSED');
}






// ---------------------------------------------------------------------------
// issue #267 — additive select() composition + runtime test coverage
// G1: select() composed with other shapes (validator fixtures)
// G2: multi-group select (validator fixture)
// G3: n/a propagation via next-action (runtime, unfrozen plan)
// G4: resume-check with select groups (runtime, frozen plan)
// G5: selector_source also a fanout member (probe-then-pin)
// ---------------------------------------------------------------------------






// ---------------------------------------------------------------------------
// issue #255 — adaptive handoff integration tests
// ---------------------------------------------------------------------------












// ===========================================================================
// issue #264 — hidden-local worktree path, gitignore, legacy cleanup, sink guard
// ===========================================================================

// Feature-detect signals (all absent until their owning node lands):
//   CLAIM_SIGNAL      = typeof claim.legacySiblingWorktreePathFor === 'function'  (impl-claim, node 8)
//   SINK_SIGNAL       = typeof require(sinkMergeScript).assertBranchHasNonWorkflowChanges === 'function'  (impl-sink-guard, node 2)

// Lazy signal accessors (evaluated once per test call, not at module load).
function claimSignal() {
  const claim = require(claimScript);
  return typeof claim.legacySiblingWorktreePathFor === 'function';
}
function sinkSignal() {
  return typeof require(sinkMergeScript).assertBranchHasNonWorkflowChanges === 'function';
}
// DELETED: planRunSignal(). It feature-detected `commands/kaola-workflow-plan-run.md`, a file this
// campaign deleted, and its sole consumer (testPlanRunWiredForWorktree) is already gone. A signal
// that can only ever answer false, read by nobody, is not a skip — it is dead weight that makes the
// registry look larger than the coverage.

// ── Strict (no feature-detect) — this node's own RED→GREEN ──────────────────

function testGitignoreCoversKw() {
  // AC2 (#264): repo .gitignore must contain a line equal to '.kw/' so the hidden
  // repo-local worktree container is never accidentally committed.
  const gitignorePath = path.join(repoRoot, '.gitignore');
  const lines = fs.readFileSync(gitignorePath, 'utf8').split('\n').map(l => l.trim());
  assert(lines.includes('.kw/'), '.gitignore must contain a line exactly equal to ".kw/" (AC2 #264); got lines: ' + JSON.stringify(lines));
  console.log('testGitignoreCoversKw: PASSED');
}

// ── INVERTED: testStartupJsonAndHiddenLocalWorktrees ────────────────────────
// (was testStartupJsonAndSiblingWorktrees)
// Signal = claimSignal() → assert <root>/.kw/worktrees/<project>
// Else    → assert old <parent>/<repo>.kw/<project> (keeps suite GREEN until impl-claim lands)

function testStartupJsonAndHiddenLocalWorktrees() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-startup-worktrees-'));
  // Legacy sibling path (old scheme) — may never be created by new code; harmless cleanup attempt below.
  const kwRoot = fs.realpathSync(tmp) + '.kw';
  try {
    initGitRepo(tmp);
    const binDir = path.join(tmp, 'bin');
    writeGhShimForStartup(binDir);

    const first = runClaimOnline(['startup', '--target-issue', '501'], tmp, binDir);

    if (claimSignal()) {
      // impl-claim landed: assert hidden-local path
      const wtRoot = path.join(fs.realpathSync(tmp), '.kw', 'worktrees');
      assert(first.worktree_path === path.join(wtRoot, 'issue-501'),
        'first worktree should be hidden-local path, got: ' + first.worktree_path);
      const second = runClaimOnline(['startup', '--target-issue', '502'], first.worktree_path, binDir);
      assert(second.worktree_path === path.join(wtRoot, 'issue-502'),
        'nested startup should still create canonical hidden-local worktree, got: ' + second.worktree_path);
      assert(!second.worktree_path.includes('issue-501/.kw'),
        'nested startup must not create issue-501/.kw paths');
    } else {
      // old sibling path still in effect
      assert(first.worktree_path === path.join(kwRoot, 'issue-501'),
        'first worktree should be canonical sibling path (pre-impl-claim), got: ' + first.worktree_path);
      const second = runClaimOnline(['startup', '--target-issue', '502'], first.worktree_path, binDir);
      assert(second.worktree_path === path.join(kwRoot, 'issue-502'),
        'nested startup should still create canonical sibling worktree, got: ' + second.worktree_path);
      assert(!second.worktree_path.includes('issue-501.kw'),
        'nested startup must not create issue-501.kw paths');
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
  }
  console.log('testStartupJsonAndHiddenLocalWorktrees: PASSED');
}

// ── INVERTED: testWorktreeAdaptiveProvisioned ────────────────────────────────
// (was testWorktreeAdaptiveSuppressed)
// Signal = claimSignal() → adaptive WITH KAOLA_WORKTREE_NATIVE=1 MUST now provision
// Else    → assert worktree_path === '' (old suppressed behavior)

function testWorktreeAdaptiveProvisioned() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-wt-adaptive-provisioned-'));
  const kwRoot = fs.realpathSync(tmp) + '.kw';
  try {
    initGitRepo(tmp);
    const binDir = path.join(tmp, 'bin');
    writeGhShimForStartup(binDir);
    // runClaimOnline hardcodes KAOLA_WORKTREE_NATIVE=1; adaptive is always legal (#538).
    const result = runClaimOnlineLastJson(
      ['startup', '--workflow-path', 'adaptive', '--target-issue', '507'],
      tmp, binDir);
    assert(result.claim === 'acquired', 'adaptive startup 507 should acquire');

    if (claimSignal()) {
      // impl-claim landed: adaptive now provisions
      const wtRoot = path.join(fs.realpathSync(tmp), '.kw', 'worktrees');
      assert(result.worktree_path === path.join(wtRoot, 'issue-507'),
        'adaptive path MUST provision a hidden-local worktree after impl-claim, got: ' + JSON.stringify(result.worktree_path));
      assert(result.worktree_error === undefined,
        'worktree_error must be absent when adaptive provisions successfully');
    } else {
      // old suppression still in effect
      assert(result.worktree_path === '',
        'adaptive path must NOT provision a worktree (old suppression, pre-impl-claim), got: ' + JSON.stringify(result.worktree_path));
      assert(result.worktree_error === undefined,
        'adaptive worktree suppression must not surface worktree_error (policy suppression, not a failed attempt)');
    }
    // Confirm the adaptive path was actually applied in both states.
    const state = fs.readFileSync(path.join(tmp, 'kaola-workflow', 'issue-507', 'workflow-state.md'), 'utf8');
    assert(/^workflow_path:\s*adaptive\s*$/m.test(state),
      'workflow-state.md must record workflow_path: adaptive');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
  }
  console.log('testWorktreeAdaptiveProvisioned: PASSED');
}

// ── NEW: testWorktreeHiddenLocalPath ─────────────────────────────────────────
// Signal = claimSignal() → assert full/fast claim produces hidden-local path + dir exists
// Else    → assert old sibling path (green now)

function testWorktreeHiddenLocalPath() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-wt-hidden-local-'));
  const kwRoot = fs.realpathSync(tmp) + '.kw';
  try {
    initGitRepo(tmp);
    const binDir = path.join(tmp, 'bin');
    writeGhShimForStartup(binDir);
    const result = runClaimOnline(['startup', '--target-issue', '510'], tmp, binDir);
    assert(result.claim === 'acquired', 'startup 510 should acquire');

    if (claimSignal()) {
      const expected = path.join(fs.realpathSync(tmp), '.kw', 'worktrees', 'issue-510');
      assert(result.worktree_path === expected,
        'worktree_path must be hidden-local after impl-claim, got: ' + result.worktree_path);
      assert(fs.existsSync(expected),
        'hidden-local worktree dir must exist after provisioning');
    } else {
      // old sibling scheme
      assert(result.worktree_path === path.join(kwRoot, 'issue-510'),
        'worktree_path must be sibling path (pre-impl-claim), got: ' + result.worktree_path);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
  }
  console.log('testWorktreeHiddenLocalPath: PASSED');
}

// ── NEW: testLegacyWorktreeCleanupDryRun ─────────────────────────────────────
// Signal = claimSignal() → the legacy-worktree-cleanup subcommand is recognized
// Else    → skip (early return, green)

function testLegacyWorktreeCleanupDryRun() {
  if (!claimSignal()) {
    // impl-claim not yet landed; subcommand does not exist — skip
    console.log('testLegacyWorktreeCleanupDryRun: SKIPPED (impl-claim pending)');
    return;
  }
  const claim = require(claimScript);
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-legacy-dryrun-')));
  const legacyContainer = path.dirname(tmp) + '/' + path.basename(tmp) + '.kw';
  const legacyWtPath = path.join(legacyContainer, 'issue-520');
  try {
    initGitRepo(tmp);
    // Register a worktree at the legacy sibling path using legacySiblingWorktreePathFor
    const computedLegacy = claim.legacySiblingWorktreePathFor(tmp, 'issue-520');
    assert(computedLegacy === legacyWtPath,
      'legacySiblingWorktreePathFor must return legacy sibling path, got: ' + computedLegacy);
    fs.mkdirSync(legacyWtPath, { recursive: true });
    G.git(tmp, ['worktree', 'add', '-b', 'workflow/issue-520', '--', legacyWtPath, 'HEAD'], { encoding: 'utf8' });

    // Run legacy-worktree-cleanup (dry-run is the default, no --execute)
    const r = runNode(claimScript, ['legacy-worktree-cleanup'], tmp);
    const out = JSON.parse(r.stdout);
    assert(out.dry_run === true, 'legacy-worktree-cleanup must be dry-run by default, got: ' + JSON.stringify(out));
    assert(Array.isArray(out.would_remove) && out.would_remove.some(p => p === legacyWtPath || p.includes('issue-520')),
      'dry_run would_remove must include the legacy worktree path, got: ' + JSON.stringify(out.would_remove));
    assert(fs.existsSync(legacyWtPath),
      'dry-run must NOT remove the worktree dir (AC3 dry-run-default)');
    assert(!('would_delete_branch' in out),
      'Option B: legacy-worktree-cleanup dry-run must NOT emit would_delete_branch, got: ' + JSON.stringify(out));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(legacyContainer, { recursive: true, force: true }); } catch (_) {}
  }
  console.log('testLegacyWorktreeCleanupDryRun: PASSED');
}

// ── NEW: testLegacyWorktreeCleanupDirtySkip ──────────────────────────────────
// Signal = claimSignal() → legacy worktree with uncommitted change must be skipped
// Else    → skip (early return, green)

function testLegacyWorktreeCleanupDirtySkip() {
  if (!claimSignal()) {
    console.log('testLegacyWorktreeCleanupDirtySkip: SKIPPED (impl-claim pending)');
    return;
  }
  const claim = require(claimScript);
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-legacy-dirty-')));
  const legacyContainer = path.dirname(tmp) + '/' + path.basename(tmp) + '.kw';
  const legacyWtPath = claim.legacySiblingWorktreePathFor(tmp, 'issue-521');
  try {
    initGitRepo(tmp);
    fs.mkdirSync(legacyWtPath, { recursive: true });
    G.git(tmp, ['worktree', 'add', '-b', 'workflow/issue-521', '--', legacyWtPath, 'HEAD'], { encoding: 'utf8' });
    // Plant an uncommitted change so the worktree is dirty
    fs.writeFileSync(path.join(legacyWtPath, 'dirty.txt'), 'dirty\n');

    // --execute without --force → dirty skip (AC4)
    const r1 = runNode(claimScript, ['legacy-worktree-cleanup', '--execute'], tmp);
    const out1 = JSON.parse(r1.stdout);
    assert(out1.dry_run === false, 'should be execute mode, got: ' + JSON.stringify(out1));
    assert(Array.isArray(out1.skipped_dirty) && out1.skipped_dirty.some(p => p === legacyWtPath || p.includes('issue-521')),
      'dirty worktree must appear in skipped_dirty (AC4), got: ' + JSON.stringify(out1.skipped_dirty));
    assert(fs.existsSync(legacyWtPath),
      'dirty worktree must NOT be removed without --force (AC4 dirty-safety)');

    // --execute --force → removes
    const r2 = runNode(claimScript, ['legacy-worktree-cleanup', '--execute', '--force'], tmp);
    const out2 = JSON.parse(r2.stdout);
    assert(Array.isArray(out2.removed) && out2.removed.some(p => p === legacyWtPath || p.includes('issue-521')),
      '--force should remove the dirty worktree, got: ' + JSON.stringify(out2.removed));
    assert(!fs.existsSync(legacyWtPath),
      'dirty worktree must be removed with --force');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(legacyContainer, { recursive: true, force: true }); } catch (_) {}
  }
  console.log('testLegacyWorktreeCleanupDirtySkip: PASSED');
}

// ── NEW: testAdaptiveWorktreeProvisionedE2E ──────────────────────────────────
// AC6+AC8 anchor: adaptive claim, plan+.cache in worktree, impl in worktree,
// commit-node barrier with worktree plan path, sink-merge → merged main contains impl file.
// Signal = worktree_path non-empty on adaptive claim (impl-claim + impl-plan-run)
// Else    → skip (early return, green)

function testAdaptiveWorktreeProvisionedE2E() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-e2e-adaptive-')));
  const kwRoot = tmp + '.kw';
  try {
    initGitRepo(tmp);
    const binDir = path.join(tmp, 'bin');
    writeGhShimForStartup(binDir);

    // Step 1: adaptive claim with NATIVE=1 (adaptive is always legal, #538)
    const sResult = runClaimOnlineLastJson(
      ['startup', '--workflow-path', 'adaptive', '--target-issue', '530'],
      tmp, binDir);
    assert(sResult.claim === 'acquired', 'adaptive startup 530 should acquire');

    if (!sResult.worktree_path) {
      // impl-claim not landed or provisioning suppressed → skip
      console.log('testAdaptiveWorktreeProvisionedE2E: SKIPPED (worktree_path empty, impl-claim+impl-plan-run pending)');
      return;
    }

    const wt530 = sResult.worktree_path;
    assert(fs.existsSync(wt530), 'worktree dir must exist, path: ' + wt530);

    // Step 2: seed one canonical frozen plan snapshot in main and mirror the exact bytes into
    // the linked worktree (simulating plan-run's one-time publication).  The state/task mirrors
    // must name the same hash; a placeholder plan_hash is no longer a legal archive authority.
    const projSrc = path.join(tmp, 'kaola-workflow', 'issue-530');
    const projDst = path.join(wt530, 'kaola-workflow', 'issue-530');
    fs.mkdirSync(projDst, { recursive: true });
    const cacheDir = path.join(projDst, '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });

    // #522: seed final-validation.md (consumer-mode repo → final-validation gate).
    fs.writeFileSync(path.join(cacheDir, 'final-validation.md'), 'verdict: pass\nfindings_blocking: 0\n');
    const mainCache530 = path.join(projSrc, '.cache');
    fs.mkdirSync(mainCache530, { recursive: true });
    fs.writeFileSync(path.join(mainCache530, 'final-validation.md'), 'verdict: pass\nfindings_blocking: 0\n');

    // Step 3: land an impl file in the worktree on the feature branch
    // The worktree is on workflow/issue-530 (created by claim)
    fs.writeFileSync(path.join(wt530, 'impl-test.txt'), 'implementation\n');
    G.git(wt530, ['add', 'impl-test.txt'], { encoding: 'utf8' });
    G.git(wt530, ['commit', '-m', 'feat: impl-test for issue 530'], { encoding: 'utf8' });

    // Step 4: worktree-finalize so workflow state is in the worktree branch
    const wfResult = runClaimOnlineLastJson(['worktree-finalize', '--project', 'issue-530'], tmp, binDir);
    assert(wfResult.finalized === true, 'worktree-finalize should succeed for adaptive e2e');

    // #653: bind the consumer evidence LAST — after the impl commit, so the recorded hash matches
    // the candidate the finalize gate recomputes.
    const cand530 = candidateHashFor(wt530, 'issue-530');
    fs.appendFileSync(path.join(cacheDir, 'final-validation.md'), 'validated_candidate_hash: ' + cand530 + '\n');
    // #816: the finalize transaction mirrors MAIN → worktree; keep the two roots consistent.
    fs.copyFileSync(path.join(cacheDir, 'final-validation.md'), path.join(mainCache530, 'final-validation.md'));

    // Step 5: finalize --keep-worktree
    // finalize writes the archive and exits; the sink-merge below re-reads it from disk.
    // spawn-class: durable-handoff
    const finResult = spawnSync(process.execPath, [
      claimScript, 'finalize', '--project', 'issue-530', '--keep-worktree'
    ], { cwd: wt530, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
    assert(finResult.status === 0, 'finalize --keep-worktree should exit 0\nstdout: ' + finResult.stdout + '\nstderr: ' + finResult.stderr);

    // Step 6: sink-merge (OFFLINE) — assert main now contains impl-test.txt (AC8)
    const featureHead = G.git(tmp, ['rev-parse', 'workflow/issue-530'], { encoding: 'utf8' }).stdout.trim();
    // sink-merge re-derives the merge from what the exited finalize process left on disk.
    // spawn-class: durable-handoff
    const smResult = spawnSync(process.execPath, [
      sinkMergeScript, '--project', 'issue-530', '--branch', 'workflow/issue-530', '--issue', '530'
    ], { cwd: wt530, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
    assert(smResult.status === 0,
      'sink-merge should exit 0 for adaptive e2e\nstdout: ' + smResult.stdout + '\nstderr: ' + smResult.stderr);

    const mainAfter = G.git(tmp, ['rev-parse', 'main'], { encoding: 'utf8' }).stdout.trim();
    assert(mainAfter === featureHead, 'main must advance to feature HEAD after sink-merge (AC8)');
    // AC8 core: merged main must contain the impl file
    const implInMain = G.git(tmp, ['cat-file', '-e', 'HEAD:impl-test.txt'], { encoding: 'utf8' });
    assert(implInMain.status === 0,
      'AC8: merged main must contain impl-test.txt — the implementation that landed in the worktree');

    console.log('testAdaptiveWorktreeProvisionedE2E: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
  }
}


// ── testSinkReportsWorkflowOnlyBranch ────────────────────────────────────────
// The workflow-only branch check is a MEASUREMENT that reports; it is not a throw.
//
// RE-POINTED (was testSinkRefusesWorkflowOnlyBranch, which asserted the helper THREW). "This branch
// carries no implementation" is a judgement about the work — a docs-only or roadmap-only branch is a
// legitimate deliverable — so it converted into a typed finding carrying a route forward, and the
// caller decides. What did NOT change is that the sink stops: the conversion moved the vocabulary,
// never the outcome, and the end-to-end half of that (nothing merged, nothing pushed, no issue
// closed, non-success exit) is pinned in test-sink-merge.js. This arm pins the measurement itself.

function testSinkReportsWorkflowOnlyBranch() {
  // Invoke the helper directly (bypassing the OFFLINE gate and gh/push machinery) so what is being
  // measured is unambiguous. Signal = sinkSignal(); else skip (green).
  if (!sinkSignal()) {
    console.log('testSinkReportsWorkflowOnlyBranch: SKIPPED (impl-sink-guard pending)');
    return;
  }
  const { assertBranchHasNonWorkflowChanges } = require(sinkMergeScript);
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-wf-only-')));
  try {
    // Need origin/main for the helper's git rev-parse
    initGitRepoWithBareRemote(tmp);

    G.git(tmp, ['checkout', '-b', 'workflow/issue-911'], { encoding: 'utf8' });
    // Archived folder only — no live folder, no impl file
    fs.mkdirSync(path.join(tmp, 'kaola-workflow', 'archive', 'issue-911'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'kaola-workflow', 'archive', 'issue-911', 'workflow-state.md'), 'status: closed\n');
    G.git(tmp, ['add', 'kaola-workflow/'], { encoding: 'utf8' });
    G.git(tmp, ['commit', '-m', 'chore: archive issue 911 (workflow-only, no impl)'], { encoding: 'utf8' });

    // Direct call: must RETURN a typed finding, and must not throw.
    let threw = false;
    let thrownMsg = '';
    let finding = null;
    try {
      finding = assertBranchHasNonWorkflowChanges(tmp, 'workflow/issue-911', 'main');
    } catch (e) {
      threw = true;
      thrownMsg = e && e.message ? e.message : String(e);
    }
    assert(!threw,
      'the workflow-only measurement must not throw; threw: ' + thrownMsg);
    assert(finding && finding.classification === 'no_implementation_changes',
      'a workflow-only branch must yield a no_implementation_changes finding, got: ' + JSON.stringify(finding));
    // The evidence the old refusal prose carried, now machine-readable.
    assert(finding && Array.isArray(finding.workflow_only_files)
      && finding.workflow_only_files.includes('kaola-workflow/archive/issue-911/workflow-state.md'),
      'the finding must carry the measured workflow-only file list, got: ' + JSON.stringify(finding && finding.workflow_only_files));
    // The route forward is what a report owes and a refusal does not.
    assert(finding && typeof finding.operator_hint === 'string' && finding.operator_hint.trim().length > 0,
      'the finding must name a way forward in operator_hint, got: ' + JSON.stringify(finding && finding.operator_hint));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(tmp + '-remote', { recursive: true, force: true }); } catch (_) {}
  }
  console.log('testSinkReportsWorkflowOnlyBranch: PASSED');
}

// ── NEW: testSinkAllowsMixedBranch ───────────────────────────────────────────
// AC7 allow arm: assertBranchHasNonWorkflowChanges must NOT throw when branch has a real impl file.
// Signal = sinkSignal() → strict assert helper does not throw; else skip (green).
// This is the no-false-positive test for the guard logic itself.

function testSinkAllowsMixedBranch() {
  if (!sinkSignal()) {
    console.log('testSinkAllowsMixedBranch: SKIPPED (impl-sink-guard pending)');
    return;
  }
  const { assertBranchHasNonWorkflowChanges } = require(sinkMergeScript);
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-mixed-')));
  try {
    initGitRepoWithBareRemote(tmp);

    G.git(tmp, ['checkout', '-b', 'workflow/issue-912'], { encoding: 'utf8' });
    // Real impl file — makes the branch NOT workflow-only
    fs.writeFileSync(path.join(tmp, 'impl-912.txt'), 'implementation\n');
    // Plus archived workflow artifacts
    fs.mkdirSync(path.join(tmp, 'kaola-workflow', 'archive', 'issue-912'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'kaola-workflow', 'archive', 'issue-912', 'workflow-state.md'), 'status: closed\n');
    G.git(tmp, ['add', '.'], { encoding: 'utf8' });
    G.git(tmp, ['commit', '-m', 'feat: impl and archived workflow for 912'], { encoding: 'utf8' });

    // Direct call: must NOT throw (impl file is present)
    let threw = false;
    let thrownMsg = '';
    try {
      assertBranchHasNonWorkflowChanges(tmp, 'workflow/issue-912', 'main');
    } catch (e) {
      threw = true;
      thrownMsg = e && e.message ? e.message : String(e);
    }
    assert(!threw,
      'AC7 must NOT refuse a branch with real impl + workflow artifacts (no false positive), got: ' + thrownMsg);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(tmp + '-remote', { recursive: true, force: true }); } catch (_) {}
  }
  console.log('testSinkAllowsMixedBranch: PASSED');
}


// ---------------------------------------------------------------------------
// Harness self-check (RED→GREEN seam for issue #357)
// Spawns THIS script with --list / --only to validate the registry features,
// plus in-process checks for ghMockEnv throw and runNode env scrub.
// ---------------------------------------------------------------------------
function testHarnessSelfCheck() {
  const thisScript = __filename;
  const nodeExec = process.execPath;

  // (1) --list exits 0 and prints a known scenario name without running anything.
  {
    // The harness's own argv contract: --list must exit 0, print scenario names, and run nothing.
    // spawn-class: cli-contract
    const r = spawnSync(nodeExec, [thisScript, '--list'], { encoding: 'utf8', timeout: 30000 });
    assert(r.status === 0, 'self-check: --list must exit 0, got ' + r.status + '\nstderr: ' + r.stderr);
    assert(r.stdout.includes('testProbeTimeoutEnv'),
      'self-check: --list output must include testProbeTimeoutEnv, got:\n' + r.stdout.slice(0, 500));
    // --list must not run any tests (stdout contains only names + possible suffixes; no "PASSED" lines)
    assert(!r.stdout.includes(': PASSED'),
      'self-check: --list must not run any tests, found PASSED in output:\n' + r.stdout.slice(0, 500));
  }

  // (2) --only with a bogus token exits 1 with a clear message naming the token.
  {
    // The harness's own argv contract: an unknown --only token must exit 1 and name the token.
    // spawn-class: cli-contract
    const r = spawnSync(nodeExec, [thisScript, '--only', 'noSuchScenarioXYZ'], {
      encoding: 'utf8', timeout: 30000
    });
    assert(r.status === 1, 'self-check: --only bogus token must exit 1, got ' + r.status);
    assert(/noSuchScenarioXYZ/.test(r.stderr + r.stdout),
      'self-check: --only bogus token error must name the token, got:\n' + r.stderr + r.stdout);
  }

  // (3) --only a known fast self-contained scenario runs green.
  {
    // The harness's own argv contract: a known --only token must exit 0 and report the subset.
    // spawn-class: cli-contract
    const r = spawnSync(nodeExec, [thisScript, '--only', 'testProbeTimeoutEnv'], {
      encoding: 'utf8', timeout: 30000
    });
    assert(r.status === 0,
      'self-check: --only testProbeTimeoutEnv must exit 0, got ' + r.status + '\nstderr: ' + r.stderr);
    assert(r.stdout.includes('testProbeTimeoutEnv') || r.stdout.includes('subset passed'),
      'self-check: --only run must mention the scenario or print subset passed, got:\n' + r.stdout);
  }

  // (4) ghMockEnv with a missing shim must THROW (fail-closed).
  {
    let threw = false;
    try {
      ghMockEnv('/tmp/no-such-dir-kw-selfcheck-' + Date.now());
    } catch (e) {
      threw = true;
      assert(/shim file not found/.test(e.message),
        'self-check: ghMockEnv throw must mention "shim file not found", got: ' + e.message);
    }
    assert(threw, 'self-check: ghMockEnv with missing shim must throw');
  }

  // (5) runNode env scrub: a KAOLA_ var set in the parent must NOT reach the child.
  {
    const sentinel = 'KAOLA_TEST_SELFCHECK_SENTINEL_357';
    const prev = process.env[sentinel];
    process.env[sentinel] = 'should-be-scrubbed';
    try {
      // Run a trivial inline script that prints the env var (or empty string).
      const inlineScript = path.join(os.tmpdir(), 'kw-selfcheck-envprobe-' + process.pid + '.js');
      fs.writeFileSync(inlineScript,
        'process.stdout.write(process.env["' + sentinel + '"] || "ABSENT");\n');
      try {
        const r = runNode(inlineScript, [], os.tmpdir());
        assert(r.stdout === 'ABSENT',
          'self-check: runNode must scrub inherited KAOLA_ vars, got: ' + r.stdout);
      } finally {
        try { fs.unlinkSync(inlineScript); } catch (_) {}
      }
    } finally {
      if (prev === undefined) delete process.env[sentinel];
      else process.env[sentinel] = prev;
    }
  }

  // (6) runNode child env must carry GIT isolation vars.
  {
    const inlineScript = path.join(os.tmpdir(), 'kw-selfcheck-gitenv-' + process.pid + '.js');
    fs.writeFileSync(inlineScript,
      'process.stdout.write(JSON.stringify({g: process.env.GIT_CONFIG_GLOBAL, n: process.env.GIT_CONFIG_NOSYSTEM}));\n');
    try {
      const r = runNode(inlineScript, [], os.tmpdir());
      const out = JSON.parse(r.stdout);
      assert(out.g === '/dev/null',
        'self-check: runNode child must have GIT_CONFIG_GLOBAL=/dev/null, got: ' + out.g);
      assert(out.n === '1',
        'self-check: runNode child must have GIT_CONFIG_NOSYSTEM=1, got: ' + out.n);
    } finally {
      try { fs.unlinkSync(inlineScript); } catch (_) {}
    }
  }

  console.log('testHarnessSelfCheck: PASSED');
}

// ---------------------------------------------------------------------------
// #429 Script-owned worktree sink — three new scenarios
// ---------------------------------------------------------------------------

// (a) #429 Blocked preflight (FOREIGN dirt) refuses, mutates nothing.
// Seeds main with an untracked file not owned by this sink. Runs --sink.
// Asserts: exit 1, JSON reason:'sink_blocked', foreign_dirt lists the exact path,
// AND git status --porcelain is BYTE-IDENTICAL pre/post (no stash, no rm, no merge).
function testSinkTransactionBlockedByForeignDirt() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-blocked-')));
  try {
    initGitRepo(tmp);

    // Create a feature branch with an impl commit + the project folder already archived
    // (standard lane: finalize runs before --sink so the live folder is gone).
    G.git(tmp, ['checkout', '-b', 'workflow/issue-4291'], { encoding: 'utf8' });
    fs.writeFileSync(path.join(tmp, 'impl-4291.txt'), 'impl\n');
    G.git(tmp, ['add', 'impl-4291.txt'], { encoding: 'utf8' });
    G.git(tmp, ['commit', '-m', 'feat: impl 4291'], {
      encoding: 'utf8',
      env: { ...process.env, ...GIT_ISOLATION_ENV, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@t' }
    });
    G.git(tmp, ['checkout', 'main'], { encoding: 'utf8' });

    // Plant FOREIGN DIRT: an untracked file in a DIFFERENT project's kaola-workflow folder.
    const foreignDir = path.join(tmp, 'kaola-workflow', 'other-project');
    fs.mkdirSync(foreignDir, { recursive: true });
    fs.writeFileSync(path.join(foreignDir, 'workflow-state.md'), 'status: active\n');

    // Record the git status BEFORE running --sink.
    const statusBefore = G.git(tmp, ['status', '--porcelain'], { encoding: 'utf8' }).stdout;

    const result = spawnSync(process.execPath, [
      sinkMergeScript,
      '--sink',
      '--branch', 'workflow/issue-4291',
      '--issue', '4291',
      '--project', 'issue-4291',
      '--json'
    ], {
      cwd: tmp,
      encoding: 'utf8',
      env: { ...process.env, ...GIT_ISOLATION_ENV, KAOLA_WORKFLOW_OFFLINE: '1' }
    });

    assert(result.status !== 0, '#429: --sink with foreign dirt must exit non-zero, got ' + result.status +
      '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);

    // Parse the JSON output
    let out;
    try { out = JSON.parse(result.stdout.trim().split('\n').filter(l => l.trim().startsWith('{')).pop()); }
    catch (e) { throw new Error('#429: stdout must contain JSON, got: ' + result.stdout + '\nstderr: ' + result.stderr); }
    assert(out.reason === 'sink_blocked',
      '#429: reason must be sink_blocked, got: ' + JSON.stringify(out));
    assert(Array.isArray(out.foreign_dirt) && out.foreign_dirt.length > 0,
      '#429: foreign_dirt must be a non-empty array, got: ' + JSON.stringify(out));
    // The exact foreign file must be listed
    const listed = out.foreign_dirt.some(p => p.includes('other-project') || p.includes('workflow-state.md'));
    assert(listed, '#429: foreign_dirt must list the planted file, got: ' + JSON.stringify(out.foreign_dirt));

    // ZERO MUTATION: git status must be byte-identical to before
    const statusAfter = G.git(tmp, ['status', '--porcelain'], { encoding: 'utf8' }).stdout;
    assert(statusBefore === statusAfter,
      '#429: git status must be unchanged after sink_blocked refuse\nbefore: ' + JSON.stringify(statusBefore) +
      '\nafter:  ' + JSON.stringify(statusAfter));

    // The foreign file must still exist unchanged
    assert(fs.existsSync(path.join(foreignDir, 'workflow-state.md')),
      '#429: foreign file must still exist after sink_blocked refuse');

    console.log('testSinkTransactionBlockedByForeignDirt: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// #715 (b): an interrupted SIBLING sink's untracked archive receipt
// (kaola-workflow/archive/<sibling>/.cache/sink-receipt.json, mid-cycle steps) must NOT be
// classified as foreign dirt (exact-path exemption, any project live or archived), while a
// genuinely-foreign file still is. The refusal stays sink_blocked on the foreign file alone,
// mutates nothing, and leaves the sibling receipt byte-untouched.
function testSinkForeignDirtExemptsSiblingReceipt715() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-sibling-receipt-')));
  try {
    initGitRepo(tmp);

    // Create a feature branch with an impl commit (same shape as the #429 blocked scenario).
    G.git(tmp, ['checkout', '-b', 'workflow/issue-7152'], { encoding: 'utf8' });
    fs.writeFileSync(path.join(tmp, 'impl-7152.txt'), 'impl\n');
    G.git(tmp, ['add', 'impl-7152.txt'], { encoding: 'utf8' });
    G.git(tmp, ['commit', '-m', 'feat: impl 7152'], {
      encoding: 'utf8',
      env: { ...process.env, ...GIT_ISOLATION_ENV, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@t' }
    });
    G.git(tmp, ['checkout', 'main'], { encoding: 'utf8' });

    // Plant the sibling's interrupted-sink receipt (untracked, mid-cycle steps).
    const siblingReceiptRel = 'kaola-workflow/archive/sibling-7159/.cache/sink-receipt.json';
    const siblingReceiptAbs = path.join(tmp, siblingReceiptRel);
    fs.mkdirSync(path.dirname(siblingReceiptAbs), { recursive: true });
    const siblingReceiptBody = JSON.stringify({
      project: 'sibling-7159', branch: 'workflow/sibling-7159', issue_number: 7159, issue_numbers: [7159],
      resolved_default_branch: 'main', branch_head: '3'.repeat(40),
      keep_open_requested: false,
      claim_ts: new Date().toISOString(),
      started_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      stash_ref: null, removed_duplicates: [],
      steps: { preflight: 'done', push_upstream: 'done', merge: 'pending', finalize: 'pending',
        stash_restore: 'pending', archive_commit: 'pending', push_main: 'pending', closure: 'pending' },
    }, null, 2) + '\n';
    fs.writeFileSync(siblingReceiptAbs, siblingReceiptBody);

    // Plant genuinely-foreign dirt (must still refuse + be listed).
    const foreignRel = 'kaola-workflow/other-project/workflow-state.md';
    const foreignDir = path.join(tmp, 'kaola-workflow', 'other-project');
    fs.mkdirSync(foreignDir, { recursive: true });
    fs.writeFileSync(path.join(foreignDir, 'workflow-state.md'), 'status: active\n');

    const statusBefore = G.git(tmp, ['status', '--porcelain'], { encoding: 'utf8' }).stdout;

    const result = spawnSync(process.execPath, [
      sinkMergeScript,
      '--sink',
      '--branch', 'workflow/issue-7152',
      '--issue', '7152',
      '--project', 'issue-7152',
      '--json'
    ], {
      cwd: tmp,
      encoding: 'utf8',
      env: { ...process.env, ...GIT_ISOLATION_ENV, KAOLA_WORKFLOW_OFFLINE: '1' }
    });

    assert(result.status !== 0, '#715: --sink must still refuse on the genuinely-foreign file, got ' + result.status +
      '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    let out;
    try { out = JSON.parse(result.stdout.trim().split('\n').filter(l => l.trim().startsWith('{')).pop()); }
    catch (e) { throw new Error('#715: stdout must contain JSON, got: ' + result.stdout + '\nstderr: ' + result.stderr); }
    assert(out.reason === 'sink_blocked',
      '#715: reason must be sink_blocked, got: ' + JSON.stringify(out));
    assert(Array.isArray(out.foreign_dirt) && out.foreign_dirt.includes(foreignRel),
      '#715: foreign_dirt must still list the genuinely-foreign file ' + foreignRel + ', got: ' + JSON.stringify(out.foreign_dirt));
    assert(Array.isArray(out.foreign_dirt) && !out.foreign_dirt.includes(siblingReceiptRel),
      '#715: the sibling interrupted-sink receipt must NOT appear in foreign_dirt, got: ' + JSON.stringify(out.foreign_dirt));

    // ZERO MUTATION: git status byte-identical, and the sibling receipt byte-untouched.
    const statusAfter = G.git(tmp, ['status', '--porcelain'], { encoding: 'utf8' }).stdout;
    assert(statusBefore === statusAfter,
      '#715: git status must be unchanged after sink_blocked refuse\nbefore: ' + JSON.stringify(statusBefore) +
      '\nafter:  ' + JSON.stringify(statusAfter));
    assert(fs.existsSync(siblingReceiptAbs) && fs.readFileSync(siblingReceiptAbs, 'utf8') === siblingReceiptBody,
      '#715: the sibling receipt must be byte-untouched after the refuse (classification-only exemption)');

    console.log('testSinkForeignDirtExemptsSiblingReceipt715: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// (b) #429 Kill-between-merge-and-finalize → re-run completes without double-applying.
// Runs --sink with KAOLA_WORKFLOW_SINK_ABORT_AFTER=merge env var, expects the receipt
// to show merge:done but finalize:pending. Then re-runs. Asserts the second run completes
// successfully AND does not create a second merge commit (rev-list count unchanged across
// the two halves).
function testSinkTransactionCrashResume() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-crash-')));
  try {
    initGitRepo(tmp);
    const env = { ...process.env, ...GIT_ISOLATION_ENV,
      GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@t' };

    // Feature branch with impl commit.
    G.git(tmp, ['checkout', '-b', 'workflow/issue-4292'], { env, encoding: 'utf8' });
    fs.writeFileSync(path.join(tmp, 'impl-4292.txt'), 'impl\n');
    G.git(tmp, ['add', 'impl-4292.txt'], { env, encoding: 'utf8' });
    G.git(tmp, ['commit', '-m', 'feat: impl 4292'], { env, encoding: 'utf8' });
    G.git(tmp, ['checkout', 'main'], { env, encoding: 'utf8' });

    const featureHead = G.git(tmp, ['rev-parse', 'workflow/issue-4292'], { encoding: 'utf8' }).stdout.trim();

    // First run: abort after merge step
    // The sink transaction is aborted mid-flight (SINK_ABORT_AFTER=merge), leaving a
    // half-written journal on disk. This is the kill half of kill/restart/recover.
    // spawn-class: crash
    const run1 = spawnSync(process.execPath, [
      sinkMergeScript,
      '--sink',
      '--branch', 'workflow/issue-4292',
      '--issue', '4292',
      '--project', 'issue-4292',
      '--json'
    ], {
      cwd: tmp,
      encoding: 'utf8',
      env: { ...env, KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_WORKFLOW_SINK_ABORT_AFTER: 'merge' }
    });

    // Should exit non-zero (aborted) with merge:done, finalize:pending
    const receiptPath = path.join(tmp, 'kaola-workflow', 'issue-4292', '.cache', 'sink-receipt.json');
    const archiveReceiptPath = path.join(tmp, 'kaola-workflow', 'archive', 'issue-4292', '.cache', 'sink-receipt.json');
    const receiptExists = fs.existsSync(receiptPath) || fs.existsSync(archiveReceiptPath);
    assert(receiptExists, '#429 crash-resume: sink-receipt.json must exist after aborted run\n' +
      'stdout: ' + run1.stdout + '\nstderr: ' + run1.stderr);

    const receiptRaw = fs.existsSync(receiptPath)
      ? fs.readFileSync(receiptPath, 'utf8')
      : fs.readFileSync(archiveReceiptPath, 'utf8');
    const receipt1 = JSON.parse(receiptRaw);
    assert(receipt1.steps && receipt1.steps.merge === 'done',
      '#429 crash-resume: receipt must show merge:done after abort, got: ' + JSON.stringify(receipt1.steps));
    assert(receipt1.steps && receipt1.steps.finalize !== 'done',
      '#429 crash-resume: receipt must show finalize pending (not done) after abort at merge, got: ' + JSON.stringify(receipt1.steps));

    // Record main HEAD SHA after first run to detect double-merge (merge is already done).
    const mainHeadAfterRun1 = G.git(tmp, ['rev-parse', 'main'], { encoding: 'utf8' }).stdout.trim();

    // Second run: re-run without the abort flag
    // A fresh process restarts from that half-written journal and must RESUME the remaining
    // steps rather than redo the completed ones — the recover half. Only a real second process
    // can prove the recovery reads disk instead of surviving memory.
    // spawn-class: crash
    const run2 = spawnSync(process.execPath, [
      sinkMergeScript,
      '--sink',
      '--branch', 'workflow/issue-4292',
      '--issue', '4292',
      '--project', 'issue-4292',
      '--json'
    ], {
      cwd: tmp,
      encoding: 'utf8',
      env: { ...env, KAOLA_WORKFLOW_OFFLINE: '1' }
    });

    assert(run2.status === 0, '#429 crash-resume: second --sink run must exit 0\nstdout: ' + run2.stdout + '\nstderr: ' + run2.stderr);

    // #653: the second run reaches TERMINAL success, so the journal is disposed from disk on
    // completion — read the completed receipt from stdout (the post-disposal source of truth)
    // rather than the on-disk file, which is gone by the time this run returns.
    const parsedRun2 = JSON.parse(run2.stdout.trim().split('\n').pop());
    assert(parsedRun2.journal_disposed === true,
      '#653: the resumed run must reach terminal success and dispose its journal, got: ' + JSON.stringify(parsedRun2));
    const receipt2 = parsedRun2.receipt;
    const allDone = receipt2 && receipt2.steps && Object.values(receipt2.steps).every(v => v === 'done' || v === 'skipped');
    assert(allDone, '#429 crash-resume: all steps must be done after second run, got: ' + JSON.stringify(receipt2 && receipt2.steps));
    // #653: the on-disk journal must be GONE now that the resumed run reached terminal success —
    // still present here would mean disposeSinkJournals never ran (or ran but failed silently).
    assert(!fs.existsSync(receiptPath) && !fs.existsSync(archiveReceiptPath),
      '#653: sink-receipt.json must NOT remain on disk after the resumed run reaches terminal success');

    // No double-merge: the feature commit (merge) landed exactly once.
    // main's HEAD must contain featureHead as an ancestor after run1 (it was merged).
    // After run2, main may gain additional commits (archive_commit) but featureHead must
    // still be reachable — and the merge step was NOT re-applied (receipt.steps.merge was done).
    assert(receipt2.steps && receipt2.steps.merge === 'done',
      '#429 crash-resume: receipt must show merge:done after resumed run (not re-applied), got: ' + JSON.stringify(receipt2.steps));
    const mergeBaseOut = G.git(tmp, ['merge-base', '--is-ancestor', mainHeadAfterRun1, 'main'], { encoding: 'utf8' });
    assert(mergeBaseOut.status === 0,
      '#429 crash-resume: main HEAD from run1 must be an ancestor of main after run2 (no history rewrite), mainHeadAfterRun1=' + mainHeadAfterRun1);

    console.log('testSinkTransactionCrashResume: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// (c) #429 Clean end-to-end --sink run.
// Clean worktree, run --sink once. Asserts: exit 0, main advanced to feature HEAD,
// sink-receipt.json exists with all steps done, the project folder is archived.
function testSinkTransactionCleanEndToEnd() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-e2e-')));
  try {
    initGitRepo(tmp);
    const env = { ...process.env, ...GIT_ISOLATION_ENV,
      GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@t' };

    // Plant active folder (project state) in main
    plantActiveFolder(tmp, 'issue-4293', 4293, null);

    // Feature branch: create linked worktree
    const wtPath = path.join(tmp, '.kw', 'worktrees', 'issue-4293');
    fs.mkdirSync(path.dirname(wtPath), { recursive: true });
    G.git(tmp, ['worktree', 'add', '-b', 'workflow/issue-4293', '--', wtPath, 'HEAD'], { env, encoding: 'utf8' });

    // Write the project state into the worktree branch
    fs.mkdirSync(path.join(wtPath, 'kaola-workflow', 'issue-4293', '.cache'), { recursive: true });
    fs.writeFileSync(path.join(wtPath, 'kaola-workflow', 'issue-4293', 'workflow-state.md'), [
      '# Kaola-Workflow State', '',
      '## Project',
      'name: issue-4293',
      'status: closed',
      '',
      '## Sink',
      'branch: workflow/issue-4293',
      'issue_number: 4293',
      'sink: merge',
      '',
      '## Closure',
      'archive: closed',
      ''
    ].join('\n'));

    // Add an impl file + the archived project state in the worktree commit
    fs.writeFileSync(path.join(wtPath, 'impl-4293.txt'), 'impl\n');
    // Simulate finalize: move project to archive in the worktree
    const archiveDir = path.join(wtPath, 'kaola-workflow', 'archive', 'issue-4293');
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, 'workflow-state.md'), [
      '# Kaola-Workflow State', '',
      '## Project',
      'name: issue-4293',
      'status: closed',
      '',
      '## Sink',
      'branch: workflow/issue-4293',
      'issue_number: 4293',
      'sink: merge',
      ''
    ].join('\n'));
    G.git(wtPath, ['add', '-A'], { env, encoding: 'utf8' });
    G.git(wtPath, ['commit', '-m', 'feat: impl 4293 + archive'], { env, encoding: 'utf8' });

    // Remove the live folder from main (simulate the standard lane: finalize before sink-merge)
    fs.rmSync(path.join(tmp, 'kaola-workflow', 'issue-4293'), { recursive: true, force: true });

    const featureHead = G.git(tmp, ['rev-parse', 'workflow/issue-4293'], { encoding: 'utf8' }).stdout.trim();
    const mainBefore = G.git(tmp, ['rev-parse', 'main'], { encoding: 'utf8' }).stdout.trim();
    assert(mainBefore !== featureHead, '#429 e2e: precondition: main lags feature branch');

    const result = spawnSync(process.execPath, [
      sinkMergeScript,
      '--sink',
      '--branch', 'workflow/issue-4293',
      '--issue', '4293',
      '--project', 'issue-4293',
      '--json'
    ], {
      cwd: wtPath,
      encoding: 'utf8',
      env: { ...env, KAOLA_WORKFLOW_OFFLINE: '1' }
    });

    assert(result.status === 0, '#429 e2e: --sink must exit 0\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);

    // Main must advance past mainBefore and must contain featureHead (the feature commit is merged).
    // The --sink transaction may create additional commits (archive_commit) after the FF merge,
    // so we check ancestry rather than exact SHA equality.
    const mainAfter = G.git(tmp, ['rev-parse', 'main'], { encoding: 'utf8' }).stdout.trim();
    assert(mainAfter !== mainBefore, '#429 e2e: main must advance after --sink\nbefore: ' + mainBefore + '\ngot: ' + mainAfter);
    const ancestorCheck = G.git(tmp, ['merge-base', '--is-ancestor', featureHead, 'main'], { encoding: 'utf8' });
    assert(ancestorCheck.status === 0, '#429 e2e: feature HEAD must be an ancestor of main after --sink (feature was merged)\nfeatureHead: ' + featureHead + '\nmainAfter: ' + mainAfter);

    // #653: sink-receipt.json must exist with all steps done — read from the STDOUT receipt (the
    // post-disposal source of truth), not the on-disk file, which a terminally successful sink
    // disposes of itself.
    const parsedResult = JSON.parse(result.stdout.trim().split('\n').pop());
    assert(parsedResult.result === 'ok' && parsedResult.status === 'sinked',
      '#429 e2e: --sink must emit result:ok status:sinked, got: ' + JSON.stringify(parsedResult));
    assert(parsedResult.journal_disposed === true,
      '#653: a terminally successful sink must report journal_disposed:true, got: ' + JSON.stringify(parsedResult));
    const receipt = parsedResult.receipt;
    const allDone = receipt && receipt.steps && Object.values(receipt.steps).every(v => v === 'done' || v === 'skipped');
    assert(allDone, '#429 e2e: all receipt steps must be done, got: ' + JSON.stringify(receipt && receipt.steps));

    // #653: sink-receipt.json / sink-fallback.json are transaction journals that exist on disk only
    // for crash-resume — a terminally successful sink deletes them itself, so NEITHER live nor
    // archive location may still have them after --sink returns.
    const archiveReceiptPath = path.join(tmp, 'kaola-workflow', 'archive', 'issue-4293', '.cache', 'sink-receipt.json');
    const liveReceiptPath = path.join(tmp, 'kaola-workflow', 'issue-4293', '.cache', 'sink-receipt.json');
    const archiveFallbackPath = path.join(tmp, 'kaola-workflow', 'archive', 'issue-4293', '.cache', 'sink-fallback.json');
    const liveFallbackPath = path.join(tmp, 'kaola-workflow', 'issue-4293', '.cache', 'sink-fallback.json');
    assert(!fs.existsSync(archiveReceiptPath) && !fs.existsSync(liveReceiptPath),
      '#653: sink-receipt.json must NOT remain on disk after a terminally successful sink');
    assert(!fs.existsSync(archiveFallbackPath) && !fs.existsSync(liveFallbackPath),
      '#653: sink-fallback.json must NOT remain on disk after a terminally successful sink');

    // #520: journals (sink-receipt.json, sink-fallback.json) must NOT be committed into main.
    const lsFiles = G.git(tmp, ['ls-files', 'kaola-workflow/archive/issue-4293/.cache/sink-receipt.json', 'kaola-workflow/archive/issue-4293/.cache/sink-fallback.json'], { encoding: 'utf8' }).stdout.trim();
    assert(lsFiles === '', '#520: sink journals must NOT be tracked in git after --sink; got: ' + lsFiles);
    // #653: a `git status --porcelain` "clean and synced" check must see no journal residue either
    // (the files are gone from disk, not merely untracked).
    const statusPorcelain = G.git(tmp, ['status', '--porcelain'], { encoding: 'utf8' }).stdout;
    assert(!/sink-(receipt|fallback)\.json/.test(statusPorcelain),
      '#653: git status --porcelain must show no sink-receipt/sink-fallback residue after --sink; got: ' + statusPorcelain);

    console.log('testSinkTransactionCleanEndToEnd: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// #645: the First Principles axiom block embedded in every workflow-init CLAUDE.md template must stay
// byte-identical to the canonical templates/axioms.md — the single source the `next` routing surfaces
// point to ("canonical source templates/axioms.md"). If any embed (or the canonical file) drifts, the
// consumer's CLAUDE.md and the pointer's referent would silently disagree; this reds npm test. The
// startsWith guard keeps a blanked/emptied axioms.md from producing a false green (includes('') is
// always true), so the guard is load-bearing on BOTH the canonical file and every embed.
//
// TWELVE DERIVED SURFACES. The list used to be six hand-typed paths, which covered the tracked
// trees and left the six GENERATED ones — .opencode{,-gitlab,-gitea} and .kimi{,-gitlab,-gitea} —
// free to drift with nothing to catch it. Neither half is typed here now: the tracked six come from
// the routing registry that renders them, and the generated six are rendered through the sync
// modules' own renderers. A fourth forge reaches all four runtimes with no edit to this function.
//
// WHY THE GENERATED TREES ARE RENDERED, NOT READ. They are gitignored and absent from a fresh
// checkout and from every worktree, so a disk read would face a choice between a permanent false red
// and a skip-when-absent — and a check that quietly enforces nothing when its subject is missing is
// the defect this extension exists to remove. Rendering is the same bytes `sync --check` asserts the
// on-disk tree equals, so the subject is always present and can never be a stale tree. Absence is
// still loud, one level up: the expected surface COUNT is derived independently, so a renderer that
// yields nothing reds instead of silently shrinking the sweep.
//
// #1005: TWO NAMED SURFACES — the repo's OWN prose. Twelve derived surfaces made this guard total over
// what the workflow SHIPS and blind to the two files that state the same axioms to a reader of this
// repository: root CLAUDE.md's `## First Principles` block and README.md's numbered axiom list. Both
// sat outside the sweep and both had drifted — CLAUDE.md agreed byte-for-byte for 22 days and then
// diverged in two axioms with all three standing paragraphs dropped, and README.md was never identical
// and diverges in DIFFERENT places, its intro agreeing with canonical exactly where CLAUDE.md's does
// not. Three surfaces, pairwise inconsistent, while this guard reported a clean twelve: a guard green
// on a stale surface is the defect, not the fix. They are NAMED, not derived, because they ARE the
// subject — no registry emits them — exactly as INIT_TOPIC is named. Owner ruling: both converge on
// the canonical block, with no declared divergent region on either.
function testAxiomBlockByteIdentity() {
  const routing = require('./generate-routing-surfaces.js');
  const opencodeSync = require('./sync-opencode-edition.js');
  const kimiSync = require('./sync-kimi-edition.js');
  const grokSync = require('./sync-grok-edition.js');

  const axioms = read(path.join(repoRoot, 'templates', 'axioms.md'));
  assert(axioms.startsWith('## First Principles'),
    'templates/axioms.md must open with the ## First Principles heading; got: ' + JSON.stringify(axioms.slice(0, 40)));

  // The topic this guard is about. Named, not derived — it IS the subject — but asserted, so a
  // rename reds here instead of silently deriving an empty surface set and passing over nothing.
  const INIT_TOPIC = 'init';
  assert(Object.prototype.hasOwnProperty.call(routing.TOPICS, INIT_TOPIC),
    'the routing registry must still carry the "' + INIT_TOPIC + '" topic this guard checks');

  // Tracked surfaces: straight from the registry rows that render them.
  const surfaces = routing.GENERATED_SURFACES
    .filter(r => r.topic === INIT_TOPIC)
    .map(r => ({ id: r.path, body: read(path.join(repoRoot, r.path)) }));

  // Generated surfaces: rendered in memory from each forge's init COMMAND row (both additive
  // runtime editions render from the command lane; Kimi packages it as a directory-form Skill).
  for (const forge of routing.FORGES) {
    const row = routing.commandSurfacesForForge(forge).find(r => r.topic === INIT_TOPIC);
    assert(!!row, 'forge ' + forge + ' must ship an ' + INIT_TOPIC + ' command surface to render from');
    const base = path.basename(row.path, '.md');
    const canon = read(path.join(repoRoot, row.path));
    const ocRel = path.relative(repoRoot, path.join(opencodeSync.outDirs(forge).command, base + '.md'));
    surfaces.push({ id: ocRel, body: opencodeSync.renderCommand(canon, forge, ocRel) });
    surfaces.push({ id: kimiSync.skillRel(base, forge), body: kimiSync.renderCommand(canon, base, forge) });
    surfaces.push({ id: grokSync.commandRel(base, forge), body: grokSync.renderCommand(canon, base, forge) });
  }

  // #1005: the repo's own two prose surfaces. Named, not derived — they ARE the subject, exactly as
  // INIT_TOPIC is — but each is asserted to exist, so a rename or a move reds here instead of quietly
  // dropping a surface out of the sweep.
  const NAMED_SURFACES = ['CLAUDE.md', 'README.md'];
  for (const rel of NAMED_SURFACES) {
    const abs = path.join(repoRoot, rel);
    assert(fs.existsSync(abs),
      'the repo-root ' + rel + ' this guard checks must exist at ' + rel + ' (named surface missing or renamed)');
    surfaces.push({ id: rel, body: read(abs) });
  }

  // ANTI-VACUITY, and its HONEST boundary — the three terms of this width are not equally anchored.
  // The RUNTIME term is independent: it is read off the filesystem (one `sync-<runtime>-edition.js`
  // per additive runtime), so deleting a runtime from any table cannot shrink expectation and
  // measurement together. Deriving it from surfaces.length would be a guard that cannot fail.
  // The NAMED term is independent, and ONLY because it is the literal `2` below and not
  // NAMED_SURFACES.length: drop either repo-root path from that list and the measurement shrinks while
  // the expectation does not, so the floor reds naming what survived. Adding a third named surface is
  // deliberately a two-place edit — that cost IS the floor. Written as NAMED_SURFACES.length it would
  // shrink in lockstep and enforce nothing, which is the FORGE term's failure mode, below.
  // The FORGE term is NOT independent: it comes from the same registry this measures, so deleting a
  // forge from the edition tables shrinks both sides in lockstep and this floor stays green —
  // mutation-proved. That case is caught one guard over, by test-generate-routing-surfaces.js's
  // "registry derives 18 surfaces" assertion, which is why it is left rather than re-anchored. Do
  // not read this comment as claiming the width is independent of everything; it is independent of
  // the runtime list and of the named-surface list, and not of the forge list.
  const runtimeEditionCount = fs.readdirSync(path.join(repoRoot, 'scripts'))
    .filter(f => /^sync-[a-z0-9-]+-edition\.js$/.test(f)).length;
  // per forge: claude + codex + each additive runtime; plus the two repo-root prose surfaces
  const expected = routing.FORGES.length * (2 + runtimeEditionCount) + 2;
  assert(surfaces.length === expected,
    'the axiom block must be checked on every runtime x forge init surface AND on both repo-root prose '
      + 'surfaces — expected ' + expected
      + ', derived ' + surfaces.length + ' (' + surfaces.map(s => s.id).join(', ') + ')');

  // The verdict is unchanged and singular: `s.body.includes(axioms)`, one comparison idiom for all
  // fourteen surfaces, a whole-block byte match no partial or reworded embed can satisfy. What #1005
  // changed is only the REPORT. Two of the fourteen are hand-maintained prose that drift independently
  // of each other and of the twelve, so "one of them did not match" would send the reader diffing a
  // canonical block against a thousand-line document, and a fail-fast on the first stale surface would
  // hide the second behind it. The lines below run only after a surface has ALREADY failed the
  // comparison; they explain a verdict and never decide one.
  const canonLines = axioms.split('\n').filter(l => l.trim() !== '');
  const drifted = [];
  for (const s of surfaces) {
    if (s.body.includes(axioms)) continue;
    const missing = canonLines.find(l => !s.body.includes(l));
    drifted.push(s.id + ' — stale: ' + (missing
      ? 'first canonical line absent from it is ' +
        JSON.stringify(missing.length > 100 ? missing.slice(0, 100) + '\u2026' : missing)
      : 'every canonical line appears, but not as one contiguous byte-identical block ' +
        '(blank-line, ordering or indentation drift)'));
  }
  assert(drifted.length === 0,
    drifted.length + ' of ' + surfaces.length + ' surfaces do not embed the canonical templates/axioms.md '
      + 'First Principles block byte-identically'
      + (drifted.length === surfaces.length ? ' (EVERY surface — templates/axioms.md itself is what moved)' : '')
      + ':\n    ' + drifted.join('\n    '));

  console.log('testAxiomBlockByteIdentity: PASSED (' + surfaces.length + ' surfaces)');
}

// ---------------------------------------------------------------------------
// SCENARIO REGISTRY
//
// Ordered array of [name, fn] pairs preserving the exact execution order from
// the original main(). The first 2 entries are marked sharedTmp:true — they
// share a single tmp directory created by main() and are ordering-coupled (git
// init in entry 1 affects entry 2). When --only selects any shared-tmp
// scenario the WHOLE shared-tmp group runs in order. Self-contained entries
// (the vast majority) run truly standalone.
//
// ADR 0018 §5: the ten testRoadmap* members that used to fill out this group
// tested `kaola-workflow-roadmap.js`'s generate/validate/migrate CLI directly
// — that subject is retired, and they were deleted with it rather than
// repaired ahead of it.
//
// Registry index: populated at module-load time by buildRegistry() below.
// ---------------------------------------------------------------------------

// Shared-tmp group runner: receives the already-created tmp dir and runs
// the group in original order.
async function runSharedTmpGroup(tmp) {
  testClaimStatusRelease(tmp);
  testFinalize(tmp);
}

// Shared-tmp member names in order (used for --list and --only matching).
const SHARED_TMP_NAMES = [
  'testClaimStatusRelease',
  'testFinalize',
];




function lastJson699(result) {
  const line = String(result.stdout || '').trim().split('\n').filter(row => row.trim().startsWith('{')).pop();
  return line ? JSON.parse(line) : null;
}

// #699: a fresh claim writes a durable claim record that every later caller reads back from disk.
// Renamed in spirit, not in name: the PLANNED contrast this scenario was built around (a first
// handoff publishing a frozen plan hash and a first-node tuple) has no counterpart left, so the
// planless shape is simply the shape.
function testPlanlessAndPlannedInitialAuthority699() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-initial-authority-699-')));
  try {
    initGitRepo(tmp);
    seedClassifierVerdictFromBody(6992, '');
    // startup writes the claim record into workflow-state.md and EXITS; later CLI processes in
    // this scenario re-read that record from disk and their verdict is asserted.
    // spawn-class: durable-handoff
    const claimed = spawnSync(process.execPath, [claimScript, 'startup', '--target-issue', '6992'], {
      cwd: tmp, encoding: 'utf8', env: { ...process.env, ...GIT_ISOLATION_ENV,
        KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_WORKTREE_NATIVE: '0' }
    });
    assert(claimed.status === 0, '#699 planless claim succeeds: ' + claimed.stderr);
    const project = 'issue-6992';
    const state = fs.readFileSync(statePath(tmp, project), 'utf8');
    assert(/^name: issue-6992$/m.test(state) && /^status: active$/m.test(state),
      '#699 a fresh claim writes a readable durable claim record');
    // DELETED: the epoch-1 authority assertions — `plan_epoch: 1`, `active_plan_hash: none`, and
    // the none-valued `## Planning Evidence` tuple. Epochs and the plan hash are retired, so a
    // fresh claim has no authority tier to be at the bottom of.
    // DELETED: the PLANNED half — "the first handoff atomically publishes the frozen plan hash and
    // the complete first-node Planning Evidence tuple". There is no handoff, no freeze, no plan
    // hash and no first node. What survives is the PLANLESS half above and the planless-caller
    // sweep below, and it is now the whole story rather than one of two initial authorities: a
    // fresh claim is the only shape a claim has.
    const exercisePlanlessCaller = (name, issue, run) => {
      const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-planless-' + name + '-699-')));
      try {
        initGitRepo(root);
        seedClassifierVerdictFromBody(issue, '');
        // The shared planless fixture: this process writes the claim record and exits, and the
        // caller process below reconstructs the claim from that record alone.
        // spawn-class: durable-handoff
        const startup = spawnSync(process.execPath, [claimScript, 'startup', '--target-issue', String(issue)], {
          cwd: root, encoding: 'utf8', env: { ...process.env, ...GIT_ISOLATION_ENV,
            KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_WORKTREE_NATIVE: '0' }
        });
        assert(startup.status === 0, '#699 ' + name + ' planless fixture claims successfully: '
          + startup.stderr + startup.stdout);
        const callerProject = 'issue-' + issue;
        // DELETED: "the caller receives the canonical planless epoch-1 tuple" — `plan_epoch`,
        // `active_plan_hash`, `plan_hash`, `first_node_id` and `first_node_role`. The claim no
        // longer writes any of them; what the caller reconstructs from disk is the claim identity,
        // and the assertions below measure that it succeeds in doing so.
        run(root, callerProject);
        assert(!fs.existsSync(path.join(root, 'kaola-workflow', callerProject)),
          '#699 ' + name + ' removes the live project only after successful planless archive');
        const archiveRoot = path.join(root, 'kaola-workflow', 'archive');
        assert(fs.existsSync(archiveRoot)
          && fs.readdirSync(archiveRoot).some(entry => entry.startsWith(callerProject)),
        '#699 ' + name + ' preserves the planless project under archive/');
      } finally { fs.rmSync(root, { recursive: true, force: true }); }
    };

    exercisePlanlessCaller('release', 69921, (root, callerProject) => {
      // A fresh release process reconstructs the claim authority from the record the exited startup
      // wrote — the successor axiom under measurement, not asserted.
      // spawn-class: durable-handoff
      const result = spawnSync(process.execPath, [claimScript, 'release', '--project', callerProject], {
        cwd: root, encoding: 'utf8', env: { ...process.env, ...GIT_ISOLATION_ENV,
          KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_WORKTREE_NATIVE: '0' }
      });
      assert(result.status === 0 && lastJson699(result).released === true,
        '#699 release accepts canonical planless authority: ' + result.stderr + result.stdout);
    });

    exercisePlanlessCaller('finalize', 69922, (root, callerProject) => {
      // Bind a passing validation record onto the fresh claim; a plan-absent finalize is the
      // ordinary case now, so there is nothing else to seed.
      seedAdaptiveFinalizeFixture(root, callerProject);
      // A fresh finalize process reconstructs the claim authority and the frozen plan from disk.
      // spawn-class: durable-handoff
      const result = spawnSync(process.execPath, [claimScript, 'finalize', '--project', callerProject], {
        cwd: root, encoding: 'utf8', env: { ...process.env, ...GIT_ISOLATION_ENV,
          KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_WORKTREE_NATIVE: '0' }
      });
      const out = lastJson699(result);
      assert(result.status === 0 && out && out.status === 'closed' && out.archived === true,
        '#699 finalize accepts canonical planless authority: ' + result.stderr + result.stdout);
    });

    exercisePlanlessCaller('watch', 69923, (root, callerProject) => {
      const sf = statePath(root, callerProject);
      fs.writeFileSync(sf, fs.readFileSync(sf, 'utf8').replace(/^sink: merge$/m, 'sink: pr')
        + 'pr_url: https://github.com/test/repo/pull/69923\n');
      const binDir = path.join(root, 'bin');
      fs.mkdirSync(binDir, { recursive: true });
      const mock = path.join(binDir, 'gh.js');
      fs.writeFileSync(mock, [
        "const a=process.argv.slice(2).join(' ');",
        "if(a.includes('pr view')) process.stdout.write('{\"state\":\"MERGED\",\"number\":69923}\\n');",
        "else if(a.includes('issue view')) process.stdout.write('{\"state\":\"closed\"}\\n');",
        "else if(a.includes('api')) process.stdout.write('[]\\n');",
      ].join('\n'));
      // A fresh watch-pr process reconstructs the claim authority from the durable record alone.
      // spawn-class: durable-handoff
      const result = spawnSync(process.execPath, [claimScript, 'watch-pr', '--issue', '69923'], {
        cwd: root, encoding: 'utf8', env: { ...process.env, ...GIT_ISOLATION_ENV,
          KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_WORKTREE_NATIVE: '0', KAOLA_GH_MOCK_SCRIPT: mock }
      });
      const out = lastJson699(result);
      assert(result.status === 0 && out && out.watched === 1
        && Array.isArray(out.cleanups) && out.cleanups.length === 1,
      '#699 watch accepts canonical planless authority: ' + result.stderr + result.stdout);
    });

    // DELETED: the current/planned authority-hybrid refusal and the four epoch-authority tamper
    // mutations (missing/unknown epoch_schema_version, missing/tampered epoch_lineage_id). Every
    // one of them tampered with a field the state file no longer carries, and the E2 verifier that
    // read them is retired with the epochs.
    console.log('testPlanlessAndPlannedInitialAuthority699: PASSED');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// #699: every cleanup caller must treat a non-success archive result as a
// terminal refusal. The test seam returns a plain archived:false result (not
// archive_incomplete), proving callers use the shared predicate instead of one
// historical error flag.
function testArchiveCallersFailClosed699() {
  const runLocal = (subcommand, issue) => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-archive-caller-699-')));
    initGitRepo(root);
    plantActiveFolder(root, 'issue-' + issue, issue, null);
    seedClassifierVerdictFromBody(issue, '');
    const result = spawnSync(process.execPath, [claimScript, subcommand, '--project', 'issue-' + issue], {
      cwd: root, encoding: 'utf8', env: { ...process.env, ...GIT_ISOLATION_ENV,
        KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_WORKTREE_NATIVE: '0',
        KAOLA_WORKFLOW_FORCE_ARCHIVE_REFUSAL: '1' }
    });
    assert(result.status !== 0, '#699 ' + subcommand + ' exits nonzero on archive refusal');
    assert(fs.existsSync(path.join(root, 'kaola-workflow', 'issue-' + issue)),
      '#699 ' + subcommand + ' preserves the live project on archive refusal');
    fs.rmSync(root, { recursive: true, force: true });
  };
  runLocal('finalize', 6993);
  runLocal('release', 6994);

  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-watch-archive-699-')));
  try {
    initGitRepo(root);
    for (const [issue, pr] of [[6995, 1], [6996, 2]]) {
      plantActiveFolder(root, 'issue-' + issue, issue, null);
      const sf = statePath(root, 'issue-' + issue);
      fs.appendFileSync(sf, 'pr_url: https://github.com/test/repo/pull/' + pr + '\n');
      fs.writeFileSync(sf, fs.readFileSync(sf, 'utf8').replace(/^sink: merge$/m, 'sink: pr'));
    }
    const binDir = path.join(root, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    const log = path.join(root, 'remote.log');
    fs.writeFileSync(path.join(binDir, 'gh.js'), [
      "const fs=require('fs'); const a=process.argv.slice(2).join(' ');",
      "if(a.includes('pr view')&&a.includes('/1')) process.stdout.write('{\"state\":\"MERGED\",\"number\":1}\\n');",
      "else if(a.includes('pr view')) process.stdout.write('{\"state\":\"CLOSED\",\"number\":2}\\n');",
      "else if(a.includes('issue view')) process.stdout.write('{\"state\":\"open\"}\\n');",
      "else if(a.includes('issue edit')&&a.includes('--remove-label')) fs.appendFileSync(" + JSON.stringify(log) + ", 'label-removed\\n');",
      "else if(a.includes('api')) process.stdout.write('[]\\n');",
    ].join('\n'));
    const watched = spawnSync(process.execPath, [claimScript, 'watch-pr'], {
      cwd: root, encoding: 'utf8', env: { ...process.env, ...GIT_ISOLATION_ENV,
        KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_WORKTREE_NATIVE: '0',
        KAOLA_WORKFLOW_FORCE_ARCHIVE_REFUSAL: '1', KAOLA_GH_MOCK_SCRIPT: path.join(binDir, 'gh.js') }
    });
    assert(watched.status !== 0, '#699 merged/closed PR watch exits nonzero when archival refuses');
    assert(fs.existsSync(path.join(root, 'kaola-workflow', 'issue-6995'))
      && fs.existsSync(path.join(root, 'kaola-workflow', 'issue-6996')),
      '#699 merged/closed PR watch preserves both live projects on archival refusal');
    assert(!fs.existsSync(log), '#699 PR watch performs no claim-label cleanup after archival refusal');
    console.log('testArchiveCallersFailClosed699: PASSED');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

// #699: OFFLINE dominates both native worktree and in-place branch creation for
// single/bundle claims — including in an initialized repository with no commits, where the claim
// still succeeds. DELETED: the zero-commit/canonical-empty-tree root assertions. The claim root
// base existed to anchor a re-plan epoch and is not written any more; what the no-history rows
// still measure is that such a repository can be claimed at all.
function testOfflineNoHistoryClaimRoot699() {
  const cases = [
    { name: 'single-history-native1', history: true, native: '1', args: ['--target-issue', '7001'], issues: [7001] },
    { name: 'bundle-history-native0', history: true, native: '0', args: ['--target-issues', '7002,7003'], issues: [7002, 7003] },
    { name: 'single-nohistory-native0', history: false, native: '0', args: ['--target-issue', '7004'], issues: [7004] },
    { name: 'bundle-nohistory-native1', history: false, native: '1', args: ['--target-issues', '7005,7006'], issues: [7005, 7006] },
  ];
  for (const row of cases) {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-offline-root-699-')));
    try {
      if (row.history) initGitRepo(root);
      else {
        G.git(root, ['init', '-b', 'main'], { encoding: 'utf8', env: { ...process.env, ...GIT_ISOLATION_ENV } });
        fs.writeFileSync(path.join(root, 'candidate.txt'), 'uncommitted candidate\n');
      }
      for (const issue of row.issues) seedClassifierVerdictFromBody(issue, '');
      const result = spawnSync(process.execPath, [claimScript, 'startup', ...row.args], {
        cwd: root, encoding: 'utf8', env: { ...process.env, ...GIT_ISOLATION_ENV,
          KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_WORKTREE_NATIVE: row.native }
      });
      assert(result.status === 0, '#699 offline ' + row.name + ' claim succeeds: ' + result.stderr + result.stdout);
      const out = lastJson699(result);
      const project = row.issues.length > 1 ? 'bundle-' + row.issues.join('-') : 'issue-' + row.issues[0];
      const state = fs.readFileSync(statePath(root, project), 'utf8');
      assert(out && out.worktree_path === '' && !/^worktree_path:/m.test(state) && !/^base_branch:/m.test(state),
        '#699 offline ' + row.name + ' creates neither worktree nor in-place checkout');
      assert(!fs.existsSync(path.join(root, '.kw', 'worktrees', project)),
        '#699 offline ' + row.name + ' leaves no native worktree');
      const targetRef = G.git(root, ['show-ref', '--verify', '--quiet', 'refs/heads/workflow/' + project]);
      assert(targetRef.status !== 0, '#699 offline ' + row.name + ' creates no feature branch');
      assert(/^claim_identity_digest: [0-9a-f]{64}$/m.test(state),
        '#699 offline ' + row.name + ' persists a claim identity digest');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  console.log('testOfflineNoHistoryClaimRoot699: PASSED');
}



// ── #758 SPINE plan form ────────────────────────────────────────────────────────────────────
// A spine plan is an ordered milestone spine + the unique finalize sink, where a spine node is
// either a concrete single-role node (unchanged semantics) or a typed `expansion-point` whose
// frontier is composed at OPEN time. Covered here:
//   (a) a spine with TWO expansion points, a review wall and a sink freezes green through the
//       production `--freeze` CLI, and resume-checks green;
//   (b) plan_hash covers the SPINE ONLY — ledger-side expansion records never perturb it;
//   (c) a spine missing its review wall, and a spine missing its sink, refuse WITHIN the existing
//       typed families (`plan_invalid`), not a parallel vocabulary;
//   (d) the discriminator is load-bearing in BOTH directions (an expansion-point token in a `dag`
//       plan still refuses; a `spine` label with no expansion point refuses);
//   (e) the legacy no-regression pin over the real archived plan corpus.
const SPINE_PLAN_758 = [
  '# Workflow Plan — issue #758', '',
  '## Meta', '',
  'project: issue-758',
  'labels: enhancement',
  'plan_schema_version: 2',
  'plan_form: spine',
  'validation_command: node scripts/simulate-workflow-walkthrough.js',
  'validation_timeout_minutes: 20',
  'code_certifier: wall',
  'security_certifier: none',
  'inherited_frontier_digest: none',
  'inherited_frontier_classes: none', '',
  'expansion(m1):',
  '  milestone_goal: land the reader seam in the core script',
  '  expected_surfaces: scripts/, docs/',
  '  join_constraints: none',
  '  review_class: code-reviewer', '',
  'expansion(m2):',
  '  milestone_goal: mirror the reader seam into the edition trees',
  '  expected_surfaces: plugins/',
  '  join_constraints: consumes the m1 evidence packet',
  '  review_class: code-reviewer', '',
  '## Nodes', '',
  '| id | role | depends_on | declared_write_set | cardinality | shape | gate_claim | gate_surface | gate_aggregation | certifies |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  '| probe | code-explorer | — | — | 1 | sequence | — | — | — | — |',
  '| m1 | expansion-point | probe | — | 1 | sequence | — | — | — | — |',
  '| m2 | expansion-point | m1 | — | 1 | sequence | — | — | — | — |',
  '| wall | code-reviewer | m2 | — | 1 | sequence | both milestone expansions land their declared goal with no unreviewed surface | the accumulated candidate across both expansions | sequence | — |',
  '| done | finalize | wall | — | 1 | sequence | — | — | — | — |', '',
  '## Design', '',
  'Decompose: probe explores; m1 and m2 are milestones whose interior frontiers are composed at open time (m2 consumes m1\'s evidence packet — S1); wall reviews both composed frontiers; done sinks. Done: both milestones land their goals reviewed and validation passes.', '',
  '## Acceptance', '', 'A1: the declared write set lands the change the plan was frozen for.', 'A2: the recorded validation passes over the candidate.', '',
  '## Node Ledger', '',
  '| id | status |',
  '|---|---|',
  '| probe | pending |',
  '| m1 | pending |',
  '| m2 | pending |',
  '| wall | pending |',
  '| done | pending |', '',
].join('\n');



// ---------------------------------------------------------------------------
// #759 — THE EXPANSION TRANSACTION, end to end.
//
// Acceptance, in order:
//   (a) a spine with ONE expansion point -> expand-open a 3-unit co_open frontier -> close each unit
//       -> expand-open a SECOND record on the SAME point -> close -> discharge -> the spine advances
//       to its review wall and then to the sink;
//   (b) a crash injected BETWEEN the record append and the frontier open resumes cleanly via
//       reconcile-running-set (roll-forward), and the roll-forward is idempotent;
//   (c) the `## Expansion Records` channel is APPEND-ONLY across the whole run — after every
//       mutation the previous content is a byte PREFIX of the new content — and the `## Node Ledger`
//       only ever GAINS rows (no row is removed, no row id is reordered);
//   (d) the carry-forward from the spine-grammar verifier: a pure-spine schema-2 plan is held to the
//       SAME `validation_policy_required` fail-closed rule as the byte-equivalent DAG plan.
// ---------------------------------------------------------------------------
const SPINE_PLAN_759 = [
  '# Workflow Plan — issue #759', '',
  '## Meta', '',
  'project: issue-759',
  'labels: enhancement',
  'plan_schema_version: 2',
  'plan_form: spine',
  'validation_command: node scripts/simulate-workflow-walkthrough.js',
  'validation_timeout_minutes: 20',
  'code_certifier: wall',
  'security_certifier: none',
  'inherited_frontier_digest: none',
  'inherited_frontier_classes: none', '',
  'expansion(m1):',
  '  milestone_goal: land the reader seam in the core script',
  '  expected_surfaces: scripts/',
  '  join_constraints: none',
  '  review_class: code-reviewer', '',
  '## Nodes', '',
  '| id | role | depends_on | declared_write_set | cardinality | shape | gate_claim | gate_surface | gate_aggregation | certifies |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  '| probe | code-explorer | — | — | 1 | sequence | — | — | — | — |',
  '| m1 | expansion-point | probe | — | 1 | sequence | — | — | — | — |',
  '| wall | code-reviewer | m1 | — | 1 | sequence | the milestone lands its goal with no unreviewed surface | the accumulated candidate | sequence | — |',
  '| done | finalize | wall | — | 1 | sequence | — | — | — | — |', '',
  '## Design', '',
  'Decompose: probe explores; m1 is a milestone whose interior frontier is composed at open time (its writers cannot be proven at freeze); wall reviews the composed frontier; done sinks. sequence edges are gate/data dependencies (S1). Done: the milestone lands its goal reviewed and validation passes.', '',
  '## Acceptance', '', 'A1: the declared write set lands the change the plan was frozen for.', 'A2: the recorded validation passes over the candidate.', '',
  '## Node Ledger', '',
  '| id | status |',
  '|---|---|',
  '| probe | complete |',
  '| m1 | pending |',
  '| wall | pending |',
  '| done | pending |', '',
].join('\n');





// ---------------------------------------------------------------------------
// #760 — THE SERIALIZATION-TRIGGER INVERSION, end to end.
//
// A 2-unit write frontier whose declared write sets are UNCERTAIN, not proven disjoint AND not
// proven overlapping — one unit declares an exact file, the other a directory-shaped surface that
// (unbeknownst to the composer) covers the very same file. This is exactly the shape the pre-#760
// PREVENT verdict serial-degraded (a coarse pair carrying a non-exactly-resolvable entry). Post-
// #760 it co-opens BY DEFAULT: both legs actually touch the SAME concrete file at runtime (a real,
// but non-conflicting, overlap), the mechanical octopus merge (the synthesizer) reconciles the two
// non-overlapping edits into one commit, the spine's review wall passes, and the run reaches the
// sink — proving the correctness net the inversion leans on (per-leg containment + the mandatory
// post-dominating merge) already covers what the old fail-closed PREVENT verdict was buying nothing
// against.
// ---------------------------------------------------------------------------
const SPINE_PLAN_760 = [
  '# Workflow Plan — issue #760', '',
  '## Meta', '',
  'project: issue-760',
  'labels: enhancement',
  'plan_schema_version: 2',
  'plan_form: spine',
  'validation_command: node scripts/simulate-workflow-walkthrough.js',
  'validation_timeout_minutes: 20',
  'code_certifier: wall',
  'security_certifier: none',
  'inherited_frontier_digest: none',
  'inherited_frontier_classes: none', '',
  'expansion(m1):',
  '  milestone_goal: land a shared helper in lib/',
  '  expected_surfaces: lib/',
  '  join_constraints: none',
  '  review_class: code-reviewer', '',
  '## Nodes', '',
  '| id | role | depends_on | declared_write_set | cardinality | shape | gate_claim | gate_surface | gate_aggregation | certifies |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  '| probe | code-explorer | — | — | 1 | sequence | — | — | — | — |',
  '| m1 | expansion-point | probe | — | 1 | sequence | — | — | — | — |',
  '| wall | code-reviewer | m1 | — | 1 | sequence | the milestone lands its goal with no unreviewed surface | the accumulated candidate | sequence | — |',
  '| done | finalize | wall | — | 1 | sequence | — | — | — | — |', '',
  '## Design', '',
  'Decompose: probe explores; m1 is a milestone whose interior frontier is composed at open time (its writers cannot be proven at freeze); wall reviews the composed frontier; done sinks. sequence edges are gate/data dependencies (S1). Done: the milestone lands its goal reviewed and validation passes.', '',
  '## Acceptance', '', 'A1: the declared write set lands the change the plan was frozen for.', 'A2: the recorded validation passes over the candidate.', '',
  '## Node Ledger', '',
  '| id | status |',
  '|---|---|',
  '| probe | complete |',
  '| m1 | pending |',
  '| wall | pending |',
  '| done | pending |', '',
].join('\n');



function buildRegistry() {
  const reg = [];
  // Helper: add a self-contained (own-tmp) entry.
  const add = (name, fn) => reg.push({ name, fn, sharedTmp: false });
  // Helper: add a shared-tmp member (fn is ignored at run-time; the group runner is used).
  const sharedTmpFn = () => { throw new Error('shared-tmp scenario must be run via the group'); };
  for (const n of SHARED_TMP_NAMES) {
    reg.push({ name: n, fn: sharedTmpFn, sharedTmp: true });
  }
  // Self-contained scenarios — exact order from the original main() call list:
  add('testAxiomBlockByteIdentity',                       testAxiomBlockByteIdentity);
  add('testKeepOpenArchiveStamp',                         testKeepOpenArchiveStamp);
  add('testManualArchiveBackstop',                        testManualArchiveBackstop);
  add('testSinkPrUsesFinalizationSummary',                testSinkPrUsesFinalizationSummary);
  add('testHookShapeNoPhantomAdvisor',                    testHookShapeNoPhantomAdvisor);
  add('testSubagentDispatchHookExists',                   testSubagentDispatchHookExists);
  add('testClassifierDependsOnGate',                      testClassifierDependsOnGate);
  add('testProbeIssueStateOffline',                       testProbeIssueStateOffline);
  add('testProbeIssueStateNullIssue',                     testProbeIssueStateNullIssue);
  add('testProbeIssueStateEmptyGhResponse',               testProbeIssueStateEmptyGhResponse);
  add('testProbeIssueStateGhThrows',                      testProbeIssueStateGhThrows);
  add('testActiveFoldersExcludesClosedIssue895',          testActiveFoldersExcludesClosedIssue895);
  add('testStartupJsonAndHiddenLocalWorktrees',           testStartupJsonAndHiddenLocalWorktrees);
  add('testWorktreeNativeDefaultOff',                     testWorktreeNativeDefaultOff);
  add('testWorktreeNativeInPlaceIdempotentReclaim',        testWorktreeNativeInPlaceIdempotentReclaim);
  add('testWorktreeNativeDirtyTreeAsksConsent',           testWorktreeNativeDirtyTreeAsksConsent);
  add('testTreeDirtyFailsClosedOnProbeFault',             testTreeDirtyFailsClosedOnProbeFault);
  add('testWorktreeNativeDetachedHeadRecordOnly',         testWorktreeNativeDetachedHeadRecordOnly);
  add('testWorktreeNativeDiscardRestoresBase',            testWorktreeNativeDiscardRestoresBase);
  add('testWorktreeNativeDiscardRestoresNonDefaultBase',  testWorktreeNativeDiscardRestoresNonDefaultBase);
  add('testWorktreeNativeOfflineWins',                    testWorktreeNativeOfflineWins);
  add('testWorktreeNativeSurfacesProvisionFailure',       testWorktreeNativeSurfacesProvisionFailure);
  add('testWorktreeAdaptiveProvisioned',                  testWorktreeAdaptiveProvisioned);
  add('testClassifierCurrentClaimMarkerBlocks',           testClassifierCurrentClaimMarkerBlocks);
  add('testWatchPrArchivesClosedIssuePrFolder',           testWatchPrArchivesClosedIssuePrFolder);
  add('testSinkFallbackSkipsArchivedProject',             testSinkFallbackSkipsArchivedProject);
  add('testFinalizeReleaseCleansWorktree',                testFinalizeReleaseCleansWorktree);
  add('testFinalizeFromLinkedWorktreeCleansMainCopy',     testFinalizeFromLinkedWorktreeCleansMainCopy);
  add('testArchiveDestinationResolvesAgainstMain832',     testArchiveDestinationResolvesAgainstMain832);
  add('testArchiveCommitHonestUnderGitignore832',         testArchiveCommitHonestUnderGitignore832);
  add('testFinalizeNarrowStagingExcludesForeignArchive',  testFinalizeNarrowStagingExcludesForeignArchive);
  add('testFinalizeFromMainRootNoSpuriousRemoval',        testFinalizeFromMainRootNoSpuriousRemoval);
  add('testReleaseFromLinkedWorktreeCleansMainCopy',      testReleaseFromLinkedWorktreeCleansMainCopy);
  add('testReleaseInPlaceOnFeatureBranchCommitsArchiveOnBase', testReleaseInPlaceOnFeatureBranchCommitsArchiveOnBase);
  add('testWatchPrClosedSweepSkipsCommitOffBaseBranch',   testWatchPrClosedSweepSkipsCommitOffBaseBranch);
  add('testReleaseDetachedHeadLyingBaseSkipsArchiveCommit', testReleaseDetachedHeadLyingBaseSkipsArchiveCommit);
  add('testReleaseOnFeatureBranchLyingBaseNamesDiscardedBranchSkips', testReleaseOnFeatureBranchLyingBaseNamesDiscardedBranchSkips);
  add('testWatchPrClosedSweepDetachedLyingBaseHeadSkips', testWatchPrClosedSweepDetachedLyingBaseHeadSkips);
  add('testWatchPrClosedSweepArbitraryLaneLyingBaseSkips', testWatchPrClosedSweepArbitraryLaneLyingBaseSkips);
  add('testReleaseHeadRepointRaceDowngradesArchiveCommit', testReleaseHeadRepointRaceDowngradesArchiveCommit);
  add('testSinkMergeFromLinkedWorktree',                  testSinkMergeFromLinkedWorktree);
  add('testSinkRefusesStaleReceipt',                      testSinkRefusesStaleReceipt);
  add('testStatusShowsClosedIssueDrift',                  testStatusShowsClosedIssueDrift);
  add('testStaleWorktreeCheck',                           testStaleWorktreeCheck);
  add('testStaleWorktreeCleanup',                         testStaleWorktreeCleanup);
  add('testNoTargetNeverAutoPicks',                       testNoTargetNeverAutoPicks);
  add('testSoleActiveRoundTrip',                          testSoleActiveRoundTrip);
  add('testSinkPrLeavesCleanWorktree',                    testSinkPrLeavesCleanWorktree);
  add('testReadPriorityConfig',                           testReadPriorityConfig);
  add('testE2EGitHubMergeFullChain',                      testE2EGitHubMergeFullChain);
  add('testSinkMergeRefusesLiveFolder',                   testSinkMergeRefusesLiveFolder);
  add('testSinkRefusesDirtyWorktree',                     testSinkRefusesDirtyWorktree);
  add('testProbeHelpersFailClosed',                       testProbeHelpersFailClosed);
  add('testArchiveIntegrityPortedToAllEditions832',       testArchiveIntegrityPortedToAllEditions832);
  add('testStaleDiagnosticsPortedToAllEditions1002',      testStaleDiagnosticsPortedToAllEditions1002);
  add('testFillIfEmptySummarySectionPortedToAllEditions1004', testFillIfEmptySummarySectionPortedToAllEditions1004);
  add('testSinkMergeBlocksUnpushedCommits',               testSinkMergeBlocksUnpushedCommits);
  add('testAssertWorktreeCleanFailsClosedOnProbeFault',   testAssertWorktreeCleanFailsClosedOnProbeFault);
  add('testAssertWorktreeCleanFailsClosedOnListProbeFault', testAssertWorktreeCleanFailsClosedOnListProbeFault);
  add('testSinkRefusesOnPushMainFailure',                 testSinkRefusesOnPushMainFailure);
  add('testSinkRefusesOnPushUpstreamFailure',             testSinkRefusesOnPushUpstreamFailure);
  add('testSinkTransactionSyncsUntrackedWorktreeProjectDirOnMerge', testSinkTransactionSyncsUntrackedWorktreeProjectDirOnMerge);
  add('testSinkTransactionStampsPublishedHeadAfterRebase', testSinkTransactionStampsPublishedHeadAfterRebase);
  add('testSinkRefusesOnCloseFailure',                    testSinkRefusesOnCloseFailure);
  add('testSinkMergeAutoPushesWhenNoUpstream',            testSinkMergeAutoPushesWhenNoUpstream);
  add('testSinkMergeOfflineSkipsPublishGuard',            testSinkMergeOfflineSkipsPublishGuard);
  add('testSinkMergeNonDefaultBranchMaster',              testSinkMergeNonDefaultBranchMaster);
  add('testSinkMergeReRebasesOnFfRace',                   testSinkMergeReRebasesOnFfRace);
  add('testSinkMergeConsumerRepoSkipsNpmTestGate',        testSinkMergeConsumerRepoSkipsNpmTestGate);
  add('testSinkMergeBareRemoteDeleteOrder',               testSinkMergeBareRemoteDeleteOrder);
  add('testE2EGitHubPrFullChain',                         testE2EGitHubPrFullChain);
  add('testParallelIssueIndependence',                    testParallelIssueIndependence);
  add('testClassifierFailClosedOnRemoteError',            testClassifierFailClosedOnRemoteError);
  add('testClassifierOfflineUnverifiedNoLocalEvidence',   testClassifierOfflineUnverifiedNoLocalEvidence);
  add('testClassifierOfflineVerifiedOwnedFolderRoutes',   testClassifierOfflineVerifiedOwnedFolderRoutes);
  add('testClassifierOfflineUnverifiedWithUnrelatedActiveFolder', testClassifierOfflineUnverifiedWithUnrelatedActiveFolder);
  add('testStartupExplicitTargetRedAnswers',              testStartupExplicitTargetRedAnswers);
  add('testClassifierTopLevelIssueFlag',                  testClassifierTopLevelIssueFlag);
  add('testClaimProjectOwnedFolderFailingRemote',         testClaimProjectOwnedFolderFailingRemote);
  add('testFinalizeRemovesClaimLabel',                    testFinalizeRemovesClaimLabel);
  add('testFinalizeNullFolderFallbackReadsArchive',       testFinalizeNullFolderFallbackReadsArchive);
  add('testFinalizeOfflineSkipsLabelInvariant',           testFinalizeOfflineSkipsLabelInvariant);
  add('testFinalizeOfflineReportsSkippedClaimRelease',    testFinalizeOfflineReportsSkippedClaimRelease);
  add('testFinalizeReportsMissionListOutcomeWithoutDone', testFinalizeReportsMissionListOutcomeWithoutDone);
  add('testWatchPrEmitsClaimLabelReceipt',                testWatchPrEmitsClaimLabelReceipt);
  add('testAuditAndRepairLabels',                         testAuditAndRepairLabels);
  add('testFinalizeClaimLabelFailedTriggersInvariant',    testFinalizeClaimLabelFailedTriggersInvariant);
  add('testClearAdvisoryClaimDeletesMarkerComment',       testClearAdvisoryClaimDeletesMarkerComment);
  add('testClearAdvisoryClaimDoesNotDeleteOtherProjectMarker', testClearAdvisoryClaimDoesNotDeleteOtherProjectMarker);
  add('testClearAdvisoryClaimOfflineSkipsDelete',         testClearAdvisoryClaimOfflineSkipsDelete);
  add('testSinkKeepOpenReleasesClaimMarker',              testSinkKeepOpenReleasesClaimMarker);
  add('testKeepOpenSinkLeavesTheIssueReClaimable',        testKeepOpenSinkLeavesTheIssueReClaimable);
  add('testSinkMergeEmitsClosureReceipt',                 testSinkMergeEmitsClosureReceipt);
  add('testWatchPrMergedClosureReceipt',                  testWatchPrMergedClosureReceipt);
  add('testFinalizeOfflineClosureReceiptSkipped',         testFinalizeOfflineClosureReceiptSkipped);
  add('testSinkMergeMockabilityAndReceipt',               testSinkMergeMockabilityAndReceipt);
  add('testSinkMergeCloseFailureWarning',                 testSinkMergeCloseFailureWarning);
  add('testSinkMergeCloseExitZeroButStillOpenFailsClosed', testSinkMergeCloseExitZeroButStillOpenFailsClosed);
  add('testSinkMergeSkipsArchivedProjectPhantom',         testSinkMergeSkipsArchivedProjectPhantom);
  add('testKeepOpenMergeFullChain',                       testKeepOpenMergeFullChain);
  add('testKeepOpenFinalizeFlagAlias',                    testKeepOpenFinalizeFlagAlias);
  add('testSinkMergeKeepOpenOnlineMock',                  testSinkMergeKeepOpenOnlineMock);
  add('testSinkMergePostPushReopenOnMock',                testSinkMergePostPushReopenOnMock);
  add('testBundleFinalizeAllOpenCloseIsPending',          testBundleFinalizeAllOpenCloseIsPending);
  add('testSinkMergeKeepOpenRequiresIssue',               testSinkMergeKeepOpenRequiresIssue);
  add('testSinkMergeKeepOpenArchivedStateGuard',          testSinkMergeKeepOpenArchivedStateGuard);
  add('testSinkPrKeepOpenRefusal',                        testSinkPrKeepOpenRefusal);
  add('testClosureAuditOfflineRemoteClassesSkipped',      testClosureAuditOfflineRemoteClassesSkipped);
  add('testClosureAuditArchiveContentDrift832',           testClosureAuditArchiveContentDrift832);
  add('testClosureAuditStaleInProgressLabels',            testClosureAuditStaleInProgressLabels);
  add('testClosureAuditActiveFolderForClosedIssueReportsDirty', testClosureAuditActiveFolderForClosedIssueReportsDirty);
  add('testClosureAuditUnarchivedPrFolderMerged',         testClosureAuditUnarchivedPrFolderMerged);
  add('testClosureAuditExecuteRepairsLabels',             testClosureAuditExecuteRepairsLabels);
  add('testClosureAuditExecuteNeverTouchesActiveFolders', testClosureAuditExecuteNeverTouchesActiveFolders);
  add('testClosureAuditDryRunNeverCallsRemoveLabel',      testClosureAuditDryRunNeverCallsRemoveLabel);
  add('testClosureAuditStaleLabelsTimeout',               testClosureAuditStaleLabelsTimeout);
  add('testClosureAuditUnresolvedClosedState',            testClosureAuditUnresolvedClosedState);
  add('testClosureAuditProbeFailureUnresolved',           testClosureAuditProbeFailureUnresolved);
  add('testClosureAuditTimeoutEnvInvalidFallsBack',       testClosureAuditTimeoutEnvInvalidFallsBack);
  add('testClosureAuditExecuteDetectionTimeoutPropagates', testClosureAuditExecuteDetectionTimeoutPropagates);
  add('testClosureAuditExecuteLabelRemovalTimeoutBreaks', testClosureAuditExecuteLabelRemovalTimeoutBreaks);
  add('testClosureAuditExecuteLabelRemovalNonTimeoutFails', testClosureAuditExecuteLabelRemovalNonTimeoutFails);
  add('testClosureAuditPrFolderTimeout',                  testClosureAuditPrFolderTimeout);
  // #903 scoping + the two behaviours it forced (bundle members, #901 citation class)
  add('testClosureAuditProjectScopePartitions903',        testClosureAuditProjectScopePartitions903);
  add('testClosureAuditRejectsUnknownFlagAndHelp903',     testClosureAuditRejectsUnknownFlagAndHelp903);
  add('testClosureAuditMistypedProjectExitsOne903',       testClosureAuditMistypedProjectExitsOne903);
  add('testClosureAuditProjectNameIsNotAPath903',         testClosureAuditProjectNameIsNotAPath903);
  add('testClosureAuditScopedCleanIsFailClosed903',       testClosureAuditScopedCleanIsFailClosed903);
  add('testClosureAuditBundleMemberActiveFolderClosed903', testClosureAuditBundleMemberActiveFolderClosed903);
  add('testClosureAuditCitationMissingOmittedWhenEmpty903', testClosureAuditCitationMissingOmittedWhenEmpty903);
  add('testClosureAuditCitationMissingReportsAndExcludesJsonl903', testClosureAuditCitationMissingReportsAndExcludesJsonl903);
  add('testClosureAuditScopingHelpers903',                testClosureAuditScopingHelpers903);
  add('testClosureAuditScopedArchiveNameMatch903',        testClosureAuditScopedArchiveNameMatch903);
  add('testClosureAuditScopedArchiveAmbiguousMatch903',   testClosureAuditScopedArchiveAmbiguousMatch903);
  add('testProbeTimeoutEnv',                              testProbeTimeoutEnv);
  add('testContractValidatorOfflineSkip',                 testContractValidatorOfflineSkip);
  add('testContractValidatorReflowTolerant',              testContractValidatorReflowTolerant);
  add('testContractValidatorMissingTag',                  testContractValidatorMissingTag);
  add('testTagAncestorGuard402',                          testTagAncestorGuard402);
  add('testWatchPrAbandonedClosureInvariantsClean',       testWatchPrAbandonedClosureInvariantsClean);
  add('testClaimReclaimsStatelessOrphanDir',              testClaimReclaimsStatelessOrphanDir);
  add('testPatchBranchGuards',                            testPatchBranchGuards);
  add('testAdaptiveOffClaimRefusal',                      testAdaptiveOffClaimRefusal);
  add('testAdaptiveOffPreservesTwoWay',                   testAdaptiveOffPreservesTwoWay);
  add('testAdaptiveResumeAfterFlipOff',                   testAdaptiveResumeAfterFlipOff);
  add('testReleaseCheckPreTagGate',                       testReleaseCheckPreTagGate);
  add('testGitignoreCoversKw',                            testGitignoreCoversKw);
  add('testWorktreeHiddenLocalPath',                      testWorktreeHiddenLocalPath);
  add('testLegacyWorktreeCleanupDryRun',                  testLegacyWorktreeCleanupDryRun);
  add('testLegacyWorktreeCleanupDirtySkip',               testLegacyWorktreeCleanupDirtySkip);
  add('testAdaptiveWorktreeProvisionedE2E',               testAdaptiveWorktreeProvisionedE2E);
  add('testSinkReportsWorkflowOnlyBranch',                testSinkReportsWorkflowOnlyBranch);
  add('testSinkAllowsMixedBranch',                        testSinkAllowsMixedBranch);
  add('testClaimFinalizeSinkChainCompletes',              testClaimFinalizeSinkChainCompletes);
  add('testDispatchLogHookWorktreeAware338',              testDispatchLogHookWorktreeAware338);
  add('testDispatchLogEmitsModelFields566',               testDispatchLogEmitsModelFields566);
  add('testDispatchLogResolverResolvesUnderOpencodeLayout567', testDispatchLogResolverResolvesUnderOpencodeLayout567);
  add('testDispatchLogCapturesWorktreeResidentActiveProjectFromMainCwd568', testDispatchLogCapturesWorktreeResidentActiveProjectFromMainCwd568);
  add('testRetiredFinalizeAttestFlagIsInert816',          testRetiredFinalizeAttestFlagIsInert816);
  add('testInlineFinalizeSeamRaisesNoAttestationAlarm816', testInlineFinalizeSeamRaisesNoAttestationAlarm816);
  add('testSelectionEvidenceDocking',                     testSelectionEvidenceDocking);
  add('testFinalizeIncompleteResumesCrashState',          testFinalizeIncompleteResumesCrashState);
  add('testFinalizeIncompleteNegativeControlAlreadyDone', testFinalizeIncompleteNegativeControlAlreadyDone);
  add('testFinalizeIncompleteNegativeControlRepoDirty',   testFinalizeIncompleteNegativeControlRepoDirty);
  add('testFinalizeIncompleteWorktreeReentryFix',         testFinalizeIncompleteWorktreeReentryFix);
  add('testBundleClaimCreatesOneFolder',                  testBundleClaimCreatesOneFolder);
  add('testBundleRefusalLeavesNoFolder',                  testBundleRefusalLeavesNoFolder);
  add('testBundleDuplicateIssueBlocking',                 testBundleDuplicateIssueBlocking);
  add('testBundleFinalizeReceiptFields',                  testBundleFinalizeReceiptFields);
  add('testBundleSingleIssueStateHasNoBundleFields',      testBundleSingleIssueStateHasNoBundleFields);
  add('testFinalizeArchiveVerifiesBeforeDelete',          testFinalizeArchiveVerifiesBeforeDelete);
  add('testArchiveCompleteSourceRelative676',             testArchiveCompleteSourceRelative676);
  add('testFinalizeClosesIssueBundleMembers',             testFinalizeClosesIssueBundleMembers);
  add('testHarnessSelfCheck',                             testHarnessSelfCheck);
  // #429 sink transaction tests
  add('testSinkTransactionBlockedByForeignDirt',          testSinkTransactionBlockedByForeignDirt);
  add('testSinkForeignDirtExemptsSiblingReceipt715',      testSinkForeignDirtExemptsSiblingReceipt715);
  add('testSinkTransactionCrashResume',                   testSinkTransactionCrashResume);
  add('testSinkTransactionCleanEndToEnd',                 testSinkTransactionCleanEndToEnd);
  add('testTwoLanesInOneCheckout579',                     testTwoLanesInOneCheckout579);
  add('testPlanlessAndPlannedInitialAuthority699',        testPlanlessAndPlannedInitialAuthority699);
  add('testArchiveCallersFailClosed699',                  testArchiveCallersFailClosed699);
  add('testOfflineNoHistoryClaimRoot699',                 testOfflineNoHistoryClaimRoot699);
  add('testArchiveNeverRelocatesReservedDir930',          testArchiveNeverRelocatesReservedDir930);
  add('testClaimRollbackRemovesOnlyWhatItCreated932',     testClaimRollbackRemovesOnlyWhatItCreated932);
  add('testClaimNeverAdoptsReservedDir933',               testClaimNeverAdoptsReservedDir933);
  return reg;
}

const SCENARIO_REGISTRY = buildRegistry();

async function main() {
  // ── CLI: parse --list and --only ──────────────────────────────────────────
  const args = process.argv.slice(2);
  // --shard i/N runs a disjoint stride of the registry in this process. The shared-tmp
  // group is ONE indivisible unit (its members share a single fixture root and run in
  // order), so it is registered as a single ordinal and lands whole in one shard.
  //
  // NOT PROVEN FOR CONCURRENT USE: several scenarios here drive real subprocesses under
  // their own timeouts, and shards of this suite running side by side against one checkout
  // have been observed to go red. The chain runner therefore does NOT fan this suite out.
  const shardLib = require('./test-shard-lib');
  const shard = shardLib.selector(args);
  const onlyTokens = [];
  let listMode = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--list') {
      listMode = true;
    } else if (args[i] === '--shard') {
      i++;   // consumed by the shard selector above
    } else if (args[i] === '--only') {
      if (i + 1 >= args.length) {
        process.stderr.write('Error: --only requires a token argument\n');
        process.exitCode = 1;
        return;
      }
      onlyTokens.push(args[++i]);
    }
  }

  // ── --list: print all scenario names and exit 0 ──────────────────────────
  if (listMode) {
    for (const entry of SCENARIO_REGISTRY) {
      const suffix = entry.sharedTmp ? '  [shared-tmp group]' : '';
      process.stdout.write(entry.name + suffix + '\n');
    }
    return;
  }

  // ── --only: select subset (exact match OR prefix match, union of tokens) ─
  let selectedEntries = null;
  let needsSharedTmp = false;
  if (onlyTokens.length > 0) {
    selectedEntries = SCENARIO_REGISTRY.filter(entry =>
      onlyTokens.some(tok => entry.name === tok || entry.name.startsWith(tok))
    );
    if (selectedEntries.length === 0) {
      const msg = 'Error: --only matched no scenarios for token(s): ' +
        onlyTokens.map(t => JSON.stringify(t)).join(', ') +
        '\nRun with --list to see available scenario names.\n';
      process.stderr.write(msg);
      process.exitCode = 1;
      return;
    }
    // If any selected entry is in the shared-tmp group, run the WHOLE group.
    needsSharedTmp = selectedEntries.some(e => e.sharedTmp);
  }

  // ── Run scenarios ─────────────────────────────────────────────────────────
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-active-folders-'));
  const fullRun = selectedEntries === null;
  try {
    // Fresh claims bind their immutable root/epoch identity before branch
    // resolution. The shared fixture must therefore be a real anchored repo,
    // just like every standalone claim fixture that calls initGitRepo itself.
    initGitRepo(tmp);
    if (fullRun) {
      // Full run: same order as original main(), shared-tmp group first. Ordinal 0 is
      // the shared-tmp group; ordinals 1..n are the standalone scenarios in file order.
      let ordinal = 0;
      let ran = 0;
      if (shard.owns(ordinal++)) {
        await runSharedTmpGroup(tmp);
        ran++;
      }
      for (const entry of SCENARIO_REGISTRY) {
        if (entry.sharedTmp) continue; // part of the group unit above
        if (!shard.owns(ordinal++)) continue;
        ran++;
        await entry.fn();
      }
      shardLib.reportCoverage('simulate-workflow-walkthrough', shard, ordinal, ran, ran, 0);
      console.log('Workflow walkthrough simulation passed');
    } else {
      // Subset run.
      if (needsSharedTmp) {
        await runSharedTmpGroup(tmp);
      }
      // Run the non-shared-tmp selected entries (sharedTmp ones were run as a group above).
      for (const entry of selectedEntries) {
        if (entry.sharedTmp) continue;
        await entry.fn();
      }
      console.log('Walkthrough --only subset passed (' + selectedEntries.length + ' scenarios)');
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// DELETED: testAttestationWarningPersistence. It seeded a role-only dispatch-log so the planner seam
// would surface `ATTESTATION WARNING: no workflow-planner dispatch found in dispatch-log`, then
// asserted that warning landed verbatim in the archived finalization-summary.md and the
// workflow-state.md ## Closure block. Every producer in that chain is retired — the mandatory
// planner agent is gone, inline authoring is the design, and claim.js dropped
// checkDispatchAttestations, persistAttestationToSummary and the claim_planner_attested field. The
// warning string now has no producer anywhere outside test sources.
//
// UNCOVERED: that a non-empty attestation warning is persisted durably rather than only printed to
// stdout. The durable-persistence DISCIPLINE it demonstrated survives elsewhere (the ## Closure
// block is still written and still asserted); what is gone is the one warning it carried.

// n5 (#653 finding D3): selection-evidence probe. Case (a) seeds .cache/selection-evidence.md
// pre-finalize (simulating the router's D2 docking) -> closure_receipt.selection_evidence must
// read 'present' and the file must survive under the archived project's .cache/. Case (b), a
// separate project with no docked file (the user-named-claim shape), must read 'absent'.
function testSelectionEvidenceDocking() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-selection-evidence-')));
  const kwRoot = tmp + '.kw';
  try {
    initGitRepo(tmp);
    const binDir = path.join(tmp, 'bin');
    writeGhShimForStartup(binDir);

    // (a) present — router docked selection-evidence.md before finalize.
    const sResult = runClaimOnlineLastJson(['startup', '--target-issue', '653201'], tmp, binDir);
    assert(sResult.claim === 'acquired', 'selection-evidence: startup must acquire');
    const project = sResult.selected_project || 'issue-653201';
    seedAdaptiveFinalizeFixture(tmp, project);

    const cacheDir = path.join(tmp, 'kaola-workflow', project, '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, 'selection-evidence.md'),
      'selection_mode: single-issue\n\n```json\n{"recommended_bundle":{"primary_issue":653201,"issues":[653201],"confidence":"low"}}\n```\n');

    const finResult = runClaimOnlineLastJson(['finalize', '--project', project], tmp, binDir);
    assert(finResult.status === 'closed',
      'selection-evidence: finalize must return status:closed, got: ' + JSON.stringify(finResult));
    const finReceipt = finResult.closure_receipt;
    assert(finReceipt && finReceipt.selection_evidence === 'present',
      'selection-evidence: seeded selection-evidence.md must read closure_receipt.selection_evidence === present, got: ' +
      JSON.stringify(finReceipt));

    const archivedEvidencePath = path.join(tmp, 'kaola-workflow', 'archive', project, '.cache', 'selection-evidence.md');
    assert(fs.existsSync(archivedEvidencePath),
      'selection-evidence: selection-evidence.md must survive under the archived project .cache/, expected at ' + archivedEvidencePath);

    // (b) absent — a second project with no docked selection-evidence file (user-named claim shape).
    const sResult2 = runClaimOnlineLastJson(['startup', '--target-issue', '653202'], tmp, binDir);
    assert(sResult2.claim === 'acquired', 'selection-evidence: second startup must acquire');
    const project2 = sResult2.selected_project || 'issue-653202';
    seedAdaptiveFinalizeFixture(tmp, project2);

    const finResult2 = runClaimOnlineLastJson(['finalize', '--project', project2], tmp, binDir);
    assert(finResult2.status === 'closed',
      'selection-evidence: second finalize must return status:closed, got: ' + JSON.stringify(finResult2));
    const finReceipt2 = finResult2.closure_receipt;
    assert(finReceipt2 && finReceipt2.selection_evidence === 'absent',
      'selection-evidence: a claim with no docked selection-evidence.md must read closure_receipt.selection_evidence === absent, got: ' +
      JSON.stringify(finReceipt2));

    console.log('testSelectionEvidenceDocking: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
  }
}

// ── the claim → finalize → sink chain completes end to end ──────────────────
// NARROWED (was testPlannerAttestFlagBackfillsDispatchLog). It drove startup WITH
// --attest-planner-spawn, asserted the back-fill wrote a workflow-planner entry into
// dispatch-log.jsonl, and asserted claim_planner_attested === 'attested' on both the finalize and
// the sink-merge receipts. The flag is retired from claim.js — passing it now refuses unknown_flag
// with zero side effects — and the field has no producer, so all of that is gone.
//
// What is KEPT is a different assertion that merely shared the fixture: a real startup claim,
// worktree provisioning, a feature commit, finalize reaching status:closed, and sink-merge reaching
// status:merged. That chain is the only place in this suite where all three run against one another
// for real, and it has nothing to do with attestation. Retaining it is not reshaping a pin around an
// absent mechanism; deleting it would have thrown away live coverage that happened to be adjacent.
//
// UNCOVERED by the narrowing: that a planner dispatch is recorded in dispatch-log.jsonl and read
// back as an attestation. Retired mechanism — the flag, the probe, the writer and the field are all
// gone. The reappearance guards below are what survives.
function testClaimFinalizeSinkChainCompletes() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-280-ac1-')));
  const kwRoot = tmp + '.kw';
  try {
    initGitRepo(tmp);
    const binDir = path.join(tmp, 'bin');
    writeGhShimForStartup(binDir);

    const sResult = runClaimOnlineLastJson(
      ['startup', '--target-issue', '280001'],
      tmp, binDir
    );
    assert(sResult.claim === 'acquired', 'startup must acquire');
    const project = sResult.selected_project || 'issue-280001';
    // This fixture exercises the claim → finalize → sink chain, not the adaptive plan/Phase-5 gate.
    // Declare the established plan-absent fast exemption explicitly.
    seedAdaptiveFinalizeFixture(tmp, project);

    const finResult = runClaimOnlineLastJson(
      ['finalize', '--project', project],
      tmp, binDir
    );
    assert(finResult.status === 'closed', 'finalize must return status:closed, got: ' + JSON.stringify(finResult));
    const finReceipt = finResult.closure_receipt;
    assert(finReceipt, 'finalize must emit closure_receipt');
    assert(!('claim_planner_attested' in finReceipt),
      'the retired planner attestation field must not reappear on the finalize receipt, got: ' + JSON.stringify(Object.keys(finReceipt)));
    assert(!('finalize_contractor_attested' in finReceipt),
      '#816: the finalize seam emits no attestation field, got: ' + JSON.stringify(Object.keys(finReceipt)));

    // Set up the worktree branch that sink-merge needs to FF-merge.
    const wtPath = sResult.worktree_path;
    const branchName = sResult.branch || ('workflow/issue-280001');
    // We need a feature commit ON THE FEATURE BRANCH before sink-merge can FF. When claim
    // provisioned a worktree it is already on that branch; when it did not (the offline shape this
    // fixture actually takes), the main root is on `main`, and the old fallback committed straight
    // to main. That made the merge a no-op and every downstream claim about it vacuous — the
    // scenario reported status:merged for a merge that had nothing to do. Check the branch out
    // explicitly in that case, and put the root back on main afterwards so the sink starts from the
    // posture it expects.
    const usingWorktree = !!(wtPath && fs.existsSync(wtPath));
    const commitRepo = usingWorktree ? wtPath : tmp;
    if (!usingWorktree) G.git(tmp, ['checkout', branchName], { encoding: 'utf8' });
    fs.writeFileSync(path.join(commitRepo, 'feature-280001.txt'), 'ac1 test\n');
    G.git(commitRepo, ['add', 'feature-280001.txt'], { encoding: 'utf8' });
    G.git(commitRepo, ['commit', '-m', 'feat: ac1 test for issue 280001'], { encoding: 'utf8' });
    // Captured before the sink runs: a successful sink deletes the branch ref, so the SHA is what
    // survives to be checked for ancestry afterwards.
    const featureSha = G.git(commitRepo, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    if (!usingWorktree) G.git(tmp, ['checkout', 'main'], { encoding: 'utf8' });
    // The precondition that makes the merge assertions non-vacuous: the feature commit is NOT yet
    // on main, so "it is on main afterwards" is a fact the sink has to establish.
    assert(G.git(tmp, ['merge-base', '--is-ancestor', featureSha, 'main'], { encoding: 'utf8' }).status !== 0,
      'precondition: the feature commit must NOT already be on main before the sink runs, or the merge assertions below prove nothing');

    const smResult = spawnSync(process.execPath, [
      sinkMergeScript,
      '--project', project,
      '--branch', branchName,
      '--issue', '280001'
    ], {
      cwd: commitRepo,
      encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
    });
    assert(smResult.status === 0,
      'sink-merge must exit 0\nstdout: ' + smResult.stdout + '\nstderr: ' + smResult.stderr);

    const smLines = smResult.stdout.trim().split('\n').filter(l => l.trim());
    const smParsed = JSON.parse(smLines[smLines.length - 1]);
    assert(smParsed.status === 'merged',
      'sink-merge must emit status:merged, got: ' + JSON.stringify(smParsed));

    // …and the merge is a GIT FACT, not a word in the envelope. `status: merged` is the sink's own
    // account of itself, and this campaign has four separate mutation proofs that a sink can
    // publish, or fail to publish, while still emitting a perfectly good message about it — one of
    // them taken right here, by skipping the fast-forward and watching this scenario stay green
    // until the fixture above was fixed.
    //
    // Checked against the commit SHA captured BEFORE the sink ran, not against the branch NAME: a
    // successful sink deletes the feature branch ref, so `--is-ancestor <name> main` fails on a
    // perfectly good merge. That is a property of the assertion, not of the product — naming the
    // ref would have made this pin unfalsifiable in the other direction.
    assert(G.git(tmp, ['merge-base', '--is-ancestor', featureSha, 'main'], { encoding: 'utf8' }).status === 0,
      'the feature commit ' + featureSha + ' must actually be an ancestor of main after status:merged (git ancestry, not the envelope word)');
    assert(G.git(tmp, ['cat-file', '-e', 'main:feature-280001.txt'], { encoding: 'utf8' }).status === 0,
      'the feature commit must actually be present at main after status:merged');

    const smReceipt = smParsed.closure_receipt;
    assert(smReceipt, 'sink-merge must emit closure_receipt');
    assert(!('claim_planner_attested' in smReceipt),
      'the retired planner attestation field must not reappear on the sink-merge receipt, got: ' + JSON.stringify(Object.keys(smReceipt)));
    assert(!('finalize_contractor_attested' in smReceipt),
      '#816: the sink-merge receipt emits no finalize-seam attestation field, got: ' + JSON.stringify(Object.keys(smReceipt)));

    console.log('testClaimFinalizeSinkChainCompletes: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
  }
}

// DELETED: testPlannerAttestFlagAbsentStaysMissing. It ran the same startup WITHOUT
// --attest-planner-spawn and asserted claim_planner_attested !== 'attested' on both the finalize and
// the sink-merge receipts — the inline-bypass guard. The field has no producer and inline authoring
// is now the design, so the guard has nothing left to guard: the thing it treated as suspect is what
// the workflow does. Its surviving half — neither retired attestation field may reappear — is
// asserted in testClaimFinalizeSinkChainCompletes above, on the same two receipts, so nothing is
// lost by deleting the whole scenario rather than narrowing it as well.
//
// UNCOVERED: nothing that a live mechanism can violate.


// ── #338 T3: dispatch-log hook is worktree-aware (dual-root capture) ──────────
// Producer-side false-negative fix: a role dispatched into a linked worktree must be
// logged where the worktree's consumers (cmdFinalize) read .cache/dispatch-log.jsonl. The hook
// runs with cwd=main but must ALSO resolve the dispatched agent's cwd (AGENT_CWD) toplevel and
// append there. Also assert the in-place case (cwd==main, active project in main) logs once.
function testDispatchLogHookWorktreeAware338() {
  const hookPath = path.join(repoRoot, 'hooks', 'kaola-workflow-subagent-dispatch-log.sh');
  // (a) WORKTREE case: active project ONLY in the linked worktree.
  const main = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-338-wt-main-')));
  try {
    initGitRepo(main);
    // git worktree add a linked worktree on a new branch
    const wt = main + '-wt';
    const wtAdd = G.git(main, ['worktree', 'add', '-b', 'wt338', wt], { encoding: 'utf8' });
    assert(wtAdd.status === 0, '#338 T3: git worktree add must succeed: ' + wtAdd.stderr);
    // Active project state file ONLY in the worktree.
    const wtProj = path.join(wt, 'kaola-workflow', 'proj');
    fs.mkdirSync(wtProj, { recursive: true });
    fs.writeFileSync(path.join(wtProj, 'workflow-state.md'), '# State\nstatus: active\n');
    // No active project in main → the old hook (hook-cwd only) would log nothing.
    const payload = JSON.stringify({ agent_type: 'tdd-guide', agent_id: 't', cwd: wt });
    // The dispatch-log hook is a bash script — it has NO in-process form. What is asserted is its
    // shell contract: a JSON payload on stdin plus a cwd must yield exit 0 (fail-open) and exactly
    // one appended record.
    // spawn-class: cli-contract
    const hr = spawnSync('bash', [hookPath], { cwd: main, input: payload, encoding: 'utf8' });
    assert(hr.status === 0, '#338 T3: hook must exit 0 (fail-open), got ' + hr.status);
    const wtLog = path.join(wtProj, '.cache', 'dispatch-log.jsonl');
    assert(fs.existsSync(wtLog),
      '#338 T3: a worktree-dispatched role must be logged under the WORKTREE project .cache/');
    const wtLogContent = fs.readFileSync(wtLog, 'utf8');
    assert(wtLogContent.includes('"agent_type":"tdd-guide"'),
      '#338 T3: worktree dispatch-log must contain the role entry, got: ' + wtLogContent);
    try { G.git(main, ['worktree', 'remove', '--force', wt], { encoding: 'utf8' }); } catch (_) {}
    try { fs.rmSync(wt, { recursive: true, force: true }); } catch (_) {}
  } finally {
    fs.rmSync(main, { recursive: true, force: true });
  }

  // (b) IN-PLACE case: active project in main, AGENT_CWD == main → exactly ONE line (no dup).
  const inplace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-338-inplace-')));
  try {
    initGitRepo(inplace);
    const proj = path.join(inplace, 'kaola-workflow', 'proj');
    fs.mkdirSync(proj, { recursive: true });
    fs.writeFileSync(path.join(proj, 'workflow-state.md'), '# State\nstatus: active\n');
    const payload = JSON.stringify({ agent_type: 'tdd-guide', agent_id: 't', cwd: inplace });
    // Same shell contract, in-place posture: stdin payload plus cwd must yield exit 0 and exactly
    // one appended record (no duplicate).
    // spawn-class: cli-contract
    const hr = spawnSync('bash', [hookPath], { cwd: inplace, input: payload, encoding: 'utf8' });
    assert(hr.status === 0, '#338 T3: in-place hook must exit 0, got ' + hr.status);
    const log = path.join(proj, '.cache', 'dispatch-log.jsonl');
    assert(fs.existsSync(log), '#338 T3: in-place active project must still be logged');
    const count = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).length;
    assert(count === 1,
      '#338 T3: in-place run (AGENT_ROOT==HOOK_ROOT) must log EXACTLY once, got ' + count);
  } finally {
    fs.rmSync(inplace, { recursive: true, force: true });
  }
  console.log('testDispatchLogHookWorktreeAware338: PASSED');
}

// ── #566: dispatch-log hook emits model + model_planned (observability, fail-open, no new gate) ──
// The per-node `model` column was the only frozen-plan field with no closed loop. The hook now
// emits BOTH `model_planned` (resolved fail-open via resolve-agent-model.js for a known role) and
// `model` (opportunistic, parsed from the STDIN payload — supplied by the codex runtime only; empty
// for Claude Code SubagentStart and opencode). This test crafts a payload that DOES include `model`
// (simulating the codex runtime) and asserts both fields are populated.
function testDispatchLogEmitsModelFields566() {
  const hookPath = path.join(repoRoot, 'hooks', 'kaola-workflow-subagent-dispatch-log.sh');
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-566-model-')));
  try {
    initGitRepo(tmp);
    const proj = path.join(tmp, 'kaola-workflow', 'proj');
    fs.mkdirSync(proj, { recursive: true });
    fs.writeFileSync(path.join(proj, 'workflow-state.md'), '# State\nstatus: active\n');
    // Payload INCLUDES a `model` field (simulating the codex runtime supply); n1 finding: only the
    // codex CLI runtime exposes model, so the test injects it directly.
    const payload = JSON.stringify({ agent_type: 'tdd-guide', agent_id: 't', cwd: tmp, model: 'gpt-5.2' });
    // Same shell contract with a model field on stdin: exit 0 fail-open plus one well-formed
    // JSONL record is the envelope this bash entry point owes its caller.
    // spawn-class: cli-contract
    const hr = spawnSync('bash', [hookPath], { cwd: tmp, input: payload, encoding: 'utf8' });
    assert(hr.status === 0, '#566: hook must exit 0 (fail-open), got ' + hr.status);
    const log = path.join(proj, '.cache', 'dispatch-log.jsonl');
    assert(fs.existsSync(log), '#566: dispatch-log must be appended');
    const lines = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean);
    assert(lines.length === 1, '#566: exactly one JSONL line expected, got ' + lines.length);
    const parsed = JSON.parse(lines[0]);
    assert(parsed.agent_type === 'tdd-guide', '#566: agent_type preserved, got ' + parsed.agent_type);
    assert(parsed.model_planned && parsed.model_planned.length > 0,
      '#566: model_planned must be non-empty (resolver returns a tier for tdd-guide), got: ' + JSON.stringify(parsed.model_planned));
    assert(parsed.model === 'gpt-5.2',
      '#566: model must equal the payload-supplied value, got: ' + JSON.stringify(parsed.model));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('testDispatchLogEmitsModelFields566: PASSED');
}

// ── #567: model_planned resolves under the opencode install layout (not just the sibling scripts/) ──
// #566 hard-coded the resolver as dirname(dirname($0))/scripts, assuming scripts/ is a sibling of
// hooks/. True for the four plugin editions, FALSE for opencode: there the hook lives at <root>/hooks/
// while support scripts live at <root>/kaola-workflow/scripts/ — so model_planned came back empty on
// opencode. This stages that exact layout (sibling scripts/ genuinely absent) and asserts the hook's
// multi-path resolver search finds the resolver under the opencode-native dir. RED before the fix.
function testDispatchLogResolverResolvesUnderOpencodeLayout567() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-567-oc-')));
  try {
    // The dispatched agent's repo — carries the active project the hook appends to.
    const repo = path.join(tmp, 'repo');
    fs.mkdirSync(repo, { recursive: true });
    initGitRepo(repo);
    const proj = path.join(repo, 'kaola-workflow', 'proj');
    fs.mkdirSync(proj, { recursive: true });
    fs.writeFileSync(path.join(proj, 'workflow-state.md'), '# State\nstatus: active\n');
    // opencode-native layout: hook at <cfg>/hooks/, resolver at <cfg>/kaola-workflow/scripts/
    // (deliberately NOT <cfg>/scripts/ — the sibling path the old hook looked at).
    const cfg = path.join(tmp, 'cfg');
    const ocHooks = path.join(cfg, 'hooks');
    const ocScripts = path.join(cfg, 'kaola-workflow', 'scripts');
    fs.mkdirSync(ocHooks, { recursive: true });
    fs.mkdirSync(ocScripts, { recursive: true });
    const hookDst = path.join(ocHooks, 'kaola-workflow-subagent-dispatch-log.sh');
    fs.copyFileSync(path.join(repoRoot, 'hooks', 'kaola-workflow-subagent-dispatch-log.sh'), hookDst);
    fs.copyFileSync(path.join(repoRoot, 'scripts', 'kaola-workflow-resolve-agent-model.js'),
      path.join(ocScripts, 'kaola-workflow-resolve-agent-model.js'));
    // Control: the sibling lookup (<cfg>/scripts) must be genuinely absent, so a pass can only come
    // from the opencode-native (<cfg>/kaola-workflow/scripts) candidate.
    assert(!fs.existsSync(path.join(cfg, 'scripts')), '#567: control — sibling scripts/ must be absent');
    const payload = JSON.stringify({ agent_type: 'tdd-guide', agent_id: 't', cwd: repo });
    // The hook is DEPLOYED into a foreign install layout (the sibling scripts/ dir is asserted
    // ABSENT) and probed there. What is under test is resolution against that materialization.
    // spawn-class: environment
    const hr = spawnSync('bash', [hookDst], { cwd: repo, input: payload, encoding: 'utf8' });
    assert(hr.status === 0, '#567: hook must exit 0 (fail-open), got ' + hr.status);
    const log = path.join(proj, '.cache', 'dispatch-log.jsonl');
    assert(fs.existsSync(log), '#567: dispatch-log must be appended');
    const lines = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean);
    assert(lines.length === 1, '#567: exactly one JSONL line expected, got ' + lines.length);
    const parsed = JSON.parse(lines[0]);
    assert(parsed.model_planned && parsed.model_planned.length > 0,
      '#567: model_planned must resolve under the opencode layout (resolver at kaola-workflow/scripts/), got: ' + JSON.stringify(parsed.model_planned));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('testDispatchLogResolverResolvesUnderOpencodeLayout567: PASSED');
}

// ── #568: dispatch-log captures a role spawn when the active project is WORKTREE-resident but the
// agent cwd is the MAIN repo (opencode worktree posture) ──
// #338 covered agent cwd == worktree (AGENT_ROOT resolves to the worktree). #568 is the INVERSE:
// under opencode worktree posture the role agent runs with cwd == MAIN repo while the active
// workflow-state.md lives in the linked executor worktree. The old dual-root scan resolves BOTH
// HOOK_ROOT and AGENT_ROOT to main, where no active project exists → nothing logged (M1/M2 blind to
// role spawns). The fix enumerates the main repo's linked worktrees and logs under the worktree's
// active project. This stages that exact layout (active project ONLY in the worktree, agent cwd ==
// main) and asserts the role spawn IS logged exactly once under the worktree project. RED before fix.
function testDispatchLogCapturesWorktreeResidentActiveProjectFromMainCwd568() {
  const hookPath = path.join(repoRoot, 'hooks', 'kaola-workflow-subagent-dispatch-log.sh');
  const main = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-568-wt-')));
  try {
    initGitRepo(main);
    // Linked worktree holds the ACTIVE project; main has NONE.
    const wt = main + '-wt';
    const wtAdd = G.git(main, ['worktree', 'add', '-b', 'wt568', wt], { encoding: 'utf8' });
    assert(wtAdd.status === 0, '#568: git worktree add must succeed: ' + wtAdd.stderr);
    const wtProj = path.join(wt, 'kaola-workflow', 'issue-568');
    fs.mkdirSync(wtProj, { recursive: true });
    fs.writeFileSync(path.join(wtProj, 'workflow-state.md'), '# State\nstatus: active\n');
    // Control: main has NO active project, so a pass can only come from the worktree scan.
    assert(!fs.existsSync(path.join(main, 'kaola-workflow')),
      '#568: control — main must have no active project');
    // The KEY difference from #338: agent cwd == MAIN repo (NOT the worktree). Under opencode
    // worktree posture the role agent runs in the main repo while the active state is worktree-resident.
    const payload = JSON.stringify({ agent_type: 'tdd-guide', agent_id: 'n2', cwd: main });
    // Same shell contract from the main-repo cwd: exit 0 fail-open plus exactly one record.
    // spawn-class: cli-contract
    const hr = spawnSync('bash', [hookPath], { cwd: main, input: payload, encoding: 'utf8' });
    assert(hr.status === 0, '#568: hook must exit 0 (fail-open), got ' + hr.status);
    const wtLog = path.join(wtProj, '.cache', 'dispatch-log.jsonl');
    assert(fs.existsSync(wtLog),
      '#568: a role agent dispatched with cwd=main MUST still be logged under the worktree-resident active project .cache/');
    const lines = fs.readFileSync(wtLog, 'utf8').split('\n').filter(Boolean);
    assert(lines.length === 1, '#568: exactly one JSONL line expected (no dup), got ' + lines.length);
    assert(lines[0].includes('"agent_type":"tdd-guide"'),
      '#568: worktree dispatch-log must contain the role-agent entry, got: ' + lines[0]);
    try { G.git(main, ['worktree', 'remove', '--force', wt], { encoding: 'utf8' }); } catch (_) {}
    try { fs.rmSync(wt, { recursive: true, force: true }); } catch (_) {}
  } finally {
    fs.rmSync(main, { recursive: true, force: true });
  }
  console.log('testDispatchLogCapturesWorktreeResidentActiveProjectFromMainCwd568: PASSED');
}

// ── #816: --attest-contractor-spawn is a RETIRED warn-and-ignore shim ──
// The finalize seam is orchestrator-owned, so there is nothing to attest and nothing to back-fill.
// A stale caller still passing the flag must be accepted (never an unknown_flag refusal) and must
// produce NO dispatch marker and NO receipt field.
function testRetiredFinalizeAttestFlagIsInert816() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-338-ac2-attest-')));
  const kwRoot = tmp + '.kw';
  try {
    initGitRepo(tmp);
    const binDir = path.join(tmp, 'bin');
    writeGhShimForStartup(binDir);

    const sResult = runClaimOnlineLastJson(['startup', '--target-issue', '338001'], tmp, binDir);
    assert(sResult.claim === 'acquired', '#338 T4: startup must acquire');
    const project = sResult.selected_project || 'issue-338001';
    // This attestation fixture exercises finalize directly and never authors an
    // adaptive plan, so declare its intended planless path before finalization.
    seedAdaptiveFinalizeFixture(tmp, project);

    // No dispatch-log yet (no flag at claim, no hook in test env).
    const dispatchLog = path.join(tmp, 'kaola-workflow', project, '.cache', 'dispatch-log.jsonl');
    assert(!fs.existsSync(dispatchLog), '#816: no dispatch-log before finalize');

    const finResult = runClaimOnlineLastJson(
      ['finalize', '--project', project, '--attest-contractor-spawn'], tmp, binDir);
    assert(finResult.status === 'closed',
      '#816: the retired flag must warn-and-ignore, never refuse, got: ' + JSON.stringify(finResult));
    const finReceipt = finResult.closure_receipt;
    assert(finReceipt, '#816: finalize must emit closure_receipt');
    assert(!('finalize_contractor_attested' in finReceipt),
      '#816: the retired flag must record no attestation field, got: ' + JSON.stringify(Object.keys(finReceipt)));

    // Nothing may be back-filled into the archived dispatch-log.
    const archiveLog = path.join(tmp, 'kaola-workflow', 'archive', project, '.cache', 'dispatch-log.jsonl');
    const archiveContent = fs.existsSync(archiveLog) ? fs.readFileSync(archiveLog, 'utf8') : '';
    assert(!/finalize-backfill|"agent_type":"contractor"/.test(archiveContent),
      '#816: the retired flag must back-fill no dispatch marker, got: ' + archiveContent);
    console.log('testRetiredFinalizeAttestFlagIsInert816: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
  }
}

// ── #816: an inline finalize is the DESIGN, not a bypass ──
// NARROWED: the two assertions that depended on a dispatched planner are gone — the
// --attest-planner-spawn back-fill and `claim_planner_attested === 'attested'` — because the flag,
// the probe and the field are all retired. The scenario's actual claim never depended on them and
// is now stronger for it: an inline finalize completes (status:closed), carries NEITHER retired
// attestation field, and raises NO alarm about having been run inline. Treating inline finalize as
// suspect is the inversion this retires, and that is exactly what is still asserted.
function testInlineFinalizeSeamRaisesNoAttestationAlarm816() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-338-ac2-fallback-')));
  const kwRoot = tmp + '.kw';
  try {
    initGitRepo(tmp);
    const binDir = path.join(tmp, 'bin');
    writeGhShimForStartup(binDir);

    // Planner WAS dispatched (its back-fill writes a dispatch-log).
    const sResult = runClaimOnlineLastJson(
      ['startup', '--target-issue', '338002'], tmp, binDir);
    assert(sResult.claim === 'acquired', '#338 T5: startup must acquire');
    const project = sResult.selected_project || 'issue-338002';
    // Like T4, this fixture never authors an adaptive plan.
    seedAdaptiveFinalizeFixture(tmp, project);

    // finalize run inline by the orchestrator — the design, not a bypass.
    const finResult = runClaimOnlineLastJson(['finalize', '--project', project], tmp, binDir);
    assert(finResult.status === 'closed',
      '#816: an inline finalize must return status:closed, got: ' + JSON.stringify(finResult));
    const finReceipt = finResult.closure_receipt;
    assert(finReceipt, '#816: finalize must emit closure_receipt');
    assert(!('claim_planner_attested' in finReceipt),
      'the retired planner attestation field must not reappear on an inline finalize receipt, got: ' + JSON.stringify(Object.keys(finReceipt)));
    assert(!('finalize_contractor_attested' in finReceipt),
      '#816: the finalize seam emits no attestation field, got: ' + JSON.stringify(Object.keys(finReceipt)));
    assert(Array.isArray(finReceipt.warnings) &&
      !finReceipt.warnings.some(w => /contractor|finalize seam may have been run inline/i.test(String(w))),
      '#816: an inline finalize raises NO attestation alarm, got: ' + JSON.stringify(finReceipt.warnings));
    console.log('testInlineFinalizeSeamRaisesNoAttestationAlarm816: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
  }
}

// ── #296: cmdResume crash-resume after archiveProjectDir ran but impl uncommitted ──
// Crash state: kaola-workflow/archive/{project}/ exists, no active folder,
// working tree is dirty (impl not committed) → resumed:true, reason:finalize_incomplete.
function testFinalizeIncompleteResumesCrashState() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-296-crash-'));
  try {
    initGitRepo(tmp);
    const project = 'issue-296x';
    // Simulate archiveProjectDir: create the archive dir with a workflow-state.md
    const archiveDir = path.join(tmp, 'kaola-workflow', 'archive', project);
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, 'workflow-state.md'), [
      '# Kaola-Workflow State', '',
      'name: ' + project,
      'issue_number: 296',
      'status: closed',
      'step: complete',
      ''
    ].join('\n'));
    // No active folder (the rename already happened).
    // Leave working tree dirty: an uncommitted implementation file.
    fs.writeFileSync(path.join(tmp, 'impl-296.js'), '// implementation\n');
    // Confirm tree is dirty before calling resume.
    const dirtyCheck = G.git(tmp, ['status', '--porcelain'], { encoding: 'utf8' });
    assert(dirtyCheck.stdout.trim().length > 0, 'fixture: working tree must be dirty for crash test');
    const result = JSON.parse(
      runNode(claimScript, ['resume', '--project', project], tmp).stdout
    );
    assert(result.resumed === true,
      '#296 crash resume: resumed must be true, got: ' + JSON.stringify(result));
    assert(result.reason === 'finalize_incomplete',
      '#296 crash resume: reason must be finalize_incomplete, got: ' + JSON.stringify(result));
    assert(result.next_command && result.next_command.includes('finalize'),
      '#296 crash resume: next_command must mention finalize, got: ' + JSON.stringify(result));
    console.log('testFinalizeIncompleteResumesCrashState: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// Negative control: same archive-present / no-active-folder setup but working tree is CLEAN
// (impl was committed). Must NOT re-route to finalize — must return already_finalized.
function testFinalizeIncompleteNegativeControlAlreadyDone() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-296-clean-'));
  try {
    initGitRepo(tmp);
    const project = 'issue-296y';
    // Simulate archiveProjectDir: create archive dir
    const archiveDir = path.join(tmp, 'kaola-workflow', 'archive', project);
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, 'workflow-state.md'), [
      '# Kaola-Workflow State', '',
      'name: ' + project,
      'issue_number: 296',
      'status: closed',
      'step: complete',
      ''
    ].join('\n'));
    // Commit everything so the working tree is clean.
    G.git(tmp, ['add', '-A'], { encoding: 'utf8' });
    G.git(tmp, ['commit', '-m', 'impl: issue 296y'], { encoding: 'utf8' });
    // Confirm tree is clean.
    const cleanCheck = G.git(tmp, ['status', '--porcelain'], { encoding: 'utf8' });
    assert(cleanCheck.stdout.trim().length === 0, 'fixture: working tree must be clean for negative control');
    const result = JSON.parse(
      runNode(claimScript, ['resume', '--project', project], tmp).stdout
    );
    assert(result.resumed === false,
      '#296 negative control: resumed must be false for already-finalized, got: ' + JSON.stringify(result));
    assert(result.reason === 'already_finalized',
      '#296 negative control: reason must be already_finalized, got: ' + JSON.stringify(result));
    console.log('testFinalizeIncompleteNegativeControlAlreadyDone: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// B2 negative control: archive present + no active folder, but ONLY an unrelated file is
// dirty (simulating another issue in progress). detectFinalizeIncomplete must NOT falsely
// signal crash — must return already_finalized because the project's archive is committed.
function testFinalizeIncompleteNegativeControlRepoDirty() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-296-repodirty-'));
  try {
    initGitRepo(tmp);
    const project = 'issue-296z';
    const archiveDir = path.join(tmp, 'kaola-workflow', 'archive', project);
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, 'workflow-state.md'), [
      '# Kaola-Workflow State', '',
      'name: ' + project,
      'issue_number: 296',
      'status: closed',
      'step: complete',
      ''
    ].join('\n'));
    // Commit the archive dir so it is clean for this project.
    G.git(tmp, ['add', '-A'], { encoding: 'utf8' });
    G.git(tmp, ['commit', '-m', 'impl: archive issue-296z'], { encoding: 'utf8' });
    // Now add an UNRELATED untracked file — simulating another issue in progress.
    fs.writeFileSync(path.join(tmp, 'other-issue-work.js'), '// unrelated\n');
    // Confirm the repo is dirty but only because of the unrelated file.
    const dirtyCheck = G.git(tmp, ['status', '--porcelain'], { encoding: 'utf8' });
    assert(dirtyCheck.stdout.trim().length > 0, 'fixture: repo must be dirty (unrelated file)');
    const result = JSON.parse(
      runNode(claimScript, ['resume', '--project', project], tmp).stdout
    );
    assert(result.resumed === false,
      '#296 B2 negative control (repo dirty): resumed must be false for already-finalized project, got: ' + JSON.stringify(result));
    assert(result.reason === 'already_finalized',
      '#296 B2 negative control (repo dirty): reason must be already_finalized, not finalize_incomplete, got: ' + JSON.stringify(result));
    console.log('testFinalizeIncompleteNegativeControlRepoDirty: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// B1 re-entry fix: in a linked worktree, when cmdFinalize --keep-worktree is called a
// second time (re-entry after crash), result.dest is undefined (source already moved),
// but the archive dir must still be staged and committed so the tree goes clean.
function testFinalizeIncompleteWorktreeReentryFix() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-296-b1-main-')));
  const wtPath = path.join(tmp, '.kw', 'worktrees', 'issue-296b1');
  try {
    initGitRepo(tmp);
    // Create a feature branch directly in the linked worktree (worktree add -b).
    fs.mkdirSync(path.dirname(wtPath), { recursive: true });
    G.git(tmp, ['worktree', 'add', '-b', 'workflow/issue-296b1', '--', wtPath, 'HEAD'], { encoding: 'utf8' });

    // Confirm the worktree is linked (getCoordRoot from wt points to main .git).
    const coordFromWt = G.git(wtPath, ['rev-parse', '--git-common-dir'], { encoding: 'utf8' }).stdout.trim();
    const coordAbs = path.resolve(wtPath, coordFromWt);
    assert(coordAbs === path.join(tmp, '.git'),
      'fixture: worktree must have a different coord root from wt root; got: ' + coordAbs);

    const project = 'issue-296b1';
    // Simulate the crash state: archiveProjectDir has already run (archive dir exists,
    // project source dir is GONE) but the impl commit was never made.
    const archiveDir = path.join(wtPath, 'kaola-workflow', 'archive', project);
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, 'workflow-state.md'), [
      '# Kaola-Workflow State', '',
      'name: ' + project,
      'issue_number: 296',
      'status: closed',
      'workflow_path: adaptive',
      'step: complete',
      ''
    ].join('\n'));
    // A real crash archives the whole project folder, so the validation record lives in the
    // archive. Seed it there so the re-entry measures a green, bound validation. (The frozen plan
    // this used to seed alongside it existed for the `adaptive_plan_missing` refusal, which is
    // deleted — a plan-absent finalize is now the ordinary case.)
    fs.mkdirSync(path.join(archiveDir, '.cache'), { recursive: true });
    fs.writeFileSync(path.join(archiveDir, '.cache', 'final-validation.md'),
      'verdict: pass\nfindings_blocking: 0\nvalidated_candidate_hash: ' + candidateHashFor(wtPath, project) + '\n');
    // Verify archive is untracked in the worktree (crash state).
    const dirtyBefore = G.git(wtPath, ['status', '--porcelain'], { encoding: 'utf8' });
    assert(dirtyBefore.stdout.trim().length > 0,
      'fixture: worktree must be dirty (archive uncommitted) before re-entry');

    // Re-entry: run cmdFinalize --keep-worktree from the worktree (second call).
    const finResult = spawnSync(process.execPath, [
      claimScript, 'finalize', '--project', project, '--keep-worktree'
    ], { cwd: wtPath, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
    assert(finResult.status === 0,
      '#296 B1: finalize re-entry must exit 0\nstdout: ' + finResult.stdout + '\nstderr: ' + finResult.stderr);

    // After re-entry with the fix: archive must be committed, tree must be clean.
    const dirtyAfter = G.git(wtPath, ['status', '--porcelain'], { encoding: 'utf8' });
    assert(dirtyAfter.stdout.trim().length === 0,
      '#296 B1: working tree must be clean after finalize re-entry, got: ' + JSON.stringify(dirtyAfter.stdout));

    // Confirm the archive was committed (not just staged).
    const archiveRelPath = path.join('kaola-workflow', 'archive', project, 'workflow-state.md');
    const catFile = G.git(wtPath, ['cat-file', '-e', 'HEAD:' + archiveRelPath], { encoding: 'utf8' });
    assert(catFile.status === 0,
      '#296 B1: archive workflow-state.md must be in HEAD commit after re-entry');

    // Idempotency: resume must now return already_finalized.
    const resumeResult = JSON.parse(
      runNode(claimScript, ['resume', '--project', project], wtPath).stdout
    );
    assert(resumeResult.resumed === false,
      '#296 B1 idempotency: resumed must be false after re-entry commit, got: ' + JSON.stringify(resumeResult));
    assert(resumeResult.reason === 'already_finalized',
      '#296 B1 idempotency: reason must be already_finalized, got: ' + JSON.stringify(resumeResult));

    console.log('testFinalizeIncompleteWorktreeReentryFix: PASSED');
  } finally {
    try {
      G.git(tmp, ['worktree', 'remove', '--force', wtPath], { encoding: 'utf8' });
    } catch (_) {}
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ── #328 AC#14: bundle-lane E2E integration tests ─────────────────────────────
//
// Six scenarios drive the real claim/finalize/resume scripts end-to-end and guard
// the wired-together behavior across claimExplicitBundle → claimBundle → writeState
// → archiveProjectDir → cmdFinalize → runOrient.
//
// Strategy:
//   Happy-path bundle claim and finalize use KAOLA_GH_MOCK_SCRIPT (online mode, same
//   pattern as test-bundle-claim.js) so the classifier returns a definitive verdict
//   (not target_unverified) and label calls are interceptable.
//
//   Refusal / conflict / AC#1 scenarios are offline-safe: they rely on planted
//   active-folder state or over-cap arguments — both are pre-mutation validations
//   that never call gh.
//
// Isolation: every test gets its OWN mkdtempSync root + try/finally cleanup.
// The shared `tmp` used by testClaimStatusRelease/testFinalize is never touched.

// #328 scenario 1: explicit bundle claim creates exactly ONE active folder and the state
// file has the three additive bundle fields (issue_numbers, bundle_id, closure_policy).
// AC#2 + AC#3 E2E guard.
function testBundleClaimCreatesOneFolder() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-328-claim-')));
  const binDir = path.join(tmp, 'bin');
  const logFile = path.join(tmp, 'gh-calls.log');
  try {
    initGitRepo(tmp);
    seedClassifierVerdictFromBody(42, '');
    seedClassifierVerdictFromBody(47, '');
    seedClassifierVerdictFromBody(53, '');
    writeBundleGhMockScript(binDir, { logFile, openIssues: [42, 47, 53] });

    const result = spawnSync(process.execPath, [claimScript,
      'startup', '--target-issues', '42,47,53', '--workflow-path', 'adaptive'
    ], {
      cwd: tmp,
      encoding: 'utf8',
      timeout: 60000,
      env: Object.assign({}, process.env, {
        KAOLA_WORKFLOW_OFFLINE: '0',
        KAOLA_WORKTREE_NATIVE: '1',
        KAOLA_GH_MOCK_SCRIPT: path.join(binDir, 'gh.js'),
      })
    });

    assert(result.status === 0,
      '#328 claim: exit 0 expected, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    const lines = (result.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
    assert(lines.length > 0, '#328 claim: expected JSON output line');
    const out = JSON.parse(lines[lines.length - 1]);

    assert(out.claim === 'acquired', '#328 claim: claim must be acquired, got ' + JSON.stringify(out.claim));
    assert(out.bundle_id === 'bundle-42-47-53',
      '#328 claim: bundle_id must be bundle-42-47-53, got ' + JSON.stringify(out.bundle_id));
    assert(Array.isArray(out.issue_numbers) && out.issue_numbers.length === 3,
      '#328 claim: issue_numbers must be [42,47,53], got ' + JSON.stringify(out.issue_numbers));

    // ONE active folder
    const kwDir = path.join(tmp, 'kaola-workflow');
    const projects = fs.readdirSync(kwDir).filter(n => !n.startsWith('.') && n !== 'archive' && n !== 'ROADMAP.md');
    assert(projects.length === 1 && projects[0] === 'bundle-42-47-53',
      '#328 claim: exactly one active folder (bundle-42-47-53) expected, got ' + projects.join(','));

    // State file has all three additive fields
    const state = read(path.join(kwDir, 'bundle-42-47-53', 'workflow-state.md'));
    assert(/^issue_number:\s*42\s*$/m.test(state),
      '#328 claim: state must have issue_number: 42 (primary)');
    assert(/^issue_numbers:\s*42,47,53\s*$/m.test(state),
      '#328 claim: state must have issue_numbers: 42,47,53');
    assert(/^bundle_id:\s*bundle-42-47-53\s*$/m.test(state),
      '#328 claim: state must have bundle_id: bundle-42-47-53');
    assert(/^closure_policy:\s*all_or_nothing\s*$/m.test(state),
      '#328 claim: state must have closure_policy: all_or_nothing');
    assert(!/^closure_policy:/m.test(state.replace(/^closure_policy:\s*all_or_nothing\s*$/m, '')),
      '#328 claim: closure_policy must appear exactly once');
    assert(/^branch:\s*workflow\/bundle-42-47-53\s*$/m.test(state),
      '#328 claim: state must have branch: workflow/bundle-42-47-53');

    // Labels were applied for all three members
    const calls = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean) : [];
    const added = calls.filter(c => c.startsWith('label-added:'));
    assert(added.some(c => c === 'label-added:42'), '#328 claim: label added for member 42');
    assert(added.some(c => c === 'label-added:47'), '#328 claim: label added for member 47');
    assert(added.some(c => c === 'label-added:53'), '#328 claim: label added for member 53');

  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testBundleClaimCreatesOneFolder: PASSED');
}

// #328 scenario 2: a refused bundle claim (closed member #47) leaves NO active folder
// and NO lingering workflow:in-progress label.  Uses KAOLA_GH_MOCK_SCRIPT (online mode)
// so the closed-member detection path is exercised and label calls are interceptable.
// The refusal is pre-mutation (steps 1-4 validate before any mkdir/writeState/addLabel),
// so the gh log must have zero label-added entries.  AC#5 + AC#6 guard.
function testBundleRefusalLeavesNoFolder() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-328-refuse-')));
  const binDir = path.join(tmp, 'bin');
  const logFile = path.join(tmp, 'gh-calls.log');
  try {
    initGitRepo(tmp);
    seedClassifierVerdictFromBody(42, '');
    seedClassifierVerdictFromBody(47, '');
    seedClassifierVerdictFromBody(53, '');
    // Member #47 is closed; members 42 and 53 are open
    writeBundleGhMockScript(binDir, { logFile, openIssues: [42, 53], closedIssues: [47] });

    const result = spawnSync(process.execPath, [claimScript,
      'startup', '--target-issues', '42,47,53', '--workflow-path', 'adaptive'
    ], {
      cwd: tmp,
      encoding: 'utf8',
      timeout: 60000,
      env: Object.assign({}, process.env, {
        KAOLA_WORKFLOW_OFFLINE: '0',
        KAOLA_WORKTREE_NATIVE: '1',
        KAOLA_GH_MOCK_SCRIPT: path.join(binDir, 'gh.js'),
      })
    });

    assert(result.status === 1,
      '#328 refuse: exit 1 expected for closed member, got ' + result.status + '\nstdout: ' + result.stdout);
    const lines = (result.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
    assert(lines.length > 0, '#328 refuse: expected JSON output');
    const out = JSON.parse(lines[lines.length - 1]);

    assert(out.status === 'target_set_has_closed_issue',
      '#328 refuse: status must be target_set_has_closed_issue, got ' + JSON.stringify(out.status));
    assert(out.issue === 47,
      '#328 refuse: refused on issue 47, got ' + JSON.stringify(out.issue));

    // No bundle folder created (pre-mutation refusal)
    assert(!fs.existsSync(path.join(tmp, 'kaola-workflow', 'bundle-42-47-53')),
      '#328 refuse: no bundle-42-47-53 folder must exist after refusal');

    // No labels were applied (refusal happened before addBundleLabel step)
    const calls = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean) : [];
    const labelsAdded = calls.filter(c => c.startsWith('label-added:'));
    assert(labelsAdded.length === 0,
      '#328 refuse: no labels must be applied after pre-mutation refusal, got: ' + labelsAdded.join(', '));

  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testBundleRefusalLeavesNoFolder: PASSED');
}

// #328 scenario 3: a live bundle [42,47,53] blocks (a) a direct single-issue claim of member 47
// and (b) an overlapping bundle claim [47,77].  AC#8 duplicate-block guard.
function testBundleDuplicateIssueBlocking() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-328-dup-')));
  try {
    // Plant roadmap entries
    seedClassifierVerdictFromBody(47, '');
    seedClassifierVerdictFromBody(77, '');
    // Seed a live bundle project for [42,47,53]
    writeProject(tmp, 'bundle-42-47-53', {
      'workflow-state.md': [
        'name: bundle-42-47-53', 'status: active', 'phase: adaptive',
        'issue_number: 42', 'issue_numbers: 42,47,53',
        'bundle_id: bundle-42-47-53', 'closure_policy: all_or_nothing',
        'branch: workflow/bundle-42-47-53', 'sink: merge', ''
      ].join('\n')
    });

    // (a) Direct claim of member #47 must be blocked: activeByIssue(47) finds the live bundle
    // and returns verdict:'owned' with claim:'owned' (exit 0 / reuse path), not a fresh acquire.
    // The bundle is NOT re-provisioned; the caller gets back the existing bundle project.
    const r1 = runNode(claimScript,
      ['startup', '--target-issue', '47'],
      tmp);
    const o1 = JSON.parse(r1.stdout);
    // Two acceptable outcomes:
    //   (i)  claim:'owned' — bundle-aware reuse (exit 0): member 47 is in a live bundle
    //   (ii) claim:'none'  — typed refusal (exit 1): classifier returns blocked
    // In either case the live bundle project must not change and no NEW folder is created.
    assert(o1.claim === 'owned' || o1.claim === 'none',
      '#328 dup-block (a): claim must be owned or none for live bundle member 47, got ' + JSON.stringify(o1.claim));
    // Confirm the return refers to the live bundle project, not a new one
    if (o1.claim === 'owned') {
      assert(o1.project === 'bundle-42-47-53',
        '#328 dup-block (a): owned claim must resolve to bundle-42-47-53, got ' + JSON.stringify(o1.project));
    }

    // (b) Overlapping bundle claim [47,77] must also be blocked
    const r2 = runNode(claimScript,
      ['startup', '--target-issues', '47,77', '--workflow-path', 'adaptive'],
      tmp);
    assert(r2.status === 1,
      '#328 dup-block (b): overlapping bundle [47,77] must exit 1, got ' + r2.status + '\nstdout: ' + r2.stdout);
    const o2 = JSON.parse(r2.stdout);
    assert(o2.status === 'target_set_conflicts_active_work',
      '#328 dup-block (b): status must be target_set_conflicts_active_work, got ' + JSON.stringify(o2.status));

  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testBundleDuplicateIssueBlocking: PASSED');
}


// #328 scenario 5: finalize on a bundle project archives exactly ONE folder and the closure
// receipt has closed_issues + failed_issue_closures + issue_numbers for all three members.
// AC#11 + AC#13 E2E guard. ADR 0018 §5 retired this scenario's roadmap-cleanup half (AC#12: all
// member .roadmap/issue-N.md files removed, ROADMAP.md regenerated once) — see #328's other AC#11/
// AC#13 coverage below for what survives.
function testBundleFinalizeReceiptFields() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-328-finalize-')));
  const binDir = path.join(tmp, 'bin');
  const project = 'bundle-42-47-53';
  try {
    initGitRepo(tmp);
    // Bundle state file with all three members
    const stateLines = [
      '# Kaola-Workflow State', '',
      '## Project', 'name: ' + project, 'status: active', '',
      '## Current Position', 'phase: adaptive', 'workflow_path: adaptive',
      'step: start', 'next_command: /kaola-workflow-plan-run ' + project, '',
      '## Last Evidence', 'last_command: startup', 'last_result: folder_claimed', '',
      '## Last Updated', new Date().toISOString(), '',
      '## Sink', 'branch: workflow/' + project,
      'issue_number: 42',
      'issue_numbers: 42,47,53',
      'bundle_id: ' + project,
      'closure_policy: all_or_nothing',
      'sink: merge', 'run_posture: in-place', ''
    ].join('\n');
    writeProject(tmp, project, { 'workflow-state.md': stateLines });

    // Plant roadmap sources for all three members
    seedClassifierVerdictFromBody(42, '');
    seedClassifierVerdictFromBody(47, '');
    seedClassifierVerdictFromBody(53, '');

    // Write a ROADMAP.md mirror that references all three (so regenerate can clean it)
    const roadmapContent = [
      '# Kaola-Workflow Roadmap', '',
      '| Issue | Title | Status |',
      '|-------|-------|--------|',
      '| #42 | Test 42 | active |',
      '| #47 | Test 47 | active |',
      '| #53 | Test 53 | active |',
      ''
    ].join('\n');
    fs.writeFileSync(path.join(tmp, 'kaola-workflow', 'ROADMAP.md'), roadmapContent);

    // Mock gh: all three members are closed
    writeBundleGhMockScript(binDir, { closedIssues: [42, 47, 53] });

    // Seed the frozen adaptive plan + passing gate LAST (after every code-band write) so the
    // recorded candidate hash matches the tree finalize re-derives.
    seedAdaptiveFinalizeFixture(tmp, project);
    const result = spawnSync(process.execPath, [claimScript, 'finalize', '--project', project], {
      cwd: tmp,
      encoding: 'utf8',
      timeout: 60000,
      env: Object.assign({}, process.env, {
        KAOLA_WORKFLOW_OFFLINE: '0',
        KAOLA_WORKTREE_NATIVE: '0',
        KAOLA_GH_MOCK_SCRIPT: path.join(binDir, 'gh.js'),
      })
    });

    assert(result.status === 0,
      '#328 finalize: exit 0 expected, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);

    // Parse last JSON object from stdout
    const lines = (result.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
    assert(lines.length > 0, '#328 finalize: expected JSON output');
    const out = JSON.parse(lines[lines.length - 1]);

    assert(out.status === 'closed', '#328 finalize: status must be closed, got ' + JSON.stringify(out.status));
    // ADR 0018 §5: the receipt.roadmap_regenerated assertion and the "all three .roadmap sources
    // were removed" loop stood here — retired with archiveProjectDir's roadmap-source unlink and
    // mirror regenerate in slice 2. There is no local roadmap source or mirror left to remove or
    // regenerate.

    // ONE archive folder created; live bundle dir is gone
    const archiveDest = out.dest;
    assert(archiveDest && fs.existsSync(archiveDest),
      '#328 finalize: archive folder must exist at dest');
    assert(!fs.existsSync(path.join(tmp, 'kaola-workflow', project)),
      '#328 finalize: live project folder must be gone after finalize');

    // Bundle fields on closure_receipt
    const receipt = out.closure_receipt;
    assert(receipt != null, '#328 finalize: closure_receipt must be present');
    if (receipt) {
      // ADR 0018 §5: the receipt.roadmap_sources_removed array assertions stood here — retired
      // along with the field itself (kaola-workflow-closure-contract.js CLOSURE_RECEIPT_FIELDS).
      assert(Array.isArray(receipt.closed_issues),
        '#328 finalize: receipt must have closed_issues array');
      assert(Array.isArray(receipt.failed_issue_closures),
        '#328 finalize: receipt must have failed_issue_closures array');
      assert(receipt.failed_issue_closures.length === 0,
        '#328 finalize: failed_issue_closures must be empty when all probes succeed');
      assert(Array.isArray(receipt.issue_numbers) && receipt.issue_numbers.length === 3,
        '#328 finalize: receipt must have issue_numbers with 3 members');
    }

    // Closure invariants pass
    const inv = out.closure_invariants;
    assert(inv && inv.ok === true,
      '#328 finalize: closure_invariants must pass; violations: ' + JSON.stringify(inv && inv.violations));

  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testBundleFinalizeReceiptFields: PASSED');
}

// #328 AC#1 guard: a single-issue claim must NOT write issue_numbers, bundle_id, or
// closure_policy lines in workflow-state.md — the bundle fields are strictly additive and
// must not contaminate the single-issue path.
function testBundleSingleIssueStateHasNoBundleFields() {
  const tmp = adaptiveTmp('328-ac1');
  try {
    initGitRepo(tmp);
    seedClassifierVerdictFromBody(601, '');
    const out = JSON.parse(runNode(claimScript,
      ['startup', '--target-issue', '601'],
      tmp).stdout);
    assert(out.claim === 'acquired',
      '#328 AC#1: single-issue startup must acquire, got ' + JSON.stringify(out.claim));
    const state = read(statePath(tmp, 'issue-601'));
    assert(!/^issue_numbers:/m.test(state),
      '#328 AC#1: single-issue state must NOT contain issue_numbers line');
    assert(!/^bundle_id:/m.test(state),
      '#328 AC#1: single-issue state must NOT contain bundle_id line');
    assert(!/^closure_policy:/m.test(state),
      '#328 AC#1: single-issue state must NOT contain closure_policy line');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testBundleSingleIssueStateHasNoBundleFields: PASSED');
}



// ---------------------------------------------------------------------------
// #426: a malformed source without workflow-state.md is refused before any
// destructive archive step.  The pure copy-completeness behavior remains
// covered by testArchiveCompleteSourceRelative676 below; the stronger epoch
// authority preflight now necessarily wins first at this caller seam.
// ---------------------------------------------------------------------------
function testFinalizeArchiveVerifiesBeforeDelete() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-archive-verify-')));
  const kwRoot = tmp + '.kw';
  try {
    initGitRepo(tmp);
    // Create a linked worktree so archiveProjectDir takes the linked-run path
    // (isLinkedRun is true when mainRoot !== linkedRoot).
    const wtPath = path.join(kwRoot, 'issue-426v');
    fs.mkdirSync(kwRoot, { recursive: true });
    G.git(tmp, ['worktree', 'add', '-b', 'workflow/issue-426v', '--', wtPath, 'HEAD'], { encoding: 'utf8' });

    // Plant a project dir in the linked worktree that has NO workflow-state.md.
    // The archive must refuse it before copy/delete.
    const projDir = path.join(wtPath, 'kaola-workflow', 'issue-426v');
    fs.mkdirSync(projDir, { recursive: true });
    // Write a file that is NOT workflow-state.md (so copyDir has something to copy)
    fs.writeFileSync(path.join(projDir, 'some-phase-note.md'), 'partial archive test\n');

    // Call archiveProjectDir directly (it is exported from the script).
    const claim = require(claimScript);
    const result = claim.archiveProjectDir(wtPath, 'issue-426v', 'closed', undefined, {});

    // Key assertion: the source directory must still exist (not deleted before verify).
    assert(
      fs.existsSync(projDir),
      '#426 verify-before-delete: source dir must NOT be deleted when archive is incomplete, projDir: ' + projDir
    );
    assert(
      result.archive_incomplete === true,
      '#426 verify-before-delete: archiveProjectDir must return archive_incomplete:true, got: ' + JSON.stringify(result)
    );
    // The archive must NAME what is missing, not merely say "incomplete". This used to read the
    // epoch-authority preflight's `snapshot_error: state_missing`; that preflight went with the
    // epochs, and the surviving archive reports the absent file directly — same fact, one
    // indirection fewer.
    assert(
      Array.isArray(result.missing) && result.missing.includes('workflow-state.md'),
      '#426 verify-before-delete: the refusal must NAME the missing state file, got: ' + JSON.stringify(result)
    );
  } finally {
    try { G.git(tmp, ['worktree', 'remove', '--force', wtPath], { encoding: 'utf8' }); } catch (_) {}
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(kwRoot, { recursive: true, force: true });
  }
  console.log('testFinalizeArchiveVerifiesBeforeDelete: PASSED');
}

function testArchiveCompleteSourceRelative676() {
  // #676 SOURCE-RELATIVE archive-completeness (sibling to the #426 verify-before-delete test above).
  // verifyArchiveComplete(src, dest) must refuse when the archive DEST dropped an evidence file the
  // live SOURCE actually held (a lossy copy), pass a faithful copy, and pass a minimal state-only
  // source — with workflow-state.md kept as the unconditional archive-identity anchor. RED vs the
  // pre-fix fixed ['workflow-state.md'] floor: a copy dropping the frozen plan / finalization-summary
  // / a per-node .cache/n*-*.md gate-evidence file passed as complete and BOTH live copies were
  // deleted (the evidence-loss bug). copyDir is faithful, so a source-relative loss cannot be forced
  // end-to-end; Part A exercises the loss detection directly and Part B drives the refuse-before-
  // delete ordering end-to-end through the anchor path exactly as #426 does.
  const claim = require(claimScript);
  function seedProj676(dir, f) {
    fs.mkdirSync(dir, { recursive: true });
    if (f.state)   fs.writeFileSync(path.join(dir, 'workflow-state.md'), 'issue_number: 1\nphase: adaptive\n');
    if (f.plan)    fs.writeFileSync(path.join(dir, 'workflow-plan.md'), '<!-- plan_hash: ' + '0'.repeat(64) + ' -->\n');
    if (f.summary) fs.writeFileSync(path.join(dir, 'finalization-summary.md'), '# Finalization Summary\n');
    if (f.fast)    fs.writeFileSync(path.join(dir, 'fast-summary.md'), '# Fast Summary\n');
    if (f.nodes) {
      fs.mkdirSync(path.join(dir, '.cache'), { recursive: true });
      for (const n of f.nodes) fs.writeFileSync(path.join(dir, '.cache', n), 'evidence\n');
    }
  }

  // Part A — pure-function source-relative semantics (no git needed).
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-676-srcrel-')));
  try {
    // (1) faithful full-adaptive copy (plan+state+summary+node evidence) → PASS.
    const s1 = path.join(tmp, 's1'); seedProj676(s1, { state: 1, plan: 1, summary: 1, nodes: ['n1-fix.md'] });
    const d1 = path.join(tmp, 'd1'); seedProj676(d1, { state: 1, plan: 1, summary: 1, nodes: ['n1-fix.md'] });
    const v1 = claim.verifyArchiveComplete(s1, d1);
    assert(v1.ok === true && v1.missing.length === 0,
      '#676 src-rel: a faithful full-adaptive copy passes, got ' + JSON.stringify(v1));

    // (2) dest dropped finalization-summary.md the source held → REFUSE (the real bug vs the old floor).
    const d2 = path.join(tmp, 'd2'); seedProj676(d2, { state: 1, plan: 1, nodes: ['n1-fix.md'] });
    const v2 = claim.verifyArchiveComplete(s1, d2);
    assert(v2.ok === false && v2.missing.includes('finalization-summary.md'),
      '#676 src-rel: a dest dropping finalization-summary.md the source held must refuse, got ' + JSON.stringify(v2));

    // (3) dest dropped a per-node .cache gate-evidence file the source held → REFUSE.
    const s3 = path.join(tmp, 's3'); seedProj676(s3, { state: 1, plan: 1, summary: 1, nodes: ['n1-fix.md', 'n2-doc.md'] });
    const d3 = path.join(tmp, 'd3'); seedProj676(d3, { state: 1, plan: 1, summary: 1, nodes: ['n1-fix.md'] });
    const v3 = claim.verifyArchiveComplete(s3, d3);
    assert(v3.ok === false && v3.missing.includes(path.join('.cache', 'n2-doc.md')),
      '#676 src-rel: a dest dropping a per-node .cache evidence file must refuse, got ' + JSON.stringify(v3));

    // (4) dest dropped fast-summary.md a fast-run source held → REFUSE (fast is source-relative too).
    const s4 = path.join(tmp, 's4'); seedProj676(s4, { state: 1, fast: 1 });
    const d4 = path.join(tmp, 'd4'); seedProj676(d4, { state: 1 });
    const v4 = claim.verifyArchiveComplete(s4, d4);
    assert(v4.ok === false && v4.missing.includes('fast-summary.md'),
      '#676 src-rel: a dest dropping fast-summary.md the source held must refuse, got ' + JSON.stringify(v4));

    // (5) minimal source (only workflow-state.md), faithful dest → PASS (nothing else demanded → no breakage).
    const s5 = path.join(tmp, 's5'); seedProj676(s5, { state: 1 });
    const d5 = path.join(tmp, 'd5'); seedProj676(d5, { state: 1 });
    const v5 = claim.verifyArchiveComplete(s5, d5);
    assert(v5.ok === true && v5.missing.length === 0,
      '#676 src-rel: a minimal state-only source passes faithfully, got ' + JSON.stringify(v5));

    // (6) workflow-state.md is the unconditional archive-identity anchor: a malformed source lacking
    //     it still refuses when the dest lacks it (preserves the #426 verify-before-delete guarantee).
    const s6 = path.join(tmp, 's6'); seedProj676(s6, { plan: 1 });
    const d6 = path.join(tmp, 'd6'); seedProj676(d6, { plan: 1 });
    const v6 = claim.verifyArchiveComplete(s6, d6);
    assert(v6.ok === false && v6.missing.includes('workflow-state.md'),
      '#676 src-rel: workflow-state.md anchor is required even when the source lacks it, got ' + JSON.stringify(v6));

    // (8) DISCRIMINATING — FREE-FORM node-id gate evidence (design.md / review.md / finalize.md /
    //     t414.md), matching the shapes real archived runs actually produce. A node id is free-form
    //     [A-Za-z0-9_-]+, NOT n<digits>-<slug>, so the old name-shape glob MISSED every one of these:
    //     a dest dropping such a file returned {ok:true} and BOTH live copies were deleted. RED vs the
    //     narrow glob, GREEN once every .cache/*.md (minus machinery sidecars) is required.
    const s8 = path.join(tmp, 's8'); seedProj676(s8, { state: 1, plan: 1, summary: 1, nodes: ['design.md', 'review.md', 'finalize.md', 't414.md'] });
    const d8 = path.join(tmp, 'd8'); seedProj676(d8, { state: 1, plan: 1, summary: 1, nodes: ['design.md', 'finalize.md', 't414.md'] }); // drops review.md
    const v8 = claim.verifyArchiveComplete(s8, d8);
    assert(v8.ok === false && v8.missing.includes(path.join('.cache', 'review.md')),
      '#676 src-rel: a dest dropping a FREE-FORM node-id evidence file (review.md) must refuse, got ' + JSON.stringify(v8));

    // (9) FAITHFUL full copy with free-form + role-named node evidence → PASS (proves no false-refuse:
    //     copyDir is recursive, so a genuine archive carries every one).
    const s9 = path.join(tmp, 's9'); seedProj676(s9, { state: 1, plan: 1, summary: 1, nodes: ['planner.md', 'code-reviewer.md', 'security-reviewer.md', 'n1.md', 'parity-anchor.md'] });
    const d9 = path.join(tmp, 'd9'); seedProj676(d9, { state: 1, plan: 1, summary: 1, nodes: ['planner.md', 'code-reviewer.md', 'security-reviewer.md', 'n1.md', 'parity-anchor.md'] });
    const v9 = claim.verifyArchiveComplete(s9, d9);
    assert(v9.ok === true && v9.missing.length === 0,
      '#676 src-rel: a faithful copy with free-form/role-named node evidence must pass (no false-refuse), got ' + JSON.stringify(v9));

    // (10) SIDECAR denylist — a dropped fixed-name finalize/machinery sub-step artifact (not per-node
    //      gate evidence) must NOT refuse, so the gate stays scoped to genuine evidence loss.
    const s10 = path.join(tmp, 's10'); seedProj676(s10, { state: 1, plan: 1, nodes: ['design.md'] });
    fs.writeFileSync(path.join(s10, '.cache', 'final-validation.md'), 'verdict: pass\n');
    fs.writeFileSync(path.join(s10, '.cache', 'doc-updater.md'), 'no docs\n');
    const d10 = path.join(tmp, 'd10'); seedProj676(d10, { state: 1, plan: 1, nodes: ['design.md'] }); // drops both sidecars, keeps design.md
    const v10 = claim.verifyArchiveComplete(s10, d10);
    assert(v10.ok === true && v10.missing.length === 0,
      '#676 src-rel: dropping a fixed-name machinery sidecar (final-validation.md / doc-updater.md) must NOT refuse, got ' + JSON.stringify(v10));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  // Part B — END-TO-END refuse + SURVIVE via a linked worktree (extends the #426 pattern): a linked-
  // run archive whose completeness gate refuses leaves BOTH live copies in place. The anchor path (a
  // state-less source) drives the identical verify-before-delete ordering a source-relative loss takes.
  const gtmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-676-e2e-')));
  const gkwRoot = gtmp + '.kw';
  let wtPath;
  try {
    initGitRepo(gtmp);
    fs.mkdirSync(gkwRoot, { recursive: true });
    wtPath = path.join(gkwRoot, 'issue-676e');
    G.git(gtmp, ['worktree', 'add', '-b', 'workflow/issue-676e', '--', wtPath, 'HEAD'], { encoding: 'utf8' });
    const badProj = path.join(wtPath, 'kaola-workflow', 'issue-676bad');
    seedProj676(badProj, { plan: 1 }); // no workflow-state.md → anchor refuses
    const r7 = claim.archiveProjectDir(wtPath, 'issue-676bad', 'closed', undefined, {});
    assert(r7 && r7.archive_incomplete === true && Array.isArray(r7.missing) && r7.missing.includes('workflow-state.md'),
      '#676 src-rel e2e: a state-less linked-run source must refuse, NAMING the missing state file, got ' + JSON.stringify(r7));
    assert(fs.existsSync(badProj),
      '#676 src-rel e2e: the live source folder must SURVIVE an incomplete archive (verify runs before delete)');
  } finally {
    try { if (wtPath) G.git(gtmp, ['worktree', 'remove', '--force', wtPath], { encoding: 'utf8' }); } catch (_) {}
    fs.rmSync(gtmp, { recursive: true, force: true });
    fs.rmSync(gkwRoot, { recursive: true, force: true });
  }
  console.log('testArchiveCompleteSourceRelative676: PASSED');
}

// ---------------------------------------------------------------------------
// #427: cmdFinalize on a bundle project in offline mode emits
// closure_receipt.closure.skipped_offline containing all member issue numbers,
// closure.closed is empty (no online close possible), and status is 'closed'.
// ---------------------------------------------------------------------------
function testFinalizeClosesIssueBundleMembers() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-427-closure-')));
  const project = 'bundle-42-47';
  try {
    initGitRepo(tmp);
    const stateLines = [
      '# Kaola-Workflow State', '',
      '## Project', 'name: ' + project, 'status: active', '',
      '## Current Position', 'phase: adaptive', 'workflow_path: adaptive',
      'step: start', 'next_command: /kaola-workflow-plan-run ' + project, '',
      '## Last Evidence', 'last_command: startup', 'last_result: folder_claimed', '',
      '## Last Updated', new Date().toISOString(), '',
      '## Sink', 'branch: workflow/' + project,
      'issue_number: 42',
      'issue_numbers: 42,47',
      'bundle_id: ' + project,
      'closure_policy: all_or_nothing',
      'sink: merge', 'run_posture: in-place', ''
    ].join('\n');
    writeProject(tmp, project, { 'workflow-state.md': stateLines });
    seedAdaptiveFinalizeFixture(tmp, project);
    seedClassifierVerdictFromBody(42, '');
    seedClassifierVerdictFromBody(47, '');

    // Run finalize OFFLINE — issue closing is skipped, skipped_offline records the bundle members.
    const result = spawnSync(process.execPath, [claimScript, 'finalize', '--project', project], {
      cwd: tmp,
      encoding: 'utf8',
      timeout: 60000,
      env: Object.assign({}, process.env, {
        KAOLA_WORKFLOW_OFFLINE: '1',
        KAOLA_WORKTREE_NATIVE: '0',
      })
    });

    assert(result.status === 0,
      '#427 offline bundle close: exit 0 expected, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);

    const lines = (result.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
    assert(lines.length > 0, '#427 offline bundle close: expected JSON output');
    const out = JSON.parse(lines[lines.length - 1]);

    assert(out.status === 'closed',
      '#427 offline bundle close: status must be closed, got ' + JSON.stringify(out.status));

    const receipt = out.closure_receipt;
    assert(receipt != null, '#427 offline bundle close: closure_receipt must be present');

    // #427: the structured closure roll-up must be on the receipt.
    const closure = receipt && receipt.closure;
    assert(closure != null, '#427 offline bundle close: closure_receipt.closure must be present');
    assert(
      Array.isArray(closure.skipped_offline) && closure.skipped_offline.length === 2,
      '#427 offline bundle close: closure.skipped_offline must have 2 members (offline), got: ' + JSON.stringify(closure.skipped_offline)
    );
    assert(
      closure.skipped_offline.includes(42) && closure.skipped_offline.includes(47),
      '#427 offline bundle close: closure.skipped_offline must include 42 and 47, got: ' + JSON.stringify(closure.skipped_offline)
    );
    assert(
      Array.isArray(closure.closed) && closure.closed.length === 0,
      '#427 offline bundle close: closure.closed must be empty in offline mode, got: ' + JSON.stringify(closure.closed)
    );

  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testFinalizeClosesIssueBundleMembers: PASSED');
}

// testFinalizeRoadmapResidueDetection stood here — #428's reconcileRoadmapForClosure dual-root
// roadmap_removed_by_root / roadmap_residue / roadmap_source_removed receipt fields, entirely
// retired with reconcileRoadmapForClosure in slice 2 of ADR 0018 §5. Deleted with the mechanism.



// ---------------------------------------------------------------------------
// #579: two-lanes-in-one-checkout — parked lane selectivity
// Verifies that parsePorcelainPaths + isParkedLanePath correctly classify
// co-tenant lane files as parked (ignored by the clean-check) while real
// uncommitted code and shared durable state remain strict (not ignored).
//
// This is the production code path exercised at claim-time (treeDirty) and
// sink-merge (assertCleanWorktree/assertWorktreeClean). The test uses a real
// git repo + real git-status output so the filter runs against actual porcelain.
// ---------------------------------------------------------------------------
function testTwoLanesInOneCheckout579() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-579-twolanes-')));
  const env = { ...process.env, ...GIT_ISOLATION_ENV };
  try {
    initGitRepo(tmp);

    // Commit shared repo infrastructure so that partially-tracked directories exist:
    // 1. .gitignore ignoring .kw/ (mirrors the real repo — .kw/ is never in git status).
    // 2. A shared kaola-workflow file so kaola-workflow/ is PARTIALLY tracked: this makes
    //    lane A's untracked sub-dir appear as `?? kaola-workflow/issue-A/` in git status
    //    (not `?? kaola-workflow/` which would be the whole-dir entry if nothing is tracked).
    fs.writeFileSync(path.join(tmp, '.gitignore'), '.kw/\n');
    fs.mkdirSync(path.join(tmp, 'kaola-workflow', '.roadmap'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'kaola-workflow', 'ROADMAP.md'), '# Roadmap\n');
    G.git(tmp, ['add', '.gitignore', 'kaola-workflow/ROADMAP.md'], { encoding: 'utf8', env });
    G.git(tmp, ['commit', '-m', 'chore: seed shared roadmap + gitignore'], { encoding: 'utf8', env });

    // Set up lane A: untracked kaola-workflow files + .kw/worktrees dir (gitignored)
    fs.mkdirSync(path.join(tmp, 'kaola-workflow', 'issue-A'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'kaola-workflow', 'issue-A', 'workflow-state.md'), 'status: active\n');
    fs.mkdirSync(path.join(tmp, '.kw', 'worktrees', 'issue-A'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.kw', 'worktrees', 'issue-A', 'DUMMY'), 'dummy\n');

    // Also plant a real uncommitted file (must NOT be filtered)
    fs.writeFileSync(path.join(tmp, 'src-real.js'), 'real code change\n');

    // Get git status --porcelain (with untracked files, as treeDirty uses)
    const statusRaw = G.git(tmp, ['status', '--porcelain'], { encoding: 'utf8' }).stdout;
    assert(statusRaw.length > 0, '#579 two-lanes: git status shows output');

    // Import the parked-lane filter from adaptive-schema (the production code path)
    const adaptiveSchema = require(path.join(repoRoot, 'scripts', 'kaola-workflow-adaptive-schema.js'));
    const { parsePorcelainPaths, isParkedLanePath } = adaptiveSchema;
    assert(typeof parsePorcelainPaths === 'function',
      '#579 two-lanes: parsePorcelainPaths exported from adaptive-schema');
    assert(typeof isParkedLanePath === 'function',
      '#579 two-lanes: isParkedLanePath exported from adaptive-schema');

    // Apply the filter as treeDirty(root, ownedProjects=['issue-B']) would
    const ownedProjects = ['issue-B'];
    const allPaths = parsePorcelainPaths(statusRaw);
    const nonIgnored = allPaths.filter(p => !isParkedLanePath(p, ownedProjects));

    // Lane A's kaola-workflow files are parked — filtered out
    const laneAKw = allPaths.filter(p => p.includes('issue-A'));
    assert(laneAKw.length > 0, '#579 two-lanes: lane A kaola-workflow files appear in raw git status');
    assert(!nonIgnored.some(p => p.includes('issue-A')),
      '#579 two-lanes: lane A kaola-workflow/* ignored by parked filter, nonIgnored=' + JSON.stringify(nonIgnored));

    // .kw/ is gitignored in the real repo (.gitignore above) → does NOT appear in git status.
    // Verify: .kw/worktrees/issue-A should NOT be in the raw git status (gitignored).
    assert(!allPaths.some(p => p.startsWith('.kw/')),
      '#579 two-lanes: .kw/* is gitignored and must not appear in git status, got ' + JSON.stringify(allPaths));

    // Real uncommitted code is NOT filtered
    assert(nonIgnored.some(p => p.includes('src-real.js')),
      '#579 two-lanes: real uncommitted code NOT ignored, nonIgnored=' + JSON.stringify(nonIgnored));

    // Shared durable state (.roadmap issue file) stays strict — NOT filtered
    // .roadmap/ dir is already tracked (from the seed commit above), so a new issue file
    // appears as an individual untracked entry `?? kaola-workflow/.roadmap/issue-99.md`.
    fs.writeFileSync(path.join(tmp, 'kaola-workflow', '.roadmap', 'issue-99.md'), 'test\n');
    const statusRaw2 = G.git(tmp, ['status', '--porcelain'], { encoding: 'utf8' }).stdout;
    const allPaths2 = parsePorcelainPaths(statusRaw2);
    const nonIgnored2 = allPaths2.filter(p => !isParkedLanePath(p, ownedProjects));
    assert(nonIgnored2.some(p => p.includes('.roadmap')),
      '#579 two-lanes: shared .roadmap NOT ignored (strict)');

    // Own project (issue-B) NOT filtered — must show up as dirty
    fs.mkdirSync(path.join(tmp, 'kaola-workflow', 'issue-B'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'kaola-workflow', 'issue-B', 'workflow-state.md'), 'status: active\n');
    const statusRaw3 = G.git(tmp, ['status', '--porcelain'], { encoding: 'utf8' }).stdout;
    const allPaths3 = parsePorcelainPaths(statusRaw3);
    const nonIgnored3 = allPaths3.filter(p => !isParkedLanePath(p, ['issue-B']));
    assert(nonIgnored3.some(p => p.includes('issue-B')),
      '#579 two-lanes: own project NOT ignored');

    console.log('testTwoLanesInOneCheckout579: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}







// ── #767 SPINE authoring + orchestration keystone ──────────────────────────────────────────────
// The keystone that makes progressive elaboration user-reachable end to end. The spine/expansion
// machinery (#758/#759) is proven at the script level, but until #767 nothing AUTHORED a spine plan
// (the planner prose) and nothing told the orchestrator to DRIVE the expansion lifecycle (the
// plan-run routing prose). This pins BOTH new ends against the real CLIs, over a spine plan authored
// EXACTLY as the PART A planner prose instructs (plan_form: spine; one expansion-point + its
// expansion() contract; a CONCRETE code-reviewer wall post-dominating the point; a finalize sink):
//   (1) it FREEZES in-grammar through the production validator freeze CLI; and
//   (2) it MECHANICALLY EXECUTES the whole lifecycle the PART B routing prose instructs — orient
//       surfaces expansionPending.readyToExpand, expand-open composes+opens a frontier, the units
//       close, a composed gate role is refused by name (route the review to the wall), expand-close
//       discharges, and the spine advances through the concrete wall to the finalize sink (allDone).
const SPINE_PLAN_767 = [
  '# Workflow Plan — issue #767', '',
  '## Meta', '',
  'project: issue-767',
  'labels: enhancement',
  'plan_schema_version: 2',
  'plan_form: spine',
  'validation_command: node scripts/simulate-workflow-walkthrough.js',
  'validation_timeout_minutes: 20',
  'code_certifier: wall',
  'security_certifier: none',
  'inherited_frontier_digest: none',
  'inherited_frontier_classes: none', '',
  'expansion(m1):',
  '  milestone_goal: land the reader seam whose interior writers depend on the probe findings',
  '  expected_surfaces: scripts/, docs/',
  '  join_constraints: none',
  '  review_class: code-reviewer', '',
  '## Nodes', '',
  '| id | role | depends_on | declared_write_set | cardinality | shape | gate_claim | gate_surface | gate_aggregation | certifies |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  '| probe | code-explorer | — | — | 1 | sequence | — | — | — | — |',
  '| m1 | expansion-point | probe | — | 1 | sequence | — | — | — | — |',
  '| wall | code-reviewer | m1 | — | 1 | sequence | the milestone lands its goal with no unreviewed surface | the accumulated candidate | sequence | — |',
  '| done | finalize | wall | — | 1 | sequence | — | — | — | — |', '',
  '## Design', '',
  'Decompose: probe explores; m1 is a milestone whose interior frontier is composed at open time (its writers cannot be proven at freeze); wall reviews the composed frontier; done sinks. sequence edges are gate/data dependencies (S1). Done: the milestone lands its goal reviewed and validation passes.', '',
  '## Acceptance', '', 'A1: the declared write set lands the change the plan was frozen for.', 'A2: the recorded validation passes over the candidate.', '',
  '## Node Ledger', '',
  '| id | status |',
  '|---|---|',
  '| probe | complete |',
  '| m1 | pending |',
  '| wall | pending |',
  '| done | pending |', '',
].join('\n');



main().catch(err => {
  console.error(err && err.stack ? err.stack : String(err));
  // Print tail of stdout/stderr from child-process errors (execFileSync/spawnSync attach them).
  if (err && err.stdout) {
    const lines = String(err.stdout).split('\n');
    console.error('--- child stdout (last 30 lines) ---');
    console.error(lines.slice(-30).join('\n'));
  }
  if (err && err.stderr) {
    const lines = String(err.stderr).split('\n');
    console.error('--- child stderr (last 30 lines) ---');
    console.error(lines.slice(-30).join('\n'));
  }
  process.exitCode = 1;
}).finally(() => { spawnCensus.report(); });
