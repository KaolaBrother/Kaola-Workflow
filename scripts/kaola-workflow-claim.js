#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';
const CLAIM_LABEL = 'workflow:in-progress';
const RECENT_HEARTBEAT_MS = 30 * 60 * 1000;
const RECENT_CLAUDE_SESSION_MS = 30 * 60 * 1000;
const PRIORITY_TIER_BY_LABEL = { P0: 0, P1: 1, P2: 2, P3: 3 };

function assert(cond, msg) { if (!cond) throw new Error(msg); }

function isSafeName(name) {
  return typeof name === 'string' && name.length > 0 &&
    !name.includes('/') && !name.includes('\\') &&
    !name.includes('\0') && !name.includes('\n') &&
    !name.includes('\r') && !name.includes('\t') &&
    name !== '.' && name !== '..';
}

function field(content, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp('^' + escaped + ':[ \\t]*(.+)$', 'm'));
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

function getCoordRoot() {
  if (process.env.KAOLA_COORD_ROOT) return process.env.KAOLA_COORD_ROOT;
  // Returns the canonical git common directory (shared by all worktrees).
  // On macOS /var is a symlink to /private/var; we intentionally do NOT call
  // fs.realpathSync here because coordRoot is only used for filesystem I/O
  // (path.join + fs calls), never for string equality across processes.
  const root = getRoot();
  try {
    const raw = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    return path.resolve(root, raw);
  } catch (_) {
    return path.join(root, '.git');
  }
}

