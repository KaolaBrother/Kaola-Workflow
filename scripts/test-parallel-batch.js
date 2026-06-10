#!/usr/bin/env node
'use strict';

// Unit tests for kaola-workflow-parallel-batch.js (issue #281)
// Hand-rolled assert + counter; repo style (no framework) — mirrors
// test-adaptive-node.js / test-next-action.js.
//
// SCOPE NOTE (honest infeasibility, blueprint §0/§9): these tests prove batch
// STATE correctness ONLY. A script cannot dispatch agents; the harness's sole
// real concurrency is the MAIN SESSION issuing multiple Agent() calls in one
// message. parallel-batch.js owns batch STATE; the plan-run SKILL owns DISPATCH.
// These tests therefore assert ledger flips, baselines, manifest transitions,
// disjointness fail-closed, capping, sealing, joining, and orphan detection —
// NOT wall-clock concurrency, which is not observable here.
//
// All runtime fixtures live under $TMPDIR (mkdtempSync) — NOTHING is written
// inside the repo's kaola-workflow/ tree (the finalize per-node barrier checks
// write-set containment against the 3 declared files; a stray repo write trips it).
// Where a real next-action.js call genuinely exercises the readyPending wiring we
// drive the REAL (pure/read-only) script against a synthetic $TMPDIR plan; for
// commit-node --start/barrier we inject a `shell` stub seam (documented).

const {
  BATCH_STATES,
  deriveReadyPending,
  classifyBatchKind,
  checkDisjoint,
  capMembers,
  crossCheckStatus,
  runOpenBatch,
  runTopUp,
  runSealMember,
  runSeal,
  runJoin,
  runReconcile,
  runStatus,
  recommendBatchRoute,
} = require('./kaola-workflow-parallel-batch');

const { resolveBatchCwdEnforced } = require('./kaola-workflow-adaptive-schema');

const {
  ORPHAN_LEGALITY_MANIFEST,
  ORPHAN_LEGALITY_IN_PROGRESS_IDS,
  CROSS_CHECK_EXPECTED,
  TOPUP_INCOMPLETE_MANIFEST,
  TOPUP_INCOMPLETE_IN_PROGRESS_BEFORE,
  TOPUP_INCOMPLETE_IN_PROGRESS_AFTER,
  TOPUP_INCOMPLETE_REASON,
} = require('./fixtures-orphan-legality');

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
// Helpers: plan builder (matches test-next-action.js / test-adaptive-node.js).
// ---------------------------------------------------------------------------
function makePlan(nodesRows, ledgerRows) {
  return [
    '# Workflow Plan — test-project',
    '',
    '## Meta',
    'labels: area:scripts',
    '',
    '## Nodes',
    '',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '| --- | --- | --- | --- | --- | --- |',
    ...nodesRows,
    '',
    '## Node Ledger',
    '',
    '| id | status | notes |',
    '| --- | --- | --- |',
    ...ledgerRows,
    '',
  ].join('\n') + '\n';
}

// Write a synthetic project dir under $TMPDIR; returns { dir, planPath, statePath, cacheDir }.
function makeProjectDir(planContent) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-parallel-batch-'));
  const projDir = path.join(root, 'kaola-workflow', 'test-project');
  const cacheDir = path.join(projDir, '.cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  const planPath = path.join(projDir, 'workflow-plan.md');
  const statePath = path.join(projDir, 'workflow-state.md');
  fs.writeFileSync(planPath, planContent);
  fs.writeFileSync(statePath, '# State\n');
  return { root, projDir, planPath, statePath, cacheDir };
}

function cleanup(root) {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
}

// Build the standard injected I/O seams for a real project dir.
function makeIo() {
  return {
    readFile: (fpath) => fs.readFileSync(fpath, 'utf8'),
    writeFile: (fpath, content) => fs.writeFileSync(fpath, content, 'utf8'),
    cacheExists: (fpath) => fs.existsSync(fpath),
    mkdirp: (dir) => { try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {} },
    now: () => '2026-06-07T00:00:00.000Z', // injected deterministic timestamp
  };
}

// A real next-action shell that drives the REAL (pure/read-only) script against
// the synthetic plan fixture, exercising the genuine readyPending wiring.
const realNextActionPath = path.join(__dirname, 'kaola-workflow-next-action.js');
function realNextActionShell(planPath) {
  const { shellNode } = require('./kaola-workflow-adaptive-node');
  return function (scriptPath, args) {
    const base = path.basename(scriptPath);
    if (base === 'kaola-workflow-next-action.js') {
      return shellNode(realNextActionPath, [planPath, '--json']);
    }
    if (base === 'kaola-workflow-plan-validator.js' && (args || []).includes('--resume-check')) {
      // STUB (#303): the open-batch / top-up integrity gate. A real --resume-check needs a frozen
      // plan_hash; the synthetic fixtures are not frozen, so shim a passing graph-integrity result.
      return { exitCode: 0, ok: true, planHash: 'stub-hash' };
    }
    if (base === 'kaola-workflow-commit-node.js') {
      // STUB: commit-node --start/barrier. A real baseline needs a git fixture;
      // here we shim a successful baseline/barrier so the STATE wiring is exercised.
      const argsArr = args || [];
      const nodeIdIdx = argsArr.indexOf('--node-id');
      const nodeId = nodeIdIdx >= 0 ? argsArr[nodeIdIdx + 1] : null;
      if (argsArr.includes('--start')) {
        return { exitCode: 0, result: 'ok', mode: 'per-node-start', nodeId, overallOk: true };
      }
      return {
        exitCode: 0, result: 'ok', mode: 'per-node', nodeId, overallOk: true,
        selectorCheck: { isSelector: false, ok: true },
        barrierCheck: { exitCode: 0, result: 'pass' },
      };
    }
    return { exitCode: 1, result: 'refuse', errors: ['unexpected shell ' + base] };
  };
}

// ===========================================================================
// PURE-CORE TESTS (no subprocess, no FS)
// ===========================================================================

// ---------------------------------------------------------------------------
// P1: BATCH_STATES frozen vocabulary lives in THIS file (not adaptive-schema).
// ---------------------------------------------------------------------------
{
  assert(Array.isArray(BATCH_STATES), 'P1: BATCH_STATES is an array');
  assert(Object.isFrozen(BATCH_STATES), 'P1: BATCH_STATES is frozen');
  // #303: the dead 'dispatched' state (declared, never written) is removed; the crash-safe
  // 'opening' transaction marker is added. Lifecycle: opening → open → sealed → joining → joined.
  assert(JSON.stringify(BATCH_STATES) === JSON.stringify(['opening', 'open', 'sealed', 'joining', 'joined']),
    'P1 (#303): BATCH_STATES === [opening,open,sealed,joining,joined] (dispatched removed)');
  assert(!BATCH_STATES.includes('dispatched'), 'P1 (#303): dead dispatched state removed');
}

// ---------------------------------------------------------------------------
// P2: deriveReadyPending — readySet members whose OWN ledger status === 'pending'.
// (next-action does NOT yet return readyPending; we derive it from readySet + ledger.)
// ---------------------------------------------------------------------------
{
  const readySet = [
    { id: 'v1', role: 'tdd-guide', declared_write_set: 'scripts/v1.js' },
    { id: 'v2', role: 'tdd-guide', declared_write_set: 'scripts/v2.js' },
    { id: 'inprog', role: 'tdd-guide', declared_write_set: 'scripts/x.js' },
  ];
  const ledger = new Map([['v1', 'pending'], ['v2', 'pending'], ['inprog', 'in_progress']]);
  const rp = deriveReadyPending(readySet, ledger);
  assert(rp.length === 2, 'P2: in_progress readySet member excluded from readyPending');
  assert(rp.map(n => n.id).join(',') === 'v1,v2', 'P2: only own-pending members, doc order');
}

// ---------------------------------------------------------------------------
// P2g (#334): deriveReadyPending EXCLUDES a main-session-gate node — the main session
// runs it serially, never as a batch member (covers both open-batch and top-up, which
// share this derivation). A gate mixed with read-only siblings drops only the gate; a
// gate-only frontier yields an EMPTY frontier (→ the empty-frontier defer in open-batch).
// ---------------------------------------------------------------------------
{
  const mixed = [
    { id: 'vgate', role: 'main-session-gate', declared_write_set: '—' },
    { id: 'ro1', role: 'tdd-guide', declared_write_set: 'scripts/ro1.js' },
    { id: 'ro2', role: 'tdd-guide', declared_write_set: 'scripts/ro2.js' },
  ];
  const ledger = new Map([['vgate', 'pending'], ['ro1', 'pending'], ['ro2', 'pending']]);
  const rp = deriveReadyPending(mixed, ledger);
  assert(rp.map(n => n.id).join(',') === 'ro1,ro2', 'P2g: main-session-gate filtered out of the batch frontier (only ro1,ro2)');
  assert(!rp.some(n => n.role === 'main-session-gate'), 'P2g: no gate role survives deriveReadyPending');

  // gate-only frontier → empty (the existing empty-frontier defer fires)
  const gateOnly = [{ id: 'vgate', role: 'main-session-gate', declared_write_set: '—' }];
  const rpOnly = deriveReadyPending(gateOnly, new Map([['vgate', 'pending']]));
  assert(rpOnly.length === 0, 'P2g: a gate-only frontier derives to empty (open-batch defers, orchestrator routes to open-next)');
}

// ---------------------------------------------------------------------------
// P3: classifyBatchKind — all-read-only → read_only; all-write-role → write_role;
//     MIXED → selects the read-only subset (NOT a refuse).
// ---------------------------------------------------------------------------
{
  const allRo = [
    { id: 'v1', declared_write_set: '—' },
    { id: 'v2', declared_write_set: '-' },
  ];
  const ro = classifyBatchKind(allRo);
  assert(ro.kind === 'read_only', 'P3a: all-empty write sets → read_only');
  assert(ro.members.length === 2, 'P3a: all read-only members selected');

  const allWr = [
    { id: 'a', declared_write_set: 'scripts/a.js' },
    { id: 'b', declared_write_set: 'scripts/b.js' },
  ];
  const wr = classifyBatchKind(allWr);
  assert(wr.kind === 'write_role', 'P3b: all-non-empty write sets → write_role');
  assert(wr.members.length === 2, 'P3b: all write-role members selected');

  const mixed = [
    { id: 'ro1', declared_write_set: '—' },
    { id: 'wr1', declared_write_set: 'scripts/x.js' },
    { id: 'ro2', declared_write_set: '-' },
  ];
  const mx = classifyBatchKind(mixed);
  assert(mx.kind === 'read_only', 'P3c: MIXED frontier selects the read_only subset (not a refuse)');
  assert(mx.members.map(m => m.id).join(',') === 'ro1,ro2', 'P3c: only the read-only members selected');
}

// ---------------------------------------------------------------------------
// P4: checkDisjoint — reuses validator/classifier semantics; overlap → not disjoint.
// ---------------------------------------------------------------------------
{
  const disjoint = checkDisjoint([
    { id: 'a', declared_write_set: 'scripts/a.js' },
    { id: 'b', declared_write_set: 'scripts/b.js' },
  ]);
  assert(disjoint.disjoint === true, 'P4a: distinct paths are disjoint');

  const overlap = checkDisjoint([
    { id: 'a', declared_write_set: 'scripts/shared.js' },
    { id: 'b', declared_write_set: 'scripts/shared.js' },
  ]);
  assert(overlap.disjoint === false, 'P4b: identical exact path → NOT disjoint (fail-closed)');
}

// ---------------------------------------------------------------------------
// P5: capMembers — clamp to min(members, FANOUT_CAP=4, --max).
// ---------------------------------------------------------------------------
{
  const six = [];
  for (let i = 0; i < 6; i++) six.push({ id: 'n' + i });
  // default cap 4
  assert(capMembers(six, { fanoutCap: 4 }).length === 4, 'P5a: clamps 6 → FANOUT_CAP 4');
  // --max 2 wins
  assert(capMembers(six, { fanoutCap: 4, max: 2 }).length === 2, 'P5b: --max 2 wins over cap 4');
  // fewer members than cap → no clamp
  assert(capMembers(six.slice(0, 3), { fanoutCap: 4 }).length === 3, 'P5c: 3 members < cap → no clamp');
}

// ---------------------------------------------------------------------------
// P6: crossCheckStatus orphan legality (AC#5/#6, blueprint §3) — multiple
//     in_progress rows WITH a matching manifest = valid; WITHOUT (or mismatched)
//     = the orphan condition the design refuses.
// ---------------------------------------------------------------------------
{
  const inProgress = ['v1', 'v2'];

  // valid: manifest present, member set EXACTLY equals in_progress set
  const matchManifest = { batchId: 'b1', state: 'open', members: [{ id: 'v1' }, { id: 'v2' }] };
  const ok = crossCheckStatus(matchManifest, inProgress);
  assert(ok.valid === true, 'P6a: >1 in_progress + matching manifest → valid');
  assert(ok.orphan === false, 'P6a: not flagged orphan');

  // orphan: >1 in_progress and NO manifest
  const noManifest = crossCheckStatus(null, inProgress);
  assert(noManifest.valid === false, 'P6b: >1 in_progress + no manifest → invalid');
  assert(noManifest.orphan === true, 'P6b: flagged orphan_multi_in_progress');

  // orphan: >1 in_progress but manifest member-set MISMATCH
  const mismatch = { batchId: 'b1', state: 'open', members: [{ id: 'v1' }, { id: 'vX' }] };
  const mm = crossCheckStatus(mismatch, inProgress);
  assert(mm.valid === false, 'P6c: member-set mismatch → invalid');
  assert(mm.orphan === true, 'P6c: mismatch flagged orphan');

  // legal single-node: ≤1 in_progress + no manifest → valid (legacy path), NOT orphan
  const single = crossCheckStatus(null, ['v1']);
  assert(single.valid === true, 'P6d: single in_progress + no manifest → valid (legacy)');
  assert(single.orphan === false, 'P6d: single in_progress not orphan');
}

