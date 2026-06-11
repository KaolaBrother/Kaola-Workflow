#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync, execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const claimScript = path.join(repoRoot, 'scripts', 'kaola-workflow-claim.js');
const repairScript = path.join(repoRoot, 'scripts', 'kaola-workflow-repair-state.js');
const roadmapScript = path.join(repoRoot, 'scripts', 'kaola-workflow-roadmap.js');
const sinkMergeScript = path.join(repoRoot, 'scripts', 'kaola-workflow-sink-merge.js');
const sinkPrScript = path.join(repoRoot, 'scripts', 'kaola-workflow-sink-pr.js');
const activeFoldersScript = path.join(repoRoot, 'scripts', 'kaola-workflow-active-folders.js');
const closureAuditScript = path.join(repoRoot, 'scripts', 'kaola-workflow-closure-audit.js');
const planValidatorScript = path.join(repoRoot, 'scripts', 'kaola-workflow-plan-validator.js'); // issue #227
const nextActionScript = path.join(repoRoot, 'scripts', 'kaola-workflow-next-action.js'); // issue #267
const handoffScript = path.join(repoRoot, 'scripts', 'kaola-workflow-adaptive-handoff.js'); // issue #255
const adaptiveNodeScript = path.join(repoRoot, 'scripts', 'kaola-workflow-adaptive-node.js'); // issue #272 / #328
const hookScript = path.join(repoRoot, 'hooks', 'kaola-workflow-pre-commit.sh');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runNode(script, args, cwd, extraEnv, opts) {
  // Scrub inherited KAOLA_* vars from the parent shell — tests supply their own.
  const baseEnv = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('KAOLA_'))
  );
  // Git isolation: prevent developer gpgsign/hooksPath from breaking fixture commits.
  baseEnv.GIT_CONFIG_GLOBAL = '/dev/null';
  baseEnv.GIT_CONFIG_NOSYSTEM = '1';
  const timeout = (opts && opts.timeout != null) ? opts.timeout : 120000;
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: 'utf8',
    timeout,
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

function testClaimStatusRelease(tmp) {
  plantRoadmapIssue(tmp, 63, '');
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
  plantRoadmapIssue(tmp, 164, '');
  json(runNode(claimScript, ['startup', '--target-issue', '164', '--runtime', 'claude'], tmp));
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
  // #324 AC3: seed a false-absolute validation claim in the cache evidence.
  fs.mkdirSync(path.join(tmp, 'kaola-workflow', 'issue-164', '.cache'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'kaola-workflow', 'issue-164', '.cache', 'final-validation.md'),
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
  // #324: closure normalization of the pre-run blocks writeState seeded at startup.
  assert(!/## Pending Gates\n[\s\S]*?(?:phase1-research|workflow-plan|fast-summary)/.test(archivedState),
    '#324: archived state Pending Gates must not retain a pre-run gate after closure, got: ' + archivedState);
  assert(archivedState.includes('- none'), '#324: Pending Gates normalized to "- none" at closure');
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

// #333: a keep-open partial-close archive must be terminal+truthful. An adaptive run whose
// ledger is all-complete and whose plan was re-frozen (state holds the claim-time plan_hash,
// the plan file holds the later one) is archived through `finalize --keep-open`; the archived
// state must read closed/complete, gates - none, last_result: closed_keep_open, refresh the
// plan_hash from the FINAL plan file, refresh ## Last Updated, neutralize next_command, and
// carry a ## Closure block with issue_disposition: kept-open.
function testKeepOpenArchiveStamp() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-keepopen-')));
  try {
    const STALE_HASH = 'a'.repeat(64);
    const FINAL_HASH = 'b'.repeat(64);
    const STALE_UPDATED = '2020-01-01T00:00:00.000Z';
    const dir = path.join(tmp, 'kaola-workflow', 'issue-333');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'workflow-state.md'), [
      '# Kaola-Workflow State', '',
      '## Project', 'name: issue-333', 'status: active', '',
      '## Current Position',
      'phase: adaptive', 'workflow_path: adaptive', 'step: start',
      'next_command: /kaola-workflow-plan-run issue-333',
      'next_skill: kaola-workflow-plan-run issue-333', '',
      '## Pending Gates', '- workflow-plan', '',
      '## Planning Evidence',
      'plan_hash: ' + STALE_HASH,
      'decision: ask', '',
      '## Last Evidence',
      'last_command: startup', 'last_result: folder_claimed', '',
      '## Last Updated', STALE_UPDATED, '',
      '## Sink', 'branch: workflow/issue-333', 'issue_number: 333', 'sink: merge', ''
    ].join('\n'));
    // workflow-plan.md whose ledger rows are all complete + a re-frozen plan_hash comment.
    fs.writeFileSync(path.join(dir, 'workflow-plan.md'), [
      '<!-- plan_hash: ' + FINAL_HASH + ' -->', '',
      '# Workflow Plan', '',
      '## Node Ledger', '', '| id | status |', '|---|---|',
      '| n1 | complete |', '| n2 | complete |', ''
    ].join('\n'));
    plantRoadmapIssue(tmp, 333, '');

    const result = json(runNode(claimScript, ['finalize', '--project', 'issue-333', '--keep-open'], tmp));
    assert(result.status === 'closed', '#333: keep-open finalize should report closed');
    assert(result.issue_disposition === 'kept-open',
      '#333: JSON output issue_disposition must be kept-open, got: ' + JSON.stringify(result.issue_disposition));
    const archived = fs.readdirSync(path.join(tmp, 'kaola-workflow', 'archive')).filter(n => n.startsWith('issue-333'));
    assert(archived.length === 1, '#333: keep-open finalize should archive folder');
    const st = read(path.join(tmp, 'kaola-workflow', 'archive', archived[0], 'workflow-state.md'));
    assert(st.includes('status: closed'), '#333: keep-open archived state must be closed');
    assert(st.includes('step: complete'), '#333: keep-open archived state must be complete');
    assert(st.includes('- none'), '#333: keep-open archived Pending Gates normalized to "- none"');
    assert(st.includes('last_result: closed_keep_open'),
      '#333: keep-open archived last_result must be closed_keep_open, got: ' + st);
    assert(!/next_command:.*kaola-workflow-plan-run/.test(st),
      '#333: keep-open archived next_command must not advertise plan-run, got: ' + st);
    assert(st.includes('next_command: none (archived)'),
      '#333: keep-open archived next_command must be neutralized');
    assert(st.includes('plan_hash: ' + FINAL_HASH),
      '#333: keep-open archived plan_hash must be refreshed from the final plan file, got: ' + st);
    assert(!st.includes('plan_hash: ' + STALE_HASH),
      '#333: keep-open archived plan_hash must not keep the stale claim-time hash');
    assert(!st.includes(STALE_UPDATED),
      '#333: keep-open archived ## Last Updated must be refreshed, got: ' + st);
    assert(/^## Closure$/m.test(st), '#333: keep-open archived state must carry a ## Closure block');
    assert(st.includes('issue_disposition: kept-open'),
      '#333: keep-open archived ## Closure must record issue_disposition: kept-open');
    // #336: keep-open now PRESERVES the roadmap source (was removed in #333) + records the decision tokens.
    assert(fs.existsSync(path.join(tmp, 'kaola-workflow', '.roadmap', 'issue-333.md')),
      '#336: keep-open finalize must PRESERVE kaola-workflow/.roadmap/issue-333.md, not unlink it');
    assert(result.roadmap_source_removed === 'kept',
      '#336: keep-open JSON roadmap_source_removed must be kept, got: ' + JSON.stringify(result.roadmap_source_removed));
    assert(result.closure_receipt && result.closure_receipt.remote_issue_closed === 'kept_open',
      '#336: keep-open receipt remote_issue_closed must be kept_open, got: ' + JSON.stringify(result.closure_receipt && result.closure_receipt.remote_issue_closed));
    assert(result.closure_receipt.roadmap_source_removed === 'kept',
      '#336: keep-open receipt roadmap_source_removed must be kept, got: ' + JSON.stringify(result.closure_receipt.roadmap_source_removed));
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
// keeps status: active forever. Re-running finalize over it must heal the archived state in
// place (archive_state_stamped: repaired), and be idempotent (exactly one ## Closure block).
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
      '## Pending Gates', '- workflow-plan', '',
      '## Last Evidence', 'last_command: startup', 'last_result: folder_claimed', '',
      '## Last Updated', '2020-01-01T00:00:00.000Z', '',
      '## Sink', 'branch: workflow/issue-210', 'issue_number: 210', 'sink: merge', ''
    ].join('\n'));
    // Manual archive: bypass archiveProjectDir entirely.
    const archiveDest = path.join(tmp, 'kaola-workflow', 'archive', 'issue-210');
    fs.mkdirSync(path.join(tmp, 'kaola-workflow', 'archive'), { recursive: true });
    fs.renameSync(dir, archiveDest);

    const result = json(runNode(claimScript, ['finalize', '--project', 'issue-210'], tmp));
    assert(result.status === 'closed', '#333: backstop finalize should exit 0/report closed');
    assert(result.archive_state_stamped === 'repaired',
      '#333: backstop must report archive_state_stamped: repaired, got: ' + JSON.stringify(result.archive_state_stamped));
    const st1 = read(path.join(archiveDest, 'workflow-state.md'));
    assert(st1.includes('status: closed'), '#333: backstop must stamp manual archive status: closed, got: ' + st1);
    assert(st1.includes('step: complete'), '#333: backstop must stamp manual archive step: complete');
    assert(!/next_command:.*kaola-workflow-plan-run/.test(st1),
      '#333: backstop must neutralize the manual archive next_command');
    assert(/^## Closure$/m.test(st1), '#333: backstop must append a ## Closure block');

    // Idempotency: a second finalize over the now-terminal archive must not re-stamp and must
    // leave exactly one ## Closure block.
    const result2 = json(runNode(claimScript, ['finalize', '--project', 'issue-210'], tmp));
    assert(result2.archive_state_stamped === 'not_needed',
      '#333: second backstop run must report not_needed (already terminal), got: ' + JSON.stringify(result2.archive_state_stamped));
    const st2 = read(path.join(archiveDest, 'workflow-state.md'));
    const closureCount = (st2.match(/^## Closure$/mg) || []).length;
    assert(closureCount === 1, '#333: backstop must be idempotent — exactly one ## Closure block, got: ' + closureCount);
    console.log('testManualArchiveBackstop: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testRepair(tmp) {
  writeProject(tmp, 'repair-demo', {
    'phase1-research.md': [
      '# Phase 1 - Research: repair-demo',
      '',
      '## Required Agent Compliance',
      '| Requirement | Status | Evidence | Skip Reason |',
      '|-------------|--------|----------|-------------|',
      '| code-explorer | invoked | .cache/code-explorer.md | |',
      ''
    ].join('\n')
  });
  const result = runNode(repairScript, ['repair-demo'], tmp);
  assert(result.status === 0, 'repair should exit 0');
  const state = read(statePath(tmp, 'repair-demo'));
  assert(state.includes('next_command: /kaola-workflow-phase2 repair-demo'), 'repair should route to phase 2');
  assert(!state.includes('## ' + 'Lease'), 'repair should not preserve or write retired ownership blocks');
}

function testRepairFastPath(tmp) {
  // issue #199: repair-state must understand `phase: fast` / `workflow_path: fast`.
  // Preserve: an intact fast workflow-state must be recognized as valid and kept,
  // not discarded as an invalid numbered phase and rebuilt.
  writeProject(tmp, 'fast-preserve', {
    'workflow-state.md': [
      '# Kaola-Workflow State',
      '',
      '## Project',
      'name: fast-preserve',
      'status: active',
      '',
      '## Current Position',
      'phase: fast',
      'phase_name: Fast',
      'workflow_path: fast',
      'next_command: /kaola-workflow-fast fast-preserve',
      'next_skill: kaola-workflow-fast fast-preserve',
      ''
    ].join('\n'),
    'fast-summary.md': '# Fast Summary: fast-preserve\n\n## Status\nPASSED\n'
  });
  const preserve = runNode(repairScript, ['fast-preserve'], tmp);
  assert(preserve.status === 0, 'repair should exit 0 for valid fast state');
  assert(preserve.stdout.includes('existing state valid'), 'intact fast state should be reported valid, not reconstructed');
  const preserved = read(statePath(tmp, 'fast-preserve'));
  assert(preserved.includes('phase: fast'), 'repair must not clobber intact fast state');
  assert(preserved.includes('next_skill: kaola-workflow-fast fast-preserve'), 'fast next_skill must be preserved');

  // Reconstruct: when workflow-state.md is lost but fast-summary.md survives, the
  // fast project must be rebuilt (phase: fast, workflow_path: fast) and routed to
  // the fast skill — not restarted at research.
  writeProject(tmp, 'fast-recon', {
    'fast-summary.md': '# Fast Summary: fast-recon\n\n## Status\nPASSED\n'
  });
  const recon = runNode(repairScript, ['fast-recon'], tmp);
  assert(recon.status === 0, 'repair should exit 0 when reconstructing from fast-summary.md');
  const reconState = read(statePath(tmp, 'fast-recon'));
  assert(reconState.includes('phase: fast'), 'reconstructed fast state must record phase: fast');
  assert(reconState.includes('workflow_path: fast'), 'reconstructed fast state must record workflow_path: fast so Phase 6 stays on the fast path');
  assert(reconState.includes('next_skill: kaola-workflow-fast fast-recon'), 'reconstructed fast state must route to the fast skill');
}

function testRepairFastEscalation(tmp) {
  // issue #222: repair-state must route an ESCALATED fast project to Phase 1 (full
  // workflow), not back to the fast skill which would ENOENT on phase1-research.md.

  // --- Assertion 1: ESCALATED fast → full/Phase1 ---
  writeProject(tmp, 'fast-escalated', {
    'workflow-state.md': [
      '# Kaola-Workflow State',
      '',
      '## Project',
      'name: fast-escalated',
      'status: active',
      '',
      '## Current Position',
      'phase: fast',
      'phase_name: Fast',
      'workflow_path: fast',
      'next_command: /kaola-workflow-fast fast-escalated',
      'next_skill: kaola-workflow-fast fast-escalated',
      '',
      '## Sink',
      'branch: workflow/fast-escalated',
      'sink: pr',
      ''
    ].join('\n'),
    'fast-summary.md': '# Fast Summary: fast-escalated\n\n## Status\nESCALATED\n\n## Escalation\nescalated_to_full: approach_ambiguity — multiple viable approaches\n'
  });
  const escalated = runNode(repairScript, ['fast-escalated'], tmp);
  assert(escalated.status === 0, 'repair should exit 0 for ESCALATED fast project, got: ' + escalated.status + ' stderr: ' + escalated.stderr);
  const escalatedState = read(statePath(tmp, 'fast-escalated'));
  assert(escalatedState.includes('workflow_path: full'), 'ESCALATED fast project must be rewritten to workflow_path: full');
  assert(escalatedState.includes('next_command: /kaola-workflow-phase1 fast-escalated'), 'ESCALATED fast project must route to /kaola-workflow-phase1');
  assert(escalatedState.includes('next_skill: kaola-workflow-research fast-escalated'), 'ESCALATED fast project must set next_skill to kaola-workflow-research');
  assert(!escalatedState.includes('workflow_path: fast'), 'rewritten state must not retain workflow_path: fast');
  assert(!escalatedState.includes('next_command: /kaola-workflow-fast'), 'rewritten state must not retain /kaola-workflow-fast command');

  // --- Assertion 2 (negative control): non-ESCALATED fast → stays on /kaola-workflow-fast ---
  writeProject(tmp, 'fast-inprogress', {
    'fast-summary.md': '# Fast Summary: fast-inprogress\n\n## Status\nIN_PROGRESS\n'
  });
  const inProgress = runNode(repairScript, ['fast-inprogress'], tmp);
  assert(inProgress.status === 0, 'repair should exit 0 for IN_PROGRESS fast project');
  const inProgressState = read(statePath(tmp, 'fast-inprogress'));
  assert(inProgressState.includes('next_command: /kaola-workflow-fast fast-inprogress'), 'IN_PROGRESS fast project must still route to /kaola-workflow-fast');
  assert(!inProgressState.includes('workflow_path: full'), 'IN_PROGRESS fast project must not be redirected to full');

  // --- Assertion 3 (precedence): phase1-research.md + ESCALATED fast-summary → phase2 wins ---
  // phase1-research.md has priority over fast-summary.md in reconstruct() ordering.
  // Provide a satisfied compliance table so route() crosses the phase boundary cleanly.
  writeProject(tmp, 'fast-escalated-with-p1', {
    'phase1-research.md': [
      '# Phase 1 Research',
      '',
      '## Required Agent Compliance',
      '| Requirement | Status | Evidence | Skip Reason |',
      '|-------------|--------|----------|-------------|',
      '| code-explorer | invoked | .cache/code-explorer.md | |',
      ''
    ].join('\n'),
    'fast-summary.md': '# Fast Summary: fast-escalated-with-p1\n\n## Status\nESCALATED\n'
  });
  const withP1 = runNode(repairScript, ['fast-escalated-with-p1'], tmp);
  assert(withP1.status === 0, 'repair should exit 0 when phase1-research.md and ESCALATED fast-summary coexist');
  const withP1State = read(statePath(tmp, 'fast-escalated-with-p1'));
  assert(withP1State.includes('next_command: /kaola-workflow-phase2 fast-escalated-with-p1'), 'phase1-research.md must take priority over ESCALATED fast-summary (monotonic recovery)');
}

function testRepairFastNoArgSingle() {
  // issue #201: no-argument repair-state must DISCOVER a project whose only active
  // artifact is fast-summary.md (no workflow-state.md, no numbered phase files) —
  // symmetric with numbered phase-artifact discovery. Uses its own temp root so the
  // single-project invariant holds (shared roots already contain other projects).
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-repair-fast-noarg-one-'));
  try {
    writeProject(tmp, 'oneproj', {
      'fast-summary.md': '# Fast Summary: oneproj\n\n## Status\nPASSED\n'
    });
    const result = runNode(repairScript, [], tmp);
    assert(result.status === 0, 'no-arg repair should exit 0 with one fast-summary-only project, got ' + result.status);
    assert(result.stdout.includes('/kaola-workflow-fast oneproj'),
      'no-arg repair must discover the fast-summary-only project and route to the fast skill, got: ' + result.stdout);
    const state = read(statePath(tmp, 'oneproj'));
    assert(state.includes('phase: fast'), 'discovered fast state must record phase: fast');
    assert(state.includes('workflow_path: fast'), 'discovered fast state must record workflow_path: fast');
    assert(state.includes('next_command: /kaola-workflow-fast oneproj'), 'discovered fast state must set the fast next_command');
    assert(state.includes('next_skill: kaola-workflow-fast oneproj'), 'discovered fast state must route to the fast skill');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testRepairFastNoArgAmbiguous() {
  // issue #201: two fast-summary-only projects in one root with NO argument must
  // stay a safe ambiguity refusal — never a silent pick — and write no state.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-repair-fast-noarg-multi-'));
  try {
    writeProject(tmp, 'alpha', { 'fast-summary.md': '# Fast Summary: alpha\n\n## Status\nPASSED\n' });
    writeProject(tmp, 'beta', { 'fast-summary.md': '# Fast Summary: beta\n\n## Status\nPASSED\n' });
    const result = runNode(repairScript, [], tmp);
    assert(result.status === 0, 'no-arg repair should exit 0 on ambiguity, got ' + result.status);
    assert(/ambiguous/i.test(result.stdout),
      'two fast-summary-only projects with no argument must refuse with an ambiguity reason, got: ' + result.stdout);
    assert(!fs.existsSync(statePath(tmp, 'alpha')), 'ambiguous no-arg repair must not write state for alpha');
    assert(!fs.existsSync(statePath(tmp, 'beta')), 'ambiguous no-arg repair must not write state for beta');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// issue #283: repair-state must use finalization-summary.md (not phase6-summary.md) as the
// completion signal, emit stage: finalization / stage_name: Finalization / next_command:
// /kaola-workflow-finalize for the terminal routine, and the one-way migration must convert
// a legacy active folder (phase6-summary.md→finalization-summary.md, state fields rewritten).
function testRepairFinalizationRoute() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-repair-finalization-'));
  const { reconstruct } = require(repairScript);
  const workflowDir = path.join(tmp, 'kaola-workflow');
  fs.mkdirSync(workflowDir, { recursive: true });

  try {
    // --- R1: finalization-summary.md present → reconstruct reports complete ---
    writeProject(tmp, 'fin-complete', {
      'finalization-summary.md': '# Finalization Summary\n'
    });
    const finComplete = reconstruct(tmp, workflowDir, 'fin-complete');
    assert(finComplete.complete === true,
      'R1: finalization-summary.md must be the completion signal, got: ' + JSON.stringify(finComplete));

    // --- R2: ONLY phase6-summary.md present → reconstruct must NOT report complete ---
    writeProject(tmp, 'legacy-complete', {
      'phase6-summary.md': '# Phase 6 Summary\n'
    });
    const legacyComplete = reconstruct(tmp, workflowDir, 'legacy-complete');
    assert(legacyComplete.complete !== true,
      'R2: phase6-summary.md alone must NOT be the completion signal (hard-removed), got: ' + JSON.stringify(legacyComplete));

    // --- R3: phase5-review.md present (with compliance) → state must use finalization names ---
    const phase5Content = [
      '# Phase 5 - Review: fin-route',
      '',
      '## Required Agent Compliance',
      '| Requirement | Status | Evidence | Skip Reason |',
      '|-------------|--------|----------|-------------|',
      '| code-reviewer | subagent-invoked | .cache/review.md | |',
      ''
    ].join('\n');
    writeProject(tmp, 'fin-route', {
      'phase5-review.md': phase5Content,
      'phase4-progress.md': [
        '# Phase 4',
        '## Tasks',
        '| # | Task | Status |',
        '|---|------|--------|',
        '| 1 | done | complete |',
        ''
      ].join('\n')
    });
    runNode(repairScript, ['fin-route'], tmp);
    const finRouteState = read(statePath(tmp, 'fin-route'));
    assert(finRouteState.includes('stage: finalization'),
      'R3: repair must emit stage: finalization for terminal routine, got state:\n' + finRouteState);
    assert(finRouteState.includes('stage_name: Finalization'),
      'R3: repair must emit stage_name: Finalization for terminal routine, got state:\n' + finRouteState);
    assert(finRouteState.includes('next_command: /kaola-workflow-finalize fin-route'),
      'R3: repair must emit next_command: /kaola-workflow-finalize, got state:\n' + finRouteState);
    assert(!finRouteState.includes('phase: 6'),
      'R3: repair must NOT emit phase: 6, got state:\n' + finRouteState);
    assert(!finRouteState.includes('next_command: /kaola-workflow-phase6'),
      'R3: repair must NOT emit /kaola-workflow-phase6, got state:\n' + finRouteState);

    // --- R4: one-way migration converts legacy active folder ---
    writeProject(tmp, 'legacy-active', {
      'phase6-summary.md': '# Phase 6 Summary\nLegacy content\n',
      'workflow-state.md': [
        '# Kaola-Workflow State',
        '## Project',
        'name: legacy-active',
        'status: active',
        '## Current Position',
        'phase: 6',
        'phase_name: Finalize',
        'step: some-step',
        'task: N/A',
        'next_command: /kaola-workflow-phase6 legacy-active',
        'next_skill: kaola-workflow-finalize legacy-active',
        ''
      ].join('\n')
    });
    runNode(repairScript, ['legacy-active'], tmp);
    const migratedDir = path.join(workflowDir, 'legacy-active');
    assert(!fs.existsSync(path.join(migratedDir, 'phase6-summary.md')),
      'R4: migration must remove phase6-summary.md from active folder');
    assert(fs.existsSync(path.join(migratedDir, 'finalization-summary.md')),
      'R4: migration must create finalization-summary.md in active folder');
    const migratedState = read(statePath(tmp, 'legacy-active'));
    assert(!migratedState.includes('phase: 6'),
      'R4: migrated state must not contain phase: 6, got:\n' + migratedState);
    assert(!migratedState.includes('next_command: /kaola-workflow-phase6'),
      'R4: migrated state must not contain /kaola-workflow-phase6, got:\n' + migratedState);

  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('testRepairFinalizationRoute: PASSED');
}

// issue #283: sink-pr must read/write finalization-summary.md (not phase6-summary.md).
function testSinkPrUsesFinalizationSummary() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-pr-fin-'));
  try {
    spawnSync('git', ['init'], { cwd: tmp, stdio: 'pipe' });
    spawnSync('git', ['-C', tmp, 'config', 'user.email', 'test@example.com'], { stdio: 'pipe' });
    spawnSync('git', ['-C', tmp, 'config', 'user.name', 'Test User'], { stdio: 'pipe' });
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
    spawnSync('git', ['-C', tmp, 'add', '-A'], { stdio: 'pipe' });
    spawnSync('git', ['-C', tmp, 'commit', '-m', 'initial'], { stdio: 'pipe' });

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

function testHookSingleProjectGuard(tmp) {
  spawnSync('git', ['init'], { cwd: tmp, encoding: 'utf8' });
  writeProject(tmp, 'a', { 'workflow-state.md': 'status: active\n' });
  writeProject(tmp, 'b', { 'workflow-state.md': 'status: active\n' });
  spawnSync('git', ['add', 'kaola-workflow/a/workflow-state.md', 'kaola-workflow/b/workflow-state.md'], { cwd: tmp, encoding: 'utf8' });
  const result = spawnSync('bash', [hookScript], { cwd: tmp, input: '', encoding: 'utf8' });
  assert(result.status === 2, 'pre-commit hook should block mixed project commits');
}

// issue #351 — pre-commit hook must recognise `git -C <path> commit` and
// `git -c k=v commit` as commit commands, inspect staging in the correct repo,
// and allow single-project commits regardless of flag form.
function testHookGitDashCCommitGuard() {
  // Helper: build the PreToolUse JSON payload Claude Code sends to the hook.
  const payload = (cmd) => JSON.stringify({ tool_input: { command: cmd } });

  // Create the "target" repo (simulating the worktree the contractor commits into).
  const targetRepo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-hook-target-')));
  // Create a second repo to serve as the hook's cwd (simulating kaola-workflow root).
  const hookCwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-hook-cwd-')));
  try {
    // Initialise both repos.
    spawnSync('git', ['init'], { cwd: targetRepo, encoding: 'utf8' });
    spawnSync('git', ['init'], { cwd: hookCwd, encoding: 'utf8' });

    // Stage cross-project kaola-workflow files in the TARGET repo.
    writeProject(targetRepo, 'alpha', { 'workflow-state.md': 'status: active\n' });
    writeProject(targetRepo, 'beta',  { 'workflow-state.md': 'status: active\n' });
    spawnSync('git', ['add',
      'kaola-workflow/alpha/workflow-state.md',
      'kaola-workflow/beta/workflow-state.md'
    ], { cwd: targetRepo, encoding: 'utf8' });

    // (a) `git -C <repo> commit -m x` with cross-project staging → BLOCKED (exit 2).
    // BUG: currently exits 0 because "git commit" is not a literal substring.
    let r = spawnSync('bash', [hookScript], {
      cwd: hookCwd,
      input: payload('git -C ' + targetRepo + ' commit -m "wip"'),
      encoding: 'utf8'
    });
    assert(r.status === 2,
      '(a) git -C <repo> commit with cross-project staging must be BLOCKED (exit 2), got ' + r.status +
      '\nstderr: ' + r.stderr);

    // (b) `git -c user.name=x commit` with cross-project staging in hookCwd → BLOCKED.
    // Stage the same cross-project files in hookCwd for this sub-case.
    writeProject(hookCwd, 'alpha', { 'workflow-state.md': 'status: active\n' });
    writeProject(hookCwd, 'beta',  { 'workflow-state.md': 'status: active\n' });
    spawnSync('git', ['add',
      'kaola-workflow/alpha/workflow-state.md',
      'kaola-workflow/beta/workflow-state.md'
    ], { cwd: hookCwd, encoding: 'utf8' });

    r = spawnSync('bash', [hookScript], {
      cwd: hookCwd,
      input: payload('git -c user.name=Bot commit -m "wip"'),
      encoding: 'utf8'
    });
    assert(r.status === 2,
      '(b) git -c k=v commit with cross-project staging must be BLOCKED (exit 2), got ' + r.status +
      '\nstderr: ' + r.stderr);

    // (c) plain `git commit` with cross-project staging in hookCwd → still BLOCKED (regression).
    r = spawnSync('bash', [hookScript], {
      cwd: hookCwd,
      input: payload('git commit -m "wip"'),
      encoding: 'utf8'
    });
    assert(r.status === 2,
      '(c) plain git commit with cross-project staging must be BLOCKED (exit 2), got ' + r.status +
      '\nstderr: ' + r.stderr);

    // (d) non-commit git command → exit 0 (untouched).
    r = spawnSync('bash', [hookScript], {
      cwd: hookCwd,
      input: payload('git -C ' + targetRepo + ' status'),
      encoding: 'utf8'
    });
    assert(r.status === 0,
      '(d) non-commit git command must exit 0, got ' + r.status);

    // (e) single-project commit via `git -C <repo>` → exit 0 (allowed).
    // Stage only one project in the target repo.
    const singleRepo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-hook-single-')));
    spawnSync('git', ['init'], { cwd: singleRepo, encoding: 'utf8' });
    writeProject(singleRepo, 'gamma', { 'workflow-state.md': 'status: active\n' });
    spawnSync('git', ['add', 'kaola-workflow/gamma/workflow-state.md'],
      { cwd: singleRepo, encoding: 'utf8' });

    r = spawnSync('bash', [hookScript], {
      cwd: hookCwd,
      input: payload('git -C ' + singleRepo + ' commit -m "single project"'),
      encoding: 'utf8'
    });
    assert(r.status === 0,
      '(e) single-project git -C commit must be ALLOWED (exit 0), got ' + r.status +
      '\nstderr: ' + r.stderr);

    fs.rmSync(singleRepo, { recursive: true, force: true });
  } finally {
    fs.rmSync(targetRepo, { recursive: true, force: true });
    fs.rmSync(hookCwd,    { recursive: true, force: true });
  }
  console.log('testHookGitDashCCommitGuard: PASSED');
}

function testHookShapeNoPhantomAdvisor() {
  // #372: the phantom-advisor PostToolUse hook is retired — hooks.json must carry NO PostToolUse
  // event. #376 added the PreToolUse write-lane hook, so the surviving id set is: compact-context
  // (SessionStart), pre-commit-guard + write-lane (PreToolUse), subagent-dispatch-log (SubagentStart).
  const hooks = JSON.parse(fs.readFileSync(path.join(repoRoot, 'hooks', 'hooks.json'), 'utf8')).hooks;
  const events = Object.keys(hooks);
  assert(!events.includes('PostToolUse'), '#372: hooks.json must have NO PostToolUse event, got ' + events.join(','));
  const ids = [];
  for (const ev of events) for (const block of hooks[ev]) ids.push(block.id);
  ids.sort();
  assert(JSON.stringify(ids) === JSON.stringify(['kaola-workflow:compact-context', 'kaola-workflow:pre-commit-guard', 'kaola-workflow:subagent-dispatch-log', 'kaola-workflow:write-lane']),
    '#372/#376: expected hook id set (compact-context, pre-commit-guard, subagent-dispatch-log, write-lane), got ' + JSON.stringify(ids));
  const raw = fs.readFileSync(path.join(repoRoot, 'hooks', 'hooks.json'), 'utf8');
  assert(!/phantom-advisor/.test(raw), '#372: no phantom-advisor reference in hooks.json');
  assert(!fs.existsSync(path.join(repoRoot, 'hooks', 'kaola-workflow-phantom-advisor.sh')), '#372: phantom-advisor.sh deleted');
}

function testResumeCompatLegacyAdvisorGateRow() {
  // #372 (AC10): a legacy in-flight phase file may carry a retired `advisor … gate` compliance row.
  // unresolvedCompliance must map it forward as satisfied (never pending-blocking) so an old project
  // resumes without bricking. Mutation guard: against pristine repair-state this row WOULD block.
  const repairState = require(path.join(repoRoot, 'scripts', 'kaola-workflow-repair-state.js'));
  const legacy = [
    '## Required Agent Compliance',
    '| Requirement | Status | Evidence | Skip Reason |',
    '|-------------|--------|----------|-------------|',
    '| code-architect | invoked | .cache/architect.md | |',
    '| advisor plan gate | pending | | |',
    '',
  ].join('\n');
  const unresolved = repairState.unresolvedCompliance(legacy, '');
  assert(!unresolved.some(r => (r.requirement || '').toLowerCase().includes('advisor')),
    '#372 (AC10): a legacy `advisor … gate | pending` row must NOT be pending-blocking on resume, got ' + JSON.stringify(unresolved));
}

function testWriteLaneHookGuard() {
  // #376: scripted harness for the write-lane PreToolUse containment hook (AC1 cannot fire on a real
  // dispatched subagent in the walkthrough — this drives the hook binary directly with crafted
  // PreToolUse stdin). Proves: fail-OPEN (flag off / no manifest / malformed stdin); DENY rule (a)
  // (out-of-lane member-worktree write); DENY rule (b) (parent-worktree leak); in-lane + workflow-band
  // ALLOW. Mutation-checked: against a hook with the deny branches removed, cases (4)/(6) go GREEN(0).
  const writeLaneHook = path.join(repoRoot, 'hooks', 'kaola-workflow-write-lane.sh');
  assert(fs.existsSync(writeLaneHook), '#376: write-lane hook exists');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-write-lane-'));
  try {
    spawnSync('git', ['init'], { cwd: tmp, encoding: 'utf8' });
    const RR = spawnSync('git', ['-C', tmp, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).stdout.trim();
    const cacheDir = path.join(RR, 'kaola-workflow', 'proj', '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.mkdirSync(path.join(RR, '.kw', 'node', 'proj', 'n1', 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(RR, 'scripts'), { recursive: true });
    const run = (fp, enforce) => spawnSync('bash', [writeLaneHook], {
      cwd: RR, encoding: 'utf8',
      input: JSON.stringify({ tool_input: { file_path: fp } }),
      env: Object.assign({}, process.env, enforce ? { KAOLA_LANE_CONTAINMENT: '1' } : {}),
    });
    // (1) flag OFF -> fail-open exit 0
    assert(run(path.join(RR, 'scripts/a.js'), false).status === 0, '#376: flag off -> exit 0 (fail-open)');
    // (2) flag ON but NO manifest -> dormant exit 0
    assert(run(path.join(RR, 'scripts/a.js'), true).status === 0, '#376: no running-set.json -> exit 0 (dormant)');
    // Write a manifest of one open write-node.
    fs.writeFileSync(path.join(cacheDir, 'running-set.json'),
      JSON.stringify({ nodes: [{ id: 'n1', worktreePath: '.kw/node/proj/n1', declared_write_set: ['scripts/n1.js'] }] }));
    // (3) in-lane member write -> allow
    assert(run(path.join(RR, '.kw/node/proj/n1/scripts/n1.js'), true).status === 0, '#376: in-lane member write -> exit 0');
    // (4) out-of-lane member write -> DENY (exit 2)
    assert(run(path.join(RR, '.kw/node/proj/n1/scripts/other.js'), true).status === 2, '#376 AC3: out-of-lane member write -> exit 2');
    // (5) parent-worktree leak matching n1 lane -> DENY (exit 2)
    assert(run(path.join(RR, 'scripts/n1.js'), true).status === 2, '#376 AC4: parent-worktree leak -> exit 2');
    // (6) unrelated parent write -> allow
    assert(run(path.join(RR, 'scripts/unrelated.js'), true).status === 0, '#376: unrelated parent write -> exit 0');
    // (7) malformed stdin -> fail-open
    const bad = spawnSync('bash', [writeLaneHook], { cwd: RR, encoding: 'utf8', input: 'not json', env: Object.assign({}, process.env, { KAOLA_LANE_CONTAINMENT: '1' }) });
    assert(bad.status === 0, '#376: malformed stdin -> exit 0 (fail-open)');

    // (8) #386: an OPEN WRITE node (kind:write, no member worktree) writing its OWN declared lane in
    // the PARENT worktree under enablement -> ALLOW (exit 0). This is the serial-fallback case the
    // shipped hook bricked (rule (b) matched the node's only legal target). With the self-exempt the
    // write node's own in-lane parent write passes; a non-write match still denies (case 5 above) and
    // out-of-lane still denies (case 4). Mutation: remove the `kind === "write"` exemption -> RED (2).
    fs.writeFileSync(path.join(cacheDir, 'running-set.json'),
      JSON.stringify({ nodes: [{ id: 'w1', kind: 'write', declared_write_set: ['scripts/w1.js'] }] }));
    assert(run(path.join(RR, 'scripts/w1.js'), true).status === 0,
      '#386: open write node (kind:write) writes its OWN lane in the parent -> exit 0 (self-exempt)');
    // (8b) a DIFFERENT parent write still allowed (no lane match).
    assert(run(path.join(RR, 'scripts/other-x.js'), true).status === 0, '#386: out-of-lane parent write under write-node manifest -> exit 0');
    // (8c) a READ node lane match in the parent is still a real leak -> DENY (kind!=='write').
    fs.writeFileSync(path.join(cacheDir, 'running-set.json'),
      JSON.stringify({ nodes: [{ id: 'r1', kind: 'read', declared_write_set: ['scripts/r1.js'] }] }));
    assert(run(path.join(RR, 'scripts/r1.js'), true).status === 2,
      '#386: a READ node lane match in the parent stays DENIED (only write self-exempts)');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testWriteLaneHookRegistered() {
  // #376: the write-lane hook is registered as a PreToolUse(Write|Edit) entry with the expected id.
  const hooks = JSON.parse(fs.readFileSync(path.join(repoRoot, 'hooks', 'hooks.json'), 'utf8')).hooks;
  const pre = hooks.PreToolUse || [];
  const wl = pre.find(e => e.id === 'kaola-workflow:write-lane');
  assert(wl, '#376: hooks.json has a kaola-workflow:write-lane PreToolUse entry');
  assert(wl && wl.matcher === 'Write|Edit', '#376: write-lane matcher is Write|Edit, got ' + (wl && wl.matcher));
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

function testRoadmapGenerateMissingSourceGuard(tmp) {
  const workflowDir = path.join(tmp, 'kaola-workflow');
  fs.rmSync(workflowDir, { recursive: true, force: true });
  fs.mkdirSync(workflowDir, { recursive: true });
  const roadmap = path.join(workflowDir, 'ROADMAP.md');
  fs.writeFileSync(roadmap, [
    '<!-- generated by scripts/kaola-workflow-roadmap.js — do not edit -->',
    '# Kaola-Workflow Roadmap',
    '',
    'This file mirrors active unfinished work. GitHub issues are the source of truth when available.',
    '',
    '## Active Work',
    '',
    '| Issue | Title | Status | Workflow Project | Next Step |',
    '|-------|-------|--------|------------------|-----------|',
    '| #999 | Roadmap guard fixture | open | roadmap-guard-fixture | implement |',
    '',
    '## Rules',
    '',
    '- existing generated roadmap',
    ''
  ].join('\n'), 'utf8');

  const refused = runNode(roadmapScript, ['generate'], tmp);
  assert(refused.status === 1, 'generate should refuse to erase active generated roadmap when .roadmap is missing');
  assert(refused.stderr.includes('kaola-workflow/.roadmap is missing'), 'generate refusal should explain missing source directory');
  assert(read(roadmap).includes('| #999 |'), 'generate refusal should preserve existing active roadmap rows');

  const sourceDir = path.join(workflowDir, '.roadmap');
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, 'issue-999.md'), [
    'issue: #999',
    'title: Roadmap guard fixture',
    'status: open',
    'workflow_project: roadmap-guard-fixture',
    'next_step: implement',
    ''
  ].join('\n'), 'utf8');
  const generated = runNode(roadmapScript, ['generate'], tmp);
  assert(generated.status === 0, 'generate should succeed once per-issue source files exist');
}

function testRoadmapGenerateAtomicReplace(tmp) {
  const workflowDir = path.join(tmp, 'kaola-workflow');
  fs.rmSync(workflowDir, { recursive: true, force: true });
  const sourceDir = path.join(workflowDir, '.roadmap');
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, 'issue-998.md'), [
    'issue: #998',
    'title: Atomic roadmap fixture',
    'status: open',
    'workflow_project: atomic-roadmap-fixture',
    'next_step: generate',
    ''
  ].join('\n'), 'utf8');

  const generated = runNode(roadmapScript, ['generate'], tmp);
  assert(generated.status === 0, 'generate should succeed');
  const roadmap = read(path.join(workflowDir, 'ROADMAP.md'));
  assert(roadmap.includes('| #998 | Atomic roadmap fixture | open | atomic-roadmap-fixture | generate |'), 'generated roadmap should contain the source row');
  const tempFiles = fs.readdirSync(workflowDir).filter(name => /^\.ROADMAP\.md\..+\.tmp$/.test(name));
  assert(tempFiles.length === 0, 'atomic generate should not leave temp files after success');
}

function testRoadmapProjectRulesAppend(tmp) {
  const workflowDir = path.join(tmp, 'kaola-workflow');
  fs.rmSync(workflowDir, { recursive: true, force: true });
  const sourceDir = path.join(workflowDir, '.roadmap');
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, 'issue-996.md'), [
    'issue: #996',
    'title: Rules append fixture',
    'status: open',
    'workflow_project: rules-append-fixture',
    'next_step: generate',
    ''
  ].join('\n'), 'utf8');

  // PHASE 1: absent _rules.md → no-op (no ### Project rules)
  const phase1 = runNode(roadmapScript, ['generate'], tmp);
  assert(phase1.status === 0, 'PHASE 1: generate should succeed without _rules.md');
  const roadmap1 = read(path.join(workflowDir, 'ROADMAP.md'));
  assert(!roadmap1.includes('### Project rules'), 'PHASE 1: ROADMAP.md must NOT include ### Project rules when _rules.md is absent');

  // PHASE 2: present _rules.md → appended under ### Project rules
  fs.writeFileSync(path.join(sourceDir, '_rules.md'),
    '- Project-local rule: track residuals as checkboxes on the parent epic.\n- Second project rule line.\n', 'utf8');
  const phase2 = runNode(roadmapScript, ['generate'], tmp);
  assert(phase2.status === 0, 'PHASE 2: generate should succeed with _rules.md present');
  const roadmap2 = read(path.join(workflowDir, 'ROADMAP.md'));
  assert(roadmap2.includes('### Project rules'), 'PHASE 2: ROADMAP.md must include ### Project rules when _rules.md is present');
  assert(roadmap2.includes('track residuals as checkboxes on the parent epic.'), 'PHASE 2: ROADMAP.md must include first project rule line');
  assert(roadmap2.includes('Second project rule line.'), 'PHASE 2: ROADMAP.md must include second project rule line');
  assert(roadmap2.includes('Close linked GitHub issues only after acceptance criteria pass.'), 'PHASE 2: built-in rules must still be present (project rules appended, not replacing)');

  // PHASE 3: validate must pass with _rules.md present (no false-stale)
  const phase3 = runNode(roadmapScript, ['validate'], tmp);
  assert(phase3.status === 0, 'PHASE 3: validate must exit 0 when ROADMAP.md is current with _rules.md');
  assert(phase3.stdout.includes('ok'), 'PHASE 3: validate must print ok');
}

async function testRoadmapInitIssueConcurrentExclusive(tmp) {
  const workflowDir = path.join(tmp, 'kaola-workflow');
  fs.rmSync(workflowDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(workflowDir, '.roadmap'), { recursive: true });

  const args = [
    'init-issue',
    '--issue', '997',
    '--title', 'Exclusive init fixture',
    '--status', 'open',
    '--workflow-project', 'exclusive-init-fixture',
    '--next-step', 'plan'
  ];
  const [first, second] = await Promise.all([
    runNodeAsync(roadmapScript, args, tmp),
    runNodeAsync(roadmapScript, args, tmp)
  ]);
  assert(first.status === 0, 'first concurrent init-issue should exit cleanly');
  assert(second.status === 0, 'second concurrent init-issue should exit cleanly');

  const outputs = [first.stdout, second.stdout].join('\n');
  const created = (outputs.match(/created: issue-997\.md/g) || []).length;
  const skipped = (outputs.match(/skip: issue-997\.md already exists/g) || []).length;
  assert(created === 1, 'concurrent init-issue should create exactly one source file');
  assert(skipped === 1, 'concurrent init-issue loser should skip cleanly');

  const files = fs.readdirSync(path.join(workflowDir, '.roadmap')).filter(name => name === 'issue-997.md');
  assert(files.length === 1, 'final-path exclusivity should leave exactly one issue source file');
  assert(read(path.join(workflowDir, '.roadmap', 'issue-997.md')).includes('workflow_project: exclusive-init-fixture'), 'exclusive source file should contain the requested content');
}

// ---------------------------------------------------------------------------
// Issue #16+#17+#18 roadmap filename-authority and escape round-trip fixes
// ---------------------------------------------------------------------------

function testRoadmapFilenameAuthorityMissingIssueField(tmp) {
  const workflowDir = path.join(tmp, 'kaola-workflow');
  fs.rmSync(workflowDir, { recursive: true, force: true });
  const sourceDir = path.join(workflowDir, '.roadmap');
  fs.mkdirSync(sourceDir, { recursive: true });
  // NO 'issue:' line — issue number must come from filename
  fs.writeFileSync(path.join(sourceDir, 'issue-42.md'), [
    'title: Filename authority test',
    'status: open',
    'workflow_project: filename-authority-project',
    'next_step: verify',
    ''
  ].join('\n'), 'utf8');

  const result = runNode(roadmapScript, ['generate'], tmp);
  assert(result.status === 0, 'generate should succeed even with no issue: field; got: ' + result.stderr);
  const roadmap = read(path.join(workflowDir, 'ROADMAP.md'));
  assert(roadmap.includes('| #42 |'), 'roadmap should contain | #42 | derived from filename; got:\n' + roadmap);
  assert(!roadmap.includes('No active work'), 'roadmap should NOT fall back to "No active work"; got:\n' + roadmap);
  assert(roadmap.includes('filename-authority-project'), 'roadmap should include project name; got:\n' + roadmap);
}

function testRoadmapFilenameAuthorityMismatch(tmp) {
  const workflowDir = path.join(tmp, 'kaola-workflow');
  fs.rmSync(workflowDir, { recursive: true, force: true });
  const sourceDir = path.join(workflowDir, '.roadmap');
  fs.mkdirSync(sourceDir, { recursive: true });
  // issue: field says #999, but filename says issue-43.md — filename must win
  fs.writeFileSync(path.join(sourceDir, 'issue-43.md'), [
    'issue: #999',
    'title: Filename authority mismatch test',
    'status: open',
    'workflow_project: mismatch-project',
    'next_step: verify',
    ''
  ].join('\n'), 'utf8');

  const result = runNode(roadmapScript, ['generate'], tmp);
  assert(result.status === 0, 'generate should succeed; got: ' + result.stderr);
  const roadmap = read(path.join(workflowDir, 'ROADMAP.md'));
  assert(roadmap.includes('| #43 |'), 'roadmap should contain | #43 | (filename wins), not #999; got:\n' + roadmap);
  assert(!roadmap.includes('| #999 |'), 'roadmap must NOT contain | #999 | (content field loses); got:\n' + roadmap);
}

function testRoadmapMigrateRoundTripNoDoubleEscape(tmp) {
  const workflowDir = path.join(tmp, 'kaola-workflow');
  fs.rmSync(workflowDir, { recursive: true, force: true });
  const sourceDir = path.join(workflowDir, '.roadmap');
  fs.mkdirSync(sourceDir, { recursive: true });
  // title contains a raw pipe — generate should escape it once to \|
  fs.writeFileSync(path.join(sourceDir, 'issue-55.md'), [
    'issue: #55',
    'title: Fix a|b parser',
    'status: open',
    'workflow_project: pipe-escape-project',
    'next_step: verify',
    ''
  ].join('\n'), 'utf8');

  // Step 1: generate — title should be escaped to "Fix a\|b parser"
  const gen1 = runNode(roadmapScript, ['generate'], tmp);
  assert(gen1.status === 0, 'first generate should succeed; got: ' + gen1.stderr);

  // Step 2: delete source, then migrate (regenerates source from ROADMAP.md)
  fs.rmSync(sourceDir, { recursive: true, force: true });
  const migrate = runNode(roadmapScript, ['migrate'], tmp);
  assert(migrate.status === 0, 'migrate should succeed; got: ' + migrate.stderr);

  // Step 3: generate again from migrated source
  const gen2 = runNode(roadmapScript, ['generate'], tmp);
  assert(gen2.status === 0, 'second generate should succeed; got: ' + gen2.stderr);

  const roadmap = read(path.join(workflowDir, 'ROADMAP.md'));
  assert(roadmap.includes('Fix a\\|b parser'), 'final roadmap should contain "Fix a\\|b parser" (single escape); got:\n' + roadmap);
  assert(!roadmap.includes('a\\\\|b'), 'final roadmap must NOT contain double-escaped "a\\\\|b"; got:\n' + roadmap);
}

// ---------------------------------------------------------------------------
// Issue #64 classifier behavior — folder-based overlap, closed-issue residue,
// status:released exclusion. Each scenario uses its own mkdtempSync to keep
// state isolated from the other tests in this file.
// ---------------------------------------------------------------------------

const classifierScript = path.join(repoRoot, 'scripts', 'kaola-workflow-classifier.js');

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

function plantRoadmapIssue(root, issueNumber, body) {
  const dir = path.join(root, 'kaola-workflow', '.roadmap');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'issue-' + issueNumber + '.md'), [
    'issue: #' + issueNumber,
    'title: classifier test issue ' + issueNumber,
    'status: open',
    'workflow_project: —',
    'next_step: ready',
    body,
    ''
  ].join('\n'));
}

// ===========================================================================
// issue #227: adaptive-path cases. Each uses its own temp root and sets
// KAOLA_ENABLE_ADAPTIVE explicitly so the toggle is deterministic regardless of
// any local ~/.config/kaola-workflow/config.json. They exercise the committed
// spine: claim toggle-guard, routeAdaptive resume, validator governance.
// ===========================================================================

function adaptiveTmp(slug) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-adaptive-' + slug + '-'));
  fs.mkdirSync(path.join(tmp, 'kaola-workflow'), { recursive: true });
  return tmp;
}
const ADAPTIVE_PLAN = [
  '# Workflow Plan — issue #901', '',
  '## Meta', 'labels: enhancement', '',
  '## Nodes', '',
  '| id | role | depends_on | declared_write_set | cardinality | shape |',
  '|---|---|---|---|---|---|',
  '| explore | code-explorer | — | — | 1 | sequence |',
  '| impl | tdd-guide | explore | lib/foo.js | 1 | sequence |',
  '| review | code-reviewer | impl | — | 1 | sequence |',
  '| done | finalize | review | — | 1 | sequence |',
  ''
].join('\n');

function plantFrozenPlan(root, project, planText) {
  const dir = path.join(root, 'kaola-workflow', project);
  fs.mkdirSync(dir, { recursive: true });
  const planPath = path.join(dir, 'workflow-plan.md');
  fs.writeFileSync(planPath, planText);
  // freeze in place via the validator (stamps plan_hash)
  const r = runNode(planValidatorScript, [planPath, '--freeze'], root);
  assert(r.status === 0, 'plantFrozenPlan: freeze should exit 0, got ' + r.status + ' ' + r.stderr);
  return planPath;
}

// (a) OFF + KAOLA_PATH=adaptive startup -> typed refusal in claimProject, no state.
function testAdaptiveOffStartupRefusal() {
  const tmp = adaptiveTmp('off-startup');
  try {
    plantRoadmapIssue(tmp, 901, '');
    const result = runNode(claimScript, ['startup', '--target-issue', '901'], tmp,
      { KAOLA_PATH: 'adaptive', KAOLA_ENABLE_ADAPTIVE: '0' });
    const out = JSON.parse(result.stdout);
    assert(out.verdict === 'workflow_path_refused',
      'OFF + KAOLA_PATH=adaptive startup must be a typed refusal, got: ' + result.stdout);
    assert(out.claim === 'none', 'refusal must not claim');
    assert(!fs.existsSync(statePath(tmp, 'issue-901')), 'refusal must write no state');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptiveOffStartupRefusal: PASSED');
}

// (b) OFF + claim --workflowPath adaptive -> typed refusal (never silent downgrade).
function testAdaptiveOffClaimRefusal() {
  const tmp = adaptiveTmp('off-claim');
  try {
    const result = runNode(claimScript, ['claim', '--project', 'issue-902', '--workflowPath', 'adaptive'], tmp,
      { KAOLA_ENABLE_ADAPTIVE: '0' });
    const out = JSON.parse(result.stdout);
    assert(out.status === 'workflow_path_refused',
      'OFF + claim adaptive must refuse, got: ' + result.stdout);
    assert(!fs.existsSync(statePath(tmp, 'issue-902')), 'refusal must write no state');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptiveOffClaimRefusal: PASSED');
}

// (c) OFF preserves the 2-way: fast still claims; a bogus path is also refused.
function testAdaptiveOffPreservesTwoWay() {
  const tmp = adaptiveTmp('off-twoway');
  try {
    const ok = JSON.parse(runNode(claimScript, ['claim', '--project', 'issue-903', '--workflowPath', 'fast'], tmp,
      { KAOLA_ENABLE_ADAPTIVE: '0' }).stdout);
    assert(ok.status === 'acquired', 'OFF must still allow fast, got: ' + JSON.stringify(ok));
    const bogus = JSON.parse(runNode(claimScript, ['claim', '--project', 'issue-904', '--workflowPath', 'wizard'], tmp,
      { KAOLA_ENABLE_ADAPTIVE: '0' }).stdout);
    assert(bogus.status === 'workflow_path_refused', 'bogus workflow_path must be refused (whitelist), got: ' + JSON.stringify(bogus));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptiveOffPreservesTwoWay: PASSED');
}

// (d) ON + KAOLA_PATH=adaptive startup -> acquired, state routes to plan-run.
function testAdaptiveOnStartupAcquires() {
  const tmp = adaptiveTmp('on-startup');
  try {
    plantRoadmapIssue(tmp, 905, '');
    const out = JSON.parse(runNode(claimScript, ['startup', '--target-issue', '905'], tmp,
      { KAOLA_PATH: 'adaptive', KAOLA_ENABLE_ADAPTIVE: '1' }).stdout);
    assert(out.claim === 'acquired', 'ON + adaptive startup must acquire, got: ' + JSON.stringify(out));
    const state = read(statePath(tmp, 'issue-905'));
    assert(state.includes('workflow_path: adaptive'), 'state must record workflow_path: adaptive');
    assert(state.includes('next_command: /kaola-workflow-plan-run issue-905'), 'state must route to plan-run, got:\n' + state);
    assert(state.includes('next_skill: kaola-workflow-plan-run issue-905'), 'state must route to plan-run skill');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptiveOnStartupAcquires: PASSED');
}

// (e) routeAdaptive: a frozen plan resumes to plan-run, ahead of the phaseN ladder.
function testAdaptiveResumeFromFrozenPlan() {
  const tmp = adaptiveTmp('resume-frozen');
  try {
    plantFrozenPlan(tmp, 'issue-906', ADAPTIVE_PLAN);
    const result = runNode(repairScript, ['issue-906'], tmp);
    assert(result.status === 0, 'repair should exit 0, got ' + result.status + ' ' + result.stderr);
    assert(result.stdout.includes('/kaola-workflow-plan-run issue-906'),
      'frozen plan must resume to plan-run, got:\n' + result.stdout);
    const state = read(statePath(tmp, 'issue-906'));
    assert(state.includes('workflow_path: adaptive'), 'repaired state must be adaptive');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptiveResumeFromFrozenPlan: PASSED');
}

// (f) routeAdaptive: a tampered plan is a typed refusal — never a phaseN fallback.
function testAdaptiveResumeTamperedTypedRefusal() {
  const tmp = adaptiveTmp('resume-tampered');
  try {
    const planPath = plantFrozenPlan(tmp, 'issue-907', ADAPTIVE_PLAN);
    fs.writeFileSync(planPath, read(planPath).replace('lib/foo.js', 'lib/bar.js')); // mutate after freeze
    const result = runNode(repairScript, ['issue-907'], tmp);
    assert(/typed refusal/i.test(result.stdout), 'tampered plan must be a typed refusal, got:\n' + result.stdout);
    assert(!/kaola-workflow-phase\d/.test(result.stdout), 'tampered plan must NOT fall back to a phaseN command');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptiveResumeTamperedTypedRefusal: PASSED');
}

// (g) routeAdaptive: an unparseable plan is a typed refusal.
function testAdaptiveResumeUnparseableTypedRefusal() {
  const tmp = adaptiveTmp('resume-unparseable');
  try {
    writeProject(tmp, 'issue-908', { 'workflow-plan.md': '# garbage\nno nodes table\n' });
    const result = runNode(repairScript, ['issue-908'], tmp);
    assert(/typed refusal/i.test(result.stdout), 'unparseable plan must be a typed refusal, got:\n' + result.stdout);
    assert(!/kaola-workflow-phase\d/.test(result.stdout), 'unparseable plan must NOT fall back to phaseN');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptiveResumeUnparseableTypedRefusal: PASSED');
}

// (h) toggle gates SELECTION only: an in-flight adaptive project resumes via
// `claim resume` to plan-run even after the switch is flipped OFF (toggle-agnostic).
// #236 (document-as-designed): this locks the no-kill-switch-once-frozen contract — flipping
// OFF must NOT brick a frozen plan; pairs with testAdaptiveOffClaimRefusal (selection gated). A
// future regression that adds a toggle read to a resume surface fails here.
function testAdaptiveResumeAfterFlipOff() {
  const tmp = adaptiveTmp('resume-flipoff');
  try {
    writeProject(tmp, 'issue-909', {
      'workflow-state.md': [
        'name: issue-909', 'issue_number: 909', 'status: active',
        'phase: adaptive', 'workflow_path: adaptive', 'next_command:', ''
      ].join('\n')
    });
    const out = JSON.parse(runNode(claimScript, ['resume'], tmp, { KAOLA_ENABLE_ADAPTIVE: '0' }).stdout);
    assert(out.resumed === true, 'in-flight adaptive must resume after flip OFF');
    assert(out.next_command === '/kaola-workflow-plan-run issue-909',
      'adaptive resume must emit plan-run (not phaseN) even with switch OFF, got: ' + out.next_command);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptiveResumeAfterFlipOff: PASSED');
}

// (i) consent-halt surfaces on resume rather than re-dispatching.
function testAdaptiveConsentHaltSurfaces() {
  const tmp = adaptiveTmp('consent-halt');
  try {
    plantFrozenPlan(tmp, 'issue-910', ADAPTIVE_PLAN);
    fs.writeFileSync(statePath(tmp, 'issue-910'), [
      'name: issue-910', 'status: active', 'workflow_path: adaptive',
      'escalated_to_full: consent', ''
    ].join('\n'));
    const result = runNode(repairScript, ['issue-910'], tmp);
    assert(result.stdout.includes('/kaola-workflow-plan-run issue-910'), 'consent-halt still routes to plan-run');
    const state = read(statePath(tmp, 'issue-910'));
    assert(state.includes('consent-halt-surface'), 'consent-halt must be surfaced in the step, got:\n' + state);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptiveConsentHaltSurfaces: PASSED');
}

// ── (#383/#387/#391 walkthrough ×4 editions) — cross-surface mutual exclusion,
//    plan-integrity gate, and durable-halt fence exercised end-to-end through the
//    REAL adaptive-node CLI. The #386 AC already had a walkthrough scenario; this
//    adds the missing canonical ones the #383/#387/#391 ACs call for. The
//    production engine (adaptive-node.js) is byte-synced to codex and rename-rendered
//    to gitlab/gitea by `npm run sync:editions`, so each edition's own walkthrough /
//    contract chain exercises the SAME guarded code — giving the cross-edition
//    coverage the ACs require.
const CROSS_SURFACE_PLAN = [
  '# Workflow Plan — issue #386', '',
  '## Meta', 'labels: enhancement', '',
  '## Nodes', '',
  '| id | role | depends_on | declared_write_set | cardinality | shape |',
  '|---|---|---|---|---|---|',
  '| explore | code-explorer | — | — | 1 | sequence |',
  '| impl | tdd-guide | explore | lib/foo.js | 1 | sequence |',
  '| review | code-reviewer | impl | — | 1 | sequence |',
  '| done | finalize | review | — | 1 | sequence |',
  '',
  '## Node Ledger', '',
  '| id | status | notes |',
  '| --- | --- | --- |',
  '| explore | pending | |',
  '| impl | pending | |',
  '| review | pending | |',
  '| done | pending | |',
  ''
].join('\n');

function adaptiveNodeJson(res) {
  return JSON.parse(res.stdout.trim().split('\n').filter(l => l.trim().startsWith('{')).pop());
}

function testAdaptiveCrossSurfaceMutexWalkthrough() {
  // #383 — cross-surface mutual exclusion: open-ready over a LIVE serial in_progress
  //         (no running set) must refuse serial_node_live (never co-schedule a read
  //         fan-out against a live serial node).
  {
    const tmp = adaptiveTmp('xsurf-383');
    try {
      const planPath = plantFrozenPlan(tmp, 'issue-386', CROSS_SURFACE_PLAN);
      // Make `impl` a live SERIAL in_progress row (one in_progress, NO running-set).
      fs.writeFileSync(planPath, read(planPath).replace('| impl | pending |', '| impl | in_progress |'));
      const r = runNode(adaptiveNodeScript, ['open-ready', '--project', 'issue-386', '--json'], tmp);
      const j = adaptiveNodeJson(r);
      assert(r.status === 1 && j.result === 'refuse' && j.reason === 'serial_node_live',
        '#383: open-ready over a live serial in_progress must refuse serial_node_live, got ' + JSON.stringify({ status: r.status, result: j.result, reason: j.reason }));
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }

  // #387 — tampered plan: open-ready must refuse plan_integrity_failed (the scheduler
  //         must never partially execute a post-freeze-tampered frozen plan).
  {
    const tmp = adaptiveTmp('xsurf-387');
    try {
      const planPath = plantFrozenPlan(tmp, 'issue-386', CROSS_SURFACE_PLAN);
      // Mutate the declared_write_set AFTER freeze → plan_hash mismatch (resume-check fails).
      fs.writeFileSync(planPath, read(planPath).replace('lib/foo.js', 'lib/bar.js'));
      const r = runNode(adaptiveNodeScript, ['open-ready', '--project', 'issue-386', '--json'], tmp);
      const j = adaptiveNodeJson(r);
      assert(r.status === 1 && j.result === 'refuse' && j.reason === 'plan_integrity_failed',
        '#387: open-ready over a tampered frozen plan must refuse plan_integrity_failed, got ' + JSON.stringify({ status: r.status, result: j.result, reason: j.reason }));
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }

  // #391 — durable consent_halt: a mutating subcommand (open-ready) must refuse
  //         halt_pending while the durable halt marker is in the Node Ledger.
  {
    const tmp = adaptiveTmp('xsurf-391');
    try {
      const planPath = plantFrozenPlan(tmp, 'issue-386', CROSS_SURFACE_PLAN);
      // Append a durable consent_halt INSIDE the Node Ledger (the only place it fences).
      // revalidateForResume tolerates an appended halt line, so the plan stays hash-valid.
      fs.writeFileSync(planPath, read(planPath).trimEnd() + '\nconsent_halt: pending\n');
      const r = runNode(adaptiveNodeScript, ['open-ready', '--project', 'issue-386', '--json'], tmp);
      const j = adaptiveNodeJson(r);
      assert(r.status === 1 && j.result === 'refuse' && j.reason === 'halt_pending',
        '#391: open-ready under a durable consent_halt must refuse halt_pending, got ' + JSON.stringify({ status: r.status, result: j.result, reason: j.reason }));
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }

  console.log('testAdaptiveCrossSurfaceMutexWalkthrough: PASSED');
}

// (j) validator governance: auto-run / ask / typed-refusal over real plan fixtures.
function validatePlanFixture(tmp, nodesRows, labels) {
  const planPath = path.join(tmp, 'plan.md');
  const meta = labels !== undefined ? ['## Meta', 'labels: ' + labels.join(', '), ''] : [];
  fs.writeFileSync(planPath, ['# Plan', ''].concat(meta).concat([
    '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '|---|---|---|---|---|---|',
  ]).concat(nodesRows).concat(['']).join('\n'));
  return JSON.parse(runNode(planValidatorScript, [planPath, '--json'], tmp).stdout);
}
function testAdaptiveValidatorGovernance() {
  const tmp = adaptiveTmp('validator-gov');
  try {
    // sequential low-risk -> auto-run
    let v = validatePlanFixture(tmp, [
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| impl | tdd-guide | explore | lib/foo.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'in-grammar' && v.decision === 'auto-run', 'sequential low-risk must auto-run, got: ' + JSON.stringify(v));

    // write-role fan-out (disjoint) -> in-grammar but ASK (blast radius)
    v = validatePlanFixture(tmp, [
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| api | tdd-guide | explore | api/x.js | 1 | fanout(impl) |',
      '| cli | tdd-guide | explore | cli/y.js | 1 | fanout(impl) |',
      '| review | code-reviewer | api,cli | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'in-grammar' && v.decision === 'ask', 'write-role fan-out must ask, got: ' + JSON.stringify(v));

    // post-dominance leak (doc-updater side branch) -> typed refusal
    v = validatePlanFixture(tmp, [
      '| impl | tdd-guide | — | lib/foo.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| doc | doc-updater | impl | — | 1 | sequence |',
      '| done | finalize | review,doc | — | 1 | sequence |',
    ], []);
    assert(v.result === 'refuse', 'post-dominance leak must refuse, got: ' + JSON.stringify(v));

    // non-disjoint write-role fan-out -> typed refusal (demotion)
    v = validatePlanFixture(tmp, [
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| a | tdd-guide | explore | api/x.js | 1 | fanout(impl) |',
      '| b | tdd-guide | explore | api/y.js | 1 | fanout(impl) |',
      '| review | code-reviewer | a,b | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'refuse', 'non-disjoint fan-out must refuse, got: ' + JSON.stringify(v));

    // sensitive label without security-reviewer -> typed refusal (G2)
    v = validatePlanFixture(tmp, [
      '| impl | tdd-guide | — | lib/foo.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], ['security']);
    assert(v.result === 'refuse', 'sensitive plan without security-reviewer must refuse (G2), got: ' + JSON.stringify(v));

    // read-only fan-out (adversarial-verifier skeptics) -> auto-run (not clamped to 1, zero blast radius)
    v = validatePlanFixture(tmp, [
      '| claim | planner | — | — | 1 | sequence |',
      '| s1 | adversarial-verifier | claim | — | 1 | fanout(sk) |',
      '| s2 | adversarial-verifier | claim | — | 1 | fanout(sk) |',
      '| s3 | adversarial-verifier | claim | — | 1 | fanout(sk) |',
      '| done | finalize | s1,s2,s3 | — | 1 | sequence |',
    ], []);
    assert(v.result === 'in-grammar' && v.decision === 'auto-run', 'read-only fan-out must auto-run (zero blast radius), got: ' + JSON.stringify(v));

    // implementer in-grammar (code-reviewer post-dominates) -> auto-run
    v = validatePlanFixture(tmp, [
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| impl | implementer | explore | lib/foo.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'in-grammar' && v.decision === 'auto-run', 'implementer node with code-reviewer must be in-grammar+auto-run, got: ' + JSON.stringify(v));
    // implementer G1 fires when code-reviewer removed
    v = validatePlanFixture(tmp, [
      '| impl | implementer | — | lib/foo.js | 1 | sequence |',
      '| doc | doc-updater | impl | — | 1 | sequence |',
      '| done | finalize | doc | — | 1 | sequence |',
    ], []);
    assert(v.result === 'refuse' && /G1/.test((v.errors||[]).join(';')), 'implementer without code-reviewer post-dominance must refuse (G1), got: ' + JSON.stringify(v));

    // #334: in-grammar control — explore→impl→review→vgate(main-session-gate)→done auto-runs.
    v = validatePlanFixture(tmp, [
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| impl | implementer | explore | lib/foo.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| vgate | main-session-gate | review | — | 1 | sequence |',
      '| done | finalize | vgate | — | 1 | sequence |',
    ], []);
    assert(v.result === 'in-grammar' && v.decision === 'auto-run', '#334: a main-session-gate post-dominating code must be in-grammar+auto-run, got: ' + JSON.stringify(v));

    // #334 G3: a main-session-gate on a SIDE branch (does not post-dominate the implementer) → refuse /G3/.
    v = validatePlanFixture(tmp, [
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| impl | implementer | explore | lib/foo.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| vgate | main-session-gate | explore | — | 1 | sequence |',
      '| done | finalize | review,vgate | — | 1 | sequence |',
    ], []);
    assert(v.result === 'refuse' && /G3/.test((v.errors||[]).join(';')), '#334: a side-branch main-session-gate must refuse (G3), got: ' + JSON.stringify(v));

    // #334: a main-session-gate with a declared write set → read-only refusal.
    v = validatePlanFixture(tmp, [
      '| impl | implementer | — | lib/foo.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| vgate | main-session-gate | review | lib/bar.js | 1 | sequence |',
      '| done | finalize | vgate | — | 1 | sequence |',
    ], []);
    assert(v.result === 'refuse' && /read-only role main-session-gate/.test((v.errors||[]).join(';')), '#334: a main-session-gate write set must refuse (read-only), got: ' + JSON.stringify(v));

    // #334: a main-session-gate as a fan-out member → shape refusal (sequence only).
    v = validatePlanFixture(tmp, [
      '| impl | implementer | — | lib/foo.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| g1 | main-session-gate | review | — | 1 | fanout(gates) |',
      '| g2 | main-session-gate | review | — | 1 | fanout(gates) |',
      '| done | finalize | g1,g2 | — | 1 | sequence |',
    ], []);
    assert(v.result === 'refuse' && /main-session-gate node g1 must be shape sequence/.test((v.errors||[]).join(';')), '#334: a main-session-gate fan-out member must refuse (shape), got: ' + JSON.stringify(v));

    // #381: directory-shaped write-set entry → typed FREEZE refusal (dead-on-arrival at the
    // exact-path barrier). Refused at freeze (the authoring gate), never deferred to a mid-run halt.
    v = validatePlanFixture(tmp, [
      '| impl | tdd-guide | — | src/ | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'refuse' && /directory-shaped/.test((v.errors||[]).join(';')),
      '#381: a directory-shaped write-set entry (src/) must refuse at freeze, got: ' + JSON.stringify(v));

    // #381: normalization variants (./src/, src//, backtick-wrapped) all collapse to src/ → refuse.
    for (const ws of ['./src/', 'src//', '`src/`']) {
      v = validatePlanFixture(tmp, [
        '| impl | tdd-guide | — | ' + ws + ' | 1 | sequence |',
        '| review | code-reviewer | impl | — | 1 | sequence |',
        '| done | finalize | review | — | 1 | sequence |',
      ], []);
      assert(v.result === 'refuse' && /directory-shaped/.test((v.errors||[]).join(';')),
        '#381: directory variant ' + JSON.stringify(ws) + ' must refuse at freeze, got: ' + JSON.stringify(v));
    }

    // #381: a `..` path-traversal token → typed FREEZE refusal (normalizeRepoPath leaves ../ intact).
    v = validatePlanFixture(tmp, [
      '| impl | tdd-guide | — | src/../b.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'refuse' && /contains '\.\.'/.test((v.errors||[]).join(';')),
      "#381: a '..'-bearing write-set token must refuse at freeze, got: " + JSON.stringify(v));

    // #381 (NO false-refusal): exact file paths — incl. a root-level file and dot-leading files —
    // FREEZE GREEN. The shape check keys on a trailing '/' ONLY (never 'lacks a /' / 'starts with .').
    v = validatePlanFixture(tmp, [
      '| impl | tdd-guide | — | src/foo.js, Dockerfile, .github/workflows/deploy.yml | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'in-grammar',
      '#381: exact files (incl Dockerfile + .github/...) must freeze green, got: ' + JSON.stringify(v));

    // #381 (FREEZE-ONLY / no-brick): a plan FROZEN by a pre-#381 validator (legal then) carrying a
    // `src/` entry must still PASS --resume-check (revalidateForResume is untouched) even though
    // --freeze now REFUSES the same content — so an in-flight legacy plan resumes, never bricks.
    {
      const pv = require('./kaola-workflow-plan-validator');
      const legacy = ['# Plan', '', '## Meta', 'labels: area:scripts', '', '## Nodes', '',
        '| id | role | depends_on | declared_write_set | cardinality | shape |',
        '|---|---|---|---|---|---|',
        '| impl | tdd-guide | — | src/ | 1 | sequence |',
        '| review | code-reviewer | impl | — | 1 | sequence |',
        '| done | finalize | review | — | 1 | sequence |', ''].join('\n');
      const frozenLegacy = '<!-- plan_hash: ' + pv.computePlanHash(legacy) + ' -->\n' + legacy;
      const resume = pv.revalidateForResume(frozenLegacy);
      assert(resume.ok === true, '#381: a frozen legacy src/ plan must PASS --resume-check (no brick), got: ' + JSON.stringify(resume));
      const refreeze = pv.validatePlan(frozenLegacy);
      assert(refreeze.result === 'refuse' && /directory-shaped/.test((refreeze.errors||[]).join(';')),
        '#381: the same legacy content must REFUSE at --freeze, got: ' + JSON.stringify(refreeze));

      // #381 (exact-barrier semantics PRESERVED): the barrier still refuses a real file write
      // against a `src/` directory declaration — the fix lives at freeze, NOT by teaching the
      // barrier to prefix-match (explicit non-goal).
      const bc = pv.barrierCheck(frozenLegacy, ['src/foo.js'], { nodeId: 'impl' });
      assert(bc && bc.result === 'refuse', '#381: barrierCheck still refuses src/foo.js vs a src/ declaration (exact semantics preserved), got: ' + JSON.stringify(bc));
    }

    // #382: optional per-node `model` column ({opus|sonnet}). Build 7-col plans (the column is the
    // 7th cell) and validate via the CLI. A valid tier freezes green; an unknown tier or a
    // main-session-gate carrying a model refuses at freeze; an absent column is back-compat.
    const vModel = (rows) => {
      const pth = path.join(tmp, 'plan-model.md');
      fs.writeFileSync(pth, ['# Plan', '', '## Meta', 'labels: area:scripts', '', '## Nodes', '',
        '| id | role | depends_on | declared_write_set | cardinality | shape | model |',
        '|---|---|---|---|---|---|---|'].concat(rows).concat(['']).join('\n'));
      return JSON.parse(runNode(planValidatorScript, [pth, '--json'], tmp).stdout);
    };
    v = vModel([
      '| arch | code-architect | — | — | 1 | sequence | opus |',
      '| impl | implementer | arch | lib/foo.js | 1 | sequence | sonnet |',
      '| review | code-reviewer | impl | — | 1 | sequence | |',
      '| done | finalize | review | — | 1 | sequence | |',
    ]);
    assert(v.result === 'in-grammar', '#382: valid {opus,sonnet} model tiers (+ absent) must freeze green, got: ' + JSON.stringify(v));

    v = vModel([
      '| impl | implementer | — | lib/foo.js | 1 | sequence | haiku |',
      '| review | code-reviewer | impl | — | 1 | sequence | |',
      '| done | finalize | review | — | 1 | sequence | |',
    ]);
    assert(v.result === 'refuse' && /model_invalid/.test((v.errors||[]).join(';')),
      '#382: an unknown model tier must refuse with model_invalid, got: ' + JSON.stringify(v));

    v = vModel([
      '| impl | implementer | — | lib/foo.js | 1 | sequence | sonnet |',
      '| review | code-reviewer | impl | — | 1 | sequence | |',
      '| vgate | main-session-gate | review | — | 1 | sequence | opus |',
      '| done | finalize | vgate | — | 1 | sequence | |',
    ]);
    assert(v.result === 'refuse' && /must not declare a model/.test((v.errors||[]).join(';')),
      '#382: a main-session-gate carrying a model must refuse, got: ' + JSON.stringify(v));

    // #390(c): the finalize sink, like a main-session-gate, is never dispatched as a subagent — a
    // model cell on it must refuse at freeze (wall symmetry). Freeze-only (resume-check untouched).
    v = vModel([
      '| impl | implementer | — | lib/foo.js | 1 | sequence | sonnet |',
      '| review | code-reviewer | impl | — | 1 | sequence | |',
      '| done | finalize | review | — | 1 | sequence | opus |',
    ]);
    assert(v.result === 'refuse' && /finalize sink and must not declare a model/.test((v.errors||[]).join(';')),
      '#390(c): the finalize sink carrying a model must refuse at freeze, got: ' + JSON.stringify(v));

    // #388: freeze-wall round 2 — residual write-set shapes that froze in-grammar yet die at the
    // exact-path barrier. Each refused at the AUTHORING gate (freeze), never deferred to a halt.

    // (a) inner `/./` is COLLAPSED by normalizeRepoPath, so `src/./app.js` is a clean exact path
    // and freezes GREEN (it IS src/app.js — a new file, not a directory).
    v = validatePlanFixture(tmp, [
      '| impl | tdd-guide | — | src/./app.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'in-grammar',
      '#388: inner /./ collapses to a clean exact path and freezes green, got: ' + JSON.stringify(v));

    // (a-twin) the /./ collapse also restores the guaranteed-clobber refusal: two independent
    // antichain siblings implA `src/./app.js` and implB `src/app.js` are the SAME physical file →
    // refuse "both write". FLIPS to in-grammar if the /./ collapse is reverted (they'd be distinct
    // strings, so neither the disjointness nor the clobber check would see the overlap).
    v = validatePlanFixture(tmp, [
      '| implA | tdd-guide | — | src/./app.js | 1 | sequence |',
      '| implB | tdd-guide | — | src/app.js | 1 | sequence |',
      '| review | code-reviewer | implA,implB | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'refuse' && /both write/.test((v.errors||[]).join(';')),
      '#388: src/./app.js + src/app.js (same file) must refuse the guaranteed clobber, got: ' + JSON.stringify(v));

    // (c) a backslash token `src\app.js` is dead at the POSIX exact-path barrier → backslash refusal.
    v = validatePlanFixture(tmp, [
      '| impl | tdd-guide | — | src\\app.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'refuse' && /backslash_in_path/.test((v.errors||[]).join(';')),
      '#388: a backslash token (src\\app.js) must refuse at freeze, got: ' + JSON.stringify(v));

    // (d) backslash traversal `..\notes.txt` — the #381 `..` wall split is `/`-only, so this evaded
    // it; the backslash check now catches it.
    v = validatePlanFixture(tmp, [
      '| impl | tdd-guide | — | ..\\notes.txt | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'refuse' && /backslash_in_path/.test((v.errors||[]).join(';')),
      '#388: a backslash traversal (..\\notes.txt) must refuse at freeze, got: ' + JSON.stringify(v));

    // (e) case-variant SIBLINGS in the same node (`SRC/app.js` + `src/app.js`) → case_collision.
    v = validatePlanFixture(tmp, [
      '| impl | tdd-guide | — | SRC/app.js, src/app.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'refuse' && /case_collision/.test((v.errors||[]).join(';')),
      '#388: case-colliding siblings (SRC/app.js + src/app.js) must refuse at freeze, got: ' + JSON.stringify(v));

    // (minor) a multi-token cell with a token that normalizes to empty (`src/app.js ./`) →
    // token_empty_normalized (the `./` grant must not silently vanish).
    v = validatePlanFixture(tmp, [
      '| impl | tdd-guide | — | src/app.js ./ | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'refuse' && /token_empty_normalized/.test((v.errors||[]).join(';')),
      '#388: a token that normalizes to empty must refuse at freeze, got: ' + JSON.stringify(v));

    // (a-fs) a BARE directory name (no trailing slash) that resolves to a REAL directory under the
    // repo root → directory_shaped_bare. CONTROL: a Dockerfile-style root FILE (also slash-less)
    // freezes GREEN — the fs distinguishes them where the string check cannot.
    {
      fs.mkdirSync(path.join(tmp, 'realsrc'), { recursive: true });
      v = validatePlanFixture(tmp, [
        '| impl | tdd-guide | — | realsrc | 1 | sequence |',
        '| review | code-reviewer | impl | — | 1 | sequence |',
        '| done | finalize | review | — | 1 | sequence |',
      ], []);
      assert(v.result === 'refuse' && /directory_shaped_bare/.test((v.errors||[]).join(';')),
        '#388: a bare name resolving to a real directory must refuse at freeze, got: ' + JSON.stringify(v));
      // CONTROL: a real root FILE (Dockerfile-style) freezes green.
      fs.writeFileSync(path.join(tmp, 'Dockerfile'), 'FROM scratch\n');
      v = validatePlanFixture(tmp, [
        '| impl | tdd-guide | — | Dockerfile | 1 | sequence |',
        '| review | code-reviewer | impl | — | 1 | sequence |',
        '| done | finalize | review | — | 1 | sequence |',
      ], []);
      assert(v.result === 'in-grammar',
        '#388 CONTROL: a real root FILE (Dockerfile) must freeze green (not directory_shaped_bare), got: ' + JSON.stringify(v));
    }

    // (dup-id) two `impl` rows freeze in-grammar today (nodeCount counts both; barrier judges the
    // 2nd against the 1st) → duplicate node id refusal.
    v = validatePlanFixture(tmp, [
      '| impl | tdd-guide | — | lib/a.js | 1 | sequence |',
      '| impl | tdd-guide | — | lib/b.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'refuse' && /duplicate node id/.test((v.errors||[]).join(';')),
      '#388: a duplicate node id must refuse at freeze, got: ' + JSON.stringify(v));

    // (sanitize-collision) distinct ids that sanitize identically (`a.b` vs `a_b` → barrier-base-a_b)
    // collide on the per-node .cache/ref key → refuse.
    v = validatePlanFixture(tmp, [
      '| a.b | tdd-guide | — | lib/a.js | 1 | sequence |',
      '| a_b | tdd-guide | — | lib/b.js | 1 | sequence |',
      '| review | code-reviewer | a.b,a_b | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'refuse' && /sanitize to the same barrier/.test((v.errors||[]).join(';')),
      '#388: ids that sanitize to the same barrier key (a.b vs a_b) must refuse at freeze, got: ' + JSON.stringify(v));

    // #388 (FREEZE-ONLY / no-brick): a plan FROZEN by a pre-#388 validator carrying a dup id OR a
    // backslash token must still PASS --resume-check (revalidateForResume is untouched) — only
    // --freeze refuses. Mirrors the #381 freeze-only landmine.
    {
      const pv = require('./kaola-workflow-plan-validator');
      const legacyDup = ['# Plan', '', '## Meta', 'labels: area:scripts', '', '## Nodes', '',
        '| id | role | depends_on | declared_write_set | cardinality | shape |',
        '|---|---|---|---|---|---|',
        '| impl | tdd-guide | — | lib/a.js | 1 | sequence |',
        '| impl | tdd-guide | — | lib/b.js | 1 | sequence |',
        '| review | code-reviewer | impl | — | 1 | sequence |',
        '| done | finalize | review | — | 1 | sequence |', ''].join('\n');
      const frozenDup = '<!-- plan_hash: ' + pv.computePlanHash(legacyDup) + ' -->\n' + legacyDup;
      assert(pv.revalidateForResume(frozenDup).ok === true,
        '#388: a frozen legacy dup-id plan must PASS --resume-check (no brick), got: ' + JSON.stringify(pv.revalidateForResume(frozenDup)));
      assert(pv.validatePlan(frozenDup).result === 'refuse',
        '#388: the same dup-id content must REFUSE at --freeze, got: ' + JSON.stringify(pv.validatePlan(frozenDup).result));
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptiveValidatorGovernance: PASSED');
}

// issue #233 (audit B6): fan-out groups are scoped by (label, fan-out origin), not label alone.
// GAP: two topologically-independent branches that reuse the same label `impl` must NOT be summed
// against FANOUT_CAP nor cross-checked for disjointness as one merged fan-out. CONTROL: a genuine
// single-origin fan-out over the cap must still refuse, and a root fan-out (no single origin) must
// fall back to the global bucket (pre-#233 behavior) so nothing that passes today is newly refused.
function testAdaptiveFanoutGroupScoping() {
  const tmp = adaptiveTmp('fanout-scope');
  try {
    // GAP: label `impl` reused across two independent branches (origins root1 vs root2), 3 each.
    // Post-#233 these scope as two separate groups (NOT one merged width-6 group) so the within-group
    // disjointness check runs per-branch. Width is no longer a refusal axis (#303); both branches are
    // internally disjoint -> in-grammar (write-role fan-out => ask).
    let v = validatePlanFixture(tmp, [
      '| root1 | code-explorer | — | — | 1 | sequence |',
      '| root2 | code-explorer | — | — | 1 | sequence |',
      '| a1 | tdd-guide | root1 | aaa/1.js | 1 | fanout(impl) |',
      '| a2 | tdd-guide | root1 | bbb/1.js | 1 | fanout(impl) |',
      '| a3 | tdd-guide | root1 | ccc/1.js | 1 | fanout(impl) |',
      '| b1 | tdd-guide | root2 | ddd/1.js | 1 | fanout(impl) |',
      '| b2 | tdd-guide | root2 | eee/1.js | 1 | fanout(impl) |',
      '| b3 | tdd-guide | root2 | fff/1.js | 1 | fanout(impl) |',
      '| review | code-reviewer | a1,a2,a3,b1,b2,b3 | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'in-grammar',
      'B6 gap: independent branches reusing a label must NOT sum against FANOUT_CAP, got: ' + JSON.stringify(v));

    // CONTROL 1 (#303): a genuine single-origin fan-out (5 members, all depends_on root) over
    // FANOUT_CAP=4 is now IN-GRAMMAR — FANOUT_CAP is a runtime concurrency limit, not a planning
    // validity cap. The over-cap group is recorded as a non-blocking diagnostic; write-role
    // fan-out (N>=2) still demotes the decision to ask.
    v = validatePlanFixture(tmp, [
      '| root | code-explorer | — | — | 1 | sequence |',
      '| i1 | tdd-guide | root | aaa/1.js | 1 | fanout(impl) |',
      '| i2 | tdd-guide | root | bbb/1.js | 1 | fanout(impl) |',
      '| i3 | tdd-guide | root | ccc/1.js | 1 | fanout(impl) |',
      '| i4 | tdd-guide | root | ddd/1.js | 1 | fanout(impl) |',
      '| i5 | tdd-guide | root | eee/1.js | 1 | fanout(impl) |',
      '| review | code-reviewer | i1,i2,i3,i4,i5 | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'in-grammar' && v.decision === 'ask',
      'B6 control (#303): over-cap single-origin write-role fan-out must be in-grammar + ask, got: ' + JSON.stringify(v));
    assert(v.diagnostics && Array.isArray(v.diagnostics.wideFanout) && v.diagnostics.wideFanout.some(w => w.width === 5),
      'B6 control (#303): over-cap fan-out must be recorded as a wideFanout diagnostic, got: ' + JSON.stringify(v.diagnostics));

    // CONTROL 2: a genuine single-origin fan-out whose members overlap (same coarse area) must
    // STILL refuse on disjointness — scoping must not drop the within-group disjointness check.
    v = validatePlanFixture(tmp, [
      '| root | code-explorer | — | — | 1 | sequence |',
      '| i1 | tdd-guide | root | api/x.js | 1 | fanout(impl) |',
      '| i2 | tdd-guide | root | api/y.js | 1 | fanout(impl) |',
      '| review | code-reviewer | i1,i2 | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'refuse',
      'B6 control: within-group non-disjoint single-origin fan-out must still refuse, got: ' + JSON.stringify(v));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptiveFanoutGroupScoping: PASSED');
}

// issue #232 (audit A3): write-disjointness extends from declared fanout() groups to any
// structurally-parallel write nodes that are CONCURRENT (antichain sharing a common ancestor).
// Verdict is deliberately weaker than the declared path: exact-file overlap refuses; coarse/shared
// overlap only demotes to ask. The binding false-refusal guard: independent branches (no common
// ancestor, sharing only the sink) are NOT flagged even with identical writes.
function testAdaptiveReadySetDisjointness() {
  const tmp = adaptiveTmp('readyset-disjoint');
  try {
    // GAP 1: two non-fanout tdd-guide siblings (same parent `explore`) writing the EXACT same file
    // must refuse — pre-#232 this passed because disjointness only ran on declared fanout() groups.
    let v = validatePlanFixture(tmp, [
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| a | tdd-guide | explore | lib/foo.js | 1 | sequence |',
      '| b | tdd-guide | explore | lib/foo.js | 1 | sequence |',
      '| review | code-reviewer | a,b | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'refuse' && /concurrent siblings/.test((v.errors || []).join(';')),
      'A3 gap: concurrent non-fanout siblings writing the same file must refuse, got: ' + JSON.stringify(v));

    // GAP 2: concurrent siblings with COARSE-AREA (not exact) overlap demote to ask, not refuse.
    v = validatePlanFixture(tmp, [
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| a | tdd-guide | explore | api/x.js | 1 | sequence |',
      '| b | tdd-guide | explore | api/y.js | 1 | sequence |',
      '| review | code-reviewer | a,b | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'in-grammar' && v.decision === 'ask',
      'A3 gap: concurrent siblings with coarse-area overlap must ask (not refuse), got: ' + JSON.stringify(v));

    // GAP 3 (v3.20.1, adversarial finding — was wrongly a "control" pre-3.20.1): two INDEPENDENT
    // branches (roots r1, r2 — NO common ancestor) writing the EXACT same file is a guaranteed
    // shared-worktree clobber (both are unordered, both land in the ready-set) and MUST refuse. The
    // exact-file check now fires for ANY antichain pair regardless of a common ancestor; this also
    // closes the #233-introduced regression (same-label fan-out members on independent branches).
    v = validatePlanFixture(tmp, [
      '| r1 | code-explorer | — | — | 1 | sequence |',
      '| r2 | code-explorer | — | — | 1 | sequence |',
      '| a | tdd-guide | r1 | lib/foo.js | 1 | sequence |',
      '| b | tdd-guide | r2 | lib/foo.js | 1 | sequence |',
      '| review | code-reviewer | a,b | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'refuse' && /both write/.test((v.errors || []).join(';')),
      'A3: independent-branch EXACT-file overlap is a clobber and must refuse, got: ' + JSON.stringify(v));

    // GAP 3b (same regression via the actual #233 vector): two same-label fan-out members on
    // independent branches writing the same exact file must also refuse (origin-scoping split them
    // into separate groups, so only the inferred-concurrency exact check catches this now).
    v = validatePlanFixture(tmp, [
      '| r1 | code-explorer | — | — | 1 | sequence |',
      '| r2 | code-explorer | — | — | 1 | sequence |',
      '| a | tdd-guide | r1 | src/foo.js | 1 | fanout(impl) |',
      '| b | tdd-guide | r2 | src/foo.js | 1 | fanout(impl) |',
      '| review | code-reviewer | a,b | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'refuse' && /both write/.test((v.errors || []).join(';')),
      'A3/#233: same-label fan-out members on independent branches writing the same file must refuse, got: ' + JSON.stringify(v));

    // CONTROL 1 (no-over-rotation guard): independent branches (no common ancestor) writing DIFFERENT
    // files in the same coarse area must STAY in-grammar — coarse-area overlap only asks when truly
    // concurrent (a shared ancestor); independent branches are NOT flagged on a mere area touch.
    v = validatePlanFixture(tmp, [
      '| r1 | code-explorer | — | — | 1 | sequence |',
      '| r2 | code-explorer | — | — | 1 | sequence |',
      '| a | tdd-guide | r1 | src/aaa.js | 1 | sequence |',
      '| b | tdd-guide | r2 | src/bbb.js | 1 | sequence |',
      '| review | code-reviewer | a,b | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'in-grammar',
      'A3 control: independent branches with different files in the same coarse area must stay in-grammar, got: ' + JSON.stringify(v));

    // CONTROL 2: disjoint concurrent siblings (different top-level areas) must still auto-run.
    v = validatePlanFixture(tmp, [
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| a | tdd-guide | explore | aaa/x.js | 1 | sequence |',
      '| b | tdd-guide | explore | bbb/y.js | 1 | sequence |',
      '| review | code-reviewer | a,b | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'in-grammar' && v.decision === 'auto-run',
      'A3 control: disjoint concurrent siblings must still auto-run, got: ' + JSON.stringify(v));

    // v3.21.0 (path canonicalization): `./lib/foo.js` and `lib/foo.js` are the SAME physical file —
    // a concurrent pair declaring them in those two spellings is still a clobber and must refuse
    // (normalizeRepoPath now strips leading `./` and collapses `//`). Adversarial finding vs v3.20.1.
    v = validatePlanFixture(tmp, [
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| a | tdd-guide | explore | ./lib/foo.js | 1 | sequence |',
      '| b | tdd-guide | explore | lib//foo.js | 1 | sequence |',
      '| review | code-reviewer | a,b | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'refuse' && /both write/.test((v.errors || []).join(';')),
      'path-canon: ./lib/foo.js vs lib//foo.js is the same file and must refuse as a clobber, got: ' + JSON.stringify(v));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptiveReadySetDisjointness: PASSED');
}

// issue #231 (audit H1/H3/H5/G1): the runtime gate barrier is now SCRIPT-enforced. Covers the two
// pure cores (verifyGateExecution over the ## Node Ledger; barrierCheck over actual writes), both
// CLI surfaces (--gate-verify, --barrier-check via a real git repo, fail-closed on git error), and
// the routeAdaptive NON-blocking wiring (pendingGates surfaced as data; resume still routes to plan-run).
function testAdaptiveGateBarrierEnforcement() {
  const tmp = adaptiveTmp('gate-barrier');
  const planValidator = require(planValidatorScript);
  const mkLedgerPlan = (nodes, ledger, labels) => ['# Plan', '', '## Meta', 'labels: ' + (labels || 'chore'), '', '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape |', '|---|---|---|---|---|---|']
    .concat(nodes).concat(['', '## Node Ledger', '', '| id | status |', '|---|---|']).concat(ledger).join('\n');
  try {
    // --- verifyGateExecution (G1/H5): a code-reviewer marked n/a while the impl it covers is
    // complete is an unsatisfied gate (the n/a-gate evasion). All-complete is ok.
    let gp = mkLedgerPlan(
      ['| impl | tdd-guide | — | lib/foo.js | 1 | sequence |', '| rv | code-reviewer | impl | — | 1 | sequence |', '| done | finalize | rv | — | 1 | sequence |'],
      ['| impl | complete |', '| rv | n/a |', '| done | complete |']);
    let g = planValidator.verifyGateExecution(gp, {});
    assert(g.ok === false && /G1/.test(g.unsatisfied.map(u => u.requirement).join(';')),
      'H5/G1: n/a code-reviewer over a complete impl must be unsatisfied, got: ' + JSON.stringify(g));
    g = planValidator.verifyGateExecution(mkLedgerPlan(
      ['| impl | tdd-guide | — | lib/foo.js | 1 | sequence |', '| rv | code-reviewer | impl | — | 1 | sequence |', '| done | finalize | rv | — | 1 | sequence |'],
      ['| impl | complete |', '| rv | complete |', '| done | complete |']), {});
    assert(g.ok === true, 'control: all-complete gates must verify ok, got: ' + JSON.stringify(g));

    // --- barrierCheck (H1/H3) pure cases over actual writes.
    // Realistic phase6 ledgers (every producing node complete) so these sensitivity/allowlist
    // assertions exercise (a)/(b) in isolation, not the v3.20.1 (c) ledger-consistency check.
    const noSec = mkLedgerPlan(['| impl | tdd-guide | — | lib/foo.js | 1 | sequence |', '| rv | code-reviewer | impl | — | 1 | sequence |', '| done | finalize | rv | — | 1 | sequence |'], ['| impl | complete |', '| rv | complete |', '| done | complete |'], 'refactor');
    assert(planValidator.barrierCheck(noSec, ['src/auth/session.js'], {}).result === 'refuse',
      'H1: sensitive actual write on a plan with no security-reviewer must refuse');
    const withSec = mkLedgerPlan(['| impl | tdd-guide | — | src/auth/session.js | 1 | sequence |', '| sec | security-reviewer | impl | — | 1 | sequence |', '| rv | code-reviewer | sec | — | 1 | sequence |', '| done | finalize | rv | — | 1 | sequence |'], ['| impl | complete |', '| sec | complete |', '| rv | complete |', '| done | complete |'], 'security');
    assert(planValidator.barrierCheck(withSec, ['src/auth/session.js'], {}).result === 'pass',
      'control: declared sensitive write WITH a security-reviewer must pass');
    assert(planValidator.barrierCheck(noSec, ['src/surprise.js'], {}).result === 'refuse',
      'H3: out-of-allowlist production write must refuse');
    assert(planValidator.barrierCheck(noSec, ['lib/foo.js', 'docs/x.md', 'CHANGELOG.md', 'test/foo.test.js', 'kaola-workflow/p/workflow-plan.md'], {}).result === 'pass',
      'control: declared + docs + tests + workflow-artifact writes must pass');

    // --- v3.20.1 Fix #2 (false-refusal): the sensitivity scan must EXEMPT docs / tests /
    // workflow-artifacts — a docs/test path whose NAME matches a Phase-5 pattern is not production
    // code and must NOT refuse even with no security-reviewer node.
    assert(planValidator.barrierCheck(noSec, ['test/login.test.js'], {}).result === 'pass',
      'Fix#2: a tests-only path matching a sensitive pattern must NOT refuse');
    assert(planValidator.barrierCheck(noSec, ['docs/auth.md'], {}).result === 'pass',
      'Fix#2: a docs-only path matching a sensitive pattern must NOT refuse');
    // control: a real PRODUCTION sensitive write with no security-reviewer still refuses.
    assert(planValidator.barrierCheck(noSec, ['src/auth/login.js'], {}).result === 'refuse',
      'Fix#2 control: a production sensitive write with no security-reviewer must still refuse');

    // --- v3.20.1 Fix #1 (CRITICAL — n/a/pending-TARGET gate bypass): whole-plan barrier-check must
    // refuse a production write declared ONLY by a non-complete node (the producer claims n/a while
    // its file was actually written -> unreviewed). Closes the symmetric hole the n/a-GATE fix missed.
    const naTargetSens = mkLedgerPlan(['| imp | tdd-guide | — | src/auth/session.js | 1 | sequence |', '| sec | security-reviewer | imp | — | 1 | sequence |', '| done | finalize | sec | — | 1 | sequence |'], ['| imp | n/a |', '| sec | n/a |', '| done | complete |'], 'security');
    assert(planValidator.barrierCheck(naTargetSens, ['src/auth/session.js'], {}).result === 'refuse',
      'Fix#1: a SENSITIVE write by an n/a producer (whole-plan) must refuse — the n/a-target bypass');
    const naTargetCode = mkLedgerPlan(['| imp | tdd-guide | — | src/feature.js | 1 | sequence |', '| rv | code-reviewer | imp | — | 1 | sequence |', '| done | finalize | rv | — | 1 | sequence |'], ['| imp | n/a |', '| rv | n/a |', '| done | complete |']);
    assert(planValidator.barrierCheck(naTargetCode, ['src/feature.js'], {}).result === 'refuse',
      'Fix#1: a code write by an n/a producer (whole-plan) must refuse');
    // no-false-refusal control: a genuinely-skipped n/a node that wrote NOTHING must pass (its file
    // is absent from the diff); the actually-written file is owned by a COMPLETE node.
    const naSkipClean = mkLedgerPlan(['| imp | tdd-guide | — | lib/foo.js | 1 | sequence |', '| extra | tdd-guide | — | src/optional.js | 1 | sequence |', '| rv | code-reviewer | imp,extra | — | 1 | sequence |', '| done | finalize | rv | — | 1 | sequence |'], ['| imp | complete |', '| extra | n/a |', '| rv | complete |', '| done | complete |']);
    assert(planValidator.barrierCheck(naSkipClean, ['lib/foo.js'], {}).result === 'pass',
      'Fix#1 control: a genuinely-skipped n/a node that wrote nothing must pass');
    // per-node mode must NOT trip the consistency check (the triggering node is still in_progress).
    assert(planValidator.barrierCheck(naTargetCode, ['src/feature.js'], { nodeId: 'imp' }).result === 'pass',
      'Fix#1 control: per-node barrier (nodeId) must not run the whole-plan ledger-consistency check');

    // --- --gate-verify CLI exit codes.
    const gvPlan = path.join(tmp, 'gv.md');
    fs.writeFileSync(gvPlan, mkLedgerPlan(['| impl | tdd-guide | — | lib/foo.js | 1 | sequence |', '| rv | code-reviewer | impl | — | 1 | sequence |', '| done | finalize | rv | — | 1 | sequence |'], ['| impl | complete |', '| rv | n/a |', '| done | complete |']));
    assert(runNode(planValidatorScript, [gvPlan, '--gate-verify', '--json'], tmp).status === 1, '--gate-verify must exit 1 on an unsatisfied gate');
    fs.writeFileSync(gvPlan, mkLedgerPlan(['| impl | tdd-guide | — | lib/foo.js | 1 | sequence |', '| rv | code-reviewer | impl | — | 1 | sequence |', '| done | finalize | rv | — | 1 | sequence |'], ['| impl | complete |', '| rv | complete |', '| done | complete |']));
    assert(runNode(planValidatorScript, [gvPlan, '--gate-verify', '--json'], tmp).status === 0, '--gate-verify must exit 0 when gates executed');

    // --- #334 G3 runtime gate execution (the regression scenario: impl complete, the
    // non-delegable main-session-gate incomplete -> finalize MUST be blocked).
    const g3Nodes = ['| impl | implementer | — | lib/foo.js | 1 | sequence |', '| rv | code-reviewer | impl | — | 1 | sequence |', '| vgate | main-session-gate | rv | — | 1 | sequence |', '| done | finalize | vgate | — | 1 | sequence |'];
    // (a) impl+rv complete, vgate PENDING -> G3 unsatisfied (a completed code node has no completed gate).
    let g3 = planValidator.verifyGateExecution(mkLedgerPlan(g3Nodes, ['| impl | complete |', '| rv | complete |', '| vgate | pending |', '| done | pending |']), {});
    assert(g3.ok === false && /G3/.test(g3.unsatisfied.map(u => u.requirement).join(';')),
      '#334 G3: impl complete + main-session-gate pending must be unsatisfied (the regression scenario), got: ' + JSON.stringify(g3));
    // (b) vgate marked n/a (the n/a-evasion) -> still unsatisfied, "cannot be skipped".
    g3 = planValidator.verifyGateExecution(mkLedgerPlan(g3Nodes, ['| impl | complete |', '| rv | complete |', '| vgate | n/a |', '| done | complete |']), {});
    assert(g3.ok === false && /cannot be skipped/.test(g3.unsatisfied.map(u => u.reason).join(';')),
      '#334 G3: a main-session-gate marked n/a is an unsatisfied gate (cannot be skipped), got: ' + JSON.stringify(g3));
    // (c) all complete -> G3 satisfied.
    g3 = planValidator.verifyGateExecution(mkLedgerPlan(g3Nodes, ['| impl | complete |', '| rv | complete |', '| vgate | complete |', '| done | complete |']), {});
    assert(g3.ok === true, '#334 G3 control: all-complete (gate too) must verify ok, got: ' + JSON.stringify(g3));

    // --- #334 --gate-verify + --verdict-check CLI exit codes over a project dir with a .cache.
    const g3Proj = path.join(tmp, 'kaola-workflow', 'issue-334');
    const g3Cache = path.join(g3Proj, '.cache');
    fs.mkdirSync(g3Cache, { recursive: true });
    const g3PlanPath = path.join(g3Proj, 'workflow-plan.md');
    // impl complete, gate PENDING -> --gate-verify exit 1 (finalize blocked).
    fs.writeFileSync(g3PlanPath, mkLedgerPlan(g3Nodes, ['| impl | complete |', '| rv | complete |', '| vgate | pending |', '| done | pending |']));
    assert(runNode(planValidatorScript, [g3PlanPath, '--gate-verify', '--json'], tmp).status === 1,
      '#334: --gate-verify must exit 1 when implementation is complete but the main-session-gate is incomplete');
    // gate n/a -> --gate-verify exit 1.
    fs.writeFileSync(g3PlanPath, mkLedgerPlan(g3Nodes, ['| impl | complete |', '| rv | complete |', '| vgate | n/a |', '| done | complete |']));
    assert(runNode(planValidatorScript, [g3PlanPath, '--gate-verify', '--json'], tmp).status === 1,
      '#334: --gate-verify must exit 1 when the main-session-gate is n/a (cannot be skipped)');
    // gate complete + valid .cache verdicts for BOTH gate nodes -> --gate-verify AND --verdict-check exit 0.
    fs.writeFileSync(g3PlanPath, mkLedgerPlan(g3Nodes, ['| impl | complete |', '| rv | complete |', '| vgate | complete |', '| done | complete |']));
    fs.writeFileSync(path.join(g3Cache, 'rv.md'), 'verdict: pass\nfindings_blocking: 0\nreviewed\n');
    fs.writeFileSync(path.join(g3Cache, 'vgate.md'), 'verdict: pass\nfindings_blocking: 0\nGPU true-black visual confirmation passed\n');
    assert(runNode(planValidatorScript, [g3PlanPath, '--gate-verify', '--json'], tmp).status === 0,
      '#334: --gate-verify must exit 0 when the main-session-gate is complete and post-dominates code');
    assert(runNode(planValidatorScript, [g3PlanPath, '--verdict-check', '--json'], tmp).status === 0,
      '#334: --verdict-check must exit 0 when the main-session-gate records verdict: pass');
    // gate complete but NO .cache verdict for the gate -> --verdict-check exit 1.
    fs.unlinkSync(path.join(g3Cache, 'vgate.md'));
    assert(runNode(planValidatorScript, [g3PlanPath, '--verdict-check', '--json'], tmp).status === 1,
      '#334: --verdict-check must exit 1 when the complete main-session-gate has no .cache verdict evidence');

    // --- --barrier-check CLI over a REAL git repo (verifies the merge-base git plumbing).
    const grepo = adaptiveTmp('barrier-git');
    try {
      initGitRepoWithBareRemote(grepo); // origin/main at the README commit
      const proj = path.join(grepo, 'kaola-workflow', 'issue-950');
      fs.mkdirSync(proj, { recursive: true });
      const planPath = path.join(proj, 'workflow-plan.md');
      fs.writeFileSync(planPath, [
        '# Workflow Plan — issue #950', '', '## Meta', 'labels: refactor', '', '## Nodes', '',
        '| id | role | depends_on | declared_write_set | cardinality | shape |', '|---|---|---|---|---|---|',
        '| impl | tdd-guide | — | lib/foo.js | 1 | sequence |',
        '| rv | code-reviewer | impl | — | 1 | sequence |',
        '| done | finalize | rv | — | 1 | sequence |', '',
        '## Node Ledger', '', '| id | status |', '|---|---|',
        '| impl | complete |', '| rv | complete |', '| done | complete |', ''].join('\n'));
      runNode(planValidatorScript, [planPath, '--freeze'], grepo);
      spawnSync('git', ['add', '-A'], { cwd: grepo, encoding: 'utf8' });
      spawnSync('git', ['commit', '-m', 'plan'], { cwd: grepo, encoding: 'utf8' });
      // Surprise sensitive write + a declared write, committed (cumulative diff vs origin/main base).
      fs.mkdirSync(path.join(grepo, 'src', 'auth'), { recursive: true });
      fs.writeFileSync(path.join(grepo, 'src', 'auth', 'session.js'), 'x\n');
      fs.mkdirSync(path.join(grepo, 'lib'), { recursive: true });
      fs.writeFileSync(path.join(grepo, 'lib', 'foo.js'), 'x\n');
      spawnSync('git', ['add', '-A'], { cwd: grepo, encoding: 'utf8' });
      spawnSync('git', ['commit', '-m', 'impl'], { cwd: grepo, encoding: 'utf8' });
      let r = runNode(planValidatorScript, [planPath, '--barrier-check', '--json'], grepo);
      assert(r.status === 1 && JSON.parse(r.stdout).result === 'refuse',
        '--barrier-check must refuse (exit 1) a surprise sensitive write, got status ' + r.status + ' ' + r.stdout);
      // Clean control: revert the surprise file; only the declared write remains.
      spawnSync('git', ['rm', '-q', 'src/auth/session.js'], { cwd: grepo, encoding: 'utf8' });
      spawnSync('git', ['commit', '-m', 'drop surprise'], { cwd: grepo, encoding: 'utf8' });
      r = runNode(planValidatorScript, [planPath, '--barrier-check', '--json'], grepo);
      assert(r.status === 0 && JSON.parse(r.stdout).result === 'pass',
        '--barrier-check must pass (exit 0) a clean run, got status ' + r.status + ' ' + r.stdout);
      // v3.20.1 Fix #1 END-TO-END (the exact adversarial repro): flip the producer `impl` to n/a in
      // the ledger while its declared file (lib/foo.js, committed) is in the diff -> whole-plan barrier
      // refuses. Pre-fix all three phase6 gates returned 0 and unreviewed code would merge.
      fs.writeFileSync(planPath, fs.readFileSync(planPath, 'utf8').replace('| impl | complete |', '| impl | n/a |'));
      spawnSync('git', ['add', '-A'], { cwd: grepo, encoding: 'utf8' });
      spawnSync('git', ['commit', '-m', 'ledger'], { cwd: grepo, encoding: 'utf8' });
      r = runNode(planValidatorScript, [planPath, '--barrier-check', '--json'], grepo);
      assert(r.status === 1 && JSON.parse(r.stdout).result === 'refuse',
        'Fix#1 end-to-end: an n/a producer whose declared file is in the git diff must refuse, got status ' + r.status + ' ' + r.stdout);
    } finally { fs.rmSync(grepo, { recursive: true, force: true }); fs.rmSync(grepo + '-remote', { recursive: true, force: true }); }

    // --- fail-closed: --barrier-check with no resolvable base (no origin/main) must NOT crash —
    // the git error becomes a typed refusal (exit 1).
    const norepo = adaptiveTmp('barrier-nogit');
    try {
      initGitRepo(norepo); // local repo, NO origin remote
      const np = path.join(norepo, 'workflow-plan.md');
      fs.writeFileSync(np, noSec);
      const r = runNode(planValidatorScript, [np, '--barrier-check', '--json'], norepo);
      assert(r.status === 1, 'fail-closed: --barrier-check with no origin/main must exit 1 (typed refusal), got ' + r.status);
    } finally { fs.rmSync(norepo, { recursive: true, force: true }); }

    // --- routeAdaptive NON-blocking: a frozen plan whose ledger leaves a gate n/a surfaces
    // pendingGates as DATA but STILL resumes to plan-run (mid-run a gate is legitimately pending —
    // blocking here would brick every in-flight resume; the hard block is phase6).
    plantFrozenPlan(tmp, 'issue-951', mkLedgerPlan(
      ['| impl | tdd-guide | — | lib/foo.js | 1 | sequence |', '| rv | code-reviewer | impl | — | 1 | sequence |', '| done | finalize | rv | — | 1 | sequence |'],
      ['| impl | complete |', '| rv | n/a |', '| done | complete |']));
    const repaired = runNode(repairScript, ['issue-951'], tmp);
    assert(repaired.status === 0, 'routeAdaptive: pending gate must NOT block resume (exit 0), got ' + repaired.status + ' ' + repaired.stderr);
    assert(repaired.stdout.includes('/kaola-workflow-plan-run issue-951'), 'routeAdaptive: must still route to plan-run with a pending gate');
    const st = read(statePath(tmp, 'issue-951'));
    assert(/## Pending Gates[\s\S]*G1 gate execution/.test(st), 'routeAdaptive: must SURFACE the pending gate as data, got:\n' + st);

    // --- routeAdaptive verdict-check surface (#258): a frozen plan with a COMPLETE code-reviewer
    // node whose .cache verdict file is MISSING surfaces a "verdict gate <id>" entry in pendingGates
    // NON-blocking (exit 0, still routes to plan-run). Uses all-complete ledger so G1 contributes
    // nothing; isolation is clean.
    plantFrozenPlan(tmp, 'issue-952', mkLedgerPlan(
      ['| impl | tdd-guide | — | lib/foo.js | 1 | sequence |', '| rv | code-reviewer | impl | — | 1 | sequence |', '| done | finalize | rv | — | 1 | sequence |'],
      ['| impl | complete |', '| rv | complete |', '| done | complete |']));
    // no .cache/rv.md written — verdict evidence is missing
    const vRepaired = runNode(repairScript, ['issue-952'], tmp);
    assert(vRepaired.status === 0, 'verdict-check: missing verdict must NOT block resume (exit 0), got ' + vRepaired.status + ' ' + vRepaired.stderr);
    assert(vRepaired.stdout.includes('/kaola-workflow-plan-run issue-952'), 'verdict-check: must still route to plan-run, got: ' + vRepaired.stdout);
    const vSt = read(statePath(tmp, 'issue-952'));
    assert(/## Pending Gates[\s\S]*verdict gate rv/.test(vSt), 'verdict-check: ## Pending Gates must contain "verdict gate rv", got:\n' + vSt);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptiveGateBarrierEnforcement: PASSED');
}

// issue #239: per-instance fan-out barrier. The per-node barrier checks the node's ACTUAL writes
// (diffed vs its step-1 recorded baseline) against the node's OWN declared lane, so a fan-out
// instance overflowing into a sibling's lane refuses — which the union (whole-plan) check could not
// see. The whole-plan barrier remains the union-level floor.
function testAdaptivePerInstanceBarrier() {
  const tmp = adaptiveTmp('per-instance');
  const planValidator = require(planValidatorScript);
  const mkPlan = () => ['# Workflow Plan — issue #970', '', '## Meta', 'labels: enhancement', '', '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape |', '|---|---|---|---|---|---|',
    '| ex | code-explorer | — | — | 1 | sequence |',
    '| a | tdd-guide | ex | aaa/x.js | 1 | fanout(impl) |',
    '| b | tdd-guide | ex | bbb/y.js | 1 | fanout(impl) |',
    '| rv | code-reviewer | a,b | — | 1 | sequence |',
    '| done | finalize | rv | — | 1 | sequence |', '',
    '## Node Ledger', '', '| id | status |', '|---|---|',
    '| ex | complete |', '| a | complete |', '| b | complete |', '| rv | complete |', '| done | complete |', ''].join('\n');
  try {
    // --- PURE: per-node allowlist = the node's OWN declared write set (vs union for whole-plan).
    const plan = mkPlan();
    assert(planValidator.barrierCheck(plan, ['aaa/x.js', 'bbb/y.js'], { nodeId: 'a' }).result === 'refuse',
      '#239: node a writing into sibling b lane (bbb/y.js) must refuse (own-lane allowlist)');
    assert(planValidator.barrierCheck(plan, ['aaa/x.js'], { nodeId: 'a' }).result === 'pass',
      '#239 control: node a writing only its own lane must pass');
    assert(planValidator.barrierCheck(plan, ['aaa/x.js', 'bbb/y.js'], {}).result === 'pass',
      '#239 control: whole-plan union still accepts both declared lanes');

    // --- CLI integration over a real git repo: --record-base then per-node --barrier-check.
    const grepo = adaptiveTmp('per-instance-git');
    try {
      initGitRepoWithBareRemote(grepo);
      const proj = path.join(grepo, 'kaola-workflow', 'issue-970');
      fs.mkdirSync(proj, { recursive: true });
      const planPath = path.join(proj, 'workflow-plan.md');
      fs.writeFileSync(planPath, mkPlan());
      runNode(planValidatorScript, [planPath, '--freeze'], grepo);
      spawnSync('git', ['add', '-A'], { cwd: grepo, encoding: 'utf8' });
      spawnSync('git', ['commit', '-m', 'plan'], { cwd: grepo, encoding: 'utf8' });
      // node a starts -> record its baseline (resume-safe, persisted in .cache).
      const rb = runNode(planValidatorScript, [planPath, '--record-base', '--node-id', 'a'], grepo);
      assert(rb.status === 0, '--record-base must exit 0, got ' + rb.status + ' ' + rb.stderr);
      assert(fs.existsSync(path.join(proj, '.cache', 'barrier-base-a')), '--record-base must persist a .cache base');
      // node a OVERFLOWS: writes its own lane AND sibling b's lane (untracked new files).
      fs.mkdirSync(path.join(grepo, 'aaa'), { recursive: true }); fs.writeFileSync(path.join(grepo, 'aaa', 'x.js'), 'x\n');
      fs.mkdirSync(path.join(grepo, 'bbb'), { recursive: true }); fs.writeFileSync(path.join(grepo, 'bbb', 'y.js'), 'y\n');
      let r = runNode(planValidatorScript, [planPath, '--barrier-check', '--node-id', 'a', '--json'], grepo);
      assert(r.status === 1 && JSON.parse(r.stdout).result === 'refuse',
        '#239 CLI: node a overflowing into b lane must refuse, got status ' + r.status + ' ' + r.stdout);
      assert(/bbb\/y\.js/.test(r.stdout), '#239: the refusal must name the out-of-lane write, got ' + r.stdout);
      // control: drop the overflow; only the own-lane write remains -> pass.
      fs.rmSync(path.join(grepo, 'bbb', 'y.js'));
      r = runNode(planValidatorScript, [planPath, '--barrier-check', '--node-id', 'a', '--json'], grepo);
      assert(r.status === 0 && JSON.parse(r.stdout).result === 'pass',
        '#239 CLI control: node a in its own lane must pass, got status ' + r.status + ' ' + r.stdout);
      // missing recorded base -> fail closed (no silent pass).
      assert(runNode(planValidatorScript, [planPath, '--barrier-check', '--node-id', 'b', '--json'], grepo).status === 1,
        '#239: per-node barrier with no recorded base must fail closed');
      // robustness: a present-but-empty --node-id is rejected, not silently degraded to whole-plan.
      assert(runNode(planValidatorScript, [planPath, '--barrier-check', '--node-id', '', '--json'], grepo).status === 1,
        '#239: empty --node-id must be rejected');
    } finally { fs.rmSync(grepo, { recursive: true, force: true }); fs.rmSync(grepo + '-remote', { recursive: true, force: true }); }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptivePerInstanceBarrier: PASSED');
}

// v3.21.0 (pre-release adversarial-gate fixes): the per-node barrier must attribute EXACTLY this
// node's own writes via a worktree TREE-DIFF — not `git ls-files --others`, which over-attributed
// every stray / prior-node still-untracked file and bricked real multi-node runs (the executor
// commits only workflow artifacts, so source stays untracked all run). It must also reject a --base
// override, keep the sensitivity teeth in per-node mode, and REUSE a recorded base on re-dispatch
// (resume-safe). Each scenario starts from a fresh real git repo so the prod logic — not a fixture
// artifact — decides the verdict; every assertion flips if the corresponding prod line is reverted.
function testAdaptivePerInstanceBarrierHardening() {
  const PLAN = ['# Workflow Plan — issue #971', '', '## Meta', 'labels: enhancement', '', '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape |', '|---|---|---|---|---|---|',
    '| ex | code-explorer | — | — | 1 | sequence |',
    '| a | tdd-guide | ex | aaa/x.js | 1 | fanout(impl) |',
    '| b | tdd-guide | ex | bbb/y.js | 1 | fanout(impl) |',
    '| rv | code-reviewer | a,b | — | 1 | sequence |',
    '| done | finalize | rv | — | 1 | sequence |', '',
    '## Node Ledger', '', '| id | status |', '|---|---|',
    '| ex | complete |', '| a | complete |', '| b | complete |', '| rv | complete |', '| done | complete |', ''].join('\n');
  // a sensitive file declared IN node a's own lane (no security-reviewer) — left UNFROZEN on purpose
  // (the validator would refuse to freeze a sensitive lane with no security-reviewer; the barrier only
  // needs a parseable ## Nodes table, so the sensitivity teeth can be exercised in isolation).
  const SENS_PLAN = ['# Workflow Plan — issue #972', '', '## Meta', 'labels: enhancement', '', '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape |', '|---|---|---|---|---|---|',
    '| ex | code-explorer | — | — | 1 | sequence |',
    '| a | tdd-guide | ex | src/auth/session.js | 1 | sequence |',
    '| rv | code-reviewer | a | — | 1 | sequence |',
    '| done | finalize | rv | — | 1 | sequence |', '',
    '## Node Ledger', '', '| id | status |', '|---|---|',
    '| ex | complete |', '| a | complete |', '| rv | complete |', '| done | complete |', ''].join('\n');
  const mkRepo = (plan, freeze) => {
    const grepo = adaptiveTmp('barrier-hardening-git');
    initGitRepoWithBareRemote(grepo);
    const proj = path.join(grepo, 'kaola-workflow', 'issue-971');
    fs.mkdirSync(proj, { recursive: true });
    const planPath = path.join(proj, 'workflow-plan.md');
    fs.writeFileSync(planPath, plan);
    if (freeze) {
      const fr = runNode(planValidatorScript, [planPath, '--freeze'], grepo);
      assert(fr.status === 0, 'mkRepo --freeze should exit 0, got ' + fr.status + ' ' + fr.stderr);
      // #389: the freeze write routes through writeFileAtomicReplace (tmp + fsync + rename), so it
      // leaves NO `.workflow-plan.md.*.tmp` sidecar behind after a clean rename. A surviving sidecar
      // (the old bare fs.writeFileSync, or a torn rename) would be caught here.
      const sidecars = fs.readdirSync(proj).filter(f => /^\.workflow-plan\.md\..*\.tmp$/.test(f));
      assert(sidecars.length === 0, '#389: --freeze must leave no .tmp sidecar (atomic replace), got ' + JSON.stringify(sidecars));
    }
    spawnSync('git', ['add', '-A'], { cwd: grepo, encoding: 'utf8' });
    spawnSync('git', ['commit', '-m', 'plan'], { cwd: grepo, encoding: 'utf8' });
    return { grepo, planPath };
  };
  const cleanup = g => { fs.rmSync(g, { recursive: true, force: true }); fs.rmSync(g + '-remote', { recursive: true, force: true }); };
  const w = (g, rel, content) => { const p = path.join(g, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content); };
  const bc = (planPath, id, grepo, extra) => runNode(planValidatorScript, [planPath, '--barrier-check', '--node-id', id, ...(extra || []), '--json'], grepo);
  const rec = (planPath, id, grepo) => runNode(planValidatorScript, [planPath, '--record-base', '--node-id', id, '--json'], grepo);

  // (1) OVER-ATTRIBUTION, Trigger B (finding 6): a pre-existing stray untracked file present at base
  // must NOT be attributed to the node. Old `git ls-files --others` refused; the tree-diff passes.
  { const { grepo, planPath } = mkRepo(PLAN, true);
    try {
      w(grepo, 'stray/leftover.js', 'stray\n');
      assert(rec(planPath, 'a', grepo).status === 0, '(1) record-base a');
      w(grepo, 'aaa/x.js', 'x\n');
      const r = bc(planPath, 'a', grepo);
      assert(r.status === 0 && JSON.parse(r.stdout).result === 'pass',
        'v3.21.0 (1): a pre-existing stray untracked file must NOT be attributed to the node, got ' + r.stdout);
    } finally { cleanup(grepo); } }

  // (2) OVER-ATTRIBUTION, Trigger A (finding 6): node b must NOT be refused for node a's still-
  // untracked source (the executor commits only workflow artifacts, so a's source stays untracked).
  { const { grepo, planPath } = mkRepo(PLAN, true);
    try {
      assert(rec(planPath, 'a', grepo).status === 0, '(2) record-base a');
      w(grepo, 'aaa/x.js', 'x\n');
      assert(JSON.parse(bc(planPath, 'a', grepo).stdout).result === 'pass', '(2) node a own lane passes');
      assert(rec(planPath, 'b', grepo).status === 0, '(2) record-base b');
      w(grepo, 'bbb/y.js', 'y\n');
      const r = bc(planPath, 'b', grepo);
      assert(r.status === 0 && JSON.parse(r.stdout).result === 'pass',
        'v3.21.0 (2): node b must NOT be refused for node a\'s still-untracked source, got ' + r.stdout);
    } finally { cleanup(grepo); } }

  // (3) a COMMITTED out-of-lane write is still caught (tree-diff sees tracked changes too).
  { const { grepo, planPath } = mkRepo(PLAN, true);
    try {
      assert(rec(planPath, 'a', grepo).status === 0, '(3) record-base a');
      w(grepo, 'ccc/z.js', 'z\n');
      spawnSync('git', ['add', '-A'], { cwd: grepo, encoding: 'utf8' });
      spawnSync('git', ['commit', '-m', 'oops'], { cwd: grepo, encoding: 'utf8' });
      const r = bc(planPath, 'a', grepo);
      assert(r.status === 1 && /ccc\/z\.js/.test(r.stdout),
        'v3.21.0 (3): a COMMITTED out-of-lane write must still refuse, got ' + r.stdout);
    } finally { cleanup(grepo); } }

  // (4) per-node SENSITIVITY teeth (finding 5): an actual sensitive write on a plan with no
  // security-reviewer must surface the G2/security-reviewer refusal in per-node mode.
  { const { grepo, planPath } = mkRepo(SENS_PLAN, false);
    try {
      assert(rec(planPath, 'a', grepo).status === 0, '(4) record-base a');
      w(grepo, 'src/auth/session.js', 'token\n');
      const r = bc(planPath, 'a', grepo);
      assert(r.status === 1 && /security-reviewer/.test(r.stdout),
        'v3.21.0 (4): the sensitivity teeth must fire in per-node mode (no security-reviewer), got ' + r.stdout);
    } finally { cleanup(grepo); } }

  // (5) --base is REJECTED per-node (finding 3): otherwise `--base HEAD` after a commit empties the
  // diff and neuters the gate. The overflow into bbb is real; --base must still refuse on the flag.
  { const { grepo, planPath } = mkRepo(PLAN, true);
    try {
      assert(rec(planPath, 'a', grepo).status === 0, '(5) record-base a');
      w(grepo, 'bbb/y.js', 'y\n');
      const r = bc(planPath, 'a', grepo, ['--base', 'HEAD']);
      assert(r.status === 1 && /--base/.test(r.stdout),
        'v3.21.0 (5): --base must be rejected with --node-id (cannot neuter the per-node gate), got ' + r.stdout);
    } finally { cleanup(grepo); } }

  // (6) record-base is IDEMPOTENT (critic-2): a re-dispatch must REUSE the original baseline, so a
  // crashed attempt's overflow stays visible instead of being laundered into a fresh base.
  { const { grepo, planPath } = mkRepo(PLAN, true);
    try {
      assert(rec(planPath, 'a', grepo).status === 0, '(6) record-base a (first)');
      w(grepo, 'bbb/y.js', 'y\n');                     // a "crashed attempt" overflow before re-record
      const rb2 = rec(planPath, 'a', grepo);
      assert(rb2.status === 0 && JSON.parse(rb2.stdout).reused === true,
        'v3.21.0 (6): a second --record-base must REUSE the baseline (resume-safe), got ' + rb2.stdout);
      w(grepo, 'aaa/x.js', 'x\n');
      const r = bc(planPath, 'a', grepo);
      assert(r.status === 1 && /bbb\/y\.js/.test(r.stdout),
        'v3.21.0 (6): re-record must NOT launder a crashed attempt\'s overflow, got ' + r.stdout);
    } finally { cleanup(grepo); } }

  // (7) --record-base requires --node-id (finding 11).
  { const { grepo, planPath } = mkRepo(PLAN, true);
    try {
      assert(runNode(planValidatorScript, [planPath, '--record-base', '--json'], grepo).status === 1,
        'v3.21.0 (7): --record-base without --node-id must refuse');
    } finally { cleanup(grepo); } }

  // (8) LANDABLE SCOPE (re-gate #2): a write under a .gitignored path is OUT OF SCOPE and must NOT be
  // attributed to the node — it never lands (the sink stages explicit/approved paths, never `git add
  // -f`) and the whole-plan Phase-6 gate (committed-only `git diff`) cannot see it either, so the
  // per-node barrier scopes to the same landable set (parity with the merge gate). This pins the
  // boundary: snapshot uses `git add -A` (honors .gitignore), NOT `-Af` (which would attribute
  // test-run artifacts like coverage/ and brick normal runs).
  { const { grepo, planPath } = mkRepo(PLAN, true);
    try {
      w(grepo, '.gitignore', 'dist/\n');
      spawnSync('git', ['add', '-A'], { cwd: grepo, encoding: 'utf8' });
      spawnSync('git', ['commit', '-m', 'gitignore'], { cwd: grepo, encoding: 'utf8' });
      assert(rec(planPath, 'a', grepo).status === 0, '(8) record-base a');
      w(grepo, 'aaa/x.js', 'x\n');                // own lane (landable)
      w(grepo, 'dist/bundle.js', 'gen\n');        // UNTRACKED gitignored generated artifact (never lands)
      const r = bc(planPath, 'a', grepo);
      assert(r.status === 0 && JSON.parse(r.stdout).result === 'pass',
        'v3.21.0 (8): an UNTRACKED write under a .gitignored path is out of scope and must NOT be attributed (landable-scope parity with the merge gate), got ' + r.stdout);
    } finally { cleanup(grepo); } }

  // (9) TRACKED-but-gitignored landable write (re-gate #3): a file committed THEN added to .gitignore
  // STAYS tracked and WILL merge, so a node modifying it out-of-lane must be caught. The read-tree-HEAD
  // seed in snapshotWorktree includes it; the old bare empty-index `add -A` dropped it (fail-open).
  { const { grepo, planPath } = mkRepo(PLAN, true);
    try {
      w(grepo, 'bbb/y.js', 'orig\n');                          // node b's declared lane
      spawnSync('git', ['add', '-A'], { cwd: grepo, encoding: 'utf8' });
      spawnSync('git', ['commit', '-m', 'track bbb'], { cwd: grepo, encoding: 'utf8' }); // now TRACKED
      w(grepo, '.gitignore', 'bbb/\n');
      spawnSync('git', ['add', '-A'], { cwd: grepo, encoding: 'utf8' });
      spawnSync('git', ['commit', '-m', 'ignore bbb'], { cwd: grepo, encoding: 'utf8' }); // gitignored but still tracked
      assert(rec(planPath, 'a', grepo).status === 0, '(9) record-base a');
      w(grepo, 'aaa/x.js', 'x\n');                             // own lane
      w(grepo, 'bbb/y.js', 'orig\noverflow\n');                // modify tracked-but-gitignored SIBLING lane
      const r = bc(planPath, 'a', grepo);
      assert(r.status === 1 && /bbb\/y\.js/.test(r.stdout),
        'v3.21.0 (9): a tracked-but-gitignored out-of-lane modification (landable) must refuse, got ' + r.stdout);
    } finally { cleanup(grepo); } }

  // (10) gc-survival (re-gate #3): the recorded base is ref-anchored (refs/kaola-workflow/barrier/...),
  // so `git gc --prune=now` between node start and the barrier does NOT prune it and brick the node.
  // The prior uncommitted file makes the base tree genuinely unreachable except via the ref.
  { const { grepo, planPath } = mkRepo(PLAN, true);
    try {
      w(grepo, 'prior/uncommitted.js', 'leftover\n');          // prior node's uncommitted source
      assert(rec(planPath, 'a', grepo).status === 0, '(10) record-base a');
      w(grepo, 'aaa/x.js', 'x\n');                             // own lane only
      spawnSync('git', ['gc', '--prune=now'], { cwd: grepo, encoding: 'utf8' });
      const r = bc(planPath, 'a', grepo);
      assert(r.status === 0 && JSON.parse(r.stdout).result === 'pass',
        'v3.21.0 (10): the ref-anchored base must survive `git gc --prune=now` (no brick), got status ' + r.status + ' ' + r.stdout);
    } finally { cleanup(grepo); } }

  // (11) #385 FRESHNESS TOKEN — STALE branch: record node a's base at T0, then an UNRELATED tracked
  // commit lands (a serial write node's legitimate work) advancing HEAD, then re-record a. The reuse
  // must REUSE the original base (idempotent) AND flag it stale:true, staleReason:head_advanced — the
  // #281/#296 trap where a rolled-back node's surviving baseline silently absorbs foreign writes.
  { const { grepo, planPath } = mkRepo(PLAN, true);
    try {
      assert(rec(planPath, 'a', grepo).status === 0, '(11) record-base a @ T0');
      w(grepo, 'unrelated/serial.js', 'serial work\n');     // a DIFFERENT node's legitimate landed work
      spawnSync('git', ['add', '-A'], { cwd: grepo, encoding: 'utf8' });
      spawnSync('git', ['commit', '-m', 'unrelated serial commit'], { cwd: grepo, encoding: 'utf8' }); // HEAD advances
      const rb = rec(planPath, 'a', grepo);
      const parsed = JSON.parse(rb.stdout);
      assert(rb.status === 0 && parsed.reused === true, '#385 (11): re-record must still REUSE the base (idempotent), got ' + rb.stdout);
      assert(parsed.stale === true && parsed.staleReason === 'head_advanced',
        '#385 (11): a baseline whose HEAD advanced since record must flag stale:true,head_advanced (WARN), got ' + rb.stdout);
      assert(parsed.recordedHead && parsed.currentHead && parsed.recordedHead !== parsed.currentHead,
        '#385 (11): the stale warning must carry recordedHead !== currentHead, got ' + rb.stdout);
    } finally { cleanup(grepo); } }

  // (12) #385 NO false-positive: a re-record with NO intervening commit (same HEAD) is NOT stale —
  // the legitimate idempotent crash re-dispatch must stay quiet (refusing/flagging it would brick it).
  { const { grepo, planPath } = mkRepo(PLAN, true);
    try {
      assert(rec(planPath, 'a', grepo).status === 0, '(12) record-base a');
      w(grepo, 'aaa/x.js', 'x\n');                          // own-lane UNCOMMITTED work (HEAD unchanged)
      const rb = rec(planPath, 'a', grepo);
      const parsed = JSON.parse(rb.stdout);
      assert(rb.status === 0 && parsed.reused === true && parsed.stale === undefined,
        '#385 (12): a same-HEAD re-dispatch must REUSE without a stale flag, got ' + rb.stdout);
    } finally { cleanup(grepo); } }

  // (13) #385 SEAM — --drop-base removes BOTH the baseline file (barrier-base-<id>) and the freshness
  // token (barrier-open-<id>), so a fresh re-record after a rollback re-stamps the open-HEAD cleanly.
  { const { grepo, planPath } = mkRepo(PLAN, true);
    try {
      assert(rec(planPath, 'a', grepo).status === 0, '(13) record-base a');
      const cacheDir = path.join(path.dirname(planPath), '.cache');
      assert(fs.existsSync(path.join(cacheDir, 'barrier-base-a')), '#385 (13): barrier-base-a exists after record');
      assert(fs.existsSync(path.join(cacheDir, 'barrier-open-a')), '#385 (13): barrier-open-a (freshness token) exists after record');
      const dr = runNode(planValidatorScript, [planPath, '--drop-base', '--node-id', 'a', '--json'], grepo);
      assert(dr.status === 0, '#385 (13): --drop-base exits 0, got ' + dr.status + ' ' + dr.stderr);
      assert(!fs.existsSync(path.join(cacheDir, 'barrier-base-a')), '#385 (13): --drop-base removes barrier-base-a');
      assert(!fs.existsSync(path.join(cacheDir, 'barrier-open-a')), '#385 (13): --drop-base ALSO removes barrier-open-a (the freshness token)');
    } finally { cleanup(grepo); } }

  console.log('testAdaptivePerInstanceBarrierHardening: PASSED');
}

// issue #234 E1: resume must reconcile a persisted next_command against the project's true path
// before trusting it. A stale phaseN on an adaptive project must resolve to plan-run; a consistent
// full next_command is preserved; a stale full next_command falls back to phase-derived reconstruction.
function testAdaptiveResumeReconcilesNextCommand() {
  const tmp = adaptiveTmp('resume-reconcile');
  try {
    // GAP: adaptive project carrying a STALE `/kaola-workflow-phase4` next_command. Toggle OFF to
    // prove reconciliation is toggle-agnostic (resume must work even when the switch is later OFF).
    writeProject(tmp, 'issue-940', { 'workflow-state.md': [
      'name: issue-940', 'issue_number: 940', 'status: active',
      'phase: adaptive', 'workflow_path: adaptive',
      'next_command: /kaola-workflow-phase4 issue-940', ''].join('\n') });
    let out = JSON.parse(runNode(claimScript, ['resume', '--project', 'issue-940'], tmp, { KAOLA_ENABLE_ADAPTIVE: '0' }).stdout);
    assert(out.next_command === '/kaola-workflow-plan-run issue-940',
      'E1: stale phaseN on an adaptive project must reconcile to plan-run, got: ' + out.next_command);

    // CONTROL: a full project whose persisted next_command matches its phase is PRESERVED.
    writeProject(tmp, 'issue-941', { 'workflow-state.md': [
      'name: issue-941', 'issue_number: 941', 'status: active',
      'phase: 3', 'workflow_path: full', 'next_command: /kaola-workflow-phase3 issue-941', ''].join('\n') });
    out = JSON.parse(runNode(claimScript, ['resume', '--project', 'issue-941'], tmp).stdout);
    assert(out.next_command === '/kaola-workflow-phase3 issue-941',
      'E1 control: a consistent full next_command must be preserved, got: ' + out.next_command);

    // CONTROL (regression guard): a full project's next_command legitimately points FORWARD of the
    // `phase:` field (e.g. phase5 complete writes phase: 5 + next_command: /kaola-workflow-finalize).
    // The non-adaptive path must PRESERVE it — reconciliation must not override it back to the
    // phase-field-derived command. (#234 must not regress the phaseN->Finalization transition resume.)
    writeProject(tmp, 'issue-942', { 'workflow-state.md': [
      'name: issue-942', 'issue_number: 942', 'status: active',
      'phase: 5', 'workflow_path: full', 'next_command: /kaola-workflow-finalize issue-942', ''].join('\n') });
    out = JSON.parse(runNode(claimScript, ['resume', '--project', 'issue-942'], tmp).stdout);
    assert(out.next_command === '/kaola-workflow-finalize issue-942',
      'E1 regression guard: a forward-pointing full next_command must be preserved, got: ' + out.next_command);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptiveResumeReconcilesNextCommand: PASSED');
}

// issue #234 E2: a barrier consent-halt is durable in the plan's NON-hashed `## Node Ledger`, so a
// lost/regenerated workflow-state.md cannot silently drop it. Heading-scoped (a decoy elsewhere is
// inert) and outside the plan_hash region (appending it never breaks resume-check).
function testAdaptiveDurableConsentHalt() {
  const tmp = adaptiveTmp('durable-consent');
  const planValidator = require(planValidatorScript);
  const adaptiveSchema = require(path.join(repoRoot, 'scripts', 'kaola-workflow-adaptive-schema.js'));
  try {
    // unit: the reader is heading-scoped.
    const base = ['# Plan', '', '## Meta', 'labels: chore', '', '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape |', '|---|---|---|---|---|---|',
      '| done | finalize | — | — | 1 | sequence |', '',
      '## Node Ledger', '', '| id | status |', '|---|---|', '| done | pending |', ''];
    assert(adaptiveSchema.readDurableConsentHalt(['# Plan', 'consent_halt: pending', ''].concat(base.slice(1)).join('\n')) === false,
      'E2: a decoy consent_halt OUTSIDE the Node Ledger must NOT trigger');
    assert(adaptiveSchema.readDurableConsentHalt(base.join('\n') + 'consent_halt: pending\n') === true,
      'E2: consent_halt INSIDE the Node Ledger must trigger');

    // constraint-3: appending the marker to the Node Ledger after freeze must NOT break resume-check
    // (computePlanHash covers ## Meta + ## Nodes only).
    const frozen = planValidator.freezePlan(base.join('\n'));
    assert(frozen.frozen, 'E2: base plan should freeze');
    assert(planValidator.revalidateForResume(frozen.content.trimEnd() + '\nconsent_halt: pending\n').ok === true,
      'E2 constraint-3: appending consent_halt to the Node Ledger must NOT break resume-check');

    // integration: a frozen plan with the durable marker and NO workflow-state.md still surfaces the
    // consent-halt on resume (the lost-state scenario the primary signal cannot cover).
    plantFrozenPlan(tmp, 'issue-943', base.join('\n').replace('| done | pending |', '| done | pending |\nconsent_halt: pending'));
    const sp = statePath(tmp, 'issue-943');
    if (fs.existsSync(sp)) fs.rmSync(sp);
    const result = runNode(repairScript, ['issue-943'], tmp);
    assert(result.status === 0, 'E2: repair must exit 0, got ' + result.status + ' ' + result.stderr);
    assert(result.stdout.includes('/kaola-workflow-plan-run issue-943'), 'E2: must still route to plan-run');
    assert(read(statePath(tmp, 'issue-943')).includes('consent-halt-surface'),
      'E2: durable Node-Ledger consent must surface even with no prior workflow-state.md');

    // E2 INTACT-STATE durability (v3.20.1 — the suite previously only covered the deleted-state
    // path): a `claim resume` on an intact adaptive project must NOT clobber the durable Node-Ledger
    // marker, so the plan-run executor can re-read it (the steady-state backstop for the surfacing
    // that repair-state's intact-state early-return does not itself re-emit).
    plantFrozenPlan(tmp, 'issue-944', base.join('\n').replace('| done | pending |', '| done | pending |\nconsent_halt: pending'));
    fs.writeFileSync(statePath(tmp, 'issue-944'), ['name: issue-944', 'issue_number: 944', 'status: active',
      'phase: adaptive', 'workflow_path: adaptive', 'next_command: /kaola-workflow-plan-run issue-944',
      'escalated_to_full: consent', ''].join('\n'));
    runNode(claimScript, ['resume', '--project', 'issue-944'], tmp);
    assert(adaptiveSchema.readDurableConsentHalt(read(path.join(tmp, 'kaola-workflow', 'issue-944', 'workflow-plan.md'))) === true,
      'E2: an intact-state resume must NOT clobber the durable consent marker (executor re-reads it)');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptiveDurableConsentHalt: PASSED');
}

// issue #235 (audit D8): a HARD script guard at the /kaola-workflow-adapt authoring entry. OFF ->
// typed refusal; ON -> allowed. The validator stays toggle-agnostic: --freeze must still work under
// OFF (the guard lives at the authoring entry in claim.js, never in the validator).
function testAdaptiveAuthoringEntryGuard() {
  const tmp = adaptiveTmp('authoring-guard');
  try {
    let out = JSON.parse(runNode(claimScript, ['authoring-allowed', '--project', 'issue-960'], tmp, { KAOLA_ENABLE_ADAPTIVE: '0' }).stdout);
    assert(out.status === 'authoring_refused' && out.allowed === false,
      'D8: authoring under an OFF switch must be a typed refusal, got: ' + JSON.stringify(out));
    assert(/OFF/.test(out.reasoning) && /#44/.test(out.reasoning),
      'D8: the refusal must mirror the claim-guard family message (OFF, #44)');
    out = JSON.parse(runNode(claimScript, ['authoring-allowed', '--project', 'issue-960'], tmp, { KAOLA_ENABLE_ADAPTIVE: '1' }).stdout);
    assert(out.status === 'authoring_allowed' && out.allowed === true,
      'D8: authoring under an ON switch must be allowed, got: ' + JSON.stringify(out));
    // toggle-agnostic: the validator --freeze must STILL work under OFF — the guard is the authoring
    // entry, NOT the validator (putting it in the validator would break the resume/well-formedness contract).
    const planPath = path.join(tmp, 'p.md');
    fs.writeFileSync(planPath, ['# Plan', '', '## Meta', 'labels: chore', '', '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape |', '|---|---|---|---|---|---|',
      '| done | finalize | — | — | 1 | sequence |', ''].join('\n'));
    const fr = runNode(planValidatorScript, [planPath, '--freeze', '--json'], tmp, { KAOLA_ENABLE_ADAPTIVE: '0' });
    assert(fr.status === 0 && JSON.parse(fr.stdout).frozen === true,
      'D8: validator --freeze must stay toggle-agnostic (work under OFF), got status ' + fr.status + ' ' + fr.stdout);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptiveAuthoringEntryGuard: PASSED');
}

// issue #228 (Tier 2): broadened sequence/branch composition + governance edge cases on
// top of the Tier-1 substrate. Exercises multi-role DAG branching (distinct from a
// heterogeneous fan-out), read-only multi-modal sweep, bounded-loop governance, and the
// fail-closed-on-uncertain path.
function testAdaptiveTier2Composition() {
  const tmp = adaptiveTmp('tier2');
  try {
    // perspective-diverse-verify, done correctly: distinct gate roles SEQUENCED so BOTH
    // post-dominate the implement node (impl -> code-reviewer -> security-reviewer -> sink).
    // Sensitive label => security-reviewer required + ask.
    let v = validatePlanFixture(tmp, [
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| impl | tdd-guide | explore | auth/login.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| sec | security-reviewer | review | — | 1 | sequence |',
      '| done | finalize | sec | — | 1 | sequence |',
    ], ['security']);
    assert(v.result === 'in-grammar' && v.decision === 'ask',
      'tier2: sequenced multi-gate composition (sensitive) must be in-grammar + ask, got: ' + JSON.stringify(v));

    // Governance edge case: the SAME two gates as PARALLEL sibling branches (each reaching
    // the sink independently) is a post-dominance LEAK — neither gate post-dominates impl
    // (each path crosses only one). The validator must refuse it. This is the multi-gate
    // analogue of the doc-updater side-branch leak.
    v = validatePlanFixture(tmp, [
      '| impl | tdd-guide | — | auth/login.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| sec | security-reviewer | impl | — | 1 | sequence |',
      '| done | finalize | review,sec | — | 1 | sequence |',
    ], ['security']);
    assert(v.result === 'refuse',
      'tier2: parallel reviewer branches are a post-dominance leak and must refuse, got: ' + JSON.stringify(v));

    // multi-modal-sweep: read-only fan-out of code-explorer (3 modalities) -> planner merge
    // -> sequential impl -> review -> sink. Read-only fan-out is zero blast radius => auto-run.
    v = validatePlanFixture(tmp, [
      '| m1 | code-explorer | — | — | 1 | fanout(sweep) |',
      '| m2 | code-explorer | — | — | 1 | fanout(sweep) |',
      '| m3 | code-explorer | — | — | 1 | fanout(sweep) |',
      '| merge | planner | m1,m2,m3 | — | 1 | sequence |',
      '| impl | tdd-guide | merge | lib/foo.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'in-grammar' && v.decision === 'auto-run',
      'tier2: read-only multi-modal sweep must be in-grammar + auto-run (zero blast radius), got: ' + JSON.stringify(v));

    // bounded-loop governance: a loop within LOOP_CAP is in-grammar + ask (loop present);
    // a loop over LOOP_CAP is a typed refusal.
    v = validatePlanFixture(tmp, [
      '| impl | tdd-guide | — | lib/foo.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | loop(3) |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'in-grammar' && v.decision === 'ask', 'tier2: bounded loop must be in-grammar + ask, got: ' + JSON.stringify(v));
    v = validatePlanFixture(tmp, [
      '| impl | tdd-guide | — | lib/foo.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | loop(9) |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'refuse', 'tier2: loop over LOOP_CAP must be a typed refusal, got: ' + JSON.stringify(v));

    // fail-closed-on-uncertain: no ## Meta labels block => sensitivity undetermined => ask.
    v = validatePlanFixture(tmp, [
      '| impl | tdd-guide | — | lib/foo.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], undefined);
    assert(v.result === 'in-grammar' && v.decision === 'ask', 'tier2: missing labels must fail closed to ask, got: ' + JSON.stringify(v));

    // heterogeneous fan-out (distinct roles in ONE fan-out group) is out-of-grammar — the
    // distinction from legal multi-role branching above.
    v = validatePlanFixture(tmp, [
      '| a | code-explorer | — | — | 1 | fanout(g) |',
      '| b | knowledge-lookup | — | — | 1 | fanout(g) |',
      '| done | finalize | a,b | — | 1 | sequence |',
    ], []);
    assert(v.result === 'refuse', 'tier2: heterogeneous fan-out must be a typed refusal, got: ' + JSON.stringify(v));

    // REGRESSION (adversarial review): code routed through doc-updater must NOT dodge G1.
    // A non-implement write role writing a non-docs file is a code-producing node and needs
    // code-reviewer post-dominance.
    v = validatePlanFixture(tmp, [
      '| n1 | doc-updater | — | src/server.js | 1 | sequence |',
      '| done | finalize | n1 | — | 1 | sequence |',
    ], ['chore']);
    assert(v.result === 'refuse', 'tier2 regression: doc-updater writing code must require code-reviewer (G1), got: ' + JSON.stringify(v));
    // ...but a docs-only doc-updater stays in the trivial band (no code review required).
    v = validatePlanFixture(tmp, [
      '| n1 | doc-updater | — | docs/guide.md | 1 | sequence |',
      '| done | finalize | n1 | — | 1 | sequence |',
    ], ['chore']);
    assert(v.result === 'in-grammar', 'tier2 regression: docs-only doc-updater stays trivial, got: ' + JSON.stringify(v));
    // REGRESSION: a sensitive LABEL must not LOOSEN G2 — a sensitive non-implement node must
    // still require security-reviewer (the target set is a union, not a replacement).
    v = validatePlanFixture(tmp, [
      '| n1 | doc-updater | — | auth/handler.js | 1 | sequence |',
      '| done | finalize | n1 | — | 1 | sequence |',
    ], ['auth']);
    assert(v.result === 'refuse', 'tier2 regression: sensitive doc-updater must require security-reviewer even under a sensitive label (G2 union), got: ' + JSON.stringify(v));

    // REGRESSION: plan_hash covers ## Meta labels — tampering labels after freeze must fail resume-check.
    const planValidator = require(planValidatorScript);
    const frozen = planValidator.freezePlan([
      '# Plan', '', '## Meta', 'labels: security', '', '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape |',
      '|---|---|---|---|---|---|',
      '| i | tdd-guide | — | lib/foo.js | 1 | sequence |',
      '| s | security-reviewer | i | — | 1 | sequence |',
      '| rv | code-reviewer | s | — | 1 | sequence |',
      '| d | finalize | rv | — | 1 | sequence |', ''
    ].join('\n'));
    assert(frozen.frozen, 'tier2 regression: sensitive plan should freeze');
    const tampered = frozen.content.replace('labels: security', 'labels: chore');
    assert(planValidator.revalidateForResume(tampered).ok === false,
      'tier2 regression: tampering ## Meta labels after freeze must fail resume-check (plan_hash covers Meta)');
    assert(planValidator.revalidateForResume(frozen.content).ok === true,
      'tier2 regression: untampered frozen plan must pass resume-check');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptiveTier2Composition: PASSED');
}

// 2026-06-03 audit fixes: lock the five validator/classifier soundness fixes so they cannot
// regress — A1 (code on the finalize sink), A2 (slashless root path), A2′ (dot-leading path),
// B1 (decoy labels line outside ## Meta dropping G2), B2/B3 (fenced ## heading hiding a node
// from the validator + plan_hash). Each was empirically reproduced as a gate bypass before fix.
function testAdaptiveAuditFixes() {
  const tmp = adaptiveTmp('audit-fixes');
  const planValidator = require(planValidatorScript);
  try {
    // A1: code declared on the finalize SINK must not bypass G1 (the sink can't be post-dominated).
    let v = validatePlanFixture(tmp, [
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| done | finalize | explore | src/app.js | 1 | sequence |',
    ], ['feature']);
    assert(v.result === 'refuse' && /G1/.test((v.errors || []).join(';')),
      'A1: code on the finalize sink must refuse (G1), got: ' + JSON.stringify(v));
    // A1 control: a finalize node doing docs/state bookkeeping (CHANGELOG.md) stays in-grammar.
    v = validatePlanFixture(tmp, [
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| impl | tdd-guide | explore | lib/foo.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| done | finalize | review | CHANGELOG.md | 1 | sequence |',
    ], ['feature']);
    assert(v.result === 'in-grammar', 'A1 control: finalize docs write must stay in-grammar, got: ' + JSON.stringify(v));

    // A2: a slashless root-level file (Dockerfile) on a write role is code and must require G1.
    v = validatePlanFixture(tmp, [
      '| n1 | doc-updater | — | Dockerfile | 1 | sequence |',
      '| done | finalize | n1 | — | 1 | sequence |',
    ], ['chore']);
    assert(v.result === 'refuse' && /G1/.test((v.errors || []).join(';')),
      'A2: slashless root file must be captured and require code-reviewer (G1), got: ' + JSON.stringify(v));

    // A2′: a dot-leading path with slashes (.github/workflows/deploy.yml) must also be captured.
    v = validatePlanFixture(tmp, [
      '| n1 | doc-updater | — | .github/workflows/deploy.yml | 1 | sequence |',
      '| done | finalize | n1 | — | 1 | sequence |',
    ], ['chore']);
    assert(v.result === 'refuse' && /G1/.test((v.errors || []).join(';')),
      'A2′: dot-leading path must be captured and require code-reviewer (G1), got: ' + JSON.stringify(v));

    // A2 (FILE_CEILING): root-level files now count toward the per-node ceiling.
    v = validatePlanFixture(tmp, [
      '| impl | tdd-guide | — | Dockerfile, Makefile, build.env, a.txt, b.txt, c.txt, d.txt | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], ['chore']);
    assert(v.result === 'refuse' && /FILE_CEILING/.test((v.errors || []).join(';')),
      'A2: root files must count toward FILE_CEILING, got: ' + JSON.stringify(v));

    // B1: a decoy `labels:` line OUTSIDE ## Meta (not covered by plan_hash) must not override the
    // real labels and drop G2. Label-only-sensitive plan with no security-reviewer must refuse.
    const decoyPlan = [
      '# Plan', '', 'labels: chore', '', '## Meta', '', 'labels: security', '',
      '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape |',
      '|---|---|---|---|---|---|',
      '| n1 | tdd-guide | — | src/handler.js | 1 | sequence |',
      '| rv | code-reviewer | n1 | — | 1 | sequence |',
      '| done | finalize | rv | — | 1 | sequence |', ''
    ].join('\n');
    const dv = planValidator.validatePlan(decoyPlan, { root: tmp });
    assert(dv.result === 'refuse' && /G2/.test((dv.errors || []).join(';')),
      'B1: decoy labels line outside ## Meta must not drop G2, got: ' + JSON.stringify(dv));

    // B2/B3: a fenced `## ` line inside ## Nodes must not hide an appended node from the validator
    // (it shares the fence-aware reader with the executor) — the hidden node makes a second sink.
    const fencedPlan = [
      '# Plan', '', '## Meta', '', 'labels: chore', '',
      '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape |',
      '|---|---|---|---|---|---|',
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| done | finalize | explore | — | 1 | sequence |',
      '', '```', '## x', '```', '',
      '| inj | tdd-guide | explore | src/evil.js | 1 | sequence |', ''
    ].join('\n');
    const fv = planValidator.validatePlan(fencedPlan, { root: tmp });
    assert(fv.result === 'refuse',
      'B2/B3: a node after a fenced ## inside ## Nodes must be visible to the validator (refuse), got: ' + JSON.stringify(fv));

    // B3: and the plan_hash must cover post-fence content — appending such a node after freeze
    // must fail --resume-check (hash mismatch), not pass silently.
    const clean = planValidator.freezePlan([
      '# Plan', '', '## Meta', '', 'labels: chore', '',
      '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape |',
      '|---|---|---|---|---|---|',
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| done | finalize | explore | — | 1 | sequence |', ''
    ].join('\n'));
    assert(clean.frozen, 'B3: clean plan should freeze');
    const injected = clean.content + '\n\n```\n## x\n```\n\n| inj | tdd-guide | explore | src/evil.js | 1 | sequence |\n';
    assert(planValidator.revalidateForResume(injected).ok === false,
      'B3: a node appended after a fenced ## must fail resume-check (plan_hash covers it)');
    assert(planValidator.revalidateForResume(clean.content).ok === true,
      'B3 control: the untampered frozen plan must pass resume-check');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptiveAuditFixes: PASSED');
}

// routeAdaptive: a frozen plan whose plan_hash comment is DELETED + an ungated node appended
// must be a typed refusal — never a plan-run/phaseN resume (a B3 cousin; resume requires a
// frozen plan, so a missing hash fails closed).
function testAdaptiveResumeHashDeletedTypedRefusal() {
  const tmp = adaptiveTmp('resume-hash-deleted');
  try {
    const planPath = plantFrozenPlan(tmp, 'issue-912', ADAPTIVE_PLAN);
    let plan = read(planPath).replace(/<!--\s*plan_hash:\s*[0-9a-f]{64}\s*-->\s*\n?/, '');
    plan = plan.trimEnd() + '\n| evil | tdd-guide | explore | src/auth/login.js | 1 | sequence |\n';
    fs.writeFileSync(planPath, plan);
    const result = runNode(repairScript, ['issue-912'], tmp);
    assert(/typed refusal/i.test(result.stdout), 'hash-deleted plan must be a typed refusal, got:\n' + result.stdout);
    assert(/plan_hash missing/i.test(result.stdout), 'refusal must cite missing plan_hash, got:\n' + result.stdout);
    assert(!/kaola-workflow-plan-run/.test(result.stdout), 'hash-deleted plan must NOT resume to plan-run');
    assert(!/kaola-workflow-phase\d/.test(result.stdout), 'hash-deleted plan must NOT fall back to phaseN');
    assert(!fs.existsSync(statePath(tmp, 'issue-912')), 'refusal must write no workflow-state.md');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptiveResumeHashDeletedTypedRefusal: PASSED');
}

// SOUNDNESS: a plan above MAX_NODES is refused as OUT OF GRAMMAR (a typed refusal), not crashed.
// Pre-fix a deep depends_on chain overflowed hasCycle's recursive DFS and the CLI emitted EMPTY
// stdout under --json; this test passing proves both the typed refuse AND that stdout is valid JSON.
function testAdaptiveValidatorNodeCap() {
  const tmp = adaptiveTmp('validator-cap');
  try {
    const schema = require(path.join(repoRoot, 'scripts', 'kaola-workflow-adaptive-schema.js'));
    const overCap = schema.MAX_NODES + 50;
    const rows = ['| n1 | code-explorer | — | — | 1 | sequence |'];
    for (let i = 2; i <= overCap; i++) rows.push(`| n${i} | code-explorer | n${i - 1} | — | 1 | sequence |`);
    rows.push(`| done | finalize | n${overCap} | — | 1 | sequence |`);
    const v = validatePlanFixture(tmp, rows, []); // does JSON.parse(stdout) — proves stdout is valid JSON
    assert(v.result === 'refuse', 'over-cap plan must be a typed refusal, got: ' + JSON.stringify(v));
    assert(v.errors.some(e => /MAX_NODES/.test(e)), 'over-cap refusal must cite MAX_NODES, got: ' + JSON.stringify(v.errors));
    const atCap = ['| n1 | tdd-guide | — | lib/foo.js | 1 | sequence |',
                   '| review | code-reviewer | n1 | — | 1 | sequence |',
                   '| done | finalize | review | — | 1 | sequence |'];
    const ok = validatePlanFixture(tmp, atCap, []);
    assert(ok.result === 'in-grammar', 'a normal small plan must remain in-grammar after the cap, got: ' + JSON.stringify(ok));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptiveValidatorNodeCap: PASSED');
}

// Cheap-win micro-fixes: B7 — loop(0) is out-of-grammar (a zero-iteration loop silently skips
// its body); B5 — a bare `fs/` path segment is a Phase-5 (filesystem) sensitive write that drives
// G2 + the sensitivity band, without over-matching refs/ / prefs/ / fs.js.
function testAdaptiveCheapWinFixes() {
  const tmp = adaptiveTmp('cheap-win-fixes');
  try {
    let v = validatePlanFixture(tmp, [
      '| impl | tdd-guide | — | lib/foo.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | loop(0) |',
      '| done | finalize | review | — | 1 | sequence |',
    ], ['chore']);
    assert(v.result === 'refuse' && /loop cap 0 < 1/.test((v.errors || []).join(';')),
      'B7: loop(0) must be a typed refusal (cap < 1), got: ' + JSON.stringify(v));
    v = validatePlanFixture(tmp, [
      '| impl | tdd-guide | — | lib/foo.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | loop(1) |',
      '| done | finalize | review | — | 1 | sequence |',
    ], ['chore']);
    assert(v.result === 'in-grammar' && v.decision === 'ask',
      'B7 control: loop(1) must stay in-grammar + ask (loop present), got: ' + JSON.stringify(v));
    v = validatePlanFixture(tmp, [
      '| impl | tdd-guide | — | fs/handler.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], ['chore']);
    assert(v.result === 'refuse' && /G2/.test((v.errors || []).join(';')),
      'B5: fs/ write without security-reviewer must refuse (G2 sensitivity), got: ' + JSON.stringify(v));
    v = validatePlanFixture(tmp, [
      '| impl | tdd-guide | — | fs/handler.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| sec | security-reviewer | review | — | 1 | sequence |',
      '| done | finalize | sec | — | 1 | sequence |',
    ], ['chore']);
    assert(v.result === 'in-grammar' && v.decision === 'ask' && v.risk && v.risk.sensitivity === true,
      'B5: fs/ write with security-reviewer must be in-grammar + ask (sensitivity), got: ' + JSON.stringify(v));
    v = validatePlanFixture(tmp, [
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| impl | tdd-guide | explore | src/refs/x.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], ['chore']);
    assert(v.result === 'in-grammar' && v.decision === 'auto-run' && v.risk && v.risk.sensitivity === false,
      'B5 control: src/refs/ must not over-match fs/ and must stay auto-run, got: ' + JSON.stringify(v));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptiveCheapWinFixes: PASSED');
}

// Follow-up coverage (I4/I5/I6/I7): lock the toggle-resolution contract, the --resume-check CLI
// surface, and the structural-refusal + cap boundaries the audit fixes rest on. Every verdict
// here was confirmed against the live validator; do not relax.
function testAdaptiveAuditCoverage() {
  const tmp = adaptiveTmp('audit-coverage');
  try {
    // I4: resolveEnableAdaptive toggle precedence (pure-function calls; OFF-by-default + strict).
    const schema = require(path.join(repoRoot, 'scripts', 'kaola-workflow-adaptive-schema.js'));
    assert(schema.resolveEnableAdaptive({ enable_adaptive: true }, {}) === true, 'I4: config true (no env) => true');
    assert(schema.resolveEnableAdaptive({ enable_adaptive: 'true' }, {}) === false, 'I4: STRICT === true — string "true" must NOT enable');
    assert(schema.resolveEnableAdaptive({ enable_adaptive: 1 }, {}) === false, 'I4: STRICT === true — number 1 must NOT enable');
    assert(schema.resolveEnableAdaptive({}, {}) === false, 'I4: absent => OFF');
    assert(schema.resolveEnableAdaptive(null, {}) === false, 'I4: null config => OFF');
    assert(schema.resolveEnableAdaptive({ enable_adaptive: false }, { KAOLA_ENABLE_ADAPTIVE: '1' }) === true, 'I4: env "1" overrides config false');
    assert(schema.resolveEnableAdaptive({ enable_adaptive: true }, { KAOLA_ENABLE_ADAPTIVE: '0' }) === false, 'I4: env "0" overrides config true');
    assert(schema.resolveEnableAdaptive({}, { KAOLA_ENABLE_ADAPTIVE: 'true' }) === true, 'I4: env "true" enables');
    assert(schema.resolveEnableAdaptive({ enable_adaptive: true }, { KAOLA_ENABLE_ADAPTIVE: 'maybe' }) === true, 'I4: unrecognized env falls through to config');

    // I5: the --resume-check CLI flag end-to-end (not just the library).
    const resumePlan = path.join(tmp, 'resume-plan.md');
    fs.writeFileSync(resumePlan, [
      '# Plan', '', '## Meta', 'labels: chore', '', '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape |',
      '|---|---|---|---|---|---|',
      '| impl | tdd-guide | — | lib/foo.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |', ''
    ].join('\n'));
    const froze = runNode(planValidatorScript, [resumePlan, '--freeze'], tmp);
    assert(froze.status === 0, 'I5: --freeze must exit 0, got ' + froze.status + ' ' + froze.stderr);
    const okRun = runNode(planValidatorScript, [resumePlan, '--resume-check', '--json'], tmp);
    const okJson = JSON.parse(okRun.stdout);
    assert(okRun.status === 0 && okJson.ok === true, 'I5: --resume-check clean => ok:true exit 0, got ' + okRun.status + ' ' + okRun.stdout);
    fs.writeFileSync(resumePlan, read(resumePlan).replace('lib/foo.js', 'lib/bar.js'));
    const badRun = runNode(planValidatorScript, [resumePlan, '--resume-check', '--json'], tmp);
    const badJson = JSON.parse(badRun.stdout);
    assert(badRun.status === 1 && badJson.ok === false && /plan_hash mismatch/.test(badJson.reason),
      'I5: --resume-check tampered => ok:false exit 1 (mismatch), got ' + badRun.status + ' ' + badRun.stdout);

    // I6: structural refusals (each must be result:'refuse').
    let v = validatePlanFixture(tmp, [
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| d1 | finalize | explore | — | 1 | sequence |',
      '| d2 | finalize | explore | — | 1 | sequence |',
    ], ['chore']);
    assert(v.result === 'refuse' && /unique finalize sink/.test((v.errors || []).join(';')), 'I6: two finalize sinks must refuse, got: ' + JSON.stringify(v));
    v = validatePlanFixture(tmp, [
      '| explore | wizard | — | — | 1 | sequence |',
      '| done | finalize | explore | — | 1 | sequence |',
    ], ['chore']);
    assert(v.result === 'refuse' && /unknown role/.test((v.errors || []).join(';')), 'I6: unknown role must refuse, got: ' + JSON.stringify(v));
    v = validatePlanFixture(tmp, [
      '| a | code-explorer | b | — | 1 | sequence |',
      '| b | tdd-guide | a | lib/x.js | 1 | sequence |',
      '| review | code-reviewer | b | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], ['chore']);
    assert(v.result === 'refuse' && /cycle detected/.test((v.errors || []).join(';')), 'I6: a cycle must refuse, got: ' + JSON.stringify(v));
    v = validatePlanFixture(tmp, [
      '| explore | code-explorer | ghost | — | 1 | sequence |',
      '| done | finalize | explore | — | 1 | sequence |',
    ], ['chore']);
    assert(v.result === 'refuse' && /depends_on unknown node/.test((v.errors || []).join(';')), 'I6: dangling depends_on must refuse, got: ' + JSON.stringify(v));
    v = validatePlanFixture(tmp, [
      '| explore | code-explorer | — | lib/x.js | 1 | sequence |',
      '| done | finalize | explore | — | 1 | sequence |',
    ], ['chore']);
    assert(v.result === 'refuse' && /read-only role/.test((v.errors || []).join(';')), 'I6: read-only role with write set must refuse, got: ' + JSON.stringify(v));
    v = validatePlanFixture(tmp, [
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| f1 | tdd-guide | explore | a/1.js | 1 | fanout(g) |',
      '| f2 | tdd-guide | explore | b/2.js | 1 | fanout(g) |',
      '| f3 | tdd-guide | explore | c/3.js | 1 | fanout(g) |',
      '| f4 | tdd-guide | explore | d/4.js | 1 | fanout(g) |',
      '| f5 | tdd-guide | explore | e/5.js | 1 | fanout(g) |',
      '| review | code-reviewer | f1,f2,f3,f4,f5 | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], ['chore']);
    assert(v.result === 'in-grammar', 'I6 (#303): fan-out of 5 > FANOUT_CAP is now in-grammar (runtime concurrency limit, not validity cap), got: ' + JSON.stringify(v));
    v = validatePlanFixture(tmp, [
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| f1 | tdd-guide | explore | scripts/a.js | 1 | fanout(g) |',
      '| f2 | tdd-guide | explore | scripts/b.js | 1 | fanout(g) |',
      '| review | code-reviewer | f1,f2 | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], ['chore']);
    assert(v.result === 'refuse' && /shared infra/.test((v.errors || []).join(';')), 'I6: YELLOW shared-infra fan-out must refuse, got: ' + JSON.stringify(v));

    // I7: LOOP_CAP boundary + read-only fan-out width (now uncapped at validation, #303).
    v = validatePlanFixture(tmp, [
      '| impl | tdd-guide | — | lib/foo.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | loop(5) |',
      '| done | finalize | review | — | 1 | sequence |',
    ], ['chore']);
    assert(v.result === 'in-grammar' && v.decision === 'ask', 'I7: loop(5) == LOOP_CAP must be in-grammar + ask, got: ' + JSON.stringify(v));
    v = validatePlanFixture(tmp, [
      '| impl | tdd-guide | — | lib/foo.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | loop(6) |',
      '| done | finalize | review | — | 1 | sequence |',
    ], ['chore']);
    assert(v.result === 'refuse' && /LOOP_CAP/.test((v.errors || []).join(';')), 'I7: loop(6) > LOOP_CAP must refuse, got: ' + JSON.stringify(v));
    v = validatePlanFixture(tmp, [
      '| f1 | code-explorer | — | — | 1 | fanout(g) |',
      '| f2 | code-explorer | — | — | 1 | fanout(g) |',
      '| f3 | code-explorer | — | — | 1 | fanout(g) |',
      '| f4 | code-explorer | — | — | 1 | fanout(g) |',
      '| f5 | code-explorer | — | — | 1 | fanout(g) |',
      '| done | finalize | f1,f2,f3,f4,f5 | — | 1 | sequence |',
    ], ['chore']);
    assert(v.result === 'in-grammar', 'I7 (#303): read-only fan-out of 5 > FANOUT_CAP is now in-grammar; the executor concurrency-limits dispatch at runtime, got: ' + JSON.stringify(v));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptiveAuditCoverage: PASSED');
}

function runClassifierOffline(tmp, issueNumber) {
  const result = spawnSync(process.execPath, [classifierScript, 'classify', '--issue', String(issueNumber)], {
    cwd: tmp, encoding: 'utf8',
    env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
  });
  assert(result.status === 0, 'classifier exit 0 expected, got ' + result.status + '\nstderr: ' + result.stderr);
  return JSON.parse(result.stdout.trim());
}

function testClassifierFolderOverlapRed() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-classifier-red-'));
  try {
    plantActiveFolder(tmp, 'active-project-k', 70, '# Phase 3\nFiles: scripts/kaola-workflow-claim.js\n');
    plantRoadmapIssue(tmp, 71, 'body: also touches scripts/kaola-workflow-claim.js');
    const result = runClassifierOffline(tmp, 71);
    assert(result.verdict === 'red',
      'folder-based exact-file overlap must yield red, got ' + result.verdict);
    assert(result.reasoning && result.reasoning.includes('exact file path'),
      'red reasoning must mention exact file path; got: ' + result.reasoning);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClassifierFolderOverlapYellow() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-classifier-yellow-'));
  try {
    plantActiveFolder(tmp, 'active-project-l', 72, '# Phase 3\nFiles: scripts/kaola-workflow-claim.js\n');
    plantRoadmapIssue(tmp, 73, 'body: candidate touches scripts/new-helper.js');
    const result = runClassifierOffline(tmp, 73);
    assert(result.verdict === 'yellow',
      'shared-infra area overlap must yield yellow, got ' + result.verdict);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClassifierClosedIssueResidueIgnored() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-classifier-closed-'));
  try {
    plantActiveFolder(tmp, 'closed-residue', 80, '# Phase 3\nFiles: commands/something.md\n');
    plantRoadmapIssue(tmp, 81, 'body: candidate touches commands/something.md');
    // gh shim: issue 80 is CLOSED → readActiveFolders must skip its folder.
    const binDir = path.join(tmp, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    writeShimFiles(path.join(binDir, 'gh'), [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue view 80')) { process.stdout.write('{\"state\":\"CLOSED\"}\\n'); }",
      "else if (a.includes('issue view 81')) { process.stdout.write('{\"number\":81,\"title\":\"unrelated\",\"body\":\"commands/something.md\",\"labels\":[],\"state\":\"OPEN\"}\\n'); }",
      "else if (a.includes('repo view')) { process.stdout.write('{\"owner\":{\"login\":\"test\"},\"name\":\"repo\"}\\n'); }",
      "else { process.stdout.write('[\\n'); }"
    ]);
    const result = spawnSync(process.execPath, [classifierScript, 'classify', '--issue', '81'], {
      cwd: tmp, encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '0', ...ghMockEnv(binDir), PATH: binDir + path.delimiter + path.dirname(process.execPath) + path.delimiter + (process.env.PATH || '') }
    });
    assert(result.status === 0, 'classifier exit 0 expected, got ' + result.status + '\nstderr: ' + result.stderr);
    const parsed = JSON.parse(result.stdout.trim());
    assert(parsed.verdict === 'green',
      'closed-issue folder must be ignored as overlap source; expected green, got ' + parsed.verdict);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClassifierReleasedFolderExcluded() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-classifier-released-'));
  try {
    plantActiveFolder(tmp, 'released-project', 92, '# Phase 3\nFiles: commands/something.md\n', 'released');
    plantRoadmapIssue(tmp, 93, 'body: candidate touches commands/something.md');
    const result = runClassifierOffline(tmp, 93);
    assert(result.verdict === 'green',
      'released-status folder must be excluded from overlap; expected green, got ' + result.verdict);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// issue #207: a fast project's only file-set-bearing artifact is fast-summary.md.
// Its declared write set (the `## Scope` `- Write Set:` line) must participate in
// overlap detection at parity with full projects' phase files.
function testClassifierFastScopeOverlapRed() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-classifier-fast-red-'));
  try {
    // Fast project: workflow-state.md (so it is an active folder) + fast-summary.md,
    // no phase3-plan.md/phase1-research.md.
    plantActiveFolder(tmp, 'fast-active-a', 200, null, 'active');
    fs.writeFileSync(
      path.join(tmp, 'kaola-workflow', 'fast-active-a', 'fast-summary.md'),
      '# Fast Summary: fast-active-a\n\n## Status\nIN_PROGRESS\n\n## Scope\n- Write Set: scripts/kaola-workflow-claim.js\n- Acceptance: node x\n\n## Plan\nstuff\n'
    );
    plantRoadmapIssue(tmp, 201, 'body: candidate also touches scripts/kaola-workflow-claim.js');
    const result = runClassifierOffline(tmp, 201);
    assert(result.verdict === 'red',
      'issue #207: candidate overlapping a fast project Write Set must yield red, got ' + result.verdict);
    assert(result.reasoning && result.reasoning.includes('exact file path'),
      'fast-overlap red reasoning must mention exact file path; got: ' + result.reasoning);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('testClassifierFastScopeOverlapRed: PASSED');
}

function testClassifierFastScopeDisjointGreen() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-classifier-fast-green-'));
  try {
    plantActiveFolder(tmp, 'fast-active-b', 202, null, 'active');
    fs.writeFileSync(
      path.join(tmp, 'kaola-workflow', 'fast-active-b', 'fast-summary.md'),
      '# Fast Summary: fast-active-b\n\n## Status\nPASSED\n\n## Scope\n- Write Set: docs/api.md\n- Acceptance: node x\n\n## Plan\nstuff\n'
    );
    plantRoadmapIssue(tmp, 203, 'body: candidate touches commands/kaola-workflow-fast.md');
    const result = runClassifierOffline(tmp, 203);
    assert(result.verdict === 'green',
      'issue #207: candidate disjoint from a fast project Write Set must stay green, got ' + result.verdict);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('testClassifierFastScopeDisjointGreen: PASSED');
}

// issue #237: a claimed adaptive project declares its write set in workflow-plan.md's
// `## Nodes` table. A dot-leading CI/supply-chain path (.github/workflows/deploy.yml) there
// was silently dropped from BOTH the claimed-side combined blob and the candidate issue body
// by the old FILE_PATH_REGEX (no leading dot), so two projects touching the same CI file did
// not collide-detect (a silent clobber on the shared worktree). The leading-dot widening makes
// the path visible on both sides.
function testClassifierDotPathOverlapRed() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-classifier-dotpath-red-'));
  try {
    plantActiveFolder(tmp, 'adaptive-ci-active', 300, null, 'active');
    plantFrozenPlan(tmp, 'adaptive-ci-active', [
      '# Workflow Plan — issue #300', '',
      '## Meta', 'labels: chore', '',
      '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape |',
      '|---|---|---|---|---|---|',
      '| ci | doc-updater | — | .github/workflows/deploy.yml | 1 | sequence |',
      '| review | code-reviewer | ci | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
      ''
    ].join('\n'));
    plantRoadmapIssue(tmp, 301, 'body: this issue also rewrites .github/workflows/deploy.yml for CI');
    const result = runClassifierOffline(tmp, 301);
    assert(result.verdict === 'red',
      'issue #237: dot-leading CI path overlap must yield red, got ' + result.verdict + ' (' + result.reasoning + ')');
    assert(result.reasoning && result.reasoning.includes('exact file path'),
      'issue #237: red reasoning must mention exact file path; got: ' + result.reasoning);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('testClassifierDotPathOverlapRed: PASSED');
}

// issue #237 CONTROL (the binding no-false-refusal test): the leading-dot widening must NOT
// make free issue-body prose over-match bare words into a false overlap. Bare-word filenames
// (config.json, package.json) are slashless and Node.js / 3.19.1 are not paths, so a candidate
// whose body only mentions them in passing must stay green against a disjoint claimed project.
function testClassifierRootPathProseNoOverlap() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-classifier-prose-green-'));
  try {
    plantActiveFolder(tmp, 'prose-active', 310, '# Phase 3\nFiles: scripts/some-real-file.js\n', 'active');
    plantRoadmapIssue(tmp, 311, 'body: use Node.js for this; bump version 3.19.1; touches config.json and package.json in passing prose, nothing shared');
    const result = runClassifierOffline(tmp, 311);
    assert(result.verdict === 'green',
      'issue #237 control: bare-word prose must NOT over-match into a false overlap, got ' + result.verdict + ' (' + result.reasoning + ')');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('testClassifierRootPathProseNoOverlap: PASSED');
}

// issue #237: `.github` is now an extractable coarse area (and is NOT in SHARED_INFRA), so two
// projects editing different files under the same CI directory collide at area granularity —
// a deliberate, consistent tightening (parity with `src/`) that prefers detecting a real CI
// clobber over silently overwriting it.
function testClassifierDotAreaOverlapRed() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-classifier-dotarea-red-'));
  try {
    plantActiveFolder(tmp, 'ci-area-active', 320, null, 'active');
    plantFrozenPlan(tmp, 'ci-area-active', [
      '# Workflow Plan — issue #320', '',
      '## Meta', 'labels: chore', '',
      '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape |',
      '|---|---|---|---|---|---|',
      '| ci | doc-updater | — | .github/workflows/deploy.yml | 1 | sequence |',
      '| review | code-reviewer | ci | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
      ''
    ].join('\n'));
    plantRoadmapIssue(tmp, 321, 'body: this issue edits a different CI workflow .github/workflows/release.yml');
    const result = runClassifierOffline(tmp, 321);
    assert(result.verdict === 'red',
      'issue #237: two projects sharing the .github coarse area must collide (red), got ' + result.verdict + ' (' + result.reasoning + ')');
    assert(result.reasoning && result.reasoning.includes('coarse area'),
      'issue #237: dot-area red reasoning must mention coarse area; got: ' + result.reasoning);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('testClassifierDotAreaOverlapRed: PASSED');
}

// issue #238: a claimed project's structured plan write set declares a slashless ROOT file
// (Dockerfile); a candidate issue body that also names it must collide-detect — but as YELLOW
// (ask), never RED, since the candidate side is prose. The claimed side gets the root file from the
// structured plan write set folded DIRECTLY (not re-extracted from a stringified blob).
function testClassifierCuratedRootOverlapYellow() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-classifier-curated-yellow-'));
  try {
    plantActiveFolder(tmp, 'curated-claimed', 330, null, 'active');
    plantFrozenPlan(tmp, 'curated-claimed', [
      '# Workflow Plan — issue #330', '',
      '## Meta', 'labels: chore', '',
      '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape |',
      '|---|---|---|---|---|---|',
      '| ci | doc-updater | — | Dockerfile | 1 | sequence |',
      '| review | code-reviewer | ci | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
      ''
    ].join('\n'));
    // The candidate side is the ONLY detector for slashless ROOT files, so it must catch the same
    // physical file regardless of the sentence punctuation prose glues on (v3.21.0 normalization):
    // a clean token, a sentence-ending '.', and a leading './' all route to YELLOW for the curated
    // reason. Pre-fix the punctuated forms tokenized to "Dockerfile."/"./Dockerfile", missed exact
    // membership, and fell open to GREEN — so the punctuated rows mutation-cover the normalization.
    for (const [num, body] of [
      [331, 'body: this change also edits the Dockerfile to add a build stage'],
      [332, 'body: add a healthcheck to the Dockerfile. also update src/server.js'],
      [333, 'body: tweak ./Dockerfile and refresh src/server.js'],
      // v3.21.0: case-insensitive — a lowercase "dockerfile" is the SAME physical file on
      // macOS/Windows, so it must still route to the curated overlap (mutation-covers CURATED_ROOT_LC).
      [334, 'body: also update the dockerfile. and src/server.js'],
    ]) {
      plantRoadmapIssue(tmp, num, body);
      const result = runClassifierOffline(tmp, num);
      assert(result.verdict === 'yellow' && /curated root file "Dockerfile"/.test(result.reasoning),
        'issue #238 / v3.21.0: curated root-file overlap must be yellow for the curated reason (candidate "' + body + '"), got ' + result.verdict + ' (' + result.reasoning + ')');
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testClassifierCuratedRootOverlapYellow: PASSED');
}

// F9 (v3.21.0): the CLAIMED-prose side must also detect a curated overlap — the "two-sided" #238
// promise. A non-adaptive claimed project naming a curated file in phase3 PROSE (no frozen plan) plus
// a candidate naming the same file must be YELLOW. The claimed prose is punctuated ("Dockerfile.") so
// the row mutation-covers BOTH the prose matcher (classifier extractCuratedRootPaths(combined)) and
// the v3.21.0 normalization on the claimed side; disabling either fails open to GREEN.
function testClassifierCuratedRootProseClaimedYellow() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-classifier-curated-prose-yellow-'));
  try {
    plantActiveFolder(tmp, 'prose-curated-claimed', 360, '# Phase 3\nWe will edit the Dockerfile.\n', 'active');
    plantRoadmapIssue(tmp, 361, 'body: this change also edits the Dockerfile and src/app.js');
    const result = runClassifierOffline(tmp, 361);
    assert(result.verdict === 'yellow' && /curated root file "Dockerfile"/.test(result.reasoning),
      'F9: a curated-root overlap declared in CLAIMED prose (no frozen plan) must be yellow, got ' + result.verdict + ' (' + result.reasoning + ')');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testClassifierCuratedRootProseClaimedYellow: PASSED');
}

// issue #238 CONTROL, strengthened (F10): a candidate naming ONLY a curated root file, against a
// claimed project AT phase<=2 that does not touch it, must stay GREEN (the safe over-ask, not an
// over-block). With phase3Body=null the claimed project is phase<=2, so WITHOUT the #238 noPathInfo
// curated-size guard the candidate would conservative-RED; asserting GREEN therefore mutation-covers
// that guard (pre-#238 / guard-reverted code returns RED for this exact scenario).
function testClassifierCuratedRootProseNoOverlapGreen() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-classifier-curated-green-'));
  try {
    plantActiveFolder(tmp, 'overblock-claimed', 350, null, 'active');
    plantRoadmapIssue(tmp, 351, 'body: this change edits the Dockerfile only, nothing else');
    const result = runClassifierOffline(tmp, 351);
    assert(result.verdict === 'green',
      'issue #238 control (F10): a curated root file named only by the candidate, untouched by a phase<=2 claimed project, must stay green (no over-block), got ' + result.verdict + ' (' + result.reasoning + ')');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testClassifierCuratedRootProseNoOverlapGreen: PASSED');
}

// v3.21.0 (re-gate round 3): the STRUCTURED-claimed fold must store the CANONICAL curated name, so a
// plan declaring a NON-canonical case (`dockerfile`) still intersects a canonical candidate
// (`Dockerfile`) on case-insensitive filesystems. This is the OPPOSITE asymmetry from the lowercase-
// candidate case (334): here the lowercase is on the CLAIMED structured side, with NO prose mention
// anywhere (else the prose path rescues it and the test is vacuous). Mutation-covers classifier:393's
// canonicalCuratedRoot (revert it to a raw add -> green -> this fails).
function testClassifierCuratedRootStructuredLowercaseYellow() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-classifier-curated-struct-lc-'));
  try {
    plantActiveFolder(tmp, 'lc-claimed', 370, null, 'active');
    plantFrozenPlan(tmp, 'lc-claimed', [
      '# Workflow Plan — issue #370', '', '## Meta', 'labels: chore', '', '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape |', '|---|---|---|---|---|---|',
      '| ci | doc-updater | — | dockerfile | 1 | sequence |',
      '| review | code-reviewer | ci | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |', ''
    ].join('\n'));
    plantRoadmapIssue(tmp, 371, 'body: this change also edits the Dockerfile to add a build stage');
    const result = runClassifierOffline(tmp, 371);
    assert(result.verdict === 'yellow' && /curated root file "Dockerfile"/.test(result.reasoning),
      'v3.21.0: a lowercase STRUCTURED declaration (dockerfile) must intersect a canonical candidate (Dockerfile) — curated case-fold, got ' + result.verdict + ' (' + result.reasoning + ')');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testClassifierCuratedRootStructuredLowercaseYellow: PASSED');
}

// Guards the Scope-section-only read: a path that appears ONLY in the later
// Implementation Evidence / Review sections (command + test-output noise) must
// NOT manufacture an overlap (would be a false RED / over-block regression).
function testClassifierFastScopeSectionIsolationGreen() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-classifier-fast-iso-'));
  try {
    plantActiveFolder(tmp, 'fast-active-c', 204, null, 'active');
    fs.writeFileSync(
      path.join(tmp, 'kaola-workflow', 'fast-active-c', 'fast-summary.md'),
      [
        '# Fast Summary: fast-active-c', '',
        '## Status', 'PASSED', '',
        '## Scope', '- Write Set: docs/api.md', '- Acceptance: node x', '',
        '## Implementation Evidence', 'ran node scripts/kaola-workflow-claim.js; tests passed', '',
        '## Review', 'reviewed scripts/kaola-workflow-claim.js', ''
      ].join('\n')
    );
    plantRoadmapIssue(tmp, 205, 'body: candidate touches scripts/kaola-workflow-claim.js');
    const result = runClassifierOffline(tmp, 205);
    assert(result.verdict === 'green',
      'issue #207: a path only in Implementation Evidence/Review (not ## Scope) must NOT trigger overlap; expected green, got ' + result.verdict);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('testClassifierFastScopeSectionIsolationGreen: PASSED');
}

// issue #213: a `#`-prefixed line inside a fenced code block within ## Scope must
// NOT truncate the section slice. The boundary is h2-only (^##\s), so a fenced
// `# comment` line above a `- Write Set:` path no longer drops that path from the
// claimed write set. The candidate overlapping the below-the-fence path must RED.
function testClassifierFastScopeFenceCommentRed() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-classifier-fence-'));
  try {
    plantActiveFolder(tmp, 'fast-fence-a', 206, null, 'active');
    fs.writeFileSync(
      path.join(tmp, 'kaola-workflow', 'fast-fence-a', 'fast-summary.md'),
      ['# Fast Summary: fast-fence-a', '',
        '## Status', 'IN_PROGRESS', '',
        '## Scope', '```sh', '# set up the harness before writing', '```',
        '- Write Set: scripts/kaola-workflow-claim.js', '- Acceptance: node x', '',
        '## Plan', 'stuff'].join('\n')
    );
    plantRoadmapIssue(tmp, 207, 'body: candidate also touches scripts/kaola-workflow-claim.js');
    const result = runClassifierOffline(tmp, 207);
    assert(result.verdict === 'red',
      'issue #213: a # comment inside a fenced block must not truncate ## Scope; Write Set below it must still be counted, got ' + result.verdict);
    assert(result.reasoning && result.reasoning.includes('exact file path'),
      'fence-bug red reasoning must mention exact file path; got: ' + result.reasoning);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('testClassifierFastScopeFenceCommentRed: PASSED');
}

// issue #215 T1a: a `## Heading` line inside a fenced code block within ## Scope must
// NOT truncate the section slice. The boundary is h2-only (^##\s), so a fenced
// `## Some Heading` line above a `- Write Set:` path no longer drops that path.
// The candidate overlapping the write-set path must RED.
// FAILING-FIRST: before the fence-aware fix, ## Some Heading closes the Scope slice
// prematurely, dropping the Write Set path → verdict green (wrong).
function testClassifierFastScopeFenceHeadingRed() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-classifier-fence-h-'));
  try {
    plantActiveFolder(tmp, 'fast-fence-heading', 208, null, 'active');
    fs.writeFileSync(
      path.join(tmp, 'kaola-workflow', 'fast-fence-heading', 'fast-summary.md'),
      ['# Fast Summary: fast-fence-heading', '',
        '## Status', 'IN_PROGRESS', '',
        '## Scope', '```sh', '## Some Heading', '```',
        '- Write Set: scripts/kaola-workflow-claim.js', '- Acceptance: node x', '',
        '## Plan', 'stuff'].join('\n')
    );
    plantRoadmapIssue(tmp, 209, 'body: candidate also touches scripts/kaola-workflow-claim.js');
    const result = runClassifierOffline(tmp, 209);
    assert(result.verdict === 'red',
      'issue #215 T1a: a ## heading inside a fenced block must not truncate ## Scope; Write Set below it must still be counted, got ' + result.verdict);
    assert(result.reasoning && result.reasoning.includes('exact file path'),
      'fence-heading red reasoning must mention exact file path; got: ' + result.reasoning);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('testClassifierFastScopeFenceHeadingRed: PASSED');
}

// issue #215 T1b: a `~~~` line NESTED INSIDE a backtick fence (content, not opener),
// followed by `## Heading` also inside the fence. Family-tracking keeps the fence open
// on `~~~`; a naive toggle would close it and then see `## Heading` outside → truncate.
// FAILING-FIRST: before the fence-aware fix, ## Heading (currently "outside" due to
// naive toggle or plain-regex boundary) closes the Scope slice → verdict green (wrong).
function testClassifierFastScopeFenceMixedMarkerRed() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-classifier-fence-m-'));
  try {
    plantActiveFolder(tmp, 'fast-fence-mixed', 210, null, 'active');
    fs.writeFileSync(
      path.join(tmp, 'kaola-workflow', 'fast-fence-mixed', 'fast-summary.md'),
      ['# Fast Summary: fast-fence-mixed', '',
        '## Status', 'IN_PROGRESS', '',
        '## Scope', '```sh', '~~~', '## Heading', '```',
        '- Write Set: scripts/kaola-workflow-claim.js', '- Acceptance: node x', '',
        '## Plan', 'stuff'].join('\n')
    );
    plantRoadmapIssue(tmp, 211, 'body: candidate also touches scripts/kaola-workflow-claim.js');
    const result = runClassifierOffline(tmp, 211);
    assert(result.verdict === 'red',
      'issue #215 T1b: a ## heading inside backtick fence (with nested ~~~) must not truncate ## Scope; Write Set below it must still be counted, got ' + result.verdict);
    assert(result.reasoning && result.reasoning.includes('exact file path'),
      'fence-mixed red reasoning must mention exact file path; got: ' + result.reasoning);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('testClassifierFastScopeFenceMixedMarkerRed: PASSED');
}

// issue #215 T1c: the Write Set path lives INSIDE the fence. This is a discriminator
// guard — in-fence paths must still be counted (pre-strip regression guard).
// This test should PASS even before the source fix.
function testClassifierFastScopeFenceInFencePathRed() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-classifier-fence-p-'));
  try {
    plantActiveFolder(tmp, 'fast-fence-inpath', 212, null, 'active');
    fs.writeFileSync(
      path.join(tmp, 'kaola-workflow', 'fast-fence-inpath', 'fast-summary.md'),
      ['# Fast Summary: fast-fence-inpath', '',
        '## Status', 'IN_PROGRESS', '',
        '## Scope', '```sh', '- Write Set: scripts/kaola-workflow-claim.js', '```',
        '- Acceptance: node x', '',
        '## Plan', 'stuff'].join('\n')
    );
    plantRoadmapIssue(tmp, 213, 'body: candidate also touches scripts/kaola-workflow-claim.js');
    const result = runClassifierOffline(tmp, 213);
    assert(result.verdict === 'red',
      'issue #215 T1c: a Write Set path inside a fenced block must still be counted; expected red, got ' + result.verdict);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('testClassifierFastScopeFenceInFencePathRed: PASSED');
}

// issue #215 regression: an unterminated fence in a section BEFORE ## Scope must NOT
// prevent sectionBody from finding ## Scope. The buggy locator (with fence-tracking)
// stayed inFence=true after an unclosed fence in ## Status, skipped ## Scope, returned
// '' → no Write Set → verdict green (wrong). The fix removes fence-tracking from the
// locator loop so ## Scope is always found regardless of prior fence state.
// FAILING-FIRST: against the buggy #215 locator this test returns green, not red.
function testClassifierFastScopePreSectionUnclosedFenceRed() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-classifier-fence-pre-'));
  try {
    plantActiveFolder(tmp, 'fast-fence-pre', 214, null, 'active');
    fs.writeFileSync(
      path.join(tmp, 'kaola-workflow', 'fast-fence-pre', 'fast-summary.md'),
      ['# Fast Summary: fast-fence-pre', '',
        '## Status', '```sh', 'IN_PROGRESS',
        '## Scope',
        '- Write Set: scripts/kaola-workflow-claim.js', '- Acceptance: node x', '',
        '## Plan', 'stuff'].join('\n')
    );
    plantRoadmapIssue(tmp, 215, 'body: candidate also touches scripts/kaola-workflow-claim.js');
    const result = runClassifierOffline(tmp, 215);
    assert(result.verdict === 'red',
      'issue #215 regression: unclosed fence before ## Scope must not hide the section; expected red, got ' + result.verdict);
    assert(result.reasoning && result.reasoning.includes('exact file path'),
      'pre-section unclosed fence red reasoning must mention exact file path; got: ' + result.reasoning);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('testClassifierFastScopePreSectionUnclosedFenceRed: PASSED');
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
  spawnSync('git', ['init', '-b', 'main'], { cwd: tmp, encoding: 'utf8', env });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: tmp, encoding: 'utf8', env });
  spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: tmp, encoding: 'utf8', env });
  fs.writeFileSync(path.join(tmp, 'README.md'), 'fixture\n');
  spawnSync('git', ['add', 'README.md'], { cwd: tmp, encoding: 'utf8', env });
  spawnSync('git', ['commit', '-m', 'init'], { cwd: tmp, encoding: 'utf8', env });
}

function initGitRepoWithBareRemote(tmp) {
  initGitRepo(tmp);
  const remotePath = tmp + '-remote';
  const env = { ...process.env, ...GIT_ISOLATION_ENV };
  spawnSync('git', ['init', '--bare', remotePath], { env });
  spawnSync('git', ['-C', tmp, 'remote', 'add', 'origin', remotePath], { env });
  spawnSync('git', ['-C', tmp, 'push', '-u', 'origin', 'main'], { env });
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
    spawnSync('git', ['add', '.gitignore'], { cwd: tmp, encoding: 'utf8' });
    spawnSync('git', ['commit', '-m', 'add gitignore'], { cwd: tmp, encoding: 'utf8' });
    const binDir = path.join(tmp, 'bin');
    writeGhShimForStartup(binDir);
    const result = runClaimOnlineLastJson(['startup', '--target-issue', '505'], tmp, binDir, { KAOLA_WORKTREE_NATIVE: '0' });
    assert(result.claim === 'acquired', 'startup 505 should acquire');
    assert(result.worktree_path === '', 'worktree_path must be empty when KAOLA_WORKTREE_NATIVE=0, got: ' + JSON.stringify(result.worktree_path));
    assert(result.worktree_error === undefined, 'worktree_error must be absent when KAOLA_WORKTREE_NATIVE=0 (gate-off path must not surface error field)');
    // Case A: in-place branch must be created and checked out
    const headBranch = spawnSync('git', ['-C', tmp, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    assert(headBranch === 'workflow/issue-505', 'NATIVE=0 must checkout in-place branch workflow/issue-505, got: ' + headBranch);
    // Tree must be clean (all untracked entries should be gitignored)
    const status = spawnSync('git', ['-C', tmp, 'status', '--porcelain'], { encoding: 'utf8' }).stdout.trim();
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
    spawnSync('git', ['add', '.gitignore'], { cwd: tmp, encoding: 'utf8' });
    spawnSync('git', ['commit', '-m', 'add gitignore'], { cwd: tmp, encoding: 'utf8' });
    const binDir = path.join(tmp, 'bin');
    writeGhShimForStartup(binDir);
    // First claim
    const first = runClaimOnlineLastJson(['startup', '--target-issue', '505'], tmp, binDir, { KAOLA_WORKTREE_NATIVE: '0' });
    assert(first.claim === 'acquired', 'first claim should acquire, got: ' + JSON.stringify(first));
    // Directly remove the project folder — leave branch present, HEAD on workflow/issue-505
    const projDir = path.join(tmp, 'kaola-workflow', 'issue-505');
    fs.rmSync(projDir, { recursive: true, force: true });
    // Verify HEAD is still on feature branch
    const headAfterRemove = spawnSync('git', ['-C', tmp, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    assert(headAfterRemove === 'workflow/issue-505', 'HEAD should still be on workflow/issue-505 after folder removal, got: ' + headAfterRemove);
    // Re-claim: should use existing branch (not -b), no error, base_branch empty
    const second = runClaimOnlineLastJson(['startup', '--target-issue', '505'], tmp, binDir, { KAOLA_WORKTREE_NATIVE: '0' });
    assert(second.claim === 'acquired', 'second claim should acquire (idempotent), got: ' + JSON.stringify(second));
    const headAfter = spawnSync('git', ['-C', tmp, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
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

function testWorktreeNativeDirtyTreeRefusal() {
  // Case C: dirty tree -> dirty_tree_refused, no folder, no branch, HEAD unchanged
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-wt-native-dirty-'));
  const kwRoot = fs.realpathSync(tmp) + '.kw';
  try {
    initGitRepo(tmp);
    // Dirty the tree by modifying a tracked file (README.md is committed)
    fs.writeFileSync(path.join(tmp, 'README.md'), 'dirty\n');
    const binDir = path.join(tmp, 'bin');
    writeGhShimForStartup(binDir);
    // cmdStartup exits 1 for dirty_tree_refused, so use raw spawnSync
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
    assert(lastLine, 'expected JSON output from dirty_tree_refused, got: ' + spawnResult.stdout);
    const parsed = JSON.parse(lastLine);
    assert(parsed.status === 'dirty_tree_refused', 'dirty tree must yield dirty_tree_refused, got: ' + JSON.stringify(parsed.status));
    assert(parsed.claim === 'none', 'dirty_tree_refused must have claim===none, got: ' + JSON.stringify(parsed.claim));
    // No project folder should be created
    assert(!fs.existsSync(path.join(tmp, 'kaola-workflow', 'issue-505')), 'project folder must not be created on dirty_tree_refused');
    // No feature branch should be created
    const branchCheck = spawnSync('git', ['-C', tmp, 'show-ref', '--verify', '--quiet', 'refs/heads/workflow/issue-505'], { encoding: 'utf8' });
    assert(branchCheck.status !== 0, 'feature branch must not be created on dirty_tree_refused');
    // HEAD must remain on main
    const head = spawnSync('git', ['-C', tmp, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    assert(head === 'main', 'HEAD must remain on main after dirty_tree_refused, got: ' + head);
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
    spawnSync('git', ['add', '.gitignore'], { cwd: tmp, encoding: 'utf8' });
    spawnSync('git', ['commit', '-m', 'add gitignore'], { cwd: tmp, encoding: 'utf8' });
    // Enter detached HEAD state
    const sha = spawnSync('git', ['-C', tmp, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    spawnSync('git', ['-C', tmp, 'checkout', '--detach', sha], { encoding: 'utf8' });
    const binDir = path.join(tmp, 'bin');
    writeGhShimForStartup(binDir);
    const result = runClaimOnlineLastJson(['startup', '--target-issue', '505'], tmp, binDir, { KAOLA_WORKTREE_NATIVE: '0' });
    assert(result.claim === 'acquired', 'detached HEAD must still acquire, got: ' + JSON.stringify(result));
    // No feature branch should be created
    const branchCheck = spawnSync('git', ['-C', tmp, 'show-ref', '--verify', '--quiet', 'refs/heads/workflow/issue-505'], { encoding: 'utf8' });
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
    spawnSync('git', ['add', '.gitignore'], { cwd: tmp, encoding: 'utf8' });
    spawnSync('git', ['commit', '-m', 'add gitignore'], { cwd: tmp, encoding: 'utf8' });
    const binDir = path.join(tmp, 'bin');
    writeGhShimForStartup(binDir);
    // Claim: should create workflow/issue-505 and base_branch: main
    const claimed = runClaimOnlineLastJson(['startup', '--target-issue', '505'], tmp, binDir, { KAOLA_WORKTREE_NATIVE: '0' });
    assert(claimed.claim === 'acquired', 'startup must acquire, got: ' + JSON.stringify(claimed));
    // Verify we are on the feature branch
    const headOnFeature = spawnSync('git', ['-C', tmp, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    assert(headOnFeature === 'workflow/issue-505', 'should be on feature branch before release, got: ' + headOnFeature);
    // Release from tmp root (NOT from inside the project folder)
    const releaseResult = runClaimOnlineLastJson(['release', '--project', 'issue-505'], tmp, binDir, { KAOLA_WORKTREE_NATIVE: '0' });
    assert(releaseResult.released === true, 'release must succeed, got: ' + JSON.stringify(releaseResult));
    // HEAD must be restored to main
    const headAfter = spawnSync('git', ['-C', tmp, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    assert(headAfter === 'main', 'HEAD must be restored to main after discard, got: ' + headAfter);
    // workflow/issue-505 branch must be deleted
    const branchGone = spawnSync('git', ['-C', tmp, 'show-ref', '--verify', '--quiet', 'refs/heads/workflow/issue-505'], { encoding: 'utf8' });
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
    spawnSync('git', ['add', '.gitignore'], { cwd: tmp, encoding: 'utf8' });
    spawnSync('git', ['commit', '-m', 'add gitignore'], { cwd: tmp, encoding: 'utf8' });
    // Create and checkout a non-default base branch 'develop'
    spawnSync('git', ['-C', tmp, 'checkout', '-b', 'develop'], { encoding: 'utf8' });
    fs.writeFileSync(path.join(tmp, 'DEV.md'), 'dev\n');
    spawnSync('git', ['-C', tmp, 'add', 'DEV.md'], { encoding: 'utf8' });
    spawnSync('git', ['-C', tmp, 'commit', '-m', 'dev commit'], { encoding: 'utf8' });
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
    const headAfter = spawnSync('git', ['-C', tmp, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    assert(headAfter === 'develop', 'HEAD must be restored to develop (recorded base_branch) after discard, got: ' + headAfter);
    // workflow/issue-505 branch must be deleted
    const branchGone = spawnSync('git', ['-C', tmp, 'show-ref', '--verify', '--quiet', 'refs/heads/workflow/issue-505'], { encoding: 'utf8' });
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
    plantRoadmapIssue(tmp, 506, '');
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
    // runClaimOnline hardcodes KAOLA_WORKTREE_NATIVE=1; KAOLA_ENABLE_ADAPTIVE=1 makes the adaptive path legal.
    const result = runClaimOnlineLastJson(
      ['startup', '--workflow-path', 'adaptive', '--target-issue', '507'],
      tmp, binDir, { KAOLA_ENABLE_ADAPTIVE: '1' });
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

function testFastStartupState() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-fast-startup-'));
  try {
    plantRoadmapIssue(tmp, 503, '');
    const result = json(runNode(claimScript, ['startup', '--target-issue', '503'], tmp, { KAOLA_PATH: 'fast' }));
    assert(result.claim === 'acquired', 'fast startup should acquire explicit issue');
    const state = read(statePath(tmp, 'issue-503'));
    assert(state.includes('workflow_path: fast'), 'fast startup should write workflow_path: fast');
    assert(state.includes('phase: fast'), 'fast startup should write phase: fast');
    assert(state.includes('next_command: /kaola-workflow-fast issue-503'), 'fast startup should route to fast command');
    assert(state.includes('next_skill: kaola-workflow-fast issue-503'), 'fast startup should route to fast skill');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// issue #208: a fast project with workflow_path:fast and an EMPTY next_command
// must resume to /kaola-workflow-fast, not /kaola-workflow-phase1. Pre-fix the
// fallback hard-codes /kaola-workflow-phase + (folder.phase||1); folder.phase is
// null for a fast project (parseInt('fast')=NaN), so it wrongly emits phase1.
function testResumeFastEmptyNextCommand() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-resume-fast-empty-'));
  try {
    writeProject(tmp, 'issue-208', {
      'workflow-state.md': [
        'name: issue-208',
        'issue_number: 208',
        'status: active',
        'phase: fast',
        'workflow_path: fast',
        'next_command:',
        ''
      ].join('\n')
    });
    const result = json(runNode(claimScript, ['resume'], tmp));
    assert(result.resumed === true, 'fast resume should succeed');
    assert(result.next_command === '/kaola-workflow-fast issue-208',
      'fast project with empty next_command must resume to the fast skill, got: ' + result.next_command);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
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
    spawnSync('git', ['worktree', 'add', '-b', 'workflow/issue-701', '--', wtPath, 'HEAD'], {
      cwd: tmp,
      encoding: 'utf8'
    });

    // Plant active folder inside the linked worktree (mirrors main copy)
    plantActiveFolder(wtPath, 'issue-701', 701, null);

    // Use --keep-worktree so the linked worktree directory is not removed after archiving;
    // this lets us assert that the archive exists inside the linked worktree.
    // archiveProjectDir runs (and performs cleanup) regardless of --keep-worktree.
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
    assert(
      fs.existsSync(path.join(wtPath, 'kaola-workflow', 'archive', 'issue-701')),
      'archive must exist in linked worktree after finalize'
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(kwRoot, { recursive: true, force: true });
  }
}

function testFinalizeNarrowStagingExcludesForeignArchive() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-finalize-narrow-stage-')));
  const kwRoot = tmp + '.kw';
  try {
    initGitRepo(tmp);
    // Plant active folder and roadmap issue in main worktree, then commit
    plantActiveFolder(tmp, 'issue-701', 701, null);
    plantRoadmapIssue(tmp, 701, '');
    spawnSync('git', ['-C', tmp, 'add', '-A'], { encoding: 'utf8' });
    spawnSync('git', ['-C', tmp, 'commit', '-m', 'plant'], { encoding: 'utf8' });
    // Create linked worktree on a feature branch
    const wtPath = path.join(kwRoot, 'issue-701');
    fs.mkdirSync(kwRoot, { recursive: true });
    spawnSync('git', ['worktree', 'add', '-b', 'workflow/issue-701', '--', wtPath, 'HEAD'], {
      cwd: tmp,
      encoding: 'utf8'
    });
    // Mirror active folder in linked worktree
    plantActiveFolder(wtPath, 'issue-701', 701, null);
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
    const showResult = spawnSync('git', ['show', 'HEAD', '--name-only', '--no-renames'], {
      cwd: wtPath,
      encoding: 'utf8'
    });
    const showOutput = showResult.stdout;
    // Must include finalized project's archive (dest of rename)
    assert(
      /kaola-workflow\/archive\/issue-701\//.test(showOutput),
      'committed HEAD must include issue-701 archive files\ngit show output:\n' + showOutput
    );
    // Must include ROADMAP.md regeneration
    assert(
      /kaola-workflow\/ROADMAP\.md/.test(showOutput),
      'committed HEAD must include ROADMAP.md\ngit show output:\n' + showOutput
    );
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
    try { spawnSync('git', ['-C', tmp, 'worktree', 'remove', '--force', kwRoot + '/issue-701'], { encoding: 'utf8' }); } catch (_) {}
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(kwRoot, { recursive: true, force: true });
  }
  console.log('testFinalizeNarrowStagingExcludesForeignArchive: PASSED');
}

function testFinalizeFromMainRootNoSpuriousRemoval() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-finalize-main-noop-')));
  try {
    // No git repo — getCoordRoot falls back to tmp/.git (fake path),
    // mainRootFromCoord returns tmp, realpathSync(tmp) === realpathSync(root),
    // so the cleanup block is a no-op. Archive rename still happens normally.
    plantActiveFolder(tmp, 'issue-702', 702, null);

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
    spawnSync('git', ['worktree', 'add', '-b', 'workflow/issue-703', '--', wtPath, 'HEAD'], {
      cwd: tmp,
      encoding: 'utf8'
    });

    // Plant active folder inside the linked worktree
    plantActiveFolder(wtPath, 'issue-703', 703, null);

    // cwd is the linked worktree ROOT, not the project subdir inside it,
    // so cwdInside(folder.project_dir) guard in cmdRelease does not fire.
    // Note: release always calls removeWorktree, which removes the linked worktree directory
    // after archiving. We therefore verify archive creation via the JSON result rather than
    // post-call filesystem inspection of the now-removed wtPath.
    const result = spawnSync(process.execPath, [claimScript, 'release', '--project', 'issue-703', '--reason', 'test'], {
      cwd: wtPath,
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' },
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
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(kwRoot, { recursive: true, force: true });
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
    spawnSync('git', ['worktree', 'add', '-b', 'workflow/issue-941', '--', wtPath, 'HEAD'], {
      cwd: tmp,
      encoding: 'utf8'
    });

    // Add a real commit on the feature branch so the merge fast-forwards main.
    fs.writeFileSync(path.join(wtPath, 'feature.txt'), 'feature\n');
    spawnSync('git', ['add', 'feature.txt'], { cwd: wtPath, encoding: 'utf8' });
    spawnSync('git', ['commit', '-m', 'feature commit'], { cwd: wtPath, encoding: 'utf8' });

    // Plant active folder in main worktree so Step 0 sees the worktree to remove.
    plantActiveFolder(tmp, 'issue-941', 941, null);

    const mainBefore = spawnSync('git', ['rev-parse', 'main'], { cwd: tmp, encoding: 'utf8' }).stdout.trim();
    const featureHead = spawnSync('git', ['rev-parse', 'workflow/issue-941'], { cwd: wtPath, encoding: 'utf8' }).stdout.trim();
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

    const mainAfter = spawnSync('git', ['rev-parse', 'main'], { cwd: tmp, encoding: 'utf8' }).stdout.trim();
    assert(
      mainAfter === featureHead,
      'main should advance to feature branch HEAD after sink-merge from linked worktree\n' +
      'before: ' + mainBefore + '\nfeature: ' + featureHead + '\nafter: ' + mainAfter
    );

    const branchList = spawnSync('git', ['branch', '--list', 'workflow/issue-941'], {
      cwd: tmp, encoding: 'utf8'
    }).stdout.trim();
    assert(
      branchList === '',
      'feature branch should be deleted after sink-merge (Step 9), got: ' + JSON.stringify(branchList)
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(kwRoot, { recursive: true, force: true });
  }
}

function testNoTargetZeroActive() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-no-target-zero-'));
  try {
    const result = runNode(claimScript, ['startup'], tmp);
    assert(result.status === 1, 'no-target + zero active should exit 1, got ' + result.status);
    const out = JSON.parse(result.stdout);
    assert(out.verdict === 'no_target', 'expected verdict: no_target, got ' + out.verdict);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testNoTargetOneActive() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-no-target-one-'));
  try {
    plantActiveFolder(tmp, 'issue-600', 600, null);
    const result = runNode(claimScript, ['startup'], tmp);
    assert(result.status === 1, 'no-target + one active should exit 1, got ' + result.status);
    const out = JSON.parse(result.stdout);
    assert(out.verdict === 'no_target', 'expected verdict: no_target, got ' + out.verdict);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testNoTargetMultipleActive() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-no-target-multi-'));
  try {
    plantActiveFolder(tmp, 'issue-601', 601, null);
    plantActiveFolder(tmp, 'issue-602', 602, null);
    const result = runNode(claimScript, ['startup'], tmp);
    assert(result.status === 1, 'no-target + multiple active should exit 1, got ' + result.status);
    const out = JSON.parse(result.stdout);
    assert(out.verdict === 'no_target', 'expected verdict: no_target, got ' + out.verdict);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
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
      spawnSync('git', ['worktree', 'add', '-b', 'workflow/issue-200', '--', wtPath, 'HEAD'], {
        cwd: tmp, encoding: 'utf8'
      });
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
      spawnSync('git', ['worktree', 'add', '-b', 'workflow/issue-300', '--', wtPath, 'HEAD'], {
        cwd: tmp, encoding: 'utf8'
      });
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
      spawnSync('git', ['worktree', 'add', '-b', 'workflow/issue-100', '--', wtPath, 'HEAD'], {
        cwd: tmp, encoding: 'utf8'
      });
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
      spawnSync('git', ['worktree', 'add', '-b', 'workflow/issue-200', '--', wtPath, 'HEAD'], {
        cwd: tmp, encoding: 'utf8'
      });
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
      spawnSync('git', ['branch', 'workflow/issue-400'], { cwd: tmp, encoding: 'utf8' });
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
      spawnSync('git', ['worktree', 'add', '-b', 'workflow/issue-500', '--', wtPath, 'HEAD'], {
        cwd: tmp, encoding: 'utf8'
      });
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
      spawnSync('git', ['worktree', 'add', '-b', 'workflow/issue-200', '--', wtPath, 'HEAD'], {
        cwd: tmp, encoding: 'utf8'
      });
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
      spawnSync('git', ['worktree', 'add', '-b', 'workflow/issue-200', '--', wtPath, 'HEAD'], {
        cwd: tmp, encoding: 'utf8'
      });
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
      spawnSync('git', ['worktree', 'add', '-b', 'workflow/issue-200', '--', wtPath, 'HEAD'], {
        cwd: tmp, encoding: 'utf8'
      });
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
      spawnSync('git', ['worktree', 'add', '-b', 'workflow/issue-200', '--', wtPath, 'HEAD'], {
        cwd: tmp, encoding: 'utf8'
      });
      fs.writeFileSync(path.join(wtPath, 'dirty.txt'), 'x');
      const out = runClaimOnline(['stale-worktree-cleanup', '--execute', '--archive'], tmp, binDir);
      assert(Array.isArray(out.stashed) && out.stashed.some(p => p === wtPath),
        'sc4: stashed must contain wtPath, got: ' + JSON.stringify(out.stashed));
      assert(Array.isArray(out.removed) && out.removed.some(p => p === wtPath),
        'sc4: removed must contain wtPath, got: ' + JSON.stringify(out.removed));
      assert(!fs.existsSync(wtPath), 'sc4: worktree dir must be removed after archive+execute');
      const stashList = execFileSync('git', ['-C', tmp, 'stash', 'list'], { encoding: 'utf8' });
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
      spawnSync('git', ['worktree', 'add', '-b', 'workflow/issue-200', '--', wtPath, 'HEAD'], {
        cwd: tmp, encoding: 'utf8'
      });
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
      spawnSync('git', ['worktree', 'add', '-b', 'workflow/issue-200', '--', wtPath, 'HEAD'], {
        cwd: tmp, encoding: 'utf8'
      });
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
      spawnSync('git', ['worktree', 'add', '-b', 'workflow/issue-200', '--', wtPath, 'HEAD'], {
        cwd: tmp, encoding: 'utf8'
      });
      const out = runClaimOnline(['stale-worktree-cleanup', '--execute', '--keep-branch'], tmp, binDir);
      assert(Array.isArray(out.removed) && out.removed.some(p => p === wtPath),
        'sc7: removed must contain wtPath, got: ' + JSON.stringify(out.removed));
      assert(!out.deleted_branch || out.deleted_branch.length === 0,
        'sc7: deleted_branch must be empty with --keep-branch, got: ' + JSON.stringify(out.deleted_branch));
      assert(!fs.existsSync(wtPath), 'sc7: worktree dir must be removed');
      // Branch must still exist
      execFileSync('git', ['-C', tmp, 'rev-parse', '--verify', 'refs/heads/workflow/issue-200'],
        { stdio: 'pipe' });
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
      spawnSync('git', ['worktree', 'add', '-b', 'workflow/issue-200', '--', wtPath, 'HEAD'], {
        cwd: tmp, encoding: 'utf8'
      });
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
      spawnSync('git', ['worktree', 'add', '-b', 'workflow/issue-200', '--', wtPath, 'HEAD'], {
        cwd: tmp, encoding: 'utf8'
      });
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
      spawnSync('git', ['worktree', 'add', '-b', 'workflow/issue-200', '--', wtPath, 'HEAD'], {
        cwd: tmp, encoding: 'utf8'
      });
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
      spawnSync('git', ['worktree', 'add', '-b', 'workflow/issue-200', '--', wtPath, 'HEAD'], {
        cwd: tmp, encoding: 'utf8'
      });
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
    spawnSync('git', ['init'], { cwd: tmp, stdio: 'pipe' });
    spawnSync('git', ['-C', tmp, 'config', 'user.email', 'test@example.com'], { stdio: 'pipe' });
    spawnSync('git', ['-C', tmp, 'config', 'user.name', 'Test User'], { stdio: 'pipe' });
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
    spawnSync('git', ['-C', tmp, 'add', '-A'], { stdio: 'pipe' });
    spawnSync('git', ['-C', tmp, 'commit', '-m', 'initial'], { stdio: 'pipe' });
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
    const status = spawnSync('git', ['-C', tmp, 'status', '--porcelain', '--untracked-files=no'],
      { stdio: 'pipe' });
    assert(status.stdout.toString().trim() === '',
      'worktree must be clean after sink-pr. got: ' + JSON.stringify(status.stdout.toString()));
    // workflow-state.md must contain pr_url
    const stateContents = fs.readFileSync(path.join(kwDir, 'workflow-state.md'), 'utf8');
    assert(stateContents.includes('pr_url:'), 'workflow-state.md must record pr_url');
    // Exactly 2 commits: initial + metadata follow-up
    const revCount = spawnSync('git', ['-C', tmp, 'rev-list', '--count', 'HEAD'], { stdio: 'pipe' });
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
    spawnSync('git', ['add', 'feature-850.txt'], { cwd: wt850 });
    spawnSync('git', ['commit', '-m', 'feat: issue 850'], { cwd: wt850 });

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
    const headCountBefore = spawnSync('git', ['rev-list', '--count', 'HEAD'], { cwd: wt850, encoding: 'utf8' }).stdout.trim();
    const wfResult2 = runClaimOnlineLastJson(['worktree-finalize', '--project', 'issue-850'], tmp, binDir);
    assert(wfResult2.finalized === true, 'second worktree-finalize (no-diff path) must return finalized:true');
    const headCountAfter = spawnSync('git', ['rev-list', '--count', 'HEAD'], { cwd: wt850, encoding: 'utf8' }).stdout.trim();
    assert(headCountAfter === headCountBefore,
      'second worktree-finalize must not create a commit (no-diff branch); HEAD count was ' +
      headCountBefore + ', now ' + headCountAfter);

    // Step 4: finalize --keep-worktree (cwd=wt850, cleans main worktree copy, preserves linked worktree)
    const finResult = spawnSync(process.execPath, [
      claimScript, 'finalize', '--project', 'issue-850', '--keep-worktree'
    ], { cwd: wt850, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
    assert(finResult.status === 0, 'finalize --keep-worktree should exit 0\nstderr: ' + finResult.stderr);
    assert(
      fs.existsSync(path.join(wt850, 'kaola-workflow', 'archive', 'issue-850')),
      'archive must exist in linked worktree after finalize --keep-worktree'
    );
    assert(
      !fs.existsSync(path.join(tmp, 'kaola-workflow', 'issue-850')),
      'main active folder must be removed after finalize from linked worktree'
    );
    assert(fs.existsSync(wt850), 'linked worktree must survive --keep-worktree finalize');

    // Verify that finalize --keep-worktree committed the archive to the feature branch
    const liveInTree = spawnSync('git', ['cat-file', '-e', 'HEAD:kaola-workflow/issue-850/workflow-state.md'],
      { cwd: wt850, encoding: 'utf8' });
    assert(liveInTree.status !== 0,
      'live workflow-state.md must NOT be in feature branch HEAD after finalize --keep-worktree');
    const archiveInTree = spawnSync('git', ['cat-file', '-e', 'HEAD:kaola-workflow/archive/issue-850'],
      { cwd: wt850, encoding: 'utf8' });
    assert(archiveInTree.status === 0,
      'kaola-workflow/archive/issue-850 must exist in feature branch HEAD after finalize --keep-worktree');

    // #333: the ## Closure append must land INSIDE the `chore: archive` commit (commit-last
    // ordering). After the FIRST finalize --keep-worktree the feature worktree must be clean —
    // a dirty append would break the #217 second-finalize no-new-commit assert below.
    const cleanAfterFinalize = spawnSync('git', ['status', '--porcelain'],
      { cwd: wt850, encoding: 'utf8' }).stdout.trim();
    assert(cleanAfterFinalize === '',
      '#333: feature worktree must be clean after finalize --keep-worktree (## Closure append inside commit), got: ' + cleanAfterFinalize);
    const archivedState850 = fs.readFileSync(path.join(wt850, 'kaola-workflow', 'archive', 'issue-850', 'workflow-state.md'), 'utf8');
    assert(/^## Closure$/m.test(archivedState850),
      '#333: archived state must carry a ## Closure block after finalize --keep-worktree');

    // issue #217: a second finalize --keep-worktree on a clean index must be a no-op (not crash)
    const headBefore2nd = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: wt850, encoding: 'utf8' }).stdout.trim();
    const finResult2 = spawnSync(process.execPath, [
      claimScript, 'finalize', '--project', 'issue-850', '--keep-worktree'
    ], { cwd: wt850, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
    assert(finResult2.status === 0, 'second finalize --keep-worktree must exit 0 (idempotent)\nstderr: ' + finResult2.stderr);
    const headAfter2nd = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: wt850, encoding: 'utf8' }).stdout.trim();
    assert(headAfter2nd === headBefore2nd, 'second finalize --keep-worktree must not create a commit, HEAD changed: ' + headBefore2nd + ' -> ' + headAfter2nd);

    // Capture feature HEAD before sink-merge removes the worktree
    const featureHead = spawnSync('git', ['rev-parse', 'workflow/issue-850'],
      { cwd: tmp, encoding: 'utf8' }).stdout.trim();

    // Step 5: sink-merge (cwd=wt850, OFFLINE)
    const smResult = spawnSync(process.execPath, [
      sinkMergeScript, '--project', 'issue-850', '--branch', 'workflow/issue-850', '--issue', '850'
    ], { cwd: wt850, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
    assert(smResult.status === 0,
      'sink-merge should exit 0\nstdout: ' + smResult.stdout + '\nstderr: ' + smResult.stderr);

    const mainAfter = spawnSync('git', ['rev-parse', 'main'],
      { cwd: tmp, encoding: 'utf8' }).stdout.trim();
    assert(mainAfter === featureHead,
      'main must advance to feature HEAD after sink-merge, got: ' + mainAfter);
    const branchList = spawnSync('git', ['branch', '--list', 'workflow/issue-850'],
      { cwd: tmp, encoding: 'utf8' }).stdout.trim();
    assert(branchList === '', 'workflow/issue-850 branch must be deleted after sink-merge');
    assert(!fs.existsSync(wt850), 'linked worktree must be removed by sink-merge');
    const gitStatus = spawnSync('git', ['status', '--porcelain', '--untracked-files=no'],
      { cwd: tmp, encoding: 'utf8' }).stdout.trim();
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
    spawnSync('git', ['checkout', '-b', 'workflow/issue-910'], { cwd: tmp });
    fs.mkdirSync(path.join(tmp, 'kaola-workflow', 'issue-910'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'kaola-workflow', 'issue-910', 'workflow-state.md'), 'status: active\n');
    spawnSync('git', ['add', 'kaola-workflow/'], { cwd: tmp });
    spawnSync('git', ['commit', '-m', 'feat: issue 910'], { cwd: tmp });
    spawnSync('git', ['checkout', 'main'], { cwd: tmp });
    const mainBefore = spawnSync('git', ['rev-parse', 'main'], { cwd: tmp, encoding: 'utf8' }).stdout.trim();
    const result = spawnSync(process.execPath, [sinkMergeScript, '--project', 'issue-910', '--branch', 'workflow/issue-910'], {
      cwd: tmp,
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' },
      encoding: 'utf8'
    });
    assert(result.status !== 0, 'sink-merge must refuse when live folder present, got status: ' + result.status);
    assert((result.stderr || '').includes('finalize before sink-merge'), 'stderr must include "finalize before sink-merge", got: ' + result.stderr);
    const mainAfter = spawnSync('git', ['rev-parse', 'main'], { cwd: tmp, encoding: 'utf8' }).stdout.trim();
    assert(mainAfter === mainBefore, 'main SHA must be unchanged after guard fires, before: ' + mainBefore + ' after: ' + mainAfter);
    console.log('testSinkMergeRefusesLiveFolder: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testSinkMergeBlocksUnpushedCommits() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-merge-block-')));
  const remotePath = initGitRepoWithBareRemote(tmp);
  try {
    spawnSync('git', ['-C', tmp, 'checkout', '-b', 'workflow/issue-911']);
    spawnSync('git', ['-C', tmp, 'push', '-u', 'origin', 'workflow/issue-911']);
    fs.writeFileSync(path.join(tmp, 'unpushed.txt'), 'test');
    spawnSync('git', ['-C', tmp, 'add', 'unpushed.txt']);
    spawnSync('git', ['-C', tmp, 'commit', '-m', 'unpushed commit', '--allow-empty-message', '--no-edit'], { env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@test.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@test.com' } });
    const mainBefore = spawnSync('git', ['-C', tmp, 'rev-parse', 'main'], { encoding: 'utf8' }).stdout.trim();
    const result = spawnSync(process.execPath, [sinkMergeScript, '--project', 'issue-911', '--branch', 'workflow/issue-911'], {
      cwd: tmp,
      encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '0' }
    });
    assert(result.status !== 0, 'sink-merge must refuse when branch has unpushed commits, got status: ' + result.status);
    assert((result.stderr || '').includes('workflow/issue-911'), 'stderr must include branch name, got: ' + result.stderr);
    assert((result.stderr || '').includes('unpushed'), 'stderr must include "unpushed", got: ' + result.stderr);
    const mainAfter = spawnSync('git', ['-C', tmp, 'rev-parse', 'main'], { encoding: 'utf8' }).stdout.trim();
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
    spawnSync('git', ['-C', tmp, 'checkout', '-b', 'workflow/issue-913']);
    // A real (non-workflow) impl commit so assertBranchHasNonWorkflowChanges passes. The branch
    // is a descendant of origin/main → alreadyUpToDate (no rebase / no recursive npm test).
    fs.writeFileSync(path.join(tmp, 'feature.txt'), 'impl');
    spawnSync('git', ['-C', tmp, 'add', 'feature.txt']);
    spawnSync('git', ['-C', tmp, 'commit', '-m', 'feat: real impl'], { env: genv });
    // DELIBERATELY do NOT push the branch / set upstream (the #323 gap).
    const mainBefore = spawnSync('git', ['-C', tmp, 'rev-parse', 'main'], { encoding: 'utf8' }).stdout.trim();
    const result = spawnSync(process.execPath, [sinkMergeScript, '--project', 'issue-913', '--branch', 'workflow/issue-913'], {
      cwd: tmp, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '0' }
    });
    assert(!String(result.stderr || '').includes('no upstream tracking ref'),
      '#323: sink-merge must NOT abort on a no-upstream branch (auto-push self-heal), got stderr: ' + result.stderr);
    assert(result.status === 0,
      '#323: sink-merge completes without a manual git push -u, got status ' + result.status + '\nstderr: ' + result.stderr);
    const mainAfter = spawnSync('git', ['-C', tmp, 'rev-parse', 'main'], { encoding: 'utf8' }).stdout.trim();
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
    spawnSync('git', ['-C', tmp, 'checkout', '-b', 'workflow/issue-912']);
    fs.writeFileSync(path.join(tmp, 'local.txt'), 'test');
    spawnSync('git', ['-C', tmp, 'add', 'local.txt']);
    spawnSync('git', ['-C', tmp, 'commit', '-m', 'local commit'], { env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@test.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@test.com' } });
    const featureHead = spawnSync('git', ['-C', tmp, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    const result = spawnSync(process.execPath, [sinkMergeScript, '--project', 'issue-912', '--branch', 'workflow/issue-912'], {
      cwd: tmp,
      encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
    });
    assert(result.status === 0, 'sink-merge must succeed when OFFLINE=1 even with no upstream, got: ' + result.status + '\nstderr: ' + result.stderr);
    const mainAfter = spawnSync('git', ['-C', tmp, 'rev-parse', 'main'], { encoding: 'utf8' }).stdout.trim();
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
    spawnSync('git', ['init', '-b', 'master', tmp], { env });
    fs.writeFileSync(path.join(tmp, 'README.md'), 'seed');
    spawnSync('git', ['-C', tmp, 'add', '-A'], { env });
    spawnSync('git', ['-C', tmp, 'commit', '-m', 'seed'], { env });
    spawnSync('git', ['init', '--bare', '-b', 'master', remotePath], { env });
    spawnSync('git', ['-C', tmp, 'remote', 'add', 'origin', remotePath], { env });
    spawnSync('git', ['-C', tmp, 'push', '-u', 'origin', 'master'], { env });
    spawnSync('git', ['-C', tmp, 'remote', 'set-head', 'origin', 'master'], { env }); // origin/HEAD → master (defaultBranch resolves it offline)
    spawnSync('git', ['-C', tmp, 'checkout', '-b', 'workflow/issue-3502'], { env });
    fs.writeFileSync(path.join(tmp, 'feat.txt'), 'impl');
    spawnSync('git', ['-C', tmp, 'add', 'feat.txt'], { env });
    spawnSync('git', ['-C', tmp, 'commit', '-m', 'feat: impl 3502'], { env });
    const masterBefore = spawnSync('git', ['-C', tmp, 'rev-parse', 'master'], { encoding: 'utf8', env }).stdout.trim();
    const result = spawnSync(process.execPath, [sinkMergeScript, '--project', 'issue-3502', '--branch', 'workflow/issue-3502'], {
      cwd: tmp, encoding: 'utf8', env: { ...env, KAOLA_WORKFLOW_OFFLINE: '1' }
    });
    assert(result.status === 0, '#350: sink-merge merges on a master default branch (offline), got status ' + result.status + '\nstderr: ' + result.stderr);
    const masterAfter = spawnSync('git', ['-C', tmp, 'rev-parse', 'master'], { encoding: 'utf8', env }).stdout.trim();
    assert(masterBefore !== masterAfter, '#350: master (the resolved default branch) advanced via FF — not a hardcoded main');
    const mainBranch = spawnSync('git', ['-C', tmp, 'branch', '--list', 'main'], { encoding: 'utf8', env }).stdout.trim();
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
    spawnSync('git', ['-C', tmp, 'checkout', '-b', 'workflow/issue-3501'], { env });
    fs.writeFileSync(path.join(tmp, 'feat.txt'), 'impl');
    spawnSync('git', ['-C', tmp, 'add', 'feat.txt'], { env });
    spawnSync('git', ['-C', tmp, 'commit', '-m', 'feat: impl 3501'], { env });
    spawnSync('git', ['-C', tmp, 'push', '-u', 'origin', 'workflow/issue-3501'], { env });
    // Prepare a clone with a committed-but-unpushed advance to main (pushed mid-flight by the hook).
    // (The bare remote's symbolic HEAD is 'master' under GIT_CONFIG_NOSYSTEM, so clone checks out no
    // branch — explicitly materialize local 'main' from origin/main before committing to it.)
    spawnSync('git', ['clone', remotePath, clone], { env });
    spawnSync('git', ['-C', clone, 'checkout', '-B', 'main', 'origin/main'], { env });
    fs.writeFileSync(path.join(clone, 'concurrent.txt'), 'x');
    spawnSync('git', ['-C', clone, 'add', '-A'], { env });
    spawnSync('git', ['-C', clone, 'commit', '-m', 'concurrent main advance'], { env });
    const result = spawnSync(process.execPath, [sinkMergeScript, '--project', 'issue-3501', '--branch', 'workflow/issue-3501'], {
      cwd: tmp, encoding: 'utf8',
      env: { ...env, KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_WORKFLOW_SKIP_TESTGATE: '1', KAOLA_WORKFLOW_FF_RACE_PUSH_DIR: clone }
    });
    assert(result.status === 0, '#350: sink-merge recovers from a mid-flight origin advance via re-rebase, got status ' + result.status + '\nstderr: ' + result.stderr);
    spawnSync('git', ['-C', tmp, 'fetch', '-q', 'origin'], { env }); // read the authoritative remote state, not the stale tracking ref
    const log = spawnSync('git', ['-C', tmp, 'log', '--oneline', 'origin/main'], { encoding: 'utf8', env }).stdout;
    assert(/impl 3501/.test(log), '#350: feature commit landed on origin/main after re-rebase, got log: ' + log);
    assert(/concurrent main advance/.test(log), '#350: concurrent main advance preserved (feature rebased onto it)');
    console.log('testSinkMergeReRebasesOnFfRace: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(remotePath, { recursive: true, force: true });
    try { fs.rmSync(clone, { recursive: true, force: true }); } catch (_) {}
  }
}

function testFastE2EMergeFullChain() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-e2e-fast-')));
  const kwRoot = tmp + '.kw';
  try {
    initGitRepo(tmp);
    const binDir = path.join(tmp, 'bin');
    writeGhShimForStartup(binDir);

    // Step 1: startup with KAOLA_PATH=fast
    const s851 = runClaimOnline(['startup', '--target-issue', '851'], tmp, binDir, { KAOLA_PATH: 'fast' });
    assert(s851.claim === 'acquired', 'startup 851 should acquire, got: ' + JSON.stringify(s851));
    const wt851 = s851.worktree_path;
    assert(fs.existsSync(wt851), 'worktree dir must exist after startup');

    // Step 2: write fast-summary.md to the main repo's active project folder
    fs.writeFileSync(path.join(tmp, 'kaola-workflow', 'issue-851', 'fast-summary.md'), 'fast summary\n');

    // Step 3: feature commit on linked worktree branch
    fs.writeFileSync(path.join(wt851, 'feature-851.txt'), 'feature\n');
    spawnSync('git', ['add', 'feature-851.txt'], { cwd: wt851 });
    spawnSync('git', ['commit', '-m', 'feat: issue 851'], { cwd: wt851 });

    // Step 4: worktree-finalize (cwd=tmp, reads worktree_path from main active folder)
    const wfResult = runClaimOnlineLastJson(['worktree-finalize', '--project', 'issue-851'], tmp, binDir);
    assert(wfResult.finalized === true, 'worktree-finalize should succeed');
    assert(
      fs.existsSync(path.join(wt851, 'kaola-workflow', 'issue-851', 'workflow-state.md')),
      'workflow-state.md must exist in linked worktree after worktree-finalize'
    );

    // Step 5: finalize --keep-worktree (cwd=wt851, cleans main worktree copy, preserves linked worktree)
    const finResult = spawnSync(process.execPath, [
      claimScript, 'finalize', '--project', 'issue-851', '--keep-worktree'
    ], { cwd: wt851, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
    assert(finResult.status === 0, 'finalize --keep-worktree should exit 0\nstderr: ' + finResult.stderr);
    assert(
      fs.existsSync(path.join(wt851, 'kaola-workflow', 'archive', 'issue-851')),
      'archive must exist in linked worktree after finalize --keep-worktree'
    );
    assert(
      !fs.existsSync(path.join(tmp, 'kaola-workflow', 'issue-851')),
      'main active folder must be removed after finalize from linked worktree'
    );
    assert(fs.existsSync(wt851), 'linked worktree must survive --keep-worktree finalize');

    // Verify that finalize --keep-worktree committed the archive to the feature branch
    const liveInTree = spawnSync('git', ['cat-file', '-e', 'HEAD:kaola-workflow/issue-851/workflow-state.md'],
      { cwd: wt851, encoding: 'utf8' });
    assert(liveInTree.status !== 0,
      'live workflow-state.md must NOT be in feature branch HEAD after finalize --keep-worktree');
    const archiveInTree = spawnSync('git', ['cat-file', '-e', 'HEAD:kaola-workflow/archive/issue-851'],
      { cwd: wt851, encoding: 'utf8' });
    assert(archiveInTree.status === 0,
      'kaola-workflow/archive/issue-851 must exist in feature branch HEAD after finalize --keep-worktree');

    // Capture feature HEAD before sink-merge removes the worktree
    const featureHead = spawnSync('git', ['rev-parse', 'workflow/issue-851'],
      { cwd: tmp, encoding: 'utf8' }).stdout.trim();

    // Step 6: sink-merge (cwd=wt851, OFFLINE)
    const smResult = spawnSync(process.execPath, [
      sinkMergeScript, '--project', 'issue-851', '--branch', 'workflow/issue-851', '--issue', '851'
    ], { cwd: wt851, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
    assert(smResult.status === 0,
      'sink-merge should exit 0\nstdout: ' + smResult.stdout + '\nstderr: ' + smResult.stderr);

    const mainAfter = spawnSync('git', ['rev-parse', 'main'],
      { cwd: tmp, encoding: 'utf8' }).stdout.trim();
    assert(mainAfter === featureHead,
      'main must advance to feature HEAD after sink-merge, got: ' + mainAfter);
    const branchList = spawnSync('git', ['branch', '--list', 'workflow/issue-851'],
      { cwd: tmp, encoding: 'utf8' }).stdout.trim();
    assert(branchList === '', 'workflow/issue-851 branch must be deleted after sink-merge');
    assert(!fs.existsSync(wt851), 'linked worktree must be removed by sink-merge');
    const gitStatus = spawnSync('git', ['status', '--porcelain', '--untracked-files=no'],
      { cwd: tmp, encoding: 'utf8' }).stdout.trim();
    assert(gitStatus === '', 'main worktree must be clean after sink-merge, got: ' + gitStatus);
    assert(
      !fs.existsSync(path.join(tmp, 'kaola-workflow', 'issue-851')),
      'live workflow folder must be absent from main after sink-merge'
    );
    assert(
      fs.existsSync(path.join(tmp, 'kaola-workflow', 'archive', 'issue-851')),
      'archive folder must be present in main after sink-merge'
    );
    assert(
      fs.existsSync(path.join(tmp, 'kaola-workflow', 'archive', 'issue-851', 'fast-summary.md')),
      'fast-summary.md must be preserved in archive after sink-merge'
    );

    console.log('testFastE2EMergeFullChain: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
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
    spawnSync('git', ['add', '-A'], { cwd: wt860 });
    const diff = spawnSync('git', ['-C', wt860, 'diff', '--cached', '--quiet'], { stdio: 'pipe' });
    if (diff.status !== 0) {
      spawnSync('git', ['commit', '-m', 'chore: pre-sink-pr state'], { cwd: wt860 });
    }

    // Step 4: sink-pr (cwd=wt860, OFFLINE) — production ordering: sink-pr runs before finalize/archive
    const spResult = spawnSync(process.execPath, [
      sinkPrScript, '--branch', 'workflow/issue-860', '--project', 'issue-860', '--issue', '860'
    ], { cwd: wt860, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
    assert(spResult.status === 0,
      'sink-pr offline should exit 0\nstdout: ' + spResult.stdout + '\nstderr: ' + spResult.stderr);

    const linkedState = fs.readFileSync(path.join(kwDir860, 'workflow-state.md'), 'utf8');
    assert(linkedState.includes('pr_url:'), 'linked worktree workflow-state.md must contain pr_url after sink-pr');
    const prStatus = spawnSync('git', ['-C', wt860, 'status', '--porcelain', '--untracked-files=no'],
      { stdio: 'pipe' });
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
    spawnSync('git', ['add', 'feature-870.txt'], { cwd: wt870 });
    spawnSync('git', ['commit', '-m', 'feat: issue 870'], { cwd: wt870 });

    // Step 3: worktree-finalize 870 (cwd=tmp)
    const wfResult = runClaimOnlineLastJson(['worktree-finalize', '--project', 'issue-870'], tmp, binDir);
    assert(wfResult.finalized === true, 'worktree-finalize 870 should succeed');

    // Step 4: finalize --keep-worktree 870 (cwd=wt870)
    const finResult = spawnSync(process.execPath, [
      claimScript, 'finalize', '--project', 'issue-870', '--keep-worktree'
    ], { cwd: wt870, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
    assert(finResult.status === 0,
      'finalize 870 --keep-worktree should exit 0\nstderr: ' + finResult.stderr);

    // Capture feature HEAD before sink-merge removes the worktree
    const feature870Head = spawnSync('git', ['rev-parse', 'workflow/issue-870'],
      { cwd: tmp, encoding: 'utf8' }).stdout.trim();

    // Step 5: sink-merge 870 (cwd=wt870, OFFLINE)
    const smResult = spawnSync(process.execPath, [
      sinkMergeScript, '--project', 'issue-870', '--branch', 'workflow/issue-870', '--issue', '870'
    ], { cwd: wt870, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
    assert(smResult.status === 0,
      'sink-merge 870 should exit 0\nstdout: ' + smResult.stdout + '\nstderr: ' + smResult.stderr);

    const mainAfter870 = spawnSync('git', ['rev-parse', 'main'],
      { cwd: tmp, encoding: 'utf8' }).stdout.trim();
    assert(mainAfter870 === feature870Head,
      'main must advance to 870 feature HEAD after sink-merge, got: ' + mainAfter870);

    const branch870 = spawnSync('git', ['branch', '--list', 'workflow/issue-870'],
      { cwd: tmp, encoding: 'utf8' }).stdout.trim();
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
    const branch871 = spawnSync('git', ['branch', '--list', 'workflow/issue-871'],
      { cwd: tmp, encoding: 'utf8' }).stdout.trim();
    assert(branch871 !== '', 'workflow/issue-871 branch must still exist');

    console.log('testParallelIssueIndependence: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
  }
}

function testFinalizeCleansRoadmapEntry() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-finalize-roadmap-clean-'));
  try {
    initGitRepo(tmp);
    plantActiveFolder(tmp, 'issue-910', 910, null);
    plantRoadmapIssue(tmp, 910, '');
    // Generate ROADMAP.md so we can assert it lists #910 before finalize
    const genResult = runNode(roadmapScript, ['generate'], tmp);
    assert(genResult.status === 0, 'roadmap generate should exit 0\nstderr: ' + genResult.stderr);
    const roadmapPath = path.join(tmp, 'kaola-workflow', 'ROADMAP.md');
    assert(
      read(roadmapPath).includes('#910'),
      'ROADMAP.md must list #910 before finalize'
    );
    // Finalize archives the project and must clean .roadmap source + regenerate ROADMAP.md
    const finalizeResult = json(runNode(claimScript, ['finalize', '--project', 'issue-910'], tmp));
    assert(finalizeResult.status === 'closed', 'finalize must return status:closed');
    assert(
      !fs.existsSync(path.join(tmp, 'kaola-workflow', '.roadmap', 'issue-910.md')),
      'finalize must delete stale .roadmap source: kaola-workflow/.roadmap/issue-910.md'
    );
    assert(
      !read(roadmapPath).includes('#910'),
      'ROADMAP.md must not list closed issue #910 after finalize'
    );
    assert(
      finalizeResult.roadmap_source_removed === 'removed' || finalizeResult.roadmap_source_removed === 'absent',
      'receipt: roadmap_source_removed must be removed or absent, got ' + finalizeResult.roadmap_source_removed
    );
    assert(
      finalizeResult.roadmap_regenerated === 'regenerated',
      'receipt: roadmap_regenerated must be regenerated, got ' + finalizeResult.roadmap_regenerated
    );
    assert(
      finalizeResult.closure_invariants && finalizeResult.closure_invariants.ok === true,
      'receipt: closure_invariants.ok must be true, got ' + JSON.stringify(finalizeResult.closure_invariants)
    );
    // M2 (#277): warn-first attestation fields must be present; no dispatch-log in offline test
    // so both fields are 'missing', but closure_invariants.ok must still be true (warn-first contract).
    assert(
      finalizeResult.closure_receipt && 'claim_planner_attested' in finalizeResult.closure_receipt,
      'M2 (#277): closure_receipt must have claim_planner_attested field'
    );
    assert(
      finalizeResult.closure_receipt && 'finalize_contractor_attested' in finalizeResult.closure_receipt,
      'M2 (#277): closure_receipt must have finalize_contractor_attested field'
    );
    assert(
      finalizeResult.closure_receipt.claim_planner_attested === 'missing' ||
      finalizeResult.closure_receipt.claim_planner_attested === 'attested',
      'M2 (#277): claim_planner_attested must be missing or attested, got ' + finalizeResult.closure_receipt.claim_planner_attested
    );
    assert(
      finalizeResult.closure_receipt.finalize_contractor_attested === 'missing' ||
      finalizeResult.closure_receipt.finalize_contractor_attested === 'attested',
      'M2 (#277): finalize_contractor_attested must be missing or attested, got ' + finalizeResult.closure_receipt.finalize_contractor_attested
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testFinalizeFromLinkedWorktreeCleansRoadmapEntry() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-finalize-linked-roadmap-')));
  const kwRoot = tmp + '.kw';
  try {
    initGitRepo(tmp);
    // Plant only the roadmap issue in main worktree (NOT the active folder).
    // Production pattern: the active folder lives only in the linked worktree;
    // committing it here would make mainLive an rmSync target on HEAD and dirty
    // MAIN's status (D entries) in the clean assertion added below.
    plantRoadmapIssue(tmp, 911, '');
    // Commit so .roadmap/ is on HEAD (the gate check used by the regression fix).
    spawnSync('git', ['-C', tmp, 'add', path.join('kaola-workflow', '.roadmap', 'issue-911.md')], { encoding: 'utf8' });
    spawnSync('git', ['-C', tmp, 'commit', '-m', 'plant'], { encoding: 'utf8' });
    // Create linked worktree on a feature branch
    const wtPath = path.join(kwRoot, 'issue-911');
    fs.mkdirSync(kwRoot, { recursive: true });
    spawnSync('git', ['worktree', 'add', '-b', 'workflow/issue-911', '--', wtPath, 'HEAD'], {
      cwd: tmp,
      encoding: 'utf8'
    });
    // Active folder lives only in the linked worktree (production pattern).
    plantActiveFolder(wtPath, 'issue-911', 911, null);
    // Finalize from linked worktree with --keep-worktree (so archive commit is made on feature branch)
    const result = spawnSync(process.execPath, [claimScript, 'finalize', '--project', 'issue-911', '--keep-worktree'], {
      cwd: wtPath,
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' },
      encoding: 'utf8'
    });
    assert(
      result.status === 0,
      'finalize from linked worktree should exit 0\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr
    );
    let finalizeJson = {};
    try {
      const lastLine = result.stdout.trim().split('\n').filter(l => l.trim().startsWith('{')).pop() || '';
      finalizeJson = JSON.parse(lastLine);
    } catch (_) {}
    assert(
      finalizeJson.roadmap_source_removed === 'removed' || finalizeJson.roadmap_source_removed === 'absent',
      'linked-worktree finalize: roadmap_source_removed must be removed or absent, got ' + finalizeJson.roadmap_source_removed
    );
    assert(
      finalizeJson.roadmap_regenerated === 'regenerated',
      'linked-worktree finalize: roadmap_regenerated must be regenerated, got ' + finalizeJson.roadmap_regenerated
    );
    assert(
      finalizeJson.closure_invariants && finalizeJson.closure_invariants.ok === true,
      'linked-worktree finalize: closure_invariants.ok must be true'
    );
    // .roadmap source must be deleted in the linked worktree (archiveProjectDir runs from wtPath)
    assert(
      !fs.existsSync(path.join(wtPath, 'kaola-workflow', '.roadmap', 'issue-911.md')),
      'linked-worktree finalize must delete .roadmap source in linked tree'
    );
    // --keep-worktree causes an archive commit on the feature branch; deletion must be staged there
    const showResult = spawnSync('git', ['show', 'HEAD', '--name-status'], {
      cwd: wtPath,
      encoding: 'utf8'
    });
    assert(
      /^D\s+kaola-workflow\/\.roadmap\/issue-911\.md$/m.test(showResult.stdout),
      'deletion of kaola-workflow/.roadmap/issue-911.md must appear in archive commit\ngit show output:\n' + showResult.stdout
    );
    // Regression lock (#297 R1): committed-on-HEAD path must NOT leave MAIN dirty.
    // With the gated fix, rm --cached is skipped; the archive commit on the feature
    // branch handles deletion, so MAIN's index is untouched.
    const mainStatusResult = spawnSync('git', ['-C', tmp, 'status', '--porcelain', '--untracked-files=no'], {
      encoding: 'utf8'
    });
    assert(
      mainStatusResult.stdout.trim().length === 0,
      'testFinalizeFromLinkedWorktreeCleansRoadmapEntry: main-repo `git status --porcelain --untracked-files=no` must be empty after finalize (regression lock for #297 R1), got: "' + mainStatusResult.stdout.trim() + '"'
    );
  } finally {
    try { spawnSync('git', ['-C', tmp, 'worktree', 'remove', '--force', kwRoot + '/issue-911'], { encoding: 'utf8' }); } catch (_) {}
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(kwRoot, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Issue #297 — worktree finalize cleans MAIN-repo staged roadmap source
// Scenario: handoff creates .roadmap/issue-N.md in MAIN and `git add`s it
// WITHOUT committing (worktree was forked before the file existed on HEAD).
// archiveProjectDir must emit a git-index operation against mainRoot so that
// `git status --porcelain --untracked-files=no` is empty post-finalize,
// matching the sink-merge.js:73 clean check exactly.
// ---------------------------------------------------------------------------

function testFinalizeFromLinkedWorktreeCleansMainStagedRoadmapSource() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-fin-staged-roadmap-')));
  const kwRoot = tmp + '.kw';
  try {
    initGitRepo(tmp);
    // Create the linked worktree FIRST, from a HEAD that does NOT contain
    // kaola-workflow/.roadmap/issue-921.md (it is not committed on HEAD yet).
    const wtPath = path.join(kwRoot, 'issue-921');
    fs.mkdirSync(kwRoot, { recursive: true });
    spawnSync('git', ['worktree', 'add', '-b', 'workflow/issue-921', '--', wtPath, 'HEAD'], {
      cwd: tmp,
      encoding: 'utf8'
    });
    // Plant the active folder only in the linked worktree (production pattern).
    plantActiveFolder(wtPath, 'issue-921', 921, null);
    // THEN create kaola-workflow/.roadmap/issue-921.md in the MAIN tree and
    // `git add` it WITHOUT committing — reproducing adaptive-handoff Step 5.
    plantRoadmapIssue(tmp, 921, '');
    spawnSync('git', ['-C', tmp, 'add', path.join('kaola-workflow', '.roadmap', 'issue-921.md')], {
      encoding: 'utf8'
    });
    // PRE-FIX sanity: the main index must show a staged ADD (non-empty status).
    const preStatus = spawnSync('git', ['-C', tmp, 'status', '--porcelain', '--untracked-files=no'], {
      encoding: 'utf8'
    });
    assert(
      preStatus.stdout.trim().length > 0,
      '#297 setup: main-repo status must be non-empty (staged A) before finalize, got: "' + preStatus.stdout.trim() + '"'
    );
    // Finalize from the linked worktree with --keep-worktree.
    const result = spawnSync(process.execPath, [claimScript, 'finalize', '--project', 'issue-921', '--keep-worktree'], {
      cwd: wtPath,
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' },
      encoding: 'utf8'
    });
    assert(
      result.status === 0,
      '#297 finalize from linked worktree must exit 0\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr
    );
    // POST-FIX assertion: main-repo index must be clean (mirrors sink-merge.js:73 EXACTLY).
    const postStatus = spawnSync('git', ['-C', tmp, 'status', '--porcelain', '--untracked-files=no'], {
      encoding: 'utf8'
    });
    assert(
      postStatus.stdout.trim().length === 0,
      '#297: main-repo `git status --porcelain --untracked-files=no` must be empty after finalize, got: "' + postStatus.stdout.trim() + '"'
    );
    console.log('testFinalizeFromLinkedWorktreeCleansMainStagedRoadmapSource: PASSED');
  } finally {
    try { spawnSync('git', ['-C', tmp, 'worktree', 'remove', '--force', kwRoot + '/issue-921'], { encoding: 'utf8' }); } catch (_) {}
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(kwRoot, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Issue #162 Task 5 — receipt tracking regression tests
// ---------------------------------------------------------------------------

function testFinalizeRoadmapCleanupFailureReceipt() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-finalize-receipt-fail-'));
  try {
    initGitRepo(tmp);
    plantActiveFolder(tmp, 'issue-912', 912, null);
    plantRoadmapIssue(tmp, 912, '');
    // Replace .roadmap/issue-912.md with a directory of the same name
    // so fs.unlinkSync throws EISDIR/EPERM (not ENOENT = absent; it's a real failure)
    const roadmapFile = path.join(tmp, 'kaola-workflow', '.roadmap', 'issue-912.md');
    fs.rmSync(roadmapFile);
    fs.mkdirSync(roadmapFile);

    const finalizeResult = json(runNode(claimScript, ['finalize', '--project', 'issue-912'], tmp));
    // Cleanup failure must NOT abort finalize — exit 0
    assert(finalizeResult.status === 'closed', 'finalize must still return status:closed on cleanup failure');
    assert(finalizeResult.archived === true, 'finalize must archive the folder even on cleanup failure');
    assert(
      finalizeResult.roadmap_source_removed === 'failed',
      'receipt: roadmap_source_removed must be "failed" when unlink throws non-ENOENT, got ' + finalizeResult.roadmap_source_removed
    );
    assert(
      finalizeResult.closure_invariants && finalizeResult.closure_invariants.ok === false,
      'receipt: closure_invariants.ok must be false when source file still present'
    );
    assert(
      finalizeResult.closure_invariants.violations.some(v => v.id === 'roadmap-source-absent'),
      'receipt: violations must include roadmap-source-absent'
    );
    console.log('testFinalizeRoadmapCleanupFailureReceipt: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testWatchPrRoadmapCleanupWarning() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-watchpr-receipt-warn-'));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    // Plant a sink:pr folder with issue 913
    plantActiveFolder(tmp, 'issue-913', 913, null);
    plantRoadmapIssue(tmp, 913, '');
    // Update workflow-state to sink:pr with a fake pr_url
    const stateFile = path.join(tmp, 'kaola-workflow', 'issue-913', 'workflow-state.md');
    let state = fs.readFileSync(stateFile, 'utf8');
    state = state.replace(/^sink:\s*.*$/m, 'sink: pr');
    if (!state.match(/^sink:/m)) state += '\nsink: pr\n';
    if (!state.match(/^pr_url:/m)) state += 'pr_url: https://github.com/test/repo/pull/913\n';
    fs.writeFileSync(stateFile, state);
    // Corrupt .roadmap/issue-913.md by replacing it with a directory
    const roadmapFile = path.join(tmp, 'kaola-workflow', '.roadmap', 'issue-913.md');
    fs.rmSync(roadmapFile);
    fs.mkdirSync(roadmapFile);
    // Write gh shim that returns MERGED for the PR
    fs.mkdirSync(binDir, { recursive: true });
    writeShimFiles(path.join(binDir, 'gh'), [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('repo view')) { process.stdout.write('{\"owner\":{\"login\":\"test\"},\"name\":\"repo\"}\\n'); }",
      "else if (a.includes('pr view')) { process.stdout.write('{\"state\":\"MERGED\",\"number\":913}\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const watchResult = runClaimOnline(['watch-pr'], tmp, binDir, {});
    assert(
      Array.isArray(watchResult.warnings) && watchResult.warnings.length > 0,
      'watch-pr must emit warnings on roadmap cleanup failure, got: ' + JSON.stringify(watchResult)
    );
    assert(
      watchResult.warnings[0].roadmap_source_removed === 'failed',
      'warning must include roadmap_source_removed:failed, got ' + JSON.stringify(watchResult.warnings[0])
    );
    console.log('testWatchPrRoadmapCleanupWarning: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

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

function runClaimOnlineExpectFail(args, cwd, binDir, extraEnv) {
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

    const result = runClaimOnlineExpectFail(['startup', '--target-issue', '155'], tmp, binDir);
    assert(!result.signal, 'startup must not be killed/timed out: ' + result.signal);

    // Must exit 1 (non-zero) — refusing to claim when gh fetch fails in ONLINE mode
    assert(result.status === 1,
      'startup must exit 1 when gh issue view fails in ONLINE mode, got ' + result.status +
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
    assert(result.status === 1,
      'startup must exit 1 when target unverified, got ' + result.status +
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

function testClassifierOfflineVerifiedRoadmapAcquires() {
  // Non-regression: valid offline roadmap entry still acquires
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-unverified-roadmap-'));
  try {
    fs.mkdirSync(path.join(tmp, 'kaola-workflow', '.roadmap'), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, 'kaola-workflow', '.roadmap', 'issue-200.md'),
      'issue: #200\ntitle: test\nstatus: open\nworkflow_project: issue-200\nnext_step: ready\n'
    );

    const result = runNode(claimScript, ['startup', '--target-issue', '200'], tmp);
    assert(!result.signal, 'verified-roadmap startup must not be killed: ' + result.signal);
    assert(result.status === 0,
      'startup must exit 0 when roadmap entry present, got ' + result.status +
      '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);

    const parsed = JSON.parse(result.stdout.trim());
    assert(parsed.claim === 'acquired',
      'claim must be acquired when roadmap entry present, got: ' + parsed.claim);
    assert(fs.existsSync(path.join(tmp, 'kaola-workflow', 'issue-200')),
      'kaola-workflow/issue-200 must be created');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('testClassifierOfflineVerifiedRoadmapAcquires: PASSED');
}

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
    assert(result.status === 1,
      'startup must exit 1 for unverified target with unrelated active folder, got ' + result.status +
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

function testStartupExplicitTargetRedRefuses() {
  // #27: claimExplicitTarget maps classifier red → user_target_red (claim.js:443-444).
  // cmdStartup routes through claimExplicitTarget; no active folder must be created.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-startup-red-'));
  try {
    // Plant active folder for a different issue with a known file
    plantActiveFolder(tmp, 'active-project-k', 70, '# Phase 3\nFiles: scripts/kaola-workflow-claim.js\n');
    // Plant roadmap for target issue 71 whose body overlaps the SAME file → classifier returns red
    plantRoadmapIssue(tmp, 71, 'body: also touches scripts/kaola-workflow-claim.js');
    const result = runNode(claimScript, ['startup', '--target-issue', '71'], tmp);
    assert(!result.signal, 'startup red must not be killed: ' + result.signal);
    assert(result.status === 1,
      'startup must exit 1 for red target, got ' + result.status +
      '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    // Parse last JSON object line (output may have git lines prepended)
    const lastLine = result.stdout.trim().split('\n').filter(l => l.trim().startsWith('{')).pop();
    assert(lastLine, 'expected at least one JSON object line in stdout, got: ' + result.stdout);
    const parsed = JSON.parse(lastLine);
    assert(parsed.verdict === 'user_target_red',
      'verdict must be user_target_red, got: ' + parsed.verdict +
      '\nfull output: ' + result.stdout);
    assert(parsed.claim === 'none',
      'claim must be none for red target, got: ' + parsed.claim);
    assert(!fs.existsSync(path.join(tmp, 'kaola-workflow', 'issue-71')),
      'kaola-workflow/issue-71 folder must NOT be created for red target');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('testStartupExplicitTargetRedRefuses: PASSED');
}

function testClassifierTopLevelIssueFlag() {
  // AC #10: classifier accepts top-level --issue N; --help works
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-cli-toplevel-'));
  try {
    // Top-level --issue (no 'classify' subcommand) + OFFLINE + no roadmap → target_unverified
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

function testValidateRemoteOffline() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-validate-remote-offline-'));
  try {
    initGitRepo(tmp);
    // runNode already sets KAOLA_WORKFLOW_OFFLINE=1
    const result = runNode(roadmapScript, ['validate-remote'], tmp);
    assert(result.status === 0, 'validate-remote should exit 0 when offline\nstderr: ' + result.stderr);
    assert(
      result.stdout.trim() === 'skipped: offline',
      'validate-remote must print "skipped: offline" when offline, got: ' + JSON.stringify(result.stdout.trim())
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
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
    plantRoadmapIssue(tmp, 914, '');
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
    plantRoadmapIssue(tmp, 915, '');
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

function testWatchPrEmitsClaimLabelReceipt() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-watchpr-label-receipt-'));
  const binDir = path.join(tmp, 'bin');
  const marker = path.join(tmp, 'label-removed.marker');
  try {
    initGitRepo(tmp);
    plantActiveFolder(tmp, 'issue-917', 917, null);
    plantRoadmapIssue(tmp, 917, '');
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
    plantRoadmapIssue(tmp, 918, '');
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
    plantRoadmapIssue(tmp, 920, '');
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
    plantRoadmapIssue(tmp, 921, '');
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
    spawnSync('git', ['worktree', 'add', '-b', 'workflow/issue-164r', '--', wtPath, 'HEAD'], {
      cwd: tmp, encoding: 'utf8'
    });
    // Feature commit so the merge is a real FF.
    fs.writeFileSync(path.join(wtPath, 'feature-164r.txt'), 'feature\n');
    spawnSync('git', ['add', 'feature-164r.txt'], { cwd: wtPath, encoding: 'utf8' });
    spawnSync('git', ['commit', '-m', 'feat: issue 164r'], { cwd: wtPath, encoding: 'utf8' });
    // No plantActiveFolder: without a live active folder, active-folder-absent is satisfied.
    // Plant the archive that cmdFinalize would have created in production (finalize runs
    // BEFORE sink-merge). mainRoot resolves to tmp for this linked worktree, so sink-merge
    // probes archiveDest = tmp/kaola-workflow/archive/issue-164r — this is the path it reads.
    const archiveStateDir = path.join(tmp, 'kaola-workflow', 'archive', 'issue-164r');
    fs.mkdirSync(archiveStateDir, { recursive: true });
    fs.writeFileSync(path.join(archiveStateDir, 'workflow-state.md'), '# Kaola-Workflow State\n\nstatus: closed\nstep: complete\n');

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
    assert(
      typeof receipt.roadmap_source_removed === 'string',
      'watch-pr receipt must have roadmap_source_removed field, got: ' + JSON.stringify(receipt)
    );
    assert(
      result.cleanups[0].closure_invariants,
      'cleanups[0] must have closure_invariants, got: ' + JSON.stringify(cleanup)
    );
    // #286 Fix 2: checkDispatchAttestations must run on watch-pr MERGED receipt.
    // With no dispatch-log producer in the fixture, post-fix value is 'missing' (not stale 'failed').
    assert(
      receipt.claim_planner_attested === 'missing',
      'watch-pr MERGED receipt.claim_planner_attested must be missing after attestation check, got: ' + receipt.claim_planner_attested
    );
    assert(
      receipt.finalize_contractor_attested === 'missing',
      'watch-pr MERGED receipt.finalize_contractor_attested must be missing after attestation check, got: ' + receipt.finalize_contractor_attested
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
      "process.stdout.write('{}\\n');"
    ]);

    // Create a feature branch, push it upstream.
    spawnSync('git', ['-C', tmp, 'checkout', '-b', 'workflow/issue-164m'], { encoding: 'utf8' });
    fs.writeFileSync(path.join(tmp, 'feature-164m.txt'), 'feature\n');
    spawnSync('git', ['-C', tmp, 'add', 'feature-164m.txt'], { encoding: 'utf8' });
    spawnSync('git', ['-C', tmp, 'commit', '-m', 'feat: issue 164m'], {
      encoding: 'utf8',
      env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@test.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@test.com' }
    });
    spawnSync('git', ['-C', tmp, 'push', '-u', 'origin', 'workflow/issue-164m'], { encoding: 'utf8' });
    // Return to main so checkout in sink-merge works.
    spawnSync('git', ['-C', tmp, 'checkout', 'main'], { encoding: 'utf8' });

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
    fs.writeFileSync(path.join(tmp, 'kaola-workflow', 'issue-860', 'workflow-plan.md'), [
      '<!-- plan_hash: ' + 'c'.repeat(64) + ' -->', '',
      '# Workflow Plan', '',
      '## Node Ledger', '', '| id | status |', '|---|---|',
      '| n1 | complete |', '| n2 | complete |', ''
    ].join('\n'));

    // Roadmap source on the branch (so the keep-open preservation has something to keep on HEAD).
    const wtRoadmapDir = path.join(wt860, 'kaola-workflow', '.roadmap');
    fs.mkdirSync(wtRoadmapDir, { recursive: true });
    fs.writeFileSync(path.join(wtRoadmapDir, 'issue-860.md'),
      'issue: #860\ntitle: keep-open fixture\nstatus: open\nworkflow_project: issue-860\nnext_step: ready\n');
    // A regenerated mirror that lists #860 as an active row (row-anchored matcher).
    fs.writeFileSync(path.join(wt860, 'kaola-workflow', 'ROADMAP.md'),
      '<!-- generated by scripts/kaola-workflow-roadmap.js — do not edit -->\n\n| #860 | keep-open fixture | open |\n');

    // Feature commit + the roadmap source committed on the branch.
    fs.writeFileSync(path.join(wt860, 'feature-860.txt'), 'feature\n');
    spawnSync('git', ['-C', wt860, 'add', '-A'], { encoding: 'utf8' });
    spawnSync('git', ['-C', wt860, 'commit', '-m', 'feat: issue 860 + roadmap source'], {
      encoding: 'utf8',
      env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@t.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@t.com' }
    });

    runClaimOnlineLastJson(['worktree-finalize', '--project', 'issue-860'], tmp, binDir);

    // finalize --keep-worktree WITHOUT --keep-open: exercises state-field derivation (OFFLINE).
    const finResult = spawnSync(process.execPath, [
      claimScript, 'finalize', '--project', 'issue-860', '--keep-worktree'
    ], { cwd: wt860, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
    assert(finResult.status === 0, 'keep-open finalize must exit 0\nstderr: ' + finResult.stderr);
    const finJson = JSON.parse(finResult.stdout.trim().split('\n').filter(Boolean).pop());
    assert(finJson.issue_disposition === 'kept-open',
      '#336: state-field derivation must yield issue_disposition kept-open, got: ' + JSON.stringify(finJson.issue_disposition));
    assert(finJson.roadmap_source_removed === 'kept',
      '#336: finalize roadmap_source_removed must be kept, got: ' + JSON.stringify(finJson.roadmap_source_removed));
    assert(finJson.closure_receipt.remote_issue_closed === 'kept_open',
      '#336: finalize receipt remote_issue_closed must be kept_open, got: ' + JSON.stringify(finJson.closure_receipt.remote_issue_closed));
    assert(finJson.closure_invariants.ok === true,
      '#336: finalize closure_invariants.ok must be true, got: ' + JSON.stringify(finJson.closure_invariants));
    // The roadmap source must STILL exist in the worktree (preserved, not unlinked).
    assert(fs.existsSync(path.join(wtRoadmapDir, 'issue-860.md')),
      '#336: keep-open finalize must preserve kaola-workflow/.roadmap/issue-860.md in the worktree');
    const archived860 = fs.readFileSync(path.join(wt860, 'kaola-workflow', 'archive', 'issue-860', 'workflow-state.md'), 'utf8');
    assert(archived860.includes('last_result: closed_keep_open') && archived860.includes('issue_action: comment_keep_open'),
      '#336: archived state must carry closed_keep_open + issue_action: comment_keep_open');

    const featureHead = spawnSync('git', ['rev-parse', 'workflow/issue-860'], { cwd: tmp, encoding: 'utf8' }).stdout.trim();

    // sink-merge --keep-issue-open (OFFLINE).
    const smResult = spawnSync(process.execPath, [
      sinkMergeScript, '--project', 'issue-860', '--branch', 'workflow/issue-860', '--issue', '860', '--keep-issue-open'
    ], { cwd: wt860, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
    assert(smResult.status === 0, 'keep-open sink-merge must exit 0\nstdout: ' + smResult.stdout + '\nstderr: ' + smResult.stderr);
    const mainAfter = spawnSync('git', ['rev-parse', 'main'], { cwd: tmp, encoding: 'utf8' }).stdout.trim();
    assert(mainAfter === featureHead, '#336: main must advance to feature HEAD after keep-open sink-merge');
    assert(!fs.existsSync(wt860), '#336: keep-open sink-merge must remove the worktree');
    const branchList = spawnSync('git', ['branch', '--list', 'workflow/issue-860'], { cwd: tmp, encoding: 'utf8' }).stdout.trim();
    assert(branchList === '', '#336: keep-open sink-merge must delete the branch');
    // The preserved roadmap source must be on main's HEAD (committed on the branch, now merged).
    const onHead = spawnSync('git', ['cat-file', '-e', 'HEAD:kaola-workflow/.roadmap/issue-860.md'], { cwd: tmp, encoding: 'utf8' });
    assert(onHead.status === 0, '#336: kaola-workflow/.roadmap/issue-860.md must survive on main HEAD after keep-open sink-merge');
    const smJson = JSON.parse(smResult.stdout.trim().split('\n').filter(Boolean).pop());
    assert(smJson.closure_receipt.remote_issue_closed === 'kept_open',
      '#336: sink-merge receipt remote_issue_closed must be kept_open, got: ' + JSON.stringify(smJson.closure_receipt.remote_issue_closed));
    assert(smJson.closure_receipt.roadmap_source_removed === 'kept',
      '#336: sink-merge receipt roadmap_source_removed must be kept, got: ' + JSON.stringify(smJson.closure_receipt.roadmap_source_removed));
    assert(smJson.closure_invariants.ok === true,
      '#336: sink-merge closure_invariants.ok must be true, got: ' + JSON.stringify(smJson.closure_invariants));
    const mainStatus = spawnSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: tmp, encoding: 'utf8' }).stdout.trim();
    assert(mainStatus === '', '#336: main worktree must be clean after keep-open sink-merge, got: ' + mainStatus);
    console.log('testKeepOpenMergeFullChain: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
  }
}

// #336 — cmdFinalize MUST honor the --keep-issue-open FLAG as the sole keep-open signal.
// Regression for the inert-flag false-green: every prose surface (contractor.md:156 passes ONLY
// $SINK_KEEP_OPEN_FLAG, the crash-resume note at contractor.md:169 re-runs with --keep-issue-open
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
    fs.writeFileSync(path.join(tmp, 'kaola-workflow', 'issue-861', 'workflow-plan.md'), [
      '<!-- plan_hash: ' + 'd'.repeat(64) + ' -->', '',
      '# Workflow Plan', '',
      '## Node Ledger', '', '| id | status |', '|---|---|',
      '| n1 | complete |', '| n2 | complete |', ''
    ].join('\n'));

    const wtRoadmapDir = path.join(wt861, 'kaola-workflow', '.roadmap');
    fs.mkdirSync(wtRoadmapDir, { recursive: true });
    fs.writeFileSync(path.join(wtRoadmapDir, 'issue-861.md'),
      'issue: #861\ntitle: keep-open flag fixture\nstatus: open\nworkflow_project: issue-861\nnext_step: ready\n');
    fs.writeFileSync(path.join(wt861, 'kaola-workflow', 'ROADMAP.md'),
      '<!-- generated by scripts/kaola-workflow-roadmap.js — do not edit -->\n\n| #861 | keep-open flag fixture | open |\n');

    fs.writeFileSync(path.join(wt861, 'feature-861.txt'), 'feature\n');
    spawnSync('git', ['-C', wt861, 'add', '-A'], { encoding: 'utf8' });
    spawnSync('git', ['-C', wt861, 'commit', '-m', 'feat: issue 861 + roadmap source'], {
      encoding: 'utf8',
      env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@t.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@t.com' }
    });

    runClaimOnlineLastJson(['worktree-finalize', '--project', 'issue-861'], tmp, binDir);

    // finalize WITH the explicit --keep-issue-open flag, NO issue_action field → the flag must
    // drive the keep-open terminal entirely on its own (OFFLINE).
    const finResult = spawnSync(process.execPath, [
      claimScript, 'finalize', '--project', 'issue-861', '--keep-worktree', '--keep-issue-open'
    ], { cwd: wt861, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
    assert(finResult.status === 0, '#336: keep-open flag finalize must exit 0\nstderr: ' + finResult.stderr);
    const finJson = JSON.parse(finResult.stdout.trim().split('\n').filter(Boolean).pop());
    assert(finJson.issue_disposition === 'kept-open',
      '#336: --keep-issue-open FLAG must yield issue_disposition kept-open (flag was inert before the alias), got: ' + JSON.stringify(finJson.issue_disposition));
    assert(finJson.roadmap_source_removed === 'kept',
      '#336: --keep-issue-open FLAG must yield roadmap_source_removed kept, got: ' + JSON.stringify(finJson.roadmap_source_removed));
    assert(finJson.closure_receipt.remote_issue_closed === 'kept_open',
      '#336: --keep-issue-open FLAG must yield receipt remote_issue_closed kept_open, got: ' + JSON.stringify(finJson.closure_receipt.remote_issue_closed));
    assert(finJson.closure_invariants.ok === true,
      '#336: --keep-issue-open FLAG must yield ok closure invariants (no roadmap-source-absent false fire), got: ' + JSON.stringify(finJson.closure_invariants));
    assert(fs.existsSync(path.join(wtRoadmapDir, 'issue-861.md')),
      '#336: --keep-issue-open FLAG must preserve kaola-workflow/.roadmap/issue-861.md');
    const archived861 = fs.readFileSync(path.join(wt861, 'kaola-workflow', 'archive', 'issue-861', 'workflow-state.md'), 'utf8');
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
    // Commit a roadmap source on main so the keep-open receipt has something to preserve.
    fs.mkdirSync(path.join(tmp, 'kaola-workflow', '.roadmap'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'kaola-workflow', '.roadmap', 'issue-164.md'), 'issue: #164\nstatus: open\n');
    spawnSync('git', ['-C', tmp, 'add', '-A'], { encoding: 'utf8' });
    spawnSync('git', ['-C', tmp, 'commit', '-m', 'chore: roadmap source 164'], {
      encoding: 'utf8',
      env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@t.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@t.com' }
    });
    spawnSync('git', ['-C', tmp, 'push', 'origin', 'main'], { encoding: 'utf8' });

    spawnSync('git', ['-C', tmp, 'checkout', '-b', 'workflow/issue-164k'], { encoding: 'utf8' });
    fs.writeFileSync(path.join(tmp, 'feature-164k.txt'), 'feature\n');
    spawnSync('git', ['-C', tmp, 'add', 'feature-164k.txt'], { encoding: 'utf8' });
    spawnSync('git', ['-C', tmp, 'commit', '-m', 'feat: issue 164k'], {
      encoding: 'utf8',
      env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@t.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@t.com' }
    });
    spawnSync('git', ['-C', tmp, 'push', '-u', 'origin', 'workflow/issue-164k'], { encoding: 'utf8' });
    spawnSync('git', ['-C', tmp, 'checkout', 'main'], { encoding: 'utf8' });

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
    assert(parsed.closure_receipt.roadmap_source_removed === 'kept',
      '#336: keep-open receipt roadmap_source_removed must be kept, got: ' + parsed.closure_receipt.roadmap_source_removed);
    console.log('testSinkMergeKeepOpenOnlineMock: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(remotePath, { recursive: true, force: true }); } catch (_) {}
  }
}

// #336 — --keep-issue-open requires --issue (typed refusal, non-zero exit).
function testSinkMergeKeepOpenRequiresIssue() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sm-keepopen-noissue-')));
  try {
    initGitRepo(tmp);
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
    spawnSync('git', ['-C', tmp, 'checkout', '-b', 'workflow/issue-545'], { encoding: 'utf8' });
    fs.writeFileSync(path.join(tmp, 'feature-545.txt'), 'feature\n');
    spawnSync('git', ['-C', tmp, 'add', 'feature-545.txt'], { encoding: 'utf8' });
    spawnSync('git', ['-C', tmp, 'commit', '-m', 'feat: issue 545'], { encoding: 'utf8' });
    spawnSync('git', ['-C', tmp, 'checkout', 'main'], { encoding: 'utf8' });
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

// #336 — closure-audit exclusion: a status:closed archive carrying issue_action: comment_keep_open
// with a surviving roadmap source must NOT be flagged archive_closed (the --execute landmine).
function testClosureAuditKeepOpenExclusion() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-keepopen-'));
  try {
    initGitRepo(tmp);
    // Keep-open archive: source MUST survive the audit.
    plantRoadmapIssue(tmp, 720, '');
    const keepDir = path.join(tmp, 'kaola-workflow', 'archive', 'issue-720');
    fs.mkdirSync(keepDir, { recursive: true });
    fs.writeFileSync(path.join(keepDir, 'workflow-state.md'),
      'status: closed\nstep: complete\nissue_number: 720\nissue_action: comment_keep_open\n');
    // Normal closed archive: source MUST still be flagged (regression).
    plantRoadmapIssue(tmp, 721, '');
    const normalDir = path.join(tmp, 'kaola-workflow', 'archive', 'issue-721');
    fs.mkdirSync(normalDir, { recursive: true });
    fs.writeFileSync(path.join(normalDir, 'workflow-state.md'),
      'status: closed\nstep: complete\nissue_number: 721\n');

    // OFFLINE: closed-set empty exercises only the archive_closed class (the landmine).
    const result = runClosureAuditOffline([], tmp);
    const sources = result.drift.stale_roadmap_sources;
    assert(!sources.some(s => s.issue_number === 720),
      '#336: keep-open archive (720) must NOT be flagged stale, got: ' + JSON.stringify(sources));
    assert(sources.some(s => s.issue_number === 721 && s.reason === 'archive_closed'),
      '#336: normal closed archive (721) must still be flagged archive_closed (regression), got: ' + JSON.stringify(sources));
    console.log('testClosureAuditKeepOpenExclusion: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// #336 — invariant unit: a hand-built keep-open receipt with the source DELETED yields exactly
// one violation keep-open-roadmap-preserved (the inverted preservation check).
function testKeepOpenInvariantUnit() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-keepopen-inv-'));
  try {
    const claimMod = require(path.join(repoRoot, 'scripts', 'kaola-workflow-claim.js'));
    const contract = require(path.join(repoRoot, 'scripts', 'kaola-workflow-closure-contract.js'));
    // No .roadmap source on disk → the preservation check must fail.
    const receipt = contract.emptyReceipt('issue-808', 808);
    receipt.remote_issue_closed = 'kept_open';
    receipt.roadmap_source_removed = 'kept';
    receipt.claim_label_removed = 'removed';
    receipt.worktree_removed = 'removed';
    receipt.branch_removed = 'kept';
    const inv = claimMod.checkClosureInvariants(tmp, receipt, null);
    const keepViolations = inv.violations.filter(v => v.id === 'keep-open-roadmap-preserved');
    assert(keepViolations.length === 1,
      '#336: a keep-open receipt with no roadmap source must yield exactly one keep-open-roadmap-preserved violation, got: ' + JSON.stringify(inv.violations));
    assert(!inv.violations.some(v => v.id === 'roadmap-source-absent' || v.id === 'roadmap-mirror-clean'),
      '#336: keep-open must REPLACE roadmap-source-absent / roadmap-mirror-clean, got: ' + JSON.stringify(inv.violations));
    console.log('testKeepOpenInvariantUnit: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

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
  // Verify AC#3: when closeIssue fails, sink-merge emits a stderr warning but still exits 0,
  // and the receipt reflects remote_issue_closed:failed while label removal succeeds.
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sm-closefail-')));
  const remotePath = initGitRepoWithBareRemote(tmp);
  try {
    const binDir = path.join(tmp, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    // Shim: exit 1 for `issue close`, exit 0 for everything else.
    writeShimFiles(path.join(binDir, 'gh'), [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue close')) { process.stderr.write('gh: simulated close failure\\n'); process.exit(1); }",
      "process.stdout.write('{}\\n');"
    ]);

    spawnSync('git', ['-C', tmp, 'checkout', '-b', 'workflow/issue-168f'], { encoding: 'utf8' });
    fs.writeFileSync(path.join(tmp, 'feature-168f.txt'), 'feature\n');
    spawnSync('git', ['-C', tmp, 'add', 'feature-168f.txt'], { encoding: 'utf8' });
    spawnSync('git', ['-C', tmp, 'commit', '-m', 'feat: issue 168f'], {
      encoding: 'utf8',
      env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@test.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@test.com' }
    });
    spawnSync('git', ['-C', tmp, 'push', '-u', 'origin', 'workflow/issue-168f'], { encoding: 'utf8' });
    spawnSync('git', ['-C', tmp, 'checkout', 'main'], { encoding: 'utf8' });

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
      result.status === 0,
      'sink-merge must exit 0 even when issue close fails\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr
    );
    assert(
      result.stderr.includes('sink-merge: WARNING: issue close failed for 168'),
      'sink-merge must emit warning to stderr on close failure, got stderr: ' + result.stderr
    );
    const lines = result.stdout.trim().split('\n').filter(l => l.trim());
    const parsed = JSON.parse(lines[lines.length - 1]);
    assert(
      parsed.closure_receipt.remote_issue_closed === 'failed',
      'receipt.remote_issue_closed must be "failed" when close fails, got: ' + parsed.closure_receipt.remote_issue_closed
    );
    assert(
      parsed.closure_receipt.claim_label_removed === 'removed',
      'receipt.claim_label_removed must be "removed" (negative control), got: ' + parsed.closure_receipt.claim_label_removed
    );
    console.log('testSinkMergeCloseFailureWarning: PASSED');
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
    spawnSync('git', ['-C', tmp, 'checkout', '-b', 'workflow/issue-850'], { encoding: 'utf8' });
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
    spawnSync('git', ['-C', tmp, 'add', '-A', 'kaola-workflow/', 'impl-850.txt'], { encoding: 'utf8' });
    spawnSync('git', ['-C', tmp, 'commit', '-m', 'chore: archive issue-850'], {
      encoding: 'utf8',
      env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@test.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@test.com' }
    });
    spawnSync('git', ['-C', tmp, 'push', '-u', 'origin', 'workflow/issue-850'], { encoding: 'utf8' });
    // Return to main — origin/main must NOT have the archive (so reset --hard origin/main wipes it)
    spawnSync('git', ['-C', tmp, 'checkout', 'main'], { encoding: 'utf8' });

    // Hard gate: verify git state is correct before invoking sink-merge
    const catArchive = spawnSync('git', ['-C', tmp, 'cat-file', '-e', 'workflow/issue-850:kaola-workflow/archive/issue-850/workflow-state.md'], { encoding: 'utf8' });
    const catLive = spawnSync('git', ['-C', tmp, 'cat-file', '-e', 'workflow/issue-850:kaola-workflow/issue-850/workflow-state.md'], { encoding: 'utf8' });
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
    const aheadCount = spawnSync('git', ['-C', tmp, 'rev-list', '--count', 'origin/main..main'], { encoding: 'utf8' }).stdout.trim();
    assert(aheadCount === '0', 'local main must be at origin/main after archived exit-3, got ahead=' + aheadCount);

    // Repo must be restored to main branch
    const headBranch = spawnSync('git', ['-C', tmp, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
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

function testClosureAuditClosedRemoteRoadmapSource() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-closed-remote-'));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    plantRoadmapIssue(tmp, 900, '');
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue view')) { process.stdout.write('{\"state\":\"closed\"}\\n'); }",
      "else if (a.includes('issue list')) { process.stdout.write('[]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const result = runClosureAudit([], tmp, binDir);
    const sources = result.drift.stale_roadmap_sources;
    assert(
      sources.length === 1 && sources[0].issue_number === 900 && sources[0].reason === 'closed_remote',
      'expected one closed_remote source for 900, got: ' + JSON.stringify(sources)
    );
    assert(result.counts.stale_roadmap_sources === 1, 'counts.stale_roadmap_sources must be 1, got: ' + result.counts.stale_roadmap_sources);
    console.log('testClosureAuditClosedRemoteRoadmapSource: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditArchiveClosedDrift() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-archive-closed-'));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    plantRoadmapIssue(tmp, 901, '');
    const archiveDir = path.join(tmp, 'kaola-workflow', 'archive', 'issue-901');
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, 'workflow-state.md'), 'status: closed\nstep: complete\nissue_number: 901\n');
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue view')) { process.stdout.write('{\"state\":\"open\"}\\n'); }",
      "else if (a.includes('issue list')) { process.stdout.write('[]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const result = runClosureAudit([], tmp, binDir);
    const sources = result.drift.stale_roadmap_sources;
    assert(
      sources.length === 1 && sources[0].issue_number === 901 && sources[0].reason === 'archive_closed',
      'expected one archive_closed source for 901 (remote open), got: ' + JSON.stringify(sources)
    );
    console.log('testClosureAuditArchiveClosedDrift: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditDedupRoadmapAndArchive() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-dedup-'));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    plantRoadmapIssue(tmp, 902, '');
    const archiveDir = path.join(tmp, 'kaola-workflow', 'archive', 'issue-902');
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, 'workflow-state.md'), 'status: closed\nstep: complete\nissue_number: 902\n');
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue view')) { process.stdout.write('{\"state\":\"closed\"}\\n'); }",
      "else if (a.includes('issue list')) { process.stdout.write('[]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const result = runClosureAudit([], tmp, binDir);
    const sources = result.drift.stale_roadmap_sources;
    assert(
      sources.length === 1 && sources[0].issue_number === 902 && sources[0].reason === 'closed_remote',
      'closed_remote must win over archive_closed and dedupe to one entry, got: ' + JSON.stringify(sources)
    );
    console.log('testClosureAuditDedupRoadmapAndArchive: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditArchiveOnlyNotProbed() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-archive-only-probe-'));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    // 920: roadmap source — must be probed (one gh issue view call expected)
    plantRoadmapIssue(tmp, 920, '');
    // 950: archive-only — NO .roadmap/issue-950.md, NO active folder — must NOT be probed
    const archiveDir = path.join(tmp, 'kaola-workflow', 'archive', 'issue-950');
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, 'workflow-state.md'),
      'status: closed\nstep: complete\nissue_number: 950\n');
    // Counting shim: increments a file counter on each 'gh issue view' call
    const viewCountFile = path.join(binDir, 'view-count');
    closureAuditShim(binDir, [
      "const fs = require('fs');",
      "const cf = " + JSON.stringify(viewCountFile) + ";",
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue view')) {",
      "  let n = 0; try { n = parseInt(fs.readFileSync(cf, 'utf8'), 10) || 0; } catch (_) {}",
      "  fs.writeFileSync(cf, String(n + 1));",
      "  process.stdout.write('{\"state\":\"open\"}\\n');",
      "} else if (a.includes('issue list')) { process.stdout.write('[]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const result = runClosureAudit([], tmp, binDir);
    const viewCount = fs.existsSync(viewCountFile)
      ? parseInt(fs.readFileSync(viewCountFile, 'utf8'), 10) : 0;
    assert(viewCount === 1,
      'archive-only 950 must not be probed; expected exactly 1 issue-view (roadmap 920 only), got ' + viewCount);
    assert(!JSON.stringify(result.drift).includes('950'),
      'issue 950 must not appear in any drift field, got: ' + JSON.stringify(result.drift));
    console.log('testClosureAuditArchiveOnlyNotProbed: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditMirrorListsClosedIssues() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-mirror-'));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    plantRoadmapIssue(tmp, 903, '');
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue view')) { process.stdout.write('{\"state\":\"closed\"}\\n'); }",
      "else if (a.includes('issue list')) { process.stdout.write('[]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const result = runClosureAudit([], tmp, binDir);
    assert(
      Array.isArray(result.drift.mirror_lists_closed_issues) && result.drift.mirror_lists_closed_issues.includes(903),
      'mirror_lists_closed_issues must include 903, got: ' + JSON.stringify(result.drift.mirror_lists_closed_issues)
    );
    assert(
      result.counts.mirror_lists_closed_issues === 1,
      'counts.mirror_lists_closed_issues must be 1 (counts must cover every drift class), got: ' + result.counts.mirror_lists_closed_issues
    );
    console.log('testClosureAuditMirrorListsClosedIssues: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

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

function testClosureAuditExecuteRepairsRoadmapAndLabels() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-exec-repair-'));
  const binDir = path.join(tmp, 'bin');
  const marker = path.join(tmp, 'label-removed.marker');
  try {
    initGitRepo(tmp);
    plantRoadmapIssue(tmp, 906, '');
    closureAuditShim(binDir, [
      "const fs = require('fs');",
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue edit') && a.includes('--remove-label')) { fs.writeFileSync(" + JSON.stringify(marker) + ", 'x'); process.stdout.write('{}\\n'); }",
      "else if (a.includes('issue view')) { process.stdout.write('{\"state\":\"closed\"}\\n'); }",
      "else if (a.includes('issue list')) { process.stdout.write('[{\"number\":906,\"title\":\"stale\",\"url\":\"http://x\"}]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const roadmapSource = path.join(tmp, 'kaola-workflow', '.roadmap', 'issue-906.md');
    assert(fs.existsSync(roadmapSource), 'precondition: roadmap source must exist before --execute');
    const result = runClosureAudit(['--execute'], tmp, binDir);
    assert(result.dry_run === false, '--execute must return dry_run:false, got: ' + result.dry_run);
    assert(
      result.repaired.roadmap_sources_removed.includes(906),
      'roadmap_sources_removed must include 906, got: ' + JSON.stringify(result.repaired.roadmap_sources_removed)
    );
    assert(result.repaired.roadmap_regenerated === true, 'roadmap_regenerated must be true, got: ' + result.repaired.roadmap_regenerated);
    assert(
      result.repaired.labels_removed.includes(906),
      'labels_removed must include 906, got: ' + JSON.stringify(result.repaired.labels_removed)
    );
    assert(!fs.existsSync(roadmapSource), '--execute must delete the stale roadmap source file');
    assert(fs.existsSync(marker), '--execute must call gh issue edit --remove-label (marker missing)');
    assert(fs.existsSync(path.join(tmp, 'kaola-workflow', 'ROADMAP.md')), '--execute must regenerate ROADMAP.md');
    console.log('testClosureAuditExecuteRepairsRoadmapAndLabels: PASSED');
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
    closureAuditShim(binDir, ['setInterval(() => {}, 1 << 30);']);
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
    plantRoadmapIssue(tmp, 910, '');
    closureAuditShim(binDir, ['setInterval(() => {}, 1 << 30);']);
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
    plantRoadmapIssue(tmp, 940, '');
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
  // the probe would throw and route to unresolved — NOT to closed_remote.
  // With fix #2 (fallback=30000), the probe succeeds and the issue routes to closed_remote.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-timeout-invalid-'));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    plantRoadmapIssue(tmp, 941, '');
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue view')) { process.stdout.write('{\"state\":\"closed\"}\\n'); }",
      "else if (a.includes('issue list')) { process.stdout.write('[]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const result = runClosureAudit([], tmp, binDir, { KAOLA_GH_REMOTE_TIMEOUT_MS: 'not-a-number' });
    const sources = result.drift.stale_roadmap_sources;
    assert(
      Array.isArray(sources) && sources.some(s => s.issue_number === 941 && s.reason === 'closed_remote'),
      'invalid KAOLA_GH_REMOTE_TIMEOUT_MS must fall back to 30000 and detect closed issue as closed_remote, got: ' + JSON.stringify(sources)
    );
    console.log('testClosureAuditTimeoutEnvInvalidFallsBack: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditTimeoutEnvOverCapFallsBack() {
  // Huge integer like '999999999999999999999' parses to 1e21 via parseInt, passes
  // Number.isInteger guard (pre-fix), and causes execFileSync to throw ERR_OUT_OF_RANGE.
  // A success-returning shim lets us discriminate: with over-cap env (no clamp),
  // the probe throws and routes to unresolved — NOT to closed_remote.
  // With the fix (Math.min(n, 600000)), the timeout is bounded and the probe succeeds.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-timeout-overcap-'));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    plantRoadmapIssue(tmp, 941, '');
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue view')) { process.stdout.write('{\"state\":\"closed\"}\\n'); }",
      "else if (a.includes('issue list')) { process.stdout.write('[]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const result = runClosureAudit([], tmp, binDir, { KAOLA_GH_REMOTE_TIMEOUT_MS: '999999999999999999999' });
    const sources = result.drift.stale_roadmap_sources;
    assert(
      Array.isArray(sources) && sources.some(s => s.issue_number === 941 && s.reason === 'closed_remote'),
      'over-cap KAOLA_GH_REMOTE_TIMEOUT_MS must be clamped and detect closed issue as closed_remote, got: ' + JSON.stringify(sources)
    );
    console.log('testClosureAuditTimeoutEnvOverCapFallsBack: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditExecuteDetectionTimeoutPropagates() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-exec-det-timeout-'));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    closureAuditShim(binDir, ['setInterval(() => {}, 1 << 30);']);
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
  // #28a: label-removal SIGTERM mid-loop → labels_skipped_reason='timeout' + loop BREAKS.
  // Shim returns 2 stale issues but HANGS on the first issue edit --remove-label.
  // Result: labels_failed.length===1 (proves loop broke before processing 2nd issue).
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ca-exec-label-timeout-'));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue edit') && a.includes('--remove-label')) { setInterval(() => {}, 1 << 30); }",
      "else if (a.includes('issue list')) { process.stdout.write('[{\"number\":91,\"title\":\"stale\",\"url\":\"http://x\"},{\"number\":92,\"title\":\"stale2\",\"url\":\"http://y\"}]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const result = runClosureAudit(['--execute'], tmp, binDir, probeTimeoutEnv());
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
    closureAuditShim(binDir, ['setInterval(() => {}, 1 << 30);']);
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

function testContractValidatorOfflineSkip() {
  const contractsScript = path.join(__dirname, 'validate-workflow-contracts.js');
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

// ---------------------------------------------------------------------------
// Issue #223 — three lifecycle fixes (tests written first, RED before fixes)
// ---------------------------------------------------------------------------

// Test 1: watch-pr CLOSED path must NOT fire roadmap invariants when archive=abandoned
function testWatchPrAbandonedClosureInvariantsClean() {
  // #13 regression: checkClosureInvariants fires roadmap-source-absent +
  // roadmap-mirror-clean even when the PR was CLOSED (archive=abandoned), because
  // archiveProjectDir skips roadmap cleanup for 'abandoned'. Fix: skip the roadmap
  // invariant block when receipt.archive === 'abandoned'.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-watchpr-abandoned-inv-'));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    // Plant a sink:pr folder for issue 920 with roadmap source + mirror line present
    plantActiveFolder(tmp, 'issue-920', 920, null);
    plantRoadmapIssue(tmp, 920, '');
    // Generate ROADMAP.md so it contains #920
    const genResult = spawnSync(process.execPath, [roadmapScript, 'generate'], {
      cwd: tmp, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
    });
    assert(genResult.status === 0, 'roadmap generate must exit 0\nstderr: ' + genResult.stderr);
    const roadmapMirrorPath = path.join(tmp, 'kaola-workflow', 'ROADMAP.md');
    assert(
      fs.readFileSync(roadmapMirrorPath, 'utf8').includes('#920'),
      'ROADMAP.md must contain #920 before watch-pr'
    );
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
      'cleanups[0].closure_invariants.ok must be true for abandoned PR (pre-fix: false with roadmap violations), got: ' + JSON.stringify(cleanup.closure_invariants)
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

// issue #274: plan-validator must refuse a frozen plan that edits one half of a
// byte-identity / sync-group pair (the drift validate-script-sync.js rejects post-merge).
function testAdaptiveSyncGroupGap() {
  const tmp = adaptiveTmp('sync-gap');
  try {
    // (a) COMMON_SCRIPTS member WITHOUT peer -> refuse.
    let v = validatePlanFixture(tmp, [
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| impl | tdd-guide | explore | scripts/kaola-workflow-claim.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'refuse' && /sync-group gap/.test((v.errors || []).join(';')),
      '(a) lone COMMON_SCRIPTS member must refuse with sync-group gap, got: ' + JSON.stringify(v));
    // (b) #301: BOTH halves SPLIT across two nodes -> REFUSE (co-occurrence, not union). The pair
    //     must be edited atomically in ONE node; split halves leave the two copies inconsistent
    //     between nodes. (Was in-grammar under the original union semantics; #301 inverts it.)
    v = validatePlanFixture(tmp, [
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| impl | tdd-guide | explore | scripts/kaola-workflow-claim.js | 1 | sequence |',
      '| doc | doc-updater | impl | plugins/kaola-workflow/scripts/kaola-workflow-claim.js | 1 | sequence |',
      '| review | code-reviewer | impl,doc | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'refuse' && /sync-group gap/.test((v.errors || []).join(';')),
      '(b) #301: COMMON_SCRIPTS halves SPLIT across nodes must refuse (co-occurrence), got: ' + JSON.stringify(v));
    // (b2) #301: BOTH halves in the SAME node -> in-grammar (atomic co-edit).
    v = validatePlanFixture(tmp, [
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| impl | tdd-guide | explore | scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'in-grammar',
      '(b2) #301: both COMMON_SCRIPTS halves in ONE node must be in-grammar, got: ' + JSON.stringify(v));
    // (c) BYTE_IDENTICAL_GROUPS member WITHOUT peers -> refuse.
    v = validatePlanFixture(tmp, [
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| impl | tdd-guide | explore | scripts/kaola-workflow-closure-contract.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'refuse' && /sync-group gap/.test((v.errors || []).join(';')),
      '(c) lone BYTE_IDENTICAL_GROUPS member must refuse with sync-group gap, got: ' + JSON.stringify(v));
    // (d) forge-rename port path alone -> in-grammar (no false positive).
    v = validatePlanFixture(tmp, [
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| impl | tdd-guide | explore | plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'in-grammar',
      '(d) forge-rename port path alone must NOT false-refuse, got: ' + JSON.stringify(v));
    // (e) #301/#286: a per-forge workflow-init CLAUDE.md-template HALF (the init SKILL) without its
    //     commands/workflow-init.md partner in the same node -> refuse naming the missing partner.
    //     This is the #286 discard #2 case (template region byte-locked per pair; partner in NO node).
    v = validatePlanFixture(tmp, [
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| tmpl | doc-updater | explore | plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md | 1 | sequence |',
      '| review | code-reviewer | tmpl | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'refuse' && /commands\/workflow-init\.md/.test((v.errors || []).join(';')),
      '(e) #301: lone workflow-init template SKILL half must refuse naming the commands/workflow-init.md partner, got: ' + JSON.stringify(v));
    // (f) #301: the workflow-init template pair kept intra-node -> in-grammar.
    v = validatePlanFixture(tmp, [
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| tmpl | doc-updater | explore | commands/workflow-init.md, plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md | 1 | sequence |',
      '| review | code-reviewer | tmpl | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'in-grammar',
      '(f) #301: workflow-init template pair intra-node must be in-grammar, got: ' + JSON.stringify(v));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptiveSyncGroupGap: PASSED');
}

// issue #340: the two freeze-time write-set completeness checks — (mech 1) an agent-set delta
// must carry its FULL 22-path registration surface (exact-match registries keyed on no symbol
// of the new file, invisible to #306 symbol-grep), anchor-gated to the Kaola-Workflow repo;
// (mech 2) a forge-port mirror node must be a transitive descendant of every node that writes
// the port's root source (the canonical spec is the full accumulated root diff). Composes with
// the #274/#301 byte-identity co-occurrence check.
function testAdaptiveRegistrationAndForgePortGaps() {
  const tmp = adaptiveTmp('reg-forgeport');
  // Plant the anchor file so the mech-1 check is active (only the Kaola-Workflow repo has the
  // registration surface). The same tmp serves all cases; A2 uses a fresh anchorless tmp.
  const plantAnchor = () => {
    fs.mkdirSync(path.join(tmp, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'scripts', 'validate-vendored-agents.js'), '// anchor\n');
  };
  // The full 22-path registration surface for an agent named `new-scout`, split across nodes
  // under FILE_CEILING=6 (the byte-group co-occurrence forces resolve-agent-model ×4 and the
  // plan-validator root↔codex pair into single nodes — satisfied here).
  const SURFACE_NODES = (parents) => [
    '| n1 | implementer | ' + parents + ' | agents/new-scout.md, plugins/kaola-workflow/agents/new-scout.toml, plugins/kaola-workflow-gitlab/agents/new-scout.toml, plugins/kaola-workflow-gitea/agents/new-scout.toml, install.sh, uninstall.sh | 1 | sequence |',
    '| n2 | implementer | n1 | scripts/kaola-workflow-resolve-agent-model.js, plugins/kaola-workflow/scripts/kaola-workflow-resolve-agent-model.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-resolve-agent-model.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-resolve-agent-model.js, scripts/validate-vendored-agents.js | 1 | sequence |',
    '| n3 | implementer | n2 | scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js | 1 | sequence |',
    '| n4 | implementer | n3 | plugins/kaola-workflow/config/agents.toml, plugins/kaola-workflow-gitlab/config/agents.toml, plugins/kaola-workflow-gitea/config/agents.toml, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js | 1 | sequence |',
    '| n5 | implementer | n4 | plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js, plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js | 1 | sequence |',
  ];
  try {
    plantAnchor();
    // A1 (mech-1 refusal — the issue's regression-fixture AC): an agent add whose write set
    // declares only the root profile must refuse, naming representative paths from BOTH gap
    // classes (the exact-match registry AND the by-name dispatch enumerations missed by #328).
    let v = validatePlanFixture(tmp, [
      '| scout | implementer | explore | agents/new-scout.md | 1 | sequence |',
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| review | code-reviewer | scout | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    const a1err = (v.errors || []).join('\n');
    assert(v.result === 'refuse' && /agent-registration gap:.*validate-vendored-agents\.js/.test(a1err),
      'A1: agent add omitting the surface must refuse naming validate-vendored-agents.js, got: ' + JSON.stringify(v));
    assert(/agent-registration gap:.*config\/agents\.toml/.test(a1err),
      'A1: refusal must name the config/agents.toml codex-dispatch registry (#328 miss), got: ' + a1err);
    assert(/agent-registration gap:.*uninstall\.sh/.test(a1err),
      'A1: refusal must name uninstall.sh REQUIRED_AGENTS (#328 miss), got: ' + a1err);

    // A2 (anchor gating — no user-repo false positive): same plan rows, fresh tmp WITHOUT the
    // anchor file -> in-grammar (the check is inert outside the Kaola-Workflow repo).
    const tmp2 = adaptiveTmp('reg-noanchor');
    try {
      v = validatePlanFixture(tmp2, [
        '| scout | implementer | explore | agents/new-scout.md | 1 | sequence |',
        '| explore | code-explorer | — | — | 1 | sequence |',
        '| review | code-reviewer | scout | — | 1 | sequence |',
        '| done | finalize | review | — | 1 | sequence |',
      ], []);
      assert(v.result === 'in-grammar',
        'A2: without the anchor file the mech-1 check must be inert (in-grammar), got: ' + JSON.stringify(v));
    } finally { fs.rmSync(tmp2, { recursive: true, force: true }); }

    // A3 (complete-surface positive, 22 paths / FILE_CEILING=6 -> 5 impl nodes): the full
    // surface declared across 5 nodes (byte-group co-occurrence satisfied) -> in-grammar.
    v = validatePlanFixture(tmp, [
      '| explore | code-explorer | — | — | 1 | sequence |',
      ...SURFACE_NODES('explore'),
      '| review | code-reviewer | n5 | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'in-grammar',
      'A3: the complete 22-path surface across 5 nodes must be in-grammar, got: ' + JSON.stringify(v));

    // A3 drop-one variant: remove uninstall.sh from n1 -> must flip to refuse (guards against
    // the surface silently shrinking).
    const dropped = SURFACE_NODES('explore').map(r =>
      r.startsWith('| n1 ') ? r.replace(', uninstall.sh', '') : r);
    v = validatePlanFixture(tmp, [
      '| explore | code-explorer | — | — | 1 | sequence |',
      ...dropped,
      '| review | code-reviewer | n5 | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'refuse' && /agent-registration gap:.*uninstall\.sh/.test((v.errors || []).join('\n')),
      'A3-drop: dropping uninstall.sh from the surface must refuse, got: ' + JSON.stringify(v));

    // A4 (mech-2 refusal): a port node PARALLEL to (not downstream of) the root-editing node ->
    // refuse with forge-port ordering gap. Pure graph check (anchor irrelevant).
    v = validatePlanFixture(tmp, [
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| rootedit | tdd-guide | explore | scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js | 1 | sequence |',
      '| port | implementer | explore | plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js | 1 | sequence |',
      '| review | code-reviewer | rootedit,port | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'refuse' && /forge-port ordering gap/.test((v.errors || []).join('\n')),
      'A4: a port parallel to its root edit must refuse with forge-port ordering gap, got: ' + JSON.stringify(v));

    // A5 (mech-2 positive): same but the port depends_on the root-editing node -> in-grammar.
    v = validatePlanFixture(tmp, [
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| rootedit | tdd-guide | explore | scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js | 1 | sequence |',
      '| port | implementer | rootedit | plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js | 1 | sequence |',
      '| review | code-reviewer | port | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'in-grammar',
      'A5: a port downstream of all its root edits must be in-grammar, got: ' + JSON.stringify(v));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptiveRegistrationAndForgePortGaps: PASSED');
}

// issue #308: reconcileLedger (--freeze --repair) brings the ## Node Ledger into agreement
// with ## Nodes — adds a pending row for a node missing from the ledger, never drops an
// existing status, and (since plan_hash excludes the ledger) does not move the hash.
function testAdaptiveFreezeRepairReconcile() {
  const planValidator = require(planValidatorScript);
  const plan = [
    '# Plan', '',
    '## Meta', 'labels: chore', '',
    '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '|---|---|---|---|---|---|',
    '| a | tdd-guide | — | scripts/a.js | 1 | sequence |',
    '| extra | doc-updater | a | docs/x.md | 1 | sequence |',
    '| review | code-reviewer | a,extra | — | 1 | sequence |',
    '| finalize | finalize | review | — | 1 | sequence |',
    '',
    '## Node Ledger', '',
    '| id | status |',
    '|---|---|',
    '| a | complete |',
    '| review | pending |',
    '| finalize | pending |',
    '',
  ].join('\n');

  // (1) the missing 'extra' row is added as pending; existing statuses are untouched.
  const rec = planValidator.reconcileLedger(plan);
  assert(rec.added.length === 1 && rec.added[0] === 'extra',
    '#308 reconcile: missing node "extra" added, got ' + JSON.stringify(rec.added));
  const led = planValidator.parseLedger(rec.content);
  assert(led.get('extra') === 'pending', '#308 reconcile: extra row added as pending');
  assert(led.get('a') === 'complete' && led.get('review') === 'pending',
    '#308 reconcile: existing statuses are NOT dropped or rewritten');

  // (2) reconcile must not move plan_hash (hash covers ## Meta + ## Nodes only).
  assert(planValidator.computePlanHash(plan) === planValidator.computePlanHash(rec.content),
    '#308 reconcile: adding ledger rows must not change plan_hash');

  // (3) idempotent — a second pass adds nothing.
  const rec2 = planValidator.reconcileLedger(rec.content);
  assert(rec2.added.length === 0, '#308 reconcile: idempotent (second pass adds nothing)');

  console.log('testAdaptiveFreezeRepairReconcile: PASSED');
}

// issue #251: verdict-gate unit tests — parseNodeVerdict pure, verifyVerdictBlock pure,
// and --verdict-check CLI (per-node missing/non-gate/passing, whole-plan pass/fail).
function testAdaptiveVerdictCheck() {
  const tmp = adaptiveTmp('verdict-check');
  const planValidator = require(planValidatorScript);
  const schema = require(path.join(repoRoot, 'scripts', 'kaola-workflow-adaptive-schema.js'));

  // Helper: build a minimal ledger plan table for verifyVerdictBlock tests.
  const mkVerdictPlan = (nodes, ledger, labels) => [
    '# Plan', '',
    '## Meta', 'labels: ' + (labels || 'chore'), '',
    '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '|---|---|---|---|---|---|',
  ].concat(nodes).concat([
    '',
    '## Node Ledger', '',
    '| id | status |',
    '|---|---|',
  ]).concat(ledger).join('\n');

  try {
    // -------------------------------------------------------------------
    // (1) parseNodeVerdict pure cases
    // -------------------------------------------------------------------

    // pass
    let pv = schema.parseNodeVerdict('verdict: pass\nfindings_blocking: 0\n');
    assert(pv.found === true && pv.verdict === 'pass' && pv.findings_blocking === 0,
      'parseNodeVerdict: verdict:pass must parse, got ' + JSON.stringify(pv));

    // fail
    pv = schema.parseNodeVerdict('verdict: fail\nfindings_blocking: 3\n');
    assert(pv.found === true && pv.verdict === 'fail' && pv.findings_blocking === 3,
      'parseNodeVerdict: verdict:fail/3 must parse, got ' + JSON.stringify(pv));

    // missing (empty text) -> found:false
    pv = schema.parseNodeVerdict('');
    assert(pv.found === false && pv.verdict === null,
      'parseNodeVerdict: empty text must return found:false, got ' + JSON.stringify(pv));

    // malformed: verdict:maybe -> found:true, verdict:null (not in vocabulary)
    pv = schema.parseNodeVerdict('verdict: maybe\n');
    assert(pv.found === true && pv.verdict === null,
      'parseNodeVerdict: "verdict: maybe" -> found:true/verdict:null, got ' + JSON.stringify(pv));

    // indented verdict (not at col-0) -> found:false (D2 col-0 anchor)
    pv = schema.parseNodeVerdict('    verdict: pass\n');
    assert(pv.found === false,
      'parseNodeVerdict: indented "    verdict: pass" must NOT match (col-0 anchor), got ' + JSON.stringify(pv));

    // -------------------------------------------------------------------
    // (1b) #263 parseNodeSelector pure cases
    // -------------------------------------------------------------------

    // basic: selector: arm-csv -> found:true
    let ps = schema.parseNodeSelector('selector: arm-csv\n');
    assert(ps.found === true && ps.selector === 'arm-csv',
      'parseNodeSelector: "selector: arm-csv" must parse, got ' + JSON.stringify(ps));

    // last-match-wins: two selector lines -> returns last
    ps = schema.parseNodeSelector('selector: arm-csv\nselector: arm-html\n');
    assert(ps.found === true && ps.selector === 'arm-html',
      'parseNodeSelector: last-match-wins, got ' + JSON.stringify(ps));

    // missing (empty text) -> found:false
    ps = schema.parseNodeSelector('');
    assert(ps.found === false && ps.selector === null,
      'parseNodeSelector: empty text => found:false, got ' + JSON.stringify(ps));

    // fence-blind by col-0 anchor: indented selector must NOT match
    ps = schema.parseNodeSelector('    selector: arm-csv\n');
    assert(ps.found === false,
      'parseNodeSelector: indented selector must NOT match (col-0 anchor), got ' + JSON.stringify(ps));

    // no keyword -> found:false
    ps = schema.parseNodeSelector('some random text\nno selector here\n');
    assert(ps.found === false && ps.selector === null,
      'parseNodeSelector: no keyword => found:false, got ' + JSON.stringify(ps));

    // -------------------------------------------------------------------
    // (2) verifyVerdictBlock pure cases (injected readCache/globCache)
    // -------------------------------------------------------------------

    const baseNodes = [
      '| impl | tdd-guide | — | lib/foo.js | 1 | sequence |',
      '| rv | code-reviewer | impl | — | 1 | sequence |',
      '| done | finalize | rv | — | 1 | sequence |',
    ];
    const allComplete = ['| impl | complete |', '| rv | complete |', '| done | complete |'];

    // gate role pass -> ok:true
    let r = planValidator.verifyVerdictBlock(
      mkVerdictPlan(baseNodes, allComplete),
      { readCache: (f) => f === 'rv.md' ? 'verdict: pass\nfindings_blocking: 0\n' : null }
    );
    assert(r.ok === true, 'verifyVerdictBlock: gate pass -> ok:true, got ' + JSON.stringify(r));

    // gate role fail -> ok:false
    r = planValidator.verifyVerdictBlock(
      mkVerdictPlan(baseNodes, allComplete),
      { readCache: (f) => f === 'rv.md' ? 'verdict: fail\nfindings_blocking: 2\n' : null }
    );
    assert(r.ok === false && r.failures.length === 1,
      'verifyVerdictBlock: gate fail -> ok:false/failures.length===1, got ' + JSON.stringify(r));

    // missing cache file -> ok:false/found:false
    r = planValidator.verifyVerdictBlock(
      mkVerdictPlan(baseNodes, allComplete),
      { readCache: () => null }
    );
    assert(r.ok === false && r.failures.length === 1,
      'verifyVerdictBlock: missing cache -> ok:false, got ' + JSON.stringify(r));
    assert(r.failures[0].nodeId === 'rv',
      'verifyVerdictBlock: missing cache failure.nodeId must be rv, got ' + JSON.stringify(r.failures[0]));

    // findings_blocking > 0 forces fail even if verdict is pass
    r = planValidator.verifyVerdictBlock(
      mkVerdictPlan(baseNodes, allComplete),
      { readCache: (f) => f === 'rv.md' ? 'verdict: pass\nfindings_blocking: 1\n' : null }
    );
    assert(r.ok === false,
      'verifyVerdictBlock: findings_blocking>0 forces fail even with verdict:pass, got ' + JSON.stringify(r));

    // non-gate role self-skip -> ok:true, found:false
    const nonGateNodes = [
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| done | finalize | explore | — | 1 | sequence |',
    ];
    const nonGateLedger = ['| explore | complete |', '| done | complete |'];
    r = planValidator.verifyVerdictBlock(
      mkVerdictPlan(nonGateNodes, nonGateLedger),
      { readCache: () => null, nodeId: 'explore' }
    );
    assert(r.ok === true && r.found === false,
      'verifyVerdictBlock: non-gate role self-skip -> ok:true/found:false, got ' + JSON.stringify(r));

    // fanout adversarial-verifier: 1/3 refute -> pass (minority)
    // globCache returns filenames like 'adversarial-verifier-sk1.md'; readCache is called with those names.
    const fanoutNodes = [
      '| claim | code-explorer | — | — | 1 | sequence |',
      '| sk1 | adversarial-verifier | claim | — | 1 | fanout(skeptics) |',
      '| sk2 | adversarial-verifier | claim | — | 1 | fanout(skeptics) |',
      '| sk3 | adversarial-verifier | claim | — | 1 | fanout(skeptics) |',
      '| done | finalize | sk1,sk2,sk3 | — | 1 | sequence |',
    ];
    const fanoutLedger = ['| claim | complete |', '| sk1 | complete |', '| sk2 | complete |', '| sk3 | complete |', '| done | complete |'];
    const fanoutGlob = (prefix) => prefix === 'adversarial-verifier-'
      ? ['adversarial-verifier-sk1.md', 'adversarial-verifier-sk2.md', 'adversarial-verifier-sk3.md']
      : [];
    // 1/3 refute: sk1's file fails, sk2 and sk3 pass -> majority NOT refuted -> ok:true
    r = planValidator.verifyVerdictBlock(
      mkVerdictPlan(fanoutNodes, fanoutLedger),
      {
        readCache: (f) => {
          if (f === 'adversarial-verifier-sk1.md') return 'verdict: fail\nfindings_blocking: 1\n';
          if (f === 'adversarial-verifier-sk2.md') return 'verdict: pass\nfindings_blocking: 0\n';
          if (f === 'adversarial-verifier-sk3.md') return 'verdict: pass\nfindings_blocking: 0\n';
          return null;
        },
        globCache: fanoutGlob,
        nodeId: 'sk1',
      }
    );
    // Per-node: sk1 is adversarial-verifier with fanout shape -> globCache used; 1/3 refute = minority -> pass
    assert(r.ok === true,
      'verifyVerdictBlock: fanout 1/3 refute is minority -> ok:true, got ' + JSON.stringify(r));

    // fanout adversarial-verifier: 2/3 refute -> fail (majority)
    r = planValidator.verifyVerdictBlock(
      mkVerdictPlan(fanoutNodes, fanoutLedger),
      {
        readCache: (f) => {
          if (f === 'adversarial-verifier-sk1.md') return 'verdict: fail\nfindings_blocking: 1\n';
          if (f === 'adversarial-verifier-sk2.md') return 'verdict: fail\nfindings_blocking: 1\n';
          if (f === 'adversarial-verifier-sk3.md') return 'verdict: pass\nfindings_blocking: 0\n';
          return null;
        },
        globCache: fanoutGlob,
        nodeId: 'sk1',
      }
    );
    assert(r.ok === false && /majority-refute/.test(r.reason || ''),
      'verifyVerdictBlock: fanout 2/3 refute is majority -> ok:false + majority-refute reason, got ' + JSON.stringify(r));

    // -------------------------------------------------------------------
    // (3) --verdict-check CLI via runNode on a temp .cache dir
    // -------------------------------------------------------------------

    // Build a plan with code-reviewer and a non-gate node
    const vcPlanContent = mkVerdictPlan(
      ['| impl | tdd-guide | — | lib/foo.js | 1 | sequence |',
       '| rv | code-reviewer | impl | — | 1 | sequence |',
       '| done | finalize | rv | — | 1 | sequence |'],
      ['| impl | complete |', '| rv | complete |', '| done | complete |']
    );
    const vcDir = path.join(tmp, 'vc-cli');
    fs.mkdirSync(vcDir, { recursive: true });
    const vcPlanPath = path.join(vcDir, 'workflow-plan.md');
    const cacheDir = path.join(vcDir, '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });

    // per-node: missing gate cache -> exit 1
    fs.writeFileSync(vcPlanPath, vcPlanContent);
    let cr = runNode(planValidatorScript, [vcPlanPath, '--verdict-check', '--node-id', 'rv', '--json'], vcDir);
    assert(cr.status === 1,
      '--verdict-check --node-id rv (missing cache) must exit 1, got ' + cr.status + ' ' + cr.stdout);

    // per-node: non-gate node -> exit 0 (self-skip)
    cr = runNode(planValidatorScript, [vcPlanPath, '--verdict-check', '--node-id', 'impl', '--json'], vcDir);
    assert(cr.status === 0,
      '--verdict-check --node-id impl (non-gate, self-skip) must exit 0, got ' + cr.status + ' ' + cr.stdout);

    // per-node: passing gate -> exit 0
    fs.writeFileSync(path.join(cacheDir, 'rv.md'), 'verdict: pass\nfindings_blocking: 0\n');
    cr = runNode(planValidatorScript, [vcPlanPath, '--verdict-check', '--node-id', 'rv', '--json'], vcDir);
    assert(cr.status === 0,
      '--verdict-check --node-id rv (pass) must exit 0, got ' + cr.status + ' ' + cr.stdout);

    // (4) whole-plan: all complete+passing -> exit 0
    cr = runNode(planValidatorScript, [vcPlanPath, '--verdict-check', '--json'], vcDir);
    assert(cr.status === 0,
      '--verdict-check whole-plan (all pass) must exit 0, got ' + cr.status + ' ' + cr.stdout);
    const crJson = JSON.parse(cr.stdout);
    assert(crJson.ok === true && crJson.failures && crJson.failures.length === 0,
      '--verdict-check whole-plan pass: ok:true/failures:[], got ' + cr.stdout);

    // whole-plan: complete gate with verdict fail -> exit 1, failures.length===1
    fs.writeFileSync(path.join(cacheDir, 'rv.md'), 'verdict: fail\nfindings_blocking: 2\n');
    cr = runNode(planValidatorScript, [vcPlanPath, '--verdict-check', '--json'], vcDir);
    assert(cr.status === 1,
      '--verdict-check whole-plan (gate fail) must exit 1, got ' + cr.status + ' ' + cr.stdout);
    const crFailJson = JSON.parse(cr.stdout);
    assert(crFailJson.ok === false && crFailJson.failures.length === 1,
      '--verdict-check whole-plan fail: ok:false/failures.length===1, got ' + cr.stdout);

    // -------------------------------------------------------------------
    // (4b) #279: an unresolved in-scope action:fix finding fails the gate even on verdict:pass
    // -------------------------------------------------------------------

    // parseNodeFindings pure: flat col-0 lines parse into key=value objects
    let nf = schema.parseNodeFindings('verdict: pass\nfinding: id=R1 scope=in_scope action=fix status=open severity=low\nfinding: id=R2 scope=out_of_scope action=follow_up status=open\n');
    assert(nf.length === 2 && nf[0].id === 'R1' && nf[0].scope === 'in_scope' && nf[0].action === 'fix' && nf[0].status === 'open',
      'parseNodeFindings: two flat findings parse, got ' + JSON.stringify(nf));

    // absent findings -> []
    assert(schema.parseNodeFindings('verdict: pass\nfindings_blocking: 0\n').length === 0,
      'parseNodeFindings: absent findings => []');

    // fence-blind col-0 anchor: indented finding must NOT match
    assert(schema.parseNodeFindings('    finding: id=R9 scope=in_scope action=fix\n').length === 0,
      'parseNodeFindings: indented finding must NOT match (col-0 anchor)');

    // unresolvedInScopeFixes predicate: only the in_scope/fix/open finding blocks
    assert(schema.unresolvedInScopeFixes(nf).length === 1 && schema.unresolvedInScopeFixes(nf)[0].id === 'R1',
      'unresolvedInScopeFixes: only the in_scope/fix finding blocks, got ' + JSON.stringify(schema.unresolvedInScopeFixes(nf)));

    // fail-closed: missing status counts as open (blocks)
    assert(schema.unresolvedInScopeFixes(schema.parseNodeFindings('finding: id=R3 scope=in_scope action=fix\n')).length === 1,
      'unresolvedInScopeFixes: missing status fails closed (blocks)');

    // resolved / deferred do not block
    assert(schema.unresolvedInScopeFixes(schema.parseNodeFindings('finding: id=R4 scope=in_scope action=fix status=resolved\nfinding: id=R5 scope=in_scope action=fix status=deferred\n')).length === 0,
      'unresolvedInScopeFixes: resolved/deferred do not block');

    // severity is irrelevant: a low-severity in-scope fix still blocks
    assert(schema.unresolvedInScopeFixes(schema.parseNodeFindings('finding: id=R6 scope=in_scope action=fix status=open severity=low\n')).length === 1,
      'unresolvedInScopeFixes: low severity still blocks');

    // #289 fail-open fix: mixed-case gate-relevant values (scope/action/status) must be normalised
    assert(schema.unresolvedInScopeFixes(schema.parseNodeFindings('finding: id=R7 scope=In_Scope action=Fix status=Open\n')).length === 1,
      'unresolvedInScopeFixes: mixed-case scope/action/status still blocks (#289 fail-open fix)');

    // verifyVerdictBlock pure (AC1): verdict:pass + unresolved in-scope fix -> ok:false
    r = planValidator.verifyVerdictBlock(
      mkVerdictPlan(baseNodes, allComplete),
      { readCache: (f) => f === 'rv.md' ? 'verdict: pass\nfindings_blocking: 0\nfinding: id=R1 scope=in_scope action=fix status=open severity=low\n' : null }
    );
    assert(r.ok === false && /unresolved in-scope/.test(r.failures.map(x => x.reason || '').join(' ')),
      'verifyVerdictBlock: verdict:pass + unresolved in-scope fix -> ok:false (#279 AC1), got ' + JSON.stringify(r));

    // verifyVerdictBlock pure (AC3): verdict:pass + out_of_scope follow_up -> ok:true (recordable, not blocking)
    r = planValidator.verifyVerdictBlock(
      mkVerdictPlan(baseNodes, allComplete),
      { readCache: (f) => f === 'rv.md' ? 'verdict: pass\nfindings_blocking: 0\nfinding: id=R2 scope=out_of_scope action=follow_up status=open\n' : null }
    );
    assert(r.ok === true,
      'verifyVerdictBlock: out_of_scope follow_up does not block (#279 AC3), got ' + JSON.stringify(r));

    // CLI whole-plan (AC6 — the actual finalize gate): a COMPLETE review node with verdict:pass but an unresolved in-scope fix -> exit 1
    fs.writeFileSync(path.join(cacheDir, 'rv.md'), 'verdict: pass\nfindings_blocking: 0\nfinding: id=R1 scope=in_scope action=fix status=open severity=low\n');
    cr = runNode(planValidatorScript, [vcPlanPath, '--verdict-check', '--json'], vcDir);
    assert(cr.status === 1,
      '#279 AC6: whole-plan --verdict-check must exit 1 when a complete review node has verdict:pass + unresolved in-scope fix, got ' + cr.status + ' ' + cr.stdout);
    const f279 = JSON.parse(cr.stdout);
    assert(f279.ok === false && f279.failures.length === 1,
      '#279 AC6: whole-plan fail -> ok:false/failures.length===1, got ' + cr.stdout);

    // CLI whole-plan negative control: verdict:pass + RESOLVED in-scope fix -> exit 0
    fs.writeFileSync(path.join(cacheDir, 'rv.md'), 'verdict: pass\nfindings_blocking: 0\nfinding: id=R1 scope=in_scope action=fix status=resolved\n');
    cr = runNode(planValidatorScript, [vcPlanPath, '--verdict-check', '--json'], vcDir);
    assert(cr.status === 0,
      '#279: whole-plan --verdict-check must exit 0 when the in-scope fix is resolved, got ' + cr.status + ' ' + cr.stdout);

    // -------------------------------------------------------------------
    // (5) #263 --selector-check CLI via runNode on a temp dir
    // -------------------------------------------------------------------

    // Build a 7-column select plan for selector-check tests
    const scPlanContent = [
      '# Plan', '',
      '## Meta', 'labels: enhancement', '',
      '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape | selector_source |',
      '|---|---|---|---|---|---|---|',
      '| classify | code-explorer | — | — | 1 | sequence | — |',
      '| arm-csv | tdd-guide | classify | exporter/csv.js | 1 | select(fix) | classify |',
      '| arm-html | tdd-guide | classify | renderer/html.js | 1 | select(fix) | classify |',
      '| review | code-reviewer | arm-csv,arm-html | — | 1 | sequence | — |',
      '| done | finalize | review | — | 1 | sequence | — |',
      '',
    ].join('\n');
    const scDir = path.join(tmp, 'sc-cli');
    fs.mkdirSync(scDir, { recursive: true });
    const scPlanPath = path.join(scDir, 'workflow-plan.md');
    const scCacheDir = path.join(scDir, '.cache');
    fs.mkdirSync(scCacheDir, { recursive: true });
    fs.writeFileSync(scPlanPath, scPlanContent);

    // non-selector node -> exit 0, isSelector:false
    cr = runNode(planValidatorScript, [scPlanPath, '--selector-check', '--node-id', 'review', '--json'], scDir);
    assert(cr.status === 0,
      '--selector-check --node-id review (non-selector) must exit 0, got ' + cr.status + ' ' + cr.stdout);
    let scJson = JSON.parse(cr.stdout);
    assert(scJson.ok === true && scJson.isSelector === false && Array.isArray(scJson.armsToNa) && scJson.armsToNa.length === 0,
      '--selector-check non-selector: ok:true/isSelector:false/armsToNa:[], got ' + cr.stdout);

    // selector_source with missing cache -> exit 1, ok:false
    cr = runNode(planValidatorScript, [scPlanPath, '--selector-check', '--node-id', 'classify', '--json'], scDir);
    assert(cr.status === 1,
      '--selector-check --node-id classify (missing cache) must exit 1, got ' + cr.status + ' ' + cr.stdout);
    scJson = JSON.parse(cr.stdout);
    assert(scJson.ok === false && scJson.isSelector === true,
      '--selector-check missing cache: ok:false/isSelector:true, got ' + cr.stdout);

    // selector_source with valid selector -> exit 0, selected + armsToNa
    fs.writeFileSync(path.join(scCacheDir, 'classify.md'), 'selector: arm-csv\n');
    cr = runNode(planValidatorScript, [scPlanPath, '--selector-check', '--node-id', 'classify', '--json'], scDir);
    assert(cr.status === 0,
      '--selector-check --node-id classify (valid selector) must exit 0, got ' + cr.status + ' ' + cr.stdout);
    scJson = JSON.parse(cr.stdout);
    assert(scJson.ok === true && scJson.isSelector === true && scJson.selected === 'arm-csv' && scJson.group === 'fix',
      '--selector-check valid: ok:true/selected:arm-csv/group:fix, got ' + cr.stdout);
    assert(Array.isArray(scJson.armsToNa) && scJson.armsToNa.length === 1 && scJson.armsToNa[0] === 'arm-html',
      '--selector-check valid: armsToNa must be [arm-html], got ' + cr.stdout);

    // selector_source with foreign selector -> exit 1, ok:false
    fs.writeFileSync(path.join(scCacheDir, 'classify.md'), 'selector: arm-unknown\n');
    cr = runNode(planValidatorScript, [scPlanPath, '--selector-check', '--node-id', 'classify', '--json'], scDir);
    assert(cr.status === 1,
      '--selector-check --node-id classify (foreign selector) must exit 1, got ' + cr.status + ' ' + cr.stdout);
    scJson = JSON.parse(cr.stdout);
    assert(scJson.ok === false && scJson.isSelector === true,
      '--selector-check foreign selector: ok:false/isSelector:true, got ' + cr.stdout);

  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('testAdaptiveVerdictCheck: PASSED');
}

// Pattern library: the six adaptive composition patterns documented in
// README "Supported adaptive patterns" are locked here as executable fixtures —
// the README table and the validator stay in lockstep. Each row authors a
// canonical in-grammar plan for one named pattern and asserts the live
// validator's verdict (result + governance decision). The final block is the
// Classify-And-Act TRIPWIRE: selective execution (one-of-N arms) is out-of-grammar
// today; the `select()` shape is refused and the only workaround (both arms as a
// fan-out) runs BOTH arms. When the selective-execution primitive ships
// (docs/investigations/2026-06-06-six-workflow-patterns.md), the tripwire flips
// and this assertion must be updated — that is the intended signal.
function testAdaptivePatternLibrary() {
  const tmp = adaptiveTmp('pattern-library');
  try {
    // Pattern 1 — Plan-then-implement (the linear shape, with an explicit planner
    // dominating the implement). Low-risk, sequential => auto-run.
    let v = validatePlanFixture(tmp, [
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| plan | planner | explore | — | 1 | sequence |',
      '| impl | tdd-guide | plan | lib/foo.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], ['enhancement']);
    assert(v.result === 'in-grammar' && v.decision === 'auto-run',
      'pattern Plan-then-implement must be in-grammar + auto-run, got: ' + JSON.stringify(v));

    // Pattern 2 — Fan-out-and-synthesize: disjoint write-role legs merge at a
    // code-reviewer that depends_on every leg (the synthesize point). Write-role
    // fan-out => ask (blast radius).
    v = validatePlanFixture(tmp, [
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| plan | planner | explore | — | 1 | sequence |',
      '| impl-api | tdd-guide | plan | api/foo.js | 1 | fanout(impl) |',
      '| impl-cli | tdd-guide | plan | cli/bar.js | 1 | fanout(impl) |',
      '| synth | code-reviewer | impl-api,impl-cli | — | 1 | sequence |',
      '| done | finalize | synth | — | 1 | sequence |',
    ], ['enhancement']);
    assert(v.result === 'in-grammar' && v.decision === 'ask',
      'pattern Fan-out-and-synthesize must be in-grammar + ask (write-role fan-out), got: ' + JSON.stringify(v));
    assert(v.risk && v.risk.blastRadius === true,
      'pattern Fan-out-and-synthesize must flag blast-radius risk, got: ' + JSON.stringify(v));

    // Pattern 3 — Adversarial verification: after the code-reviewer gate, a read-only
    // fan-out of adversarial-verifier skeptics (empty write sets) re-tests the claim
    // before the sink. Read-only fan-out has ZERO blast radius => auto-run.
    v = validatePlanFixture(tmp, [
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| impl | tdd-guide | explore | lib/foo.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| sk1 | adversarial-verifier | review | — | 1 | fanout(verify) |',
      '| sk2 | adversarial-verifier | review | — | 1 | fanout(verify) |',
      '| sk3 | adversarial-verifier | review | — | 1 | fanout(verify) |',
      '| done | finalize | sk1,sk2,sk3 | — | 1 | sequence |',
    ], ['enhancement']);
    assert(v.result === 'in-grammar' && v.decision === 'auto-run',
      'pattern Adversarial verification (read-only fan-out) must be in-grammar + auto-run, got: ' + JSON.stringify(v));
    assert(v.risk && v.risk.blastRadius === false,
      'pattern Adversarial verification must be zero blast-radius, got: ' + JSON.stringify(v));

    // Pattern 4 — Bounded loop (review-fix cycle) within LOOP_CAP. Loop present => ask.
    v = validatePlanFixture(tmp, [
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| impl | tdd-guide | explore | lib/foo.js | 1 | sequence |',
      '| fix | code-reviewer | impl | — | 1 | loop(3) |',
      '| done | finalize | fix | — | 1 | sequence |',
    ], ['enhancement']);
    assert(v.result === 'in-grammar' && v.decision === 'ask',
      'pattern Bounded loop must be in-grammar + ask (loop present), got: ' + JSON.stringify(v));

    // Pattern 5 — Generate-and-filter (read-only judge-panel): planner generators fan out
    // → a planner reduce node (rubric/filter) → ONE tdd-guide implements the winner → gate.
    // Read-only generators + a single sequential implement => zero fan-out blast radius => auto-run.
    v = validatePlanFixture(tmp, [
      '| gen1 | planner | — | — | 1 | fanout(gen) |',
      '| gen2 | planner | — | — | 1 | fanout(gen) |',
      '| gen3 | planner | — | — | 1 | fanout(gen) |',
      '| filter | planner | gen1,gen2,gen3 | — | 1 | sequence |',
      '| impl | tdd-guide | filter | lib/foo.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], ['enhancement']);
    assert(v.result === 'in-grammar' && v.decision === 'auto-run',
      'pattern Generate-and-filter (read-only judge-panel) must be in-grammar + auto-run, got: ' + JSON.stringify(v));
    assert(v.risk && v.risk.blastRadius === false,
      'pattern Generate-and-filter must be zero blast-radius, got: ' + JSON.stringify(v));

    // Pattern 6 — Tournament (read-only bracket): 4 read-only planner attempts, hand-wired
    // pairwise code-reviewer judges, a final judge, reducing to the sink. No native bracket
    // shape — the bracket is ordinary depends_on wiring. All read-only => auto-run.
    v = validatePlanFixture(tmp, [
      '| a1 | planner | — | — | 1 | fanout(attempt) |',
      '| a2 | planner | — | — | 1 | fanout(attempt) |',
      '| a3 | planner | — | — | 1 | fanout(attempt) |',
      '| a4 | planner | — | — | 1 | fanout(attempt) |',
      '| semi1 | code-reviewer | a1,a2 | — | 1 | sequence |',
      '| semi2 | code-reviewer | a3,a4 | — | 1 | sequence |',
      '| final | code-reviewer | semi1,semi2 | — | 1 | sequence |',
      '| done | finalize | final | — | 1 | sequence |',
    ], ['enhancement']);
    assert(v.result === 'in-grammar' && v.decision === 'auto-run',
      'pattern Tournament (read-only bracket) must be in-grammar + auto-run, got: ' + JSON.stringify(v));

    // Composition capstone — the planner COMPOSES patterns, it does not pick one. ONE DAG
    // stacking three: a read-only multi-modal sweep (fan-out → planner synthesize), a
    // parallel write-role implement (fan-out → code-reviewer gate), and an
    // adversarial-verification skeptic fan-out → sink. Mirrors the validated example in
    // docs/investigations/2026-06-06-six-workflow-patterns.md. Write-role fan-out present
    // => ask; code-reviewer still post-dominates BOTH implement nodes — gates hold over any
    // topology, so composition can never erode a wall.
    v = validatePlanFixture(tmp, [
      '| sweep1 | code-explorer | — | — | 1 | fanout(sweep) |',
      '| sweep2 | code-explorer | — | — | 1 | fanout(sweep) |',
      '| sweep3 | code-explorer | — | — | 1 | fanout(sweep) |',
      '| plan | planner | sweep1,sweep2,sweep3 | — | 1 | sequence |',
      '| impl-api | tdd-guide | plan | api/x.js | 1 | fanout(impl) |',
      '| impl-cli | tdd-guide | plan | cli/y.js | 1 | fanout(impl) |',
      '| review | code-reviewer | impl-api,impl-cli | — | 1 | sequence |',
      '| sk1 | adversarial-verifier | review | — | 1 | fanout(verify) |',
      '| sk2 | adversarial-verifier | review | — | 1 | fanout(verify) |',
      '| done | finalize | sk1,sk2 | — | 1 | sequence |',
    ], ['enhancement']);
    assert(v.result === 'in-grammar' && v.decision === 'ask',
      'composed multi-pattern DAG must be in-grammar + ask (write-role fan-out present), got: ' + JSON.stringify(v));
    assert(v.nodeCount === 10 && v.risk && v.risk.blastRadius === true,
      'composed multi-pattern DAG must be 10 nodes with blast-radius flagged (gates still post-dominate both implements), got: ' + JSON.stringify(v));

    // Classify-And-Act — selective execution is now supported (#263).
    // (a) a valid 7-column select plan with a read-only classifier + 2 disjoint arms
    // must be in-grammar (the select() tripwire is flipped).
    {
      const selPlanPath = path.join(tmp, 'select-valid-plan.md');
      fs.writeFileSync(selPlanPath, [
        '# Plan', '',
        '## Meta', 'labels: enhancement', '',
        '## Nodes', '',
        '| id | role | depends_on | declared_write_set | cardinality | shape | selector_source |',
        '|---|---|---|---|---|---|---|',
        '| classify | code-explorer | — | — | 1 | sequence | — |',
        '| arm-csv | tdd-guide | classify | exporter/csv.js | 1 | select(fix) | classify |',
        '| arm-html | tdd-guide | classify | renderer/html.js | 1 | select(fix) | classify |',
        '| review | code-reviewer | arm-csv,arm-html | — | 1 | sequence | — |',
        '| done | finalize | review | — | 1 | sequence | — |',
        '',
      ].join('\n'));
      v = JSON.parse(runNode(planValidatorScript, [selPlanPath, '--json'], tmp).stdout);
    }
    assert(v.result === 'in-grammar',
      'select() classify-and-act with a read-only selector_source + 2 disjoint arms must be in-grammar after #263, got: ' + JSON.stringify(v));
    assert(v.decision === 'ask' || v.decision === 'auto-run',
      'select() plan decision must be ask or auto-run, got: ' + JSON.stringify(v));

    // G-SEL typed-refusal cases — each must refuse with a specific error substring.
    // G-SEL-1a: single-arm group (< 2 arms).
    {
      const selPlanPath = path.join(tmp, 'select-one-arm-plan.md');
      fs.writeFileSync(selPlanPath, [
        '# Plan', '',
        '## Meta', 'labels: enhancement', '',
        '## Nodes', '',
        '| id | role | depends_on | declared_write_set | cardinality | shape | selector_source |',
        '|---|---|---|---|---|---|---|',
        '| classify | code-explorer | — | — | 1 | sequence | — |',
        '| arm-csv | tdd-guide | classify | exporter/csv.js | 1 | select(fix) | classify |',
        '| review | code-reviewer | arm-csv | — | 1 | sequence | — |',
        '| done | finalize | review | — | 1 | sequence | — |',
        '',
      ].join('\n'));
      const r = JSON.parse(runNode(planValidatorScript, [selPlanPath, '--json'], tmp).stdout);
      assert(r.result === 'refuse' && Array.isArray(r.errors) && r.errors.some(e => /select group "fix" has only 1 arm/.test(e)),
        'G-SEL-1a: single-arm group must refuse with "has only 1 arm", got: ' + JSON.stringify(r));
    }

    // G-SEL-2: gate arm (code-reviewer as a select arm).
    {
      const selPlanPath = path.join(tmp, 'select-gate-arm-plan.md');
      fs.writeFileSync(selPlanPath, [
        '# Plan', '',
        '## Meta', 'labels: enhancement', '',
        '## Nodes', '',
        '| id | role | depends_on | declared_write_set | cardinality | shape | selector_source |',
        '|---|---|---|---|---|---|---|',
        '| classify | code-explorer | — | — | 1 | sequence | — |',
        '| arm-csv | tdd-guide | classify | exporter/csv.js | 1 | select(fix) | classify |',
        '| arm-rv | code-reviewer | classify | — | 1 | select(fix) | classify |',
        '| review | code-reviewer | arm-csv,arm-rv | — | 1 | sequence | — |',
        '| done | finalize | review | — | 1 | sequence | — |',
        '',
      ].join('\n'));
      const r = JSON.parse(runNode(planValidatorScript, [selPlanPath, '--json'], tmp).stdout);
      assert(r.result === 'refuse' && Array.isArray(r.errors) && r.errors.some(e => /gates cannot be select arms/.test(e)),
        'G-SEL-2: gate arm must refuse with "gates cannot be select arms", got: ' + JSON.stringify(r));
    }

    // G-SEL-1d: write-role selector_source (tdd-guide is a write role).
    {
      const selPlanPath = path.join(tmp, 'select-write-classifier-plan.md');
      fs.writeFileSync(selPlanPath, [
        '# Plan', '',
        '## Meta', 'labels: enhancement', '',
        '## Nodes', '',
        '| id | role | depends_on | declared_write_set | cardinality | shape | selector_source |',
        '|---|---|---|---|---|---|---|',
        '| classify | tdd-guide | — | lib/foo.js | 1 | sequence | — |',
        '| arm-csv | tdd-guide | classify | exporter/csv.js | 1 | select(fix) | classify |',
        '| arm-html | tdd-guide | classify | renderer/html.js | 1 | select(fix) | classify |',
        '| review | code-reviewer | arm-csv,arm-html | — | 1 | sequence | — |',
        '| done | finalize | review | — | 1 | sequence | — |',
        '',
      ].join('\n'));
      const r = JSON.parse(runNode(planValidatorScript, [selPlanPath, '--json'], tmp).stdout);
      assert(r.result === 'refuse' && Array.isArray(r.errors) && r.errors.some(e => /must be a read-only node/.test(e)),
        'G-SEL-1d: write-role selector_source must refuse with "must be a read-only node", got: ' + JSON.stringify(r));
    }

    // G-SEL-1e: arm missing depends_on the selector_source.
    {
      const selPlanPath = path.join(tmp, 'select-no-dep-plan.md');
      fs.writeFileSync(selPlanPath, [
        '# Plan', '',
        '## Meta', 'labels: enhancement', '',
        '## Nodes', '',
        '| id | role | depends_on | declared_write_set | cardinality | shape | selector_source |',
        '|---|---|---|---|---|---|---|',
        '| classify | code-explorer | — | — | 1 | sequence | — |',
        '| arm-csv | tdd-guide | classify | exporter/csv.js | 1 | select(fix) | classify |',
        '| arm-html | tdd-guide | — | renderer/html.js | 1 | select(fix) | classify |',
        '| review | code-reviewer | arm-csv,arm-html | — | 1 | sequence | — |',
        '| done | finalize | review | — | 1 | sequence | — |',
        '',
      ].join('\n'));
      const r = JSON.parse(runNode(planValidatorScript, [selPlanPath, '--json'], tmp).stdout);
      assert(r.result === 'refuse' && Array.isArray(r.errors) && r.errors.some(e => /must depend_on selector_source/.test(e)),
        'G-SEL-1e: arm missing depends_on selector_source must refuse with "must depend_on selector_source", got: ' + JSON.stringify(r));
    }

    // G-SEL-1b (#268): arm with blank selector_source must refuse with per-arm message.
    // Before the fix this plan passes validation (the blank arm is silently dropped by
    // .filter(Boolean) inside the srcs Set, so srcs.size === 1 and the group looks valid).
    {
      const selPlanPath = path.join(tmp, 'select-blank-src-plan.md');
      fs.writeFileSync(selPlanPath, [
        '# Plan', '',
        '## Meta', 'labels: enhancement', '',
        '## Nodes', '',
        '| id | role | depends_on | declared_write_set | cardinality | shape | selector_source |',
        '|---|---|---|---|---|---|---|',
        '| classify | code-explorer | — | — | 1 | sequence | — |',
        '| arm-csv | tdd-guide | classify | exporter/csv.js | 1 | select(fix) | classify |',
        '| arm-html | tdd-guide | classify | renderer/html.js | 1 | select(fix) | — |',
        '| review | code-reviewer | arm-csv,arm-html | — | 1 | sequence | — |',
        '| done | finalize | review | — | 1 | sequence | — |',
        '',
      ].join('\n'));
      const r = JSON.parse(runNode(planValidatorScript, [selPlanPath, '--json'], tmp).stdout);
      assert(r.result === 'refuse' && Array.isArray(r.errors) && r.errors.some(e => e.includes('G-SEL-1b: arm "arm-html" in select group "fix" has no selector_source declared')),
        'G-SEL-1b (#268): blank selector_source arm must refuse with per-arm G-SEL-1b message, got: ' + JSON.stringify(r));
    }

    // G-SEL-4: overlapping arm write sets (same file in both arms -> red).
    {
      const selPlanPath = path.join(tmp, 'select-overlap-plan.md');
      fs.writeFileSync(selPlanPath, [
        '# Plan', '',
        '## Meta', 'labels: enhancement', '',
        '## Nodes', '',
        '| id | role | depends_on | declared_write_set | cardinality | shape | selector_source |',
        '|---|---|---|---|---|---|---|',
        '| classify | code-explorer | — | — | 1 | sequence | — |',
        '| arm-csv | tdd-guide | classify | exporter/csv.js | 1 | select(fix) | classify |',
        '| arm-html | tdd-guide | classify | exporter/csv.js | 1 | select(fix) | classify |',
        '| review | code-reviewer | arm-csv,arm-html | — | 1 | sequence | — |',
        '| done | finalize | review | — | 1 | sequence | — |',
        '',
      ].join('\n'));
      const r = JSON.parse(runNode(planValidatorScript, [selPlanPath, '--json'], tmp).stdout);
      assert(r.result === 'refuse' && Array.isArray(r.errors) && r.errors.some(e => /overlapping write sets/.test(e)),
        'G-SEL-4: overlapping arm write sets must refuse with "overlapping write sets", got: ' + JSON.stringify(r));
    }

    // #271 AC#1: two independent select(fix) groups with DIFFERENT classifier nodes must
    // refuse with the G-SEL-1 duplicate-group-name message.
    {
      const selPlanPath = path.join(tmp, 'select-dup-group-diff-classifier.md');
      fs.writeFileSync(selPlanPath, [
        '# Plan', '',
        '## Meta', 'labels: bug', '',
        '## Nodes', '',
        '| id | role | depends_on | declared_write_set | cardinality | shape | selector_source |',
        '|---|---|---|---|---|---|---|',
        '| classify1 | code-explorer | — | — | 1 | sequence | — |',
        '| arm-a | tdd-guide | classify1 | src/a.js | 1 | select(fix) | classify1 |',
        '| arm-b | tdd-guide | classify1 | src/b.js | 1 | select(fix) | classify1 |',
        '| classify2 | code-explorer | — | — | 1 | sequence | — |',
        '| arm-c | tdd-guide | classify2 | src/c.js | 1 | select(fix) | classify2 |',
        '| arm-d | tdd-guide | classify2 | src/d.js | 1 | select(fix) | classify2 |',
        '| review | code-reviewer | arm-a,arm-b,arm-c,arm-d | — | 1 | sequence | — |',
        '| done | finalize | review | — | 1 | sequence | — |',
        '',
      ].join('\n'));
      const r = JSON.parse(runNode(planValidatorScript, [selPlanPath, '--json'], tmp).stdout);
      assert(r.result === 'refuse' && Array.isArray(r.errors) && r.errors.some(e => /G-SEL-1: select group name "fix" used by arms with different selector_source nodes/.test(e)),
        '#271 AC#1: duplicate group name with different classifiers must refuse with G-SEL-1 duplicate-group message, got: ' + JSON.stringify(r));
    }

    // #271 AC#2: two select(fix) groups with THE SAME classifier and overlapping write sets
    // must refuse. NOTE: same-name + same-classifier is structurally indistinguishable from a
    // valid N-arm group, so the #271 pre-pass cannot add a NEW refusal here. The refusal is
    // governed by the existing G-SEL-4 rule (overlapping write sets). This test verifies that
    // the combined fixture (two logical groups, same classifier, overlapping writes) remains
    // refused under current + new logic — it exercises G-SEL-4 coverage, not #271 regression.
    {
      const selPlanPath = path.join(tmp, 'select-dup-group-same-classifier.md');
      fs.writeFileSync(selPlanPath, [
        '# Plan', '',
        '## Meta', 'labels: bug', '',
        '## Nodes', '',
        '| id | role | depends_on | declared_write_set | cardinality | shape | selector_source |',
        '|---|---|---|---|---|---|---|',
        '| classify | code-explorer | — | — | 1 | sequence | — |',
        '| arm-a | tdd-guide | classify | src/shared.js | 1 | select(fix) | classify |',
        '| arm-b | tdd-guide | classify | src/b.js | 1 | select(fix) | classify |',
        '| arm-c | tdd-guide | classify | src/shared.js | 1 | select(fix) | classify |',
        '| arm-d | tdd-guide | classify | src/d.js | 1 | select(fix) | classify |',
        '| review | code-reviewer | arm-a,arm-b,arm-c,arm-d | — | 1 | sequence | — |',
        '| done | finalize | review | — | 1 | sequence | — |',
        '',
      ].join('\n'));
      const r = JSON.parse(runNode(planValidatorScript, [selPlanPath, '--json'], tmp).stdout);
      assert(r.result === 'refuse' && Array.isArray(r.errors) && r.errors.some(e => /overlapping write sets/.test(e)),
        '#271 AC#2: duplicate group name with same classifier and overlapping write sets must refuse via G-SEL-4, got: ' + JSON.stringify(r));
    }

    // (b) the only legal workaround today — both arms as a fan-out — is in-grammar but
    // runs BOTH arms (no real selection). This locks the honest cost the issue removes.
    v = validatePlanFixture(tmp, [
      '| classify | code-explorer | — | — | 1 | sequence |',
      '| arm-csv | tdd-guide | classify | exporter/csv.js | 1 | fanout(fix) |',
      '| arm-html | tdd-guide | classify | renderer/html.js | 1 | fanout(fix) |',
      '| review | code-reviewer | arm-csv,arm-html | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], ['enhancement']);
    assert(v.result === 'in-grammar' && v.decision === 'ask' && v.risk && v.risk.blastRadius === true,
      'TRIPWIRE: both-arms-as-fan-out workaround runs both arms (in-grammar + ask + blast-radius), got: ' + JSON.stringify(v));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptivePatternLibrary: PASSED');
}

// ---------------------------------------------------------------------------
// issue #267 — additive select() composition + runtime test coverage
// G1: select() composed with other shapes (validator fixtures)
// G2: multi-group select (validator fixture)
// G3: n/a propagation via next-action (runtime, unfrozen plan)
// G4: resume-check with select groups (runtime, frozen plan)
// G5: selector_source also a fanout member (probe-then-pin)
// ---------------------------------------------------------------------------

// Helper: write a 7-column selector plan file and run the validator.
function validateSelectFixture(planPath, nodesRows7col, labels) {
  const meta = labels !== undefined ? ['## Meta', 'labels: ' + labels.join(', '), ''] : [];
  fs.writeFileSync(planPath, ['# Plan', ''].concat(meta).concat([
    '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape | selector_source |',
    '|---|---|---|---|---|---|---|',
  ]).concat(nodesRows7col).concat(['']).join('\n'));
  return JSON.parse(runNode(planValidatorScript, [planPath, '--json'], path.dirname(planPath)).stdout);
}

// G1/G2 validator-fixture tests (appended to the pattern library).
function testAdaptiveSelectComposition() {
  const tmp = adaptiveTmp('select-composition');
  try {
    // G1a — select+fanout: write-role fanout legs merge at a read-only synth (planner)
    // classifier, which becomes the selector_source for a downstream select() group.
    // The outer gate must post-dominate ALL arms AND the fanout legs transitively.
    {
      const planPath = path.join(tmp, 'g1a.md');
      const v = validateSelectFixture(planPath, [
        '| explore | code-explorer | — | — | 1 | sequence | — |',
        '| impl-a | tdd-guide | explore | api/a.js | 1 | fanout(impl) | — |',
        '| impl-b | tdd-guide | explore | cli/b.js | 1 | fanout(impl) | — |',
        '| synth | planner | impl-a,impl-b | — | 1 | sequence | — |',
        '| arm-fix | implementer | synth | fix/x.js | 1 | select(fix) | synth |',
        '| arm-refactor | implementer | synth | refactor/y.js | 1 | select(fix) | synth |',
        '| gate | code-reviewer | arm-fix,arm-refactor | — | 1 | sequence | — |',
        '| done | finalize | gate | — | 1 | sequence | — |',
      ], ['enhancement']);
      assert(v.result === 'in-grammar',
        'G1a select+fanout: write-role fanout -> read-only synth classifier -> select() must be in-grammar, got: ' + JSON.stringify(v));
    }

    // G1b — select+adversarial-verify: adversarial-verifier read-only fan-out upstream
    // of a select() group; the tally/synth node the verifiers feed is the selector_source.
    {
      const planPath = path.join(tmp, 'g1b.md');
      const v = validateSelectFixture(planPath, [
        '| explore | code-explorer | — | — | 1 | sequence | — |',
        '| impl | tdd-guide | explore | lib/foo.js | 1 | sequence | — |',
        '| review | code-reviewer | impl | — | 1 | sequence | — |',
        '| sk1 | adversarial-verifier | review | — | 1 | fanout(verify) | — |',
        '| sk2 | adversarial-verifier | review | — | 1 | fanout(verify) | — |',
        '| tally | planner | sk1,sk2 | — | 1 | sequence | — |',
        '| arm-fix | implementer | tally | fix/x.js | 1 | select(repair) | tally |',
        '| arm-ok | implementer | tally | docs/ok.md | 1 | select(repair) | tally |',
        '| gate2 | code-reviewer | arm-fix,arm-ok | — | 1 | sequence | — |',
        '| done | finalize | gate2 | — | 1 | sequence | — |',
      ], ['enhancement']);
      assert(v.result === 'in-grammar',
        'G1b select+adversarial-verify: adversarial fan-out upstream of select() must be in-grammar, got: ' + JSON.stringify(v));
    }

    // G1c — select+loop: a loop(cap) node and a select() group co-existing in the same
    // plan as non-overlapping subgraphs.
    {
      const planPath = path.join(tmp, 'g1c.md');
      const v = validateSelectFixture(planPath, [
        '| explore | code-explorer | — | — | 1 | sequence | — |',
        '| fix | tdd-guide | explore | lib/foo.js | 1 | loop(3) | — |',
        '| classify | code-explorer | fix | — | 1 | sequence | — |',
        '| arm-a | implementer | classify | exporter/csv.js | 1 | select(path) | classify |',
        '| arm-b | implementer | classify | renderer/html.js | 1 | select(path) | classify |',
        '| review | code-reviewer | fix,arm-a,arm-b | — | 1 | sequence | — |',
        '| done | finalize | review | — | 1 | sequence | — |',
      ], ['enhancement']);
      assert(v.result === 'in-grammar',
        'G1c select+loop: loop(cap) + select() as non-overlapping subgraphs must be in-grammar, got: ' + JSON.stringify(v));
    }

    // G1d VALID — gate post-dominates ALL arms: review depends_on every arm → in-grammar.
    {
      const planPath = path.join(tmp, 'g1d-valid.md');
      const v = validateSelectFixture(planPath, [
        '| classify | code-explorer | — | — | 1 | sequence | — |',
        '| arm-a | tdd-guide | classify | exporter/csv.js | 1 | select(fix) | classify |',
        '| arm-b | tdd-guide | classify | renderer/html.js | 1 | select(fix) | classify |',
        '| review | code-reviewer | arm-a,arm-b | — | 1 | sequence | — |',
        '| done | finalize | review | — | 1 | sequence | — |',
      ], ['enhancement']);
      assert(v.result === 'in-grammar',
        'G1d VALID: gate depending on ALL arms must be in-grammar, got: ' + JSON.stringify(v));
    }

    // G1d NEGATIVE — gate post-dominates only SOME arms (arm-a but not arm-b via done):
    // the code-reviewer does not post-dominate arm-b → typed refusal with post-dominance message.
    {
      const planPath = path.join(tmp, 'g1d-neg.md');
      const r = validateSelectFixture(planPath, [
        '| classify | code-explorer | — | — | 1 | sequence | — |',
        '| arm-a | tdd-guide | classify | exporter/csv.js | 1 | select(fix) | classify |',
        '| arm-b | tdd-guide | classify | renderer/html.js | 1 | select(fix) | classify |',
        '| review | code-reviewer | arm-a | — | 1 | sequence | — |',
        '| done | finalize | review,arm-b | — | 1 | sequence | — |',
      ], ['enhancement']);
      assert(r.result === 'refuse',
        'G1d NEGATIVE: gate missing arm-b must refuse, got: ' + JSON.stringify(r));
      assert(Array.isArray(r.errors) && r.errors.some(e => /does not post-dominate/.test(e)),
        'G1d NEGATIVE: refusal must cite post-dominance failure (not an unrelated error), got: ' + JSON.stringify(r));
    }

    // G2 — two INDEPENDENT select() groups with DIFFERENT group names (select(fix) and
    // select(theme)) and DIFFERENT classifier nodes, non-overlapping write sets, both gated.
    // (Same-name-different-classifier is already covered by #271 AC#1 refusal test.)
    {
      const planPath = path.join(tmp, 'g2.md');
      const v = validateSelectFixture(planPath, [
        '| classify1 | code-explorer | — | — | 1 | sequence | — |',
        '| arm-a | implementer | classify1 | exporter/csv.js | 1 | select(fix) | classify1 |',
        '| arm-b | implementer | classify1 | renderer/html.js | 1 | select(fix) | classify1 |',
        '| classify2 | code-explorer | — | — | 1 | sequence | — |',
        '| arm-c | tdd-guide | classify2 | api/theme.js | 1 | select(theme) | classify2 |',
        '| arm-d | tdd-guide | classify2 | cli/theme.js | 1 | select(theme) | classify2 |',
        '| review | code-reviewer | arm-a,arm-b,arm-c,arm-d | — | 1 | sequence | — |',
        '| done | finalize | review | — | 1 | sequence | — |',
      ], ['enhancement']);
      assert(v.result === 'in-grammar',
        'G2: two independent select() groups with distinct names and classifiers must be in-grammar, got: ' + JSON.stringify(v));
    }

  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptiveSelectComposition: PASSED');
}

// G3 — n/a propagation via next-action (runtime, UNFROZEN plan).
// next-action does no plan_hash check so the plan need not be frozen.
// Build a select plan with classifier=complete, one arm=n/a, other arm=pending.
// Assert: the n/a arm is ABSENT from readySet; the pending arm IS present.
function testAdaptiveSelectNaPropagation() {
  const tmp = adaptiveTmp('select-na-propagation');
  try {
    const planPath = path.join(tmp, 'na-plan.md');
    fs.writeFileSync(planPath, [
      '# Plan', '',
      '## Meta', 'labels: enhancement', '',
      '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape | selector_source |',
      '|---|---|---|---|---|---|---|',
      '| classify | code-explorer | — | — | 1 | sequence | — |',
      '| arm-a | tdd-guide | classify | exporter/csv.js | 1 | select(fix) | classify |',
      '| arm-b | tdd-guide | classify | renderer/html.js | 1 | select(fix) | classify |',
      '| review | code-reviewer | arm-a,arm-b | — | 1 | sequence | — |',
      '| done | finalize | review | — | 1 | sequence | — |',
      '',
      '## Node Ledger', '',
      '| id | status |',
      '|---|---|',
      '| classify | complete |',
      '| arm-a | n/a |',
      '| arm-b | pending |',
      '| review | pending |',
      '| done | pending |',
      '',
    ].join('\n'));

    const r = runNode(nextActionScript, [planPath, '--json'], tmp);
    assert(r.status === 0, 'G3: next-action must exit 0, got ' + r.status + ' stderr: ' + r.stderr);
    const json = JSON.parse(r.stdout);
    assert(json.result === 'ok',
      'G3: next-action must return result=ok, got: ' + JSON.stringify(json));
    assert(!json.readySet.some(n => n.id === 'arm-a'),
      'G3: n/a arm (arm-a) must be ABSENT from readySet, got: ' + JSON.stringify(json.readySet));
    assert(json.readySet.some(n => n.id === 'arm-b'),
      'G3: pending arm (arm-b) must be PRESENT in readySet, got: ' + JSON.stringify(json.readySet));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptiveSelectNaPropagation: PASSED');
}

// G4 — resume-check with select groups (runtime, FROZEN plan).
// Confirms that ## Node Ledger is OUTSIDE the plan_hash region (hash covers ## Meta +
// ## Nodes only, per computePlanHash lines 488-493 of kaola-workflow-plan-validator.js).
// freeze-then-advance-ledger keeps --resume-check green because the hash is unchanged.
function testAdaptiveSelectResumeCheck() {
  const tmp = adaptiveTmp('select-resume');
  try {
    const proj = 'issue-g4-sim';
    // plantFrozenPlan creates kaola-workflow/{proj}/workflow-plan.md and stamps plan_hash.
    // The planText includes all-pending ledger rows — plantFrozenPlan freezes it as written.
    const planText = [
      '# Workflow Plan — issue #g4-sim', '',
      '## Meta', 'labels: enhancement', '',
      '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape | selector_source |',
      '|---|---|---|---|---|---|---|',
      '| classify | code-explorer | — | — | 1 | sequence | — |',
      '| arm-a | tdd-guide | classify | exporter/csv.js | 1 | select(fix) | classify |',
      '| arm-b | tdd-guide | classify | renderer/html.js | 1 | select(fix) | classify |',
      '| review | code-reviewer | arm-a,arm-b | — | 1 | sequence | — |',
      '| done | finalize | review | — | 1 | sequence | — |',
      '',
      '## Node Ledger', '',
      '| id | status |',
      '|---|---|',
      '| classify | pending |',
      '| arm-a | pending |',
      '| arm-b | pending |',
      '| review | pending |',
      '| done | pending |',
      '',
    ].join('\n');
    const planPath = plantFrozenPlan(tmp, proj, planText);

    // Advance the ledger to a partial select state (simulate mid-run: classify done, arm-a n/a).
    // The ## Nodes section is untouched, so the plan_hash stays valid.
    const frozen = fs.readFileSync(planPath, 'utf8');
    const mutated = frozen
      .replace('| classify | pending |', '| classify | complete |')
      .replace('| arm-a | pending |', '| arm-a | n/a |');
    fs.writeFileSync(planPath, mutated);

    // --resume-check must pass: hash covers only ## Meta + ## Nodes, not ## Node Ledger.
    const rc = runNode(planValidatorScript, [planPath, '--resume-check', '--json'], tmp);
    assert(rc.status === 0, 'G4: --resume-check must exit 0 after ledger mutation, got ' + rc.status + ' stderr: ' + rc.stderr);
    const rcJson = JSON.parse(rc.stdout);
    assert(rcJson.ok === true,
      'G4: --resume-check must return ok=true (ledger excluded from hash), got: ' + JSON.stringify(rcJson));

    // next-action against the frozen+mutated plan: arm-b (pending) must be ready; arm-a (n/a) absent.
    const na = runNode(nextActionScript, [planPath, '--json'], tmp);
    assert(na.status === 0, 'G4: next-action must exit 0, got ' + na.status + ' stderr: ' + na.stderr);
    const naJson = JSON.parse(na.stdout);
    assert(naJson.result === 'ok',
      'G4: next-action must return result=ok, got: ' + JSON.stringify(naJson));
    assert(naJson.readySet.some(n => n.id === 'arm-b'),
      'G4: pending arm (arm-b) must be in readySet after ledger advance, got: ' + JSON.stringify(naJson.readySet));
    assert(!naJson.readySet.some(n => n.id === 'arm-a'),
      'G4: n/a arm (arm-a) must be ABSENT from readySet after ledger advance, got: ' + JSON.stringify(naJson.readySet));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptiveSelectResumeCheck: PASSED');
}

// G5 — selector_source also a fanout member (probe-then-pin).
// Probed empirically: a read-only code-explorer node that is both a fanout(sweep) leg
// AND the selector_source for a select() group resolves as in-grammar (exit 0).
// The validator has no rule forbidding a read-only node from playing both roles.
function testAdaptiveSelectSelectorSourceFanoutMember() {
  const tmp = adaptiveTmp('select-selector-fanout');
  try {
    const planPath = path.join(tmp, 'g5.md');
    // classifier is both a fanout(sweep) member AND the selector_source for select(fix).
    fs.writeFileSync(planPath, [
      '# Plan', '',
      '## Meta', 'labels: enhancement', '',
      '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape | selector_source |',
      '|---|---|---|---|---|---|---|',
      '| sweep1 | code-explorer | — | — | 1 | fanout(sweep) | — |',
      '| classifier | code-explorer | sweep1 | — | 1 | fanout(sweep) | — |',
      '| arm-a | tdd-guide | classifier | exporter/csv.js | 1 | select(fix) | classifier |',
      '| arm-b | tdd-guide | classifier | renderer/html.js | 1 | select(fix) | classifier |',
      '| review | code-reviewer | arm-a,arm-b | — | 1 | sequence | — |',
      '| done | finalize | review | — | 1 | sequence | — |',
      '',
    ].join('\n'));
    const v = JSON.parse(runNode(planValidatorScript, [planPath, '--json'], tmp).stdout);
    // Empirically observed result: in-grammar. The validator permits a read-only node to
    // simultaneously be a fanout leg and a selector_source.
    assert(v.result === 'in-grammar',
      'G5: selector_source that is also a fanout member (read-only) must be in-grammar, got: ' + JSON.stringify(v));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptiveSelectSelectorSourceFanoutMember: PASSED');
}

// ---------------------------------------------------------------------------
// issue #255 — adaptive handoff integration tests
// ---------------------------------------------------------------------------

// Helper: build an unfrozen plan text with a ## Node Ledger section.
// All ledger entries are 'pending' so the handoff can open node1.
// No ## Sink / issue_number → roadmap_staged is vacuously true (hermetic).
function makeHandoffPlan(nodesRows, ledgerRows, labels) {
  const labelLine = Array.isArray(labels) ? labels.join(', ') : (labels || 'enhancement');
  return [
    '# Workflow Plan — issue #255-sim', '',
    '## Meta', 'labels: ' + labelLine, '',
    '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '|---|---|---|---|---|---|',
  ].concat(nodesRows).concat([
    '',
    '## Node Ledger', '',
    '| id | status |',
    '|---|---|',
  ]).concat(ledgerRows).concat(['']).join('\n');
}

// Helper: plant a workflow-state.md stub (no issue_number → vacuous roadmap_staged).
function plantHandoffState(projectDir, projectName) {
  const stateContent = [
    '## Project', 'name: ' + projectName, 'status: active',
    'workflow_path: adaptive', '',
  ].join('\n');
  fs.writeFileSync(path.join(projectDir, 'workflow-state.md'), stateContent);
}

// ---------------------------------------------------------------------------
// testAdaptiveHandoffInGrammarReady — UNFROZEN in-grammar auto-run plan with a
// temp git repo (for --start baseline). Asserts full checklist + node1 opened.
// ---------------------------------------------------------------------------
function testAdaptiveHandoffInGrammarReady() {
  const tmp = adaptiveTmp('handoff-ready');
  try {
    // Set up a real git repo (required for --plan path resolution via git rev-parse).
    initGitRepo(tmp);

    const projectName = 'issue-255-sim-ready';
    const projectDir = path.join(tmp, 'kaola-workflow', projectName);
    fs.mkdirSync(projectDir, { recursive: true });

    // Plant UNFROZEN in-grammar auto-run plan (sequential, no write-role fanout → auto-run).
    const planText = makeHandoffPlan([
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| impl | tdd-guide | explore | lib/foo.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], [
      '| explore | pending |',
      '| impl | pending |',
      '| review | pending |',
      '| done | pending |',
    ]);
    const planPath = path.join(projectDir, 'workflow-plan.md');
    fs.writeFileSync(planPath, planText);

    // Plant state (no issue_number → vacuous roadmap_staged).
    plantHandoffState(projectDir, projectName);

    // Git-commit plan + state so the repo HEAD is current (record-base needs a resolvable tree).
    spawnSync('git', ['add', '-A'], { cwd: tmp, encoding: 'utf8' });
    spawnSync('git', ['commit', '-m', 'handoff-ready fixture'], { cwd: tmp, encoding: 'utf8' });

    // Run handoff using --plan (absolute path) — NOT --project (resolves from script's repoRoot).
    const r = runNode(handoffScript, ['--plan', planPath, '--json'], tmp);
    assert(r.status === 0, 'in-grammar handoff must exit 0, got ' + r.status + '\nstderr: ' + r.stderr + '\nstdout: ' + r.stdout);
    const result = JSON.parse(r.stdout);

    assert(result.handoff_status === 'ready_to_run',
      'must be ready_to_run, got: ' + JSON.stringify(result));
    assert(result.checklist && result.checklist.claim_acquired === true, 'checklist.claim_acquired must be true');
    assert(result.checklist.plan_in_grammar === true, 'checklist.plan_in_grammar must be true');
    assert(result.checklist.plan_frozen === true, 'checklist.plan_frozen must be true');
    assert(result.checklist.resume_check_ok === true, 'checklist.resume_check_ok must be true');
    assert(result.checklist.roadmap_staged === true, 'checklist.roadmap_staged must be true');
    assert(result.first_node && result.first_node.id === 'explore',
      'first_node.id must be explore (advisory), got: ' + JSON.stringify(result.first_node));
    assert(result.first_node.model && result.first_node.model.length > 0,
      'first_node.model must be non-empty, got: ' + result.first_node.model);
    assert(result.decision === 'auto-run',
      'decision must be auto-run, got: ' + result.decision);

    // Plan must now contain plan_hash marker (proof of freeze).
    const frozenPlan = fs.readFileSync(planPath, 'utf8');
    assert(/<!-- plan_hash: [0-9a-f]{64} -->/.test(frozenPlan),
      'plan must contain <!-- plan_hash: --> after handoff');

    // Node1 ledger row must still be pending (handoff no longer opens it — adaptive-node.js does).
    assert(/\|\s*explore\s*\|\s*pending\s*\|/.test(frozenPlan),
      'explore ledger row must remain pending after handoff (adaptive-node.js opens it)');

  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptiveHandoffInGrammarReady: PASSED');
}

// ---------------------------------------------------------------------------
// testAdaptiveHandoffAskFreezesNotApproval — REGRESSION case: write-role fanout(impl)
// plan that validates decision:ask must still return ready_to_dispatch_first_node
// (NOT needs_user_approval). decision:ask is audit metadata; handoff freezes and proceeds.
// ---------------------------------------------------------------------------
function testAdaptiveHandoffAskFreezesNotApproval() {
  const tmp = adaptiveTmp('handoff-ask');
  try {
    initGitRepo(tmp);

    const projectName = 'issue-255-sim-ask';
    const projectDir = path.join(tmp, 'kaola-workflow', projectName);
    fs.mkdirSync(projectDir, { recursive: true });

    // write-role fanout(impl) → validator returns decision:ask (blast radius).
    const planText = makeHandoffPlan([
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| api | tdd-guide | explore | api/x.js | 1 | fanout(impl) |',
      '| cli | tdd-guide | explore | cli/y.js | 1 | fanout(impl) |',
      '| review | code-reviewer | api,cli | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], [
      '| explore | pending |',
      '| api | pending |',
      '| cli | pending |',
      '| review | pending |',
      '| done | pending |',
    ]);
    const planPath = path.join(projectDir, 'workflow-plan.md');
    fs.writeFileSync(planPath, planText);
    plantHandoffState(projectDir, projectName);

    spawnSync('git', ['add', '-A'], { cwd: tmp, encoding: 'utf8' });
    spawnSync('git', ['commit', '-m', 'handoff-ask fixture'], { cwd: tmp, encoding: 'utf8' });

    const r = runNode(handoffScript, ['--plan', planPath, '--json'], tmp);
    assert(r.status === 0, 'ask handoff must exit 0, got ' + r.status + '\nstderr: ' + r.stderr + '\nstdout: ' + r.stdout);
    const result = JSON.parse(r.stdout);

    // THE REGRESSION: must NOT be needs_user_approval; ask freezes and proceeds.
    assert(result.handoff_status === 'ready_to_run',
      'REGRESSION: decision:ask must still be ready_to_run (NOT needs_user_approval), got: ' + JSON.stringify(result));
    assert(result.decision === 'ask',
      'decision must be ask (audit metadata), got: ' + result.decision);

    // All checklist flags must be true.
    assert(result.checklist && result.checklist.claim_acquired === true, 'checklist.claim_acquired must be true');
    assert(result.checklist.plan_in_grammar === true, 'checklist.plan_in_grammar must be true');
    assert(result.checklist.plan_frozen === true, 'checklist.plan_frozen must be true');
    assert(result.checklist.resume_check_ok === true, 'checklist.resume_check_ok must be true');
    assert(result.checklist.roadmap_staged === true, 'checklist.roadmap_staged must be true');

    // NO risk_authorized key (2-state design; never returns this field).
    assert(!('risk_authorized' in result),
      'result must NOT have risk_authorized key, got: ' + JSON.stringify(Object.keys(result)));

    // Plan must be frozen.
    const frozenPlan = fs.readFileSync(planPath, 'utf8');
    assert(/<!-- plan_hash: [0-9a-f]{64} -->/.test(frozenPlan),
      'plan must be frozen (plan_hash present) after ask handoff');

  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptiveHandoffAskFreezesNotApproval: PASSED');
}

// ---------------------------------------------------------------------------
// testAdaptiveHandoffRefuseNoMutation — out-of-grammar plan (post-dominance leak).
// Snapshot bytes first. Assert plan_invalid, exit≠0, NO mutation of any kind.
// ---------------------------------------------------------------------------
function testAdaptiveHandoffRefuseNoMutation() {
  const tmp = adaptiveTmp('handoff-refuse');
  try {
    const projectName = 'issue-255-sim-refuse';
    const projectDir = path.join(tmp, 'kaola-workflow', projectName);
    fs.mkdirSync(projectDir, { recursive: true });

    // Post-dominance leak: doc-updater side-branches the main flow (not dominated by code-reviewer).
    const planText = makeHandoffPlan([
      '| impl | tdd-guide | — | lib/foo.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| doc | doc-updater | impl | — | 1 | sequence |',
      '| done | finalize | review,doc | — | 1 | sequence |',
    ], [
      '| impl | pending |',
      '| review | pending |',
      '| doc | pending |',
      '| done | pending |',
    ]);
    const planPath = path.join(projectDir, 'workflow-plan.md');
    fs.writeFileSync(planPath, planText);

    // Plant state so precondition passes (state must exist before validator runs).
    plantHandoffState(projectDir, projectName);

    // Snapshot plan bytes before handoff.
    const planBytesBefore = fs.readFileSync(planPath);

    const r = runNode(handoffScript, ['--plan', planPath, '--json'], tmp);

    // Must exit non-zero (plan_invalid).
    assert(r.status !== 0,
      'refuse handoff must exit non-zero, got exit ' + r.status + '\nstdout: ' + r.stdout);

    const result = JSON.parse(r.stdout);
    assert(result.handoff_status === 'plan_invalid',
      'must be plan_invalid, got: ' + JSON.stringify(result));
    assert(result.result === 'refuse',
      'result must be refuse, got: ' + result.result);
    assert(Array.isArray(result.errors) && result.errors.length > 0,
      'errors must be non-empty, got: ' + JSON.stringify(result.errors));
    assert(result.validator_verdict !== undefined && result.validator_verdict !== null,
      'validator_verdict must be present (non-null), got: ' + JSON.stringify(result));
    // Lock: refuse must come from the validator (not the precondition / state-missing path).
    assert(result.validator_verdict && result.validator_verdict.result === 'refuse',
      'must refuse at the validator (not the precondition), got: ' + JSON.stringify(result.validator_verdict));

    // Plan must be byte-identical (no plan_hash written, no mutation).
    const planBytesAfter = fs.readFileSync(planPath);
    assert(planBytesBefore.equals(planBytesAfter),
      'plan must be byte-identical after refuse (no mutation)');

    // No ## Planning Evidence in state.
    const stateContent = fs.readFileSync(path.join(projectDir, 'workflow-state.md'), 'utf8');
    assert(!stateContent.includes('## Planning Evidence'),
      'workflow-state.md must NOT have ## Planning Evidence after refuse');

    // No .cache/barrier-base-* baseline written.
    const cacheDir = path.join(projectDir, '.cache');
    const hasBarrierBase = fs.existsSync(cacheDir) &&
      fs.readdirSync(cacheDir).some(f => f.startsWith('barrier-base-'));
    assert(!hasBarrierBase,
      '.cache/barrier-base-* must NOT exist after refuse');

    // No .roadmap/issue-* written.
    const roadmapDir = path.join(tmp, 'kaola-workflow', '.roadmap');
    const hasRoadmapEntry = fs.existsSync(roadmapDir) &&
      fs.readdirSync(roadmapDir).some(f => /^issue-/.test(f));
    assert(!hasRoadmapEntry,
      '.roadmap/issue-* must NOT exist after refuse');

  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptiveHandoffRefuseNoMutation: PASSED');
}

// ---------------------------------------------------------------------------
// testAdaptiveHandoffIdempotentReRun — run in-grammar handoff TWICE.
// 2nd run must also be ready; plan_hash unchanged; ledger stays ALL-PENDING after handoff;
// ## Planning Evidence exactly once (replaced not appended).
// ---------------------------------------------------------------------------
function testAdaptiveHandoffIdempotentReRun() {
  const tmp = adaptiveTmp('handoff-idempotent');
  try {
    initGitRepo(tmp);

    const projectName = 'issue-255-sim-idem';
    const projectDir = path.join(tmp, 'kaola-workflow', projectName);
    fs.mkdirSync(projectDir, { recursive: true });

    const planText = makeHandoffPlan([
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| impl | tdd-guide | explore | lib/bar.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], [
      '| explore | pending |',
      '| impl | pending |',
      '| review | pending |',
      '| done | pending |',
    ]);
    const planPath = path.join(projectDir, 'workflow-plan.md');
    fs.writeFileSync(planPath, planText);
    plantHandoffState(projectDir, projectName);

    spawnSync('git', ['add', '-A'], { cwd: tmp, encoding: 'utf8' });
    spawnSync('git', ['commit', '-m', 'handoff-idem fixture'], { cwd: tmp, encoding: 'utf8' });

    // First run.
    const r1 = runNode(handoffScript, ['--plan', planPath, '--json'], tmp);
    assert(r1.status === 0, 'first run must exit 0, got ' + r1.status + '\nstderr: ' + r1.stderr + '\nstdout: ' + r1.stdout);
    const result1 = JSON.parse(r1.stdout);
    assert(result1.handoff_status === 'ready_to_run', 'first run must be ready');

    // Capture plan_hash from the frozen plan file.
    const planAfterRun1 = fs.readFileSync(planPath, 'utf8');
    const hashMatch1 = planAfterRun1.match(/<!-- plan_hash: ([0-9a-f]{64}) -->/);
    assert(hashMatch1, 'plan must have plan_hash after first run');
    const planHashRun1 = hashMatch1[1];

    // Second run (idempotent re-run).
    const r2 = runNode(handoffScript, ['--plan', planPath, '--json'], tmp);
    assert(r2.status === 0, 'second run must exit 0, got ' + r2.status + '\nstderr: ' + r2.stderr + '\nstdout: ' + r2.stdout);
    const result2 = JSON.parse(r2.stdout);

    assert(result2.handoff_status === 'ready_to_run',
      '2nd run must also be ready_to_run, got: ' + JSON.stringify(result2));

    // plan_hash must be unchanged.
    const planAfterRun2 = fs.readFileSync(planPath, 'utf8');
    const hashMatch2 = planAfterRun2.match(/<!-- plan_hash: ([0-9a-f]{64}) -->/);
    assert(hashMatch2, 'plan must still have plan_hash after second run');
    assert(hashMatch2[1] === planHashRun1,
      'plan_hash must be unchanged after idempotent re-run, run1=' + planHashRun1 + ' run2=' + hashMatch2[1]);

    // Node1 ledger must still be pending (handoff no longer opens it).
    const pendingMatches = planAfterRun2.match(/\|\s*explore\s*\|\s*pending\s*\|/g);
    assert(pendingMatches && pendingMatches.length === 1,
      'explore ledger row must remain pending after idempotent re-run, got: ' + JSON.stringify(pendingMatches));

    // ## Planning Evidence must appear exactly once in state (replaced, not appended).
    const stateContent = fs.readFileSync(path.join(projectDir, 'workflow-state.md'), 'utf8');
    const peMatches = stateContent.match(/## Planning Evidence/g);
    assert(peMatches && peMatches.length === 1,
      '## Planning Evidence must appear exactly once in state after 2 runs, got: ' + (peMatches ? peMatches.length : 0));

    // roadmap_staged still true on second run (init-issue no-op).
    assert(result2.checklist.roadmap_staged === true, 'roadmap_staged must be true on 2nd run');

  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptiveHandoffIdempotentReRun: PASSED');
}

// ---------------------------------------------------------------------------
// testAdaptiveHandoffProjectFlagResolvesRepoRoot — BLOCKING-1 regression (#255 review).
//
// In an install the handoff script lives at $HOME/.claude/kaola-workflow/scripts/
// so path.resolve(__dirname, '..') would be the INSTALL dir, not the user's repo.
// The fix: use git rev-parse --show-toplevel (cwd fallback) to resolve the user-repo.
//
// Proof: create a fresh tmp git repo (script-dir ≠ repo-root), plant
// kaola-workflow/<proj>/workflow-plan.md (in-grammar) + workflow-state.md,
// then run the REAL handoff script with --project <proj> --json and cwd=tmp.
// Assert handoff_status==='ready_to_dispatch_first_node' — proves --project
// resolved the tmp repo, not the script's install dir.
// ---------------------------------------------------------------------------
function testAdaptiveHandoffProjectFlagResolvesRepoRoot() {
  const tmp = adaptiveTmp('handoff-proj-root');
  try {
    initGitRepo(tmp);

    const projectName = 'issue-255-proj-root';
    const projectDir = path.join(tmp, 'kaola-workflow', projectName);
    fs.mkdirSync(projectDir, { recursive: true });

    // In-grammar auto-run plan (sequential) — code-reviewer post-dominates tdd-guide (G1).
    const planText = makeHandoffPlan([
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| impl | tdd-guide | explore | lib/bar.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], [
      '| explore | pending |',
      '| impl | pending |',
      '| review | pending |',
      '| done | pending |',
    ]);
    fs.writeFileSync(path.join(projectDir, 'workflow-plan.md'), planText);
    plantHandoffState(projectDir, projectName);

    // Commit so record-base has a tree to hash.
    spawnSync('git', ['add', '-A'], { cwd: tmp, encoding: 'utf8' });
    spawnSync('git', ['commit', '-m', 'proj-root fixture'], { cwd: tmp, encoding: 'utf8' });

    // Run handoff with --project (NOT --plan) and cwd=tmp.
    // script-dir (__dirname of handoffScript) is the REAL repoRoot/scripts/;
    // tmp is a DIFFERENT git repo. The getRoot() fix ensures --project resolves tmp.
    const r = runNode(handoffScript, ['--project', projectName, '--json'], tmp);
    assert(r.status === 0,
      'testAdaptiveHandoffProjectFlagResolvesRepoRoot: exit must be 0, got ' + r.status +
      '\nstderr: ' + r.stderr + '\nstdout: ' + r.stdout);
    const result = JSON.parse(r.stdout);
    assert(result.handoff_status === 'ready_to_run',
      'testAdaptiveHandoffProjectFlagResolvesRepoRoot: --project must resolve tmp repo root, ' +
      'got handoff_status=' + result.handoff_status + ' errors=' + JSON.stringify(result.errors));

  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptiveHandoffProjectFlagResolvesRepoRoot: PASSED');
}

// ---------------------------------------------------------------------------
// testAdaptiveHandoffDecisionIdConflict — #337 regression fixture (both arms).
// The repo already records decision id D-210-01 (a prior partial-close cycle:
// docs/decisions/ file, filename + content). An UNFROZEN in-grammar plan whose
// ## Plan Notes hardcodes D-210-01 must REFUSE pre-freeze (decision_id_conflict,
// exit≠0, plan bytes UNCHANGED — no plan_hash stamped). Renumbering to the next
// free D-210-02 with the deliberate reference annotated "D-210-01 (existing)"
// must freeze (exit 0, ready_to_run). Drives the REAL subprocess + the REAL
// default docs/CHANGELOG scanner seam (no injected stubs — #292 io-shim lesson).
// ---------------------------------------------------------------------------
function testAdaptiveHandoffDecisionIdConflict() {
  const tmp = adaptiveTmp('handoff-decision-id');
  try {
    initGitRepo(tmp);

    const projectName = 'issue-210-sim-decision-id';
    const projectDir = path.join(tmp, 'kaola-workflow', projectName);
    fs.mkdirSync(projectDir, { recursive: true });

    // Prior partial-close cycle already shipped D-210-01.
    const decisionsDir = path.join(tmp, 'docs', 'decisions');
    fs.mkdirSync(decisionsDir, { recursive: true });
    fs.writeFileSync(path.join(decisionsDir, 'D-210-01-prior-decision.md'),
      '# D-210-01 — prior decision\n\nShipped in the first partial-close cycle (PR #233).\n');

    const nodesRows = [
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| impl | tdd-guide | explore | lib/foo.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ];
    const ledgerRows = [
      '| explore | pending |',
      '| impl | pending |',
      '| review | pending |',
      '| done | pending |',
    ];
    const staleNotes = [
      '', '## Plan Notes', '',
      '- the docs follow-up records decision record D-210-01.', '',
    ].join('\n');
    const planPath = path.join(projectDir, 'workflow-plan.md');
    fs.writeFileSync(planPath, makeHandoffPlan(nodesRows, ledgerRows) + staleNotes);
    plantHandoffState(projectDir, projectName);

    spawnSync('git', ['add', '-A'], { cwd: tmp, encoding: 'utf8' });
    spawnSync('git', ['commit', '-m', 'decision-id fixture'], { cwd: tmp, encoding: 'utf8' });

    const planBytesBefore = fs.readFileSync(planPath);

    // Arm 1: stale id → typed refusal pre-freeze, no mutation.
    const r1 = runNode(handoffScript, ['--plan', planPath, '--json'], tmp);
    assert(r1.status !== 0,
      'decision-id conflict handoff must exit non-zero, got ' + r1.status + '\nstdout: ' + r1.stdout);
    const result1 = JSON.parse(r1.stdout);
    assert(result1.handoff_status === 'plan_invalid',
      'must be plan_invalid on stale decision id, got: ' + JSON.stringify(result1));
    assert(result1.result === 'refuse', 'result must be refuse, got: ' + result1.result);
    assert(Array.isArray(result1.errors) && (result1.errors[0] || '').includes('decision_id_conflict'),
      'errors[0] must include decision_id_conflict, got: ' + JSON.stringify(result1.errors));
    assert((result1.errors[0] || '').includes('docs/decisions/D-210-01-prior-decision.md'),
      'errors[0] must name the repo hit path, got: ' + JSON.stringify(result1.errors));

    // Plan must be byte-identical (no plan_hash stamped — refusal pre-freeze).
    const planBytesAfter = fs.readFileSync(planPath);
    assert(planBytesBefore.equals(planBytesAfter),
      'plan must be byte-identical after decision-id refusal (no mutation)');
    assert(!/plan_hash/.test(planBytesAfter.toString('utf8')),
      'no plan_hash may be stamped on decision-id refusal');

    // Arm 2: renumber to the next free id + annotate the deliberate reference.
    const fixedNotes = [
      '', '## Plan Notes', '',
      '- D-210-01 (existing) covered the first half; this cycle records D-210-02.', '',
    ].join('\n');
    fs.writeFileSync(planPath, makeHandoffPlan(nodesRows, ledgerRows) + fixedNotes);

    const r2 = runNode(handoffScript, ['--plan', planPath, '--json'], tmp);
    assert(r2.status === 0,
      'renumbered handoff must exit 0, got ' + r2.status + '\nstderr: ' + r2.stderr + '\nstdout: ' + r2.stdout);
    const result2 = JSON.parse(r2.stdout);
    assert(result2.handoff_status === 'ready_to_run',
      'renumbered plan must be ready_to_run, got: ' + JSON.stringify(result2));
    const frozenPlan = fs.readFileSync(planPath, 'utf8');
    assert(/<!-- plan_hash: [0-9a-f]{64} -->/.test(frozenPlan),
      'renumbered plan must be frozen (plan_hash stamped)');

  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptiveHandoffDecisionIdConflict: PASSED');
}

// ===========================================================================
// issue #264 — hidden-local worktree path, gitignore, legacy cleanup, sink guard
// ===========================================================================

// Feature-detect signals (all absent until their owning node lands):
//   CLAIM_SIGNAL      = typeof claim.legacySiblingWorktreePathFor === 'function'  (impl-claim, node 8)
//   SINK_SIGNAL       = typeof require(sinkMergeScript).assertBranchHasNonWorkflowChanges === 'function'  (impl-sink-guard, node 2)
//   PLAN_RUN_SIGNAL   = commands/kaola-workflow-plan-run.md contains 'ACTIVE_WORKTREE_PATH'  (impl-plan-run, node 3)

// Lazy signal accessors (evaluated once per test call, not at module load).
function claimSignal() {
  const claim = require(claimScript);
  return typeof claim.legacySiblingWorktreePathFor === 'function';
}
function sinkSignal() {
  return typeof require(sinkMergeScript).assertBranchHasNonWorkflowChanges === 'function';
}
function planRunSignal() {
  const planRunPath = path.join(repoRoot, 'commands', 'kaola-workflow-plan-run.md');
  try {
    return fs.readFileSync(planRunPath, 'utf8').includes('ACTIVE_WORKTREE_PATH');
  } catch (_) { return false; }
}

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
    // runClaimOnline hardcodes KAOLA_WORKTREE_NATIVE=1; KAOLA_ENABLE_ADAPTIVE=1 makes adaptive legal.
    const result = runClaimOnlineLastJson(
      ['startup', '--workflow-path', 'adaptive', '--target-issue', '507'],
      tmp, binDir, { KAOLA_ENABLE_ADAPTIVE: '1' });
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
    spawnSync('git', ['worktree', 'add', '-b', 'workflow/issue-520', '--', legacyWtPath, 'HEAD'],
      { cwd: tmp, encoding: 'utf8' });

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
    spawnSync('git', ['worktree', 'add', '-b', 'workflow/issue-521', '--', legacyWtPath, 'HEAD'],
      { cwd: tmp, encoding: 'utf8' });
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

    // Step 1: adaptive claim with NATIVE=1
    const sResult = runClaimOnlineLastJson(
      ['startup', '--workflow-path', 'adaptive', '--target-issue', '530'],
      tmp, binDir, { KAOLA_ENABLE_ADAPTIVE: '1' });
    assert(sResult.claim === 'acquired', 'adaptive startup 530 should acquire');

    if (!sResult.worktree_path) {
      // impl-claim not landed or provisioning suppressed → skip
      console.log('testAdaptiveWorktreeProvisionedE2E: SKIPPED (worktree_path empty, impl-claim+impl-plan-run pending)');
      return;
    }

    const wt530 = sResult.worktree_path;
    assert(fs.existsSync(wt530), 'worktree dir must exist, path: ' + wt530);

    // Step 2: mirror plan+.cache into the worktree (simulating impl-plan-run's one-time mirror)
    const projSrc = path.join(tmp, 'kaola-workflow', 'issue-530');
    const projDst = path.join(wt530, 'kaola-workflow', 'issue-530');
    fs.mkdirSync(projDst, { recursive: true });
    const cacheDir = path.join(projDst, '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });

    // Minimal frozen workflow-plan.md with one node
    const planContent = [
      '# Workflow Plan — issue #530', '',
      '## Meta', 'labels: enhancement', 'plan_hash: abc123', '',
      '## Nodes', '',
      '### Node impl-test', '- id: impl-test', '- depends_on: []', '- write_set: impl-test.txt',
      '- workflow_path: adaptive', '',
      '## Node Ledger', '',
      '| Node | Status | Started | Completed |',
      '|------|--------|---------|-----------|',
      '| impl-test | open | — | — |',
      ''
    ].join('\n');
    fs.writeFileSync(path.join(projDst, 'workflow-plan.md'), planContent);

    // Step 3: land an impl file in the worktree on the feature branch
    // The worktree is on workflow/issue-530 (created by claim)
    fs.writeFileSync(path.join(wt530, 'impl-test.txt'), 'implementation\n');
    spawnSync('git', ['add', 'impl-test.txt'], { cwd: wt530, encoding: 'utf8' });
    spawnSync('git', ['commit', '-m', 'feat: impl-test for issue 530'], { cwd: wt530, encoding: 'utf8' });

    // Step 4: worktree-finalize so workflow state is in the worktree branch
    const wfResult = runClaimOnlineLastJson(['worktree-finalize', '--project', 'issue-530'], tmp, binDir);
    assert(wfResult.finalized === true, 'worktree-finalize should succeed for adaptive e2e');

    // Step 5: finalize --keep-worktree
    const finResult = spawnSync(process.execPath, [
      claimScript, 'finalize', '--project', 'issue-530', '--keep-worktree'
    ], { cwd: wt530, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
    assert(finResult.status === 0, 'finalize --keep-worktree should exit 0\nstderr: ' + finResult.stderr);

    // Step 6: sink-merge (OFFLINE) — assert main now contains impl-test.txt (AC8)
    const featureHead = spawnSync('git', ['rev-parse', 'workflow/issue-530'],
      { cwd: tmp, encoding: 'utf8' }).stdout.trim();
    const smResult = spawnSync(process.execPath, [
      sinkMergeScript, '--project', 'issue-530', '--branch', 'workflow/issue-530', '--issue', '530'
    ], { cwd: wt530, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
    assert(smResult.status === 0,
      'sink-merge should exit 0 for adaptive e2e\nstdout: ' + smResult.stdout + '\nstderr: ' + smResult.stderr);

    const mainAfter = spawnSync('git', ['rev-parse', 'main'], { cwd: tmp, encoding: 'utf8' }).stdout.trim();
    assert(mainAfter === featureHead, 'main must advance to feature HEAD after sink-merge (AC8)');
    // AC8 core: merged main must contain the impl file
    const implInMain = spawnSync('git', ['cat-file', '-e', 'HEAD:impl-test.txt'],
      { cwd: tmp, encoding: 'utf8' });
    assert(implInMain.status === 0,
      'AC8: merged main must contain impl-test.txt — the implementation that landed in the worktree');

    console.log('testAdaptiveWorktreeProvisionedE2E: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
  }
}

// ── NEW (#335): testAdaptiveWorktreeMirrorNoManualCopy ───────────────────────
// AC1+AC3+AC4: a fresh adaptive worktree run — startup → author plan in MAIN →
// REAL handoff (freezes + mirrors) → REAL orient from the WORKTREE — succeeds
// with NO manual copy. The handoff's mirror-project step puts the frozen,
// plan_hash-verified project folder into the worktree. AC2 negative leg: delete
// the worktree project dir → orient refuses plan_not_mirrored → mirror-project
// repairs → orient succeeds (proves the mechanical repair works from worktree cwd
// via git-common-dir).
function testAdaptiveWorktreeMirrorNoManualCopy() {
  if (!claimSignal()) {
    console.log('testAdaptiveWorktreeMirrorNoManualCopy: SKIPPED (adaptive worktree provisioning pending)');
    return;
  }
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-335-mirror-')));
  const kwRoot = tmp + '.kw';
  try {
    initGitRepo(tmp);
    const binDir = path.join(tmp, 'bin');
    writeGhShimForStartup(binDir);

    // Step 1: adaptive startup provisions a hidden-local worktree at .kw/worktrees/issue-935.
    const sResult = runClaimOnlineLastJson(
      ['startup', '--workflow-path', 'adaptive', '--target-issue', '935'],
      tmp, binDir, { KAOLA_ENABLE_ADAPTIVE: '1' });
    assert(sResult.claim === 'acquired', '#335: adaptive startup 935 should acquire');
    if (!sResult.worktree_path) {
      console.log('testAdaptiveWorktreeMirrorNoManualCopy: SKIPPED (worktree_path empty — provisioning suppressed)');
      return;
    }
    const wt = sResult.worktree_path;
    assert(fs.existsSync(wt), '#335: worktree dir must exist: ' + wt);
    // The provisioned worktree must NOT yet contain the project folder (the bug premise).
    const wtPlan = path.join(wt, 'kaola-workflow', 'issue-935', 'workflow-plan.md');
    assert(!fs.existsSync(wtPlan), '#335: fresh worktree must NOT have the plan before the mirror');

    // Step 2: author an UNFROZEN plan into the MAIN project folder (handoff freezes it).
    const mainPlanPath = path.join(tmp, 'kaola-workflow', 'issue-935', 'workflow-plan.md');
    fs.writeFileSync(mainPlanPath, ADAPTIVE_PLAN);

    // Step 3: REAL handoff (cwd = main) — freezes + mirrors. No manual cp anywhere.
    const hr = runNode(handoffScript, ['--project', 'issue-935', '--json'], tmp);
    assert(hr.status === 0, '#335: handoff should exit 0\nstdout: ' + hr.stdout + '\nstderr: ' + hr.stderr);
    const hjson = JSON.parse(hr.stdout.trim().split('\n').filter(l => l.trim().startsWith('{')).pop());
    assert(hjson.handoff_status === 'ready_to_run', '#335: handoff_status===ready_to_run, got ' + JSON.stringify(hjson.handoff_status));
    assert(hjson.worktree_mirror && hjson.worktree_mirror.status === 'mirrored',
      '#335 AC1: worktree_mirror.status===mirrored, got ' + JSON.stringify(hjson.worktree_mirror));

    // AC4: the worktree plan exists and its plan_hash is byte-equal to the main copy.
    assert(fs.existsSync(wtPlan), '#335 AC1: worktree must contain the mirrored plan after the real handoff');
    const mainHashM = fs.readFileSync(mainPlanPath, 'utf8').match(/<!--\s*plan_hash:\s*([0-9a-f]{64})\s*-->/);
    const wtHashM = fs.readFileSync(wtPlan, 'utf8').match(/<!--\s*plan_hash:\s*([0-9a-f]{64})\s*-->/);
    assert(mainHashM && wtHashM, '#335 AC4: both plans must carry a plan_hash');
    assert(mainHashM[1] === wtHashM[1], '#335 AC4: worktree plan_hash must equal the main plan_hash');

    // Step 4: REAL orient FROM THE WORKTREE — succeeds, no manual copy.
    const o1 = runNode(adaptiveNodeScript, ['orient', '--project', 'issue-935', '--json'], wt);
    assert(o1.status === 0, '#335 AC3: orient from worktree should exit 0\nstdout: ' + o1.stdout + '\nstderr: ' + o1.stderr);
    const o1json = JSON.parse(o1.stdout.trim().split('\n').filter(l => l.trim().startsWith('{')).pop());
    assert(o1json.resumeCheck && o1json.resumeCheck.ok === true, '#335 AC3: orient resumeCheck.ok===true, got ' + JSON.stringify(o1json.resumeCheck));

    // AC2 negative leg: remove the worktree project dir → orient must refuse plan_not_mirrored.
    fs.rmSync(path.join(wt, 'kaola-workflow', 'issue-935'), { recursive: true, force: true });
    const o2 = runNode(adaptiveNodeScript, ['orient', '--project', 'issue-935', '--json'], wt);
    assert(o2.status === 1, '#335 AC2: orient on an unmirrored worktree must exit 1, got ' + o2.status + '\nstdout: ' + o2.stdout);
    const o2json = JSON.parse(o2.stdout.trim().split('\n').filter(l => l.trim().startsWith('{')).pop());
    assert(o2json.result === 'refuse' && o2json.reason === 'plan_not_mirrored',
      '#335 AC2: orient refuses plan_not_mirrored, got ' + JSON.stringify({ result: o2json.result, reason: o2json.reason }));
    assert(/mirror-project/.test(o2json.repair || ''), '#335 AC2: repair names the mirror-project command');

    // AC2 repair: mirror-project FROM THE WORKTREE cwd (resolves main via git-common-dir).
    const mp = runNode(adaptiveNodeScript, ['mirror-project', '--project', 'issue-935', '--json'], wt);
    assert(mp.status === 0, '#335 AC2: mirror-project from worktree should exit 0\nstdout: ' + mp.stdout + '\nstderr: ' + mp.stderr);
    const mpjson = JSON.parse(mp.stdout.trim().split('\n').filter(l => l.trim().startsWith('{')).pop());
    assert(mpjson.result === 'ok' && mpjson.status === 'mirrored',
      '#335 AC2: mirror-project re-mirrors from the worktree, got ' + JSON.stringify({ result: mpjson.result, status: mpjson.status }));

    // orient again → exit 0 (the mechanical repair restored the worktree copy).
    const o3 = runNode(adaptiveNodeScript, ['orient', '--project', 'issue-935', '--json'], wt);
    assert(o3.status === 0, '#335 AC2: orient after mirror-project repair should exit 0\nstdout: ' + o3.stdout + '\nstderr: ' + o3.stderr);

    console.log('testAdaptiveWorktreeMirrorNoManualCopy: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
  }
}

// ── NEW: testSinkRefusesWorkflowOnlyBranch ───────────────────────────────────
// AC7: sink-merge MUST exit 1 when the branch diff vs origin/main is all kaola-workflow/**
// Signal = sinkSignal() → assert exit 1 with refusal message
// Else    → assert today's behavior (allow — exit 0) so it's green now

function testSinkRefusesWorkflowOnlyBranch() {
  // AC7 (#264): the assertBranchHasNonWorkflowChanges helper must throw when the branch diff vs
  // origin/main is entirely kaola-workflow/**. We invoke the helper directly (bypassing the
  // OFFLINE gate and gh/push machinery) so the assertion is unambiguous.
  // Signal = sinkSignal() → strict assert helper throws; else skip (green).
  if (!sinkSignal()) {
    console.log('testSinkRefusesWorkflowOnlyBranch: SKIPPED (impl-sink-guard pending)');
    return;
  }
  const { assertBranchHasNonWorkflowChanges } = require(sinkMergeScript);
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-wf-only-')));
  try {
    // Need origin/main for the helper's git rev-parse
    initGitRepoWithBareRemote(tmp);

    spawnSync('git', ['checkout', '-b', 'workflow/issue-911'], { cwd: tmp, encoding: 'utf8' });
    // Archived folder only — no live folder, no impl file
    fs.mkdirSync(path.join(tmp, 'kaola-workflow', 'archive', 'issue-911'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'kaola-workflow', 'archive', 'issue-911', 'workflow-state.md'), 'status: closed\n');
    spawnSync('git', ['add', 'kaola-workflow/'], { cwd: tmp, encoding: 'utf8' });
    spawnSync('git', ['commit', '-m', 'chore: archive issue 911 (workflow-only, no impl)'], { cwd: tmp, encoding: 'utf8' });

    // Direct call: must throw (branch is workflow-only)
    let threw = false;
    let thrownMsg = '';
    try {
      assertBranchHasNonWorkflowChanges(tmp, 'workflow/issue-911', 'main');
    } catch (e) {
      threw = true;
      thrownMsg = e && e.message ? e.message : String(e);
    }
    assert(threw,
      'AC7: assertBranchHasNonWorkflowChanges must throw for a workflow-only branch');
    assert(/kaola-workflow|workflow-only|no implementation/i.test(thrownMsg),
      'refusal message must mention kaola-workflow or workflow-only, got: ' + thrownMsg);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(tmp + '-remote', { recursive: true, force: true }); } catch (_) {}
  }
  console.log('testSinkRefusesWorkflowOnlyBranch: PASSED');
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

    spawnSync('git', ['checkout', '-b', 'workflow/issue-912'], { cwd: tmp, encoding: 'utf8' });
    // Real impl file — makes the branch NOT workflow-only
    fs.writeFileSync(path.join(tmp, 'impl-912.txt'), 'implementation\n');
    // Plus archived workflow artifacts
    fs.mkdirSync(path.join(tmp, 'kaola-workflow', 'archive', 'issue-912'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'kaola-workflow', 'archive', 'issue-912', 'workflow-state.md'), 'status: closed\n');
    spawnSync('git', ['add', '.'], { cwd: tmp, encoding: 'utf8' });
    spawnSync('git', ['commit', '-m', 'feat: impl and archived workflow for 912'], { cwd: tmp, encoding: 'utf8' });

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

// ── NEW: testPlanRunWiredForWorktree ─────────────────────────────────────────
// D3 (governance): reads commands/kaola-workflow-plan-run.md; asserts ACTIVE_WORKTREE_PATH + Working directory
// Signal = planRunSignal() → strict assert both present; else pass (pending impl-plan-run)

function testPlanRunWiredForWorktree() {
  if (!planRunSignal()) {
    // impl-plan-run not yet landed → skip
    console.log('testPlanRunWiredForWorktree: SKIPPED (impl-plan-run pending)');
    return;
  }
  const planRunPath = path.join(repoRoot, 'commands', 'kaola-workflow-plan-run.md');
  const content = fs.readFileSync(planRunPath, 'utf8');
  assert(content.includes('ACTIVE_WORKTREE_PATH'),
    'plan-run.md must contain ACTIVE_WORKTREE_PATH resolver (impl-plan-run, AC6)');
  assert(/Working directory:/i.test(content),
    'plan-run.md must contain a "Working directory:" line proving the executor is dispatched into the worktree (impl-plan-run, AC6)');
  console.log('testPlanRunWiredForWorktree: PASSED');
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
    const r = spawnSync(nodeExec, [thisScript, '--only', 'noSuchScenarioXYZ'], {
      encoding: 'utf8', timeout: 30000
    });
    assert(r.status === 1, 'self-check: --only bogus token must exit 1, got ' + r.status);
    assert(/noSuchScenarioXYZ/.test(r.stderr + r.stdout),
      'self-check: --only bogus token error must name the token, got:\n' + r.stderr + r.stdout);
  }

  // (3) --only a known fast self-contained scenario runs green.
  {
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
// SCENARIO REGISTRY
//
// Ordered array of [name, fn] pairs preserving the exact execution order from
// the original main(). The first 13 entries are marked sharedTmp:true — they
// share a single tmp directory created by main() and are ordering-coupled (git
// init in entry 1 affects later entries; roadmap tests rmSync shared dirs).
// When --only selects any shared-tmp scenario the WHOLE shared-tmp group runs
// in order. Self-contained entries (the vast majority) run truly standalone.
//
// Registry index: populated at module-load time by buildRegistry() below.
// ---------------------------------------------------------------------------

// Shared-tmp group runner: receives the already-created tmp dir and runs
// the group in original order. Async because one entry is async.
async function runSharedTmpGroup(tmp) {
  testClaimStatusRelease(tmp);
  testFinalize(tmp);
  testRepair(tmp);
  testRepairFastPath(tmp);
  testRepairFastEscalation(tmp);
  testHookSingleProjectGuard(tmp);
  testRoadmapGenerateMissingSourceGuard(tmp);
  testRoadmapGenerateAtomicReplace(tmp);
  testRoadmapProjectRulesAppend(tmp);
  await testRoadmapInitIssueConcurrentExclusive(tmp);
  testRoadmapFilenameAuthorityMissingIssueField(tmp);
  testRoadmapFilenameAuthorityMismatch(tmp);
  testRoadmapMigrateRoundTripNoDoubleEscape(tmp);
}

// Shared-tmp member names in order (used for --list and --only matching).
const SHARED_TMP_NAMES = [
  'testClaimStatusRelease',
  'testFinalize',
  'testRepair',
  'testRepairFastPath',
  'testRepairFastEscalation',
  'testHookSingleProjectGuard',
  'testRoadmapGenerateMissingSourceGuard',
  'testRoadmapGenerateAtomicReplace',
  'testRoadmapProjectRulesAppend',
  'testRoadmapInitIssueConcurrentExclusive',
  'testRoadmapFilenameAuthorityMissingIssueField',
  'testRoadmapFilenameAuthorityMismatch',
  'testRoadmapMigrateRoundTripNoDoubleEscape',
];

// Build the ordered registry. Each entry is { name, fn, sharedTmp }.
// sharedTmp:true entries are kept as individual names in the registry so
// --list displays them, but the runner collapses the whole group when any
// member is selected.
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
  add('testKeepOpenArchiveStamp',                         testKeepOpenArchiveStamp);
  add('testManualArchiveBackstop',                        testManualArchiveBackstop);
  add('testRepairFastNoArgSingle',                        testRepairFastNoArgSingle);
  add('testRepairFastNoArgAmbiguous',                     testRepairFastNoArgAmbiguous);
  add('testRepairFinalizationRoute',                      testRepairFinalizationRoute);
  add('testSinkPrUsesFinalizationSummary',                testSinkPrUsesFinalizationSummary);
  add('testHookGitDashCCommitGuard',                      testHookGitDashCCommitGuard);
  add('testHookShapeNoPhantomAdvisor',                    testHookShapeNoPhantomAdvisor);
  add('testResumeCompatLegacyAdvisorGateRow',             testResumeCompatLegacyAdvisorGateRow);
  add('testWriteLaneHookGuard',                           testWriteLaneHookGuard);
  add('testWriteLaneHookRegistered',                      testWriteLaneHookRegistered);
  add('testSubagentDispatchHookExists',                   testSubagentDispatchHookExists);
  add('testClassifierFolderOverlapRed',                   testClassifierFolderOverlapRed);
  add('testClassifierFolderOverlapYellow',                testClassifierFolderOverlapYellow);
  add('testClassifierClosedIssueResidueIgnored',          testClassifierClosedIssueResidueIgnored);
  add('testClassifierReleasedFolderExcluded',             testClassifierReleasedFolderExcluded);
  add('testClassifierFastScopeOverlapRed',                testClassifierFastScopeOverlapRed);
  add('testClassifierFastScopeDisjointGreen',             testClassifierFastScopeDisjointGreen);
  add('testClassifierDotPathOverlapRed',                  testClassifierDotPathOverlapRed);
  add('testClassifierRootPathProseNoOverlap',             testClassifierRootPathProseNoOverlap);
  add('testClassifierDotAreaOverlapRed',                  testClassifierDotAreaOverlapRed);
  add('testClassifierCuratedRootOverlapYellow',           testClassifierCuratedRootOverlapYellow);
  add('testClassifierCuratedRootProseClaimedYellow',      testClassifierCuratedRootProseClaimedYellow);
  add('testClassifierCuratedRootProseNoOverlapGreen',     testClassifierCuratedRootProseNoOverlapGreen);
  add('testClassifierCuratedRootStructuredLowercaseYellow', testClassifierCuratedRootStructuredLowercaseYellow);
  add('testClassifierFastScopeSectionIsolationGreen',     testClassifierFastScopeSectionIsolationGreen);
  add('testClassifierFastScopeFenceCommentRed',           testClassifierFastScopeFenceCommentRed);
  add('testClassifierFastScopeFenceHeadingRed',           testClassifierFastScopeFenceHeadingRed);
  add('testClassifierFastScopeFenceMixedMarkerRed',       testClassifierFastScopeFenceMixedMarkerRed);
  add('testClassifierFastScopeFenceInFencePathRed',       testClassifierFastScopeFenceInFencePathRed);
  add('testClassifierFastScopePreSectionUnclosedFenceRed', testClassifierFastScopePreSectionUnclosedFenceRed);
  add('testClassifierDependsOnGate',                      testClassifierDependsOnGate);
  add('testProbeIssueStateOffline',                       testProbeIssueStateOffline);
  add('testProbeIssueStateNullIssue',                     testProbeIssueStateNullIssue);
  add('testProbeIssueStateEmptyGhResponse',               testProbeIssueStateEmptyGhResponse);
  add('testProbeIssueStateGhThrows',                      testProbeIssueStateGhThrows);
  add('testStartupJsonAndHiddenLocalWorktrees',           testStartupJsonAndHiddenLocalWorktrees);
  add('testWorktreeNativeDefaultOff',                     testWorktreeNativeDefaultOff);
  add('testWorktreeNativeInPlaceIdempotentReclaim',        testWorktreeNativeInPlaceIdempotentReclaim);
  add('testWorktreeNativeDirtyTreeRefusal',               testWorktreeNativeDirtyTreeRefusal);
  add('testWorktreeNativeDetachedHeadRecordOnly',         testWorktreeNativeDetachedHeadRecordOnly);
  add('testWorktreeNativeDiscardRestoresBase',            testWorktreeNativeDiscardRestoresBase);
  add('testWorktreeNativeDiscardRestoresNonDefaultBase',  testWorktreeNativeDiscardRestoresNonDefaultBase);
  add('testWorktreeNativeOfflineWins',                    testWorktreeNativeOfflineWins);
  add('testWorktreeNativeSurfacesProvisionFailure',       testWorktreeNativeSurfacesProvisionFailure);
  add('testWorktreeAdaptiveProvisioned',                  testWorktreeAdaptiveProvisioned);
  add('testFastStartupState',                             testFastStartupState);
  add('testResumeFastEmptyNextCommand',                   testResumeFastEmptyNextCommand);
  add('testClassifierCurrentClaimMarkerBlocks',           testClassifierCurrentClaimMarkerBlocks);
  add('testWatchPrArchivesClosedIssuePrFolder',           testWatchPrArchivesClosedIssuePrFolder);
  add('testSinkFallbackSkipsArchivedProject',             testSinkFallbackSkipsArchivedProject);
  add('testFinalizeReleaseCleansWorktree',                testFinalizeReleaseCleansWorktree);
  add('testFinalizeFromLinkedWorktreeCleansMainCopy',     testFinalizeFromLinkedWorktreeCleansMainCopy);
  add('testFinalizeNarrowStagingExcludesForeignArchive',  testFinalizeNarrowStagingExcludesForeignArchive);
  add('testFinalizeFromMainRootNoSpuriousRemoval',        testFinalizeFromMainRootNoSpuriousRemoval);
  add('testFinalizeCleansRoadmapEntry',                   testFinalizeCleansRoadmapEntry);
  add('testFinalizeFromLinkedWorktreeCleansRoadmapEntry', testFinalizeFromLinkedWorktreeCleansRoadmapEntry);
  add('testFinalizeFromLinkedWorktreeCleansMainStagedRoadmapSource', testFinalizeFromLinkedWorktreeCleansMainStagedRoadmapSource);
  add('testFinalizeRoadmapCleanupFailureReceipt',         testFinalizeRoadmapCleanupFailureReceipt);
  add('testWatchPrRoadmapCleanupWarning',                 testWatchPrRoadmapCleanupWarning);
  add('testValidateRemoteOffline',                        testValidateRemoteOffline);
  add('testReleaseFromLinkedWorktreeCleansMainCopy',      testReleaseFromLinkedWorktreeCleansMainCopy);
  add('testSinkMergeFromLinkedWorktree',                  testSinkMergeFromLinkedWorktree);
  add('testStatusShowsClosedIssueDrift',                  testStatusShowsClosedIssueDrift);
  add('testStaleWorktreeCheck',                           testStaleWorktreeCheck);
  add('testStaleWorktreeCleanup',                         testStaleWorktreeCleanup);
  add('testNoTargetZeroActive',                           testNoTargetZeroActive);
  add('testNoTargetOneActive',                            testNoTargetOneActive);
  add('testNoTargetMultipleActive',                       testNoTargetMultipleActive);
  add('testSoleActiveRoundTrip',                          testSoleActiveRoundTrip);
  add('testSinkPrLeavesCleanWorktree',                    testSinkPrLeavesCleanWorktree);
  add('testReadPriorityConfig',                           testReadPriorityConfig);
  add('testE2EGitHubMergeFullChain',                      testE2EGitHubMergeFullChain);
  add('testSinkMergeRefusesLiveFolder',                   testSinkMergeRefusesLiveFolder);
  add('testSinkMergeBlocksUnpushedCommits',               testSinkMergeBlocksUnpushedCommits);
  add('testSinkMergeAutoPushesWhenNoUpstream',            testSinkMergeAutoPushesWhenNoUpstream);
  add('testSinkMergeOfflineSkipsPublishGuard',            testSinkMergeOfflineSkipsPublishGuard);
  add('testSinkMergeNonDefaultBranchMaster',              testSinkMergeNonDefaultBranchMaster);
  add('testSinkMergeReRebasesOnFfRace',                   testSinkMergeReRebasesOnFfRace);
  add('testFastE2EMergeFullChain',                        testFastE2EMergeFullChain);
  add('testE2EGitHubPrFullChain',                         testE2EGitHubPrFullChain);
  add('testParallelIssueIndependence',                    testParallelIssueIndependence);
  add('testClassifierFailClosedOnRemoteError',            testClassifierFailClosedOnRemoteError);
  add('testClassifierOfflineUnverifiedNoLocalEvidence',   testClassifierOfflineUnverifiedNoLocalEvidence);
  add('testClassifierOfflineVerifiedRoadmapAcquires',     testClassifierOfflineVerifiedRoadmapAcquires);
  add('testClassifierOfflineVerifiedOwnedFolderRoutes',   testClassifierOfflineVerifiedOwnedFolderRoutes);
  add('testClassifierOfflineUnverifiedWithUnrelatedActiveFolder', testClassifierOfflineUnverifiedWithUnrelatedActiveFolder);
  add('testStartupExplicitTargetRedRefuses',              testStartupExplicitTargetRedRefuses);
  add('testClassifierTopLevelIssueFlag',                  testClassifierTopLevelIssueFlag);
  add('testClaimProjectOwnedFolderFailingRemote',         testClaimProjectOwnedFolderFailingRemote);
  add('testFinalizeRemovesClaimLabel',                    testFinalizeRemovesClaimLabel);
  add('testFinalizeNullFolderFallbackReadsArchive',       testFinalizeNullFolderFallbackReadsArchive);
  add('testFinalizeOfflineSkipsLabelInvariant',           testFinalizeOfflineSkipsLabelInvariant);
  add('testWatchPrEmitsClaimLabelReceipt',                testWatchPrEmitsClaimLabelReceipt);
  add('testAuditAndRepairLabels',                         testAuditAndRepairLabels);
  add('testFinalizeClaimLabelFailedTriggersInvariant',    testFinalizeClaimLabelFailedTriggersInvariant);
  add('testClearAdvisoryClaimDeletesMarkerComment',       testClearAdvisoryClaimDeletesMarkerComment);
  add('testClearAdvisoryClaimDoesNotDeleteOtherProjectMarker', testClearAdvisoryClaimDoesNotDeleteOtherProjectMarker);
  add('testClearAdvisoryClaimOfflineSkipsDelete',         testClearAdvisoryClaimOfflineSkipsDelete);
  add('testSinkMergeEmitsClosureReceipt',                 testSinkMergeEmitsClosureReceipt);
  add('testWatchPrMergedClosureReceipt',                  testWatchPrMergedClosureReceipt);
  add('testFinalizeOfflineClosureReceiptSkipped',         testFinalizeOfflineClosureReceiptSkipped);
  add('testSinkMergeMockabilityAndReceipt',               testSinkMergeMockabilityAndReceipt);
  add('testSinkMergeCloseFailureWarning',                 testSinkMergeCloseFailureWarning);
  add('testSinkMergeSkipsArchivedProjectPhantom',         testSinkMergeSkipsArchivedProjectPhantom);
  add('testKeepOpenMergeFullChain',                       testKeepOpenMergeFullChain);
  add('testKeepOpenFinalizeFlagAlias',                    testKeepOpenFinalizeFlagAlias);
  add('testSinkMergeKeepOpenOnlineMock',                  testSinkMergeKeepOpenOnlineMock);
  add('testSinkMergeKeepOpenRequiresIssue',               testSinkMergeKeepOpenRequiresIssue);
  add('testSinkMergeKeepOpenArchivedStateGuard',          testSinkMergeKeepOpenArchivedStateGuard);
  add('testClosureAuditKeepOpenExclusion',                testClosureAuditKeepOpenExclusion);
  add('testKeepOpenInvariantUnit',                        testKeepOpenInvariantUnit);
  add('testSinkPrKeepOpenRefusal',                        testSinkPrKeepOpenRefusal);
  add('testClosureAuditOfflineRemoteClassesSkipped',      testClosureAuditOfflineRemoteClassesSkipped);
  add('testClosureAuditClosedRemoteRoadmapSource',        testClosureAuditClosedRemoteRoadmapSource);
  add('testClosureAuditArchiveClosedDrift',               testClosureAuditArchiveClosedDrift);
  add('testClosureAuditDedupRoadmapAndArchive',           testClosureAuditDedupRoadmapAndArchive);
  add('testClosureAuditArchiveOnlyNotProbed',             testClosureAuditArchiveOnlyNotProbed);
  add('testClosureAuditMirrorListsClosedIssues',          testClosureAuditMirrorListsClosedIssues);
  add('testClosureAuditStaleInProgressLabels',            testClosureAuditStaleInProgressLabels);
  add('testClosureAuditActiveFolderForClosedIssueReportsDirty', testClosureAuditActiveFolderForClosedIssueReportsDirty);
  add('testClosureAuditUnarchivedPrFolderMerged',         testClosureAuditUnarchivedPrFolderMerged);
  add('testClosureAuditExecuteRepairsRoadmapAndLabels',   testClosureAuditExecuteRepairsRoadmapAndLabels);
  add('testClosureAuditExecuteNeverTouchesActiveFolders', testClosureAuditExecuteNeverTouchesActiveFolders);
  add('testClosureAuditDryRunNeverCallsRemoveLabel',      testClosureAuditDryRunNeverCallsRemoveLabel);
  add('testClosureAuditStaleLabelsTimeout',               testClosureAuditStaleLabelsTimeout);
  add('testClosureAuditUnresolvedClosedState',            testClosureAuditUnresolvedClosedState);
  add('testClosureAuditProbeFailureUnresolved',           testClosureAuditProbeFailureUnresolved);
  add('testClosureAuditTimeoutEnvInvalidFallsBack',       testClosureAuditTimeoutEnvInvalidFallsBack);
  add('testClosureAuditTimeoutEnvOverCapFallsBack',       testClosureAuditTimeoutEnvOverCapFallsBack);
  add('testClosureAuditExecuteDetectionTimeoutPropagates', testClosureAuditExecuteDetectionTimeoutPropagates);
  add('testClosureAuditExecuteLabelRemovalTimeoutBreaks', testClosureAuditExecuteLabelRemovalTimeoutBreaks);
  add('testClosureAuditExecuteLabelRemovalNonTimeoutFails', testClosureAuditExecuteLabelRemovalNonTimeoutFails);
  add('testClosureAuditPrFolderTimeout',                  testClosureAuditPrFolderTimeout);
  add('testProbeTimeoutEnv',                              testProbeTimeoutEnv);
  add('testContractValidatorOfflineSkip',                 testContractValidatorOfflineSkip);
  add('testContractValidatorReflowTolerant',              testContractValidatorReflowTolerant);
  add('testContractValidatorMissingTag',                  testContractValidatorMissingTag);
  add('testWatchPrAbandonedClosureInvariantsClean',       testWatchPrAbandonedClosureInvariantsClean);
  add('testClaimReclaimsStatelessOrphanDir',              testClaimReclaimsStatelessOrphanDir);
  add('testPatchBranchGuards',                            testPatchBranchGuards);
  add('testAdaptiveOffStartupRefusal',                    testAdaptiveOffStartupRefusal);
  add('testAdaptiveOffClaimRefusal',                      testAdaptiveOffClaimRefusal);
  add('testAdaptiveOffPreservesTwoWay',                   testAdaptiveOffPreservesTwoWay);
  add('testAdaptiveOnStartupAcquires',                    testAdaptiveOnStartupAcquires);
  add('testAdaptiveResumeFromFrozenPlan',                 testAdaptiveResumeFromFrozenPlan);
  add('testAdaptiveResumeTamperedTypedRefusal',           testAdaptiveResumeTamperedTypedRefusal);
  add('testAdaptiveResumeUnparseableTypedRefusal',        testAdaptiveResumeUnparseableTypedRefusal);
  add('testAdaptiveResumeAfterFlipOff',                   testAdaptiveResumeAfterFlipOff);
  add('testAdaptiveConsentHaltSurfaces',                  testAdaptiveConsentHaltSurfaces);
  add('testAdaptiveCrossSurfaceMutexWalkthrough',         testAdaptiveCrossSurfaceMutexWalkthrough);
  add('testAdaptiveValidatorGovernance',                  testAdaptiveValidatorGovernance);
  add('testAdaptiveFanoutGroupScoping',                   testAdaptiveFanoutGroupScoping);
  add('testAdaptiveReadySetDisjointness',                 testAdaptiveReadySetDisjointness);
  add('testAdaptiveGateBarrierEnforcement',               testAdaptiveGateBarrierEnforcement);
  add('testAdaptivePerInstanceBarrier',                   testAdaptivePerInstanceBarrier);
  add('testAdaptivePerInstanceBarrierHardening',          testAdaptivePerInstanceBarrierHardening);
  add('testAdaptiveResumeReconcilesNextCommand',          testAdaptiveResumeReconcilesNextCommand);
  add('testAdaptiveDurableConsentHalt',                   testAdaptiveDurableConsentHalt);
  add('testAdaptiveAuthoringEntryGuard',                  testAdaptiveAuthoringEntryGuard);
  add('testAdaptiveTier2Composition',                     testAdaptiveTier2Composition);
  add('testAdaptiveAuditFixes',                           testAdaptiveAuditFixes);
  add('testAdaptiveResumeHashDeletedTypedRefusal',        testAdaptiveResumeHashDeletedTypedRefusal);
  add('testAdaptiveValidatorNodeCap',                     testAdaptiveValidatorNodeCap);
  add('testAdaptiveCheapWinFixes',                        testAdaptiveCheapWinFixes);
  add('testAdaptiveAuditCoverage',                        testAdaptiveAuditCoverage);
  add('testAdaptiveSyncGroupGap',                         testAdaptiveSyncGroupGap);
  add('testAdaptiveRegistrationAndForgePortGaps',         testAdaptiveRegistrationAndForgePortGaps);
  add('testAdaptiveFreezeRepairReconcile',                testAdaptiveFreezeRepairReconcile);
  add('testAdaptiveVerdictCheck',                         testAdaptiveVerdictCheck);
  add('testAdaptivePatternLibrary',                       testAdaptivePatternLibrary);
  add('testAdaptiveSelectComposition',                    testAdaptiveSelectComposition);
  add('testAdaptiveSelectNaPropagation',                  testAdaptiveSelectNaPropagation);
  add('testAdaptiveSelectResumeCheck',                    testAdaptiveSelectResumeCheck);
  add('testAdaptiveSelectSelectorSourceFanoutMember',     testAdaptiveSelectSelectorSourceFanoutMember);
  add('testAdaptiveHandoffInGrammarReady',                testAdaptiveHandoffInGrammarReady);
  add('testAdaptiveHandoffAskFreezesNotApproval',         testAdaptiveHandoffAskFreezesNotApproval);
  add('testAdaptiveHandoffRefuseNoMutation',              testAdaptiveHandoffRefuseNoMutation);
  add('testAdaptiveHandoffIdempotentReRun',               testAdaptiveHandoffIdempotentReRun);
  add('testAdaptiveHandoffProjectFlagResolvesRepoRoot',   testAdaptiveHandoffProjectFlagResolvesRepoRoot);
  add('testAdaptiveHandoffDecisionIdConflict',            testAdaptiveHandoffDecisionIdConflict);
  add('testGitignoreCoversKw',                            testGitignoreCoversKw);
  add('testWorktreeHiddenLocalPath',                      testWorktreeHiddenLocalPath);
  add('testLegacyWorktreeCleanupDryRun',                  testLegacyWorktreeCleanupDryRun);
  add('testLegacyWorktreeCleanupDirtySkip',               testLegacyWorktreeCleanupDirtySkip);
  add('testAdaptiveWorktreeProvisionedE2E',               testAdaptiveWorktreeProvisionedE2E);
  add('testAdaptiveWorktreeMirrorNoManualCopy',           testAdaptiveWorktreeMirrorNoManualCopy);
  add('testSinkRefusesWorkflowOnlyBranch',                testSinkRefusesWorkflowOnlyBranch);
  add('testSinkAllowsMixedBranch',                        testSinkAllowsMixedBranch);
  add('testPlanRunWiredForWorktree',                      testPlanRunWiredForWorktree);
  add('testPlannerAttestFlagBackfillsDispatchLog',        testPlannerAttestFlagBackfillsDispatchLog);
  add('testPlannerAttestFlagAbsentStaysMissing',          testPlannerAttestFlagAbsentStaysMissing);
  add('testPlannerAttestFlagPresentInPlannerAgent',       testPlannerAttestFlagPresentInPlannerAgent);
  add('testDispatchLogHookWorktreeAware338',              testDispatchLogHookWorktreeAware338);
  add('testContractorAttestFlagBackfills338',             testContractorAttestFlagBackfills338);
  add('testContractorAttestAbsentWarnsNonBlocking338',    testContractorAttestAbsentWarnsNonBlocking338);
  add('testFinalizeIncompleteResumesCrashState',          testFinalizeIncompleteResumesCrashState);
  add('testFinalizeIncompleteNegativeControlAlreadyDone', testFinalizeIncompleteNegativeControlAlreadyDone);
  add('testFinalizeIncompleteNegativeControlRepoDirty',   testFinalizeIncompleteNegativeControlRepoDirty);
  add('testFinalizeIncompleteWorktreeReentryFix',         testFinalizeIncompleteWorktreeReentryFix);
  add('testBundleClaimCreatesOneFolder',                  testBundleClaimCreatesOneFolder);
  add('testBundleRefusalLeavesNoFolder',                  testBundleRefusalLeavesNoFolder);
  add('testBundleDuplicateIssueBlocking',                 testBundleDuplicateIssueBlocking);
  add('testBundleAdaptiveResumeSurfacesBundleIdentity',   testBundleAdaptiveResumeSurfacesBundleIdentity);
  add('testBundleFinalizeRoadmapCleanup',                 testBundleFinalizeRoadmapCleanup);
  add('testBundleSingleIssueStateHasNoBundleFields',      testBundleSingleIssueStateHasNoBundleFields);
  add('testHarnessSelfCheck',                             testHarnessSelfCheck);
  return reg;
}

const SCENARIO_REGISTRY = buildRegistry();

async function main() {
  // ── CLI: parse --list and --only ──────────────────────────────────────────
  const args = process.argv.slice(2);
  const onlyTokens = [];
  let listMode = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--list') {
      listMode = true;
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
    if (fullRun) {
      // Full run: same order as original main(), shared-tmp group first.
      await runSharedTmpGroup(tmp);
      for (const entry of SCENARIO_REGISTRY) {
        if (entry.sharedTmp) continue; // already ran above
        await entry.fn();
      }
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

// ── #280: AC1 — M1 planner back-fill + M2 sink-merge attestation check ──────
// Drives a real startup claim WITH --attest-planner-spawn, verifies the back-fill
// lands in dispatch-log.jsonl, then appends a contractor line (simulating the hook),
// runs finalize, asserts claim_planner_attested===attested + finalize_contractor_attested===attested
// in BOTH the finalize receipt and the sink-merge closure_receipt.
// The sink-merge assertion is the primary M2 regression check.
function testPlannerAttestFlagBackfillsDispatchLog() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-280-ac1-')));
  const kwRoot = tmp + '.kw';
  try {
    initGitRepo(tmp);
    const binDir = path.join(tmp, 'bin');
    writeGhShimForStartup(binDir);

    // Real startup claim WITH --attest-planner-spawn (M1 fix path)
    const sResult = runClaimOnlineLastJson(
      ['startup', '--target-issue', '280001', '--attest-planner-spawn'],
      tmp, binDir
    );
    assert(sResult.claim === 'acquired', 'M1 (#280): startup must acquire');
    const project = sResult.selected_project || 'issue-280001';

    // The back-fill must have written to .cache/dispatch-log.jsonl
    const dispatchLog = path.join(tmp, 'kaola-workflow', project, '.cache', 'dispatch-log.jsonl');
    assert(fs.existsSync(dispatchLog),
      'M1 (#280): --attest-planner-spawn must create dispatch-log.jsonl at ' + dispatchLog);
    const logContent = fs.readFileSync(dispatchLog, 'utf8');
    const lines = logContent.split('\n').filter(Boolean);
    const plannerLine = lines.find(l => { try { return JSON.parse(l).agent_type === 'workflow-planner'; } catch(_) { return false; } });
    assert(plannerLine, 'M1 (#280): dispatch-log must contain a workflow-planner entry, got: ' + logContent);

    // Append a contractor line (simulating the SubagentStart hook logging the contractor)
    const contractorEntry = JSON.stringify({
      ts: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      agent_type: 'contractor',
      agent_id: 'test-contractor',
      cwd: tmp
    });
    fs.appendFileSync(dispatchLog, contractorEntry + '\n');

    // finalize — must see both lines (archive-first check matches cmdFinalize behaviour)
    const finResult = runClaimOnlineLastJson(
      ['finalize', '--project', project],
      tmp, binDir
    );
    assert(finResult.status === 'closed', 'M1 (#280): finalize must return status:closed, got: ' + JSON.stringify(finResult));
    const finReceipt = finResult.closure_receipt;
    assert(finReceipt, 'M1 (#280): finalize must emit closure_receipt');
    assert(finReceipt.claim_planner_attested === 'attested',
      'M1 (#280): finalize closure_receipt.claim_planner_attested must be attested, got: ' + finReceipt.claim_planner_attested);
    assert(finReceipt.finalize_contractor_attested === 'attested',
      'M1 (#280): finalize closure_receipt.finalize_contractor_attested must be attested, got: ' + finReceipt.finalize_contractor_attested);

    // sink-merge — M2: must also check the archived dispatch-log (archive-first)
    // Set up the worktree branch that sink-merge needs to FF-merge.
    const wtPath = sResult.worktree_path;
    const branchName = sResult.branch || ('workflow/issue-280001');
    // We need a feature commit on the branch before sink-merge can FF.
    // The worktree is on the feature branch already (provisioned by claim).
    // If worktree not provisioned (NATIVE=1 offline), fall back to in-repo branch.
    const commitRepo = (wtPath && fs.existsSync(wtPath)) ? wtPath : tmp;
    fs.writeFileSync(path.join(commitRepo, 'feature-280001.txt'), 'ac1 test\n');
    spawnSync('git', ['add', 'feature-280001.txt'], { cwd: commitRepo, encoding: 'utf8' });
    spawnSync('git', ['commit', '-m', 'feat: ac1 test for issue 280001'], { cwd: commitRepo, encoding: 'utf8' });

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
      'M2 (#280): sink-merge must exit 0\nstdout: ' + smResult.stdout + '\nstderr: ' + smResult.stderr);

    const smLines = smResult.stdout.trim().split('\n').filter(l => l.trim());
    const smParsed = JSON.parse(smLines[smLines.length - 1]);
    assert(smParsed.status === 'merged',
      'M2 (#280): sink-merge must emit status:merged, got: ' + JSON.stringify(smParsed));
    const smReceipt = smParsed.closure_receipt;
    assert(smReceipt, 'M2 (#280): sink-merge must emit closure_receipt');
    assert(smReceipt.claim_planner_attested === 'attested',
      'M2 (#280): sink-merge closure_receipt.claim_planner_attested must be attested, got: ' + smReceipt.claim_planner_attested);
    assert(smReceipt.finalize_contractor_attested === 'attested',
      'M2 (#280): sink-merge closure_receipt.finalize_contractor_attested must be attested, got: ' + smReceipt.finalize_contractor_attested);

    console.log('testPlannerAttestFlagBackfillsDispatchLog: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
  }
}

// ── #280: AC2 — no flag + no log → fields stay not-attested (inline-bypass guard) ──
// Same startup WITHOUT --attest-planner-spawn, no dispatch-log written.
// Both finalize and sink-merge receipts must have claim_planner_attested !== 'attested'
// (may be 'missing' or 'failed' — we accept either to survive the M2 'missing' shift).
function testPlannerAttestFlagAbsentStaysMissing() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-280-ac2-')));
  const kwRoot = tmp + '.kw';
  try {
    initGitRepo(tmp);
    const binDir = path.join(tmp, 'bin');
    writeGhShimForStartup(binDir);

    // Real startup WITHOUT the flag
    const sResult = runClaimOnlineLastJson(
      ['startup', '--target-issue', '280002'],
      tmp, binDir
    );
    assert(sResult.claim === 'acquired', 'AC2 (#280): startup must acquire');
    const project = sResult.selected_project || 'issue-280002';

    // No dispatch-log must be written (no flag, no hook in test env)
    const dispatchLog = path.join(tmp, 'kaola-workflow', project, '.cache', 'dispatch-log.jsonl');
    assert(!fs.existsSync(dispatchLog),
      'AC2 (#280): without --attest-planner-spawn, dispatch-log must NOT be created');

    // finalize
    const finResult = runClaimOnlineLastJson(
      ['finalize', '--project', project],
      tmp, binDir
    );
    assert(finResult.status === 'closed', 'AC2 (#280): finalize must return status:closed');
    const finReceipt = finResult.closure_receipt;
    assert(finReceipt, 'AC2 (#280): finalize must emit closure_receipt');
    assert(finReceipt.claim_planner_attested !== 'attested',
      'AC2 (#280): finalize closure_receipt.claim_planner_attested must NOT be attested (inline-bypass guard), got: ' + finReceipt.claim_planner_attested);
    assert(finReceipt.finalize_contractor_attested !== 'attested',
      'AC2 (#280): finalize closure_receipt.finalize_contractor_attested must NOT be attested, got: ' + finReceipt.finalize_contractor_attested);

    // sink-merge
    const wtPath = sResult.worktree_path;
    const branchName = sResult.branch || 'workflow/issue-280002';
    const commitRepo = (wtPath && fs.existsSync(wtPath)) ? wtPath : tmp;
    fs.writeFileSync(path.join(commitRepo, 'feature-280002.txt'), 'ac2 test\n');
    spawnSync('git', ['add', 'feature-280002.txt'], { cwd: commitRepo, encoding: 'utf8' });
    spawnSync('git', ['commit', '-m', 'feat: ac2 test for issue 280002'], { cwd: commitRepo, encoding: 'utf8' });

    const smResult = spawnSync(process.execPath, [
      sinkMergeScript,
      '--project', project,
      '--branch', branchName,
      '--issue', '280002'
    ], {
      cwd: commitRepo,
      encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
    });
    assert(smResult.status === 0,
      'AC2 (#280): sink-merge must exit 0\nstdout: ' + smResult.stdout + '\nstderr: ' + smResult.stderr);

    const smLines = smResult.stdout.trim().split('\n').filter(l => l.trim());
    const smParsed = JSON.parse(smLines[smLines.length - 1]);
    const smReceipt = smParsed.closure_receipt;
    assert(smReceipt, 'AC2 (#280): sink-merge must emit closure_receipt');
    assert(smReceipt.claim_planner_attested !== 'attested',
      'AC2 (#280): sink-merge closure_receipt.claim_planner_attested must NOT be attested (no flag), got: ' + smReceipt.claim_planner_attested);
    assert(smReceipt.finalize_contractor_attested !== 'attested',
      'AC2 (#280): sink-merge closure_receipt.finalize_contractor_attested must NOT be attested (no flag), got: ' + smReceipt.finalize_contractor_attested);

    console.log('testPlannerAttestFlagAbsentStaysMissing: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
  }
}

// ── #280: contract guard — agents/workflow-planner.md must contain --attest-planner-spawn ──
// Non-circular: the behavioral tests above SET the flag themselves; this guard proves
// production actually passes it by checking the planner agent body.
function testPlannerAttestFlagPresentInPlannerAgent() {
  const plannerPath = path.join(repoRoot, 'agents', 'workflow-planner.md');
  const plannerText = fs.readFileSync(plannerPath, 'utf8');
  assert(plannerText.includes('--attest-planner-spawn'),
    'contract guard (#280): agents/workflow-planner.md startup invocation must contain --attest-planner-spawn, got (excerpt): ' +
    plannerText.substring(plannerText.indexOf('startup'), plannerText.indexOf('startup') + 200));
  console.log('testPlannerAttestFlagPresentInPlannerAgent: PASSED');
}

// ── #338 T3: dispatch-log hook is worktree-aware (dual-root capture) ──────────
// Producer-side false-negative fix: a contractor dispatched into a linked worktree must be
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
    const wtAdd = spawnSync('git', ['worktree', 'add', '-b', 'wt338', wt], { cwd: main, encoding: 'utf8' });
    assert(wtAdd.status === 0, '#338 T3: git worktree add must succeed: ' + wtAdd.stderr);
    // Active project state file ONLY in the worktree.
    const wtProj = path.join(wt, 'kaola-workflow', 'proj');
    fs.mkdirSync(wtProj, { recursive: true });
    fs.writeFileSync(path.join(wtProj, 'workflow-state.md'), '# State\nstatus: active\n');
    // No active project in main → the old hook (hook-cwd only) would log nothing.
    const payload = JSON.stringify({ agent_type: 'contractor', agent_id: 't', cwd: wt });
    const hr = spawnSync('bash', [hookPath], { cwd: main, input: payload, encoding: 'utf8' });
    assert(hr.status === 0, '#338 T3: hook must exit 0 (fail-open), got ' + hr.status);
    const wtLog = path.join(wtProj, '.cache', 'dispatch-log.jsonl');
    assert(fs.existsSync(wtLog),
      '#338 T3: worktree-dispatched contractor must be logged under the WORKTREE project .cache/');
    const wtLogContent = fs.readFileSync(wtLog, 'utf8');
    assert(wtLogContent.includes('"agent_type":"contractor"'),
      '#338 T3: worktree dispatch-log must contain a contractor entry, got: ' + wtLogContent);
    try { spawnSync('git', ['worktree', 'remove', '--force', wt], { cwd: main, encoding: 'utf8' }); } catch (_) {}
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
    const payload = JSON.stringify({ agent_type: 'contractor', agent_id: 't', cwd: inplace });
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

// ── #338 T4: cmdFinalize --attest-contractor-spawn → finalize_contractor_attested:attested ──
// No hook, no planner flag: the contractor's own --attest-contractor-spawn back-fills its
// dispatch marker so the closure receipt reads attested even where the hook cannot fire.
function testContractorAttestFlagBackfills338() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-338-ac2-attest-')));
  const kwRoot = tmp + '.kw';
  try {
    initGitRepo(tmp);
    const binDir = path.join(tmp, 'bin');
    writeGhShimForStartup(binDir);

    const sResult = runClaimOnlineLastJson(['startup', '--target-issue', '338001'], tmp, binDir);
    assert(sResult.claim === 'acquired', '#338 T4: startup must acquire');
    const project = sResult.selected_project || 'issue-338001';

    // No dispatch-log yet (no flag at claim, no hook in test env).
    const dispatchLog = path.join(tmp, 'kaola-workflow', project, '.cache', 'dispatch-log.jsonl');
    assert(!fs.existsSync(dispatchLog), '#338 T4: no dispatch-log before finalize back-fill');

    const finResult = runClaimOnlineLastJson(
      ['finalize', '--project', project, '--attest-contractor-spawn'], tmp, binDir);
    assert(finResult.status === 'closed', '#338 T4: finalize must return status:closed, got: ' + JSON.stringify(finResult));
    const finReceipt = finResult.closure_receipt;
    assert(finReceipt, '#338 T4: finalize must emit closure_receipt');
    assert(finReceipt.finalize_contractor_attested === 'attested',
      '#338 T4: --attest-contractor-spawn must make finalize_contractor_attested attested, got: ' + finReceipt.finalize_contractor_attested);

    // The archived dispatch-log must carry the finalize-backfill contractor marker.
    const archiveLog = path.join(tmp, 'kaola-workflow', 'archive', project, '.cache', 'dispatch-log.jsonl');
    assert(fs.existsSync(archiveLog), '#338 T4: archived dispatch-log must exist after back-fill');
    const archiveContent = fs.readFileSync(archiveLog, 'utf8');
    assert(archiveContent.includes('finalize-backfill'),
      '#338 T4: archived dispatch-log must contain finalize-backfill entry, got: ' + archiveContent);
    console.log('testContractorAttestFlagBackfills338: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
  }
}

// ── #338 T5: inline finalize bypass → contractor missing + ATTESTATION WARNING, NON-blocking ──
// The exact false-positive scenario from the issue: the planner WAS dispatched (its back-fill
// populates a dispatch-log), but the contractor finalize seam is run INLINE (no
// --attest-contractor-spawn). The dispatch-log exists with a planner entry and no contractor
// entry → the per-seam ATTESTATION WARNING fires and finalize_contractor_attested:missing.
// Pins the explicit-fallback branch demanded by AC2: a future change must not make a missing
// contractor attestation silently blocking, nor silently quiet.
function testContractorAttestAbsentWarnsNonBlocking338() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-338-ac2-fallback-')));
  const kwRoot = tmp + '.kw';
  try {
    initGitRepo(tmp);
    const binDir = path.join(tmp, 'bin');
    writeGhShimForStartup(binDir);

    // Planner WAS dispatched (its back-fill writes a dispatch-log) — but no contractor entry.
    const sResult = runClaimOnlineLastJson(
      ['startup', '--target-issue', '338002', '--attest-planner-spawn'], tmp, binDir);
    assert(sResult.claim === 'acquired', '#338 T5: startup must acquire');
    const project = sResult.selected_project || 'issue-338002';
    const dispatchLog = path.join(tmp, 'kaola-workflow', project, '.cache', 'dispatch-log.jsonl');
    assert(fs.existsSync(dispatchLog), '#338 T5: planner back-fill must create a dispatch-log');

    // finalize WITHOUT --attest-contractor-spawn → contractor seam run inline.
    const finResult = runClaimOnlineLastJson(['finalize', '--project', project], tmp, binDir);
    assert(finResult.status === 'closed',
      '#338 T5: finalize must still return status:closed (warn-first, NEVER blocks), got: ' + JSON.stringify(finResult));
    const finReceipt = finResult.closure_receipt;
    assert(finReceipt, '#338 T5: finalize must emit closure_receipt');
    assert(finReceipt.claim_planner_attested === 'attested',
      '#338 T5: planner WAS dispatched → claim_planner_attested must be attested, got: ' + finReceipt.claim_planner_attested);
    assert(finReceipt.finalize_contractor_attested === 'missing',
      '#338 T5: inline finalize (no flag) → finalize_contractor_attested must be missing, got: ' + finReceipt.finalize_contractor_attested);
    assert(Array.isArray(finReceipt.warnings) &&
      finReceipt.warnings.some(w => w.includes('ATTESTATION WARNING: no contractor dispatch found in dispatch-log')),
      '#338 T5: missing contractor attestation must surface the ATTESTATION WARNING, got: ' + JSON.stringify(finReceipt.warnings));
    console.log('testContractorAttestAbsentWarnsNonBlocking338: PASSED');
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
    const dirtyCheck = spawnSync('git', ['-C', tmp, 'status', '--porcelain'], { encoding: 'utf8' });
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
    spawnSync('git', ['add', '-A'], { cwd: tmp, encoding: 'utf8' });
    spawnSync('git', ['commit', '-m', 'impl: issue 296y'], { cwd: tmp, encoding: 'utf8' });
    // Confirm tree is clean.
    const cleanCheck = spawnSync('git', ['-C', tmp, 'status', '--porcelain'], { encoding: 'utf8' });
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
    spawnSync('git', ['add', '-A'], { cwd: tmp, encoding: 'utf8' });
    spawnSync('git', ['commit', '-m', 'impl: archive issue-296z'], { cwd: tmp, encoding: 'utf8' });
    // Now add an UNRELATED untracked file — simulating another issue in progress.
    fs.writeFileSync(path.join(tmp, 'other-issue-work.js'), '// unrelated\n');
    // Confirm the repo is dirty but only because of the unrelated file.
    const dirtyCheck = spawnSync('git', ['-C', tmp, 'status', '--porcelain'], { encoding: 'utf8' });
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
    spawnSync('git', ['worktree', 'add', '-b', 'workflow/issue-296b1', '--', wtPath, 'HEAD'],
      { cwd: tmp, encoding: 'utf8' });

    // Confirm the worktree is linked (getCoordRoot from wt points to main .git).
    const coordFromWt = spawnSync('git', ['rev-parse', '--git-common-dir'],
      { cwd: wtPath, encoding: 'utf8' }).stdout.trim();
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
      'step: complete',
      ''
    ].join('\n'));
    // Verify archive is untracked in the worktree (crash state).
    const dirtyBefore = spawnSync('git', ['status', '--porcelain'],
      { cwd: wtPath, encoding: 'utf8' });
    assert(dirtyBefore.stdout.trim().length > 0,
      'fixture: worktree must be dirty (archive uncommitted) before re-entry');

    // Re-entry: run cmdFinalize --keep-worktree from the worktree (second call).
    const finResult = spawnSync(process.execPath, [
      claimScript, 'finalize', '--project', project, '--keep-worktree'
    ], { cwd: wtPath, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
    assert(finResult.status === 0,
      '#296 B1: finalize re-entry must exit 0\nstdout: ' + finResult.stdout + '\nstderr: ' + finResult.stderr);

    // After re-entry with the fix: archive must be committed, tree must be clean.
    const dirtyAfter = spawnSync('git', ['status', '--porcelain'],
      { cwd: wtPath, encoding: 'utf8' });
    assert(dirtyAfter.stdout.trim().length === 0,
      '#296 B1: working tree must be clean after finalize re-entry, got: ' + JSON.stringify(dirtyAfter.stdout));

    // Confirm the archive was committed (not just staged).
    const archiveRelPath = path.join('kaola-workflow', 'archive', project, 'workflow-state.md');
    const catFile = spawnSync('git', ['cat-file', '-e', 'HEAD:' + archiveRelPath],
      { cwd: wtPath, encoding: 'utf8' });
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
      spawnSync('git', ['worktree', 'remove', '--force', wtPath], { cwd: tmp, encoding: 'utf8' });
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
    plantRoadmapIssue(tmp, 42, '');
    plantRoadmapIssue(tmp, 47, '');
    plantRoadmapIssue(tmp, 53, '');
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
        KAOLA_ENABLE_ADAPTIVE: '1',
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
    plantRoadmapIssue(tmp, 42, '');
    plantRoadmapIssue(tmp, 47, '');
    plantRoadmapIssue(tmp, 53, '');
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
        KAOLA_ENABLE_ADAPTIVE: '1',
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
    plantRoadmapIssue(tmp, 47, '');
    plantRoadmapIssue(tmp, 77, '');
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
      tmp,
      { KAOLA_ENABLE_ADAPTIVE: '1' });
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
      tmp,
      { KAOLA_ENABLE_ADAPTIVE: '1' });
    assert(r2.status === 1,
      '#328 dup-block (b): overlapping bundle [47,77] must exit 1, got ' + r2.status + '\nstdout: ' + r2.stdout);
    const o2 = JSON.parse(r2.stdout);
    assert(o2.status === 'target_set_conflicts_active_work',
      '#328 dup-block (b): status must be target_set_conflicts_active_work, got ' + JSON.stringify(o2.status));

  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testBundleDuplicateIssueBlocking: PASSED');
}

// #328 scenario 4: adaptive orient on a bundle project surfaces bundleId, issueNumbers,
// primaryIssue, closurePolicy in the JSON output — so an orchestrator can identify bundle
// identity at resume time without re-reading workflow-state.md manually.
// AC#14 (orient surface) guard.
function testBundleAdaptiveResumeSurfacesBundleIdentity() {
  const tmp = adaptiveTmp('328-orient');
  try {
    const project = 'bundle-42-47-53';
    // Write a bundle state file
    writeProject(tmp, project, {
      'workflow-state.md': [
        '# Kaola-Workflow State', '',
        '## Project', 'name: ' + project, 'status: active', '',
        '## Current Position', 'phase: adaptive', 'workflow_path: adaptive',
        'step: start', 'next_command: /kaola-workflow-plan-run ' + project, '',
        '## Pending Gates', '- workflow-plan', '',
        '## Last Evidence', 'last_command: startup', 'last_result: folder_claimed', '',
        '## Sink', 'branch: workflow/' + project,
        'issue_number: 42',
        'issue_numbers: 42,47,53',
        'bundle_id: ' + project,
        'closure_policy: all_or_nothing',
        'sink: merge', ''
      ].join('\n')
    });

    // Plant and freeze an adaptive plan so orient can run resume-check
    const planText = [
      '# Workflow Plan — ' + project, '',
      '## Meta', 'labels: enhancement', '',
      '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape |',
      '|---|---|---|---|---|---|',
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| done | finalize | explore | — | 1 | sequence |',
      ''
    ].join('\n');
    plantFrozenPlan(tmp, project, planText);

    // Call adaptive-node orient (--json required by the CLI)
    const result = runNode(adaptiveNodeScript, ['orient', '--project', project, '--json'], tmp);
    assert(result.status === 0,
      '#328 orient: exit 0 expected, got ' + result.status + '\nstderr: ' + result.stderr);
    const out = JSON.parse(result.stdout);

    assert(out.bundleId === 'bundle-42-47-53',
      '#328 orient: bundleId must be bundle-42-47-53, got ' + JSON.stringify(out.bundleId));
    assert(Array.isArray(out.issueNumbers) && out.issueNumbers.length === 3,
      '#328 orient: issueNumbers must be [42,47,53], got ' + JSON.stringify(out.issueNumbers));
    assert(out.issueNumbers[0] === 42 && out.issueNumbers[1] === 47 && out.issueNumbers[2] === 53,
      '#328 orient: issueNumbers values must be 42,47,53, got ' + JSON.stringify(out.issueNumbers));
    assert(out.primaryIssue === 42,
      '#328 orient: primaryIssue must be 42, got ' + JSON.stringify(out.primaryIssue));
    assert(out.closurePolicy === 'all_or_nothing',
      '#328 orient: closurePolicy must be all_or_nothing, got ' + JSON.stringify(out.closurePolicy));

  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testBundleAdaptiveResumeSurfacesBundleIdentity: PASSED');
}

// #328 scenario 5: finalize on a bundle project removes ALL member .roadmap/issue-N.md files,
// regenerates ROADMAP.md once, archives exactly ONE folder, and the closure receipt has
// closed_issues + failed_issue_closures + roadmap_sources_removed.
// AC#11 + AC#12 + AC#13 E2E guard.
function testBundleFinalizeRoadmapCleanup() {
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
      '## Pending Gates', '- none', '',
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
    plantRoadmapIssue(tmp, 42, '');
    plantRoadmapIssue(tmp, 47, '');
    plantRoadmapIssue(tmp, 53, '');

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
    assert(out.closure_receipt && out.closure_receipt.roadmap_regenerated === 'regenerated',
      '#328 finalize: receipt.roadmap_regenerated must be "regenerated", got ' +
      JSON.stringify(out.closure_receipt && out.closure_receipt.roadmap_regenerated));

    // All three .roadmap sources were removed
    for (const n of [42, 47, 53]) {
      assert(!fs.existsSync(path.join(tmp, 'kaola-workflow', '.roadmap', 'issue-' + n + '.md')),
        '#328 finalize: issue-' + n + '.md roadmap source must be removed after finalize');
    }

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
      assert(Array.isArray(receipt.roadmap_sources_removed),
        '#328 finalize: receipt must have roadmap_sources_removed array');
      if (Array.isArray(receipt.roadmap_sources_removed)) {
        assert(receipt.roadmap_sources_removed.length === 3,
          '#328 finalize: roadmap_sources_removed must have 3 entries, got ' + receipt.roadmap_sources_removed.length);
        for (const n of [42, 47, 53]) {
          assert(receipt.roadmap_sources_removed.includes('issue-' + n + '.md'),
            '#328 finalize: roadmap_sources_removed must include issue-' + n + '.md');
        }
      }
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
  console.log('testBundleFinalizeRoadmapCleanup: PASSED');
}

// #328 AC#1 guard: a single-issue claim must NOT write issue_numbers, bundle_id, or
// closure_policy lines in workflow-state.md — the bundle fields are strictly additive and
// must not contaminate the single-issue path.
function testBundleSingleIssueStateHasNoBundleFields() {
  const tmp = adaptiveTmp('328-ac1');
  try {
    plantRoadmapIssue(tmp, 601, '');
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
});
