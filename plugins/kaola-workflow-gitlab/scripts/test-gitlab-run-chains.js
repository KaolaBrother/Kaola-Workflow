#!/usr/bin/env node
'use strict';

// Standalone failing-path tests for kaola-gitlab-workflow-run-chains.js (#550).
//
// COVERAGE GAP THIS CLOSES: the gitlab run-chains port reuses the forge classifier's
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

const RUN_CHAINS = path.join(__dirname, 'kaola-gitlab-workflow-run-chains.js');
const CLASSIFIER = path.join(__dirname, 'kaola-gitlab-workflow-classifier.js');

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-runchains-'));
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
    '--chains', 'gitlab',
    '--mock-chain', 'gitlab:' + mock,
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
    '--chains', 'gitlab',
    '--mock-chain', 'gitlab:' + mock,
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
// Phase B (receipt diet) — the forge run-chains port carries the same step-decomposition (B0),
// diff-scoped chain selection (B1), and hoisted-repeat dedup (B2) logic as canonical (it is a
// rename-normalized copy). These drive the FORGE port on REAL chains parsed from a self-host
// package.json. Mirrors canonical test-run-chains.js T32/T33/T34.
// ---------------------------------------------------------------------------
function makeScopeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-scope-'));
  const g = (a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' }).trim();
  g(['init', '-q', '-b', 'main']);
  g(['config', 'user.email', 'test@example.com']);
  g(['config', 'user.name', 'Test']);
  const stepScript = (name) => {
    fs.writeFileSync(path.join(dir, name), '#!/usr/bin/env node\n\'use strict\';\nprocess.exit(0);\n', { mode: 0o755 });
    return 'node ' + name;
  };
  const A = stepScript('A.js'), B = stepScript('B.js'), C = stepScript('C.js'), D = stepScript('D.js'), E = stepScript('E.js');
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: {
    'test:kaola-workflow:claude': A + ' && ' + B,
    'test:kaola-workflow:codex': A + ' && ' + C,
    'test:kaola-workflow:gitlab': A + ' && ' + D,
    'test:kaola-workflow:gitea': A + ' && ' + E,
  } }, null, 2) + '\n');
  // A genuinely non-edition (claude-only) source file (README.md / CLAUDE.md / commands/ / agents/ /
  // .agents/ / docs/ are ROOT cross-edition READ surfaces the non-claude validators assert on — G7).
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'app.js'), 'exports.x = 1;\n');
  g(['add', '-A']);
  g(['commit', '-q', '-m', 'base']);
  return dir;
}
function projReceipt(dir, proj) { return path.join(dir, 'kaola-workflow', proj, '.cache', 'chain-receipt.json'); }
function chainNames(rc) { return (rc && rc.chains ? rc.chains.map(c => c.name) : []).join(','); }

