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
const { GENERATED_SURFACES, RUNTIME_RECOVERY_SURFACES, loadSkeleton, reportTypedFailure } = require('./generate-routing-surfaces.js');
const ALL_GENERATED_SURFACES = [...GENERATED_SURFACES, ...RUNTIME_RECOVERY_SURFACES];
// ONE list, two consumers: the all-role generator owns the retired-vocabulary ban and the routing
// surfaces are held to the same bytes rather than to a second copy that could drift from it.
const { ADAPTER_SOURCE, BEHAVIOR_SOURCE, RETIRED_VOCABULARY_BAN } = require('./generate-agent-profiles.js');
const { applyRenames } = require('../templates/routing/rename-table.js');
const { SLOTS, SPLICES } = require('../templates/routing/slots.js');
const fs = require('fs');
const path = require('path');

// Pre-flight: a missing skeleton is a typed, actionable failure here too. This
// suite is the second signal on the same inputs the CLI reads, so if it died
// with a raw ENOENT there would be no readable signal anywhere.
{
  try {
    for (const row of ALL_GENERATED_SURFACES) loadSkeleton(row.skeleton, row.topic);
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

const behaviorContracts = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'templates', 'agents', 'behavior-contracts.json'), 'utf8'));
const intentRosters = Object.freeze(['standard', 'reasoning', 'heavy'].reduce((out, tier) => {
  out[tier] = Object.entries(behaviorContracts.roles)
    .filter(([, contract]) => contract.intent_class === tier)
    .map(([role]) => role)
    .sort();
  return out;
}, {}));
const allRoles = Object.keys(behaviorContracts.roles);
const normalizeProse = text => String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
const roleMentions = text => allRoles.filter(role =>
  new RegExp(`(?:^|[^a-z0-9-])${role}(?:$|[^a-z0-9-])`).test(String(text || '').toLowerCase()));
const retiredRunWideInline = text =>
  /if\s+the\s+runtime\s+cannot\s+spawn\s+(?:an?\s+)?role\s+agent[\s\S]{0,100}?keep\s+the\s+work\s+inline/i.test(text);

