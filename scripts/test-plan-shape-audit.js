#!/usr/bin/env node
'use strict';

// Unit tests for the #789 plan-altitude audit-only telemetry + serializer-evidence flag:
//   D1  plan_shape telemetry (node_count / critical_path_length / parallelism_ratio /
//       per_depth_widths / disjoint-write antichains / evidence_less_sequence_edges)
//   D2  serializer-evidence existence check on plan-level `sequence` edges (audit-only, tighten-only)
//   D0  the no-target survey selection record (Meta reader) + the two new pre-claim survey verdicts
//       (backlog_empty / selection_indeterminate) that join the target_indeterminate family,
//       failing closed without claiming or writing any state.
//
// Hand-rolled assert + counter; repo style (no framework). Pure/CLI only — NOTHING is written
// inside the repo tree (survey-verdict CLI runs in $TMPDIR and must leave it empty).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const pv = require('./kaola-workflow-plan-validator');
const handoff = require('./kaola-workflow-adaptive-handoff');

let passed = 0;
let failed = 0;
function assert(condition, message) {
  if (condition) { passed++; } else { failed++; console.error('FAIL: ' + message); }
}

const repoRoot = path.resolve(__dirname, '..');
const handoffScript = path.join(repoRoot, 'scripts', 'kaola-workflow-adaptive-handoff.js');

// Build a validator-shaped node quickly (mirrors parseNodes shape for the fields the audit reads).
function node(id, role, dependsOn, writeSet, shape) {
  return {
    id, role,
    dependsOn: dependsOn || [],
    writeSet: new Set(writeSet || []),
    writeSetRaw: (writeSet || []).join(', '),
    shape: pv.parseNodes([
      '## Nodes', '', '| id | role | shape |', '|---|---|---|',
      '| ' + id + ' | ' + role + ' | ' + (shape || 'sequence') + ' |', '',
    ].join('\n'))[0].shape,
    selectorSource: '',
  };
}

// ---------------------------------------------------------------------------
// D2 (1): NON-VACUITY — a disjoint-write serial chain with NO named serializer FLAGS.
//   A (writes scripts/a.js)  →  B (depends_on A, writes scripts/b.js), disjoint exact files,
//   both plain writer roles, B's brief names no S1/S2/S3 → the A→B edge is flagged.
// Removing the check (evidenceLessSerializingEdges → []) turns THIS assertion RED.
// ---------------------------------------------------------------------------
{
  const nodes = [
    node('a', 'implementer', [], ['scripts/a.js']),
    node('b', 'implementer', ['a'], ['scripts/b.js']),
  ];
  const briefs = new Map([
    ['a', 'Implement a.'],
    ['b', 'Implement b independently of a.'],   // NO S1/S2/S3
  ]);
  const flagged = pv.evidenceLessSerializingEdges(nodes, briefs);
  assert(Array.isArray(flagged) && flagged.length === 1,
    'D2(1): a disjoint-write serial edge with no named serializer FLAGS (got ' + JSON.stringify(flagged) + ')');
  assert(flagged.length === 1 && flagged[0].from === 'a' && flagged[0].to === 'b',
    'D2(1): the flagged edge is a→b (dependent names the serial claim), got ' + JSON.stringify(flagged));
}

// ---------------------------------------------------------------------------
// D2 (2): a NAMED serializer (S1/S2/S3 token in the dependent brief) does NOT flag.
// ---------------------------------------------------------------------------
{
  const nodes = [
    node('a', 'implementer', [], ['scripts/a.js']),
    node('b', 'implementer', ['a'], ['scripts/b.js']),
  ];
  const briefs = new Map([
    ['a', 'Implement a.'],
    ['b', 'S1: consumes the exported table a writes to scripts/a.js before writing scripts/b.js.'],
  ]);
  const flagged = pv.evidenceLessSerializingEdges(nodes, briefs);
  assert(Array.isArray(flagged) && flagged.length === 0,
    'D2(2): a named S1 serializer in the dependent brief does NOT flag (got ' + JSON.stringify(flagged) + ')');
}

