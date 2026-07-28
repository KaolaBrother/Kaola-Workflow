#!/usr/bin/env node
'use strict';

// Unit tests for kaola-workflow-plan-validator.js freeze-time dischargeability walls
// (currently: the #830 freeze-completeness family):
//
//   T830-WSA-*  writeset_foreign_archive (REFUSAL) — a declared write set intersecting a FOREIGN
//               project's archive band refuses at freeze, one phase before the runtime barrier
//               (whose foreign_archive refusal is unconditional and first-in-precedence), with an
//               operator hint naming the legal homes. The band predicate is the barrier's OWN
//               (foreignArchivePath): own band + own `.archived-` band pass; an indeterminate
//               project fail-CLOSES (any archive-band token is foreign); the screen fires FIRST,
//               ahead of the accumulated grammar errors; and it is FREEZE-ONLY (revalidateForResume
//               never reads it — a pre-wall frozen plan resumes).
//   T830-CFU-*  child_frontier_unclosable (REFUSAL) — a review_repair_requires_replan child epoch
//               with a non-empty inherited findings frontier and NO declared validation policy
//               (validation_command + validation_timeout_minutes) can never produce the vector
//               digest a closure resolution must cite, so it refuses at freeze. Discharged at the
//               END of the freeze wall: a plan broken on any accumulated grammar error surfaces
//               THAT first (load-bearing for the G4 `/inherited_frontier/` fixture in
//               test-adaptive-handoff.js). Review-scoped: other transitions are not held.
//   T830-FWW-*  frontier_without_writer (ADVISORY, never a refusal) — the same child shape with
//               the policy declared but ZERO writer nodes freezes in-grammar carrying
//               warnings:[{warning:'frontier_without_writer',...}]; a writer node or an expansion
//               point (a potential writer) suppresses it; an empty-frontier child flags nothing.
//   T830-CLI-*  the CLI envelopes the handoff consumes: plain --json preserves the typed reason +
//               operator_hint verbatim; --freeze-checked collapses a refuse to the plan_invalid
//               emit envelope with the full typed text in errors; --freeze-checked/--freeze pass
//               the in-grammar warnings payload through.
//
// Hand-rolled assert + counter; repo style (no framework). In-process except the T830-CLI block,
// which drives the real validator binary over temp-dir plans (nothing written inside the repo).

const pv = require('./kaola-workflow-plan-validator');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

let passed = 0;
let failed = 0;
function assert(condition, message) {
  if (condition) { passed++; } else { failed++; console.error('FAIL: ' + message); }
}

const repoRoot = path.resolve(__dirname, '..');
const VALIDATOR = path.join(__dirname, 'kaola-workflow-plan-validator.js');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// A schema-2 spine child epoch, parameterized over Meta extras and the node table. Default
// transition is review_repair_requires_replan; the frontier shape (classes/digest) and the
// validation policy are the variables under test. Every node row gets matching ## Node Ledger
// and ## Required Agent Compliance rows.
function childPlan(opts) {
  const nodes = opts.nodes;
  const row = n => '| ' + n.id + ' | ' + n.role + ' | ' + (n.depends_on || '—') + ' | ' + (n.write_set || '—')
    + ' | 1 | ' + (n.shape || 'sequence') + ' | ' + (n.observes || '—') + ' | ' + (n.gate_claim || '—')
    + ' | ' + (n.gate_surface || '—') + ' | ' + (n.gate_aggregation || '—') + ' | ' + (n.certifies || '—') + ' |';
  const sections = [
    '# Workflow Plan — test-project', '',
    '## Meta', 'plan_form: spine', 'plan_schema_version: 2', 'contract_version: 2', 'epoch_schema_version: 2', 'plan_epoch: 2',
    'epoch_lineage_id: ' + '1'.repeat(64), 'parent_plan_hash: ' + '2'.repeat(64),
    'parent_snapshot_manifest_digest: pending', 'claim_root_base_digest: ' + '3'.repeat(64),
    'source_evidence_digest: ' + '5'.repeat(64), 'transition_reason: ' + (opts.transition || 'review_repair_requires_replan'),
    'planner_binding: dispatch-830', 'labels: area:scripts', 'sink: CHANGELOG.md',
    'code_certifier: ' + (opts.code_certifier || 'none'), 'security_certifier: none',
    'inherited_frontier_digest: ' + opts.digest, 'inherited_frontier_classes: ' + opts.classes,
    ...(opts.extraMeta || []), '',
    '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape | observes | gate_claim | gate_surface | gate_aggregation | certifies |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...nodes.map(row), '',
    '## Design', '',
    'Decompose: a child epoch over the inherited frontier; the sequence edges are gate/data dependencies (S1). Done: the named certifier clears the inherited frontier.', '',
  ];
  if (opts.acceptance) {
    sections.push('## Acceptance', '',
      'A1: the inherited frontier closes against the recorded validation policy.',
      'A2: the recorded validation_command passes over the candidate.', '');
  }
  sections.push(
    '## Node Ledger', '', '| id | status |', '| --- | --- |',
    ...nodes.map(n => '| ' + n.id + ' | pending |'), '',
    '## Required Agent Compliance', '', '| Requirement | Status | Evidence | Skip Reason |', '| --- | --- | --- | --- |',
    ...nodes.map(n => '| ' + n.role + ' (' + n.id + ') | pending | | |'), '');
  return sections.join('\n') + '\n';
}

