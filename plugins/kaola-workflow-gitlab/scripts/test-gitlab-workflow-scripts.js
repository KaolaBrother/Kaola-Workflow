#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const forge = require('./kaola-gitlab-forge');
const active = require('./kaola-gitlab-workflow-active-folders');
const classifier = require('./kaola-gitlab-workflow-classifier');
const claim = require('./kaola-gitlab-workflow-claim');
const roadmap = require('./kaola-gitlab-workflow-roadmap');
const repair = require('./kaola-gitlab-workflow-repair-state');

const claimScript = path.join(__dirname, 'kaola-gitlab-workflow-claim.js');

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
  assert.strictEqual(result.verdict, 'green');
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
  assert.deepStrictEqual(claim.listOpenIssues().map(issue => issue.issue_iid), [7, 9]);
});

withForge({
  viewIssue(issueIid) {
    return { issue_iid: issueIid, number: issueIid, state: 'open', labels: [forge.CLAIM_LABEL], body: '' };
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
  const stateFile = path.join(root, 'kaola-workflow', 'mr-project', 'workflow-state.md');
  fs.writeFileSync(stateFile, fs.readFileSync(stateFile, 'utf8').replace('sink: merge', 'sink: mr'));
  const result = claim.watchMergeRequests(root, {});
  assert.strictEqual(result.watched, 1);
  assert(fs.existsSync(path.join(root, 'kaola-workflow', 'archive', 'mr-project', 'workflow-state.md')));
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

console.log('GitLab workflow script tests passed');
