#!/usr/bin/env node
'use strict';

// test-fast-advance.js (#456)
// Focused tests for the fast-path transaction owner kaola-workflow-fast-advance.js.
// Hand-rolled assert pattern — no test framework dependency.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, 'kaola-workflow-fast-advance.js');
const REPO = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; } else { failed++; console.error('FAIL: ' + msg); }
}

// Run the script in a throwaway root; returns { status, json, stdout }.
function run(root, args, stdin) {
  const opts = { cwd: REPO, encoding: 'utf8', env: { ...process.env } };
  if (stdin !== undefined) opts.input = stdin;
  const res = spawnSync(process.execPath, [SCRIPT, ...args, '--root', root, '--json'], opts);
  let json = null;
  try { json = JSON.parse(res.stdout.trim().split('\n').filter(Boolean).pop()); } catch (_) {}
  return { status: res.status, json, stdout: res.stdout, stderr: res.stderr };
}

function makeProject(project, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-fast-'));
  const dir = path.join(root, 'kaola-workflow', project);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files || {})) {
    fs.writeFileSync(path.join(dir, name), content);
  }
  return root;
}
function statePath(root, p) { return path.join(root, 'kaola-workflow', p, 'workflow-state.md'); }
function summaryPath(root, p) { return path.join(root, 'kaola-workflow', p, 'fast-summary.md'); }

const SINK_BLOCK = [
  '## Sink',
  'branch: workflow/issue-1',
  'issue_number: 1',
  'sink: merge',
  'run_posture: worktree',
  'worktree_path: /tmp/wt/issue-1',
].join('\n');

const STATE_WITH_SINK = [
  'phase: fast', 'phase_name: Fast', 'step: plan', 'workflow_path: fast',
  'next_command: /kaola-workflow-fast issue-1', 'main_session_role: orchestrator',
  'implementation_owner: planner', 'inline_emergency_fallback_authorized: no',
  '', SINK_BLOCK, '',
].join('\n');

