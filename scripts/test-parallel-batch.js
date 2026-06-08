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
  runSealMember,
  runSeal,
  runJoin,
  runStatus,
} = require('./kaola-workflow-parallel-batch');

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
  assert(JSON.stringify(BATCH_STATES) === JSON.stringify(['open', 'dispatched', 'sealed', 'joining', 'joined']),
    'P1: BATCH_STATES === [open,dispatched,sealed,joining,joined]');
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

  const r = runOpenBatch({
    planPath, statePath, cacheDir, manifestPath, project: 'test-project',
    max: null, fanoutCap: 4, shell: realNextActionShell(planPath), ...io,
  });

  assert(r.result === 'refuse', 'I2: overlapping write-role frontier → refuse');
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
function runBatchCli(repoRoot, subArgs) {
  try {
    const stdout = execFileSync('node', [BATCH_CLI, ...subArgs], { cwd: repoRoot, encoding: 'utf8' });
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
  const plan = makePlan(
    [
      '| a        | code-explorer | —    | —     | 1 | sequence        |',
      '| wa       | implementer   | a    | wa.js | 1 | fanout(execute) |',
      '| wb       | implementer   | a    | wb.js | 1 | fanout(execute) |',
      '| finalize | finalize      | wa,wb| —     | 1 | sequence        |',
    ],
    [
      '| a        | complete    |  |',
      '| wa       | pending     |  |',
      '| wb       | pending     |  |',
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
  const open = runBatchCli(repoRoot, ['open-batch', ...proj]);
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
  fs.writeFileSync(path.join(parentCache, 'wa.md'), 'RED: x\nGREEN: y\n');
  fs.writeFileSync(path.join(parentCache, 'wb.md'), 'RED: x\nGREEN: y\n');

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

  const open = runBatchCli(repoRoot, ['open-batch', ...proj]);
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
  fs.writeFileSync(path.join(parentCache, 'wa.md'), 'RED: x\nGREEN: y\n');
  fs.writeFileSync(path.join(parentCache, 'wb.md'), 'RED: x\nGREEN: y\n');

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
      '| a        | code-explorer | —    | —     | 1 | sequence        |',
      '| wa       | implementer   | a    | wa.js | 1 | fanout(execute) |',
      '| wb       | implementer   | a    | wb.js | 1 | fanout(execute) |',
      '| finalize | finalize      | wa,wb| —     | 1 | sequence        |',
    ],
    [
      '| a        | complete |  |',
      '| wa       | pending  |  |',
      '| wb       | pending  |  |',
      '| finalize | pending  |  |',
    ]
  ));
  fs.writeFileSync(path.join(projDir, 'workflow-state.md'), '# State\n');

  const proj = ['--project', project, '--json'];
  const open = runBatchCli(repoRoot, ['open-batch', ...proj]);
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

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
if (failed > 0) {
  console.error('parallel-batch tests FAILED (' + failed + ' failures, ' + passed + ' passed)');
  process.exitCode = 1;
} else {
  console.log('parallel-batch tests passed (' + passed + ' assertions)');
}
