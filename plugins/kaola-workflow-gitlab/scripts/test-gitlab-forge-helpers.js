#!/usr/bin/env node
'use strict';

const assert = require('assert');
const forge = require('./kaola-gitlab-forge');

function runner(calls, responses) {
  return function executable(bin, args) {
    calls.push([bin, args]);
    const key = args.join(' ');
    return Object.prototype.hasOwnProperty.call(responses, key) ? responses[key] : '';
  };
}

const issue = forge.normalizeIssue({
  id: 321,
  iid: 12,
  title: 'Port helpers',
  description: 'touches: plugins/kaola-workflow-gitlab/scripts',
  state: 'opened',
  labels: [{ name: forge.CLAIM_LABEL }, 'workflow:queued'],
  updated_at: '2026-05-18T00:00:00Z',
  web_url: 'https://gitlab.example/group/project/-/issues/12'
});
assert.strictEqual(issue.number, 12);
assert.strictEqual(issue.issue_iid, 12);
assert.strictEqual(issue.body, 'touches: plugins/kaola-workflow-gitlab/scripts');
assert.strictEqual(issue.state, 'open');
assert.strictEqual(issue.url, 'https://gitlab.example/group/project/-/issues/12');
assert.deepStrictEqual(issue.labels, [forge.CLAIM_LABEL, forge.QUEUED_LABEL]);
assert.deepStrictEqual(
  forge.preserveWorkflowLabels(issue.labels, ['triage']),
  ['triage', forge.QUEUED_LABEL, forge.CLAIM_LABEL]
);

const mr = forge.normalizeMergeRequest({
  id: 444,
  iid: 9,
  title: 'MR',
  state: 'merged',
  web_url: 'https://gitlab.example/group/project/-/merge_requests/9'
});
assert.strictEqual(mr.mr_iid, 9);
assert.strictEqual(mr.mr_url, 'https://gitlab.example/group/project/-/merge_requests/9');
assert.strictEqual(mr.state, 'merged');

const project = forge.normalizeProject({
  id: 77,
  path_with_namespace: 'group/project',
  web_url: 'https://gitlab.example/group/project'
});
assert.strictEqual(project.project_id, 77);
assert.strictEqual(forge.projectApiRef(project), '77');
assert.strictEqual(
  forge.projectApiRef({ path_with_namespace: 'group/sub project' }),
  'group%2Fsub%20project'
);

assert.strictEqual(forge.glabExec(['issue', 'list'], { offline: true, offlineStdout: '[]' }), '[]');

const calls = [];
const execFileSync = runner(calls, {
  'repo view --output json': JSON.stringify({
    id: 77,
    path_with_namespace: 'group/project',
    web_url: 'https://gitlab.example/group/project'
  }),
  'issue list --output json --per-page 100': JSON.stringify([{ iid: 4, state: 'opened' }]),
  'issue list --output json --per-page 50 --state opened': JSON.stringify([{ iid: 5, state: 'opened' }]),
  'issue list --output json --per-page 100 --state closed --label workflow:in-progress': JSON.stringify([{ iid: 7, state: 'closed' }]),
  'issue list --output json --per-page 100 --state closed --label workflow:in-progress --label workflow:queued': JSON.stringify([{ iid: 8, state: 'closed' }]),
  'issue view 4 --output json': JSON.stringify({ iid: 4, state: 'opened', title: 'View me' }),
  'issue update 4 --label workflow:in-progress --unlabel workflow:queued': JSON.stringify({
    iid: 4,
    state: 'opened',
    labels: [forge.CLAIM_LABEL]
  }),
  'issue close 4': JSON.stringify({ iid: 4, state: 'closed' }),
  'api --method POST projects/77/issues/4/notes -f body=claim': JSON.stringify({ id: 9001, body: 'claim' }),
  'api projects/77/issues/4/notes': JSON.stringify([{ id: 9001, body: 'claim', author: { username: 'kaola' } }]),
  'api --method PUT projects/77/issues/4/notes/9001 -f body=done': JSON.stringify({ id: 9001, body: 'done' }),
  'mr create --output json --source-branch feature --target-branch main --title Ship --description body': JSON.stringify({
    iid: 8,
    state: 'opened',
    web_url: 'https://gitlab.example/group/project/-/merge_requests/8'
  }),
  'mr view 8 --output json': JSON.stringify({ iid: 8, state: 'opened' }),
  'mr list --output json': JSON.stringify([{ iid: 8, state: 'opened' }]),
  'mr merge 9 --yes --auto-merge --squash --remove-source-branch --sha abc123': JSON.stringify({ iid: 9, state: 'merged' })
});

assert.strictEqual(forge.discoverProject({ execFileSync }).path_with_namespace, 'group/project');
assert.strictEqual(forge.listIssues({ execFileSync })[0].issue_iid, 4);
assert.strictEqual(forge.listIssues({ execFileSync, perPage: 50, state: 'opened' })[0].issue_iid, 5);
assert.strictEqual(forge.listIssues({ execFileSync, state: 'closed', labels: [forge.CLAIM_LABEL] })[0].issue_iid, 7);
assert.strictEqual(forge.listIssues({ execFileSync, state: 'closed', labels: [forge.CLAIM_LABEL, forge.QUEUED_LABEL] })[0].issue_iid, 8);
assert.strictEqual(forge.viewIssue(4, { execFileSync }).title, 'View me');
assert.deepStrictEqual(
  forge.updateIssue(4, {
    execFileSync,
    labels: [forge.CLAIM_LABEL],
    unlabels: [forge.QUEUED_LABEL]
  }).labels,
  [forge.CLAIM_LABEL]
);
assert.strictEqual(forge.closeIssue(4, { execFileSync }).state, 'closed');
assert.strictEqual(forge.createIssueNote(project, 4, 'claim', { execFileSync }).id, 9001);
assert.strictEqual(forge.listIssueNotes(project, 4, { execFileSync })[0].id, 9001);
assert.strictEqual(forge.updateIssueNote(project, 4, 9001, 'done', { execFileSync }).body, 'done');
assert.strictEqual(
  forge.createMergeRequest({
    execFileSync,
    sourceBranch: 'feature',
    targetBranch: 'main',
    title: 'Ship',
    description: 'body'
  }).mr_iid,
  8
);
assert.strictEqual(forge.viewMergeRequest(8, { execFileSync }).state, 'open');
assert.strictEqual(forge.listMergeRequests({ execFileSync })[0].mr_iid, 8);
assert.strictEqual(
  forge.mergeMergeRequest(9, {
    execFileSync,
    autoMerge: true,
    squash: true,
    removeSourceBranch: true,
    sha: 'abc123'
  }).state,
  'merged'
);

for (const call of calls) {
  assert.strictEqual(call[0], 'glab');
}

console.log('GitLab forge helper tests passed');
