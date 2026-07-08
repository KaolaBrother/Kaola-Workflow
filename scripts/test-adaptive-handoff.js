#!/usr/bin/env node
'use strict';

// Unit tests for kaola-workflow-adaptive-handoff.js
// Hand-rolled assert + counter; repo style (no framework).
// Most cases drive runHandoff with injected stub seams (no subprocess).

const { runHandoff, shellHandoff, extractDecisionIdCandidates } = require('./kaola-workflow-adaptive-handoff');

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
// Helpers
// ---------------------------------------------------------------------------

// Minimal in-grammar plan with an auto-run shape (code-explorer → finalize).
// No plan_hash marker (unfrozen).
function makeUnfrozenPlan(decision) {
  // A simple 2-node DAG: explore -> finalize (sequence, auto-run)
  // decision is embedded as a comment for documentation; the validator stub controls it.
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
    '| explore | code-explorer | — | — | 1 | sequence |',
    '| finalize | finalize | explore | CHANGELOG.md | 1 | sequence |',
    '',
    '## Node Ledger',
    '',
    '| id | status | notes |',
    '| --- | --- | --- |',
    '| explore | pending | |',
    '| finalize | pending | |',
  ].join('\n') + '\n';
}

// Plan with first node already in_progress (idempotency test).
function makeInProgressPlan() {
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
    '| explore | code-explorer | — | — | 1 | sequence |',
    '| finalize | finalize | explore | CHANGELOG.md | 1 | sequence |',
    '',
    '## Node Ledger',
    '',
    '| id | status | notes |',
    '| --- | --- | --- |',
    '| explore | in_progress | |',
    '| finalize | pending | |',
  ].join('\n') + '\n';
}

// Plan with first node already in_progress + a plan_hash (simulates re-run on frozen plan).
function makeFrozenInProgressPlan(planHash) {
  const hash = planHash || ('a').repeat(64);
  return [
    '# Workflow Plan — test-project',
    '',
    '<!-- plan_hash: ' + hash + ' -->',
    '',
    '## Meta',
    'labels: area:scripts',
    '',
    '## Nodes',
    '',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '| --- | --- | --- | --- | --- | --- |',
    '| explore | code-explorer | — | — | 1 | sequence |',
    '| finalize | finalize | explore | CHANGELOG.md | 1 | sequence |',
    '',
    '## Node Ledger',
    '',
    '| id | status | notes |',
    '| --- | --- | --- |',
    '| explore | in_progress | |',
    '| finalize | pending | |',
  ].join('\n') + '\n';
}

// Minimal workflow-state.md content with ## Sink trailing fields.
function makeStateContent(opts) {
  opts = opts || {};
  const issueNumber = opts.issueNumber !== undefined ? opts.issueNumber : 42;
  const hasSink = opts.hasSink !== false;
  const hasPlanningEvidence = opts.hasPlanningEvidence || false;
  const extraSinkFields = opts.extraSinkFields || '';

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
    '## Pending Gates',
    '- workflow-plan',
    '',
    '## Last Evidence',
    'phase_file: N/A',
    'last_command: claim',
    '',
  ];

  if (hasPlanningEvidence) {
    lines.push('## Planning Evidence');
    lines.push('plan_hash: oldHashValue');
    lines.push('decision: auto-run');
    lines.push('');
  }

  lines.push('## Last Updated');
  lines.push('2026-06-06T00:00:00.000Z');
  lines.push('');

  if (hasSink) {
    lines.push('## Sink');
    if (issueNumber != null) {
      lines.push('issue_number: ' + issueNumber);
    }
    lines.push('branch: workflow/test-project');
    lines.push('sink: merge');
    if (extraSinkFields) lines.push(extraSinkFields);
  }

  return lines.join('\n') + '\n';
}

// Build a stub shell function keyed on (scriptBasename, discriminatingFlag).
// Each entry in the map: { key: canned response object }
// key = scriptBasename + ':' + discriminatingFlag (found anywhere in args[])
// Checked in order: --freeze-checked, --freeze, --resume-check, --node-id, --json (most specific first).
// #408: the fused freeze chain is --freeze-checked (validate, no write) then --freeze --governance-ack
// (write + folded resume-check); --freeze-checked is listed BEFORE --freeze so it matches its own stub.
// For roadmap/git, base name alone is sufficient.
const DISCRIMINATING_FLAGS = ['--freeze-checked', '--freeze', '--resume-check', '--node-id', 'init-issue', 'add', '--json'];
function makeShellStub(responses) {
  const VALIDATOR = 'kaola-workflow-plan-validator.js';
  return function stubShell(scriptPath, args) {
    const base = path.basename(scriptPath);
    const argsArr = args || [];
    // Find first discriminating flag present in args
    let firstFlag = '';
    for (const f of DISCRIMINATING_FLAGS) {
      if (argsArr.includes(f)) { firstFlag = f; break; }
    }
    const key = base + ':' + firstFlag;
    // #408 back-compat: the fused --freeze folds --resume-check into resumeOk. A legacy --freeze stub
    // that is `frozen:true` but omits resumeOk had a separate passing --resume-check stub in the old
    // 3-spawn shape — treat it as resume-ok so the post-fusion handoff sees resumeOk===true.
    if (responses[key] !== undefined) {
      const resp = responses[key];
      if (base === VALIDATOR && firstFlag === '--freeze' && resp && resp.frozen === true && resp.resumeOk === undefined) {
        return Object.assign({}, resp, { resumeOk: true });
      }
      return resp;
    }
    // #408 back-compat: legacy stubs key the validate response under ':--json'. The fused chain
    // (--freeze-checked, then --freeze --governance-ack) made --freeze-checked the validate spawn;
    // synthesize it from the legacy --json response (forcing frozen:false — it does not write).
    if (base === VALIDATOR && firstFlag === '--freeze-checked' && responses[VALIDATOR + ':--json'] !== undefined) {
      const base0 = responses[VALIDATOR + ':--json'];
      return Object.assign({}, base0, { frozen: false, governance: { decision: base0.decision, risk: base0.risk || {} } });
    }
    // Fallback key without flag (catch-all per script)
    const fallback = responses[base];
    if (fallback !== undefined) return fallback;
    // Default: fail-closed
    return { exitCode: 1, result: 'refuse', errors: ['stub: no response for ' + key + ' args=' + JSON.stringify(argsArr)] };
  };
}

const PLAN_HASH_64 = ('a').repeat(64);

// ---------------------------------------------------------------------------
// T1 (REGRESSION): decision:ask → ready_to_run (NOT needs_user_approval)
// decision='ask', all checklist true, NO risk_authorized key, plan frozen.
// ---------------------------------------------------------------------------
{
  const planContent = makeUnfrozenPlan('ask');
  const stateContent = makeStateContent({ issueNumber: 42 });
  let writtenFiles = {};
  // readFile returns freshened plan after each call to support post-freeze re-read.
  let readCallCount = 0;
  const frozenPlanContent = planContent.replace('# Workflow Plan', '<!-- plan_hash: ' + PLAN_HASH_64 + ' -->\n\n# Workflow Plan');

  const shellStub = makeShellStub({
    // #408 SPAWN 1: validator --freeze-checked --json (validate + governance payload, no write)
    'kaola-workflow-plan-validator.js:--freeze-checked': {
      exitCode: 0, result: 'in-grammar', decision: 'ask',
      planHash: PLAN_HASH_64, frozen: false,
      governance: { decision: 'ask', risk: {} },
      risk: { sensitivity: false, blastRadius: true, uncertain: false, reasons: ['declared write set touches SHARED_INFRA'] }
    },
    // #408 SPAWN 2: validator --freeze --governance-ack <hash> --json (write + folded resume-check)
    'kaola-workflow-plan-validator.js:--freeze': {
      exitCode: 0, result: 'in-grammar', decision: 'ask',
      planHash: PLAN_HASH_64, frozen: true, resumeOk: true,
      risk: { sensitivity: false, blastRadius: true, uncertain: false, reasons: ['declared write set touches SHARED_INFRA'] }
    },
    // roadmap init-issue
    'kaola-workflow-roadmap.js:init-issue': { exitCode: 0, created: true },
    // git add
    'git:add': { exitCode: 0 },
    // #335 mirror-project (step 7) — best-effort; answers the new shell call.
    'kaola-workflow-adaptive-node.js': { exitCode: 0, status: 'mirrored', planHash: PLAN_HASH_64, dest: '/wt/kaola-workflow/test-project' },
  });

  const result = runHandoff({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    json: true,
    shell: shellStub,
    computeNextAction: require('./kaola-workflow-next-action').computeNextAction,
    resolveModel: () => 'sonnet',
    readFile: (fpath) => {
      // After freeze, the plan file should return the frozen version
      if (fpath.endsWith('workflow-plan.md')) {
        readCallCount++;
        // First read (initial validate): unfrozen; subsequent reads: frozen (after --freeze wrote it)
        return readCallCount <= 1 ? planContent : frozenPlanContent;
      }
      if (fpath.endsWith('workflow-state.md')) return stateContent;
      return '';
    },
    writeFile: (fpath, content) => { writtenFiles[fpath] = content; },
    stateMtime: undefined,
  });

  // T1 assertions
  assert(result.handoff_status === 'ready_to_run',
    'T1: handoff_status===ready_to_run (NOT needs_user_approval)');
  assert(result.decision === 'ask',
    'T1: decision===ask (audit metadata preserved)');
  assert(result.checklist !== undefined, 'T1: checklist present');
  assert(result.checklist.claim_acquired === true, 'T1: checklist.claim_acquired===true');
  assert(result.checklist.plan_in_grammar === true, 'T1: checklist.plan_in_grammar===true');
  assert(result.checklist.plan_frozen === true, 'T1: checklist.plan_frozen===true');
  assert(result.checklist.resume_check_ok === true, 'T1: checklist.resume_check_ok===true');
  assert(result.checklist.roadmap_staged === true, 'T1: checklist.roadmap_staged===true');
  assert(result.risk !== undefined, 'T1: risk field present (echoed from validator)');
  assert(result.risk.blastRadius === true, 'T1: risk.blastRadius===true echoed');
  assert(!('risk_authorized' in result), 'T1: NO risk_authorized key in result');
  assert(result.first_node !== undefined, 'T1: first_node present');
  assert(result.first_node.id === 'explore', 'T1: first_node.id===explore');
  // #609/#610: T1's node declares no tier, so first_node.model is the ROLE-STATIC resolved alias
  // ('sonnet' from resolveModel) — the exact echo that reads wrong on Codex. model_display gives it a
  // runtime-native rendering so the narrative echo reads natively even for a role-static default.
  assert(result.first_node.model === 'sonnet', 'T1: first_node.model is the role-static resolved alias');
  assert(result.first_node.model_display && result.first_node.model_display.claude === 'sonnet'
    && result.first_node.model_display.codex === 'high reasoning effort'
    && result.first_node.model_display.opencode === 'second effort variant',
    'T1: role-static first_node carries a runtime-native model_display, got ' + JSON.stringify(result.first_node.model_display));
}