// ===========================================================================
// INTEGRATION TESTS (real project dir + real next-action + stubbed commit-node)
// ===========================================================================

// ---------------------------------------------------------------------------
// I1: open-batch over a read-only sibling frontier (2 pending siblings sharing a
//     dep) → flips both to in_progress, writes manifest state:'open' w/ 2 members,
//     records 2 baselines. Drives REAL next-action against the synthetic plan.
// ---------------------------------------------------------------------------
{
  const plan = makePlan(
    [
      '| a        | code-explorer | —    | —             | 1 | sequence       |',
      '| v1       | tdd-guide     | a    | —             | 1 | fanout(verify) |',
      '| v2       | tdd-guide     | a    | —             | 1 | fanout(verify) |',
      '| finalize | finalize      | v1,v2| —             | 1 | sequence       |',
    ],
    [
      '| a        | complete |  |',
      '| v1       | pending  |  |',
      '| v2       | pending  |  |',
      '| finalize | pending  |  |',
    ]
  );
  const { root, projDir, planPath, statePath, cacheDir } = makeProjectDir(plan);
  const io = makeIo();
  const manifestPath = path.join(cacheDir, 'active-batch.json');

  let baselineCalls = [];
  const shell = (function () {
    const inner = realNextActionShell(planPath);
    return function (scriptPath, args) {
      const base = path.basename(scriptPath);
      if (base === 'kaola-workflow-commit-node.js' && (args || []).includes('--start')) {
        const nodeIdIdx = args.indexOf('--node-id');
        baselineCalls.push(args[nodeIdIdx + 1]);
      }
      return inner(scriptPath, args);
    };
  })();

  const r = runOpenBatch({
    planPath, statePath, cacheDir, manifestPath, project: 'test-project',
    max: null, fanoutCap: 4, shell, ...io,
  });

  assert(r.result === 'ok', 'I1: open-batch read-only frontier → ok');
  assert(r.state === 'open', 'I1: manifest state open');
  assert(Array.isArray(r.members) && r.members.length === 2, 'I1: 2 members opened');
  assert(r.members.every(m => m.kind === 'read_only'), 'I1: members classified read_only');

  // Ledger flipped to in_progress for both.
  const writtenPlan = fs.readFileSync(planPath, 'utf8');
  assert(writtenPlan.includes('| v1       | in_progress |') || /\|\s*v1\s*\|\s*in_progress\s*\|/.test(writtenPlan),
    'I1: v1 ledger row in_progress');
  assert(/\|\s*v2\s*\|\s*in_progress\s*\|/.test(writtenPlan), 'I1: v2 ledger row in_progress');

  // Manifest written, state open, 2 members.
  assert(fs.existsSync(manifestPath), 'I1: manifest active-batch.json written');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert(manifest.state === 'open', 'I1: persisted manifest state open');
  assert(manifest.members.length === 2, 'I1: persisted manifest has 2 members');
  assert(manifest.createdAt === '2026-06-07T00:00:00.000Z', 'I1: createdAt is the injected deterministic timestamp');

  // 2 baselines recorded (one commit-node --start per member).
  assert(baselineCalls.length === 2, 'I1: 2 baselines recorded (commit-node --start per member)');
  assert(baselineCalls.includes('v1') && baselineCalls.includes('v2'), 'I1: baselines for v1 and v2');

  cleanup(root);
}

// ---------------------------------------------------------------------------
// I1g (#334): open-batch over a frontier of [vgate(main-session-gate), v1, v2] opens
// ONLY v1,v2 — the non-delegable gate is filtered out of the batch frontier and is left
// pending for the serial open-next path. Drives REAL next-action against a frozen plan.
// ---------------------------------------------------------------------------
{
  const plan = makePlan(
    [
      '| a        | code-explorer     | —          | — | 1 | sequence       |',
      '| vgate    | main-session-gate | a          | — | 1 | sequence       |',
      '| v1       | knowledge-lookup  | a          | — | 1 | fanout(verify) |',
      '| v2       | knowledge-lookup  | a          | — | 1 | fanout(verify) |',
      '| finalize | finalize          | vgate,v1,v2| — | 1 | sequence       |',
    ],
    [
      '| a        | complete |  |',
      '| vgate    | pending  |  |',
      '| v1       | pending  |  |',
      '| v2       | pending  |  |',
      '| finalize | pending  |  |',
    ]
  );
  const { root, planPath, statePath, cacheDir } = makeProjectDir(plan);
  const io = makeIo();
  const manifestPath = path.join(cacheDir, 'active-batch.json');
  const shell = realNextActionShell(planPath);

  const r = runOpenBatch({
    planPath, statePath, cacheDir, manifestPath, project: 'test-project',
    max: null, fanoutCap: 4, shell, ...io,
  });

  assert(r.result === 'ok', 'I1g: open-batch with a gate in the frontier → ok');
  assert(Array.isArray(r.members) && r.members.length === 2, 'I1g: only the 2 delegable siblings opened (gate excluded)');
  assert(!r.members.some(m => m.id === 'vgate'), 'I1g: the main-session-gate is NOT a batch member');
  const writtenPlan = fs.readFileSync(planPath, 'utf8');
  assert(/\|\s*vgate\s*\|\s*pending\s*\|/.test(writtenPlan), 'I1g: the gate is left PENDING (opens serially via open-next, not batched)');
  assert(/\|\s*v1\s*\|\s*in_progress\s*\|/.test(writtenPlan) && /\|\s*v2\s*\|\s*in_progress\s*\|/.test(writtenPlan),
    'I1g: v1,v2 flipped to in_progress');

  cleanup(root);
}

// ---------------------------------------------------------------------------
// I2: open-batch fail-closed on overlapping write-role declared sets → not_disjoint.
//     No ledger flips, no manifest.
// ---------------------------------------------------------------------------
{
  const plan = makePlan(
    [
      '| a   | code-explorer | —   | —                 | 1 | sequence        |',
      '| w1  | implementer   | a   | scripts/shared.js | 1 | sequence        |',
      '| w2  | implementer   | a   | scripts/shared.js | 1 | sequence        |',
      '| fin | finalize      | w1,w2 | —               | 1 | sequence        |',
    ],
    [
      '| a   | complete |  |',
      '| w1  | pending  |  |',
      '| w2  | pending  |  |',
      '| fin | pending  |  |',
    ]
  );
  const { root, planPath, statePath, cacheDir } = makeProjectDir(plan);
  const io = makeIo();
  const manifestPath = path.join(cacheDir, 'active-batch.json');

  // #320: the not_disjoint fail-closed gate now lives in the cwd-enforced branch (the default path
  // serial-degrades write-role frontiers before the disjointness re-check). Set cwdEnforced:true to
  // exercise the disjointness gate itself.
  const r = runOpenBatch({
    planPath, statePath, cacheDir, manifestPath, project: 'test-project',
    max: null, fanoutCap: 4, cwdEnforced: true, shell: realNextActionShell(planPath), ...io,
  });

  assert(r.result === 'refuse', 'I2: overlapping write-role frontier (cwd-enforced) → refuse');
  assert(r.reason === 'not_disjoint', 'I2: reason === not_disjoint');
  assert(!fs.existsSync(manifestPath), 'I2: no manifest written on refuse');
  const writtenPlan = fs.readFileSync(planPath, 'utf8');
  assert(/\|\s*w1\s*\|\s*pending\s*\|/.test(writtenPlan), 'I2: w1 still pending (no flip on refuse)');
  assert(/\|\s*w2\s*\|\s*pending\s*\|/.test(writtenPlan), 'I2: w2 still pending (no flip on refuse)');

  cleanup(root);
}

// ---------------------------------------------------------------------------
// I3: open-batch caps at FANOUT_CAP. 5 read-only pending siblings, cap 4 → 4 members.
// ---------------------------------------------------------------------------
{
  const plan = makePlan(
    [
      '| a        | code-explorer | —              | — | 1 | sequence       |',
      '| v1       | tdd-guide     | a              | — | 1 | fanout(verify) |',
      '| v2       | tdd-guide     | a              | — | 1 | fanout(verify) |',
      '| v3       | tdd-guide     | a              | — | 1 | fanout(verify) |',
      '| v4       | tdd-guide     | a              | — | 1 | fanout(verify) |',
      '| v5       | tdd-guide     | a              | — | 1 | fanout(verify) |',
      '| finalize | finalize      | v1,v2,v3,v4,v5 | — | 1 | sequence       |',
    ],
    [
      '| a        | complete |  |',
      '| v1       | pending  |  |',
      '| v2       | pending  |  |',
      '| v3       | pending  |  |',
      '| v4       | pending  |  |',
      '| v5       | pending  |  |',
      '| finalize | pending  |  |',
    ]
  );
  const { root, planPath, statePath, cacheDir } = makeProjectDir(plan);
  const io = makeIo();
  const manifestPath = path.join(cacheDir, 'active-batch.json');

  const r = runOpenBatch({
    planPath, statePath, cacheDir, manifestPath, project: 'test-project',
    max: null, fanoutCap: 4, shell: realNextActionShell(planPath), ...io,
  });

  assert(r.result === 'ok', 'I3: open-batch with 5 siblings → ok');
  assert(r.members.length === 4, 'I3: capped at FANOUT_CAP 4 (5 ready siblings clamped), got ' + r.members.length);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert(manifest.members.length === 4, 'I3: manifest persists 4 members');
  // v5 must NOT be opened (still pending).
  const writtenPlan = fs.readFileSync(planPath, 'utf8');
  assert(/\|\s*v5\s*\|\s*pending\s*\|/.test(writtenPlan), 'I3: 5th sibling left pending (over the cap)');

  cleanup(root);
}

// ---------------------------------------------------------------------------
// I3-375 (#375 / D3): a READ-ONLY batch opens up to the READ-ONLY cap (8), NOT the
// write-side cap (4). 10 read-only pending siblings + fanoutCap 4 + fanoutCapReadonly 8
// → 8 opened, 2 queued. Write-role behavior is unaffected (still the conservative cap).
// ---------------------------------------------------------------------------
{
  const verifyRows = [];
  const ledgerRows = ['| a        | complete |  |'];
  const ids = [];
  for (let i = 1; i <= 10; i++) {
    const id = 'v' + i;
    ids.push(id);
    verifyRows.push('| ' + id.padEnd(8) + ' | tdd-guide     | a              | — | 1 | fanout(verify) |');
    ledgerRows.push('| ' + id.padEnd(8) + ' | pending  |  |');
  }
  const plan = makePlan(
    [
      '| a        | code-explorer | —              | — | 1 | sequence       |',
      ...verifyRows,
      '| finalize | finalize      | ' + ids.join(',') + ' | — | 1 | sequence       |',
    ],
    [...ledgerRows, '| finalize | pending  |  |']
  );
  const { root, planPath, statePath, cacheDir } = makeProjectDir(plan);
  const io = makeIo();
  const manifestPath = path.join(cacheDir, 'active-batch.json');

  const r = runOpenBatch({
    planPath, statePath, cacheDir, manifestPath, project: 'test-project',
    max: null, fanoutCap: 4, fanoutCapReadonly: 8, shell: realNextActionShell(planPath), ...io,
  });

  assert(r.result === 'ok', 'I3-375: read-only open-batch → ok');
  assert(r.members.length === 8, 'I3-375: read-only batch opens 8 (read-only cap), NOT 4 (write cap), got ' + r.members.length);
  const writtenPlan = fs.readFileSync(planPath, 'utf8');
  assert(/\|\s*v9\s*\|\s*pending\s*\|/.test(writtenPlan) && /\|\s*v10\s*\|\s*pending\s*\|/.test(writtenPlan), 'I3-375: members 9 and 10 left pending (queued beyond the read-only cap of 8)');

  cleanup(root);
}

