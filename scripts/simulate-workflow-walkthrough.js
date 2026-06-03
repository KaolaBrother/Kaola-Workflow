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
const hookScript = path.join(repoRoot, 'hooks', 'kaola-workflow-pre-commit.sh');
const phantomAdvisorHook = path.join(repoRoot, 'hooks', 'kaola-workflow-phantom-advisor.sh');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runNode(script, args, cwd, extraEnv) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...(extraEnv || {}), KAOLA_WORKFLOW_OFFLINE: '1' }
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

function testHookSingleProjectGuard(tmp) {
  spawnSync('git', ['init'], { cwd: tmp, encoding: 'utf8' });
  writeProject(tmp, 'a', { 'workflow-state.md': 'status: active\n' });
  writeProject(tmp, 'b', { 'workflow-state.md': 'status: active\n' });
  spawnSync('git', ['add', 'kaola-workflow/a/workflow-state.md', 'kaola-workflow/b/workflow-state.md'], { cwd: tmp, encoding: 'utf8' });
  const result = spawnSync('bash', [hookScript], { cwd: tmp, input: '', encoding: 'utf8' });
  assert(result.status === 2, 'pre-commit hook should block mixed project commits');
}

function testPhantomAdvisorHookGuard() {
  // Behavioral coverage for the phantom-advisor PostToolUse hook. Regression guard
  // for the bugs that left it inert: it must read the payload on STDIN (not an env
  // var), parse tool_input.{file_path,content,new_string} (Write carries `content`,
  // Edit carries `new_string`), fail OPEN outside a git repo (never a false block),
  // and resolve the kaola-workflow/<project> segment from the LAST occurrence so a
  // repo directory itself named 'kaola-workflow' does not shadow it.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-phantom-advisor-'));
  try {
    // Repo dir literally named 'kaola-workflow' exercises the double-segment path.
    const repo = path.join(tmp, 'kaola-workflow');
    const projectDir = path.join(repo, 'kaola-workflow', 'issue-1');
    fs.mkdirSync(projectDir, { recursive: true });
    spawnSync('git', ['init'], { cwd: repo, encoding: 'utf8' });
    const filePath = path.join(projectDir, 'phase5-review.md');
    const run = (payload, cwd) => spawnSync('bash', [phantomAdvisorHook],
      { cwd: cwd || repo, input: typeof payload === 'string' ? payload : JSON.stringify(payload), encoding: 'utf8' });

    // (a) Write citation, no backing advisor cache -> BLOCK (exit 2).
    let r = run({ tool_input: { file_path: filePath, content: 'the advisor says proceed' } });
    assert(r.status === 2, 'phantom-advisor must block an unbacked Write advisor citation, got ' + r.status);

    // (b) Same citation with a backing artifact -> ALLOW. Also proves the segment
    // resolves correctly under a repo dir named 'kaola-workflow'.
    const cacheDir = path.join(projectDir, '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, 'advisor-plan.md'), '# advisor\n');
    r = run({ tool_input: { file_path: filePath, content: 'the advisor says proceed' } });
    assert(r.status === 0, 'phantom-advisor must allow a citation backed by .cache/advisor-*.md, got ' + r.status);
    fs.rmSync(path.join(cacheDir, 'advisor-plan.md'));

    // (c) No citation -> ALLOW.
    r = run({ tool_input: { file_path: filePath, content: 'ordinary phase notes' } });
    assert(r.status === 0, 'phantom-advisor must allow non-citing content, got ' + r.status);

    // (d) Edit citation in new_string (no `content` field) -> BLOCK.
    r = run({ tool_input: { file_path: filePath, old_string: 'x', new_string: 'per the advisor we proceed' } });
    assert(r.status === 2, 'phantom-advisor must scan Edit new_string and block an unbacked citation, got ' + r.status);

    // (e) Empty stdin -> ALLOW (no payload).
    r = run('');
    assert(r.status === 0, 'phantom-advisor must no-op on empty stdin, got ' + r.status);

    // (f) Non-workflow path with a citation -> ignore.
    r = run({ tool_input: { file_path: path.join(repo, 'README.md'), content: 'the advisor says hi' } });
    assert(r.status === 0, 'phantom-advisor must ignore non-workflow paths, got ' + r.status);

    // (g) Outside any git repo -> fail OPEN (cwd is the un-init'd mkdtemp root).
    r = run({ tool_input: { file_path: path.join(tmp, 'no-such', 'kaola-workflow', 'issue-9', 'phase5-review.md'), content: 'the advisor says proceed' } }, tmp);
    assert(r.status === 0, 'phantom-advisor must fail open outside a git repo, got ' + r.status);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
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
    // Pre-#233 the merged group had width 6 > FANOUT_CAP(4) -> refuse. Post-#233 two groups of 3,
    // each under the cap and internally disjoint -> in-grammar (write-role fan-out => ask).
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

    // CONTROL 1: a genuine single-origin fan-out (5 members, all depends_on root) over FANOUT_CAP=4
    // must STILL refuse — the scoping must not let a real over-cap fan-out through.
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
    assert(v.result === 'refuse' && /FANOUT_CAP/.test((v.errors || []).join(';')),
      'B6 control: genuine single-origin fan-out over the cap must still refuse, got: ' + JSON.stringify(v));

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
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptiveGateBarrierEnforcement: PASSED');
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
    // `phase:` field (e.g. phase5 complete writes phase: 5 + next_command: /kaola-workflow-phase6).
    // The non-adaptive path must PRESERVE it — reconciliation must not override it back to the
    // phase-field-derived command. (#234 must not regress the phaseN->phaseN+1 transition resume.)
    writeProject(tmp, 'issue-942', { 'workflow-state.md': [
      'name: issue-942', 'issue_number: 942', 'status: active',
      'phase: 5', 'workflow_path: full', 'next_command: /kaola-workflow-phase6 issue-942', ''].join('\n') });
    out = JSON.parse(runNode(claimScript, ['resume', '--project', 'issue-942'], tmp).stdout);
    assert(out.next_command === '/kaola-workflow-phase6 issue-942',
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
      '| b | docs-lookup | — | — | 1 | fanout(g) |',
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
    assert(v.result === 'refuse' && /FANOUT_CAP/.test((v.errors || []).join(';')), 'I6: fan-out of 5 > FANOUT_CAP must refuse, got: ' + JSON.stringify(v));
    v = validatePlanFixture(tmp, [
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| f1 | tdd-guide | explore | scripts/a.js | 1 | fanout(g) |',
      '| f2 | tdd-guide | explore | scripts/b.js | 1 | fanout(g) |',
      '| review | code-reviewer | f1,f2 | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], ['chore']);
    assert(v.result === 'refuse' && /shared infra/.test((v.errors || []).join(';')), 'I6: YELLOW shared-infra fan-out must refuse, got: ' + JSON.stringify(v));

    // I7: LOOP_CAP boundary + read-only width cap.
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
    assert(v.result === 'refuse' && /FANOUT_CAP/.test((v.errors || []).join(';')), 'I7: read-only fan-out of 5 > FANOUT_CAP must refuse, got: ' + JSON.stringify(v));
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
    plantRoadmapIssue(tmp, 331, 'body: this change also edits the Dockerfile to add a build stage');
    const result = runClassifierOffline(tmp, 331);
    assert(result.verdict === 'yellow' && /Dockerfile/.test(result.reasoning),
      'issue #238: curated root-file overlap must be yellow/ask (not red, not green), got ' + result.verdict + ' (' + result.reasoning + ')');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testClassifierCuratedRootOverlapYellow: PASSED');
}

// issue #238 CONTROL (no over-block): a candidate naming a curated root file must NOT be blocked
// when no claimed project actually touches it — stays green (the safe-over-ask, not over-block).
function testClassifierCuratedRootProseNoOverlapGreen() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-classifier-curated-green-'));
  try {
    plantActiveFolder(tmp, 'unrelated-claimed', 340, '# Phase 3\nFiles: scripts/some-file.js\n', 'active');
    plantRoadmapIssue(tmp, 341, 'body: this change edits the Dockerfile only, nothing else');
    const result = runClassifierOffline(tmp, 341);
    assert(result.verdict === 'green',
      'issue #238 control: a curated root file named by the candidate but untouched by any claimed project must stay green, got ' + result.verdict + ' (' + result.reasoning + ')');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testClassifierCuratedRootProseNoOverlapGreen: PASSED');
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

function initGitRepo(tmp) {
  spawnSync('git', ['init', '-b', 'main'], { cwd: tmp, encoding: 'utf8' });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: tmp, encoding: 'utf8' });
  spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: tmp, encoding: 'utf8' });
  fs.writeFileSync(path.join(tmp, 'README.md'), 'fixture\n');
  spawnSync('git', ['add', 'README.md'], { cwd: tmp, encoding: 'utf8' });
  spawnSync('git', ['commit', '-m', 'init'], { cwd: tmp, encoding: 'utf8' });
}

function initGitRepoWithBareRemote(tmp) {
  initGitRepo(tmp);
  const remotePath = tmp + '-remote';
  spawnSync('git', ['init', '--bare', remotePath]);
  spawnSync('git', ['-C', tmp, 'remote', 'add', 'origin', remotePath]);
  spawnSync('git', ['-C', tmp, 'push', '-u', 'origin', 'main']);
  return remotePath;
}

function ghMockEnv(binDir) {
  const jsPath = path.join(binDir, 'gh.js');
  return fs.existsSync(jsPath) ? { KAOLA_GH_MOCK_SCRIPT: jsPath } : {};
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
  // Test: KAOLA_WORKTREE_NATIVE=0 must suppress worktree provisioning
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-wt-native-off-'));
  const kwRoot = fs.realpathSync(tmp) + '.kw';
  try {
    initGitRepo(tmp);
    const binDir = path.join(tmp, 'bin');
    writeGhShimForStartup(binDir);
    const result = runClaimOnlineLastJson(['startup', '--target-issue', '505'], tmp, binDir, { KAOLA_WORKTREE_NATIVE: '0' });
    assert(result.claim === 'acquired', 'startup 505 should acquire');
    assert(result.worktree_path === '', 'worktree_path must be empty when KAOLA_WORKTREE_NATIVE=0, got: ' + JSON.stringify(result.worktree_path));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(kwRoot, { recursive: true, force: true });
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
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-merge-linked-')));
  const kwRoot = tmp + '.kw';
  try {
    initGitRepo(tmp);
    const wtPath = path.join(kwRoot, 'issue-941');
    fs.mkdirSync(kwRoot, { recursive: true });
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
    fs.writeFileSync(path.join(kwDir, 'phase6-summary.md'), '# Phase 6 Summary\n');
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

    // Step 3: plant phase6-summary.md (required by sink-pr appendSummary)
    fs.writeFileSync(path.join(kwDir860, 'phase6-summary.md'), '# Phase 6 Summary\n');
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
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testFinalizeFromLinkedWorktreeCleansRoadmapEntry() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-finalize-linked-roadmap-')));
  const kwRoot = tmp + '.kw';
  try {
    initGitRepo(tmp);
    // Plant active folder and roadmap issue in main worktree
    plantActiveFolder(tmp, 'issue-911', 911, null);
    plantRoadmapIssue(tmp, 911, '');
    // Commit so .roadmap/ is on HEAD (required for worktree checkout)
    spawnSync('git', ['-C', tmp, 'add', '-A'], { encoding: 'utf8' });
    spawnSync('git', ['-C', tmp, 'commit', '-m', 'plant'], { encoding: 'utf8' });
    // Create linked worktree on a feature branch
    const wtPath = path.join(kwRoot, 'issue-911');
    fs.mkdirSync(kwRoot, { recursive: true });
    spawnSync('git', ['worktree', 'add', '-b', 'workflow/issue-911', '--', wtPath, 'HEAD'], {
      cwd: tmp,
      encoding: 'utf8'
    });
    // Mirror active folder in linked worktree
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
  } finally {
    try { spawnSync('git', ['-C', tmp, 'worktree', 'remove', '--force', kwRoot + '/issue-911'], { encoding: 'utf8' }); } catch (_) {}
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

// issue-164 Task 5: tests for closure receipt shape and mockability

function testSinkMergeEmitsClosureReceipt() {
  // Exercise sink-merge (OFFLINE=1) and verify it emits a well-formed closure receipt JSON.
  // Uses the same linked-worktree setup as testSinkMergeFromLinkedWorktree so that
  // the branch can be deleted (Step 9) and the FF merge succeeds.
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sm-receipt-')));
  const kwRoot = tmp + '.kw';
  try {
    initGitRepo(tmp);
    const wtPath = path.join(kwRoot, 'issue-164r');
    fs.mkdirSync(kwRoot, { recursive: true });
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
    spawnSync('git', ['-C', tmp, 'add', '-A', 'kaola-workflow/'], { encoding: 'utf8' });
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
    const result = runClosureAudit([], tmp, binDir, { KAOLA_GH_REMOTE_TIMEOUT_MS: '300' });
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
    const result = runClosureAudit([], tmp, binDir, { KAOLA_GH_REMOTE_TIMEOUT_MS: '300' });
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
    const result = runClosureAudit(['--execute'], tmp, binDir, { KAOLA_GH_REMOTE_TIMEOUT_MS: '300' });
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
    const result = runClosureAudit(['--execute'], tmp, binDir, { KAOLA_GH_REMOTE_TIMEOUT_MS: '300' });
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
    const result = runClosureAudit([], tmp, binDir, { KAOLA_GH_REMOTE_TIMEOUT_MS: '300' });
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

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-active-folders-'));
  try {
    testClaimStatusRelease(tmp);
    testFinalize(tmp);
    testRepair(tmp);
    testRepairFastPath(tmp);
    testRepairFastEscalation(tmp);
    testRepairFastNoArgSingle();
    testRepairFastNoArgAmbiguous();
    testHookSingleProjectGuard(tmp);
    testPhantomAdvisorHookGuard();
    testRoadmapGenerateMissingSourceGuard(tmp);
    testRoadmapGenerateAtomicReplace(tmp);
    await testRoadmapInitIssueConcurrentExclusive(tmp);
    testRoadmapFilenameAuthorityMissingIssueField(tmp);
    testRoadmapFilenameAuthorityMismatch(tmp);
    testRoadmapMigrateRoundTripNoDoubleEscape(tmp);
    testClassifierFolderOverlapRed();
    testClassifierFolderOverlapYellow();
    testClassifierClosedIssueResidueIgnored();
    testClassifierReleasedFolderExcluded();
    testClassifierFastScopeOverlapRed();
    testClassifierFastScopeDisjointGreen();
    testClassifierDotPathOverlapRed();
    testClassifierRootPathProseNoOverlap();
    testClassifierDotAreaOverlapRed();
    testClassifierCuratedRootOverlapYellow();
    testClassifierCuratedRootProseNoOverlapGreen();
    testClassifierFastScopeSectionIsolationGreen();
    testClassifierFastScopeFenceCommentRed();
    testClassifierFastScopeFenceHeadingRed();
    testClassifierFastScopeFenceMixedMarkerRed();
    testClassifierFastScopeFenceInFencePathRed();
    testClassifierFastScopePreSectionUnclosedFenceRed();
    testClassifierDependsOnGate();
    testProbeIssueStateOffline();
    testProbeIssueStateNullIssue();
    testProbeIssueStateEmptyGhResponse();
    testProbeIssueStateGhThrows();
    testStartupJsonAndSiblingWorktrees();
    testWorktreeNativeDefaultOff();
    testWorktreeNativeOfflineWins();
    testFastStartupState();
    testResumeFastEmptyNextCommand();
    testClassifierCurrentClaimMarkerBlocks();
    testWatchPrArchivesClosedIssuePrFolder();
    testSinkFallbackSkipsArchivedProject();
    testFinalizeReleaseCleansWorktree();
    testFinalizeFromLinkedWorktreeCleansMainCopy();
    testFinalizeFromMainRootNoSpuriousRemoval();
    testFinalizeCleansRoadmapEntry();
    testFinalizeFromLinkedWorktreeCleansRoadmapEntry();
    testFinalizeRoadmapCleanupFailureReceipt();
    testWatchPrRoadmapCleanupWarning();
    testValidateRemoteOffline();
    testReleaseFromLinkedWorktreeCleansMainCopy();
    testSinkMergeFromLinkedWorktree();
    testStatusShowsClosedIssueDrift();
    testStaleWorktreeCheck();
    testStaleWorktreeCleanup();
    testNoTargetZeroActive();
    testNoTargetOneActive();
    testNoTargetMultipleActive();
    testSoleActiveRoundTrip();
    await testSinkPrLeavesCleanWorktree();
    testReadPriorityConfig();
    testE2EGitHubMergeFullChain();
    testSinkMergeRefusesLiveFolder();
    testSinkMergeBlocksUnpushedCommits();
    testSinkMergeOfflineSkipsPublishGuard();
    testFastE2EMergeFullChain();
    testE2EGitHubPrFullChain();
    testParallelIssueIndependence();
    testClassifierFailClosedOnRemoteError();
    testClassifierOfflineUnverifiedNoLocalEvidence();
    testClassifierOfflineVerifiedRoadmapAcquires();
    testClassifierOfflineVerifiedOwnedFolderRoutes();
    testClassifierOfflineUnverifiedWithUnrelatedActiveFolder();
    testStartupExplicitTargetRedRefuses();
    testClassifierTopLevelIssueFlag();
    testClaimProjectOwnedFolderFailingRemote();
    testFinalizeRemovesClaimLabel();
    testFinalizeNullFolderFallbackReadsArchive();
    testFinalizeOfflineSkipsLabelInvariant();
    testWatchPrEmitsClaimLabelReceipt();
    testAuditAndRepairLabels();
    testFinalizeClaimLabelFailedTriggersInvariant();
    testSinkMergeEmitsClosureReceipt();
    testWatchPrMergedClosureReceipt();
    testFinalizeOfflineClosureReceiptSkipped();
    testSinkMergeMockabilityAndReceipt();
    testSinkMergeCloseFailureWarning();
    testSinkMergeSkipsArchivedProjectPhantom();
    testClosureAuditOfflineRemoteClassesSkipped();
    testClosureAuditClosedRemoteRoadmapSource();
    testClosureAuditArchiveClosedDrift();
    testClosureAuditDedupRoadmapAndArchive();
    testClosureAuditArchiveOnlyNotProbed();
    testClosureAuditMirrorListsClosedIssues();
    testClosureAuditStaleInProgressLabels();
    testClosureAuditActiveFolderForClosedIssueReportsDirty();
    testClosureAuditUnarchivedPrFolderMerged();
    testClosureAuditExecuteRepairsRoadmapAndLabels();
    testClosureAuditExecuteNeverTouchesActiveFolders();
    testClosureAuditDryRunNeverCallsRemoveLabel();
    testClosureAuditStaleLabelsTimeout();
    testClosureAuditUnresolvedClosedState();
    testClosureAuditProbeFailureUnresolved();
    testClosureAuditTimeoutEnvInvalidFallsBack();
    testClosureAuditTimeoutEnvOverCapFallsBack();
    testClosureAuditExecuteDetectionTimeoutPropagates();
    testClosureAuditExecuteLabelRemovalTimeoutBreaks();
    testClosureAuditExecuteLabelRemovalNonTimeoutFails();
    testClosureAuditPrFolderTimeout();
    testContractValidatorOfflineSkip();
    testContractValidatorMissingTag();
    testWatchPrAbandonedClosureInvariantsClean();
    testClaimReclaimsStatelessOrphanDir();
    testPatchBranchGuards();
    // issue #227 — adaptive path
    testAdaptiveOffStartupRefusal();
    testAdaptiveOffClaimRefusal();
    testAdaptiveOffPreservesTwoWay();
    testAdaptiveOnStartupAcquires();
    testAdaptiveResumeFromFrozenPlan();
    testAdaptiveResumeTamperedTypedRefusal();
    testAdaptiveResumeUnparseableTypedRefusal();
    testAdaptiveResumeAfterFlipOff();
    testAdaptiveConsentHaltSurfaces();
    testAdaptiveValidatorGovernance();
    testAdaptiveFanoutGroupScoping();
    testAdaptiveReadySetDisjointness();
    testAdaptiveGateBarrierEnforcement();
    testAdaptiveResumeReconcilesNextCommand();
    testAdaptiveDurableConsentHalt();
    testAdaptiveAuthoringEntryGuard();
    testAdaptiveTier2Composition();
    testAdaptiveAuditFixes();
    testAdaptiveResumeHashDeletedTypedRefusal();
    testAdaptiveValidatorNodeCap();
    testAdaptiveCheapWinFixes();
    testAdaptiveAuditCoverage();
    console.log('Workflow walkthrough simulation passed');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch(err => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exitCode = 1;
});
