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
    writeShimFiles(path.join(binDir, 'gh'), [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue view 80')) { process.stdout.write('{\"state\":\"closed\"}\\n'); }",
      "else if (a.includes('issue view 81')) { process.stdout.write('{\"number\":81,\"title\":\"unrelated\",\"body\":\"commands/something.md\",\"labels\":[],\"state\":\"open\"}\\n'); }",
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
      "if (a.includes('issue view 200')) { process.stdout.write('{\"state\":\"closed\"}\\n'); }",
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
      "if (a.includes('issue view 100')) { process.stdout.write('{\"state\":\"open\"}\\n'); }",
      "else if (a.includes('issue view 200')) { process.stdout.write('{\"state\":\"closed\"}\\n'); }",
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
    testProbeIssueStateOffline();
    testProbeIssueStateNullIssue();
    testProbeIssueStateEmptyGhResponse();
    testProbeIssueStateGhThrows();
    testStartupJsonAndSiblingWorktrees();
    testWorktreeNativeDefaultOff();
    testWorktreeNativeOfflineWins();
    testFastStartupState();
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
    testClosureAuditOfflineRemoteClassesSkipped();
    testClosureAuditClosedRemoteRoadmapSource();
    testClosureAuditArchiveClosedDrift();
    testClosureAuditDedupRoadmapAndArchive();
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
    testClosureAuditPrFolderTimeout();
    testContractValidatorOfflineSkip();
    testContractValidatorMissingTag();
    console.log('Workflow walkthrough simulation passed');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch(err => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exitCode = 1;
});
