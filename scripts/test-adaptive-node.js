#!/usr/bin/env node
'use strict';

// Unit tests for kaola-workflow-adaptive-node.js
// Hand-rolled assert + counter; repo style (no framework).
// Pure core tests use injected shell/readFile/writeFile seams (no subprocess).

// Require the module — will throw "Cannot find module" if not yet written.
const {
  spliceLedgerNode,
  checkEvidenceShape,
  runOrient,
  runOpenNext,
  runRecordEvidence,
  runCloseAndOpenNext,
  runWriteHalt,
  shellNode,
} = require('./kaola-workflow-adaptive-node');

const {
  ORPHAN_LEGALITY_MANIFEST,
  ORPHAN_LEGALITY_IN_PROGRESS_IDS,
  RUN_ORIENT_EXPECTED,
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
// T6: checkEvidenceShape — tdd-guide needs BOTH RED and GREEN
// ---------------------------------------------------------------------------
{
  // Missing GREEN
  const evidenceWithOnlyRed = 'RED: test failed as expected\nSome notes about the implementation';
  const r1 = checkEvidenceShape('tdd-guide', 'impl-core', evidenceWithOnlyRed);
  assert(r1.ok === false, 'T6a: tdd-guide missing GREEN → not ok');
  assert(r1.reason && r1.reason.includes('GREEN'), 'T6a: reason mentions GREEN');

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

  // Has non_tdd_reason but missing change-type token
  const evidenceMissingToken = 'non_tdd_reason: config-only change, no logic paths';
  const r2 = checkEvidenceShape('implementer', 'impl-other', evidenceMissingToken);
  assert(r2.ok === false, 'T7b: implementer missing change-type token → not ok');

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

  const r4 = checkEvidenceShape('code-reviewer', 'review', '');
  assert(r4.ok === false, 'T8d: code-reviewer with empty evidence → not ok');
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
// T16: runCloseAndOpenNext — evidence_missing → refuse, NO mutation
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

  assert(result.result === 'refuse', 'T16: evidence_missing → refuse');
  assert(result.reason === 'evidence_missing', 'T16: reason===evidence_missing');
  assert(writeFileCalled === false, 'T16: writeFile NOT called on evidence_missing');
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
  const plan = makePlan([
    '| a        | in_progress | |',
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
// Summary
// ---------------------------------------------------------------------------
if (failed > 0) {
  console.error('adaptive-node tests FAILED (' + failed + ' failures, ' + passed + ' passed)');
  process.exitCode = 1;
} else {
  console.log('adaptive-node tests passed (' + passed + ' assertions)');
}
