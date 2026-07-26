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
// stray blank line). The real-surface byte-equality is also guarded by
// `generate-routing-surfaces.js --check`; the negative block at the end of this
// file mutation-proves that CLI goes RED (exit 1) when a generated surface is
// hand-edited, against a disposable copy so the real tree is never mutated.

const { renderSkeleton, condMatches, resolveKeyed } = require('./generate-routing-surfaces.js');
const { GENERATED_SURFACES, loadSkeleton, reportTypedFailure } = require('./generate-routing-surfaces.js');
const { applyRenames } = require('../templates/routing/rename-table.js');
const { SLOTS, SPLICES } = require('../templates/routing/slots.js');
const fs = require('fs');
const path = require('path');

// Pre-flight: a missing skeleton is a typed, actionable failure here too. This
// suite is the second signal on the same inputs the CLI reads, so if it died
// with a raw ENOENT there would be no readable signal anywhere.
{
  try {
    for (const row of GENERATED_SURFACES) loadSkeleton(row.skeleton, row.topic);
  } catch (e) {
    if (reportTypedFailure(e)) process.exit(1);
    throw e;
  }
}

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
    const skeleton = loadSkeleton(row.skeleton, row.topic);
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

// ---------------------------------------------------------------------------
// Topic registry: every registered topic derives exactly six surfaces (3 forges
// x command + skill) and every path is COMPUTED from the topic basenames. Two
// topics are ASYMMETRIC (command basename differs from skill basename); the
// other two are symmetric. Asserted structurally so a topic can neither be
// registered with a hand-typed path nor silently drop a forge.
// ---------------------------------------------------------------------------
{
  const { TOPICS } = require('./generate-routing-surfaces.js');
  const topics = Object.keys(TOPICS).sort();
  eq(topics.join(','), 'adapt,finalize,init,next,plan-run', 'registry carries exactly the five generated topics');
  eq(GENERATED_SURFACES.length, 30, 'registry derives 30 surfaces (5 topics x 6)');
  for (const topic of topics) {
    const rows = GENERATED_SURFACES.filter(r => r.topic === topic);
    eq(rows.length, 6, `${topic}: six surfaces`);
    eq(rows.filter(r => r.surface_type === 'command').length, 3, `${topic}: three command surfaces`);
    eq(rows.filter(r => r.surface_type === 'skill').length, 3, `${topic}: three skill surfaces`);
    eq([...new Set(rows.map(r => r.forge))].sort().join(','), 'gitea,github,gitlab', `${topic}: all three forges`);
    eq([...new Set(rows.map(r => r.skeleton))].length, 1, `${topic}: exactly one canonical skeleton`);
  }
  // The two asymmetric topics name a different command and skill basename.
  eq(TOPICS.next.command_basename, 'workflow-next', 'next: command basename');
  eq(TOPICS.next.skill_basename, 'kaola-workflow-next', 'next: skill basename');
  eq(TOPICS.init.command_basename, 'workflow-init', 'init: command basename');
  eq(TOPICS.init.skill_basename, 'kaola-workflow-init', 'init: skill basename');
  assert(TOPICS.init.command_basename !== TOPICS.init.skill_basename, 'init is ASYMMETRIC like next');
  eq(TOPICS.finalize.command_basename, TOPICS.finalize.skill_basename, 'finalize is symmetric');
  eq(TOPICS.adapt.command_basename, TOPICS.adapt.skill_basename, 'adapt is symmetric');
  // adapt (like plan-run) takes its basenames from the schema registry, not from
  // a string typed into the topic table, so a rename there cannot desync them.
  const schema = require('./kaola-workflow-adaptive-schema.js');
  eq(TOPICS.adapt.command_basename, schema.ADAPT_COMMAND.replace(/^\//, ''), 'adapt command basename derives from the schema registry');
  eq(TOPICS.adapt.skill_basename, schema.ADAPT_SKILL, 'adapt skill basename derives from the schema registry');
  // Paths are derived, never hand-typed: spot-check one row per new topic.
  const pathOf = (topic, surface_type, forge) =>
    (GENERATED_SURFACES.find(r => r.topic === topic && r.surface_type === surface_type && r.forge === forge) || {}).path;
  eq(pathOf('init', 'command', 'github'), 'commands/workflow-init.md', 'init github command path derived');
  eq(pathOf('init', 'skill', 'gitlab'), 'plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md', 'init gitlab skill path derived');
  eq(pathOf('finalize', 'command', 'gitea'), 'plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md', 'finalize gitea command path derived');
  eq(pathOf('finalize', 'skill', 'github'), 'plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md', 'finalize github skill path derived');
  eq(pathOf('adapt', 'command', 'gitlab'), 'plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md', 'adapt gitlab command path derived');
  eq(pathOf('adapt', 'skill', 'gitea'), 'plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md', 'adapt gitea skill path derived');
}

// ---------------------------------------------------------------------------
// Real init + finalize + adapt generation contract. These three topics were
// hand-ported per runtime before they were skeleton-backed, so the byte-identity
// assertion is the whole point: a rule may no longer be edited into one surface
// without its canonical source. Each topic also pins the tokens that must reach
// ALL SIX of its surfaces, so a rule cannot quietly leave the command-or-skill
// half.
// ---------------------------------------------------------------------------
{
  const repo = path.resolve(__dirname, '..');
  const ir = { slots: SLOTS, splices: SPLICES };
  const requiredByTopic = {
    init: [
      'KW-CLAUDE-TEMPLATE',
      'AGENTS.md',
      'kaola-workflow/ROADMAP.md',
      'kaola-workflow/.roadmap/',
      'workflow-state.md',
      'workflow-plan.md',
      'First Principles',
      'Tie-breaker',
      'doc-updater',
    ],
    finalize: [
      '<!-- PIN: replan-finalize -->',
      '<!-- PIN: closure-audit -->',
      'finalization-summary.md',
      'workflow-state.md',
      'workflow-plan.md',
      '`## Acceptance`',
      '--issue-numbers',
      'closure-audit',
      'validated_candidate_hash',
      'gaps_unswept',
      'sink-merge',
      'doc-updater',
      '`archive/`',
    ],
    adapt: [
      '<!-- PIN: replan-adapt -->',
      '<!-- PIN: reviewer-contract-v2-authoring -->',
      '<!-- PIN: claim-escalate -->',
      'workflow-planner',
      'workflow-plan.md',
      'workflow-plan.next.md',
      'workflow-state.md',
      'plan_schema_version: 2',
      'planner_control_boundary_violation',
      'replan_planner_attestation_invalid',
      'replan_in_progress',
      'handoff_status: ready_to_run',
      'plan_invalid',
      'acceptance_repair_fenced',
      'anchored_acceptance_surface',
      '`## Acceptance`',
      '`## Design`',
      'claim_verdict',
      'target_set_indeterminate',
      'target_ambiguity',
      '--target-issues',
      'Binding scope:',
      'no-target survey',
      'KAOLA_WORKFLOW_OFFLINE=1',
    ],
  };
  for (const [topic, required] of Object.entries(requiredByTopic)) {
    const rows = GENERATED_SURFACES.filter(row => row.topic === topic);
    eq(rows.length, 6, `real ${topic} registry derives exactly six surfaces`);
    for (const row of rows) {
      const skeleton = loadSkeleton(row.skeleton, row.topic);
      const rendered = renderSkeleton(skeleton, { surface_type: row.surface_type, forge: row.forge }, ir);
      const committed = fs.readFileSync(path.join(repo, row.path), 'utf8');
      eq(committed, rendered, `real ${topic} byte identity: ${row.path}`);
      for (const token of required) {
        assert(rendered.includes(token), `real ${topic} token ${token} propagates to ${row.path}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// adapt: the two `## Acceptance` repair-fence clauses are ONE wording on all six
// surfaces.
//
// The command shapes hard-wrap their prose and the skill shapes do not, so these
// clauses are stored as skeleton literals once per SURFACE SHAPE (one inside
// REGION:command, one inside REGION:skill) rather than once outright: the render
// engine has no reflow, and reflowing to force a single stored copy would move
// committed bytes. Byte-identity is therefore not the available invariant here —
// SUBSTANCE identity is, and it is the one that carries the rule. What a repair
// iteration may and may not touch must never fork into two readings, so the text
// is compared whitespace-normalized: the wrap difference is ignored and every
// other difference goes red.
// ---------------------------------------------------------------------------
{
  const repo = path.resolve(__dirname, '..');
  const ir = { slots: SLOTS, splices: SPLICES };
  const CLAUSES = {
    'repair-fence': ['Repair may fix `## Meta`', 'that is not repair.'],
    'acceptance-repair-fenced': ['- **`reason: acceptance_repair_fenced`**', 'delete the anchor by hand.'],
  };
  const normalize = s => s.replace(/\s+/g, ' ').trim();

  // extractClause — PURE. Returns the normalized clause, or null when either
  // marker is missing (an absent clause is itself a failure, never a pass).
  const extractClause = (text, [start, end]) => {
    const i = text.indexOf(start);
    if (i < 0) return null;
    const j = text.indexOf(end, i);
    if (j < 0) return null;
    return normalize(text.slice(i, j + end.length));
  };

  // clauseSplits — PURE detector over a map of surface -> rendered text. Returns
  // one entry per clause that does NOT resolve to exactly one wording, so the
  // same function can run against the real renders (must be empty) and against a
  // deliberately-forked set (must not be).
  const clauseSplits = rendered => {
    const out = [];
    for (const [name, markers] of Object.entries(CLAUSES)) {
      const byWording = new Map();
      for (const [surface, text] of Object.entries(rendered)) {
        const clause = extractClause(text, markers);
        const bucket = clause === null ? '(absent)' : clause;
        if (!byWording.has(bucket)) byWording.set(bucket, []);
        byWording.get(bucket).push(surface);
      }
      if (byWording.size !== 1 || byWording.has('(absent)')) {
        const missing = byWording.get('(absent)');
        out.push({
          clause: name,
          wordings: byWording.size,
          detail: `adapt clause '${name}' has ${byWording.size} wording(s) across the six surfaces: ` +
            [...byWording.entries()]
              .map(([w, v]) => `${v.join('+')}${w === '(absent)' ? ' [ABSENT]' : ''}`).join(' | ') +
            (missing ? `. It could not be located on ${missing.length} surface(s) — an absent clause is never a pass` : '') +
            `. One rule, one wording — reconcile the text, do not add a second reading.`,
        });
      }
    }
    return out;
  };

  const renderedAdapt = {};
  for (const row of GENERATED_SURFACES.filter(r => r.topic === 'adapt')) {
    renderedAdapt[`${row.surface_type}/${row.forge}`] =
      renderSkeleton(loadSkeleton(row.skeleton, row.topic), { surface_type: row.surface_type, forge: row.forge }, ir);
  }
  eq(Object.keys(renderedAdapt).length, 6, 'adapt one-wording check covers all six surfaces');

  // POSITIVE: every clause resolves to exactly one wording today.
  const splits = clauseSplits(renderedAdapt);
  for (const s of splits) console.error(`  FAIL: ${s.detail}`);
  eq(splits.length, 0, 'every adapt `## Acceptance` fence clause is ONE wording across all six surfaces');

  // Also assert against the COMMITTED bytes, not only the render, so the check
  // still means something if a surface is ever regenerated from a forked source.
  const committedAdapt = {};
  for (const row of GENERATED_SURFACES.filter(r => r.topic === 'adapt')) {
    committedAdapt[`${row.surface_type}/${row.forge}`] = fs.readFileSync(path.join(repo, row.path), 'utf8');
  }
  eq(clauseSplits(committedAdapt).length, 0, 'the committed adapt surfaces carry ONE wording per fence clause');

  // NEGATIVE (mutation proof): fork one surface's wording and one surface's
  // presence. Without this the two blocks above are only evidence that today's
  // text happens to agree.
  {
    const forked = Object.assign({}, renderedAdapt);
    forked['skill/gitea'] = forked['skill/gitea'].replace('that is not repair.', 'that is fine, proceed.');
    const found = clauseSplits(forked);
    assert(found.some(s => s.clause === 'repair-fence' && s.wordings === 2),
      'mutation proof: a second wording of the repair-fence clause on ONE surface goes red');

    const dropped = Object.assign({}, renderedAdapt);
    dropped['command/gitlab'] = dropped['command/gitlab'].split('anchored_acceptance_surface').join('REMOVED');
    assert(clauseSplits(dropped).some(s => s.clause === 'acceptance-repair-fenced'),
      'mutation proof: mangling the clause on ONE surface goes red (absence is never a pass)');

    // Boundary: the wrap difference itself must NOT be reported, or the guard
    // would be unsatisfiable by the shipped bytes and get disabled.
    const rewrapped = Object.assign({}, renderedAdapt);
    rewrapped['command/github'] = rewrapped['command/github'].replace(
      'reach in-grammar but MUST NOT alter', 'reach in-grammar but\n  MUST NOT alter');
    eq(clauseSplits(rewrapped).length, 0, 'mutation proof: re-wrapping alone is NOT reported (substance, not bytes)');
  }
}

// ---------------------------------------------------------------------------
// SPLICE size + cross-variant redundancy budget.
//
// `--check` compares each rendered SURFACE against the skeleton. It does NOT
// compare a splice's variants against each other, so a splice that carries a
// large body copied per forge is a blind spot: editing only the github variant
// leaves --check green while the three forges silently diverge. That is the
// exact failure class the skeleton exists to close, so it must not be allowed
// to reappear inside the skeleton's own data file.
//
// Two budgets bound it, both enforced by DEFAULT with an exempt-list (never an
// opt-in allowlist), so a new splice is guarded the moment it is written:
//
//   VARIANT_LINE_BUDGET  — no single splice variant may exceed this many lines.
//                          A splice is for a clause or a line that READS
//                          differently per context; a whole section that merely
//                          contains a few differing lines must be decomposed
//                          into skeleton literals (the shared body, stored
//                          once) plus small splices/REGIONs for what differs.
//   SHARED_RUN_BUDGET    — no two variants of one splice may share this many
//                          consecutive identical non-blank lines. A long shared
//                          run IS the duplication: it belongs in the skeleton,
//                          or in one `gitlab,gitea`-style REGION.
//
// Raising either number is not a fix. Decompose the splice instead; an entry in
// the exemption table is a DECLARED divergence and must carry a reason.
// ---------------------------------------------------------------------------
{
  const VARIANT_LINE_BUDGET = 8;
  const SHARED_RUN_BUDGET = 6;
  // name -> one-line reason. Empty: nothing in the tree needs an exemption.
  const BUDGET_EXEMPTIONS = {};

  const variantsOf = (value, prefix = '') => {
    if (typeof value === 'string') return [[prefix || '(root)', value]];
    if (!value || typeof value !== 'object') return [];
    return Object.keys(value).flatMap(k =>
      variantsOf(value[k], prefix ? `${prefix}.${k}` : k));
  };

  // longest run of consecutive identical NON-BLANK lines shared by a and b
  const longestSharedRun = (a, b) => {
    const A = a.split('\n'), B = b.split('\n');
    let best = 0;
    let prev = new Int32Array(B.length + 1);
    for (let i = 1; i <= A.length; i++) {
      const cur = new Int32Array(B.length + 1);
      for (let j = 1; j <= B.length; j++) {
        if (A[i - 1] === B[j - 1] && A[i - 1].trim() !== '') {
          cur[j] = prev[j - 1] + 1;
          if (cur[j] > best) best = cur[j];
        }
      }
      prev = cur;
    }
    return best;
  };

  // auditSpliceBudgets — PURE detector over a splice table. Returns the list of
  // violations so the same function can be run against the real table (must be
  // empty) and against deliberately-broken tables (must not be).
  const auditSpliceBudgets = (splices, exemptions = BUDGET_EXEMPTIONS) => {
    const violations = [];
    for (const [name, value] of Object.entries(splices)) {
      if (Object.prototype.hasOwnProperty.call(exemptions, name)) continue;
      const variants = variantsOf(value);
      for (const [key, text] of variants) {
        const lines = text.split('\n').length;
        if (lines > VARIANT_LINE_BUDGET) {
          violations.push({
            kind: 'variant_lines', name,
            detail: `SPLICE ${name} [${key}] is ${lines} lines (budget ${VARIANT_LINE_BUDGET}). ` +
              `Decompose the shared body into the skeleton; keep only the differing lines forge-keyed.`,
          });
        }
      }
      for (let i = 0; i < variants.length; i++) {
        for (let j = i + 1; j < variants.length; j++) {
          const run = longestSharedRun(variants[i][1], variants[j][1]);
          if (run > SHARED_RUN_BUDGET) {
            violations.push({
              kind: 'shared_run', name,
              detail: `SPLICE ${name} variants [${variants[i][0]}] and [${variants[j][0]}] share ${run} ` +
                `consecutive identical lines (budget ${SHARED_RUN_BUDGET}). That shared body belongs in the ` +
                `skeleton (or one multi-forge REGION), not copied per variant.`,
            });
          }
        }
      }
    }
    return violations;
  };

  // POSITIVE: the real splice table is within both budgets.
  const real = auditSpliceBudgets(SPLICES);
  for (const v of real) console.error(`  FAIL: ${v.detail}`);
  eq(real.length, 0, 'every SPLICE is within the variant-line and shared-run budgets');

  // NEGATIVE (mutation proof) — against the REAL table, deep-cloned and broken
  // in exactly the two ways the budgets exist to catch. Without this the block
  // above is only evidence that today's data happens to pass.
  const clone = () => JSON.parse(JSON.stringify(SPLICES));
  const anyName = Object.keys(SPLICES)[0];

  // (a) one variant re-grows past the line budget
  {
    const broken = clone();
    const body = Array.from({ length: VARIANT_LINE_BUDGET + 5 }, (_, i) => `line ${i}`).join('\n');
    broken[anyName] = { github: body, gitlab: 'x', gitea: 'y' };
    const found = auditSpliceBudgets(broken);
    assert(found.some(v => v.kind === 'variant_lines' && v.name === anyName),
      'mutation proof: an oversized splice variant is caught by the line budget');
    assert(auditSpliceBudgets(broken, { [anyName]: 'declared' })
      .every(v => v.name !== anyName),
      'mutation proof: a DECLARED exemption suppresses the same violation (bidirectional)');
  }

  // (b) two variants carry the same long body — the drift blind spot itself:
  // --check stays green while the forges silently diverge on one edited copy.
  {
    const broken = clone();
    const shared = Array.from({ length: SHARED_RUN_BUDGET + 1 }, (_, i) => `shared ${i}`).join('\n');
    broken[anyName] = { github: `${shared}\ngh-tail`, gitlab: `${shared}\ngl-tail`, gitea: 'unrelated' };
    const found = auditSpliceBudgets(broken);
    assert(found.some(v => v.kind === 'shared_run' && v.name === anyName),
      'mutation proof: a body copied across two variants is caught by the shared-run budget');
  }

  // (c) the budgets must not be vacuous: a splice one line UNDER each budget
  // passes, so the guard is a boundary and not a blanket reject.
  {
    const ok = {
      'synthetic-ok': {
        github: Array.from({ length: VARIANT_LINE_BUDGET }, (_, i) => `a${i}`).join('\n'),
        gitlab: Array.from({ length: SHARED_RUN_BUDGET }, (_, i) => `a${i}`).join('\n'),
      },
    };
    eq(auditSpliceBudgets(ok, {}).length, 0, 'mutation proof: at-budget splices are accepted (guard is a boundary)');
  }

  // The exemption table is a DECLARATION surface: an entry without a reason is
  // not a declaration, and an entry for a splice that no longer exists is stale
  // permission that would silently re-arm on the next name collision.
  for (const [name, reason] of Object.entries(BUDGET_EXEMPTIONS)) {
    assert(typeof reason === 'string' && reason.trim().length > 0,
      `splice budget exemption ${name} carries a reason`);
    assert(Object.prototype.hasOwnProperty.call(SPLICES, name),
      `splice budget exemption ${name} refers to a splice that still exists`);
  }
}

// ---------------------------------------------------------------------------
// NEGATIVE (mutation proof): --check must go RED when a generated init,
// finalize or adapt surface is hand-edited. Run against a disposable copy of the
// render inputs so the real tree is never mutated; the CLI's exit code and its
// DRIFT line are both asserted, because a guard that only prints is not a guard.
// ---------------------------------------------------------------------------
{
  const { spawnSync } = require('child_process');
  const os = require('os');
  const repo = path.resolve(__dirname, '..');
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-routing-check-'));
  const copy = rel => {
    const dst = path.join(sandbox, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(path.join(repo, rel), dst);
  };
  const runCheck = () => spawnSync(process.execPath,
    [path.join(sandbox, 'scripts', 'generate-routing-surfaces.js'), '--check'],
    { encoding: 'utf8' });
  try {
    for (const rel of [
      'scripts/generate-routing-surfaces.js',
      'scripts/kaola-workflow-adaptive-schema.js',
      'templates/routing/rename-table.js',
      'templates/routing/slots.js',
    ]) copy(rel);
    for (const skeleton of new Set(GENERATED_SURFACES.map(r => r.skeleton))) {
      copy(path.join('templates', 'routing', skeleton));
    }
    for (const row of GENERATED_SURFACES) copy(row.path);

    const clean = runCheck();
    eq(clean.status, 0, 'mutation proof: sandbox baseline --check exits 0');
    assert(/all 30 surfaces byte-match/.test(clean.stdout), 'mutation proof: sandbox baseline reports 30 surfaces');

    // One surface per newly generated topic, each on a different surface_type,
    // so both render shapes are proven guarded. adapt is covered on BOTH shapes
    // and on a FORGE twin as well as the canonical github surface, because the
    // forge editions are exactly the copies a hand-edit historically reached
    // without the canonical one changing.
    const victims = [
      { topic: 'init', surface_type: 'skill', forge: 'gitea' },
      { topic: 'finalize', surface_type: 'command', forge: 'github' },
      { topic: 'adapt', surface_type: 'command', forge: 'github' },
      { topic: 'adapt', surface_type: 'skill', forge: 'gitlab' },
      { topic: 'adapt', surface_type: 'command', forge: 'gitea' },
    ];
    for (const v of victims) {
      const row = GENERATED_SURFACES.find(r =>
        r.topic === v.topic && r.surface_type === v.surface_type && r.forge === v.forge);
      assert(!!row, `mutation proof: ${v.topic}/${v.surface_type}/${v.forge} is registered`);
      const abs = path.join(sandbox, row.path);
      const original = fs.readFileSync(abs, 'utf8');
      fs.writeFileSync(abs, original.replace('\n\n', '\n\nHAND EDIT — not in any skeleton.\n\n'));
      assert(fs.readFileSync(abs, 'utf8') !== original, `mutation proof: ${row.path} was actually mutated`);
      const red = runCheck();
      eq(red.status, 1, `mutation proof: --check exits 1 on a hand-edited ${v.topic} surface`);
      assert(red.stderr.includes(`DRIFT: ${row.path}`), `mutation proof: --check names ${row.path} as drifted`);
      fs.writeFileSync(abs, original);
      const green = runCheck();
      eq(green.status, 0, `mutation proof: --check exits 0 again after reverting ${row.path}`);
    }
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Forge axis as a consumable API. The registry already renders three forges; a
// downstream runtime edition (opencode / Kimi Code) generates its own tree FROM
// these rows instead of reading a hardcoded `commands/` directory. That only
// holds if the axis stays DERIVED and the per-forge slice stays exact, so both
// are asserted here rather than left to the consumer.
// ---------------------------------------------------------------------------
{
  const gen = require('./generate-routing-surfaces.js');

  // The axis is derived from the edition tables, not restated.
  eq(gen.FORGES.join(','), gen.COMMAND_EDITIONS.map(e => e.forge).join(','),
    'FORGES is the COMMAND_EDITIONS forge order');
  eq(gen.FORGES.join(','), gen.SKILL_EDITIONS.map(e => e.forge).join(','),
    'FORGES is also the SKILL_EDITIONS forge order (commands and skills cannot disagree)');
  assert(Object.isFrozen(gen.FORGES), 'FORGES is frozen — a consumer cannot mutate the axis');

  // Every forge slice is exactly its command rows, and the slices partition the
  // command surfaces with nothing left over and nothing double-counted.
  const topics = Object.keys(gen.TOPICS);
  let sliceTotal = 0;
  for (const forge of gen.FORGES) {
    const rows = gen.commandSurfacesForForge(forge);
    sliceTotal += rows.length;
    eq(rows.length, topics.length, `commandSurfacesForForge(${forge}) covers every topic once`);
    assert(rows.every(r => r.forge === forge && r.surface_type === 'command'),
      `commandSurfacesForForge(${forge}) returns only that forge's COMMAND rows`);
    eq(rows.map(r => r.topic).sort().join(','), topics.slice().sort().join(','),
      `commandSurfacesForForge(${forge}) topic set equals the registry's topics`);
    assert(rows.every(r => gen.GENERATED_SURFACES.includes(r)),
      `commandSurfacesForForge(${forge}) returns the registry's own rows (same objects --check compares)`);
  }
  eq(sliceTotal, gen.GENERATED_SURFACES.filter(r => r.surface_type === 'command').length,
    'the per-forge slices partition every command surface exactly once');

  // An unknown forge THROWS rather than silently returning an empty tree, which a
  // consumer would render as "zero commands" instead of failing.
  let threw = false;
  try { gen.commandSurfacesForForge('svn'); } catch (e) { threw = /unknown forge/.test(e.message); }
  assert(threw, 'commandSurfacesForForge refuses an unknown forge instead of returning []');
}

if (failed > 0) {
  console.error(`\ntest-generate-routing-surfaces: ${failed} assertion(s) FAILED (${passed} passed).`);
  process.exit(1);
}
console.log(`test-generate-routing-surfaces: all ${passed} assertions passed.`);