// G4 (B0): the forge port decomposes a real chain into its package.json steps with per-step timings.
{
  const dir = makeScopeRepo();
  try {
    const rp = projReceipt(dir, 'issue-b0');
    const r = run(dir, ['--chains', 'gitlab', '--project', 'issue-b0'], rp, { KAOLA_RUN_CHAINS_CONCURRENCY: 'serial' });
    assert(r.exitCode === 0, 'G4: real 2-step gitlab chain exits 0; stderr=' + (r.stderr || '').slice(0, 200));
    const steps = r.receipt && r.receipt.chains && r.receipt.chains[0] && r.receipt.chains[0].steps;
    assert(Array.isArray(steps) && steps.length === 2 && steps.every(s => typeof s.duration_ms === 'number' && typeof s.exitCode === 'number'),
      'G4: chains[0].steps has 2 decomposed step entries with timings; got ' + JSON.stringify(steps));
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
}

// G5 (B1): a claude-only diff + --project selects the claude chain ONLY on the forge port.
{
  const dir = makeScopeRepo();
  try {
    fs.writeFileSync(path.join(dir, 'src', 'app.js'), 'exports.x = 2;\n');
    const rp = projReceipt(dir, 'issue-scope-claude');
    const r = run(dir, ['--project', 'issue-scope-claude'], rp, { KAOLA_RUN_CHAINS_CONCURRENCY: 'serial', KAOLA_FINALIZE_BASE: 'main' });
    assert(r.exitCode === 0, 'G5: claude-only scoped run exits 0; stderr=' + (r.stderr || '').slice(0, 200));
    assert(chainNames(r.receipt) === 'claude' && r.receipt.scope && r.receipt.scope.decision === 'claude-only',
      'G5: a non-edition diff selects the claude chain only; got ' + JSON.stringify(chainNames(r.receipt)) + ' scope=' + JSON.stringify(r.receipt && r.receipt.scope));
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
}

// G6 (B1): a diff touching plugins/ (edition coupling) + --project selects ALL FOUR on the forge port.
{
  const dir = makeScopeRepo();
  try {
    const f = path.join(dir, 'plugins', 'kaola-workflow-gitea', 'scripts', 'touched.js');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, '// touched\n');
    const rp = projReceipt(dir, 'issue-scope-all');
    const r = run(dir, ['--project', 'issue-scope-all'], rp, { KAOLA_RUN_CHAINS_CONCURRENCY: 'serial', KAOLA_FINALIZE_BASE: 'main' });
    assert(r.exitCode === 0, 'G6: all-four scoped run exits 0; stderr=' + (r.stderr || '').slice(0, 200));
    assert(chainNames(r.receipt) === 'claude,codex,gitlab,gitea' && r.receipt.scope && r.receipt.scope.decision === 'all-four',
      'G6: an edition-coupling diff selects all four; got ' + JSON.stringify(chainNames(r.receipt)) + ' scope=' + JSON.stringify(r.receipt && r.receipt.scope));
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
}

// G7 (B1 fail-open closure): a diff confined to a ROOT cross-edition READ surface — a file a
// non-claude contract validator asserts byte-parity / content on, OUTSIDE plugins/, package.json,
// the forge-referenced scripts, and the codex-mirrored scripts/ — forces ALL FOUR chains on the
// forge port too. A genuinely claude-only source diff still narrows to claude alone.
{
  const rootReadSurfaces = [
    'commands/workflow-init.md', 'commands/kaola-workflow-plan-run.md',
    '.agents/plugins/marketplace.json', 'agents/workflow-planner.md',
    'CLAUDE.md', 'README.md', 'docs/api.md', 'docs/workflow-state-contract.md',
    'install.sh', 'uninstall.sh',
  ];
  for (const rel of rootReadSurfaces) {
    const dir = makeScopeRepo();
    try {
      const abs = path.join(dir, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, 'edition-coupling change\n');
      const proj = 'issue-r1-' + rel.replace(/[^a-z0-9]+/gi, '-');
      const rp = projReceipt(dir, proj);
      const r = run(dir, ['--project', proj], rp, { KAOLA_RUN_CHAINS_CONCURRENCY: 'serial', KAOLA_FINALIZE_BASE: 'main' });
      assert(chainNames(r.receipt) === 'claude,codex,gitlab,gitea' && r.receipt.scope && r.receipt.scope.decision === 'all-four' && r.receipt.scope.reason === 'edition_coupling',
        'G7: root cross-edition read surface ' + JSON.stringify(rel) + ' forces all four; got ' + JSON.stringify(chainNames(r.receipt)) + ' scope=' + JSON.stringify(r.receipt && r.receipt.scope));
    } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
  }
  const dir = makeScopeRepo();
  try {
    fs.writeFileSync(path.join(dir, 'src', 'feature.js'), 'exports.y = 9;\n');
    const rp = projReceipt(dir, 'issue-r1-claudeonly');
    const r = run(dir, ['--project', 'issue-r1-claudeonly'], rp, { KAOLA_RUN_CHAINS_CONCURRENCY: 'serial', KAOLA_FINALIZE_BASE: 'main' });
    assert(chainNames(r.receipt) === 'claude' && r.receipt.scope && r.receipt.scope.decision === 'claude-only',
      'G7: a genuinely claude-only source diff still selects the claude chain only; got ' + JSON.stringify(chainNames(r.receipt)));
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
}

// G8 (per-chain timeout contract): a decomposed multi-step chain whose steps each finish under the
// timeout but whose CUMULATIVE wall-clock exceeds it is killed once the per-chain budget is spent
// (timed_out: true) — the bound is per CHAIN, not per step.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-timeout-'));
  try {
    const g = (a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' }).trim();
    g(['init', '-q', '-b', 'main']); g(['config', 'user.email', 't@e.com']); g(['config', 'user.name', 'T']);
    const sleepStep = (name, ms) => {
      fs.writeFileSync(path.join(dir, name), '#!/usr/bin/env node\n\'use strict\';\nsetTimeout(function(){ process.exit(0); }, ' + ms + ');\n', { mode: 0o755 });
      return 'node ' + name;
    };
    const s1 = sleepStep('s1.js', 250), s2 = sleepStep('s2.js', 250), s3 = sleepStep('s3.js', 250), s4 = sleepStep('s4.js', 250);
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: { 'test:kaola-workflow:gitlab': s1 + ' && ' + s2 + ' && ' + s3 + ' && ' + s4 } }, null, 2) + '\n');
    g(['add', '-A']); g(['commit', '-q', '-m', 'base']);
    const rp = path.join(dir, '.cache', 'chain-receipt.json');
    const r = run(dir, ['--chains', 'gitlab'], rp, { KAOLA_RUN_CHAINS_CONCURRENCY: 'serial', KAOLA_RUN_CHAINS_RETRY: '1', KAOLA_RUN_CHAINS_TIMEOUT_MS: '800' });
    assert(r.exitCode !== 0, 'G8: a chain exceeding its per-chain wall-clock budget stays RED');
    const ch = r.receipt && r.receipt.chains && r.receipt.chains[0];
    assert(ch && ch.timed_out === true && ch.exitCode === 1 && (ch.steps || []).filter(s => s.exitCode === 0).length < 4,
      'G8: chain killed once cumulative wall-clock passes the per-chain bound (timed_out:true, <4 green steps); got ' + JSON.stringify(ch));
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
}

// ---------------------------------------------------------------------------
// Final result
// ---------------------------------------------------------------------------
if (failed > 0) {
  console.error('gitlab run-chains tests FAILED (' + failed + ' failures, ' + passed + ' passed)');
  process.exitCode = 1;
} else {
  console.log('gitlab run-chains tests passed (' + passed + ' assertions)');
}