function migrateLegacyCoordState(root, coordRoot) {
  for (const subdir of ['.locks', '.sessions', '.tickers']) {
    const legacyDir = path.join(root, 'kaola-workflow', subdir);
    let files;
    try { files = fs.readdirSync(legacyDir); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
    for (const f of files) {
      const legacyPath = path.join(legacyDir, f);
      const newPath = path.join(coordRoot, 'kaola-workflow', subdir, f);
      fs.mkdirSync(path.dirname(newPath), { recursive: true });
      try {
        fs.linkSync(legacyPath, newPath);
        fs.unlinkSync(legacyPath);
      } catch (e) {
        if (e.code === 'EEXIST') { try { fs.unlinkSync(legacyPath); } catch (_) {} continue; }
        if (e.code === 'EXDEV') {
          try {
            let _fd; try { _fd = fs.openSync(newPath, 'wx'); fs.closeSync(_fd); } catch (e2) { if (e2.code === 'EEXIST') continue; throw e2; }
            fs.copyFileSync(legacyPath, newPath);
            fs.unlinkSync(legacyPath);
          } catch (ex) { process.stderr.write('migrate warn: ' + ex.message + '\n'); }
          continue;
        }
        process.stderr.write('migrate warn: ' + e.message + '\n');
      }
    }
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
    if (argv[i] === '--platform-override') { args.platformOverride = true; continue; }
    if (argv[i] === '--force-live-takeover') { args.forceLiveTakeover = true; continue; }
    if (argv[i] === '--session' && argv[i + 1]) { args.session = argv[++i]; continue; }
    if (argv[i] === '--project' && argv[i + 1]) { args.project = argv[++i]; continue; }
    if (argv[i] === '--issue' && argv[i + 1]) { args.issue = parseInt(argv[++i], 10); continue; }
    if (argv[i] === '--branch' && argv[i + 1]) { args.branch = argv[++i]; continue; }
    if (argv[i] === '--sink' && argv[i + 1]) { args.sink = argv[++i]; continue; }
    if (argv[i] === '--runtime' && argv[i + 1]) { args.runtime = argv[++i]; continue; }
  }
  return args;
}

function envSessionId() {
  return process.env.KAOLA_SESSION_ID ||
    process.env.CODEX_THREAD_ID ||
    process.env.CLAUDE_SESSION_ID ||
    '';
}

function currentSessionId(args, options) {
  const existing = (args && args.session) || envSessionId();
  if (existing) return existing;
  if (options && options.fallback === false) return '';
  return crypto.randomUUID();
}

function walkToClaudePid() {
  let pid = process.ppid;
  for (let i = 0; i < 5; i++) {
    try {
      const out = execFileSync('ps', ['-o', 'ppid=,comm=', '-p', String(pid)], { encoding: 'utf8' }).trim();
      const parts = out.split(/\s+/);
      const ppidStr = parts[0];
      const comm = parts.slice(1).join(' ');
      if (/claude/i.test(comm)) return pid;
      const next = parseInt(ppidStr, 10);
      if (!next || next <= 1) return null;
      pid = next;
    } catch (_) { return null; }
  }
  return null;
}

function readClaudeStartTimeStr(pid) {
  try {
    return execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8' }).trim();
  } catch (_) { return ''; }
}

function writeIdentityFile(identityPath, data) {
  try {
    fs.mkdirSync(path.dirname(identityPath), { recursive: true });
    const content = JSON.stringify(data) + '\n';
    const fd = fs.openSync(identityPath, 'wx', 0o600);
    fs.writeSync(fd, content);
    fs.closeSync(fd);
  } catch (_) { /* silently skip race conditions */ }
}

function derivePlatformSessionId(coordRoot, options = {}) {
  if (process.env.KAOLA_KERNEL_SESSION_SKIP === '1') {
    return { sid: envSessionId() || null, source: 'skip' };
  }
  // KAOLA_KERNEL_SESSION_FAKE_PID: test-only override of walkToClaudePid return value
  const fakePid = process.env.KAOLA_KERNEL_SESSION_FAKE_PID
    ? parseInt(process.env.KAOLA_KERNEL_SESSION_FAKE_PID, 10)
    : null;
  const claudePid = fakePid || walkToClaudePid();
  if (!claudePid) return { sid: null, source: null };
  const identityPath = path.join(coordRoot, 'kaola-workflow', '.runtime', claudePid + '.identity');
  try {
    const raw = fs.readFileSync(identityPath, 'utf8');
    const data = JSON.parse(raw);
    if (!isPidAlive(claudePid)) {
      try { fs.unlinkSync(identityPath); } catch (_) {}
      return { sid: null, source: null };
    }
    const currentStart = readClaudeStartTimeStr(claudePid);
    if (!currentStart || data.claude_start_time_str !== currentStart) {
      try { fs.unlinkSync(identityPath); } catch (_) {}
      return { sid: null, source: null };
    }
    if (!isSafeName(data.sid)) {
      return { sid: null, source: 'invalid_sid' };
    }
    return { sid: data.sid, source: 'file' };
  } catch (e) {
    if (e.code !== 'ENOENT') { /* parse/ps error — treat as missing */ }
    return { sid: null, source: null };
  }
}

function writeAuditLog(coordRoot, sessionId, cmdName) {
  const auditDir = path.join(coordRoot, 'kaola-workflow', '.audit');
  const auditPath = path.join(auditDir, 'identity-override.log');
  try {
    fs.mkdirSync(auditDir, { recursive: true });
    const entry = JSON.stringify({ ts: new Date().toISOString(), invoker_sid: sessionId, cmd: cmdName, platform_override: true }) + '\n';
    fs.appendFileSync(auditPath, entry, { mode: 0o600 });
  } catch (_) {}
}

function enforcePlatformSessionOrExit(sessionId, coordRoot, args) {
  if (process.env.KAOLA_ENFORCE_PLATFORM_SESSION !== '1') return;
  if (args.platformOverride) {
    writeAuditLog(coordRoot, sessionId, process.argv[2]);
    return;
  }
  const derived = derivePlatformSessionId(coordRoot);
  if (derived.sid === null) {
    process.stderr.write('identity: no Claude ancestor; use --platform-override for non-Claude callers\n');
    process.exit(3);
  }
  if (derived.sid !== sessionId) {
    process.stderr.write('identity: SID mismatch: lock.session_id=' + sessionId + ' derived=' + derived.sid + '\n');
    process.exit(3);
  }
}

function cmdDeriveSession() {
  const args = parseArgs(process.argv.slice(3));
  const coordRoot = getCoordRoot();
  const result = derivePlatformSessionId(coordRoot);
  if (result.sid === null) {
    if (args.json) process.stdout.write(JSON.stringify({ sid: null, source: result.source }) + '\n');
    process.exit(4);
  }
  if (args.json) {
    process.stdout.write(JSON.stringify(result) + '\n');
  } else {
    process.stdout.write(result.sid + '\n');
  }
}

function assertSafeSession(sessionId, label) {
  assert(isSafeName(sessionId), (label || '--session') + ' must be a simple session id with no path separators');
}

function locksDir(coordRoot) { return path.join(coordRoot, 'kaola-workflow', '.locks'); }
function sessionsDir(coordRoot) { return path.join(coordRoot, 'kaola-workflow', '.sessions'); }
function lockPath(coordRoot, project) { return path.join(locksDir(coordRoot), project + '.lock'); }
function sessionPath(coordRoot, sessionId) { return path.join(sessionsDir(coordRoot), sessionId + '.json'); }
function tickerPidPath(coordRoot, sessionId) { return path.join(coordRoot, 'kaola-workflow', '.tickers', sessionId + '.pid'); }

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function readJsonFileWithFallback(newPath, legacyPath) {
  return readJsonFile(newPath) || readJsonFile(legacyPath);
}

function readLockFiles(coordRoot, root) {
  const dir = locksDir(coordRoot);
  const legacyDir = root ? locksDir(root) : null;
  const seen = new Set();
  const result = [];
  for (const [scanDir] of [[dir], [legacyDir]]) {
    if (!scanDir || !fs.existsSync(scanDir)) continue;
    for (const f of fs.readdirSync(scanDir).filter(x => x.endsWith('.lock'))) {
      if (seen.has(f)) continue;
      seen.add(f);
      try { result.push(JSON.parse(fs.readFileSync(path.join(scanDir, f), 'utf8'))); } catch (_) {}
    }
  }
  return result;
}

function readSessionFile(coordRoot, root, sessionId) {
  return readJsonFileWithFallback(sessionPath(coordRoot, sessionId), sessionPath(root, sessionId));
}

function readStateSession(root, project) {
  const stateFile = path.join(root, 'kaola-workflow', project, 'workflow-state.md');
  try {
    const content = fs.readFileSync(stateFile, 'utf8');
    if (!/^status:\s*active\s*$/m.test(content)) return null;
    const sessionId = field(content, 'session_id');
    return isSafeName(sessionId) ? sessionId : null;
  } catch (_) {
    return null;
  }
}

function sessionForProject(coordRoot, root, project) {
  assert(isSafeName(project), '--project must be a simple folder name with no path separators');
  try {
    const raw = fs.readFileSync(lockPath(coordRoot, project), 'utf8');
    const lock = JSON.parse(raw);
    if (isSafeName(lock.session_id)) return lock.session_id;
  } catch (_) {}
  // fallback: try legacy root location
  try {
    const raw = fs.readFileSync(lockPath(root, project), 'utf8');
    const lock = JSON.parse(raw);
    if (isSafeName(lock.session_id)) return lock.session_id;
  } catch (_) {}
  return readStateSession(root, project);
}

function activeStateSessions(root) {
  const workflowDir = path.join(root, 'kaola-workflow');
  if (!fs.existsSync(workflowDir)) return [];
  return fs.readdirSync(workflowDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .filter(entry => entry.name !== 'archive' && !entry.name.startsWith('.'))
    .map(entry => {
      const stateFile = path.join(workflowDir, entry.name, 'workflow-state.md');
      try {
        const content = fs.readFileSync(stateFile, 'utf8');
        if (!/^status:\s*active\s*$/m.test(content)) return null;
        const sessionId = field(content, 'session_id');
        return isSafeName(sessionId) ? sessionId : null;
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean);
}

function activeStateProjects(root) {
  const workflowDir = path.join(root, 'kaola-workflow');
  if (!fs.existsSync(workflowDir)) return [];
  return fs.readdirSync(workflowDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .filter(entry => entry.name !== 'archive' && !entry.name.startsWith('.'))
    .map(entry => {
      const stateFile = path.join(workflowDir, entry.name, 'workflow-state.md');
      try {
        const content = fs.readFileSync(stateFile, 'utf8');
        if (!/^status:\s*active\s*$/m.test(content)) return null;
        const sessionId = field(content, 'session_id');
        const issue = parseInt(field(content, 'issue_number'), 10);
        return {
          project: entry.name,
          session_id: isSafeName(sessionId) ? sessionId : null,
          issue_number: Number.isFinite(issue) && issue > 0 ? issue : null
        };
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean);
}

function ownedActiveProject(coordRoot, root, sessionId) {
  const candidates = [];
  for (const lock of readLockFiles(coordRoot, root)) {
    if (lock.session_id === sessionId && isSafeName(lock.project)) {
      candidates.push({
        project: lock.project,
        issue_number: lock.issue_number != null ? lock.issue_number : null,
        source: 'lock'
      });
    }
  }
  for (const state of activeStateProjects(root)) {
    if (state.session_id === sessionId && !candidates.some(candidate => candidate.project === state.project)) {
      candidates.push({
        project: state.project,
        issue_number: state.issue_number,
        source: 'workflow-state'
      });
    }
  }
  candidates.sort((a, b) => a.project.localeCompare(b.project));
  return candidates[0] || null;
}

function activeStateIssueNumbers(root) {
  const workflowDir = path.join(root, 'kaola-workflow');
  if (!fs.existsSync(workflowDir)) return new Set();
  const issues = new Set();
  for (const entry of fs.readdirSync(workflowDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'archive' || entry.name.startsWith('.')) continue;
    const stateFile = path.join(workflowDir, entry.name, 'workflow-state.md');
    try {
      const content = fs.readFileSync(stateFile, 'utf8');
      if (!/^status:\s*active\s*$/m.test(content)) continue;
      const issue = parseInt(field(content, 'issue_number'), 10);
      if (Number.isFinite(issue) && issue > 0) issues.add(issue);
    } catch (_) {}
  }
  return issues;
}

function issueAlreadyClaimed(coordRoot, root, issue) {
  return readLockFiles(coordRoot, root).some(lock => lock.issue_number === issue) ||
    activeStateIssueNumbers(root).has(issue);
}

function startupReceiptPath(coordRoot, sessionId) {
  return path.join(sessionsDir(coordRoot), sessionId + '.startup.json');
}

function readStartupReceipt(coordRoot, root, sessionId) {
  return readJsonFileWithFallback(startupReceiptPath(coordRoot, sessionId), startupReceiptPath(root, sessionId));
}

function startupReceiptAuthorizesProject(receipt, sessionId, project) {
  if (!receipt || receipt.startup_completed !== true) return false;
  if (receipt.session !== sessionId) return false;
  if (receipt.claim === 'acquired') {
    return receipt.selected_project === project && receipt.project === project;
  }
  if (receipt.claim === 'owned') {
    return receipt.project === project || receipt.selected_project === project;
  }
  return false;
}

function startupReceiptFailureReason(receipt, sessionId, project) {
  if (!receipt) return 'startup receipt missing for session ' + sessionId;
  if (receipt.startup_completed !== true) return 'startup receipt is not completed';
  if (receipt.session !== sessionId) return 'startup receipt belongs to ' + receipt.session;
  if (receipt.claim === 'none') return 'startup receipt did not acquire or own any project';
  return 'startup receipt does not authorize project ' + project;
}

function startupReceiptHandoffBlocker(receipt, sessionId, project) {
  if (!receipt) return null;
  if (receipt.startup_completed !== true || receipt.session !== sessionId) {
    return {
      type: 'startup-receipt',
      reason: startupReceiptFailureReason(receipt, sessionId, project)
    };
  }
  if (!startupReceiptAuthorizesProject(receipt, sessionId, project)) {
    return {
      type: 'startup-receipt',
      reason: startupReceiptFailureReason(receipt, sessionId, project)
    };
  }
  return null;
}

function cmdVerifyStartup() {
  const args = parseArgs(process.argv.slice(3));
  assert(args.session, '--session <id> required for verify-startup');
  assert(args.project, '--project <name> required for verify-startup');
  assertSafeSession(args.session, '--session');
  assert(isSafeName(args.project), '--project must be a simple folder name with no path separators');

  const root = getRoot();
  const coordRoot = getCoordRoot();

  // Identity check — only active under enforcement
  if (process.env.KAOLA_ENFORCE_PLATFORM_SESSION === '1') {
    const derived = derivePlatformSessionId(coordRoot);
    if (derived.sid === null) {
      process.stdout.write(JSON.stringify({ authorized: false, session: args.session, project: args.project, reason: 'no Claude ancestor' }) + '\n');
      process.exit(4);
    }
    if (derived.sid !== args.session) {
      process.stdout.write(JSON.stringify({ authorized: false, session: args.session, caller_sid: derived.sid, project: args.project, reason: 'caller platform session does not match claimed session' }) + '\n');
      process.exit(2);
    }
  }

  // Existing receipt-authorization logic:
  const receipt = readStartupReceipt(coordRoot, root, args.session);
  const authorized = startupReceiptAuthorizesProject(receipt, args.session, args.project);
  const result = {
    authorized,
    session: args.session,
    project: args.project,
    reason: authorized ? 'authorized' : startupReceiptFailureReason(receipt, args.session, args.project)
  };
  process.stdout.write(JSON.stringify(result) + '\n');
  if (!authorized) process.exitCode = 2;
}

function writeStartupReceipt(coordRoot, sessionId, data) {
  fs.mkdirSync(sessionsDir(coordRoot), { recursive: true });
  const receipt = Object.assign({
    startup_completed: true,
    session: sessionId,
    written_at: new Date().toISOString()
  }, data);
  fs.writeFileSync(startupReceiptPath(coordRoot, sessionId), JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
  return receipt;
}

function cmdSession() {
  const args = parseArgs(process.argv.slice(3));
  const root = getRoot();
  const coordRoot = getCoordRoot();

  let sessionId;
  if (args.session) {
    // Explicit --session provided: use it directly (project ownership check path)
    sessionId = args.session;
  } else {
    // No --session: derive from kernel (new behavior for issue #31)
    const derived = derivePlatformSessionId(coordRoot);
    if (derived.sid === null && process.env.KAOLA_KERNEL_SESSION_SKIP !== '1') {
      process.stderr.write('session: no Claude ancestor found (exit 4)\n');
      process.exit(4);
    }
    sessionId = derived.sid || envSessionId();
    if (!sessionId) { process.exit(4); }
  }

  assertSafeSession(sessionId, '--session/current platform session id');

  if (args.project) {
    const owner = sessionForProject(coordRoot, root, args.project);
    if (!owner) { process.exitCode = 1; return; }
    if (owner !== sessionId) {
      process.stderr.write('session: project ' + args.project + ' is owned by ' + owner + '; current session is ' + sessionId + '\n');
      process.exitCode = 2;
      return;
    }
  }

  process.stdout.write(sessionId + '\n');
}

function shouldSweep(lock) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return new Date(lock.expires).getTime() < cutoff &&
    new Date(lock.last_heartbeat).getTime() < cutoff;
}

// Design intent: production session_ids from crypto.randomUUID() never start with 'synthetic-'.
// Sessions with the 'synthetic-' prefix are test-only and swept unconditionally.
function isSyntheticTestSession(lock) {
  return !lock || !lock.session_id || String(lock.session_id).startsWith('synthetic-');
}

function worktreePathFor(root, project) {
  return path.join(path.dirname(root), path.basename(root) + '.kw', project);
}

function provisionWorktree(root, project, branch) {
  const wtPath = worktreePathFor(root, project);
  fs.mkdirSync(path.dirname(wtPath), { recursive: true });

  // Check if worktree already exists (resume case AC4)
  try {
    const listOut = execFileSync('git', ['worktree', 'list', '--porcelain'],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (listOut.includes('worktree ' + wtPath + '\n')) {
      return { path: wtPath };
    }
  } catch (_) {}

  // Check if branch exists
  let branchExists = false;
  try {
    const branchOut = execFileSync('git', ['branch', '--list', '--', branch],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    branchExists = branchOut.trim().length > 0;
  } catch (_) {}

  if (branchExists) {
    execFileSync('git', ['worktree', 'add', '--', wtPath, branch],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } else {
    execFileSync('git', ['worktree', 'add', '-b', branch, '--', wtPath, 'HEAD'],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  }

  return { path: wtPath };
}

function removeWorktree(coordRoot, project, lock) {
  if (!lock || !lock.worktree_path) return { skipped: true };
  const wtPath = lock.worktree_path;

  let wtReal;
  try {
    wtReal = fs.realpathSync(wtPath);
  } catch (e) {
    if (e.code === 'ENOENT') return { skipped: true, reason: 'already-removed' };
    throw e;
  }

  let cwdReal = '';
  try { cwdReal = fs.realpathSync(process.cwd()); } catch (_) {}

  // CWD-protection: defer if cwd is inside the worktree
  if (cwdReal === wtReal || cwdReal.startsWith(wtReal + path.sep)) {
    const pendingDir = path.join(coordRoot, 'kaola-workflow', '.pending-removal');
    fs.mkdirSync(pendingDir, { recursive: true });
    const entryPath = path.join(pendingDir, project + '.json');
    fs.writeFileSync(entryPath, JSON.stringify({ project, worktree_path: wtPath }) + '\n');
    return { deferred: true };
  }

  // Dirty check
  let isDirty = false;
  try {
    const statusOut = execFileSync('git', ['-C', wtPath, 'status', '--porcelain'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    isDirty = statusOut.trim().length > 0;
  } catch (_) {}

  if (!isDirty) {
    try {
      execFileSync('git', ['worktree', 'remove', '--force', '--', wtPath],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (_) {
      // Worktree may already be gone
    }
    return { removed: true };
  } else {
    // Abandon dirty worktree
    const now = new Date();
    const suffix = '.abandoned-' + now.toISOString().replace(/[:.]/g, '-');
    const abandonedPath = wtPath + suffix;
    try {
      fs.renameSync(wtPath, abandonedPath);
      try {
        execFileSync('git', ['worktree', 'prune'],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (_) {}
    } catch (e) {
      process.stderr.write('removeWorktree: rename failed: ' + e.message + '\n');
    }
    return { abandoned: true };
  }
}

function drainPendingRemovals(coordRoot) {
  const pendingDir = path.join(coordRoot, 'kaola-workflow', '.pending-removal');
  let files;
  try { files = fs.readdirSync(pendingDir).filter(f => f.endsWith('.json')); }
  catch (e) { if (e.code === 'ENOENT') return; throw e; }

  for (const f of files) {
    const entryPath = path.join(pendingDir, f);
    let entry;
    try { entry = JSON.parse(fs.readFileSync(entryPath, 'utf8')); } catch (_) { continue; }
    const result = removeWorktree(coordRoot, entry.project, { worktree_path: entry.worktree_path });
    if (result.removed || result.abandoned || result.skipped) {
      try { fs.unlinkSync(entryPath); } catch (_) {}
    }
    // If deferred again, leave the file for next sweep
  }
}

function buildSinkBranchName(issueNumber, project, fallbackBranch) {
  if (issueNumber == null) {
    return fallbackBranch || ('workflow/' + (project || 'unknown'));
  }
  const base = 'workflow/issue-' + issueNumber;
  if (!project || project === 'issue-' + issueNumber) return base;
  const prefix = 'issue-' + issueNumber + '-';
  const suffix = project.startsWith(prefix) ? project.slice(prefix.length) : project;
  return suffix ? base + '-' + suffix : base;
}

function buildSinkBlock(lockData) {
  const branchName = buildSinkBranchName(lockData.issue_number, lockData.project, lockData.branch);
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
    'claim_comment_id: ' + safeCommentId,
    'owner_session_id: ' + (lockData.owner_session_id || 'unverified')
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

function writeSessionFile(coordRoot, sessionId, machineId) {
  fs.mkdirSync(sessionsDir(coordRoot), { recursive: true });
  const sess = {
    session_id: sessionId,
    machine_id: machineId,
    hostname: os.hostname(),
    pid: process.pid,
    started: new Date().toISOString()
  };
  fs.writeFileSync(sessionPath(coordRoot, sessionId), JSON.stringify(sess, null, 2) + '\n', { mode: 0o600 });
}

function postGitHubClaim(issueNum, sessionId) {
  if (!issueNum) return null;
  try {
    ghExec(['label', 'create', CLAIM_LABEL, '--color', 'f9d0c4', '--description', 'Kaola-Workflow active work marker']);
  } catch (_) {}
  try {
    ghExec(['issue', 'edit', String(issueNum), '--add-label', CLAIM_LABEL]);
  } catch (e) {
    process.stderr.write('warning: failed to add ' + CLAIM_LABEL + ' label to issue #' + issueNum + ': ' + e.message + '\n');
  }
  try {
    ghExec(['issue', 'edit', String(issueNum), '--add-assignee', '@me']);
  } catch (_) {}
  const out = ghExec(['issue', 'comment', String(issueNum), '--body', buildClaimCommentBody(sessionId)]);
  const m = out.match(/issuecomment-(\d+)/);
  return m ? m[1] : null;
}

function handleTiebreakerYield(root, coordRoot, args, tbResult) {
  releaseSession(root, coordRoot, args.session, 'tiebreaker-yield', { remoteCleanup: false });
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
  assertSafeSession(args.session, '--session');
  if (args.issue != null) {
    assert(Number.isFinite(args.issue) && args.issue > 0, '--issue must be a positive integer');
  }
  assert(!args.sink || args.sink === 'merge' || args.sink === 'pr', '--sink must be "merge" or "pr"');
  assert(!args.runtime || args.runtime === 'claude' || args.runtime === 'codex',
    '--runtime must be "claude" or "codex"');
}

function buildLockData(args, machineId, now, ownerSessionId) {
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
    worktree_path: null,
    branch: null,
    owner_session_id: ownerSessionId || 'unverified',
  };
}

function roadmapDir(root) { return path.join(root, 'kaola-workflow', '.roadmap'); }

function roadmapIssuePath(root, issueNumber) {
  return path.join(roadmapDir(root), 'issue-' + issueNumber + '.md');
}

function cleanRoadmapValue(value, fallback) {
  const text = String(value == null || value === '' ? fallback : value);
  return text.replace(/[\r\n]/g, ' ').replace(/\|/g, '\\|').trim() || fallback;
}

function issueLabelNames(issue) {
  return (issue.labels || []).map(function(label) {
    return String((label && label.name) || label || '');
  }).filter(Boolean);
}

function issueHasLabel(issue, labelName) {
  return issueLabelNames(issue).includes(labelName);
}

function readPriorityConfig(root) {
  function safeReadLabels(filePath) {
    try {
      const cfg = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const arr = cfg.priority_top_tier_labels;
      if (Array.isArray(arr)) return arr.filter(function(x) { return typeof x === 'string' && x.length > 0; });
      return [];
    } catch (_) { return []; }
  }
  const globalCfgPath = path.join(os.homedir(), '.config', 'kaola-workflow', 'config.json');
  const localCfgPath = path.join(root, 'kaola-workflow', 'config.json');
  return safeReadLabels(globalCfgPath).concat(safeReadLabels(localCfgPath));
}

function parsePriorityTier(issue, topTierLabels) {
  const labels = issueLabelNames(issue);
  for (let i = 0; i < labels.length; i++) {
    if (topTierLabels.indexOf(labels[i]) !== -1) {
      return { tier: 0, priority_label: null, override_label: labels[i] };
    }
  }
  let minTier = 4;
  let minLabel = null;
  for (let i = 0; i < labels.length; i++) {
    const t = PRIORITY_TIER_BY_LABEL[labels[i]];
    if (t !== undefined && t < minTier) {
      minTier = t;
      minLabel = labels[i];
    }
  }
  return { tier: minTier, priority_label: minLabel, override_label: null };
}

function sortIssueRecords(issues, opts) {
  // opts.topTierLabels: labels forced to tier 0; omit opts for backward-compat (all tier 4)
  const topTierLabels = (opts && Array.isArray(opts.topTierLabels)) ? opts.topTierLabels : [];
  return issues.slice().sort(function(a, b) {
    const aq = issueHasLabel(a, 'workflow:queued') ? 0 : 1;
    const bq = issueHasLabel(b, 'workflow:queued') ? 0 : 1;
    if (aq !== bq) return aq - bq;
    const at = parsePriorityTier(a, topTierLabels).tier;
    const bt = parsePriorityTier(b, topTierLabels).tier;
    if (at !== bt) return at - bt;
    return Number(a.number || 0) - Number(b.number || 0);
  });
}

function readLocalRoadmapIssueRecords(root) {
  const dir = roadmapDir(root);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => /^issue-\d+\.md$/.test(f))
    .map(function(fileName) {
      const issueNumber = parseInt(fileName.match(/\d+/)[0], 10);
      const content = fs.readFileSync(path.join(dir, fileName), 'utf8');
      return {
        number: issueNumber,
        title: field(content, 'title') || 'Issue ' + issueNumber,
        state: field(content, 'status') || 'open',
        labels: [],
        url: field(content, 'url') || ''
      };
    })
    .filter(issue => Number.isFinite(issue.number) && issue.number > 0 && String(issue.state).toLowerCase() === 'open')
    .sort((a, b) => a.number - b.number);
}

function fetchOpenIssueRecords(cwd) {
  if (OFFLINE) {
    return { status: 'offline', issues: readLocalRoadmapIssueRecords(cwd) };
  }
  try {
    const raw = execFileSync('gh', [
      'issue', 'list',
      '--state', 'open',
      '--limit', '100',
      '--json', 'number,title,state,labels,updatedAt,url'
    ], { cwd, encoding: 'utf8' });
    const issues = JSON.parse(raw)
      .filter(issue => Number.isFinite(Number(issue.number)) && Number(issue.number) > 0)
      .map(issue => Object.assign({}, issue, { number: Number(issue.number) }));
    return { status: 'ok', issues: sortIssueRecords(issues) };
  } catch (_) {
    return { status: 'failed', issues: readLocalRoadmapIssueRecords(cwd) };
  }
}

function listOpenIssues(cwd) {
  return fetchOpenIssueRecords(cwd).issues.map(function(item) { return item.number; });
}

function buildRoadmapIssueContent(issue, existing) {
  const issueNumber = Number(issue.number);
  const workflowProject = field(existing || '', 'workflow_project') || '—';
  const nextStep = field(existing || '', 'next_step') || 'ready';
  const labels = issueLabelNames(issue);
  const lines = [
    'issue: #' + issueNumber,
    'title: ' + cleanRoadmapValue(issue.title, 'Issue ' + issueNumber),
    'status: open',
    'workflow_project: ' + cleanRoadmapValue(workflowProject, '—'),
    'next_step: ' + cleanRoadmapValue(nextStep, 'ready')
  ];
  if (issue.url) lines.push('url: ' + cleanRoadmapValue(issue.url, issue.url));
  if (issue.updatedAt) lines.push('updated_at: ' + cleanRoadmapValue(issue.updatedAt, issue.updatedAt));
  if (labels.length > 0) lines.push('labels: ' + labels.map(label => cleanRoadmapValue(label, label)).join(', '));
  lines.push('');
  return lines.join('\n');
}

function syncIssuesToRoadmap(root, issues) {
  if (OFFLINE) return { issue_sync: 'offline', roadmap_sync: 'offline', created: 0, updated: 0 };
  if (!issues || issues.length === 0) {
    const generated = generateRoadmap(root);
    return { issue_sync: 'ok', roadmap_sync: generated, created: 0, updated: 0 };
  }
  let created = 0;
  let updated = 0;
  fs.mkdirSync(roadmapDir(root), { recursive: true });
  for (const issue of issues) {
    const filePath = roadmapIssuePath(root, Number(issue.number));
    let existing = '';
    try { existing = fs.readFileSync(filePath, 'utf8'); } catch (_) {}
    const content = buildRoadmapIssueContent(issue, existing);
    if (!existing) created++;
    if (existing !== content) {
      fs.writeFileSync(filePath, content, 'utf8');
      if (existing) updated++;
    }
  }
  const generated = generateRoadmap(root);
  return { issue_sync: 'ok', roadmap_sync: generated, created: created, updated: updated };
}

function generateRoadmap(root) {
  const roadmapScript = path.join(path.dirname(__filename), 'kaola-workflow-roadmap.js');
  if (!fs.existsSync(roadmapScript)) return 'skipped';
  try {
    execFileSync(process.execPath, [roadmapScript, 'generate'], { cwd: root, encoding: 'utf8' });
    return 'ok';
  } catch (_) {
    return 'failed';
  }
}

function projectNameForIssue(_classifierScript, issueNumber) {
  try {
    const content = fs.readFileSync(roadmapIssuePath(getRoot(), issueNumber), 'utf8');
    const name = field(content, 'workflow_project').replace(/\|/g, '').trim();
    if (name && name !== '—') return name;
  } catch (err) {
    if (err && err.code !== 'ENOENT') {
      process.stderr.write('warn: projectNameForIssue(' + issueNumber + ') failed: ' + err.message + '\n');
    }
  }
  return 'issue-' + issueNumber;
}

function classifyIssueCandidate(classifierScript, issueNumber) {
  try {
    const raw = execFileSync(process.execPath, [classifierScript, 'classify', '--issue', String(issueNumber)], { encoding: 'utf8' });
    const result = JSON.parse(raw);
    return {
      issue: issueNumber,
      project: projectNameForIssue(classifierScript, issueNumber),
      verdict: result.verdict,
      reasoning: result.reasoning || ''
    };
  } catch (e) {
    if (e.status === 2) {
      return { issue: issueNumber, project: 'issue-' + issueNumber, verdict: 'skipped', reasoning: 'already claimed' };
    }
    return { issue: issueNumber, project: 'issue-' + issueNumber, verdict: 'skipped', reasoning: 'classifier failed' };
  }
}

function pickFirstActionableIssue(classifierScript, issues) {
  for (let i = 0; i < issues.length; i++) {
    const N = issues[i];
    try {
      const raw = execFileSync(process.execPath, [classifierScript, 'classify', '--issue', String(N)], { encoding: 'utf8' });
      const result = JSON.parse(raw);
      if (result.verdict === 'green' || result.verdict === 'yellow') {
        return { pick: N, project: projectNameForIssue(classifierScript, N), verdict: result.verdict };
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
  try {
    execFileSync(process.execPath, [claimScript, ...claimArgs], { encoding: 'utf8' });
  } catch (e) {
    if (e.status === 2) return false;
    throw e;
  }
  if (pick.verdict === 'yellow') {
    const cacheDir = path.join(getRoot(), 'kaola-workflow', pick.project, '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.appendFileSync(path.join(cacheDir, 'parallel-classifier.md'), 'parallel-classifier: shared-infra warning for issue #' + pick.pick + '\n');
  }
  return true;
}

function runBootstrapClaimFirstAvailable(claimScript, classifierScript, args) {
  if (OFFLINE || !fs.existsSync(classifierScript)) return { pick: null };
  const issues = listOpenIssues(getRoot());
  for (let i = 0; i < issues.length; i++) {
    const pick = pickFirstActionableIssue(classifierScript, issues.slice(i, i + 1));
    if (!pick.pick) continue;
    if (runBootstrapClaim(claimScript, args, pick)) return pick;
  }
  return { pick: null };
}

function cmdBootstrap() {
  const args = parseArgs(process.argv.slice(3));
  args.session = currentSessionId(args);
  assertSafeSession(args.session, '--session/current platform session id');
  const classifierScript = path.join(path.dirname(__filename), 'kaola-workflow-classifier.js');
  const root = getRoot();
  const coordRoot = getCoordRoot();
  if (process.env.KAOLA_KERNEL_SESSION_SKIP !== '1') enforcePlatformSessionOrExit(args.session, coordRoot, args);
  runBootstrapSweep(__filename, root);
  runBootstrapWatchPr(__filename, root);
  const owned = ownedActiveProject(coordRoot, root, args.session);
  if (owned) {
    process.stdout.write(JSON.stringify({
      project: owned.project,
      issue: owned.issue_number,
      verdict: 'owned',
      session: args.session,
      resumed: true
    }) + '\n');
    return;
  }
  const pick = runBootstrapClaimFirstAvailable(__filename, classifierScript, args);
  if (!pick.pick) {
    process.stderr.write('bootstrap: no unclaimed work available for session ' + args.session + '\n');
    process.exitCode = 1;
    return;
  }
  process.stdout.write(JSON.stringify({ project: pick.project, issue: pick.pick, verdict: pick.verdict, session: args.session }) + '\n');
}

function runStartupClaimFirstAvailable(claimScript, classifierScript, args, issues, skipped, blocked) {
  if (!fs.existsSync(classifierScript)) return { pick: null };
  for (const issue of issues) {
    const issueNumber = Number(issue.number || issue);
    if (!Number.isFinite(issueNumber) || issueNumber <= 0) continue;
    const candidate = classifyIssueCandidate(classifierScript, issueNumber);
    if (candidate.verdict === 'blocked') {
      blocked.push({ issue: issueNumber, reason: candidate.reasoning });
      continue;
    }
    if (candidate.verdict !== 'green' && candidate.verdict !== 'yellow') {
      skipped.push({ issue: issueNumber, verdict: candidate.verdict, reason: candidate.reasoning });
      continue;
    }
    const pick = { pick: issueNumber, project: candidate.project, verdict: candidate.verdict };
    if (runBootstrapClaim(claimScript, args, pick)) return pick;
    skipped.push({ issue: issueNumber, verdict: 'skipped', reason: 'claim race or existing lock' });
  }
  return { pick: null };
}

function cmdStartup() {
  const args = parseArgs(process.argv.slice(3));
  args.session = currentSessionId(args);
  assertSafeSession(args.session, '--session/current platform session id');
  assert(!args.sink || args.sink === 'merge' || args.sink === 'pr', '--sink must be "merge" or "pr"');
  assert(!args.runtime || args.runtime === 'claude' || args.runtime === 'codex',
    '--runtime must be "claude" or "codex"');

  const root = getRoot();
  const topTierLabels = readPriorityConfig(root);
  const coordRoot = getCoordRoot();
  if (process.env.KAOLA_KERNEL_SESSION_SKIP !== '1') enforcePlatformSessionOrExit(args.session, coordRoot, args);
  const classifierScript = path.join(path.dirname(__filename), 'kaola-workflow-classifier.js');
  const issueFetch = fetchOpenIssueRecords(root);
  const sortedIssues = issueFetch.issues.length > 0
    ? sortIssueRecords(issueFetch.issues, { topTierLabels })
    : issueFetch.issues;
  const ranking = sortedIssues.map(function(issue) {
    const t = parsePriorityTier(issue, topTierLabels);
    return { issue: Number(issue.number), tier: t.tier, priority_label: t.priority_label, override_label: t.override_label };
  });
  const sync = issueFetch.status === 'ok'
    ? syncIssuesToRoadmap(root, sortedIssues)
    : (issueFetch.status === 'offline'
      ? { issue_sync: 'offline', roadmap_sync: 'offline', created: 0, updated: 0 }
      : { issue_sync: 'failed', roadmap_sync: 'skipped', created: 0, updated: 0 });
  const skipped = [];
  const blocked = [];

  runBootstrapSweep(__filename, root);
  runBootstrapWatchPr(__filename, root);

  const owned = ownedActiveProject(coordRoot, root, args.session);
  if (owned) {
    const receipt = writeStartupReceipt(coordRoot, args.session, {
      runtime: args.runtime || 'claude',
      issue_sync: sync.issue_sync,
      roadmap_sync: sync.roadmap_sync,
      issue_source: issueFetch.status,
      project: owned.project,
      issue: owned.issue_number,
      selected_issue: owned.issue_number,
      selected_project: owned.project,
      verdict: 'owned',
      claim: 'owned',
      skipped: skipped,
      blocked: blocked,
      ranking: ranking
    });
    process.stdout.write(JSON.stringify(receipt) + '\n');
    return;
  }

  const pick = runStartupClaimFirstAvailable(__filename, classifierScript, args, sortedIssues, skipped, blocked);
  if (!pick.pick) {
    const receipt = writeStartupReceipt(coordRoot, args.session, {
      runtime: args.runtime || 'claude',
      issue_sync: sync.issue_sync,
      roadmap_sync: sync.roadmap_sync,
      issue_source: issueFetch.status,
      project: null,
      issue: null,
      selected_issue: null,
      selected_project: null,
      verdict: 'none',
      claim: 'none',
      skipped: skipped,
      blocked: blocked,
      ranking: ranking
    });
    process.stderr.write('startup: no unclaimed work available for session ' + args.session + '\n');
    process.stdout.write(JSON.stringify(receipt) + '\n');
    process.exitCode = 1;
    return;
  }

  const receipt = writeStartupReceipt(coordRoot, args.session, {
    runtime: args.runtime || 'claude',
    issue_sync: sync.issue_sync,
    roadmap_sync: sync.roadmap_sync,
    issue_source: issueFetch.status,
    project: pick.project,
    issue: pick.pick,
    selected_issue: pick.pick,
    selected_project: pick.project,
    verdict: pick.verdict,
    claim: 'acquired',
    skipped: skipped,
    blocked: blocked,
    ranking: ranking
  });
  process.stdout.write(JSON.stringify(receipt) + '\n');
}

function cmdClaim() {
  const args = parseArgs(process.argv.slice(3));
  validateClaimArgs(args);

  const root = getRoot();
  const coordRoot = getCoordRoot();
  // Derive owner_session_id BEFORE enforcement check so it's always available
  const ownerSid = derivePlatformSessionId(coordRoot).sid || 'unverified';
  enforcePlatformSessionOrExit(args.session, coordRoot, args);
  const machineId = getMachineId();
  const now = new Date();

  migrateLegacyCoordState(root, coordRoot);
  fs.mkdirSync(locksDir(coordRoot), { recursive: true });

  const lp = lockPath(coordRoot, args.project);

  // Resume-detection BEFORE issueAlreadyClaimed and writeLockFile
  const existingLock = readJsonFile(lp);
  if (existingLock && existingLock.session_id === args.session) {
    if (existingLock.worktree_path && fs.existsSync(existingLock.worktree_path)) {
      // AC4: reuse existing worktree
      process.stderr.write('claim: resuming existing worktree at ' + existingLock.worktree_path + '\n');
      const stateFile2 = path.join(root, 'kaola-workflow', args.project, 'workflow-state.md');
      updateSinkLease(stateFile2, existingLock);
      return;
    }
    if (existingLock.worktree_path && !fs.existsSync(existingLock.worktree_path)) {
      // AC11: loud failure with actionable recovery instructions
      process.stderr.write(
        'worktree missing at ' + existingLock.worktree_path + ' for project ' + args.project + '\n' +
        'recover with:\n' +
        '  git worktree add ' + existingLock.worktree_path + ' ' + (existingLock.branch || '<branch>') + '\n' +
        '  node scripts/kaola-workflow-claim.js patch-branch --project ' + args.project +
          ' --session ' + args.session + ' --branch ' + (existingLock.branch || '<branch>') + '\n'
      );
      process.exitCode = 2;
      return;
    }
    // Legacy: pre-Phase-4 lock has no worktree_path field — upgrade it in place
    if (!existingLock.worktree_path) {
      const legacyBranch = buildSinkBranchName(
        args.issue != null ? args.issue : existingLock.issue_number,
        args.project,
        args.branch
      );
      let legacyWtPath = null;
      if (!OFFLINE) {
        let hasGitHistory = false;
        try {
          execFileSync('git', ['rev-parse', 'HEAD'],
            { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
          hasGitHistory = true;
        } catch (_) {}
        if (hasGitHistory) {
          try {
            const wtResult = provisionWorktree(root, args.project, legacyBranch);
            legacyWtPath = wtResult.path;
          } catch (e) {
            process.stderr.write('claim: provisionWorktree failed: ' + e.message + '\n');
            process.exitCode = 2;
            return;
          }
        }
      }
      const patchedLock = Object.assign({}, existingLock, { worktree_path: legacyWtPath, branch: legacyBranch });
      fs.writeFileSync(lp, JSON.stringify(patchedLock, null, 2) + '\n', { mode: 0o600 });
      const stateFileLegacy = path.join(root, 'kaola-workflow', args.project, 'workflow-state.md');
      updateSinkLease(stateFileLegacy, patchedLock);
      return;
    }
  }

  if (args.issue != null && issueAlreadyClaimed(coordRoot, root, args.issue)) {
    process.exitCode = 2;
    return;
  }

  const lockData = buildLockData(args, machineId, now, ownerSid);

  // Single O_EXCL attempt — NO retry (retrying changes semantics)
  try { writeLockFile(lp, lockData); }
  catch (e) { if (e.code === 'EEXIST' || e.code === 'EACCES') { process.exitCode = 2; return; } throw e; }

  writeSessionFile(coordRoot, args.session, machineId);

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
      handleTiebreakerYield(root, coordRoot, args, tbResult);
      return;
    }
  }

  // provisionWorktree (after tiebreaker — no worktree created on yield)
  const branch = buildSinkBranchName(args.issue, args.project, args.branch);
  let wtPath = null;
  if (!OFFLINE) {
    // Check if root is a real git repo with at least one commit before attempting worktree provisioning
    let hasGitHistory = false;
    try {
      execFileSync('git', ['rev-parse', 'HEAD'],
        { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      hasGitHistory = true;
    } catch (_) {}

    if (hasGitHistory) {
      try {
        const wtResult = provisionWorktree(root, args.project, branch);
        wtPath = wtResult.path;
      } catch (e) {
        releaseSession(root, coordRoot, args.session, 'worktree-provision-failed', { remoteCleanup: false });
        process.stderr.write('claim: provisionWorktree failed: ' + e.message + '\n');
        process.exitCode = 2;
        return;
      }
    }
  }

  const finalLock = Object.assign({}, lockData,
    commentId !== null ? { claim_comment_id: commentId } : {},
    { worktree_path: wtPath, branch });
  fs.writeFileSync(lp, JSON.stringify(finalLock, null, 2) + '\n', { mode: 0o600 });

  const stateFile = path.join(root, 'kaola-workflow', args.project, 'workflow-state.md');
  updateSinkLease(stateFile, finalLock);
}

function lockDataFromState(root, args, machineId, now) {
  const stateFile = path.join(root, 'kaola-workflow', args.project, 'workflow-state.md');
  if (!fs.existsSync(stateFile)) return null;
  const content = fs.readFileSync(stateFile, 'utf8');
  if (!/^status:\s*active\s*$/m.test(content)) return null;
  const issue = parseInt(field(content, 'issue_number'), 10);
  const prNumber = parseInt(field(content, 'pr_number'), 10);
  const claimCommentId = field(content, 'claim_comment_id');
  return {
    project: args.project,
    session_id: args.session,
    machine_id: machineId,
    claimed_at: field(content, 'claimed_at') || now.toISOString(),
    expires: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
    last_heartbeat: now.toISOString(),
    issue_number: Number.isFinite(issue) && issue > 0 ? issue : (args.issue != null ? args.issue : null),
    claim_comment_id: /^\d+$/.test(claimCommentId) ? claimCommentId : null,
    sink: field(content, 'sink') === 'pr' ? 'pr' : 'merge',
    pr_url: field(content, 'pr_url') || null,
    pr_number: Number.isFinite(prNumber) && prNumber > 0 ? prNumber : null,
    runtime: args.runtime || 'claude'
  };
}

function isPidAlive(pid) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch (_) {
    return false;
  }
}

function fileMtimeMs(filePath) {
  try {
    return fs.statSync(filePath).mtime.getTime();
  } catch (_) {
    return 0;
  }
}

function claudeProjectDirForRoot(root) {
  // Match Claude Code's on-disk encoding: every '/', '\\', and '.' in the
  // resolved repo path becomes '-'. Observed format under ~/.claude/projects/.
  const encoded = path.resolve(root).replace(/[./\\]/g, '-');
  return path.join(os.homedir(), '.claude', 'projects', encoded);
}

function claudeSessionPathForRoot(root, sessionId) {
  return path.join(claudeProjectDirForRoot(root), sessionId + '.jsonl');
}

function localOwnerLiveness(root, coordRoot, ownerSession, lock, now) {
  const evidence = [];
  const claudeSessionPath = claudeSessionPathForRoot(root, ownerSession);
  const claudeMtime = fileMtimeMs(claudeSessionPath);
  if (claudeMtime && (now.getTime() - claudeMtime) <= RECENT_CLAUDE_SESSION_MS) {
    evidence.push({
      type: 'claude-session-jsonl',
      path: claudeSessionPath,
      age_ms: now.getTime() - claudeMtime
    });
  }

  const tickerPath = tickerPidPath(coordRoot, ownerSession);
  let tickerPid = '';
  try { tickerPid = fs.readFileSync(tickerPath, 'utf8').trim(); } catch (_) {}
  if (tickerPid && isPidAlive(tickerPid)) {
    evidence.push({ type: 'ticker-pid', path: tickerPath, pid: Number(tickerPid) });
  }

  if (lock && lock.expires && new Date(lock.expires).getTime() > now.getTime()) {
    evidence.push({ type: 'lock-not-expired', expires: lock.expires });
  }

  if (lock && lock.last_heartbeat) {
    const hb = new Date(lock.last_heartbeat).getTime();
    if (Number.isFinite(hb) && (now.getTime() - hb) <= RECENT_HEARTBEAT_MS) {
      evidence.push({ type: 'recent-heartbeat', last_heartbeat: lock.last_heartbeat, age_ms: now.getTime() - hb });
    }
  }

  return evidence;
}

function handoffDecision(root, coordRoot, args, existing, previous, now) {
  const force = args.forceLiveTakeover === true;
  const blockers = [];
  const receipt = readStartupReceipt(coordRoot, root, args.session);
  const receiptBlocker = startupReceiptHandoffBlocker(receipt, args.session, args.project);
  if (!force && receiptBlocker) {
    blockers.push(receiptBlocker);
  }

  if (previous && previous !== args.session) {
    const liveness = localOwnerLiveness(root, coordRoot, previous, existing, now);
    for (const item of liveness) blockers.push(item);
  }

  return {
    allowed: force || blockers.length === 0,
    forced: force,
    project: args.project,
    requested_session: args.session,
    previous_session: previous || null,
    blockers
  };
}

function cmdCanHandoff() {
  const args = parseArgs(process.argv.slice(3));
  assert(args.project, '--project <name> required for can-handoff');
  assert(args.session, '--session <id> required for can-handoff');
  assert(isSafeName(args.project), '--project must be a simple folder name with no path separators');
  assertSafeSession(args.session, '--session');

  const root = getRoot();
  const coordRoot = getCoordRoot();
  const now = new Date();
  const lp = lockPath(coordRoot, args.project);
  const existing = readJsonFile(lp);
  const previous = existing && isSafeName(existing.session_id)
    ? existing.session_id
    : sessionForProject(coordRoot, root, args.project);
  const decision = handoffDecision(root, coordRoot, args, existing, previous, now);
  process.stdout.write(JSON.stringify(decision, null, 2) + '\n');
  if (!decision.allowed) process.exitCode = 2;
}

function cmdHandoff() {
  const args = parseArgs(process.argv.slice(3));
  assert(args.project, '--project <name> required for handoff');
  assert(args.session, '--session <id> required for handoff');
  assert(isSafeName(args.project), '--project must be a simple folder name with no path separators');
  assertSafeSession(args.session, '--session');
  assert(!args.runtime || args.runtime === 'claude' || args.runtime === 'codex',
    '--runtime must be "claude" or "codex"');

  const root = getRoot();
  const coordRoot = getCoordRoot();
  enforcePlatformSessionOrExit(args.session, coordRoot, args);
  const machineId = getMachineId();
  const now = new Date();
  fs.mkdirSync(locksDir(coordRoot), { recursive: true });

  const lp = lockPath(coordRoot, args.project);
  const existing = readJsonFile(lp);
  const previous = existing && isSafeName(existing.session_id)
    ? existing.session_id
    : sessionForProject(coordRoot, root, args.project);

  const decision = handoffDecision(root, coordRoot, args, existing, previous, now);
  if (!decision.allowed) {
    process.stderr.write('handoff rejected: ' + decision.blockers.map(function(item) {
      return item.type + (item.reason ? ': ' + item.reason : '');
    }).join('; ') + '\n');
    process.exitCode = 2;
    return;
  }

  let lockData;
  if (existing) {
    lockData = Object.assign({}, existing, {
      session_id: args.session,
      machine_id: machineId,
      expires: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
      last_heartbeat: now.toISOString(),
      runtime: args.runtime || existing.runtime || 'claude'
    });
  } else {
    lockData = lockDataFromState(root, args, machineId, now);
  }

  assert(lockData, 'handoff: no active lock or workflow-state found for project ' + args.project);
  lockData.project = args.project;
  lockData.session_id = args.session;
  lockData.machine_id = machineId;

  fs.writeFileSync(lp, JSON.stringify(lockData, null, 2) + '\n', { mode: 0o600 });
  writeSessionFile(coordRoot, args.session, machineId);

  const stateFile = path.join(root, 'kaola-workflow', args.project, 'workflow-state.md');
  updateSinkLease(stateFile, lockData);
  writeStartupReceipt(coordRoot, args.session, {
    runtime: lockData.runtime || args.runtime || 'claude',
    issue_sync: 'handoff',
    roadmap_sync: 'unchanged',
    issue_source: 'handoff',
    project: args.project,
    issue: lockData.issue_number,
    selected_issue: lockData.issue_number,
    selected_project: args.project,
    verdict: 'owned',
    claim: 'owned',
    skipped: [],
    blocked: [],
    handoff: {
      previous_session: previous || null,
      forced: decision.forced
    }
  });

  const safeCommentId = /^\d+$/.test(String(lockData.claim_comment_id || '')) ? String(lockData.claim_comment_id) : null;
  if (!OFFLINE && safeCommentId) {
    try {
      const repo = getRepoOwnerName();
      if (repo) {
        ghExec(['api', '--method', 'PATCH',
          'repos/' + repo.owner + '/' + repo.name + '/issues/comments/' + safeCommentId,
          '-f', 'body=' + buildClaimCommentBody(lockData.session_id, now.toISOString())]);
      }
    } catch (_) {}
  }

  process.stdout.write(JSON.stringify({
    project: args.project,
    previous_session: previous || null,
    session: args.session
  }) + '\n');
}

function releaseSession(root, coordRoot, sessionId, reason, options) {
  const locks = readLockFiles(coordRoot, root);
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
      ghExec(['issue', 'edit', String(match.issue_number), '--remove-label', CLAIM_LABEL, '--remove-assignee', '@me']);
    } catch (_) {}
  }

  try { fs.unlinkSync(lockPath(coordRoot, match.project)); } catch (_) {}
  try { fs.unlinkSync(sessionPath(coordRoot, sessionId)); } catch (_) {}

  // Clear status: active in workflow-state.md so issueAlreadyClaimed no longer
  // finds this issue via activeStateIssueNumbers after the lock is gone.
  const stateFile = path.join(root, 'kaola-workflow', match.project, 'workflow-state.md');
  try {
    const content = fs.readFileSync(stateFile, 'utf8');
    const updated = content.replace(/^status:\s*active\s*$/m, 'status: released');
    if (updated !== content) fs.writeFileSync(stateFile, updated);
  } catch (_) {}

  return true;
}

function archiveProjectDir(root, project, statusValue) {
  // Validates project name, writes status/step to workflow-state.md (before rename),
  // then renames kaola-workflow/{project}/ → kaola-workflow/archive/{project}/
  // Returns { archived: true, dest } or { skipped: 'source-missing' } if src gone.
  if (!isSafeName(project)) throw new Error('archiveProjectDir: unsafe project name: ' + project);
  const srcDir = path.join(root, 'kaola-workflow', project);
  if (!fs.existsSync(srcDir)) return { skipped: 'source-missing' };
  const stateFile = path.join(srcDir, 'workflow-state.md');
  try {
    let content = fs.readFileSync(stateFile, 'utf8');
    content = content.replace(/^status:\s*\S+.*$/m, 'status: ' + statusValue);
    if (!/^status:/m.test(content)) content += '\nstatus: ' + statusValue;
    content = content.replace(/^step:\s*\S+.*$/m, 'step: complete');
    if (!/^step:/m.test(content)) content += '\nstep: complete';
    fs.writeFileSync(stateFile, content);
  } catch (e) {
    process.stderr.write('archiveProjectDir: state update failed for ' + project + ': ' + e.message + '\n');
  }
  const archiveBase = path.join(root, 'kaola-workflow', 'archive');
  fs.mkdirSync(archiveBase, { recursive: true });
  let destDir = path.join(archiveBase, project);
  if (fs.existsSync(destDir)) {
    destDir = destDir + '.archived-' + new Date().toISOString().replace(/[:.]/g, '-');
  }
  fs.renameSync(srcDir, destDir);
  return { archived: true, dest: destDir };
}

function cmdFinalize() {
  const args = parseArgs(process.argv.slice(3));
  assert(args.project, '--project <name> required for finalize');
  assert(args.session, '--session <id> required for finalize');
  assertSafeSession(args.session);
  if (!isSafeName(args.project)) { process.stderr.write('finalize: unsafe project name\n'); process.exitCode = 1; return; }
  const root = getRoot();
  const coordRoot = getCoordRoot();
  enforcePlatformSessionOrExit(args.session, coordRoot, args);
  const lp = lockPath(coordRoot, args.project);
  if (!fs.existsSync(lp)) {
    process.stderr.write('finalize: no lock file for project ' + args.project + '\n');
    process.exitCode = 1;
    return;
  }
  let lock;
  try { lock = JSON.parse(fs.readFileSync(lp, 'utf8')); } catch (e) {
    process.stderr.write('finalize: cannot read lock: ' + e.message + '\n');
    process.exitCode = 1;
    return;
  }
  if (lock.session_id !== args.session) {
    process.stderr.write('finalize: session mismatch — lock owned by ' + lock.session_id + '\n');
    process.exitCode = 1;
    return;
  }
  const result = archiveProjectDir(root, args.project, 'closed');
  if (result.skipped === 'source-missing') {
    process.stdout.write(JSON.stringify({ already: true }) + '\n');
    return;
  }
  process.stdout.write(JSON.stringify({ archived: true, dest: result.dest, status: 'closed' }) + '\n');
}

function cmdRelease() {
  const args = parseArgs(process.argv.slice(3));
  assert(args.session, '--session <id> required for release');
  const root = getRoot();
  const coordRoot = getCoordRoot();
  enforcePlatformSessionOrExit(args.session, coordRoot, args);
  releaseSession(root, coordRoot, args.session);
}

function cmdHeartbeat() {
  const args = parseArgs(process.argv.slice(3));
  assert(args.session, '--session <id> required for heartbeat');

  const root = getRoot();
  const coordRoot = getCoordRoot();
  enforcePlatformSessionOrExit(args.session, coordRoot, args);
  const locks = readLockFiles(coordRoot, root);
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

  const lp = lockPath(coordRoot, match.project);
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
  if (tickCtx.claudePid && !isPidAlive(tickCtx.claudePid)) {
    process.stderr.write('ticker: Claude ancestor PID ' + tickCtx.claudePid + ' gone; exiting gracefully\n');
    try { fs.unlinkSync(tickCtx.pidPath); } catch (_) {}
    process.exit(0);
  }
  tickCtx.tickCountRef.value++;
  const tickCount = tickCtx.tickCountRef.value;
  const locks = readLockFiles(tickCtx.coordRoot, tickCtx.root);
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
  const lp = lockPath(tickCtx.coordRoot, match.project);
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
      releaseSession(tickCtx.root, tickCtx.coordRoot, tickCtx.session, 'ticker-late-yield', { remoteCleanup: false });
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
  if (!isSafeName(args.session)) { process.stderr.write('ticker: --session must be a simple session id with no path separators\n'); process.exitCode = 1; return; }
  const intervalMs = (function() {
    for (let i = 3; i < process.argv.length - 1; i++) {
      if (process.argv[i] === '--interval') return parseInt(process.argv[i + 1], 10) || (15 * 60 * 1000);
    }
    return 15 * 60 * 1000;
  })();
  const root = getRoot();
  const coordRoot = getCoordRoot();
  const tickersDir = path.join(coordRoot, 'kaola-workflow', '.tickers');
  fs.mkdirSync(tickersDir, { recursive: true });
  const pidPath = tickerPidPath(coordRoot, args.session);
  if (acquirePidFile(pidPath) === null) return;
  enforcePlatformSessionOrExit(args.session, coordRoot, args);
  function gracefulShutdown() { try { fs.unlinkSync(pidPath); } catch (_) {} process.exit(0); }
  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT',  gracefulShutdown);
  const tickCtx = { root, coordRoot, session: args.session, pidPath, intervalMs, tickCountRef: { value: 0 } };
  tickCtx.claudePid = walkToClaudePid();  // null if not under Claude
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
  const args = parseArgs(process.argv.slice(3));
  const root = getRoot();
  const coordRoot = getCoordRoot();
  enforcePlatformSessionOrExit(args.session || '', coordRoot, args);
  const dir = locksDir(coordRoot);
  if (!fs.existsSync(dir)) return;

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.lock'));
  for (const f of files) {
    const fp = path.join(dir, f);
    let lock;
    try {
      lock = JSON.parse(fs.readFileSync(fp, 'utf8'));
    } catch (_) { continue; }

    const synthetic = isSyntheticTestSession(lock);
    if (!synthetic && !shouldSweep(lock)) continue;
    if (!synthetic && !isRemoteStale(lock)) continue;

    if (!OFFLINE && lock.issue_number != null) {
      try {
        ghExec(['issue', 'edit', String(lock.issue_number), '--remove-label', CLAIM_LABEL]);
      } catch (_) {}
      try {
        ghExec(['issue', 'edit', String(lock.issue_number), '--remove-assignee', '@me']);
      } catch (_) {}
      postReleaseComment(lock.issue_number, lock.session_id, ':released-stale');
    }
    try { fs.unlinkSync(fp); } catch (_) {}
  }

  const runtimeDir = path.join(coordRoot, 'kaola-workflow', '.runtime');
  try {
    for (const f of fs.readdirSync(runtimeDir).filter(x => x.endsWith('.identity'))) {
      const pid = parseInt(f, 10);
      if (!isPidAlive(pid)) {
        try { fs.unlinkSync(path.join(runtimeDir, f)); } catch (_) {}
      }
    }
  } catch (e) { if (e.code !== 'ENOENT') process.stderr.write('sweep: runtime dir error: ' + e.message + '\n'); }

  try {
    execFileSync('git', ['worktree', 'prune'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (_) {}
  drainPendingRemovals(coordRoot);

  // Second pass: GC orphaned active dirs with expired leases and no phase artifacts
  const GC_CUTOFF_MS = 30 * 60 * 1000; // 30 minutes
  const cutoff = Date.now() - GC_CUTOFF_MS;
  const kwDir = path.join(root, 'kaola-workflow');
  let kwEntries = [];
  try { kwEntries = fs.readdirSync(kwDir, { withFileTypes: true }); } catch (_) {}
  for (const entry of kwEntries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'archive' || entry.name.startsWith('.')) continue;
    if (!isSafeName(entry.name)) continue;
    const dirPath = path.join(kwDir, entry.name);
    // Phase-artifacts-empty guard: skip if any phase*.md exists (real in-flight work)
    let dirFiles = [];
    try { dirFiles = fs.readdirSync(dirPath); } catch (_) { continue; }
    if (dirFiles.some(f => /^phase\d/.test(f))) continue;
    const stateContent = (() => {
      try { return fs.readFileSync(path.join(dirPath, 'workflow-state.md'), 'utf8'); } catch (_) { return ''; }
    })();
    if (field(stateContent, 'status') !== 'active') continue;
    if (fs.existsSync(lockPath(coordRoot, entry.name)) || fs.existsSync(lockPath(root, entry.name))) continue;
    const expiresStr = field(stateContent, 'expires');
    if (!expiresStr) continue;
    const expiresMs = new Date(expiresStr).getTime();
    if (isNaN(expiresMs) || expiresMs >= cutoff) continue;
    try { archiveProjectDir(root, entry.name, 'abandoned'); } catch (_) {}
  }
}

function cmdStatus() {
  const args = parseArgs(process.argv.slice(3));
  const root = getRoot();
  const coordRoot = getCoordRoot();
  const locks = readLockFiles(coordRoot, root);

  const filtered = args.session
    ? locks.filter(l => l.session_id === args.session)
    : locks;

  const results = filtered.map(lock => {
    if (!isSafeName(lock.session_id)) {
      return { session: null, lock, remote: { assignee: null, has_label: null, sentinel_comment_id: null }, consistent: false, drift: ['session_id unsafe'] };
    }
    const session = readSessionFile(coordRoot, root, lock.session_id);

    let remote = { assignee: null, has_label: null, sentinel_comment_id: null };
    if (!OFFLINE && lock.issue_number != null) {
      try {
        const raw = ghExec(['issue', 'view', String(lock.issue_number), '--json', 'assignees,labels']);
        const data = JSON.parse(raw);
        const assignees = (data.assignees || []).map(a => a.login);
        const labels = (data.labels || []).map(l => l.name);
        remote = {
          assignee: assignees.join(',') || null,
          has_label: labels.includes(CLAIM_LABEL),
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
  assertSafeSession(args.session, '--session');
  assert(typeof args.branch === 'string' && args.branch.length > 0
    && !args.branch.includes('\0') && !args.branch.includes('\n') && !args.branch.includes('\r')
    && args.branch !== '.' && args.branch !== '..', '--branch is invalid');

  const root = getRoot();
  const coordRoot = getCoordRoot();
  enforcePlatformSessionOrExit(args.session, coordRoot, args);
  const lp = lockPath(coordRoot, args.project);
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
  const coordRoot = getCoordRoot();
  enforcePlatformSessionOrExit(args.session || '', coordRoot, args);
  const dir = locksDir(coordRoot);
  if (!fs.existsSync(dir)) return;

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.lock'));
  for (const f of files) {
    const fp = path.join(dir, f);
    let lock;
    try { lock = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (_) { continue; }

    if (args.issue != null && lock.issue_number !== args.issue) continue;
    if (!isSafeName(lock.project)) continue;
    if (!isSafeName(lock.session_id)) continue;

    const branchOrUrl = (lock.pr_url && lock.pr_url.startsWith('https://'))
      ? lock.pr_url
      : (lock.branch || buildSinkBranchName(lock.issue_number, lock.project));

    let prData;
    try {
      const raw = ghExec(['pr', 'view', '--', branchOrUrl, '--json', 'state,mergedAt,url,number,closedAt']);
      if (!raw) continue;
      prData = JSON.parse(raw);
    } catch (_) {
      process.stderr.write('watch-pr: gh pr view failed for ' + branchOrUrl + '\n');
      continue;
    }

    const state = (prData.state || '').toUpperCase();
    const branchName = lock.branch || buildSinkBranchName(lock.issue_number, lock.project);

    if (state === 'MERGED') {
      try { removeWorktree(coordRoot, lock.project, lock); } catch (_) {}
      releaseSession(root, coordRoot, lock.session_id, 'merged');
      try {
        execFileSync('git', ['branch', '-D', '--', branchName], { encoding: 'utf8' });
      } catch (_) {}
    } else if (state === 'CLOSED') {
      try { removeWorktree(coordRoot, lock.project, lock); } catch (_) {}
      releaseSession(root, coordRoot, lock.session_id, 'aborted');
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

function buildClaimedBranchSet(root, offline) {
  let claimedBranches = new Set();
  try {
    const localBranches = execFileSync('git', ['branch', '--list', 'workflow/issue-*'],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    localBranches.split('\n').filter(Boolean).forEach(b => claimedBranches.add(b.trim().replace(/^[*+]\s*/, '')));
  } catch (_) {}

  if (!offline) {
    try {
      const remoteBranches = execFileSync('git', ['ls-remote', '--heads', 'origin', 'refs/heads/workflow/issue-*'],
        { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
      remoteBranches.split('\n').filter(Boolean).forEach(line => {
        const branch = line.split('\t')[1]?.replace('refs/heads/', '');
        if (branch) claimedBranches.add(branch);
      });
    } catch (_) {}
  }
  return claimedBranches;
}

function fetchOpenIssues(root, offline) {
  let openIssues = [];
  if (!offline) {
    try {
      const ghOut = execFileSync('gh', ['issue', 'list', '--json', 'number,title,state,labels,assignees,updatedAt,url', '--state', 'open'],
        { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      openIssues = JSON.parse(ghOut);
    } catch (_) {}
  }
  if (openIssues.length === 0) {
    // Offline fallback: read ROADMAP.md
    try {
      const roadmap = fs.readFileSync(path.join(root, 'kaola-workflow', 'ROADMAP.md'), 'utf8');
      const re = /#(\d+)/g;
      let m;
      while ((m = re.exec(roadmap)) !== null) {
        const n = parseInt(m[1], 10);
        if (!openIssues.find(i => i.number === n)) openIssues.push({ number: n });
      }
    } catch (_) {}
  }
  return openIssues;
}

function cmdPickNext() {
  const args = parseArgs(process.argv.slice(3));
  const root = getRoot();

  const claimedBranches = buildClaimedBranchSet(root, OFFLINE);

  const openIssues = fetchOpenIssues(root, OFFLINE);

  // Filter to unclaimed
  const unclaimed = openIssues.filter(issue => {
    const branch = 'workflow/issue-' + issue.number;
    return !claimedBranches.has(branch);
  });

  if (unclaimed.length === 0) {
    process.stdout.write(JSON.stringify({ verdict: 'none', reason: 'no-unclaimed-issues' }) + '\n');
    return;
  }

  // Try to provision worktree for first unclaimed
  for (const issue of unclaimed) {
    const project = 'issue-' + issue.number;
    const branch = buildSinkBranchName(issue.number, null);
    try {
      const wtResult = provisionWorktree(root, project, branch);
      // Set label online
      if (!OFFLINE) {
        try {
          execFileSync('gh', ['issue', 'edit', String(issue.number), '--add-label', CLAIM_LABEL],
            { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
        } catch (_) {}
      }
      const result = {
        verdict: 'acquired',
        issue: issue.number,
        project,
        branch,
        worktree_path: wtResult.path,
        session: args.session || null,
        runtime: args.runtime || null,
        sink: args.sink || null
      };
      process.stdout.write(JSON.stringify(result) + '\n');
      return;
    } catch (_) {
      // Lost race or provisioning failed — try next
      process.stderr.write('pick-next: provisionWorktree failed for ' + project + ': ' + _.message + '\n');
    }
  }

  process.stdout.write(JSON.stringify({ verdict: 'none', reason: 'no-unclaimed-issues' }) + '\n');
}

function findMainWorktree() {
  let mainWorktree = null;
  try {
    const wtList = execFileSync('git', ['worktree', 'list', '--porcelain'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const lines = wtList.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('worktree ')) {
        mainWorktree = lines[i].slice('worktree '.length).trim();
        break;
      }
    }
  } catch (_) {}
  return mainWorktree;
}

function detectCurrentProject(args) {
  let project = args.project || null;
  if (!project) {
    try {
      const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
      const m = branch.match(/^workflow\/issue-(\d+)/);
      if (m) project = 'issue-' + m[1];
    } catch (_) {}
  }
  return project;
}

function scanPhaseArtifacts(projectDir) {
  const project = path.basename(projectDir);
  const PHASE_ARTIFACTS = [
    { file: 'phase6-summary.md',  phase: 6, next: 'complete' },
    { file: 'phase5-review.md',   phase: 5, next: '/kaola-workflow-phase6 ' + project },
    { file: 'phase4-progress.md', phase: 4, next: '/kaola-workflow-phase5 ' + project },
    { file: 'phase3-plan.md',     phase: 3, next: '/kaola-workflow-phase4 ' + project },
    { file: 'phase2-ideation.md', phase: 2, next: '/kaola-workflow-phase3 ' + project },
    { file: 'phase1-research.md', phase: 1, next: '/kaola-workflow-phase2 ' + project },
  ];
  const found = PHASE_ARTIFACTS.find(e => fs.existsSync(path.join(projectDir, e.file)));
  const currentPhase = found ? found.phase : 0;
  const nextCommand = found
    ? (found.phase === 6 ? 'complete' : found.next)
    : '/kaola-workflow-phase1 ' + project;
  return { currentPhase, nextCommand };
}

function cmdResume() {
  const args = parseArgs(process.argv.slice(3));

  const mainWorktree = findMainWorktree();

  if (!mainWorktree) {
    process.stdout.write(JSON.stringify({ resumed: false, reason: 'could not determine main worktree' }) + '\n');
    return;
  }

  const project = detectCurrentProject(args);

  if (!project) {
    process.stdout.write(JSON.stringify({ resumed: false, reason: 'cannot determine project' }) + '\n');
    return;
  }
  assert(isSafeName(project), '--project must be a simple folder name with no path separators');

  const projectDir = path.join(mainWorktree, 'kaola-workflow', project);

  const { currentPhase, nextCommand } = scanPhaseArtifacts(projectDir);

  let branch = null;
  try {
    branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (_) {}

  process.stdout.write(JSON.stringify({
    resumed: true,
    issue: parseInt(project.replace(/^issue-/, ''), 10),
    project,
    branch,
    main_worktree: mainWorktree,
    current_phase: currentPhase,
    next_command: nextCommand
  }) + '\n');
}

function cmdWorktreeStatus() {
  let wtList = '';
  try {
    wtList = execFileSync('git', ['worktree', 'list', '--porcelain'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (_) {}

  const entries = [];
  const blocks = wtList.split('\n\n').filter(Boolean);
  for (const block of blocks) {
    const lines = block.split('\n');
    const worktreeMatch = lines.find(l => l.startsWith('worktree '));
    const headMatch = lines.find(l => l.startsWith('HEAD '));
    const branchMatch = lines.find(l => l.startsWith('branch '));

    if (!worktreeMatch || !branchMatch) continue;
    const worktree_path = worktreeMatch.slice('worktree '.length).trim();
    const head = headMatch ? headMatch.slice('HEAD '.length).trim() : null;
    const branchFull = branchMatch.slice('branch '.length).trim();
    const branch = branchFull.replace(/^refs\/heads\//, '');

    if (!/^workflow\/issue-\d+/.test(branch)) continue;

    const issueNumMatch = branch.match(/^workflow\/issue-(\d+)/);
    const issueNum = issueNumMatch ? parseInt(issueNumMatch[1], 10) : null;

    let issue_data = null;
    if (!OFFLINE && issueNum) {
      try {
        const ghOut = execFileSync('gh', ['issue', 'view', String(issueNum), '--json',
          'state,assignees,labels,title,number,url'],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        issue_data = JSON.parse(ghOut);
      } catch (_) {}
    }

    entries.push({ worktree_path, branch, head, issue: issueNum, issue_data });
  }

  process.stdout.write(JSON.stringify(entries) + '\n');
}

function commitWorktreeArtifacts(worktreePath, project, root) {
  // Dirty-check ONLY kaola-workflow/{project}/ in the issue worktree
  const statusOut = execFileSync('git', ['-C', worktreePath, 'status', '--porcelain',
    '--', 'kaola-workflow/' + project + '/'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  assert(!statusOut, 'worktree-finalize: uncommitted changes in kaola-workflow/' + project + '/: ' + statusOut);

  const mainWorktree = findMainWorktree() || root;

  // Copy kaola-workflow/{project}/ from main to issue worktree
  const srcDir = path.join(mainWorktree, 'kaola-workflow', project);
  const dstDir = path.join(worktreePath, 'kaola-workflow', project);
  fs.mkdirSync(dstDir, { recursive: true });
  fs.cpSync(srcDir, dstDir, { recursive: true });

  // Stage and commit
  execFileSync('git', ['-C', worktreePath, 'add', 'kaola-workflow/' + project + '/'],
    { stdio: ['ignore', 'pipe', 'pipe'] });

  let staged = false;
  try {
    execFileSync('git', ['-C', worktreePath, 'diff', '--cached', '--quiet'],
      { stdio: ['ignore', 'pipe', 'pipe'] });
    staged = false;
  } catch (_) { staged = true; }

  if (staged) {
    execFileSync('git', ['-C', worktreePath, 'commit', '-m',
      'chore: sync phase artifacts for ' + project],
      { stdio: ['ignore', 'pipe', 'pipe'] });
  }
}

function cmdWorktreeFinalize() {
  const args = parseArgs(process.argv.slice(3));
  assert(args.project, 'worktree-finalize requires --project');
  assert(isSafeName(args.project), '--project must be a simple folder name with no path separators');

  const root = getRoot();  // ← getRoot(), NOT getCoordRoot()
  const worktreePath = worktreePathFor(root, args.project);

  assert(fs.existsSync(worktreePath),
    'worktree-finalize: worktree not provisioned at ' + worktreePath);

  commitWorktreeArtifacts(worktreePath, args.project, root);

  let branch = null;
  try {
    branch = execFileSync('git', ['-C', worktreePath, 'rev-parse', '--abbrev-ref', 'HEAD'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (_) {}

  process.stdout.write(JSON.stringify({
    verdict: 'finalized',
    project: args.project,
    worktree_path: worktreePath,
    branch,
    session: args.session || null
  }) + '\n');
}

function main() {
  const sub = process.argv[2];
  assert(sub, 'usage: kaola-workflow-claim.js <claim|release|heartbeat|ticker|sweep|status|session|derive-session|can-handoff|handoff|verify-startup|patch-branch|watch-pr|bootstrap|startup|finalize|pick-next|resume|worktree-status|worktree-finalize>');
  if (sub === 'claim') return cmdClaim();
  if (sub === 'can-handoff') return cmdCanHandoff();
  if (sub === 'handoff') return cmdHandoff();
  if (sub === 'release') return cmdRelease();
  if (sub === 'heartbeat') return cmdHeartbeat();
  if (sub === 'ticker') return cmdTicker();
  if (sub === 'sweep') return cmdSweep();
  if (sub === 'status') return cmdStatus();
  if (sub === 'session') return cmdSession();
  if (sub === 'derive-session') return cmdDeriveSession();
  if (sub === 'patch-branch') return cmdPatchBranch();
  if (sub === 'watch-pr') return cmdWatchPr();
  if (sub === 'bootstrap') return cmdBootstrap();
  if (sub === 'startup') return cmdStartup();
  if (sub === 'verify-startup') return cmdVerifyStartup();
  if (sub === 'finalize') return cmdFinalize();
  if (sub === 'pick-next') return cmdPickNext();
  if (sub === 'resume') return cmdResume();
  if (sub === 'worktree-status') return cmdWorktreeStatus();
  if (sub === 'worktree-finalize') return cmdWorktreeFinalize();
  throw new Error('unknown subcommand: ' + sub);
}

if (require.main === module) {
  try { main(); } catch (err) { process.stderr.write(err.message + '\n'); process.exitCode = 1; }
} else {
  module.exports = {
    buildSinkBranchName, getCoordRoot, removeWorktree, archiveProjectDir,
    findMainWorktree,
    cmdPickNext, cmdResume, cmdWorktreeStatus, cmdWorktreeFinalize
  };
}