// Certification-only child: zero writer nodes (a named code certifier + the terminal sink).
const CERT_NODES = [
  { id: 'seed', role: 'code-explorer' },
  { id: 'child-review', role: 'code-reviewer', depends_on: 'seed',
    gate_claim: 'current code candidate is approved', gate_surface: 'full code candidate', gate_aggregation: 'sequence' },
  { id: 'finalize', role: 'finalize', depends_on: 'child-review' },
];
// Same child with a genuine writer feeding the certifier.
const WRITER_NODES = [
  { id: 'seed', role: 'code-explorer' },
  { id: 'w', role: 'doc-updater', depends_on: 'seed', write_set: 'docs/decisions/D-830-01.md' },
  { id: 'child-review', role: 'code-reviewer', depends_on: 'w',
    gate_claim: 'current code candidate is approved', gate_surface: 'full code candidate', gate_aggregation: 'sequence' },
  { id: 'finalize', role: 'finalize', depends_on: 'child-review' },
];
// Same child whose only possible writer lives inside an uncomposed expansion point.
const EXPANSION_NODES = [
  { id: 'm1', role: 'expansion-point' },
  { id: 'child-review', role: 'code-reviewer', depends_on: 'm1',
    gate_claim: 'current code candidate is approved', gate_surface: 'full code candidate', gate_aggregation: 'sequence' },
  { id: 'finalize', role: 'finalize', depends_on: 'child-review' },
];
const EXPANSION_META = [
  'validation_command: node scripts/test-plan-validator.js', 'validation_timeout_minutes: 30', '',
  'expansion(m1):',
  '  milestone_goal: close out the inherited frontier repairs',
  '  expected_surfaces: scripts/',
  '  join_constraints: none',
  '  review_class: code-reviewer',
];
const POLICY = ['validation_command: node scripts/test-plan-validator.js', 'validation_timeout_minutes: 30'];

// A minimal in-grammar spine plan whose single writer carries a parameterized write-set token —
// the writeset_foreign_archive screen's fixture. No epoch contract (the screen is not schema-2-scoped).
function writeSetPlan(token) {
  return [
    '# Workflow Plan — test-project', '',
    '## Meta', 'plan_schema_version: 2', 'plan_form: spine', 'labels: enhancement',
    'code_certifier: none', 'security_certifier: none',
    'inherited_frontier_digest: none', 'inherited_frontier_classes: none', '',
    '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '| --- | --- | --- | --- | --- | --- |',
    '| explore | code-explorer | — | — | 1 | sequence |',
    '| w | doc-updater | explore | ' + token + ' | 1 | sequence |',
    '| done | finalize | w | CHANGELOG.md | 1 | sequence |', '',
    '## Design', '',
    'Decompose: explore probes, w lands the doc, done sinks. sequence edges: S1 data dependencies. Done: the doc and CHANGELOG land.', '',
    '## Node Ledger', '', '| id | status |', '| --- | --- |',
    '| explore | pending |', '| w | pending |', '| done | pending |', '',
  ].join('\n') + '\n';
}

const FOREIGN_TOKEN = 'kaola-workflow/archive/other-project/evidence.md';
const OWN_TOKEN = 'kaola-workflow/archive/test-project/evidence.md';

// ---------------------------------------------------------------------------
// T830-WSA-1: a declared write set intersecting a FOREIGN project's archive band refuses
//             writeset_foreign_archive at freeze — typed reason, and an operator hint naming the
//             offending node/path plus the legal homes for retained evidence.
// ---------------------------------------------------------------------------
{
  const v = pv.validatePlan(writeSetPlan(FOREIGN_TOKEN), { root: repoRoot, project: 'test-project' });
  assert(v.result === 'refuse' && v.reason === 'writeset_foreign_archive',
    'T830-WSA-1: a foreign-archive declared write set refuses writeset_foreign_archive, got '
    + JSON.stringify({ result: v.result, reason: v.reason }));
  assert(typeof v.operator_hint === 'string'
    && v.operator_hint.includes('Node w ')
    && v.operator_hint.includes(FOREIGN_TOKEN),
    'T830-WSA-1: the operator hint names the offending node id and the declared token, got ' + JSON.stringify(v.operator_hint));
  assert(typeof v.operator_hint === 'string'
    && v.operator_hint.includes("the owning project's own kaola-workflow/<project>/ lane")
    && v.operator_hint.includes('the archive step of finalization'),
    'T830-WSA-1: the operator hint names BOTH legal homes (owning project lane; archive step of finalization), got '
    + JSON.stringify(v.operator_hint));
  assert(Array.isArray(v.errors) && v.errors.some(e => e.includes('foreign project')
    && e.includes(FOREIGN_TOKEN) && e.includes('finalization')),
    'T830-WSA-1: the errors carry the typed refusal text naming the token and the legal homes, got ' + JSON.stringify(v.errors));
}

// ---------------------------------------------------------------------------
// T830-WSA-2: PRECEDENCE — the screen mirrors the barrier's first-in-precedence posture: a plan
//             broken on BOTH a foreign-archive write set AND accumulated grammar errors refuses
//             writeset_foreign_archive (never the grammar family).
// ---------------------------------------------------------------------------
{
  // classes 'code' + digest 'none' is an accumulated G4 grammar error; the foreign token must win.
  const broken = childPlan({ classes: 'code', digest: 'none', code_certifier: 'child-review', nodes: [
    { id: 'seed', role: 'code-explorer' },
    { id: 'w', role: 'doc-updater', depends_on: 'seed', write_set: FOREIGN_TOKEN },
    { id: 'child-review', role: 'code-reviewer', depends_on: 'w',
      gate_claim: 'current code candidate is approved', gate_surface: 'full code candidate', gate_aggregation: 'sequence' },
    { id: 'finalize', role: 'finalize', depends_on: 'child-review' },
  ] });
  const v = pv.validatePlan(broken, { root: repoRoot, project: 'test-project' });
  assert(v.result === 'refuse' && v.reason === 'writeset_foreign_archive',
    'T830-WSA-2: the write-set screen fires FIRST, ahead of the accumulated grammar errors, got '
    + JSON.stringify({ result: v.result, reason: v.reason, errors: v.errors }));
}

