#!/usr/bin/env node
'use strict';

// Unit tests for kaola-workflow-commit-node.js
// Hand-rolled assert + counter; repo style (no framework).
// Most cases test the pure combineResults core — zero git/fs.

const { combineResults, shellValidator } = require('./kaola-workflow-commit-node');
const planValidator = require('./kaola-workflow-plan-validator');

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
// Test 4c: whole-plan — barrier pass + gate ok + verdictCheck present-and-FAILING
//          → overallOk===false / result===refuse. verdict-check IS blocking in
//          whole-plan mode (commit-node folds it into overallOk), but the
//          aggregator layer had NO test referencing verdictCheck (#259 F3:
//          coverage lock for existing behavior, not a defect).
// ---------------------------------------------------------------------------
{
  const input = {
    recordBase: null,
    barrierCheck: { exitCode: 0, result: 'pass', errors: [], sensitiveHits: [], outOfAllow: [] },
    gateVerify: { exitCode: 0, ok: true, unsatisfied: [] },
    verdictCheck: { exitCode: 1, ok: false, failures: [{ nodeId: 'review', role: 'code-reviewer', reason: 'verdict fail' }] },
  };
  const r = combineResults(input, { mode: 'whole-plan' });
  assert(r.overallOk === false, 'test4c: overallOk===false when whole-plan verdict-check fails');
  assert(r.result === 'refuse', 'test4c: result===refuse on a failing whole-plan verdict-check');
  assert(r.verdictCheck && r.verdictCheck.informational === undefined, 'test4c: verdictCheck does NOT carry informational in whole-plan mode');
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
// Test 6: barrierCheck foreign-archive carveout (pure-fn, no git repo needed)
// AC3: --barrier-check must REFUSE a foreign project's archive band while
// still exempting the finalized project's own archive band.
// ---------------------------------------------------------------------------
{
  // Minimal frozen plan with one tdd-guide node + finalize sink (parseable ## Nodes).
  const minimalPlan = [
    '# Workflow Plan — issue #261', '', '## Meta', 'labels: refactor', '',
    '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '|---|---|---|---|---|---|',
    '| impl | tdd-guide | — | scripts/kaola-workflow-plan-validator.js | 1 | sequence |',
    '| done | finalize | impl | — | 1 | sequence |', '',
    '## Node Ledger', '', '| id | status |', '|---|---|',
    '| impl | complete |', '| done | complete |', '',
  ].join('\n');

  // 6a: foreign archive REFUSED — a write to another project's archive band must be refused.
  {
    const r = planValidator.barrierCheck(minimalPlan, ['kaola-workflow/archive/issue-999/x.md'], { project: 'issue-261' });
    assert(r.result === 'refuse', 'test6a: foreign archive write must be refused (RED→GREEN AC3)');
    assert(r.errors && r.errors.join(' ').toLowerCase().includes('foreign'), 'test6a: error message must mention FOREIGN');
  }

  // 6b: own archive PASSES — a write to the finalized project's own archive band must pass.
  {
    const r = planValidator.barrierCheck(minimalPlan, ['kaola-workflow/archive/issue-261/x.md'], { project: 'issue-261' });
    assert(r.result === 'pass', 'test6b: own archive write must pass');
  }

  // 6c: suffix-tolerant — .archived-<timestamp> suffix on the own archive dir must still pass.
  {
    const r = planValidator.barrierCheck(minimalPlan, ['kaola-workflow/archive/issue-261.archived-2026-01-01T00-00-00/x.md'], { project: 'issue-261' });
    assert(r.result === 'pass', 'test6c: own archive with .archived- suffix must pass');
  }

  // 6d: backward-compat — no project arg, non-archive workflow artifact must still pass.
  {
    const r = planValidator.barrierCheck(minimalPlan, ['kaola-workflow/p/workflow-plan.md'], {});
    assert(r.result === 'pass', 'test6d: backward-compat — non-archive workflow artifact with no project passes');
  }
}

// ---------------------------------------------------------------------------
// Test 7 (#366): per-node end-mode makes ONE fused --node-end validator spawn instead of FOUR
// (barrier + gate + verdict + selector) — ≥40% reduction. A logging stub counts validator
// invocations. The fallback (stub without --node-end support) re-runs the legacy four spawns.
// ---------------------------------------------------------------------------
{
  const { execFileSync } = require('child_process');
  const commitNode = path.join(__dirname, 'kaola-workflow-commit-node.js');

  function runWithStub(stubBody) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-spawn-'));
    const stub = path.join(dir, 'vstub.js');
    const log = path.join(dir, 'calls.log');
    fs.writeFileSync(stub, "const fs=require('fs');\nfs.appendFileSync(" + JSON.stringify(log) + ", process.argv.slice(2).join(' ') + '\\n');\n" + stubBody);
    try {
      execFileSync(process.execPath, [commitNode, path.join(dir, 'plan.md'), '--node-id', 'n1', '--json'], {
        encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_COMMIT_NODE_VALIDATOR: stub }),
      });
    } catch (_) { /* exit code irrelevant to the spawn count */ }
    const calls = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean) : [];
    fs.rmSync(dir, { recursive: true, force: true });
    return calls;
  }

  // (a) --node-end-aware stub → exactly ONE validator spawn.
  const fusedStub =
    "const a=process.argv.slice(2);\n" +
    "if(a.includes('--node-end')){process.stdout.write(JSON.stringify({result:'ok',mode:'node-end',nodeId:'n1',barrierCheck:{result:'pass',errors:[]},gateVerify:{ok:true,unsatisfied:[]},verdictCheck:{ok:true,failures:[]},selectorCheck:{ok:true,isSelector:false,armsToNa:[]}}));}\n" +
    "else{process.stdout.write('{}');}\n";
  const fusedCalls = runWithStub(fusedStub);
  assert(fusedCalls.length === 1, 'test7: per-node end shells the validator exactly ONCE (--node-end), got ' + fusedCalls.length + ': ' + JSON.stringify(fusedCalls));
  assert(fusedCalls[0].includes('--node-end'), 'test7: the single spawn is --node-end, got ' + fusedCalls[0]);

  // (b) legacy stub (no --node-end support: returns {} ) → fallback to FOUR spawns.
  const legacyStub =
    "const a=process.argv.slice(2);\n" +
    "if(a.includes('--barrier-check'))process.stdout.write(JSON.stringify({result:'pass',errors:[]}));\n" +
    "else if(a.includes('--selector-check'))process.stdout.write(JSON.stringify({ok:true,isSelector:false}));\n" +
    "else if(a.includes('--gate-verify')||a.includes('--verdict-check'))process.stdout.write(JSON.stringify({ok:true}));\n" +
    "else process.stdout.write('{}');\n"; // --node-end → {} (no mode) → fallback
  const legacyCalls = runWithStub(legacyStub);
  assert(legacyCalls.length === 5, 'test7: fallback path = 1 (--node-end probe) + 4 legacy spawns = 5, got ' + legacyCalls.length + ': ' + JSON.stringify(legacyCalls));
  assert(legacyCalls.filter(c => c.includes('--node-end')).length === 1, 'test7: fallback probes --node-end once');
  assert(legacyCalls.filter(c => c.includes('--barrier-check')).length === 1, 'test7: fallback runs the legacy barrier-check');
}

