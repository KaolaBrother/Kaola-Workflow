#!/usr/bin/env node
'use strict';

// Standalone tests for kaola-workflow-run-chains.js (#432 — D-432-01).
// Tests receipt schema validity, exit-code propagation, --accept-known-red
// waiver semantics, invalid waiver format rejection, and headSha binding.
// Uses temp git repos so git rev-parse HEAD is a real SHA.
// Hand-rolled assert pattern — no test framework dependency.
//
// #635: T26/T27/T28 (the signal-death assertions) run via a DETERMINISTIC in-process seam (see
// "Deterministic signal-death seam" below) instead of racing a real process.kill against the
// runner's own per-chain timer — that race was load-sensitive (a different subset of assertions
// failed each run under system load). Because the seam needs to `await` run-chains.js's exported,
// Promise-returning `main()`, the tests from T26 onward run inside a single async IIFE at the
// bottom of this file (T1-T25 above stay synchronous/subprocess-based and are unaffected).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const EventEmitter = require('events').EventEmitter;

let passed = 0, failed = 0;
function assert(c, m) { if (c) passed++; else { failed++; console.error('FAIL: ' + m); } }

const RUN_CHAINS = path.join(__dirname, 'kaola-workflow-run-chains.js');

// Spawn run-chains as a subprocess in repoDir with the given extra argv.
// Reads and parses the receipt from outputPath (must be supplied explicitly
// or the default .cache/chain-receipt.json will be used).
function run(repoDir, extraArgs, receiptPath, env) {
  const rp = receiptPath || path.join(repoDir, '.cache', 'chain-receipt.json');
  const r = spawnSync(process.execPath, [RUN_CHAINS, ...extraArgs], {
    cwd: repoDir,
    encoding: 'utf8',
    timeout: 30000,
    env: env ? Object.assign({}, process.env, env) : process.env,
  });
  let receipt = null;
  try { receipt = JSON.parse(fs.readFileSync(rp, 'utf8')); } catch (_) {}
  return { exitCode: r.status, stdout: r.stdout, stderr: r.stderr, receipt };
}

// Create a minimal git repo with one commit so git rev-parse HEAD returns a real SHA.
function makeGitRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-runchains-'));
  const g = (args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
  g(['init', '-q', '-b', 'main']);
  g(['config', 'user.email', 'test@example.com']);
  g(['config', 'user.name', 'Test']);
  fs.writeFileSync(path.join(dir, 'seed.txt'), 'seed\n');
  g(['add', 'seed.txt']);
  g(['commit', '-q', '-m', 'seed']);
  return dir;
}

// Write a tiny executable node script that exits with a given code.
function makeExitScript(dir, name, exitCode) {
  const p = path.join(dir, name);
  fs.writeFileSync(p,
    '#!/usr/bin/env node\n\'use strict\';\nprocess.exit(' + exitCode + ');\n',
    { mode: 0o755 });
  return p;
}

// Write a tiny executable node script that sleeps `ms` then exits 0 (#529 — concurrency
// timing/ordering mocks). Sleep is not CPU-bound, so concurrent sleeps overlap on any core count.
function makeSleepScript(dir, name, ms) {
  const p = path.join(dir, name);
  fs.writeFileSync(p,
    '#!/usr/bin/env node\n\'use strict\';\nsetTimeout(function(){ process.exit(0); }, ' + ms + ');\n',
    { mode: 0o755 });
  return p;
}

// Write a tiny executable node script that SIGNAL-KILLS itself (#618 — simulating an external
// OOM-kill / operator SIGKILL, NOT our own per-chain timeout). process.kill(pid, signal) on one's
// own pid terminates the process via a real OS signal (status===null at the parent), the exact
// condition an external kill produces — indistinguishable from it at the parent spawn/spawnSync API.
function makeSelfKillScript(dir, name, signal) {
  const p = path.join(dir, name);
  fs.writeFileSync(p,
    '#!/usr/bin/env node\n\'use strict\';\nprocess.kill(process.pid, ' + JSON.stringify(signal || 'SIGKILL') + ');\n' +
    'setInterval(function(){}, 1000);\n', // safety net: keep the event loop alive in case the signal is not instantaneous
    { mode: 0o755 });
  return p;
}

// ---------------------------------------------------------------------------
// Deterministic signal-death seam (#635 — fixes the T26/T27/T28 load-sensitive flake).
//
// The flake: makeSelfKillScript races a REAL `process.kill(pid, 'SIGKILL')` (delivered by the OS
// to a REAL, freshly-exec'd child) against the runner's own per-chain timer (a real setTimeout /
// spawnSync `timeout`). Under system load, child-process scheduling is nondeterministic — the
// self-kill can lose that race to the runner's own SIGTERM/timeout — so a DIFFERENT subset of the
// `signal==='SIGKILL'` / `timed_out===false` assertions fails on each run. This is a TEST-HARNESS
// reliability bug: the runner's own signal->exitCode mapping (#618, kaola-workflow-run-chains.js)
// is correct and is NOT touched here.
//
// The fix: for the assertions that pin an EXACT signal name / EXACT timed_out value, remove the
// real OS race entirely. run-chains.js destructures `spawnSync`/`spawn` ONCE, at require time,
// from the (single, process-wide cached) `child_process` module — see its top-of-file
// `const { spawnSync, spawn } = require('child_process')`. By replacing `child_process`'s own
// exported `spawnSync`/`spawn` BEFORE the first `require('./kaola-workflow-run-chains.js')` below
// (T10, further down), run-chains.js's internal bindings resolve to the wrappers installed here for
// the REST OF THIS PROCESS's lifetime. The wrappers intercept ONLY a single reserved SENTINEL
// command and answer it with a canned signal-death result — synchronously for spawnSync, and on
// the very next `process.nextTick` for spawn (strictly before the runner's own `setTimeout(timeoutMs)`
// can possibly be "due", since that requires timeoutMs of REAL wall-clock time to elapse first) — so
// there is nothing left to race, regardless of the configured timeoutMs or system load. Every OTHER
// command (git, the real exit/sleep/hang mocks used elsewhere in this file, etc.) passes straight
// through to the REAL spawnSync/spawn, unchanged.
//
// This patch does NOT affect T1-T25/T29 above/below: those invoke run-chains.js as a SEPARATE OS
// subprocess (via this file's own `run()` helper, which closed over the ORIGINAL `spawnSync` at
// line ~13, before this patch runs) — a fresh Node process has its own, unpatched `child_process`
// module, entirely unaffected by anything mutated in THIS process's module cache.
const childProcessModule = require('child_process');
const realSpawnSync = childProcessModule.spawnSync;
const realSpawn = childProcessModule.spawn;
const SIGNAL_DEATH_MARKER = '__kaola_test_signal_death__';
function signalDeathCommand(signal) { return SIGNAL_DEATH_MARKER + ':' + (signal || 'SIGKILL'); }
function isSignalDeathCommand(cmd) { return typeof cmd === 'string' && cmd.indexOf(SIGNAL_DEATH_MARKER + ':') === 0; }
function signalDeathSignal(cmd) { return cmd.slice((SIGNAL_DEATH_MARKER + ':').length); }

childProcessModule.spawnSync = function patchedSpawnSync(cmd, args, opts) {
  if (isSignalDeathCommand(cmd)) {
    // A pure, instant signal-death result: status===null (no normal exit) + signal recorded — the
    // exact shape a real external kill produces at the spawnSync API — with NO subprocess and NO
    // OS-scheduling dependency to race against the runner's own per-chain timer.
    return { status: null, signal: signalDeathSignal(cmd), error: undefined, pid: -1, stdout: '', stderr: '', output: [null, '', ''] };
  }
  return realSpawnSync.apply(this, arguments);
};
childProcessModule.spawn = function patchedSpawn(cmd, args, opts) {
  if (isSignalDeathCommand(cmd)) {
    const fake = new EventEmitter();
    fake.stdout = new EventEmitter();
    fake.stderr = new EventEmitter();
    fake.kill = function () {};
    const signal = signalDeathSignal(cmd);
    process.nextTick(function () { fake.emit('close', null, signal); });
    return fake;
  }
  return realSpawn.apply(this, arguments);
};

// In-process invocation (#635): calls run-chains.js's exported, Promise-returning `main()` directly
// IN THIS PROCESS (never spawns a new subprocess) so the deterministic seam above is actually
// exercised for a `--mock-chain` pointed at the SENTINEL command. Saves/restores cwd + env so a
// call here never leaks state into a later test. Mirrors run()'s return shape (exitCode + parsed
// receipt) closely enough for the same assertion style.
async function runInProcess(repoDir, extraArgs, receiptPath, env) {
  const rp = receiptPath || path.join(repoDir, '.cache', 'chain-receipt.json');
  const { main } = require('./kaola-workflow-run-chains.js');
  const prevCwd = process.cwd();
  const prevEnv = Object.assign({}, process.env);
  try {
    if (env) Object.assign(process.env, env);
    process.chdir(repoDir);
    const exitCode = await main(['node', 'kaola-workflow-run-chains.js', ...extraArgs]);
    let receipt = null;
    try { receipt = JSON.parse(fs.readFileSync(rp, 'utf8')); } catch (_) {}
    return { exitCode, receipt };
  } finally {
    process.chdir(prevCwd);
    for (const k of Object.keys(process.env)) { if (!(k in prevEnv)) delete process.env[k]; }
    Object.assign(process.env, prevEnv);
  }
}

