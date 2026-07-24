#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

// OFFLINE is captured as a module-level constant in the classifier. Remove it from the
// environment before requiring any workflow module so that withForge stubs are reachable
// during the classify-blocked and classify-red tests. Subprocesses that need OFFLINE set
// do so explicitly via their own env option.
delete process.env.KAOLA_WORKFLOW_OFFLINE;
// #538: KAOLA_ENABLE_ADAPTIVE is retired — adaptive is the unconditional default (no switch).
// The module-top KAOLA_ENABLE_ADAPTIVE pin is removed.

// #531 / #538: hermetic HOME — classifyIssue (called IN-PROCESS) reads parallel_mode from
// ~/.config/kaola-workflow/config.json (os.homedir()), bypassing classifier when not 'auto'.
// #725: the classifier still tolerantly reads installed_paths from this file (defaulting to []);
// only the write side was retired. Pin a process-wide sandbox HOME seeded with parallel_mode:'auto'
// + installed_paths:[] (adaptive-only) so a dev-local config can't affect these tests. os.homedir()
// honors process.env.HOME.
// Also seed .gitconfig with init.defaultBranch=main so git init creates 'main'.
const kwSandboxHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sandbox-home-'));
fs.mkdirSync(path.join(kwSandboxHome, '.config', 'kaola-workflow'), { recursive: true });
fs.writeFileSync(
  path.join(kwSandboxHome, '.config', 'kaola-workflow', 'config.json'),
  JSON.stringify({ parallel_mode: 'auto', installed_paths: [] }, null, 2) + '\n'
);
fs.writeFileSync(
  path.join(kwSandboxHome, '.gitconfig'),
  '[init]\n\tdefaultBranch = main\n[user]\n\temail = test@example.com\n\tname = Test User\n'
);
process.env.HOME = kwSandboxHome;
process.env.USERPROFILE = kwSandboxHome;

const forge = require('./kaola-gitea-forge');
const active = require('./kaola-gitea-workflow-active-folders');
const classifier = require('./kaola-gitea-workflow-classifier');
const claim = require('./kaola-gitea-workflow-claim');
const roadmap = require('./kaola-gitea-workflow-roadmap');
const repair = require('./kaola-gitea-workflow-repair-state');
const planValidator = require('./kaola-gitea-workflow-plan-validator');

const claimScript = path.join(__dirname, 'kaola-gitea-workflow-claim.js');
const roadmapScript = path.join(__dirname, 'kaola-gitea-workflow-roadmap.js');
const classifierScript = path.join(__dirname, 'kaola-gitea-workflow-classifier.js');
const closureAuditScript = path.join(__dirname, 'kaola-gitea-workflow-closure-audit.js');
const planValidatorScript = path.join(__dirname, 'kaola-gitea-workflow-plan-validator.js');

function withForge(stubs, fn) {
  const originals = {};
  for (const key of Object.keys(stubs)) {
    originals[key] = forge[key];
    forge[key] = stubs[key];
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(stubs)) forge[key] = originals[key];
  }
}

function tempRoot(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), name));
}

function writeState(root, project, issueNum, extra) {
  const dir = path.join(root, 'kaola-workflow', project);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'workflow-state.md'), [
    '# Kaola-Workflow State',
    '',
    '## Project',
    'name: ' + project,
    'status: active',
    '',
    '## Current Position',
    'phase: 1',
    'phase_name: Research',
    'step: start',
    'next_command: /kaola-workflow-phase1 ' + project,
    'next_skill: kaola-workflow-research ' + project,
    '',
    '## Gitea',
    'issue_number: ' + issueNum,
    'full_name: group/repo',
    'project_html_url: https://gitea.example/group/repo',
    '',
    '## Sink',
    'branch: workflow/gitea-issue-' + issueNum,
    'issue_number: ' + issueNum,
    'sink: merge',
    extra || ''
  ].join('\n') + '\n');
  return dir;
}

// #725: the retired fast N/A gate let a plan-absent finalize succeed by marking the state
// `workflow_path: fast`. Post-retirement that shortcut is illegal (finalize refuses
// adaptive_plan_missing), so this fixture seeds the minimum an authored adaptive run leaves behind
// — a frozen adaptive plan (all nodes complete) + a gate-passing consumer final-validation.md — so
// finalize's adaptive `--finalize-check` proceeds to the archive/closure behavior the fixture asserts.
function seedAdaptiveFinalizeFixture(fixtureRoot, project, writeSet) {
  const dir = path.join(fixtureRoot, 'kaola-workflow', project);
  fs.mkdirSync(dir, { recursive: true });
  const planPath = path.join(dir, 'workflow-plan.md');
  const paths = Array.isArray(writeSet) ? writeSet.filter(Boolean) : [];
  const nodesTable = paths.length ? [
    '| n1 | code-explorer | — | — | 1 | sequence |',
    '| n2 | tdd-guide | n1 | ' + paths.join(' ') + ' | 1 | sequence |',
    '| n3 | code-reviewer | n2 | — | 1 | sequence |',
    '| n4 | finalize | n3 | — | 1 | sequence |',
  ] : [
    '| n1 | code-explorer | — | — | 1 | sequence |',
    '| n2 | finalize | n1 | — | 1 | sequence |',
  ];
  const ledgerRows = paths.length
    ? ['| n1 | complete |', '| n2 | complete |', '| n3 | complete |', '| n4 | complete |']
    : ['| n1 | complete |', '| n2 | complete |'];
  const complianceRows = paths.length ? [
    '| code-explorer (n1) | subagent-invoked | evidence-binding: n1 planless | |',
    '| tdd-guide (n2) | subagent-invoked | evidence-binding: n2 planless | |',
    '| code-reviewer (n3) | subagent-invoked | evidence-binding: n3 planless | |',
    '| finalize (n4) | main-session-direct | evidence-binding: n4 planless | |',
  ] : [
    '| code-explorer (n1) | subagent-invoked | evidence-binding: n1 planless | |',
    '| finalize (n2) | main-session-direct | evidence-binding: n2 planless | |',
  ];
  const tasks = paths.length ? [
    { id: 'n1', role: 'code-explorer', ledger_status: 'complete', status: 'completed' },
    { id: 'n2', role: 'tdd-guide', ledger_status: 'complete', status: 'completed' },
    { id: 'n3', role: 'code-reviewer', ledger_status: 'complete', status: 'completed' },
    { id: 'n4', role: 'finalize', ledger_status: 'complete', status: 'completed' },
  ] : [
    { id: 'n1', role: 'code-explorer', ledger_status: 'complete', status: 'completed' },
    { id: 'n2', role: 'finalize', ledger_status: 'complete', status: 'completed' },
  ];
  const planBody = [
    '# Workflow Plan', '', '## Meta', 'labels: enhancement', '',
    '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '|---|---|---|---|---|---|',
    ...nodesTable, '',
    '## Node Ledger', '', '| id | status |', '|---|---|',
    ...ledgerRows, '',
    '## Required Agent Compliance', '',
    '| Requirement | Status | Evidence | Skip Reason |', '|---|---|---|---|',
    ...complianceRows, ''
  ].join('\n');
  const planHash = planValidator.computePlanHash(planBody);
  fs.writeFileSync(planPath, '<!-- plan_hash: ' + planHash + ' -->\n\n' + planBody);
  const teaVal = (a) => spawnSync(process.execPath, [planValidatorScript, ...a], { cwd: fixtureRoot, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
  let finalHash = '';
  try { finalHash = JSON.parse(teaVal([planPath, '--freeze', '--json']).stdout).planHash || ''; } catch (_) {}
  const sFile = path.join(dir, 'workflow-state.md');
  if (finalHash && fs.existsSync(sFile) && /^active_plan_hash:\s*none\s*$/m.test(fs.readFileSync(sFile, 'utf8'))) {
    const s = fs.readFileSync(sFile, 'utf8')
      .replace(/^plan_hash:\s*none\s*$/m, 'plan_hash: ' + finalHash)
      .replace(/^active_plan_hash:\s*none\s*$/m, 'active_plan_hash: ' + finalHash)
      .replace(/^first_node_id:\s*none\s*$/m, 'first_node_id: n1')
      .replace(/^first_node_role:\s*none\s*$/m, 'first_node_role: code-explorer');
    fs.writeFileSync(sFile, s);
    fs.writeFileSync(path.join(dir, 'workflow-tasks.json'), JSON.stringify({ source_plan_hash: finalHash, tasks }) + '\n');
  }
  fs.mkdirSync(path.join(dir, '.cache'), { recursive: true });
  let cand = '';
  try { cand = JSON.parse(teaVal([planPath, '--candidate-hash', '--json']).stdout).validated_candidate_hash || ''; } catch (_) {}
  fs.writeFileSync(path.join(dir, '.cache', 'final-validation.md'),
    'verdict: pass\nfindings_blocking: 0\nvalidated_candidate_hash: ' + cand + '\n');
}

function trustCodexProject(homeRoot, projectRoot) {
  const configPath = path.join(homeRoot, '.codex', 'config.toml');
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const existing = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  const prefix = existing.length === 0 ? '' : existing.replace(/\s*$/, '\n\n');
  fs.writeFileSync(configPath,
    prefix + '[projects.' + JSON.stringify(path.resolve(projectRoot)) + ']\ntrust_level = "trusted"\n');
}

function runNode(args, cwd) {
  const result = spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });
  if (result.error) throw result.error;
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function runNodeRaw(args, cwd) {
  const result = spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });
  if (result.error) throw result.error;
  return result;
}

function runNodeAsync(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', status => resolve({ status, stdout, stderr }));
  });
}

function runClaimOnline(args, cwd, binDir) {
  const result = spawnSync(process.execPath, [claimScript, ...args], {
    cwd, encoding: 'utf8', timeout: 60000,
    env: {
      ...process.env,
      KAOLA_WORKTREE_NATIVE: '1',
      KAOLA_WORKFLOW_OFFLINE: '0',
      ...teaMockEnv(binDir),
      PATH: binDir + path.delimiter + path.dirname(process.execPath) + path.delimiter + (process.env.PATH || '')
    }
  });
  assert(!result.signal, 'online claim killed: ' + result.signal + '\n' + result.stderr);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim());
}

// On macOS 15 (Darwin 25.4.0), execFileSync(scriptPath, args) hangs when
// scriptPath has ANY shebang. Solution: write only the .js logic file; callers
// set KAOLA_TEA_MOCK_SCRIPT so teaExec routes through process.execPath.
function writeShimFiles(shimPath, jsLines) {
  fs.writeFileSync(shimPath + '.js', jsLines.join('\n'));
}