// ---------------------------------------------------------------------------
// T1: clean plan setup from absent fast-summary.md
// ---------------------------------------------------------------------------
{
  const root = makeProject('issue-1', { 'workflow-state.md': STATE_WITH_SINK });
  const orient = run(root, ['orient', '--project', 'issue-1']);
  assert(orient.json && orient.json.result === 'ok', 'T1: orient ok with no fast-summary');
  assert(orient.json && orient.json.fast_step === 'plan', 'T1: orient derives fast_step=plan when no fast-summary; got ' + (orient.json && orient.json.fast_step));

  const r = run(root, ['plan-setup', '--project', 'issue-1']);
  assert(r.status === 0 && r.json && r.json.result === 'ok', 'T1: plan-setup ok');
  assert(fs.existsSync(path.join(root, 'kaola-workflow', 'issue-1', '.cache')), 'T1: plan-setup creates .cache');
  const st = fs.readFileSync(statePath(root, 'issue-1'), 'utf8');
  assert(/step: plan/.test(st), 'T1: plan-setup writes step: plan');
  assert(/implementation_owner: planner/.test(st), 'T1: plan-setup owner planner');
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T2: ## Sink preserved byte-for-byte through plan-setup + plan-capture + consequence
// ---------------------------------------------------------------------------
{
  const root = makeProject('issue-1', { 'workflow-state.md': STATE_WITH_SINK });
  run(root, ['plan-setup', '--project', 'issue-1']);
  run(root, ['plan-capture', '--project', 'issue-1', '--stdin'], JSON.stringify({ write_set: ['a.js'], acceptance_command: 'true', plan: 'x' }));
  run(root, ['acceptance-consequence', '--project', 'issue-1', '--decision', 'proceed']);
  const st = fs.readFileSync(statePath(root, 'issue-1'), 'utf8');
  assert(st.includes(SINK_BLOCK), 'T2: ## Sink block preserved byte-for-byte across all state rewrites');
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T3: plan-capture writes IN_PROGRESS stub + Scope (Write Set / Acceptance) + state pointer execute
// ---------------------------------------------------------------------------
{
  const root = makeProject('issue-1', { 'workflow-state.md': STATE_WITH_SINK });
  const r = run(root, ['plan-capture', '--project', 'issue-1', '--stdin'],
    JSON.stringify({ write_set: ['scripts/foo.js', 'scripts/test-foo.js'], acceptance_command: 'node scripts/test-foo.js', plan: 'thread flag' }));
  assert(r.json && r.json.result === 'ok' && r.json.status === 'IN_PROGRESS', 'T3: plan-capture returns IN_PROGRESS');
  const sum = fs.readFileSync(summaryPath(root, 'issue-1'), 'utf8');
  assert(/##\s+Status\nIN_PROGRESS/.test(sum), 'T3: fast-summary Status IN_PROGRESS');
  assert(sum.includes('- Write Set: scripts/foo.js, scripts/test-foo.js'), 'T3: Write Set line recorded verbatim');
  assert(sum.includes('- Acceptance: node scripts/test-foo.js'), 'T3: Acceptance line recorded verbatim');
  const st = fs.readFileSync(statePath(root, 'issue-1'), 'utf8');
  assert(/step: execute/.test(st), 'T3: plan-capture advances state pointer to execute');
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T4: plan-capture refuses missing write set / missing acceptance / bad packet
// ---------------------------------------------------------------------------
{
  const root = makeProject('issue-1', { 'workflow-state.md': STATE_WITH_SINK });
  const r1 = run(root, ['plan-capture', '--project', 'issue-1', '--stdin'], JSON.stringify({ acceptance_command: 'true' }));
  assert(r1.status === 1 && r1.json.reason === 'missing_write_set', 'T4: refuse missing write set');
  const r2 = run(root, ['plan-capture', '--project', 'issue-1', '--stdin'], JSON.stringify({ write_set: ['a.js'] }));
  assert(r2.status === 1 && r2.json.reason === 'missing_acceptance', 'T4: refuse missing acceptance command');
  const r3 = run(root, ['plan-capture', '--project', 'issue-1', '--stdin'], 'not json');
  assert(r3.status === 1 && r3.json.reason === 'bad_packet', 'T4: refuse non-JSON packet');
  // zero mutation on refusal: no fast-summary written
  assert(!fs.existsSync(summaryPath(root, 'issue-1')), 'T4: refused plan-capture writes no fast-summary');
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T5: acceptance-run records command result WITHOUT writing consequence
// ---------------------------------------------------------------------------
{
  const root = makeProject('issue-1', { 'workflow-state.md': STATE_WITH_SINK });
  run(root, ['plan-capture', '--project', 'issue-1', '--stdin'], JSON.stringify({ write_set: ['a.js'], acceptance_command: 'true' }));
  const before = fs.readFileSync(summaryPath(root, 'issue-1'), 'utf8');
  const r = run(root, ['acceptance-run', '--project', 'issue-1']);
  assert(r.json && r.json.result === 'ok' && r.json.exit_code === 0 && r.json.passed === true, 'T5: acceptance-run reports exit_code 0 / passed');
  assert(typeof r.json.repeat_count === 'number' && r.json.evidence_path, 'T5: acceptance-run reports repeat_count + evidence_path');
  const after = fs.readFileSync(summaryPath(root, 'issue-1'), 'utf8');
  assert(before === after, 'T5: acceptance-run writes NO consequence to fast-summary (status unchanged)');
  assert(/##\s+Status\nIN_PROGRESS/.test(after), 'T5: status remains IN_PROGRESS after acceptance-run');
  // failing command still reports facts only
  run(root, ['plan-capture', '--project', 'issue-1', '--stdin'], JSON.stringify({ write_set: ['a.js'], acceptance_command: 'false' }));
  const rf = run(root, ['acceptance-run', '--project', 'issue-1']);
  assert(rf.json && rf.json.exit_code !== 0 && rf.json.passed === false, 'T5: acceptance-run reports failing exit honestly');
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T6: acceptance-consequence proceed -> REVIEW (does NOT finalize)
// ---------------------------------------------------------------------------
{
  const root = makeProject('issue-1', { 'workflow-state.md': STATE_WITH_SINK });
  run(root, ['plan-capture', '--project', 'issue-1', '--stdin'], JSON.stringify({ write_set: ['a.js'], acceptance_command: 'true' }));
  const r = run(root, ['acceptance-consequence', '--project', 'issue-1', '--decision', 'proceed']);
  assert(r.json && r.json.status === 'REVIEW', 'T6: proceed sets status REVIEW');
  const sum = fs.readFileSync(summaryPath(root, 'issue-1'), 'utf8');
  assert(/##\s+Status\nREVIEW/.test(sum), 'T6: fast-summary REVIEW');
  assert(!/PASSED/.test(sum.split('## Scope')[0]), 'T6: proceed does NOT finalize (no PASSED)');
  const st = fs.readFileSync(statePath(root, 'issue-1'), 'utf8');
  assert(/step: review/.test(st) && /implementation_owner: code-reviewer/.test(st), 'T6: state step review / owner code-reviewer');
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T7: acceptance-consequence escalate -> full path + bare ESCALATED + em-dash trigger
// ---------------------------------------------------------------------------
{
  const root = makeProject('issue-1', { 'workflow-state.md': STATE_WITH_SINK });
  run(root, ['plan-capture', '--project', 'issue-1', '--stdin'], JSON.stringify({ write_set: ['a.js'], acceptance_command: 'true' }));
  const bad = run(root, ['acceptance-consequence', '--project', 'issue-1', '--decision', 'escalate', '--stdin'], JSON.stringify({ trigger: 'not_a_trigger' }));
  assert(bad.status === 1 && bad.json.reason === 'invalid_trigger', 'T7: escalate refuses unknown trigger');
  const r = run(root, ['acceptance-consequence', '--project', 'issue-1', '--decision', 'escalate', '--stdin'], JSON.stringify({ trigger: 'test_thrash', detail: '3 RED cycles' }));
  assert(r.json && r.json.status === 'ESCALATED' && r.json.trigger === 'test_thrash', 'T7: escalate sets ESCALATED + trigger');
  const sum = fs.readFileSync(summaryPath(root, 'issue-1'), 'utf8');
  assert(/##\s+Status\nESCALATED/.test(sum), 'T7: fast-summary bare ESCALATED');
  assert(sum.includes('escalated_to_full: test_thrash — 3 RED cycles'), 'T7: escalation field uses U+2014 em-dash with spaces');
  const st = fs.readFileSync(statePath(root, 'issue-1'), 'utf8');
  assert(/workflow_path: full/.test(st), 'T7: state workflow_path full');
  assert(/next_command: \/kaola-workflow-phase1 issue-1/.test(st), 'T7: state routes to phase1');
  assert(/next_skill: kaola-workflow-research issue-1/.test(st), 'T7: state next_skill research');
  assert(st.includes(SINK_BLOCK), 'T7: ## Sink preserved on escalate');
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T8: summary-write PASSED -> Finalization route + terminal summary
// ---------------------------------------------------------------------------
{
  const root = makeProject('issue-1', { 'workflow-state.md': STATE_WITH_SINK });
  run(root, ['plan-capture', '--project', 'issue-1', '--stdin'], JSON.stringify({ write_set: ['a.js'], acceptance_command: 'true', plan: 'thread flag' }));
  run(root, ['acceptance-consequence', '--project', 'issue-1', '--decision', 'proceed']);
  const r = run(root, ['summary-write', '--project', 'issue-1', '--verdict', 'PASSED', '--stdin'],
    JSON.stringify({ implementation_evidence: 'ran node test', review: 'clean, no findings' }));
  assert(r.json && r.json.status === 'PASSED', 'T8: summary-write returns PASSED');
  assert(r.json.next_command === '/kaola-workflow-finalize issue-1', 'T8: summary-write routes to Finalization');
  const sum = fs.readFileSync(summaryPath(root, 'issue-1'), 'utf8');
  assert(/##\s+Status\nPASSED/.test(sum), 'T8: terminal fast-summary PASSED');
  assert(sum.includes('ran node test') && sum.includes('clean, no findings'), 'T8: evidence + review transcribed');
  assert(sum.includes('- Write Set: a.js'), 'T8: Scope Write Set preserved from stub');
  assert(/code-reviewer \| invoked/.test(sum), 'T8: compliance row code-reviewer invoked (review mode delegated)');
  const st = fs.readFileSync(statePath(root, 'issue-1'), 'utf8');
  assert(/next_command: \/kaola-workflow-finalize issue-1/.test(st), 'T8: state routes to finalize');
  assert(st.includes(SINK_BLOCK), 'T8: ## Sink preserved on PASSED');
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T9: idempotent re-run of every state-mutating subcommand (no duplicate sections/rows)
// ---------------------------------------------------------------------------
{
  const root = makeProject('issue-1', { 'workflow-state.md': STATE_WITH_SINK });
  // plan-setup twice -> second is a no-op
  run(root, ['plan-setup', '--project', 'issue-1']);
  const r2 = run(root, ['plan-setup', '--project', 'issue-1']);
  assert(r2.json && r2.json.idempotent === true && r2.json.state_written === false, 'T9: plan-setup re-run idempotent');

  const packet = JSON.stringify({ write_set: ['a.js'], acceptance_command: 'true', plan: 'x' });
  run(root, ['plan-capture', '--project', 'issue-1', '--stdin'], packet);
  const pc2 = run(root, ['plan-capture', '--project', 'issue-1', '--stdin'], packet);
  assert(pc2.json && pc2.json.idempotent === true, 'T9: plan-capture re-run with same packet idempotent');
  const sum = fs.readFileSync(summaryPath(root, 'issue-1'), 'utf8');
  assert((sum.match(/##\s+Status/g) || []).length === 1, 'T9: plan-capture re-run does not duplicate ## Status section');
  assert((sum.match(/\| planner \|/g) || []).length === 1, 'T9: plan-capture re-run does not duplicate compliance rows');

  run(root, ['execute-setup', '--project', 'issue-1']);
  const es2 = run(root, ['execute-setup', '--project', 'issue-1']);
  assert(es2.json && es2.json.idempotent === true, 'T9: execute-setup re-run idempotent');

  run(root, ['acceptance-consequence', '--project', 'issue-1', '--decision', 'proceed']);
  run(root, ['acceptance-consequence', '--project', 'issue-1', '--decision', 'proceed']);
  const st = fs.readFileSync(statePath(root, 'issue-1'), 'utf8');
  assert((st.match(/## Sink/g) || []).length === 1, 'T9: consequence re-run does not duplicate ## Sink');
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T10: crash-order — fast-summary REVIEW but state pointer stale (step: plan) -> orient deterministic
// ---------------------------------------------------------------------------
{
  const staleState = [
    'phase: fast', 'step: plan', 'workflow_path: fast',
    'next_command: /kaola-workflow-fast issue-1', '', SINK_BLOCK, '',
  ].join('\n');
  const reviewSummary = '# Fast Summary: issue-1\n\n## Status\nREVIEW\n\n## Scope\n- Write Set: a.js\n- Acceptance: true\n';
  const root = makeProject('issue-1', { 'workflow-state.md': staleState, 'fast-summary.md': reviewSummary });
  const r = run(root, ['orient', '--project', 'issue-1']);
  assert(r.json && r.json.result === 'ok', 'T10: orient ok on crash-order fixture');
  assert(r.json.fast_step === 'review', 'T10: fast_step derived from fast-summary status (review), authoritative over stale state');
  assert(r.json.state_step === 'plan', 'T10: reports actual stale state_step');
  assert(r.json.state_pointer_stale === true, 'T10: flags state_pointer_stale deterministically');
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T11: corrupt fast-summary status -> typed refusal (no guessing)
// ---------------------------------------------------------------------------
{
  const root = makeProject('issue-1', { 'fast-summary.md': '# Fast Summary: issue-1\n\n## Status\nBOGUS\n' });
  const r = run(root, ['orient', '--project', 'issue-1']);
  assert(r.status === 1 && r.json.reason === 'corrupt_fast_state', 'T11: orient refuses corrupt status');
  assert(typeof r.json.operator_hint === 'string' && r.json.operator_hint, 'T11: refusal carries operator_hint');
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T12: arg/validation guards (json required, project required/safe, subcommand known)
// ---------------------------------------------------------------------------
{
  const root = makeProject('issue-1', {});
  const noJson = spawnSync(process.execPath, [SCRIPT, 'orient', '--project', 'issue-1', '--root', root], { encoding: 'utf8' });
  assert(noJson.status === 1, 'T12: --json required');
  const reserved = run(root, ['orient', '--project', 'kaola-workflow']);
  assert(reserved.status === 1 && reserved.json.reason === 'invalid_project', 'T12: reserved project refused');
  const traversal = run(root, ['orient', '--project', '../etc']);
  assert(traversal.status === 1 && traversal.json.reason === 'invalid_project', 'T12: path-traversal project refused');
  const unknown = run(root, ['frobnicate', '--project', 'issue-1']);
  assert(unknown.status === 1 && unknown.json.reason === 'unknown_subcommand', 'T12: unknown subcommand refused');
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// T13: no contractor dispatch text remains in the migrated fast command/SKILL surfaces;
//      each surface routes to the EDITION-CORRECT (forge-prefixed) transaction script
// ---------------------------------------------------------------------------
{
  const surfaces = [
    { rel: 'commands/kaola-workflow-fast.md', script: 'kaola-workflow-fast-advance.js' },
    { rel: 'plugins/kaola-workflow-gitlab/commands/kaola-workflow-fast.md', script: 'kaola-gitlab-workflow-fast-advance.js' },
    { rel: 'plugins/kaola-workflow-gitea/commands/kaola-workflow-fast.md', script: 'kaola-gitea-workflow-fast-advance.js' },
    { rel: 'plugins/kaola-workflow/skills/kaola-workflow-fast/SKILL.md', script: 'kaola-workflow-fast-advance.js' },
    { rel: 'plugins/kaola-workflow-gitlab/skills/kaola-workflow-fast/SKILL.md', script: 'kaola-gitlab-workflow-fast-advance.js' },
    { rel: 'plugins/kaola-workflow-gitea/skills/kaola-workflow-fast/SKILL.md', script: 'kaola-gitea-workflow-fast-advance.js' },
  ];
  for (const { rel, script } of surfaces) {
    const p = path.join(REPO, rel);
    if (!fs.existsSync(p)) { assert(false, 'T13: surface missing: ' + rel); continue; }
    const text = fs.readFileSync(p, 'utf8');
    assert(!/subagent_type="contractor"/.test(text), 'T13: no contractor dispatch in ' + rel);
    // the migrated surface must call the EDITION-CORRECT transaction script
    assert(text.includes(script), 'T13: ' + rel + ' must route to ' + script);
    // command/skill route names stay forge-neutral (never forge-prefixed)
    assert(!/kaola-(gitlab|gitea)-workflow-(fast |phase1|research|finalize)/.test(text),
      'T13: ' + rel + ' must keep command/skill route names forge-neutral');
  }
}

// ---------------------------------------------------------------------------
// T14: rich claim.js-shaped state is preserved surgically (NOT whitelist-reconstructed)
//      — the sections claim.js writes must survive a fast-path state rewrite.
// ---------------------------------------------------------------------------
{
  const CLAIM_STATE = [
    '# Kaola-Workflow State', '',
    '## Project', 'name: issue-1', 'status: active', '',
    '## Current Position', 'phase: fast', 'phase_name: Fast', 'workflow_path: fast',
    'runtime: claude', 'step: start', 'next_command: /kaola-workflow-fast issue-1',
    'next_skill: kaola-workflow-fast issue-1', 'main_session_role: orchestrator',
    'implementation_owner: N/A', 'fix_owner: N/A', 'inline_emergency_fallback_authorized: no', '',
    '## Pending Gates', '- fast-summary', '',
    '## Last Evidence', 'phase_file: N/A', 'cache_file: N/A', 'last_command: startup', 'last_result: folder_claimed', '',
    '## Last Updated', '2026-06-14T00:00:00.000Z', '',
    SINK_BLOCK, '',
  ].join('\n');
  const RICH_SECTIONS = ['# Kaola-Workflow State', '## Project', 'status: active', '## Current Position',
    'runtime: claude', 'fix_owner: N/A', '## Pending Gates', '- fast-summary', '## Last Evidence',
    'last_command: startup', 'last_result: folder_claimed', '## Last Updated', '2026-06-14T00:00:00.000Z'];

  const root = makeProject('issue-1', { 'workflow-state.md': CLAIM_STATE });
  run(root, ['plan-setup', '--project', 'issue-1']);
  let st = fs.readFileSync(statePath(root, 'issue-1'), 'utf8');
  for (const sec of RICH_SECTIONS) assert(st.includes(sec), 'T14: plan-setup preserves rich section: ' + sec);
  assert(/step: plan/.test(st), 'T14: plan-setup updates step in place');
  assert(/implementation_owner: planner/.test(st), 'T14: plan-setup updates owner in place (was N/A)');
  assert(st.includes(SINK_BLOCK), 'T14: ## Sink preserved');
  // updated in place, not duplicated
  assert((st.match(/^step:/gm) || []).length === 1, 'T14: no duplicate step field');
  assert((st.match(/^## Current Position/gm) || []).length === 1, 'T14: no duplicate Current Position');

  // through plan-capture (execute) + escalate — rich sections STILL survive
  run(root, ['plan-capture', '--project', 'issue-1', '--stdin'], JSON.stringify({ write_set: ['a.js'], acceptance_command: 'true' }));
  run(root, ['acceptance-consequence', '--project', 'issue-1', '--decision', 'escalate', '--stdin'], JSON.stringify({ trigger: 'security', detail: 'auth concern' }));
  st = fs.readFileSync(statePath(root, 'issue-1'), 'utf8');
  for (const sec of RICH_SECTIONS) assert(st.includes(sec), 'T14: escalate preserves rich section: ' + sec);
  assert(/workflow_path: full/.test(st), 'T14: escalate updates workflow_path in place');
  assert(/escalated_to_full: security — auth concern/.test(st), 'T14: escalate appends escalated_to_full field');
  assert((st.match(/^workflow_path:/gm) || []).length === 1, 'T14: no duplicate workflow_path field');
  fs.rmSync(root, { recursive: true, force: true });
}

if (failed > 0) {
  console.error('test-fast-advance: ' + failed + ' FAILED, ' + passed + ' passed');
  process.exit(1);
}
console.log('test-fast-advance: all ' + passed + ' assertions passed');