// ---------------------------------------------------------------------------
// T830-WSA-3/4: NEGATIVE SPACE — the owning project's OWN archive band and its own `.archived-`
//               band are not foreign: both freeze clean (in-grammar, no warnings).
// ---------------------------------------------------------------------------
{
  const own = pv.validatePlan(writeSetPlan(OWN_TOKEN), { root: repoRoot, project: 'test-project' });
  assert(own.result === 'in-grammar' && !own.warnings,
    'T830-WSA-3: the owning project\'s own archive band freezes clean (no refusal, no warnings), got '
    + JSON.stringify({ result: own.result, errors: own.errors, warnings: own.warnings }));

  const archived = pv.validatePlan(writeSetPlan('kaola-workflow/archive/test-project.archived-20260727/evidence.md'),
    { root: repoRoot, project: 'test-project' });
  assert(archived.result === 'in-grammar' && !archived.warnings,
    'T830-WSA-4: the owning project\'s own .archived- band freezes clean, got '
    + JSON.stringify({ result: archived.result, errors: archived.errors, warnings: archived.warnings }));
}

// ---------------------------------------------------------------------------
// T830-WSA-5: FAIL-CLOSED — when the project is indeterminate (no opts.project, no opts.planPath),
//             ANY kaola-workflow/archive/<dir>/ token counts as foreign, even an own-looking one.
// ---------------------------------------------------------------------------
{
  const v = pv.validatePlan(writeSetPlan(OWN_TOKEN), { root: repoRoot });
  assert(v.result === 'refuse' && v.reason === 'writeset_foreign_archive',
    'T830-WSA-5: an indeterminate project fail-closes — even an own-looking archive token refuses, got '
    + JSON.stringify({ result: v.result, reason: v.reason }));
}

// ---------------------------------------------------------------------------
// T830-WSA-6: project resolution from opts.planPath (the CLI posture) — the parent directory name
//             of kaola-workflow/<project>/workflow-plan.md is the owning project.
// ---------------------------------------------------------------------------
{
  const planPath = path.join(repoRoot, 'kaola-workflow', 'test-project', 'workflow-plan.md');
  const own = pv.validatePlan(writeSetPlan(OWN_TOKEN), { root: repoRoot, planPath });
  assert(own.result === 'in-grammar',
    'T830-WSA-6: opts.planPath resolves the owning project — the own-band token freezes clean, got '
    + JSON.stringify({ result: own.result, errors: own.errors }));
  const foreign = pv.validatePlan(writeSetPlan(FOREIGN_TOKEN), { root: repoRoot, planPath });
  assert(foreign.result === 'refuse' && foreign.reason === 'writeset_foreign_archive',
    'T830-WSA-6: the same planPath still refuses a foreign band, got '
    + JSON.stringify({ result: foreign.result, reason: foreign.reason }));
}

// ---------------------------------------------------------------------------
// T830-WSA-7: a `./`-prefixed declared token normalizes before the band predicate runs.
// ---------------------------------------------------------------------------
{
  const v = pv.validatePlan(writeSetPlan('./' + FOREIGN_TOKEN), { root: repoRoot, project: 'test-project' });
  assert(v.result === 'refuse' && v.reason === 'writeset_foreign_archive',
    'T830-WSA-7: a ./-prefixed foreign-archive token still refuses, got '
    + JSON.stringify({ result: v.result, reason: v.reason }));
}

// ---------------------------------------------------------------------------
// T830-WSA-8: FREEZE-ONLY — the screen is deliberately absent from revalidateForResume: a plan
//             frozen BEFORE this wall (hash-stamped, foreign token inside) resume-checks OK.
//             Tighten-only: the check binds at freeze, never mid-route.
// ---------------------------------------------------------------------------
{
  const content = writeSetPlan(FOREIGN_TOKEN);
  const hash = pv.computePlanHash(content);
  const stamped = content.replace('# Workflow Plan', '<!-- plan_hash: ' + hash + ' -->\n\n# Workflow Plan');
  const rr = pv.revalidateForResume(stamped, { root: repoRoot });
  assert(rr.ok === true,
    'T830-WSA-8: a pre-wall frozen plan carrying a foreign-archive token resume-checks OK (freeze-only wall), got '
    + JSON.stringify({ ok: rr.ok, reason: rr.reason || rr.reasonCode }));
}

// ---------------------------------------------------------------------------
// T830-CFU-1: a review_repair child epoch with a NON-EMPTY inherited frontier and NO declared
//             validation policy refuses child_frontier_unclosable — typed reason + hint naming
//             validation_command / validation_timeout_minutes and the ## Meta fix.
// ---------------------------------------------------------------------------
{
  const v = pv.validatePlan(
    childPlan({ classes: 'code', digest: '4'.repeat(64), code_certifier: 'child-review', nodes: CERT_NODES }),
    { root: repoRoot, project: 'test-project' });
  assert(v.result === 'refuse' && v.reason === 'child_frontier_unclosable',
    'T830-CFU-1: a zero-vector review_repair child with a non-empty frontier refuses child_frontier_unclosable, got '
    + JSON.stringify({ result: v.result, reason: v.reason }));
  assert(typeof v.operator_hint === 'string'
    && v.operator_hint.includes('validation_command') && v.operator_hint.includes('validation_timeout_minutes')
    && v.operator_hint.includes('## Meta'),
    'T830-CFU-1: the operator hint names validation_command / validation_timeout_minutes and the ## Meta fix, got '
    + JSON.stringify(v.operator_hint));
  assert(Array.isArray(v.errors) && v.errors.some(e => e.includes('validation_command') && e.includes('frontier')),
    'T830-CFU-1: the errors explain the unclosable frontier and name the missing policy, got ' + JSON.stringify(v.errors));
}