// ---------------------------------------------------------------------------
// T1-DISPLAY (#609/#610): a first node that DECLARES a neutral tier surfaces a runtime-native
// model_display alongside the raw `first_node.model`, so a Codex/opencode narrative echo reads
// natively. A legacy `opus`/`sonnet` cell displays identically (back-compat). Reuses the T1 harness
// with a 7-column ## Nodes table (model column present).
// ---------------------------------------------------------------------------
{
  const tieredPlan = [
    '# Workflow Plan — test-project', '',
    '## Meta', 'labels: area:scripts', '',
    '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape | model |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    '| explore | code-explorer | — | — | 1 | sequence | reasoning |',
    '| finalize | finalize | explore | CHANGELOG.md | 1 | sequence | |',
    '',
    '## Node Ledger', '',
    '| id | status | notes |', '| --- | --- | --- |',
    '| explore | pending | |', '| finalize | pending | |',
  ].join('\n') + '\n';
  const runDisplay = (planContent) => {
    const frozenPlanContent = planContent.replace('# Workflow Plan', '<!-- plan_hash: ' + PLAN_HASH_64 + ' -->\n\n# Workflow Plan');
    let readCallCount = 0;
    const shellStub = makeShellStub({
      'kaola-workflow-plan-validator.js:--freeze-checked': {
        exitCode: 0, result: 'in-grammar', decision: 'auto-run', planHash: PLAN_HASH_64, frozen: false,
        governance: { decision: 'auto-run', risk: {} }, risk: {},
      },
      'kaola-workflow-plan-validator.js:--freeze': {
        exitCode: 0, result: 'in-grammar', decision: 'auto-run', planHash: PLAN_HASH_64, frozen: true, resumeOk: true, risk: {},
      },
      'kaola-workflow-roadmap.js:init-issue': { exitCode: 0, created: true },
      'git:add': { exitCode: 0 },
      'kaola-workflow-adaptive-node.js': { exitCode: 0, status: 'mirrored', planHash: PLAN_HASH_64, dest: '/wt/kaola-workflow/test-project' },
    });
    return runHandoff({
      planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
      statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
      project: 'test-project', json: true, shell: shellStub,
      computeNextAction: require('./kaola-workflow-next-action').computeNextAction,
      resolveModel: () => 'sonnet',
      readFile: (fpath) => {
        if (fpath.endsWith('workflow-plan.md')) { readCallCount++; return readCallCount <= 1 ? planContent : frozenPlanContent; }
        if (fpath.endsWith('workflow-state.md')) return makeStateContent({ issueNumber: 77 });
        return '';
      },
      writeFile: () => {},
      stateMtime: undefined,
    });
  };

  const rNeutral = runDisplay(tieredPlan);
  assert(rNeutral.first_node.model === 'reasoning', 'T1-DISPLAY: raw neutral tier stays in first_node.model');
  assert(rNeutral.first_node.model_display
    && rNeutral.first_node.model_display.claude === 'opus'
    && rNeutral.first_node.model_display.codex === 'xhigh reasoning effort'
    && rNeutral.first_node.model_display.opencode === 'top effort variant',
    'T1-DISPLAY: reasoning first_node carries a runtime-native model_display, got ' + JSON.stringify(rNeutral.first_node.model_display));

  // BACK-COMPAT: a legacy `sonnet` cell (frozen plan) resolves to the SAME display as neutral `standard`.
  const rLegacy = runDisplay(tieredPlan.replace('| reasoning |', '| sonnet |'));
  assert(rLegacy.first_node.model === 'sonnet', 'T1-DISPLAY: legacy cell preserved verbatim in first_node.model');
  assert(rLegacy.first_node.model_display
    && rLegacy.first_node.model_display.claude === 'sonnet'
    && rLegacy.first_node.model_display.codex === 'high reasoning effort'
    && rLegacy.first_node.model_display.opencode === 'second effort variant',
    'T1-DISPLAY: legacy sonnet cell displays as the standard tier, got ' + JSON.stringify(rLegacy.first_node.model_display));
}

// ---------------------------------------------------------------------------
// T2: in-grammar + auto-run → ready_to_run, all checklist true
// ---------------------------------------------------------------------------
{
  const planContent = makeUnfrozenPlan('auto-run');
  const stateContent = makeStateContent({ issueNumber: 10 });
  let writtenFiles = {};
  let readCallCount = 0;
  const frozenPlanContent = planContent + '<!-- plan_hash: ' + PLAN_HASH_64 + ' -->';

  const shellStub = makeShellStub({
    // #408 SPAWN 1: --freeze-checked (validate, no write)
    'kaola-workflow-plan-validator.js:--freeze-checked': {
      exitCode: 0, result: 'in-grammar', decision: 'auto-run',
      planHash: PLAN_HASH_64, frozen: false, governance: { decision: 'auto-run', risk: {} },
      risk: { sensitivity: false, blastRadius: false, uncertain: false, reasons: [] }
    },
    // #408 SPAWN 2: --freeze --governance-ack (write + folded resume-check via resumeOk)
    'kaola-workflow-plan-validator.js:--freeze': {
      exitCode: 0, result: 'in-grammar', decision: 'auto-run',
      planHash: PLAN_HASH_64, frozen: true, resumeOk: true,
      risk: { sensitivity: false, blastRadius: false, uncertain: false, reasons: [] }
    },
    'kaola-workflow-roadmap.js:init-issue': { exitCode: 0, created: true },
    'git:add': { exitCode: 0 },
    'kaola-workflow-adaptive-node.js': { exitCode: 0, status: 'mirrored', planHash: PLAN_HASH_64, dest: '/wt/kaola-workflow/test-project' },
  });

  const result = runHandoff({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    json: true,
    shell: shellStub,
    computeNextAction: require('./kaola-workflow-next-action').computeNextAction,
    resolveModel: () => 'sonnet',
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) {
        readCallCount++;
        return readCallCount <= 1 ? planContent : frozenPlanContent;
      }
      if (fpath.endsWith('workflow-state.md')) return stateContent;
      return '';
    },
    writeFile: (fpath, content) => { writtenFiles[fpath] = content; },
    stateMtime: undefined,
  });

  assert(result.handoff_status === 'ready_to_run', 'T2: ready on auto-run');
  assert(result.decision === 'auto-run', 'T2: decision===auto-run');
  const ck = result.checklist || {};
  assert(ck.claim_acquired && ck.plan_in_grammar && ck.plan_frozen && ck.resume_check_ok &&
         ck.roadmap_staged,
    'T2: all checklist fields true');
  assert(!('risk_authorized' in result), 'T2: no risk_authorized');
}

// ---------------------------------------------------------------------------
// T3: validator refuse → plan_invalid, errors surfaced, validator_verdict present,
//     writeFile NEVER called (no mutation), exit nonzero.
// ---------------------------------------------------------------------------
{
  const planContent = makeUnfrozenPlan('refuse-test');
  const stateContent = makeStateContent({ issueNumber: 5 });
  let writeFileCalled = false;
  let shellCalledForFreeze = false;

  const shellStub = function(scriptPath, args) {
    const argsArr = args || [];
    // Only the initial --json call should be made; --freeze must NOT be called
    if (path.basename(scriptPath) === 'kaola-workflow-plan-validator.js' && argsArr.includes('--freeze')) {
      shellCalledForFreeze = true;
    }
    // Initial validate call — return refuse for all calls to avoid any mutation
    return { exitCode: 1, result: 'refuse', errors: ['post-dominance leak: finalize not reached'], planHash: null };
  };

  const result = runHandoff({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    json: true,
    shell: shellStub,
    computeNextAction: require('./kaola-workflow-next-action').computeNextAction,
    resolveModel: () => 'sonnet',
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-state.md')) return stateContent;
      if (fpath.endsWith('workflow-plan.md')) return planContent;
      return '';
    },
    writeFile: (fpath, content) => { writeFileCalled = true; },
    stateMtime: undefined,
  });

  assert(result.handoff_status === 'plan_invalid', 'T3: handoff_status===plan_invalid on refuse');
  assert(result.result === 'refuse', 'T3: result===refuse');
  assert(Array.isArray(result.errors) && result.errors.length > 0, 'T3: errors array non-empty');
  assert(result.validator_verdict !== undefined, 'T3: validator_verdict present');
  assert(writeFileCalled === false, 'T3: writeFile NEVER called (no mutation)');
  assert(shellCalledForFreeze === false, 'T3: --freeze NOT called on refuse (no mutation)');
}