function teaMockEnv(binDir) {
  const jsPath = path.join(binDir, 'tea.js');
  return fs.existsSync(jsPath) ? { KAOLA_TEA_MOCK_SCRIPT: jsPath } : {};
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

// Run closure-audit online (mock tea via KAOLA_TEA_MOCK_SCRIPT). Mirrors runClaimOnline.
function runClosureAudit(args, cwd, binDir, extraEnv) {
  const result = spawnSync(process.execPath, [closureAuditScript, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 60000,
    env: {
      ...process.env,
      ...(extraEnv || {}),
      KAOLA_WORKFLOW_OFFLINE: '0',
      ...teaMockEnv(binDir),
      PATH: binDir + path.delimiter + path.dirname(process.execPath) + path.delimiter + (process.env.PATH || '')
    }
  });
  assert(!result.signal, 'closure-audit timed out or was killed: ' + result.signal + '\nstderr: ' + result.stderr);
  assert.strictEqual(result.status, 0, 'closure-audit should exit 0, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
  return JSON.parse(result.stdout);
}

// Run closure-audit offline (no tea shim; remote classes must report skipped_offline).
function runClosureAuditOffline(args, cwd) {
  const result = spawnSync(process.execPath, [closureAuditScript, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 60000,
    env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
  });
  assert.strictEqual(result.status, 0, 'offline closure-audit should exit 0, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
  return JSON.parse(result.stdout);
}

// Write a `tea` shim (Gitea CLI) whose body is matched on the joined process.argv.
function closureAuditShim(binDir, lines) {
  fs.mkdirSync(binDir, { recursive: true });
  writeShimFiles(path.join(binDir, 'tea'), lines);
}

// Plant kaola-workflow/.roadmap/issue-N.md with `issue: #N` (the field readRoadmapIssues requires).
function plantClosureRoadmapSource(root, issueNumber) {
  const dir = path.join(root, 'kaola-workflow', '.roadmap');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'issue-' + issueNumber + '.md'),
    'issue: #' + issueNumber + '\ntitle: stale source\nstatus: open\n'
  );
}

// Convert an existing active folder's state file into a sink=pr folder with pr_url/pr_number.
// Mirrors the inline mutation; does NOT add a sink param to writeState.
function makePrSinkFolder(root, project, issueNumber) {
  const stateFile = path.join(root, 'kaola-workflow', project, 'workflow-state.md');
  let content = fs.readFileSync(stateFile, 'utf8');
  content = content.replace(/^sink:\s*.*$/m, 'sink: pr');
  content += 'pr_url: https://gitea.example/group/project/pulls/' + issueNumber + '\n';
  content += 'pr_number: ' + issueNumber + '\n';
  fs.writeFileSync(stateFile, content);
}

function writeTeaShimForStale(binDir) {
  fs.mkdirSync(binDir, { recursive: true });
  writeShimFiles(path.join(binDir, 'tea'), [
    "const a = process.argv.slice(2).join(' ');",
    "if (a.includes('--version')) { process.stdout.write('tea version 0.9.2\\n'); process.exit(0); }",
    "if (a.includes('issues view 100')) process.stdout.write('{\"state\":\"open\"}\\n');",
    "else if (a.includes('issues view 200')) process.stdout.write('{\"state\":\"closed\"}\\n');",
    "else if (a.includes('issues view 300')) process.stdout.write('{\"state\":\"open\"}\\n');",
    "else if (a.includes('issues view 400')) process.stdout.write('{\"state\":\"closed\"}\\n');",
    "else if (a.includes('repo view')) process.stdout.write('{\"id\":77}\\n');",
    "else process.stdout.write('[]\\n');"
  ]);
}

function writeTeaShimOpen(binDir) {
  fs.mkdirSync(binDir, { recursive: true });
  writeShimFiles(path.join(binDir, 'tea'), [
    "const a = process.argv.slice(2).join(' ');",
    "if (a.includes('--version')) { process.stdout.write('tea version 0.9.2\\n'); process.exit(0); }",
    "if (a.includes('issues view')) process.stdout.write('{\"state\":\"open\",\"labels\":[]}\\n');",
    "else if (a.includes('repo view')) process.stdout.write('{\"id\":1}\\n');",
    "else process.stdout.write('[]\\n');"
  ]);
}

function initGitRepo(root) {
  let result = spawnSync('git', ['init'], { cwd: root, encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root, encoding: 'utf8' });
  spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: root, encoding: 'utf8' });
  fs.writeFileSync(path.join(root, 'README.md'), '# fixture\n');
  result = spawnSync('git', ['add', 'README.md'], { cwd: root, encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
  result = spawnSync('git', ['commit', '-m', 'init'], { cwd: root, encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function testGiteaRoadmapGenerateMissingSourceGuard() {
  const root = tempRoot('kw-gt-roadmap-guard-');
  try {
    const workflowDir = path.join(root, 'kaola-workflow');
    fs.mkdirSync(workflowDir, { recursive: true });
    const roadmapPath = path.join(workflowDir, 'ROADMAP.md');
    fs.writeFileSync(roadmapPath, [
      '<!-- generated by plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-roadmap.js - do not edit -->',
      '# Kaola-Workflow Gitea Roadmap',
      '',
      'This file mirrors active unfinished Gitea work.',
      '',
      '## Active Work',
      '',
      '| Issue | Title | Status | Workflow Project | Next Step |',
      '|-------|-------|--------|------------------|-----------|',
      '| #9990 | Gitea guard fixture | open | gitea-guard-fixture | implement |',
      '',
      '## Rules',
      '',
      '- existing generated roadmap',
      ''
    ].join('\n'), 'utf8');

    const refused = runNodeRaw([roadmapScript, 'generate'], root);
    assert.strictEqual(refused.status, 1, 'Gitea generate should refuse to erase active generated roadmap when .roadmap is missing');
    assert(refused.stderr.includes('kaola-workflow/.roadmap is missing'), 'Gitea generate refusal should explain missing source directory');
    assert(read(roadmapPath).includes('| #9990 |'), 'Gitea generate refusal should preserve existing active roadmap rows');

    const sourceDir = path.join(workflowDir, '.roadmap');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'issue-9990.md'), [
      'issue: #9990',
      'title: Gitea guard fixture',
      'status: open',
      'workflow_project: gitea-guard-fixture',
      'next_step: implement',
      ''
    ].join('\n'), 'utf8');
    const generated = runNodeRaw([roadmapScript, 'generate'], root);
    assert.strictEqual(generated.status, 0, 'Gitea generate should succeed once per-issue source files exist');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testGiteaRoadmapGenerateAtomicReplace() {
  const root = tempRoot('kw-gt-roadmap-atomic-');
  try {
    const workflowDir = path.join(root, 'kaola-workflow');
    const sourceDir = path.join(workflowDir, '.roadmap');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'issue-9980.md'), [
      'issue: #9980',
      'title: Gitea atomic roadmap fixture',
      'status: open',
      'workflow_project: gitea-atomic-roadmap-fixture',
      'next_step: generate',
      ''
    ].join('\n'), 'utf8');

    const generated = runNodeRaw([roadmapScript, 'generate'], root);
    assert.strictEqual(generated.status, 0, 'Gitea generate should succeed');
    const rendered = read(path.join(workflowDir, 'ROADMAP.md'));
    assert(rendered.includes('| #9980 | Gitea atomic roadmap fixture | open | gitea-atomic-roadmap-fixture | generate |'), 'Gitea generated roadmap should contain the source row');
    const tempFiles = fs.readdirSync(workflowDir).filter(name => /^\.ROADMAP\.md\..+\.tmp$/.test(name));
    assert.strictEqual(tempFiles.length, 0, 'Gitea atomic generate should not leave temp files after success');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testGiteaRoadmapFilenameAuthorityMissingIssueField() {
  const root = tempRoot('kw-gt-roadmap-fname-missing-');
  try {
    const workflowDir = path.join(root, 'kaola-workflow');
    const sourceDir = path.join(workflowDir, '.roadmap');
    fs.mkdirSync(sourceDir, { recursive: true });
    // NO 'issue:' line — issue number must come from filename
    fs.writeFileSync(path.join(sourceDir, 'issue-42.md'), [
      'title: Gitea filename authority test',
      'status: open',
      'workflow_project: gt-filename-authority-project',
      'next_step: verify',
      ''
    ].join('\n'), 'utf8');

    const result = runNodeRaw([roadmapScript, 'generate'], root);
    assert.strictEqual(result.status, 0, 'Gitea generate should succeed even with no issue: field');
    const rendered = read(path.join(workflowDir, 'ROADMAP.md'));
    assert(rendered.includes('| #42 |'), 'Gitea roadmap should contain | #42 | derived from filename; got:\n' + rendered);
    assert(!rendered.includes('No active work'), 'Gitea roadmap should NOT fall back to "No active work"; got:\n' + rendered);
    assert(rendered.includes('gt-filename-authority-project'), 'Gitea roadmap should include project name; got:\n' + rendered);
    console.log('testGiteaRoadmapFilenameAuthorityMissingIssueField: PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testGiteaRoadmapFilenameAuthorityMismatch() {
  const root = tempRoot('kw-gt-roadmap-fname-mismatch-');
  try {
    const workflowDir = path.join(root, 'kaola-workflow');
    const sourceDir = path.join(workflowDir, '.roadmap');
    fs.mkdirSync(sourceDir, { recursive: true });
    // issue: field says #999, but filename says issue-43.md — filename must win
    fs.writeFileSync(path.join(sourceDir, 'issue-43.md'), [
      'issue: #999',
      'title: Gitea filename authority mismatch test',
      'status: open',
      'workflow_project: gt-mismatch-project',
      'next_step: verify',
      ''
    ].join('\n'), 'utf8');

    const result = runNodeRaw([roadmapScript, 'generate'], root);
    assert.strictEqual(result.status, 0, 'Gitea generate should succeed; got: ' + result.stderr);
    const rendered = read(path.join(workflowDir, 'ROADMAP.md'));
    assert(rendered.includes('| #43 |'), 'Gitea roadmap should contain | #43 | (filename wins); got:\n' + rendered);
    assert(!rendered.includes('| #999 |'), 'Gitea roadmap must NOT contain | #999 | (content field loses); got:\n' + rendered);
    console.log('testGiteaRoadmapFilenameAuthorityMismatch: PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writeRoadmapIssue(root, issueNum, status) {
  const sourceDir = path.join(root, 'kaola-workflow', '.roadmap');
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, 'issue-' + issueNum + '.md'), [
    'issue: #' + issueNum,
    'title: Gitea remote validation fixture ' + issueNum,
    'status: ' + status,
    'workflow_project: gitea-remote-validation-' + issueNum,
    'next_step: validate',
    ''
  ].join('\n'), 'utf8');
}

function testGiteaRoadmapValidateRemote() {
  const root = tempRoot('kw-gt-roadmap-validate-remote-');
  try {
    writeRoadmapIssue(root, 9960, 'open');
    writeRoadmapIssue(root, 9950, 'open');
    writeRoadmapIssue(root, 9940, 'closed');
    withForge({
      viewIssue(issueNum) {
        if (issueNum === 9960) return { state: 'closed' };
        if (issueNum === 9950) return { state: 'open' };
        if (issueNum === 9940) return { state: 'closed' };
        throw new Error('unexpected issue ' + issueNum);
      }
    }, () => {
      assert.deepStrictEqual(roadmap.validateRemote(root), [9960],
        'Gitea validateRemote should report only open local entries closed on remote');
    });

    const result = spawnSync(process.execPath, [roadmapScript, 'validate-remote'], {
      cwd: root,
      encoding: 'utf8',
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' })
    });
    assert.strictEqual(result.status, 0, 'Gitea validate-remote offline should exit 0: ' + result.stderr);
    assert.strictEqual(result.stdout.trim(), 'skipped: offline',
      'Gitea validate-remote offline should print skipped: offline');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Issue #223 — three lifecycle fixes, gitea edition
// ---------------------------------------------------------------------------

// Test 1: watch-pr CLOSED path must NOT fire roadmap invariants when archive=abandoned
function testWatchPrAbandonedClosureInvariantsClean() {
  const root = tempRoot('kw-gt-watchpr-abandoned-inv-');
  try {
    initGitRepo(root);
    writeState(root, 'issue-920', 920, 'pr_url: https://gitea.example/group/repo/pulls/920');
    makePrSinkFolder(root, 'issue-920', 920);
    plantClosureRoadmapSource(root, 920);
    // Generate ROADMAP.md so it contains #920
    roadmap.regenerateRoadmap(root);
    assert(fs.readFileSync(path.join(root, 'kaola-workflow', 'ROADMAP.md'), 'utf8').includes('#920'),
      'ROADMAP.md must contain #920 before watch-pr');
    const result = withForge({
      viewPullRequest(prNumber) {
        assert.strictEqual(prNumber, 920);
        return { pr_number: 920, state: 'closed' };
      },
      updateIssueLabels() { return {}; },
      createIssueComment() { return { id: 9003 }; }
    }, () => claim.watchMergeRequests(root, {}));
    assert.strictEqual(result.watched, 1, 'watched must be 1');
    assert(Array.isArray(result.cleanups) && result.cleanups.length > 0,
      'cleanups must have an entry for CLOSED PR, got: ' + JSON.stringify(result));
    const cleanup = result.cleanups[0];
    assert(cleanup.receipt && cleanup.receipt.archive === 'abandoned',
      'receipt.archive must be abandoned, got: ' + JSON.stringify(cleanup.receipt));
    assert(cleanup.closure_invariants && cleanup.closure_invariants.ok === true,
      'closure_invariants.ok must be true for abandoned PR, got: ' + JSON.stringify(cleanup.closure_invariants));
    console.log('testWatchPrAbandonedClosureInvariantsClean: PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Test 2: claimProject must reclaim a stateless orphan dir (no workflow-state.md)
function testGiteaClaimReclaimsStatelessOrphanDir() {
  const root = tempRoot('kw-gt-claim-orphan-');
  try {
    initGitRepo(root);
    // Positive: orphan dir with no state file
    const orphanDir = path.join(root, 'kaola-workflow', 'issue-888');
    fs.mkdirSync(orphanDir, { recursive: true });
    assert(!fs.existsSync(path.join(orphanDir, 'workflow-state.md')), 'fixture: no state file should exist');
    const result = withForge({
      discoverProject() { return { full_name: null, html_url: null }; }
    }, () => claim.claimProject(root, { project: 'issue-888' }));
    assert.strictEqual(result.status, 'acquired',
      '#14 POSITIVE: orphan dir must be reclaimed, got: ' + JSON.stringify(result));
    assert(fs.existsSync(path.join(root, 'kaola-workflow', 'issue-888', 'workflow-state.md')),
      '#14 POSITIVE: workflow-state.md must be written after reclaim');
    // Negative boundary: dir with non-active (status: closed) state file must return
    // target_occupied. readActiveFolders skips inactive status, so claimProject reaches
    // the EEXIST guard added by fix #14 and checks existsSync(stateFile).
    const occupied = path.join(root, 'kaola-workflow', 'issue-889');
    fs.mkdirSync(occupied, { recursive: true });
    fs.writeFileSync(path.join(occupied, 'workflow-state.md'),
      ['# Kaola-Workflow State', '', '## Project', 'name: issue-889', 'status: closed', ''].join('\n'));
    const result2 = withForge({
      discoverProject() { return { full_name: null, html_url: null }; }
    }, () => claim.claimProject(root, { project: 'issue-889' }));
    assert.strictEqual(result2.status, 'target_occupied',
      '#14 NEGATIVE: dir with non-active state file must return target_occupied, got: ' + JSON.stringify(result2));
    console.log('testGiteaClaimReclaimsStatelessOrphanDir: PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Test 3: cmdPatchBranch must guard against non-existent projects and unsafe names
function testGiteaPatchBranchGuards() {
  // (a) ghost project: non-existent project → exit non-zero, dir not created
  {
    const root = tempRoot('kw-gt-patchbranch-ghost-');
    try {
      const r = spawnSync(process.execPath, [claimScript, 'patch-branch', '--project', 'ghost-proj', '--branch', 'workflow/ghost'], {
        cwd: root, encoding: 'utf8',
        env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
      });
      assert(r.status !== 0, '#15(a): patch-branch ghost-proj must exit non-zero, got exit ' + r.status);
      assert(!fs.existsSync(path.join(root, 'kaola-workflow', 'ghost-proj')), '#15(a): ghost-proj dir must not be created');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
  // (b) unsafe name → exit 1 with 'unsafe project name'
  {
    const root = tempRoot('kw-gt-patchbranch-escape-');
    try {
      const r = spawnSync(process.execPath, [claimScript, 'patch-branch', '--project', '../escape-poc', '--branch', 'workflow/escape'], {
        cwd: root, encoding: 'utf8',
        env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
      });
      assert(r.status === 1, '#15(b): patch-branch ../escape-poc must exit 1, got exit ' + r.status);
      assert(r.stderr.includes('unsafe project name'),
        '#15(b): stderr must contain "unsafe project name", got: ' + r.stderr);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
  // (c) positive: active project → patch-branch succeeds
  {
    const root = tempRoot('kw-gt-patchbranch-active-');
    try {
      writeState(root, 'issue-63', 63, '');
      const r = spawnSync(process.execPath, [claimScript, 'patch-branch', '--project', 'issue-63', '--branch', 'workflow/gitea-issue-63'], {
        cwd: root, encoding: 'utf8',
        env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
      });
      assert.strictEqual(r.status, 0, '#15(c): patch-branch on active project must exit 0, stderr: ' + r.stderr);
      const out = JSON.parse(r.stdout.trim());
      assert.strictEqual(out.patched, true, '#15(c): must return patched:true');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
  console.log('testGiteaPatchBranchGuards: PASSED');
}

async function testGiteaRoadmapInitIssueExclusiveAndUpdate() {
  const root = tempRoot('kw-gt-roadmap-init-');
  try {
    fs.mkdirSync(path.join(root, 'kaola-workflow', '.roadmap'), { recursive: true });
    const args = [
      roadmapScript,
      'init-issue',
      '--issue', '9970',
      '--title', 'Gitea exclusive init fixture',
      '--status', 'open',
      '--workflow-project', 'gitea-exclusive-init-fixture',
      '--next-step', 'plan'
    ];
    const [first, second] = await Promise.all([
      runNodeAsync(args, root),
      runNodeAsync(args, root)
    ]);
    assert.strictEqual(first.status, 0, first.stderr || first.stdout);
    assert.strictEqual(second.status, 0, second.stderr || second.stdout);

    const outputs = [first.stdout, second.stdout].join('\n');
    const created = (outputs.match(/created: issue-9970\.md/g) || []).length;
    const skipped = (outputs.match(/skip: issue-9970\.md already exists/g) || []).length;
    assert.strictEqual(created, 1, 'Gitea concurrent init-issue should create exactly one source file');
    assert.strictEqual(skipped, 1, 'Gitea concurrent init-issue loser should skip cleanly');

    const sourceFile = path.join(root, 'kaola-workflow', '.roadmap', 'issue-9970.md');
    assert(read(sourceFile).includes('workflow_project: gitea-exclusive-init-fixture'), 'Gitea exclusive source file should contain the requested content');

    const skippedUpdate = runNodeRaw([
      roadmapScript,
      'init-issue',
      '--issue', '9970',
      '--title', 'Gitea changed init fixture',
      '--status', 'open',
      '--workflow-project', 'gitea-changed-init-fixture',
      '--next-step', 'plan'
    ], root);
    assert.strictEqual(skippedUpdate.status, 0, skippedUpdate.stderr || skippedUpdate.stdout);
    assert(skippedUpdate.stdout.includes('skip: issue-9970.md already exists'), 'Gitea duplicate init-issue should report skipped without --update');
    assert(read(sourceFile).includes('workflow_project: gitea-exclusive-init-fixture'), 'Gitea duplicate init-issue should not rewrite without --update');

    const updated = runNodeRaw([
      roadmapScript,
      'init-issue',
      '--issue', '9970',
      '--title', 'Gitea changed init fixture',
      '--status', 'open',
      '--workflow-project', 'gitea-changed-init-fixture',
      '--next-step', 'plan',
      '--update'
    ], root);
    assert.strictEqual(updated.status, 0, updated.stderr || updated.stdout);
    assert(updated.stdout.includes('updated: issue-9970.md'), 'Gitea explicit init-issue update should report updated');
    assert(read(sourceFile).includes('workflow_project: gitea-changed-init-fixture'), 'Gitea explicit init-issue update should rewrite the issue source');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

testGiteaRoadmapGenerateMissingSourceGuard();
testGiteaRoadmapGenerateAtomicReplace();
testGiteaRoadmapFilenameAuthorityMissingIssueField();
testGiteaRoadmapFilenameAuthorityMismatch();

withForge({
  viewIssue(issueIid) {
    return { issue_iid: issueIid, number: issueIid, state: issueIid === 11 ? 'closed' : 'open', labels: [] };
  }
}, () => {
  const root = tempRoot('kw-gt-active-');
  writeState(root, 'open-project', 10);
  writeState(root, 'closed-project', 11);
  const folders = active.readActiveFolders(root);
  assert.deepStrictEqual(folders.map(folder => folder.project), ['open-project']);
  assert.strictEqual(folders[0].issue_iid, 10);
});

{
  const real = '- Write Set: plugins/kaola-workflow-gitea/scripts/real.js';
  const cases = [['```md', '```', false], ['~~~~markdown', '~~~~', false], ['`````md', '`````', true]];
  for (const [open, close, hasShorterDelimiter] of cases) {
    const inner = hasShorterDelimiter ? (open[0] === '`' ? '```' : '~~~') : 'fenced content';
    const body = classifier.sectionBody(['# Summary', open, '## Scope', '- Write Set: fake.js', inner, close, '## Scope', '~~~text', '## Review', '~~~', real, '## Review'].join('\n'), 'Scope');
    assert(body.includes(real), 'Gitea fence-aware section identity must select the real Scope for ' + open);
    assert(!body.includes('fake.js'), 'Gitea fence-aware section identity must skip fenced decoy for ' + open);
  }
  assert.strictEqual(classifier.sectionBody('# Summary\n## Scope\na\n## Scope\nb', 'Scope'), '');
  assert.strictEqual(classifier.sectionBody('# Summary\n```md\n## Scope\na', 'Scope'), '');
}

// probeIssueState: null issueNumber -> { state: 'open', reason: 'offline-or-null' }
{
  const result = active.probeIssueState(null);
  assert.strictEqual(result.state, 'open', 'probeIssueState(null) should return state open');
  assert.strictEqual(result.reason, 'offline-or-null', 'probeIssueState(null) should return reason offline-or-null');
}

// Case 2a (#519 RECONCILE): a GENUINE-negative status-bearing throw (a real 404 stderr) → still
// { state: 'unavailable' } with NO transient discriminant + reason 'tea issue fetch failed'. The
// .state-only contract is preserved (closure-audit / probe-memo unaffected); the claim gates refuse.
withForge({
  viewIssue() {
    const e = new Error('tea exited 1');
    e.status = 1;
    e.stderr = 'Could not resolve to an Issue with the number of 42.\n';
    throw e;
  }
}, () => {
  active.__resetIssueStateMemo();
  const result = active.probeIssueState(42);
  assert.strictEqual(result.state, 'unavailable', '#519: genuine-negative throw → state: unavailable');
  assert.strictEqual(result.transient, undefined, '#519: genuine-negative throw must NOT set transient (got ' + JSON.stringify(result) + ')');
  assert.strictEqual(result.reason, 'tea issue fetch failed', '#519: genuine-negative reason');
});

// Case 2b (#519): a TRANSIENT-infra throw (no exit status / TLS / rate-limit) → { state:'unavailable',
// transient:true } so ONLY the claim gates escalate. A bare no-status Error is spawn/killed-class
// (transient by construction) under the corrected exit-code+stderr axis.
withForge({
  viewIssue() { throw new Error('network error'); } // no status → killed-class → transient
}, () => {
  active.__resetIssueStateMemo();
  const result = active.probeIssueState(420);
  assert.strictEqual(result.state, 'unavailable', '#519: transient throw → state: unavailable');
  assert.strictEqual(result.transient, true, '#519: no-status throw → transient:true (got ' + JSON.stringify(result) + ')');
});

// probeIssueState: forge.viewIssue returns { state: 'closed' } -> { state: 'closed', reason: 'ok' }
withForge({
  viewIssue() { return { state: 'closed' }; }
}, () => {
  const result = active.probeIssueState(77);
  assert.strictEqual(result.state, 'closed', 'probeIssueState on closed issue should return state closed');
  assert.strictEqual(result.reason, 'ok', 'probeIssueState on closed issue should return reason ok');
});

// probeIssueState: forge.viewIssue returns residual state 'unknown' -> { state: 'unavailable', reason: 'tea issue state unverified' }
withForge({ viewIssue() { return { state: 'unknown' }; } }, () => {
  const result = active.probeIssueState(44);
  assert.strictEqual(result.state, 'unavailable', 'residual state must map to unavailable');
  assert.strictEqual(result.reason, 'tea issue state unverified', 'residual reason');
});

// classify blocked: stub viewIssue to return a claimed issue (has CLAIM_LABEL) with a touches path
withForge({
  viewIssue(issueIid) {
    return {
      issue_iid: issueIid,
      number: issueIid,
      state: 'open',
      labels: [forge.CLAIM_LABEL],
      body: 'touches: plugins/kaola-workflow-gitea/scripts/new-file.js'
    };
  }
}, () => {
  const root = tempRoot('kw-gt-classify-');
  const result = classifier.classifyIssue(20, root);
  assert.strictEqual(result.verdict, 'blocked');
});

// classify red (overlap): stub viewIssue to return a touches path that overlaps an active claimed folder
withForge({
  viewIssue(issueIid) {
    return {
      issue_iid: issueIid,
      number: issueIid,
      state: 'open',
      labels: [],
      body: 'touches: plugins/kaola-workflow-gitea/scripts/claimed.js'
    };
  }
}, () => {
  const root = tempRoot('kw-gt-overlap-');
  const dir = writeState(root, 'claimed-project', 21);
  fs.writeFileSync(path.join(dir, 'phase3-plan.md'), 'Write Set: plugins/kaola-workflow-gitea/scripts/claimed.js\n');
  const result = classifier.classifyIssue(22, root);
  assert.strictEqual(result.verdict, 'red');
});

// issue #207: a fast project's declared write set (fast-summary.md ## Scope) must
// participate in overlap detection at parity with phase files.
withForge({
  viewIssue(issueIid) {
    return {
      issue_iid: issueIid,
      number: issueIid,
      state: 'open',
      labels: [],
      body: 'touches: plugins/kaola-workflow-gitea/scripts/claimed.js'
    };
  }
}, () => {
  const root = tempRoot('kw-gt-fast-overlap-');
  const dir = writeState(root, 'fast-claimed-project', 24);
  fs.writeFileSync(path.join(dir, 'fast-summary.md'),
    '# Fast Summary: fast-claimed-project\n\n## Status\nIN_PROGRESS\n\n## Scope\n- Write Set: plugins/kaola-workflow-gitea/scripts/claimed.js\n- Acceptance: node x\n');
  const result = classifier.classifyIssue(25, root);
  assert.strictEqual(result.verdict, 'red');
});

// issue #207: a path only in the Implementation Evidence section (not ## Scope)
// must NOT manufacture an overlap (guards the Scope-only read against over-RED).
withForge({
  viewIssue(issueIid) {
    return {
      issue_iid: issueIid,
      number: issueIid,
      state: 'open',
      labels: [],
      body: 'touches: plugins/kaola-workflow-gitea/scripts/claimed.js'
    };
  }
}, () => {
  const root = tempRoot('kw-gt-fast-iso-');
  const dir = writeState(root, 'fast-iso-project', 26);
  fs.writeFileSync(path.join(dir, 'fast-summary.md'),
    '# Fast Summary: fast-iso-project\n\n## Status\nPASSED\n\n## Scope\n- Write Set: docs/api.md\n- Acceptance: node x\n\n## Implementation Evidence\nran plugins/kaola-workflow-gitea/scripts/claimed.js\n');
  const result = classifier.classifyIssue(27, root);
  assert.strictEqual(result.verdict, 'green');
});

// issue #213: a `#`-prefixed line inside a fenced code block within ## Scope must
// NOT truncate the slice (boundary is h2-only). A `- Write Set:` path BELOW the
// fenced `# comment` must still be counted; a candidate overlapping it must RED.
withForge({
  viewIssue(issueIid) {
    return {
      issue_iid: issueIid,
      number: issueIid,
      state: 'open',
      labels: [],
      body: 'touches: plugins/kaola-workflow-gitea/scripts/claimed.js'
    };
  }
}, () => {
  const root = tempRoot('kw-gt-fast-fence-');
  const dir = writeState(root, 'fast-fence-project', 28);
  fs.writeFileSync(path.join(dir, 'fast-summary.md'),
    '# Fast Summary: fast-fence-project\n\n## Status\nIN_PROGRESS\n\n## Scope\n```sh\n# set up before writing\n```\n- Write Set: plugins/kaola-workflow-gitea/scripts/claimed.js\n- Acceptance: node x\n');
  const result = classifier.classifyIssue(29, root);
  assert.strictEqual(result.verdict, 'red');
});

// issue #215: a `##`-prefixed line inside a fenced code block within ## Scope must
// NOT truncate the slice (boundary is h2-only, fence interior is not a heading).
// A `- Write Set:` path BELOW the fenced `## Some Heading` must still be counted;
// a candidate overlapping it must RED.
withForge({
  viewIssue(issueIid) {
    return {
      issue_iid: issueIid,
      number: issueIid,
      state: 'open',
      labels: [],
      body: 'touches: plugins/kaola-workflow-gitea/scripts/claimed.js'
    };
  }
}, () => {
  const root = tempRoot('kw-gt-fast-fence-heading-');
  const dir = writeState(root, 'fast-fence-heading-project', 30);
  fs.writeFileSync(path.join(dir, 'fast-summary.md'),
    '# Fast Summary: fast-fence-heading-project\n\n## Status\nIN_PROGRESS\n\n## Scope\n```sh\n## Some Heading\n```\n- Write Set: plugins/kaola-workflow-gitea/scripts/claimed.js\n- Acceptance: node x\n');
  const result = classifier.classifyIssue(31, root);
  assert.strictEqual(result.verdict, 'red');
});

// issue #215: a mixed-marker fence (`~~~` nested inside a backtick fence) within
// ## Scope must NOT terminate the backtick fence early. A `- Write Set:` path
// BELOW the fence content must still be counted; a candidate overlapping it must RED.
withForge({
  viewIssue(issueIid) {
    return {
      issue_iid: issueIid,
      number: issueIid,
      state: 'open',
      labels: [],
      body: 'touches: plugins/kaola-workflow-gitea/scripts/claimed.js'
    };
  }
}, () => {
  const root = tempRoot('kw-gt-fast-fence-mixed-');
  const dir = writeState(root, 'fast-fence-mixed-project', 32);
  fs.writeFileSync(path.join(dir, 'fast-summary.md'),
    '# Fast Summary: fast-fence-mixed-project\n\n## Status\nIN_PROGRESS\n\n## Scope\n```sh\n~~~\n## Heading\n```\n- Write Set: plugins/kaola-workflow-gitea/scripts/claimed.js\n- Acceptance: node x\n');
  const result = classifier.classifyIssue(33, root);
  assert.strictEqual(result.verdict, 'red');
});

// issue #215 / #667: an unterminated fence in a section BEFORE ## Scope leaves the claimed
// fast project's ## Scope structurally ambiguous (sectionBodyState status 'ambiguous'). The
// #660 fail-open fix collapsed that into sectionBody's bare '' at the scanClaimedOverlap
// consumer, so an overlapping candidate silently classified green. #667 restores fail-closed
// at the consumer: an ambiguous claimed Scope is INDETERMINATE, so the candidate classifies
// red. FAILING-FIRST against the pre-#667 fail-open consumer this asserted green.
withForge({
  viewIssue(issueIid) {
    return {
      issue_iid: issueIid,
      number: issueIid,
      state: 'open',
      labels: [],
      body: 'touches: plugins/kaola-workflow-gitea/scripts/claimed.js'
    };
  }
}, () => {
  const root = tempRoot('kw-gt-fast-fence-pre-');
  const dir = writeState(root, 'fast-fence-pre-project', 34);
  fs.writeFileSync(path.join(dir, 'fast-summary.md'),
    '# Fast Summary: fast-fence-pre-project\n\n## Status\n```sh\nIN_PROGRESS\n## Scope\n- Write Set: plugins/kaola-workflow-gitea/scripts/claimed.js\n- Acceptance: node x\n');
  const result = classifier.classifyIssue(35, root);
  assert.strictEqual(result.verdict, 'red');
});

withForge({
  listIssues() {
    return [
      { issue_iid: 9, number: 9, state: 'open' },
      { issue_iid: 8, number: 8, state: 'closed' },
      { issue_iid: 7, number: 7, state: 'open' }
    ];
  }
}, () => {
  const root = tempRoot('kw-gt-list-');
  try {
    assert.deepStrictEqual(claim.listOpenIssues(root).map(issue => issue.issue_iid), [7, 9]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// readPriorityConfig tests
{
  // Case a: missing config → default
  const root = tempRoot('kw-gt-rpc-');
  try {
    assert.deepStrictEqual(claim.readPriorityConfig(root), ['P0', 'P1']);
    console.log('readPriorityConfig missing config: PASS');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
{
  // Case b: valid array config → custom
  const root = tempRoot('kw-gt-rpc-');
  try {
    fs.mkdirSync(path.join(root, 'kaola-workflow'), { recursive: true });
    fs.writeFileSync(path.join(root, 'kaola-workflow', 'config.json'), JSON.stringify({ priority_top_tier_labels: ['critical', 'hotfix'] }));
    assert.deepStrictEqual(claim.readPriorityConfig(root), ['critical', 'hotfix']);
    console.log('readPriorityConfig valid array: PASS');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
{
  // Case c: non-array value → default
  const root = tempRoot('kw-gt-rpc-');
  try {
    fs.mkdirSync(path.join(root, 'kaola-workflow'), { recursive: true });
    fs.writeFileSync(path.join(root, 'kaola-workflow', 'config.json'), JSON.stringify({ priority_top_tier_labels: 'not-an-array' }));
    assert.deepStrictEqual(claim.readPriorityConfig(root), ['P0', 'P1']);
    console.log('readPriorityConfig non-array → default: PASS');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Discriminating priority-sort test for listOpenIssues
{
  const root = tempRoot('kw-gt-sort-');
  try {
    fs.mkdirSync(path.join(root, 'kaola-workflow'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'kaola-workflow', 'config.json'),
      JSON.stringify({ priority_top_tier_labels: ['critical'] })
    );
    withForge({
      listIssues() {
        return [
          { issue_iid: 5, number: 5, state: 'open', labels: ['critical'] },
          { issue_iid: 3, number: 3, state: 'open', labels: ['P0'] },
          { issue_iid: 9, number: 9, state: 'open', labels: [] },
          { issue_iid: 1, number: 1, state: 'open', labels: ['P2'] }
        ];
      }
    }, () => {
      const result = claim.listOpenIssues(root);
      assert.deepStrictEqual(
        result.map(i => i.issue_iid || i.number),
        [3, 5, 1, 9]
      );
      console.log('listOpenIssues priority sort: PASS');
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

withForge({
  viewIssue(issueIid) {
    return { issue_iid: issueIid, number: issueIid, state: 'open', labels: [], body: '' };
  },
  discoverProject() {
    return { full_name: 'group/repo', html_url: 'https://gitea.example/group/repo' };
  },
  ensureLabel(project, labelDef) {
    assert.strictEqual(project.full_name, 'group/repo');
    assert.strictEqual(labelDef.name, forge.CLAIM_LABEL);
    return { id: 1 };
  },
  updateIssueLabels(project, issueNum, opts) {
    assert.strictEqual(project.full_name, 'group/repo');
    assert.strictEqual(issueNum, 23);
    assert.deepStrictEqual(opts.add, [forge.CLAIM_LABEL]);
    return {};
  },
  createIssueComment(project, issueNum, body) {
    assert.strictEqual(project.full_name, 'group/repo');
    assert.strictEqual(issueNum, 23);
    assert(body.includes('issue-23'));
    return { id: 9001 };
  }
}, () => {
  const root = tempRoot('kw-gt-claim-');
  initGitRepo(root);
  const result = claim.claimExplicitTarget(root, { targetIssue: 23 });
  assert.strictEqual(result.status, 'acquired');
  const state = fs.readFileSync(path.join(root, 'kaola-workflow', 'issue-23', 'workflow-state.md'), 'utf8');
  assert(state.includes('issue_number: 23'));
  assert(state.includes('full_name: group/repo'));
  assert(state.includes('project_html_url: https://gitea.example/group/repo'));
});

withForge({
  listIssues() {
    return [{
      issue_iid: 30,
      number: 30,
      title: 'Roadmap item',
      state: 'open',
      labels: ['workflow:queued', 'area:gitea'],
      web_url: 'https://gitea.example/group/repo/issues/30'
    }];
  }
}, () => {
  const root = tempRoot('kw-gt-roadmap-');
  const result = roadmap.refreshFromGitea(root);
  assert.strictEqual(result.issues, 1);
  const record = fs.readFileSync(path.join(root, 'kaola-workflow', '.roadmap', 'issue-30.md'), 'utf8');
  assert(record.includes('labels: workflow:queued, area:gitea'));
  const rendered = fs.readFileSync(path.join(root, 'kaola-workflow', 'ROADMAP.md'), 'utf8');
  assert(rendered.includes('| #30 | Roadmap item | open | issue-30 | https://gitea.example/group/repo/issues/30 |'));
});

{
  const root = tempRoot('kw-gt-sink-');
  writeState(root, 'sink-project', 40);
  runNode([claimScript, 'sink-fallback', '--project', 'sink-project', '--reason', 'test'], root);
  const state = fs.readFileSync(path.join(root, 'kaola-workflow', 'sink-project', 'workflow-state.md'), 'utf8');
  assert(state.includes('sink: pr'));
}

{
  const root = tempRoot('kw-gt-worktree-cleanup-');
  const kwRoot = fs.realpathSync(root) + '.kw';
  try {
    initGitRepo(root);
    const wtRelease = path.join(kwRoot, 'release-project');
    fs.mkdirSync(path.dirname(wtRelease), { recursive: true });
    let result = spawnSync('git', ['worktree', 'add', '-b', 'workflow/gitea-issue-70', '--', wtRelease, 'HEAD'], { cwd: root, encoding: 'utf8' });
    assert.strictEqual(result.status, 0, result.stderr);
    writeState(root, 'release-project', 70, 'worktree_path: ' + wtRelease);
    runNode([claimScript, 'release', '--project', 'release-project', '--reason', 'test'], root);
    assert(!fs.existsSync(wtRelease), 'Gitea release should remove linked worktree');

    const wtFinalize = path.join(kwRoot, 'finalize-project');
    result = spawnSync('git', ['worktree', 'add', '-b', 'workflow/gitea-issue-71', '--', wtFinalize, 'HEAD'], { cwd: root, encoding: 'utf8' });
    assert.strictEqual(result.status, 0, result.stderr);
    writeState(root, 'finalize-project', 71, 'worktree_path: ' + wtFinalize);
    // This fixture validates worktree retention and archive movement, not the
    // adaptive gate itself, so it seeds a gate-passing adaptive plan before finalize.
    seedAdaptiveFinalizeFixture(root, 'finalize-project');
    runNode([claimScript, 'finalize', '--project', 'finalize-project', '--keep-worktree'], root);
    assert(fs.existsSync(wtFinalize), 'Gitea keep-worktree finalize should preserve worktree for final commit');
    assert(fs.existsSync(path.join(root, 'kaola-workflow', 'archive', 'finalize-project')), 'Gitea keep-worktree finalize should archive active folder');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(kwRoot, { recursive: true, force: true });
  }
}

// watch-pr: verify watchMergeRequests archives a merged PR project via forge stub.
withForge({
  viewPullRequest(prNumber) {
    assert.strictEqual(prNumber, 44);
    return { pr_number: 44, state: 'merged' };
  },
  updateIssueLabels() { return {}; },
  createIssueComment() { return { id: 9002 }; }
}, () => {
  const root = tempRoot('kw-gt-watch-pr-');
  writeState(root, 'pr-project', 44, 'pr_url: https://gitea.example/group/repo/pulls/44');
  roadmap.writeIssueRecord(root, { issue_iid: 44, title: 'pr test' }, 'open', 'pr-project', 'ready');
  roadmap.regenerateRoadmap(root);
  const roadmapSrc = path.join(root, 'kaola-workflow', '.roadmap', 'issue-44.md');
  const roadmapMirror = path.join(root, 'kaola-workflow', 'ROADMAP.md');
  assert(fs.existsSync(roadmapSrc));
  assert(fs.readFileSync(roadmapMirror, 'utf8').includes('#44'));
  const stateFile = path.join(root, 'kaola-workflow', 'pr-project', 'workflow-state.md');
  fs.writeFileSync(stateFile, fs.readFileSync(stateFile, 'utf8').replace('sink: merge', 'sink: pr'));
  const result = claim.watchMergeRequests(root, {});
  assert.strictEqual(result.watched, 1);
  assert(fs.existsSync(path.join(root, 'kaola-workflow', 'archive', 'pr-project', 'workflow-state.md')));
  assert(!fs.existsSync(roadmapSrc));
  assert(!fs.readFileSync(roadmapMirror, 'utf8').includes('#44'));
});

{
  const root = tempRoot('kw-gt-cwd-guard-');
  try {
    initGitRepo(root);
    const projectDir = writeState(root, 'cwd-project', 99);
    const result = spawnSync(process.execPath, [claimScript, 'release', '--project', 'cwd-project', '--reason', 'test'], {
      cwd: projectDir,
      encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_ROOT: root }
    });
    assert.strictEqual(result.status, 1, 'cmdRelease should exit 1 when cwd is inside project dir');
    const lines = result.stdout.trim().split('\n').filter(Boolean);
    const out = JSON.parse(lines[lines.length - 1]);
    assert.strictEqual(out.released, false, 'cmdRelease should report released: false');
    assert.strictEqual(out.reason, 'refusing to discard current working directory', 'cmdRelease should report the CWD guard reason');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

withForge({
  viewIssue(iid) { return { issue_iid: iid, number: iid, state: 'closed', labels: [] }; }
}, () => {
  const root = tempRoot('kw-gt-drift-');
  try {
    writeState(root, 'drift-project', 60);
    const result = claim.partitionActiveAndDrift(root);
    assert.strictEqual(result.drift.length, 1, 'partitionActiveAndDrift should put closed-issue folder into drift');
    assert.strictEqual(result.active.length, 0, 'partitionActiveAndDrift should leave active empty when all issues are closed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// --- Task A: Gap 1 — readOrCreateConfig creates defaults ---
{
  const tempHome = tempRoot('kw-gt-config-home-');
  try {
    const result = spawnSync(process.execPath, [classifierScript, 'classify', '--issue', '55'], {
      cwd: __dirname,
      encoding: 'utf8',
      env: Object.assign({}, process.env, {
        KAOLA_WORKFLOW_OFFLINE: '1',
        HOME: tempHome,
        USERPROFILE: tempHome
      })
    });
    const configPath = path.join(tempHome, '.config', 'kaola-workflow', 'config.json');
    assert(fs.existsSync(configPath), 'readOrCreateConfig should create config.json on first run');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.strictEqual(config.parallel_mode, 'auto', 'readOrCreateConfig should write parallel_mode: auto as default');
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

// --- Task A: Gap 1 — parallel_mode bypass ---
{
  const tempHome = tempRoot('kw-gt-config-bypass-');
  try {
    const configDir = path.join(tempHome, '.config', 'kaola-workflow');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ parallel_mode: 'off' }) + '\n');
    const result = spawnSync(process.execPath, [classifierScript, 'classify', '--issue', '56'], {
      cwd: __dirname,
      encoding: 'utf8',
      env: Object.assign({}, process.env, {
        KAOLA_WORKFLOW_OFFLINE: '1',
        HOME: tempHome,
        USERPROFILE: tempHome
      })
    });
    assert.strictEqual(result.status, 0);
    const out = JSON.parse(result.stdout.trim());
    assert.strictEqual(out.verdict, 'green');
    assert(/parallel_mode=off/.test(out.reasoning));
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

// --- Task A: Gap 2/3 — issueHasWorkflowInProgressLabel and issueHasRemoteClaimNotes ---
// issueHasWorkflowInProgressLabel is a pure function — always testable
assert(classifier.issueHasWorkflowInProgressLabel([forge.CLAIM_LABEL]));
assert(!classifier.issueHasWorkflowInProgressLabel([]));

// issueHasRemoteClaimNotes returns false in OFFLINE mode (by design).
// Verify the OFFLINE guard is in effect.
assert.strictEqual(classifier.issueHasRemoteClaimNotes(33), false,
  'issueHasRemoteClaimNotes should return false when OFFLINE=1 (no remote access)');
assert.strictEqual(classifier.issueHasRemoteClaimNotes(34), false,
  'issueHasRemoteClaimNotes should return false when OFFLINE=1');
assert.strictEqual(classifier.issueHasRemoteClaimNotes(35), false,
  'issueHasRemoteClaimNotes should return false when OFFLINE=1');

// --- Task A: Gap 2 — OFFLINE branch with depends-on in roadmap ---
{
  const tempHome = tempRoot('kw-gt-offline-classify-');
  const root = tempRoot('kw-gt-offline-root-');
  try {
    const roadmapDir = path.join(root, 'kaola-workflow', '.roadmap');
    fs.mkdirSync(roadmapDir, { recursive: true });
    fs.writeFileSync(path.join(roadmapDir, 'issue-57.md'),
      'issue: #57\ntitle: Offline fixture\nstatus: open\nnext_step: blocked by #3\n');
    const result = spawnSync(process.execPath, [classifierScript, 'classify', '--issue', '57'], {
      cwd: root, encoding: 'utf8',
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1', HOME: tempHome, USERPROFILE: tempHome })
    });
    assert.strictEqual(result.status, 0);
    const out = JSON.parse(result.stdout.trim());
    assert.strictEqual(out.verdict, 'blocked');
    assert(/depends-on:#3/.test(out.reasoning));
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Issue #175: OFFLINE + no roadmap + no active folder → target_unverified
{
  const tempHome = tempRoot('kw-gt-offline-nofile-');
  const root = tempRoot('kw-gt-offline-nofile-root-');
  try {
    fs.mkdirSync(path.join(root, 'kaola-workflow', '.roadmap'), { recursive: true });
    const result = spawnSync(process.execPath, [classifierScript, 'classify', '--issue', '58'], {
      cwd: root, encoding: 'utf8',
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1', HOME: tempHome, USERPROFILE: tempHome })
    });
    assert.strictEqual(result.status, 0);
    const out = JSON.parse(result.stdout.trim());
    assert.strictEqual(out.verdict, 'target_unverified',
      'OFFLINE with no local evidence must return target_unverified, got: ' + out.verdict);
    assert(/no local evidence/.test(out.reasoning),
      'reasoning must mention no local evidence, got: ' + out.reasoning);
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Issue #175: non-regression — OFFLINE with roadmap entry still acquires (NOT target_unverified)
{
  const tempHome = tempRoot('kw-gt-offline-roadmap-acquires-');
  const root = tempRoot('kw-gt-offline-roadmap-acquires-root-');
  try {
    const roadmapDir = path.join(root, 'kaola-workflow', '.roadmap');
    fs.mkdirSync(roadmapDir, { recursive: true });
    fs.writeFileSync(path.join(roadmapDir, 'issue-200.md'),
      'issue: #200\ntitle: roadmap-present\nstatus: open\nworkflow_project: issue-200\nnext_step: ready\n');
    const result = spawnSync(process.execPath, [classifierScript, 'classify', '--issue', '200'], {
      cwd: root, encoding: 'utf8',
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1', HOME: tempHome, USERPROFILE: tempHome })
    });
    assert.strictEqual(result.status, 0);
    const out = JSON.parse(result.stdout.trim());
    assert.notStrictEqual(out.verdict, 'target_unverified',
      'roadmap-present OFFLINE must NOT return target_unverified, got: ' + out.verdict);
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Issue #175: non-regression — OFFLINE with active folder for the target routes as 'owned' (NOT target_unverified)
{
  const tempHome = tempRoot('kw-gt-offline-owned-routes-');
  const root = tempRoot('kw-gt-offline-owned-routes-root-');
  try {
    writeState(root, 'issue-201', 201);
    const result = spawnSync(process.execPath, [classifierScript, 'classify', '--issue', '201'], {
      cwd: root, encoding: 'utf8',
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1', HOME: tempHome, USERPROFILE: tempHome })
    });
    assert.strictEqual(result.status, 0);
    const out = JSON.parse(result.stdout.trim());
    assert.strictEqual(out.verdict, 'owned',
      'active folder for target must produce owned (NOT target_unverified), got: ' + out.verdict);
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Issue #175: OFFLINE with an UNRELATED active folder must still produce target_unverified
{
  const tempHome = tempRoot('kw-gt-offline-unrelated-active-');
  const root = tempRoot('kw-gt-offline-unrelated-active-root-');
  try {
    writeState(root, 'issue-300', 300);
    const result = spawnSync(process.execPath, [classifierScript, 'classify', '--issue', '301'], {
      cwd: root, encoding: 'utf8',
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1', HOME: tempHome, USERPROFILE: tempHome })
    });
    assert.strictEqual(result.status, 0);
    const out = JSON.parse(result.stdout.trim());
    assert.strictEqual(out.verdict, 'target_unverified',
      'unrelated active folder must NOT mask target_unverified for requested target, got: ' + out.verdict);
    assert(out.reasoning && out.reasoning.includes('#301'),
      'reasoning must reference requested target #301, got: ' + out.reasoning);
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Issue #175: end-to-end startup with no evidence → target_unverified (covers classifyIssue production path)
{
  const tempHome = tempRoot('kw-gt-offline-startup-unverified-');
  const root = tempRoot('kw-gt-offline-startup-unverified-root-');
  try {
    fs.mkdirSync(path.join(root, 'kaola-workflow', '.roadmap'), { recursive: true });
    const result = spawnSync(process.execPath, [claimScript, 'startup', '--runtime', 'test', '--target-issue', '302'], {
      cwd: root, encoding: 'utf8',
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1', HOME: tempHome, USERPROFILE: tempHome })
    });
    assert.strictEqual(result.status, 1, 'offline unverified startup must exit 1');
    const out = JSON.parse(result.stdout.trim());
    assert.strictEqual(out.verdict, 'target_unverified');
    assert.strictEqual(out.claim, 'none');
    assert(!fs.existsSync(path.join(root, 'kaola-workflow', 'issue-302')),
      'offline unverified startup must not create an active folder');
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
}

{
  const tempHome = tempRoot('kw-gt-offline-startup-block-');
  const root = tempRoot('kw-gt-offline-startup-block-root-');
  try {
    const roadmapDir = path.join(root, 'kaola-workflow', '.roadmap');
    fs.mkdirSync(roadmapDir, { recursive: true });
    fs.writeFileSync(path.join(roadmapDir, 'issue-59.md'),
      'issue: #59\ntitle: Offline startup fixture\nstatus: open\nnext_step: blocked by #3\n');
    const result = spawnSync(process.execPath, [claimScript, 'startup', '--runtime', 'test', '--target-issue', '59'], {
      cwd: root, encoding: 'utf8',
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1', HOME: tempHome, USERPROFILE: tempHome })
    });
    assert.strictEqual(result.status, 1, 'offline blocked startup must exit 1');
    const out = JSON.parse(result.stdout.trim());
    assert.strictEqual(out.verdict, 'user_target_blocked');
    assert.strictEqual(out.claim, 'none');
    assert(/depends-on:#3/.test(out.reasoning));
    assert(!fs.existsSync(path.join(root, 'kaola-workflow', 'issue-59')),
      'offline blocked startup must not create an active folder');
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// --- Task B: Gap 5 — repair() terminal-complete detection (numbered-phase forward
// reconstruction retired with the full path; terminal finalization detection survives) ---
{
  // valid + complete
  const root = tempRoot('kw-gt-repair-complete-');
  try {
    const dir = writeState(root, 'complete-project', 83);
    fs.writeFileSync(path.join(dir, 'finalization-summary.md'), '# Finalization\n');
    const result = repair.repair('complete-project', root);
    assert.strictEqual(result.repaired, false);
    assert.strictEqual(result.complete, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// #725: the issue #199/#201/#208 fast-path repair + fast-resume tests are retired with the fast
// path — repair-state no longer routes fast-summary-only projects, and a fast-marker state resume
// no longer emits /kaola-workflow-fast.

// --- Task B: Gap 5 — stateContent ownership block + last_result rename ---
{
  const route4 = {
    root: '/tmp',
    phaseFile: '/tmp/phase4-tdd.md',
    project: 'gap5-project',
    phase: 4,
    phaseName: 'TDD',
    step: 'implement',
    task: 'write tests',
    nextCommand: '/kaola-workflow-phase4 gap5-project',
    nextSkill: 'kaola-workflow-execute gap5-project',
    pendingGates: []
  };
  const out4 = repair.stateContent(route4, '');
  assert(out4.includes('## Ownership Rules'), 'Gap5/phase4: output should include ## Ownership Rules section');
  assert(out4.includes('implementation_owner: tdd-guide'), 'Gap5/phase4: implementation_owner should be tdd-guide');
  assert(out4.includes('fix_owner: tdd-guide or build-error-resolver'), 'Gap5/phase4: fix_owner should be tdd-guide or build-error-resolver');
  assert(out4.includes('inline_emergency_fallback_authorized: no'), 'Gap5/phase4: inline_emergency_fallback_authorized should be no');
  assert(out4.includes('last_result: state_repaired_from_artifacts'), 'Gap5/phase4: last_result should be state_repaired_from_artifacts');
}

{
  const route2 = {
    root: '/tmp',
    phaseFile: '/tmp/phase2-research.md',
    project: 'gap5-project',
    phase: 2,
    phaseName: 'Research',
    step: 'gather',
    task: 'read docs',
    nextCommand: '/kaola-workflow-phase2 gap5-project',
    nextSkill: 'kaola-workflow-research gap5-project',
    pendingGates: []
  };
  const out2 = repair.stateContent(route2, '');
  assert(out2.includes('implementation_owner: N/A'), 'Gap5/phase2: implementation_owner should be N/A');
  assert(out2.includes('fix_owner: N/A'), 'Gap5/phase2: fix_owner should be N/A');
}

{
  const routePos = {
    root: '/tmp',
    phaseFile: '/tmp/phase3-plan.md',
    project: 'gap5-project',
    phase: 3,
    phaseName: 'Plan',
    step: 'plan',
    task: 'write plan',
    nextCommand: '/kaola-workflow-phase3 gap5-project',
    nextSkill: 'kaola-workflow-plan gap5-project',
    pendingGates: []
  };
  const outPos = repair.stateContent(routePos, '');
  const idxPending = outPos.indexOf('## Pending Gates');
  const idxOwnership = outPos.indexOf('## Ownership Rules');
  const idxEvidence = outPos.indexOf('## Last Evidence');
  assert(idxOwnership >= 0, 'Gap5/position: ## Ownership Rules must be present');
  assert(idxPending >= 0, 'Gap5/position: ## Pending Gates must be present');
  assert(idxEvidence >= 0, 'Gap5/position: ## Last Evidence must be present');
  assert(idxOwnership > idxPending, 'Gap5/position: ## Ownership Rules must appear after ## Pending Gates');
  assert(idxOwnership < idxEvidence, 'Gap5/position: ## Ownership Rules must appear before ## Last Evidence');
}

// Fix 2a: classifyIssue parallel_mode bypass
{
  const tempHome = tempRoot('kw-gt-ciy-bypass-');
  try {
    const configDir = path.join(tempHome, '.config', 'kaola-workflow');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ parallel_mode: 'manual' }) + '\n');
    // Run via subprocess so HOME override is effective
    const root = tempRoot('kw-gt-ciy-bypass-root-');
    try {
      const result = spawnSync(process.execPath, [classifierScript, 'classify', '--issue', '91'], {
        cwd: root, encoding: 'utf8',
        env: Object.assign({}, process.env, { HOME: tempHome, USERPROFILE: tempHome })
      });
      assert.strictEqual(result.status, 0);
      const out = JSON.parse(result.stdout.trim());
      assert.strictEqual(out.verdict, 'green');
      assert(/parallel_mode=manual/.test(out.reasoning));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

// Fix 2b: classifyIssue remote-claim guard via label
// classifyIssue with a reachable open issue (no roadmap entry, no overlap) → green (no block).
{
  const root = tempRoot('kw-gt-ciy-label-');
  try {
    fs.mkdirSync(path.join(root, 'kaola-workflow', '.roadmap'), { recursive: true });
    withForge({
      viewIssue(iid) { return { issue_iid: iid, number: iid, state: 'open', labels: [], body: '' }; }
    }, () => {
      const result = classifier.classifyIssue(92, root);
      // Online mode with open reachable issue and no roadmap entry → green (no block)
      assert.strictEqual(result.verdict, 'green', 'classifyIssue with reachable open issue and no roadmap entry should be green');
    });
    // Pure label check
    assert(classifier.issueHasWorkflowInProgressLabel([forge.CLAIM_LABEL]), 'CLAIM_LABEL must trigger issueHasWorkflowInProgressLabel');
    assert(!classifier.issueHasWorkflowInProgressLabel([]), 'empty labels must not trigger issueHasWorkflowInProgressLabel');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Issue #99: startup/pick-next explicit-target parity
{
  // startup without --target-issue must return no_target even when one active folder exists
  const root = tempRoot('kw-gt-startup-notarget-');
  try {
    writeState(root, 'sole-project', 99);
    const result = spawnSync(process.execPath, [claimScript, 'startup', '--runtime', 'test'], {
      cwd: root, encoding: 'utf8', env: process.env
    });
    assert.strictEqual(result.status, 1, 'startup without --target-issue must exit 1');
    const out = JSON.parse(result.stdout.trim());
    assert.strictEqual(out.verdict, 'no_target', 'startup without --target-issue must return no_target');
    assert.strictEqual(out.claim, 'none');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

{
  // pick-next without --target-issue must return no_target
  const root = tempRoot('kw-gt-picknext-notarget-');
  try {
    writeState(root, 'sole-project', 99);
    const result = spawnSync(process.execPath, [claimScript, 'pick-next'], {
      cwd: root, encoding: 'utf8', env: process.env
    });
    assert.strictEqual(result.status, 1, 'pick-next without --target-issue must exit 1');
    const out = JSON.parse(result.stdout.trim());
    assert.strictEqual(out.verdict, 'no_target', 'pick-next without --target-issue must return no_target');
    assert.strictEqual(out.claim, 'none');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

{
  // explicit-target startup with owned folder must include top-level worktree_path
  const root = tempRoot('kw-gt-startup-worktree-');
  try {
    writeState(root, 'issue-99', 99, 'worktree_path: /tmp/kw-wt-99');
    const result = spawnSync(process.execPath, [claimScript, 'startup', '--runtime', 'test', '--target-issue', '99'], {
      cwd: root, encoding: 'utf8', env: process.env
    });
    assert.strictEqual(result.status, 0, 'explicit-target startup must exit 0');
    const out = JSON.parse(result.stdout.trim());
    assert.strictEqual(out.verdict, 'owned');
    assert.strictEqual(out.claim, 'owned');
    assert.ok(typeof out.worktree_path === 'string', 'explicit owned startup must emit top-level worktree_path');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Issue #100: no-nesting — startup from a linked worktree must produce a path in the canonical
// hidden-local container (<main-root>/.kw/worktrees/), never nested under the linked worktree.
// Updated for #264: worktrees now live at <root>/.kw/worktrees/<project>, not the sibling scheme.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-sibling-'));
  const kwRoot = fs.realpathSync(tmp) + '.kw'; // legacy path — kept for cleanup only
  const binDir = path.join(tmp, 'bin');
  writeTeaShimOpen(binDir);
  try {
    initGitRepo(tmp);
    // Simulate a linked worktree by running startup from within a hypothetical linked path.
    // We do this by creating a hidden-local dir that shares the same git common-dir.
    const linkedWt = path.join(fs.realpathSync(tmp), '.kw', 'worktrees', 'issue-5');
    fs.mkdirSync(linkedWt, { recursive: true });
    // Create a worktree so git knows about it
    spawnSync('git', ['worktree', 'add', '--detach', linkedWt], { cwd: tmp, encoding: 'utf8' });

    // Run startup from the linked worktree cwd — should produce hidden-local, not nested path
    const result = spawnSync(process.execPath, [claimScript, 'startup', '--runtime', 'test', '--target-issue', '6'], {
      cwd: linkedWt, encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKTREE_NATIVE: '1', ...teaMockEnv(binDir), PATH: binDir + path.delimiter + (process.env.PATH || '') }
    });
    assert.strictEqual(result.status, 0, 'hidden-local startup must exit 0\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    const out = JSON.parse(result.stdout.trim());
    const expectedHiddenLocal = path.join(fs.realpathSync(tmp), '.kw', 'worktrees', 'issue-6');
    assert.strictEqual(out.worktree_path, expectedHiddenLocal,
      'startup from linked worktree must produce hidden-local path, not nested: got ' + out.worktree_path);
    assert.ok(!out.worktree_path.includes('issue-5/.kw'),
      'worktree path must not contain issue-5/.kw nesting: ' + out.worktree_path);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
  }
}

// Issue #149 Test 1: KAOLA_WORKTREE_NATIVE default-OFF — worktree_path must be empty when NATIVE=0
// Also asserts in-place branch created+checked-out (workflow/gitea-issue-8) + tree clean (#260).
{
  const root = tempRoot('kw-gt-native-off-');
  const binDir = path.join(root, 'bin');
  writeTeaShimOpen(binDir);
  try {
    initGitRepo(root);
    // Commit a .gitignore so the bin/ shim + kaola-workflow/ folder don't dirty the tree
    fs.writeFileSync(path.join(root, '.gitignore'), 'bin/\nkaola-workflow/\n.kw/\n');
    spawnSync('git', ['add', '.gitignore'], { cwd: root, encoding: 'utf8' });
    spawnSync('git', ['commit', '-m', 'add gitignore'], { cwd: root, encoding: 'utf8' });
    const result = spawnSync(process.execPath, [claimScript, 'startup', '--runtime', 'test', '--target-issue', '8'], {
      cwd: root, encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_WORKTREE_NATIVE: '0',
        ...teaMockEnv(binDir), PATH: binDir + path.delimiter + (process.env.PATH || '') }
    });
    assert.strictEqual(result.status, 0, 'NATIVE=0 startup must exit 0\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    const out = JSON.parse(result.stdout.trim());
    assert.strictEqual(out.worktree_path, '', 'NATIVE=0 must produce empty worktree_path, got: ' + out.worktree_path);
    // #260: in-place branch must be created and checked out
    const headBranch = spawnSync('git', ['-C', root, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    assert.strictEqual(headBranch, 'workflow/gitea-issue-8', 'NATIVE=0 must checkout in-place branch workflow/gitea-issue-8, got: ' + headBranch);
    const treeStatus = spawnSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' }).stdout.trim();
    assert.strictEqual(treeStatus, '', 'tree must be clean after in-place claim (all untracked entries gitignored), got: ' + JSON.stringify(treeStatus));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Issue #149 Test 2: OFFLINE wins over NATIVE — worktree_path must be empty when OFFLINE=1 even if NATIVE=1
{
  const root = tempRoot('kw-gt-offline-wins-');
  try {
    initGitRepo(root);
    // Provide roadmap evidence so the classifier can acquire (not target_unverified) — required since #175
    const roadmapDir = path.join(root, 'kaola-workflow', '.roadmap');
    fs.mkdirSync(roadmapDir, { recursive: true });
    fs.writeFileSync(path.join(roadmapDir, 'issue-9.md'),
      'issue: #9\ntitle: offline-wins-fixture\nstatus: open\nworkflow_project: issue-9\nnext_step: ready\n');
    const result = spawnSync(process.execPath, [claimScript, 'startup', '--runtime', 'test', '--target-issue', '9'], {
      cwd: root, encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_WORKTREE_NATIVE: '1' }
    });
    assert.strictEqual(result.status, 0, 'OFFLINE=1 startup must exit 0\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    const out = JSON.parse(result.stdout.trim());
    assert.strictEqual(out.worktree_path, '', 'OFFLINE=1 must produce empty worktree_path even with NATIVE=1, got: ' + out.worktree_path);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// #725/#770: the Issue #101 KAOLA_PATH=fast startup test is retired — first (#725) because fast
// was never an installed path (refused path_not_installed), and now (#770) because the path
// SELECTOR itself is retired: a stale KAOLA_PATH=fast is silently ignored and the claim ACQUIRES
// via adaptive (never a fast-state startup, never a refusal).

// #725: the Issue #107 phase4-progress → Finalization reconstruction tests are retired with the
// numbered full path — repair-state no longer forward-reconstructs numbered phases (it reconstructs
// only adaptive projects from workflow-plan.md, else a clean "no adaptive plan available" refusal).

function testStaleWorktreeCheck() {
  function setupRepo() {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-stale-gt-')));
    initGitRepo(tmp);
    return tmp;
  }

  function addWorktree(repoRoot, branch, wtPath) {
    const r = spawnSync('git', ['worktree', 'add', '-b', branch, '--', wtPath, 'HEAD'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, 'git worktree add failed: ' + r.stderr);
  }

  // Sub-case 1: closed worktree -> stale
  {
    const tmp = setupRepo();
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    writeTeaShimForStale(binDir);
    const wtPath = path.join(kwRoot, 'issue-200');
    addWorktree(tmp, 'workflow/gitea-issue-200', wtPath);
    try {
      const result = runClaimOnline(['stale-worktree-check'], tmp, binDir);
      assert(result.stale_worktrees.some(x => x.issue_number === 200),
        'expected issue 200 in stale_worktrees, got: ' + JSON.stringify(result));
      assert(!result.stale_branches.some(x => x.issue_number === 200),
        'issue 200 should not be in stale_branches');
      assert(result.count >= 1, 'count should be >= 1');
    } finally {
      spawnSync('git', ['-C', tmp, 'worktree', 'remove', '--force', wtPath], { encoding: 'utf8' });
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.rmSync(kwRoot, { recursive: true, force: true });
    }
  }

  // Sub-case 2: archived-open worktree -> stale
  {
    const tmp = setupRepo();
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    writeTeaShimForStale(binDir);
    const wtPath = path.join(kwRoot, 'issue-300');
    addWorktree(tmp, 'workflow/gitea-issue-300', wtPath);
    fs.mkdirSync(path.join(tmp, 'kaola-workflow', 'archive', 'issue-300'), { recursive: true });
    try {
      const result = runClaimOnline(['stale-worktree-check'], tmp, binDir);
      assert(result.stale_worktrees.some(x => x.issue_number === 300),
        'expected issue 300 in stale_worktrees (archived), got: ' + JSON.stringify(result));
    } finally {
      spawnSync('git', ['-C', tmp, 'worktree', 'remove', '--force', wtPath], { encoding: 'utf8' });
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.rmSync(kwRoot, { recursive: true, force: true });
    }
  }

  // Sub-case 3: open + active worktree -> not stale
  {
    const tmp = setupRepo();
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    writeTeaShimForStale(binDir);
    const wtPath = path.join(kwRoot, 'issue-100');
    addWorktree(tmp, 'workflow/gitea-issue-100', wtPath);
    writeState(tmp, 'issue-100', 100);
    try {
      const result = runClaimOnline(['stale-worktree-check'], tmp, binDir);
      assert(result.active_worktrees.some(x => x.issue_number === 100),
        'expected issue 100 in active_worktrees, got: ' + JSON.stringify(result));
      assert(!result.stale_worktrees.some(x => x.issue_number === 100),
        'issue 100 should not be in stale_worktrees');
    } finally {
      spawnSync('git', ['-C', tmp, 'worktree', 'remove', '--force', wtPath], { encoding: 'utf8' });
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.rmSync(kwRoot, { recursive: true, force: true });
    }
  }

  // Sub-case 4: deleted-dir worktree -> state:'missing'
  // IMPORTANT: use fs.rmSync NOT git worktree remove -- registration must survive
  {
    const tmp = setupRepo();
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    writeTeaShimForStale(binDir);
    const wtPath = path.join(kwRoot, 'issue-200');
    addWorktree(tmp, 'workflow/gitea-issue-200', wtPath);
    // Delete dir without removing git worktree metadata
    fs.rmSync(wtPath, { recursive: true, force: true });
    try {
      const result = runClaimOnline(['stale-worktree-check'], tmp, binDir);
      const entry = result.stale_worktrees.find(x => x.issue_number === 200);
      assert(entry, 'expected issue 200 in stale_worktrees after dir deletion, got: ' + JSON.stringify(result));
      assert.strictEqual(entry.state, 'missing', 'expected state:missing, got: ' + entry.state);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.rmSync(kwRoot, { recursive: true, force: true });
    }
  }

  // Sub-case 5: loose branch (no worktree) -> stale_branches
  {
    const tmp = setupRepo();
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    writeTeaShimForStale(binDir);
    spawnSync('git', ['branch', 'workflow/gitea-issue-400'], { cwd: tmp, encoding: 'utf8' });
    try {
      const result = runClaimOnline(['stale-worktree-check'], tmp, binDir);
      assert(result.stale_branches.some(x => x.issue_number === 400),
        'expected issue 400 in stale_branches, got: ' + JSON.stringify(result));
      assert(!result.stale_worktrees.some(x => x.issue_number === 400),
        'issue 400 should not be in stale_worktrees');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.rmSync(kwRoot, { recursive: true, force: true });
    }
  }

  // Sub-case 6: OFFLINE + archived worktree -> stale (archive-only path, no API call)
  {
    const tmp = setupRepo();
    const kwRoot = tmp + '.kw';
    const wtPath = path.join(kwRoot, 'issue-300');
    addWorktree(tmp, 'workflow/gitea-issue-300', wtPath);
    fs.mkdirSync(path.join(tmp, 'kaola-workflow', 'archive', 'issue-300'), { recursive: true });
    try {
      const result = spawnSync(process.execPath, [claimScript, 'stale-worktree-check'], {
        cwd: tmp, encoding: 'utf8', timeout: 30000,
        env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
      });
      assert.strictEqual(result.status, 0, result.stderr || result.stdout);
      const out = JSON.parse(result.stdout.trim());
      assert(out.stale_worktrees.some(x => x.issue_number === 300),
        'expected issue 300 stale in OFFLINE+archive mode, got: ' + JSON.stringify(out));
    } finally {
      spawnSync('git', ['-C', tmp, 'worktree', 'remove', '--force', wtPath], { encoding: 'utf8' });
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.rmSync(kwRoot, { recursive: true, force: true });
    }
  }

  console.log('testStaleWorktreeCheck: PASSED');
}

const giteaPluginRoot = path.resolve(__dirname, '..');
const installProfilesScript = path.join(giteaPluginRoot, 'scripts', 'install-codex-agent-profiles.js');

function runInstallProfiles(target, extraEnv, extraArgs) {
  const args = (extraArgs && extraArgs.length) ? extraArgs : [];
  const result = spawnSync(process.execPath, [installProfilesScript, target, ...args], {
    cwd: giteaPluginRoot,
    encoding: 'utf8',
    env: extraEnv ? Object.assign({}, process.env, extraEnv) : process.env
  });
  if (result.error) throw result.error;
  assert.ok(result.status === 0, 'install profiles failed: ' + result.stderr);
  return result;
}

function countOccurrences(content, pattern) {
  return (content.match(pattern) || []).length;
}

// #325/#525: updateHooks() hardening on the gitea installer copy — R1 (metacharacter pluginRoot),
// R2 (output is { hooks } ONLY — no $schema; Codex's strict parser rejects unknown top-level keys, and
// an existing $schema self-heals), R3 (sweep ALL events). Helpers are exported (require.main guard).
function testUpdateHooksHardening325() {
  const { buildManagedHooks, mergeHooks } = require(installProfilesScript);
  const tmplText = JSON.stringify({
    $schema: 'https://json.schemastore.org/claude-code-settings.json',
    hooks: { SessionStart: [{ matcher: 'compact', hooks: [{ type: 'command', command: 'node "__KW_PLUGIN_ROOT__/scripts/x.js"', timeout: 5 }], id: 'kaola-workflow:compact' }] },
  });
  // R1
  const built = buildManagedHooks(tmplText, 'C:\\plug"in');
  const cmd = built.hooks.SessionStart[0].hooks[0].command;
  assert.strictEqual(cmd, 'node "C:\\plug"in/scripts/x.js"', '#325 R1: pluginRoot substituted verbatim');
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(built)), '#325 R1: built hooks re-serialize to valid JSON');
  // R2 (#525): output is { hooks } ONLY — Codex's parser rejects unknown top-level keys; an existing $schema self-heals.
  const freshMerge = mergeHooks({ hooks: {} }, built);
  assert.strictEqual(freshMerge.$schema, undefined, '#525: fresh-install merge carries NO $schema');
  assert.strictEqual(Object.keys(freshMerge).join(','), 'hooks', '#525: merged output has only the hooks key');
  assert.strictEqual(mergeHooks({ $schema: 'user-schema', hooks: {} }, built).$schema, undefined, '#525: an existing $schema is dropped (self-heal), not carried');
  // R3
  const shrunk = { hooks: { SessionStart: built.hooks.SessionStart } };
  const swept = mergeHooks({ hooks: { PostToolUse: [{ id: 'kaola-workflow:retired-orphan' }, { id: 'user:keep' }] } }, shrunk);
  assert.ok(!(swept.hooks.PostToolUse || []).some(e => e.id && e.id.startsWith('kaola-workflow:')), '#325 R3: orphan kaola-workflow: entry swept');
  assert.ok((swept.hooks.PostToolUse || []).some(e => e.id === 'user:keep'), '#325 R3: user entry preserved');
  // R2 black-box — #447: hooks land in temp HOME/.codex (global), not in the project dir
  const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gitea-325-schema-'));
  const tempHome325 = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gitea-325-home-'));
  try {
    runInstallProfiles(freshDir, { HOME: tempHome325, USERPROFILE: tempHome325 });
    // #447 AC1: hooks land in the global ~/.codex, NOT in the project dir
    const globalHooksPath = path.join(tempHome325, '.codex', 'hooks.json');
    const projectHooksPath = path.join(freshDir, '.codex', 'hooks.json');
    assert.ok(fs.existsSync(globalHooksPath), '#447 AC1: hooks.json must be written to global HOME/.codex, not found at: ' + globalHooksPath);
    assert.ok(!fs.existsSync(projectHooksPath), '#447 AC5: no hooks.json must be written to project .codex, found at: ' + projectHooksPath);
    const installed = JSON.parse(fs.readFileSync(globalHooksPath, 'utf8'));
    assert.ok(installed.$schema === undefined && Object.keys(installed).join(',') === 'hooks', '#525 (black-box): fresh-install hooks.json has only the hooks key, no $schema');
  } finally {
    fs.rmSync(freshDir, { recursive: true, force: true });
    fs.rmSync(tempHome325, { recursive: true, force: true });
  }
  console.log('testUpdateHooksHardening325 (gitea): PASSED');
}

// #409: stable-home regression — install FROM a throwaway copy of the gitea plugin tree,
// DELETE the copy, then assert every hooks.json command still resolves to an existing
// executable in a version-less home (no install-source / version-pinned path), and that
// reinstall sweeps a planted stale script. The gitea template references the edition-named
// kaola-gitea-workflow-codex-compact-resume.js — hookReferencedRelPaths auto-adjusts.
function test409StableHomeSurvivesDirDeletion() {
  const recursiveCopyDir = (src, dst) => {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, entry.name);
      const d = path.join(dst, entry.name);
      if (entry.isDirectory()) recursiveCopyDir(s, d);
      else if (entry.isFile()) { fs.copyFileSync(s, d); fs.chmodSync(d, fs.statSync(s).mode); }
    }
  };
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-409-stable-home-'));
  // #447: hooks + stable home go to global HOME/.codex; use a temp HOME so the test
  // never writes to the real ~/.codex.
  const tempHome409 = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-409-home-'));
  try {
    const installSrc = path.join(work, 'ephemeral-src');
    recursiveCopyDir(giteaPluginRoot, installSrc);
    const srcInstaller = path.join(installSrc, 'scripts', 'install-codex-agent-profiles.js');
    const target = path.join(work, 'target');
    fs.mkdirSync(target, { recursive: true });

    const homeEnv409 = { HOME: tempHome409, USERPROFILE: tempHome409 };
    const first = spawnSync(process.execPath, [srcInstaller, target], {
      cwd: installSrc, encoding: 'utf8',
      env: Object.assign({}, process.env, homeEnv409)
    });
    if (first.error) throw first.error;
    assert.ok(first.status === 0, '#409 gt: install from ephemeral source must succeed: ' + first.stderr);

    fs.rmSync(installSrc, { recursive: true, force: true });

    // #447 AC1: hooks land in global HOME/.codex, not in the project dir
    const globalHooks409Path = path.join(tempHome409, '.codex', 'hooks.json');
    assert.ok(fs.existsSync(globalHooks409Path), '#447/#409 gt: hooks.json must be in global HOME/.codex after install');
    assert.ok(!fs.existsSync(path.join(target, '.codex', 'hooks.json')), '#447 AC5 gt: no hooks.json must be in project .codex');

    const hooks = JSON.parse(fs.readFileSync(globalHooks409Path, 'utf8'));
    let commandCount = 0;
    for (const event of Object.keys(hooks.hooks || {})) {
      for (const entry of (hooks.hooks[event] || [])) {
        for (const h of (entry.hooks || [])) {
          if (typeof h.command !== 'string') continue;
          commandCount++;
          const m = h.command.match(/"([^"]+)"/);
          assert.ok(m, '#409 gt: hook command must carry a quoted script path: ' + h.command);
          const scriptPath = m[1];
          assert.ok(fs.existsSync(scriptPath), '#409 gt GREEN: hook script must exist after source deletion: ' + scriptPath);
          assert.ok((fs.statSync(scriptPath).mode & 0o100) !== 0, '#409 gt: hook script must be executable: ' + scriptPath);
          assert.ok(!scriptPath.includes('ephemeral-src'), '#409 gt: must NOT point at the deleted source: ' + scriptPath);
          assert.ok(!/\/\d+\.\d+\.\d+\//.test(scriptPath), '#409 gt: hook path must NOT be version-pinned: ' + scriptPath);
        }
      }
    }
    assert.ok(commandCount >= 2, '#409 gt: expected the two managed hook commands, saw ' + commandCount);

    // #447: stable home also lives in global HOME/.codex/kaola-workflow
    const globalStableHome409 = path.join(tempHome409, '.codex', 'kaola-workflow');
    const planted = path.join(globalStableHome409, 'hooks', 'kaola-workflow-stale-orphan.sh');
    fs.mkdirSync(path.dirname(planted), { recursive: true });
    fs.writeFileSync(planted, '#!/usr/bin/env bash\nexit 0\n');
    const second = spawnSync(process.execPath, [installProfilesScript, target], {
      cwd: giteaPluginRoot, encoding: 'utf8',
      env: Object.assign({}, process.env, homeEnv409)
    });
    if (second.error) throw second.error;
    assert.ok(second.status === 0, '#409 gt: reinstall must succeed: ' + second.stderr);
    assert.ok(!fs.existsSync(planted), '#409 gt: reinstall must sweep the stale planted script');

    console.log('test409StableHomeSurvivesDirDeletion (gitea): PASSED');
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
    fs.rmSync(tempHome409, { recursive: true, force: true });
  }
}

function testInstallProfilesFeaturesTableHandling() {
  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gitea-codex-install-fresh-'));
  const existing = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gitea-codex-install-existing-'));
  // #447: use a temp HOME so hooks are never written to the real ~/.codex
  const tempHomeFresh = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gitea-codex-home-fresh-'));
  const tempHomeExisting = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gitea-codex-home-existing-'));
  try {
    const freshHomeEnv = { HOME: tempHomeFresh, USERPROFILE: tempHomeFresh };
    const existingHomeEnv = { HOME: tempHomeExisting, USERPROFILE: tempHomeExisting };
    const freshResult = runInstallProfiles(fresh, freshHomeEnv);
    const freshConfig = fs.readFileSync(path.join(fresh, '.codex', 'config.toml'), 'utf8');
    assert.ok(freshConfig.includes('[features]'), 'fresh install should include managed [features]');
    assert.ok(freshConfig.includes('multi_agent = true'), 'fresh install should enable multi_agent');
    assert.ok(freshConfig.includes('# BEGIN kaola-workflow agents'), 'fresh install should include managed block');
    // #332: the installer now also writes a .kaola-managed-profiles.json manifest into
    // this dir, so count TOML entries only (raw readdir includes the manifest dotfile).
    // #451: 14 base role profiles (the <role>-max effort variants are retired).
    const freshAgentsDir = path.join(fresh, '.codex', 'agents', 'kaola-workflow');
    assert.strictEqual(
      fs.readdirSync(freshAgentsDir).filter(f => f.endsWith('.toml')).length,
      16,
      'should install 16 agent TOML files (14 base + synthesizer #463 + metric-optimizer #634; <role>-max retired #451)'
    );
    assert.ok(
      fs.existsSync(path.join(freshAgentsDir, '.kaola-managed-profiles.json')),
      '#332: fresh install must write the managed-profiles manifest'
    );

    // #284/#372/#447: hooks.json assertions — hooks are GLOBAL (in temp HOME/.codex)
    // #447 AC1: hooks land in the global HOME/.codex, NOT in the project dir
    const freshHooksPath = path.join(tempHomeFresh, '.codex', 'hooks.json');
    assert.ok(fs.existsSync(freshHooksPath), '#447 AC1: fresh install must create HOME/.codex/hooks.json (global), not found at: ' + freshHooksPath);
    assert.ok(!fs.existsSync(path.join(fresh, '.codex', 'hooks.json')), '#447 AC5: no hooks.json must be written to project .codex');
    const freshHooks = JSON.parse(fs.readFileSync(freshHooksPath, 'utf8'));
    const requiredEvents = ['SessionStart', 'SubagentStart'];
    for (const event of requiredEvents) {
      const entries = freshHooks.hooks[event];
      assert.ok(Array.isArray(entries) && entries.length > 0, `hooks.json must have entries for ${event}`);
      const kwEntry = entries.find(e => e.id && e.id.startsWith('kaola-workflow:'));
      assert.ok(kwEntry, `hooks.json ${event} must contain an entry whose id starts with kaola-workflow:`);
    }
    const sessionStartEntry = freshHooks.hooks['SessionStart'].find(e => e.id && e.id.startsWith('kaola-workflow:'));
    const compactCmd = sessionStartEntry && sessionStartEntry.hooks && sessionStartEntry.hooks[0] && sessionStartEntry.hooks[0].command;
    assert.ok(compactCmd && compactCmd.includes('kaola-gitea-workflow-codex-compact-resume.js'),
      'SessionStart compact command must reference kaola-gitea-workflow-codex-compact-resume.js, got: ' + compactCmd);
    const freshHooksText = fs.readFileSync(freshHooksPath, 'utf8');
    assert.ok(!freshHooksText.includes('__KW_PLUGIN_ROOT__'),
      'installed hooks.json must not contain literal __KW_PLUGIN_ROOT__ token');
    assert.ok(freshResult.stdout.includes('/hooks'),
      'install output must include /hooks trust line, got: ' + freshResult.stdout);

    const existingCodexDir = path.join(existing, '.codex');
    fs.mkdirSync(existingCodexDir, { recursive: true });
    const existingConfigPath = path.join(existingCodexDir, 'config.toml');
    fs.writeFileSync(existingConfigPath, [
      '[features]', 'goals = true', '', '[projects."/tmp/example"]', 'trust_level = "trusted"', ''
    ].join('\n'));

    runInstallProfiles(existing, existingHomeEnv);
    runInstallProfiles(existing, existingHomeEnv);
    const updated = fs.readFileSync(existingConfigPath, 'utf8');
    assert.strictEqual(
      countOccurrences(updated, /^\[features\]$/gm),
      1,
      'existing config must contain exactly one [features] table'
    );
    assert.ok(updated.includes('goals = true'), 'existing [features] content must be preserved');
    assert.ok(updated.includes('[agents.code-explorer]'), 'managed agent block should still be installed');

    // #284/#447: idempotency — hooks land in global HOME/.codex; each id appears exactly once
    const existingHooksPath = path.join(tempHomeExisting, '.codex', 'hooks.json');
    assert.ok(fs.existsSync(existingHooksPath), '#447: global HOME/.codex/hooks.json must exist after install');
    assert.ok(!fs.existsSync(path.join(existing, '.codex', 'hooks.json')), '#447 AC5: no hooks.json in project .codex after double-run');
    const existingHooks = JSON.parse(fs.readFileSync(existingHooksPath, 'utf8'));
    // #376: per-ID no-duplicate check (an event MAY carry >1 distinct managed id, e.g. PreToolUse
    // holds both pre-commit-guard and the write-lane hook); each id must appear exactly once.
    const idCounts = {};
    for (const event of Object.keys(existingHooks.hooks || {})) {
      for (const e of existingHooks.hooks[event]) {
        if (e.id && e.id.startsWith('kaola-workflow:')) idCounts[e.id] = (idCounts[e.id] || 0) + 1;
      }
    }
    for (const id of Object.keys(idCounts)) {
      assert.strictEqual(idCounts[id], 1,
        `idempotency: managed id ${id} must appear exactly once after 2 installs, got ${idCounts[id]}`);
    }
  } finally {
    fs.rmSync(fresh, { recursive: true, force: true });
    fs.rmSync(existing, { recursive: true, force: true });
    fs.rmSync(tempHomeFresh, { recursive: true, force: true });
    fs.rmSync(tempHomeExisting, { recursive: true, force: true });
  }
}

function testStaleWorktreeCleanup() {
  function addWorktree(repoRoot, branch, wtPath) {
    const r = spawnSync('git', ['worktree', 'add', '-b', branch, '--', wtPath, 'HEAD'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, 'git worktree add failed: ' + r.stderr);
  }

  // Sub-case 1: dry-run — clean worktree, no --execute
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-stale-cleanup-sc1-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeTeaShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitea-issue-200', wtPath);
      const out = runClaimOnline(['stale-worktree-cleanup'], tmp, binDir);
      assert(out.dry_run === true, 'sc1: dry_run must be true, got: ' + JSON.stringify(out));
      assert(Array.isArray(out.would_remove) && out.would_remove.some(p => p === wtPath),
        'sc1: would_remove must contain wtPath, got: ' + JSON.stringify(out.would_remove));
      assert(Array.isArray(out.would_delete_branch) && out.would_delete_branch.includes('workflow/gitea-issue-200'),
        'sc1: would_delete_branch must contain workflow/gitea-issue-200, got: ' + JSON.stringify(out.would_delete_branch));
      assert(fs.existsSync(wtPath), 'sc1: worktree dir must still exist after dry-run');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 2: execute-clean — clean worktree + --execute
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-stale-cleanup-sc2-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeTeaShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitea-issue-200', wtPath);
      const out = runClaimOnline(['stale-worktree-cleanup', '--execute'], tmp, binDir);
      assert(out.dry_run === false, 'sc2: dry_run must be false, got: ' + JSON.stringify(out));
      assert(Array.isArray(out.removed) && out.removed.some(p => p === wtPath),
        'sc2: removed must contain wtPath, got: ' + JSON.stringify(out.removed));
      assert(Array.isArray(out.deleted_branch) && out.deleted_branch.includes('workflow/gitea-issue-200'),
        'sc2: deleted_branch must contain workflow/gitea-issue-200, got: ' + JSON.stringify(out.deleted_branch));
      assert(!fs.existsSync(wtPath), 'sc2: worktree dir must be removed after execute');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 3: execute-dirty-no-flag — dirty worktree + --execute (no archive/export/force)
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-stale-cleanup-sc3-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeTeaShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitea-issue-200', wtPath);
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
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-stale-cleanup-sc4-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeTeaShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitea-issue-200', wtPath);
      fs.writeFileSync(path.join(wtPath, 'dirty.txt'), 'x');
      const out = runClaimOnline(['stale-worktree-cleanup', '--execute', '--archive'], tmp, binDir);
      assert(Array.isArray(out.stashed) && out.stashed.some(p => p === wtPath),
        'sc4: stashed must contain wtPath, got: ' + JSON.stringify(out.stashed));
      assert(Array.isArray(out.removed) && out.removed.some(p => p === wtPath),
        'sc4: removed must contain wtPath, got: ' + JSON.stringify(out.removed));
      assert(!fs.existsSync(wtPath), 'sc4: worktree dir must be removed after archive+execute');
      const stashResult = spawnSync('git', ['-C', tmp, 'stash', 'list'], { encoding: 'utf8' });
      assert(stashResult.stdout.includes('kaola-cleanup-issue-200'),
        'sc4: stash list must contain kaola-cleanup-issue-200, got: ' + stashResult.stdout);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 5: execute-dirty-export — dirty (tracked file) + --execute --export
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-stale-cleanup-sc5-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeTeaShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitea-issue-200', wtPath);
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
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-stale-cleanup-sc6-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeTeaShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitea-issue-200', wtPath);
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
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-stale-cleanup-sc7-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeTeaShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitea-issue-200', wtPath);
      const out = runClaimOnline(['stale-worktree-cleanup', '--execute', '--keep-branch'], tmp, binDir);
      assert(Array.isArray(out.removed) && out.removed.some(p => p === wtPath),
        'sc7: removed must contain wtPath, got: ' + JSON.stringify(out.removed));
      assert(!out.deleted_branch || out.deleted_branch.length === 0,
        'sc7: deleted_branch must be empty with --keep-branch, got: ' + JSON.stringify(out.deleted_branch));
      assert(!fs.existsSync(wtPath), 'sc7: worktree dir must be removed');
      // Branch must still exist
      const branchCheck = spawnSync('git', ['-C', tmp, 'rev-parse', '--verify', 'refs/heads/workflow/gitea-issue-200'], { encoding: 'utf8' });
      assert.strictEqual(branchCheck.status, 0, 'sc7: branch workflow/gitea-issue-200 must still exist, got: ' + branchCheck.stderr);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 8: execute-archive-fail — stash fails → failed_preserve, no removal
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-stale-cleanup-sc8-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    let lockFile = null;
    try {
      initGitRepo(tmp);
      writeTeaShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitea-issue-200', wtPath);
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
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-stale-cleanup-sc9-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeTeaShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitea-issue-200', wtPath);
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
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-stale-cleanup-sc10-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeTeaShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitea-issue-200', wtPath);
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
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-stale-cleanup-sc11-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeTeaShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitea-issue-200', wtPath);
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

testInstallProfilesFeaturesTableHandling();
testUpdateHooksHardening325();
test409StableHomeSurvivesDirDeletion();   // #409
testGiteaRoadmapValidateRemote();
testStaleWorktreeCheck();
testStaleWorktreeCleanup();

// --- Issue #167: closure-audit (Gitea port of GitLab issue #166 / GitHub #165) ---

function testClosureAuditOfflineRemoteClassesSkipped() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-offline-')));
  try {
    initGitRepo(tmp);
    const result = runClosureAuditOffline([], tmp);
    assert.strictEqual(result.dry_run, true, 'offline audit dry_run must be true, got: ' + result.dry_run);
    assert.strictEqual(result.offline, true, 'offline audit offline must be true, got: ' + result.offline);
    assert.strictEqual(
      result.drift.stale_in_progress_labels, 'skipped_offline',
      'offline: stale_in_progress_labels must be "skipped_offline", got: ' + JSON.stringify(result.drift.stale_in_progress_labels)
    );
    assert.strictEqual(
      result.drift.unarchived_pr_folders, 'skipped_offline',
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
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-closed-remote-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    plantClosureRoadmapSource(tmp, 900);
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issues view')) { process.stdout.write('{\"state\":\"closed\"}\\n'); }",
      "else if (a.includes('issues list')) { process.stdout.write('[]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const result = runClosureAudit([], tmp, binDir);
    const sources = result.drift.stale_roadmap_sources;
    assert(
      sources.length === 1 && sources[0].issue_number === 900 && sources[0].reason === 'closed_remote',
      'expected one closed_remote source for 900, got: ' + JSON.stringify(sources)
    );
    assert.strictEqual(result.counts.stale_roadmap_sources, 1, 'counts.stale_roadmap_sources must be 1, got: ' + result.counts.stale_roadmap_sources);
    console.log('testClosureAuditClosedRemoteRoadmapSource: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditArchiveClosedDrift() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-archive-closed-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    plantClosureRoadmapSource(tmp, 901);
    const archiveDir = path.join(tmp, 'kaola-workflow', 'archive', 'issue-901');
    fs.mkdirSync(archiveDir, { recursive: true });
    // D4: archive carries issue_iid (NOT issue_number). Iid-first read is the guard.
    fs.writeFileSync(path.join(archiveDir, 'workflow-state.md'), 'status: closed\nstep: complete\nissue_iid: 901\n');
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issues view')) { process.stdout.write('{\"state\":\"open\"}\\n'); }",
      "else if (a.includes('issues list')) { process.stdout.write('[]\\n'); }",
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

// #336: a status:closed archive carrying issue_action: comment_keep_open must NOT be flagged
// archive_closed (the --execute landmine that would delete the preserved roadmap source).
function testClosureAuditKeepOpenExclusion() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-keepopen-')));
  try {
    initGitRepo(tmp);
    plantClosureRoadmapSource(tmp, 720);
    const keepDir = path.join(tmp, 'kaola-workflow', 'archive', 'issue-720');
    fs.mkdirSync(keepDir, { recursive: true });
    fs.writeFileSync(path.join(keepDir, 'workflow-state.md'),
      'status: closed\nstep: complete\nissue_iid: 720\nissue_action: comment_keep_open\n');
    plantClosureRoadmapSource(tmp, 721);
    const normalDir = path.join(tmp, 'kaola-workflow', 'archive', 'issue-721');
    fs.mkdirSync(normalDir, { recursive: true });
    fs.writeFileSync(path.join(normalDir, 'workflow-state.md'),
      'status: closed\nstep: complete\nissue_iid: 721\n');
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

function testClosureAuditDedupRoadmapAndArchive() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-dedup-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    plantClosureRoadmapSource(tmp, 902);
    const archiveDir = path.join(tmp, 'kaola-workflow', 'archive', 'issue-902');
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, 'workflow-state.md'), 'status: closed\nstep: complete\nissue_iid: 902\n');
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issues view')) { process.stdout.write('{\"state\":\"closed\"}\\n'); }",
      "else if (a.includes('issues list')) { process.stdout.write('[]\\n'); }",
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
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-arch-only-')));
  const binDir = path.join(tmp, 'bin');
  const viewCountFile = path.join(binDir, 'view-count');
  try {
    initGitRepo(tmp);
    plantClosureRoadmapSource(tmp, 920);
    // Archive-only entry for issue 950 — no roadmap source, no active folder
    const archiveDir = path.join(tmp, 'kaola-workflow', 'archive', 'issue-950');
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, 'workflow-state.md'),
      'status: closed\nstep: complete\nissue_iid: 950\n');
    closureAuditShim(binDir, [
      "const fs = require('fs');",
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issues view')) {",
      "  const f = " + JSON.stringify(viewCountFile) + ";",
      "  const prev = fs.existsSync(f) ? parseInt(fs.readFileSync(f, 'utf8'), 10) : 0;",
      "  fs.writeFileSync(f, String(prev + 1));",
      "  process.stdout.write('{\"state\":\"open\"}\\n');",
      "} else if (a.includes('issues list')) { process.stdout.write('[]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const result = runClosureAudit([], tmp, binDir);
    const viewCount = fs.existsSync(viewCountFile)
      ? parseInt(fs.readFileSync(viewCountFile, 'utf8'), 10) : 0;
    assert(viewCount === 1,
      'archive-only 950 must not be probed; expected exactly 1 issues-view (roadmap 920 only), got ' + viewCount);
    assert(!JSON.stringify(result.drift).includes('950'),
      'issue 950 must not appear in any drift field, got: ' + JSON.stringify(result.drift));
    console.log('testClosureAuditArchiveOnlyNotProbed: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditMirrorListsClosedIssues() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-mirror-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    plantClosureRoadmapSource(tmp, 903);
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issues view')) { process.stdout.write('{\"state\":\"closed\"}\\n'); }",
      "else if (a.includes('issues list')) { process.stdout.write('[]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const result = runClosureAudit([], tmp, binDir);
    assert(
      Array.isArray(result.drift.mirror_lists_closed_issues) && result.drift.mirror_lists_closed_issues.includes(903),
      'mirror_lists_closed_issues must include 903, got: ' + JSON.stringify(result.drift.mirror_lists_closed_issues)
    );
    assert.strictEqual(
      result.counts.mirror_lists_closed_issues, 1,
      'counts.mirror_lists_closed_issues must be 1, got: ' + result.counts.mirror_lists_closed_issues
    );
    console.log('testClosureAuditMirrorListsClosedIssues: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditStaleInProgressLabels() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-labels-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issues list')) { process.stdout.write('[{\"number\":99,\"iid\":99,\"title\":\"stale\",\"url\":\"http://x\",\"web_url\":\"http://x\"}]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const result = runClosureAudit([], tmp, binDir);
    const labels = result.drift.stale_in_progress_labels;
    assert(
      Array.isArray(labels) && labels.length === 1 && labels[0].number === 99,
      'stale_in_progress_labels must list issue 99, got: ' + JSON.stringify(labels)
    );
    assert.strictEqual(result.counts.stale_in_progress_labels, 1, 'counts.stale_in_progress_labels must be 1, got: ' + result.counts.stale_in_progress_labels);
    console.log('testClosureAuditStaleInProgressLabels: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditActiveFolderForClosedIssueReportsDirty() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-active-closed-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    writeState(tmp, 'issue-904', 904);
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issues view')) { process.stdout.write('{\"state\":\"closed\"}\\n'); }",
      "else if (a.includes('issues list')) { process.stdout.write('[]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const result = runClosureAudit([], tmp, binDir);
    const folders = result.drift.active_folder_for_closed_issue;
    assert(
      folders.length === 1 && folders[0].project === 'issue-904' && folders[0].issue_number === 904,
      'active_folder_for_closed_issue must report issue-904, got: ' + JSON.stringify(folders)
    );
    assert.strictEqual(folders[0].dirty, true, 'planted (uncommitted) active folder must be reported dirty:true, got: ' + folders[0].dirty);
    console.log('testClosureAuditActiveFolderForClosedIssueReportsDirty: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditUnarchivedPrFolderMergedLowercase() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-unarchived-pr-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    writeState(tmp, 'issue-905', 905);
    makePrSinkFolder(tmp, 'issue-905', 905);
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('pr view')) { process.stdout.write('{\"state\":\"merged\"}\\n'); }",
      "else if (a.includes('issues view')) { process.stdout.write('{\"state\":\"open\"}\\n'); }",
      "else if (a.includes('issues list')) { process.stdout.write('[]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const result = runClosureAudit([], tmp, binDir);
    const prFolders = result.drift.unarchived_pr_folders;
    assert(
      Array.isArray(prFolders) && prFolders.length === 1 && prFolders[0].project === 'issue-905' && prFolders[0].pr_state === 'merged',
      'unarchived_pr_folders must report merged PR folder issue-905 with lowercase pr_state "merged", got: ' + JSON.stringify(prFolders)
    );
    assert(prFolders[0].pr_url, 'unarchived_pr_folders entry must carry pr_url, got: ' + JSON.stringify(prFolders[0]));
    console.log('testClosureAuditUnarchivedPrFolderMergedLowercase: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditExecuteRepairsRoadmapAndLabels() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-exec-repair-')));
  const binDir = path.join(tmp, 'bin');
  const marker = path.join(tmp, 'label-removed.marker');
  try {
    initGitRepo(tmp);
    plantClosureRoadmapSource(tmp, 906);
    closureAuditShim(binDir, [
      "const fs = require('fs');",
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issues edit') && a.includes('--remove-labels')) { fs.writeFileSync(" + JSON.stringify(marker) + ", 'x'); process.stdout.write('{}\\n'); }",
      "else if (a.includes('issues view')) { process.stdout.write('{\"state\":\"closed\"}\\n'); }",
      "else if (a.includes('issues list')) { process.stdout.write('[{\"number\":906,\"iid\":906,\"title\":\"stale\",\"url\":\"http://x\",\"web_url\":\"http://x\"}]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const roadmapSource = path.join(tmp, 'kaola-workflow', '.roadmap', 'issue-906.md');
    assert(fs.existsSync(roadmapSource), 'precondition: roadmap source must exist before --execute');
    const result = runClosureAudit(['--execute'], tmp, binDir);
    assert.strictEqual(result.dry_run, false, '--execute must return dry_run:false, got: ' + result.dry_run);
    assert(
      result.repaired.roadmap_sources_removed.includes(906),
      'roadmap_sources_removed must include 906, got: ' + JSON.stringify(result.repaired.roadmap_sources_removed)
    );
    assert.strictEqual(result.repaired.roadmap_regenerated, true, 'roadmap_regenerated must be true, got: ' + result.repaired.roadmap_regenerated);
    assert(
      result.repaired.labels_removed.includes(906),
      'labels_removed must include 906, got: ' + JSON.stringify(result.repaired.labels_removed)
    );
    assert(!fs.existsSync(roadmapSource), '--execute must delete the stale roadmap source file');
    assert(fs.existsSync(marker), '--execute must call tea issues edit --remove-labels (marker missing)');
    assert(fs.existsSync(path.join(tmp, 'kaola-workflow', 'ROADMAP.md')), '--execute must regenerate ROADMAP.md');
    console.log('testClosureAuditExecuteRepairsRoadmapAndLabels: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditExecuteNeverTouchesActiveFolders() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-exec-safe-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    writeState(tmp, 'issue-907', 907);
    const folderDir = path.join(tmp, 'kaola-workflow', 'issue-907');
    assert(fs.existsSync(folderDir), 'precondition: active folder must exist');
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issues view')) { process.stdout.write('{\"state\":\"closed\"}\\n'); }",
      "else if (a.includes('issues list')) { process.stdout.write('[]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const result = runClosureAudit(['--execute'], tmp, binDir);
    assert.strictEqual(result.dry_run, false, '--execute must return dry_run:false');
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
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-dryrun-safe-')));
  const binDir = path.join(tmp, 'bin');
  const marker = path.join(tmp, 'label-removed.marker');
  try {
    initGitRepo(tmp);
    closureAuditShim(binDir, [
      "const fs = require('fs');",
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issues edit') && a.includes('--remove-labels')) { fs.writeFileSync(" + JSON.stringify(marker) + ", 'x'); process.stdout.write('{}\\n'); }",
      "else if (a.includes('issues list')) { process.stdout.write('[{\"number\":99,\"iid\":99,\"title\":\"stale\",\"url\":\"http://x\",\"web_url\":\"http://x\"}]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const result = runClosureAudit([], tmp, binDir);
    assert.strictEqual(result.dry_run, true, 'no --execute must return dry_run:true, got: ' + result.dry_run);
    assert(!fs.existsSync(marker), 'dry-run must NOT call tea issues edit --remove-labels (marker must not exist)');
    console.log('testClosureAuditDryRunNeverCallsRemoveLabel: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditStaleLabelsTimeout() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-stale-labels-timeout-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    closureAuditShim(binDir, ["process.kill(process.pid, 'SIGTERM'); setInterval(() => {}, 1 << 30);"]);
    const result = runClosureAudit([], tmp, binDir, probeTimeoutEnv());
    assert.strictEqual(
      result.drift.stale_in_progress_labels, 'skipped_timeout',
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
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-unresolved-closed-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    plantClosureRoadmapSource(tmp, 930);
    closureAuditShim(binDir, ["process.kill(process.pid, 'SIGTERM'); setInterval(() => {}, 1 << 30);"]);
    const result = runClosureAudit([], tmp, binDir, probeTimeoutEnv());
    const unresolved = result.drift.unresolved_closed_state;
    assert(
      Array.isArray(unresolved) && unresolved.includes(930),
      'unresolved_closed_state must include 930 when issue probe times out, got: ' + JSON.stringify(unresolved)
    );
    assert.strictEqual(
      result.counts.unresolved_closed_state, 1,
      'counts.unresolved_closed_state must be 1, got: ' + result.counts.unresolved_closed_state
    );
    console.log('testClosureAuditUnresolvedClosedState: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditProbeFailureUnresolved() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-probe-fail-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    plantClosureRoadmapSource(tmp, 940);
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issues view')) { process.exitCode = 1; process.stdout.write('not found\\n'); }",
      "else if (a.includes('issues list')) { process.stdout.write('[]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const result = runClosureAudit([], tmp, binDir);
    const unresolved = result.drift.unresolved_closed_state;
    assert(
      Array.isArray(unresolved) && unresolved.includes(940),
      'unresolved_closed_state must include 940 when issues view exits non-zero, got: ' + JSON.stringify(unresolved)
    );
    assert.strictEqual(result.counts.unresolved_closed_state, 1, 'counts.unresolved_closed_state must be 1, got: ' + result.counts.unresolved_closed_state);
    console.log('testClosureAuditProbeFailureUnresolved: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditTimeoutEnvInvalidFallsBack() {
  // NaN timeout causes execFileSync to throw before the shim answers.
  // With fallback=30000 (fix #2), probe succeeds and issue routes to closed_remote.
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-timeout-invalid-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    plantClosureRoadmapSource(tmp, 941);
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issues view')) { process.stdout.write('{\"state\":\"closed\"}\\n'); }",
      "else if (a.includes('issues list')) { process.stdout.write('[]\\n'); }",
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
  // Over-cap timeout (999999999999999999999) exceeds Number.MAX_SAFE_INTEGER.
  // Without the fix, Math.min is skipped and execFileSync receives timeout: 1e21,
  // which throws ERR_OUT_OF_RANGE. With clamping to 600000, probe succeeds.
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-timeout-overcap-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    plantClosureRoadmapSource(tmp, 941);
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issues view')) { process.stdout.write('{\"state\":\"closed\"}\\n'); }",
      "else if (a.includes('issues list')) { process.stdout.write('[]\\n'); }",
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
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-exec-det-timeout-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    closureAuditShim(binDir, ["process.kill(process.pid, 'SIGTERM'); setInterval(() => {}, 1 << 30);"]);
    const result = runClosureAudit(['--execute'], tmp, binDir, probeTimeoutEnv());
    assert.strictEqual(
      result.repaired.labels_skipped_reason, 'detection_timeout',
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
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-ca-pr-folder-timeout-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    writeState(tmp, 'issue-931', 931);
    makePrSinkFolder(tmp, 'issue-931', 931);
    closureAuditShim(binDir, ["process.kill(process.pid, 'SIGTERM'); setInterval(() => {}, 1 << 30);"]);
    const result = runClosureAudit([], tmp, binDir, probeTimeoutEnv());
    assert.strictEqual(
      result.drift.unarchived_pr_folders, 'skipped_timeout',
      'PR-folder hang must return "skipped_timeout", got: ' + JSON.stringify(result.drift.unarchived_pr_folders)
    );
    console.log('testClosureAuditPrFolderTimeout: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// --- Task 6: fail-open fix — forge.viewIssue throws outside OFFLINE must not silently pass ---
// #507 update: a generic/unknown forge error (no e.status/e.signal) is classified as transient
// ('killed' fallback) and retried, then surfaces as verdict:indeterminate (not target_unavailable).
// A clean-nonzero (e.status set) remains determinate → target_unavailable.

// testGiteaClassifierFailClosed: when viewIssue throws (transient) and OFFLINE is not set,
// classifyIssue must return verdict:indeterminate — #507 new behavior (was target_unavailable).
// A plain Error (no status/signal/code) → classifyFetchError fallback 'killed' → transient → retried 3x.
function testGiteaClassifierFailClosed() {
  const root = tempRoot('kw-gt-classifier-fail-');
  try {
    withForge({
      viewIssue() { throw new Error('network error'); } // no status/signal → transient → indeterminate
    }, () => {
      process.env.KAOLA_CLASSIFIER_BACKOFF_MS = '0';
      try {
        const result = classifier.classifyIssue(500, root);
        // #507: transient forge error → verdict:indeterminate + reasoning_class:classifier_error
        assert.strictEqual(result.verdict, 'indeterminate',
          '#507: classifyIssue transient forge error → verdict:indeterminate (got: ' + result.verdict + ')');
        assert.strictEqual(result.reasoning_class, 'classifier_error',
          '#507: indeterminate must carry reasoning_class:classifier_error, got: ' + result.reasoning_class);
      } finally {
        delete process.env.KAOLA_CLASSIFIER_BACKOFF_MS;
      }
    });
    console.log('testGiteaClassifierFailClosed: PASS');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// testGiteaOfflineBypassesFailClosed: when KAOLA_WORKFLOW_OFFLINE=1, a failing forge must not
// block classification — the offline code path must proceed normally (no network calls expected)
function testGiteaOfflineBypassesFailClosed() {
  const root = tempRoot('kw-gt-offline-bypass-fail-');
  try {
    const roadmapDir = path.join(root, 'kaola-workflow', '.roadmap');
    fs.mkdirSync(roadmapDir, { recursive: true });
    // Provide roadmap evidence so the classifier can acquire — required since #175 (no evidence → target_unverified)
    fs.writeFileSync(path.join(roadmapDir, 'issue-501.md'),
      'issue: #501\ntitle: offline-bypass-fixture\nstatus: open\nworkflow_project: issue-501\nnext_step: ready\n');
    // In OFFLINE mode classifyIssue uses localRoadmapIssue, not forge — so even a throwing forge
    // must not affect the result. We verify by running the subprocess with OFFLINE=1.
    const result = spawnSync(process.execPath, [classifierScript, 'classify', '--issue', '501'], {
      cwd: root, encoding: 'utf8',
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' })
    });
    assert.strictEqual(result.status, 0, 'OFFLINE classify must exit 0: ' + result.stderr);
    const out = JSON.parse(result.stdout.trim());
    assert.notStrictEqual(out.verdict, 'target_unavailable',
      'OFFLINE classify with roadmap entry must not return target_unavailable, got: ' + out.verdict);
    assert.strictEqual(out.verdict, 'green',
      'OFFLINE classify with roadmap entry must return green, got: ' + out.verdict);
    console.log('testGiteaOfflineBypassesFailClosed: PASS');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

testGiteaClassifierFailClosed();
testGiteaOfflineBypassesFailClosed();

testClosureAuditOfflineRemoteClassesSkipped();
testClosureAuditClosedRemoteRoadmapSource();
testClosureAuditArchiveClosedDrift();
testClosureAuditKeepOpenExclusion();
testClosureAuditDedupRoadmapAndArchive();
testClosureAuditArchiveOnlyNotProbed();
testClosureAuditMirrorListsClosedIssues();
testClosureAuditStaleInProgressLabels();
testClosureAuditActiveFolderForClosedIssueReportsDirty();
testClosureAuditUnarchivedPrFolderMergedLowercase();
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
testProbeTimeoutEnv();

function testGiteaProbeResidualEmptyExit0() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-probe-empty-')));
  const binDir = path.join(tmp, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  writeShimFiles(path.join(binDir, 'tea'), ["process.exit(0);"]); // empty stdout, exit 0
  const prevMock = process.env.KAOLA_TEA_MOCK_SCRIPT;
  process.env.KAOLA_TEA_MOCK_SCRIPT = path.join(binDir, 'tea.js');
  try {
    active.__resetIssueStateMemo(); // #362: isolate from earlier probe memo
    const r = active.probeIssueState(42);
    assert.strictEqual(r.state, 'unavailable',
      'empty exit-0 must fail-closed to unavailable, got: ' + r.state + ' (' + r.reason + ')');
    assert.strictEqual(r.reason, 'tea issue state unverified',
      'empty exit-0 reason mismatch, got: ' + r.reason);
    console.log('testGiteaProbeResidualEmptyExit0: PASSED');
  } finally {
    if (prevMock === undefined) delete process.env.KAOLA_TEA_MOCK_SCRIPT;
    else process.env.KAOLA_TEA_MOCK_SCRIPT = prevMock;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testGiteaProbeResidualNonJsonExit0() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-probe-nonjson-')));
  const binDir = path.join(tmp, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  writeShimFiles(path.join(binDir, 'tea'), ["process.stdout.write('rate limit exceeded\\n');"]); // non-JSON, exit 0
  const prevMock = process.env.KAOLA_TEA_MOCK_SCRIPT;
  process.env.KAOLA_TEA_MOCK_SCRIPT = path.join(binDir, 'tea.js');
  try {
    active.__resetIssueStateMemo(); // #362: isolate from earlier probe memo
    const r = active.probeIssueState(43);
    assert.strictEqual(r.state, 'unavailable',
      'non-JSON exit-0 must fail-closed to unavailable, got: ' + r.state + ' (' + r.reason + ')');
    assert.strictEqual(r.reason, 'tea issue state unverified',
      'non-JSON exit-0 reason mismatch, got: ' + r.reason);
    console.log('testGiteaProbeResidualNonJsonExit0: PASSED');
  } finally {
    if (prevMock === undefined) delete process.env.KAOLA_TEA_MOCK_SCRIPT;
    else process.env.KAOLA_TEA_MOCK_SCRIPT = prevMock;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

testGiteaProbeResidualEmptyExit0();
testGiteaProbeResidualNonJsonExit0();

// issue #230 / #510 / #519: classifyIssue / cmdClassify must fail-closed on a degraded exit-0 forge
// response. #510 RECONCILE: under the corrected taxonomy an exit-0 unparseable/empty body is a
// TRANSIENT fault (the _st guard maps state:'unknown' → indeterminate). It is no longer a determinate
// target_unavailable — a malformed/empty body is an infra-degradation signal, not a genuine "issue
// gone". (parseJson(raw,{}) SWALLOWS the body to {} → state:'unknown'; the _st guard surfaces it.)

function testGiteaClassifyIssueResidualEmptyExit0() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-classify-empty-')));
  const binDir = path.join(tmp, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  writeShimFiles(path.join(binDir, 'tea'), ['process.exit(0);']);
  const prevMock = process.env.KAOLA_TEA_MOCK_SCRIPT;
  const prevHome = process.env.HOME;
  const prevUserProfile = process.env.USERPROFILE;
  // Fresh temp HOME so readOrCreateConfig writes 'auto' default and does not bypass classifier.
  const tempHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-classify-empty-home-')));
  process.env.KAOLA_TEA_MOCK_SCRIPT = path.join(binDir, 'tea.js');
  process.env.HOME = tempHome;
  process.env.USERPROFILE = tempHome;
  try {
    const result = classifier.classifyIssue(230, tmp);
    assert.strictEqual(result.verdict, 'indeterminate',
      '#510: empty exit-0 classifyIssue must return indeterminate (transient), got: ' + result.verdict + ' (' + result.reasoning + ')');
    assert.strictEqual(result.reasoning_class, 'classifier_error',
      '#510: empty exit-0 indeterminate must carry reasoning_class:classifier_error, got: ' + result.reasoning_class);
    console.log('testGiteaClassifyIssueResidualEmptyExit0: PASSED');
  } finally {
    if (prevMock === undefined) delete process.env.KAOLA_TEA_MOCK_SCRIPT;
    else process.env.KAOLA_TEA_MOCK_SCRIPT = prevMock;
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    if (prevUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = prevUserProfile;
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

function testGiteaClassifyIssueResidualNonJsonExit0() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-classify-nonjson-')));
  const binDir = path.join(tmp, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  writeShimFiles(path.join(binDir, 'tea'), ["process.stdout.write('rate limit exceeded\\n');"]);
  const prevMock = process.env.KAOLA_TEA_MOCK_SCRIPT;
  const prevHome = process.env.HOME;
  const prevUserProfile = process.env.USERPROFILE;
  const tempHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-classify-nonjson-home-')));
  process.env.KAOLA_TEA_MOCK_SCRIPT = path.join(binDir, 'tea.js');
  process.env.HOME = tempHome;
  process.env.USERPROFILE = tempHome;
  try {
    const result = classifier.classifyIssue(230, tmp);
    assert.strictEqual(result.verdict, 'indeterminate',
      '#510: non-JSON exit-0 classifyIssue must return indeterminate (transient), got: ' + result.verdict + ' (' + result.reasoning + ')');
    assert.strictEqual(result.reasoning_class, 'classifier_error',
      '#510: non-JSON exit-0 indeterminate must carry reasoning_class:classifier_error, got: ' + result.reasoning_class);
    console.log('testGiteaClassifyIssueResidualNonJsonExit0: PASSED');
  } finally {
    if (prevMock === undefined) delete process.env.KAOLA_TEA_MOCK_SCRIPT;
    else process.env.KAOLA_TEA_MOCK_SCRIPT = prevMock;
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    if (prevUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = prevUserProfile;
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

function testGiteaCmdClassifyResidualEmptyExit0() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-cmdclassify-empty-')));
  const binDir = path.join(tmp, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  writeShimFiles(path.join(binDir, 'tea'), ['process.exit(0);']);
  const tempHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-cmdclassify-empty-home-')));
  try {
    const result = spawnSync(process.execPath, [classifierScript, 'classify', '--issue', '230'], {
      cwd: tmp,
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: tempHome,
        USERPROFILE: tempHome,
        KAOLA_TEA_MOCK_SCRIPT: path.join(binDir, 'tea.js')
      }
    });
    assert.strictEqual(result.status, 0,
      'cmdClassify empty exit-0 must exit 0, got: ' + result.status + ' stderr: ' + result.stderr);
    const out = JSON.parse(result.stdout.trim());
    assert.strictEqual(out.verdict, 'indeterminate',
      '#510: cmdClassify empty exit-0 must return indeterminate (transient), got: ' + out.verdict + ' (' + out.reasoning + ')');
    console.log('testGiteaCmdClassifyResidualEmptyExit0: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

function testGiteaCmdClassifyResidualNonJsonExit0() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-cmdclassify-nonjson-')));
  const binDir = path.join(tmp, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  writeShimFiles(path.join(binDir, 'tea'), ["process.stdout.write('rate limit exceeded\\n');"]);
  const tempHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-cmdclassify-nonjson-home-')));
  try {
    const result = spawnSync(process.execPath, [classifierScript, 'classify', '--issue', '230'], {
      cwd: tmp,
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: tempHome,
        USERPROFILE: tempHome,
        KAOLA_TEA_MOCK_SCRIPT: path.join(binDir, 'tea.js')
      }
    });
    assert.strictEqual(result.status, 0,
      'cmdClassify non-JSON exit-0 must exit 0, got: ' + result.status + ' stderr: ' + result.stderr);
    const out = JSON.parse(result.stdout.trim());
    assert.strictEqual(out.verdict, 'indeterminate',
      '#510: cmdClassify non-JSON exit-0 must return indeterminate (transient), got: ' + out.verdict + ' (' + out.reasoning + ')');
    console.log('testGiteaCmdClassifyResidualNonJsonExit0: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Issue #264 — AC9 parity: worktreePathFor hidden-local-path + legacy-cleanup
// Feature-detecting tests: assert OLD behavior until impl-claim lands the path-
// split + cmdLegacyWorktreeCleanup into kaola-gitea-workflow-claim.js.
// When impl-claim lands, SIGNAL = typeof claim.legacySiblingWorktreePathFor === 'function'
// activates the strict new-path assertions (RED-pending forward dependency on impl-claim).
// ---------------------------------------------------------------------------

// Test #11a (§F): worktreePathFor hidden-local-path assertion.
// SIGNAL: typeof claim.legacySiblingWorktreePathFor === 'function'
// If present (impl-claim landed): assert worktreePathFor returns a path under <root>/.kw/worktrees/
// Else (not yet landed): assert worktreePathFor returns OLD sibling path (parent/<repo>.kw/<project>)
function testGiteaWorktreePathForHiddenLocal() {
  const root = tempRoot('kw-gt-264-wtpath-');
  try {
    initGitRepo(root);
    const project = 'issue-264-wtpath-test';
    const result = claim.worktreePathFor(root, project);
    const hasNewApi = typeof claim.legacySiblingWorktreePathFor === 'function';
    if (hasNewApi) {
      // impl-claim landed: new path is under <root>/.kw/worktrees/<project>
      assert(
        result.includes(path.join('.kw', 'worktrees', project)),
        'testGiteaWorktreePathForHiddenLocal: expected path under .kw/worktrees/' + project + ', got: ' + result
      );
      assert(
        !result.includes(path.join('.kw', project)) || result.includes(path.join('worktrees', project)),
        'testGiteaWorktreePathForHiddenLocal: path must not be legacy sibling, got: ' + result
      );
    } else {
      // impl-claim not yet landed: old sibling path — parent/<repo>.kw/<project>
      const endsWithKwProject = result.endsWith(path.sep + project) &&
        result.includes('.kw' + path.sep + project) &&
        !result.includes(path.join('.kw', 'worktrees'));
      assert(
        endsWithKwProject,
        'testGiteaWorktreePathForHiddenLocal: expected OLD sibling path ending in .kw/<project>, got: ' + result
      );
    }
    console.log('testGiteaWorktreePathForHiddenLocal: PASSED (hasNewApi=' + hasNewApi + ')');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Test #11b (§F): legacy-worktree-cleanup dry-run assertion.
// SIGNAL: legacy-worktree-cleanup subcommand recognized (exit 0 + JSON with dry_run field).
// If recognized (impl-claim landed): assert dry-run reports legacy path in would_remove, removes nothing.
// Else (not yet landed): SKIP with a SKIPPED line, keeping the walkthrough green.
function testGiteaLegacyWorktreeCleanupDryRun() {
  const root = tempRoot('kw-gt-264-legacy-cleanup-');
  try {
    initGitRepo(root);
    // Probe: invoke legacy-worktree-cleanup without --execute on an offline repo
    const probe = spawnSync(process.execPath, [claimScript, 'legacy-worktree-cleanup'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
    });
    // Recognized = exit 0 AND stdout is valid JSON containing dry_run key
    let recognized = false;
    let probeJson = null;
    if (probe.status === 0) {
      try {
        probeJson = JSON.parse(probe.stdout.trim());
        recognized = probeJson !== null && typeof probeJson === 'object' && 'dry_run' in probeJson;
      } catch (_) { /* not JSON */ }
    }
    if (!recognized) {
      // impl-claim not yet landed; subcommand unknown — skip gracefully
      console.log('testGiteaLegacyWorktreeCleanupDryRun: SKIPPED (legacy-worktree-cleanup not yet recognized — lands in impl-claim)');
      return;
    }
    // impl-claim landed: build a legacy-path worktree and assert dry-run reports it
    const mainRoot = fs.realpathSync(root);
    const legacyContainer = path.dirname(mainRoot) + path.sep + path.basename(mainRoot) + '.kw';
    const legacyWt = path.join(legacyContainer, 'issue-264-legacy');
    fs.mkdirSync(legacyWt, { recursive: true });
    const addResult = spawnSync('git', ['worktree', 'add', '-b', 'workflow/gitea-issue-264-legacy', '--', legacyWt, 'HEAD'], {
      cwd: root, encoding: 'utf8'
    });
    assert.strictEqual(addResult.status, 0, 'git worktree add failed: ' + addResult.stderr);
    try {
      const dryRun = spawnSync(process.execPath, [claimScript, 'legacy-worktree-cleanup'], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
      });
      assert.strictEqual(dryRun.status, 0, 'legacy-worktree-cleanup dry-run must exit 0, got: ' + dryRun.status + ' stderr: ' + dryRun.stderr);
      const out = JSON.parse(dryRun.stdout.trim());
      assert.strictEqual(out.dry_run, true, 'dry-run must report dry_run:true, got: ' + JSON.stringify(out));
      assert(Array.isArray(out.would_remove) && out.would_remove.some(p => JSON.stringify(p).includes('issue-264-legacy')),
        'dry-run must report legacy worktree in would_remove, got: ' + JSON.stringify(out));
      assert(fs.existsSync(legacyWt), 'dry-run must not remove the worktree');
      assert(!('would_delete_branch' in out),
        'Option B: legacy-worktree-cleanup dry-run must NOT emit would_delete_branch, got: ' + JSON.stringify(out));
      console.log('testGiteaLegacyWorktreeCleanupDryRun: PASSED');
    } finally {
      spawnSync('git', ['worktree', 'remove', '--force', legacyWt], { cwd: root, encoding: 'utf8' });
      try { fs.rmSync(legacyContainer, { recursive: true, force: true }); } catch (_) {}
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

testGiteaClassifyIssueResidualEmptyExit0();
testGiteaClassifyIssueResidualNonJsonExit0();
testGiteaCmdClassifyResidualEmptyExit0();
testGiteaCmdClassifyResidualNonJsonExit0();
testWatchPrAbandonedClosureInvariantsClean();
testGiteaClaimReclaimsStatelessOrphanDir();
testGiteaPatchBranchGuards();
testGiteaWorktreePathForHiddenLocal();
testGiteaLegacyWorktreeCleanupDryRun();

// ---------------------------------------------------------------------------
// AC-7 (#266): RED-first regression tests for the 3 new scripts (gitea edition).
// Cases 1-2 (stale config, missing profiles), Case 3 (task-mirror),
// Case 4 (compact-resume), Case 5 (no-silent-inline-fallback).
// ---------------------------------------------------------------------------

const giteaPreflightScript     = path.join(giteaPluginRoot, 'scripts', 'kaola-workflow-codex-preflight.js');
const giteaTaskMirrorScript    = path.join(giteaPluginRoot, 'scripts', 'kaola-gitea-workflow-task-mirror.js');
const giteaCompactResumeScript = path.join(giteaPluginRoot, 'scripts', 'kaola-gitea-workflow-codex-compact-resume.js');

// Shared frozen plan fixture (consistent across editions)
const GITEA_FIXTURE_PLAN_HASH = 'f59d3465f4ca7584eba5f7d04446bf2914e019ba1aa4511c5a25f4e65a80497e';
const GITEA_FIXTURE_PLAN = [
  '# Workflow Plan',
  `<!-- plan_hash: ${GITEA_FIXTURE_PLAN_HASH} -->`,
  '',
  '## Meta',
  'labels: enhancement',
  '',
  '## Nodes',
  '',
  '| id | role | depends_on | declared_write_set | cardinality | shape |',
  '|---|---|---|---|---|---|',
  '| explore | code-explorer | — | — | 1 | sequence |',
  '| impl | implementer | explore | src/x.js | 1 | sequence |',
  '| gate | code-reviewer | impl | — | 1 | sequence |',
  '| done | finalize | gate | — | 1 | sequence |',
  '',
  '## Node Ledger',
  '',
  '| id | status |',
  '|---|---|',
  '| explore | complete |',
  '| impl | in_progress |',
  '| gate | pending |',
  '| done | n/a |',
  'consent_halt: pending',
  ''
].join('\n');

// Case 1 + Case 2 + Case 5: preflight tests (stale config, missing profiles, no-silent-fallback)
function testGiteaPreflight266() {
  // #571: hermetic-HOME retrofit — spawn each preflight call with an empty temp HOME so the
  // new global-first short-circuit finds no ~/.codex and falls through to project-scope assertions.
  const emptyHomeGt = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-266-hermetic-home-'));
  const hEnvGt = { ...process.env, HOME: emptyHomeGt, USERPROFILE: emptyHomeGt };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-266-preflight-'));
  try {
    // Install all 16 profiles into the fixture (14 base + synthesizer #463 + metric-optimizer #634)
    const installResult = spawnSync(process.execPath, [installProfilesScript, root], {
      cwd: giteaPluginRoot, encoding: 'utf8'
    });
    if (installResult.error) throw installResult.error;
    assert.ok(installResult.status === 0, 'gitea preflight fixture install failed: ' + installResult.stderr);

    // Project-scoped Codex layers are ignored until the project is explicitly trusted.
    const trustRequiredResult = spawnSync(process.execPath,
      [giteaPreflightScript, '--project-root', root, '--no-autofix', '--json'],
      { encoding: 'utf8', env: hEnvGt });
    assert.strictEqual(trustRequiredResult.status, 4,
      '#266 gt trust guard: unknown project trust must exit 4, got ' + trustRequiredResult.status
        + '\n' + trustRequiredResult.stdout);
    const trustRequiredJson = JSON.parse(trustRequiredResult.stdout);
    assert.strictEqual(trustRequiredJson.status, 'project_trust_required',
      '#266 gt trust guard: expected project_trust_required, got ' + trustRequiredJson.status);
    assert.strictEqual(trustRequiredJson.project_trust, 'unknown',
      '#266 gt trust guard: expected unknown trust, got ' + trustRequiredJson.project_trust);
    trustCodexProject(emptyHomeGt, root);

    // --- GREEN: fresh fixture must pass preflight ---
    const freshResult = spawnSync(process.execPath,
      [giteaPreflightScript, '--project-root', root, '--no-autofix', '--json'],
      { encoding: 'utf8', env: hEnvGt });
    assert.strictEqual(freshResult.status, 0,
      '#266 gt case1 RED-discriminator: fresh fixture must exit 0, got ' + freshResult.status + '\n' + freshResult.stdout);
    const freshJson = JSON.parse(freshResult.stdout);
        assert.strictEqual(freshJson.status, 'ok',
          '#266 gt case1 RED-discriminator: fresh fixture must return status:ok, got ' + freshJson.status);

        // --- Case 1 RED: remove a role from the managed block → config_stale ---
        const configPath = path.join(root, '.codex', 'config.toml');
        const origConfig = fs.readFileSync(configPath, 'utf8');
        const managedConfigWithoutFeatures = origConfig.replace('[features]\nmulti_agent = true\n\n', '');
        function configWithFeatures(lines) {
          return '[features]\n' + lines.join('\n') + '\n\n' + managedConfigWithoutFeatures;
        }
        function configWithFeatureLine(line) {
          return configWithFeatures(['multi_agent = true', line]);
        }
        const roleSafeV2Inline = 'multi_agent_v2 = { enabled = true, tool_namespace = "agents", hide_spawn_agent_metadata = false, non_code_mode_only = true }';
        const roleSafeV2Table = '[features.multi_agent_v2]\nenabled = true\ntool_namespace = "agents"\nhide_spawn_agent_metadata = false\nnon_code_mode_only = true';
        function assertDispatchModeForConfig(body, expectedMode, label, checkDoctor) {
          fs.writeFileSync(configPath, body);
          const result = spawnSync(process.execPath,
            [giteaPreflightScript, '--project-root', root, '--no-autofix', '--json'],
            { encoding: 'utf8', env: hEnvGt });
          assert.strictEqual(result.status, 0,
            label + ': preflight must pass, got ' + result.status + '\n' + result.stdout);
          const json = JSON.parse(result.stdout);
          assert.strictEqual(json.dispatch_mode, expectedMode,
            label + ': dispatch_mode');
          assert.strictEqual(json.multi_agent_v2_enabled, expectedMode === 'v2-task-name',
            label + ': multi_agent_v2_enabled');
          if (checkDoctor) {
            const doctorResult = spawnSync(process.execPath,
              [giteaPreflightScript, '--doctor', '--project-root', root, '--json'],
              { encoding: 'utf8', env: hEnvGt });
            const doctorJson = JSON.parse(doctorResult.stdout);
            const projectScope = doctorJson.scopes.find(s => s.scope === 'project');
            assert.ok(projectScope && projectScope.dispatch_mode === expectedMode,
              label + ': doctor project scope expected ' + expectedMode + ', got ' + JSON.stringify(projectScope));
          }
        }
        assertDispatchModeForConfig(origConfig, 'v1-thread-id', '#584 gt no multi_agent_v2 key', false);
        assertDispatchModeForConfig(configWithFeatureLine(roleSafeV2Inline), 'v2-task-name', '#650 gt role-safe inline', true);
        assertDispatchModeForConfig(configWithFeatureLine('multi_agent_v2 = false'), 'v1-thread-id', '#584 gt boolean false', false);
        assertDispatchModeForConfig(configWithFeatureLine(roleSafeV2Inline), 'v2-task-name', '#650 gt inline role transport ready', true);
        assertDispatchModeForConfig(configWithFeatureLine('multi_agent_v2 = { enabled = false, hide_spawn_agent_metadata = false, non_code_mode_only = false }'), 'v1-thread-id', '#584 gt inline object enabled false', false);
        assertDispatchModeForConfig(configWithFeatureLine(roleSafeV2Table), 'v2-task-name', '#650 gt table role transport ready', true);
        assertDispatchModeForConfig(configWithFeatureLine('[features.multi_agent_v2]\nenabled = false'), 'v1-thread-id', '#584 gt table enabled false', false);
        assertDispatchModeForConfig(configWithFeatureLine('["features.multi_agent_v2"]\nenabled = true'), 'v1-thread-id', '#647 gt basic quoted literal dotted table must not enable v2', false);
        assertDispatchModeForConfig(configWithFeatureLine('[\'features.multi_agent_v2\']\nenabled = true'), 'v1-thread-id', '#647 gt literal quoted dotted table must not enable v2', false);
        assertDispatchModeForConfig(configWithFeatureLine('[[features.multi_agent_v2]]\nenabled = true'), 'v1-thread-id', '#647 R2 gt array-of-table dotted v2 table must not enable v2', false);
        assertDispatchModeForConfig(configWithFeatureLine('[[features."multi_agent_v2"]]\nenabled = true'), 'v1-thread-id', '#647 R2 gt quoted-segment array-of-table v2 table must not enable v2', false);
        assertDispatchModeForConfig(
          configWithFeatureLine(roleSafeV2Table + '\n\n[projects."/tmp/kaola-project"]\nenabled = true\n\n[plugins."sample@test"]\nenabled = true'),
          'v2-task-name', '#647 gt quoted project/plugin tables after dotted v2 table reset parser state', true);
        assertDispatchModeForConfig(
          configWithFeatureLine(roleSafeV2Table + '\n\n[[plugins.\'sample@test\'.mcp_servers]]\nenabled = true'),
          'v2-task-name', '#647 gt array-of-table literal quoted segment after dotted v2 table resets parser state', false);
        assertDispatchModeForConfig(
          configWithFeatureLine(roleSafeV2Table + '\n\n[[features.multi_agent_v2]]\nenabled = false'),
          'v2-task-name', '#647 R2 gt exact array-of-table after dotted v2 table resets parser state', false);
        assertDispatchModeForConfig('[notice]\nsuppress_unstable_features_warning = true\n\n' + origConfig, 'v1-thread-id', '#584 gt warning suppression only', false);
        assertDispatchModeForConfig('multi_agent_v2 = true\n\n' + origConfig, 'v1-thread-id', '#584 gt top-level key ignored', false);
        assertDispatchModeForConfig(configWithFeatureLine('multi_agent_v2 = { hide_spawn_agent_metadata = false }'), 'v1-thread-id', '#584 gt inline object missing enabled fails closed', false);

        // #598 AC2 gt: effort-gated MultiAgentMode dispatch-POSTURE (distinct from dispatch_mode
        // above — posture reflects whether the runtime will REFUSE a spawn, not just whether the
        // tools are exposed). ATTESTATION-STYLE / NON-FATAL: every case must still exit 0.
        function assertDispatchPostureForConfig(body, expectedPosture, label) {
          fs.writeFileSync(configPath, body);
          const result = spawnSync(process.execPath,
            [giteaPreflightScript, '--project-root', root, '--no-autofix', '--json'],
            { encoding: 'utf8', env: hEnvGt });
          assert.strictEqual(result.status, 0,
            label + ': dispatch-posture WARN must never fail preflight, got ' + result.status + '\n' + result.stdout);
          const json = JSON.parse(result.stdout);
          assert.strictEqual(json.dispatch_posture, expectedPosture,
            label + ': expected dispatch_posture ' + expectedPosture + ', got ' + json.dispatch_posture);
          assert.strictEqual(json.dispatch_posture_warning === null, expectedPosture === 'proactive',
            label + ': dispatch_posture_warning must be null iff proactive, got ' + JSON.stringify(json.dispatch_posture_warning));
        }
        assertDispatchPostureForConfig(origConfig, 'explicitRequestOnly', '#598 gt base fixture (multi_agent=true, no effort)');
        assertDispatchPostureForConfig(configWithFeatures(['multi_agent = false']), 'none',
          '#598 gt multi_agent=false, no multi_agent_v2 -> none');
        assertDispatchPostureForConfig('model_reasoning_effort = "ultra"\n\n' + origConfig, 'proactive',
          '#598 gt effort=ultra with multi_agent=true -> proactive');
        assertDispatchPostureForConfig('model_reasoning_effort = "xhigh"\n\n' + origConfig, 'explicitRequestOnly',
          '#598 gt effort=xhigh (below ultra) stays explicitRequestOnly');
        assertDispatchPostureForConfig(configWithFeatureLine(roleSafeV2Inline), 'explicitRequestOnly',
          '#598 gt multi_agent_v2=true, no effort -> explicitRequestOnly');
        assertDispatchPostureForConfig(
          configWithFeatureLine('model_reasoning_effort = "ultra"'),
          'explicitRequestOnly', '#598 gt effort AFTER the first [table] is not a valid TOML root key -> ignored');

        fs.writeFileSync(configPath, origConfig);
        const staleConfig = origConfig.replace('[agents.workflow-planner]', '[agents.STALE-workflow-planner]');
        fs.writeFileSync(configPath, staleConfig);

    const staleResult = spawnSync(process.execPath,
      [giteaPreflightScript, '--project-root', root, '--no-autofix', '--json'],
      { encoding: 'utf8', env: hEnvGt });
    assert.notStrictEqual(staleResult.status, 0,
      '#266 gt case1: stale managed block must cause non-zero exit, got ' + staleResult.status);
    const staleJson = JSON.parse(staleResult.stdout);
    assert.strictEqual(staleJson.status, 'config_stale',
      '#266 gt case1: must return config_stale, got ' + staleJson.status);
    assert.ok(Array.isArray(staleJson.missing_roles) && staleJson.missing_roles.includes('workflow-planner'),
      '#266 gt case1: missing_roles must include workflow-planner, got ' + JSON.stringify(staleJson.missing_roles));

    // --- Case 1 GREEN (autofix): ---
    const autofixRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-266-preflight-autofix-'));
    try {
      trustCodexProject(emptyHomeGt, autofixRoot);
      fs.mkdirSync(path.join(autofixRoot, '.codex', 'agents', 'kaola-workflow'), { recursive: true });
      fs.writeFileSync(path.join(autofixRoot, '.codex', 'config.toml'), staleConfig);
      const srcAgentsDir = path.join(root, '.codex', 'agents', 'kaola-workflow');
      const dstAgentsDir = path.join(autofixRoot, '.codex', 'agents', 'kaola-workflow');
      for (const f of fs.readdirSync(srcAgentsDir)) {
        fs.copyFileSync(path.join(srcAgentsDir, f), path.join(dstAgentsDir, f));
      }
      const autofixResult = spawnSync(process.execPath,
        [giteaPreflightScript, '--project-root', autofixRoot, '--json'],
        { encoding: 'utf8', env: hEnvGt });
      assert.strictEqual(autofixResult.status, 0,
        '#266 gt case1 autofix: must exit 0 after repair, got ' + autofixResult.status + '\n' + autofixResult.stdout);
      const autofixJson = JSON.parse(autofixResult.stdout);
      assert.ok(autofixJson.status === 'ok' && autofixJson.autofixed === true,
        '#266 gt case1 autofix: must return ok+autofixed:true, got ' + JSON.stringify(autofixJson));
    } finally {
      fs.rmSync(autofixRoot, { recursive: true, force: true });
    }

    // Restore config for case 2
    fs.writeFileSync(configPath, origConfig);

    // --- Case 2 RED: remove a profile toml file → profiles_missing ---
    const wpToml = path.join(root, '.codex', 'agents', 'kaola-workflow', 'workflow-planner.toml');
    const savedToml = fs.readFileSync(wpToml);
    fs.unlinkSync(wpToml);

    const missingResult = spawnSync(process.execPath,
      [giteaPreflightScript, '--project-root', root, '--no-autofix', '--json'],
      { encoding: 'utf8', env: hEnvGt });
    assert.notStrictEqual(missingResult.status, 0,
      '#266 gt case2: missing profile toml must cause non-zero exit, got ' + missingResult.status);
    const missingJson = JSON.parse(missingResult.stdout);
    assert.strictEqual(missingJson.status, 'profiles_missing',
      '#266 gt case2: must return profiles_missing, got ' + missingJson.status);
    assert.ok(Array.isArray(missingJson.missing_roles) && missingJson.missing_roles.includes('workflow-planner'),
      '#266 gt case2: missing_roles must include workflow-planner');

    // Restore toml
    fs.writeFileSync(wpToml, savedToml);

    // --- Case 2 GREEN: restored → fresh again ---
    const restoredResult = spawnSync(process.execPath,
      [giteaPreflightScript, '--project-root', root, '--no-autofix', '--json'],
      { encoding: 'utf8', env: hEnvGt });
    assert.strictEqual(restoredResult.status, 0,
      '#266 gt case2 GREEN: restored fixture must pass, got ' + restoredResult.status);

    // --- Case 5 RED: absent profile → REFUSES, stdout must NOT contain subagent-invoked or local-fallback ---
    fs.unlinkSync(wpToml);
    const refusalResult = spawnSync(process.execPath,
      [giteaPreflightScript, '--project-root', root, '--no-autofix', '--json'],
      { encoding: 'utf8', env: hEnvGt });
    assert.notStrictEqual(refusalResult.status, 0,
      '#266 gt case5 RED: absent profile must cause non-zero exit, got ' + refusalResult.status);
    assert.ok(!refusalResult.stdout.includes('subagent-invoked'),
      '#266 gt case5: preflight refusal must NOT emit subagent-invoked, got: ' + refusalResult.stdout);
    assert.ok(!refusalResult.stdout.includes('local-fallback'),
      '#266 gt case5: preflight refusal must NOT emit local-fallback, got: ' + refusalResult.stdout);
    // Restore
    fs.writeFileSync(wpToml, savedToml);

    console.log('testGiteaPreflight266 (#266 cases 1,2,5): PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(emptyHomeGt, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// #598 AC1 gt: installer dispatch-posture REPORT. ATTESTATION-STYLE / NON-FATAL — the
// installer must REPORT the effective effort-gated MultiAgentMode posture and, when
// non-proactive, the exact remediation, and this must NEVER change the install's own
// exit code. Also asserts stdout still ENDS with `status: ok` (#332 AC3 invariant).
// ---------------------------------------------------------------------------
function testGiteaDispatchPosture598() {
  const postureHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-598-posture-home-'));
  const postureProj = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-598-posture-proj-'));
  try {
    const freshEnv = { ...process.env, HOME: postureHome };
    const fresh = spawnSync(process.execPath, [installProfilesScript, postureProj],
      { cwd: giteaPluginRoot, encoding: 'utf8', env: freshEnv });
    assert.strictEqual(fresh.status, 0, '#598 gt AC1: fresh install must exit 0: ' + fresh.stderr);
    assert.strictEqual(fresh.stdout.trim().split('\n').pop(), 'status: ok',
      '#598 gt AC1: existing #332 AC3 "stdout ends with status: ok" invariant must be preserved: ' + fresh.stdout);
    assert.ok(/Kaola-Workflow Codex dispatch posture: explicitRequestOnly/.test(fresh.stdout),
      '#598 gt AC1: fresh install (multi_agent=true, no effort) must report explicitRequestOnly: ' + fresh.stdout);
    assert.ok(/model_reasoning_effort = "ultra"/.test(fresh.stdout),
      '#598 gt AC1: non-proactive posture must print the exact remediation: ' + fresh.stdout);
    assert.ok(/0\.142\.5/.test(fresh.stdout), '#598 gt AC1/AC2: report must carry the version-guard note: ' + fresh.stdout);
    // #601: the remediation must LEAD with the always-available, always-documented in-session
    // ask, before the effort-gated (undocumented/server-gated) ultra clause.
    const askIdx601 = fresh.stdout.indexOf('explicitly ask for sub-agents');
    const ultraIdx601 = fresh.stdout.indexOf('model_reasoning_effort = "ultra"');
    assert.ok(askIdx601 !== -1 && ultraIdx601 !== -1 && askIdx601 < ultraIdx601,
      '#601 gt: remediation must lead with the in-session ask before the effort-gated ultra clause: ' + fresh.stdout);

    const postureConfigPath = path.join(postureProj, '.codex', 'config.toml');
    const beforeUltra = fs.readFileSync(postureConfigPath, 'utf8');
    fs.writeFileSync(postureConfigPath, 'model_reasoning_effort = "ultra"\n\n' + beforeUltra);
    const reinstalled = spawnSync(process.execPath, [installProfilesScript, postureProj],
      { cwd: giteaPluginRoot, encoding: 'utf8', env: freshEnv });
    assert.strictEqual(reinstalled.status, 0, '#598 gt AC1: re-install with effort=ultra must still exit 0: ' + reinstalled.stderr);
    assert.ok(/Kaola-Workflow Codex dispatch posture: proactive/.test(reinstalled.stdout),
      '#598 gt AC1: effort=ultra must report proactive posture: ' + reinstalled.stdout);
    assert.ok(!/refuse sub-agent spawns/.test(reinstalled.stdout),
      '#598 gt AC1: a proactive posture must NOT print the non-proactive remediation: ' + reinstalled.stdout);

    console.log('testGiteaDispatchPosture598 (#598 AC1 installer report): PASSED');
  } finally {
    fs.rmSync(postureProj, { recursive: true, force: true });
    fs.rmSync(postureHome, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// #571: global-first preflight gate — install once to ~/.codex, all repos pass (Gitea edition).
// ---------------------------------------------------------------------------
function testGiteaPreflight571() {
  // --- Test (a): global-only install ⇒ gate PASSES (scope:'global') ---
  // RED-first discriminator: old gate checks project scope only → exit 1 (RED); GREEN after gate change.
  const tempHome571a = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-571a-home-'));
  try {
    const env571a = { ...process.env, HOME: tempHome571a, USERPROFILE: tempHome571a };
    const setupInstall = spawnSync(process.execPath, [installProfilesScript, tempHome571a], {
      cwd: giteaPluginRoot, encoding: 'utf8', env: env571a
    });
    assert.strictEqual(setupInstall.status, 0,
      '#571 gt test(a): positional-form install to tempHome must exit 0: ' + setupInstall.stderr);

    const emptyProject571a = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-571a-proj-'));
    try {
      const r = spawnSync(process.execPath,
        [giteaPreflightScript, '--project-root', emptyProject571a, '--no-autofix', '--json'],
        { encoding: 'utf8', env: env571a });
      assert.strictEqual(r.status, 0,
        '#571 gt test(a) RED-discriminator: global-only install must pass preflight, got ' +
        r.status + '\n' + r.stdout);
      const j = JSON.parse(r.stdout);
      assert.strictEqual(j.status, 'ok', '#571 gt test(a): status must be ok, got ' + j.status);
      assert.strictEqual(j.scope, 'global', '#571 gt test(a): scope must be global, got ' + j.scope);
      assert.ok(!fs.existsSync(path.join(emptyProject571a, '.codex')),
        '#571 gt test(a): no project .codex must be created when global scope satisfies the gate');
    } finally {
      fs.rmSync(emptyProject571a, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(tempHome571a, { recursive: true, force: true });
  }

  // --- Test (b): neither scope valid ⇒ FAILS CLOSED ---
  const tempHome571b = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-571b-home-'));
  const emptyProject571b = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-571b-proj-'));
  try {
    const r = spawnSync(process.execPath,
      [giteaPreflightScript, '--project-root', emptyProject571b, '--no-autofix', '--json'],
      { encoding: 'utf8', env: { ...process.env, HOME: tempHome571b, USERPROFILE: tempHome571b } });
    assert.notStrictEqual(r.status, 0,
      '#571 gt test(b): neither scope valid must fail closed, got exit ' + r.status);
    const j = JSON.parse(r.stdout);
    assert.ok(j.status === 'profiles_missing' || j.status === 'config_stale',
      '#571 gt test(b): fail-closed must return profiles_missing or config_stale, got ' + j.status);
  } finally {
    fs.rmSync(tempHome571b, { recursive: true, force: true });
    fs.rmSync(emptyProject571b, { recursive: true, force: true });
  }

  // --- Test (c): stale global does NOT short-circuit ---
  const tempHome571c = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-571c-home-'));
  try {
    const env571c = { ...process.env, HOME: tempHome571c, USERPROFILE: tempHome571c };
    const setupC = spawnSync(process.execPath, [installProfilesScript, tempHome571c], {
      cwd: giteaPluginRoot, encoding: 'utf8', env: env571c
    });
    assert.strictEqual(setupC.status, 0, '#571 gt test(c): setup install must exit 0');
    fs.unlinkSync(
      path.join(tempHome571c, '.codex', 'agents', 'kaola-workflow', 'workflow-planner.toml'));

    const emptyProject571c = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-571c-proj-'));
    try {
      const r = spawnSync(process.execPath,
        [giteaPreflightScript, '--project-root', emptyProject571c, '--no-autofix', '--json'],
        { encoding: 'utf8', env: env571c });
      assert.notStrictEqual(r.status, 0,
        '#571 gt test(c): stale global must not short-circuit, got exit ' + r.status);
    } finally {
      fs.rmSync(emptyProject571c, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(tempHome571c, { recursive: true, force: true });
  }

  // --- Test (a2): --global installer flag targets os.homedir() ---
  const tempHome571flag = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-571flag-home-'));
  try {
    const envFlag = { ...process.env, HOME: tempHome571flag, USERPROFILE: tempHome571flag };
    const globalFlagInstall = spawnSync(process.execPath, [installProfilesScript, '--global'], {
      cwd: giteaPluginRoot, encoding: 'utf8', env: envFlag
    });
    assert.strictEqual(globalFlagInstall.status, 0,
      '#571 gt test(a2): --global flag install must exit 0: ' + globalFlagInstall.stderr);
    assert.ok(
      fs.existsSync(path.join(tempHome571flag, '.codex', 'agents', 'kaola-workflow', 'workflow-planner.toml')),
      '#571 gt test(a2): --global flag must write workflow-planner.toml to tempHome/.codex');
  } finally {
    fs.rmSync(tempHome571flag, { recursive: true, force: true });
  }

  console.log('testGiteaPreflight571 (#571 global-scope gate): PASSED');
}

// ---------------------------------------------------------------------------
// #332: installer schema + prune + manifest (AC3-AC6) — Gitea edition mirror.
// ---------------------------------------------------------------------------
const GT_NAME_RE = /^name\s*=\s*"([^"]+)"\s*$/m;
function giteaListTomls(dir) {
  return fs.readdirSync(dir).filter(f => f.endsWith('.toml')).sort();
}
function testInstallSchemaPruneManifest332Gitea() {
  const manifestBase = '.kaola-managed-profiles.json';

  // AC3: fresh install — exactly 16 tomls (14 base + synthesizer #463 + metric-optimizer #634), no docs-lookup, name on each, manifest, sentinel.
  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-332-install-fresh-'));
  try {
    const r = runInstallProfiles(fresh);
    const agentsDir = path.join(fresh, '.codex', 'agents', 'kaola-workflow');
    const tomls = giteaListTomls(agentsDir);
    assert.strictEqual(tomls.length, 16, '#463 gt AC: fresh install must place 16 *.toml (14 base + synthesizer + metric-optimizer; <role>-max retired)');
    assert.ok(!tomls.includes('docs-lookup.toml'), '#332 gt AC3: docs-lookup.toml must not be installed');
    for (const f of tomls) {
      const role = f.replace(/\.toml$/, '');
      const m = fs.readFileSync(path.join(agentsDir, f), 'utf8').match(GT_NAME_RE);
      assert.ok(m && m[1] === role, '#332 gt AC3: ' + f + ' must have name = "' + role + '"');
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(agentsDir, manifestBase), 'utf8'));
    assert.strictEqual(manifest.schema_version, 1, '#332 gt AC3: manifest schema_version 1');
    assert.strictEqual(manifest.roles.length, 16, '#463 gt AC: manifest must list 16 roles (14 base + synthesizer + metric-optimizer)');
    for (const role of ['code-reviewer', 'adversarial-verifier', 'security-reviewer']) {
      const file = role + '.toml';
      const sourceBytes = fs.readFileSync(path.join(giteaPluginRoot, 'agents', file));
      const installedBytes = fs.readFileSync(path.join(agentsDir, file));
      assert.ok(sourceBytes.equals(installedBytes),
        'reviewer contract: installed ' + file + ' must byte-match the selected source');
      const text = installedBytes.toString('utf8');
      assert.deepStrictEqual(manifest.profile_contracts[file], {
        behavior_contract_version: Number(text.match(/^behavior_contract_version: (\d+)$/m)[1]),
        behavior_contract_hash: text.match(/^behavior_contract_hash: ([0-9a-f]{64})$/m)[1],
        resolved_profile_hash: text.match(/^resolved_profile_hash: ([0-9a-f]{64})$/m)[1],
      }, 'reviewer contract: manifest must bind behavior/profile identity for ' + file);
    }
    assert.strictEqual(r.stdout.trim().split('\n').pop(), 'status: ok', '#332 gt AC3: stdout must end with status: ok');
  } finally {
    fs.rmSync(fresh, { recursive: true, force: true });
  }

  // AC4 + AC9 write-path: upgrade-over-old-state repairs malformed + retired files.
  const upgrade = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-332-install-upgrade-'));
  try {
    const agentsDir = path.join(upgrade, '.codex', 'agents', 'kaola-workflow');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, 'code-explorer.toml'),
      'model_reasoning_effort = "medium"\ndeveloper_instructions = """stale no-name body"""\n');
    fs.writeFileSync(path.join(agentsDir, 'docs-lookup.toml'),
      'model_reasoning_effort = "medium"\ndeveloper_instructions = """retired role body"""\n');
    fs.writeFileSync(path.join(upgrade, '.codex', 'config.toml'), [
      '# BEGIN kaola-workflow agents', '[features]', 'multi_agent = true',
      '[agents.docs-lookup]', 'config_file = "./agents/kaola-workflow/docs-lookup.toml"',
      '# END kaola-workflow agents', ''
    ].join('\n'));
    const r = runInstallProfiles(upgrade);
    assert.ok(!fs.existsSync(path.join(agentsDir, 'docs-lookup.toml')), '#332 gt AC4: retired docs-lookup pruned');
    const ce = fs.readFileSync(path.join(agentsDir, 'code-explorer.toml'), 'utf8');
    assert.ok(GT_NAME_RE.test(ce) && ce.match(GT_NAME_RE)[1] === 'code-explorer', '#332 gt AC4: code-explorer rewritten with name');
    const cfg = fs.readFileSync(path.join(upgrade, '.codex', 'config.toml'), 'utf8');
    assert.ok(cfg.includes('[agents.knowledge-lookup]') && !cfg.includes('[agents.docs-lookup]'),
      '#332 gt AC9: block must register knowledge-lookup and drop docs-lookup');
    assert.ok(r.stdout.includes('docs-lookup.toml (retired)'), '#332 gt AC4: stdout reports retired prune');

    // AC5: idempotency.
    const m1 = JSON.parse(fs.readFileSync(path.join(agentsDir, manifestBase), 'utf8'));
    runInstallProfiles(upgrade);
    const m2 = JSON.parse(fs.readFileSync(path.join(agentsDir, manifestBase), 'utf8'));
    assert.strictEqual(JSON.stringify(m1.files), JSON.stringify(m2.files), '#332 gt AC5: manifest.files stable');
  } finally {
    fs.rmSync(upgrade, { recursive: true, force: true });
  }

  // AC6: unknown user TOML preserved + reported.
  const custom = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-332-install-custom-'));
  try {
    runInstallProfiles(custom);
    const agentsDir = path.join(custom, '.codex', 'agents', 'kaola-workflow');
    fs.writeFileSync(path.join(agentsDir, 'my-custom.toml'), 'name = "my-custom"\nmodel_reasoning_effort = "low"\ndeveloper_instructions = """x"""\n');
    const r = runInstallProfiles(custom);
    assert.ok(fs.existsSync(path.join(agentsDir, 'my-custom.toml')), '#332 gt AC6: user TOML survives');
    assert.ok(r.stdout.includes('unmanaged extra profiles left in place: my-custom.toml'), '#332 gt AC6: stdout reports unmanaged extra');
  } finally {
    fs.rmSync(custom, { recursive: true, force: true });
  }

  console.log('testInstallSchemaPruneManifest332Gitea (#332 AC3-AC6,AC9-path): PASSED');
}

// ---------------------------------------------------------------------------
// #332: preflight schema/stale/manifest/doctor (AC7-AC11) — Gitea edition mirror.
// ---------------------------------------------------------------------------
function testGiteaPreflight332() {
  function pf(args) {
    return spawnSync(process.execPath, [giteaPreflightScript, ...args], { encoding: 'utf8' });
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-332-preflight-'));
  try {
    trustCodexProject(kwSandboxHome, root);
    runInstallProfiles(root);
    const agentsDir = path.join(root, '.codex', 'agents', 'kaola-workflow');
    const ce = path.join(agentsDir, 'code-explorer.toml');
    const savedCe = fs.readFileSync(ce, 'utf8');

    const reviewer = path.join(agentsDir, 'code-reviewer.toml');
    fs.writeFileSync(reviewer, fs.readFileSync(reviewer, 'utf8').replace(
      'Precision-first code review specialist', 'Precision-first modified code review specialist'));
    let r = pf(['--project-root', root, '--no-autofix', '--json']);
    let j = JSON.parse(r.stdout);
    assert.ok(r.status !== 0 && j.status === 'profiles_stale',
      'reviewer contract: modified project profile must refuse as profiles_stale');
    assert.strictEqual(j.repair, `node ${installProfilesScript} ${root}`,
      'reviewer contract: project repair must name the exact scoped installer command');
    r = pf(['--project-root', root, '--json']);
    assert.strictEqual(r.status, 0, 'reviewer contract: project profile drift must autofix');
    assert.ok(fs.readFileSync(reviewer).equals(
      fs.readFileSync(path.join(giteaPluginRoot, 'agents', 'code-reviewer.toml'))),
    'reviewer contract: project autofix must restore exact source bytes');

    // AC7a: malformed -> profiles_malformed under --no-autofix
    fs.writeFileSync(ce, savedCe.replace(/^name = "code-explorer"\n/m, ''));
    r = pf(['--project-root', root, '--no-autofix', '--json']);
    assert.notStrictEqual(r.status, 0, '#332 gt AC7a: malformed must refuse');
    j = JSON.parse(r.stdout);
    assert.strictEqual(j.status, 'profiles_malformed', '#332 gt AC7a: status profiles_malformed');
    assert.strictEqual(j.malformed[0].role, 'code-explorer', '#332 gt AC7a: malformed role correct');

    // AC8: autofix repairs.
    r = pf(['--project-root', root, '--json']);
    assert.strictEqual(r.status, 0, '#332 gt AC8: autofix exits 0');
    j = JSON.parse(r.stdout);
    assert.ok(j.status === 'ok' && j.autofixed === true, '#332 gt AC8: ok autofixed');

    // AC7b: stale docs-lookup -> profiles_stale.
    fs.copyFileSync(ce, path.join(agentsDir, 'docs-lookup.toml'));
    r = pf(['--project-root', root, '--no-autofix', '--json']);
    j = JSON.parse(r.stdout);
    assert.ok(r.status !== 0 && j.status === 'profiles_stale', '#332 gt AC7b: profiles_stale');
    assert.ok(j.stale_files.includes('docs-lookup.toml'), '#332 gt AC7b: stale_files lists docs-lookup');
    pf(['--project-root', root, '--json']);
    assert.ok(!fs.existsSync(path.join(agentsDir, 'docs-lookup.toml')), '#332 gt AC7b: autofix prunes docs-lookup');

    // AC9: an injected retired role changes the canonical managed bytes, so
    // config_stale wins; doctor retains the role-level evidence.
    const cfgPath = path.join(root, '.codex', 'config.toml');
    fs.writeFileSync(cfgPath, fs.readFileSync(cfgPath, 'utf8').replace('# END kaola-workflow agents',
      '[agents.docs-lookup]\nconfig_file = "./agents/kaola-workflow/docs-lookup.toml"\n\n# END kaola-workflow agents'));
    r = pf(['--project-root', root, '--no-autofix', '--json']);
    j = JSON.parse(r.stdout);
    assert.ok(r.status !== 0 && j.status === 'config_stale',
      '#332 gt AC9: canonical managed-block drift must return config_stale, got ' + j.status);
    const managedDoctor = pf(['--doctor', '--project-root', root, '--json']);
    const managedDoctorJson = JSON.parse(managedDoctor.stdout);
    const managedProjectScope = managedDoctorJson.scopes.find(s => s.scope === 'project');
    assert.ok(managedDoctor.status !== 0 && managedProjectScope && managedProjectScope.managed_block_drift === true,
      '#332 gt AC9: doctor must report canonical managed-block drift');
    assert.ok(managedProjectScope.stale_roles_in_block.includes('docs-lookup'),
      '#332 gt AC9: doctor stale_roles_in_block lists docs-lookup');
    pf(['--project-root', root, '--json']);

    // schema_version 2 -> exit 6.
    const manifestPath = path.join(agentsDir, '.kaola-managed-profiles.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.schema_version = 2;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    r = pf(['--project-root', root, '--json']);
    j = JSON.parse(r.stdout);
    assert.ok(r.status === 6 && j.status === 'profile_schema_version_unsupported', '#332 gt: exit 6 on future manifest');
    manifest.schema_version = 1;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    // doctor AC10/AC11.
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-332-doctor-home-'));
    const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-332-doctor-proj-'));
    try {
      runInstallProfiles(home);
      runInstallProfiles(proj);
      trustCodexProject(home, proj);
      fs.copyFileSync(path.join(home, '.codex', 'agents', 'kaola-workflow', 'code-explorer.toml'),
        path.join(home, '.codex', 'agents', 'kaola-workflow', 'docs-lookup.toml'));
      r = pf(['--doctor', '--home', home, '--project-root', proj, '--json']);
      assert.strictEqual(r.status, 1, '#332 gt AC10: doctor exit 1 on stale user scope');
      j = JSON.parse(r.stdout);
      const userScope = j.scopes.find(s => s.scope === 'user');
      assert.ok(userScope.stale_files.includes('docs-lookup.toml'), '#332 gt AC10: user scope reports docs-lookup');
      assert.strictEqual(userScope.repair, `node ${installProfilesScript} ${home}`,
        '#332 gt AC10: user scope repair must be the exact scoped installer command');
      fs.unlinkSync(path.join(home, '.codex', 'agents', 'kaola-workflow', 'docs-lookup.toml'));
      runInstallProfiles(home);
      r = pf(['--doctor', '--home', home, '--project-root', proj, '--json']);
      assert.strictEqual(r.status, 0, '#332 gt AC10: doctor exit 0 when both clean');
      const pluginIdentity = JSON.parse(fs.readFileSync(
        path.join(giteaPluginRoot, '.codex-plugin', 'plugin.json'), 'utf8'));
      const cacheRoot = path.join(home, '.codex', 'plugins', 'cache', 'm',
        pluginIdentity.name, pluginIdentity.version);
      const cacheAgents = path.join(cacheRoot, 'agents');
      fs.mkdirSync(cacheRoot, { recursive: true });
      fs.cpSync(path.join(giteaPluginRoot, 'agents'), cacheAgents, { recursive: true });
      fs.cpSync(path.join(giteaPluginRoot, 'config'), path.join(cacheRoot, 'config'), { recursive: true });
      fs.cpSync(path.join(giteaPluginRoot, '.codex-plugin'), path.join(cacheRoot, '.codex-plugin'),
        { recursive: true });
      const cachedReviewer = path.join(cacheAgents, 'code-reviewer.toml');
      fs.writeFileSync(cachedReviewer, fs.readFileSync(cachedReviewer, 'utf8').replace(
        'Precision-first code review specialist', 'Precision-first cached code review specialist'));
      r = pf(['--doctor', '--home', home, '--project-root', proj, '--json']);
      assert.strictEqual(r.status, 1, '#332 gt AC11: stale plugin_cache must fail doctor');
      j = JSON.parse(r.stdout);
      const cacheScope = j.scopes.find(s => s.scope === 'plugin_cache');
      assert.ok(cacheScope && cacheScope.read_only === true && cacheScope.stale_profiles.length > 0,
        '#332 gt AC11: cache scope read_only + stale profile evidence');
      assert.strictEqual(cacheScope.repair,
        'codex plugin remove ' + pluginIdentity.name + '@m && codex plugin add '
          + pluginIdentity.name + '@m  # refresh plugin cache',
        '#332 gt AC11: cache scope must name the exact refresh command');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
      fs.rmSync(proj, { recursive: true, force: true });
    }

    fs.writeFileSync(ce, savedCe);
    console.log('testGiteaPreflight332 (#332 AC7-AC11): PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Case 3: task-mirror regeneration (gitea edition)
function testGiteaTaskMirror266() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-266-taskmirror-'));
  try {
    const projectName = 'issue-266-mirror';
    const projDir = path.join(root, 'kaola-workflow', projectName);
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, 'workflow-plan.md'), GITEA_FIXTURE_PLAN);

    const NOW = '2026-06-07T12:00:00.000Z';

    // --- GREEN: run task-mirror → produces correct JSON ---
    const r1 = spawnSync(process.execPath,
      [giteaTaskMirrorScript, '--project', projectName, '--now', NOW, '--json'],
      { cwd: root, encoding: 'utf8' });
    assert.strictEqual(r1.status, 0,
      '#266 gt case3: task-mirror must exit 0, got ' + r1.status + '\n' + r1.stderr);
    const mirror1 = JSON.parse(r1.stdout);
    assert.strictEqual(mirror1.source_plan_hash, GITEA_FIXTURE_PLAN_HASH,
      '#266 gt case3: source_plan_hash mismatch, got ' + mirror1.source_plan_hash);
    assert.ok(Array.isArray(mirror1.tasks) && mirror1.tasks.length === 4,
      '#266 gt case3: expected 4 tasks, got ' + mirror1.tasks.length);
    assert.strictEqual(mirror1.last_synced_from_ledger, NOW,
      '#266 gt case3: last_synced_from_ledger mismatch, got ' + mirror1.last_synced_from_ledger);

    // --- Verify all 4 ledger→status mappings ---
    const byId = Object.fromEntries(mirror1.tasks.map(t => [t.id, t]));
    assert.ok(byId.explore.status === 'completed' && byId.explore.ledger_status === 'complete',
      '#266 gt case3: explore mapping wrong, got ' + JSON.stringify(byId.explore));
    assert.ok(byId.impl.status === 'in_progress' && byId.impl.ledger_status === 'in_progress',
      '#266 gt case3: impl mapping wrong, got ' + JSON.stringify(byId.impl));
    assert.ok(byId.gate.status === 'pending' && byId.gate.ledger_status === 'pending',
      '#266 gt case3: gate mapping wrong, got ' + JSON.stringify(byId.gate));
    assert.ok(byId.done.status === 'completed' && byId.done.ledger_status === 'n/a',
      '#266 gt case3: done (n/a) mapping wrong, got ' + JSON.stringify(byId.done));

    // --- Determinism: same --now ⇒ identical output ---
    const r2 = spawnSync(process.execPath,
      [giteaTaskMirrorScript, '--project', projectName, '--now', NOW, '--json'],
      { cwd: root, encoding: 'utf8' });
    assert.strictEqual(r1.stdout, r2.stdout,
      '#266 gt case3 det: two runs must produce identical stdout');

    // --- RED discriminator: unfrozen plan → non-zero exit ---
    const unfrozenPlan = GITEA_FIXTURE_PLAN.replace(
      `<!-- plan_hash: ${GITEA_FIXTURE_PLAN_HASH} -->`, '');
    fs.writeFileSync(path.join(projDir, 'workflow-plan.md'), unfrozenPlan);
    const rUnfrozen = spawnSync(process.execPath,
      [giteaTaskMirrorScript, '--project', projectName, '--now', NOW, '--json'],
      { cwd: root, encoding: 'utf8' });
    assert.notStrictEqual(rUnfrozen.status, 0,
      '#266 gt case3 RED: unfrozen plan must cause non-zero exit, got ' + rUnfrozen.status);

    // --- Stale-hash regeneration ---
    const FAKE_HASH = 'a'.repeat(64);
    const staleHashPlan = GITEA_FIXTURE_PLAN.replace(
      `<!-- plan_hash: ${GITEA_FIXTURE_PLAN_HASH} -->`,
      `<!-- plan_hash: ${FAKE_HASH} -->`);
    fs.writeFileSync(path.join(projDir, 'workflow-plan.md'), staleHashPlan);
    const rStale = spawnSync(process.execPath,
      [giteaTaskMirrorScript, '--project', projectName, '--now', NOW, '--json'],
      { cwd: root, encoding: 'utf8' });
    assert.strictEqual(rStale.status, 0,
      '#266 gt case3 stale-hash: must exit 0, got ' + rStale.status + '\n' + rStale.stderr);
    const mirrorStale = JSON.parse(rStale.stdout);
    assert.strictEqual(mirrorStale.source_plan_hash, FAKE_HASH,
      '#266 gt case3 stale-hash: output hash must reflect new plan_hash');
    assert.notStrictEqual(mirrorStale.source_plan_hash, GITEA_FIXTURE_PLAN_HASH,
      '#266 gt case3 stale-hash: stale mirror must NOT carry old hash');

    console.log('testGiteaTaskMirror266 (#266 case 3): PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Case 4: compact/resume packet (gitea edition)
function testGiteaCompactResume266() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-266-compact-'));
  try {
    const projectName = 'issue-266-compact';
    const projDir = path.join(root, 'kaola-workflow', projectName);
    fs.mkdirSync(projDir, { recursive: true });

    fs.writeFileSync(path.join(projDir, 'workflow-state.md'), [
      '# State', '',
      '## Project',
      'name: issue-266-compact',
      'status: active', '',
      '## Sink',
      'branch: workflow/issue-266',
      'issue_number: 266',
      'next_command: /kaola-workflow-plan-run',
      'next_skill: kaola-workflow-next',
      ''
    ].join('\n'));

    fs.writeFileSync(path.join(projDir, 'workflow-plan.md'), GITEA_FIXTURE_PLAN);

    const tasksJson = JSON.stringify({
      source_plan_hash: GITEA_FIXTURE_PLAN_HASH,
      tasks: [
        { id: 'explore', role: 'code-explorer', status: 'completed', ledger_status: 'complete' },
        { id: 'impl',    role: 'implementer',   status: 'in_progress', ledger_status: 'in_progress' },
        { id: 'gate',    role: 'code-reviewer', status: 'pending',    ledger_status: 'pending' },
        { id: 'done',    role: 'finalize',       status: 'completed',  ledger_status: 'n/a' }
      ],
      last_synced_from_ledger: '2026-06-07T12:00:00.000Z'
    }, null, 2) + '\n';
    fs.writeFileSync(path.join(projDir, 'workflow-tasks.json'), tasksJson);

    const input = JSON.stringify({ cwd: root });

    // --- GREEN: run compact-resume → deterministic 7-line packet ---
    const r1 = spawnSync(process.execPath, [giteaCompactResumeScript],
      { input, encoding: 'utf8' });
    assert.strictEqual(r1.status, 0,
      '#266 gt case4: compact-resume must exit 0, got ' + r1.status + '\n' + r1.stderr);
    const lines1 = r1.stdout.trim().split('\n');
    assert.strictEqual(lines1.length, 7,
      '#266 gt case4: packet must have 7 lines, got ' + lines1.length + '\n' + r1.stdout);

    assert.strictEqual(lines1[0], 'Kaola-Workflow compact resume:',
      '#266 gt case4: line[0] must be header, got ' + lines1[0]);
    assert.ok(lines1[1].includes('issue-266-compact'),
      '#266 gt case4: active project must include project name, got ' + lines1[1]);
    assert.ok(lines1[3].includes('impl') && lines1[3].includes('implementer'),
      '#266 gt case4: in-progress node must show impl+role, got ' + lines1[3]);
    assert.ok(lines1[4].includes('gate'),
      '#266 gt case4: pending gates must include gate, got ' + lines1[4]);
    assert.ok(lines1[5].includes('consent_halt=pending'),
      '#266 gt case4: consent-halt must show pending, got ' + lines1[5]);
    assert.ok(lines1[6].includes('completed: 2') && lines1[6].includes('in_progress: 1'),
      '#266 gt case4: task mirror must show correct counts, got ' + lines1[6]);

    // --- #334 case4b: a pending main-session-gate must appear in the pending-gates packet line.
    // Separate root + small fixture (NOT GITEA_FIXTURE_PLAN, whose hash is asserted elsewhere).
    // RED before the GATE_VERDICT_ROLES edit: the role was not in the set → the line read 'none'.
    { const root334 = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-334-compact-'));
      try {
        const pj = 'issue-334-vgate';
        const pd = path.join(root334, 'kaola-workflow', pj);
        fs.mkdirSync(pd, { recursive: true });
        fs.writeFileSync(path.join(pd, 'workflow-state.md'), ['# State', '', '## Project', 'name: ' + pj, 'status: active', '', '## Sink', 'branch: workflow/issue-334', 'issue_number: 334', 'next_command: /kaola-workflow-plan-run', 'next_skill: kaola-workflow-next', ''].join('\n'));
        fs.writeFileSync(path.join(pd, 'workflow-plan.md'), ['# Plan', '', '## Nodes', '', '| id | role | depends_on | declared_write_set | cardinality | shape |', '|---|---|---|---|---|---|', '| impl | implementer | — | lib/foo.js | 1 | sequence |', '| rv | code-reviewer | impl | — | 1 | sequence |', '| vgate | main-session-gate | rv | — | 1 | sequence |', '| done | finalize | vgate | — | 1 | sequence |', '', '## Node Ledger', '', '| id | status |', '|---|---|', '| impl | complete |', '| rv | complete |', '| vgate | pending |', '| done | pending |', ''].join('\n'));
        const r334 = spawnSync(process.execPath, [giteaCompactResumeScript], { input: JSON.stringify({ cwd: root334 }), encoding: 'utf8' });
        assert.strictEqual(r334.status, 0, '#334 gt case4b: compact-resume must exit 0, got ' + r334.status + '\n' + r334.stderr);
        const gateLine = r334.stdout.trim().split('\n').find(l => l.startsWith('pending gates:'));
        assert.ok(gateLine && /\bvgate\b/.test(gateLine),
          '#334 gt case4b: a pending main-session-gate (vgate) must appear in the pending-gates line, got: ' + gateLine);
      } finally { fs.rmSync(root334, { recursive: true, force: true }); }
    }

    // --- Determinism: two runs → identical stdout ---
    const r2 = spawnSync(process.execPath, [giteaCompactResumeScript],
      { input, encoding: 'utf8' });
    assert.strictEqual(r1.stdout, r2.stdout,
      '#266 gt case4 det: two compact-resume runs must produce identical stdout');

    // --- RED discriminator: no workflow-state → empty stdout ---
    const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-266-compact-empty-'));
    try {
      const rEmpty = spawnSync(process.execPath, [giteaCompactResumeScript],
        { input: JSON.stringify({ cwd: emptyRoot }), encoding: 'utf8' });
      assert.strictEqual(rEmpty.status, 0,
        '#266 gt case4 RED: empty root must exit 0, got ' + rEmpty.status);
      assert.strictEqual(rEmpty.stdout.trim(), '',
        '#266 gt case4 RED: no workflow dir must produce no output, got: ' + rEmpty.stdout);
    } finally {
      fs.rmSync(emptyRoot, { recursive: true, force: true });
    }

    console.log('testGiteaCompactResume266 (#266 case 4): PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// #261 forge-parity: barrierCheck foreign-archive carveout (pure-fn, no git repo).
// AC3: --barrier-check must REFUSE a foreign project's archive band while still
// exempting the finalized project's own archive band (incl. .archived- suffix).
// Ported from base scripts/test-commit-node.js Test 6 (forge-parity follow-up).
// ---------------------------------------------------------------------------
function testGiteaForeignArchiveBarrier261() {
  const minimalPlan = [
    '# Workflow Plan — issue #261', '', '## Meta', 'labels: refactor', '',
    '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '|---|---|---|---|---|---|',
    '| impl | tdd-guide | — | scripts/kaola-gitea-workflow-plan-validator.js | 1 | sequence |',
    '| done | finalize | impl | — | 1 | sequence |', '',
    '## Node Ledger', '', '| id | status |', '|---|---|',
    '| impl | complete |', '| done | complete |', '',
  ].join('\n');

  // 6a: foreign archive REFUSED — a write to another project's archive band must be refused.
  {
    const r = planValidator.barrierCheck(minimalPlan, ['kaola-workflow/archive/issue-999/x.md'], { project: 'issue-261' });
    assert.strictEqual(r.result, 'refuse', '#261 ge 6a: foreign archive write must be refused (RED→GREEN AC3)');
    assert.ok(r.errors && r.errors.join(' ').toLowerCase().includes('foreign'), '#261 ge 6a: error message must mention FOREIGN');
  }
  // 6b: own archive PASSES — a write to the finalized project's own archive band must pass.
  {
    const r = planValidator.barrierCheck(minimalPlan, ['kaola-workflow/archive/issue-261/x.md'], { project: 'issue-261' });
    assert.strictEqual(r.result, 'pass', '#261 ge 6b: own archive write must pass');
  }
  // 6c: suffix-tolerant — .archived-<timestamp> suffix on the own archive dir must still pass.
  {
    const r = planValidator.barrierCheck(minimalPlan, ['kaola-workflow/archive/issue-261.archived-2026-01-01T00-00-00/x.md'], { project: 'issue-261' });
    assert.strictEqual(r.result, 'pass', '#261 ge 6c: own archive with .archived- suffix must pass');
  }
  // 6d: backward-compat — no project arg, non-archive workflow artifact must still pass.
  {
    const r = planValidator.barrierCheck(minimalPlan, ['kaola-workflow/p/workflow-plan.md'], {});
    assert.strictEqual(r.result, 'pass', '#261 ge 6d: backward-compat — non-archive workflow artifact, no project, passes');
  }
  console.log('testGiteaForeignArchiveBarrier261 (#261 forge-parity): PASSED');
}

// ---------------------------------------------------------------------------
// #339: closure roadmap-mirror-clean is row-anchored — a legitimate cross-
// reference to #N inside ANOTHER issue's row must not violate; an actual
// active `| #N | ...` row still must. Direct checkClosureInvariants call.
// ---------------------------------------------------------------------------
function testGiteaMirrorCleanCrossRef339() {
  const root = tempRoot('kw-gt-339-mirror-clean-');
  try {
    const kwDir = path.join(root, 'kaola-workflow');
    fs.mkdirSync(kwDir, { recursive: true });

    // Archive dest with a closed state file (so archive-state-closed passes)
    const archiveDest = path.join(kwDir, 'archive', 'issue-562');
    fs.mkdirSync(archiveDest, { recursive: true });
    fs.writeFileSync(path.join(archiveDest, 'workflow-state.md'), [
      '# Kaola-Workflow State',
      'name: issue-562',
      'status: closed',
      'step: complete'
    ].join('\n') + '\n');

    // Single-issue receipt (no issue_numbers): issue #562 fully closed
    const receipt = {
      project: 'issue-562',
      issue_number: 562,
      archive: 'closed',
      roadmap_source_removed: 'removed',
      roadmap_regenerated: 'regenerated',
      claim_label_removed: 'removed',
      worktree_removed: 'missing',
      branch_removed: 'kept',
      warnings: []
    };

    const tableHeader =
      '# Kaola-Workflow Roadmap\n\n' +
      '| Issue | Title | Status | Project | Next Step |\n' +
      '|-------|-------|--------|---------|----------|\n';

    // Fixture A (AC1): the ONLY #562 mention is a legitimate cross-reference
    // inside ANOTHER issue's row (next_step cell of the #485 row).
    fs.writeFileSync(path.join(kwDir, 'ROADMAP.md'),
      tableHeader +
      '| #485 | layered rendering | open | issue-485 | place_inside (#562 opacity) |\n');
    const resA = claim.checkClosureInvariants(root, receipt, archiveDest);
    assert.strictEqual(resA.ok, true,
      '#339 ge A: cross-reference-only mirror must pass closure invariants, got: ' + JSON.stringify(resA.violations));
    assert.ok(!resA.violations.some(v => v.id === 'roadmap-mirror-clean'),
      '#339 ge A: no roadmap-mirror-clean violation for a cross-reference inside another row');

    // Fixture B (AC2): an actual active `| #562 | ...` row must still violate.
    fs.writeFileSync(path.join(kwDir, 'ROADMAP.md'),
      tableHeader +
      '| #485 | layered rendering | open | issue-485 | place_inside (#562 opacity) |\n' +
      '| #562 | opacity flag | active | issue-562 | TBD |\n');
    const resB = claim.checkClosureInvariants(root, receipt, archiveDest);
    assert.strictEqual(resB.ok, false,
      '#339 ge B: mirror with an active #562 row must fail closure invariants');
    assert.ok(resB.violations.some(v => v.id === 'roadmap-mirror-clean'),
      '#339 ge B: roadmap-mirror-clean violation must fire for an active row, got: ' + JSON.stringify(resB.violations));

    console.log('testGiteaMirrorCleanCrossRef339 (#339): PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// #338 (AC1): the finalize SINK node must be certified `main-session-direct`, not
// `subagent-invoked` — the plan-run contract performs the sink bookkeeping inline, with no Agent
// dispatch, so a `subagent-invoked` row would falsely certify a delegation that never happened.
function testGiteaFinalizeRowMainDirect338() {
  const adaptiveNode = require('./kaola-gitea-workflow-adaptive-node');
  const plan = [
    '# Workflow Plan — gt-338',
    '', '## Meta', 'labels: enhancement', '',
    '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '|---|---|---|---|---|---|',
    '| impl | implementer | — | src/x.js | 1 | sequence |',
    '| review | code-reviewer | impl | — | 1 | sequence |',
    '| done | finalize | review | CHANGELOG.md | 1 | sequence |',
    '', '## Node Ledger', '',
    '| id | status |', '|---|---|',
    '| impl | complete |',
    '| review | complete |',
    '| done | in_progress |',
    ''
  ].join('\n') + '\n';

  const cachePath = '/fake/kaola-workflow/gt-338/.cache/done.md';
  const cacheContent = 'finalize bookkeeping: docs + state recorded.';
  let planContent = plan;
  const written = {};

  const shellStub = function(scriptPath, args) {
    const base = path.basename(scriptPath);
    const argsArr = args || [];
    if (base.includes('commit-node') && !argsArr.includes('--start')) {
      return { exitCode: 0, result: 'ok', mode: 'per-node', nodeId: 'done', overallOk: true,
        selectorCheck: { isSelector: false, ok: true } };
    }
    if (base.includes('next-action')) {
      return { exitCode: 0, result: 'ok', readySet: [], nextNode: null, allDone: true };
    }
    return { exitCode: 1 };
  };

  const result = adaptiveNode.runCloseAndOpenNext({
    planPath: '/fake/kaola-workflow/gt-338/workflow-plan.md',
    statePath: '/fake/kaola-workflow/gt-338/workflow-state.md',
    project: 'gt-338',
    nodeId: 'done',
    shell: shellStub,
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) return planContent;
      if (fpath === cachePath) return cacheContent;
      throw new Error('ENOENT: ' + fpath);
    },
    writeFile: (fpath, content) => {
      written[fpath] = content;
      if (fpath.endsWith('workflow-plan.md')) planContent = content;
    },
    cacheExists: (fpath) => fpath === cachePath,
  });

  assert.strictEqual(result.result, 'ok', '#338 gt: finalize-sink close result===ok');
  assert.strictEqual(result.allDone, true, '#338 gt: allDone===true after the sink closes');
  const writtenPlan = written['/fake/kaola-workflow/gt-338/workflow-plan.md'];
  assert.ok(writtenPlan && writtenPlan.includes('| finalize (done) | main-session-direct |'),
    '#338 gt: finalize sink row must be main-session-direct');
  assert.ok(!writtenPlan.includes('| finalize (done) | subagent-invoked'),
    '#338 gt: finalize sink row must NOT be falsely certified subagent-invoked');
  console.log('testGiteaFinalizeRowMainDirect338 (#338): PASSED');
}

// #445/#446: forge-edition exercises for operator_hint, route-findings subcommand, and
// --summary flag on the Gitea adaptive-node port.
//   (a) OPERATOR_HINT_REGISTRY is exported and has entries — the hint machinery is wired.
//   (b) decorateOperatorHint stamps operator_hint on an actionable envelope.
//   (c) route-findings subcommand is recognised — a missing --json fails closed but JSON,
//       not an unknown-subcommand hard error. runNodeRaw is used because the exit is 1.
//   (d) --summary flag collapses a refuse to a one-line "summary:" sentinel (not JSON).
function testGiteaAdaptiveNodeOperatorHint445() {
  const adaptiveNode = require('./kaola-gitea-workflow-adaptive-node');

  // (a) OPERATOR_HINT_REGISTRY must be a non-empty object exported from the gitea port.
  assert.ok(adaptiveNode.OPERATOR_HINT_REGISTRY && typeof adaptiveNode.OPERATOR_HINT_REGISTRY === 'object',
    '#445 gt: OPERATOR_HINT_REGISTRY must be exported as an object');
  assert.ok(Object.keys(adaptiveNode.OPERATOR_HINT_REGISTRY).length > 0,
    '#445 gt: OPERATOR_HINT_REGISTRY must have at least one entry');

  // (b) decorateOperatorHint must add operator_hint to an actionable refuse envelope.
  const envelope = { result: 'refuse', reason: 'plan_missing' };
  const decorated = adaptiveNode.decorateOperatorHint(envelope);
  assert.ok(typeof decorated.operator_hint === 'string' && decorated.operator_hint.length > 0,
    '#445 gt: decorateOperatorHint must stamp a non-empty operator_hint on a refuse envelope');

  // (c) route-findings subcommand: missing --json refuses with a typed JSON error (not an
  // unknown-subcommand crash). exit 1 is expected; stdout must be valid JSON with result: refuse.
  const routeFindingsRaw = spawnSync(process.execPath, [
    path.join(__dirname, 'kaola-gitea-workflow-adaptive-node.js'),
    'route-findings'
  ], { encoding: 'utf8' });
  assert.strictEqual(routeFindingsRaw.status, 1,
    '#446 gt: route-findings without --json must exit 1 (not an unknown-subcommand crash)');
  const routeFindingsParsed = JSON.parse(routeFindingsRaw.stdout.trim());
  assert.strictEqual(routeFindingsParsed.result, 'refuse',
    '#446 gt: route-findings without --json must emit a typed refuse result');

  // (d) --summary flag: orient with a missing plan and --json --summary must emit a
  // one-line "summary:" sentinel, not a full JSON envelope. #527: orient is documented
  // read-only but materializes kaola-workflow/<project>/.cache/orient-envelope.json even
  // for a nonexistent project. Run the spawn in a $TMPDIR-rooted cwd so that scratch dir
  // lands in tmp (cleaned in the finally below), never leaking into the repo working tree.
  const summaryRoot = tempRoot('kw-gt-orient-summary-');
  try {
    const summaryRaw = spawnSync(process.execPath, [
      path.join(__dirname, 'kaola-gitea-workflow-adaptive-node.js'),
      'orient',
      '--project', 'nonexistent-gt-445-test',
      '--json',
      '--summary'
    ], { cwd: summaryRoot, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
    const summaryOut = summaryRaw.stdout.trim();
    assert.ok(summaryOut.startsWith('summary:'),
      '#446 gt: --summary mode must emit a one-line "summary:" sentinel, got: ' + summaryOut);
  } finally {
    fs.rmSync(summaryRoot, { recursive: true, force: true });
  }

  console.log('testGiteaAdaptiveNodeOperatorHint445 (#445/#446): PASSED');
}

// #341: forge-neutrality guard for agent-profile authoring. Three behaviors are locked:
//   (AC2) the forbidden-token scan loop runs BEFORE any file-count assertion, so a forge
//         leak is never masked by a stale agent/command/skill count (the #328 latent defect);
//   (AC1) a standalone `--forbidden-only <file>...` mode lets a forge-touching node verify its
//         own changed files (exit 1 on a forbidden token, exit 0 on a clean file) without ever
//         reaching the count assertions; usage/unknown-flag fails closed (exit 2).
// #401 Part 1: a behavioral REFUSAL ANCHOR for the Gitea plan-validator port. The forge
// walkthroughs exercise only --freeze happy paths, so a forge-side regression in the
// #381/#382 write-set + model refusals would pass all four chains today (#347 drift class).
// This drives the REAL forge plan-validator --json CLI over a refusal matrix and asserts the
// typed refusal each time (runNodeRaw, NOT runNode — refusals exit 1), plus a green anchor
// proving the matrix does not over-refuse a legitimate plan.
function testGiteaPlanValidatorRefusalMatrix401() {
  const root = tempRoot('kw-ge-planval-refuse-');
  const planHeader = [
    '# Workflow Plan', '', '## Meta', 'plan_form: spine', 'labels: enhancement', '', '## Nodes', ''
  ];
  const sixCol = (writeSet) => planHeader.concat([
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '|---|---|---|---|---|---|',
    '| e | code-explorer | — | — | 1 | sequence |',
    `| i | tdd-guide | e | ${writeSet} | 1 | sequence |`,
    '| r | code-reviewer | i | — | 1 | sequence |',
    '| d | finalize | r | — | 1 | sequence |', ''
  ]).join('\n');
  // 7-col plan carrying an invalid model tier (haiku) on the first node.
  const sevenColModel = planHeader.concat([
    '| id | role | depends_on | declared_write_set | cardinality | shape | model |',
    '|---|---|---|---|---|---|---|',
    '| e | code-explorer | — | — | 1 | sequence | haiku |',
    '| i | tdd-guide | e | lib/x.js | 1 | sequence | — |',
    '| r | code-reviewer | i | — | 1 | sequence | — |',
    '| d | finalize | r | — | 1 | sequence | — |', ''
  ]).join('\n');

  const runJson = (planText) => {
    const planPath = path.join(root, 'workflow-plan.md');
    fs.writeFileSync(planPath, planText);
    const r = runNodeRaw([planValidatorScript, planPath, '--json'], root);
    return { status: r.status, parsed: JSON.parse(r.stdout) };
  };

  try {
    // (a) directory-shaped write-set entry → refuse /directory-shaped/.
    const dir = runJson(sixCol('src/'));
    assert.strictEqual(dir.status, 1, '#401 ge: directory-shaped write-set must exit 1');
    assert.strictEqual(dir.parsed.result, 'refuse', '#401 ge: directory-shaped must be a typed refusal');
    assert.ok(/directory-shaped/.test(dir.parsed.errors.join('; ')),
      '#401 ge: directory-shaped refusal message expected, got: ' + JSON.stringify(dir.parsed.errors));

    // (b) path-traversal write-set entry → refuse /contains '..'/.
    const trav = runJson(sixCol('src/../b.js'));
    assert.strictEqual(trav.status, 1, "#401 ge: '..' write-set must exit 1");
    assert.strictEqual(trav.parsed.result, 'refuse', "#401 ge: '..' must be a typed refusal");
    assert.ok(/contains '\.\.'/.test(trav.parsed.errors.join('; ')),
      "#401 ge: \"contains '..'\" refusal message expected, got: " + JSON.stringify(trav.parsed.errors));

    // (c) invalid model tier (7-col) → refuse /model_invalid/.
    const model = runJson(sevenColModel);
    assert.strictEqual(model.status, 1, '#401 ge: invalid model tier must exit 1');
    assert.strictEqual(model.parsed.result, 'refuse', '#401 ge: invalid model must be a typed refusal');
    assert.ok(/model_invalid/.test(model.parsed.errors.join('; ')),
      '#401 ge: model_invalid refusal message expected, got: ' + JSON.stringify(model.parsed.errors));

    // green anchor: an exact-file plan must NOT be refused (no false-refusal regression).
    const green = runJson(sixCol('lib/x.js'));
    assert.strictEqual(green.status, 0, '#401 ge: a clean exact-file plan must exit 0 (no false refusal)');
    assert.strictEqual(green.parsed.result, 'in-grammar',
      '#401 ge: a clean exact-file plan must be in-grammar, got: ' + JSON.stringify(green.parsed.result));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log('testGiteaPlanValidatorRefusalMatrix401 (#401): PASSED');
}

// The forbidden fixture token is built by string concatenation because the validator's own
// plugin-script scan forbids a literal `\bglab\b` in any .js file (this test included).
function testForbiddenOnly341() {
  const validatorScript = path.join(__dirname, 'validate-kaola-workflow-gitea-contracts.js');
  const validatorSrc = fs.readFileSync(validatorScript, 'utf8');
  const idx = (needle) => validatorSrc.indexOf(needle);

  // (AC2) order pin: the forbidden-token scan loop call must precede every count assertion.
  const scanIdx = idx('assertNoForbidden(file);');
  assert.ok(scanIdx !== -1, '#341 gt: validator must contain the assertNoForbidden(file); scan loop');
  // Needles carry the `assert(` prefix so they match the real count assertions, not the
  // `agentFiles.length === 13` substring inside the #341 scan-loop comment.
  for (const countNeedle of [
    'assert(commandFiles.length ===', 'assert(skillFiles.length ===', 'assert(agentFiles.length ==='
  ]) {
    const countIdx = idx(countNeedle);
    assert.ok(countIdx !== -1, '#341 gt: validator must contain count assert ' + countNeedle);
    assert.ok(scanIdx < countIdx,
      '#341 gt: forbidden scan must precede count assert ' + countNeedle);
  }

  // (AC1) dirty file → exit 1, message naming a forbidden reference.
  const root = tempRoot('kw-gt-forbidden-');
  try {
    const dirty = path.join(root, 'dirty.toml');
    fs.writeFileSync(dirty, 'Use ' + 'g' + 'lab' + ' to list issues\n');
    const dirtyRun = spawnSync(process.execPath, [validatorScript, '--forbidden-only', dirty], {
      encoding: 'utf8'
    });
    assert.notStrictEqual(dirtyRun.status, 0, '#341 gt: forbidden token must exit non-zero');
    assert.ok((dirtyRun.stderr || '').includes('contains forbidden reference'),
      '#341 gt: forbidden-only must report "contains forbidden reference"');

    // clean file → exit 0, sentinel. The #328-repaired issue-scout.toml doubles as a
    // regression lock on the original leak. Root-relative path resolves from any cwd.
    const cleanRun = spawnSync(process.execPath,
      [validatorScript, '--forbidden-only', 'plugins/kaola-workflow-gitea/agents/issue-scout.toml'],
      { encoding: 'utf8' });
    assert.strictEqual(cleanRun.status, 0,
      '#341 gt: clean file must exit 0 (stderr: ' + (cleanRun.stderr || '') + ')');
    assert.ok((cleanRun.stdout || '').includes('forbidden-only check passed'),
      '#341 gt: clean run must print the forbidden-only sentinel');

    // usage refusals → exit 2 (fail closed): no files, and an unknown flag.
    const noFiles = spawnSync(process.execPath, [validatorScript, '--forbidden-only'], {
      encoding: 'utf8'
    });
    assert.strictEqual(noFiles.status, 2, '#341 gt: --forbidden-only with no files must exit 2');
    const unknownFlag = spawnSync(process.execPath,
      [validatorScript, '--forbidden' + '_only'], { encoding: 'utf8' });
    assert.strictEqual(unknownFlag.status, 2, '#341 gt: unknown flag must exit 2 (fail closed)');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log('testForbiddenOnly341 (#341): PASSED');
}

// #507: boundary-2 classifier fetch-retry tests (gitea edition)
// Tests use withForge to inject a throwing viewIssue stub that records call count.
function testGiteaBoundary2FetchRetry507() {
  // (a) persistent transient (spawn_fault) → classifyIssue returns verdict:indeterminate
  {
    let callCount = 0;
    const transientErr = new Error('spawn failed');
    transientErr.code = 'ENOENT';
    const root = tempRoot('kw-gt-b2a-root-');
    try {
      const result = withForge({ viewIssue: function() { callCount++; throw transientErr; } }, function() {
        process.env.KAOLA_CLASSIFIER_BACKOFF_MS = '0';
        try {
          return classifier.classifyIssue(99, root);
        } finally {
          delete process.env.KAOLA_CLASSIFIER_BACKOFF_MS;
        }
      });
      assert.strictEqual(result.verdict, 'indeterminate',
        '#507(gt-b2a): persistent transient → verdict:indeterminate (got ' + result.verdict + ')');
      assert.strictEqual(result.reasoning_class, 'classifier_error',
        '#507(gt-b2a): indeterminate must carry reasoning_class:classifier_error');
      assert.ok(callCount >= 3,
        '#507(gt-b2a): transient retried to MAX_ATTEMPTS — callCount=' + callCount + ' (expected >=3)');
    } finally {
      try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // (b) clean_nonzero GENUINE-NEGATIVE (determinate) → verdict:target_unavailable, NOT retried.
  // #519 RECONCILE: a clean_nonzero stays determinate-refuse ONLY when its stderr is genuine-negative /
  // unrecognized — so this pin carries a real 404 stderr ("Could not resolve to an Issue").
  {
    let callCount = 0;
    const cleanErr = new Error('tea exited 1');
    cleanErr.status = 1;
    cleanErr.stderr = 'Could not resolve to an Issue with the number of 99.\n';
    const root = tempRoot('kw-gt-b2b-root-');
    try {
      const result = withForge({ viewIssue: function() { callCount++; throw cleanErr; } }, function() {
        process.env.KAOLA_CLASSIFIER_BACKOFF_MS = '0';
        try {
          return classifier.classifyIssue(99, root);
        } finally {
          delete process.env.KAOLA_CLASSIFIER_BACKOFF_MS;
        }
      });
      assert.strictEqual(result.verdict, 'target_unavailable',
        '#519(gt-b2b): genuine-negative clean_nonzero → verdict:target_unavailable (got ' + result.verdict + ')');
      assert.strictEqual(callCount, 1,
        '#519(gt-b2b): determinate genuine NOT retried — callCount=' + callCount + ' (expected 1)');
    } finally {
      try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // (b-transient) clean_nonzero with a TRANSIENT-INFRA stderr now ESCALATES → indeterminate + RETRIED.
  {
    let callCount = 0;
    const root = tempRoot('kw-gt-b2t-root-');
    try {
      const result = withForge({ viewIssue: function() {
        callCount++;
        const e = new Error('tea exited 1');
        e.status = 1;
        e.stderr = 'error connecting to gitea.example: net/http: TLS handshake timeout\n';
        throw e;
      } }, function() {
        process.env.KAOLA_CLASSIFIER_BACKOFF_MS = '0';
        try { return classifier.classifyIssue(99, root); }
        finally { delete process.env.KAOLA_CLASSIFIER_BACKOFF_MS; }
      });
      assert.strictEqual(result.verdict, 'indeterminate',
        '#519(gt-b2-transient): clean_nonzero TLS-timeout stderr → verdict:indeterminate (got ' + result.verdict + ')');
      assert.strictEqual(callCount, 3,
        '#519(gt-b2-transient): transient-infra clean_nonzero RETRIED to max — callCount=' + callCount + ' (expected 3)');
    } finally {
      try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // (c) forge claimExplicitTarget with transient classifyIssue → target_indeterminate result:escalate
  // Exercises the #495 forward-compat handler in the gitea claim.js.
  {
    const root = tempRoot('kw-gt-b2c-root-');
    try {
      fs.mkdirSync(path.join(root, 'kaola-workflow', '.roadmap'), { recursive: true });
      const transientErr = new Error('spawn failed');
      transientErr.code = 'ENOENT';
      const result = withForge({ viewIssue: function() { throw transientErr; } }, function() {
        process.env.KAOLA_CLASSIFIER_BACKOFF_MS = '0';
        try {
          return claim.claimExplicitTarget(root, { targetIssue: 99 });
        } finally {
          delete process.env.KAOLA_CLASSIFIER_BACKOFF_MS;
        }
      });
      assert.strictEqual(result && result.status, 'target_indeterminate',
        '#507(gt-b2c): forge claimExplicitTarget persistent transient → target_indeterminate (got ' + JSON.stringify(result) + ')');
      assert.strictEqual(result && result.result, 'escalate',
        '#507(gt-b2c): result must be escalate (got ' + JSON.stringify(result) + ')');
    } finally {
      try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // (#511) END-TO-END determinate-refuse: a GENUINE-negative forge fault (a real 404 "Could not
  // resolve to an Issue" stderr) routes the FULL claim flow (claimExplicitTarget) to result:refuse /
  // target_unavailable — NEVER escalate. This is the #511 pin: it MUST use a genuine-negative stderr,
  // never a generic "tea exits 1" / bare network error (which now ESCALATES and would enshrine #519's
  // bug). Proves the genuine arm survives the axis replacement at the claim-flow boundary.
  {
    const root = tempRoot('kw-gt-511-root-');
    try {
      fs.mkdirSync(path.join(root, 'kaola-workflow', '.roadmap'), { recursive: true });
      const result = withForge({ viewIssue: function() {
        const e = new Error('tea exited 1');
        e.status = 1; // clean non-zero
        e.stderr = 'Could not resolve to an Issue with the number of 99.\n';
        throw e;
      } }, function() {
        process.env.KAOLA_CLASSIFIER_BACKOFF_MS = '0';
        try { return claim.claimExplicitTarget(root, { targetIssue: 99 }); }
        finally { delete process.env.KAOLA_CLASSIFIER_BACKOFF_MS; }
      });
      assert.strictEqual(result && result.status, 'target_unavailable',
        '#511(gt): genuine-negative 404 → claimExplicitTarget target_unavailable (got ' + JSON.stringify(result) + ')');
      assert.strictEqual(result && result.result, 'refuse',
        '#511(gt): genuine-negative 404 → result:refuse, NEVER escalate (got ' + JSON.stringify(result) + ')');
    } finally {
      try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
    }
  }

  console.log('testGiteaBoundary2FetchRetry507 (#507/#511/#519): PASSED');
}

function testGiteaReplanEditionContract699() {
  const repoRoot = path.resolve(giteaPluginRoot, '..', '..');
  const replanScript = path.join(__dirname, 'kaola-gitea-workflow-replan.js');
  const adaptiveNodeScript = path.join(__dirname, 'kaola-gitea-workflow-adaptive-node.js');
  const handoffScript = path.join(__dirname, 'kaola-gitea-workflow-adaptive-handoff.js');
  const schema = require('./kaola-workflow-adaptive-schema');
  const replan = require(replanScript);
  const adaptiveNode = require(adaptiveNodeScript);
  const handoff = require(handoffScript);
  const manifest = require(path.join(repoRoot, 'scripts', 'kaola-workflow-install-manifest.js'));
  const parseLast = run => JSON.parse(String(run.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop());

  assert.deepStrictEqual(manifest.supportScripts('gitea').filter(name => /workflow-replan\.js$/.test(name)),
    ['kaola-gitea-workflow-replan.js'],
    'Gitea re-plan smoke: manifest must install exactly the renamed aggregator');
  assert.deepStrictEqual(schema.REPLAN_PHASES,
    ['prepared', 'planner_pending', 'child_frozen', 'parent_archived', 'committed']);
  assert.deepStrictEqual(schema.REPLAN_STATUSES,
    ['none', 'in_progress', 'candidate_changed', 'consent_halt']);
  assert.deepStrictEqual(schema.REPLAN_CAS_SEAMS,
    ['prepare', 'pre_freeze', 'pre_snapshot', 'pre_activation']);

  const missingCli = spawnSync(process.execPath,
    [replanScript, 'status', '--project', 'n5-missing-gitea-smoke', '--json'],
    { cwd: repoRoot, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
  assert.notStrictEqual(missingCli.status, 0);
  assert.strictEqual(parseLast(missingCli).reason, 'replan_authority_path_invalid',
    'Gitea re-plan smoke: renamed aggregator must execute its typed missing-authority refusal');

  // R6-699-03: buildPlannerPacket reads transaction.snapshot.{authority_projection,authority_digest},
  // so the fixture transaction must carry a real projection built the way prepareReplan does (via the
  // exported buildSnapshotAuthorityProjection) and its canonical digest, not a hand-typed placeholder.
  const n5Transaction = {
    transaction_id: '8'.repeat(64), transition_reason: 'review_repair_requires_replan',
    parent: {
      claim_identity: { repository_id: 'repo', worktree_path: repoRoot },
      claim_identity_digest: '1'.repeat(64), claim_root_base_digest: '2'.repeat(64),
      plan_epoch: 1, plan_hash: '3'.repeat(64),
      plan_digest: schema.sha256Hex(Buffer.from('n5-gitea-plan')),
      task_mirror_exact_digest: schema.sha256Hex(Buffer.from('n5-gitea-task-mirror')),
      ledger_digest: schema.sha256Hex(Buffer.from('n5-gitea-ledger')),
      state_authority_digest: schema.sha256Hex(Buffer.from('n5-gitea-state-authority')),
    },
    epoch_lineage_id: '4'.repeat(64),
    source: {
      source_attempt_ids: ['review:1'], source_reason: 'review_repair_requires_replan',
      source_evidence_digest: '5'.repeat(64), producer_slice: [], findings: [], rebind: [],
      inherited_frontier_classes: ['code'], validation_obligations: [],
      journal_digest: schema.sha256Hex(Buffer.from('n5-gitea-journal')),
    },
    cas: { prepare: { candidate_digest: '6'.repeat(64), claim_root_base_digest: '2'.repeat(64),
      inherited_frontier_digest: '7'.repeat(64) } },
    budget: {
      count_before: 0, ceiling: 2, transition_cost: 1, case_b_exemption: false,
      case_b_proof: null, consent_ledger_digest: '9'.repeat(64),
    },
    planner: { profile_identity: 'workflow-planner-replan-v1', dispatch_nonce: 'dispatch-n5' },
  };
  n5Transaction.snapshot = {
    authority_projection: replan.buildSnapshotAuthorityProjection(n5Transaction),
  };
  n5Transaction.snapshot.authority_digest = schema.sha256Canonical(n5Transaction.snapshot.authority_projection);
  const packet = replan.buildPlannerPacket({ project: 'issue-n5-gitea' }, n5Transaction);
  const packetKeys = new Set();
  (function collect(value) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) return value.forEach(collect);
    for (const [key, child] of Object.entries(value)) { packetKeys.add(key); collect(child); }
  })(packet);
  for (const forbiddenKey of ['nodes', 'node_ids', 'roles', 'depends_on', 'declared_write_set',
    'write_set', 'cardinality', 'shape', 'model', 'build_order']) {
    assert(!packetKeys.has(forbiddenKey),
      'Gitea re-plan smoke: planner packet must omit main-authored DAG key ' + forbiddenKey);
  }
  assert.strictEqual(packet.child_output_path, 'workflow-plan.next.md');

  const childPath = path.join(os.tmpdir(), 'kw-n5-gitea-attestation', 'workflow-plan.next.md');
  let unattestedWrites = 0;
  const unattested = handoff.runReplanHandoff({
    childPath, childContent: 'planner draft\n', transactionId: 'a'.repeat(64),
    authority: {
      verified: true, candidate_match: true, claim_root_match: true, inherited_frontier_match: true,
      transaction_id: 'a'.repeat(64), child_path: childPath,
      child_digest: schema.sha256Hex(Buffer.from('planner draft\n')), dispatch_nonce: 'dispatch-n5',
    },
    expected: { child_path: childPath, planner_binding: 'dispatch-n5' },
    writeFile: () => { unattestedWrites++; },
  });
  assert.strictEqual(unattested.reason, 'replan_child_authority_unverified');
  assert.strictEqual(unattestedWrites, 0,
    'Gitea re-plan smoke: missing planner attestation must refuse before writing');

  const orientation = adaptiveNode.replanOrientation({
    reason: 'replan_in_progress', phase: 'planner_pending', transaction_id: 'a'.repeat(64),
    legal_mutation: 'replan resume', transaction: {
      transaction_id: 'a'.repeat(64), phase: 'planner_pending',
      parent: { plan_hash: 'b'.repeat(64) }, child: {}, cas: {},
    },
  }, 'issue-n5-gitea');
  assert.strictEqual(orientation.resume_command,
    'node scripts/kaola-gitea-workflow-replan.js resume --project issue-n5-gitea --json');

  const fenceRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-n5-gitea-fence-')));
  try {
    spawnSync('git', ['init', '-q'], { cwd: fenceRoot, encoding: 'utf8' });
    const project = 'issue-n5-gitea-fence';
    const projectDir = path.join(fenceRoot, 'kaola-workflow', project);
    const cacheDir = path.join(projectDir, '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const stateBytes = Buffer.from([
      '# Kaola-Workflow State', '', '## Project', 'name: ' + project, 'status: active', '',
      '## Epoch Lineage', 'replan_status: in_progress', 'replan_phase: planner_pending',
      'replan_transaction_id: ' + 'c'.repeat(64), '',
    ].join('\n'));
    const planBytes = Buffer.from('# deliberately invalid frozen parent\n');
    fs.writeFileSync(path.join(projectDir, 'workflow-state.md'), stateBytes);
    fs.writeFileSync(path.join(projectDir, 'workflow-plan.md'), planBytes);
    fs.writeFileSync(path.join(cacheDir, 'replan-transaction.json'), '{}\n');
    const beforeCache = new Map(fs.readdirSync(cacheDir).map(name =>
      [name, fs.readFileSync(path.join(cacheDir, name))]));
    const calls = [
      [adaptiveNodeScript, ['open-next', '--project', project, '--json']],
      [handoffScript, ['--project', project, '--json']],
      [planValidatorScript, [path.join(projectDir, 'workflow-plan.md'), '--finalize-check', '--json']],
      [claimScript, ['finalize', '--project', project, '--json']],
    ];
    for (const [script, args] of calls) {
      const run = spawnSync(process.execPath, [script, ...args], {
        cwd: fenceRoot, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' },
      });
      assert.notStrictEqual(run.status, 0,
        'Gitea re-plan smoke: half-transition must refuse ' + path.basename(script));
      assert.strictEqual(parseLast(run).reason, 'replan_transaction_invalid');
    }
    assert(fs.readFileSync(path.join(projectDir, 'workflow-state.md')).equals(stateBytes));
    assert(fs.readFileSync(path.join(projectDir, 'workflow-plan.md')).equals(planBytes));
    assert.deepStrictEqual(fs.readdirSync(cacheDir).sort(), [...beforeCache.keys()].sort(),
      'Gitea re-plan smoke: half-transition refusals must not add cache side effects');
    for (const [name, bytes] of beforeCache) {
      assert(fs.readFileSync(path.join(cacheDir, name)).equals(bytes),
        'Gitea re-plan smoke: half-transition refusal mutated cache file ' + name);
    }
    assert(!fs.existsSync(path.join(cacheDir, 'scheduler.lock'))
        && !fs.existsSync(path.join(cacheDir, 'orient-envelope.json'))
        && !fs.existsSync(path.join(fenceRoot, 'kaola-workflow', 'archive')),
    'Gitea re-plan smoke: scheduler/finalize fence must create no lock, envelope, or archive');
  } finally { fs.rmSync(fenceRoot, { recursive: true, force: true }); }

  const archiveRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-n5-gitea-archive-')));
  try {
    const project = 'issue-n5-gitea-archive';
    const projectDir = path.join(archiveRoot, 'kaola-workflow', project);
    const epochDir = path.join(projectDir, '.cache', 'epochs', '1');
    const filesDir = path.join(epochDir, 'files', '.cache');
    fs.mkdirSync(filesDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'workflow-state.md'), [
      '# Kaola-Workflow State', '', '## Project', 'name: ' + project, 'status: active', '',
      '## Sink', 'issue_number: 699', 'sink: merge', '',
    ].join('\n'));
    const rebindBytes = Buffer.from('{"attempts":[{"attempt_id":"review:1","rebind":[]}]}\n');
    const rebindPath = path.join(filesDir, 'review-attempts.json');
    fs.writeFileSync(rebindPath, rebindBytes);
    const stat = fs.statSync(rebindPath);
    const snapshot = {
      schema_version: 1, parent_plan_epoch: 1, epoch_lineage_id: 'd'.repeat(64),
      transaction_id: 'e'.repeat(64), claim_root_base_digest: 'f'.repeat(64),
      files: [{ path: '.cache/review-attempts.json', size: stat.size,
        mode: (stat.mode & 0o777).toString(8).padStart(3, '0'), digest: schema.sha256Hex(rebindBytes) }],
    };
    snapshot.manifest_self_digest = schema.snapshotManifestDigest(snapshot);
    fs.writeFileSync(path.join(epochDir, 'manifest.json'), schema.canonicalJson(snapshot) + '\n');
    // Fail-closed edition contract: a schema-1 manifest with no external-seal chain cannot
    // digest-verify (a genuine schema-2 snapshot is only ever produced by the full replan
    // lifecycle, exercised end to end in test-replan.js). The forge port must refuse this
    // unverifiable epoch snapshot at BOTH the shared verifier and the archive preflight, and
    // must never delete a live project whose epoch-snapshot authority does not verify.
    const verified = replan.verifyAllEpochSnapshots(projectDir);
    assert(!verified.ok && verified.reason === 'legacy_snapshot_binding_unsealed',
      'Gitea re-plan smoke: an unsealed epoch snapshot must refuse digest verification, got ' + JSON.stringify(verified));
    const archived = claim.archiveProjectDir(archiveRoot, project, 'closed');
    assert(archived.archived !== true && archived.archive_incomplete === true
      && archived.snapshot_error === 'legacy_snapshot_binding_unsealed',
    'Gitea re-plan smoke: archive must refuse an unverifiable epoch snapshot before any delete, got ' + JSON.stringify(archived));
    assert(fs.existsSync(projectDir) && !fs.existsSync(path.join(archiveRoot, 'kaola-workflow', 'archive')),
      'Gitea re-plan smoke: a refused archive must preserve the live project and create no archive dir');
  } finally { fs.rmSync(archiveRoot, { recursive: true, force: true }); }

  console.log('testGiteaReplanEditionContract699: PASSED');
}

testGiteaReplanEditionContract699();
testGiteaFinalizeRowMainDirect338();
testInstallSchemaPruneManifest332Gitea();
testGiteaPreflight266();
testGiteaDispatchPosture598();
testGiteaPreflight571();
testGiteaPreflight332();
testGiteaTaskMirror266();
testGiteaCompactResume266();
testGiteaForeignArchiveBarrier261();
testGiteaMirrorCleanCrossRef339();
testGiteaAdaptiveNodeOperatorHint445();
testGiteaPlanValidatorRefusalMatrix401();
testForbiddenOnly341();
testGiteaBoundary2FetchRetry507();

// #725: the #543 installed_paths partition smoke is retired — the fast/full installer opt-ins
// (`--with-fast`/`--with-full`) and the seedKaolaConfig UNION writer that recorded them are gone;
// adaptive is the only installed path, so the installer never writes installed_paths.

// #579: forge active-folders liveness-marker fields regression — session_marker/claim_ts/main_root
// must be parsed from workflow-state.md and surfaced in readActiveFolders items so that
// classifyLane can bucket a live lane as 'mine' (not 'stale') in the gitea edition.
// RED against the unfixed gitea active-folders (session_marker not parsed → undefined →
// classifyLane falls through to stale). GREEN after the fix.
function testGiteaActiveFoldersSessionMarker579() {
  const root = tempRoot('kw-gt-sm579-');
  try {
    const ownSession = 's-MINE-session-579gt';
    const claimTs = new Date(Date.now() - 10000).toISOString();
    writeState(root, 'lane-mine-gt', 579,
      'session_marker: ' + ownSession + '\nmain_root: /repo/root\nclaim_ts: ' + claimTs);
    const folders = active.readActiveFolders(root, { excludeClosedIssues: false });
    assert.strictEqual(folders.length, 1, '#579(gt): expected 1 active folder');
    const item = folders[0];
    assert.strictEqual(item.session_marker, ownSession,
      '#579(gt): readActiveFolders item.session_marker must be "' + ownSession + '", got: ' + item.session_marker);
    const ctx = {
      ownSession,
      explicitResumeIssues: new Set(),
      coTenantSignal: false,
      now: Date.now(),
      staleMs: 3600000
    };
    const laneResult = classifier.classifyLane(item, ctx);
    assert.strictEqual(laneResult.bucket, 'mine',
      '#579(gt): classifyLane must yield mine for own session, got: ' + JSON.stringify(laneResult));
    console.log('testGiteaActiveFoldersSessionMarker579: PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

testGiteaActiveFoldersSessionMarker579();

testGiteaRoadmapInitIssueExclusiveAndUpdate()
  .then(() => {
    console.log('Gitea workflow script tests passed');
  })
  .catch(err => {
    console.error(err && err.stack ? err.stack : String(err));
    process.exitCode = 1;
  });
