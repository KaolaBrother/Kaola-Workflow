#!/usr/bin/env node
'use strict';
// Advisory spawn census (ADR 0013, the process-boundary razor). Installed BEFORE this
// file destructures child_process so the counted wrappers are what it binds. Advisory,
// pass-through and fail-open: the require itself is guarded, so a census that is absent
// or faulty can change no assertion and fail no run.
try { require('./test-spawn-census').install('test-gitea-sinks'); } catch (_) { /* advisory only */ }

const assert = require('assert');
// Git FIXTURE arrangement routes through the shared library — one process-boundary
// decision for the repo instead of one per line. See scripts/test-git-fixture.js.
const G = require('./test-git-fixture');
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
// These fixtures jump straight from a hand-rolled state to finalize to exercise closure /
// archive-rename behaviour. All finalize needs from them is the consumer-mode validation record:
// a passing verdict BOUND to the tree it was recorded over. The `writeSet` parameter is retained
// so call sites read unchanged — a declared write set is no longer a thing that can be declared,
// and nothing consumes it. Seed LAST, after every other fixture file is in place, so the recorded
// validated_candidate_hash matches the tree finalize recomputes over.
function seedAdaptiveFinalizeFixture(fixtureRoot, project, writeSet) {   // eslint-disable-line no-unused-vars
  const dir = path.join(fixtureRoot, 'kaola-workflow', project);
  fs.mkdirSync(path.join(dir, '.cache'), { recursive: true });
  const schema = require('./kaola-workflow-adaptive-schema');
  let cand = '';
  try { cand = schema.computeCodeTreeHash(fixtureRoot, project, schema.VALIDATION_TEST_CONSUMES) || ''; } catch (_) { cand = ''; }
  fs.writeFileSync(path.join(dir, '.cache', 'final-validation.md'),
    'verdict: pass\nfindings_blocking: 0\nvalidated_candidate_hash: ' + cand + '\n');
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
  // `-b main` is not decoration: without it the bare remote's HEAD comes from the OPERATOR's
  // init.defaultBranch, which is `master` where that is unset. The fixture repo is `main`, so
  // the remote ends up with a HEAD pointing at a branch nobody ever pushes — and every
  // assertion that reads evidence back through a fresh `git clone` of this remote sees an
  // empty checkout instead of the tree. Pin it here; never let the host decide.
  G.execRaw(['init', '--bare', '-b', 'main', remotePath], { encoding: 'utf8' });
  G.exec(root, ['remote', 'add', 'origin', remotePath], { encoding: 'utf8' });
  G.exec(root, ['push', '-u', 'origin', 'main'], { encoding: 'utf8' });
  G.exec(root, ['push', '-u', 'origin', branch], { encoding: 'utf8' });
  G.exec(root, ['branch', '--set-upstream-to=origin/' + branch, branch], { encoding: 'utf8' });
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
  const branchList = G.exec(root, ['branch', '--list', branch], { encoding: 'utf8' });
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

  const branchBefore = G.exec(root, ['branch', '--list', branch], { encoding: 'utf8' });
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

  const log = G.exec(root, ['log', '--oneline', '-1'], { encoding: 'utf8' }).trim();
  assert(log.includes('chore: record PR metadata for test-gt-offline-pr'),
    `offline-pr test: expected metadata commit in git log, got: ${log}`);

  console.log('offline-pr subprocess test passed');
}

// Test 20: the unfinalized-run precondition STOPS the sink. CONVERTED VOCABULARY — this used to pin
// the bare `sink-merge refused:` prefix on stderr. That prefix is now reserved for the KEEP-class
// guards (a dirty worktree, a failed push): the preconditions that CAN name a sanctioned way forward
// were converted to typed report findings, so the old prefix is a vocabulary this path no longer
// speaks. The pin moves ONTO the conversion rather than being loosened off it — the classification is
// named on stderr AND carried on the envelope, and the exit stays non-success: transport for an
// output-blind caller, not a verdict.
//
// DELIBERATELY NOT PINNED HERE: that the envelope's `result` token is not `refuse` — the one
// distinction a converted stop draws against a KEEP guard. This edition's sink-merge emits
// `result: 'refuse'` on this path while announcing the finding and carrying the converted prose, so
// the stop describes itself as a report on stderr and as a refusal on stdout. That contradiction is
// production, not test staleness, and pinning EITHER token here would freeze half of a half-finished
// conversion. See the report; the canonical sink emits `result: 'report', status: 'not_merged'`.
{
  const sinkScript = path.join(__dirname, 'kaola-gitea-workflow-sink-merge.js');
  const { root, branch } = setupRepoWithLiveFolderOnBranch('live-folder-gt-test', 'test-gt-live-folder');
  const result = spawnSync(process.execPath, [sinkScript, '--project', 'test-gt-live-folder', '--branch', branch], {
    cwd: root,
    env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' },
    encoding: 'utf8'
  });
  assert(result.status === 1, `live-folder guard test: expected exit 1, got ${result.status}. stderr: ${result.stderr}`);
  assert(/^sink-merge: FINDING run_not_finalized:/m.test(result.stderr || ''),
    `live-folder guard test: the finding must be announced by classification on stderr, got: ${result.stderr}`);
  const liveOut = JSON.parse(result.stdout.trim().split('\n').filter(Boolean).pop());
  assert(liveOut && liveOut.reason === 'run_not_finalized',
    `live-folder guard test: the envelope must classify the stop, got: ${JSON.stringify(liveOut)}`);
  assert(Array.isArray(liveOut.findings) && liveOut.findings.some(f => f.classification === 'run_not_finalized'),
    `live-folder guard test: findings[] must carry a run_not_finalized finding, got: ${JSON.stringify(liveOut.findings)}`);
  const liveFinding = liveOut.findings.find(f => f.classification === 'run_not_finalized');
  assert(typeof liveFinding.operator_hint === 'string' && liveFinding.operator_hint.trim().length > 0,
    `live-folder guard test: the finding must name a way forward, got: ${JSON.stringify(liveFinding.operator_hint)}`);
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
  G.exec(root, ['worktree', 'add', wtPath, branch], { encoding: 'utf8' });
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
  G.exec(root, ['worktree', 'remove', '--force', wtPath], { encoding: 'utf8' });
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
    G.exec(mainRoot, ['worktree', 'add', '-b', 'workflow/test-kw-proj', wtPath, 'main'], { encoding: 'utf8' });
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
    seedAdaptiveFinalizeFixture(wtPath, 'test-kw-proj');
    G.exec(wtPath, ['add', 'kaola-workflow/'], { encoding: 'utf8' });
    G.exec(wtPath, ['commit', '-m', 'chore: finalize test-kw-proj'], { encoding: 'utf8' });
    // Also set up main worktree with the live folder
    const mainProjDir = path.join(mainRoot, 'kaola-workflow', 'test-kw-proj');
    fs.mkdirSync(mainProjDir, { recursive: true });
    fs.writeFileSync(path.join(mainProjDir, 'workflow-state.md'), fs.readFileSync(path.join(projDir, 'workflow-state.md'), 'utf8'));
    seedAdaptiveFinalizeFixture(mainRoot, 'test-kw-proj');
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
    const lsTree = G.exec(mainRoot, ['ls-tree', '--name-only', '-r', 'workflow/test-kw-proj'], { encoding: 'utf8' });
    assert(!lsTree.includes('kaola-workflow/test-kw-proj/'),
      'feature branch HEAD must not have live folder after finalize --keep-worktree, got:\n' + lsTree);
    // #832: the archive resolves against MAIN's project root regardless of invocation cwd, so it
    // is NOT on the feature branch — the sink's own archive_commit step lands it on main. Writing
    // it into the linked worktree is exactly the destination the sink then deletes.
    assert(!lsTree.includes('kaola-workflow/archive/test-kw-proj/'),
      'feature branch HEAD must NOT carry the archive — it resolves against MAIN (#832), got:\n' + lsTree);
    assert(fs.existsSync(path.join(mainRoot, 'kaola-workflow', 'archive', 'test-kw-proj', 'workflow-state.md')),
      '#832: main must hold the archive after finalize --keep-worktree');
    console.log('finalize --keep-worktree commits archive rename (Gitea): PASSED');
  } finally {
    try { G.exec(mainRoot, ['worktree', 'remove', '--force', wtPath], { encoding: 'utf8' }); } catch (_) {}
    fs.rmSync(mainRoot, { recursive: true, force: true });
    fs.rmSync(kwRoot, { recursive: true, force: true });
  }
}