// ---------------------------------------------------------------------------
// T4: no issue_number in state → roadmap_staged:true vacuously, ready
// ---------------------------------------------------------------------------
{
  const planContent = makeUnfrozenPlan('auto-run');
  // State with no issue_number in ## Sink
  const stateContent = makeStateContent({ issueNumber: null });
  let writtenFiles = {};
  let roadmapInitCalled = false;
  let readCallCount = 0;
  const frozenPlanContent = planContent + '\n<!-- plan_hash: ' + PLAN_HASH_64 + ' -->';

  const shellStub = function(scriptPath, args) {
    const base = path.basename(scriptPath);
    const argsArr = args || [];
    // #408 SPAWN 1: --freeze-checked (validate, no write) — checked BEFORE --freeze.
    if (base === 'kaola-workflow-plan-validator.js' && argsArr.includes('--freeze-checked')) {
      return { exitCode: 0, result: 'in-grammar', decision: 'auto-run', planHash: PLAN_HASH_64, frozen: false,
               governance: { decision: 'auto-run', risk: {} },
               risk: { sensitivity: false, blastRadius: false, uncertain: false, reasons: [] } };
    }
    // #408 SPAWN 2: --freeze --governance-ack (write + folded resume-check via resumeOk).
    if (base === 'kaola-workflow-plan-validator.js' && argsArr.includes('--freeze')) {
      return { exitCode: 0, result: 'in-grammar', decision: 'auto-run', planHash: PLAN_HASH_64, frozen: true, resumeOk: true,
               risk: { sensitivity: false, blastRadius: false, uncertain: false, reasons: [] } };
    }
    if (base === 'kaola-workflow-plan-validator.js' && argsArr.includes('--json')) {
      return { exitCode: 0, result: 'in-grammar', decision: 'auto-run', planHash: PLAN_HASH_64,
               risk: { sensitivity: false, blastRadius: false, uncertain: false, reasons: [] } };
    }
    if (base === 'kaola-workflow-roadmap.js') {
      roadmapInitCalled = true;
      return { exitCode: 0, created: true };
    }
    if (base === 'git') {
      return { exitCode: 0 };
    }
    return { exitCode: 1, errors: ['stub: unexpected call ' + base + ' ' + JSON.stringify(argsArr)] };
  };

  const result = runHandoff({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    json: true,
    shell: shellStub,
    computeNextAction: require('./kaola-workflow-next-action').computeNextAction,
    resolveModel: () => 'sonnet',
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) {
        readCallCount++;
        return readCallCount <= 1 ? planContent : frozenPlanContent;
      }
      if (fpath.endsWith('workflow-state.md')) return stateContent;
      return '';
    },
    writeFile: (fpath, content) => { writtenFiles[fpath] = content; },
    stateMtime: undefined,
  });

  assert(result.handoff_status === 'ready_to_run', 'T4: ready even with no issue_number');
  assert(result.checklist && result.checklist.roadmap_staged === true, 'T4: roadmap_staged===true vacuously when no issue_number');
  assert(roadmapInitCalled === false, 'T4: roadmap init NOT called when no issue_number');
}

// ---------------------------------------------------------------------------
// T5: idempotent re-run — plan already node1 in_progress; freeze same hash;
//     baseline reused:true; init-issue skip; ready, ledger byte-identical,
//     Planning Evidence single (replaced not appended).
//     Byte-idempotency: run TWICE and assert the full state content is identical
//     across both writes (no blank-line eating, no double-append).
// ---------------------------------------------------------------------------
{
  const HASH = PLAN_HASH_64;
  const planContent = makeFrozenInProgressPlan(HASH);
  // State already has Planning Evidence
  const stateContent = makeStateContent({ issueNumber: 42, hasPlanningEvidence: true });
  let writtenStateContents = [];

  const shellStub = makeShellStub({
    'kaola-workflow-plan-validator.js:--json': {
      exitCode: 0, result: 'in-grammar', decision: 'auto-run', planHash: HASH,
      risk: { sensitivity: false, blastRadius: false, uncertain: false, reasons: [] }
    },
    'kaola-workflow-plan-validator.js:--freeze': {
      exitCode: 0, result: 'in-grammar', decision: 'auto-run', planHash: HASH, frozen: true,
      risk: { sensitivity: false, blastRadius: false, uncertain: false, reasons: [] }
    },
    'kaola-workflow-plan-validator.js:--resume-check': { exitCode: 0, ok: true, planHash: HASH },
    'kaola-workflow-roadmap.js:init-issue': { exitCode: 0, skip: true }, // EEXIST-skip
    'git:add': { exitCode: 0 },
    'kaola-workflow-adaptive-node.js': { exitCode: 0, status: 'exists', dest: '/wt/kaola-workflow/test-project' },
  });

  // Run 1: state has existing Planning Evidence; simulate what gets written.
  let currentState = stateContent;
  let planReadCount = 0;
  const result = runHandoff({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    json: true,
    shell: shellStub,
    computeNextAction: require('./kaola-workflow-next-action').computeNextAction,
    resolveModel: () => 'sonnet',
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) {
        planReadCount++;
        // Always return the frozen in-progress plan (idempotent state)
        return planContent;
      }
      if (fpath.endsWith('workflow-state.md')) return currentState;
      return '';
    },
    writeFile: (fpath, content) => {
      if (fpath.endsWith('workflow-state.md')) {
        writtenStateContents.push(content);
        currentState = content; // persist for run 2
      }
    },
    stateMtime: undefined,
  });

  assert(result.handoff_status === 'ready_to_run', 'T5: idempotent re-run → ready');

  // Check Planning Evidence replaced-not-appended: exactly ONE ## Planning Evidence section
  const stateAfterRun1 = writtenStateContents[writtenStateContents.length - 1] || stateContent;
  const peMatches = (stateAfterRun1.match(/## Planning Evidence/g) || []).length;
  assert(peMatches === 1, 'T5: Planning Evidence appears exactly once (replaced not appended), got ' + peMatches);

  // Discriminating assertion: blank line before ## Last Updated must survive the splice.
  // With .trimEnd() the trailing '\n' of newBlock is eaten, producing:
  //   ...first_node_role: code-explorer\n## Last Updated (one \n — WRONG)
  // Without .trimEnd() (current fix) it's:
  //   ...first_node_role: code-explorer\n\n## Last Updated (two \n — correct)
  assert(stateAfterRun1.includes('first_node_role: code-explorer\n\n## Last Updated'),
    'T5: blank line before ## Last Updated preserved after splice (trimEnd must not eat it)');

  // Run 2: use the written state as input — assert full state content byte-identical.
  // This proves the replace-in-place branch is truly byte-idempotent (no blank-line eating).
  planReadCount = 0;
  const result2 = runHandoff({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    json: true,
    shell: shellStub,
    computeNextAction: require('./kaola-workflow-next-action').computeNextAction,
    resolveModel: () => 'sonnet',
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) {
        planReadCount++;
        return planContent;
      }
      if (fpath.endsWith('workflow-state.md')) return currentState;
      return '';
    },
    writeFile: (fpath, content) => {
      if (fpath.endsWith('workflow-state.md')) {
        writtenStateContents.push(content);
        currentState = content; // persist for run 3
      }
    },
    stateMtime: undefined,
  });

  assert(result2.handoff_status === 'ready_to_run', 'T5: run2 → ready');
  const stateAfterRun2 = writtenStateContents[writtenStateContents.length - 1];
  assert(stateAfterRun2 !== undefined, 'T5: run2 wrote state');
  assert(stateAfterRun2 === stateAfterRun1,
    'T5: state content byte-identical across two consecutive runs (idempotent splice)');

  // Run 3: verify 3-way stability (run3 output == run2 output == run1 output).
  planReadCount = 0;
  const result3 = runHandoff({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    json: true,
    shell: shellStub,
    computeNextAction: require('./kaola-workflow-next-action').computeNextAction,
    resolveModel: () => 'sonnet',
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) {
        planReadCount++;
        return planContent;
      }
      if (fpath.endsWith('workflow-state.md')) return currentState;
      return '';
    },
    writeFile: (fpath, content) => {
      if (fpath.endsWith('workflow-state.md')) writtenStateContents.push(content);
    },
    stateMtime: undefined,
  });

  assert(result3.handoff_status === 'ready_to_run', 'T5: run3 → ready');
  const stateAfterRun3 = writtenStateContents[writtenStateContents.length - 1];
  assert(stateAfterRun3 !== undefined, 'T5: run3 wrote state');
  assert(stateAfterRun3 === stateAfterRun2,
    'T5: state content byte-identical across THREE consecutive runs (3-way stability)');
}

// ---------------------------------------------------------------------------
// T5b: EOF-append idempotency — state has NO ## Last Updated, NO ## Sink,
//      NO existing ## Planning Evidence. splicePlanningEvidence falls through to
//      the EOF-append branch. Two consecutive runs must produce byte-identical output.
// ---------------------------------------------------------------------------
{
  const HASH = PLAN_HASH_64;
  const planContent = makeFrozenInProgressPlan(HASH);

  // Minimal state WITHOUT ## Last Updated or ## Sink (triggers EOF-append branch).
  const eofState = [
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
    '## Pending Gates',
    '- workflow-plan',
    '',
    '## Last Evidence',
    'phase_file: N/A',
    'last_command: claim',
    '',
  ].join('\n');

  const shellStub5b = makeShellStub({
    'kaola-workflow-plan-validator.js:--json': {
      exitCode: 0, result: 'in-grammar', decision: 'auto-run', planHash: HASH,
      risk: { sensitivity: false, blastRadius: false, uncertain: false, reasons: [] }
    },
    'kaola-workflow-plan-validator.js:--freeze': {
      exitCode: 0, result: 'in-grammar', decision: 'auto-run', planHash: HASH, frozen: true,
      risk: { sensitivity: false, blastRadius: false, uncertain: false, reasons: [] }
    },
    'kaola-workflow-plan-validator.js:--resume-check': { exitCode: 0, ok: true, planHash: HASH },
    'kaola-workflow-roadmap.js:init-issue': { exitCode: 0, skip: true },
    'git:add': { exitCode: 0 },
    'kaola-workflow-adaptive-node.js': { exitCode: 0, status: 'exists', dest: '/wt/kaola-workflow/test-project' },
  });

  let currentState5b = eofState;
  let written5b = [];

  function run5b() {
    return runHandoff({
      planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
      statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
      project: 'test-project',
      json: true,
      shell: shellStub5b,
      computeNextAction: require('./kaola-workflow-next-action').computeNextAction,
      resolveModel: () => 'sonnet',
      readFile: (fpath) => {
        if (fpath.endsWith('workflow-plan.md')) return planContent;
        if (fpath.endsWith('workflow-state.md')) return currentState5b;
        return '';
      },
      writeFile: (fpath, content) => {
        if (fpath.endsWith('workflow-state.md')) {
          written5b.push(content);
          currentState5b = content;
        }
      },
      stateMtime: undefined,
    });
  }

  const r5b1 = run5b();
  assert(r5b1.handoff_status === 'ready_to_run', 'T5b: run1 → ready');
  const s5b1 = written5b[written5b.length - 1];
  assert(s5b1 !== undefined, 'T5b: run1 wrote state');
  // EOF-append result must end with ## Planning Evidence block (newline-terminated).
  assert(s5b1.includes('## Planning Evidence\n'), 'T5b: ## Planning Evidence present after EOF-append');

  const r5b2 = run5b();
  assert(r5b2.handoff_status === 'ready_to_run', 'T5b: run2 → ready');
  const s5b2 = written5b[written5b.length - 1];
  assert(s5b2 !== undefined, 'T5b: run2 wrote state');
  assert(s5b2 === s5b1, 'T5b: state byte-identical run1==run2 (EOF-append branch idempotency)');

  const r5b3 = run5b();
  assert(r5b3.handoff_status === 'ready_to_run', 'T5b: run3 → ready');
  const s5b3 = written5b[written5b.length - 1];
  assert(s5b3 !== undefined, 'T5b: run3 wrote state');
  assert(s5b3 === s5b2, 'T5b: state byte-identical run2==run3 (3-way EOF-append stability)');
}