// ---------------------------------------------------------------------------
// D2 (3): a gate/selector/loop relation is NEVER a candidate (structural ordering already explains it).
//   A (writer) → review (code-reviewer, a gate role) with no serializer prose does NOT flag.
// ---------------------------------------------------------------------------
{
  const nodes = [
    node('a', 'implementer', [], ['scripts/a.js']),
    node('review', 'code-reviewer', ['a'], []),   // gate role, empty write set
  ];
  const briefs = new Map([['a', 'Implement a.'], ['review', 'Review a.']]);
  const flagged = pv.evidenceLessSerializingEdges(nodes, briefs);
  assert(flagged.length === 0, 'D2(3): a gate-role dependent is not a serializer-evidence candidate (got ' + JSON.stringify(flagged) + ')');
}

// ---------------------------------------------------------------------------
// D2 (4): an EXACT-FILE overlap edge is NOT flagged — the shared file IS the (S2) serializer.
// ---------------------------------------------------------------------------
{
  const nodes = [
    node('a', 'implementer', [], ['scripts/shared.js']),
    node('b', 'implementer', ['a'], ['scripts/shared.js']),
  ];
  const briefs = new Map([['a', 'Write shared.'], ['b', 'Also write shared.']]);
  const flagged = pv.evidenceLessSerializingEdges(nodes, briefs);
  assert(flagged.length === 0, 'D2(4): an exact-file overlap edge is self-serialized (not flagged), got ' + JSON.stringify(flagged));
}

// ---------------------------------------------------------------------------
// D1 (1): computePlanShape returns the full telemetry block; D1 and D2 SHARE ONE computation
// (evidence_less_sequence_edges is the D2 list).
// ---------------------------------------------------------------------------
{
  const nodes = [
    node('a', 'implementer', [], ['scripts/a.js']),
    node('b', 'implementer', ['a'], ['scripts/b.js']),
    node('done', 'finalize', ['b'], ['CHANGELOG.md']),
  ];
  const briefs = new Map([['a', 'a'], ['b', 'b'], ['done', 'done']]);
  const edges = pv.evidenceLessSerializingEdges(nodes, briefs);
  const shape = pv.computePlanShape(nodes, edges);
  assert(shape && typeof shape === 'object', 'D1(1): computePlanShape returns an object');
  assert(shape.node_count === 3, 'D1(1): node_count===3, got ' + shape.node_count);
  assert(shape.critical_path_length === 3, 'D1(1): critical_path_length===3 (a→b→done), got ' + shape.critical_path_length);
  assert(shape.parallelism_ratio === 1, 'D1(1): parallelism_ratio===1 (3/3), got ' + shape.parallelism_ratio);
  assert(Array.isArray(shape.per_depth_widths) && shape.per_depth_widths.join(',') === '1,1,1',
    'D1(1): per_depth_widths===[1,1,1], got ' + JSON.stringify(shape.per_depth_widths));
  assert(shape.antichains && typeof shape.antichains.count === 'number' && typeof shape.antichains.max_width === 'number',
    'D1(1): antichains {count,max_width} present, got ' + JSON.stringify(shape.antichains));
  assert(shape.evidence_less_sequence_edges === edges,
    'D1(1): plan_shape reports the SAME D2 edge list (one computation)');
}

// ---------------------------------------------------------------------------
// D1 (2): a disjoint-write ANTICHAIN (two writers at the same depth, no exact overlap) is counted.
// ---------------------------------------------------------------------------
{
  const nodes = [
    node('root', 'code-explorer', [], []),
    node('w1', 'implementer', ['root'], ['scripts/w1.js']),
    node('w2', 'implementer', ['root'], ['agents/w2.md']),
    node('done', 'finalize', ['w1', 'w2'], ['CHANGELOG.md']),
  ];
  const shape = pv.computePlanShape(nodes, []);
  assert(shape.antichains.count >= 1, 'D1(2): >=1 disjoint-write antichain counted, got ' + JSON.stringify(shape.antichains));
  assert(shape.antichains.max_width === 2, 'D1(2): antichain max_width===2, got ' + shape.antichains.max_width);
  assert(shape.parallelism_ratio > 1, 'D1(2): parallelism_ratio>1 for a fanned plan, got ' + shape.parallelism_ratio);
}