function tierRosterGaps(text) {
  const prose = normalizeProse(text);
  const roster = prose.match(/\brole roster:\*{0,2}\s*(.*?)(?=\.\s|$)/);
  return Object.keys(intentRosters).filter(tier => {
    const segment = roster && roster[1].match(
      new RegExp(`\\b${tier}\\s+[—-]\\s*(.*?)(?=;\\s*(?:standard|reasoning|heavy)\\s+[—-]|$)`));
    return !segment
      || JSON.stringify(roleMentions(segment[1]).sort()) !== JSON.stringify(intentRosters[tier]);
  }).map(tier => `${tier}-role-roster`);
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
// Scripts-resolver slots: ONE resolver per topic family, two surface shapes,
// three forges. It is the seam every sibling script invocation downstream
// depends on, so each rendering must name its OWN edition's claim aggregator
// and set both variables the skeleton then uses — a resolver that renders the
// wrong edition's basename fails silently at runtime, on the consumer's box.
// ---------------------------------------------------------------------------
{
  const ir = { slots: SLOTS, splices: {} };
  const expectedClaim = {
    github: 'kaola-workflow-claim.js',
    gitlab: 'kaola-gitlab-workflow-claim.js',
    gitea: 'kaola-gitea-workflow-claim.js',
  };
  const foreignClaim = {
    github: ['kaola-gitlab-workflow-claim.js', 'kaola-gitea-workflow-claim.js'],
    gitlab: ['kaola-gitea-workflow-claim.js'],
    gitea: ['kaola-gitlab-workflow-claim.js'],
  };
  for (const slotName of ['nx-scripts-resolver', 'fz-scripts-resolver']) {
    for (const surfaceType of ['command', 'skill']) {
      for (const forge of ['github', 'gitlab', 'gitea']) {
        const rendered = renderSkeleton(`<!-- SLOT:${slotName} -->`, ctx(surfaceType, forge), ir);
        assert(rendered.includes(expectedClaim[forge]),
          `${slotName}: ${surfaceType}/${forge} names its own edition's claim aggregator`);
        for (const alien of foreignClaim[forge]) {
          assert(!rendered.includes(alien),
            `${slotName}: ${surfaceType}/${forge} must not name another edition's ${alien}`);
        }
        for (const v of ['KAOLA_SCRIPTS=', 'CLAIM_JS=']) {
          assert(rendered.includes(v),
            `${slotName}: ${surfaceType}/${forge} sets ${v} for the skeleton lines that follow`);
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
// rename-table: the post-render forge-noun rename.
//
// The SHIPPED table is empty — every forge-specific basename the three
// skeletons name is forge-keyed at source in slots.js, which is the stronger
// mechanism (it cannot mistake prose for a path). An empty table would make an
// identity-only assertion unfalsifiable, so the mechanism is proven against an
// INJECTED table and the shipped table's emptiness is asserted as its own fact.
// ---------------------------------------------------------------------------
{
  const { RENAMES, FORGE_INVARIANT } = require('../templates/routing/rename-table.js');
  eq(Object.keys(RENAMES).length, 0,
    'rename-table: the shipped table is empty — forge basenames are keyed at source, not substituted after');

  // POSITIVE (injected): the substitution still works, per forge, and github stays canonical.
  const table = { 'kaola-workflow-probe.js': { gitlab: 'kaola-gitlab-workflow-probe.js', gitea: 'kaola-gitea-workflow-probe.js' } };
  const text = 'run kaola-workflow-probe.js now';
  eq(applyRenames(text, 'github', table), 'run kaola-workflow-probe.js now', 'rename: github is canonical (no rename)');
  eq(applyRenames(text, 'gitlab', table), 'run kaola-gitlab-workflow-probe.js now', 'rename: gitlab');
  eq(applyRenames(text, 'gitea', table), 'run kaola-gitea-workflow-probe.js now', 'rename: gitea');

  // The declared forge-invariant scripts must never acquire an entry.
  for (const name of FORGE_INVARIANT) {
    assert(!Object.prototype.hasOwnProperty.call(RENAMES, name),
      `rename-table: ${name} is declared forge-invariant and must not be renamed`);
  }

  // Rendering goes through applyRenames with the SHIPPED table, so a surface is byte-identical
  // across forges wherever the skeleton itself does not diverge.
  const ir = { slots: {}, splices: {} };
  eq(renderSkeleton('plain body', ctx('command', 'gitlab'), ir), 'plain body',
    'rename: the shipped (empty) table leaves rendered bytes untouched');
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
// Topic registry: every registered topic derives exactly six surfaces (3 forges
// x command + skill) and every path is COMPUTED from the topic basenames. Two
// topics are ASYMMETRIC (command basename differs from skill basename); the
// third is symmetric. Asserted structurally so a topic can neither be
// registered with a hand-typed path nor silently drop a forge.
// ---------------------------------------------------------------------------
{
  const { TOPICS } = require('./generate-routing-surfaces.js');
  const topics = Object.keys(TOPICS).sort();
  eq(topics.join(','), 'finalize,init,next', 'registry carries exactly the three generated topics');
  eq(GENERATED_SURFACES.length, 18, 'registry derives 18 surfaces (3 topics x 6)');
  eq(RUNTIME_RECOVERY_SURFACES.length, 6,
    'compact-recovery registry derives six tracked Claude/Codex prompt artifacts');
  eq(RUNTIME_RECOVERY_SURFACES.filter(r => r.runtime === 'claude').length, 3,
    'compact-recovery registry carries all three Claude forge artifacts');
  eq(RUNTIME_RECOVERY_SURFACES.filter(r => r.runtime === 'codex').length, 3,
    'compact-recovery registry carries all three Codex forge artifacts');
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
  // Every registered topic names a skeleton that is actually on disk, so a topic can never be
  // registered against a source file nobody staged.
  for (const topic of topics) {
    assert(typeof TOPICS[topic].skeleton === 'string' && TOPICS[topic].skeleton.endsWith('.skeleton.md'),
      `${topic}: names a .skeleton.md source`);
    assert(fs.existsSync(path.resolve(__dirname, '..', 'templates', 'routing', TOPICS[topic].skeleton)),
      `${topic}: its skeleton source is on disk`);
  }
  // Paths are derived, never hand-typed: spot-check one row per topic.
  const pathOf = (topic, surface_type, forge) =>
    (GENERATED_SURFACES.find(r => r.topic === topic && r.surface_type === surface_type && r.forge === forge) || {}).path;
  eq(pathOf('init', 'command', 'github'), 'commands/workflow-init.md', 'init github command path derived');
  eq(pathOf('init', 'skill', 'gitlab'), 'plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md', 'init gitlab skill path derived');
  eq(pathOf('finalize', 'command', 'gitea'), 'plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md', 'finalize gitea command path derived');
  eq(pathOf('finalize', 'skill', 'github'), 'plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md', 'finalize github skill path derived');
  eq(pathOf('next', 'command', 'gitlab'), 'plugins/kaola-workflow-gitlab/commands/workflow-next.md', 'next gitlab command path derived');
  eq(pathOf('next', 'skill', 'gitea'), 'plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md', 'next gitea skill path derived');
}

// ---------------------------------------------------------------------------
// Real generation contract for all three topics. They were hand-ported per
// runtime before they were skeleton-backed, so the byte-identity assertion is
// the whole point: a rule may no longer be edited into one surface without its
// canonical source. Each topic also pins the tokens that must reach ALL SIX of
// its surfaces, so a rule cannot quietly leave the command-or-skill half.
// ---------------------------------------------------------------------------
{
  const repo = path.resolve(__dirname, '..');
  const ir = { slots: SLOTS, splices: SPLICES };
  const requiredByTopic = {
    init: [
      'The executable consumer wording lives only in the adjacent',
      '`kaola-workflow-project-instruction-templates.js` distribution module',
      'kaola-workflow-project-instructions.js',
      'plan --project-root "$PWD" --json',
      'apply --project-root "$PWD" --json',
      'check --project-root "$PWD" --json',
      'decision_required',
      'active_run_preserved',
      'authority_layout_equivalent',
      'execution_default_change',
      'state_schema_incompatible',
      'unknown_or_mixed',
      'converged',
      'every owner byte outside those regions byte-for-byte',
    ],
    next: [
      '<!-- PIN: consent-in-conversation -->',
      'workflow-state.md',
      'mission-list.md',
      'nothing depends on a stable ID',
      'status: todo',
      'in-flight',
      'dispatched: self',
      '--target-issue',
      '--target-issues',
      'Look for the work, not for the worker.',
      'kaola-workflow-finalize',
    ],
    finalize: [
      '<!-- PIN: consent-in-conversation -->',
      '<!-- PIN: sink-reports-orchestrator-owns -->',
      '<!-- PIN: closure-audit -->',
      'finalization-summary.md',
      'workflow-state.md',
      'mission-list.md',
      '## Validation',
      '## Changed Paths',
      'chain-receipt.json',
      'final-validation.md',
      '--issue-numbers',
      'closure-audit',
      'sink-merge',
      'doc-updater',
      'kaola-workflow/archive/',
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
      if (topic === 'next' || topic === 'finalize') {
        const rosterGaps = tierRosterGaps(rendered);
        assert(rosterGaps.length === 0,
          `real ${topic} behavior-authority role roster propagates to ${row.path} — missing ${JSON.stringify(rosterGaps)}`);
      }
      if (topic === 'next') {
        assert(!retiredRunWideInline(rendered),
          `real next whole-surface fallback rejects the retired run-wide inline wording in ${row.path}`);
      }
    }
  }

  const itemLocalBoundary = 'Inline the current item only when no adequate native route exists; re-evaluate the next item.';
  assert(!retiredRunWideInline(itemLocalBoundary),
    'real next fallback mutation boundary accepts current-item inline after adequate routes are exhausted');
  assert(retiredRunWideInline(itemLocalBoundary
    + ' If the runtime cannot spawn a role agent, keep the work inline and say so.'),
  'real next fallback mutation RED detects the retired broad sentence appended below valid item-local guidance');
}

// ---------------------------------------------------------------------------
// workflow-init instruction-authority contract, all six surfaces.
//
// The executable consumer contract lives in the adjacent distribution module
// and the project-instruction helper is its only writer. The routing surfaces
// may explain that contract and invoke plan/apply/check; they must not grow a
// second universal contract in CLAUDE.md, prescribe a direct maintenance edit
// after the helper has made an ownership decision, or accidentally turn the
// remaining initialization steps into code-block contents.
//
// These are PURE detectors so each claim is mutation-proved below. The real
// assertions run against every rendered init surface; the byte-identity checks
// above independently guarantee those are the bytes committed to ship.
// ---------------------------------------------------------------------------
{
  const initRows = GENERATED_SURFACES.filter(row => row.topic === 'init');
  eq(initRows.length, 6, 'init authority audit covers all six routing surfaces');

  const sentences = text => text.replace(/\n+/g, ' ').split(/(?<=[.!?])\s+/).map(s => s.trim());
  const universalSection = '(?:Project Snapshot|Commands|Non-Negotiable Rules|First Principles|Validation Policy|Kaola-Workflow|Documentation Map|Maintenance)';

  // Detect prose which assigns universal sections to CLAUDE.md. Exact current
  // wording is not the contract: the second expression also catches a plausible
  // rewrite such as "verify CLAUDE.md contains Commands and First Principles".
  const universalClaudeClaims = text => sentences(text).filter(sentence =>
    /required\s+`?CLAUDE\.md`?\s+sections?/i.test(sentence)
    || new RegExp('(?:ensure|require|verify|report|check)[^.]{0,160}`?CLAUDE\\.md`?[^.]{0,160}'
      + universalSection, 'i').test(sentence)
    || new RegExp('`?CLAUDE\\.md`?[^.]{0,160}(?:must|should|contains?|carries?)[^.]{0,160}'
      + universalSection, 'i').test(sentence));

  // A positive direct-edit instruction for either authority file bypasses the
  // helper's decision_required/active_run_preserved verdict. Negative clauses
  // ("do not replace", "never edit") are accepted, including when a later
  // sentence on the same source line contains a separate positive action.
  const maintenanceOverrides = text => sentences(text).filter(sentence => {
    if (!/(?:`?(?:AGENTS|CLAUDE)\.md`?|Maintenance Note|instruction authority)/i.test(sentence)) return false;
    if (/^(?:never|do not|don't|must not|should not|cannot|can't)\b/i.test(sentence)) return false;
    const verb = /\b(?:add|append|insert|modify|edit|rewrite|replace|remove|delete|overwrite)\b/ig;
    let match;
    while ((match = verb.exec(sentence)) !== null) {
      const prefix = sentence.slice(Math.max(0, match.index - 36), match.index);
      if (!/(?:do not|don't|never|must not|should not|cannot|can't)\s+(?:silently\s+)?$/i.test(prefix)) {
        return true;
      }
    }
    return false;
  });

  // CommonMark-style fence audit. An info-string fence seen while another
  // fence is open is not a close; it is the characteristic signature of a
  // stray bare fence swallowing the next intended block. Required prose
  // landmarks are also required to occur outside every fence.
  const markdownStructureViolations = (text, surfaceType) => {
    const requiredOutside = surfaceType === 'command'
      ? [
        'Prepare the current project for repeated `/workflow-next` implementation cycles.',
        '## Step 1 — Scan Project State',
        '## Step 3 — Create `AGENTS.md`',
        '## Step 4 — Create Missing Workflow Structure',
      ]
      : [
        'Bootstrap the current repo for repeated Kaola-Workflow for Codex cycles. Preserve existing project guidance and add only missing Codex-specific structure.',
        '## Required Behavior',
        '## Create `AGENTS.md`',
        '## Initial File Bodies',
      ];
    const outside = new Set();
    const violations = [];
    let fence = null;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const opener = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (fence) {
        const close = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
        if (close && close[1][0] === fence.char && close[1].length >= fence.length) {
          fence = null;
          continue;
        }
        if (opener && opener[2].trim() !== '') {
          violations.push(`line ${i + 1}: language-tagged fence opened inside an existing fence`);
        }
        if (requiredOutside.includes(line.trim())) {
          violations.push(`line ${i + 1}: instruction landmark is inside a code fence: ${line.trim()}`);
        }
        continue;
      }
      if (opener) {
        // Backtick info strings may not themselves contain a backtick.
        if (opener[1][0] !== '`' || !opener[2].includes('`')) {
          fence = { char: opener[1][0], length: opener[1].length, line: i + 1 };
          continue;
        }
      }
      if (requiredOutside.includes(line.trim())) outside.add(line.trim());
    }
    if (fence) violations.push(`line ${fence.line}: code fence is not closed`);
    for (const landmark of requiredOutside) {
      if (!outside.has(landmark)) violations.push(`instruction landmark is absent outside fences: ${landmark}`);
    }
    return violations;
  };

  const ir = { slots: SLOTS, splices: SPLICES };
  for (const row of initRows) {
    const rendered = renderSkeleton(loadSkeleton(row.skeleton, row.topic),
      { surface_type: row.surface_type, forge: row.forge }, ir);
    const id = `${row.surface_type}/${row.forge} (${row.path})`;
    const authorityLandmarks = row.surface_type === 'command'
      ? [
        'Make `AGENTS.md` the universal project contract.',
        'smallest bridge to `AGENTS.md` plus that runtime\'s genuine overlay',
      ]
      : [
        'Reconcile `AGENTS.md` as the universal authority',
        'Keep any runtime-native first-read instruction file as a thin bridge plus runtime-only overlay',
      ];
    for (const landmark of authorityLandmarks) {
      assert(rendered.includes(landmark),
        `init authority ${id}: current universal-authority/bridge landmark propagates — ${landmark}`);
    }
    const universal = universalClaudeClaims(rendered);
    const overrides = maintenanceOverrides(rendered);
    const structure = markdownStructureViolations(rendered, row.surface_type);
    assert(universal.length === 0,
      `init authority ${id}: CLAUDE.md carries no required universal section language — `
      + universal.map(x => JSON.stringify(x)).join(', '));
    assert(overrides.length === 0,
      `init authority ${id}: no maintenance action bypasses the helper's ownership decision — `
      + overrides.map(x => JSON.stringify(x)).join(', '));
    assert(structure.length === 0,
      `init structure ${id}: code fences are balanced and preamble/scaffold headings remain instructions — `
      + structure.join('; '));
  }

  // MUTATION PROOF: each detector accepts a compliant boundary and rejects a
  // believable near-miss without touching any production or generated file.
  const authorityBoundary = [
    'Make `AGENTS.md` the universal project contract.',
    'Keep `CLAUDE.md` as a thin bridge to it.',
    'If the helper reports `decision_required`, ask in conversation and write nothing.',
    'Never edit or replace either instruction authority outside the helper decision.',
  ].join('\n');
  eq(universalClaudeClaims(authorityBoundary).length, 0,
    'init authority mutation boundary: a thin CLAUDE bridge is not mistaken for universal CLAUDE sections');
  eq(maintenanceOverrides(authorityBoundary).length, 0,
    'init authority mutation boundary: negative no-edit language is accepted');
  assert(universalClaudeClaims(authorityBoundary
    + '\nVerify `CLAUDE.md` contains Commands and First Principles.').length > 0,
  'init authority mutation RED: assigning universal sections to CLAUDE.md is detected');
  assert(maintenanceOverrides(authorityBoundary
    + '\nIf the helper reports `decision_required`, append a `## Maintenance Note` to `CLAUDE.md`.').length > 0,
  'init authority mutation RED: a direct maintenance write after decision_required is detected');

  const structureBoundary = [
    'Prepare the current project for repeated `/workflow-next` implementation cycles.',
    '## Step 1 — Scan Project State',
    '```bash',
    'pwd',
    '```',
    '## Step 3 — Create `AGENTS.md`',
    '## Step 4 — Create Missing Workflow Structure',
    '```text',
    'docs/',
    '```',
  ].join('\n');
  eq(markdownStructureViolations(structureBoundary, 'command').length, 0,
    'init structure mutation boundary: balanced command fences keep every instruction landmark in prose');
  const swallowed = structureBoundary.replace('## Step 4 — Create Missing Workflow Structure',
    '```\n## Step 4 — Create Missing Workflow Structure');
  assert(markdownStructureViolations(swallowed, 'command').length > 0,
    'init structure mutation RED: a stray fence swallowing Step 4 is detected');
}

// ---------------------------------------------------------------------------
// The consent rule is ONE wording across ALL EIGHTEEN surfaces.
//
// It replaced a durable valve, so it is the entire mechanism for keeping an
// irreversible or value-laden call with the user. A mechanism that reads
// differently on three topics is three mechanisms, and the one a reader lands
// on is an accident of which command they invoked. Byte-identity is not the
// available invariant (the three topics illustrate the rule with their own
// examples), so the invariant is the RULE SENTENCE itself: extracted from each
// surface and compared whitespace-normalized, so a re-wrap is ignored and every
// other difference goes red.
// ---------------------------------------------------------------------------
{
  const repo = path.resolve(__dirname, '..');
  const ir = { slots: SLOTS, splices: SPLICES };
  const CLAUSE = ['**Consent.** Irreversible and value-laden calls', 'taking one.'];
  const normalize = str => str.replace(/\s+/g, ' ').trim();

  // extractClause — PURE. Returns the normalized clause, or null when either marker is missing
  // (an absent clause is itself a failure, never a pass).
  const extractClause = text => {
    const i = text.indexOf(CLAUSE[0]);
    if (i < 0) return null;
    const j = text.indexOf(CLAUSE[1], i);
    if (j < 0) return null;
    return normalize(text.slice(i, j + CLAUSE[1].length));
  };

  // clauseSplits — PURE detector over surface -> text. Returns a non-empty list when the rule
  // does NOT resolve to exactly one wording, so the same function runs against the real renders
  // (must be empty) and against a deliberately-forked set (must not be).
  const clauseSplits = rendered => {
    const byWording = new Map();
    for (const [surface, text] of Object.entries(rendered)) {
      const bucket = extractClause(text) === null ? '(absent)' : extractClause(text);
      if (!byWording.has(bucket)) byWording.set(bucket, []);
      byWording.get(bucket).push(surface);
    }
    if (byWording.size === 1 && !byWording.has('(absent)')) return [];
    return [{
      wordings: byWording.size,
      detail: `the consent rule has ${byWording.size} wording(s) across the eighteen surfaces: `
        + [...byWording.entries()]
          .map(([w, v]) => `${v.join('+')}${w === '(absent)' ? ' [ABSENT]' : ''}`).join(' | ')
        + '. One rule, one wording — reconcile the text, do not add a second reading.',
    }];
  };

  const renderedAll = {};
  const committedAll = {};
  for (const row of GENERATED_SURFACES) {
    const key = `${row.topic}/${row.surface_type}/${row.forge}`;
    renderedAll[key] = renderSkeleton(loadSkeleton(row.skeleton, row.topic),
      { surface_type: row.surface_type, forge: row.forge }, ir);
    committedAll[key] = fs.readFileSync(path.join(repo, row.path), 'utf8');
  }
  eq(Object.keys(renderedAll).length, 18, 'consent one-wording check covers all eighteen surfaces');

  // POSITIVE: one wording today, in the render AND in the committed bytes.
  for (const sp of clauseSplits(renderedAll)) console.error(`  FAIL: ${sp.detail}`);
  eq(clauseSplits(renderedAll).length, 0, 'the consent rule is ONE wording across all eighteen surfaces');
  eq(clauseSplits(committedAll).length, 0, 'the committed surfaces carry ONE wording of the consent rule');

  // Retired ADR 0017 vocabulary, over the RENDER as well as the committed bytes. The same list
  // already guards the twelve reviewer surfaces; it lived in exactly one generator, so the eighteen
  // routing surfaces were the remaining render family with no scan at all. Two observed failures put
  // it here rather than on the watch list: `node-id` reached twelve surfaces through a generator's
  // own render (#885, authored-only scanning), and retired node/DAG wording shipped in the plugin
  // manifests a user reads before installing (#882). Both are this family; only the manifests and
  // the reviewer render were repaired. Scanning `renderedAll` is the half that matters — a skeleton
  // is authored, but a token can also enter through a slot, a splice or a forge rename, and none of
  // those exist until the surface is rendered. `committedAll` is scanned too so a tracked surface
  // that drifted from its skeleton cannot carry one either.
  const retiredHits = [];
  for (const [key, text] of [...Object.entries(renderedAll), ...Object.entries(committedAll)]) {
    const hit = text.match(RETIRED_VOCABULARY_BAN);
    if (hit) retiredHits.push(`${key}: ${hit[0]}`);
  }
  for (const h of retiredHits) console.error(`  FAIL: retired vocabulary on a routing surface — ${h}`);
  eq(retiredHits.length, 0, 'no routing surface renders or commits retired ADR 0017 vocabulary');
  // Anti-vacuity: the scan must have had something to read. An empty render map would satisfy the
  // assertion above without inspecting a byte.
  eq(Object.keys(renderedAll).length + Object.keys(committedAll).length, 36,
    'the retired-vocabulary scan covers all eighteen rendered AND all eighteen committed surfaces');

  // NEGATIVE (mutation proof): fork one surface's wording, and delete it from another. Without
  // these the two assertions above are only evidence that today's text happens to agree.
  {
    const forked = Object.assign({}, renderedAll);
    forked['finalize/skill/gitea'] = forked['finalize/skill/gitea']
      .replace('belong to the user', 'are yours to make');
    assert(clauseSplits(forked).some(sp => sp.wordings === 2),
      'mutation proof: a second wording of the consent rule on ONE surface goes red');

    const dropped = Object.assign({}, renderedAll);
    dropped['next/command/gitlab'] = dropped['next/command/gitlab']
      .split('**Consent.** Irreversible and value-laden calls').join('REMOVED');
    assert(clauseSplits(dropped).length > 0,
      'mutation proof: deleting the consent rule from ONE surface goes red (absence is never a pass)');

    // Boundary: a re-wrap alone must NOT be reported, or the guard is unsatisfiable by the
    // shipped bytes and gets disabled.
    const rewrapped = Object.assign({}, renderedAll);
    rewrapped['init/command/github'] = rewrapped['init/command/github']
      .replace('ask, in conversation, before\ntaking one.', 'ask, in conversation,\nbefore taking one.');
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
// next or finalize surface is hand-edited. Run against a disposable copy of the
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
    // The JS the sandbox needs to start at all, DERIVED from the require graph the parent process
    // already realized rather than hand-typed. A hand-typed enumeration went stale twice;
    // `children` is a faithful require-edge list (a module already in the cache is still recorded
    // on its requirer), so a new require anywhere under the generator is picked up with no line to
    // add here. Repo-local only: node_modules and anything outside the tree is dropped, because the
    // sandbox copies by relative path.
    const jsInputs = (() => {
      const entry = require.resolve('./generate-routing-surfaces.js');
      require(entry);
      const seen = new Set();
      const walk = id => {
        if (seen.has(id)) return;
        seen.add(id);
        for (const child of (require.cache[id] ? require.cache[id].children : [])) walk(child.filename);
      };
      walk(entry);
      return [...seen]
        .map(abs => path.relative(repo, abs))
        .filter(rel => rel && !rel.startsWith('..') && !path.isAbsolute(rel)
          && !rel.split(path.sep).includes('node_modules'))
        .sort();
    })();
    // The derivation is anchored, not trusted. An empty list starves every spawn, and a starved
    // spawn exits 1 — the same code --check uses to signal detected drift, which is exactly how a
    // stale list left the RED assertions below passing against a process that rendered nothing.
    // The count is deliberately NOT pinned: growing is the correct response to a new require.
    assert(jsInputs.length > 0,
      'mutation proof: the derived sandbox copy list is non-empty (an empty list starves every spawn)');
    for (const rel of jsInputs) copy(rel);
    // slots.js now renders runtime-native next/finalize guidance from this declared data source.
    // It is not visible in Node's require graph, so copy the path exported by its owning module.
    copy(ADAPTER_SOURCE);
    copy(BEHAVIOR_SOURCE);
    copy(path.join('templates', 'routing', 'dispatch-contract.md'));
    for (const skeleton of new Set(ALL_GENERATED_SURFACES.map(r => r.skeleton))) {
      copy(path.join('templates', 'routing', skeleton));
    }
    for (const row of ALL_GENERATED_SURFACES) copy(row.path);

    const clean = runCheck();
    // The spawned stderr is carried into the message. A sandbox that cannot start reports the same
    // exit code as a detected drift, so on the one occasion this list did go stale the suite's own
    // output named nothing: sixteen failures, all of them downstream, and the actual
    // `Cannot find module` line lived only in a child process whose stderr nobody printed. The
    // cause had to be rebuilt by hand to be seen. When the check passes, stderr is empty and the
    // message is unchanged.
    eq(clean.status, 0, 'mutation proof: sandbox baseline --check exits 0'
      + (clean.stderr ? `\n    sandbox stderr: ${clean.stderr.trim().split('\n').slice(0, 5).join('\n      ')}` : ''));
    assert(/all 24 surfaces byte-match/.test(clean.stdout), 'mutation proof: sandbox baseline reports 24 surfaces');

    // Every topic is covered on BOTH render shapes, and the FORGE twins as well as the canonical
    // github surface, because the forge editions are exactly the copies a hand-edit historically
    // reached without the canonical one changing.
    const victims = [
      { topic: 'init', surface_type: 'skill', forge: 'gitea' },
      { topic: 'init', surface_type: 'command', forge: 'github' },
      { topic: 'next', surface_type: 'command', forge: 'github' },
      { topic: 'next', surface_type: 'skill', forge: 'gitlab' },
      { topic: 'finalize', surface_type: 'command', forge: 'github' },
      { topic: 'finalize', surface_type: 'skill', forge: 'gitea' },
      { topic: 'finalize', surface_type: 'command', forge: 'gitlab' },
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
      eq(red.status, 1, `mutation proof: --check exits 1 on a hand-edited ${v.topic} surface (${row.path})`);
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

// ---------------------------------------------------------------------------
// REGION-REASON — every divergence states WHY it exists.
//
// A region records THAT a surface diverges; the reason on the directive line records why. The
// renderer reads only the condition and makes the reason OPTIONAL, so a bare `<!-- REGION:skill -->`
// renders identically to an annotated one and nothing anywhere notices. Until this block, the
// annotations were held by convention alone — and "each divergence either removed, or annotated
// with the capability difference that justifies it" is an acceptance criterion, not a style note.
//
// This pin asserts a reason is PRESENT. It does NOT adjudicate whether the reason is a good one:
// there is no taxonomy of acceptable reasons here and no observed failure asking for one. That is
// deliberate and load-bearing — one region pair (init.skeleton.md, the scaffold-tree heading) is
// annotated with a presentation-shape reason rather than a capability difference, and it passes on
// presence exactly like every other region, which is the correct outcome. A known residual that
// says out loud what it is remains legible to a reader; a grammar would only have taught it to
// phrase itself past the check.
// ---------------------------------------------------------------------------
{
  // Deliberately BROADER than the renderer's own RE_REGION_OPEN. That pattern makes the reason
  // optional AND would not match a malformed directive at all, so reusing it would let exactly the
  // two shapes this block exists to catch — the bare region and the typo'd one — pass unseen.
  const REGION_OPEN_ANY = /^<!--\s*REGION:/;
  const REGION_WITH_REASON = /^<!--\s*REGION:[A-Za-z0-9_+,-]+\s+—\s+(\S[\s\S]*?)\s*-->$/;

  // Factored out so it can be mutation-proved below without writing to a real skeleton.
  const regionsMissingReason = text => text.split('\n')
    .map((line, i) => ({ text: line.trim(), n: i + 1 }))
    .filter(x => REGION_OPEN_ANY.test(x.text) && !REGION_WITH_REASON.test(x.text));
  const reasonsIn = text => text.split('\n')
    .map(l => (l.trim().match(REGION_WITH_REASON) || [])[1])
    .filter(Boolean);

  const routingDir = path.resolve(__dirname, '..', 'templates', 'routing');
  const registered = [...new Set(ALL_GENERATED_SURFACES.map(r => r.skeleton))].sort();
  const onDisk = fs.readdirSync(routingDir).filter(f => f.endsWith('.skeleton.md')).sort();
  // An unregistered skeleton would carry regions this scan never reads, so the scan's own domain is
  // asserted rather than assumed.
  eq(onDisk.join(','), registered.join(','),
    'REGION-reason: the skeletons on disk are exactly the registered ones, so the scan below sees '
    + 'every region there is');

  let totalRegions = 0;
  const allReasons = [];
  for (const skeleton of registered) {
    const text = fs.readFileSync(path.join(routingDir, skeleton), 'utf8');
    const opens = text.split('\n').filter(l => REGION_OPEN_ANY.test(l.trim())).length;
    const missing = regionsMissingReason(text);
    totalRegions += opens;
    allReasons.push(...reasonsIn(text));
    assert(missing.length === 0,
      `REGION-reason: every REGION directive in ${skeleton} carries a reason after the em dash — `
      + `${missing.length} of ${opens} do not: `
      + missing.map(m => `${skeleton}:${m.n} ${JSON.stringify(m.text.slice(0, 60))}`).join(', '));
  }
  // Non-vacuity by witness: a scan pointed at the wrong directory, or a grammar change that stopped
  // matching, finds zero regions and every assertion above passes for the wrong reason.
  assert(totalRegions > 0,
    `REGION-reason: the scan found ZERO region directives across ${JSON.stringify(registered)} — `
    + 'it is looking in the wrong place or the directive grammar moved');
  eq(allReasons.length, totalRegions,
    'REGION-reason: every region found is also a region whose reason was extracted (the two scans '
    + 'agree, so neither is silently matching a different line set)');

  // The reason is AUTHORING metadata. The renderer emits unrecognised comment lines verbatim, so a
  // reason that reached a shipped surface would be a new defect — consumer-facing text carrying an
  // internal justification for a divergence the consumer cannot see.
  const repoRoot = path.resolve(__dirname, '..');
  // Deduplicated: the preflight-gate reason is written identically in two skeletons, and reporting
  // one leak twice makes a reader count defects that are not there.
  const distinctReasons = [...new Set(allReasons)];
  let leaked = 0;
  for (const row of ALL_GENERATED_SURFACES) {
    const surface = fs.readFileSync(path.join(repoRoot, row.path), 'utf8');
    for (const reason of distinctReasons) {
      if (surface.includes(reason)) {
        leaked++;
        assert(false, `REGION-reason: the reason ${JSON.stringify(reason.slice(0, 60))} reached the `
          + `shipped surface ${row.path} — reasons are authoring metadata and must not render`);
      }
    }
  }
  assert(leaked === 0,
    `REGION-reason: no region reason reaches any of the ${ALL_GENERATED_SURFACES.length} shipped surfaces`);

  // MUTATION PROOF, both directions, against REAL skeleton bytes held in memory — the tree is never
  // written. Stripping the reason from one real region must be seen; restoring it must clear.
  {
    const victim = registered.find(s => reasonsIn(fs.readFileSync(path.join(routingDir, s), 'utf8')).length > 0);
    assert(!!victim, 'REGION-reason mutation: at least one skeleton carries an annotated region to strip');
    const original = fs.readFileSync(path.join(routingDir, victim), 'utf8');
    const target = original.split('\n').find(l => REGION_WITH_REASON.test(l.trim()));
    const bare = target.trim().replace(REGION_WITH_REASON, (m, r) => m.replace(' — ' + r, ''));
    assert(bare !== target.trim() && REGION_OPEN_ANY.test(bare) && !/—/.test(bare),
      `REGION-reason mutation: the stripped form is a bare region directive — got ${JSON.stringify(bare)}`);
    const stripped = original.replace(target, bare);
    eq(regionsMissingReason(stripped).length, 1,
      `REGION-reason mutation (RED): stripping the reason from ${victim} must be detected`);
    eq(regionsMissingReason(original).length, 0,
      `REGION-reason mutation (GREEN): the unmodified ${victim} has no unannotated region`);
    eq(fs.readFileSync(path.join(routingDir, victim), 'utf8'), original,
      'REGION-reason mutation: the real skeleton on disk was never written');
  }
}

if (failed > 0) {
  console.error(`\ntest-generate-routing-surfaces: ${failed} assertion(s) FAILED (${passed} passed).`);
  process.exit(1);
}
console.log(`test-generate-routing-surfaces: all ${passed} assertions passed.`);
