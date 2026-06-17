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

function ghExec(args, opts) {
  if (OFFLINE) return '';
  const mock = process.env.KAOLA_GH_MOCK_SCRIPT;
  if (mock) return execFileSync(process.execPath, [mock, ...args], Object.assign({ encoding: 'utf8', timeout: REMOTE_TIMEOUT_MS }, opts || {})).trim();
  return execFileSync('gh', args, Object.assign({ encoding: 'utf8', timeout: REMOTE_TIMEOUT_MS }, opts || {})).trim();
}

// #362: per-invocation memo of issue number → 'open'|'closed'. issueIsClosed AND probeIssueState
// share it, so a startup that probes the same issue from multiple code paths (claimProject calls
// readActiveFolders up to twice; cmdStatus double-probes) pays ONE remote round-trip, not N.
// Process-scoped (each script invocation is one process). Seeded from KAOLA_ISSUE_STATE_SNAPSHOT
// so a parent (e.g. claim) can hand its snapshot to a spawned classifier subprocess — closing the
// cross-process re-probe gap.
const issueStateMemo = new Map(); // Number -> 'open' | 'closed'

function rememberIssueState(num, state) {
  if (num == null) return;
  const k = Number(num);
  if (Number.isFinite(k) && (state === 'open' || state === 'closed')) issueStateMemo.set(k, state);
}

(function seedIssueStateMemoFromEnv() {
  const raw = process.env.KAOLA_ISSUE_STATE_SNAPSHOT;
  if (!raw) return;
  try {
    const obj = JSON.parse(raw);
    for (const [num, state] of Object.entries(obj || {})) rememberIssueState(num, state);
  } catch (_) { /* malformed snapshot → ignore, fall back to live probes */ }
})();

// Serialize the memo for handoff to a child process via KAOLA_ISSUE_STATE_SNAPSHOT.
function getIssueStateSnapshot() {
  const obj = {};
  for (const [k, v] of issueStateMemo.entries()) obj[k] = v;
  return obj;
}

// Test-only: clear the per-invocation memo so a test process that exercises many probe scenarios
// against reused issue numbers stays isolated (production never needs this — each invocation is one
// process and the memo SHOULD persist within it).
function __resetIssueStateMemo() { issueStateMemo.clear(); }

// #362: ONE batched `gh issue list` covering the requested numbers (vs N per-issue `gh issue view`).
// Best-effort: on any failure the per-issue fallbacks in issueIsClosed/probeIssueState still run.
function prefetchIssueStates(issueNumbers) {
  if (OFFLINE) return;
  const want = [...new Set((issueNumbers || [])
    .map(Number).filter(n => Number.isFinite(n) && n > 0 && !issueStateMemo.has(n)))];
  if (want.length === 0) return;
  try {
    const raw = ghExec(['issue', 'list', '--state', 'all', '--limit', '200', '--json', 'number,state']);
    if (!raw) return;
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return;
    for (const it of list) {
      rememberIssueState(it.number, String(it.state || '').toLowerCase() === 'closed' ? 'closed' : 'open');
    }
    // Numbers absent from the snapshot (beyond --limit, or a list miss) stay unmemoized → lazy
    // per-issue fallback below.
  } catch (_) { /* best-effort */ }
}

function issueIsClosed(issueNumber) {
  if (OFFLINE || issueNumber == null) return false;
  const key = Number(issueNumber);
  if (issueStateMemo.has(key)) return issueStateMemo.get(key) === 'closed';
  try {
    const raw = ghExec(['issue', 'view', String(issueNumber), '--json', 'state']);
    if (!raw) return false;
    const data = JSON.parse(raw);
    const closed = String(data.state || '').toLowerCase() === 'closed';
    rememberIssueState(key, closed ? 'closed' : 'open');
    return closed;
  } catch (_) {
    return false;
  }
}

// #519: AXIS REPLACEMENT (mirror of classifier.isTransientFetchStderr) — KNOWN transient-infra
// stderr signatures. A gh fetch fault carrying one of these is TRANSIENT (escalate), distinct from
// a genuine-negative / unrecognized fault (refuse). Kept byte-aligned with the classifier + claim
// copies so all four sites converge on the same verdict for the same fault.
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

// #519: true iff captured stderr/stdout carries a KNOWN transient-infra signature.
function isTransientFetchStderr(text) {
  const s = String(text || '');
  if (!s) return false;
  return TRANSIENT_FETCH_STDERR.some(re => re.test(s));
}

// #519: true iff a gh fetch error is transient-infra (escalate) vs genuine-negative / unrecognized
// (refuse). spawn_fault / killed / timeout are transient by construction; a clean_nonzero is
// transient ONLY when its stderr carries a known transient signature.
function probeErrIsTransient(err) {
  if (err.killed === true || err.signal === 'SIGTERM' || err.code === 'ETIMEDOUT') return true;
  if (err.status == null) return true; // spawn_fault / killed (no exit status) — transient
  const combined = String(err.stderr || '') + '\n' + String(err.stdout || '');
  return isTransientFetchStderr(combined);
}

