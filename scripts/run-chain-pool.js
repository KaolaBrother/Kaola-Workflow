#!/usr/bin/env node
'use strict';

// run-chain-pool.js — within-chain step pool for the validation chains.
//
// TEST INFRASTRUCTURE ONLY. Nothing here ships or installs; it changes HOW the
// chain's steps are scheduled, never WHAT they assert.
//
// Why
// ---
// A chain is a list of independent `node scripts/<suite>.js` invocations joined by
// `&&`. Joined that way its wall-clock is the SUM of every step even though the steps
// share nothing: each suite builds its own fixtures under its own temp root and the
// repo working tree is only ever read. Scheduling them in a pool collapses the chain
// toward max(step) instead of sum(step).
//
// Two mechanisms:
//   1. POOL — the steps run in a bounded worker pool, each in its own private TMPDIR
//      (so a suite that roots a fixture at a FIXED os.tmpdir() path cannot collide with
//      a concurrent step). Ordering: `--first` steps run serially, in order, before the
//      pool opens — that is where a step that WRITES into the repo belongs, because
//      every pooled step reads the tree it produces.
//   2. SHARD EXPANSION — a suite listed in SHARDED_SUITES is expanded into N
//      `--shard i/N` sub-steps that the same pool schedules. This is what removes a
//      single-suite pole that is larger than the whole budget: one suite's scenarios
//      are split across workers instead of one worker running all of them.
//
// Coverage
// --------
// Shard expansion is fail-closed on coverage. Every shard prints a coverage line
// (test-shard-lib.js); after a suite's shards finish, this runner asserts that they
// all agree on the registered scenario count and that their slices SUM to exactly that
// count. A partition that ever dropped or duplicated a scenario turns the chain RED —
// a faster chain that quietly tests less is a failure, not a speed-up.
//
// Failure semantics
// -----------------
// `&&` stops at the first red. The pool runs every step and reports ALL of them, then
// exits 1 if any failed. That is strictly more information per run and never fewer
// assertions; a red chain stays red.
//
// Usage
//   node scripts/run-chain-pool.js [--first <command>]... <command>...
//
// Env
//   KAOLA_TEST_POOL_CONCURRENCY  auto (default) | serial | 1 | <N>   pool size
//   KAOLA_TEST_POOL_SHARDS       auto (default) | off | <N>          shard-expansion width
//   KAOLA_TEST_POOL_TIMEOUT_MS   per-step timeout in ms (default 1800000 / 30 min)
//
// Exported TO each unit:
//   KAOLA_TEST_TIMEOUT_SCALE     the pool size — a suite multiplies its own per-subprocess
//                                HANG guards by this so concurrency cannot fire them falsely

const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const shardLib = require('./test-shard-lib');

// ---------------------------------------------------------------------------
// Registries
// ---------------------------------------------------------------------------

// Suites that carry a scenario registry and honour `--shard i/N`. The value is the
// DEFAULT shard width; KAOLA_TEST_POOL_SHARDS scales it. A suite is only listed here
// once its scenarios are proven independent (each owns its fixtures) — the shard
// coverage audit then keeps that true on every run.
const SHARDED_SUITES = {};

// simulate-workflow-walkthrough.js accepts --shard (see its registry) but is DELIBERATELY not
// expanded here: its scenarios were observed to go red when several of its shards run
// concurrently against the same checkout, so its independence is not established. It runs whole.
// Correctness before speed — an unproven partition is not a speed-up, it is a flaky gate.

// Measured wall-clock hints (seconds) used ONLY to order the pool queue longest-first,
// so the critical path starts at t=0 instead of behind a queue of sub-second steps.
// A missing entry defaults to DEFAULT_COST. Scheduling only — never a verdict.
const DEFAULT_COST = 3;
const COST_HINT = {
  'node scripts/simulate-workflow-walkthrough.js': 360,
  'node scripts/test-claim-hardening.js': 52,
  'node scripts/test-install-upgrade-rewrite.js': 28,
  'node scripts/test-install-model-rendering.js': 25,
  'node scripts/test-sink-merge.js': 20,
  'node scripts/test-install-adaptive-config.js': 11,
  'node scripts/test-validation-runner.js': 8,
  'node scripts/test-run-chains.js': 8,
  'node scripts/test-install-all.js': 6,
  'node scripts/test-bundle-state.js': 5,
  'node scripts/test-route-reachability.js': 4,
  'node scripts/test-install-upgrade.js': 4,
  'node scripts/test-bundle-finalize.js': 4,
  'node scripts/test-bundle-claim.js': 4,
  'node scripts/test-release.js': 4,
  'node scripts/validate-workflow-contracts.js': 3,
};

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

