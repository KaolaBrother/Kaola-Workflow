#!/usr/bin/env node
'use strict';

// Unit tests for the TEST-CUSTODY axis (#814): custody replaces order.
//
// The implement-role split used to be organized by ORDER (a tdd-guide node writes tests AND
// implementation in one context; an implementer is the "no natural failing test" lane), and NO rule
// on any surface forbade a role from modifying, weakening, or deleting a test. This suite covers the
// replacement — CUSTODY of the test artifact:
//
//   C1  custody wall at freeze   — a NON-test-author node declaring a test-like path refuses
//                                  (test_custody_violation); the test-author declaring the same path
//                                  freezes. RED->GREEN both ways.
//   C2  declared exemption       — a hash-covered `## Meta` `test_custody_exemption:` entry naming
//                                  <node-id> <path> — <reason> admits the write; a REASONLESS entry,
//                                  an entry for an unknown node, and an entry for a path that node
//                                  does not declare all refuse (no rubber-stamp).
//   C3  synthesizer convergence  — a synthesizer declaring the UNION of its legs' test paths is NOT a
//                                  custody violation (it reconciles, it does not originate), but a
//                                  synthesizer test path NO upstream leg declares still refuses.
//   C4  freeze-only             — revalidateForResume never applies the wall, so a plan frozen before
//                                  this rule existed still resumes (a frozen plan that stops resuming
//                                  is a silent break).
//   C5  token registry          — tdd-guide keeps RED + gains the baseline-bound `red_baseline`
//                                  receipt and LOSES GREEN; implementer DROPS `non_tdd_reason` and
//                                  keeps the verification-tier alternation, now led by `tests-green`.
//   C6  evidence shape          — checkEvidenceShape enforces C5: a tdd-guide evidence file with no
//                                  GREEN closes, one whose red_baseline does not match this open's
//                                  baseline refuses, and a legacy implementer file carrying the old
//                                  non_tdd_reason + tier still closes (tolerated on read). A legacy
//                                  tdd-guide file is tolerated only on a NONCE-LESS offline read; the
//                                  same bytes in flight refuse on the missing baseline receipt.
//   C7  route-findings          — a behavior / coverage / test-defect finding infers
//                                  fix_role=tdd-guide (the test author owns the oracle); an ordinary
//                                  finding still routes to implementer and a security finding still
//                                  wins precedence.
//
// Hand-rolled assert + counter; repo style (no framework). Pure/in-process except C6/C7, which use a
// per-run tmpdir OUTSIDE the repo tree.

const fs = require('fs');
const os = require('os');
const path = require('path');

const pv = require('./kaola-workflow-plan-validator');
const an = require('./kaola-workflow-adaptive-node');

let passed = 0;
let failed = 0;
function assert(condition, message) {
  if (condition) { passed++; } else { failed++; console.error('FAIL: ' + message); }
}

const repoRoot = path.resolve(__dirname, '..');
const hasError = (r, needle) => Array.isArray(r.errors) && r.errors.some(e => String(e).includes(needle));