// ---------------------------------------------------------------------------
// I4: seal-member / seal — flips members to complete and transitions manifest to
//     'sealed' only when ALL members are complete/n/a.
// ---------------------------------------------------------------------------
{
  const plan = makePlan(
    [
      '| a        | code-explorer | —    | — | 1 | sequence       |',
      '| v1       | tdd-guide     | a    | — | 1 | fanout(verify) |',
      '| v2       | tdd-guide     | a    | — | 1 | fanout(verify) |',
      '| finalize | finalize      | v1,v2| — | 1 | sequence       |',
    ],
    [
      '| a        | complete    |  |',
      '| v1       | in_progress |  |',
      '| v2       | in_progress |  |',
      '| finalize | pending     |  |',
    ]
  );
  const { root, planPath, statePath, cacheDir } = makeProjectDir(plan);
  const io = makeIo();
  const manifestPath = path.join(cacheDir, 'active-batch.json');

  // Seed a manifest in 'open' with 2 members + member evidence in .cache.
  const manifest = {
    batchId: 'b-i4', state: 'open', kind: 'read_only',
    members: [
      { id: 'v1', role: 'tdd-guide', declared_write_set: '—', baseline: 'rec', worktreePath: null, sealed: false, joined: false },
      { id: 'v2', role: 'tdd-guide', declared_write_set: '—', baseline: 'rec', worktreePath: null, sealed: false, joined: false },
    ],
    createdAt: '2026-06-07T00:00:00.000Z',
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(cacheDir, 'v1.md'), 'RED: failed\nGREEN: passed\n');
  fs.writeFileSync(path.join(cacheDir, 'v2.md'), 'RED: failed\nGREEN: passed\n');

  // Seal v1 only → manifest member sealed, but manifest NOT yet 'sealed'.
  const r1 = runSealMember({
    planPath, statePath, cacheDir, manifestPath, project: 'test-project',
    nodeId: 'v1', shell: realNextActionShell(planPath), ...io,
  });
  assert(r1.result === 'ok', 'I4: seal-member v1 → ok');
  let m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert(m.members.find(x => x.id === 'v1').sealed === true, 'I4: v1 member.sealed === true');
  assert(m.state !== 'sealed', 'I4: manifest NOT sealed while v2 still open');
  let pl = fs.readFileSync(planPath, 'utf8');
  assert(/\|\s*v1\s*\|\s*complete\s*\|/.test(pl), 'I4: v1 ledger row complete');
  assert(/\|\s*v2\s*\|\s*in_progress\s*\|/.test(pl), 'I4: v2 still in_progress (seal-member does NOT advance)');

  // seal — seal remaining; manifest → 'sealed' once all complete.
  const r2 = runSeal({
    planPath, statePath, cacheDir, manifestPath, project: 'test-project',
    shell: realNextActionShell(planPath), ...io,
  });
  assert(r2.result === 'ok', 'I4: seal → ok');
  assert(r2.state === 'sealed', 'I4: seal returns state sealed when all complete');
  m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert(m.state === 'sealed', 'I4: manifest transitioned to sealed');
  pl = fs.readFileSync(planPath, 'utf8');
  assert(/\|\s*v2\s*\|\s*complete\s*\|/.test(pl), 'I4: v2 ledger row complete after seal');

  cleanup(root);
}

// ---------------------------------------------------------------------------
// I5: join is a no-op for a read-only batch (skipped_read_only) and IDEMPOTENT
//     (running twice = same result). A read-only join must tolerate a 'joined'
//     manifest on the second call (deletion is the orchestrator's job).
// ---------------------------------------------------------------------------
{
  const plan = makePlan(
    [
      '| v1 | tdd-guide | — | — | 1 | fanout(verify) |',
      '| v2 | tdd-guide | — | — | 1 | fanout(verify) |',
    ],
    [
      '| v1 | complete |  |',
      '| v2 | complete |  |',
    ]
  );
  const { root, planPath, statePath, cacheDir } = makeProjectDir(plan);
  const io = makeIo();
  const manifestPath = path.join(cacheDir, 'active-batch.json');

  const manifest = {
    batchId: 'b-i5', state: 'sealed', kind: 'read_only',
    members: [
      { id: 'v1', role: 'tdd-guide', declared_write_set: '—', baseline: 'rec', worktreePath: null, sealed: true, joined: false },
      { id: 'v2', role: 'tdd-guide', declared_write_set: '—', baseline: 'rec', worktreePath: null, sealed: true, joined: false },
    ],
    createdAt: '2026-06-07T00:00:00.000Z',
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const r1 = runJoin({
    planPath, statePath, cacheDir, manifestPath, project: 'test-project',
    shell: realNextActionShell(planPath), ...io,
  });
  assert(r1.result === 'ok', 'I5: join read-only → ok');
  assert(r1.state === 'joined', 'I5: read-only join state joined');
  assert(Array.isArray(r1.skipped_read_only) && r1.skipped_read_only.length === 2,
    'I5: both read-only members skipped (no merge)');
  assert(Array.isArray(r1.joined) && r1.joined.length === 0, 'I5: no write-role members joined');

  // IDEMPOTENT: second call returns the same result even though manifest is now 'joined'.
  const r2 = runJoin({
    planPath, statePath, cacheDir, manifestPath, project: 'test-project',
    shell: realNextActionShell(planPath), ...io,
  });
  assert(r2.result === 'ok', 'I5: second join (manifest already joined) → still ok (idempotent)');
  assert(r2.state === 'joined', 'I5: idempotent join state still joined');
  assert(JSON.stringify(r2.skipped_read_only) === JSON.stringify(r1.skipped_read_only),
    'I5: idempotent join returns the same skipped_read_only');

  cleanup(root);
}

// ---------------------------------------------------------------------------
// I5b: join refuses when manifest is not yet sealed (state open) → not_all_sealed.
// ---------------------------------------------------------------------------
{
  const plan = makePlan(
    [
      '| v1 | tdd-guide | — | — | 1 | fanout(verify) |',
      '| v2 | tdd-guide | — | — | 1 | fanout(verify) |',
    ],
    [
      '| v1 | in_progress |  |',
      '| v2 | in_progress |  |',
    ]
  );
  const { root, planPath, statePath, cacheDir } = makeProjectDir(plan);
  const io = makeIo();
  const manifestPath = path.join(cacheDir, 'active-batch.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    batchId: 'b-i5b', state: 'open', kind: 'read_only',
    members: [
      { id: 'v1', sealed: false, joined: false, declared_write_set: '—' },
      { id: 'v2', sealed: false, joined: false, declared_write_set: '—' },
    ],
    createdAt: '2026-06-07T00:00:00.000Z',
  }, null, 2));

  const r = runJoin({
    planPath, statePath, cacheDir, manifestPath, project: 'test-project',
    shell: realNextActionShell(planPath), ...io,
  });
  assert(r.result === 'refuse', 'I5b: join on open manifest → refuse');
  assert(r.reason === 'not_all_sealed', 'I5b: reason === not_all_sealed');

  cleanup(root);
}

// ---------------------------------------------------------------------------
// I6: status reflects manifest state, and {active:false} when no manifest.
//     Also cross-checks members vs ledger and flags orphan when applicable.
// ---------------------------------------------------------------------------
{
  // No manifest → active:false
  {
    const plan = makePlan(
      [ '| v1 | tdd-guide | — | — | 1 | sequence |' ],
      [ '| v1 | pending |  |' ]
    );
    const { root, planPath, statePath, cacheDir } = makeProjectDir(plan);
    const io = makeIo();
    const manifestPath = path.join(cacheDir, 'active-batch.json');
    const r = runStatus({
      planPath, statePath, cacheDir, manifestPath, project: 'test-project',
      shell: realNextActionShell(planPath), ...io,
    });
    assert(r.result === 'ok', 'I6a: status with no manifest → ok');
    assert(r.active === false, 'I6a: active:false when no manifest');
    cleanup(root);
  }

  // Manifest present + matching in_progress ledger → active:true, valid, not orphan.
  {
    const plan = makePlan(
      [
        '| v1 | tdd-guide | — | — | 1 | fanout(verify) |',
        '| v2 | tdd-guide | — | — | 1 | fanout(verify) |',
      ],
      [
        '| v1 | in_progress |  |',
        '| v2 | in_progress |  |',
      ]
    );
    const { root, planPath, statePath, cacheDir } = makeProjectDir(plan);
    const io = makeIo();
    const manifestPath = path.join(cacheDir, 'active-batch.json');
    fs.writeFileSync(manifestPath, JSON.stringify({
      batchId: 'b-i6', state: 'open', kind: 'read_only',
      members: [{ id: 'v1' }, { id: 'v2' }], createdAt: '2026-06-07T00:00:00.000Z',
    }, null, 2));
    const r = runStatus({
      planPath, statePath, cacheDir, manifestPath, project: 'test-project',
      shell: realNextActionShell(planPath), ...io,
    });
    assert(r.active === true, 'I6b: active:true when manifest present');
    assert(r.state === 'open', 'I6b: status reflects manifest state open');
    assert(r.crossCheck && r.crossCheck.valid === true, 'I6b: cross-check valid (manifest matches in_progress set)');
    assert(r.crossCheck.orphan === false, 'I6b: not orphan');
    cleanup(root);
  }

  // ORPHAN: >1 in_progress rows but NO manifest → status detects orphan.
  {
    const plan = makePlan(
      [
        '| v1 | tdd-guide | — | — | 1 | fanout(verify) |',
        '| v2 | tdd-guide | — | — | 1 | fanout(verify) |',
      ],
      [
        '| v1 | in_progress |  |',
        '| v2 | in_progress |  |',
      ]
    );
    const { root, planPath, statePath, cacheDir } = makeProjectDir(plan);
    const io = makeIo();
    const manifestPath = path.join(cacheDir, 'active-batch.json');
    const r = runStatus({
      planPath, statePath, cacheDir, manifestPath, project: 'test-project',
      shell: realNextActionShell(planPath), ...io,
    });
    assert(r.active === false, 'I6c: no manifest → active:false');
    assert(r.crossCheck && r.crossCheck.orphan === true,
      'I6c: >1 in_progress without a manifest is flagged orphan');
    cleanup(root);
  }
}

// ---------------------------------------------------------------------------
// I7: open-batch on an empty pending frontier (all-done) → defers, no manifest.
// ---------------------------------------------------------------------------
{
  const plan = makePlan(
    [
      '| a   | tdd-guide | — | — | 1 | sequence |',
      '| fin | finalize  | a | — | 1 | sequence |',
    ],
    [
      '| a   | complete |  |',
      '| fin | n/a      |  |',
    ]
  );
  const { root, planPath, statePath, cacheDir } = makeProjectDir(plan);
  const io = makeIo();
  const manifestPath = path.join(cacheDir, 'active-batch.json');
  const r = runOpenBatch({
    planPath, statePath, cacheDir, manifestPath, project: 'test-project',
    max: null, fanoutCap: 4, shell: realNextActionShell(planPath), ...io,
  });
  assert(r.result === 'ok', 'I7: all-done open-batch → ok (defers)');
  assert(r.allDone === true, 'I7: allDone true');
  assert(Array.isArray(r.opened) && r.opened.length === 0, 'I7: nothing opened');
  assert(!fs.existsSync(manifestPath), 'I7: no manifest on empty frontier');
  cleanup(root);
}

// ---------------------------------------------------------------------------
// R1: runSealMember idempotency — sealing an already-sealed member must NOT
//     append a second compliance row. (TDD RED before idempotency guard is added.)
// ---------------------------------------------------------------------------
{
  const plan = makePlan(
    [
      '| a        | code-explorer | —    | — | 1 | sequence       |',
      '| v1       | tdd-guide     | a    | — | 1 | fanout(verify) |',
      '| v2       | tdd-guide     | a    | — | 1 | fanout(verify) |',
      '| finalize | finalize      | v1,v2| — | 1 | sequence       |',
    ],
    [
      '| a        | complete    |  |',
      '| v1       | in_progress |  |',
      '| v2       | in_progress |  |',
      '| finalize | pending     |  |',
    ]
  );
  const { root, planPath, statePath, cacheDir } = makeProjectDir(plan);
  const io = makeIo();
  const manifestPath = path.join(cacheDir, 'active-batch.json');

  const manifest = {
    batchId: 'b-r1', state: 'open', kind: 'read_only',
    members: [
      { id: 'v1', role: 'tdd-guide', declared_write_set: '—', baseline: 'rec', worktreePath: null, sealed: false, joined: false },
      { id: 'v2', role: 'tdd-guide', declared_write_set: '—', baseline: 'rec', worktreePath: null, sealed: false, joined: false },
    ],
    createdAt: '2026-06-07T00:00:00.000Z',
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(cacheDir, 'v1.md'), 'RED: failed\nGREEN: passed\n');
  fs.writeFileSync(path.join(cacheDir, 'v2.md'), 'RED: failed\nGREEN: passed\n');

  // First seal of v1 (should succeed and mark sealed).
  const r1 = runSealMember({
    planPath, statePath, cacheDir, manifestPath, project: 'test-project',
    nodeId: 'v1', shell: realNextActionShell(planPath), ...io,
  });
  assert(r1.result === 'ok', 'R1: first seal-member v1 → ok');

  // Second seal of the SAME (now-sealed) member.
  const r2 = runSealMember({
    planPath, statePath, cacheDir, manifestPath, project: 'test-project',
    nodeId: 'v1', shell: realNextActionShell(planPath), ...io,
  });
  assert(r2.result === 'ok', 'R1: second seal-member (already sealed) → ok');
  assert(r2.alreadySealed === true, 'R1: alreadySealed===true on repeat call');

  // The plan must contain EXACTLY ONE compliance row for v1 (idempotency).
  const planContent = fs.readFileSync(planPath, 'utf8');
  const tddGuideRows = (planContent.match(/\|\s*tdd-guide\s*\(v1\)\s*\|/g) || []).length;
  assert(tddGuideRows === 1, 'R1: exactly ONE compliance row for v1 after double-seal, found ' + tddGuideRows);

  cleanup(root);
}