// ---------------------------------------------------------------------------
// T6: ## Sink preserved — state has ## Sink w/ trailing pr_url:/worktree_path:
//     after insert assert ## Sink byte-identical + ## Planning Evidence before ## Last Updated.
// ---------------------------------------------------------------------------
{
  const HASH = PLAN_HASH_64;
  const planContent = makeUnfrozenPlan('auto-run');
  const frozenPlanContent = planContent + '\n<!-- plan_hash: ' + HASH + ' -->';

  // State with ## Sink having extra trailing fields (pr_url, worktree_path)
  const stateContent = [
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
    '## Pending Gates',
    '- workflow-plan',
    '',
    '## Last Evidence',
    'phase_file: N/A',
    'last_command: claim',
    '',
    '## Last Updated',
    '2026-06-01T00:00:00.000Z',
    '',
    '## Sink',
    'branch: workflow/test-project',
    'issue_number: 42',
    'sink: merge',
    'pr_url: https://github.com/example/repo/pull/99',
    'worktree_path: /tmp/worktrees/test-project',
  ].join('\n') + '\n';

  // Capture the ## Sink section from original state
  const sinkIdx = stateContent.indexOf('\n## Sink');
  const originalSinkBlock = stateContent.slice(sinkIdx);

  let writtenStateContent = null;
  let readCallCount = 0;

  const shellStub = makeShellStub({
    'kaola-workflow-plan-validator.js:--json': {
      exitCode: 0, result: 'in-grammar', decision: 'auto-run', planHash: HASH,
      risk: { sensitivity: false, blastRadius: false, uncertain: false, reasons: [] }
    },
    'kaola-workflow-plan-validator.js:--freeze': {
      exitCode: 0, result: 'in-grammar', decision: 'auto-run', planHash: HASH, frozen: true,
      risk: { sensitivity: false, blastRadius: false, uncertain: false, reasons: [] }
    },
    'kaola-workflow-plan-validator.js:--resume-check': { exitCode: 0, ok: true, planHash: HASH },
    'kaola-workflow-roadmap.js:init-issue': { exitCode: 0, created: true },
    'git:add': { exitCode: 0 },
    'kaola-workflow-adaptive-node.js': { exitCode: 0, status: 'mirrored', planHash: HASH, dest: '/wt/kaola-workflow/test-project' },
  });

  const result = runHandoff({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    json: true,
    shell: shellStub,
    computeNextAction: require('./kaola-workflow-next-action').computeNextAction,
    resolveModel: () => 'sonnet',
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) {
        readCallCount++;
        return readCallCount <= 1 ? planContent : frozenPlanContent;
      }
      if (fpath.endsWith('workflow-state.md')) return stateContent;
      return '';
    },
    writeFile: (fpath, content) => {
      if (fpath.endsWith('workflow-state.md')) writtenStateContent = content;
    },
    stateMtime: undefined,
  });

  assert(result.handoff_status === 'ready_to_run', 'T6: handoff ready');

  // ## Planning Evidence appears before ## Last Updated
  const pePos = (writtenStateContent || '').indexOf('\n## Planning Evidence');
  const luPos = (writtenStateContent || '').indexOf('\n## Last Updated');
  assert(pePos >= 0, 'T6: ## Planning Evidence present in written state');
  assert(luPos >= 0, 'T6: ## Last Updated present in written state');
  assert(pePos < luPos, 'T6: ## Planning Evidence before ## Last Updated');

  // ## Sink block preserved byte-identical
  const writtenSinkIdx = (writtenStateContent || '').indexOf('\n## Sink');
  const writtenSinkBlock = writtenSinkIdx >= 0
    ? (writtenStateContent || '').slice(writtenSinkIdx)
    : '';
  assert(writtenSinkBlock === originalSinkBlock,
    'T6: ## Sink block preserved byte-identical after Planning Evidence insert');

  // pr_url and worktree_path still present
  assert((writtenStateContent || '').includes('pr_url: https://github.com'), 'T6: pr_url preserved');
  assert((writtenStateContent || '').includes('worktree_path: /tmp/worktrees'), 'T6: worktree_path preserved');
}

// ---------------------------------------------------------------------------
// T7: state missing → plan_invalid unclaimed error, no mutation
// ---------------------------------------------------------------------------
{
  let writeFileCalled = false;
  let shellCalled = false;

  const result = runHandoff({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    json: true,
    shell: (scriptPath, args) => { shellCalled = true; return { exitCode: 0 }; },
    computeNextAction: require('./kaola-workflow-next-action').computeNextAction,
    resolveModel: () => 'sonnet',
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-state.md')) throw new Error('ENOENT: no such file or directory');
      return '';
    },
    writeFile: (fpath, content) => { writeFileCalled = true; },
    stateMtime: undefined,
  });

  assert(result.handoff_status === 'plan_invalid', 'T7: plan_invalid when state missing');
  assert(Array.isArray(result.errors) && result.errors.some(e => e.includes('workflow-state.md missing')),
    'T7: errors contain workflow-state.md missing message');
  assert(writeFileCalled === false, 'T7: writeFile not called (no mutation)');
  // shell should NOT be called for any mutation steps (freeze etc.)
  assert(shellCalled === false, 'T7: no shell calls on state-missing precondition failure');
}

// ---------------------------------------------------------------------------
// T8: shellHandoff seam — stub validator in os.tmpdir exiting 1 w/ canned JSON
//     assert shellHandoff captures {exitCode:1,...parsed}; temp dir cleaned up.
// ---------------------------------------------------------------------------
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-handoff-T8-'));
  try {
    // Write a stub validator script that exits 1 with canned JSON
    const stubValidatorPath = path.join(tmpDir, 'stub-validator.js');
    const cannedJson = JSON.stringify({
      result: 'refuse', errors: ['T8 stub validator error'], planHash: null
    });
    fs.writeFileSync(stubValidatorPath, [
      "'use strict';",
      "process.stdout.write(" + JSON.stringify(cannedJson) + " + '\\n');",
      "process.exitCode = 1;",
    ].join('\n'));

    // Use a fake plan path (the stub doesn't actually read it)
    const fakePlanPath = path.join(tmpDir, 'workflow-plan.md');
    fs.writeFileSync(fakePlanPath, '# fake plan\n');

    const r = shellHandoff(stubValidatorPath, ['--json']);
    assert(r.exitCode === 1, 'T8: shellHandoff captures exitCode===1');
    assert(r.result === 'refuse', 'T8: shellHandoff parses result from stub stdout');
    assert(Array.isArray(r.errors) && r.errors[0] === 'T8 stub validator error',
      'T8: shellHandoff parses errors verbatim from stub stdout');
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true }); } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// #282 (AC-1): after freezing + integrity-checking the plan, the handoff generates
// the durable task mirror (workflow-tasks.json) by shelling the task-mirror CLI, so
// it exists from the first plan-run entry without a manual call. Best-effort (a
// non-zero from the CLI never blocks ready_to_run).
// ---------------------------------------------------------------------------
{
  const planContent = makeUnfrozenPlan('auto-run');
  const stateContent = makeStateContent({ issueNumber: 7 });
  let readCallCount = 0;
  const frozenPlanContent = planContent.replace('# Workflow Plan', '<!-- plan_hash: ' + PLAN_HASH_64 + ' -->\n\n# Workflow Plan');
  const shelled = [];
  const inner = makeShellStub({
    'kaola-workflow-plan-validator.js:--json': { exitCode: 0, result: 'in-grammar', decision: 'auto-run', planHash: PLAN_HASH_64, risk: {} },
    'kaola-workflow-plan-validator.js:--freeze': { exitCode: 0, result: 'in-grammar', decision: 'auto-run', planHash: PLAN_HASH_64, frozen: true, risk: {} },
    'kaola-workflow-plan-validator.js:--resume-check': { exitCode: 0, ok: true, planHash: PLAN_HASH_64 },
    'kaola-workflow-roadmap.js:init-issue': { exitCode: 0, created: true },
    'git:add': { exitCode: 0 },
    'kaola-workflow-task-mirror.js': { exitCode: 0 },
    'kaola-workflow-adaptive-node.js': { exitCode: 0, status: 'mirrored', planHash: PLAN_HASH_64, dest: '/wt/kaola-workflow/test-project' },
  });
  const shellStub = (scriptPath, args) => { shelled.push(path.basename(scriptPath)); return inner(scriptPath, args); };
  const result = runHandoff({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    json: true,
    shell: shellStub,
    computeNextAction: require('./kaola-workflow-next-action').computeNextAction,
    resolveModel: () => 'sonnet',
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) { readCallCount++; return readCallCount <= 1 ? planContent : frozenPlanContent; }
      if (fpath.endsWith('workflow-state.md')) return stateContent;
      return '';
    },
    writeFile: () => {},
    stateMtime: undefined,
  });
  assert(result.handoff_status === 'ready_to_run', '#282 AC-1: handoff still ready_to_run, got ' + JSON.stringify(result.handoff_status));
  assert(shelled.includes('kaola-workflow-task-mirror.js'),
    '#282 AC-1: handoff shells the task-mirror CLI after freeze, got ' + JSON.stringify(shelled));
}

// ---------------------------------------------------------------------------
// #337 — decision-record id preflight (step 1.5): T9a–T9f.
// An unfrozen plan that hardcodes a D-<n>-<seq> id the repo already records
// must refuse (decision_id_conflict) BEFORE --freeze (no mutation). Frozen
// plans, annotated "(existing)" references, placeholders, and absent-seam
// callers are all exempt (freeze-time-once + fail-open by construction).
// ---------------------------------------------------------------------------

// Helper: in-grammar unfrozen plan + trailing ## Plan Notes prose.
function makeDecisionIdPlan(notesLine) {
  return makeUnfrozenPlan('auto-run') + [
    '',
    '## Plan Notes',
    '',
    notesLine,
    '',
  ].join('\n');
}

