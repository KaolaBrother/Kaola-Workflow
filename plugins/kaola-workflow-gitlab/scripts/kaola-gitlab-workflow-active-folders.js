#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const forge = require('./kaola-gitlab-forge');

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

// #362: per-invocation memo of issue iid -> 'open'|'closed', shared by issueIsClosed +
// probeIssueState, seeded from KAOLA_ISSUE_STATE_SNAPSHOT (parent->classifier handoff) and filled
// by ONE batched forge.listIssues() prefetch instead of N per-issue forge.viewIssue() round-trips.
const issueStateMemo = new Map();
function rememberIssueState(num, state) {
  if (num == null) return;
  const k = Number(num);
  if (Number.isFinite(k) && (state === 'open' || state === 'closed')) issueStateMemo.set(k, state);
}
(function seedIssueStateMemoFromEnv() {
  const raw = process.env.KAOLA_ISSUE_STATE_SNAPSHOT;
  if (!raw) return;
  try { const obj = JSON.parse(raw); for (const [n, s] of Object.entries(obj || {})) rememberIssueState(n, s); }
  catch (_) { /* malformed snapshot -> ignore */ }
})();
function getIssueStateSnapshot() {
  const obj = {};
  for (const [k, v] of issueStateMemo.entries()) obj[k] = v;
  return obj;
}
function __resetIssueStateMemo() { issueStateMemo.clear(); }
function prefetchIssueStates(iids) {
  if (OFFLINE) return;
  const want = [...new Set((iids || []).map(Number).filter(n => Number.isFinite(n) && n > 0 && !issueStateMemo.has(n)))];
  if (want.length === 0) return;
  try {
    const list = forge.listIssues({ state: 'all', perPage: 200 });
    if (!Array.isArray(list)) return;
    for (const it of list) rememberIssueState(it.iid, it.state === 'closed' ? 'closed' : 'open');
  } catch (_) { /* best-effort: per-issue fallback still runs */ }
}

function issueIsClosed(issueIid) {
  if (issueIid == null) return false;
  const key = Number(issueIid);
  if (issueStateMemo.has(key)) return issueStateMemo.get(key) === 'closed';
  try {
    const closed = forge.viewIssue(issueIid).state === 'closed';
    rememberIssueState(key, closed ? 'closed' : 'open');
    return closed;
  } catch (_) {
    return false;
  }
}

// #519: AXIS REPLACEMENT (mirror of root active-folders) — KNOWN transient-infra stderr signatures.
// A glab fetch fault carrying one of these is TRANSIENT (escalate), distinct from a genuine-negative /
// unrecognized fault (refuse). Kept byte-aligned (modulo forge nouns) with the root/classifier copies.
const TRANSIENT_FETCH_STDERR = [
  /\bTLS\b/i,
  /handshake/i,
  /\btimed?\s*out\b/i,
  /\bETIMEDOUT\b/i,
  /\bECONNRESET\b/i,
  /connection reset/i,
  /connection refused/i,
  /\bECONNREFUSED\b/i,
  /rate limit/i,
  /\b429\b/,
  /could not resolve host/i,
  /\bEAI_AGAIN\b/i,
  /temporary failure in name resolution/i,
  /\bdial tcp\b/i,
  /\b5\d\d\b\s*(?:internal|bad gateway|service unavailable|gateway timeout)?/i,
  /internal server error/i,
  /bad gateway/i,
  /service unavailable/i,
  /gateway time-?out/i,
  /\bi\/o timeout\b/i,
  /network is unreachable/i,
  /\bEHOSTUNREACH\b/i,
];

function isTransientFetchStderr(text) {
  const s = String(text || '');
  if (!s) return false;
  return TRANSIENT_FETCH_STDERR.some(re => re.test(s));
}

// #519: true iff a glab fetch error is transient-infra (escalate) vs genuine-negative / unrecognized
// (refuse). killed / timeout / no-exit-status are transient by construction; a clean_nonzero is
// transient ONLY when its stderr carries a known transient signature.
function probeErrIsTransient(err) {
  if (err.killed === true || err.signal === 'SIGTERM' || err.code === 'ETIMEDOUT') return true;
  if (err.status == null) return true;
  const combined = String(err.stderr || '') + '\n' + String(err.stdout || '');
  return isTransientFetchStderr(combined);
}

