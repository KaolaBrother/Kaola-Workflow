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
const { applyRenames } = require('../templates/routing/rename-table.js');
const { SLOTS } = require('../templates/routing/slots.js');

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
// Re-plan control-plane slots: the generated plan-run and next families must
// render the edition-local aggregator basename while keeping one canonical
// control-plane contract for command and skill surfaces.
// ---------------------------------------------------------------------------
{
  const ir = { slots: SLOTS, splices: {} };
  const expectedScripts = {
    github: 'kaola-workflow-replan.js',
    gitlab: 'kaola-gitlab-workflow-replan.js',
    gitea: 'kaola-gitea-workflow-replan.js',
  };
  for (const slotName of ['pr-replan-control-plane', 'nx-replan-control-plane']) {
    for (const surfaceType of ['command', 'skill']) {
      for (const forge of ['github', 'gitlab', 'gitea']) {
        const rendered = renderSkeleton(`<!-- SLOT:${slotName} -->`, ctx(surfaceType, forge), ir);
        assert(rendered.includes(expectedScripts[forge]),
          `${slotName}: ${surfaceType}/${forge} renders the edition-local re-plan aggregator`);
        for (const token of ['replan_in_progress', 'replan_phase', 'parent_plan_hash',
          'child_plan_hash', 'last_cas_result', 'resume --project',
          'replan_planner_dispatch_required', 'workflow-plan.next.md']) {
          assert(rendered.includes(token),
            `${slotName}: ${surfaceType}/${forge} carries re-plan token ${token}`);
        }
      }
    }
  }
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

if (failed > 0) {
  console.error(`\ntest-generate-routing-surfaces: ${failed} assertion(s) FAILED (${passed} passed).`);
  process.exit(1);
}
console.log(`test-generate-routing-surfaces: all ${passed} assertions passed.`);
