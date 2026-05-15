#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';

function assert(cond, msg) { if (!cond) throw new Error(msg); }

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

function sleepMs(ms) { const end = Date.now() + ms; while (Date.now() < end) {} }

function ghExec(args) {
  if (OFFLINE) return '';
  return execFileSync('gh', args, { encoding: 'utf8' }).trim();
}

function getRepoOwnerName() {
  const raw = ghExec(['repo', 'view', '--json', 'owner,name']);
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    return { owner: d.owner.login, name: d.name };
  } catch (_) { return null; }
}

function runTiebreakerCheck(issueNum, sessionId, commentId) {
  const repo = getRepoOwnerName();
  if (!repo) return 'stay';
  const claimMarker = '<!-- kw:claim sess=';
  const delays = [0, 250, 750];
  for (let i = 0; i < delays.length; i++) {
    if (delays[i]) sleepMs(delays[i]);
    const raw = ghExec(['api', 'repos/' + repo.owner + '/' + repo.name + '/issues/' + issueNum + '/comments']);
    if (!raw) continue;
    let comments;
    try { comments = JSON.parse(raw); } catch (_) { continue; }
    const candidates = comments.filter(function(c) { return c.body && c.body.includes(claimMarker); });
    if (candidates.length === 0) continue;
    candidates.sort(function(a, b) { return a.id - b.id; });
    const winner = candidates[0];
    if (String(winner.id) === String(commentId)) return 'stay';
    return { yield: true, winnerId: winner.id, winnerBody: winner.body };
  }
  return 'stay';
}

function postReleaseComment(issueNum, sessionId, reason) {
  if (!issueNum || OFFLINE) return;
  try { ghExec(['issue', 'comment', String(issueNum), '--body', reason + ' (session: ' + sessionId + ')']); } catch (_) {}
}

function clearClaimComment(lock, reason) {
  if (OFFLINE || !lock.claim_comment_id || !/^\d+$/.test(String(lock.claim_comment_id))) return;
  const repo = getRepoOwnerName();
  if (!repo) return;
  try {
    ghExec(['api', '--method', 'PATCH',
      'repos/' + repo.owner + '/' + repo.name + '/issues/comments/' + lock.claim_comment_id,
      '-f', 'body=Session released by ' + lock.session_id + '\n<!-- kw:released reason=' + (reason || 'release') + ' -->']);
  } catch (_) {}
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

function getMachineId() {
  const p = path.join(os.homedir(), '.config', 'kaola-workflow', 'machine-id');
  try { return fs.readFileSync(p, 'utf8').trim(); } catch (_) {}
  const id = crypto.randomUUID();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, id + '\n');
  return id;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') { args.json = true; continue; }
    if (argv[i] === '--session' && argv[i + 1]) { args.session = argv[++i]; continue; }
    if (argv[i] === '--project' && argv[i + 1]) { args.project = argv[++i]; continue; }
    if (argv[i] === '--issue' && argv[i + 1]) { args.issue = parseInt(argv[++i], 10); continue; }
    if (argv[i] === '--branch' && argv[i + 1]) { args.branch = argv[++i]; continue; }
    if (argv[i] === '--sink' && argv[i + 1]) { args.sink = argv[++i]; continue; }
    if (argv[i] === '--runtime' && argv[i + 1]) { args.runtime = argv[++i]; continue; }
  }
  return args;
}

function locksDir(root) { return path.join(root, 'kaola-workflow', '.locks'); }
function sessionsDir(root) { return path.join(root, 'kaola-workflow', '.sessions'); }
function lockPath(root, project) { return path.join(locksDir(root), project + '.lock'); }
function sessionPath(root, sessionId) { return path.join(sessionsDir(root), sessionId + '.json'); }

