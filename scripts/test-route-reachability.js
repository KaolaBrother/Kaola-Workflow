#!/usr/bin/env node
'use strict';

// test-route-reachability.js (issue #400) — every route/skill target a claim/startup/resume
// receipt can emit MUST resolve to an installed surface, per edition. This is the executable
// twin of the registry-driven reachability assert now in all four contract validators.
//
// The forge-codex dead zone (#400): the byte-identical adaptive schema emits PLAN_RUN_SKILL /
// ADAPT_SKILL as the resume/route target and the forge claim.js routes adaptive unconditionally,
// but the gitlab/gitea skills/ trees shipped neither kaola-workflow-plan-run nor kaola-workflow-adapt
// — so a Codex claim/startup/resume receipt pointed at a skill that did not exist. This test fails
// RED on a forge-codex tree without those SKILLs and GREEN once the adaptive SKILL pack ships.

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.error('FAIL: ' + msg); } }
const exists = rel => fs.existsSync(path.join(REPO, rel));
// whitespace-normalize multi-word needles for reflow tolerance (same convention as the
// validate-*-contracts.js norm() helper) — a prose sentence line-wrapped in the source markdown
// must still match a needle written as one continuous string.
const norm = s => String(s).replace(/\s+/g, ' ');

// The byte-identical adaptive schema is the single source of the adaptive route constants — every
// edition's schema (the forge files keep the canonical name) re-exports the same values, so requiring
// the canonical one is the no-drift source for the EMITTED set.
const schema = require('./kaola-workflow-adaptive-schema.js');

