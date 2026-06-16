#!/usr/bin/env node
'use strict';

// Standalone tests for kaola-workflow-run-chains.js (#432 — D-432-01).
// Tests receipt schema validity, exit-code propagation, --accept-known-red
// waiver semantics, invalid waiver format rejection, and headSha binding.
// Uses temp git repos so git rev-parse HEAD is a real SHA.
// Hand-rolled assert pattern — no test framework dependency.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

let passed = 0, failed = 0;
function assert(c, m) { if (c) passed++; else { failed++; console.error('FAIL: ' + m); } }

const RUN_CHAINS = path.join(__dirname, 'kaola-workflow-run-chains.js');

// Spawn run-chains as a subprocess in repoDir with the given extra argv.
// Reads and parses the receipt from outputPath (must be supplied explicitly
// or the default .cache/chain-receipt.json will be used).
function run(repoDir, extraArgs, receiptPath) {
  const rp = receiptPath || path.join(repoDir, '.cache', 'chain-receipt.json');
  const r = spawnSync(process.execPath, [RUN_CHAINS, ...extraArgs], {
    cwd: repoDir,
    encoding: 'utf8',
    timeout: 30000,
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
// T12 (#512): resolveTimeoutMs unit — env override, default 900000, invalid fallback.
// ---------------------------------------------------------------------------
{
  const { resolveTimeoutMs } = require('./kaola-workflow-run-chains.js');
  // unset env → default 900000
  assert(resolveTimeoutMs({}) === 900000, 'T12: unset env returns default 900000');
  // valid override
  assert(resolveTimeoutMs({ KAOLA_RUN_CHAINS_TIMEOUT_MS: '1200000' }) === 1200000, 'T12: valid override 1200000 is respected');
  // invalid string → fallback
  assert(resolveTimeoutMs({ KAOLA_RUN_CHAINS_TIMEOUT_MS: 'abc' }) === 900000, 'T12: "abc" falls back to 900000');
  // zero → fallback (not > 0)
  assert(resolveTimeoutMs({ KAOLA_RUN_CHAINS_TIMEOUT_MS: '0' }) === 900000, 'T12: "0" falls back to 900000');
  // negative → fallback
  assert(resolveTimeoutMs({ KAOLA_RUN_CHAINS_TIMEOUT_MS: '-5' }) === 900000, 'T12: "-5" falls back to 900000');
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
