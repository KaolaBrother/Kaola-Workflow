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

const forge = require('./kaola-gitlab-forge');
const active = require('./kaola-gitlab-workflow-active-folders');
const classifier = require('./kaola-gitlab-workflow-classifier');
const claim = require('./kaola-gitlab-workflow-claim');
const roadmap = require('./kaola-gitlab-workflow-roadmap');
const repair = require('./kaola-gitlab-workflow-repair-state');

const claimScript = path.join(__dirname, 'kaola-gitlab-workflow-claim.js');
const roadmapScript = path.join(__dirname, 'kaola-gitlab-workflow-roadmap.js');
const classifierScript = path.join(__dirname, 'kaola-gitlab-workflow-classifier.js');
const closureAuditScript = path.join(__dirname, 'kaola-gitlab-workflow-closure-audit.js');

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

function writeState(root, project, issueIid, extra) {
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
    '## GitLab',
    'issue_iid: ' + issueIid,
    'project_id: 77',
    'path_with_namespace: group/project',
    'project_web_url: https://gitlab.example/group/project',
    '',
    '## Sink',
    'branch: workflow/gitlab-issue-' + issueIid,
    'issue_number: ' + issueIid,
    'sink: merge',
    extra || ''
  ].join('\n') + '\n');
  return dir;
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

function runClaimOnline(args, cwd, binDir, extraEnv) {
  const result = spawnSync(process.execPath, [claimScript, ...args], {
    cwd, encoding: 'utf8', timeout: 60000,
    env: {
      ...process.env,
      KAOLA_WORKTREE_NATIVE: '1',
      ...(extraEnv || {}),
      KAOLA_WORKFLOW_OFFLINE: '0',
      ...glabMockEnv(binDir),
      PATH: binDir + path.delimiter + path.dirname(process.execPath) + path.delimiter + (process.env.PATH || '')
    }
  });
  assert(!result.signal, 'online claim killed: ' + result.signal + '\n' + result.stderr);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim());
}

// On macOS 15 (Darwin 25.4.0), execFileSync(scriptPath, args) hangs when
// scriptPath has ANY shebang. Solution: write only the .js logic file; callers
// set KAOLA_GLAB_MOCK_SCRIPT so glabExec routes through process.execPath.
function writeShimFiles(shimPath, jsLines) {
  fs.writeFileSync(shimPath + '.js', jsLines.join('\n'));
}

function glabMockEnv(binDir) {
  const jsPath = path.join(binDir, 'glab.js');
  return fs.existsSync(jsPath) ? { KAOLA_GLAB_MOCK_SCRIPT: jsPath } : {};
}