// ---------------------------------------------------------------------------
// T830-CFU-2: ORDERING (load-bearing for the G4 `/inherited_frontier/` fixture in
//             test-adaptive-handoff.js) — the refusal discharges at the END of the freeze wall:
//             a plan broken on accumulated grammar errors surfaces THOSE, never
//             child_frontier_unclosable, even when the unclosable condition also holds.
// ---------------------------------------------------------------------------
{
  // classes 'code' + digest 'none' + no validation policy: grammar-broken AND unclosable.
  const v = pv.validatePlan(
    childPlan({ classes: 'code', digest: 'none', code_certifier: 'child-review', nodes: CERT_NODES }),
    { root: repoRoot, project: 'test-project' });
  assert(v.result === 'refuse' && v.reason !== 'child_frontier_unclosable'
    && (v.errors || []).some(e => /inherited_frontier/.test(e)),
    'T830-CFU-2: a grammar-broken child surfaces the /inherited_frontier/ grammar error FIRST (the unclosable wall waits), got '
    + JSON.stringify({ result: v.result, reason: v.reason, errors: v.errors }));
}

// ---------------------------------------------------------------------------
// T830-CFU-3: the policy is conjunctive — HALF a declaration (command without timeout, or timeout
//             without command) is still zero usable vectors and refuses identically.
// ---------------------------------------------------------------------------
{
  const cmdOnly = pv.validatePlan(
    childPlan({ classes: 'code', digest: '4'.repeat(64), code_certifier: 'child-review', nodes: CERT_NODES,
      extraMeta: ['validation_command: node scripts/test-plan-validator.js'] }),
    { root: repoRoot, project: 'test-project' });
  assert(cmdOnly.result === 'refuse' && cmdOnly.reason === 'child_frontier_unclosable',
    'T830-CFU-3: validation_command without validation_timeout_minutes still refuses, got '
    + JSON.stringify({ result: cmdOnly.result, reason: cmdOnly.reason }));
  const timeoutOnly = pv.validatePlan(
    childPlan({ classes: 'code', digest: '4'.repeat(64), code_certifier: 'child-review', nodes: CERT_NODES,
      extraMeta: ['validation_timeout_minutes: 30'] }),
    { root: repoRoot, project: 'test-project' });
  assert(timeoutOnly.result === 'refuse' && timeoutOnly.reason === 'child_frontier_unclosable',
    'T830-CFU-3: validation_timeout_minutes without validation_command still refuses, got '
    + JSON.stringify({ result: timeoutOnly.result, reason: timeoutOnly.reason }));
}

// ---------------------------------------------------------------------------
// T830-CFU-4: REVIEW-SCOPE — the wall keys on transition_reason review_repair_requires_replan:
//             a diagnosis_to_build child with the same frontier/policy shape is NOT held.
// ---------------------------------------------------------------------------
{
  const v = pv.validatePlan(
    childPlan({ transition: 'diagnosis_to_build', classes: 'code', digest: '4'.repeat(64),
      code_certifier: 'child-review', nodes: CERT_NODES }),
    { root: repoRoot, project: 'test-project' });
  assert(v.result === 'in-grammar' && !v.warnings,
    'T830-CFU-4: a diagnosis_to_build child is outside the review_repair wall (in-grammar, no warnings), got '
    + JSON.stringify({ result: v.result, errors: v.errors, warnings: v.warnings }));
}

// ---------------------------------------------------------------------------
// T830-CFU-5: NEGATIVE SPACE — an EMPTY-frontier review_repair child without any validation
//             policy stays in-grammar and raises NO advisory (nothing inherited to close).
// ---------------------------------------------------------------------------
{
  const v = pv.validatePlan(
    childPlan({ classes: 'none', digest: 'none', nodes: CERT_NODES }),
    { root: repoRoot, project: 'test-project' });
  assert(v.result === 'in-grammar' && !v.warnings,
    'T830-CFU-5: an empty-frontier child without a validation policy freezes clean (no refusal, no advisory), got '
    + JSON.stringify({ result: v.result, errors: v.errors, warnings: v.warnings }));
}

// ---------------------------------------------------------------------------
// T830-FWW-1: the certification-only child WITH a declared policy freezes IN-GRAMMAR carrying the
//             named advisory — warnings:[{warning:'frontier_without_writer', detail}] — and the
//             advisory never moves the verdict.
// ---------------------------------------------------------------------------
{
  const v = pv.validatePlan(
    childPlan({ classes: 'code', digest: '4'.repeat(64), code_certifier: 'child-review', nodes: CERT_NODES,
      extraMeta: POLICY }),
    { root: repoRoot, project: 'test-project' });
  assert(v.result === 'in-grammar',
    'T830-FWW-1: a zero-writer child with a declared policy FREEZES (advisory, never a refusal), got '
    + JSON.stringify({ result: v.result, errors: v.errors }));
  assert(Array.isArray(v.warnings) && v.warnings.length === 1
    && v.warnings[0].warning === 'frontier_without_writer'
    && typeof v.warnings[0].detail === 'string'
    && v.warnings[0].detail.includes('zero writer nodes')
    && v.warnings[0].detail.includes('certification-only'),
    'T830-FWW-1: the in-grammar verdict carries warnings:[{warning:frontier_without_writer, detail}] naming the shape, got '
    + JSON.stringify(v.warnings));
  assert(v.decision === 'auto-run' && typeof v.planHash === 'string' && /^[0-9a-f]{64}$/.test(v.planHash),
    'T830-FWW-1: the advisory never moves the verdict — decision and planHash are computed normally, got '
    + JSON.stringify({ decision: v.decision, planHash: v.planHash }));
}