// ---------------------------------------------------------------------------
// D1 (3): plan_shape is present on the validatePlan in-grammar return AND surfaced by --freeze-checked.
// ---------------------------------------------------------------------------
{
  const plan = [
    '# Workflow Plan — shape-audit', '',
    '## Meta', 'plan_schema_version: 2', 'plan_form: spine', 'labels: enhancement',
    'code_certifier: none', 'security_certifier: none',
    'inherited_frontier_digest: none', 'inherited_frontier_classes: none', '',
    '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '| --- | --- | --- | --- | --- | --- |',
    '| explore | code-explorer | — | — | 1 | sequence |',
    '| done | finalize | explore | CHANGELOG.md | 1 | sequence |', '',
    '## Design', '', 'Decompose: explore then finalize. sequence explore→done: S1 — done consumes explore\'s findings. Done: CHANGELOG updated.', '',
    '## Node Ledger', '', '| id | status |', '| --- | --- |',
    '| explore | pending |', '| done | pending |', '',
  ].join('\n') + '\n';
  const v = pv.validatePlan(plan, { root: repoRoot });
  assert(v.result === 'in-grammar', 'D1(3): fixture plan is in-grammar, got ' + JSON.stringify(v.result) + ' / ' + JSON.stringify(v.errors));
  assert(v.plan_shape && typeof v.plan_shape === 'object', 'D1(3): validatePlan in-grammar return carries plan_shape');
  assert(v.plan_shape && v.plan_shape.node_count === 2, 'D1(3): plan_shape.node_count===2, got ' + (v.plan_shape && v.plan_shape.node_count));
  assert(v.plan_shape && Array.isArray(v.plan_shape.evidence_less_sequence_edges),
    'D1(3): plan_shape carries evidence_less_sequence_edges array');

  // --freeze-checked surfaces plan_shape (the handoff reads it from here).
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-shape-'));
  try {
    const pfile = path.join(tmp, 'workflow-plan.md');
    fs.writeFileSync(pfile, plan);
    const r = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'kaola-workflow-plan-validator.js'), pfile, '--freeze-checked', '--json'],
      { encoding: 'utf8' });
    let out = null; try { out = JSON.parse((r.stdout || '').trim().split('\n').pop()); } catch (_) {}
    assert(out && out.result === 'in-grammar', 'D1(3): --freeze-checked is in-grammar, got ' + JSON.stringify(out && out.result));
    assert(out && out.plan_shape && out.plan_shape.node_count === 2,
      'D1(3): --freeze-checked output surfaces plan_shape, got ' + JSON.stringify(out && out.plan_shape));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ---------------------------------------------------------------------------
// D0 (1): parseSelectionRecord reads the no-target survey selection record from ## Meta;
// absent when no selection_* field is present (explicit-target mode unchanged).
// ---------------------------------------------------------------------------
{
  const withSel = [
    '## Meta', 'plan_schema_version: 2',
    'selection_bundle: 789',
    'selection_priority_basis: is the frontier; guardrails honored',
    'selection_rejected: 785 (machine-local, not release-blocking)',
    'selection_disjointness: single-issue batch; disjoint script/agent lanes', '',
  ].join('\n') + '\n';
  const s = pv.parseSelectionRecord(withSel).selection;
  assert(s && s.bundle === '789', 'D0(1): selection.bundle parsed, got ' + JSON.stringify(s));
  assert(s && /frontier/.test(s.priority_basis), 'D0(1): selection.priority_basis parsed');
  assert(s && /785/.test(s.rejected), 'D0(1): selection.rejected parsed');
  assert(s && /disjoint/.test(s.disjointness), 'D0(1): selection.disjointness parsed');

  const noSel = ['## Meta', 'plan_schema_version: 2', 'labels: x', ''].join('\n') + '\n';
  assert(pv.parseSelectionRecord(noSel).selection === null,
    'D0(1): no selection_* field => selection is null (explicit-target mode unchanged)');
}

