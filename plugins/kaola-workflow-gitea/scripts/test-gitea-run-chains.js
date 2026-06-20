#!/usr/bin/env node
'use strict';

// Standalone failing-path tests for kaola-gitea-workflow-run-chains.js (#550).
//
// COVERAGE GAP THIS CLOSES: the gitea run-chains port reuses the forge classifier's
// `isTransientFetchStderr` (the single transient-infra signature surface) inside
// runChainWithRetry. When the forge classifier's module.exports OMITTED that function
// (the #550 blocker), `isTransientFetchStderr` resolved to `undefined` and the FIRST
// failing chain threw `TypeError: isTransientFetchStderr is not a function` at the retry
// gate — no receipt was ever written. The all-pass path never exercised it (a green chain
// short-circuits before the retry check), so the canonical T1/T7-style green tests hid this.
//
// These tests drive the FORGE run-chains on a NON-ZERO (failing) chain and assert it
// produces a clean receipt WITHOUT a TypeError (i.e. isTransientFetchStderr is callable),
// plus a positive transient-signature path that proves the classifier export is the
// correct function (transient -> retry -> green). Mirrors the canonical test-run-chains.js
// mock-chain pattern (T19/T20), but require/exec the FORGE run-chains + classifier.
//
// Hand-rolled assert pattern — no test framework dependency.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

let passed = 0, failed = 0;
function assert(c, m) { if (c) passed++; else { failed++; console.error('FAIL: ' + m); } }

const RUN_CHAINS = path.join(__dirname, 'kaola-gitea-workflow-run-chains.js');
const CLASSIFIER = path.join(__dirname, 'kaola-gitea-workflow-classifier.js');

// Spawn run-chains as a subprocess in repoDir with the given extra argv.
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

// Minimal git repo with one commit so git rev-parse HEAD returns a real SHA.
function makeGitRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-runchains-'));
  const g = (args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
  g(['init', '-q', '-b', 'main']);
  g(['config', 'user.email', 'test@example.com']);
  g(['config', 'user.name', 'Test']);
  fs.writeFileSync(path.join(dir, 'seed.txt'), 'seed\n');
  g(['add', 'seed.txt']);
  g(['commit', '-q', '-m', 'seed']);
  return dir;
}

// A counter-file mock: on attempt N it reads/increments a side-file then behaves per
// `bodyByAttempt`, a JS function body given (attemptNumber). The counter persists across
// spawns so a single chain's retries see distinct N. (Mirrors canonical makeCounterMock.)
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
// G1 (#550): the classifier export IS callable. require() the forge classifier directly
// and assert isTransientFetchStderr (the surface run-chains:216 reaches) is a function and
// returns the correct boolean for a known transient signature vs a plain assertion line.
// This is the root-cause unit assertion: an omitted export makes it `undefined`.
// ---------------------------------------------------------------------------
{
  const cls = require(CLASSIFIER);
  assert(typeof cls.isTransientFetchStderr === 'function', 'G1: classifier exports isTransientFetchStderr as a function (not undefined)');
  assert(typeof cls.classifyFetchError === 'function', 'G1: classifier exports classifyFetchError as a function');
  assert(typeof cls.isTransientFetchError === 'function', 'G1: classifier exports isTransientFetchError as a function');
  assert(typeof cls.TransientFetchError === 'function', 'G1: classifier exports TransientFetchError (class) as a function');
  if (typeof cls.isTransientFetchStderr === 'function') {
    assert(cls.isTransientFetchStderr('error: TLS handshake timeout talking to api') === true,
      'G1: isTransientFetchStderr() returns true for a known transient signature');
    assert(cls.isTransientFetchStderr('AssertionError: expected 1 to equal 2') === false,
      'G1: isTransientFetchStderr() returns false for a plain assertion failure');
  }
}

