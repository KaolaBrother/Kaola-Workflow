#!/usr/bin/env node
'use strict';

const assert = require('assert');
const forge = require('./kaola-gitea-forge');

function runner(calls, responses) {
  return function executable(bin, args) {
    calls.push([bin, args]);
    const key = args.join(' ');
    return Object.prototype.hasOwnProperty.call(responses, key) ? responses[key] : '';
  };
}

const issue = forge.normalizeIssue({
  id: 321,
  number: 12,
  title: 'Port helpers',
  body: 'touches: plugins/kaola-workflow-gitea/scripts',
  state: 'open',
  labels: [{ name: forge.CLAIM_LABEL }, 'workflow:queued'],
  updated_at: '2026-05-18T00:00:00Z',
  html_url: 'https://gitea.example/group/project/issues/12'
});
assert.strictEqual(issue.number, 12);
assert.strictEqual(issue.issue_iid, 12);
assert.strictEqual(issue.body, 'touches: plugins/kaola-workflow-gitea/scripts');
assert.strictEqual(issue.state, 'open');
assert.strictEqual(issue.url, 'https://gitea.example/group/project/issues/12');
assert.deepStrictEqual(issue.labels, [forge.CLAIM_LABEL, forge.QUEUED_LABEL]);
assert.deepStrictEqual(
  forge.preserveWorkflowLabels(issue.labels, ['triage']),
  ['triage', forge.QUEUED_LABEL, forge.CLAIM_LABEL]
);

const pr = forge.normalizePullRequest({
  id: 444,
  number: 9,
  title: 'PR',
  state: 'merged',
  html_url: 'https://gitea.example/group/project/pulls/9',
  head: { label: 'feature' },
  base: { label: 'main' }
});
assert.strictEqual(pr.pr_number, 9);
assert.strictEqual(pr.pr_url, 'https://gitea.example/group/project/pulls/9');
assert.strictEqual(pr.state, 'merged');
assert.strictEqual(pr.source_branch, 'feature');
assert.strictEqual(pr.target_branch, 'main');

const project = forge.normalizeProject({
  full_name: 'group/project',
  html_url: 'https://gitea.example/group/project',
  owner: { login: 'group' },
  name: 'project'
});
assert.strictEqual(project.owner, 'group');
assert.strictEqual(project.name, 'project');
assert.strictEqual(project.full_name, 'group/project');
assert.strictEqual(project.html_url, 'https://gitea.example/group/project');

assert.strictEqual(forge.teaExec(['issue', 'list'], { offline: true, offlineStdout: '[]' }), '[]');

const calls = [];
const execFileSync = runner(calls, {
  'repo view --output json': JSON.stringify({
    full_name: 'group/project',
    html_url: 'https://gitea.example/group/project',
    owner: { login: 'group' },
    name: 'project'
  }),
  'issues list --output json --limit 100': JSON.stringify([{ number: 4, state: 'open' }]),
  'issues list --output json --limit 50 --state open': JSON.stringify([{ number: 5, state: 'open' }]),
  'issues list --output json --limit 100 --state closed --labels=workflow:in-progress': JSON.stringify([{ number: 7, state: 'closed' }]),
  'issues view 4 --output json': JSON.stringify({ number: 4, state: 'open', title: 'View me' }),
  'issues edit 4 --add-labels=workflow:in-progress --remove-labels=workflow:queued': '',
  'issues close 4': JSON.stringify({ number: 4, state: 'closed' }),
  'api -X POST /api/v1/repos/group/project/issues/4/comments -d {"body":"claim"}': JSON.stringify({ id: 9001, body: 'claim' }),
  'api /api/v1/repos/group/project/issues/4/comments': JSON.stringify([{ id: 9001, body: 'claim' }]),
  'api -X PATCH /api/v1/repos/group/project/issues/comments/9001 -d {"body":"done"}': JSON.stringify({ id: 9001, body: 'done' }),
  'pr create --output json --head feature --base main --title Ship --description body': JSON.stringify({
    number: 8,
    state: 'open',
    html_url: 'https://gitea.example/group/project/pulls/8'
  }),
  'pr view 8 --output json': JSON.stringify({ number: 8, state: 'open' }),
  'pr list --output json': JSON.stringify([{ number: 8, state: 'open' }]),
  'api -X POST /api/v1/repos/group/project/pulls/9/merge -d {"Do":"squash","delete_branch_after_merge":true,"head_commit_id":"abc123"}': '{}',
  'api /api/v1/repos/group/project': JSON.stringify({
    full_name: 'group/project',
    allow_squash_merge: true
  }),
  'api /api/v1/repos/group/project/labels': JSON.stringify([]),
  'api -X POST /api/v1/repos/group/project/labels -d {"name":"workflow:in-progress","color":"#e11d48","description":""}': JSON.stringify({ id: 1, name: 'workflow:in-progress' })
});

