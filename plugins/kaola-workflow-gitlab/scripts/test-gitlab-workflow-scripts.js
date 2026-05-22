#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const forge = require('./kaola-gitlab-forge');
const active = require('./kaola-gitlab-workflow-active-folders');
const classifier = require('./kaola-gitlab-workflow-classifier');
const claim = require('./kaola-gitlab-workflow-claim');
const roadmap = require('./kaola-gitlab-workflow-roadmap');
const repair = require('./kaola-gitlab-workflow-repair-state');

const claimScript = path.join(__dirname, 'kaola-gitlab-workflow-claim.js');
const roadmapScript = path.join(__dirname, 'kaola-gitlab-workflow-roadmap.js');
const classifierScript = path.join(__dirname, 'kaola-gitlab-workflow-classifier.js');

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
  fs.writeFileSync(path.join(dir, 'phase3-plan.md'), '# Phase 3 - Plan\n');
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
    assert.strictEqual(out.verdict, 'green');
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
    fs.writeFileSync(path.join(dir, 'phase6-summary.md'), '# Phase 6\n');
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
    fs.writeFileSync(path.join(dir, 'phase3-plan.md'), '# Phase 3\n');
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

// Issue #100: sibling worktree path - startup from a linked worktree must produce sibling paths
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-sibling-'));
  const kwRoot = fs.realpathSync(tmp) + '.kw';
  try {
    initGitRepo(tmp);
    // Simulate a linked worktree by running startup from within a hypothetical linked path.
    // We do this by creating a sibling dir that shares the same git common-dir.
    const linkedWt = path.join(kwRoot, 'issue-5');
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

    // Run startup from the linked worktree cwd — should produce sibling, not nested path
    const result = spawnSync(process.execPath, [claimScript, 'startup', '--runtime', 'test', '--target-issue', '6'], {
      cwd: linkedWt, encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKTREE_NATIVE: '1',
             ...glabMockEnv(binDir100),
             PATH: binDir100 + path.delimiter + path.dirname(process.execPath) + path.delimiter + (process.env.PATH || '') }
    });
    assert.strictEqual(result.status, 0, 'sibling startup must exit 0\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    const out = JSON.parse(result.stdout.trim());
    const expectedSibling = path.join(kwRoot, 'issue-6');
    assert.strictEqual(out.worktree_path, expectedSibling,
      'startup from linked worktree must produce sibling path, not nested: got ' + out.worktree_path);
    assert.ok(!out.worktree_path.includes('issue-5.kw'),
      'worktree path must not contain issue-5.kw nesting: ' + out.worktree_path);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(kwRoot, { recursive: true, force: true });
  }
}

// Issue #101: KAOLA_PATH=fast startup must write fast-path state
{
  const root = tempRoot('kw-gl-fast-startup-');
  try {
    initGitRepo(root);
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

// Issue #107: reconstruct() must not route to Phase 6 when phase4-progress.md has open tasks
// Test 1 — Negative guard (the bug fix):
{
  const root = tempRoot('kw-gl-issue107-guard-');
  try {
    const dir = writeState(root, 'issue107-guard', 107);
    fs.writeFileSync(path.join(dir, 'phase4-progress.md'),
      '# Phase 4\n\n## Tasks\n| # | Task | Status |\n|---|------|--------|\n| A | Task A | open |\n');
    fs.writeFileSync(path.join(dir, 'phase5-review.md'), '# Phase 5\n');
    const result = repair.reconstruct(root, path.join(root, 'kaola-workflow'), 'issue107-guard');
    assert(!result.nextCommand, 'guard must not route to Phase 6 when Phase 4 tasks are open');
    assert(/open tasks/.test(result.reason || ''), 'reason must mention open tasks');
    repair.repair('issue107-guard', root);
    const state = fs.readFileSync(path.join(dir, 'workflow-state.md'), 'utf8');
    assert(!/phase: 6\b/.test(state), 'state file must not advance to phase 6 with open Phase 4 tasks');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Issue #107: reconstruct() must still route to Phase 6 when all Phase 4 tasks are complete
// Test 2 — Positive regression (happy path still works):
{
  const root = tempRoot('kw-gl-issue107-allow-');
  try {
    const dir = writeState(root, 'issue107-allow', 108);
    fs.writeFileSync(path.join(dir, 'phase4-progress.md'),
      '# Phase 4\n\n## Tasks\n| # | Task | Status |\n|---|------|--------|\n| A | Task A | complete |\n');
    fs.writeFileSync(path.join(dir, 'phase5-review.md'), '# Phase 5\n');
    const result = repair.reconstruct(root, path.join(root, 'kaola-workflow'), 'issue107-allow');
    assert.strictEqual(result.phase, 6, 'happy path must still route to Phase 6');
    assert(/kaola-workflow-phase6/.test(result.nextCommand), 'nextCommand must be phase 6');
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
      9,
      'should install 9 agent TOML files'
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
{
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-native-off-')));
  try {
    initGitRepo(root);
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
    // No roadmap file for issue 202 => green (no overlap, no dependency)
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

  console.log('testStaleWorktreeCleanup: PASSED');
}

testInstallProfilesFeaturesTableHandling();
testStaleWorktreeCheck();
testStaleWorktreeCleanup();

testGitLabRoadmapInitIssueExclusiveAndUpdate()
  .then(() => {
    console.log('GitLab workflow script tests passed');
  })
  .catch(err => {
    console.error(err && err.stack ? err.stack : String(err));
    process.exitCode = 1;
  });
