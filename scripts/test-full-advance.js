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
const REPO = path.resolve(__dirname, '..');
const repair = require('./kaola-workflow-repair-state.js');
// #689: in-process require of the script itself for the parent-dir-fsync monkey-patch seam (every
// other test in this file spawns the script as a subprocess; this ONE direct require is needed
// because fs.<method> patching is only observable by the production function's OWN `require('fs')`
// binding when both live in the same process).
const { writeFileAtomic } = require('./kaola-workflow-full-advance.js');

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
  const root = makeProject('issue-1', { 'workflow-state.md': STATE_WITH_SINK });
  const packet = {
    review_status: 'PASSED',
    code_review_findings: '### CRITICAL\nnone\n### HIGH\nnone\n### MEDIUM/LOW\nminor naming',
    validation_evidence: 'node test.js -> pass',
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
  const root = makeProject('issue-1', { 'workflow-state.md': STATE_WITH_SINK });
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
  const root = makeProject('issue-1', { 'workflow-state.md': STATE_WITH_SINK });
  const packet = {
    review_status: 'PASSED WITH FOLLOW-UPS',
    compliance: [
      { requirement: 'code-reviewer', status: 'invoked', evidence: '.cache/code-reviewer.md' },
      { requirement: 'security-reviewer', status: 'invoked', evidence: '.cache/security-reviewer.md' },
      { requirement: 'review-fix executors', status: 'n/a', skipReason: 'no high findings' },
    ],
  };
  const r = run(root, ['phase5-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify(packet));
  assert(r.status === 0 && r.json && r.json.result === 'ok', 'T8: custom-compliance phase5 ok');
  const review = fs.readFileSync(projFile(root, 'issue-1', 'phase5-review.md'), 'utf8');
  assert(review.includes('| security-reviewer | invoked | .cache/security-reviewer.md |'), 'T8: custom security-reviewer row rendered');
  assert(review.includes('no high findings'), 'T8: skipReason alias mapped into Skip Reason column');
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
  const root = makeProject('issue-1', { 'workflow-state.md': CLAIM_SHAPED_STATE, 'phase1-research.md': RESEARCH_MD });
  run(root, ['phase1-complete', '--project', 'issue-1']);
  run(root, ['phase2-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({ selected_approach: 'A' }));
  run(root, ['phase3-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({ blueprint: 'bp', task_list: '### Task 1: x\n- Write Set: a/b.js' }));
  run(root, ['phase5-finalize', '--project', 'issue-1', '--stdin'], JSON.stringify({ review_status: 'PASSED' }));
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
  const root = makeProject('issue-1', { 'workflow-state.md': STATE_WITH_SINK });
  const r = run(root, ['phase5-finalize', '--project', 'issue-1', '--stdin'],
    JSON.stringify({ review_status: 'PASSED', compliance: [{ requirement: 'code-reviewer', status: 'pending' }] }));
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
