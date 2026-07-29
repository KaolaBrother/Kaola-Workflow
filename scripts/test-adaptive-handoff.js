#!/usr/bin/env node
'use strict';

// Unit tests for kaola-workflow-adaptive-handoff.js
// Hand-rolled assert + counter; repo style (no framework).
// Most cases drive runHandoff with injected stub seams (no subprocess).

const { runHandoff, runReplanHandoff, shellHandoff, extractDecisionIdCandidates } = require('./kaola-workflow-adaptive-handoff');

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
    'plan_schema_version: 2',
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
    'plan_schema_version: 2',
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
// The stamped hash is the plan's OWN computed hash unless a caller pins one deliberately: a frozen
// fixture whose stored hash contradicts its bytes is a post-freeze tamper, not a frozen plan.
function makeFrozenInProgressPlan(planHash) {
  if (!planHash) return stampFrozen(h => makeFrozenInProgressPlan(h));
  const hash = planHash;
  return [
    '# Workflow Plan — test-project',
    '',
    '<!-- plan_hash: ' + hash + ' -->',
    '',
    '## Meta',
    'plan_schema_version: 2',
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

// The epoch lineage envelope every current claim writes. A state file WITHOUT it
// is a legacy (pre-envelope) claim, which the handoff refuses to freeze over.
const EPOCH_ENVELOPE_LINES = [
  '## Epoch Lineage',
  'epoch_schema_version: 2',
  'plan_epoch: 1',
  'active_plan_hash: none',
  '',
];

// Minimal workflow-state.md content with ## Sink trailing fields.
function makeStateContent(opts) {
  opts = opts || {};
  const issueNumber = opts.issueNumber !== undefined ? opts.issueNumber : 42;
  const hasSink = opts.hasSink !== false;
  const hasPlanningEvidence = opts.hasPlanningEvidence || false;
  const hasEpochEnvelope = opts.hasEpochEnvelope !== false;
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

  if (hasEpochEnvelope) lines.push(...EPOCH_ENVELOPE_LINES);

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

// A "frozen" fixture whose stamped plan_hash does not match its OWN bytes is a post-freeze tamper,
// and the handoff now refuses one (plan_hash_mismatch) instead of silently re-stamping it. So a
// fixture that means "this plan is frozen" must stamp the hash the validator actually computes for it.
// `place(hash)` inserts the marker wherever that fixture wants it; the marker itself must land OUTSIDE
// every hash-covered section (`## Meta` / `## Nodes` / `## Node Briefs` / `## Design` / `## Acceptance`),
// which the self-check below asserts rather than assumes.
const realComputePlanHash = require('./kaola-workflow-plan-validator').computePlanHash;
function stampFrozen(place) {
  const hash = realComputePlanHash(place(('0').repeat(64)));
  const stamped = place(hash);
  if (realComputePlanHash(stamped) !== hash) {
    throw new Error('fixture error: the plan_hash marker landed inside a hash-covered section');
  }
  return stamped;
}

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
  const frozenPlanContent = stampFrozen(h => planContent.replace('# Workflow Plan', '<!-- plan_hash: ' + h + ' -->\n\n# Workflow Plan'));

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
    && result.first_node.model_display.codex === 'parent session (standard tier metadata)'
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
    '## Meta', 'plan_schema_version: 2', 'labels: area:scripts', '',
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
    const frozenPlanContent = stampFrozen(h => planContent.replace('# Workflow Plan', '<!-- plan_hash: ' + h + ' -->\n\n# Workflow Plan'));
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
    && rNeutral.first_node.model_display.codex === 'parent session (reasoning tier metadata)'
    && rNeutral.first_node.model_display.opencode === 'top effort variant',
    'T1-DISPLAY: reasoning first_node carries a runtime-native model_display, got ' + JSON.stringify(rNeutral.first_node.model_display));

  // BACK-COMPAT: a legacy `sonnet` cell (frozen plan) resolves to the SAME display as neutral `standard`.
  const rLegacy = runDisplay(tieredPlan.replace('| reasoning |', '| sonnet |'));
  assert(rLegacy.first_node.model === 'sonnet', 'T1-DISPLAY: legacy cell preserved verbatim in first_node.model');
  assert(rLegacy.first_node.model_display
    && rLegacy.first_node.model_display.claude === 'sonnet'
    && rLegacy.first_node.model_display.codex === 'parent session (standard tier metadata)'
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
  const frozenPlanContent = stampFrozen(h => planContent + '<!-- plan_hash: ' + h + ' -->');

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
  const frozenPlanContent = stampFrozen(h => planContent + '\n<!-- plan_hash: ' + h + ' -->');

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
  const planContent = makeFrozenInProgressPlan();
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
  const planContent = makeFrozenInProgressPlan();

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
    ...EPOCH_ENVELOPE_LINES,
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
  const frozenPlanContent = stampFrozen(h => planContent + '\n<!-- plan_hash: ' + h + ' -->');

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
    ...EPOCH_ENVELOPE_LINES,
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
  const frozenPlanContent = stampFrozen(h => planContent.replace('# Workflow Plan', '<!-- plan_hash: ' + h + ' -->\n\n# Workflow Plan'));
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
    : stampFrozen(h => planContent + '\n<!-- plan_hash: ' + h + ' -->\n');

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
  const frozenPlanContent = stampFrozen(h => planContent.replace('# Workflow Plan', '<!-- plan_hash: ' + h + ' -->\n\n# Workflow Plan'));
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
    const frozenPlanContent = stampFrozen(h => planContent + '<!-- plan_hash: ' + h + ' -->');
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
    const frozen = stampFrozen(h => '<!-- plan_hash: ' + h + ' -->\n' + makeUnfrozenPlan('auto-run'));
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
      '## Meta',
      'plan_form: spine', // #765: all-concrete spine — legacy dag grammar retired at freeze
      'plan_schema_version: 2',
      'contract_version: 2',
      // Unified schema-2 (#695): schema-2 gate metadata requires the epoch contract. A docs-only child
      // inherits nothing, so inherited_frontier_classes is 'none' with a 'none' digest — legal under the
      // unified empty-frontier predicate (inheritedFrontierDigestValid).
      'epoch_schema_version: 2',
      'plan_epoch: 2',
      'epoch_lineage_id: ' + '1'.repeat(64),
      'parent_plan_hash: ' + '2'.repeat(64),
      'parent_snapshot_manifest_digest: pending',
      'claim_root_base_digest: ' + '3'.repeat(64),
      'source_evidence_digest: ' + '5'.repeat(64),
      'transition_reason: review_repair_requires_replan',
      'planner_binding: dispatch-641',
      'labels: area:scripts',
      'sink: CHANGELOG.md',
      'code_certifier: none',
      'security_certifier: none',
      'inherited_frontier_digest: none',
      'inherited_frontier_classes: none', '',
      '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape | observes | gate_claim | gate_surface | gate_aggregation | certifies |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      '| seed     | code-explorer | —      | —              | 1 | sequence | — | — | — | — | — |',
      '| gate     | ' + gateRole + ' | seed | —            | 1 | sequence | ' + observesValue + ' | inspect-observation | scratch | sequence | — |',
      '| w        | doc-updater   | seed   | docs/decisions/D-641-01.md | 1 | sequence | — | — | — | — | — |',
      '| finalize | finalize      | gate,w | —              | 1 | sequence | — | — | — | — | — |', '',
      '## Design', '',
      'Decompose: seed explores; gate observes scratch; w writes the decision doc (disjoint from gate); finalize sinks. Sequence edges are gate/data dependencies (S1). Done: decision doc landed and gate clears.', '',
      '## Node Ledger', '',
      '| id | status |', '| --- | --- |',
      '| seed | pending |', '| gate | pending |', '| w | pending |', '| finalize | pending |', '',
      '## Required Agent Compliance', '',
      '| Requirement | Status | Evidence | Skip Reason |',
      '| --- | --- | --- | --- |',
      '| code-explorer (seed) | pending | | |',
      '| ' + gateRole + ' (gate) | pending | | |',
      '| doc-updater (w) | pending | | |',
      '| finalize (finalize) | pending | | |', '',
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

// #695 unified empty-frontier predicate — the four-combo contract shared by validateEpochContract and
// validateSchema2ReviewPlan: non-empty classes ⇒ hex64 digest; empty classes ⇒ 'none' OR hex64; anything
// else refuses. Pins that a legitimately-authored fresh docs-only child ('none'/'none') and a runtime child
// (empty-classes hex64) both freeze, while garbage and a non-empty-classes 'none' both refuse.
{
  const { validatePlan } = require('./kaola-workflow-plan-validator');
  const frontierPlan = (classes, digest) => [
    '# Workflow Plan — test-project', '',
    '## Meta', 'plan_form: spine', 'plan_schema_version: 2', 'contract_version: 2', 'epoch_schema_version: 2', 'plan_epoch: 2',
    'epoch_lineage_id: ' + '1'.repeat(64), 'parent_plan_hash: ' + '2'.repeat(64),
    'parent_snapshot_manifest_digest: pending', 'claim_root_base_digest: ' + '3'.repeat(64),
    'source_evidence_digest: ' + '5'.repeat(64), 'transition_reason: review_repair_requires_replan',
    'planner_binding: dispatch-695', 'labels: area:scripts', 'sink: CHANGELOG.md',
    'code_certifier: none', 'security_certifier: none',
    'inherited_frontier_digest: ' + digest, 'inherited_frontier_classes: ' + classes, '',
    '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape | observes | gate_claim | gate_surface | gate_aggregation | certifies |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    '| seed     | code-explorer | —      | —              | 1 | sequence | — | — | — | — | — |',
    '| gate     | adversarial-verifier | seed | —        | 1 | sequence | scratch | inspect-observation | scratch | sequence | — |',
    '| w        | doc-updater   | seed   | docs/decisions/D-641-01.md | 1 | sequence | — | — | — | — | — |',
    '| finalize | finalize      | gate,w | —              | 1 | sequence | — | — | — | — | — |', '',
    '## Design', '',
    'Decompose: seed explores; gate (adversarial-verifier) and w (doc-updater) are disjoint frontier legs — gate observes scratch, w writes docs — co-opened; finalize sinks. Sequence edges are gate/data dependencies (S1). Done: docs landed and gate clears.', '',
    '## Node Ledger', '', '| id | status |', '| --- | --- |',
    '| seed | pending |', '| gate | pending |', '| w | pending |', '| finalize | pending |', '',
    '## Required Agent Compliance', '', '| Requirement | Status | Evidence | Skip Reason |', '| --- | --- | --- | --- |',
    '| code-explorer (seed) | pending | | |', '| adversarial-verifier (gate) | pending | | |',
    '| doc-updater (w) | pending | | |', '| finalize (finalize) | pending | | |', '',
  ].join('\n') + '\n';
  const verdict = (classes, digest) => validatePlan(frontierPlan(classes, digest), { root: path.resolve(__dirname, '..') });
  assert(verdict('none', 'none').result !== 'refuse',
    '#695-frontier: empty classes + none digest is in-grammar');
  assert(verdict('none', '4'.repeat(64)).result !== 'refuse',
    '#695-frontier: empty classes + hex64 digest is in-grammar');
  const garbage = verdict('none', 'not-a-real-digest');
  assert(garbage.result === 'refuse' && (garbage.errors || []).some(e => /inherited_frontier/.test(e)),
    '#695-frontier: empty classes + garbage digest refuses, got ' + JSON.stringify(garbage.errors));
  const nonEmptyNone = verdict('code', 'none');
  assert(nonEmptyNone.result === 'refuse' && (nonEmptyNone.errors || []).some(e => /inherited_frontier/.test(e)),
    '#695-frontier: non-empty classes + none digest refuses, got ' + JSON.stringify(nonEmptyNone.errors));
}

// ---------------------------------------------------------------------------
// #830 freeze-time dischargeability walls — the handoff surface. Three checks bind at freeze:
// `writeset_foreign_archive` + `child_frontier_unclosable` (refusals) and `frontier_without_writer`
// (a NAMED advisory, never a gate). The validator-side contracts (typed reasons, operator hints,
// precedence, fail-closed project, negative space) live in test-plan-validator.js; here we pin:
//   (ordering)   the child_frontier_unclosable refusal discharges at the END of the freeze wall —
//                the G4 `/inherited_frontier/` expectation above keeps naming the grammar error;
//   (ready)      the advisory passes through a ready_to_run emission (stub seam + REAL validator);
//   (child)      the advisory passes through a replan child_frozen emission (stub + REAL freeze);
//   (refuse-e2e) a foreign-archive declared write set surfaces as plan_invalid through the REAL
//                validator subprocess, with --freeze never shelled.
// ---------------------------------------------------------------------------

// (ordering) — the #695 frontierPlan shape IS the load-bearing case: classes 'code' + digest 'none'
// + no validation policy satisfies the unclosable condition AND carries an accumulated grammar
// error. The grammar error must surface FIRST — a verdict reason of child_frontier_unclosable here
// means the wall moved ahead of the grammar errors and the G4 fixture above goes red.
{
  const { validatePlan } = require('./kaola-workflow-plan-validator');
  const orderingPlan = [
    '# Workflow Plan — test-project', '',
    '## Meta', 'plan_form: spine', 'plan_schema_version: 2', 'contract_version: 2', 'epoch_schema_version: 2', 'plan_epoch: 2',
    'epoch_lineage_id: ' + '1'.repeat(64), 'parent_plan_hash: ' + '2'.repeat(64),
    'parent_snapshot_manifest_digest: pending', 'claim_root_base_digest: ' + '3'.repeat(64),
    'source_evidence_digest: ' + '5'.repeat(64), 'transition_reason: review_repair_requires_replan',
    'planner_binding: dispatch-830', 'labels: area:scripts', 'sink: CHANGELOG.md',
    'code_certifier: none', 'security_certifier: none',
    'inherited_frontier_digest: none', 'inherited_frontier_classes: code', '',
    '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape | observes | gate_claim | gate_surface | gate_aggregation | certifies |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    '| seed     | code-explorer | —      | —              | 1 | sequence | — | — | — | — | — |',
    '| gate     | adversarial-verifier | seed | —        | 1 | sequence | scratch | inspect-observation | scratch | sequence | — |',
    '| w        | doc-updater   | seed   | docs/decisions/D-830-01.md | 1 | sequence | — | — | — | — | — |',
    '| finalize | finalize      | gate,w | —              | 1 | sequence | — | — | — | — | — |', '',
    '## Design', '',
    'Decompose: seed explores; gate and w are disjoint frontier legs; finalize sinks. Sequence edges are gate/data dependencies (S1). Done: docs landed and gate clears.', '',
    '## Node Ledger', '', '| id | status |', '| --- | --- |',
    '| seed | pending |', '| gate | pending |', '| w | pending |', '| finalize | pending |', '',
    '## Required Agent Compliance', '', '| Requirement | Status | Evidence | Skip Reason |', '| --- | --- | --- | --- |',
    '| code-explorer (seed) | pending | | |', '| adversarial-verifier (gate) | pending | | |',
    '| doc-updater (w) | pending | | |', '| finalize (finalize) | pending | | |', '',
  ].join('\n') + '\n';
  const v = validatePlan(orderingPlan, { root: path.resolve(__dirname, '..') });
  assert(v.result === 'refuse' && v.reason !== 'child_frontier_unclosable'
    && (v.errors || []).some(e => /inherited_frontier/.test(e)),
    '#830-ordering: a grammar-broken child surfaces the /inherited_frontier/ grammar error FIRST — the unclosable wall discharges at the END of the freeze wall, got '
    + JSON.stringify({ result: v.result, reason: v.reason, errors: v.errors }));
}

// Shared #830 fixture: a certification-only review_repair child — non-empty inherited frontier
// (classes code + hex64 digest), named code certifier, declared validation policy, ZERO writer
// nodes. In-grammar, carrying the frontier_without_writer advisory. Used by the child emissions
// (stub + real freeze) and the ready_to_run e2e below.
function makeFrontierWithoutWriterChild() {
  return [
    '# Workflow Plan — test-project', '',
    '## Meta', 'plan_form: spine', 'plan_schema_version: 2', 'contract_version: 2', 'epoch_schema_version: 2', 'plan_epoch: 2',
    'epoch_lineage_id: ' + '3'.repeat(64), 'parent_plan_hash: ' + '4'.repeat(64),
    'parent_snapshot_manifest_digest: pending', 'claim_root_base_digest: ' + '5'.repeat(64),
    'source_evidence_digest: ' + '7'.repeat(64), 'transition_reason: review_repair_requires_replan',
    'planner_binding: dispatch-830', 'labels: area:scripts', 'sink: CHANGELOG.md',
    'code_certifier: child-review', 'security_certifier: none',
    'inherited_frontier_digest: ' + '6'.repeat(64), 'inherited_frontier_classes: code',
    'validation_command: node scripts/test-plan-validator.js', 'validation_timeout_minutes: 30', '',
    '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape | observes | gate_claim | gate_surface | gate_aggregation | certifies |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    '| seed | code-explorer | — | — | 1 | sequence | — | — | — | — | — |',
    '| child-review | code-reviewer | seed | — | 1 | sequence | — | current code candidate is approved | full code candidate | sequence | — |',
    '| finalize | finalize | child-review | — | 1 | sequence | — | — | — | — | — |', '',
    '## Design', '',
    'Decompose: certification-only child epoch over the inherited frontier; sequence edges are gate/data dependencies (S1). Done: the named certifier clears the frontier.', '',
    '## Node Ledger', '', '| id | status |', '| --- | --- |',
    '| seed | pending |', '| child-review | pending |', '| finalize | pending |', '',
    '## Required Agent Compliance', '', '| Requirement | Status | Evidence | Skip Reason |', '| --- | --- | --- | --- |',
    '| code-explorer (seed) | pending | | |', '| code-reviewer (child-review) | pending | | |', '| finalize (finalize) | pending | | |', '',
  ].join('\n') + '\n';
}
const FWW_WARNING = {
  warning: 'frontier_without_writer',
  detail: 'this review_repair child epoch inherits a non-empty findings frontier but declares zero writer nodes'
    + ' — a new finding surfaced by its gate has no possible owner (legal for a certification-only epoch; confirm the shape)',
};

// (ready, stub seam) — a --freeze-checked verdict carrying warnings passes them through to the
// ready_to_run emission; the advisory is audit-only (handoff_status and decision are unmoved), and
// a verdict WITHOUT warnings emits no warnings key at all.
{
  const planContent = makeUnfrozenPlan('auto-run');
  const frozenPlanContent = stampFrozen(h => planContent + '<!-- plan_hash: ' + h + ' -->');
  const runWithWarnings = (warnings) => {
    let readCallCount = 0;
    return runHandoff({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project', json: true,
    shell: makeShellStub({
      'kaola-workflow-plan-validator.js:--freeze-checked': {
        exitCode: 0, result: 'in-grammar', decision: 'auto-run',
        planHash: PLAN_HASH_64, frozen: false, governance: { decision: 'auto-run', risk: {} },
        risk: { sensitivity: false, blastRadius: false, uncertain: false, reasons: [] },
        ...(warnings ? { warnings } : {}),
      },
      'kaola-workflow-plan-validator.js:--freeze': {
        exitCode: 0, result: 'in-grammar', decision: 'auto-run',
        planHash: PLAN_HASH_64, frozen: true, resumeOk: true,
        risk: { sensitivity: false, blastRadius: false, uncertain: false, reasons: [] },
        ...(warnings ? { warnings } : {}),
      },
      'kaola-workflow-roadmap.js:init-issue': { exitCode: 0, created: true },
      'git:add': { exitCode: 0 },
      'kaola-workflow-adaptive-node.js': { exitCode: 0, status: 'mirrored', planHash: PLAN_HASH_64, dest: '/wt/kaola-workflow/test-project' },
    }),
    computeNextAction: require('./kaola-workflow-next-action').computeNextAction,
    resolveModel: () => 'sonnet',
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) { readCallCount++; return readCallCount <= 1 ? planContent : frozenPlanContent; }
      if (fpath.endsWith('workflow-state.md')) return makeStateContent({ issueNumber: 830 });
      return '';
    },
    writeFile: () => {},
    stateMtime: undefined,
  });
  };

  const flagged = runWithWarnings([FWW_WARNING]);
  assert(flagged.handoff_status === 'ready_to_run' && flagged.decision === 'auto-run',
    '#830-ready: a warning-bearing freeze verdict still emits ready_to_run (the advisory never gates), got '
    + JSON.stringify({ handoff_status: flagged.handoff_status, decision: flagged.decision }));
  assert(Array.isArray(flagged.warnings) && flagged.warnings.length === 1
    && flagged.warnings[0].warning === 'frontier_without_writer'
    && flagged.warnings[0].detail === FWW_WARNING.detail,
    '#830-ready: the named frontier_without_writer advisory passes through the ready_to_run emission verbatim, got '
    + JSON.stringify(flagged.warnings));

  const clean = runWithWarnings(null);
  assert(clean.handoff_status === 'ready_to_run' && !('warnings' in clean),
    '#830-ready: a warning-free freeze verdict emits NO warnings key (absent, never empty), got '
    + JSON.stringify({ handoff_status: clean.handoff_status, warnings: clean.warnings }));
}

// (child, stub seam) — a replan child freeze returning warnings passes them through to the
// child_frozen emission; the transaction binding is unmoved.
{
  const child = makeFrontierWithoutWriterChild();
  let writes = 0;
  const result = runReplanHandoff({
    childPath: '/fake/kaola-workflow/test-project/workflow-plan.next.md',
    childContent: child,
    transactionId: '8'.repeat(64),
    authority: {
      verified: true, candidate_match: true, claim_root_match: true, inherited_frontier_match: true,
      transaction_id: '8'.repeat(64),
      child_path: '/fake/kaola-workflow/test-project/workflow-plan.next.md',
      child_digest: require('crypto').createHash('sha256').update(child).digest('hex'),
      dispatch_nonce: 'dispatch-830',
      planner_attestation_digest: '9'.repeat(64),
    },
    expected: {
      epoch_lineage_id: '3'.repeat(64), plan_epoch: 2,
      child_path: '/fake/kaola-workflow/test-project/workflow-plan.next.md',
      parent_plan_hash: '4'.repeat(64), claim_root_base_digest: '5'.repeat(64),
      inherited_frontier_digest: '6'.repeat(64), planner_binding: 'dispatch-830',
    },
    freezePlan: content => ({ result: 'in-grammar', frozen: true,
      planHash: 'a'.repeat(64), content: '<!-- plan_hash: ' + 'a'.repeat(64) + ' -->\n' + content,
      warnings: [FWW_WARNING] }),
    writeFile: () => { writes++; },
  });
  assert(result.result === 'child_frozen' && result.phase === 'child_frozen'
    && result.transaction_id === '8'.repeat(64) && result.child_plan_hash === 'a'.repeat(64),
    '#830-child: a warning-bearing child freeze still emits child_frozen with the binding intact, got '
    + JSON.stringify({ result: result.result, phase: result.phase, reason: result.reason }));
  assert(Array.isArray(result.warnings) && result.warnings.length === 1
    && result.warnings[0].warning === 'frontier_without_writer'
    && result.warnings[0].detail === FWW_WARNING.detail,
    '#830-child: the named advisory passes through the child_frozen emission verbatim, got ' + JSON.stringify(result.warnings));
  assert(writes === 1, '#830-child: the advisory never blocks the single child-file freeze write');
}

// (child, REAL freeze) — the same emission driven through the REAL validator freezePlan (the
// default seam): the genuine certification-only child freezes in-grammar and the computed advisory
// rides child_frozen. This pins the whole wire — validatePlan computes the warning, freezePlan
// spreads it, the handoff passes it through.
{
  const child = makeFrontierWithoutWriterChild();
  const result = runReplanHandoff({
    childPath: '/fake/kaola-workflow/test-project/workflow-plan.next.md',
    childContent: child,
    transactionId: '8'.repeat(64),
    authority: {
      verified: true, candidate_match: true, claim_root_match: true, inherited_frontier_match: true,
      transaction_id: '8'.repeat(64),
      child_path: '/fake/kaola-workflow/test-project/workflow-plan.next.md',
      child_digest: require('crypto').createHash('sha256').update(child).digest('hex'),
      dispatch_nonce: 'dispatch-830',
      planner_attestation_digest: '9'.repeat(64),
    },
    expected: {
      epoch_lineage_id: '3'.repeat(64), plan_epoch: 2,
      child_path: '/fake/kaola-workflow/test-project/workflow-plan.next.md',
      parent_plan_hash: '4'.repeat(64), claim_root_base_digest: '5'.repeat(64),
      inherited_frontier_digest: '6'.repeat(64), planner_binding: 'dispatch-830',
    },
    validatorOptions: { root: path.resolve(__dirname, '..'), project: 'test-project' },
    writeFile: () => {},
  });
  assert(result.result === 'child_frozen',
    '#830-child-e2e: the REAL freezePlan freezes the certification-only child (advisory, never a refusal), got '
    + JSON.stringify({ result: result.result, reason: result.reason, errors: result.errors }));
  assert(Array.isArray(result.warnings) && result.warnings.length === 1
    && result.warnings[0].warning === 'frontier_without_writer'
    && /zero writer nodes/.test(result.warnings[0].detail),
    '#830-child-e2e: the REAL computed frontier_without_writer advisory rides the child_frozen emission, got '
    + JSON.stringify(result.warnings));
}

// (refuse-e2e) — the writeset_foreign_archive refusal surfaces through the normal handoff as
// plan_invalid, end-to-end through the REAL validator subprocess, with --freeze NEVER shelled
// (no mutation on refusal). The planner's bounded repair loop absorbs it like any plan_invalid.
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw830-wsa-h-'));
  try {
    const proj = path.join(tmpDir, 'kaola-workflow', 'test-project');
    fs.mkdirSync(proj, { recursive: true });
    const planPath = path.join(proj, 'workflow-plan.md');
    const statePath = path.join(proj, 'workflow-state.md');
    const planContent = [
      '# Workflow Plan — test-project', '',
      '## Meta', 'plan_schema_version: 2', 'plan_form: spine', 'labels: enhancement',
      'code_certifier: none', 'security_certifier: none',
      'inherited_frontier_digest: none', 'inherited_frontier_classes: none', '',
      '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape |',
      '| --- | --- | --- | --- | --- | --- |',
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| w | doc-updater | explore | kaola-workflow/archive/other-project/evidence.md | 1 | sequence |',
      '| done | finalize | w | CHANGELOG.md | 1 | sequence |', '',
      '## Design', '',
      'Decompose: explore probes, w lands the doc, done sinks. sequence edges: S1 data dependencies. Done: the doc and CHANGELOG land.', '',
      '## Node Ledger', '', '| id | status |', '| --- | --- |',
      '| explore | pending |', '| w | pending |', '| done | pending |', '',
    ].join('\n') + '\n';
    fs.writeFileSync(planPath, planContent);
    fs.writeFileSync(statePath, makeStateContent({ issueNumber: 830 }));
    let freezeShelled = false;
    const result = runHandoff({
      planPath, statePath, project: 'test-project', json: true,
      // Delegate ONLY the validator to the real subprocess; stub everything else so the refuse-path
      // test never shells the real roadmap/git (hermetic, no live-mirror pollution).
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
      '#830-refuse-e2e: a declared foreign-archive write set surfaces as plan_invalid, got ' + JSON.stringify(result.handoff_status));
    assert(Array.isArray(result.errors) && result.errors.some(e => /foreign project/.test(e)
      && /kaola-workflow\/archive\/other-project\/evidence\.md/.test(e) && /finalization/.test(e)),
      '#830-refuse-e2e: the typed writeset_foreign_archive text (token + legal homes) reaches the handoff packet, got '
      + JSON.stringify(result.errors));
    assert(freezeShelled === false, '#830-refuse-e2e: --freeze NEVER shelled on the refusal (no mutation)');
  } finally { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} }
}