// ---------------------------------------------------------------------------
// T1: valid receipt schema — headSha, workTreeHash, startedAt, completedAt,
//     chains array with required fields, exit 0 on all-pass chain.
// ---------------------------------------------------------------------------
const repo1 = makeGitRepo();
try {
  const passMock = makeExitScript(repo1, 'pass.js', 0);
  // Use default output location so run() finds the receipt automatically.
  const r1 = run(repo1, [
    '--chains', 'claude',
    '--mock-chain', 'claude:' + passMock,
    '--json',
  ]);

  assert(r1.exitCode === 0, 'T1: exit 0 on all-pass chain');
  const rc = r1.receipt;
  assert(rc !== null, 'T1: receipt file written and parseable');
  if (rc !== null) {
    assert(typeof rc.headSha === 'string' && rc.headSha.length >= 7, 'T1: headSha is a non-empty string');
    assert(rc.headSha !== 'unknown', 'T1: headSha is a real SHA (not "unknown")');
    assert(typeof rc.workTreeHash === 'string' && rc.workTreeHash.length > 0, 'T1: workTreeHash present');
    // #547 (D-547-01): the code-tree-hash freshness key + the band-widening replay list.
    assert(typeof rc.codeTreeHash === 'string' && rc.codeTreeHash.length === 64, 'T1: codeTreeHash is a sha256 (the #547 freshness key)');
    assert(Array.isArray(rc.validationTestConsumes), 'T1: validationTestConsumes is an array (#547 band replay)');
    assert(typeof rc.startedAt === 'string', 'T1: startedAt present');
    assert(typeof rc.completedAt === 'string', 'T1: completedAt present');
    assert(Array.isArray(rc.chains), 'T1: chains is an array');
    assert(rc.chains.length === 1, 'T1: one chain entry');
    const ch = rc.chains[0];
    assert(ch.name === 'claude', 'T1: chain name = claude');
    assert(ch.exitCode === 0, 'T1: chain exitCode = 0');
    assert(typeof ch.command === 'string', 'T1: chain.command is a string');
    assert(typeof ch.duration_ms === 'number', 'T1: chain.duration_ms is a number');
    assert(ch.accepted_red === false, 'T1: accepted_red = false for non-waived chain');
    assert(ch.accepted_red_issue === null, 'T1: accepted_red_issue = null for non-waived chain');
  }
} finally {
  try { fs.rmSync(repo1, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T2: failed chain (non-zero exit) causes non-zero script exit; receipt
//     is still written and records the non-zero exitCode.
// ---------------------------------------------------------------------------
const repo2 = makeGitRepo();
try {
  const failMock = makeExitScript(repo2, 'fail.js', 1);
  const r2 = run(repo2, [
    '--chains', 'codex',
    '--mock-chain', 'codex:' + failMock,
  ]);

  assert(r2.exitCode !== 0, 'T2: non-zero exit when chain fails');
  const rc2 = r2.receipt;
  assert(rc2 !== null, 'T2: receipt written even on failure');
  if (rc2 !== null) {
    assert(rc2.chains.length === 1, 'T2: one chain entry');
    assert(rc2.chains[0].exitCode === 1, 'T2: chain exitCode = 1 in receipt');
    assert(rc2.chains[0].accepted_red === false, 'T2: chain is not waived');
  }
} finally {
  try { fs.rmSync(repo2, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T3: --accept-known-red marks the chain accepted_red and allows exit 0
//     even when the chain fails.
// ---------------------------------------------------------------------------
const repo3 = makeGitRepo();
try {
  const failMock3 = makeExitScript(repo3, 'fail.js', 1);
  const r3 = run(repo3, [
    '--chains', 'gitlab',
    '--mock-chain', 'gitlab:' + failMock3,
    '--accept-known-red', 'gitlab:234',
  ]);

  assert(r3.exitCode === 0, 'T3: exit 0 when failing chain is waived via --accept-known-red');
  const rc3 = r3.receipt;
  assert(rc3 !== null, 'T3: receipt written');
  if (rc3 !== null) {
    assert(rc3.chains[0].accepted_red === true, 'T3: accepted_red = true in receipt');
    assert(rc3.chains[0].accepted_red_issue === '234', 'T3: accepted_red_issue = 234 in receipt');
    assert(rc3.chains[0].exitCode === 1, 'T3: underlying exitCode preserved in receipt');
  }
} finally {
  try { fs.rmSync(repo3, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T4: invalid --accept-known-red format (missing colon) exits non-zero with
//     a helpful error message before any chains run.
// ---------------------------------------------------------------------------
const repo4 = makeGitRepo();
try {
  const r4 = run(repo4, ['--accept-known-red', 'codex']);  // no colon — invalid

  assert(r4.exitCode !== 0, 'T4: exit non-zero on invalid --accept-known-red format');
  assert((r4.stderr || '').includes('format'), 'T4: error message mentions "format"');
} finally {
  try { fs.rmSync(repo4, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T5: headSha in receipt matches the actual git HEAD SHA of the repo.
// ---------------------------------------------------------------------------
const repo5 = makeGitRepo();
try {
  const passMock5 = makeExitScript(repo5, 'pass.js', 0);
  const r5 = run(repo5, [
    '--chains', 'claude',
    '--mock-chain', 'claude:' + passMock5,
  ]);

  assert(r5.exitCode === 0, 'T5: exit 0');
  const rc5 = r5.receipt;
  assert(rc5 !== null, 'T5: receipt written');
  if (rc5 !== null) {
    const realHead = execFileSync('git', ['-C', repo5, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    assert(rc5.headSha === realHead, 'T5: headSha in receipt matches git rev-parse HEAD');
  }
} finally {
  try { fs.rmSync(repo5, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T6: --accept-known-red with empty name or empty issue also fails.
// ---------------------------------------------------------------------------
const repo6 = makeGitRepo();
try {
  // Colon present but empty name: ":234".
  const r6a = run(repo6, ['--accept-known-red', ':234']);
  assert(r6a.exitCode !== 0, 'T6a: exit non-zero for empty name in --accept-known-red');

  // Colon present but empty issue: "codex:".
  const r6b = run(repo6, ['--accept-known-red', 'codex:']);
  assert(r6b.exitCode !== 0, 'T6b: exit non-zero for empty issue in --accept-known-red');
} finally {
  try { fs.rmSync(repo6, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T7: multiple chains — all pass → exit 0; receipt contains all entries.
// ---------------------------------------------------------------------------
const repo7 = makeGitRepo();
try {
  const passMock7 = makeExitScript(repo7, 'pass.js', 0);
  const r7 = run(repo7, [
    '--chains', 'claude,codex',
    '--mock-chain', 'claude:' + passMock7,
    '--mock-chain', 'codex:' + passMock7,
  ]);

  assert(r7.exitCode === 0, 'T7: exit 0 when all chains pass');
  const rc7 = r7.receipt;
  assert(rc7 !== null, 'T7: receipt written');
  if (rc7 !== null) {
    assert(rc7.chains.length === 2, 'T7: two chain entries');
    assert(rc7.chains.every(ch => ch.exitCode === 0), 'T7: all chains exitCode 0');
  }
} finally {
  try { fs.rmSync(repo7, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T8 (#475): the v6.2.0 chains.json consumer escape hatch is RETIRED. A non-npm repo
// that still carries kaola-workflow/chains.json is NOT treated as repo-config — the file
// is IGNORED and the producer refuses chains_config_missing (no receipt). A consumer repo
// gates finalize on the agent-recorded .cache/final-validation.md, not run-chains.js.
// ---------------------------------------------------------------------------
const repo8 = makeGitRepo();
try {
  const passMock = makeExitScript(repo8, 'pass.js', 0);
  fs.mkdirSync(path.join(repo8, 'kaola-workflow'), { recursive: true });
  // a Swift/Xcode-style repo with a (now-ignored) chains.json + no npm scripts.
  fs.writeFileSync(path.join(repo8, 'kaola-workflow', 'chains.json'), JSON.stringify({
    chains: [{ name: 'build', command: 'node ' + passMock }],
  }) + '\n');
  const r8 = run(repo8, ['--json']);
  assert(r8.exitCode !== 0, 'T8: chains.json is ignored (retired) — non-npm repo refuses, non-zero');
  let refusal8 = null;
  try { refusal8 = JSON.parse(r8.stdout.trim().split('\n').filter(Boolean).pop()); } catch (_) {}
  assert(refusal8 && refusal8.reason === 'chains_config_missing', 'T8: a present chains.json does NOT become repo-config; chains_config_missing; got ' + JSON.stringify(refusal8));
  assert(r8.receipt === null, 'T8: NO receipt written (chains.json no longer produces one)');
} finally {
  try { fs.rmSync(repo8, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T9 (#475): a non-npm repo (no test:kaola-workflow:* scripts) REFUSES chains_config_missing
// and writes NO receipt; the operator_hint points at the consumer contract (final-validation.md),
// NOT chains.json (which is retired).
// ---------------------------------------------------------------------------
const repo9 = makeGitRepo();
try {
  const r9 = run(repo9, ['--json']);
  assert(r9.exitCode !== 0, 'T9: refuses (non-zero) when no npm scripts');
  let refusal = null;
  try { refusal = JSON.parse(r9.stdout.trim().split('\n').filter(Boolean).pop()); } catch (_) {}
  assert(refusal && refusal.result === 'refuse' && refusal.reason === 'chains_config_missing', 'T9: typed chains_config_missing refusal; got ' + JSON.stringify(refusal));
  assert(typeof (refusal && refusal.operator_hint) === 'string' && refusal.operator_hint.includes('final-validation.md') && !refusal.operator_hint.includes('chains.json'), 'T9: operator_hint points at final-validation.md, not chains.json');
  assert(r9.receipt === null, 'T9: NO receipt written on refusal (no misleading 4-red receipt)');
} finally {
  try { fs.rmSync(repo9, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T10 (#475): resolveChains unit — npm-default > chains_config_missing ONLY (no repo-config tier).
// npm-default keeps only the KNOWN_CHAINS whose script is declared (self-host behavior preserved);
// a present chains.json is IGNORED (still chains_config_missing without npm scripts).
// ---------------------------------------------------------------------------
{
  const { resolveChains } = require('./kaola-workflow-run-chains.js');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-resolve-'));
  // npm-default: package.json declares 2 of the 4 chain scripts
  fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ scripts: { 'test:kaola-workflow:claude': 'x', 'test:kaola-workflow:codex': 'x' } }));
  let res = resolveChains(d);
  assert(res.source === 'npm-default' && res.names.sort().join(',') === 'claude,codex', 'T10: npm-default keeps only declared-script chains');
  // missing: no package.json scripts
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-resolve-'));
  res = resolveChains(d2);
  assert(res.error === 'chains_config_missing', 'T10: chains_config_missing when no npm scripts');
  // a present chains.json is IGNORED (retired) — a no-npm-scripts repo stays chains_config_missing.
  fs.mkdirSync(path.join(d2, 'kaola-workflow'), { recursive: true });
  fs.writeFileSync(path.join(d2, 'kaola-workflow', 'chains.json'), JSON.stringify({ chains: [{ name: 'build', command: 'xcodebuild test' }] }));
  res = resolveChains(d2);
  assert(res.error === 'chains_config_missing' && res.source !== 'repo-config', 'T10: chains.json is ignored (retired) — still chains_config_missing, never repo-config');
  fs.rmSync(d, { recursive: true, force: true });
  fs.rmSync(d2, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T11 (#475): the no_chains guard still holds for a self-host (npm) repo — an EMPTY effective
// chain set (--chains ",") REFUSES with no receipt (a zero-chains receipt would falsely pass the
// name-agnostic finalize gate). Setup uses npm-default so resolveChains succeeds before the guard.
// ---------------------------------------------------------------------------
const repo11 = makeGitRepo();
try {
  fs.writeFileSync(path.join(repo11, 'package.json'), JSON.stringify({ scripts: { 'test:kaola-workflow:claude': 'true' } }) + '\n');
  const r11 = run(repo11, ['--chains', ',', '--json']);
  assert(r11.exitCode !== 0, 'T11: --chains "," refuses (non-zero)');
  let refusal = null;
  try { refusal = JSON.parse(r11.stdout.trim().split('\n').filter(Boolean).pop()); } catch (_) {}
  assert(refusal && refusal.result === 'refuse' && refusal.reason === 'no_chains', 'T11: typed no_chains refusal; got ' + JSON.stringify(refusal));
  assert(r11.receipt === null, 'T11: NO receipt written for an empty effective chain set (no false-green)');
} finally {
  try { fs.rmSync(repo11, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T12 (#512/#608): resolveTimeoutMs unit — env override, default 1800000, invalid fallback.
// Default recalibrated 900000 (15 min) -> 1800000 (30 min, #608): live runs on a constrained
// host exceeded the old 900s bound (a red receipt at exactly the old bound with no distinction
// from a genuine test failure) — see the `timed_out` receipt field below.
// ---------------------------------------------------------------------------
{
  const { resolveTimeoutMs } = require('./kaola-workflow-run-chains.js');
  // unset env → default 1800000
  assert(resolveTimeoutMs({}) === 1800000, 'T12: unset env returns default 1800000');
  // valid override
  assert(resolveTimeoutMs({ KAOLA_RUN_CHAINS_TIMEOUT_MS: '1200000' }) === 1200000, 'T12: valid override 1200000 is respected');
  // invalid string → fallback
  assert(resolveTimeoutMs({ KAOLA_RUN_CHAINS_TIMEOUT_MS: 'abc' }) === 1800000, 'T12: "abc" falls back to 1800000');
  // zero → fallback (not > 0)
  assert(resolveTimeoutMs({ KAOLA_RUN_CHAINS_TIMEOUT_MS: '0' }) === 1800000, 'T12: "0" falls back to 1800000');
  // negative → fallback
  assert(resolveTimeoutMs({ KAOLA_RUN_CHAINS_TIMEOUT_MS: '-5' }) === 1800000, 'T12: "-5" falls back to 1800000');
}

// ---------------------------------------------------------------------------
// T13 (#529): resolveConcurrency unit — core-count gating policy + env overrides.
// ---------------------------------------------------------------------------
{
  const { resolveConcurrency } = require('./kaola-workflow-run-chains.js');
  // auto: a constrained host (< 8 cores) stays SERIAL regardless of chain count (D-528-01 safety).
  assert(resolveConcurrency({}, 2, 4) === 1, 'T13: 2 cores -> serial');
  assert(resolveConcurrency({}, 4, 4) === 1, 'T13: 4 cores -> serial (the ≤4-core case)');
  assert(resolveConcurrency({}, 7, 4) === 1, 'T13: 7 cores (< 8) -> serial');
  // auto: ample cores -> bounded pool min(chainCount, floor(cores/2)).
  assert(resolveConcurrency({}, 8, 4) === 4, 'T13: 8 cores, 4 chains -> 4');
  assert(resolveConcurrency({}, 18, 4) === 4, 'T13: 18 cores, 4 chains -> 4 (capped at chainCount)');
  assert(resolveConcurrency({}, 18, 2) === 2, 'T13: 18 cores, 2 chains -> 2');
  assert(resolveConcurrency({}, 10, 4) === 4, 'T13: 10 cores -> floor(10/2)=5 capped to 4 chains');
  assert(resolveConcurrency({}, 18, 1) === 1, 'T13: 1 chain -> serial (nothing to overlap)');
  // env overrides.
  assert(resolveConcurrency({ KAOLA_RUN_CHAINS_CONCURRENCY: 'serial' }, 18, 4) === 1, 'T13: env "serial" -> 1');
  assert(resolveConcurrency({ KAOLA_RUN_CHAINS_CONCURRENCY: '1' }, 18, 4) === 1, 'T13: env "1" -> 1');
  assert(resolveConcurrency({ KAOLA_RUN_CHAINS_CONCURRENCY: '4' }, 2, 4) === 4, 'T13: env "4" forces concurrency on a 2-core host');
  assert(resolveConcurrency({ KAOLA_RUN_CHAINS_CONCURRENCY: '9' }, 18, 4) === 4, 'T13: env "9" clamped to chainCount 4');
  assert(resolveConcurrency({ KAOLA_RUN_CHAINS_CONCURRENCY: 'auto' }, 18, 4) === 4, 'T13: env "auto" == unset');
  assert(resolveConcurrency({ KAOLA_RUN_CHAINS_CONCURRENCY: 'garbage' }, 18, 4) === 4, 'T13: invalid env falls through to auto (never crashes the gate)');
}

// ---------------------------------------------------------------------------
// T14 (#529): concurrent dispatch RE-SORTS out-of-order completion to canonical
// KNOWN_CHAINS order in the receipt. Forced concurrency + reverse sleeps: chains
// COMPLETE gitea->...->claude, but the receipt must read claude,codex,gitlab,gitea.
// ---------------------------------------------------------------------------
const repo14 = makeGitRepo();
try {
  const c  = makeSleepScript(repo14, 'c.js', 240);   // claude finishes LAST
  const co = makeSleepScript(repo14, 'co.js', 160);
  const gl = makeSleepScript(repo14, 'gl.js', 80);
  const gt = makeSleepScript(repo14, 'gt.js', 20);    // gitea finishes FIRST
  const r14 = run(repo14, [
    '--chains', 'claude,codex,gitlab,gitea',
    '--mock-chain', 'claude:' + c,
    '--mock-chain', 'codex:' + co,
    '--mock-chain', 'gitlab:' + gl,
    '--mock-chain', 'gitea:' + gt,
  ], null, { KAOLA_RUN_CHAINS_CONCURRENCY: '4' });
  assert(r14.exitCode === 0, 'T14: exit 0 on all-pass concurrent run');
  const rc = r14.receipt;
  assert(rc !== null && Array.isArray(rc.chains) && rc.chains.length === 4, 'T14: 4 chain entries');
  if (rc && rc.chains) {
    assert(rc.chains.map(x => x.name).join(',') === 'claude,codex,gitlab,gitea',
      'T14: receipt is canonical order despite reverse completion; got ' + rc.chains.map(x => x.name).join(','));
    assert(rc.chains.every(x => x.exitCode === 0), 'T14: all chains exit 0');
  }
} finally { try { fs.rmSync(repo14, { recursive: true, force: true }); } catch (_) {} }

// ---------------------------------------------------------------------------
// T15 (#529): concurrency actually OVERLAPS — forced-concurrent makespan is far below
// forced-serial for the same equal-sleep chains (sleep is not CPU-bound, so overlap holds
// on any core count). Relative threshold self-calibrates to host speed (non-flaky).
// ---------------------------------------------------------------------------
const repo15 = makeGitRepo();
try {
  const mk = (n) => makeSleepScript(repo15, n, 300);
  const baseArgs = [
    '--chains', 'claude,codex,gitlab,gitea',
    '--mock-chain', 'claude:' + mk('s1.js'),
    '--mock-chain', 'codex:' + mk('s2.js'),
    '--mock-chain', 'gitlab:' + mk('s3.js'),
    '--mock-chain', 'gitea:' + mk('s4.js'),
  ];
  const span = (rc) => new Date(rc.completedAt).getTime() - new Date(rc.startedAt).getTime();
  const serialRun = run(repo15, baseArgs.concat(['--output', '.cache/serial.json']),
    path.join(repo15, '.cache', 'serial.json'), { KAOLA_RUN_CHAINS_CONCURRENCY: 'serial' });
  const concRun = run(repo15, baseArgs.concat(['--output', '.cache/conc.json']),
    path.join(repo15, '.cache', 'conc.json'), { KAOLA_RUN_CHAINS_CONCURRENCY: '4' });
  assert(serialRun.exitCode === 0 && concRun.exitCode === 0, 'T15: both runs exit 0');
  if (serialRun.receipt && concRun.receipt) {
    const sSpan = span(serialRun.receipt), cSpan = span(concRun.receipt);
    // 4 chains x 300ms: serial ~1200ms+, concurrent ~300ms+. Concurrent < 60% of serial.
    assert(cSpan < sSpan * 0.6, 'T15: concurrent makespan (' + cSpan + 'ms) < 60% of serial (' + sSpan + 'ms) — chains overlapped');
  }
} finally { try { fs.rmSync(repo15, { recursive: true, force: true }); } catch (_) {} }

// ---------------------------------------------------------------------------
// T16 (#529): --accept-known-red waiver works UNDER CONCURRENCY. One chain fails
// but is waived -> overall exit 0; receipt records the underlying exit + the waiver.
// ---------------------------------------------------------------------------
const repo16 = makeGitRepo();
try {
  const passS = makeExitScript(repo16, 'p.js', 0);
  const failS = makeExitScript(repo16, 'f.js', 1);
  const r16 = run(repo16, [
    '--chains', 'claude,codex',
    '--mock-chain', 'claude:' + passS,
    '--mock-chain', 'codex:' + failS,
    '--accept-known-red', 'codex:529',
  ], null, { KAOLA_RUN_CHAINS_CONCURRENCY: '2' });
  assert(r16.exitCode === 0, 'T16: waived failing chain -> exit 0 under concurrency');
  const rc = r16.receipt;
  if (rc && rc.chains) {
    const codex = rc.chains.find(x => x.name === 'codex');
    assert(!!codex && codex.exitCode === 1 && codex.accepted_red === true && codex.accepted_red_issue === '529',
      'T16: codex records exit 1 + waived (accepted_red_issue 529)');
    assert(rc.chains.map(x => x.name).join(',') === 'claude,codex', 'T16: canonical order under concurrency');
  }
} finally { try { fs.rmSync(repo16, { recursive: true, force: true }); } catch (_) {} }

// ---------------------------------------------------------------------------
// T17 (#529): forced SERIAL fallback on a multi-chain run still produces a correct,
// canonical receipt (exercise the byte-equivalent serial path explicitly, not only via gating).
// ---------------------------------------------------------------------------
const repo17 = makeGitRepo();
try {
  const passS = makeExitScript(repo17, 'p.js', 0);
  const r17 = run(repo17, [
    '--chains', 'claude,codex,gitlab',
    '--mock-chain', 'claude:' + passS,
    '--mock-chain', 'codex:' + passS,
    '--mock-chain', 'gitlab:' + passS,
  ], null, { KAOLA_RUN_CHAINS_CONCURRENCY: 'serial' });
  assert(r17.exitCode === 0, 'T17: forced-serial multi-chain exit 0');
  const rc = r17.receipt;
  if (rc && rc.chains) {
    assert(rc.chains.map(x => x.name).join(',') === 'claude,codex,gitlab', 'T17: serial canonical order');
    assert(rc.chains.length === 3 && rc.chains.every(x => x.exitCode === 0), 'T17: 3 chains all pass');
  }
} finally { try { fs.rmSync(repo17, { recursive: true, force: true }); } catch (_) {} }

// ---------------------------------------------------------------------------
// T18 (#550): resolveChainRetry unit — env override, default 2, invalid/sub-1 fallback.
// ---------------------------------------------------------------------------
{
  const { resolveChainRetry } = require('./kaola-workflow-run-chains.js');
  assert(resolveChainRetry({}) === 2, 'T18: unset env returns default 2');
  assert(resolveChainRetry({ KAOLA_RUN_CHAINS_RETRY: '3' }) === 3, 'T18: valid override 3 respected');
  assert(resolveChainRetry({ KAOLA_RUN_CHAINS_RETRY: '1' }) === 1, 'T18: "1" (no retry) respected');
  assert(resolveChainRetry({ KAOLA_RUN_CHAINS_RETRY: 'abc' }) === 2, 'T18: "abc" falls back to 2');
  assert(resolveChainRetry({ KAOLA_RUN_CHAINS_RETRY: '0' }) === 2, 'T18: "0" (< 1) falls back to 2');
  assert(resolveChainRetry({ KAOLA_RUN_CHAINS_RETRY: '-4' }) === 2, 'T18: "-4" falls back to 2');
}

// A counter-file mock: on attempt N it reads/increments a side-file and then behaves per `script`,
// which is a JS expression body given (attemptNumber) and may call process.stdout/stderr.write +
// process.exit. The counter persists across spawns so a single chain's retries see distinct N.
function makeCounterMock(dir, name, bodyByAttempt) {
  const p = path.join(dir, name);
  const counterFile = p + '.count';
  const src =
    '#!/usr/bin/env node\n\'use strict\';\n' +
    'const fs = require(\'fs\');\n' +
    'const cf = ' + JSON.stringify(counterFile) + ';\n' +
    'let n = 0; try { n = parseInt(fs.readFileSync(cf, \'utf8\'), 10) || 0; } catch (_) {}\n' +
    'n += 1; fs.writeFileSync(cf, String(n));\n' +
    '(' + bodyByAttempt + ')(n);\n';
  fs.writeFileSync(p, src, { mode: 0o755 });
  return p;
}

// ---------------------------------------------------------------------------
// T19 (#550): TRANSIENT -> retry -> pass. A mock that emits a TLS-timeout line to stderr + exit 1 on
// attempt 1, exit 0 on attempt 2. The chain must RETRY (attempts === 2) and come up GREEN.
// ---------------------------------------------------------------------------
const repo19 = makeGitRepo();
try {
  // attempt 1: write a known transient signature to stderr + exit 1; attempt 2+: exit 0.
  const body = 'function(n){ if (n === 1) { process.stderr.write("error: TLS handshake timeout talking to api\\n"); process.exit(1); } process.exit(0); }';
  const mock19 = makeCounterMock(repo19, 'transient.js', body);
  const r19 = run(repo19, [
    '--chains', 'claude',
    '--mock-chain', 'claude:' + mock19,
  ], null, { KAOLA_RUN_CHAINS_CONCURRENCY: 'serial', KAOLA_RUN_CHAINS_RETRY: '2' });
  assert(r19.exitCode === 0, 'T19: transient-then-pass chain comes up GREEN after retry (exit 0)');
  const rc19 = r19.receipt;
  assert(rc19 !== null, 'T19: receipt written');
  if (rc19 !== null) {
    const ch = rc19.chains[0];
    assert(ch.exitCode === 0, 'T19: receipt records the FINAL (green) exitCode 0');
    assert(ch.attempts === 2, 'T19: attempts === 2 (one transient retry); got ' + ch.attempts);
    assert(ch.retried_transient === true, 'T19: retried_transient === true');
  }
} finally {
  try { fs.rmSync(repo19, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T20 (#550): DETERMINATE -> NO retry -> stays RED. A mock that exits 1 with a PLAIN assertion
// message (NO infra signature) must run EXACTLY ONCE (attempts === 1) and stay red — precedence #1:
// retry must never flip a determinate red to green.
// ---------------------------------------------------------------------------
const repo20 = makeGitRepo();
try {
  // Every attempt: a plain test-assertion failure, no transient-infra signature anywhere.
  const body = 'function(n){ process.stderr.write("AssertionError: expected 1 to equal 2\\n"); process.exit(1); }';
  const mock20 = makeCounterMock(repo20, 'determinate.js', body);
  const r20 = run(repo20, [
    '--chains', 'codex',
    '--mock-chain', 'codex:' + mock20,
  ], null, { KAOLA_RUN_CHAINS_CONCURRENCY: 'serial', KAOLA_RUN_CHAINS_RETRY: '2' });
  assert(r20.exitCode !== 0, 'T20: determinate-red chain stays RED (non-zero exit)');
  const rc20 = r20.receipt;
  assert(rc20 !== null, 'T20: receipt written even on determinate red');
  if (rc20 !== null) {
    const ch = rc20.chains[0];
    assert(ch.exitCode === 1, 'T20: receipt records exit 1 (still red)');
    assert(ch.attempts === 1, 'T20: attempts === 1 — a determinate red is NEVER retried; got ' + ch.attempts);
    assert(ch.retried_transient === false, 'T20: retried_transient === false (no transient signature)');
  }
} finally {
  try { fs.rmSync(repo20, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T21 (#550): TIMEOUT is non-retryable. A mock that HANGS (never exits) is killed by the per-chain
// timeout (tiny override). The killed result has NO transient stdout signature and _timedOut===true,
// so it must run EXACTLY ONCE (attempts === 1) and stay red — a 12-min hang re-run is not worth it.
// ---------------------------------------------------------------------------
const repo21 = makeGitRepo();
try {
  // Hang forever (keep the event loop alive); the per-chain timeout kills it.
  const hangMock = path.join(repo21, 'hang.js');
  fs.writeFileSync(hangMock,
    '#!/usr/bin/env node\n\'use strict\';\nsetInterval(function(){}, 1000);\n',
    { mode: 0o755 });
  const r21 = run(repo21, [
    '--chains', 'gitlab',
    '--mock-chain', 'gitlab:' + hangMock,
  ], null, { KAOLA_RUN_CHAINS_CONCURRENCY: 'serial', KAOLA_RUN_CHAINS_RETRY: '2', KAOLA_RUN_CHAINS_TIMEOUT_MS: '600' });
  assert(r21.exitCode !== 0, 'T21: a timed-out chain stays RED (non-zero exit)');
  const rc21 = r21.receipt;
  assert(rc21 !== null, 'T21: receipt written on timeout');
  if (rc21 !== null) {
    const ch = rc21.chains[0];
    assert(ch.attempts === 1, 'T21: a timeout is non-retryable — attempts === 1; got ' + ch.attempts);
    assert(ch.retried_transient === false, 'T21: retried_transient === false on a timeout');
  }
} finally {
  try { fs.rmSync(repo21, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T22 (#550): retry is PER-SPEC under CONCURRENCY — a transient on one chain re-runs ONLY that chain.
// codex flaps once (transient -> pass); claude passes first try. Both end green; codex attempts===2,
// claude attempts===1.
// ---------------------------------------------------------------------------
const repo22 = makeGitRepo();
try {
  const passMock = makeExitScript(repo22, 'pass.js', 0);
  const flapBody = 'function(n){ if (n === 1) { process.stderr.write("ECONNRESET reading from upstream\\n"); process.exit(1); } process.exit(0); }';
  const flapMock = makeCounterMock(repo22, 'flap.js', flapBody);
  const r22 = run(repo22, [
    '--chains', 'claude,codex',
    '--mock-chain', 'claude:' + passMock,
    '--mock-chain', 'codex:' + flapMock,
  ], null, { KAOLA_RUN_CHAINS_CONCURRENCY: '2', KAOLA_RUN_CHAINS_RETRY: '2' });
  assert(r22.exitCode === 0, 'T22: both chains green after codex retry (exit 0)');
  const rc22 = r22.receipt;
  if (rc22 && rc22.chains) {
    const claude = rc22.chains.find(x => x.name === 'claude');
    const codex = rc22.chains.find(x => x.name === 'codex');
    assert(claude && claude.attempts === 1 && claude.retried_transient === false, 'T22: claude ran once (no retry)');
    assert(codex && codex.exitCode === 0 && codex.attempts === 2 && codex.retried_transient === true, 'T22: codex retried once under concurrency and went green');
  }
} finally {
  try { fs.rmSync(repo22, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T23 (#546): resolveOutputPath precedence — --output > --plan > --project > cwd default.
// Mirrors main()'s `resolveOutputPath(pathOpts, cwd)` call: opts is the parsed
// { output, plan, project } bag (each null when its flag is absent) and cwd is the
// process cwd at resolution time. --project shells `git rev-parse --show-toplevel`
// (getGitTopLevel), so that case uses a real tmp git repo; the rest are pure (no git).
// ---------------------------------------------------------------------------
{
  const { resolveOutputPath, getGitTopLevel } = require('./kaola-workflow-run-chains.js');
  const none = { output: null, plan: null, project: null };
  const cwd = '/work/repo';

  // --output: an absolute path is returned as-is (path.resolve of an absolute path is itself).
  assert(resolveOutputPath(Object.assign({}, none, { output: '/abs/custom/receipt.json' }), cwd)
    === '/abs/custom/receipt.json', 'T23a: --output absolute path wins verbatim');
  // --output: a cwd-relative path resolves against cwd.
  assert(resolveOutputPath(Object.assign({}, none, { output: 'sub/r.json' }), cwd)
    === path.join(cwd, 'sub', 'r.json'), 'T23b: --output relative path resolves against cwd');

  // --plan: path.dirname(path.resolve(cwd, plan)) + /.cache/chain-receipt.json — the EXACT plan-dir
  // plan-validator --finalize-check derives. Use a cwd-relative plan path so resolve uses cwd.
  const planRel = 'kaola-workflow/issue-546/workflow-plan.md';
  assert(resolveOutputPath(Object.assign({}, none, { plan: planRel }), cwd)
    === path.join(cwd, 'kaola-workflow', 'issue-546', '.cache', 'chain-receipt.json'),
    'T23c: --plan -> dirname(resolve(plan))/.cache/chain-receipt.json (the validator plan-dir)');
  // --plan with an ABSOLUTE plan path ignores cwd for the dir.
  assert(resolveOutputPath(Object.assign({}, none, { plan: '/elsewhere/plan/workflow-plan.md' }), cwd)
    === path.join('/elsewhere', 'plan', '.cache', 'chain-receipt.json'),
    'T23d: --plan absolute path uses its own dir, not cwd');

  // bare default (no flag) -> <cwd>/.cache/chain-receipt.json.
  assert(resolveOutputPath(none, cwd) === path.join(cwd, '.cache', 'chain-receipt.json'),
    'T23e: bare default -> <cwd>/.cache/chain-receipt.json');

  // --project issue-N -> <gitTopLevel>/kaola-workflow/issue-N/.cache/chain-receipt.json.
  // Real tmp git repo so getGitTopLevel resolves deterministically; cwd is the repo root.
  const projRepo = makeGitRepo();
  try {
    const top = getGitTopLevel(projRepo);
    // getGitTopLevel returns a real toplevel (not the cwd fallback) inside a checkout.
    // (On macOS tmp may be a /private symlink, so compare against the resolved toplevel.)
    assert(typeof top === 'string' && top.length > 0, 'T23f: getGitTopLevel resolves a toplevel inside a checkout');
    assert(resolveOutputPath(Object.assign({}, none, { project: 'issue-546' }), projRepo)
      === path.join(top, 'kaola-workflow', 'issue-546', '.cache', 'chain-receipt.json'),
      'T23g: --project issue-N -> <gitTopLevel>/kaola-workflow/issue-N/.cache/chain-receipt.json');
  } finally {
    try { fs.rmSync(projRepo, { recursive: true, force: true }); } catch (_) {}
  }

  // Precedence ordering: when MORE than one flag is set, the higher-precedence one wins.
  // output > plan: both set -> output path, plan ignored.
  assert(resolveOutputPath({ output: '/abs/out.json', plan: planRel, project: 'issue-546' }, cwd)
    === '/abs/out.json', 'T23h: precedence output > plan > project (output wins over both)');
  // plan > project: plan + project set, no output -> plan-dir, project ignored.
  assert(resolveOutputPath({ output: null, plan: planRel, project: 'issue-546' }, cwd)
    === path.join(cwd, 'kaola-workflow', 'issue-546', '.cache', 'chain-receipt.json'),
    'T23i: precedence plan > project (plan-dir wins, project ignored)');
  // project > cwd default: project set, no output/plan -> project path (NOT the bare cwd default).
  const projRepo2 = makeGitRepo();
  try {
    const top2 = getGitTopLevel(projRepo2);
    const projResolved = resolveOutputPath({ output: null, plan: null, project: 'issue-99' }, projRepo2);
    assert(projResolved === path.join(top2, 'kaola-workflow', 'issue-99', '.cache', 'chain-receipt.json'),
      'T23j: precedence project > cwd default (project path, not <cwd>/.cache)');
    assert(projResolved !== path.join(projRepo2, '.cache', 'chain-receipt.json'),
      'T23k: --project does NOT fall through to the bare cwd default');
  } finally {
    try { fs.rmSync(projRepo2, { recursive: true, force: true }); } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// T24 (#608): a synthetic per-chain timeout persists `timed_out: true` + `exitCode: 1` in the
// receipt's per-chain entry, AND the non-json failure summary (stderr) carries a TIMEOUT-labelled
// line naming KAOLA_RUN_CHAINS_TIMEOUT_MS — an operator scanning the failure line (not the JSON
// receipt) can tell "raise the timeout" from "fix the test" at a glance.
// ---------------------------------------------------------------------------
const repo24 = makeGitRepo();
try {
  const hangMock = path.join(repo24, 'hang.js');
  fs.writeFileSync(hangMock,
    '#!/usr/bin/env node\n\'use strict\';\nsetInterval(function(){}, 1000);\n',
    { mode: 0o755 });
  const r24 = run(repo24, [
    '--chains', 'claude',
    '--mock-chain', 'claude:' + hangMock,
  ], null, { KAOLA_RUN_CHAINS_CONCURRENCY: 'serial', KAOLA_RUN_CHAINS_RETRY: '1', KAOLA_RUN_CHAINS_TIMEOUT_MS: '600' });
  assert(r24.exitCode !== 0, 'T24: a timed-out chain stays RED (non-zero exit)');
  const rc24 = r24.receipt;
  assert(rc24 !== null, 'T24: receipt written on timeout');
  if (rc24 !== null) {
    const ch = rc24.chains[0];
    assert(ch.timed_out === true, 'T24: receipt records timed_out: true; got ' + JSON.stringify(ch));
    assert(ch.exitCode === 1, 'T24: receipt records exitCode 1 on timeout');
  }
  assert((r24.stderr || '').includes('TIMEOUT'), 'T24: failure summary labels a TIMEOUT; stderr: ' + r24.stderr);
  assert((r24.stderr || '').includes('KAOLA_RUN_CHAINS_TIMEOUT_MS'), 'T24: failure summary names KAOLA_RUN_CHAINS_TIMEOUT_MS; stderr: ' + r24.stderr);
} finally {
  try { fs.rmSync(repo24, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T25 (#608): a green (non-timed-out) chain records `timed_out: false` in the receipt — the
// additive field is always explicit on a freshly-produced receipt (a legacy receipt predating
// the field is treated as false by the reader, not by the producer).
// ---------------------------------------------------------------------------
const repo25 = makeGitRepo();
try {
  const passMock = makeExitScript(repo25, 'pass.js', 0);
  const r25 = run(repo25, [
    '--chains', 'claude',
    '--mock-chain', 'claude:' + passMock,
  ]);
  assert(r25.exitCode === 0, 'T25: exit 0 on a green chain');
  const rc25 = r25.receipt;
  assert(rc25 !== null, 'T25: receipt written');
  if (rc25 !== null) {
    assert(rc25.chains[0].timed_out === false, 'T25: green chain records timed_out: false; got ' + JSON.stringify(rc25.chains[0]));
    assert(rc25.chains[0].signal === null, 'T25: green chain records signal: null (#618 additive field); got ' + JSON.stringify(rc25.chains[0]));
  }
} finally {
  try { fs.rmSync(repo25, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T26 onward run inside an async IIFE: main() is a Promise-returning async function, and the
// deterministic signal-death seam (installed above) is exercised via runInProcess(), which awaits
// main() directly in this process. T1-T25 above are synchronous/subprocess-based and already ran
// to completion (top-to-bottom) before this IIFE is even invoked.
// ---------------------------------------------------------------------------
(async function runRemainingTests() {

// ---------------------------------------------------------------------------
// T26 (#618, load-insensitive per #635): a SIGNAL-KILLED chain on the SYNC (serial) dispatch path
// must map to exitCode 1 — NEVER a false green. Before the #618 fix,
// `(r.status != null) ? r.status : (r.error ? 1 : 0)` read a pure signal death (status===null, no
// spawnSync `error`) as exitCode 0. Uses the deterministic seam (above) so the EXACT signal name +
// `timed_out` value are pinned WITHOUT racing a real process.kill against the runner's own per-chain
// timer (the #635 flake) — the mock's spawnSync call is intercepted and answered synchronously, so
// there is nothing to race regardless of system load.
// ---------------------------------------------------------------------------
{
  const repo26 = makeGitRepo();
  try {
    const r26 = await runInProcess(repo26, [
      '--chains', 'claude',
      '--mock-chain', 'claude:' + signalDeathCommand('SIGKILL'),
    ], null, { KAOLA_RUN_CHAINS_CONCURRENCY: 'serial', KAOLA_RUN_CHAINS_RETRY: '1', KAOLA_RUN_CHAINS_TIMEOUT_MS: '30000' });
    assert(r26.exitCode !== 0, 'T26: a signal-killed chain (sync path) stays RED (non-zero overall exit)');
    const rc26 = r26.receipt;
    assert(rc26 !== null, 'T26: receipt written on a signal death');
    if (rc26 !== null) {
      const ch = rc26.chains[0];
      assert(ch.exitCode === 1, 'T26: sync-path signal death maps to exitCode 1 (never a false green); got ' + JSON.stringify(ch));
      assert(ch.timed_out === false, 'T26: NOT our own timeout kill (deterministic seam, no race) — timed_out stays false; got ' + JSON.stringify(ch));
      assert(ch.signal === 'SIGKILL', 'T26: the signal name SIGKILL is recorded in the receipt entry; got ' + JSON.stringify(ch.signal));
    }
  } finally {
    try { fs.rmSync(repo26, { recursive: true, force: true }); } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// T26b (#635): a REAL end-to-end self-kill subprocess (no seam — a lightweight integration sanity
// check that the deterministic seam above is not merely symptom-masking a broken real-world path).
// The assertion here is CLASS-only (exitCode 1, never the exact signal name): #618 guarantees ANY
// signal death — whichever signal actually wins under load, our own timer's SIGTERM or the mock's
// own SIGKILL — maps to exitCode 1, so this check is load-insensitive by construction; nothing here
// depends on which signal is delivered first.
// ---------------------------------------------------------------------------
{
  const repo26b = makeGitRepo();
  try {
    const killMock = makeSelfKillScript(repo26b, 'selfkill.js', 'SIGKILL');
    const r26b = run(repo26b, [
      '--chains', 'claude',
      '--mock-chain', 'claude:' + killMock,
    ], null, { KAOLA_RUN_CHAINS_CONCURRENCY: 'serial', KAOLA_RUN_CHAINS_RETRY: '1', KAOLA_RUN_CHAINS_TIMEOUT_MS: '30000' });
    assert(r26b.exitCode !== 0, 'T26b: a REAL self-killed chain (e2e sanity, sync path) stays RED (non-zero overall exit)');
    const rc26b = r26b.receipt;
    assert(rc26b !== null, 'T26b: receipt written on a real signal death');
    if (rc26b !== null) {
      assert(rc26b.chains[0].exitCode === 1, 'T26b: a real signal death maps to exitCode 1 regardless of which signal wins the race; got ' + JSON.stringify(rc26b.chains[0]));
    }
  } finally {
    try { fs.rmSync(repo26b, { recursive: true, force: true }); } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// T27 (#618, load-insensitive per #635): a SIGNAL-KILLED chain on the ASYNC (concurrent) dispatch
// path must map to exitCode 1. Before the #618 fix, `close(null, 'SIGKILL')` with timedOut===false
// fell through to `(code != null) ? code : 0` and read as exitCode 0 — a false green. Uses the
// deterministic seam for the killed chain (claude); the sibling (codex) is a REAL exit-0 mock so the
// genuine concurrent dispatch path is still exercised for "a sibling passes independently".
// ---------------------------------------------------------------------------
{
  const repo27 = makeGitRepo();
  try {
    const passMock = makeExitScript(repo27, 'pass.js', 0);
    const r27 = await runInProcess(repo27, [
      '--chains', 'claude,codex',
      '--mock-chain', 'claude:' + signalDeathCommand('SIGKILL'),
      '--mock-chain', 'codex:' + passMock,
    ], null, { KAOLA_RUN_CHAINS_CONCURRENCY: '2', KAOLA_RUN_CHAINS_RETRY: '1', KAOLA_RUN_CHAINS_TIMEOUT_MS: '30000' });
    assert(r27.exitCode !== 0, 'T27: a signal-killed chain (async/concurrent path) stays RED (non-zero overall exit)');
    const rc27 = r27.receipt;
    assert(rc27 !== null, 'T27: receipt written on a signal death');
    if (rc27 !== null) {
      const ch = rc27.chains.find(x => x.name === 'claude');
      assert(!!ch && ch.exitCode === 1, 'T27: async-path signal death maps to exitCode 1 (never a false green); got ' + JSON.stringify(ch));
      assert(!!ch && ch.timed_out === false, 'T27: NOT our own timeout kill (deterministic seam, no race) — timed_out stays false; got ' + JSON.stringify(ch));
      assert(!!ch && ch.signal === 'SIGKILL', 'T27: the signal name SIGKILL is recorded in the receipt entry; got ' + JSON.stringify(ch && ch.signal));
      const codexCh = rc27.chains.find(x => x.name === 'codex');
      assert(!!codexCh && codexCh.exitCode === 0, 'T27: the sibling chain still passes independently in the same run');
    }
  } finally {
    try { fs.rmSync(repo27, { recursive: true, force: true }); } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// T28 (#618, load-insensitive per #635): distinguishes "our own timeout kill" (already handled since
// #608 — SIGTERM via the per-chain timer, timed_out: true) from "external signal kill with
// timedOut===false" (the #618 fix). Both chains run CONCURRENTLY in ONE receipt so the two rows are
// directly comparable — a regression that conflates the two (e.g. sets timed_out for every
// signal-killed chain, or fails to fail-closed the external case) is caught here. The TIMER-killed
// chain (claude) stays a REAL hang-forever subprocess — not racy: it either eventually runs and
// hangs, or the runner's own timer fires regardless, either way it ends up killed by OUR timer, no
// external signal to compete with it. The EXTERNALLY-killed chain (codex) uses the deterministic
// seam so its exact signal/timed_out value is pinned without racing the runner's own (deliberately
// tight, 600ms) per-chain timer.
// ---------------------------------------------------------------------------
{
  const repo28 = makeGitRepo();
  try {
    const hangMock = path.join(repo28, 'hang.js');
    fs.writeFileSync(hangMock, '#!/usr/bin/env node\n\'use strict\';\nsetInterval(function(){}, 1000);\n', { mode: 0o755 });
    const r28 = await runInProcess(repo28, [
      '--chains', 'claude,codex',
      '--mock-chain', 'claude:' + hangMock,                             // killed by OUR timer -> SIGTERM, timed_out: true (unchanged, #608)
      '--mock-chain', 'codex:' + signalDeathCommand('SIGKILL'),         // deterministic seam, unrelated to our timer, timed_out: false (#618 fix)
    ], null, { KAOLA_RUN_CHAINS_CONCURRENCY: '2', KAOLA_RUN_CHAINS_RETRY: '1', KAOLA_RUN_CHAINS_TIMEOUT_MS: '600' });
    assert(r28.exitCode !== 0, 'T28: both red chains fail the overall run (non-zero exit)');
    const rc28 = r28.receipt;
    assert(rc28 !== null, 'T28: receipt written');
    if (rc28 !== null) {
      const timeoutCh = rc28.chains.find(x => x.name === 'claude');
      const signalCh = rc28.chains.find(x => x.name === 'codex');
      assert(!!timeoutCh && timeoutCh.exitCode === 1 && timeoutCh.timed_out === true,
        'T28: the TIMER-killed chain records timed_out: true (the #608 path, unchanged); got ' + JSON.stringify(timeoutCh));
      assert(!!signalCh && signalCh.exitCode === 1 && signalCh.timed_out === false && signalCh.signal === 'SIGKILL',
        'T28: the EXTERNALLY signal-killed chain records timed_out: false + signal: SIGKILL — distinct from a timeout; got ' + JSON.stringify(signalCh));
    }
  } finally {
    try { fs.rmSync(repo28, { recursive: true, force: true }); } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// T29 (#618): plan-validator --finalize-check must REFUSE a FRESH, HEAD-bound receipt whose
// chains[] array is EMPTY, with a typed `chains_empty` reason — mirroring the PRODUCER's own
// no_chains guard (T11 above) on the CONSUMER (gate) side. Before the fix, the redChains filter is
// vacuously empty over an empty array, so `{headSha:<HEAD>, chains: []}` reads as "zero chains
// verified" == "all chains green" and the gate wrongly PASSES.
// ---------------------------------------------------------------------------
{
  const PLAN_VALIDATOR = path.join(__dirname, 'kaola-workflow-plan-validator.js');
  const repo29 = makeGitRepo();
  try {
    // self-host marker: package.json declares an edition chain script, so the finalize discriminator
    // classifies this repo as chain-receipt (self-host), not the consumer final-validation.md path.
    fs.writeFileSync(path.join(repo29, 'package.json'), JSON.stringify({ scripts: {
      'test:kaola-workflow:claude': 'true' } }) + '\n');
    execFileSync('git', ['-C', repo29, 'add', 'package.json'], { encoding: 'utf8' });
    execFileSync('git', ['-C', repo29, 'commit', '-m', 'self-host package.json'], { encoding: 'utf8' });
    const proj = path.join(repo29, 'kaola-workflow', 'issue-618');
    fs.mkdirSync(proj, { recursive: true });
    const planPath = path.join(proj, 'workflow-plan.md');
    fs.writeFileSync(planPath, '# plan\n');
    execFileSync('git', ['-C', repo29, 'add', '-A'], { encoding: 'utf8' });
    execFileSync('git', ['-C', repo29, 'commit', '-m', 'plan'], { encoding: 'utf8' });
    const headSha = execFileSync('git', ['-C', repo29, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    fs.mkdirSync(path.join(proj, '.cache'), { recursive: true });
    fs.writeFileSync(path.join(proj, '.cache', 'chain-receipt.json'), JSON.stringify({ headSha, chains: [] }));
    const r = spawnSync(process.execPath, [PLAN_VALIDATOR, planPath, '--finalize-check', '--json'],
      { cwd: repo29, encoding: 'utf8', timeout: 30000 });
    let out = null;
    try { out = JSON.parse(r.stdout.trim()); } catch (_) {}
    assert(r.status === 1, 'T29: --finalize-check refuses (non-zero exit) on a fresh, empty chains[] receipt; got status ' + r.status + ' stdout=' + r.stdout);
    assert(out && out.result === 'refuse' && out.reason === 'chains_empty', 'T29: typed chains_empty refusal on an empty chains[] receipt; got ' + JSON.stringify(out));
  } finally {
    try { fs.rmSync(repo29, { recursive: true, force: true }); } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// T30: every dispatched chain owns a private temp root. This is an end-to-end probe through
// main() so it covers the actual spawn env on BOTH dispatch paths, including a concurrent retry.
// The child records whether TMPDIR existed while it ran; after main() returns the runner must have
// removed only that owned root. TMP/TEMP travel with TMPDIR for cross-platform child libraries, and
// the runner must never implement isolation by mutating its own process.env.
// ---------------------------------------------------------------------------
{
  const repo30 = makeGitRepo();
  const originalCwd = process.cwd();
  const envKeys = ['TMPDIR', 'TMP', 'TEMP'];
  const originalEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  const originalConcurrency = process.env.KAOLA_RUN_CHAINS_CONCURRENCY;
  try {
    const outerTmp = path.join(repo30, 'parent-tmp');
    fs.mkdirSync(outerTmp, { recursive: true });
    process.env.TMPDIR = outerTmp;
    process.env.TMP = path.join(repo30, 'parent-TMP-sentinel');
    process.env.TEMP = path.join(repo30, 'parent-TEMP-sentinel');
    const parentEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));

    function makeTempProbe(name, marker, transientFirst) {
      const script = path.join(repo30, name + '.js');
      const counter = script + '.count';
      fs.writeFileSync(script, [
        '#!/usr/bin/env node',
        "'use strict';",
        "const fs = require('fs');",
        'const marker = ' + JSON.stringify(marker) + ';',
        'const counter = ' + JSON.stringify(counter) + ';',
        "let attempt = 0; try { attempt = parseInt(fs.readFileSync(counter, 'utf8'), 10) || 0; } catch (_) {}",
        "attempt += 1; fs.writeFileSync(counter, String(attempt));",
        'const row = { attempt, TMPDIR: process.env.TMPDIR || null, TMP: process.env.TMP || null,',
        "  TEMP: process.env.TEMP || null, existed: !!process.env.TMPDIR && fs.existsSync(process.env.TMPDIR) };",
        "fs.appendFileSync(marker, JSON.stringify(row) + '\\n');",
        transientFirst
          ? "if (attempt === 1) { process.stderr.write('ECONNRESET from isolation probe\\n'); process.exit(1); }"
          : '',
        'process.exit(0);',
        '',
      ].join('\n'), { mode: 0o755 });
      return script;
    }

    function rows(marker) {
      return fs.readFileSync(marker, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    }

    const concurrentClaudeMarker = path.join(repo30, 'concurrent-claude.jsonl');
    const concurrentCodexMarker = path.join(repo30, 'concurrent-codex.jsonl');
    const concurrentClaude = makeTempProbe('concurrent-claude', concurrentClaudeMarker, false);
    const concurrentCodex = makeTempProbe('concurrent-codex', concurrentCodexMarker, true);
    const { main } = require('./kaola-workflow-run-chains.js');
    process.chdir(repo30);
    process.env.KAOLA_RUN_CHAINS_CONCURRENCY = '2';
    const concurrentExit = await main([
      'node', 'kaola-workflow-run-chains.js',
      '--chains', 'claude,codex',
      '--mock-chain', 'claude:' + concurrentClaude,
      '--mock-chain', 'codex:' + concurrentCodex,
      '--output', '.cache/t30-concurrent.json',
    ]);
    const concurrentClaudeRows = rows(concurrentClaudeMarker);
    const concurrentCodexRows = rows(concurrentCodexMarker);
    const concurrentRoots = [concurrentClaudeRows[0].TMPDIR, concurrentCodexRows[0].TMPDIR];
    assert(concurrentExit === 0, 'T30: concurrent run including a transient retry exits green');
    assert(concurrentRoots.every(Boolean) && concurrentRoots[0] !== concurrentRoots[1],
      'T30: concurrent chains receive distinct non-empty TMPDIR roots; got ' + JSON.stringify(concurrentRoots));
    assert(concurrentClaudeRows.concat(concurrentCodexRows).every(row => row.existed),
      'T30: every concurrent/retry child observes an existing TMPDIR while it runs');
    assert(concurrentClaudeRows.concat(concurrentCodexRows).every(row => row.TMP === row.TMPDIR && row.TEMP === row.TMPDIR),
      'T30: concurrent/retry child TMP and TEMP match its private TMPDIR');
    assert(concurrentCodexRows.length === 2 && concurrentCodexRows[0].TMPDIR === concurrentCodexRows[1].TMPDIR,
      'T30: retries stay inside the same chain-owned TMPDIR');
    assert(concurrentRoots.every(root => !fs.existsSync(root)),
      'T30: concurrent chain TMPDIR roots are cleaned after each chain settles');
    assert(envKeys.every(key => process.env[key] === parentEnv[key]),
      'T30: concurrent isolation does not mutate the runner parent environment');

    const serialGitlabMarker = path.join(repo30, 'serial-gitlab.jsonl');
    const serialGiteaMarker = path.join(repo30, 'serial-gitea.jsonl');
    const serialGitlab = makeTempProbe('serial-gitlab', serialGitlabMarker, false);
    const serialGitea = makeTempProbe('serial-gitea', serialGiteaMarker, false);
    process.env.KAOLA_RUN_CHAINS_CONCURRENCY = 'serial';
    const serialExit = await main([
      'node', 'kaola-workflow-run-chains.js',
      '--chains', 'gitlab,gitea',
      '--mock-chain', 'gitlab:' + serialGitlab,
      '--mock-chain', 'gitea:' + serialGitea,
      '--output', '.cache/t30-serial.json',
    ]);
    const serialRows = [rows(serialGitlabMarker)[0], rows(serialGiteaMarker)[0]];
    const serialRoots = serialRows.map(row => row.TMPDIR);
    assert(serialExit === 0, 'T30: forced-serial run exits green');
    assert(serialRoots.every(Boolean) && serialRoots[0] !== serialRoots[1],
      'T30: serial chains also receive distinct non-empty TMPDIR roots; got ' + JSON.stringify(serialRoots));
    assert(serialRows.every(row => row.existed && row.TMP === row.TMPDIR && row.TEMP === row.TMPDIR),
      'T30: every serial child observes one existing private TMPDIR/TMP/TEMP root');
    assert(serialRoots.every(root => !fs.existsSync(root)),
      'T30: serial chain TMPDIR roots are cleaned after each chain settles');
    assert(envKeys.every(key => process.env[key] === parentEnv[key]),
      'T30: serial isolation does not mutate the runner parent environment');
  } finally {
    if (originalConcurrency === undefined) delete process.env.KAOLA_RUN_CHAINS_CONCURRENCY;
    else process.env.KAOLA_RUN_CHAINS_CONCURRENCY = originalConcurrency;
    process.chdir(originalCwd);
    for (const key of envKeys) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
    try { fs.rmSync(repo30, { recursive: true, force: true }); } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// T31: cleanup preserves a foreign replacement at the owned TMPDIR path. The child removes its
// private directory, replaces that exact pathname with a symlink to a separate fixture directory,
// and writes sentinel bytes there. Identity-aware cleanup must leave the replacement link and its
// target byte-intact; the test finally unlinks only the known in-fixture link before removing the
// mkdtemp-owned fixture root.
// ---------------------------------------------------------------------------
{
  const repo31 = makeGitRepo();
  const originalCwd = process.cwd();
  const envKeys = ['TMPDIR', 'TMP', 'TEMP'];
  const originalEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  const originalConcurrency = process.env.KAOLA_RUN_CHAINS_CONCURRENCY;
  let replacementPath = null;
  try {
    const chainTempBase = path.join(repo31, 'chain-temp-base');
    const foreignTarget = path.join(repo31, 'foreign-target');
    const marker = path.join(repo31, 'foreign-replacement.json');
    const sentinel = Buffer.from('kaola foreign TMPDIR replacement\n\u0000\u00ff', 'utf8');
    fs.mkdirSync(chainTempBase, { recursive: true });

    const mock = path.join(repo31, 'replace-tmpdir.js');
    fs.writeFileSync(mock, [
      '#!/usr/bin/env node',
      "'use strict';",
      "const fs = require('fs');",
      'const tmpdir = process.env.TMPDIR;',
      'const target = ' + JSON.stringify(foreignTarget) + ';',
      'const marker = ' + JSON.stringify(marker) + ';',
      'const sentinel = Buffer.from(' + JSON.stringify(sentinel.toString('base64')) + ", 'base64');",
      "fs.rmSync(tmpdir, { recursive: true, force: true });",
      "fs.mkdirSync(target, { recursive: true });",
      "fs.writeFileSync(require('path').join(target, 'sentinel.bin'), sentinel);",
      "fs.symlinkSync(target, tmpdir, 'dir');",
      "fs.writeFileSync(marker, JSON.stringify({ tmpdir, target, link: fs.readlinkSync(tmpdir) }) + '\\n');",
      'process.exit(0);',
      '',
    ].join('\n'), { mode: 0o755 });

    process.env.TMPDIR = chainTempBase;
    process.env.TMP = chainTempBase;
    process.env.TEMP = chainTempBase;
    process.env.KAOLA_RUN_CHAINS_CONCURRENCY = 'serial';
    const parentEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
    const { main } = require('./kaola-workflow-run-chains.js');
    process.chdir(repo31);
    const exitCode = await main([
      'node', 'kaola-workflow-run-chains.js',
      '--chains', 'claude',
      '--mock-chain', 'claude:' + mock,
      '--output', '.cache/t31.json',
    ]);
    const observed = JSON.parse(fs.readFileSync(marker, 'utf8'));
    replacementPath = observed.tmpdir;
    assert(exitCode === 0, 'T31: foreign-replacement probe chain exits green');
    assert(fs.lstatSync(replacementPath).isSymbolicLink(),
      'T31: cleanup preserves the symlink that replaced the owned TMPDIR');
    assert(fs.readlinkSync(replacementPath) === foreignTarget && observed.link === foreignTarget,
      'T31: preserved replacement still points to the exact foreign fixture directory');
    assert(fs.readFileSync(path.join(foreignTarget, 'sentinel.bin')).equals(sentinel),
      'T31: foreign replacement sentinel remains byte-intact after runner cleanup');
    assert(envKeys.every(key => process.env[key] === parentEnv[key]),
      'T31: adversarial replacement does not mutate the runner parent environment');
  } finally {
    if (originalConcurrency === undefined) delete process.env.KAOLA_RUN_CHAINS_CONCURRENCY;
    else process.env.KAOLA_RUN_CHAINS_CONCURRENCY = originalConcurrency;
    process.chdir(originalCwd);
    for (const key of envKeys) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
    if (replacementPath) {
      const relative = path.relative(repo31, replacementPath);
      if (relative && relative !== '..' && !relative.startsWith('..' + path.sep)
          && !path.isAbsolute(relative)) {
        try {
          if (fs.lstatSync(replacementPath).isSymbolicLink()) fs.unlinkSync(replacementPath);
        } catch (_) {}
      }
    }
    try { fs.rmSync(repo31, { recursive: true, force: true }); } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// Final result
// ---------------------------------------------------------------------------
if (failed > 0) {
  console.error('run-chains tests FAILED (' + failed + ' failures, ' + passed + ' passed)');
  process.exitCode = 1;
} else {
  console.log('run-chains tests passed (' + passed + ' assertions)');
}

})().catch(function (err) {
  console.error('run-chains tests FAILED with an uncaught error: ' + ((err && err.stack) || err));
  process.exitCode = 1;
});
