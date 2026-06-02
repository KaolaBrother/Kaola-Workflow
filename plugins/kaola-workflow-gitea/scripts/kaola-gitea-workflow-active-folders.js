#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const forge = require('./kaola-gitea-forge');

const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';

function isSafeName(name) {
  return typeof name === 'string' && name.length > 0 &&
    !name.includes('/') && !name.includes('\\') &&
    !name.includes('\0') && name !== '.' && name !== '..';
}

function field(content, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp('^' + escaped + ':[ \\t]*(.+)$', 'm'));
  return match ? match[1].trim() : '';
}

function getRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch (_) {
    return process.cwd();
  }
}

function firstPositiveInteger() {
  for (const value of arguments) {
    const parsed = parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function issueIsClosed(issueIid) {
  if (issueIid == null) return false;
  try {
    return forge.viewIssue(issueIid).state === 'closed';
  } catch (_) {
    return false;
  }
}

function probeIssueState(issueNumber) {
  if (OFFLINE || issueNumber == null) {
    return { state: 'open', reason: 'offline-or-null' };
  }
  try {
    const issue = forge.viewIssue(issueNumber);
    if (issue.state === 'closed') return { state: 'closed', reason: 'ok' };
    if (issue.state === 'open') return { state: 'open', reason: 'ok' };
    return { state: 'unavailable', reason: 'tea issue state unverified' };
  } catch (err) {
    if (err.killed === true || err.signal === 'SIGTERM' || err.code === 'ETIMEDOUT') {
      return { state: 'unavailable', reason: 'timeout' };
    }
    return { state: 'unavailable', reason: 'tea issue fetch failed' };
  }
}

function parseStateFile(stateFile) {
  const content = fs.readFileSync(stateFile, 'utf8');
  const issueIid = firstPositiveInteger(field(content, 'issue_iid'), field(content, 'issue_number'));
  const phase = firstPositiveInteger(field(content, 'phase'));
  return {
    content,
    status: field(content, 'status') || 'unknown',
    issue_iid: issueIid,
    issue_number: issueIid,
    phase,
    next_command: field(content, 'next_command'),
    branch: field(content, 'branch'),
    worktree_path: field(content, 'worktree_path'),
    sink: field(content, 'sink') || 'merge',
    full_name: field(content, 'full_name'),
    project_html_url: field(content, 'project_html_url'),
    pr_url: field(content, 'pr_url'),
    pr_number: firstPositiveInteger(field(content, 'pr_number'))
  };
}

function isInactiveStatus(status) {
  return ['released', 'closed', 'abandoned'].includes(String(status || '').toLowerCase());
}

function readActiveFolders(root, options) {
  const opts = Object.assign({ excludeClosedIssues: true, includeContent: false }, options || {});
  const repoRoot = root || getRoot();
  const workflowDir = path.join(repoRoot, 'kaola-workflow');
  if (!fs.existsSync(workflowDir)) return [];
  const result = [];
  for (const entry of fs.readdirSync(workflowDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'archive' || entry.name.startsWith('.')) continue;
    if (!isSafeName(entry.name)) continue;
    const projectDir = path.join(workflowDir, entry.name);
    const stateFile = path.join(projectDir, 'workflow-state.md');
    if (!fs.existsSync(stateFile)) continue;
    let state;
    try {
      state = parseStateFile(stateFile);
    } catch (_) {
      continue;
    }
    if (isInactiveStatus(state.status)) continue;
    if (opts.excludeClosedIssues && state.issue_iid != null && issueIsClosed(state.issue_iid)) continue;
    const item = {
      project: entry.name,
      project_dir: projectDir,
      state_file: stateFile,
      status: state.status,
      issue_iid: state.issue_iid,
      issue_number: state.issue_number,
      phase: state.phase,
      next_command: state.next_command,
      branch: state.branch,
      worktree_path: state.worktree_path,
      sink: state.sink,
      full_name: state.full_name,
      project_html_url: state.project_html_url,
      pr_url: state.pr_url,
      pr_number: state.pr_number
    };
    if (opts.includeContent) item.content = state.content;
    result.push(item);
  }
  result.sort((a, b) => a.project.localeCompare(b.project));
  return result;
}

module.exports = {
  field,
  getRoot,
  isSafeName,
  issueIsClosed,
  probeIssueState,
  parseStateFile,
  readActiveFolders
};

if (require.main === module) {
  process.stdout.write(JSON.stringify(readActiveFolders(getRoot()), null, 2) + '\n');
}
