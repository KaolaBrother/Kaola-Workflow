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
  // main still has finalization-summary.md committed, so finalValidationPassed() passes.
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
  fs.writeFileSync(path.join(dir, 'finalization-summary.md'), summary || '# Finalization\n\n## Final Validation\n\n- `npm test`: pass\n');
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
  const summary = fs.readFileSync(path.join(root, 'kaola-workflow', 'sink-project', 'finalization-summary.md'), 'utf8');
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
  writeWorkflow(root, 'gate-project', 70, '# Finalization\n\n## Final Validation\n\n- `npm test`: blocked\n');
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
  fs.writeFileSync(path.join(dir, 'finalization-summary.md'), '# Finalization\n\n## Final Validation\n\n- `npm test`: pass\n');
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
    const summaryFile = path.join(root, 'kaola-workflow', 'gone-project', 'finalization-summary.md');
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
    const summaryFile = path.join(root, 'kaola-workflow', 'live-project', 'finalization-summary.md');
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
    // #619(2): the sink now probes `issues view` on the CLOSE SUCCESS path too (not just the catch
    // branch), so this mock must be STATEFUL — report open until a matching `issues close` call
    // has actually been logged. A constant non-closed response would make the new post-close probe
    // wrongly bucket a real close as failed.
    "if (joined.startsWith('issues view')) {",
    "  let alreadyClosed = false;",
    "  try { alreadyClosed = fs.readFileSync(" + JSON.stringify(cwdLog) + ", 'utf8').split('\\n').some(function (l) { return l.indexOf('issues close') === 0; }); } catch (_) {}",
    "  process.stdout.write(JSON.stringify({ number: 168, state: alreadyClosed ? 'closed' : 'open' }) + '\\n');",
    "}",
    "else if (joined.startsWith('issues close')) process.stdout.write('{\"number\":168,\"state\":\"closed\"}\\n');",
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

// Test 17c: #619(1) close-mid-merge FAILURE must fail CLOSED — mock CLI exits 1 on 'issues close';
// the sink must refuse (typed sink_incomplete, exit non-zero) rather than report status:'merged'
// exit 0 (the pre-fix fail-open behavior). The merge itself already landed (irreversible); this is
// purely truthful reporting.
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
    assert.notStrictEqual(result.status, 0, `#619(1) close-fail test: expected non-zero exit (fail-closed), got ${result.status}. stdout: ${result.stdout} stderr: ${result.stderr}`);
    const parsed = JSON.parse(result.stdout.trim().split('\n').filter(Boolean).pop());
    assert.strictEqual(parsed.result, 'refuse', `#619(1) close-fail test: expected result:refuse, got: ${JSON.stringify(parsed)}`);
    assert.strictEqual(parsed.reason, 'sink_incomplete', `#619(1) close-fail test: expected reason:sink_incomplete, got: ${JSON.stringify(parsed)}`);
    assert.strictEqual(parsed.remote_issue_closed, 'failed',
      `#619(1) close-fail test: expected remote_issue_closed=failed, got: ${JSON.stringify(parsed.remote_issue_closed)}`);
    assert.strictEqual(parsed.closure_receipt.claim_label_removed, 'removed',
      `#619(1) close-fail test: expected claim_label_removed=removed (negative control), got: ${parsed.closure_receipt.claim_label_removed}`);
    console.log('close-fail fail-closed regression test passed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(remotePath, { recursive: true, force: true });
  }
}

// Test 18: exit-3-archived — #394: the fallback receipt is now written to the ARCHIVE .cache (was
// "no receipt written", which broke the exit-3 fallback chain). The live path stays clean.
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
  assert(fs.existsSync(path.join(archiveDir, '.cache', 'sink-fallback.json')), '#394: exit-3-archived receipt IS written to the archive .cache (durable fallback home)');
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

  const summaryFile = path.join(root, 'kaola-workflow', 'test-gt-offline-pr', 'finalization-summary.md');
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

