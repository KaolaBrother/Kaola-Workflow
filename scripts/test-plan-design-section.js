#!/usr/bin/env node
'use strict';

// Unit tests for the frozen `## Design` section (durable decomposition intent):
//   T1  design_missing        — freeze refuses an absent OR empty `## Design` (FREEZE-ONLY).
//   T2  hash back-compat       — a DESIGNLESS plan hashes BYTE-IDENTICALLY to the pre-change formula
//                                (golden hex), and a plan frozen WITHOUT `## Design` resume-checks
//                                unchanged (revalidateForResume does NOT refuse absence).
//   T3  hash coverage present  — a post-freeze edit to a PRESENT `## Design` surfaces as plan_hash_mismatch.
//   T4  design_section_ambiguous — duplicate `## Design` headings refuse (mirrors briefs ambiguity).
//   T5  D2 discharge-from-Design — an S1/S2/S3 token in `## Design` discharges a serializing edge
//                                (existence-only), an edge named NOWHERE still flags (non-vacuity).
//
// Hand-rolled assert + counter; repo style (no framework). Pure/in-process only — NOTHING is written
// inside the repo tree.

const pv = require('./kaola-workflow-plan-validator');
const path = require('path');

let passed = 0;
let failed = 0;
function assert(condition, message) {
  if (condition) { passed++; } else { failed++; console.error('FAIL: ' + message); }
}

const repoRoot = path.resolve(__dirname, '..');

