#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');
const claimScript = path.join(__dirname, 'kaola-gitlab-workflow-claim.js');

// OFFLINE is captured by sink modules at require time. Keep in-process forge
// stubs online; subprocess cases that exercise offline mode set their own env.
delete process.env.KAOLA_WORKFLOW_OFFLINE;

const forge = require('./kaola-gitlab-forge');
const sinkMr = require('./kaola-gitlab-workflow-sink-mr');
const sinkMerge = require('./kaola-gitlab-workflow-sink-merge');

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

function setupRealRepo(name, project) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), name + '-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  git('init', '-b', 'main');
  git('config', 'user.email', 'test@test.com');
  git('config', 'user.name', 'Test');
  fs.writeFileSync(path.join(root, 'README.md'), 'init');
  git('add', '.');
  git('commit', '-m', 'init');
  const branch = 'workflow/' + project;
  git('checkout', '-b', branch);
  fs.writeFileSync(path.join(root, 'feature.md'), 'feature');
  git('add', '.');
  git('commit', '-m', 'feature commit');
  git('checkout', 'main');
  writeWorkflow(root, project, 1);
  return { root, branch };
}

function setupRealRepoWithBareRemote(name, project) {
  const { root, branch } = setupRealRepo(name, project);
  const remotePath = root + '-remote';
  execFileSync('git', ['init', '--bare', remotePath], { encoding: 'utf8' });
  execFileSync('git', ['remote', 'add', 'origin', remotePath], { cwd: root, encoding: 'utf8' });
  execFileSync('git', ['push', '-u', 'origin', 'main'], { cwd: root, encoding: 'utf8' });
  execFileSync('git', ['push', '-u', 'origin', branch], { cwd: root, encoding: 'utf8' });
  execFileSync('git', ['branch', '--set-upstream-to=origin/' + branch, branch], { cwd: root, encoding: 'utf8' });
  return { root, branch, remotePath };
}

function setupRepoWithLiveFolderOnBranch(name, project) {
  const { root, branch } = setupRealRepo(name, project);
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  // setupRealRepo leaves kaola-workflow/ as untracked on main. Commit it so
  // the feature-branch checkout doesn't conflict with those untracked paths.
  git('add', 'kaola-workflow/');
  git('commit', '-m', 'add workflow files to main');
  // Now commit only workflow-state.md (live content) on the feature branch.
  git('checkout', branch);
  const dir = path.join(root, 'kaola-workflow', project);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'workflow-state.md'), '# Kaola-Workflow State\nstatus: active\n');
  git('add', path.join('kaola-workflow', project, 'workflow-state.md'));
  git('commit', '-m', 'accidentally committed live folder');
  git('checkout', 'main');
  // main still has phase6-summary.md committed, so finalValidationPassed() passes.
  return { root, branch };
}

function writeWorkflow(root, project, issueIid, summary) {
  const dir = path.join(root, 'kaola-workflow', project);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'workflow-state.md'), [
    '# Kaola-Workflow State',
    '',
    '## Project',
    'name: ' + project,
    'status: active',
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
    ''
  ].join('\n'));
  fs.writeFileSync(path.join(dir, 'phase6-summary.md'), summary || '# Phase 6\n\n## Final Validation\n\n- `npm test`: pass\n');
  return dir;
}

withForge({
  listMergeRequests() {
    return [{
      mr_iid: 8,
      mr_url: 'https://gitlab.example/group/project/-/merge_requests/8',
      web_url: 'https://gitlab.example/group/project/-/merge_requests/8',
      state: 'opened',
      source_branch: 'feature'
    }];
  },
  createMergeRequest() {
    throw new Error('existing MR should be reused');
  }
}, () => {
  const root = tempRoot('kw-gl-mr-reuse-');
  writeWorkflow(root, 'sink-project', 68);
  const calls = [];
  const mr = sinkMr.ensureMergeRequest({
    branch: 'feature',
    project: 'sink-project',
    issue: 68
  }, {
    root,
    gitExec(bin, args) { calls.push([bin, args]); return ''; }
  });
  assert.strictEqual(mr.mr_iid, 8);
  assert.deepStrictEqual(calls[0], ['git', ['push', 'origin', 'feature']]);
  const state = fs.readFileSync(path.join(root, 'kaola-workflow', 'sink-project', 'workflow-state.md'), 'utf8');
  assert(state.includes('sink: mr'));
  assert(state.includes('mr_url: https://gitlab.example/group/project/-/merge_requests/8'));
  assert(state.includes('mr_iid: 8'));
  const summary = fs.readFileSync(path.join(root, 'kaola-workflow', 'sink-project', 'phase6-summary.md'), 'utf8');
  assert(summary.includes('MR URL: https://gitlab.example/group/project/-/merge_requests/8'));
  assert(summary.includes('MR IID: 8'));
});