// The pool is the ONLY scheduler in the chain, so its size is the whole run's process
// concurrency budget.
//
// MAX_POOL is a MEASURED ceiling, not a core count. Every unit is a subprocess TREE that
// builds git fixtures and copies trees, and those do not scale with cores: profiling this
// chain showed per-step wall-clock essentially unchanged at 4 concurrent steps, but 5-12x
// inflation at 6, and 20x inflation plus ETIMEDOUT false reds at 16 — several suites carry
// their own per-subprocess timeouts calibrated for a quiet host, and an oversubscribed host
// fires them. A gate that goes red under its own concurrency is worse than a slow gate, so
// the default stays at the width that was measured non-inflating. Raise it with
// KAOLA_TEST_POOL_CONCURRENCY on a host you have profiled; `serial` restores the exact
// one-step-at-a-time behaviour of the old `&&` chain.
const MAX_POOL = 4;
function resolveConcurrency(env, cpuCount, stepCount) {
  const cores = (Number.isFinite(cpuCount) && cpuCount > 0) ? Math.floor(cpuCount) : 1;
  const steps = Math.max(1, stepCount || 1);
  const raw = String((env && env.KAOLA_TEST_POOL_CONCURRENCY) || '').trim().toLowerCase();
  if (raw === 'serial' || raw === '1') return 1;
  if (raw && raw !== 'auto') {
    const forced = parseInt(raw, 10);
    if (Number.isFinite(forced) && forced > 0) return Math.min(forced, steps);
    // a typo falls through to auto — never crash the gate on an env var
  }
  if (cores <= 2) return 1;
  return Math.min(steps, Math.max(2, Math.min(MAX_POOL, cores)));
}

// Shard width for one suite. `off` disables expansion entirely (the suite runs whole —
// the pre-pool behaviour, kept as the escape hatch for a constrained host).
function resolveShardWidth(env, defaultWidth) {
  const raw = String((env && env.KAOLA_TEST_POOL_SHARDS) || '').trim().toLowerCase();
  if (raw === 'off' || raw === '1') return 1;
  if (raw && raw !== 'auto') {
    const forced = parseInt(raw, 10);
    if (Number.isFinite(forced) && forced > 0) return forced;
  }
  return Math.max(1, defaultWidth | 0);
}

function resolveTimeoutMs(env) {
  const raw = parseInt(String((env && env.KAOLA_TEST_POOL_TIMEOUT_MS) || ''), 10);
  return (Number.isFinite(raw) && raw > 0) ? raw : 1800000;
}

// ---------------------------------------------------------------------------
// Step planning
// ---------------------------------------------------------------------------

/**
 * Expand the declared step list into the units the pool actually schedules.
 * A sharded suite becomes N units tagged with the suite it came from so the coverage
 * audit can group them again. Units are returned longest-hint-first.
 */
function planUnits(commands, env) {
  const units = [];
  for (const command of commands) {
    const declared = SHARDED_SUITES[command];
    const width = declared ? resolveShardWidth(env, declared) : 1;
    if (width > 1) {
      for (let i = 1; i <= width; i++) {
        units.push({
          command: command + ' --shard ' + i + '/' + width,
          suite: command,
          shards: width,
          cost: (COST_HINT[command] || DEFAULT_COST) / width,
        });
      }
    } else {
      units.push({ command, suite: null, shards: 1, cost: COST_HINT[command] || DEFAULT_COST });
    }
  }
  return units.slice().sort((a, b) => b.cost - a.cost);
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

// Every unit gets a private TMPDIR. Suites in this repo root fixtures under os.tmpdir(),
// and a few use a FIXED name there (a content-seeded sandbox root that is wiped on
// entry). Per-unit isolation makes that safe under concurrency without touching a suite.
function makeIsolatedEnv(baseEnv, timeoutScale) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-pool-'));
  return {
    root,
    env: Object.assign({}, baseEnv, {
      TMPDIR: root, TMP: root, TEMP: root,
      // A suite's internal per-subprocess timeouts are HANG guards calibrated for an idle
      // host. Under a concurrent pool an individual fixture subprocess legitimately takes
      // far longer, and a guard that fires then reports a false red. Export the load factor
      // so a suite can scale its guards; the pool's own per-step timeout still bounds a
      // genuine hang, so nothing becomes unbounded.
      KAOLA_TEST_TIMEOUT_SCALE: String(Math.max(1, timeoutScale | 0)),
    }),
  };
}

