#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const claimScript = path.join(__dirname, 'kaola-gitea-workflow-claim.js');

// OFFLINE is captured by sink modules at require time. Keep in-process forge
// stubs online; subprocess cases that exercise offline mode set their own env.
delete process.env.KAOLA_WORKFLOW_OFFLINE;

const forge = require('./kaola-gitea-forge');
const sinkPr = require('./kaola-gitea-workflow-sink-pr');
const sinkMerge = require('./kaola-gitea-workflow-sink-merge');

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

function writeWorkflow(root, project, issuePrNum, summary) {
  const dir = path.join(root, 'kaola-workflow', project);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'workflow-state.md'), [
    '# Kaola-Workflow State',
    '',
    '## Project',
    'name: ' + project,
    'status: active',
    '',
    '## Sink',
    'branch: workflow/gitea-issue-' + issuePrNum,
    'issue_number: ' + issuePrNum,
    'full_name: group/project',
    'project_html_url: https://gitea.example/group/project',
    'sink: merge',
    ''
  ].join('\n'));
  fs.writeFileSync(path.join(dir, 'phase6-summary.md'), summary || '# Phase 6\n\n## Final Validation\n\n- `npm test`: pass\n');
  return dir;
}

// Test 1: PR reuse (existing PR found)
withForge({
  listPullRequests() {
    return [{
      pr_number: 8,
      pr_url: 'https://gitea.example/group/project/pulls/8',
      state: 'open',
      source_branch: 'feature'
    }];
  },
  createPullRequest() {
    throw new Error('existing PR should be reused');
  },
  discoverProject() {
    return { full_name: 'group/project', html_url: 'https://gitea.example/group/project', owner: 'group', name: 'project' };
  }
}, () => {
  const root = tempRoot('kw-gt-pr-reuse-');
  writeWorkflow(root, 'sink-project', 68);
  const calls = [];
  const { pr, project } = sinkPr.ensurePullRequest({
    branch: 'feature',
    project: 'sink-project',
    issue: 68
  }, {
    root,
    gitExec(bin, args) { calls.push([bin, args]); return ''; }
  });
  assert.strictEqual(pr.pr_number, 8);
  assert.strictEqual(project.full_name, 'group/project');
  assert.deepStrictEqual(calls[0], ['git', ['push', 'origin', 'feature']]);
  const state = fs.readFileSync(path.join(root, 'kaola-workflow', 'sink-project', 'workflow-state.md'), 'utf8');
  assert(state.includes('sink: pr'));
  assert(state.includes('pr_url: https://gitea.example/group/project/pulls/8'));
  assert(state.includes('pr_number: 8'));
  assert(state.includes('full_name: group/project'));
  const summary = fs.readFileSync(path.join(root, 'kaola-workflow', 'sink-project', 'phase6-summary.md'), 'utf8');
  assert(summary.includes('PR URL: https://gitea.example/group/project/pulls/8'));
  assert(summary.includes('PR Number: 8'));
});

// Test 2: PR creation (no existing)
withForge({
  listPullRequests() { return []; },
  createPullRequest(opts) {
    assert.strictEqual(opts.sourceBranch, 'feature-new');
    assert.strictEqual(opts.targetBranch, 'main');
    assert.strictEqual(opts.description, 'Closes #69');
    return {
      pr_number: 9,
      pr_url: 'https://gitea.example/group/project/pulls/9',
      state: 'open',
      source_branch: 'feature-new'
    };
  },
  discoverProject() {
    return { full_name: 'group/project', html_url: 'https://gitea.example/group/project', owner: 'group', name: 'project' };
  }
}, () => {
  const root = tempRoot('kw-gt-pr-create-');
  writeWorkflow(root, 'new-project', 69);
  const { pr } = sinkPr.ensurePullRequest({
    branch: 'feature-new',
    project: 'new-project',
    issue: 69
  }, {
    root,
    skipPush: true
  });
  assert.strictEqual(pr.pr_number, 9);
});