// ---------------------------------------------------------------------------
// T830-FWW-2/3: SUPPRESSION — a genuine writer node suppresses the advisory; so does an expansion
//               point (its interior composes at open time, so freeze cannot prove writer-less).
// ---------------------------------------------------------------------------
{
  const writer = pv.validatePlan(
    childPlan({ classes: 'code', digest: '4'.repeat(64), code_certifier: 'child-review', nodes: WRITER_NODES,
      extraMeta: POLICY }),
    { root: repoRoot, project: 'test-project' });
  assert(writer.result === 'in-grammar' && !writer.warnings,
    'T830-FWW-2: a child carrying a real writer node freezes with NO advisory, got '
    + JSON.stringify({ result: writer.result, errors: writer.errors, warnings: writer.warnings }));

  const expansion = pv.validatePlan(
    childPlan({ classes: 'code', digest: '4'.repeat(64), code_certifier: 'child-review', nodes: EXPANSION_NODES,
      extraMeta: EXPANSION_META, acceptance: true }),
    { root: repoRoot, project: 'test-project' });
  assert(expansion.result === 'in-grammar' && !expansion.warnings,
    'T830-FWW-3: an expansion point counts as a potential writer — NO advisory, got '
    + JSON.stringify({ result: expansion.result, errors: expansion.errors, warnings: expansion.warnings }));
}

// ---------------------------------------------------------------------------
// The four child processes below are boundary class `cli-contract` and stay processes. Every
// assertion above this line already calls validatePlan() in-process; what is left is the part
// that has no in-process form — argv in, ENVELOPE and EXIT CODE out. An exit code is a
// property of a process, so converting these would not preserve the assertion, it would
// delete it.
//
// Four sites, three argv shapes. `--freeze-checked` appears twice on purpose: those are its
// two RESULT branches (the refuse envelope carrying `errors`, and the in-grammar envelope
// carrying `warnings`), which are different envelope shapes, not two scenarios of one shape.
// The ADR's "once per subcommand, not per scenario" is about scenarios; a subcommand whose
// envelope changes shape by result has one contract per shape.
// ---------------------------------------------------------------------------
// T830-CLI-1: the typed reason + operator_hint survive verbatim on the plain --json envelope
//             (validatePlan emitted as-is); the refusal exits nonzero.
// ---------------------------------------------------------------------------
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw830-cli-'));
  try {
    const proj = path.join(tmpDir, 'kaola-workflow', 'test-project');
    fs.mkdirSync(proj, { recursive: true });
    const planPath = path.join(proj, 'workflow-plan.md');
    fs.writeFileSync(planPath, childPlan({ classes: 'code', digest: '4'.repeat(64),
      code_certifier: 'child-review', nodes: CERT_NODES }));
    let out = null, code = 0;
    // spawn-class: cli-contract
    try { out = execFileSync('node', [VALIDATOR, planPath, '--json'], { encoding: 'utf8' }); }
    catch (e) { code = e.status; out = e.stdout || ''; }
    const v = JSON.parse(out);
    assert(code === 1 && v.result === 'refuse' && v.reason === 'child_frontier_unclosable'
      && typeof v.operator_hint === 'string' && v.operator_hint.includes('validation_command'),
      'T830-CLI-1: plain --json preserves the typed reason + operator_hint verbatim (exit 1), got '
      + JSON.stringify({ code, result: v.result, reason: v.reason }));
  } finally { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} }
}

// ---------------------------------------------------------------------------
// T830-CLI-2: the --freeze-checked envelope the handoff's SPAWN-1 consumes collapses a refuse to
//             the plan_invalid emit envelope — with the FULL typed text in errors (the planner's
//             bounded repair loop absorbs it like any other plan_invalid).
// ---------------------------------------------------------------------------
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw830-cli-'));
  try {
    const proj = path.join(tmpDir, 'kaola-workflow', 'test-project');
    fs.mkdirSync(proj, { recursive: true });
    const planPath = path.join(proj, 'workflow-plan.md');
    fs.writeFileSync(planPath, childPlan({ classes: 'code', digest: '4'.repeat(64),
      code_certifier: 'child-review', nodes: CERT_NODES }));
    let out = null, code = 0;
    // spawn-class: cli-contract
    try { out = execFileSync('node', [VALIDATOR, planPath, '--freeze-checked', '--json'], { encoding: 'utf8' }); }
    catch (e) { code = e.status; out = e.stdout || ''; }
    const v = JSON.parse(out);
    assert(code === 1 && v.result === 'refuse' && v.reason === 'plan_invalid'
      && Array.isArray(v.errors) && v.errors.some(e => e.includes('validation_command') && e.includes('frontier')),
      'T830-CLI-2: --freeze-checked refuses plan_invalid carrying the full typed text in errors, got '
      + JSON.stringify({ code, result: v.result, reason: v.reason, errors: v.errors }));
  } finally { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} }
}

// ---------------------------------------------------------------------------
// T830-CLI-3: the advisory payload rides BOTH freeze envelopes the handoff spawns:
//             --freeze-checked (validate, no write) and --freeze --governance-ack (write) — the
//             real wire behind the handoff's ready_to_run / child_frozen passthroughs.
// ---------------------------------------------------------------------------
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw830-cli-'));
  try {
    const proj = path.join(tmpDir, 'kaola-workflow', 'test-project');
    fs.mkdirSync(proj, { recursive: true });
    const planPath = path.join(proj, 'workflow-plan.md');
    fs.writeFileSync(planPath, childPlan({ classes: 'code', digest: '4'.repeat(64),
      code_certifier: 'child-review', nodes: CERT_NODES, extraMeta: POLICY }));

    // spawn-class: cli-contract
    const checked = JSON.parse(execFileSync('node', [VALIDATOR, planPath, '--freeze-checked', '--json'], { encoding: 'utf8' }));
    assert(checked.result === 'in-grammar' && Array.isArray(checked.warnings)
      && checked.warnings.length === 1 && checked.warnings[0].warning === 'frontier_without_writer',
      'T830-CLI-3: --freeze-checked carries the frontier_without_writer advisory on an in-grammar verdict, got '
      + JSON.stringify({ result: checked.result, warnings: checked.warnings }));

    // spawn-class: cli-contract
    const frozen = JSON.parse(execFileSync('node',
      [VALIDATOR, planPath, '--freeze', '--governance-ack', checked.planHash, '--json'], { encoding: 'utf8' }));
    assert(frozen.result === 'in-grammar' && frozen.frozen === true
      && Array.isArray(frozen.warnings) && frozen.warnings.length === 1
      && frozen.warnings[0].warning === 'frontier_without_writer',
      'T830-CLI-3: --freeze --governance-ack freezes AND carries the same advisory (the warning never blocks the write), got '
      + JSON.stringify({ result: frozen.result, frozen: frozen.frozen, warnings: frozen.warnings }));
  } finally { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} }
}