// ---------------------------------------------------------------------------
// R2: runOpenBatch BASELINES-FIRST atomicity — when commit-node --start fails,
//     the plan file must NOT be written with any flipped (in_progress) rows.
//     (TDD RED before BASELINES-FIRST reorder is applied.)
// ---------------------------------------------------------------------------
{
  const plan = makePlan(
    [
      '| a        | code-explorer | —    | — | 1 | sequence       |',
      '| v1       | tdd-guide     | a    | — | 1 | fanout(verify) |',
      '| v2       | tdd-guide     | a    | — | 1 | fanout(verify) |',
      '| finalize | finalize      | v1,v2| — | 1 | sequence       |',
    ],
    [
      '| a        | complete |  |',
      '| v1       | pending  |  |',
      '| v2       | pending  |  |',
      '| finalize | pending  |  |',
    ]
  );
  const { root, planPath, statePath, cacheDir } = makeProjectDir(plan);
  const io = makeIo();
  const manifestPath = path.join(cacheDir, 'active-batch.json');

  // Shell stub: next-action SUCCEEDS; commit-node --start FAILS (simulates baseline error).
  const shell = (function () {
    const inner = realNextActionShell(planPath);
    return function (scriptPath, args) {
      const base = path.basename(scriptPath);
      if (base === 'kaola-workflow-commit-node.js' && (args || []).includes('--start')) {
        return { exitCode: 1, result: 'refuse', errors: ['R2 stub: baseline intentionally failed'] };
      }
      return inner(scriptPath, args);
    };
  })();

  const r = runOpenBatch({
    planPath, statePath, cacheDir, manifestPath, project: 'test-project',
    max: null, fanoutCap: 4, shell, ...io,
  });

  assert(r.result === 'refuse', 'R2: baseline failure → refuse');
  assert(r.reason === 'baseline_failed', 'R2: reason===baseline_failed');

  // Plan on disk must NOT have any in_progress rows (no orphan ledger flip).
  const writtenPlan = fs.readFileSync(planPath, 'utf8');
  assert(!/\|\s*v1\s*\|\s*in_progress\s*\|/.test(writtenPlan), 'R2: v1 still pending (no orphan flip when baseline fails)');
  assert(!/\|\s*v2\s*\|\s*in_progress\s*\|/.test(writtenPlan), 'R2: v2 still pending (no orphan flip when baseline fails)');
  assert(!fs.existsSync(manifestPath), 'R2: no manifest written when baseline fails (no orphan)');

  cleanup(root);
}

// ---------------------------------------------------------------------------
// R4 site (a): crossCheckStatus with a PARTIAL-SEAL manifest — sealed members
//     must NOT be counted in the in_progress comparison.
//     (TDD RED before the unsealed-filter is applied to crossCheckStatus.)
// ---------------------------------------------------------------------------
{
  // Manifest has 3 members: 'a' is sealed, 'b' and 'c' are unsealed (in_progress).
  // inProgressIds = ['b','c'] — a partial-seal crash-resume scenario.
  const partialSealManifest = {
    batchId: 'b-r4a', state: 'open', kind: 'read_only',
    members: [
      { id: 'a', sealed: true },
      { id: 'b', sealed: false },
      { id: 'c', sealed: false },
    ],
  };

  const result = crossCheckStatus(partialSealManifest, ['b', 'c']);

  assert(result.valid === true, 'R4a: partial-seal manifest with in_progress=unsealed-members → valid (not orphan)');
  assert(result.orphan === false, 'R4a: partial-seal must NOT be flagged orphan_member_set_mismatch');
}

// ---------------------------------------------------------------------------
// #293 align: crossCheckStatus with manifest=[{id:'a',sealed:true}] and
//     inProgressIds=['a'] must return the LEGACY SINGLE-NODE path (valid:true,
//     orphan:false, reason:'single_in_progress'), NOT orphan_member_set_mismatch.
//     Uses the shared fixture from fixtures-orphan-legality.js.
//     (TDD RED before the ip.length<=1 hoist; GREEN after.)
// ---------------------------------------------------------------------------
{
  const manifestObj = { batchId: 'b-293', state: 'open', kind: 'read_only', members: ORPHAN_LEGALITY_MANIFEST };
  const result = crossCheckStatus(manifestObj, ORPHAN_LEGALITY_IN_PROGRESS_IDS);

  assert(result.valid === CROSS_CHECK_EXPECTED.valid,
    '#293: single in_progress with all-sealed manifest → valid:true (legacy single-node path)');
  assert(result.orphan === CROSS_CHECK_EXPECTED.orphan,
    '#293: single in_progress with all-sealed manifest → orphan:false (NOT orphan_member_set_mismatch)');
  assert(result.reason === CROSS_CHECK_EXPECTED.reason,
    '#293: single in_progress with all-sealed manifest → reason:single_in_progress');
}

// ---------------------------------------------------------------------------
// #305: crossCheckStatus with a member.opening:true interrupted top-up (state
//     'open') must report a RECONCILABLE verdict (valid:false, orphan:false,
//     reason:'batch_topup_incomplete') CONSISTENTLY both before the in-flight
//     member's ledger row flips (in_progress=[a,b]) and after it ([a,b,c]).
//     Today: valid_batch before, orphan_member_set_mismatch after (the bug).
//     Uses the shared fixture (anti-drift with the runOrient site).
//     (TDD RED before the member.opening short-circuit; GREEN after.)
// ---------------------------------------------------------------------------
{
  const before = crossCheckStatus(TOPUP_INCOMPLETE_MANIFEST, TOPUP_INCOMPLETE_IN_PROGRESS_BEFORE);
  assert(before.valid === false, '#305: interrupted top-up BEFORE flip → valid:false (not dispatchable)');
  assert(before.orphan === false, '#305: interrupted top-up BEFORE flip → orphan:false (not an orphan)');
  assert(before.reconcilable === true && before.reason === TOPUP_INCOMPLETE_REASON,
    '#305: interrupted top-up BEFORE flip → reconcilable batch_topup_incomplete, got ' + JSON.stringify(before));

  const after = crossCheckStatus(TOPUP_INCOMPLETE_MANIFEST, TOPUP_INCOMPLETE_IN_PROGRESS_AFTER);
  assert(after.valid === false, '#305: interrupted top-up AFTER flip → valid:false (no more valid_batch)');
  assert(after.orphan === false, '#305: interrupted top-up AFTER flip → orphan:false (no more orphan_member_set_mismatch)');
  assert(after.reconcilable === true && after.reason === TOPUP_INCOMPLETE_REASON,
    '#305: interrupted top-up AFTER flip → reconcilable batch_topup_incomplete, got ' + JSON.stringify(after));
}

// ===========================================================================
// END-TO-END WRITE-ROLE TESTS (REAL git via the SUBPROCESS CLI) — issue #292
//
// These drive the ACTUAL `node kaola-workflow-parallel-batch.js <sub> --json`
// binary against a REAL $TMPDIR git repo so the io shim's git invocation
// (gitCheckout, worktree add/remove, snapshot/anchor) is genuinely exercised —
// NOT a mock gitCheckout, NOT an injected git-backed seam that bypasses main().
// cwd MUST be the tmp repo so main()'s getRoot() (git rev-parse --show-toplevel)
// resolves the FIXTURE repo, never the real worktree this suite runs in.
// ===========================================================================

const { execFileSync } = require('child_process');
const BATCH_CLI = path.join(__dirname, 'kaola-workflow-parallel-batch.js');

// Run the parallel-batch CLI as a real subprocess rooted at `repoRoot`.
// Returns { exitCode, ...parsedJson }.
// #320: the write-role worktree e2e tests (E1-E3, N6-N9) exercise the worktree-isolation
// branch, which only opens when the runtime asserts it can force member-worktree CWD. Pass
// CWD1 to their open-batch calls so they keep exercising that branch; the default (env unset)
// now serial-degrades write-role open-batch (proven by E4).
const CWD1 = { KAOLA_BATCH_CWD_ENFORCED: '1' };