function cleanupRoot(root) {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) { /* best effort */ }
}

function runUnit(unit, cwd, timeoutMs, baseEnv, timeoutScale) {
  return new Promise((resolve) => {
    const isolation = makeIsolatedEnv(baseEnv, timeoutScale);
    const t0 = Date.now();
    const bufs = [];
    let timedOut = false;
    let settled = false;
    const child = spawn('sh', ['-c', unit.command], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: isolation.env,
    });
    const timer = setTimeout(() => { timedOut = true; try { child.kill('SIGKILL'); } catch (_) {} }, timeoutMs);
    if (child.stdout) child.stdout.on('data', (d) => bufs.push(d));
    if (child.stderr) child.stderr.on('data', (d) => bufs.push(d));
    const done = (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanupRoot(isolation.root);
      resolve({
        unit,
        // A signal death (an external OOM kill, our own timeout) carries no exit code:
        // it is ALWAYS red, never the `code || 0` false green.
        exitCode: (timedOut || exitCode == null) ? 1 : exitCode,
        signal: signal || null,
        timedOut,
        durationMs: Date.now() - t0,
        output: Buffer.concat(bufs).toString('utf8'),
      });
    };
    child.on('error', (err) => {
      bufs.push(Buffer.from('\nspawn error: ' + String((err && err.message) || err) + '\n'));
      done(1, null);
    });
    child.on('close', (code, signal) => done(code, signal));
  });
}

async function runPool(units, cwd, concurrency, timeoutMs, baseEnv, onResult) {
  const results = [];
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= units.length) return;
      const r = await runUnit(units[i], cwd, timeoutMs, baseEnv, concurrency);
      results.push(r);
      if (onResult) onResult(r);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, units.length)) }, () => worker()));
  return results;
}

// ---------------------------------------------------------------------------
// Coverage audit
// ---------------------------------------------------------------------------

/**
 * For each expanded suite, re-derive its shard coverage from the shards' own output.
 * Returns an array of failures (empty === every suite fully covered).
 */
function auditExpansions(units, results) {
  const failures = [];
  const suites = new Map();
  for (const u of units) {
    if (u.suite) suites.set(u.suite, u.shards);
  }
  for (const [suite, width] of suites) {
    const mine = results.filter(r => r.unit.suite === suite);
    const reports = [];
    for (const r of mine) reports.push(...shardLib.parseCoverage(r.output));
    // The suite name inside the coverage line is the suite's own label, not the
    // command; group by taking whatever label the shards reported (they must agree).
    const labels = new Set(reports.map(r => r.suite));
    if (labels.size !== 1) {
      failures.push({
        suite,
        error: labels.size === 0 ? 'shard_report_missing' : 'shard_report_ambiguous',
        detail: suite + ': expected one coverage label from ' + width + ' shards, got ' + JSON.stringify([...labels]),
      });
      continue;
    }
    const verdict = shardLib.auditShardCoverage([...labels][0], width, reports);
    if (!verdict.ok) failures.push({ suite, error: verdict.error, detail: verdict.detail });
  }
  return failures;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const first = [];
  const pooled = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--first') {
      const cmd = argv[++i];
      if (!cmd) throw new Error('--first requires a command argument');
      first.push(cmd);
    } else {
      pooled.push(argv[i]);
    }
  }
  return { first, pooled };
}

function fmt(ms) { return (ms / 1000).toFixed(1) + 's'; }

