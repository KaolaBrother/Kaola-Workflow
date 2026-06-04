#!/usr/bin/env node
'use strict';

// Unit tests for kaola-workflow-commit-node.js
// Hand-rolled assert + counter; repo style (no framework).
// Most cases test the pure combineResults core — zero git/fs.

const { combineResults, shellValidator } = require('./kaola-workflow-commit-node');

const fs = require('fs');
const os = require('os');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error('FAIL: ' + message);
  }
}

// ---------------------------------------------------------------------------
// Test 1: per-node-start — recordBase ok → overallOk===true, mode correct,
//         barrierCheck and gateVerify are null.
// ---------------------------------------------------------------------------
{
  const input = {
    recordBase: { exitCode: 0, result: 'ok', nodeId: 'a', base: 'sha123abc' },
    barrierCheck: null,
    gateVerify: null,
  };
  const r = combineResults(input, { mode: 'per-node-start' });
  assert(r.overallOk === true, 'test1: overallOk===true when recordBase ok');
  assert(r.mode === 'per-node-start', 'test1: mode===per-node-start');
  assert(r.barrierCheck === null, 'test1: barrierCheck===null');
  assert(r.gateVerify === null, 'test1: gateVerify===null');
  assert(r.result === 'ok', 'test1: result===ok');
}

// ---------------------------------------------------------------------------
// Test 2: per-node-end — barrier PASS + gate-verify FAIL → overallOk===true
//         (gate-verify is INFORMATIONAL only in per-node mode — deadlock prevention).
//         AND gateVerify.informational===true.
// ---------------------------------------------------------------------------
{
  const input = {
    recordBase: null,
    barrierCheck: { exitCode: 0, result: 'pass', errors: [], sensitiveHits: [], outOfAllow: [] },
    gateVerify: { exitCode: 1, ok: false, unsatisfied: [{ requirement: 'G1 gate execution', reason: 'node impl-commit reached complete but no completed code-reviewer post-dominates it' }] },
  };
  const r = combineResults(input, { mode: 'per-node', nodeId: 'impl-commit' });
  assert(r.overallOk === true, 'test2: overallOk===true when barrier passes (gate excluded in per-node)');
  assert(r.gateVerify !== null, 'test2: gateVerify is not null');
  assert(r.gateVerify.informational === true, 'test2: gateVerify.informational===true [deadlock-prevention — load-bearing]');
  assert(r.mode === 'per-node', 'test2: mode===per-node');
  assert(r.result === 'ok', 'test2: result===ok');
}

// ---------------------------------------------------------------------------
// Test 3: per-node-end — barrier REFUSE (overflow) → overallOk===false,
//         errors and outOfAllow surfaced verbatim.
// ---------------------------------------------------------------------------
{
  const input = {
    recordBase: null,
    barrierCheck: {
      exitCode: 1,
      result: 'refuse',
      errors: ['actual writes outside the declared allowlist (src/x.js) — overflow beyond the frozen write set'],
      sensitiveHits: [],
      outOfAllow: ['src/x.js'],
    },
    gateVerify: null,
  };
  const r = combineResults(input, { mode: 'per-node', nodeId: 'some-node' });
  assert(r.overallOk === false, 'test3: overallOk===false when barrier refuses');
  assert(r.result === 'refuse', 'test3: result===refuse');
  assert(r.barrierCheck !== null, 'test3: barrierCheck non-null');
  assert(Array.isArray(r.barrierCheck.errors) && r.barrierCheck.errors.length > 0, 'test3: errors surfaced');
  assert(r.barrierCheck.errors[0].includes('overflow'), 'test3: error message preserved verbatim (contains overflow)');
  assert(Array.isArray(r.barrierCheck.outOfAllow) && r.barrierCheck.outOfAllow[0] === 'src/x.js', 'test3: outOfAllow surfaced verbatim');
}