// Test 22 — NARROWED (was the #300 attestation probe). It asserted
// closure_receipt.claim_planner_attested resolved to 'missing' rather than the 'failed' default,
// which pinned checkDispatchAttestations running inside postMergeCleanup. That probe is gone with
// its mechanism: the shared closure contract dropped the field and this edition's sink-merge dropped
// the call, so the receipt carries no attestation key for either value to land in. Asserting a value
// for it would mean re-adding the field to satisfy a suite.
//
// What is KEPT is the property the retirement itself created, and it is not incidental: calling the
// retired export threw AFTER the merge had already landed on the default branch, so the sink
// advanced main and then died reporting exit 1. So a REAL end-to-end sink-merge with no dispatch-log
// present must reach exit 0 with a parseable envelope — plus the reappearance guard for BOTH retired
// attestation fields, the one direction a live mechanism can still regress in.
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
      'post-retirement sink-merge must reach exit 0 with no dispatch-log present, got ' + result.status +
      '. stderr: ' + result.stderr);
    const lastLine = result.stdout.trim().split('\n').filter(Boolean).pop();
    const parsed = JSON.parse(lastLine);
    assert.ok(!('claim_planner_attested' in parsed.closure_receipt),
      'the retired planner attestation field must not reappear on the closure receipt, got: ' +
      JSON.stringify(Object.keys(parsed.closure_receipt)));
    assert.ok(!('finalize_contractor_attested' in parsed.closure_receipt),
      '#816: the retired finalize-seam attestation field must not be emitted');
    console.log('sink-merge completes exit 0 carrying neither retired attestation field: PASSED');
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
      const branchHead = G.exec(root, ['rev-parse', branch], { encoding: 'utf8' }).trim();
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
    G.execRaw(['init', '--bare', '-b', 'main', remotePath], { encoding: 'utf8' });
    G.exec(root, ['remote', 'add', 'origin', remotePath], { encoding: 'utf8' });
    G.exec(root, ['push', '-u', 'origin', 'main'], { encoding: 'utf8' });
    G.exec(root, ['push', '-u', 'origin', branch], { encoding: 'utf8' });
    G.exec(root, ['branch', '--set-upstream-to=origin/' + branch, branch], { encoding: 'utf8' });
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
      G.exec(root, ['worktree', 'add', wt, branch], { encoding: 'utf8' });
      const before = G.exec(root, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
      const r = spawnSync(process.execPath, [sinkScript, '--project', project, '--branch', branch, '--root', root], { cwd: root, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_WORKFLOW_FORCE_WT_STATUS_FAIL: '1' }, encoding: 'utf8' });
      assert.notStrictEqual(r.status, 0, '#496-gitea: an unprovable worktree-clean probe must refuse (fail closed), got status ' + r.status + '\nstderr: ' + r.stderr);
      assert.ok(/(could not|cannot) (be )?verif|unprovable/i.test(r.stderr || ''), '#496-gitea: refusal must name the unverifiable-clean cause, got: ' + r.stderr);
      assert.ok(fs.existsSync(wt), '#496-gitea: a probe-fault refusal must NOT remove the worktree');
      assert.strictEqual(G.exec(root, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), before, '#496-gitea: main must NOT advance on a probe-fault refusal');
    } finally {
      try { G.exec(root, ['worktree', 'remove', '--force', wt], { encoding: 'utf8' }); } catch (_) {}
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
      G.exec(root, ['worktree', 'add', wt, branch], { encoding: 'utf8' });
      const before = G.exec(root, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
      const r = spawnSync(process.execPath, [sinkScript, '--project', project, '--branch', branch, '--root', root], { cwd: root, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_WORKFLOW_FORCE_WT_LIST_FAIL: '1' }, encoding: 'utf8' });
      assert.notStrictEqual(r.status, 0, '#506-gitea: an unprovable worktree-list probe must refuse (fail closed), got status ' + r.status + '\nstderr: ' + r.stderr);
      assert.ok(/worktree list|enumerate worktree/i.test(r.stderr || ''), '#506-gitea: refusal must name the worktree-list cause, got: ' + r.stderr);
      assert.ok(fs.existsSync(wt), '#506-gitea: a list-probe-fault refusal must NOT remove the worktree');
      assert.strictEqual(G.exec(root, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), before, '#506-gitea: main must NOT advance on a list-probe-fault refusal');
    } finally {
      try { G.exec(root, ['worktree', 'remove', '--force', wt], { encoding: 'utf8' }); } catch (_) {}
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
      G.execRaw(['init', '--bare', '-b', 'main', remote], { encoding: 'utf8' });
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
      G.execRaw(['init', '--bare', '-b', 'main', remote], { encoding: 'utf8' });
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
    const lsFiles = G.git(root, ['ls-files', 'kaola-workflow/archive/' + project + '/.cache/sink-receipt.json', 'kaola-workflow/archive/' + project + '/.cache/sink-fallback.json'], { encoding: 'utf8' }).stdout.trim();
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
    G.execRaw(['init', '--bare', '-b', 'main', remotePath], { encoding: 'utf8' });
    git('remote', 'add', 'origin', remotePath); git('push', '-u', 'origin', 'main');
    git('checkout', '-b', branch);
    fs.writeFileSync(path.join(root, 'feat.md'), 'feat'); git('add', '-A'); git('commit', '-m', 'feat: impl 9548');
    git('push', '-u', 'origin', branch);
    git('checkout', 'main');
    // Advance origin/main via a clone, then fetch so the local origin/main tracking ref moves ahead
    // → alreadyUpToDate is false in the --sink transaction (no Step-1 fetch on that path).
    G.execRaw(['clone', remotePath, clone], { encoding: 'utf8' });
    // The clone is a separate repo and inherits no identity under the hermetic HOME — give it one
    // (mirrors the `root` config above) so the concurrent-advance commit doesn't fail status 128.
    G.exec(clone, ['config', 'user.email', 't@t'], { encoding: 'utf8' });
    G.exec(clone, ['config', 'user.name', 't'], { encoding: 'utf8' });
    G.exec(clone, ['checkout', '-B', 'main', 'origin/main'], { encoding: 'utf8' });
    fs.writeFileSync(path.join(clone, 'concurrent.txt'), 'x');
    G.exec(clone, ['add', '-A'], { encoding: 'utf8' });
    G.exec(clone, ['commit', '-m', 'concurrent main advance'], { encoding: 'utf8' });
    G.exec(clone, ['push', 'origin', 'main'], { encoding: 'utf8' });
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
    G.execRaw(['init', '--bare', '-b', 'main', remote], { encoding: 'utf8' });
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
    G.exec(root620, ['worktree', 'add', '-b', branch620, '--', wtPath620, 'HEAD'], { encoding: 'utf8' });
    // Commit new work INSIDE the worktree — never merged into main.
    fs.writeFileSync(path.join(wtPath620, 'unmerged-feature.txt'), 'the only copy of this work\n');
    G.exec(wtPath620, ['add', '-A'], { encoding: 'utf8' });
    G.exec(wtPath620, ['commit', '-m', 'feat: unmerged work'], { encoding: 'utf8' });
    const unmergedTip620 = G.exec(wtPath620, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

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
      G.exec(root620, ['rev-parse', '--verify', '--quiet', 'refs/heads/' + branch620], { stdio: ['ignore', 'pipe', 'ignore'] });
      branchSurvived620 = true;
    } catch (_) {}
    try {
      G.exec(root620, ['cat-file', '-e', unmergedTip620], { stdio: ['ignore', 'ignore', 'ignore'] });
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
    const staleBranchHead631 = G.exec(root631, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    git631('checkout', 'main');

    fs.writeFileSync(path.join(root631, 'published.txt'), 'landed');
    git631('add', '-A');
    git631('commit', '-m', 'feat: published');
    const publishedHead631 = G.exec(root631, ['rev-parse', 'main'], { encoding: 'utf8' }).trim();
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

// --- #707: a worktree-postured sink must archive the worktree's untracked .cache evidence -------
//
// DELETED: (b) — "an evidence-empty live folder whose ## Node Ledger proves recorded evidence must
// refuse node_evidence_missing". That refusal derived its required-evidence set from the ledger:
// every `complete` row implied a `.cache/<id>.md`. The ledger is gone and nothing declares a
// required set, so the refusal has no producer. What replaced it is a different property with a
// different fixture shape (an archive move must not LOSE a file), and it is pinned where it lives.
{
  const sinkScript707 = path.join(__dirname, 'kaola-gitea-workflow-sink-merge.js');
  // A run-plan document, present so the run folder has the shape a real run leaves behind. Its
  // CONTENT is inert: the sink names `workflow-plan.md` only as one entry in its untracked
  // project-state dirt bucket and never parses it.
  const runPlanDoc707 = (note) =>
    ['# Workflow Plan', '', note || 'fixture plan — content is not read by the sink.', ''].join('\n');
  const mkFixture707 = (project) => {
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
    fs.writeFileSync(path.join(liveDir, 'workflow-plan.md'), runPlanDoc707('worktree-postured run'));
    fs.writeFileSync(path.join(root, 'DELIVERABLE.txt'), 'deliverable');
    git('add', '-A'); git('commit', '-m', 'feat: deliverable + live state');
    git('checkout', 'main');
    const wtPath = path.join(root, '.kw', 'worktrees', project);
    G.exec(root, ['worktree', 'add', wtPath, branch], { encoding: 'utf8' });
    const wtCache = path.join(wtPath, 'kaola-workflow', project, '.cache');
    fs.mkdirSync(wtCache, { recursive: true });
    fs.writeFileSync(path.join(wtCache, 'run-evidence.md'), 'worktree evidence\n');
    return { root, branch };
  };
  const runSink707 = (root, branch, project) => spawnSync(process.execPath,
    [sinkScript707, '--branch', branch, '--project', project, '--issue', '707', '--sink', '--json'],
    { cwd: root, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
  const parseLast707 = (out) => { try { return JSON.parse(String(out || '').trim().split('\n').pop()); } catch (_) { return {}; } };

  // (a) worktree-postured: the worktree's untracked evidence lands in the archive + at HEAD.
  {
    const project = 'issue-97071';
    const { root, branch } = mkFixture707(project);
    try {
      const r = runSink707(root, branch, project);
      const p = parseLast707(r.stdout);
      assert.strictEqual(p.status, 'sinked', '#707-gitea-a: sink must complete, got ' + JSON.stringify(p) + '\nstderr: ' + r.stderr);
      assert.strictEqual(r.status, 0, '#707-gitea-a: sink must exit 0, got ' + r.status);
      const archRel = (p.receipt && p.receipt.archive_dest) || ('kaola-workflow/archive/' + project);
      assert.ok(fs.existsSync(path.join(root, archRel, '.cache', 'run-evidence.md')),
        '#707-gitea-a: the worktree .cache evidence must be archived, archive .cache holds: '
        + JSON.stringify((() => { try { return fs.readdirSync(path.join(root, archRel, '.cache')); } catch (_) { return '<none>'; } })()));
      let committed = false;
      try { committed = G.exec(root, ['cat-file', '-t', 'HEAD:' + archRel + '/.cache/run-evidence.md'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() === 'blob'; } catch (_) {}
      assert.ok(committed, '#707-gitea-a: the archived evidence must be committed at HEAD');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  console.log('Gitea #707 worktree-evidence archive test passed');
}

// --- #746: a live folder that recorded nothing must not be classified as an archive refusal ------
//
// DELETED: (a) — "an archive refusal whose signal is a snapshot_error REASON rather than a file
// list (empty missing[]) must fail the sink LOUDLY". Its fixture built a schema-2 epoch envelope —
// claim identity, claim-root base, epoch lineage, a stored plan_hash over a `## Nodes` /
// `## Node Ledger` pair, and a derived task mirror — for one purpose: to make
// verifyCurrentEpochAuthority return state_ledger_progress_invalid with an empty missing[]. Epochs,
// the re-plan CAS machinery and the ledger are gone, so that refusal has no producer left.
//
// (b) survives, but NOT as the over-tighten guard it was named for. That guard was about the
// `snapshot_error` allowlist (BENIGN_ARCHIVE_SKIP_REASONS = {'state_missing'}), and the arm that
// reads `archiveResult.snapshot_error` is now unreachable: nothing assigns that field any more,
// since its producers were the epoch/plan-authority checks deleted with (a). Every surviving
// mention across claim.js and sink-merge.js is a read.
//
// What (b) still discriminates is the OTHER refusal arm, `evidenceLosing` (`missing.length > 0`):
// a folder holding only journal residue recorded nothing an archive could lose, and must not be
// treated as a folder that LOST something. Mutation-proved — making archiveProjectDir return
// `{archive_incomplete: true, missing: ['workflow-state.md']}` when the state file is absent
// turns this green into an exit-1 `archive_refusal`.
{
  const sinkScript746 = path.join(__dirname, 'kaola-gitea-workflow-sink-merge.js');
  const mkJournalOnlyFixture746 = (project) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gitea-746b-'));
    const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });
    const branch = 'workflow/' + project;
    git('init', '-b', 'main'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
    fs.writeFileSync(path.join(root, 'base.txt'), 'base'); git('add', '-A'); git('commit', '-m', 'base');
    git('checkout', '-b', branch);
    const liveDir = path.join(root, 'kaola-workflow', project, '.cache');
    fs.mkdirSync(liveDir, { recursive: true });
    fs.writeFileSync(path.join(liveDir, 'notes.md'), 'journal residue only — no workflow-state.md\n');
    fs.writeFileSync(path.join(root, 'DELIVERABLE.txt'), 'deliverable');
    git('add', '-A'); git('commit', '-m', 'feat: deliverable + journal-only folder');
    git('checkout', 'main');
    return { root, branch };
  };
  const runSink746 = (root, branch, project, issue) => spawnSync(process.execPath,
    [sinkScript746, '--branch', branch, '--project', project, '--issue', String(issue), '--sink', '--json'],
    { cwd: root, env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8' });
  const parseLast746 = (out) => { try { return JSON.parse(String(out || '').trim().split('\n').pop()); } catch (_) { return {}; } };

  // (b) a journal-only live dir recorded nothing an archive could lose: skipped, still sinks.
  {
    const project = 'issue-97462';
    const { root, branch } = mkJournalOnlyFixture746(project);
    try {
      const r = runSink746(root, branch, project, 97462);
      const p = parseLast746(r.stdout);
      assert.strictEqual(r.status, 0, '#746-gitea-b: the benign journal-only shape must still exit 0, got ' + r.status + '\nstdout: ' + r.stdout + '\nstderr: ' + r.stderr);
      assert.strictEqual(p.status, 'sinked', '#746-gitea-b: the benign journal-only shape must still reach status:sinked, got ' + JSON.stringify(p));
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  console.log('Gitea #746 journal-only live dir is skipped, not classified evidence-losing');
}

// --- #901: a consumer's basename `.cache/` rule must not clip the run evidence out of the archive --
//
// The archive-band case (`kaola-workflow/archive/`) was already covered, and it is a DIFFERENT
// question at a different granularity. A basename rule leaves the archive DIRECTORY un-ignored
// (check-ignore exits 1) while covering every evidence file beneath it, so this port's dir probe
// answered "not ignored", the honest-skip arm never fired, `git add <archive>/` exited 1 with git's
// ignore report while STILL staging the non-ignored siblings, and both add sites sat inside
// `catch (_) {}`. Measured on this port: exit 0, status:sinked, steps.archive_commit:"done", an
// archive commit carrying 3 of 8 files, and archived_paths naming the 3 survivors as the whole set.
//
// Two things make these pins the ones that could have caught it, and each edition needs its own —
// there is no cross-edition coverage comparison, so a canonical pin does not defend this file:
//   1. the fixture's rule is exactly `.cache/`. Every existing .gitignore fixture in this suite and
//      both forge walkthroughs writes the archive band, an ANCHORED `/.cache/` (root-only), or
//      `kaola-workflow/` wholesale — none of which matches an archive .cache subtree.
//   2. every durability clause reads `git ls-tree`, never the disk. The lost files were on disk the
//      whole time, so an fs.existsSync pin passes against the broken port.
// KAOLA_WORKFLOW_OFFLINE is set to '0' EXPLICITLY rather than inherited: an inherited '1' disables
// the push/clone half and would silently retire the durability half of the check.
{
  const sinkScript901 = path.join(__dirname, 'kaola-gitea-workflow-sink-merge.js');
  // The five run-evidence files #901 names as lost. Content is inert — what matters is that each is a
  // regular FILE the archive holds on disk, and therefore a file the archive commit owes.
  const cacheEvidence901 = {
    'final-validation.md': '# Final Validation\n\nall four chains green\n',
    'doc-updater.md': '# Doc Updater\n\nREADME + CHANGELOG updated\n',
    'doc-docking.md': '# Doc Docking\n\ndocked into docs/api.md\n',
    'run-gaps-manual.md': '# Run Gaps (manual)\n\nnone\n',
    'run-gaps.json': '{"gaps":[]}\n',
  };
  const evidenceRel901 = (archiveRel) =>
    Object.keys(cacheEvidence901).map(n => archiveRel + '/.cache/' + n).sort();
  const liveState901 = (project, issue) => ['# Kaola-Workflow State', '',
    '## Project', 'name: ' + project, 'status: closed', '',
    '## Current Position', 'phase: adaptive', 'runtime: claude', 'step: start', '',
    '## Last Updated', new Date().toISOString(), '', '## Sink',
    'branch: workflow/' + project, 'issue_number: ' + issue, 'sink: merge', 'run_posture: in-place',
    'main_root: (test)', 'session_marker: test-session', 'claim_ts: ' + new Date().toISOString()].join('\n') + '\n';
  const roadmapSource901 = (issue) => ['issue: #' + issue, 'title: Test issue ' + issue,
    'status: active', 'workflow_project: sink-test', 'next_step: TBD'].join('\n') + '\n';
  const roadmapMirror901 = (issue) => '# Kaola-Workflow Roadmap\n\n| Issue | Title | Status | Project'
    + ' | Next Step |\n|---|---|---|---|---|\n| #' + issue + ' | Test issue ' + issue
    + ' | active | sink-test | TBD |\n';

  // The STATEFUL tea mock this suite already relies on (see the #619 post-probe note at Test 17b):
  // `issues view` reports open until a matching `issues close` has been logged. A constant response
  // makes the sink's post-close probe bucket a real close as failed.
  const writeTeaMock901 = (mockPath, logFile, number) => {
    fs.writeFileSync(mockPath, [
      "const fs = require('fs');",
      "const a = process.argv.slice(2).join(' ');",
      'const logFile = ' + JSON.stringify(logFile) + ';',
      "function log(m){ try { fs.appendFileSync(logFile, m + '\\n'); } catch (_) {} }",
      "function closed(){ try { return fs.readFileSync(logFile, 'utf8').split('\\n').some(function (l) { return l === 'CLOSE'; }); } catch (_) { return false; } }",
      "log('CALL: ' + a);",
      "if (a.startsWith('issues view')) { process.stdout.write(JSON.stringify({ number: " + number + ", state: closed() ? 'closed' : 'open' }) + '\\n'); process.exit(0); }",
      "if (a.startsWith('issues close')) { log('CLOSE'); process.stdout.write(JSON.stringify({ number: " + number + ", state: 'closed' }) + '\\n'); process.exit(0); }",
      "if (a.startsWith('issues edit')) { process.stdout.write(JSON.stringify({ number: " + number + ", state: 'closed', labels: [] }) + '\\n'); process.exit(0); }",
      "if (a.startsWith('api')) { process.stdout.write('{\"id\":9005}\\n'); process.exit(0); }",
      "process.stdout.write('{}\\n'); process.exit(0);",
    ].join('\n'));
  };

  // The keep-worktree posture: receipt.archive_dest stays UNSET, the archive already sits on MAIN's
  // disk (untracked, because the consumer's rule covers part of it), and the branch carries only the
  // deliverable. `gitignoreBody` is the ONE axis between the legs below.
  //   cacheOverride — replaces the five-file evidence set. A name may contain `/` (its parent is
  //     created) and may carry leading/trailing whitespace or an embedded newline; those are legal
  //     pathname bytes and the whitespace pin turns on them.
  //   symlinks — { <name>: <target> }, created after the regular files so a link may point at one.
  const mkFixture901 = (project, issue, gitignoreBody, cacheOverride, symlinks) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-901-'));
    const remote = root + '-remote';
    const mockScript = root + '-tea-mock.js';
    const logFile = root + '-tea-calls.log';
    const branch = 'workflow/' + project;
    const git = (...a) => G.exec(root, a, { encoding: 'utf8' });
    git('init', '-b', 'main'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
    fs.writeFileSync(path.join(root, 'README.md'), 'fixture\n'); git('add', '-A'); git('commit', '-m', 'init');
    G.execRaw(['init', '--bare', '-b', 'main', remote], { encoding: 'utf8' });
    git('remote', 'add', 'origin', remote); git('push', '-u', 'origin', 'main');
    writeTeaMock901(mockScript, logFile, issue);

    fs.writeFileSync(path.join(root, '.gitignore'), gitignoreBody);
    fs.mkdirSync(path.join(root, 'kaola-workflow', '.roadmap'), { recursive: true });
    fs.writeFileSync(path.join(root, 'kaola-workflow', '.roadmap', 'issue-' + issue + '.md'), roadmapSource901(issue));
    fs.writeFileSync(path.join(root, 'kaola-workflow', 'ROADMAP.md'), roadmapMirror901(issue));
    git('add', '-A'); git('commit', '-m', 'chore: roadmap + gitignore'); git('push', 'origin', 'main');

    git('checkout', '-b', branch);
    fs.writeFileSync(path.join(root, 'DELIVERABLE.txt'), 'deliverable\n');
    git('add', '-A'); git('commit', '-m', 'feat: deliverable');
    git('push', '-u', 'origin', branch); git('checkout', 'main');

    const archiveDir = path.join(root, 'kaola-workflow', 'archive', project);
    fs.mkdirSync(path.join(archiveDir, '.cache'), { recursive: true });
    fs.writeFileSync(path.join(archiveDir, 'workflow-state.md'), liveState901(project, issue));
    fs.writeFileSync(path.join(archiveDir, 'mission-list.md'), '# Mission list\n\n- item: do the thing\n  status: done\n');
    fs.writeFileSync(path.join(archiveDir, 'finalization-summary.md'), '# Finalization Summary\n\nARCHIVED AFTER FINAL GIT GATE\n');
    const entries = cacheOverride || cacheEvidence901;
    for (const n of Object.keys(entries)) {
      const dest = path.join(archiveDir, '.cache', n);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, entries[n]);
    }
    for (const n of Object.keys(symlinks || {})) fs.symlinkSync(symlinks[n], path.join(archiveDir, '.cache', n));
    return { root, remote, mockScript, logFile, branch, project, archiveDir };
  };

  // The sole-archiver posture: the run folder is LIVE on the branch (its .cache force-added, so the
  // consumer's own rule cannot make preflight the axis), and this sink archives it itself — which is
  // what sets receipt.archive_dest and makes the #700 completeness guard live.
  const mkSoleFixture901 = (project, issue, gitignoreBody) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-901s-'));
    const remote = root + '-remote';
    const mockScript = root + '-tea-mock.js';
    const logFile = root + '-tea-calls.log';
    const branch = 'workflow/' + project;
    const git = (...a) => G.exec(root, a, { encoding: 'utf8' });
    git('init', '-b', 'main'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
    fs.writeFileSync(path.join(root, 'README.md'), 'fixture\n'); git('add', '-A'); git('commit', '-m', 'init');
    G.execRaw(['init', '--bare', '-b', 'main', remote], { encoding: 'utf8' });
    git('remote', 'add', 'origin', remote); git('push', '-u', 'origin', 'main');
    writeTeaMock901(mockScript, logFile, issue);

    fs.writeFileSync(path.join(root, '.gitignore'), gitignoreBody);
    fs.mkdirSync(path.join(root, 'kaola-workflow', '.roadmap'), { recursive: true });
    fs.writeFileSync(path.join(root, 'kaola-workflow', '.roadmap', 'issue-' + issue + '.md'), roadmapSource901(issue));
    fs.writeFileSync(path.join(root, 'kaola-workflow', 'ROADMAP.md'), roadmapMirror901(issue));
    git('add', '-A'); git('commit', '-m', 'chore: roadmap + gitignore'); git('push', 'origin', 'main');

    git('checkout', '-b', branch);
    const liveDir = path.join(root, 'kaola-workflow', project);
    fs.mkdirSync(path.join(liveDir, '.cache'), { recursive: true });
    fs.writeFileSync(path.join(liveDir, 'workflow-state.md'), liveState901(project, issue).replace('status: closed', 'status: active'));
    fs.writeFileSync(path.join(liveDir, 'mission-list.md'), '# Mission list\n\n- item: do the thing\n  status: done\n');
    fs.writeFileSync(path.join(liveDir, 'finalization-summary.md'), '# Finalization Summary\n\nREADY FOR FINAL GIT GATE\n');
    for (const n of Object.keys(cacheEvidence901)) fs.writeFileSync(path.join(liveDir, '.cache', n), cacheEvidence901[n]);
    fs.writeFileSync(path.join(root, 'DELIVERABLE.txt'), 'deliverable\n');
    git('add', '-A');
    git('add', '-f', '--', 'kaola-workflow/' + project + '/.cache/');
    git('commit', '-m', 'feat: deliverable + live state');
    git('push', '-u', 'origin', branch); git('checkout', 'main');
    return { root, remote, mockScript, logFile, branch, project };
  };

  // The measured properties are the process's OWN exit code and its emitted envelope, so the CLI
  // boundary is where they live.
  // spawn-class: cli-contract
  const runSink901 = (fx) => spawnSync(process.execPath,
    [sinkScript901, '--branch', fx.branch, '--project', fx.project, '--issue', String(fx.issue || 901), '--sink', '--json'],
    {
      cwd: fx.root, encoding: 'utf8', timeout: 180000,
      // OFFLINE '0' is EXPLICIT, never inherited — an inherited '1' skips the push and would retire
      // the fresh-clone half of every durability clause below without failing anything.
      env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_WORKFLOW_SKIP_TESTGATE: '1', KAOLA_TEA_MOCK_SCRIPT: fx.mockScript },
    });
  const parseLast901 = (out) => {
    const ls = String(out || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
    try { return JSON.parse(ls[ls.length - 1]); } catch (_) { return {}; }
  };
  // `ls-tree -r` enumerates BLOBS, never directories — the one probe that separates "the archive
  // directory reached the commit" (which a partial commit also satisfies) from "this file is durably
  // in it". Entries rather than names, so the MODE is available: a symlink is a 120000 blob, and
  // asserting only that a path exists would not distinguish it from a regular file.
  //
  // NUL-split ONLY — never `.trim()`. That normalization is the whole reason `-z` was chosen: git
  // emits no trailing newline here, so trimming destroys leading/trailing whitespace that is
  // genuinely part of a pathname. Trimming a `-z` stream in the SINK is what made a run permanently
  // unsinkable, and this reader had the identical bug — it trimmed the space out of an observed blob
  // path while the expected name kept it, which would have made the whitespace pin below red against
  // a correct port.
  const treeEntriesUnder901 = (cwd, ref, pathspec) => {
    const r = G.git(cwd, ['ls-tree', '-r', '-z', ref, '--', pathspec], { encoding: 'utf8' });
    if (r.status !== 0) return [];
    return String(r.stdout || '').split('\0').filter(Boolean).map((rec) => {
      const tab = rec.indexOf('\t');
      const meta = (tab < 0 ? rec : rec.slice(0, tab)).split(' ');
      return { mode: meta[0], type: meta[1], sha: meta[2], path: tab < 0 ? '' : rec.slice(tab + 1) };
    });
  };
  const blobsUnder901 = (cwd, ref, pathspec) =>
    treeEntriesUnder901(cwd, ref, pathspec).map(e => e.path).filter(Boolean);
  const pathsInCommit901 = (cwd, sha) => {
    const r = G.git(cwd, ['diff-tree', '--no-commit-id', '-r', '-z', '--name-only', sha], { encoding: 'utf8' });
    if (r.status !== 0) return [];
    return String(r.stdout || '').split('\0').filter(Boolean);
  };
  const archiveCommitOf901 = (cwd, project) => {
    const subject = 'chore: archive ' + project + ' [sink]';
    const r = G.git(cwd, ['log', '--format=%H%x1f%s'], { encoding: 'utf8' });
    if (r.status !== 0) return null;
    for (const line of String(r.stdout || '').split('\n')) {
      const i = line.indexOf('\x1f');
      if (i > 0 && line.slice(i + 1) === subject) return line.slice(0, i);
    }
    return null;
  };
  const cleanup901 = (fx) => {
    for (const p of [fx.root, fx.remote]) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) {} }
    for (const p of [fx.mockScript, fx.logFile]) { try { fs.rmSync(p, { force: true }); } catch (_) {} }
  };

  // (a) and (b) are held to ONE assertion set so the ignored leg and its control cannot end up
  // checked at different strengths. `expectForced` is the only difference, and it IS the axis.
  const assertEvidenceDurable901 = (fx, label, r, expectForced) => {
    const p = parseLast901(r.stdout);
    const archiveRel = 'kaola-workflow/archive/' + fx.project;
    const want = evidenceRel901(archiveRel);
    assert.strictEqual(r.status, 0, label + ': the sink must complete, got ' + r.status + '\nstdout: ' + r.stdout + '\nstderr: ' + r.stderr);
    assert.strictEqual(p.status, 'sinked', label + ': status must be sinked, got ' + JSON.stringify(p));
    // The token lives on steps.archive_commit; receipt.archive_commit is UNDEFINED in this posture,
    // so asserting that field instead would pass against anything.
    assert.strictEqual(p.receipt && p.receipt.steps && p.receipt.steps.archive_commit, 'done',
      label + ': steps.archive_commit must be "done", got ' + JSON.stringify(p.receipt && p.receipt.steps));

    const blobs = blobsUnder901(fx.root, 'HEAD', archiveRel);
    assert.deepStrictEqual(want.filter(x => !blobs.includes(x)), [],
      label + ': every archived .cache evidence file must be a BLOB at HEAD (on-disk presence is what'
      + ' the broken port already satisfied); blobs under ' + archiveRel + ': ' + JSON.stringify(blobs));

    const sha = archiveCommitOf901(fx.root, fx.project);
    assert.ok(sha, label + ': the archive commit must exist (no "chore: archive ' + fx.project + ' [sink]" subject in git log)');
    const inCommit = pathsInCommit901(fx.root, sha).filter(x => x.startsWith(archiveRel + '/'));
    assert.strictEqual(inCommit.length, 8, label + ': the archive commit must carry all 8 archive files,'
      + ' not the 3 non-ignored survivors, got ' + inCommit.length + ': ' + JSON.stringify(inCommit));

    const named = (p.receipt && p.receipt.archived_paths) || [];
    assert.deepStrictEqual(want.filter(x => !named.includes(x)), [],
      label + ': archived_paths must name every evidence file the commit carries — it becomes the'
      + ' durable ## Sink Findings record, got ' + JSON.stringify(named));

    // "Durable" is a claim about a fresh clone, so make a fresh clone the witness.
    const cloneDir = fx.root + '-clone';
    try {
      G.clone(fx.remote, cloneDir, ['-q'], { encoding: 'utf8' });
      const cloned = blobsUnder901(cloneDir, 'HEAD', archiveRel);
      assert.deepStrictEqual(want.filter(x => !cloned.includes(x)), [],
        label + ': the evidence must survive a fresh clone of the pushed remote, the clone carries '
        + JSON.stringify(cloned));
    } finally { try { fs.rmSync(cloneDir, { recursive: true, force: true }); } catch (_) {} }

    // #520 under the force-add — the ONE new way a transaction journal could leak into a commit.
    const forced = p.receipt && p.receipt.archive_forced_paths;
    assert.ok(!(forced || []).some(x => /\/sink-(?:receipt|fallback)\.json$/.test(x)),
      label + ': #520 — archive_forced_paths must never name a transaction journal, got ' + JSON.stringify(forced));
    const trackedJournals = String(G.git(fx.root, ['ls-files', '--', '*/sink-receipt.json', '*/sink-fallback.json'], { encoding: 'utf8' }).stdout || '').trim();
    assert.strictEqual(trackedJournals, '', label + ': #520 — no sink journal may be tracked after the archive commit, got ' + trackedJournals);

    if (expectForced) {
      assert.deepStrictEqual((forced || []).slice().sort(), want,
        label + ': archive_forced_paths must name exactly the ignored evidence files — overriding a'
        + ' rule the consumer wrote is recorded, never silent, got ' + JSON.stringify(forced));
    } else {
      assert.strictEqual(forced, undefined,
        label + ': nothing here is ignored, so no path may be force-added at all, got ' + JSON.stringify(forced));
    }
  };

  // (a) the defect: the basename rule.
  {
    const project = 'issue-98011';
    const fx = mkFixture901(project, 98011, '.cache/\n'); fx.issue = 98011;
    try {
      // Precondition — the granularity mismatch is genuinely present, else the leg could pass for
      // the wrong reason (a rule that matched nothing at all).
      assert.strictEqual(G.git(fx.root, ['check-ignore', '-q', '--', 'kaola-workflow/archive/' + project], { encoding: 'utf8' }).status, 1,
        '#901-gitea-a: precondition — a basename rule must leave the archive DIRECTORY un-ignored');
      assert.strictEqual(G.git(fx.root, ['check-ignore', '-q', '--', 'kaola-workflow/archive/' + project + '/.cache/run-gaps.json'], { encoding: 'utf8' }).status, 0,
        '#901-gitea-a: precondition — the same rule must cover a FILE beneath the archive');
      assertEvidenceDurable901(fx, '#901-gitea-a IGNORED', runSink901(fx), true);
    } finally { cleanup901(fx); }
  }

  // (b) the single-axis control: an irrelevant rule changes nothing and forces nothing.
  {
    const project = 'issue-98012';
    const fx = mkFixture901(project, 98012, 'node_modules/\n'); fx.issue = 98012;
    try {
      assert.strictEqual(G.git(fx.root, ['check-ignore', '-q', '--', 'kaola-workflow/archive/' + project + '/.cache/run-gaps.json'], { encoding: 'utf8' }).status, 1,
        '#901-gitea-b: precondition — the control rule must cover nothing under the archive');
      assertEvidenceDurable901(fx, '#901-gitea-b CONTROL', runSink901(fx), false);
    } finally { cleanup901(fx); }
  }

  // (c) the archive-BAND decision is preserved, and sharpened: force-add and honest-skip are
  // mutually exclusive. A band rule is a consumer saying "no tracked archives at all", so overriding
  // it would be the opposite of honoring it — and nothing pinned that they stay exclusive.
  {
    const project = 'issue-98013';
    const fx = mkFixture901(project, 98013, 'kaola-workflow/archive/\n'); fx.issue = 98013;
    try {
      const r = runSink901(fx);
      const p = parseLast901(r.stdout);
      const archiveRel = 'kaola-workflow/archive/' + project;
      assert.strictEqual(r.status, 0, '#901-gitea-c: the honest skip must still complete, got ' + r.status + '\nstdout: ' + r.stdout + '\nstderr: ' + r.stderr);
      assert.strictEqual(p.status, 'sinked', '#901-gitea-c: status must be sinked, got ' + JSON.stringify(p));
      assert.strictEqual(p.receipt && p.receipt.archive_commit, 'skipped_gitignored',
        '#901-gitea-c: a band rule must still record skipped_gitignored, got ' + JSON.stringify(p.receipt && p.receipt.archive_commit));
      assert.strictEqual(p.receipt && p.receipt.archive_forced_paths, undefined,
        '#901-gitea-c: the force-add must be DECLINED when the rule covers the whole band, got ' + JSON.stringify(p.receipt && p.receipt.archive_forced_paths));
      assert.deepStrictEqual(blobsUnder901(fx.root, 'HEAD', archiveRel), [],
        '#901-gitea-c: nothing under the ignored archive may reach HEAD');
      // What the skip GAINED is the inventory: every required file it leaves uncommitted, named.
      // "Announced" was already true; itemized was not.
      const missing = (p.receipt && p.receipt.archive_missing_paths) || [];
      assert.strictEqual(missing.length, 8, '#901-gitea-c: the skip must itemize all 8 uncommitted required files, got ' + JSON.stringify(missing));
      assert.deepStrictEqual(evidenceRel901(archiveRel).filter(x => !missing.includes(x)), [],
        '#901-gitea-c: the itemized list must name the .cache evidence, got ' + JSON.stringify(missing));
      // ...and it still does not destroy the archive it declined to commit.
      for (const n of Object.keys(cacheEvidence901)) {
        assert.ok(fs.existsSync(path.join(fx.archiveDir, '.cache', n)),
          '#901-gitea-c: the on-disk archive must survive an honest skip, ' + n + ' is gone');
      }
    } finally { cleanup901(fx); }
  }

  // (d) the armed-gate pin. A happy path cannot tell the per-path blob verdict from a no-op — it is
  // green either way once the force-add works. Break the force-add on ONE required file and the gate
  // has to be the thing that speaks.
  {
    const project = 'issue-98014';
    const fx = mkFixture901(project, 98014, '.cache/\n'); fx.issue = 98014;
    const blocked = path.join(fx.archiveDir, '.cache', 'run-gaps.json');
    try {
      // The ONE axis versus (a): a required file git cannot index. Verified in-fixture rather than
      // assumed — a chmod that silently did not take turns this into a second happy path.
      fs.chmodSync(blocked, 0o000);
      let stillReadable = true;
      try { fs.readFileSync(blocked); } catch (_) { stillReadable = false; }
      assert.ok(!stillReadable,
        '#901-gitea-d: arming axis — the required file must be genuinely unreadable, else this leg proves nothing');
      const r = runSink901(fx);
      const p = parseLast901(r.stdout);
      const archiveRel = 'kaola-workflow/archive/' + project;

      assert.strictEqual(r.status, 1, '#901-gitea-d: a partially committed archive must exit 1, got ' + r.status + '\nstdout: ' + r.stdout + '\nstderr: ' + r.stderr);
      assert.strictEqual(p.result, 'refuse', '#901-gitea-d: must emit result:refuse, got ' + JSON.stringify(p));
      assert.strictEqual(p.reason, 'sink_incomplete', '#901-gitea-d: must refuse under sink_incomplete, got ' + JSON.stringify(p));
      assert.strictEqual(p.step, 'archive_commit', '#901-gitea-d: the refusal must name the archive_commit step, got ' + JSON.stringify(p));
      assert.notStrictEqual(p.status, 'sinked', '#901-gitea-d: status must NOT be sinked over an archive the commit does not carry');
      assert.deepStrictEqual(evidenceRel901(archiveRel).filter(x => !(p.archive_missing_paths || []).includes(x)), [],
        '#901-gitea-d: archive_missing_paths must name EVERY required path absent from the commit — a count is not a diagnosis, got '
        + JSON.stringify(p.archive_missing_paths));
      // The signal `catch (_) {}` used to throw away. It is the only evidence git ever produced.
      assert.ok(Array.isArray(p.archive_add_errors) && p.archive_add_errors.some(e => /git add/.test(String(e))),
        '#901-gitea-d: the swallowed git add failure must reach archive_add_errors, got ' + JSON.stringify(p.archive_add_errors));

      // A refusal envelope carries no `receipt` key, so the durable record is the surviving journal —
      // the refusal returns before the #653 disposal precisely so it survives.
      const journal = path.join(fx.archiveDir, '.cache', 'sink-receipt.json');
      assert.ok(fs.existsSync(journal), '#901-gitea-d: the refusal must leave its journal on disk at ' + journal);
      let persisted = null;
      try { persisted = JSON.parse(fs.readFileSync(journal, 'utf8')); } catch (_) { persisted = null; }
      assert.notStrictEqual(persisted && persisted.steps && persisted.steps.archive_commit, 'done',
        '#901-gitea-d: steps.archive_commit must be left NOT done so a re-run retries it, got ' + JSON.stringify(persisted && persisted.steps));
      assert.strictEqual(persisted && persisted.archive_commit, 'failed',
        '#901-gitea-d: the journal must record archive_commit:"failed", got ' + JSON.stringify(persisted && persisted.archive_commit));
      // #520 stays subtracted even here: that journal is on disk under the archive .cache and IS
      // covered by the consumer's rule, and must be neither demanded of the commit nor tracked. This
      // is the leg where that is observable rather than vacuous — a successful sink disposes of its
      // journal before anything can look.
      assert.ok(!(p.archive_missing_paths || []).some(x => /sink-(?:receipt|fallback)\.json$/.test(x)),
        '#901-gitea-d: #520 — a transaction journal must never be demanded of the archive commit, got ' + JSON.stringify(p.archive_missing_paths));

      // The refusal destroys nothing recoverable: it returns BEFORE teardown.
      assert.strictEqual(G.git(fx.root, ['rev-parse', '--verify', fx.branch], { encoding: 'utf8' }).status, 0,
        '#901-gitea-d: the feature branch must be RETAINED by the refusal');
      for (const n of Object.keys(cacheEvidence901)) {
        assert.ok(fs.existsSync(path.join(fx.archiveDir, '.cache', n)),
          '#901-gitea-d: the on-disk archive must survive the refusal, ' + n + ' is gone');
      }
    } finally {
      try { fs.chmodSync(blocked, 0o644); } catch (_) {}
      cleanup901(fx);
    }
  }

  // (e) the OTHER archiver posture. (a)–(d) run with receipt.archive_dest unset, where the #700
  // completeness guard is dormant; here this sink archives the folder itself, the dest IS set and
  // that guard is live — and the port lost the same files anyway, because a partially committed
  // archive still yields a `tree` for cat-file. The live evidence is branch-tracked here, so the
  // pre-fix commit stages the DELETION of the live copies without adding the archive ones.
  {
    const project = 'issue-98015';
    const fx = mkSoleFixture901(project, 98015, '.cache/\n'); fx.issue = 98015;
    try {
      const r = runSink901(fx);
      const p = parseLast901(r.stdout);
      assert.strictEqual(r.status, 0, '#901-gitea-e: the sink must complete, got ' + r.status + '\nstdout: ' + r.stdout + '\nstderr: ' + r.stderr);
      assert.strictEqual(p.status, 'sinked', '#901-gitea-e: status must be sinked, got ' + JSON.stringify(p));
      const archRel = p.receipt && p.receipt.archive_dest;
      assert.ok(typeof archRel === 'string' && archRel.length > 0,
        '#901-gitea-e: precondition — this posture must record an archive_dest, which is what makes the #700 completeness guard live, got ' + JSON.stringify(archRel));
      const want = evidenceRel901(archRel);
      const blobs = blobsUnder901(fx.root, 'HEAD', archRel);
      assert.deepStrictEqual(want.filter(x => !blobs.includes(x)), [],
        '#901-gitea-e: every .cache evidence file must be a BLOB at HEAD under ' + archRel + ', blobs: ' + JSON.stringify(blobs));
      const named = (p.receipt && p.receipt.archived_paths) || [];
      assert.deepStrictEqual(want.filter(x => !named.includes(x)), [],
        '#901-gitea-e: archived_paths must name the evidence it committed, got ' + JSON.stringify(named));
      assert.deepStrictEqual(((p.receipt && p.receipt.archive_forced_paths) || []).slice().sort(), want,
        '#901-gitea-e: archive_forced_paths must name exactly the ignored evidence files, got ' + JSON.stringify(p.receipt && p.receipt.archive_forced_paths));
      // The archive move RENAMED tracked live paths, so a commit that adds the archive copies without
      // the matching deletions (or the reverse) leaves main dirty after status:sinked.
      const st = String(G.git(fx.root, ['status', '--porcelain'], { encoding: 'utf8' }).stdout || '').trim();
      assert.strictEqual(st, '', '#901-gitea-e: main must be clean after status:sinked, got:\n' + st);
    } finally { cleanup901(fx); }
  }


  // (f) The repair the guard exists to perform must actually REACH the file it refuses over. `-z` was
  // chosen so a pathname is never mangled, and then its output was `.trim()`ed — while the required set
  // is built from readdirSync, which preserves the name exactly. So an archive file named `notes.md `
  // (one trailing space) could never match the ignored-untracked set, was never force-added, and was
  // then refused over: three consecutive re-runs produced the identical `sink_incomplete`. A refusal
  // that says "a re-run retries it" over a deterministic computation is a bricked repository.
  //
  // The failure mode was OVER-refusal, so the naive fix weakens the guard until it stops firing. The
  // non-regression shapes therefore ride in the SAME fixture rather than a separate green run:
  // non-ASCII, an embedded newline, a nested directory and a 0-byte file all have to land as blobs too.
  {
    const project = 'issue-98016';
    const names = {
      'plain.md': 'plain evidence\n',
      'notes.md ': 'trailing space in the NAME, not the content\n',
      'ünïcödé-日本.md': 'non-ASCII name\n',
      'a\nb.md': 'embedded newline in the name\n',
      'deep/x.md': 'nested evidence\n',
      'zero.md': '',
    };
    const fx = mkFixture901(project, 98016, '.cache/\n', names); fx.issue = 98016;
    const archiveRel = 'kaola-workflow/archive/' + project;
    const want = Object.keys(names).map(n => archiveRel + '/.cache/' + n).sort();
    try {
      // Preconditions — the space really is on disk, and git really does report it raw under `-z`. A
      // fixture whose filesystem silently normalized the name would make the whole leg vacuous.
      assert.ok(fs.readdirSync(path.join(fx.archiveDir, '.cache')).includes('notes.md '),
        '#901-gitea-f: precondition — the space-bearing name must exist on disk verbatim, got '
        + JSON.stringify(fs.readdirSync(path.join(fx.archiveDir, '.cache'))));
      const ignoredRaw = String(G.git(fx.root, ['ls-files', '-o', '-i', '--exclude-standard', '-z', '--', archiveRel], { encoding: 'utf8' }).stdout || '');
      assert.ok(ignoredRaw.split('\0').filter(Boolean).includes(archiveRel + '/.cache/notes.md '),
        '#901-gitea-f: precondition — git must report the ignored path with its space intact under -z, got '
        + JSON.stringify(ignoredRaw.split('\0').filter(Boolean)));

      const r = runSink901(fx);
      const p = parseLast901(r.stdout);

      // CONVERGENCE: the first run must suffice. The defect was not that the sink failed once, it is
      // that it could never succeed. (A second --sink on an already-sinked fixture exits 1 at
      // push_upstream for reasons that predate this and are identical for plain names, so re-running
      // here would measure that instead and is deliberately not asserted.)
      assert.strictEqual(r.status, 0, '#901-gitea-f: the sink must converge on the FIRST run, got ' + r.status
        + '\nstdout: ' + r.stdout + '\nstderr: ' + r.stderr);
      assert.strictEqual(p.status, 'sinked', '#901-gitea-f: status must be sinked, got ' + JSON.stringify(p));
      assert.strictEqual(p.receipt && p.receipt.archive_missing_paths, undefined,
        '#901-gitea-f: nothing may be reported missing — the over-refusal is what this pins, got '
        + JSON.stringify(p.receipt && p.receipt.archive_missing_paths));

      // ...and every name, the space-bearing one included, is a BLOB in the published commit. Read
      // through ls-tree -z with NUL-split only: an assertion that trimmed its own input could not tell
      // "the space survived" from "the space was lost".
      const blobs = blobsUnder901(fx.root, 'HEAD', archiveRel);
      assert.deepStrictEqual(want.filter(x => !blobs.includes(x)), [],
        '#901-gitea-f: every archived evidence name must be a BLOB at HEAD, blobs: ' + JSON.stringify(blobs));

      // The force-add must NAME the space-bearing path with its space — that set is what the trim
      // mismatch emptied, and it is the direct measurement that the repair reached the file.
      const forced = (p.receipt && p.receipt.archive_forced_paths) || [];
      assert.ok(forced.includes(archiveRel + '/.cache/notes.md '),
        '#901-gitea-f: archive_forced_paths must name the space-bearing path verbatim, got ' + JSON.stringify(forced));
      assert.deepStrictEqual(forced.slice().sort(), want,
        '#901-gitea-f: archive_forced_paths must name exactly the ignored evidence set, got ' + JSON.stringify(forced));
      assert.ok(!forced.some(x => /\/sink-(?:receipt|fallback)\.json$/.test(x)),
        '#901-gitea-f: #520 — no journal may be force-added, got ' + JSON.stringify(forced));
    } finally { cleanup901(fx); }
  }

  // (g) A symlink in the archive. The exclusion that produced this rested on an in-comment claim that
  // neither a symlink nor its target becomes a blob under the archive path — and that claim is false:
  // `git add -f` stages a symlink as a mode-120000 blob whose content is the target string. So a
  // gitignored symlink was dropped from the required set, nothing forced it in, nothing missed it, and
  // the run reported steps.archive_commit:"done" at exit 0 over an entry a fresh clone did not carry.
  //
  // `steps.archive_commit === 'done'` is therefore USELESS as the pin here — the bug already satisfied
  // it — and so is anything that reads the run's own working tree, where the symlink was present the
  // whole time. What separates the two is the published commit and a clone made from it.
  {
    const project = 'issue-98017';
    const fx = mkFixture901(project, 98017, '.cache/\n', { 'plain.md': 'plain evidence\n' }, { 'link.md': 'plain.md' });
    fx.issue = 98017;
    const archiveRel = 'kaola-workflow/archive/' + project;
    const linkRel = archiveRel + '/.cache/link.md';
    try {
      assert.ok(fs.lstatSync(path.join(fx.archiveDir, '.cache', 'link.md')).isSymbolicLink(),
        '#901-gitea-g: precondition — the fixture entry must be a symlink');
      assert.strictEqual(G.git(fx.root, ['check-ignore', '-q', '--', linkRel], { encoding: 'utf8' }).status, 0,
        '#901-gitea-g: precondition — the consumer rule must cover the symlink, else nothing needs forcing');

      const r = runSink901(fx);
      const p = parseLast901(r.stdout);
      assert.strictEqual(r.status, 0, '#901-gitea-g: the sink must complete, got ' + r.status
        + '\nstdout: ' + r.stdout + '\nstderr: ' + r.stderr);
      assert.strictEqual(p.status, 'sinked', '#901-gitea-g: status must be sinked, got ' + JSON.stringify(p));

      // THE pin, half one: the symlink is an entry in the published commit, at mode 120000. Asserting
      // mere path presence would not distinguish a symlink from a regular file, and the mode is the
      // measured fact the false comment denied.
      const entries = treeEntriesUnder901(fx.root, 'HEAD', archiveRel);
      const linkEntry = entries.find(e => e.path === linkRel) || null;
      assert.ok(linkEntry, '#901-gitea-g: the symlink must be an entry in the commit at HEAD, entries: '
        + JSON.stringify(entries.map(e => e.mode + ' ' + e.path)));
      // Read defensively throughout: when the symlink is absent from the commit — the defect's own
      // shape — every later clause must still report as an assertion rather than abort before the
      // fresh-clone clause, which is the one that matters most, gets to run.
      assert.strictEqual(linkEntry && linkEntry.mode, '120000',
        '#901-gitea-g: the symlink must be recorded as a 120000 blob, got ' + JSON.stringify(linkEntry));
      assert.ok(((p.receipt && p.receipt.archive_forced_paths) || []).includes(linkRel),
        '#901-gitea-g: archive_forced_paths must name the force-added symlink, got '
        + JSON.stringify(p.receipt && p.receipt.archive_forced_paths));

      // THE pin, half two: a FRESH CLONE of the pushed remote holds it — as a symlink, pointing where
      // it pointed. This is the clause the defect failed while reporting success, and no probe of the
      // run's own tree can stand in for it.
      const cloneDir = fx.root + '-clone';
      try {
        G.clone(fx.remote, cloneDir, ['-q'], { encoding: 'utf8' });
        const clonedLink = path.join(cloneDir, linkRel);
        const clonedBlobs = blobsUnder901(cloneDir, 'HEAD', archiveRel);
        let isLink = false;
        let target = null;
        try { isLink = fs.lstatSync(clonedLink).isSymbolicLink(); } catch (_) { isLink = false; }
        try { target = fs.readlinkSync(clonedLink); } catch (_) { target = null; }
        assert.ok(isLink, '#901-gitea-g: the fresh clone must materialize it as a SYMLINK — this is the'
          + ' clause the defect failed while reporting archive_commit:"done" at exit 0; the clone holds '
          + JSON.stringify(clonedBlobs));
        assert.strictEqual(target, 'plain.md',
          '#901-gitea-g: the cloned symlink must point where it pointed, got ' + JSON.stringify(target));
        assert.ok(clonedBlobs.includes(linkRel),
          "#901-gitea-g: the clone's own HEAD must carry the symlink as a blob, got " + JSON.stringify(clonedBlobs));
      } finally { try { fs.rmSync(cloneDir, { recursive: true, force: true }); } catch (_) {} }
    } finally { cleanup901(fx); }
  }

  // (h) The cheapest guard against the exact regression, at the source level: this edition's `-z`
  // readers must stay NUL-split ONLY. A `.trim()` here is invisible to every behavioural test whose
  // fixtures use tidy filenames, which is precisely how it shipped — so the guard reads the bytes.
  // Scoped to THIS edition's own copies; there is no cross-edition coverage comparison here.
  {
    const readers901 = [
      ['kaola-gitea-workflow-sink-merge.js', 'ignoredUntrackedUnder'],
      ['kaola-gitea-workflow-sink-merge.js', 'blobPathsUnder'],
      ['kaola-gitea-workflow-claim.js', 'ignoredArchiveEvidence'],
    ];
    for (const [rel, fnName] of readers901) {
      const src = fs.readFileSync(path.join(__dirname, rel), 'utf8');
      const at = src.indexOf('function ' + fnName + '(');
      assert.ok(at >= 0, '#901-gitea-h: ' + rel + ' must still define ' + fnName
        + ' — if it was renamed or removed this pin is stale and belongs deleted with its mechanism, not repaired');
      // Whole-line comments dropped: these readers CARRY a comment explaining why a `.trim()` must
      // never come back, and a guard that matched its own rationale would fail on correct code.
      const next = src.indexOf('\nfunction ', at + 1);
      const code = src.slice(at, next < 0 ? src.length : next)
        .split('\n').filter(line => !/^\s*\/\//.test(line)).join('\n');
      // Stated as the required FORM rather than a blocklist: NUL-split, then drop empty records, with
      // nothing in between. Dropping empties is the only normalization the stream needs.
      assert.ok(/\.split\('\\0'\)\s*\.filter\(Boolean\)/.test(code),
        '#901-gitea-h: ' + fnName + ' in ' + rel + " must read its -z output as .split('\\0').filter(Boolean)"
        + ' with nothing between the two. Code:\n' + code);
      assert.ok(!/\.trim\(\)/.test(code),
        '#901-gitea-h: ' + fnName + ' in ' + rel + ' must NOT trim a -z record — trimming destroys the'
        + ' leading/trailing whitespace -z exists to preserve, and made a run permanently unsinkable. Code:\n' + code);
    }
  }

  console.log('Gitea #901 basename .cache/ rule must not clip archive evidence: PASSED');
}

// #912: sinkPreflight must assert a clean worktree the SAME way in every edition. The stated
// expectation, which all three editions are pinned against here and in their own suites:
//
//   every run goes through the guard. A dirty linked worktree refuses, and an unprobeable one
//   refuses too (fail closed) — assertWorktreeClean fails closed on a `git worktree list` probe
//   fault BEFORE it matches any branch, and "we could not verify" is never "there is nothing there".
//
// The fault is driven through the port's OWN KAOLA_WORKFLOW_FORCE_WT_LIST_FAIL hook, so what is
// exercised is the probe the shipped guard already runs, not an injected throw.
// KAOLA_WORKFLOW_SINK_ABORT_AFTER=preflight halts the transaction the instant the preflight step
// records `done`, so every arm below measures the preflight DECISION and nothing downstream of it.
{
  const sinkScript = path.join(__dirname, 'kaola-gitea-workflow-sink-merge.js');
  // The abort hook's exit code. It fires only AFTER a step records done, so reaching it is the
  // observation "preflight passed"; a preflight refusal exits 1 with a typed envelope instead.
  const PREFLIGHT_PASSED = 99;

  const state912 = (project, branch, issue) => [
    '# Kaola-Workflow State', '',
    '## Project', 'name: ' + project, 'status: active', '',
    '## Sink',
    'branch: ' + branch,
    'issue_number: ' + issue,
    'full_name: group/project',
    'project_html_url: https://gitea.example/group/project',
    'sink: merge', ''
  ].join('\n');

  const seedRepo912 = (label) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-912-' + label + '-'));
    const remote = root + '-remote';
    G.initBare(remote);
    G.init(root, { branch: 'main' });
    fs.writeFileSync(path.join(root, 'README.md'), 'fixture\n');
    G.gitOk(root, ['add', '-A']);
    G.gitOk(root, ['commit', '-m', 'init']);
    G.gitOk(root, ['remote', 'add', 'origin', remote]);
    G.gitOk(root, ['push', '-u', 'origin', 'main']);
    return { root, remote };
  };

  // BRANCHED: a real feature branch with a linked worktree checked out on it.
  const mkBranched912 = (label, project, issue, dirty) => {
    const { root, remote } = seedRepo912(label);
    const branch = 'workflow/' + project;
    G.gitOk(root, ['checkout', '-b', branch]);
    const dir = path.join(root, 'kaola-workflow', project);
    fs.mkdirSync(path.join(dir, '.cache'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'workflow-state.md'), state912(project, branch, issue));
    fs.writeFileSync(path.join(dir, 'finalization-summary.md'), '# Finalization\n\n## Final Validation\n\n- `npm test`: pass\n');
    fs.writeFileSync(path.join(root, 'FEATURE.txt'), 'feature\n');
    G.gitOk(root, ['add', '-A']);
    G.gitOk(root, ['commit', '-m', 'feat: deliverable']);
    G.gitOk(root, ['push', '-u', 'origin', branch]);
    G.gitOk(root, ['checkout', 'main']);
    const wt = root + '-linked-wt';
    G.gitOk(root, ['worktree', 'add', wt, branch]);
    if (dirty) fs.writeFileSync(path.join(wt, 'FEATURE.txt'), 'uncommitted edit\n');
    return { root, remote, wt, branch, project, issue };
  };

  const cleanup912 = (fx) => {
    if (fx.wt) { try { G.git(fx.root, ['worktree', 'remove', '--force', fx.wt]); } catch (_) {} }
    for (const p of [fx.root, fx.remote, fx.wt]) {
      if (!p) continue;
      try { fs.rmSync(p, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch (_) {}
    }
  };

  const preflight912 = (fx, extraEnv) => {
    const r = spawnSync(process.execPath,
      [sinkScript, '--branch', fx.branch, '--project', fx.project, '--issue', String(fx.issue), '--sink', '--json'],
      { cwd: fx.root, encoding: 'utf8', timeout: 90000,
        env: Object.assign({}, process.env, {
          KAOLA_WORKFLOW_OFFLINE: '1',
          KAOLA_WORKFLOW_SINK_ABORT_AFTER: 'preflight',
        }, extraEnv || {}) });
    let envelope = null;
    for (const line of String(r.stdout || '').split('\n')) {
      if (!line.trim().startsWith('{')) continue;
      try { envelope = JSON.parse(line); } catch (_) { /* not the envelope line */ }
    }
    // The reason is read off THIS run's own envelope, never off aggregated output: 'worktree_dirty'
    // appearing anywhere in a combined log is not the same fact as this preflight returning it.
    return { exit: r.status, envelope, reason: (envelope && envelope.reason) || null, stderr: r.stderr, stdout: r.stdout };
  };
  const seen912 = (r) => 'exit=' + r.exit + ' envelope=' + JSON.stringify(r.envelope)
    + '\nstderr: ' + String(r.stderr || '').slice(0, 600);

  // (b) The data-loss guard the fix must NOT weaken (#346/#496/#562): a real feature branch whose
  // linked worktree carries uncommitted work still refuses, and refuses with ZERO mutation.
  {
    const fx = mkBranched912('br-dirty', 'gt-912-dirty', 91203, true);
    try {
      const r = preflight912(fx);
      assert.strictEqual(r.reason, 'worktree_dirty',
        '#912-gitea (b): a branch-postured run whose linked worktree has uncommitted changes must STILL refuse '
        + 'worktree_dirty — the sink force-removes that worktree, so proceeding destroys the work. Got ' + seen912(r));
      assert.notStrictEqual(r.exit, 0,
        '#912-gitea (b): the dirty-worktree refusal must exit non-zero. Got ' + seen912(r));
      assert.ok(fs.existsSync(fx.wt),
        '#912-gitea (b): the refusal must leave the linked worktree in place (zero mutation)');
      assert.strictEqual(fs.readFileSync(path.join(fx.wt, 'FEATURE.txt'), 'utf8'), 'uncommitted edit\n',
        '#912-gitea (b): the refusal must leave the uncommitted file byte-intact');
    } finally { cleanup912(fx); }
  }

  // (c) The other half of (b): a branch-postured run with a CLEAN linked worktree proceeds.
  {
    const fx = mkBranched912('br-clean', 'gt-912-clean', 91202, false);
    try {
      const r = preflight912(fx);
      assert.strictEqual(r.reason, null,
        '#912-gitea (c): a branch-postured run with a clean linked worktree must not refuse. Got ' + seen912(r));
      assert.strictEqual(r.exit, PREFLIGHT_PASSED,
        '#912-gitea (c): a clean linked worktree must pass preflight. Got ' + seen912(r));
    } finally { cleanup912(fx); }
  }

  // (d) The counter-pin bounding the fix (#506): on a BRANCH-postured run the guard must still fail
  // CLOSED when the worktree-list probe faults, even though the worktree is clean — an unprobeable
  // worktree is "we could not verify", never "there is nothing there". Deleting the guard, or making
  // the probe fault swallowable, would satisfy (e) and break this.
  {
    const fx = mkBranched912('br-clean-fault', 'gt-912-failclosed', 91204, false);
    try {
      const r = preflight912(fx, { KAOLA_WORKFLOW_FORCE_WT_LIST_FAIL: '1' });
      assert.strictEqual(r.reason, 'worktree_dirty',
        '#912-gitea (d): a run whose worktree-list probe faults must STILL refuse worktree_dirty '
        + '(fail closed) — a transient enumeration fault is not evidence that there is no worktree to '
        + 'protect. Got ' + seen912(r));
      assert.ok(fs.existsSync(fx.wt),
        '#912-gitea (d): the fail-closed refusal must leave the linked worktree in place');
    } finally { cleanup912(fx); }
  }

  console.log('Gitea #912 sinkPreflight worktree-clean guard applies on the same runs as canonical: PASSED');
}

console.log('Gitea sink tests passed');