// ---------------------------------------------------------------------------
// D0 (1b): a full plan carrying selection_* Meta fields still validates in-grammar and the in-grammar
// return surfaces `selection` (Meta stays extensible; no unknown-field refusal).
// ---------------------------------------------------------------------------
{
  const plan = [
    '# Workflow Plan — sel', '',
    '## Meta', 'plan_schema_version: 2', 'plan_form: spine', 'labels: enhancement',
    'code_certifier: none', 'security_certifier: none',
    'inherited_frontier_digest: none', 'inherited_frontier_classes: none',
    'selection_bundle: 789',
    'selection_priority_basis: is the frontier; guardrails honored',
    'selection_rejected: 785 (machine-local)',
    'selection_disjointness: disjoint script/agent lanes', '',
    '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '| --- | --- | --- | --- | --- | --- |',
    '| explore | code-explorer | — | — | 1 | sequence |',
    '| done | finalize | explore | CHANGELOG.md | 1 | sequence |', '',
    '## Design', '', 'Decompose: explore then finalize. sequence explore→done: S1 — done consumes explore\'s findings. Done: CHANGELOG updated.', '',
    '## Node Ledger', '', '| id | status |', '| --- | --- |',
    '| explore | pending |', '| done | pending |', '',
  ].join('\n') + '\n';
  const v = pv.validatePlan(plan, { root: repoRoot });
  assert(v.result === 'in-grammar', 'D0(1b): plan with selection_* Meta is in-grammar, got ' + JSON.stringify(v.errors));
  assert(v.selection && v.selection.bundle === '789', 'D0(1b): validatePlan surfaces selection, got ' + JSON.stringify(v.selection));
}

// ---------------------------------------------------------------------------
// D0 (2): the two new pre-claim survey verdicts join the target_indeterminate family in the SAME
// typed shape (status/result/claim/issue/project/reasoning_class/reasoning) and NEVER claim.
// ---------------------------------------------------------------------------
{
  for (const status of ['backlog_empty', 'selection_indeterminate']) {
    const v = handoff.surveyVerdict(status, 'because reasons');
    assert(v.status === status, 'D0(2): surveyVerdict status===' + status + ', got ' + JSON.stringify(v.status));
    assert(v.result === 'escalate', 'D0(2): ' + status + ' result===escalate (joins target_indeterminate family)');
    assert(v.claim === 'none', 'D0(2): ' + status + ' claim===none (fail closed, never claims)');
    assert(v.issue === null && v.project === null, 'D0(2): ' + status + ' issue/project null (pre-claim, no target)');
    assert(typeof v.reasoning_class === 'string' && v.reasoning_class.length > 0, 'D0(2): ' + status + ' carries reasoning_class');
    assert(v.reasoning === 'because reasons', 'D0(2): ' + status + ' carries the supplied reasoning');
  }
  // unknown verdict fails closed to selection_indeterminate (never a claim).
  const bad = handoff.surveyVerdict('not_a_verdict');
  assert(bad.status === 'selection_indeterminate' && bad.claim === 'none',
    'D0(2): unknown survey status fails closed to selection_indeterminate/claim=none, got ' + JSON.stringify(bad));
}