// Run closure-audit online (mock glab via KAOLA_GLAB_MOCK_SCRIPT). Mirrors GitHub runClosureAudit.
function runClosureAudit(args, cwd, binDir, extraEnv) {
  const result = spawnSync(process.execPath, [closureAuditScript, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 60000,
    env: {
      ...process.env,
      ...(extraEnv || {}),
      KAOLA_WORKFLOW_OFFLINE: '0',
      ...glabMockEnv(binDir),
      PATH: binDir + path.delimiter + path.dirname(process.execPath) + path.delimiter + (process.env.PATH || '')
    }
  });
  assert(!result.signal, 'closure-audit timed out or was killed: ' + result.signal + '\nstderr: ' + result.stderr);
  assert.strictEqual(result.status, 0, 'closure-audit should exit 0, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
  return JSON.parse(result.stdout);
}

// Run closure-audit offline (no glab shim; remote classes must report skipped_offline).
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

// Mirror the GitHub closureAuditShim but write a `glab` shim (GitLab CLI).
function closureAuditShim(binDir, lines) {
  fs.mkdirSync(binDir, { recursive: true });
  writeShimFiles(path.join(binDir, 'glab'), lines);
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

// Convert an existing active folder's state file into a sink=mr folder with mr_url/mr_iid.
// Mirrors the GitHub inline mutation; does NOT add a sink param to writeState.
function makeMrSinkFolder(root, project, issueNumber) {
  const stateFile = path.join(root, 'kaola-workflow', project, 'workflow-state.md');
  let content = fs.readFileSync(stateFile, 'utf8');
  content = content.replace(/^sink:\s*.*$/m, 'sink: mr');
  content += 'mr_url: https://gitlab.example/group/project/-/merge_requests/' + issueNumber + '\n';
  content += 'mr_iid: ' + issueNumber + '\n';
  fs.writeFileSync(stateFile, content);
}

function writeGlabShimForStale(binDir) {
  fs.mkdirSync(binDir, { recursive: true });
  writeShimFiles(path.join(binDir, 'glab'), [
    "const a = process.argv.slice(2).join(' ');",
    "if (a.includes('issue view 100')) process.stdout.write('{\"state\":\"open\"}\\n');",
    "else if (a.includes('issue view 200')) process.stdout.write('{\"state\":\"closed\"}\\n');",
    "else if (a.includes('issue view 300')) process.stdout.write('{\"state\":\"open\"}\\n');",
    "else if (a.includes('issue view 400')) process.stdout.write('{\"state\":\"closed\"}\\n');",
    "else if (a.includes('repo view')) process.stdout.write('{\"id\":77}\\n');",
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

function testGitLabRoadmapGenerateMissingSourceGuard() {
  const root = tempRoot('kw-gl-roadmap-guard-');
  try {
    const workflowDir = path.join(root, 'kaola-workflow');
    fs.mkdirSync(workflowDir, { recursive: true });
    const roadmapPath = path.join(workflowDir, 'ROADMAP.md');
    fs.writeFileSync(roadmapPath, [
      '<!-- generated by plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap.js - do not edit -->',
      '# Kaola-Workflow GitLab Roadmap',
      '',
      'This file mirrors active unfinished GitLab work.',
      '',
      '## Active Work',
      '',
      '| Issue | Title | Status | Workflow Project | Next Step |',
      '|-------|-------|--------|------------------|-----------|',
      '| #999 | GitLab guard fixture | open | gitlab-guard-fixture | implement |',
      '',
      '## Rules',
      '',
      '- existing generated roadmap',
      ''
    ].join('\n'), 'utf8');

    const refused = runNodeRaw([roadmapScript, 'generate'], root);
    assert.strictEqual(refused.status, 1, 'GitLab generate should refuse to erase active generated roadmap when .roadmap is missing');
    assert(refused.stderr.includes('kaola-workflow/.roadmap is missing'), 'GitLab generate refusal should explain missing source directory');
    assert(read(roadmapPath).includes('| #999 |'), 'GitLab generate refusal should preserve existing active roadmap rows');

    const sourceDir = path.join(workflowDir, '.roadmap');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'issue-999.md'), [
      'issue: #999',
      'title: GitLab guard fixture',
      'status: open',
      'workflow_project: gitlab-guard-fixture',
      'next_step: implement',
      ''
    ].join('\n'), 'utf8');
    const generated = runNodeRaw([roadmapScript, 'generate'], root);
    assert.strictEqual(generated.status, 0, 'GitLab generate should succeed once per-issue source files exist');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testGitLabRoadmapGenerateAtomicReplace() {
  const root = tempRoot('kw-gl-roadmap-atomic-');
  try {
    const workflowDir = path.join(root, 'kaola-workflow');
    const sourceDir = path.join(workflowDir, '.roadmap');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'issue-998.md'), [
      'issue: #998',
      'title: GitLab atomic roadmap fixture',
      'status: open',
      'workflow_project: gitlab-atomic-roadmap-fixture',
      'next_step: generate',
      ''
    ].join('\n'), 'utf8');

    const generated = runNodeRaw([roadmapScript, 'generate'], root);
    assert.strictEqual(generated.status, 0, 'GitLab generate should succeed');
    const rendered = read(path.join(workflowDir, 'ROADMAP.md'));
    assert(rendered.includes('| #998 | GitLab atomic roadmap fixture | open | gitlab-atomic-roadmap-fixture | generate |'), 'GitLab generated roadmap should contain the source row');
    const tempFiles = fs.readdirSync(workflowDir).filter(name => /^\.ROADMAP\.md\..+\.tmp$/.test(name));
    assert.strictEqual(tempFiles.length, 0, 'GitLab atomic generate should not leave temp files after success');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testGitLabRoadmapFilenameAuthorityMissingIssueField() {
  const root = tempRoot('kw-gl-roadmap-fname-missing-');
  try {
    const workflowDir = path.join(root, 'kaola-workflow');
    const sourceDir = path.join(workflowDir, '.roadmap');
    fs.mkdirSync(sourceDir, { recursive: true });
    // NO 'issue:' line — issue number must come from filename
    fs.writeFileSync(path.join(sourceDir, 'issue-42.md'), [
      'title: GitLab filename authority test',
      'status: open',
      'workflow_project: gl-filename-authority-project',
      'next_step: verify',
      ''
    ].join('\n'), 'utf8');

    const result = runNodeRaw([roadmapScript, 'generate'], root);
    assert.strictEqual(result.status, 0, 'GitLab generate should succeed even with no issue: field');
    const rendered = read(path.join(workflowDir, 'ROADMAP.md'));
    assert(rendered.includes('| #42 |'), 'GitLab roadmap should contain | #42 | derived from filename; got:\n' + rendered);
    assert(!rendered.includes('No active work'), 'GitLab roadmap should NOT fall back to "No active work"; got:\n' + rendered);
    assert(rendered.includes('gl-filename-authority-project'), 'GitLab roadmap should include project name; got:\n' + rendered);
    console.log('testGitLabRoadmapFilenameAuthorityMissingIssueField: PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testGitLabRoadmapFilenameAuthorityMismatch() {
  const root = tempRoot('kw-gl-roadmap-fname-mismatch-');
  try {
    const workflowDir = path.join(root, 'kaola-workflow');
    const sourceDir = path.join(workflowDir, '.roadmap');
    fs.mkdirSync(sourceDir, { recursive: true });
    // issue: field says #999, but filename says issue-43.md — filename must win
    fs.writeFileSync(path.join(sourceDir, 'issue-43.md'), [
      'issue: #999',
      'title: GitLab filename authority mismatch test',
      'status: open',
      'workflow_project: gl-mismatch-project',
      'next_step: verify',
      ''
    ].join('\n'), 'utf8');

    const result = runNodeRaw([roadmapScript, 'generate'], root);
    assert.strictEqual(result.status, 0, 'GitLab generate should succeed; got: ' + result.stderr);
    const rendered = read(path.join(workflowDir, 'ROADMAP.md'));
    assert(rendered.includes('| #43 |'), 'GitLab roadmap should contain | #43 | (filename wins); got:\n' + rendered);
    assert(!rendered.includes('| #999 |'), 'GitLab roadmap must NOT contain | #999 | (content field loses); got:\n' + rendered);
    console.log('testGitLabRoadmapFilenameAuthorityMismatch: PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writeRoadmapIssue(root, issueIid, status) {
  const sourceDir = path.join(root, 'kaola-workflow', '.roadmap');
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, 'issue-' + issueIid + '.md'), [
    'issue: #' + issueIid,
    'title: GitLab remote validation fixture ' + issueIid,
    'status: ' + status,
    'workflow_project: gitlab-remote-validation-' + issueIid,
    'next_step: validate',
    ''
  ].join('\n'), 'utf8');
}

function testGitLabRoadmapValidateRemote() {
  const root = tempRoot('kw-gl-roadmap-validate-remote-');
  try {
    writeRoadmapIssue(root, 996, 'open');
    writeRoadmapIssue(root, 995, 'open');
    writeRoadmapIssue(root, 994, 'closed');
    withForge({
      viewIssue(issueIid) {
        if (issueIid === 996) return { state: 'closed' };
        if (issueIid === 995) return { state: 'opened' };
        if (issueIid === 994) return { state: 'closed' };
        throw new Error('unexpected issue ' + issueIid);
      }
    }, () => {
      assert.deepStrictEqual(roadmap.validateRemote(root), [996],
        'GitLab validateRemote should report only open local entries closed on remote');
    });

    const result = spawnSync(process.execPath, [roadmapScript, 'validate-remote'], {
      cwd: root,
      encoding: 'utf8',
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' })
    });
    assert.strictEqual(result.status, 0, 'GitLab validate-remote offline should exit 0: ' + result.stderr);
    assert.strictEqual(result.stdout.trim(), 'skipped: offline',
      'GitLab validate-remote offline should print skipped: offline');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Issue #223 — three lifecycle fixes, gitlab edition
// ---------------------------------------------------------------------------

// Test 1: watch-mr CLOSED path must NOT fire roadmap invariants when archive=abandoned
function testWatchMrAbandonedClosureInvariantsClean() {
  const root = tempRoot('kw-gl-watchmr-abandoned-inv-');
  try {
    initGitRepo(root);
    writeState(root, 'issue-920', 920, 'mr_iid: 920');
    makeMrSinkFolder(root, 'issue-920', 920);
    plantClosureRoadmapSource(root, 920);
    // Generate ROADMAP.md so it contains #920
    roadmap.regenerateRoadmap(root);
    assert(fs.readFileSync(path.join(root, 'kaola-workflow', 'ROADMAP.md'), 'utf8').includes('#920'),
      'ROADMAP.md must contain #920 before watch-mr');
    const result = withForge({
      viewMergeRequest(mrIid) {
        assert.strictEqual(mrIid, 920);
        return { mr_iid: 920, state: 'closed' };
      },
      updateIssue() { return null; },
      createIssueNote() { return { id: 9003 }; }
    }, () => claim.watchMergeRequests(root, {}));
    assert.strictEqual(result.watched, 1, 'watched must be 1');
    assert(Array.isArray(result.cleanups) && result.cleanups.length > 0,
      'cleanups must have an entry for CLOSED MR, got: ' + JSON.stringify(result));
    const cleanup = result.cleanups[0];
    assert(cleanup.receipt && cleanup.receipt.archive === 'abandoned',
      'receipt.archive must be abandoned, got: ' + JSON.stringify(cleanup.receipt));
    assert(cleanup.closure_invariants && cleanup.closure_invariants.ok === true,
      'closure_invariants.ok must be true for abandoned MR, got: ' + JSON.stringify(cleanup.closure_invariants));
    console.log('testWatchMrAbandonedClosureInvariantsClean: PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Test 2: claimProject must reclaim a stateless orphan dir (no workflow-state.md)
function testGitlabClaimReclaimsStatelessOrphanDir() {
  const root = tempRoot('kw-gl-claim-orphan-');
  try {
    // Positive: orphan dir with no state file
    const orphanDir = path.join(root, 'kaola-workflow', 'issue-888');
    fs.mkdirSync(orphanDir, { recursive: true });
    assert(!fs.existsSync(path.join(orphanDir, 'workflow-state.md')), 'fixture: no state file should exist');
    const result = withForge({
      discoverProject() { return { project_id: null, path_with_namespace: null, web_url: null }; }
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
      discoverProject() { return { project_id: null, path_with_namespace: null, web_url: null }; }
    }, () => claim.claimProject(root, { project: 'issue-889' }));
    assert.strictEqual(result2.status, 'target_occupied',
      '#14 NEGATIVE: dir with non-active state file must return target_occupied, got: ' + JSON.stringify(result2));
    console.log('testGitlabClaimReclaimsStatelessOrphanDir: PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Test 3: cmdPatchBranch must guard against non-existent projects and unsafe names
function testGitlabPatchBranchGuards() {
  // (a) ghost project: non-existent project → exit non-zero, dir not created
  {
    const root = tempRoot('kw-gl-patchbranch-ghost-');
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
    const root = tempRoot('kw-gl-patchbranch-escape-');
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
    const root = tempRoot('kw-gl-patchbranch-active-');
    try {
      writeState(root, 'issue-63', 63, '');
      const r = spawnSync(process.execPath, [claimScript, 'patch-branch', '--project', 'issue-63', '--branch', 'workflow/gitlab-issue-63'], {
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
  console.log('testGitlabPatchBranchGuards: PASSED');
}

async function testGitLabRoadmapInitIssueExclusiveAndUpdate() {
  const root = tempRoot('kw-gl-roadmap-init-');
  try {
    fs.mkdirSync(path.join(root, 'kaola-workflow', '.roadmap'), { recursive: true });
    const args = [
      roadmapScript,
      'init-issue',
      '--issue', '997',
      '--title', 'GitLab exclusive init fixture',
      '--status', 'open',
      '--workflow-project', 'gitlab-exclusive-init-fixture',
      '--next-step', 'plan'
    ];
    const [first, second] = await Promise.all([
      runNodeAsync(args, root),
      runNodeAsync(args, root)
    ]);
    assert.strictEqual(first.status, 0, first.stderr || first.stdout);
    assert.strictEqual(second.status, 0, second.stderr || second.stdout);

    const outputs = [first.stdout, second.stdout].join('\n');
    const created = (outputs.match(/created: issue-997\.md/g) || []).length;
    const skipped = (outputs.match(/skip: issue-997\.md already exists/g) || []).length;
    assert.strictEqual(created, 1, 'GitLab concurrent init-issue should create exactly one source file');
    assert.strictEqual(skipped, 1, 'GitLab concurrent init-issue loser should skip cleanly');

    const sourceFile = path.join(root, 'kaola-workflow', '.roadmap', 'issue-997.md');
    assert(read(sourceFile).includes('workflow_project: gitlab-exclusive-init-fixture'), 'GitLab exclusive source file should contain the requested content');

    const skippedUpdate = runNodeRaw([
      roadmapScript,
      'init-issue',
      '--issue', '997',
      '--title', 'GitLab changed init fixture',
      '--status', 'open',
      '--workflow-project', 'gitlab-changed-init-fixture',
      '--next-step', 'plan'
    ], root);
    assert.strictEqual(skippedUpdate.status, 0, skippedUpdate.stderr || skippedUpdate.stdout);
    assert(skippedUpdate.stdout.includes('skip: issue-997.md already exists'), 'GitLab duplicate init-issue should report skipped without --update');
    assert(read(sourceFile).includes('workflow_project: gitlab-exclusive-init-fixture'), 'GitLab duplicate init-issue should not rewrite without --update');

    const updated = runNodeRaw([
      roadmapScript,
      'init-issue',
      '--issue', '997',
      '--title', 'GitLab changed init fixture',
      '--status', 'open',
      '--workflow-project', 'gitlab-changed-init-fixture',
      '--next-step', 'plan',
      '--update'
    ], root);
    assert.strictEqual(updated.status, 0, updated.stderr || updated.stdout);
    assert(updated.stdout.includes('updated: issue-997.md'), 'GitLab explicit init-issue update should report updated');
    assert(read(sourceFile).includes('workflow_project: gitlab-changed-init-fixture'), 'GitLab explicit init-issue update should rewrite the issue source');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

testGitLabRoadmapGenerateMissingSourceGuard();
testGitLabRoadmapGenerateAtomicReplace();
testGitLabRoadmapFilenameAuthorityMissingIssueField();
testGitLabRoadmapFilenameAuthorityMismatch();

withForge({
  viewIssue(issueIid) {
    return { issue_iid: issueIid, number: issueIid, state: issueIid === 11 ? 'closed' : 'open', labels: [] };
  }
}, () => {
  const root = tempRoot('kw-gl-active-');
  writeState(root, 'open-project', 10);
  writeState(root, 'closed-project', 11);
  const folders = active.readActiveFolders(root);
  assert.deepStrictEqual(folders.map(folder => folder.project), ['open-project']);
  assert.strictEqual(folders[0].issue_iid, 10);
});

// --- Task 2: probeIssueState ---
// Case 1: issueIid null → { state: 'open', reason: 'offline-or-null' }
{
  const result = active.probeIssueState(null);
  assert.strictEqual(result.state, 'open', 'probeIssueState(null) must return state: open');
  assert.strictEqual(result.reason, 'offline-or-null', 'probeIssueState(null) must return reason: offline-or-null');
  console.log('probeIssueState null: PASS');
}

// Case 2: forge.viewIssue throws → { state: 'unavailable', reason: 'glab issue fetch failed' }
withForge({
  viewIssue() { throw new Error('network error'); }
}, () => {
  const result = active.probeIssueState(42);
  assert.strictEqual(result.state, 'unavailable', 'probeIssueState throw must return state: unavailable');
  assert.strictEqual(result.reason, 'glab issue fetch failed', 'probeIssueState throw must return expected reason');
  console.log('probeIssueState throws: PASS');
});

// Case 3: forge.viewIssue returns { state: 'closed' } → { state: 'closed', reason: 'ok' }
withForge({
  viewIssue(issueIid) {
    return { issue_iid: issueIid, state: 'closed' };
  }
}, () => {
  const result = active.probeIssueState(43);
  assert.strictEqual(result.state, 'closed', 'probeIssueState closed issue must return state: closed');
  assert.strictEqual(result.reason, 'ok', 'probeIssueState closed issue must return reason: ok');
  console.log('probeIssueState closed: PASS');
});

// Case 4: forge.viewIssue returns residual/unknown state → { state: 'unavailable', reason: 'glab issue state unverified' }
withForge({ viewIssue() { return { state: 'unknown' }; } }, () => {
  const result = active.probeIssueState(44);
  assert.strictEqual(result.state, 'unavailable', 'residual state must map to unavailable');
  assert.strictEqual(result.reason, 'glab issue state unverified', 'residual reason');
});

withForge({
  viewIssue(issueIid) {
    return {
      issue_iid: issueIid,
      number: issueIid,
      state: 'open',
      labels: [forge.CLAIM_LABEL],
      body: 'touches: plugins/kaola-workflow-gitlab/scripts/new-file.js'
    };
  }
}, () => {
  const root = tempRoot('kw-gl-classify-');
  const result = classifier.classifyIssue(20, root);
  assert.strictEqual(result.verdict, 'blocked');
});

withForge({
  viewIssue(issueIid) {
    return {
      issue_iid: issueIid,
      number: issueIid,
      state: 'open',
      labels: [],
      body: 'touches: plugins/kaola-workflow-gitlab/scripts/claimed.js'
    };
  }
}, () => {
  const root = tempRoot('kw-gl-overlap-');
  const dir = writeState(root, 'claimed-project', 21);
  fs.writeFileSync(path.join(dir, 'phase3-plan.md'), 'Write Set: plugins/kaola-workflow-gitlab/scripts/claimed.js\n');
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
      body: 'touches: plugins/kaola-workflow-gitlab/scripts/claimed.js'
    };
  }
}, () => {
  const root = tempRoot('kw-gl-fast-overlap-');
  const dir = writeState(root, 'fast-claimed-project', 24);
  fs.writeFileSync(path.join(dir, 'fast-summary.md'),
    '# Fast Summary: fast-claimed-project\n\n## Status\nIN_PROGRESS\n\n## Scope\n- Write Set: plugins/kaola-workflow-gitlab/scripts/claimed.js\n- Acceptance: node x\n');
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
      body: 'touches: plugins/kaola-workflow-gitlab/scripts/claimed.js'
    };
  }
}, () => {
  const root = tempRoot('kw-gl-fast-iso-');
  const dir = writeState(root, 'fast-iso-project', 26);
  fs.writeFileSync(path.join(dir, 'fast-summary.md'),
    '# Fast Summary: fast-iso-project\n\n## Status\nPASSED\n\n## Scope\n- Write Set: docs/api.md\n- Acceptance: node x\n\n## Implementation Evidence\nran plugins/kaola-workflow-gitlab/scripts/claimed.js\n');
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
      body: 'touches: plugins/kaola-workflow-gitlab/scripts/claimed.js'
    };
  }
}, () => {
  const root = tempRoot('kw-gl-fast-fence-');
  const dir = writeState(root, 'fast-fence-project', 28);
  fs.writeFileSync(path.join(dir, 'fast-summary.md'),
    '# Fast Summary: fast-fence-project\n\n## Status\nIN_PROGRESS\n\n## Scope\n```sh\n# set up before writing\n```\n- Write Set: plugins/kaola-workflow-gitlab/scripts/claimed.js\n- Acceptance: node x\n');
  const result = classifier.classifyIssue(29, root);
  assert.strictEqual(result.verdict, 'red');
});

// issue #215 Block 1: a `## Some Heading` line inside a fenced code block within ## Scope must
// NOT truncate the slice (boundary is h2-only). A `- Write Set:` path BELOW the
// fenced `## Some Heading` must still be counted; a candidate overlapping it must RED.
withForge({
  viewIssue(issueIid) {
    return { issue_iid: issueIid, number: issueIid, state: 'open', labels: [], body: 'touches: plugins/kaola-workflow-gitlab/scripts/claimed.js' };
  }
}, () => {
  const root = tempRoot('kw-gl-fast-fence-heading-');
  const dir = writeState(root, 'fast-fence-heading-project', 30);
  fs.writeFileSync(path.join(dir, 'fast-summary.md'),
    '# Fast Summary: fast-fence-heading-project\n\n## Status\nIN_PROGRESS\n\n## Scope\n```sh\n## Some Heading\n```\n- Write Set: plugins/kaola-workflow-gitlab/scripts/claimed.js\n- Acceptance: node x\n');
  const result = classifier.classifyIssue(31, root);
  assert.strictEqual(result.verdict, 'red');
});

// issue #215 Block 2: a `~~~` mixed-marker fence nested inside a backtick fence within ## Scope
// must NOT truncate the slice. A `- Write Set:` path BELOW the nested markers must still be
// counted; a candidate overlapping it must RED.
withForge({
  viewIssue(issueIid) {
    return { issue_iid: issueIid, number: issueIid, state: 'open', labels: [], body: 'touches: plugins/kaola-workflow-gitlab/scripts/claimed.js' };
  }
}, () => {
  const root = tempRoot('kw-gl-fast-fence-mixed-');
  const dir = writeState(root, 'fast-fence-mixed-project', 32);
  fs.writeFileSync(path.join(dir, 'fast-summary.md'),
    '# Fast Summary: fast-fence-mixed-project\n\n## Status\nIN_PROGRESS\n\n## Scope\n```sh\n~~~\n## Heading\n```\n- Write Set: plugins/kaola-workflow-gitlab/scripts/claimed.js\n- Acceptance: node x\n');
  const result = classifier.classifyIssue(33, root);
  assert.strictEqual(result.verdict, 'red');
});

// issue #215 regression: an unterminated fence in a section BEFORE ## Scope must NOT
// prevent sectionBody from finding ## Scope. The buggy locator stayed inFence=true after
// an unclosed fence in ## Status, skipped ## Scope, returned '' → no Write Set → green.
// FAILING-FIRST against the buggy locator.
withForge({
  viewIssue(issueIid) {
    return { issue_iid: issueIid, number: issueIid, state: 'open', labels: [], body: 'touches: plugins/kaola-workflow-gitlab/scripts/claimed.js' };
  }
}, () => {
  const root = tempRoot('kw-gl-fast-fence-pre-');
  const dir = writeState(root, 'fast-fence-pre-project', 34);
  fs.writeFileSync(path.join(dir, 'fast-summary.md'),
    '# Fast Summary: fast-fence-pre-project\n\n## Status\n```sh\nIN_PROGRESS\n## Scope\n- Write Set: plugins/kaola-workflow-gitlab/scripts/claimed.js\n- Acceptance: node x\n');
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
  const root = tempRoot('kw-gl-list-');
  try {
    assert.deepStrictEqual(claim.listOpenIssues(root).map(issue => issue.issue_iid), [7, 9]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// readPriorityConfig tests
{
  // Case a: missing config → default
  const root = tempRoot('kw-gl-rpc-');
  try {
    assert.deepStrictEqual(claim.readPriorityConfig(root), ['P0', 'P1']);
    console.log('readPriorityConfig missing config: PASS');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
{
  // Case b: valid array config → custom
  const root = tempRoot('kw-gl-rpc-');
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
  const root = tempRoot('kw-gl-rpc-');
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
  const root = tempRoot('kw-gl-sort-');
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
    return { project_id: 77, path_with_namespace: 'group/project', web_url: 'https://gitlab.example/group/project' };
  },
  updateIssue(issueIid, opts) {
    assert.strictEqual(issueIid, 23);
    assert.deepStrictEqual(opts.labels, [forge.CLAIM_LABEL]);
    return { issue_iid: issueIid, state: 'open' };
  },
  createIssueNote(project, issueIid, body) {
    assert.strictEqual(project.project_id, 77);
    assert.strictEqual(issueIid, 23);
    assert(body.includes('issue-23'));
    return { id: 9001 };
  }
}, () => {
  const root = tempRoot('kw-gl-claim-');
  const result = claim.claimExplicitTarget(root, { targetIssue: 23 });
  assert.strictEqual(result.status, 'acquired');
  const state = fs.readFileSync(path.join(root, 'kaola-workflow', 'issue-23', 'workflow-state.md'), 'utf8');
  assert(state.includes('issue_iid: 23'));
  assert(state.includes('project_id: 77'));
  assert(state.includes('path_with_namespace: group/project'));
});

withForge({
  listIssues() {
    return [{
      issue_iid: 30,
      number: 30,
      title: 'Roadmap item',
      state: 'open',
      labels: ['workflow:queued', 'area:gitlab'],
      web_url: 'https://gitlab.example/group/project/-/issues/30'
    }];
  }
}, () => {
  const root = tempRoot('kw-gl-roadmap-');
  const result = roadmap.refreshFromGitLab(root);
  assert.strictEqual(result.issues, 1);
  const record = fs.readFileSync(path.join(root, 'kaola-workflow', '.roadmap', 'issue-30.md'), 'utf8');
  assert(record.includes('labels: workflow:queued, area:gitlab'));
  assert(record.includes('url: https://gitlab.example/group/project/-/issues/30'));
  const rendered = fs.readFileSync(path.join(root, 'kaola-workflow', 'ROADMAP.md'), 'utf8');
  assert(rendered.includes('| #30 | Roadmap item | open | issue-30 | https://gitlab.example/group/project/-/issues/30 |'));
});

{
  const root = tempRoot('kw-gl-sink-');
  writeState(root, 'sink-project', 40);
  runNode([claimScript, 'sink-fallback', '--project', 'sink-project', '--reason', 'test'], root);
  const state = fs.readFileSync(path.join(root, 'kaola-workflow', 'sink-project', 'workflow-state.md'), 'utf8');
  assert(state.includes('sink: mr'));
}

{
  const root = tempRoot('kw-gl-worktree-cleanup-');
  const kwRoot = fs.realpathSync(root) + '.kw';
  try {
    initGitRepo(root);
    const wtRelease = path.join(kwRoot, 'release-project');
    fs.mkdirSync(path.dirname(wtRelease), { recursive: true });
    let result = spawnSync('git', ['worktree', 'add', '-b', 'workflow/gitlab-issue-70', '--', wtRelease, 'HEAD'], { cwd: root, encoding: 'utf8' });
    assert.strictEqual(result.status, 0, result.stderr);
    writeState(root, 'release-project', 70, 'worktree_path: ' + wtRelease);
    runNode([claimScript, 'release', '--project', 'release-project', '--reason', 'test'], root);
    assert(!fs.existsSync(wtRelease), 'GitLab release should remove linked worktree');

    const wtFinalize = path.join(kwRoot, 'finalize-project');
    result = spawnSync('git', ['worktree', 'add', '-b', 'workflow/gitlab-issue-71', '--', wtFinalize, 'HEAD'], { cwd: root, encoding: 'utf8' });
    assert.strictEqual(result.status, 0, result.stderr);
    writeState(root, 'finalize-project', 71, 'worktree_path: ' + wtFinalize);
    runNode([claimScript, 'finalize', '--project', 'finalize-project', '--keep-worktree'], root);
    assert(fs.existsSync(wtFinalize), 'GitLab keep-worktree finalize should preserve worktree for final commit');
    assert(fs.existsSync(path.join(root, 'kaola-workflow', 'archive', 'finalize-project')), 'GitLab keep-worktree finalize should archive active folder');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(kwRoot, { recursive: true, force: true });
  }
}

withForge({
  viewMergeRequest(mrIid) {
    assert.strictEqual(mrIid, 44);
    return { mr_iid: 44, state: 'merged' };
  },
  updateIssue() { return null; },
  createIssueNote() { return { id: 9002 }; }
}, () => {
  const root = tempRoot('kw-gl-watch-mr-');
  writeState(root, 'mr-project', 44, 'mr_iid: 44');
  roadmap.writeIssueRecord(root, { issue_iid: 44, title: 'mr test' }, 'open', 'mr-project', 'ready');
  roadmap.regenerateRoadmap(root);
  const roadmapSrc = path.join(root, 'kaola-workflow', '.roadmap', 'issue-44.md');
  const roadmapMirror = path.join(root, 'kaola-workflow', 'ROADMAP.md');
  assert(fs.existsSync(roadmapSrc));
  assert(fs.readFileSync(roadmapMirror, 'utf8').includes('#44'));
  const stateFile = path.join(root, 'kaola-workflow', 'mr-project', 'workflow-state.md');
  fs.writeFileSync(stateFile, fs.readFileSync(stateFile, 'utf8').replace('sink: merge', 'sink: mr'));
  const result = claim.watchMergeRequests(root, {});
  assert.strictEqual(result.watched, 1);
  assert(fs.existsSync(path.join(root, 'kaola-workflow', 'archive', 'mr-project', 'workflow-state.md')));
  assert(!fs.existsSync(roadmapSrc));
  assert(!fs.readFileSync(roadmapMirror, 'utf8').includes('#44'));
});

{
  const root = tempRoot('kw-gl-repair-');
  const dir = writeState(root, 'repair-project', 50);
  // A real phase3-plan carries a resolved Required Agent Compliance table; the
  // boundary-crossing reconstruction is only allowed when compliance is resolved.
  fs.writeFileSync(path.join(dir, 'phase3-plan.md'), [
    '# Phase 3 - Plan', '',
    '## Required Agent Compliance',
    '| Requirement | Status | Evidence | Skip Reason |',
    '|-------------|--------|----------|-------------|',
    '| code-architect | invoked | .cache/architect.md | |', ''
  ].join('\n'));
  const result = repair.repair('repair-project', root);
  assert.strictEqual(result.repaired, true);
  const state = fs.readFileSync(path.join(dir, 'workflow-state.md'), 'utf8');
  assert(state.includes('next_skill: kaola-workflow-execute repair-project'));
  assert(state.includes('## GitLab'));
  assert(state.includes('## Sink'));
}

{
  const root = tempRoot('kw-gl-cwd-guard-');
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

// issue #208: cmdResume empty-next_command fallback must route a fast project to
// /kaola-workflow-fast, not /kaola-workflow-phase1. A fast project parses phase
// as null (parseInt("fast")=NaN), so the legacy phase-numbered fallback emitted
// /kaola-workflow-phase1; the resumeFallbackCommand helper now reads
// workflow-state.md to detect fast and route to /kaola-workflow-fast instead.
{
  const root = tempRoot('kw-gl-resume-fast-');
  try {
    initGitRepo(root);
    const project = 'fast-resume';
    const dir = writeState(root, project, 88);
    const stateText = fs.readFileSync(path.join(dir, 'workflow-state.md'), 'utf8')
      .replace('phase: 1', 'phase: fast')
      .replace('phase_name: Research', 'phase_name: Fast\nworkflow_path: fast')
      .replace('next_command: /kaola-workflow-phase1 ' + project + '\n', '');
    fs.writeFileSync(path.join(dir, 'workflow-state.md'), stateText);
    assert(!/^next_command:/m.test(stateText), 'fixture must leave next_command empty/absent so the fallback fires');
    const result = spawnSync(process.execPath, [claimScript, 'resume', '--project', project], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_WORKFLOW_ROOT: root }
    });
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
    const out = JSON.parse(result.stdout.trim());
    assert.strictEqual(out.resumed, true, 'cmdResume should resume the fast project');
    assert.strictEqual(
      out.next_command,
      '/kaola-workflow-fast ' + project,
      'cmdResume empty-next_command fallback should route a fast project to /kaola-workflow-fast'
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

withForge({
  viewIssue(iid) { return { issue_iid: iid, number: iid, state: 'closed', labels: [] }; }
}, () => {
  const root = tempRoot('kw-gl-drift-');
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
  const tempHome = tempRoot('kw-gl-config-home-');
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
  const tempHome = tempRoot('kw-gl-config-bypass-');
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
withForge({
  viewIssue(issueIid) {
    return { issue_iid: issueIid, number: issueIid, state: 'open', labels: [forge.CLAIM_LABEL], body: '' };
  },
  discoverProject() {
    return { project_id: 77, path_with_namespace: 'group/project', web_url: 'https://gitlab.example/group/project' };
  },
  listIssueNotes(project, issueIid) {
    return [{ body: '<!-- kw:claim project=issue-' + issueIid + ' -->', updated_at: new Date().toISOString() }];
  }
}, () => {
  assert(classifier.issueHasWorkflowInProgressLabel([forge.CLAIM_LABEL]));
  assert(!classifier.issueHasWorkflowInProgressLabel([]));
  assert(classifier.issueHasRemoteClaimNotes(33), 'recent kw:claim note should return true');
});

withForge({
  discoverProject() {
    return { project_id: 77, path_with_namespace: 'group/project', web_url: 'https://gitlab.example/group/project' };
  },
  listIssueNotes() { return [{ body: '<!-- kw:claim sess=abc -->' }]; }
}, () => {
  assert(classifier.issueHasRemoteClaimNotes(34), 'missing updated_at should return true');
});

withForge({
  discoverProject() {
    return { project_id: 77, path_with_namespace: 'group/project', web_url: 'https://gitlab.example/group/project' };
  },
  listIssueNotes() {
    return [{ body: '<!-- kw:claim project=old -->', updated_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() }];
  }
}, () => {
  assert(!classifier.issueHasRemoteClaimNotes(35), 'stale note (>24h) should return false');
});

// --- Task A: Gap 2 — OFFLINE branch with depends-on in roadmap ---
{
  const tempHome = tempRoot('kw-gl-offline-classify-');
  const root = tempRoot('kw-gl-offline-root-');
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
  const tempHome = tempRoot('kw-gl-offline-nofile-');
  const root = tempRoot('kw-gl-offline-nofile-root-');
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
  const tempHome = tempRoot('kw-gl-offline-roadmap-acquires-');
  const root = tempRoot('kw-gl-offline-roadmap-acquires-root-');
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
  const tempHome = tempRoot('kw-gl-offline-owned-routes-');
  const root = tempRoot('kw-gl-offline-owned-routes-root-');
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
  const tempHome = tempRoot('kw-gl-offline-unrelated-active-');
  const root = tempRoot('kw-gl-offline-unrelated-active-root-');
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
  const tempHome = tempRoot('kw-gl-offline-startup-unverified-');
  const root = tempRoot('kw-gl-offline-startup-unverified-root-');
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
  const tempHome = tempRoot('kw-gl-offline-startup-block-');
  const root = tempRoot('kw-gl-offline-startup-block-root-');
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

// --- Task B: Gap 4 — stateLooksValid ---
{
  const root = tempRoot('kw-gl-slv-');
  try {
    const dir = writeState(root, 'slv-project', 80);
    fs.writeFileSync(path.join(dir, 'phase3-plan.md'), '# Phase 3\n');
    const stateText = fs.readFileSync(path.join(dir, 'workflow-state.md'), 'utf8');
    assert(repair.stateLooksValid(root, 'slv-project', stateText), 'stateLooksValid should return true for valid state');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

{
  const root = tempRoot('kw-gl-slv-bad-');
  try {
    const dir = writeState(root, 'slv-bad-project', 81);
    const badState = fs.readFileSync(path.join(dir, 'workflow-state.md'), 'utf8')
      .replace('next_command: /kaola-workflow-phase1 slv-bad-project', 'next_command: /kaola-workflow-phase9 slv-bad-project')
      .replace('next_skill: kaola-workflow-research slv-bad-project', 'next_skill: kaola-workflow-phase9 slv-bad-project');
    assert(!repair.stateLooksValid(root, 'slv-bad-project', badState), 'stateLooksValid should return false for unknown phase');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// --- Task B: Gap 5 — three-way branch in repair() ---
{
  // valid + current (no write)
  const root = tempRoot('kw-gl-repair-valid-');
  try {
    const dir = writeState(root, 'valid-project', 82);
    fs.writeFileSync(path.join(dir, 'phase3-plan.md'), '# Phase 3\n');
    const stateText = fs.readFileSync(path.join(dir, 'workflow-state.md'), 'utf8')
      .replace(/phase: \d+/, 'phase: 4')
      .replace('phase_name: Research', 'phase_name: Execute')
      .replace('next_command: /kaola-workflow-phase1 valid-project', 'next_command: /kaola-workflow-phase4 valid-project')
      .replace('next_skill: kaola-workflow-research valid-project', 'next_skill: kaola-workflow-execute valid-project');
    fs.writeFileSync(path.join(dir, 'workflow-state.md'), stateText);
    fs.writeFileSync(path.join(dir, 'phase4-progress.md'), '# Phase 4\n\n## Tasks\n| # | Task | Status |\n|---|------|--------|\n| A | Task A | open |\n');
    const statMtime = fs.statSync(path.join(dir, 'workflow-state.md')).mtimeMs;
    const result = repair.repair('valid-project', root);
    assert.strictEqual(result.repaired, false);
    assert.strictEqual(result.valid, true);
    const newMtime = fs.statSync(path.join(dir, 'workflow-state.md')).mtimeMs;
    assert.strictEqual(newMtime, statMtime, 'valid+current repair must not rewrite state file');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

{
  // valid + complete
  const root = tempRoot('kw-gl-repair-complete-');
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

{
  // valid + stale (state says phase1, phase3-plan.md exists so reconstruct routes to phase4)
  const root = tempRoot('kw-gl-repair-stale-');
  try {
    const dir = writeState(root, 'stale-project', 84);
    fs.writeFileSync(path.join(dir, 'phase3-plan.md'), [
      '# Phase 3 - Plan', '',
      '## Required Agent Compliance',
      '| Requirement | Status | Evidence | Skip Reason |',
      '|-------------|--------|----------|-------------|',
      '| code-architect | invoked | .cache/architect.md | |', ''
    ].join('\n'));
    const result = repair.repair('stale-project', root);
    assert.strictEqual(result.repaired, true);
    assert.strictEqual(result.stale, true);
    const state = fs.readFileSync(path.join(dir, 'workflow-state.md'), 'utf8');
    assert(state.includes('## GitLab'), 'stale repair should preserve ## GitLab section');
    assert(state.includes('## Sink'), 'stale repair should preserve ## Sink section');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

{
  // audit #4: a phase artifact that crosses a boundary with an UNRESOLVED
  // compliance row must refuse forward reconstruction even when the state has no
  // delegation_policy (the no-policy / corruption-recovery path the old
  // delegation_policy-gated check silently advanced). Mirrors the GitHub edition.
  const root = tempRoot('kw-gl-repair-compliance-gate-');
  try {
    const dir = path.join(root, 'kaola-workflow', 'gate-project');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'phase3-plan.md'), [
      '# Phase 3 - Plan', '',
      '## Required Agent Compliance',
      '| Requirement | Status | Evidence | Skip Reason |',
      '|-------------|--------|----------|-------------|',
      '| code-architect | pending | | |', ''
    ].join('\n'));
    const result = repair.repair('gate-project', root);
    assert.strictEqual(result.repaired, false, 'unresolved compliance must refuse forward reconstruction with no delegation_policy');
    assert(/unresolved compliance gates/.test(result.reason || ''), 'refusal reason must name unresolved compliance gates, got: ' + result.reason);
    assert(!fs.existsSync(path.join(dir, 'workflow-state.md')), 'compliance refusal must not write a forward-advanced state file');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

{
  // issue #199: fast-path repair — preserve intact `phase: fast` state, and
  // reconstruct from fast-summary.md when the state file is lost.
  const root = tempRoot('kw-gl-repair-fast-');
  try {
    const keepDir = path.join(root, 'kaola-workflow', 'fast-keep');
    fs.mkdirSync(keepDir, { recursive: true });
    fs.writeFileSync(path.join(keepDir, 'workflow-state.md'), [
      '# Kaola-Workflow State', '', '## Project', 'name: fast-keep', 'status: active', '',
      '## Current Position', 'phase: fast', 'phase_name: Fast', 'workflow_path: fast',
      'next_command: /kaola-workflow-fast fast-keep', 'next_skill: kaola-workflow-fast fast-keep', ''
    ].join('\n'));
    fs.writeFileSync(path.join(keepDir, 'fast-summary.md'), '# Fast Summary\n\n## Status\nPASSED\n');
    const keep = repair.repair('fast-keep', root);
    assert.strictEqual(keep.repaired, false, 'intact fast state must not be rewritten');
    assert.strictEqual(keep.valid, true, 'intact fast state must be reported valid');
    assert.strictEqual(keep.phase, 'fast', 'valid fast repair must report phase fast (not NaN)');

    const reconDir = path.join(root, 'kaola-workflow', 'fast-recon');
    fs.mkdirSync(reconDir, { recursive: true });
    fs.writeFileSync(path.join(reconDir, 'fast-summary.md'), '# Fast Summary\n\n## Status\nPASSED\n');
    const recon = repair.repair('fast-recon', root);
    assert.strictEqual(recon.repaired, true, 'lost fast state must be reconstructed from fast-summary.md');
    assert.strictEqual(recon.phase, 'fast', 'reconstructed fast repair must report phase fast');
    const reconState = fs.readFileSync(path.join(reconDir, 'workflow-state.md'), 'utf8');
    assert(/^phase: fast$/m.test(reconState), 'reconstructed state must record phase: fast');
    assert(/^workflow_path: fast$/m.test(reconState), 'reconstructed state must record workflow_path: fast');
    assert(/^next_skill: kaola-workflow-fast fast-recon$/m.test(reconState), 'reconstructed state must route to the fast skill');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

{
  // issue #201: no-arg repair-state must DISCOVER a fast-summary-only project
  // (no workflow-state.md, no numbered phase files) the same way it discovers
  // numbered phase artifacts, then reconstruct it onto the fast continuation.
  const root = tempRoot('kw-gl-repair-fast-discover-');
  try {
    const projectDir = path.join(root, 'kaola-workflow', 'fast-only');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'fast-summary.md'), '# Fast Summary\n\n## Status\nPASSED\n');
    const recon = repair.repair(undefined, root);
    assert.strictEqual(recon.repaired, true, 'no-arg repair must discover and reconstruct a fast-summary-only project');
    assert.strictEqual(recon.project, 'fast-only', 'no-arg repair must select the single fast-summary-only project');
    assert.strictEqual(recon.phase, 'fast', 'discovered fast repair must report phase fast');
    assert.strictEqual(recon.next_skill, 'kaola-workflow-fast fast-only', 'discovered fast repair must report the fast skill');
    const reconState = fs.readFileSync(path.join(projectDir, 'workflow-state.md'), 'utf8');
    assert(/^phase: fast$/m.test(reconState), 'discovered state must record phase: fast');
    assert(/^workflow_path: fast$/m.test(reconState), 'discovered state must record workflow_path: fast');
    assert(/^next_command: \/kaola-workflow-fast fast-only$/m.test(reconState), 'discovered state must record the fast next_command');
    assert(/^next_skill: kaola-workflow-fast fast-only$/m.test(reconState), 'discovered state must route to the fast skill');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

{
  // issue #201: two fast-summary-only projects with no-arg must remain a safe
  // ambiguity refusal — never a silent pick, and never a written state file.
  const root = tempRoot('kw-gl-repair-fast-ambig-');
  try {
    const dirA = path.join(root, 'kaola-workflow', 'fast-a');
    const dirB = path.join(root, 'kaola-workflow', 'fast-b');
    fs.mkdirSync(dirA, { recursive: true });
    fs.mkdirSync(dirB, { recursive: true });
    fs.writeFileSync(path.join(dirA, 'fast-summary.md'), '# Fast Summary\n\n## Status\nPASSED\n');
    fs.writeFileSync(path.join(dirB, 'fast-summary.md'), '# Fast Summary\n\n## Status\nPASSED\n');
    const result = repair.repair(undefined, root);
    assert.strictEqual(result.repaired, false, 'two fast-summary-only projects with no-arg must refuse');
    assert(/ambiguous/.test(result.reason || ''), 'no-arg refusal reason must mention ambiguity, got: ' + result.reason);
    assert(!fs.existsSync(path.join(dirA, 'workflow-state.md')), 'ambiguous refusal must not write state for project A');
    assert(!fs.existsSync(path.join(dirB, 'workflow-state.md')), 'ambiguous refusal must not write state for project B');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

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

// Fix 1: repair-state CLI exit code — valid+current must not exit 1
{
  const root = tempRoot('kw-gl-repair-exitcode-');
  try {
    const dir = writeState(root, 'exitcode-project', 90);
    fs.writeFileSync(path.join(dir, 'phase3-plan.md'), '# Phase 3\n');
    // Set state to phase 4 so reconstruct and state agree (valid+current)
    const stateText = fs.readFileSync(path.join(dir, 'workflow-state.md'), 'utf8')
      .replace(/phase: \d+/, 'phase: 4')
      .replace('phase_name: Research', 'phase_name: Execute')
      .replace('next_command: /kaola-workflow-phase1 exitcode-project', 'next_command: /kaola-workflow-phase4 exitcode-project')
      .replace('next_skill: kaola-workflow-research exitcode-project', 'next_skill: kaola-workflow-execute exitcode-project');
    fs.writeFileSync(path.join(dir, 'workflow-state.md'), stateText);
    fs.writeFileSync(path.join(dir, 'phase4-progress.md'), '# Phase 4\n\n## Tasks\n| # | Task | Status |\n|---|------|--------|\n| A | Task A | open |\n');
    const repairScript = path.join(__dirname, 'kaola-gitlab-workflow-repair-state.js');
    const result = spawnSync(process.execPath, [repairScript, 'exitcode-project'], {
      cwd: root, encoding: 'utf8', env: process.env
    });
    assert.strictEqual(result.status, 0, 'valid+current repair must exit 0, got: ' + result.stdout + result.stderr);
    const out = JSON.parse(result.stdout.trim());
    assert.strictEqual(out.repaired, false);
    assert.strictEqual(out.valid, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Fix 2a: classifyIssue parallel_mode bypass
{
  const tempHome = tempRoot('kw-gl-ciy-bypass-');
  try {
    const configDir = path.join(tempHome, '.config', 'kaola-workflow');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ parallel_mode: 'manual' }) + '\n');
    // Run via subprocess so HOME override is effective
    const root = tempRoot('kw-gl-ciy-bypass-root-');
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
withForge({
  viewIssue(issueIid) {
    return { issue_iid: issueIid, state: 'open', labels: [forge.CLAIM_LABEL], body: '' };
  },
  discoverProject() { return { project_id: 77, path_with_namespace: 'g/p' }; },
  listIssueNotes() { return []; }
}, () => {
  const result = classifier.classifyIssue(92, '/tmp');
  assert.strictEqual(result.verdict, 'blocked', 'classifyIssue must block on CLAIM_LABEL');
  assert(/remote workflow claim/.test(result.reasoning));
});

// Issue #99: startup/pick-next explicit-target parity
{
  // startup without --target-issue must return no_target even when one active folder exists
  const root = tempRoot('kw-gl-startup-notarget-');
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
  const root = tempRoot('kw-gl-picknext-notarget-');
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
  const root = tempRoot('kw-gl-startup-worktree-');
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-sibling-'));
  const kwRoot = fs.realpathSync(tmp) + '.kw'; // legacy path — kept for cleanup only
  try {
    initGitRepo(tmp);
    // Simulate a linked worktree by running startup from within a hypothetical linked path.
    // We do this by creating a hidden-local dir that shares the same git common-dir.
    const linkedWt = path.join(fs.realpathSync(tmp), '.kw', 'worktrees', 'issue-5');
    fs.mkdirSync(linkedWt, { recursive: true });
    // Create a worktree so git knows about it
    spawnSync('git', ['worktree', 'add', '--detach', linkedWt], { cwd: tmp, encoding: 'utf8' });

    // Provide a glab shim so the classifier doesn't fail-close on forge error
    const binDir100 = path.join(tmp, 'bin100');
    fs.mkdirSync(binDir100, { recursive: true });
    writeShimFiles(path.join(binDir100, 'glab'), [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue view')) process.stdout.write('{\"state\":\"open\"}\\n');",
      "else if (a.includes('repo view')) process.stdout.write('{\"id\":77}\\n');",
      "else process.stdout.write('[]\\n');"
    ]);

    // Run startup from the linked worktree cwd — should produce hidden-local, not nested path
    const result = spawnSync(process.execPath, [claimScript, 'startup', '--runtime', 'test', '--target-issue', '6'], {
      cwd: linkedWt, encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKTREE_NATIVE: '1',
             ...glabMockEnv(binDir100),
             PATH: binDir100 + path.delimiter + path.dirname(process.execPath) + path.delimiter + (process.env.PATH || '') }
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

// Issue #101: KAOLA_PATH=fast startup must write fast-path state
{
  const root = tempRoot('kw-gl-fast-startup-');
  try {
    initGitRepo(root);
    plantClosureRoadmapSource(root, 7);
    const result = spawnSync(process.execPath, [claimScript, 'startup', '--runtime', 'test', '--target-issue', '7'], {
      cwd: root, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_PATH: 'fast', KAOLA_WORKFLOW_OFFLINE: '1' })
    });
    assert.strictEqual(result.status, 0, 'fast startup must exit 0\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    const out = JSON.parse(result.stdout.trim());
    assert.strictEqual(out.verdict, 'green');
    assert.strictEqual(out.claim, 'acquired');
    const stateFile = path.join(root, 'kaola-workflow', out.selected_project || 'issue-7', 'workflow-state.md');
    const state = fs.readFileSync(stateFile, 'utf8');
    assert.ok(/^workflow_path: fast$/m.test(state), 'fast startup must write workflow_path: fast');
    assert.ok(/^phase: fast$/m.test(state), 'fast startup must write phase: fast');
    assert.ok(/^next_command: \/kaola-workflow-fast /m.test(state), 'fast startup must write /kaola-workflow-fast next_command');
    assert.ok(/^next_skill: kaola-workflow-fast /m.test(state), 'fast startup must write kaola-workflow-fast next_skill');
    assert.ok(/^- fast-summary$/m.test(state), 'fast startup must write fast-summary pending gate');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Issue #107: reconstruct() must not route to Finalization when phase4-progress.md has open tasks
// Test 1 — Negative guard (the bug fix):
{
  const root = tempRoot('kw-gl-issue107-guard-');
  try {
    const dir = writeState(root, 'issue107-guard', 107);
    fs.writeFileSync(path.join(dir, 'phase4-progress.md'),
      '# Phase 4\n\n## Tasks\n| # | Task | Status |\n|---|------|--------|\n| A | Task A | open |\n');
    fs.writeFileSync(path.join(dir, 'phase5-review.md'), '# Phase 5\n');
    const result = repair.reconstruct(root, path.join(root, 'kaola-workflow'), 'issue107-guard');
    assert(!result.nextCommand, 'guard must not route to Finalization when Phase 4 tasks are open');
    assert(/open tasks/.test(result.reason || ''), 'reason must mention open tasks');
    repair.repair('issue107-guard', root);
    const state = fs.readFileSync(path.join(dir, 'workflow-state.md'), 'utf8');
    assert(!/stage: finalization\b/.test(state), 'state file must not advance to Finalization with open Phase 4 tasks');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Issue #107: reconstruct() must still route to Finalization when all Phase 4 tasks are complete
// Test 2 — Positive regression (happy path still works):
{
  const root = tempRoot('kw-gl-issue107-allow-');
  try {
    const dir = writeState(root, 'issue107-allow', 108);
    fs.writeFileSync(path.join(dir, 'phase4-progress.md'),
      '# Phase 4\n\n## Tasks\n| # | Task | Status |\n|---|------|--------|\n| A | Task A | complete |\n');
    // phase5-review carries a resolved compliance table so the Finalization boundary
    // crossing is allowed (the gate-project test above covers the refusal).
    fs.writeFileSync(path.join(dir, 'phase5-review.md'), [
      '# Phase 5 - Review', '',
      '## Required Agent Compliance',
      '| Requirement | Status | Evidence | Skip Reason |',
      '|-------------|--------|----------|-------------|',
      '| code-reviewer | invoked | .cache/code-reviewer.md | |', ''
    ].join('\n'));
    const result = repair.reconstruct(root, path.join(root, 'kaola-workflow'), 'issue107-allow');
    assert.strictEqual(result.stage, 'finalization', 'happy path must still route to Finalization');
    assert(/kaola-workflow-finalize/.test(result.nextCommand), 'nextCommand must be finalize');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testStaleWorktreeCheck() {
  // Helper: initGitRepo adapted for a fresh isolated tmp each sub-case
  function setupRepo() {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-stale-gl-')));
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
    writeGlabShimForStale(binDir);
    const wtPath = path.join(kwRoot, 'issue-200');
    addWorktree(tmp, 'workflow/gitlab-issue-200', wtPath);
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
    writeGlabShimForStale(binDir);
    const wtPath = path.join(kwRoot, 'issue-300');
    addWorktree(tmp, 'workflow/gitlab-issue-300', wtPath);
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
    writeGlabShimForStale(binDir);
    const wtPath = path.join(kwRoot, 'issue-100');
    addWorktree(tmp, 'workflow/gitlab-issue-100', wtPath);
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
  // IMPORTANT: use fs.rmSync NOT git worktree remove — the registration must survive
  {
    const tmp = setupRepo();
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    writeGlabShimForStale(binDir);
    const wtPath = path.join(kwRoot, 'issue-200');
    addWorktree(tmp, 'workflow/gitlab-issue-200', wtPath);
    // Delete the directory without removing git worktree metadata
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
    writeGlabShimForStale(binDir);
    spawnSync('git', ['branch', 'workflow/gitlab-issue-400'], { cwd: tmp, encoding: 'utf8' });
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
    addWorktree(tmp, 'workflow/gitlab-issue-300', wtPath);
    fs.mkdirSync(path.join(tmp, 'kaola-workflow', 'archive', 'issue-300'), { recursive: true });
    try {
      // Run OFFLINE — no binDir needed, no API calls made
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

const gitlabPluginRoot = path.resolve(__dirname, '..');
const installProfilesScript = path.join(gitlabPluginRoot, 'scripts', 'install-codex-agent-profiles.js');

function runInstallProfiles(target) {
  const result = spawnSync(process.execPath, [installProfilesScript, target], {
    cwd: gitlabPluginRoot,
    encoding: 'utf8'
  });
  if (result.error) throw result.error;
  assert.ok(result.status === 0, 'install profiles failed: ' + result.stderr);
}

function countOccurrences(content, pattern) {
  return (content.match(pattern) || []).length;
}

function testInstallProfilesFeaturesTableHandling() {
  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-codex-install-fresh-'));
  const existing = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-codex-install-existing-'));
  try {
    runInstallProfiles(fresh);
    const freshConfig = fs.readFileSync(path.join(fresh, '.codex', 'config.toml'), 'utf8');
    assert.ok(freshConfig.includes('[features]'), 'fresh install should include managed [features]');
    assert.ok(freshConfig.includes('multi_agent = true'), 'fresh install should enable multi_agent');
    assert.ok(freshConfig.includes('# BEGIN kaola-workflow agents'), 'fresh install should include managed block');
    assert.strictEqual(
      fs.readdirSync(path.join(fresh, '.codex', 'agents', 'kaola-workflow')).length,
      13,
      'should install 13 agent TOML files'
    );

    const existingCodexDir = path.join(existing, '.codex');
    fs.mkdirSync(existingCodexDir, { recursive: true });
    const existingConfigPath = path.join(existingCodexDir, 'config.toml');
    fs.writeFileSync(existingConfigPath, [
      '[features]', 'goals = true', '', '[projects."/tmp/example"]', 'trust_level = "trusted"', ''
    ].join('\n'));

    runInstallProfiles(existing);
    runInstallProfiles(existing);
    const updated = fs.readFileSync(existingConfigPath, 'utf8');
    assert.strictEqual(
      countOccurrences(updated, /^\[features\]$/gm),
      1,
      'existing config must contain exactly one [features] table'
    );
    assert.ok(updated.includes('goals = true'), 'existing [features] content must be preserved');
    assert.ok(updated.includes('[agents.code-explorer]'), 'managed agent block should still be installed');
  } finally {
    fs.rmSync(fresh, { recursive: true, force: true });
    fs.rmSync(existing, { recursive: true, force: true });
  }
}

// Issue #149: Test 1 — default-OFF (KAOLA_WORKTREE_NATIVE=0 must not provision worktree)
// Also asserts in-place branch created+checked-out (workflow/gitlab-issue-601) + tree clean (#260).
{
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-native-off-')));
  try {
    initGitRepo(root);
    // Commit a .gitignore so the bin/ shim + kaola-workflow/ folder don't dirty the tree
    fs.writeFileSync(path.join(root, '.gitignore'), 'bin149/\nkaola-workflow/\n.kw/\n');
    spawnSync('git', ['add', '.gitignore'], { cwd: root, encoding: 'utf8' });
    spawnSync('git', ['commit', '-m', 'add gitignore'], { cwd: root, encoding: 'utf8' });
    const binDir149 = path.join(root, 'bin149');
    fs.mkdirSync(binDir149, { recursive: true });
    writeShimFiles(path.join(binDir149, 'glab'), [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue view')) process.stdout.write('{\"state\":\"open\"}\\n');",
      "else if (a.includes('repo view')) process.stdout.write('{\"id\":77}\\n');",
      "else process.stdout.write('[]\\n');"
    ]);
    const r = spawnSync(process.execPath, [claimScript, 'startup', '--runtime', 'test', '--target-issue', '601'], {
      cwd: root, encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_WORKTREE_NATIVE: '0',
             ...glabMockEnv(binDir149),
             PATH: binDir149 + path.delimiter + path.dirname(process.execPath) + path.delimiter + (process.env.PATH || '') }
    });
    assert.strictEqual(r.status, 0, 'exit 0 when KAOLA_WORKTREE_NATIVE=0\nstdout: ' + r.stdout + '\nstderr: ' + r.stderr);
    const out = JSON.parse(r.stdout.trim().split('\n').pop());
    assert.strictEqual(out.worktree_path, '', 'worktree_path empty when KAOLA_WORKTREE_NATIVE=0');
    // #260: in-place branch must be created and checked out
    const headBranch = spawnSync('git', ['-C', root, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    assert.strictEqual(headBranch, 'workflow/gitlab-issue-601', 'NATIVE=0 must checkout in-place branch workflow/gitlab-issue-601, got: ' + headBranch);
    const treeStatus = spawnSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' }).stdout.trim();
    assert.strictEqual(treeStatus, '', 'tree must be clean after in-place claim (all untracked entries gitignored), got: ' + JSON.stringify(treeStatus));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    const kwRoot = root + '.kw';
    if (fs.existsSync(kwRoot)) fs.rmSync(kwRoot, { recursive: true, force: true });
  }
}

// Issue #149: Test 2 — OFFLINE wins over NATIVE (OFFLINE=1 must suppress worktree even when NATIVE=1)
{
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-offline-wins-')));
  try {
    initGitRepo(root);
    plantClosureRoadmapSource(root, 602);
    const r = spawnSync(process.execPath, [claimScript, 'startup', '--runtime', 'test', '--target-issue', '602'], {
      cwd: root, encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_WORKTREE_NATIVE: '1' }
    });
    assert.strictEqual(r.status, 0, 'exit 0 when OFFLINE=1 even with NATIVE=1\nstdout: ' + r.stdout + '\nstderr: ' + r.stderr);
    const out = JSON.parse(r.stdout.trim().split('\n').pop());
    assert.strictEqual(out.worktree_path, '', 'worktree_path empty when OFFLINE=1 even with NATIVE=1');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    const kwRoot = root + '.kw';
    if (fs.existsSync(kwRoot)) fs.rmSync(kwRoot, { recursive: true, force: true });
  }
}

// --- Task 5: fail-open fix — classifier must return target_unavailable on forge failure ---

// testGitLabClassifierFailClosed: in-process classifyIssue returns target_unavailable when forge throws
withForge({
  viewIssue() { throw new Error('network error'); }
}, () => {
  const root = tempRoot('kw-gl-t5-classify-fail-');
  try {
    const result = classifier.classifyIssue(200, root);
    assert.strictEqual(result.verdict, 'target_unavailable',
      'classifyIssue must return target_unavailable when forge.viewIssue throws, got: ' + result.verdict);
    assert(/refusing to claim outside KAOLA_WORKFLOW_OFFLINE/.test(result.reasoning),
      'classifyIssue reasoning must mention KAOLA_WORKFLOW_OFFLINE, got: ' + result.reasoning);
    console.log('testGitLabClassifierFailClosed: PASS');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// testGitLabStartupFailClosed: claimExplicitTarget returns target_unavailable when forge throws
withForge({
  viewIssue() { throw new Error('network error'); }
}, () => {
  const root = tempRoot('kw-gl-t5-startup-fail-');
  try {
    const result = claim.claimExplicitTarget(root, { targetIssue: 201 });
    assert.strictEqual(result.status, 'target_unavailable',
      'claimExplicitTarget must return status:target_unavailable when forge throws, got: ' + result.status);
    assert.strictEqual(result.claim, 'none',
      'claimExplicitTarget must return claim:none on target_unavailable, got: ' + result.claim);
    assert(!fs.existsSync(path.join(root, 'kaola-workflow', 'issue-201')),
      'claimExplicitTarget must not create an active folder when target_unavailable');
    console.log('testGitLabStartupFailClosed: PASS');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// testGitLabOfflineBypassesFailClosed: OFFLINE=1 + failing forge still proceeds (regression guard)
{
  const root = tempRoot('kw-gl-t5-offline-bypass-');
  try {
    const roadmapDir = path.join(root, 'kaola-workflow', '.roadmap');
    fs.mkdirSync(roadmapDir, { recursive: true });
    // Plant roadmap entry for issue 202 so classifier finds local evidence (not target_unverified)
    fs.writeFileSync(path.join(roadmapDir, 'issue-202.md'),
      'issue: #202\ntitle: offline-bypass-fixture\nstatus: open\n');
    const result = spawnSync(process.execPath, [claimScript, 'startup', '--runtime', 'test', '--target-issue', '202'], {
      cwd: root, encoding: 'utf8',
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' })
    });
    assert.strictEqual(result.status, 0, 'OFFLINE startup must exit 0 even with no forge\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    const out = JSON.parse(result.stdout.trim());
    assert.notStrictEqual(out.verdict, 'target_unavailable',
      'OFFLINE startup must NOT return target_unavailable, got: ' + out.verdict);
    assert.strictEqual(out.claim, 'acquired', 'OFFLINE startup must acquire normally');
    console.log('testGitLabOfflineBypassesFailClosed: PASS');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testStaleWorktreeCleanup() {
  function addWorktree(repoRoot, branch, wtPath) {
    const r = spawnSync('git', ['worktree', 'add', '-b', branch, '--', wtPath, 'HEAD'], { cwd: repoRoot, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, 'git worktree add failed: ' + r.stderr);
  }

  // Sub-case 1: dry-run — clean worktree, no --execute
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-stale-cleanup-sc1-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeGlabShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitlab-issue-200', wtPath);
      const out = runClaimOnline(['stale-worktree-cleanup'], tmp, binDir);
      assert(out.dry_run === true, 'sc1: dry_run must be true, got: ' + JSON.stringify(out));
      assert(Array.isArray(out.would_remove) && out.would_remove.some(p => p === wtPath),
        'sc1: would_remove must contain wtPath, got: ' + JSON.stringify(out.would_remove));
      assert(Array.isArray(out.would_delete_branch) && out.would_delete_branch.includes('workflow/gitlab-issue-200'),
        'sc1: would_delete_branch must contain workflow/gitlab-issue-200, got: ' + JSON.stringify(out.would_delete_branch));
      assert(fs.existsSync(wtPath), 'sc1: worktree dir must still exist after dry-run');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 2: execute-clean — clean worktree + --execute
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-stale-cleanup-sc2-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeGlabShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitlab-issue-200', wtPath);
      const out = runClaimOnline(['stale-worktree-cleanup', '--execute'], tmp, binDir);
      assert(out.dry_run === false, 'sc2: dry_run must be false, got: ' + JSON.stringify(out));
      assert(Array.isArray(out.removed) && out.removed.some(p => p === wtPath),
        'sc2: removed must contain wtPath, got: ' + JSON.stringify(out.removed));
      assert(Array.isArray(out.deleted_branch) && out.deleted_branch.includes('workflow/gitlab-issue-200'),
        'sc2: deleted_branch must contain workflow/gitlab-issue-200, got: ' + JSON.stringify(out.deleted_branch));
      assert(!fs.existsSync(wtPath), 'sc2: worktree dir must be removed after execute');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 3: execute-dirty-no-flag — dirty worktree + --execute (no archive/export/force)
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-stale-cleanup-sc3-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeGlabShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitlab-issue-200', wtPath);
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
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-stale-cleanup-sc4-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeGlabShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitlab-issue-200', wtPath);
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
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-stale-cleanup-sc5-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeGlabShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitlab-issue-200', wtPath);
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
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-stale-cleanup-sc6-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeGlabShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitlab-issue-200', wtPath);
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
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-stale-cleanup-sc7-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeGlabShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitlab-issue-200', wtPath);
      const out = runClaimOnline(['stale-worktree-cleanup', '--execute', '--keep-branch'], tmp, binDir);
      assert(Array.isArray(out.removed) && out.removed.some(p => p === wtPath),
        'sc7: removed must contain wtPath, got: ' + JSON.stringify(out.removed));
      assert(!out.deleted_branch || out.deleted_branch.length === 0,
        'sc7: deleted_branch must be empty with --keep-branch, got: ' + JSON.stringify(out.deleted_branch));
      assert(!fs.existsSync(wtPath), 'sc7: worktree dir must be removed');
      // Branch must still exist
      const branchCheck = spawnSync('git', ['-C', tmp, 'rev-parse', '--verify', 'refs/heads/workflow/gitlab-issue-200'], { encoding: 'utf8' });
      assert.strictEqual(branchCheck.status, 0, 'sc7: branch workflow/gitlab-issue-200 must still exist, got: ' + branchCheck.stderr);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 8: execute-archive-fail — stash fails → failed_preserve, no removal
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-stale-cleanup-sc8-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    let lockFile = null;
    try {
      initGitRepo(tmp);
      writeGlabShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitlab-issue-200', wtPath);
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
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-stale-cleanup-sc9-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeGlabShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitlab-issue-200', wtPath);
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
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-stale-cleanup-sc10-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeGlabShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitlab-issue-200', wtPath);
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
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-stale-cleanup-sc11-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeGlabShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitlab-issue-200', wtPath);
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

// ---------------------------------------------------------------------------
// closure-audit (issue #166 — GitLab port of GitHub issue #165)
// ---------------------------------------------------------------------------

function testClosureAuditOfflineRemoteClassesSkipped() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-ca-offline-')));
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
      result.drift.unarchived_mr_folders, 'skipped_offline',
      'offline: unarchived_mr_folders must be "skipped_offline", got: ' + JSON.stringify(result.drift.unarchived_mr_folders)
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
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-ca-closed-remote-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    plantClosureRoadmapSource(tmp, 900);
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
    assert.strictEqual(result.counts.stale_roadmap_sources, 1, 'counts.stale_roadmap_sources must be 1, got: ' + result.counts.stale_roadmap_sources);
    console.log('testClosureAuditClosedRemoteRoadmapSource: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditArchiveClosedDrift() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-ca-archive-closed-')));
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
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-ca-dedup-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    plantClosureRoadmapSource(tmp, 902);
    const archiveDir = path.join(tmp, 'kaola-workflow', 'archive', 'issue-902');
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, 'workflow-state.md'), 'status: closed\nstep: complete\nissue_iid: 902\n');
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
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-ca-archive-only-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    plantClosureRoadmapSource(tmp, 920);
    const archiveDir = path.join(tmp, 'kaola-workflow', 'archive', 'issue-950');
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, 'workflow-state.md'),
      'status: closed\nstep: complete\nissue_iid: 950\n');
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
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-ca-mirror-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    plantClosureRoadmapSource(tmp, 903);
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
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-ca-labels-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue list')) { process.stdout.write('[{\"number\":99,\"iid\":99,\"title\":\"stale\",\"url\":\"http://x\",\"web_url\":\"http://x\"}]\\n'); }",
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
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-ca-active-closed-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    writeState(tmp, 'issue-904', 904);
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
    assert.strictEqual(folders[0].dirty, true, 'planted (uncommitted) active folder must be reported dirty:true, got: ' + folders[0].dirty);
    console.log('testClosureAuditActiveFolderForClosedIssueReportsDirty: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditUnarchivedMrFolderMergedLowercase() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-ca-unarchived-mr-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    writeState(tmp, 'issue-905', 905);
    makeMrSinkFolder(tmp, 'issue-905', 905);
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('mr view')) { process.stdout.write('{\"state\":\"merged\"}\\n'); }",
      "else if (a.includes('issue view')) { process.stdout.write('{\"state\":\"open\"}\\n'); }",
      "else if (a.includes('issue list')) { process.stdout.write('[]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const result = runClosureAudit([], tmp, binDir);
    const mrFolders = result.drift.unarchived_mr_folders;
    assert(
      Array.isArray(mrFolders) && mrFolders.length === 1 && mrFolders[0].project === 'issue-905' && mrFolders[0].mr_state === 'merged',
      'unarchived_mr_folders must report merged MR folder issue-905 with lowercase mr_state "merged", got: ' + JSON.stringify(mrFolders)
    );
    assert(mrFolders[0].mr_url, 'unarchived_mr_folders entry must carry mr_url, got: ' + JSON.stringify(mrFolders[0]));
    console.log('testClosureAuditUnarchivedMrFolderMergedLowercase: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditExecuteRepairsRoadmapAndLabels() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-ca-exec-repair-')));
  const binDir = path.join(tmp, 'bin');
  const marker = path.join(tmp, 'label-removed.marker');
  try {
    initGitRepo(tmp);
    plantClosureRoadmapSource(tmp, 906);
    closureAuditShim(binDir, [
      "const fs = require('fs');",
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue update') && a.includes('--unlabel')) { fs.writeFileSync(" + JSON.stringify(marker) + ", 'x'); process.stdout.write('{}\\n'); }",
      "else if (a.includes('issue view')) { process.stdout.write('{\"state\":\"closed\"}\\n'); }",
      "else if (a.includes('issue list')) { process.stdout.write('[{\"number\":906,\"iid\":906,\"title\":\"stale\",\"url\":\"http://x\",\"web_url\":\"http://x\"}]\\n'); }",
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
    assert(fs.existsSync(marker), '--execute must call glab issue update --unlabel (marker missing)');
    assert(fs.existsSync(path.join(tmp, 'kaola-workflow', 'ROADMAP.md')), '--execute must regenerate ROADMAP.md');
    console.log('testClosureAuditExecuteRepairsRoadmapAndLabels: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditExecuteNeverTouchesActiveFolders() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-ca-exec-safe-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    writeState(tmp, 'issue-907', 907);
    const folderDir = path.join(tmp, 'kaola-workflow', 'issue-907');
    assert(fs.existsSync(folderDir), 'precondition: active folder must exist');
    closureAuditShim(binDir, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue view')) { process.stdout.write('{\"state\":\"closed\"}\\n'); }",
      "else if (a.includes('issue list')) { process.stdout.write('[]\\n'); }",
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
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-ca-dryrun-safe-')));
  const binDir = path.join(tmp, 'bin');
  const marker = path.join(tmp, 'label-removed.marker');
  try {
    initGitRepo(tmp);
    closureAuditShim(binDir, [
      "const fs = require('fs');",
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue update') && a.includes('--unlabel')) { fs.writeFileSync(" + JSON.stringify(marker) + ", 'x'); process.stdout.write('{}\\n'); }",
      "else if (a.includes('issue list')) { process.stdout.write('[{\"number\":99,\"iid\":99,\"title\":\"stale\",\"url\":\"http://x\",\"web_url\":\"http://x\"}]\\n'); }",
      "else { process.stdout.write('{}\\n'); }"
    ]);
    const result = runClosureAudit([], tmp, binDir);
    assert.strictEqual(result.dry_run, true, 'no --execute must return dry_run:true, got: ' + result.dry_run);
    assert(!fs.existsSync(marker), 'dry-run must NOT call glab issue update --unlabel (marker must not exist)');
    console.log('testClosureAuditDryRunNeverCallsRemoveLabel: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditStaleLabelsTimeout() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-ca-stale-labels-timeout-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    closureAuditShim(binDir, ['setInterval(() => {}, 1 << 30);']);
    const result = runClosureAudit([], tmp, binDir, { KAOLA_GH_REMOTE_TIMEOUT_MS: '300' });
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
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-ca-unresolved-closed-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    plantClosureRoadmapSource(tmp, 920);
    closureAuditShim(binDir, ['setInterval(() => {}, 1 << 30);']);
    const result = runClosureAudit([], tmp, binDir, { KAOLA_GH_REMOTE_TIMEOUT_MS: '300' });
    const unresolved = result.drift.unresolved_closed_state;
    assert(
      Array.isArray(unresolved) && unresolved.includes(920),
      'unresolved_closed_state must include 920 when issue probe times out, got: ' + JSON.stringify(unresolved)
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
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-ca-probe-fail-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    plantClosureRoadmapSource(tmp, 940);
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
    assert.strictEqual(result.counts.unresolved_closed_state, 1, 'counts.unresolved_closed_state must be 1, got: ' + result.counts.unresolved_closed_state);
    console.log('testClosureAuditProbeFailureUnresolved: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditTimeoutEnvInvalidFallsBack() {
  // NaN timeout causes execFileSync to throw before the shim answers.
  // With fallback=30000 (fix #2), probe succeeds and issue routes to closed_remote.
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-ca-timeout-invalid-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    plantClosureRoadmapSource(tmp, 941);
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
  // Over-cap timeout (> 600000) causes execFileSync to throw ERR_OUT_OF_RANGE before the fix.
  // With Math.min(n, 600000) (fix #185), timeout is clamped and probe succeeds.
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-ca-timeout-overcap-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    plantClosureRoadmapSource(tmp, 941);
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

function testGitlabProbeIssueStateOfflineGuard() {
  const activeFoldersPath = path.join(__dirname, 'kaola-gitlab-workflow-active-folders.js');
  const result = spawnSync(process.execPath, ['-e',
    'const active = require(' + JSON.stringify(activeFoldersPath) + ');' +
    'const r = active.probeIssueState(42);' +
    'process.stdout.write(JSON.stringify(r) + "\\n");'
  ], {
    encoding: 'utf8',
    env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
  });
  assert.strictEqual(result.status, 0, 'subprocess must exit 0, stderr: ' + result.stderr);
  const r = JSON.parse(result.stdout.trim());
  assert.strictEqual(r.state, 'open', 'OFFLINE probeIssueState(42) must return state:open, got: ' + r.state);
  assert.strictEqual(r.reason, 'offline-or-null', 'OFFLINE probeIssueState(42) must return reason:offline-or-null, got: ' + r.reason);
  console.log('testGitlabProbeIssueStateOfflineGuard: PASSED');
}

function testGitlabProbeResidualEmptyExit0() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-probe-empty-')));
  const binDir = path.join(tmp, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  writeShimFiles(path.join(binDir, 'glab'), ["process.exit(0);"]); // empty stdout, exit 0
  const prevMock = process.env.KAOLA_GLAB_MOCK_SCRIPT;
  process.env.KAOLA_GLAB_MOCK_SCRIPT = path.join(binDir, 'glab.js');
  try {
    const r = active.probeIssueState(42);
    assert.strictEqual(r.state, 'unavailable',
      'empty exit-0 must fail-closed to unavailable, got: ' + r.state + ' (' + r.reason + ')');
    assert.strictEqual(r.reason, 'glab issue state unverified',
      'empty exit-0 reason mismatch, got: ' + r.reason);
    console.log('testGitlabProbeResidualEmptyExit0: PASSED');
  } finally {
    if (prevMock === undefined) delete process.env.KAOLA_GLAB_MOCK_SCRIPT;
    else process.env.KAOLA_GLAB_MOCK_SCRIPT = prevMock;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testGitlabProbeResidualNonJsonExit0() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-probe-nonjson-')));
  const binDir = path.join(tmp, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  writeShimFiles(path.join(binDir, 'glab'), ["process.stdout.write('rate limit exceeded\\n');"]); // non-JSON, exit 0
  const prevMock = process.env.KAOLA_GLAB_MOCK_SCRIPT;
  process.env.KAOLA_GLAB_MOCK_SCRIPT = path.join(binDir, 'glab.js');
  try {
    const r = active.probeIssueState(43);
    assert.strictEqual(r.state, 'unavailable',
      'non-JSON exit-0 must fail-closed to unavailable, got: ' + r.state + ' (' + r.reason + ')');
    assert.strictEqual(r.reason, 'glab issue state unverified',
      'non-JSON exit-0 reason mismatch, got: ' + r.reason);
    console.log('testGitlabProbeResidualNonJsonExit0: PASSED');
  } finally {
    if (prevMock === undefined) delete process.env.KAOLA_GLAB_MOCK_SCRIPT;
    else process.env.KAOLA_GLAB_MOCK_SCRIPT = prevMock;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testClosureAuditExecuteDetectionTimeoutPropagates() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-ca-exec-det-timeout-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    closureAuditShim(binDir, ['setInterval(() => {}, 1 << 30);']);
    const result = runClosureAudit(['--execute'], tmp, binDir, { KAOLA_GH_REMOTE_TIMEOUT_MS: '300' });
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

function testClosureAuditMrFolderTimeout() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-ca-mr-folder-timeout-')));
  const binDir = path.join(tmp, 'bin');
  try {
    initGitRepo(tmp);
    writeState(tmp, 'issue-921', 921);
    makeMrSinkFolder(tmp, 'issue-921', 921);
    closureAuditShim(binDir, ['setInterval(() => {}, 1 << 30);']);
    const result = runClosureAudit([], tmp, binDir, { KAOLA_GH_REMOTE_TIMEOUT_MS: '300' });
    assert.strictEqual(
      result.drift.unarchived_mr_folders, 'skipped_timeout',
      'MR-folder hang must return "skipped_timeout", got: ' + JSON.stringify(result.drift.unarchived_mr_folders)
    );
    console.log('testClosureAuditMrFolderTimeout: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

testInstallProfilesFeaturesTableHandling();
testGitLabRoadmapValidateRemote();
testStaleWorktreeCheck();
testStaleWorktreeCleanup();
testClosureAuditOfflineRemoteClassesSkipped();
testClosureAuditClosedRemoteRoadmapSource();
testClosureAuditArchiveClosedDrift();
testClosureAuditDedupRoadmapAndArchive();
testClosureAuditArchiveOnlyNotProbed();
testClosureAuditMirrorListsClosedIssues();
testClosureAuditStaleInProgressLabels();
testClosureAuditActiveFolderForClosedIssueReportsDirty();
testClosureAuditUnarchivedMrFolderMergedLowercase();
testClosureAuditExecuteRepairsRoadmapAndLabels();
testClosureAuditExecuteNeverTouchesActiveFolders();
testClosureAuditDryRunNeverCallsRemoveLabel();
testClosureAuditStaleLabelsTimeout();
testClosureAuditUnresolvedClosedState();
testClosureAuditProbeFailureUnresolved();
testClosureAuditTimeoutEnvInvalidFallsBack();
testClosureAuditTimeoutEnvOverCapFallsBack();
testGitlabProbeIssueStateOfflineGuard();
testGitlabProbeResidualEmptyExit0();
testGitlabProbeResidualNonJsonExit0();
testClosureAuditExecuteDetectionTimeoutPropagates();
testClosureAuditMrFolderTimeout();

// issue #230: classifyIssue / cmdClassify must fail-closed on degraded exit-0 forge response.
// Empty stdout exit-0 and non-JSON exit-0 both produce state:'unknown' from normalizeIssue(parseJson(raw,{})),
// which the existing catch arm never fires for. The guard inserted after the try/catch must return
// target_unavailable before classify() can return 'green'.

function testGitlabClassifyIssueResidualEmptyExit0() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-classify-empty-')));
  const binDir = path.join(tmp, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  writeShimFiles(path.join(binDir, 'glab'), ['process.exit(0);']);
  const prevMock = process.env.KAOLA_GLAB_MOCK_SCRIPT;
  const prevHome = process.env.HOME;
  const prevUserProfile = process.env.USERPROFILE;
  // Fresh temp HOME so readOrCreateConfig writes 'auto' default and does not bypass classifier.
  const tempHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-classify-empty-home-')));
  process.env.KAOLA_GLAB_MOCK_SCRIPT = path.join(binDir, 'glab.js');
  process.env.HOME = tempHome;
  process.env.USERPROFILE = tempHome;
  try {
    const result = classifier.classifyIssue(230, tmp);
    assert.strictEqual(result.verdict, 'target_unavailable',
      'empty exit-0 classifyIssue must return target_unavailable, got: ' + result.verdict + ' (' + result.reasoning + ')');
    assert(/refusing to claim outside KAOLA_WORKFLOW_OFFLINE/.test(result.reasoning),
      'empty exit-0 classifyIssue reasoning must mention refusing to claim outside KAOLA_WORKFLOW_OFFLINE, got: ' + result.reasoning);
    console.log('testGitlabClassifyIssueResidualEmptyExit0: PASSED');
  } finally {
    if (prevMock === undefined) delete process.env.KAOLA_GLAB_MOCK_SCRIPT;
    else process.env.KAOLA_GLAB_MOCK_SCRIPT = prevMock;
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    if (prevUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = prevUserProfile;
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

function testGitlabClassifyIssueResidualNonJsonExit0() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-classify-nonjson-')));
  const binDir = path.join(tmp, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  writeShimFiles(path.join(binDir, 'glab'), ["process.stdout.write('rate limit exceeded\\n');"]);
  const prevMock = process.env.KAOLA_GLAB_MOCK_SCRIPT;
  const prevHome = process.env.HOME;
  const prevUserProfile = process.env.USERPROFILE;
  const tempHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-classify-nonjson-home-')));
  process.env.KAOLA_GLAB_MOCK_SCRIPT = path.join(binDir, 'glab.js');
  process.env.HOME = tempHome;
  process.env.USERPROFILE = tempHome;
  try {
    const result = classifier.classifyIssue(230, tmp);
    assert.strictEqual(result.verdict, 'target_unavailable',
      'non-JSON exit-0 classifyIssue must return target_unavailable, got: ' + result.verdict + ' (' + result.reasoning + ')');
    assert(/refusing to claim outside KAOLA_WORKFLOW_OFFLINE/.test(result.reasoning),
      'non-JSON exit-0 classifyIssue reasoning must mention refusing to claim outside KAOLA_WORKFLOW_OFFLINE, got: ' + result.reasoning);
    console.log('testGitlabClassifyIssueResidualNonJsonExit0: PASSED');
  } finally {
    if (prevMock === undefined) delete process.env.KAOLA_GLAB_MOCK_SCRIPT;
    else process.env.KAOLA_GLAB_MOCK_SCRIPT = prevMock;
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    if (prevUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = prevUserProfile;
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

function testGitlabCmdClassifyResidualEmptyExit0() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-cmdclassify-empty-')));
  const binDir = path.join(tmp, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  writeShimFiles(path.join(binDir, 'glab'), ['process.exit(0);']);
  const tempHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-cmdclassify-empty-home-')));
  try {
    const result = spawnSync(process.execPath, [classifierScript, 'classify', '--issue', '230'], {
      cwd: tmp,
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: tempHome,
        USERPROFILE: tempHome,
        KAOLA_GLAB_MOCK_SCRIPT: path.join(binDir, 'glab.js')
      }
    });
    assert.strictEqual(result.status, 0,
      'cmdClassify empty exit-0 must exit 0, got: ' + result.status + ' stderr: ' + result.stderr);
    const out = JSON.parse(result.stdout.trim());
    assert.strictEqual(out.verdict, 'target_unavailable',
      'cmdClassify empty exit-0 must return target_unavailable, got: ' + out.verdict + ' (' + out.reasoning + ')');
    console.log('testGitlabCmdClassifyResidualEmptyExit0: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

function testGitlabCmdClassifyResidualNonJsonExit0() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-cmdclassify-nonjson-')));
  const binDir = path.join(tmp, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  writeShimFiles(path.join(binDir, 'glab'), ["process.stdout.write('rate limit exceeded\\n');"]);
  const tempHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-cmdclassify-nonjson-home-')));
  try {
    const result = spawnSync(process.execPath, [classifierScript, 'classify', '--issue', '230'], {
      cwd: tmp,
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: tempHome,
        USERPROFILE: tempHome,
        KAOLA_GLAB_MOCK_SCRIPT: path.join(binDir, 'glab.js')
      }
    });
    assert.strictEqual(result.status, 0,
      'cmdClassify non-JSON exit-0 must exit 0, got: ' + result.status + ' stderr: ' + result.stderr);
    const out = JSON.parse(result.stdout.trim());
    assert.strictEqual(out.verdict, 'target_unavailable',
      'cmdClassify non-JSON exit-0 must return target_unavailable, got: ' + out.verdict + ' (' + out.reasoning + ')');
    console.log('testGitlabCmdClassifyResidualNonJsonExit0: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Issue #264 — AC9 parity: worktreePathFor hidden-local-path + legacy-cleanup
// Feature-detecting tests: assert OLD behavior until impl-claim lands the path-
// split + cmdLegacyWorktreeCleanup into kaola-gitlab-workflow-claim.js.
// When impl-claim lands, SIGNAL = typeof claim.legacySiblingWorktreePathFor === 'function'
// activates the strict new-path assertions (RED-pending forward dependency on impl-claim).
// ---------------------------------------------------------------------------

// Test #10a (§F): worktreePathFor hidden-local-path assertion.
// SIGNAL: typeof claim.legacySiblingWorktreePathFor === 'function'
// If present (impl-claim landed): assert worktreePathFor returns a path under <root>/.kw/worktrees/
// Else (not yet landed): assert worktreePathFor returns OLD sibling path (parent/<repo>.kw/<project>)
function testGitlabWorktreePathForHiddenLocal() {
  const root = tempRoot('kw-gl-264-wtpath-');
  try {
    initGitRepo(root);
    const project = 'issue-264-wtpath-test';
    const result = claim.worktreePathFor(root, project);
    const hasNewApi = typeof claim.legacySiblingWorktreePathFor === 'function';
    if (hasNewApi) {
      // impl-claim landed: new path is under <root>/.kw/worktrees/<project>
      assert(
        result.includes(path.join('.kw', 'worktrees', project)),
        'testGitlabWorktreePathForHiddenLocal: expected path under .kw/worktrees/' + project + ', got: ' + result
      );
      assert(
        !result.includes(path.join('.kw', project)) || result.includes(path.join('worktrees', project)),
        'testGitlabWorktreePathForHiddenLocal: path must not be legacy sibling, got: ' + result
      );
    } else {
      // impl-claim not yet landed: old sibling path — parent/<repo>.kw/<project>
      const endsWithKwProject = result.endsWith(path.sep + project) &&
        result.includes('.kw' + path.sep + project) &&
        !result.includes(path.join('.kw', 'worktrees'));
      assert(
        endsWithKwProject,
        'testGitlabWorktreePathForHiddenLocal: expected OLD sibling path ending in .kw/<project>, got: ' + result
      );
    }
    console.log('testGitlabWorktreePathForHiddenLocal: PASSED (hasNewApi=' + hasNewApi + ')');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Test #10b (§F): legacy-worktree-cleanup dry-run assertion.
// SIGNAL: legacy-worktree-cleanup subcommand recognized (exit 0 + JSON with dry_run field).
// If recognized (impl-claim landed): assert dry-run reports legacy path in would_remove, removes nothing.
// Else (not yet landed): SKIP with a SKIPPED line, keeping the walkthrough green.
function testGitlabLegacyWorktreeCleanupDryRun() {
  const root = tempRoot('kw-gl-264-legacy-cleanup-');
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
      console.log('testGitlabLegacyWorktreeCleanupDryRun: SKIPPED (legacy-worktree-cleanup not yet recognized — lands in impl-claim)');
      return;
    }
    // impl-claim landed: build a legacy-path worktree and assert dry-run reports it
    const mainRoot = fs.realpathSync(root);
    const legacyContainer = path.dirname(mainRoot) + path.sep + path.basename(mainRoot) + '.kw';
    const legacyWt = path.join(legacyContainer, 'issue-264-legacy');
    fs.mkdirSync(legacyWt, { recursive: true });
    const addResult = spawnSync('git', ['worktree', 'add', '-b', 'workflow/gitlab-issue-264-legacy', '--', legacyWt, 'HEAD'], {
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
      console.log('testGitlabLegacyWorktreeCleanupDryRun: PASSED');
    } finally {
      spawnSync('git', ['worktree', 'remove', '--force', legacyWt], { cwd: root, encoding: 'utf8' });
      try { fs.rmSync(legacyContainer, { recursive: true, force: true }); } catch (_) {}
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

testGitlabClassifyIssueResidualEmptyExit0();
testGitlabClassifyIssueResidualNonJsonExit0();
testGitlabCmdClassifyResidualEmptyExit0();
testGitlabCmdClassifyResidualNonJsonExit0();
testWatchMrAbandonedClosureInvariantsClean();
testGitlabClaimReclaimsStatelessOrphanDir();
testGitlabPatchBranchGuards();
testGitlabWorktreePathForHiddenLocal();
testGitlabLegacyWorktreeCleanupDryRun();

// ---------------------------------------------------------------------------
// AC-7 (#266): RED-first regression tests for the 3 new scripts (gitlab edition).
// Cases 1-2 (stale config, missing profiles), Case 3 (task-mirror),
// Case 4 (compact-resume), Case 5 (no-silent-inline-fallback).
// ---------------------------------------------------------------------------

const gitlabPreflightScript     = path.join(gitlabPluginRoot, 'scripts', 'kaola-workflow-codex-preflight.js');
const gitlabTaskMirrorScript    = path.join(gitlabPluginRoot, 'scripts', 'kaola-gitlab-workflow-task-mirror.js');
const gitlabCompactResumeScript = path.join(gitlabPluginRoot, 'scripts', 'kaola-gitlab-workflow-codex-compact-resume.js');

// Shared frozen plan fixture (consistent across editions)
const GITLAB_FIXTURE_PLAN_HASH = 'f59d3465f4ca7584eba5f7d04446bf2914e019ba1aa4511c5a25f4e65a80497e';
const GITLAB_FIXTURE_PLAN = [
  '# Workflow Plan',
  `<!-- plan_hash: ${GITLAB_FIXTURE_PLAN_HASH} -->`,
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
function testGitlabPreflight266() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-266-preflight-'));
  try {
    // Install all 13 profiles into the fixture
    const installResult = spawnSync(process.execPath, [installProfilesScript, root], {
      cwd: gitlabPluginRoot, encoding: 'utf8'
    });
    if (installResult.error) throw installResult.error;
    assert.ok(installResult.status === 0, 'gitlab preflight fixture install failed: ' + installResult.stderr);

    // --- GREEN: fresh fixture must pass preflight ---
    const freshResult = spawnSync(process.execPath,
      [gitlabPreflightScript, '--project-root', root, '--no-autofix', '--json'],
      { encoding: 'utf8' });
    assert.strictEqual(freshResult.status, 0,
      '#266 gl case1 RED-discriminator: fresh fixture must exit 0, got ' + freshResult.status + '\n' + freshResult.stdout);
    const freshJson = JSON.parse(freshResult.stdout);
    assert.strictEqual(freshJson.status, 'ok',
      '#266 gl case1 RED-discriminator: fresh fixture must return status:ok, got ' + freshJson.status);

    // --- Case 1 RED: remove a role from the managed block → config_stale ---
    const configPath = path.join(root, '.codex', 'config.toml');
    const origConfig = fs.readFileSync(configPath, 'utf8');
    const staleConfig = origConfig.replace('[agents.workflow-planner]', '[agents.STALE-workflow-planner]');
    fs.writeFileSync(configPath, staleConfig);

    const staleResult = spawnSync(process.execPath,
      [gitlabPreflightScript, '--project-root', root, '--no-autofix', '--json'],
      { encoding: 'utf8' });
    assert.notStrictEqual(staleResult.status, 0,
      '#266 gl case1: stale managed block must cause non-zero exit, got ' + staleResult.status);
    const staleJson = JSON.parse(staleResult.stdout);
    assert.strictEqual(staleJson.status, 'config_stale',
      '#266 gl case1: must return config_stale, got ' + staleJson.status);
    assert.ok(Array.isArray(staleJson.missing_roles) && staleJson.missing_roles.includes('workflow-planner'),
      '#266 gl case1: missing_roles must include workflow-planner, got ' + JSON.stringify(staleJson.missing_roles));

    // --- Case 1 GREEN (autofix): ---
    const autofixRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-266-preflight-autofix-'));
    try {
      fs.mkdirSync(path.join(autofixRoot, '.codex', 'agents', 'kaola-workflow'), { recursive: true });
      fs.writeFileSync(path.join(autofixRoot, '.codex', 'config.toml'), staleConfig);
      const srcAgentsDir = path.join(root, '.codex', 'agents', 'kaola-workflow');
      const dstAgentsDir = path.join(autofixRoot, '.codex', 'agents', 'kaola-workflow');
      for (const f of fs.readdirSync(srcAgentsDir)) {
        fs.copyFileSync(path.join(srcAgentsDir, f), path.join(dstAgentsDir, f));
      }
      const autofixResult = spawnSync(process.execPath,
        [gitlabPreflightScript, '--project-root', autofixRoot, '--json'],
        { encoding: 'utf8' });
      assert.strictEqual(autofixResult.status, 0,
        '#266 gl case1 autofix: must exit 0 after repair, got ' + autofixResult.status + '\n' + autofixResult.stdout);
      const autofixJson = JSON.parse(autofixResult.stdout);
      assert.ok(autofixJson.status === 'ok' && autofixJson.autofixed === true,
        '#266 gl case1 autofix: must return ok+autofixed:true, got ' + JSON.stringify(autofixJson));
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
      [gitlabPreflightScript, '--project-root', root, '--no-autofix', '--json'],
      { encoding: 'utf8' });
    assert.notStrictEqual(missingResult.status, 0,
      '#266 gl case2: missing profile toml must cause non-zero exit, got ' + missingResult.status);
    const missingJson = JSON.parse(missingResult.stdout);
    assert.strictEqual(missingJson.status, 'profiles_missing',
      '#266 gl case2: must return profiles_missing, got ' + missingJson.status);
    assert.ok(Array.isArray(missingJson.missing_roles) && missingJson.missing_roles.includes('workflow-planner'),
      '#266 gl case2: missing_roles must include workflow-planner');

    // Restore toml
    fs.writeFileSync(wpToml, savedToml);

    // --- Case 2 GREEN: restored → fresh again ---
    const restoredResult = spawnSync(process.execPath,
      [gitlabPreflightScript, '--project-root', root, '--no-autofix', '--json'],
      { encoding: 'utf8' });
    assert.strictEqual(restoredResult.status, 0,
      '#266 gl case2 GREEN: restored fixture must pass, got ' + restoredResult.status);

    // --- Case 5 RED: absent profile → REFUSES, stdout must NOT contain subagent-invoked or local-fallback ---
    fs.unlinkSync(wpToml);
    const refusalResult = spawnSync(process.execPath,
      [gitlabPreflightScript, '--project-root', root, '--no-autofix', '--json'],
      { encoding: 'utf8' });
    assert.notStrictEqual(refusalResult.status, 0,
      '#266 gl case5 RED: absent profile must cause non-zero exit, got ' + refusalResult.status);
    assert.ok(!refusalResult.stdout.includes('subagent-invoked'),
      '#266 gl case5: preflight refusal must NOT emit subagent-invoked, got: ' + refusalResult.stdout);
    assert.ok(!refusalResult.stdout.includes('local-fallback'),
      '#266 gl case5: preflight refusal must NOT emit local-fallback, got: ' + refusalResult.stdout);
    // Restore
    fs.writeFileSync(wpToml, savedToml);

    console.log('testGitlabPreflight266 (#266 cases 1,2,5): PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Case 3: task-mirror regeneration (gitlab edition)
function testGitlabTaskMirror266() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-266-taskmirror-'));
  try {
    const projectName = 'issue-266-mirror';
    const projDir = path.join(root, 'kaola-workflow', projectName);
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, 'workflow-plan.md'), GITLAB_FIXTURE_PLAN);

    const NOW = '2026-06-07T12:00:00.000Z';

    // --- GREEN: run task-mirror → produces correct JSON ---
    const r1 = spawnSync(process.execPath,
      [gitlabTaskMirrorScript, '--project', projectName, '--now', NOW, '--json'],
      { cwd: root, encoding: 'utf8' });
    assert.strictEqual(r1.status, 0,
      '#266 gl case3: task-mirror must exit 0, got ' + r1.status + '\n' + r1.stderr);
    const mirror1 = JSON.parse(r1.stdout);
    assert.strictEqual(mirror1.source_plan_hash, GITLAB_FIXTURE_PLAN_HASH,
      '#266 gl case3: source_plan_hash mismatch, got ' + mirror1.source_plan_hash);
    assert.ok(Array.isArray(mirror1.tasks) && mirror1.tasks.length === 4,
      '#266 gl case3: expected 4 tasks, got ' + mirror1.tasks.length);
    assert.strictEqual(mirror1.last_synced_from_ledger, NOW,
      '#266 gl case3: last_synced_from_ledger mismatch, got ' + mirror1.last_synced_from_ledger);

    // --- Verify all 4 ledger→status mappings ---
    const byId = Object.fromEntries(mirror1.tasks.map(t => [t.id, t]));
    assert.ok(byId.explore.status === 'completed' && byId.explore.ledger_status === 'complete',
      '#266 gl case3: explore mapping wrong, got ' + JSON.stringify(byId.explore));
    assert.ok(byId.impl.status === 'in_progress' && byId.impl.ledger_status === 'in_progress',
      '#266 gl case3: impl mapping wrong, got ' + JSON.stringify(byId.impl));
    assert.ok(byId.gate.status === 'pending' && byId.gate.ledger_status === 'pending',
      '#266 gl case3: gate mapping wrong, got ' + JSON.stringify(byId.gate));
    assert.ok(byId.done.status === 'completed' && byId.done.ledger_status === 'n/a',
      '#266 gl case3: done (n/a) mapping wrong, got ' + JSON.stringify(byId.done));

    // --- Determinism: same --now ⇒ identical output ---
    const r2 = spawnSync(process.execPath,
      [gitlabTaskMirrorScript, '--project', projectName, '--now', NOW, '--json'],
      { cwd: root, encoding: 'utf8' });
    assert.strictEqual(r1.stdout, r2.stdout,
      '#266 gl case3 det: two runs must produce identical stdout');

    // --- RED discriminator: unfrozen plan → non-zero exit ---
    const unfrozenPlan = GITLAB_FIXTURE_PLAN.replace(
      `<!-- plan_hash: ${GITLAB_FIXTURE_PLAN_HASH} -->`, '');
    fs.writeFileSync(path.join(projDir, 'workflow-plan.md'), unfrozenPlan);
    const rUnfrozen = spawnSync(process.execPath,
      [gitlabTaskMirrorScript, '--project', projectName, '--now', NOW, '--json'],
      { cwd: root, encoding: 'utf8' });
    assert.notStrictEqual(rUnfrozen.status, 0,
      '#266 gl case3 RED: unfrozen plan must cause non-zero exit, got ' + rUnfrozen.status);

    // --- Stale-hash regeneration ---
    const FAKE_HASH = 'a'.repeat(64);
    const staleHashPlan = GITLAB_FIXTURE_PLAN.replace(
      `<!-- plan_hash: ${GITLAB_FIXTURE_PLAN_HASH} -->`,
      `<!-- plan_hash: ${FAKE_HASH} -->`);
    fs.writeFileSync(path.join(projDir, 'workflow-plan.md'), staleHashPlan);
    const rStale = spawnSync(process.execPath,
      [gitlabTaskMirrorScript, '--project', projectName, '--now', NOW, '--json'],
      { cwd: root, encoding: 'utf8' });
    assert.strictEqual(rStale.status, 0,
      '#266 gl case3 stale-hash: must exit 0, got ' + rStale.status + '\n' + rStale.stderr);
    const mirrorStale = JSON.parse(rStale.stdout);
    assert.strictEqual(mirrorStale.source_plan_hash, FAKE_HASH,
      '#266 gl case3 stale-hash: output hash must reflect new plan_hash');
    assert.notStrictEqual(mirrorStale.source_plan_hash, GITLAB_FIXTURE_PLAN_HASH,
      '#266 gl case3 stale-hash: stale mirror must NOT carry old hash');

    console.log('testGitlabTaskMirror266 (#266 case 3): PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Case 4: compact/resume packet (gitlab edition)
function testGitlabCompactResume266() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-266-compact-'));
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

    fs.writeFileSync(path.join(projDir, 'workflow-plan.md'), GITLAB_FIXTURE_PLAN);

    const tasksJson = JSON.stringify({
      source_plan_hash: GITLAB_FIXTURE_PLAN_HASH,
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
    const r1 = spawnSync(process.execPath, [gitlabCompactResumeScript],
      { input, encoding: 'utf8' });
    assert.strictEqual(r1.status, 0,
      '#266 gl case4: compact-resume must exit 0, got ' + r1.status + '\n' + r1.stderr);
    const lines1 = r1.stdout.trim().split('\n');
    assert.strictEqual(lines1.length, 7,
      '#266 gl case4: packet must have 7 lines, got ' + lines1.length + '\n' + r1.stdout);

    assert.strictEqual(lines1[0], 'Kaola-Workflow compact resume:',
      '#266 gl case4: line[0] must be header, got ' + lines1[0]);
    assert.ok(lines1[1].includes('issue-266-compact'),
      '#266 gl case4: active project must include project name, got ' + lines1[1]);
    assert.ok(lines1[3].includes('impl') && lines1[3].includes('implementer'),
      '#266 gl case4: in-progress node must show impl+role, got ' + lines1[3]);
    assert.ok(lines1[4].includes('gate'),
      '#266 gl case4: pending gates must include gate, got ' + lines1[4]);
    assert.ok(lines1[5].includes('consent_halt=pending'),
      '#266 gl case4: consent-halt must show pending, got ' + lines1[5]);
    assert.ok(lines1[6].includes('completed: 2') && lines1[6].includes('in_progress: 1'),
      '#266 gl case4: task mirror must show correct counts, got ' + lines1[6]);

    // --- Determinism: two runs → identical stdout ---
    const r2 = spawnSync(process.execPath, [gitlabCompactResumeScript],
      { input, encoding: 'utf8' });
    assert.strictEqual(r1.stdout, r2.stdout,
      '#266 gl case4 det: two compact-resume runs must produce identical stdout');

    // --- RED discriminator: no workflow-state → empty stdout ---
    const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-266-compact-empty-'));
    try {
      const rEmpty = spawnSync(process.execPath, [gitlabCompactResumeScript],
        { input: JSON.stringify({ cwd: emptyRoot }), encoding: 'utf8' });
      assert.strictEqual(rEmpty.status, 0,
        '#266 gl case4 RED: empty root must exit 0, got ' + rEmpty.status);
      assert.strictEqual(rEmpty.stdout.trim(), '',
        '#266 gl case4 RED: no workflow dir must produce no output, got: ' + rEmpty.stdout);
    } finally {
      fs.rmSync(emptyRoot, { recursive: true, force: true });
    }

    console.log('testGitlabCompactResume266 (#266 case 4): PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

testGitlabPreflight266();
testGitlabTaskMirror266();
testGitlabCompactResume266();

testGitLabRoadmapInitIssueExclusiveAndUpdate()
  .then(() => {
    console.log('GitLab workflow script tests passed');
  })
  .catch(err => {
    console.error(err && err.stack ? err.stack : String(err));
    process.exitCode = 1;
  });