// Helper: drive runHandoff with the standard in-grammar/auto-run stub set,
// spying on --freeze, writeFile, and the injected decision-id seam.
// opts.seam     — function(ids) → hits map; wrapped to record calls. Omit → no seam injected.
// Returns { result, spies }.
function runDecisionIdCase(planContent, opts) {
  opts = opts || {};
  // No issue_number → roadmap stage skipped (hermetic).
  const stateContent = makeStateContent({ issueNumber: null });
  const spies = { freezeCalled: false, writeFileCalled: false, seamCalls: [] };
  const alreadyFrozen = /plan_hash/.test(planContent);
  const frozenPlanContent = alreadyFrozen
    ? planContent
    : planContent + '\n<!-- plan_hash: ' + PLAN_HASH_64 + ' -->\n';

  const inner = makeShellStub({
    'kaola-workflow-plan-validator.js:--json': {
      exitCode: 0, result: 'in-grammar', decision: 'auto-run', planHash: PLAN_HASH_64,
      risk: { sensitivity: false, blastRadius: false, uncertain: false, reasons: [] }
    },
    'kaola-workflow-plan-validator.js:--freeze': {
      exitCode: 0, result: 'in-grammar', decision: 'auto-run', planHash: PLAN_HASH_64, frozen: true,
      risk: { sensitivity: false, blastRadius: false, uncertain: false, reasons: [] }
    },
    'kaola-workflow-plan-validator.js:--resume-check': { exitCode: 0, ok: true, planHash: PLAN_HASH_64 },
    'kaola-workflow-task-mirror.js': { exitCode: 0 },
    'kaola-workflow-adaptive-node.js': { exitCode: 0, status: 'mirrored', planHash: PLAN_HASH_64 },
  });
  const shellStub = (scriptPath, args) => {
    if (path.basename(scriptPath) === 'kaola-workflow-plan-validator.js' && (args || []).includes('--freeze')) {
      spies.freezeCalled = true;
    }
    return inner(scriptPath, args);
  };

  const runOpts = {
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    json: true,
    shell: shellStub,
    computeNextAction: require('./kaola-workflow-next-action').computeNextAction,
    resolveModel: () => 'sonnet',
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) {
        // Pre-freeze reads see the unfrozen plan; post-freeze reads see the frozen one.
        return spies.freezeCalled ? frozenPlanContent : planContent;
      }
      if (fpath.endsWith('workflow-state.md')) return stateContent;
      return '';
    },
    writeFile: () => { spies.writeFileCalled = true; },
    stateMtime: undefined,
  };
  if (typeof opts.seam === 'function') {
    runOpts.findDecisionIdHits = ids => { spies.seamCalls.push(ids); return opts.seam(ids); };
  }
  const result = runHandoff(runOpts);
  return { result, spies };
}

// T9a (AC2 regression): unfrozen plan hardcodes D-210-01; repo records it →
// plan_invalid/refuse with decision_id_conflict, remediation text, conflicts
// field, NO --freeze shell call, NO writeFile call.
{
  const plan = makeDecisionIdPlan('- the docs follow-up node writes decision record D-210-01.');
  const { result, spies } = runDecisionIdCase(plan, {
    seam: () => ({ 'D-210-01': ['docs/decisions/D-210-01-prior.md'] }),
  });
  assert(result.handoff_status === 'plan_invalid',
    'T9a: handoff_status===plan_invalid on stale decision id, got ' + JSON.stringify(result.handoff_status));
  assert(result.result === 'refuse', 'T9a: result===refuse');
  assert(Array.isArray(result.errors) && result.errors.length === 1,
    'T9a: exactly one error, got ' + JSON.stringify(result.errors));
  const t9aErr = ((result.errors || [])[0]) || '';
  assert(t9aErr.indexOf('decision_id_conflict') === 0,
    'T9a: errors[0] starts with decision_id_conflict, got ' + JSON.stringify(result.errors));
  assert(t9aErr.includes('next free D-210-NN'),
    'T9a: errors[0] carries renumber remediation (next free D-210-NN)');
  assert(t9aErr.includes('D-210-NEXT'),
    'T9a: errors[0] names the D-210-NEXT placeholder remediation');
  assert(t9aErr.includes('docs/decisions/D-210-01-prior.md'),
    'T9a: errors[0] names the repo hit path');
  assert(Array.isArray(result.conflicts) && result.conflicts.length === 1 &&
         result.conflicts[0].id === 'D-210-01',
    'T9a: conflicts[0].id===D-210-01 (machine-readable), got ' + JSON.stringify(result.conflicts));
  assert(result.validator_verdict && result.validator_verdict.result === 'in-grammar',
    'T9a: validator_verdict carries the in-grammar step-1 verdict (refusal is handoff-level)');
  assert(spies.freezeCalled === false, 'T9a: --freeze NOT called (refusal pre-freeze)');
  assert(spies.writeFileCalled === false, 'T9a: writeFile NEVER called (no mutation)');
}

// T9b (no conflict): same plan, seam reports no hits → ready_to_run, freeze called.
{
  const plan = makeDecisionIdPlan('- the docs follow-up node writes decision record D-210-01.');
  const { result, spies } = runDecisionIdCase(plan, {
    seam: () => ({ 'D-210-01': [] }),
  });
  assert(result.handoff_status === 'ready_to_run', 'T9b: no repo hit → ready_to_run');
  assert(spies.freezeCalled === true, 'T9b: --freeze called when no conflict');
  assert(spies.seamCalls.length === 1 && spies.seamCalls[0][0] === 'D-210-01',
    'T9b: seam consulted once with the candidate id');
}

// T9c (annotation escape): only occurrence is annotated "(existing)" → not a
// candidate; seam never consulted; ready_to_run.
{
  const plan = makeDecisionIdPlan('- D-210-01 (existing) covered the first half of the issue.');
  const { result, spies } = runDecisionIdCase(plan, {
    seam: () => ({ 'D-210-01': ['docs/decisions/D-210-01-prior.md'] }),
  });
  assert(result.handoff_status === 'ready_to_run', 'T9c: annotated (existing) reference → ready_to_run');
  assert(spies.seamCalls.length === 0, 'T9c: seam NOT consulted (no candidates)');
}

// T9d (freeze-time-once): plan already frozen + unannotated token + seam
// reporting a hit → ready_to_run (skip on frozen; resume cannot self-conflict).
{
  const plan = makeFrozenInProgressPlan() + [
    '', '## Plan Notes', '', '- this run already wrote decision record D-210-01.', '',
  ].join('\n');
  const { result, spies } = runDecisionIdCase(plan, {
    seam: () => ({ 'D-210-01': ['docs/decisions/D-210-01-this-run.md'] }),
  });
  assert(result.handoff_status === 'ready_to_run', 'T9d: frozen plan → preflight skipped, ready_to_run');
  assert(spies.seamCalls.length === 0, 'T9d: seam NOT consulted on a frozen plan');
}

// T9e (seam absent): conflicting plan, NO findDecisionIdHits in opts →
// ready_to_run (back-compat fail-open).
{
  const plan = makeDecisionIdPlan('- the docs follow-up node writes decision record D-210-01.');
  const { result, spies } = runDecisionIdCase(plan, {});
  assert(result.handoff_status === 'ready_to_run', 'T9e: absent seam → check skipped, ready_to_run');
  assert(spies.freezeCalled === true, 'T9e: --freeze still called (current behavior preserved)');
}

// T9f (placeholder + extractDecisionIdCandidates unit asserts).
{
  const plan = makeDecisionIdPlan('- the docs follow-up node writes decision record D-210-NEXT.');
  const { result, spies } = runDecisionIdCase(plan, {
    seam: () => ({}),
  });
  assert(result.handoff_status === 'ready_to_run', 'T9f: D-210-NEXT placeholder → ready_to_run');
  assert(spies.seamCalls.length === 0, 'T9f: seam NOT consulted (placeholder is not a candidate)');

  // Direct unit asserts on the pure helper.
  assert(typeof extractDecisionIdCandidates === 'function',
    'T9f: extractDecisionIdCandidates exported');
  assert(JSON.stringify(extractDecisionIdCandidates('D-210-01 and again D-210-01')) ===
         JSON.stringify(['D-210-01']),
    'T9f: dedupe — repeated id collected once');
  assert(JSON.stringify(extractDecisionIdCandidates('D-210-02 then D-210-01')) ===
         JSON.stringify(['D-210-02', 'D-210-01']),
    'T9f: first-seen order preserved');
  assert(JSON.stringify(extractDecisionIdCandidates('D-210-01 (existing) yet later plain D-210-01')) ===
         JSON.stringify(['D-210-01']),
    'T9f: mixed annotated+unannotated occurrence is still a candidate');
  assert(JSON.stringify(extractDecisionIdCandidates('see D-210-012 here')) ===
         JSON.stringify(['D-210-012']),
    'T9f: word boundary — D-210-012 is its own token, not D-210-01');
  assert(JSON.stringify(extractDecisionIdCandidates('placeholder D-210-NEXT only')) ===
         JSON.stringify([]),
    'T9f: D-210-NEXT placeholder never a candidate');
  assert(JSON.stringify(extractDecisionIdCandidates('')) === JSON.stringify([]),
    'T9f: empty content → no candidates');
}

// ---------------------------------------------------------------------------
// #335 — handoff step 7 (mirror-project) integration: H1–H3 + T3/T7 re-verify.
// ---------------------------------------------------------------------------

// Helper: a ready-path runHandoff with the standard in-grammar/auto-run stub set
// plus a recording shell that captures call order. opts.mirrorResponse overrides
// the mirror-project canned response. Returns { result, order }.
function runMirrorHandoffCase(mirrorResponse) {
  const planContent = makeUnfrozenPlan('auto-run');
  const stateContent = makeStateContent({ issueNumber: 99 });
  let readCallCount = 0;
  const frozenPlanContent = planContent.replace('# Workflow Plan', '<!-- plan_hash: ' + PLAN_HASH_64 + ' -->\n\n# Workflow Plan');
  const order = [];
  const inner = makeShellStub({
    'kaola-workflow-plan-validator.js:--json': { exitCode: 0, result: 'in-grammar', decision: 'auto-run', planHash: PLAN_HASH_64, risk: {} },
    'kaola-workflow-plan-validator.js:--freeze': { exitCode: 0, result: 'in-grammar', decision: 'auto-run', planHash: PLAN_HASH_64, frozen: true, risk: {} },
    'kaola-workflow-plan-validator.js:--resume-check': { exitCode: 0, ok: true, planHash: PLAN_HASH_64 },
    'kaola-workflow-roadmap.js:init-issue': { exitCode: 0, created: true },
    'git:add': { exitCode: 0 },
    'kaola-workflow-task-mirror.js': { exitCode: 0 },
    'kaola-workflow-adaptive-node.js': mirrorResponse,
  });
  const shellStub = (scriptPath, args) => {
    const b = path.basename(scriptPath);
    if (b === 'kaola-workflow-adaptive-node.js') order.push('shell:mirror-project');
    return inner(scriptPath, args);
  };
  const result = runHandoff({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    json: true,
    shell: shellStub,
    computeNextAction: require('./kaola-workflow-next-action').computeNextAction,
    resolveModel: () => 'sonnet',
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) { readCallCount++; return readCallCount <= 1 ? planContent : frozenPlanContent; }
      if (fpath.endsWith('workflow-state.md')) return stateContent;
      return '';
    },
    writeFile: (fpath) => { if (fpath.endsWith('workflow-state.md')) order.push('writeFile:state'); },
    stateMtime: undefined,
  });
  return { result, order };
}