// ---------------------------------------------------------------------------
// Receipt route-emission model (mirrors claim.js output()/resume next_skill + next_command):
//   adaptive  -> next_skill = PLAN_RUN_SKILL, next_command = PLAN_RUN_COMMAND
//   front-end -> ADAPT_SKILL / ADAPT_COMMAND (kaola-workflow-next routes a FRESH adaptive run there)
//   fast      -> kaola-workflow-fast (skill) / /kaola-workflow-fast (command)
//   full      -> kaola-workflow-research (skill) / /kaola-workflow-phase1 (command)
// These are the bare targets; claim.js suffixes ` {project}`. Reachability is the bare target.
// ---------------------------------------------------------------------------
const stripSlash = c => c.replace(/^\//, '');
const emittedSkillTargets = [
  schema.PLAN_RUN_SKILL,
  schema.ADAPT_SKILL,
  'kaola-workflow-fast',
  'kaola-workflow-research'
];
const emittedCommandTargets = [
  stripSlash(schema.PLAN_RUN_COMMAND),
  stripSlash(schema.ADAPT_COMMAND),
  'kaola-workflow-fast',
  'kaola-workflow-phase1'
];

// Per-edition installed surfaces.
const codexEditions = [
  { name: 'github-codex', skillsDir: 'plugins/kaola-workflow/skills' },
  { name: 'gitlab-codex', skillsDir: 'plugins/kaola-workflow-gitlab/skills' },
  { name: 'gitea-codex', skillsDir: 'plugins/kaola-workflow-gitea/skills' }
];
const claudeEditions = [
  { name: 'github-claude', commandsDir: 'commands' },
  { name: 'gitlab-claude', commandsDir: 'plugins/kaola-workflow-gitlab/commands' },
  { name: 'gitea-claude', commandsDir: 'plugins/kaola-workflow-gitea/commands' }
];

function installedSkills(skillsDir) {
  const full = path.join(REPO, skillsDir);
  return new Set(
    fs.readdirSync(full, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .filter(name => exists(skillsDir + '/' + name + '/SKILL.md'))
  );
}
function installedCommands(commandsDir) {
  return new Set(
    fs.readdirSync(path.join(REPO, commandsDir))
      .filter(f => f.endsWith('.md'))
      .map(f => f.slice(0, -'.md'.length))
  );
}

// ---------------------------------------------------------------------------
// T1: every emitted CODEX skill target resolves in every codex edition (the #400 core).
// ---------------------------------------------------------------------------
for (const ed of codexEditions) {
  const surfaces = installedSkills(ed.skillsDir);
  for (const target of emittedSkillTargets) {
    assert(surfaces.has(target),
      `T1[${ed.name}]: receipt-emitted skill "${target}" resolves to ${ed.skillsDir}/${target}/SKILL.md`);
  }
}

// ---------------------------------------------------------------------------
// T2: every emitted CLAUDE command target resolves in every claude edition.
// ---------------------------------------------------------------------------
for (const ed of claudeEditions) {
  const surfaces = installedCommands(ed.commandsDir);
  for (const target of emittedCommandTargets) {
    assert(surfaces.has(target),
      `T2[${ed.name}]: receipt-emitted command "/${target}" resolves to ${ed.commandsDir}/${target}.md`);
  }
}

// ---------------------------------------------------------------------------
// T3: RED PROOF — the resolver MUST reject a missing surface. Drop the adaptive SKILL from a
// simulated forge-codex surface set (exactly the pre-#400 dead-zone state) and assert the SAME
// reachability check that passes T1 now reports the target unreachable. This proves the test bites
// (it was RED on the forge-codex tree before the SKILL pack shipped), not just that the tree is green.
// ---------------------------------------------------------------------------
{
  const deadZoneSurfaces = installedSkills('plugins/kaola-workflow-gitlab/skills');
  deadZoneSurfaces.delete(schema.PLAN_RUN_SKILL); // simulate the absent kaola-workflow-plan-run SKILL
  deadZoneSurfaces.delete(schema.ADAPT_SKILL);    // simulate the absent kaola-workflow-adapt SKILL
  const unreachable = emittedSkillTargets.filter(t => !deadZoneSurfaces.has(t));
  assert(unreachable.includes(schema.PLAN_RUN_SKILL) && unreachable.includes(schema.ADAPT_SKILL),
    'T3: the resolver flags the absent adaptive SKILLs unreachable (RED on the pre-#400 forge-codex dead zone)');
  assert(unreachable.length === 2,
    'T3: ONLY the dropped adaptive targets are unreachable — fast/research still resolve');
}

// ---------------------------------------------------------------------------
// T4: content-reachability — a SKILL mirroring a command must carry the command's route/wiring
// tokens (the #369/#380 reachability gap: a present-but-hollow surface). Per codex edition.
// ---------------------------------------------------------------------------
for (const ed of codexEditions) {
  const finalize = `${ed.skillsDir}/kaola-workflow-finalize/SKILL.md`;
  const next = `${ed.skillsDir}/kaola-workflow-next/SKILL.md`;
  const f = fs.readFileSync(path.join(REPO, finalize), 'utf8');
  const n = fs.readFileSync(path.join(REPO, next), 'utf8');
  assert(f.includes('issue_numbers') && f.includes('--issue-numbers'),
    `T4[${ed.name}]: finalize SKILL wires the #369 bundle member-set flag (--issue-numbers)`);
  assert(n.includes('workflow-plan.md exists -> kaola-workflow-plan-run') && n.includes('auto-bundle'),
    `T4[${ed.name}]: next SKILL carries the adaptive route + #380 auto-bundle restructure`);
}

// ---------------------------------------------------------------------------
// T5: <!-- PIN: frontier unit --> comment + the `frontier unit` literal must appear in each of the
// 6 plan-run surfaces (3 Claude commands + 3 Codex SKILLs). Added by the n9-prose-skeleton node.
// NOTE: if n9 has not run yet, these surfaces will not yet carry the pin — they are recorded as
// informational warnings (non-blocking) so the suite stays green while n9 is pending. The code-
// reviewer (n11) MUST verify all 6 surfaces are blocking after n9 completes.
// ---------------------------------------------------------------------------
{
  const planRunSurfaces = [
    'commands/kaola-workflow-plan-run.md',
    'plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md',
    'plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md',
    'plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md',
    'plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md',
    'plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md'
  ];
  // Check whether the pin has been written by n9. If ANY surface has it, we assert all 6 have it
  // (blocking). If NONE do, n9 is still pending and we emit a non-blocking warning.
  const anyHasPin = planRunSurfaces.some(f => {
    const fullPath = path.join(REPO, f);
    return fs.existsSync(fullPath) && fs.readFileSync(fullPath, 'utf8').includes('<!-- PIN: frontier unit -->');
  });
  if (anyHasPin) {
    // n9 has run (at least partially) — assert all 6 surfaces carry the pin and the literal.
    for (const f of planRunSurfaces) {
      const content = fs.existsSync(path.join(REPO, f)) ? fs.readFileSync(path.join(REPO, f), 'utf8') : '';
      assert(content.includes('<!-- PIN: frontier unit -->'),
        `T5: ${f} must contain <!-- PIN: frontier unit --> comment (n9-prose-skeleton)`);
      assert(content.includes('frontier unit'),
        `T5: ${f} must contain "frontier unit" literal following the PIN comment (n9-prose-skeleton)`);
    }
  } else {
    // #505 ITEM 2: harden the T5 else-branch to a HARD ASSERT so removing the pin from ALL six
    // surfaces no longer passes silently. The pin is present on all 6 surfaces (n9-prose-skeleton
    // has run); anyHasPin is true and this branch is unreachable under correct state. Flipping the
    // warn to an assert means the self-disarm (dropping the pin from every surface) now REDs.
    assert(anyHasPin,
      'T5: <!-- PIN: frontier unit --> not found in any plan-run surface — pin must be present on all 6 surfaces (n9-prose-skeleton)');
  }
}

// ---------------------------------------------------------------------------
// T5b: Codex tiered-effort dispatch prose must stay effective across the same 6
// plan-run surfaces. A tiered node needs a real per-spawn effort override; v2 uses
// fork_turns:"none", and unproven v1 refuses instead of silently inheriting.
// ---------------------------------------------------------------------------
{
  const planRunSurfaces = [
    'commands/kaola-workflow-plan-run.md',
    'plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md',
    'plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md',
    'plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md',
    'plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md',
    'plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md'
  ];
  for (const f of planRunSurfaces) {
    const content = fs.readFileSync(path.join(REPO, f), 'utf8');
    assert(content.includes('fork_turns: "none"'),
      `T5b: ${f} must require fork_turns:"none" for tiered Codex v2 dispatch`);
    assert(content.includes('reasoning_effort: dispatch.codex_reasoning_effort'),
      `T5b: ${f} must pass the descriptor effort directly`);
    assert(content.includes('fresh child-session effort proof'),
      `T5b: ${f} must require fresh child-session effort proof for tiered Codex dispatch`);
    assert(content.includes('codex_effort_override_unavailable'),
      `T5b: ${f} must fail closed when v1 cannot prove effort override`);
    assert(!content.includes('`sonnet`/absent') && !content.includes('sonnet`/absent') && !content.includes('sonnet/absent'),
      `T5b: ${f} must not describe sonnet as an inherited role_default tier`);
  }

  // #610: the plan model-column vocabulary is now the neutral `{reasoning,standard}` tokens with
  // legacy `opus`/`sonnet` aliases accepted — the pin is now neutral-token-and-alias-aware: the
  // primary mapping must use the neutral tokens, AND the legacy alias mapping must still be
  // documented explicitly (a frozen pre-#610 plan's `sonnet` cell dispatches identically).
  const codexSkillSurfaces = planRunSurfaces.filter(f => f.includes('/skills/'));
  for (const f of codexSkillSurfaces) {
    const content = fs.readFileSync(path.join(REPO, f), 'utf8');
    assert(content.includes('`model: standard` -> `high`'),
      `T5b: ${f} must explicitly document the neutral standard -> high mapping`);
    assert(content.includes('legacy `model: opus` -> `xhigh` / `model: sonnet` -> `high` aliases resolve identically'),
      `T5b: ${f} must explicitly document the legacy opus/sonnet alias mapping resolving identically`);
  }
}

// ---------------------------------------------------------------------------
// T6: closure-audit pin — all 6 finalize-route surfaces (3 Claude commands + 3 Codex SKILLs)
// must carry the <!-- PIN: closure-audit --> comment and the 'closure-audit' literal (#496/#497).
// This is the machine-enforced contract that n2-wire-closure-audit wired the sink-result handling
// and closure-audit reconciliation sweep into every finalize surface. Fail-closed: unconditional
// assert() on every surface — do NOT use a non-blocking warn gate (unlike T5's self-disarmed
// anyHasPin pattern, which is a known bug we do not replicate here).
// ---------------------------------------------------------------------------
{
  const finalizeSurfaces = [
    'commands/kaola-workflow-finalize.md',
    'plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md',
    'plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md',
    'plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md',
    'plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md',
    'plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md',
  ];
  for (const f of finalizeSurfaces) {
    const content = fs.readFileSync(path.join(REPO, f), 'utf8');
    assert(content.includes('<!-- PIN: closure-audit -->'),
      `T6: ${f} must contain <!-- PIN: closure-audit --> comment (n2-wire-closure-audit)`);
    assert(content.includes('closure-audit'),
      `T6: ${f} must contain "closure-audit" literal (n2-wire-closure-audit)`);
  }
}

// ---------------------------------------------------------------------------
// T7: <!-- PIN: claim-escalate --> comment + the `result: escalate` literal must appear in each of
// the 12 claim/startup-refusal surfaces: adapt×6 + workflow-next×6.
// Added by n3-result-routing-prose (#495); unconditional (n3 writes the prose AND this assertion together).
// ---------------------------------------------------------------------------
{
  const claimEscalateSurfaces = [
    // adapt — 6 surfaces
    'commands/kaola-workflow-adapt.md',
    'plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md',
    'plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md',
    'plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md',
    'plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md',
    'plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md',
    // workflow-next — 6 surfaces
    'commands/workflow-next.md',
    'plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md',
    'plugins/kaola-workflow-gitlab/commands/workflow-next.md',
    'plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md',
    'plugins/kaola-workflow-gitea/commands/workflow-next.md',
    'plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md',
  ];
  for (const f of claimEscalateSurfaces) {
    const content = fs.existsSync(path.join(REPO, f)) ? fs.readFileSync(path.join(REPO, f), 'utf8') : '';
    assert(content.includes('<!-- PIN: claim-escalate -->'),
      `T7: ${f} must contain <!-- PIN: claim-escalate --> comment (n3-result-routing-prose, #495)`);
    assert(content.includes('result: escalate'),
      `T7: ${f} must contain "result: escalate" literal following the PIN comment (n3-result-routing-prose, #495)`);
  }
}

// ---------------------------------------------------------------------------
// T8: <!-- PIN: leg-isolation-recipe --> comment + the `--write-overlap-consent` literal must
// appear in each of the 6 plan-run surfaces (3 Claude commands + 3 Codex SKILLs). Added by
// n3-prose-wire (#500 L2); fail-closed: unconditional assert() per surface — do NOT use the
// self-disarming anyHasPin gate (T5 known-bug pattern we explicitly do not replicate here).
// ---------------------------------------------------------------------------
{
  const planRunSurfaces = [
    'commands/kaola-workflow-plan-run.md',
    'plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md',
    'plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md',
    'plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md',
    'plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md',
    'plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md',
  ];
  for (const f of planRunSurfaces) {
    const content = fs.readFileSync(path.join(REPO, f), 'utf8');
    assert(content.includes('<!-- PIN: leg-isolation-recipe -->'),
      `T8: ${f} must contain <!-- PIN: leg-isolation-recipe --> comment (n3-prose-wire, #500 L2)`);
    assert(content.includes('--write-overlap-consent'),
      `T8: ${f} must contain "--write-overlap-consent" literal (n3-prose-wire, #500 L2)`);
  }
}

// ---------------------------------------------------------------------------
// T9: <!-- CARD: speculative-open --> comment + the `--speculative-consent` literal must appear
// in each of the 6 plan-run surfaces (3 Claude commands + 3 Codex SKILLs). Added by
// n3-prose-wire (#500 L3); fail-closed: unconditional assert() per surface.
// ---------------------------------------------------------------------------
{
  const planRunSurfaces = [
    'commands/kaola-workflow-plan-run.md',
    'plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md',
    'plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md',
    'plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md',
    'plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md',
    'plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md',
  ];
  for (const f of planRunSurfaces) {
    const content = fs.readFileSync(path.join(REPO, f), 'utf8');
    assert(content.includes('<!-- CARD: speculative-open -->'),
      `T9: ${f} must contain <!-- CARD: speculative-open --> comment (n3-prose-wire, #500 L3)`);
    assert(content.includes('--speculative-consent'),
      `T9: ${f} must contain "--speculative-consent" literal (n3-prose-wire, #500 L3)`);
  }
}

// ---------------------------------------------------------------------------
// T10: <!-- PIN: fast-compliance-backstop --> must appear in all 12 fast+finalize surfaces
// (6 fast + 6 finalize: 3 Claude commands + 3 Codex SKILLs each). Added by n3 (#504).
// Fail-closed: unconditional assert() — do NOT use a non-blocking warn gate.
// ---------------------------------------------------------------------------
{
  const fastComplianceBackstopSurfaces = [
    // fast — 6 surfaces (3 Claude commands + 3 Codex SKILLs; no plugins/kaola-workflow/commands/fast)
    'commands/kaola-workflow-fast.md',
    'plugins/kaola-workflow-gitlab/commands/kaola-workflow-fast.md',
    'plugins/kaola-workflow-gitea/commands/kaola-workflow-fast.md',
    'plugins/kaola-workflow/skills/kaola-workflow-fast/SKILL.md',
    'plugins/kaola-workflow-gitlab/skills/kaola-workflow-fast/SKILL.md',
    'plugins/kaola-workflow-gitea/skills/kaola-workflow-fast/SKILL.md',
    // finalize — 6 surfaces (3 Claude commands + 3 Codex SKILLs)
    'commands/kaola-workflow-finalize.md',
    'plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md',
    'plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md',
    'plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md',
    'plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md',
    'plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md',
  ];
  for (const f of fastComplianceBackstopSurfaces) {
    const content = fs.readFileSync(path.join(REPO, f), 'utf8');
    assert(content.includes('<!-- PIN: fast-compliance-backstop -->'),
      `T10: ${f} must contain <!-- PIN: fast-compliance-backstop --> comment (n3-fast-compliance-backstop, #504)`);
    assert(content.includes('fast_compliance_unresolved'),
      `T10: ${f} must contain "fast_compliance_unresolved" literal (n3-fast-compliance-backstop, #504)`);
  }
}

// ---------------------------------------------------------------------------
// T11: <!-- PIN: adaptive-default-contract --> must appear in all 12 fast+full-entry surfaces
// (6 fast + 6 full-entry: fast = 3 Claude commands + 3 Codex SKILLs;
// full-entry = phase1 commands + research SKILLs, 3 each). Added by n3 (#515).
// #538: the named-but-not-installed-path refusal literal renamed `path_requires_explicit_opt_in` ->
// `path_not_installed` (adaptive is the unconditional default; reaching fast/full requires an
// install opt-in, refused at the claim front door with `path_not_installed`). All 12 surfaces must
// carry the new literal.
// Fail-closed: unconditional assert() — do NOT use a non-blocking warn gate.
// ---------------------------------------------------------------------------
{
  const adaptiveDefaultContractSurfaces = [
    // fast — 6 surfaces (3 Claude commands + 3 Codex SKILLs)
    'commands/kaola-workflow-fast.md',
    'plugins/kaola-workflow-gitlab/commands/kaola-workflow-fast.md',
    'plugins/kaola-workflow-gitea/commands/kaola-workflow-fast.md',
    'plugins/kaola-workflow/skills/kaola-workflow-fast/SKILL.md',
    'plugins/kaola-workflow-gitlab/skills/kaola-workflow-fast/SKILL.md',
    'plugins/kaola-workflow-gitea/skills/kaola-workflow-fast/SKILL.md',
    // full-entry — 6 surfaces (3 Claude commands + 3 Codex SKILLs)
    'commands/kaola-workflow-phase1.md',
    'plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase1.md',
    'plugins/kaola-workflow-gitea/commands/kaola-workflow-phase1.md',
    'plugins/kaola-workflow/skills/kaola-workflow-research/SKILL.md',
    'plugins/kaola-workflow-gitlab/skills/kaola-workflow-research/SKILL.md',
    'plugins/kaola-workflow-gitea/skills/kaola-workflow-research/SKILL.md',
  ];
  for (const f of adaptiveDefaultContractSurfaces) {
    const content = fs.readFileSync(path.join(REPO, f), 'utf8');
    assert(content.includes('<!-- PIN: adaptive-default-contract -->'),
      `T11: ${f} must contain <!-- PIN: adaptive-default-contract --> comment (n3-adaptive-default-contract, #515)`);
    assert(content.includes('path_not_installed'),
      `T11: ${f} must contain "path_not_installed" literal (n3-adaptive-default-contract, #515/#538)`);
  }
}

// ---------------------------------------------------------------------------
// T12: #602/#604/#605 dispatch-card visibility contract must appear in each of the 6 plan-run
// surfaces (3 Claude commands + 3 Codex SKILLs): the pre-dispatch card-acquisition rule + the
// no-improvise prohibition (#602), the three announcement formats + inline fallback (#604), and
// the required close-echo progress line (#605). Fail-closed: unconditional assert() per surface.
// ---------------------------------------------------------------------------
{
  const planRunSurfaces = [
    'commands/kaola-workflow-plan-run.md',
    'plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md',
    'plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md',
    'plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md',
    'plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md',
    'plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md',
  ];
  for (const f of planRunSurfaces) {
    const content = norm(fs.readFileSync(path.join(REPO, f), 'utf8'));
    assert(content.includes(norm("take the dispatch card from the summary line's `opened=` segment or from `.cache/<op>-envelope.json`. Never dispatch without the card in view.")),
      `T12: ${f} must document the pre-dispatch card-acquisition rule (#602)`);
    assert(content.includes('Every spawn parameter comes from the dispatch card.'),
      `T12: ${f} must document the no-improvise prohibition (#602)`);
    assert(content.includes('plan-run orchestrator: driving {project} — {N} nodes; each role subagent will be announced at dispatch.'),
      `T12: ${f} must carry the run-start announcement format (#604)`);
    assert(content.includes('→ dispatching {node_id} · {role} as subagent task "{task_name}" (model {model|default}, effort {effort|inherit})'),
      `T12: ${f} must carry the pre-spawn announcement format (#604)`);
    assert(content.includes('← {node_id} · {role} returned: {verdict or one-line outcome}'),
      `T12: ${f} must carry the on-return announcement format (#604)`);
    assert(content.includes('→ running {node_id} · {role} inline (…reason token…)'),
      `T12: ${f} must carry the inline-fallback announcement format (#604)`);
    assert(content.includes('{node-id} → complete; opened: {next-id|—}'),
      `T12: ${f} must carry the required close-echo progress line (#605)`);
  }
}

// ---------------------------------------------------------------------------
// T13: #603 Codex Dispatch Mode Detection must appear in the 6 Codex startup SKILL surfaces
// (kaola-workflow-next + kaola-workflow-adapt, 3 editions each) — Codex-only, no Claude command
// counterpart (Claude dispatch has no task-name/dispatch-mode distinction). Fail-closed.
// ---------------------------------------------------------------------------
{
  const codexDispatchModeSurfaces = [
    'plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md',
    'plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md',
    'plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md',
    'plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md',
    'plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md',
    'plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md',
  ];
  for (const f of codexDispatchModeSurfaces) {
    const content = fs.readFileSync(path.join(REPO, f), 'utf8');
    assert(content.includes('--codex-dispatch-mode'),
      `T13: ${f} must thread the detected dispatch mode into the claim via --codex-dispatch-mode (#603)`);
  }
}

// ---------------------------------------------------------------------------
// T14: teammate-mode dispatch subsection must appear in each of the 6 plan-run surfaces (3
// Claude commands + 3 Codex SKILLs): the NAMED-teammate sentinel sentence and the one-nudge
// idle-race rule. Fail-closed: unconditional assert() per surface.
// ---------------------------------------------------------------------------
{
  const planRunSurfaces = [
    'commands/kaola-workflow-plan-run.md',
    'plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md',
    'plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md',
    'plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md',
    'plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md',
    'plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md',
  ];
  for (const f of planRunSurfaces) {
    const content = norm(fs.readFileSync(path.join(REPO, f), 'utf8'));
    assert(content.includes(norm("spawn each node's role agent as a NAMED teammate")),
      `T14: ${f} must carry the teammate-mode dispatch sentinel sentence`);
    assert(content.includes(norm('send EXACTLY ONE request for the deliverable, then wait')),
      `T14: ${f} must carry the one-nudge idle-race rule`);
  }
}

// ---------------------------------------------------------------------------
// T15: gate-instrumentation-provisioning block must appear in each of the 6 plan-run surfaces (3
// Claude commands + 3 Codex SKILLs): a main-session-gate node body never instructs authoring
// files, and the runtime gate-window fence (KAOLA_GATE_WINDOW_FENCE) backs it. Fail-closed:
// unconditional assert() per surface.
// ---------------------------------------------------------------------------
{
  const planRunSurfaces = [
    'commands/kaola-workflow-plan-run.md',
    'plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md',
    'plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md',
    'plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md',
    'plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md',
    'plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md',
  ];
  for (const f of planRunSurfaces) {
    const content = fs.readFileSync(path.join(REPO, f), 'utf8');
    assert(content.includes('<!-- PIN: gate-instrumentation-provisioning -->'),
      `T15: ${f} must contain <!-- PIN: gate-instrumentation-provisioning --> comment (n3-planner-prose)`);
    assert(content.includes('KAOLA_GATE_WINDOW_FENCE=0'),
      `T15: ${f} must contain "KAOLA_GATE_WINDOW_FENCE=0" literal (n3-planner-prose)`);
  }
}

if (failed) {
  console.error(`\nRoute-reachability test FAILED: ${failed} failure(s), ${passed} passed.`);
  process.exit(1);
}
console.log(`Route-reachability test passed (${passed} assertions).`);
