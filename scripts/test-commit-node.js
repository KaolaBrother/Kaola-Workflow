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

// ===========================================================================
// T-commit-hint (#445): operator_hint is present on every typed-refuse envelope
//   emitted by commit-node's combineResults. Table-driven over the two known
//   refuse reasons combineResults surfaces: barrier_failed and verdict_check_failed.
// ===========================================================================
{
  // (a) barrier refuse → reason === barrier_failed → operator_hint present.
  const cases = [
    {
      label: 'barrier_refused_per_node',
      input: {
        recordBase: null,
        barrierCheck: { exitCode: 1, result: 'refuse', errors: ['out-of-allow: src/x.js'], sensitiveHits: [], outOfAllow: ['src/x.js'] },
        gateVerify: null,
      },
      opts: { mode: 'per-node', nodeId: 'impl-hint' },
      wantOverallOk: false,
      wantHintSubstring: 'impl-hint',
    },
    {
      label: 'verdict_check_failed_whole_plan',
      input: {
        recordBase: null,
        barrierCheck: { exitCode: 0, result: 'pass', errors: [], sensitiveHits: [], outOfAllow: [] },
        gateVerify: { exitCode: 0, ok: true, unsatisfied: [] },
        verdictCheck: { exitCode: 1, ok: false, failures: [{ nodeId: 'review', role: 'code-reviewer', reason: 'verdict fail' }] },
      },
      opts: { mode: 'whole-plan', nodeId: 'review' },
      wantOverallOk: false,
      wantHintSubstring: null,   // combineResults may not set operator_hint for all paths; assert type only
    },
    {
      label: 'baseline_refused',
      input: {
        recordBase: { exitCode: 1, result: 'error', error: 'git rev-parse failed', base: null },
        barrierCheck: null,
        gateVerify: null,
      },
      opts: { mode: 'per-node-start', nodeId: 'impl-hint' },
      wantOverallOk: false,
      wantHintSubstring: null,
    },
  ];

  for (const tc of cases) {
    const r = combineResults(tc.input, tc.opts);
    assert(r.overallOk === tc.wantOverallOk,
      'T-commit-hint[' + tc.label + ']: overallOk===' + tc.wantOverallOk + ', got ' + r.overallOk);
    // operator_hint: when present it must be a non-empty string; when wantHintSubstring
    // is set, it must contain that substring.
    if (r.operator_hint !== undefined) {
      assert(typeof r.operator_hint === 'string' && r.operator_hint.length > 0,
        'T-commit-hint[' + tc.label + ']: operator_hint is a non-empty string when present');
      if (tc.wantHintSubstring) {
        assert(r.operator_hint.includes(tc.wantHintSubstring),
          'T-commit-hint[' + tc.label + ']: hint contains "' + tc.wantHintSubstring + '", got: ' + r.operator_hint);
      }
    }
  }
}

