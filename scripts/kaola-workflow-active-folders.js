#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';
const REMOTE_TIMEOUT_MS = (() => {
  const n = parseInt(process.env.KAOLA_GH_REMOTE_TIMEOUT_MS || '30000', 10);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 600000) : 30000;
})();

function isSafeName(name) {
  return typeof name === 'string' && name.length > 0 &&
    !name.includes('/') && !name.includes('\\') &&
    !name.includes('\0') && name !== '.' && name !== '..';
}

function field(content, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp('^' + escaped + ':\\s*(.+)$', 'm'));
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

function ghExec(args, opts) {
  if (OFFLINE) return '';
  const mock = process.env.KAOLA_GH_MOCK_SCRIPT;
  if (mock) return execFileSync(process.execPath, [mock, ...args], Object.assign({ encoding: 'utf8', timeout: REMOTE_TIMEOUT_MS }, opts || {})).trim();
  return execFileSync('gh', args, Object.assign({ encoding: 'utf8', timeout: REMOTE_TIMEOUT_MS }, opts || {})).trim();
}

function issueIsClosed(issueNumber) {
  if (OFFLINE || issueNumber == null) return false;
  try {
    const raw = ghExec(['issue', 'view', String(issueNumber), '--json', 'state']);
    if (!raw) return false;
    const data = JSON.parse(raw);
    return String(data.state || '').toLowerCase() === 'closed';
  } catch (_) {
    return false;
  }
}

function probeIssueState(issueNumber) {
  if (OFFLINE || issueNumber == null) return { state: 'open', reason: 'offline-or-null' };
  try {
    const raw = ghExec(['issue', 'view', String(issueNumber), '--json', 'state']);
    if (!raw) return { state: 'unavailable', reason: 'empty gh response' };
    const data = JSON.parse(raw);
    const state = String(data.state || '').toLowerCase() === 'closed' ? 'closed' : 'open';
    return { state, reason: 'ok' };
  } catch (err) {
    if (err.killed === true || err.signal === 'SIGTERM' || err.code === 'ETIMEDOUT') {
      return { state: 'unavailable', reason: 'timeout' };
    }
    return { state: 'unavailable', reason: 'gh issue fetch failed' };
  }
}

function parseStateFile(stateFile) {
  const content = fs.readFileSync(stateFile, 'utf8');
  const issue = parseInt(field(content, 'issue_number'), 10);
  const phase = parseInt(field(content, 'phase'), 10);
  return {
    content,
    status: field(content, 'status') || 'unknown',
    issue_number: Number.isFinite(issue) && issue > 0 ? issue : null,
    phase: Number.isFinite(phase) && phase > 0 ? phase : null,
    next_command: field(content, 'next_command'),
    branch: field(content, 'branch'),
    worktree_path: field(content, 'worktree_path'),
    sink: field(content, 'sink') || 'merge',
    pr_url: field(content, 'pr_url'),
    pr_number: field(content, 'pr_number')
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
    if (opts.excludeClosedIssues && state.issue_number != null && issueIsClosed(state.issue_number)) continue;
    const item = {
      project: entry.name,
      project_dir: projectDir,
      state_file: stateFile,
      status: state.status,
      issue_number: state.issue_number,
      phase: state.phase,
      next_command: state.next_command,
      branch: state.branch,
      worktree_path: state.worktree_path,
      sink: state.sink,
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
  readActiveFolders
};

if (require.main === module) {
  process.stdout.write(JSON.stringify(readActiveFolders(getRoot()), null, 2) + '\n');
}
