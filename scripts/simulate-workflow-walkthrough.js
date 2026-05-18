#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const claimScript = path.join(repoRoot, 'scripts', 'kaola-workflow-claim.js');
const repairScript = path.join(repoRoot, 'scripts', 'kaola-workflow-repair-state.js');
const roadmapScript = path.join(repoRoot, 'scripts', 'kaola-workflow-roadmap.js');
const hookScript = path.join(repoRoot, 'hooks', 'kaola-workflow-pre-commit.sh');

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

function testHookSingleProjectGuard(tmp) {
  spawnSync('git', ['init'], { cwd: tmp, encoding: 'utf8' });
  writeProject(tmp, 'a', { 'workflow-state.md': 'status: active\n' });
  writeProject(tmp, 'b', { 'workflow-state.md': 'status: active\n' });
  spawnSync('git', ['add', 'kaola-workflow/a/workflow-state.md', 'kaola-workflow/b/workflow-state.md'], { cwd: tmp, encoding: 'utf8' });
  const result = spawnSync('bash', [hookScript], { cwd: tmp, input: '', encoding: 'utf8' });
  assert(result.status === 2, 'pre-commit hook should block mixed project commits');
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
    const ghShim = path.join(binDir, 'gh');
    fs.writeFileSync(ghShim, [
      '#!/bin/sh',
      'ARGS="$@"',
      'case "$ARGS" in',
      '  *"issue view 80"*)',
      '    echo \'{"state":"closed"}\' ;;',
      '  *"issue view 81"*)',
      '    echo \'{"number":81,"title":"unrelated","body":"commands/something.md","labels":[],"state":"open"}\' ;;',
      '  *"repo view"*)',
      '    echo \'{"owner":{"login":"test"},"name":"repo"}\' ;;',
      '  *)',
      '    echo \'[]\' ;;',
      'esac',
      ''
    ].join('\n'));
    fs.chmodSync(ghShim, 0o755);
    const result = spawnSync(process.execPath, [classifierScript, 'classify', '--issue', '81'], {
      cwd: tmp, encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '0', PATH: binDir + path.delimiter + (process.env.PATH || '') }
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

function writeGhShimForStartup(binDir) {
  fs.mkdirSync(binDir, { recursive: true });
  const ghShim = path.join(binDir, 'gh');
  fs.writeFileSync(ghShim, [
    '#!/bin/sh',
    'ARGS="$@"',
    'case "$ARGS" in',
    '  *"repo view"*) echo \'{"owner":{"login":"test"},"name":"repo"}\' ;;',
    '  *"issue view"*) echo \'{"number":0,"title":"fixture","body":"README.md","labels":[],"state":"open"}\' ;;',
    '  *"api"*) echo \'[]\' ;;',
    '  *) echo "" ;;',
    'esac',
    ''
  ].join('\n'));
  fs.chmodSync(ghShim, 0o755);
}

function initGitRepo(tmp) {
  spawnSync('git', ['init', '-b', 'main'], { cwd: tmp, encoding: 'utf8' });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: tmp, encoding: 'utf8' });
  spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: tmp, encoding: 'utf8' });
  fs.writeFileSync(path.join(tmp, 'README.md'), 'fixture\n');
  spawnSync('git', ['add', 'README.md'], { cwd: tmp, encoding: 'utf8' });
  spawnSync('git', ['commit', '-m', 'init'], { cwd: tmp, encoding: 'utf8' });
}

function runClaimOnline(args, cwd, binDir, extraEnv) {
  const result = spawnSync(process.execPath, [claimScript, ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...(extraEnv || {}),
      KAOLA_WORKFLOW_OFFLINE: '0',
      PATH: binDir + path.delimiter + (process.env.PATH || '')
    }
  });
  assert(result.status === 0, 'online claim should exit 0, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
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

function testFastStartupState() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-fast-startup-'));
  try {
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

function testClassifierCurrentClaimMarkerBlocks() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-classifier-current-claim-'));
  try {
    const binDir = path.join(tmp, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    const ghShim = path.join(binDir, 'gh');
    fs.writeFileSync(ghShim, [
      '#!/bin/sh',
      'ARGS="$@"',
      'case "$ARGS" in',
      '  *"repo view"*) echo \'{"owner":{"login":"test"},"name":"repo"}\' ;;',
      '  *"issue view 504"*) echo \'{"number":504,"title":"claimed","body":"README.md","labels":[],"state":"open"}\' ;;',
      '  *"api repos/test/repo/issues/504/comments"*) echo \'[{"body":"<!-- kw:claim project=issue-504 -->","updated_at":"2099-01-01T00:00:00Z"}]\' ;;',
      '  *) echo \'[]\' ;;',
      'esac',
      ''
    ].join('\n'));
    fs.chmodSync(ghShim, 0o755);
    const result = spawnSync(process.execPath, [classifierScript, 'classify', '--issue', '504'], {
      cwd: tmp,
      encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '0', PATH: binDir + path.delimiter + (process.env.PATH || '') }
    });
    assert(result.status === 0, 'classifier should exit 0 for current claim marker');
    const parsed = JSON.parse(result.stdout.trim());
    assert(parsed.verdict === 'blocked', 'current kw:claim project marker should block remote claimed issue');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-active-folders-'));
  try {
    testClaimStatusRelease(tmp);
    testFinalize(tmp);
    testRepair(tmp);
    testHookSingleProjectGuard(tmp);
    testRoadmapGenerateMissingSourceGuard(tmp);
    testRoadmapGenerateAtomicReplace(tmp);
    await testRoadmapInitIssueConcurrentExclusive(tmp);
    testClassifierFolderOverlapRed();
    testClassifierFolderOverlapYellow();
    testClassifierClosedIssueResidueIgnored();
    testClassifierReleasedFolderExcluded();
    testStartupJsonAndSiblingWorktrees();
    testFastStartupState();
    testClassifierCurrentClaimMarkerBlocks();
    console.log('Workflow walkthrough simulation passed');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch(err => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exitCode = 1;
});