assert.strictEqual(forge.discoverProject({ execFileSync }).full_name, 'group/project');
assert.strictEqual(forge.listIssues({ execFileSync })[0].issue_iid, 4);
assert.strictEqual(forge.listIssues({ execFileSync, perPage: 50, state: 'open' })[0].issue_iid, 5);
assert.strictEqual(forge.listIssues({ execFileSync, state: 'closed', labels: [forge.CLAIM_LABEL] })[0].issue_iid, 7);
assert.strictEqual(forge.viewIssue(4, { execFileSync }).title, 'View me');
// updateIssueLabels returns {} (tea issues edit may not emit JSON)
forge.updateIssueLabels(project, 4, {
  execFileSync,
  add: [forge.CLAIM_LABEL],
  remove: [forge.QUEUED_LABEL]
});
assert.strictEqual(forge.closeIssue(4, { execFileSync }).state, 'closed');
assert.strictEqual(forge.createIssueComment(project, 4, 'claim', { execFileSync }).id, 9001);
assert.strictEqual(forge.listIssueComments(project, 4, { execFileSync })[0].id, 9001);
assert.strictEqual(forge.updateIssueComment(project, 4, 9001, 'done', { execFileSync }).body, 'done');
assert.strictEqual(
  forge.createPullRequest({
    execFileSync,
    sourceBranch: 'feature',
    targetBranch: 'main',
    title: 'Ship',
    description: 'body'
  }).pr_number,
  8
);
assert.strictEqual(forge.viewPullRequest(8, { execFileSync }).state, 'open');
assert.strictEqual(forge.listPullRequests({ execFileSync })[0].pr_number, 8);
forge.mergePullRequest(project, 9, {
  execFileSync,
  squash: true,
  removeSourceBranch: true,
  sha: 'abc123'
});

// Test 1: checkRepoSquashEnabled directly — allow_squash_merge: true → no throw
forge.checkRepoSquashEnabled({ full_name: 'group/project' }, { execFileSync,
  offlineStdout: JSON.stringify({ allow_squash_merge: true }) });

// Test 2: checkRepoSquashEnabled directly — allow_squash_merge: false → throws
assert.throws(() => {
  forge.checkRepoSquashEnabled({ full_name: 'group/project' }, { execFileSync: runner([], {
    'api /api/v1/repos/group/project': JSON.stringify({ allow_squash_merge: false })
  })});
}, /allow_squash_merge=false/);

// Test 3: checkRepoSquashEnabled with absent allow_squash_merge → permissive (no throw)
forge.checkRepoSquashEnabled({ full_name: 'group/project' }, { execFileSync: runner([], {
  'api /api/v1/repos/group/project': JSON.stringify({ full_name: 'group/project' })
})});

// Test 4: mergePullRequest with squash:true and allow_squash_merge:false → throws
assert.throws(() => {
  forge.mergePullRequest({ full_name: 'group/project' }, 9, {
    squash: true,
    execFileSync: runner([], {
      'api /api/v1/repos/group/project': JSON.stringify({ allow_squash_merge: false }),
      'api -X POST /api/v1/repos/group/project/pulls/9/merge -d {"Do":"squash","delete_branch_after_merge":false}': '{}'
    })
  });
}, /allow_squash_merge=false/);

// ensureLabel: labels GET returns [], so POST is called
const newLabel = forge.ensureLabel(project, { name: 'workflow:in-progress', color: '#e11d48' }, { execFileSync });
assert.strictEqual(newLabel.name, 'workflow:in-progress');

for (const call of calls) {
  assert.strictEqual(call[0], 'tea');
}

// checkServerVersion: version field present and sufficient → no throw
forge.checkServerVersion({ offline: true, offlineStdout: JSON.stringify({ version: '1.21.0' }) });

