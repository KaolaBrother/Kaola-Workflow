#!/usr/bin/env node
'use strict';

/**
 * test-parallel.js — parallel test-chain runner (issue #358)
 *
 * Usage:
 *   node scripts/test-parallel.js             # run all four npm chains in parallel
 *   node scripts/test-parallel.js --self-test  # fast unit test with fake chains
 *
 * Exports: runParallel, runChain, DEFAULT_CHAINS, TAIL_LINES, tail
 */

const { spawn } = require('child_process');
const os = require('os');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TAIL_LINES = 50;

/** Platform-safe npm command. */
function npmCmd() {
  return os.platform() === 'win32' ? 'npm.cmd' : 'npm';
}

/**
 * The four sequential-gate chains, now run in parallel.
 * Order is deterministic: claude, codex, gitlab, gitea.
 */
const DEFAULT_CHAINS = [
  { name: 'claude', args: ['run', 'test:kaola-workflow:claude'] },
  { name: 'codex',  args: ['run', 'test:kaola-workflow:codex']  },
  { name: 'gitlab', args: ['run', 'test:kaola-workflow:gitlab'] },
  { name: 'gitea',  args: ['run', 'test:kaola-workflow:gitea']  },
];

// ---------------------------------------------------------------------------
// tail helper
// ---------------------------------------------------------------------------

/**
 * Return the last `n` non-empty lines of `text`, joined with '\n'.
 * If text is empty/blank returns ''.
 */
function tail(text, n) {
  if (!text) return '';
  const lines = text.split('\n');
  // Keep all lines (including blank ones in middle) but trim trailing blanks
  let end = lines.length;
  while (end > 0 && lines[end - 1].trim() === '') end--;
  const slice = lines.slice(0, end);
  return slice.slice(-n).join('\n');
}

// ---------------------------------------------------------------------------
// runChain
// ---------------------------------------------------------------------------

/**
 * Run a single chain.  Never rejects; resolves { name, code, stdout, stderr }.
 *
 * @param {object} chain  - { name: string, args: string[] }
 * @param {function} [spawnFn] - injectable spawn (defaults to child_process.spawn)
 * @returns {Promise<{name:string, code:number, stdout:string, stderr:string}>}
 */
function runChain(chain, spawnFn) {
  const spawnImpl = spawnFn || spawn;
  return new Promise((resolve) => {
    const stdoutBufs = [];
    const stderrBufs = [];

    const child = spawnImpl(npmCmd(), chain.args, {
      shell: false,
      env: Object.assign({}, process.env, { TEST_PARALLEL: '1' }),
    });

    child.stdout.on('data', (chunk) => stdoutBufs.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    child.stderr.on('data', (chunk) => stderrBufs.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));

    child.on('error', () => {
      resolve({
        name: chain.name,
        code: 1,
        stdout: Buffer.concat(stdoutBufs).toString(),
        stderr: Buffer.concat(stderrBufs).toString(),
      });
    });

    child.on('close', (code) => {
      resolve({
        name: chain.name,
        code: code == null ? 1 : code,
        stdout: Buffer.concat(stdoutBufs).toString(),
        stderr: Buffer.concat(stderrBufs).toString(),
      });
    });
  });
}

// ---------------------------------------------------------------------------
// runParallel
// ---------------------------------------------------------------------------

/**
 * Run all chains concurrently via Promise.allSettled.
 * Results are reported in input order regardless of completion order.
 *
 * @param {object} opts
 * @param {Array<{name:string, args:string[]}>} [opts.chains]  - defaults to DEFAULT_CHAINS
 * @param {function} [opts.spawnFn]  - injectable spawn for testing
 * @param {function} [opts.log]      - injectable logger (defaults to console.log)
 * @returns {Promise<Array<{name:string, code:number, stdout:string, stderr:string}>>}
 */