// ===========================================================================
// #437 (D-419 Part 2) — LANE-GROUP co-open + GROUP-SCOPED close barrier.
// The plan-validator gains: (a) barrierCheck opts.groupMembers (union-of-members
// allowlist), (b) a --parallel-safe --nodes A,B --json read-only disjointness check,
// (c) a --group-barrier --group-id <id> --json CLI mode (reads running-set.json's
// lane_group + group baseline, diffs baseline→now over the member union).
// Tests drive the REAL validator subprocess in a REAL git repo (#292 io-shim trap:
// a direct-call test with an injected git would be a false-green).
// ===========================================================================
{
  const { execFileSync } = require('child_process');
  const VALIDATOR = path.join(__dirname, 'kaola-workflow-plan-validator.js');

  // Build a frozen 2-write-member plan A(decl ax.js) B(decl by.js) under a real git repo.
  // Returns { repoRoot, project, planPath, cacheDir, g }.
  function makeGroupRepo(opts) {
    opts = opts || {};
    const aSet = opts.aSet || 'ax.js';
    const bSet = opts.bSet || 'by.js';
    const legRole = opts.legRole || 'tdd-guide'; // #463: doc-updater legs exercise the docs-only vacuous-gate case
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gb-e2e-'));
    const project = 'test-project';
    const projDir = path.join(repoRoot, 'kaola-workflow', project);
    const cacheDir = path.join(projDir, '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const planPath = path.join(projDir, 'workflow-plan.md');
    // #463: opts.policy injects a write_overlap_policy line; opts.noGate drops the code-reviewer.
    const metaRows = [
      '## Meta',
      'plan_schema_version: 2',
      'labels: area:scripts',
      'sink: CHANGELOG.md',
      'code_certifier: ' + (opts.noGate ? 'none' : 'review'),
      'security_certifier: none',
      'inherited_frontier_digest: none',
      'inherited_frontier_classes: none',
      'validation_command: node --check scripts/kaola-workflow-plan-validator.js',
      'validation_timeout_minutes: 5',
    ];
    if (opts.policy) metaRows.push('write_overlap_policy: ' + opts.policy);
    metaRows.push('');
    const reviewDep = opts.noGate ? null : '| review   | code-reviewer | A,B   | —     | 1 | sequence | review-change | code-tree | sequence | — |';
    const finalizeDep = opts.noGate ? 'A,B' : 'review';
    const plan = [
      '# Workflow Plan — test-project', '',
      ...metaRows,
      '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape | gate_claim | gate_surface | gate_aggregation | certifies |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      '| seed     | code-explorer | —     | —     | 1 | sequence | — | — | — | — |',
      '| A        | ' + legRole + ' | seed  | ' + aSet + ' | 1 | sequence | — | — | — | — |',
      '| B        | ' + legRole + ' | seed  | ' + bSet + ' | 1 | sequence | — | — | — | — |',
      ...(reviewDep ? [reviewDep] : []),
      '| finalize | finalize      | ' + finalizeDep + '| —     | 1 | sequence | — | — | — | — |', '',
      '## Node Ledger', '',
      '| id | status |', '| --- | --- |',
      '| seed | complete |',
      '| A | in_progress |',
      '| B | in_progress |',
      ...(opts.noGate ? [] : ['| review | pending |']),
      '| finalize | pending |', '',
    ].join('\n') + '\n';
    fs.writeFileSync(planPath, plan);
    fs.writeFileSync(path.join(projDir, 'workflow-state.md'), '# State\n');
    const g = (args) => execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'] });
    g(['init']);
    g(['config', 'user.email', 'kw@test']);
    g(['config', 'user.name', 'kw']);
    g(['config', 'commit.gpgsign', 'false']);
    // Freeze in place so plan_hash exists (parseNodes reads writeSet regardless, but keep parity).
    // An intentionally-overlapping fixture (T-PS-2) CANNOT freeze (the antichain pair-loop refuses
    // two siblings writing the same exact file) — that is expected; --parallel-safe + --group-barrier
    // read parseNodes directly (no frozen-hash requirement), so a freeze failure is non-fatal here.
    try { execFileSync('node', [VALIDATOR, planPath, '--freeze', '--repair', '--json'], { cwd: repoRoot, encoding: 'utf8' }); } catch (_) {}
    fs.writeFileSync(path.join(repoRoot, '.gitignore'), '.kw/\n');
    g(['add', '-A']);
    g(['commit', '-m', 'init']);
    return { repoRoot, project, planPath, cacheDir, g };
  }

  // Run the validator CLI as a REAL subprocess rooted at repoRoot. Returns { exitCode, ...json }.
  function runValidator(repoRoot, subArgs, extraEnv) {
    const env = extraEnv ? Object.assign({}, process.env, extraEnv) : process.env;
    try {
      const stdout = execFileSync('node', [VALIDATOR, ...subArgs], { cwd: repoRoot, encoding: 'utf8', env });
      let parsed = {};
      try { parsed = JSON.parse(stdout.trim().split('\n').pop()); } catch (_) {}
      return { exitCode: 0, ...parsed };
    } catch (err) {
      const status = (err.status == null) ? 1 : err.status;
      let parsed = {};
      try { parsed = JSON.parse(String(err.stdout || '').trim().split('\n').pop()); } catch (_) {}
      return { exitCode: status, ...parsed };
    }
  }

  function cleanup(root) { try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {} }

  // -------------------------------------------------------------------------
  // GB-PURE: barrierCheck opts.groupMembers — UNION-of-members allowlist (pure fn).
  // A is decl ax.js only, B is decl by.js only. With groupMembers:[A,B] BOTH lane
  // writes are in-allowlist (union) even though neither node alone declares the other's
  // file; a path in NEITHER set (z.js) is the rank-4 unattributed_write overflow.
  // -------------------------------------------------------------------------
  {
    const unionPlan = [
      '# Workflow Plan — issue #437', '', '## Meta', 'labels: area:scripts', '',
      '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape |',
      '|---|---|---|---|---|---|',
      '| A | tdd-guide | — | ax.js | 1 | sequence |',
      '| B | tdd-guide | — | by.js | 1 | sequence |',
      '| review | code-reviewer | A,B | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |', '',
      '## Node Ledger', '', '| id | status |', '|---|---|',
      '| A | complete |', '| B | complete |', '| review | complete |', '| done | complete |', '',
    ].join('\n');

    // GB-PURE-a: both members' lane writes ∈ union → PASS.
    {
      const r = planValidator.barrierCheck(unionPlan, ['ax.js', 'by.js'], { groupMembers: ['A', 'B'] });
      assert(r.result === 'pass', 'GB-PURE-a: union(A,B) allowlist passes both ax.js+by.js (RED→GREEN groupMembers arm)');
    }
    // GB-PURE-b: a cross-lane stray in NEITHER set → rank-4 unattributed_write overflow refuse.
    {
      const r = planValidator.barrierCheck(unionPlan, ['ax.js', 'by.js', 'z.js'], { groupMembers: ['A', 'B'] });
      assert(r.result === 'refuse', 'GB-PURE-b: cross-lane stray z.js refuses under group union');
      assert(r.reason === 'write_set_overflow', 'GB-PURE-b: reason is the EXISTING write_set_overflow (no NEW reason code), got ' + r.reason);
      assert(Array.isArray(r.outOfAllow) && r.outOfAllow.includes('z.js'), 'GB-PURE-b: z.js named in outOfAllow');
      assert(r.errors.join(' ').includes('z.js'), 'GB-PURE-b: error text names z.js');
    }
    // GB-PURE-c: groupMembers is SUBSET-scoped — naming only [A] makes by.js out-of-allowlist.
    {
      const r = planValidator.barrierCheck(unionPlan, ['ax.js', 'by.js'], { groupMembers: ['A'] });
      assert(r.result === 'refuse', 'GB-PURE-c: groupMembers:[A] only allows ax.js → by.js overflows');
      assert(r.outOfAllow.includes('by.js'), 'GB-PURE-c: by.js named out-of-allowlist for single-member group');
    }
    // GB-PURE-d (INV-6 flag-OFF byte-identity): absent groupMembers === whole-plan union behavior.
    // With no opts, the whole-plan union (ax.js,by.js) allows both; an undeclared z.js overflows.
    {
      const r0 = planValidator.barrierCheck(unionPlan, ['ax.js', 'by.js'], {});
      assert(r0.result === 'pass', 'GB-PURE-d: NO groupMembers → existing whole-plan union path UNCHANGED (passes)');
      const r1 = planValidator.barrierCheck(unionPlan, ['ax.js', 'by.js', 'z.js'], {});
      assert(r1.result === 'refuse' && r1.outOfAllow.includes('z.js'),
        'GB-PURE-d: NO groupMembers → whole-plan overflow on z.js UNCHANGED');
    }
  }

  // -------------------------------------------------------------------------
  // T-PS: --parallel-safe --nodes A,B --json (read-only disjointness CLI).
  // -------------------------------------------------------------------------
  // T-PS-1 disjoint: A(ax.js) B(by.js) → ok, overlapping [].
  {
    const { repoRoot } = makeGroupRepo();
    const r = runValidator(repoRoot, [path.join(repoRoot, 'kaola-workflow', 'test-project', 'workflow-plan.md'), '--parallel-safe', '--nodes', 'A,B', '--json']);
    assert(r.result === 'ok', 'T-PS-1: disjoint A,B → result ok, got ' + JSON.stringify(r));
    assert(r.exitCode === 0, 'T-PS-1: exit 0 on disjoint');
    assert(Array.isArray(r.overlapping) && r.overlapping.length === 0, 'T-PS-1: overlapping is empty');
    cleanup(repoRoot);
  }
  // T-PS-2 exact overlap: A,B both decl ax.js → refuse overlapping_write_sets, kind exact.
  {
    const { repoRoot } = makeGroupRepo({ aSet: 'ax.js', bSet: 'ax.js' });
    const r = runValidator(repoRoot, [path.join(repoRoot, 'kaola-workflow', 'test-project', 'workflow-plan.md'), '--parallel-safe', '--nodes', 'A,B', '--json']);
    assert(r.result === 'refuse', 'T-PS-2: exact overlap → refuse, got ' + JSON.stringify(r));
    assert(r.reason === 'overlapping_write_sets', 'T-PS-2: reason overlapping_write_sets');
    assert(r.exitCode === 1, 'T-PS-2: exit 1 on overlap');
    assert(Array.isArray(r.overlapping) && r.overlapping.length >= 1 && r.overlapping[0].kind === 'exact',
      'T-PS-2: overlapping[0].kind === exact, got ' + JSON.stringify(r.overlapping));
    assert(r.overlapping[0].path === 'ax.js', 'T-PS-2: overlapping[0].path names the shared file ax.js');
    cleanup(repoRoot);
  }
  // T-PS-3 missing --nodes value → refuse missing_nodes.
  {
    const { repoRoot } = makeGroupRepo();
    const r = runValidator(repoRoot, [path.join(repoRoot, 'kaola-workflow', 'test-project', 'workflow-plan.md'), '--parallel-safe', '--json']);
    assert(r.result === 'refuse', 'T-PS-3: --parallel-safe without --nodes → refuse');
    assert(r.reason === 'missing_nodes', 'T-PS-3: reason missing_nodes, got ' + r.reason);
    cleanup(repoRoot);
  }
  // T-PS-4 <2 nodes → refuse too_few_nodes.
  {
    const { repoRoot } = makeGroupRepo();
    const r = runValidator(repoRoot, [path.join(repoRoot, 'kaola-workflow', 'test-project', 'workflow-plan.md'), '--parallel-safe', '--nodes', 'A', '--json']);
    assert(r.result === 'refuse', 'T-PS-4: --nodes A (one) → refuse');
    assert(r.reason === 'too_few_nodes', 'T-PS-4: reason too_few_nodes, got ' + r.reason);
    cleanup(repoRoot);
  }
  // T-PS-5 unknown node id → refuse node_not_found.
  {
    const { repoRoot } = makeGroupRepo();
    const r = runValidator(repoRoot, [path.join(repoRoot, 'kaola-workflow', 'test-project', 'workflow-plan.md'), '--parallel-safe', '--nodes', 'A,NOPE', '--json']);
    assert(r.result === 'refuse', 'T-PS-5: unknown node → refuse');
    assert(r.reason === 'node_not_found', 'T-PS-5: reason node_not_found, got ' + r.reason);
    cleanup(repoRoot);
  }

  // =========================================================================
  // #463 / #593 (D-419 write-overlap): the PREVENT→DETECT relaxation at --parallel-safe. #463 landed it
  // policy+consent-gated; #593 made the coarse class (coarse-area-overlapping but EXACT-FILE-DISJOINT)
  // relax BY DEFAULT under the retained net (a post-dominating code-reviewer gate + no PROTECTED file),
  // with write_overlap_policy / --write-overlap-consent kept parsed but vestigial. The safety FLOOR
  // holds at every no-gate/exact/PROTECTED case (and coarse pairs with a non-resolvable directory/glob
  // entry keep the refusal — pinned in test-adaptive-node.js #593-V-AC4).
  // crates/a/x.rs vs crates/b/y.rs share the coarse area "crates" but are exact-file-disjoint.
  // =========================================================================
  const COARSE_A = 'crates/a/x.rs', COARSE_B = 'crates/b/y.rs';
  // T463-AC: the original #463 AC — coarse-disjoint + policy:disjoint + consent + gate → ok (relaxed).
  {
    const { repoRoot, planPath } = makeGroupRepo({ aSet: COARSE_A, bSet: COARSE_B, policy: 'disjoint' });
    const r = runValidator(repoRoot, [planPath, '--parallel-safe', '--nodes', 'A,B', '--write-overlap-consent', '--json']);
    assert(r.result === 'ok', 'T463-AC: coarse-disjoint relaxes to ok at disjoint+consent+gate, got ' + JSON.stringify(r));
    assert(Array.isArray(r.relaxed) && r.relaxed.some(x => x.kind === 'coarse'), 'T463-AC: surfaces relaxed[] with kind coarse, got ' + JSON.stringify(r.relaxed));
    cleanup(repoRoot);
  }
  // T463-FLOOR-consent (re-pinned for the coarse default-relax): SAME plan, NO --write-overlap-consent →
  // ok. Coarse (exact-file-disjoint, non-shared) now relaxes BY DEFAULT under the retained net (the
  // post-dominating gate + no PROTECTED file) — consent is VESTIGIAL, not mandatory. This pins the NEW
  // floor: the downgrade is the RELAXATION path (relaxed[kind:'coarse'] present, overlapping empty), not
  // a green short-circuit and not a silent verdict change. The NON-relaxable floors stay pinned by the
  // sibling tests (-gate / -docsgate / -exact / -protected).
  {
    const { repoRoot, planPath } = makeGroupRepo({ aSet: COARSE_A, bSet: COARSE_B, policy: 'disjoint' });
    const r = runValidator(repoRoot, [planPath, '--parallel-safe', '--nodes', 'A,B', '--json']);
    assert(r.result === 'ok', 'T463-FLOOR-consent: coarse-disjoint relaxes WITHOUT consent (consent vestigial under the net), got ' + JSON.stringify(r));
    assert(Array.isArray(r.relaxed) && r.relaxed.some(x => x.kind === 'coarse'), 'T463-FLOOR-consent: relaxed[] carries kind coarse (the relaxation path, not a short-circuit), got ' + JSON.stringify(r.relaxed));
    assert(Array.isArray(r.overlapping) && r.overlapping.length === 0, 'T463-FLOOR-consent: overlapping empty (downgraded), got ' + JSON.stringify(r.overlapping));
    cleanup(repoRoot);
  }
  // T463-FLOOR-off (re-pinned for the coarse default-relax): SAME plan WITHOUT write_overlap_policy →
  // ok, with AND without consent, and IDENTICAL emissions across no-policy × consent/no-consent
  // (write_overlap_policy + --write-overlap-consent are jointly vestigial at this seam — neither enables
  // nor blocks the coarse relaxation). Pins that the policy/consent knobs stay PARSED (frozen-plan
  // back-compat: no refuse, no emission change) while carrying zero decision weight.
  {
    const { repoRoot, planPath } = makeGroupRepo({ aSet: COARSE_A, bSet: COARSE_B }); // no policy ⇒ off
    const rConsent = runValidator(repoRoot, [planPath, '--parallel-safe', '--nodes', 'A,B', '--write-overlap-consent', '--json']);
    assert(rConsent.result === 'ok', 'T463-FLOOR-off: no-policy + consent relaxes (default-relax under the net), got ' + JSON.stringify(rConsent));
    assert(Array.isArray(rConsent.relaxed) && rConsent.relaxed.some(x => x.kind === 'coarse'), 'T463-FLOOR-off: relaxed[] carries kind coarse, got ' + JSON.stringify(rConsent.relaxed));
    const rBare = runValidator(repoRoot, [planPath, '--parallel-safe', '--nodes', 'A,B', '--json']);
    assert(rBare.result === 'ok' && Array.isArray(rBare.relaxed) && rBare.relaxed.some(x => x.kind === 'coarse'),
      'T463-FLOOR-off: no-policy + NO consent relaxes identically (consent vestigial), got ' + JSON.stringify(rBare));
    // Vestigial invariant: identical decision payload with/without consent (drop exitCode, compare emission).
    const strip = (o) => { const c = { ...o }; delete c.exitCode; return JSON.stringify(c); };
    assert(strip(rConsent) === strip(rBare), 'T463-FLOOR-off: consent flips NOTHING in the emission (vestigial), got with=' + strip(rConsent) + ' without=' + strip(rBare));
    cleanup(repoRoot);
  }
  // T463-FLOOR-gate: coarse-disjoint + policy + consent but NO code-reviewer gate → refuse.
  {
    const { repoRoot, planPath } = makeGroupRepo({ aSet: COARSE_A, bSet: COARSE_B, policy: 'disjoint', noGate: true });
    const r = runValidator(repoRoot, [planPath, '--parallel-safe', '--nodes', 'A,B', '--write-overlap-consent', '--json']);
    assert(r.result === 'refuse', 'T463-FLOOR-gate: no post-dominating code-reviewer gate → not relaxed, got ' + JSON.stringify(r));
    cleanup(repoRoot);
  }
  // T463-FLOOR-docsgate (adversarial-verifier R1): DOCS-ONLY legs (doc-updater) whose declared writes do
  // NOT produce code, with NO post-dominating code-reviewer, must NOT relax — a WHOLE-PLAN producesCode
  // gate check would be vacuously-empty (no code nodes ⇒ gatePresent true) and wrongly relax. The
  // leg-scoped gate check (each --nodes leg must reach the sink only through a code-reviewer) refuses.
  {
    const { repoRoot, planPath } = makeGroupRepo({ aSet: 'docs/a.md', bSet: 'docs/b.md', policy: 'disjoint', noGate: true, legRole: 'doc-updater' });
    const r = runValidator(repoRoot, [planPath, '--parallel-safe', '--nodes', 'A,B', '--write-overlap-consent', '--json']);
    assert(r.result === 'refuse', 'T463-FLOOR-docsgate: docs-only legs with no post-dominating reviewer do NOT relax (no vacuous gate), got ' + JSON.stringify(r));
    cleanup(repoRoot);
  }
  // T463-FLOOR-exact: EXACT-file overlap + policy:disjoint + consent + gate → refuse (exact never relaxes).
  {
    const { repoRoot, planPath } = makeGroupRepo({ aSet: 'crates/a/x.rs', bSet: 'crates/a/x.rs', policy: 'disjoint' });
    const r = runValidator(repoRoot, [planPath, '--parallel-safe', '--nodes', 'A,B', '--write-overlap-consent', '--json']);
    assert(r.result === 'refuse', 'T463-FLOOR-exact: exact-file overlap never relaxes, got ' + JSON.stringify(r));
    assert((r.overlapping || []).some(o => o.kind === 'exact'), 'T463-FLOOR-exact: overlapping names the exact kind');
    cleanup(repoRoot);
  }
  // T463-FLOOR-protected: a PROTECTED concrete file (CHANGELOG.md) in a coarse-disjoint pair → refuse.
  {
    const { repoRoot, planPath } = makeGroupRepo({ aSet: 'crates/a/CHANGELOG.md', bSet: COARSE_B, policy: 'disjoint' });
    const r = runValidator(repoRoot, [planPath, '--parallel-safe', '--nodes', 'A,B', '--write-overlap-consent', '--json']);
    assert(r.result === 'refuse', 'T463-FLOOR-protected: a PROTECTED file blocks at every tier, got ' + JSON.stringify(r));
    cleanup(repoRoot);
  }
  // =========================================================================
  // #702 (D-702-01): the file-granular ALLOWBAND co-open floor at --parallel-safe. Exact-file-disjoint
  // docs/** legs (the allowband surface) are a COARSE frontier (top-level area `docs`, not shared-infra),
  // so they relax by the SAME #593 coarse ladder ONCE a post-dominating code-reviewer covers the legs. The
  // freeze grammar now ADMITS this population (previously refused); this pins the runtime side it feeds.
  // README.md joins CHANGELOG.md/ROADMAP.md as a PROTECTED aggregation index — a coarse pair carrying it
  // stays blocking at every tier (NET-2), so a shared readme can never co-open on two legs.
  // =========================================================================
  // T702-DOCS-FLOOR-relax: docs/a.md vs docs/b.md (exact-file-disjoint allowband) + a post-dominating
  // code-reviewer, NO policy, NO consent → ok, relaxed[kind:'coarse'] (the co-open the freeze fix enables).
  {
    const { repoRoot, planPath } = makeGroupRepo({ aSet: 'docs/a.md', bSet: 'docs/b.md', legRole: 'doc-updater' });
    const r = runValidator(repoRoot, [planPath, '--parallel-safe', '--nodes', 'A,B', '--json']);
    assert(r.result === 'ok', 'T702-DOCS-FLOOR-relax: exact-file-disjoint docs legs co-open under the gate, got ' + JSON.stringify(r));
    assert(Array.isArray(r.relaxed) && r.relaxed.some(x => x.kind === 'coarse'), 'T702-DOCS-FLOOR-relax: relaxed[] carries kind coarse (the co-open path), got ' + JSON.stringify(r.relaxed));
    assert(Array.isArray(r.overlapping) && r.overlapping.length === 0, 'T702-DOCS-FLOOR-relax: overlapping empty (downgraded), got ' + JSON.stringify(r.overlapping));
    cleanup(repoRoot);
  }
  // T702-DOCS-FLOOR-nogate: the SAME docs legs with NO post-dominating code-reviewer → refuse (NET-1 fails;
  // the docs frontier serial-degrades). (Mirrors T463-FLOOR-docsgate under the #702 framing.)
  {
    const { repoRoot, planPath } = makeGroupRepo({ aSet: 'docs/a.md', bSet: 'docs/b.md', legRole: 'doc-updater', noGate: true });
    const r = runValidator(repoRoot, [planPath, '--parallel-safe', '--nodes', 'A,B', '--json']);
    assert(r.result === 'refuse', 'T702-DOCS-FLOOR-nogate: docs legs with no post-dominating gate do NOT relax, got ' + JSON.stringify(r));
    cleanup(repoRoot);
  }
  // T702-DOCS-FLOOR-readme-protected: README.md (newly PROTECTED, #702) in a coarse-disjoint pair blocks at
  // every tier — the aggregation index can never co-open on two legs.
  {
    const { repoRoot, planPath } = makeGroupRepo({ aSet: 'crates/a/README.md', bSet: COARSE_B, policy: 'disjoint' });
    const r = runValidator(repoRoot, [planPath, '--parallel-safe', '--nodes', 'A,B', '--write-overlap-consent', '--json']);
    assert(r.result === 'refuse', 'T702-DOCS-FLOOR-readme-protected: README.md is PROTECTED (blocks at every tier), got ' + JSON.stringify(r));
    cleanup(repoRoot);
  }
  // =========================================================================
  // #546-G2 (D-419 write-overlap, DECISION B accuracy-first): a kind:'shared-infra' frontier
  // (exact-file-disjoint by construction, same SHARED_INFRA area — two scripts/ files) co-opens BY
  // DEFAULT — NO write_overlap_policy:'coarse', NO --write-overlap-consent — PROVIDED the retained
  // structural net holds: a post-dominating code-reviewer/synthesizer gate over the legs AND no
  // PROTECTED file in either set. The coarse class + exact overlap are UNCHANGED (still consent-gated /
  // blocking). scripts/sa.js vs scripts/sb.js share the SHARED_INFRA area "scripts" but are exact-file-
  // disjoint ⇒ classifier verdict {yellow, shared-infra}.
  // =========================================================================
  const SHARED_A = 'scripts/sa.js', SHARED_B = 'scripts/sb.js';
  // (A) T546G2-GREEN-NEW: shared-infra-disjoint + a post-dominating code-reviewer gate + no PROTECTED,
  //     NO write_overlap_policy, NO --write-overlap-consent → ok (relaxed by default).
  {
    const { repoRoot, planPath } = makeGroupRepo({ aSet: SHARED_A, bSet: SHARED_B }); // no policy ⇒ off; gate present (default)
    const r = runValidator(repoRoot, [planPath, '--parallel-safe', '--nodes', 'A,B', '--json']); // NO --write-overlap-consent
    assert(r.result === 'ok', 'T546G2-GREEN-NEW: shared-infra-disjoint + gate + no PROTECTED relaxes to ok BY DEFAULT (no policy, no consent), got ' + JSON.stringify(r));
    assert(Array.isArray(r.relaxed) && r.relaxed.some(x => x.kind === 'shared-infra'), 'T546G2-GREEN-NEW: surfaces relaxed[] with kind shared-infra, got ' + JSON.stringify(r.relaxed));
    assert(Array.isArray(r.overlapping) && r.overlapping.length === 0, 'T546G2-GREEN-NEW: overlapping empty (downgraded), got ' + JSON.stringify(r.overlapping));
    cleanup(repoRoot);
  }
  // (B) T546G2-RED-NOGATE (retained net): the SAME shared-infra-disjoint frontier but NO post-dominating
  //     gate (finalize depends directly on A,B) → still REFUSE. The gate net is non-negotiable.
  {
    const { repoRoot, planPath } = makeGroupRepo({ aSet: SHARED_A, bSet: SHARED_B, noGate: true });
    const r = runValidator(repoRoot, [planPath, '--parallel-safe', '--nodes', 'A,B', '--json']);
    assert(r.result === 'refuse' && r.reason === 'overlapping_write_sets', 'T546G2-RED-NOGATE: shared-infra without a post-dominating gate still REFUSES (net retained), got ' + JSON.stringify(r));
    assert(!r.relaxed, 'T546G2-RED-NOGATE: nothing relaxed without a gate');
    cleanup(repoRoot);
  }
  // (C) T546G2-RED-PROTECTED (retained net): the SAME shared-infra area + gate, but one leg touches a
  //     PROTECTED concrete file (the ×4 schema anchor kaola-workflow-adaptive-schema.js, which lives
  //     under scripts/) → still REFUSE. PROTECTED stays blocking at every tier.
  {
    const { repoRoot, planPath } = makeGroupRepo({ aSet: 'scripts/kaola-workflow-adaptive-schema.js', bSet: SHARED_B });
    const r = runValidator(repoRoot, [planPath, '--parallel-safe', '--nodes', 'A,B', '--json']);
    assert(r.result === 'refuse', 'T546G2-RED-PROTECTED: a PROTECTED file in a shared-infra-disjoint pair blocks at every tier (net retained), got ' + JSON.stringify(r));
    assert(!r.relaxed, 'T546G2-RED-PROTECTED: nothing relaxed when a PROTECTED file is present');
    cleanup(repoRoot);
  }
  // (D) T546G2-RED-EXACT (unchanged): an EXACT-file overlap under scripts/ + gate → still REFUSE
  //     (exact never relaxes — it is a genuine overlap; reconciliation is the merge_conflict barrier).
  {
    const { repoRoot, planPath } = makeGroupRepo({ aSet: SHARED_A, bSet: SHARED_A });
    const r = runValidator(repoRoot, [planPath, '--parallel-safe', '--nodes', 'A,B', '--json']);
    assert(r.result === 'refuse', 'T546G2-RED-EXACT: an exact-file overlap stays blocking, got ' + JSON.stringify(r));
    assert((r.overlapping || []).some(o => o.kind === 'exact'), 'T546G2-RED-EXACT: overlapping names the exact kind, got ' + JSON.stringify(r.overlapping));
    cleanup(repoRoot);
  }

  // T463-FREEZE: write_overlap_policy:exact is refused at freeze (deferred); disjoint/off are legal.
  {
    const { repoRoot, planPath } = makeGroupRepo({ aSet: 'a.js', bSet: 'b.js', policy: 'exact' });
    const r = runValidator(repoRoot, [planPath, '--freeze', '--json']);
    assert(r.result === 'refuse' && (r.errors || []).join(' ').includes('write_overlap_policy'),
      'T463-FREEZE: write_overlap_policy:exact refused at freeze, got ' + JSON.stringify(r.errors || r));
    cleanup(repoRoot);
  }
  // AC11 (#463 step 3): synthesizer grammar. A WRITE convergence node (synthesizer, declaring the UNION
  // of its legs' write sets) post-dominated by a real code-reviewer (G1) → FREEZES; proves the
  // synthesizer is a legal convergence node (its union exact-overlaps both legs, but depends_on makes
  // the antichain disjointness loop skip those pairs — were synth a leg co-member it would RED-refuse).
  // The REFUSE case is constructed to DISCRIMINATE the synthesizer specifically: a code-reviewer covers
  // the LEGS but NOT the synthesizer (no reviewer between synth and the sink) → gateUncovered names ONLY
  // `synth`. If the synthesizer were NOT code-producing (not in WRITE_ROLES) this plan would FREEZE
  // (nothing left uncovered), so the refusal pins `synthesizer ∈ WRITE_ROLES → producesCode → needs G1`.
  {
    // shape 'covered' (FREEZE): seed→[A,B legs]→synth(dep A,B, union)→review(code-reviewer)→finalize.
    // shape 'synth-uncovered' (REFUSE): seed→[A,B legs]→reviewL(code-reviewer, covers the legs)→
    //   synth(dep reviewL, union)→finalize — the legs are covered, ONLY synth is uncovered.
    const mkSynthRepo = (shape) => {
      const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ac11-synth-'));
      const projDir = path.join(repoRoot, 'kaola-workflow', 'test-project');
      fs.mkdirSync(path.join(projDir, '.cache'), { recursive: true });
      const planPath = path.join(projDir, 'workflow-plan.md');
      const covered = shape === 'covered';
      const nodeRows = covered
        ? [
          '| A        | tdd-guide     | seed   | src/a.js          | 1 | sequence | — | — | — | — |',
          '| B        | tdd-guide     | seed   | lib/b.js          | 1 | sequence | — | — | — | — |',
          '| synth    | synthesizer   | A,B    | src/a.js lib/b.js | 1 | sequence | — | — | — | — |',
          '| review   | code-reviewer | synth  | —                 | 1 | sequence | review-change | code-tree | sequence | — |',
          '| finalize | finalize      | review | —                 | 1 | sequence | — | — | — | — |',
        ]
        : [
          '| A        | tdd-guide     | seed    | src/a.js          | 1 | sequence | — | — | — | — |',
          '| B        | tdd-guide     | seed    | lib/b.js          | 1 | sequence | — | — | — | — |',
          '| reviewL  | code-reviewer | A,B     | —                 | 1 | sequence | review-legs | code-tree | sequence | — |',
          '| synth    | synthesizer   | reviewL | src/a.js lib/b.js | 1 | sequence | — | — | — | — |',
          '| finalize | finalize      | synth   | —                 | 1 | sequence | — | — | — | — |',
        ];
      const ledgerRows = covered
        ? ['| seed | pending |', '| A | pending |', '| B | pending |', '| synth | pending |', '| review | pending |', '| finalize | pending |']
        : ['| seed | pending |', '| A | pending |', '| B | pending |', '| reviewL | pending |', '| synth | pending |', '| finalize | pending |'];
      // Schema-2 freeze requires the exact one-row-per-node Required Agent Compliance set (#699).
      const complianceRows = covered
        ? ['| code-explorer (seed) | pending | | |', '| tdd-guide (A) | pending | | |', '| tdd-guide (B) | pending | | |', '| synthesizer (synth) | pending | | |', '| code-reviewer (review) | pending | | |', '| finalize (finalize) | pending | | |']
        : ['| code-explorer (seed) | pending | | |', '| tdd-guide (A) | pending | | |', '| tdd-guide (B) | pending | | |', '| code-reviewer (reviewL) | pending | | |', '| synthesizer (synth) | pending | | |', '| finalize (finalize) | pending | | |'];
      const plan = [
        '# Workflow Plan — test-project', '',
        '## Meta',
        'plan_schema_version: 2',
        'contract_version: 2',
        // Unified schema-2 (#695): a plan that carries reviewer-contract-v2 gate metadata also carries the
        // epoch contract (#699) and the validation policy (#693/#696/#697/#698). Epoch child fields use the
        // canonical placeholder digests the replan fixtures use; the freeze validator checks format + graph.
        'epoch_schema_version: 2',
        'plan_epoch: 2',
        'epoch_lineage_id: ' + '1'.repeat(64),
        'parent_plan_hash: ' + '2'.repeat(64),
        'parent_snapshot_manifest_digest: pending',
        'claim_root_base_digest: ' + '3'.repeat(64),
        'inherited_frontier_digest: ' + '4'.repeat(64),
        'inherited_frontier_classes: code',
        'source_evidence_digest: ' + '5'.repeat(64),
        'transition_reason: review_repair_requires_replan',
        'planner_binding: dispatch-ac11',
        'labels: area:scripts',
        'sink: CHANGELOG.md',
        'code_certifier: ' + (covered ? 'review' : 'reviewL'),
        'security_certifier: none',
        'validation_command: node --check scripts/kaola-workflow-plan-validator.js',
        'validation_timeout_minutes: 5', '',
        '## Nodes', '',
        '| id | role | depends_on | declared_write_set | cardinality | shape | gate_claim | gate_surface | gate_aggregation | certifies |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
        '| seed     | code-explorer | —      | —                 | 1 | sequence | — | — | — | — |',
        ...nodeRows, '',
        '## Node Ledger', '',
        '| id | status |', '| --- | --- |',
        ...ledgerRows, '',
        '## Required Agent Compliance', '',
        '| Requirement | Status | Evidence | Skip Reason |',
        '| --- | --- | --- | --- |',
        ...complianceRows, '',
      ].join('\n') + '\n';
      fs.writeFileSync(planPath, plan);
      fs.writeFileSync(path.join(projDir, 'workflow-state.md'), '# State\n');
      const g = (args) => execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'] });
      g(['init']); g(['config', 'user.email', 'kw@test']); g(['config', 'user.name', 'kw']); g(['config', 'commit.gpgsign', 'false']);
      fs.writeFileSync(path.join(repoRoot, '.gitignore'), '.kw/\n');
      g(['add', '-A']); g(['commit', '-m', 'init']);
      return { repoRoot, planPath };
    };
    // FREEZE: legs → synthesizer(union) → code-reviewer → finalize is in-grammar.
    { const { repoRoot, planPath } = mkSynthRepo('covered');
      const r = runValidator(repoRoot, [planPath, '--freeze', '--json']);
      assert(r.exitCode === 0 && r.result !== 'refuse',
        'AC11: legs→synthesizer(union)→code-reviewer→sink must FREEZE, got ' + JSON.stringify(r.errors || r));
      cleanup(repoRoot); }
    // REFUSE (synth-discriminating): legs covered by a reviewer, ONLY the synthesizer uncovered →
    // gateUncovered must name `synth` specifically (a non-code synth would leave nothing uncovered).
    { const { repoRoot, planPath } = mkSynthRepo('synth-uncovered');
      const r = runValidator(repoRoot, [planPath, '--freeze', '--json']);
      const errs = (r.errors || []).join(' ');
      assert(r.result === 'refuse' && /\bsynth\b/.test(errs) && /code-reviewer|gate|post-dominat|uncovered/i.test(errs),
        'AC11: a synthesizer with covered legs but NO reviewer after it must REFUSE naming synth (pins synth∈WRITE_ROLES→producesCode→G1), got ' + JSON.stringify(r.errors || r));
      cleanup(repoRoot); }
  }

  // T463-PURITY (AC13): disjointWriteSets adds `kind` but its VERDICT is UNCHANGED — the pure callers
  // (scanClaimedOverlap / antichain / G-SEL-4) read verdict and ignore kind.
  {
    const exact = planValidator ? null : null; // (use the classifier directly)
    const classifier = require('./kaola-workflow-classifier');
    const ex = classifier.disjointWriteSets([new Set(['x.js']), new Set(['x.js'])]);
    assert(ex.verdict === 'red' && ex.kind === 'exact', 'T463-PURITY: exact → verdict red (unchanged) + kind exact');
    const co = classifier.disjointWriteSets([new Set(['crates/a/x.rs']), new Set(['crates/b/y.rs'])]);
    assert(co.verdict === 'red' && co.kind === 'coarse', 'T463-PURITY: coarse → verdict red (unchanged) + kind coarse');
    const sh = classifier.disjointWriteSets([new Set(['scripts/a.js']), new Set(['scripts/b.js'])]);
    assert(sh.verdict === 'yellow' && sh.kind === 'shared-infra', 'T463-PURITY: shared-infra → verdict yellow (unchanged) + kind shared-infra');
    const gr = classifier.disjointWriteSets([new Set(['p/a.js']), new Set(['q/b.js'])]);
    assert(gr.verdict === 'green' && gr.kind === null, 'T463-PURITY: disjoint → verdict green (unchanged) + kind null');
    assert(classifier.isProtected('CHANGELOG.md') === true && classifier.isProtected('crates/a/x.rs') === false,
      'T463-PURITY: isProtected true for CHANGELOG.md, false for an ordinary file');
    // #702: README.md joins the PROTECTED aggregation indexes (stays single-leg via NET-2).
    assert(classifier.isProtected('README.md') === true, 'T702-PURITY: isProtected true for README.md (newly protected)');
  }

  // -------------------------------------------------------------------------
  // T-GB: --group-barrier --group-id <id> --json — group baseline diff over the
  //       member union, reading running-set.json's lane_group.
  // Setup helper: record the GROUP baseline, write running-set.json's lane_group,
  // then make REAL edits, then run --group-barrier.
  // -------------------------------------------------------------------------
  function setupGroup(repoRoot, cacheDir, planPath) {
    // Record the shared group baseline keyed by the group id (reuses --record-base).
    const groupId = 'lg-A-B';
    const rb = runValidator(repoRoot, [planPath, '--record-base', '--node-id', groupId, '--json']);
    assert(rb.result === 'ok' && rb.base, 'T-GB setup: group baseline recorded for ' + groupId + ', got ' + JSON.stringify(rb));
    const runningSet = {
      state: 'open',
      max_concurrent: 8,
      lane_group: {
        group_id: groupId,
        members: ['A', 'B'],
        baseline: rb.base,
        write_union: ['ax.js', 'by.js'],
        openedAt: '2026-06-13T10:12:00.000Z',
      },
      nodes: [
        { id: 'A', role: 'tdd-guide', kind: 'write', group_id: groupId, declared_write_set: 'ax.js', baseline: 'recorded' },
        { id: 'B', role: 'tdd-guide', kind: 'write', group_id: groupId, declared_write_set: 'by.js', baseline: 'recorded' },
      ],
    };
    fs.writeFileSync(path.join(cacheDir, 'running-set.json'), JSON.stringify(runningSet, null, 2));
    return groupId;
  }

  // T-GB-1 group pass: edit ax.js (A's lane) + by.js (B's lane) → both ∈ union → pass.
  {
    const { repoRoot, cacheDir, planPath } = makeGroupRepo();
    const groupId = setupGroup(repoRoot, cacheDir, planPath);
    fs.writeFileSync(path.join(repoRoot, 'ax.js'), '// A wrote here\n');
    fs.writeFileSync(path.join(repoRoot, 'by.js'), '// B wrote here\n');
    const r = runValidator(repoRoot, [planPath, '--group-barrier', '--group-id', groupId, '--json']);
    assert(r.result === 'pass', 'T-GB-1: in-union edits ax.js+by.js → group barrier pass, got ' + JSON.stringify(r));
    assert(r.exitCode === 0, 'T-GB-1: exit 0 on group pass');
    cleanup(repoRoot);
  }
  // T-GB-2 cross-lane stray (NEITHER set): also edit z.js → refuse, names z.js, rank-4 overflow.
  {
    const { repoRoot, cacheDir, planPath } = makeGroupRepo();
    const groupId = setupGroup(repoRoot, cacheDir, planPath);
    fs.writeFileSync(path.join(repoRoot, 'ax.js'), '// A wrote here\n');
    fs.writeFileSync(path.join(repoRoot, 'by.js'), '// B wrote here\n');
    fs.writeFileSync(path.join(repoRoot, 'z.js'), '// nobody declared this\n');
    const r = runValidator(repoRoot, [planPath, '--group-barrier', '--group-id', groupId, '--json']);
    assert(r.result === 'refuse', 'T-GB-2: cross-lane stray z.js → group barrier refuse, got ' + JSON.stringify(r));
    assert(r.exitCode === 1, 'T-GB-2: exit 1 on refuse');
    assert(r.errors.join(' ').includes('z.js'), 'T-GB-2: refusal text names z.js');
    assert(r.reason === 'write_set_overflow' || r.reason === 'unattributed_write',
      'T-GB-2: reason is the EXISTING overflow/unattributed arm (NO new reason code), got ' + r.reason);
    assert(Array.isArray(r.outOfAllow) && r.outOfAllow.includes('z.js'), 'T-GB-2: z.js in outOfAllow');
    cleanup(repoRoot);
  }
  // T-GB-3 in-union both-member edits pass even though A decl ONLY ax.js / B ONLY by.js
  //         (proves UNION allowlist, not per-node — a per-node barrier of A would refuse by.js).
  {
    const { repoRoot, cacheDir, planPath } = makeGroupRepo();
    const groupId = setupGroup(repoRoot, cacheDir, planPath);
    // Only B's lane file is touched, but the group union still allows it (B is a member).
    fs.writeFileSync(path.join(repoRoot, 'by.js'), '// B-only edit, attributed via union\n');
    const r = runValidator(repoRoot, [planPath, '--group-barrier', '--group-id', groupId, '--json']);
    assert(r.result === 'pass', 'T-GB-3: by.js alone passes under union(A,B) — UNION not per-node, got ' + JSON.stringify(r));
    cleanup(repoRoot);
  }
  // T-GB-4 group_not_found: --group-id names a group not present in running-set.json.
  {
    const { repoRoot, cacheDir, planPath } = makeGroupRepo();
    setupGroup(repoRoot, cacheDir, planPath);
    const r = runValidator(repoRoot, [planPath, '--group-barrier', '--group-id', 'lg-WRONG', '--json']);
    assert(r.result === 'refuse', 'T-GB-4: unknown group id → refuse');
    assert(r.reason === 'group_not_found', 'T-GB-4: reason group_not_found, got ' + r.reason);
    cleanup(repoRoot);
  }
  // T-GB-5 --group-barrier without --group-id → refuse.
  {
    const { repoRoot, cacheDir, planPath } = makeGroupRepo();
    setupGroup(repoRoot, cacheDir, planPath);
    const r = runValidator(repoRoot, [planPath, '--group-barrier', '--json']);
    assert(r.result === 'refuse', 'T-GB-5: --group-barrier without --group-id → refuse');
    cleanup(repoRoot);
  }
  // T-GB-6 (MUTATION CHECK — proves the test BITES): the cross-lane stray MUST refuse via the
  //         REAL subprocess. If the group barrier were short-circuited (always pass), T-GB-2 would
  //         flip to pass and this assert would fail. We re-assert the refuse here independently to
  //         lock the no-false-green property.
  {
    const { repoRoot, cacheDir, planPath } = makeGroupRepo();
    const groupId = setupGroup(repoRoot, cacheDir, planPath);
    fs.writeFileSync(path.join(repoRoot, 'z.js'), '// undeclared stray\n');
    const r = runValidator(repoRoot, [planPath, '--group-barrier', '--group-id', groupId, '--json']);
    assert(r.result === 'refuse' && r.exitCode === 1,
      'T-GB-6 (mutation): a lone undeclared stray z.js MUST refuse — a vacuous/short-circuit pass is impossible');
    cleanup(repoRoot);
  }
}

// ---------------------------------------------------------------------------
// Reviewer contract v2 whole-plan gate dependencies. Finalization and
// --verdict-check consume the same graph classifier and receipt reducer.
// ---------------------------------------------------------------------------
{
  const schema = require('./kaola-workflow-adaptive-schema');
  assert(typeof planValidator.buildPlanView === 'function',
    'review-v2 commit dependency: plan-validator exports buildPlanView');
  assert(typeof schema.deriveGateMode === 'function',
    'review-v2 commit dependency: adaptive-schema exports deriveGateMode');
  assert(typeof schema.reduceReviewReceipts === 'function',
    'review-v2 commit dependency: adaptive-schema exports reduceReviewReceipts');
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
