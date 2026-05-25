#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');

const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';
const CLAIM_LABEL = 'workflow:in-progress';
const QUEUED_LABEL = 'workflow:queued';

let _versionChecked = false;

function teaExec(args, opts) {
  if (!Array.isArray(args)) throw new Error('teaExec args must be an array');
  const options = opts || {};
  if (OFFLINE || options.offline) return options.offlineStdout || '';
  // Injected runner for tests — skip version check entirely
  if (options.execFileSync) {
    return options.execFileSync('tea', args, Object.assign({ encoding: 'utf8' }, options.execOptions || {})).trim();
  }
  // Env-var mock for subprocess tests (macOS shebang execution hang workaround)
  const mock = process.env.KAOLA_TEA_MOCK_SCRIPT;
  if (mock) return execFileSync(process.execPath, [mock, ...args], Object.assign({ encoding: 'utf8' }, options.execOptions || {})).trim();
  // First live call: validate tea version >= 0.9.2
  if (!_versionChecked) {
    const versionOut = execFileSync('tea', ['--version'], { encoding: 'utf8' });
    const match = versionOut.match(/(\d+)\.(\d+)\.(\d+)/);
    if (match) {
      const [, major, minor, patch] = match.map(Number);
      if (major < 0 || (major === 0 && minor < 9) || (major === 0 && minor === 9 && patch < 2)) {
        throw new Error('tea >= 0.9.2 is required');
      }
    }
    _versionChecked = true;
  }
  return execFileSync('tea', args, Object.assign({ encoding: 'utf8' }, options.execOptions || {})).trim();
}

function parseJson(raw, fallback) {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch (_) { return fallback; }
}