// H1: ready packet carries worktree_mirror echoing the stubbed mirror result.
{
  const { result } = runMirrorHandoffCase({ exitCode: 0, status: 'mirrored', planHash: PLAN_HASH_64, dest: '/wt/kaola-workflow/test-project' });
  assert(result.handoff_status === 'ready_to_run', 'H1: ready_to_run');
  assert(result.worktree_mirror && result.worktree_mirror.status === 'mirrored', 'H1: worktree_mirror.status===mirrored, got ' + JSON.stringify(result.worktree_mirror));
  assert(result.worktree_mirror.planHash === PLAN_HASH_64, 'H1: worktree_mirror.planHash echoed');
  assert(result.worktree_mirror.path === '/wt/kaola-workflow/test-project', 'H1: worktree_mirror.path echoed from dest');
}

// H1b: skipped (in-place run) → status:'skipped', no planHash/path.
{
  const { result } = runMirrorHandoffCase({ exitCode: 0, status: 'skipped', reason: 'no_worktree' });
  assert(result.worktree_mirror.status === 'skipped' && result.worktree_mirror.reason === 'no_worktree', 'H1b: skipped/no_worktree echoed, got ' + JSON.stringify(result.worktree_mirror));
}

// H2: mirror shelled STRICTLY AFTER the workflow-state.md write (step 6 → step 7 order).
{
  const { order } = runMirrorHandoffCase({ exitCode: 0, status: 'mirrored', planHash: PLAN_HASH_64 });
  const stateIdx = order.indexOf('writeFile:state');
  const mirrorIdx = order.indexOf('shell:mirror-project');
  assert(stateIdx >= 0 && mirrorIdx >= 0, 'H2: both state write and mirror shell happened, got ' + JSON.stringify(order));
  assert(stateIdx < mirrorIdx, 'H2: mirror-project shelled AFTER the state write, got ' + JSON.stringify(order));
}

// H3: stubbed mirror REFUSE → handoff STILL ready_to_run (best-effort); status:'failed'.
{
  const { result } = runMirrorHandoffCase({ exitCode: 1, result: 'refuse', reason: 'mirror_verify_failed' });
  assert(result.handoff_status === 'ready_to_run', 'H3: a mirror refuse does NOT flip handoff_status, got ' + result.handoff_status);
  assert(result.worktree_mirror.status === 'failed', 'H3: worktree_mirror.status===failed on a non-zero mirror, got ' + JSON.stringify(result.worktree_mirror));
  assert(result.worktree_mirror.reason === 'mirror_verify_failed', 'H3: failure reason surfaced');
}

// T3-#335: validator refuse → mirror-project NEVER shelled (refuse returns before step 7).
{
  let mirrorShelled = false;
  const planContent = makeUnfrozenPlan('refuse');
  const stateContent = makeStateContent({ issueNumber: 5 });
  const result = runHandoff({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    json: true,
    shell: (scriptPath) => {
      if (path.basename(scriptPath) === 'kaola-workflow-adaptive-node.js') mirrorShelled = true;
      return { exitCode: 1, result: 'refuse', errors: ['leak'], planHash: null };
    },
    computeNextAction: require('./kaola-workflow-next-action').computeNextAction,
    resolveModel: () => 'sonnet',
    readFile: (fpath) => { if (fpath.endsWith('workflow-state.md')) return stateContent; if (fpath.endsWith('workflow-plan.md')) return planContent; return ''; },
    writeFile: () => {},
    stateMtime: undefined,
  });
  assert(result.handoff_status === 'plan_invalid', 'T3-#335: plan_invalid on validator refuse');
  assert(mirrorShelled === false, 'T3-#335: mirror-project NEVER shelled on a pre-step-7 refuse');
  assert(result.worktree_mirror === undefined, 'T3-#335: no worktree_mirror field on the refuse packet');
}

// T7-#335: state missing → no shell at all (mirror-project never reached).
{
  let mirrorShelled = false;
  const result = runHandoff({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project',
    json: true,
    shell: (scriptPath) => { if (path.basename(scriptPath) === 'kaola-workflow-adaptive-node.js') mirrorShelled = true; return { exitCode: 0 }; },
    computeNextAction: require('./kaola-workflow-next-action').computeNextAction,
    resolveModel: () => 'sonnet',
    readFile: (fpath) => { if (fpath.endsWith('workflow-state.md')) throw new Error('ENOENT'); return ''; },
    writeFile: () => {},
    stateMtime: undefined,
  });
  assert(result.handoff_status === 'plan_invalid', 'T7-#335: plan_invalid on state missing');
  assert(mirrorShelled === false, 'T7-#335: mirror-project never shelled when the precondition fails');
}

// ---------------------------------------------------------------------------
// #389: the workflow-state.md Planning Evidence write routes through the crash-safe
// atomic replace (tmp + fsync + rename), so a torn write can never strand a partial
// workflow-state.md. Drive runHandoff with the REAL atomic-replace seam (the one wired
// into the CLI main()) against a real temp state file: the PE-updated content must land
// fully intact and leave NO `.workflow-state.md.*.tmp` sidecar behind.
// ---------------------------------------------------------------------------
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-handoff-389-'));
  try {
    const proj = path.join(tmpDir, 'kaola-workflow', 'test-project');
    fs.mkdirSync(proj, { recursive: true });
    const planPath = path.join(proj, 'workflow-plan.md');
    const statePath = path.join(proj, 'workflow-state.md');
    const planContent = makeUnfrozenPlan('auto-run');
    const stateContent = makeStateContent({ issueNumber: null }); // no issue → roadmap stage skipped
    fs.writeFileSync(statePath, stateContent);
    const frozenPlanContent = planContent + '<!-- plan_hash: ' + PLAN_HASH_64 + ' -->';
    let readCallCount = 0;

    const shellStub = makeShellStub({
      'kaola-workflow-plan-validator.js:--json': { exitCode: 0, result: 'in-grammar', decision: 'auto-run', planHash: PLAN_HASH_64, risk: { sensitivity: false, blastRadius: false, uncertain: false, reasons: [] } },
      'kaola-workflow-plan-validator.js:--freeze': { exitCode: 0, result: 'in-grammar', decision: 'auto-run', planHash: PLAN_HASH_64, frozen: true, risk: { sensitivity: false, blastRadius: false, uncertain: false, reasons: [] } },
      'kaola-workflow-plan-validator.js:--resume-check': { exitCode: 0, ok: true, planHash: PLAN_HASH_64 },
      'kaola-workflow-task-mirror.js': { exitCode: 0 },
      'kaola-workflow-adaptive-node.js': { exitCode: 0, status: 'mirrored', planHash: PLAN_HASH_64 },
    });

    const result = runHandoff({
      planPath, statePath, project: 'test-project', json: true,
      shell: shellStub,
      computeNextAction: require('./kaola-workflow-next-action').computeNextAction,
      resolveModel: () => 'sonnet',
      readFile: (fpath) => {
        if (fpath.endsWith('workflow-plan.md')) { readCallCount++; return readCallCount <= 1 ? planContent : frozenPlanContent; }
        if (fpath.endsWith('workflow-state.md')) return fs.readFileSync(fpath, 'utf8');
        return '';
      },
      // REAL atomic-replace seam — identical to the CLI main() wiring.
      writeFile: (fpath, content) => require('./kaola-workflow-adaptive-schema').writeFileAtomicReplace(fpath, content),
      stateMtime: undefined,
    });

    assert(result.handoff_status === 'ready_to_run', '#389: handoff still ready_to_run with the atomic seam, got ' + JSON.stringify(result.handoff_status));
    const landed = fs.readFileSync(statePath, 'utf8');
    assert(landed.includes('## Planning Evidence') && landed.includes('plan_hash: ' + PLAN_HASH_64),
      '#389: the atomic-replace seam must land the full PE-updated workflow-state.md intact');
    const sidecars = fs.readdirSync(proj).filter(f => /^\.workflow-state\.md\..*\.tmp$/.test(f));
    assert(sidecars.length === 0, '#389: the atomic-replace seam must leave no .tmp sidecar, got ' + JSON.stringify(sidecars));
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true }); } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// T597 (AC1): freeze-time speculative_open_policy materialization. A FRESH freeze that OMITS the field
// materializes `speculative_open_policy: auto` into ## Meta (self-describing + hash-covered — the
// recomputed hash is handed to SPAWN 2 as the governance-ack). An EXPLICIT field is preserved (never
// re-materialized); an already-frozen plan is left untouched (no retroactive posture flip).
// ---------------------------------------------------------------------------
{
  const { computePlanHash } = require('./kaola-workflow-plan-validator');
  const schemaMod = require('./kaola-workflow-adaptive-schema');
  const PLAN_KEY = '/fake/kaola-workflow/test-project/workflow-plan.md';

  function runMaterializeCase(planContent) {
    const stateContent = makeStateContent({ issueNumber: null });
    const writtenFiles = {};
    const freezeAcks = [];
    let onDisk = planContent; // readFile reflects the materialization write, mirroring the real seam
    const baseStub = makeShellStub({
      'kaola-workflow-plan-validator.js:--json': { exitCode: 0, result: 'in-grammar', decision: 'auto-run', planHash: PLAN_HASH_64, risk: { reasons: [] } },
      'kaola-workflow-plan-validator.js:--freeze': { exitCode: 0, result: 'in-grammar', decision: 'auto-run', planHash: PLAN_HASH_64, frozen: true, resumeOk: true, risk: { reasons: [] } },
      'kaola-workflow-roadmap.js:init-issue': { exitCode: 0, created: true },
      'git:add': { exitCode: 0 },
      'kaola-workflow-adaptive-node.js': { exitCode: 0, status: 'mirrored' },
    });
    const shell = (scriptPath, args) => {
      if (String(scriptPath).endsWith('kaola-workflow-plan-validator.js') && args.includes('--freeze') && args.includes('--governance-ack')) {
        freezeAcks.push(args[args.indexOf('--governance-ack') + 1]);
      }
      return baseStub(scriptPath, args);
    };
    const result = runHandoff({
      planPath: PLAN_KEY,
      statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
      project: 'test-project', json: true, shell,
      computeNextAction: require('./kaola-workflow-next-action').computeNextAction,
      resolveModel: () => 'sonnet',
      readFile: (fpath) => {
        if (fpath.endsWith('workflow-plan.md')) return onDisk;
        if (fpath.endsWith('workflow-state.md')) return stateContent;
        return '';
      },
      writeFile: (fpath, content) => { writtenFiles[fpath] = content; if (fpath.endsWith('workflow-plan.md')) onDisk = content; },
      stateMtime: undefined,
    });
    return { result, writtenFiles, freezeAcks };
  }

  // (a) fresh + field ABSENT → materialize `speculative_open_policy: auto`, hash-covered.
  {
    const plan = makeUnfrozenPlan('auto-run'); // ## Meta present, NO speculative_open_policy
    const { result, writtenFiles, freezeAcks } = runMaterializeCase(plan);
    assert(result.handoff_status === 'ready_to_run', 'T597-AC1a: still ready_to_run after materialization, got ' + JSON.stringify(result.handoff_status));
    const written = writtenFiles[PLAN_KEY];
    assert(typeof written === 'string' && /^speculative_open_policy:[ \t]*auto[ \t]*$/m.test(written),
      'T597-AC1a: a fresh freeze materializes speculative_open_policy: auto into the plan, got ' + JSON.stringify(written));
    const expectMaterialized = schemaMod.materializeSpeculativePolicy(plan, 'auto');
    assert(written === expectMaterialized, 'T597-AC1a: the written plan equals the materialized content');
    assert(freezeAcks.length === 1 && freezeAcks[0] === computePlanHash(expectMaterialized),
      'T597-AC1a: SPAWN 2 governance-ack is the RECOMPUTED hash over the materialized plan (hash-covered), got ' + JSON.stringify(freezeAcks));
  }

  // (b) fresh + field EXPLICIT (consent) → preserved, NEVER re-materialized; ack is the SPAWN-1 hash.
  {
    const plan = makeUnfrozenPlan('auto-run').replace('labels: area:scripts', 'labels: area:scripts\nspeculative_open_policy: consent');
    const { result, writtenFiles, freezeAcks } = runMaterializeCase(plan);
    assert(result.handoff_status === 'ready_to_run', 'T597-AC1b: ready_to_run with an explicit field');
    assert(writtenFiles[PLAN_KEY] === undefined, 'T597-AC1b: an explicit speculative_open_policy is never re-materialized (no plan write), got ' + JSON.stringify(writtenFiles[PLAN_KEY]));
    assert(freezeAcks.length === 1 && freezeAcks[0] === PLAN_HASH_64, 'T597-AC1b: SPAWN 2 ack is the unchanged SPAWN-1 hash when nothing is materialized');
  }

  // (c) ALREADY-FROZEN plan + field ABSENT → left untouched (no retroactive flip to auto).
  {
    const frozen = '<!-- plan_hash: ' + PLAN_HASH_64 + ' -->\n' + makeUnfrozenPlan('auto-run');
    const { result, writtenFiles } = runMaterializeCase(frozen);
    assert(result.handoff_status === 'ready_to_run', 'T597-AC1c: ready_to_run on a re-run of a frozen plan');
    assert(writtenFiles[PLAN_KEY] === undefined, 'T597-AC1c: an already-frozen plan with an absent field is NOT materialized (no retroactive flip), got ' + JSON.stringify(writtenFiles[PLAN_KEY]));
  }
}