// ---------------------------------------------------------------------------
// Test 4a: whole-plan — barrier pass + gate FAIL → overallOk===false
//          (gate-verify IS blocking in whole-plan mode)
// ---------------------------------------------------------------------------
{
  const input = {
    recordBase: null,
    barrierCheck: { exitCode: 0, result: 'pass', errors: [], sensitiveHits: [], outOfAllow: [] },
    gateVerify: { exitCode: 1, ok: false, unsatisfied: [{ requirement: 'G1 gate execution', reason: 'node impl reached complete but reviewer did not' }] },
  };
  const r = combineResults(input, { mode: 'whole-plan' });
  assert(r.overallOk === false, 'test4a: overallOk===false when whole-plan gate fails');
  assert(r.mode === 'whole-plan', 'test4a: mode===whole-plan');
  assert(r.gateVerify && r.gateVerify.informational === undefined, 'test4a: gateVerify does NOT carry informational in whole-plan mode');
}

// ---------------------------------------------------------------------------
// Test 4b: whole-plan — barrier pass + gate ok → overallOk===true
// ---------------------------------------------------------------------------
{
  const input = {
    recordBase: null,
    barrierCheck: { exitCode: 0, result: 'pass', errors: [], sensitiveHits: [], outOfAllow: [] },
    gateVerify: { exitCode: 0, ok: true, unsatisfied: [] },
  };
  const r = combineResults(input, { mode: 'whole-plan' });
  assert(r.overallOk === true, 'test4b: overallOk===true when both barrier and gate pass in whole-plan');
  assert(r.result === 'ok', 'test4b: result===ok');
}

// ---------------------------------------------------------------------------
// Test 5: shellValidator seam tests (with a stub validator written to tmpdir)
// ---------------------------------------------------------------------------
{
  const tmpDir = os.tmpdir();
  const stubPath = path.join(tmpDir, 'stub-validator-' + process.pid + '.js');

  // 5a: stub exits 1 and prints canned JSON to stdout
  // The helper must capture {exitCode:1, ...parsed} — NOT lose it to the throw.
  const cannedJson = JSON.stringify({ result: 'refuse', errors: ['stub error'], outOfAllow: ['src/bad.js'] });
  const stubCode = [
    "'use strict';",
    "process.stdout.write(" + JSON.stringify(cannedJson) + " + '\\n');",
    "process.exitCode = 1;",  // natural exit — no flush race on macOS
  ].join('\n');

  try {
    fs.writeFileSync(stubPath, stubCode);

    const r1 = shellValidator(stubPath, '/fake/plan.md', ['--barrier-check', '--json']);
    assert(r1.exitCode === 1, 'test5a: exitCode===1 captured (not lost to throw)');
    assert(r1.result === 'refuse', 'test5a: result parsed from stub stdout');
    assert(Array.isArray(r1.errors) && r1.errors[0] === 'stub error', 'test5a: errors parsed verbatim');

    // 5b: stub prints NON-JSON garbage → safeJsonParse returns {} → fail-closed
    const garbagePath = path.join(tmpDir, 'stub-garbage-' + process.pid + '.js');
    try {
      fs.writeFileSync(garbagePath, [
        "'use strict';",
        "process.stdout.write('THIS IS NOT JSON\\n');",
        "process.exitCode = 1;",
      ].join('\n'));

      const r2 = shellValidator(garbagePath, '/fake/plan.md', ['--barrier-check', '--json']);
      assert(r2.exitCode === 1, 'test5b: exitCode===1 still captured');
      // result should be undefined (empty parsed {}) → overallOk would be false → fail-closed
      assert(r2.result === undefined, 'test5b: result===undefined (fail-closed parse)');

      // Verify this would drive overallOk false via combineResults:
      const full = combineResults({ recordBase: null, barrierCheck: r2, gateVerify: null }, { mode: 'per-node', nodeId: 'x' });
      assert(full.overallOk === false, 'test5b: unparseable output → overallOk===false (fail-closed)');
    } finally {
      try { fs.rmSync(garbagePath); } catch (_) {}
    }
  } finally {
    try { fs.rmSync(stubPath); } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
if (failed > 0) {
  console.error('commit-node tests FAILED (' + failed + ' failures, ' + passed + ' passed)');
  process.exitCode = 1;
} else {
  console.log('commit-node tests passed (' + passed + ' assertions)');
}