// ===========================================================================
// T833-DERIVE — `## Required Agent Compliance` is DERIVED, not stored.
//
// The stored table was a hand-maintained MIRROR of the `## Node Ledger`: every lifecycle verb
// had to remember to seed or flip a row, and three authorities refused whenever the mirror and
// the ledger disagreed. #833 deletes the stored artifact and derives the table at read time.
//
// The load-bearing evidence is a PARITY MEASUREMENT over this repo's own archive — ~190 real
// frozen plans with real stored tables, produced by the retired writer across a year of runs.
// For each one the RETIRED authority (reproduced verbatim below, so the baseline cannot drift
// with the code under test) and the new derivation are both evaluated, and every disagreement
// is classified. A corpus FLOOR is asserted so the parity claim cannot pass vacuously by
// finding zero inputs.
//
// Measured on the corpus as committed:
//   * 186 archived plans carry a stored table.
//   * 167 of them FAIL the retired stored-table authority — the mirror was wrong ~90% of the
//     time, and each of those is a project the archive / discard / replan authorities would
//     have refused to touch. That is the case for the subtraction, stated as a number.
//   * Of the 19 whose stored table was WELL-FORMED, the derivation reproduces 16 exactly and
//     disagrees on 3 — and all 3 disagreements are historical DEFECTS preserved in the
//     archive, with the derivation right and the stored row wrong:
//       - issue-270 `finalize (finalize)`      stored subagent-invoked (pre-#338: the sink's
//                                              main-session-direct rule did not exist yet)
//       - issue-530 `main-session-gate (n4-e2e)` stored subagent-invoked — this is #817's
//                                              defect verbatim: a false delegation claim on a
//                                              role that is never dispatched
//       - issue-725 `finalize (n10-finalize)`  stored pending against a `complete` ledger row —
//                                              literally `state_compliance_progress_invalid`,
//                                              the mirror-lagging-the-ledger bug this issue ends
// The three are pinned BY NAME below, so a derivation change that "fixes" the parity by
// reproducing a bug reds this suite.
// ===========================================================================
{
  const ARCHIVE_DIR = path.join(repoRoot, 'kaola-workflow', 'archive');

  // The RETIRED authority, transcribed from the pre-#833 plan-validator. Deliberately a COPY:
  // a parity baseline that imported the code under test would only ever compare it to itself.
  const RETIRED_STATUSES = new Set([
    'pending', 'invoked', 'subagent-invoked', 'local-fallback-explicit',
    'local-fallback-tool-unavailable', 'main-session-direct', 'n/a', 'na', 'skipped',
  ]);
  function retiredAuthority(content, nodes) {
    const refuse = detail => ({ ok: false, detail });
    const heading = '## Required Agent Compliance';
    const at = content.startsWith(heading) ? 0 : content.indexOf('\n' + heading);
    if (at < 0) return refuse('section is missing');
    const start = at === 0 ? 0 : at + 1;
    const after = content.slice(start + 1).indexOf('\n## ');
    const section = after < 0 ? content.slice(start) : content.slice(start, start + 1 + after);
    const lines = section.split(/\r?\n/);
    const headingIndex = lines.findIndex(line => line.trim() === heading);
    if (headingIndex < 0) return refuse('section is malformed');
    const body = lines.slice(headingIndex + 1);
    if (body.some(line => line.trim() && !/^\|.*\|[ \t]*$/.test(line))) return refuse('non-table content');
    const table = body.map(line => line.trim()).filter(line => line.startsWith('|'));
    if (table.length < 2) return refuse('table is unparseable');
    const cells = line => line.split('|').slice(1, -1).map(cell => cell.trim());
    const header = cells(table[0]).map(cell => cell.toLowerCase());
    const expectedHeader = ['requirement', 'status', 'evidence', 'skip reason'];
    if (header.length !== expectedHeader.length
      || header.some((cell, i) => cell !== expectedHeader[i])) return refuse('header');
    const separator = cells(table[1]);
    if (separator.length !== expectedHeader.length
      || separator.some(cell => !/^:?-{3,}:?$/.test(cell.replace(/\s/g, '')))) return refuse('separator');
    const rows = [];
    for (const line of table.slice(2)) {
      const row = cells(line);
      if (row.length !== expectedHeader.length || !row[0]) return refuse('row is malformed');
      const status = String(row[1] || '').toLowerCase();
      if (!RETIRED_STATUSES.has(status)) return refuse('status unsupported for ' + row[0]);
      rows.push({ requirement: row[0], status, evidence: row[2], skip_reason: row[3] });
    }
    const expected = new Set(nodes.map(node => node.role + ' (' + node.id + ')'));
    const actual = rows.map(row => row.requirement);
    if (rows.length !== nodes.length || new Set(actual).size !== rows.length
      || actual.some(req => !expected.has(req))) return refuse('not exactly one row per node');
    return { ok: true, rows };
  }

  assert(fs.existsSync(ARCHIVE_DIR),
    'T833-DERIVE: the archived-run corpus must exist — the parity claim has no evidence without it');

  let withStoredTable = 0;
  let retiredRefused = 0;
  let retiredPassed = 0;
  let rowsCompared = 0;
  const disagreements = [];

  for (const entry of fs.readdirSync(ARCHIVE_DIR).sort()) {
    const projectDir = path.join(ARCHIVE_DIR, entry);
    const planFile = path.join(projectDir, 'workflow-plan.md');
    let content;
    try { content = fs.readFileSync(planFile, 'utf8'); } catch (_) { continue; }
    if (content.indexOf('## Required Agent Compliance') < 0) continue;
    withStoredTable++;

    const execNodes = pv.planNodesWithExpansions(content);
    const derived = pv.deriveAgentCompliance(content, {
      nodes: execNodes,
      readEvidence: id => fs.readFileSync(path.join(projectDir, '.cache', id + '.md'), 'utf8'),
      readProvenance: () => fs.readFileSync(path.join(projectDir, '.cache', 'provenance-log.jsonl'), 'utf8'),
    });

    // Structural invariant, asserted on EVERY archived plan including the 167 broken ones:
    // the derivation never refuses and always yields exactly one row per execution node.
    if (!(derived.ok === true && derived.rows.length === execNodes.length
      && new Set(derived.rows.map(r => r.requirement)).size === execNodes.length)) {
      assert(false, 'T833-DERIVE: ' + entry + ' — the derivation must yield exactly one row per '
        + 'execution node and never refuse, got ' + derived.rows.length + ' rows for '
        + execNodes.length + ' nodes');
    }

    const retired = retiredAuthority(content, execNodes);
    if (!retired.ok) { retiredRefused++; continue; }
    retiredPassed++;
    const stored = new Map(retired.rows.map(row => [row.requirement, row]));
    for (const row of derived.rows) {
      rowsCompared++;
      const storedRow = stored.get(row.requirement);
      const storedStatus = storedRow ? storedRow.status : '<absent>';
      if (storedStatus !== row.status) {
        disagreements.push({ project: entry, requirement: row.requirement,
          stored: storedStatus, derived: row.status });
      }
    }
  }

  // --- the non-vacuity floors ---------------------------------------------
  assert(withStoredTable >= 150,
    'T833-DERIVE (corpus floor): at least 150 archived plans must carry a stored compliance table '
    + 'for this parity measurement to mean anything, found ' + withStoredTable);
  assert(retiredPassed >= 15,
    'T833-DERIVE (corpus floor): at least 15 of them must have a WELL-FORMED stored table, so the '
    + 'agreement half of the measurement is not vacuous either, found ' + retiredPassed);
  assert(rowsCompared >= 100,
    'T833-DERIVE (corpus floor): at least 100 rows must actually be compared, compared '
    + rowsCompared);

  // --- the case for the subtraction, as a number ---------------------------
  assert(retiredRefused >= 120,
    'T833-DERIVE: the retired stored-table authority must be measurably broken on the real corpus '
    + '(that is WHY it is retired) — expected >=120 refusals, got ' + retiredRefused
    + ' of ' + withStoredTable);

  // --- parity, with every disagreement classified --------------------------
  const KNOWN_DEFECTS = [
    // Each entry is a HISTORICAL BUG preserved in the archive, where the stored row is wrong and
    // the derivation is right. Any disagreement outside this list fails the suite.
    { requirement: 'finalize (finalize)', stored: 'subagent-invoked', derived: 'main-session-direct' },
    { requirement: 'main-session-gate (n4-e2e)', stored: 'subagent-invoked', derived: 'main-session-direct' },
    { requirement: 'finalize (n10-finalize)', stored: 'pending', derived: 'main-session-direct' },
  ];
  const unexplained = disagreements.filter(d => !KNOWN_DEFECTS.some(k =>
    k.requirement === d.requirement && k.stored === d.stored && k.derived === d.derived));
  assert(unexplained.length === 0,
    'T833-DERIVE (parity): every disagreement between the derivation and a WELL-FORMED stored '
    + 'table must be a classified historical defect. Unexplained: ' + JSON.stringify(unexplained));
  assert(disagreements.length === 3,
    'T833-DERIVE (parity, exact): the corpus carries exactly 3 classified disagreements; a change '
    + 'in this count means the derivation moved (or the corpus did) and must be re-classified, got '
    + disagreements.length + ': ' + JSON.stringify(disagreements));
  assert(disagreements.some(d => /issue-270/.test(d.project) && d.requirement === 'finalize (finalize)'),
    'T833-DERIVE: the pre-#338 sink defect must still be the FIRST classified disagreement, got '
    + JSON.stringify(disagreements));
  assert(disagreements.some(d => /issue-530/.test(d.project) && d.requirement === 'main-session-gate (n4-e2e)'),
    'T833-DERIVE: #817\'s false-delegation defect on a main-session-gate must still be present, got '
    + JSON.stringify(disagreements));
  assert(disagreements.some(d => /issue-725/.test(d.project) && d.stored === 'pending'),
    'T833-DERIVE: the `complete` ledger row against a `pending` stored row — the exact shape the '
    + 'retired state_compliance_progress_invalid existed to refuse — must still be present, got '
    + JSON.stringify(disagreements));
}

