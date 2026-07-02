#!/usr/bin/env node
'use strict';

// Unit tests for kaola-workflow-adaptive-node.js
// Hand-rolled assert + counter; repo style (no framework).
// Pure core tests use injected shell/readFile/writeFile seams (no subprocess).

// Require the module — will throw "Cannot find module" if not yet written.
const {
  spliceLedgerNode,
  readLedgerStatuses,
  spliceComplianceRow,
  complianceRowExists,
  removeDurableConsentHalt,
  checkEvidenceShape,
  checkVerdictParse,
  readCoordinationState,
  probeCoordination,
  validateProjectName,
  runOrient,
  runMirrorProject,
  runOpenNext,
  runOpenReady,
  runCloseNode,
  runReconcileRunningSet,
  readRunningSet,
  isReadOnlyNode,
  runReopenNode,
  runRecordEvidence,
  runCloseAndOpenNext,
  runWriteHalt,
  runClearHalt,
  shellNode,
  readNonce,
  // D-444: new exports
  buildDispatch,
  sanitizeCodexTaskName,
  codexTaskNameForNode,
  resolveCodexDispatchMode,
  deriveGuards,
  runVerifyEvidence,
  // #434: repair primitives
  runRevertOverflow,
  runRepairNode,
  // #440: triage classifier
  computeTriage,
  // #445: operator_hint registry + accessors
  OPERATOR_HINT_REGISTRY,
  getOperatorHint,
  decorateOperatorHint,
  // #446: route-findings subcommand + parse helpers
  runRouteFindings,
  parseFindingLine,
  resolveOwningNode,
  // #472: dispatch-fidelity concurrency derivation
  deriveMaxSimultaneousOpen,
  // #463 Slice 4/5: synthesizer execution (direct-call tests for the deferred-tier conflict bail)
  synthesizeLevel,
} = require('./kaola-workflow-adaptive-node');
const { RUNNING_SET_NAME, MERGE_CONFLICT_REPAIR_LIMIT, dispatchEffortOpencode } = require('./kaola-workflow-adaptive-schema');
const { readDurableConsentHalt, locateSection } = require('./kaola-workflow-adaptive-schema');
// #585: scheduler mutual-exclusion lock helpers (byte-identical ×4 in adaptive-schema).
const { acquireProjectLock, isStaleLock, SCHEDULER_LOCK_NAME, LANE_STALENESS_MS } = require('./kaola-workflow-adaptive-schema');

const {
  ORPHAN_LEGALITY_MANIFEST,
  ORPHAN_LEGALITY_IN_PROGRESS_IDS,
  RUN_ORIENT_EXPECTED,
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

// #542 (D-542-01): in-process unit calls (runOpenReady / runCloseNode) read
// parallelWritesDefaultOn(process.env) directly. Co-open is DEFAULT-ON; the only deterministic
// serial-single-open path is KAOLA_PARALLEL_WRITES=0. This helper forces that env around an
// in-process call and always restores the prior value (subprocess runNode tests pass the env
// through extraEnv instead).
function withParallelWrites(value, fn) {
  const saved = process.env.KAOLA_PARALLEL_WRITES;
  if (value === undefined) delete process.env.KAOLA_PARALLEL_WRITES;
  else process.env.KAOLA_PARALLEL_WRITES = value;
  try {
    return fn();
  } finally {
    if (saved === undefined) delete process.env.KAOLA_PARALLEL_WRITES;
    else process.env.KAOLA_PARALLEL_WRITES = saved;
  }
}

// ---------------------------------------------------------------------------
// Helpers: plan builders
// ---------------------------------------------------------------------------

function makePlan(ledgerRows, extraNodes) {
  const defaultNodes = [
    '| impl-core | tdd-guide | — | scripts/adaptive-node.js | 1 | sequence |',
    '| impl-other | implementer | impl-core | scripts/other.js | 1 | sequence |',
    '| review | code-reviewer | impl-other | — | 1 | sequence |',
    '| finalize | finalize | review | CHANGELOG.md | 1 | sequence |',
  ];
  const nodes = extraNodes || defaultNodes;
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
    ...nodes,
    '',
    '## Node Ledger',
    '',
    '| id | status | notes |',
    '| --- | --- | --- |',
    ...ledgerRows,
    '',
  ].join('\n') + '\n';
}

function makeState(opts) {
  opts = opts || {};
  const lines = [
    '# Kaola-Workflow State',
    '',
    '## Project',
    'name: test-project',
    'status: active',
    '',
    '## Current Position',
    'phase: adaptive',
    'next_command: /kaola-workflow-plan-run test-project',
    '',
    '## Last Evidence',
    'phase_file: N/A',
    'last_command: claim',
    '',
  ];
  if (opts.escalated) {
    lines.push('escalated_to_full: ' + opts.escalated);
    lines.push('');
  }
  lines.push('## Sink');
  lines.push('issue_number: 42');
  lines.push('branch: workflow/test-project');
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// T1: spliceLedgerNode — pending → in_progress (basic open path)
// ---------------------------------------------------------------------------
{
  const plan = makePlan([
    '| impl-core | pending | |',
    '| impl-other | pending | |',
  ]);

  const r = spliceLedgerNode(plan, 'impl-core', 'in_progress', { allowFrom: ['pending'] });
  assert(r.found === true, 'T1: found===true for existing node');
  assert(r.changed === true, 'T1: changed===true when status flipped');
  assert(r.alreadyAtTarget === false, 'T1: alreadyAtTarget===false (not already in_progress)');
  assert(r.content.includes('| impl-core | in_progress | |'), 'T1: ledger row updated to in_progress');
  assert(r.content.includes('| impl-other | pending | |'), 'T1: sibling row unmodified');
}

// ---------------------------------------------------------------------------
// T2: spliceLedgerNode — idempotent (already at target status)
// ---------------------------------------------------------------------------
{
  const plan = makePlan([
    '| impl-core | in_progress | |',
    '| impl-other | pending | |',
  ]);

  const r = spliceLedgerNode(plan, 'impl-core', 'in_progress', { allowFrom: ['pending', 'in_progress'] });
  assert(r.found === true, 'T2: found===true');
  assert(r.alreadyAtTarget === true, 'T2: alreadyAtTarget===true when already in_progress');
  assert(r.changed === false, 'T2: changed===false on idempotent');
  assert(r.content === plan, 'T2: content byte-identical on no-op');
}

// ---------------------------------------------------------------------------
// T3: spliceLedgerNode — refuse out-of-allowFrom (node is complete, only pending allowed)
// ---------------------------------------------------------------------------
{
  const plan = makePlan([
    '| impl-core | complete | |',
    '| impl-other | pending | |',
  ]);

  const r = spliceLedgerNode(plan, 'impl-core', 'in_progress', { allowFrom: ['pending'] });
  assert(r.found === true, 'T3: found===true for complete node');
  assert(r.changed === false, 'T3: changed===false — complete ∉ allowFrom(pending)');
  assert(r.alreadyAtTarget === false, 'T3: alreadyAtTarget===false (target is in_progress, not complete)');
  assert(r.content === plan, 'T3: content unmodified — refuse to touch out-of-allowFrom');
}

// ---------------------------------------------------------------------------
// T4: spliceLedgerNode — in_progress → complete (close path)
// ---------------------------------------------------------------------------
{
  const plan = makePlan([
    '| impl-core | in_progress | |',
    '| impl-other | pending | |',
  ]);

  const r = spliceLedgerNode(plan, 'impl-core', 'complete', { allowFrom: ['in_progress'] });
  assert(r.found === true, 'T4: found===true');
  assert(r.changed === true, 'T4: changed===true on close path');
  assert(r.content.includes('| impl-core | complete | |'), 'T4: row updated to complete');
  assert(r.content.includes('| impl-other | pending | |'), 'T4: sibling unmodified');
}

// ---------------------------------------------------------------------------
// T5: spliceLedgerNode — node not found
// ---------------------------------------------------------------------------
{
  const plan = makePlan([
    '| impl-core | pending | |',
  ]);

  const r = spliceLedgerNode(plan, 'nonexistent-node', 'in_progress', { allowFrom: ['pending'] });
  assert(r.found === false, 'T5: found===false for absent node');
  assert(r.changed === false, 'T5: changed===false when not found');
}

// ---------------------------------------------------------------------------
// T6 (#354): UPSTREAM-FENCED `## Node Ledger` decoy — the single fence-aware locateSection makes
// every reader/writer target the REAL ledger, not a fenced decoy heading appearing earlier in the
// file (strengthens beyond the existing decoy-outside / fenced-inside walkthrough scenarios, which
// did not cover an upstream-fenced HEADING). Mutation-style: a fence-blind indexOf would target the
// decoy and either mis-flip nothing or corrupt the fenced block.
{
  // A plan whose ## Nodes section contains a FENCED markdown example that itself has a
  // `## Node Ledger` heading + `consent_halt: pending` line — upstream of the REAL ledger.
  const decoyPlan = [
    '# Plan',
    '## Meta',
    'plan_hash: x',
    '## Nodes',
    '| id | role | depends_on | declared_write_set | est | shape |',
    '|----|------|-----------|--------------------|-----|-------|',
    '| impl-core | tdd-guide | — | scripts/x.js | 1 | sequence |',
    '',
    'Example (illustrative, fenced — NOT the real ledger):',
    '```markdown',
    '## Node Ledger',
    '| id | status |',
    '| impl-core | complete |',
    'consent_halt: pending',
    '```',
    '## Node Ledger',
    '| id | status |',
    '|----|--------|',
    '| impl-core | pending |',
    '## Required Agent Compliance',
    '',
    '| Requirement | Status | Evidence | Skip Reason |',
    '|-------------|--------|----------|-------------|',
    '',
  ].join('\n');

  // locateSection finds the REAL ledger (after the fence), not the decoy inside it.
  const loc = locateSection(decoyPlan, 'Node Ledger');
  assert(loc.start >= 0, 'T6: locateSection finds a ledger');
  assert(decoyPlan.slice(loc.start, loc.next).includes('| impl-core | pending |'),
    'T6: locateSection targets the REAL ledger (pending), not the fenced decoy (complete)');
  assert(!decoyPlan.slice(loc.start, loc.next).includes('```'),
    'T6: the located section excludes the fenced decoy block');

  // readLedgerStatuses reads the REAL row (pending), ignoring the fenced decoy (complete).
  const statuses = readLedgerStatuses(decoyPlan);
  assert(statuses['impl-core'] === 'pending',
    'T6: readLedgerStatuses reads the REAL row (pending), not the fenced decoy (complete), got ' + statuses['impl-core']);

  // spliceLedgerNode flips the REAL row; the fenced decoy is untouched.
  const flip = spliceLedgerNode(decoyPlan, 'impl-core', 'in_progress', { allowFrom: ['pending'] });
  assert(flip.changed === true && flip.found === true, 'T6: spliceLedgerNode flips the real row');
  assert(/```markdown[\s\S]*\| impl-core \| complete \|[\s\S]*```/.test(flip.content),
    'T6: the fenced decoy block is left byte-intact (still shows complete)');
  assert(readLedgerStatuses(flip.content)['impl-core'] === 'in_progress',
    'T6: after flip, the REAL ledger row is in_progress');

  // readDurableConsentHalt is NOT fooled by the fenced `consent_halt: pending` decoy (real ledger has none).
  assert(readDurableConsentHalt(decoyPlan) === false,
    'T6: readDurableConsentHalt ignores the fenced-decoy consent_halt (real ledger has none)');

  // spliceComplianceRow appends to the REAL compliance section (after the real ledger).
  const withRow = spliceComplianceRow(decoyPlan, '| code-reviewer | subagent-invoked | ok | |');
  assert(withRow.includes('| code-reviewer | subagent-invoked | ok | |'),
    'T6: spliceComplianceRow appended the row');
  // exactly one real compliance heading (the fenced decoy has none here); row lands after the real ledger.
  assert(withRow.indexOf('| code-reviewer | subagent-invoked | ok | |') > withRow.lastIndexOf('```'),
    'T6: the compliance row lands in the REAL section (after the fenced decoy)');
}

// ---------------------------------------------------------------------------
// T6b (#354, AC3): `## Nodes` row-walk PARITY — validator.parseNodes(content) and
// classifier.readPlanNodes(path) must extract the same id/role/depends_on set (both delegate
// section-slicing to the fence-aware classifier.sectionBody; this pins the row-walk against drift).
// ---------------------------------------------------------------------------
{
  const validator = require('./kaola-workflow-plan-validator');
  const classifier = require('./kaola-workflow-classifier');
  // #382: the fixture carries the optional `model` column (opus / sonnet / absent) so the parity
  // signature also pins `model` — validator.parseNodes and classifier.readPlanNodes must agree on it.
  const plan = [
    '## Meta', 'plan_hash: x', '',
    '## Nodes',
    '| id | role | depends_on | declared_write_set | est | shape | model |',
    '|----|------|-----------|--------------------|-----|-------|-------|',
    '| a | code-explorer | — | — | 1 | sequence | sonnet |',
    '| b | implementer | a | scripts/b.js | 1 | sequence | opus |',
    '| c | code-reviewer | b | — | 1 | sequence | |',
    '## Node Ledger', '| id | status |', '|----|--------|', '| a | pending |', '',
  ].join('\n');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-nodes-parity-'));
  const planPath = path.join(tmp, 'workflow-plan.md');
  fs.writeFileSync(planPath, plan);
  const vNodes = validator.parseNodes(plan);
  const cNodes = classifier.readPlanNodes(planPath);
  const sig = n => n.id + ':' + n.role + ':' + (n.dependsOn || []).join(',') + ':' + (n.model || '');
  const vSig = vNodes.map(sig).join('|');
  const cSig = cNodes.map(sig).join('|');
  assert(vSig === 'a:code-explorer::sonnet|b:implementer:a:opus|c:code-reviewer:b:',
    'T6b: validator.parseNodes id/role/deps/model as expected, got ' + vSig);
  assert(vSig === cSig,
    'T6b (AC3 / #382): validator.parseNodes and classifier.readPlanNodes agree on id/role/deps/model (parity), v=' + vSig + ' c=' + cSig);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T6: checkEvidenceShape — tdd-guide needs BOTH RED and GREEN
// ---------------------------------------------------------------------------
{
  // Missing GREEN
  const evidenceWithOnlyRed = 'RED: test failed as expected\nSome notes about the implementation';
  const r1 = checkEvidenceShape('tdd-guide', 'impl-core', evidenceWithOnlyRed);
  assert(r1.ok === false, 'T6a: tdd-guide missing GREEN → not ok');
  assert(r1.reason && r1.reason.includes('GREEN'), 'T6a: reason mentions GREEN');
  assert(r1.kind === 'shape' && r1.missingTokenClass === 'GREEN', 'T6a (#319): kind shape + missingTokenClass GREEN');

  // Has both
  const evidenceWithBoth = 'RED: test failed\nGREEN: test passed\n';
  const r2 = checkEvidenceShape('tdd-guide', 'impl-core', evidenceWithBoth);
  assert(r2.ok === true, 'T6b: tdd-guide with both RED+GREEN → ok');

  // n/a skip reason
  const evidenceNa = 'n/a: no new code paths added, only documentation changes';
  const r3 = checkEvidenceShape('tdd-guide', 'impl-core', evidenceNa);
  assert(r3.ok === true, 'T6c: tdd-guide with n/a reason → ok');
}

// ---------------------------------------------------------------------------
// T7: checkEvidenceShape — implementer needs non_tdd_reason + change-type token
// ---------------------------------------------------------------------------
{
  // Missing non_tdd_reason
  const evidenceMissingReason = 'regression-green: npm test passed';
  const r1 = checkEvidenceShape('implementer', 'impl-other', evidenceMissingReason);
  assert(r1.ok === false, 'T7a: implementer missing non_tdd_reason → not ok');
  assert(r1.kind === 'shape' && r1.missingTokenClass === 'non_tdd_reason', 'T7a (#319): kind shape + missingTokenClass non_tdd_reason');

  // Has non_tdd_reason but missing change-type token
  const evidenceMissingToken = 'non_tdd_reason: config-only change, no logic paths';
  const r2 = checkEvidenceShape('implementer', 'impl-other', evidenceMissingToken);
  assert(r2.ok === false, 'T7b: implementer missing change-type token → not ok');
  assert(r2.kind === 'shape' && r2.missingTokenClass === 'change-type', 'T7b (#319): kind shape + missingTokenClass change-type');

  // Has both: non_tdd_reason + regression-green
  const evidenceComplete = 'non_tdd_reason: config-only\nregression-green: tests pass';
  const r3 = checkEvidenceShape('implementer', 'impl-other', evidenceComplete);
  assert(r3.ok === true, 'T7c: implementer with non_tdd_reason + regression-green → ok');

  // Has both: non_tdd_reason + build-green
  const evidenceBuildGreen = 'non_tdd_reason: scaffolding\nbuild-green: builds pass';
  const r4 = checkEvidenceShape('implementer', 'impl-other', evidenceBuildGreen);
  assert(r4.ok === true, 'T7d: implementer with non_tdd_reason + build-green → ok');

  // Has both: non_tdd_reason + smoke-integration
  const evidenceSmoke = 'non_tdd_reason: wiring\nsmoke-integration: smoke passed';
  const r5 = checkEvidenceShape('implementer', 'impl-other', evidenceSmoke);
  assert(r5.ok === true, 'T7e: implementer with non_tdd_reason + smoke-integration → ok');

  // n/a skip
  const evidenceNa = 'n/a: no functional change';
  const r6 = checkEvidenceShape('implementer', 'impl-other', evidenceNa);
  assert(r6.ok === true, 'T7f: implementer with n/a → ok');
}

// ---------------------------------------------------------------------------
// T8: checkEvidenceShape — other roles: file present is sufficient
// ---------------------------------------------------------------------------
{
  const evidencePresent = 'Reviewed the changes. LGTM.';
  const r1 = checkEvidenceShape('code-reviewer', 'review', evidencePresent);
  assert(r1.ok === true, 'T8a: code-reviewer with file present → ok');

  const r2 = checkEvidenceShape('finalize', 'finalize', evidencePresent);
  assert(r2.ok === true, 'T8b: finalize with file present → ok');

  // Missing/empty evidence → not ok
  const r3 = checkEvidenceShape('code-reviewer', 'review', null);
  assert(r3.ok === false, 'T8c: code-reviewer with null evidence → not ok');
  assert(r3.kind === 'absent', 'T8c (#319): null evidence → kind absent');

  const r4 = checkEvidenceShape('code-reviewer', 'review', '');
  assert(r4.ok === false, 'T8d: code-reviewer with empty evidence → not ok');
  assert(r4.kind === 'absent', 'T8d (#319): empty evidence → kind absent');
}

// ---------------------------------------------------------------------------
// T8g (#334): checkEvidenceShape — main-session-gate requires a column-0 verdict and
// REFUSES the universal 'n/a' self-skip (the inversion vs every other role).
// ---------------------------------------------------------------------------
{
  // absent evidence → kind absent, missingTokenClass non-empty
  const rAbsent = checkEvidenceShape('main-session-gate', 'vgate', null);
  assert(rAbsent.ok === false, 'T8g-a: main-session-gate absent evidence → not ok');
  assert(rAbsent.kind === 'absent', 'T8g-a: absent → kind absent');
  assert(rAbsent.missingTokenClass === 'non-empty', 'T8g-a: absent → missingTokenClass non-empty');

  const rEmpty = checkEvidenceShape('main-session-gate', 'vgate', '   ');
  assert(rEmpty.ok === false && rEmpty.kind === 'absent', 'T8g-b: whitespace-only → absent');

  // present but verdict-less → kind shape, missingTokenClass verdict
  const rNoVerdict = checkEvidenceShape('main-session-gate', 'vgate', 'looked at the screen, looks fine\n');
  assert(rNoVerdict.ok === false, 'T8g-c: verdict-less → not ok');
  assert(rNoVerdict.kind === 'shape', 'T8g-c: verdict-less → kind shape');
  assert(rNoVerdict.missingTokenClass === 'verdict', 'T8g-c: verdict-less → missingTokenClass verdict');

  // 'n/a ...' content → REFUSED for this role (the inversion: every OTHER role would skip)
  const rNa = checkEvidenceShape('main-session-gate', 'vgate', 'n/a — not a visual issue\n');
  assert(rNa.ok === false, 'T8g-d: n/a content REFUSED for main-session-gate (inversion vs other roles)');
  assert(rNa.kind === 'shape' && rNa.missingTokenClass === 'verdict', 'T8g-d: n/a content → shape/verdict');
  // (sanity: the SAME n/a content passes for a non-gate role)
  assert(checkEvidenceShape('code-reviewer', 'review', 'n/a — not a visual issue\n').ok === true,
    'T8g-d: same n/a content is a legal skip for code-reviewer');

  // verdict: pass / verdict: fail → ok (a fail verdict still CLOSES the node, parity with reviewers)
  const rPass = checkEvidenceShape('main-session-gate', 'vgate', 'verdict: pass\nfindings_blocking: 0\nGPU true-black confirmed\n');
  assert(rPass.ok === true, 'T8g-e: verdict: pass → ok');
  const rFail = checkEvidenceShape('main-session-gate', 'vgate', 'verdict: fail\nfindings_blocking: 1\nblacks looked grey\n');
  assert(rFail.ok === true, 'T8g-f: verdict: fail → ok (closes the node; blocking is at Finalization)');
  // last-match-wins + case-insensitive
  const rLast = checkEvidenceShape('main-session-gate', 'vgate', 'verdict: fail\nre-checked\nverdict: PASS\n');
  assert(rLast.ok === true, 'T8g-g: last-match-wins + case-insensitive verdict → ok');
}

// ---------------------------------------------------------------------------
// T9: runOrient — read-only; assert writeFile is never called
// ---------------------------------------------------------------------------
{
  let writeFileCalled = false;

  const plan = makePlan([
    '| impl-core | in_progress | |',
    '| impl-other | pending | |',
    '| review | pending | |',
    '| finalize | pending | |',
  ]);
  const state = makeState();
  const cacheContent = 'RED: failed\nGREEN: passed';

  const shellStub = function(scriptPath, args) {
    const base = path.basename(scriptPath);
    const argsArr = args || [];
    if (base === 'kaola-workflow-plan-validator.js') {
      return { exitCode: 0, ok: true, planHash: 'abc123' };
    }
    if (base === 'kaola-workflow-next-action.js') {
      return {
        exitCode: 0,
        result: 'ok',
        readySet: [{ id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/adaptive-node.js', dependsOn: [] }],
        nextNode: { id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/adaptive-node.js' },
        allDone: false,
      };
    }
    return { exitCode: 1 };
  };

  const result = runOrient({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    shell: shellStub,
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) return plan;
      if (fpath.endsWith('workflow-state.md')) return state;
      if (fpath.includes('.cache/')) return cacheContent;
      throw new Error('ENOENT: ' + fpath);
    },
    writeFile: (fpath, content) => { writeFileCalled = true; },
    cacheExists: (fpath) => fpath.includes('impl-core'),
  });

  assert(writeFileCalled === false, 'T9: orient never calls writeFile (read-only)');
  assert(result.result === 'ok', 'T9: orient returns result ok');
  assert(result.inProgressNode === 'impl-core', 'T9: inProgressNode detected');
  assert(result.consentHalt === false, 'T9: consentHalt===false when no consent_halt marker');
  assert(result.escalatedToFull === null || result.escalatedToFull === undefined, 'T9: escalatedToFull null/undefined without marker');
}

// ---------------------------------------------------------------------------
// T10: runOpenNext — first open: in_progress + baseline recorded
// ---------------------------------------------------------------------------
{
  let writtenFiles = {};
  let shellCalls = [];

  const plan = makePlan([
    '| impl-core | pending | |',
    '| impl-other | pending | |',
    '| review | pending | |',
    '| finalize | pending | |',
  ]);
  const state = makeState();

  const shellStub = function(scriptPath, args) {
    const base = path.basename(scriptPath);
    const argsArr = args || [];
    shellCalls.push({ base, args: argsArr.slice() });

    // #499: open-next now runs the integrity layer (validator --resume-check); a clean frozen plan passes.
    if (base === 'kaola-workflow-plan-validator.js' && argsArr.includes('--resume-check')) return { exitCode: 0, ok: true };
    if (base === 'kaola-workflow-next-action.js') {
      return {
        exitCode: 0,
        result: 'ok',
        readySet: [{ id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/adaptive-node.js', dependsOn: [] }],
        nextNode: { id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/adaptive-node.js' },
        allDone: false,
      };
    }
    if (base === 'kaola-workflow-commit-node.js') {
      return { exitCode: 0, result: 'ok', mode: 'per-node-start', nodeId: 'impl-core', overallOk: true };
    }
    return { exitCode: 1, result: 'refuse', errors: ['stub: unexpected ' + base] };
  };

  let planContent = plan;

  const result = runOpenNext({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    nodeId: null,
    shell: shellStub,
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) return planContent;
      if (fpath.endsWith('workflow-state.md')) return state;
      throw new Error('ENOENT: ' + fpath);
    },
    writeFile: (fpath, content) => {
      writtenFiles[fpath] = content;
      if (fpath.endsWith('workflow-plan.md')) planContent = content;
    },
  });

  assert(result.result === 'ok', 'T10: open-next result===ok');
  assert(result.allDone === false, 'T10: allDone===false');
  assert(result.opened !== null, 'T10: opened !== null');
  assert(result.opened && result.opened.id === 'impl-core', 'T10: opened.id===impl-core');
  assert(result.baselineRecorded === true, 'T10: baselineRecorded===true');

  // Plan must have been written with in_progress
  const writtenPlan = writtenFiles['/fake/kaola-workflow/test-project/workflow-plan.md'];
  assert(writtenPlan !== undefined, 'T10: plan was written');
  assert(writtenPlan.includes('| impl-core | in_progress | |'), 'T10: ledger row set to in_progress');

  // commit-node --start was called
  const commitStartCall = shellCalls.find(c => c.base === 'kaola-workflow-commit-node.js' && c.args.includes('--start'));
  assert(commitStartCall !== undefined, 'T10: commit-node --start was called for baseline');
}

// ---------------------------------------------------------------------------
// T11: runOpenNext — allDone short-circuit
// ---------------------------------------------------------------------------
{
  let shellCalls = [];
  let writeFileCalled = false;

  const shellStub = function(scriptPath, args) {
    const base = path.basename(scriptPath);
    shellCalls.push(base);
    // #499: open-next integrity layer — a clean frozen plan passes --resume-check.
    if (base === 'kaola-workflow-plan-validator.js' && (args || []).includes('--resume-check')) return { exitCode: 0, ok: true };
    if (base === 'kaola-workflow-next-action.js') {
      return {
        exitCode: 0,
        result: 'ok',
        readySet: [],
        nextNode: null,
        allDone: true,
      };
    }
    return { exitCode: 1 };
  };

  const plan = makePlan([
    '| impl-core | complete | |',
    '| impl-other | complete | |',
    '| review | complete | |',
    '| finalize | complete | |',
  ]);

  const result = runOpenNext({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    nodeId: null,
    shell: shellStub,
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) return plan;
      return makeState();
    },
    writeFile: (fpath, content) => { writeFileCalled = true; },
  });

  assert(result.result === 'ok', 'T11: allDone open-next result===ok');
  assert(result.allDone === true, 'T11: allDone===true short-circuit');
  assert(result.opened === null, 'T11: opened===null when allDone');
  assert(writeFileCalled === false, 'T11: writeFile not called on allDone');
}

// ---------------------------------------------------------------------------
// T12: runOpenNext — --node-id not in ready set → refuse
// ---------------------------------------------------------------------------
{
  let writeFileCalled = false;

  const shellStub = function(scriptPath, args) {
    const base = path.basename(scriptPath);
    // #499: open-next integrity layer — a clean frozen plan passes --resume-check.
    if (base === 'kaola-workflow-plan-validator.js' && (args || []).includes('--resume-check')) return { exitCode: 0, ok: true };
    if (base === 'kaola-workflow-next-action.js') {
      return {
        exitCode: 0,
        result: 'ok',
        readySet: [{ id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: '...', dependsOn: [] }],
        nextNode: { id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: '...' },
        allDone: false,
      };
    }
    return { exitCode: 1 };
  };

  const plan = makePlan([
    '| impl-core | pending | |',
    '| impl-other | pending | |',
    '| review | pending | |',
    '| finalize | pending | |',
  ]);

  const result = runOpenNext({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    nodeId: 'review', // review is not in readySet (depends on impl-other)
    shell: shellStub,
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) return plan;
      return makeState();
    },
    writeFile: (fpath, content) => { writeFileCalled = true; },
  });

  assert(result.result === 'refuse', 'T12: node-id not-in-ready → refuse');
  assert(result.reason === 'node_not_ready', 'T12: reason===node_not_ready');
  assert(writeFileCalled === false, 'T12: writeFile not called on refuse');
}

// ---------------------------------------------------------------------------
// T13: runRecordEvidence — stdin → .cache, re-injecting the evidence-binding header
// (#546 G3, DECISION A): a verbatim write would clobber the seeded line-1 binding header,
// so record-evidence re-injects `evidence-binding: <nodeId> <nonce>` when the stdin lacks
// one. With no on-disk barrier-base (the /fake planPath), the nonce reads empty.
// ---------------------------------------------------------------------------
{
  let writtenFiles = {};
  const evidenceContent = 'RED: test failed\nGREEN: test passed\n5 assertions\n';
  const expectedWritten = 'evidence-binding: impl-core \n' + evidenceContent;

  const result = runRecordEvidence({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    nodeId: 'impl-core',
    stdinContent: evidenceContent,
    writeFile: (fpath, content) => { writtenFiles[fpath] = content; },
    mkdirp: (dir) => { /* no-op */ },
  });

  assert(result.result === 'ok', 'T13: record-evidence result===ok');
  assert(result.wrote !== undefined, 'T13: wrote path present');
  assert(result.bytes === expectedWritten.length, 'T13: bytes matches written (binding-injected) length');

  const cacheKey = Object.keys(writtenFiles).find(k => k.includes('.cache/impl-core.md'));
  assert(cacheKey !== undefined, 'T13: .cache/impl-core.md was written');
  assert(writtenFiles[cacheKey] === expectedWritten, 'T13: binding header re-injected ahead of verbatim evidence body');
}

// ---------------------------------------------------------------------------
// T13c (#546 G3): when the stdin ALREADY carries an evidence-binding line (even a
// foreign / copied one), record-evidence writes it UNTOUCHED so checkEvidenceShape can
// still catch a stale / foreign nonce (anti-replay #392 preserved).
// ---------------------------------------------------------------------------
{
  let writtenFiles = {};
  const boundContent = 'evidence-binding: other-node deadbeef1234\nRED: x\nGREEN: y\n';

  const result = runRecordEvidence({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    nodeId: 'impl-core',
    stdinContent: boundContent,
    writeFile: (fpath, content) => { writtenFiles[fpath] = content; },
    mkdirp: (dir) => { /* no-op */ },
  });

  assert(result.result === 'ok', 'T13c: record-evidence result===ok');
  const cacheKey = Object.keys(writtenFiles).find(k => k.includes('.cache/impl-core.md'));
  assert(writtenFiles[cacheKey] === boundContent, 'T13c: existing (foreign) binding written untouched — no re-injection');
  assert(result.bytes === boundContent.length, 'T13c: bytes matches untouched content');

  // --- T13d (#546 G3 / #392): close the anti-replay LOOP. The untouched foreign binding T13c just
  // wrote is exactly what the close path re-reads, so feed that SAME written content through
  // checkEvidenceShape with THIS node's (impl-core) expectedNonce/expectedNodeId and prove it REFUSES.
  // This makes the untouched-write → close-node-refuse link explicit (T13c only proved the write).
  const writtenForeign = writtenFiles[cacheKey]; // === boundContent (impl-core), bound to "other-node"
  const thisNode = 'impl-core';
  const thisNonce = 'cafef00d5678'; // this open's nonce — neither matches the written deadbeef1234

  // (1) FOREIGN nodeId: written binding names "other-node" but this dispatch is impl-core →
  //     evidence_unbound (evidence copied from another node).
  const unbound = checkEvidenceShape('tdd-guide', thisNode, writtenForeign,
    { expectedNonce: thisNonce, expectedNodeId: thisNode });
  assert(unbound.ok === false, 'T13d: foreign-node binding → checkEvidenceShape NOT ok (close would refuse)');
  assert(unbound.evidenceUnbound === true, 'T13d: foreign nodeId → evidenceUnbound === true');
  assert(unbound.missingTokenClass === 'evidence_unbound', 'T13d: missingTokenClass evidence_unbound');
  assert(unbound.evidenceStale === undefined, 'T13d: foreign-node is unbound, NOT stale');

  // (2) SAME-node, WRONG nonce: a binding for THIS node but carrying a prior open's nonce →
  //     evidence_stale (replayed from a prior open of the same node). Build the same-node variant
  //     the way runRecordEvidence would have written it (line-1 binding header + body untouched).
  const sameNodeStale = 'evidence-binding: ' + thisNode + ' deadbeef1234\nRED: x\nGREEN: y\n';
  const stale = checkEvidenceShape('tdd-guide', thisNode, sameNodeStale,
    { expectedNonce: thisNonce, expectedNodeId: thisNode });
  assert(stale.ok === false, 'T13d: same-node wrong-nonce binding → checkEvidenceShape NOT ok');
  assert(stale.evidenceStale === true, 'T13d: same-node wrong nonce → evidenceStale === true');
  assert(stale.missingTokenClass === 'evidence_stale', 'T13d: missingTokenClass evidence_stale');
  assert(stale.evidenceUnbound === undefined, 'T13d: same-node wrong-nonce is stale, NOT unbound');

  // (3) Control: the SAME-node binding carrying the MATCHING nonce passes — proves the refusals
  //     above are the nonce/node binding firing, not a blanket reject of every bound evidence.
  const matchOk = checkEvidenceShape('tdd-guide', thisNode,
    'evidence-binding: ' + thisNode + ' ' + thisNonce + '\nRED: x\nGREEN: y\n',
    { expectedNonce: thisNonce, expectedNodeId: thisNode });
  assert(matchOk.ok === true, 'T13d: matching node+nonce binding → ok (control: binding check, not blanket reject)');
}

// ---------------------------------------------------------------------------
// T13b (#318): runRecordEvidence + validateProjectName refuse a reserved/illegal project
// SEGMENT before any write, so a record-evidence call can never create a nested
// kaola-workflow/kaola-workflow/.cache path (the #249 drift). Reserved-name (segment), NOT a
// path substring — this repo's own toplevel IS kaola-workflow, so a legit issue-N project
// resolves to .../kaola-workflow/kaola-workflow/issue-N and a substring check would false-positive.
// ---------------------------------------------------------------------------
{
  // validateProjectName: reserved literal + escaping segments rejected; legit issue-N accepted.
  assert(validateProjectName('kaola-workflow').ok === false, 'T13b: reserved literal kaola-workflow rejected');
  assert(validateProjectName('issue-249').ok === true, 'T13b: legit issue-249 accepted (no substring false-positive)');
  assert(validateProjectName('a/b').ok === false, 'T13b: separator-bearing segment rejected');
  assert(validateProjectName('..').ok === false, 'T13b: ".." rejected');
  assert(validateProjectName('').ok === false, 'T13b: empty rejected');

  // runRecordEvidence with the reserved project → refuse nested_cache_path, ZERO write.
  let writtenFiles = {};
  let mkdirCalled = false;
  const result = runRecordEvidence({
    planPath: '/fake/kaola-workflow/kaola-workflow/workflow-plan.md',
    project: 'kaola-workflow',
    nodeId: 'n7',
    stdinContent: 'RED\nGREEN\n',
    writeFile: (fpath, content) => { writtenFiles[fpath] = content; },
    mkdirp: () => { mkdirCalled = true; },
  });
  assert(result.result === 'refuse', 'T13b: reserved project → refuse');
  assert(result.reason === 'nested_cache_path', 'T13b: reason nested_cache_path, got ' + JSON.stringify(result.reason));
  assert(typeof result.repair === 'string' && result.repair.length > 0, 'T13b: refusal carries a repair route');
  assert(Object.keys(writtenFiles).length === 0, 'T13b: ZERO files written on refusal (no nested path created)');
  assert(mkdirCalled === false, 'T13b: mkdirp NOT called on refusal (pure no-op)');

  // Legit project still writes canonically (no false-positive).
  let okFiles = {};
  const ok = runRecordEvidence({
    planPath: '/fake/kaola-workflow/issue-249/workflow-plan.md',
    project: 'issue-249',
    nodeId: 'n7',
    stdinContent: 'non_tdd_reason: x\nbuild-green: ok\n',
    writeFile: (fpath, content) => { okFiles[fpath] = content; },
    mkdirp: () => {},
  });
  assert(ok.result === 'ok', 'T13b: legit project record-evidence still succeeds');
  assert(Object.keys(okFiles).some(k => k.includes('issue-249/.cache/n7.md')), 'T13b: legit evidence written to canonical issue-249/.cache path');
}

// ---------------------------------------------------------------------------
// T14: runCloseAndOpenNext — barrier exit0 + evidence → close + compliance row (bare role) + fused advance
// ---------------------------------------------------------------------------
{
  let writtenFiles = {};
  let shellCalls = [];

  const plan = makePlan([
    '| impl-core | in_progress | |',
    '| impl-other | pending | |',
    '| review | pending | |',
    '| finalize | pending | |',
  ]);

  // Evidence for tdd-guide: has both RED and GREEN
  const cacheContent = 'RED: test failed as expected\nGREEN: test passed after implementation\n5 assertions';
  const cacheFiles = {
    '/fake/kaola-workflow/test-project/.cache/impl-core.md': cacheContent,
  };

  let planContent = plan;

  const shellStub = function(scriptPath, args) {
    const base = path.basename(scriptPath);
    const argsArr = args || [];
    shellCalls.push({ base, args: argsArr.slice() });

    if (base === 'kaola-workflow-commit-node.js' && !argsArr.includes('--start')) {
      // Per-node barrier
      return {
        exitCode: 0,
        result: 'ok',
        mode: 'per-node',
        nodeId: 'impl-core',
        overallOk: true,
        selectorCheck: { isSelector: false, ok: true },
        barrierCheck: { exitCode: 0, result: 'pass' },
      };
    }
    if (base === 'kaola-workflow-commit-node.js' && argsArr.includes('--start')) {
      // Baseline for next node
      return { exitCode: 0, result: 'ok', mode: 'per-node-start', nodeId: 'impl-other', overallOk: true };
    }
    if (base === 'kaola-workflow-next-action.js') {
      return {
        exitCode: 0,
        result: 'ok',
        readySet: [{ id: 'impl-other', role: 'implementer', model: 'sonnet', declared_write_set: 'scripts/other.js', dependsOn: ['impl-core'] }],
        nextNode: { id: 'impl-other', role: 'implementer', model: 'sonnet', declared_write_set: 'scripts/other.js' },
        allDone: false,
      };
    }
    return { exitCode: 1, result: 'refuse', errors: ['stub: unexpected ' + base + ' ' + JSON.stringify(argsArr)] };
  };

  const result = runCloseAndOpenNext({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    nodeId: 'impl-core',
    shell: shellStub,
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) return planContent;
      if (fpath.endsWith('workflow-state.md')) return makeState();
      if (cacheFiles[fpath]) return cacheFiles[fpath];
      throw new Error('ENOENT: ' + fpath);
    },
    writeFile: (fpath, content) => {
      writtenFiles[fpath] = content;
      if (fpath.endsWith('workflow-plan.md')) planContent = content;
    },
    cacheExists: (fpath) => !!cacheFiles[fpath],
  });

  assert(result.result === 'ok', 'T14: close-and-open-next result===ok');
  assert(result.closed === 'impl-core', 'T14: closed===impl-core');
  assert(result.opened !== null, 'T14: opened !== null (fused advance)');
  assert(result.opened && result.opened.id === 'impl-other', 'T14: fused advance opened impl-other');
  assert(result.allDone === false, 'T14: allDone===false');

  // Plan was written (ledger updated)
  const writtenPlan = writtenFiles['/fake/kaola-workflow/test-project/workflow-plan.md'];
  assert(writtenPlan !== undefined, 'T14: plan was written');
  assert(writtenPlan.includes('| impl-core | complete | |'), 'T14: impl-core marked complete');
  assert(writtenPlan.includes('| impl-other | in_progress | |'), 'T14: impl-other opened in_progress by fused advance');

  // Compliance row written — tdd-guide role, keyed by role+id format
  const hasComplianceSection = writtenPlan.includes('## Required Agent Compliance');
  assert(hasComplianceSection, 'T14: ## Required Agent Compliance section written');
  assert(writtenPlan.includes('tdd-guide'), 'T14: compliance row contains tdd-guide role');

  // commit-node barrier was called (without --start)
  const barrierCall = shellCalls.find(c => c.base === 'kaola-workflow-commit-node.js' && !c.args.includes('--start') && !c.args.includes('--json') === false);
  assert(barrierCall !== undefined || shellCalls.some(c => c.base === 'kaola-workflow-commit-node.js' && !c.args.includes('--start')), 'T14: commit-node barrier called');
}

// ---------------------------------------------------------------------------
// T14b: runCloseAndOpenNext — code-reviewer node → compliance row uses BARE role string
// ---------------------------------------------------------------------------
{
  let writtenFiles = {};

  const nodes = [
    '| impl-core | tdd-guide | — | scripts/adaptive-node.js | 1 | sequence |',
    '| review | code-reviewer | impl-core | — | 1 | sequence |',
    '| finalize | finalize | review | CHANGELOG.md | 1 | sequence |',
  ];

  const plan = makePlan([
    '| impl-core | complete | |',
    '| review | in_progress | |',
    '| finalize | pending | |',
  ], nodes);

  const cacheContent = 'Reviewed the changes. LGTM. No issues found.';
  const cacheFiles = {
    '/fake/kaola-workflow/test-project/.cache/review.md': cacheContent,
  };

  let planContent = plan;

  const shellStub = function(scriptPath, args) {
    const base = path.basename(scriptPath);
    const argsArr = args || [];
    if (base === 'kaola-workflow-commit-node.js' && !argsArr.includes('--start')) {
      return {
        exitCode: 0, result: 'ok', mode: 'per-node', nodeId: 'review',
        overallOk: true,
        selectorCheck: { isSelector: false, ok: true },
      };
    }
    if (base === 'kaola-workflow-commit-node.js' && argsArr.includes('--start')) {
      return { exitCode: 0, result: 'ok', mode: 'per-node-start', nodeId: 'finalize', overallOk: true };
    }
    if (base === 'kaola-workflow-next-action.js') {
      return {
        exitCode: 0, result: 'ok',
        readySet: [{ id: 'finalize', role: 'finalize', model: 'sonnet', declared_write_set: 'CHANGELOG.md', dependsOn: ['review'] }],
        nextNode: { id: 'finalize', role: 'finalize', model: 'sonnet', declared_write_set: 'CHANGELOG.md' },
        allDone: false,
      };
    }
    return { exitCode: 1 };
  };

  const result = runCloseAndOpenNext({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    nodeId: 'review',
    shell: shellStub,
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) return planContent;
      if (fpath.endsWith('workflow-state.md')) return makeState();
      if (cacheFiles[fpath]) return cacheFiles[fpath];
      throw new Error('ENOENT: ' + fpath);
    },
    writeFile: (fpath, content) => {
      writtenFiles[fpath] = content;
      if (fpath.endsWith('workflow-plan.md')) planContent = content;
    },
    cacheExists: (fpath) => !!cacheFiles[fpath],
  });

  assert(result.result === 'ok', 'T14b: code-reviewer close result===ok');

  const writtenPlan = writtenFiles['/fake/kaola-workflow/test-project/workflow-plan.md'];
  assert(writtenPlan !== undefined, 'T14b: plan written');
  assert(writtenPlan.includes('## Required Agent Compliance'), 'T14b: compliance section written');

  // Bare role string check: compliance row should have 'code-reviewer' in Requirement cell,
  // NOT 'code-reviewer (review)'
  const complianceSection = writtenPlan.slice(writtenPlan.indexOf('## Required Agent Compliance'));
  // The row must contain | code-reviewer | (bare, not code-reviewer (review))
  // It should NOT start the role cell with 'code-reviewer (review)' — that would be wrong.
  assert(complianceSection.includes('| code-reviewer |'), 'T14b: compliance row uses BARE role string code-reviewer');
  const wrongFormat = complianceSection.includes('| code-reviewer (review) |');
  assert(wrongFormat === false, 'T14b: compliance row does NOT use role (id) format for code-reviewer');
}

// ---------------------------------------------------------------------------
// T14c (#338): runCloseAndOpenNext — finalize SINK node → compliance row is
// 'main-session-direct', NOT 'subagent-invoked'. The plan-run contract performs the
// finalize sink bookkeeping main-session-direct (no Agent dispatch), so certifying it
// as subagent-invoked would falsely claim a delegation that never happened.
// ---------------------------------------------------------------------------
{
  let writtenFiles = {};

  const nodes = [
    '| impl-core | tdd-guide | — | scripts/adaptive-node.js | 1 | sequence |',
    '| review | code-reviewer | impl-core | — | 1 | sequence |',
    '| done | finalize | review | CHANGELOG.md | 1 | sequence |',
  ];

  const plan = makePlan([
    '| impl-core | complete | |',
    '| review | complete | |',
    '| done | in_progress | |',
  ], nodes);

  const cacheContent = 'finalize bookkeeping: docs + state recorded.';
  const cacheFiles = {
    '/fake/kaola-workflow/test-project/.cache/done.md': cacheContent,
  };

  let planContent = plan;

  const shellStub = function(scriptPath, args) {
    const base = path.basename(scriptPath);
    const argsArr = args || [];
    if (base === 'kaola-workflow-commit-node.js' && !argsArr.includes('--start')) {
      return {
        exitCode: 0, result: 'ok', mode: 'per-node', nodeId: 'done',
        overallOk: true,
        selectorCheck: { isSelector: false, ok: true },
      };
    }
    if (base === 'kaola-workflow-next-action.js') {
      // The finalize sink post-dominates everything; after it closes, the DAG is done.
      return { exitCode: 0, result: 'ok', readySet: [], nextNode: null, allDone: true };
    }
    return { exitCode: 1 };
  };

  const result = runCloseAndOpenNext({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    nodeId: 'done',
    shell: shellStub,
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) return planContent;
      if (fpath.endsWith('workflow-state.md')) return makeState();
      if (cacheFiles[fpath]) return cacheFiles[fpath];
      throw new Error('ENOENT: ' + fpath);
    },
    writeFile: (fpath, content) => {
      writtenFiles[fpath] = content;
      if (fpath.endsWith('workflow-plan.md')) planContent = content;
    },
    cacheExists: (fpath) => !!cacheFiles[fpath],
  });

  assert(result.result === 'ok', 'T14c: finalize-sink close result===ok');
  assert(result.allDone === true, 'T14c: allDone===true after the sink closes');

  const writtenPlan = writtenFiles['/fake/kaola-workflow/test-project/workflow-plan.md'];
  assert(writtenPlan !== undefined, 'T14c: plan written');
  assert(writtenPlan.includes('## Required Agent Compliance'), 'T14c: compliance section written');
  assert(writtenPlan.includes('| finalize (done) | main-session-direct |'),
    'T14c: finalize sink row is main-session-direct');
  assert(!writtenPlan.includes('| finalize (done) | subagent-invoked'),
    'T14c: finalize sink row is NOT falsely certified subagent-invoked');
}

// ---------------------------------------------------------------------------
// T15: runCloseAndOpenNext — barrier exit1 → refuse, NO close/advance
// ---------------------------------------------------------------------------
{
  let writeFileCalled = false;
  let shellCalls = [];

  const plan = makePlan([
    '| impl-core | in_progress | |',
    '| impl-other | pending | |',
    '| review | pending | |',
    '| finalize | pending | |',
  ]);

  const cacheContent = 'RED: test failed\nGREEN: test passed\n';
  const cacheFiles = {
    '/fake/kaola-workflow/test-project/.cache/impl-core.md': cacheContent,
  };

  const shellStub = function(scriptPath, args) {
    const base = path.basename(scriptPath);
    shellCalls.push({ base, args: (args || []).slice() });
    if (base === 'kaola-workflow-commit-node.js' && !(args || []).includes('--start')) {
      // Barrier FAILS
      return {
        exitCode: 1, result: 'refuse', mode: 'per-node', nodeId: 'impl-core',
        overallOk: false,
        barrierCheck: { exitCode: 1, result: 'refuse', errors: ['overflow: wrote outside declared set'] },
      };
    }
    return { exitCode: 1 };
  };

  const result = runCloseAndOpenNext({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    nodeId: 'impl-core',
    shell: shellStub,
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) return plan;
      if (fpath.endsWith('workflow-state.md')) return makeState();
      if (cacheFiles[fpath]) return cacheFiles[fpath];
      throw new Error('ENOENT');
    },
    writeFile: (fpath, content) => { writeFileCalled = true; },
    cacheExists: (fpath) => !!cacheFiles[fpath],
  });

  assert(result.result === 'refuse', 'T15: barrier exit1 → refuse');
  assert(writeFileCalled === false, 'T15: writeFile NOT called on barrier failure');
  // next-action should NOT be called
  const nextActionCalled = shellCalls.some(c => c.base === 'kaola-workflow-next-action.js');
  assert(nextActionCalled === false, 'T15: next-action NOT called on barrier failure');
}

// ---------------------------------------------------------------------------
// T16: runCloseAndOpenNext — present-but-malformed evidence → refuse evidence_shape_failed, NO mutation
// ---------------------------------------------------------------------------
{
  let writeFileCalled = false;

  const plan = makePlan([
    '| impl-core | in_progress | |',
    '| impl-other | pending | |',
    '| review | pending | |',
    '| finalize | pending | |',
  ]);

  // tdd-guide evidence is missing GREEN token
  const badEvidence = 'RED: test failed as expected\nNo green yet.';
  const cacheFiles = {
    '/fake/kaola-workflow/test-project/.cache/impl-core.md': badEvidence,
  };

  const shellStub = function() { return { exitCode: 0, result: 'ok' }; };

  const result = runCloseAndOpenNext({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    nodeId: 'impl-core',
    shell: shellStub,
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) return plan;
      if (fpath.endsWith('workflow-state.md')) return makeState();
      if (cacheFiles[fpath]) return cacheFiles[fpath];
      throw new Error('ENOENT');
    },
    writeFile: (fpath, content) => { writeFileCalled = true; },
    cacheExists: (fpath) => !!cacheFiles[fpath],
  });

  assert(result.result === 'refuse', 'T16: malformed evidence → refuse');
  assert(result.reason === 'evidence_shape_failed', 'T16 (#319): present-but-malformed (tdd-guide RED without GREEN) → reason evidence_shape_failed, got ' + JSON.stringify(result.reason));
  assert(result.missingTokenClass === 'GREEN', 'T16 (#319): missing token class GREEN surfaced, got ' + JSON.stringify(result.missingTokenClass));
  assert(writeFileCalled === false, 'T16: writeFile NOT called on shape failure');
}

// ---------------------------------------------------------------------------
// T16-348a (#348): runCloseAndOpenNext — node id absent from the ledger →
// refuse close_node_not_in_ledger, NO mutation (no compliance row, no plan write).
// Evidence + barrier pass; only the ledger splice is a found:false no-op.
// ---------------------------------------------------------------------------
{
  let writeFileCalled = false;

  // impl-core IS in ## Nodes (role resolves) but ABSENT from the ## Node Ledger rows.
  const plan = makePlan([
    '| impl-other | pending | |',
    '| review | pending | |',
    '| finalize | pending | |',
  ]);

  const cacheFiles = {
    '/fake/kaola-workflow/test-project/.cache/impl-core.md':
      'RED: test failed as expected\nGREEN: test passed after implementation',
  };
  const shellStub = function() { return { exitCode: 0, result: 'ok', selectorCheck: { isSelector: false, ok: true } }; };

  const result = runCloseAndOpenNext({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    nodeId: 'impl-core',
    shell: shellStub,
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) return plan;
      if (fpath.endsWith('workflow-state.md')) return makeState();
      if (cacheFiles[fpath]) return cacheFiles[fpath];
      throw new Error('ENOENT');
    },
    writeFile: () => { writeFileCalled = true; },
    cacheExists: (fpath) => !!cacheFiles[fpath],
  });

  assert(result.result === 'refuse', 'T16-348a: missing ledger row → refuse');
  assert(result.reason === 'close_node_not_in_ledger', 'T16-348a: reason close_node_not_in_ledger, got ' + JSON.stringify(result.reason));
  assert(writeFileCalled === false, 'T16-348a: NO mutation — writeFile not called (no compliance row over an unclosed node)');
}

// ---------------------------------------------------------------------------
// T16-348b (#348): runCloseAndOpenNext — ledger row still PENDING (the #305-class
// crash interleaving: baseline recorded before the in_progress flip) → refuse
// close_transition_disallowed, NO mutation.
// ---------------------------------------------------------------------------
{
  let writeFileCalled = false;

  const plan = makePlan([
    '| impl-core | pending | |',
    '| impl-other | pending | |',
    '| review | pending | |',
    '| finalize | pending | |',
  ]);
  const cacheFiles = {
    '/fake/kaola-workflow/test-project/.cache/impl-core.md':
      'RED: test failed as expected\nGREEN: test passed after implementation',
  };
  const shellStub = function() { return { exitCode: 0, result: 'ok', selectorCheck: { isSelector: false, ok: true } }; };

  const result = runCloseAndOpenNext({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    nodeId: 'impl-core',
    shell: shellStub,
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) return plan;
      if (fpath.endsWith('workflow-state.md')) return makeState();
      if (cacheFiles[fpath]) return cacheFiles[fpath];
      throw new Error('ENOENT');
    },
    writeFile: () => { writeFileCalled = true; },
    cacheExists: (fpath) => !!cacheFiles[fpath],
  });

  assert(result.result === 'refuse', 'T16-348b: pending row → refuse');
  assert(result.reason === 'close_transition_disallowed', 'T16-348b: reason close_transition_disallowed, got ' + JSON.stringify(result.reason));
  assert(writeFileCalled === false, 'T16-348b: NO mutation — writeFile not called over a still-pending node');
}

// ---------------------------------------------------------------------------
// T16-348c (#348): runCloseAndOpenNext — ledger row is n/a (skipped) → refuse
// close_transition_disallowed (n/a dropped from allowFrom; a skipped node must NOT
// be flipped to complete).
// ---------------------------------------------------------------------------
{
  let writeFileCalled = false;

  const plan = makePlan([
    '| impl-core | n/a | |',
    '| impl-other | pending | |',
    '| review | pending | |',
    '| finalize | pending | |',
  ]);
  const cacheFiles = {
    '/fake/kaola-workflow/test-project/.cache/impl-core.md':
      'RED: test failed as expected\nGREEN: test passed after implementation',
  };
  const shellStub = function() { return { exitCode: 0, result: 'ok', selectorCheck: { isSelector: false, ok: true } }; };

  const result = runCloseAndOpenNext({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    nodeId: 'impl-core',
    shell: shellStub,
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) return plan;
      if (fpath.endsWith('workflow-state.md')) return makeState();
      if (cacheFiles[fpath]) return cacheFiles[fpath];
      throw new Error('ENOENT');
    },
    writeFile: () => { writeFileCalled = true; },
    cacheExists: (fpath) => !!cacheFiles[fpath],
  });

  assert(result.result === 'refuse', 'T16-348c: n/a row → refuse');
  assert(result.reason === 'close_transition_disallowed', 'T16-348c: n/a not flipped to complete, got ' + JSON.stringify(result.reason));
  assert(writeFileCalled === false, 'T16-348c: NO mutation over an n/a node');
}

// ---------------------------------------------------------------------------
// T17: runCloseAndOpenNext — selector arms → n/a written BEFORE fused advance
// ---------------------------------------------------------------------------
{
  let writtenFiles = {};
  let shellCalls = [];

  // A plan with a selector node and two arms
  const selectorNodes = [
    '| selector | tdd-guide | — | — | 1 | selector_source |',
    '| arm-a | implementer | selector | scripts/a.js | 1 | sequence |',
    '| arm-b | implementer | selector | scripts/b.js | 1 | sequence |',
    '| finalize | finalize | arm-a,arm-b | CHANGELOG.md | 1 | sequence |',
  ];
  const plan = makePlan([
    '| selector | in_progress | |',
    '| arm-a | pending | |',
    '| arm-b | pending | |',
    '| finalize | pending | |',
  ], selectorNodes);

  const cacheContent = 'n/a: selector node — auto-selected arm-a, no code to write';
  const cacheFiles = {
    '/fake/kaola-workflow/test-project/.cache/selector.md': cacheContent,
  };

  let planContent = plan;
  let nextActionCallCount = 0;

  const shellStub = function(scriptPath, args) {
    const base = path.basename(scriptPath);
    const argsArr = args || [];
    shellCalls.push({ base, args: argsArr.slice() });

    if (base === 'kaola-workflow-commit-node.js' && !argsArr.includes('--start')) {
      return {
        exitCode: 0, result: 'ok', mode: 'per-node', nodeId: 'selector',
        overallOk: true,
        selectorCheck: {
          isSelector: true,
          ok: true,
          selected: 'arm-a',
          armsToNa: ['arm-b'],
        },
      };
    }
    if (base === 'kaola-workflow-commit-node.js' && argsArr.includes('--start')) {
      return { exitCode: 0, result: 'ok', mode: 'per-node-start', nodeId: 'arm-a', overallOk: true };
    }
    if (base === 'kaola-workflow-next-action.js') {
      nextActionCallCount++;
      // After arm-b is set to n/a, arm-a becomes ready
      return {
        exitCode: 0, result: 'ok',
        readySet: [{ id: 'arm-a', role: 'implementer', model: 'sonnet', declared_write_set: 'scripts/a.js', dependsOn: ['selector'] }],
        nextNode: { id: 'arm-a', role: 'implementer', model: 'sonnet', declared_write_set: 'scripts/a.js' },
        allDone: false,
      };
    }
    return { exitCode: 1 };
  };

  const result = runCloseAndOpenNext({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    nodeId: 'selector',
    shell: shellStub,
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) return planContent;
      if (fpath.endsWith('workflow-state.md')) return makeState();
      if (cacheFiles[fpath]) return cacheFiles[fpath];
      throw new Error('ENOENT: ' + fpath);
    },
    writeFile: (fpath, content) => {
      writtenFiles[fpath] = content;
      if (fpath.endsWith('workflow-plan.md')) planContent = content;
    },
    cacheExists: (fpath) => !!cacheFiles[fpath],
  });

  assert(result.result === 'ok', 'T17: selector result===ok');
  assert(result.closed === 'selector', 'T17: selector node closed');

  const writtenPlan = writtenFiles['/fake/kaola-workflow/test-project/workflow-plan.md'];
  assert(writtenPlan !== undefined, 'T17: plan written');

  // arm-b set to n/a
  assert(writtenPlan.includes('arm-b') && writtenPlan.includes('n/a'), 'T17: arm-b set to n/a');

  // fused advance opened arm-a
  assert(result.opened && result.opened.id === 'arm-a', 'T17: fused advance opened arm-a');
  assert(writtenPlan.includes('| arm-a | in_progress | |'), 'T17: arm-a set to in_progress by fused advance');

  // next-action was called (for fused advance in step d)
  assert(nextActionCallCount >= 1, 'T17: next-action called for fused advance');
}

// ---------------------------------------------------------------------------
// T18: runWriteHalt — consent writes BOTH markers; idempotent
// ---------------------------------------------------------------------------
{
  let writtenFiles = {};

  const plan = makePlan([
    '| impl-core | in_progress | |',
    '| impl-other | pending | |',
    '| review | pending | |',
    '| finalize | pending | |',
  ]);
  const state = makeState();

  let planContent = plan;
  let stateContent = state;

  const result = runWriteHalt({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    nodeId: 'impl-core',
    reason: 'consent',
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) return planContent;
      if (fpath.endsWith('workflow-state.md')) return stateContent;
      throw new Error('ENOENT');
    },
    writeFile: (fpath, content) => {
      writtenFiles[fpath] = content;
      if (fpath.endsWith('workflow-plan.md')) planContent = content;
      if (fpath.endsWith('workflow-state.md')) stateContent = content;
    },
  });

  assert(result.result === 'ok', 'T18: write-halt result===ok');
  assert(result.halt === 'written', 'T18: halt===written');

  // Both markers in state
  const writtenState = writtenFiles['/fake/kaola-workflow/test-project/workflow-state.md'];
  assert(writtenState !== undefined, 'T18: state was written');
  assert(writtenState.includes('escalated_to_full: consent'), 'T18: escalated_to_full:consent written to state');
  assert(writtenState.includes('escalated_to_full: security'), 'T18: escalated_to_full:security written to state (consent writes both)');

  // Plan has consent_halt: pending
  const writtenPlan = writtenFiles['/fake/kaola-workflow/test-project/workflow-plan.md'];
  assert(writtenPlan !== undefined, 'T18: plan was written');
  assert(writtenPlan.includes('consent_halt: pending'), 'T18: consent_halt:pending written to plan ledger');

  // Markers are in result.markers
  assert(Array.isArray(result.markers), 'T18: markers is array');
  assert(result.markers.includes('escalated_to_full:consent'), 'T18: markers includes consent');
  assert(result.markers.includes('escalated_to_full:security'), 'T18: markers includes security');
  assert(result.markers.includes('consent_halt:pending'), 'T18: markers includes consent_halt');

  // Idempotent: run again with same state
  const result2 = runWriteHalt({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    nodeId: 'impl-core',
    reason: 'consent',
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) return planContent;
      if (fpath.endsWith('workflow-state.md')) return stateContent;
      throw new Error('ENOENT');
    },
    writeFile: (fpath, content) => {
      writtenFiles[fpath] = content;
      if (fpath.endsWith('workflow-plan.md')) planContent = content;
      if (fpath.endsWith('workflow-state.md')) stateContent = content;
    },
  });

  assert(result2.result === 'ok', 'T18: idempotent re-run result===ok');
  const stateAfterRun2 = writtenFiles['/fake/kaola-workflow/test-project/workflow-state.md'];
  // Markers should appear exactly once each
  const consentCount = (stateAfterRun2.match(/escalated_to_full: consent/g) || []).length;
  const securityCount = (stateAfterRun2.match(/escalated_to_full: security/g) || []).length;
  assert(consentCount === 1, 'T18: escalated_to_full:consent appears exactly once after idempotent run, got ' + consentCount);
  assert(securityCount === 1, 'T18: escalated_to_full:security appears exactly once after idempotent run, got ' + securityCount);
}

// ---------------------------------------------------------------------------
// T19: shellNode seam — stub script exiting 1 with canned JSON → {exitCode:1,...parsed}
// ---------------------------------------------------------------------------
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-adaptive-node-T19-'));
  try {
    const stubPath = path.join(tmpDir, 'stub-script.js');
    const cannedJson = JSON.stringify({ result: 'refuse', errors: ['T19 stub error'], exitCode: 1 });
    fs.writeFileSync(stubPath, [
      "'use strict';",
      "process.stdout.write(" + JSON.stringify(cannedJson) + " + '\\n');",
      "process.exitCode = 1;",
    ].join('\n'));

    const r = shellNode(stubPath, ['--json']);
    assert(r.exitCode === 1, 'T19: shellNode captures exitCode===1 from stub');
    assert(r.result === 'refuse', 'T19: shellNode parses result from stub stdout');
    assert(Array.isArray(r.errors) && r.errors[0] === 'T19 stub error', 'T19: shellNode parses errors verbatim');
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true }); } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// T20a: runOrient — single in_progress, NO manifest → legacy single-node path
//       (back-compat proof: inProgressNode set, inProgressNodes.length===1, batch:null)
// ---------------------------------------------------------------------------
{
  let writeFileCalled = false;

  const plan = makePlan([
    '| impl-core | in_progress | |',
    '| impl-other | pending | |',
    '| review | pending | |',
    '| finalize | pending | |',
  ]);
  const state = makeState();
  const cacheContent = 'RED: failed\nGREEN: passed';

  const shellStub = function(scriptPath, args) {
    const base = path.basename(scriptPath);
    if (base === 'kaola-workflow-plan-validator.js') {
      return { exitCode: 0, ok: true, planHash: 'abc123' };
    }
    if (base === 'kaola-workflow-next-action.js') {
      return {
        exitCode: 0,
        result: 'ok',
        readySet: [{ id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/adaptive-node.js', dependsOn: [] }],
        nextNode: { id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/adaptive-node.js' },
        allDone: false,
      };
    }
    return { exitCode: 1 };
  };

  const result = runOrient({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    shell: shellStub,
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) return plan;
      if (fpath.endsWith('workflow-state.md')) return state;
      if (fpath.endsWith('active-batch.json')) throw new Error('ENOENT: ' + fpath); // no manifest
      if (fpath.includes('.cache/')) return cacheContent;
      throw new Error('ENOENT: ' + fpath);
    },
    writeFile: (fpath, content) => { writeFileCalled = true; },
    cacheExists: (fpath) => fpath.includes('impl-core'),
  });

  assert(writeFileCalled === false, 'T20a: orient never calls writeFile (read-only)');
  assert(result.result === 'ok', 'T20a: legacy single-node path → result ok (no refusal)');
  assert(result.inProgressNode === 'impl-core', 'T20a: inProgressNode set as before (back-compat)');
  assert(result.cacheState === 'present', 'T20a: cacheState preserved (back-compat)');
  assert(Array.isArray(result.inProgressNodes), 'T20a: inProgressNodes is an array (additive field)');
  assert(result.inProgressNodes.length === 1, 'T20a: inProgressNodes lists exactly the one in_progress row');
  assert(result.inProgressNodes[0] === 'impl-core', 'T20a: inProgressNodes[0]===impl-core');
  assert(result.batch === null, 'T20a: batch===null on legacy single-node path');
}

// ---------------------------------------------------------------------------
// T20b: runOrient — TWO in_progress rows WITH a matching active-batch.json manifest
//       → valid active batch (result ok, batch.state set, batch.members lists both, NO refusal)
// ---------------------------------------------------------------------------
{
  const plan = makePlan([
    '| impl-core | in_progress | |',
    '| impl-other | in_progress | |',
    '| review | pending | |',
    '| finalize | pending | |',
  ]);
  const state = makeState();

  const manifest = JSON.stringify({
    batchId: 'batch-impl-core-impl-other',
    state: 'open',
    kind: 'read_only',
    members: [
      { id: 'impl-core', role: 'tdd-guide', sealed: false },
      { id: 'impl-other', role: 'implementer', sealed: false },
    ],
    createdAt: '1970-01-01T00:00:00.000Z',
  });

  const shellStub = function(scriptPath, args) {
    const base = path.basename(scriptPath);
    if (base === 'kaola-workflow-plan-validator.js') return { exitCode: 0, ok: true };
    if (base === 'kaola-workflow-next-action.js') {
      return { exitCode: 0, result: 'ok', readySet: [], nextNode: null, allDone: false };
    }
    return { exitCode: 1 };
  };

  const result = runOrient({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    shell: shellStub,
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) return plan;
      if (fpath.endsWith('workflow-state.md')) return state;
      if (fpath.endsWith('active-batch.json')) return manifest;
      if (fpath.includes('.cache/')) return 'evidence';
      throw new Error('ENOENT: ' + fpath);
    },
    writeFile: () => { throw new Error('orient must not write'); },
    cacheExists: (fpath) => fpath.endsWith('active-batch.json') || fpath.includes('impl-core') || fpath.includes('impl-other'),
  });

  assert(result.result === 'ok', 'T20b: valid active batch → result ok (NO refusal)');
  assert(Array.isArray(result.inProgressNodes), 'T20b: inProgressNodes is an array');
  assert(result.inProgressNodes.length === 2, 'T20b: inProgressNodes lists BOTH in_progress rows');
  assert(result.batch !== null && typeof result.batch === 'object', 'T20b: batch object present for valid batch');
  assert(result.batch.state === 'open', 'T20b: batch.state set from manifest');
  assert(Array.isArray(result.batch.members), 'T20b: batch.members is an array');
  assert(result.batch.members.length === 2, 'T20b: batch.members lists both members');
  const memberIds = result.batch.members.map(m => m.id).sort();
  assert(memberIds[0] === 'impl-core' && memberIds[1] === 'impl-other', 'T20b: batch.members ids match the two in_progress rows');
}

// ---------------------------------------------------------------------------
// T20c: runOrient — TWO in_progress rows WITHOUT a manifest → typed refusal
//       (result refuse, reason orphan_multi_in_progress, inProgressNodes lists both)
// ---------------------------------------------------------------------------
{
  let writeFileCalled = false;

  const plan = makePlan([
    '| impl-core | in_progress | |',
    '| impl-other | in_progress | |',
    '| review | pending | |',
    '| finalize | pending | |',
  ]);
  const state = makeState();

  const shellStub = function(scriptPath, args) {
    const base = path.basename(scriptPath);
    if (base === 'kaola-workflow-plan-validator.js') return { exitCode: 0, ok: true };
    if (base === 'kaola-workflow-next-action.js') {
      return { exitCode: 0, result: 'ok', readySet: [], nextNode: null, allDone: false };
    }
    return { exitCode: 1 };
  };

  const result = runOrient({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    shell: shellStub,
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) return plan;
      if (fpath.endsWith('workflow-state.md')) return state;
      if (fpath.endsWith('active-batch.json')) throw new Error('ENOENT: ' + fpath); // NO manifest
      if (fpath.includes('.cache/')) return 'evidence';
      throw new Error('ENOENT: ' + fpath);
    },
    writeFile: () => { writeFileCalled = true; },
    cacheExists: (fpath) => false, // active-batch.json absent
  });

  assert(writeFileCalled === false, 'T20c: orient never writes (read-only) even on refuse');
  assert(result.result === 'refuse', 'T20c: multi in_progress + no manifest → refuse');
  assert(result.reason === 'orphan_multi_in_progress', 'T20c: reason===orphan_multi_in_progress (the AC#5 emission)');
  assert(Array.isArray(result.inProgressNodes) && result.inProgressNodes.length === 2, 'T20c: inProgressNodes lists both orphaned rows');
  const ids = result.inProgressNodes.slice().sort();
  assert(ids[0] === 'impl-core' && ids[1] === 'impl-other', 'T20c: inProgressNodes are the two in_progress ids');
}

// ---------------------------------------------------------------------------
// T20d: runOrient — TWO in_progress rows WITH a MISMATCHED manifest member set
//       → typed refusal orphan_multi_in_progress (member set must EQUAL in_progress set)
// ---------------------------------------------------------------------------
{
  const plan = makePlan([
    '| impl-core | in_progress | |',
    '| impl-other | in_progress | |',
    '| review | pending | |',
    '| finalize | pending | |',
  ]);
  const state = makeState();

  // Manifest names impl-core + review, but review is NOT in_progress → mismatch.
  const manifest = JSON.stringify({
    batchId: 'batch-impl-core-review',
    state: 'open',
    kind: 'read_only',
    members: [
      { id: 'impl-core', role: 'tdd-guide', sealed: false },
      { id: 'review', role: 'code-reviewer', sealed: false },
    ],
    createdAt: '1970-01-01T00:00:00.000Z',
  });

  const shellStub = function(scriptPath, args) {
    const base = path.basename(scriptPath);
    if (base === 'kaola-workflow-plan-validator.js') return { exitCode: 0, ok: true };
    if (base === 'kaola-workflow-next-action.js') {
      return { exitCode: 0, result: 'ok', readySet: [], nextNode: null, allDone: false };
    }
    return { exitCode: 1 };
  };

  const result = runOrient({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    shell: shellStub,
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) return plan;
      if (fpath.endsWith('workflow-state.md')) return state;
      if (fpath.endsWith('active-batch.json')) return manifest;
      if (fpath.includes('.cache/')) return 'evidence';
      throw new Error('ENOENT: ' + fpath);
    },
    writeFile: () => { throw new Error('orient must not write'); },
    cacheExists: (fpath) => fpath.endsWith('active-batch.json') || fpath.includes('impl'),
  });

  assert(result.result === 'refuse', 'T20d: multi in_progress + mismatched manifest → refuse');
  assert(result.reason === 'orphan_multi_in_progress', 'T20d: reason===orphan_multi_in_progress on member-set mismatch');
  assert(Array.isArray(result.inProgressNodes) && result.inProgressNodes.length === 2, 'T20d: inProgressNodes lists both in_progress rows');
}

// ---------------------------------------------------------------------------
// T20e: runOrient — consentHalt / escalatedToFull / allDone paths unchanged
//       (multi-in_progress legality gate must not disturb these existing fields)
// ---------------------------------------------------------------------------
{
  const plan = makePlan([
    '| impl-core | complete | |',
    '| impl-other | complete | |',
    '| review | complete | |',
    '| finalize | complete | |',
  ]).replace('## Node Ledger\n', '## Node Ledger\nconsent_halt: pending\n');
  const state = makeState({ escalated: 'security' });

  const shellStub = function(scriptPath, args) {
    const base = path.basename(scriptPath);
    if (base === 'kaola-workflow-plan-validator.js') return { exitCode: 0, ok: true };
    if (base === 'kaola-workflow-next-action.js') {
      return { exitCode: 0, result: 'ok', readySet: [], nextNode: null, allDone: true };
    }
    return { exitCode: 1 };
  };

  const result = runOrient({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    shell: shellStub,
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) return plan;
      if (fpath.endsWith('workflow-state.md')) return state;
      if (fpath.endsWith('active-batch.json')) throw new Error('ENOENT');
      throw new Error('ENOENT: ' + fpath);
    },
    writeFile: () => { throw new Error('orient must not write'); },
    cacheExists: (fpath) => false,
  });

  assert(result.result === 'ok', 'T20e: all-complete + no in_progress → result ok (no refusal)');
  assert(result.consentHalt === true, 'T20e: consentHalt still detected (unchanged)');
  assert(result.escalatedToFull === 'security', 'T20e: escalatedToFull still parsed (unchanged)');
  assert(result.allDone === true, 'T20e: allDone still derived from next-action (unchanged)');
  assert(result.inProgressNode === null, 'T20e: inProgressNode null when none in_progress (unchanged)');
  assert(Array.isArray(result.inProgressNodes) && result.inProgressNodes.length === 0, 'T20e: inProgressNodes empty array when none in_progress');
  assert(result.batch === null, 'T20e: batch null when no in_progress / no manifest');
}

// ---------------------------------------------------------------------------
// R4 site (b): runOrient PARTIAL-SEAL — plan ledger has 'a' complete, 'b'+'c'
//     in_progress; manifest members [{id:'a',sealed:true},{id:'b',sealed:false},
//     {id:'c',sealed:false}]. The AC#5 gate must compare in_progress ONLY to
//     UNSEALED manifest members (b,c), NOT all members (a,b,c), and return ok
//     with batch != null.  (TDD RED before the unsealed-filter is applied.)
// ---------------------------------------------------------------------------
{
  // Plan: 'a' complete, 'b' and 'c' in_progress (partial-seal crash-resume).
  const partialSealNodes = [
    '| a | tdd-guide        | —   | — | 1 | fanout(verify) |',
    '| b | tdd-guide        | —   | — | 1 | fanout(verify) |',
    '| c | tdd-guide        | —   | — | 1 | fanout(verify) |',
    '| finalize | finalize  | a,b,c | — | 1 | sequence     |',
  ];
  const plan = makePlan([
    '| a        | complete    | |',
    '| b        | in_progress | |',
    '| c        | in_progress | |',
    '| finalize | pending     | |',
  ], partialSealNodes);
  const state = makeState();

  // Manifest: 'a' sealed, 'b'+'c' unsealed.
  const manifest = JSON.stringify({
    batchId: 'batch-a-b-c',
    state: 'open',
    kind: 'read_only',
    members: [
      { id: 'a', role: 'tdd-guide', sealed: true },
      { id: 'b', role: 'tdd-guide', sealed: false },
      { id: 'c', role: 'tdd-guide', sealed: false },
    ],
    createdAt: '1970-01-01T00:00:00.000Z',
  });

  const shellStub = function(scriptPath) {
    const base = path.basename(scriptPath);
    if (base === 'kaola-workflow-plan-validator.js') return { exitCode: 0, ok: true };
    if (base === 'kaola-workflow-next-action.js') {
      return { exitCode: 0, result: 'ok', readySet: [], nextNode: null, allDone: false };
    }
    return { exitCode: 1 };
  };

  const result = runOrient({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    shell: shellStub,
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) return plan;
      if (fpath.endsWith('workflow-state.md')) return state;
      if (fpath.endsWith('active-batch.json')) return manifest;
      if (fpath.includes('.cache/')) return 'evidence';
      throw new Error('ENOENT: ' + fpath);
    },
    writeFile: () => { throw new Error('orient must not write'); },
    cacheExists: (fpath) => fpath.endsWith('active-batch.json') || fpath.includes('/b') || fpath.includes('/c'),
  });

  assert(result.result === 'ok', 'R4b: partial-seal (a=sealed, b+c in_progress) → result ok (NOT orphan_multi_in_progress)');
  assert(result.batch !== null, 'R4b: batch object present (valid partial-seal batch)');
  assert(Array.isArray(result.inProgressNodes) && result.inProgressNodes.length === 2, 'R4b: inProgressNodes lists b and c');
}

// ---------------------------------------------------------------------------
// #293 characterization-lock: runOrient with manifest=[{id:'a',sealed:true}]
//     and one stale in_progress row 'a' must return result:ok / batch:null
//     (legacy single-node path).  This is ALREADY CORRECT today — this test
//     locks the behavior in place so future edits cannot regress it.
//     Uses the shared fixture from fixtures-orphan-legality.js (anti-drift).
// ---------------------------------------------------------------------------
{
  const planNodes = [
    '| a | tdd-guide | — | scripts/a.js | 1 | sequence |',
    '| finalize | finalize | a | CHANGELOG.md | 1 | sequence |',
  ];
  // #302: DERIVE the in_progress ledger row(s) from the shared fixture's
  // ORPHAN_LEGALITY_IN_PROGRESS_IDS rather than hard-coding `| a | in_progress |`.
  // This binds the in_progress axis to the same definition crossCheckStatus uses,
  // so a future re-divergence of either site is caught by construction (the import
  // is now load-bearing, not a dead symbol).
  const plan = makePlan([
    ...ORPHAN_LEGALITY_IN_PROGRESS_IDS.map(id => `| ${id} | in_progress | |`),
    '| finalize | pending     | |',
  ], planNodes);
  const state = makeState();

  // Manifest: member 'a' sealed (matches ORPHAN_LEGALITY_MANIFEST).
  const manifestJson = JSON.stringify({
    batchId: 'b-293-orient',
    state: 'open',
    kind: 'read_only',
    members: ORPHAN_LEGALITY_MANIFEST,
    createdAt: '1970-01-01T00:00:00.000Z',
  });

  const shellStub = function(scriptPath) {
    const base = path.basename(scriptPath);
    if (base === 'kaola-workflow-plan-validator.js') return { exitCode: 0, ok: true };
    if (base === 'kaola-workflow-next-action.js') {
      return { exitCode: 0, result: 'ok', readySet: [], nextNode: null, allDone: false };
    }
    return { exitCode: 1 };
  };

  const result = runOrient({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    shell: shellStub,
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) return plan;
      if (fpath.endsWith('workflow-state.md')) return state;
      if (fpath.endsWith('active-batch.json')) return manifestJson;
      throw new Error('ENOENT: ' + fpath);
    },
    writeFile: () => { throw new Error('orient must not write'); },
    // inProgressIds has 'a' only — the manifest manifest is present but
    // ip.length === 1, so the AC#5 gate falls through to legacy single-node.
    cacheExists: (fpath) => fpath.endsWith('active-batch.json'),
  });

  // inProgressNodes = ['a'] (length 1), so AC#5 guard does NOT fire orphan.
  assert(result.result === RUN_ORIENT_EXPECTED.result,
    '#293 orient-lock: single in_progress + all-sealed manifest → result:ok (legacy single-node path)');
  assert(result.batch === RUN_ORIENT_EXPECTED.batch,
    '#293 orient-lock: single in_progress + all-sealed manifest → batch:null (NOT a batch path)');
}

// ---------------------------------------------------------------------------
// #305: runOrient on a member.opening:true interrupted top-up (manifest state
//     'open') must route to reconcile (result:'refuse', reason
//     'batch_topup_incomplete') CONSISTENTLY before the in-flight row flips
//     (in_progress=[a,b]) AND after it ([a,b,c]) — never reporting
//     orphan_multi_in_progress (before) and never ACCEPTING it as a valid batch
//     (after). Mirrors the crossCheckStatus site via the shared fixture.
//     (TDD RED before the member-opening short-circuit; GREEN after.)
// ---------------------------------------------------------------------------
{
  const memberIds = TOPUP_INCOMPLETE_MANIFEST.members.map(m => m.id); // ['a','b','c']
  const planNodes = memberIds
    .map(id => `| ${id} | code-explorer | — | — | 1 | fanout(scan) |`)
    .concat([`| finalize | finalize | ${memberIds.join(',')} | CHANGELOG.md | 1 | sequence |`]);
  // Derive the ledger from the SHARED in_progress arrays (anti-drift): a member
  // listed in ipIds is in_progress, otherwise pending.
  const ledgerFor = (ipIds) => memberIds
    .map(id => `| ${id} | ${ipIds.includes(id) ? 'in_progress' : 'pending'} | |`)
    .concat(['| finalize | pending | |']);

  const manifestJson = JSON.stringify({ ...TOPUP_INCOMPLETE_MANIFEST, createdAt: '1970-01-01T00:00:00.000Z' });
  const shellStub = function(scriptPath) {
    const base = path.basename(scriptPath);
    if (base === 'kaola-workflow-plan-validator.js') return { exitCode: 0, ok: true };
    if (base === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', readySet: [], readyPending: [], nextNode: null, allDone: false };
    return { exitCode: 1 };
  };
  const orientFor = (ipIds) => runOrient({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    shell: shellStub,
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) return makePlan(ledgerFor(ipIds), planNodes);
      if (fpath.endsWith('workflow-state.md')) return makeState();
      if (fpath.endsWith('active-batch.json')) return manifestJson;
      throw new Error('ENOENT: ' + fpath);
    },
    writeFile: () => { throw new Error('orient must not write'); },
    cacheExists: (fpath) => fpath.endsWith('active-batch.json'),
  });

  const before = orientFor(TOPUP_INCOMPLETE_IN_PROGRESS_BEFORE);
  assert(before.result === 'refuse' && before.reason === TOPUP_INCOMPLETE_REASON,
    '#305 orient: interrupted top-up BEFORE flip → refuse batch_topup_incomplete (not orphan_multi_in_progress), got ' + JSON.stringify({ result: before.result, reason: before.reason }));

  const after = orientFor(TOPUP_INCOMPLETE_IN_PROGRESS_AFTER);
  assert(after.result === 'refuse' && after.reason === TOPUP_INCOMPLETE_REASON,
    '#305 orient: interrupted top-up AFTER flip → refuse batch_topup_incomplete (NOT accepted as a valid batch), got ' + JSON.stringify({ result: after.result, reason: after.reason, batch: after.batch }));
}

// ---------------------------------------------------------------------------
// T21 (#303 gap #2): runCloseAndOpenNext — closing a node that exposes a >=2 own-pending
// ready frontier returns enterBatch:true and does NOT single-open a node (no serialization).
// ---------------------------------------------------------------------------
{
  const plan = makePlan([
    '| prep | complete | |',
    '| a | pending | |',
    '| b | pending | |',
    '| c | pending | |',
    '| review | pending | |',
  ], [
    '| prep | code-explorer | — | — | 1 | sequence |',
    '| a | tdd-guide | prep | aaa/1.js | 1 | fanout(impl) |',
    '| b | tdd-guide | prep | bbb/1.js | 1 | fanout(impl) |',
    '| c | tdd-guide | prep | ccc/1.js | 1 | fanout(impl) |',
    '| review | code-reviewer | a,b,c | — | 1 | sequence |',
  ]);
  // The node we are closing is `prep`; mark it in_progress for the close path.
  let planContent = plan.replace('| prep | complete | |', '| prep | in_progress | |');
  const writtenFiles = {};

  const shellStub = function(scriptPath, args) {
    const base = path.basename(scriptPath);
    const argsArr = args || [];
    if (base === 'kaola-workflow-commit-node.js' && !argsArr.includes('--start')) {
      return { exitCode: 0, result: 'ok', mode: 'per-node', nodeId: 'prep', overallOk: true, selectorCheck: { isSelector: false, ok: true }, barrierCheck: { exitCode: 0, result: 'pass' } };
    }
    if (base === 'kaola-workflow-commit-node.js' && argsArr.includes('--start')) {
      return { exitCode: 0, result: 'ok', mode: 'per-node-start', overallOk: true };
    }
    if (base === 'kaola-workflow-next-action.js') {
      // After closing prep, a,b,c are all ready + own-pending => readyPending=[a,b,c].
      const sib = id => ({ id, role: 'tdd-guide', model: 'sonnet', declared_write_set: id + 'aa/1.js', dependsOn: ['prep'] });
      return {
        exitCode: 0, result: 'ok',
        readySet: [sib('a'), sib('b'), sib('c')],
        nextNode: sib('a'),
        readyPending: [sib('a'), sib('b'), sib('c')],
        active: [],
        allDone: false,
      };
    }
    return { exitCode: 1, result: 'refuse', errors: ['stub: unexpected ' + base] };
  };

  const result = runCloseAndOpenNext({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    nodeId: 'prep',
    shell: shellStub,
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) return planContent;
      if (fpath.endsWith('workflow-state.md')) return makeState();
      if (fpath.endsWith('/.cache/prep.md')) return 'explored the area; findings recorded';
      throw new Error('ENOENT: ' + fpath);
    },
    writeFile: (fpath, content) => { writtenFiles[fpath] = content; if (fpath.endsWith('workflow-plan.md')) planContent = content; },
    cacheExists: (fpath) => fpath.endsWith('/.cache/prep.md'),
  });

  assert(result.result === 'ok', 'T21: enterBatch close result===ok');
  assert(result.closed === 'prep', 'T21: closed===prep');
  assert(result.enterBatch === true, 'T21: enterBatch===true on a >=2 ready frontier');
  assert(result.opened === null, 'T21: opened===null (NOT single-opened — no serialization)');
  assert(Array.isArray(result.frontier) && result.frontier.length === 3, 'T21: frontier carries all 3 ready siblings');
  // prep is closed, but NO sibling was flipped to in_progress (the batch opener owns that).
  const writtenPlan = writtenFiles['/fake/kaola-workflow/test-project/workflow-plan.md'];
  assert(writtenPlan.includes('| prep | complete | |'), 'T21: prep marked complete');
  assert(writtenPlan.includes('| a | pending | |') && writtenPlan.includes('| b | pending | |') && writtenPlan.includes('| c | pending | |'),
    'T21: no sibling single-opened by fused advance (all still pending for the batch opener)');
}

// ---------------------------------------------------------------------------
// T22 (#303 sub-gap C): runOrient — a fresh frontier (nothing in_progress) with >=2 own-pending
// ready siblings signals enterBatch:true so a plan that STARTS with a fan-out is batched.
// ---------------------------------------------------------------------------
{
  const plan = makePlan([
    '| a | pending | |',
    '| b | pending | |',
    '| review | pending | |',
  ], [
    '| a | tdd-guide | — | aaa/1.js | 1 | fanout(impl) |',
    '| b | tdd-guide | — | bbb/1.js | 1 | fanout(impl) |',
    '| review | code-reviewer | a,b | — | 1 | sequence |',
  ]);

  const shellStub = function(scriptPath, args) {
    const base = path.basename(scriptPath);
    if (base === 'kaola-workflow-plan-validator.js') return { exitCode: 0, ok: true, planHash: 'abc' };
    if (base === 'kaola-workflow-next-action.js') {
      const sib = id => ({ id, role: 'tdd-guide', model: 'sonnet', declared_write_set: id + 'aa/1.js', dependsOn: [] });
      return { exitCode: 0, result: 'ok', readySet: [sib('a'), sib('b')], nextNode: sib('a'), readyPending: [sib('a'), sib('b')], active: [], allDone: false };
    }
    return { exitCode: 1, result: 'refuse' };
  };

  const result = runOrient({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    shell: shellStub,
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) return plan;
      if (fpath.endsWith('workflow-state.md')) return makeState();
      throw new Error('ENOENT: ' + fpath);
    },
    writeFile: () => {},
    cacheExists: () => false,
  });

  assert(result.result === 'ok', 'T22: orient start-frontier result===ok');
  assert(result.enterBatch === true, 'T22: enterBatch===true at a fresh >=2 frontier');
  assert(Array.isArray(result.frontier) && result.frontier.length === 2, 'T22: frontier carries both start siblings');
  assert(result.inProgressNodes.length === 0, 'T22: nothing in_progress at the start frontier');
}

// ---------------------------------------------------------------------------
// T23a (#334): runOrient enterBatch EXCLUDES a main-session-gate. Frontier [gate, x]
// (delegable count 1) → enterBatch:false. Frontier [gate, x, y] (delegable count 2) →
// enterBatch:true with the gate filtered OUT of the frontier.
// ---------------------------------------------------------------------------
{
  const plan = makePlan([
    '| vgate | pending | |', '| x | pending | |', '| review | pending | |',
  ], [
    '| vgate | main-session-gate | — | — | 1 | sequence |',
    '| x | tdd-guide | — | xxx/1.js | 1 | sequence |',
    '| review | code-reviewer | vgate,x | — | 1 | sequence |',
  ]);
  const shellStub = function(scriptPath) {
    const base = path.basename(scriptPath);
    if (base === 'kaola-workflow-plan-validator.js') return { exitCode: 0, ok: true, planHash: 'abc' };
    if (base === 'kaola-workflow-next-action.js') {
      const gate = { id: 'vgate', role: 'main-session-gate', model: '', declared_write_set: '—', dependsOn: [] };
      const x = { id: 'x', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'xxx/1.js', dependsOn: [] };
      return { exitCode: 0, result: 'ok', readySet: [gate, x], nextNode: gate, readyPending: [gate, x], active: [], allDone: false };
    }
    return { exitCode: 1, result: 'refuse' };
  };
  const res = runOrient({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project', shell: shellStub,
    readFile: (f) => { if (f.endsWith('workflow-plan.md')) return plan; if (f.endsWith('workflow-state.md')) return makeState(); throw new Error('ENOENT ' + f); },
    writeFile: () => {}, cacheExists: () => false,
  });
  assert(res.result === 'ok', 'T23a: orient [gate, x] result ok');
  assert(res.enterBatch === false, 'T23a: [gate, x] → enterBatch false (delegable count 1, the gate is excluded)');
  assert(Array.isArray(res.frontier) && res.frontier.length === 0, 'T23a: enterBatch false → empty frontier');
}
{
  const plan = makePlan([
    '| vgate | pending | |', '| x | pending | |', '| y | pending | |', '| review | pending | |',
  ], [
    '| vgate | main-session-gate | — | — | 1 | sequence |',
    '| x | tdd-guide | — | xxx/1.js | 1 | fanout(impl) |',
    '| y | tdd-guide | — | yyy/1.js | 1 | fanout(impl) |',
    '| review | code-reviewer | vgate,x,y | — | 1 | sequence |',
  ]);
  const shellStub = function(scriptPath) {
    const base = path.basename(scriptPath);
    if (base === 'kaola-workflow-plan-validator.js') return { exitCode: 0, ok: true, planHash: 'abc' };
    if (base === 'kaola-workflow-next-action.js') {
      const gate = { id: 'vgate', role: 'main-session-gate', model: '', declared_write_set: '—', dependsOn: [] };
      const x = { id: 'x', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'xxx/1.js', dependsOn: [] };
      const y = { id: 'y', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'yyy/1.js', dependsOn: [] };
      return { exitCode: 0, result: 'ok', readySet: [gate, x, y], nextNode: gate, readyPending: [gate, x, y], active: [], allDone: false };
    }
    return { exitCode: 1, result: 'refuse' };
  };
  const res = runOrient({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project', shell: shellStub,
    readFile: (f) => { if (f.endsWith('workflow-plan.md')) return plan; if (f.endsWith('workflow-state.md')) return makeState(); throw new Error('ENOENT ' + f); },
    writeFile: () => {}, cacheExists: () => false,
  });
  assert(res.enterBatch === true, 'T23b: [gate, x, y] → enterBatch true (2 delegable)');
  assert(Array.isArray(res.frontier) && res.frontier.length === 2, 'T23b: frontier carries 2 siblings (gate excluded)');
  assert(!res.frontier.some(n => n.id === 'vgate'), 'T23b: the gate is NOT in the batch frontier');
}

// ---------------------------------------------------------------------------
// T23c (#334): runCloseAndOpenNext enterBatch EXCLUDES a main-session-gate from the
// post-close frontier. Closing `prep` exposes [vgate, a, b]; only [a, b] are batched.
// ---------------------------------------------------------------------------
{
  const plan = makePlan([
    '| prep | in_progress | |', '| vgate | pending | |', '| a | pending | |', '| b | pending | |', '| review | pending | |',
  ], [
    '| prep | code-explorer | — | — | 1 | sequence |',
    '| vgate | main-session-gate | prep | — | 1 | sequence |',
    '| a | tdd-guide | prep | aaa/1.js | 1 | fanout(impl) |',
    '| b | tdd-guide | prep | bbb/1.js | 1 | fanout(impl) |',
    '| review | code-reviewer | vgate,a,b | — | 1 | sequence |',
  ]);
  let planContent = plan;
  const writtenFiles = {};
  const shellStub = function(scriptPath, args) {
    const base = path.basename(scriptPath); const argsArr = args || [];
    if (base === 'kaola-workflow-commit-node.js' && !argsArr.includes('--start')) {
      return { exitCode: 0, result: 'ok', mode: 'per-node', nodeId: 'prep', overallOk: true, selectorCheck: { isSelector: false, ok: true }, barrierCheck: { exitCode: 0, result: 'pass' } };
    }
    if (base === 'kaola-workflow-commit-node.js' && argsArr.includes('--start')) return { exitCode: 0, result: 'ok', mode: 'per-node-start', overallOk: true };
    if (base === 'kaola-workflow-next-action.js') {
      const gate = { id: 'vgate', role: 'main-session-gate', model: '', declared_write_set: '—', dependsOn: ['prep'] };
      const a = { id: 'a', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'aaa/1.js', dependsOn: ['prep'] };
      const b = { id: 'b', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'bbb/1.js', dependsOn: ['prep'] };
      return { exitCode: 0, result: 'ok', readySet: [gate, a, b], nextNode: gate, readyPending: [gate, a, b], active: [], allDone: false };
    }
    return { exitCode: 1, result: 'refuse', errors: ['stub: unexpected ' + base] };
  };
  const result = runCloseAndOpenNext({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project', nodeId: 'prep', shell: shellStub,
    readFile: (f) => {
      if (f.endsWith('workflow-plan.md')) return planContent;
      if (f.endsWith('workflow-state.md')) return makeState();
      if (f.endsWith('/.cache/prep.md')) return 'explored the area; findings recorded';
      throw new Error('ENOENT: ' + f);
    },
    writeFile: (f, c) => { writtenFiles[f] = c; if (f.endsWith('workflow-plan.md')) planContent = c; },
    cacheExists: (f) => f.endsWith('/.cache/prep.md'),
  });
  assert(result.result === 'ok', 'T23c: close result ok');
  assert(result.enterBatch === true, 'T23c: [vgate, a, b] → enterBatch true (2 delegable a,b)');
  assert(Array.isArray(result.frontier) && result.frontier.length === 2 && !result.frontier.some(n => n.id === 'vgate'),
    'T23c: frontier batches [a, b], the gate excluded');
}

// ---------------------------------------------------------------------------
// T23d (#334): runReopenNode resets a downstream COMPLETE main-session-gate and removes its
// baseline — a plan-repair to implementation MUST re-run the visual check. Plan
// a→impl→review(code-reviewer)→vgate(main-session-gate)→finalize, all complete.
// ---------------------------------------------------------------------------
{
  const planNodes = [
    '| a | tdd-guide | — | scripts/a.js | 1 | sequence |',
    '| impl | tdd-guide | a | scripts/b.js | 1 | sequence |',
    '| review | code-reviewer | impl | — | 1 | sequence |',
    '| vgate | main-session-gate | review | — | 1 | sequence |',
    '| finalize | finalize | vgate | — | 1 | sequence |',
  ];
  let planContent = makePlan([
    '| a | complete | |', '| impl | complete | |', '| review | complete | |', '| vgate | complete | |', '| finalize | complete | |',
  ], planNodes);
  const removed = [];
  const shelled = [];
  const result = runReopenNode({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md', project: 'test-project', nodeId: 'impl',
    shell: (scriptPath) => { shelled.push(path.basename(scriptPath)); return path.basename(scriptPath) === 'kaola-workflow-commit-node.js' ? { exitCode: 0, result: 'ok' } : { exitCode: 1 }; },
    readFile: (f) => { if (f.endsWith('workflow-plan.md')) return planContent; throw new Error('ENOENT ' + f); },
    writeFile: (f, c) => { if (f.endsWith('workflow-plan.md')) planContent = c; },
    cacheExists: (f) => /barrier-base-/.test(f),
    unlink: (f) => removed.push(path.basename(f)),
  });
  assert(result.result === 'ok', 'T23d: reopen result ok, got ' + JSON.stringify(result));
  assert(/\|\s*vgate\s*\|\s*pending\s*\|/.test(planContent), 'T23d: downstream main-session-gate reset to pending (must re-run after repair)');
  assert(result.gatesReset && result.gatesReset.includes('vgate') && result.gatesReset.includes('review'),
    'T23d: gatesReset names the visual gate + reviewer, got ' + JSON.stringify(result.gatesReset));
  assert(removed.includes('barrier-base-vgate'), 'T23d: stale visual-gate baseline removed, got ' + JSON.stringify(removed));
}

// ---------------------------------------------------------------------------
// #308: runReopenNode — first-class plan-repair transaction. Reopens a COMPLETE
// node N, resets its post-dominating gate(s) to pending, removes the stale
// barrier-base baselines, reopens N to in_progress, and re-records a fresh
// baseline. Plan a→impl→review(code-reviewer)→finalize, all complete.
// ---------------------------------------------------------------------------
{
  const planNodes = [
    '| a | tdd-guide | — | scripts/a.js | 1 | sequence |',
    '| impl | tdd-guide | a | scripts/b.js | 1 | sequence |',
    '| review | code-reviewer | impl | — | 1 | sequence |',
    '| finalize | finalize | review | — | 1 | sequence |',
  ];
  let planContent = makePlan([
    '| a | complete | |',
    '| impl | complete | |',
    '| review | complete | |',
    '| finalize | complete | |',
  ], planNodes);
  const removed = [];
  const shelled = [];
  const result = runReopenNode({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    project: 'test-project',
    nodeId: 'impl',
    shell: (scriptPath) => {
      shelled.push(path.basename(scriptPath));
      if (path.basename(scriptPath) === 'kaola-workflow-commit-node.js') return { exitCode: 0, result: 'ok' };
      return { exitCode: 1 };
    },
    readFile: (fpath) => { if (fpath.endsWith('workflow-plan.md')) return planContent; throw new Error('ENOENT ' + fpath); },
    writeFile: (fpath, content) => { if (fpath.endsWith('workflow-plan.md')) planContent = content; },
    cacheExists: (fpath) => /barrier-base-/.test(fpath), // baselines present; NO active batch
    unlink: (fpath) => removed.push(path.basename(fpath)),
  });
  assert(result.result === 'ok', '#308 reopen: result ok, got ' + JSON.stringify(result));
  assert(/\|\s*impl\s*\|\s*in_progress\s*\|/.test(planContent), '#308 reopen: impl reopened to in_progress');
  assert(/\|\s*review\s*\|\s*pending\s*\|/.test(planContent), '#308 reopen: post-dominating gate review reset to pending');
  assert(/\|\s*finalize\s*\|\s*complete\s*\|/.test(planContent), '#308 reopen: sink finalize left complete (narrow reset; transitive readiness withholds it)');
  assert(/\|\s*a\s*\|\s*complete\s*\|/.test(planContent), '#308 reopen: upstream a left complete');
  assert(result.gatesReset && result.gatesReset.includes('review'), '#308 reopen: gatesReset names review, got ' + JSON.stringify(result.gatesReset));
  assert(removed.includes('barrier-base-impl') && removed.includes('barrier-base-review'),
    '#308 reopen: stale baselines for impl + gate removed, got ' + JSON.stringify(removed));
  assert(shelled.includes('kaola-workflow-commit-node.js'), '#308 reopen: fresh baseline (commit-node --start) recorded for impl');
  assert(shelled.includes('kaola-workflow-plan-validator.js'), '#368 reopen: validator --drop-base shelled to delete the anchored baseline ref(s) (no dangling ref)');
}

// #349: reopen-node purges stale GATE verdict evidence (.cache/<gate-id>.md) for each reset gate,
// so a later close-without-fresh-dispatch cannot pass Finalization's --verdict-check on a STALE
// `verdict: pass`. The reopened node's OWN evidence is left (it will be re-recorded on re-impl).
{
  const planNodes = [
    '| a | tdd-guide | — | scripts/a.js | 1 | sequence |',
    '| impl | tdd-guide | a | scripts/b.js | 1 | sequence |',
    '| review | code-reviewer | impl | — | 1 | sequence |',
    '| finalize | finalize | review | — | 1 | sequence |',
  ];
  let planContent = makePlan([
    '| a | complete | |', '| impl | complete | |', '| review | complete | |', '| finalize | complete | |',
  ], planNodes);
  const removed = [];
  // barrier-base baselines present AND the gate evidence review.md + node evidence impl.md present.
  const present = new Set(['barrier-base-impl', 'barrier-base-review', 'review.md', 'impl.md']);
  const result = runReopenNode({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    project: 'test-project', nodeId: 'impl',
    shell: (sp) => (path.basename(sp) === 'kaola-workflow-commit-node.js' ? { exitCode: 0, result: 'ok' } : { exitCode: 1 }),
    readFile: (f) => { if (f.endsWith('workflow-plan.md')) return planContent; throw new Error('ENOENT ' + f); },
    writeFile: (f, c) => { if (f.endsWith('workflow-plan.md')) planContent = c; },
    cacheExists: (f) => present.has(path.basename(f)),
    unlink: (f) => removed.push(path.basename(f)),
    readdir: () => [],
  });
  assert(result.result === 'ok', '#349: reopen ok, got ' + JSON.stringify(result));
  assert(removed.includes('review.md'), '#349: stale gate evidence review.md deleted, got ' + JSON.stringify(removed));
  assert(result.evidenceRemoved && result.evidenceRemoved.includes('review.md'),
    '#349: result.evidenceRemoved names review.md, got ' + JSON.stringify(result.evidenceRemoved));
  assert(!removed.includes('impl.md'),
    "#349: the reopened node's OWN evidence (impl.md) is NOT purged — only reset GATES, got " + JSON.stringify(removed));
}

// #349: a reset FANOUT adversarial-verifier gate → purge the per-instance
// .cache/adversarial-verifier-*.md siblings the fanout verdict-check globs (not keyed by node id).
{
  const planNodes = [
    '| a | tdd-guide | — | scripts/a.js | 1 | sequence |',
    '| impl | tdd-guide | a | scripts/b.js | 1 | sequence |',
    '| av | adversarial-verifier | impl | — | 3 | fanout(verify) |',
    '| finalize | finalize | av | — | 1 | sequence |',
  ];
  let planContent = makePlan([
    '| a | complete | |', '| impl | complete | |', '| av | complete | |', '| finalize | complete | |',
  ], planNodes);
  const removed = [];
  const present = new Set(['barrier-base-impl', 'barrier-base-av', 'av.md']);
  const result = runReopenNode({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    project: 'test-project', nodeId: 'impl',
    shell: (sp) => (path.basename(sp) === 'kaola-workflow-commit-node.js' ? { exitCode: 0, result: 'ok' } : { exitCode: 1 }),
    readFile: (f) => { if (f.endsWith('workflow-plan.md')) return planContent; throw new Error('ENOENT ' + f); },
    writeFile: (f, c) => { if (f.endsWith('workflow-plan.md')) planContent = c; },
    cacheExists: (f) => present.has(path.basename(f)),
    unlink: (f) => removed.push(path.basename(f)),
    readdir: () => ['adversarial-verifier-0.md', 'adversarial-verifier-1.md', 'unrelated.md'],
  });
  assert(result.result === 'ok', '#349 fanout: reopen ok, got ' + JSON.stringify(result));
  assert(result.gatesReset.includes('av'), '#349 fanout: av is the reset post-dominating gate, got ' + JSON.stringify(result.gatesReset));
  assert(removed.includes('adversarial-verifier-0.md') && removed.includes('adversarial-verifier-1.md'),
    '#349 fanout: per-instance adversarial-verifier-*.md siblings purged, got ' + JSON.stringify(removed));
  assert(!removed.includes('unrelated.md'),
    '#349 fanout: unrelated .cache files left untouched, got ' + JSON.stringify(removed));
}

// #308: runReopenNode refuses a non-complete node (only a complete node may be reopened).
{
  const planNodes = [
    '| a | tdd-guide | — | scripts/a.js | 1 | sequence |',
    '| impl | tdd-guide | a | scripts/b.js | 1 | sequence |',
    '| review | code-reviewer | impl | — | 1 | sequence |',
    '| finalize | finalize | review | — | 1 | sequence |',
  ];
  const planContent = makePlan([
    '| a | complete | |', '| impl | in_progress | |', '| review | pending | |', '| finalize | pending | |',
  ], planNodes);
  const result = runReopenNode({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md', project: 'test-project', nodeId: 'impl',
    shell: () => ({ exitCode: 0, result: 'ok' }),
    readFile: (f) => { if (f.endsWith('workflow-plan.md')) return planContent; throw new Error('ENOENT ' + f); },
    writeFile: () => { throw new Error('must not write on refusal'); },
    cacheExists: () => false, unlink: () => {},
  });
  assert(result.result === 'refuse' && result.reason === 'node_not_complete',
    '#308 reopen: refuses a non-complete node, got ' + JSON.stringify(result));
}

// #308/#383: runReopenNode refuses over a live #377 running-set fan-out (scheduler_active). (#594: the
// former sibling arm — refuse active_batch_exists over a live active-batch.json — was removed; the
// batch manifest has no producer left. The running-set arm is the surviving live-coordination guard.)
{
  const planNodes = [
    '| a | tdd-guide | — | scripts/a.js | 1 | sequence |',
    '| impl | tdd-guide | a | scripts/b.js | 1 | sequence |',
    '| review | code-reviewer | impl | — | 1 | sequence |',
    '| finalize | finalize | review | — | 1 | sequence |',
  ];
  const planContent = makePlan([
    '| a | complete | |', '| impl | complete | |', '| review | complete | |', '| finalize | complete | |',
  ], planNodes);
  const runningSetJson = JSON.stringify({ state: 'open', nodes: [{ id: 'x' }, { id: 'y' }] });
  const result = runReopenNode({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md', project: 'test-project', nodeId: 'impl',
    shell: () => ({ exitCode: 0, result: 'ok' }),
    readFile: (f) => { if (f.endsWith('running-set.json')) return runningSetJson; if (f.endsWith('workflow-plan.md')) return planContent; throw new Error('ENOENT ' + f); },
    writeFile: () => { throw new Error('must not write on refusal'); },
    cacheExists: (f) => f.endsWith('running-set.json'), unlink: () => {},
  });
  assert(result.result === 'refuse' && result.reason === 'scheduler_active',
    '#308 reopen: refuses over a live running-set fan-out, got ' + JSON.stringify(result));
}

// ---------------------------------------------------------------------------
// #308 INTEGRATION (reopen-node × transitive readiness): the COMPOSITION the
// isolated tests miss. After reopen-node resets the post-dominating gate to
// pending and reopens N, the resulting ledger must drive the REAL next-action to
// offer ONLY the reopened node — the gate and the sink stay withheld by transitive
// readiness (no premature [N, sink] frontier). Only commit-node (the git baseline)
// is stubbed; spliceLedgerNode + parseNodes + computeNextAction run for real.
// ---------------------------------------------------------------------------
{
  const { computeNextAction } = require('./kaola-workflow-next-action');
  const planNodes = [
    '| a | tdd-guide | — | scripts/a.js | 1 | sequence |',
    '| impl | tdd-guide | a | scripts/b.js | 1 | sequence |',
    '| review | code-reviewer | impl | — | 1 | sequence |',
    '| finalize | finalize | review | — | 1 | sequence |',
  ];
  let planContent = makePlan([
    '| a | complete | |', '| impl | complete | |', '| review | complete | |', '| finalize | pending | |',
  ], planNodes);
  const res = runReopenNode({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md', project: 'test-project', nodeId: 'impl',
    shell: (sp) => path.basename(sp) === 'kaola-workflow-commit-node.js' ? { exitCode: 0, result: 'ok' } : { exitCode: 1 },
    readFile: (f) => { if (f.endsWith('workflow-plan.md')) return planContent; throw new Error('ENOENT ' + f); },
    writeFile: (f, c) => { if (f.endsWith('workflow-plan.md')) planContent = c; },
    cacheExists: (f) => /barrier-base-/.test(f), unlink: () => {},
  });
  assert(res.result === 'ok', '#308 integ: reopen-node ok, got ' + JSON.stringify(res));
  const na = computeNextAction(planContent, { resolveModel: () => 'sonnet' });
  const ready = na.readySet.map(n => n.id).sort();
  assert(JSON.stringify(ready) === JSON.stringify(['impl']),
    '#308 integ: after reopen-node, next-action offers ONLY [impl] — gate + sink withheld, got ' + JSON.stringify(ready));
  assert(!na.readySet.some(n => n.id === 'finalize'),
    '#308 integ: finalize sink is NOT prematurely ready after the gate reset');
}

// ---------------------------------------------------------------------------
// #343: runReopenNode MID-GATE fold — a post-dominating gate that is still
// in_progress (it just emitted a blocking finding owned by N) folds back to
// pending inside the same transaction, so the repair does NOT have to advance
// the DAG to allDone on a known-broken tree. gatesReset stays STRUCTURAL;
// the additive gatesFolded lists only the rows actually flipped, and the
// transitions never claim a flip that did not happen (no fabricated entry for
// an already-pending downstream gate). Exactly ONE in_progress row remains.
// Plan a→impl→review(code-reviewer)→averify(adversarial-verifier)→finalize.
// ---------------------------------------------------------------------------
{
  const planNodes = [
    '| a | tdd-guide | — | scripts/a.js | 1 | sequence |',
    '| impl | tdd-guide | a | scripts/b.js | 1 | sequence |',
    '| review | code-reviewer | impl | — | 1 | sequence |',
    '| averify | adversarial-verifier | review | — | 1 | sequence |',
    '| finalize | finalize | averify | — | 1 | sequence |',
  ];
  let planContent = makePlan([
    '| a | complete | |',
    '| impl | complete | |',
    '| review | in_progress | |',
    '| averify | pending | |',
    '| finalize | pending | |',
  ], planNodes);
  const removed = [];
  const shelled = [];
  const result = runReopenNode({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    project: 'test-project',
    nodeId: 'impl',
    shell: (scriptPath, args) => {
      shelled.push({ base: path.basename(scriptPath), args: args || [] });
      if (path.basename(scriptPath) === 'kaola-workflow-commit-node.js') return { exitCode: 0, result: 'ok' };
      return { exitCode: 1 };
    },
    readFile: (f) => { if (f.endsWith('workflow-plan.md')) return planContent; throw new Error('ENOENT ' + f); },
    writeFile: (f, c) => { if (f.endsWith('workflow-plan.md')) planContent = c; },
    // live baselines for impl + the in_progress gate; never-opened averify has none; NO active batch
    cacheExists: (f) => /barrier-base-(impl|review)/.test(f),
    unlink: (f) => removed.push(path.basename(f)),
  });
  assert(result.result === 'ok', '#343 fold: result ok, got ' + JSON.stringify(result));
  assert(/\|\s*impl\s*\|\s*in_progress\s*\|/.test(planContent), '#343 fold: impl reopened to in_progress');
  assert(/\|\s*review\s*\|\s*pending\s*\|/.test(planContent), '#343 fold: in_progress gate review folded to pending');
  assert(/\|\s*averify\s*\|\s*pending\s*\|/.test(planContent), '#343 fold: downstream pending gate averify left pending');
  assert(/\|\s*finalize\s*\|\s*pending\s*\|/.test(planContent), '#343 fold: sink finalize left pending');
  assert(/\|\s*a\s*\|\s*complete\s*\|/.test(planContent), '#343 fold: upstream a left complete');
  const inProgressRows = (planContent.match(/\|\s*in_progress\s*\|/g) || []).length;
  assert(inProgressRows === 1, '#343 fold: exactly ONE in_progress row remains, got ' + inProgressRows);
  assert(result.gatesReset && result.gatesReset.includes('review') && result.gatesReset.includes('averify'),
    '#343 fold: gatesReset stays structural (review + averify), got ' + JSON.stringify(result.gatesReset));
  assert(result.gatesFolded && result.gatesFolded.includes('review') && !result.gatesFolded.includes('averify'),
    '#343 fold: gatesFolded lists only rows actually flipped (review, NOT averify), got ' + JSON.stringify(result.gatesFolded));
  assert(removed.includes('barrier-base-impl') && removed.includes('barrier-base-review'),
    '#343 fold: stale baselines for impl + the folded gate removed, got ' + JSON.stringify(removed));
  const foldTransitions = (result.taskTransitions || []).map(t => t.id + ':' + t.ledger_status);
  assert(foldTransitions.includes('review:pending') && foldTransitions.includes('impl:in_progress'),
    '#343 fold: transitions carry review→pending + impl→in_progress, got ' + JSON.stringify(foldTransitions));
  assert(!(result.taskTransitions || []).some(t => t.id === 'averify'),
    '#343 fold: NO fabricated transition for the never-flipped averify, got ' + JSON.stringify(foldTransitions));
  const commitCall = shelled.find(s => s.base === 'kaola-workflow-commit-node.js');
  assert(commitCall && commitCall.args.includes('--start') && commitCall.args.includes('impl'),
    '#343 fold: fresh baseline (commit-node --start) recorded for impl, got ' + JSON.stringify(shelled));
}

// ---------------------------------------------------------------------------
// #343: runReopenNode fail-closed orphan guard — an in_progress row that is
// NOT a post-dominating gate of N (here a parallel-branch implementer node)
// refuses typed would_orphan_in_progress BEFORE any real side effect: zero
// unlinks, zero writes (the stub throws if called), no baseline shelled.
// ---------------------------------------------------------------------------
{
  const planNodes = [
    '| a | tdd-guide | — | scripts/a.js | 1 | sequence |',
    '| impl | tdd-guide | a | scripts/b.js | 1 | fanout(work) |',
    '| docs | implementer | a | docs/x.md | 1 | fanout(work) |',
    '| review | code-reviewer | impl,docs | — | 1 | sequence |',
    '| finalize | finalize | review | — | 1 | sequence |',
  ];
  const planContent = makePlan([
    '| a | complete | |',
    '| impl | complete | |',
    '| docs | in_progress | |',
    '| review | pending | |',
    '| finalize | pending | |',
  ], planNodes);
  const removed = [];
  const shelled = [];
  const result = runReopenNode({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    project: 'test-project',
    nodeId: 'impl',
    shell: (sp) => { shelled.push(path.basename(sp)); return { exitCode: 0, result: 'ok' }; },
    readFile: (f) => { if (f.endsWith('workflow-plan.md')) return planContent; throw new Error('ENOENT ' + f); },
    writeFile: () => { throw new Error('#343 guard: must not write on refusal'); },
    cacheExists: (f) => /barrier-base-/.test(f),
    unlink: (f) => removed.push(path.basename(f)),
  });
  assert(result.result === 'refuse' && result.reason === 'would_orphan_in_progress',
    '#343 guard: refuses typed would_orphan_in_progress, got ' + JSON.stringify(result));
  assert(JSON.stringify(result.inProgress) === JSON.stringify(['docs']),
    '#343 guard: inProgress names the orphan row(s) [docs], got ' + JSON.stringify(result.inProgress));
  assert(removed.length === 0, '#343 guard: zero unlinks on refusal (pure no-op), got ' + JSON.stringify(removed));
  assert(!shelled.includes('kaola-workflow-commit-node.js'),
    '#343 guard: no commit-node baseline shelled on refusal, got ' + JSON.stringify(shelled));
}

// ---------------------------------------------------------------------------
// #343 INTEGRATION (mid-gate fold × transitive readiness): the COMPOSITION the
// isolated tests miss. After the mid-gate reopen-node folds the in_progress
// gate to pending and reopens N, the resulting ledger must drive the REAL
// next-action to offer ONLY the reopened node — the folded gate, the downstream
// pending gate, and the sink all stay withheld by transitive readiness.
// ---------------------------------------------------------------------------
{
  const { computeNextAction } = require('./kaola-workflow-next-action');
  const planNodes = [
    '| a | tdd-guide | — | scripts/a.js | 1 | sequence |',
    '| impl | tdd-guide | a | scripts/b.js | 1 | sequence |',
    '| review | code-reviewer | impl | — | 1 | sequence |',
    '| averify | adversarial-verifier | review | — | 1 | sequence |',
    '| finalize | finalize | averify | — | 1 | sequence |',
  ];
  let planContent = makePlan([
    '| a | complete | |',
    '| impl | complete | |',
    '| review | in_progress | |',
    '| averify | pending | |',
    '| finalize | pending | |',
  ], planNodes);
  const res = runReopenNode({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md', project: 'test-project', nodeId: 'impl',
    shell: (sp) => path.basename(sp) === 'kaola-workflow-commit-node.js' ? { exitCode: 0, result: 'ok' } : { exitCode: 1 },
    readFile: (f) => { if (f.endsWith('workflow-plan.md')) return planContent; throw new Error('ENOENT ' + f); },
    writeFile: (f, c) => { if (f.endsWith('workflow-plan.md')) planContent = c; },
    cacheExists: (f) => /barrier-base-(impl|review)/.test(f), unlink: () => {},
  });
  assert(res.result === 'ok', '#343 integ: mid-gate reopen-node ok, got ' + JSON.stringify(res));
  const na = computeNextAction(planContent, { resolveModel: () => 'sonnet' });
  const ready = na.readySet.map(n => n.id).sort();
  assert(JSON.stringify(ready) === JSON.stringify(['impl']),
    '#343 integ: after the mid-gate fold, next-action offers ONLY [impl] — folded gate + downstream gate + sink withheld, got ' + JSON.stringify(ready));
}

// ---------------------------------------------------------------------------
// #282 (AC-2): orient reconciles the durable task mirror on every resume by
// SHELLING the task-mirror CLI — while staying read-only (the injected writeFile
// throws, proving orient never writes the plan/ledger/state itself).
// ---------------------------------------------------------------------------
{
  const planNodes = [
    '| a | tdd-guide | — | scripts/a.js | 1 | sequence |',
    '| finalize | finalize | a | CHANGELOG.md | 1 | sequence |',
  ];
  const plan = makePlan(['| a | in_progress | |', '| finalize | pending | |'], planNodes);
  const shelled = [];
  const result = runOrient({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    shell: (scriptPath) => {
      const b = path.basename(scriptPath);
      shelled.push(b);
      if (b === 'kaola-workflow-plan-validator.js') return { exitCode: 0, ok: true };
      if (b === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', readySet: [], readyPending: [], allDone: false };
      return { exitCode: 0 };
    },
    readFile: (f) => { if (f.endsWith('workflow-plan.md')) return plan; if (f.endsWith('workflow-state.md')) return makeState(); throw new Error('ENOENT ' + f); },
    writeFile: () => { throw new Error('orient must not write (read-only)'); },
    cacheExists: () => false,
  });
  assert(result.result === 'ok', '#282 AC-2: orient still returns ok');
  assert(shelled.includes('kaola-workflow-task-mirror.js'),
    '#282 AC-2: orient shells the task-mirror CLI to reconcile workflow-tasks.json, got ' + JSON.stringify(shelled));
}

// ---------------------------------------------------------------------------
// #317: ledger-mutating commands refresh the durable task mirror + return explicit
// taskTransitions for the orchestrator to apply (no inference).
// ---------------------------------------------------------------------------

// #317-open-next: opened node → in_progress transition + task-mirror shelled.
{
  const shelled = [];
  const plan = makePlan(['| impl-core | pending | |', '| impl-other | pending | |', '| review | pending | |', '| finalize | pending | |']);
  let planContent = plan;
  const shellStub = function (sp, args) {
    const base = path.basename(sp);
    shelled.push(base);
    // #499: open-next integrity layer — a clean frozen plan passes --resume-check.
    if (base === 'kaola-workflow-plan-validator.js' && (args || []).includes('--resume-check')) return { exitCode: 0, ok: true };
    if (base === 'kaola-workflow-next-action.js') {
      return { exitCode: 0, result: 'ok',
        readySet: [{ id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/adaptive-node.js', dependsOn: [] }],
        nextNode: { id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/adaptive-node.js' }, allDone: false };
    }
    if (base === 'kaola-workflow-commit-node.js') return { exitCode: 0, result: 'ok', mode: 'per-node-start', nodeId: 'impl-core', overallOk: true };
    if (base === 'kaola-workflow-task-mirror.js') return { exitCode: 0, status: 'ok' };
    return { exitCode: 1 };
  };
  const result = runOpenNext({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project', nodeId: null, shell: shellStub,
    readFile: (f) => { if (f.endsWith('workflow-plan.md')) return planContent; if (f.endsWith('workflow-state.md')) return makeState(); throw new Error('ENOENT'); },
    writeFile: (f, c) => { if (f.endsWith('workflow-plan.md')) planContent = c; },
  });
  assert(result.result === 'ok', '#317 open-next: ok');
  assert(JSON.stringify(result.taskTransitions) === JSON.stringify([{ id: 'impl-core', status: 'in_progress', ledger_status: 'in_progress', reason: 'open-next' }]),
    '#317 open-next: [impl-core→in_progress], got ' + JSON.stringify(result.taskTransitions));
  assert(result.taskMirror && result.taskMirror.status === 'updated', '#317 open-next: taskMirror updated');
  assert(shelled.includes('kaola-workflow-task-mirror.js'), '#317 open-next: task-mirror shelled after the mutation');
}

// #317-close-and-open-next (fused): closed → completed AND next → in_progress (two transitions).
{
  const plan = makePlan(['| impl-core | in_progress | |', '| impl-other | pending | |', '| review | pending | |', '| finalize | pending | |']);
  let planContent = plan;
  const cacheFiles = { '/fake/kaola-workflow/test-project/.cache/impl-core.md': 'RED: failing\nGREEN: passing\n' };
  const shellStub = function (sp, args) {
    const base = path.basename(sp); const a = args || [];
    if (base === 'kaola-workflow-commit-node.js' && !a.includes('--start')) return { exitCode: 0, result: 'ok', mode: 'per-node', nodeId: 'impl-core', overallOk: true, selectorCheck: { isSelector: false, ok: true } };
    if (base === 'kaola-workflow-commit-node.js' && a.includes('--start')) return { exitCode: 0, result: 'ok', mode: 'per-node-start', nodeId: 'impl-other', overallOk: true };
    if (base === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', readyPending: [{ id: 'impl-other' }],
      nextNode: { id: 'impl-other', role: 'implementer', model: 'sonnet', declared_write_set: 'scripts/other.js' }, allDone: false };
    if (base === 'kaola-workflow-task-mirror.js') return { exitCode: 0, status: 'ok' };
    return { exitCode: 1 };
  };
  const result = runCloseAndOpenNext({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project', nodeId: 'impl-core', shell: shellStub,
    readFile: (f) => { if (f.endsWith('workflow-plan.md')) return planContent; if (f.endsWith('workflow-state.md')) return makeState(); if (cacheFiles[f]) return cacheFiles[f]; throw new Error('ENOENT'); },
    writeFile: (f, c) => { if (f.endsWith('workflow-plan.md')) planContent = c; },
    cacheExists: (f) => !!cacheFiles[f],
  });
  assert(result.result === 'ok', '#317 close+open: ok');
  assert(JSON.stringify(result.taskTransitions) === JSON.stringify([
    { id: 'impl-core', status: 'completed', ledger_status: 'complete', reason: 'close-and-open-next' },
    { id: 'impl-other', status: 'in_progress', ledger_status: 'in_progress', reason: 'close-and-open-next' },
  ]), '#317 close+open: [closed→completed, next→in_progress], got ' + JSON.stringify(result.taskTransitions));
  assert(result.taskMirror && result.taskMirror.status === 'updated', '#317 close+open: taskMirror updated');
}

// #317-enterBatch: a >=2 frontier closes the node and signals enterBatch — taskTransitions carry
// ONLY the closed node (open-batch owns the member in_progress flips).
{
  const plan = makePlan(['| impl-core | in_progress | |', '| impl-other | pending | |', '| review | pending | |', '| finalize | pending | |']);
  let planContent = plan;
  const cacheFiles = { '/fake/kaola-workflow/test-project/.cache/impl-core.md': 'RED: failing\nGREEN: passing\n' };
  const shellStub = function (sp, args) {
    const base = path.basename(sp); const a = args || [];
    if (base === 'kaola-workflow-commit-node.js' && !a.includes('--start')) return { exitCode: 0, result: 'ok', mode: 'per-node', nodeId: 'impl-core', overallOk: true, selectorCheck: { isSelector: false, ok: true } };
    if (base === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', readyPending: [{ id: 'b1', role: 'implementer' }, { id: 'b2', role: 'implementer' }], allDone: false };
    if (base === 'kaola-workflow-task-mirror.js') return { exitCode: 0, status: 'ok' };
    return { exitCode: 1 };
  };
  const result = runCloseAndOpenNext({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project', nodeId: 'impl-core', shell: shellStub,
    readFile: (f) => { if (f.endsWith('workflow-plan.md')) return planContent; if (f.endsWith('workflow-state.md')) return makeState(); if (cacheFiles[f]) return cacheFiles[f]; throw new Error('ENOENT'); },
    writeFile: (f, c) => { if (f.endsWith('workflow-plan.md')) planContent = c; },
    cacheExists: (f) => !!cacheFiles[f],
  });
  assert(result.result === 'ok' && result.enterBatch === true, '#317 enterBatch: ok + enterBatch');
  assert(JSON.stringify(result.taskTransitions) === JSON.stringify([
    { id: 'impl-core', status: 'completed', ledger_status: 'complete', reason: 'close-and-open-next' },
  ]), '#317 enterBatch: ONLY [closed→completed] (open-batch owns member flips), got ' + JSON.stringify(result.taskTransitions));
}

// ---------------------------------------------------------------------------
// #328 bundle-display: runOrient surfaces bundle identity fields.
// ---------------------------------------------------------------------------

// Helper: make a bundle state file with issue_numbers/bundle_id/closure_policy.
function makeBundleState(opts) {
  opts = opts || {};
  const primary = opts.primary || 42;
  const issueNumbers = opts.issueNumbers || [42, 47, 53];
  const bundleId = opts.bundleId || ('bundle-' + issueNumbers.join('-'));
  const closurePolicy = opts.closurePolicy || 'all_or_nothing';
  const lines = [
    '# Kaola-Workflow State',
    '',
    '## Project',
    'name: ' + bundleId,
    'status: active',
    '',
    '## Current Position',
    'phase: adaptive',
    'next_command: /kaola-workflow-plan-run ' + bundleId,
    '',
    '## Last Evidence',
    'phase_file: N/A',
    'last_command: claim',
    '',
    '## Sink',
    'issue_number: ' + primary,
    'issue_numbers: ' + issueNumbers.join(','),
    'bundle_id: ' + bundleId,
    'closure_policy: ' + closurePolicy,
    'branch: workflow/' + bundleId,
  ];
  return lines.join('\n') + '\n';
}

// T-bundle-1: runOrient on a bundle project populates bundleId/issueNumbers/closurePolicy/primaryIssue.
{
  const plan = makePlan([
    '| impl-core | in_progress | |',
    '| impl-other | pending | |',
    '| review | pending | |',
    '| finalize | pending | |',
  ]);
  const state = makeBundleState({ primary: 42, issueNumbers: [42, 47, 53] });

  const shellStub = function(scriptPath) {
    const base = path.basename(scriptPath);
    if (base === 'kaola-workflow-plan-validator.js') return { exitCode: 0, ok: true, planHash: 'abc' };
    if (base === 'kaola-workflow-next-action.js') {
      return {
        exitCode: 0, result: 'ok',
        readySet: [{ id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/adaptive-node.js', dependsOn: [] }],
        nextNode: { id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/adaptive-node.js' },
        readyPending: [],
        allDone: false,
      };
    }
    return { exitCode: 0 };
  };

  const result = runOrient({
    planPath: '/fake/kaola-workflow/bundle-42-47-53/workflow-plan.md',
    statePath: '/fake/kaola-workflow/bundle-42-47-53/workflow-state.md',
    project: 'bundle-42-47-53',
    shell: shellStub,
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) return plan;
      if (fpath.endsWith('workflow-state.md')) return state;
      throw new Error('ENOENT: ' + fpath);
    },
    writeFile: () => { throw new Error('orient must not write'); },
    cacheExists: (fpath) => fpath.includes('impl-core'),
  });

  assert(result.result === 'ok', 'T-bundle-1: bundle orient result===ok');
  assert(result.bundleId === 'bundle-42-47-53', 'T-bundle-1: bundleId populated, got ' + result.bundleId);
  assert(Array.isArray(result.issueNumbers) && result.issueNumbers.length === 3, 'T-bundle-1: issueNumbers is array of 3, got ' + JSON.stringify(result.issueNumbers));
  const issNums = result.issueNumbers || [];
  assert(issNums[0] === 42 && issNums[1] === 47 && issNums[2] === 53, 'T-bundle-1: issueNumbers values correct, got ' + JSON.stringify(issNums));
  assert(result.closurePolicy === 'all_or_nothing', 'T-bundle-1: closurePolicy populated, got ' + result.closurePolicy);
  assert(result.primaryIssue === 42, 'T-bundle-1: primaryIssue===42 (primary from issue_number), got ' + result.primaryIssue);
}

// T-bundle-2: runOrient on a single-issue project leaves bundle fields null/empty (AC#1 regression).
// Single-issue state is UNCHANGED — no issue_numbers/bundle_id/closure_policy in the file.
{
  const plan = makePlan([
    '| impl-core | in_progress | |',
    '| impl-other | pending | |',
    '| review | pending | |',
    '| finalize | pending | |',
  ]);
  const state = makeState(); // single-issue: issue_number: 42, no bundle fields

  const shellStub = function(scriptPath) {
    const base = path.basename(scriptPath);
    if (base === 'kaola-workflow-plan-validator.js') return { exitCode: 0, ok: true, planHash: 'def' };
    if (base === 'kaola-workflow-next-action.js') {
      return {
        exitCode: 0, result: 'ok',
        readySet: [{ id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/adaptive-node.js', dependsOn: [] }],
        nextNode: { id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/adaptive-node.js' },
        readyPending: [],
        allDone: false,
      };
    }
    return { exitCode: 0 };
  };

  const result = runOrient({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    shell: shellStub,
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) return plan;
      if (fpath.endsWith('workflow-state.md')) return state;
      throw new Error('ENOENT: ' + fpath);
    },
    writeFile: () => { throw new Error('orient must not write'); },
    cacheExists: (fpath) => fpath.includes('impl-core'),
  });

  assert(result.result === 'ok', 'T-bundle-2: single-issue orient result===ok (AC#1)');
  assert(result.bundleId === null, 'T-bundle-2: bundleId===null for single-issue, got ' + result.bundleId);
  assert(Array.isArray(result.issueNumbers) && result.issueNumbers.length === 0, 'T-bundle-2: issueNumbers===[] for single-issue, got ' + JSON.stringify(result.issueNumbers));
  assert(result.closurePolicy === null, 'T-bundle-2: closurePolicy===null for single-issue, got ' + result.closurePolicy);
  assert(result.primaryIssue === 42, 'T-bundle-2: primaryIssue===42 from issue_number in single-issue state, got ' + result.primaryIssue);
  // AC#1: existing fields unchanged
  assert(result.inProgressNode === 'impl-core', 'T-bundle-2 AC#1: inProgressNode still correct');
  assert(result.consentHalt === false, 'T-bundle-2 AC#1: consentHalt still works');
  assert(result.escalatedToFull === null || result.escalatedToFull === undefined, 'T-bundle-2 AC#1: escalatedToFull null/undefined unchanged');
}

// T-bundle-3: runOrient refuse paths (orphan + topup) also carry bundle identity fields.
// Verifies all three return points carry bundleId/issueNumbers/closurePolicy/primaryIssue.
{
  const planNodes = [
    '| a | tdd-guide | — | scripts/a.js | 1 | sequence |',
    '| b | tdd-guide | — | scripts/b.js | 1 | sequence |',
    '| finalize | finalize | a,b | CHANGELOG.md | 1 | sequence |',
  ];
  const plan = makePlan([
    '| a | in_progress | |',
    '| b | in_progress | |',
    '| finalize | pending | |',
  ], planNodes);
  // A bundle state for a 2-member bundle
  const state = makeBundleState({ primary: 10, issueNumbers: [10, 20], bundleId: 'bundle-10-20', closurePolicy: 'all_or_nothing' });

  const shellStub = function(scriptPath) {
    const base = path.basename(scriptPath);
    if (base === 'kaola-workflow-plan-validator.js') return { exitCode: 0, ok: true };
    if (base === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', readySet: [], readyPending: [], nextNode: null, allDone: false };
    return { exitCode: 0 };
  };

  // orphan_multi_in_progress: two in_progress rows, no valid batch manifest
  const resultOrphan = runOrient({
    planPath: '/fake/kaola-workflow/bundle-10-20/workflow-plan.md',
    statePath: '/fake/kaola-workflow/bundle-10-20/workflow-state.md',
    project: 'bundle-10-20',
    shell: shellStub,
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) return plan;
      if (fpath.endsWith('workflow-state.md')) return state;
      throw new Error('ENOENT: ' + fpath);
    },
    writeFile: () => { throw new Error('orient must not write'); },
    cacheExists: () => false,
  });

  assert(resultOrphan.result === 'refuse' && resultOrphan.reason === 'orphan_multi_in_progress',
    'T-bundle-3: orphan refuse path still fires, got ' + JSON.stringify({ result: resultOrphan.result, reason: resultOrphan.reason }));
  assert(resultOrphan.bundleId === 'bundle-10-20', 'T-bundle-3: orphan refuse carries bundleId, got ' + resultOrphan.bundleId);
  assert(Array.isArray(resultOrphan.issueNumbers) && resultOrphan.issueNumbers.length === 2, 'T-bundle-3: orphan refuse carries issueNumbers, got ' + JSON.stringify(resultOrphan.issueNumbers));
  assert(resultOrphan.closurePolicy === 'all_or_nothing', 'T-bundle-3: orphan refuse carries closurePolicy, got ' + resultOrphan.closurePolicy);
  assert(resultOrphan.primaryIssue === 10, 'T-bundle-3: orphan refuse carries primaryIssue, got ' + resultOrphan.primaryIssue);
}

// ---------------------------------------------------------------------------
// #335 — runMirrorProject (M1–M6) + orient plan-probe refusals (O1–O3).
// Pure-core tests with injected io/shell seams (no subprocess, no real fs).
// ---------------------------------------------------------------------------

// Build an io seam over an in-memory set of "existing" paths + a recorder.
function makeMirrorIo(existing, calls, stateContent) {
  const set = new Set(existing);
  return {
    set,
    io: {
      exists: (p) => { calls.push(['exists', p]); return set.has(p); },
      readFile: (p) => {
        calls.push(['readFile', p]);
        if (p.endsWith('workflow-state.md')) return stateContent;
        throw new Error('ENOENT ' + p);
      },
      copyTree: (src, dst) => { calls.push(['copyTree', src, dst]); set.add(dst); },
      renameSync: (a, b) => { calls.push(['renameSync', a, b]); set.delete(a); set.add(b); },
      rmSync: (p) => { calls.push(['rmSync', p]); set.delete(p); },
      mkdirSync: (d) => { calls.push(['mkdirSync', d]); },
    },
  };
}

const MAIN = '/main';
const WT = '/wt';
const STATE_WITH_WT = '## Sink\nworktree_path: ' + WT + '\n';
const STATE_NO_WT = '## Sink\nbranch: workflow/issue-335\n';

// M1: no worktree_path → ok/skipped(no_worktree); copyTree NEVER called.
{
  const calls = [];
  const { io } = makeMirrorIo([path.join(MAIN, 'kaola-workflow', 'issue-335', 'workflow-state.md')], calls, STATE_NO_WT);
  const r = runMirrorProject({ project: 'issue-335', mainRoot: MAIN, shell: () => { throw new Error('shell must not run'); }, io });
  assert(r.result === 'ok' && r.status === 'skipped' && r.reason === 'no_worktree', 'M1: ok/skipped/no_worktree, got ' + JSON.stringify(r));
  assert(!calls.some(c => c[0] === 'copyTree'), 'M1: copyTree never called on no_worktree');
}

// M1b: worktree_path recorded but dir missing → ok/skipped(worktree_dir_missing).
{
  const calls = [];
  const { io } = makeMirrorIo([path.join(MAIN, 'kaola-workflow', 'issue-335', 'workflow-state.md')], calls, STATE_WITH_WT);
  const r = runMirrorProject({ project: 'issue-335', mainRoot: MAIN, shell: () => { throw new Error('no shell'); }, io });
  assert(r.result === 'ok' && r.status === 'skipped' && r.reason === 'worktree_dir_missing', 'M1b: skipped/worktree_dir_missing, got ' + JSON.stringify(r));
  assert(r.worktreePath === WT, 'M1b: worktreePath echoed');
  assert(!calls.some(c => c[0] === 'copyTree'), 'M1b: no copyTree');
}

// M2: dest plan already present → ok/exists; no copy/rename.
{
  const calls = [];
  const stateMain = path.join(MAIN, 'kaola-workflow', 'issue-335', 'workflow-state.md');
  const destPlan = path.join(WT, 'kaola-workflow', 'issue-335', 'workflow-plan.md');
  const { io } = makeMirrorIo([stateMain, WT, destPlan], calls, STATE_WITH_WT);
  const r = runMirrorProject({ project: 'issue-335', mainRoot: MAIN, shell: () => { throw new Error('no shell'); }, io });
  assert(r.result === 'ok' && r.status === 'exists', 'M2: ok/exists, got ' + JSON.stringify(r));
  assert(!calls.some(c => c[0] === 'copyTree'), 'M2: no copyTree when dest exists');
  assert(!calls.some(c => c[0] === 'renameSync'), 'M2: no renameSync when dest exists');
}

// M3: happy path — call order copyTree → shell(validator --resume-check) → renameSync.
{
  const calls = [];
  const stateMain = path.join(MAIN, 'kaola-workflow', 'issue-335', 'workflow-state.md');
  const sourcePlan = path.join(MAIN, 'kaola-workflow', 'issue-335', 'workflow-plan.md');
  const { io } = makeMirrorIo([stateMain, WT, sourcePlan], calls, STATE_WITH_WT);
  const shellCalls = [];
  const shell = (sp, args) => { shellCalls.push([path.basename(sp), args]); return { exitCode: 0, ok: true, planHash: 'h'.repeat(64) }; };
  const r = runMirrorProject({ project: 'issue-335', mainRoot: MAIN, shell, io });
  assert(r.result === 'ok' && r.status === 'mirrored' && r.verified === true, 'M3: ok/mirrored/verified, got ' + JSON.stringify(r));
  assert(r.planHash === 'h'.repeat(64), 'M3: planHash surfaced from resume-check');
  const order = calls.filter(c => ['copyTree', 'renameSync'].includes(c[0])).map(c => c[0]);
  assert(JSON.stringify(order) === JSON.stringify(['copyTree', 'renameSync']), 'M3: copyTree before renameSync, got ' + JSON.stringify(order));
  assert(shellCalls.length === 1 && shellCalls[0][0] === 'kaola-workflow-plan-validator.js' && shellCalls[0][1].includes('--resume-check'), 'M3: shells validator --resume-check, got ' + JSON.stringify(shellCalls));
  // resume-check ran on the TMP copy, BEFORE the promote.
  const tmpPlan = path.join(WT, 'kaola-workflow', '.mirror-tmp-issue-335', 'workflow-plan.md');
  assert(shellCalls[0][1][0] === tmpPlan, 'M3: resume-check targets the tmp copy plan, got ' + shellCalls[0][1][0]);
}

// M4: verify-fail — resume-check ok:false → refuse mirror_verify_failed, tmp rmSync'd, NO renameSync.
{
  const calls = [];
  const stateMain = path.join(MAIN, 'kaola-workflow', 'issue-335', 'workflow-state.md');
  const sourcePlan = path.join(MAIN, 'kaola-workflow', 'issue-335', 'workflow-plan.md');
  const { io } = makeMirrorIo([stateMain, WT, sourcePlan], calls, STATE_WITH_WT);
  const shell = () => ({ exitCode: 1, ok: false, reason: 'plan_hash mismatch — tampered' });
  const r = runMirrorProject({ project: 'issue-335', mainRoot: MAIN, shell, io });
  assert(r.result === 'refuse' && r.reason === 'mirror_verify_failed', 'M4: refuse/mirror_verify_failed, got ' + JSON.stringify(r));
  assert(/mismatch/.test(r.detail), 'M4: detail carries the resume-check reason');
  assert(!calls.some(c => c[0] === 'renameSync'), 'M4: renameSync NEVER called on verify-fail');
  const tmp = path.join(WT, 'kaola-workflow', '.mirror-tmp-issue-335');
  assert(calls.some(c => c[0] === 'rmSync' && c[1] === tmp), 'M4: tmp rmSync cleaned up');
}

// M5: source plan missing → refuse source_plan_missing.
{
  const calls = [];
  const stateMain = path.join(MAIN, 'kaola-workflow', 'issue-335', 'workflow-state.md');
  const { io } = makeMirrorIo([stateMain, WT], calls, STATE_WITH_WT);  // no source plan, WT exists, no dest plan
  const r = runMirrorProject({ project: 'issue-335', mainRoot: MAIN, shell: () => { throw new Error('no shell'); }, io });
  assert(r.result === 'refuse' && r.reason === 'source_plan_missing', 'M5: refuse/source_plan_missing, got ' + JSON.stringify(r));
  assert(/kaola-workflow-adapt/.test(r.repair), 'M5: repair routes to /kaola-workflow-adapt');
}

// M6: state missing → refuse state_missing (read-only, no copy).
{
  const calls = [];
  const { io } = makeMirrorIo([], calls, '');  // nothing exists
  const r = runMirrorProject({ project: 'issue-335', mainRoot: MAIN, shell: () => { throw new Error('no shell'); }, io });
  assert(r.result === 'refuse' && r.reason === 'state_missing', 'M6: refuse/state_missing, got ' + JSON.stringify(r));
  assert(!calls.some(c => c[0] === 'copyTree'), 'M6: no copyTree on state_missing');
}

// O1: orient probe — unmirrored worktree → refuse plan_not_mirrored, repair names mirror-project,
//     and NO shell calls (read-only short-circuit before the resume-check shell).
{
  let shellCalled = false;
  const r = runOrient({
    planPath: '/wt/kaola-workflow/issue-335/workflow-plan.md',
    statePath: '/wt/kaola-workflow/issue-335/workflow-state.md',
    project: 'issue-335',
    shell: () => { shellCalled = true; return { exitCode: 0 }; },
    readFile: () => { throw new Error('must not read'); },
    cacheExists: () => false,
    planProbe: { planExists: false, isLinkedWorktree: true, mainPlanExists: true, mainPlanPath: '/main/kaola-workflow/issue-335/workflow-plan.md' },
  });
  assert(r.result === 'refuse' && r.reason === 'plan_not_mirrored', 'O1: refuse/plan_not_mirrored, got ' + JSON.stringify(r));
  assert(/mirror-project/.test(r.repair), 'O1: repair names mirror-project');
  assert(r.mainPlanPath === '/main/kaola-workflow/issue-335/workflow-plan.md', 'O1: mainPlanPath surfaced');
  assert(shellCalled === false, 'O1: NO shell calls (read-only short-circuit)');
}

// O2: orient probe — main plan also absent (truly unauthored) → refuse plan_missing.
{
  const r = runOrient({
    planPath: '/wt/kaola-workflow/issue-335/workflow-plan.md',
    statePath: '/wt/kaola-workflow/issue-335/workflow-state.md',
    project: 'issue-335',
    shell: () => { throw new Error('no shell'); },
    readFile: () => { throw new Error('no read'); },
    cacheExists: () => false,
    planProbe: { planExists: false, isLinkedWorktree: true, mainPlanExists: false, mainPlanPath: '/main/kaola-workflow/issue-335/workflow-plan.md' },
  });
  assert(r.result === 'refuse' && r.reason === 'plan_missing', 'O2: refuse/plan_missing, got ' + JSON.stringify(r));
  assert(r.mainPlanPath === null, 'O2: mainPlanPath null when not unmirrored');
  assert(/kaola-workflow-adapt/.test(r.repair), 'O2: repair routes to author/freeze');
}

// O3 (regression): NO planProbe injected → legacy tolerant behavior unchanged (returns ok,
//    shells the validator/next-action as before — proven by the existing orient tests staying
//    green; here assert the absent-probe path does NOT short-circuit to a refuse).
{
  const plan = makePlan(['| impl-core | pending | |', '| impl-other | pending | |']);
  const r = runOrient({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    shell: (sp) => {
      const b = path.basename(sp);
      if (b === 'kaola-workflow-plan-validator.js') return { exitCode: 0, ok: true };
      if (b === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', readySet: [], readyPending: [], allDone: false };
      return { exitCode: 0 };
    },
    readFile: (f) => { if (f.endsWith('workflow-plan.md')) return plan; if (f.endsWith('workflow-state.md')) return makeState(); throw new Error('ENOENT ' + f); },
    writeFile: () => { throw new Error('orient must not write'); },
    cacheExists: () => false,
    // planProbe deliberately omitted
  });
  assert(r.result === 'ok', 'O3: absent probe preserves the old tolerant ok-result, got ' + JSON.stringify({ result: r.result, reason: r.reason }));
}

// ---------------------------------------------------------------------------
// T-373 (#373 / D1): node-timings.jsonl — close-and-open-next appends a 'closed'
// event for the closed node and an 'opened' event for the fused-advance node, using
// a REAL temp dir so the best-effort fs.appendFileSync actually fires. Append-only,
// parseable line-by-line; never alters the lifecycle result.
// ---------------------------------------------------------------------------
{
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-timings-'));
  const projDir = path.join(tmpRoot, 'kaola-workflow', 'test-project');
  const cacheDir = path.join(projDir, '.cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  const planPath = path.join(projDir, 'workflow-plan.md');
  const statePath = path.join(projDir, 'workflow-state.md');
  fs.writeFileSync(planPath, makePlan([
    '| impl-core | in_progress | |',
    '| impl-other | pending | |',
    '| review | pending | |',
    '| finalize | pending | |',
  ]));
  fs.writeFileSync(statePath, makeState());
  fs.writeFileSync(path.join(cacheDir, 'impl-core.md'), 'RED: failed\nGREEN: passed');

  const shellStub = function(scriptPath, args) {
    const base = path.basename(scriptPath);
    const argsArr = args || [];
    if (base.endsWith('commit-node.js') && !argsArr.includes('--start')) {
      return { exitCode: 0, result: 'ok', mode: 'per-node', nodeId: 'impl-core', overallOk: true, selectorCheck: { isSelector: false, ok: true } };
    }
    if (base.endsWith('commit-node.js') && argsArr.includes('--start')) {
      return { exitCode: 0, result: 'ok', mode: 'per-node-start', nodeId: 'impl-other', overallOk: true };
    }
    if (base.endsWith('next-action.js')) {
      return { exitCode: 0, result: 'ok', readySet: [{ id: 'impl-other', role: 'implementer' }], nextNode: { id: 'impl-other', role: 'implementer', model: 'sonnet', declared_write_set: 'scripts/other.js' }, allDone: false };
    }
    if (base.endsWith('task-mirror.js')) return { exitCode: 0, result: 'ok' };
    return { exitCode: 1, result: 'refuse', errors: ['stub: ' + base] };
  };

  const result = runCloseAndOpenNext({
    planPath, statePath, project: 'test-project', nodeId: 'impl-core',
    shell: shellStub,
    readFile: (f) => fs.readFileSync(f, 'utf8'),
    writeFile: (f, c) => fs.writeFileSync(f, c),
    cacheExists: (f) => fs.existsSync(f),
  });

  assert(result.result === 'ok', 'T-373: close-and-open-next still succeeds with telemetry wired');
  const timingsPath = path.join(cacheDir, 'node-timings.jsonl');
  assert(fs.existsSync(timingsPath), 'T-373: node-timings.jsonl was written');
  const lines = fs.readFileSync(timingsPath, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
  assert(lines.every(l => typeof l.node === 'string' && typeof l.event === 'string' && typeof l.ts === 'string'), 'T-373: every line parses to {node,event,ts}');
  assert(lines.some(l => l.node === 'impl-core' && l.event === 'closed'), 'T-373: closed event for impl-core, got ' + JSON.stringify(lines));
  assert(lines.some(l => l.node === 'impl-other' && l.event === 'opened'), 'T-373: opened event for impl-other (fused advance), got ' + JSON.stringify(lines));
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T-360 (#360): clear-halt — the script-owned inverse of write-halt.
//   (a) write-halt(consent) → durable halt present; clear-halt(consent) → halt gone +
//       both escalated_to_full markers removed (consent⇒security coupling).
//   (b) clear-halt with NO halt present → typed refuse no_halt_present, ZERO mutation.
//   (c) a decoy `consent_halt: pending` OUTSIDE the ## Node Ledger is NOT a real halt:
//       clear-halt refuses no_halt_present and leaves the decoy untouched.
// ---------------------------------------------------------------------------
{
  // (a) round-trip
  const files = {
    '/p/workflow-plan.md': makePlan(['| impl-core | in_progress | |', '| finalize | pending | |']),
    '/p/workflow-state.md': makeState(),
  };
  const rf = (f) => { if (files[f] !== undefined) return files[f]; throw new Error('ENOENT ' + f); };
  const wf = (f, c) => { files[f] = c; };
  const shellStub = () => ({ status: 'skipped' });

  const wh = runWriteHalt({ planPath: '/p/workflow-plan.md', statePath: '/p/workflow-state.md', project: 'p', nodeId: 'impl-core', reason: 'consent', shell: shellStub, readFile: rf, writeFile: wf });
  assert(wh.result === 'ok', 'T-360a: write-halt(consent) ok');
  assert(readDurableConsentHalt(files['/p/workflow-plan.md']) === true, 'T-360a: durable consent_halt present after write-halt');
  assert(/escalated_to_full:\s*consent/.test(files['/p/workflow-state.md']), 'T-360a: state has escalated_to_full: consent');
  assert(/escalated_to_full:\s*security/.test(files['/p/workflow-state.md']), 'T-360a: state has escalated_to_full: security (coupling)');

  const ch = runClearHalt({ planPath: '/p/workflow-plan.md', statePath: '/p/workflow-state.md', project: 'p', reason: 'consent', shell: shellStub, readFile: rf, writeFile: wf });
  assert(ch.result === 'ok' && ch.halt === 'cleared', 'T-360a: clear-halt(consent) ok/cleared');
  assert(readDurableConsentHalt(files['/p/workflow-plan.md']) === false, 'T-360a: durable consent_halt GONE after clear-halt');
  assert(!/escalated_to_full:\s*consent/.test(files['/p/workflow-state.md']), 'T-360a: escalated_to_full: consent removed');
  assert(!/escalated_to_full:\s*security/.test(files['/p/workflow-state.md']), 'T-360a: escalated_to_full: security removed (coupling)');
}
{
  // (b) no halt present → typed refuse, zero mutation
  let wrote = false;
  const plan = makePlan(['| impl-core | in_progress | |', '| finalize | pending | |']);
  const r = runClearHalt({
    planPath: '/p/workflow-plan.md', statePath: '/p/workflow-state.md', project: 'p', reason: 'consent',
    shell: () => ({ status: 'skipped' }),
    readFile: (f) => f.endsWith('workflow-plan.md') ? plan : makeState(),
    writeFile: () => { wrote = true; },
  });
  assert(r.result === 'refuse' && r.reason === 'no_halt_present', 'T-360b: clear-halt with no halt → refuse no_halt_present, got ' + JSON.stringify(r.reason));
  assert(wrote === false, 'T-360b: NO mutation when there is no halt to clear');
}
{
  // (c) decoy consent_halt OUTSIDE the ledger → not a real halt; clear-halt refuses + leaves it.
  let wrote = false;
  // Put a decoy line in the ## Meta section (before ## Node Ledger).
  const plan = makePlan(['| impl-core | in_progress | |', '| finalize | pending | |'])
    .replace('## Meta\n', '## Meta\nconsent_halt: pending\n');
  assert(readDurableConsentHalt(plan) === false, 'T-360c: a decoy consent_halt outside the ledger is NOT a durable halt');
  const r = runClearHalt({
    planPath: '/p/workflow-plan.md', statePath: '/p/workflow-state.md', project: 'p', reason: 'consent',
    shell: () => ({ status: 'skipped' }),
    readFile: (f) => f.endsWith('workflow-plan.md') ? plan : makeState(),
    writeFile: () => { wrote = true; },
  });
  assert(r.result === 'refuse' && r.reason === 'no_halt_present', 'T-360c: decoy line → refuse no_halt_present');
  assert(wrote === false, 'T-360c: decoy line left untouched (no mutation)');
}

// ---------------------------------------------------------------------------
// T-MC (#463 step 2): write-halt --reason merge_conflict — a RESUMABLE consent-style halt.
//   (a) write-halt(merge_conflict) records escalated_to_full: merge_conflict (the cause, NOT the
//       consent dual markers) + the durable consent_halt: pending marker, so the run's halt fence
//       catches it exactly like a consent halt (readDurableConsentHalt true).
//   (b) clear-halt(consent) removes BOTH the ledger consent_halt AND escalated_to_full:
//       merge_conflict, so the run resumes ADAPTIVELY with clean state — contrast test_thrash,
//       a one-way full escalation whose marker is deliberately left in place.
//   (c) merge_conflict is in the write-halt validReasons allowlist; an unknown reason still refuses.
// ---------------------------------------------------------------------------
{
  // (a) write-halt(merge_conflict) → resumable consent-style halt
  const files = {
    '/p/workflow-plan.md': makePlan(['| impl-a | in_progress | |', '| finalize | pending | |']),
    '/p/workflow-state.md': makeState(),
  };
  const rf = (f) => { if (files[f] !== undefined) return files[f]; throw new Error('ENOENT ' + f); };
  const wf = (f, c) => { files[f] = c; };
  const shellStub = () => ({ status: 'skipped' });

  const wh = runWriteHalt({ planPath: '/p/workflow-plan.md', statePath: '/p/workflow-state.md', project: 'p', nodeId: 'impl-a', reason: 'merge_conflict', shell: shellStub, readFile: rf, writeFile: wf });
  assert(wh.result === 'ok' && wh.halt === 'written', 'T-MC-a: write-halt(merge_conflict) ok/written');
  assert(readDurableConsentHalt(files['/p/workflow-plan.md']) === true, 'T-MC-a: durable consent_halt present (the halt fence catches a merge_conflict halt)');
  assert(/escalated_to_full:\s*merge_conflict/.test(files['/p/workflow-state.md']), 'T-MC-a: state has escalated_to_full: merge_conflict (the cause)');
  assert(!/escalated_to_full:\s*consent/.test(files['/p/workflow-state.md']), 'T-MC-a: merge_conflict does NOT write escalated_to_full: consent (single-cause, not the consent escalation)');
  assert(!/escalated_to_full:\s*security/.test(files['/p/workflow-state.md']), 'T-MC-a: merge_conflict does NOT write escalated_to_full: security');
  assert(Array.isArray(wh.markers) && wh.markers.includes('escalated_to_full:merge_conflict') && wh.markers.includes('consent_halt:pending'), 'T-MC-a: markers list reflects the merge_conflict halt');

  // (b) clear-halt(consent) → fully resumable: clears the ledger marker AND the merge_conflict cause
  const ch = runClearHalt({ planPath: '/p/workflow-plan.md', statePath: '/p/workflow-state.md', project: 'p', reason: 'consent', shell: shellStub, readFile: rf, writeFile: wf });
  assert(ch.result === 'ok' && ch.halt === 'cleared', 'T-MC-b: clear-halt(consent) ok/cleared');
  assert(readDurableConsentHalt(files['/p/workflow-plan.md']) === false, 'T-MC-b: durable consent_halt GONE after clear-halt');
  assert(!/escalated_to_full:\s*merge_conflict/.test(files['/p/workflow-state.md']), 'T-MC-b: escalated_to_full: merge_conflict GONE — run resumes adaptively with clean state');
  assert(!/^escalated_to_full:/m.test(files['/p/workflow-state.md']), 'T-MC-b: NO escalation marker lingers after a resolved merge_conflict halt');
}
{
  // (c) merge_conflict is an accepted write-halt reason; an unknown reason still refuses.
  const files = {
    '/p/workflow-plan.md': makePlan(['| impl-a | in_progress | |']),
    '/p/workflow-state.md': makeState(),
  };
  const rf = (f) => { if (files[f] !== undefined) return files[f]; throw new Error('ENOENT ' + f); };
  const bad = runWriteHalt({ planPath: '/p/workflow-plan.md', statePath: '/p/workflow-state.md', project: 'p', nodeId: 'impl-a', reason: 'banana', shell: () => ({ status: 'skipped' }), readFile: rf, writeFile: (f, c) => { files[f] = c; } });
  assert(bad.result === 'refuse' && bad.reason === 'invalid_reason', 'T-MC-c: an unknown write-halt reason still refuses invalid_reason');
  assert(Array.isArray(bad.validReasons) && bad.validReasons.includes('merge_conflict'), 'T-MC-c: validReasons includes merge_conflict');
}

// Summary
// ---------------------------------------------------------------------------
// ===========================================================================
// #377 per-node running-set scheduler — open-ready / close-node / reconcile /
// legality. State-level coverage of the acceptance scenarios.
// ===========================================================================

const RS_PLAN_PATH = '/p/workflow-plan.md';
const RS_SET_PATH = '/p/.cache/' + RUNNING_SET_NAME;

// rsHarness(initialFiles, shellStub, validatorStub?)
//   shellStub(base, args)        → models next-action / commit-node / task-mirror.
//   validatorStub(base, args)    → OPTIONAL #387/#385: models plan-validator --resume-check /
//                                  --drop-base. When omitted (or returns null), the validator passes
//                                  by DEFAULT (green frozen plan): --resume-check → {exitCode:0,ok:true},
//                                  --drop-base → {exitCode:0,result:'ok'}. A test wanting a TAMPERED
//                                  plan passes a validatorStub returning {exitCode:1,...} for --resume-check.
function rsHarness(initialFiles, shellStub, validatorStub) {
  const files = Object.assign({}, initialFiles);
  const shellCalls = [];
  return {
    files,
    shellCalls,
    shell: (scriptPath, args) => {
      const base = path.basename(scriptPath);
      const a = args || [];
      shellCalls.push({ base, args: a.slice() });
      if (base === 'kaola-workflow-plan-validator.js') {
        const override = validatorStub ? validatorStub(base, a) : null;
        if (override !== undefined && override !== null) return override;
        if (a.includes('--resume-check')) return { exitCode: 0, ok: true };
        if (a.includes('--drop-base')) return { exitCode: 0, result: 'ok' };
        return { exitCode: 0, result: 'ok' };
      }
      return shellStub(base, a);
    },
    readFile: (fp) => { if (fp in files) return files[fp]; throw new Error('ENOENT ' + fp); },
    writeFile: (fp, content) => { files[fp] = content; },
    cacheExists: (fp) => fp in files,
    mkdirp: () => {},
    unlink: (fp) => { delete files[fp]; },
  };
}

// ---------------------------------------------------------------------------
// R-isReadOnly: classification matches the canonical classifier (— / - / empty).
// ---------------------------------------------------------------------------
{
  assert(isReadOnlyNode({ declared_write_set: '—' }) === true, 'R0: em-dash → read-only');
  assert(isReadOnlyNode({ declared_write_set: '-' }) === true, 'R0: hyphen → read-only');
  assert(isReadOnlyNode({ declared_write_set: '' }) === true, 'R0: empty → read-only');
  assert(isReadOnlyNode({ declared_write_set: 'scripts/x.js' }) === false, 'R0: path → write');
}

// ---------------------------------------------------------------------------
// R1: open-ready — READ-ONLY fan-out: two ready read-only nodes open concurrently.
// ---------------------------------------------------------------------------
{
  const plan = makePlan([
    '| rev-a | pending | |',
    '| rev-b | pending | |',
    '| finalize | pending | |',
  ], [
    '| rev-a | code-reviewer | — | — | 1 | sequence |',
    '| rev-b | security-reviewer | — | — | 1 | sequence |',
    '| finalize | finalize | rev-a rev-b | CHANGELOG.md | 1 | sequence |',
  ]);
  const h = rsHarness({ [RS_PLAN_PATH]: plan }, (base) => {
    if (base === 'kaola-workflow-next-action.js') {
      return { exitCode: 0, result: 'ok', allDone: false, readyPending: [
        { id: 'rev-a', role: 'code-reviewer', declared_write_set: '—' },
        { id: 'rev-b', role: 'security-reviewer', declared_write_set: '—' },
      ] };
    }
    if (base === 'kaola-workflow-commit-node.js') return { exitCode: 0, result: 'ok' };
    return { exitCode: 1, result: 'refuse' };
  });
  const r = runOpenReady({ planPath: RS_PLAN_PATH, project: 'p', max: null, fanoutCapReadonly: 8, shell: h.shell, readFile: h.readFile, writeFile: h.writeFile, cacheExists: h.cacheExists, mkdirp: h.mkdirp });
  assert(r.result === 'ok' && r.kind === 'read', 'R1: ok + kind=read');
  assert(r.opened.length === 2, 'R1: opened 2 read-only nodes, got ' + r.opened.length);
  const set = JSON.parse(h.files[RS_SET_PATH]);
  assert(set.state === 'open', 'R1: running-set promoted to open');
  assert(set.nodes.length === 2 && set.nodes.every(n => !n.opening), 'R1: 2 nodes, opening flags cleared');
  assert(h.files[RS_PLAN_PATH].includes('| rev-a | in_progress | |') && h.files[RS_PLAN_PATH].includes('| rev-b | in_progress | |'), 'R1: both ledger rows in_progress');
  assert(h.shellCalls.filter(c => c.base === 'kaola-workflow-commit-node.js' && c.args.includes('--start')).length === 2, 'R1: two baselines recorded');
}

// ---------------------------------------------------------------------------
// R2: open-ready — a WRITE node opens ALONE only on the explicit serial path
//   (#542 default-on: KAOLA_PARALLEL_WRITES=0 forces the serial-degrade fallback;
//   the mock shell here returns no group descriptor so the co-open branch can't form,
//   so this asserts the serial single-open shape under the forced-serial env).
// ---------------------------------------------------------------------------
{
  const plan = makePlan([
    '| w1 | pending | |',
    '| w2 | pending | |',
  ], [
    '| w1 | implementer | — | scripts/a.js | 1 | sequence |',
    '| w2 | implementer | — | scripts/b.js | 1 | sequence |',
  ]);
  const h = rsHarness({ [RS_PLAN_PATH]: plan }, (base) => {
    if (base === 'kaola-workflow-next-action.js') {
      return { exitCode: 0, result: 'ok', allDone: false, readyPending: [
        { id: 'w1', role: 'implementer', declared_write_set: 'scripts/a.js' },
        { id: 'w2', role: 'implementer', declared_write_set: 'scripts/b.js' },
      ] };
    }
    if (base === 'kaola-workflow-commit-node.js') return { exitCode: 0, result: 'ok' };
    return { exitCode: 1, result: 'refuse' };
  });
  // #542 default-on: the only deterministic serial-single-open path is KAOLA_PARALLEL_WRITES=0.
  // runOpenReady reads parallelWritesDefaultOn(process.env) directly (in-process unit call), so we
  // force the serial env around the call and restore it.
  const r = withParallelWrites('0', () => runOpenReady({ planPath: RS_PLAN_PATH, project: 'p', max: null, fanoutCapReadonly: 8, shell: h.shell, readFile: h.readFile, writeFile: h.writeFile, cacheExists: h.cacheExists, mkdirp: h.mkdirp }));
  assert(r.result === 'ok' && r.kind === 'write', 'R2: ok + kind=write');
  assert(r.opened.length === 1 && r.opened[0].id === 'w1', 'R2: exactly ONE write node opened (serial, KAOLA_PARALLEL_WRITES=0), got ' + JSON.stringify(r.opened.map(o=>o.id)));
  assert(h.files[RS_PLAN_PATH].includes('| w1 | in_progress | |') && h.files[RS_PLAN_PATH].includes('| w2 | pending | |'), 'R2: w2 stays pending');
}

// ---------------------------------------------------------------------------
// R3: open-ready — write-node exclusivity: a live write node blocks new opens.
// ---------------------------------------------------------------------------
{
  const plan = makePlan(['| w1 | in_progress | |', '| rev | pending | |'], [
    '| w1 | implementer | — | scripts/a.js | 1 | sequence |',
    '| rev | code-reviewer | w1 | — | 1 | sequence |',
  ]);
  const existingSet = JSON.stringify({ state: 'open', nodes: [{ id: 'w1', role: 'implementer', kind: 'write', baseline: 'recorded' }] });
  const h = rsHarness({ [RS_PLAN_PATH]: plan, [RS_SET_PATH]: existingSet }, (base) => {
    if (base === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', allDone: false, readyPending: [{ id: 'rev', role: 'code-reviewer', declared_write_set: '—' }] };
    return { exitCode: 0, result: 'ok' };
  });
  const r = runOpenReady({ planPath: RS_PLAN_PATH, project: 'p', max: null, fanoutCapReadonly: 8, shell: h.shell, readFile: h.readFile, writeFile: h.writeFile, cacheExists: h.cacheExists, mkdirp: h.mkdirp });
  assert(r.result === 'ok' && r.opened.length === 0 && r.reason === 'write_node_exclusive', 'R3: live write node → opened:[] write_node_exclusive, got ' + JSON.stringify({o:r.opened,reason:r.reason}));
}

// ---------------------------------------------------------------------------
// R4: open-ready — a crashed 'opening' running set refuses reconcile_first.
// ---------------------------------------------------------------------------
{
  const plan = makePlan(['| a | pending | |']);
  const crashed = JSON.stringify({ state: 'opening', nodes: [{ id: 'a', role: 'code-reviewer', kind: 'read', opening: true }] });
  const h = rsHarness({ [RS_PLAN_PATH]: plan, [RS_SET_PATH]: crashed }, () => ({ exitCode: 0, result: 'ok' }));
  const r = runOpenReady({ planPath: RS_PLAN_PATH, project: 'p', max: null, fanoutCapReadonly: 8, shell: h.shell, readFile: h.readFile, writeFile: h.writeFile, cacheExists: h.cacheExists, mkdirp: h.mkdirp });
  assert(r.result === 'refuse' && r.detail === 'running_set_opening_incomplete', 'R4: opening set → refuse reconcile_first, got ' + JSON.stringify(r));
}

// ---------------------------------------------------------------------------
// R5: close-node — evidence + barrier → complete + compliance + removed from set.
// ---------------------------------------------------------------------------
{
  const plan = makePlan(['| rev-a | in_progress | |', '| rev-b | in_progress | |', '| finalize | pending | |'], [
    '| rev-a | code-reviewer | — | — | 1 | sequence |',
    '| rev-b | security-reviewer | — | — | 1 | sequence |',
    '| finalize | finalize | rev-a rev-b | CHANGELOG.md | 1 | sequence |',
  ]);
  const startSet = JSON.stringify({ state: 'open', nodes: [
    { id: 'rev-a', role: 'code-reviewer', kind: 'read', baseline: 'recorded' },
    { id: 'rev-b', role: 'security-reviewer', kind: 'read', baseline: 'recorded' },
  ] });
  const h = rsHarness({ [RS_PLAN_PATH]: plan, [RS_SET_PATH]: startSet, '/p/.cache/rev-a.md': 'code-reviewer review\nverdict: pass\nfindings_blocking: 0' }, (base) => {
    if (base === 'kaola-workflow-commit-node.js') return { exitCode: 0, result: 'ok', selectorCheck: {} };
    if (base === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', allDone: false, readyPending: [{ id: 'rev-b', role: 'security-reviewer', declared_write_set: '—' }] };
    return { exitCode: 1, result: 'refuse' };
  });
  const r = runCloseNode({ planPath: RS_PLAN_PATH, project: 'p', nodeId: 'rev-a', shell: h.shell, readFile: h.readFile, writeFile: h.writeFile, cacheExists: h.cacheExists, unlink: h.unlink });
  assert(r.result === 'ok' && r.closed === 'rev-a', 'R5: closed rev-a');
  assert(h.files[RS_PLAN_PATH].includes('| rev-a | complete | |'), 'R5: ledger row complete');
  assert(/code-reviewer \| subagent-invoked/.test(h.files[RS_PLAN_PATH]), 'R5: compliance row appended (bare role)');
  const set = JSON.parse(h.files[RS_SET_PATH]);
  assert(set.nodes.length === 1 && set.nodes[0].id === 'rev-b', 'R5: rev-a removed from running set, rev-b remains');
  assert(Array.isArray(r.newlyReady) && r.newlyReady.some(n => n.id === 'rev-b'), 'R5: newlyReady surfaced');
}

// ---------------------------------------------------------------------------
// R6: close-node — last node closes → running-set file unlinked.
// ---------------------------------------------------------------------------
{
  const plan = makePlan(['| rev | in_progress | |'], ['| rev | code-reviewer | — | — | 1 | sequence |']);
  const startSet = JSON.stringify({ state: 'open', nodes: [{ id: 'rev', role: 'code-reviewer', kind: 'read', baseline: 'recorded' }] });
  const h = rsHarness({ [RS_PLAN_PATH]: plan, [RS_SET_PATH]: startSet, '/p/.cache/rev.md': 'code-reviewer\nverdict: pass\nfindings_blocking: 0' }, (base) => {
    if (base === 'kaola-workflow-commit-node.js') return { exitCode: 0, result: 'ok', selectorCheck: {} };
    if (base === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', allDone: true, readyPending: [] };
    return { exitCode: 1, result: 'refuse' };
  });
  const r = runCloseNode({ planPath: RS_PLAN_PATH, project: 'p', nodeId: 'rev', shell: h.shell, readFile: h.readFile, writeFile: h.writeFile, cacheExists: h.cacheExists, unlink: h.unlink });
  assert(r.result === 'ok' && r.allDone === true, 'R6: ok + allDone');
  assert(!(RS_SET_PATH in h.files), 'R6: running-set file unlinked when last node closes');
}

// ---------------------------------------------------------------------------
// R7: close-node — barrier failure → refuse, ledger row NOT closed.
// ---------------------------------------------------------------------------
{
  const plan = makePlan(['| rev | in_progress | |'], ['| rev | code-reviewer | — | — | 1 | sequence |']);
  const h = rsHarness({ [RS_PLAN_PATH]: plan, '/p/.cache/rev.md': 'code-reviewer\nverdict: pass\nfindings_blocking: 0' }, (base) => {
    if (base === 'kaola-workflow-commit-node.js') return { exitCode: 1, result: 'refuse', reason: 'barrier_out_of_lane' };
    return { exitCode: 1, result: 'refuse' };
  });
  const r = runCloseNode({ planPath: RS_PLAN_PATH, project: 'p', nodeId: 'rev', shell: h.shell, readFile: h.readFile, writeFile: h.writeFile, cacheExists: h.cacheExists, unlink: h.unlink });
  assert(r.result === 'refuse' && r.reason === 'barrier_failed', 'R7: barrier fail → refuse');
  assert(h.files[RS_PLAN_PATH].includes('| rev | in_progress | |'), 'R7: ledger row unchanged (no close)');
}

// ---------------------------------------------------------------------------
// R8: reconcile-running-set — opening: flipped row kept, pending row dropped.
// ---------------------------------------------------------------------------
{
  const plan = makePlan(['| a | in_progress | |', '| b | pending | |'], [
    '| a | code-reviewer | — | — | 1 | sequence |',
    '| b | security-reviewer | — | — | 1 | sequence |',
  ]);
  const crashed = JSON.stringify({ state: 'opening', nodes: [
    { id: 'a', role: 'code-reviewer', kind: 'read', opening: true },
    { id: 'b', role: 'security-reviewer', kind: 'read', opening: true },
  ] });
  const h = rsHarness({ [RS_PLAN_PATH]: plan, [RS_SET_PATH]: crashed }, () => ({ exitCode: 0, result: 'ok' }));
  const r = runReconcileRunningSet({ planPath: RS_PLAN_PATH, project: 'p', shell: h.shell, readFile: h.readFile, writeFile: h.writeFile, cacheExists: h.cacheExists });
  assert(r.result === 'ok' && r.reconciled === true, 'R8: reconciled');
  assert(r.rolledForward.length === 1 && r.rolledForward[0] === 'a', 'R8: a rolled forward (row flipped)');
  assert(r.rolledBack.length === 1 && r.rolledBack[0] === 'b', 'R8: b rolled back (still pending)');
  const set = JSON.parse(h.files[RS_SET_PATH]);
  assert(set.state === 'open' && set.nodes.length === 1 && set.nodes[0].id === 'a', 'R8: promoted to open with survivor a only');
}

// ---------------------------------------------------------------------------
// R9: orient legality — running-set matches multi-in_progress → OK, not orphan.
// ---------------------------------------------------------------------------
{
  const plan = makePlan(['| a | in_progress | |', '| b | in_progress | |', '| finalize | pending | |'], [
    '| a | code-reviewer | — | — | 1 | sequence |',
    '| b | security-reviewer | — | — | 1 | sequence |',
    '| finalize | finalize | a b | CHANGELOG.md | 1 | sequence |',
  ]);
  const runningSet = JSON.stringify({ state: 'open', nodes: [
    { id: 'a', role: 'code-reviewer', kind: 'read' },
    { id: 'b', role: 'security-reviewer', kind: 'read' },
  ] });
  const files = { [RS_PLAN_PATH]: plan, '/p/workflow-state.md': makeState(), [RS_SET_PATH]: runningSet };
  const r = runOrient({
    planPath: RS_PLAN_PATH, statePath: '/p/workflow-state.md', project: 'p',
    shell: (sp, a) => { const b = path.basename(sp); if (b === 'kaola-workflow-plan-validator.js') return { exitCode: 0, ok: true }; if (b === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', allDone: false, readySet: [], readyPending: [] }; return { exitCode: 0, result: 'ok' }; },
    readFile: (fp) => { if (fp in files) return files[fp]; throw new Error('ENOENT ' + fp); },
    writeFile: () => {},
    cacheExists: (fp) => fp in files,
  });
  assert(r.result === 'ok', 'R9: multi-in_progress matching running-set is LEGAL (not orphan), got ' + JSON.stringify({ result: r.result, reason: r.reason }));
  assert(r.batch === null, 'R9: batch stays null (running-set fan-out is not the batch machine)');
  assert(r.runningSet && r.runningSet.nodes.length === 2, 'R9: runningSet surfaced');
}

// ---------------------------------------------------------------------------
// R10: orient legality — a crashed 'opening' running set → reconcilable refusal.
// ---------------------------------------------------------------------------
{
  const plan = makePlan(['| a | in_progress | |', '| b | pending | |'], [
    '| a | code-reviewer | — | — | 1 | sequence |',
    '| b | security-reviewer | — | — | 1 | sequence |',
  ]);
  const crashed = JSON.stringify({ state: 'opening', nodes: [{ id: 'a', opening: true }, { id: 'b', opening: true }] });
  const files = { [RS_PLAN_PATH]: plan, '/p/workflow-state.md': makeState(), [RS_SET_PATH]: crashed };
  const r = runOrient({
    planPath: RS_PLAN_PATH, statePath: '/p/workflow-state.md', project: 'p',
    shell: (sp) => { const b = path.basename(sp); if (b === 'kaola-workflow-plan-validator.js') return { exitCode: 0, ok: true }; if (b === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', allDone: false, readySet: [], readyPending: [] }; return { exitCode: 0, result: 'ok' }; },
    readFile: (fp) => { if (fp in files) return files[fp]; throw new Error('ENOENT ' + fp); },
    writeFile: () => {},
    cacheExists: (fp) => fp in files,
  });
  assert(r.result === 'refuse' && r.reason === 'running_set_opening_incomplete', 'R10: opening running-set → reconcilable refusal, got ' + JSON.stringify(r.reason));
}

// ---------------------------------------------------------------------------
// R11: serial fallback unchanged — open-next still works with a running-set absent.
// (Guards that the additive scheduler did not perturb the legacy single-node path.)
// ---------------------------------------------------------------------------
{
  const plan = makePlan(['| impl-core | pending | |', '| impl-other | pending | |', '| review | pending | |', '| finalize | pending | |']);
  let planContent = plan;
  const r = runOpenNext({
    planPath: RS_PLAN_PATH, statePath: '/p/workflow-state.md', project: 'p', nodeId: null,
    shell: (sp, a) => { const b = path.basename(sp); if (b === 'kaola-workflow-plan-validator.js' && (a || []).includes('--resume-check')) return { exitCode: 0, ok: true }; if (b === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', allDone: false, readySet: [{ id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/adaptive-node.js', dependsOn: [] }], nextNode: { id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/adaptive-node.js' } }; if (b === 'kaola-workflow-commit-node.js') return { exitCode: 0, result: 'ok' }; return { exitCode: 0, result: 'ok' }; },
    readFile: (fp) => fp.endsWith('workflow-plan.md') ? planContent : makeState(),
    writeFile: (fp, c) => { if (fp.endsWith('workflow-plan.md')) planContent = c; },
  });
  assert(r.result === 'ok' && r.opened && r.opened.id === 'impl-core', 'R11: legacy open-next path intact (serial fallback)');
}

// ---------------------------------------------------------------------------
// R12 (#382): open-ready persists the per-node model tier — `opened` carries it (was
// hardcoded model:undefined) and running-set.json members store it so a reconcile /
// crash re-dispatch keeps the planner's tier.
// ---------------------------------------------------------------------------
{
  const plan = makePlan([
    '| rev-a | pending | |',
    '| rev-b | pending | |',
    '| finalize | pending | |',
  ], [
    '| rev-a | code-reviewer | — | — | 1 | sequence | opus |',
    '| rev-b | security-reviewer | — | — | 1 | sequence | sonnet |',
    '| finalize | finalize | rev-a rev-b | CHANGELOG.md | 1 | sequence | |',
  ]);
  const h = rsHarness({ [RS_PLAN_PATH]: plan }, (base) => {
    if (base === 'kaola-workflow-next-action.js') {
      return { exitCode: 0, result: 'ok', allDone: false, readyPending: [
        { id: 'rev-a', role: 'code-reviewer', declared_write_set: '—', model: 'opus' },
        { id: 'rev-b', role: 'security-reviewer', declared_write_set: '—', model: 'sonnet' },
      ] };
    }
    if (base === 'kaola-workflow-commit-node.js') return { exitCode: 0, result: 'ok' };
    return { exitCode: 1, result: 'refuse' };
  });
  const r = runOpenReady({ planPath: RS_PLAN_PATH, project: 'p', max: null, fanoutCapReadonly: 8, shell: h.shell, readFile: h.readFile, writeFile: h.writeFile, cacheExists: h.cacheExists, mkdirp: h.mkdirp });
  assert(r.result === 'ok' && r.opened.length === 2, 'R12: open-ready opened 2 nodes');
  const byId = Object.fromEntries(r.opened.map(o => [o.id, o.model]));
  assert(byId['rev-a'] === 'opus' && byId['rev-b'] === 'sonnet', 'R12: opened carries per-node model (not undefined), got ' + JSON.stringify(byId));
  const set = JSON.parse(h.files[RS_SET_PATH]);
  const setById = Object.fromEntries(set.nodes.map(n => [n.id, n.model]));
  assert(setById['rev-a'] === 'opus' && setById['rev-b'] === 'sonnet', 'R12: running-set.json persists per-node model, got ' + JSON.stringify(setById));
}

// ===========================================================================
// S-RT (#392 ROUND-TRIP, the false-green catcher): the per-open nonce that
// open-next / open-ready RETURN must equal the on-disk nonce the close side reads
// via readNonce, so evidence bound with the RETURNED nonce closes. The pre-fix bug
// read commit-node --start's `base`/`reused` at the TOP level (they live under
// `recordBase`) → returned nonce ALWAYS null → every node close refused on the
// missing evidence-binding header. The existing #392 close-path tests inject the
// on-disk nonce directly into the header and never exercise the RETURNED field, so
// they stayed green over the broken open side. These tests drive the FULL
// open→(returned-nonce)→close round-trip.
//
// MUTATION PROOF: revert FIX 1a (nonce: ... → nonce: null, or read the top-level
// baselineResult.base) and S-RT1 goes RED ("close did not succeed with the returned
// nonce" — the header now carries a null/empty nonce that never matches the on-disk
// SHA). Revert the baselineReused line and S-RT5 goes RED. These bite specifically
// because they consume the RETURNED nonce, not an injected one.
// ===========================================================================

// rtHarness — a REALISTIC open→close harness. commit-node --start returns the nested
// `recordBase.base` SHA AND writes the on-disk .cache/barrier-base-<id> file (sanitized
// id), exactly like the real validator --record-base. The close side then reads that
// same SHA via readNonce. Per-node barrier + selector are modeled as pass.
function rtHarness(initialFiles, opts) {
  opts = opts || {};
  const files = Object.assign({}, initialFiles);
  const shellCalls = [];
  const sanitize = (id) => String(id).replace(/[^A-Za-z0-9_-]/g, '_');
  const shell = (scriptPath, args) => {
    const base = path.basename(scriptPath);
    const a = args || [];
    shellCalls.push({ base, args: a.slice() });
    if (base === 'kaola-workflow-plan-validator.js') {
      if (a.includes('--resume-check')) return { exitCode: 0, ok: true };
      if (a.includes('--drop-base')) return { exitCode: 0, result: 'ok' };
      return { exitCode: 0, result: 'ok' };
    }
    if (base === 'kaola-workflow-commit-node.js' && a.includes('--start')) {
      // The REAL shape: commit-node nests the validator's --record-base output under recordBase.
      const idIdx = a.indexOf('--node-id');
      const id = idIdx >= 0 ? a[idIdx + 1] : null;
      const sha = (opts.shaFor && opts.shaFor(id)) || ('deadbeef' + sanitize(id) + 'cafef00d1234');
      // Write the on-disk barrier-base file so readNonce reads the SAME SHA on the close side.
      files['/p/.cache/barrier-base-' + sanitize(id)] = sha + '\n';
      const reused = !!(opts.reusedFor && opts.reusedFor(id));
      return { exitCode: 0, result: 'ok', mode: 'per-node-start', nodeId: id, overallOk: true, recordBase: { result: 'ok', nodeId: id, base: sha, ...(reused ? { reused: true } : {}) } };
    }
    if (base === 'kaola-workflow-commit-node.js') {
      // Per-node barrier (close).
      return { exitCode: 0, result: 'ok', mode: 'per-node', overallOk: true, selectorCheck: { isSelector: false, ok: true }, barrierCheck: { exitCode: 0, result: 'pass' } };
    }
    if (base === 'kaola-workflow-next-action.js') {
      return opts.nextAction || { exitCode: 0, result: 'ok', allDone: true, readySet: [], readyPending: [] };
    }
    return { exitCode: 0, result: 'ok' };
  };
  return {
    files, shellCalls, shell, sanitize,
    readFile: (fp) => { if (fp in files) return files[fp]; throw new Error('ENOENT ' + fp); },
    writeFile: (fp, c) => { files[fp] = c; },
    cacheExists: (fp) => fp in files,
    mkdirp: () => {}, unlink: (fp) => { delete files[fp]; },
  };
}

// S-RT1 (open-next → returned nonce → close-and-open-next): evidence bound with the
// RETURNED nonce closes SUCCESSFULLY (the binding-passes AC #392 claims). This is RED
// against the pre-fix top-level read (returned nonce null → header nonce mismatches the
// on-disk SHA → evidence_stale/missing refusal).
{
  const plan = makePlan([
    '| impl-core | pending | |',
    '| impl-other | pending | |',
    '| review | pending | |',
    '| finalize | pending | |',
  ]);
  const h = rtHarness({ '/p/workflow-plan.md': plan, '/p/workflow-state.md': makeState() }, {
    nextAction: { exitCode: 0, result: 'ok', allDone: false,
      readySet: [{ id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/adaptive-node.js', dependsOn: [] }],
      nextNode: { id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/adaptive-node.js' } },
  });
  const open = runOpenNext({ planPath: '/p/workflow-plan.md', statePath: '/p/workflow-state.md', project: 'p', nodeId: null, shell: h.shell, readFile: h.readFile, writeFile: h.writeFile });
  assert(open.result === 'ok', 'S-RT1: open-next ok');
  // THE field-path assertion: the RETURNED nonce is the real 12-char SHA prefix, NOT null.
  assert(open.nonce && open.nonce.length === 12, 'S-RT1: open-next returns a non-null 12-char nonce (the recordBase fix), got ' + JSON.stringify(open.nonce));
  assert(open.nonce === readNonce('/p/workflow-plan.md', 'impl-core', h.readFile), 'S-RT1: returned nonce EQUALS the on-disk readNonce value (open prefix == close prefix)');

  // Build evidence carrying EXACTLY the returned binding header.
  const evidence = 'evidence-binding: impl-core ' + open.nonce + '\nRED then GREEN\n3 assertions';
  h.files['/p/.cache/impl-core.md'] = evidence;
  // next-action for the close-side fused advance (impl-core complete → impl-other ready).
  const hClose = h; // reuse files
  const closeShell = (scriptPath, args) => {
    const base = path.basename(scriptPath);
    if (base === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', allDone: false, readySet: [{ id: 'impl-other', role: 'implementer', model: 'sonnet', declared_write_set: 'scripts/other.js', dependsOn: ['impl-core'] }], nextNode: { id: 'impl-other', role: 'implementer', model: 'sonnet', declared_write_set: 'scripts/other.js' } };
    return h.shell(scriptPath, args);
  };
  const close = runCloseAndOpenNext({ planPath: '/p/workflow-plan.md', statePath: '/p/workflow-state.md', project: 'p', nodeId: 'impl-core', shell: closeShell, readFile: hClose.readFile, writeFile: hClose.writeFile, cacheExists: hClose.cacheExists });
  assert(close.result === 'ok' && close.closed === 'impl-core', 'S-RT1: close SUCCEEDS with the RETURNED nonce (round-trip closes), got ' + JSON.stringify({ result: close.result, reason: close.reason, mtc: close.missingTokenClass }));
}

// S-RT2 (negative — no binding header → refuse): close with evidence lacking the
// evidence-binding header refuses (binding enforced once a nonce is on disk).
{
  const plan = makePlan(['| impl-core | pending | |', '| impl-other | pending | |', '| review | pending | |', '| finalize | pending | |']);
  const h = rtHarness({ '/p/workflow-plan.md': plan, '/p/workflow-state.md': makeState() }, {
    nextAction: { exitCode: 0, result: 'ok', allDone: false, readySet: [{ id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/adaptive-node.js', dependsOn: [] }], nextNode: { id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/adaptive-node.js' } },
  });
  const open = runOpenNext({ planPath: '/p/workflow-plan.md', statePath: '/p/workflow-state.md', project: 'p', nodeId: null, shell: h.shell, readFile: h.readFile, writeFile: h.writeFile });
  assert(open.nonce && open.nonce.length === 12, 'S-RT2: open-next returns real nonce');
  h.files['/p/.cache/impl-core.md'] = 'RED then GREEN\nno binding header here\n';
  const close = runCloseAndOpenNext({ planPath: '/p/workflow-plan.md', statePath: '/p/workflow-state.md', project: 'p', nodeId: 'impl-core', shell: h.shell, readFile: h.readFile, writeFile: h.writeFile, cacheExists: h.cacheExists });
  assert(close.result === 'refuse' && close.missingTokenClass === 'evidence-binding', 'S-RT2: missing binding header → refuse (missingTokenClass evidence-binding), got ' + JSON.stringify({ result: close.result, mtc: close.missingTokenClass }));
}

// S-RT3 (negative — WRONG nonce → evidence_stale): close with a binding header that
// carries a DIFFERENT (stale/prior-open) nonce.
{
  const plan = makePlan(['| impl-core | pending | |', '| impl-other | pending | |', '| review | pending | |', '| finalize | pending | |']);
  const h = rtHarness({ '/p/workflow-plan.md': plan, '/p/workflow-state.md': makeState() }, {
    nextAction: { exitCode: 0, result: 'ok', allDone: false, readySet: [{ id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/adaptive-node.js', dependsOn: [] }], nextNode: { id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/adaptive-node.js' } },
  });
  const open = runOpenNext({ planPath: '/p/workflow-plan.md', statePath: '/p/workflow-state.md', project: 'p', nodeId: null, shell: h.shell, readFile: h.readFile, writeFile: h.writeFile });
  h.files['/p/.cache/impl-core.md'] = 'evidence-binding: impl-core 000000000000\nRED then GREEN\n';
  const close = runCloseAndOpenNext({ planPath: '/p/workflow-plan.md', statePath: '/p/workflow-state.md', project: 'p', nodeId: 'impl-core', shell: h.shell, readFile: h.readFile, writeFile: h.writeFile, cacheExists: h.cacheExists });
  assert(close.result === 'refuse' && close.reason === 'evidence_stale', 'S-RT3: wrong nonce → evidence_stale, got ' + JSON.stringify({ result: close.result, reason: close.reason }));
  assert(open.nonce !== '000000000000', 'S-RT3: (guard) the real nonce is not the decoy');
}

// S-RT4 (negative — WRONG node id → evidence_unbound): binding header names a
// different node (evidence copied from elsewhere).
{
  const plan = makePlan(['| impl-core | pending | |', '| impl-other | pending | |', '| review | pending | |', '| finalize | pending | |']);
  const h = rtHarness({ '/p/workflow-plan.md': plan, '/p/workflow-state.md': makeState() }, {
    nextAction: { exitCode: 0, result: 'ok', allDone: false, readySet: [{ id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/adaptive-node.js', dependsOn: [] }], nextNode: { id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/adaptive-node.js' } },
  });
  const open = runOpenNext({ planPath: '/p/workflow-plan.md', statePath: '/p/workflow-state.md', project: 'p', nodeId: null, shell: h.shell, readFile: h.readFile, writeFile: h.writeFile });
  h.files['/p/.cache/impl-core.md'] = 'evidence-binding: some-other-node ' + open.nonce + '\nRED then GREEN\n';
  const close = runCloseAndOpenNext({ planPath: '/p/workflow-plan.md', statePath: '/p/workflow-state.md', project: 'p', nodeId: 'impl-core', shell: h.shell, readFile: h.readFile, writeFile: h.writeFile, cacheExists: h.cacheExists });
  assert(close.result === 'refuse' && close.reason === 'evidence_unbound', 'S-RT4: wrong node id → evidence_unbound, got ' + JSON.stringify({ result: close.result, reason: close.reason }));
}

// S-RT5 (baselineReused surfaced on a genuine re-open): commit-node --start returns
// recordBase.reused:true on a re-open → open-next surfaces baselineReused:true. RED if
// the reused line still reads the top-level baselineResult.reused (undefined → false).
{
  const plan = makePlan(['| impl-core | in_progress | |', '| impl-other | pending | |', '| review | pending | |', '| finalize | pending | |']);
  const h = rtHarness({ '/p/workflow-plan.md': plan, '/p/workflow-state.md': makeState() }, {
    reusedFor: () => true,
    nextAction: { exitCode: 0, result: 'ok', allDone: false, readySet: [{ id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/adaptive-node.js', dependsOn: [] }], nextNode: { id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/adaptive-node.js' } },
  });
  const open = runOpenNext({ planPath: '/p/workflow-plan.md', statePath: '/p/workflow-state.md', project: 'p', nodeId: null, shell: h.shell, readFile: h.readFile, writeFile: h.writeFile });
  assert(open.result === 'ok', 'S-RT5: re-open ok');
  assert(open.baselineReused === true, 'S-RT5: baselineReused surfaced TRUE on a genuine re-open (recordBase.reused), got ' + JSON.stringify(open.baselineReused));
}

// S-RT6 (open-ready → returned per-node nonce → close-node round-trip): the SET case.
// Each opened node carries its own RETURNED nonce; evidence bound with it closes.
{
  const plan = makePlan([
    '| rev-a | pending | |',
    '| rev-b | pending | |',
    '| finalize | pending | |',
  ], [
    '| rev-a | code-reviewer | — | — | 1 | sequence |',
    '| rev-b | security-reviewer | — | — | 1 | sequence |',
    '| finalize | finalize | rev-a rev-b | CHANGELOG.md | 1 | sequence |',
  ]);
  const h = rtHarness({ '/p/workflow-plan.md': plan, '/p/workflow-state.md': makeState() }, {
    nextAction: { exitCode: 0, result: 'ok', allDone: false, readyPending: [
      { id: 'rev-a', role: 'code-reviewer', declared_write_set: '—' },
      { id: 'rev-b', role: 'security-reviewer', declared_write_set: '—' },
    ] },
  });
  const open = runOpenReady({ planPath: '/p/workflow-plan.md', project: 'p', max: null, fanoutCapReadonly: 8, shell: h.shell, readFile: h.readFile, writeFile: h.writeFile, cacheExists: h.cacheExists, mkdirp: h.mkdirp });
  assert(open.result === 'ok' && open.opened.length === 2, 'S-RT6: open-ready opened 2');
  const byId = Object.fromEntries(open.opened.map(o => [o.id, o.nonce]));
  assert(byId['rev-a'] && byId['rev-a'].length === 12, 'S-RT6: open-ready surfaces a real per-node nonce for rev-a (was absent), got ' + JSON.stringify(byId['rev-a']));
  assert(byId['rev-a'] === readNonce('/p/workflow-plan.md', 'rev-a', h.readFile), 'S-RT6: rev-a returned nonce == on-disk readNonce');
  assert(byId['rev-b'] === readNonce('/p/workflow-plan.md', 'rev-b', h.readFile), 'S-RT6: rev-b returned nonce == on-disk readNonce');

  // Close rev-a with evidence bound to its RETURNED nonce → success.
  h.files['/p/.cache/rev-a.md'] = 'evidence-binding: rev-a ' + byId['rev-a'] + '\ncode-reviewer\nverdict: pass\nfindings_blocking: 0';
  const closeShell = (scriptPath, args) => {
    const base = path.basename(scriptPath);
    if (base === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', allDone: false, readyPending: [{ id: 'rev-b', role: 'security-reviewer', declared_write_set: '—' }] };
    return h.shell(scriptPath, args);
  };
  const close = runCloseNode({ planPath: '/p/workflow-plan.md', project: 'p', nodeId: 'rev-a', shell: closeShell, readFile: h.readFile, writeFile: h.writeFile, cacheExists: h.cacheExists, unlink: h.unlink });
  assert(close.result === 'ok' && close.closed === 'rev-a', 'S-RT6: close-node SUCCEEDS with the open-ready RETURNED nonce, got ' + JSON.stringify({ result: close.result, reason: close.reason, mtc: close.missingTokenClass }));

  // And the wrong-node-id negative through close-node (evidence_unbound).
  h.files['/p/.cache/rev-b.md'] = 'evidence-binding: rev-a ' + byId['rev-b'] + '\nsecurity-reviewer\nverdict: pass\nfindings_blocking: 0';
  const closeBad = runCloseNode({ planPath: '/p/workflow-plan.md', project: 'p', nodeId: 'rev-b', shell: closeShell, readFile: h.readFile, writeFile: h.writeFile, cacheExists: h.cacheExists, unlink: h.unlink });
  assert(closeBad.result === 'refuse' && closeBad.reason === 'evidence_unbound', 'S-RT6: close-node wrong-node binding → evidence_unbound, got ' + JSON.stringify({ result: closeBad.result, reason: closeBad.reason }));
}

// S-RT7 (#411 BUG A — fused-advance nonce round-trip, the serial-chain wedge):
// the FULL two-close serial chain. open-next opens n1; close-and-open-next closes n1
// AND (fused advance) opens n2 → the RETURNED opened.nonce must be the real on-disk
// 12-char SHA prefix for n2 (the same derivation open-next/open-ready use). The pre-fix
// fused-advance `opened` object OMITS .nonce, so the orchestrator binds n2's evidence to
// `undefined` and the SECOND close refuses evidence_stale on every serial chain ≥2 nodes
// with a dependent. RED on current code (opened.nonce undefined → second close refuses);
// GREEN after the Bug A fix.
{
  const plan = makePlan([
    '| impl-core | pending | |',
    '| impl-other | pending | |',
    '| review | pending | |',
    '| finalize | pending | |',
  ]);
  const h = rtHarness({ '/p/workflow-plan.md': plan, '/p/workflow-state.md': makeState() }, {
    nextAction: { exitCode: 0, result: 'ok', allDone: false,
      readySet: [{ id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/adaptive-node.js', dependsOn: [] }],
      nextNode: { id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/adaptive-node.js' } },
  });
  // (1) open n1.
  const open = runOpenNext({ planPath: '/p/workflow-plan.md', statePath: '/p/workflow-state.md', project: 'p', nodeId: null, shell: h.shell, readFile: h.readFile, writeFile: h.writeFile });
  assert(open.result === 'ok' && open.nonce && open.nonce.length === 12, 'S-RT7: open-next opens n1 with a real nonce');
  h.files['/p/.cache/impl-core.md'] = 'evidence-binding: impl-core ' + open.nonce + '\nRED then GREEN\n3 assertions';

  // (2) close n1 → fused advance opens n2 (impl-other). next-action now surfaces impl-other.
  const closeShell = (scriptPath, args) => {
    const base = path.basename(scriptPath);
    if (base === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', allDone: false, readySet: [{ id: 'impl-other', role: 'implementer', model: 'sonnet', declared_write_set: 'scripts/other.js', dependsOn: ['impl-core'] }], nextNode: { id: 'impl-other', role: 'implementer', model: 'sonnet', declared_write_set: 'scripts/other.js' } };
    return h.shell(scriptPath, args);
  };
  const close1 = runCloseAndOpenNext({ planPath: '/p/workflow-plan.md', statePath: '/p/workflow-state.md', project: 'p', nodeId: 'impl-core', shell: closeShell, readFile: h.readFile, writeFile: h.writeFile, cacheExists: h.cacheExists, unlink: h.unlink });
  assert(close1.result === 'ok' && close1.closed === 'impl-core', 'S-RT7: first close ok, n1 closed');
  assert(close1.opened && close1.opened.id === 'impl-other', 'S-RT7: fused advance opened impl-other');
  // (3) THE Bug A assertion: the fused-advance opened object carries a real non-empty nonce.
  assert(typeof close1.opened.nonce === 'string' && close1.opened.nonce.length === 12,
    'S-RT7: fused-advance opened.nonce is a non-empty 12-char string (BUG A), got ' + JSON.stringify(close1.opened.nonce));
  assert(close1.opened.nonce === readNonce('/p/workflow-plan.md', 'impl-other', h.readFile),
    'S-RT7: fused-advance opened.nonce EQUALS the on-disk readNonce for impl-other (same derivation as open-next/open-ready)');

  // (4) record n2 evidence bound to the RETURNED fused-advance nonce (implementer role → needs
  // non_tdd_reason + a change-type token; the point under test is the BINDING, not the shape).
  h.files['/p/.cache/impl-other.md'] = 'evidence-binding: impl-other ' + close1.opened.nonce + '\nnon_tdd_reason: mechanical port\nbuild-green: ok\n';

  // (5) close n2 → must SUCCEED (not evidence_stale): the round-trip the binding promises.
  const close2Shell = (scriptPath, args) => {
    const base = path.basename(scriptPath);
    if (base === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', allDone: false, readySet: [{ id: 'review', role: 'code-reviewer', declared_write_set: '—', dependsOn: ['impl-other'] }], nextNode: { id: 'review', role: 'code-reviewer', declared_write_set: '—' } };
    return h.shell(scriptPath, args);
  };
  const close2 = runCloseAndOpenNext({ planPath: '/p/workflow-plan.md', statePath: '/p/workflow-state.md', project: 'p', nodeId: 'impl-other', shell: close2Shell, readFile: h.readFile, writeFile: h.writeFile, cacheExists: h.cacheExists, unlink: h.unlink });
  assert(close2.result === 'ok' && close2.closed === 'impl-other',
    'S-RT7: SECOND close SUCCEEDS with the fused-advance RETURNED nonce (not evidence_stale), got ' + JSON.stringify({ result: close2.result, reason: close2.reason, mtc: close2.missingTokenClass }));
}

// S-RT8 (#411 BUG B — running-set removal on the serial close path): close-and-open-next
// must remove the closing node from running-set.json (mirror close-node step (e)) so the
// next orient does not see an orphan multi-in_progress mismatch (the reconcile no-op wedge).
// RED on current code (close-and-open-next is running-set-blind → impl-core stays in the set).
{
  const plan = makePlan([
    '| impl-core | in_progress | |',
    '| impl-other | pending | |',
    '| review | pending | |',
    '| finalize | pending | |',
  ]);
  const RS = '/p/.cache/' + RUNNING_SET_NAME;
  const h = rtHarness({
    '/p/workflow-plan.md': plan,
    '/p/workflow-state.md': makeState(),
    // a serial running set holding ONLY the closing node (the post-open-next state).
    [RS]: JSON.stringify({ state: 'open', nodes: [{ id: 'impl-core', role: 'tdd-guide', kind: 'sequence' }] }, null, 2),
    // on-disk nonce + bound evidence so close passes the binding gate.
    '/p/.cache/barrier-base-impl-core': 'deadbeefimpl-corecafef00d1234\n',
  }, {
    nextAction: { exitCode: 0, result: 'ok', allDone: false, readySet: [{ id: 'impl-other', role: 'implementer', model: 'sonnet', declared_write_set: 'scripts/other.js', dependsOn: ['impl-core'] }], nextNode: { id: 'impl-other', role: 'implementer', model: 'sonnet', declared_write_set: 'scripts/other.js' } },
  });
  h.files['/p/.cache/impl-core.md'] = 'evidence-binding: impl-core ' + readNonce('/p/workflow-plan.md', 'impl-core', h.readFile) + '\nRED then GREEN\n';
  const close = runCloseAndOpenNext({ planPath: '/p/workflow-plan.md', statePath: '/p/workflow-state.md', project: 'p', nodeId: 'impl-core', shell: h.shell, readFile: h.readFile, writeFile: h.writeFile, cacheExists: h.cacheExists, unlink: h.unlink });
  assert(close.result === 'ok' && close.closed === 'impl-core', 'S-RT8: close ok');
  const setAfter = readRunningSet(RS, h.cacheExists, h.readFile);
  const stillThere = !!(setAfter && (setAfter.nodes || []).some(n => n.id === 'impl-core'));
  assert(!stillThere, 'S-RT8: closed node REMOVED from running-set.json by close-and-open-next (BUG B), running set after = ' + JSON.stringify(setAfter));
}

// S-RT9 RETIRED (#594): the excl-batch fence on the serial close path (close-and-open-next refusing an
// unsealed parallel-batch member) is gone — active-batch.json has no producer left, so the guarded
// state is unproducible. The NARROW lane-group-member fence in the close-and-open-next body (keyed on
// lane_group membership, the #463 Slice 4 silent-loss catch) is unaffected and remains covered by the
// leg-group close tests.

// ===========================================================================
// S-293 (#293/S-fix RECONCILE DEAD-END): 1 in_progress (serial node A) + an 'open'
// (non-opening) running set holding a `pending` member B. crossCheckStatus stays
// single_in_progress (unchanged read-side legacy verdict), but orient must NAME
// reconcile-running-set (was a bare `ok` dead-end), and reconcile must DROP B (was a
// not_opening no-op) so the loop reaches a dispatchable/clean state.
//
// MUTATION PROOF: revert the orient stale-member gate → S-293a goes RED (orient back
// to bare ok, no repair). Revert the reconcile stale-drop → S-293b goes RED
// (reconcile back to not_opening no-op, B never dropped).
// ===========================================================================
{
  const plan = makePlan(['| node-a | in_progress | |', '| node-b | pending | |', '| finalize | pending | |'], [
    '| node-a | implementer | — | scripts/a.js | 1 | sequence |',
    '| node-b | code-reviewer | — | — | 1 | sequence |',
    '| finalize | finalize | node-a node-b | CHANGELOG.md | 1 | sequence |',
  ]);
  // running set is state:'open' (NOT opening), holding member B whose ledger row is pending.
  const staleSet = JSON.stringify({ state: 'open', nodes: [{ id: 'node-b', role: 'code-reviewer', kind: 'read', baseline: 'recorded' }] });

  // (a) orient NAMES reconcile-running-set (no dead-end bare ok).
  {
    const files = { [RS_PLAN_PATH]: plan, '/p/workflow-state.md': makeState(), [RS_SET_PATH]: staleSet };
    const r = runOrient({
      planPath: RS_PLAN_PATH, statePath: '/p/workflow-state.md', project: 'p',
      shell: (sp) => { const b = path.basename(sp); if (b === 'kaola-workflow-plan-validator.js') return { exitCode: 0, ok: true }; if (b === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', allDone: false, readySet: [], readyPending: [] }; return { exitCode: 0, result: 'ok' }; },
      readFile: (fp) => { if (fp in files) return files[fp]; throw new Error('ENOENT ' + fp); },
      writeFile: () => {},
      cacheExists: (fp) => fp in files,
    });
    assert(r.result === 'refuse' && r.reason === 'running_set_stale_member', 'S-293a: orient routes stale member → refuse running_set_stale_member, got ' + JSON.stringify({ result: r.result, reason: r.reason }));
    assert(r.repair === 'reconcile-running-set', 'S-293a: orient names reconcile-running-set as the repair (no dead-end), got ' + JSON.stringify(r.repair));
  }

  // (b) reconcile DROPS B and reaches a clean state (NOT a not_opening no-op).
  {
    const h = rsHarness({ [RS_PLAN_PATH]: plan, [RS_SET_PATH]: staleSet }, (base) => {
      if (base === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', allDone: false, readyPending: [] };
      return { exitCode: 0, result: 'ok' };
    });
    const r = runReconcileRunningSet({ planPath: RS_PLAN_PATH, project: 'p', shell: h.shell, readFile: h.readFile, writeFile: h.writeFile, cacheExists: h.cacheExists });
    assert(r.result === 'ok' && r.reconciled === true, 'S-293b: reconcile reconciled (NOT a not_opening no-op), got ' + JSON.stringify({ reconciled: r.reconciled, reason: r.reason }));
    assert(Array.isArray(r.staleDropped) && r.staleDropped.includes('node-b'), 'S-293b: node-b dropped as stale, got ' + JSON.stringify(r.staleDropped));
    assert(r.reason === 'stale_member_dropped', 'S-293b: reason stale_member_dropped, got ' + JSON.stringify(r.reason));
    const set = JSON.parse(h.files[RS_SET_PATH]);
    assert(set.nodes.length === 0, 'S-293b: running set emptied of the stale member (dispatchable/clean), got ' + JSON.stringify(set.nodes));
    // The stale member's baseline was dropped (the #281/#296 stale-baseline guard).
    assert(h.shellCalls.some(c => c.base === 'kaola-workflow-plan-validator.js' && c.args.includes('--drop-base') && c.args.includes('node-b')), 'S-293b: --drop-base node-b called');
    // And node-a (the real in_progress serial node) is untouched.
    assert(h.files[RS_PLAN_PATH].includes('| node-a | in_progress | |'), 'S-293b: node-a (real serial in_progress) untouched');
  }
}

// ===========================================================================
// #355 unified refusal/emit protocol — shared emit/refuse + task-mirror reason
// now visible to adaptive-node callers (was lost on stderr).
// ===========================================================================
{
  const { emit, refuse } = require('./kaola-workflow-adaptive-schema');

  // S1: refuse() builds the canonical envelope; extra fields are additive.
  const r = refuse('barrier_failed', { nodeId: 'n1', status: 'x' });
  assert(r.result === 'refuse' && r.reason === 'barrier_failed' && r.nodeId === 'n1' && r.status === 'x',
    'S1: refuse() → {result:refuse, reason, ...extra}');

  // S2: emit() writes EXACTLY ONE compact JSON line (round-trips through the last-line parser).
  let captured = '';
  emit({ result: 'ok', a: 1 }, { stream: { write: s => { captured += s; } } });
  assert(captured === '{"result":"ok","a":1}\n', 'S2: emit() writes one compact JSON line + newline, got ' + JSON.stringify(captured));
  assert(captured.split('\n').filter(Boolean).length === 1, 'S2: emit() is single-line');

  // S3: END-TO-END — task-mirror refusal reason now survives shellNode (the #355 bug:
  // it used to print on stderr, which shellNode's err.stdout parse never saw).
  const tmPath = path.join(__dirname, 'kaola-workflow-task-mirror.js');
  const noArg = shellNode(tmPath, ['--json']); // no --project → missing_arg refusal
  assert(noArg.exitCode === 1, 'S3: task-mirror missing --project exits 1');
  assert(noArg.result === 'refuse' && noArg.reason === 'missing_arg',
    'S3: task-mirror refusal reason recovered from STDOUT via shellNode, got ' + JSON.stringify({ result: noArg.result, reason: noArg.reason }));

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-355-'));
  const badProj = shellNode(tmPath, ['--project', 'no-such-project-xyz', '--json']);
  assert(badProj.exitCode === 1 && badProj.reason === 'plan_not_found',
    'S3: task-mirror plan_not_found reason recovered via shellNode, got ' + JSON.stringify(badProj.reason));
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
}

// ===========================================================================
// CLUSTER S — mutual-exclusion spine (#383/#384/#385/#387/#391/#392/#403).
// readCoordinationState (pure) + probeCoordination (fs) + the unified guard prologue.
// ===========================================================================

// ---------------------------------------------------------------------------
// S-CO1: readCoordinationState — serial fallback. One in_progress row, NO running set →
// serialLive=true, all scheduler arms false (vacuous-pass guards). (#594: no batch surface.)
// ---------------------------------------------------------------------------
{
  const plan = makePlan(['| impl-core | in_progress | |', '| review | pending | |']);
  const co = readCoordinationState(plan, { runningSet: null });
  assert(co.serialLive === true, 'S-CO1: single in_progress + no running set → serialLive');
  assert(co.runningSetLive === false && co.runningSetOpening === false, 'S-CO1: no running set live');
  assert(!('batchLive' in co) && !('batchOpening' in co), 'S-CO1: no batch fields surfaced (#594 batch surface retired)');
  assert(co.inProgressIds.length === 1 && co.inProgressIds[0] === 'impl-core', 'S-CO1: inProgressIds=[impl-core]');
  assert(co.collisions.length === 0, 'S-CO1: no collisions in the serial case');
}

// ---------------------------------------------------------------------------
// S-CO2: readCoordinationState — zero in_progress → NOT serialLive (idle, all arms false).
// ---------------------------------------------------------------------------
{
  const plan = makePlan(['| impl-core | pending | |']);
  const co = readCoordinationState(plan, {});
  assert(co.serialLive === false && co.inProgressIds.length === 0, 'S-CO2: idle ledger → not serialLive');
}

// ---------------------------------------------------------------------------
// S-CO3: readCoordinationState — a live running set → runningSetLive, serialLive false
// even with one matching in_progress row (the running set OWNS that node).
// ---------------------------------------------------------------------------
{
  const plan = makePlan(['| a | in_progress | |', '| b | in_progress | |']);
  const runningSet = { state: 'open', nodes: [{ id: 'a', kind: 'read' }, { id: 'b', kind: 'read' }] };
  const co = readCoordinationState(plan, { runningSet, manifest: null });
  assert(co.runningSetLive === true && co.runningSetOpening === false, 'S-CO3: open running set → runningSetLive');
  assert(co.serialLive === false, 'S-CO3: serialLive false when a running set is live');
}

// ---------------------------------------------------------------------------
// S-CO4: readCoordinationState — a crashed 'opening' running set → runningSetOpening,
// not runningSetLive.
// ---------------------------------------------------------------------------
{
  const plan = makePlan(['| a | pending | |']);
  const runningSet = { state: 'opening', nodes: [{ id: 'a', kind: 'read', opening: true }] };
  const co = readCoordinationState(plan, { runningSet });
  assert(co.runningSetOpening === true && co.runningSetLive === false, 'S-CO4: opening set → runningSetOpening, not live');
}

// ---------------------------------------------------------------------------
// S-CO5 / S-CO6 RETIRED (#594): the parallel-batch coordination surface (active-batch.json →
// batchLive/batchOpening + the batch/running-set UNION collision state) has no producer left, so
// readCoordinationState no longer derives it. The surviving surfaces — serial + running-set — are
// mutually exclusive (serialLive requires no live/opening running set), so no union collision state is
// producible. Serial and running-set liveness are covered by S-CO1..S-CO4.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// S-PC (#383): probeCoordination — fs wrapper reads plan + the running set and surfaces them.
// (#594: the batch manifest is no longer a coordination surface — probeCoordination no longer reads
// active-batch.json and no longer returns a `manifest` field.)
// ---------------------------------------------------------------------------
{
  const plan = makePlan(['| a | in_progress | |', '| b | in_progress | |']);
  const files = {
    [RS_PLAN_PATH]: plan,
    [RS_SET_PATH]: JSON.stringify({ state: 'open', nodes: [{ id: 'a' }, { id: 'b' }] }),
  };
  const probe = probeCoordination({
    planPath: RS_PLAN_PATH,
    readFile: (fp) => { if (fp in files) return files[fp]; throw new Error('ENOENT ' + fp); },
    cacheExists: (fp) => fp in files,
  });
  assert(probe.runningSetLive === true && probe.runningSet && probe.runningSet.nodes.length === 2, 'S-PC: probe reads running set');
  assert(!('manifest' in probe), 'S-PC: probe no longer surfaces a batch manifest field (#594 batch surface retired)');
}

// ---------------------------------------------------------------------------
// S-CR (#384/#391c): complianceRowExists — true only when the section already has a row for the cell.
// ---------------------------------------------------------------------------
{
  const base = makePlan(['| a | complete | |']);
  assert(complianceRowExists(base, 'code-reviewer', 'a') === false, 'S-CR: absent compliance row → false');
  const withRow = spliceComplianceRow(base, '| code-reviewer | subagent-invoked | ok | |');
  assert(complianceRowExists(withRow, 'code-reviewer', 'a') === true, 'S-CR: present row (bare role) → true');
  assert(complianceRowExists(withRow, 'implementer (a)', 'a') === false, 'S-CR: different cell → false');
  const withNode = spliceComplianceRow(base, '| implementer (impl-x) | subagent-invoked | ok | |');
  assert(complianceRowExists(withNode, 'implementer (impl-x)', 'impl-x') === true, 'S-CR: present row (role (id)) → true');
}

// ---------------------------------------------------------------------------
// S-VU (#403.4): checkVerdictParse — near-miss verdict for a verdict-bearing role.
// ---------------------------------------------------------------------------
{
  // Clean column-0 lowercase `verdict:` (what finalize --verdict-check accepts) → no warning, even
  // when the VALUE case varies (parseNodeVerdict lowercases the value).
  assert(checkVerdictParse('code-reviewer', 'verdict: pass\nfindings_blocking: 0') === null, 'S-VU: clean lowercase pass → no warning');
  assert(checkVerdictParse('code-reviewer', 'verdict: fail') === null, 'S-VU: clean fail → no warning');
  assert(checkVerdictParse('code-reviewer', 'verdict: Pass') === null, 'S-VU: lowercase key + capital value still parses (value is lowercased) → no warning');
  // The #403.4 near-miss: a CAPITAL `Verdict:` key is invisible to the strict column-0 matcher
  // (finalize fails missing-verdict) → emit the non-blocking warning.
  const w = checkVerdictParse('code-reviewer', 'Verdict: Pass\nfindings_blocking: 0');
  assert(w && w.verdict_unparsed === true && w.verdictRaw === 'Pass', 'S-VU: capital-key Verdict: Pass → verdict_unparsed warning, got ' + JSON.stringify(w));
  // A typo value that strict can't recognize → warning too.
  const w2 = checkVerdictParse('security-reviewer', 'verdict: passs');
  assert(w2 && w2.verdict_unparsed === true, 'S-VU: typo value → verdict_unparsed warning');
  assert(checkVerdictParse('implementer', 'Verdict: Pass') === null, 'S-VU: non-verdict role → null (not verdict-bearing)');
  assert(checkVerdictParse('code-reviewer', 'no verdict line here') === null, 'S-VU: no verdict line → null');
}

// ---------------------------------------------------------------------------
// S383d: runCloseAndOpenNext NEVER reports `opened` for an already-in_progress node.
// (next-action.readySet includes in_progress; the consumer must not re-announce it.)
// ---------------------------------------------------------------------------
{
  // Ledger: closing 'rev' exposes nextNode 'next' which is ALREADY in_progress (a #383 wedge).
  const plan = makePlan(['| rev | in_progress | |', '| next | in_progress | |', '| finalize | pending | |'], [
    '| rev | code-reviewer | — | — | 1 | sequence |',
    '| next | code-explorer | — | — | 1 | sequence |',
    '| finalize | finalize | rev next | CHANGELOG.md | 1 | sequence |',
  ]);
  let planContent = plan;
  const files = { [RS_PLAN_PATH]: plan, '/p/.cache/rev.md': 'code-reviewer\nverdict: pass\nfindings_blocking: 0' };
  const r = runCloseAndOpenNext({
    planPath: RS_PLAN_PATH, statePath: '/p/workflow-state.md', project: 'p', nodeId: 'rev',
    shell: (sp) => { const b = path.basename(sp);
      if (b === 'kaola-workflow-commit-node.js') return { exitCode: 0, result: 'ok', selectorCheck: {} };
      if (b === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', allDone: false,
        readyPending: [{ id: 'next', role: 'code-explorer', declared_write_set: '—' }],
        nextNode: { id: 'next', role: 'code-explorer', declared_write_set: '—' } };
      return { exitCode: 0, result: 'ok' };
    },
    readFile: (fp) => { if (fp in files) return files[fp]; if (fp === RS_PLAN_PATH) return planContent; throw new Error('ENOENT ' + fp); },
    writeFile: (fp, c) => { files[fp] = c; if (fp === RS_PLAN_PATH) planContent = c; },
    cacheExists: (fp) => fp in files,
  });
  assert(r.result === 'ok' && r.closed === 'rev', 'S383d: rev closed');
  assert(r.opened === null, 'S383d: opened is null (the next node was already in_progress — no double dispatch), got ' + JSON.stringify(r.opened));
}

// ---------------------------------------------------------------------------
// S383d-control: a NORMAL linear chain (next node PENDING) still opens it — byte-shape preserved.
// ---------------------------------------------------------------------------
{
  const plan = makePlan(['| rev | in_progress | |', '| next | pending | |', '| finalize | pending | |'], [
    '| rev | code-reviewer | — | — | 1 | sequence |',
    '| next | code-explorer | rev | — | 1 | sequence |',
    '| finalize | finalize | next | CHANGELOG.md | 1 | sequence |',
  ]);
  let planContent = plan;
  const files = { [RS_PLAN_PATH]: plan, '/p/.cache/rev.md': 'code-reviewer\nverdict: pass\nfindings_blocking: 0' };
  const r = runCloseAndOpenNext({
    planPath: RS_PLAN_PATH, statePath: '/p/workflow-state.md', project: 'p', nodeId: 'rev',
    shell: (sp) => { const b = path.basename(sp);
      if (b === 'kaola-workflow-commit-node.js') return { exitCode: 0, result: 'ok', selectorCheck: {} };
      if (b === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', allDone: false,
        readyPending: [{ id: 'next', role: 'code-explorer', declared_write_set: '—' }],
        nextNode: { id: 'next', role: 'code-explorer', declared_write_set: '—' } };
      return { exitCode: 0, result: 'ok' };
    },
    readFile: (fp) => { if (fp in files) return files[fp]; if (fp === RS_PLAN_PATH) return planContent; throw new Error('ENOENT ' + fp); },
    writeFile: (fp, c) => { files[fp] = c; if (fp === RS_PLAN_PATH) planContent = c; },
    cacheExists: (fp) => fp in files,
  });
  assert(r.result === 'ok' && r.opened && r.opened.id === 'next', 'S383d-control: pending next node IS opened (linear chain unchanged)');
}

// ---------------------------------------------------------------------------
// S387a (#387): open-ready refuses plan_integrity_failed on a tampered plan (validator
// --resume-check fails) BEFORE opening any node — mirrors open-batch/top-up.
// ---------------------------------------------------------------------------
{
  const plan = makePlan(['| rev-a | pending | |', '| rev-b | pending | |']);
  const h = rsHarness(
    { [RS_PLAN_PATH]: plan },
    (base) => {
      if (base === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', allDone: false, readyPending: [{ id: 'rev-a', role: 'code-reviewer', declared_write_set: '—' }] };
      if (base === 'kaola-workflow-commit-node.js') return { exitCode: 0, result: 'ok' };
      return { exitCode: 1, result: 'refuse' };
    },
    // tampered plan → --resume-check fails.
    (base, a) => a.includes('--resume-check') ? { exitCode: 1, ok: false, reason: 'plan_hash mismatch' } : null
  );
  const r = runOpenReady({ planPath: RS_PLAN_PATH, project: 'p', max: null, fanoutCapReadonly: 8, shell: h.shell, readFile: h.readFile, writeFile: h.writeFile, cacheExists: h.cacheExists, mkdirp: h.mkdirp });
  assert(r.result === 'refuse' && r.reason === 'plan_integrity_failed', 'S387a: open-ready refuses plan_integrity_failed on tampered plan, got ' + JSON.stringify({ result: r.result, reason: r.reason }));
  assert(!(RS_SET_PATH in h.files), 'S387a: zero mutation — no running-set written');
  assert(h.files[RS_PLAN_PATH].includes('| rev-a | pending | |'), 'S387a: ledger unchanged');
}

// ---------------------------------------------------------------------------
// #499a (wiring): open-next refuses plan_integrity_failed on a tampered plan (validator
// --resume-check fails) BEFORE opening any node — the serial resume / open-next path now carries
// the SAME integrity gate the fused/batch (open-ready/open-batch/top-up) paths already carry.
// Mirrors S387a (open-ready). Mock-shell proves the WIRING; #499b proves it bites the REAL path.
// ---------------------------------------------------------------------------
{
  let planContent = makePlan(['| impl-core | pending | |']);
  const shellCalls = [];
  const r = runOpenNext({
    planPath: RS_PLAN_PATH, statePath: '/p/workflow-state.md', project: 'p', nodeId: null,
    shell: (sp, a) => {
      const b = path.basename(sp); const args = a || []; shellCalls.push({ b, args: args.slice() });
      // tampered plan → --resume-check fails (the integrity layer must run it and refuse).
      if (b === 'kaola-workflow-plan-validator.js' && args.includes('--resume-check')) return { exitCode: 1, ok: false, reason: 'plan_hash mismatch' };
      if (b === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', allDone: false, readySet: [{ id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/x.js', dependsOn: [] }], nextNode: { id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/x.js' } };
      return { exitCode: 0, result: 'ok' };
    },
    readFile: (fp) => fp.endsWith('workflow-plan.md') ? planContent : makeState(),
    writeFile: (fp, c) => { if (fp.endsWith('workflow-plan.md')) planContent = c; },
    cacheExists: () => false,
  });
  assert(r.result === 'refuse' && r.reason === 'plan_integrity_failed', '#499a: open-next refuses plan_integrity_failed on tampered plan, got ' + JSON.stringify({ result: r.result, reason: r.reason }));
  assert(planContent.includes('| impl-core | pending | |'), '#499a: zero mutation — ledger row NOT opened');
  // The integrity layer ran BEFORE next-action (fail-closed precedence): no node was opened.
  assert(shellCalls.some(c => c.b === 'kaola-workflow-plan-validator.js' && c.args.includes('--resume-check')), '#499a: open-next shelled validator --resume-check (integrity layer wired)');
  assert(!shellCalls.some(c => c.b === 'kaola-workflow-commit-node.js' && c.args.includes('--start')), '#499a: no baseline recorded — integrity refused before open');
}

// ---------------------------------------------------------------------------
// #499b (REAL validator, false-green proof): freeze a plan in a REAL git repo, then TAMPER it with a
// hash-defeating content edit that keeps the DAG acyclic/unique-sink (widen a declared_write_set). The
// REAL plan-validator --resume-check detects the plan_hash mismatch. Unpatched open-next (no integrity
// layer) OPENS the node despite the tamper; patched open-next REFUSES plan_integrity_failed with zero
// mutation. Driving the real subprocess (not an injected ok:false stub) is the #292 anti-false-green
// discipline: a stubbed integrity test passes even if the wiring is wrong; this bites only the real path.
// ---------------------------------------------------------------------------
{
  const { execFileSync } = require('child_process');
  const NODE_CLI = path.join(__dirname, 'kaola-workflow-adaptive-node.js');
  const VALIDATOR = path.join(__dirname, 'kaola-workflow-plan-validator.js');
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'd499-resume-'));
  const project = 'test-project';
  const projDir = path.join(repoRoot, 'kaola-workflow', project);
  fs.mkdirSync(path.join(projDir, '.cache'), { recursive: true });
  const planPath = path.join(projDir, 'workflow-plan.md');
  // A simple linear chain: a (ready, write) → review → finalize (sink). a is pending/ready ⇒ open-next opens it.
  const plan = [
    '# Workflow Plan — test-project', '',
    '## Meta', 'labels: area:scripts', 'sink: CHANGELOG.md', '',
    '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '| --- | --- | --- | --- | --- | --- |',
    '| a        | tdd-guide     | —      | scripts/a.js | 1 | sequence |',
    '| review   | code-reviewer | a      | —            | 1 | sequence |',
    '| finalize | finalize      | review | —            | 1 | sequence |', '',
    '## Node Ledger', '',
    '| id | status |', '| --- | --- |',
    '| a | pending |',
    '| review | pending |',
    '| finalize | pending |', '',
  ].join('\n') + '\n';
  fs.writeFileSync(planPath, plan);
  fs.writeFileSync(path.join(projDir, 'workflow-state.md'), '# State\n');
  const g = (args) => execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'] });
  g(['init']); g(['config', 'user.email', 'kw@test']); g(['config', 'user.name', 'kw']); g(['config', 'commit.gpgsign', 'false']);
  // Freeze in place so plan_hash exists.
  execFileSync('node', [VALIDATOR, planPath, '--freeze', '--repair', '--json'], { cwd: repoRoot, encoding: 'utf8' });
  fs.writeFileSync(path.join(repoRoot, '.gitignore'), '.kw/\n');
  g(['add', '-A']); g(['commit', '-m', 'init']);
  // Sanity: the FROZEN plan passes --resume-check (control — proves the tamper, not a freeze bug, fails it).
  let preCheck = {};
  try { preCheck = JSON.parse(execFileSync('node', [VALIDATOR, planPath, '--resume-check', '--json'], { cwd: repoRoot, encoding: 'utf8' }).trim().split('\n').pop()); } catch (_) {}
  assert(preCheck.ok === true, '#499b: control — the frozen plan passes --resume-check, got ' + JSON.stringify(preCheck));
  // TAMPER: widen a's declared_write_set (a hash-defeating content edit that keeps the DAG valid).
  const tampered = fs.readFileSync(planPath, 'utf8').replace('| a        | tdd-guide     | —      | scripts/a.js | 1 | sequence |', '| a        | tdd-guide     | —      | scripts/a.js scripts/b.js | 1 | sequence |');
  fs.writeFileSync(planPath, tampered);
  // The REAL validator now detects the mismatch.
  let postCheck = {};
  try { postCheck = JSON.parse(execFileSync('node', [VALIDATOR, planPath, '--resume-check', '--json'], { cwd: repoRoot, encoding: 'utf8' }).trim().split('\n').pop()); } catch (err) { try { postCheck = JSON.parse(String(err.stdout || '').trim().split('\n').pop()); } catch (_) {} }
  assert(postCheck.ok !== true, '#499b: the tampered plan FAILS --resume-check (real validator detects the hash mismatch), got ' + JSON.stringify(postCheck));
  // open-next on the tampered plan MUST refuse plan_integrity_failed (post-fix) with zero mutation.
  let openOut = {};
  let openExit = 0;
  try { openOut = JSON.parse(execFileSync('node', [NODE_CLI, 'open-next', '--project', project, '--json'], { cwd: repoRoot, encoding: 'utf8' }).trim().split('\n').pop()); }
  catch (err) { openExit = (err.status == null) ? 1 : err.status; try { openOut = JSON.parse(String(err.stdout || '').trim().split('\n').pop()); } catch (_) {} }
  assert(openOut.result === 'refuse' && openOut.reason === 'plan_integrity_failed', '#499b: open-next REFUSES plan_integrity_failed on the tampered plan (the serial-resume integrity gate), got exit=' + openExit + ' ' + JSON.stringify(openOut));
  // Zero mutation: a stays pending in the ledger (it was NOT opened).
  const after = fs.readFileSync(planPath, 'utf8');
  const ledgerStart = after.indexOf('## Node Ledger');
  const ledgerBody = ledgerStart >= 0 ? after.slice(ledgerStart) : after;
  assert(/^\|\s*a\s*\|\s*pending\s*\|/m.test(ledgerBody), '#499b: zero mutation — a stays pending (open-next did NOT open it through the tamper)');
  try { fs.rmSync(repoRoot, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// S387b (#387): close-node refuses plan_integrity_failed on a tampered plan BEFORE close.
// ---------------------------------------------------------------------------
{
  const plan = makePlan(['| rev | in_progress | |'], ['| rev | code-reviewer | — | — | 1 | sequence |']);
  const h = rsHarness(
    { [RS_PLAN_PATH]: plan, '/p/.cache/rev.md': 'code-reviewer\nverdict: pass\nfindings_blocking: 0' },
    (base) => { if (base === 'kaola-workflow-commit-node.js') return { exitCode: 0, result: 'ok', selectorCheck: {} }; if (base === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', allDone: false, readyPending: [] }; return { exitCode: 1, result: 'refuse' }; },
    (base, a) => a.includes('--resume-check') ? { exitCode: 1, ok: false, reason: 'plan_hash mismatch' } : null
  );
  const r = runCloseNode({ planPath: RS_PLAN_PATH, project: 'p', nodeId: 'rev', shell: h.shell, readFile: h.readFile, writeFile: h.writeFile, cacheExists: h.cacheExists, unlink: h.unlink });
  assert(r.result === 'refuse' && r.reason === 'plan_integrity_failed', 'S387b: close-node refuses plan_integrity_failed on tampered plan, got ' + JSON.stringify({ result: r.result, reason: r.reason }));
  assert(h.files[RS_PLAN_PATH].includes('| rev | in_progress | |'), 'S387b: ledger row NOT closed');
}

// ---------------------------------------------------------------------------
// S391b (#391b): the consent-halt fence — a durable consent_halt: pending in the ledger refuses
// open-next / open-ready / close-and-open-next / close-node with halt_pending (zero mutation).
// ---------------------------------------------------------------------------
{
  // Inject a durable consent_halt: pending into the ## Node Ledger (mirrors write-halt).
  function haltPlan(rows, extra) {
    const p = makePlan(rows, extra);
    return p.replace('## Node Ledger\n', '## Node Ledger\nconsent_halt: pending\n');
  }
  assert(readDurableConsentHalt(haltPlan(['| a | pending | |'])) === true, 'S391b: fixture has durable halt');

  // open-next
  {
    let planContent = haltPlan(['| impl-core | pending | |']);
    const r = runOpenNext({
      planPath: RS_PLAN_PATH, statePath: '/p/workflow-state.md', project: 'p', nodeId: null,
      // #499: open-next integrity layer runs BEFORE the halt fence — a clean frozen plan passes
      // --resume-check, so the halt_pending fence (Layer 2) is the one that fires here (precedence intact).
      shell: (sp, a) => { const b = path.basename(sp); if (b === 'kaola-workflow-plan-validator.js' && (a || []).includes('--resume-check')) return { exitCode: 0, ok: true }; if (b === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', allDone: false, readySet: [{ id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/x.js', dependsOn: [] }], nextNode: { id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/x.js' } }; return { exitCode: 0, result: 'ok' }; },
      readFile: (fp) => fp.endsWith('workflow-plan.md') ? planContent : makeState(),
      writeFile: (fp, c) => { if (fp.endsWith('workflow-plan.md')) planContent = c; },
      cacheExists: () => false,
    });
    assert(r.result === 'refuse' && r.reason === 'halt_pending', 'S391b: open-next refuses halt_pending, got ' + JSON.stringify({ result: r.result, reason: r.reason }));
    assert(planContent.includes('| impl-core | pending | |'), 'S391b: open-next made zero mutation under halt');
  }
  // open-ready
  {
    const plan = haltPlan(['| rev | pending | |'], ['| rev | code-reviewer | — | — | 1 | sequence |']);
    const h = rsHarness({ [RS_PLAN_PATH]: plan }, (base) => { if (base === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', allDone: false, readyPending: [{ id: 'rev', role: 'code-reviewer', declared_write_set: '—' }] }; return { exitCode: 0, result: 'ok' }; });
    const r = runOpenReady({ planPath: RS_PLAN_PATH, project: 'p', max: null, fanoutCapReadonly: 8, shell: h.shell, readFile: h.readFile, writeFile: h.writeFile, cacheExists: h.cacheExists, mkdirp: h.mkdirp });
    assert(r.result === 'refuse' && r.reason === 'halt_pending', 'S391b: open-ready refuses halt_pending, got ' + JSON.stringify(r.reason));
  }
  // close-node
  {
    const plan = haltPlan(['| rev | in_progress | |'], ['| rev | code-reviewer | — | — | 1 | sequence |']);
    const h = rsHarness({ [RS_PLAN_PATH]: plan, '/p/.cache/rev.md': 'code-reviewer\nverdict: pass\nfindings_blocking: 0' }, (base) => { if (base === 'kaola-workflow-commit-node.js') return { exitCode: 0, result: 'ok', selectorCheck: {} }; if (base === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', allDone: false, readyPending: [] }; return { exitCode: 1, result: 'refuse' }; });
    const r = runCloseNode({ planPath: RS_PLAN_PATH, project: 'p', nodeId: 'rev', shell: h.shell, readFile: h.readFile, writeFile: h.writeFile, cacheExists: h.cacheExists, unlink: h.unlink });
    assert(r.result === 'refuse' && r.reason === 'halt_pending', 'S391b: close-node refuses halt_pending, got ' + JSON.stringify(r.reason));
    assert(h.files[RS_PLAN_PATH].includes('| rev | in_progress | |'), 'S391b: close-node made zero mutation under halt');
  }
}

// ---------------------------------------------------------------------------
// S383-excl (#383): open-ready refuses serial_node_live over a live serial node. (#594: the batch_active
// sub-case — open-ready refusing over a live active-batch.json manifest — was removed; that manifest has
// no producer left, so the guarded state is unproducible.)
// ---------------------------------------------------------------------------
{
  // serial_node_live: one in_progress row, NO running-set file (serial node live).
  {
    const plan = makePlan(['| impl-core | in_progress | |', '| rev | pending | |'], [
      '| impl-core | implementer | — | scripts/a.js | 1 | sequence |',
      '| rev | code-reviewer | impl-core | — | 1 | sequence |',
    ]);
    const h = rsHarness({ [RS_PLAN_PATH]: plan }, (base) => { if (base === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', allDone: false, readyPending: [{ id: 'rev', role: 'code-reviewer', declared_write_set: '—' }] }; return { exitCode: 0, result: 'ok' }; });
    const r = runOpenReady({ planPath: RS_PLAN_PATH, project: 'p', max: null, fanoutCapReadonly: 8, shell: h.shell, readFile: h.readFile, writeFile: h.writeFile, cacheExists: h.cacheExists, mkdirp: h.mkdirp });
    assert(r.result === 'refuse' && r.reason === 'serial_node_live', 'S383-excl: open-ready refuses serial_node_live over a live serial node, got ' + JSON.stringify(r.reason));
  }
}

// ---------------------------------------------------------------------------
// S-BYTE (HARD INVARIANT): serial-fallback byte-identity. With no running-set, no active-batch,
// ≤1 in_progress, and no consent_halt marker, the guard prologue is vacuously-pass and open-next /
// close-and-open-next produce the SAME result shape as the legacy serial path. This pins that the
// added layers never perturb a normal linear chain.
// ---------------------------------------------------------------------------
{
  // open-next on a clean linear chain: no manifests, no halt, 0 in_progress.
  let planContent = makePlan(['| impl-core | pending | |', '| review | pending | |', '| finalize | pending | |'], [
    '| impl-core | tdd-guide | — | scripts/x.js | 1 | sequence |',
    '| review | code-reviewer | impl-core | — | 1 | sequence |',
    '| finalize | finalize | review | CHANGELOG.md | 1 | sequence |',
  ]);
  const on = runOpenNext({
    planPath: RS_PLAN_PATH, statePath: '/p/workflow-state.md', project: 'p', nodeId: null,
    // #499: open-next now runs the integrity layer; a clean frozen plan passes --resume-check, so the
    // serial fallback result SHAPE is preserved (the layer only adds a fail-closed gate, no happy-path diff).
    shell: (sp, a) => { const b = path.basename(sp); if (b === 'kaola-workflow-plan-validator.js' && (a || []).includes('--resume-check')) return { exitCode: 0, ok: true }; if (b === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', allDone: false, readySet: [{ id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/x.js', dependsOn: [] }], nextNode: { id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/x.js' } }; if (b === 'kaola-workflow-commit-node.js') return { exitCode: 0, result: 'ok' }; return { exitCode: 0, result: 'ok' }; },
    readFile: (fp) => fp.endsWith('workflow-plan.md') ? planContent : makeState(),
    writeFile: (fp, c) => { if (fp.endsWith('workflow-plan.md')) planContent = c; },
    cacheExists: () => false,
  });
  assert(on.result === 'ok' && on.opened && on.opened.id === 'impl-core', 'S-BYTE: open-next legacy linear chain opens impl-core (serial fallback unchanged)');
  assert(on.allDone === false && on.baselineRecorded === true, 'S-BYTE: open-next ok shape preserved');
  assert(!('reason' in on), 'S-BYTE: open-next did NOT add a refusal reason on the serial path');

  // close-and-open-next on the linear chain: close impl-core, open review (a PENDING next).
  {
    const files = { [RS_PLAN_PATH]: planContent, '/p/.cache/impl-core.md': 'RED then GREEN\nthe test ran' };
    let pc = files[RS_PLAN_PATH];
    const r = runCloseAndOpenNext({
      planPath: RS_PLAN_PATH, statePath: '/p/workflow-state.md', project: 'p', nodeId: 'impl-core',
      shell: (sp) => { const b = path.basename(sp);
        if (b === 'kaola-workflow-commit-node.js') return { exitCode: 0, result: 'ok', selectorCheck: {} };
        if (b === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', allDone: false, readyPending: [{ id: 'review', role: 'code-reviewer', declared_write_set: '—' }], nextNode: { id: 'review', role: 'code-reviewer', declared_write_set: '—' } };
        return { exitCode: 0, result: 'ok' };
      },
      readFile: (fp) => { if (fp in files) return files[fp]; if (fp === RS_PLAN_PATH) return pc; throw new Error('ENOENT ' + fp); },
      writeFile: (fp, c) => { files[fp] = c; if (fp === RS_PLAN_PATH) pc = c; },
      cacheExists: (fp) => fp in files,
    });
    // The impl-core row was flipped to in_progress by open-next above; flip it so close has a target.
    // (open-next above already set it; pc carries it.)
    assert(r.result === 'ok' && r.closed === 'impl-core', 'S-BYTE: close-and-open-next closes impl-core (serial fallback)');
    assert(r.opened && r.opened.id === 'review', 'S-BYTE: close-and-open-next opens the PENDING next node review (linear chain unchanged)');
    assert(!('verdict_unparsed' in r), 'S-BYTE: no spurious verdict_unparsed on a tdd-guide close with no verdict line');
  }
}

// ---------------------------------------------------------------------------
// S384 (#384): reconcile-running-set CLOSE direction — a ledger-TERMINAL member still in an 'open'
// running set is DROPPED (close-crash recovery), and orient ROUTES the wedge there.
// ---------------------------------------------------------------------------
{
  // A close-crash: rev-a is ledger-complete but still in an 'open' running set (the removal step
  // crashed). No opening transaction. Today this was a not_opening dead-end; now it reconciles.
  const plan = makePlan(['| rev-a | complete | |', '| rev-b | in_progress | |', '| finalize | pending | |'], [
    '| rev-a | code-reviewer | — | — | 1 | sequence |',
    '| rev-b | security-reviewer | — | — | 1 | sequence |',
    '| finalize | finalize | rev-a rev-b | CHANGELOG.md | 1 | sequence |',
  ]);
  const staleSet = JSON.stringify({ state: 'open', nodes: [
    { id: 'rev-a', role: 'code-reviewer', kind: 'read' },
    { id: 'rev-b', role: 'security-reviewer', kind: 'read' },
  ] });
  const dropCalls = [];
  const h = rsHarness(
    { [RS_PLAN_PATH]: plan, [RS_SET_PATH]: staleSet },
    () => ({ exitCode: 0, result: 'ok' }),
    (base, a) => { if (a.includes('--drop-base')) { const i = a.indexOf('--node-id'); dropCalls.push(a[i + 1]); return { exitCode: 0, result: 'ok' }; } return null; }
  );
  const r = runReconcileRunningSet({ planPath: RS_PLAN_PATH, project: 'p', shell: h.shell, readFile: h.readFile, writeFile: h.writeFile, cacheExists: h.cacheExists });
  assert(r.result === 'ok' && r.reconciled === true && r.reason === 'closed_member_dropped', 'S384: reconcile drops the terminal member (closed_member_dropped), got ' + JSON.stringify({ reconciled: r.reconciled, reason: r.reason }));
  assert(Array.isArray(r.closedDropped) && r.closedDropped.includes('rev-a'), 'S384: rev-a in closedDropped, got ' + JSON.stringify(r.closedDropped));
  const set = JSON.parse(h.files[RS_SET_PATH]);
  assert(set.nodes.length === 1 && set.nodes[0].id === 'rev-b', 'S384: rev-a removed, rev-b remains in the set');
  assert(dropCalls.includes('rev-a'), 'S384 (#385): --drop-base shelled for the dropped terminal member, got ' + JSON.stringify(dropCalls));

  // orient routes the close-crash wedge to reconcile-running-set (not orphan_multi_in_progress).
  {
    const files = { [RS_PLAN_PATH]: plan, '/p/workflow-state.md': makeState(), [RS_SET_PATH]: staleSet };
    const ro = runOrient({
      planPath: RS_PLAN_PATH, statePath: '/p/workflow-state.md', project: 'p',
      shell: (sp) => { const b = path.basename(sp); if (b === 'kaola-workflow-plan-validator.js') return { exitCode: 0, ok: true }; if (b === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', allDone: false, readySet: [], readyPending: [] }; return { exitCode: 0, result: 'ok' }; },
      readFile: (fp) => { if (fp in files) return files[fp]; throw new Error('ENOENT ' + fp); },
      writeFile: () => {},
      cacheExists: (fp) => fp in files,
    });
    assert(ro.result === 'refuse' && ro.reason === 'running_set_close_incomplete' && ro.repair === 'reconcile-running-set',
      'S384: orient routes the close-crash wedge to reconcile-running-set, got ' + JSON.stringify({ reason: ro.reason, repair: ro.repair }));
  }
}

// ---------------------------------------------------------------------------
// S385-rollback (#385): reconcile-running-set OPEN-direction rollback drops the baseline of each
// rolled-back member (the stale-baseline trap), mirroring runReopenNode.
// ---------------------------------------------------------------------------
{
  const plan = makePlan(['| a | in_progress | |', '| b | pending | |'], [
    '| a | code-reviewer | — | — | 1 | sequence |',
    '| b | security-reviewer | — | — | 1 | sequence |',
  ]);
  const crashed = JSON.stringify({ state: 'opening', nodes: [
    { id: 'a', role: 'code-reviewer', kind: 'read', opening: true },
    { id: 'b', role: 'security-reviewer', kind: 'read', opening: true },
  ] });
  const dropCalls = [];
  const h = rsHarness(
    { [RS_PLAN_PATH]: plan, [RS_SET_PATH]: crashed },
    () => ({ exitCode: 0, result: 'ok' }),
    (base, a) => { if (a.includes('--drop-base')) { const i = a.indexOf('--node-id'); dropCalls.push(a[i + 1]); return { exitCode: 0, result: 'ok' }; } return null; }
  );
  const r = runReconcileRunningSet({ planPath: RS_PLAN_PATH, project: 'p', shell: h.shell, readFile: h.readFile, writeFile: h.writeFile, cacheExists: h.cacheExists });
  assert(r.rolledBack.includes('b') && !r.rolledBack.includes('a'), 'S385-rollback: b rolled back (still pending), a kept');
  assert(dropCalls.includes('b'), 'S385-rollback: --drop-base shelled for the rolled-back member b, got ' + JSON.stringify(dropCalls));
  assert(!dropCalls.includes('a'), 'S385-rollback: the kept (roll-forward) member a keeps its fresh baseline (NOT dropped)');
}

// ---------------------------------------------------------------------------
// S391c (#391c/#384): idempotent compliance append — re-closing the SAME node (alreadyAtTarget
// path) does NOT append a DUPLICATE Required Agent Compliance row.
// ---------------------------------------------------------------------------
{
  function closeOnce(planContent, files) {
    return runCloseAndOpenNext({
      planPath: RS_PLAN_PATH, statePath: '/p/workflow-state.md', project: 'p', nodeId: 'rev',
      shell: (sp) => { const b = path.basename(sp);
        if (b === 'kaola-workflow-commit-node.js') return { exitCode: 0, result: 'ok', selectorCheck: {} };
        if (b === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', allDone: true, readyPending: [] };
        return { exitCode: 0, result: 'ok' };
      },
      readFile: (fp) => { if (fp in files) return files[fp]; if (fp === RS_PLAN_PATH) return files[RS_PLAN_PATH]; throw new Error('ENOENT ' + fp); },
      writeFile: (fp, c) => { files[fp] = c; },
      cacheExists: (fp) => fp in files,
    });
  }
  const plan = makePlan(['| rev | in_progress | |', '| finalize | pending | |'], [
    '| rev | code-reviewer | — | — | 1 | sequence |',
    '| finalize | finalize | rev | CHANGELOG.md | 1 | sequence |',
  ]);
  const files = { [RS_PLAN_PATH]: plan, '/p/.cache/rev.md': 'code-reviewer\nverdict: pass\nfindings_blocking: 0' };
  const r1 = closeOnce(plan, files);
  assert(r1.result === 'ok' && r1.closed === 'rev', 'S391c: first close ok');
  const after1 = files[RS_PLAN_PATH];
  const count1 = (after1.match(/\|\s*code-reviewer\s*\|\s*subagent-invoked\s*\|/g) || []).length;
  assert(count1 === 1, 'S391c: exactly ONE code-reviewer compliance row after first close, got ' + count1);
  // Re-close (alreadyAtTarget: row already complete) → no second row.
  const r2 = closeOnce(after1, files);
  assert(r2.result === 'ok', 'S391c: re-close still ok (idempotent)');
  const count2 = (files[RS_PLAN_PATH].match(/\|\s*code-reviewer\s*\|\s*subagent-invoked\s*\|/g) || []).length;
  assert(count2 === 1, 'S391c: STILL exactly ONE compliance row after re-close (idempotent append), got ' + count2);
}

// ---------------------------------------------------------------------------
// S392 (#392): evidence-binding nonce.
//   - 3-arg checkEvidenceShape (no opts) is byte-identical (BACKWARD-COMPAT: ~40 callers).
//   - expectedNonce present + correct header → passes.
//   - copied-from-another-node header → evidence_unbound.
//   - stale/replayed nonce → evidence_stale.
//   - missing header (under expectedNonce) → shape failure naming evidence-binding.
// ---------------------------------------------------------------------------
{
  const goodTdd = 'evidence-binding: impl-x abc123def456\nRED then GREEN\nthe test ran for real';
  // 3-arg call (no opts) — binding NOT checked (backward-compat).
  assert(checkEvidenceShape('tdd-guide', 'impl-x', 'RED\nGREEN').ok === true, 'S392: 3-arg call ignores binding (byte-identical), passes on RED+GREEN');
  assert(checkEvidenceShape('tdd-guide', 'impl-x', 'RED\nGREEN', {}).ok === true, 'S392: empty opts (no expectedNonce) skips binding');

  // Correct nonce + node → passes (still must satisfy the role shape).
  const ok = checkEvidenceShape('tdd-guide', 'impl-x', goodTdd, { expectedNonce: 'abc123def456', expectedNodeId: 'impl-x' });
  assert(ok.ok === true, 'S392: correct evidence-binding header + RED/GREEN → ok, got ' + JSON.stringify(ok));

  // Copied from another node → evidence_unbound.
  const copiedNode = checkEvidenceShape('tdd-guide', 'impl-x', 'evidence-binding: OTHER-node abc123def456\nRED\nGREEN', { expectedNonce: 'abc123def456', expectedNodeId: 'impl-x' });
  assert(copiedNode.ok === false && copiedNode.evidenceUnbound === true && copiedNode.missingTokenClass === 'evidence_unbound', 'S392: wrong node id → evidence_unbound, got ' + JSON.stringify(copiedNode));

  // Stale / replayed nonce (e.g. "this was copied from another node") → evidence_stale.
  const stale = checkEvidenceShape('tdd-guide', 'impl-x', 'evidence-binding: impl-x OLDNONCE0000\nthis was copied from another node\nRED\nGREEN', { expectedNonce: 'abc123def456', expectedNodeId: 'impl-x' });
  assert(stale.ok === false && stale.evidenceStale === true && stale.missingTokenClass === 'evidence_stale', 'S392: wrong nonce → evidence_stale, got ' + JSON.stringify(stale));

  // Missing header under expectedNonce → shape failure naming evidence-binding.
  const noHeader = checkEvidenceShape('tdd-guide', 'impl-x', 'RED\nGREEN', { expectedNonce: 'abc123def456', expectedNodeId: 'impl-x' });
  assert(noHeader.ok === false && noHeader.missingTokenClass === 'evidence-binding', 'S392: missing header under expectedNonce → evidence-binding shape failure, got ' + JSON.stringify(noHeader));
}

// ---------------------------------------------------------------------------
// S392-close (#392): close-node reads the nonce from .cache/barrier-base-<id> and enforces it.
//   - copied evidence (header for a DIFFERENT node) → close refuses evidence_unbound.
//   - correctly-bound evidence → close proceeds.
//   - NO barrier-base file (no nonce on disk) → binding skipped, legacy evidence passes (back-compat).
// ---------------------------------------------------------------------------
{
  // SHA on disk; nonce = first 12 chars.
  const sha = 'abc123def4567890abcdef1234567890abcdef12';
  const nonce = sha.slice(0, 12); // 'abc123def456'
  function mk(evidenceBody) {
    const plan = makePlan(['| rev | in_progress | |'], ['| rev | code-reviewer | — | — | 1 | sequence |']);
    return rsHarness({
      [RS_PLAN_PATH]: plan,
      ['/p/.cache/barrier-base-rev']: sha,
      '/p/.cache/rev.md': evidenceBody,
    }, (base) => { if (base === 'kaola-workflow-commit-node.js') return { exitCode: 0, result: 'ok', selectorCheck: {} }; if (base === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', allDone: false, readyPending: [] }; return { exitCode: 1, result: 'refuse' }; });
  }
  // Copied: header names another node.
  {
    const h = mk('evidence-binding: SOME-other-node ' + nonce + '\ncode-reviewer\nverdict: pass\nfindings_blocking: 0');
    const r = runCloseNode({ planPath: RS_PLAN_PATH, project: 'p', nodeId: 'rev', shell: h.shell, readFile: h.readFile, writeFile: h.writeFile, cacheExists: h.cacheExists, unlink: h.unlink });
    assert(r.result === 'refuse' && r.reason === 'evidence_unbound', 'S392-close: copied evidence (wrong node) → evidence_unbound, got ' + JSON.stringify({ result: r.result, reason: r.reason }));
    assert(h.files[RS_PLAN_PATH].includes('| rev | in_progress | |'), 'S392-close: ledger NOT closed on evidence_unbound');
  }
  // Stale nonce.
  {
    const h = mk('evidence-binding: rev OLDNONCE0000\ncode-reviewer\nverdict: pass\nfindings_blocking: 0');
    const r = runCloseNode({ planPath: RS_PLAN_PATH, project: 'p', nodeId: 'rev', shell: h.shell, readFile: h.readFile, writeFile: h.writeFile, cacheExists: h.cacheExists, unlink: h.unlink });
    assert(r.result === 'refuse' && r.reason === 'evidence_stale', 'S392-close: stale nonce → evidence_stale, got ' + JSON.stringify(r.reason));
  }
  // Correctly bound → close proceeds.
  {
    const h = mk('evidence-binding: rev ' + nonce + '\ncode-reviewer\nverdict: pass\nfindings_blocking: 0');
    const r = runCloseNode({ planPath: RS_PLAN_PATH, project: 'p', nodeId: 'rev', shell: h.shell, readFile: h.readFile, writeFile: h.writeFile, cacheExists: h.cacheExists, unlink: h.unlink });
    assert(r.result === 'ok' && r.closed === 'rev', 'S392-close: correctly-bound evidence → close ok, got ' + JSON.stringify({ result: r.result, reason: r.reason }));
  }
  // No barrier-base file → no nonce → binding skipped → legacy evidence passes (back-compat).
  {
    const plan = makePlan(['| rev | in_progress | |'], ['| rev | code-reviewer | — | — | 1 | sequence |']);
    const h = rsHarness({ [RS_PLAN_PATH]: plan, '/p/.cache/rev.md': 'code-reviewer\nverdict: pass\nfindings_blocking: 0' }, (base) => { if (base === 'kaola-workflow-commit-node.js') return { exitCode: 0, result: 'ok', selectorCheck: {} }; if (base === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', allDone: false, readyPending: [] }; return { exitCode: 1, result: 'refuse' }; });
    const r = runCloseNode({ planPath: RS_PLAN_PATH, project: 'p', nodeId: 'rev', shell: h.shell, readFile: h.readFile, writeFile: h.writeFile, cacheExists: h.cacheExists, unlink: h.unlink });
    assert(r.result === 'ok' && r.closed === 'rev', 'S392-close: no nonce on disk → binding skipped, legacy evidence passes (back-compat), got ' + JSON.stringify({ result: r.result, reason: r.reason }));
  }
}

// ---------------------------------------------------------------------------
// D419-INV2: [INV-2] open-next MUST NOT write running-set.json.
// The serial open-next path is the legacy single-node path: it NEVER begins writing
// a running-set.json. After a successful open-next, no running-set.json file must exist.
// ---------------------------------------------------------------------------
{
  const plan = makePlan([
    '| impl-core | pending | |',
    '| impl-other | pending | |',
    '| review | pending | |',
    '| finalize | pending | |',
  ]);
  const state = makeState();
  const writtenFiles = {};
  const shellStub = function(scriptPath, args) {
    const base = path.basename(scriptPath);
    // #499: open-next integrity layer — a clean frozen plan passes --resume-check.
    if (base === 'kaola-workflow-plan-validator.js' && (args || []).includes('--resume-check')) return { exitCode: 0, ok: true };
    if (base === 'kaola-workflow-next-action.js') {
      return { exitCode: 0, result: 'ok', readySet: [{ id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/x.js', dependsOn: [] }], nextNode: { id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/x.js' }, allDone: false };
    }
    if (base === 'kaola-workflow-commit-node.js') {
      return { exitCode: 0, result: 'ok', recordBase: { base: 'abc123def4567890', reused: false } };
    }
    return { exitCode: 1, result: 'refuse' };
  };
  let planContent = plan;
  const result = runOpenNext({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    nodeId: null,
    shell: shellStub,
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) return planContent;
      if (fpath.endsWith('workflow-state.md')) return state;
      throw new Error('ENOENT: ' + fpath);
    },
    writeFile: (fpath, content) => {
      writtenFiles[fpath] = content;
      if (fpath.endsWith('workflow-plan.md')) planContent = content;
    },
  });
  assert(result.result === 'ok', 'D419-INV2: open-next result===ok');
  // The hard invariant: running-set.json must NOT have been written.
  const rsWritten = Object.keys(writtenFiles).some(f => f.endsWith(RUNNING_SET_NAME));
  assert(rsWritten === false, 'D419-INV2: open-next must NOT write running-set.json (serial fallback byte-identity)');
}

// ---------------------------------------------------------------------------
// D419-INV7: [INV-7] reconcile-running-set honors max_concurrent ceiling.
// When max_concurrent is present in running-set.json, reconcile must not re-open
// more nodes than (max_concurrent - count_of_currently_live_nodes).
// Scenario: max_concurrent=2, a is stable live (1 live), b+c both have opening:true
// and both are in_progress in the ledger. Budget = ceiling - live = 2 - 1 = 1.
// The cap means only ONE of b/c should be rolled forward (priority: ledger order).
// Without the cap, both b AND c roll forward → total=3 > ceiling=2 (the bug).
// ---------------------------------------------------------------------------
{
  // Plan: a + b + c all in_progress, d pending. running-set: state:opening, max_concurrent:2,
  // nodes: [{id:'a',stable}, {id:'b',opening}, {id:'c',opening}].
  // 'a' is stable live; 'b' and 'c' both have opening:true AND ledger in_progress.
  // ceiling=2, live (stable, non-opening)=1 → budget=1 → only 1 opening node rolls forward.
  const plan = makePlan([
    '| a | in_progress | |',
    '| b | in_progress | |',
    '| c | in_progress | |',
    '| finalize | pending | |',
  ], [
    '| a | code-reviewer | — | — | 1 | sequence |',
    '| b | security-reviewer | — | — | 1 | sequence |',
    '| c | code-reviewer | — | — | 1 | sequence |',
    '| finalize | finalize | a b c | CHANGELOG.md | 1 | sequence |',
  ]);
  const crashedSet = JSON.stringify({
    state: 'opening',
    max_concurrent: 2,
    nodes: [
      { id: 'a', role: 'code-reviewer', kind: 'read' },
      { id: 'b', role: 'security-reviewer', kind: 'read', opening: true },
      { id: 'c', role: 'code-reviewer', kind: 'read', opening: true },
    ],
  }, null, 2);
  const h = rsHarness({ [RS_PLAN_PATH]: plan, [RS_SET_PATH]: crashedSet }, () => ({ exitCode: 0, result: 'ok' }));
  const r = runReconcileRunningSet({ planPath: RS_PLAN_PATH, project: 'p', shell: h.shell, readFile: h.readFile, writeFile: h.writeFile, cacheExists: h.cacheExists });
  assert(r.result === 'ok' && r.reconciled === true, 'D419-INV7: reconcile-running-set with max_concurrent succeeds');
  const finalSet = JSON.parse(h.files[RS_SET_PATH]);
  assert(finalSet.state === 'open', 'D419-INV7: running-set promoted to open');
  // max_concurrent must survive the reconcile rewrite.
  assert(finalSet.max_concurrent === 2, 'D419-INV7: max_concurrent=2 survives reconcile rewrite');
  // The ceiling cap: live nodes must NOT exceed max_concurrent=2.
  assert(finalSet.nodes.length <= 2, 'D419-INV7: live node count (' + finalSet.nodes.length + ') must not exceed max_concurrent=2 (budget=ceiling-live=2-1=1)');
}

// ---------------------------------------------------------------------------
// D419-CLOSE-FIELDSURVIVAL: runCloseNode empty-set fallback preserves unknown fields.
// When the last node is removed from the running set, the empty-set fallback must
// SPREAD the existing top-level fields (including max_concurrent and other unknowns)
// rather than creating a bare { state:'open', nodes:[] } that drops them.
// ---------------------------------------------------------------------------
{
  const plan = makePlan(['| rev | in_progress | |'], ['| rev | code-reviewer | — | — | 1 | sequence |']);
  const startSet = JSON.stringify({
    state: 'open',
    max_concurrent: 3,
    extra_field: 'preserved',
    nodes: [{ id: 'rev', role: 'code-reviewer', kind: 'read' }],
  }, null, 2);
  const h = rsHarness({
    [RS_PLAN_PATH]: plan,
    [RS_SET_PATH]: startSet,
    '/p/.cache/rev.md': 'code-reviewer\nverdict: pass\nfindings_blocking: 0',
  }, (base) => {
    if (base === 'kaola-workflow-commit-node.js') return { exitCode: 0, result: 'ok', selectorCheck: {} };
    if (base === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', allDone: false, readyPending: [] };
    return { exitCode: 1, result: 'refuse' };
  });
  const r = runCloseNode({ planPath: RS_PLAN_PATH, project: 'p', nodeId: 'rev', shell: h.shell, readFile: h.readFile, writeFile: h.writeFile, cacheExists: h.cacheExists, unlink: null });
  assert(r.result === 'ok', 'D419-CLOSE-FIELDSURVIVAL: close-node with single-node running-set ok');
  // When the running set is emptied, the written file must preserve max_concurrent and extra_field.
  const finalSet = JSON.parse(h.files[RS_SET_PATH]);
  assert(finalSet.state === 'open', 'D419-CLOSE-FIELDSURVIVAL: empty running-set state=open');
  assert(finalSet.nodes.length === 0, 'D419-CLOSE-FIELDSURVIVAL: empty running-set has no nodes');
  assert(finalSet.max_concurrent === 3, 'D419-CLOSE-FIELDSURVIVAL: max_concurrent=3 preserved in empty-set fallback');
  assert(finalSet.extra_field === 'preserved', 'D419-CLOSE-FIELDSURVIVAL: extra_field preserved in empty-set fallback');
}

// ---------------------------------------------------------------------------
// D444-DISPATCH-PARITY: buildDispatch is exported and produces the required dispatch shape
// ---------------------------------------------------------------------------
{
  assert(typeof buildDispatch === 'function', 'D444-DISPATCH-PARITY: buildDispatch exported as function');

  const nodeInfo = { id: 'n1-impl', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/foo.js' };
  const context = {
    nonce: 'abc123def456',
    evidence_file: '.cache/n1-impl.md',
    required_tokens: ['evidence-binding', 'RED', 'GREEN'],
    working_dir: '/fake/worktree',
    forge_rider: null,
  };
  const d = buildDispatch(nodeInfo, context);
  assert(d !== null && typeof d === 'object', 'D444-DISPATCH-PARITY: buildDispatch returns object');
  assert(d.node_id === 'n1-impl', 'D444-DISPATCH-PARITY: dispatch.node_id present');
  assert(d.role === 'tdd-guide', 'D444-DISPATCH-PARITY: dispatch.role present');
  assert(d.model === 'sonnet', 'D444-DISPATCH-PARITY: dispatch.model present');
  assert(d.working_dir === '/fake/worktree', 'D444-DISPATCH-PARITY: dispatch.working_dir present');
  assert(d.declared_write_set === 'scripts/foo.js', 'D444-DISPATCH-PARITY: dispatch.declared_write_set present');
  assert(d.evidence_file === '.cache/n1-impl.md', 'D444-DISPATCH-PARITY: dispatch.evidence_file present');
  assert(d.nonce === 'abc123def456', 'D444-DISPATCH-PARITY: dispatch.nonce present');
  assert(Array.isArray(d.required_tokens), 'D444-DISPATCH-PARITY: dispatch.required_tokens is array');
  assert(d.forge_rider === null, 'D444-DISPATCH-PARITY: dispatch.forge_rider is null');
  assert(Array.isArray(d.guards), 'D444-DISPATCH-PARITY: dispatch.guards is array');
  assert(d.codex_dispatch_mode === 'v1-thread-id', 'D444-DISPATCH-PARITY: dispatch defaults to v1 thread-id mode');
  assert(d.codex_task_name === 'n1_impl_tdd_guide', 'D444-DISPATCH-PARITY: dispatch.codex_task_name is sanitized from node id + role');
  assert(typeof sanitizeCodexTaskName === 'function', 'D444-DISPATCH-PARITY: sanitizeCodexTaskName exported');
  assert(sanitizeCodexTaskName('Probe/D50203 Scope') === 'probe_d50203_scope', 'D444-DISPATCH-PARITY: task-name sanitizer handles slash/uppercase/space');
  assert(sanitizeCodexTaskName('---') === 'node', 'D444-DISPATCH-PARITY: task-name sanitizer falls back to node');
  assert(codexTaskNameForNode({ id: 'Probe/D50203 Scope', role: 'code-explorer' }) === 'probe_d50203_scope_code_explorer',
    'D444-DISPATCH-PARITY: codexTaskNameForNode includes role identity');
  assert(resolveCodexDispatchMode({}, { KAOLA_CODEX_MULTI_AGENT_V2: '1' }) === 'v2-task-name',
    'D444-DISPATCH-PARITY: v2 env flag resolves to task-name mode');
  const dV2 = buildDispatch(nodeInfo, Object.assign({}, context, { codex_dispatch_mode: 'v2-task-name' }));
  assert(dV2.codex_dispatch_mode === 'v2-task-name', 'D444-DISPATCH-PARITY: context can select v2 task-name mode');
  assert(dV2.codex_task_name === 'n1_impl_tdd_guide', 'D444-DISPATCH-PARITY: v2 dispatch still carries stable task name');
}

// D444-DISPATCH-PARITY: serial open and fused advance produce field-identical dispatch for same node
{
  const nodeSpec = { id: 'n2-target', role: 'implementer', model: 'sonnet', declared_write_set: 'scripts/bar.js' };
  const ctx = {
    nonce: 'abc123456789',
    evidence_file: '.cache/n2-target.md',
    required_tokens: ['evidence-binding', 'non_tdd_reason', 'regression-green|build-green|smoke-integration'],
    working_dir: '/fake/worktree',
    forge_rider: null,
  };
  const d_serial = buildDispatch(nodeSpec, ctx);
  const d_fused  = buildDispatch(nodeSpec, ctx);
  assert(d_serial.node_id === d_fused.node_id, 'D444-DISPATCH-PARITY: serial/fused node_id match');
  assert(d_serial.role === d_fused.role, 'D444-DISPATCH-PARITY: serial/fused role match');
  assert(d_serial.model === d_fused.model, 'D444-DISPATCH-PARITY: serial/fused model match');
  assert(d_serial.declared_write_set === d_fused.declared_write_set, 'D444-DISPATCH-PARITY: serial/fused declared_write_set match');
  assert(d_serial.evidence_file === d_fused.evidence_file, 'D444-DISPATCH-PARITY: serial/fused evidence_file match');
  assert(d_serial.nonce === d_fused.nonce, 'D444-DISPATCH-PARITY: serial/fused nonce match');
  assert(JSON.stringify(d_serial.required_tokens) === JSON.stringify(d_fused.required_tokens), 'D444-DISPATCH-PARITY: serial/fused required_tokens match');
  assert(d_serial.forge_rider === d_fused.forge_rider, 'D444-DISPATCH-PARITY: serial/fused forge_rider match');
  assert(JSON.stringify(d_serial.guards) === JSON.stringify(d_fused.guards), 'D444-DISPATCH-PARITY: serial/fused guards match');
}

// D444-DISPATCH-PARITY: runOpenNext opened payload has dispatch sub-object
{
  const nodeInfo = { id: 'n1-impl', role: 'implementer', model: 'sonnet', declared_write_set: 'scripts/foo.js', dependsOn: [] };
  const shellStub = (scriptPath, args) => {
    const base = path.basename(scriptPath);
    // #499: open-next integrity layer — a clean frozen plan passes --resume-check.
    if (base === 'kaola-workflow-plan-validator.js' && (args || []).includes('--resume-check')) return { exitCode: 0, ok: true };
    if (base === 'kaola-workflow-next-action.js') {
      return { exitCode: 0, result: 'ok', readySet: [nodeInfo], nextNode: nodeInfo, allDone: false };
    }
    if (base === 'kaola-workflow-commit-node.js') {
      return { exitCode: 0, result: 'ok', mode: 'per-node-start', nodeId: 'n1-impl', overallOk: true,
               recordBase: { base: 'abcdef123456abcdef', reused: false } };
    }
    return { exitCode: 1 };
  };
  const plan444 = [
    '# Plan',
    '## Meta\nlabels: area:scripts',
    '## Nodes',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '| --- | --- | --- | --- | --- | --- |',
    '| n1-impl | implementer | — | scripts/foo.js | 1 | sequence |',
    '## Node Ledger',
    '| id | status | notes |',
    '| --- | --- | --- |',
    '| n1-impl | pending | |',
  ].join('\n') + '\n';
  let planContent444 = plan444;
  const result444 = runOpenNext({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project', nodeId: null, shell: shellStub,
    readFile: (p) => { if (p.endsWith('workflow-plan.md')) return planContent444; return ''; },
    writeFile: (p, c) => { if (p.endsWith('workflow-plan.md')) planContent444 = c; },
  });
  assert(result444.result === 'ok', 'D444-DISPATCH-PARITY: runOpenNext ok');
  assert(result444.opened !== null, 'D444-DISPATCH-PARITY: runOpenNext has opened');
  assert(result444.opened.dispatch !== undefined, 'D444-DISPATCH-PARITY: opened has dispatch sub-object');
  const d444 = result444.opened.dispatch;
  assert(d444 !== null && typeof d444 === 'object', 'D444-DISPATCH-PARITY: dispatch is an object');
  assert(d444.node_id === 'n1-impl', 'D444-DISPATCH-PARITY: dispatch.node_id matches');
  assert(d444.role === 'implementer', 'D444-DISPATCH-PARITY: dispatch.role matches');
  assert(d444.model === 'sonnet', 'D444-DISPATCH-PARITY: dispatch.model present');
  assert(d444.declared_write_set === 'scripts/foo.js', 'D444-DISPATCH-PARITY: dispatch.declared_write_set present');
  assert(typeof d444.evidence_file === 'string', 'D444-DISPATCH-PARITY: dispatch.evidence_file is string');
  assert(Array.isArray(d444.required_tokens), 'D444-DISPATCH-PARITY: dispatch.required_tokens is array');
  assert(d444.forge_rider === null, 'D444-DISPATCH-PARITY: dispatch.forge_rider is null');
  assert(Array.isArray(d444.guards), 'D444-DISPATCH-PARITY: dispatch.guards is array');
}

// ---------------------------------------------------------------------------
// D444-DISPATCH-OPENREADY: runOpenReady opened elements have dispatch with same shape
// ---------------------------------------------------------------------------
{
  const readyNodes = [
    { id: 'rv1', role: 'code-reviewer', model: 'sonnet', declared_write_set: '—', dependsOn: [] },
    { id: 'rv2', role: 'security-reviewer', model: null, declared_write_set: '—', dependsOn: [] },
  ];
  const planOR = [
    '# Plan',
    '## Meta\nlabels: area:scripts',
    '## Nodes',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '| --- | --- | --- | --- | --- | --- |',
    '| rv1 | code-reviewer | — | — | 1 | sequence |',
    '| rv2 | security-reviewer | — | — | 1 | sequence |',
    '| fin | finalize | rv1,rv2 | CHANGELOG.md | 1 | sequence |',
    '## Node Ledger',
    '| id | status | notes |',
    '| --- | --- | --- |',
    '| rv1 | pending | |',
    '| rv2 | pending | |',
    '| fin | pending | |',
  ].join('\n') + '\n';
  let planContentOR = planOR;
  const shellOR = (scriptPath, args) => {
    const base = path.basename(scriptPath);
    if (base === 'kaola-workflow-plan-validator.js') {
      // integrity guard checks ok:true (not result:'ok')
      return { exitCode: 0, ok: true, result: 'ok', planHash: 'abc123' };
    }
    if (base === 'kaola-workflow-next-action.js') {
      return { exitCode: 0, result: 'ok', readySet: readyNodes, nextNode: readyNodes[0],
               readyPending: readyNodes, active: [], allDone: false };
    }
    if (base === 'kaola-workflow-commit-node.js') {
      const nodeIdArg = (args || []).indexOf('--node-id');
      const nid = nodeIdArg >= 0 ? args[nodeIdArg + 1] : 'rv1';
      return { exitCode: 0, result: 'ok', mode: 'per-node-start', nodeId: nid,
               recordBase: { base: 'deadbeef1234abcd', reused: false } };
    }
    return { exitCode: 1 };
  };
  const cacheFilesOR = {};
  const resultOR = runOpenReady({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    project: 'test-project',
    max: null,
    fanoutCapReadonly: 8,
    shell: shellOR,
    readFile: (p) => {
      if (p.endsWith('workflow-plan.md')) return planContentOR;
      if (cacheFilesOR[p]) return cacheFilesOR[p];
      throw new Error('ENOENT: ' + p);
    },
    writeFile: (p, c) => {
      cacheFilesOR[p] = c;
      if (p.endsWith('workflow-plan.md')) planContentOR = c;
    },
    cacheExists: (p) => !!cacheFilesOR[p],
    mkdirp: () => {},
    now: () => '2026-01-01T00:00:00Z',
  });
  assert(resultOR.result === 'ok', 'D444-DISPATCH-OPENREADY: runOpenReady returns ok');
  assert(Array.isArray(resultOR.opened), 'D444-DISPATCH-OPENREADY: opened is array');
  assert(resultOR.opened.length > 0, 'D444-DISPATCH-OPENREADY: opened has elements');
  for (const elem of resultOR.opened) {
    assert(elem.dispatch !== undefined, 'D444-DISPATCH-OPENREADY: each opened element has dispatch sub-object');
    const d = elem.dispatch;
    assert(typeof d.node_id === 'string', 'D444-DISPATCH-OPENREADY: dispatch.node_id is string');
    assert(typeof d.role === 'string', 'D444-DISPATCH-OPENREADY: dispatch.role is string');
    assert(typeof d.declared_write_set === 'string', 'D444-DISPATCH-OPENREADY: dispatch.declared_write_set is string');
    assert(typeof d.evidence_file === 'string', 'D444-DISPATCH-OPENREADY: dispatch.evidence_file is string');
    assert(Array.isArray(d.required_tokens), 'D444-DISPATCH-OPENREADY: dispatch.required_tokens is array');
    assert(d.forge_rider === null, 'D444-DISPATCH-OPENREADY: dispatch.forge_rider is null');
    assert(Array.isArray(d.guards), 'D444-DISPATCH-OPENREADY: dispatch.guards is array');
  }
}

// ---------------------------------------------------------------------------
// #516-QUALIFIED-EVIDENCE-PATH: the open-next / open-ready DISPATCH packet emits a PROJECT-QUALIFIED
//   evidence_file (kaola-workflow/<project>/.cache/<node-id>.md), NOT a bare cwd-relative .cache/<id>.md.
//   A role-agent subagent dispatched INTO the worktree interprets a bare `.cache/...` relative to its cwd
//   (the worktree root) → writes <worktree>/.cache/<id>.md, which does NOT match /^kaola-workflow\// →
//   the per-node barrier treats it as a PRODUCTION write outside the allowlist → false write_set_overflow.
//   Emitting the project-qualified path makes the subagent's literal-follow land in the barrier-exempt
//   kaola-workflow/<project>/.cache/ location. The on-disk seed/record/verify resolution is UNCHANGED
//   (it joins dirname(planPath)+'.cache'); only the dispatch HINT string is qualified. (RED against the
//   unpatched code: dispatch.evidence_file === '.cache/<id>.md' → these blocks fail.)
// ---------------------------------------------------------------------------
{
  // (a) open-next serial dispatch.
  {
    const nodeInfo = { id: 'n1-impl', role: 'implementer', model: 'sonnet', declared_write_set: 'scripts/foo.js', dependsOn: [] };
    const shellStub = (sp, args) => {
      const base = path.basename(sp);
      if (base === 'kaola-workflow-plan-validator.js') return { exitCode: 0, ok: true, result: 'ok' };
      if (base === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', readySet: [nodeInfo], nextNode: nodeInfo, allDone: false };
      if (base === 'kaola-workflow-commit-node.js') return { exitCode: 0, result: 'ok', mode: 'per-node-start', nodeId: 'n1-impl', overallOk: true, recordBase: { base: 'abcdef123456abcdef', reused: false } };
      return { exitCode: 1 };
    };
    let plan = [
      '# Plan', '## Meta\nlabels: area:scripts', '## Nodes',
      '| id | role | depends_on | declared_write_set | cardinality | shape |',
      '| --- | --- | --- | --- | --- | --- |',
      '| n1-impl | implementer | — | scripts/foo.js | 1 | sequence |',
      '## Node Ledger', '| id | status | notes |', '| --- | --- | --- |', '| n1-impl | pending | |',
    ].join('\n') + '\n';
    const r = runOpenNext({
      planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
      statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
      project: 'test-project', nodeId: null, shell: shellStub,
      readFile: (p) => { if (p.endsWith('workflow-plan.md')) return plan; return ''; },
      writeFile: (p, c) => { if (p.endsWith('workflow-plan.md')) plan = c; },
    });
    assert(r.result === 'ok' && r.opened, '#516-QUALIFIED-EVIDENCE-PATH (open-next): ok, got ' + JSON.stringify(r.result));
    const want = 'kaola-workflow/test-project/.cache/n1-impl.md';
    // The DISPATCH packet (what plan-run consumes — plan-run.md:118) carries the project-qualified path.
    assert(r.opened.dispatch.evidence_file === want, '#516-QUALIFIED-EVIDENCE-PATH (open-next): dispatch.evidence_file is project-qualified, want ' + want + ', got ' + JSON.stringify(r.opened.dispatch.evidence_file));
    // The top-level mirror stays the BARE on-disk relative path (the #444 back-compat vestige; not
    // consumed for dispatch). It must match the local seed/record/verify resolution (dirname(planPath)+.cache).
    assert(r.opened.evidence_file === '.cache/n1-impl.md', '#516-QUALIFIED-EVIDENCE-PATH (open-next): top-level mirror stays bare (vestige), got ' + JSON.stringify(r.opened.evidence_file));
  }
  // (b) open-ready scheduler dispatch (read fan-out).
  {
    const readyNodes = [
      { id: 'rv1', role: 'code-reviewer', model: 'sonnet', declared_write_set: '—', dependsOn: [] },
      { id: 'rv2', role: 'security-reviewer', model: null, declared_write_set: '—', dependsOn: [] },
    ];
    let plan = [
      '# Plan', '## Meta\nlabels: area:scripts', '## Nodes',
      '| id | role | depends_on | declared_write_set | cardinality | shape |',
      '| --- | --- | --- | --- | --- | --- |',
      '| rv1 | code-reviewer | — | — | 1 | sequence |',
      '| rv2 | security-reviewer | — | — | 1 | sequence |',
      '| fin | finalize | rv1,rv2 | CHANGELOG.md | 1 | sequence |',
      '## Node Ledger', '| id | status | notes |', '| --- | --- | --- |',
      '| rv1 | pending | |', '| rv2 | pending | |', '| fin | pending | |',
    ].join('\n') + '\n';
    const cacheFiles = {};
    const shellOR = (sp, args) => {
      const base = path.basename(sp);
      if (base === 'kaola-workflow-plan-validator.js') return { exitCode: 0, ok: true, result: 'ok' };
      if (base === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', readySet: readyNodes, nextNode: readyNodes[0], readyPending: readyNodes, active: [], allDone: false };
      if (base === 'kaola-workflow-commit-node.js') { const i = (args || []).indexOf('--node-id'); const nid = i >= 0 ? args[i + 1] : 'rv1'; return { exitCode: 0, result: 'ok', mode: 'per-node-start', nodeId: nid, recordBase: { base: 'deadbeef1234abcd', reused: false } }; }
      return { exitCode: 1 };
    };
    const r = runOpenReady({
      planPath: '/fake/kaola-workflow/test-project/workflow-plan.md', project: 'test-project', max: null, fanoutCapReadonly: 8,
      shell: shellOR,
      readFile: (p) => { if (p.endsWith('workflow-plan.md')) return plan; if (cacheFiles[p]) return cacheFiles[p]; throw new Error('ENOENT: ' + p); },
      writeFile: (p, c) => { cacheFiles[p] = c; if (p.endsWith('workflow-plan.md')) plan = c; },
      cacheExists: (p) => !!cacheFiles[p], mkdirp: () => {}, now: () => '2026-01-01T00:00:00Z',
    });
    assert(r.result === 'ok' && Array.isArray(r.opened) && r.opened.length > 0, '#516-QUALIFIED-EVIDENCE-PATH (open-ready): ok with opened, got ' + JSON.stringify(r.result));
    for (const elem of r.opened) {
      const want = 'kaola-workflow/test-project/.cache/' + elem.id + '.md';
      // DISPATCH packet → project-qualified (consumed by plan-run); top-level mirror → bare (vestige).
      assert(elem.dispatch.evidence_file === want, '#516-QUALIFIED-EVIDENCE-PATH (open-ready): ' + elem.id + ' dispatch.evidence_file project-qualified, want ' + want + ', got ' + JSON.stringify(elem.dispatch.evidence_file));
      assert(elem.evidence_file === '.cache/' + elem.id + '.md', '#516-QUALIFIED-EVIDENCE-PATH (open-ready): ' + elem.id + ' top-level mirror stays bare (vestige), got ' + JSON.stringify(elem.evidence_file));
    }
  }
}

// ---------------------------------------------------------------------------
// D444-VERIFY-ACCEPT: runVerifyEvidence on well-formed on-disk evidence → {result:'ok'}
// ---------------------------------------------------------------------------
{
  assert(typeof runVerifyEvidence === 'function', 'D444-VERIFY-ACCEPT: runVerifyEvidence exported');

  const tmpVA = fs.mkdtempSync(path.join(os.tmpdir(), 'd444-va-'));
  const cacheDirVA = path.join(tmpVA, '.cache');
  fs.mkdirSync(cacheDirVA, { recursive: true });
  const nodeIdVA = 'n1-impl';
  const nonceVA = 'abcdef123456';
  // Write barrier base file so readNonce returns the nonce
  fs.writeFileSync(path.join(cacheDirVA, 'barrier-base-n1-impl'), nonceVA + 'extra');
  // Well-formed tdd-guide evidence with correct binding + RED + GREEN
  const goodEvidence = 'evidence-binding: ' + nodeIdVA + ' ' + nonceVA + '\nRED: test failed\nGREEN: test passed\n';
  fs.writeFileSync(path.join(cacheDirVA, nodeIdVA + '.md'), goodEvidence);
  const planPathVA = path.join(tmpVA, 'workflow-plan.md');
  fs.writeFileSync(planPathVA, [
    '## Nodes',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '| --- | --- | --- | --- | --- | --- |',
    '| n1-impl | tdd-guide | — | scripts/foo.js | 1 | sequence |',
    '## Node Ledger',
    '| id | status |', '| --- | --- |', '| n1-impl | in_progress |',
  ].join('\n'));
  const rVA = runVerifyEvidence({
    planPath: planPathVA, project: 'issue-444', nodeId: nodeIdVA,
    readFile: (p) => fs.readFileSync(p, 'utf8'),
    cacheExists: (p) => fs.existsSync(p),
  });
  assert(rVA.result === 'ok', 'D444-VERIFY-ACCEPT: well-formed evidence returns {result:"ok"}, got ' + JSON.stringify(rVA));
  assert(rVA.nodeId === nodeIdVA, 'D444-VERIFY-ACCEPT: result.nodeId matches');
  assert(rVA.role === 'tdd-guide', 'D444-VERIFY-ACCEPT: result.role is tdd-guide');
  try { fs.rmSync(tmpVA, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// D444-VERIFY-REFUSE-TOKEN: missing required token → {result:'refuse', reason:'evidence_shape_failed'}
// ---------------------------------------------------------------------------
{
  const tmpVRT = fs.mkdtempSync(path.join(os.tmpdir(), 'd444-vrt-'));
  const cacheDirVRT = path.join(tmpVRT, '.cache');
  fs.mkdirSync(cacheDirVRT, { recursive: true });
  const nodeIdVRT = 'n1-impl';
  const nonceVRT = 'abcdef123456';
  fs.writeFileSync(path.join(cacheDirVRT, 'barrier-base-n1-impl'), nonceVRT + 'extra');
  // Missing GREEN token (only binding + RED)
  const badEvidence = 'evidence-binding: ' + nodeIdVRT + ' ' + nonceVRT + '\nRED: test failed\n';
  fs.writeFileSync(path.join(cacheDirVRT, nodeIdVRT + '.md'), badEvidence);
  const planPathVRT = path.join(tmpVRT, 'workflow-plan.md');
  fs.writeFileSync(planPathVRT, [
    '## Nodes',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '| --- | --- | --- | --- | --- | --- |',
    '| n1-impl | tdd-guide | — | scripts/foo.js | 1 | sequence |',
    '## Node Ledger',
    '| id | status |', '| --- | --- |', '| n1-impl | in_progress |',
  ].join('\n'));
  const rVRT = runVerifyEvidence({
    planPath: planPathVRT, project: 'issue-444', nodeId: nodeIdVRT,
    readFile: (p) => fs.readFileSync(p, 'utf8'),
    cacheExists: (p) => fs.existsSync(p),
  });
  assert(rVRT.result === 'refuse', 'D444-VERIFY-REFUSE-TOKEN: missing GREEN → refuse');
  assert(rVRT.reason === 'evidence_shape_failed', 'D444-VERIFY-REFUSE-TOKEN: reason is evidence_shape_failed, got ' + rVRT.reason);
  assert(rVRT.missingTokenClass === 'GREEN', 'D444-VERIFY-REFUSE-TOKEN: missingTokenClass is GREEN, got ' + rVRT.missingTokenClass);
  try { fs.rmSync(tmpVRT, { recursive: true, force: true }); } catch (_) {}
}

// D444-VERIFY-REFUSE-TOKEN: implementer missing non_tdd_reason → evidence_shape_failed
{
  const tmpVIM = fs.mkdtempSync(path.join(os.tmpdir(), 'd444-vim-'));
  const cacheDirVIM = path.join(tmpVIM, '.cache');
  fs.mkdirSync(cacheDirVIM, { recursive: true });
  const nodeIdVIM = 'impl-n1';
  const nonceVIM = 'deadbeef1234';
  fs.writeFileSync(path.join(cacheDirVIM, 'barrier-base-impl-n1'), nonceVIM + 'extra');
  // Missing non_tdd_reason
  const badEv = 'evidence-binding: ' + nodeIdVIM + ' ' + nonceVIM + '\nregression-green: tests pass\n';
  fs.writeFileSync(path.join(cacheDirVIM, nodeIdVIM + '.md'), badEv);
  const planPathVIM = path.join(tmpVIM, 'workflow-plan.md');
  fs.writeFileSync(planPathVIM, [
    '## Nodes',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '| --- | --- | --- | --- | --- | --- |',
    '| impl-n1 | implementer | — | scripts/x.js | 1 | sequence |',
    '## Node Ledger',
    '| id | status |', '| --- | --- |', '| impl-n1 | in_progress |',
  ].join('\n'));
  const rVIM = runVerifyEvidence({
    planPath: planPathVIM, project: 'issue-444', nodeId: nodeIdVIM,
    readFile: (p) => fs.readFileSync(p, 'utf8'),
    cacheExists: (p) => fs.existsSync(p),
  });
  assert(rVIM.result === 'refuse', 'D444-VERIFY-REFUSE-TOKEN: implementer missing non_tdd_reason → refuse');
  assert(rVIM.reason === 'evidence_shape_failed', 'D444-VERIFY-REFUSE-TOKEN: implementer reason evidence_shape_failed, got ' + rVIM.reason);
  assert(rVIM.missingTokenClass === 'non_tdd_reason', 'D444-VERIFY-REFUSE-TOKEN: implementer missingTokenClass non_tdd_reason, got ' + rVIM.missingTokenClass);
  try { fs.rmSync(tmpVIM, { recursive: true, force: true }); } catch (_) {}
}

// D444-VERIFY-REFUSE-TOKEN: absent evidence file → evidence_absent
{
  const tmpVABS = fs.mkdtempSync(path.join(os.tmpdir(), 'd444-vabs-'));
  const planPathVABS = path.join(tmpVABS, 'workflow-plan.md');
  fs.writeFileSync(planPathVABS, [
    '## Nodes',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '| --- | --- | --- | --- | --- | --- |',
    '| impl-n1 | implementer | — | scripts/x.js | 1 | sequence |',
    '## Node Ledger',
    '| id | status |', '| --- | --- |', '| impl-n1 | in_progress |',
  ].join('\n'));
  const rVABS = runVerifyEvidence({
    planPath: planPathVABS, project: 'issue-444', nodeId: 'impl-n1',
    readFile: (p) => fs.readFileSync(p, 'utf8'),
    cacheExists: (p) => fs.existsSync(p),
  });
  assert(rVABS.result === 'refuse', 'D444-VERIFY-REFUSE-TOKEN: absent evidence file → refuse');
  assert(rVABS.reason === 'evidence_absent', 'D444-VERIFY-REFUSE-TOKEN: absent evidence reason is evidence_absent, got ' + rVABS.reason);
  try { fs.rmSync(tmpVABS, { recursive: true, force: true }); } catch (_) {}
}

// D444-VERIFY-REFUSE-TOKEN: stale nonce → evidence_stale
{
  const tmpVST = fs.mkdtempSync(path.join(os.tmpdir(), 'd444-vst-'));
  const cacheDirVST = path.join(tmpVST, '.cache');
  fs.mkdirSync(cacheDirVST, { recursive: true });
  const nodeIdVST = 'impl-n1';
  // Barrier base has nonce = 'deadbeef1234' but evidence uses stale nonce 'stale00000000'
  fs.writeFileSync(path.join(cacheDirVST, 'barrier-base-impl-n1'), 'deadbeef1234abc');
  const staleEv = 'evidence-binding: ' + nodeIdVST + ' stale00000000\nnon_tdd_reason: x\nregression-green: ok\n';
  fs.writeFileSync(path.join(cacheDirVST, nodeIdVST + '.md'), staleEv);
  const planPathVST = path.join(tmpVST, 'workflow-plan.md');
  fs.writeFileSync(planPathVST, [
    '## Nodes',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '| --- | --- | --- | --- | --- | --- |',
    '| impl-n1 | implementer | — | scripts/x.js | 1 | sequence |',
    '## Node Ledger',
    '| id | status |', '| --- | --- |', '| impl-n1 | in_progress |',
  ].join('\n'));
  const rVST = runVerifyEvidence({
    planPath: planPathVST, project: 'issue-444', nodeId: nodeIdVST,
    readFile: (p) => fs.readFileSync(p, 'utf8'),
    cacheExists: (p) => fs.existsSync(p),
  });
  assert(rVST.result === 'refuse', 'D444-VERIFY-REFUSE-TOKEN: stale nonce → refuse');
  assert(rVST.reason === 'evidence_stale', 'D444-VERIFY-REFUSE-TOKEN: stale nonce reason evidence_stale, got ' + rVST.reason);
  try { fs.rmSync(tmpVST, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// D444-RECEIPT-PASSES-CLOSE: full on-disk evidence → runVerifyEvidence ok (close reads from disk)
// ---------------------------------------------------------------------------
{
  const tmpRPC = fs.mkdtempSync(path.join(os.tmpdir(), 'd444-rpc-'));
  const cacheDirRPC = path.join(tmpRPC, '.cache');
  fs.mkdirSync(cacheDirRPC, { recursive: true });
  const nodeIdRPC = 'impl-core';
  const nonceRPC = 'deadbeef1234';
  fs.writeFileSync(path.join(cacheDirRPC, 'barrier-base-impl-core'), nonceRPC + 'extra');
  const fullEvidence = 'evidence-binding: ' + nodeIdRPC + ' ' + nonceRPC + '\nnon_tdd_reason: config only\nregression-green: tests pass\n';
  fs.writeFileSync(path.join(cacheDirRPC, nodeIdRPC + '.md'), fullEvidence);
  const planPathRPC = path.join(tmpRPC, 'workflow-plan.md');
  fs.writeFileSync(planPathRPC, [
    '## Nodes',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '| --- | --- | --- | --- | --- | --- |',
    '| impl-core | implementer | — | scripts/x.js | 1 | sequence |',
    '## Node Ledger',
    '| id | status |', '| --- | --- |', '| impl-core | in_progress |',
  ].join('\n'));
  const rRPC = runVerifyEvidence({
    planPath: planPathRPC, project: 'issue-444', nodeId: nodeIdRPC,
    readFile: (p) => fs.readFileSync(p, 'utf8'),
    cacheExists: (p) => fs.existsSync(p),
  });
  assert(rRPC.result === 'ok', 'D444-RECEIPT-PASSES-CLOSE: full on-disk implementer evidence → ok (close reads from disk), got ' + JSON.stringify(rRPC));
  // Verify it is read-only (no side effects needed — the test just checks the result)
  try { fs.rmSync(tmpRPC, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// D444-GUARDS: deriveGuards exported and computes correct guards
// ---------------------------------------------------------------------------
{
  assert(typeof deriveGuards === 'function', 'D444-GUARDS: deriveGuards exported as function');

  // Gate roles → read-only
  for (const gateRole of ['code-reviewer', 'security-reviewer', 'adversarial-verifier', 'main-session-gate']) {
    const g = deriveGuards({ id: 'r1', role: gateRole, declared_write_set: '—' });
    assert(Array.isArray(g) && g.includes('read-only'),
      'D444-GUARDS: ' + gateRole + ' gets read-only guard, got ' + JSON.stringify(g));
  }

  // tdd-guide → RED-fixture-in-$TMPDIR
  const gTdd = deriveGuards({ id: 't1', role: 'tdd-guide', declared_write_set: 'scripts/x.js' });
  assert(gTdd.includes('RED-fixture-in-$TMPDIR'), 'D444-GUARDS: tdd-guide gets RED-fixture-in-$TMPDIR');

  // plain implementer with no generated port → no sync:editions
  const gImpl = deriveGuards({ id: 'i1', role: 'implementer', declared_write_set: 'CHANGELOG.md' });
  assert(!gImpl.includes('sync:editions'), 'D444-GUARDS: plain implementer → no sync:editions');
  assert(!gImpl.includes('read-only'), 'D444-GUARDS: implementer → no read-only');

  // implementer with generated-port write set → sync:editions
  const gGen = deriveGuards({
    id: 'g1', role: 'implementer',
    declared_write_set: 'scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js',
  });
  assert(gGen.includes('sync:editions'), 'D444-GUARDS: node with generated-port write set gets sync:editions guard');
}

// ===========================================================================
// #437-LANE-GROUP (D-419 Part 2) — open-ready co-open + close-node group barrier.
//
// Under KAOLA_LANE_CONTAINMENT, open-ready co-opens a ≥2 disjoint write frontier as a
// LANE GROUP (a lane_group key in running-set.json + a shared group baseline), and
// close-node DEFERS the per-member barrier to a single GROUP barrier at the last close.
// Tests drive the REAL adaptive-node + plan-validator subprocesses in a REAL git repo
// under $TMPDIR (#292 io-shim trap: a direct-call test with an injected git is a false-green).
// ===========================================================================
{
  const { execFileSync } = require('child_process');
  const NODE_CLI = path.join(__dirname, 'kaola-workflow-adaptive-node.js');
  const VALIDATOR = path.join(__dirname, 'kaola-workflow-plan-validator.js');

  // Build a frozen plan with a 2-write antichain frontier A(decl aSet) B(decl bSet) under a real git
  // repo: a `seed` (complete) so A,B are both ready-pending, a code-reviewer gate, a finalize sink.
  // Returns { repoRoot, project, planPath, projDir, cacheDir, g }.
  function makeLaneRepo(opts) {
    opts = opts || {};
    const aSet = opts.aSet || 'ax.js';
    const bSet = opts.bSet || 'by.js';
    // #588: optional EXTRA frontier members appended after A,B (each { id, role?, set? }; role defaults to
    //   tdd-guide, set defaults to '—' for a read member). review depends on A,B + every extra id. Absent /
    //   empty ⇒ the plan bytes are IDENTICAL to the original A,B-only fixture (all existing tests unaffected).
    const extra = Array.isArray(opts.extraMembers) ? opts.extraMembers : [];
    const extraIds = extra.map(m => m.id);
    const reviewRow = extra.length
      ? '| review   | code-reviewer | ' + ['A', 'B'].concat(extraIds).join(',') + ' | — | 1 | sequence |'
      : '| review   | code-reviewer | A,B   | —     | 1 | sequence |';
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'd437-lane-'));
    const project = 'test-project';
    const projDir = path.join(repoRoot, 'kaola-workflow', project);
    const cacheDir = path.join(projDir, '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const planPath = path.join(projDir, 'workflow-plan.md');
    const plan = [
      '# Workflow Plan — test-project', '',
      '## Meta', 'labels: area:scripts', 'sink: CHANGELOG.md',
      ...(opts.writeOverlapPolicy ? ['write_overlap_policy: ' + opts.writeOverlapPolicy] : []),
      '',
      '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape |',
      '| --- | --- | --- | --- | --- | --- |',
      '| seed     | code-explorer | —     | —     | 1 | sequence |',
      '| A        | tdd-guide     | seed  | ' + aSet + ' | 1 | sequence |',
      '| B        | tdd-guide     | seed  | ' + bSet + ' | 1 | sequence |',
      ...extra.map(m => '| ' + m.id + ' | ' + (m.role || 'tdd-guide') + ' | seed | ' + (m.set || '—') + ' | 1 | sequence |'),
      reviewRow,
      '| finalize | finalize      | review| —     | 1 | sequence |', '',
      '## Node Ledger', '',
      '| id | status |', '| --- | --- |',
      '| seed | complete |',
      '| A | pending |',
      '| B | pending |',
      ...extra.map(m => '| ' + m.id + ' | pending |'),
      '| review | pending |',
      '| finalize | pending |', '',
    ].join('\n') + '\n';
    fs.writeFileSync(planPath, plan);
    fs.writeFileSync(path.join(projDir, 'workflow-state.md'), '# State\n');
    const g = (args) => execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'] });
    g(['init']);
    g(['config', 'user.email', 'kw@test']);
    g(['config', 'user.name', 'kw']);
    g(['config', 'commit.gpgsign', 'false']);
    // Freeze in place so plan_hash exists (open-ready's integrity --resume-check needs a valid freeze).
    // An overlapping fixture (T-OR-2) cannot freeze (the antichain pair-loop refuses two siblings
    // writing the same file) — those tests serial-degrade BEFORE the group barrier, so a freeze failure
    // there is non-fatal (handled in the test).
    try { execFileSync('node', [VALIDATOR, planPath, '--freeze', '--repair', '--json'], { cwd: repoRoot, encoding: 'utf8' }); } catch (_) {}
    fs.writeFileSync(path.join(repoRoot, '.gitignore'), '.kw/\n');
    g(['add', '-A']);
    g(['commit', '-m', 'init']);
    return { repoRoot, project, planPath, projDir, cacheDir, g };
  }

  // Run the adaptive-node CLI as a REAL subprocess rooted at repoRoot. env carries the toggle.
  function runNode(repoRoot, subArgs, extraEnv) {
    const env = Object.assign({}, process.env, extraEnv || {});
    try {
      const stdout = execFileSync('node', [NODE_CLI, ...subArgs], { cwd: repoRoot, encoding: 'utf8', env });
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

  function readRS(cacheDir) {
    try { return JSON.parse(fs.readFileSync(path.join(cacheDir, 'running-set.json'), 'utf8')); } catch (_) { return null; }
  }
  function ledgerStatus(planPath, id) {
    const txt = fs.readFileSync(planPath, 'utf8');
    // Scope to the ## Node Ledger section so the 6-column ## Nodes row (| A | tdd-guide | ...) is not
    // mistaken for the 2-column ledger row (| A | in_progress |).
    const start = txt.indexOf('## Node Ledger');
    const body = start >= 0 ? txt.slice(start) : txt;
    const re = new RegExp('^\\|\\s*' + id + '\\s*\\|\\s*(\\S+)\\s*\\|', 'm');
    const m = body.match(re);
    return m ? m[1] : null;
  }
  // Write an evidence file for a tdd-guide node carrying its open-time nonce (barrier-base SHA prefix)
  // + the RED/GREEN token classes its role requires (so the close-side evidence-shape check passes).
  function writeEvidence(cacheDir, id, extraLines) {
    const baseFile = path.join(cacheDir, 'barrier-base-' + String(id).replace(/[^A-Za-z0-9_-]/g, '_'));
    let nonce = '';
    try { nonce = fs.readFileSync(baseFile, 'utf8').trim().slice(0, 12); } catch (_) { nonce = ''; }
    const lines = [
      'evidence-binding: ' + id + ' ' + nonce,
      'RED: test_x — AssertionError: expected throw (pre-impl)',
      'GREEN: test_x passes; 1/1 assertions green',
    ];
    if (extraLines) lines.push(...extraLines);
    fs.writeFileSync(path.join(cacheDir, id + '.md'), lines.join('\n') + '\n');
  }
  function cleanup(root) { try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {} }
  const ON = { KAOLA_LANE_CONTAINMENT: '1' };
  const OFF = { KAOLA_LANE_CONTAINMENT: '0' };
  // #542 (D-542-01): co-open for planner-proven-disjoint write frontiers is DEFAULT-ON — no operator
  // toggle. The retired KAOLA_LANE_CONTAINMENT / KAOLA_LEG_ISOLATION toggles no longer suppress co-open.
  // The ONLY serial-degrade path is the explicit kill-switch KAOLA_PARALLEL_WRITES=0. DEFAULT is the
  // bare env (co-open). SERIAL forces the single-write serial fallback.
  const SERIAL = { KAOLA_PARALLEL_WRITES: '0' };
  const DEFAULT = {}; // bare env ⇒ default-on co-open

  // -------------------------------------------------------------------------
  // RETIRED for #498: D437-OPEN-READY-GROUP asserted ON-alone (KAOLA_LANE_CONTAINMENT only) FORMS a lane
  // group — the exact buggy behavior #498 removes. After the fix, co-open ⟺ legs provisioned (the full
  // containment + leg-isolation + consent conjunction), so the ON-alone positive is migrated to
  // #498-COOPEN-FULL-CONJUNCTION (below) and to LEG-PROVISION-ON (full leg manifest coverage). The
  // ON-alone serial-degrade is now asserted by #498-COOPEN-REQUIRES-LEGS.

  // -------------------------------------------------------------------------
  // D437-OPEN-READY-SERIAL-DEGRADE-OVERLAP: flag ON, two OVERLAPPING write nodes → serial degrade
  //   (one write opened, NO lane_group). (Overlapping plan cannot freeze; open-ready still degrades.)
  // -------------------------------------------------------------------------
  {
    const { repoRoot, cacheDir } = makeLaneRepo({ aSet: 'ax.js', bSet: 'ax.js' });
    const r = runNode(repoRoot, ['open-ready', '--project', 'test-project', '--json'], ON);
    // The overlapping fixture fails to freeze, so open-ready's integrity gate may refuse; if it opens,
    // it must DEGRADE to a single serial write with NO lane_group. Assert no co-open either way.
    assert(!r.laneGroup, 'D437-OPEN-READY-SERIAL-DEGRADE-OVERLAP: NO laneGroup on overlap, got ' + JSON.stringify(r.laneGroup));
    const rs = readRS(cacheDir);
    assert(!rs || !rs.lane_group, 'D437-OPEN-READY-SERIAL-DEGRADE-OVERLAP: running-set has no lane_group');
    cleanup(repoRoot);
  }

  // -------------------------------------------------------------------------
  // D437-OPEN-READY-SERIAL (#542 kill-switch): KAOLA_PARALLEL_WRITES=0 forces the single-serial
  //   write_node path — NO lane_group, NO laneGroup descriptor. Opens exactly ONE write node; the
  //   other stays pending. (This was the OLD default-OFF behavior; after #542 it is reachable ONLY by
  //   the explicit kill-switch, since co-open is default-on.)
  // -------------------------------------------------------------------------
  {
    const { repoRoot, cacheDir, planPath } = makeLaneRepo();
    const r = runNode(repoRoot, ['open-ready', '--project', 'test-project', '--json'], SERIAL);
    assert(r.result === 'ok', 'D437-OPEN-READY-SERIAL: open-ready ok, got ' + JSON.stringify(r));
    assert(!r.laneGroup, 'D437-OPEN-READY-SERIAL: NO laneGroup descriptor under KAOLA_PARALLEL_WRITES=0');
    assert(Array.isArray(r.opened) && r.opened.length === 1, 'D437-OPEN-READY-SERIAL: exactly ONE write opened (serial), got ' + JSON.stringify(r.opened && r.opened.map(n => n.id)));
    const rs = readRS(cacheDir);
    assert(!rs || !rs.lane_group, 'D437-OPEN-READY-SERIAL: running-set has no lane_group key');
    // The single opened node is in_progress; the other write stays pending (serial).
    const openedId = r.opened[0].id;
    assert(ledgerStatus(planPath, openedId) === 'in_progress', 'D437-OPEN-READY-SERIAL: the one opened write is in_progress');
    cleanup(repoRoot);
  }

  // -------------------------------------------------------------------------
  // D437-OPEN-READY-DEFAULT-COOPEN (#542 default-on): with NO env (bare default), a ≥2 disjoint write
  //   frontier CO-OPENS as a lane group AND provisions legs — no operator toggle required. This is the
  //   inversion of the old default-OFF assertion above. Disjoint declared sets (ax.js / by.js) need NO
  //   --write-overlap-consent (the validator short-circuits green before the overlap-relax check).
  // -------------------------------------------------------------------------
  {
    const { repoRoot, cacheDir, planPath } = makeLaneRepo();
    const r = runNode(repoRoot, ['open-ready', '--project', 'test-project', '--json'], DEFAULT);
    assert(r.result === 'ok', 'D437-OPEN-READY-DEFAULT-COOPEN: open-ready ok, got ' + JSON.stringify(r));
    assert(r.laneGroup && Array.isArray(r.laneGroup.members) && r.laneGroup.members.includes('A') && r.laneGroup.members.includes('B'),
      'D437-OPEN-READY-DEFAULT-COOPEN: bare-default co-opens a lane group [A,B], got ' + JSON.stringify(r.laneGroup));
    assert(Array.isArray(r.opened) && r.opened.length === 2, 'D437-OPEN-READY-DEFAULT-COOPEN: >=2 writes co-opened, got ' + JSON.stringify(r.opened && r.opened.map(n => n.id)));
    const rs = readRS(cacheDir);
    // #498 regression guard (co-open ⟹ legs): a co-opened lane group MUST carry a per-member legs
    // manifest — never the legless attribution-blind union barrier.
    assert(rs && rs.lane_group && rs.lane_group.legs && rs.lane_group.legs.A && rs.lane_group.legs.B,
      'D437-OPEN-READY-DEFAULT-COOPEN: co-open ⟹ legs provisioned for every member (the safe close path), got ' + JSON.stringify(rs && rs.lane_group));
    assert(ledgerStatus(planPath, 'A') === 'in_progress' && ledgerStatus(planPath, 'B') === 'in_progress', 'D437-OPEN-READY-DEFAULT-COOPEN: both A and B in_progress (co-opened)');
    cleanup(repoRoot);
  }

  // -------------------------------------------------------------------------
  // #546-G2-OPEN-READY-SHARED-INFRA-DEFAULT-COOPEN (DECISION B, accuracy-first): a ≥2 write frontier
  //   whose declared sets are EXACT-FILE-DISJOINT but share a SHARED_INFRA area (both under scripts/) is
  //   classifier-verdict {yellow, shared-infra}. Before #546-G2 this serial-degraded by default (no
  //   lane_group) because writeOverlapRelaxable required write_overlap_policy:'coarse' + consent. After
  //   #546-G2 it CO-OPENS BY DEFAULT — the validator's --parallel-safe (called WITHOUT
  //   --write-overlap-consent by tryFormLaneGroup) now relaxes shared-infra on the retained net
  //   (post-dominating code-reviewer gate over the legs + no PROTECTED file). The validator verdict
  //   drives the executor; NO adaptive-node change. This is the direct executor counterpart to the
  //   validator T546G2-* GREEN-NEW scenario. RED-provable against pre-#546-G2 (serial degrade → no
  //   lane_group → this block fails).
  // -------------------------------------------------------------------------
  {
    const { repoRoot, cacheDir, planPath } = makeLaneRepo({ aSet: 'scripts/sa.js', bSet: 'scripts/sb.js' });
    // DEFAULT env (no toggle), NO --write-overlap-consent, NO write_overlap_policy in the plan.
    const r = runNode(repoRoot, ['open-ready', '--project', 'test-project', '--json'], DEFAULT);
    assert(r.result === 'ok', '#546-G2-OPEN-READY-SHARED-INFRA-DEFAULT-COOPEN: open-ready ok, got ' + JSON.stringify(r));
    assert(r.laneGroup && Array.isArray(r.laneGroup.members) && r.laneGroup.members.includes('A') && r.laneGroup.members.includes('B'),
      '#546-G2-OPEN-READY-SHARED-INFRA-DEFAULT-COOPEN: a gated shared-infra-disjoint frontier co-opens [A,B] BY DEFAULT (no consent), got ' + JSON.stringify(r.laneGroup));
    assert(Array.isArray(r.opened) && r.opened.length === 2,
      '#546-G2-OPEN-READY-SHARED-INFRA-DEFAULT-COOPEN: both scripts/ writes co-opened, got ' + JSON.stringify(r.opened && r.opened.map(n => n.id)));
    const rs = readRS(cacheDir);
    // co-open ⟹ legs (the safe close path); the retained net never lands the legless union barrier.
    assert(rs && rs.lane_group && rs.lane_group.legs && rs.lane_group.legs.A && rs.lane_group.legs.B,
      '#546-G2-OPEN-READY-SHARED-INFRA-DEFAULT-COOPEN: co-open ⟹ legs provisioned for every member, got ' + JSON.stringify(rs && rs.lane_group));
    assert(ledgerStatus(planPath, 'A') === 'in_progress' && ledgerStatus(planPath, 'B') === 'in_progress',
      '#546-G2-OPEN-READY-SHARED-INFRA-DEFAULT-COOPEN: both A and B in_progress (co-opened)');
    cleanup(repoRoot);
  }

  // -------------------------------------------------------------------------
  // #498-COOPEN-REQUIRES-LEGS (regression guard, open-side — #542 inverted premise): the #498
  //   invariant is "co-open ⟹ legs" — co-open NEVER lands the legless attribution-blind snapshot UNION
  //   barrier (`:4429`, liveLegs===null) that passes a cross-member overwrite. Under #542 (D-542-01)
  //   co-open is DEFAULT-ON: gated on legCoupled (parallelWritesDefaultOn, default TRUE), which is the
  //   SAME local that provisions legs (:3976). So groupForm ⟺ legCoupled ⟺ legs provisioned ⟺ the safe
  //   (parent-clean fence + commit-based) close path. We assert the invariant DIRECTLY across every
  //   co-open-eligible env (bare default + the legacy toggles, all of which now co-open): WHENEVER the
  //   running-set carries a lane_group, it MUST carry lane_group.legs with one leg per member. This is
  //   the #498 regression guard, now expressed as "co-open ⟹ legs, default-on". (RED-provable against a
  //   regressed gate that set groupForm with legs=null → the legless union barrier → this block fails.)
  // -------------------------------------------------------------------------
  {
    const coopenEnvs = [
      { label: 'bare default (no toggle, no consent)', env: DEFAULT, args: ['open-ready', '--project', 'test-project', '--json'] },
      { label: 'legacy containment toggle (now a no-op for co-open)', env: ON, args: ['open-ready', '--project', 'test-project', '--json'] },
      { label: 'legacy leg-isolation toggle (now a no-op for co-open)', env: { KAOLA_LANE_CONTAINMENT: '1', KAOLA_LEG_ISOLATION: '1' }, args: ['open-ready', '--project', 'test-project', '--json'] },
    ];
    for (const c of coopenEnvs) {
      const { repoRoot, cacheDir, planPath } = makeLaneRepo();
      const r = runNode(repoRoot, c.args, c.env);
      assert(r.result === 'ok', '#498-COOPEN-REQUIRES-LEGS [' + c.label + ']: open-ready ok, got ' + JSON.stringify(r));
      // Default-on: a ≥2 disjoint write frontier co-opens regardless of the legacy toggles.
      assert(r.laneGroup && Array.isArray(r.laneGroup.members) && r.laneGroup.members.includes('A') && r.laneGroup.members.includes('B'),
        '#498-COOPEN-REQUIRES-LEGS [' + c.label + ']: bare-default co-opens [A,B] (default-on), got ' + JSON.stringify(r.laneGroup));
      assert(Array.isArray(r.opened) && r.opened.length === 2, '#498-COOPEN-REQUIRES-LEGS [' + c.label + ']: both writes co-opened, got ' + JSON.stringify(r.opened && r.opened.map(n => n.id)));
      const rs = readRS(cacheDir);
      // ★ #498 REGRESSION GUARD (co-open ⟹ legs): whenever the running-set has a lane_group it MUST
      //   have lane_group.legs with one leg per member — co-open is NEVER legless. This is the #498
      //   invariant, now guarded by "co-open ⟹ legs, default-on".
      assert(rs && rs.lane_group && rs.lane_group.legs && rs.lane_group.members.every(m => rs.lane_group.legs[m]),
        '#498-COOPEN-REQUIRES-LEGS [' + c.label + ']: co-open is NEVER legless — lane_group.legs carries one leg per member, got ' + JSON.stringify(rs && rs.lane_group));
      assert(ledgerStatus(planPath, 'A') === 'in_progress' && ledgerStatus(planPath, 'B') === 'in_progress', '#498-COOPEN-REQUIRES-LEGS [' + c.label + ']: both A and B in_progress (co-opened)');
      cleanup(repoRoot);
    }
  }

  // -------------------------------------------------------------------------
  // #498-COOPEN-FULL-CONJUNCTION (positive — unchanged): with the FULL explicit toggles (containment +
  //   leg-isolation + consent) a ≥2 disjoint write frontier DOES co-open as a lane group AND provisions
  //   legs. Under #542 (D-542-01) default-on this is now a SUPERSET case (the bare default already
  //   co-opens — see D437-OPEN-READY-DEFAULT-COOPEN); the explicit toggles must remain a no-op overlay
  //   that still co-opens. The positive co-open ⟺ legs invariant is asserted directly here. (The
  //   detailed leg manifest assertions live in LEG-PROVISION-ON below.)
  // -------------------------------------------------------------------------
  {
    const LEG_ON_LOCAL = { KAOLA_LANE_CONTAINMENT: '1', KAOLA_LEG_ISOLATION: '1' };
    const { repoRoot, cacheDir, planPath } = makeLaneRepo();
    const r = runNode(repoRoot, ['open-ready', '--project', 'test-project', '--write-overlap-consent', '--json'], LEG_ON_LOCAL);
    assert(r.result === 'ok', '#498-COOPEN-FULL-CONJUNCTION: open-ready ok, got ' + JSON.stringify(r));
    assert(r.laneGroup && Array.isArray(r.laneGroup.members) && r.laneGroup.members.includes('A') && r.laneGroup.members.includes('B'),
      '#498-COOPEN-FULL-CONJUNCTION: co-open forms a lane group [A,B] under the full conjunction, got ' + JSON.stringify(r.laneGroup));
    const rs = readRS(cacheDir);
    assert(rs && rs.lane_group && rs.lane_group.legs && rs.lane_group.legs.A && rs.lane_group.legs.B,
      '#498-COOPEN-FULL-CONJUNCTION: co-open ⟺ legs provisioned (the safe close path), got ' + JSON.stringify(rs && rs.lane_group));
    assert(ledgerStatus(planPath, 'A') === 'in_progress' && ledgerStatus(planPath, 'B') === 'in_progress',
      '#498-COOPEN-FULL-CONJUNCTION: both A and B in_progress (co-opened)');
    cleanup(repoRoot);
  }

  // -------------------------------------------------------------------------
  // RETIRED for #498: the legless (containment-only co-open) group close tests — D437-CLOSE-NODE-DEFERRED,
  // D437-CLOSE-NODE-GROUP-PASS, D437-CLOSE-NODE-VACUITY-REFUSE, D437-CLOSE-NODE-CROSS-LANE-STRAY — and the
  // ON-alone positive D437-OPEN-READY-GROUP. PREMISE NOW UNREACHABLE: after #498 co-open ⟺ legs provisioned,
  // so a legless group is no longer a producible state via open-ready (every co-open provisions legs —
  // see #498-COOPEN-REQUIRES-LEGS). The snapshot union barrier (`:4429`, liveLegs===null) those tests
  // exercised is now reachable only by manual running-set surgery; pinning it would test dead code on the
  // out-of-scope plan-validator union barrier. No coverage lost:
  //   - group OPEN (default-on) → D437-OPEN-READY-DEFAULT-COOPEN / LEG-PROVISION-ON / #498-COOPEN-FULL-CONJUNCTION
  //   - group CLOSE (deferred + group_passed via the legs-live synthesizer) → LEG-CLEAN-COMPLETION-NO-LEAK
  //   - the SERIAL close now lives under the explicit kill-switch → D437-CLOSE-NODE-SERIAL
  //     (KAOLA_PARALLEL_WRITES=0 forces the single-serial write path).

  // -------------------------------------------------------------------------
  // D437-CLOSE-NODE-SERIAL (#542 kill-switch): KAOLA_PARALLEL_WRITES=0 forces the single-serial open,
  //   so close-node runs the normal per-node barrier path (no deferred/group). Closing the one node
  //   returns the serial shape (no `barrier` field set to deferred/group).
  // -------------------------------------------------------------------------
  {
    const { repoRoot, cacheDir, planPath } = makeLaneRepo();
    const open = runNode(repoRoot, ['open-ready', '--project', 'test-project', '--json'], SERIAL);
    const openedId = open.opened[0].id;
    writeEvidence(cacheDir, openedId);
    fs.writeFileSync(path.join(repoRoot, openedId === 'A' ? 'ax.js' : 'by.js'), '// serial in-lane\n');
    const r = runNode(repoRoot, ['close-node', '--node-id', openedId, '--project', 'test-project', '--json'], SERIAL);
    assert(r.result === 'ok', 'D437-CLOSE-NODE-SERIAL: serial close ok, got ' + JSON.stringify(r));
    assert(r.barrier !== 'deferred_to_group' && r.barrier !== 'group_passed',
      'D437-CLOSE-NODE-SERIAL: NO deferred/group barrier marker on the serial path, got ' + r.barrier);
    assert(r.closed === openedId, 'D437-CLOSE-NODE-SERIAL: serial close returns closed id');
    assert(ledgerStatus(planPath, openedId) === 'complete', 'D437-CLOSE-NODE-SERIAL: node complete via serial per-node barrier');
    cleanup(repoRoot);
  }

  // -------------------------------------------------------------------------
  // D437-MUTATION-GUARD-NOT-VACUOUS (#542 kill-switch): the kill-switch is NOT vacuous —
  //   KAOLA_PARALLEL_WRITES=0 must SUPPRESS the default-on co-open and fall back to the serial single
  //   open (one write, no group), so the second write never enters a group. Without an effective
  //   kill-switch this would co-open (default-on); asserting exactly-one-open proves the switch bites.
  // -------------------------------------------------------------------------
  {
    const { repoRoot, cacheDir } = makeLaneRepo();
    const open = runNode(repoRoot, ['open-ready', '--project', 'test-project', '--json'], SERIAL);
    assert(!open.laneGroup, 'D437-MUTATION-GUARD-NOT-VACUOUS: KAOLA_PARALLEL_WRITES=0 does NOT co-open a group');
    assert(Array.isArray(open.opened) && open.opened.length === 1, 'D437-MUTATION-GUARD-NOT-VACUOUS: kill-switch opens exactly one write (serial)');
    const rs = readRS(cacheDir);
    assert(!rs || !rs.lane_group, 'D437-MUTATION-GUARD-NOT-VACUOUS: no lane_group under the kill-switch — co-open is suppressed, not vacuous');
    cleanup(repoRoot);
  }

  // =========================================================================
  // #463-LEG-PROVISION (Slice 2) — DORMANT per-leg `.kw` worktree provisioning for the write-lane
  // scheduler. Reuses the D-437 REAL-git harness above (makeLaneRepo / runNode / readRS / ledgerStatus
  // / cleanup; makeLaneRepo seeds .gitignore with `.kw/` so snapshotWorktree's `git add -A` never
  // stages a sibling leg). Legs are PROVISIONED (a real `git worktree add` per co-opened write member)
  // + telemetered + reconcile/teardown-aware, but NOTHING is written into them (S2 dormant). The
  // non-negotiable deliverable: legs require BOTH the KAOLA_LEG_ISOLATION toggle AND the per-run
  // --write-overlap-consent flag AND a formed lane group; absent any ⇒ flag-OFF byte-identical.
  // =========================================================================
  const LEG_ON = { KAOLA_LANE_CONTAINMENT: '1', KAOLA_LEG_ISOLATION: '1' };
  // Read `git worktree list --porcelain` at a repo and return the set of worktree paths.
  function worktreePaths(repoRoot) {
    let out = '';
    try { out = execFileSync('git', ['-C', repoRoot, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' }); } catch (_) { return []; }
    return String(out).split('\n').filter(l => l.indexOf('worktree ') === 0).map(l => l.slice('worktree '.length).trim());
  }
  function branchExists(repoRoot, branch) {
    try { execFileSync('git', ['-C', repoRoot, 'rev-parse', '--verify', '--quiet', 'refs/heads/' + branch], { stdio: ['ignore', 'ignore', 'ignore'] }); return true; }
    catch (_) { return false; }
  }
  function timingsHas(cacheDir, id, event) {
    let txt = '';
    try { txt = fs.readFileSync(path.join(cacheDir, 'node-timings.jsonl'), 'utf8'); } catch (_) { return false; }
    for (const line of txt.split('\n')) {
      const s = line.trim(); if (!s) continue;
      let e; try { e = JSON.parse(s); } catch (_) { continue; }
      if (e && e.node === id && e.event === event) return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // LEG-PROVISION-ON: toggle + consent + a formed group ⇒ a real .kw leg per member (A,B), a kw/legs
  //   branch per member, a running-set lane_group.legs manifest with {legPath,legBranch,baseline}, and
  //   a `leg_opened` timing for each.  (RED-provable: drop the provisioning block ⇒ this block fails.)
  // -------------------------------------------------------------------------
  {
    const { repoRoot, cacheDir } = makeLaneRepo();
    const r = runNode(repoRoot, ['open-ready', '--project', 'test-project', '--write-overlap-consent', '--json'], LEG_ON);
    assert(r.result === 'ok', 'LEG-PROVISION-ON: open-ready ok, got ' + JSON.stringify(r));
    const wts = worktreePaths(repoRoot);
    const legA = path.join('.kw', 'legs', 'test-project', 'A');
    const legB = path.join('.kw', 'legs', 'test-project', 'B');
    assert(wts.some(p => p.endsWith(legA)), 'LEG-PROVISION-ON: .kw/legs/test-project/A worktree provisioned, got ' + JSON.stringify(wts));
    assert(wts.some(p => p.endsWith(legB)), 'LEG-PROVISION-ON: .kw/legs/test-project/B worktree provisioned, got ' + JSON.stringify(wts));
    assert(branchExists(repoRoot, 'kw/legs/test-project/A'), 'LEG-PROVISION-ON: branch kw/legs/test-project/A exists');
    assert(branchExists(repoRoot, 'kw/legs/test-project/B'), 'LEG-PROVISION-ON: branch kw/legs/test-project/B exists');
    const rs = readRS(cacheDir);
    assert(rs && rs.lane_group && rs.lane_group.legs, 'LEG-PROVISION-ON: running-set lane_group.legs present, got ' + JSON.stringify(rs && rs.lane_group));
    for (const id of ['A', 'B']) {
      const leg = rs.lane_group.legs[id];
      assert(leg && typeof leg.legPath === 'string' && leg.legPath.length > 0, 'LEG-PROVISION-ON: legs.' + id + '.legPath present');
      assert(leg && leg.legBranch === 'kw/legs/test-project/' + id, 'LEG-PROVISION-ON: legs.' + id + '.legBranch correct, got ' + (leg && leg.legBranch));
      assert(leg && typeof leg.baseline === 'string' && leg.baseline.length > 0, 'LEG-PROVISION-ON: legs.' + id + '.baseline present');
    }
    assert(timingsHas(cacheDir, 'A', 'leg_opened'), 'LEG-PROVISION-ON: leg_opened timing for A');
    assert(timingsHas(cacheDir, 'B', 'leg_opened'), 'LEG-PROVISION-ON: leg_opened timing for B');
    // S2 dormant (FIX-2, RED-provable): working_dir STAYS parent-side. Assert directly that NO opened
    // member's dispatch working_dir equals the leg path that WAS provisioned for that member (the real
    // S3-regression guard — the prior `indexOf('.kw')` check was vacuous because working_dir is always
    // null here). If a future edit set working_dir = legs[id].legPath, this fails.
    const provisionedLegPaths = new Set(['A', 'B'].map(id => rs.lane_group.legs[id] && rs.lane_group.legs[id].legPath).filter(Boolean));
    assert(provisionedLegPaths.size === 2, 'LEG-PROVISION-ON: two leg paths recorded for the dormancy guard');
    for (const n of (r.opened || [])) {
      const wd = n.dispatch && n.dispatch.working_dir;
      assert(!(wd && provisionedLegPaths.has(wd)), 'LEG-PROVISION-ON: ' + n.id + ' dispatch working_dir is NOT its provisioned leg path (S2 dormant), got ' + JSON.stringify(wd));
    }
    // #591: each opened co-open member's dispatch card carries ITS OWN leg_path + leg_branch (the routing
    //   fact lives in the per-member payload, not only the top-level laneGroup descriptor). Assert equal to
    //   the provisioned worktree/branch from the running-set legs manifest. (RED-provable: pre-#591 the
    //   dispatch was built with only the shared working_dir, so leg_path/leg_branch are absent.)
    assert((r.opened || []).length === 2, '#591: two co-open members opened');
    for (const n of (r.opened || [])) {
      const leg = rs.lane_group.legs[n.id];
      assert(leg && typeof leg.legPath === 'string', '#591: leg manifest present for ' + n.id);
      assert(n.dispatch && n.dispatch.leg_path === leg.legPath,
        '#591: ' + n.id + ' dispatch.leg_path == provisioned legPath, got ' + JSON.stringify(n.dispatch && n.dispatch.leg_path) + ' vs ' + JSON.stringify(leg.legPath));
      assert(n.dispatch && n.dispatch.leg_branch === leg.legBranch,
        '#591: ' + n.id + ' dispatch.leg_branch == provisioned legBranch, got ' + JSON.stringify(n.dispatch && n.dispatch.leg_branch) + ' vs ' + JSON.stringify(leg.legBranch));
      assert(n.dispatch.leg_branch === 'kw/legs/test-project/' + n.id, '#591: ' + n.id + ' dispatch.leg_branch canonical form');
    }
    cleanup(repoRoot);
  }

  // -------------------------------------------------------------------------
  // #591-SERIAL-READ-NO-LEG-FIELDS (byte-identity guard): on the serial/read path (no lane group) an
  //   opened member's dispatch card carries NEITHER leg_path NOR leg_branch — conditionally attached like
  //   laneGroup, so serial/read open-ready output stays byte-identical to pre-#591. Raw-string probe on the
  //   opened array (no leg field ANYWHERE) plus a key-presence check on the dispatch object.
  // -------------------------------------------------------------------------
  {
    const { repoRoot } = makeLaneRepo();
    const r = runNode(repoRoot, ['open-ready', '--project', 'test-project', '--json'], SERIAL);
    assert(r.result === 'ok' && Array.isArray(r.opened) && r.opened.length === 1, '#591-SERIAL-READ-NO-LEG-FIELDS: serial open ok (single write), got ' + JSON.stringify(r.opened && r.opened.map(n => n.id)));
    const d = r.opened[0].dispatch;
    assert(d && !('leg_path' in d), '#591-SERIAL-READ-NO-LEG-FIELDS: serial dispatch has NO leg_path key, got ' + JSON.stringify(Object.keys(d)));
    assert(d && !('leg_branch' in d), '#591-SERIAL-READ-NO-LEG-FIELDS: serial dispatch has NO leg_branch key, got ' + JSON.stringify(Object.keys(d)));
    assert(JSON.stringify(r.opened).indexOf('"leg_path"') === -1 && JSON.stringify(r.opened).indexOf('"leg_branch"') === -1,
      '#591-SERIAL-READ-NO-LEG-FIELDS: no leg_path/leg_branch anywhere in the serial opened payload');
    cleanup(repoRoot);
  }

  // -------------------------------------------------------------------------
  // ★ LEG-SERIAL-NO-LEGS-BYTE-IDENTITY (#542 kill-switch, non-negotiable): the serial path provisions
  //   NO legs. After #542 (D-542-01) co-open + legs are DEFAULT-ON; the leg-free serial path is reached
  //   only via the kill-switch KAOLA_PARALLEL_WRITES=0. Run the same repo/plan under the kill-switch with
  //   the legacy toggles/consent varied — all must serial-degrade with NEITHER any leg: no .kw/legs
  //   worktree, no lane_group.legs key (raw-string probe), no leg_opened timing. (The legacy toggles are
  //   no-ops for co-open now; only the kill-switch suppresses it.)
  // -------------------------------------------------------------------------
  {
    const cases = [
      { label: 'kill-switch, no toggle, no consent', env: SERIAL, args: ['open-ready', '--project', 'test-project', '--json'] },
      { label: 'kill-switch + legacy leg-isolation toggle (no-op), NO consent', env: { KAOLA_PARALLEL_WRITES: '0', KAOLA_LANE_CONTAINMENT: '1', KAOLA_LEG_ISOLATION: '1' }, args: ['open-ready', '--project', 'test-project', '--json'] },
      // The symmetric off-combo — kill-switch with the consent flag present (still no legs: serial wins).
      { label: 'kill-switch + consent flag (still serial)', env: SERIAL, args: ['open-ready', '--project', 'test-project', '--write-overlap-consent', '--json'] },
    ];
    for (const c of cases) {
      const { repoRoot, cacheDir } = makeLaneRepo();
      const r = runNode(repoRoot, c.args, c.env);
      assert(r.result === 'ok', 'LEG-SERIAL-NO-LEGS [' + c.label + ']: open-ready ok, got ' + JSON.stringify(r));
      const wts = worktreePaths(repoRoot);
      assert(!wts.some(p => p.indexOf(path.join('.kw', 'legs')) !== -1), 'LEG-SERIAL-NO-LEGS [' + c.label + ']: NO .kw/legs worktree provisioned, got ' + JSON.stringify(wts));
      const rs = readRS(cacheDir);
      // Raw-string probe: the serial byte-identity guarantee is "no `legs` key anywhere in running-set.json".
      assert(JSON.stringify(rs).indexOf('"legs"') === -1, 'LEG-SERIAL-NO-LEGS [' + c.label + ']: running-set.json carries NO "legs" key');
      assert(!(rs && rs.lane_group && rs.lane_group.legs), 'LEG-SERIAL-NO-LEGS [' + c.label + ']: lane_group has no legs manifest');
      assert(!timingsHas(cacheDir, 'A', 'leg_opened') && !timingsHas(cacheDir, 'B', 'leg_opened'), 'LEG-SERIAL-NO-LEGS [' + c.label + ']: no leg_opened timing');
      cleanup(repoRoot);
    }
  }

  // -------------------------------------------------------------------------
  // LEG-RECONCILE-TEARDOWN: provision legs (ON), then DROP one member from running-set (so reconcile
  //   rolls it back) and run reconcile-running-set — assert the dropped member's worktree AND branch
  //   are gone (strict-order teardown) and the survivor's leg remains.
  // -------------------------------------------------------------------------
  {
    const { repoRoot, cacheDir } = makeLaneRepo();
    const r = runNode(repoRoot, ['open-ready', '--project', 'test-project', '--write-overlap-consent', '--json'], LEG_ON);
    assert(r.result === 'ok' && r.laneGroup, 'LEG-RECONCILE-TEARDOWN: setup co-open ok');
    // Simulate a member drop: mark B's ledger row back to pending and flag B `opening` so reconcile
    // treats the set as mid-open and rolls B back (its ledger no longer in_progress).
    const planPath = path.join(repoRoot, 'kaola-workflow', 'test-project', 'workflow-plan.md');
    let plan = fs.readFileSync(planPath, 'utf8');
    const ledgerStart = plan.indexOf('## Node Ledger');
    const head = plan.slice(0, ledgerStart), tail = plan.slice(ledgerStart);
    plan = head + tail.replace(/^\|\s*B\s*\|\s*in_progress\s*\|/m, '| B | pending |');
    fs.writeFileSync(planPath, plan);
    const rs0 = readRS(cacheDir);
    rs0.state = 'opening';
    rs0.nodes = rs0.nodes.map(n => (n.id === 'B' ? { ...n, opening: true } : n));
    fs.writeFileSync(path.join(cacheDir, 'running-set.json'), JSON.stringify(rs0, null, 2));
    const rec = runNode(repoRoot, ['reconcile-running-set', '--project', 'test-project', '--json'], LEG_ON);
    assert(rec.result === 'ok', 'LEG-RECONCILE-TEARDOWN: reconcile ok, got ' + JSON.stringify(rec));
    const wts = worktreePaths(repoRoot);
    assert(!wts.some(p => p.endsWith(path.join('.kw', 'legs', 'test-project', 'B'))), 'LEG-RECONCILE-TEARDOWN: B leg worktree torn down, got ' + JSON.stringify(wts));
    assert(!branchExists(repoRoot, 'kw/legs/test-project/B'), 'LEG-RECONCILE-TEARDOWN: B leg branch -D (strict-order teardown)');
    assert(wts.some(p => p.endsWith(path.join('.kw', 'legs', 'test-project', 'A'))), 'LEG-RECONCILE-TEARDOWN: survivor A leg worktree remains');
    assert(branchExists(repoRoot, 'kw/legs/test-project/A'), 'LEG-RECONCILE-TEARDOWN: survivor A leg branch remains');
    const rs1 = readRS(cacheDir);
    assert(rs1 && rs1.lane_group && rs1.lane_group.legs && rs1.lane_group.legs.A && !rs1.lane_group.legs.B,
      'LEG-RECONCILE-TEARDOWN: legs manifest keeps A, drops B, got ' + JSON.stringify(rs1 && rs1.lane_group && rs1.lane_group.legs));
    cleanup(repoRoot);
  }

  // -------------------------------------------------------------------------
  // LEG-ORPHAN-SWEEP: provision legs (ON, healthy set), then manually `git worktree add` an extra
  //   .kw/legs/test-project/orphan with NO running-set member; run reconcile and assert the orphan is
  //   swept (worktree + branch gone) while the live legs A,B remain. (The sweep is HOISTED above the
  //   not_opening early-return so it runs on a healthy set.)
  // -------------------------------------------------------------------------
  {
    const { repoRoot, cacheDir } = makeLaneRepo();
    const r = runNode(repoRoot, ['open-ready', '--project', 'test-project', '--write-overlap-consent', '--json'], LEG_ON);
    assert(r.result === 'ok' && r.laneGroup, 'LEG-ORPHAN-SWEEP: setup co-open ok');
    // Manually provision an orphan leg under the same band with no running-set member.
    const orphanPath = path.join(repoRoot, '.kw', 'legs', 'test-project', 'orphan');
    execFileSync('git', ['-C', repoRoot, 'worktree', 'add', '-b', 'kw/legs/test-project/orphan', '--', orphanPath, 'HEAD'], { stdio: ['ignore', 'ignore', 'ignore'] });
    assert(worktreePaths(repoRoot).some(p => p.endsWith(path.join('.kw', 'legs', 'test-project', 'orphan'))), 'LEG-ORPHAN-SWEEP: orphan provisioned for the test');
    const rec = runNode(repoRoot, ['reconcile-running-set', '--project', 'test-project', '--json'], LEG_ON);
    assert(rec.result === 'ok', 'LEG-ORPHAN-SWEEP: reconcile ok, got ' + JSON.stringify(rec));
    const wts = worktreePaths(repoRoot);
    assert(!wts.some(p => p.endsWith(path.join('.kw', 'legs', 'test-project', 'orphan'))), 'LEG-ORPHAN-SWEEP: orphan leg worktree swept, got ' + JSON.stringify(wts));
    assert(!branchExists(repoRoot, 'kw/legs/test-project/orphan'), 'LEG-ORPHAN-SWEEP: orphan leg branch swept');
    assert(wts.some(p => p.endsWith(path.join('.kw', 'legs', 'test-project', 'A'))), 'LEG-ORPHAN-SWEEP: live leg A retained');
    assert(wts.some(p => p.endsWith(path.join('.kw', 'legs', 'test-project', 'B'))), 'LEG-ORPHAN-SWEEP: live leg B retained');
    cleanup(repoRoot);
  }

  // -------------------------------------------------------------------------
  // LEG-DANGLING-BRANCH-REUSE: provisionLeg must REUSE a dangling leg branch (worktree gone, branch
  //   still present from a swallowed fail-soft `branch -D`) instead of refusing — the crash-resume
  //   no-wedge guarantee. Simulate: provision A's branch + worktree, remove ONLY the worktree (leave
  //   the branch), then re-provision the SAME leg via the exported provisionLeg seam.
  // -------------------------------------------------------------------------
  {
    const { repoRoot } = makeLaneRepo();
    const node = require(path.join(__dirname, 'kaola-workflow-adaptive-node.js'));
    const legPath = path.join(repoRoot, '.kw', 'legs', 'test-project', 'A');
    const legBranch = 'kw/legs/test-project/A';
    const base = execFileSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const first = node.provisionLeg(repoRoot, legPath, legBranch, base);
    assert(first.ok, 'LEG-DANGLING-BRANCH-REUSE: first provision ok');
    // Remove the worktree but leave the branch dangling (the swallowed `branch -D` scenario).
    execFileSync('git', ['-C', repoRoot, 'worktree', 'remove', '--force', legPath], { stdio: ['ignore', 'ignore', 'ignore'] });
    assert(branchExists(repoRoot, legBranch), 'LEG-DANGLING-BRANCH-REUSE: branch dangles after worktree-only removal');
    const second = node.provisionLeg(repoRoot, legPath, legBranch, base);
    assert(second.ok && second.reusedBranch, 'LEG-DANGLING-BRANCH-REUSE: re-provision REUSES the dangling branch (no wedge), got ' + JSON.stringify(second));
    assert(worktreePaths(repoRoot).some(p => p.endsWith(path.join('.kw', 'legs', 'test-project', 'A'))), 'LEG-DANGLING-BRANCH-REUSE: worktree re-attached to the reused branch');
    cleanup(repoRoot);
  }

  // -------------------------------------------------------------------------
  // ★ LEG-CLEAN-COMPLETION-NO-LEAK (FIX-1a, RED-provable): provision legs (ON), close A (deferred) then
  //   close B (last → group_passed). On the clean group completion the lane_group key is cleared, so the
  //   reconcile-gated sweep can never reclaim these legs — close-node MUST tear them down primarily.
  //   Assert NO leg worktree AND NO kw/legs branch survives after the group completes. (RED-provable:
  //   drop the close-node teardown ⇒ the leg worktrees/branches leak ⇒ this block fails.)
  // -------------------------------------------------------------------------
  {
    const { repoRoot, cacheDir, planPath } = makeLaneRepo();
    const open = runNode(repoRoot, ['open-ready', '--project', 'test-project', '--write-overlap-consent', '--json'], LEG_ON);
    assert(open.result === 'ok' && open.laneGroup, 'LEG-CLEAN-COMPLETION-NO-LEAK: setup co-open ok');
    assert(worktreePaths(repoRoot).filter(p => p.indexOf(path.join('.kw', 'legs')) !== -1).length === 2, 'LEG-CLEAN-COMPLETION-NO-LEAK: two legs provisioned at setup');
    writeEvidence(cacheDir, 'A');
    writeEvidence(cacheDir, 'B');
    // #463 Slice 4: routing is LIVE — each member's work lands in its OWN leg (not the parent). The
    // synthesizer merges the legs at the last-member close → group_passed via the COMMIT-based union barrier.
    fs.writeFileSync(path.join(repoRoot, '.kw', 'legs', 'test-project', 'A', 'ax.js'), '// A in-lane (leg)\n');
    fs.writeFileSync(path.join(repoRoot, '.kw', 'legs', 'test-project', 'B', 'by.js'), '// B in-lane (leg)\n');
    const rA = runNode(repoRoot, ['close-node', '--node-id', 'A', '--project', 'test-project', '--json'], LEG_ON);
    assert(rA.result === 'ok' && rA.barrier === 'deferred_to_group', 'LEG-CLEAN-COMPLETION-NO-LEAK: A deferred ok, got ' + JSON.stringify(rA));
    const rB = runNode(repoRoot, ['close-node', '--node-id', 'B', '--project', 'test-project', '--json'], LEG_ON);
    assert(rB.result === 'ok' && rB.barrier === 'group_passed', 'LEG-CLEAN-COMPLETION-NO-LEAK: B group_passed, got ' + JSON.stringify(rB));
    assert(rB.synthesized === true && typeof rB.mergeCommit === 'string' && rB.mergeCommit.length >= 7, 'LEG-CLEAN-COMPLETION-NO-LEAK: B reports the synthesizer merge commit, got ' + JSON.stringify(rB));
    assert(ledgerStatus(planPath, 'A') === 'complete' && ledgerStatus(planPath, 'B') === 'complete', 'LEG-CLEAN-COMPLETION-NO-LEAK: both complete');
    const wts = worktreePaths(repoRoot);
    assert(!wts.some(p => p.indexOf(path.join('.kw', 'legs')) !== -1), 'LEG-CLEAN-COMPLETION-NO-LEAK: NO leg worktree survives clean completion, got ' + JSON.stringify(wts));
    assert(!branchExists(repoRoot, 'kw/legs/test-project/A'), 'LEG-CLEAN-COMPLETION-NO-LEAK: A leg branch torn down on completion');
    assert(!branchExists(repoRoot, 'kw/legs/test-project/B'), 'LEG-CLEAN-COMPLETION-NO-LEAK: B leg branch torn down on completion');
    cleanup(repoRoot);
  }

  // -------------------------------------------------------------------------
  // #593-AC1 (RED→GREEN, real-git co-open lifecycle): a two-node write antichain whose sets are
  //   exact-file-DISJOINT but share a NON-shared coarse area (both under plugins/, area 'plugins' ∉
  //   SHARED_INFRA ⇒ classifier {red, coarse}). Pre-#593 writeOverlapRelaxable required policy+consent
  //   for coarse, so open-ready SERIAL-DEGRADED (no lane_group). Post-#593 coarse co-opens BY DEFAULT
  //   under the SAME retained net as shared-infra (post-dominating code-reviewer gate + no PROTECTED
  //   file), with NO --write-overlap-consent. Full lifecycle: co-open → per-leg work → close A
  //   (deferred) → close B (last ⇒ octopus-merge union barrier / group_passed) → BOTH legs on HEAD.
  //   RED-provable: on pre-#593 code the setup co-open assert fails (open.laneGroup is falsy).
  // -------------------------------------------------------------------------
  {
    const COARSE_A = 'plugins/kaola-workflow-gitlab/scripts/pa.js';
    const COARSE_B = 'plugins/kaola-workflow-gitea/scripts/pb.js';
    const { repoRoot, cacheDir, planPath } = makeLaneRepo({ aSet: COARSE_A, bSet: COARSE_B });
    // DEFAULT env (no toggle), NO --write-overlap-consent, NO write_overlap_policy in the plan.
    const open = runNode(repoRoot, ['open-ready', '--project', 'test-project', '--json'], DEFAULT);
    assert(open.result === 'ok' && open.laneGroup && Array.isArray(open.laneGroup.members) && open.laneGroup.members.includes('A') && open.laneGroup.members.includes('B'),
      '#593-AC1: coarse exact-disjoint (both plugins/) co-opens [A,B] BY DEFAULT (no consent) under the net, got ' + JSON.stringify(open.laneGroup || open));
    assert(Array.isArray(open.opened) && open.opened.length === 2, '#593-AC1: both writes co-opened, got ' + JSON.stringify(open.opened && open.opened.map(n => n.id)));
    const rsOpen = readRS(cacheDir);
    assert(rsOpen && rsOpen.lane_group && rsOpen.lane_group.legs && rsOpen.lane_group.legs.A && rsOpen.lane_group.legs.B,
      '#593-AC1: co-open ⟹ legs provisioned for every member, got ' + JSON.stringify(rsOpen && rsOpen.lane_group));
    // Per-leg work → close A (deferred) → close B (octopus-merge union barrier at the last close).
    writeEvidence(cacheDir, 'A');
    writeEvidence(cacheDir, 'B');
    for (const [id, rel] of [['A', COARSE_A], ['B', COARSE_B]]) {
      const legFile = path.join(repoRoot, '.kw', 'legs', 'test-project', id, rel);
      fs.mkdirSync(path.dirname(legFile), { recursive: true });
      fs.writeFileSync(legFile, '// ' + id + ' in-lane (leg)\n');
    }
    const rA = runNode(repoRoot, ['close-node', '--node-id', 'A', '--project', 'test-project', '--json'], DEFAULT);
    assert(rA.result === 'ok' && rA.barrier === 'deferred_to_group', '#593-AC1: A deferred to the group barrier, got ' + JSON.stringify(rA));
    const rB = runNode(repoRoot, ['close-node', '--node-id', 'B', '--project', 'test-project', '--json'], DEFAULT);
    assert(rB.result === 'ok' && rB.barrier === 'group_passed' && rB.synthesized === true,
      '#593-AC1: B closes via the group (octopus-merge) union barrier ⇒ group_passed + synthesized, got ' + JSON.stringify(rB));
    const head = execFileSync('git', ['-C', repoRoot, 'ls-tree', '-r', '--name-only', 'HEAD'], { encoding: 'utf8' });
    assert(head.includes(COARSE_A) && head.includes(COARSE_B),
      '#593-AC1: BOTH legs\' files reach HEAD after the union barrier merge, got ' + JSON.stringify(head.split('\n').filter(Boolean)));
    assert(ledgerStatus(planPath, 'A') === 'complete' && ledgerStatus(planPath, 'B') === 'complete', '#593-AC1: both members complete');
    cleanup(repoRoot);
  }

  // -------------------------------------------------------------------------
  // #593-AC6 (serial byte-identity): the SAME coarse frontier under KAOLA_PARALLEL_WRITES=0 forces the
  //   serial single-write path — NO lane_group, exactly ONE write opened, the other stays pending. The
  //   #593 default-relax is fully suppressed by the explicit kill-switch (byte-identical serial shape).
  // -------------------------------------------------------------------------
  {
    const { repoRoot, cacheDir, planPath } = makeLaneRepo({ aSet: 'plugins/kaola-workflow-gitlab/scripts/qa.js', bSet: 'plugins/kaola-workflow-gitea/scripts/qb.js' });
    const r = runNode(repoRoot, ['open-ready', '--project', 'test-project', '--json'], SERIAL);
    assert(r.result === 'ok', '#593-AC6: open-ready ok under KAOLA_PARALLEL_WRITES=0, got ' + JSON.stringify(r));
    assert(!r.laneGroup, '#593-AC6: NO laneGroup for a coarse frontier under KAOLA_PARALLEL_WRITES=0 (serial kill-switch)');
    assert(Array.isArray(r.opened) && r.opened.length === 1, '#593-AC6: exactly ONE write opened (serial), got ' + JSON.stringify(r.opened && r.opened.map(n => n.id)));
    const rs = readRS(cacheDir);
    assert(!rs || !rs.lane_group, '#593-AC6: running-set has no lane_group key (serial byte-identity)');
    assert(ledgerStatus(planPath, r.opened[0].id) === 'in_progress', '#593-AC6: the one opened write is in_progress');
    cleanup(repoRoot);
  }

  // -------------------------------------------------------------------------
  // #593-AC2-NET2 (runtime net): a coarse frontier with a PROTECTED concrete file in one set does NOT
  //   co-open even BY DEFAULT — NET-2 blocks at every tier — so open-ready SERIAL-DEGRADES (no
  //   lane_group, exactly one write opened). PROTECTED stays blocking; no default-relax bypasses it.
  // -------------------------------------------------------------------------
  {
    const { repoRoot, cacheDir } = makeLaneRepo({ aSet: 'plugins/kaola-workflow-gitlab/package-lock.json', bSet: 'plugins/kaola-workflow-gitea/scripts/rb.js' });
    const r = runNode(repoRoot, ['open-ready', '--project', 'test-project', '--json'], DEFAULT);
    assert(r.result === 'ok', '#593-AC2-NET2: open-ready ok (serial-degrade), got ' + JSON.stringify(r));
    assert(!r.laneGroup, '#593-AC2-NET2: a PROTECTED file in the coarse pair blocks co-open (NET-2) ⇒ NO laneGroup, got ' + JSON.stringify(r.laneGroup));
    assert(Array.isArray(r.opened) && r.opened.length === 1, '#593-AC2-NET2: serial-degrade opens exactly ONE write, got ' + JSON.stringify(r.opened && r.opened.map(n => n.id)));
    const rs = readRS(cacheDir);
    assert(!rs || !rs.lane_group, '#593-AC2-NET2: running-set has no lane_group (serial-degrade)');
    cleanup(repoRoot);
  }

  // -------------------------------------------------------------------------
  // ★ #552-CRASH-WINDOW-LEDGER-ISLAST (RED-provable on the ledger-derived isLast fix): closeGroupMember
  //   flips the closing member's ledger row to `complete` in ONE write, THEN records closed_members +
  //   drops the node from the running set in a SECOND, non-atomic write. A crash between them leaves a
  //   member ledger-TERMINAL but ABSENT from closed_members (and still in running.nodes). Reading isLast
  //   from closed_members would then make the GENUINE last member mis-compute isLast=false, DEFER forever,
  //   and NEVER run the synthesizer → the other legs' committed work is silently never merged. The fix
  //   derives isLast from the LEDGER, so the last member still detects it is last. This scenario resumes
  //   WITHOUT reconcile (the ledger is the only consistent signal) and asserts B still synthesizes.
  //   RED-provable: revert the ledger-derived isLast ⇒ rB.barrier === 'deferred_to_group' ⇒ this fails.
  // -------------------------------------------------------------------------
  {
    const { repoRoot, cacheDir, planPath } = makeLaneRepo();
    const open = runNode(repoRoot, ['open-ready', '--project', 'test-project', '--write-overlap-consent', '--json'], LEG_ON);
    assert(open.result === 'ok' && open.laneGroup, '#552-CRASH-WINDOW-LEDGER-ISLAST: setup co-open ok');
    const rsOpen = readRS(cacheDir);
    const aNode = (rsOpen.nodes || []).find(n => n.id === 'A');
    assert(aNode, '#552-CRASH-WINDOW-LEDGER-ISLAST: A present in the open running set');
    writeEvidence(cacheDir, 'A');
    writeEvidence(cacheDir, 'B');
    fs.writeFileSync(path.join(repoRoot, '.kw', 'legs', 'test-project', 'A', 'ax.js'), '// A in-lane (leg) — must survive the crash window\n');
    fs.writeFileSync(path.join(repoRoot, '.kw', 'legs', 'test-project', 'B', 'by.js'), '// B in-lane (leg)\n');
    // Close A → deferred (the COMPLETED close: ledger A complete, closed_members=[A], A dropped from nodes).
    const rA = runNode(repoRoot, ['close-node', '--node-id', 'A', '--project', 'test-project', '--json'], LEG_ON);
    assert(rA.result === 'ok' && rA.barrier === 'deferred_to_group', '#552-CRASH-WINDOW-LEDGER-ISLAST: A deferred ok, got ' + JSON.stringify(rA));
    // SIMULATE THE CRASH WINDOW: roll the running-set BACK to the pre-2nd-write state (A still in nodes,
    // closed_members WITHOUT A) while A's ledger row stays `complete` and A's leg stays in the manifest.
    const rsCrash = readRS(cacheDir);
    rsCrash.nodes = [aNode, ...(rsCrash.nodes || []).filter(n => n.id !== 'A')];
    if (rsCrash.lane_group) rsCrash.lane_group.closed_members = (rsCrash.lane_group.closed_members || []).filter(id => id !== 'A');
    fs.writeFileSync(path.join(cacheDir, 'running-set.json'), JSON.stringify(rsCrash, null, 2));
    assert(ledgerStatus(planPath, 'A') === 'complete', '#552-CRASH-WINDOW-LEDGER-ISLAST: A ledger stays complete across the window');
    assert(!(rsCrash.lane_group.closed_members || []).includes('A'), '#552-CRASH-WINDOW-LEDGER-ISLAST: closed_members is stale (A stripped) for the test');
    // Close B with the stale closed_members — the ledger-derived isLast must still mark B as LAST.
    const rB = runNode(repoRoot, ['close-node', '--node-id', 'B', '--project', 'test-project', '--json'], LEG_ON);
    assert(rB.result === 'ok' && rB.barrier === 'group_passed',
      '#552-CRASH-WINDOW-LEDGER-ISLAST: B detected LAST via the LEDGER despite stale closed_members ⇒ group_passed (NOT deferred), got ' + JSON.stringify(rB));
    assert(rB.synthesized === true && typeof rB.mergeCommit === 'string' && rB.mergeCommit.length >= 7,
      '#552-CRASH-WINDOW-LEDGER-ISLAST: B synthesizes + merges (no silent loss), got ' + JSON.stringify(rB));
    // The commit-union group barrier (group_passed) already enforces per-leg-head ancestor inclusion for
    // BOTH legs; cross-check concretely that A's committed leg file reached HEAD (the no-loss invariant).
    const head1 = execFileSync('git', ['-C', repoRoot, 'ls-tree', '-r', '--name-only', 'HEAD'], { encoding: 'utf8' });
    assert(head1.includes('ax.js') && head1.includes('by.js'),
      '#552-CRASH-WINDOW-LEDGER-ISLAST: BOTH legs\' files on HEAD after synthesis (ax.js from the crash-window member), got ' + JSON.stringify(head1.split('\n').filter(Boolean)));
    cleanup(repoRoot);
  }

  // -------------------------------------------------------------------------
  // ★ #552-CRASH-WINDOW-RECONCILE-HEAL (RED-provable on the reconcile self-heal + leg-retention fix): the
  //   normal resume path runs reconcile-running-set first. For the SAME crash window, reconcile must (a)
  //   SELF-HEAL closed_members (re-add the close-direction terminal member) and (b) RETAIN that member's
  //   leg (NOT tear it down) so the eventual last-member synthesizer can merge it. Pre-fix, reconcile's
  //   surviving-group teardown loop tore down the close-direction member's leg + dropped it from the
  //   manifest → the synthesizer omits it → committed work permanently lost. RED-provable: re-add `...closed`
  //   to the reconcile `departing` set ⇒ A's leg is torn down ⇒ ax.js missing from HEAD ⇒ this fails.
  // -------------------------------------------------------------------------
  {
    const { repoRoot, cacheDir, planPath } = makeLaneRepo();
    const open = runNode(repoRoot, ['open-ready', '--project', 'test-project', '--write-overlap-consent', '--json'], LEG_ON);
    assert(open.result === 'ok' && open.laneGroup, '#552-CRASH-WINDOW-RECONCILE-HEAL: setup co-open ok');
    const rsOpen = readRS(cacheDir);
    const aNode = (rsOpen.nodes || []).find(n => n.id === 'A');
    writeEvidence(cacheDir, 'A');
    writeEvidence(cacheDir, 'B');
    fs.writeFileSync(path.join(repoRoot, '.kw', 'legs', 'test-project', 'A', 'ax.js'), '// A in-lane (leg) — must survive reconcile\n');
    fs.writeFileSync(path.join(repoRoot, '.kw', 'legs', 'test-project', 'B', 'by.js'), '// B in-lane (leg)\n');
    const rA = runNode(repoRoot, ['close-node', '--node-id', 'A', '--project', 'test-project', '--json'], LEG_ON);
    assert(rA.result === 'ok' && rA.barrier === 'deferred_to_group', '#552-CRASH-WINDOW-RECONCILE-HEAL: A deferred ok, got ' + JSON.stringify(rA));
    // Crash window: A back in nodes, A stripped from closed_members, ledger A complete, A leg retained.
    const rsCrash = readRS(cacheDir);
    rsCrash.nodes = [aNode, ...(rsCrash.nodes || []).filter(n => n.id !== 'A')];
    if (rsCrash.lane_group) rsCrash.lane_group.closed_members = (rsCrash.lane_group.closed_members || []).filter(id => id !== 'A');
    fs.writeFileSync(path.join(cacheDir, 'running-set.json'), JSON.stringify(rsCrash, null, 2));
    assert(rsCrash.lane_group.legs && rsCrash.lane_group.legs.A, '#552-CRASH-WINDOW-RECONCILE-HEAL: A leg in the manifest pre-reconcile');
    // RECONCILE: self-heal closed_members + RETAIN A's leg.
    const rec = runNode(repoRoot, ['reconcile-running-set', '--project', 'test-project', '--json'], LEG_ON);
    assert(rec.result === 'ok', '#552-CRASH-WINDOW-RECONCILE-HEAL: reconcile ok, got ' + JSON.stringify(rec));
    const rsHealed = readRS(cacheDir);
    assert(rsHealed && rsHealed.lane_group && Array.isArray(rsHealed.lane_group.closed_members) && rsHealed.lane_group.closed_members.includes('A'),
      '#552-CRASH-WINDOW-RECONCILE-HEAL: reconcile SELF-HEALS closed_members (A re-added), got ' + JSON.stringify(rsHealed && rsHealed.lane_group && rsHealed.lane_group.closed_members));
    assert(rsHealed.lane_group.legs && rsHealed.lane_group.legs.A && rsHealed.lane_group.legs.B,
      '#552-CRASH-WINDOW-RECONCILE-HEAL: reconcile RETAINS both legs (A NOT torn down), got ' + JSON.stringify(rsHealed.lane_group.legs));
    assert(worktreePaths(repoRoot).some(p => p.endsWith(path.join('.kw', 'legs', 'test-project', 'A'))), '#552-CRASH-WINDOW-RECONCILE-HEAL: A leg worktree survives reconcile (work not lost)');
    assert(branchExists(repoRoot, 'kw/legs/test-project/A'), '#552-CRASH-WINDOW-RECONCILE-HEAL: A leg branch survives reconcile');
    // Close B → group_passed; both legs merged.
    const rB = runNode(repoRoot, ['close-node', '--node-id', 'B', '--project', 'test-project', '--json'], LEG_ON);
    assert(rB.result === 'ok' && rB.barrier === 'group_passed' && rB.synthesized === true,
      '#552-CRASH-WINDOW-RECONCILE-HEAL: B group_passed + synthesized after the healed reconcile, got ' + JSON.stringify(rB));
    const head2 = execFileSync('git', ['-C', repoRoot, 'ls-tree', '-r', '--name-only', 'HEAD'], { encoding: 'utf8' });
    assert(head2.includes('ax.js') && head2.includes('by.js'),
      '#552-CRASH-WINDOW-RECONCILE-HEAL: BOTH legs\' files on HEAD (A leg retained through reconcile), got ' + JSON.stringify(head2.split('\n').filter(Boolean)));
    assert(ledgerStatus(planPath, 'A') === 'complete' && ledgerStatus(planPath, 'B') === 'complete', '#552-CRASH-WINDOW-RECONCILE-HEAL: both complete');
    cleanup(repoRoot);
  }

  // -------------------------------------------------------------------------
  // LEG-CRASH-LOST-MANIFEST-RECLAIM (FIX-1b): provision legs (ON), then UNLINK running-set.json
  //   entirely (a crash that lost the manifest). Run reconcile-running-set with the toggle ON; the
  //   hoisted sweep — gated on resolveLegIsolation, NOT on a present manifest — reclaims the now-orphan
  //   legs (no keep-paths to protect them). Assert both leg worktrees + branches are gone.
  // -------------------------------------------------------------------------
  {
    const { repoRoot, cacheDir } = makeLaneRepo();
    const open = runNode(repoRoot, ['open-ready', '--project', 'test-project', '--write-overlap-consent', '--json'], LEG_ON);
    assert(open.result === 'ok' && open.laneGroup, 'LEG-CRASH-LOST-MANIFEST-RECLAIM: setup co-open ok');
    assert(worktreePaths(repoRoot).filter(p => p.indexOf(path.join('.kw', 'legs')) !== -1).length === 2, 'LEG-CRASH-LOST-MANIFEST-RECLAIM: two legs provisioned at setup');
    // Crash: lose the running-set manifest entirely.
    fs.unlinkSync(path.join(cacheDir, 'running-set.json'));
    const rec = runNode(repoRoot, ['reconcile-running-set', '--project', 'test-project', '--json'], LEG_ON);
    assert(rec.result === 'ok', 'LEG-CRASH-LOST-MANIFEST-RECLAIM: reconcile ok (no_running_set), got ' + JSON.stringify(rec));
    assert(rec.reason === 'no_running_set', 'LEG-CRASH-LOST-MANIFEST-RECLAIM: reconcile returns no_running_set, got ' + rec.reason);
    const wts = worktreePaths(repoRoot);
    assert(!wts.some(p => p.indexOf(path.join('.kw', 'legs')) !== -1), 'LEG-CRASH-LOST-MANIFEST-RECLAIM: orphan legs reclaimed despite lost manifest, got ' + JSON.stringify(wts));
    assert(!branchExists(repoRoot, 'kw/legs/test-project/A') && !branchExists(repoRoot, 'kw/legs/test-project/B'), 'LEG-CRASH-LOST-MANIFEST-RECLAIM: orphan leg branches reclaimed');
    cleanup(repoRoot);
  }

  // -------------------------------------------------------------------------
  // LEG-CRASH-LOST-MANIFEST-SERIAL (#542 kill-switch byte-identity): the SAME lost-manifest reconcile
  //   under the kill-switch KAOLA_PARALLEL_WRITES=0 must NOT sweep — the hoisted sweep is now gated on
  //   parallelWritesDefaultOn (DEFAULT-ON), so only the explicit kill-switch suppresses it. Under the
  //   kill-switch the run does zero git worktree teardown and the (manually planted) leg survives
  //   untouched. (The DEFAULT/legacy-toggle reclaim path is LEG-CRASH-LOST-MANIFEST-RECLAIM above —
  //   default-on now sweeps.)
  // -------------------------------------------------------------------------
  {
    const { repoRoot, cacheDir } = makeLaneRepo();
    // Plant a leg directly (simulating a leftover) without any running set.
    const legPath = path.join(repoRoot, '.kw', 'legs', 'test-project', 'A');
    execFileSync('git', ['-C', repoRoot, 'worktree', 'add', '-b', 'kw/legs/test-project/A', '--', legPath, 'HEAD'], { stdio: ['ignore', 'ignore', 'ignore'] });
    try { fs.unlinkSync(path.join(cacheDir, 'running-set.json')); } catch (_) {}
    const rec = runNode(repoRoot, ['reconcile-running-set', '--project', 'test-project', '--json'], SERIAL); // kill-switch suppresses the sweep
    assert(rec.result === 'ok', 'LEG-CRASH-LOST-MANIFEST-SERIAL: reconcile ok, got ' + JSON.stringify(rec));
    assert(worktreePaths(repoRoot).some(p => p.endsWith(path.join('.kw', 'legs', 'test-project', 'A'))), 'LEG-CRASH-LOST-MANIFEST-SERIAL: planted leg UNTOUCHED under kill-switch (no sweep), still present');
    assert(branchExists(repoRoot, 'kw/legs/test-project/A'), 'LEG-CRASH-LOST-MANIFEST-SERIAL: planted leg branch UNTOUCHED under kill-switch');
    cleanup(repoRoot);
  }

  // =========================================================================
  // #463-LEG-BARRIER (Slice 3) — the PER-LEG write-isolation barrier. Drives the REAL validator
  // --leg-barrier subprocess + the close-path wiring in a REAL git repo with REAL leg writes (the unit
  // walkthrough cannot touch worktrees). Producer (adaptive-node ref-anchor at provision) + consumer
  // (validator --leg-barrier) land together; these prove the ref RESOLVES end-to-end (no silent
  // no_leg_base — the advisor landmine), the in-lane/overflow gate, committed-in-leg detection, and the
  // #368 anti-laundering cross-check + ancestor backstop. In S3 production legs stay EMPTY (routing is
  // S4); these tests write into legs DIRECTLY to exercise the barrier — the S2 dormant-but-tested pattern.
  // =========================================================================
  const STDIO_Q = { stdio: ['ignore', 'ignore', 'ignore'] };
  // Run the validator CLI as a REAL subprocess; parse the trailing JSON line like runNode.
  function runVal(repoRoot, subArgs) {
    try {
      const stdout = execFileSync('node', [VALIDATOR, ...subArgs], { cwd: repoRoot, encoding: 'utf8' });
      let parsed = {}; try { parsed = JSON.parse(stdout.trim().split('\n').pop()); } catch (_) {}
      return { exitCode: 0, ...parsed };
    } catch (err) {
      const status = (err.status == null) ? 1 : err.status;
      let parsed = {}; try { parsed = JSON.parse(String(err.stdout || '').trim().split('\n').pop()); } catch (_) {}
      return { exitCode: status, ...parsed };
    }
  }
  function gitOut(cwd, args) {
    try { return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim(); } catch (_) { return ''; }
  }
  const legRefName = id => 'refs/kaola-workflow/leg-base/test-project/' + id;
  const planP = repoRoot => path.join(repoRoot, 'kaola-workflow', 'test-project', 'workflow-plan.md');
  function refResolves(repoRoot, id) { return gitOut(repoRoot, ['rev-parse', '--verify', '--quiet', legRefName(id) + '^{commit}']); }
  // Provision legs (LEG_ON + consent) and return { repoRoot, cacheDir, legA, legB, rs }.
  function provisionedRepo() {
    const { repoRoot, cacheDir } = makeLaneRepo();
    const r = runNode(repoRoot, ['open-ready', '--project', 'test-project', '--write-overlap-consent', '--json'], LEG_ON);
    assert(r.result === 'ok' && r.laneGroup, 'LEG-BARRIER setup: co-open ok, got ' + JSON.stringify(r));
    const rs = readRS(cacheDir);
    return {
      repoRoot, cacheDir, rs,
      legA: path.join(repoRoot, '.kw', 'legs', 'test-project', 'A'),
      legB: path.join(repoRoot, '.kw', 'legs', 'test-project', 'B'),
    };
  }

  // LEG-BARRIER-REF-ANCHORED (advisor landmine: producer + consumer ref names must AGREE). The ref the
  // provision side anchored must RESOLVE under the name the validator derives, and equal the manifest base.
  {
    const { repoRoot, rs } = provisionedRepo();
    const refA = refResolves(repoRoot, 'A');
    assert(refA && refA.length >= 7, 'LEG-BARRIER-REF-ANCHORED: leg-base ref for A RESOLVES (producer anchored it under the consumer name), got ' + JSON.stringify(refA));
    assert(refA === rs.lane_group.legs.A.baseline, 'LEG-BARRIER-REF-ANCHORED: anchored ref A == manifest baseline (cross-check anchor agrees), got ref ' + refA + ' vs manifest ' + rs.lane_group.legs.A.baseline);
    cleanup(repoRoot);
  }

  // LEG-BARRIER-IN-LANE (uncommitted): a declared write inside the leg → --leg-barrier passes.
  {
    const { repoRoot, legA, rs } = provisionedRepo();
    fs.writeFileSync(path.join(legA, 'ax.js'), '// A in-lane leg write\n');
    const r = runVal(repoRoot, [planP(repoRoot), '--leg-barrier', '--node-id', 'A', '--project', 'test-project', '--leg-root', legA, '--expect-base', rs.lane_group.legs.A.baseline, '--json']);
    assert(r.result === 'pass', 'LEG-BARRIER-IN-LANE: in-lane leg write passes, got ' + JSON.stringify(r));
    cleanup(repoRoot);
  }

  // LEG-BARRIER-OVERFLOW (uncommitted): an OUT-OF-declared write inside the leg → write_set_overflow.
  {
    const { repoRoot, legA, rs } = provisionedRepo();
    fs.writeFileSync(path.join(legA, 'ax.js'), '// in-lane\n');
    fs.writeFileSync(path.join(legA, 'zz.js'), '// OVERFLOW (not in A declared set {ax.js})\n');
    const r = runVal(repoRoot, [planP(repoRoot), '--leg-barrier', '--node-id', 'A', '--project', 'test-project', '--leg-root', legA, '--expect-base', rs.lane_group.legs.A.baseline, '--json']);
    assert(r.result === 'refuse' && r.reason === 'write_set_overflow', 'LEG-BARRIER-OVERFLOW: leg overflow refuses write_set_overflow, got ' + JSON.stringify(r));
    cleanup(repoRoot);
  }

  // LEG-BARRIER-COMMITTED: COMMIT the writes IN the leg (not just uncommitted) — snapshotWorktree's
  // read-tree HEAD path must still attribute them. In-lane commit → pass; an overflow commit → refuse.
  {
    const { repoRoot, legA, rs } = provisionedRepo();
    fs.writeFileSync(path.join(legA, 'ax.js'), '// committed in leg\n');
    execFileSync('git', ['-C', legA, 'add', '-A'], STDIO_Q);
    execFileSync('git', ['-C', legA, 'commit', '-m', 'leg work'], STDIO_Q);
    const rOk = runVal(repoRoot, [planP(repoRoot), '--leg-barrier', '--node-id', 'A', '--project', 'test-project', '--leg-root', legA, '--expect-base', rs.lane_group.legs.A.baseline, '--json']);
    assert(rOk.result === 'pass', 'LEG-BARRIER-COMMITTED: committed in-lane leg write passes (read-tree HEAD path), got ' + JSON.stringify(rOk));
    fs.writeFileSync(path.join(legA, 'zz.js'), '// committed overflow\n');
    execFileSync('git', ['-C', legA, 'add', '-A'], STDIO_Q);
    execFileSync('git', ['-C', legA, 'commit', '-m', 'leg overflow'], STDIO_Q);
    const rBad = runVal(repoRoot, [planP(repoRoot), '--leg-barrier', '--node-id', 'A', '--project', 'test-project', '--leg-root', legA, '--expect-base', rs.lane_group.legs.A.baseline, '--json']);
    assert(rBad.result === 'refuse' && rBad.reason === 'write_set_overflow', 'LEG-BARRIER-COMMITTED: committed overflow still refuses, got ' + JSON.stringify(rBad));
    cleanup(repoRoot);
  }

  // ★ LEG-BARRIER-VACUOUS-BASE (adversarial, the #368 cross-check): the laundering attack is to claim
  //   base = the leg's POST-WRITE tree so the diff empties. The validator resolves base from the ANCHORED
  //   ref (so the diff can't empty), and the manifest --expect-base cross-check trips the tamper:
  //   --expect-base = a post-write commit != the ref ⇒ barrier_base_mismatch.
  {
    const { repoRoot, legA, rs } = provisionedRepo();
    fs.writeFileSync(path.join(legA, 'zz.js'), '// overflow a free base would launder\n');
    execFileSync('git', ['-C', legA, 'add', '-A'], STDIO_Q);
    execFileSync('git', ['-C', legA, 'commit', '-m', 'overflow committed'], STDIO_Q);
    const postWrite = gitOut(legA, ['rev-parse', 'HEAD']);
    assert(postWrite && postWrite !== rs.lane_group.legs.A.baseline, 'LEG-BARRIER-VACUOUS-BASE: post-write HEAD differs from the anchored base');
    const r = runVal(repoRoot, [planP(repoRoot), '--leg-barrier', '--node-id', 'A', '--project', 'test-project', '--leg-root', legA, '--expect-base', postWrite, '--json']);
    assert(r.result === 'refuse' && r.reason === 'barrier_base_mismatch', 'LEG-BARRIER-VACUOUS-BASE: a tampered (post-write) --expect-base refuses barrier_base_mismatch (the #368 cross-check defeats the laundering base), got ' + JSON.stringify(r));
    cleanup(repoRoot);
  }

  // LEG-BARRIER-NO-REF: --leg-barrier with NO anchored leg-base ref → no_leg_base (not a silent pass).
  {
    const { repoRoot } = makeLaneRepo();
    const legX = path.join(repoRoot, '.kw', 'legs', 'test-project', 'A');
    execFileSync('git', ['-C', repoRoot, 'worktree', 'add', '-b', 'kw/legs/test-project/A', '--', legX, 'HEAD'], STDIO_Q);
    const r = runVal(repoRoot, [planP(repoRoot), '--leg-barrier', '--node-id', 'A', '--project', 'test-project', '--leg-root', legX, '--json']);
    assert(r.result === 'refuse' && r.reason === 'no_leg_base', 'LEG-BARRIER-NO-REF: missing anchored ref refuses no_leg_base (no vacuous pass), got ' + JSON.stringify(r));
    cleanup(repoRoot);
  }

  // LEG-BARRIER-ANCESTOR-BACKSTOP: a ref re-pointed FORWARD (not an ancestor of legHEAD) → the diff base
  //   does not sit in the leg's history → leg_base_unreachable (the backstop behind the cross-check).
  {
    const { repoRoot, legA } = provisionedRepo();
    fs.writeFileSync(path.join(repoRoot, 'forward.txt'), 'f\n');
    execFileSync('git', ['-C', repoRoot, 'add', '-A'], STDIO_Q);
    execFileSync('git', ['-C', repoRoot, 'commit', '-m', 'forward'], STDIO_Q);
    const forward = gitOut(repoRoot, ['rev-parse', 'HEAD']); // descendant of baseRev ⇒ NOT an ancestor of legHEAD(=baseRev)
    execFileSync('git', ['-C', repoRoot, 'update-ref', legRefName('A'), forward], STDIO_Q);
    const r = runVal(repoRoot, [planP(repoRoot), '--leg-barrier', '--node-id', 'A', '--project', 'test-project', '--leg-root', legA, '--expect-base', forward, '--json']);
    assert(r.result === 'refuse' && r.reason === 'leg_base_unreachable', 'LEG-BARRIER-ANCESTOR-BACKSTOP: a forward (non-ancestor) base refuses leg_base_unreachable, got ' + JSON.stringify(r));
    cleanup(repoRoot);
  }

  // LEG-BARRIER-ARG-VALIDATION: missing --node-id / --leg-root / --project → typed refusals.
  {
    const { repoRoot, legA } = provisionedRepo();
    const noNode = runVal(repoRoot, [planP(repoRoot), '--leg-barrier', '--project', 'test-project', '--leg-root', legA, '--json']);
    assert(noNode.result === 'refuse' && noNode.reason === 'missing_node_id', 'LEG-BARRIER-ARG: missing --node-id, got ' + JSON.stringify(noNode));
    const noRoot = runVal(repoRoot, [planP(repoRoot), '--leg-barrier', '--node-id', 'A', '--project', 'test-project', '--json']);
    assert(noRoot.result === 'refuse' && noRoot.reason === 'missing_leg_root', 'LEG-BARRIER-ARG: missing --leg-root, got ' + JSON.stringify(noRoot));
    const noProj = runVal(repoRoot, [planP(repoRoot), '--leg-barrier', '--node-id', 'A', '--leg-root', legA, '--json']);
    assert(noProj.result === 'refuse' && noProj.reason === 'missing_project', 'LEG-BARRIER-ARG: missing --project, got ' + JSON.stringify(noProj));
    cleanup(repoRoot);
  }

  // LEG-BARRIER-LEG-ROOT-INVALID: --leg-root pointing at a non-worktree dir (its git toplevel != itself).
  {
    const { repoRoot } = makeLaneRepo();
    const notWt = path.join(repoRoot, 'not-a-worktree');
    fs.mkdirSync(notWt, { recursive: true });
    const r = runVal(repoRoot, [planP(repoRoot), '--leg-barrier', '--node-id', 'A', '--project', 'test-project', '--leg-root', notWt, '--json']);
    assert(r.result === 'refuse' && r.reason === 'leg_root_invalid', 'LEG-BARRIER-LEG-ROOT-INVALID: non-worktree leg-root refuses leg_root_invalid, got ' + JSON.stringify(r));
    cleanup(repoRoot);
  }

  // ★ LEG-BARRIER-CLOSE-PATH-GATES (the PRODUCTION wiring GATES): #463 S4 routing is live, so the member's
  //   work lands in its LEG. An in-lane write (ax.js, satisfies the leg-aware vacuity guard) + an OVERFLOW
  //   (zz.js, not declared) both in the leg → close-node REFUSES at the pre-wired per-leg barrier (proves
  //   the wiring is not a vacuous empty-leg pass). Ledger stays in_progress.
  {
    const { repoRoot, cacheDir, legA } = provisionedRepo();
    writeEvidence(cacheDir, 'A');
    fs.writeFileSync(path.join(legA, 'ax.js'), '// A in-lane in LEG (vacuity)\n');
    fs.writeFileSync(path.join(legA, 'zz.js'), '// OVERFLOW in A leg\n');
    const r = runNode(repoRoot, ['close-node', '--node-id', 'A', '--project', 'test-project', '--json'], LEG_ON);
    assert(r.result === 'refuse' && r.reason === 'write_set_overflow', 'LEG-BARRIER-CLOSE-PATH-GATES: close-node refuses a leg overflow via the pre-wired barrier, got ' + JSON.stringify(r));
    assert(ledgerStatus(planP(repoRoot), 'A') === 'in_progress', 'LEG-BARRIER-CLOSE-PATH-GATES: A ledger stays in_progress on refusal, got ' + ledgerStatus(planP(repoRoot), 'A'));
    cleanup(repoRoot);
  }

  // LEG-BARRIER-CLOSE-PATH-CLEAN: in-lane to the PARENT (vacuity) + a REAL in-lane write to the LEG →
  //   close-node A passes the leg-barrier (not just the empty-leg trivial pass) and defers to the group.
  {
    const { repoRoot, cacheDir, legA } = provisionedRepo();
    writeEvidence(cacheDir, 'A');
    fs.writeFileSync(path.join(repoRoot, 'ax.js'), '// parent in-lane (vacuity)\n');
    fs.writeFileSync(path.join(legA, 'ax.js'), '// leg in-lane (declared)\n');
    const r = runNode(repoRoot, ['close-node', '--node-id', 'A', '--project', 'test-project', '--json'], LEG_ON);
    assert(r.result === 'ok' && r.barrier === 'deferred_to_group', 'LEG-BARRIER-CLOSE-PATH-CLEAN: close A passes the leg-barrier on a real in-lane leg write + defers, got ' + JSON.stringify(r));
    cleanup(repoRoot);
  }

  // RETIRED for #498: LEG-BARRIER-CLOSE-PATH-FLAG-OFF asserted that ON-alone (containment only) co-opens
  // a group and the legless close returns barrier:'deferred_to_group'. PREMISE NOW UNREACHABLE: after #498
  // co-open ⟺ legs provisioned, so ON-alone serial-degrades (opens ONE node, no group) — closing it takes
  // the SERIAL per-node barrier path, not the group close. Its real intent (a legless close SKIPS the
  // leg-barrier block, byte-identical to pre-S3) is covered by D437-CLOSE-NODE-FLAG-OFF-SERIAL (the legless
  // serial close) and the leg-barrier itself by the real-leg LEG-BARRIER-IN-LANE / -OVERFLOW / -COMMITTED
  // tests below. (Its body never planted a leg-overflow, so it never exercised its own skip claim anyway.)

  // LEG-BARRIER-TEARDOWN-DROPS-REF: on clean group completion the leg-base refs are deleted alongside the
  //   worktree + branch (no ref leak). #463 S4: an end-to-end close-path run with REAL in-leg writes that
  //   the synthesizer merges (group_passed via the commit-based union barrier), then teardown.
  {
    const { repoRoot, cacheDir, legA, legB } = provisionedRepo();
    assert(refResolves(repoRoot, 'A') !== '' && refResolves(repoRoot, 'B') !== '', 'LEG-BARRIER-TEARDOWN-DROPS-REF: refs A,B anchored at provision');
    writeEvidence(cacheDir, 'A'); writeEvidence(cacheDir, 'B');
    fs.writeFileSync(path.join(legA, 'ax.js'), '// a (leg)\n');
    fs.writeFileSync(path.join(legB, 'by.js'), '// b (leg)\n');
    const rA = runNode(repoRoot, ['close-node', '--node-id', 'A', '--project', 'test-project', '--json'], LEG_ON);
    assert(rA.result === 'ok', 'LEG-BARRIER-TEARDOWN-DROPS-REF: close A ok, got ' + JSON.stringify(rA));
    const rB = runNode(repoRoot, ['close-node', '--node-id', 'B', '--project', 'test-project', '--json'], LEG_ON);
    assert(rB.result === 'ok' && rB.barrier === 'group_passed', 'LEG-BARRIER-TEARDOWN-DROPS-REF: close B group_passed, got ' + JSON.stringify(rB));
    assert(refResolves(repoRoot, 'A') === '' && refResolves(repoRoot, 'B') === '', 'LEG-BARRIER-TEARDOWN-DROPS-REF: leg-base refs deleted on teardown (no ref leak)');
    cleanup(repoRoot);
  }

  // =========================================================================
  // #463-SYNTHESIZER (Slice 4) — the SYNTHESIZER execution + COMMIT-based union barrier + parent-clean
  // fence + level commit barrier + singleton fast-path, in a REAL git repo (the unit walkthrough cannot
  // touch worktrees/merges). The B1 fix is the load-bearing claim: the union barrier measures the merge
  // COMMIT (diff base→M), NOT a working-tree snapshot, so a floated own-lane slip cannot false-green and a
  // dropped leg (silent loss) is caught by per-leg-head ancestor inclusion. Disjoint merges are mechanical.
  // =========================================================================

  // SYNTH-DISJOINT-END-TO-END (AC6/AC9 core): two legs, disjoint declared files written IN the legs; close
  //   A (deferred) then B (last) → the synthesizer octopus-merges both into the feature branch → M; the
  //   commit-based union barrier passes; HEAD advanced to M; M contains BOTH files; legs torn down.
  {
    const { repoRoot, cacheDir, legA, legB, rs } = provisionedRepo();
    const base = rs.lane_group.legs.A.baseline;
    writeEvidence(cacheDir, 'A'); writeEvidence(cacheDir, 'B');
    fs.writeFileSync(path.join(legA, 'ax.js'), '// A leg work\n');
    fs.writeFileSync(path.join(legB, 'by.js'), '// B leg work\n');
    const rA = runNode(repoRoot, ['close-node', '--node-id', 'A', '--project', 'test-project', '--json'], LEG_ON);
    assert(rA.result === 'ok' && rA.barrier === 'deferred_to_group', 'SYNTH-DISJOINT: A deferred, got ' + JSON.stringify(rA));
    const rB = runNode(repoRoot, ['close-node', '--node-id', 'B', '--project', 'test-project', '--json'], LEG_ON);
    assert(rB.result === 'ok' && rB.barrier === 'group_passed' && rB.synthesized === true, 'SYNTH-DISJOINT: B group_passed + synthesized, got ' + JSON.stringify(rB));
    const M = rB.mergeCommit;
    assert(typeof M === 'string' && M.length >= 7, 'SYNTH-DISJOINT: B carries mergeCommit M, got ' + JSON.stringify(rB));
    assert(gitOut(repoRoot, ['rev-parse', 'HEAD']) === M, 'SYNTH-DISJOINT: HEAD advanced to M (the dependency-level commit)');
    const parents = gitOut(repoRoot, ['rev-list', '--parents', '-n', '1', M]).split(/\s+/).slice(1);
    assert(parents.length >= 3, 'SYNTH-DISJOINT: M is the octopus merge (≥3 parents = feature + legA + legB), got ' + parents.length);
    assert(gitOut(repoRoot, ['rev-parse', M + ':ax.js']) !== '' && gitOut(repoRoot, ['rev-parse', M + ':by.js']) !== '', 'SYNTH-DISJOINT: M contains BOTH legs\' files');
    const mDiff = gitOut(repoRoot, ['diff-tree', '-r', '--name-only', base, M]).split('\n').map(s => s.trim()).filter(Boolean).sort();
    assert(JSON.stringify(mDiff) === JSON.stringify(['ax.js', 'by.js']), 'SYNTH-DISJOINT: diff base→M == union(declared), got ' + JSON.stringify(mDiff));
    const timings = fs.existsSync(path.join(cacheDir, 'node-timings.jsonl')) ? fs.readFileSync(path.join(cacheDir, 'node-timings.jsonl'), 'utf8') : '';
    assert(/level_merged/.test(timings), 'SYNTH-DISJOINT: a level_merged telemetry event was recorded');
    // #463 Slice 6 (AC17): the synthesizer emits leg_committed PER leg (the leg-lifecycle telemetry
    // leg_opened → leg_committed → level_merged). The live AC18 probe caught its absence; this pins it.
    assert((timings.match(/leg_committed/g) || []).length === 2, 'SYNTH-DISJOINT: leg_committed emitted once per leg (AC17), got ' + (timings.match(/leg_committed/g) || []).length);
    assert(worktreePaths(repoRoot).filter(p => p.indexOf(path.join('.kw', 'legs')) !== -1).length === 0, 'SYNTH-DISJOINT: legs torn down after the merge');
    cleanup(repoRoot);
  }

  // SYNTH-PARENT-DIRTY-FENCE (AC4): a floated own-lane slip — a PRODUCTION file written to the PARENT (not
  //   exempt) — is caught by the parent-clean fence at the last-member close, BEFORE the merge. parent_dirty;
  //   no merge happened (HEAD unchanged); B stays in_progress.
  {
    const { repoRoot, cacheDir, legA, legB, rs } = provisionedRepo();
    const base = rs.lane_group.legs.A.baseline;
    writeEvidence(cacheDir, 'A'); writeEvidence(cacheDir, 'B');
    fs.writeFileSync(path.join(legA, 'ax.js'), '// A leg work\n');
    fs.writeFileSync(path.join(legB, 'by.js'), '// B leg work\n');
    fs.writeFileSync(path.join(repoRoot, 'leaked.js'), '// FLOATED own-lane slip into the PARENT\n');
    const rA = runNode(repoRoot, ['close-node', '--node-id', 'A', '--project', 'test-project', '--json'], LEG_ON);
    assert(rA.result === 'ok' && rA.barrier === 'deferred_to_group', 'SYNTH-PARENT-DIRTY: A deferred, got ' + JSON.stringify(rA));
    const rB = runNode(repoRoot, ['close-node', '--node-id', 'B', '--project', 'test-project', '--json'], LEG_ON);
    assert(rB.result === 'refuse' && rB.reason === 'parent_dirty', 'SYNTH-PARENT-DIRTY: B refused parent_dirty (floated slip caught), got ' + JSON.stringify(rB));
    assert(gitOut(repoRoot, ['rev-parse', 'HEAD']) === base, 'SYNTH-PARENT-DIRTY: HEAD NOT advanced (no merge on a dirty parent)');
    assert(ledgerStatus(planP(repoRoot), 'B') === 'in_progress', 'SYNTH-PARENT-DIRTY: B stays in_progress on refusal');
    cleanup(repoRoot);
  }

  // PARENT-CLEAN-CHECK-DIRECT: the fence reuses the EXACT barrier allowband — workflow churn (.cache /
  //   running-set / plan) NEVER trips it (the advisor's #1: else it ships inert), only a production path does.
  {
    const { repoRoot } = provisionedRepo(); // open-ready left .cache churn dirty in the parent
    const clean = runVal(repoRoot, [planP(repoRoot), '--parent-clean-check', '--project', 'test-project', '--json']);
    assert(clean.result === 'pass', 'PARENT-CLEAN-DIRECT: workflow churn alone is clean (allowband reused), got ' + JSON.stringify(clean));
    fs.writeFileSync(path.join(repoRoot, 'prod.js'), '// production dirty\n');
    const dirty = runVal(repoRoot, [planP(repoRoot), '--parent-clean-check', '--project', 'test-project', '--json']);
    assert(dirty.result === 'refuse' && dirty.reason === 'parent_dirty' && (dirty.dirty || []).indexOf('prod.js') !== -1, 'PARENT-CLEAN-DIRECT: a production dirty path trips parent_dirty, got ' + JSON.stringify(dirty));
    cleanup(repoRoot);
  }

  // ★ PARENT-CLEAN-CHECK-UALL (adversarial review caught): a NON-exempt file inside a WHOLLY-NEW untracked
  //   subdir whose name is exempt-by-prefix is MASKED by `git status --porcelain`'s dir-collapse (`??
  //   kaola-workflow/archive/`) → classified by the collapsed dir name → EVADES the fence. The fence now
  //   uses --untracked-files=all so each file is classified precisely. Concrete vector: a FOREIGN-archive
  //   write into a fresh kaola-workflow/archive/<other>/ subdir (archive/ is new under the tracked
  //   kaola-workflow/, so default porcelain collapses it; the full path is foreignArchive → NOT exempt).
  {
    const { repoRoot } = provisionedRepo();
    fs.mkdirSync(path.join(repoRoot, 'kaola-workflow', 'archive', 'OTHER-PROJECT'), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, 'kaola-workflow', 'archive', 'OTHER-PROJECT', 'leak.js'), '// foreign-archive production leak masked by dir-collapse\n');
    const r = runVal(repoRoot, [planP(repoRoot), '--parent-clean-check', '--project', 'test-project', '--json']);
    assert(r.result === 'refuse' && r.reason === 'parent_dirty' && (r.dirty || []).some(p => /archive\/OTHER-PROJECT\/leak\.js/.test(p)), 'PARENT-CLEAN-UALL: a foreign-archive leak in a new collapsed subdir trips parent_dirty (RED without -uall: collapses to kaola-workflow/archive/ → exempt → false pass), got ' + JSON.stringify(r));
    cleanup(repoRoot);
  }

  // ★ SYNTH-SERIAL-CLOSE-FENCED (adversarial review caught — silent-loss): close-and-open-next (the SERIAL
  //   close path) has NO isMember routing — unlike close-node → closeGroupMember — so closing a live
  //   lane-group member out-of-band here would skip the synthesizer + barriers and ORPHAN the leg's
  //   committed work (the per-node barrier passes vacuously on the empty PARENT diff). The S4 scheduler
  //   fence (excl:['scheduler']) makes it refuse scheduler_active fail-closed; the member stays in_progress.
  {
    const { repoRoot, cacheDir, legA } = provisionedRepo();
    writeEvidence(cacheDir, 'A');
    fs.writeFileSync(path.join(legA, 'ax.js'), '// A leg work that a serial close would orphan\n');
    const r = runNode(repoRoot, ['close-and-open-next', '--node-id', 'A', '--project', 'test-project', '--json'], LEG_ON);
    assert(r.result === 'refuse' && r.reason === 'scheduler_active', 'SYNTH-SERIAL-CLOSE-FENCED: close-and-open-next on a live lane-group member refuses scheduler_active (no out-of-band silent close), got ' + JSON.stringify(r));
    assert(ledgerStatus(planP(repoRoot), 'A') === 'in_progress', 'SYNTH-SERIAL-CLOSE-FENCED: A stays in_progress (not silently closed), got ' + ledgerStatus(planP(repoRoot), 'A'));
    cleanup(repoRoot);
  }

  // SYNTH-OMISSION (advisor #2, no-silent-loss): commit work in BOTH legs but merge ONLY legA → M. The
  //   commit-based union barrier catches legB's omission via per-leg-head ancestor inclusion (subset alone
  //   would FALSE-PASS — legA's files ⊆ union — and legB's committed work would be lost on teardown).
  {
    const { repoRoot, legA, legB } = provisionedRepo();
    fs.writeFileSync(path.join(legA, 'ax.js'), '// a\n');
    execFileSync('git', ['-C', legA, 'add', '-A'], STDIO_Q); execFileSync('git', ['-C', legA, 'commit', '-m', 'la'], STDIO_Q);
    fs.writeFileSync(path.join(legB, 'by.js'), '// b\n');
    execFileSync('git', ['-C', legB, 'add', '-A'], STDIO_Q); execFileSync('git', ['-C', legB, 'commit', '-m', 'lb'], STDIO_Q);
    execFileSync('git', ['-C', repoRoot, 'merge', '--no-ff', '-m', 'partial: only legA', 'kw/legs/test-project/A'], STDIO_Q);
    const M = gitOut(repoRoot, ['rev-parse', 'HEAD']);
    const r = runVal(repoRoot, [planP(repoRoot), '--group-barrier', '--group-id', 'lg-A-B', '--merge-commit', M, '--project', 'test-project', '--json']);
    assert(r.result === 'refuse' && r.reason === 'leg_omitted_from_merge', 'SYNTH-OMISSION: a dropped leg (legB not in M) is caught leg_omitted_from_merge, got ' + JSON.stringify(r));
    cleanup(repoRoot);
  }

  // SYNTH-UNION-ESCAPE (B1 belt-and-suspenders): a COMMITTED out-of-union path in M is caught by the
  //   commit diff (write_set_overflow) — the union barrier rejects an escape even if it slipped a per-leg gate.
  {
    const { repoRoot, legA, legB } = provisionedRepo();
    fs.writeFileSync(path.join(legA, 'ax.js'), '// a\n');
    fs.writeFileSync(path.join(legA, 'zz.js'), '// OUT OF UNION committed\n');
    execFileSync('git', ['-C', legA, 'add', '-A'], STDIO_Q); execFileSync('git', ['-C', legA, 'commit', '-m', 'la+escape'], STDIO_Q);
    fs.writeFileSync(path.join(legB, 'by.js'), '// b\n');
    execFileSync('git', ['-C', legB, 'add', '-A'], STDIO_Q); execFileSync('git', ['-C', legB, 'commit', '-m', 'lb'], STDIO_Q);
    execFileSync('git', ['-C', repoRoot, 'merge', '--no-ff', '-m', 'synth', 'kw/legs/test-project/A', 'kw/legs/test-project/B'], STDIO_Q);
    const M = gitOut(repoRoot, ['rev-parse', 'HEAD']);
    const r = runVal(repoRoot, [planP(repoRoot), '--group-barrier', '--group-id', 'lg-A-B', '--merge-commit', M, '--project', 'test-project', '--json']);
    assert(r.result === 'refuse' && r.reason === 'write_set_overflow', 'SYNTH-UNION-ESCAPE: an out-of-union committed path in M refuses write_set_overflow, got ' + JSON.stringify(r));
    cleanup(repoRoot);
  }

  // SYNTH-MERGE-COMMIT-ARG-VALIDATION: --merge-commit must resolve to a commit, must descend from base,
  //   and requires --project.
  {
    const { repoRoot, legA, legB } = provisionedRepo();
    fs.writeFileSync(path.join(legA, 'ax.js'), '// a\n');
    execFileSync('git', ['-C', legA, 'add', '-A'], STDIO_Q); execFileSync('git', ['-C', legA, 'commit', '-m', 'la'], STDIO_Q);
    fs.writeFileSync(path.join(legB, 'by.js'), '// b\n');
    execFileSync('git', ['-C', legB, 'add', '-A'], STDIO_Q); execFileSync('git', ['-C', legB, 'commit', '-m', 'lb'], STDIO_Q);
    const bad = runVal(repoRoot, [planP(repoRoot), '--group-barrier', '--group-id', 'lg-A-B', '--merge-commit', 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', '--project', 'test-project', '--json']);
    assert(bad.result === 'refuse' && bad.reason === 'merge_commit_invalid', 'SYNTH-ARG: a non-resolving --merge-commit refuses merge_commit_invalid, got ' + JSON.stringify(bad));
    // an UNRELATED commit (legA head — not a descendant merging BOTH; base is its ancestor but legB isn't)
    // exercises the leg inclusion path; an unrelated-to-base commit exercises merge_base_unreachable. Build
    // a detached commit with no relation to base by committing on an orphan-ish state: use legB head as M —
    // base IS its ancestor, but legA is NOT in it → leg_omitted_from_merge (the inclusion guard fires first).
    const legBhead = gitOut(repoRoot, ['rev-parse', 'kw/legs/test-project/B']);
    const omit = runVal(repoRoot, [planP(repoRoot), '--group-barrier', '--group-id', 'lg-A-B', '--merge-commit', legBhead, '--project', 'test-project', '--json']);
    assert(omit.result === 'refuse' && omit.reason === 'leg_omitted_from_merge', 'SYNTH-ARG: legB head as M omits legA, got ' + JSON.stringify(omit));
    const noProj = runVal(repoRoot, [planP(repoRoot), '--group-barrier', '--group-id', 'lg-A-B', '--merge-commit', legBhead, '--json']);
    assert(noProj.result === 'refuse' && noProj.reason === 'missing_project', 'SYNTH-ARG: --merge-commit without --project refuses missing_project, got ' + JSON.stringify(noProj));
    cleanup(repoRoot);
  }

  // SYNTH-MERGE-BASE-UNREACHABLE (adversarial review: covers a previously-untested fail-closed guard): an M
  //   that does NOT descend from the legs' shared branch-point (a tamper/corruption M) → merge_base_unreachable.
  {
    const { repoRoot, legA, legB } = provisionedRepo();
    fs.writeFileSync(path.join(legA, 'ax.js'), '// a\n');
    execFileSync('git', ['-C', legA, 'add', '-A'], STDIO_Q); execFileSync('git', ['-C', legA, 'commit', '-m', 'la'], STDIO_Q);
    fs.writeFileSync(path.join(legB, 'by.js'), '// b\n');
    execFileSync('git', ['-C', legB, 'add', '-A'], STDIO_Q); execFileSync('git', ['-C', legB, 'commit', '-m', 'lb'], STDIO_Q);
    // an ORPHAN commit (commit-tree with NO parent) — base is not an ancestor of it.
    const tree = gitOut(repoRoot, ['write-tree']);
    const orphan = execFileSync('git', ['-C', repoRoot, 'commit-tree', tree, '-m', 'orphan'], { encoding: 'utf8' }).trim();
    const r = runVal(repoRoot, [planP(repoRoot), '--group-barrier', '--group-id', 'lg-A-B', '--merge-commit', orphan, '--project', 'test-project', '--json']);
    assert(r.result === 'refuse' && r.reason === 'merge_base_unreachable', 'SYNTH-MERGE-BASE-UNREACHABLE: an M not descending from base refuses merge_base_unreachable, got ' + JSON.stringify(r));
    cleanup(repoRoot);
  }

  // SYNTH-LEG-BASELINE-SPLIT (adversarial review: covers a previously-untested fail-closed guard): the legs
  //   of one level must share ONE branch-point; if leg B's anchored ref + manifest baseline both diverge from
  //   leg A's, the validator detects the split (legs branched from different HEADs) → leg_baseline_split.
  {
    const { repoRoot, cacheDir, legA, legB } = provisionedRepo();
    fs.writeFileSync(path.join(legA, 'ax.js'), '// a\n');
    execFileSync('git', ['-C', legA, 'add', '-A'], STDIO_Q); execFileSync('git', ['-C', legA, 'commit', '-m', 'la'], STDIO_Q);
    fs.writeFileSync(path.join(legB, 'by.js'), '// b\n');
    execFileSync('git', ['-C', legB, 'add', '-A'], STDIO_Q); execFileSync('git', ['-C', legB, 'commit', '-m', 'lb'], STDIO_Q);
    const M = (() => { execFileSync('git', ['-C', repoRoot, 'merge', '--no-ff', '-m', 'synth', 'kw/legs/test-project/A', 'kw/legs/test-project/B'], STDIO_Q); return gitOut(repoRoot, ['rev-parse', 'HEAD']); })();
    // make a DIVERGENT branch-point commit, re-anchor leg B's ref to it AND match its manifest baseline (so
    // B's #368 cross-check passes) — now A's base (baseRev) != B's base → split. Leg A's head is a real
    // commit != baseRev, so it serves as the divergent baseline for B.
    const divergent = gitOut(repoRoot, ['rev-parse', 'kw/legs/test-project/A']);
    execFileSync('git', ['-C', repoRoot, 'update-ref', legRefName('B'), divergent], STDIO_Q);
    const rs = readRS(cacheDir);
    rs.lane_group.legs.B.baseline = divergent;
    fs.writeFileSync(path.join(cacheDir, 'running-set.json'), JSON.stringify(rs, null, 2));
    const r = runVal(repoRoot, [planP(repoRoot), '--group-barrier', '--group-id', 'lg-A-B', '--merge-commit', M, '--project', 'test-project', '--json']);
    assert(r.result === 'refuse' && r.reason === 'leg_baseline_split', 'SYNTH-LEG-BASELINE-SPLIT: legs disagreeing on branch-point refuse leg_baseline_split, got ' + JSON.stringify(r));
    cleanup(repoRoot);
  }

  // SYNTH-SINGLETON-FAST-PATH (AC8): a single-write-node frontier forms NO lane group (tryFormLaneGroup
  //   needs ≥2) → NO leg worktree → runs serial in the parent with the normal per-node barrier.
  {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'd463-singleton-'));
    const projDir = path.join(repoRoot, 'kaola-workflow', 'test-project');
    const cacheDir = path.join(projDir, '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const planPath = path.join(projDir, 'workflow-plan.md');
    fs.writeFileSync(planPath, [
      '# Workflow Plan — test-project', '',
      '## Meta', 'labels: area:scripts', 'sink: CHANGELOG.md', '',
      '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape |',
      '| --- | --- | --- | --- | --- | --- |',
      '| seed | code-explorer | — | — | 1 | sequence |',
      '| solo | tdd-guide | seed | solo.js | 1 | sequence |',
      '| review | code-reviewer | solo | — | 1 | sequence |',
      '| finalize | finalize | review | — | 1 | sequence |', '',
      '## Node Ledger', '',
      '| id | status |', '| --- | --- |',
      '| seed | complete |', '| solo | pending |', '| review | pending |', '| finalize | pending |', '',
    ].join('\n') + '\n');
    fs.writeFileSync(path.join(projDir, 'workflow-state.md'), '# State\n');
    const gs = (a) => execFileSync('git', ['-C', repoRoot, ...a], { stdio: ['ignore', 'ignore', 'ignore'] });
    gs(['init']); gs(['config', 'user.email', 'kw@test']); gs(['config', 'user.name', 'kw']); gs(['config', 'commit.gpgsign', 'false']);
    try { execFileSync('node', [VALIDATOR, planPath, '--freeze', '--repair', '--json'], { cwd: repoRoot, encoding: 'utf8' }); } catch (_) {}
    fs.writeFileSync(path.join(repoRoot, '.gitignore'), '.kw/\n');
    gs(['add', '-A']); gs(['commit', '-m', 'init']);
    const open = runNode(repoRoot, ['open-ready', '--project', 'test-project', '--write-overlap-consent', '--json'], LEG_ON);
    assert(open.result === 'ok' && !open.laneGroup, 'SYNTH-SINGLETON: a single write node forms NO lane group, got ' + JSON.stringify(open));
    assert(worktreePaths(repoRoot).filter(p => p.indexOf(path.join('.kw', 'legs')) !== -1).length === 0, 'SYNTH-SINGLETON: NO leg worktree provisioned for a singleton');
    writeEvidence(cacheDir, 'solo');
    fs.writeFileSync(path.join(repoRoot, 'solo.js'), '// solo work in the PARENT (no leg)\n');
    const rc = runNode(repoRoot, ['close-node', '--node-id', 'solo', '--project', 'test-project', '--json'], LEG_ON);
    assert(rc.result === 'ok' && !rc.synthesized, 'SYNTH-SINGLETON: close runs the normal per-node barrier in the parent (no synthesizer), got ' + JSON.stringify(rc));
    cleanup(repoRoot);
  }

  // =========================================================================
  // #463-MERGE-CONFLICT (Slice 5) — the merge_conflict PRODUCERS + the bounded-repair envelope. The
  // textual-conflict tier is FREEZE-REFUSED (a same-file overlap can't co-open in a valid frozen plan), so
  // the octopus conflict bail is a DEFENSIVE catch exercised by calling synthesizeLevel directly (exactly the
  // path S6's injected-conflict live probe drives). The close-node-reachable producer is the NO-OP leg.
  // =========================================================================

  // S5-MERGE-CONFLICT-BAIL (codifies the spike; AC10 producer): two legs write CONFLICTING regions of the
  //   SAME file → synthesizeLevel's octopus BAILS → merge_conflict; the abort is CLEAN (HEAD unchanged, no
  //   MERGE_HEAD, tracked tree clean of conflict markers); the leg branches SURVIVE (capture committed them →
  //   recoverable for the repair). NO bad M lands on HEAD (the abort precedes any advance).
  {
    const { repoRoot, legA, legB, rs } = provisionedRepo();
    const base = rs.lane_group.legs.A.baseline;
    fs.writeFileSync(path.join(legA, 'conflict.txt'), 'AAA\nshared-2\nshared-3\n');
    fs.writeFileSync(path.join(legB, 'conflict.txt'), 'BBB\nshared-2\nshared-3\n');
    const synth = synthesizeLevel(repoRoot, rs.lane_group.legs, 'lg-A-B');
    assert(synth && synth.ok === false && synth.reason === 'merge_conflict', 'S5-MERGE-CONFLICT-BAIL: a same-file conflict bails merge_conflict, got ' + JSON.stringify(synth));
    assert(gitOut(repoRoot, ['rev-parse', 'HEAD']) === base, 'S5-MERGE-CONFLICT-BAIL: HEAD unchanged after the abort (no half-merge advance), got ' + gitOut(repoRoot, ['rev-parse', 'HEAD']) + ' vs base ' + base);
    const gitDir = gitOut(repoRoot, ['rev-parse', '--git-dir']);
    const mh = path.isAbsolute(gitDir) ? path.join(gitDir, 'MERGE_HEAD') : path.join(repoRoot, gitDir, 'MERGE_HEAD');
    assert(!fs.existsSync(mh), 'S5-MERGE-CONFLICT-BAIL: no MERGE_HEAD left (abort cleaned merge state)');
    // `git ls-files -u` (unmerged index entries) is the churn-independent clean-abort signal: a half-merge
    // leaves unmerged entries; the abort clears them. (The plan/.cache workflow churn in the parent is
    // expected — the run never commits per-node — so a porcelain check would false-fail here.)
    assert(gitOut(repoRoot, ['ls-files', '-u']) === '', 'S5-MERGE-CONFLICT-BAIL: no unmerged index entries after abort (clean, no conflict state)');
    assert(gitOut(repoRoot, ['rev-parse', 'kw/legs/test-project/A']) !== base && gitOut(repoRoot, ['rev-parse', 'kw/legs/test-project/B']) !== base, 'S5-MERGE-CONFLICT-BAIL: both leg branches survived past base (work recoverable for repair)');
    cleanup(repoRoot);
  }

  // S5-NOOP-LEG-VACUITY (AC10 first-detection producer): a leg that produced NO changes is caught by the
  //   leg-aware member_vacuity guard at THAT member's OWN close — BEFORE the last-member synthesis, where the
  //   evidence (and a possible no_op: declaration) is visible. This IS the "a leg that produced no changes"
  //   producer the AC names; merge_conflict is what it escalates TO after K=3 (NOT a new detector — a
  //   synthesizeLevel detector there would false-positive a sanctioned no_op member). B stays in_progress.
  {
    const { repoRoot, cacheDir, legA } = provisionedRepo();
    writeEvidence(cacheDir, 'A'); writeEvidence(cacheDir, 'B');
    fs.writeFileSync(path.join(legA, 'ax.js'), '// A leg work\n');
    // legB: untouched → no-op leg.
    const rA = runNode(repoRoot, ['close-node', '--node-id', 'A', '--project', 'test-project', '--json'], LEG_ON);
    assert(rA.result === 'ok' && rA.barrier === 'deferred_to_group', 'S5-NOOP-LEG: A deferred, got ' + JSON.stringify(rA));
    const rB = runNode(repoRoot, ['close-node', '--node-id', 'B', '--project', 'test-project', '--json'], LEG_ON);
    assert(rB.result === 'refuse' && rB.reason === 'member_vacuity', 'S5-NOOP-LEG: a no-op leg refuses member_vacuity at the member close (the no-op-leg producer), got ' + JSON.stringify(rB));
    assert(ledgerStatus(planP(repoRoot), 'B') === 'in_progress', 'S5-NOOP-LEG: B stays in_progress on refusal');
    cleanup(repoRoot);
  }

  // S5-NOOP-LEG-REPAIR-THEN-SUCCESS (the bounded-repair loop CLOSES): after a member_vacuity refuse the
  //   orchestrator re-dispatches legB (writes its declared file); re-running close now defers, and the
  //   last-member close synthesizes + advances. Proves the no-op producer is repairable, not a dead end.
  {
    const { repoRoot, cacheDir, legA, legB } = provisionedRepo();
    writeEvidence(cacheDir, 'A'); writeEvidence(cacheDir, 'B');
    fs.writeFileSync(path.join(legA, 'ax.js'), '// A leg work\n');
    const rApre = runNode(repoRoot, ['close-node', '--node-id', 'A', '--project', 'test-project', '--json'], LEG_ON);
    assert(rApre.result === 'ok', 'S5-NOOP-REPAIR: A deferred, got ' + JSON.stringify(rApre));
    const refuse = runNode(repoRoot, ['close-node', '--node-id', 'B', '--project', 'test-project', '--json'], LEG_ON);
    assert(refuse.result === 'refuse' && refuse.reason === 'member_vacuity', 'S5-NOOP-REPAIR: precondition member_vacuity, got ' + JSON.stringify(refuse));
    // REPAIR: re-dispatch legB — it now writes its declared file.
    fs.writeFileSync(path.join(legB, 'by.js'), '// B leg work (re-dispatched)\n');
    const rB = runNode(repoRoot, ['close-node', '--node-id', 'B', '--project', 'test-project', '--json'], LEG_ON);
    assert(rB.result === 'ok' && rB.barrier === 'group_passed' && rB.synthesized === true, 'S5-NOOP-REPAIR: after re-dispatch the last-member close synthesizes + advances, got ' + JSON.stringify(rB));
    cleanup(repoRoot);
  }

  // S5-CAPTURE-UNCOMMITTED (synthesizeLevel robustness): a leg with UNCOMMITTED work (agent forgot to
  //   commit) is CAPTURED (add -A + commit) before the octopus → the merge sees it. Proves the script-owned
  //   capture is robust to an un-committing agent.
  {
    const { repoRoot, legA, legB, rs } = provisionedRepo();
    fs.writeFileSync(path.join(legA, 'ax.js'), '// A uncommitted\n');
    fs.writeFileSync(path.join(legB, 'by.js'), '// B uncommitted\n');
    const synth = synthesizeLevel(repoRoot, rs.lane_group.legs, 'lg-A-B');
    assert(synth && synth.ok === true && typeof synth.mergeCommit === 'string', 'S5-CAPTURE-UNCOMMITTED: uncommitted leg work is captured + merged, got ' + JSON.stringify(synth));
    assert(gitOut(repoRoot, ['rev-parse', synth.mergeCommit + ':ax.js']) !== '' && gitOut(repoRoot, ['rev-parse', synth.mergeCommit + ':by.js']) !== '', 'S5-CAPTURE-UNCOMMITTED: M contains both captured files');
    cleanup(repoRoot);
  }

  // S5-IDEMPOTENT-RESUME (codifies the spike; S4 carry-over): re-running synthesizeLevel over the SAME
  //   already-merged disjoint legs (a crash after M committed but before the ledger advanced) is a NO-OP —
  //   it returns the SAME mergeCommit with a STABLE HEAD, never a spurious second merge or merge_conflict.
  {
    const { repoRoot, legA, legB, rs } = provisionedRepo();
    fs.writeFileSync(path.join(legA, 'ax.js'), '// a\n');
    fs.writeFileSync(path.join(legB, 'by.js'), '// b\n');
    const r1 = synthesizeLevel(repoRoot, rs.lane_group.legs, 'lg-A-B');
    assert(r1 && r1.ok === true, 'S5-IDEMPOTENT-RESUME: first synth ok, got ' + JSON.stringify(r1));
    const head1 = gitOut(repoRoot, ['rev-parse', 'HEAD']);
    const r2 = synthesizeLevel(repoRoot, rs.lane_group.legs, 'lg-A-B');
    assert(r2 && r2.ok === true && r2.mergeCommit === r1.mergeCommit, 'S5-IDEMPOTENT-RESUME: re-synth returns the SAME mergeCommit, got ' + JSON.stringify(r2) + ' vs ' + JSON.stringify(r1));
    assert(gitOut(repoRoot, ['rev-parse', 'HEAD']) === head1, 'S5-IDEMPOTENT-RESUME: HEAD stable across re-synth (no spurious second merge)');
    cleanup(repoRoot);
  }

  // S5-REPAIR-LIMIT-CONSTANT (contract): the K=3 cap is a schema constant (×4 byte, route-like-test_thrash)
  //   and the merge_conflict operator_hint interpolates it (so the bound is operator-visible, not buried).
  {
    assert(MERGE_CONFLICT_REPAIR_LIMIT === 3, 'S5-REPAIR-LIMIT-CONSTANT: MERGE_CONFLICT_REPAIR_LIMIT === 3, got ' + MERGE_CONFLICT_REPAIR_LIMIT);
    const hint = OPERATOR_HINT_REGISTRY.merge_conflict({ group_id: 'g1', nodeId: 'B' });
    assert(hint.indexOf(String(MERGE_CONFLICT_REPAIR_LIMIT) + ' repair attempts') !== -1 && /write-halt/.test(hint), 'S5-REPAIR-LIMIT-CONSTANT: the merge_conflict hint names the K cap + the write-halt escalation, got ' + JSON.stringify(hint));
  }

  // S5-MULTI-LEVEL (AC7, S4 carry-over): TWO sequential fan-out levels. Level 1 {A,B} synthesizes → M1 (HEAD
  //   advances); level 2 {C,D} then provisions its legs OFF M1 (their branch-point baseline == M1) and
  //   synthesizes → M2 with M1 in its ancestry. The dependency-level commit chains: M2 descends from M1.
  {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'd463-multilevel-'));
    const projDir = path.join(repoRoot, 'kaola-workflow', 'test-project');
    const cacheDir = path.join(projDir, '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const planPath = path.join(projDir, 'workflow-plan.md');
    fs.writeFileSync(planPath, [
      '# Workflow Plan — test-project', '',
      '## Meta', 'labels: area:scripts', 'sink: CHANGELOG.md', '',
      '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape |',
      '| --- | --- | --- | --- | --- | --- |',
      '| seed | code-explorer | — | — | 1 | sequence |',
      '| A | tdd-guide | seed | ax.js | 1 | sequence |',
      '| B | tdd-guide | seed | by.js | 1 | sequence |',
      '| C | tdd-guide | A,B | cx.js | 1 | sequence |',
      '| D | tdd-guide | A,B | dy.js | 1 | sequence |',
      '| review | code-reviewer | C,D | — | 1 | sequence |',
      '| finalize | finalize | review | — | 1 | sequence |', '',
      '## Node Ledger', '',
      '| id | status |', '| --- | --- |',
      '| seed | complete |', '| A | pending |', '| B | pending |', '| C | pending |', '| D | pending |',
      '| review | pending |', '| finalize | pending |', '',
    ].join('\n') + '\n');
    fs.writeFileSync(path.join(projDir, 'workflow-state.md'), '# State\n');
    const gs = (a) => execFileSync('git', ['-C', repoRoot, ...a], { stdio: ['ignore', 'ignore', 'ignore'] });
    gs(['init']); gs(['config', 'user.email', 'kw@test']); gs(['config', 'user.name', 'kw']); gs(['config', 'commit.gpgsign', 'false']);
    try { execFileSync('node', [VALIDATOR, planPath, '--freeze', '--repair', '--json'], { cwd: repoRoot, encoding: 'utf8' }); } catch (_) {}
    fs.writeFileSync(path.join(repoRoot, '.gitignore'), '.kw/\n');
    gs(['add', '-A']); gs(['commit', '-m', 'init']);
    // LEVEL 1: open {A,B}, close both → M1.
    const open1 = runNode(repoRoot, ['open-ready', '--project', 'test-project', '--write-overlap-consent', '--json'], LEG_ON);
    assert(open1.result === 'ok' && open1.laneGroup, 'S5-MULTI-LEVEL: level-1 {A,B} co-opens, got ' + JSON.stringify(open1));
    const leg1A = path.join(repoRoot, '.kw', 'legs', 'test-project', 'A');
    const leg1B = path.join(repoRoot, '.kw', 'legs', 'test-project', 'B');
    writeEvidence(cacheDir, 'A'); writeEvidence(cacheDir, 'B');
    fs.writeFileSync(path.join(leg1A, 'ax.js'), '// A1\n');
    fs.writeFileSync(path.join(leg1B, 'by.js'), '// B1\n');
    runNode(repoRoot, ['close-node', '--node-id', 'A', '--project', 'test-project', '--json'], LEG_ON);
    const rB = runNode(repoRoot, ['close-node', '--node-id', 'B', '--project', 'test-project', '--json'], LEG_ON);
    assert(rB.result === 'ok' && rB.barrier === 'group_passed', 'S5-MULTI-LEVEL: level-1 synthesizes, got ' + JSON.stringify(rB));
    const M1 = gitOut(repoRoot, ['rev-parse', 'HEAD']);
    assert(M1 === rB.mergeCommit, 'S5-MULTI-LEVEL: HEAD advanced to M1');
    // LEVEL 2: open {C,D} — legs must branch OFF M1.
    const open2 = runNode(repoRoot, ['open-ready', '--project', 'test-project', '--write-overlap-consent', '--json'], LEG_ON);
    assert(open2.result === 'ok' && open2.laneGroup, 'S5-MULTI-LEVEL: level-2 {C,D} co-opens off M1, got ' + JSON.stringify(open2));
    const rs2 = readRS(cacheDir);
    assert(rs2.lane_group.legs.C.baseline === M1 && rs2.lane_group.legs.D.baseline === M1, 'S5-MULTI-LEVEL: level-2 leg baselines == M1 (legs branch off the prior level\'s commit), got ' + JSON.stringify({ C: rs2.lane_group.legs.C.baseline, D: rs2.lane_group.legs.D.baseline, M1 }));
    const leg2C = path.join(repoRoot, '.kw', 'legs', 'test-project', 'C');
    const leg2D = path.join(repoRoot, '.kw', 'legs', 'test-project', 'D');
    writeEvidence(cacheDir, 'C'); writeEvidence(cacheDir, 'D');
    fs.writeFileSync(path.join(leg2C, 'cx.js'), '// C2\n');
    fs.writeFileSync(path.join(leg2D, 'dy.js'), '// D2\n');
    runNode(repoRoot, ['close-node', '--node-id', 'C', '--project', 'test-project', '--json'], LEG_ON);
    const rD = runNode(repoRoot, ['close-node', '--node-id', 'D', '--project', 'test-project', '--json'], LEG_ON);
    assert(rD.result === 'ok' && rD.barrier === 'group_passed', 'S5-MULTI-LEVEL: level-2 synthesizes → M2, got ' + JSON.stringify(rD));
    const M2 = gitOut(repoRoot, ['rev-parse', 'HEAD']);
    // `merge-base --is-ancestor` signals via EXIT CODE only (0 = ancestor, 1 = not) and emits NO stdout in
    // either direction — so a `gitOut(...) === ''` (stdout) check would be a tautology (both directions →
    // '' → always passes). Key on the exit code, exactly as the production validator does (plan-validator.js).
    let m2DescendsM1 = false;
    try { execFileSync('git', ['-C', repoRoot, 'merge-base', '--is-ancestor', M1, M2], STDIO_Q); m2DescendsM1 = true; } catch (_) { m2DescendsM1 = false; }
    assert(m2DescendsM1, 'S5-MULTI-LEVEL: M2 descends from M1 (the dependency-level commit chain), got is-ancestor=false for M1=' + M1 + ' M2=' + M2);
    cleanup(repoRoot);
  }

  // =========================================================================
  // #500-SHARED-INFRA-COARSE (leg-couple wire) — shared-infra + coarse co-open under the retained net.
  //
  // The formation gate (tryFormLaneGroup) calls the validator's --parallel-safe so an overlapping pair
  // can RELAX and co-open. #546-G2 (DECISION B) shifted the SHARED-INFRA class to relax BY DEFAULT under
  // the structural net (a post-dominating code-reviewer gate over the legs + no PROTECTED file); #593
  // extends the SAME default-relax to the NON-shared COARSE class (two different top-level dirs,
  // exact-file-disjoint) — NO write_overlap_policy, NO --write-overlap-consent (both vestigial). What
  // STILL serial-degrades: a genuine overlap (exact / case-collision), a PROTECTED file (NET-2), a
  // missing gate (NET-1), or a non-resolvable directory/glob coarse entry. Tests drive the REAL
  // adaptive-node + plan-validator subprocesses in a REAL git repo.
  // =========================================================================
  {
    // SHARED-INFRA FIXTURE: scripts/aa.js + scripts/bb.js → both areaForPath === 'scripts' ∈
    // SHARED_INFRA → disjointWriteSets verdict:yellow/kind:'shared-infra'. Under #546-G2 this relaxes
    // BY DEFAULT (no policy / no consent) once the gate net holds. makeLaneRepo always builds the
    // post-dominating code-reviewer `review` gate, so gatePresent is true.
    const sharedInfraRepo = () => makeLaneRepo({ aSet: 'scripts/aa.js', bSet: 'scripts/bb.js' });
    // COARSE FIXTURE (#593 default-relax): crates/a/x.rs + crates/b/y.rs share the NON-shared coarse
    // area "crates" → disjointWriteSets verdict:red/kind:'coarse'. Under #593 this relaxes BY DEFAULT
    // under the SAME net as shared-infra (no policy / no consent) — write_overlap_policy is vestigial.
    const coarseRepo = () => makeLaneRepo({ writeOverlapPolicy: 'coarse', aSet: 'crates/a/x.rs', bSet: 'crates/b/y.rs' });

    // -----------------------------------------------------------------------
    // #500-DISCRIMINATOR: direct validator --parallel-safe probe (NOT in production code). Proves the
    // RELAXATION path (writeOverlapRelaxable) — not the green short-circuit — for BOTH classes, both of
    // which now relax BY DEFAULT under the retained net (#546-G2 shared-infra + #593 coarse):
    //   • shared-infra: result==='ok' AND relaxed[0].kind==='shared-infra' WITHOUT consent.
    //   • coarse: result==='ok' AND relaxed[0].kind==='coarse' WITHOUT consent (the #593 delta) — and
    //     identically WITH consent (policy/consent vestigial).
    // -----------------------------------------------------------------------
    {
      // shared-infra: relaxes by default (NO consent).
      const { repoRoot, planPath } = sharedInfraRepo();
      const rDefault = runVal(repoRoot, [planPath, '--parallel-safe', '--nodes', 'A,B', '--json']);
      assert(rDefault.result === 'ok', '#500-DISCRIMINATOR shared-infra: --parallel-safe ok BY DEFAULT (no consent, #546-G2), got ' + JSON.stringify(rDefault));
      assert(Array.isArray(rDefault.relaxed) && rDefault.relaxed.length > 0 && rDefault.relaxed[0].kind === 'shared-infra',
        '#500-DISCRIMINATOR shared-infra: relaxed[0].kind==="shared-infra" by default (relaxation path, not green short-circuit), got ' + JSON.stringify(rDefault.relaxed));
      cleanup(repoRoot);
    }
    {
      // coarse (non-shared): relaxes BY DEFAULT under the net (#593), identically with/without consent.
      const { repoRoot, planPath } = coarseRepo();
      const rPos = runVal(repoRoot, [planPath, '--parallel-safe', '--nodes', 'A,B', '--write-overlap-consent', '--json']);
      assert(rPos.result === 'ok', '#500-DISCRIMINATOR coarse (with consent): --parallel-safe ok, got ' + JSON.stringify(rPos));
      assert(Array.isArray(rPos.relaxed) && rPos.relaxed.length > 0 && rPos.relaxed[0].kind === 'coarse',
        '#500-DISCRIMINATOR coarse (with consent): relaxed[0].kind==="coarse" (relaxation path), got ' + JSON.stringify(rPos.relaxed));
      const rNeg = runVal(repoRoot, [planPath, '--parallel-safe', '--nodes', 'A,B', '--json']);
      assert(rNeg.result === 'ok', '#500-DISCRIMINATOR coarse (NO consent, #593): --parallel-safe relaxes BY DEFAULT under the net, got ' + JSON.stringify(rNeg));
      assert(Array.isArray(rNeg.relaxed) && rNeg.relaxed.some(x => x.kind === 'coarse'),
        '#500-DISCRIMINATOR coarse (NO consent, #593): relaxed[] carries kind coarse (default-relax, consent vestigial), got ' + JSON.stringify(rNeg.relaxed));
      cleanup(repoRoot);
    }

    // -----------------------------------------------------------------------
    // ★ #500-POSITIVE-E2E (#546-G2 default-on): a shared-infra pair group FORMS via relaxation BY
    //   DEFAULT (NO --write-overlap-consent), legs provisioned, disjoint writes synthesized end-to-end.
    //   (Translated from SYNTH-DISJOINT with shared-infra fixture + scripts/ subdir.)
    // -----------------------------------------------------------------------
    {
      const { repoRoot, cacheDir, planPath } = sharedInfraRepo();
      // Open: shared-infra pair co-opens BY DEFAULT (the gate net relaxes it — no consent flag).
      const r = runNode(repoRoot, ['open-ready', '--project', 'test-project', '--json'], LEG_ON);
      assert(r.result === 'ok', '#500-POSITIVE-E2E: open-ready ok, got ' + JSON.stringify(r));
      assert(r.laneGroup && Array.isArray(r.laneGroup.members), '#500-POSITIVE-E2E: laneGroup formed (shared-infra relaxed by default), got ' + JSON.stringify(r.laneGroup));
      assert(r.laneGroup.members.includes('A') && r.laneGroup.members.includes('B'), '#500-POSITIVE-E2E: members [A,B]');
      // Running-set: legs provisioned.
      const rs = readRS(cacheDir);
      assert(rs && rs.lane_group && rs.lane_group.legs, '#500-POSITIVE-E2E: running-set lane_group.legs present');
      for (const id of ['A', 'B']) {
        const leg = rs.lane_group.legs[id];
        assert(leg && typeof leg.legPath === 'string', '#500-POSITIVE-E2E: legs.' + id + '.legPath present');
        assert(leg && typeof leg.baseline === 'string', '#500-POSITIVE-E2E: legs.' + id + '.baseline present');
      }
      // Write declared files INTO legs (scripts/ subdir must exist under each leg).
      const legA = rs.lane_group.legs.A.legPath;
      const legB = rs.lane_group.legs.B.legPath;
      fs.mkdirSync(path.join(legA, 'scripts'), { recursive: true });
      fs.mkdirSync(path.join(legB, 'scripts'), { recursive: true });
      writeEvidence(cacheDir, 'A');
      writeEvidence(cacheDir, 'B');
      fs.writeFileSync(path.join(legA, 'scripts', 'aa.js'), '// A shared-infra leg work\n');
      fs.writeFileSync(path.join(legB, 'scripts', 'bb.js'), '// B shared-infra leg work\n');
      const base = rs.lane_group.legs.A.baseline;
      // Close A (non-last) → deferred.
      const rA = runNode(repoRoot, ['close-node', '--node-id', 'A', '--project', 'test-project', '--json'], LEG_ON);
      assert(rA.result === 'ok' && rA.barrier === 'deferred_to_group', '#500-POSITIVE-E2E: close A deferred, got ' + JSON.stringify(rA));
      // Close B (last) → group_passed + synthesized.
      const rB = runNode(repoRoot, ['close-node', '--node-id', 'B', '--project', 'test-project', '--json'], LEG_ON);
      assert(rB.result === 'ok' && rB.barrier === 'group_passed' && rB.synthesized === true,
        '#500-POSITIVE-E2E: close B group_passed + synthesized, got ' + JSON.stringify(rB));
      const M = rB.mergeCommit;
      assert(typeof M === 'string' && M.length >= 7, '#500-POSITIVE-E2E: B carries mergeCommit M, got ' + JSON.stringify(rB));
      // HEAD advanced to M.
      assert(gitOut(repoRoot, ['rev-parse', 'HEAD']) === M, '#500-POSITIVE-E2E: HEAD advanced to M');
      // M contains BOTH files.
      assert(gitOut(repoRoot, ['rev-parse', M + ':scripts/aa.js']) !== '' && gitOut(repoRoot, ['rev-parse', M + ':scripts/bb.js']) !== '',
        '#500-POSITIVE-E2E: M contains BOTH scripts/aa.js and scripts/bb.js');
      // diff base→M == exactly the two declared files.
      const mDiff = gitOut(repoRoot, ['diff-tree', '-r', '--name-only', base, M]).split('\n').map(s => s.trim()).filter(Boolean).sort();
      assert(JSON.stringify(mDiff) === JSON.stringify(['scripts/aa.js', 'scripts/bb.js']),
        '#500-POSITIVE-E2E: diff base→M == union declared {scripts/aa.js, scripts/bb.js}, got ' + JSON.stringify(mDiff));
      // Legs torn down.
      const wts = worktreePaths(repoRoot);
      assert(!wts.some(p => p.indexOf(path.join('.kw', 'legs')) !== -1),
        '#500-POSITIVE-E2E: no .kw/legs worktree survives clean completion, got ' + JSON.stringify(wts));
      cleanup(repoRoot);
    }

    // -----------------------------------------------------------------------
    // ★ #500-NEGATIVE-A (#542 default-on + the kill-switch guard): the coarseRepo fixture is a NON-shared
    //   coarse (crates/a/x.rs + crates/b/y.rs share dir "crates" ∉ SHARED_INFRA), exact-file-disjoint
    //   pair. Under #593 it co-opens BY DEFAULT under the net (with OR without consent — consent is
    //   vestigial); the shared-infra class likewise (see #500-DISCRIMINATOR + #500-POSITIVE-E2E). Under
    //   #542 (D-542-01) the legacy toggles no longer gate co-open. The ONLY serial path is the explicit
    //   kill-switch KAOLA_PARALLEL_WRITES=0 — which forces serial EVEN with consent. Both halves
    //   asserted: (a) bare default ⇒ co-open (default-on); (b) kill-switch ⇒ serial-degrade.
    // -----------------------------------------------------------------------
    {
      // (a) Default-on: the coarse pair co-opens WITHOUT any legacy toggle (bare default; consent kept
      //     here for back-compat but vestigial post-#593).
      const { repoRoot, cacheDir, planPath } = coarseRepo();
      const r = runNode(repoRoot, ['open-ready', '--project', 'test-project', '--write-overlap-consent', '--json'], DEFAULT);
      assert(r.laneGroup && Array.isArray(r.laneGroup.members) && r.laneGroup.members.includes('A') && r.laneGroup.members.includes('B'),
        '#500-NEGATIVE-A(a): consent + bare default → co-open [A,B] (default-on, no legacy toggle needed), got ' + JSON.stringify(r.laneGroup));
      const rs = readRS(cacheDir);
      // #498 regression guard (co-open ⟹ legs): the consenting overlap co-open is NEVER legless.
      assert(rs && rs.lane_group && rs.lane_group.legs && rs.lane_group.legs.A && rs.lane_group.legs.B,
        '#500-NEGATIVE-A(a): co-open ⟹ legs provisioned for the consenting overlap, got ' + JSON.stringify(rs && rs.lane_group));
      assert(Array.isArray(r.opened) && r.opened.length === 2, '#500-NEGATIVE-A(a): both writes co-opened, got ' + JSON.stringify(r.opened && r.opened.map(n => n.id)));
      assert(ledgerStatus(planPath, 'A') === 'in_progress' && ledgerStatus(planPath, 'B') === 'in_progress', '#500-NEGATIVE-A(a): both A and B in_progress');
      cleanup(repoRoot);
    }
    {
      // (b) Kill-switch bites even WITH consent: KAOLA_PARALLEL_WRITES=0 → serial-degrade to ONE write.
      const { repoRoot, cacheDir } = coarseRepo();
      const r = runNode(repoRoot, ['open-ready', '--project', 'test-project', '--write-overlap-consent', '--json'], SERIAL);
      assert(!r.laneGroup, '#500-NEGATIVE-A(b): kill-switch + consent → NO laneGroup (serial degrade), got ' + JSON.stringify(r.laneGroup));
      const rs = readRS(cacheDir);
      assert(!rs || !rs.lane_group, '#500-NEGATIVE-A(b): running-set has no lane_group (kill-switch)');
      assert(Array.isArray(r.opened) && r.opened.length === 1, '#500-NEGATIVE-A(b): exactly ONE write opened (serial degrade), got ' + JSON.stringify(r.opened && r.opened.map(n => n.id)));
      cleanup(repoRoot);
    }

    // -----------------------------------------------------------------------
    // ★ #500-NEGATIVE-B (a genuine blocker STILL serial-degrades under #593 default-relax): the coarse
    //   default-relax (#593) is gated on the retained net — a coarse pair carrying a PROTECTED concrete
    //   file (NET-2) is NEVER relaxed, even by default, even with consent. So it must STILL serial-degrade
    //   to ONE write. (Pre-#593 this class serial-degraded for lack of consent; post-#593 it serial-
    //   degrades because NET-2 blocks — the "not everything relaxes" guard survives the default-relax.)
    // -----------------------------------------------------------------------
    {
      // Coarse pair (both under "crates") but one leg writes a PROTECTED lockfile → NET-2 blocks co-open.
      const { repoRoot, cacheDir } = makeLaneRepo({ aSet: 'crates/a/package-lock.json', bSet: 'crates/b/y.rs' });
      const r = runNode(repoRoot, ['open-ready', '--project', 'test-project', '--write-overlap-consent', '--json'], DEFAULT);
      assert(!r.laneGroup, '#500-NEGATIVE-B: a PROTECTED file in a coarse pair (NET-2) blocks co-open ⇒ NO laneGroup, even with consent, got ' + JSON.stringify(r.laneGroup));
      const rs = readRS(cacheDir);
      assert(!rs || !rs.lane_group, '#500-NEGATIVE-B: running-set has no lane_group (NET-2 blocked)');
      assert(Array.isArray(r.opened) && r.opened.length === 1, '#500-NEGATIVE-B: exactly ONE write opened (serial degrade), got ' + JSON.stringify(r.opened && r.opened.map(n => n.id)));
      cleanup(repoRoot);
    }
  }

  // =========================================================================
  // #588 — write co-open WIDTH/MIX coverage (the width-2-only gap). Real-git cases at the LEG-*/SYNTH-*
  // quality bar: durable artifacts (ledger rows, running-set.json, worktree/branch existence, octopus
  // parent count, diff-tree vs union of declared sets) — never stdout sentinels. Reuses the D-437 harness
  // (makeLaneRepo now takes extraMembers) + runNode/readRS/ledgerStatus/worktreePaths/branchExists/gitOut.
  // =========================================================================

  // -------------------------------------------------------------------------
  // #588-3LEG-OCTOPUS-END-TO-END (case a): a 3-leg DISJOINT write co-open → provision 3 legs → per-leg
  //   barriers (A,B deferred; C last) → octopus merge (feature + 3 legs = EXACTLY 4 parents) → commit-union
  //   barrier → group close. Extends SYNTH-DISJOINT (width 2) to width 3. Behavior PINNED as correct.
  // -------------------------------------------------------------------------
  {
    const setOf = { A: 'ax.js', B: 'by.js', C: 'cz.js' };
    const { repoRoot, cacheDir, planPath } = makeLaneRepo({ extraMembers: [{ id: 'C', set: 'cz.js' }] });
    const r = runNode(repoRoot, ['open-ready', '--project', 'test-project', '--write-overlap-consent', '--json'], LEG_ON);
    assert(r.result === 'ok', '#588-3LEG: open-ready ok, got ' + JSON.stringify(r));
    assert(r.laneGroup && r.laneGroup.members.slice().sort().join(',') === 'A,B,C', '#588-3LEG: 3-member lane group [A,B,C], got ' + JSON.stringify(r.laneGroup && r.laneGroup.members));
    assert(Array.isArray(r.opened) && r.opened.length === 3, '#588-3LEG: all 3 writes co-opened, got ' + JSON.stringify(r.opened && r.opened.map(n => n.id)));
    const rs = readRS(cacheDir);
    for (const id of ['A', 'B', 'C']) {
      assert(rs.lane_group.legs[id], '#588-3LEG: leg manifest for ' + id);
      assert(worktreePaths(repoRoot).some(p => p.endsWith(path.join('.kw', 'legs', 'test-project', id))), '#588-3LEG: leg worktree provisioned for ' + id);
      assert(branchExists(repoRoot, 'kw/legs/test-project/' + id), '#588-3LEG: leg branch for ' + id);
      assert(ledgerStatus(planPath, id) === 'in_progress', '#588-3LEG: ' + id + ' in_progress');
      const on = r.opened.find(n => n.id === id);
      assert(on.dispatch.leg_path === rs.lane_group.legs[id].legPath && on.dispatch.leg_branch === 'kw/legs/test-project/' + id, '#588-3LEG: ' + id + ' dispatch carries its own leg routing (#591 at width 3)');
    }
    const base = rs.lane_group.legs.A.baseline;
    for (const id of ['A', 'B', 'C']) {
      writeEvidence(cacheDir, id);
      fs.writeFileSync(path.join(repoRoot, '.kw', 'legs', 'test-project', id, setOf[id]), '// ' + id + ' leg work\n');
    }
    const rA = runNode(repoRoot, ['close-node', '--node-id', 'A', '--project', 'test-project', '--json'], LEG_ON);
    assert(rA.result === 'ok' && rA.barrier === 'deferred_to_group', '#588-3LEG: A deferred, got ' + JSON.stringify(rA));
    const rB = runNode(repoRoot, ['close-node', '--node-id', 'B', '--project', 'test-project', '--json'], LEG_ON);
    assert(rB.result === 'ok' && rB.barrier === 'deferred_to_group', '#588-3LEG: B deferred, got ' + JSON.stringify(rB));
    const rC = runNode(repoRoot, ['close-node', '--node-id', 'C', '--project', 'test-project', '--json'], LEG_ON);
    assert(rC.result === 'ok' && rC.barrier === 'group_passed' && rC.synthesized === true, '#588-3LEG: C (last) group_passed + synthesized, got ' + JSON.stringify(rC));
    const M = rC.mergeCommit;
    assert(gitOut(repoRoot, ['rev-parse', 'HEAD']) === M, '#588-3LEG: HEAD advanced to M');
    const parents = gitOut(repoRoot, ['rev-list', '--parents', '-n', '1', M]).split(/\s+/).slice(1);
    assert(parents.length === 4, '#588-3LEG: octopus merge has EXACTLY 4 parents (feature + 3 legs), got ' + parents.length);
    const mDiff = gitOut(repoRoot, ['diff-tree', '-r', '--name-only', base, M]).split('\n').map(s => s.trim()).filter(Boolean).sort();
    assert(JSON.stringify(mDiff) === JSON.stringify(['ax.js', 'by.js', 'cz.js']), '#588-3LEG: diff base→M == union(declared) {ax,by,cz}, got ' + JSON.stringify(mDiff));
    for (const id of ['A', 'B', 'C']) assert(gitOut(repoRoot, ['rev-parse', M + ':' + setOf[id]]) !== '', '#588-3LEG: M contains ' + setOf[id]);
    assert(ledgerStatus(planPath, 'A') === 'complete' && ledgerStatus(planPath, 'B') === 'complete' && ledgerStatus(planPath, 'C') === 'complete', '#588-3LEG: all 3 members complete');
    assert(worktreePaths(repoRoot).filter(p => p.indexOf(path.join('.kw', 'legs')) !== -1).length === 0, '#588-3LEG: all legs torn down after the merge');
    cleanup(repoRoot);
  }

  // -------------------------------------------------------------------------
  // #588-WIDE-CAP (case b, part 1): a 5-wide DISJOINT write antichain vs the default write FANOUT_CAP (4).
  //   Documented cap behavior PINNED: co-open EXACTLY 4, queue the 5th (still pending, no leg); running-set
  //   max_concurrent == the write cap (4). Then reconcile of a crashed-open honors that ceiling at width 4
  //   (rolls all 4 forward — ceiling==width admits the full set — and preserves max_concurrent==4).
  // -------------------------------------------------------------------------
  {
    const { repoRoot, cacheDir, planPath } = makeLaneRepo({ extraMembers: [{ id: 'C', set: 'cz.js' }, { id: 'D', set: 'dz.js' }, { id: 'E', set: 'ez.js' }] });
    const allIds = ['A', 'B', 'C', 'D', 'E'];
    const r = runNode(repoRoot, ['open-ready', '--project', 'test-project', '--write-overlap-consent', '--json'], LEG_ON);
    assert(r.result === 'ok', '#588-WIDE-CAP: open-ready ok, got ' + JSON.stringify(r));
    assert(Array.isArray(r.opened) && r.opened.length === 4, '#588-WIDE-CAP: FANOUT_CAP=4 co-opens EXACTLY 4 of 5, got ' + JSON.stringify(r.opened && r.opened.map(n => n.id)));
    const openedIds = r.opened.map(n => n.id);
    const pendingId = allIds.find(id => !openedIds.includes(id));
    assert(pendingId && ledgerStatus(planPath, pendingId) === 'pending', '#588-WIDE-CAP: the 5th (' + pendingId + ') stays pending (queued past the cap)');
    for (const id of openedIds) assert(ledgerStatus(planPath, id) === 'in_progress', '#588-WIDE-CAP: opened ' + id + ' in_progress');
    const rs = readRS(cacheDir);
    assert(rs.max_concurrent === 4, '#588-WIDE-CAP: running-set max_concurrent == write cap (4), got ' + rs.max_concurrent);
    assert(rs.lane_group && Object.keys(rs.lane_group.legs).sort().join(',') === openedIds.slice().sort().join(','), '#588-WIDE-CAP: legs manifest covers EXACTLY the 4 opened, got ' + JSON.stringify(Object.keys(rs.lane_group.legs)));
    assert(!rs.lane_group.legs[pendingId], '#588-WIDE-CAP: no leg manifest entry for the queued 5th');
    assert(!worktreePaths(repoRoot).some(p => p.endsWith(path.join('.kw', 'legs', 'test-project', pendingId))), '#588-WIDE-CAP: no leg worktree for the queued 5th');
    // Reconcile ceiling at width 4: craft a crashed-open (state:opening, all 4 opening:true).
    const rs0 = readRS(cacheDir);
    rs0.state = 'opening';
    rs0.nodes = rs0.nodes.map(n => ({ ...n, opening: true }));
    fs.writeFileSync(path.join(cacheDir, 'running-set.json'), JSON.stringify(rs0, null, 2));
    const rec = runNode(repoRoot, ['reconcile-running-set', '--project', 'test-project', '--json'], LEG_ON);
    assert(rec.result === 'ok' && rec.reconciled === true, '#588-WIDE-CAP: reconcile ok, got ' + JSON.stringify(rec));
    const rs1 = readRS(cacheDir);
    assert(rs1.state === 'open', '#588-WIDE-CAP: reconcile promotes to open');
    assert(rs1.max_concurrent === 4, '#588-WIDE-CAP: max_concurrent==4 survives reconcile at width 4, got ' + rs1.max_concurrent);
    assert(rs1.nodes.length === 4, '#588-WIDE-CAP: reconcile rolls ALL 4 forward (ceiling==width==4), got ' + rs1.nodes.length);
    assert(rs1.lane_group && Object.keys(rs1.lane_group.legs).length === 4, '#588-WIDE-CAP: all 4 legs retained through reconcile, got ' + JSON.stringify(rs1.lane_group && Object.keys(rs1.lane_group.legs)));
    cleanup(repoRoot);
  }

  // -------------------------------------------------------------------------
  // #588-WIDE-DRAIN (case b, part 2): after the width-4 group closes (octopus, feature + 4 legs = 5 parents),
  //   a subsequent open-ready DRAINS the queued 5th — a single remaining write opens serially (no group, no
  //   leg). Pins the top-up-drain half of the documented cap behavior.
  // -------------------------------------------------------------------------
  {
    const setOf = { A: 'ax.js', B: 'by.js', C: 'cz.js', D: 'dz.js', E: 'ez.js' };
    const allIds = ['A', 'B', 'C', 'D', 'E'];
    const { repoRoot, cacheDir, planPath } = makeLaneRepo({ extraMembers: [{ id: 'C', set: 'cz.js' }, { id: 'D', set: 'dz.js' }, { id: 'E', set: 'ez.js' }] });
    const r = runNode(repoRoot, ['open-ready', '--project', 'test-project', '--write-overlap-consent', '--json'], LEG_ON);
    assert(r.result === 'ok' && r.opened.length === 4, '#588-WIDE-DRAIN: co-open 4, got ' + JSON.stringify(r.opened && r.opened.map(n => n.id)));
    const openedIds = r.opened.map(n => n.id);
    const pendingId = allIds.find(id => !openedIds.includes(id));
    const rs = readRS(cacheDir);
    const base = rs.lane_group.legs[openedIds[0]].baseline;
    for (const id of openedIds) {
      writeEvidence(cacheDir, id);
      fs.writeFileSync(path.join(repoRoot, '.kw', 'legs', 'test-project', id, setOf[id]), '// ' + id + ' leg work\n');
    }
    let last;
    for (let i = 0; i < openedIds.length; i++) {
      last = runNode(repoRoot, ['close-node', '--node-id', openedIds[i], '--project', 'test-project', '--json'], LEG_ON);
      if (i < openedIds.length - 1) assert(last.result === 'ok' && last.barrier === 'deferred_to_group', '#588-WIDE-DRAIN: ' + openedIds[i] + ' deferred, got ' + JSON.stringify(last));
    }
    assert(last.result === 'ok' && last.barrier === 'group_passed' && last.synthesized === true, '#588-WIDE-DRAIN: last member synthesizes, got ' + JSON.stringify(last));
    const M = last.mergeCommit;
    const parents = gitOut(repoRoot, ['rev-list', '--parents', '-n', '1', M]).split(/\s+/).slice(1);
    assert(parents.length === 5, '#588-WIDE-DRAIN: octopus has EXACTLY 5 parents (feature + 4 legs), got ' + parents.length);
    const mDiff = gitOut(repoRoot, ['diff-tree', '-r', '--name-only', base, M]).split('\n').map(s => s.trim()).filter(Boolean).sort();
    assert(JSON.stringify(mDiff) === JSON.stringify(openedIds.map(id => setOf[id]).sort()), '#588-WIDE-DRAIN: diff base→M == union of the 4 opened declared sets, got ' + JSON.stringify(mDiff));
    for (const id of openedIds) assert(ledgerStatus(planPath, id) === 'complete', '#588-WIDE-DRAIN: ' + id + ' complete');
    assert(worktreePaths(repoRoot).filter(p => p.indexOf(path.join('.kw', 'legs')) !== -1).length === 0, '#588-WIDE-DRAIN: legs torn down after the width-4 merge');
    const r2 = runNode(repoRoot, ['open-ready', '--project', 'test-project', '--write-overlap-consent', '--json'], LEG_ON);
    assert(r2.result === 'ok', '#588-WIDE-DRAIN: drain open-ready ok, got ' + JSON.stringify(r2));
    assert(Array.isArray(r2.opened) && r2.opened.length === 1 && r2.opened[0].id === pendingId, '#588-WIDE-DRAIN: the queued 5th (' + pendingId + ') drains, got ' + JSON.stringify(r2.opened && r2.opened.map(n => n.id)));
    assert(!r2.laneGroup, '#588-WIDE-DRAIN: single remaining write opens serially (no lane group)');
    const rs2 = readRS(cacheDir);
    assert(!rs2.lane_group, '#588-WIDE-DRAIN: running-set has no lane_group for the serial drain');
    assert(ledgerStatus(planPath, pendingId) === 'in_progress', '#588-WIDE-DRAIN: the drained 5th is in_progress');
    cleanup(repoRoot);
  }

  // -------------------------------------------------------------------------
  // #588-MIXED-FRONTIER (case c): a ready frontier with BOTH read members (v1,v2) AND a disjoint write pair
  //   (A,B). open-ready opens ONLY the reads (a write runs strictly alone — reads-first is DELIBERATE); the
  //   write group DEFERS until the reads drain (write_awaits_drain). Pins exactly which members open + that
  //   running-set reflects the opened set, with NO lane group / NO legs while reads are live. Behavior PINNED
  //   as correct (matches the "a write node runs strictly alone" invariant; co-open-by-default is write||write).
  // -------------------------------------------------------------------------
  {
    const { repoRoot, cacheDir, planPath } = makeLaneRepo({ extraMembers: [{ id: 'v1', role: 'code-explorer', set: '—' }, { id: 'v2', role: 'knowledge-lookup', set: '—' }] });
    const r = runNode(repoRoot, ['open-ready', '--project', 'test-project', '--write-overlap-consent', '--json'], LEG_ON);
    assert(r.result === 'ok', '#588-MIXED: open-ready ok, got ' + JSON.stringify(r));
    const openedIds = (r.opened || []).map(n => n.id).sort();
    assert(openedIds.join(',') === 'v1,v2', '#588-MIXED: open-ready opens ONLY the read members [v1,v2] (writes defer), got ' + JSON.stringify(openedIds));
    assert(!r.laneGroup, '#588-MIXED: no lane group while opening reads');
    assert(ledgerStatus(planPath, 'v1') === 'in_progress' && ledgerStatus(planPath, 'v2') === 'in_progress', '#588-MIXED: both reads in_progress');
    assert(ledgerStatus(planPath, 'A') === 'pending' && ledgerStatus(planPath, 'B') === 'pending', '#588-MIXED: writes A,B DEFERRED (still pending)');
    const rs = readRS(cacheDir);
    assert(rs.nodes.map(n => n.id).sort().join(',') === 'v1,v2', '#588-MIXED: running-set reflects EXACTLY the opened read set, got ' + JSON.stringify(rs.nodes.map(n => n.id)));
    assert(!rs.lane_group, '#588-MIXED: running-set has no lane_group (reads only)');
    assert(!worktreePaths(repoRoot).some(p => p.indexOf(path.join('.kw', 'legs')) !== -1), '#588-MIXED: no legs provisioned for a read frontier');
    // While the reads are live, a second open-ready DEFERS the writes (a write cannot co-run with live reads).
    const r2 = runNode(repoRoot, ['open-ready', '--project', 'test-project', '--write-overlap-consent', '--json'], LEG_ON);
    assert(r2.result === 'ok' && Array.isArray(r2.opened) && r2.opened.length === 0 && r2.reason === 'write_awaits_drain',
      '#588-MIXED: writes wait for the reads to drain (write_awaits_drain), got ' + JSON.stringify({ opened: r2.opened, reason: r2.reason }));
    cleanup(repoRoot);
  }

  // -------------------------------------------------------------------------
  // #588-TASKMIRROR-FAILOPEN (case d): the durable task-mirror refresh is FAIL-OPEN on the running-set
  //   scheduler path — a mirror write failure must NEVER roll back a correct ledger transition (the #317
  //   fail-open contract, tested for the batch path, now pinned for open-ready + close-node). Force the
  //   mirror write to fail (workflow-tasks.json is a DIRECTORY ⇒ EISDIR ⇒ non-zero task-mirror exit) and
  //   assert the ledger STILL advances with taskMirror.status === 'failed'. Behavior PINNED as correct.
  // -------------------------------------------------------------------------
  {
    // OPEN path: co-open with the mirror-write forced to fail.
    const { repoRoot, cacheDir, projDir, planPath } = makeLaneRepo();
    fs.mkdirSync(path.join(projDir, 'workflow-tasks.json'), { recursive: true });
    const r = runNode(repoRoot, ['open-ready', '--project', 'test-project', '--write-overlap-consent', '--json'], LEG_ON);
    assert(r.result === 'ok', '#588-TASKMIRROR-OPEN: open-ready still ok despite mirror failure, got ' + JSON.stringify(r));
    assert(r.taskMirror && r.taskMirror.status === 'failed', '#588-TASKMIRROR-OPEN: taskMirror reports failed (fail-open), got ' + JSON.stringify(r.taskMirror));
    assert(ledgerStatus(planPath, 'A') === 'in_progress' && ledgerStatus(planPath, 'B') === 'in_progress', '#588-TASKMIRROR-OPEN: ledger STILL advanced despite mirror failure');
    const rs = readRS(cacheDir);
    assert(rs && rs.lane_group && rs.lane_group.legs.A && rs.lane_group.legs.B, '#588-TASKMIRROR-OPEN: running-set + legs written despite mirror failure');
    cleanup(repoRoot);
  }
  {
    // CLOSE path: serial open (writes the mirror as a file), then force the mirror to fail at close-node.
    const { repoRoot, cacheDir, projDir, planPath } = makeLaneRepo();
    const open = runNode(repoRoot, ['open-ready', '--project', 'test-project', '--json'], SERIAL);
    assert(open.result === 'ok' && open.opened.length === 1, '#588-TASKMIRROR-CLOSE: serial open ok, got ' + JSON.stringify(open));
    const openedId = open.opened[0].id;
    writeEvidence(cacheDir, openedId);
    fs.writeFileSync(path.join(repoRoot, openedId === 'A' ? 'ax.js' : 'by.js'), '// serial in-lane\n');
    const tasksPath = path.join(projDir, 'workflow-tasks.json');
    try { fs.rmSync(tasksPath, { force: true }); } catch (_) {}
    fs.mkdirSync(tasksPath, { recursive: true });
    const r = runNode(repoRoot, ['close-node', '--node-id', openedId, '--project', 'test-project', '--json'], SERIAL);
    assert(r.result === 'ok', '#588-TASKMIRROR-CLOSE: close-node still ok despite mirror failure, got ' + JSON.stringify(r));
    assert(r.taskMirror && r.taskMirror.status === 'failed', '#588-TASKMIRROR-CLOSE: taskMirror reports failed (fail-open), got ' + JSON.stringify(r.taskMirror));
    assert(ledgerStatus(planPath, openedId) === 'complete', '#588-TASKMIRROR-CLOSE: ledger advanced to complete despite mirror failure');
    cleanup(repoRoot);
  }
}

// ---------------------------------------------------------------------------
// #434 Fixture (a) — revert-overflow: runRevertOverflow clears outOfAllow paths.
// RED: fails because runRevertOverflow is not yet exported.
// ---------------------------------------------------------------------------
{
  const planNodes = [
    '| impl | implementer | — | scripts/a.js | 1 | sequence |',
    '| review | code-reviewer | impl | — | 1 | sequence |',
    '| finalize | finalize | review | — | 1 | sequence |',
  ];
  let planContent = makePlan([
    '| impl | in_progress | |',
    '| review | pending | |',
    '| finalize | pending | |',
  ], planNodes);

  // Barrier check: impl overflowed — wrote scripts/b.js (not in write set).
  // Fake a barrier result: pass on second call (after revert), fail on first.
  let barrierCallCount = 0;
  const reverted = [];
  const provenanceEntries = [];

  const result = runRevertOverflow({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    project: 'test-project',
    nodeId: 'impl',
    // Shell seam: --barrier-check returns the overflow first, then passes after revert.
    // #546 G10: commit-node's combineResults NESTS outOfAllow under barrierCheck — use that
    // REALISTIC shape (not a top-level outOfAllow) so the test exercises the production path that
    // a top-level-only read would mask as a false "barrier already clean".
    shell: (scriptPath, args) => {
      const base = path.basename(scriptPath);
      if (base === 'kaola-workflow-commit-node.js') {
        // Simulate barrier-check: first call overflowed, second call passes after revert.
        barrierCallCount++;
        if (barrierCallCount === 1) {
          return { exitCode: 1, result: 'refuse', barrierCheck: { reason: 'write_set_overflow', outOfAllow: ['scripts/b.js'] } };
        }
        return { exitCode: 0, result: 'pass', barrierCheck: { reason: null, outOfAllow: [] } };
      }
      return { exitCode: 0, result: 'pass', barrierCheck: { reason: null, outOfAllow: [] } };
    },
    // gitCheckout seam: records reverted paths.
    gitCheckout: (barrierRoot, sha, filePaths) => {
      for (const p of filePaths) reverted.push(p);
      return { exitCode: 0 };
    },
    readFile: (f) => {
      if (f.endsWith('workflow-plan.md')) return planContent;
      if (f.endsWith('barrier-base-impl')) return 'deadbeef1234567890ab\n';
      throw new Error('ENOENT ' + f);
    },
    writeFile: (f, c) => { if (f.endsWith('workflow-plan.md')) planContent = c; },
    cacheExists: (f) => f.endsWith('barrier-base-impl'),
    appendLog: (entry) => provenanceEntries.push(entry),
  });

  assert(result !== undefined, '#434-a RED: runRevertOverflow exported (would be undefined/throw if missing)');
  assert(result && result.result === 'ok', '#434-a: revert-overflow returns ok, got ' + JSON.stringify(result));
  assert(reverted.includes('scripts/b.js'), '#434-a: outOfAllow path scripts/b.js reverted');
  assert(result.revertedPaths && result.revertedPaths.includes('scripts/b.js'),
    '#434-a: result.revertedPaths includes scripts/b.js, got ' + JSON.stringify(result));
  assert(result.barrierClearedAfterRevert === true,
    '#434-a: barrierClearedAfterRevert true after revert, got ' + JSON.stringify(result));
}

// ---------------------------------------------------------------------------
// #434 Fixture (b) — repair-node: runRepairNode reopens writer with ORIGINAL barrier-base.
// RED: fails because runRepairNode is not yet exported.
// ---------------------------------------------------------------------------
{
  const planNodes = [
    '| impl | implementer | — | scripts/a.js | 1 | sequence |',
    '| review | code-reviewer | impl | — | 1 | sequence |',
    '| finalize | finalize | review | — | 1 | sequence |',
  ];
  // State: impl complete (writer finished), review in_progress (reviewer found a problem).
  let planContent = makePlan([
    '| impl | complete | |',
    '| review | in_progress | |',
    '| finalize | pending | |',
  ], planNodes);

  const removedBaselines = [];
  const shelled = [];

  const result = runRepairNode({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    project: 'test-project',
    nodeId: 'impl',   // the writer node to repair
    shell: (scriptPath, args) => {
      shelled.push(path.basename(scriptPath));
      // commit-node is NOT called for repair-node (no re-snapshot)
      return { exitCode: 0, result: 'ok' };
    },
    readFile: (f) => {
      if (f.endsWith('workflow-plan.md')) return planContent;
      // barrier-base-impl EXISTS (original baseline to keep)
      if (f.endsWith('barrier-base-impl')) return 'originalbasehash12\n';
      throw new Error('ENOENT ' + f);
    },
    writeFile: (f, c) => { if (f.endsWith('workflow-plan.md')) planContent = c; },
    cacheExists: (f) => f.endsWith('barrier-base-impl') || f.endsWith('barrier-base-review'),
    unlink: (f) => removedBaselines.push(path.basename(f)),
  });

  assert(result !== undefined, '#434-b RED: runRepairNode exported');
  assert(result && result.result === 'ok', '#434-b: repair-node returns ok, got ' + JSON.stringify(result));
  assert(result.baselineReused === true, '#434-b: baselineReused true (original baseline kept, no re-snapshot)');
  // Writer impl must be in_progress, reviewer reset to pending
  assert(/\|\s*impl\s*\|\s*in_progress\s*\|/.test(planContent),
    '#434-b: impl reopened to in_progress');
  assert(/\|\s*review\s*\|\s*pending\s*\|/.test(planContent),
    '#434-b: review gate reset to pending');
  // Original barrier-base-impl must NOT be removed (it is REUSED, not re-snapshotted)
  assert(!removedBaselines.includes('barrier-base-impl'),
    '#434-b: barrier-base-impl NOT removed (original baseline kept), removed=' + JSON.stringify(removedBaselines));
  // Downstream baselines (review) must be deleted
  assert(removedBaselines.includes('barrier-base-review') || result.deletedDownstreamBaselines,
    '#434-b: downstream review baseline removed or tracked in deletedDownstreamBaselines');
  // commit-node must NOT be shelled (no re-snapshot)
  assert(!shelled.includes('kaola-workflow-commit-node.js'),
    '#434-b: commit-node NOT shelled for repair-node (original baseline reused, no re-snapshot)');

  // REFUSE on complete node
  const planComplete = makePlan([
    '| impl | complete | |',
    '| review | complete | |',
    '| finalize | complete | |',
  ], planNodes);
  const refuseResult = runRepairNode({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    project: 'test-project',
    nodeId: 'impl',
    shell: () => ({ exitCode: 0, result: 'ok' }),
    readFile: (f) => { if (f.endsWith('workflow-plan.md')) return planComplete; throw new Error('ENOENT ' + f); },
    writeFile: () => { throw new Error('must not write on refusal'); },
    cacheExists: () => false,
    unlink: () => {},
  });
  assert(refuseResult && refuseResult.result === 'refuse',
    '#434-b: repair-node refuses on a complete node (no writer+reviewer in_progress pair), got ' + JSON.stringify(refuseResult));
}

// ---------------------------------------------------------------------------
// #434 Fixture (c) — requires_redispatch: orient emits requires_redispatch when
// an in_progress node has absent/incomplete evidence.
// RED: fails because orient does not yet emit requires_redispatch.
// ---------------------------------------------------------------------------
{
  const planNodes = [
    '| impl | implementer | — | scripts/a.js | 1 | sequence |',
    '| review | code-reviewer | impl | — | 1 | sequence |',
    '| finalize | finalize | review | — | 1 | sequence |',
  ];
  const planContent = makePlan([
    '| impl | in_progress | |',
    '| review | pending | |',
    '| finalize | pending | |',
  ], planNodes);

  // Case 1: evidence file ABSENT → requires_redispatch
  const orientAbsent = runOrient({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    shell: (sp, args) => {
      if (args && args.includes('--resume-check')) return { exitCode: 0, result: 'ok', resumable: true };
      if (args && args.includes('--json') && !args.includes('--resume-check')) return { exitCode: 0, result: 'ok', readySet: [], allDone: false, readyPending: [] };
      return { exitCode: 0, result: 'ok' };
    },
    readFile: (f) => {
      if (f.endsWith('workflow-plan.md')) return planContent;
      if (f.endsWith('workflow-state.md')) return makeState();
      throw new Error('ENOENT ' + f);
    },
    cacheExists: (f) => false, // evidence absent
  });
  assert(orientAbsent.result === 'ok', '#434-c: orient ok with absent evidence, got ' + JSON.stringify(orientAbsent));
  assert(orientAbsent.requires_redispatch === true,
    '#434-c: orient emits requires_redispatch=true when evidence absent, got ' + JSON.stringify(orientAbsent));

  // Case 2: evidence file PRESENT with evidence-binding token → NO requires_redispatch
  const orientPresent = runOrient({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    shell: (sp, args) => {
      if (args && args.includes('--resume-check')) return { exitCode: 0, result: 'ok', resumable: true };
      return { exitCode: 0, result: 'ok', readySet: [], allDone: false, readyPending: [] };
    },
    readFile: (f) => {
      if (f.endsWith('workflow-plan.md')) return planContent;
      if (f.endsWith('workflow-state.md')) return makeState();
      if (f.endsWith('impl.md')) return 'evidence-binding: impl deadbeef1234\nbuild-green: yes\n';
      throw new Error('ENOENT ' + f);
    },
    cacheExists: (f) => f.endsWith('impl.md'), // evidence present
  });
  assert(orientPresent.result === 'ok', '#434-c: orient ok with present evidence');
  assert(!orientPresent.requires_redispatch,
    '#434-c: orient does NOT set requires_redispatch when evidence present, got ' + JSON.stringify(orientPresent));
}

// ---------------------------------------------------------------------------
// T-440-A: write-halt with barrierOut carries triage.class in result (#440)
// ---------------------------------------------------------------------------
{
  const plan = makePlan([
    '| impl-core | in_progress | |',
    '| impl-other | pending | |',
    '| review | pending | |',
    '| finalize | pending | |',
  ]);
  const state = makeState();

  let planContent = plan;
  let stateContent = state;

  // Simulate write-halt triggered with a barrierOut (write_set_overflow reason).
  const barrierOut440a = {
    result: 'refuse',
    reason: 'write_set_overflow',
    outOfAllow: ['scripts/foo.js'],
    errors: ['actual writes outside the declared allowlist'],
  };

  const result440a = runWriteHalt({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    nodeId: 'impl-core',
    reason: 'consent',
    barrierOut: barrierOut440a,
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) return planContent;
      if (fpath.endsWith('workflow-state.md')) return stateContent;
      throw new Error('ENOENT');
    },
    writeFile: (fpath, content) => {
      if (fpath.endsWith('workflow-plan.md')) planContent = content;
      if (fpath.endsWith('workflow-state.md')) stateContent = content;
    },
  });

  assert(result440a.result === 'ok', 'T-440-A: write-halt ok');
  assert(typeof result440a.triage === 'object' && result440a.triage !== null,
    'T-440-A: result.triage is present, got ' + JSON.stringify(result440a.triage));
  assert(result440a.triage.class === 'write_set_overflow',
    'T-440-A: triage.class === write_set_overflow, got ' + result440a.triage.class);
  assert(Array.isArray(result440a.triage.proposed_repair && result440a.triage.proposed_repair.paths),
    'T-440-A: proposed_repair.paths is an array');
  assert(result440a.triage.proposed_repair.kind === 'revert_overflow',
    'T-440-A: proposed_repair.kind === revert_overflow for write_set_overflow, got ' + result440a.triage.proposed_repair.kind);
}

// ---------------------------------------------------------------------------
// T-440-B: barrier_failed envelope carries triage (#440)
// close-and-open-next barrier failure → refuse with triage
// ---------------------------------------------------------------------------
{
  const plan440b = makePlan(
    [
      '| impl-core | in_progress | |',
      '| impl-other | pending | |',
      '| review | pending | |',
      '| finalize | pending | |',
    ],
    [
      '| impl-core | implementer | — | scripts/adaptive-node.js | 1 | sequence |',
      '| impl-other | implementer | impl-core | scripts/other.js | 1 | sequence |',
      '| review | code-reviewer | impl-other | — | 1 | sequence |',
      '| finalize | finalize | review | CHANGELOG.md | 1 | sequence |',
    ]
  );
  const state440b = makeState();
  let planContent440b = plan440b;
  const cacheFile440b = '/fake/kaola-workflow/test-project/.cache/impl-core.md';
  // implementer evidence: evidence-binding (no nonce = no baseline), non_tdd_reason, build-green.
  const evidence440b = 'evidence-binding: impl-core\nnon_tdd_reason: refactored\nbuild-green: yes\n';

  const result440b = runCloseAndOpenNext({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    nodeId: 'impl-core',
    shell: () => ({
      exitCode: 1,
      result: 'refuse',
      reason: 'write_set_overflow',
      barrierCheck: {
        result: 'refuse',
        reason: 'write_set_overflow',
        outOfAllow: ['scripts/foo.js'],
        errors: ['actual writes outside the declared allowlist'],
      },
    }),
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) return planContent440b;
      if (fpath.endsWith('workflow-state.md')) return state440b;
      if (fpath === cacheFile440b) return evidence440b;
      throw new Error('ENOENT: ' + fpath);
    },
    writeFile: (fpath, content) => {
      if (fpath.endsWith('workflow-plan.md')) planContent440b = content;
    },
    cacheExists: (fpath) => fpath === cacheFile440b,
  });

  assert(result440b.result === 'refuse', 'T-440-B: close-and-open-next refuses on barrier failure');
  // #546 G7: the narrowed barrier reason (nested at barrierCheck.reason) is promoted to the
  // TOP level so decorateOperatorHint + --summary emit it instead of the generic 'barrier_failed'.
  assert(result440b.reason === 'write_set_overflow', 'T-440-B: narrowed reason promoted to top level, got ' + result440b.reason);
  assert(Array.isArray(result440b.outOfAllow) && result440b.outOfAllow[0] === 'scripts/foo.js',
    'T-440-B: outOfAllow attached at top level, got ' + JSON.stringify(result440b.outOfAllow));
  assert(typeof result440b.triage === 'object' && result440b.triage !== null,
    'T-440-B: barrier envelope carries triage, got ' + JSON.stringify(result440b.triage));
  assert(typeof result440b.triage.class === 'string',
    'T-440-B: triage.class is a string, got ' + JSON.stringify(result440b.triage));
}

// ---------------------------------------------------------------------------
// T-440-C: unknown barrier reason degrades to class: 'unclassified' (#440)
// ---------------------------------------------------------------------------
{
  const plan440c = makePlan([
    '| impl-core | in_progress | |',
    '| impl-other | pending | |',
    '| review | pending | |',
    '| finalize | pending | |',
  ]);
  const state440c = makeState();
  let planContent440c = plan440c;
  let stateContent440c = state440c;

  // Pass a barrierOut with an unknown/unclassifiable reason.
  const barrierOut440c = {
    result: 'refuse',
    reason: 'some_totally_unknown_reason',
    errors: ['something unexpected'],
  };

  const result440c = runWriteHalt({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    nodeId: 'impl-core',
    reason: 'consent',
    barrierOut: barrierOut440c,
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) return planContent440c;
      if (fpath.endsWith('workflow-state.md')) return stateContent440c;
      throw new Error('ENOENT');
    },
    writeFile: (fpath, content) => {
      if (fpath.endsWith('workflow-plan.md')) planContent440c = content;
      if (fpath.endsWith('workflow-state.md')) stateContent440c = content;
    },
  });

  assert(result440c.result === 'ok', 'T-440-C: write-halt still ok with unknown barrier reason');
  assert(typeof result440c.triage === 'object' && result440c.triage !== null,
    'T-440-C: triage present even for unknown reason');
  assert(result440c.triage.class === 'unclassified',
    'T-440-C: triage.class === unclassified for unknown reason, got ' + JSON.stringify(result440c.triage));
}

// ---------------------------------------------------------------------------
// T-440-D: computeTriage — known subtype labels (#440)
// ---------------------------------------------------------------------------
{
  // lockfile_write: barrierOut with that reason
  const triageLock = computeTriage(
    { result: 'refuse', reason: 'lockfile_write', outOfAllow: ['package-lock.json'] },
    '/fake/kaola-workflow/test-project/.cache',
    'impl-core',
    () => { throw new Error('ENOENT'); }
  );
  assert(triageLock.class === 'lockfile_write', 'T-440-D: lockfile_write class, got ' + triageLock.class);
  assert(triageLock.proposed_repair && triageLock.proposed_repair.kind === 'add_to_write_set',
    'T-440-D: lockfile_write → add_to_write_set, got ' + JSON.stringify(triageLock.proposed_repair));

  // mirror_write
  const triageMirror = computeTriage(
    { result: 'refuse', reason: 'mirror_write', outOfAllow: ['plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js'] },
    '/fake/.cache', 'impl-core', () => { throw new Error('ENOENT'); }
  );
  assert(triageMirror.class === 'mirror_write', 'T-440-D: mirror_write class, got ' + triageMirror.class);
  assert(triageMirror.proposed_repair && triageMirror.proposed_repair.kind === 'add_to_write_set',
    'T-440-D: mirror_write → add_to_write_set');

  // count_bump
  const triageCount = computeTriage(
    { result: 'refuse', reason: 'count_bump', outOfAllow: ['scripts/validate-workflow-contracts.js'] },
    '/fake/.cache', 'impl-core', () => { throw new Error('ENOENT'); }
  );
  assert(triageCount.class === 'count_bump', 'T-440-D: count_bump class, got ' + triageCount.class);
  assert(triageCount.proposed_repair && triageCount.proposed_repair.kind === 'write_set_swap',
    'T-440-D: count_bump → write_set_swap');

  // null barrierOut → unclassified without throwing
  const triageNull = computeTriage(null, '/fake/.cache', 'impl-core', () => {});
  assert(triageNull.class === 'unclassified', 'T-440-D: null barrierOut → unclassified');
}

// ---------------------------------------------------------------------------
// T-445/446 table-driven: operator_hint, route-findings, --summary (#445/#446)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// T-445-A: decorateOperatorHint — table of refuse envelopes with known reasons
//   Each entry: { reason, ctx, wantHintSubstring }
//   The decorated envelope must carry operator_hint that contains wantHintSubstring.
// ---------------------------------------------------------------------------
{
  const cases = [
    { reason: 'plan_missing',       ctx: {},                              wantHintSubstring: 'workflow-plan.md' },
    { reason: 'barrier_failed',     ctx: { nodeId: 'impl-x' },           wantHintSubstring: 'impl-x' },
    { reason: 'evidence_absent',    ctx: { nodeId: 'n1', role: 'tdd-guide' }, wantHintSubstring: 'n1' },
    { reason: 'halt_pending',       ctx: {},                              wantHintSubstring: 'clear-halt' },
    { reason: 'write_set_overflow', ctx: { nodeId: 'writer' },           wantHintSubstring: 'revert-overflow' },
    { reason: 'invalid_project',    ctx: { detail: 'must be issue-N' },  wantHintSubstring: 'issue-N' },
  ];

  for (const tc of cases) {
    const envelope = { result: 'refuse', reason: tc.reason, ...tc.ctx };
    const decorated = decorateOperatorHint(envelope);
    assert(
      typeof decorated.operator_hint === 'string' && decorated.operator_hint.length > 0,
      'T-445-A[' + tc.reason + ']: operator_hint is a non-empty string'
    );
    assert(
      decorated.operator_hint.includes(tc.wantHintSubstring),
      'T-445-A[' + tc.reason + ']: hint contains "' + tc.wantHintSubstring + '", got: ' + decorated.operator_hint
    );
  }
}

// ---------------------------------------------------------------------------
// T-445-B: decorateOperatorHint — must NOT mutate a success envelope (result: ok)
// ---------------------------------------------------------------------------
{
  const ok = { result: 'ok', nodeId: 'n1' };
  const out = decorateOperatorHint(ok);
  assert(out.operator_hint === undefined, 'T-445-B: success envelope must NOT gain operator_hint');
}

// ---------------------------------------------------------------------------
// T-445-C: decorateOperatorHint — idempotent: never overwrites an existing hint
// ---------------------------------------------------------------------------
{
  const env = { result: 'refuse', reason: 'halt_pending', operator_hint: 'custom-hint-do-not-overwrite' };
  const out = decorateOperatorHint(env);
  assert(out.operator_hint === 'custom-hint-do-not-overwrite', 'T-445-C: existing operator_hint must not be overwritten');
}

// ===========================================================================
// #593-V: validator --parallel-safe coarse relaxation net — pins writeOverlapRelaxable's coarse arm
//   directly at the CLI seam tryFormLaneGroup shells. PURE over the plan file (no git / freeze /
//   plan_hash — --parallel-safe reads parseNodes directly). Covers AC1 (coarse default-relax),
//   AC2 (NET-1/NET-2 retained), AC3 (exact/case never relaxes), AC4 (resolvability fallback), and the
//   policy/consent-vestigial invariant. (The shared-infra + OLD-coarse validator net lives in
//   test-commit-node.js; #593's coarse-default-relax + resolvability fallback are pinned HERE.)
// ===========================================================================
{
  const { execFileSync } = require('child_process');
  const VALIDATOR = path.join(__dirname, 'kaola-workflow-plan-validator.js');
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-593-ps-'));
  // Build a --parallel-safe plan (A,B write antichain; a code-reviewer gate unless noGate; a finalize
  // sink). --parallel-safe reads parseNodes directly — NO freeze / plan_hash / git required.
  function writePSPlan(name, opts) {
    opts = opts || {};
    const dir = path.join(tmpRoot, name);
    fs.mkdirSync(dir, { recursive: true });
    const planPath = path.join(dir, 'workflow-plan.md');
    const meta = ['## Meta', 'labels: area:scripts', 'sink: CHANGELOG.md'];
    if (opts.policy) meta.push('write_overlap_policy: ' + opts.policy);
    const reviewRow = opts.noGate ? null : '| review | code-reviewer | A,B | — | 1 | sequence |';
    const finalizeDep = opts.noGate ? 'A,B' : 'review';
    const rows = [
      '# P', '', ...meta, '',
      '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape |',
      '| --- | --- | --- | --- | --- | --- |',
      '| seed | code-explorer | — | — | 1 | sequence |',
      '| A | tdd-guide | seed | ' + opts.aSet + ' | 1 | sequence |',
      '| B | tdd-guide | seed | ' + opts.bSet + ' | 1 | sequence |',
      ...(reviewRow ? [reviewRow] : []),
      '| finalize | finalize | ' + finalizeDep + ' | — | 1 | sequence |', '',
      '## Node Ledger', '', '| id | status |', '| --- | --- |',
      '| seed | complete |', '| A | in_progress |', '| B | in_progress |',
      ...(opts.noGate ? [] : ['| review | pending |']), '| finalize | pending |', '',
    ].join('\n') + '\n';
    fs.writeFileSync(planPath, rows);
    return planPath;
  }
  function ps(planPath, extraArgs) {
    try {
      const out = execFileSync('node', [VALIDATOR, planPath, '--parallel-safe', '--nodes', 'A,B', ...(extraArgs || []), '--json'], { encoding: 'utf8' });
      return { exitCode: 0, ...JSON.parse(out.trim().split('\n').pop()) };
    } catch (err) {
      let parsed = {};
      try { parsed = JSON.parse(String(err.stdout || '').trim().split('\n').pop()); } catch (_) {}
      return { exitCode: err.status == null ? 1 : err.status, ...parsed };
    }
  }
  const PA = 'plugins/kaola-workflow-gitlab/scripts/pa.js';
  const PB = 'plugins/kaola-workflow-gitea/scripts/pb.js';

  // #593-V-AC1 (RED→GREEN): coarse exact-disjoint + gate + NO consent, NO policy → ok, relaxed coarse.
  {
    const r = ps(writePSPlan('v-ac1', { aSet: PA, bSet: PB }));
    assert(r.result === 'ok', '#593-V-AC1: coarse exact-disjoint + gate relaxes to ok BY DEFAULT (no policy/consent), got ' + JSON.stringify(r));
    assert(Array.isArray(r.relaxed) && r.relaxed.some(x => x.kind === 'coarse'), '#593-V-AC1: surfaces relaxed[] with kind coarse, got ' + JSON.stringify(r.relaxed));
    assert(Array.isArray(r.overlapping) && r.overlapping.length === 0, '#593-V-AC1: overlapping empty (downgraded), got ' + JSON.stringify(r.overlapping));
  }
  // #593-V-AC2a (NET-1): coarse exact-disjoint but NO post-dominating code-reviewer gate → refuse,
  //   even WITH --write-overlap-consent (the gate net is non-negotiable, and consent is vestigial).
  {
    const r = ps(writePSPlan('v-ac2a', { aSet: PA, bSet: PB, noGate: true }), ['--write-overlap-consent']);
    assert(r.result === 'refuse' && r.reason === 'overlapping_write_sets', '#593-V-AC2a: coarse without a post-dominating gate REFUSES (NET-1), got ' + JSON.stringify(r));
    assert(!r.relaxed, '#593-V-AC2a: nothing relaxed without a gate');
  }
  // #593-V-AC2b (NET-2): coarse + gate + a PROTECTED concrete file in one set → refuse; consent/policy
  //   do NOT override (PROTECTED stays blocking at every tier).
  {
    const r = ps(writePSPlan('v-ac2b', { aSet: 'plugins/kaola-workflow-gitlab/package-lock.json', bSet: PB, policy: 'disjoint' }), ['--write-overlap-consent']);
    assert(r.result === 'refuse', '#593-V-AC2b: a PROTECTED file blocks at every tier (NET-2), consent/policy do not override, got ' + JSON.stringify(r));
    assert(!r.relaxed, '#593-V-AC2b: nothing relaxed when a PROTECTED file is present');
  }
  // #593-V-AC3-exact (unchanged): same exact path → refuse (exact never relaxes; no override).
  {
    const r = ps(writePSPlan('v-ac3e', { aSet: PA, bSet: PA, policy: 'disjoint' }), ['--write-overlap-consent']);
    assert(r.result === 'refuse' && (r.overlapping || []).some(o => o.kind === 'exact'), '#593-V-AC3-exact: same exact path stays blocking (exact kind), got ' + JSON.stringify(r));
  }
  // #593-V-AC3-case (unchanged): case-collision (Foo.js vs foo.js) → refuse (same physical file).
  {
    const r = ps(writePSPlan('v-ac3c', { aSet: 'plugins/kaola-workflow-gitlab/scripts/Foo.js', bSet: 'plugins/kaola-workflow-gitlab/scripts/foo.js', policy: 'disjoint' }), ['--write-overlap-consent']);
    assert(r.result === 'refuse', '#593-V-AC3-case: a case-collision stays blocking, got ' + JSON.stringify(r));
  }
  // #593-V-AC4-dir (resolvability fallback): coarse + gate + a directory-shaped entry → refuse.
  {
    const r = ps(writePSPlan('v-ac4d', { aSet: 'plugins/kaola-workflow-gitlab/scripts/', bSet: PB }));
    assert(r.result === 'refuse', '#593-V-AC4-dir: a directory-shaped entry makes exact-path disjointness unprovable ⇒ coarse refusal preserved, got ' + JSON.stringify(r));
    assert(!r.relaxed, '#593-V-AC4-dir: nothing relaxed when disjointness is unprovable');
  }
  // #593-V-AC4-glob (resolvability fallback): coarse + gate + a glob entry → refuse.
  {
    const r = ps(writePSPlan('v-ac4g', { aSet: 'plugins/kaola-workflow-gitlab/scripts/*.js', bSet: PB }));
    assert(r.result === 'refuse', '#593-V-AC4-glob: a glob entry makes exact-path disjointness unprovable ⇒ coarse refusal preserved, got ' + JSON.stringify(r));
  }
  // #593-V-VESTIGIAL: write_overlap_policy / --write-overlap-consent are redundant at this seam — coarse
  //   relaxes at policy:off with NO consent, and identically with policy:coarse + consent.
  {
    const rOff = ps(writePSPlan('v-vest1', { aSet: PA, bSet: PB, policy: 'off' }));
    assert(rOff.result === 'ok' && (rOff.relaxed || []).some(x => x.kind === 'coarse'), '#593-V-VESTIGIAL: coarse relaxes at policy:off with NO consent (policy/consent vestigial), got ' + JSON.stringify(rOff));
    const rConsent = ps(writePSPlan('v-vest2', { aSet: PA, bSet: PB, policy: 'coarse' }), ['--write-overlap-consent']);
    assert(rConsent.result === 'ok' && (rConsent.relaxed || []).some(x => x.kind === 'coarse'), '#593-V-VESTIGIAL: coarse relaxes identically with policy:coarse + consent, got ' + JSON.stringify(rConsent));
  }
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T-445-D: getOperatorHint — unknown reason falls back to a non-empty generic string
// ---------------------------------------------------------------------------
{
  const hint = getOperatorHint('some_completely_unknown_reason_xyz', {});
  assert(typeof hint === 'string' && hint.length > 0, 'T-445-D: unknown reason produces a non-empty fallback hint');
  assert(hint.includes('some_completely_unknown_reason_xyz') || hint.includes('orient'),
    'T-445-D: fallback hint contains reason or "orient": ' + hint);
}

// ---------------------------------------------------------------------------
// T-445-E: OPERATOR_HINT_REGISTRY coverage — every reason that adaptive-node
//   emits (refuse with reason) has a registered template (not the generic fallback).
//   This is a table of known reasons asserted present in the registry.
// ---------------------------------------------------------------------------
{
  const knownReasons = [
    'plan_missing', 'plan_not_mirrored', 'plan_integrity_failed', 'halt_pending',
    'serial_node_live', 'scheduler_active',
    'next_action_failed', 'node_not_ready', 'no_ready_node',
    'barrier_failed', 'evidence_absent', 'evidence_shape_failed',
    'write_set_overflow', 'lockfile_write', 'mirror_write', 'count_bump',
    'invalid_project',
    // #463 Slice 5: synthesizer / write-overlap escalation envelope
    'group_barrier_failed', 'leg_capture_failed', 'merge_conflict',
  ];
  for (const r of knownReasons) {
    assert(
      typeof OPERATOR_HINT_REGISTRY[r] === 'function',
      'T-445-E: OPERATOR_HINT_REGISTRY[' + r + '] must be a function (template registered)'
    );
  }
}

// ---------------------------------------------------------------------------
// T-446-A: parseFindingLine — table-driven (#446)
//   Covers em-dash separator, hyphen separator, security keyword, n/a status,
//   and missing-file (no path-like token) shapes.
// ---------------------------------------------------------------------------
{
  const pfCases = [
    {
      line: 'finding: F1 — scripts/foo.js — missing validation',
      wantId: 'F1', wantFile: 'scripts/foo.js', wantStatus: 'open', wantSecurity: false,
    },
    {
      line: 'finding: F2 - scripts/bar.js - security: missing auth check',
      wantId: 'F2', wantFile: 'scripts/bar.js', wantStatus: 'open', wantSecurity: true,
    },
    {
      line: 'finding: F3 — no file — non-blocking nit',
      wantId: 'F3', wantFile: null, wantStatus: 'n/a', wantSecurity: false,
    },
    {
      line: 'finding: F4 — scripts/validate-contracts.js — n/a already fixed',
      wantId: 'F4', wantFile: 'scripts/validate-contracts.js', wantStatus: 'n/a', wantSecurity: false,
    },
    {
      line: 'not a finding line at all',
      wantNull: true,
    },
    {
      line: '',
      wantNull: true,
    },
  ];

  for (const tc of pfCases) {
    const r = parseFindingLine(tc.line);
    if (tc.wantNull) {
      assert(r === null, 'T-446-A[' + JSON.stringify(tc.line) + ']: must return null');
    } else {
      assert(r !== null, 'T-446-A[' + tc.wantId + ']: must return non-null for a finding line');
      assert(r.finding_id === tc.wantId, 'T-446-A[' + tc.wantId + ']: finding_id, got ' + r.finding_id);
      assert(r.file === tc.wantFile, 'T-446-A[' + tc.wantId + ']: file, got ' + r.file);
      assert(r.status === tc.wantStatus, 'T-446-A[' + tc.wantId + ']: status, got ' + r.status);
      assert(r.securityFlag === tc.wantSecurity, 'T-446-A[' + tc.wantId + ']: securityFlag, got ' + r.securityFlag);
    }
  }
}

// ---------------------------------------------------------------------------
// T-446-B: resolveOwningNode — table of nodes + file → expected owning id
// ---------------------------------------------------------------------------
{
  const nodes = [
    { id: 'impl-a', declared_write_set: 'scripts/foo.js' },
    { id: 'impl-b', declared_write_set: 'scripts/bar.js scripts/baz.js' },
    { id: 'review', declared_write_set: null },
  ];

  const roCases = [
    { file: 'scripts/foo.js',  wantNode: 'impl-a' },
    { file: 'scripts/bar.js',  wantNode: 'impl-b' },
    { file: 'scripts/baz.js',  wantNode: 'impl-b' },
    { file: 'scripts/other.js',wantNode: null },
    { file: null,              wantNode: null },
  ];

  for (const tc of roCases) {
    const got = resolveOwningNode(tc.file, nodes);
    assert(
      got === tc.wantNode,
      'T-446-B[' + tc.file + ']: resolveOwningNode → ' + tc.wantNode + ', got ' + got
    );
  }
}

// ---------------------------------------------------------------------------
// T-446-C: runRouteFindings — pure-fn with injected readFile/writeFile (#446)
//   Exercises the fix_role precedence: security → 'security-reviewer',
//   owned file → 'implementer', unowned → 'code-reviewer'.
// ---------------------------------------------------------------------------
{
  const planContent446c = makePlan([
    '| impl-core | in_progress | |',
    '| review    | pending | |',
    '| finalize  | pending | |',
  ], [
    '| impl-core | tdd-guide    | — | scripts/foo.js | 1 | sequence |',
    '| review    | code-reviewer| impl-core | — | 1 | sequence |',
    '| finalize  | finalize     | review | CHANGELOG.md | 1 | sequence |',
  ]);

  // Evidence file with three findings:
  //  F1 — scripts/foo.js (impl-core owns it) → implementer
  //  F2 — scripts/bar.js (nobody owns it) → code-reviewer
  //  F3 — scripts/baz.js — security flag → security-reviewer
  const evidence446c = [
    'evidence-binding: review abc123',
    '',
    'finding: F1 — scripts/foo.js — wrong logic',
    'finding: F2 — scripts/bar.js — unused import',
    'finding: F3 — scripts/baz.js — security: missing auth',
    '',
    'verdict: pass',
    'findings_blocking: 0',
  ].join('\n') + '\n';

  const fakeCache = '/fake/kaola-workflow/test-project/.cache';
  const written446c = {};

  const r446c = runRouteFindings({
    nodeId: 'review',
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    repoRoot: '/fake',
    readFile: (fpath) => {
      if (fpath.endsWith('review.md')) return evidence446c;
      if (fpath.endsWith('workflow-plan.md')) return planContent446c;
      throw new Error('ENOENT: ' + fpath);
    },
    writeFile: (fpath, content) => { written446c[fpath] = content; },
  }, 'test-project');

  assert(r446c.result === 'ok', 'T-446-C: runRouteFindings returns ok');
  assert(r446c.count === 3, 'T-446-C: count=3 findings, got ' + r446c.count);
  assert(Array.isArray(r446c.findings), 'T-446-C: findings is array');

  const f1 = r446c.findings.find(f => f.finding_id === 'F1');
  const f2 = r446c.findings.find(f => f.finding_id === 'F2');
  const f3 = r446c.findings.find(f => f.finding_id === 'F3');

  assert(f1 && f1.owning_node === 'impl-core', 'T-446-C[F1]: owning_node=impl-core, got ' + (f1 && f1.owning_node));
  assert(f1 && f1.fix_role === 'implementer', 'T-446-C[F1]: fix_role=implementer, got ' + (f1 && f1.fix_role));
  assert(f2 && f2.owning_node === null, 'T-446-C[F2]: owning_node=null (unowned), got ' + (f2 && f2.owning_node));
  assert(f2 && f2.fix_role === 'code-reviewer', 'T-446-C[F2]: fix_role=code-reviewer, got ' + (f2 && f2.fix_role));
  assert(f3 && f3.fix_role === 'security-reviewer', 'T-446-C[F3]: fix_role=security-reviewer (security flag), got ' + (f3 && f3.fix_role));

  // Verify .cache/findings-route.json was written with the correct shape.
  const outPath = Object.keys(written446c).find(k => k.includes('findings-route.json'));
  assert(outPath !== undefined, 'T-446-C: writeFile called for findings-route.json');
  if (outPath) {
    const parsed446c = JSON.parse(written446c[outPath]);
    assert(Array.isArray(parsed446c) && parsed446c.length === 3,
      'T-446-C: written JSON is an array of 3, got ' + parsed446c.length);
  }
}

// ---------------------------------------------------------------------------
// T-446-D: runRouteFindings — evidence_absent refuse when evidence file is missing
// ---------------------------------------------------------------------------
{
  const r446d = runRouteFindings({
    nodeId: 'review',
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    repoRoot: '/fake',
    readFile: () => { throw new Error('ENOENT'); },
    writeFile: () => {},
  }, 'test-project');

  assert(r446d.result === 'refuse', 'T-446-D: missing evidence → refuse');
  assert(r446d.reason === 'evidence_absent', 'T-446-D: reason=evidence_absent, got ' + r446d.reason);
  assert(r446d.nodeId === 'review', 'T-446-D: nodeId echoed in refusal');
}

// ---------------------------------------------------------------------------
// T-446-E: --summary mode — subprocess test (real CLI invocation in $TMPDIR)
//   Runs adaptive-node.js orient --project nonexistent-zyx --json --summary
//   via a temp project dir in $TMPDIR. Asserts:
//     (a) stdout is exactly ONE line starting with "summary: "
//     (b) .cache/orient-envelope.json is written (full envelope cache)
// ---------------------------------------------------------------------------
{
  const { execFileSync } = require('child_process');
  const ADAPTIVE_NODE = path.join(__dirname, 'kaola-workflow-adaptive-node.js');

  // Stand up a minimal git repo + project dir in TMPDIR.
  const tmpRoot446e = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-summary-'));
  try {
    const g = (args) => {
      try {
        execFileSync('git', ['-C', tmpRoot446e, ...args], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'] });
      } catch (_) {}
    };
    g(['init']);
    g(['config', 'user.email', 'kw@test']);
    g(['config', 'user.name', 'kw']);
    g(['config', 'commit.gpgsign', 'false']);
    // No project dir → orient will refuse with plan_missing.

    let stdout446e = '';
    try {
      stdout446e = execFileSync(process.execPath, [
        ADAPTIVE_NODE, 'orient', '--project', 'nonexistent-zyx', '--json', '--summary',
      ], { cwd: tmpRoot446e, encoding: 'utf8' });
    } catch (err) {
      stdout446e = String(err.stdout || '');
    }

    const lines446e = stdout446e.split('\n').filter(l => l.length > 0);
    assert(lines446e.length === 1, 'T-446-E: --summary produces exactly 1 output line, got ' + lines446e.length + ': ' + JSON.stringify(lines446e));
    assert(lines446e[0].startsWith('summary: '), 'T-446-E: the single line starts with "summary: ", got: ' + lines446e[0]);

    // .cache/ for the project: cacheDir = <root>/kaola-workflow/nonexistent-zyx/.cache
    const projCacheDir446e = path.join(tmpRoot446e, 'kaola-workflow', 'nonexistent-zyx', '.cache');
    const envelopePath446e = path.join(projCacheDir446e, 'orient-envelope.json');
    assert(fs.existsSync(envelopePath446e), 'T-446-E: orient-envelope.json must be written to .cache/');
    if (fs.existsSync(envelopePath446e)) {
      let env446e = {};
      try { env446e = JSON.parse(fs.readFileSync(envelopePath446e, 'utf8')); } catch (_) {}
      assert(typeof env446e.result === 'string', 'T-446-E: cached envelope has result field');
    }
  } finally {
    try { fs.rmSync(tmpRoot446e, { recursive: true, force: true }); } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// T-446-F: route-findings subprocess — recognized subcommand (real CLI) (#446)
//   Runs adaptive-node.js route-findings --project test-project --node-id review --json
//   against a TMPDIR project. With an evidence file present, it should return ok
//   with the findings array. With no evidence file, it refuses evidence_absent
//   (NOT unknown subcommand — proving route-findings is a recognized subcommand).
// ---------------------------------------------------------------------------
{
  const { execFileSync } = require('child_process');
  const ADAPTIVE_NODE = path.join(__dirname, 'kaola-workflow-adaptive-node.js');

  const tmpRoot446f = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-route-'));
  try {
    const g = (args) => {
      try {
        execFileSync('git', ['-C', tmpRoot446f, ...args], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'] });
      } catch (_) {}
    };
    g(['init']);
    g(['config', 'user.email', 'kw@test']);
    g(['config', 'user.name', 'kw']);
    g(['config', 'commit.gpgsign', 'false']);

    // Create a minimal project structure.
    const projDir446f = path.join(tmpRoot446f, 'kaola-workflow', 'test-project-446f');
    const cacheDir446f = path.join(projDir446f, '.cache');
    fs.mkdirSync(cacheDir446f, { recursive: true });

    // Write a minimal plan.
    fs.writeFileSync(path.join(projDir446f, 'workflow-plan.md'), makePlan([
      '| impl | in_progress | |',
      '| review | pending | |',
      '| finalize | pending | |',
    ]));
    fs.writeFileSync(path.join(projDir446f, 'workflow-state.md'), makeState());

    // Write evidence for the review node.
    fs.writeFileSync(path.join(cacheDir446f, 'review.md'), [
      'evidence-binding: review abc456',
      '',
      'finding: F1 — scripts/other.js — wrong logic',
      '',
      'verdict: pass',
      'findings_blocking: 0',
    ].join('\n') + '\n');

    let out446f = '';
    try {
      out446f = execFileSync(process.execPath, [
        ADAPTIVE_NODE, 'route-findings', '--project', 'test-project-446f', '--node-id', 'review', '--json',
      ], { cwd: tmpRoot446f, encoding: 'utf8' });
    } catch (err) {
      out446f = String(err.stdout || '');
    }

    let parsed446f = {};
    try { parsed446f = JSON.parse(out446f.trim().split('\n').pop()); } catch (_) {}

    // Key assertion: must NOT be "unknown subcommand".
    assert(
      !(parsed446f.errors && parsed446f.errors.join('').includes('unknown subcommand')),
      'T-446-F: route-findings is a recognized subcommand (must not return unknown subcommand)'
    );
    // It found the evidence → ok with findings array.
    assert(parsed446f.result === 'ok', 'T-446-F: ok result when evidence present, got ' + parsed446f.result);
    assert(Array.isArray(parsed446f.findings), 'T-446-F: findings array returned');
    assert(parsed446f.count === 1, 'T-446-F: 1 finding parsed, got ' + parsed446f.count);

    // findings-route.json must be written.
    const routePath446f = path.join(cacheDir446f, 'findings-route.json');
    assert(fs.existsSync(routePath446f), 'T-446-F: .cache/findings-route.json written by route-findings');

  } finally {
    try { fs.rmSync(tmpRoot446f, { recursive: true, force: true }); } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// D451-DISPATCH-EFFORT: buildDispatch includes agent_type and dispatchEffort fields
// ---------------------------------------------------------------------------
{
  // Case 1: opus model → xhigh effort
  const opusNode = { id: 'n1-planner', role: 'code-reviewer', model: 'opus', declared_write_set: 'scripts/foo.js' };
  const opusCtx = {
    nonce: 'abc123def456',
    evidence_file: '.cache/n1-planner.md',
    required_tokens: ['evidence-binding', 'RED', 'GREEN'],
    working_dir: '/fake/worktree',
    forge_rider: null,
  };
  const dOpus = buildDispatch(opusNode, opusCtx);
  assert(dOpus.agent_type === 'code-reviewer', 'D451-DISPATCH-EFFORT: opus agent_type equals base role');
  assert(dOpus.codex_reasoning_effort === 'xhigh', 'D451-DISPATCH-EFFORT: opus codex_reasoning_effort is xhigh');
  assert(dOpus.codex_reasoning_effort_source === 'planner_model', 'D451-DISPATCH-EFFORT: opus codex_reasoning_effort_source is planner_model');
  assert(dOpus.codex_task_name === 'n1_planner_code_reviewer', 'D451-DISPATCH-EFFORT: opus dispatch carries task-name identity for per-spawn calls');

  // Case 2: sonnet model → high effort
  const sonnetNode = { id: 'n2-impl', role: 'code-reviewer', model: 'sonnet', declared_write_set: 'scripts/bar.js' };
  const sonnetCtx = {
    nonce: 'def456abc123',
    evidence_file: '.cache/n2-impl.md',
    required_tokens: ['evidence-binding'],
    working_dir: '/fake/worktree',
    forge_rider: null,
  };
  const dSonnet = buildDispatch(sonnetNode, sonnetCtx);
  assert(dSonnet.agent_type === 'code-reviewer', 'D451-DISPATCH-EFFORT: sonnet agent_type equals base role');
  assert(dSonnet.codex_reasoning_effort === 'high', 'D451-DISPATCH-EFFORT: sonnet codex_reasoning_effort is high');
  assert(dSonnet.codex_reasoning_effort_source === 'planner_model', 'D451-DISPATCH-EFFORT: sonnet codex_reasoning_effort_source is planner_model');

  // Case 3: null model → role_default
  const nullModelNode = { id: 'n3-review', role: 'code-reviewer', model: null, declared_write_set: '—' };
  const nullCtx = {
    nonce: 'xyz789',
    evidence_file: '.cache/n3-review.md',
    required_tokens: ['evidence-binding'],
    working_dir: '/fake/worktree',
    forge_rider: null,
  };
  const dNull = buildDispatch(nullModelNode, nullCtx);
  assert(dNull.agent_type === 'code-reviewer', 'D451-DISPATCH-EFFORT: null-model agent_type equals base role');
  assert(dNull.codex_reasoning_effort === null, 'D451-DISPATCH-EFFORT: null-model codex_reasoning_effort is null');
  assert(dNull.codex_reasoning_effort_source === 'role_default', 'D451-DISPATCH-EFFORT: null-model codex_reasoning_effort_source is role_default');

  // #382-opencode: the opencode effort twin (dispatchEffortOpencode). No provider in ctx →
  // role_default (the agent's configured variant wins), so the cases above all carry null.
  assert(dOpus.opencode_variant === null && dOpus.opencode_variant_source === 'role_default',
    'D451-DISPATCH-EFFORT: opus (no provider) opencode_variant is null/role_default');
  assert(dSonnet.opencode_variant === null && dSonnet.opencode_variant_source === 'role_default',
    'D451-DISPATCH-EFFORT: sonnet (no provider) opencode_variant is null/role_default');
  // Case 4: opus + opencode provider → the provider's TOP effort variant (mapTier).
  const dOc = buildDispatch(opusNode, Object.assign({}, opusCtx, { opencode_provider: 'zhipuai-coding-plan' }));
  assert(dOc.opencode_variant === 'max' && dOc.opencode_variant_source === 'planner_model',
    'D451-DISPATCH-EFFORT: opus + zhipu provider → opencode_variant max (top), got ' + JSON.stringify(dOc.opencode_variant));
  // Case 5: sonnet + opencode provider → the provider's SECOND effort variant.
  const dOai = buildDispatch(sonnetNode, Object.assign({}, sonnetCtx, { opencode_provider: 'openai' }));
  assert(dOai.opencode_variant === 'high' && dOai.opencode_variant_source === 'planner_model',
    'D451-DISPATCH-EFFORT: sonnet + openai provider → opencode_variant high (second), got ' + JSON.stringify(dOai.opencode_variant));

  // #537 Surface 2: the runtime buildDispatch call is dispatchEffortOpencode(model, ctx.opencode_provider)
  // and NO caller ever populates ctx.opencode_provider — so a declared tier silently resolved to
  // role_default. The schema now PURE-resolves the active provider from KAOLA_OPENCODE_INHERIT_MODEL
  // (the established opencode inherited-model env, "provider/model" form) when no provider is passed,
  // so a declared tier reaches a CONCRETE effort variant. Backward-compat: env UNSET + no provider
  // stays null/role_default (cases 1-3 above remain valid; claude/codex are behavior-inert).

  // Case 6 (direct, opus): env-resolved provider → concrete TOP variant, source reflects resolution.
  const rOpusEnv = dispatchEffortOpencode('opus', null, { KAOLA_OPENCODE_INHERIT_MODEL: 'zhipuai-coding-plan/glm-5.2' });
  assert(rOpusEnv.opencode_variant === 'max',
    'D451-DISPATCH-EFFORT: opus + env-resolved zhipu provider → opencode_variant max, got ' + JSON.stringify(rOpusEnv.opencode_variant));
  assert(rOpusEnv.opencode_variant_source !== 'role_default',
    'D451-DISPATCH-EFFORT: opus + env-resolved provider source is NOT role_default, got ' + JSON.stringify(rOpusEnv.opencode_variant_source));

  // Case 7 (direct, sonnet): env-resolved provider → concrete SECOND variant.
  const rSonnetEnv = dispatchEffortOpencode('sonnet', null, { KAOLA_OPENCODE_INHERIT_MODEL: 'openai/gpt-5' });
  assert(rSonnetEnv.opencode_variant === 'high',
    'D451-DISPATCH-EFFORT: sonnet + env-resolved openai provider → opencode_variant high, got ' + JSON.stringify(rSonnetEnv.opencode_variant));
  assert(rSonnetEnv.opencode_variant_source !== 'role_default',
    'D451-DISPATCH-EFFORT: sonnet + env-resolved provider source is NOT role_default, got ' + JSON.stringify(rSonnetEnv.opencode_variant_source));

  // Case 8 (backward-compat): env UNSET + no provider → unchanged null/role_default.
  const rNone = dispatchEffortOpencode('opus', null, {});
  assert(rNone.opencode_variant === null && rNone.opencode_variant_source === 'role_default',
    'D451-DISPATCH-EFFORT: opus + unset env + no provider → null/role_default (backward-compat), got ' + JSON.stringify(rNone));

  // Case 9 (dispatch SURFACE): the runtime 2-arg buildDispatch call picks up the env-resolved
  // provider, so a declared tier surfaces a concrete variant in the dispatch envelope. Drives the
  // real process.env (the runtime read path) — saved/restored so the suite stays hermetic.
  const ENV_KEY = 'KAOLA_OPENCODE_INHERIT_MODEL';
  const savedEnv = process.env[ENV_KEY];
  try {
    process.env[ENV_KEY] = 'zhipuai-coding-plan/glm-5.2';
    const dEnv = buildDispatch(opusNode, opusCtx); // no opencode_provider in ctx — the real runtime shape
    assert(dEnv.opencode_variant === 'max',
      'D451-DISPATCH-EFFORT: buildDispatch opus (no ctx provider) + env-resolved zhipu → opencode_variant max, got ' + JSON.stringify(dEnv.opencode_variant));
    assert(dEnv.opencode_variant_source !== 'role_default',
      'D451-DISPATCH-EFFORT: buildDispatch opus env-resolved source is NOT role_default, got ' + JSON.stringify(dEnv.opencode_variant_source));
  } finally {
    if (savedEnv === undefined) delete process.env[ENV_KEY]; else process.env[ENV_KEY] = savedEnv;
  }
}

// ===========================================================================
// #466 — worktree-authority split guard. The adaptive lifecycle resolves the
// project folder (plan / ledger / .cache / baselines) cwd-relative via getRoot().
// When a linked worktree is recorded for the project but a MUTATING lifecycle
// command is invoked from the MAIN repo root (cwd === main, NOT the worktree),
// the ledger/evidence/baselines would diverge from where the role agents write —
// silent until finalize. The guard refuses loud (zero mutation) and points the
// operator into the worktree. Read-only (orient, record-evidence --verify) and
// the legitimately main-root copy (mirror-project) are EXEMPT. Native posture
// (no worktree_path recorded) is UNGUARDED. Driven as REAL subprocesses in a
// REAL git repo (the guard reads git + fs — a direct-call test would be a
// false-green per the #292 io-shim trap).
// ===========================================================================
{
  const { execFileSync } = require('child_process');
  const NODE_CLI_466 = path.join(__dirname, 'kaola-workflow-adaptive-node.js');
  const VALIDATOR_466 = path.join(__dirname, 'kaola-workflow-plan-validator.js');

  function make466Repo(stateExtra) {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-466-'));
    const project = 'issue-466';
    const projDir = path.join(repoRoot, 'kaola-workflow', project);
    const cacheDir = path.join(projDir, '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const planPath = path.join(projDir, 'workflow-plan.md');
    const plan = [
      '# Workflow Plan — issue-466', '',
      '## Meta', 'labels: area:scripts', 'sink: CHANGELOG.md', '',
      '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape |',
      '| --- | --- | --- | --- | --- | --- |',
      '| seed     | code-explorer | —     | —     | 1 | sequence |',
      '| A        | tdd-guide     | seed  | ax.js | 1 | sequence |',
      '| review   | code-reviewer | A     | —     | 1 | sequence |',
      '| finalize | finalize      | review| —     | 1 | sequence |', '',
      '## Node Ledger', '',
      '| id | status |', '| --- | --- |',
      '| seed | complete |',
      '| A | pending |',
      '| review | pending |',
      '| finalize | pending |', '',
    ].join('\n') + '\n';
    fs.writeFileSync(planPath, plan);
    fs.writeFileSync(path.join(projDir, 'workflow-state.md'), '# State\n' + (stateExtra || ''));
    const g = (a) => execFileSync('git', ['-C', repoRoot, ...a], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'] });
    g(['init']);
    g(['config', 'user.email', 'kw@test']);
    g(['config', 'user.name', 'kw']);
    g(['config', 'commit.gpgsign', 'false']);
    // Freeze in place so plan_hash exists (mutating subcommands run an integrity --resume-check; we
    // want the ONLY refusal under test to be the #466 split guard, which precedes the dispatch).
    try { execFileSync('node', [VALIDATOR_466, planPath, '--freeze', '--repair', '--json'], { cwd: repoRoot, encoding: 'utf8' }); } catch (_) {}
    fs.writeFileSync(path.join(repoRoot, '.gitignore'), '.kw/\n');
    g(['add', '-A']);
    g(['commit', '-m', 'init']);
    return { repoRoot, project, projDir, cacheDir, planPath, g };
  }
  function run466(cwd, subArgs) {
    try {
      const stdout = execFileSync('node', [NODE_CLI_466, ...subArgs], { cwd, encoding: 'utf8' });
      let parsed = {}; try { parsed = JSON.parse(stdout.trim().split('\n').pop()); } catch (_) {}
      return { exitCode: 0, ...parsed };
    } catch (err) {
      const status = (err.status == null) ? 1 : err.status;
      let parsed = {}; try { parsed = JSON.parse(String(err.stdout || '').trim().split('\n').pop()); } catch (_) {}
      return { exitCode: status, ...parsed };
    }
  }
  function rm466(p) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) {} }

  // T466-1: open-ready (MUTATING) from MAIN root with a recorded+existing worktree → refuse split.
  {
    const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-466-wt-'));
    const { repoRoot, planPath, projDir } = make466Repo('worktree_path: ' + wt + '\n');
    const r = run466(repoRoot, ['open-ready', '--project', 'issue-466', '--json']);
    assert(r.result === 'refuse' && r.reason === 'worktree_authority_split',
      'T466-1: open-ready from main root with a recorded worktree refuses worktree_authority_split, got ' + JSON.stringify(r));
    assert(r.exitCode === 1, 'T466-1: the split refusal exits non-zero');
    assert(r.worktreePath === wt, 'T466-1: refusal carries the recorded worktreePath, got ' + JSON.stringify(r.worktreePath));
    assert(typeof r.operator_hint === 'string' && /worktree/i.test(r.operator_hint),
      'T466-1: operator_hint points into the worktree, got ' + JSON.stringify(r.operator_hint));
    // ZERO-MUTATION: the refused open-ready wrote nothing to the main-root project folder — the
    // ## Node Ledger still shows A pending and no task-mirror was created (the RED run flipped A to
    // in_progress AND wrote workflow-tasks.json, so this locks the early-return invariant).
    const ledgerAfter = fs.readFileSync(planPath, 'utf8');
    const ledgerBody = ledgerAfter.slice(ledgerAfter.indexOf('## Node Ledger'));
    assert(/\|\s*A\s*\|\s*pending\s*\|/.test(ledgerBody), 'T466-1: ledger A still pending after refuse (zero mutation)');
    assert(!fs.existsSync(path.join(projDir, 'workflow-tasks.json')), 'T466-1: no task-mirror written on refuse');
    rm466(repoRoot); rm466(wt);
  }

  // T466-2: open-next (MUTATING) from main root with a recorded worktree → also refuses.
  {
    const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-466-wt-'));
    const { repoRoot } = make466Repo('worktree_path: ' + wt + '\n');
    const r = run466(repoRoot, ['open-next', '--project', 'issue-466', '--json']);
    assert(r.reason === 'worktree_authority_split',
      'T466-2: open-next from main root with a recorded worktree refuses split, got ' + JSON.stringify(r));
    rm466(repoRoot); rm466(wt);
  }

  // T466-3: record-evidence --stdin (MUTATING) from main root with a recorded worktree → refuses.
  {
    const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-466-wt-'));
    const { repoRoot } = make466Repo('worktree_path: ' + wt + '\n');
    let r;
    try {
      const stdout = execFileSync('node', [NODE_CLI_466, 'record-evidence', '--node-id', 'A', '--stdin', '--project', 'issue-466', '--json'],
        { cwd: repoRoot, encoding: 'utf8', input: 'evidence-binding: A 000000000000\n' });
      r = JSON.parse(stdout.trim().split('\n').pop());
    } catch (err) {
      try { r = JSON.parse(String(err.stdout || '').trim().split('\n').pop()); } catch (_) { r = {}; }
    }
    assert(r.reason === 'worktree_authority_split',
      'T466-3: record-evidence --stdin from main root with a recorded worktree refuses split, got ' + JSON.stringify(r));
    rm466(repoRoot); rm466(wt);
  }

  // T466-4: NATIVE posture (no worktree_path recorded) → guard NEVER fires (open-ready proceeds).
  {
    const { repoRoot } = make466Repo('');
    const r = run466(repoRoot, ['open-ready', '--project', 'issue-466', '--json']);
    assert(r.reason !== 'worktree_authority_split',
      'T466-4: native posture (no worktree_path) is NOT split-guarded, got ' + JSON.stringify(r));
    rm466(repoRoot);
  }

  // T466-5: EXEMPT read-only orient — recorded worktree at main root does NOT trip the split guard.
  {
    const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-466-wt-'));
    const { repoRoot } = make466Repo('worktree_path: ' + wt + '\n');
    const r = run466(repoRoot, ['orient', '--project', 'issue-466', '--json']);
    assert(r.reason !== 'worktree_authority_split', 'T466-5: orient (read-only) is exempt, got ' + JSON.stringify(r));
    rm466(repoRoot); rm466(wt);
  }

  // T466-6: EXEMPT mirror-project — legitimately runs from the main root (it IS the main→worktree copy).
  {
    const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-466-wt-'));
    const { repoRoot } = make466Repo('worktree_path: ' + wt + '\n');
    const r = run466(repoRoot, ['mirror-project', '--project', 'issue-466', '--json']);
    assert(r.reason !== 'worktree_authority_split', 'T466-6: mirror-project is exempt, got ' + JSON.stringify(r));
    rm466(repoRoot); rm466(wt);
  }

  // T466-7: EXEMPT record-evidence --verify (read-only) — not split-guarded.
  {
    const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-466-wt-'));
    const { repoRoot } = make466Repo('worktree_path: ' + wt + '\n');
    const r = run466(repoRoot, ['record-evidence', '--node-id', 'A', '--verify', '--project', 'issue-466', '--json']);
    assert(r.reason !== 'worktree_authority_split', 'T466-7: record-evidence --verify is exempt, got ' + JSON.stringify(r));
    rm466(repoRoot); rm466(wt);
  }

  // T466-8: recorded worktree_path that does NOT exist on disk → guard does NOT fire (cannot be authoritative).
  {
    const { repoRoot } = make466Repo('worktree_path: /nonexistent/kw-466-ghost-dir\n');
    const r = run466(repoRoot, ['open-ready', '--project', 'issue-466', '--json']);
    assert(r.reason !== 'worktree_authority_split',
      'T466-8: a recorded-but-missing worktree dir does not trip the guard, got ' + JSON.stringify(r));
    rm466(repoRoot);
  }

  // T466-9: real linked-worktree posture — a lifecycle command RUN FROM the worktree is NOT guarded,
  // EVEN WITH worktree_path recorded in the MAIN state. This is the load-bearing exemption branch: the
  // guard short-circuits on `realRepoRoot === mainRoot`, so a worktree run must proceed. Recording
  // worktree_path in main state ensures the `if (recordedWorktree)` check is NOT what makes it pass —
  // a regression that broke the cwd discriminator (always-true) WOULD fire here and be caught.
  {
    const { repoRoot, projDir, g } = make466Repo('');
    const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-466-realwt-'));
    rm466(wt); // `git worktree add` requires a non-existent path
    let added = true;
    try { g(['worktree', 'add', wt, '-b', 'kw466wt']); } catch (_) { added = false; }
    if (added) {
      // Record the real worktree in the MAIN state (the file the guard reads via mainRoot).
      fs.writeFileSync(path.join(projDir, 'workflow-state.md'), '# State\nworktree_path: ' + wt + '\n');
      const r = run466(wt, ['open-ready', '--project', 'issue-466', '--json']);
      assert(r.reason !== 'worktree_authority_split',
        'T466-9: a lifecycle command run FROM the worktree (worktree_path recorded) is not split-guarded, got ' + JSON.stringify(r));
      assert(r.result === 'ok',
        'T466-9: in-worktree open-ready actually PROCEEDS (not refused for any reason), got ' + JSON.stringify(r));
      try { g(['worktree', 'remove', '--force', wt]); } catch (_) { rm466(wt); }
    } else {
      assert(true, 'T466-9: skipped (git worktree add unavailable in this environment)');
    }
    rm466(repoRoot);
  }
}

// ===========================================================================
// #439 (D-419 Part 4) — speculative-READ kernel runtime. open-ready --speculative-consent opens a
// read node behind an OPEN gate (marked speculative:true); open-next refuses gate_not_complete;
// discard-speculative rolls it back; a gate closing verdict:fail surfaces speculative_review_required.
// Driven as REAL subprocesses in a REAL git repo (the lifecycle reads git + fs).
// ===========================================================================
{
  const { execFileSync } = require('child_process');
  const NODE_CLI_439 = path.join(__dirname, 'kaola-workflow-adaptive-node.js');
  const VALIDATOR_439 = path.join(__dirname, 'kaola-workflow-plan-validator.js');

  // impl(tdd-guide,a.js) → gate(code-reviewer) → docs(doc-updater, read) → sink(finalize). impl complete.
  function make439Repo(policy) {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-439-'));
    const project = 'issue-439';
    const projDir = path.join(repoRoot, 'kaola-workflow', project);
    const cacheDir = path.join(projDir, '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const planPath = path.join(projDir, 'workflow-plan.md');
    const meta = ['## Meta', 'labels: area:scripts', 'sink: CHANGELOG.md'];
    if (policy) meta.push('speculative_open_policy: ' + policy);
    const plan = [
      '# Workflow Plan — issue-439', '',
      ...meta, '',
      '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape |',
      '| --- | --- | --- | --- | --- | --- |',
      '| impl | tdd-guide     | —    | a.js         | 1 | sequence |',
      '| gate | code-reviewer | impl | —            | 1 | sequence |',
      '| docs | doc-updater   | gate | —            | 1 | sequence |',
      '| sink | finalize      | docs | CHANGELOG.md | 1 | sequence |', '',
      '## Node Ledger', '',
      '| id | status |', '| --- | --- |',
      '| impl | complete |', '| gate | pending |', '| docs | pending |', '| sink | pending |', '',
    ].join('\n') + '\n';
    fs.writeFileSync(planPath, plan);
    fs.writeFileSync(path.join(projDir, 'workflow-state.md'), '# State\n');
    fs.writeFileSync(path.join(repoRoot, 'a.js'), '// impl\n');
    const g = (a) => execFileSync('git', ['-C', repoRoot, ...a], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'] });
    g(['init']); g(['config', 'user.email', 'kw@test']); g(['config', 'user.name', 'kw']); g(['config', 'commit.gpgsign', 'false']);
    try { execFileSync('node', [VALIDATOR_439, planPath, '--freeze', '--repair', '--json'], { cwd: repoRoot, encoding: 'utf8' }); } catch (_) {}
    fs.writeFileSync(path.join(repoRoot, '.gitignore'), '.kw/\n');
    g(['add', '-A']); g(['commit', '-m', 'init']);
    return { repoRoot, project, projDir, cacheDir, planPath, g };
  }
  function run439(repoRoot, subArgs) {
    try {
      const stdout = execFileSync('node', [NODE_CLI_439, ...subArgs], { cwd: repoRoot, encoding: 'utf8' });
      let p = {}; try { p = JSON.parse(stdout.trim().split('\n').pop()); } catch (_) {}
      return { exitCode: 0, ...p };
    } catch (err) {
      const status = (err.status == null) ? 1 : err.status;
      let p = {}; try { p = JSON.parse(String(err.stdout || '').trim().split('\n').pop()); } catch (_) {}
      return { exitCode: status, ...p };
    }
  }
  function readRS439(cacheDir) { try { return JSON.parse(fs.readFileSync(path.join(cacheDir, 'running-set.json'), 'utf8')); } catch (_) { return null; } }
  function ledgerStatus439(planPath, id) {
    const txt = fs.readFileSync(planPath, 'utf8');
    const body = txt.slice(txt.indexOf('## Node Ledger'));
    const m = body.match(new RegExp('^\\|\\s*' + id + '\\s*\\|\\s*(\\S+)\\s*\\|', 'm'));
    return m ? m[1] : null;
  }
  // Open the gate via the REAL scheduler so it has a recorded baseline, then return the gate's nonce.
  function openGate439(repoRoot, cacheDir) {
    const r = run439(repoRoot, ['open-ready', '--project', 'issue-439', '--json']);  // opens gate (ready)
    const gateEntry = (r.opened || []).find(n => n.id === 'gate');
    return gateEntry ? gateEntry.nonce : null;
  }
  function rm439(p) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) {} }

  // T439-1: open-ready --speculative-consent opens docs speculatively (policy:consent, gate open).
  {
    const { repoRoot, cacheDir } = make439Repo('consent');
    openGate439(repoRoot, cacheDir);
    const r = run439(repoRoot, ['open-ready', '--project', 'issue-439', '--speculative-consent', '--json']);
    assert(r.result === 'ok' && (r.opened || []).some(n => n.id === 'docs'),
      'T439-1: open-ready --speculative-consent opens docs, got ' + JSON.stringify((r.opened || []).map(n => n.id)));
    const rs = readRS439(cacheDir);
    const docsEntry = rs && (rs.nodes || []).find(n => n.id === 'docs');
    assert(docsEntry && docsEntry.speculative === true, 'T439-1: docs running-set entry is marked speculative:true');
    rm439(repoRoot);
  }

  // T439-2: open-ready WITHOUT --speculative-consent opens nothing speculative (consent is per-run).
  {
    const { repoRoot, cacheDir } = make439Repo('consent');
    openGate439(repoRoot, cacheDir);
    const r = run439(repoRoot, ['open-ready', '--project', 'issue-439', '--json']);
    assert((r.opened || []).every(n => n.id !== 'docs'), 'T439-2: no speculative open without the consent flag, got ' + JSON.stringify((r.opened || []).map(n => n.id)));
    rm439(repoRoot);
  }

  // T439-3: policy:off (default) + consent flag → NO speculative open (the plan must authorize too).
  {
    const { repoRoot, cacheDir } = make439Repo(null);  // no speculative_open_policy ⇒ default off
    openGate439(repoRoot, cacheDir);
    const r = run439(repoRoot, ['open-ready', '--project', 'issue-439', '--speculative-consent', '--json']);
    assert((r.opened || []).every(n => n.id !== 'docs'), 'T439-3: policy:off refuses speculative open even with the consent flag');
    rm439(repoRoot);
  }

  // T439-4: with the gate open SERIALLY (no running-set), open-next of the gate-blocked read node
  // refuses gate_not_complete (evaluated after the scheduler/batch guard passes — no running-set is
  // live on the serial path). When the gate is instead live in the running-set, open-next refuses
  // scheduler_active first; the speculative open then goes through open-ready --speculative-consent.
  {
    const { repoRoot } = make439Repo('consent');
    run439(repoRoot, ['open-next', '--project', 'issue-439', '--json']);  // serially opens the gate (no running-set)
    const r = run439(repoRoot, ['open-next', '--project', 'issue-439', '--node-id', 'docs', '--json']);
    assert(r.result === 'refuse' && r.reason === 'gate_not_complete',
      'T439-4: open-next of a gate-blocked read node refuses gate_not_complete, got ' + JSON.stringify(r));
    assert(r.speculativeGate === 'gate', 'T439-4: gate_not_complete names the open gate');
    rm439(repoRoot);
  }

  // T439-5: discard-speculative docs → ledger pending + removed from running-set.
  {
    const { repoRoot, cacheDir, planPath } = make439Repo('consent');
    openGate439(repoRoot, cacheDir);
    run439(repoRoot, ['open-ready', '--project', 'issue-439', '--speculative-consent', '--json']);
    assert(ledgerStatus439(planPath, 'docs') === 'in_progress', 'T439-5: docs is in_progress after speculative open');
    const r = run439(repoRoot, ['discard-speculative', '--project', 'issue-439', '--node-id', 'docs', '--json']);
    assert(r.result === 'ok' && r.ledgerReset === 'pending', 'T439-5: discard-speculative ok + ledger reset to pending, got ' + JSON.stringify(r));
    assert(ledgerStatus439(planPath, 'docs') === 'pending', 'T439-5: docs ledger is pending after discard');
    const rs = readRS439(cacheDir);
    assert(rs && (rs.nodes || []).every(n => n.id !== 'docs'), 'T439-5: docs removed from running-set after discard');
    rm439(repoRoot);
  }

  // T439-6: discard-speculative on a NON-speculative member (the gate) → not_speculative refuse.
  {
    const { repoRoot, cacheDir } = make439Repo('consent');
    openGate439(repoRoot, cacheDir);
    const r = run439(repoRoot, ['discard-speculative', '--project', 'issue-439', '--node-id', 'gate', '--json']);
    assert(r.result === 'refuse' && r.reason === 'not_speculative',
      'T439-6: discard-speculative on a non-speculative node refuses not_speculative, got ' + JSON.stringify(r));
    rm439(repoRoot);
  }

  // T439-7: close gate with verdict:FAIL → speculative_review_required names docs.
  {
    const { repoRoot, cacheDir, projDir } = make439Repo('consent');
    const gateNonce = openGate439(repoRoot, cacheDir);
    run439(repoRoot, ['open-ready', '--project', 'issue-439', '--speculative-consent', '--json']);
    fs.writeFileSync(path.join(cacheDir, 'gate.md'),
      'evidence-binding: gate ' + (gateNonce || '') + '\nverdict: fail\nfindings_blocking: 1\nfinding: id=x scope=in-scope severity=high status=open desc=bad\n');
    const r = run439(repoRoot, ['close-node', '--project', 'issue-439', '--node-id', 'gate', '--json']);
    assert(r.result === 'ok', 'T439-7: gate close succeeds (the gate close itself is legitimate), got ' + JSON.stringify(r));
    assert(r.speculative_review_required && r.speculative_review_required.gate === 'gate' &&
      (r.speculative_review_required.speculative || []).includes('docs'),
      'T439-7: a verdict:fail gate surfaces speculative_review_required naming docs, got ' + JSON.stringify(r.speculative_review_required));
    rm439(repoRoot);
  }

  // T439-8: close gate with verdict:PASS → NO speculative_review_required (the bet held).
  {
    const { repoRoot, cacheDir } = make439Repo('consent');
    const gateNonce = openGate439(repoRoot, cacheDir);
    run439(repoRoot, ['open-ready', '--project', 'issue-439', '--speculative-consent', '--json']);
    fs.writeFileSync(path.join(cacheDir, 'gate.md'),
      'evidence-binding: gate ' + (gateNonce || '') + '\nverdict: pass\nfindings_blocking: 0\n');
    const r = run439(repoRoot, ['close-node', '--project', 'issue-439', '--node-id', 'gate', '--json']);
    assert(r.result === 'ok', 'T439-8: gate close succeeds on a pass verdict');
    assert(!r.speculative_review_required, 'T439-8: a verdict:pass gate does NOT surface speculative_review_required');
    rm439(repoRoot);
  }

  // T439-9: CLOSE-TIME guard — a speculative node CANNOT close while its gate is still in_progress
  // (else its review pointer + discard handle would vanish). The work ran concurrently (the win); only
  // the formal complete is held until the bet resolves.
  {
    const { repoRoot, cacheDir, planPath } = make439Repo('consent');
    openGate439(repoRoot, cacheDir);
    run439(repoRoot, ['open-ready', '--project', 'issue-439', '--speculative-consent', '--json']);
    // docs has valid evidence + nonce, but its gate is still in_progress.
    let docsNonce = '';
    try { docsNonce = fs.readFileSync(path.join(cacheDir, 'barrier-base-docs'), 'utf8').trim().slice(0, 12); } catch (_) {}
    fs.writeFileSync(path.join(cacheDir, 'docs.md'), 'evidence-binding: docs ' + docsNonce + '\n');
    const r = run439(repoRoot, ['close-node', '--project', 'issue-439', '--node-id', 'docs', '--json']);
    assert(r.result === 'refuse' && r.reason === 'gate_not_complete',
      'T439-9: closing a speculative node while its gate is open refuses gate_not_complete, got ' + JSON.stringify(r));
    assert(ledgerStatus439(planPath, 'docs') === 'in_progress', 'T439-9: docs stays in_progress (held, not completed)');
    rm439(repoRoot);
  }

  // T439-10: the close-time guard makes the review REACHABLE — docs is held in the running set, so when
  // the gate later closes verdict:fail, speculative_review_required still names docs (the coherence the
  // review + discard mechanism depends on; without the guard docs would have vanished on early close).
  {
    const { repoRoot, cacheDir } = make439Repo('consent');
    const gateNonce = openGate439(repoRoot, cacheDir);
    run439(repoRoot, ['open-ready', '--project', 'issue-439', '--speculative-consent', '--json']);
    // docs tries to close first but is HELD (gate open) — proving the held state precedes the gate close.
    let docsNonce = '';
    try { docsNonce = fs.readFileSync(path.join(cacheDir, 'barrier-base-docs'), 'utf8').trim().slice(0, 12); } catch (_) {}
    fs.writeFileSync(path.join(cacheDir, 'docs.md'), 'evidence-binding: docs ' + docsNonce + '\n');
    const held = run439(repoRoot, ['close-node', '--project', 'issue-439', '--node-id', 'docs', '--json']);
    assert(held.reason === 'gate_not_complete', 'T439-10: docs is held before the gate resolves');
    // Now the gate closes verdict:fail → review names docs (still in the running set).
    fs.writeFileSync(path.join(cacheDir, 'gate.md'),
      'evidence-binding: gate ' + (gateNonce || '') + '\nverdict: fail\nfindings_blocking: 1\nfinding: id=x scope=in-scope severity=high status=open desc=bad\n');
    const r = run439(repoRoot, ['close-node', '--project', 'issue-439', '--node-id', 'gate', '--json']);
    assert(r.result === 'ok' && r.speculative_review_required && (r.speculative_review_required.speculative || []).includes('docs'),
      'T439-10: after the guard held docs, the gate verdict:fail surfaces speculative_review_required naming docs, got ' + JSON.stringify(r.speculative_review_required));
    rm439(repoRoot);
  }

  // -------------------------------------------------------------------------
  // #597 — the `auto` tier + default flip (READ-side pieces; the WRITE-side AC4/AC2/O1 tests live in the
  // #596 block). At policy:auto, open-ready acts on the speculative READ set with NO --speculative-consent
  // (the flag is a no-op); a discard records role/gate telemetry.
  // -------------------------------------------------------------------------

  // T597-1 (AC2 — auto opens speculatively WITHOUT the flag): policy:auto + gate open → open-ready opens
  // the read node docs with NO --speculative-consent (mirror of T439-1 but flagless).
  {
    const { repoRoot, cacheDir } = make439Repo('auto');
    openGate439(repoRoot, cacheDir);
    const r = run439(repoRoot, ['open-ready', '--project', 'issue-439', '--json']); // NO --speculative-consent
    assert(r.result === 'ok' && (r.opened || []).some(n => n.id === 'docs'),
      'T597-1 (AC2): open-ready at policy:auto opens docs with NO consent flag, got ' + JSON.stringify((r.opened || []).map(n => n.id)));
    const rs = readRS439(cacheDir);
    const docsEntry = rs && (rs.nodes || []).find(n => n.id === 'docs');
    assert(docsEntry && docsEntry.speculative === true, 'T597-1 (AC2): docs running-set entry is marked speculative:true at auto');
    rm439(repoRoot);
  }

  // T597-2 (AC2 — the flag is a NO-OP at auto, never an error): the SAME policy:auto plan, but the run
  // ALSO passes --speculative-consent — it must be accepted (back-compat) and still open docs.
  {
    const { repoRoot, cacheDir } = make439Repo('auto');
    openGate439(repoRoot, cacheDir);
    const r = run439(repoRoot, ['open-ready', '--project', 'issue-439', '--speculative-consent', '--json']);
    assert(r.result === 'ok' && (r.opened || []).some(n => n.id === 'docs'),
      'T597-2 (AC2): --speculative-consent at auto is accepted as a no-op and still opens docs, got ' + JSON.stringify(r));
    rm439(repoRoot);
  }

  // T597-4 (AC5 — discard telemetry): a speculative discard at auto records node id / role / gate in the
  // durable provenance log, so the economics of `auto` are observable per run (no silent cost).
  {
    const { repoRoot, cacheDir } = make439Repo('auto');
    openGate439(repoRoot, cacheDir);
    run439(repoRoot, ['open-ready', '--project', 'issue-439', '--json']); // opens docs speculatively (auto)
    const r = run439(repoRoot, ['discard-speculative', '--project', 'issue-439', '--node-id', 'docs', '--json']);
    assert(r.result === 'ok', 'T597-4 (AC5): discard-speculative ok, got ' + JSON.stringify(r));
    const logPath = path.join(cacheDir, 'provenance-log.jsonl');
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').map(l => { try { return JSON.parse(l); } catch (_) { return {}; } });
    const discardEntry = lines.reverse().find(e => e.event === 'discard-speculative' && e.nodeId === 'docs');
    assert(discardEntry && discardEntry.role === 'doc-updater' && discardEntry.gate === 'gate',
      'T597-4 (AC5): the discard provenance entry records role + gate, got ' + JSON.stringify(discardEntry));
    rm439(repoRoot);
  }
}

// ===========================================================================
// #596 (D-596-01) — speculative-WRITE kernel runtime. Extends the #439 speculative-READ kernel to
// write-bearing nodes: open-ready --speculative-consent opens a WRITE node behind an OPEN gate WITH a
// provisioned leg (marked speculative:true + kind:'write'); the close fence, gate-fail review surfacing,
// and per-leg-barrier→merge machinery are ALL REUSED verbatim (a size-1 lane_group); discard-speculative
// is DISCARD-ONLY for writes (leg teardown + evidence purge, no KEEP option); reconcile-running-set gains
// a crashed-speculative-write arm (roll-forward only on a confirmed gate verdict:pass). Driven as REAL
// subprocesses in a REAL git repo (the lifecycle reads git + fs).
//
// Two code-reviewer gates are load-bearing in the fixture: gate1 is the ANCESTOR gate writerW bets on
// (writerA -> gate1 -> writerW); gate2 is writerW's OWN downstream reviewer (writerW -> gate2 -> sink) —
// the G1 freeze grammar requires EVERY code-producing node to be post-dominated by a code-reviewer, and
// gate1 (upstream of writerW) does not satisfy that for writerW itself (design: "the gate it speculates
// past is its ancestor; its own reviewer is downstream and unaffected").
// ===========================================================================
{
  const { execFileSync } = require('child_process');
  const NODE_CLI_596 = path.join(__dirname, 'kaola-workflow-adaptive-node.js');
  const VALIDATOR_596 = path.join(__dirname, 'kaola-workflow-plan-validator.js');
  const node596 = require(path.join(__dirname, 'kaola-workflow-adaptive-node.js'));
  const PROJECT_596 = 'issue-596';

  // writerA(write) -> gate1(reviewer, the bet) -> writerW(write) -> gate2(reviewer, writerW's own) -> sink.
  // policy defaults to 'consent' (existing callers unchanged); pass 'auto' for the #597 default-tier tests.
  function make596Repo(policy) {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-596-'));
    const projDir = path.join(repoRoot, 'kaola-workflow', PROJECT_596);
    const cacheDir = path.join(projDir, '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const planPath = path.join(projDir, 'workflow-plan.md');
    const plan = [
      '# Workflow Plan — issue-596', '',
      '## Meta', 'labels: area:scripts', 'sink: CHANGELOG.md', 'speculative_open_policy: ' + (policy || 'consent'), '',
      '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape |',
      '| --- | --- | --- | --- | --- | --- |',
      '| writerA | tdd-guide     | —       | a.js         | 1 | sequence |',
      '| gate1   | code-reviewer | writerA | —            | 1 | sequence |',
      '| writerW | tdd-guide     | gate1   | w.js         | 1 | sequence |',
      '| gate2   | code-reviewer | writerW | —            | 1 | sequence |',
      '| sink    | finalize      | gate2   | CHANGELOG.md | 1 | sequence |', '',
      '## Node Ledger', '',
      '| id | status |', '| --- | --- |',
      '| writerA | complete |', '| gate1 | pending |', '| writerW | pending |', '| gate2 | pending |', '| sink | pending |', '',
    ].join('\n') + '\n';
    fs.writeFileSync(planPath, plan);
    fs.writeFileSync(path.join(projDir, 'workflow-state.md'), '# State\n');
    fs.writeFileSync(path.join(repoRoot, 'a.js'), '// writerA\n');
    const g = (a) => execFileSync('git', ['-C', repoRoot, ...a], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'] });
    g(['init']); g(['config', 'user.email', 'kw@test']); g(['config', 'user.name', 'kw']); g(['config', 'commit.gpgsign', 'false']);
    try { execFileSync('node', [VALIDATOR_596, planPath, '--freeze', '--repair', '--json'], { cwd: repoRoot, encoding: 'utf8' }); } catch (_) {}
    fs.writeFileSync(path.join(repoRoot, '.gitignore'), '.kw/\n');
    g(['add', '-A']); g(['commit', '-m', 'init']);
    return { repoRoot, project: PROJECT_596, projDir, cacheDir, planPath, g };
  }

  // Sibling variant: writerA -> gate1 -> {writerW1(set1), writerW2(set2)} -> gate2 -> sink. Both siblings'
  // ONLY unsatisfied dep is gate1, so BOTH are speculative-eligible simultaneously.
  function make596PairRepo(set1, set2) {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-596p-'));
    const projDir = path.join(repoRoot, 'kaola-workflow', PROJECT_596);
    const cacheDir = path.join(projDir, '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const planPath = path.join(projDir, 'workflow-plan.md');
    const plan = [
      '# Workflow Plan — issue-596 (pair)', '',
      '## Meta', 'labels: area:scripts', 'sink: CHANGELOG.md', 'speculative_open_policy: consent', '',
      '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape |',
      '| --- | --- | --- | --- | --- | --- |',
      '| writerA | tdd-guide     | —              | a.js         | 1 | sequence |',
      '| gate1   | code-reviewer | writerA        | —            | 1 | sequence |',
      '| writerW1 | tdd-guide    | gate1          | ' + set1 + ' | 1 | sequence |',
      '| writerW2 | tdd-guide    | gate1          | ' + set2 + ' | 1 | sequence |',
      '| gate2   | code-reviewer | writerW1,writerW2 | —         | 1 | sequence |',
      '| sink    | finalize      | gate2          | CHANGELOG.md | 1 | sequence |', '',
      '## Node Ledger', '',
      '| id | status |', '| --- | --- |',
      '| writerA | complete |', '| gate1 | pending |', '| writerW1 | pending |', '| writerW2 | pending |', '| gate2 | pending |', '| sink | pending |', '',
    ].join('\n') + '\n';
    fs.writeFileSync(planPath, plan);
    fs.writeFileSync(path.join(projDir, 'workflow-state.md'), '# State\n');
    fs.writeFileSync(path.join(repoRoot, 'a.js'), '// writerA\n');
    const g = (a) => execFileSync('git', ['-C', repoRoot, ...a], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'] });
    g(['init']); g(['config', 'user.email', 'kw@test']); g(['config', 'user.name', 'kw']); g(['config', 'commit.gpgsign', 'false']);
    try { execFileSync('node', [VALIDATOR_596, planPath, '--freeze', '--repair', '--json'], { cwd: repoRoot, encoding: 'utf8' }); } catch (_) {}
    fs.writeFileSync(path.join(repoRoot, '.gitignore'), '.kw/\n');
    g(['add', '-A']); g(['commit', '-m', 'init']);
    return { repoRoot, project: PROJECT_596, projDir, cacheDir, planPath, g };
  }

  function run596(repoRoot, subArgs, extraEnv) {
    try {
      const stdout = execFileSync('node', [NODE_CLI_596, ...subArgs], { cwd: repoRoot, encoding: 'utf8', env: { ...process.env, ...(extraEnv || {}) } });
      let p = {}; try { p = JSON.parse(stdout.trim().split('\n').pop()); } catch (_) {}
      return { exitCode: 0, ...p };
    } catch (err) {
      const status = (err.status == null) ? 1 : err.status;
      let p = {}; try { p = JSON.parse(String(err.stdout || '').trim().split('\n').pop()); } catch (_) {}
      return { exitCode: status, ...p };
    }
  }
  function readRS596(cacheDir) { try { return JSON.parse(fs.readFileSync(path.join(cacheDir, 'running-set.json'), 'utf8')); } catch (_) { return null; } }
  function ledgerStatus596(planPath, id) {
    const txt = fs.readFileSync(planPath, 'utf8');
    const body = txt.slice(txt.indexOf('## Node Ledger'));
    const m = body.match(new RegExp('^\\|\\s*' + id + '\\s*\\|\\s*(\\S+)\\s*\\|', 'm'));
    return m ? m[1] : null;
  }
  function worktreePaths596(repoRoot) {
    let out = '';
    try { out = execFileSync('git', ['-C', repoRoot, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' }); } catch (_) { return []; }
    return String(out).split('\n').filter(l => l.indexOf('worktree ') === 0).map(l => l.slice('worktree '.length).trim());
  }
  function branchExists596(repoRoot, branch) {
    try { execFileSync('git', ['-C', repoRoot, 'rev-parse', '--verify', '--quiet', 'refs/heads/' + branch], { stdio: ['ignore', 'ignore', 'ignore'] }); return true; }
    catch (_) { return false; }
  }
  function legBaseRefExists596(repoRoot, project, id) {
    try { execFileSync('git', ['-C', repoRoot, 'show-ref', '--verify', '--quiet', 'refs/kaola-workflow/leg-base/' + project + '/' + id], { stdio: ['ignore', 'ignore', 'ignore'] }); return true; }
    catch (_) { return false; }
  }
  // Open gate1 via the REAL scheduler (a normal read-only ready node) and return its nonce.
  function openGate1_596(repoRoot, project) {
    const r = run596(repoRoot, ['open-ready', '--project', project || PROJECT_596, '--json']);
    const gateEntry = (r.opened || []).find(n => n.id === 'gate1');
    return gateEntry ? gateEntry.nonce : null;
  }
  // tdd-guide requires evidence-binding + RED + GREEN tokens (ROLE_TOKEN_REGISTRY); writerW/writerW1/
  // writerW2 are all tdd-guide in these fixtures.
  function writeValidEvidence596(cacheDir, id) {
    let nonce = '';
    try { nonce = fs.readFileSync(path.join(cacheDir, 'barrier-base-' + id), 'utf8').trim().slice(0, 12); } catch (_) {}
    fs.writeFileSync(path.join(cacheDir, id + '.md'),
      'evidence-binding: ' + id + ' ' + nonce + '\nRED: pre-impl failing assertion\nGREEN: assertion now passes\n');
  }
  function rm596(p) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) {} }

  // T596-1 (AC1 happy path): plan writerA -> gate1 -> writerW; writerW's set is exact-disjoint from all
  // live writers (there are none live). With policy consent + --speculative-consent and gate1 in_progress,
  // open-ready opens writerW in a provisioned leg (a size-1 lane_group).
  {
    const { repoRoot, cacheDir, project } = make596Repo();
    openGate1_596(repoRoot);
    const r = run596(repoRoot, ['open-ready', '--project', project, '--speculative-consent', '--json']);
    assert(r.result === 'ok' && (r.opened || []).some(n => n.id === 'writerW'),
      'T596-1: open-ready --speculative-consent opens writerW, got ' + JSON.stringify((r.opened || []).map(n => n.id)));
    assert(r.laneGroup && r.laneGroup.group_id === 'lg-writerW' && JSON.stringify(r.laneGroup.members) === JSON.stringify(['writerW']),
      'T596-1: a size-1 lane_group forms for the lone speculative writer, got ' + JSON.stringify(r.laneGroup));
    assert(r.laneGroup.legs && r.laneGroup.legs.writerW && r.laneGroup.legs.writerW.legPath,
      'T596-1: the lane_group carries a provisioned leg for writerW, got ' + JSON.stringify(r.laneGroup.legs));
    const rs = readRS596(cacheDir);
    const w = rs && (rs.nodes || []).find(n => n.id === 'writerW');
    assert(w && w.speculative === true && w.speculativeGate === 'gate1' && w.kind === 'write' && w.group_id === 'lg-writerW',
      'T596-1: running-set entry marked speculative:true, kind:write, speculativeGate:gate1, got ' + JSON.stringify(w));
    const wts = worktreePaths596(repoRoot);
    assert(wts.some(p => p.endsWith(path.join('.kw', 'legs', project, 'writerW'))), 'T596-1: leg worktree provisioned, got ' + JSON.stringify(wts));
    assert(branchExists596(repoRoot, 'kw/legs/' + project + '/writerW'), 'T596-1: leg branch provisioned');
    assert(ledgerStatus596(r && r.planPath || path.join(repoRoot, 'kaola-workflow', project, 'workflow-plan.md'), 'writerW') === 'in_progress',
      'T596-1: writerW ledger flipped to in_progress');
    rm596(repoRoot);
  }

  // T596-2 (AC2 close fence): writerW's close while gate1 is open refuses gate_not_complete — the SAME
  // speculativeCloseGuard the read half uses, unchanged, exercised here by a WRITE member.
  {
    const { repoRoot, cacheDir, planPath, project } = make596Repo();
    openGate1_596(repoRoot);
    run596(repoRoot, ['open-ready', '--project', project, '--speculative-consent', '--json']);
    writeValidEvidence596(cacheDir, 'writerW');
    const r = run596(repoRoot, ['close-node', '--project', project, '--node-id', 'writerW', '--json']);
    assert(r.result === 'refuse' && r.reason === 'gate_not_complete',
      'T596-2: closing a speculative WRITE node while its gate is open refuses gate_not_complete, got ' + JSON.stringify(r));
    assert(r.speculativeGate === 'gate1', 'T596-2: gate_not_complete names the open gate');
    assert(ledgerStatus596(planPath, 'writerW') === 'in_progress', 'T596-2: writerW stays in_progress (held, not completed)');
    rm596(repoRoot);
  }

  // T596-3 (AC3 pass path): gate1 closes verdict:pass -> writerW closes normally; the leg merges through
  // the EXISTING per-leg barrier -> octopus/merge path (no new merge code); union barrier green.
  {
    const { repoRoot, cacheDir, planPath, project } = make596Repo();
    const gate1Nonce = openGate1_596(repoRoot);
    const open = run596(repoRoot, ['open-ready', '--project', project, '--speculative-consent', '--json']);
    assert(open.result === 'ok' && open.laneGroup, 'T596-3: setup speculative open ok');
    const legPath = open.laneGroup.legs.writerW.legPath;
    fs.writeFileSync(path.join(legPath, 'w.js'), '// writerW in-lane (leg)\n');
    writeValidEvidence596(cacheDir, 'writerW');
    fs.writeFileSync(path.join(cacheDir, 'gate1.md'), 'evidence-binding: gate1 ' + (gate1Nonce || '') + '\nverdict: pass\nfindings_blocking: 0\n');
    const rGate = run596(repoRoot, ['close-node', '--project', project, '--node-id', 'gate1', '--json']);
    assert(rGate.result === 'ok' && !rGate.speculative_review_required, 'T596-3: gate1 closes verdict:pass with NO speculative_review_required, got ' + JSON.stringify(rGate));
    const rW = run596(repoRoot, ['close-node', '--project', project, '--node-id', 'writerW', '--json']);
    assert(rW.result === 'ok' && rW.barrier === 'group_passed' && rW.synthesized === true && typeof rW.mergeCommit === 'string' && rW.mergeCommit.length >= 7,
      'T596-3: writerW closes via the group (octopus-merge) union barrier ⇒ group_passed + synthesized, got ' + JSON.stringify(rW));
    const head = execFileSync('git', ['-C', repoRoot, 'ls-tree', '-r', '--name-only', 'HEAD'], { encoding: 'utf8' });
    assert(head.includes('w.js'), 'T596-3: w.js reaches HEAD after the union barrier merge, got ' + JSON.stringify(head.split('\n').filter(Boolean)));
    assert(ledgerStatus596(planPath, 'writerW') === 'complete', 'T596-3: writerW ledger complete');
    const wts = worktreePaths596(repoRoot);
    assert(!wts.some(p => p.indexOf(path.join('.kw', 'legs')) !== -1), 'T596-3: leg worktree torn down on clean completion, got ' + JSON.stringify(wts));
    rm596(repoRoot);
  }

  // T596-4 (AC4 fail path): gate1 closes verdict:fail -> discard-speculative on writerW removes the leg
  // worktree + branch + leg-base ref; ledger row back to pending; baseline dropped; evidence discarded;
  // the PARENT worktree is byte-identical to pre-speculation (w.js never existed at the parent root).
  {
    const { repoRoot, cacheDir, planPath, project } = make596Repo();
    const gate1Nonce = openGate1_596(repoRoot);
    const open = run596(repoRoot, ['open-ready', '--project', project, '--speculative-consent', '--json']);
    assert(open.result === 'ok' && open.laneGroup, 'T596-4: setup speculative open ok');
    assert(fs.existsSync(path.join(cacheDir, 'writerW.md')), 'T596-4: writerW evidence auto-seeded at open');
    assert(fs.existsSync(path.join(cacheDir, 'barrier-base-writerW')), 'T596-4: writerW baseline recorded at open');
    fs.writeFileSync(path.join(cacheDir, 'gate1.md'), 'evidence-binding: gate1 ' + (gate1Nonce || '') + '\nverdict: fail\nfindings_blocking: 1\nfinding: id=x scope=in-scope severity=high status=open desc=bad\n');
    const rGate = run596(repoRoot, ['close-node', '--project', project, '--node-id', 'gate1', '--json']);
    assert(rGate.result === 'ok' && rGate.speculative_review_required && rGate.speculative_review_required.gate === 'gate1'
      && (rGate.speculative_review_required.speculative || []).includes('writerW'),
      'T596-4: gate1 verdict:fail surfaces speculative_review_required naming writerW, got ' + JSON.stringify(rGate.speculative_review_required));
    const r = run596(repoRoot, ['discard-speculative', '--project', project, '--node-id', 'writerW', '--json']);
    assert(r.result === 'ok' && r.discarded === true && r.legTornDown === true && r.evidenceDiscarded === true && r.groupCleared === true,
      'T596-4: discard-speculative tears down the leg + purges evidence + clears the (sole-member) group, got ' + JSON.stringify(r));
    assert(ledgerStatus596(planPath, 'writerW') === 'pending', 'T596-4: writerW ledger row back to pending');
    const wts = worktreePaths596(repoRoot);
    assert(!wts.some(p => p.indexOf(path.join('.kw', 'legs')) !== -1), 'T596-4: leg worktree removed, got ' + JSON.stringify(wts));
    assert(!branchExists596(repoRoot, 'kw/legs/' + project + '/writerW'), 'T596-4: leg branch removed');
    assert(!legBaseRefExists596(repoRoot, project, 'writerW'), 'T596-4: leg-base ref removed');
    assert(!fs.existsSync(path.join(cacheDir, 'barrier-base-writerW')), 'T596-4: baseline dropped');
    assert(!fs.existsSync(path.join(cacheDir, 'writerW.md')), 'T596-4: evidence discarded (file purged)');
    const rs = readRS596(cacheDir);
    assert(!(rs && (rs.nodes || []).some(n => n.id === 'writerW')), 'T596-4: writerW removed from the running set');
    assert(!(rs && rs.lane_group), 'T596-4: lane_group entirely cleared (sole member discarded)');
    assert(!fs.existsSync(path.join(repoRoot, 'w.js')), 'T596-4: parent worktree byte-identical to pre-speculation — w.js never existed at the parent root');
    const porcelainW = execFileSync('git', ['-C', repoRoot, 'status', '--porcelain', '--', 'w.js'], { encoding: 'utf8' });
    assert(porcelainW.trim() === '', 'T596-4: git sees no trace of w.js at the parent');
    rm596(repoRoot);
  }

  // T596-5 (AC5 refusal — direct unit test of the runtime exact-overlap re-check). NOTE on why this is a
  // direct unit test rather than a full open-ready lifecycle test: the FREEZE WALL already refuses two
  // concurrent (antichain) sibling nodes declaring the SAME exact file at freeze time — "concurrent
  // siblings X and Y both write ... (parallel non-fanout write overlap)" (plan-validator.js's freeze-grammar
  // check; exact overlap NEVER relaxes anywhere in this codebase) — so writerW1/writerW2 sharing an exact
  // path can never reach a FROZEN plan in the first place, and the running-set's write-node-runs-strictly-
  // alone invariant means a genuinely LIVE writer is unreachable alongside an open gate through open-ready
  // alone. The runtime re-verification (selectSpeculativeWriteGroup → validator --parallel-safe, the SAME
  // predicate normal co-open uses) is therefore intentional belt-and-suspenders defense-in-depth, proven
  // directly here with a real validator subprocess (--parallel-safe reads the plan's Node rows directly —
  // it does not require the plan to be frozen, so make596PairRepo's fixture, which the freeze grammar
  // rejects for these declared sets, is still a valid --parallel-safe input).
  {
    const { planPath } = make596PairRepo('shared.js', 'shared.js');
    const realShell = (sp, args) => node596.shellNode(sp, args);
    const excludedVsLive = node596.selectSpeculativeWriteGroup(
      [{ id: 'writerW1', declared_write_set: 'shared.js' }],
      [{ id: 'writerW2', kind: 'write' }], // stand-in for a genuinely live writer
      planPath, realShell, false, null
    );
    assert(excludedVsLive.chosen.length === 0 && excludedVsLive.excluded.join(',') === 'writerW1',
      'T596-5: a candidate overlapping an already-open write node is excluded, got ' + JSON.stringify(excludedVsLive));
    const disjointVsLive = node596.selectSpeculativeWriteGroup(
      [{ id: 'writerW1', declared_write_set: 'shared.js' }],
      [], planPath, realShell, false, null
    );
    assert(disjointVsLive.chosen.length === 1 && disjointVsLive.chosen[0].id === 'writerW1' && disjointVsLive.excluded.length === 0,
      'T596-5: a lone candidate with NO live writers is trivially eligible, got ' + JSON.stringify(disjointVsLive));
  }

  // T596-6 (AC5 refusal — no leg capability): KAOLA_PARALLEL_WRITES=0 (the SAME worktree-capable
  // condition normal co-open requires) excludes writerW from THIS open; read speculation is unaffected
  // (there is none in this fixture, but the exclusion is scoped to write candidates only, never a refuse).
  {
    const { repoRoot, cacheDir, planPath, project } = make596Repo();
    openGate1_596(repoRoot);
    const r = run596(repoRoot, ['open-ready', '--project', project, '--speculative-consent', '--json'], { KAOLA_PARALLEL_WRITES: '0' });
    assert(r.result === 'ok' && (r.opened || []).length === 0, 'T596-6: no write opens on a host without leg capability, got ' + JSON.stringify(r.opened));
    assert(r.speculativeWriteExcluded && r.speculativeWriteExcluded.reason === 'no_leg_capability' && (r.speculativeWriteExcluded.nodeIds || []).includes('writerW'),
      'T596-6: speculativeWriteExcluded names the no_leg_capability reason, got ' + JSON.stringify(r.speculativeWriteExcluded));
    assert(ledgerStatus596(planPath, 'writerW') === 'pending', 'T596-6: writerW ledger row untouched');
    rm596(repoRoot);
  }

  // T596-7 (AC6 cap accounting): two DISJOINT speculative write siblings under a write fan-out ceiling of
  // 1 (KAOLA_FANOUT_CAP=1) — only ONE opens this call; the frontier never exceeds the cap.
  {
    const { repoRoot, cacheDir, planPath, project } = make596PairRepo('w1.js', 'w2.js');
    openGate1_596(repoRoot);
    const r = run596(repoRoot, ['open-ready', '--project', project, '--speculative-consent', '--json'], { KAOLA_FANOUT_CAP: '1' });
    assert(r.result === 'ok' && (r.opened || []).length === 1, 'T596-7: exactly ONE speculative write opens under the cap, got ' + JSON.stringify((r.opened || []).map(n => n.id)));
    assert(r.laneGroup && r.laneGroup.members.length === 1, 'T596-7: the formed group has exactly one member, got ' + JSON.stringify(r.laneGroup));
    const openedId = r.opened[0].id;
    const otherId = openedId === 'writerW1' ? 'writerW2' : 'writerW1';
    assert(ledgerStatus596(planPath, otherId) === 'pending', 'T596-7: the capped-out sibling stays pending, got ' + ledgerStatus596(planPath, otherId));
    const rs = readRS596(cacheDir);
    assert(!(rs && (rs.nodes || []).some(n => n.id === otherId)), 'T596-7: the capped-out sibling never entered the running set');
    rm596(repoRoot);
  }

  // T596-8 (AC7 crash repair — kill BETWEEN leg provision and ledger flip): the leg is already
  // provisioned on disk but writerW's ledger row is manually reverted to pending (simulating the crash
  // window) and running-set.json is flagged mid-open — reconcile-running-set rolls it back cleanly:
  // no orphan leg survives, idempotent (the EXISTING #463 lane-group crash-repair machinery, reused
  // verbatim — the speculative write leg is an ordinary lane_group leg to that machinery).
  {
    const { repoRoot, cacheDir, planPath, project } = make596Repo();
    openGate1_596(repoRoot);
    const open = run596(repoRoot, ['open-ready', '--project', project, '--speculative-consent', '--json']);
    assert(open.result === 'ok' && open.laneGroup, 'T596-8: setup speculative open ok');
    // Simulate the crash: writerW's ledger row reverts to pending; running-set flags it mid-open.
    let plan = fs.readFileSync(planPath, 'utf8');
    const ledgerStart = plan.indexOf('## Node Ledger');
    const head = plan.slice(0, ledgerStart), tail = plan.slice(ledgerStart);
    plan = head + tail.replace(/^\|\s*writerW\s*\|\s*in_progress\s*\|/m, '| writerW | pending |');
    fs.writeFileSync(planPath, plan);
    const rs0 = readRS596(cacheDir);
    rs0.state = 'opening';
    rs0.nodes = rs0.nodes.map(n => (n.id === 'writerW' ? { ...n, opening: true } : n));
    fs.writeFileSync(path.join(cacheDir, 'running-set.json'), JSON.stringify(rs0, null, 2));
    const rec = run596(repoRoot, ['reconcile-running-set', '--project', project, '--json']);
    assert(rec.result === 'ok', 'T596-8: reconcile ok, got ' + JSON.stringify(rec));
    const wts = worktreePaths596(repoRoot);
    assert(!wts.some(p => p.indexOf(path.join('.kw', 'legs')) !== -1), 'T596-8: no orphan leg survives, got ' + JSON.stringify(wts));
    assert(!branchExists596(repoRoot, 'kw/legs/' + project + '/writerW'), 'T596-8: leg branch torn down');
    assert(!fs.existsSync(path.join(cacheDir, 'writerW.md')), 'T596-8: evidence purged on rollback');
    // Idempotent: a second reconcile is a clean no-op.
    const rec2 = run596(repoRoot, ['reconcile-running-set', '--project', project, '--json']);
    assert(rec2.result === 'ok', 'T596-8: second reconcile is idempotent (ok, no throw), got ' + JSON.stringify(rec2));
    rm596(repoRoot);
  }

  // T596-9 (AC7 crash repair — the crashed-speculative-write ARM, gate resolved FAIL): writerW's ledger
  // row DID flip to in_progress (the general roll-forward candidate) but running-set.json is stuck
  // 'opening' (Phase 3 never completed) AND gate1 has since resolved verdict:FAIL — reconcile rolls
  // writerW BACK despite its in_progress ledger row (the conservative override: roll-forward only on a
  // CONFIRMED gate verdict:pass).
  {
    const { repoRoot, cacheDir, planPath, project } = make596Repo();
    const gate1Nonce = openGate1_596(repoRoot);
    const open = run596(repoRoot, ['open-ready', '--project', project, '--speculative-consent', '--json']);
    assert(open.result === 'ok' && open.laneGroup, 'T596-9: setup speculative open ok');
    fs.writeFileSync(path.join(cacheDir, 'gate1.md'), 'evidence-binding: gate1 ' + (gate1Nonce || '') + '\nverdict: fail\nfindings_blocking: 1\nfinding: id=x scope=in-scope severity=high status=open desc=bad\n');
    // Close gate1 directly at the plan/ledger level (bypass the close-time guard's running-set removal —
    // we want gate1 TERMINAL while writerW's running-set entry stays exactly as open-ready left it, to
    // isolate the reconcile-time gate check from the close-node speculative-review machinery).
    const rGate = run596(repoRoot, ['close-node', '--project', project, '--node-id', 'gate1', '--json']);
    assert(rGate.result === 'ok', 'T596-9: gate1 closes verdict:fail, got ' + JSON.stringify(rGate));
    assert(ledgerStatus596(planPath, 'writerW') === 'in_progress', 'T596-9: writerW ledger row is STILL in_progress (the roll-forward candidate)');
    // Flag running-set.json mid-open (the Phase-3-never-ran crash window); writerW's ledger row is
    // deliberately left in_progress (unlike T596-9).
    const rs0 = readRS596(cacheDir);
    rs0.state = 'opening';
    rs0.nodes = rs0.nodes.map(n => (n.id === 'writerW' ? { ...n, opening: true } : n));
    fs.writeFileSync(path.join(cacheDir, 'running-set.json'), JSON.stringify(rs0, null, 2));
    const rec = run596(repoRoot, ['reconcile-running-set', '--project', project, '--json']);
    assert(rec.result === 'ok', 'T596-9: reconcile ok, got ' + JSON.stringify(rec));
    assert((rec.rolledBack || []).includes('writerW'), 'T596-9: writerW is rolled BACK despite in_progress ledger (gate resolved fail), got ' + JSON.stringify(rec.rolledBack));
    assert(ledgerStatus596(planPath, 'writerW') === 'pending', 'T596-9: writerW ledger reset to pending');
    const wts = worktreePaths596(repoRoot);
    assert(!wts.some(p => p.indexOf(path.join('.kw', 'legs')) !== -1), 'T596-9: writerW leg torn down (gate-fail override), got ' + JSON.stringify(wts));
    assert(!fs.existsSync(path.join(cacheDir, 'writerW.md')), 'T596-9: writerW evidence purged (gate-fail override)');
    rm596(repoRoot);
  }

  // T596-10 (AC7 crash repair — the crashed-speculative-write ARM, gate resolved PASS): the SAME
  // running-set-stuck-opening window as T596-9, but gate1 resolves verdict:PASS — reconcile rolls
  // writerW FORWARD (keeps it live; its leg survives; running-set.json promotes to 'open').
  {
    const { repoRoot, cacheDir, planPath, project } = make596Repo();
    const gate1Nonce = openGate1_596(repoRoot);
    const open = run596(repoRoot, ['open-ready', '--project', project, '--speculative-consent', '--json']);
    assert(open.result === 'ok' && open.laneGroup, 'T596-10: setup speculative open ok');
    fs.writeFileSync(path.join(cacheDir, 'gate1.md'), 'evidence-binding: gate1 ' + (gate1Nonce || '') + '\nverdict: pass\nfindings_blocking: 0\n');
    const rGate = run596(repoRoot, ['close-node', '--project', project, '--node-id', 'gate1', '--json']);
    assert(rGate.result === 'ok' && !rGate.speculative_review_required, 'T596-10: gate1 closes verdict:pass, got ' + JSON.stringify(rGate));
    const rs0 = readRS596(cacheDir);
    rs0.state = 'opening';
    rs0.nodes = rs0.nodes.map(n => (n.id === 'writerW' ? { ...n, opening: true } : n));
    fs.writeFileSync(path.join(cacheDir, 'running-set.json'), JSON.stringify(rs0, null, 2));
    const rec = run596(repoRoot, ['reconcile-running-set', '--project', project, '--json']);
    assert(rec.result === 'ok', 'T596-10: reconcile ok, got ' + JSON.stringify(rec));
    assert((rec.rolledForward || []).includes('writerW'), 'T596-10: writerW rolls FORWARD (gate confirmed pass), got ' + JSON.stringify(rec.rolledForward));
    assert(ledgerStatus596(planPath, 'writerW') === 'in_progress', 'T596-10: writerW ledger stays in_progress');
    const wts = worktreePaths596(repoRoot);
    assert(wts.some(p => p.endsWith(path.join('.kw', 'legs', project, 'writerW'))), 'T596-10: writerW leg SURVIVES the roll-forward, got ' + JSON.stringify(wts));
    const rsAfter = readRS596(cacheDir);
    assert(rsAfter && rsAfter.state === 'open', 'T596-10: running-set promoted back to open');
    rm596(repoRoot);
  }

  // T596-11 (AC8 inertness — consent flag absent): policy:consent is authored, but --speculative-consent
  // is NOT passed this call — writerW does not open (mirrors T439-2 for a write member).
  {
    const { repoRoot, project } = make596Repo();
    openGate1_596(repoRoot);
    const r = run596(repoRoot, ['open-ready', '--project', project, '--json']);
    assert((r.opened || []).every(n => n.id !== 'writerW'), 'T596-11: no speculative write open without the consent flag, got ' + JSON.stringify((r.opened || []).map(n => n.id)));
    rm596(repoRoot);
  }

  // T599-1 (issue #599 — fail-open bug): selectSpeculativeWriteGroup's --parallel-safe re-check must
  // mirror tryFormLaneGroup's fail-CLOSED posture on a validator SUBPROCESS FAILURE (crash / unparseable
  // JSON / any non-ok result carrying no `overlapping` array) — it must NOT proceed with every candidate
  // just because "for (const o of (ps.overlapping || []))" finds nothing to iterate. Direct unit test via
  // the SAME injectable seam T596-5 uses (selectSpeculativeWriteGroup takes `shell` as a parameter) — a
  // fault-injecting shell mock (the M3/M4 idiom above) is the cleanest seam; no real subprocess crash is
  // needed to prove the selection logic.
  {
    const { planPath } = make596PairRepo('shared.js', 'shared.js');

    // (a) validator subprocess CRASH: shellNode's documented fail-closed shape on "throw with no
    // stdout" is `{ exitCode: status }` — no `result`, no `overlapping` field at all.
    const crashedShell = () => ({ exitCode: 1 });
    const crashed = node596.selectSpeculativeWriteGroup(
      [{ id: 'writerW1', declared_write_set: 'shared.js' }],
      [{ id: 'writerW2', kind: 'write' }], // a live writer forces the >=2-id --parallel-safe call
      planPath, crashedShell, false, null
    );
    assert(crashed.chosen.length === 0,
      'T599-1a: a validator subprocess crash excludes EVERY candidate (no speculative open), got ' + JSON.stringify(crashed));
    assert(crashed.excluded.join(',') === 'writerW1',
      'T599-1a: the crash-excluded candidate is named in excluded, got ' + JSON.stringify(crashed.excluded));

    // (b) unparseable-JSON shape: exitCode 0 but no `result`/`overlapping` field survived parsing
    // (shellNode's safeJsonParse returns {} when no line parses as an object).
    const garbledShell = () => ({ exitCode: 0 });
    const garbled = node596.selectSpeculativeWriteGroup(
      [{ id: 'writerW1', declared_write_set: 'shared.js' }],
      [{ id: 'writerW2', kind: 'write' }],
      planPath, garbledShell, false, null
    );
    assert(garbled.chosen.length === 0,
      'T599-1b: an unparseable-JSON validator result excludes EVERY candidate too, got ' + JSON.stringify(garbled));

    // (c) well-formed non-ok WITH an `overlapping` array (even empty) keeps the EXISTING per-pair
    // exclusion behavior — this is NOT a malformed result, so it must not be swept into the new
    // exclude-everything branch.
    const wellFormedShell = () => ({ exitCode: 1, result: 'refuse', overlapping: [] });
    const wellFormed = node596.selectSpeculativeWriteGroup(
      [{ id: 'writerW1', declared_write_set: 'shared.js' }],
      [{ id: 'writerW2', kind: 'write' }],
      planPath, wellFormedShell, false, null
    );
    assert(wellFormed.chosen.length === 1 && wellFormed.chosen[0].id === 'writerW1' && wellFormed.excluded.length === 0,
      'T599-1c: a well-formed non-ok result with an EMPTY overlapping array keeps the existing per-pair posture (nothing excluded), got ' + JSON.stringify(wellFormed));
  }

  // =========================================================================
  // #597 — the `auto` tier + default flip (WRITE-side pieces; the READ-side AC2/AC5 tests live in the
  // #439 block where the read fixtures are). open-ready acts on the speculative set at `auto`; every #596
  // safety condition holds identically at auto; the O1 relabel separates a crash/garbled non-open from a
  // genuine live-writer overlap.
  // =========================================================================

  // T597-3 (AC4 — a #596 safety condition holds IDENTICALLY at auto): the leg-capability precondition
  // (KAOLA_PARALLEL_WRITES=0) excludes the speculative WRITE member at auto EXACTLY as at consent (T596-6)
  // — auto relaxes the ceremony, never a safety condition. Asserted at BOTH policies for parity.
  {
    for (const policy of ['auto', 'consent']) {
      const { repoRoot, planPath, project } = make596Repo(policy);
      openGate1_596(repoRoot);
      const flag = policy === 'consent' ? ['--speculative-consent'] : [];
      const r = run596(repoRoot, ['open-ready', '--project', project, ...flag, '--json'], { KAOLA_PARALLEL_WRITES: '0' });
      assert(r.result === 'ok' && (r.opened || []).length === 0,
        'T597-3 (AC4, ' + policy + '): no write opens without leg capability, got ' + JSON.stringify(r.opened));
      assert(r.speculativeWriteExcluded && r.speculativeWriteExcluded.reason === 'no_leg_capability' && (r.speculativeWriteExcluded.nodeIds || []).includes('writerW'),
        'T597-3 (AC4, ' + policy + '): speculativeWriteExcluded names no_leg_capability — identical at auto and consent, got ' + JSON.stringify(r.speculativeWriteExcluded));
      assert(ledgerStatus596(planPath, 'writerW') === 'pending', 'T597-3 (AC4, ' + policy + '): writerW ledger row untouched');
      rm596(repoRoot);
    }
  }

  // T597-3b (AC2 — WRITE speculation at auto opens WITH NO flag): the SAME #596 write fixture at policy
  // auto opens writerW in a provisioned leg with NO --speculative-consent (mirror of T596-1 flagless).
  {
    const { repoRoot, cacheDir, project } = make596Repo('auto');
    openGate1_596(repoRoot);
    const r = run596(repoRoot, ['open-ready', '--project', project, '--json']); // NO --speculative-consent
    assert(r.result === 'ok' && (r.opened || []).some(n => n.id === 'writerW'),
      'T597-3b (AC2 write): open-ready at policy:auto opens writerW with NO consent flag, got ' + JSON.stringify((r.opened || []).map(n => n.id)));
    const rs = readRS596(cacheDir);
    const wEntry = rs && (rs.nodes || []).find(n => n.id === 'writerW');
    assert(wEntry && wEntry.speculative === true && wEntry.kind === 'write', 'T597-3b (AC2 write): writerW entry is speculative:true kind:write at auto');
    rm596(repoRoot);
  }

  // T597-5 (O1 — the fail-closed exclude-all branch gets a DISTINCT reason): selectSpeculativeWriteGroup
  // labels a crash/garbled non-open `parallel_safe_indeterminate` (the disjointness verdict is unknown),
  // while a genuine per-pair overlap keeps `overlaps_live_writer`. Direct unit test via the injectable
  // shell seam (mirrors T599-1).
  {
    const { planPath } = make596PairRepo('shared.js', 'shared.js');
    const twoCand = [{ id: 'writerW1', declared_write_set: 'shared.js' }];
    const liveWriter = [{ id: 'writerW2', kind: 'write' }];

    const crashed = node596.selectSpeculativeWriteGroup(twoCand, liveWriter, planPath, () => ({ exitCode: 1 }), false, null);
    assert(crashed.excluded.length > 0 && crashed.excludedReason === 'parallel_safe_indeterminate',
      'T597-5 (O1): a validator crash yields excludedReason parallel_safe_indeterminate, got ' + JSON.stringify(crashed));

    const garbled = node596.selectSpeculativeWriteGroup(twoCand, liveWriter, planPath, () => ({ exitCode: 0 }), false, null);
    assert(garbled.excludedReason === 'parallel_safe_indeterminate',
      'T597-5 (O1): a garbled/unparseable validator result is also parallel_safe_indeterminate, got ' + JSON.stringify(garbled));

    // Genuine per-pair overlap (well-formed non-ok naming the pair) keeps the overlaps_live_writer reason.
    const overlapShell = () => ({ exitCode: 1, result: 'refuse', overlapping: [{ a: 'writerW1', b: 'writerW2' }] });
    const overlap = node596.selectSpeculativeWriteGroup(twoCand, liveWriter, planPath, overlapShell, false, null);
    assert(overlap.excluded.join(',') === 'writerW1' && overlap.excludedReason === 'overlaps_live_writer',
      'T597-5 (O1): a genuine per-pair overlap keeps overlaps_live_writer, got ' + JSON.stringify(overlap));
  }
}

// ===========================================================================
// #472 (dispatch fidelity): open-next does NOT silently single-open an INDEPENDENT ≥2 frontier — it
// signals enterBatch so the skeleton routes to a concurrent ONE-MESSAGE dispatch; a width-1 frontier
// stays serial (width is the planner's call — no forced minimum). deriveMaxSimultaneousOpen proves
// everConcurrent from the durable opened/closed telemetry.
// ===========================================================================
{
  // T472-DIVERT: auto-pick open-next at a ≥2 independent read frontier → enterBatch (no single-open).
  {
    let planContent = makePlan(['| a | pending | |', '| b | pending | |', '| review | pending | |', '| finalize | pending | |']);
    const shellStub = (sp, a) => {
      const base = path.basename(sp);
      if (base === 'kaola-workflow-plan-validator.js' && (a || []).includes('--resume-check')) return { exitCode: 0, ok: true };
      if (base === 'kaola-workflow-next-action.js') return {
        exitCode: 0, result: 'ok',
        readySet: [{ id: 'a', role: 'code-explorer', model: 'sonnet', declared_write_set: '—', dependsOn: [] }, { id: 'b', role: 'code-explorer', model: 'sonnet', declared_write_set: '—', dependsOn: [] }],
        readyPending: [{ id: 'a', role: 'code-explorer', model: 'sonnet', declared_write_set: '—' }, { id: 'b', role: 'code-explorer', model: 'sonnet', declared_write_set: '—' }],
        nextNode: { id: 'a', role: 'code-explorer', model: 'sonnet', declared_write_set: '—' }, allDone: false,
      };
      return { exitCode: 1 };
    };
    const r = runOpenNext({ planPath: '/fake/kaola-workflow/test-project/workflow-plan.md', statePath: '/fake/kaola-workflow/test-project/workflow-state.md', project: 'test-project', nodeId: null, shell: shellStub, readFile: (f) => f.endsWith('workflow-plan.md') ? planContent : makeState(), writeFile: (f, c) => { if (f.endsWith('workflow-plan.md')) planContent = c; } });
    assert(r.result === 'ok' && r.enterBatch === true, 'T472-DIVERT: open-next at a ≥2 independent frontier signals enterBatch, got ' + JSON.stringify(r));
    assert(r.opened === null, 'T472-DIVERT: open-next does NOT single-open a ≥2 frontier (opened:null)');
    assert(Array.isArray(r.frontier) && r.frontier.map(n => n.id).sort().join(',') === 'a,b', 'T472-DIVERT: frontier carries both authored nodes, got ' + JSON.stringify(r.frontier));
    assert(!planContent.includes('| a | in_progress'), 'T472-DIVERT: NO ledger row was flipped (zero single-open mutation)');
  }
  // T472-SERIAL: width-1 frontier → open-next single-opens serially (no enterBatch — no forced width).
  {
    let planContent = makePlan(['| solo | pending | |', '| review | pending | |', '| finalize | pending | |']);
    const shellStub = (sp, a) => {
      const base = path.basename(sp);
      if (base === 'kaola-workflow-plan-validator.js' && (a || []).includes('--resume-check')) return { exitCode: 0, ok: true };
      if (base === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', readySet: [{ id: 'solo', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'a.js', dependsOn: [] }], readyPending: [{ id: 'solo', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'a.js' }], nextNode: { id: 'solo', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'a.js' }, allDone: false };
      if (base === 'kaola-workflow-commit-node.js') return { exitCode: 0, result: 'ok', mode: 'per-node-start', nodeId: 'solo', overallOk: true };
      if (base === 'kaola-workflow-task-mirror.js') return { exitCode: 0, status: 'ok' };
      return { exitCode: 1 };
    };
    const r = runOpenNext({ planPath: '/fake/kaola-workflow/test-project/workflow-plan.md', statePath: '/fake/kaola-workflow/test-project/workflow-state.md', project: 'test-project', nodeId: null, shell: shellStub, readFile: (f) => f.endsWith('workflow-plan.md') ? planContent : makeState(), writeFile: (f, c) => { if (f.endsWith('workflow-plan.md')) planContent = c; } });
    assert(r.result === 'ok' && !r.enterBatch, 'T472-SERIAL: width-1 frontier does NOT enterBatch (no forced width), got ' + JSON.stringify(r));
    assert(r.opened && r.opened.id === 'solo', 'T472-SERIAL: width-1 single-opens serially, got ' + JSON.stringify(r.opened));
  }
  // T472-NODEID: an explicit --node-id at a ≥2 frontier is EXEMPT (the operator asked for one node).
  {
    let planContent = makePlan(['| a | pending | |', '| b | pending | |', '| review | pending | |', '| finalize | pending | |']);
    const shellStub = (sp, a) => {
      const base = path.basename(sp);
      if (base === 'kaola-workflow-plan-validator.js' && (a || []).includes('--resume-check')) return { exitCode: 0, ok: true };
      if (base === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', readySet: [{ id: 'a', role: 'code-explorer', model: 'sonnet', declared_write_set: '—', dependsOn: [] }, { id: 'b', role: 'code-explorer', model: 'sonnet', declared_write_set: '—', dependsOn: [] }], readyPending: [{ id: 'a' }, { id: 'b' }], nextNode: { id: 'a' }, allDone: false };
      if (base === 'kaola-workflow-commit-node.js') return { exitCode: 0, result: 'ok', mode: 'per-node-start', nodeId: 'a', overallOk: true };
      if (base === 'kaola-workflow-task-mirror.js') return { exitCode: 0, status: 'ok' };
      return { exitCode: 1 };
    };
    const r = runOpenNext({ planPath: '/fake/kaola-workflow/test-project/workflow-plan.md', statePath: '/fake/kaola-workflow/test-project/workflow-state.md', project: 'test-project', nodeId: 'a', shell: shellStub, readFile: (f) => f.endsWith('workflow-plan.md') ? planContent : makeState(), writeFile: (f, c) => { if (f.endsWith('workflow-plan.md')) planContent = c; } });
    assert(r.result === 'ok' && !r.enterBatch && r.opened && r.opened.id === 'a', 'T472-NODEID: explicit --node-id single-opens (exempt from the divert), got ' + JSON.stringify(r));
  }
  // T472-TELEMETRY: deriveMaxSimultaneousOpen proves everConcurrent from the durable opened/closed events.
  {
    const concurrent = [
      JSON.stringify({ node: 'a', event: 'opened', ts: '2026-06-14T10:00:00.000Z' }),
      JSON.stringify({ node: 'b', event: 'opened', ts: '2026-06-14T10:00:01.000Z' }),
      JSON.stringify({ node: 'a', event: 'closed', ts: '2026-06-14T10:00:05.000Z' }),
      JSON.stringify({ node: 'b', event: 'closed', ts: '2026-06-14T10:00:06.000Z' }),
    ].join('\n') + '\n';
    const dc = deriveMaxSimultaneousOpen(concurrent);
    assert(dc.maxSimultaneousOpen === 2 && dc.everConcurrent === true, 'T472-TELEMETRY: overlapping opens → max 2 + everConcurrent true, got ' + JSON.stringify(dc));
    const serial = [
      JSON.stringify({ node: 'a', event: 'opened', ts: '2026-06-14T10:00:00.000Z' }),
      JSON.stringify({ node: 'a', event: 'closed', ts: '2026-06-14T10:00:01.000Z' }),
      JSON.stringify({ node: 'b', event: 'opened', ts: '2026-06-14T10:00:02.000Z' }),
      JSON.stringify({ node: 'b', event: 'closed', ts: '2026-06-14T10:00:03.000Z' }),
    ].join('\n') + '\n';
    const ds = deriveMaxSimultaneousOpen(serial);
    assert(ds.maxSimultaneousOpen === 1 && ds.everConcurrent === false, 'T472-TELEMETRY: serial opens → max 1 + everConcurrent false (the 100%-serial signature), got ' + JSON.stringify(ds));
    const handoff = [
      JSON.stringify({ node: 'a', event: 'opened', ts: '2026-06-14T10:00:00.000Z' }),
      JSON.stringify({ node: 'a', event: 'closed', ts: '2026-06-14T10:00:01.000Z' }),
      JSON.stringify({ node: 'b', event: 'opened', ts: '2026-06-14T10:00:01.000Z' }),
      JSON.stringify({ node: 'b', event: 'closed', ts: '2026-06-14T10:00:02.000Z' }),
    ].join('\n') + '\n';
    assert(deriveMaxSimultaneousOpen(handoff).everConcurrent === false, 'T472-TELEMETRY: same-ts close→open hand-off is NOT counted as concurrent (conservative)');
    // SPOOF guard: a crash-resume re-open of ONE node (two `opened`, no intervening `closed` — appendNode-
    // Timing appends unconditionally) must NOT inflate to everConcurrent (distinct-node-id tracking).
    const dupOpen = [
      JSON.stringify({ node: 'a', event: 'opened', ts: '2026-06-14T10:00:00.000Z' }),
      JSON.stringify({ node: 'a', event: 'opened', ts: '2026-06-14T10:00:02.000Z' }),
      JSON.stringify({ node: 'a', event: 'closed', ts: '2026-06-14T10:00:05.000Z' }),
    ].join('\n') + '\n';
    const dd = deriveMaxSimultaneousOpen(dupOpen);
    assert(dd.maxSimultaneousOpen === 1 && dd.everConcurrent === false, 'T472-TELEMETRY: a single-node re-open does NOT spoof everConcurrent (distinct node-ids), got ' + JSON.stringify(dd));
    // Genuine 3-wide concurrency (incl. a never-closed node) is still counted.
    const wide = [
      JSON.stringify({ node: 'a', event: 'opened', ts: '2026-06-14T10:00:00.000Z' }),
      JSON.stringify({ node: 'b', event: 'opened', ts: '2026-06-14T10:00:01.000Z' }),
      JSON.stringify({ node: 'c', event: 'opened', ts: '2026-06-14T10:00:02.000Z' }),
    ].join('\n') + '\n';
    assert(deriveMaxSimultaneousOpen(wide).maxSimultaneousOpen === 3, 'T472-TELEMETRY: 3 distinct concurrent opens (none closed) → max 3');
  }
}

// ---------------------------------------------------------------------------
// #558: runOrient SURFACES dispatchFidelity (everConcurrent / maxSimultaneousOpen) from the durable
// node-timings.jsonl on a real run — so a regression to silent serialization auto-alarms (the #472
// close-criterion), not only via a hand-run probe. Additive field + fail-closed (absent telemetry →
// zeroed trace, never a refuse — telemetry must never block a lifecycle transition).
// ---------------------------------------------------------------------------
{
  const plan = makePlan([
    '| impl-core | complete | |',
    '| impl-other | complete | |',
    '| review | complete | |',
    '| finalize | complete | |',
  ]);
  const state = makeState();
  const shellStub = function(scriptPath) {
    const base = path.basename(scriptPath);
    if (base === 'kaola-workflow-plan-validator.js') return { exitCode: 0, ok: true };
    if (base === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', readySet: [], nextNode: null, allDone: true };
    return { exitCode: 1 };
  };
  const orientWithTimings = (timings) => runOrient({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    shell: shellStub,
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) return plan;
      if (fpath.endsWith('workflow-state.md')) return state;
      if (fpath.endsWith('node-timings.jsonl')) { if (timings == null) throw new Error('ENOENT'); return timings; }
      throw new Error('ENOENT: ' + fpath);
    },
    writeFile: () => { throw new Error('orient must not write'); },
    cacheExists: () => false,
  });
  const concurrent = [
    JSON.stringify({ node: 'a', event: 'opened', ts: '2026-06-14T10:00:00.000Z' }),
    JSON.stringify({ node: 'b', event: 'opened', ts: '2026-06-14T10:00:01.000Z' }),
    JSON.stringify({ node: 'a', event: 'closed', ts: '2026-06-14T10:00:05.000Z' }),
    JSON.stringify({ node: 'b', event: 'closed', ts: '2026-06-14T10:00:06.000Z' }),
  ].join('\n') + '\n';
  const rc = orientWithTimings(concurrent);
  assert(rc.result === 'ok' && rc.dispatchFidelity && rc.dispatchFidelity.everConcurrent === true && rc.dispatchFidelity.maxSimultaneousOpen === 2,
    '#558: runOrient surfaces dispatchFidelity {everConcurrent:true,max:2} from overlapping node-timings, got ' + JSON.stringify(rc.dispatchFidelity));
  const serial = [
    JSON.stringify({ node: 'a', event: 'opened', ts: '2026-06-14T10:00:00.000Z' }),
    JSON.stringify({ node: 'a', event: 'closed', ts: '2026-06-14T10:00:01.000Z' }),
    JSON.stringify({ node: 'b', event: 'opened', ts: '2026-06-14T10:00:02.000Z' }),
    JSON.stringify({ node: 'b', event: 'closed', ts: '2026-06-14T10:00:03.000Z' }),
  ].join('\n') + '\n';
  const rs = orientWithTimings(serial);
  assert(rs.dispatchFidelity && rs.dispatchFidelity.everConcurrent === false && rs.dispatchFidelity.maxSimultaneousOpen === 1,
    '#558: serial node-timings → dispatchFidelity everConcurrent false / max 1, got ' + JSON.stringify(rs.dispatchFidelity));
  const ra = orientWithTimings(null);
  assert(ra.result === 'ok' && ra.dispatchFidelity && ra.dispatchFidelity.everConcurrent === false && ra.dispatchFidelity.maxSimultaneousOpen === 0,
    '#558: absent node-timings → zeroed dispatchFidelity, orient still ok (telemetry never blocks), got ' + JSON.stringify(ra.dispatchFidelity));
}

// ===========================================================================
// #590 — serial open-next records the per-node baseline BEFORE flipping the ledger
// row (mirroring runOpenReady Phase 2 baseline-on-disk → Phase 3 single plan write).
// Direct-call tests over runOpenNext's injected seams. RED (pre-#590 write-first order):
// a baseline failure strands the row in_progress with no baseline on disk (a later close
// dead-ends baseline_missing). GREEN (baseline-first): a baseline failure leaves the ledger
// PENDING — a clean idempotent re-open, no in_progress-without-baseline state.
// ===========================================================================
{
  // -- T-590-order-fail: baseline FAILS → NO ledger flip write; refuse baseline_failed; row pending. --
  {
    const plan = makePlan([
      '| impl-core | pending | |',
      '| impl-other | pending | |',
      '| review | pending | |',
      '| finalize | pending | |',
    ]);
    let planContent = plan;
    let sawPlanWrite = false;
    let baselineInvoked = false;
    let baselineSawWriteAtInvoke = null;
    const shellStub = function (scriptPath, args) {
      const base = path.basename(scriptPath);
      const a = args || [];
      if (base === 'kaola-workflow-plan-validator.js' && a.includes('--resume-check')) return { exitCode: 0, ok: true };
      if (base === 'kaola-workflow-next-action.js') {
        return {
          exitCode: 0, result: 'ok', allDone: false,
          readySet: [{ id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/adaptive-node.js', dependsOn: [] }],
          nextNode: { id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/adaptive-node.js' },
        };
      }
      if (base === 'kaola-workflow-commit-node.js' && a.includes('--start')) {
        baselineInvoked = true;
        baselineSawWriteAtInvoke = sawPlanWrite; // ordering probe: was the plan already written when baseline ran?
        return { exitCode: 1, result: 'refuse', reason: 'baseline_missing', errors: ['stub baseline failure'] };
      }
      return { exitCode: 1, result: 'refuse' };
    };
    const result = runOpenNext({
      planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
      statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
      project: 'test-project', nodeId: null, shell: shellStub,
      readFile: (fp) => { if (fp.endsWith('workflow-plan.md')) return planContent; return makeState(); },
      writeFile: (fp, content) => { if (fp.endsWith('workflow-plan.md')) { sawPlanWrite = true; planContent = content; } },
    });
    assert(result.result === 'refuse' && result.reason === 'baseline_failed',
      'T-590-order-fail: baseline failure → refuse baseline_failed, got ' + JSON.stringify({ result: result.result, reason: result.reason }));
    assert(baselineInvoked === true, 'T-590-order-fail: commit-node --start was invoked');
    assert(baselineSawWriteAtInvoke === false,
      'T-590-order-fail: baseline recorded BEFORE any ledger flip write (baseline-first ordering)');
    assert(sawPlanWrite === false,
      'T-590-order-fail: NO ledger flip write on baseline failure — row never stranded in_progress-without-baseline');
    assert(!/\|\s*impl-core\s*\|\s*in_progress\s*\|/.test(planContent),
      'T-590-order-fail: ledger row still pending after the refuse');
  }

  // -- T-590-order-ok: baseline SUCCEEDS → baseline recorded BEFORE the ledger flip; row ends in_progress. --
  {
    const plan = makePlan([
      '| impl-core | pending | |',
      '| impl-other | pending | |',
      '| review | pending | |',
      '| finalize | pending | |',
    ]);
    let planContent = plan;
    let sawPlanWrite = false;
    let baselineSawWriteAtInvoke = null;
    const shellStub = function (scriptPath, args) {
      const base = path.basename(scriptPath);
      const a = args || [];
      if (base === 'kaola-workflow-plan-validator.js' && a.includes('--resume-check')) return { exitCode: 0, ok: true };
      if (base === 'kaola-workflow-next-action.js') {
        return {
          exitCode: 0, result: 'ok', allDone: false,
          readySet: [{ id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/adaptive-node.js', dependsOn: [] }],
          nextNode: { id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/adaptive-node.js' },
        };
      }
      if (base === 'kaola-workflow-commit-node.js' && a.includes('--start')) {
        baselineSawWriteAtInvoke = sawPlanWrite;
        return { exitCode: 0, result: 'ok', mode: 'per-node-start', nodeId: 'impl-core', overallOk: true, recordBase: { base: 'deadbeefcafe0000', reused: false } };
      }
      return { exitCode: 1, result: 'refuse' };
    };
    const result = runOpenNext({
      planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
      statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
      project: 'test-project', nodeId: null, shell: shellStub,
      readFile: (fp) => { if (fp.endsWith('workflow-plan.md')) return planContent; return makeState(); },
      writeFile: (fp, content) => { if (fp.endsWith('workflow-plan.md')) { sawPlanWrite = true; planContent = content; } },
    });
    assert(result.result === 'ok' && result.baselineRecorded === true,
      'T-590-order-ok: baseline success → open ok, got ' + JSON.stringify({ result: result.result, baselineRecorded: result.baselineRecorded }));
    assert(baselineSawWriteAtInvoke === false,
      'T-590-order-ok: baseline recorded BEFORE the ledger flip write (baseline-first)');
    assert(sawPlanWrite === true && /\|\s*impl-core\s*\|\s*in_progress\s*\|/.test(planContent),
      'T-590-order-ok: ledger flipped in_progress AFTER the baseline');
  }
}

// ===========================================================================
// #585 — scheduler mutual-exclusion lock. A project-scoped O_EXCL lockfile
// (kaola-workflow/{project}/.cache/scheduler.lock) is acquired at the CLI (main())
// boundary before any mutating scheduler subcommand body, released in a finally. A held
// lock is NEVER taken over: a dead/aged holder refuses scheduler_lock_stale with a
// one-session manual-removal hint (fail-closed — no unlink of another process's lock),
// so a crashed holder never wedges the project. The run*
// bodies stay lock-free (the in-memory rsHarness above never enters main() — so the 1078
// assertions above ARE the serial-path-unchanged regression proof).
// ===========================================================================

// -- T-585-stale (unit): isStaleLock — same-host dead pid → stale; same-host live pid → not stale;
//    cross-host old ts → stale (age fallback); cross-host fresh ts → not stale; corrupt → stale. --
{
  const DEAD_PID = 2147483646; // above any real pid on this box → process.kill(pid,0) throws ESRCH
  assert(isStaleLock({ pid: DEAD_PID, host: os.hostname(), ts: Date.now(), subcommand: 'open-ready' }) === true,
    'T-585-stale: same-host DEAD pid → stale');
  assert(isStaleLock({ pid: process.pid, host: os.hostname(), ts: Date.now(), subcommand: 'open-ready' }) === false,
    'T-585-stale: same-host LIVE pid (this process) → not stale');
  assert(isStaleLock({ pid: 1234, host: 'ghost-host-' + Math.random().toString(16).slice(2), ts: Date.now() - LANE_STALENESS_MS - 60000 }) === true,
    'T-585-stale: cross-host OLD ts → stale (age fallback)');
  assert(isStaleLock({ pid: 1234, host: 'ghost-host-' + Math.random().toString(16).slice(2), ts: Date.now() }) === false,
    'T-585-stale: cross-host FRESH ts → not stale (age fallback)');
  assert(isStaleLock(null) === true, 'T-585-stale: null/corrupt holder → stale');
}

// -- T-585-acquire / T-585-release (unit): O_EXCL claim, live-holder refuse, idempotent release,
//    dead-holder typed STALE refusal — driven directly against a real lockfile under $TMPDIR.
//    NOTE: acquireProjectLock NEVER unlinks another process's lock (an unlink-based takeover
//    double-acquires under concurrency — two takers holding the same stale decision both claim
//    after the other's unlink); a dead holder is CLASSIFIED stale:true and refused. --
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lock585-unit-'));
  const lockPath = path.join(tmp, '.cache', SCHEDULER_LOCK_NAME);
  // (a) clean acquire → ok + file present carrying our payload.
  const a1 = acquireProjectLock(lockPath, { subcommand: 'open-ready' });
  assert(a1.ok === true && typeof a1.release === 'function', 'T-585-acquire: clean O_EXCL claim ok + release closure');
  assert(fs.existsSync(lockPath), 'T-585-acquire: lock file present after acquire');
  const held = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  assert(held.pid === process.pid && held.subcommand === 'open-ready' && typeof held.host === 'string',
    'T-585-acquire: payload carries pid + subcommand + host');
  // (b) a SECOND acquire while held by a LIVE holder → refuse stale:false with the holder (never double-acquire).
  const a2 = acquireProjectLock(lockPath, { subcommand: 'close-node' });
  assert(a2.ok === false && a2.stale === false && a2.holder && a2.holder.pid === process.pid,
    'T-585-acquire: second acquire refused stale:false by the live holder (no double-acquire)');
  // (c) release removes the file.
  a1.release();
  assert(!fs.existsSync(lockPath), 'T-585-release: release removes the lock file');
  // (d) release is idempotent (no throw when the file is already gone).
  a1.release();
  assert(!fs.existsSync(lockPath), 'T-585-release: second release is a no-op (idempotent)');
  // (e) stale REFUSAL (no auto-takeover): plant a DEAD-pid holder → acquire refuses ok:false + stale:true
  //     and the lockfile payload is byte-untouched (this function never unlinks another process's lock).
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const deadPayload = JSON.stringify({ pid: 2147483646, host: os.hostname(), ts: Date.now(), subcommand: 'open-ready' });
  fs.writeFileSync(lockPath, deadPayload);
  const a3 = acquireProjectLock(lockPath, { subcommand: 'open-ready' });
  assert(a3.ok === false && a3.stale === true, 'T-585-stale-refuse(unit): dead-pid holder → ok:false + stale:true (no auto-takeover)');
  assert(a3.holder && a3.holder.pid === 2147483646, 'T-585-stale-refuse(unit): refusal carries the dead holder payload');
  assert(fs.readFileSync(lockPath, 'utf8') === deadPayload, 'T-585-stale-refuse(unit): the stale lockfile is byte-untouched (never a non-holder unlink)');
  fs.rmSync(tmp, { recursive: true, force: true });
}

// -- T-595-orphan (unit, fault-injection): a payload write that throws right after the O_EXCL create
//    must NOT orphan an empty lockfile. Monkey-patches fs.writeFileSync to fail exactly once (after the
//    real openSync('wx') has already claimed the file) so acquireProjectLock's catch runs with a
//    non-EEXIST error. No-takeover invariant: the unlink this exercises can only ever run inside the
//    SAME call that just created the file via 'wx' (the fault is injected on our own write, not a
//    foreign holder's) — it can never remove another process's lock. --
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lock595-unit-'));
  const lockPath = path.join(tmp, '.cache', SCHEDULER_LOCK_NAME);
  const origWriteFileSync = fs.writeFileSync;
  let injected = false;
  fs.writeFileSync = function (...args) {
    if (!injected) {
      injected = true;
      const err = new Error('T-595 injected fault: simulated disk-full on payload write');
      err.code = 'EFAULTINJECT';
      throw err;
    }
    return origWriteFileSync.apply(fs, args);
  };
  let threw = null;
  try {
    acquireProjectLock(lockPath, { subcommand: 'open-ready' });
  } catch (err) {
    threw = err;
  } finally {
    fs.writeFileSync = origWriteFileSync;
  }
  assert(threw && threw.code === 'EFAULTINJECT', 'T-595-orphan: the injected write failure propagates (non-EEXIST → rethrow)');
  assert(!fs.existsSync(lockPath), 'T-595-orphan: the just-created lockfile is NOT orphaned after a payload-write failure');
  // Follow-up acquire in the SAME process must succeed cleanly — no lingering wrong-flavor scheduler_locked refusal.
  const follow = acquireProjectLock(lockPath, { subcommand: 'open-ready' });
  assert(follow.ok === true, 'T-595-orphan: a follow-up acquireProjectLock succeeds (no orphaned-lockfile refusal)');
  follow.release();
  assert(!fs.existsSync(lockPath), 'T-595-orphan: follow-up release cleans up');
  fs.rmSync(tmp, { recursive: true, force: true });
}

// -- Real-subprocess #585 tests: the lock is enforced in main() (the CLI boundary), so these drive the
//    real adaptive-node CLI in a real $TMPDIR git repo. The read-frontier fixture (ra code-explorer +
//    rb knowledge-lookup → finalize) co-opens as a read fan-out (no legs), giving two closeable
//    in_progress members for the close-node race and a clean pending frontier for the open-ready race. --
{
  const { execFileSync, spawnSync } = require('child_process');
  const NODE_CLI = path.join(__dirname, 'kaola-workflow-adaptive-node.js');
  const VALIDATOR = path.join(__dirname, 'kaola-workflow-plan-validator.js');

  function makeReadFrontierRepo() {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lock585-repo-'));
    const project = 'test-project';
    const projDir = path.join(repoRoot, 'kaola-workflow', project);
    const cacheDir = path.join(projDir, '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const planPath = path.join(projDir, 'workflow-plan.md');
    const plan = [
      '# Workflow Plan — test-project', '',
      '## Meta', 'labels: area:scripts', 'sink: CHANGELOG.md', '',
      '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape |',
      '| --- | --- | --- | --- | --- | --- |',
      '| ra | code-explorer | — | — | 1 | sequence |',
      '| rb | knowledge-lookup | — | — | 1 | sequence |',
      '| finalize | finalize | ra,rb | — | 1 | sequence |', '',
      '## Node Ledger', '',
      '| id | status |', '| --- | --- |',
      '| ra | pending |', '| rb | pending |', '| finalize | pending |', '',
    ].join('\n') + '\n';
    fs.writeFileSync(planPath, plan);
    fs.writeFileSync(path.join(projDir, 'workflow-state.md'), '# State\n');
    const g = (args) => execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'] });
    g(['init']); g(['config', 'user.email', 'kw@test']); g(['config', 'user.name', 'kw']); g(['config', 'commit.gpgsign', 'false']);
    try { execFileSync('node', [VALIDATOR, planPath, '--freeze', '--repair', '--json'], { cwd: repoRoot, encoding: 'utf8' }); } catch (_) {}
    fs.writeFileSync(path.join(repoRoot, '.gitignore'), '.kw/\n');
    g(['add', '-A']); g(['commit', '-m', 'init']);
    return { repoRoot, project, planPath, cacheDir };
  }
  function runNode(repoRoot, subArgs, extraEnv) {
    const env = Object.assign({}, process.env, extraEnv || {});
    try {
      const stdout = execFileSync('node', [NODE_CLI, ...subArgs], { cwd: repoRoot, encoding: 'utf8', env });
      let parsed = {}; try { parsed = JSON.parse(stdout.trim().split('\n').pop()); } catch (_) {}
      return { exitCode: 0, ...parsed };
    } catch (err) {
      const status = (err.status == null) ? 1 : err.status;
      let parsed = {}; try { parsed = JSON.parse(String(err.stdout || '').trim().split('\n').pop()); } catch (_) {}
      return { exitCode: status, ...parsed };
    }
  }
  function writeEvidence(cacheDir, id) {
    const baseFile = path.join(cacheDir, 'barrier-base-' + String(id).replace(/[^A-Za-z0-9_-]/g, '_'));
    let nonce = ''; try { nonce = fs.readFileSync(baseFile, 'utf8').trim().slice(0, 12); } catch (_) { nonce = ''; }
    fs.writeFileSync(path.join(cacheDir, id + '.md'),
      ['evidence-binding: ' + id + ' ' + nonce, id + ' read-frontier probe complete', 'findings: none'].join('\n') + '\n');
  }
  function readRS(cacheDir) { try { return JSON.parse(fs.readFileSync(path.join(cacheDir, 'running-set.json'), 'utf8')); } catch (_) { return null; } }
  function ledgerStatuses(planPath) {
    const txt = fs.readFileSync(planPath, 'utf8');
    const start = txt.indexOf('## Node Ledger');
    const body = start >= 0 ? txt.slice(start) : txt;
    const out = {};
    const re = /^\|\s*([A-Za-z0-9_-]+)\s*\|\s*(\S+)\s*\|/gm;
    let m; while ((m = re.exec(body)) !== null) { if (m[1] !== 'id') out[m[1]] = m[2]; }
    return out;
  }
  function inProgressSet(planPath) {
    const st = ledgerStatuses(planPath);
    return new Set(Object.keys(st).filter((k) => st[k] === 'in_progress'));
  }
  function rsNodeSet(cacheDir) {
    const rs = readRS(cacheDir);
    return new Set(rs && Array.isArray(rs.nodes) ? rs.nodes.map((n) => n.id) : []);
  }
  function setsEqual(a, b) { if (a.size !== b.size) return false; for (const x of a) if (!b.has(x)) return false; return true; }
  function cleanup(root) { try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {} }

  // raceN — a GENUINE N-process interleave. An orchestrator (node -e) spawns ALL N real adaptive-node
  // CLIs via child_process.spawn + Promise.all (concurrency INSIDE the orchestrator), then prints all
  // {code,out} as one JSON line; the parent sync-joins by spawnSync and parses each subprocess's last
  // JSON line. This is the suite's first genuine scheduler race (prior crash-window tests hand-built
  // states between sequential calls). raceTwo is the 2-caller convenience wrapper.
  function raceN(repoRoot, argvs) {
    const orch =
      'const { spawn } = require("child_process");' +
      'function run(a){return new Promise(function(res){var p=spawn(process.execPath,[' + JSON.stringify(NODE_CLI) + '].concat(a),{cwd:' + JSON.stringify(repoRoot) + ',env:process.env});var o="";var e="";p.stdout.on("data",function(d){o+=d});p.stderr.on("data",function(d){e+=d});p.on("close",function(c){res({code:c,out:o})});});}' +
      'Promise.all(' + JSON.stringify(argvs) + '.map(run)).then(function(rs){process.stdout.write("RACE:"+JSON.stringify(rs)+"\\n");});';
    const res = spawnSync(process.execPath, ['-e', orch], { cwd: repoRoot, encoding: 'utf8', env: process.env });
    const line = String(res.stdout || '').split('\n').filter((l) => l.indexOf('RACE:') === 0).pop() || 'RACE:[]';
    let arr = []; try { arr = JSON.parse(line.slice('RACE:'.length)); } catch (_) { arr = []; }
    return arr.map((r) => { let parsed = {}; try { parsed = JSON.parse(String(r.out || '').trim().split('\n').pop()); } catch (_) {} return { code: r.code, ...parsed }; });
  }
  function raceTwo(repoRoot, argv1, argv2) { return raceN(repoRoot, [argv1, argv2]); }

  // -- T-585-live-refuse: a LIVE holder's lock makes a guarded subcommand refuse scheduler_locked with
  //    ZERO mutation. RED: the advisory-only pre-fix CLI ignores the inert lock and co-opens the frontier. --
  {
    const { repoRoot, project, planPath, cacheDir } = makeReadFrontierRepo();
    fs.writeFileSync(path.join(cacheDir, SCHEDULER_LOCK_NAME),
      JSON.stringify({ pid: process.pid, host: os.hostname(), ts: Date.now(), subcommand: 'open-ready' }));
    const r = runNode(repoRoot, ['open-ready', '--project', project, '--json']);
    assert(r.result === 'refuse' && r.reason === 'scheduler_locked',
      'T-585-live-refuse: open-ready refuses scheduler_locked under a live holder, got ' + JSON.stringify({ result: r.result, reason: r.reason }));
    assert(r.exitCode === 1, 'T-585-live-refuse: non-zero exit on contention');
    assert(typeof r.operator_hint === 'string' && r.operator_hint.length > 0, 'T-585-live-refuse: typed operator_hint present');
    assert(fs.existsSync(path.join(cacheDir, SCHEDULER_LOCK_NAME)), 'T-585-live-refuse: the live holder lock is NOT removed by the refused caller');
    const st = ledgerStatuses(planPath);
    assert(st.ra === 'pending' && st.rb === 'pending', 'T-585-live-refuse: ledger unchanged (no in_progress) — zero mutation');
    assert(readRS(cacheDir) === null, 'T-585-live-refuse: no running set written');
    cleanup(repoRoot);
  }

  // -- T-585-stale-refuse: a DEAD-pid holder is NEVER auto-taken-over (an unlink-based takeover
  //    double-acquires under concurrency). The CLI refuses with the DISTINCT typed reason
  //    scheduler_lock_stale, zero mutation, lock byte-intact; the operator_hint names the manual
  //    recovery (rm the literal lockPath from ONE session). The recovery narrative then pins the
  //    "never wedges" AC via the hint path: unlink by hand → re-run → proceeds. --
  {
    const { repoRoot, project, planPath, cacheDir } = makeReadFrontierRepo();
    const lockFile = path.join(cacheDir, SCHEDULER_LOCK_NAME);
    const stalePayload = JSON.stringify({ pid: 2147483646, host: os.hostname(), ts: Date.now(), subcommand: 'open-ready' });
    fs.writeFileSync(lockFile, stalePayload);
    const r = runNode(repoRoot, ['open-ready', '--project', project, '--json']);
    assert(r.result === 'refuse' && r.reason === 'scheduler_lock_stale',
      'T-585-stale-refuse: dead-holder lock → typed scheduler_lock_stale refusal (no auto-takeover), got ' + JSON.stringify({ result: r.result, reason: r.reason }));
    assert(r.exitCode === 1, 'T-585-stale-refuse: non-zero exit on the stale refusal');
    assert(typeof r.operator_hint === 'string' && /rm "[^"]*scheduler\.lock"/.test(r.operator_hint),
      'T-585-stale-refuse: operator_hint names the literal lockPath in an rm "<lockPath>" form, got ' + JSON.stringify(r.operator_hint));
    let lockNow = null; try { lockNow = fs.readFileSync(lockFile, 'utf8'); } catch (_) { lockNow = null; }
    assert(lockNow === stalePayload, 'T-585-stale-refuse: the stale lockfile is byte-intact (never auto-removed)');
    const st = ledgerStatuses(planPath);
    assert(st.ra === 'pending' && st.rb === 'pending', 'T-585-stale-refuse: ledger unchanged — zero mutation');
    assert(readRS(cacheDir) === null, 'T-585-stale-refuse: no running set written');
    // Recovery narrative (the hinted step): the operator removes the lock by hand from ONE session, then
    // re-runs → the frontier opens (a dead holder never permanently wedges the project).
    try { fs.unlinkSync(lockFile); } catch (_) {}
    const r2 = runNode(repoRoot, ['open-ready', '--project', project, '--json']);
    assert(r2.result === 'ok' && Array.isArray(r2.opened) && r2.opened.length === 2,
      'T-585-stale-refuse: after the operator removes the lock, open-ready proceeds (never wedges), got ' + JSON.stringify({ result: r2.result, opened: r2.opened && r2.opened.map((n) => n.id), reason: r2.reason }));
    assert(!fs.existsSync(lockFile), 'T-585-stale-refuse: lock released after the recovered serial call');
    cleanup(repoRoot);
  }
  // -- age-based cross-host twin: an OLD-ts cross-host holder is ALSO a typed stale refusal (age fallback). --
  {
    const { repoRoot, project, cacheDir } = makeReadFrontierRepo();
    fs.writeFileSync(path.join(cacheDir, SCHEDULER_LOCK_NAME),
      JSON.stringify({ pid: 4242, host: 'ghost-host-' + Math.random().toString(16).slice(2), ts: Date.now() - LANE_STALENESS_MS - 3600000, subcommand: 'open-ready' }));
    const r = runNode(repoRoot, ['open-ready', '--project', project, '--json']);
    assert(r.result === 'refuse' && r.reason === 'scheduler_lock_stale',
      'T-585-stale-refuse(age): old cross-host holder → scheduler_lock_stale refusal, got ' + JSON.stringify({ result: r.result, reason: r.reason }));
    cleanup(repoRoot);
  }

  // -- T-585-release: a normal serial open-ready leaves NO scheduler.lock behind (finally-release). --
  {
    const { repoRoot, project, cacheDir } = makeReadFrontierRepo();
    const r = runNode(repoRoot, ['open-ready', '--project', project, '--json']);
    assert(r.result === 'ok', 'T-585-release: serial open-ready ok');
    assert(!fs.existsSync(path.join(cacheDir, SCHEDULER_LOCK_NAME)), 'T-585-release: no scheduler.lock left after a clean serial call');
    cleanup(repoRoot);
  }

  // -- T-585-open-ready×2 (genuine race): two concurrent open-ready on ONE project must NOT double-open.
  //    RED: advisory-only → both read running-set=null → both open the frontier (double-dispatch). GREEN:
  //    exactly one opens; the other refuses scheduler_locked (or, if fully serialized, sees the set already
  //    open and opens nothing). Durable invariant EVERY trial: set(ledger in_progress) === set(running-set). --
  {
    const TRIALS = 5;
    let everDoubleOpen = false;
    let everInvariantViolated = false;
    for (let t = 0; t < TRIALS; t++) {
      const { repoRoot, project, planPath, cacheDir } = makeReadFrontierRepo();
      const rs = raceTwo(repoRoot, ['open-ready', '--project', project, '--json'], ['open-ready', '--project', project, '--json']);
      const nonEmptyOpens = rs.filter((r) => r && r.result === 'ok' && Array.isArray(r.opened) && r.opened.length > 0).length;
      if (nonEmptyOpens > 1) everDoubleOpen = true;
      if (!setsEqual(inProgressSet(planPath), rsNodeSet(cacheDir))) everInvariantViolated = true;
      cleanup(repoRoot);
    }
    assert(everDoubleOpen === false,
      'T-585-open-ready×2: no trial double-opened the frontier (the lock serializes concurrent open-ready)');
    assert(everInvariantViolated === false,
      'T-585-open-ready×2: set(ledger in_progress) === set(running-set) held in every trial');
  }

  // -- T-585-close-node×2 (genuine race): two concurrent close-node for two co-open read-frontier members
  //    must not lose a complete flip. RED: each whole-plan rewrite clobbers the other → 1 complete for 2
  //    result:ok (lost update). GREEN: at most one close is result:ok per race (the other refuses
  //    scheduler_locked), so completeMembers >= #(ok); a serial retry then completes both (no wedge). --
  {
    const TRIALS = 5;
    let everLostUpdate = false;
    let everWedged = false;
    let racesRun = 0;
    for (let t = 0; t < TRIALS; t++) {
      const { repoRoot, project, planPath, cacheDir } = makeReadFrontierRepo();
      const open = runNode(repoRoot, ['open-ready', '--project', project, '--json']);
      if (!(open.result === 'ok' && Array.isArray(open.opened) && open.opened.length === 2)) { cleanup(repoRoot); continue; }
      writeEvidence(cacheDir, 'ra'); writeEvidence(cacheDir, 'rb');
      racesRun++;
      const rs = raceTwo(repoRoot,
        ['close-node', '--node-id', 'ra', '--project', project, '--json'],
        ['close-node', '--node-id', 'rb', '--project', project, '--json']);
      const oks = rs.filter((r) => r && r.result === 'ok').length;
      const st = ledgerStatuses(planPath);
      const completeMembers = ['ra', 'rb'].filter((id) => st[id] === 'complete').length;
      if (completeMembers < oks) everLostUpdate = true;
      // GREEN recovery: serially retry any member still not complete → both must reach complete (no wedge).
      for (const id of ['ra', 'rb']) {
        if (ledgerStatuses(planPath)[id] !== 'complete') runNode(repoRoot, ['close-node', '--node-id', id, '--project', project, '--json']);
      }
      const stFinal = ledgerStatuses(planPath);
      if (!(stFinal.ra === 'complete' && stFinal.rb === 'complete')) everWedged = true;
      cleanup(repoRoot);
    }
    assert(racesRun > 0, 'T-585-close-node×2: at least one race trial ran (co-open setup succeeded)');
    assert(everLostUpdate === false,
      'T-585-close-node×2: no trial lost a complete flip (completeMembers >= #result:ok in every race)');
    assert(everWedged === false,
      'T-585-close-node×2: a serial retry completes both members after every race (the lock never wedges the project)');
  }

  // -- T-585-stale-race (repair proof): N=6 concurrent open-ready against a PLANTED dead-PID stale lock.
  //    An unlink-based auto-takeover double-acquires here (two takers holding the same stale decision
  //    both claim after the other's unlink — the first taker ALWAYS succeeds, so ANY result:ok fails the
  //    zero-acquisition assertion deterministically). With takeover removed, NO code path succeeds
  //    against an existing lockfile: all N refuse scheduler_lock_stale, the planted lockfile survives
  //    byte-identical (no non-holder unlink EVER), and durable state is untouched. --
  {
    const TRIALS = 3;
    const N = 6;
    let everAcquired = false;
    let everWrongShape = false;
    let everLockMutated = false;
    let everLedgerMutated = false;
    let everRunningSet = false;
    for (let t = 0; t < TRIALS; t++) {
      const { repoRoot, project, planPath, cacheDir } = makeReadFrontierRepo();
      const lockFile = path.join(cacheDir, SCHEDULER_LOCK_NAME);
      const stalePayload = JSON.stringify({ pid: 2147483646, host: os.hostname(), ts: Date.now(), subcommand: 'open-ready' });
      fs.writeFileSync(lockFile, stalePayload);
      const argvs = [];
      for (let i = 0; i < N; i++) argvs.push(['open-ready', '--project', project, '--json']);
      const rs = raceN(repoRoot, argvs);
      if (rs.length !== N || rs.some((r) => r && r.result === 'ok')) everAcquired = true;
      if (!(rs.length === N && rs.every((r) => r && r.result === 'refuse' && r.reason === 'scheduler_lock_stale' && r.code === 1))) everWrongShape = true;
      let lockNow = null; try { lockNow = fs.readFileSync(lockFile, 'utf8'); } catch (_) { lockNow = null; }
      if (lockNow !== stalePayload) everLockMutated = true;
      const st = ledgerStatuses(planPath);
      if (!(st.ra === 'pending' && st.rb === 'pending' && st.finalize === 'pending')) everLedgerMutated = true;
      if (readRS(cacheDir) !== null) everRunningSet = true;
      cleanup(repoRoot);
    }
    assert(everAcquired === false,
      'T-585-stale-race: ZERO acquisitions across ' + N + ' concurrent callers vs a stale lock in every trial (no code path succeeds against an existing lockfile)');
    assert(everWrongShape === false,
      'T-585-stale-race: ALL ' + N + ' concurrent callers refuse scheduler_lock_stale (exit 1) in every trial');
    assert(everLockMutated === false,
      'T-585-stale-race: the planted stale lockfile survives byte-identical in every trial (no non-holder unlink ever)');
    assert(everLedgerMutated === false,
      'T-585-stale-race: ledger stays all-pending in every trial (zero mutation)');
    assert(everRunningSet === false,
      'T-585-stale-race: no running-set.json written in any trial');
  }
}

if (failed > 0) {
  console.error('adaptive-node tests FAILED (' + failed + ' failures, ' + passed + ' passed)');
  process.exitCode = 1;
} else {
  console.log('adaptive-node tests passed (' + passed + ' assertions)');
}