withForge({
  listMergeRequests() { return []; },
  createMergeRequest(opts) {
    assert.strictEqual(opts.sourceBranch, 'feature-new');
    assert.strictEqual(opts.targetBranch, 'main');
    assert.strictEqual(opts.description, 'Closes #69');
    return {
      mr_iid: 9,
      mr_url: 'https://gitlab.example/group/project/-/merge_requests/9',
      web_url: 'https://gitlab.example/group/project/-/merge_requests/9',
      state: 'opened',
      source_branch: 'feature-new'
    };
  }
}, () => {
  const root = tempRoot('kw-gl-mr-create-');
  writeWorkflow(root, 'new-project', 69);
  const mr = sinkMr.ensureMergeRequest({
    branch: 'feature-new',
    project: 'new-project',
    issue: 69
  }, {
    root,
    skipPush: true
  });
  assert.strictEqual(mr.mr_iid, 9);
});

withForge({
  mergeMergeRequest(mrIid, opts) {
    assert.strictEqual(mrIid, 10);
    assert.strictEqual(opts.autoMerge, true);
    assert.strictEqual(opts.squash, true);
    assert.strictEqual(opts.removeSourceBranch, true);
    assert.strictEqual(opts.sha, 'abc123');
    return { mr_iid: 10, state: 'merged' };
  }
}, () => {
  assert.strictEqual(sinkMr.mergeMergeRequest(10, {
    autoMerge: true,
    squash: true,
    removeSourceBranch: true,
    sha: 'abc123'
  }).state, 'merged');
});

assert.strictEqual(sinkMr.routeMergeRequestState({ state: 'opened' }), 'open');
assert.strictEqual(sinkMr.routeMergeRequestState({ state: 'closed' }), 'closed');
assert.strictEqual(sinkMr.routeMergeRequestState({ state: 'merged' }), 'merged');

{
  const root = tempRoot('kw-gl-merge-gate-');
  writeWorkflow(root, 'gate-project', 70, '# Phase 6\n\n## Final Validation\n\n- `npm test`: blocked\n');
  assert.throws(() => sinkMerge.closeLinkedIssue(root, 'gate-project', 70), /Final validation evidence/);
}

let updateIssueCalled = null;
withForge({
  createIssueNote(project, issueIid, body) {
    assert.strictEqual(project.project_id, 77);
    assert.strictEqual(issueIid, 71);
    assert(body.includes('final validation passed'));
    return { id: 9001 };
  },
  closeIssue(issueIid) {
    assert.strictEqual(issueIid, 71);
    return { issue_iid: 71, state: 'closed' };
  },
  updateIssue(issueIid, opts) {
    updateIssueCalled = { issueIid, opts };
    return null;
  }
}, () => {
  const root = tempRoot('kw-gl-merge-close-');
  writeWorkflow(root, 'close-project', 71);
  const result = sinkMerge.runDirectMerge({
    branch: 'feature-close',
    project: 'close-project',
    issue: 71
  }, {
    root,
    skipGit: true
  });
  assert.strictEqual(result.merged, true);
  assert.strictEqual(result.close.note_id, 9001);
  assert.ok(updateIssueCalled, 'forge.updateIssue should have been called');
  assert.strictEqual(updateIssueCalled.issueIid, 71);
  assert.ok(
    Array.isArray(updateIssueCalled.opts.unlabels) &&
    updateIssueCalled.opts.unlabels.includes(forge.CLAIM_LABEL),
    'updateIssue opts.unlabels must include forge.CLAIM_LABEL'
  );
});