// checkServerVersion: server_version fallback field → no throw
forge.checkServerVersion({ offline: true, offlineStdout: JSON.stringify({ server_version: '1.21.0' }) });

// checkServerVersion: version present but too old → throws
assert.throws(
  () => forge.checkServerVersion({ offline: true, offlineStdout: JSON.stringify({ version: '1.16.0' }) }),
  /Gitea server >= 1\.17 required/
);

// checkServerVersion: absent version fields → permissive, no throw
forge.checkServerVersion({ offline: true, offlineStdout: JSON.stringify({}) });

// mergePullRequest: basic merge (no sha) → exact body string
{
  const mergeCalls = [];
  const mergeExec = runner(mergeCalls, {
    'api -X POST /api/v1/repos/group/project/pulls/7/merge -d {"Do":"merge","delete_branch_after_merge":false}': '{}'
  });
  forge.mergePullRequest(project, 7, { execFileSync: mergeExec });
  const bodyArg = mergeCalls[mergeCalls.length - 1][1].slice(-1)[0];
  assert.strictEqual(bodyArg, '{"Do":"merge","delete_branch_after_merge":false}');
}

// mergePullRequest: squash + sha → exact body string including head_commit_id
{
  const squashCalls = [];
  const squashExec = runner(squashCalls, {
    'api /api/v1/repos/group/project': JSON.stringify({ allow_squash_merge: true }),
    'api -X POST /api/v1/repos/group/project/pulls/7/merge -d {"Do":"squash","delete_branch_after_merge":false,"head_commit_id":"abc123"}': '{}'
  });
  forge.mergePullRequest(project, 7, { execFileSync: squashExec, squash: true, sha: 'abc123' });
  const bodyArg = squashCalls[squashCalls.length - 1][1].slice(-1)[0];
  assert.strictEqual(bodyArg, '{"Do":"squash","delete_branch_after_merge":false,"head_commit_id":"abc123"}');
}

console.log('Gitea forge helper tests passed');

// ── deleteIssueComment: RED→GREEN (issue #278) ──────────────────────────────
// Test 1: forge.deleteIssueComment issues the correct DELETE call
{
  const deleteCalls = [];
  const deleteExec = runner(deleteCalls, {
    'api -X DELETE /api/v1/repos/group/project/issues/comments/9001': ''
  });
  const result = forge.deleteIssueComment(project, 4, 9001, { execFileSync: deleteExec });
  assert.deepStrictEqual(deleteCalls[0], ['tea', ['api', '-X', 'DELETE', '/api/v1/repos/group/project/issues/comments/9001']]);
  // DELETE returns empty body — result is the parsed fallback {}
  assert.deepStrictEqual(result, {});
}
console.log('deleteIssueComment: correct DELETE call — passed');