// ---------------------------------------------------------------------------
// Test 8 (#355): shellValidator last-line JSON framing + reserved-exitCode protection.
//   (a) a stray log line BEFORE the framed JSON no longer collapses to {} (false refusal).
//   (b) a payload field named exitCode cannot clobber the real process exit status.
// ---------------------------------------------------------------------------
{
  const tmpDir = os.tmpdir();
  // (a) log line then JSON on the LAST line.
  const framedPath = path.join(tmpDir, 'stub-framed-' + process.pid + '.js');
  try {
    fs.writeFileSync(framedPath, [
      "'use strict';",
      "process.stdout.write('WARNING: advisor hook chatter\\n');",
      "process.stdout.write(JSON.stringify({ result: 'pass', errors: [] }) + '\\n');",
    ].join('\n'));
    const r = shellValidator(framedPath, '/fake/plan.md', ['--barrier-check', '--json']);
    assert(r.result === 'pass', 'test8a (#355): a stray log line before the JSON still parses (last-line framing), got ' + JSON.stringify(r.result));
    assert(r.exitCode === 0, 'test8a: exitCode 0 on success');
  } finally { try { fs.rmSync(framedPath); } catch (_) {} }

  // (b) payload exitCode must NOT clobber the real status.
  const clobberPath = path.join(tmpDir, 'stub-clobber-' + process.pid + '.js');
  try {
    fs.writeFileSync(clobberPath, [
      "'use strict';",
      "process.stdout.write(JSON.stringify({ result: 'pass', exitCode: 99 }) + '\\n');",
    ].join('\n'));
    const r = shellValidator(clobberPath, '/fake/plan.md', ['--barrier-check', '--json']);
    assert(r.exitCode === 0, 'test8b (#355): a payload exitCode:99 cannot clobber the real exit status 0, got ' + r.exitCode);
    assert(r.result === 'pass', 'test8b: the rest of the payload is preserved');
  } finally { try { fs.rmSync(clobberPath); } catch (_) {} }
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
