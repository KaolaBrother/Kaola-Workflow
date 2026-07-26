#!/usr/bin/env node
'use strict';

// Unit tests for the TWO hash-covered, freeze-only plan sections — `## Design` (the durable
// decomposition intent) and its sibling `## Acceptance` (the durable human-values surface).
// The acceptance block (T6..T12) lives here because the two sections share one mechanism:
// conditional hash append, fence-aware section identity, and a completeness wall at the END of
// the freeze wall that revalidateForResume never reads.
//
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

// ===========================================================================
// `## Acceptance` — the human-values surface (#815). Sibling of `## Design`, same mechanism.
// ===========================================================================

// A CODE-PRODUCING schema-2 spine plan (implementer → code-reviewer → main-session-gate → sink),
// which is exactly the class the acceptance wall ranges over. `acceptanceBody`: null => omit the
// heading entirely; '' => an EMPTY section; otherwise the section body.
function codePlan(acceptanceBody) {
  const lines = [
    '# Workflow Plan — acceptance-section', '',
    '## Meta', 'plan_schema_version: 2', 'plan_form: spine', 'labels: enhancement',
    'code_certifier: rv', 'security_certifier: none',
    'inherited_frontier_digest: none', 'inherited_frontier_classes: none',
    'validation_command: node --check lib/impl.js', 'validation_timeout_minutes: 5', '',
    '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape | gate_claim | gate_surface | gate_aggregation | certifies |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    '| impl | implementer | — | lib/impl.js | 1 | sequence | — | — | — | — |',
    '| rv | code-reviewer | impl | — | 1 | sequence | review-change | code-tree | sequence | — |',
    '| gate | main-session-gate | rv | — | 1 | sequence | review-change | code-tree | sequence | — |',
    '| done | finalize | gate | CHANGELOG.md | 1 | sequence | — | — | — | — |', '',
    '## Node Briefs', '', '### impl', 'Build lib/impl.js.', '', '### rv', 'Review.', '',
    '### gate', 'Gate.', '', '### done', 'Finalize.', '',
    '## Design', '',
    'Decompose: impl builds lib/impl.js; rv gates; gate clears; done sinks. sequence impl→rv: S1 — rv consumes impl\'s change.', '',
  ];
  if (acceptanceBody !== null) {
    lines.push('## Acceptance', '');
    if (acceptanceBody !== '') lines.push(acceptanceBody);
    lines.push('');
  }
  lines.push('## Node Ledger', '', '| id | status |', '| --- | --- |',
    '| impl | pending |', '| rv | pending |', '| gate | pending |', '| done | pending |', '');
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// T6: acceptance_missing — a CODE-PRODUCING schema-2 plan refuses an absent OR empty `## Acceptance`;
//     a non-empty one freezes. (RED before the wall exists: both froze in-grammar.)
// ---------------------------------------------------------------------------
{
  const absent = pv.validatePlan(codePlan(null), { root: repoRoot });
  assert(absent.result === 'refuse' && absent.reason === 'acceptance_missing',
    'T6: a code-producing plan with NO ## Acceptance refuses acceptance_missing, got ' + JSON.stringify(absent.result) + '/' + JSON.stringify(absent.reason));

  const empty = pv.validatePlan(codePlan(''), { root: repoRoot });
  assert(empty.result === 'refuse' && empty.reason === 'acceptance_missing',
    'T6: an EMPTY ## Acceptance refuses acceptance_missing, got ' + JSON.stringify(empty.result) + '/' + JSON.stringify(empty.reason));

  const present = pv.validatePlan(
    codePlan('A1: lib/impl.js exports run() and returns the parsed record.\nA2: `node --check lib/impl.js` passes.'),
    { root: repoRoot });
  assert(present.result === 'in-grammar',
    'T6: a non-empty ## Acceptance freezes in-grammar, got ' + JSON.stringify(present.result) + ' / ' + JSON.stringify(present.errors));

  // The wall is EXISTENCE-ONLY: no sub-grammar, no testability judgement. A section of bare prose with
  // no item lines at all, and a section whose items are openly unmeasurable, both freeze.
  assert(pv.validatePlan(codePlan('Done when the maintainer is happy with it.'), { root: repoRoot }).result === 'in-grammar',
    'T6: a prose-only ## Acceptance (no A<n>: items) still freezes — the wall checks existence, not shape');
  assert(pv.validatePlan(codePlan('A1: the code feels right.'), { root: repoRoot }).result === 'in-grammar',
    'T6: an item that merely LOOKS untestable is NOT freeze-refused (testability is judged, not matched)');
}

// ---------------------------------------------------------------------------
// T7: a NON-CODE plan is not refused — the wall is scoped exactly like the schema-2
//     validation-policy posture (code producers owe a statement of done; readers do not).
// ---------------------------------------------------------------------------
{
  const readOnly = pv.validatePlan(
    spinePlan('Decompose: explore then finalize. sequence explore→done: S1 explore feeds done.'),
    { root: repoRoot });
  assert(readOnly.result === 'in-grammar',
    'T7: a schema-2 NON-code-producing plan freezes with NO ## Acceptance, got ' + JSON.stringify(readOnly.reason || readOnly.errors));
}

// ---------------------------------------------------------------------------
// T8: HASH BACK-COMPAT — an ACCEPTANCE-LESS plan hashes BYTE-IDENTICALLY to the pre-#815 formula.
//     GOLDEN is the hash the pre-#815 computePlanHash produced on these exact bytes. Making the
//     `## Acceptance` append UNCONDITIONAL turns this RED (the mutation check).
// ---------------------------------------------------------------------------
{
  const acceptanceLess = [
    '# Workflow Plan — acceptance-hash-backcompat', '',
    '## Meta', 'plan_schema_version: 2', 'plan_form: spine', 'labels: enhancement',
    'code_certifier: none', 'security_certifier: none',
    'inherited_frontier_digest: none', 'inherited_frontier_classes: none', '',
    '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '| --- | --- | --- | --- | --- | --- |',
    '| explore | code-explorer | — | — | 1 | sequence |',
    '| done | finalize | explore | CHANGELOG.md | 1 | sequence |', '',
    '## Node Briefs', '', '### explore', 'Explore the codebase.', '', '### done', 'Finalize.', '',
    '## Design', '', 'Decompose: explore then done. sequence explore→done: S1 explore feeds done.', '',
    '## Node Ledger', '', '| id | status |', '| --- | --- |',
    '| explore | pending |', '| done | pending |', '',
  ].join('\n') + '\n';
  const GOLDEN = '57cc29d36c74df85098d135044cffd1b55c0a8182dd3923046735ea72fefe34e';
  assert(pv.computePlanHash(acceptanceLess) === GOLDEN,
    'T8: an acceptance-less plan hashes BYTE-IDENTICALLY to the pre-#815 golden, got ' + pv.computePlanHash(acceptanceLess));

  // A plan FROZEN before #815 (acceptance-less, hash-stamped) resume-checks unchanged — the wall is
  // FREEZE-ONLY, so revalidateForResume never refuses absence.
  const frozen = acceptanceLess.replace('# Workflow Plan', '<!-- plan_hash: ' + GOLDEN + ' -->\n\n# Workflow Plan');
  assert(pv.revalidateForResume(frozen, { root: repoRoot }).ok === true,
    'T8: an acceptance-less frozen plan resume-checks OK (the wall is freeze-only)');

  // The same holds for a CODE-PRODUCING plan frozen before the section existed: it must still resume.
  const legacyCode = codePlan(null);
  const legacyFrozen = legacyCode.replace('# Workflow Plan',
    '<!-- plan_hash: ' + pv.computePlanHash(legacyCode) + ' -->\n\n# Workflow Plan');
  assert(pv.revalidateForResume(legacyFrozen, { root: repoRoot }).ok === true,
    'T8: a CODE-PRODUCING plan frozen before ## Acceptance existed still resume-checks OK — no in-flight wedge');

  // SCOPE PIN: the wall belongs to the FREEZE path and nowhere else. The barrier choreography
  // (--record-base / --barrier-check / --gate-verify) runs against ALREADY-FROZEN plans, so a
  // mid-flight run frozen before the section existed must sail through it untouched. Moving the
  // acceptance check out of the freeze wall and onto the barrier/resume path turns this RED.
  const midRun = legacyFrozen.replace('| impl | pending |', '| impl | in_progress |');
  const barrier = pv.barrierCheck(midRun, ['lib/impl.js'], { nodeId: 'impl' });
  assert(barrier.result === 'pass',
    'T8: --barrier-check over an acceptance-less FROZEN plan passes — the wall is freeze-only, never a barrier gate, got '
      + JSON.stringify(barrier.result) + '/' + JSON.stringify(barrier.reason));
  assert(pv.validatePlan(codePlan(null), { root: repoRoot }).reason === 'acceptance_missing',
    'T8: ...while a FRESH freeze of the same shape is still refused (the pin is not vacuous)');
}

// ---------------------------------------------------------------------------
// T9: HASH COVERAGE WHEN PRESENT — a post-freeze edit to `## Acceptance` => plan_hash_mismatch.
//     This is what makes the transcribed values TAMPER-EVIDENT.
// ---------------------------------------------------------------------------
{
  const withAcceptance = codePlan('A1: lib/impl.js exports run().\nA2: `node --check lib/impl.js` passes.');
  const hash = pv.computePlanHash(withAcceptance);
  const frozen = withAcceptance.replace('# Workflow Plan', '<!-- plan_hash: ' + hash + ' -->\n\n# Workflow Plan');
  assert(pv.revalidateForResume(frozen, { root: repoRoot }).ok === true,
    'T9: a frozen plan WITH ## Acceptance resume-checks clean before tamper');

  const tampered = frozen.replace('A2: `node --check lib/impl.js` passes.', 'A2: nothing in particular.');
  const rr = pv.revalidateForResume(tampered, { root: repoRoot });
  assert(rr.ok === false && rr.reasonCode === 'plan_hash_mismatch',
    'T9: a post-freeze ## Acceptance edit surfaces plan_hash_mismatch, got ' + JSON.stringify(rr.reasonCode));

  // Deleting an item is equally visible.
  const trimmed = frozen.replace('A2: `node --check lib/impl.js` passes.\n', '');
  assert(pv.revalidateForResume(trimmed, { root: repoRoot }).reasonCode === 'plan_hash_mismatch',
    'T9: DELETING an acceptance item post-freeze surfaces plan_hash_mismatch too');
}

// ---------------------------------------------------------------------------
// T10: acceptance_section_ambiguous — duplicate `## Acceptance` headings refuse (mirrors design/briefs).
// ---------------------------------------------------------------------------
{
  const dup = codePlan('A1: alpha.').replace('## Acceptance\n\nA1: alpha.',
    '## Acceptance\n\nA1: alpha.\n\n## Acceptance\n\nA1: a duplicate block — identity ambiguous.');
  const v = pv.validatePlan(dup, { root: repoRoot });
  assert(v.result === 'refuse' && v.reason === 'acceptance_section_ambiguous',
    'T10: duplicate ## Acceptance headings refuse acceptance_section_ambiguous, got ' + JSON.stringify(v.result) + '/' + JSON.stringify(v.reason));
}

// ---------------------------------------------------------------------------
// T11: parseAcceptanceItems — the ONE item reader. Item lines only, in document order, fence-aware.
//      No sub-grammar is parsed (no types, no priorities, no verification bindings): whatever follows
//      the colon is opaque prose handed to a judge.
// ---------------------------------------------------------------------------
{
  const items = pv.parseAcceptanceItems(codePlan(
    'A1: the freeze wall refuses an acceptance-less code plan.\n'
    + 'Some framing prose that is not an item.\n'
    + 'A2: the section is hash-covered.\n'
    + '```\nA3: a decoy inside a fence is body text, not an item.\n```\n'
    + 'A10: two-digit ordinals parse.'));
  assert(items.length === 3, 'T11: exactly the three genuine item lines parse, got ' + JSON.stringify(items));
  assert(items.map(i => i.id).join(',') === 'A1,A2,A10',
    'T11: items come back in document order with their ids, got ' + items.map(i => i.id).join(','));
  assert(items[0].text === 'the freeze wall refuses an acceptance-less code plan.',
    'T11: the item text is opaque prose, carried verbatim, got ' + JSON.stringify(items[0].text));
  assert(pv.parseAcceptanceItems(codePlan(null)).length === 0,
    'T11: an absent ## Acceptance parses to [] (never throws)');
  assert(pv.parseAcceptanceItems(codePlan('Prose with no items at all.')).length === 0,
    'T11: a prose-only section parses to [] — items are optional, the section is not');
}

// ---------------------------------------------------------------------------
// T12: acceptanceDigest — the identity the repair fence and the re-plan preservation wall compare.
//      Whitespace churn is NOT a change; an absent section is `null`, distinct from any digest.
// ---------------------------------------------------------------------------
{
  const a = pv.acceptanceDigest(codePlan('A1: alpha.\nA2: beta.'));
  const b = pv.acceptanceDigest(codePlan('   A1: alpha.   \n\n\n   A2: beta.'));
  assert(a && a === b, 'T12: whitespace churn does not change the acceptance digest');
  assert(pv.acceptanceDigest(codePlan('A1: alpha.\nA2: GAMMA.')) !== a,
    'T12: an edited item DOES change the acceptance digest');
  assert(pv.acceptanceDigest(codePlan(null)) === null,
    'T12: an ABSENT ## Acceptance digests to null — "never transcribed" is distinguishable from any content');
  assert(pv.acceptanceDigest(codePlan('')) === '' || typeof pv.acceptanceDigest(codePlan('')) === 'string',
    'T12: an EMPTY (present) section digests to a string, not null');
}

if (failed > 0) {
  console.error('test-plan-design-section: ' + failed + ' failed, ' + passed + ' passed');
  process.exit(1);
}
console.log('test-plan-design-section: all ' + passed + ' assertions passed (design + acceptance sections)');