// Test 3: mergePullRequest opts verification
withForge({
  mergePullRequest(project, prNumber, opts) {
    assert.strictEqual(project.full_name, 'group/project');
    assert.strictEqual(prNumber, 10);
    assert.strictEqual(opts.autoMerge, true);
    assert.strictEqual(opts.squash, true);
    assert.strictEqual(opts.removeSourceBranch, true);
    assert.strictEqual(opts.sha, 'abc123');
    return {};
  }
}, () => {
  const project = { full_name: 'group/project', html_url: 'https://gitea.example/group/project' };
  const pr = { pr_number: 10 };
  sinkPr.mergePullRequest(pr, project, {
    autoMerge: true,
    squash: true,
    removeSourceBranch: true,
    sha: 'abc123'
  });
});

// Test 4: routePullRequestState
assert.strictEqual(sinkPr.routePullRequestState({ state: 'open' }), 'open');
assert.strictEqual(sinkPr.routePullRequestState({ state: 'closed' }), 'closed');
assert.strictEqual(sinkPr.routePullRequestState({ state: 'merged' }), 'merged');

// Test 5: closeLinkedIssue gate (final validation must pass)
{
  const root = tempRoot('kw-gt-merge-gate-');
  writeWorkflow(root, 'gate-project', 70, '# Phase 6\n\n## Final Validation\n\n- `npm test`: blocked\n');
  assert.throws(() => sinkMerge.closeLinkedIssue(root, 'gate-project', 70), /Final validation evidence/);
}

// Test 6: runDirectMerge skipGit → close issue (returns {merged:true, close:{comment_id}})
let updateIssueLabelsCalled = null;
withForge({
  createIssueComment(project, issueNum, body) {
    assert.strictEqual(project.full_name, 'group/project');
    assert.strictEqual(issueNum, 71);
    assert(body.includes('final validation passed'));
    return { id: 9001 };
  },
  closeIssue(issueIid) {
    assert.strictEqual(issueIid, 71);
    return { number: 71, state: 'closed' };
  },
  updateIssueLabels(project, issueNum, opts) {
    updateIssueLabelsCalled = { project, issueNum, opts };
    return {};
  }
}, () => {
  const root = tempRoot('kw-gt-merge-close-');
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
  assert.strictEqual(result.close.comment_id, 9001);
  assert.ok(updateIssueLabelsCalled, 'forge.updateIssueLabels should have been called');
  assert.strictEqual(updateIssueLabelsCalled.issueNum, 71);
  assert.ok(
    Array.isArray(updateIssueLabelsCalled.opts.remove) &&
    updateIssueLabelsCalled.opts.remove.includes(forge.CLAIM_LABEL),
    'updateIssueLabels opts.remove must include forge.CLAIM_LABEL'
  );
});