// (ready-e2e) — the advisory crosses the WHOLE normal-handoff wire: REAL validator --freeze-checked
// computes frontier_without_writer, REAL --freeze --governance-ack freezes the child, and the
// ready_to_run emission carries the named warning. Hermetic: only the validator is real.
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw830-fww-h-'));
  try {
    const proj = path.join(tmpDir, 'kaola-workflow', 'test-project');
    fs.mkdirSync(proj, { recursive: true });
    const planPath = path.join(proj, 'workflow-plan.md');
    const statePath = path.join(proj, 'workflow-state.md');
    fs.writeFileSync(planPath, makeFrontierWithoutWriterChild());
    fs.writeFileSync(statePath, makeStateContent({ issueNumber: 830 }));
    const result = runHandoff({
      planPath, statePath, project: 'test-project', json: true,
      shell: (scriptPath, args) => {
        const a = args || [];
        if (path.basename(scriptPath) === 'kaola-workflow-plan-validator.js') return shellHandoff(scriptPath, a);
        return { exitCode: 0, created: true, status: 'mirrored' };
      },
      computeNextAction: require('./kaola-workflow-next-action').computeNextAction,
      resolveModel: () => 'sonnet',
      readFile: (fpath) => fs.readFileSync(fpath, 'utf8'),
      writeFile: (fpath, content) => fs.writeFileSync(fpath, content),
      stateMtime: undefined,
    });
    assert(result.handoff_status === 'ready_to_run',
      '#830-ready-e2e: the certification-only child FREEZES through the real handoff (advisory, never a refusal), got '
      + JSON.stringify({ handoff_status: result.handoff_status, errors: result.errors }));
    assert(Array.isArray(result.warnings) && result.warnings.length === 1
      && result.warnings[0].warning === 'frontier_without_writer'
      && /zero writer nodes/.test(result.warnings[0].detail),
      '#830-ready-e2e: the REAL computed advisory rides the ready_to_run emission, got ' + JSON.stringify(result.warnings));
  } finally { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} }
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
      '## Meta',
      'plan_form: spine', // #765: all-concrete spine — legacy dag grammar retired at freeze
      'plan_schema_version: 2',
      'labels: area:scripts',
      'code_certifier: none',
      'security_certifier: none',
      'inherited_frontier_digest: none',
      'inherited_frontier_classes: none', '',
      '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape |',
      '| --- | --- | --- | --- | --- | --- |',
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| finalize | finalize | explore | CHANGELOG.md | 1 | sequence |', '',
      '## Design', '',
      'Decompose: explore probes, finalize sinks. sequence explore→finalize: S1 — finalize consumes explore\'s findings. Done: CHANGELOG updated.', '',
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

  // (a-dup) TWO briefs for the SAME node id → REFUSE brief_duplicate_node. Without the wall the second
  //     block silently wins/loses by parse order — ambiguous goal_line dispatch. Same freeze contract
  //     the handoff surfaces verbatim (a refuse here IS the plan_invalid the handoff returns — see the
  //     unknown-node e2e above; both walls ride the same emit path).
  {
    const dupBriefs = [
      '## Node Briefs', '',
      '### explore', 'First brief for explore.', '',
      '### finalize', 'Close the loop.', '',
      '### explore', 'SECOND brief for explore — which one is the goal_line?',
    ].join('\n');
    const { verdict, tmpDir } = freezeVerdict(briefsPlan(dupBriefs));
    assert(verdict.result === 'refuse' && verdict.reason === 'brief_duplicate_node',
      'briefs-dup: a repeated ### <node-id> in ## Node Briefs refuses brief_duplicate_node, got ' + JSON.stringify({ result: verdict.result, reason: verdict.reason }));
    assert(Array.isArray(verdict.errors) && verdict.errors.some(e => /explore/.test(e)),
      'briefs-dup: the duplicated node id is named in the errors, got ' + JSON.stringify(verdict.errors));
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

  // (c) BACK-COMPAT + parser: a briefless plan carries NO briefs segment in its hash (the ## Node
  //     Briefs channel contributes nothing when absent). The fixture carries a ## Design section
  //     (#790 freeze requirement), which is hash-covered by the SAME conditional-append pattern, so the
  //     no-briefs formula is Meta + Nodes + Design. parseNodeBriefs returns one trimmed entry per ###
  //     sub-block. typeof-guarded so a missing export produces a clean assertion FAIL (RED).
  {
    const classifier = require('./kaola-workflow-classifier');
    const crypto = require('crypto');
    const noBriefsHash = (content) => {
      const norm = section => classifier.sectionBody(content, section).split('\n').map(l => l.trim()).filter(Boolean).join('\n');
      let body = norm('Meta') + '\n---NODES---\n' + norm('Nodes');
      // The ## Design section is hash-covered by the same conditional-append pattern as ## Node Briefs.
      const design = classifier.sectionBodyState(content, 'Design');
      if (design.status === 'present') body += '\n---DESIGN---\n' + design.body.split('\n').map(l => l.trim()).filter(Boolean).join('\n');
      return crypto.createHash('sha256').update(body).digest('hex');
    };
    const briefless = briefsPlan(null);
    assert(typeof nodeBriefsPresent === 'function' && nodeBriefsPresent(briefless) === false,
      'briefs-backcompat: a briefless plan reports nodeBriefsPresent===false');
    assert(computePlanHash(briefless) === noBriefsHash(briefless),
      'briefs-backcompat: a briefless plan carries NO briefs segment in its hash (Meta + Nodes + Design)');
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

// ---------------------------------------------------------------------------
// #699 — a normal adaptive handoff is never a second authority while a
// claim-preserving re-plan transaction is fenced. The guard must run before
// validator/freeze/task-mirror/roadmap/state writes and return the one legal
// mutation with exact transaction orientation.
// ---------------------------------------------------------------------------
{
  const planContent = makeUnfrozenPlan('auto-run');
  const stateContent = makeStateContent({ issueNumber: 699 });
  let shellCalls = 0;
  let writes = 0;
  const result = runHandoff({
    planPath: '/fake/kaola-workflow/issue-699/workflow-plan.md',
    statePath: '/fake/kaola-workflow/issue-699/workflow-state.md',
    project: 'issue-699',
    json: true,
    replanFence: {
      ok: true,
      fenced: true,
      reason: 'replan_in_progress',
      phase: 'planner_pending',
      transaction_id: '1'.repeat(64),
      legal_mutation: 'replan resume',
      transaction: {
        parent: { plan_hash: '2'.repeat(64) },
        child: { plan_hash: null },
        cas: { prepare: { seam: 'prepare', result: 'match' } },
      },
    },
    shell: () => { shellCalls++; return { exitCode: 0, result: 'in-grammar', frozen: true, resumeOk: true }; },
    computeNextAction: require('./kaola-workflow-next-action').computeNextAction,
    resolveModel: () => 'sonnet',
    readFile: fpath => fpath.endsWith('workflow-state.md') ? stateContent : planContent,
    writeFile: () => { writes++; },
  });
  assert(result.handoff_status === 'replan_in_progress' && result.result === 'refuse'
    && result.reason === 'replan_in_progress',
  '#699 handoff fence: normal handoff refuses the active re-plan transaction');
  assert(result.replan_phase === 'planner_pending'
    && result.transaction_id === '1'.repeat(64)
    && result.parent_plan_hash === '2'.repeat(64)
    && result.child_plan_hash === 'none'
    && result.last_cas_seam === 'prepare'
    && result.last_cas_result === 'match',
  '#699 handoff fence: refusal reports exact phase/hash/CAS orientation, got ' + JSON.stringify(result));
  assert(result.resume_command === 'node scripts/kaola-workflow-replan.js resume --project issue-699 --json'
    && result.legal_mutation === 'replan resume',
  '#699 handoff fence: the sole legal mutation is the exact local resume command');
  assert(shellCalls === 0 && writes === 0,
  '#699 handoff fence: refusal occurs before validator/freeze/task-mirror/roadmap/state mutation');
}

// The child helper is deliberately narrower than the transaction engine: n2 remains
// the sole CAS/attestation authority and passes a verified authority receipt. n4 owns
// only schema-2 validation plus the one child-file freeze write.
{
  const child = makeUnfrozenPlan('auto-run').replace('labels: area:scripts', [
    'labels: area:scripts',
    'contract_version: 2',
    'epoch_schema_version: 2',
    'epoch_lineage_id: ' + '3'.repeat(64),
    'plan_epoch: 2',
    'parent_plan_hash: ' + '4'.repeat(64),
    'parent_snapshot_manifest_digest: pending',
    'claim_root_base_digest: ' + '5'.repeat(64),
    'inherited_frontier_digest: ' + '6'.repeat(64),
    'inherited_frontier_classes: none',
    'transition_reason: repair_requires_replan',
    'source_evidence_digest: ' + '7'.repeat(64),
    'planner_binding: dispatch-699',
    'code_certifier: none',
    'security_certifier: none',
  ].join('\n'));
  let writes = 0;
  const result = runReplanHandoff({
    childPath: '/fake/kaola-workflow/issue-699/workflow-plan.next.md',
    childContent: child,
    transactionId: '8'.repeat(64),
    authority: {
      verified: true,
      candidate_match: true,
      claim_root_match: true,
      inherited_frontier_match: true,
      transaction_id: '8'.repeat(64),
      child_path: '/fake/kaola-workflow/issue-699/workflow-plan.next.md',
      child_digest: require('crypto').createHash('sha256').update(child).digest('hex'),
      dispatch_nonce: 'dispatch-699',
      planner_attestation_digest: '9'.repeat(64),
    },
    expected: {
      epoch_lineage_id: '3'.repeat(64), plan_epoch: 2,
      child_path: '/fake/kaola-workflow/issue-699/workflow-plan.next.md',
      parent_plan_hash: '4'.repeat(64), claim_root_base_digest: '5'.repeat(64),
      inherited_frontier_digest: '6'.repeat(64), planner_binding: 'dispatch-699',
    },
    freezePlan: content => ({ result: 'in-grammar', frozen: true,
      planHash: 'a'.repeat(64), content: '<!-- plan_hash: ' + 'a'.repeat(64) + ' -->\n' + content }),
    writeFile: (fpath, content) => { writes++; assert(fpath.endsWith('workflow-plan.next.md') && content.includes('plan_hash'),
      '#699 child handoff: only the exact next-plan path is frozen'); },
  });
  assert(result.result === 'child_frozen' && result.phase === 'child_frozen'
    && result.transaction_id === '8'.repeat(64) && result.child_plan_hash === 'a'.repeat(64)
    && result.planner_attestation_digest === '9'.repeat(64),
  '#699 child handoff: pure helper returns the frozen child/transaction/attestation binding, got ' + JSON.stringify(result));
  assert(result.first_node_id === 'explore' && result.first_node_role === 'code-explorer',
  '#699 child handoff: publication reports the actual first node parsed from the frozen child, never a stale parent tuple; got '
    + JSON.stringify({ first_node_id: result.first_node_id, first_node_role: result.first_node_role }));
  assert(writes === 1, '#699 child handoff: the helper performs exactly one child-file write');

  let substitutedWrites = 0;
  const substituted = runReplanHandoff({
    childPath: '/tmp/attacker/workflow-plan.next.md', childContent: child,
    transactionId: '8'.repeat(64),
    authority: {
      verified: true, candidate_match: true, claim_root_match: true, inherited_frontier_match: true,
      transaction_id: '8'.repeat(64), child_path: '/fake/kaola-workflow/issue-699/workflow-plan.next.md',
      child_digest: require('crypto').createHash('sha256').update(child).digest('hex'),
      dispatch_nonce: 'dispatch-699', planner_attestation_digest: '9'.repeat(64),
    },
    expected: {
      child_path: '/fake/kaola-workflow/issue-699/workflow-plan.next.md',
      epoch_lineage_id: '3'.repeat(64), plan_epoch: 2, parent_plan_hash: '4'.repeat(64),
      claim_root_base_digest: '5'.repeat(64), inherited_frontier_digest: '6'.repeat(64),
      planner_binding: 'dispatch-699',
    },
    freezePlan: content => ({ result: 'in-grammar', frozen: true,
      planHash: 'a'.repeat(64), content: '<!-- plan_hash: ' + 'a'.repeat(64) + ' -->\n' + content }),
    writeFile: () => { substitutedWrites++; },
  });
  assert(substituted.result === 'refuse' && substituted.reason === 'replan_child_path_invalid'
    && substitutedWrites === 0,
  '#699 child handoff: basename-only path substitution refuses before freeze/write');
}

// #699 epoch-1 activation seam: the initial handoff must publish the frozen
// plan hash in the Epoch Lineage block and replace the complete Planning
// Evidence tuple in the same state write. A stale parent first-node tuple must
// not survive a normally handed-off first plan.
{
  const HASH = 'd'.repeat(64);
  const planContent = makeFrozenInProgressPlan();
  const statePath = '/fake/kaola-workflow/test-project/workflow-state.md';
  const stateContent = makeStateContent({ issueNumber: 699, hasPlanningEvidence: true })
    .replace('plan_hash: oldHashValue', 'plan_hash: none')
    .replace('decision: auto-run', 'decision: none\nfirst_node_id: stale-parent\nfirst_node_role: planner')
    + [
      '', '## Epoch Lineage', 'epoch_schema_version: 2',
      'claim_identity_digest: ' + '1'.repeat(64),
      'claim_root_base_digest: ' + '2'.repeat(64),
      'epoch_lineage_id: ' + '3'.repeat(64),
      'plan_epoch: 1', 'active_plan_hash: none',
      'inherited_frontier_digest: none', 'inherited_frontier_classes: none',
      'automatic_review_replans: 0', 'authorized_epoch_ceiling: 2',
      'case_b_exemption_consumed: false', 'replan_status: none',
      'replan_transaction_id: none', 'replan_phase: none',
      'active_snapshot_manifest_digest: none', '',
    ].join('\n');
  let currentState = stateContent;
  let stateWrites = 0;
  const result = runHandoff({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md', statePath,
    project: 'test-project',
    shell: (scriptPath, args) => {
      if (/plan-validator/.test(scriptPath) && args.includes('--freeze-checked')) {
        return { exitCode: 0, result: 'in-grammar', planHash: HASH, decision: 'auto-run',
          risk: { sensitivity: false, blastRadius: false, uncertain: false, reasons: [] } };
      }
      if (/plan-validator/.test(scriptPath) && args.includes('--freeze')) {
        return { exitCode: 0, result: 'in-grammar', planHash: HASH, frozen: true,
          resumeOk: true, decision: 'auto-run', risk: {} };
      }
      return { exitCode: 0, status: 'skipped' };
    },
    computeNextAction: () => ({ result: 'ok', nextNode: {
      id: 'explore', role: 'code-explorer', model: 'standard', declared_write_set: '—',
    } }),
    resolveModel: () => 'standard',
    readFile: fpath => fpath === statePath ? currentState : planContent,
    writeFile: (fpath, content) => {
      if (fpath === statePath) { stateWrites++; currentState = content; }
    },
  });
  assert(result.handoff_status === 'ready_to_run', '#699 initial handoff reaches ready_to_run');
  assert(stateWrites === 1, '#699 initial handoff publishes epoch-plan and Planning Evidence in one state replacement');
  assert(new RegExp('^active_plan_hash: ' + HASH + '$', 'm').test(currentState),
    '#699 initial handoff publishes the frozen plan as active_plan_hash');
  assert(new RegExp('^plan_hash: ' + HASH + '$', 'm').test(currentState)
    && /^first_node_id: explore$/m.test(currentState)
    && /^first_node_role: code-explorer$/m.test(currentState)
    && !/^first_node_id: stale-parent$/m.test(currentState),
  '#699 initial handoff replaces the complete stale Planning Evidence tuple');
}

// #699 committed-child replay: handoff is no longer an activation writer once
// a re-plan transaction has committed. It projects the immutable child's first
// node, not the scheduler's current next node, and performs zero mutation.
{
  const stateContent = makeStateContent({ issueNumber: 699, hasPlanningEvidence: true });
  const committedFence = {
    ok: true, fenced: false, committed: true,
    state: { plan_epoch: '2', active_plan_hash: 'a'.repeat(64) },
    transaction: {
      transaction_id: '8'.repeat(64), phase: 'committed',
      child: { plan_hash: 'a'.repeat(64), decision: 'auto-run',
        first_node_id: 'child-first', first_node_role: 'code-explorer' },
    },
  };
  let shells = 0;
  let writes = 0;
  const replay = runHandoff({
    planPath: '/fake/kaola-workflow/issue-699/workflow-plan.md',
    statePath: '/fake/kaola-workflow/issue-699/workflow-state.md', project: 'issue-699',
    replanFence: committedFence, verifyEpochAuthority: () => ({ ok: true, authority_kind: 'planned' }),
    shell: () => { shells++; return { exitCode: 0 }; },
    computeNextAction: () => ({ result: 'ok', nextNode: { id: 'current-node', role: 'tdd-guide' } }),
    resolveModel: () => 'standard', readFile: () => stateContent,
    writeFile: () => { writes++; },
  });
  assert(replay.handoff_status === 'ready_to_run' && replay.committed_replan === true
    && replay.first_node && replay.first_node.id === 'child-first'
    && replay.first_node.role === 'code-explorer',
  '#699 committed handoff replay publishes the transaction child first node, got ' + JSON.stringify(replay));
  assert(shells === 0 && writes === 0,
    '#699 committed handoff replay performs zero validator/task/roadmap/mirror/state mutation');

  const refused = runHandoff({
    planPath: '/fake/kaola-workflow/issue-699/workflow-plan.md',
    statePath: '/fake/kaola-workflow/issue-699/workflow-state.md', project: 'issue-699',
    replanFence: committedFence,
    verifyEpochAuthority: () => ({ ok: false, result: 'refuse', reason: 'state_planning_evidence_stale_first_node' }),
    shell: () => { shells++; return { exitCode: 0 }; }, computeNextAction: () => ({ result: 'ok' }),
    resolveModel: () => 'standard', readFile: () => stateContent, writeFile: () => { writes++; },
  });
  assert(refused.result === 'refuse' && refused.reason === 'state_planning_evidence_stale_first_node',
    '#699 committed handoff replay fails closed when the E2 current-authority verifier rejects it');
  assert(shells === 0 && writes === 0,
    '#699 rejected committed replay performs zero mutation');
}
// Reviewer contract v2 freeze boundary: the handoff's two-phase transaction must
// consume the validator's explicit version resolver rather than infer a contract.
{
  const validator = require('./kaola-workflow-plan-validator');
  assert(typeof validator.resolvePlanContract === 'function',
    'review-v2 handoff dependency: validator exports resolvePlanContract');
  const draft = makeUnfrozenPlan('auto-run');
  const contract = typeof validator.resolvePlanContract === 'function'
    ? validator.resolvePlanContract(draft, { forFreeze: true }) : null;
  assert(contract && contract.ok === true && contract.plan_schema_version === 2
    && contract.contract_version === 2,
    'review-v2 handoff resolves a newly authored schema-2 plan to dispatch contract 2');
}

// ---------------------------------------------------------------------------
// R3 — G4 common-certifier wall shares the runner's test-consumed-prose classification.
// A downstream doc-updater that mutates test-consumed prose (README.md, or a plan-declared
// validation_test_consumes path) AFTER the designated code certifier is a code-relevant producer:
// G4 must refuse the topology because the certifier does not cover it. An inert doc (docs/decisions/**)
// remains non-code and freezes green. Driven in-process through the real validatePlan.
// ---------------------------------------------------------------------------
{
  const validator = require('./kaola-workflow-plan-validator');
  const g4Plan = (docPath, extraMeta) => [
    '# Workflow Plan — test-project', '',
    '## Meta',
    'plan_form: spine', // #765: all-concrete spine — legacy dag grammar retired at freeze
    'plan_schema_version: 2',
    'labels: area:scripts',
    'code_certifier: reviewer',
    'security_certifier: none',
    'inherited_frontier_digest: none',
    'inherited_frontier_classes: none',
    'validation_command: node --check lib/impl.js',
    'validation_timeout_minutes: 5',
    ...(extraMeta || []), '',
    '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape | gate_claim | gate_surface | gate_aggregation | certifies |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    '| writer   | tdd-guide   | —        | lib/impl.js | 1 | sequence | — | — | — | — |',
    '| reviewer | code-reviewer | writer | —           | 1 | sequence | review-change | code-tree | sequence | — |',
    '| docs     | doc-updater | reviewer | ' + docPath + ' | 1 | sequence | — | — | — | — |',
    '| finalize | finalize    | docs     | —           | 1 | sequence | — | — | — | — |', '',
    '## Node Ledger', '',
    '| id | status |', '| --- | --- |',
    '| writer | pending |', '| reviewer | pending |', '| docs | pending |', '| finalize | pending |', '',
  ].join('\n') + '\n';

  const builtinConsumed = validator.validatePlan(g4Plan('README.md'), { forFreeze: true });
  assert(builtinConsumed.result === 'refuse'
    && Array.isArray(builtinConsumed.errors)
    && builtinConsumed.errors.some(e => /g4_common_certifier_uncovered/.test(e) && /docs/.test(e)),
    'R3 G4: a downstream doc-updater writing built-in test-consumed prose (README.md) refuses uncovered, got '
      + JSON.stringify({ result: builtinConsumed.result, errors: builtinConsumed.errors }));

  const customConsumed = validator.validatePlan(
    g4Plan('notes/custom.md', ['validation_test_consumes: notes/custom.md']), { forFreeze: true });
  assert(customConsumed.result === 'refuse'
    && customConsumed.errors.some(e => /g4_common_certifier_uncovered/.test(e) && /docs/.test(e)),
    'R3 G4: a plan-declared validation_test_consumes prose path is code-relevant and refuses uncovered, got '
      + JSON.stringify({ result: customConsumed.result, errors: customConsumed.errors }));

  const inertDoc = validator.validatePlan(g4Plan('docs/decisions/D-000-01.md'), { forFreeze: true });
  assert(!(inertDoc.errors || []).some(e => /g4_common_certifier_uncovered/.test(e)),
    'R3 G4 green control: an inert doc (docs/decisions/**) is not a code producer and G4 stays covered, got '
      + JSON.stringify({ result: inertDoc.result, errors: inertDoc.errors }));
}

// ---------------------------------------------------------------------------
// R1 — legacy-claim freeze admission. A claim state that carries NO epoch lineage
// envelope (a pre-envelope claim) must not be admitted to a fresh freeze: the
// claim-preserving re-plan path cannot later inherit such a claim, so a plan frozen
// over it is unreplannable. The handoff refuses with the typed reason
// legacy_claim_upgrade_required BEFORE the validator freeze chain — zero validator
// spawn, zero plan/state mutation. Recovery is release + re-claim (claiming writes
// the complete envelope). The envelope-carrying control still reaches ready_to_run.
// ---------------------------------------------------------------------------
{
  const HASH = PLAN_HASH_64;
  const planContent = makeUnfrozenPlan('auto-run');

  const responses = {
    'kaola-workflow-plan-validator.js:--freeze-checked': {
      exitCode: 0, result: 'in-grammar', decision: 'auto-run', planHash: HASH, frozen: false,
      risk: { sensitivity: false, blastRadius: false, uncertain: false, reasons: [] },
      governance: { decision: 'auto-run', risk: {} },
    },
    'kaola-workflow-plan-validator.js:--freeze': {
      exitCode: 0, result: 'in-grammar', decision: 'auto-run', planHash: HASH, frozen: true,
      resumeOk: true, risk: { sensitivity: false, blastRadius: false, uncertain: false, reasons: [] },
    },
    'kaola-workflow-roadmap.js:init-issue': { exitCode: 0, skip: true },
    'git:add': { exitCode: 0 },
    'kaola-workflow-adaptive-node.js': { exitCode: 0, status: 'exists', dest: '/wt/kaola-workflow/test-project' },
  };

  function runOverState(stateContent) {
    const spawned = [];
    const writes = [];
    const baseShell = makeShellStub(responses);
    const result = runHandoff({
      planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
      statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
      project: 'test-project',
      json: true,
      shell: (scriptPath, scriptArgs) => {
        spawned.push(path.basename(scriptPath) + ' ' + (scriptArgs || []).join(' '));
        return baseShell(scriptPath, scriptArgs);
      },
      computeNextAction: require('./kaola-workflow-next-action').computeNextAction,
      resolveModel: () => 'sonnet',
      readFile: (fpath) => {
        if (fpath.endsWith('workflow-plan.md')) return planContent;
        if (fpath.endsWith('workflow-state.md')) return stateContent;
        return '';
      },
      writeFile: (fpath, content) => { writes.push({ path: fpath, content }); },
      stateMtime: undefined,
    });
    return { result, spawned, writes };
  }

  const legacy = runOverState(makeStateContent({ hasEpochEnvelope: false }));
  assert(legacy.result.handoff_status === 'plan_invalid' && legacy.result.result === 'refuse'
    && legacy.result.reason === 'legacy_claim_upgrade_required',
  'R1: envelope-less claim state must refuse with typed reason legacy_claim_upgrade_required, got '
    + JSON.stringify({ handoff_status: legacy.result.handoff_status, result: legacy.result.result,
      reason: legacy.result.reason }));
  assert(Array.isArray(legacy.result.errors)
    && legacy.result.errors.some(e => /release/.test(e) && /claim/.test(e)),
  'R1: refusal must carry an operator hint naming release + re-claim, got '
    + JSON.stringify(legacy.result.errors));
  assert(legacy.writes.length === 0,
    'R1: legacy-claim refusal must not write plan or state, got ' + JSON.stringify(legacy.writes.map(w => w.path)));
  assert(legacy.spawned.length === 0,
    'R1: legacy-claim refusal must precede every shelled spawn (validator/roadmap/mirror), got '
      + JSON.stringify(legacy.spawned));

  const current = runOverState(makeStateContent({}));
  assert(current.result.handoff_status === 'ready_to_run',
    'R1 green control: an envelope-carrying claim state still freezes to ready_to_run, got '
      + JSON.stringify({ handoff_status: current.result.handoff_status, errors: current.result.errors }));
}

// ---------------------------------------------------------------------------
// T-789 (D1+D2 audit surfacing): the validator's --freeze-checked plan_shape + the no-target survey
// selection record are folded into ## Planning Evidence. plan_shape is a compact single line (with the
// D2 evidence_less_sequence_edges count); the four selection_* fields surface only when present.
// A --freeze-checked payload WITHOUT plan_shape (legacy) leaves the record byte-identical (guarded).
// ---------------------------------------------------------------------------
{
  const planContent = makeUnfrozenPlan('auto-run');
  const stateContent = makeStateContent({ issueNumber: 77 });
  const frozenPlanContent = stampFrozen(h => planContent.replace('# Workflow Plan', '<!-- plan_hash: ' + h + ' -->\n\n# Workflow Plan'));
  let writtenState = null;
  let readCount = 0;

  const shellStub = makeShellStub({
    'kaola-workflow-plan-validator.js:--freeze-checked': {
      exitCode: 0, result: 'in-grammar', decision: 'auto-run', planHash: PLAN_HASH_64, frozen: false,
      governance: { decision: 'auto-run', risk: {} },
      risk: { sensitivity: false, blastRadius: false, uncertain: false, reasons: [] },
      plan_shape: { node_count: 4, critical_path_length: 3, parallelism_ratio: 1.333,
        per_depth_widths: [1, 2, 1], antichains: { count: 1, max_width: 2 },
        evidence_less_sequence_edges: [{ from: 'a', to: 'b' }] },
      selection: { bundle: '789', priority_basis: 'is the frontier; guardrails honored',
        rejected: '785 (machine-local)', disjointness: 'disjoint script/agent lanes' },
    },
    'kaola-workflow-plan-validator.js:--freeze': {
      exitCode: 0, result: 'in-grammar', decision: 'auto-run', planHash: PLAN_HASH_64, frozen: true, resumeOk: true,
      risk: { sensitivity: false, blastRadius: false, uncertain: false, reasons: [] },
    },
    'kaola-workflow-roadmap.js:init-issue': { exitCode: 0, created: true },
    'git:add': { exitCode: 0 },
    'kaola-workflow-adaptive-node.js': { exitCode: 0, status: 'mirrored', planHash: PLAN_HASH_64 },
  });

  const result = runHandoff({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project', json: true, shell: shellStub,
    computeNextAction: require('./kaola-workflow-next-action').computeNextAction,
    resolveModel: () => 'sonnet',
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) { readCount++; return readCount <= 1 ? planContent : frozenPlanContent; }
      if (fpath.endsWith('workflow-state.md')) return writtenState || stateContent;
      return '';
    },
    writeFile: (fpath, content) => { if (fpath.endsWith('workflow-state.md')) writtenState = content; },
    stateMtime: undefined,
  });

  assert(result.handoff_status === 'ready_to_run', 'T-789: handoff still reaches ready_to_run with plan_shape/selection');
  assert(writtenState !== null, 'T-789: Planning Evidence state was written');
  assert(/^plan_shape: node_count=4 critical_path_length=3 parallelism_ratio=1\.333 per_depth_widths=1,2,1 antichains=1\/2 evidence_less_sequence_edges=1$/m.test(writtenState || ''),
    'T-789: plan_shape audit line surfaced into Planning Evidence, got:\n' + (writtenState || ''));
  assert(/^selection_bundle: 789$/m.test(writtenState || ''), 'T-789: selection_bundle surfaced');
  assert(/^selection_priority_basis: is the frontier; guardrails honored$/m.test(writtenState || ''), 'T-789: selection_priority_basis surfaced');
  assert(/^selection_rejected: 785 \(machine-local\)$/m.test(writtenState || ''), 'T-789: selection_rejected surfaced');
  assert(/^selection_disjointness: disjoint script\/agent lanes$/m.test(writtenState || ''), 'T-789: selection_disjointness surfaced');

  // Legacy guard: a --freeze-checked payload with NO plan_shape/selection adds no lines.
  let legacyState = null; let lread = 0;
  const legacyStub = makeShellStub({
    'kaola-workflow-plan-validator.js:--freeze-checked': {
      exitCode: 0, result: 'in-grammar', decision: 'auto-run', planHash: PLAN_HASH_64, frozen: false,
      governance: { decision: 'auto-run', risk: {} }, risk: { reasons: [] },
    },
    'kaola-workflow-plan-validator.js:--freeze': {
      exitCode: 0, result: 'in-grammar', decision: 'auto-run', planHash: PLAN_HASH_64, frozen: true, resumeOk: true, risk: { reasons: [] },
    },
    'kaola-workflow-roadmap.js:init-issue': { exitCode: 0, created: true },
    'git:add': { exitCode: 0 },
    'kaola-workflow-adaptive-node.js': { exitCode: 0, status: 'mirrored' },
  });
  runHandoff({
    planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
    statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
    project: 'test-project', json: true, shell: legacyStub,
    computeNextAction: require('./kaola-workflow-next-action').computeNextAction,
    resolveModel: () => 'sonnet',
    readFile: (fpath) => {
      if (fpath.endsWith('workflow-plan.md')) { lread++; return lread <= 1 ? planContent : frozenPlanContent; }
      if (fpath.endsWith('workflow-state.md')) return legacyState || stateContent;
      return '';
    },
    writeFile: (fpath, content) => { if (fpath.endsWith('workflow-state.md')) legacyState = content; },
    stateMtime: undefined,
  });
  assert(legacyState !== null && !/plan_shape:/.test(legacyState) && !/selection_bundle:/.test(legacyState),
    'T-789: a plan_shape-less --freeze-checked payload adds NO audit/selection lines (guarded, byte-compatible)');
}

