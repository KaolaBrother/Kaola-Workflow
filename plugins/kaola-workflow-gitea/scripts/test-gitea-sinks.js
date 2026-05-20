#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

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

console.log('Gitea sink tests passed');
