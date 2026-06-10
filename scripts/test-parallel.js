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