// ---------------------------------------------------------------------------
// D0 (3): the survey-verdict CLI fails closed WITHOUT writing any state (runs BEFORE any claim).
// Runs in an EMPTY tmp dir with no project/state; asserts exit 1, typed JSON, and no file created.
// ---------------------------------------------------------------------------
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-survey-'));
  try {
    const before = fs.readdirSync(tmp);
    const r = spawnSync(process.execPath, [handoffScript, '--survey-verdict', 'backlog_empty', '--reason', 'no claimable bundle', '--json'],
      { cwd: tmp, encoding: 'utf8' });
    assert(r.status === 1, 'D0(3): survey-verdict CLI exits 1 (escalate/non-ready), got ' + r.status);
    let out = null; try { out = JSON.parse((r.stdout || '').trim().split('\n').pop()); } catch (_) {}
    assert(out && out.status === 'backlog_empty' && out.result === 'escalate' && out.claim === 'none',
      'D0(3): survey-verdict CLI emits the typed backlog_empty shape, got ' + JSON.stringify(out));
    assert(out && out.reasoning === 'no claimable bundle', 'D0(3): survey-verdict CLI carries the supplied --reason');
    const after = fs.readdirSync(tmp);
    assert(before.length === 0 && after.length === 0,
      'D0(3): survey-verdict CLI writes NO state/plan file (dir stays empty), got ' + JSON.stringify(after));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ---------------------------------------------------------------------------
// #825 (B3 + B2 relocation): selection/survey moves OUT of the planner and INTO the orchestrator.
//
// This block asserts the RE-HOMING, in both directions, on the prose surfaces:
//
//   (A) The planner is narrowed to a synthesist/shaper — the no-target survey mode is GONE from
//       every planner profile, and the frontmatter/description no longer advertises it.
//   (B) The ranking rules land VERBATIM on the SIX `next` routing surfaces (one wording, re-homed
//       — not paraphrased), together with the Gate 1 vocabulary the orchestrator must now speak.
//   (C) The SIX `adapt` surfaces hand the planner EVIDENCE PATHS (.cache/origin/) and know the
//       clarification return.
//   (D) The planner gains the shape-around-cited-evidence obligation. Per the issue this is
//       JUDGMENT-enforced with NO new refusal code: assert the obligation's PRESENCE only —
//       never attempt to assert node-level non-redundancy, which is not mechanically decidable.
//   (E) The control boundary is UNCHANGED and still pinned (a synthesizer handed a conclusion
//       stops synthesizing) — this is the one measured-history override of the freedom principle.
//   (F) The new typed tokens are pinned in ALL FIVE contract validators, so a later edition edit
//       cannot silently drop one edition's copy.
//
// RED (pre-impl): the survey block is still in the 4 planner profiles and in the `next` surfaces
// only as a pointer AT the planner; none of the relocated ranking rules, the Gate 1 flags, the
// obligation prose, or the clarification token exist anywhere yet.
// ---------------------------------------------------------------------------
{
  const gen825 = require('./generate-routing-surfaces.js');
  const read825 = (p) => { try { return fs.readFileSync(path.join(repoRoot, p), 'utf8'); } catch (_) { return null; } };

  // The four non-additive planner profiles. The opencode + kimi runtime editions RENDER their
  // planner profile from agents/workflow-planner.md at install time (there is no separate checked-in
  // copy), so covering the .md covers them.
  const PLANNER_PROFILES_825 = [
    'agents/workflow-planner.md',
    'plugins/kaola-workflow/agents/workflow-planner.toml',
    'plugins/kaola-workflow-gitlab/agents/workflow-planner.toml',
    'plugins/kaola-workflow-gitea/agents/workflow-planner.toml',
  ];
  const surfaces825 = (topic) => gen825.GENERATED_SURFACES.filter(s => s.topic === topic).map(s => s.path);
  const NEXT_SURFACES_825 = surfaces825('next');
  const ADAPT_SURFACES_825 = surfaces825('adapt');
  const CONTRACT_VALIDATORS_825 = [
    'scripts/validate-workflow-contracts.js',
    'scripts/validate-kaola-workflow-contracts.js',
    'plugins/kaola-workflow/scripts/validate-workflow-contracts.js',
    'plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js',
    'plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js',
  ];

  assert(NEXT_SURFACES_825.length === 6,
    '#825 fixture: the `next` topic must render SIX surfaces, got ' + NEXT_SURFACES_825.length);
  assert(ADAPT_SURFACES_825.length === 6,
    '#825 fixture: the `adapt` topic must render SIX surfaces, got ' + ADAPT_SURFACES_825.length);

  // --- (A) the survey mode is RETIRED from every planner profile ---
  for (const p of PLANNER_PROFILES_825) {
    const body = read825(p);
    assert(body !== null, '#825(A) fixture: ' + p + ' must exist');
    assert(body === null || !body.includes('No-target survey mode'),
      '#825(A): the no-target survey mode must be RETIRED from ' + p
        + ' (selection is orchestrator-owned now)');
  }
  {
    const md = read825('agents/workflow-planner.md') || '';
    assert(!md.includes('surveys the backlog itself'),
      '#825(A): the planner frontmatter description must stop advertising the retired survey mode '
        + '(agents/workflow-planner.md still says "surveys the backlog itself")');
  }

  // --- (B) the ranking rules land VERBATIM on the six `next` surfaces, with the Gate 1 vocabulary.
  // These are the exact tokens the planner survey block owned; "one wording, re-homed" means they
  // must appear on the orchestrator surface, not be reworded there.
  const RELOCATED_RANKING_TOKENS_825 = [
    'Bundle Selection Rules',     // bundle rules
    'lane_bucket',                // co-tenant lane handling
    '### Project rules',          // roadmap guardrail block
  ];
  const GATE1_TOKENS_825 = [
    '--selection-record',
    'selection_record_missing',
    'selection_mode',
  ];
  for (const p of NEXT_SURFACES_825) {
    const body = read825(p);
    assert(body !== null, '#825(B) fixture: ' + p + ' must exist');
    for (const token of RELOCATED_RANKING_TOKENS_825) {
      assert(body !== null && body.includes(token),
        '#825(B): the relocated ranking rule token ' + JSON.stringify(token)
          + ' must appear VERBATIM on ' + p + ' (one wording, re-homed — not paraphrased)');
    }
    for (const token of GATE1_TOKENS_825) {
      assert(body !== null && body.includes(token),
        '#825(B): the Gate 1 token ' + JSON.stringify(token) + ' must reach ' + p
          + ' — the orchestrator authors the record and must be told what refuses without it');
    }
  }

  // --- (C) the six `adapt` surfaces hand the planner evidence PATHS + the clarification return ---
  for (const p of ADAPT_SURFACES_825) {
    const body = read825(p);
    assert(body !== null, '#825(C) fixture: ' + p + ' must exist');
    assert(body !== null && body.includes('.cache/origin/'),
      '#825(C): ' + p + ' must hand the planner the reconnaissance evidence PATH '
        + '(.cache/origin/) — evidence flows in, conclusions never do');
    assert(body !== null && body.includes('clarification_required'),
      '#825(C): ' + p + ' must carry the typed clarification_required return so the orchestrator '
        + 'knows to ask the user and re-dispatch');
  }

  // --- (D) the shape-around-cited-evidence obligation, PRESENCE ONLY (judgment-enforced) ---
  const OBLIGATION_TOKENS_825 = [
    'do not author a node to re-derive it',
    'Consume evidence, never accept a conclusion',
  ];
  for (const p of PLANNER_PROFILES_825) {
    const body = read825(p);
    for (const token of OBLIGATION_TOKENS_825) {
      assert(body !== null && body.includes(token),
        '#825(D): the shape-around-cited-evidence obligation token ' + JSON.stringify(token)
          + ' must be present in ' + p + ' (prose obligation only — node-level non-redundancy is '
          + 'NOT mechanically decidable and must never be asserted here)');
    }
    assert(body !== null && body.includes('clarification_required'),
      '#825(D): the planner profile ' + p + ' must define the typed clarification_required return');
  }

  // --- (E) CONTROL: the control boundary is UNCHANGED and still pinned everywhere it was ---
  for (const p of PLANNER_PROFILES_825.concat(ADAPT_SURFACES_825)) {
    const body = read825(p);
    assert(body !== null && body.includes('planner_control_boundary_violation'),
      '#825(E) CONTROL: the planner control boundary must stay pinned in ' + p
        + ' — B3 narrows the planner, it does not open it to prescriptions');
  }

  // --- (F) the new typed tokens are pinned in ALL FIVE contract validators ---
  for (const v of CONTRACT_VALIDATORS_825) {
    const body = read825(v);
    assert(body !== null, '#825(F) fixture: ' + v + ' must exist');
    assert(body !== null && body.includes('selection_record_missing'),
      '#825(F): ' + v + ' must pin selection_record_missing (Gate 1 is the script refusal that '
        + "replaces ADR 0006's prose-only planner-first lock)");
    assert(body !== null && body.includes('clarification_required'),
      '#825(F): ' + v + ' must pin clarification_required so no edition silently loses the channel');
  }
}

// ---------------------------------------------------------------------------
// GRAMMAR: issue-scout is fully retired from the plan-node-role registry.
// ---------------------------------------------------------------------------
{
  assert(!('issue-scout' in pv.ROLE_TOKEN_REGISTRY), 'GRAMMAR: issue-scout removed from ROLE_TOKEN_REGISTRY');
  assert(!pv.PRODUCER_ROLES.has('issue-scout'), 'GRAMMAR: issue-scout removed from PRODUCER_ROLES');
}

if (failed > 0) {
  console.error('test-plan-shape-audit: ' + failed + ' failed, ' + passed + ' passed');
  process.exit(1);
}
console.log('test-plan-shape-audit: all ' + passed + ' assertions passed (#789 D0/D1/D2)');