// ---------------------------------------------------------------------------
// #641 (D-641-01) R2a — the `observes: scratch` freeze contract, end-to-end through the REAL validator
// subprocess (shellHandoff). The annotation is authorable ONLY on an adversarial-verifier READ node; the
// freeze validator REFUSES it on code-reviewer / security-reviewer / main-session-gate (their role IS
// tree/diff observation, so the scope is incoherent) and on an unknown scope value. A refuse surfaces as
// handoff_status:'plan_invalid' carrying the typed error token; a legal annotation freezes.
// ---------------------------------------------------------------------------
{
  const VALIDATOR = path.join(__dirname, 'kaola-workflow-plan-validator.js');
  // A complete, freezable adaptive plan: seed(complete-able) → gate(read) ∥ w(write) → finalize sink. The
  // `observes` column carries the annotation on the gate row. `role`/`observes` are parameterized.
  function observesPlan(gateRole, observesValue) {
    return [
      '# Workflow Plan — test-project', '',
      '## Meta', 'labels: area:scripts', 'sink: CHANGELOG.md', '',
      '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape | observes |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      '| seed     | code-explorer | —      | —              | 1 | sequence | — |',
      '| gate     | ' + gateRole + ' | seed | —            | 1 | sequence | ' + observesValue + ' |',
      '| w        | doc-updater   | seed   | docs/decisions/D-641-01.md | 1 | sequence | — |',
      '| finalize | finalize      | gate,w | —              | 1 | sequence | — |', '',
      '## Node Ledger', '',
      '| id | status |', '| --- | --- |',
      '| seed | pending |', '| gate | pending |', '| w | pending |', '| finalize | pending |', '',
    ].join('\n') + '\n';
  }

  // Drive the freeze validator DIRECTLY (the authoritative gate the handoff surfaces verbatim) in a real
  // temp dir, then assert the validator verdict. This is the freeze contract the handoff's SPAWN-1
  // (--freeze-checked) consumes; a refuse here IS the plan_invalid the handoff returns.
  function freezeVerdict(planContent) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw641-obs-'));
    const proj = path.join(tmpDir, 'kaola-workflow', 'test-project');
    fs.mkdirSync(proj, { recursive: true });
    const planPath = path.join(proj, 'workflow-plan.md');
    fs.writeFileSync(planPath, planContent);
    const verdict = shellHandoff(VALIDATOR, [planPath, '--json']);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    return verdict;
  }

  // (a) observes: scratch on an adversarial-verifier READ node → in-grammar (freezes).
  {
    const v = freezeVerdict(observesPlan('adversarial-verifier', 'scratch'));
    assert(v.result !== 'refuse', '#641-R2a-accept: observes:scratch on an adversarial-verifier freezes (in-grammar), got ' + JSON.stringify({ result: v.result, errors: v.errors }));
  }
  // (b) observes: scratch on a code-reviewer → REFUSE plan_invalid, typed observes_scope_role_invalid.
  for (const badRole of ['code-reviewer', 'security-reviewer', 'main-session-gate']) {
    const v = freezeVerdict(observesPlan(badRole, 'scratch'));
    assert(v.result === 'refuse' && v.reason === 'plan_invalid', '#641-R2a-refuse[' + badRole + ']: observes:scratch on ' + badRole + ' refuses plan_invalid, got ' + JSON.stringify({ result: v.result, reason: v.reason }));
    assert(Array.isArray(v.errors) && v.errors.some(e => /observes_scope_role_invalid/.test(e)),
      '#641-R2a-refuse[' + badRole + ']: the typed observes_scope_role_invalid token is present, got ' + JSON.stringify(v.errors));
  }
  // (c) an unknown observes scope value → REFUSE plan_invalid, typed observes_scope_unsupported.
  {
    const v = freezeVerdict(observesPlan('adversarial-verifier', 'worktree'));
    assert(v.result === 'refuse' && v.reason === 'plan_invalid', '#641-R2a-unsupported: an unknown observes scope refuses plan_invalid, got ' + JSON.stringify({ result: v.result, reason: v.reason }));
    assert(Array.isArray(v.errors) && v.errors.some(e => /observes_scope_unsupported/.test(e)),
      '#641-R2a-unsupported: the typed observes_scope_unsupported token is present, got ' + JSON.stringify(v.errors));
  }
  // (d) HASH COVERAGE: the annotation lives in the hash-covered ## Nodes region — flipping observes changes
  //     the plan_hash (tamper-evident), so a post-freeze scope change is caught by --resume-check.
  {
    const { computePlanHash } = require('./kaola-workflow-plan-validator');
    const withScope = observesPlan('adversarial-verifier', 'scratch');
    const withoutScope = observesPlan('adversarial-verifier', '—');
    assert(computePlanHash(withScope) !== computePlanHash(withoutScope),
      '#641-R2a-hash: observes:scratch is hash-covered (plan_hash differs from the un-annotated plan)');
  }
  // (e) END-TO-END: the handoff surfaces the validator refuse as plan_invalid (SPAWN-1 --freeze-checked
  //     runs the SAME validatePlan). Drive runHandoff with the REAL validator shell over a bad-observes plan.
  {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw641-obs-h-'));
    try {
      const proj = path.join(tmpDir, 'kaola-workflow', 'test-project');
      fs.mkdirSync(proj, { recursive: true });
      const planPath = path.join(proj, 'workflow-plan.md');
      const statePath = path.join(proj, 'workflow-state.md');
      fs.writeFileSync(planPath, observesPlan('code-reviewer', 'scratch'));
      fs.writeFileSync(statePath, makeStateContent({ issueNumber: 5 }));
      let freezeShelled = false;
      const result = runHandoff({
        planPath, statePath, project: 'test-project', json: true,
        shell: (scriptPath, args) => {
          const a = args || [];
          if (path.basename(scriptPath) === 'kaola-workflow-plan-validator.js' && a.includes('--freeze')) freezeShelled = true;
          return shellHandoff(scriptPath, a);
        },
        computeNextAction: require('./kaola-workflow-next-action').computeNextAction,
        resolveModel: () => 'sonnet',
        readFile: (fpath) => fs.readFileSync(fpath, 'utf8'),
        writeFile: (fpath, content) => fs.writeFileSync(fpath, content),
        stateMtime: undefined,
      });
      assert(result.handoff_status === 'plan_invalid', '#641-R2a-e2e: the handoff surfaces the observes refuse as plan_invalid, got ' + JSON.stringify(result.handoff_status));
      assert(Array.isArray(result.errors) && result.errors.some(e => /observes_scope_role_invalid/.test(e)), '#641-R2a-e2e: the typed token reaches the handoff packet, got ' + JSON.stringify(result.errors));
      assert(freezeShelled === false, '#641-R2a-e2e: --freeze NEVER shelled on the refuse (no mutation)');
    } finally { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} }
  }
}

