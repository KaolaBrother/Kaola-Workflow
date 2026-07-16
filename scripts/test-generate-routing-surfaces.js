#!/usr/bin/env node
'use strict';

// test-generate-routing-surfaces.js — engine self-test for the routing-surface
// render engine. Drives renderSkeleton() on SYNTHETIC skeletons (independent of
// the real surfaces) and asserts that each directive kind produces exactly the
// expected bytes:
//   - SLOT-fill          resolves the keyed value for the render context
//   - REGION-drop        keeps/drops a region leaving the exact byte layout
//   - SPLICE-substitution inlines the per-context variant
//   - rename-table       applies the forge-noun rename to the rendered output
// Newline fidelity is asserted explicitly (a dropped region must not leave a
// stray blank line). The real-surface byte-equality is guarded separately by
// `generate-routing-surfaces.js --check`.

const { renderSkeleton, condMatches, resolveKeyed } = require('./generate-routing-surfaces.js');
const { GENERATED_SURFACES } = require('./generate-routing-surfaces.js');
const { applyRenames } = require('../templates/routing/rename-table.js');
const { SLOTS, SPLICES } = require('../templates/routing/slots.js');
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; return; }
  failed++;
  console.error(`  FAIL: ${msg}`);
}
function eq(actual, expected, msg) {
  assert(actual === expected, `${msg}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
}

const ctx = (surface_type, forge) => ({ surface_type, forge });

// ---------------------------------------------------------------------------
// SLOT-fill: a SLOT directive line is replaced by the resolved keyed value.
// ---------------------------------------------------------------------------
{
  const ir = { slots: { greeting: { command: 'hello-cmd', skill: 'hello-skill' } }, splices: {} };
  const skel = 'A\n<!-- SLOT:greeting -->\nB';
  eq(renderSkeleton(skel, ctx('command', 'github'), ir), 'A\nhello-cmd\nB', 'SLOT-fill: command branch');
  eq(renderSkeleton(skel, ctx('skill', 'github'), ir), 'A\nhello-skill\nB', 'SLOT-fill: skill branch');

  // multi-line slot value expands to multiple lines
  const irMulti = { slots: { block: { command: 'L1\nL2\nL3' } }, splices: {} };
  eq(renderSkeleton('<!-- SLOT:block -->', ctx('command', 'github'), irMulti), 'L1\nL2\nL3', 'SLOT-fill: multi-line');
}

// ---------------------------------------------------------------------------
// REGION-drop: kept emits the body only; dropped removes the directives AND the
// body with EXACT byte layout (no stray blank line).
// ---------------------------------------------------------------------------
{
  const ir = { slots: {}, splices: {} };
  const skel = 'head\n<!-- REGION:command -->\nonly-cmd\n<!-- /REGION -->\ntail';
  eq(renderSkeleton(skel, ctx('command', 'github'), ir), 'head\nonly-cmd\ntail', 'REGION kept (command)');
  eq(renderSkeleton(skel, ctx('skill', 'github'), ir), 'head\ntail', 'REGION dropped (skill) leaves exact bytes');

  // a dropped region must not leave a stray newline where its body was
  const skel2 = 'a\n<!-- REGION:skill -->\nx\ny\n<!-- /REGION -->\nb';
  eq(renderSkeleton(skel2, ctx('command', 'github'), ir), 'a\nb', 'REGION drop: no stray blank line');
  eq(renderSkeleton(skel2, ctx('skill', 'github'), ir), 'a\nx\ny\nb', 'REGION keep: exact body');
}

// ---------------------------------------------------------------------------
// Compound + forge-keyed regions.
// ---------------------------------------------------------------------------
{
  const ir = { slots: {}, splices: {} };
  const skel = 'h\n<!-- REGION:command+github -->\nGH\n<!-- /REGION -->\nt';
  eq(renderSkeleton(skel, ctx('command', 'github'), ir), 'h\nGH\nt', 'command+github kept for command/github');
  eq(renderSkeleton(skel, ctx('command', 'gitlab'), ir), 'h\nt', 'command+github dropped for command/gitlab');
  eq(renderSkeleton(skel, ctx('skill', 'github'), ir), 'h\nt', 'command+github dropped for skill/github');

  // single forge region
  const skel2 = 'h\n<!-- REGION:github -->\nG\n<!-- /REGION -->\n<!-- REGION:gitlab -->\nL\n<!-- /REGION -->\nt';
  eq(renderSkeleton(skel2, ctx('command', 'github'), ir), 'h\nG\nt', 'forge region: github branch');
  eq(renderSkeleton(skel2, ctx('command', 'gitlab'), ir), 'h\nL\nt', 'forge region: gitlab branch');
}

// ---------------------------------------------------------------------------
// Nested regions.
// ---------------------------------------------------------------------------
{
  const ir = { slots: {}, splices: {} };
  const skel = 'h\n<!-- REGION:command -->\nc-open\n<!-- REGION:github -->\ngh\n<!-- /REGION -->\nc-close\n<!-- /REGION -->\nt';
  eq(renderSkeleton(skel, ctx('command', 'github'), ir), 'h\nc-open\ngh\nc-close\nt', 'nested: command+github inner kept');
  eq(renderSkeleton(skel, ctx('command', 'gitlab'), ir), 'h\nc-open\nc-close\nt', 'nested: inner github dropped, outer command kept');
  eq(renderSkeleton(skel, ctx('skill', 'github'), ir), 'h\nt', 'nested: outer command dropped removes inner');
}

// ---------------------------------------------------------------------------
// SPLICE-substitution: inline per-context variant (single- and multi-line).
// ---------------------------------------------------------------------------
{
  const ir = {
    slots: {},
    splices: {
      mid: { command: 'C1\nC2', skill: 'S1' },
      forgeword: { github: 'G', gitlab: 'L', gitea: 'T' },
    },
  };
  eq(renderSkeleton('x\n<!-- SPLICE:mid -->\ny', ctx('command', 'github'), ir), 'x\nC1\nC2\ny', 'SPLICE: command multi-line');
  eq(renderSkeleton('x\n<!-- SPLICE:mid -->\ny', ctx('skill', 'github'), ir), 'x\nS1\ny', 'SPLICE: skill single-line');
  // forge-keyed splice: resolveKeyed descends to forge when surface_type key absent
  eq(renderSkeleton('<!-- SPLICE:forgeword -->', ctx('command', 'gitlab'), ir), 'L', 'SPLICE: forge descent (gitlab)');
  eq(renderSkeleton('<!-- SPLICE:forgeword -->', ctx('skill', 'gitea'), ir), 'T', 'SPLICE: forge descent (gitea)');
}

// ---------------------------------------------------------------------------
// rename-table: forge-noun rename applied to the rendered output.
// ---------------------------------------------------------------------------
{
  const ir = { slots: {}, splices: {} };
  const skel = 'run kaola-workflow-adaptive-node.js now';
  eq(renderSkeleton(skel, ctx('command', 'github'), ir), 'run kaola-workflow-adaptive-node.js now', 'rename: github is canonical (no rename)');
  eq(renderSkeleton(skel, ctx('command', 'gitlab'), ir), 'run kaola-gitlab-workflow-adaptive-node.js now', 'rename: gitlab');
  eq(renderSkeleton(skel, ctx('command', 'gitea'), ir), 'run kaola-gitea-workflow-adaptive-node.js now', 'rename: gitea');

  // resolve-agent-model stays un-renamed on every forge (design invariant)
  const skel2 = 'resolve kaola-workflow-resolve-agent-model.js';
  eq(applyRenames(skel2, 'gitlab'), 'resolve kaola-workflow-resolve-agent-model.js', 'rename: resolve-agent-model un-renamed on gitlab');
  eq(applyRenames(skel2, 'gitea'), 'resolve kaola-workflow-resolve-agent-model.js', 'rename: resolve-agent-model un-renamed on gitea');
}

// ---------------------------------------------------------------------------
// condMatches / resolveKeyed unit checks.
// ---------------------------------------------------------------------------
{
  assert(condMatches('command', ctx('command', 'github')), 'condMatches: command matches command');
  assert(!condMatches('command', ctx('skill', 'github')), 'condMatches: command rejects skill');
  assert(condMatches('command+github', ctx('command', 'github')), 'condMatches: AND both match');
  assert(!condMatches('command+github', ctx('command', 'gitlab')), 'condMatches: AND one mismatch rejects');
  eq(resolveKeyed({ command: 'a', skill: 'b' }, ctx('skill', 'github'), 'SLOT', 't'), 'b', 'resolveKeyed: surface_type descent');
  eq(resolveKeyed({ command: { github: 'x', gitlab: 'y' } }, ctx('command', 'gitlab'), 'SLOT', 't'), 'y', 'resolveKeyed: surface_type then forge');
  eq(resolveKeyed('plain', ctx('command', 'github'), 'SLOT', 't'), 'plain', 'resolveKeyed: plain string passthrough');
}

// ---------------------------------------------------------------------------
// Error paths: unknown slot/splice and unbalanced region must throw.
// ---------------------------------------------------------------------------
{
  let threw = false;
  try { renderSkeleton('<!-- SLOT:missing -->', ctx('command', 'github'), { slots: {}, splices: {} }); }
  catch (e) { threw = true; }
  assert(threw, 'unknown SLOT throws');

  threw = false;
  try { renderSkeleton('<!-- REGION:command -->\nx', ctx('command', 'github'), { slots: {}, splices: {} }); }
  catch (e) { threw = true; }
  assert(threw, 'unterminated REGION throws');
}

// ---------------------------------------------------------------------------
// Real plan-run generation contract: all six outputs must be exact renders of
// the canonical skeleton and carry the complete reviewer-contract-v2 execution
// block. This is deliberately in the render-engine test (not only the CLI
// --check) so a field can neither disappear from every generated surface nor be
// hand-added to an output without its canonical source.
// ---------------------------------------------------------------------------
{
  const repo = path.resolve(__dirname, '..');
  const rows = GENERATED_SURFACES.filter(row => row.topic === 'plan-run');
  eq(rows.length, 6, 'real plan-run registry derives exactly six surfaces');
  const ir = { slots: SLOTS, splices: SPLICES };
  const required = [
    '<!-- PIN: reviewer-contract-v2-execution -->',
    '`plan_schema_version`',
    '`contract_version`',
    '`behavior_contract_version`',
    '`behavior_contract_hash`',
    '`resolved_profile_hash`',
    '`review_context_hash`',
    '`review_context_path`',
    '`candidate_digest`',
    '`gate_mode`',
    '`logical_gate`',
    '`gate_claim`',
    '`gate_surface`',
    '`gate_aggregation`',
    '`validation_obligations`',
    '`.cache/validation-vectors/`',
    '`replan_required`',
    '`review_scope_expanded`',
    '`review_nonconvergent`',
    '`contract_version: 1`',
  ];
  for (const row of rows) {
    const skeleton = fs.readFileSync(path.join(repo, 'templates', 'routing', row.skeleton), 'utf8');
    const rendered = renderSkeleton(skeleton, { surface_type: row.surface_type, forge: row.forge }, ir);
    const committed = fs.readFileSync(path.join(repo, row.path), 'utf8');
    eq(committed, rendered, `real plan-run byte identity: ${row.path}`);
    for (const token of required) {
      assert(rendered.includes(token), `real plan-run v2 field ${token} propagates to ${row.path}`);
    }
    const marker = rendered.indexOf('<!-- PIN: reviewer-contract-v2-execution -->');
    const end = rendered.indexOf('<!-- /PIN -->', marker);
    const block = marker >= 0 && end > marker ? rendered.slice(marker, end) : '';
    assert(block.length > 0, `real plan-run v2 block is bounded on ${row.path}`);
    assert(!/(?:#\d+|\bD-\d+-\d+\b|\bADR[- ]?\d+\b)/i.test(block),
      `real plan-run v2 block carries rules without issue/decision provenance on ${row.path}`);
  }
}

if (failed > 0) {
  console.error(`\ntest-generate-routing-surfaces: ${failed} assertion(s) FAILED (${passed} passed).`);
  process.exit(1);
}
console.log(`test-generate-routing-surfaces: all ${passed} assertions passed.`);