// ===========================================================================
// T833-UNIT — the derivation's own contract, exercised directly (not only through the corpus).
// ===========================================================================
{
  const mk = (ledgerRows, nodeRows) => [
    '# Workflow Plan — t833', '',
    '## Meta', 'plan_form: spine', 'labels: area:scripts', 'sink: CHANGELOG.md', '',
    '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '| --- | --- | --- | --- | --- | --- |',
    ...nodeRows, '',
    '## Node Ledger', '', '| id | status |', '| --- | --- |',
    ...ledgerRows, '',
  ].join('\n');

  const plan = mk(
    ['| a | complete |', '| b | pending |', '| c | n/a |', '| d | in_progress |', '| e | complete |'],
    ['| a | tdd-guide | — | src/a.js | 1 | sequence |',
      '| b | code-reviewer | a | — | 1 | sequence |',
      '| c | doc-updater | a | docs/x.md | 1 | sequence |',
      '| d | implementer | a | src/d.js | 1 | sequence |',
      '| e | finalize | b, c, d | CHANGELOG.md | 1 | sequence |']);

  const rows = pv.deriveAgentCompliance(plan).rows;
  const by = id => rows.find(r => r.node_id === id);
  assert(rows.length === 5, 'T833-UNIT: one row per node, got ' + rows.length);
  assert(by('a').status === 'subagent-invoked' && by('a').requirement === 'tdd-guide (a)',
    'T833-UNIT: a complete delegable node derives subagent-invoked under its canonical cell, got '
    + JSON.stringify(by('a')));
  assert(by('b').status === 'pending' && by('d').status === 'pending',
    'T833-UNIT: pending and in_progress both derive `pending`, got '
    + JSON.stringify([by('b').status, by('d').status]));
  assert(by('c').status === 'n/a' && by('c').skip_reason === 'ledger n/a',
    'T833-UNIT: an n/a ledger row derives n/a with its skip reason, got ' + JSON.stringify(by('c')));
  assert(by('e').status === 'main-session-direct',
    'T833-UNIT: the non-delegable sink derives main-session-direct, got ' + JSON.stringify(by('e')));

  // The dispatch-record override, both directions.
  const provenance = JSON.stringify({ event: 'close', nodeId: 'a', main_session_direct: true }) + '\n';
  assert(pv.deriveAgentCompliance(plan, { readProvenance: () => provenance })
    .rows.find(r => r.node_id === 'a').status === 'main-session-direct',
  'T833-UNIT: a close recorded main_session_direct overrides the delegable-role default');
  assert(pv.deriveAgentCompliance(plan, { readProvenance: () => JSON.stringify({ event: 'close', nodeId: 'a' }) })
    .rows.find(r => r.node_id === 'a').status === 'subagent-invoked',
  'T833-UNIT (mutation proof): without the field the SAME node derives subagent-invoked');
  assert(pv.deriveAgentCompliance(plan, { readProvenance: () => 'not json at all\n{' })
    .rows.find(r => r.node_id === 'a').status === 'subagent-invoked',
  'T833-UNIT: a torn/unparseable provenance journal yields no overrides, never a throw');

  // A stored table cannot influence the derivation, however broken it is.
  const withStored = plan + [
    '## Required Agent Compliance', '',
    '| requirement | state | ev |', '| --- | --- | --- |',
    '| tdd-guide (a) | banana | | |',
    '| ghost (nope) | pending | | |', '',
  ].join('\n');
  assert(JSON.stringify(pv.deriveAgentCompliance(withStored).rows) === JSON.stringify(rows),
    'T833-UNIT: a malformed stored table is inert — the derivation is byte-identical without it');

  // The renderer: hash-neutral, replaces in place, creates when absent.
  const renderedFresh = pv.renderAgentComplianceSection(plan);
  assert(renderedFresh.includes('| tdd-guide (a) | subagent-invoked |')
    && renderedFresh.includes('| finalize (e) | main-session-direct |'),
  'T833-UNIT: the renderer materializes the derived rows');
  assert(pv.computePlanHash(renderedFresh) === pv.computePlanHash(plan),
    'T833-UNIT: rendering is plan_hash-NEUTRAL (the section is outside the hash region)');
  const renderedTwice = pv.renderAgentComplianceSection(renderedFresh);
  assert(renderedTwice === renderedFresh,
    'T833-UNIT: rendering is idempotent — it REPLACES the section, never appends a second one');
  const renderedOverJunk = pv.renderAgentComplianceSection(withStored);
  assert((renderedOverJunk.match(/## Required Agent Compliance/g) || []).length === 1
    && !renderedOverJunk.includes('| ghost (nope) |'),
  'T833-UNIT: rendering over a legacy stored table replaces it wholesale, got:\n'
    + renderedOverJunk.slice(renderedOverJunk.indexOf('## Required Agent Compliance')));
}

// ===========================================================================
// T833-RETIRED — the refusal codes are DELETED, not merely unreachable.
// ===========================================================================
{
  assert(typeof pv.validateRequiredAgentCompliance === 'undefined',
    'T833-RETIRED: validateRequiredAgentCompliance is gone from the validator surface');
  assert(typeof pv.seedRequiredAgentCompliance === 'undefined',
    'T833-RETIRED: the freeze-time pre-seed is gone from the validator surface');
  assert(typeof pv.deriveAgentCompliance === 'function' && typeof pv.renderAgentComplianceSection === 'function',
    'T833-RETIRED: the derivation and the renderer are what replaced them');
  const sources = [
    'scripts/kaola-workflow-plan-validator.js',
    'scripts/kaola-workflow-replan.js',
    'scripts/kaola-workflow-adaptive-node.js',
    'scripts/kaola-workflow-claim.js',
  ];
  // Comments may narrate the retirement; no source may EMIT any of the three codes. The needle is
  // the emission shapes the refusal-route census scans for, so this cannot pass on a comment.
  const EMIT = [
    /(?:reason|reasonCode|condition)\s*:\s*'(state_compliance_[a-z_]+|required_agent_compliance_invalid)'/,
    /\brefuse\(\s*'(state_compliance_[a-z_]+|required_agent_compliance_invalid)'/,
  ];
  for (const rel of sources) {
    const text = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
    for (const re of EMIT) {
      assert(!re.test(text),
        'T833-RETIRED: ' + rel + ' must not EMIT a retired compliance refusal code, matched '
        + JSON.stringify((text.match(re) || [])[0]));
    }
  }
  // Non-vacuity: the same needles DO match a synthetic emission, so the loop above is a real check.
  assert(EMIT[1].test("  return refuse('state_compliance_progress_invalid');"),
    'T833-RETIRED (non-vacuity): the emission needle must match a real emission when one exists');
}

if (failed > 0) {
  console.error('test-plan-validator: ' + failed + ' failed, ' + passed + ' passed');
  process.exit(1);
}
console.log('test-plan-validator: all ' + passed + ' assertions passed (freeze-time dischargeability walls)');