{
  // Bug 1: finalValidationPassed reads from archive fallback
  const root = tempRoot('kw-gl-fvp-archived-');
  try {
    writeWorkflow(root, 'test-proj', 99);
    fs.mkdirSync(path.join(root, 'kaola-workflow', 'archive'), { recursive: true });
    fs.renameSync(
      path.join(root, 'kaola-workflow', 'test-proj'),
      path.join(root, 'kaola-workflow', 'archive', 'test-proj')
    );
    assert.strictEqual(sinkMerge.finalValidationPassed(root, 'test-proj'), true,
      'finalValidationPassed should return true from archive fallback');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

withForge({
  createIssueNote(project, issueIid, body) {
    assert.strictEqual(project.project_id, 77);
    return { id: 9002 };
  },
  closeIssue(issueIid) {
    assert.strictEqual(issueIid, 99);
    return { issue_iid: 99, state: 'closed' };
  }
}, () => {
  // Bug 1: runDirectMerge succeeds after archive (tests both finalValidationPassed + readProjectInfo)
  const root = tempRoot('kw-gl-rdm-archived-');
  try {
    writeWorkflow(root, 'archive-proj', 99);
    fs.mkdirSync(path.join(root, 'kaola-workflow', 'archive'), { recursive: true });
    fs.renameSync(
      path.join(root, 'kaola-workflow', 'archive-proj'),
      path.join(root, 'kaola-workflow', 'archive', 'archive-proj')
    );
    const result = sinkMerge.runDirectMerge(
      { branch: 'workflow/archive-proj', project: 'archive-proj', issue: 99 },
      { root, skipGit: true }
    );
    assert.strictEqual(result.merged, true, 'runDirectMerge should succeed after archive');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

{
  // Bug 3: appendSummary returns false when parent dir doesn't exist (archived)
  const root = tempRoot('kw-gl-appsum-archived-');
  try {
    const summaryFile = path.join(root, 'kaola-workflow', 'gone-project', 'phase6-summary.md');
    // Parent dir does NOT exist
    const result = sinkMr.appendSummary(summaryFile, 'https://example/mr/1', 1);
    assert.strictEqual(result, false, 'appendSummary should return false when parent dir missing');
    assert(!fs.existsSync(path.dirname(summaryFile)),
      'appendSummary must not create the parent directory');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

{
  // Bug 3: appendSummary returns true and writes file when parent dir exists
  const root = tempRoot('kw-gl-appsum-live-');
  try {
    fs.mkdirSync(path.join(root, 'kaola-workflow', 'live-project'), { recursive: true });
    const summaryFile = path.join(root, 'kaola-workflow', 'live-project', 'phase6-summary.md');
    const result = sinkMr.appendSummary(summaryFile, 'https://example/mr/2', 2);
    assert.strictEqual(result, true, 'appendSummary should return true when dir exists');
    const content = fs.readFileSync(summaryFile, 'utf8');
    assert(content.includes('MR URL: https://example/mr/2'), 'should write MR URL');
    assert(content.includes('MR IID: 2'), 'should write MR IID');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

{
  // Bug 2: sink-fallback with no active dir → returns {updated: false, reason: 'project archived'}
  const root = tempRoot('kw-gl-sfskip-');
  try {
    // No kaola-workflow/already-archived dir created
    const result = spawnSync(process.execPath, [claimScript, 'sink-fallback', '--project', 'already-archived'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
    });
    assert.strictEqual(result.status, 0, 'sink-fallback should exit 0 on archived project');
    const parsed = JSON.parse(result.stdout);
    assert.strictEqual(parsed.updated, false, 'updated should be false');
    assert.strictEqual(parsed.reason, 'project archived', 'reason should be project archived');
    assert(!fs.existsSync(path.join(root, 'kaola-workflow', 'already-archived')),
      'live dir must not be created');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

{
  // Bug 2b (Part B): sink-fallback with live dir AND archive dir → returns {updated: false, reason: 'project archived'}
  const root = tempRoot('kw-gl-sflive-archive-');
  try {
    const projDir = path.join(root, 'kaola-workflow', 'already-moved');
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, 'workflow-state.md'),
      'sink: merge\nbranch: workflow/already-moved\nlast_result: phase6_complete\n');
    const archiveDir = path.join(root, 'kaola-workflow', 'archive', 'already-moved');
    fs.mkdirSync(archiveDir, { recursive: true });
    const result = spawnSync(process.execPath, [claimScript, 'sink-fallback', '--project', 'already-moved'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
    });
    assert.strictEqual(result.status, 0, 'sink-fallback should exit 0 when both live and archive dirs exist');
    const parsed = JSON.parse(result.stdout);
    assert.strictEqual(parsed.updated, false, 'updated should be false');
    assert.strictEqual(parsed.reason, 'project archived', 'reason should be project archived');
    const stateContent = fs.readFileSync(path.join(projDir, 'workflow-state.md'), 'utf8');
    assert(stateContent.includes('sink: merge'), 'workflow-state.md must not be modified when archive guard fires');
    console.log('sink-fallback live+archive guard test passed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

{
  // Bug 2: sink-fallback with active dir present → returns {updated: true, sink: 'mr'}
  const root = tempRoot('kw-gl-sflive-');
  try {
    const projDir = path.join(root, 'kaola-workflow', 'active-project');
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, 'workflow-state.md'),
      'sink: merge\nbranch: workflow/active-project\nlast_result: phase6_complete\n');
    const result = spawnSync(process.execPath, [claimScript, 'sink-fallback', '--project', 'active-project'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
    });
    assert.strictEqual(result.status, 0, 'sink-fallback should exit 0 with live dir');
    const parsed = JSON.parse(result.stdout);
    assert.strictEqual(parsed.updated, true, 'updated should be true');
    assert.strictEqual(parsed.sink, 'mr', 'sink should be mr');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

{
  // Bug 2: unsafe project name → non-zero exit with 'unsafe project name' message
  const root = tempRoot('kw-gl-sfunsafe-');
  try {
    const result = spawnSync(process.execPath, [claimScript, 'sink-fallback', '--project', '../escape'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
    });
    assert.notStrictEqual(result.status, 0, 'expected non-zero exit for unsafe name');
    assert((result.stderr || '').includes('unsafe project name'),
      `expected unsafe-name message; got stderr: ${result.stderr}`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Security: branch name leading-hyphen rejection
{
  const { runDirectMerge } = require('./kaola-gitlab-workflow-sink-merge');
  let err;
  try { runDirectMerge({ branch: '--orphan', project: 'test' }); } catch (e) { err = e; }
  assert(err && /--branch is invalid or TBD/.test(err.message),
    'runDirectMerge should reject branch names starting with - (got: ' + (err && err.message) + ')');
  console.log('branch name security validation test passed');
}

{
  // Task 2 — block 1: classifyMergeError unit tests
  let classify;
  try { classify = require('./kaola-gitlab-workflow-sink-merge').classifyMergeError; } catch (_) {}
  if (!classify) classify = () => null; // fallback so other assertions can run

  const assert_cls = (msg, expected, label) => {
    const err = new Error(msg);
    err.stderr = msg;
    const got = classify(err);
    assert(got === expected, `classifyMergeError: expected '${expected}' for ${label}, got '${got}'`);
  };

  assert_cls('protected branch push rejected', 'branch_protected', 'protected branch');
  assert_cls('pre-receive hook declined', 'branch_protected', 'pre-receive hook');
  assert_cls('rejected non-fast-forward push', 'non_fast_forward', 'rejected non-ff');
  assert_cls('conflicts with target branch', 'non_fast_forward', 'conflicts with target');
  assert_cls('Permission denied 403 not authorized', 'permission_denied', 'permission denied');
  assert_cls('not allowed to push to protected branch', 'permission_denied', 'not allowed to push');
  assert_cls('not allowed to merge this MR', 'permission_denied', 'not allowed to merge');
  const nullErr = new Error('some random unclassified error');
  assert(classify(nullErr) === null, 'classifyMergeError: expected null for unclassified error');

  // FORCE_MERGE_IMPOSSIBLE override: env var must be read at call time
  const prev = process.env.KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE;
  process.env.KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE = 'my_token';
  try {
    const forced = classify(new Error('any random message'));
    assert(forced === 'my_token', `classifyMergeError: expected 'my_token' when FORCE_MERGE_IMPOSSIBLE set, got '${forced}'`);
  } finally {
    delete process.env.KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE;
    if (prev !== undefined) process.env.KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE = prev;
  }

  console.log('classifyMergeError unit tests passed');
}

{
  // Task 2 — block 2: exit-2 subprocess test (FORCE_FF_FAIL=3)
  const sinkScript = path.join(__dirname, 'kaola-gitlab-workflow-sink-merge.js');
  const { root, branch } = setupRealRepo('exit2-test', 'test-exit2');
  const result = spawnSync(process.execPath, [sinkScript, '--branch', branch, '--project', 'test-exit2', '--root', root], {
    cwd: root,
    env: { ...process.env, KAOLA_WORKFLOW_FORCE_FF_FAIL: '3', KAOLA_WORKFLOW_OFFLINE: '1' },
    encoding: 'utf8'
  });
  assert(result.status === 2, `exit-2 test: expected exit code 2, got ${result.status}. stderr: ${result.stderr}`);
  console.log('exit-2 subprocess test passed');
}

{
  // Task 2 — block 3: exit-3 subprocess test (FORCE_MERGE_IMPOSSIBLE=branch_protected)
  const sinkScript = path.join(__dirname, 'kaola-gitlab-workflow-sink-merge.js');
  const { root, branch } = setupRealRepo('exit3-test', 'test-exit3');
  const result = spawnSync(process.execPath, [sinkScript, '--branch', branch, '--project', 'test-exit3', '--root', root], {
    cwd: root,
    env: { ...process.env, KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE: 'branch_protected', KAOLA_WORKFLOW_OFFLINE: '1' },
    encoding: 'utf8'
  });
  assert(result.status === 3, `exit-3 test: expected exit code 3, got ${result.status}. stderr: ${result.stderr}`);
  const receiptPath = path.join(root, 'kaola-workflow', 'test-exit3', '.cache', 'sink-fallback.json');
  assert(fs.existsSync(receiptPath), 'exit-3 test: sink-fallback.json receipt not found');
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  assert(receipt.reason === 'branch_protected', `exit-3 test: receipt.reason expected 'branch_protected', got '${receipt.reason}'`);
  assert(receipt.project === 'test-exit3', `exit-3 test: receipt.project expected 'test-exit3', got '${receipt.project}'`);
  assert(typeof receipt.branch === 'string' && receipt.branch.length > 0, 'exit-3 test: receipt.branch must be set');
  assert(typeof receipt.timestamp === 'string' && receipt.timestamp.length > 0, 'exit-3 test: receipt.timestamp must be set');
  console.log('exit-3 subprocess test passed');
}

{
  // Task 2 — block 4: success-path subprocess test (OFFLINE=1 only)
  const sinkScript = path.join(__dirname, 'kaola-gitlab-workflow-sink-merge.js');
  const { root, branch } = setupRealRepo('success-test', 'test-success');
  const cwdFile = path.join(root, 'debug-cwd.txt');
  const result = spawnSync(process.execPath, [sinkScript, '--branch', branch, '--project', 'test-success', '--root', root], {
    cwd: root,
    env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_WORKFLOW_DEBUG_CWD: cwdFile },
    encoding: 'utf8'
  });
  assert(result.status === 0, `success-path test: expected exit code 0, got ${result.status}. stderr: ${result.stderr}`);
  // Feature branch should be deleted after successful merge
  const branchList = execFileSync('git', ['branch', '--list', branch], { cwd: root, encoding: 'utf8' });
  assert(branchList.trim() === '', `success-path test: expected feature branch '${branch}' to be deleted, got: '${branchList}'`);
  // DEBUG_CWD file should exist and contain a path
  assert(fs.existsSync(cwdFile), 'success-path test: KAOLA_WORKFLOW_DEBUG_CWD file not written');
  const cwdContents = fs.readFileSync(cwdFile, 'utf8').trim();
  assert(cwdContents.length > 0, 'success-path test: KAOLA_WORKFLOW_DEBUG_CWD file is empty');
  console.log('success-path subprocess test passed');
}

{
  // Regression: post-merge forge issue close/update must run from the repo CWD,
  // not from os.tmpdir() after worktree removal.
  const sinkScript = path.join(__dirname, 'kaola-gitlab-workflow-sink-merge.js');
  const project = 'test-gl-online-close-cwd';
  const { root, branch, remotePath } = setupRealRepoWithBareRemote('online-close-cwd-gl', project);
  const expectedRoot = fs.realpathSync(root);
  const cwdLog = path.join(root, 'glab-cwd.log');
  const mockScript = path.join(root, 'glab-mock.js');
  fs.writeFileSync(mockScript, [
    "const fs = require('fs');",
    "const cp = require('child_process');",
    "const args = process.argv.slice(2);",
    "const joined = args.join(' ');",
    "let top = '';",
    "try { top = cp.execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch (_) { top = 'NOT_A_REPO:' + process.cwd(); }",
    "fs.writeFileSync(" + JSON.stringify(cwdLog) + ", joined + '\\t' + top + '\\n', { flag: 'a' });",
    "if (joined.startsWith('issue close')) process.stdout.write('{\"iid\":168,\"state\":\"closed\"}\\n');",
    "else if (joined.startsWith('issue update')) process.stdout.write('{\"iid\":168,\"state\":\"closed\",\"labels\":[]}\\n');",
    "else if (joined.startsWith('api')) process.stdout.write('{\"id\":9005}\\n');",
    "else process.stdout.write('{}\\n');"
  ].join('\n'));
  try {
    const result = spawnSync(process.execPath, [
      sinkScript,
      '--branch', branch,
      '--project', project,
      '--issue', '168'
    ], {
      cwd: root,
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_GLAB_MOCK_SCRIPT: mockScript },
      encoding: 'utf8'
    });
    assert.strictEqual(result.status, 0, `online close cwd test: expected exit 0, got ${result.status}. stdout: ${result.stdout} stderr: ${result.stderr}`);
    const parsed = JSON.parse(result.stdout.trim().split('\n').filter(Boolean).pop());
    assert.strictEqual(parsed.closure_receipt.remote_issue_closed, 'closed');
    assert.strictEqual(parsed.closure_receipt.claim_label_removed, 'removed');
    const cwdLines = fs.readFileSync(cwdLog, 'utf8').trim().split('\n')
      .filter(line => line.startsWith('issue close') || line.startsWith('issue update'));
    assert(cwdLines.length >= 2, 'online close cwd test: expected close and update calls, got: ' + fs.readFileSync(cwdLog, 'utf8'));
    assert(cwdLines.every(line => line.endsWith('\t' + expectedRoot)),
      'online close cwd test: forge calls must run from repo cwd ' + expectedRoot + ', got: ' + cwdLines.join('\n'));
    console.log('online close cwd regression test passed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(remotePath, { recursive: true, force: true });
  }
}

{
  // Block 5: exit-3 with archived project — no live dir, no receipt written
  const sinkScript = path.join(__dirname, 'kaola-gitlab-workflow-sink-merge.js');
  const { root, branch } = setupRealRepo('exit3-archived-test', 'test-exit3-archived');
  const liveDir = path.join(root, 'kaola-workflow', 'test-exit3-archived');
  const archiveDir = path.join(root, 'kaola-workflow', 'archive', 'test-exit3-archived');
  fs.mkdirSync(path.join(root, 'kaola-workflow', 'archive'), { recursive: true });
  fs.renameSync(liveDir, archiveDir);
  const result = spawnSync(process.execPath, [sinkScript, '--branch', branch, '--project', 'test-exit3-archived'], {
    cwd: root,
    env: { ...process.env, KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE: 'branch_protected', KAOLA_WORKFLOW_OFFLINE: '1' },
    encoding: 'utf8'
  });
  assert(result.status === 3, `exit-3-archived test: expected exit 3, got ${result.status}. stderr: ${result.stderr}`);
  assert(!fs.existsSync(liveDir), 'exit-3-archived test: live dir must not be recreated');
  assert(!fs.existsSync(path.join(liveDir, '.cache', 'sink-fallback.json')), 'exit-3-archived test: receipt must not be at live path');
  assert(!fs.existsSync(path.join(archiveDir, '.cache', 'sink-fallback.json')), 'exit-3-archived test: receipt must not be at archive path');
  assert((result.stderr || '').includes('project archived'), 'exit-3-archived test: stderr must mention project archived');
  console.log('exit-3-archived subprocess test passed');
}

{
  // Offline MR sink: KAOLA_WORKFLOW_OFFLINE=1 records placeholder, commits locally, no forge calls
  const sinkMrScript = path.join(__dirname, 'kaola-gitlab-workflow-sink-mr.js');
  const { root, branch } = setupRealRepo('offline-gl-mr-test', 'test-gl-offline-mr');

  const branchBefore = execFileSync('git', ['branch', '--list', branch], { cwd: root, encoding: 'utf8' });
  assert(branchBefore.trim() !== '', `offline-mr test: branch '${branch}' must exist before test`);

  const result = spawnSync(process.execPath, [
    sinkMrScript,
    '--branch', branch,
    '--project', 'test-gl-offline-mr',
    '--issue', '119'
  ], {
    cwd: root,
    env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' },
    encoding: 'utf8'
  });

  assert(result.status === 0,
    `offline-mr test: expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
  assert((result.stdout || '').includes('MR URL: OFFLINE_PLACEHOLDER'),
    `offline-mr test: stdout must include 'MR URL: OFFLINE_PLACEHOLDER'. got: ${result.stdout}`);
  assert((result.stdout || '').includes('MR IID: 0'),
    `offline-mr test: stdout must include 'MR IID: 0'. got: ${result.stdout}`);

  const stateFile = path.join(root, 'kaola-workflow', 'test-gl-offline-mr', 'workflow-state.md');
  const state = fs.readFileSync(stateFile, 'utf8');
  assert(state.includes('mr_url: OFFLINE_PLACEHOLDER'), `offline-mr test: state must include 'mr_url: OFFLINE_PLACEHOLDER'`);
  assert(state.includes('mr_iid: 0'), `offline-mr test: state must include 'mr_iid: 0'`);

  const summaryFile = path.join(root, 'kaola-workflow', 'test-gl-offline-mr', 'phase6-summary.md');
  const summary = fs.readFileSync(summaryFile, 'utf8');
  assert(summary.includes('MR URL: OFFLINE_PLACEHOLDER'), `offline-mr test: summary must include 'MR URL: OFFLINE_PLACEHOLDER'`);
  assert(summary.includes('MR IID: 0'), `offline-mr test: summary must include 'MR IID: 0'`);

  const log = execFileSync('git', ['log', '--oneline', '-1'], { cwd: root, encoding: 'utf8' }).trim();
  assert(log.includes('chore: record MR metadata for test-gl-offline-mr'),
    `offline-mr test: expected metadata commit in git log, got: ${log}`);

  console.log('offline-mr subprocess test passed');
}

// assertNoLiveWorkflowFolder guard — exits 1 with 'sink-merge refused:'
{
  const sinkScript = path.join(__dirname, 'kaola-gitlab-workflow-sink-merge.js');
  const { root, branch } = setupRepoWithLiveFolderOnBranch('live-folder-gl-test', 'test-gl-live-folder');
  const result = spawnSync(process.execPath, [sinkScript, '--project', 'test-gl-live-folder', '--branch', branch, '--root', root], {
    cwd: root,
    env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' },
    encoding: 'utf8'
  });
  assert(result.status === 1, `live-folder guard test: expected exit 1, got ${result.status}. stderr: ${result.stderr}`);
  assert((result.stderr || '').includes('sink-merge refused:'),
    `live-folder guard test: expected 'sink-merge refused:' in stderr, got: ${result.stderr}`);
  console.log('live-folder guard subprocess test passed');
}

// assertCleanWorktree guard — exits 1 with 'Worktree must be clean'
{
  const sinkScript = path.join(__dirname, 'kaola-gitlab-workflow-sink-merge.js');
  const { root, branch } = setupRealRepo('dirty-worktree-gl-test', 'test-gl-dirty');
  fs.writeFileSync(path.join(root, 'README.md'), 'dirty content');
  const result = spawnSync(process.execPath, [sinkScript, '--project', 'test-gl-dirty', '--branch', branch, '--root', root], {
    cwd: root,
    env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' },
    encoding: 'utf8'
  });
  assert(result.status === 1, `dirty-worktree guard test: expected exit 1, got ${result.status}. stderr: ${result.stderr}`);
  assert((result.stderr || '').includes('Worktree must be clean'),
    `dirty-worktree guard test: expected 'Worktree must be clean' in stderr, got: ${result.stderr}`);
  console.log('dirty-worktree guard subprocess test passed');
}

// maybeAutoMergeFromConfig tests
{
  let forgeArgs = null;
  withForge({ mergeMergeRequest: (...args) => { forgeArgs = args; } }, () => {
    sinkMr.maybeAutoMergeFromConfig({ mr_iid: 1 }, { mr_auto_merge: true });
  });
  assert(forgeArgs !== null, 'auto-merge: mergeMergeRequest called when mr_auto_merge true');
  assert(forgeArgs[0] === 1, 'auto-merge: mrIid arg correct');
  assert(forgeArgs[1].autoMerge === true, 'auto-merge: autoMerge option true');
  assert(forgeArgs[1].squash === true, 'auto-merge: squash option true');
  assert(forgeArgs[1].removeSourceBranch === true, 'auto-merge: removeSourceBranch option true');
  console.log('auto-merge config-true trigger test passed');
}

{
  let mergeCalled = false;
  withForge({ mergeMergeRequest: () => { mergeCalled = true; } }, () => {
    sinkMr.maybeAutoMergeFromConfig({ mr_iid: 1 }, { mr_auto_merge: false });
  });
  assert(mergeCalled === false, 'auto-merge: mergeMergeRequest NOT called when mr_auto_merge false');
  console.log('auto-merge config-false skip test passed');
}

{
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-mrcfg-'));
  const cfgDir = path.join(tmpHome, '.config', 'kaola-workflow');
  fs.mkdirSync(cfgDir, { recursive: true });
  fs.writeFileSync(path.join(cfgDir, 'config.json'), JSON.stringify({ mr_auto_merge: true }));
  const origHome = process.env.HOME;
  process.env.HOME = tmpHome;
  try {
    let forgeArgs = null;
    withForge({ mergeMergeRequest: (...args) => { forgeArgs = args; } }, () => {
      sinkMr.maybeAutoMergeFromConfig({ mr_iid: 1 });
    });
    assert(forgeArgs !== null, 'auto-merge HOME-stub: mergeMergeRequest called via real config file');
    assert(forgeArgs[1].autoMerge === true, 'auto-merge HOME-stub: autoMerge option true');
    assert(forgeArgs[1].squash === true, 'auto-merge HOME-stub: squash option true');
    assert(forgeArgs[1].removeSourceBranch === true, 'auto-merge HOME-stub: removeSourceBranch option true');
    console.log('auto-merge HOME-stub config file test passed');
  } finally {
    process.env.HOME = origHome;
    fs.rmSync(tmpHome, { recursive: true });
  }
}

{
  // finalize --keep-worktree commits archive rename on feature branch (issue #132)
  const mainRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gl-kw-finalize-')));
  const kwRoot = mainRoot + '.kw';
  const wtPath = path.join(kwRoot, 'test-kw-proj');
  const git = (...args) => execFileSync('git', args, { cwd: mainRoot, encoding: 'utf8' });
  try {
    git('init', '-b', 'main');
    git('config', 'user.email', 'test@test.com');
    git('config', 'user.name', 'Test');
    fs.writeFileSync(path.join(mainRoot, 'README.md'), 'init');
    git('add', '.');
    git('commit', '-m', 'init');
    // Create linked worktree with new branch directly (branch must not be checked out in mainRoot first)
    fs.mkdirSync(kwRoot, { recursive: true });
    execFileSync('git', ['worktree', 'add', '-b', 'workflow/test-kw-proj', wtPath, 'main'], { cwd: mainRoot, encoding: 'utf8' });
    // Commit workflow state in linked worktree (simulates worktree-finalize)
    const projDir = path.join(wtPath, 'kaola-workflow', 'test-kw-proj');
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, 'workflow-state.md'), [
      '# Kaola-Workflow State', '', '## Project',
      'name: test-kw-proj', 'status: active', '',
      '## GitLab', 'issue_iid: 1', 'project_id: 77', 'path_with_namespace: group/proj', '',
      '## Sink', 'branch: workflow/test-kw-proj', 'issue_number: 1', 'sink: merge',
      'worktree_path: ' + wtPath, ''
    ].join('\n'));
    execFileSync('git', ['add', 'kaola-workflow/'], { cwd: wtPath, encoding: 'utf8' });
    execFileSync('git', ['commit', '-m', 'chore: finalize test-kw-proj'], { cwd: wtPath, encoding: 'utf8' });
    // Also set up main worktree with the live folder (mirrors cmdWorktreeFinalize copy)
    const mainProjDir = path.join(mainRoot, 'kaola-workflow', 'test-kw-proj');
    fs.mkdirSync(mainProjDir, { recursive: true });
    fs.writeFileSync(path.join(mainProjDir, 'workflow-state.md'), fs.readFileSync(path.join(projDir, 'workflow-state.md'), 'utf8'));
    git('add', 'kaola-workflow/');
    git('commit', '-m', 'mirror: test-kw-proj live folder on main');
    // Run finalize --keep-worktree from linked worktree
    const finResult = spawnSync(process.execPath, [claimScript, 'finalize', '--project', 'test-kw-proj', '--keep-worktree'], {
      cwd: wtPath,
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' },
      encoding: 'utf8'
    });
    assert(finResult.status === 0,
      'finalize --keep-worktree should exit 0\nstdout: ' + finResult.stdout + '\nstderr: ' + finResult.stderr);
    // Feature branch HEAD must have archive path, not live path
    const lsTree = execFileSync('git', ['ls-tree', '--name-only', '-r', 'workflow/test-kw-proj'], { cwd: mainRoot, encoding: 'utf8' });
    assert(!lsTree.includes('kaola-workflow/test-kw-proj/'),
      'feature branch HEAD must not have live folder after finalize --keep-worktree, got:\n' + lsTree);
    assert(lsTree.includes('kaola-workflow/archive/test-kw-proj/'),
      'feature branch HEAD must have archive folder after finalize --keep-worktree, got:\n' + lsTree);
    console.log('finalize --keep-worktree commits archive rename (GitLab): PASSED');
  } finally {
    try { execFileSync('git', ['worktree', 'remove', '--force', wtPath], { cwd: mainRoot, encoding: 'utf8' }); } catch (_) {}
    fs.rmSync(mainRoot, { recursive: true, force: true });
    fs.rmSync(kwRoot, { recursive: true, force: true });
  }
}

// Offline watch-mr: must return {watched:0,offline:true} without calling forge APIs
{
  const result = spawnSync(process.execPath, [claimScript, 'watch-mr'], {
    env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' },
    encoding: 'utf8'
  });
  assert(result.status === 0, 'offline watch-mr should exit 0, got: ' + result.status + '\n' + result.stderr);
  const out = JSON.parse(result.stdout.trim());
  assert(out.watched === 0, 'offline watch-mr: watched must be 0, got: ' + out.watched);
  assert(out.offline === true, 'offline watch-mr: offline must be true, got: ' + out.offline);
  console.log('offline watch-mr returns {watched:0,offline:true}: PASSED');
}

console.log('GitLab sink tests passed');
