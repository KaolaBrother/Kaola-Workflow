#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');

const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';
const CLAIM_LABEL = 'workflow:in-progress';
const QUEUED_LABEL = 'workflow:queued';

function glabExec(args, opts) {
  if (!Array.isArray(args)) throw new Error('glabExec args must be an array');
  const options = opts || {};
  if (OFFLINE || options.offline) return options.offlineStdout || '';
  const runner = options.execFileSync || execFileSync;
  return runner('glab', args, Object.assign({ encoding: 'utf8' }, options.execOptions || {})).trim();
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
  const pathWithNamespace = data.path_with_namespace || data.full_path || data.fullPath || '';
  const projectId = firstNumber(data.id, data.project_id);
  return {
    project_id: projectId,
    id: projectId,
    path_with_namespace: pathWithNamespace,
    web_url: data.web_url || data.http_url_to_repo || data.webUrl || ''
  };
}

function projectApiRef(project) {
  const normalized = normalizeProject(project);
  if (normalized.project_id) return String(normalized.project_id);
  if (!normalized.path_with_namespace) throw new Error('GitLab project identity is required');
  return encodeURIComponent(normalized.path_with_namespace);
}

function discoverProject(opts) {
  const raw = glabExec(['repo', 'view', '--output', 'json'], opts || {});
  return normalizeProject(parseJson(raw, {}));
}

function normalizeIssue(raw) {
  const data = typeof raw === 'string' ? parseJson(raw, {}) : (raw || {});
  const issueIid = firstNumber(data.iid, data.issue_iid, data.number);
  return {
    number: issueIid,
    issue_iid: issueIid,
    id: firstNumber(data.id),
    title: data.title || '',
    state: normalizeState(data.state),
    labels: labelsOf(data.labels),
    web_url: data.web_url || data.webUrl || data.url || ''
  };
}

function normalizeMergeRequest(raw) {
  const data = typeof raw === 'string' ? parseJson(raw, {}) : (raw || {});
  const mrIid = firstNumber(data.iid, data.mr_iid, data.number);
  const webUrl = data.web_url || data.webUrl || data.url || '';
  return {
    number: mrIid,
    mr_iid: mrIid,
    id: firstNumber(data.id),
    title: data.title || '',
    state: normalizeState(data.state),
    web_url: webUrl,
    mr_url: webUrl,
    source_branch: data.source_branch || data.sourceBranch || '',
    target_branch: data.target_branch || data.targetBranch || ''
  };
}

function listIssues(opts) {
  const options = opts || {};
  const raw = glabExec(['issue', 'list', '--output', 'json', '--per-page', String(options.perPage || 100)], options);
  return parseJson(raw, []).map(normalizeIssue);
}

function viewIssue(issueIid, opts) {
  const raw = glabExec(['issue', 'view', String(issueIid), '--output', 'json'], opts || {});
  return normalizeIssue(parseJson(raw, {}));
}

function updateIssue(issueIid, opts) {
  const options = opts || {};
  const args = ['issue', 'update', String(issueIid)];
  for (const label of options.labels || []) args.push('--label', label);
  for (const label of options.unlabels || []) args.push('--unlabel', label);
  for (const assignee of options.assignees || []) args.push('--assignee', assignee);
  const raw = glabExec(args, options);
  return raw ? normalizeIssue(parseJson(raw, {})) : null;
}

function closeIssue(issueIid, opts) {
  const options = opts || {};
  const raw = glabExec(['issue', 'close', String(issueIid)], options);
  return raw ? normalizeIssue(parseJson(raw, {})) : null;
}

function createIssueNote(project, issueIid, body, opts) {
  const options = opts || {};
  const raw = glabExec([
    'api',
    '--method', 'POST',
    'projects/' + projectApiRef(project) + '/issues/' + String(issueIid) + '/notes',
    '-f', 'body=' + body
  ], options);
  return parseJson(raw, {});
}

function listIssueNotes(project, issueIid, opts) {
  const raw = glabExec([
    'api',
    'projects/' + projectApiRef(project) + '/issues/' + String(issueIid) + '/notes'
  ], opts || {});
  return parseJson(raw, []);
}

function updateIssueNote(project, issueIid, noteId, body, opts) {
  const options = opts || {};
  const raw = glabExec([
    'api',
    '--method', 'PUT',
    'projects/' + projectApiRef(project) + '/issues/' + String(issueIid) + '/notes/' + String(noteId),
    '-f', 'body=' + body
  ], options);
  return parseJson(raw, {});
}

function createMergeRequest(opts) {
  const options = opts || {};
  const args = ['mr', 'create', '--output', 'json'];
  if (options.sourceBranch) args.push('--source-branch', options.sourceBranch);
  if (options.targetBranch) args.push('--target-branch', options.targetBranch);
  if (options.title) args.push('--title', options.title);
  if (options.description) args.push('--description', options.description);
  const raw = glabExec(args, options);
  return normalizeMergeRequest(parseJson(raw, {}));
}

function viewMergeRequest(mrIid, opts) {
  const raw = glabExec(['mr', 'view', String(mrIid), '--output', 'json'], opts || {});
  return normalizeMergeRequest(parseJson(raw, {}));
}

function listMergeRequests(opts) {
  const options = opts || {};
  const raw = glabExec(['mr', 'list', '--output', 'json'], options);
  return parseJson(raw, []).map(normalizeMergeRequest);
}

function mergeMergeRequest(mrIid, opts) {
  const options = opts || {};
  const args = ['mr', 'merge', String(mrIid), '--yes'];
  if (options.autoMerge) args.push('--auto-merge');
  if (options.squash) args.push('--squash');
  if (options.removeSourceBranch) args.push('--remove-source-branch');
  if (options.sha) args.push('--sha', options.sha);
  const raw = glabExec(args, options);
  return raw ? normalizeMergeRequest(parseJson(raw, {})) : null;
}

module.exports = {
  CLAIM_LABEL,
  QUEUED_LABEL,
  closeIssue,
  createIssueNote,
  createMergeRequest,
  discoverProject,
  glabExec,
  labelsOf,
  listIssueNotes,
  listIssues,
  listMergeRequests,
  mergeMergeRequest,
  normalizeIssue,
  normalizeMergeRequest,
  normalizeProject,
  normalizeState,
  preserveWorkflowLabels,
  projectApiRef,
  uniqueLabels,
  updateIssue,
  updateIssueNote,
  viewIssue,
  viewMergeRequest
};