// ---------------------------------------------------------------------------
// G2 (#550): a DETERMINATE failing chain (non-zero exit, NO transient signature) produces a
// CLEAN {result:fail}-shaped receipt WITHOUT a TypeError. This is the exact path that crashed
// at run-chains.js:216 when isTransientFetchStderr was undefined. The chain must run EXACTLY
// ONCE (a determinate red is never retried) and stay red.
// ---------------------------------------------------------------------------
const repoG2 = makeGitRepo();
try {
  const body = 'function(n){ process.stderr.write("AssertionError: expected 1 to equal 2\\n"); process.exit(1); }';
  const mock = makeCounterMock(repoG2, 'determinate.js', body);
  const r = run(repoG2, [
    '--chains', 'gitea',
    '--mock-chain', 'gitea:' + mock,
  ], null, { KAOLA_RUN_CHAINS_CONCURRENCY: 'serial', KAOLA_RUN_CHAINS_RETRY: '2' });

  // The blocker symptom was a TypeError on stderr + NO receipt. Assert neither happens.
  assert(!(r.stderr || '').includes('TypeError'), 'G2: no TypeError on a failing chain (isTransientFetchStderr is callable); stderr=' + JSON.stringify((r.stderr || '').slice(0, 200)));
  assert(!(r.stderr || '').includes('is not a function'), 'G2: no "is not a function" on a failing chain');
  assert(r.exitCode !== 0, 'G2: a determinate-red chain stays RED (non-zero exit)');
  assert(r.receipt !== null, 'G2: a clean receipt IS written on a failing chain (not swallowed by a crash)');
  if (r.receipt !== null) {
    assert(Array.isArray(r.receipt.chains) && r.receipt.chains.length === 1, 'G2: one chain entry in receipt');
    const ch = r.receipt.chains[0];
    assert(ch.exitCode === 1, 'G2: receipt records exit 1 (still red)');
    assert(ch.attempts === 1, 'G2: a determinate red is NEVER retried — attempts === 1; got ' + ch.attempts);
    assert(ch.retried_transient === false, 'G2: retried_transient === false (no transient signature)');
  }
} finally {
  try { fs.rmSync(repoG2, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// G3 (#550): a TRANSIENT-then-pass chain exercises isTransientFetchStderr returning TRUE on the
// captured output (proving the exported function does real work, not a stub). Attempt 1 emits a
// known transient signature + exit 1; attempt 2 exits 0. The chain must RETRY (attempts === 2)
// and come up GREEN — only reachable if the classifier export is the real function.
// ---------------------------------------------------------------------------
const repoG3 = makeGitRepo();
try {
  const body = 'function(n){ if (n === 1) { process.stderr.write("error: TLS handshake timeout talking to api\\n"); process.exit(1); } process.exit(0); }';
  const mock = makeCounterMock(repoG3, 'transient.js', body);
  const r = run(repoG3, [
    '--chains', 'gitea',
    '--mock-chain', 'gitea:' + mock,
  ], null, { KAOLA_RUN_CHAINS_CONCURRENCY: 'serial', KAOLA_RUN_CHAINS_RETRY: '2' });

  assert(!(r.stderr || '').includes('TypeError'), 'G3: no TypeError on the transient-retry path');
  assert(r.exitCode === 0, 'G3: transient-then-pass chain comes up GREEN after retry (exit 0)');
  assert(r.receipt !== null, 'G3: receipt written');
  if (r.receipt !== null) {
    const ch = r.receipt.chains[0];
    assert(ch.exitCode === 0, 'G3: receipt records the FINAL (green) exitCode 0');
    assert(ch.attempts === 2, 'G3: attempts === 2 (one transient retry); got ' + ch.attempts);
    assert(ch.retried_transient === true, 'G3: retried_transient === true');
  }
} finally {
  try { fs.rmSync(repoG3, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// Final result
// ---------------------------------------------------------------------------
if (failed > 0) {
  console.error('gitea run-chains tests FAILED (' + failed + ' failures, ' + passed + ' passed)');
  process.exitCode = 1;
} else {
  console.log('gitea run-chains tests passed (' + passed + ' assertions)');
}
