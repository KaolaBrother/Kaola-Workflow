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
  // main still has finalization-summary.md committed, so finalValidationPassed() passes.
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
  fs.writeFileSync(path.join(dir, 'finalization-summary.md'), summary || '# Finalization\n\n## Final Validation\n\n- `npm test`: pass\n');
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
  const summary = fs.readFileSync(path.join(root, 'kaola-workflow', 'sink-project', 'finalization-summary.md'), 'utf8');
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
  writeWorkflow(root, 'gate-project', 70, '# Finalization\n\n## Final Validation\n\n- `npm test`: blocked\n');
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
    const summaryFile = path.join(root, 'kaola-workflow', 'gone-project', 'finalization-summary.md');
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
    const summaryFile = path.join(root, 'kaola-workflow', 'live-project', 'finalization-summary.md');
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
  // close-mid-merge FAILURE: mock CLI exits 1 on 'issue close'; process exits 0,
  // receipt.remote_issue_closed==='failed', receipt.claim_label_removed==='removed'.
  const sinkScript = path.join(__dirname, 'kaola-gitlab-workflow-sink-merge.js');
  const project = 'test-gl-close-fail';
  const { root, branch, remotePath } = setupRealRepoWithBareRemote('close-fail-gl', project);
  const mockScript = path.join(root, 'glab-closefail-mock.js');
  fs.writeFileSync(mockScript, [
    "const args = process.argv.slice(2);",
    "const joined = args.join(' ');",
    "if (joined.startsWith('issue close')) process.exit(1);",
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
    assert.strictEqual(result.status, 0, `close-fail test: expected exit 0, got ${result.status}. stdout: ${result.stdout} stderr: ${result.stderr}`);
    assert((result.stderr || '').includes('Manually run: glab issue close 168'),
      `close-fail test: expected WARNING in stderr, got: ${result.stderr}`);
    const parsed = JSON.parse(result.stdout.trim().split('\n').filter(Boolean).pop());
    assert.strictEqual(parsed.closure_receipt.remote_issue_closed, 'failed',
      `close-fail test: expected remote_issue_closed=failed, got: ${parsed.closure_receipt.remote_issue_closed}`);
    assert.strictEqual(parsed.closure_receipt.claim_label_removed, 'removed',
      `close-fail test: expected claim_label_removed=removed, got: ${parsed.closure_receipt.claim_label_removed}`);
    console.log('close-fail warning regression test passed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(remotePath, { recursive: true, force: true });
  }
}

{
  // Block 5: exit-3 with archived project — #394: the fallback receipt is now written to the ARCHIVE
  // .cache (was "no receipt written", which broke the exit-3 fallback chain). The live path stays clean.
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
  assert(fs.existsSync(path.join(archiveDir, '.cache', 'sink-fallback.json')), '#394: exit-3-archived receipt IS written to the archive .cache (durable fallback home)');
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

  const summaryFile = path.join(root, 'kaola-workflow', 'test-gl-offline-mr', 'finalization-summary.md');
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

// #346: a refused sink must NOT destroy the linked worktree's uncommitted work. The old Step 0
// `removeWorktree --force` ran BEFORE the preconditions, so a sink about to refuse first nuked the
// worktree. Provision a linked worktree on the feature branch, dirty a TRACKED file in it, run
// sink-merge → assert refusal + the worktree (and its uncommitted change) still present.
{
  const sinkScript = path.join(__dirname, 'kaola-gitlab-workflow-sink-merge.js');
  const project = 'test-gl-wt-dirty';
  const { root, branch } = setupRealRepo('wt-dirty-gl-test', project);
  const wtPath = path.join(path.dirname(root), path.basename(root) + '-linked-wt');
  execFileSync('git', ['-C', root, 'worktree', 'add', wtPath, branch], { encoding: 'utf8' });
  // Uncommitted change to a TRACKED file (feature.md is committed on the branch); --untracked-files=no
  // ignores untracked/state dirs, so the guard keys on real tracked-file modifications.
  fs.writeFileSync(path.join(wtPath, 'feature.md'), 'precious uncommitted edit');
  const result = spawnSync(process.execPath, [sinkScript, '--project', project, '--branch', branch, '--root', root], {
    cwd: root,
    env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' },
    encoding: 'utf8'
  });
  assert(result.status !== 0, `#346 wt-dirty: expected refusal (nonzero), got ${result.status}. stderr: ${result.stderr}`);
  assert((result.stderr || '').includes('uncommitted changes'),
    `#346 wt-dirty: expected the linked-worktree-dirty refusal, got: ${result.stderr}`);
  assert(fs.existsSync(wtPath) && fs.readFileSync(path.join(wtPath, 'feature.md'), 'utf8') === 'precious uncommitted edit',
    '#346 wt-dirty: a refused sink MUST leave the worktree + its uncommitted change intact (zero destruction)');
  execFileSync('git', ['-C', root, 'worktree', 'remove', '--force', wtPath], { encoding: 'utf8' });
  console.log('#346 worktree-dirty preserves-worktree subprocess test passed');
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

{
  // #300 RED→GREEN: checkDispatchAttestations must be called in postMergeCleanup.
  // Without the call, closure_receipt.claim_planner_attested === 'failed' (emptyReceipt default).
  // After the fix, with no dispatch-log present, it resolves to 'missing' (detector-inactive path).
  const sinkScript = path.join(__dirname, 'kaola-gitlab-workflow-sink-merge.js');
  const { root, branch } = setupRealRepo('attest-test', 'test-gl-attest');
  try {
    const result = spawnSync(process.execPath, [
      sinkScript,
      '--branch', branch,
      '--project', 'test-gl-attest',
      '--issue', '300'
    ], {
      cwd: root,
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' },
      encoding: 'utf8'
    });
    assert.strictEqual(result.status, 0,
      'attestation test: expected exit 0, got ' + result.status + '. stderr: ' + result.stderr);
    const lastLine = result.stdout.trim().split('\n').filter(Boolean).pop();
    const parsed = JSON.parse(lastLine);
    assert.strictEqual(parsed.closure_receipt.claim_planner_attested, 'missing',
      'attestation test: claim_planner_attested must be "missing" (not "failed") — checkDispatchAttestations not called');
    assert.strictEqual(parsed.closure_receipt.finalize_contractor_attested, 'missing',
      'attestation test: finalize_contractor_attested must be "missing" (not "failed") — checkDispatchAttestations not called');
    console.log('attestation fields populated by checkDispatchAttestations: PASSED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// #336: keep-open partial-close — runDirectMerge with keepIssueOpen MUST NOT close the issue.
withForge({
  createIssueNote(project, issueIid, body) {
    assert(body.includes('kept open'), '#336: keep-open note body must mention kept open');
    return { id: 9100 };
  },
  closeIssue() {
    throw new Error('#336: closeIssue must NOT be called on a keep-open runDirectMerge');
  },
  updateIssue() { return null; }
}, () => {
  const root = tempRoot('kw-gl-keepopen-');
  try {
    writeWorkflow(root, 'keepopen-project', 88);
    const result = sinkMerge.runDirectMerge(
      { branch: 'feature-keepopen', project: 'keepopen-project', issue: 88, keepIssueOpen: true },
      { root, skipGit: true }
    );
    assert.strictEqual(result.merged, true, '#336: keep-open runDirectMerge should still merge');
    assert.strictEqual(result.close, null, '#336: keep-open runDirectMerge must not close the issue (close === null)');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// #336: --keep-issue-open requires --issue (typed refusal).
{
  const root = tempRoot('kw-gl-keepopen-noissue-');
  try {
    let err = null;
    try { sinkMerge.runDirectMerge({ branch: 'feature-x', project: 'p', keepIssueOpen: true }, { root, skipGit: true }); }
    catch (e) { err = e; }
    assert.ok(err && /--keep-issue-open requires --issue/.test(err.message),
      '#336: keep-open without --issue must refuse, got: ' + (err && err.message));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// #336: sink-mr keep-open refusal — a live OR archived state carrying issue_action:
// comment_keep_open must make sink-mr refuse (merge-sink-only) before the OFFLINE branch.
{
  const sinkMrScript = path.join(__dirname, 'kaola-gitlab-workflow-sink-mr.js');
  // (a) live state
  const rootA = tempRoot('kw-gl-mr-keepopen-live-');
  try {
    const dir = path.join(rootA, 'kaola-workflow', 'issue-900a');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'workflow-state.md'),
      'status: active\n\n## Sink\nsink: mr\nissue_action: comment_keep_open\n');
    const r = spawnSync(process.execPath, [sinkMrScript, '--project', 'issue-900a', '--branch', 'workflow/issue-900a', '--issue', '900'],
      { cwd: rootA, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
    assert.notStrictEqual(r.status, 0, '#336: sink-mr must refuse a live keep-open project');
    assert.ok(/merge-sink-only/.test(r.stderr), '#336: sink-mr live refusal must say merge-sink-only, got: ' + r.stderr);
  } finally {
    fs.rmSync(rootA, { recursive: true, force: true });
  }
  // (b) archived state (the real exit-3 fallback shape) + regression leg
  const rootB = tempRoot('kw-gl-mr-keepopen-arch-');
  try {
    const adir = path.join(rootB, 'kaola-workflow', 'archive', 'issue-900b');
    fs.mkdirSync(adir, { recursive: true });
    fs.writeFileSync(path.join(adir, 'workflow-state.md'),
      'status: closed\nstep: complete\nissue_number: 900\n\n## Sink\nsink: merge\nissue_action: comment_keep_open\n');
    const r = spawnSync(process.execPath, [sinkMrScript, '--project', 'issue-900b', '--branch', 'workflow/issue-900b', '--issue', '900'],
      { cwd: rootB, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
    assert.notStrictEqual(r.status, 0, '#336: sink-mr must refuse an archived keep-open project');
    assert.ok(/merge-sink-only/.test(r.stderr), '#336: sink-mr archived refusal must say merge-sink-only, got: ' + r.stderr);
    // Regression: a clean project (no field) exits 0 OFFLINE.
    const cleanDir = path.join(rootB, 'kaola-workflow', 'issue-900c');
    fs.mkdirSync(cleanDir, { recursive: true });
    fs.writeFileSync(path.join(cleanDir, 'workflow-state.md'), 'status: active\n\n## Sink\nsink: mr\n');
    const rc = spawnSync(process.execPath, [sinkMrScript, '--project', 'issue-900c', '--branch', 'workflow/issue-900c', '--issue', '900'],
      { cwd: rootB, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
    assert.strictEqual(rc.status, 0, '#336: a non-keep-open sink-mr must still exit 0 OFFLINE, got: ' + rc.stderr);
  } finally {
    fs.rmSync(rootB, { recursive: true, force: true });
  }
}
console.log('GitLab keep-open (#336) tests passed');

// #484: the --sink TRANSACTION freshness guard — forge-port parity for the canonical
// testSinkRefusesStaleReceipt (the forge runSinkTransaction had no --sink-path test). A stale all-`done`
// receipt resumed from the tracked archive/<project>/.cache/ tree must NOT false-resume to status:sinked
// when the branch was never merged; a genuinely-merged branch must still sink (no false-positive).
{
  const sinkScript = path.join(__dirname, 'kaola-gitlab-workflow-sink-merge.js');
  const project = 'issue-9484';
  const branch = 'workflow/issue-9484';
  const staleReceipt = JSON.stringify({
    project, branch, issue_number: 9484, issue_numbers: [9484], resolved_default_branch: 'main',
    started_at: '2026-06-14T12:14:18.462Z', updated_at: '2026-06-14T12:14:28.928Z', stash_ref: null, removed_duplicates: [],
    steps: { preflight: 'done', push_upstream: 'done', merge: 'done', worktree_sync: 'done', finalize: 'done', closure: 'done', stash_restore: 'done', archive_commit: 'done', push_main: 'done' },
  });
  const runSink = (root) => spawnSync(process.execPath, [sinkScript, '--branch', branch, '--issue', '9484', '--project', project, '--sink', '--json'], { cwd: root, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
  const parseLast = (out) => { try { return JSON.parse(String(out || '').trim().split('\n').pop()); } catch (_) { return {}; } };
  const mkRepo = (name) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), name));
    const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });
    git('init', '-b', 'main'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
    fs.writeFileSync(path.join(root, 'base.txt'), 'base'); git('add', '-A'); git('commit', '-m', 'base');
    const ac = path.join(root, 'kaola-workflow', 'archive', project, '.cache'); fs.mkdirSync(ac, { recursive: true });
    fs.writeFileSync(path.join(ac, 'sink-receipt.json'), staleReceipt);
    git('add', '-A'); git('commit', '-m', 'chore: prior-slice receipt');
    git('branch', branch); git('checkout', branch);
    fs.writeFileSync(path.join(root, 'DELIVERABLE.txt'), 'deliverable'); git('add', '-A'); git('commit', '-m', 'feat: deliverable');
    git('checkout', 'main');
    return { root, git };
  };
  // Scenario A (the bug): branch un-merged → must refuse stale_sink_receipt, main unchanged.
  {
    const { root } = mkRepo('kw-gl-stale-A-');
    try {
      const before = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
      const r = runSink(root); const p = parseLast(r.stdout);
      assert.notStrictEqual(p.status, 'sinked', '#484-gitlab-A: stale unmerged receipt must NOT emit status:sinked, got ' + JSON.stringify(p));
      assert.strictEqual(p.reason, 'stale_sink_receipt', '#484-gitlab-A: must refuse stale_sink_receipt, got ' + JSON.stringify(p));
      assert.notStrictEqual(r.status, 0, '#484-gitlab-A: refusal must exit non-zero');
      assert.strictEqual(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), before, '#484-gitlab-A: main must NOT advance');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  // Scenario B (no false-positive): branch genuinely merged → stale all-done receipt still sinks.
  {
    const { root, git } = mkRepo('kw-gl-stale-B-');
    try {
      git('merge', '--ff-only', branch);
      const r = runSink(root); const p = parseLast(r.stdout);
      assert.ok(!(p.result === 'refuse' && p.reason === 'stale_sink_receipt'), '#484-gitlab-B: a genuinely-merged branch must NOT be false-refused, got ' + JSON.stringify(p));
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
}
console.log('GitLab #484 stale-sink-receipt guard tests passed');

// #496/#497 forge-port parity: (#496) assertWorktreeClean fails CLOSED on a transient git-status
// probe fault; (#497) the --sink transaction does NOT report status:sinked when push_main hard-fails.
{
  const sinkScript = path.join(__dirname, 'kaola-gitlab-workflow-sink-merge.js');
  const parseLast = (out) => { try { return JSON.parse(String(out || '').trim().split('\n').pop()); } catch (_) { return {}; } };
  // The forge runDirectMerge requires finalValidationPassed; provision it in the ARCHIVE folder
  // (untracked on main) so the LIVE-folder guard (which keys on a COMMITTED workflow-state.md on the
  // branch tip) does not fire while validation still passes.
  const seedArchiveFinalization = (root, project) => {
    const dir = path.join(root, 'kaola-workflow', 'archive', project);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'finalization-summary.md'), '# Finalization\n\n## Final Validation\n\n- `npm test`: pass\n');
  };

  // #496: probe fault → fail closed (refuse, worktree intact, main unchanged). Uses the non-`--sink`
  // (runDirectMerge) path, where assertWorktreeClean is the data-loss guard.
  {
    const { root, branch } = setupRealRepo('kw-gl-wt-probe', 'gl-wt-probe-9496');
    const project = 'gl-wt-probe-9496';
    const wt = path.join(path.dirname(root), path.basename(root) + '-linked-wt');
    try {
      seedArchiveFinalization(root, project);
      execFileSync('git', ['-C', root, 'worktree', 'add', wt, branch], { encoding: 'utf8' });
      const before = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
      const r = spawnSync(process.execPath, [sinkScript, '--project', project, '--branch', branch, '--root', root], { cwd: root, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_WORKFLOW_FORCE_WT_STATUS_FAIL: '1' }, encoding: 'utf8' });
      assert.notStrictEqual(r.status, 0, '#496-gitlab: an unprovable worktree-clean probe must refuse (fail closed), got status ' + r.status + '\nstderr: ' + r.stderr);
      assert.ok(/(could not|cannot) (be )?verif|unprovable/i.test(r.stderr || ''), '#496-gitlab: refusal must name the unverifiable-clean cause, got: ' + r.stderr);
      assert.ok(fs.existsSync(wt), '#496-gitlab: a probe-fault refusal must NOT remove the worktree');
      assert.strictEqual(execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), before, '#496-gitlab: main must NOT advance on a probe-fault refusal');
    } finally {
      try { execFileSync('git', ['-C', root, 'worktree', 'remove', '--force', wt], { encoding: 'utf8' }); } catch (_) {}
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  // #497: hard push_main failure → NOT status:sinked, push_main not done, refusal surfaces the cause.
  // Uses the `--sink` (runSinkTransaction) path. The repo carries NO untracked live folder (which the
  // sink preflight would classify as foreign-dirt) — only a committed base + a feature branch + a
  // bare remote, mirroring the #484 forge mkRepo.
  {
    const project = 'gl-pushfail-9497';
    const branch = 'workflow/' + project;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-pushfail-'));
    const remote = root + '-remote';
    try {
      const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });
      git('init', '-b', 'main'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
      fs.writeFileSync(path.join(root, 'base.txt'), 'base'); git('add', '-A'); git('commit', '-m', 'base');
      execFileSync('git', ['init', '--bare', remote], { encoding: 'utf8' });
      git('remote', 'add', 'origin', remote); git('push', '-u', 'origin', 'main');
      git('branch', branch); git('checkout', branch);
      fs.writeFileSync(path.join(root, 'DELIVERABLE.txt'), 'deliverable'); git('add', '-A'); git('commit', '-m', 'feat: deliverable');
      git('push', '-u', 'origin', branch); git('checkout', 'main');
      const r = spawnSync(process.execPath, [sinkScript, '--branch', branch, '--project', project, '--sink', '--json'], { cwd: root, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_WORKFLOW_FORCE_PUSH_MAIN_FAIL: '1' }, encoding: 'utf8' });
      const p = parseLast(r.stdout);
      assert.notStrictEqual(p.status, 'sinked', '#497-gitlab: a hard push_main failure must NOT report status:sinked, got ' + JSON.stringify(p) + '\nstderr: ' + r.stderr);
      assert.notStrictEqual(r.status, 0, '#497-gitlab: a hard push_main failure must exit non-zero');
      assert.strictEqual(p.result, 'refuse', '#497-gitlab: a hard push_main failure must emit result:refuse, got ' + JSON.stringify(p));
      const rp = [path.join(root, 'kaola-workflow', 'archive', project, '.cache', 'sink-receipt.json'), path.join(root, 'kaola-workflow', project, '.cache', 'sink-receipt.json')].find(x => fs.existsSync(x));
      assert.ok(rp, '#497-gitlab: a sink-receipt must exist after the failed transaction');
      const receipt = JSON.parse(fs.readFileSync(rp, 'utf8'));
      assert.notStrictEqual(receipt.steps.push_main, 'done', '#497-gitlab: push_main must NOT be marked done after a hard push failure');
    } finally {
      fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      fs.rmSync(remote, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }

  // #497 (closure arm): a HARD issue-CLOSE failure on the `--sink` path must NOT report status:sinked.
  // The glab mock fails `issue close` (exit 1) and reports the issue still `opened` on `issue view` so
  // probeIssueClosed returns false (genuine failure, not already-closed). The refuse returns BEFORE
  // push_main → closure not done, push_main still pending.
  {
    const project = 'gl-closefail-9498';
    const branch = 'workflow/' + project;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-closefail-'));
    const remote = root + '-remote';
    const mockScript = root + '-glab-mock.js';
    fs.writeFileSync(mockScript, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.startsWith('issue view')) { process.stdout.write('{\"iid\":9498,\"state\":\"opened\",\"labels\":[]}\\n'); process.exit(0); }",
      "if (a.startsWith('issue close')) { process.stderr.write('mock: close failed\\n'); process.exit(1); }",
      "if (a.startsWith('issue update')) { process.stdout.write('{\"iid\":9498,\"state\":\"opened\",\"labels\":[]}\\n'); process.exit(0); }",
      "if (a.startsWith('api')) { process.stdout.write('{\"id\":1}\\n'); process.exit(0); }",
      "process.stdout.write('{}\\n'); process.exit(0);",
    ].join('\n'));
    try {
      const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });
      git('init', '-b', 'main'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
      fs.writeFileSync(path.join(root, 'base.txt'), 'base'); git('add', '-A'); git('commit', '-m', 'base');
      execFileSync('git', ['init', '--bare', remote], { encoding: 'utf8' });
      git('remote', 'add', 'origin', remote); git('push', '-u', 'origin', 'main');
      git('branch', branch); git('checkout', branch);
      fs.writeFileSync(path.join(root, 'DELIVERABLE.txt'), 'deliverable'); git('add', '-A'); git('commit', '-m', 'feat: deliverable');
      git('push', '-u', 'origin', branch); git('checkout', 'main');
      const r = spawnSync(process.execPath, [sinkScript, '--branch', branch, '--project', project, '--issue', '9498', '--sink', '--json'], { cwd: root, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_GLAB_MOCK_SCRIPT: mockScript }, encoding: 'utf8' });
      const p = parseLast(r.stdout);
      assert.notStrictEqual(p.status, 'sinked', '#497-close-gitlab: a hard close failure must NOT report status:sinked, got ' + JSON.stringify(p) + '\nstderr: ' + r.stderr);
      assert.notStrictEqual(r.status, 0, '#497-close-gitlab: a hard close failure must exit non-zero');
      assert.ok(p.result === 'refuse' && p.step === 'closure', '#497-close-gitlab: must emit result:refuse step:closure, got ' + JSON.stringify(p));
      assert.ok(Array.isArray(p.failed_issue_closures) && p.failed_issue_closures.includes(9498), '#497-close-gitlab: must surface the failed closure (9498), got ' + JSON.stringify(p));
      const rp = [path.join(root, 'kaola-workflow', 'archive', project, '.cache', 'sink-receipt.json'), path.join(root, 'kaola-workflow', project, '.cache', 'sink-receipt.json')].find(x => fs.existsSync(x));
      assert.ok(rp, '#497-close-gitlab: a sink-receipt must exist after the failed transaction');
      const receipt = JSON.parse(fs.readFileSync(rp, 'utf8'));
      assert.notStrictEqual(receipt.steps.closure, 'done', '#497-close-gitlab: closure must NOT be marked done after a hard close failure');
      assert.strictEqual(receipt.steps.push_main, 'pending', '#497-close-gitlab: push_main must still be pending (closure refuse returns before it)');
    } finally {
      fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      fs.rmSync(remote, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      try { fs.rmSync(mockScript, { force: true }); } catch (_) {}
    }
  }
}
console.log('GitLab #496/#497 fail-closed sink guard tests passed');

console.log('GitLab sink tests passed');