// ---------------------------------------------------------------------------
// Plan fixture. `rows` are ## Nodes table rows (without the sink); `metaExtra` are extra ## Meta
// lines. A schema-1 spine plan with ## Design so the completeness wall passes and the custody wall
// is the ONLY thing under test (the schema-2 certifier contract is orthogonal to custody).
// ---------------------------------------------------------------------------
function plan(rows, metaExtra) {
  const ids = rows.map(r => r.id);
  const lines = [
    '# Workflow Plan — test-custody', '',
    '## Meta', 'plan_form: spine', 'labels: enhancement',
  ];
  for (const m of (metaExtra || [])) lines.push(m);
  lines.push('', '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '| --- | --- | --- | --- | --- | --- |');
  for (const r of rows) {
    lines.push(`| ${r.id} | ${r.role} | ${r.deps || '—'} | ${r.ws || '—'} | 1 | ${r.shape || 'sequence'} |`);
  }
  lines.push(`| review | code-reviewer | ${ids.join(', ')} | — | 1 | sequence |`);
  lines.push('| done | finalize | review | CHANGELOG.md | 1 | sequence |', '');
  lines.push('## Node Briefs', '');
  for (const r of rows) lines.push('### ' + r.id, 'Brief for ' + r.id + '.', '');
  lines.push('### review', 'Review the produced code.', '');
  lines.push('### done', 'Finalize.', '');
  lines.push('## Design', '', 'One writer per surface; every sequence edge carries S1 evidence.', '');
  lines.push('## Acceptance', '', 'A1: the behavior under test is correct for all valid inputs.', '');
  lines.push('## Node Ledger', '', '| id | status |', '| --- | --- |');
  for (const r of rows) lines.push(`| ${r.id} | pending |`);
  lines.push('| review | pending |', '| done | pending |', '');
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// C1 — the custody wall at freeze. RED half: a non-test-author node declares a test path.
//      GREEN half: the SAME path on the test-author freezes.
// ---------------------------------------------------------------------------
{
  const violating = plan([
    { id: 'impl', role: 'implementer', ws: 'src/app.js, test/app.test.js' },
  ]);
  const r = pv.validatePlan(violating, { root: repoRoot });
  assert(r.result === 'refuse', 'C1-a: an implementer declaring a test path must refuse at freeze, got ' + JSON.stringify(r.result));
  assert(hasError(r, 'test_custody_violation'), 'C1-a: the refusal names test_custody_violation, got ' + JSON.stringify(r.errors));
  assert(hasError(r, 'test/app.test.js'), 'C1-a: the refusal NAMES the offending path, got ' + JSON.stringify(r.errors));

  const custodial = plan([
    { id: 'tests', role: 'tdd-guide', ws: 'test/app.test.js' },
    { id: 'impl', role: 'implementer', deps: 'tests', ws: 'src/app.js' },
  ]);
  const g = pv.validatePlan(custodial, { root: repoRoot });
  assert(g.result === 'in-grammar', 'C1-b: the test-author declaring the test path freezes, got ' + JSON.stringify(g.result) + ' ' + JSON.stringify(g.errors));

  // C1-c: the wall is TEST-PATH-scoped, not a blanket ban — an implementer declaring only production
  // paths is untouched (without this control C1-a could pass because implementers were banned outright).
  const production = plan([{ id: 'impl', role: 'implementer', ws: 'src/app.js, src/lib.js' }]);
  assert(pv.validatePlan(production, { root: repoRoot }).result === 'in-grammar',
    'C1-c: an implementer over production paths only is unaffected by the custody wall');

  // C1-d: every test-like SHAPE the barrier attributes is walled — dir-form and suffix-form alike.
  for (const p of ['tests/x.js', '__tests__/y.js', 'spec/z.js', 'src/a.spec.ts']) {
    const one = plan([{ id: 'impl', role: 'implementer', ws: 'src/app.js, ' + p }]);
    const rr = pv.validatePlan(one, { root: repoRoot });
    assert(rr.result === 'refuse' && hasError(rr, 'test_custody_violation'),
      'C1-d: "' + p + '" is walled by custody, got ' + JSON.stringify(rr.result));
  }
}

// ---------------------------------------------------------------------------
// C2 — the DECLARED, hash-covered exemption. A named entry with a one-line reason admits the write;
//      a reasonless / unknown-node / undeclared-path entry refuses (an exemption is a declaration
//      about a real write, never a wildcard).
// ---------------------------------------------------------------------------
{
  const rows = [{ id: 'fixup', role: 'build-error-resolver', ws: 'src/app.js, test/app.test.js' }];

  const exempt = plan(rows, ['test_custody_exemption: fixup test/app.test.js — repairs the suite-breaking assertion']);
  const g = pv.validatePlan(exempt, { root: repoRoot });
  assert(g.result === 'in-grammar', 'C2-a: a declared exemption with a reason admits the write, got ' + JSON.stringify(g.result) + ' ' + JSON.stringify(g.errors));

  const reasonless = plan(rows, ['test_custody_exemption: fixup test/app.test.js']);
  const r1 = pv.validatePlan(reasonless, { root: repoRoot });
  assert(r1.result === 'refuse' && hasError(r1, 'test_custody_exemption_malformed'),
    'C2-b: a REASONLESS exemption refuses test_custody_exemption_malformed, got ' + JSON.stringify(r1.errors));

  const unknownNode = plan(rows, [
    'test_custody_exemption: fixup test/app.test.js — repairs the suite-breaking assertion',
    'test_custody_exemption: ghost test/app.test.js — names a node that does not exist',
  ]);
  const r2 = pv.validatePlan(unknownNode, { root: repoRoot });
  assert(r2.result === 'refuse' && hasError(r2, 'test_custody_exemption_unmatched'),
    'C2-c: an exemption for an UNKNOWN node refuses test_custody_exemption_unmatched, got ' + JSON.stringify(r2.errors));

  const undeclaredPath = plan(rows, [
    'test_custody_exemption: fixup test/app.test.js — repairs the suite-breaking assertion',
    'test_custody_exemption: fixup test/never-declared.test.js — a path this node does not declare',
  ]);
  const r3 = pv.validatePlan(undeclaredPath, { root: repoRoot });
  assert(r3.result === 'refuse' && hasError(r3, 'test_custody_exemption_unmatched'),
    'C2-d: an exemption for a path the node does not declare refuses, got ' + JSON.stringify(r3.errors));

  // C2-e: the exemption is read from `## Meta` ONLY — a decoy line outside the hash-covered section
  // must NOT admit the write (mirrors the parseGoal/parseLabels scoping).
  const decoy = plan(rows).replace('## Design\n', '## Design\n\ntest_custody_exemption: fixup test/app.test.js — decoy outside Meta\n');
  const r4 = pv.validatePlan(decoy, { root: repoRoot });
  assert(r4.result === 'refuse' && hasError(r4, 'test_custody_violation'),
    'C2-e: a decoy exemption OUTSIDE ## Meta does not admit the write, got ' + JSON.stringify(r4.result));

  // C2-f: the exemption is HASH-COVERED — editing it after freeze is tamper-evident.
  const before = pv.computePlanHash(exempt);
  const after = pv.computePlanHash(exempt.replace('repairs the suite-breaking assertion', 'repairs something else'));
  assert(before !== after, 'C2-f: a post-freeze edit to the exemption changes plan_hash (hash-covered)');

  // C2-g: the exemption path and the declared write-set entry go through ONE normalizer. A private
  // second normalizer in the exemption reader is a place the two sides can silently diverge — and a
  // divergence either admits a write the wall should refuse or rejects an exemption naming a real
  // declared path. Pin both directions of the spellings parseWriteSetCell canonicalizes.
  const spellings = [
    ['./test/app.test.js', 'test/app.test.js'],   // exemption ./-prefixed, write set bare
    ['test/app.test.js', './test/app.test.js'],   // write set ./-prefixed, exemption bare
    ['test//app.test.js', 'test/app.test.js'],    // repeated slash on the exemption side
  ];
  for (const [exemptSpelling, declaredSpelling] of spellings) {
    const p = plan([{ id: 'fixup', role: 'build-error-resolver', ws: 'src/app.js, ' + declaredSpelling }],
      ['test_custody_exemption: fixup ' + exemptSpelling + ' — repairs the suite-breaking assertion']);
    const rr = pv.validatePlan(p, { root: repoRoot });
    assert(rr.result === 'in-grammar',
      'C2-g: exemption "' + exemptSpelling + '" matches declared "' + declaredSpelling + '" through the shared normalizer, got '
        + JSON.stringify(rr.result) + ' ' + JSON.stringify(rr.errors));
  }
}

// ---------------------------------------------------------------------------
// C3 — the synthesizer convergence carve-out. A synthesizer declares the UNION of its legs' write
//      sets by contract, so a leg's test path appearing in that union is reconciliation, not
//      authorship. A test path NO upstream leg declares is still authorship and still refuses.
// ---------------------------------------------------------------------------
{
  const ok = plan([
    { id: 'lens-a', role: 'tdd-guide', ws: 'test/a.test.js', shape: 'fanout(lenses)' },
    { id: 'lens-b', role: 'tdd-guide', ws: 'spec/b.spec.js', shape: 'fanout(lenses)' },
    { id: 'join', role: 'synthesizer', deps: 'lens-a, lens-b', ws: 'test/a.test.js, spec/b.spec.js' },
  ]);
  const g = pv.validatePlan(ok, { root: repoRoot });
  assert(g.result === 'in-grammar', 'C3-a: a synthesizer reconciling its legs\' test paths freezes, got ' + JSON.stringify(g.result) + ' ' + JSON.stringify(g.errors));

  const originating = plan([
    { id: 'lens-a', role: 'tdd-guide', ws: 'test/a.test.js', shape: 'fanout(lenses)' },
    { id: 'lens-b', role: 'tdd-guide', ws: 'spec/b.spec.js', shape: 'fanout(lenses)' },
    { id: 'join', role: 'synthesizer', deps: 'lens-a, lens-b', ws: 'test/a.test.js, spec/b.spec.js, test/invented.test.js' },
  ]);
  const r = pv.validatePlan(originating, { root: repoRoot });
  assert(r.result === 'refuse' && hasError(r, 'test_custody_violation') && hasError(r, 'test/invented.test.js'),
    'C3-b: a synthesizer test path NO leg declares is authorship and refuses, got ' + JSON.stringify(r.errors));
}

// ---------------------------------------------------------------------------
// C4 — FREEZE-ONLY. A plan frozen before this rule existed must still resume: revalidateForResume
//      never applies the custody wall. A frozen plan that stops resuming is a silent break.
// ---------------------------------------------------------------------------
{
  const legacy = plan([{ id: 'impl', role: 'implementer', ws: 'src/app.js, test/app.test.js' }]);
  // CONTROL first: this exact plan is one the wall REFUSES at freeze. Without it the resume assertion
  // could pass on a plan the custody wall never had an opinion about — proving nothing about the
  // freeze-only boundary.
  const atFreeze = pv.validatePlan(legacy, { root: repoRoot });
  assert(atFreeze.result === 'refuse' && hasError(atFreeze, 'test_custody_violation'),
    'C4-control: the legacy fixture must be a plan the custody wall REFUSES at freeze, got '
    + JSON.stringify(atFreeze.result) + ' ' + JSON.stringify(atFreeze.errors));
  const stamped = legacy + '\n<!-- plan_hash: ' + pv.computePlanHash(legacy) + ' -->\n';
  const rv = pv.revalidateForResume(stamped, { root: repoRoot });
  // Assert the POSITIVE outcome, not the absence of one error code: the same plan RESUMES.
  assert(rv.ok === true && rv.result === 'pass',
    'C4: the SAME plan still resumes — revalidateForResume never applies the custody wall, got ' + JSON.stringify(rv));
}

// ---------------------------------------------------------------------------
// C5 — the single-source token registry follows custody.
// ---------------------------------------------------------------------------
{
  const reg = pv.ROLE_TOKEN_REGISTRY;
  const tdd = reg['tdd-guide'];
  assert(tdd.includes('RED'), 'C5-a: tdd-guide keeps RED');
  assert(!tdd.includes('GREEN'), 'C5-b: tdd-guide LOSES GREEN (GREEN authority is gate-side), got ' + JSON.stringify(tdd));
  assert(tdd.includes('red_baseline'), 'C5-c: tdd-guide gains the baseline-bound red_baseline receipt, got ' + JSON.stringify(tdd));

  const impl = reg['implementer'];
  assert(!impl.some(t => t === 'non_tdd_reason'), 'C5-d: implementer DROPS non_tdd_reason, got ' + JSON.stringify(impl));
  const tier = impl.find(t => String(t).includes('|'));
  assert(!!tier, 'C5-e: implementer keeps a verification-tier alternation, got ' + JSON.stringify(impl));
  const alts = String(tier).split('|');
  assert(alts[0] === 'tests-green',
    'C5-f: the alternation leads with tests-green (the universal behavioral tier the open-time seed writes), got ' + JSON.stringify(alts));
  for (const t of ['regression-green', 'build-green', 'smoke-integration']) {
    assert(alts.includes(t), 'C5-g: the non-behavioral tier "' + t + '" survives, got ' + JSON.stringify(alts));
  }
}

// ---------------------------------------------------------------------------
// C6 — checkEvidenceShape enforces C5 at the close gate.
// ---------------------------------------------------------------------------
{
  const shape = an.checkEvidenceShape;
  assert(typeof shape === 'function', 'C6-0: checkEvidenceShape is reachable for unit coverage');
  if (typeof shape === 'function') {
    const NONCE = 'abc123def456';
    const bind = 'evidence-binding: n1 ' + NONCE + '\n';

    // C6-a: a tdd-guide file with RED + a MATCHING red_baseline and NO GREEN closes.
    const noGreen = bind + 'RED: test_widget_rejects_empty — AssertionError: expected throw\n'
      + 'red_baseline: ' + NONCE + '\n';
    const a = shape('tdd-guide', 'n1', noGreen, { expectedNonce: NONCE, expectedNodeId: 'n1' });
    assert(a.ok === true, 'C6-a: tdd-guide evidence with no GREEN closes (GREEN authority is gate-side), got ' + JSON.stringify(a));

    // C6-b: a MISSING red_baseline refuses — the fail-on-baseline receipt is required, not optional.
    const noBaseline = bind + 'RED: test_widget_rejects_empty — AssertionError: expected throw\n';
    const b = shape('tdd-guide', 'n1', noBaseline, { expectedNonce: NONCE, expectedNodeId: 'n1' });
    assert(b.ok === false && b.missingTokenClass === 'red_baseline',
      'C6-b: a missing red_baseline refuses, got ' + JSON.stringify(b));

    // C6-c: a red_baseline naming a DIFFERENT baseline refuses — a RED signature cannot be carried
    // across reopens (the whole point of binding RED to the recorded baseline).
    const wrongBaseline = bind + 'RED: test_widget_rejects_empty — AssertionError\n'
      + 'red_baseline: 999999999999\n';
    const c = shape('tdd-guide', 'n1', wrongBaseline, { expectedNonce: NONCE, expectedNodeId: 'n1' });
    assert(c.ok === false && c.missingTokenClass === 'red_baseline',
      'C6-c: a red_baseline bound to another baseline refuses, got ' + JSON.stringify(c));

    // C6-c2: the FULL baseline sha (of which the nonce is the 12-char prefix) is the canonical form.
    const fullSha = bind + 'RED: test_widget_rejects_empty — AssertionError\n'
      + 'red_baseline: ' + NONCE + '0011223344556677889900112233\n';
    assert(shape('tdd-guide', 'n1', fullSha, { expectedNonce: NONCE, expectedNodeId: 'n1' }).ok === true,
      'C6-c2: the full baseline sha satisfies red_baseline');

    // C6-d: the no-expectedNonce escape hatch reaches only a read with NO recorded barrier baseline
    // (a 3-arg unit caller, an offline read of a never-opened node). It is NOT a grandfather clause
    // for an in-flight node: an in-flight node always carries this open's nonce, so the receipt check
    // always runs and the same bytes REFUSE. Both halves are asserted here so the pair cannot drift
    // into "a legacy artifact always closes".
    const legacyTdd = 'RED: x\nGREEN: y\n';
    assert(shape('tdd-guide', 'n1', legacyTdd, {}).ok === true,
      'C6-d: a legacy tdd-guide artifact read WITHOUT a nonce (offline read) is tolerated');
    const legacyInFlight = shape('tdd-guide', 'n1', 'evidence-binding: n1 ' + NONCE + '\n' + legacyTdd,
      { expectedNonce: NONCE, expectedNodeId: 'n1' });
    assert(legacyInFlight.ok === false && legacyInFlight.missingTokenClass === 'red_baseline',
      'C6-d2: the SAME legacy artifact IN FLIGHT (this open\'s nonce) refuses on the missing baseline '
      + 'receipt — the recovery is reopen-node + re-run, not tolerance, got ' + JSON.stringify(legacyInFlight));

    // C6-e: a LEGACY implementer artifact carrying the retired non_tdd_reason + an old tier closes.
    const legacyImpl = bind + 'non_tdd_reason: scaffolding\nbuild-green: tsc clean\n';
    assert(shape('implementer', 'n1', legacyImpl, { expectedNonce: NONCE, expectedNodeId: 'n1' }).ok === true,
      'C6-e: a legacy implementer artifact (non_tdd_reason + old tier) is tolerated on read');

    // C6-f: a NEW implementer artifact needs NO non_tdd_reason — the tier alone closes it.
    const newImpl = bind + 'tests-green: 12/12 assertions green against the authored suite\n';
    assert(shape('implementer', 'n1', newImpl, { expectedNonce: NONCE, expectedNodeId: 'n1' }).ok === true,
      'C6-f: an implementer artifact with the tier alone closes (non_tdd_reason retired)');

    // C6-g: an implementer artifact with NO tier at all still refuses (the tier is not optional).
    const tierless = bind + 'task: did some work\n';
    const g = shape('implementer', 'n1', tierless, { expectedNonce: NONCE, expectedNodeId: 'n1' });
    assert(g.ok === false, 'C6-g: an implementer artifact with no verification tier refuses, got ' + JSON.stringify(g));
  }
}

// ---------------------------------------------------------------------------
// C7 — route-findings infers fix_role=tdd-guide for behavior / coverage / test-defect findings.
// ---------------------------------------------------------------------------
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-custody-'));
  const projDir = path.join(tmp, 'kaola-workflow', 'p');
  fs.mkdirSync(path.join(projDir, '.cache'), { recursive: true });
  const planPath = path.join(projDir, 'workflow-plan.md');
  fs.writeFileSync(planPath, plan([
    { id: 'tests', role: 'tdd-guide', ws: 'test/app.test.js' },
    { id: 'impl', role: 'implementer', deps: 'tests', ws: 'src/app.js' },
  ]), 'utf8');
  fs.writeFileSync(path.join(projDir, '.cache', 'review.md'), [
    'evidence-binding: review deadbeefcafe',
    'verdict: fail',
    'findings_blocking: 4',
    'finding: F1 — src/app.js — missing validation on the empty case',
    'finding: F2 — test/app.test.js — coverage gap: the boundary case is untested',
    'finding: F3 — test/app.test.js — security: the fixture leaks a live credential',
    'finding: F4 — src/app.js — behavior: the rounding rule is inverted',
    '',
  ].join('\n'), 'utf8');

  const out = an.runRouteFindings({ nodeId: 'review', planPath }, 'p');
  assert(out.result === 'ok', 'C7-0: route-findings returns ok, got ' + JSON.stringify(out));
  const by = Object.fromEntries((out.findings || []).map(f => [f.finding_id, f]));

  assert(by.F1 && by.F1.fix_role === 'implementer',
    'C7-a: an ordinary production finding still routes to implementer, got ' + JSON.stringify(by.F1));
  assert(by.F2 && by.F2.fix_role === 'tdd-guide',
    'C7-b: a COVERAGE finding routes to the test author, got ' + JSON.stringify(by.F2));
  assert(by.F3 && by.F3.fix_role === 'security-reviewer',
    'C7-c: security still wins precedence over custody, got ' + JSON.stringify(by.F3));
  assert(by.F4 && by.F4.fix_role === 'tdd-guide',
    'C7-d: a BEHAVIOR finding routes to the test author, got ' + JSON.stringify(by.F4));

  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('test-test-custody: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