function firstNumber() {
  for (const value of arguments) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function labelsOf(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(label => {
    if (typeof label === 'string') return label;
    if (label && typeof label.name === 'string') return label.name;
    if (label && typeof label.title === 'string') return label.title;
    return '';
  }).filter(Boolean);
}

function uniqueLabels(raw) {
  return Array.from(new Set(labelsOf(raw)));
}

function preserveWorkflowLabels(currentLabels, nextLabels) {
  const current = uniqueLabels(currentLabels);
  const next = uniqueLabels(nextLabels);
  for (const label of [QUEUED_LABEL, CLAIM_LABEL]) {
    if (current.includes(label) && !next.includes(label)) next.push(label);
  }
  return next;
}

function normalizeState(raw) {
  const state = String(raw || '').toLowerCase();
  if (state === 'opened' || state === 'open') return 'open';
  if (state === 'closed') return 'closed';
  if (state === 'merged') return 'merged';
  return state || 'unknown';
}

function normalizeProject(raw) {
  const data = typeof raw === 'string' ? parseJson(raw, {}) : (raw || {});
  const owner = data.owner && data.owner.login
    ? data.owner.login
    : (data.full_name ? data.full_name.split('/')[0] : '');
  const name = data.name
    ? data.name
    : (data.full_name ? data.full_name.split('/')[1] : '');
  const full_name = data.full_name || (owner && name ? owner + '/' + name : '');
  return {
    owner,
    name,
    full_name,
    html_url: data.html_url || ''
  };
}

function discoverProject(opts) {
  const options = opts || {};
  const raw = teaExec(['repo', 'view', '--output', 'json'], options);
  const data = parseJson(raw, {});
  if (data.full_name) {
    return normalizeProject(data);
  }
  // Fallback: derive owner/repo from git remote
  const remoteUrl = require('child_process').execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
  const remoteMatch = remoteUrl.match(/[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (!remoteMatch) throw new Error('Cannot determine repository owner/repo from git remote');
  const owner = remoteMatch[1];
  const repo = remoteMatch[2];
  const repoRaw = teaExec(['api', '/api/v1/repos/' + owner + '/' + repo], options);
  return normalizeProject(parseJson(repoRaw, {}));
}

function normalizeIssue(raw) {
  const data = typeof raw === 'string' ? parseJson(raw, {}) : (raw || {});
  const number = firstNumber(data.number, data.iid);
  const webUrl = data.html_url || data.web_url || data.url || '';
  return {
    number,
    issue_iid: number,
    id: firstNumber(data.id),
    title: data.title || '',
    body: data.body || data.description || '',
    state: normalizeState(data.state),
    labels: labelsOf(data.labels),
    updated_at: data.updated_at || data.updated || '',
    web_url: webUrl,
    url: webUrl
  };
}

function normalizePullRequest(raw) {
  const data = typeof raw === 'string' ? parseJson(raw, {}) : (raw || {});
  const prNumber = firstNumber(data.number, data.iid);
  const webUrl = data.html_url || data.web_url || data.url || '';
  return {
    number: prNumber,
    pr_number: prNumber,
    id: firstNumber(data.id),
    title: data.title || '',
    state: normalizeState(data.state),
    web_url: webUrl,
    pr_url: webUrl,
    source_branch: (data.head && data.head.label) ? data.head.label : (data.source_branch || ''),
    target_branch: (data.base && data.base.label) ? data.base.label : (data.target_branch || '')
  };
}

function listIssues(opts) {
  const options = opts || {};
  const args = ['issues', 'list', '--output', 'json', '--limit', String(options.perPage || 100)];
  if (options.state) args.push('--state', options.state);
  // Pass --labels=<csv> matching the forge's existing --remove-labels=/--add-labels= idiom.
  const csv = (options.labels || []).join(',');
  if (csv) args.push('--labels=' + csv);
  const raw = teaExec(args, options);
  return parseJson(raw, []).map(normalizeIssue);
}

function viewIssue(issueNum, opts) {
  const raw = teaExec(['issues', 'view', String(issueNum), '--output', 'json'], opts || {});
  return normalizeIssue(parseJson(raw, {}));
}

function updateIssueLabels(project, issueNum, opts) {
  const options = opts || {};
  const args = ['issues', 'edit', String(issueNum)];
  if (options.add && options.add.length) args.push('--add-labels=' + options.add.join(','));
  if (options.remove && options.remove.length) args.push('--remove-labels=' + options.remove.join(','));
  const raw = teaExec(args, options);
  // tea issues edit may not emit JSON stdout — parseJson returns {} if it prints human-readable
  return parseJson(raw, {});
}

function closeIssue(issueNum, opts) {
  // no project param — mirrors GitLab adapter; tea resolves repo from cwd
  const options = opts || {};
  const raw = teaExec(['issues', 'close', String(issueNum)], options);
  return raw ? normalizeIssue(parseJson(raw, {})) : null;
}

function createIssueComment(project, issueNum, body, opts) {
  const options = opts || {};
  const raw = teaExec([
    'api', '-X', 'POST',
    '/api/v1/repos/' + project.full_name + '/issues/' + String(issueNum) + '/comments',
    '-d', JSON.stringify({ body })
  ], options);
  return parseJson(raw, {});
}

function listIssueComments(project, issueNum, opts) {
  const raw = teaExec([
    'api',
    '/api/v1/repos/' + project.full_name + '/issues/' + String(issueNum) + '/comments'
  ], opts || {});
  return parseJson(raw, []);
}

function updateIssueComment(project, issueNum, commentId, body, opts) {
  const options = opts || {};
  // Gitea PATCH comment endpoint omits the issue index — /issues/comments/{id} is correct per docs-lookup
  const raw = teaExec([
    'api', '-X', 'PATCH',
    '/api/v1/repos/' + project.full_name + '/issues/comments/' + String(commentId),
    '-d', JSON.stringify({ body })
  ], options);
  return parseJson(raw, {});
}

function createPullRequest(opts) {
  const options = opts || {};
  const args = ['pr', 'create', '--output', 'json'];
  if (options.sourceBranch) args.push('--head', options.sourceBranch);
  if (options.targetBranch) args.push('--base', options.targetBranch);
  if (options.title) args.push('--title', options.title);
  if (options.description) args.push('--description', options.description);
  const raw = teaExec(args, options);
  return normalizePullRequest(parseJson(raw, {}));
}

function viewPullRequest(prNumber, opts) {
  const raw = teaExec(['pr', 'view', String(prNumber), '--output', 'json'], opts || {});
  return normalizePullRequest(parseJson(raw, {}));
}

function listPullRequests(opts) {
  const options = opts || {};
  const raw = teaExec(['pr', 'list', '--output', 'json'], options);
  return parseJson(raw, []).map(normalizePullRequest);
}

function checkServerVersion(opts) {
  const raw = teaExec(['api', '/api/v1/version'], opts || {});
  const data = parseJson(raw, {});
  const versionStr = data.version || data.server_version || '';
  const match = versionStr.match(/(\d+)\.(\d+)/);
  if (match) {
    const minor = Number(match[2]);
    if (Number(match[1]) < 1 || (Number(match[1]) === 1 && minor < 17)) {
      throw new Error('Gitea server >= 1.17 required for auto-merge');
    }
  }
}

function checkRepoSquashEnabled(project, opts) {
  const raw = teaExec(['api', '/api/v1/repos/' + project.full_name], opts || {});
  const data = parseJson(raw, {});
  if (data.allow_squash_merge === false) {
    throw new Error('Gitea repo does not allow squash merges (allow_squash_merge=false)');
  }
}

function mergePullRequest(project, prNumber, opts) {
  const options = opts || {};
  if (options.autoMerge) checkServerVersion(options);
  if (options.squash) checkRepoSquashEnabled(project, options);
  const mergeBody = {};
  mergeBody.Do = options.squash ? 'squash' : 'merge';
  mergeBody.delete_branch_after_merge = !!options.removeSourceBranch;
  if (options.sha) mergeBody.head_commit_id = options.sha;
  const raw = teaExec([
    'api', '-X', 'POST',
    '/api/v1/repos/' + project.full_name + '/pulls/' + String(prNumber) + '/merge',
    '-d', JSON.stringify(mergeBody)
  ], options);
  return parseJson(raw, {});
}

function ensureLabel(project, labelDef, opts) {
  const options = opts || {};
  const raw = teaExec(['api', '/api/v1/repos/' + project.full_name + '/labels'], options);
  const labels = parseJson(raw, []);
  const existing = labels.find(item => item.name && item.name.toLowerCase() === labelDef.name.toLowerCase());
  if (existing) return existing;
  const labelBody = { name: labelDef.name, color: labelDef.color, description: labelDef.description || '' };
  const createRaw = teaExec([
    'api', '-X', 'POST',
    '/api/v1/repos/' + project.full_name + '/labels',
    '-d', JSON.stringify(labelBody)
  ], options);
  return parseJson(createRaw, {});
}

module.exports = {
  CLAIM_LABEL, QUEUED_LABEL,
  teaExec,
  labelsOf, uniqueLabels, preserveWorkflowLabels, normalizeState,
  normalizeProject, normalizeIssue, normalizePullRequest,
  discoverProject,
  listIssues, viewIssue, updateIssueLabels, closeIssue,
  createIssueComment, listIssueComments, updateIssueComment,
  createPullRequest, viewPullRequest, listPullRequests, checkServerVersion, checkRepoSquashEnabled, mergePullRequest,
  ensureLabel
};