// #346: a refused sink must NOT destroy the linked worktree's uncommitted work. The old Step 0
// `removeWorktree --force` ran BEFORE the preconditions, so a sink about to refuse first nuked the
// worktree. Provision a linked worktree on the feature branch, dirty a TRACKED file in it, run
// sink-merge → assert refusal + the worktree (and its uncommitted change) still present.
{
  const sinkScript = path.join(__dirname, 'kaola-gitea-workflow-sink-merge.js');
  const project = 'test-gt-wt-dirty';
  const { root, branch } = setupRealRepo('wt-dirty-gt-test', project);
  const wtPath = path.join(path.dirname(root), path.basename(root) + '-linked-wt');
  execFileSync('git', ['-C', root, 'worktree', 'add', wtPath, branch], { encoding: 'utf8' });
  fs.writeFileSync(path.join(wtPath, 'feature.md'), 'precious uncommitted edit');
  const result = spawnSync(process.execPath, [sinkScript, '--project', project, '--branch', branch], {
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

// #336: keep-open partial-close — runDirectMerge with keepIssueOpen MUST NOT close the issue.
withForge({
  createIssueComment(project, issueNum, body) {
    assert(body.includes('kept open'), '#336: keep-open comment body must mention kept open');
    return { id: 9100 };
  },
  closeIssue() {
    throw new Error('#336: closeIssue must NOT be called on a keep-open runDirectMerge');
  },
  updateIssueLabels() { return {}; }
}, () => {
  const root = tempRoot('kw-gt-keepopen-');
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
  const root = tempRoot('kw-gt-keepopen-noissue-');
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

// #336: sink-pr keep-open refusal — a live OR archived state carrying issue_action:
// comment_keep_open must make sink-pr refuse (merge-sink-only) before the OFFLINE branch.
{
  const sinkPrScriptKO = path.join(__dirname, 'kaola-gitea-workflow-sink-pr.js');
  const rootA = tempRoot('kw-gt-pr-keepopen-live-');
  try {
    const dir = path.join(rootA, 'kaola-workflow', 'issue-900a');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'workflow-state.md'),
      'status: active\n\n## Sink\nsink: pr\nissue_action: comment_keep_open\n');
    const r = spawnSync(process.execPath, [sinkPrScriptKO, '--project', 'issue-900a', '--branch', 'workflow/issue-900a', '--issue', '900'],
      { cwd: rootA, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
    assert.notStrictEqual(r.status, 0, '#336: sink-pr must refuse a live keep-open project');
    assert.ok(/merge-sink-only/.test(r.stderr), '#336: sink-pr live refusal must say merge-sink-only, got: ' + r.stderr);
  } finally {
    fs.rmSync(rootA, { recursive: true, force: true });
  }
  const rootB = tempRoot('kw-gt-pr-keepopen-arch-');
  try {
    const adir = path.join(rootB, 'kaola-workflow', 'archive', 'issue-900b');
    fs.mkdirSync(adir, { recursive: true });
    fs.writeFileSync(path.join(adir, 'workflow-state.md'),
      'status: closed\nstep: complete\nissue_number: 900\n\n## Sink\nsink: merge\nissue_action: comment_keep_open\n');
    const r = spawnSync(process.execPath, [sinkPrScriptKO, '--project', 'issue-900b', '--branch', 'workflow/issue-900b', '--issue', '900'],
      { cwd: rootB, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
    assert.notStrictEqual(r.status, 0, '#336: sink-pr must refuse an archived keep-open project');
    assert.ok(/merge-sink-only/.test(r.stderr), '#336: sink-pr archived refusal must say merge-sink-only, got: ' + r.stderr);
    const cleanDir = path.join(rootB, 'kaola-workflow', 'issue-900c');
    fs.mkdirSync(cleanDir, { recursive: true });
    fs.writeFileSync(path.join(cleanDir, 'workflow-state.md'), 'status: active\n\n## Sink\nsink: pr\n');
    const rc = spawnSync(process.execPath, [sinkPrScriptKO, '--project', 'issue-900c', '--branch', 'workflow/issue-900c', '--issue', '900'],
      { cwd: rootB, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
    assert.strictEqual(rc.status, 0, '#336: a non-keep-open sink-pr must still exit 0 OFFLINE, got: ' + rc.stderr);
  } finally {
    fs.rmSync(rootB, { recursive: true, force: true });
  }
}
console.log('Gitea keep-open (#336) tests passed');

// #484 / #518: the --sink TRANSACTION freshness guard + cycle-identity fix.
// #518 adds branch_head stamp to receipts so a new cycle using the same branch name correctly
// reinitializes (merge runs fresh) instead of stale-resuming to stale_sink_receipt.
// The #484 guard still fires for the edge case where branch_head matches but merge was never applied.
{
  const sinkScript = path.join(__dirname, 'kaola-gitea-workflow-sink-merge.js');
  const project = 'issue-9484';
  const branch = 'workflow/issue-9484';
  // Stale receipt WITHOUT branch_head (old format, pre-#518) — simulates prior-cycle archive receipt
  const staleReceiptNoBranchHead = JSON.stringify({
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
    // .gitignore: exclude archive/ and .cache/ so receipt files are untracked (not foreign dirt)
    fs.writeFileSync(path.join(root, '.gitignore'), 'kaola-workflow/archive/\nkaola-workflow/*/.cache/\n');
    fs.writeFileSync(path.join(root, 'base.txt'), 'base'); git('add', '-A'); git('commit', '-m', 'base');
    // Write the stale receipt in the archive path — NOT git-tracked (matches real-world scenario)
    const ac = path.join(root, 'kaola-workflow', 'archive', project, '.cache'); fs.mkdirSync(ac, { recursive: true });
    fs.writeFileSync(path.join(ac, 'sink-receipt.json'), staleReceiptNoBranchHead);
    git('branch', branch); git('checkout', branch);
    fs.writeFileSync(path.join(root, 'DELIVERABLE.txt'), 'deliverable'); git('add', '-A'); git('commit', '-m', 'feat: deliverable');
    git('checkout', 'main');
    return { root, git };
  };
  // Scenario A (#518 fix): stale receipt (no branch_head) + unmerged branch → #518 reinitializes
  // steps, merge runs fresh, result is status:sinked. The old behavior (stale_sink_receipt refusal)
  // was the BUG — the fix makes the merge actually run.
  {
    const { root } = mkRepo('kw-gt-stale-A-');
    try {
      const r = runSink(root); const p = parseLast(r.stdout);
      assert.strictEqual(p.status, 'sinked', '#518-gitea-A: stale receipt (no branch_head) must reinitialize and sink, got ' + JSON.stringify(p));
      assert.strictEqual(r.status, 0, '#518-gitea-A: sink must exit 0 after reinit, got ' + r.status);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  // Scenario B (no false-positive): branch genuinely merged → stale all-done receipt still sinks.
  {
    const { root, git } = mkRepo('kw-gt-stale-B-');
    try {
      git('merge', '--ff-only', branch);
      const r = runSink(root); const p = parseLast(r.stdout);
      assert.ok(!(p.result === 'refuse' && p.reason === 'stale_sink_receipt'), '#484-gitea-B: a genuinely-merged branch must NOT be false-refused, got ' + JSON.stringify(p));
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  // Scenario C (#518): stale receipt WITH a mismatched branch_head → reinitializes → sinked.
  {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-stale-C-'));
    const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });
    try {
      git('init', '-b', 'main'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
      fs.writeFileSync(path.join(root, '.gitignore'), 'kaola-workflow/*/.cache/\n');
      fs.writeFileSync(path.join(root, 'base.txt'), 'base'); git('add', '-A'); git('commit', '-m', 'base');
      git('branch', branch); git('checkout', branch);
      fs.writeFileSync(path.join(root, 'DELIVERABLE2.txt'), 'deliverable2'); git('add', '-A'); git('commit', '-m', 'feat: deliverable2');
      git('checkout', 'main');
      // Receipt with a DIFFERENT branch_head (old cycle SHA — mismatch triggers reinit)
      const staleWithOldHead = JSON.stringify({
        project, branch, issue_number: 9484, issue_numbers: [9484], resolved_default_branch: 'main',
        branch_head: 'deadbeefdeadbeefdeadbeef0000000000000000', // wrong SHA
        started_at: '2026-06-14T12:00:00.000Z', updated_at: '2026-06-14T12:00:00.000Z', stash_ref: null, removed_duplicates: [],
        steps: { preflight: 'done', push_upstream: 'done', merge: 'done', worktree_sync: 'done', finalize: 'done', closure: 'done', stash_restore: 'done', archive_commit: 'done', push_main: 'done' },
      });
      const lc = path.join(root, 'kaola-workflow', project, '.cache'); fs.mkdirSync(lc, { recursive: true });
      fs.writeFileSync(path.join(lc, 'sink-receipt.json'), staleWithOldHead);
      const r = runSink(root); const p = parseLast(r.stdout);
      assert.strictEqual(p.status, 'sinked', '#518-gitea-C: mismatched branch_head must reinitialize and sink, got ' + JSON.stringify(p));
      assert.strictEqual(r.status, 0, '#518-gitea-C: must exit 0');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  // Scenario D (#518): genuine mid-cycle resume (matching branch_head, merge NOT done) → resumes → sinked.
  {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-stale-D-'));
    const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });
    try {
      git('init', '-b', 'main'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
      fs.writeFileSync(path.join(root, '.gitignore'), 'kaola-workflow/*/.cache/\n');
      fs.writeFileSync(path.join(root, 'base.txt'), 'base'); git('add', '-A'); git('commit', '-m', 'base');
      git('branch', branch); git('checkout', branch);
      fs.writeFileSync(path.join(root, 'DELIVERABLE3.txt'), 'deliverable3'); git('add', '-A'); git('commit', '-m', 'feat: deliverable3');
      git('checkout', 'main');
      const branchHead = execFileSync('git', ['rev-parse', branch], { cwd: root, encoding: 'utf8' }).trim();
      // Mid-cycle receipt: preflight+push_upstream done, merge pending, branch_head = actual tip
      const midCycleReceipt = JSON.stringify({
        project, branch, issue_number: 9484, issue_numbers: [9484], resolved_default_branch: 'main',
        branch_head: branchHead, // matches current tip → genuine resume
        started_at: '2026-06-17T10:00:00.000Z', updated_at: '2026-06-17T10:00:00.000Z', stash_ref: null, removed_duplicates: [],
        steps: { preflight: 'done', push_upstream: 'done', merge: 'pending', worktree_sync: 'pending', finalize: 'pending', closure: 'pending', stash_restore: 'pending', archive_commit: 'pending', push_main: 'pending' },
      });
      const lc = path.join(root, 'kaola-workflow', project, '.cache'); fs.mkdirSync(lc, { recursive: true });
      fs.writeFileSync(path.join(lc, 'sink-receipt.json'), midCycleReceipt);
      const r = runSink(root); const p = parseLast(r.stdout);
      assert.strictEqual(p.status, 'sinked', '#518-gitea-D: genuine mid-cycle resume must complete → sinked, got ' + JSON.stringify(p));
      assert.strictEqual(r.status, 0, '#518-gitea-D: must exit 0');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
}
console.log('Gitea #484/#518 stale-sink-receipt guard + cycle-identity tests passed');

// #517: keep-open verification — forge-port parity. After push_main, if keepIssueOpen is set
// and the issue was auto-closed by the forge (merge commit keyword), reopen it.
{
  const sinkScript = path.join(__dirname, 'kaola-gitea-workflow-sink-merge.js');
  const project = 'issue-9517';
  const branch = 'workflow/issue-9517';
  const parseLast = (out) => { try { return JSON.parse(String(out || '').trim().split('\n').pop()); } catch (_) { return {}; } };
  // Mock tea: issues view → closed (autoclose), issues edit --state open → records flag
  const reopenFlagPath = path.join(os.tmpdir(), 'reopen-gt-9517-' + process.pid + '.txt');
  if (fs.existsSync(reopenFlagPath)) fs.unlinkSync(reopenFlagPath);
  const mockTeaPath = path.join(os.tmpdir(), 'mock-tea-9517-' + process.pid + '.js');
  fs.writeFileSync(mockTeaPath, `#!/usr/bin/env node
'use strict';
const args = process.argv.slice(2);
const fs = require('fs');
if (args[0] === 'issues' && args[1] === 'view') { process.stdout.write('{"number":9517,"state":"closed"}\\n'); process.exit(0); }
if (args[0] === 'issues' && args[1] === 'edit' && args.includes('--state') && args.includes('open')) {
  fs.writeFileSync(${JSON.stringify(reopenFlagPath)}, 'reopened:' + args[args.length - 1] + '\\n');
  process.exit(0);
}
process.exit(0);
`);
  // Set up a repo with bare remote so push succeeds
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-517-'));
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });
  try {
    git('init', '-b', 'main'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
    fs.writeFileSync(path.join(root, '.gitignore'), 'kaola-workflow/*/.cache/\n');
    fs.writeFileSync(path.join(root, 'base.txt'), 'base'); git('add', '-A'); git('commit', '-m', 'base');
    git('branch', branch); git('checkout', branch);
    fs.writeFileSync(path.join(root, 'feat.md'), 'feat'); git('add', '-A');
    git('commit', '-m', 'feat: fix\n\nCloses #9517');
    git('checkout', 'main');
    const remotePath = root + '-remote';
    execFileSync('git', ['init', '--bare', remotePath], { encoding: 'utf8' });
    execFileSync('git', ['remote', 'add', 'origin', remotePath], { cwd: root, encoding: 'utf8' });
    execFileSync('git', ['push', '-u', 'origin', 'main'], { cwd: root, encoding: 'utf8' });
    execFileSync('git', ['push', '-u', 'origin', branch], { cwd: root, encoding: 'utf8' });
    execFileSync('git', ['branch', '--set-upstream-to=origin/' + branch, branch], { cwd: root, encoding: 'utf8' });
    const r = spawnSync(process.execPath, [sinkScript, '--branch', branch, '--issue', '9517', '--project', project, '--keep-issue-open', '--sink'], {
      cwd: root, encoding: 'utf8', env: { ...process.env, KAOLA_TEA_MOCK_SCRIPT: mockTeaPath }
    });
    const p = parseLast(r.stdout);
    assert.strictEqual(p.status, 'sinked', '#517-gitea: expected status:sinked, got ' + JSON.stringify(p));
    assert.ok(fs.existsSync(reopenFlagPath), '#517-gitea: reopen must have been called after push_main');
    assert.strictEqual(p.receipt && p.receipt.remote_issue_closed, 'reopened_after_autoclose', '#517-gitea: receipt must record reopened_after_autoclose');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
console.log('Gitea #517 reopen-after-autoclose tests passed');

// #496/#497 forge-port parity: (#496) assertWorktreeClean fails CLOSED on a transient git-status
// probe fault; (#497) the --sink transaction does NOT report status:sinked when push_main hard-fails.
{
  const sinkScript = path.join(__dirname, 'kaola-gitea-workflow-sink-merge.js');
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
    const { root, branch } = setupRealRepo('kw-gt-wt-probe', 'gt-wt-probe-9496');
    const project = 'gt-wt-probe-9496';
    const wt = path.join(path.dirname(root), path.basename(root) + '-linked-wt');
    try {
      seedArchiveFinalization(root, project);
      execFileSync('git', ['-C', root, 'worktree', 'add', wt, branch], { encoding: 'utf8' });
      const before = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
      const r = spawnSync(process.execPath, [sinkScript, '--project', project, '--branch', branch, '--root', root], { cwd: root, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_WORKFLOW_FORCE_WT_STATUS_FAIL: '1' }, encoding: 'utf8' });
      assert.notStrictEqual(r.status, 0, '#496-gitea: an unprovable worktree-clean probe must refuse (fail closed), got status ' + r.status + '\nstderr: ' + r.stderr);
      assert.ok(/(could not|cannot) (be )?verif|unprovable/i.test(r.stderr || ''), '#496-gitea: refusal must name the unverifiable-clean cause, got: ' + r.stderr);
      assert.ok(fs.existsSync(wt), '#496-gitea: a probe-fault refusal must NOT remove the worktree');
      assert.strictEqual(execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), before, '#496-gitea: main must NOT advance on a probe-fault refusal');
    } finally {
      try { execFileSync('git', ['-C', root, 'worktree', 'remove', '--force', wt], { encoding: 'utf8' }); } catch (_) {}
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  // #506: outer `git worktree list` probe fault → fail CLOSED (refuse, worktree intact, main unchanged).
  // Symmetric hardening of #496: the outer enumeration probe is equally required to fail closed.
  {
    const { root, branch } = setupRealRepo('kw-gt-wt-list', 'gt-wt-list-9506');
    const project = 'gt-wt-list-9506';
    const wt = path.join(path.dirname(root), path.basename(root) + '-list-wt');
    try {
      seedArchiveFinalization(root, project);
      execFileSync('git', ['-C', root, 'worktree', 'add', wt, branch], { encoding: 'utf8' });
      const before = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
      const r = spawnSync(process.execPath, [sinkScript, '--project', project, '--branch', branch, '--root', root], { cwd: root, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_WORKFLOW_FORCE_WT_LIST_FAIL: '1' }, encoding: 'utf8' });
      assert.notStrictEqual(r.status, 0, '#506-gitea: an unprovable worktree-list probe must refuse (fail closed), got status ' + r.status + '\nstderr: ' + r.stderr);
      assert.ok(/worktree list|enumerate worktree/i.test(r.stderr || ''), '#506-gitea: refusal must name the worktree-list cause, got: ' + r.stderr);
      assert.ok(fs.existsSync(wt), '#506-gitea: a list-probe-fault refusal must NOT remove the worktree');
      assert.strictEqual(execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), before, '#506-gitea: main must NOT advance on a list-probe-fault refusal');
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
    const project = 'gt-pushfail-9497';
    const branch = 'workflow/' + project;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-pushfail-'));
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
      assert.notStrictEqual(p.status, 'sinked', '#497-gitea: a hard push_main failure must NOT report status:sinked, got ' + JSON.stringify(p) + '\nstderr: ' + r.stderr);
      assert.notStrictEqual(r.status, 0, '#497-gitea: a hard push_main failure must exit non-zero');
      assert.strictEqual(p.result, 'refuse', '#497-gitea: a hard push_main failure must emit result:refuse, got ' + JSON.stringify(p));
      const rp = [path.join(root, 'kaola-workflow', 'archive', project, '.cache', 'sink-receipt.json'), path.join(root, 'kaola-workflow', project, '.cache', 'sink-receipt.json')].find(x => fs.existsSync(x));
      assert.ok(rp, '#497-gitea: a sink-receipt must exist after the failed transaction');
      const receipt = JSON.parse(fs.readFileSync(rp, 'utf8'));
      assert.notStrictEqual(receipt.steps.push_main, 'done', '#497-gitea: push_main must NOT be marked done after a hard push failure');
    } finally {
      fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      fs.rmSync(remote, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }

  // #497 (closure arm): a HARD issue-CLOSE failure on the `--sink` path must NOT report status:sinked.
  // The tea mock fails `issues close` (exit 1) and reports the issue still `open` on `issues view` so
  // probeIssueClosed returns false (genuine failure, not already-closed). The refuse returns BEFORE
  // push_main → closure not done, push_main still pending.
  {
    const project = 'gt-closefail-9498';
    const branch = 'workflow/' + project;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-closefail-'));
    const remote = root + '-remote';
    const mockScript = root + '-tea-mock.js';
    fs.writeFileSync(mockScript, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.startsWith('issues view')) { process.stdout.write('{\"number\":9498,\"state\":\"open\",\"labels\":[]}\\n'); process.exit(0); }",
      "if (a.startsWith('issues close')) { process.stderr.write('mock: close failed\\n'); process.exit(1); }",
      "if (a.startsWith('issues edit')) { process.stdout.write('{}\\n'); process.exit(0); }",
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
      const r = spawnSync(process.execPath, [sinkScript, '--branch', branch, '--project', project, '--issue', '9498', '--sink', '--json'], { cwd: root, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_TEA_MOCK_SCRIPT: mockScript }, encoding: 'utf8' });
      const p = parseLast(r.stdout);
      assert.notStrictEqual(p.status, 'sinked', '#497-close-gitea: a hard close failure must NOT report status:sinked, got ' + JSON.stringify(p) + '\nstderr: ' + r.stderr);
      assert.notStrictEqual(r.status, 0, '#497-close-gitea: a hard close failure must exit non-zero');
      assert.ok(p.result === 'refuse' && p.step === 'closure', '#497-close-gitea: must emit result:refuse step:closure, got ' + JSON.stringify(p));
      assert.ok(Array.isArray(p.failed_issue_closures) && p.failed_issue_closures.includes(9498), '#497-close-gitea: must surface the failed closure (9498), got ' + JSON.stringify(p));
      const rp = [path.join(root, 'kaola-workflow', 'archive', project, '.cache', 'sink-receipt.json'), path.join(root, 'kaola-workflow', project, '.cache', 'sink-receipt.json')].find(x => fs.existsSync(x));
      assert.ok(rp, '#497-close-gitea: a sink-receipt must exist after the failed transaction');
      const receipt = JSON.parse(fs.readFileSync(rp, 'utf8'));
      assert.notStrictEqual(receipt.steps.closure, 'done', '#497-close-gitea: closure must NOT be marked done after a hard close failure');
      // #617: SINK_STEPS now runs closure LAST (after push_main), so push_main must already be
      // 'done' by the time the closure step's close-failure short-circuit fires — the merge
      // itself succeeded; only the issue-close call failed.
      assert.strictEqual(receipt.steps.push_main, 'done', '#497-close-gitea: push_main must already be done (closure runs after push_main)');
    } finally {
      fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      fs.rmSync(remote, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      try { fs.rmSync(mockScript, { force: true }); } catch (_) {}
    }
  }
}
console.log('Gitea #496/#497/#506 fail-closed sink guard tests passed');

// #520: archive_commit must NOT commit sink-receipt.json or sink-fallback.json into main.
// Assert by tracked-status (git ls-files) after a clean --sink run: journals must be absent
// from the tracked tree while still existing on disk (crash-resume invariant).
{
  const sinkScript = path.join(__dirname, 'kaola-gitea-workflow-sink-merge.js');
  const project = 'gt-520-journals';
  const branch = 'workflow/' + project;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-520-'));
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });
  try {
    git('init', '-b', 'main'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
    fs.writeFileSync(path.join(root, 'base.txt'), 'base'); git('add', '-A'); git('commit', '-m', 'base');
    git('checkout', '-b', branch);
    // Simulate finalize: commit an archive folder on the feature branch
    const archiveDir = path.join(root, 'kaola-workflow', 'archive', project);
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, 'workflow-state.md'), '# State\nstatus: closed\n');
    fs.writeFileSync(path.join(root, 'impl.txt'), 'impl');
    git('add', '-A'); git('commit', '-m', 'feat: impl + archive');
    git('checkout', 'main');
    // Remove live folder so receipt resolves to archive path (matching production lane)
    fs.rmSync(path.join(root, 'kaola-workflow', project), { recursive: true, force: true });
    const r = spawnSync(process.execPath, [sinkScript, '--branch', branch, '--project', project, '--sink', '--json'],
      { cwd: root, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
    assert.strictEqual(r.status, 0, '#520-gitea: --sink must exit 0\nstdout: ' + r.stdout + '\nstderr: ' + r.stderr);
    // #653: a terminally successful sink emits journal_disposed:true and disposes the on-disk journal
    // itself — read the completed receipt from stdout (the post-disposal source of truth).
    const p520 = JSON.parse(String(r.stdout || '').trim().split('\n').pop());
    assert.strictEqual(p520.journal_disposed, true, '#653-gitea: a terminally successful sink must report journal_disposed:true, got ' + JSON.stringify(p520));
    // Journals must NOT be tracked in git after --sink
    const lsFiles = spawnSync('git', ['-C', root, 'ls-files',
      'kaola-workflow/archive/' + project + '/.cache/sink-receipt.json',
      'kaola-workflow/archive/' + project + '/.cache/sink-fallback.json'
    ], { encoding: 'utf8' }).stdout.trim();
    assert.strictEqual(lsFiles, '', '#520-gitea: sink journals must NOT be tracked in git after --sink; got: ' + lsFiles);
    // #653: the receipt must be GONE from disk after terminal success (it exists on disk only for
    // crash-resume; a completed sink disposes of it itself).
    const rcptOnDisk = fs.existsSync(path.join(root, 'kaola-workflow', 'archive', project, '.cache', 'sink-receipt.json')) ||
      fs.existsSync(path.join(root, 'kaola-workflow', project, '.cache', 'sink-receipt.json'));
    assert.ok(!rcptOnDisk, '#653-gitea: sink-receipt.json must NOT remain on disk after a terminally successful sink');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
console.log('Gitea #520 journal-exclusion from archive_commit: PASSED');

// #548 forge-port parity: the post-rebase runTestGate is consumer-aware. On a CONSUMER (non-npm)
// product repo — package.json declares NO `test:kaola-workflow:*` chain script — the gate runs NO
// suite (a hardcoded `npm test` would error / run an unrelated script on every origin-advance
// rebase). We advance origin/main BEFORE the sink (alreadyUpToDate false → doRebase → runTestGate)
// and prove `npm test` is NOT invoked via an `npm` PATH shim. SKIP_TESTGATE is deliberately unset.
{
  const sinkScript = path.join(__dirname, 'kaola-gitea-workflow-sink-merge.js');
  const project = 'issue-9548';
  const branch = 'workflow/issue-9548';
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-548-consumer-'));
  const remotePath = root + '-remote';
  const clone = root + '-clone';
  const binDir = root + '-bin';
  const npmSentinel = root + '-npm-invoked';
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });
  try {
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(path.join(binDir, 'npm'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "' + npmSentinel + '"\nexit 0\n');
    fs.chmodSync(path.join(binDir, 'npm'), 0o755);
    git('init', '-b', 'main'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
    // CONSUMER fixture: package.json with a generic `test` script, NO `test:kaola-workflow:*`.
    fs.writeFileSync(path.join(root, 'package.json'),
      JSON.stringify({ name: 'consumer-product', version: '1.0.0', scripts: { test: 'echo unrelated-consumer-suite' } }, null, 2) + '\n');
    fs.writeFileSync(path.join(root, 'base.txt'), 'base'); git('add', '-A'); git('commit', '-m', 'base + consumer package.json');
    execFileSync('git', ['init', '--bare', remotePath], { encoding: 'utf8' });
    git('remote', 'add', 'origin', remotePath); git('push', '-u', 'origin', 'main');
    git('checkout', '-b', branch);
    fs.writeFileSync(path.join(root, 'feat.md'), 'feat'); git('add', '-A'); git('commit', '-m', 'feat: impl 9548');
    git('push', '-u', 'origin', branch);
    git('checkout', 'main');
    // Advance origin/main via a clone, then fetch so the local origin/main tracking ref moves ahead
    // → alreadyUpToDate is false in the --sink transaction (no Step-1 fetch on that path).
    execFileSync('git', ['clone', remotePath, clone], { encoding: 'utf8' });
    // The clone is a separate repo and inherits no identity under the hermetic HOME — give it one
    // (mirrors the `root` config above) so the concurrent-advance commit doesn't fail status 128.
    execFileSync('git', ['-C', clone, 'config', 'user.email', 't@t'], { encoding: 'utf8' });
    execFileSync('git', ['-C', clone, 'config', 'user.name', 't'], { encoding: 'utf8' });
    execFileSync('git', ['-C', clone, 'checkout', '-B', 'main', 'origin/main'], { encoding: 'utf8' });
    fs.writeFileSync(path.join(clone, 'concurrent.txt'), 'x');
    execFileSync('git', ['-C', clone, 'add', '-A'], { encoding: 'utf8' });
    execFileSync('git', ['-C', clone, 'commit', '-m', 'concurrent main advance'], { encoding: 'utf8' });
    execFileSync('git', ['-C', clone, 'push', 'origin', 'main'], { encoding: 'utf8' });
    git('fetch', 'origin');
    const r = spawnSync(process.execPath, [sinkScript, '--branch', branch, '--project', project, '--sink', '--json'], {
      cwd: root, encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '0', PATH: binDir + path.delimiter + (process.env.PATH || '') }
    });
    const p = (() => { try { return JSON.parse(String(r.stdout || '').trim().split('\n').pop()); } catch (_) { return {}; } })();
    assert.strictEqual(p.status, 'sinked', '#548-gitea: consumer-repo --sink must reach status:sinked (no npm-test gate to fail)\nstdout: ' + r.stdout + '\nstderr: ' + r.stderr);
    assert.ok(!fs.existsSync(npmSentinel),
      '#548-gitea: a CONSUMER repo (no test:kaola-workflow:* script) must NOT invoke `npm test` in the post-rebase gate; sentinel: ' +
      (fs.existsSync(npmSentinel) ? fs.readFileSync(npmSentinel, 'utf8') : '(absent)'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(remotePath, { recursive: true, force: true });
    try { fs.rmSync(clone, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(binDir, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(npmSentinel, { force: true }); } catch (_) {}
  }
}
console.log('Gitea #548 consumer-aware test-gate: PASSED');

// #592: `--sink --issue-numbers A,B` (no `--issue`) must actually run the closure loop, not
// silently skip it. Pre-fix, the closure gate was `args.issue != null` only — a bundle sink
// invoked with ONLY `--issue-numbers` (no primary `--issue`) tripped it false, so the ENTIRE
// close loop was skipped, yet execution still fell through to stepDone('closure') below — the
// receipt reported closure:done having closed zero issues, and status:sinked, while both members
// stayed open on the forge (observed live on bundle-587-589).
{
  const sinkScript = path.join(__dirname, 'kaola-gitea-workflow-sink-merge.js');
  const project = 'gt-592-9601-9602';
  const branch = 'workflow/' + project;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-592-'));
  const remote = root + '-remote';
  const logFile = root + '-tea-calls.log';
  const mockScript = root + '-tea-mock.js';
  fs.writeFileSync(mockScript, [
    "const fs = require('fs');",
    "const a = process.argv.slice(2).join(' ');",
    "function log(m) { try { fs.appendFileSync(" + JSON.stringify(logFile) + ", m + '\\n'); } catch (_) {} }",
    // #619(2): the sink now probes `issues view` on the CLOSE SUCCESS path too (not just the
    // catch branch), so this mock must be STATEFUL — open until a matching `issues close N` has
    // been logged. A constant 'open' would make the new post-close probe wrongly bucket every
    // real close as failed.
    "const viewM = a.match(/^issues view (\\d+)/);",
    "if (viewM) {",
    "  const n = viewM[1];",
    "  let alreadyClosed = false;",
    "  try { alreadyClosed = fs.readFileSync(" + JSON.stringify(logFile) + ", 'utf8').split('\\n').includes('close:' + n); } catch (_) {}",
    "  process.stdout.write(JSON.stringify({ state: alreadyClosed ? 'closed' : 'open', labels: [] }) + '\\n');",
    "  process.exit(0);",
    "}",
    "// issues close N -> succeeds, logged as close:N (so the test can assert it was ATTEMPTED)",
    "if (a.startsWith('issues close')) { const m = a.match(/issues close (\\d+)/); log('close:' + (m ? m[1] : '?')); process.stdout.write('{}\\n'); process.exit(0); }",
    "if (a.startsWith('issues edit')) { process.stdout.write('{}\\n'); process.exit(0); }",
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
    // The bundle sink shape from the issue: --issue-numbers only, NO --issue.
    const r = spawnSync(process.execPath, [
      sinkScript, '--branch', branch, '--project', project, '--issue-numbers', '9601,9602', '--sink', '--json',
    ], { cwd: root, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_TEA_MOCK_SCRIPT: mockScript }, encoding: 'utf8' });
    const p = (() => { try { return JSON.parse(String(r.stdout || '').trim().split('\n').pop()); } catch (_) { return {}; } })();
    assert.strictEqual(r.status, 0, '#592-gitea: --issue-numbers-only sink should exit 0 once closure genuinely runs; got ' + r.status + '\nstdout: ' + r.stdout + '\nstderr: ' + r.stderr);

    // THE BUG: pre-fix, the close loop is gated on args.issue != null, so with only
    // --issue-numbers neither issue's close is ever invoked.
    const calls = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean) : [];
    assert.ok(calls.includes('close:9601'), '#592-gitea: issue 9601 close must be ATTEMPTED (bug: closure loop skipped entirely when --issue is absent); calls=' + JSON.stringify(calls));
    assert.ok(calls.includes('close:9602'), '#592-gitea: issue 9602 close must be ATTEMPTED; calls=' + JSON.stringify(calls));

    // #653: the receipt must record the actually-closed set (not report closure:done having closed
    // zero issues) so a resume can verify rather than skip. Read it from the stdout `p.receipt` — a
    // terminally successful sink disposes of the on-disk journal itself.
    assert.ok(p.receipt, '#592-gitea: a sink-receipt must be present on the stdout emit after the transaction');
    const receipt = p.receipt;
    assert.strictEqual(receipt.steps.closure, 'done', '#592-gitea: closure step reports done once it genuinely ran; got ' + JSON.stringify(receipt.steps));
    assert.ok(Array.isArray(receipt.closed_issues) && receipt.closed_issues.length === 2,
      '#592-gitea: receipt.closed_issues must record both actually-closed members, got ' + JSON.stringify(receipt.closed_issues));
    assert.ok(receipt.closed_issues.includes(9601) && receipt.closed_issues.includes(9602),
      '#592-gitea: receipt.closed_issues must include 9601 and 9602, got ' + JSON.stringify(receipt.closed_issues));
    assert.strictEqual(p.status, 'sinked', '#592-gitea: expected status:sinked once closure genuinely succeeds, got ' + JSON.stringify(p));
    assert.strictEqual(p.journal_disposed, true, '#653-gitea: a terminally successful sink must report journal_disposed:true, got ' + JSON.stringify(p));
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    fs.rmSync(remote, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    try { fs.rmSync(mockScript, { force: true }); } catch (_) {}
    try { fs.rmSync(logFile, { force: true }); } catch (_) {}
  }
}
console.log('Gitea #592 --issue-numbers-only sink closure test: PASSED');

// --- #619 (claim.js): forge close-helper post-probes the SUCCESS path too ----------------------
// closeIssueIdempotent (kaola-gitea-workflow-claim.js) trusted a successful forge.closeIssue()
// unconditionally on the success path; only the catch branch re-probed. The post-close probe MUST
// be a FRESH forge.viewIssue() call — probeIssueState (used for the pre-close check, shared via
// active-folders.js's memo) is memoized per-process, so reusing it post-close would always replay
// the pre-close verdict.
{
  const claimModule = require('./kaola-gitea-workflow-claim');

  function scenario619(issueNum, viewSequence, closeThrows) {
    return withForge({
      viewIssue: (() => {
        let call = 0;
        return function (n) {
          const state = viewSequence[Math.min(call, viewSequence.length - 1)];
          call++;
          return { number: n, state };
        };
      })(),
      closeIssue: (n) => { if (closeThrows) throw new Error('mock close failure'); return { number: n, state: 'closed' }; }
    }, () => claimModule.closeIssueIdempotent(issueNum, {}));
  }

  const token619A = scenario619(619201, ['open', 'open'], false);
  assert.strictEqual(token619A, 'failed',
    '#619 (Gitea): closeIssue succeeds but a LIVE post-close probe shows the issue still open must bucket failed, got ' + token619A);

  const token619B = scenario619(619202, ['open', 'closed'], false);
  assert.strictEqual(token619B, 'closed',
    '#619 (Gitea): a genuinely successful close (post-probe confirms closed) must still return closed, got ' + token619B);

  const token619C = scenario619(619203, ['open', 'closed'], true);
  assert.strictEqual(token619C, 'already_closed',
    '#619 (Gitea): a close call that THROWS but a live post-probe confirms the issue is actually closed must return already_closed, got ' + token619C);

  const token619D = scenario619(619204, ['open', 'open'], true);
  assert.strictEqual(token619D, 'failed',
    '#619 (Gitea): a close call that throws and stays open must return failed (baseline, unchanged), got ' + token619D);

  console.log('Gitea #619 claim.js close-helper post-probe tests passed');
}

// --- #620 (claim.js): stale-worktree-cleanup must NEVER destroy unmerged committed work ---------
{
  const claimScript620 = path.join(__dirname, 'kaola-gitea-workflow-claim.js');
  const project620 = 'gitea-620-unmerged';
  const branch620 = 'workflow/gitea-issue-96205';
  const root620 = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gitea-620-'));
  const kwRoot620 = root620 + '.kw';
  const mockScript620 = root620 + '-tea-mock.js';
  try {
    const git620 = (...a) => execFileSync('git', a, { cwd: root620, encoding: 'utf8' });
    git620('init', '-b', 'main');
    git620('config', 'user.email', 't@t');
    git620('config', 'user.name', 't');
    fs.writeFileSync(path.join(root620, 'README.md'), 'fixture');
    git620('add', '-A');
    git620('commit', '-m', 'init');

    const wtPath620 = path.join(kwRoot620, 'issue-96205');
    fs.mkdirSync(kwRoot620, { recursive: true });
    execFileSync('git', ['-C', root620, 'worktree', 'add', '-b', branch620, '--', wtPath620, 'HEAD'], { encoding: 'utf8' });
    // Commit new work INSIDE the worktree — never merged into main.
    fs.writeFileSync(path.join(wtPath620, 'unmerged-feature.txt'), 'the only copy of this work\n');
    execFileSync('git', ['-C', wtPath620, 'add', '-A'], { encoding: 'utf8' });
    execFileSync('git', ['-C', wtPath620, 'commit', '-m', 'feat: unmerged work'], { encoding: 'utf8' });
    const unmergedTip620 = execFileSync('git', ['-C', wtPath620, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

    fs.writeFileSync(mockScript620, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.startsWith('issues view 96205')) { process.stdout.write(JSON.stringify({ state: 'closed' }) + '\\n'); process.exit(0); }",
      "process.stdout.write('{}\\n'); process.exit(0);"
    ].join('\n'));

    const result620 = spawnSync(process.execPath, [claimScript620, 'stale-worktree-cleanup', '--execute'], {
      cwd: root620,
      encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_TEA_MOCK_SCRIPT: mockScript620 }
    });
    let out620 = {};
    try { out620 = JSON.parse(result620.stdout); } catch (_) {}
    assert.strictEqual(out620.dry_run, false, '#620 (Gitea): dry_run must be false, got ' + JSON.stringify(out620) + '\nstderr: ' + result620.stderr);

    let branchSurvived620 = false, tipReachable620 = false;
    try {
      execFileSync('git', ['-C', root620, 'rev-parse', '--verify', '--quiet', 'refs/heads/' + branch620], { stdio: ['ignore', 'pipe', 'ignore'] });
      branchSurvived620 = true;
    } catch (_) {}
    try {
      execFileSync('git', ['-C', root620, 'cat-file', '-e', unmergedTip620], { stdio: ['ignore', 'ignore', 'ignore'] });
      tipReachable620 = true;
    } catch (_) {}
    assert.ok(branchSurvived620,
      '#620 (Gitea): the unmerged branch ' + branch620 + ' must SURVIVE cleanup --execute, got cleanup output: ' + JSON.stringify(out620));
    assert.ok(tipReachable620,
      '#620 (Gitea): the unmerged commit ' + unmergedTip620 + ' must still be reachable after cleanup --execute, got cleanup output: ' + JSON.stringify(out620));
    assert.ok(!(Array.isArray(out620.deleted_branch) && out620.deleted_branch.includes(branch620)),
      '#620 (Gitea): deleted_branch must NOT include the unmerged branch, got ' + JSON.stringify(out620.deleted_branch));
    assert.ok(Array.isArray(out620.skipped_unmerged) && out620.skipped_unmerged.some(e => e && e.branch === branch620),
      '#620 (Gitea): skipped_unmerged must record the unmerged branch, got ' + JSON.stringify(out620.skipped_unmerged));
    console.log('Gitea #620 stale-worktree-cleanup unmerged-branch survives test passed');
  } finally {
    fs.rmSync(root620, { recursive: true, force: true });
    try { fs.rmSync(kwRoot620, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(mockScript620, { force: true }); } catch (_) {}
  }
}

// --- #631 (claim.js): cmdVerifySink must PREFER published_head over rebase-stale branch_head ----
{
  const claimScript631 = path.join(__dirname, 'kaola-gitea-workflow-claim.js');
  const project631 = 'gitea-631-verify';
  const root631 = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gitea-631-'));
  try {
    const git631 = (...a) => execFileSync('git', a, { cwd: root631, encoding: 'utf8' });
    git631('init', '-b', 'main');
    git631('config', 'user.email', 't@t');
    git631('config', 'user.name', 't');
    fs.writeFileSync(path.join(root631, 'README.md'), 'fixture');
    git631('add', '-A');
    git631('commit', '-m', 'init');

    git631('checkout', '-b', 'workflow/gitea-issue-96311');
    fs.writeFileSync(path.join(root631, 'feat.txt'), 'impl');
    git631('add', '-A');
    git631('commit', '-m', 'feat: impl');
    const staleBranchHead631 = execFileSync('git', ['-C', root631, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    git631('checkout', 'main');

    fs.writeFileSync(path.join(root631, 'published.txt'), 'landed');
    git631('add', '-A');
    git631('commit', '-m', 'feat: published');
    const publishedHead631 = execFileSync('git', ['-C', root631, 'rev-parse', 'main'], { encoding: 'utf8' }).trim();
    assert.notStrictEqual(staleBranchHead631, publishedHead631, '#631 (Gitea) fixture: branch_head and published_head must differ');

    const archiveCacheDir631 = path.join(root631, 'kaola-workflow', 'archive', project631, '.cache');
    fs.mkdirSync(archiveCacheDir631, { recursive: true });
    fs.writeFileSync(path.join(archiveCacheDir631, 'sink-receipt.json'), JSON.stringify({
      branch_head: staleBranchHead631,
      published_head: publishedHead631
    }) + '\n');

    const result631 = spawnSync(process.execPath, [claimScript631, 'verify-sink', '--project', project631], {
      cwd: root631,
      encoding: 'utf8',
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
    });
    let out631 = {};
    try { out631 = JSON.parse(result631.stdout); } catch (_) {}

    assert.strictEqual(out631.checks && out631.checks.impl_commit, publishedHead631,
      '#631 (Gitea): cmdVerifySink must resolve impl_commit from published_head, got ' + JSON.stringify(out631.checks));
    assert.strictEqual(out631.checks && out631.checks.merged_into_sink_target, 'verified',
      '#631 (Gitea): a rebased-but-genuinely-published sink must verify, got ' + JSON.stringify(out631.checks));
    assert.ok(!(Array.isArray(out631.reasons) && out631.reasons.includes('impl_commit_not_ancestor')),
      '#631 (Gitea): reasons must NOT include impl_commit_not_ancestor, got ' + JSON.stringify(out631.reasons));
    assert.strictEqual(result631.status, 0, '#631 (Gitea): verify-sink must exit 0, got ' + result631.status + ' full: ' + JSON.stringify(out631));
    console.log('Gitea #631 verify-sink published_head preference test passed');
  } finally {
    fs.rmSync(root631, { recursive: true, force: true });
  }
}

// --- #707: worktree-postured sink must archive the worktree's .cache node evidence; an
// evidence-empty live folder whose ## Node Ledger proves recorded evidence must refuse loudly ----
{
  const sinkScript707 = path.join(__dirname, 'kaola-gitea-workflow-sink-merge.js');
  const planWithLedger707 = (rows) => {
    const lines = [
      '# Workflow Plan', '', '## Meta', 'labels: test', '',
      '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape |',
      '|---|---|---|---|---|---|',
    ];
    for (const r of rows) lines.push('| ' + r.id + ' | ' + (r.role || 'implementer') + ' | — | — | 1 | sequence |');
    lines.push('', '## Node Ledger', '', '| id | status |', '|---|---|');
    for (const r of rows) lines.push('| ' + r.id + ' | ' + r.status + ' |');
    lines.push('');
    return lines.join('\n');
  };
  const mkFixture707 = (project, withWorktreeEvidence) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-707-'));
    const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });
    const branch = 'workflow/' + project;
    git('init', '-b', 'main'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
    fs.writeFileSync(path.join(root, 'base.txt'), 'base'); git('add', '-A'); git('commit', '-m', 'base');
    git('checkout', '-b', branch);
    const liveDir = path.join(root, 'kaola-workflow', project);
    fs.mkdirSync(liveDir, { recursive: true });
    fs.writeFileSync(path.join(liveDir, 'workflow-state.md'),
      '# Kaola-Workflow State\n\n## Project\nname: ' + project + '\nstatus: active\n\n## Last Updated\n' + new Date().toISOString() + '\n');
    fs.writeFileSync(path.join(liveDir, 'workflow-plan.md'), planWithLedger707([
      { id: 'n1-impl', status: 'complete' },
      { id: 'n2-finalize', role: 'finalize', status: 'in_progress' },
    ]));
    fs.writeFileSync(path.join(root, 'DELIVERABLE.txt'), 'deliverable');
    git('add', '-A'); git('commit', '-m', 'feat: deliverable + live state');
    git('checkout', 'main');
    if (withWorktreeEvidence) {
      const wtPath = path.join(root, '.kw', 'worktrees', project);
      execFileSync('git', ['-C', root, 'worktree', 'add', wtPath, branch], { encoding: 'utf8' });
      const wtCache = path.join(wtPath, 'kaola-workflow', project, '.cache');
      fs.mkdirSync(wtCache, { recursive: true });
      fs.writeFileSync(path.join(wtCache, 'n1-impl.md'), 'worktree evidence n1\n');
    }
    return { root, branch };
  };
  const runSink707 = (root, branch, project) => spawnSync(process.execPath,
    [sinkScript707, '--branch', branch, '--project', project, '--issue', '707', '--sink', '--json'],
    { cwd: root, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
  const parseLast707 = (out) => { try { return JSON.parse(String(out || '').trim().split('\n').pop()); } catch (_) { return {}; } };

  // (a) worktree-postured: the worktree's untracked node evidence lands in the archive + at HEAD.
  {
    const project = 'issue-97071';
    const { root, branch } = mkFixture707(project, true);
    try {
      const r = runSink707(root, branch, project);
      const p = parseLast707(r.stdout);
      assert.strictEqual(p.status, 'sinked', '#707-gitea-a: sink must complete, got ' + JSON.stringify(p) + '\nstderr: ' + r.stderr);
      assert.strictEqual(r.status, 0, '#707-gitea-a: sink must exit 0, got ' + r.status);
      const archRel = (p.receipt && p.receipt.archive_dest) || ('kaola-workflow/archive/' + project);
      assert.ok(fs.existsSync(path.join(root, archRel, '.cache', 'n1-impl.md')),
        '#707-gitea-a: the worktree .cache evidence must be archived, archive .cache holds: '
        + JSON.stringify((() => { try { return fs.readdirSync(path.join(root, archRel, '.cache')); } catch (_) { return '<none>'; } })()));
      let committed = false;
      try { committed = execFileSync('git', ['-C', root, 'cat-file', '-t', 'HEAD:' + archRel + '/.cache/n1-impl.md'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() === 'blob'; } catch (_) {}
      assert.ok(committed, '#707-gitea-a: the archived evidence must be committed at HEAD');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  // (b) evidence-empty live folder + ledger-proven evidence → loud typed refusal, nothing deleted.
  {
    const project = 'issue-97072';
    const { root, branch } = mkFixture707(project, false);
    try {
      const r = runSink707(root, branch, project);
      const p = parseLast707(r.stdout);
      assert.strictEqual(r.status, 1, '#707-gitea-b: an evidence-empty archive attempt must exit 1, got ' + r.status + '\nstdout: ' + r.stdout);
      assert.ok(p.result === 'refuse' && p.reason === 'sink_incomplete' && p.step === 'finalize'
        && p.archive_refusal === 'node_evidence_missing'
        && Array.isArray(p.missing) && p.missing.includes('.cache/n1-impl.md'),
        '#707-gitea-b: typed refusal (sink_incomplete/finalize/node_evidence_missing) required, got ' + JSON.stringify(p));
      assert.ok(fs.existsSync(path.join(root, 'kaola-workflow', project, 'workflow-state.md')),
        '#707-gitea-b: the live project folder must survive the refusal');
      assert.ok(!fs.existsSync(path.join(root, 'kaola-workflow', 'archive', project, 'workflow-state.md')),
        '#707-gitea-b: no archived copy may exist after the refusal');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  console.log('Gitea #707 worktree-evidence archive + evidence-empty refusal tests passed');
}

console.log('Gitea sink tests passed');