function runBatchCli(repoRoot, subArgs, extraEnv) {
  const env = extraEnv ? Object.assign({}, process.env, extraEnv) : process.env;
  try {
    const stdout = execFileSync('node', [BATCH_CLI, ...subArgs], { cwd: repoRoot, encoding: 'utf8', env });
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

// Build a REAL git repo under $TMPDIR with a frozen plan carrying two write-role
// siblings wa (decl wa.js) wb (decl wb.js) depending on complete a, plus finalize.
// Returns { repoRoot, project, planPath, cacheDir }.
function makeRealGitRepo() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-e2e-'));
  const project = 'test-project';
  const projDir = path.join(repoRoot, 'kaola-workflow', project);
  const cacheDir = path.join(projDir, '.cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  const planPath = path.join(projDir, 'workflow-plan.md');
  // #303: the plan carries a code-reviewer gate post-dominating the write nodes + a unique sink so
  // it is a VALID FROZEN plan — open-batch / top-up now run a real `--resume-check` integrity gate
  // before mutating, which refuses a plan that is not frozen (or is structurally invalid). wa,wb
  // remain the only ready frontier (a is complete; review depends on wa,wb).
  const plan = makePlan(
    [
      '| a        | code-explorer | —     | —     | 1 | sequence        |',
      '| wa       | implementer   | a     | wa.js | 1 | fanout(execute) |',
      '| wb       | implementer   | a     | wb.js | 1 | fanout(execute) |',
      '| review   | code-reviewer | wa,wb | —     | 1 | sequence        |',
      '| finalize | finalize      | review| —     | 1 | sequence        |',
    ],
    [
      '| a        | complete    |  |',
      '| wa       | pending     |  |',
      '| wb       | pending     |  |',
      '| review   | pending     |  |',
      '| finalize | pending     |  |',
    ]
  );
  fs.writeFileSync(planPath, plan);
  fs.writeFileSync(path.join(projDir, 'workflow-state.md'), '# State\n');
  // Real git repo: init + identity + initial commit (the seed snapshot needs a HEAD).
  const g = (args) => execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'] });
  g(['init']);
  g(['config', 'user.email', 'kw@test']);
  g(['config', 'user.name', 'kw']);
  g(['config', 'commit.gpgsign', 'false']);
  // Freeze the plan in place (injects plan_hash) so the real --resume-check integrity gate passes.
  const validatorPath = path.join(__dirname, 'kaola-workflow-plan-validator.js');
  execFileSync('node', [validatorPath, planPath, '--freeze', '--json'], { cwd: repoRoot, encoding: 'utf8' });
  fs.writeFileSync(path.join(repoRoot, '.gitignore'), '.kw/\n');
  g(['add', '-A']);
  g(['commit', '-m', 'init']);
  return { repoRoot, project, planPath, cacheDir };
}

function readFileOr(fpath, fallback) {
  try { return fs.readFileSync(fpath, 'utf8'); } catch (_) { return fallback; }
}

// ---------------------------------------------------------------------------
// E1: core write-role open → seal → join with REAL git through the CLI (R3 closed).
//   open-batch provisions a real worktree per write-role member; we write distinct
//   content in each member worktree; seal captures a non-empty mergeRef per member;
//   join checks out `git -C <repoRoot> checkout <mergeRef> -- <decl paths>` so the
//   PARENT worktree actually contains wa.js=="AAA" AND wb.js=="BBB".
//   E1a/E1b assert REAL parent content (NOT merely state:'joined' — that false-green
//   is exactly what current code emits without a real checkout). E1c idempotent.
// ---------------------------------------------------------------------------
{
  const { repoRoot, project } = makeRealGitRepo();
  const proj = ['--project', project, '--json'];

  // open-batch: write-role frontier → real worktrees.
  const open = runBatchCli(repoRoot, ['open-batch', ...proj], CWD1);
  assert(open.result === 'ok', 'E1: open-batch write-role frontier → ok');
  assert(open.kind === 'write_role', 'E1: kind write_role');
  const members = Array.isArray(open.members) ? open.members : [];
  assert(members.length === 2, 'E1: two members opened, got ' + members.length);
  const wa = members.find(m => m.id === 'wa') || {};
  const wb = members.find(m => m.id === 'wb') || {};
  assert(!!wa.worktreePath, 'E1: wa has a non-null worktreePath (R3/dormant join activated)');
  assert(!!wb.worktreePath, 'E1: wb has a non-null worktreePath');
  // Guard: worktrees live UNDER the fixture repo (getRoot resolved the tmp repo, not
  // the real one). git rev-parse --show-toplevel returns the realpath, while mkdtempSync
  // returns the symlinked /var path on macOS — compare against the resolved realpath.
  const repoReal = fs.realpathSync(repoRoot);
  assert(typeof wa.worktreePath === 'string'
    && (wa.worktreePath.indexOf(repoRoot) === 0 || wa.worktreePath.indexOf(repoReal) === 0),
    'E1: wa worktreePath is rooted at the fixture repo (cwd correctly set, not the real worktree)');

  // Write each member's DISJOINT declared file inside its OWN worktree + evidence in parent .cache.
  const parentCache = path.join(repoRoot, 'kaola-workflow', project, '.cache');
  if (wa.worktreePath) fs.writeFileSync(path.join(wa.worktreePath, 'wa.js'), 'AAA');
  if (wb.worktreePath) fs.writeFileSync(path.join(wb.worktreePath, 'wb.js'), 'BBB');
  // #303: evidence shape must match the node ROLE (implementer) — the batch seal now applies the
  // SAME checkEvidenceShape gate as the serial path. (Recorded PARENT-side, the canonical path.)
  fs.writeFileSync(path.join(parentCache, 'wa.md'), 'non_tdd_reason: scaffolding\nbuild-green: npm test passed\n');
  fs.writeFileSync(path.join(parentCache, 'wb.md'), 'non_tdd_reason: scaffolding\nbuild-green: npm test passed\n');

  // seal: member-scoped barrier passes (in-lane) + captures a non-empty mergeRef each.
  const seal = runBatchCli(repoRoot, ['seal', ...proj]);
  assert(seal.result === 'ok', 'E1: seal → ok (member-scoped barrier passes for in-lane writes)');
  assert(seal.state === 'sealed', 'E1: seal state sealed');
  const manifestPath = path.join(parentCache, 'active-batch.json');
  const sealedManifest = JSON.parse(readFileOr(manifestPath, '{"members":[]}'));
  const sm = id => (sealedManifest.members || []).find(m => m.id === id) || {};
  assert(typeof sm('wa').mergeRef === 'string' && sm('wa').mergeRef.length > 0,
    'E1: wa member has a non-empty gc-anchored mergeRef after seal');
  assert(typeof sm('wb').mergeRef === 'string' && sm('wb').mergeRef.length > 0,
    'E1: wb member has a non-empty mergeRef after seal');

  // join: REAL git checkout <mergeRef> -- <paths> into the PARENT worktree.
  const join = runBatchCli(repoRoot, ['join', ...proj]);
  assert(join.result === 'ok', 'E1: join → ok');
  assert(join.state === 'joined', 'E1: join state joined');
  assert(Array.isArray(join.joined) && join.joined.includes('wa') && join.joined.includes('wb'),
    'E1: both write-role members joined');

  // E1a/E1b — the headline anti-false-green proof: REAL parent content landed.
  assert(readFileOr(path.join(repoRoot, 'wa.js'), null) === 'AAA',
    'E1a: PARENT worktree contains wa.js=="AAA" (real checkout landed, not a state-only false-green)');
  assert(readFileOr(path.join(repoRoot, 'wb.js'), null) === 'BBB',
    'E1b: PARENT worktree contains wb.js=="BBB"');

  // E1c — idempotent second join: same ok/joined, content unchanged.
  const join2 = runBatchCli(repoRoot, ['join', ...proj]);
  assert(join2.result === 'ok', 'E1c: second join → still ok (idempotent)');
  assert(join2.state === 'joined', 'E1c: idempotent join state still joined');
  assert(readFileOr(path.join(repoRoot, 'wa.js'), null) === 'AAA', 'E1c: wa.js still AAA after idempotent re-join');

  cleanup(repoRoot);
}

// ---------------------------------------------------------------------------
// E2: no false-green at seal. A write-role member writes a file OUTSIDE its
//   declared set inside its OWN worktree → the MEMBER-SCOPED barrier sees the
//   lane overflow → seal refuses barrier_failed; the member is NOT sealed/joined.
//   (Against parent-scoped seal this overflow is invisible — the false-green twin.)
// ---------------------------------------------------------------------------
{
  const { repoRoot, project } = makeRealGitRepo();
  const proj = ['--project', project, '--json'];

  const open = runBatchCli(repoRoot, ['open-batch', ...proj], CWD1);
  assert(open.result === 'ok', 'E2: open-batch → ok');
  const members = Array.isArray(open.members) ? open.members : [];
  const wa = members.find(m => m.id === 'wa') || {};
  const wb = members.find(m => m.id === 'wb') || {};

  const parentCache = path.join(repoRoot, 'kaola-workflow', project, '.cache');
  // wa writes its OWN file PLUS an out-of-lane production file (intruder.js) — overflow.
  if (wa.worktreePath) {
    fs.writeFileSync(path.join(wa.worktreePath, 'wa.js'), 'AAA');
    fs.writeFileSync(path.join(wa.worktreePath, 'intruder.js'), 'OUT-OF-LANE');
  }
  if (wb.worktreePath) fs.writeFileSync(path.join(wb.worktreePath, 'wb.js'), 'BBB');
  // Valid implementer-shaped evidence so seal-member reaches the BARRIER (the overflow gate) —
  // not short-circuited earlier by the evidence-shape gate.
  fs.writeFileSync(path.join(parentCache, 'wa.md'), 'non_tdd_reason: scaffolding\nbuild-green: ok\n');
  fs.writeFileSync(path.join(parentCache, 'wb.md'), 'non_tdd_reason: scaffolding\nbuild-green: ok\n');

  // seal-member wa → must refuse barrier_failed (member-scoped barrier sees intruder.js).
  const sealWa = runBatchCli(repoRoot, ['seal-member', '--node-id', 'wa', ...proj]);
  assert(sealWa.result === 'refuse', 'E2: seal-member wa with out-of-lane write → refuse (NOT a false-green)');
  assert(sealWa.reason === 'barrier_failed', 'E2: reason barrier_failed (member-scoped barrier saw the overflow)');
  // Airtight: the barrier must refuse for THIS specific overflow (names intruder.js),
  // not for an unrelated reason — proves the member-scoped diff saw the out-of-lane file.
  const barrierErrs = JSON.stringify((sealWa.barrierOut && sealWa.barrierOut.barrierCheck) || sealWa.barrierOut || '');
  assert(barrierErrs.indexOf('intruder.js') >= 0,
    'E2: barrier error names the out-of-lane file intruder.js (the specific overflow, not an unrelated failure)');

  // wa must NOT be sealed or joined in the manifest.
  const manifestPath = path.join(parentCache, 'active-batch.json');
  const m = JSON.parse(readFileOr(manifestPath, '{"members":[]}'));
  const mwa = (m.members || []).find(x => x.id === 'wa') || {};
  assert(mwa.sealed !== true, 'E2: wa member NOT sealed after barrier refusal');
  assert(mwa.joined !== true, 'E2: wa member NOT joined after barrier refusal');

  cleanup(repoRoot);
}

// ---------------------------------------------------------------------------
// E3: degraded fallback. When the worktree capability is unavailable (cwd is a
//   plan dir that is NOT a git repo), open-batch returns degraded with ZERO
//   mutation: result ok, degraded true, reason worktree_unavailable, opened [],
//   no manifest, ledger rows still pending.
// ---------------------------------------------------------------------------
{
  // A project dir WITHOUT git init — next-action is pure (succeeds) but the seed
  // snapshot / worktree add cannot run → degraded.
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-e3-'));
  const project = 'test-project';
  const projDir = path.join(repoRoot, 'kaola-workflow', project);
  fs.mkdirSync(path.join(projDir, '.cache'), { recursive: true });
  const planPath = path.join(projDir, 'workflow-plan.md');
  fs.writeFileSync(planPath, makePlan(
    [
      '| a        | code-explorer | —     | —     | 1 | sequence        |',
      '| wa       | implementer   | a     | wa.js | 1 | fanout(execute) |',
      '| wb       | implementer   | a     | wb.js | 1 | fanout(execute) |',
      '| review   | code-reviewer | wa,wb | —     | 1 | sequence        |',
      '| finalize | finalize      | review| —     | 1 | sequence        |',
    ],
    [
      '| a        | complete |  |',
      '| wa       | pending  |  |',
      '| wb       | pending  |  |',
      '| review   | pending  |  |',
      '| finalize | pending  |  |',
    ]
  ));
  fs.writeFileSync(path.join(projDir, 'workflow-state.md'), '# State\n');
  // #303: freeze in place so the open-batch integrity gate PASSES — this isolates E3 to the
  // worktree-degraded path (no git init → the seed snapshot / worktree add fail → degraded),
  // NOT the integrity path. Freeze needs no git.
  execFileSync('node', [path.join(__dirname, 'kaola-workflow-plan-validator.js'), planPath, '--freeze', '--json'], { cwd: repoRoot, encoding: 'utf8' });

  const proj = ['--project', project, '--json'];
  const open = runBatchCli(repoRoot, ['open-batch', ...proj], CWD1);
  assert(open.result === 'ok', 'E3: degraded open-batch → result ok');
  assert(open.degraded === true, 'E3: degraded === true when worktree capability absent');
  assert(open.reason === 'worktree_unavailable', 'E3: reason worktree_unavailable');
  assert(Array.isArray(open.opened) && open.opened.length === 0, 'E3: opened === [] (zero mutation)');

  // No manifest written; ledger rows still pending (zero mutation).
  const manifestPath = path.join(projDir, '.cache', 'active-batch.json');
  assert(!fs.existsSync(manifestPath), 'E3: no manifest written in degraded mode');
  const writtenPlan = readFileOr(planPath, '');
  assert(/\|\s*wa\s*\|\s*pending\s*\|/.test(writtenPlan), 'E3: wa ledger row still pending (no flip in degraded mode)');
  assert(/\|\s*wb\s*\|\s*pending\s*\|/.test(writtenPlan), 'E3: wb ledger row still pending');

  cleanup(repoRoot);
}

// ===========================================================================
// N-SERIES (#303): rolling bounded dispatch, evidence/vacuity gates, deletion/
// rename join, active-batch precondition, integrity gate, crash reconcile.
// ===========================================================================

// Build a read-only fan-out plan with N siblings under `a` + a review gate + sink.
function makeReadOnlyFanout(n) {
  const sibs = [], rows = [];
  for (let i = 1; i <= n; i++) { sibs.push('f' + i); }
  const nodes = ['| a | code-explorer | — | — | 1 | sequence |']
    .concat(sibs.map(id => `| ${id} | code-explorer | a | — | 1 | fanout(scan) |`))
    .concat([`| review | code-reviewer | ${sibs.join(',')} | — | 1 | sequence |`,
             '| finalize | finalize | review | — | 1 | sequence |']);
  const ledger = ['| a | complete |  |']
    .concat(sibs.map(id => `| ${id} | pending |  |`))
    .concat(['| review | pending |  |', '| finalize | pending |  |']);
  return makePlan(nodes, ledger);
}

// ---------------------------------------------------------------------------
// N1 (#303 gap #3, AC): an OVER-CAP read-only fan-out (6 siblings, FANOUT_CAP=4) opens 4, leaves
// 2 queued, and DRAINS by ROLLING TOP-UP — sealing one frees a slot, top-up opens the next while
// the other running members are STILL in_progress (rolling, not wave-gated), until exhausted.
// ---------------------------------------------------------------------------
{
  const { root, projDir, planPath, statePath, cacheDir } = makeProjectDir(makeReadOnlyFanout(6));
  const io = makeIo();
  const manifestPath = path.join(cacheDir, 'active-batch.json');
  const shell = realNextActionShell(planPath);
  const baseCtx = { planPath, statePath, cacheDir, manifestPath, project: 'test-project', max: null, fanoutCap: 4, shell, ...io };

  const open = runOpenBatch(baseCtx);
  assert(open.result === 'ok' && (open.members || []).length === 4,
    'N1: open-batch opens FANOUT_CAP=4 of the 6-wide frontier, got ' + (open.members || []).length);
  let writtenPlan = fs.readFileSync(planPath, 'utf8');
  assert((writtenPlan.match(/\|\s*f\d\s*\|\s*pending\s*\|/g) || []).length === 2,
    'N1: 2 over-cap siblings stay queued (pending)');

  // Seal ONE member.
  const firstId = open.members[0].id;
  fs.writeFileSync(path.join(cacheDir, firstId + '.md'), 'scanned area; findings recorded');
  const seal1 = runSealMember({ ...baseCtx, nodeId: firstId });
  assert(seal1.result === 'ok' && seal1.sealed === firstId, 'N1: seal one member → ok');

  // TOP-UP: one slot freed (3 running) → opens EXACTLY ONE more; the prior 3 are STILL in_progress.
  const topup = runTopUp(baseCtx);
  assert(topup.result === 'ok' && Array.isArray(topup.toppedUp) && topup.toppedUp.length === 1,
    'N1: rolling top-up opens exactly ONE (capacity 1), got ' + JSON.stringify(topup.toppedUp));
  writtenPlan = fs.readFileSync(planPath, 'utf8');
  assert((writtenPlan.match(/\|\s*f\d\s*\|\s*in_progress\s*\|/g) || []).length === 4,
    'N1: 4 members in_progress CONCURRENTLY after top-up (rolling, the sealed member freed its slot)');
  const newId = topup.toppedUp[0].id;
  assert(new RegExp('\\|\\s*' + newId + '\\s*\\|\\s*in_progress\\s*\\|').test(writtenPlan),
    'N1: the topped-up member is in_progress while the others still run');
  assert((writtenPlan.match(/\|\s*f\d\s*\|\s*pending\s*\|/g) || []).length === 1,
    'N1: 1 sibling still queued after the first top-up (rolling, not all-at-once)');

  // Top-up must NOT pull the downstream review gate into the batch (dependency guard).
  let manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert(!manifest.members.some(m => m.id === 'review'),
    'N1: the downstream review gate is NEVER topped-up into the fan-out batch');

  // DRAIN the rest by rolling seal+top-up until the frontier is exhausted.
  let guard = 0;
  while (guard++ < 20) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const unsealed = manifest.members.filter(m => !m.sealed);
    if (unsealed.length === 0) break;
    const id = unsealed[0].id;
    fs.writeFileSync(path.join(cacheDir, id + '.md'), 'scanned; findings');
    runSealMember({ ...baseCtx, nodeId: id });
    runTopUp(baseCtx);
  }
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert(manifest.members.length === 6 && manifest.members.every(m => m.sealed),
    'N1: all 6 siblings opened + sealed via rolling drain (no wave barrier), got ' + manifest.members.length);
  const drained = runTopUp(baseCtx);
  assert(drained.result === 'ok' && (drained.toppedUp || []).length === 0,
    'N1: top-up is a no-op once the frontier is exhausted (reason: ' + drained.reason + ')');

  cleanup(root);
}

// ---------------------------------------------------------------------------
// N2 (#303 gap #4, AC): batch seal REFUSES when role-shaped evidence is absent or malformed —
// the SAME contract as the serial close-and-open-next. A member cannot become complete with no
// evidence (no false-green at seal).
// ---------------------------------------------------------------------------
{
  const { root, planPath, statePath, cacheDir } = makeProjectDir(makeReadOnlyFanout(2));
  const io = makeIo();
  const manifestPath = path.join(cacheDir, 'active-batch.json');
  const shell = realNextActionShell(planPath);
  const baseCtx = { planPath, statePath, cacheDir, manifestPath, project: 'test-project', max: null, fanoutCap: 4, shell, ...io };

  const open = runOpenBatch(baseCtx);
  const id = open.members[0].id;
  // NO evidence file seeded → seal must refuse.
  const sealNoEv = runSealMember({ ...baseCtx, nodeId: id });
  assert(sealNoEv.result === 'refuse' && sealNoEv.reason === 'evidence_absent',
    'N2 (#319): seal-member with NO evidence → refuse evidence_absent (absent, not the catch-all), got ' + JSON.stringify(sealNoEv));
  // The member is NOT sealed in the manifest.
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert(!(manifest.members.find(m => m.id === id) || {}).sealed, 'N2: member NOT sealed after evidence refusal');
  cleanup(root);
}

// ---------------------------------------------------------------------------
// N3 (#303 gap #6): open-batch refuses an incompatible ACTIVE manifest (no silent overwrite),
// is idempotent for the SAME frontier, and points at reconcile for an 'opening' manifest.
// ---------------------------------------------------------------------------
{
  const { root, planPath, statePath, cacheDir } = makeProjectDir(makeReadOnlyFanout(2));
  const io = makeIo();
  const manifestPath = path.join(cacheDir, 'active-batch.json');
  const shell = realNextActionShell(planPath);
  const baseCtx = { planPath, statePath, cacheDir, manifestPath, project: 'test-project', max: null, fanoutCap: 4, shell, ...io };

  // A stale live manifest for a DIFFERENT frontier must block a fresh open.
  fs.writeFileSync(manifestPath, JSON.stringify({ batchId: 'stale', state: 'open', kind: 'read_only', members: [{ id: 'zzz' }] }, null, 2));
  const blocked = runOpenBatch(baseCtx);
  assert(blocked.result === 'refuse' && blocked.reason === 'active_batch_exists',
    'N3: open-batch refuses an incompatible active manifest, got ' + JSON.stringify(blocked));

  // An 'opening' manifest points at reconcile.
  fs.writeFileSync(manifestPath, JSON.stringify({ batchId: 'mid', state: 'opening', kind: 'read_only', members: [{ id: 'f1' }, { id: 'f2' }] }, null, 2));
  const midOpen = runOpenBatch(baseCtx);
  assert(midOpen.result === 'refuse' && midOpen.reason === 'reconcile_first',
    'N3: open-batch on an opening manifest → reconcile_first, got ' + JSON.stringify(midOpen));

  // Clean open, then a repeat open of the SAME frontier is idempotent (not a refuse).
  fs.unlinkSync(manifestPath);
  const open1 = runOpenBatch(baseCtx);
  assert(open1.result === 'ok' && open1.state === 'open', 'N3: clean open → ok');
  const open2 = runOpenBatch(baseCtx);
  assert(open2.result === 'ok' && open2.idempotent === true,
    'N3: re-opening the SAME frontier is idempotent, got ' + JSON.stringify(open2));
  cleanup(root);
}

// ---------------------------------------------------------------------------
// N4 (#303 gap #8): open-batch / top-up REFUSE and make ZERO mutation when the integrity gate
// (--resume-check) fails — a tampered / non-frozen plan cannot be partially executed.
// ---------------------------------------------------------------------------
{
  const { root, planPath, statePath, cacheDir } = makeProjectDir(makeReadOnlyFanout(2));
  const io = makeIo();
  const manifestPath = path.join(cacheDir, 'active-batch.json');
  // Shell stub: the validator --resume-check FAILS (simulating a tampered/unfrozen plan).
  const failingShell = (scriptPath, args) => {
    const base = path.basename(scriptPath);
    if (base === 'kaola-workflow-plan-validator.js' && (args || []).includes('--resume-check')) {
      return { exitCode: 1, ok: false, reason: 'plan_hash mismatch — workflow-plan.md tampered after freeze' };
    }
    return realNextActionShell(planPath)(scriptPath, args);
  };
  const r = runOpenBatch({ planPath, statePath, cacheDir, manifestPath, project: 'test-project', max: null, fanoutCap: 4, shell: failingShell, ...io });
  assert(r.result === 'refuse' && r.reason === 'plan_integrity_failed',
    'N4: open-batch refuses plan_integrity_failed on a failed resume-check, got ' + JSON.stringify(r));
  assert(!fs.existsSync(manifestPath), 'N4: ZERO mutation — no manifest written on integrity refusal');
  const plan = fs.readFileSync(planPath, 'utf8');
  assert((plan.match(/\|\s*f\d\s*\|\s*in_progress\s*\|/g) || []).length === 0, 'N4: ZERO mutation — no ledger flips');
  cleanup(root);
}

// ---------------------------------------------------------------------------
// N5 (#303 gap #7 / sub-gap B): a crash-interrupted open (manifest 'opening') is RECONCILABLE,
// not an orphan. status flags it; reconcile rolls FORWARD (promote) or --abort rolls BACK.
// ---------------------------------------------------------------------------
{
  const { root, planPath, statePath, cacheDir } = makeProjectDir(makeReadOnlyFanout(2));
  const io = makeIo();
  const manifestPath = path.join(cacheDir, 'active-batch.json');
  const shell = realNextActionShell(planPath);
  const baseCtx = { planPath, statePath, cacheDir, manifestPath, project: 'test-project', max: null, fanoutCap: 4, shell, ...io };

  // Simulate the crash window: manifest written 'opening' with 2 intended members, ledger NOT
  // yet flipped (both rows still pending) — exactly the plan-write/manifest-write gap.
  fs.writeFileSync(manifestPath, JSON.stringify({
    batchId: 'batch-f1-f2', state: 'opening', kind: 'read_only',
    members: [
      { id: 'f1', role: 'code-explorer', declared_write_set: '—', kind: 'read_only', baseline: 'recorded', worktreePath: null, mergeRef: null, sealed: false, joined: false },
      { id: 'f2', role: 'code-explorer', declared_write_set: '—', kind: 'read_only', baseline: 'recorded', worktreePath: null, mergeRef: null, sealed: false, joined: false },
    ], createdAt: '2026-06-08T00:00:00.000Z',
  }, null, 2));

  // status: an 'opening' manifest is RECONCILABLE (not orphan).
  const st = runStatus(baseCtx);
  assert(st.crossCheck && st.crossCheck.reconcilable === true && st.crossCheck.reason === 'batch_opening_incomplete',
    'N5: status flags an opening manifest as reconcilable (not orphan), got ' + JSON.stringify(st.crossCheck));

  // reconcile (roll FORWARD): flips the rows in_progress + promotes 'opening' → 'open'.
  const fwd = runReconcile(baseCtx);
  assert(fwd.result === 'ok' && fwd.reconciled === true && fwd.state === 'open',
    'N5: reconcile rolls forward → open, got ' + JSON.stringify(fwd));
  let plan = fs.readFileSync(planPath, 'utf8');
  assert((plan.match(/\|\s*f\d\s*\|\s*in_progress\s*\|/g) || []).length === 2, 'N5: both intended rows flipped to in_progress after roll-forward');
  let manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert(manifest.state === 'open' && manifest.members.every(m => !m.opening), 'N5: manifest promoted to open, opening flags cleared');

  // Now exercise --abort on a fresh 'opening' (rows flipped) → roll BACK to pending + delete manifest.
  fs.writeFileSync(planPath, fs.readFileSync(planPath, 'utf8')
    .replace(/(\|\s*f1\s*\|\s*)in_progress(\s*\|)/, '$1in_progress$2')); // keep in_progress
  const abort = runReconcile({ ...baseCtx, abort: true, unlink: (f) => fs.unlinkSync(f) });
  // After the roll-forward above the manifest is 'open' (no opening txn) → abort is a no-op there;
  // re-create an 'opening' to abort.
  fs.writeFileSync(manifestPath, JSON.stringify({
    batchId: 'batch-f1-f2', state: 'opening', kind: 'read_only',
    members: [
      { id: 'f1', role: 'code-explorer', declared_write_set: '—', kind: 'read_only', sealed: false, worktreePath: null },
      { id: 'f2', role: 'code-explorer', declared_write_set: '—', kind: 'read_only', sealed: false, worktreePath: null },
    ], createdAt: '2026-06-08T00:00:00.000Z',
  }, null, 2));
  const abort2 = runReconcile({ ...baseCtx, abort: true, unlink: (f) => fs.unlinkSync(f) });
  assert(abort2.result === 'ok' && abort2.reconciled === true && abort2.state === 'aborted',
    'N5: reconcile --abort rolls back + deletes the manifest, got ' + JSON.stringify(abort2));
  assert(!fs.existsSync(manifestPath), 'N5: manifest deleted on whole-batch abort');
  plan = fs.readFileSync(planPath, 'utf8');
  assert((plan.match(/\|\s*f\d\s*\|\s*pending\s*\|/g) || []).length === 2, 'N5: both rows rolled back to pending on abort');
  cleanup(root);
}

// ---------------------------------------------------------------------------
// N6 (#305): a crash-interrupted ROLLING TOP-UP leaves the manifest 'open' with
//     a member.opening:true (NOT the whole-batch 'opening' marker). status must
//     flag it reconcilable (batch_topup_incomplete), and every MUTATING command
//     must refuse with reconcile_first until it is reconciled — never silently
//     mutate over an in-flight top-up.
//     (TDD RED before the member-opening guards; GREEN after.)
// ---------------------------------------------------------------------------
{
  const { root, planPath, statePath, cacheDir } = makeProjectDir(makeReadOnlyFanout(3));
  const io = makeIo();
  const manifestPath = path.join(cacheDir, 'active-batch.json');
  const shell = realNextActionShell(planPath);
  const baseCtx = { planPath, statePath, cacheDir, manifestPath, project: 'test-project', max: null, fanoutCap: 4, shell, ...io };

  // Manifest left mid-top-up: f1,f2 open; f3 appended with opening:true, ledger flip not finished.
  fs.writeFileSync(manifestPath, JSON.stringify({
    batchId: 'batch-f1-f2-f3', state: 'open', kind: 'read_only',
    members: [
      { id: 'f1', role: 'code-explorer', declared_write_set: '—', kind: 'read_only', sealed: false, worktreePath: null },
      { id: 'f2', role: 'code-explorer', declared_write_set: '—', kind: 'read_only', sealed: false, worktreePath: null },
      { id: 'f3', role: 'code-explorer', declared_write_set: '—', kind: 'read_only', sealed: false, worktreePath: null, opening: true },
    ], createdAt: '2026-06-08T00:00:00.000Z',
  }, null, 2));

  const st = runStatus(baseCtx);
  assert(st.crossCheck && st.crossCheck.reconcilable === true && st.crossCheck.reason === 'batch_topup_incomplete',
    'N6: status flags a member.opening:true manifest as reconcilable batch_topup_incomplete, got ' + JSON.stringify(st.crossCheck));

  const op = runOpenBatch(baseCtx);
  assert(op.result === 'refuse' && op.reason === 'reconcile_first', 'N6: open-batch refuses reconcile_first over an opening member, got ' + JSON.stringify(op));
  const tu = runTopUp(baseCtx);
  assert(tu.result === 'refuse' && tu.reason === 'reconcile_first', 'N6: top-up refuses reconcile_first over an opening member, got ' + JSON.stringify(tu));
  const se = runSeal(baseCtx);
  assert(se.result === 'refuse' && se.reason === 'reconcile_first', 'N6: seal refuses reconcile_first over an opening member, got ' + JSON.stringify(se));
  const sm = runSealMember({ ...baseCtx, nodeId: 'f1' });
  assert(sm.result === 'refuse' && sm.reason === 'reconcile_first', 'N6: seal-member refuses reconcile_first over an opening member, got ' + JSON.stringify(sm));
  const jo = runJoin(baseCtx);
  assert(jo.result === 'refuse' && jo.reason === 'reconcile_first', 'N6: join refuses reconcile_first over an opening member, got ' + JSON.stringify(jo));

  cleanup(root);
}

// ===========================================================================
// N-SERIES real-git: write-role seal-vacuity, deletion join, rename join.
// ===========================================================================

// Build a real git repo with a frozen write-role plan whose member wa declares `paths` and the
// repo HEAD already contains `seedFiles` (so deletions/renames have something to remove).
function makeWriteRoleRepo(waDeclared, seedFiles) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-n-'));
  const project = 'test-project';
  const projDir = path.join(repoRoot, 'kaola-workflow', project);
  fs.mkdirSync(path.join(projDir, '.cache'), { recursive: true });
  const planPath = path.join(projDir, 'workflow-plan.md');
  const plan = makePlan(
    [
      '| a        | code-explorer | —     | —          | 1 | sequence        |',
      `| wa       | implementer   | a     | ${waDeclared} | 1 | fanout(execute) |`,
      '| wb       | implementer   | a     | wb.js      | 1 | fanout(execute) |',
      '| review   | code-reviewer | wa,wb | —          | 1 | sequence        |',
      '| finalize | finalize      | review| —          | 1 | sequence        |',
    ],
    ['| a | complete |  |', '| wa | pending |  |', '| wb | pending |  |', '| review | pending |  |', '| finalize | pending |  |']
  );
  fs.writeFileSync(planPath, plan);
  fs.writeFileSync(path.join(projDir, 'workflow-state.md'), '# State\n');
  const g = (args) => execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'] });
  g(['init']); g(['config', 'user.email', 'kw@test']); g(['config', 'user.name', 'kw']); g(['config', 'commit.gpgsign', 'false']);
  for (const [f, content] of Object.entries(seedFiles || {})) fs.writeFileSync(path.join(repoRoot, f), content);
  execFileSync('node', [path.join(__dirname, 'kaola-workflow-plan-validator.js'), planPath, '--freeze', '--json'], { cwd: repoRoot, encoding: 'utf8' });
  fs.writeFileSync(path.join(repoRoot, '.gitignore'), '.kw/\n');
  g(['add', '-A']); g(['commit', '-m', 'init']);
  return { repoRoot, project };
}