// ── clearAdvisoryClaim marker deletion: RED→GREEN (issue #278) ───────────────
{
  const claim = require('./kaola-gitea-workflow-claim');

  // Notes fixture for clearAdvisoryClaim tests
  const NOTES_FIXTURE = [
    { id: 101, body: '<!-- kw:claim project=issue-278 -->\nKaola-Workflow started local Gitea work for `issue-278`.' },
    { id: 102, body: '<!-- kw:claim project=issue-999 -->\nKaola-Workflow started local Gitea work for `issue-999`.' },
    { id: 103, body: 'Kaola-Workflow advisory claim cleared: old' },
    { id: 104, body: 'Just a regular comment' }
  ];

  const projectInfo = { full_name: 'group/project', html_url: 'https://gitea.example/group/project' };

  // Test 2: project-scoped marker is preferred — only issue-278 note deleted
  {
    const deletedIds = [];
    const origUpdateLabels = forge.updateIssueLabels;
    const origCreate = forge.createIssueComment;
    const origList = forge.listIssueComments;
    const origDelete = forge.deleteIssueComment;
    forge.updateIssueLabels = function() { return {}; };
    forge.createIssueComment = function() { return {}; };
    forge.listIssueComments = function() { return NOTES_FIXTURE; };
    forge.deleteIssueComment = function(proj, issueNum, commentId) { deletedIds.push(commentId); };
    try {
      claim.clearAdvisoryClaim(42, 'discarded', projectInfo, 'issue-278');
    } finally {
      forge.updateIssueLabels = origUpdateLabels;
      forge.createIssueComment = origCreate;
      forge.listIssueComments = origList;
      forge.deleteIssueComment = origDelete;
    }
    assert.deepStrictEqual(deletedIds, [101], 'project-scoped: only issue-278 marker deleted');
  }
  console.log('clearAdvisoryClaim: project-scoped match deletes only target marker — passed');

  // Test 3: generic regex fallback when slug is null
  {
    const deletedIds = [];
    const origUpdateLabels = forge.updateIssueLabels;
    const origCreate = forge.createIssueComment;
    const origList = forge.listIssueComments;
    const origDelete = forge.deleteIssueComment;
    forge.updateIssueLabels = function() { return {}; };
    forge.createIssueComment = function() { return {}; };
    forge.listIssueComments = function() { return NOTES_FIXTURE; };
    forge.deleteIssueComment = function(proj, issueNum, commentId) { deletedIds.push(commentId); };
    try {
      claim.clearAdvisoryClaim(42, 'discarded', projectInfo, null);
    } finally {
      forge.updateIssueLabels = origUpdateLabels;
      forge.createIssueComment = origCreate;
      forge.listIssueComments = origList;
      forge.deleteIssueComment = origDelete;
    }
    // Generic fallback: both project= markers deleted (101 and 102), not the others
    assert.deepStrictEqual(deletedIds.sort((a, b) => a - b), [101, 102], 'generic regex: all kw:claim project= markers deleted');
  }
  console.log('clearAdvisoryClaim: generic-regex fallback deletes all project= markers — passed');

  // Test 4: a live session from another project (non-marker note) is NOT deleted
  {
    const deletedIds = [];
    const origUpdateLabels = forge.updateIssueLabels;
    const origCreate = forge.createIssueComment;
    const origList = forge.listIssueComments;
    const origDelete = forge.deleteIssueComment;
    forge.updateIssueLabels = function() { return {}; };
    forge.createIssueComment = function() { return {}; };
    forge.listIssueComments = function() { return NOTES_FIXTURE; };
    forge.deleteIssueComment = function(proj, issueNum, commentId) { deletedIds.push(commentId); };
    try {
      claim.clearAdvisoryClaim(42, 'discarded', projectInfo, 'issue-278');
    } finally {
      forge.updateIssueLabels = origUpdateLabels;
      forge.createIssueComment = origCreate;
      forge.listIssueComments = origList;
      forge.deleteIssueComment = origDelete;
    }
    // id 103 (cleared note) and 104 (plain comment) must NOT be deleted
    assert.ok(!deletedIds.includes(103), 'cleared note not deleted');
    assert.ok(!deletedIds.includes(104), 'plain comment not deleted');
    // id 102 (issue-999 marker) must NOT be deleted when slug is known
    assert.ok(!deletedIds.includes(102), 'another project marker not deleted with known slug');
  }
  console.log('clearAdvisoryClaim: non-marker notes from other sessions not deleted — passed');

  // Test 5: OFFLINE mode — no network calls to deleteIssueComment
  {
    const deletedIds = [];
    process.env.KAOLA_WORKFLOW_OFFLINE = '1';
    // Bust claim module cache so OFFLINE is re-read
    delete require.cache[require.resolve('./kaola-gitea-workflow-claim')];
    const claimOffline = require('./kaola-gitea-workflow-claim');
    const origDelete = forge.deleteIssueComment;
    forge.deleteIssueComment = function(proj, issueNum, commentId) { deletedIds.push(commentId); };
    let offlineResult;
    try {
      offlineResult = claimOffline.clearAdvisoryClaim(42, 'discarded', projectInfo, 'issue-278');
    } finally {
      forge.deleteIssueComment = origDelete;
      delete process.env.KAOLA_WORKFLOW_OFFLINE;
      // Restore the non-offline module
      delete require.cache[require.resolve('./kaola-gitea-workflow-claim')];
    }
    assert.strictEqual(offlineResult, 'skipped_offline', 'OFFLINE returns skipped_offline');
    assert.deepStrictEqual(deletedIds, [], 'OFFLINE: no deleteIssueComment calls');
  }
  console.log('clearAdvisoryClaim: OFFLINE mode makes no network calls — passed');
}

console.log('All clearAdvisoryClaim marker-deletion tests passed');