// Test 7: finalValidationPassed reads from archive fallback
{
  const root = tempRoot('kw-gt-fvp-archived-');
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

// Test 8: runDirectMerge succeeds after archive
withForge({
  createIssueComment(project, issueNum, body) { return { id: 9002 }; },
  closeIssue() { return { number: 99, state: 'closed' }; }
}, () => {
  const root = tempRoot('kw-gt-rdm-archived-');
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

// Test 9: missing full_name → discoverProject fallback
withForge({
  discoverProject() {
    return { full_name: 'group/project', html_url: 'https://gitea.example/group/project', owner: 'group', name: 'project' };
  },
  createIssueComment(project, issueNum, body) {
    assert.strictEqual(project.full_name, 'group/project');
    return { id: 9003 };
  },
  closeIssue() { return { number: 100, state: 'closed' }; }
}, () => {
  const root = tempRoot('kw-gt-fallback-');
  const dir = path.join(root, 'kaola-workflow', 'fallback-proj');
  fs.mkdirSync(dir, { recursive: true });
  // Intentionally no full_name in state
  fs.writeFileSync(path.join(dir, 'workflow-state.md'), [
    '## Sink',
    'branch: workflow/fallback-proj',
    'issue_number: 100',
    'sink: merge',
    ''
  ].join('\n'));
  fs.writeFileSync(path.join(dir, 'phase6-summary.md'), '# Phase 6\n\n## Final Validation\n\n- `npm test`: pass\n');
  const result = sinkMerge.runDirectMerge(
    { branch: 'workflow/fallback-proj', project: 'fallback-proj', issue: 100 },
    { root, skipGit: true }
  );
  assert.strictEqual(result.merged, true);
  assert.strictEqual(result.close.comment_id, 9003);
  console.log('missing full_name discoverProject fallback test passed');
});

// Test 10: full_name present → no discoverProject call
withForge({
  discoverProject() {
    throw new Error('discoverProject should not be called when full_name is present');
  },
  createIssueComment(project, issueNum, body) {
    assert.strictEqual(project.full_name, 'group/project');
    return { id: 9004 };
  },
  closeIssue() { return { number: 101, state: 'closed' }; }
}, () => {
  const root = tempRoot('kw-gt-fullname-');
  writeWorkflow(root, 'fullname-proj', 101);
  const result = sinkMerge.runDirectMerge(
    { branch: 'workflow/gitea-issue-101', project: 'fullname-proj', issue: 101 },
    { root, skipGit: true }
  );
  assert.strictEqual(result.merged, true);
  console.log('full_name present no discoverProject test passed');
});

// Test 11: appendSummary returns false when parent dir missing
{
  const root = tempRoot('kw-gt-appsum-archived-');
  try {
    const summaryFile = path.join(root, 'kaola-workflow', 'gone-project', 'phase6-summary.md');
    const result = sinkPr.appendSummary(summaryFile, 'https://example/pr/1', 1);
    assert.strictEqual(result, false, 'appendSummary should return false when parent dir missing');
    assert(!fs.existsSync(path.dirname(summaryFile)), 'appendSummary must not create the parent directory');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Test 12: appendSummary returns true and writes file when dir exists
{
  const root = tempRoot('kw-gt-appsum-live-');
  try {
    fs.mkdirSync(path.join(root, 'kaola-workflow', 'live-project'), { recursive: true });
    const summaryFile = path.join(root, 'kaola-workflow', 'live-project', 'phase6-summary.md');
    const result = sinkPr.appendSummary(summaryFile, 'https://example/pr/2', 2);
    assert.strictEqual(result, true, 'appendSummary should return true when dir exists');
    const content = fs.readFileSync(summaryFile, 'utf8');
    assert(content.includes('PR URL: https://example/pr/2'), 'should write PR URL');
    assert(content.includes('PR Number: 2'), 'should write PR Number');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// NOTE: Sink-fallback subprocess tests (those spawning the claim script) are NOT ported —
// kaola-gitea-workflow-claim.js doesn't exist yet (issue #113).

// Test 13: branch name leading-hyphen rejection (sink-merge)
{
  let err;
  try { sinkMerge.runDirectMerge({ branch: '--orphan', project: 'test' }); } catch (e) { err = e; }
  assert(err && /--branch is invalid or TBD/.test(err.message),
    'runDirectMerge should reject branch names starting with - (got: ' + (err && err.message) + ')');
  console.log('branch name security validation test passed');
}

// Test 14: classifyMergeError unit tests
{
  let classify;
  try { classify = sinkMerge.classifyMergeError; } catch (_) {}
  if (!classify) classify = () => null;

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
  assert_cls('not allowed to merge this PR', 'permission_denied', 'not allowed to merge');
  const nullErr = new Error('some random unclassified error');
  assert(classify(nullErr) === null, 'classifyMergeError: expected null for unclassified error');

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

const sinkScript = path.join(__dirname, 'kaola-gitea-workflow-sink-merge.js');

// Test 15: exit-2: FORCE_FF_FAIL=3
{
  const { root, branch } = setupRealRepo('exit2-gt-test', 'test-gt-exit2');
  const result = spawnSync(process.execPath, [sinkScript, '--branch', branch, '--project', 'test-gt-exit2'], {
    cwd: root,
    env: { ...process.env, KAOLA_WORKFLOW_FORCE_FF_FAIL: '3', KAOLA_WORKFLOW_OFFLINE: '1' },
    encoding: 'utf8'
  });
  assert(result.status === 2, `exit-2 test: expected exit code 2, got ${result.status}. stderr: ${result.stderr}`);
  console.log('exit-2 subprocess test passed');
}

// Test 16: exit-3: FORCE_MERGE_IMPOSSIBLE
{
  const { root, branch } = setupRealRepo('exit3-gt-test', 'test-gt-exit3');
  const result = spawnSync(process.execPath, [sinkScript, '--branch', branch, '--project', 'test-gt-exit3'], {
    cwd: root,
    env: { ...process.env, KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE: 'branch_protected', KAOLA_WORKFLOW_OFFLINE: '1' },
    encoding: 'utf8'
  });
  assert(result.status === 3, `exit-3 test: expected exit code 3, got ${result.status}. stderr: ${result.stderr}`);
  const receiptPath = path.join(root, 'kaola-workflow', 'test-gt-exit3', '.cache', 'sink-fallback.json');
  assert(fs.existsSync(receiptPath), 'exit-3 test: sink-fallback.json receipt not found');
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  assert(receipt.reason === 'branch_protected', `exit-3 test: receipt.reason expected 'branch_protected', got '${receipt.reason}'`);
  assert(receipt.project === 'test-gt-exit3', `exit-3 test: receipt.project must match`);
  assert(typeof receipt.branch === 'string' && receipt.branch.length > 0, 'exit-3 test: receipt.branch must be set');
  assert(typeof receipt.timestamp === 'string' && receipt.timestamp.length > 0, 'exit-3 test: receipt.timestamp must be set');
  console.log('exit-3 subprocess test passed');
}

// Test 17: success-path: OFFLINE=1
{
  const { root, branch } = setupRealRepo('success-gt-test', 'test-gt-success');
  const cwdFile = path.join(root, 'debug-cwd.txt');
  const result = spawnSync(process.execPath, [sinkScript, '--branch', branch, '--project', 'test-gt-success'], {
    cwd: root,
    env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_WORKFLOW_DEBUG_CWD: cwdFile },
    encoding: 'utf8'
  });
  assert(result.status === 0, `success-path test: expected exit code 0, got ${result.status}. stderr: ${result.stderr}`);
  const branchList = execFileSync('git', ['branch', '--list', branch], { cwd: root, encoding: 'utf8' });
  assert(branchList.trim() === '', `success-path test: expected feature branch '${branch}' to be deleted`);
  assert(fs.existsSync(cwdFile), 'success-path test: KAOLA_WORKFLOW_DEBUG_CWD file not written');
  const cwdContents = fs.readFileSync(cwdFile, 'utf8').trim();
  assert(cwdContents.length > 0, 'success-path test: KAOLA_WORKFLOW_DEBUG_CWD file is empty');
  console.log('success-path subprocess test passed');
}

// Test 17b: online close/update forge calls run from repo cwd after worktree removal
{
  const project = 'test-gt-online-close-cwd';
  const { root, branch, remotePath } = setupRealRepoWithBareRemote('online-close-cwd-gt', project);
  const expectedRoot = fs.realpathSync(root);
  const cwdLog = path.join(root, 'tea-cwd.log');
  const mockScript = path.join(root, 'tea-mock.js');
  fs.writeFileSync(mockScript, [
    "const fs = require('fs');",
    "const cp = require('child_process');",
    "const args = process.argv.slice(2);",
    "const joined = args.join(' ');",
    "let top = '';",
    "try { top = cp.execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch (_) { top = 'NOT_A_REPO:' + process.cwd(); }",
    "fs.writeFileSync(" + JSON.stringify(cwdLog) + ", joined + '\\t' + top + '\\n', { flag: 'a' });",
    "if (joined.startsWith('issues close')) process.stdout.write('{\"number\":168,\"state\":\"closed\"}\\n');",
    "else if (joined.startsWith('issues edit')) process.stdout.write('{\"number\":168,\"state\":\"closed\",\"labels\":[]}\\n');",
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
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_TEA_MOCK_SCRIPT: mockScript },
      encoding: 'utf8'
    });
    assert.strictEqual(result.status, 0, `online close cwd test: expected exit 0, got ${result.status}. stdout: ${result.stdout} stderr: ${result.stderr}`);
    const parsed = JSON.parse(result.stdout.trim().split('\n').filter(Boolean).pop());
    assert.strictEqual(parsed.closure_receipt.remote_issue_closed, 'closed');
    assert.strictEqual(parsed.closure_receipt.claim_label_removed, 'removed');
    const cwdLines = fs.readFileSync(cwdLog, 'utf8').trim().split('\n')
      .filter(line => line.startsWith('issues close') || line.startsWith('issues edit'));
    assert(cwdLines.length >= 2, 'online close cwd test: expected close and edit calls, got: ' + fs.readFileSync(cwdLog, 'utf8'));
    assert(cwdLines.every(line => line.endsWith('\t' + expectedRoot)),
      'online close cwd test: forge calls must run from repo cwd ' + expectedRoot + ', got: ' + cwdLines.join('\n'));
    console.log('online close cwd regression test passed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(remotePath, { recursive: true, force: true });
  }
}

// Test 17c: close-mid-merge FAILURE: mock CLI exits 1 on 'issues close'; process exits 0,
// receipt.remote_issue_closed==='failed', receipt.claim_label_removed==='removed'.
{
  const project = 'test-gt-close-fail';
  const { root, branch, remotePath } = setupRealRepoWithBareRemote('close-fail-gt', project);
  const mockScript = path.join(root, 'tea-closefail-mock.js');
  fs.writeFileSync(mockScript, [
    "const args = process.argv.slice(2);",
    "const joined = args.join(' ');",
    "if (joined.startsWith('issues close')) process.exit(1);",
    "else if (joined.startsWith('issues edit')) process.stdout.write('{\"number\":168,\"state\":\"closed\",\"labels\":[]}\\n');",
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
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_TEA_MOCK_SCRIPT: mockScript },
      encoding: 'utf8'
    });
    assert.strictEqual(result.status, 0, `close-fail test: expected exit 0, got ${result.status}. stdout: ${result.stdout} stderr: ${result.stderr}`);
    assert((result.stderr || '').includes('Manually run: tea issues close 168'),
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

// Test 18: exit-3-archived: no live dir, no receipt written
{
  const { root, branch } = setupRealRepo('exit3-gt-archived-test', 'test-gt-exit3-archived');
  const liveDir = path.join(root, 'kaola-workflow', 'test-gt-exit3-archived');
  const archiveDir = path.join(root, 'kaola-workflow', 'archive', 'test-gt-exit3-archived');
  fs.mkdirSync(path.join(root, 'kaola-workflow', 'archive'), { recursive: true });
  fs.renameSync(liveDir, archiveDir);
  const result = spawnSync(process.execPath, [sinkScript, '--branch', branch, '--project', 'test-gt-exit3-archived'], {
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

// Test 19: OFFLINE=1 — sink-pr records placeholder, commits locally, no forge calls
{
  const sinkPrScript = path.join(__dirname, 'kaola-gitea-workflow-sink-pr.js');
  const { root, branch } = setupRealRepo('offline-gt-pr-test', 'test-gt-offline-pr');

  const branchBefore = execFileSync('git', ['branch', '--list', branch], { cwd: root, encoding: 'utf8' });
  assert(branchBefore.trim() !== '', `offline-pr test: branch '${branch}' must exist before test`);

  const result = spawnSync(process.execPath, [
    sinkPrScript,
    '--branch', branch,
    '--project', 'test-gt-offline-pr',
    '--issue', '119'
  ], {
    cwd: root,
    env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' },
    encoding: 'utf8'
  });

  assert(result.status === 0,
    `offline-pr test: expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
  assert((result.stdout || '').includes('PR URL: OFFLINE_PLACEHOLDER'),
    `offline-pr test: stdout must include 'PR URL: OFFLINE_PLACEHOLDER'. got: ${result.stdout}`);
  assert((result.stdout || '').includes('PR Number: 0'),
    `offline-pr test: stdout must include 'PR Number: 0'. got: ${result.stdout}`);

  const stateFile = path.join(root, 'kaola-workflow', 'test-gt-offline-pr', 'workflow-state.md');
  const state = fs.readFileSync(stateFile, 'utf8');
  assert(state.includes('pr_url: OFFLINE_PLACEHOLDER'), `offline-pr test: state must include 'pr_url: OFFLINE_PLACEHOLDER'`);
  assert(state.includes('pr_number: 0'), `offline-pr test: state must include 'pr_number: 0'`);
  assert(state.includes('full_name: OFFLINE_PLACEHOLDER'), `offline-pr test: state must include 'full_name: OFFLINE_PLACEHOLDER'`);
  assert(state.includes('project_html_url: OFFLINE_PLACEHOLDER'), `offline-pr test: state must include 'project_html_url: OFFLINE_PLACEHOLDER'`);

  const summaryFile = path.join(root, 'kaola-workflow', 'test-gt-offline-pr', 'phase6-summary.md');
  const summary = fs.readFileSync(summaryFile, 'utf8');
  assert(summary.includes('PR URL: OFFLINE_PLACEHOLDER'), `offline-pr test: summary must include 'PR URL: OFFLINE_PLACEHOLDER'`);
  assert(summary.includes('PR Number: 0'), `offline-pr test: summary must include 'PR Number: 0'`);

  const log = execFileSync('git', ['log', '--oneline', '-1'], { cwd: root, encoding: 'utf8' }).trim();
  assert(log.includes('chore: record PR metadata for test-gt-offline-pr'),
    `offline-pr test: expected metadata commit in git log, got: ${log}`);

  console.log('offline-pr subprocess test passed');
}

// Test 20: assertNoLiveWorkflowFolder guard — exits 1 with 'sink-merge refused:'
{
  const sinkScript = path.join(__dirname, 'kaola-gitea-workflow-sink-merge.js');
  const { root, branch } = setupRepoWithLiveFolderOnBranch('live-folder-gt-test', 'test-gt-live-folder');
  const result = spawnSync(process.execPath, [sinkScript, '--project', 'test-gt-live-folder', '--branch', branch], {
    cwd: root,
    env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' },
    encoding: 'utf8'
  });
  assert(result.status === 1, `live-folder guard test: expected exit 1, got ${result.status}. stderr: ${result.stderr}`);
  assert((result.stderr || '').includes('sink-merge refused:'),
    `live-folder guard test: expected 'sink-merge refused:' in stderr, got: ${result.stderr}`);
  console.log('live-folder guard subprocess test passed');
}

// Test 21: assertCleanWorktree guard — exits 1 with 'Worktree must be clean'
{
  const sinkScript = path.join(__dirname, 'kaola-gitea-workflow-sink-merge.js');
  const { root, branch } = setupRealRepo('dirty-worktree-gt-test', 'test-gt-dirty');
  fs.writeFileSync(path.join(root, 'README.md'), 'dirty content');
  const result = spawnSync(process.execPath, [sinkScript, '--project', 'test-gt-dirty', '--branch', branch], {
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
  withForge({ mergePullRequest: (...args) => { forgeArgs = args; } }, () => {
    sinkPr.maybeAutoMergeFromConfig({ pr_number: 1 }, 'group/project', { pr_auto_merge: true });
  });
  assert(forgeArgs !== null, 'auto-merge: mergePullRequest called when pr_auto_merge true');
  assert(forgeArgs[0] === 'group/project', 'auto-merge: project arg correct');
  assert(forgeArgs[1] === 1, 'auto-merge: prNumber arg correct');
  assert(forgeArgs[2].autoMerge === true, 'auto-merge: autoMerge option true');
  assert(forgeArgs[2].squash === true, 'auto-merge: squash option true');
  assert(forgeArgs[2].removeSourceBranch === true, 'auto-merge: removeSourceBranch option true');
  console.log('auto-merge config-true trigger test passed');
}

{
  let mergeCalled = false;
  withForge({ mergePullRequest: () => { mergeCalled = true; } }, () => {
    sinkPr.maybeAutoMergeFromConfig({ pr_number: 1 }, 'group/project', { pr_auto_merge: false });
  });
  assert(mergeCalled === false, 'auto-merge: mergePullRequest NOT called when pr_auto_merge false');
  console.log('auto-merge config-false skip test passed');
}

{
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-cfg-'));
  const cfgDir = path.join(tmpHome, '.config', 'kaola-workflow');
  fs.mkdirSync(cfgDir, { recursive: true });
  fs.writeFileSync(path.join(cfgDir, 'config.json'), JSON.stringify({ pr_auto_merge: true }));
  const origHome = process.env.HOME;
  process.env.HOME = tmpHome;
  try {
    let forgeArgs = null;
    withForge({ mergePullRequest: (...args) => { forgeArgs = args; } }, () => {
      sinkPr.maybeAutoMergeFromConfig({ pr_number: 1 }, 'group/project');
    });
    assert(forgeArgs !== null, 'auto-merge HOME-stub: mergePullRequest called via real config file');
    assert(forgeArgs[2].autoMerge === true, 'auto-merge HOME-stub: autoMerge option true');
    assert(forgeArgs[2].squash === true, 'auto-merge HOME-stub: squash option true');
    assert(forgeArgs[2].removeSourceBranch === true, 'auto-merge HOME-stub: removeSourceBranch option true');
    console.log('auto-merge HOME-stub config file test passed');
  } finally {
    process.env.HOME = origHome;
    fs.rmSync(tmpHome, { recursive: true });
  }
}

{
  // finalize --keep-worktree commits archive rename on feature branch (issue #132)
  const mainRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gt-kw-finalize-')));
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
      '## Gitea', 'issue_iid: 1', 'full_name: group/proj', 'project_html_url: https://gitea.example/group/proj', '',
      '## Sink', 'branch: workflow/test-kw-proj', 'issue_number: 1', 'sink: merge',
      'worktree_path: ' + wtPath, ''
    ].join('\n'));
    execFileSync('git', ['add', 'kaola-workflow/'], { cwd: wtPath, encoding: 'utf8' });
    execFileSync('git', ['commit', '-m', 'chore: finalize test-kw-proj'], { cwd: wtPath, encoding: 'utf8' });
    // Also set up main worktree with the live folder
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
    console.log('finalize --keep-worktree commits archive rename (Gitea): PASSED');
  } finally {
    try { execFileSync('git', ['worktree', 'remove', '--force', wtPath], { cwd: mainRoot, encoding: 'utf8' }); } catch (_) {}
    fs.rmSync(mainRoot, { recursive: true, force: true });
    fs.rmSync(kwRoot, { recursive: true, force: true });
  }
}

// Test 22: #300 RED→GREEN: checkDispatchAttestations must be called in postMergeCleanup.
// Without the call, closure_receipt.claim_planner_attested === 'failed' (emptyReceipt default).
// After the fix, with no dispatch-log present, it resolves to 'missing' (detector-inactive path).
{
  const sinkScriptAttest = path.join(__dirname, 'kaola-gitea-workflow-sink-merge.js');
  const { root, branch } = setupRealRepo('attest-gt-test', 'test-gt-attest');
  try {
    const result = spawnSync(process.execPath, [
      sinkScriptAttest,
      '--branch', branch,
      '--project', 'test-gt-attest',
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

console.log('Gitea sink tests passed');