// #519: probeIssueState NON-BREAKING discriminant — genuine/unknown keeps { state:'unavailable' }
// (closure-audit + probe-memo read only .state); a TRANSIENT-infra fault ADDS { transient:true } so
// ONLY the claim.js gates escalate. closed/open returns UNCHANGED. Adds a bounded retry on transient.
function probeIssueState(issueIid) {
  if (OFFLINE || issueIid == null) return { state: 'open', reason: 'offline-or-null' };
  const key = Number(issueIid);
  if (issueStateMemo.has(key)) return { state: issueStateMemo.get(key), reason: 'memo' };
  const MAX_PROBE_ATTEMPTS = 3;
  let lastErr = null;
  for (let attempt = 0; attempt < MAX_PROBE_ATTEMPTS; attempt++) {
    try {
      const issue = forge.viewIssue(issueIid);
      rememberIssueState(key, issue.state === 'closed' ? 'closed' : (issue.state === 'open' ? 'open' : undefined));
      if (issue.state === 'closed') return { state: 'closed', reason: 'ok' };
      if (issue.state === 'open') return { state: 'open', reason: 'ok' };
      return { state: 'unavailable', reason: 'glab issue state unverified' };
    } catch (err) {
      lastErr = err;
      if (!probeErrIsTransient(err)) {
        return { state: 'unavailable', reason: 'glab issue fetch failed' };
      }
    }
  }
  const reason = (lastErr && (lastErr.killed === true || lastErr.signal === 'SIGTERM' || lastErr.code === 'ETIMEDOUT'))
    ? 'timeout' : 'glab issue fetch transient fault';
  return { state: 'unavailable', reason, transient: true };
}

function parseStateFile(stateFile) {
  const content = fs.readFileSync(stateFile, 'utf8');
  const issueIid = firstPositiveInteger(field(content, 'issue_iid'), field(content, 'issue_number'));
  const phase = firstPositiveInteger(field(content, 'phase'));
  const projectId = firstPositiveInteger(field(content, 'project_id'));
  // #328: parse issue_numbers (bundle members) — additive; absent → empty array (AC#1)
  const issueNumbersRaw = field(content, 'issue_numbers');
  const issue_numbers = issueNumbersRaw
    ? issueNumbersRaw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n) && n > 0)
    : [];
  return {
    content,
    status: field(content, 'status') || 'unknown',
    issue_iid: issueIid,
    issue_number: issueIid,
    issue_numbers,
    bundle_id: field(content, 'bundle_id'),
    closure_policy: field(content, 'closure_policy'),
    phase,
    next_command: field(content, 'next_command'),
    branch: field(content, 'branch'),
    worktree_path: field(content, 'worktree_path'),
    sink: field(content, 'sink') || 'merge',
    mr_url: field(content, 'mr_url'),
    mr_iid: field(content, 'mr_iid'),
    project_id: projectId,
    path_with_namespace: field(content, 'path_with_namespace'),
    project_web_url: field(content, 'project_web_url')
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
  // #362: batch-prefetch every candidate folder's issue iid in ONE forge.listIssues() before the
  // per-folder closed-issue filter (pure-fs pre-scan; cheap).
  if (opts.excludeClosedIssues) {
    const iids = [];
    for (const e of fs.readdirSync(workflowDir, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name === 'archive' || e.name.startsWith('.') || !isSafeName(e.name)) continue;
      const sf = path.join(workflowDir, e.name, 'workflow-state.md');
      if (!fs.existsSync(sf)) continue;
      try { const st = parseStateFile(sf); if (st.issue_iid != null) iids.push(st.issue_iid); } catch (_) {}
    }
    prefetchIssueStates(iids);
  }
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
      issue_numbers: state.issue_numbers,
      bundle_id: state.bundle_id,
      closure_policy: state.closure_policy,
      phase: state.phase,
      next_command: state.next_command,
      branch: state.branch,
      worktree_path: state.worktree_path,
      sink: state.sink,
      mr_url: state.mr_url,
      mr_iid: state.mr_iid,
      project_id: state.project_id,
      path_with_namespace: state.path_with_namespace,
      project_web_url: state.project_web_url
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
  prefetchIssueStates,
  getIssueStateSnapshot,
  __resetIssueStateMemo,
  parseStateFile,
  readActiveFolders
};

if (require.main === module) {
  process.stdout.write(JSON.stringify(readActiveFolders(getRoot()), null, 2) + '\n');
}