// #519: probeIssueState NON-BREAKING discriminant contract. The genuine/unknown case STILL returns
// { state: 'unavailable' } (so closure-audit.js + test-issue-probe-memo.js, which read only .state,
// are unaffected). A TRANSIENT-infra fault ADDS { transient: true } beside state:'unavailable' so
// ONLY the claim.js gates route it to escalate; closed/open returns are UNCHANGED. #519 also adds a
// bounded retry on a transient fault (previously single-shot, no retry, no escalate).
function probeIssueState(issueNumber) {
  if (OFFLINE || issueNumber == null) return { state: 'open', reason: 'offline-or-null' };
  const key = Number(issueNumber);
  if (issueStateMemo.has(key)) return { state: issueStateMemo.get(key), reason: 'memo' };
  const MAX_PROBE_ATTEMPTS = 3;
  let lastErr = null;
  for (let attempt = 0; attempt < MAX_PROBE_ATTEMPTS; attempt++) {
    try {
      const raw = ghExec(['issue', 'view', String(issueNumber), '--json', 'state']);
      if (!raw) return { state: 'unavailable', reason: 'empty gh response' };
      const data = JSON.parse(raw); // exit-0 unparseable body → SyntaxError → transient (no .status)
      const state = String(data.state || '').toLowerCase() === 'closed' ? 'closed' : 'open';
      rememberIssueState(key, state);
      return { state, reason: 'ok' };
    } catch (err) {
      lastErr = err;
      if (!probeErrIsTransient(err)) {
        return { state: 'unavailable', reason: 'gh issue fetch failed' };
      }
      // transient — retry (bounded); loop falls through to escalate signal after MAX_PROBE_ATTEMPTS
    }
  }
  // Persistent transient fault — KEEP state:'unavailable' (non-breaking for .state-only readers) and
  // ADD the transient discriminant so the claim.js gates escalate instead of refusing.
  const reason = (lastErr && (lastErr.killed === true || lastErr.signal === 'SIGTERM' || lastErr.code === 'ETIMEDOUT'))
    ? 'timeout' : 'gh issue fetch transient fault';
  return { state: 'unavailable', reason, transient: true };
}

function parseStateFile(stateFile) {
  const content = fs.readFileSync(stateFile, 'utf8');
  const issue = parseInt(field(content, 'issue_number'), 10);
  const phase = parseInt(field(content, 'phase'), 10);
  // #328: parse issue_numbers (bundle members) — additive; absent → empty array (AC#1)
  const issueNumbersRaw = field(content, 'issue_numbers');
  const issue_numbers = issueNumbersRaw
    ? issueNumbersRaw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n) && n > 0)
    : [];
  return {
    content,
    status: field(content, 'status') || 'unknown',
    issue_number: Number.isFinite(issue) && issue > 0 ? issue : null,
    issue_numbers,
    bundle_id: field(content, 'bundle_id'),
    closure_policy: field(content, 'closure_policy'),
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

  // First pass: parse every candidate folder's state (pure fs — no remote).
  const candidates = [];
  for (const entry of fs.readdirSync(workflowDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'archive' || entry.name.startsWith('.')) continue;
    if (!isSafeName(entry.name)) continue;
    const projectDir = path.join(workflowDir, entry.name);
    const stateFile = path.join(projectDir, 'workflow-state.md');
    if (!fs.existsSync(stateFile)) continue;
    let state;
    try { state = parseStateFile(stateFile); } catch (_) { continue; }
    if (isInactiveStatus(state.status)) continue;
    candidates.push({ name: entry.name, projectDir, stateFile, state });
  }

  // #362: batch-prefetch every candidate's issue number in ONE `gh issue list` before the
  // per-folder closed-issue filter (was N per-folder `gh issue view` round-trips).
  if (opts.excludeClosedIssues) {
    prefetchIssueStates(candidates.map(c => c.state.issue_number).filter(n => n != null));
  }

  // Second pass: filter (issueIsClosed is now memo-backed → at most one extra probe per uncached issue).
  const result = [];
  for (const { name, projectDir, stateFile, state } of candidates) {
    if (opts.excludeClosedIssues && state.issue_number != null && issueIsClosed(state.issue_number)) continue;
    const item = {
      project: name,
      project_dir: projectDir,
      state_file: stateFile,
      status: state.status,
      issue_number: state.issue_number,
      issue_numbers: state.issue_numbers,
      bundle_id: state.bundle_id,
      closure_policy: state.closure_policy,
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
  prefetchIssueStates,
  getIssueStateSnapshot,
  __resetIssueStateMemo,
  readActiveFolders
};

if (require.main === module) {
  process.stdout.write(JSON.stringify(readActiveFolders(getRoot()), null, 2) + '\n');
}