// A minimal in-grammar spine plan. `designBody` (null => omit the `## Design` heading entirely;
// '' => an EMPTY section) is inserted between ## Node Briefs and ## Node Ledger. Position is free
// (computePlanHash reads sections by heading, not offset).
function spinePlan(designBody) {
  const lines = [
    '# Workflow Plan — design-section', '',
    '## Meta', 'plan_schema_version: 2', 'plan_form: spine', 'labels: enhancement',
    'code_certifier: none', 'security_certifier: none',
    'inherited_frontier_digest: none', 'inherited_frontier_classes: none', '',
    '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '| --- | --- | --- | --- | --- | --- |',
    '| explore | code-explorer | — | — | 1 | sequence |',
    '| done | finalize | explore | CHANGELOG.md | 1 | sequence |', '',
    '## Node Briefs', '',
    '### explore', 'Explore the codebase.', '',
    '### done', 'Finalize.', '',
  ];
  if (designBody !== null) {
    lines.push('## Design', '');
    if (designBody !== '') lines.push(designBody);
    lines.push('');
  }
  lines.push('## Node Ledger', '', '| id | status |', '| --- | --- |',
    '| explore | pending |', '| done | pending |', '');
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// T1: design_missing — freeze refuses an absent OR empty `## Design`; a non-empty one freezes.
//     (RED before the refusal exists: a designless plan is currently in-grammar.)
// ---------------------------------------------------------------------------
{
  const noDesign = pv.validatePlan(spinePlan(null), { root: repoRoot });
  assert(noDesign.result === 'refuse' && noDesign.reason === 'design_missing',
    'T1: a plan with NO ## Design refuses design_missing, got ' + JSON.stringify(noDesign.result) + '/' + JSON.stringify(noDesign.reason));

  const emptyDesign = pv.validatePlan(spinePlan(''), { root: repoRoot });
  assert(emptyDesign.result === 'refuse' && emptyDesign.reason === 'design_missing',
    'T1: an EMPTY ## Design refuses design_missing, got ' + JSON.stringify(emptyDesign.result) + '/' + JSON.stringify(emptyDesign.reason));

  const present = pv.validatePlan(
    spinePlan('Decompose: explore then finalize. sequence explore→done: S1 explore feeds done. Done: CHANGELOG updated.'),
    { root: repoRoot });
  assert(present.result === 'in-grammar',
    'T1: a non-empty ## Design freezes in-grammar, got ' + JSON.stringify(present.result) + ' / ' + JSON.stringify(present.errors));
}

// ---------------------------------------------------------------------------
// T2: HASH BACK-COMPAT (highest-risk claim) — a DESIGNLESS plan hashes byte-identically to the
//     pre-change formula. GOLDEN is the hash computed by the PRE-#790 computePlanHash on the exact
//     bytes of `designlessFixture` below. If the `## Design` append is made UNCONDITIONAL, this
//     assertion goes RED (the mutation check).
// ---------------------------------------------------------------------------
{
  const designlessFixture = [
    '# Workflow Plan — hash-backcompat', '',
    '## Meta', 'plan_schema_version: 2', 'plan_form: spine', 'labels: enhancement',
    'code_certifier: none', 'security_certifier: none',
    'inherited_frontier_digest: none', 'inherited_frontier_classes: none', '',
    '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '| --- | --- | --- | --- | --- | --- |',
    '| explore | code-explorer | — | — | 1 | sequence |',
    '| done | finalize | explore | CHANGELOG.md | 1 | sequence |', '',
    '## Node Briefs', '',
    '### explore', 'Explore the codebase.', '',
    '### done', 'Finalize.', '',
    '## Node Ledger', '', '| id | status |', '| --- | --- |',
    '| explore | pending |', '| done | pending |', '',
  ].join('\n') + '\n';
  const GOLDEN = '2d8fa640909d38a445f5ee664a4dca897a1cb0092dc0d14fcae6a8d04524bc8f';
  assert(pv.computePlanHash(designlessFixture) === GOLDEN,
    'T2: a designless plan hashes BYTE-IDENTICALLY to the pre-#790 golden (making the append unconditional turns this RED), got ' + pv.computePlanHash(designlessFixture));

  // A plan FROZEN before #790 (designless, hash-stamped) resume-checks unchanged — absence is NOT refused.
  const frozen = designlessFixture.replace('# Workflow Plan', '<!-- plan_hash: ' + GOLDEN + ' -->\n\n# Workflow Plan');
  const rr = pv.revalidateForResume(frozen, { root: repoRoot });
  assert(rr.ok === true,
    'T2: a designless frozen plan resume-checks OK (revalidateForResume does NOT refuse design absence), got ' + JSON.stringify(rr.reason || rr.reasonCode));
}

// ---------------------------------------------------------------------------
// T3: HASH COVERAGE WHEN PRESENT — a post-freeze edit to a present `## Design` => plan_hash_mismatch.
// ---------------------------------------------------------------------------
{
  const withDesign = spinePlan('Decompose: explore then done. sequence explore→done: S1 explore feeds done.');
  const hash = pv.computePlanHash(withDesign);
  const frozen = withDesign.replace('# Workflow Plan', '<!-- plan_hash: ' + hash + ' -->\n\n# Workflow Plan');
  // Sanity: the untouched frozen plan resume-checks clean.
  assert(pv.revalidateForResume(frozen, { root: repoRoot }).ok === true,
    'T3: a frozen plan WITH ## Design resume-checks clean before tamper');
  // Tamper the Design body only.
  const tampered = frozen.replace('S1 explore feeds done.', 'no serializer here — silently rewritten.');
  const rr = pv.revalidateForResume(tampered, { root: repoRoot });
  assert(rr.ok === false && rr.reasonCode === 'plan_hash_mismatch',
    'T3: a post-freeze ## Design edit surfaces plan_hash_mismatch (design is hash-covered when present), got ' + JSON.stringify(rr.reasonCode));
}

// ---------------------------------------------------------------------------
// T4: design_section_ambiguous — duplicate `## Design` headings refuse (mirrors briefs ambiguity).
// ---------------------------------------------------------------------------
{
  const dupDesign = [
    '# Workflow Plan — dup-design', '',
    '## Meta', 'plan_schema_version: 2', 'plan_form: spine', 'labels: enhancement',
    'code_certifier: none', 'security_certifier: none',
    'inherited_frontier_digest: none', 'inherited_frontier_classes: none', '',
    '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '| --- | --- | --- | --- | --- | --- |',
    '| explore | code-explorer | — | — | 1 | sequence |',
    '| done | finalize | explore | CHANGELOG.md | 1 | sequence |', '',
    '## Design', '', 'First design block.', '',
    '## Design', '', 'A duplicate design block — identity ambiguous.', '',
    '## Node Ledger', '', '| id | status |', '| --- | --- |',
    '| explore | pending |', '| done | pending |', '',
  ].join('\n') + '\n';
  const v = pv.validatePlan(dupDesign, { root: repoRoot });
  assert(v.result === 'refuse' && v.reason === 'design_section_ambiguous',
    'T4: duplicate ## Design headings refuse design_section_ambiguous, got ' + JSON.stringify(v.result) + '/' + JSON.stringify(v.reason));
}

// ---------------------------------------------------------------------------
// T5: D2 discharge-from-Design (audit-only, existence-only) — an S1/S2/S3 token in `## Design`
//     discharges a serializing edge even when the dependent BRIEF names none; an edge named NOWHERE
//     (empty design, no brief token) still flags (non-vacuity). Brief-based discharge stays green.
// ---------------------------------------------------------------------------
{
  const wnode = (id, dep, ws) => ({ id, role: 'implementer', dependsOn: dep,
    writeSet: new Set(ws), shape: { kind: 'sequence' }, selectorSource: '' });
  const chain = [wnode('a', [], ['scripts/a.js']), wnode('b', ['a'], ['scripts/b.js'])];
  const bareBriefs = new Map([['a', 'do a'], ['b', 'do b']]);   // NO serializer in either brief

  // Non-vacuity: no serializer in brief AND no serializer in design => STILL flags.
  assert(pv.evidenceLessSerializingEdges(chain, bareBriefs, '').length === 1,
    'T5: an edge named NOWHERE (empty design, no brief token) still flags (non-vacuity)');
  assert(pv.evidenceLessSerializingEdges(chain, bareBriefs).length === 1,
    'T5: two-arg call (no design) preserves #789 behavior — still flags');

  // Discharge-from-Design: an S1 token in `## Design` discharges the edge even with a bare brief.
  const design = 'Decompose a then b. sequence a→b: S1 — b consumes the table a writes to scripts/a.js.';
  assert(pv.evidenceLessSerializingEdges(chain, bareBriefs, design).length === 0,
    'T5: an S1 token in ## Design discharges the serializing edge (existence-only), got ' + JSON.stringify(pv.evidenceLessSerializingEdges(chain, bareBriefs, design)));

  // A design body WITHOUT any S1/S2/S3 token does NOT discharge (non-vacuity preserved).
  assert(pv.evidenceLessSerializingEdges(chain, bareBriefs, 'Prose with no serializer tokens at all.').length === 1,
    'T5: a design body with no S1/S2/S3 token does not discharge — the edge still flags');

  // #789 brief-based discharge stays green regardless of design.
  const serBriefs = new Map([['a', 'do a'], ['b', 'S1: reads a']]);
  assert(pv.evidenceLessSerializingEdges(chain, serBriefs, '').length === 0,
    'T5: a serializer in the dependent BRIEF still discharges (existing #789 behavior preserved)');
}

if (failed > 0) {
  console.error('test-plan-design-section: ' + failed + ' failed, ' + passed + ' passed');
  process.exit(1);
}
console.log('test-plan-design-section: all ' + passed + ' assertions passed (#790 design section)');