// ---------------------------------------------------------------------------
// N6 (#303 gap #13, the #283 seal-vacuity gap): a write-role member that produces NOTHING in its
// own worktree (no-op or leaked-to-parent) seals VACUOUSLY under a writes⊆declared barrier. seal
// now REFUSES empty_member when the member worktree has no in-lane declared changes.
// ---------------------------------------------------------------------------
{
  const { repoRoot, project } = makeWriteRoleRepo('wa.js', {});
  const proj = ['--project', project, '--json'];
  const open = runBatchCli(repoRoot, ['open-batch', ...proj], CWD1);
  assert(open.result === 'ok', 'N6: open-batch → ok');
  const members = Array.isArray(open.members) ? open.members : [];
  const wb = members.find(m => m.id === 'wb') || {};
  // wa writes NOTHING in its worktree (the no-op / parent-leak case). wb writes its file.
  if (wb.worktreePath) fs.writeFileSync(path.join(wb.worktreePath, 'wb.js'), 'BBB');
  const parentCache = path.join(repoRoot, 'kaola-workflow', project, '.cache');
  fs.writeFileSync(path.join(parentCache, 'wa.md'), 'non_tdd_reason: x\nbuild-green: ok\n');
  fs.writeFileSync(path.join(parentCache, 'wb.md'), 'non_tdd_reason: x\nbuild-green: ok\n');

  const sealWa = runBatchCli(repoRoot, ['seal-member', '--node-id', 'wa', ...proj]);
  assert(sealWa.result === 'refuse' && sealWa.reason === 'empty_member',
    'N6: an empty/leaked member worktree → refuse empty_member (no vacuous green seal), got ' + JSON.stringify(sealWa));
  cleanup(repoRoot);
}