// ---------------------------------------------------------------------------
// Node Briefs — the durable per-node information channel grammar. A new hash-covered
// `## Node Briefs` plan section (### <node-id> sub-blocks). Two freeze contracts, exercised
// end-to-end through the REAL validator subprocess (shellHandoff) + the handoff mapping:
//   (a) a brief naming an unknown node id → freeze REFUSE brief_unknown_node; the handoff
//       surfaces it as plan_invalid, with NO --freeze and NO mutation.
//   (b) the brief text is hash-covered — a one-line post-freeze brief edit → --resume-check
//       plan_hash_mismatch (the integrity proof). Briefless plans hash byte-identically to the
//       pre-briefs formula (back-compat is absolute).
// ---------------------------------------------------------------------------
{
  const VALIDATOR = path.join(__dirname, 'kaola-workflow-plan-validator.js');
  const { computePlanHash, parseNodeBriefs, nodeBriefsPresent } = require('./kaola-workflow-plan-validator');

  // A minimal freezable 2-node plan (code-explorer → finalize), parameterized on an optional
  // trailing `## Node Briefs` block (h2 section, ### <node-id> sub-blocks).
  function briefsPlan(briefsBlock) {
    const base = [
      '# Workflow Plan — test-project', '',
      '## Meta', 'labels: area:scripts', '',
      '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape |',
      '| --- | --- | --- | --- | --- | --- |',
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| finalize | finalize | explore | CHANGELOG.md | 1 | sequence |', '',
      '## Node Ledger', '',
      '| id | status |', '| --- | --- |',
      '| explore | pending |', '| finalize | pending |', '',
    ];
    if (briefsBlock) base.push(briefsBlock, '');
    return base.join('\n') + '\n';
  }

  const goodBriefs = [
    '## Node Briefs', '',
    '### explore', 'Probe the codebase. Return findings.', '',
    '### finalize', 'Close the loop.',
  ].join('\n');
  const badBriefs = [
    '## Node Briefs', '',
    '### explore', 'Probe.', '',
    '### ghost-node', 'This id is not in the ## Nodes table.',
  ].join('\n');

  // Drive the REAL validator subprocess over a plan in a temp dir; return {verdict, planPath, tmpDir}.
  function freezeVerdict(planContent, extraFlags) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-briefs-'));
    const proj = path.join(tmpDir, 'kaola-workflow', 'test-project');
    fs.mkdirSync(proj, { recursive: true });
    const planPath = path.join(proj, 'workflow-plan.md');
    fs.writeFileSync(planPath, planContent);
    const verdict = shellHandoff(VALIDATOR, [planPath, '--json'].concat(extraFlags || []));
    return { verdict, planPath, tmpDir };
  }

  // (a-neg) a valid-id ## Node Briefs plan freezes (in-grammar) — the section is legal.
  {
    const { verdict, tmpDir } = freezeVerdict(briefsPlan(goodBriefs));
    assert(verdict.result !== 'refuse',
      'briefs-valid: a ## Node Briefs plan with known ids freezes in-grammar, got ' + JSON.stringify({ result: verdict.result, errors: verdict.errors }));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }

  // (a) an unknown-node brief → REFUSE brief_unknown_node (the DEFAULT --json validate path carries
  //     the early typed reason verbatim; the offending id is named in errors).
  {
    const { verdict, tmpDir } = freezeVerdict(briefsPlan(badBriefs));
    assert(verdict.result === 'refuse' && verdict.reason === 'brief_unknown_node',
      'briefs-unknown: an unknown-node ## Node Briefs entry refuses brief_unknown_node, got ' + JSON.stringify({ result: verdict.result, reason: verdict.reason }));
    assert(Array.isArray(verdict.errors) && verdict.errors.some(e => /ghost-node/.test(e)),
      'briefs-unknown: the offending node id is named in the errors, got ' + JSON.stringify(verdict.errors));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }

  // (a-e2e) the handoff surfaces the unknown-node refuse as plan_invalid, with NO --freeze (no mutation).
  {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-briefs-h-'));
    try {
      const proj = path.join(tmpDir, 'kaola-workflow', 'test-project');
      fs.mkdirSync(proj, { recursive: true });
      const planPath = path.join(proj, 'workflow-plan.md');
      const statePath = path.join(proj, 'workflow-state.md');
      fs.writeFileSync(planPath, briefsPlan(badBriefs));
      fs.writeFileSync(statePath, makeStateContent({ issueNumber: 9 }));
      let freezeShelled = false;
      const result = runHandoff({
        planPath, statePath, project: 'test-project', json: true,
        // Delegate ONLY the validator to the real subprocess (its --freeze-checked refuse is what we
        // assert reaches the handoff); stub everything else so a refuse-path test can never shell the
        // real roadmap/git and pollute the live .roadmap mirror (hermetic on refuse and on regression).
        shell: (scriptPath, args) => {
          const a = args || [];
          const base = path.basename(scriptPath);
          if (base === 'kaola-workflow-plan-validator.js') {
            if (a.includes('--freeze')) freezeShelled = true;
            return shellHandoff(scriptPath, a);
          }
          return { exitCode: 0 };
        },
        computeNextAction: require('./kaola-workflow-next-action').computeNextAction,
        resolveModel: () => 'sonnet',
        readFile: (fpath) => fs.readFileSync(fpath, 'utf8'),
        writeFile: (fpath, content) => fs.writeFileSync(fpath, content),
        stateMtime: undefined,
      });
      assert(result.handoff_status === 'plan_invalid',
        'briefs-unknown-e2e: the handoff surfaces the brief refuse as plan_invalid, got ' + JSON.stringify(result.handoff_status));
      assert(Array.isArray(result.errors) && result.errors.some(e => /ghost-node/.test(e)),
        'briefs-unknown-e2e: the offending id reaches the handoff packet, got ' + JSON.stringify(result.errors));
      assert(freezeShelled === false, 'briefs-unknown-e2e: --freeze NEVER shelled on the refuse (no mutation)');
    } finally { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} }
  }

  // (b) HASH COVERAGE: the brief text is hash-covered — a one-line ## Node Briefs edit moves plan_hash.
  {
    const withBrief = briefsPlan(goodBriefs);
    const editedBrief = briefsPlan(goodBriefs.replace('Probe the codebase. Return findings.', 'Probe the codebase. Return a DIFFERENT deliverable.'));
    assert(computePlanHash(withBrief) !== computePlanHash(editedBrief),
      'briefs-hash: a one-line ## Node Briefs edit changes plan_hash (briefs are hash-covered)');
  }

  // (b-resume) post-freeze one-line brief edit → --resume-check refuses plan_hash_mismatch (the
  //            integrity proof: freezing stamps a brief-covering hash, so a later brief edit is caught).
  {
    const { verdict: freezeOut, planPath, tmpDir } = freezeVerdict(briefsPlan(goodBriefs), ['--freeze']);
    try {
      assert(freezeOut.frozen === true,
        'briefs-resume: the good-briefs plan freezes (stamps a plan_hash), got ' + JSON.stringify({ frozen: freezeOut.frozen, errors: freezeOut.errors }));
      const frozen = fs.readFileSync(planPath, 'utf8');
      const tampered = frozen.replace('Probe the codebase. Return findings.', 'Probe the codebase. Return findings. (post-freeze edit)');
      assert(tampered !== frozen, 'briefs-resume: the tamper actually changed the frozen plan');
      fs.writeFileSync(planPath, tampered);
      const resume = shellHandoff(VALIDATOR, [planPath, '--resume-check', '--json']);
      assert(resume.ok === false && resume.reasonCode === 'plan_hash_mismatch',
        'briefs-resume: a post-freeze brief edit fails --resume-check plan_hash_mismatch, got ' + JSON.stringify({ ok: resume.ok, reasonCode: resume.reasonCode }));
    } finally { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} }
  }

  // (c) BACK-COMPAT + parser: a briefless plan hashes byte-identically to the pre-briefs formula
  //     (Meta + Nodes only); parseNodeBriefs returns one trimmed entry per ### sub-block. typeof-guarded
  //     so a missing export produces a clean assertion FAIL (RED) rather than a top-level throw.
  {
    const classifier = require('./kaola-workflow-classifier');
    const crypto = require('crypto');
    const legacyHash = (content) => {
      const norm = section => classifier.sectionBody(content, section).split('\n').map(l => l.trim()).filter(Boolean).join('\n');
      const body = norm('Meta') + '\n---NODES---\n' + norm('Nodes');
      return crypto.createHash('sha256').update(body).digest('hex');
    };
    const briefless = briefsPlan(null);
    assert(typeof nodeBriefsPresent === 'function' && nodeBriefsPresent(briefless) === false,
      'briefs-backcompat: a briefless plan reports nodeBriefsPresent===false');
    assert(computePlanHash(briefless) === legacyHash(briefless),
      'briefs-backcompat: a briefless plan hashes byte-identically to the pre-briefs formula (Meta + Nodes only)');
    assert(typeof nodeBriefsPresent === 'function' && nodeBriefsPresent(briefsPlan(goodBriefs)) === true,
      'briefs-backcompat: a ## Node Briefs plan reports nodeBriefsPresent===true');
    const parsed = (typeof parseNodeBriefs === 'function') ? parseNodeBriefs(briefsPlan(goodBriefs)) : [];
    assert(Array.isArray(parsed) && parsed.length === 2,
      'briefs-parse: parseNodeBriefs returns one entry per ### sub-block, got ' + JSON.stringify(parsed && parsed.map(b => b.nodeId)));
    const ex = parsed.find(b => b.nodeId === 'explore');
    assert(ex && ex.brief === 'Probe the codebase. Return findings.',
      'briefs-parse: the brief body is trimmed (internal newlines preserved), got ' + JSON.stringify(ex && ex.brief));
    assert((typeof parseNodeBriefs === 'function' ? parseNodeBriefs(briefless) : []).length === 0,
      'briefs-parse: a briefless plan parses to []');
  }
}

// Summary
// ---------------------------------------------------------------------------
if (failed > 0) {
  console.error('adaptive-handoff tests FAILED (' + failed + ' failures, ' + passed + ' passed)');
  process.exitCode = 1;
} else {
  console.log('adaptive-handoff tests passed (' + passed + ' assertions)');
}