async function runParallel({ chains, spawnFn, log } = {}) {
  const chainList = chains || DEFAULT_CHAINS;
  const logFn = log || console.log;

  const t0 = Date.now();

  // Spawn all at t=0
  const promises = chainList.map((chain) => {
    const chainStart = Date.now();
    return runChain(chain, spawnFn).then((result) => {
      result._elapsed = ((Date.now() - chainStart) / 1000).toFixed(1);
      return result;
    });
  });

  // Wait for ALL to finish (allSettled never short-circuits)
  const settled = await Promise.allSettled(promises);

  // Extract results (runChain never rejects, so all are fulfilled)
  const results = settled.map((s) => s.value || s.reason);

  // Print per-chain summary in INPUT order
  let passed = 0;
  let failed = 0;
  for (const r of results) {
    const status = r.code === 0 ? 'PASS' : 'FAIL';
    if (r.code === 0) passed++; else failed++;
    logFn(`${status}  ${r.name}  (${r._elapsed}s)`);
  }

  // Roll-up line
  const totalElapsed = ((Date.now() - t0) / 1000).toFixed(1);
  logFn(`${passed} passed, ${failed} failed  (${totalElapsed}s total)`);

  // Print failing-chain tails
  for (const r of results) {
    if (r.code !== 0) {
      const combined = (r.stdout + '\n' + r.stderr).trim();
      logFn(`--- ${r.name} (last ${TAIL_LINES} lines) ---`);
      logFn(tail(combined, TAIL_LINES));
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const results = await runParallel();
  const anyFailed = results.some((r) => r.code !== 0);
  process.exitCode = anyFailed ? 1 : 0;
}

// ---------------------------------------------------------------------------
// --self-test
// ---------------------------------------------------------------------------

async function selfTest() {
  let passed = 0;
  let failed = 0;
  const assertions = [];

  function assert(label, cond) {
    if (cond) {
      console.log(`PASS  ${label}`);
      passed++;
      assertions.push({ label, ok: true });
    } else {
      console.error(`FAIL  ${label}`);
      failed++;
      assertions.push({ label, ok: false });
    }
  }

  // Build fake spawn that wraps `node -e <script>` shims.
  // Each shim runs in milliseconds.
  function makeShimSpawnFn(shimMap) {
    // shimMap: { chainName: { script: string, exitCode: number } }
    return function shimSpawn(cmd, args, opts) {
      // args is ['run', 'test:kaola-workflow:<name>'] for real chains,
      // but for fake chains passed directly we use the chain.args format.
      // The fake chains below pass args directly as ['-e', script].
      return spawn(process.execPath, args, {
        shell: false,
        env: opts.env || process.env,
      });
    };
  }

  // ------------------------------------------------------------------
  // Build four fake chains:
  //   c1 — exits 0, prints "c1-output"
  //   c2 — exits 1 (early failure), prints "c2-output"
  //   c3 — exits 0, prints "c3-output"
  //   c4 — exits 0, prints "c4-output" + echoes TEST_PARALLEL env
  // ------------------------------------------------------------------
  const fakeChains = [
    {
      name: 'c1',
      args: ['-e', "process.stdout.write('c1-output'); process.exit(0);"],
    },
    {
      name: 'c2',
      args: ['-e', "process.stdout.write('c2-output'); process.exit(1);"],
    },
    {
      name: 'c3',
      args: ['-e', "process.stdout.write('c3-output'); process.exit(0);"],
    },
    {
      name: 'c4',
      args: [
        '-e',
        "process.stdout.write(process.env.TEST_PARALLEL || 'unset'); process.exit(0);",
      ],
    },
  ];

  // shimSpawn: use node directly (ignore npmCmd), pass args straight through
  function nodeShimSpawn(cmd, args, opts) {
    return spawn(process.execPath, args, {
      shell: false,
      env: opts.env || process.env,
    });
  }

  // Capture log lines
  const logLines1 = [];
  const results1 = await runParallel({
    chains: fakeChains,
    spawnFn: nodeShimSpawn,
    log: (line) => logLines1.push(line),
  });

  // (a) All four fake chains run to completion even though c2 exits 1 early
  assert(
    '(a1) all four chain names present in results',
    results1.length === 4 &&
      results1.map((r) => r.name).join(',') === 'c1,c2,c3,c4'
  );
  assert(
    '(a2) c1 (passing) stdout fully buffered despite c2 early exit',
    results1.find((r) => r.name === 'c1').stdout === 'c1-output'
  );
  assert(
    '(a3) c3 (passing after c2) stdout fully buffered',
    results1.find((r) => r.name === 'c3').stdout === 'c3-output'
  );

  // (b) Per-chain PASS/FAIL summary lines
  const summaryLines = logLines1.filter((l) => /^(PASS|FAIL)\s+c/.test(l));
  assert(
    '(b1) summary line for c1 is PASS',
    summaryLines.some((l) => l.startsWith('PASS') && l.includes('c1'))
  );
  assert(
    '(b2) summary line for c2 is FAIL',
    summaryLines.some((l) => l.startsWith('FAIL') && l.includes('c2'))
  );
  assert(
    '(b3) summary line for c3 is PASS',
    summaryLines.some((l) => l.startsWith('PASS') && l.includes('c3'))
  );
  assert(
    '(b4) summary line for c4 is PASS',
    summaryLines.some((l) => l.startsWith('PASS') && l.includes('c4'))
  );

  // (c) exitCode===1 when any chain failed
  {
    const anyFailed1 = results1.some((r) => r.code !== 0);
    assert('(c1) exitCode would be 1 when any chain failed', anyFailed1 === true);
  }

  // Run a second pass where all chains pass
  const allPassChains = [
    { name: 'p1', args: ['-e', "process.stdout.write('p1'); process.exit(0);"] },
    { name: 'p2', args: ['-e', "process.stdout.write('p2'); process.exit(0);"] },
  ];
  const logLines2 = [];
  const results2 = await runParallel({
    chains: allPassChains,
    spawnFn: nodeShimSpawn,
    log: (line) => logLines2.push(line),
  });
  {
    const anyFailed2 = results2.some((r) => r.code !== 0);
    assert('(c2) exitCode would be 0 when all chains pass', anyFailed2 === false);
  }

  // (d) Per-chain buffer isolation: each chain's buffer contains only its own output
  {
    const c1 = results1.find((r) => r.name === 'c1');
    const c2 = results1.find((r) => r.name === 'c2');
    const c3 = results1.find((r) => r.name === 'c3');
    // c1 should contain exactly 'c1-output' — not blended with c2/c3 output
    assert(
      '(d1) c1 stdout equals exactly its own output (buffer isolation)',
      c1.stdout === 'c1-output'
    );
    // c2 should contain exactly 'c2-output' — not blended with c1/c3 output
    assert(
      '(d2) c2 stdout equals exactly its own output (buffer isolation)',
      c2.stdout === 'c2-output'
    );
    // c3 stdout should not contain c1 or c2 output
    assert(
      '(d3) c3 stdout equals exactly its own output (buffer isolation)',
      c3.stdout === 'c3-output'
    );
  }

  // (e) TEST_PARALLEL='1' reaches child env
  {
    const c4 = results1.find((r) => r.name === 'c4');
    assert(
      "(e) TEST_PARALLEL='1' visible in child env (c4 stdout === '1')",
      c4.stdout.trim() === '1'
    );
  }

  // ------------------------------------------------------------------
  // (f) Within-chain step pool + scenario sharding.
  //
  // These are the load-bearing properties of the faster chain: the shard
  // partition must cover every scenario exactly once, and the coverage audit
  // must turn a partition that drops or duplicates one RED. They are asserted
  // here, in the chain, so a regression cannot ship as "the suite got faster".
  // ------------------------------------------------------------------
  const shardLib = require('./test-shard-lib');
  const pool = require('./run-chain-pool');

  // (f1) EXACT PARTITION: for every width, every ordinal is owned by exactly one shard.
  {
    let exact = true;
    let detail = '';
    for (let total = 1; total <= 12 && exact; total++) {
      for (let ordinal = 0; ordinal < 400; ordinal++) {
        let owners = 0;
        for (let index = 1; index <= total; index++) {
          if (shardLib.owns(ordinal, index, total)) owners++;
        }
        if (owners !== 1) { exact = false; detail = `total=${total} ordinal=${ordinal} owners=${owners}`; break; }
      }
    }
    assert('(f1) every ordinal is owned by exactly one shard for widths 1..12 ' + detail, exact);
  }

  // (f2) An unsharded run owns everything (a bare `node scripts/<suite>.js` is unchanged).
  {
    const sel = shardLib.selector(['node', 'suite.js']);
    assert('(f2) no --shard => sharded:false and owns() is total',
      sel.sharded === false && sel.total === 1 && sel.owns(0) && sel.owns(7) && sel.owns(123));
  }

  // (f3) A malformed --shard REFUSES; it never degrades into "ran everything".
  {
    const bad = ['1/0', '0/4', '5/4', 'x/4', '', '1-4'];
    let allThrew = true;
    for (const raw of bad) {
      try { shardLib.parseShard(['--shard', raw]); allThrew = false; } catch (_) { /* expected */ }
    }
    assert('(f3) malformed --shard values all refuse', allThrew);
    assert('(f3) well-formed --shard parses', JSON.stringify(shardLib.parseShard(['--shard', '3/8'])) === '{"index":3,"total":8}');
  }

  // (f4) Coverage audit: a complete shard set passes; a dropped, duplicated, drifted or
  // missing slice fails CLOSED with a typed reason.
  {
    const full = [
      { suite: 's', index: 1, total: 3, scenarios: 10, ran: 4 },
      { suite: 's', index: 2, total: 3, scenarios: 10, ran: 3 },
      { suite: 's', index: 3, total: 3, scenarios: 10, ran: 3 },
    ];
    assert('(f4a) complete shard set audits ok', shardLib.auditShardCoverage('s', 3, full).ok === true);
    const dropped = full.map((r, i) => (i === 1 ? Object.assign({}, r, { ran: 2 }) : r));
    assert('(f4b) a dropped scenario => shard_coverage_mismatch',
      shardLib.auditShardCoverage('s', 3, dropped).error === 'shard_coverage_mismatch');
    const drifted = full.map((r, i) => (i === 2 ? Object.assign({}, r, { scenarios: 11 }) : r));
    assert('(f4c) shards disagreeing on the registry => shard_registry_drift',
      shardLib.auditShardCoverage('s', 3, drifted).error === 'shard_registry_drift');
    assert('(f4d) a silent shard => shard_report_missing',
      shardLib.auditShardCoverage('s', 3, full.slice(0, 2)).error === 'shard_report_missing');
    const duped = [full[0], full[0], full[2]];
    assert('(f4e) a duplicated shard index => shard_report_duplicate',
      shardLib.auditShardCoverage('s', 3, duped).error === 'shard_report_duplicate');
  }

  // (f5) parseCoverage reads the marker line back out of a captured run.
  {
    const blob = 'noise\n' + shardLib.coverageLine({ suite: 'z', index: 1, total: 2, scenarios: 5, ran: 3 }) + '\nmore noise\n';
    const got = shardLib.parseCoverage(blob);
    assert('(f5) parseCoverage recovers exactly one payload', got.length === 1 && got[0].suite === 'z' && got[0].ran === 3);
  }

  // (f6) planUnits: a registered suite expands into N tagged shard units; anything else
  // stays one unit; the queue is ordered longest-hint-first.
  {
    const suite = Object.keys(pool.SHARDED_SUITES)[0];
    const units = pool.planUnits([suite, 'node scripts/test-next-action.js'], {});
    const shardUnits = units.filter(u => u.suite === suite);
    const width = pool.SHARDED_SUITES[suite];
    assert('(f6a) a registered suite expands to its declared width', shardUnits.length === width);
    assert('(f6b) every expanded unit carries a distinct --shard i/N',
      new Set(shardUnits.map(u => u.command)).size === width
      && shardUnits.every(u => u.command.startsWith(suite + ' --shard ')));
    assert('(f6c) an unregistered step stays a single whole-suite unit',
      units.filter(u => u.command === 'node scripts/test-next-action.js').length === 1);
    assert('(f6d) the queue is ordered longest-hint-first',
      units.every((u, i) => i === 0 || units[i - 1].cost >= u.cost));
  }

  // (f7) KAOLA_TEST_POOL_SHARDS=off disables expansion — the escape hatch runs the whole suite.
  {
    const suite = Object.keys(pool.SHARDED_SUITES)[0];
    const units = pool.planUnits([suite], { KAOLA_TEST_POOL_SHARDS: 'off' });
    assert('(f7) SHARDS=off runs the suite whole', units.length === 1 && units[0].command === suite);
  }

  // (f8) Pool sizing: serial on request, forced on a number, bounded on auto, and a typo
  // falls back to auto rather than crashing the gate.
  {
    assert('(f8a) serial forces a pool of 1', pool.resolveConcurrency({ KAOLA_TEST_POOL_CONCURRENCY: 'serial' }, 16, 40) === 1);
    assert('(f8b) "1" forces a pool of 1', pool.resolveConcurrency({ KAOLA_TEST_POOL_CONCURRENCY: '1' }, 16, 40) === 1);
    assert('(f8c) a number forces that pool size', pool.resolveConcurrency({ KAOLA_TEST_POOL_CONCURRENCY: '3' }, 16, 40) === 3);
    assert('(f8d) a forced size never exceeds the unit count', pool.resolveConcurrency({ KAOLA_TEST_POOL_CONCURRENCY: '99' }, 16, 4) === 4);
    assert('(f8e) auto stays at the measured non-inflating ceiling', pool.resolveConcurrency({}, 64, 40) === 4
      && pool.resolveConcurrency({}, 8, 40) === 4);
    assert('(f8f) a tiny host stays serial', pool.resolveConcurrency({}, 2, 40) === 1);
    assert('(f8g) a typo falls back to auto', pool.resolveConcurrency({ KAOLA_TEST_POOL_CONCURRENCY: 'yes-please' }, 16, 40) > 1);
  }

  // (f9) parseArgs splits the serial --first prefix from the pooled remainder.
  {
    const { first, pooled } = pool.parseArgs(['--first', 'a', '--first', 'b', 'c', 'd']);
    assert('(f9) --first steps are separated, in order, from the pooled steps',
      first.join(',') === 'a,b' && pooled.join(',') === 'c,d');
  }

  // Roll-up
  console.log('');
  console.log(`self-test: ${passed} assertions passed, ${failed} failed`);
  if (failed > 0) {
    process.exitCode = 1;
    process.exit(1);
  } else {
    console.log('test-parallel self-test passed');
    process.exitCode = 0;
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { runParallel, runChain, DEFAULT_CHAINS, TAIL_LINES, tail };

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

if (require.main === module) {
  if (process.argv.includes('--self-test')) {
    selfTest().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  } else {
    main().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  }
}
