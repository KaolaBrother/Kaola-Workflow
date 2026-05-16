#!/usr/bin/env node
const fs = require('fs');

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (_) {
    return '';
  }
}

function parseJson(input) {
  if (!input.trim()) return {};
  try {
    return JSON.parse(input);
  } catch (_) {
    return {};
  }
}

function isSafeSessionId(value) {
  return typeof value === 'string' && value.length > 0 &&
    !value.includes('/') && !value.includes('\\') &&
    !value.includes('\0') && value !== '.' && value !== '..';
}

function shellSingleQuote(value) {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

function main() {
  const input = parseJson(readStdin());
  const sessionId = input.session_id || '';
  const envFile = process.env.CLAUDE_ENV_FILE || '';
  if (!envFile || !isSafeSessionId(sessionId)) return;
  fs.appendFileSync(envFile, 'export KAOLA_SESSION_ID=' + shellSingleQuote(sessionId) + '\n');

  // Identity file write (issue #31)
  try {
    const { execFileSync } = require('child_process');
    const bashPid = process.ppid;
    // assumes Claude spawns bash directly — empirically verified Phase 0.1; 2-hop: node.ppid=bash, bash.ppid=claude
    const claudePid = parseInt(
      execFileSync('ps', ['-o', 'ppid=', '-p', String(bashPid)], { encoding: 'utf8' }).trim(),
      10
    );
    if (claudePid && claudePid > 1) {
      const gitCommonDir = execFileSync('git', ['rev-parse', '--git-common-dir'],
        { cwd: process.env.GIT_ROOT || process.cwd(), encoding: 'utf8' }).trim();
      const coordRoot = require('path').resolve(process.env.GIT_ROOT || process.cwd(), gitCommonDir);
      const runtimeDir = require('path').join(coordRoot, 'kaola-workflow', '.runtime');
      fs.mkdirSync(runtimeDir, { recursive: true });
      const identityPath = require('path').join(runtimeDir, claudePid + '.identity');
      const startTimeStr = execFileSync('ps', ['-o', 'lstart=', '-p', String(claudePid)],
        { encoding: 'utf8' }).trim();
      const identityData = JSON.stringify({
        sid: sessionId,
        claude_pid: claudePid,
        claude_start_time_str: startTimeStr,
        runtime: 'claude',
        written_at: Date.now()
      }) + '\n';
      const fd = fs.openSync(identityPath, 'wx', 0o600);
      fs.writeSync(fd, identityData);
      fs.closeSync(fd);
    } else {
      process.stderr.write('[kaola-session-env] warn: could not locate Claude ancestor PID (got ' + claudePid + ') — identity file not written\n');
    }
  } catch (_) { /* silently skip — identity file is a warm-cache writer; failure is non-fatal */ }
}

try {
  main();
} catch (error) {
  process.stderr.write('[kaola-workflow session env skipped] ' + error.message + '\n');
}
