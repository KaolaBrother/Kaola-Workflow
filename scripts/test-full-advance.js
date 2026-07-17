#!/usr/bin/env node
'use strict';

// test-full-advance.js (#457)
// Focused tests for the full-path phase transaction owner kaola-workflow-full-advance.js.
// Hand-rolled assert pattern — no test framework dependency.
//
// THE load-bearing contract: every phase file this script authors must pass the
// REAL repair-state.unresolvedCompliance() gate (the phase-boundary crossing
// blocker). We import the actual parser — a confirmation-biased string fixture
// would hide an unresolved-row regression (the #456 MEDIUM lesson).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, 'kaola-workflow-full-advance.js');
const REPAIR_SCRIPT = path.join(__dirname, 'kaola-workflow-repair-state.js');
const REPO = path.resolve(__dirname, '..');
const repair = require('./kaola-workflow-repair-state.js');
// #689: in-process require of the script itself for the parent-dir-fsync monkey-patch seam (every
// other test in this file spawns the script as a subprocess; this ONE direct require is needed
// because fs.<method> patching is only observable by the production function's OWN `require('fs')`
// binding when both live in the same process).
const { writeFileAtomic, renderReview, reviewComplianceTable } = require('./kaola-workflow-full-advance.js');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; } else { failed++; console.error('FAIL: ' + msg); }
}

// Run the script in a throwaway root; returns { status, json, stdout, stderr }.
function run(root, args, stdin) {
  const opts = { cwd: REPO, encoding: 'utf8', env: { ...process.env } };
  if (stdin !== undefined) opts.input = stdin;
  const res = spawnSync(process.execPath, [SCRIPT, ...args, '--root', root, '--json'], opts);
  let json = null;
  try { json = JSON.parse(res.stdout.trim().split('\n').filter(Boolean).pop()); } catch (_) {}
  return { status: res.status, json, stdout: res.stdout, stderr: res.stderr };
}

function runRepair(root, project) {
  return spawnSync(process.execPath, [REPAIR_SCRIPT, project], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env },
  });
}