function readLockFiles(root) {
  const dir = locksDir(root);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.lock'))
    .map(f => {
      try {
        const raw = fs.readFileSync(path.join(dir, f), 'utf8');
        return JSON.parse(raw);
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean);
}

function readSessionFile(root, sessionId) {
  try {
    const raw = fs.readFileSync(sessionPath(root, sessionId), 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function shouldSweep(lock) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return new Date(lock.expires).getTime() < cutoff &&
    new Date(lock.last_heartbeat).getTime() < cutoff;
}

function buildSinkBlock(lockData) {
  const branchName = lockData.issue_number != null
    ? 'workflow/issue-' + lockData.issue_number + '-' + lockData.project
    : (lockData.branch || 'workflow/' + lockData.project);
  const lines = [
    '## Sink',
    'branch: ' + branchName,
    'issue_number: ' + (lockData.issue_number != null ? lockData.issue_number : 'unset'),
    'claimed_at: ' + lockData.claimed_at,
    'sink: ' + (lockData.sink || 'merge'),
  ];
  if (lockData.pr_url) lines.push('pr_url: ' + lockData.pr_url);
  if (lockData.pr_number != null && lockData.pr_number !== 0) lines.push('pr_number: ' + lockData.pr_number);
  return lines.join('\n');
}

function buildClaimCommentBody(sessionId, heartbeatTs) {
  const lines = [
    'Session claimed by ' + sessionId,
    '<!-- kw:claim sess=' + sessionId + ' -->'
  ];
  if (heartbeatTs) lines.push('<!-- kw:hb ts=' + heartbeatTs + ' -->');
  return lines.join('\n');
}

function initialStateContent(lockData) {
  return [
    '# Kaola-Workflow State',
    '',
    '## Project',
    'name: ' + lockData.project,
    'status: active',
    '',
    '## Current Position',
    'phase: 1',
    'phase_name: Research',
    'step: claimed',
    'next_command: /kaola-workflow-phase1 ' + lockData.project,
    'next_skill: kaola-workflow-research ' + lockData.project,
    'main_session_role: orchestrator',
    'implementation_owner: N/A',
    'fix_owner: N/A',
    'inline_emergency_fallback_authorized: no',
    '',
    '## Pending Gates',
    '- phase1-research',
    '',
    '## Last Evidence',
    'phase_file: N/A',
    'cache_file: N/A',
    'last_command: claim',
    'last_result: claimed',
    '',
    '## Last Updated',
    lockData.claimed_at,
    ''
  ].join('\n');
}

function updateSinkLease(stateFile, lockData) {
  if (!fs.existsSync(stateFile)) {
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, initialStateContent(lockData), 'utf8');
  }
  const content = fs.readFileSync(stateFile, 'utf8');

  const sinkBlock = '\n' + buildSinkBlock(lockData);
  const safeCommentId = /^\d+$/.test(lockData.claim_comment_id) ? lockData.claim_comment_id : 'N/A';
  const leaseBlock = [
    '\n## Lease',
    'session_id: ' + lockData.session_id,
    'expires: ' + lockData.expires,
    'last_heartbeat: ' + lockData.last_heartbeat,
    'claim_comment_id: ' + safeCommentId
  ].join('\n');

  if (!/^## Sink\s*$/m.test(content)) {
    fs.writeFileSync(stateFile, content + sinkBlock + leaseBlock + '\n');
    return;
  }

  // Replace entire ## Sink block through end of ## Lease block
  let updated = content.replace(
    /\n## Sink[\s\S]*?(?=\n## [^SL]|\n## L|$)/,
    () => sinkBlock
  );
  updated = updated.replace(/(?:^|\n)(## Lease[\s\S]*?)(?=\n##|[\s]*$)/, () => '\n' + leaseBlock.slice(1));
  fs.writeFileSync(stateFile, updated);
}

function updateLeaseInPlace(stateFile, lockData) {
  if (!fs.existsSync(stateFile)) return;
  const content = fs.readFileSync(stateFile, 'utf8');
  if (!/^## Lease\s*$/m.test(content)) { process.stderr.write('updateLeaseInPlace: ## Lease section missing in ' + stateFile + '\n'); return; }

  const updated = content
    .replace(/^expires:.*$/gm, 'expires: ' + lockData.expires)
    .replace(/^last_heartbeat:.*$/gm, 'last_heartbeat: ' + lockData.last_heartbeat);

  fs.writeFileSync(stateFile, updated);
}

function writeLockFile(lp, lockData) {
  const fd = fs.openSync(lp, 'wx', 0o600);
  try {
    fs.writeSync(fd, JSON.stringify(lockData, null, 2) + '\n');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function writeSessionFile(root, sessionId, machineId) {
  fs.mkdirSync(sessionsDir(root), { recursive: true });
  const sess = {
    session_id: sessionId,
    machine_id: machineId,
    hostname: os.hostname(),
    pid: process.pid,
    started: new Date().toISOString()
  };
  fs.writeFileSync(sessionPath(root, sessionId), JSON.stringify(sess, null, 2) + '\n', { mode: 0o600 });
}

function postGitHubClaim(issueNum, sessionId) {
  if (!issueNum) return null;
  ghExec(['issue', 'edit', String(issueNum), '--add-label', 'workflow:in-progress', '--add-assignee', '@me']);
  const out = ghExec(['issue', 'comment', String(issueNum), '--body', buildClaimCommentBody(sessionId)]);
  const m = out.match(/issuecomment-(\d+)/);
  return m ? m[1] : null;
}

function handleTiebreakerYield(root, args, tbResult) {
  releaseSession(root, args.session, 'tiebreaker-yield', { remoteCleanup: false });
  const winnerSid = (tbResult.winnerBody.match(/kw:claim sess=([^\s>]+)/) || [])[1] || 'unknown';
  postReleaseComment(args.issue, args.session, ':yielded → ' + winnerSid);
  // Adoption stub: push existing branch if one was already cut
  try {
    const branches = execFileSync('git', ['branch', '--list', 'workflow/issue-' + args.issue + '-*'], { encoding: 'utf8' }).trim();
    if (branches) {
      const branch = branches.split('\n')[0].trim().replace(/^\*\s*/, '');
      execFileSync('git', ['push', 'origin', '--', branch], { encoding: 'utf8' });
      postReleaseComment(args.issue, args.session, ':branch pushed → ' + branch);
    }
  } catch (e) { process.stderr.write('adoption push failed: ' + e.message + '\n'); }
  process.exitCode = 1;
  return true;
}

function validateClaimArgs(args) {
  assert(args.session, '--session <id> required for claim');
  assert(args.project, '--project <name> required for claim');
  assert(isSafeName(args.project), '--project must be a simple folder name with no path separators');
  assert(isSafeName(args.session), '--session must be a simple UUID with no path separators');
  if (args.issue != null) {
    assert(Number.isFinite(args.issue) && args.issue > 0, '--issue must be a positive integer');
  }
  assert(!args.sink || args.sink === 'merge' || args.sink === 'pr', '--sink must be "merge" or "pr"');
  assert(!args.runtime || args.runtime === 'claude' || args.runtime === 'codex',
    '--runtime must be "claude" or "codex"');
}

function buildLockData(args, machineId, now) {
  return {
    project: args.project,
    session_id: args.session,
    machine_id: machineId,
    claimed_at: now.toISOString(),
    expires: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
    last_heartbeat: now.toISOString(),
    issue_number: args.issue != null ? args.issue : null,
    claim_comment_id: null,
    sink: (args.sink === 'pr') ? 'pr' : 'merge',
    pr_url: null,
    pr_number: null,
    runtime: args.runtime || 'claude',
  };
}

function listOpenIssues(cwd) {
  if (OFFLINE) return [];
  try {
    const raw = execFileSync('gh', ['issue', 'list', '--state', 'open', '--json', 'number'], { cwd, encoding: 'utf8' });
    return JSON.parse(raw).map(function(item) { return item.number; });
  } catch (_) { return []; }
}

function pickFirstActionableIssue(classifierScript, issues) {
  for (let i = 0; i < issues.length; i++) {
    const N = issues[i];
    try {
      const raw = execFileSync(process.execPath, [classifierScript, 'classify', '--issue', String(N)], { encoding: 'utf8' });
      const result = JSON.parse(raw);
      if (result.verdict === 'green' || result.verdict === 'yellow') {
        let proj = 'issue-' + N;
        try {
          const name = execFileSync(process.execPath, [path.join(path.dirname(classifierScript), 'kaola-workflow-roadmap.js'), 'project-name', '--issue', String(N)], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore']
          }).trim();
          if (name) proj = name;
        } catch (_) {}
        return { pick: N, project: proj, verdict: result.verdict };
      }
    } catch (_) {}
  }
  return { pick: null };
}

function runBootstrapSweep(claimScript, cwd) {
  try {
    execFileSync(process.execPath, [claimScript, 'sweep'], { cwd, encoding: 'utf8' });
  } catch (_) {}
}

function runBootstrapWatchPr(claimScript, cwd) {
  if (OFFLINE) return;
  try {
    execFileSync(process.execPath, [claimScript, 'watch-pr'], { cwd, encoding: 'utf8' });
  } catch (_) {}
}

function runBootstrapClassify(classifierScript, args) {
  if (OFFLINE || !fs.existsSync(classifierScript)) return { pick: null };
  const issues = listOpenIssues(getRoot());
  return pickFirstActionableIssue(classifierScript, issues);
}

function runBootstrapClaim(claimScript, args, pick) {
  assert(isSafeName(pick.project), 'classifier returned unsafe project name: ' + pick.project);
  const claimArgs = ['claim', '--session', args.session, '--project', pick.project, '--issue', String(pick.pick), '--runtime', args.runtime || 'claude'];
  if (args.sink) claimArgs.push('--sink', args.sink);
  execFileSync(process.execPath, [claimScript, ...claimArgs], { encoding: 'utf8' });
  if (pick.verdict === 'yellow') {
    const cacheDir = path.join(getRoot(), 'kaola-workflow', pick.project, '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.appendFileSync(path.join(cacheDir, 'parallel-classifier.md'), 'parallel-classifier: shared-infra warning for issue #' + pick.pick + '\n');
  }
  return pick;
}

function cmdBootstrap() {
  const args = parseArgs(process.argv.slice(3));
  assert(args.session, '--session required for bootstrap');
  const classifierScript = path.join(path.dirname(__filename), 'kaola-workflow-classifier.js');
  const root = getRoot();
  runBootstrapSweep(__filename, root);
  runBootstrapWatchPr(__filename, root);
  const pick = runBootstrapClassify(classifierScript, args);
  if (!pick.pick) { process.exitCode = 1; return; }
  runBootstrapClaim(__filename, args, pick);
  process.stdout.write(JSON.stringify({ project: pick.project, issue: pick.pick, verdict: pick.verdict }) + '\n');
}

function cmdClaim() {
  const args = parseArgs(process.argv.slice(3));
  validateClaimArgs(args);

  const root = getRoot();
  const machineId = getMachineId();
  const now = new Date();

  fs.mkdirSync(locksDir(root), { recursive: true });

  const lp = lockPath(root, args.project);
  const lockData = buildLockData(args, machineId, now);

  for (let i = 0; i < 3; i++) {
    try { writeLockFile(lp, lockData); break; }
    catch (e) { if (e.code !== 'EEXIST' || i === 2) { process.exitCode = 2; return; } sleepMs(50); }
  }

  writeSessionFile(root, args.session, machineId);

  let commentId = null;
  if (!OFFLINE && args.issue != null) {
    try { commentId = postGitHubClaim(args.issue, args.session); } catch (_) {}
  }

  if (commentId !== null) {
    fs.writeFileSync(lp, JSON.stringify(Object.assign({}, lockData, { claim_comment_id: commentId }), null, 2) + '\n', { mode: 0o600 });
  }

  // Tiebreaker: if another session claimed first (lower comment ID), yield
  if (!OFFLINE && args.issue != null && commentId) {
    const tbResult = runTiebreakerCheck(args.issue, args.session, commentId);
    if (tbResult !== 'stay' && tbResult.yield) {
      handleTiebreakerYield(root, args, tbResult);
      return;
    }
  }

  const finalLock = commentId !== null
    ? Object.assign({}, lockData, { claim_comment_id: commentId })
    : lockData;

  if (commentId !== null) {
    fs.writeFileSync(lp, JSON.stringify(finalLock, null, 2) + '\n', { mode: 0o600 });
  }

  const stateFile = path.join(root, 'kaola-workflow', args.project, 'workflow-state.md');
  updateSinkLease(stateFile, finalLock);
}

function releaseSession(root, sessionId, reason, options) {
  const locks = readLockFiles(root);
  const match = locks.find(l => l.session_id === sessionId);

  if (!match) {
    process.stderr.write('release: no lock found for session ' + sessionId + (reason ? ' (' + reason + ')' : '') + '\n');
    return false;
  }

  assert(isSafeName(match.project), 'lock file has invalid project field');
  assert(isSafeName(match.session_id), 'lock file has invalid session_id field');

  const remoteCleanup = !options || options.remoteCleanup !== false;
  clearClaimComment(match, reason);
  if (remoteCleanup && !OFFLINE && match.issue_number != null) {
    try {
      ghExec(['issue', 'edit', String(match.issue_number), '--remove-label', 'workflow:in-progress', '--remove-assignee', '@me']);
    } catch (_) {}
  }

  try { fs.unlinkSync(lockPath(root, match.project)); } catch (_) {}
  try { fs.unlinkSync(sessionPath(root, sessionId)); } catch (_) {}
  return true;
}

function cmdRelease() {
  const args = parseArgs(process.argv.slice(3));
  assert(args.session, '--session <id> required for release');
  releaseSession(getRoot(), args.session);
}

function cmdHeartbeat() {
  const args = parseArgs(process.argv.slice(3));
  assert(args.session, '--session <id> required for heartbeat');

  const root = getRoot();
  const locks = readLockFiles(root);
  const match = locks.find(l => l.session_id === args.session);

  if (!match) {
    process.exitCode = 1;
    return;
  }

  assert(isSafeName(match.project), 'lock file has invalid project field');
  assert(isSafeName(match.session_id), 'lock file has invalid session_id field');

  const now = new Date();
  const updated = Object.assign({}, match, {
    last_heartbeat: now.toISOString(),
    expires: new Date(now.getTime() + 30 * 60 * 1000).toISOString()
  });

  const lp = lockPath(root, match.project);
  fs.writeFileSync(lp, JSON.stringify(updated, null, 2) + '\n');

  const stateFile = path.join(root, 'kaola-workflow', match.project, 'workflow-state.md');
  updateLeaseInPlace(stateFile, updated);
}

function acquirePidFile(pidPath) {
  if (fs.existsSync(pidPath)) {
    const existingPid = parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10);
    if (!isNaN(existingPid)) {
      try { process.kill(existingPid, 0); return null; } catch (e) {
        if (e.code === 'ESRCH') { try { fs.unlinkSync(pidPath); } catch (_) {} }
      }
    }
  }
  let fd;
  try { fd = fs.openSync(pidPath, 'wx', 0o600); }
  catch (e) {
    if (e.code !== 'EEXIST') process.stderr.write('ticker: failed to create PID file: ' + e.message + '\n');
    return null;
  }
  fs.writeSync(fd, String(process.pid) + '\n');
  fs.closeSync(fd);
  return true;
}

function runTick(tickCtx) {
  tickCtx.tickCountRef.value++;
  const tickCount = tickCtx.tickCountRef.value;
  const locks = readLockFiles(tickCtx.root);
  const match = locks.find(function(l) { return l.session_id === tickCtx.session; });
  if (!match) {
    try { fs.unlinkSync(tickCtx.pidPath); } catch (_) {}
    process.exit(0);
    return;
  }

  const now = new Date();
  const updated = Object.assign({}, match, {
    last_heartbeat: now.toISOString(),
    expires: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString()
  });
  const lp = lockPath(tickCtx.root, match.project);
  fs.writeFileSync(lp, JSON.stringify(updated, null, 2) + '\n');
  const stateFile = path.join(tickCtx.root, 'kaola-workflow', match.project, 'workflow-state.md');
  if (fs.existsSync(stateFile)) updateLeaseInPlace(stateFile, updated);

  if (tickCount % 4 === 0 && match.claim_comment_id && /^\d+$/.test(String(match.claim_comment_id))) {
    const repo = getRepoOwnerName();
    if (repo) {
      try {
        ghExec(['api', '--method', 'PATCH',
          'repos/' + repo.owner + '/' + repo.name + '/issues/comments/' + match.claim_comment_id,
          '-f', 'body=' + buildClaimCommentBody(match.session_id, now.toISOString())]);
      } catch (_) {}
    }
  }

  if (tickCount === 1 && match.claim_comment_id && Number.isFinite(match.issue_number)) {
    const tbResult = runTiebreakerCheck(match.issue_number, tickCtx.session, match.claim_comment_id);
    if (tbResult !== 'stay' && tbResult.yield) {
      releaseSession(tickCtx.root, tickCtx.session, 'ticker-late-yield', { remoteCleanup: false });
      try { fs.unlinkSync(tickCtx.pidPath); } catch (_) {}
      process.exit(0);
      return;
    }
  }

  setTimeout(runTick, tickCtx.intervalMs, tickCtx);
}

function cmdTicker() {
  if (OFFLINE) return;
  const args = parseArgs(process.argv.slice(3));
  if (!args.session) { process.stderr.write('ticker: --session required\n'); process.exitCode = 1; return; }
  if (!isSafeName(args.session)) { process.stderr.write('ticker: --session must be a simple UUID with no path separators\n'); process.exitCode = 1; return; }
  const intervalMs = (function() {
    for (let i = 3; i < process.argv.length - 1; i++) {
      if (process.argv[i] === '--interval') return parseInt(process.argv[i + 1], 10) || (15 * 60 * 1000);
    }
    return 15 * 60 * 1000;
  })();
  const root = getRoot();
  const tickersDir = path.join(root, 'kaola-workflow', '.tickers');
  fs.mkdirSync(tickersDir, { recursive: true });
  const pidPath = path.join(tickersDir, args.session + '.pid');
  if (acquirePidFile(pidPath) === null) return;
  function gracefulShutdown() { try { fs.unlinkSync(pidPath); } catch (_) {} process.exit(0); }
  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT',  gracefulShutdown);
  const tickCtx = { root, session: args.session, pidPath, intervalMs, tickCountRef: { value: 0 } };
  runTick(tickCtx);
}

function isRemoteStale(lock) {
  if (OFFLINE || !lock.claim_comment_id || !/^\d+$/.test(String(lock.claim_comment_id))) return false;
  const repo = getRepoOwnerName();
  if (!repo) return false;
  const raw = ghExec(['api', 'repos/' + repo.owner + '/' + repo.name + '/issues/comments/' + lock.claim_comment_id]);
  if (!raw) return false;
  try {
    const data = JSON.parse(raw);
    return Date.now() - new Date(data.updated_at).getTime() >= 24 * 60 * 60 * 1000;
  } catch (_) { return false; }
}

function cmdSweep() {
  const root = getRoot();
  const dir = locksDir(root);
  if (!fs.existsSync(dir)) return;

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.lock'));
  for (const f of files) {
    const fp = path.join(dir, f);
    let lock;
    try {
      lock = JSON.parse(fs.readFileSync(fp, 'utf8'));
    } catch (_) { continue; }

    if (!shouldSweep(lock)) continue;
    if (!isRemoteStale(lock)) continue;

    if (!OFFLINE && lock.issue_number != null) {
      try {
        ghExec(['issue', 'edit', String(lock.issue_number), '--remove-label', 'workflow:in-progress']);
      } catch (_) {}
      try {
        ghExec(['issue', 'edit', String(lock.issue_number), '--remove-assignee', '@me']);
      } catch (_) {}
      postReleaseComment(lock.issue_number, lock.session_id, ':released-stale');
    }
    try { fs.unlinkSync(fp); } catch (_) {}
  }
}

function cmdStatus() {
  const args = parseArgs(process.argv.slice(3));
  const root = getRoot();
  const locks = readLockFiles(root);

  const filtered = args.session
    ? locks.filter(l => l.session_id === args.session)
    : locks;

  const results = filtered.map(lock => {
    if (!isSafeName(lock.session_id)) {
      return { session: null, lock, remote: { assignee: null, has_label: null, sentinel_comment_id: null }, consistent: false, drift: ['session_id unsafe'] };
    }
    const session = readSessionFile(root, lock.session_id);

    let remote = { assignee: null, has_label: null, sentinel_comment_id: null };
    if (!OFFLINE && lock.issue_number != null) {
      try {
        const raw = ghExec(['issue', 'view', String(lock.issue_number), '--json', 'assignees,labels']);
        const data = JSON.parse(raw);
        const assignees = (data.assignees || []).map(a => a.login);
        const labels = (data.labels || []).map(l => l.name);
        remote = {
          assignee: assignees.join(',') || null,
          has_label: labels.includes('workflow:in-progress'),
          sentinel_comment_id: lock.claim_comment_id || null
        };
      } catch (_) {}
    }

    const consistent = session != null && session.session_id === lock.session_id;
    const drift = [];
    if (!consistent && session == null) drift.push('session file missing');
    if (session != null && session.session_id !== lock.session_id) {
      drift.push('session_id mismatch: session=' + session.session_id + ' lock=' + lock.session_id);
    }

    return { session, lock, remote, consistent, drift };
  });

  process.stdout.write(JSON.stringify(results, null, 2) + '\n');
}

function cmdPatchBranch() {
  const args = parseArgs(process.argv.slice(3));
  assert(args.project, '--project required for patch-branch');
  assert(args.session, '--session required for patch-branch');
  assert(args.branch, '--branch required for patch-branch');
  assert(isSafeName(args.project), '--project must be a simple folder name');
  assert(isSafeName(args.session), '--session must be a simple UUID');
  assert(typeof args.branch === 'string' && args.branch.length > 0
    && !args.branch.includes('\0') && !args.branch.includes('\n') && !args.branch.includes('\r')
    && args.branch !== '.' && args.branch !== '..', '--branch is invalid');

  const root = getRoot();
  const lp = lockPath(root, args.project);
  assert(fs.existsSync(lp), 'no lock file for project: ' + args.project);
  const lock = JSON.parse(fs.readFileSync(lp, 'utf8'));
  assert(lock.session_id === args.session, 'session mismatch: lock belongs to ' + lock.session_id);

  const updatedLock = Object.assign({}, lock, { branch: args.branch });
  fs.writeFileSync(lp, JSON.stringify(updatedLock, null, 2) + '\n');

  const stateFile = path.join(root, 'kaola-workflow', args.project, 'workflow-state.md');
  if (fs.existsSync(stateFile)) {
    const content = fs.readFileSync(stateFile, 'utf8');
    const patched = content.replace(/^branch:.*$/m, () => 'branch: ' + args.branch);
    fs.writeFileSync(stateFile, patched);
  }

  const safeCommentId = /^\d+$/.test(lock.claim_comment_id) ? lock.claim_comment_id : null;
  if (!OFFLINE && safeCommentId) {
    try {
      const repo = getRepoOwnerName();
      if (repo) {
        ghExec(['api', '--method', 'PATCH',
          'repos/' + repo.owner + '/' + repo.name + '/issues/comments/' + safeCommentId,
          '-f', 'body=' + buildClaimCommentBody(lock.session_id) + '\nBranch: ' + args.branch]);
      }
    } catch (_) {}
  }
}

function cmdWatchPr() {
  if (OFFLINE) return;
  const args = parseArgs(process.argv.slice(3));
  const root = getRoot();
  const dir = locksDir(root);
  if (!fs.existsSync(dir)) return;

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.lock'));
  for (const f of files) {
    const fp = path.join(dir, f);
    let lock;
    try { lock = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (_) { continue; }

    if (lock.sink !== 'pr') continue;
    if (!lock.pr_url || !lock.pr_url.startsWith('https://')) continue;
    if (args.issue != null && lock.issue_number !== args.issue) continue;
    if (!isSafeName(lock.project)) continue;
    if (!isSafeName(lock.session_id)) continue;

    let prData;
    try {
      const raw = ghExec(['pr', 'view', '--', lock.pr_url, '--json', 'state,mergedAt,url,number,closedAt']);
      if (!raw) continue;
      prData = JSON.parse(raw);
    } catch (_) {
      process.stderr.write('watch-pr: gh pr view failed for ' + lock.pr_url + '\n');
      continue;
    }

    const state = (prData.state || '').toUpperCase();
    const branchName = lock.branch || (lock.issue_number != null
      ? 'workflow/issue-' + lock.issue_number + '-' + lock.project
      : 'workflow/' + lock.project);

    if (state === 'MERGED') {
      releaseSession(root, lock.session_id, 'merged');
      try {
        execFileSync('git', ['branch', '-D', '--', branchName], { encoding: 'utf8' });
      } catch (_) {}
    } else if (state === 'CLOSED') {
      releaseSession(root, lock.session_id, 'aborted');
      // Do NOT delete branch on closed-without-merge
    } else {
      // OPEN or unknown: refresh heartbeat + expires
      const now = new Date();
      const updated = Object.assign({}, lock, {
        last_heartbeat: now.toISOString(),
        expires: new Date(now.getTime() + 30 * 60 * 1000).toISOString()
      });
      try { fs.writeFileSync(fp, JSON.stringify(updated, null, 2) + '\n'); } catch (_) {}
      const stateFile = path.join(root, 'kaola-workflow', lock.project, 'workflow-state.md');
      updateLeaseInPlace(stateFile, updated);
    }
  }
}

function main() {
  const sub = process.argv[2];
  assert(sub, 'usage: kaola-workflow-claim.js <claim|release|heartbeat|ticker|sweep|status|patch-branch|watch-pr|bootstrap>');
  if (sub === 'claim') return cmdClaim();
  if (sub === 'release') return cmdRelease();
  if (sub === 'heartbeat') return cmdHeartbeat();
  if (sub === 'ticker') return cmdTicker();
  if (sub === 'sweep') return cmdSweep();
  if (sub === 'status') return cmdStatus();
  if (sub === 'patch-branch') return cmdPatchBranch();
  if (sub === 'watch-pr') return cmdWatchPr();
  if (sub === 'bootstrap') return cmdBootstrap();
  throw new Error('unknown subcommand: ' + sub);
}

try { main(); } catch (err) { process.stderr.write(err.message + '\n'); process.exitCode = 1; }