async function main() {
  const { first, pooled } = parseArgs(process.argv.slice(2));
  if (!pooled.length && !first.length) {
    process.stderr.write('run-chain-pool: no steps given\n');
    process.exit(2);
  }
  const cwd = process.cwd();
  const timeoutMs = resolveTimeoutMs(process.env);
  const t0 = Date.now();
  const failures = [];

  // --first: serial, in order, `&&` semantics. A step here produces state every pooled
  // step reads, so a red one aborts before the pool opens.
  for (const command of first) {
    const r = await runUnit({ command, suite: null, shards: 1, cost: 0 }, cwd, timeoutMs, process.env, 1);
    process.stdout.write((r.exitCode === 0 ? 'PASS  ' : 'FAIL  ') + fmt(r.durationMs).padStart(8) + '  ' + command + '\n');
    if (r.exitCode !== 0) {
      process.stdout.write('--- ' + command + ' ---\n' + r.output.split('\n').slice(-40).join('\n') + '\n');
      process.stdout.write('run-chain-pool: aborted — a --first step is red\n');
      process.exit(1);
    }
  }

  const units = planUnits(pooled, process.env);
  const concurrency = resolveConcurrency(process.env, os.cpus().length, units.length);
  process.stdout.write('run-chain-pool: ' + pooled.length + ' steps -> ' + units.length
    + ' units, pool=' + concurrency + ', cores=' + os.cpus().length + '\n');

  const results = await runPool(units, cwd, concurrency, timeoutMs, process.env, (r) => {
    process.stdout.write((r.exitCode === 0 ? 'PASS  ' : 'FAIL  ') + fmt(r.durationMs).padStart(8)
      + '  ' + r.unit.command + (r.timedOut ? '  [TIMED OUT]' : '') + '\n');
    // Surface a red unit's tail AS IT FAILS. Buffering it to the end would leave an operator
    // staring at a silent pool for the rest of the run with no idea what broke.
    if (r.exitCode !== 0) {
      process.stdout.write('--- FAILED: ' + r.unit.command + ' (last 30 lines) ---\n'
        + r.output.split('\n').filter(Boolean).slice(-30).join('\n') + '\n---\n');
    }
  });

  for (const r of results) if (r.exitCode !== 0) failures.push(r);

  // Fail-closed coverage audit for every expanded suite.
  const coverageFailures = auditExpansions(units, results);

  // Print what the audit saw, green or red. A coverage claim nobody can read is not evidence.
  for (const [suite, width] of new Map(units.filter(u => u.suite).map(u => [u.suite, u.shards]))) {
    const reports = [];
    for (const r of results.filter(x => x.unit.suite === suite)) reports.push(...shardLib.parseCoverage(r.output));
    const ran = reports.reduce((s, r) => s + (r.ran || 0), 0);
    const asserts = reports.reduce((s, r) => s + (r.passed || 0), 0);
    const registered = reports.length ? reports[0].scenarios : '?';
    process.stdout.write('coverage  ' + suite + ': ' + reports.length + '/' + width + ' shards, '
      + ran + '/' + registered + ' scenarios, ' + asserts + ' assertions\n');
  }

  const byDuration = results.slice().sort((a, b) => b.durationMs - a.durationMs);
  process.stdout.write('\nslowest units:\n');
  for (const r of byDuration.slice(0, 8)) {
    process.stdout.write('  ' + fmt(r.durationMs).padStart(8) + '  ' + r.unit.command + '\n');
  }
  const serialMs = results.reduce((s, r) => s + r.durationMs, 0);
  const wallMs = Date.now() - t0;
  process.stdout.write('\n' + (results.length - failures.length) + ' passed, ' + failures.length + ' failed'
    + '  (wall ' + fmt(wallMs) + ', serial-equivalent ' + fmt(serialMs) + ')\n');

  for (const r of failures) {
    process.stdout.write('\n--- FAILED: ' + r.unit.command + ' (last 60 lines) ---\n');
    process.stdout.write(r.output.split('\n').filter(Boolean).slice(-60).join('\n') + '\n');
  }
  for (const f of coverageFailures) {
    process.stdout.write('\nrun-chain-pool: ' + f.error + ' — ' + f.detail + '\n');
  }

  if (failures.length || coverageFailures.length) {
    process.stdout.write('\nrun-chain-pool: chain FAILED\n');
    process.exit(1);
  }
  process.stdout.write('run-chain-pool: chain passed\n');
}

module.exports = {
  SHARDED_SUITES,
  COST_HINT,
  DEFAULT_COST,
  resolveConcurrency,
  resolveShardWidth,
  resolveTimeoutMs,
  planUnits,
  parseArgs,
  auditExpansions,
};

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write('run-chain-pool: ' + String((err && err.stack) || err) + '\n');
    process.exit(1);
  });
}