// ---------------------------------------------------------------------------
// N7 (#303 gap #5, AC): write-role join handles a DELETION. wa declares wa.js (present in HEAD)
// and DELETES it in its worktree; join `git rm`s it from the PARENT (the pre-#303 blind checkout
// failed `pathspec did not match`).
// ---------------------------------------------------------------------------
{
  const { repoRoot, project } = makeWriteRoleRepo('wa.js', { 'wa.js': 'ORIGINAL', 'wb.js': 'ORIGINAL' });
  const proj = ['--project', project, '--json'];
  const open = runBatchCli(repoRoot, ['open-batch', ...proj], CWD1);
  assert(open.result === 'ok', 'N7: open-batch → ok');
  const members = Array.isArray(open.members) ? open.members : [];
  const wa = members.find(m => m.id === 'wa') || {};
  const wb = members.find(m => m.id === 'wb') || {};
  // wa DELETES its declared file; wb modifies its own.
  if (wa.worktreePath) fs.rmSync(path.join(wa.worktreePath, 'wa.js'), { force: true });
  if (wb.worktreePath) fs.writeFileSync(path.join(wb.worktreePath, 'wb.js'), 'MODIFIED');
  const parentCache = path.join(repoRoot, 'kaola-workflow', project, '.cache');
  fs.writeFileSync(path.join(parentCache, 'wa.md'), 'non_tdd_reason: remove dead file\nbuild-green: ok\n');
  fs.writeFileSync(path.join(parentCache, 'wb.md'), 'non_tdd_reason: x\nbuild-green: ok\n');

  const seal = runBatchCli(repoRoot, ['seal', ...proj]);
  assert(seal.result === 'ok' && seal.state === 'sealed', 'N7: seal a deleting member → ok (in-lane deletion), got ' + JSON.stringify(seal));
  const join = runBatchCli(repoRoot, ['join', ...proj]);
  assert(join.result === 'ok' && join.state === 'joined', 'N7: join with a deletion → ok (no pathspec failure), got ' + JSON.stringify(join));
  assert(!fs.existsSync(path.join(repoRoot, 'wa.js')), 'N7: the deleted declared file is REMOVED from the parent worktree');
  assert(readFileOr(path.join(repoRoot, 'wb.js'), null) === 'MODIFIED', 'N7: the modified declared file landed in the parent');
  cleanup(repoRoot);
}

// ---------------------------------------------------------------------------
// N8 (#303 sub-gap E): write-role join handles a RENAME (old + new BOTH declared). wa declares
// `wa.js,wa-new.js`, deletes wa.js, creates wa-new.js; join rm's the old, checks out the new.
// ---------------------------------------------------------------------------
{
  const { repoRoot, project } = makeWriteRoleRepo('wa.js,wa-new.js', { 'wa.js': 'ORIGINAL', 'wb.js': 'ORIGINAL' });
  const proj = ['--project', project, '--json'];
  const open = runBatchCli(repoRoot, ['open-batch', ...proj], CWD1);
  assert(open.result === 'ok', 'N8: open-batch → ok');
  const members = Array.isArray(open.members) ? open.members : [];
  const wa = members.find(m => m.id === 'wa') || {};
  const wb = members.find(m => m.id === 'wb') || {};
  if (wa.worktreePath) {
    fs.rmSync(path.join(wa.worktreePath, 'wa.js'), { force: true });           // delete old
    fs.writeFileSync(path.join(wa.worktreePath, 'wa-new.js'), 'RENAMED');       // create new
  }
  if (wb.worktreePath) fs.writeFileSync(path.join(wb.worktreePath, 'wb.js'), 'MODIFIED');
  const parentCache = path.join(repoRoot, 'kaola-workflow', project, '.cache');
  fs.writeFileSync(path.join(parentCache, 'wa.md'), 'non_tdd_reason: rename\nbuild-green: ok\n');
  fs.writeFileSync(path.join(parentCache, 'wb.md'), 'non_tdd_reason: x\nbuild-green: ok\n');

  const seal = runBatchCli(repoRoot, ['seal', ...proj]);
  assert(seal.result === 'ok' && seal.state === 'sealed', 'N8: seal a renaming member → ok, got ' + JSON.stringify(seal));
  const join = runBatchCli(repoRoot, ['join', ...proj]);
  assert(join.result === 'ok' && join.state === 'joined', 'N8: join with a rename → ok, got ' + JSON.stringify(join));
  assert(!fs.existsSync(path.join(repoRoot, 'wa.js')), 'N8: the old rename side is removed from the parent');
  assert(readFileOr(path.join(repoRoot, 'wa-new.js'), null) === 'RENAMED', 'N8: the new rename side landed in the parent');
  cleanup(repoRoot);
}

// ---------------------------------------------------------------------------
// N9 (#303 gap #4 + #319, AC "absent OR malformed for each role type"): a write-role member with
// REAL in-lane work but MALFORMED role-shaped evidence (implementer evidence carrying
// non_tdd_reason but NO change-type token) must refuse `evidence_shape_failed` at seal (#319: the
// precise reason, distinct from the absent case) and name the missing token class (change-type) —
// proving the batch seal applies the SAME role-shaped check as the serial path, not just a presence
// check. (Distinct from N2, which proves the ABSENT case `evidence_absent` on a read-only role.)
// ---------------------------------------------------------------------------
{
  const { repoRoot, project } = makeWriteRoleRepo('wa.js', {});
  const proj = ['--project', project, '--json'];
  const open = runBatchCli(repoRoot, ['open-batch', ...proj], CWD1);
  assert(open.result === 'ok', 'N9: open-batch → ok');
  const members = Array.isArray(open.members) ? open.members : [];
  const wa = members.find(m => m.id === 'wa') || {};
  // wa produces REAL in-lane work (so memberDirty would pass) ...
  if (wa.worktreePath) fs.writeFileSync(path.join(wa.worktreePath, 'wa.js'), 'AAA');
  const parentCache = path.join(repoRoot, 'kaola-workflow', project, '.cache');
  // ... but its implementer evidence is MALFORMED: has non_tdd_reason, MISSING a change-type token.
  fs.writeFileSync(path.join(parentCache, 'wa.md'), 'non_tdd_reason: scaffolding only\n');
  const sealWa = runBatchCli(repoRoot, ['seal-member', '--node-id', 'wa', ...proj]);
  assert(sealWa.result === 'refuse' && sealWa.reason === 'evidence_shape_failed',
    'N9 (#319): write-role member with MALFORMED role-shaped evidence → refuse evidence_shape_failed (not the catch-all), got ' + JSON.stringify(sealWa));
  assert(sealWa.missingTokenClass === 'change-type',
    'N9 (#319): refusal names the missing token class (change-type) for the implementer node, got ' + JSON.stringify(sealWa));
  cleanup(repoRoot);
}

// ---------------------------------------------------------------------------
// #320 resolver unit: fail-closed default FALSE; explicit 1/true/yes opts in.
// ---------------------------------------------------------------------------
{
  assert(resolveBatchCwdEnforced({}) === false, '#320: resolver default FALSE (no env)');
  assert(resolveBatchCwdEnforced({ KAOLA_BATCH_CWD_ENFORCED: '1' }) === true, '#320: resolver true on "1"');
  assert(resolveBatchCwdEnforced({ KAOLA_BATCH_CWD_ENFORCED: 'true' }) === true, '#320: resolver true on "true"');
  assert(resolveBatchCwdEnforced({ KAOLA_BATCH_CWD_ENFORCED: '0' }) === false, '#320: resolver false on "0"');
  assert(resolveBatchCwdEnforced({ KAOLA_BATCH_CWD_ENFORCED: 'maybe' }) === false, '#320: resolver false on junk');
}

// ---------------------------------------------------------------------------
// E4 (#320): a write-role open-batch with NO cwd-enforce flag degrades to serial
// BEFORE any provisioning — zero mutation, no member worktree ever created (so none
// can be left empty), no leaked parent writes. Real git repo → worktree capability IS
// present; the gate is the cwd-enforcement flag, not git availability.
// ---------------------------------------------------------------------------
{
  const { repoRoot, project } = makeWriteRoleRepo('wa.js', { 'wa.js': 'ORIGINAL', 'wb.js': 'ORIGINAL' });
  const proj = ['--project', project, '--json'];
  // Default env (KAOLA_BATCH_CWD_ENFORCED unset) → serial degrade.
  const open = runBatchCli(repoRoot, ['open-batch', ...proj]);
  assert(open.result === 'ok', 'E4: write-role open-batch (no cwd-enforce) → result ok');
  assert(open.degraded === true, 'E4: degraded === true (serial fallback before dispatch)');
  assert(open.reason === 'cwd_unenforceable', 'E4: reason cwd_unenforceable, got ' + JSON.stringify(open));
  assert(Array.isArray(open.opened) && open.opened.length === 0, 'E4: opened === [] (zero mutation)');
  // No manifest written, ledger rows still pending, no member worktree created.
  const manifestPath = path.join(repoRoot, 'kaola-workflow', project, '.cache', 'active-batch.json');
  assert(!fs.existsSync(manifestPath), 'E4: NO active-batch.json manifest written (pre-provision degrade)');
  const pl = readFileOr(path.join(repoRoot, 'kaola-workflow', project, 'workflow-plan.md'), '');
  assert(/\|\s*wa\s*\|\s*pending\s*\|/.test(pl), 'E4: wa ledger row still pending (no flip)');
  assert(/\|\s*wb\s*\|\s*pending\s*\|/.test(pl), 'E4: wb ledger row still pending (no flip)');
  assert(!fs.existsSync(path.join(repoRoot, '.kw', 'batch')), 'E4: no member worktree provisioned under .kw/batch');
  cleanup(repoRoot);
}