function makeProject(project, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-full-'));
  const dir = path.join(root, 'kaola-workflow', project);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files || {})) {
    fs.writeFileSync(path.join(dir, name), content);
  }
  return root;
}
function projFile(root, p, name) { return path.join(root, 'kaola-workflow', p, name); }
function readState(root, p) { return fs.readFileSync(projFile(root, p, 'workflow-state.md'), 'utf8'); }
function evidenceBinding(name) {
  return 'evidence-binding: phase5-' + name + '-1 nonce-' + name + '-1';
}
function writeReviewEvidence(root, reviewer, content) {
  const file = projFile(root, 'issue-1', path.join('.cache', reviewer + '.md'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content === undefined ? [
    evidenceBinding(reviewer),
    'domain_outcome: approved',
    'verdict: pass',
    'findings_blocking: 0',
    'review_summary: no_blocking_findings',
    'review_attestation: full_review_completed',
    'No admitted findings.',
    'No blocking findings remain.',
    'No blocking CRITICAL vulnerabilities remain unresolved.',
    'The blocking concern is no longer unresolved.',
    'review_conclusion: Reviewed all changed files and found no unresolved blocking issues.',
    '',
  ].join('\n') : content);
  return file;
}
function setMtime(file, iso) {
  const when = new Date(iso);
  fs.utimesSync(file, when, when);
}
function codeReviewerCompliance(status) {
  return [{
    requirement: 'code-reviewer',
    status: status || 'subagent-invoked',
    evidence: '.cache/code-reviewer.md',
    binding: evidenceBinding('code-reviewer'),
  }];
}
function reviewCompliance(codeStatus, securityStatus) {
  return [
    ...codeReviewerCompliance(codeStatus),
    {
      requirement: 'security-reviewer',
      status: securityStatus || 'n/a',
      binding: 'n/a',
      skip_reason: 'file-risk scan found no security-sensitive files',
    },
    {
      requirement: 'review-fix executors',
      status: 'n/a',
      binding: 'n/a',
      skip_reason: 'no CRITICAL/HIGH blocking findings',
    },
  ];
}

const SINK_BLOCK = [
  '## Sink',
  'branch: workflow/issue-1',
  'issue_number: 1',
  'sink: merge',
  'run_posture: worktree',
  'worktree_path: /tmp/wt/issue-1',
].join('\n');

// A minimal flat full-path state.
const STATE_WITH_SINK = [
  'phase: 1', 'phase_name: Research', 'step: in_progress', 'workflow_path: full',
  'next_command: /kaola-workflow-phase1 issue-1', 'main_session_role: orchestrator',
  'implementation_owner: orchestrator', 'inline_emergency_fallback_authorized: no',
  '', SINK_BLOCK, '',
].join('\n');

const PHASE4_COMPLETE = [
  '# Phase 4 - Progress: issue-1',
  '',
  '## Tasks',
  '| # | Task | Status | Files | Notes |',
  '|---|------|--------|-------|-------|',
  '| 1 | implement the change | complete | a.js | done |',
  '',
].join('\n');

const PHASE4_INCOMPLETE = PHASE4_COMPLETE.replace('| complete |', '| in_progress |');

const PHASE4_COMPLETE_ALT_HEADER = [
  '# Phase 4 - Progress: issue-1',
  '',
  '## Tasks',
  '| Task | File | Status |',
  '|------|------|--------|',
  '| implement the change | a.js | complete |',
  '',
].join('\n');

// A RICH claim.js-shaped state (the regression fixture: applyStateFields must
// preserve every section, not whitelist-reconstruct).
const CLAIM_SHAPED_STATE = [
  '# Workflow State',
  '',
  '## Project',
  'name: issue-1',
  'goal: do the thing',
  '',
  '## Current Position',
  'phase: 1',
  'phase_name: Research',
  'step: in_progress',
  'workflow_path: full',
  'next_command: /kaola-workflow-phase1 issue-1',
  'main_session_role: orchestrator',
  'implementation_owner: orchestrator',
  'inline_emergency_fallback_authorized: no',
  'runtime: claude',
  'fix_owner: tdd-guide',
  '',
  '## Pending Gates',
  '- none',
  '',
  '## Last Evidence',
  'claim: kaola-workflow/issue-1/.cache/claim.json',
  '',
  '## Last Updated',
  '2026-01-01T00:00:00Z',
  '',
  SINK_BLOCK,
  '',
].join('\n');

const RESEARCH_MD = '# Phase 1 - Research / Discovery: issue-1\n\n## Deliverable\nx\n';

// ---------------------------------------------------------------------------
// T1: orient — derives full_step from phase artifacts present
// ---------------------------------------------------------------------------
{
  const root = makeProject('issue-1', { 'workflow-state.md': STATE_WITH_SINK });
  let o = run(root, ['orient', '--project', 'issue-1']);
  assert(o.json && o.json.result === 'ok', 'T1: orient ok');
  assert(o.json && o.json.full_step === 'research', 'T1: no phase files -> full_step research; got ' + (o.json && o.json.full_step));

  fs.writeFileSync(projFile(root, 'issue-1', 'phase1-research.md'), RESEARCH_MD);
  o = run(root, ['orient', '--project', 'issue-1']);
  assert(o.json && o.json.full_step === 'ideation', 'T1: research present -> full_step ideation; got ' + (o.json && o.json.full_step));
  assert(o.json && o.json.phase_files && o.json.phase_files.research === true, 'T1: orient reports research file present');
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T2: phase1-complete refuses when no state / no research
// ---------------------------------------------------------------------------
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-full-'));
  fs.mkdirSync(path.join(root, 'kaola-workflow', 'issue-1'), { recursive: true });
  const r1 = run(root, ['phase1-complete', '--project', 'issue-1']);
  assert(r1.status === 1 && r1.json && r1.json.reason === 'state_missing', 'T2: phase1-complete refuses state_missing');

  fs.writeFileSync(projFile(root, 'issue-1', 'workflow-state.md'), STATE_WITH_SINK);
  const r2 = run(root, ['phase1-complete', '--project', 'issue-1']);
  assert(r2.status === 1 && r2.json && r2.json.reason === 'research_missing', 'T2: phase1-complete refuses research_missing');
  assert(r2.json && typeof r2.json.operator_hint === 'string' && r2.json.operator_hint.length > 10, 'T2: refusal carries operator_hint');
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T3: phase1-complete checkpoint advances state + preserves Sink
// ---------------------------------------------------------------------------
{
  const root = makeProject('issue-1', { 'workflow-state.md': STATE_WITH_SINK, 'phase1-research.md': RESEARCH_MD });
  const r = run(root, ['phase1-complete', '--project', 'issue-1']);
  assert(r.status === 0 && r.json && r.json.result === 'ok', 'T3: phase1-complete ok');
  const st = readState(root, 'issue-1');
  assert(/^phase: 1$/m.test(st), 'T3: phase stays 1');
  assert(/^step: complete$/m.test(st), 'T3: step -> complete');
  assert(/^next_command: \/kaola-workflow-phase2 issue-1$/m.test(st), 'T3: next_command -> phase2');
  assert(/^next_skill: kaola-workflow-ideation issue-1$/m.test(st), 'T3: next_skill -> ideation');
  assert(st.includes(SINK_BLOCK), 'T3: ## Sink preserved byte-for-byte');
  // idempotent re-run
  const r2 = run(root, ['phase1-complete', '--project', 'issue-1']);
  assert(r2.json && r2.json.idempotent === true, 'T3: phase1-complete idempotent on re-run');
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T4: phase2-finalize authors ideation.md that PASSES the real compliance gate
// ---------------------------------------------------------------------------
{
  const root = makeProject('issue-1', { 'workflow-state.md': STATE_WITH_SINK });
  const packet = {
    approaches_evaluated: '### Option A: Foo\n- Summary: ...\n\n### Option B: Bar\n- Summary: ...',
    selected_approach: 'Option A — it is simplest',
    out_of_scope: 'the moon',
  };
  const r = run(root, ['phase2-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify(packet));
  assert(r.status === 0 && r.json && r.json.result === 'ok', 'T4: phase2-finalize ok');
  const ideation = fs.readFileSync(projFile(root, 'issue-1', 'phase2-ideation.md'), 'utf8');
  assert(/^# Phase 2 - Ideation: issue-1$/m.test(ideation), 'T4: ideation title');
  assert(ideation.includes('Option A — it is simplest'), 'T4: selected approach verbatim');
  // production calls unresolvedCompliance(content, stateContent) — assert the TWO-arg gate
  const unresolved = repair.unresolvedCompliance(ideation, readState(root, 'issue-1'));
  assert(unresolved.length === 0, 'T4: ideation.md passes real two-arg unresolvedCompliance gate; got ' + JSON.stringify(unresolved));
  const st = readState(root, 'issue-1');
  assert(/^phase: 2$/m.test(st) && /^step: complete$/m.test(st), 'T4: state -> phase 2 complete');
  assert(/^next_command: \/kaola-workflow-phase3 issue-1$/m.test(st), 'T4: next_command -> phase3');
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T5: phase3-finalize authors plan.md (Write Set lines) that passes the gate
// ---------------------------------------------------------------------------
{
  const root = makeProject('issue-1', { 'workflow-state.md': STATE_WITH_SINK });
  const packet = {
    blueprint: '### Files to Create\n| File | Purpose | Key Interfaces |\n|------|---------|----------------|\n| a/b.js | ... | ... |',
    task_list: '### Task 1: do thing\n- File: a/b.js\n- Write Set: a/b.js, a/b.test.js\n- Validate: node x.js',
  };
  const r = run(root, ['phase3-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify(packet));
  assert(r.status === 0 && r.json && r.json.result === 'ok', 'T5: phase3-finalize ok');
  const plan = fs.readFileSync(projFile(root, 'issue-1', 'phase3-plan.md'), 'utf8');
  assert(plan.includes('- Write Set: a/b.js, a/b.test.js'), 'T5: Write Set line present (classifier reads this)');
  const unresolved = repair.unresolvedCompliance(plan, readState(root, 'issue-1'));
  assert(unresolved.length === 0, 'T5: plan.md passes real two-arg compliance gate; got ' + JSON.stringify(unresolved));
  const st = readState(root, 'issue-1');
  assert(/^phase: 3$/m.test(st) && /^next_command: \/kaola-workflow-phase4 issue-1$/m.test(st), 'T5: state -> phase 3, next phase4');
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T6: phase5-finalize — valid verdict authors review.md passing the gate; routes finalize
// ---------------------------------------------------------------------------
{
  const root = makeProject('issue-1', { 'workflow-state.md': STATE_WITH_SINK, 'phase4-progress.md': PHASE4_COMPLETE });
  writeReviewEvidence(root, 'code-reviewer');
  const packet = {
    review_status: 'PASSED',
    code_review_findings: '### CRITICAL\nnone\n### HIGH\nnone\n### MEDIUM/LOW\nminor naming',
    validation_evidence: 'node test.js -> pass',
    compliance: reviewCompliance(),
  };
  const r = run(root, ['phase5-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify(packet));
  assert(r.status === 0 && r.json && r.json.result === 'ok', 'T6: phase5-finalize ok');
  const review = fs.readFileSync(projFile(root, 'issue-1', 'phase5-review.md'), 'utf8');
  assert(/^## Review Status$/m.test(review) && review.includes('PASSED'), 'T6: review status rendered');
  const unresolved = repair.unresolvedCompliance(review, readState(root, 'issue-1'));
  assert(unresolved.length === 0, 'T6: review.md passes real two-arg compliance gate; got ' + JSON.stringify(unresolved));
  const st = readState(root, 'issue-1');
  assert(/^phase: 5$/m.test(st) && /^next_command: \/kaola-workflow-finalize issue-1$/m.test(st), 'T6: state -> phase 5, next finalize');
  assert(/^next_skill: kaola-workflow-finalize issue-1$/m.test(st), 'T6: next_skill finalize');
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T7: phase5-finalize rejects an illegal / missing verdict
// ---------------------------------------------------------------------------
{
  const root = makeProject('issue-1', { 'workflow-state.md': STATE_WITH_SINK, 'phase4-progress.md': PHASE4_COMPLETE });
  const bad = run(root, ['phase5-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({ review_status: 'LGTM' }));
  assert(bad.status === 1 && bad.json && bad.json.reason === 'invalid_review_status', 'T7: rejects illegal verdict');
  const missing = run(root, ['phase5-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({}));
  assert(missing.status === 1 && missing.json && missing.json.reason === 'invalid_review_status', 'T7: rejects missing verdict');
  assert(!fs.existsSync(projFile(root, 'issue-1', 'phase5-review.md')), 'T7: no review.md written on refuse');
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T8: orchestrator-supplied compliance is rendered verbatim and must resolve
// ---------------------------------------------------------------------------
{
  const root = makeProject('issue-1', { 'workflow-state.md': STATE_WITH_SINK, 'phase4-progress.md': PHASE4_COMPLETE });
  writeReviewEvidence(root, 'code-reviewer');
  writeReviewEvidence(root, 'security-reviewer');
  const packet = {
    review_status: 'PASSED WITH FOLLOW-UPS',
    compliance: [
      { requirement: 'code-reviewer', status: 'invoked', evidence: '.cache/code-reviewer.md', binding: evidenceBinding('code-reviewer') },
      { requirement: 'security-reviewer', status: 'invoked', evidence: '.cache/security-reviewer.md', binding: evidenceBinding('security-reviewer') },
      { requirement: 'review-fix executors', status: 'n/a', binding: 'n/a', skipReason: 'no CRITICAL/HIGH findings' },
    ],
  };
  const r = run(root, ['phase5-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify(packet));
  assert(r.status === 0 && r.json && r.json.result === 'ok', 'T8: custom-compliance phase5 ok');
  const review = fs.readFileSync(projFile(root, 'issue-1', 'phase5-review.md'), 'utf8');
  assert(review.includes('| security-reviewer | invoked | .cache/security-reviewer.md |'), 'T8: custom security-reviewer row rendered');
  assert(review.includes('no CRITICAL/HIGH findings'), 'T8: skipReason alias mapped into Skip Reason column');
  const unresolved = repair.unresolvedCompliance(review, readState(root, 'issue-1'));
  assert(unresolved.length === 0, 'T8: custom-compliance review passes two-arg gate; got ' + JSON.stringify(unresolved));
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T9: bad_compliance refusal when compliance is not an array
// ---------------------------------------------------------------------------
{
  const root = makeProject('issue-1', { 'workflow-state.md': STATE_WITH_SINK });
  const r = run(root, ['phase2-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({ selected_approach: 'A', compliance: 'planner invoked' }));
  assert(r.status === 1 && r.json && r.json.reason === 'bad_compliance', 'T9: refuses non-array compliance');
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T10: full phase 1->2->3->5 chain preserves a RICH claim.js-shaped state
//      (the #456 T14 regression — applyStateFields must not whitelist-reconstruct)
// ---------------------------------------------------------------------------
{
  const root = makeProject('issue-1', {
    'workflow-state.md': CLAIM_SHAPED_STATE,
    'phase1-research.md': RESEARCH_MD,
    'phase4-progress.md': PHASE4_COMPLETE,
  });
  writeReviewEvidence(root, 'code-reviewer');
  run(root, ['phase1-complete', '--project', 'issue-1']);
  run(root, ['phase2-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({ selected_approach: 'A' }));
  run(root, ['phase3-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({ blueprint: 'bp', task_list: '### Task 1: x\n- Write Set: a/b.js' }));
  run(root, ['phase5-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({
    review_status: 'PASSED',
    compliance: reviewCompliance(),
  }));
  const st = readState(root, 'issue-1');
  for (const section of ['## Project', '## Current Position', '## Pending Gates', '## Last Evidence', '## Last Updated', '## Sink']) {
    assert(st.includes(section), 'T10: rich section preserved through full chain: ' + section);
  }
  assert(/^runtime: claude$/m.test(st), 'T10: runtime field preserved');
  assert(/^fix_owner: tdd-guide$/m.test(st), 'T10: fix_owner field preserved');
  assert(st.includes('claim: kaola-workflow/issue-1/.cache/claim.json'), 'T10: Last Evidence body preserved');
  assert(st.includes(SINK_BLOCK), 'T10: ## Sink preserved byte-for-byte through full chain');
  assert(/^phase: 5$/m.test(st) && /^step: complete$/m.test(st), 'T10: terminal state phase 5 complete');
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T11: idempotent phase2-finalize re-run is a no-op
// ---------------------------------------------------------------------------
{
  const root = makeProject('issue-1', { 'workflow-state.md': STATE_WITH_SINK });
  const packet = JSON.stringify({ selected_approach: 'A', approaches_evaluated: 'x', out_of_scope: 'y' });
  run(root, ['phase2-finalize', '--project', 'issue-1', '--stdin'], packet);
  const r2 = run(root, ['phase2-finalize', '--project', 'issue-1', '--stdin'], packet);
  assert(r2.json && r2.json.idempotent === true, 'T11: identical phase2-finalize re-run is idempotent');
  fs.rmSync(root, { recursive: true, force: true });
}

// T16a: Phase 5 cannot be finalized until the Phase 4 task ledger exists and
// every Tasks row is complete. Both refusals are zero-mutation prerequisites.
{
  const missingRoot = makeProject('issue-1', { 'workflow-state.md': STATE_WITH_SINK });
  const missing = run(missingRoot, ['phase5-finalize', '--project', 'issue-1', '--stdin'],
    JSON.stringify({ review_status: 'PASSED' }));
  assert(missing.status === 1 && missing.json && missing.json.reason === 'progress_missing',
    'T16a: missing phase4-progress.md -> progress_missing refusal');
  assert(!fs.existsSync(projFile(missingRoot, 'issue-1', 'phase5-review.md')), 'T16a: missing progress refusal writes no review file');
  fs.rmSync(missingRoot, { recursive: true, force: true });

  const incompleteRoot = makeProject('issue-1', {
    'workflow-state.md': STATE_WITH_SINK,
    'phase4-progress.md': PHASE4_INCOMPLETE,
  });
  const incomplete = run(incompleteRoot, ['phase5-finalize', '--project', 'issue-1', '--stdin'],
    JSON.stringify({ review_status: 'PASSED' }));
  assert(incomplete.status === 1 && incomplete.json && incomplete.json.reason === 'progress_incomplete',
    'T16a: incomplete Phase 4 Tasks row -> progress_incomplete refusal');
  assert(!fs.existsSync(projFile(incompleteRoot, 'issue-1', 'phase5-review.md')), 'T16a: incomplete progress refusal writes no review file');
  fs.rmSync(incompleteRoot, { recursive: true, force: true });

  const malformedTaskLedgers = [
    {
      name: 'short row missing Status cell',
      content: PHASE4_COMPLETE.replace(
        '| 1 | implement the change | complete | a.js | done |',
        '| 1 | implement the change | complete | a.js | done |\n| 2 | truncated |'),
    },
    {
      name: 'data row missing closing pipe',
      content: PHASE4_COMPLETE.replace(
        '| 1 | implement the change | complete | a.js | done |',
        '| 1 | implement the change | complete | a.js | done |\n| 2 | truncated | complete | a.js | missing close'),
    },
    {
      name: 'data row has extra column',
      content: PHASE4_COMPLETE.replace(
        '| 1 | implement the change | complete | a.js | done |',
        '| 1 | implement the change | complete | a.js | done |\n| 2 | extra | complete | a.js | done | unexpected |'),
    },
    {
      name: 'duplicate Status header columns',
      content: PHASE4_COMPLETE
        .replace('| # | Task | Status | Files | Notes |', '| # | Task | Status | Status | Notes |'),
    },
    {
      name: 'empty task identifier',
      content: PHASE4_COMPLETE.replace(
        '| 1 | implement the change | complete | a.js | done |',
        '|  | implement the change | complete | a.js | done |'),
    },
    {
      name: 'pending row hidden after a blank line',
      content: PHASE4_COMPLETE + '\n| 2 | hidden work | pending | b.js | not done |\n',
    },
    {
      name: 'duplicate Tasks table after a blank line',
      content: PHASE4_COMPLETE + [
        '',
        '| # | Task | Status | Files | Notes |',
        '|---|------|--------|-------|-------|',
        '| 2 | hidden work | pending | b.js | not done |',
        '',
      ].join('\n'),
    },
    {
      name: 'duplicate Tasks section hides a pending row',
      content: PHASE4_COMPLETE + [
        '',
        '## Tasks',
        '| # | Task | Status | Files | Notes |',
        '|---|------|--------|-------|-------|',
        '| 2 | hidden work | pending | b.js | not done |',
        '',
      ].join('\n'),
    },
  ];
  for (const testCase of malformedTaskLedgers) {
    const root = makeProject('issue-1', {
      'workflow-state.md': STATE_WITH_SINK,
      'phase4-progress.md': testCase.content,
    });
    const result = run(root, ['phase5-finalize', '--project', 'issue-1', '--stdin'],
      JSON.stringify({ review_status: 'PASSED' }));
    assert(result.status === 1 && result.json && result.json.reason === 'progress_incomplete',
      'T16a: ' + testCase.name + ' -> progress_incomplete refusal');
    assert(!fs.existsSync(projFile(root, 'issue-1', 'phase5-review.md')),
      'T16a: ' + testCase.name + ' writes no review file');
    fs.rmSync(root, { recursive: true, force: true });
  }

  const alternateHeaderRoot = makeProject('issue-1', {
    'workflow-state.md': STATE_WITH_SINK,
    'phase4-progress.md': PHASE4_COMPLETE_ALT_HEADER,
  });
  writeReviewEvidence(alternateHeaderRoot, 'code-reviewer');
  const alternateHeader = run(alternateHeaderRoot, ['phase5-finalize', '--project', 'issue-1', '--stdin'],
    JSON.stringify({ review_status: 'PASSED', compliance: reviewCompliance(undefined, 'na') }));
  assert(alternateHeader.status === 0 && alternateHeader.json && alternateHeader.json.result === 'ok',
    'T16a: alternate Phase 4 Tasks header locates Status column and finalizes');
  fs.rmSync(alternateHeaderRoot, { recursive: true, force: true });
}

// T16b: named reviewer invocation is a hard prerequisite. Local fallback is
// never a Phase 5 completion status, even when the generic compliance parser
// would otherwise accept it with evidence.
{
  for (const status of ['local-fallback-explicit', 'local-fallback-tool-unavailable']) {
    const root = makeProject('issue-1', {
      'workflow-state.md': STATE_WITH_SINK,
      'phase4-progress.md': PHASE4_COMPLETE,
    });
    const r = run(root, ['phase5-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({
      review_status: 'PASSED',
      compliance: [
        { requirement: 'code-reviewer', status, evidence: '.cache/code-reviewer.md' },
        { requirement: 'security-reviewer', status: 'n/a', skip_reason: 'not security-sensitive' },
      ],
    }));
    assert(r.status === 1 && r.json && r.json.reason === 'reviewer_prerequisite',
      'T16b: code-reviewer status ' + status + ' -> reviewer_prerequisite refusal');
    assert(!fs.existsSync(projFile(root, 'issue-1', 'phase5-review.md')), 'T16b: code-reviewer fallback writes no review file');
    fs.rmSync(root, { recursive: true, force: true });
  }

  const cases = [
    {
      name: 'missing code-reviewer row',
      compliance: [{ requirement: 'security-reviewer', status: 'n/a', skip_reason: 'not security-sensitive' }],
    },
    {
      name: 'code-reviewer evidence missing',
      compliance: [{ requirement: 'code-reviewer', status: 'invoked' }],
    },
    {
      name: 'security-reviewer local fallback',
      compliance: [
        { requirement: 'code-reviewer', status: 'invoked', evidence: '.cache/code-reviewer.md' },
        { requirement: 'security-reviewer', status: 'local-fallback-tool-unavailable', evidence: '.cache/security-reviewer.md' },
      ],
    },
    {
      name: 'security-reviewer evidence missing',
      compliance: [
        { requirement: 'code-reviewer', status: 'invoked', evidence: '.cache/code-reviewer.md' },
        { requirement: 'security-reviewer', status: 'subagent-invoked' },
      ],
    },
  ];
  for (const testCase of cases) {
    const root = makeProject('issue-1', {
      'workflow-state.md': STATE_WITH_SINK,
      'phase4-progress.md': PHASE4_COMPLETE,
    });
    const r = run(root, ['phase5-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({
      review_status: 'PASSED',
      compliance: testCase.compliance,
    }));
    assert(r.status === 1 && r.json && r.json.reason === 'reviewer_prerequisite',
      'T16b: ' + testCase.name + ' -> reviewer_prerequisite refusal');
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// T16c: Phase 5 reviewer compliance is explicit, unique, and bound to a real
// canonical evidence file. Packet text alone cannot claim that a reviewer ran.
{
  const rootWithoutCompliance = makeProject('issue-1', {
    'workflow-state.md': STATE_WITH_SINK,
    'phase4-progress.md': PHASE4_COMPLETE,
  });
  writeReviewEvidence(rootWithoutCompliance, 'code-reviewer');
  const omitted = run(rootWithoutCompliance, ['phase5-finalize', '--project', 'issue-1', '--stdin'],
    JSON.stringify({ review_status: 'PASSED' }));
  assert(omitted.status === 1 && omitted.json && omitted.json.reason === 'reviewer_prerequisite',
    'T16c: omitted compliance array cannot synthesize code-reviewer invocation');
  fs.rmSync(rootWithoutCompliance, { recursive: true, force: true });

  for (const compliance of [[], [
    { requirement: 'code-reviewer', status: 'invoked', evidence: '.cache/code-reviewer.md' },
    { requirement: 'code-reviewer', status: 'subagent-invoked', evidence: '.cache/code-reviewer.md' },
  ]]) {
    const root = makeProject('issue-1', {
      'workflow-state.md': STATE_WITH_SINK,
      'phase4-progress.md': PHASE4_COMPLETE,
    });
    writeReviewEvidence(root, 'code-reviewer');
    const r = run(root, ['phase5-finalize', '--project', 'issue-1', '--stdin'],
      JSON.stringify({ review_status: 'PASSED', compliance }));
    const shape = compliance.length === 0 ? 'zero' : 'duplicate';
    assert(r.status === 1 && r.json && r.json.reason === 'reviewer_prerequisite',
      'T16c: ' + shape + ' code-reviewer rows -> reviewer_prerequisite refusal');
    fs.rmSync(root, { recursive: true, force: true });
  }

  const codeEvidenceCases = [
    { name: 'missing', evidence: () => '.cache/code-reviewer.md', setup: () => {} },
    { name: 'empty', evidence: () => '.cache/code-reviewer.md', setup: root => writeReviewEvidence(root, 'code-reviewer', '') },
    {
      name: 'forged', evidence: () => '.cache/forged.md',
      setup: root => writeReviewEvidence(root, 'forged'),
    },
    {
      name: 'traversal', evidence: () => '../code-reviewer.md',
      setup: root => fs.writeFileSync(projFile(root, 'issue-1', 'code-reviewer.md'), 'forged\n'),
    },
    {
      name: 'absolute', evidence: root => writeReviewEvidence(root, 'code-reviewer'),
      setup: () => {},
    },
    {
      name: 'directory', evidence: () => '.cache/code-reviewer.md',
      setup: root => fs.mkdirSync(projFile(root, 'issue-1', path.join('.cache', 'code-reviewer.md')), { recursive: true }),
    },
    {
      name: 'symlink', evidence: () => '.cache/code-reviewer.md',
      setup: root => {
        const target = path.join(root, 'outside-code-review.md');
        fs.writeFileSync(target, 'forged\n');
        const link = projFile(root, 'issue-1', path.join('.cache', 'code-reviewer.md'));
        fs.mkdirSync(path.dirname(link), { recursive: true });
        fs.symlinkSync(target, link);
      },
    },
  ];
  for (const testCase of codeEvidenceCases) {
    const root = makeProject('issue-1', {
      'workflow-state.md': STATE_WITH_SINK,
      'phase4-progress.md': PHASE4_COMPLETE,
    });
    testCase.setup(root);
    const r = run(root, ['phase5-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({
      review_status: 'PASSED',
      compliance: [{
        requirement: 'code-reviewer', status: 'invoked', evidence: testCase.evidence(root),
      }],
    }));
    const expectedReason = (testCase.name === 'symlink' || testCase.name === 'directory')
      ? 'project_path_unsafe' : 'reviewer_prerequisite';
    assert(r.status === 1 && r.json && r.json.reason === expectedReason,
      'T16c: code-reviewer ' + testCase.name + ' evidence -> ' + expectedReason + ' refusal');
    assert(!fs.existsSync(projFile(root, 'issue-1', 'phase5-review.md')), 'T16c: invalid code-reviewer evidence writes no review file');
    fs.rmSync(root, { recursive: true, force: true });
  }

  const securityEvidenceCases = [
    { name: 'missing', evidence: () => '.cache/security-reviewer.md', setup: () => {} },
    { name: 'empty', evidence: () => '.cache/security-reviewer.md', setup: root => writeReviewEvidence(root, 'security-reviewer', '') },
    {
      name: 'forged', evidence: () => '.cache/security-forged.md',
      setup: root => writeReviewEvidence(root, 'security-forged'),
    },
    {
      name: 'traversal', evidence: () => '../security-reviewer.md',
      setup: root => fs.writeFileSync(projFile(root, 'issue-1', 'security-reviewer.md'), 'forged\n'),
    },
    {
      name: 'absolute', evidence: root => writeReviewEvidence(root, 'security-reviewer'),
      setup: () => {},
    },
    {
      name: 'symlink', evidence: () => '.cache/security-reviewer.md',
      setup: root => {
        const target = path.join(root, 'outside-security-review.md');
        fs.writeFileSync(target, 'forged\n');
        const link = projFile(root, 'issue-1', path.join('.cache', 'security-reviewer.md'));
        fs.mkdirSync(path.dirname(link), { recursive: true });
        fs.symlinkSync(target, link);
      },
    },
  ];
  for (const testCase of securityEvidenceCases) {
    const root = makeProject('issue-1', {
      'workflow-state.md': STATE_WITH_SINK,
      'phase4-progress.md': PHASE4_COMPLETE,
    });
    writeReviewEvidence(root, 'code-reviewer');
    testCase.setup(root);
    const r = run(root, ['phase5-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({
      review_status: 'PASSED',
      compliance: [
        ...codeReviewerCompliance('invoked'),
        { requirement: 'security-reviewer', status: 'invoked', evidence: testCase.evidence(root) },
      ],
    }));
    const expectedReason = testCase.name === 'symlink' ? 'project_path_unsafe' : 'reviewer_prerequisite';
    assert(r.status === 1 && r.json && r.json.reason === expectedReason,
      'T16c: security-reviewer ' + testCase.name + ' evidence -> ' + expectedReason + ' refusal');
    assert(!fs.existsSync(projFile(root, 'issue-1', 'phase5-review.md')), 'T16c: invalid security-reviewer evidence writes no review file');
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// T16e: every durable full-path artifact stays under the lexical and real
// <root>/kaola-workflow/<project> authority. Symlinked project, cache, state,
// progress, and review-fix evidence paths refuse before reads or writes.
{
  const projectLinkRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-full-project-link-'));
  const workflowDir = path.join(projectLinkRoot, 'kaola-workflow');
  const outsideProject = path.join(projectLinkRoot, 'outside-project');
  fs.mkdirSync(workflowDir, { recursive: true });
  fs.mkdirSync(outsideProject, { recursive: true });
  fs.writeFileSync(path.join(outsideProject, 'workflow-state.md'), STATE_WITH_SINK);
  fs.writeFileSync(path.join(outsideProject, 'phase4-progress.md'), PHASE4_COMPLETE);
  fs.symlinkSync(outsideProject, path.join(workflowDir, 'issue-1'));
  const before = fs.readFileSync(path.join(outsideProject, 'workflow-state.md'), 'utf8');
  const linked = run(projectLinkRoot, ['phase5-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({
    review_status: 'PASSED', compliance: reviewCompliance(),
  }));
  assert(linked.status === 1 && linked.json && linked.json.reason === 'project_path_unsafe',
    'T16e: symlinked project directory -> project_path_unsafe');
  assert(!fs.existsSync(path.join(outsideProject, 'phase5-review.md'))
      && fs.readFileSync(path.join(outsideProject, 'workflow-state.md'), 'utf8') === before,
    'T16e: symlinked project refusal causes zero outside mutation');
  fs.rmSync(projectLinkRoot, { recursive: true, force: true });

  const pathCases = [
    {
      name: 'cache directory', target: '.cache', targetKind: 'directory',
      outsideName: 'outside-cache', outsideContent: null,
    },
    {
      name: 'workflow state', target: 'workflow-state.md', targetKind: 'file',
      outsideName: 'outside-state.md', outsideContent: STATE_WITH_SINK,
    },
    {
      name: 'phase4 progress', target: 'phase4-progress.md', targetKind: 'file',
      outsideName: 'outside-progress.md', outsideContent: PHASE4_COMPLETE,
    },
  ];
  for (const testCase of pathCases) {
    const root = makeProject('issue-1', {
      'workflow-state.md': STATE_WITH_SINK,
      'phase4-progress.md': PHASE4_COMPLETE,
    });
    const target = projFile(root, 'issue-1', testCase.target);
    fs.rmSync(target, { recursive: true, force: true });
    const outside = path.join(root, testCase.outsideName);
    if (testCase.targetKind === 'directory') fs.mkdirSync(outside, { recursive: true });
    else fs.writeFileSync(outside, testCase.outsideContent);
    fs.symlinkSync(outside, target);
    const outsideBefore = testCase.targetKind === 'file' ? fs.readFileSync(outside, 'utf8') : null;
    const result = run(root, ['phase5-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({
      review_status: 'PASSED', compliance: reviewCompliance(),
    }));
    assert(result.status === 1 && result.json && result.json.reason === 'project_path_unsafe',
      'T16e: symlinked ' + testCase.name + ' -> project_path_unsafe');
    assert(!fs.existsSync(projFile(root, 'issue-1', 'phase5-review.md')),
      'T16e: symlinked ' + testCase.name + ' writes no review file');
    if (outsideBefore !== null) {
      assert(fs.readFileSync(outside, 'utf8') === outsideBefore,
        'T16e: symlinked ' + testCase.name + ' leaves outside target unchanged');
    }
    fs.rmSync(root, { recursive: true, force: true });
  }

  const fixLinkRoot = makeProject('issue-1', {
    'workflow-state.md': STATE_WITH_SINK,
    'phase4-progress.md': PHASE4_COMPLETE,
  });
  writeReviewEvidence(fixLinkRoot, 'code-reviewer');
  const outsideFix = path.join(fixLinkRoot, 'outside-review-fix.md');
  fs.writeFileSync(outsideFix, 'fix evidence\n');
  fs.symlinkSync(outsideFix, projFile(fixLinkRoot, 'issue-1', path.join('.cache', 'review-fix-1.md')));
  const fixLinked = run(fixLinkRoot, ['phase5-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({
    review_status: 'PASSED', compliance: reviewCompliance(),
  }));
  assert(fixLinked.status === 1 && fixLinked.json && fixLinked.json.reason === 'project_path_unsafe',
    'T16e: symlinked review-fix evidence -> project_path_unsafe');
  assert(fs.readFileSync(outsideFix, 'utf8') === 'fix evidence\n',
    'T16e: symlinked review-fix refusal leaves outside target unchanged');
  fs.rmSync(fixLinkRoot, { recursive: true, force: true });
}

// T16f: reviewer evidence must be from the current Phase 4 run and must be
// newer than every review-fix artifact. A post-review fix therefore forces the
// named reviewers to run again before Phase 5 can finalize.
{
  const oldReviewRoot = makeProject('issue-1', {
    'workflow-state.md': STATE_WITH_SINK,
    'phase4-progress.md': PHASE4_COMPLETE,
  });
  const oldReview = writeReviewEvidence(oldReviewRoot, 'code-reviewer');
  setMtime(oldReview, '2026-01-01T00:00:00.000Z');
  setMtime(projFile(oldReviewRoot, 'issue-1', 'phase4-progress.md'), '2026-01-02T00:00:00.000Z');
  const staleProgress = run(oldReviewRoot, ['phase5-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({
    review_status: 'PASSED', compliance: reviewCompliance(),
  }));
  assert(staleProgress.status === 1 && staleProgress.json && staleProgress.json.reason === 'reviewer_prerequisite',
    'T16f: reviewer evidence older than phase4-progress -> reviewer_prerequisite');
  setMtime(oldReview, '2026-01-02T00:00:00.000Z');
  const equalProgress = run(oldReviewRoot, ['phase5-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({
    review_status: 'PASSED', compliance: reviewCompliance(),
  }));
  assert(equalProgress.status === 1 && equalProgress.json && equalProgress.json.reason === 'reviewer_prerequisite',
    'T16f: reviewer evidence with equal mtime is not newer than phase4-progress');
  fs.rmSync(oldReviewRoot, { recursive: true, force: true });

  const staleFixRoot = makeProject('issue-1', {
    'workflow-state.md': STATE_WITH_SINK,
    'phase4-progress.md': PHASE4_COMPLETE,
  });
  const staleFix = projFile(staleFixRoot, 'issue-1', path.join('.cache', 'review-fix-1.md'));
  fs.mkdirSync(path.dirname(staleFix), { recursive: true });
  fs.writeFileSync(staleFix, evidenceBinding('review-fix-1')
    + '\nRED: prior run failed\nGREEN: prior run passed\nFix applied.\n');
  const freshReviewer = writeReviewEvidence(staleFixRoot, 'code-reviewer');
  setMtime(staleFix, '2026-01-01T00:00:00.000Z');
  setMtime(projFile(staleFixRoot, 'issue-1', 'phase4-progress.md'), '2026-01-02T00:00:00.000Z');
  setMtime(freshReviewer, '2026-01-03T00:00:00.000Z');
  const staleFixResult = run(staleFixRoot, ['phase5-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({
    review_status: 'PASSED',
    compliance: [
      ...reviewCompliance().slice(0, 2),
      { requirement: 'review-fix executors', status: 'invoked', evidence: '.cache/review-fix-1.md', binding: evidenceBinding('review-fix-1') },
    ],
  }));
  assert(staleFixResult.status === 1 && staleFixResult.json && staleFixResult.json.reason === 'reviewer_prerequisite',
    'T16f: fix evidence older than phase4-progress cannot be reused with a fresh reviewer receipt');
  assert(!fs.existsSync(projFile(staleFixRoot, 'issue-1', 'phase5-review.md')),
    'T16f: stale prior-run fix evidence writes no review file');
  setMtime(staleFix, '2026-01-02T00:00:00.000Z');
  const equalFixProgress = run(staleFixRoot, ['phase5-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({
    review_status: 'PASSED',
    compliance: [
      ...reviewCompliance().slice(0, 2),
      { requirement: 'review-fix executors', status: 'invoked', evidence: '.cache/review-fix-1.md', binding: evidenceBinding('review-fix-1') },
    ],
  }));
  assert(equalFixProgress.status === 1 && equalFixProgress.json && equalFixProgress.json.reason === 'reviewer_prerequisite',
    'T16f: fix evidence with equal mtime is not newer than phase4-progress');
  fs.rmSync(staleFixRoot, { recursive: true, force: true });

  const postFixRoot = makeProject('issue-1', {
    'workflow-state.md': STATE_WITH_SINK,
    'phase4-progress.md': PHASE4_COMPLETE,
  });
  const codeEvidence = writeReviewEvidence(postFixRoot, 'code-reviewer');
  const securityEvidence = writeReviewEvidence(postFixRoot, 'security-reviewer');
  const fixEvidence = projFile(postFixRoot, 'issue-1', path.join('.cache', 'review-fix-1.md'));
  fs.writeFileSync(fixEvidence, evidenceBinding('review-fix-1')
    + '\nRED: failing regression before fix\nGREEN: regression passes after fix\nFix applied.\n');
  setMtime(projFile(postFixRoot, 'issue-1', 'phase4-progress.md'), '2026-01-01T00:00:00.000Z');
  setMtime(codeEvidence, '2026-01-02T00:00:00.000Z');
  setMtime(securityEvidence, '2026-01-02T00:00:00.000Z');
  setMtime(fixEvidence, '2026-01-03T00:00:00.000Z');
  let postFix = run(postFixRoot, ['phase5-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({
    review_status: 'PASSED',
    compliance: [
      ...codeReviewerCompliance('invoked'),
      { requirement: 'security-reviewer', status: 'invoked', evidence: '.cache/security-reviewer.md', binding: evidenceBinding('security-reviewer') },
      { requirement: 'review-fix executors', status: 'invoked', evidence: '.cache/review-fix-1.md', binding: evidenceBinding('review-fix-1') },
    ],
  }));
  assert(postFix.status === 1 && postFix.json && postFix.json.reason === 'reviewer_prerequisite',
    'T16f: post-review fix artifact makes prior reviewer evidence stale');
  setMtime(codeEvidence, '2026-01-03T00:00:00.000Z');
  setMtime(securityEvidence, '2026-01-03T00:00:00.000Z');
  postFix = run(postFixRoot, ['phase5-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({
    review_status: 'PASSED',
    compliance: [
      ...codeReviewerCompliance('invoked'),
      { requirement: 'security-reviewer', status: 'invoked', evidence: '.cache/security-reviewer.md', binding: evidenceBinding('security-reviewer') },
      { requirement: 'review-fix executors', status: 'invoked', evidence: '.cache/review-fix-1.md', binding: evidenceBinding('review-fix-1') },
    ],
  }));
  assert(postFix.status === 1 && postFix.json && postFix.json.reason === 'reviewer_prerequisite',
    'T16f: reviewer evidence with equal mtime is not newer than the newest fix artifact');
  setMtime(codeEvidence, '2026-01-04T00:00:00.000Z');
  setMtime(securityEvidence, '2026-01-04T00:00:00.000Z');
  postFix = run(postFixRoot, ['phase5-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({
    review_status: 'PASSED',
    compliance: [
      ...codeReviewerCompliance('invoked'),
      { requirement: 'security-reviewer', status: 'invoked', evidence: '.cache/security-reviewer.md', binding: evidenceBinding('security-reviewer') },
      { requirement: 'review-fix executors', status: 'invoked', evidence: '.cache/review-fix-1.md', binding: evidenceBinding('review-fix-1') },
    ],
  }));
  assert(postFix.status === 0 && postFix.json && postFix.json.result === 'ok',
    'T16f: reviewers rerun after newest fix artifact can finalize');
  fs.rmSync(postFixRoot, { recursive: true, force: true });
}

// T16g: compliance cells are one Markdown cell each, and freeform review text
// cannot forge an earlier reserved compliance section. The file reparses to the
// exact normalized row set and unresolved real rows remain blocking.
{
  const cellRoot = makeProject('issue-1', {
    'workflow-state.md': STATE_WITH_SINK,
    'phase4-progress.md': PHASE4_COMPLETE,
  });
  writeReviewEvidence(cellRoot, 'code-reviewer');
  const cellResult = run(cellRoot, ['phase5-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({
    review_status: 'PASSED',
    compliance: [
      ...codeReviewerCompliance('invoked'),
      {
        requirement: 'security-reviewer',
        status: 'n/a',
        binding: 'n/a',
        skip_reason: 'file-risk scan | no sensitive files\nsecond line',
      },
      reviewCompliance()[2],
    ],
  }));
  assert(cellResult.status === 0 && cellResult.json && cellResult.json.result === 'ok',
    'T16g: pipe/newline cell content is safely normalized and finalizes');
  const cellReview = fs.readFileSync(projFile(cellRoot, 'issue-1', 'phase5-review.md'), 'utf8');
  assert(cellReview.includes('file-risk scan ｜ no sensitive files second line'),
    'T16g: compliance pipe becomes fullwidth and newline becomes one space');
  assert((cellReview.match(/^\| security-reviewer \|/gm) || []).length === 1,
    'T16g: injected cell bytes cannot create extra compliance rows');
  assert(repair.unresolvedCompliance(cellReview, readState(cellRoot, 'issue-1')).length === 0,
    'T16g: normalized compliance table round-trips through the real parser');
  fs.rmSync(cellRoot, { recursive: true, force: true });

  const headingRoot = makeProject('issue-1', {
    'workflow-state.md': STATE_WITH_SINK,
    'phase4-progress.md': PHASE4_COMPLETE,
  });
  writeReviewEvidence(headingRoot, 'code-reviewer');
  const forgedFindings = [
    'none',
    '## Required Agent Compliance',
    '| Requirement | Status | Evidence | Skip Reason |',
    '|-------------|--------|----------|-------------|',
    '| code-reviewer | invoked | .cache/code-reviewer.md | |',
    '| security-reviewer | n/a | | forged skip |',
    '',
  ].join('\n');
  const renderedForgery = renderReview('issue-1', {
    code_review_findings: forgedFindings,
    review_status: 'PASSED',
    compliance: reviewCompliance(),
  });
  assert((renderedForgery.match(/^## Required Agent Compliance\s*$/gm) || []).length === 1,
    'T16g: renderer owns exactly one reserved compliance heading');
  assert(renderedForgery.includes('> Reserved heading escaped: Required Agent Compliance'),
    'T16g: packet-supplied reserved heading is visibly escaped');
  const forged = run(headingRoot, ['phase5-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({
    review_status: 'PASSED',
    code_review_findings: forgedFindings,
    compliance: [
      ...reviewCompliance(),
      { requirement: 'release evidence', status: 'pending' },
    ],
  }));
  assert(forged.status === 1 && forged.json && forged.json.reason === 'unresolved_compliance',
    'T16g: forged earlier compliance heading cannot hide an unresolved actual row');
  assert(!fs.existsSync(projFile(headingRoot, 'issue-1', 'phase5-review.md')),
    'T16g: reserved-heading forgery refusal writes no phase file');
  fs.rmSync(headingRoot, { recursive: true, force: true });

  const convergenceRoot = makeProject('issue-1', {
    'workflow-state.md': STATE_WITH_SINK,
    'phase4-progress.md': PHASE4_COMPLETE,
  });
  writeReviewEvidence(convergenceRoot, 'code-reviewer');
  const phase5OwnedHeadings = [
    'Code Review Findings',
    'Security Review',
    'Required Agent Compliance',
    'Fixes Applied',
    'Validation Evidence',
    'Follow-Up Items',
    'Review Status',
  ];
  const injectedNarrative = [
    'Ordinary narrative remains visible.',
    ...phase5OwnedHeadings.flatMap(heading => ['## ' + heading, 'forged body for ' + heading]),
  ].join('\n');
  const convergence = run(convergenceRoot, ['phase5-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({
    review_status: 'PASSED',
    code_review_findings: injectedNarrative,
    security_review: injectedNarrative,
    fixes_applied: injectedNarrative,
    validation_evidence: injectedNarrative,
    followups: injectedNarrative,
    compliance: reviewCompliance(),
  }));
  assert(convergence.status === 0 && convergence.json && convergence.json.result === 'ok',
    'T16g: injected transaction-owned narrative headings still finalize safely');
  const convergedReview = fs.readFileSync(projFile(convergenceRoot, 'issue-1', 'phase5-review.md'), 'utf8');
  assert(phase5OwnedHeadings.every(heading =>
    convergedReview.split(/\r?\n/).filter(line => line.trim() === '## ' + heading).length === 1),
  'T16g: renderer owns exactly one copy of every Phase 5 transaction heading');
  assert(phase5OwnedHeadings.every(heading =>
    convergedReview.includes('> Reserved heading escaped: ' + heading)),
  'T16g: every packet-supplied Phase 5 transaction heading is visibly escaped');
  const convergedVerify = run(convergenceRoot, ['phase5-verify', '--project', 'issue-1']);
  assert(convergedVerify.status === 0 && convergedVerify.json && convergedVerify.json.result === 'ok',
    'T16g: phase5-finalize output with injected headings immediately passes phase5-verify');
  fs.rmSync(convergenceRoot, { recursive: true, force: true });
}

// T16h: the review/fix decision is explicit and unique. Fix execution requires
// canonical nonempty review-fix evidence; N/A is valid only when there are no
// fix artifacts and the reason states that no blocking findings exist.
{
  const invalidDecisions = [
    {
      name: 'missing review-fix decision',
      compliance: reviewCompliance().slice(0, 2),
    },
    {
      name: 'duplicate review-fix decisions',
      compliance: [
        ...reviewCompliance(),
        { requirement: 'review-fix executors', status: 'n/a', skip_reason: 'no blocking findings' },
      ],
    },
    {
      name: 'n/a without reason',
      compliance: [
        ...reviewCompliance().slice(0, 2),
        { requirement: 'review-fix executors', status: 'n/a' },
      ],
    },
    {
      name: 'n/a with unrelated reason',
      compliance: [
        ...reviewCompliance().slice(0, 2),
        { requirement: 'review-fix executors', status: 'n/a', skip_reason: 'not needed' },
      ],
    },
    {
      name: 'n/a with contradictory blocker text',
      compliance: [
        ...reviewCompliance().slice(0, 2),
        { requirement: 'review-fix executors', status: 'n/a', binding: 'n/a', skip_reason: 'no fixes completed; critical findings remain' },
      ],
    },
    {
      name: 'invoked with noncanonical evidence',
      compliance: [
        ...reviewCompliance().slice(0, 2),
        { requirement: 'review-fix executors', status: 'invoked', evidence: '.cache/fix.md' },
      ],
    },
  ];
  for (const testCase of invalidDecisions) {
    const root = makeProject('issue-1', {
      'workflow-state.md': STATE_WITH_SINK,
      'phase4-progress.md': PHASE4_COMPLETE,
    });
    writeReviewEvidence(root, 'code-reviewer');
    const result = run(root, ['phase5-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({
      review_status: 'PASSED', compliance: testCase.compliance,
    }));
    assert(result.status === 1 && result.json && result.json.reason === 'reviewer_prerequisite',
      'T16h: ' + testCase.name + ' -> reviewer_prerequisite');
    assert(!fs.existsSync(projFile(root, 'issue-1', 'phase5-review.md')),
      'T16h: ' + testCase.name + ' writes no phase file');
    fs.rmSync(root, { recursive: true, force: true });
  }

  for (const testCase of [
    { name: 'missing evidence file', content: null },
    { name: 'empty evidence file', content: '' },
  ]) {
    const root = makeProject('issue-1', {
      'workflow-state.md': STATE_WITH_SINK,
      'phase4-progress.md': PHASE4_COMPLETE,
    });
    writeReviewEvidence(root, 'code-reviewer');
    if (testCase.content !== null) {
      fs.writeFileSync(projFile(root, 'issue-1', path.join('.cache', 'review-fix-1.md')), testCase.content);
    }
    const result = run(root, ['phase5-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({
      review_status: 'PASSED',
      compliance: [
        ...reviewCompliance().slice(0, 2),
        { requirement: 'review-fix executors', status: 'invoked', evidence: '.cache/review-fix-1.md' },
      ],
    }));
    assert(result.status === 1 && result.json && result.json.reason === 'reviewer_prerequisite',
      'T16h: invoked fix with ' + testCase.name + ' -> reviewer_prerequisite');
    fs.rmSync(root, { recursive: true, force: true });
  }

  for (const testCase of [
    { name: 'review-fix-foo.md' },
    { name: 'review-fix-01.md' },
    { name: 'review-fix-.md' },
    { name: 'review-fix-1.txt' },
    { name: 'review-fix-2.md.bak' },
    { name: 'review-fix-garbage' },
    { name: 'review-fix-linked', symlink: true },
  ]) {
    const noncanonicalName = testCase.name;
    const root = makeProject('issue-1', {
      'workflow-state.md': STATE_WITH_SINK,
      'phase4-progress.md': PHASE4_COMPLETE,
    });
    const cache = projFile(root, 'issue-1', '.cache');
    fs.mkdirSync(cache, { recursive: true });
    fs.writeFileSync(path.join(cache, 'review-fix-1.md'), evidenceBinding('review-fix-1')
      + '\nRED: failed one\nGREEN: passed one\nFix one applied.\n');
    if (testCase.symlink) {
      const outside = path.join(root, 'outside-noncanonical-review-fix.md');
      fs.writeFileSync(outside, 'noncanonical fix artifact\n');
      fs.symlinkSync(outside, path.join(cache, noncanonicalName));
    } else {
      fs.writeFileSync(path.join(cache, noncanonicalName), 'noncanonical fix artifact\n');
    }
    const reviewer = writeReviewEvidence(root, 'code-reviewer');
    setMtime(projFile(root, 'issue-1', 'phase4-progress.md'), '2026-01-01T00:00:00.000Z');
    setMtime(path.join(cache, 'review-fix-1.md'), '2026-01-02T00:00:00.000Z');
    if (!testCase.symlink) setMtime(path.join(cache, noncanonicalName), '2026-01-02T00:00:00.000Z');
    setMtime(reviewer, '2026-01-03T00:00:00.000Z');
    const result = run(root, ['phase5-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({
      review_status: 'PASSED',
      compliance: [
        ...reviewCompliance().slice(0, 2),
        {
          requirement: 'review-fix executors', status: 'subagent-invoked',
          evidence: '.cache/review-fix-1.md', binding: evidenceBinding('review-fix-1'),
        },
      ],
    }));
    assert(result.status === 1 && result.json && result.json.reason === 'project_path_unsafe',
      'T16h: invoked decision rejects coexisting noncanonical artifact ' + noncanonicalName);
    fs.rmSync(root, { recursive: true, force: true });
  }

  const contradictoryRoot = makeProject('issue-1', {
    'workflow-state.md': STATE_WITH_SINK,
    'phase4-progress.md': PHASE4_COMPLETE,
  });
  fs.mkdirSync(projFile(contradictoryRoot, 'issue-1', '.cache'), { recursive: true });
  fs.writeFileSync(projFile(contradictoryRoot, 'issue-1', path.join('.cache', 'review-fix-1.md')), 'fixed\n');
  writeReviewEvidence(contradictoryRoot, 'code-reviewer');
  const contradictory = run(contradictoryRoot, ['phase5-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({
    review_status: 'PASSED', compliance: reviewCompliance(),
  }));
  assert(contradictory.status === 1 && contradictory.json && contradictory.json.reason === 'reviewer_prerequisite',
    'T16h: N/A fix decision contradicting an existing fix artifact refuses');
  fs.rmSync(contradictoryRoot, { recursive: true, force: true });

  const invokedRoot = makeProject('issue-1', {
    'workflow-state.md': STATE_WITH_SINK,
    'phase4-progress.md': PHASE4_COMPLETE,
  });
  fs.mkdirSync(projFile(invokedRoot, 'issue-1', '.cache'), { recursive: true });
  fs.writeFileSync(projFile(invokedRoot, 'issue-1', path.join('.cache', 'review-fix-2.md')),
    evidenceBinding('review-fix-2')
      + '\nRED: failing HIGH regression before fix\nGREEN: HIGH regression passes after fix\nFix applied.\n');
  writeReviewEvidence(invokedRoot, 'code-reviewer');
  const invoked = run(invokedRoot, ['phase5-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({
    review_status: 'PASSED',
    compliance: [
      ...reviewCompliance().slice(0, 2),
      { requirement: 'review-fix executors', status: 'subagent-invoked', evidence: '.cache/review-fix-2.md', binding: evidenceBinding('review-fix-2') },
    ],
  }));
  assert(invoked.status === 0 && invoked.json && invoked.json.result === 'ok',
    'T16h: canonical nonempty invoked review-fix decision finalizes after reviewer rerun');
  const invokedReview = fs.readFileSync(projFile(invokedRoot, 'issue-1', 'phase5-review.md'), 'utf8');
  assert(invokedReview.includes('| review-fix executors | subagent-invoked | .cache/review-fix-2.md |'),
    'T16h: invoked review-fix decision is rendered in canonical compliance table');
  for (const fallbackStatus of ['local-fallback-explicit', 'local-fallback-tool-unavailable']) {
    const fallback = run(invokedRoot, ['phase5-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({
      review_status: 'PASSED',
      compliance: [
        ...reviewCompliance().slice(0, 2),
        { requirement: 'review-fix executors', status: fallbackStatus, evidence: '.cache/review-fix-2.md', binding: evidenceBinding('review-fix-2') },
      ],
    }));
    assert(fallback.status === 0 && fallback.json && fallback.json.result === 'ok',
      'T16h: documented fix-executor status ' + fallbackStatus + ' remains accepted with canonical evidence');
  }
  fs.rmSync(invokedRoot, { recursive: true, force: true });

  for (const testCase of [
    { name: 'second fix is seed-only', second: evidenceBinding('review-fix-2') + '\n', evidenceCount: 2 },
    { name: 'second fix has a foreign binding', second: 'evidence-binding: foreign nonce-foreign\nRED: failed\nGREEN: passed\n', evidenceCount: 2 },
    { name: 'second fix omitted from decision', second: evidenceBinding('review-fix-2') + '\nRED: failed\nGREEN: passed\nFix applied.\n', evidenceCount: 1 },
  ]) {
    const root = makeProject('issue-1', {
      'workflow-state.md': STATE_WITH_SINK,
      'phase4-progress.md': PHASE4_COMPLETE,
    });
    const cache = projFile(root, 'issue-1', '.cache');
    fs.mkdirSync(cache, { recursive: true });
    fs.writeFileSync(path.join(cache, 'review-fix-1.md'), evidenceBinding('review-fix-1')
      + '\nRED: failed one\nGREEN: passed one\nFix one applied.\n');
    fs.writeFileSync(path.join(cache, 'review-fix-2.md'), testCase.second);
    writeReviewEvidence(root, 'code-reviewer');
    const evidence = ['.cache/review-fix-1.md', '.cache/review-fix-2.md'].slice(0, testCase.evidenceCount).join(', ');
    const binding = [evidenceBinding('review-fix-1'), evidenceBinding('review-fix-2')].slice(0, testCase.evidenceCount).join(', ');
    const result = run(root, ['phase5-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({
      review_status: 'PASSED',
      compliance: [
        ...reviewCompliance().slice(0, 2),
        { requirement: 'review-fix executors', status: 'subagent-invoked', evidence, binding },
      ],
    }));
    assert(result.status === 1 && result.json && result.json.reason === 'reviewer_prerequisite'
        && /enumerate every numeric fix artifact/.test(result.json.detail || ''),
      'T16h: multi-fix decision rejects ' + testCase.name);
    fs.rmSync(root, { recursive: true, force: true });
  }

  const multiRoot = makeProject('issue-1', {
    'workflow-state.md': STATE_WITH_SINK,
    'phase4-progress.md': PHASE4_COMPLETE,
  });
  const multiCache = projFile(multiRoot, 'issue-1', '.cache');
  fs.mkdirSync(multiCache, { recursive: true });
  for (const name of ['review-fix-1', 'review-fix-2']) {
    fs.writeFileSync(path.join(multiCache, name + '.md'), evidenceBinding(name)
      + '\nRED: failed before ' + name + '\nGREEN: passed after ' + name + '\nFix applied.\n');
  }
  writeReviewEvidence(multiRoot, 'code-reviewer');
  const multi = run(multiRoot, ['phase5-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({
    review_status: 'PASSED',
    compliance: [
      ...reviewCompliance().slice(0, 2),
      {
        requirement: 'review-fix executors', status: 'subagent-invoked',
        evidence: '.cache/review-fix-1.md, .cache/review-fix-2.md',
        binding: evidenceBinding('review-fix-1') + ', ' + evidenceBinding('review-fix-2'),
      },
    ],
  }));
  assert(multi.status === 0 && multi.json && multi.json.result === 'ok',
    'T16h: one ordered fix decision enumerating every valid numeric fix artifact passes');
  fs.rmSync(multiRoot, { recursive: true, force: true });
}

// T16d: the compliance packet must carry exactly one explicit security risk
// decision. Inactive security review is allowed only as exact n/a/na with a
// documented file-risk skip reason.
{
  const securityShapeCases = [
    {
      name: 'zero security-reviewer rows',
      compliance: codeReviewerCompliance('invoked'),
    },
    {
      name: 'duplicate security-reviewer rows',
      compliance: [
        ...codeReviewerCompliance('invoked'),
        { requirement: 'security-reviewer', status: 'n/a', skip_reason: 'risk scan A' },
        { requirement: 'security-reviewer', status: 'na', skip_reason: 'risk scan B' },
      ],
    },
    {
      name: 'n/a without skip reason',
      compliance: [
        ...codeReviewerCompliance('invoked'),
        { requirement: 'security-reviewer', status: 'n/a' },
      ],
    },
    {
      name: 'na without skip reason',
      compliance: [
        ...codeReviewerCompliance('invoked'),
        { requirement: 'security-reviewer', status: 'na' },
      ],
    },
  ];
  for (const testCase of securityShapeCases) {
    const root = makeProject('issue-1', {
      'workflow-state.md': STATE_WITH_SINK,
      'phase4-progress.md': PHASE4_COMPLETE,
    });
    writeReviewEvidence(root, 'code-reviewer');
    const r = run(root, ['phase5-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({
      review_status: 'PASSED',
      compliance: testCase.compliance,
    }));
    assert(r.status === 1 && r.json && r.json.reason === 'reviewer_prerequisite',
      'T16d: ' + testCase.name + ' -> reviewer_prerequisite refusal');
    assert(!fs.existsSync(projFile(root, 'issue-1', 'phase5-review.md')), 'T16d: invalid security decision writes no review file');
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// T16i: Finalization is a point-of-use gate, not a trust of the presence of a
// pre-existing phase5-review.md. The read-only verifier must accept only the
// canonical persisted review table whose exact evidence bindings still match
// substantive, fresh role-authored evidence.
{
  const root = makeProject('issue-1', {
    'workflow-state.md': STATE_WITH_SINK,
    'phase4-progress.md': PHASE4_COMPLETE,
  });
  const codeBinding = 'evidence-binding: phase5-code-review-1 nonce-code-1';
  const approvalRows = [
    'domain_outcome: approved',
    'verdict: pass',
    'findings_blocking: 0',
    'review_summary: no_blocking_findings',
    'review_attestation: full_review_completed',
  ];
  const reviewConclusion = 'review_conclusion: Reviewed all changed files and found no unresolved blocking issues.';
  const evidenceText = (binding, rows, extras, conclusion = reviewConclusion, trailing) => [
    binding,
    ...(rows || approvalRows),
    ...(extras || []),
    ...(conclusion === null ? [] : [conclusion]),
    ...(trailing || []),
    '',
  ].join('\n');
  const invalidBodyCases = [
    { name: 'approval receipt missing canonical summary', rows: [...approvalRows.slice(0, 3), approvalRows[4]] },
    { name: 'wrong canonical summary value', rows: [...approvalRows.slice(0, 3), 'review_summary: blocking_findings_present', approvalRows[4]] },
    { name: 'duplicate canonical summary', rows: [...approvalRows, 'review_summary: no_blocking_findings'] },
    { name: 'indented canonical summary', rows: [...approvalRows.slice(0, 3), ' review_summary: no_blocking_findings', approvalRows[4]] },
    { name: 'case-shifted canonical summary', rows: [...approvalRows.slice(0, 3), 'REVIEW_SUMMARY: no_blocking_findings', approvalRows[4]] },
    { name: 'approval receipt missing review attestation', rows: approvalRows.slice(0, 4) },
    { name: 'wrong review attestation value', rows: [...approvalRows.slice(0, 4), 'review_attestation: partial_review'] },
    { name: 'duplicate review attestation', rows: [...approvalRows, 'review_attestation: full_review_completed'] },
    { name: 'indented review attestation', rows: [...approvalRows.slice(0, 4), ' review_attestation: full_review_completed'] },
    { name: 'case-shifted review attestation', rows: [...approvalRows.slice(0, 4), 'REVIEW_ATTESTATION: full_review_completed'] },
    { name: 'zero-width-obfuscated contradictory outcome', rows: approvalRows, extras: ['domain_outcome\u200B: changes_requested'] },
    { name: 'zero-width-obfuscated blocking finding', rows: approvalRows, extras: ['finding\u200B: scope=in_scope action=fix status=open severity=critical'] },
    { name: 'combining-mark-obfuscated blocking finding', rows: approvalRows, extras: ['findi\u0301ng: scope=in_scope action=fix status=open severity=critical'] },
    { name: 'full-width-obfuscated blocking finding', rows: approvalRows, extras: ['ｆｉｎｄｉｎｇ： scope=in_scope action=fix status=open severity=critical'] },
    { name: 'Cyrillic-letter-obfuscated blocking finding', rows: approvalRows, extras: ['fіnding: scope=in_scope action=fix status=open severity=critical'] },
    { name: 'Cyrillic-letter-obfuscated contradictory outcome', rows: approvalRows, extras: ['dоmain_outcome: changes_requested'] },
    { name: 'ratio-colon-obfuscated blocking finding', rows: approvalRows, extras: ['finding∶ scope=in_scope action=fix status=open severity=critical'] },
    { name: 'modifier-colon-obfuscated blocking finding', rows: approvalRows, extras: ['finding꞉ scope=in_scope action=fix status=open severity=critical'] },
    { name: 'length-mark-colon-obfuscated blocking finding', rows: approvalRows, extras: ['findingː scope=in_scope action=fix status=open severity=critical'] },
    { name: 'dotless-letter-obfuscated blocking finding', rows: approvalRows, extras: ['fınding: scope=in_scope action=fix status=open severity=critical'] },
    { name: 'Greek-letter-obfuscated contradictory outcome', rows: approvalRows, extras: ['dοmain_outcome: changes_requested'] },
    { name: 'Cyrillic-letter-obfuscated contradictory verdict', rows: approvalRows, extras: ['verԁict: fail'] },
    { name: 'ratio-colon-obfuscated contradictory outcome', rows: approvalRows, extras: ['domain_outcome∶ changes_requested'] },
    { name: 'attached-value digit-spoofed verdict', rows: approvalRows, extras: ['verd1ct:fail'] },
    { name: 'attached-value transposed outcome', rows: approvalRows, extras: ['domian_outcome:changes_requested'] },
    { name: 'attached-value Unicode-spoofed verdict', rows: approvalRows, extras: ['verԁict:fail'] },
    { name: 'attached-value ratio-colon verdict', rows: approvalRows, extras: ['verdict∶fail'] },
    { name: 'attached-value full-width verdict', rows: approvalRows, extras: ['ｖｅｒｄｉｃｔ：fail'] },
    { name: 'attached-value transposed attestation', rows: approvalRows, extras: ['review_attestatoin:partial_review'] },
    { name: 'attached-value transposed conclusion', rows: approvalRows, extras: ['review_conclusoin:looks_good'] },
    { name: 'digit-substitution blocking finding', rows: approvalRows, extras: ['f1nding: scope=in_scope action=fix status=open severity=critical'] },
    { name: 'leading-colon blocking finding', rows: approvalRows, extras: [':finding: scope=in_scope action=fix status=open severity=critical'] },
    { name: 'internal-colon blocking finding', rows: approvalRows, extras: ['find:ing: scope=in_scope action=fix status=open severity=critical'] },
    { name: 'transposed-letter blocking finding', rows: approvalRows, extras: ['fniding: scope=in_scope action=fix status=open severity=critical'] },
    { name: 'transposed-letter contradictory outcome', rows: approvalRows, extras: ['domian_outcome: changes_requested'] },
    { name: 'missing-colon blocking finding payload', rows: approvalRows, extras: ['finding scope=in_scope action=fix status=open severity=critical'] },
    { name: 'equals-delimited blocking finding payload', rows: approvalRows, extras: ['finding=scope=in_scope action=fix status=open severity=critical'] },
    { name: 'arrow-delimited blocking finding payload', rows: approvalRows, extras: ['finding -> scope=in_scope action=fix status=open severity=critical'] },
    { name: 'spaced-colon near-spoofed blocking finding', rows: approvalRows, extras: ['findlng : scope=in_scope action=fix status=open severity=critical'] },
    { name: 'spaced-colon Unicode near-spoofed blocking finding', rows: approvalRows, extras: ['fіndіng : scope=in_scope action=fix status=open severity=critical'] },
    { name: 'spaced-colon Unicode near-spoofed verdict', rows: approvalRows, extras: ['vеrdіct : fail'] },
    { name: 'uppercase malformed blocking finding payload', rows: approvalRows, extras: ['finding SCOPE=in_scope ACTION=fix STATUS=open severity=critical'] },
    { name: 'transposed-key malformed blocking finding payload', rows: approvalRows, extras: ['finding scoep=in_scope actoin=fix statsu=open severity=critical'] },
    { name: 'Unicode-key malformed blocking finding payload', rows: approvalRows, extras: ['finding scоpe=in_scope actiоn=fix statսs=open severity=critical'] },
    { name: 'full-width-key malformed blocking finding payload', rows: approvalRows, extras: ['finding ｓｃｏｐｅ=in_scope ａｃｔｉｏｎ=fix ｓｔａｔｕｓ=open severity=critical'] },
    { name: 'uppercase-spaced-equals malformed blocking finding payload', rows: approvalRows, extras: ['finding SCOPE =in_scope ACTION =fix STATUS =open severity=critical'] },
    { name: 'alternating-token malformed blocking finding payload', rows: approvalRows, extras: ['finding scope in_scope action fix status open severity critical'] },
    { name: 'standalone-colon malformed blocking finding payload', rows: approvalRows, extras: ['finding scope : in_scope action : fix status : open severity : critical'] },
    { name: 'arrow-label standalone-colon blocking finding payload', rows: approvalRows, extras: ['finding -> scope : in_scope action : fix status : open'] },
    { name: 'double-colon malformed blocking finding payload', rows: approvalRows, extras: ['finding scope::in_scope action::fix status::open'] },
    { name: 'NBSP-spaced malformed blocking finding payload', rows: approvalRows, extras: ['finding\u00A0scope\u00A0=\u00A0in_scope\u00A0action\u00A0=\u00A0fix\u00A0status\u00A0=\u00A0open'] },
    { name: 'Unicode-line-separator blocking finding', rows: approvalRows, extras: ['Narrative context.\u2028finding: scope=in_scope action=fix status=open severity=critical'] },
    { name: 'Unicode-paragraph-separator contradictory outcome', rows: approvalRows, extras: ['Narrative context.\u2029domain_outcome: changes_requested'] },
    {
      name: 'zero-width-obfuscated duplicate finding gate tokens',
      rows: approvalRows,
      extras: ['finding: scope=out_of_scope action=follow_up status=deferred scope\u200B=in_scope action\u200B=fix status\u200B=open'],
    },
    {
      name: 'combining-mark-obfuscated duplicate finding gate tokens',
      rows: approvalRows,
      extras: ['finding: scope=out_of_scope action=follow_up status=deferred sco\u0301pe=in_scope acti\u0301on=fix sta\u0301tus=open'],
    },
    {
      name: 'full-width-obfuscated duplicate finding gate tokens',
      rows: approvalRows,
      extras: ['finding: scope=out_of_scope action=follow_up status=deferred ｓｃｏｐｅ＝in_scope ａｃｔｉｏｎ＝fix ｓｔａｔｕｓ＝open'],
    },
    {
      name: 'modifier-equals-obfuscated duplicate finding gate tokens',
      rows: approvalRows,
      extras: ['finding: scope=out_of_scope action=follow_up status=deferred scope꞊in_scope action꞊fix status꞊open'],
    },
    {
      name: 'Cyrillic-obfuscated duplicate finding gate tokens',
      rows: approvalRows,
      extras: ['finding: scope=out_of_scope action=follow_up status=deferred scоpe=in_scope actiоn=fix statսs=open'],
    },
    {
      name: 'transposed duplicate finding gate tokens',
      rows: approvalRows,
      extras: ['finding: scope=out_of_scope action=follow_up status=deferred scoep=in_scope actoin=fix statsu=open'],
    },
    {
      name: 'space-before-equals duplicate finding gate tokens',
      rows: approvalRows,
      extras: ['finding: scope=out_of_scope action=follow_up status=deferred scope =in_scope action =fix status =open'],
    },
    {
      name: 'colon-delimited duplicate finding gate tokens',
      rows: approvalRows,
      extras: ['finding: scope=out_of_scope action=follow_up status=deferred scope:in_scope action:fix status:open'],
    },
    {
      name: 'ratio-colon-delimited duplicate finding gate tokens',
      rows: approvalRows,
      extras: ['finding: scope=out_of_scope action=follow_up status=deferred scope∶in_scope action∶fix status∶open'],
    },
    { name: 'missing terminal review conclusion', rows: approvalRows, conclusion: null },
    { name: 'empty terminal review conclusion', rows: approvalRows, conclusion: 'review_conclusion:' },
    { name: 'too-short terminal review conclusion', rows: approvalRows, conclusion: 'review_conclusion: looks good' },
    { name: 'twenty-three-substantive-character terminal review conclusion', rows: approvalRows, conclusion: 'review_conclusion: abcdef ghijkl mnopqr stuvw' },
    { name: 'trailing-space-padded terminal review conclusion', rows: approvalRows, conclusion: 'review_conclusion: one two three four      ' },
    { name: 'trailing-zero-width-padded terminal review conclusion', rows: approvalRows, conclusion: 'review_conclusion: one two three four\u200B\u200B\u200B\u200B\u200B\u200B' },
    { name: 'internal-zero-width-padded terminal review conclusion', rows: approvalRows, conclusion: 'review_conclusion: one\u200B\u200B\u200B\u200B\u200B\u200B two three four' },
    { name: 'duplicate terminal review conclusion', rows: approvalRows, extras: [reviewConclusion] },
    { name: 'indented terminal review conclusion', rows: approvalRows, conclusion: ' review_conclusion: Reviewed all changed files and found no unresolved blocking issues.' },
    { name: 'case-shifted terminal review conclusion', rows: approvalRows, conclusion: 'REVIEW_CONCLUSION: Reviewed all changed files and found no unresolved blocking issues.' },
    { name: 'nonterminal review conclusion', rows: approvalRows, trailing: ['Trailing prose after the required conclusion is not allowed.'] },
    { name: 'duplicate approved outcome', rows: ['domain_outcome: approved', ...approvalRows] },
    { name: 'contradictory approved and changes_requested outcomes', rows: ['domain_outcome: approved', 'domain_outcome: changes_requested', ...approvalRows.slice(1)] },
    { name: 'fail verdict contradicts approval', rows: [approvalRows[0], 'verdict: fail', ...approvalRows.slice(2)] },
    { name: 'missing pass verdict', rows: [approvalRows[0], ...approvalRows.slice(2)] },
    { name: 'duplicate pass verdict', rows: [approvalRows[0], 'verdict: pass', ...approvalRows.slice(1)] },
    { name: 'nonzero blockers contradict approval', rows: approvalRows.map(row => row === 'findings_blocking: 0' ? 'findings_blocking: 1' : row) },
    { name: 'missing zero-blocker count', rows: approvalRows.filter(row => row !== 'findings_blocking: 0') },
    { name: 'duplicate zero-blocker count', rows: [...approvalRows.slice(0, 3), 'findings_blocking: 0', ...approvalRows.slice(3)] },
    { name: 'indented conflicting verdict field', rows: [...approvalRows, ' VERDICT: fail'] },
    { name: 'case-shifted conflicting blocker field', rows: [...approvalRows, 'FINDINGS_BLOCKING: 1'] },
    { name: 'open structured fix finding', rows: approvalRows, extras: ['finding: id=R1 scope=in_scope action=fix status=open severity=high fix_role=tdd-guide rationale=still-broken'] },
    { name: 'open structured fix finding with reordered gate keys', rows: approvalRows, extras: ['finding: status=open action=fix scope=in_scope'] },
    { name: 'indented reserved finding row', rows: approvalRows, extras: ['  finding: scope=in_scope action=fix status=open'] },
    { name: 'case-shifted reserved finding row', rows: approvalRows, extras: ['Finding: scope=in_scope action=fix status=open'] },
    { name: 'finding missing scope', rows: approvalRows, extras: ['finding: action=fix status=open'] },
    { name: 'finding missing action', rows: approvalRows, extras: ['finding: scope=in_scope status=open'] },
    { name: 'finding missing status', rows: approvalRows, extras: ['finding: scope=in_scope action=fix'] },
    { name: 'finding duplicate scope', rows: approvalRows, extras: ['finding: scope=out_of_scope scope=in_scope action=follow_up status=deferred'] },
    { name: 'finding duplicate action', rows: approvalRows, extras: ['finding: scope=out_of_scope action=follow_up action=none status=deferred'] },
    { name: 'finding duplicate status', rows: approvalRows, extras: ['finding: scope=out_of_scope action=follow_up status=resolved status=deferred'] },
    { name: 'finding unknown scope', rows: approvalRows, extras: ['finding: scope=elsewhere action=follow_up status=deferred'] },
    { name: 'finding unknown action', rows: approvalRows, extras: ['finding: scope=out_of_scope action=ignore status=deferred'] },
    { name: 'finding unknown status', rows: approvalRows, extras: ['finding: scope=out_of_scope action=follow_up status=ignored'] },
  ];
  const validExtraCases = [
    { name: 'arbitrary prose is non-authoritative', extras: ['Detailed reviewer narrative is retained for the orchestrator.'] },
    { name: 'ordinary Chinese prose remains non-authoritative', extras: ['审查已经完成，所有变更文件均已仔细检查。'] },
    { name: 'ordinary accented prose remains non-authoritative', extras: ['Résumé: Tous les fichiers modifiés ont été examinés attentivement.'] },
    { name: 'internationalized URL prose remains non-authoritative', extras: ['Reference: https://例え.テスト/审查'] },
    {
      name: 'gate-key suffix prose remains non-authoritative',
      extras: ['Diagnostic: microscope=ready transaction=committed status=green'],
    },
    {
      name: 'second gate-key suffix prose remains non-authoritative',
      extras: ['telescope=active interaction=normal status=informational'],
    },
    { name: 'gate-key list prose remains non-authoritative', extras: ['The review covered scope, action, and status.'] },
    { name: 'gate-key parenthetical prose remains non-authoritative', extras: ['All dimensions (scope), (action), and (status) were inspected.'] },
    { name: 'gate-key label prose remains non-authoritative', extras: ['Scope: reviewed; action: verified; status: approved.'] },
    {
      name: 'gate-key narrative label prose remains non-authoritative',
      extras: ['Reviewer notes covered scope: boundaries, action: routing, and status: reporting.'],
    },
    {
      name: 'exact twenty-four-substantive-character terminal conclusion',
      conclusion: 'review_conclusion: abcdef ghijkl mnopqr stuvwx',
    },
    {
      name: 'terminal conclusion prose is non-authoritative',
      conclusion: 'review_conclusion: Narrative mentions an unresolved blocker for orchestrator triage only.',
    },
    { name: 'out-of-scope follow-up finding', extras: ['finding: id=R1 scope=out_of_scope action=follow_up status=deferred severity=low'] },
    { name: 'pre-existing documented finding', extras: ['finding: id=R2 scope=pre_existing action=document status=deferred severity=medium'] },
    { name: 'resolved in-scope fix finding', extras: ['finding: id=R3 scope=in_scope action=fix status=resolved severity=high'] },
    { name: 'user-decision nonblocking finding', extras: ['finding: id=R4 scope=needs_user_decision action=none status=deferred severity=medium'] },
  ];
  writeReviewEvidence(root, 'code-reviewer', evidenceText(codeBinding, approvalRows,
    ['Detailed reviewer narrative is retained for the orchestrator.']));
  fs.writeFileSync(projFile(root, 'issue-1', 'phase5-review.md'), [
    '# Phase 5 - Review: issue-1',
    '',
    '## Required Agent Compliance',
    reviewComplianceTable([
      { requirement: 'code-reviewer', status: 'subagent-invoked', evidence: '.cache/code-reviewer.md', binding: codeBinding, skip_reason: '' },
      { requirement: 'security-reviewer', status: 'n/a', evidence: '', binding: 'n/a', skip_reason: 'no security-sensitive files in write set' },
      { requirement: 'review-fix executors', status: 'n/a', evidence: '', binding: 'n/a', skip_reason: 'no CRITICAL/HIGH blocking findings' },
    ]),
    '',
    '## Review Status',
    'PASSED',
    '',
  ].join('\n'));
  const verified = run(root, ['phase5-verify', '--project', 'issue-1']);
  assert(verified.status === 0 && verified.json && verified.json.result === 'ok',
    'T16i: canonical persisted Phase 5 review passes point-of-use verification; got '
      + JSON.stringify(verified.json));

  const weakCases = [
    { name: 'changed binding header', evidence: evidenceText('evidence-binding: phase5-code-review-1 changed-nonce') },
    { name: 'missing binding header', evidence: [...approvalRows, ''].join('\n') },
    { name: 'seed-only evidence', evidence: codeBinding + '\n' },
    { name: 'compact-summary-only evidence', evidence: codeBinding + '\nphase5-code-review-1 code-reviewer: approved; evidence=.cache/code-reviewer.md\n' },
    ...invalidBodyCases.map(testCase => ({
      name: testCase.name,
      evidence: evidenceText(codeBinding, testCase.rows, testCase.extras, testCase.conclusion, testCase.trailing),
    })),
  ];
  for (const testCase of weakCases) {
    fs.writeFileSync(projFile(root, 'issue-1', path.join('.cache', 'code-reviewer.md')), testCase.evidence);
    const result = run(root, ['phase5-verify', '--project', 'issue-1']);
    assert(result.status === 1 && result.json && result.json.reason === 'reviewer_prerequisite',
      'T16i: ' + testCase.name + ' is refused at point of use');
  }
  for (const testCase of validExtraCases) {
    fs.writeFileSync(projFile(root, 'issue-1', path.join('.cache', 'code-reviewer.md')),
      evidenceText(codeBinding, approvalRows, testCase.extras, testCase.conclusion));
    const result = run(root, ['phase5-verify', '--project', 'issue-1']);
    assert(result.status === 0 && result.json && result.json.result === 'ok',
      'T16i: canonical structured approval accepts ' + testCase.name);
  }
  fs.rmSync(root, { recursive: true, force: true });

  for (const reviewer of ['code-reviewer', 'security-reviewer']) {
    const outcomeRoot = makeProject('issue-1', {
      'workflow-state.md': STATE_WITH_SINK,
      'phase4-progress.md': PHASE4_COMPLETE,
    });
    writeReviewEvidence(outcomeRoot, 'code-reviewer');
    const compliance = reviewCompliance();
    writeReviewEvidence(outcomeRoot, reviewer, evidenceBinding(reviewer)
      + '\ndomain_outcome: changes_requested\nverdict: fail\nfindings_blocking: 1\nreview_summary: blocking_findings_present\n');
    if (reviewer === 'security-reviewer') {
      compliance[1] = {
        requirement: 'security-reviewer', status: 'subagent-invoked',
        evidence: '.cache/security-reviewer.md', binding: evidenceBinding('security-reviewer'),
      };
    }
    const outcome = run(outcomeRoot, ['phase5-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({
      review_status: 'PASSED', compliance,
    }));
    assert(outcome.status === 1 && outcome.json && outcome.json.reason === 'reviewer_prerequisite',
      'T16i: terminal ' + reviewer + ' changes_requested outcome blocks Finalization');
    fs.rmSync(outcomeRoot, { recursive: true, force: true });
  }

  for (const testCase of invalidBodyCases) {
    const root = makeProject('issue-1', {
      'workflow-state.md': STATE_WITH_SINK,
      'phase4-progress.md': PHASE4_COMPLETE,
    });
    writeReviewEvidence(root, 'code-reviewer', evidenceText(
      evidenceBinding('code-reviewer'), testCase.rows, testCase.extras,
      testCase.conclusion, testCase.trailing));
    const result = run(root, ['phase5-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({
      review_status: 'PASSED', compliance: reviewCompliance(),
    }));
    assert(result.status === 1 && result.json && result.json.reason === 'reviewer_prerequisite',
      'T16i: phase5-finalize rejects ' + testCase.name);
    assert(!fs.existsSync(projFile(root, 'issue-1', 'phase5-review.md')),
      'T16i: rejected ' + testCase.name + ' writes no Phase 5 artifact');
    fs.rmSync(root, { recursive: true, force: true });
  }
  for (const testCase of validExtraCases) {
    const root = makeProject('issue-1', {
      'workflow-state.md': STATE_WITH_SINK,
      'phase4-progress.md': PHASE4_COMPLETE,
    });
    writeReviewEvidence(root, 'code-reviewer', evidenceText(
      evidenceBinding('code-reviewer'), approvalRows, testCase.extras, testCase.conclusion));
    const result = run(root, ['phase5-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({
      review_status: 'PASSED', compliance: reviewCompliance(),
    }));
    assert(result.status === 0 && result.json && result.json.result === 'ok',
      'T16i: phase5-finalize accepts canonical structured approval with ' + testCase.name);
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// T16j: repair-state must not route a weak legacy/hand-authored Phase 5 review
// to Finalization, and its Phase 4 task decision must use the same strict table
// grammar as the transaction owner.
{
  const makeStoredReview = (binding) => [
    '# Phase 5 - Review: issue-1',
    '',
    '## Required Agent Compliance',
    reviewComplianceTable([
      { requirement: 'code-reviewer', status: 'subagent-invoked', evidence: '.cache/code-reviewer.md', binding, skip_reason: '' },
      { requirement: 'security-reviewer', status: 'n/a', evidence: '', binding: 'n/a', skip_reason: 'no security-sensitive files in write set' },
      { requirement: 'review-fix executors', status: 'n/a', evidence: '', binding: 'n/a', skip_reason: 'no CRITICAL/HIGH blocking findings' },
    ]),
    '',
    '## Review Status',
    'PASSED',
    '',
  ].join('\n');
  const binding = 'evidence-binding: phase5-code-review-1 nonce-code-1';
  const evidence = binding + '\ndomain_outcome: approved\nverdict: pass\nfindings_blocking: 0\nreview_summary: no_blocking_findings\nreview_attestation: full_review_completed\nNo admitted findings.\nreview_conclusion: Reviewed all changed files and found no unresolved blocking issues.\n';
  const malformedProgressCases = [
    {
      name: 'duplicate Tasks headings',
      content: PHASE4_COMPLETE + '\n## Tasks\n| # | Task | Status |\n|---|------|--------|\n| 2 | hidden | pending |\n',
    },
    {
      name: 'truncated task row',
      content: '# Phase 4\n\n## Tasks\n| # | Task | Status |\n|---|------|--------|\n| 1 | done | complete |\n| 2 | truncated |\n',
    },
    {
      name: 'blank-separated hidden row',
      content: '# Phase 4\n\n## Tasks\n| # | Task | Status |\n|---|------|--------|\n| 1 | done | complete |\n\n| 2 | hidden | complete |\n',
    },
  ];
  for (const testCase of malformedProgressCases) {
    const root = makeProject('issue-1', {
      'phase4-progress.md': testCase.content,
      'phase5-review.md': makeStoredReview(binding),
    });
    writeReviewEvidence(root, 'code-reviewer', evidence);
    const result = runRepair(root, 'issue-1');
    const state = fs.existsSync(projFile(root, 'issue-1', 'workflow-state.md'))
      ? fs.readFileSync(projFile(root, 'issue-1', 'workflow-state.md'), 'utf8') : '';
    assert(result.status === 0 && !/next_command: \/kaola-workflow-finalize\b/.test(state),
      'T16j: repair-state refuses Finalization for ' + testCase.name);
    fs.rmSync(root, { recursive: true, force: true });
  }

  const weakRoot = makeProject('issue-1', {
    'phase4-progress.md': PHASE4_COMPLETE,
    'phase5-review.md': [
      '# Phase 5 - Review: issue-1',
      '## Required Agent Compliance',
      '| Requirement | Status | Evidence | Skip Reason |',
      '|-------------|--------|----------|-------------|',
      '| code-reviewer | invoked | .cache/code-reviewer.md | |',
      '## Review Status',
      'PASSED',
      '',
    ].join('\n'),
  });
  writeReviewEvidence(weakRoot, 'code-reviewer', 'verdict: pass\n');
  const weak = runRepair(weakRoot, 'issue-1');
  const weakState = fs.existsSync(projFile(weakRoot, 'issue-1', 'workflow-state.md'))
    ? fs.readFileSync(projFile(weakRoot, 'issue-1', 'workflow-state.md'), 'utf8') : '';
  assert(weak.status === 0 && !/next_command: \/kaola-workflow-finalize\b/.test(weakState),
    'T16j: repair-state refuses weak legacy Phase 5 review missing binding and fix decision');
  fs.rmSync(weakRoot, { recursive: true, force: true });

  const validStateRoot = makeProject('issue-1', {
    'workflow-state.md': [
      'status: active',
      'phase: 5',
      'next_command: /kaola-workflow-phase5 issue-1',
      'next_skill: kaola-workflow-review issue-1',
      '',
    ].join('\n'),
    'phase4-progress.md': PHASE4_COMPLETE,
    'phase5-review.md': makeStoredReview(binding),
  });
  writeReviewEvidence(validStateRoot, 'code-reviewer', binding + '\n');
  const validState = runRepair(validStateRoot, 'issue-1');
  assert(validState.status === 0 && /failed point-of-use verification/.test(validState.stdout)
      && !/existing state valid/.test(validState.stdout),
    'T16j: a valid-looking state pointer cannot hide tampered Phase 5 evidence');
  fs.rmSync(validStateRoot, { recursive: true, force: true });
}

// T16k: mandatory named reviewer invocation is stronger than a workflow-wide
// local-authorized fallback posture. The named code reviewer remains invoked;
// the documented N/A security/fix decisions remain valid.
{
  const root = makeProject('issue-1', {
    'workflow-state.md': STATE_WITH_SINK + '\ndelegation_policy: local-authorized\n',
    'phase4-progress.md': PHASE4_COMPLETE,
  });
  writeReviewEvidence(root, 'code-reviewer');
  const result = run(root, ['phase5-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({
    review_status: 'PASSED',
    compliance: reviewCompliance('subagent-invoked'),
  }));
  assert(result.status === 0 && result.json && result.json.result === 'ok',
    'T16k: local-authorized policy does not force a forbidden reviewer fallback');
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T12: edition tokens — the ONLY contiguous kaola-workflow-<name> token is the
// repair-state require (which rename-normalizes per edition); command/skill ROUTE
// names stay KW-split so they keep their un-prefixed names across editions.
// ---------------------------------------------------------------------------
{
  const src = fs.readFileSync(SCRIPT, 'utf8');
  const tokens = [...new Set(src.match(/kaola-workflow-[a-z0-9-]+/g) || [])];
  assert(tokens.length === 1 && tokens[0] === 'kaola-workflow-repair-state',
    'T12: the only contiguous kaola-workflow-<name> token is the repair-state require; found: ' + JSON.stringify(tokens));
  const routeLeaks = tokens.filter(t => /(phase|research|ideation|plan|execute|review|finalize)$/.test(t));
  assert(routeLeaks.length === 0, 'T12: no command/skill ROUTE token may be contiguous (routes must be KW-split); leaked: ' + routeLeaks.join(','));
}

// ---------------------------------------------------------------------------
// T13: invalid project + unknown subcommand refusals
// ---------------------------------------------------------------------------
{
  const root = makeProject('issue-1', { 'workflow-state.md': STATE_WITH_SINK });
  const bad = run(root, ['phase1-complete', '--project', 'kaola-workflow']);
  assert(bad.status === 1 && bad.json && bad.json.reason === 'invalid_project', 'T13: reserved project literal refused');
  const unk = run(root, ['frobnicate', '--project', 'issue-1']);
  assert(unk.status === 1 && unk.json && unk.json.reason === 'unknown_subcommand', 'T13: unknown subcommand refused');
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T14: delegation_policy: delegate — the load-bearing #457 regression. Under an
// active delegation policy the repair-state delegation cross-check (the SECOND arg
// of unresolvedCompliance, which production always passes) requires the delegation
// vocabulary, NOT plain `invoked`. The script's DEFAULT rows must adapt to the
// policy so the authored file passes the real two-arg gate.
// ---------------------------------------------------------------------------
const DELEGATE_STATE = STATE_WITH_SINK + '\ndelegation_policy: delegate\n';
{
  const root = makeProject('issue-1', { 'workflow-state.md': DELEGATE_STATE });
  // omitted compliance -> policy-aware default (subagent-invoked), passes the two-arg gate
  const r = run(root, ['phase2-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({ selected_approach: 'A' }));
  assert(r.status === 0 && r.json && r.json.result === 'ok', 'T14: phase2-finalize ok under delegate policy');
  const ideation = fs.readFileSync(projFile(root, 'issue-1', 'phase2-ideation.md'), 'utf8');
  assert(/\| planner \| subagent-invoked \|/.test(ideation), 'T14: default planner row uses subagent-invoked under delegate policy');
  const st = readState(root, 'issue-1');
  assert(repair.unresolvedCompliance(ideation, st).length === 0, 'T14: default rows PASS the real two-arg gate under delegate policy (the regression this fix closes)');
  fs.rmSync(root, { recursive: true, force: true });
}

// T15: delegate policy + EXPLICIT `invoked` rows -> the file would FAIL the gate ->
// the script must REFUSE (self-validation, zero mutation), not write a bricking file.
{
  const root = makeProject('issue-1', { 'workflow-state.md': DELEGATE_STATE });
  const r = run(root, ['phase2-finalize', '--project', 'issue-1', '--stdin'],
    JSON.stringify({ selected_approach: 'A', compliance: [{ requirement: 'planner', status: 'invoked', evidence: '.cache/planner.md' }] }));
  assert(r.status === 1 && r.json && r.json.reason === 'unresolved_compliance', 'T15: refuses explicit invoked rows that fail the delegate cross-check; got ' + (r.json && r.json.reason));
  assert(!fs.existsSync(projFile(root, 'issue-1', 'phase2-ideation.md')), 'T15: no phase file written on unresolved_compliance refusal');
  const st = readState(root, 'issue-1');
  assert(/^phase: 1$/m.test(st), 'T15: state pointer NOT advanced on refusal (zero mutation)');
  fs.rmSync(root, { recursive: true, force: true });
}

// T16: a packet with an UNRESOLVED row (status pending) -> refuse, zero mutation
// (the MEDIUM: review_status was hard-gated but compliance was transcribed blindly).
{
  const root = makeProject('issue-1', { 'workflow-state.md': STATE_WITH_SINK, 'phase4-progress.md': PHASE4_COMPLETE });
  writeReviewEvidence(root, 'code-reviewer');
  const r = run(root, ['phase5-finalize', '--project', 'issue-1', '--stdin'],
    JSON.stringify({
      review_status: 'PASSED',
      compliance: [
        ...reviewCompliance(),
        { requirement: 'release evidence', status: 'pending' },
      ],
    }));
  assert(r.status === 1 && r.json && r.json.reason === 'unresolved_compliance', 'T16: valid verdict but pending compliance row -> refuse');
  assert(!fs.existsSync(projFile(root, 'issue-1', 'phase5-review.md')), 'T16: no review.md written when compliance unresolved');
  fs.rmSync(root, { recursive: true, force: true });
}

// T17: bad_packet — --stdin present but unparseable bytes -> refuse, no file
{
  const root = makeProject('issue-1', { 'workflow-state.md': STATE_WITH_SINK });
  const r = run(root, ['phase2-finalize', '--project', 'issue-1', '--stdin'], 'not json at all');
  assert(r.status === 1 && r.json && r.json.reason === 'bad_packet', 'T17: unparseable stdin -> bad_packet');
  assert(!fs.existsSync(projFile(root, 'issue-1', 'phase2-ideation.md')), 'T17: no file on bad_packet');
  fs.rmSync(root, { recursive: true, force: true });
}

// T18: orient upper ladder — full_step + route for each artifact level
{
  const root = makeProject('issue-1', { 'workflow-state.md': STATE_WITH_SINK });
  const dir = path.join(root, 'kaola-workflow', 'issue-1');
  fs.writeFileSync(path.join(dir, 'phase1-research.md'), RESEARCH_MD);
  fs.writeFileSync(path.join(dir, 'phase2-ideation.md'), '# x');
  let o = run(root, ['orient', '--project', 'issue-1']);
  assert(o.json && o.json.full_step === 'plan' && o.json.next_command.endsWith('/kaola-workflow-phase3 issue-1'), 'T18: ideation present -> plan/phase3');
  fs.writeFileSync(path.join(dir, 'phase3-plan.md'), '# x');
  o = run(root, ['orient', '--project', 'issue-1']);
  assert(o.json && o.json.full_step === 'execute' && o.json.next_command.endsWith('/kaola-workflow-phase4 issue-1'), 'T18: plan present -> execute/phase4');
  fs.writeFileSync(path.join(dir, 'phase4-progress.md'), '# x');
  o = run(root, ['orient', '--project', 'issue-1']);
  assert(o.json && o.json.full_step === 'review' && o.json.next_command.endsWith('/kaola-workflow-phase5 issue-1'), 'T18: progress present -> review/phase5');
  fs.writeFileSync(path.join(dir, 'phase5-review.md'), '# x');
  o = run(root, ['orient', '--project', 'issue-1']);
  assert(o.json && o.json.full_step === 'finalize' && o.json.next_command.endsWith('/kaola-workflow-finalize issue-1'), 'T18: review present -> finalize');
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// #689 — writeFileAtomic parent-directory fsync ORDERING (same gap #685 fixed on the adaptive path's
// writeFileAtomicReplace, copied verbatim). Node's require('fs') is a process-wide singleton, so
// patching fs.<method> here is observed by the production function's own `require('fs')` binding
// (same seam as test-claim-hardening.js's #685 regression). Every patched method is restored in a
// `finally` so the spy never leaks into a later test in this process.
// ---------------------------------------------------------------------------
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-full-atomic-dirfsync-'));
  const parentDir = path.join(dir, 'sub');
  const target = path.join(parentDir, 'workflow-state.md');
  const calls = [];
  const fdToPath = new Map();
  const origOpenSync = fs.openSync;
  const origFsyncSync = fs.fsyncSync;
  const origRenameSync = fs.renameSync;
  const origCloseSync = fs.closeSync;
  fs.openSync = function (p, ...rest) {
    const fd = origOpenSync.call(fs, p, ...rest);
    fdToPath.set(fd, p);
    calls.push({ fn: 'openSync', arg: p, fd });
    return fd;
  };
  fs.fsyncSync = function (fd) {
    calls.push({ fn: 'fsyncSync', arg: fdToPath.get(fd), fd });
    return origFsyncSync.call(fs, fd);
  };
  fs.renameSync = function (a, b) {
    calls.push({ fn: 'renameSync', arg: [a, b] });
    return origRenameSync.call(fs, a, b);
  };
  fs.closeSync = function (fd) {
    calls.push({ fn: 'closeSync', arg: fdToPath.get(fd), fd });
    return origCloseSync.call(fs, fd);
  };
  let wrote;
  try {
    wrote = writeFileAtomic(target, 'gamma');
  } finally {
    fs.openSync = origOpenSync;
    fs.fsyncSync = origFsyncSync;
    fs.renameSync = origRenameSync;
    fs.closeSync = origCloseSync;
  }
  assert(wrote === true, '#689: write with the order-tracking spy in place still returns true');
  const renameIdx = calls.findIndex(c => c.fn === 'renameSync');
  assert(renameIdx !== -1, '#689: renameSync was called, got ' + JSON.stringify(calls));
  const tmpFsyncIdx = calls.findIndex((c, i) => i < renameIdx && c.fn === 'fsyncSync');
  assert(tmpFsyncIdx !== -1, '#689: the tmp-file fd is fsynced BEFORE renameSync (pre-existing contract), got ' + JSON.stringify(calls));
  const dirOpenIdx = calls.findIndex((c, i) => i > renameIdx && c.fn === 'openSync' && c.arg === parentDir);
  assert(dirOpenIdx !== -1, '#689: parent directory opened AFTER renameSync, got ' + JSON.stringify(calls));
  const dirOpenFd = dirOpenIdx !== -1 ? calls[dirOpenIdx].fd : undefined;
  const dirFsyncIdx = calls.findIndex((c, i) => i > dirOpenIdx && c.fn === 'fsyncSync' && c.fd === dirOpenFd);
  assert(dirFsyncIdx !== -1,
    '#689: the parent-directory fd is fsynced after open+rename — full required order is ' +
    'fsyncSync(tmpFd) -> renameSync -> openSync(dir) -> fsyncSync(dirFd) -> closeSync(dirFd), got ' + JSON.stringify(calls));
  const dirCloseIdx = calls.findIndex((c, i) => i > dirFsyncIdx && c.fn === 'closeSync' && c.fd === dirOpenFd);
  assert(dirCloseIdx !== -1, '#689: the parent-directory fd is closed after its own fsync, got ' + JSON.stringify(calls));
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// #689 — platform fail-soft on the parent-directory fsync. A directory open/fsync can be refused on
// some platforms/filesystems (Windows, EISDIR, EACCES, EINVAL). That failure must degrade SILENTLY —
// never propagate, never turn a previously-accepted write into a refusal.
// ---------------------------------------------------------------------------
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-full-atomic-failsoft-'));
  const parentDir = path.join(dir, 'sub');
  const target = path.join(parentDir, 'workflow-state.md');
  const origOpenSync = fs.openSync;

  function patchOpenSyncToFaultOnDir(code) {
    fs.openSync = function (p, ...rest) {
      if (p === parentDir) {
        const err = new Error('#689 fault injection: simulated ' + code + ' opening the parent directory');
        err.code = code;
        throw err;
      }
      return origOpenSync.call(fs, p, ...rest);
    };
  }

  let wrote1, threw1 = false;
  patchOpenSyncToFaultOnDir('EISDIR');
  try { wrote1 = writeFileAtomic(target, 'delta'); } catch (_) { threw1 = true; } finally { fs.openSync = origOpenSync; }
  assert(threw1 === false, '#689: a directory-open failure during the fsync step must NOT propagate (fail-soft)');
  assert(wrote1 === true, '#689: the write still completes and returns its normal true contract despite the fsync failure');
  assert(fs.readFileSync(target, 'utf8') === 'delta', '#689: content is durably written even when parent-dir fsync is unsupported');

  let wrote2, threw2 = false;
  patchOpenSyncToFaultOnDir('EACCES');
  try { wrote2 = writeFileAtomic(target, 'epsilon'); } catch (_) { threw2 = true; } finally { fs.openSync = origOpenSync; }
  assert(threw2 === false && wrote2 === true, '#689: fail-soft degrades every call, not just the first');
  assert(fs.readFileSync(target, 'utf8') === 'epsilon', '#689: content is durably written on the second fail-soft call too');
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
console.log('\nfull-advance tests: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
console.log('test-full-advance passed');