// ---------------------------------------------------------------------------
// T-815: the `## Acceptance` repair fence. The bounded plan_invalid repair loop may fix
// `## Meta` / `## Nodes` / `## Node Briefs` / ledger scaffolding, but must NOT alter the acceptance
// surface. RED->GREEN pair on ONE anchored project: the acceptance-touching repair is refused; the
// scaffolding-only repair over the SAME anchor proceeds. Real fs + real seams (the fence is inert
// without a cacheExists seam, exactly like the replan fence, so a stub-only test would prove nothing).
// ---------------------------------------------------------------------------
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-accept-fence-'));
  const projectDir = path.join(tmp, 'kaola-workflow', 'issue-815-fence');
  fs.mkdirSync(projectDir, { recursive: true });
  const planPath  = path.join(projectDir, 'workflow-plan.md');
  const statePath = path.join(projectDir, 'workflow-state.md');
  const anchorPath = path.join(projectDir, '.cache', 'acceptance-anchor.json');

  // acceptance / meta / nodes / briefs / ledger are the four repair surfaces the fence discriminates.
  const draft = (acceptance, extraMetaLabel, briefText) => [
    '# Workflow Plan — issue-815-fence', '',
    '## Meta', 'plan_schema_version: 2', 'plan_form: spine', 'labels: ' + extraMetaLabel,
    'code_certifier: none', 'security_certifier: none',
    'inherited_frontier_digest: none', 'inherited_frontier_classes: none', '',
    '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '| --- | --- | --- | --- | --- | --- |',
    '| explore | code-explorer | — | — | 1 | sequence |',
    '| done | finalize | explore | CHANGELOG.md | 1 | sequence |', '',
    '## Node Briefs', '', '### explore', briefText, '', '### done', 'Finalize.', '',
    '## Design', '', 'Decompose: explore then done. sequence explore→done: S1 explore feeds done.', '',
    '## Acceptance', '', acceptance, '',
    '## Node Ledger', '', '| id | status |', '| --- | --- |',
    '| explore | pending |', '| done | pending |', '',
  ].join('\n') + '\n';

  fs.writeFileSync(statePath, ['## Project', 'name: issue-815-fence', 'status: active', '',
    '## Epoch Lineage', 'epoch_schema_version: 2', 'plan_epoch: 1', 'active_plan_hash: none', ''].join('\n'));

  const ORIGINAL_ACCEPTANCE = 'A1: the acceptance surface survives the repair loop untouched.\nA2: a scaffolding-only repair still reaches the validator.';
  // Every attempt refuses at the validator (this IS the repair loop), so the ONLY thing that can
  // change between attempts is WHICH refusal comes back — the fence's, or the grammar's.
  const refusingShell = makeShellStub({
    'kaola-workflow-plan-validator.js:--freeze-checked': { exitCode: 1, result: 'refuse', errors: ['G1: gate missing'] },
  });
  const realSeams = () => ({
    planPath, statePath, project: 'issue-815-fence', json: true, shell: refusingShell,
    computeNextAction: require('./kaola-workflow-next-action').computeNextAction,
    resolveModel: () => 'sonnet',
    readFile: fpath => fs.readFileSync(fpath, 'utf8'),
    cacheExists: fpath => fs.existsSync(fpath),
    writeFile: (fpath, content) => fs.writeFileSync(fpath, content),
    mkdirp: dir => { try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {} },
    stateMtime: undefined,
  });

  try {
    // Attempt 1 — first submission. The acceptance surface is anchored; the refusal is the GRAMMAR's.
    fs.writeFileSync(planPath, draft(ORIGINAL_ACCEPTANCE, 'enhancement', 'Explore the codebase.'));
    const first = runHandoff(realSeams());
    assert(first.handoff_status === 'plan_invalid' && first.reason !== 'acceptance_repair_fenced',
      'T-815: the FIRST submission is never fenced — it refuses on its own grammar error, got ' + JSON.stringify(first.reason || first.errors));
    assert(fs.existsSync(anchorPath), 'T-815: the first submission records the acceptance anchor');
    const anchor = JSON.parse(fs.readFileSync(anchorPath, 'utf8'));
    assert(anchor.acceptance_digest === require('./kaola-workflow-plan-validator')
      .acceptanceDigest(draft(ORIGINAL_ACCEPTANCE, 'enhancement', 'Explore the codebase.')),
      'T-815: the anchor records the submitted acceptance digest');
    assert(anchor.plan_epoch === 1, 'T-815: the anchor is epoch-keyed (a child epoch owns its own surface)');

    // RED — a repair that ALTERS `## Acceptance` is refused with the typed reason, and nothing moves.
    const stateBefore = fs.readFileSync(statePath, 'utf8');
    const tamperedPlan = draft('A1: the acceptance surface survives the repair loop untouched.\nA2: actually, shipping is enough.',
      'enhancement', 'Explore the codebase.');
    fs.writeFileSync(planPath, tamperedPlan);
    const fenced = runHandoff(realSeams());
    assert(fenced.handoff_status === 'plan_invalid' && fenced.reason === 'acceptance_repair_fenced',
      'T-815 RED: a repair that touches ## Acceptance refuses acceptance_repair_fenced, got ' + JSON.stringify(fenced.reason || fenced.errors));
    assert(fenced.anchored_acceptance_digest === anchor.acceptance_digest
      && fenced.submitted_acceptance_digest !== anchor.acceptance_digest,
      'T-815 RED: the refusal names both digests so the operator sees WHAT changed');
    assert(fs.readFileSync(planPath, 'utf8') === tamperedPlan && fs.readFileSync(statePath, 'utf8') === stateBefore,
      'T-815 RED: the fenced refusal mutates neither workflow-plan.md nor workflow-state.md');

    // RED — DROPPING the section entirely is the same violation (removal is a change).
    fs.writeFileSync(planPath, draft(ORIGINAL_ACCEPTANCE, 'enhancement', 'Explore the codebase.')
      .replace(/## Acceptance\n\n[\s\S]*?\n\n## Node Ledger/, '## Node Ledger'));
    assert(runHandoff(realSeams()).reason === 'acceptance_repair_fenced',
      'T-815 RED: DROPPING ## Acceptance during repair is fenced too');

    // GREEN — the same repair loop, same anchor: `## Meta` + `## Nodes`-adjacent briefs + ledger
    // scaffolding all change, `## Acceptance` does not. The fence stands aside and the validator
    // verdict comes back instead.
    fs.writeFileSync(planPath, draft(ORIGINAL_ACCEPTANCE, 'enhancement, area:scripts', 'Explore the codebase and report the seam list.')
      .replace('| explore | pending |', '| explore | pending | '));
    const repaired = runHandoff(realSeams());
    assert(repaired.handoff_status === 'plan_invalid' && repaired.reason !== 'acceptance_repair_fenced',
      'T-815 GREEN: a repair touching ## Meta / briefs / ledger scaffolding is NOT fenced, got ' + JSON.stringify(repaired.reason));
    assert(Array.isArray(repaired.errors) && /G1: gate missing/.test(repaired.errors.join(' ')),
      'T-815 GREEN: the scaffolding repair reaches the validator and returns ITS verdict, got ' + JSON.stringify(repaired.errors));

    // GREEN — pure whitespace churn in the acceptance surface is not a change.
    fs.writeFileSync(planPath, draft('   ' + ORIGINAL_ACCEPTANCE.split('\n').join('\n\n   ') + '   ', 'enhancement', 'Explore the codebase.'));
    assert(runHandoff(realSeams()).reason !== 'acceptance_repair_fenced',
      'T-815 GREEN: whitespace churn in ## Acceptance is not a change (digest is normalized)');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// T-815b: the two transitions that must NOT be fenced, or the loop wedges shut.
// ---------------------------------------------------------------------------
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-accept-fence2-'));
  const projectDir = path.join(tmp, 'kaola-workflow', 'issue-815-wedge');
  fs.mkdirSync(path.join(projectDir, '.cache'), { recursive: true });
  const planPath  = path.join(projectDir, 'workflow-plan.md');
  const statePath = path.join(projectDir, 'workflow-state.md');
  const anchorPath = path.join(projectDir, '.cache', 'acceptance-anchor.json');
  fs.writeFileSync(statePath, ['## Project', 'name: issue-815-wedge', 'status: active', '',
    '## Epoch Lineage', 'epoch_schema_version: 2', 'plan_epoch: 1', 'active_plan_hash: none', ''].join('\n'));

  const body = acceptance => [
    '# Workflow Plan — issue-815-wedge', '',
    '## Meta', 'plan_schema_version: 2', 'plan_form: spine', 'labels: enhancement',
    'code_certifier: none', 'security_certifier: none',
    'inherited_frontier_digest: none', 'inherited_frontier_classes: none', '',
    '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '| --- | --- | --- | --- | --- | --- |',
    '| explore | code-explorer | — | — | 1 | sequence |',
    '| done | finalize | explore | CHANGELOG.md | 1 | sequence |', '',
    '## Design', '', 'Decompose: explore then done. S1: done consumes explore.', '',
  ].concat(acceptance === null ? [] : ['## Acceptance', '', acceptance, ''])
    .concat(['## Node Ledger', '', '| id | status |', '| --- | --- |',
      '| explore | pending |', '| done | pending |', '']).join('\n') + '\n';

  const refusingShell = makeShellStub({
    'kaola-workflow-plan-validator.js:--freeze-checked': { exitCode: 1, result: 'refuse', errors: ['acceptance_missing'] },
  });
  const seams = () => ({
    planPath, statePath, project: 'issue-815-wedge', json: true, shell: refusingShell,
    computeNextAction: require('./kaola-workflow-next-action').computeNextAction,
    resolveModel: () => 'sonnet',
    readFile: fpath => fs.readFileSync(fpath, 'utf8'),
    cacheExists: fpath => fs.existsSync(fpath),
    writeFile: (fpath, content) => fs.writeFileSync(fpath, content),
    mkdirp: dir => { try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {} },
  });

  try {
    // (a) absent -> transcribed. The acceptance_missing refusal's own repair IS authoring the section,
    //     so nothing is anchored while the section is absent and the first transcription is admitted.
    fs.writeFileSync(planPath, body(null));
    const noSection = runHandoff(seams());
    assert(noSection.reason !== 'acceptance_repair_fenced' && !fs.existsSync(anchorPath),
      'T-815b: an ABSENT ## Acceptance anchors nothing — the acceptance_missing repair must be able to author it');
    fs.writeFileSync(planPath, body('A1: the section now exists.'));
    assert(runHandoff(seams()).reason !== 'acceptance_repair_fenced',
      'T-815b: the FIRST transcription is admitted (absent -> present is not a change)');
    assert(fs.existsSync(anchorPath), 'T-815b: ...and it is what gets anchored');

    // (b) a superseded (parent-epoch) anchor is inert. A re-plan child epoch owns its own acceptance
    //     surface — the re-plan transaction enforces preservation on its own seam — so a stale
    //     epoch-1 anchor must never refuse an epoch-2 plan.
    fs.writeFileSync(statePath, fs.readFileSync(statePath, 'utf8').replace('plan_epoch: 1', 'plan_epoch: 2'));
    fs.writeFileSync(planPath, body('A1: the child epoch re-transcribed this under attestation.'));
    assert(runHandoff(seams()).reason !== 'acceptance_repair_fenced',
      'T-815b: an anchor recorded against the PARENT epoch is inert for the child epoch');
    assert(JSON.parse(fs.readFileSync(anchorPath, 'utf8')).plan_epoch === 2,
      'T-815b: ...and the child epoch re-anchors on its own surface');

    // (c) an already-frozen plan with no anchor (frozen before this fence existed) is never anchored.
    fs.rmSync(anchorPath);
    const frozenBody = body('A1: frozen long ago.');
    fs.writeFileSync(planPath, '<!-- plan_hash: ' + 'b'.repeat(64) + ' -->\n\n' + frozenBody);
    runHandoff(seams());
    assert(!fs.existsSync(anchorPath),
      'T-815b: an ALREADY-FROZEN plan is never retroactively anchored — no in-flight wedge');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// T-815c: THE NON-WEDGE PROOF. A fence whose repair instruction cannot be executed is a dead end, not
// a gate: by the time the fence trips, the repairing planner has already overwritten the file that
// held the previous surface, and the next iteration dispatches a FRESH planner with no memory of the
// prior draft. This drives the realistic wedge — iteration 2 re-transcribes the SAME criteria in
// slightly different words — and proves the loop can still get out:
//   (1) the refusal HANDS BACK the anchored surface bytes (a digest cannot be inverted),
//   (2) the refusal does NOT swallow the grammar errors the loop was actually iterating on,
//   (3) restoring the returned bytes VERBATIM reaches the validator and FREEZES (ready_to_run),
//   (4) and the in-epoch consent valve admits a genuine, human-attributed acceptance change instead.
// ---------------------------------------------------------------------------
{
  const validatorMod = require('./kaola-workflow-plan-validator');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-accept-nonwedge-'));
  const projectDir = path.join(tmp, 'kaola-workflow', 'issue-815-nonwedge');
  fs.mkdirSync(projectDir, { recursive: true });
  const planPath  = path.join(projectDir, 'workflow-plan.md');
  const statePath = path.join(projectDir, 'workflow-state.md');
  const anchorPath = path.join(projectDir, '.cache', 'acceptance-anchor.json');

  const draft = (acceptance, gateCol) => [
    '# Workflow Plan — issue-815-nonwedge', '',
    '## Meta', 'plan_schema_version: 2', 'plan_form: spine', 'labels: enhancement',
    'code_certifier: none', 'security_certifier: none',
    'inherited_frontier_digest: none', 'inherited_frontier_classes: none', '',
    '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '| --- | --- | --- | --- | --- | --- |',
    '| explore | code-explorer | — | — | 1 | ' + gateCol + ' |',
    '| done | finalize | explore | CHANGELOG.md | 1 | sequence |', '',
    '## Design', '', 'Decompose: explore then done. sequence explore→done: S1 done consumes explore.', '',
    '## Acceptance', '', acceptance, '',
    '## Node Ledger', '', '| id | status |', '| --- | --- |',
    '| explore | pending |', '| done | pending |', '',
  ].join('\n') + '\n';

  // The surface a HUMAN authored, transcribed at submission 1.
  const ORIGINAL = 'A1: the acceptance surface is restorable from the refusal itself.\n'
    + 'A2: the repair loop reaches the validator once the surface is restored.';
  // Iteration 2's fresh planner: SAME criteria, different words. Not malice — the ordinary case.
  const REWORDED = 'A1: the refusal itself makes the acceptance surface restorable.\n'
    + 'A2: once the surface is restored, the repair loop reaches the validator.';

  fs.writeFileSync(statePath, ['# Kaola-Workflow State', '',
    '## Project', 'name: issue-815-nonwedge', 'status: active', '',
    '## Epoch Lineage', 'epoch_schema_version: 2', 'plan_epoch: 1', 'active_plan_hash: none', '',
    '## Sink', 'issue_number: 815', 'branch: workflow/issue-815-nonwedge', 'sink: merge', ''].join('\n'));

  // The validator refuses on GRAMMAR while `mode` is 'refuse', and freezes once it flips to 'freeze'.
  let mode = 'refuse';
  const FROZEN_HASH = 'c'.repeat(64);
  const flipShell = (scriptPath, scriptArgs) => {
    const base = path.basename(scriptPath);
    const argv = scriptArgs || [];
    if (base === 'kaola-workflow-plan-validator.js' && argv.includes('--freeze-checked')) {
      return mode === 'refuse'
        ? { exitCode: 1, result: 'refuse', reason: 'plan_invalid', errors: ['G7: gate_surface missing on the gate node'] }
        : { exitCode: 0, result: 'in-grammar', decision: 'auto-run', planHash: FROZEN_HASH, frozen: false,
            governance: { decision: 'auto-run', risk: {} }, risk: {} };
    }
    if (base === 'kaola-workflow-plan-validator.js' && argv.includes('--freeze')) {
      return { exitCode: 0, result: 'in-grammar', decision: 'auto-run', planHash: FROZEN_HASH,
        frozen: true, resumeOk: true, risk: {} };
    }
    return { exitCode: 0, created: true };
  };
  const seams = extra => Object.assign({
    planPath, statePath, project: 'issue-815-nonwedge', json: true, shell: flipShell,
    computeNextAction: require('./kaola-workflow-next-action').computeNextAction,
    resolveModel: () => 'sonnet',
    readFile: fpath => fs.readFileSync(fpath, 'utf8'),
    cacheExists: fpath => fs.existsSync(fpath),
    writeFile: (fpath, content) => fs.writeFileSync(fpath, content),
    mkdirp: dir => { try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {} },
  }, extra || {});

  try {
    // Iteration 1 — the human-authored surface is submitted and anchored; the refusal is the GRAMMAR's.
    fs.writeFileSync(planPath, draft(ORIGINAL, 'gate'));
    const it1 = runHandoff(seams());
    assert(it1.reason !== 'acceptance_repair_fenced', 'T-815c: iteration 1 refuses on grammar, not the fence');
    const anchor = JSON.parse(fs.readFileSync(anchorPath, 'utf8'));
    assert(anchor.acceptance_surface && anchor.acceptance_surface.includes('A1: the acceptance surface is restorable'),
      'T-815c: the anchor persists the acceptance surface BYTES, not merely its digest');
    assert(anchor.acceptance_digest === validatorMod.acceptanceDigest(draft(ORIGINAL, 'gate')),
      'T-815c: ...alongside their digest');

    // Iteration 2 — a FRESH planner re-transcribes the same criteria in different words, and (as in a
    // real loop) it has already overwritten the only copy of the previous surface.
    fs.writeFileSync(planPath, draft(REWORDED, 'gate'));
    assert(!fs.readFileSync(planPath, 'utf8').includes('A1: the acceptance surface is restorable'),
      'T-815c: the prior surface is GONE from the tree — this is why a digest-only refusal wedges');
    const fenced = runHandoff(seams());
    assert(fenced.reason === 'acceptance_repair_fenced', 'T-815c: the reworded surface is fenced');
    assert(fenced.anchored_acceptance_surface === anchor.acceptance_surface,
      'T-815c: the refusal RETURNS the anchored surface text — the repair instruction is executable');
    assert(fenced.errors.join('\n').includes('A1: the acceptance surface is restorable'),
      'T-815c: ...and the operator-facing errors carry those bytes too');
    assert(fenced.validator_verdict && Array.isArray(fenced.validator_verdict.errors)
      && fenced.validator_verdict.errors.join(' ').includes('G7: gate_surface missing'),
      'T-815c: the fence does NOT swallow the grammar errors the loop was iterating on, got '
        + JSON.stringify(fenced.validator_verdict));
    assert(fenced.errors.join('\n').includes('G7: gate_surface missing'),
      'T-815c: ...and they are visible to a text-only reader of errors');
    // WHICH items moved — the answer to "re-wording or redefinition?", read through the ONE fence-aware
    // item reader over both sets of real bytes (its production consumer).
    assert(fenced.acceptance_item_delta
      && fenced.acceptance_item_delta.changed.join(',') === 'A1,A2'
      && !fenced.acceptance_item_delta.added.length && !fenced.acceptance_item_delta.removed.length,
      'T-815c: the refusal names WHICH items moved, got ' + JSON.stringify(fenced.acceptance_item_delta));
    assert(fenced.errors.join('\n').includes('reworded/redefined: A1, A2'),
      'T-815c: ...and says so in the operator-facing errors');

    // Iteration 3 — the loop restores the surface VERBATIM from the refusal (nothing else in the tree
    // holds it) and fixes the grammar. The fence stands aside, the validator is reached, and it FREEZES.
    const restored = draft(fenced.anchored_acceptance_surface.replace(/^\n+|\n+$/g, ''), 'sequence');
    fs.writeFileSync(planPath, restored);
    assert(validatorMod.acceptanceDigest(restored) === anchor.acceptance_digest,
      'T-815c: the returned bytes reconstruct the anchored surface exactly');
    mode = 'freeze';
    const it3 = runHandoff(seams());
    assert(it3.handoff_status === 'ready_to_run',
      'T-815c NON-WEDGE: a fenced submission followed by a restoring one reaches the validator and FREEZES, got '
        + JSON.stringify(it3.handoff_status) + ' ' + JSON.stringify(it3.errors || it3.reason));

    // NO SELF-MINTED TOKEN OPENS THE FENCE. The process that types this command IS the process the
    // fence binds, so any free-text string it can write is a token it hands itself — not consent. The
    // fence has exactly one in-epoch route (restore verbatim, proven above); a change of what "done"
    // means routes through the ONE consent mechanism the workflow already owns (a digest-chained
    // consent-ledger entry BOUND to the new surface, cited by a re-plan child epoch), or a discard.
    mode = 'refuse';
    fs.writeFileSync(planPath, draft(REWORDED, 'gate'));
    for (const selfMinted of ['the user asked for this', 'user turn: "reword A1/A2, same intent"', '   ', '']) {
      const attempt = runHandoff(seams({ acceptanceChangeAuthorized: selfMinted }));
      assert(attempt.reason === 'acceptance_repair_fenced',
        'T-815c SELF-AUTH: a self-authored string ' + JSON.stringify(selfMinted)
          + ' must NOT move the acceptance surface, got ' + JSON.stringify(attempt.reason));
      assert(JSON.parse(fs.readFileSync(anchorPath, 'utf8')).acceptance_digest === anchor.acceptance_digest,
        'T-815c SELF-AUTH: ...and it does not move the anchor either (' + JSON.stringify(selfMinted) + ')');
    }
    assert(runHandoff(seams()).errors.join('\n').includes('acceptance_change_consent'),
      'T-815c SELF-AUTH: the refusal names the ONE route a values change takes (a bound consent entry '
        + 'cited by a re-plan child epoch), not a flag on this command');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// T-815d: A POST-FREEZE TAMPER IS NEVER LAUNDERED. `plan_hash` is the frozen plan's identity, and
// `--freeze` re-stamps whatever it is handed — so the handoff, which calls it unconditionally, is the
// one place a tampered frozen plan could be quietly re-blessed into a self-consistent one. Three cases
// on real fs + real hashing: an acceptance tamper, a non-acceptance (`## Design`) tamper, and the
// control — an untampered frozen plan still re-runs idempotently.
// ---------------------------------------------------------------------------
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-accept-frozen-'));
  const projectDir = path.join(tmp, 'kaola-workflow', 'issue-815-frozen');
  fs.mkdirSync(projectDir, { recursive: true });
  const planPath  = path.join(projectDir, 'workflow-plan.md');
  const statePath = path.join(projectDir, 'workflow-state.md');

  const body = (acceptance, design) => [
    '# Workflow Plan — issue-815-frozen', '',
    '## Meta', 'plan_schema_version: 2', 'plan_form: spine', 'labels: enhancement',
    'code_certifier: none', 'security_certifier: none',
    'inherited_frontier_digest: none', 'inherited_frontier_classes: none', '',
    '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '| --- | --- | --- | --- | --- | --- |',
    '| explore | code-explorer | — | — | 1 | sequence |',
    '| done | finalize | explore | CHANGELOG.md | 1 | sequence |', '',
    '## Design', '', design, '',
    '## Acceptance', '', acceptance, '',
    '## Node Ledger', '', '| id | status |', '| --- | --- |',
    '| explore | pending |', '| done | pending |', '',
  ].join('\n') + '\n';

  const ORIGINAL_ACCEPTANCE = 'A1: the deliverable must never delete user data.';
  const ORIGINAL_DESIGN = 'Decompose: explore then done. sequence explore→done: S1 done consumes explore.';
  const frozen = (acceptance, design) => stampFrozen(h =>
    body(acceptance, design).replace('# Workflow Plan — issue-815-frozen',
      '# Workflow Plan — issue-815-frozen\n\n<!-- plan_hash: ' + h + ' -->'));

  fs.writeFileSync(statePath, ['# Kaola-Workflow State', '',
    '## Project', 'name: issue-815-frozen', 'status: active', '',
    '## Epoch Lineage', 'epoch_schema_version: 2', 'plan_epoch: 1', 'active_plan_hash: none', '',
    '## Sink', 'branch: workflow/issue-815-frozen', 'sink: merge', ''].join('\n'));

  // A validator stub that would happily re-freeze anything — the point is that the handoff never
  // reaches it on a tampered frozen plan.
  const FRESH_HASH = 'd'.repeat(64);
  const permissiveShell = (scriptPath, scriptArgs) => {
    const base = path.basename(scriptPath);
    const argv = scriptArgs || [];
    if (base === 'kaola-workflow-plan-validator.js' && argv.includes('--freeze-checked')) {
      return { exitCode: 0, result: 'in-grammar', decision: 'auto-run', planHash: FRESH_HASH,
        frozen: false, governance: { decision: 'auto-run', risk: {} }, risk: {} };
    }
    if (base === 'kaola-workflow-plan-validator.js' && argv.includes('--freeze')) {
      return { exitCode: 0, result: 'in-grammar', decision: 'auto-run', planHash: FRESH_HASH,
        frozen: true, resumeOk: true, risk: {} };
    }
    return { exitCode: 0, created: true };
  };
  const seams = extra => Object.assign({
    planPath, statePath, project: 'issue-815-frozen', json: true, shell: permissiveShell,
    computeNextAction: require('./kaola-workflow-next-action').computeNextAction,
    resolveModel: () => 'sonnet',
    readFile: fpath => fs.readFileSync(fpath, 'utf8'),
    cacheExists: fpath => fs.existsSync(fpath),
    writeFile: (fpath, content) => fs.writeFileSync(fpath, content),
    mkdirp: dir => { try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {} },
  }, extra || {});

  try {
    const clean = frozen(ORIGINAL_ACCEPTANCE, ORIGINAL_DESIGN);
    const storedHash = (clean.match(/<!--\s*plan_hash:\s*([0-9a-f]{64})\s*-->/) || [])[1];

    // CONTROL — an untampered frozen plan still re-runs (resume / idempotent re-freeze is unchanged).
    fs.writeFileSync(planPath, clean);
    assert(runHandoff(seams()).handoff_status === 'ready_to_run',
      'T-815d CONTROL: an UNTAMPERED frozen plan still reaches ready_to_run on a re-run');

    // (a) a post-freeze ACCEPTANCE edit — the values surface — stays plan_hash_mismatch, even with a
    //     self-minted authorization string, and the stamped hash on disk does not move.
    for (const extra of [undefined, { acceptanceChangeAuthorized: 'I decided this' }]) {
      fs.writeFileSync(planPath, clean.replace(ORIGINAL_ACCEPTANCE,
        'A1: deleting user data is acceptable if it simplifies the code.'));
      const tampered = runHandoff(seams(extra));
      assert(tampered.handoff_status === 'plan_invalid' && tampered.reason === 'plan_hash_mismatch',
        'T-815d: a post-freeze ## Acceptance edit stays plan_hash_mismatch'
          + (extra ? ' EVEN WITH a self-minted authorization string' : '') + ', got '
          + JSON.stringify(tampered.reason || tampered.handoff_status));
      assert(fs.readFileSync(planPath, 'utf8').includes('plan_hash: ' + storedHash),
        'T-815d: ...and the frozen plan_hash is NOT re-stamped');
    }

    // (b) the same for a NON-acceptance hash-covered section: the gate is integrity, not a second
    //     acceptance fence, so it holds where no anchor exists to catch the edit.
    fs.writeFileSync(planPath, clean.replace(ORIGINAL_DESIGN, ORIGINAL_DESIGN + ' TAMPERED.'));
    const designTamper = runHandoff(seams());
    assert(designTamper.reason === 'plan_hash_mismatch',
      'T-815d: a post-freeze ## Design edit stays plan_hash_mismatch too, got '
        + JSON.stringify(designTamper.reason || designTamper.handoff_status));
    assert(fs.readFileSync(planPath, 'utf8').includes('plan_hash: ' + storedHash),
      'T-815d: ...and that plan_hash is NOT re-stamped either');
    assert(!fs.existsSync(path.join(projectDir, '.cache', 'acceptance-anchor.json')),
      'T-815d: an already-frozen plan is never retroactively anchored, on any branch');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// T-815e: A PRESENT-BUT-UNREADABLE ANCHOR REFUSES; it never degrades to first-submission.
//
// The fence's own record is `.cache/acceptance-anchor.json`. Reading it used to swallow every failure
// into `anchored = null`, which put a DAMAGED anchor on the same branch as NO anchor — and that branch
// re-anchors on whatever surface the current submission carries. So a truncated or wrong-typed anchor
// silently moved the fence to the submitted surface with no signal. That is a fail-open DEFAULT, not
// an adversary story: an interrupted write (crash, full disk) produces it unaided.
//
// Absent-and-genuinely-first must keep working — it is load-bearing (the `acceptance_missing` repair
// authors the section) and a fence that wedges it is worse than no fence. Both halves are pinned here.
// ---------------------------------------------------------------------------
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-accept-anchor-'));
  const projectDir = path.join(tmp, 'kaola-workflow', 'issue-815-anchor');
  fs.mkdirSync(path.join(projectDir, '.cache'), { recursive: true });
  const planPath  = path.join(projectDir, 'workflow-plan.md');
  const statePath = path.join(projectDir, 'workflow-state.md');
  const anchorPath = path.join(projectDir, '.cache', 'acceptance-anchor.json');
  const STATE = ['## Project', 'name: issue-815-anchor', 'status: active', '',
    '## Epoch Lineage', 'epoch_schema_version: 2', 'plan_epoch: 1', 'active_plan_hash: none', ''].join('\n');
  fs.writeFileSync(statePath, STATE);

  const body = acceptance => [
    '# Workflow Plan — issue-815-anchor', '',
    '## Meta', 'plan_schema_version: 2', 'plan_form: spine', 'labels: enhancement',
    'code_certifier: none', 'security_certifier: none',
    'inherited_frontier_digest: none', 'inherited_frontier_classes: none', '',
    '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '| --- | --- | --- | --- | --- | --- |',
    '| explore | code-explorer | — | — | 1 | sequence |',
    '| done | finalize | explore | CHANGELOG.md | 1 | sequence |', '',
    '## Design', '', 'Decompose: explore then done. S1: done consumes explore.', '',
    '## Acceptance', '', acceptance, '',
    '## Node Ledger', '', '| id | status |', '| --- | --- |',
    '| explore | pending |', '| done | pending |', '',
  ].join('\n') + '\n';

  const ORIGINAL = 'A1: the deliverable must never delete user data.';
  const MOVED    = 'A1: deleting user data is acceptable if it simplifies the code.';

  const refusingShell = makeShellStub({
    'kaola-workflow-plan-validator.js:--freeze-checked': { exitCode: 1, result: 'refuse', errors: ['nodes_unparseable'] },
  });
  const seams = () => ({
    planPath, statePath, project: 'issue-815-anchor', json: true, shell: refusingShell,
    computeNextAction: require('./kaola-workflow-next-action').computeNextAction,
    resolveModel: () => 'sonnet',
    readFile: fpath => fs.readFileSync(fpath, 'utf8'),
    cacheExists: fpath => fs.existsSync(fpath),
    writeFile: (fpath, content) => fs.writeFileSync(fpath, content),
    mkdirp: dir => { try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {} },
  });

  try {
    // GREEN HALF — absent anchor + a transcribed surface is genuinely-first: it anchors, it is never
    // fenced, and it is never confused with the damaged case below.
    fs.writeFileSync(planPath, body(ORIGINAL));
    const first = runHandoff(seams());
    assert(first.reason !== 'acceptance_repair_fenced' && first.reason !== 'acceptance_anchor_unreadable',
      'T-815e: an ABSENT anchor is genuinely-first — it anchors rather than refusing, got ' + JSON.stringify(first.reason));
    assert(fs.existsSync(anchorPath), 'T-815e: ...and the first transcription is what gets anchored');
    const goodAnchor = fs.readFileSync(anchorPath, 'utf8');

    // RED HALF — every way a PRESENT anchor can fail to read back refuses acceptance_anchor_unreadable
    // and leaves the anchor, the plan, and workflow-state.md byte-untouched. Each case is submitted
    // with a MOVED surface, so the pre-fix behaviour (re-anchor on the new surface, then continue) is
    // exactly what a regression would restore.
    const damaged = [
      ['truncated mid-write (unparseable)',        '{{{not json'],
      ['valid JSON but not an object',             '"just a string"'],
      ['valid JSON array',                         '[]'],
      ['valid JSON null',                          'null'],
      ['no acceptance_digest field',               '{"schema_version":2,"plan_epoch":1}'],
      ['non-string acceptance_digest',             '{"schema_version":2,"plan_epoch":1,"acceptance_digest":12345}'],
      ['empty acceptance_digest',                  '{"schema_version":2,"plan_epoch":1,"acceptance_digest":"   "}'],
      ['garbled plan_epoch (must not coerce to 1)', '{"schema_version":2,"plan_epoch":"banana","acceptance_digest":"' + 'a'.repeat(64) + '"}'],
      ['non-string acceptance_surface',            '{"schema_version":2,"plan_epoch":1,"acceptance_digest":"' + 'a'.repeat(64) + '","acceptance_surface":{"x":1}}'],
    ];
    for (const [label, bytes] of damaged) {
      fs.writeFileSync(anchorPath, bytes);
      fs.writeFileSync(planPath, body(MOVED));
      const r = runHandoff(seams());
      assert(r.handoff_status === 'plan_invalid' && r.reason === 'acceptance_anchor_unreadable',
        'T-815e RED (' + label + '): a PRESENT-but-unreadable anchor refuses acceptance_anchor_unreadable '
          + 'instead of re-anchoring on the submitted surface, got ' + JSON.stringify(r.reason || r.handoff_status));
      assert(typeof r.anchor_defect === 'string' && r.anchor_defect.length > 0 && r.anchor_path === anchorPath,
        'T-815e (' + label + '): the refusal names WHICH anchor and WHAT is wrong with it');
      assert(r.errors.join('\n').includes('Do NOT delete the anchor'),
        'T-815e (' + label + '): the refusal forbids deleting the anchor — deletion IS the disarm');
      assert(fs.readFileSync(anchorPath, 'utf8') === bytes,
        'T-815e (' + label + '): the damaged anchor is NOT overwritten by the submitted surface');
      assert(fs.readFileSync(planPath, 'utf8') === body(MOVED) && fs.readFileSync(statePath, 'utf8') === STATE,
        'T-815e (' + label + '): the refusal mutates neither the plan nor workflow-state.md');
    }

    // COMPAT — a WELL-FORMED schema-1 anchor (digest only, no plan_epoch, no surface) is not "damaged":
    // it still ENFORCES the fence. Refusing it as malformed would break the legacy tail.
    const digestOnly = JSON.parse(goodAnchor).acceptance_digest;
    fs.writeFileSync(anchorPath, JSON.stringify({ acceptance_digest: digestOnly }) + '\n');
    fs.writeFileSync(planPath, body(MOVED));
    assert(runHandoff(seams()).reason === 'acceptance_repair_fenced',
      'T-815e COMPAT: a well-formed schema-1 anchor still FENCES (it is not treated as unreadable)');

    // CONTROL — an intact schema-2 anchor is unchanged in both directions: the moved surface fences,
    // and the restored surface passes the fence back to the grammar.
    fs.writeFileSync(anchorPath, goodAnchor);
    assert(runHandoff(seams()).reason === 'acceptance_repair_fenced',
      'T-815e CONTROL: an INTACT anchor still fences a moved surface');
    fs.writeFileSync(planPath, body(ORIGINAL));
    assert(runHandoff(seams()).reason !== 'acceptance_repair_fenced',
      'T-815e CONTROL: restoring the anchored surface still clears the fence');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// T-DECOY-HALT — a FRESH freeze may never hand off a plan that already carries
// `consent_halt: pending` in its `## Node Ledger`.
//
// The marker is the durable consent valve: `open-next` (and every other mutating subcommand) refuses
// `halt_pending` while it is set. That is correct for a run that actually halted — and catastrophic
// for a run that has not started, because there is nothing to consent TO and the very first open
// wedges on a halt no human ever raised.
//
// It is a real, observed shape: a planner that copies its plan skeleton from an ARCHIVED plan (where
// the marker legitimately survives) carries the line into a brand-new ledger. `plan_hash` covers only
// `## Meta` + `## Nodes`, so the marker rides through the freeze completely unremarked.
//
// The freeze path owns this because it is the ONLY point that can tell "fresh" from "resumed": it is
// where a plan first becomes a run. Resolve it EITHER way — refuse with a typed reason that names the
// marker, or strip the marker before freezing — but never hand back `ready_to_run` with it still set.
// ---------------------------------------------------------------------------
{
  const adaptiveSchemaDecoy = require('./kaola-workflow-adaptive-schema');
  const PLAN_PATH_DECOY = '/fake/kaola-workflow/test-project/workflow-plan.md';

  const runDecoyHandoff = (planContent) => {
    const writtenFiles = {};
    let planNow = planContent;
    let readCallCount = 0;
    const frozen = stampFrozen(h => planContent.replace('# Workflow Plan',
      '<!-- plan_hash: ' + h + ' -->\n\n# Workflow Plan'));
    const shellStub = makeShellStub({
      'kaola-workflow-plan-validator.js:--freeze-checked': {
        exitCode: 0, result: 'in-grammar', decision: 'auto-run',
        planHash: PLAN_HASH_64, frozen: false,
        governance: { decision: 'auto-run', risk: {} },
        risk: { sensitivity: false, blastRadius: false, uncertain: false, reasons: [] },
      },
      'kaola-workflow-plan-validator.js:--freeze': {
        exitCode: 0, result: 'in-grammar', decision: 'auto-run',
        planHash: PLAN_HASH_64, frozen: true, resumeOk: true,
        risk: { sensitivity: false, blastRadius: false, uncertain: false, reasons: [] },
      },
      'kaola-workflow-roadmap.js:init-issue': { exitCode: 0, created: true },
      'git:add': { exitCode: 0 },
      'kaola-workflow-adaptive-node.js': { exitCode: 0, status: 'mirrored', planHash: PLAN_HASH_64,
        dest: '/wt/kaola-workflow/test-project' },
    });
    const result = runHandoff({
      planPath: PLAN_PATH_DECOY,
      statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
      project: 'test-project',
      json: true,
      shell: shellStub,
      computeNextAction: require('./kaola-workflow-next-action').computeNextAction,
      resolveModel: () => 'sonnet',
      readFile: (fpath) => {
        if (fpath.endsWith('workflow-plan.md')) {
          readCallCount++;
          // Whatever the handoff has written most recently wins, so a STRIP is observable; absent a
          // write, the first read is the unfrozen draft and later reads are the frozen bytes.
          if (writtenFiles[PLAN_PATH_DECOY] !== undefined) return writtenFiles[PLAN_PATH_DECOY];
          return readCallCount <= 1 ? planNow : frozen;
        }
        if (fpath.endsWith('workflow-state.md')) return makeStateContent({ issueNumber: 42 });
        return '';
      },
      writeFile: (fpath, content) => { writtenFiles[fpath] = content; },
      stateMtime: undefined,
    });
    const finalPlan = writtenFiles[PLAN_PATH_DECOY] !== undefined
      ? writtenFiles[PLAN_PATH_DECOY]
      : frozen;
    return { result, writtenFiles, finalPlan };
  };

  // The decoy: the marker sits INSIDE `## Node Ledger` (the only place it fences) on a fresh,
  // never-run plan whose every row is still `pending`.
  const decoyPlan = makeUnfrozenPlan('auto-run').replace(
    '| finalize | pending | |',
    '| finalize | pending | |\nconsent_halt: pending');
  assert(adaptiveSchemaDecoy.readDurableConsentHalt(decoyPlan) === true,
    'T-DECOY-HALT FIXTURE: the decoy marker is genuinely ledger-scoped (the same read every mutating '
    + 'subcommand fences on)');
  assert(!/in_progress/.test(decoyPlan),
    'T-DECOY-HALT FIXTURE: nothing in this plan has ever run — there is no halt to consent to');

  const decoy = runDecoyHandoff(decoyPlan);
  const stillHalted = adaptiveSchemaDecoy.readDurableConsentHalt(decoy.finalPlan);
  assert(!(decoy.result.handoff_status === 'ready_to_run' && stillHalted),
    'T-DECOY-HALT: a fresh freeze must NEVER return ready_to_run with a decoy `consent_halt: pending` '
    + 'still set — the first open-next would refuse halt_pending on a run that never halted. got '
    + JSON.stringify({ handoff_status: decoy.result.handoff_status, stillHalted }));

  if (decoy.result.handoff_status === 'ready_to_run') {
    assert(!stillHalted,
      'T-DECOY-HALT (strip arm): if the freeze STRIPS the decoy it must write the stripped plan back');
  } else {
    const blob = JSON.stringify({ reason: decoy.result.reason, errors: decoy.result.errors });
    assert(decoy.result.result === 'refuse' && /consent_halt|halt/i.test(blob),
      'T-DECOY-HALT (refuse arm): the refusal must be TYPED and NAME the marker so the planner can '
      + 'fix its own draft, got ' + blob);
  }

  // CONTROL — the identical fixture WITHOUT the decoy reaches ready_to_run, so the pin above
  // discriminates the marker rather than some unrelated property of this harness.
  const clean = runDecoyHandoff(makeUnfrozenPlan('auto-run'));
  assert(clean.result.handoff_status === 'ready_to_run',
    'T-DECOY-HALT CONTROL: the same plan WITHOUT the marker still freezes to ready_to_run, got '
    + JSON.stringify({ handoff_status: clean.result.handoff_status, reason: clean.result.reason,
      errors: clean.result.errors }));
  assert(adaptiveSchemaDecoy.readDurableConsentHalt(clean.finalPlan) === false,
    'T-DECOY-HALT CONTROL: ...and no marker is invented on the clean path');
}

// ---------------------------------------------------------------------------
// T-DECOY-HALT-CLI — the SECOND freeze entry: `plan-validator --freeze` itself.
//
// The fence above lives at the adaptive-handoff entry (Step 0.86). But the handoff is a
// CONVENIENCE over the freeze writer, not the writer: `kaola-workflow-plan-validator.js --freeze`
// is the script that stamps `plan_hash` and replaces workflow-plan.md on disk, and it is a
// documented public CLI — the planner/operator chain `--freeze-checked` then
// `--freeze --governance-ack <hash>` is exactly the two-spawn sequence the handoff shells
// internally, and it is reachable directly.
//
// So a guard that lives ONLY at the handoff is a guard on one of two doors. Run the documented
// direct chain on a draft that copied `consent_halt: pending` out of an archived plan's ledger and
// the decoy freezes: `computePlanHash` covers `## Meta` + `## Nodes` only, so the marker rides the
// freeze unremarked, and the run's very first `open-next` then refuses `halt_pending` on a halt no
// human ever raised. That is the identical wedge, entered through the other door.
//
// The four pins below, in the order they matter:
//   (1) `--freeze` on an UNFROZEN draft carrying the marker STRIPS it and FREEZES, reporting the
//       strip as the named `decoy_consent_halt_stripped` advisory. A draft with zero halt events
//       carries no evidence the marker could be, so the marker is non-canonical FORM and the freeze
//       repairs it rather than handing a mechanical edit back to a human — but a repair the operator
//       is not told about is the silent half of that trade, so the advisory is pinned as hard as the
//       freeze is. Every writing arm of --freeze is covered (bare, --governance-ack, --repair) — a
//       repair installed in one arm leaks through the others.
//   (2) the write is exactly the stripped draft: the marker gone, plan_hash stamped, and NOTHING
//       else in the plan disturbed — a strip that also ate a ledger row would pass a marker-only
//       check. No file is created either.
//   (3) a GENUINE halt is untouched. A real consent halt sits on a FROZEN, mid-run plan; the
//       marker is written by write-halt, never authored. The mid-run re-freeze must still succeed
//       and must still carry the marker out the other side, or the fix strips a consent the user
//       is still owed. This is the pin the never-frozen discriminator exists for.
//   (4) the two entries AGREE. Same draft bytes in, same stripped ledger out, whichever door was
//       used, and the same advisory WORDING names it. The token cannot be the subject of that
//       comparison: it is what the advisory is selected by, so comparing it can only ever be true.
//   (5) the window the restructuring opened. The handoff DECIDES the strip at Step 0.85 and APPLIES
//       it at Step 1.7; everything between is a refuse-gate, and the safety property that makes the
//       split legal is that those gates still mutate nothing when they fire. Pins (1)-(4) all run
//       the success path, so none of them can see it.
//
// The fixture is a real freezable schema-2 spine driven through the REAL validator subprocess in a
// real temp dir (the #641 block's shape) — the CLI is what the finding is about, so stubbing it
// would pin the stub.
// ---------------------------------------------------------------------------
{
  const VALIDATOR_CLI = path.join(__dirname, 'kaola-workflow-plan-validator.js');
  const schemaCli = require('./kaola-workflow-adaptive-schema');

  const cliRow = n => '| ' + n.id + ' | ' + n.role + ' | ' + (n.depends_on || '—') + ' | '
    + (n.write_set || '—') + ' | 1 | ' + (n.shape || 'sequence') + ' | ' + (n.observes || '—') + ' | '
    + (n.gate_claim || '—') + ' | ' + (n.gate_surface || '—') + ' | ' + (n.gate_aggregation || '—')
    + ' | ' + (n.certifies || '—') + ' |';
  const CLI_NODES = [
    { id: 'seed', role: 'code-explorer' },
    { id: 'child-review', role: 'code-reviewer', depends_on: 'seed',
      gate_claim: 'current code candidate is approved', gate_surface: 'full code candidate',
      gate_aggregation: 'sequence' },
    { id: 'finalize', role: 'finalize', depends_on: 'child-review' },
  ];

  // `halt` places the marker inside `## Node Ledger` (the only place it fences); `statuses` moves
  // rows off `pending`; `hash` stamps the frozen marker (outside every hash-covered section).
  //
  // `strayHalt` places a marker-SHAPED line on either side of the ledger — one in `## Design`
  // (before it) and one in a trailing `## Plan Notes` (after it). Neither is a consent valve:
  // `readDurableConsentHalt` is section-scoped, so only the ledger line fences anything, and the
  // production strip claims in a comment that "a same-looking line anywhere else in the plan stays
  // exactly where its author put it". These two lines are what turns that comment into a test — a
  // strip that scanned the whole document, or ran from the ledger heading to EOF, eats one of them
  // and is otherwise indistinguishable from a correct one.
  function cliPlanBody(opts, hash) {
    const st = (opts && opts.statuses) || {};
    return [
      '# Workflow Plan — test-project', '',
      ...(hash ? ['<!-- plan_hash: ' + hash + ' -->', ''] : []),
      '## Meta', 'plan_form: spine', 'plan_schema_version: 2', 'contract_version: 2',
      'epoch_schema_version: 2', 'plan_epoch: 2',
      'epoch_lineage_id: ' + '1'.repeat(64), 'parent_plan_hash: ' + '2'.repeat(64),
      'parent_snapshot_manifest_digest: pending', 'claim_root_base_digest: ' + '3'.repeat(64),
      'source_evidence_digest: ' + '5'.repeat(64), 'transition_reason: review_repair_requires_replan',
      'planner_binding: dispatch-decoy', 'labels: area:scripts', 'sink: CHANGELOG.md',
      'code_certifier: child-review', 'security_certifier: none',
      'inherited_frontier_digest: ' + '4'.repeat(64), 'inherited_frontier_classes: code',
      'validation_command: node scripts/test-plan-validator.js', 'validation_timeout_minutes: 30', '',
      '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape | observes | gate_claim | gate_surface | gate_aggregation | certifies |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      ...CLI_NODES.map(cliRow), '',
      '## Design', '',
      'Decompose: a child epoch over the inherited frontier; the sequence edges are gate/data '
        + 'dependencies (S1). Done: the named certifier clears the inherited frontier.',
      ...((opts && opts.strayHalt) ? ['', schemaCli.CONSENT_HALT_MARKER] : []), '',
      '## Node Ledger', '', '| id | status |', '| --- | --- |',
      ...CLI_NODES.map(n => '| ' + n.id + ' | ' + (st[n.id] || 'pending') + ' |'),
      ...((opts && opts.halt) ? [schemaCli.CONSENT_HALT_MARKER] : []), '',
      ...((opts && opts.strayHalt) ? ['## Plan Notes', '', schemaCli.CONSENT_HALT_MARKER, ''] : []),
    ].join('\n') + '\n';
  }
  const cliPlan = opts => ((opts && opts.frozen)
    ? stampFrozen(h => cliPlanBody(opts, h))
    : cliPlanBody(opts, null));

  // A real project dir, because --freeze is a real atomic file replace.
  function inTempProject(planContent, fn) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-decoy-cli-'));
    const proj = path.join(tmpDir, 'kaola-workflow', 'test-project');
    fs.mkdirSync(proj, { recursive: true });
    const planPath = path.join(proj, 'workflow-plan.md');
    fs.writeFileSync(planPath, planContent);
    try { return fn(planPath, proj); }
    finally { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} }
  }

  // The `## Node Ledger` slice, by the SAME section boundaries `readDurableConsentHalt` and the
  // strip use — so "inside the ledger" and "outside it" mean one thing in this block.
  const ledgerSlice = (text) => {
    const { start, next } = schemaCli.locateSection(String(text), 'Node Ledger');
    return start < 0 ? null : (next < 0 ? String(text).slice(start) : String(text).slice(start, next));
  };
  const outsideLedger = (text) => {
    const { start, next } = schemaCli.locateSection(String(text), 'Node Ledger');
    return start < 0 ? null
      : String(text).slice(0, start) + (next < 0 ? '' : String(text).slice(next));
  };

  const DRAFT_DECOY = cliPlan({ halt: true, strayHalt: true });
  assert(schemaCli.readDurableConsentHalt(DRAFT_DECOY) === true,
    'T-DECOY-HALT-CLI FIXTURE: the marker is ledger-scoped — the same read every mutating '
    + 'subcommand fences on');
  assert(!/<!--\s*plan_hash:/.test(DRAFT_DECOY) && !/in_progress|complete/.test(DRAFT_DECOY),
    'T-DECOY-HALT-CLI FIXTURE: the draft is UNFROZEN and has never run — there is no halt to '
    + 'consent to');
  assert(outsideLedger(DRAFT_DECOY).split('\n')
    .filter(l => l === schemaCli.CONSENT_HALT_MARKER).length === 2,
    'T-DECOY-HALT-CLI FIXTURE: exactly TWO marker-shaped lines sit OUTSIDE the ledger (one before '
    + 'it in ## Design, one after it in ## Plan Notes) — and neither is a halt: the fixture assert '
    + 'above already read the plan as halted through the section-scoped reader');
  // The ack is computed locally, never read back from --freeze-checked: the ack arm must stay
  // exercisable even if the fix also fences the read-only check.
  const DRAFT_ACK = realComputePlanHash(DRAFT_DECOY);

  // Every arm of the freeze WRITER. --freeze-checked is deliberately absent: it writes nothing, so
  // whether it refuses early or defers to --freeze is the implementer's call, not a contract.
  const FREEZE_ARMS = [
    ['--freeze --governance-ack (the documented direct chain)',
      p => [p, '--freeze', '--governance-ack', DRAFT_ACK, '--json']],
    ['--freeze (bare)', p => [p, '--freeze', '--json']],
    ['--freeze --repair', p => [p, '--freeze', '--repair', '--json']],
  ];

  // Keyed by arm, carrying the advisory's DETAIL — the free value. The token cannot go in here:
  // `find` below selects on that exact literal, so a map of tokens is a map of one constant and
  // comparing it downstream is a comparison that cannot fail.
  const cliAdvisoryDetails = {};
  for (const [label, argv] of FREEZE_ARMS) {
    inTempProject(DRAFT_DECOY, (planPath, proj) => {
      const beforeBytes = fs.readFileSync(planPath, 'utf8');
      const beforeLs = fs.readdirSync(proj).sort().join(',');
      const v = shellHandoff(VALIDATOR_CLI, argv(planPath));
      const afterBytes = fs.readFileSync(planPath, 'utf8');
      const advisory = (v.warnings || []).find(w => w && w.warning === 'decoy_consent_halt_stripped');
      cliAdvisoryDetails[label] = advisory ? advisory.detail : undefined;

      // (1) The freeze SUCCEEDS, and says what it repaired.
      assert(v.result === 'in-grammar' && v.frozen === true && v.exitCode === 0,
        'T-DECOY-HALT-CLI (1) ' + label + ': freezing a never-frozen draft that carries '
        + '"' + schemaCli.CONSENT_HALT_MARKER + '" in its ## Node Ledger must STRIP the marker and '
        + 'freeze — the line is non-canonical form on a draft with zero halt events, not a consent '
        + 'anyone is owed, and freeze is an advise door. got '
        + JSON.stringify({ result: v.result, reason: v.reason, frozen: v.frozen, exitCode: v.exitCode,
          errors: v.errors }));
      assert(advisory !== undefined,
        'T-DECOY-HALT-CLI (1) ' + label + ': the strip is reported as the named '
        + '`decoy_consent_halt_stripped` advisory — a repair the operator is never told about is '
        + 'exactly the silent clearing this conversion must not become. got '
        + JSON.stringify(v.warnings));
      assert(String(advisory.detail || '').includes(schemaCli.CONSENT_HALT_MARKER)
        && String(advisory.detail || '').includes('## Node Ledger'),
        'T-DECOY-HALT-CLI (1) ' + label + ': the advisory NAMES the line it removed and the section '
        + 'it sat in, so the record of the repair is legible without re-reading the diff, got '
        + JSON.stringify(advisory));

      // (2) The write is the STRIPPED draft, and nothing beyond it.
      assert(schemaCli.readDurableConsentHalt(afterBytes) === false,
        'T-DECOY-HALT-CLI (2) ' + label + ': the frozen plan on disk no longer carries the marker — '
        + 'the whole point is that the first open-next does not wedge on halt_pending');
      assert(/<!--\s*plan_hash:\s*[0-9a-f]{64}\s*-->/.test(afterBytes),
        'T-DECOY-HALT-CLI (2) ' + label + ': ...and it IS frozen — plan_hash is stamped');
      // Survival-only ("every before-line still appears after") is half a check and a weak half:
      // `includes` is a substring test over the whole document, so it is satisfied by any line that
      // occurs inside a longer one, and by `''` unconditionally. Measured against this fixture, a
      // strip that ate the ledger separator, ate every blank line, or appended junk all passed it.
      // State the edit exactly instead, in two halves: what changed inside the ledger, and what did
      // not change outside it.
      const afterLines = afterBytes.split('\n');
      const stampAt = afterLines.findIndex(l => /^<!--\s*plan_hash:\s*[0-9a-f]{64}\s*-->$/.test(l));
      assert(stampAt >= 0 && afterLines[stampAt + 1] === '',
        'T-DECOY-HALT-CLI (2) ' + label + ': the freeze adds the stamp as a comment line plus its '
        + 'blank, and that is the only thing it adds — the two halves below subtract exactly those '
        + 'two lines before comparing, so a third added line has nowhere to hide');
      const afterUnstamped = afterLines.slice(0, stampAt).concat(afterLines.slice(stampAt + 2)).join('\n');
      assert(ledgerSlice(afterUnstamped) === ledgerSlice(beforeBytes).split('\n')
        .filter(l => l !== schemaCli.CONSENT_HALT_MARKER).join('\n'),
        'T-DECOY-HALT-CLI (2) ' + label + ': inside `## Node Ledger` the edit is EXACTLY the marker '
        + 'line removed — byte-for-byte otherwise. A strip that also ate the `| --- | --- |` '
        + 'separator, a blank line, or a node row lands here');
      assert(outsideLedger(afterUnstamped) === outsideLedger(beforeBytes),
        'T-DECOY-HALT-CLI (2) ' + label + ': and OUTSIDE the ledger nothing moved at all — which is '
        + 'the section-scoping the strip claims in its own comment. Both marker-shaped stray lines '
        + '(## Design before the ledger, ## Plan Notes after it) are still exactly where their '
        + 'author put them; a whole-document scan, or a strip running to EOF, eats one');
      assert(fs.readdirSync(proj).sort().join(',') === beforeLs,
        'T-DECOY-HALT-CLI (2) ' + label + ': the freeze creates no files in the project dir, '
        + 'got ' + fs.readdirSync(proj).sort().join(','));
    });
  }

  // (3) NEGATIVE — a GENUINE halt is a FROZEN, mid-run plan whose marker write-halt wrote. The
  // mid-run re-freeze (the plan-repair path) must still freeze AND must still carry the marker out
  // the other side. Break this and the fix has disarmed the consent valve it was meant to protect.
  const GENUINE_HALT = cliPlan({ halt: true, frozen: true,
    statuses: { seed: 'complete', 'child-review': 'in_progress' } });
  assert(schemaCli.readDurableConsentHalt(GENUINE_HALT) === true
    && /<!--\s*plan_hash:/.test(GENUINE_HALT) && /in_progress/.test(GENUINE_HALT),
    'T-DECOY-HALT-CLI (3) FIXTURE: the genuine-halt fixture is frozen, mid-run and halted');
  const GENUINE_ACK = realComputePlanHash(GENUINE_HALT);
  const GENUINE_ARMS = [
    ['--freeze --governance-ack', p => [p, '--freeze', '--governance-ack', GENUINE_ACK, '--json']],
    ['--freeze (bare)', p => [p, '--freeze', '--json']],
    ['--freeze --repair', p => [p, '--freeze', '--repair', '--json']],
  ];
  for (const [label, argv] of GENUINE_ARMS) {
    inTempProject(GENUINE_HALT, (planPath) => {
      const v = shellHandoff(VALIDATOR_CLI, argv(planPath));
      const after = fs.readFileSync(planPath, 'utf8');
      assert(v.result === 'in-grammar' && v.frozen === true && v.reason !== 'decoy_consent_halt',
        'T-DECOY-HALT-CLI (3) ' + label + ': a GENUINE halt (frozen + mid-run) still re-freezes — '
        + 'the decoy fence must key on never-frozen, not on the marker alone, got '
        + JSON.stringify({ result: v.result, reason: v.reason, frozen: v.frozen, errors: v.errors }));
      assert(schemaCli.readDurableConsentHalt(after) === true,
        'T-DECOY-HALT-CLI (3) ' + label + ': ...and the halt marker SURVIVES the re-freeze — '
        + 'stripping it would silently clear a consent the user is still owed');
    });
  }

  // (3b) ...and the handoff door is unchanged on the same genuinely-halted plan: it does not fence.
  {
    const written3b = {};
    const r3b = runHandoff({
      planPath: '/fake/kaola-workflow/test-project/workflow-plan.md',
      statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
      project: 'test-project', json: true,
      shell: makeShellStub({
        'kaola-workflow-plan-validator.js:--freeze-checked': {
          exitCode: 0, result: 'in-grammar', decision: 'auto-run', planHash: GENUINE_ACK,
          frozen: false, governance: { decision: 'auto-run', risk: {} }, risk: {},
        },
        'kaola-workflow-plan-validator.js:--freeze': {
          exitCode: 0, result: 'in-grammar', decision: 'auto-run', planHash: GENUINE_ACK,
          frozen: true, resumeOk: true, risk: {},
        },
        'kaola-workflow-roadmap.js:init-issue': { exitCode: 0, created: true },
        'git:add': { exitCode: 0 },
        'kaola-workflow-adaptive-node.js': { exitCode: 0, status: 'mirrored', planHash: GENUINE_ACK,
          dest: '/wt/kaola-workflow/test-project' },
      }),
      computeNextAction: require('./kaola-workflow-next-action').computeNextAction,
      resolveModel: () => 'sonnet',
      readFile: (fpath) => {
        if (fpath.endsWith('workflow-plan.md')) return GENUINE_HALT;
        if (fpath.endsWith('workflow-state.md')) return makeStateContent({ issueNumber: 42 });
        return '';
      },
      writeFile: (fpath, content) => { written3b[fpath] = content; },
      stateMtime: undefined,
    });
    assert(r3b.reason !== 'decoy_consent_halt',
      'T-DECOY-HALT-CLI (3b): the handoff still does NOT fence a genuinely halted FROZEN plan, got '
      + JSON.stringify({ handoff_status: r3b.handoff_status, reason: r3b.reason }));
  }

  // (4) THE TWO DOORS AGREE. Same draft bytes, both entries, one stripped ledger and one advisory
  // token. The handoff performs the strip itself rather than relying on the freeze it shells, so the
  // shell is stubbed to a NON-writing success: whatever the handoff writes is the handoff's own work.
  {
    const written4 = {};
    const PLAN4 = '/fake/kaola-workflow/test-project/workflow-plan.md';
    const handoff4 = runHandoff({
      planPath: PLAN4,
      statePath: '/fake/kaola-workflow/test-project/workflow-state.md',
      project: 'test-project', json: true,
      shell: makeShellStub({
        'kaola-workflow-plan-validator.js:--freeze-checked': {
          exitCode: 0, result: 'in-grammar', decision: 'auto-run', planHash: DRAFT_ACK,
          frozen: false, governance: { decision: 'auto-run', risk: {} }, risk: {},
        },
        'kaola-workflow-plan-validator.js:--freeze': {
          exitCode: 0, result: 'in-grammar', decision: 'auto-run', planHash: DRAFT_ACK,
          frozen: true, resumeOk: true, risk: {},
        },
        'kaola-workflow-roadmap.js:init-issue': { exitCode: 0, created: true },
        'git:add': { exitCode: 0 },
        'kaola-workflow-adaptive-node.js': { exitCode: 0, status: 'mirrored', planHash: DRAFT_ACK,
          dest: '/wt/kaola-workflow/test-project' },
      }),
      computeNextAction: require('./kaola-workflow-next-action').computeNextAction,
      resolveModel: () => 'sonnet',
      readFile: (fpath) => {
        if (fpath.endsWith('workflow-plan.md')) {
          return written4[PLAN4] !== undefined ? written4[PLAN4] : DRAFT_DECOY;
        }
        if (fpath.endsWith('workflow-state.md')) return makeStateContent({ issueNumber: 42 });
        return '';
      },
      writeFile: (fpath, content) => { written4[fpath] = content; },
      stateMtime: undefined,
    });
    const handoffAdvisory = (handoff4.warnings || [])
      .find(w => w && w.warning === 'decoy_consent_halt_stripped');
    assert(handoffAdvisory !== undefined,
      'T-DECOY-HALT-CLI (4): the handoff door reports the strip with the same named advisory the '
      + 'freeze writer uses, got ' + JSON.stringify({ handoff_status: handoff4.handoff_status,
        reason: handoff4.reason, warnings: handoff4.warnings }));
    assert(written4[PLAN4] !== undefined
      && schemaCli.readDurableConsentHalt(written4[PLAN4]) === false,
      'T-DECOY-HALT-CLI (4): ...and it WRITES the stripped draft back rather than leaving the decoy '
      + 'for the run to wedge on, got ' + JSON.stringify(Object.keys(written4)));
    const viaCli = inTempProject(DRAFT_DECOY, (planPath) => {
      const out = shellHandoff(VALIDATOR_CLI, [planPath, '--freeze', '--governance-ack', DRAFT_ACK, '--json']);
      return { out, after: fs.readFileSync(planPath, 'utf8') };
    });
    const cliAdvisory = (viaCli.out.warnings || [])
      .find(w => w && w.warning === 'decoy_consent_halt_stripped');
    assert(cliAdvisory !== undefined && cliAdvisory.detail === handoffAdvisory.detail,
      'T-DECOY-HALT-CLI (4): freezing through adaptive-handoff and freezing through '
      + 'plan-validator --freeze must produce the SAME advisory for the SAME draft — one rule, '
      + 'one wording, and the shared kernel function is what makes that true rather than two copies '
      + 'agreeing by luck. handoff=' + JSON.stringify(handoffAdvisory)
      + ' plan-validator=' + JSON.stringify(cliAdvisory));
    assert(ledgerSlice(written4[PLAN4]) !== null
      && ledgerSlice(written4[PLAN4]) === ledgerSlice(viaCli.after),
      'T-DECOY-HALT-CLI (4): ...and both doors leave the SAME `## Node Ledger` bytes — the strip is '
      + 'the same edit whichever entry performed it (the stamped plan_hash lives outside the ledger, '
      + 'so the sections are directly comparable)');
    for (const [label, detail] of Object.entries(cliAdvisoryDetails)) {
      assert(detail === handoffAdvisory.detail,
        'T-DECOY-HALT-CLI (4): every --freeze arm agrees with the handoff advisory WORDING, not '
        + 'merely its token — one rule, one wording, across three writing arms and two doors. '
        + label + ' gave ' + JSON.stringify(detail) + ', handoff gave '
        + JSON.stringify(handoffAdvisory.detail));
    }
  }

  // (5) THE WINDOW. The handoff DECIDES the strip at Step 0.85 — where the draft is read before any
  // spawn, so the bytes are the operator's own — and APPLIES it at Step 1.7. That split is what lets
  // a hash-neutral repair sit after the governance verdict, and it is legal only because every
  // refuse-gate in between still mutates nothing when it fires. Pins (1)-(4) run the success path
  // exclusively: `written4` is asserted only where the handoff succeeded, so the whole window is
  // unobserved, and moving the write back up to the decision point breaks nothing they can see.
  //
  // Three gates live in that window and are exercised below on the same armed draft. A fourth —
  // Step 0.85's own `plan_hash_mismatch` — cannot co-occur and is deliberately absent: it needs a
  // stored plan_hash, and a stored plan_hash is exactly what makes stripDecoyConsentHalt return
  // null. Real fs throughout, because the acceptance fence is inert without a cacheExists seam.
  {
    const tmpW = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-decoy-window-'));
    const projW = path.join(tmpW, 'kaola-workflow', 'test-project');
    fs.mkdirSync(projW, { recursive: true });
    const planW = path.join(projW, 'workflow-plan.md');
    const stateW = path.join(projW, 'workflow-state.md');
    // issue_number absent → the roadmap stage is skipped, so the positive control stays hermetic.
    fs.writeFileSync(stateW, makeStateContent({ issueNumber: null }));

    // The decoy draft, plus the two surfaces the later gates key on: an `## Acceptance` section for
    // the repair fence and a hardcoded decision id for the preflight.
    const windowDraft = acceptance => DRAFT_DECOY
      .replace('## Node Ledger', '## Acceptance\n\n' + acceptance + '\n\n## Node Ledger')
      + '\n- the docs follow-up node writes decision record D-831-01.\n';
    const ACCEPT_A = 'A1: the strip is decided at Step 0.85 and applied at Step 1.7.';
    const ACCEPT_B = 'A1: actually, freezing is enough.';

    const windowSeams = extra => Object.assign({
      planPath: planW, statePath: stateW, project: 'test-project', json: true,
      computeNextAction: require('./kaola-workflow-next-action').computeNextAction,
      resolveModel: () => 'sonnet',
      readFile: fpath => fs.readFileSync(fpath, 'utf8'),
      cacheExists: fpath => fs.existsSync(fpath),
      writeFile: (fpath, content) => fs.writeFileSync(fpath, content),
      mkdirp: dir => { try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {} },
      stateMtime: undefined,
    }, extra || {});

    const refusingShell5 = makeShellStub({
      'kaola-workflow-plan-validator.js:--freeze-checked': {
        exitCode: 1, result: 'refuse', errors: ['G1: gate missing'],
      },
    });
    const grammarOkShell5 = makeShellStub({
      'kaola-workflow-plan-validator.js:--freeze-checked': {
        exitCode: 0, result: 'in-grammar', decision: 'auto-run', planHash: PLAN_HASH_64,
        frozen: false, governance: { decision: 'auto-run', risk: {} }, risk: {},
      },
      'kaola-workflow-plan-validator.js:--freeze': {
        exitCode: 0, result: 'in-grammar', decision: 'auto-run', planHash: PLAN_HASH_64,
        frozen: true, resumeOk: true, risk: {},
      },
      'kaola-workflow-adaptive-node.js': { exitCode: 0, status: 'mirrored', planHash: PLAN_HASH_64,
        dest: '/wt/kaola-workflow/test-project' },
    });

    function windowGate(label, bytes, seams, firedTheRightGate) {
      fs.writeFileSync(planW, bytes);
      assert(schemaCli.stripDecoyConsentHalt(bytes) !== null,
        'T-DECOY-HALT-CLI (5) ' + label + ' FIXTURE: the strip is ARMED on these exact bytes. '
        + 'Without this, "the marker survived the refusal" is satisfied by a draft that was never '
        + 'eligible for stripping, and the pin below proves nothing');
      const r = runHandoff(seams);
      assert(r.result === 'refuse' && firedTheRightGate(r),
        'T-DECOY-HALT-CLI (5) ' + label + ': the gate under test is the one that actually fired '
        + '(a different refusal would move the window boundary being tested), got '
        + JSON.stringify({ handoff_status: r.handoff_status, reason: r.reason, errors: r.errors }));
      assert(fs.readFileSync(planW, 'utf8') === bytes,
        'T-DECOY-HALT-CLI (5) ' + label + ': workflow-plan.md is BYTE-IDENTICAL after the refusal. '
        + 'The strip is decided before this gate and applied after it, so a refusal in the window '
        + 'must leave the operator the draft they submitted — not a half-repaired one whose next '
        + 'submission then reads as a post-freeze edit');
      assert(schemaCli.readDurableConsentHalt(fs.readFileSync(planW, 'utf8')) === true,
        'T-DECOY-HALT-CLI (5) ' + label + ': ...marker included, read back through the same '
        + 'section-scoped reader the run fences on');
      return r;
    }

    try {
      // Step 1 — the validator refuses. This submission is also the one that anchors ACCEPT_A.
      windowGate('Step 1 validator refuse', windowDraft(ACCEPT_A),
        windowSeams({ shell: refusingShell5 }),
        r => r.handoff_status === 'plan_invalid' && r.reason !== 'acceptance_repair_fenced');

      // Step 0.9 — the `## Acceptance` repair fence, over the anchor the run above recorded.
      windowGate('Step 0.9 acceptance_repair_fenced', windowDraft(ACCEPT_B),
        windowSeams({ shell: refusingShell5 }),
        r => r.reason === 'acceptance_repair_fenced');

      // Step 1.5 — the decision-id preflight. Grammar is fine here; the refusal is the handoff's.
      windowGate('Step 1.5 decision_id_conflict', windowDraft(ACCEPT_A),
        windowSeams({
          shell: grammarOkShell5,
          findDecisionIdHits: () => ({ 'D-831-01': ['docs/decisions/D-831-01-prior.md'] }),
        }),
        r => /decision_id_conflict/.test((r.errors || []).join(' ')));

      // POSITIVE CONTROL — the same draft, the same seams, no gate firing: the strip DOES land on
      // disk. Delete the Step 1.7 write entirely and the three pins above all still pass; this is
      // the one that fails, so the pair says "applied late" rather than merely "not applied".
      fs.writeFileSync(planW, windowDraft(ACCEPT_A));
      const green5 = runHandoff(windowSeams({ shell: grammarOkShell5 }));
      assert(schemaCli.readDurableConsentHalt(fs.readFileSync(planW, 'utf8')) === false,
        'T-DECOY-HALT-CLI (5) POSITIVE CONTROL: with no refuse-gate in the way the SAME draft is '
        + 'stripped on disk, got ' + JSON.stringify({ handoff_status: green5.handoff_status,
          reason: green5.reason, errors: green5.errors }));
      assert((green5.warnings || []).some(w => w && w.warning === 'decoy_consent_halt_stripped'),
        'T-DECOY-HALT-CLI (5) POSITIVE CONTROL: ...and the advisory rides out with it');
    } finally {
      fs.rmSync(tmpW, { recursive: true, force: true });
    }
  }
}

// T-825 (B4): the typed clarification channel.
//
// The planner narrows to a synthesist; when the brief is genuinely under-determined it must have a
// TYPED way to say so instead of guessing or silently widening scope. The new return joins the
// escalate family beside surveyVerdict's backlog_empty / selection_indeterminate:
//
//   { handoff_status: 'clarification_required', result: 'escalate', question, context_refs, round }
//
// Legal pre-claim (nothing written) and post-claim/pre-freeze (claim held, plan unfrozen) — which
// is exactly why the builder and its CLI must touch NO fs at all: they are the one return that can
// fire before a project folder exists.
//
// The channel is BOUNDED at 3 round-trips (owner decision, 2026-07-27). Past the cap the return
// degrades to the stop+ask posture rather than looping: a 4th ask is a design failure, not a
// question. The cap is a module constant so the orchestrator surfaces and the profiles read ONE
// number, and an empty/absent question fails CLOSED to the same posture (a channel that cannot
// name its question cannot be answered).
//
// RED (pre-impl): neither clarificationRequired nor CLARIFICATION_ROUND_CAP is exported, and the
// CLI has no --clarification-required flag (it falls through to the usage/plan_invalid path).
// ---------------------------------------------------------------------------
{
  const handoff825 = require('./kaola-workflow-adaptive-handoff');
  const { spawnSync: spawnS825 } = require('child_process');
  const HANDOFF825 = path.join(__dirname, 'kaola-workflow-adaptive-handoff.js');

  // --- (1) the bound is a NAMED export, not a magic number buried in a branch ---
  assert(handoff825.CLARIFICATION_ROUND_CAP === 3,
    'T-825(1): CLARIFICATION_ROUND_CAP must be the exported constant 3 (owner-settled bound), got '
      + JSON.stringify(handoff825.CLARIFICATION_ROUND_CAP));
  assert(typeof handoff825.clarificationRequired === 'function',
    'T-825(1): clarificationRequired must be exported as a pure verdict builder, got '
      + typeof handoff825.clarificationRequired);

  // --- (2) rounds 1..3 build the typed escalate return ---
  if (typeof handoff825.clarificationRequired === 'function') {
    for (const round of [1, 2, 3]) {
      const v = handoff825.clarificationRequired(
        'Should the fold overwrite an existing .cache/origin/ file or refuse?',
        ['kaola-workflow/.origin/issue-825/survey.md', 'docs/decisions/0014-free-origin.md'],
        round
      );
      assert(v && v.handoff_status === 'clarification_required',
        'T-825(2): round ' + round + ' must build handoff_status:clarification_required, got '
          + JSON.stringify(v && v.handoff_status));
      assert(v && v.result === 'escalate',
        'T-825(2): round ' + round + ' must join the ESCALATE family (never refuse/ready_to_run), got '
          + JSON.stringify(v && v.result));
      assert(v && v.question === 'Should the fold overwrite an existing .cache/origin/ file or refuse?',
        'T-825(2): the question must survive verbatim, got ' + JSON.stringify(v && v.question));
      assert(v && Array.isArray(v.context_refs) && v.context_refs.length === 2
        && v.context_refs[0] === 'kaola-workflow/.origin/issue-825/survey.md',
        'T-825(2): context_refs must be carried as an array of PATHS (evidence, never a conclusion), got '
          + JSON.stringify(v && v.context_refs));
      assert(v && v.round === round,
        'T-825(2): the return must carry its own round so the orchestrator can count, got '
          + JSON.stringify(v && v.round));
    }

    // --- (3) past the cap the channel degrades to stop+ask, it does NOT keep asking ---
    for (const round of [4, 9]) {
      const v = handoff825.clarificationRequired('one more thing?', ['a.md'], round);
      assert(v && v.handoff_status === 'clarification_exhausted',
        'T-825(3): round ' + round + ' (> cap) must degrade to clarification_exhausted, got '
          + JSON.stringify(v && v.handoff_status));
      assert(v && v.result === 'escalate' && v.posture === 'stop_and_ask',
        'T-825(3): the exhausted return must carry the stop+ask posture, got ' + JSON.stringify(v));
      assert(v && v.cap === 3,
        'T-825(3): the exhausted return must name the cap it hit, got ' + JSON.stringify(v && v.cap));
    }

    // --- (4) fail CLOSED: a channel with no question degrades to stop+ask, never a bare ask ---
    for (const bad of ['', '   ', null, undefined]) {
      const v = handoff825.clarificationRequired(bad, ['a.md'], 1);
      assert(v && v.handoff_status === 'clarification_exhausted' && v.posture === 'stop_and_ask',
        'T-825(4): an empty/absent question must fail closed to stop+ask, got ' + JSON.stringify(v));
    }

    // --- (5) an absent/garbage round is treated as round 1 (never as "already exhausted") ---
    {
      const v = handoff825.clarificationRequired('why?', ['a.md']);
      assert(v && v.handoff_status === 'clarification_required' && v.round === 1,
        'T-825(5): an omitted round defaults to 1, got ' + JSON.stringify(v));
    }
  }

  // --- (6) CLI: emits the typed shape, exits non-zero, and writes NOTHING (it is legal PRE-claim,
  // when no project folder exists at all). Mirrors the --survey-verdict fail-closed guarantee.
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-825-clarify-'));
    try {
      const before = fs.readdirSync(tmp);
      const r = spawnS825(process.execPath, [HANDOFF825, '--clarification-required',
        '--question', 'Which of the two candidate bundles does the frontier mean?',
        '--context-refs', 'kaola-workflow/.origin/issue-825/survey.md,kaola-workflow/ROADMAP.md',
        '--round', '2', '--json'], { cwd: tmp, encoding: 'utf8' });
      let out = null; try { out = JSON.parse(String(r.stdout || '').trim().split('\n').pop()); } catch (_) {}
      assert(r.status === 1,
        'T-825(6): the clarification CLI exits 1 (escalate, never ready_to_run), got ' + r.status
          + ' raw=' + String(r.stdout || '') + String(r.stderr || ''));
      assert(out && out.handoff_status === 'clarification_required' && out.result === 'escalate',
        'T-825(6): the CLI emits the typed clarification_required/escalate shape, got ' + JSON.stringify(out));
      assert(out && out.question === 'Which of the two candidate bundles does the frontier mean?',
        'T-825(6): the CLI carries --question verbatim, got ' + JSON.stringify(out && out.question));
      assert(out && Array.isArray(out.context_refs) && out.context_refs.length === 2
        && out.context_refs[1] === 'kaola-workflow/ROADMAP.md',
        'T-825(6): the CLI splits --context-refs into an array, got ' + JSON.stringify(out && out.context_refs));
      assert(out && out.round === 2,
        'T-825(6): the CLI carries --round, got ' + JSON.stringify(out && out.round));
      const after = fs.readdirSync(tmp);
      assert(before.length === 0 && after.length === 0,
        'T-825(6): the clarification CLI writes NO state/plan file (legal pre-claim), got ' + JSON.stringify(after));
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }

  // --- (7) CLI past the cap → clarification_exhausted / stop_and_ask, still zero-write ---
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-825-clarify-cap-'));
    try {
      const r = spawnS825(process.execPath, [HANDOFF825, '--clarification-required',
        '--question', 'a fourth time?', '--round', '4', '--json'], { cwd: tmp, encoding: 'utf8' });
      let out = null; try { out = JSON.parse(String(r.stdout || '').trim().split('\n').pop()); } catch (_) {}
      assert(r.status === 1 && out && out.handoff_status === 'clarification_exhausted'
        && out.posture === 'stop_and_ask',
        'T-825(7): a 4th round on the CLI must emit clarification_exhausted/stop_and_ask, got '
          + JSON.stringify(out) + ' status=' + r.status);
      assert(fs.readdirSync(tmp).length === 0,
        'T-825(7): the exhausted CLI still writes nothing');
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }

  // --- (8) the typed survey verdicts SURVIVE the re-homing. B2 moves the EMITTER to the
  // orchestrator, it does not retire the vocabulary — deleting these would silently drop the
  // backlog_empty / selection_indeterminate valve on the way past.
  assert(Array.isArray(handoff825.SURVEY_VERDICTS)
    && handoff825.SURVEY_VERDICTS.includes('backlog_empty')
    && handoff825.SURVEY_VERDICTS.includes('selection_indeterminate'),
    'T-825(8): SURVEY_VERDICTS must survive the orchestrator re-homing, got '
      + JSON.stringify(handoff825.SURVEY_VERDICTS));
}

// Summary
// ---------------------------------------------------------------------------
if (failed > 0) {
  console.error('adaptive-handoff tests FAILED (' + failed + ' failures, ' + passed + ' passed)');
  process.exitCode = 1;
} else {
  console.log('adaptive-handoff tests passed (' + passed + ' assertions)');
}