// ---------------------------------------------------------------------------
// P-321 (#321): freeze-time validator and runtime open-batch AGREE that a coarse-area
// write antichain (n11-n13 shape: distinct files in the SAME coarse area) is RUNNABLE —
// freeze keeps it in-grammar/ask, runtime serial-degrades it (NOT a not_disjoint refuse).
// Alignment is achieved by the runtime no longer refusing, not by freeze newly refusing.
// ---------------------------------------------------------------------------
{
  // RUNTIME pure seam: checkDisjoint still flags coarse-area overlap as RED (the gate the
  // cwd-enforced future mode uses); the alignment is that the default path degrades BEFORE it.
  const dj = checkDisjoint([
    { id: 'na', declared_write_set: 'commands/a.md' },
    { id: 'nb', declared_write_set: 'commands/b.md' },
  ]);
  assert(dj.disjoint === false && dj.verdict === 'red' && /coarse/.test(dj.reasoning || ''),
    'P-321: checkDisjoint flags coarse-area overlap RED (commands/a.md vs commands/b.md), got ' + JSON.stringify(dj));

  // Build a real frozen plan with a coarse-overlap write-role antichain (na, nb both under commands/).
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-321-'));
  const project = 'test-project';
  const projDir = path.join(repoRoot, 'kaola-workflow', project);
  fs.mkdirSync(path.join(projDir, '.cache'), { recursive: true });
  const planPath = path.join(projDir, 'workflow-plan.md');
  fs.writeFileSync(planPath, makePlan(
    [
      '| a        | code-explorer | —     | —             | 1 | sequence |',
      '| na       | implementer   | a     | commands/a.md | 1 | sequence |',
      '| nb       | implementer   | a     | commands/b.md | 1 | sequence |',
      '| review   | code-reviewer | na,nb | —             | 1 | sequence |',
      '| finalize | finalize      | review| —             | 1 | sequence |',
    ],
    ['| a | complete |  |', '| na | pending |  |', '| nb | pending |  |', '| review | pending |  |', '| finalize | pending |  |']
  ));
  fs.writeFileSync(path.join(projDir, 'workflow-state.md'), '# State\n');
  const g = (args) => execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'] });
  g(['init']); g(['config', 'user.email', 'kw@test']); g(['config', 'user.name', 'kw']); g(['config', 'commit.gpgsign', 'false']);
  // FREEZE side: the validator freezes the coarse antichain in-grammar (decision ask), NOT refuse.
  const validatorPath = path.join(__dirname, 'kaola-workflow-plan-validator.js');
  const frozen = JSON.parse(execFileSync('node', [validatorPath, planPath, '--freeze', '--json'], { cwd: repoRoot, encoding: 'utf8' }).trim().split('\n').pop());
  assert(frozen.result === 'in-grammar',
    'P-321 freeze: coarse-area write antichain freezes in-grammar (not refused), got ' + JSON.stringify(frozen));
  assert(frozen.decision === 'ask',
    'P-321 freeze: coarse-area overlap demotes to decision ask, got ' + JSON.stringify(frozen));
  fs.writeFileSync(path.join(repoRoot, '.gitignore'), '.kw/\n');
  g(['add', '-A']); g(['commit', '-m', 'init']);

  // RUNTIME e2e (default, no cwd-enforce): the same coarse antichain frontier serial-degrades,
  // NOT a not_disjoint refuse — this is the alignment (both sides treat it as runnable).
  const proj = ['--project', project, '--json'];
  const open = runBatchCli(repoRoot, ['open-batch', ...proj]);
  assert(open.result === 'ok' && open.degraded === true && open.reason === 'cwd_unenforceable',
    'P-321 runtime: coarse antichain open-batch serial-degrades (not not_disjoint refuse), got ' + JSON.stringify(open));
  // CONTROL: in the cwd-enforced mode the disjointness gate still bites (refuses the coarse overlap).
  const openEnforced = runBatchCli(repoRoot, ['open-batch', ...proj], CWD1);
  assert(openEnforced.result === 'refuse' && openEnforced.reason === 'not_disjoint',
    'P-321 control: with cwd-enforce, coarse overlap still refuses not_disjoint (gate intact for true parallel), got ' + JSON.stringify(openEnforced));
  cleanup(repoRoot);
}

// ---------------------------------------------------------------------------
// I6d (#322): status after a batch joined + manifest removed recommends `orient`, never
// `top-up` (the spurious no_active_batch route); an active open batch recommends `top-up`.
// recommendBatchRoute is the pure seam the orchestrator branches on.
// ---------------------------------------------------------------------------
{
  // Pure-unit: the route table.
  assert(recommendBatchRoute(null, { valid: true, orphan: false, reason: 'idle' }) === 'orient',
    'I6d: no manifest + idle → orient');
  assert(recommendBatchRoute(null, { valid: true, orphan: false, reason: 'single_in_progress' }) === 'orient',
    'I6d: no manifest + single_in_progress (joined+cleared) → orient (never top-up)');
  assert(recommendBatchRoute(null, { valid: false, orphan: true, reason: 'orphan_multi_in_progress' }) === 'reconcile',
    'I6d: no manifest + orphan → reconcile');
  assert(recommendBatchRoute({ state: 'open' }, { valid: true, orphan: false }) === 'top-up',
    'I6d: open + valid_batch → top-up (the only state that legitimizes top-up)');
  assert(recommendBatchRoute({ state: 'joined' }, { valid: true, orphan: false }) === 'orient',
    'I6d: joined-but-uncleared → orient (never top-up)');
  assert(recommendBatchRoute({ state: 'sealed' }, { valid: true }) === 'join',
    'I6d: sealed → join');

  // End-to-end via runStatus: joined + manifest removed (members complete in ledger, no manifest).
  const { root, planPath, statePath, cacheDir } = makeProjectDir(makeReadOnlyFanout(2));
  // Mark the fan-out members complete (the post-join ledger) and remove any manifest.
  let pl = fs.readFileSync(planPath, 'utf8').replace(/\|\s*f1\s*\|\s*pending\s*\|/, '| f1 | complete |').replace(/\|\s*f2\s*\|\s*pending\s*\|/, '| f2 | complete |');
  fs.writeFileSync(planPath, pl);
  const manifestPath = path.join(cacheDir, 'active-batch.json');
  if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath);
  const st = runStatus({ planPath, manifestPath, readFile: (f) => fs.readFileSync(f, 'utf8'), cacheExists: (f) => fs.existsSync(f) });
  assert(st.active === false, 'I6d: joined+cleared → active:false');
  assert(st.nextRoute === 'orient', 'I6d: joined+cleared status recommends orient, got ' + JSON.stringify(st.nextRoute));
  assert(st.nextRoute !== 'top-up', 'I6d: joined+cleared status NEVER recommends top-up (the no_active_batch trap)');
  cleanup(root);
}

// ---------------------------------------------------------------------------
// #317: mutation-time task-mirror sync + machine-readable taskTransitions.
// A shell spy that delegates batch script calls to the real next-action shell but
// intercepts task-mirror (record the call; optionally force a failure).
// ---------------------------------------------------------------------------
function spyMirrorShell(planPath, failMirror) {
  const real = realNextActionShell(planPath);
  const fn = function (sp, a) {
    if (path.basename(sp) === 'kaola-workflow-task-mirror.js') {
      fn.mirrorCalls++;
      return failMirror ? { exitCode: 1, status: 'plan_not_frozen' } : { exitCode: 0, status: 'ok' };
    }
    return real(sp, a);
  };
  fn.mirrorCalls = 0;
  return fn;
}

// #317-1 (AC1+AC2): open-batch over a frozen 2-wide write-role frontier refreshes
// workflow-tasks.json (both members in_progress) and returns one in_progress transition
// per member. CLI path → the REAL task-mirror runs against the frozen plan.
{
  const { repoRoot, project } = makeRealGitRepo();
  const proj = ['--project', project, '--json'];
  const open = runBatchCli(repoRoot, ['open-batch', ...proj], CWD1);
  assert(open.result === 'ok' && open.kind === 'write_role', '#317-1: open-batch write-role → ok');
  assert(Array.isArray(open.taskTransitions) && open.taskTransitions.length === 2,
    '#317-1 (AC2): two taskTransitions returned, got ' + JSON.stringify(open.taskTransitions));
  assert(open.taskTransitions.every(t => t.status === 'in_progress' && t.ledger_status === 'in_progress' && t.reason === 'open-batch'),
    '#317-1 (AC2): each member transition is in_progress/open-batch');
  assert(open.taskMirror && open.taskMirror.status === 'updated', '#317-1 (AC1): taskMirror.status updated, got ' + JSON.stringify(open.taskMirror));
  const tasksPath = path.join(repoRoot, 'kaola-workflow', project, 'workflow-tasks.json');
  assert(fs.existsSync(tasksPath), '#317-1 (AC1): workflow-tasks.json written before dispatch');
  const tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
  const byId = {}; for (const t of tasks.tasks) byId[t.id] = t;
  assert(byId.wa && byId.wa.ledger_status === 'in_progress', '#317-1 (AC1): wa in_progress in durable mirror');
  assert(byId.wb && byId.wb.ledger_status === 'in_progress', '#317-1 (AC1): wb in_progress in durable mirror');
  cleanup(repoRoot);
}

// #317-2 (FAIL-OPEN, load-bearing): a task-mirror refresh failure must NEVER roll back a
// correct ledger transition — result stays ok, taskMirror.status === 'failed', ledger flipped.
{
  const { root, planPath, statePath, cacheDir } = makeProjectDir(makeReadOnlyFanout(2));
  const io = makeIo();
  const manifestPath = path.join(cacheDir, 'active-batch.json');
  const shell = spyMirrorShell(planPath, /* failMirror */ true);
  const r = runOpenBatch({ planPath, statePath, cacheDir, manifestPath, project: 'test-project', max: null, fanoutCap: 4, shell, ...io });
  assert(r.result === 'ok', '#317-2 (fail-open): result STILL ok despite a failed mirror refresh');
  assert(r.taskMirror && r.taskMirror.status === 'failed', '#317-2: taskMirror.status failed is recorded');
  assert(Array.isArray(r.taskTransitions) && r.taskTransitions.length === 2, '#317-2: transitions still returned on mirror failure');
  assert(shell.mirrorCalls === 1, '#317-2: task-mirror was shelled exactly once after the mutation');
  const pl = fs.readFileSync(planPath, 'utf8');
  assert(/\|\s*f1\s*\|\s*in_progress\s*\|/.test(pl) && /\|\s*f2\s*\|\s*in_progress\s*\|/.test(pl),
    '#317-2: ledger rows STILL flipped in_progress (mutation not rolled back by mirror failure)');
  assert(fs.existsSync(manifestPath), '#317-2: manifest STILL written');
  cleanup(root);
}

// #317-3 (AC3/AC6): seal-member → [member→completed]; top-up → [member→in_progress]; both
// shell task-mirror after the mutation (spy confirms the refresh call).
{
  const { root, planPath, statePath, cacheDir } = makeProjectDir(makeReadOnlyFanout(6));
  const io = makeIo();
  const manifestPath = path.join(cacheDir, 'active-batch.json');
  const shell = spyMirrorShell(planPath, false);
  const baseCtx = { planPath, statePath, cacheDir, manifestPath, project: 'test-project', max: null, fanoutCap: 4, shell, ...io };
  const open = runOpenBatch(baseCtx);
  assert(open.taskTransitions.length === 4 && open.taskMirror.status === 'updated', '#317-3: open-batch refresh + 4 transitions');
  const firstId = open.members[0].id;
  fs.writeFileSync(path.join(cacheDir, firstId + '.md'), 'scanned; findings');
  const callsBeforeSeal = shell.mirrorCalls;
  const seal = runSealMember({ ...baseCtx, nodeId: firstId });
  assert(seal.result === 'ok', '#317-3: seal-member ok');
  assert(JSON.stringify(seal.taskTransitions) === JSON.stringify([{ id: firstId, status: 'completed', ledger_status: 'complete', reason: 'seal-member' }]),
    '#317-3 (AC3): seal-member returns [member→completed], got ' + JSON.stringify(seal.taskTransitions));
  assert(shell.mirrorCalls === callsBeforeSeal + 1, '#317-3: seal-member shelled task-mirror after the mutation');
  const callsBeforeTopup = shell.mirrorCalls;
  const topup = runTopUp(baseCtx);
  assert(topup.result === 'ok' && topup.toppedUp.length === 1, '#317-3: top-up opens one');
  assert(topup.taskTransitions.length === 1 && topup.taskTransitions[0].status === 'in_progress' && topup.taskTransitions[0].reason === 'top-up',
    '#317-3 (AC3): top-up returns [member→in_progress], got ' + JSON.stringify(topup.taskTransitions));
  assert(shell.mirrorCalls === callsBeforeTopup + 1, '#317-3: top-up shelled task-mirror after the mutation');
  cleanup(root);
}

// #317-4 (AC3/AC6): reconcile --abort returns rolled-back rows → pending.
{
  const { root, planPath, statePath, cacheDir } = makeProjectDir(makeReadOnlyFanout(2));
  const io = makeIo();
  const manifestPath = path.join(cacheDir, 'active-batch.json');
  const shell = spyMirrorShell(planPath, false);
  const baseCtx = { planPath, statePath, cacheDir, manifestPath, project: 'test-project', max: null, fanoutCap: 4, shell, ...io };
  runOpenBatch(baseCtx);
  // Force an 'opening' transaction marker so reconcile --abort has something to roll back.
  let m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  m.state = 'opening';
  fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2));
  const abort = runReconcile({ ...baseCtx, abort: true, unlink: (f) => fs.unlinkSync(f) });
  assert(abort.result === 'ok' && abort.reconciled === true, '#317-4: reconcile --abort ok');
  assert(Array.isArray(abort.taskTransitions) && abort.taskTransitions.length === m.members.length
    && abort.taskTransitions.every(t => t.status === 'pending' && t.reason === 'reconcile-abort'),
    '#317-4 (AC3): reconcile --abort returns rolled-back rows → pending, got ' + JSON.stringify(abort.taskTransitions));
  cleanup(root);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
if (failed > 0) {
  console.error('parallel-batch tests FAILED (' + failed + ' failures, ' + passed + ' passed)');
  process.exitCode = 1;
} else {
  console.log('parallel-batch tests passed (' + passed + ' assertions)');
}
