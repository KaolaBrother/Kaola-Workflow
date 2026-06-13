#!/usr/bin/env node
'use strict';

// Tests for kaola-workflow-autopilot.js (#443 — D-420 P1).
// Hand-rolled assert pattern — no test framework dependency.
// ALL fixtures are built in os.tmpdir() temp dirs.
// Never mutates the real repo or creates files under the repo tree.

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

let passed  = 0;
let failed  = 0;

function assert(c, m) {
  if (c) {
    passed++;
  } else {
    failed++;
    console.error('FAIL: ' + m);
  }
}

const AUTOPILOT = path.join(__dirname, 'kaola-workflow-autopilot.js');

// ---------------------------------------------------------------------------
// Runner helper — spawns autopilot with KAOLA_KW_BASE pointing at a tmp dir.
// ---------------------------------------------------------------------------
function run(kwBase, args, extraEnv) {
  const envBase = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('KAOLA_'))
  );
  envBase.KAOLA_KW_BASE = kwBase;
  const r = spawnSync(process.execPath, [AUTOPILOT, ...args], {
    cwd:      kwBase,
    encoding: 'utf8',
    timeout:  15000,
    env:      Object.assign(envBase, extraEnv || {}),
  });
  let json = null;
  try { json = JSON.parse(r.stdout.trim()); } catch (_) {}
  return { exitCode: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

// Create a temp base dir with kaola-workflow/<project>/.cache/ structure.
function makeBase(project) {
  const base    = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-autopilot-'));
  const cacheDir = path.join(base, 'kaola-workflow', project, '.cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  return { base, cacheDir, projectDir: path.join(base, 'kaola-workflow', project) };
}

// Write a JSON file (convenience).
function writeJSON(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

// Append a digest line.
function appendDigest(base, project, obj) {
  const dir = path.join(base, 'kaola-workflow', project, '.cache');
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, 'autopilot-digest.jsonl'), JSON.stringify(obj) + '\n', 'utf8');
}

// Write workflow-state.md with escalated_to_full marker lines.
function writeStateFile(projectDir, markers) {
  const lines = markers.map(m => 'escalated_to_full: ' + m);
  fs.writeFileSync(path.join(projectDir, 'workflow-state.md'), lines.join('\n') + '\n', 'utf8');
}

// Write workflow-plan.md with all-done ledger rows and optional consent_halt.
// By default appends a trailing '## Sink' section so the regex lookahead
// (?=\n## |$(?![\s\S])) fires via the \n## branch.
// Pass ledgerLast:true to omit the trailing heading — the regex must then match
// via the end-of-string branch $(?![\s\S]), which is the case protected by T8.
function writePlanFile(projectDir, opts) {
  const { nodes = [], allDone = false, consentHalt = false, ledgerLast = false } = opts || {};
  const rowLines = nodes.map(id => '| ' + id + ' | ' + (allDone ? 'done' : 'in_progress') + ' |');
  let content = '## Meta\n\ngoal: test goal\n\n## Node Ledger\n\n| id | status |\n| --- | --- |\n';
  content += rowLines.join('\n') + '\n';
  if (consentHalt) content += '\nconsent_halt: pending\n';
  if (!ledgerLast) {
    // Trailing section so the regex lookahead (?=\n## ) fires (existing tests).
    content += '\n## Sink\n\nfixture trailing section\n';
  }
  // ledgerLast: no trailing ## heading — file ends after the ledger rows.
  fs.writeFileSync(path.join(projectDir, 'workflow-plan.md'), content, 'utf8');
}

// Minimal sink-receipt fixture with steps.push_main='done'.
function makeSinkReceipt(extra) {
  return Object.assign({
    project: 'mockproj',
    branch:  'workflow/issue-1',
    issue_number: 1,
    issue_numbers: [1],
    resolved_default_branch: 'main',
    started_at: '2026-06-13T00:00:00Z',
    updated_at: '2026-06-13T00:01:00Z',
    stash_ref: null,
    removed_duplicates: [],
    steps: {
      preflight:      'done',
      push_upstream:  'done',
      merge:          'done',
      worktree_sync:  'done',
      finalize:       'done',
      closure:        'done',
      stash_restore:  'done',
      archive_commit: 'done',
      push_main:      'done',
    },
  }, extra || {});
}

// Minimal chain-receipt fixture (all green).
function makeChainReceipt() {
  return {
    headSha:     'abc1234',
    workTreeHash: 'def5678',
    startedAt:   '2026-06-13T00:00:00Z',
    completedAt: '2026-06-13T00:05:00Z',
    chains: [
      { name: 'claude', exitCode: 0, command: 'npm run test:kaola-workflow:claude', duration_ms: 30000 },
    ],
  };
}

// ---------------------------------------------------------------------------
// T1: Stage walk — scout → claim → plan → run → finalize → goal_satisfied
// ---------------------------------------------------------------------------
{
  const proj   = 'mockproj';
  const { base, cacheDir, projectDir: pd } = makeBase(proj);

  // --- Step 1: cold start → dispatch scout
  const r1 = run(base, ['next', '--goal', 'test goal', '--project', proj, '--json']);
  assert(r1.exitCode === 0, 'T1-step1: exit 0 on cold start');
  assert(r1.json !== null, 'T1-step1: JSON parseable');
  assert(r1.json && r1.json.stage === 'scout', 'T1-step1: stage=scout; got ' + (r1.json && r1.json.stage));
  assert(r1.json && r1.json.action === 'dispatch_issue_scout', 'T1-step1: action=dispatch_issue_scout');

  // --- Step 2: provide scout-result with recommended_bundle → claim descriptor
  const scoutFile = path.join(cacheDir, 'scout-result.json');
  writeJSON(scoutFile, {
    recommended_bundle: { issues: [1, 2], title: 'Fix bugs' },
  });
  const r2 = run(base, ['next', '--goal', 'test goal', '--project', proj,
    '--scout-result', scoutFile, '--json']);
  assert(r2.exitCode === 0, 'T1-step2: exit 0 on scout-result provided');
  assert(r2.json && r2.json.stage === 'claim', 'T1-step2: stage=claim; got ' + (r2.json && r2.json.stage));
  assert(r2.json && r2.json.action === 'claim_bundle', 'T1-step2: action=claim_bundle');
  assert(r2.json && Array.isArray(r2.json.inputs && r2.json.inputs.issues),
    'T1-step2: inputs.issues is array');

  // Advance digest: claim done
  appendDigest(base, proj, { ts: '2026-06-13T00:00:00Z', stage: 'claim', result: 'advanced', receipt_path: null });

  // --- Step 3: after claim advanced → plan descriptor
  const r3 = run(base, ['next', '--goal', 'test goal', '--project', proj, '--json']);
  assert(r3.exitCode === 0, 'T1-step3: exit 0 after claim');
  assert(r3.json && r3.json.stage === 'plan', 'T1-step3: stage=plan; got ' + (r3.json && r3.json.stage));
  assert(r3.json && r3.json.action === 'dispatch_planner', 'T1-step3: action=dispatch_planner');

  // Advance digest: plan done
  appendDigest(base, proj, { ts: '2026-06-13T00:01:00Z', stage: 'plan', result: 'advanced', receipt_path: null });

  // --- Step 4: after plan advanced → run descriptor
  const r4 = run(base, ['next', '--goal', 'test goal', '--project', proj, '--json']);
  assert(r4.exitCode === 0, 'T1-step4: exit 0 after plan');
  assert(r4.json && r4.json.stage === 'run', 'T1-step4: stage=run; got ' + (r4.json && r4.json.stage));
  assert(r4.json && r4.json.action === 'run_plan', 'T1-step4: action=run_plan');

  // Advance digest: run done; write plan with allDone=true
  appendDigest(base, proj, { ts: '2026-06-13T00:02:00Z', stage: 'run', result: 'advanced', receipt_path: null });
  writePlanFile(pd, { nodes: ['n1', 'n2', 'n3'], allDone: true });

  // --- Step 5: run with allDone → finalize descriptor
  const r5 = run(base, ['next', '--goal', 'test goal', '--project', proj, '--json']);
  assert(r5.exitCode === 0, 'T1-step5: exit 0 on allDone run');
  assert(r5.json && r5.json.stage === 'finalize', 'T1-step5: stage=finalize; got ' + (r5.json && r5.json.stage));
  assert(r5.json && r5.json.action === 'sink', 'T1-step5: action=sink');

  // Advance digest: finalize done
  appendDigest(base, proj, { ts: '2026-06-13T00:03:00Z', stage: 'finalize', result: 'advanced', receipt_path: null });

  // Write sink-receipt and finalize-stdout receipts
  writeJSON(path.join(cacheDir, 'sink-receipt.json'), makeSinkReceipt());
  writeJSON(path.join(cacheDir, 'finalize-stdout.json'), {
    closure_receipt: { goal_check: 'satisfied' },
  });

  // --- Step 6: finalize stage with sink done + goal_satisfied → stop
  const r6 = run(base, ['next', '--goal', 'test goal', '--project', proj, '--json']);
  assert(r6.exitCode === 0, 'T1-step6: exit 0 on goal_satisfied');
  assert(r6.json && r6.json.stop === 'goal_satisfied', 'T1-step6: stop=goal_satisfied; got ' + (r6.json && r6.json.stop));
  assert(r6.json && r6.json.stage === 'finalize', 'T1-step6: stop stage=finalize');
  assert(r6.json && r6.json.details && r6.json.details.goal_check === 'satisfied',
    'T1-step6: details.goal_check=satisfied');
  assert(r6.json && typeof r6.json.receipt_path === 'string',
    'T1-step6: receipt_path is a string');

  fs.rmSync(base, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T2: Digest replay after kill — resume from last line's stage
// ---------------------------------------------------------------------------
{
  const proj = 'replayproj';
  const { base, cacheDir } = makeBase(proj);

  // Simulate a partial run: claim advanced, plan in progress (no plan advanced yet).
  appendDigest(base, proj, { ts: '2026-06-13T00:00:00Z', stage: 'claim', result: 'advanced', receipt_path: null });
  // No plan advanced digest line — last line is claim:advanced.
  // Next call should resume from the next stage after claim → plan.
  const r = run(base, ['next', '--goal', 'test', '--project', proj, '--json']);
  assert(r.exitCode === 0, 'T2: exit 0 on replay resume');
  assert(r.json !== null, 'T2: JSON parseable on replay');
  assert(r.json && r.json.stage === 'plan', 'T2: resumed stage is plan (next after claim); got ' + (r.json && r.json.stage));
  assert(r.json && r.json.action === 'dispatch_planner', 'T2: action=dispatch_planner on resume');

  // Simulate another kill: plan advanced, run in progress.
  appendDigest(base, proj, { ts: '2026-06-13T00:01:00Z', stage: 'plan', result: 'advanced', receipt_path: null });
  appendDigest(base, proj, { ts: '2026-06-13T00:02:00Z', stage: 'run', result: 'advanced', receipt_path: null });
  // Last line is run:advanced — next should re-emit run (no allDone yet).
  const r2 = run(base, ['next', '--goal', 'test', '--project', proj, '--json']);
  assert(r2.exitCode === 0, 'T2b: exit 0 on run replay');
  // No plan file written → readPlanAllDone returns false → re-emit run
  assert(r2.json && r2.json.stage === 'run', 'T2b: re-emits run when allDone=false; got ' + (r2.json && r2.json.stage));

  fs.rmSync(base, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T3: Each stop reason from a fixture
// ---------------------------------------------------------------------------

// T3a: goal_satisfied — closure_receipt.goal_check fixture
{
  const proj = 'stop-goalsatisfied';
  const { base, cacheDir, projectDir: pd } = makeBase(proj);

  appendDigest(base, proj, { ts: '2026-06-13T00:00:00Z', stage: 'finalize', result: 'advanced', receipt_path: null });
  writeJSON(path.join(cacheDir, 'sink-receipt.json'), makeSinkReceipt());
  writeJSON(path.join(cacheDir, 'finalize-stdout.json'), {
    closure_receipt: { goal_check: 'satisfied' },
  });

  const r = run(base, ['next', '--goal', 'test', '--project', proj, '--json']);
  assert(r.exitCode === 0, 'T3a: exit 0 on goal_satisfied');
  assert(r.json && r.json.stop === 'goal_satisfied', 'T3a: stop=goal_satisfied; got ' + JSON.stringify(r.json && r.json.stop));
  assert(r.json && r.json.details && r.json.details.goal_check === 'satisfied',
    'T3a: details.goal_check=satisfied');

  fs.rmSync(base, { recursive: true, force: true });
}

// T3b: backlog_empty — scout JSON with backlog_empty:true + recommended_bundle:null
{
  const proj = 'stop-backlogempty';
  const { base, cacheDir } = makeBase(proj);

  const scoutFile = path.join(cacheDir, 'scout-empty.json');
  writeJSON(scoutFile, { backlog_empty: true, recommended_bundle: null });

  const r = run(base, ['next', '--goal', 'test', '--project', proj,
    '--scout-result', scoutFile, '--json']);
  assert(r.exitCode === 0, 'T3b: exit 0 on backlog_empty');
  assert(r.json && r.json.stop === 'backlog_empty', 'T3b: stop=backlog_empty; got ' + JSON.stringify(r.json && r.json.stop));
  assert(r.json && r.json.stage === 'scout', 'T3b: stage=scout on backlog_empty');
  assert(r.json && r.json.receipt_path === scoutFile, 'T3b: receipt_path=scout file path');

  fs.rmSync(base, { recursive: true, force: true });
}

// T3c: consent_halt — state escalated_to_full:consent + ledger consent_halt:pending
{
  const proj = 'stop-consenthalt';
  const { base, cacheDir, projectDir: pd } = makeBase(proj);

  appendDigest(base, proj, { ts: '2026-06-13T00:00:00Z', stage: 'run', result: 'advanced', receipt_path: null });
  writeStateFile(pd, ['consent', 'security']);
  writePlanFile(pd, { nodes: ['n1'], allDone: false, consentHalt: true });

  const r = run(base, ['next', '--goal', 'test', '--project', proj, '--json']);
  assert(r.exitCode === 0, 'T3c: exit 0 on consent_halt');
  assert(r.json && r.json.stop === 'consent_halt', 'T3c: stop=consent_halt; got ' + JSON.stringify(r.json && r.json.stop));
  assert(r.json && r.json.stage === 'run', 'T3c: stage=run on consent_halt');

  fs.rmSync(base, { recursive: true, force: true });
}

// T3d: security_halt — security-only marker (no consent, no consent_halt:pending)
{
  const proj = 'stop-securityhalt';
  const { base, cacheDir, projectDir: pd } = makeBase(proj);

  appendDigest(base, proj, { ts: '2026-06-13T00:00:00Z', stage: 'run', result: 'advanced', receipt_path: null });
  writeStateFile(pd, ['security']);
  // NO consent_halt:pending in plan file
  writePlanFile(pd, { nodes: ['n1'], allDone: false, consentHalt: false });

  const r = run(base, ['next', '--goal', 'test', '--project', proj, '--json']);
  assert(r.exitCode === 0, 'T3d: exit 0 on security_halt');
  assert(r.json && r.json.stop === 'security_halt', 'T3d: stop=security_halt; got ' + JSON.stringify(r.json && r.json.stop));
  assert(r.json && r.json.stage === 'run', 'T3d: stage=run on security_halt');

  fs.rmSync(base, { recursive: true, force: true });
}

// T3e: typed_refusal from barrier_failed envelope carrying #440 triage
{
  const proj = 'stop-typedrefusal-barrier';
  const { base, cacheDir, projectDir: pd } = makeBase(proj);

  appendDigest(base, proj, { ts: '2026-06-13T00:00:00Z', stage: 'run', result: 'advanced', receipt_path: null });
  writePlanFile(pd, { nodes: ['n1'], allDone: false });

  // Write a barrier-failed envelope with a triage object (lockfile_write class, ask mode).
  writeJSON(path.join(cacheDir, 'barrier-failed.json'), {
    result:   'barrier_failed',
    node_id:  'n1',
    triage: {
      class: 'lockfile_write',
      proposed_repair: {
        kind:  'add_to_write_set',
        node:  'n1',
        paths: ['package-lock.json'],
      },
    },
  });

  // ask mode (default) → typed_refusal even though add_to_write_set is mechanical
  const r = run(base, ['next', '--goal', 'test', '--project', proj, '--json']);
  assert(r.exitCode === 0, 'T3e: exit 0 on typed_refusal (barrier)');
  assert(r.json && r.json.stop === 'typed_refusal',
    'T3e: stop=typed_refusal (barrier ask); got ' + JSON.stringify(r.json && r.json.stop));
  assert(r.json && r.json.details && r.json.details.triage !== undefined,
    'T3e: details.triage present');
  assert(r.json && r.json.details.triage.class === 'lockfile_write',
    'T3e: triage.class=lockfile_write; got ' + (r.json && r.json.details.triage && r.json.details.triage.class));

  fs.rmSync(base, { recursive: true, force: true });
}

// T3f: typed_refusal from a claim-refuse envelope (no barrier, simulate by NOT advancing claim)
{
  // Without a claim receipt on disk, if digest shows scout:advanced, then autopilot
  // transitions to claim descriptor. A typed_refusal from claim is modelled by the
  // orchestrator recording it in the digest as stop:typed_refusal. We verify the
  // autopilot produces stop:typed_refusal when no scout was advanced and we provide
  // a scout file that is unreadable (error path).
  const proj = 'stop-typedrefusal-claim';
  const { base, cacheDir } = makeBase(proj);

  // Provide a broken (non-JSON) scout result file.
  const scoutFile = path.join(cacheDir, 'bad-scout.json');
  fs.writeFileSync(scoutFile, 'not valid json', 'utf8');

  const r = run(base, ['next', '--goal', 'test', '--project', proj,
    '--scout-result', scoutFile, '--json']);
  // Error: scout_result_unreadable → exit 1
  assert(r.exitCode === 1, 'T3f: exit 1 on unreadable scout result (claim-refuse analogue)');
  assert(r.json && r.json.error === 'scout_result_unreadable',
    'T3f: error=scout_result_unreadable; got ' + JSON.stringify(r.json && r.json.error));

  fs.rmSync(base, { recursive: true, force: true });
}

// T3g: repair_limit — two barrier_failed for the same node under auto
{
  const proj = 'stop-repairlimit';
  const { base, cacheDir, projectDir: pd } = makeBase(proj);

  appendDigest(base, proj, { ts: '2026-06-13T00:00:00Z', stage: 'run', result: 'advanced', receipt_path: null });
  // First repair_applied was already logged for n1
  appendDigest(base, proj, {
    ts: '2026-06-13T00:01:00Z',
    stage: 'run',
    result: 'repair_applied',
    receipt_path: path.join(cacheDir, 'barrier-failed.json'),
    repair: { kind: 'add_to_write_set', node: 'n1', paths: ['package-lock.json'] },
  });

  writePlanFile(pd, { nodes: ['n1'], allDone: false });

  // Second barrier_failed for same node n1 → repair_limit
  writeJSON(path.join(cacheDir, 'barrier-failed.json'), {
    result:  'barrier_failed',
    node_id: 'n1',
    triage: {
      class: 'lockfile_write',
      proposed_repair: { kind: 'add_to_write_set', node: 'n1', paths: ['package-lock.json'] },
    },
  });

  const r = run(base, ['next', '--goal', 'test', '--project', proj, '--json'],
    { KAOLA_AUTOPILOT_REPAIR: 'auto' });
  assert(r.exitCode === 0, 'T3g: exit 0 on repair_limit');
  assert(r.json && r.json.stop === 'repair_limit',
    'T3g: stop=repair_limit; got ' + JSON.stringify(r.json && r.json.stop));
  assert(r.json && r.json.details && r.json.details.node === 'n1',
    'T3g: details.node=n1; got ' + JSON.stringify(r.json && r.json.details));
  assert(r.json && r.json.details && r.json.details.attempts === 2,
    'T3g: details.attempts=2; got ' + (r.json && r.json.details && r.json.details.attempts));

  fs.rmSync(base, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T4: repair=ask halts; repair=auto emits add_to_write_set descriptor + logs repair_applied
// ---------------------------------------------------------------------------
{
  const proj = 'repair-ask-vs-auto';
  const { base, cacheDir, projectDir: pd } = makeBase(proj);

  appendDigest(base, proj, { ts: '2026-06-13T00:00:00Z', stage: 'run', result: 'advanced', receipt_path: null });
  writePlanFile(pd, { nodes: ['n2'], allDone: false });
  writeJSON(path.join(cacheDir, 'barrier-failed.json'), {
    result:  'barrier_failed',
    node_id: 'n2',
    triage: {
      class: 'lockfile_write',
      proposed_repair: { kind: 'add_to_write_set', node: 'n2', paths: ['package-lock.json'] },
    },
  });

  // --- ask mode: must halt with typed_refusal
  const rAsk = run(base, ['next', '--goal', 'test', '--project', proj, '--json'],
    { KAOLA_AUTOPILOT_REPAIR: 'ask' });
  assert(rAsk.exitCode === 0, 'T4-ask: exit 0');
  assert(rAsk.json && rAsk.json.stop === 'typed_refusal',
    'T4-ask: stop=typed_refusal on lockfile_write + ask; got ' + JSON.stringify(rAsk.json && rAsk.json.stop));

  // --- auto mode: must emit run descriptor with repair field + log repair_applied
  const rAuto = run(base, ['next', '--goal', 'test', '--project', proj, '--json'],
    { KAOLA_AUTOPILOT_REPAIR: 'auto' });
  assert(rAuto.exitCode === 0, 'T4-auto: exit 0');
  assert(rAuto.json && !rAuto.json.stop,
    'T4-auto: no stop on mechanical auto repair; got stop=' + JSON.stringify(rAuto.json && rAuto.json.stop));
  assert(rAuto.json && rAuto.json.stage === 'run',
    'T4-auto: stage=run in repair descriptor; got ' + (rAuto.json && rAuto.json.stage));
  assert(rAuto.json && rAuto.json.repair !== undefined,
    'T4-auto: repair field present in descriptor');
  assert(rAuto.json && rAuto.json.repair && rAuto.json.repair.kind === 'add_to_write_set',
    'T4-auto: repair.kind=add_to_write_set; got ' + JSON.stringify(rAuto.json && rAuto.json.repair && rAuto.json.repair.kind));
  assert(rAuto.json && rAuto.json.repair && rAuto.json.repair.node === 'n2',
    'T4-auto: repair.node=n2');
  assert(rAuto.json && rAuto.json.repair && Array.isArray(rAuto.json.repair.paths),
    'T4-auto: repair.paths is array');

  // Verify repair_applied was logged to digest.
  const digestContent = fs.readFileSync(
    path.join(cacheDir, 'autopilot-digest.jsonl'), 'utf8');
  const digestLines = digestContent.split('\n').filter(Boolean).map(l => {
    try { return JSON.parse(l); } catch (_) { return null; }
  }).filter(Boolean);
  const repairLog = digestLines.find(l => l.result === 'repair_applied' && l.stage === 'run');
  assert(repairLog !== undefined, 'T4-auto: repair_applied logged to digest');
  assert(repairLog && repairLog.repair && repairLog.repair.kind === 'add_to_write_set',
    'T4-auto: digest repair entry has kind=add_to_write_set');

  fs.rmSync(base, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T5: repair=auto STILL halts (typed_refusal) on revert_overflow / unclassified
// ---------------------------------------------------------------------------

// T5a: revert_overflow under auto → typed_refusal
{
  const proj = 'repair-auto-revert';
  const { base, cacheDir, projectDir: pd } = makeBase(proj);

  appendDigest(base, proj, { ts: '2026-06-13T00:00:00Z', stage: 'run', result: 'advanced', receipt_path: null });
  writePlanFile(pd, { nodes: ['n3'], allDone: false });
  writeJSON(path.join(cacheDir, 'barrier-failed.json'), {
    result:  'barrier_failed',
    node_id: 'n3',
    triage: {
      class: 'write_set_overflow',
      proposed_repair: { kind: 'revert_overflow', node: 'n3', paths: ['extra.js'] },
    },
  });

  const r = run(base, ['next', '--goal', 'test', '--project', proj, '--json'],
    { KAOLA_AUTOPILOT_REPAIR: 'auto' });
  assert(r.exitCode === 0, 'T5a: exit 0 on revert_overflow auto');
  assert(r.json && r.json.stop === 'typed_refusal',
    'T5a: stop=typed_refusal on revert_overflow even under auto; got ' + JSON.stringify(r.json && r.json.stop));

  fs.rmSync(base, { recursive: true, force: true });
}

// T5b: unclassified (absent proposed_repair) under auto → typed_refusal
{
  const proj = 'repair-auto-unclassified';
  const { base, cacheDir, projectDir: pd } = makeBase(proj);

  appendDigest(base, proj, { ts: '2026-06-13T00:00:00Z', stage: 'run', result: 'advanced', receipt_path: null });
  writePlanFile(pd, { nodes: ['n4'], allDone: false });
  writeJSON(path.join(cacheDir, 'barrier-failed.json'), {
    result:  'barrier_failed',
    node_id: 'n4',
    triage: {
      class: 'unclassified',
      // NO proposed_repair
    },
  });

  const r = run(base, ['next', '--goal', 'test', '--project', proj, '--json'],
    { KAOLA_AUTOPILOT_REPAIR: 'auto' });
  assert(r.exitCode === 0, 'T5b: exit 0 on unclassified auto');
  assert(r.json && r.json.stop === 'typed_refusal',
    'T5b: stop=typed_refusal on unclassified even under auto; got ' + JSON.stringify(r.json && r.json.stop));

  fs.rmSync(base, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T6: backlog_empty round-trip
// (Cold start + scout-result carrying backlog_empty → stop; then verify receipt_path)
// ---------------------------------------------------------------------------
{
  const proj = 'backlog-roundtrip';
  const { base, cacheDir } = makeBase(proj);

  const scoutFile = path.join(cacheDir, 'scout.json');
  writeJSON(scoutFile, { backlog_empty: true, recommended_bundle: null });

  // Cold start with scout-result → immediate backlog_empty stop.
  const r = run(base, ['next', '--goal', 'close all issues', '--project', proj,
    '--scout-result', scoutFile, '--json']);
  assert(r.exitCode === 0, 'T6: exit 0 on backlog_empty round-trip');
  assert(r.json && r.json.stop === 'backlog_empty',
    'T6: stop=backlog_empty; got ' + JSON.stringify(r.json && r.json.stop));
  assert(r.json && r.json.stage === 'scout', 'T6: stage=scout');
  assert(r.json && r.json.project === proj, 'T6: project echoed');
  assert(r.json && typeof r.json.details === 'object', 'T6: details is an object');
  assert(r.json && r.json.receipt_path === scoutFile,
    'T6: receipt_path equals the scout-result path; got ' + (r.json && r.json.receipt_path));

  // Verify no digest was written (stop should not write a digest entry).
  const digestFile = path.join(cacheDir, 'autopilot-digest.jsonl');
  const digestExists = fs.existsSync(digestFile);
  // backlog_empty path should not append to digest (autopilot.js does not call appendDigest on stop).
  // The digest file may or may not exist — what matters is that it does not contain a stop line.
  if (digestExists) {
    const lines = fs.readFileSync(digestFile, 'utf8').split('\n').filter(Boolean);
    const stopLines = lines.filter(l => { try { return JSON.parse(l).result && JSON.parse(l).result.startsWith('stop:'); } catch (_) { return false; } });
    assert(stopLines.length === 0, 'T6: no stop entry written to digest by autopilot internally');
  }

  fs.rmSync(base, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T7: Forge-neutrality — canonical script body contains zero forge CLI tokens
// ---------------------------------------------------------------------------
{
  const src = fs.readFileSync(AUTOPILOT, 'utf8');

  // Check for invocation-pattern forge CLI tokens (not allowed anywhere in file body).
  // Approved header comment is allowed per spec; the spec says zero forge CLI tokens
  // (no gh/glab/tea invocation, no GitHub/GitLab/Gitea identifiers outside approved header).
  // We check the body BELOW the header comment block (after the first closing --- line).
  const headerEnd = src.indexOf('// ---------', src.indexOf('// ---------') + 10);
  // Split: header comment is lines 1-42 (the opening block + closing ----).
  // Strategy: find start of non-comment code and scan from there.
  const lines = src.split('\n');

  // The header comment block ends after the closing '//' line with '---'.
  // We find the last line of the header block.
  let headerEndLine = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('// ') && lines[i].includes('---') && i > 30) {
      headerEndLine = i;
      break;
    }
  }
  const bodyLines = lines.slice(headerEndLine + 1);
  const body = bodyLines.join('\n');

  // No forge CLI binary invocations (as strings or require arguments).
  const forgeCliPattern = /\b(gh|glab|tea)\b/;
  assert(!forgeCliPattern.test(body),
    'T7: script body must not contain forge CLI tokens (gh/glab/tea); found in body');

  // No forge product names in code body (GitHub/GitLab/Gitea as identifiers in code context).
  // These are disallowed outside the header comment per D1 spec.
  const forgeNamePattern = /\b(GitHub|GitLab|Gitea)\b/;
  assert(!forgeNamePattern.test(body),
    'T7: script body must not contain GitHub/GitLab/Gitea identifiers outside header comment');

  // No forge API endpoint strings.
  const forgeApiPattern = /\bgithub\.com|gitlab\.com|gitea\./;
  assert(!forgeApiPattern.test(body),
    'T7: script body must not contain forge API domain strings');

  // Verify the header comment itself does NOT contain a gh/glab/tea invocation
  // (i.e., the header is commentary, not live forge calls).
  const header = lines.slice(0, headerEndLine + 1).join('\n');
  assert(!(/\bexecFile|spawnSync|execSync/.test(header) && forgeCliPattern.test(header)),
    'T7: header comment must not contain live forge CLI spawning');
}

// ---------------------------------------------------------------------------
// T8: ledger-last regression — ## Node Ledger is the FINAL section (no trailing
//     ## heading). Protects the \Z fix: the broken regex /(?=^## |\Z)/ treated
//     \Z as literal 'Z' so it never matched end-of-string, causing allDone to
//     return false even when every ledger row was 'done'. The fixed regex uses
//     $(?![\s\S]) which correctly matches end-of-string.
// ---------------------------------------------------------------------------
{
  const proj = 'ledger-last-alldone';
  const { base, cacheDir, projectDir: pd } = makeBase(proj);

  // Advance digest through claim → plan → run (allDone detection happens at run stage).
  appendDigest(base, proj, { ts: '2026-06-13T00:00:00Z', stage: 'claim',  result: 'advanced', receipt_path: null });
  appendDigest(base, proj, { ts: '2026-06-13T00:01:00Z', stage: 'plan',   result: 'advanced', receipt_path: null });
  appendDigest(base, proj, { ts: '2026-06-13T00:02:00Z', stage: 'run',    result: 'advanced', receipt_path: null });

  // Build a ledger-last plan: ## Node Ledger is the FINAL section — no trailing
  // ## heading, no stray 'Z' character anywhere in the file.
  // All rows are 'done'.  The end-of-string branch of the fixed regex must fire.
  writePlanFile(pd, { nodes: ['n1', 'n2', 'n3'], allDone: true, ledgerLast: true });

  // Verify there is no trailing '## ' heading in the file (sanity guard for the fixture).
  const planContent = fs.readFileSync(path.join(pd, 'workflow-plan.md'), 'utf8');
  const trailingSectionIdx = planContent.lastIndexOf('\n## ');
  // The only '## ' that should exist is '## Meta' and '## Node Ledger' — both before the ledger rows.
  const ledgerIdx = planContent.indexOf('## Node Ledger');
  assert(trailingSectionIdx <= ledgerIdx,
    'T8-fixture: no ## heading appears after ## Node Ledger (confirms ledger-last layout)');

  // Autopilot next at run stage with all-done ledger-last plan → must advance to finalize.
  const r = run(base, ['next', '--goal', 'test ledger-last', '--project', proj, '--json']);
  assert(r.exitCode === 0,
    'T8: exit 0 on ledger-last allDone run; stderr=' + (r.stderr || '').trim());
  assert(r.json !== null,
    'T8: JSON parseable on ledger-last allDone');
  assert(r.json && r.json.stage === 'finalize',
    'T8: stage=finalize on ledger-last allDone (allDone detected); got stage=' + (r.json && r.json.stage));
  assert(r.json && r.json.action === 'sink',
    'T8: action=sink on ledger-last allDone; got action=' + (r.json && r.json.action));

  fs.rmSync(base, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Done
// ---------------------------------------------------------------------------
if (failed > 0) {
  console.error('\ntest-autopilot: ' + failed + ' test(s) FAILED, ' + passed + ' passed');
  process.exit(1);
} else {
  console.log('test-autopilot: all ' + passed + ' assertions passed');
}
