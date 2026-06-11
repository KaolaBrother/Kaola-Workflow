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
  removeDurableConsentHalt,
  checkEvidenceShape,
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
} = require('./kaola-workflow-adaptive-node');
const { RUNNING_SET_NAME } = require('./kaola-workflow-adaptive-schema');
const { readDurableConsentHalt, locateSection } = require('./kaola-workflow-adaptive-schema');

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
// T13: runRecordEvidence — stdin → .cache verbatim
// ---------------------------------------------------------------------------
{
  let writtenFiles = {};
  const evidenceContent = 'RED: test failed\nGREEN: test passed\n5 assertions\n';

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
  assert(result.bytes === evidenceContent.length, 'T13: bytes matches evidence length');

  const cacheKey = Object.keys(writtenFiles).find(k => k.includes('.cache/impl-core.md'));
  assert(cacheKey !== undefined, 'T13: .cache/impl-core.md was written');
  assert(writtenFiles[cacheKey] === evidenceContent, 'T13: evidence written verbatim');
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

// #308: runReopenNode refuses over a live parallel batch / interrupted top-up (#305 guard parity).
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
  const manifestJson = JSON.stringify({ batchId: 'b', state: 'open', members: [{ id: 'x', opening: true }] });
  const result = runReopenNode({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md', project: 'test-project', nodeId: 'impl',
    shell: () => ({ exitCode: 0, result: 'ok' }),
    readFile: (f) => { if (f.endsWith('active-batch.json')) return manifestJson; if (f.endsWith('workflow-plan.md')) return planContent; throw new Error('ENOENT ' + f); },
    writeFile: () => { throw new Error('must not write on refusal'); },
    cacheExists: (f) => f.endsWith('active-batch.json'), unlink: () => {},
  });
  assert(result.result === 'refuse' && result.reason === 'active_batch_exists',
    '#308 reopen: refuses over a live batch / opening member, got ' + JSON.stringify(result));
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

// Summary
// ---------------------------------------------------------------------------
// ===========================================================================
// #377 per-node running-set scheduler — open-ready / close-node / reconcile /
// legality. State-level coverage of the acceptance scenarios.
// ===========================================================================

const RS_PLAN_PATH = '/p/workflow-plan.md';
const RS_SET_PATH = '/p/.cache/' + RUNNING_SET_NAME;

function rsHarness(initialFiles, shellStub) {
  const files = Object.assign({}, initialFiles);
  const shellCalls = [];
  return {
    files,
    shellCalls,
    shell: (scriptPath, args) => { shellCalls.push({ base: path.basename(scriptPath), args: (args || []).slice() }); return shellStub(path.basename(scriptPath), args || []); },
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
// R2: open-ready — a WRITE node opens ALONE (serial fallback, containment off).
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
  const r = runOpenReady({ planPath: RS_PLAN_PATH, project: 'p', max: null, fanoutCapReadonly: 8, shell: h.shell, readFile: h.readFile, writeFile: h.writeFile, cacheExists: h.cacheExists, mkdirp: h.mkdirp });
  assert(r.result === 'ok' && r.kind === 'write', 'R2: ok + kind=write');
  assert(r.opened.length === 1 && r.opened[0].id === 'w1', 'R2: exactly ONE write node opened (serial), got ' + JSON.stringify(r.opened.map(o=>o.id)));
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
    shell: (sp) => { const b = path.basename(sp); if (b === 'kaola-workflow-next-action.js') return { exitCode: 0, result: 'ok', allDone: false, readySet: [{ id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/adaptive-node.js', dependsOn: [] }], nextNode: { id: 'impl-core', role: 'tdd-guide', model: 'sonnet', declared_write_set: 'scripts/adaptive-node.js' } }; if (b === 'kaola-workflow-commit-node.js') return { exitCode: 0, result: 'ok' }; return { exitCode: 0, result: 'ok' }; },
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

if (failed > 0) {
  console.error('adaptive-node tests FAILED (' + failed + ' failures, ' + passed + ' passed)');
  process.exitCode = 1;
} else {
  console.log('adaptive-node tests passed (' + passed + ' assertions)');
}
