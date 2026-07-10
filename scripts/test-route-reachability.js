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
// T5b: Codex tiered-model-and-effort dispatch prose must stay effective across the 3
// Codex SKILL plan-run surfaces (Codex-runtime-only; the Claude commands never
// carry this dispatch mode). Current Codex role profiles own the pair: pinned
// carry-out roles run standalone Sol/medium profiles and every other role runs standalone Sol/xhigh.
// Both v2 and v1 omit transient overrides and require child-session proof.
// ---------------------------------------------------------------------------
{
  const planRunSurfaces = [
    'plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md',
    'plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md',
    'plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md'
  ];
  for (const f of planRunSurfaces) {
    const content = fs.readFileSync(path.join(REPO, f), 'utf8');
    assert(content.includes('fork_turns: "none"'),
      `T5b: ${f} must require fork_turns:"none" for tiered Codex v2 dispatch`);
    assert(content.includes('Omit both `model`') && content.includes('and `reasoning_effort`'),
      `T5b: ${f} must omit transient model/effort overrides`);
    assert(!content.includes('model: dispatch.codex_model')
      && !content.includes('reasoning_effort: dispatch.codex_reasoning_effort'),
      `T5b: ${f} must not pass the descriptor pair as transient overrides`);
    assert(content.includes('codex_tier_unresolved'),
      `T5b: ${f} must refuse rather than spawn an untiered Codex role`);
    assert(content.includes('fresh child-session') && content.includes('model-and-effort proof'),
      `T5b: ${f} must require fresh child-session model-and-effort proof`);
    assert(content.includes('codex_profile_tier_mismatch'),
      `T5b: ${f} must fail closed on a plan/profile tier conflict`);
    assert(content.includes('codex_profile_runtime_mismatch'),
      `T5b: ${f} must fail closed when child JSONL disproves the profile pair`);
    assert(!content.includes('`sonnet`/absent') && !content.includes('sonnet`/absent') && !content.includes('sonnet/absent'),
      `T5b: ${f} must not describe sonnet as an inherited role_default tier`);
  }

  // Current-runtime adapter: pin both static pair classes and the role-owned dispatch mode.
  const codexSkillSurfaces = planRunSurfaces.filter(f => f.includes('/skills/'));
  for (const f of codexSkillSurfaces) {
    const content = fs.readFileSync(path.join(REPO, f), 'utf8');
    assert(content.includes('profile pins for `gpt-5.6-sol` at `medium`'),
      `T5b: ${f} must document the pinned standard pair`);
    assert(content.includes('profiles pin `gpt-5.6-sol` at `xhigh`'),
      `T5b: ${f} must document the pinned reasoning pair`);
    assert(content.includes('dispatch.codex_profile_mode'),
      `T5b: ${f} must route by the descriptor profile mode`);
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
    assert(content.includes('→ dispatching {node_id} · {role} as subagent task "{task_name}" (model {model}, effort {effort})'),
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
// T14: teammate-mode dispatch subsection must appear in each of the 3 Claude command
// plan-run surfaces (Claude-runtime-only; the Codex SKILLs never carry this dispatch
// mode): the NAMED-teammate sentinel sentence and the one-nudge idle-race rule.
// Fail-closed: unconditional assert() per surface.
// ---------------------------------------------------------------------------
{
  const planRunSurfaces = [
    'commands/kaola-workflow-plan-run.md',
    'plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md',
    'plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md',
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

// ---------------------------------------------------------------------------
// T16: node-briefs channel relay pin — all 6 plan-run surfaces (3 Claude commands + 3 Codex
// SKILLs) must carry the <!-- PIN: node-briefs-relay --> anchor, the goal_line relay literal, the
// upstream_read consumed-proof instruction, the resume re-hydration line, and the manifest-derived
// role-kind enumeration sentence; AND must NOT carry the stale exclusive-contract enumerations
// (the old hardcoded READ-ONLY / WRITE role-list framing). Fail-closed: unconditional assert()
// per surface (positive + negative), whitespace-normalized for reflow tolerance.
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
  const present = [
    '<!-- PIN: node-briefs-relay -->',
    'carry it VERBATIM into the role dispatch',
    'record a column-0 `upstream_read: <node-id> <nonce>` line',
    're-derived from the cached `.cache/<op>-envelope.json`',
    "derived from each role's tool manifest",
  ];
  // The stale exclusive-contract enumerations that the manifest-derived sentence replaced. Their
  // bold-header framing is the signature; reintroducing either list on any surface reds here.
  const stale = [
    '**READ-ONLY roles**',
    '**WRITE-role agents**',
  ];
  for (const f of planRunSurfaces) {
    const content = norm(fs.readFileSync(path.join(REPO, f), 'utf8'));
    for (const tok of present) {
      assert(content.includes(norm(tok)),
        `T16: ${f} must carry the node-briefs-relay literal ${JSON.stringify(tok)}`);
    }
    for (const tok of stale) {
      assert(!content.includes(norm(tok)),
        `T16: ${f} must NOT carry the stale exclusive-contract enumeration ${JSON.stringify(tok)} (replaced by the manifest-derived role-kind sentence)`);
    }
  }
}

// ===========================================================================
// #630 Layer-1 — required-block MANIFEST presence checker (derived-universe),
// bidirectional orphan-sentinel, the superset proof, and the by-construction
// RED-PROOF battery. ADDITIVE-SUPERSET: T1..T15 above stay byte-for-byte; the
// existing pins remain as residual-additive assertions. The manifest is the
// single source of the required-block presence contract; the surface UNIVERSE
// each block obligates is COMPUTED from topic + tags (never hand-typed), so
// obligating 4-of-6 surfaces by omission is structurally impossible.
// ===========================================================================
const { REQUIRED_BLOCKS } = require('../templates/routing/required-blocks.js');

// Edition dirs reuse the existing edition tables (a rename / 7th edition flows
// through automatically). command surfaces live on the claude editions, skill
// surfaces on the codex editions.
const MANIFEST_EDITIONS = {
  command: claudeEditions.map(e => e.commandsDir),
  skill: codexEditions.map(e => e.skillsDir),
};

// Topic basenames. plan-run is READ FROM THE SCHEMA REGISTRY (the same
// PLAN_RUN_COMMAND/PLAN_RUN_SKILL that drives the T1/T2 emitted-target set) —
// the no-drift anchor: a rename to the routed skill/command follows here for
// free. finalize is symmetric; next is ASYMMETRIC (command basename
// workflow-next vs skill basename kaola-workflow-next).
const TOPIC_BASENAME = {
  'plan-run': { command: stripSlash(schema.PLAN_RUN_COMMAND), skill: schema.PLAN_RUN_SKILL },
  finalize: { command: 'kaola-workflow-finalize', skill: 'kaola-workflow-finalize' },
  next: { command: 'workflow-next', skill: 'kaola-workflow-next' },
};

// Markers physically present on the in-scope surfaces that are managed by
// contracts OUTSIDE the #630 required-block manifest (structural section cards,
// not presence obligations, and unpinned by any validator). The reverse
// orphan-sentinel skips these so it reds ONLY on a rogue or self-disarmed
// marker (a manifest block deleted while its marker survives on the surface),
// never on a legitimately-foreign one.
const FOREIGN_MARKERS = new Set([
  '<!-- CARD: frontier-batch -->',
  '<!-- CARD: governance -->',
  '<!-- CARD: reopen-complete-node -->',
  '<!-- CARD: repair-routing -->',
  '<!-- CARD: resume -->',
].map(norm));

// Legacy in-scope pin tokens the derived-universe manifest cannot fold cleanly
// (present on a strict SUBSET of a block's obligated set): a forge-renamed noun,
// and a github-command+skill-only finalize refusal (the gitlab/gitea finalize
// COMMANDS are the 2:1 rewrite and lack it). These STAY as the existing
// additive T-pins; the superset proof allow-lists them (superset-with-residual).
const RESIDUAL_ALLOWLIST = new Set([
  'watch-pr',
  'final_validation_unverified',
].map(norm));

const isMarker = t => /^<!--\s*(?:PIN|CARD):/.test(String(t).trim());

// deriveObligated — COMPUTE the exact obligated file set for a block from its
// topic + tags. Returns { error, files }. A tag that is unknown, or a
// runtime/surface-type inconsistency (claude-live carrying skill, or codex-live
// carrying command), yields an orphan-manifest error (empty file set).
function deriveObligated(block, editions, topicBasename) {
  const rt = block.runtime_tag, st = block.surface_type_tag;
  const okRt = rt === 'claude-live' || rt === 'codex-live' || rt === 'both';
  const okSt = st === 'command' || st === 'skill' || st === 'both';
  if (!okRt || !okSt || !topicBasename[block.topic]) return { error: 'bad-tag', files: [] };
  if (rt === 'claude-live' && st === 'skill') return { error: 'orphan-manifest', files: [] };
  if (rt === 'codex-live' && st === 'command') return { error: 'orphan-manifest', files: [] };
  let types;
  if (rt === 'claude-live') types = ['command'];
  else if (rt === 'codex-live') types = ['skill'];
  else types = st === 'both' ? ['command', 'skill'] : [st];
  const files = [];
  for (const stype of types) {
    const base = topicBasename[block.topic][stype];
    for (const dir of (editions[stype] || [])) {
      files.push(stype === 'command' ? `${dir}/${base}.md` : `${dir}/${base}/SKILL.md`);
    }
  }
  return { error: null, files };
}

// checkManifest — PURE (no fs / no exit). readSurface(rel) -> string|null is
// injected (real: fs+exists; fixtures: an in-memory map). Returns
// { failures:[], obligatedCount }.
function checkManifest({ blocks, readSurface, editions, topicBasename, foreignMarkers }) {
  const failures = [];
  const foreign = foreignMarkers instanceof Set
    ? foreignMarkers
    : new Set((foreignMarkers || []).map(norm));
  let obligatedCount = 0;
  const markerToBlock = new Map();

  // FORWARD — every content token present on every surface the block obligates.
  for (const b of blocks) {
    const { error, files } = deriveObligated(b, editions, topicBasename);
    if (error || files.length === 0) {
      failures.push(`orphan-manifest: block ${b.block_id} (${error || 'empty derived set'})`);
      continue;
    }
    obligatedCount += files.length;
    const first = b.content_tokens[0];
    if (isMarker(first)) markerToBlock.set(norm(first), b);
    for (const f of files) {
      const content = readSurface(f);
      if (content === null) {
        failures.push(`absent-surface: block ${b.block_id} obligates ${f} (not found)`);
        continue;
      }
      const nc = norm(content);
      for (const tok of b.content_tokens) {
        if (!nc.includes(norm(tok))) {
          failures.push(`missing-token: block ${b.block_id} token ${JSON.stringify(tok)} absent from ${f}`);
        }
      }
    }
  }

  // REVERSE orphan-sentinel — scan every in-scope surface for PIN/CARD markers;
  // each MUST map to a manifest block whose first token is that marker AND whose
  // obligated set includes this surface, else orphan-surface red (unless the
  // marker is a declared foreign marker managed outside this manifest).
  const inScope = [];
  for (const topic of Object.keys(topicBasename)) {
    for (const stype of ['command', 'skill']) {
      const base = topicBasename[topic][stype];
      for (const dir of (editions[stype] || [])) {
        inScope.push(stype === 'command' ? `${dir}/${base}.md` : `${dir}/${base}/SKILL.md`);
      }
    }
  }
  for (const f of inScope) {
    const content = readSurface(f);
    if (content === null) continue;
    const markers = content.match(/<!--\s*(?:PIN|CARD):[^>]*-->/g) || [];
    for (const raw of markers) {
      const m = norm(raw);
      if (foreign.has(m)) continue;
      const b = markerToBlock.get(m);
      if (!b) {
        failures.push(`orphan-surface: marker ${JSON.stringify(raw.trim())} on ${f} has no manifest block`);
        continue;
      }
      const { files } = deriveObligated(b, editions, topicBasename);
      if (!files.includes(f)) {
        failures.push(`orphan-surface: marker ${JSON.stringify(raw.trim())} on ${f} not obligated by block ${b.block_id}`);
      }
    }
  }

  return { failures, obligatedCount };
}

// foldsGeneric — the superset-proof primitive: does a legacy (token,surfaces)
// pin fold into a manifest block whose derived obligated set ⊇ the legacy
// surfaces, or is it an accepted residual? Parameterized so both the real proof
// and the red-proof fixture drive the identical logic.
function foldsGeneric(token, legacySurfaces, blocks, allowlist, editions, topicBasename) {
  if (allowlist.has(norm(token))) return true;
  return blocks.some(b =>
    b.content_tokens.some(t => norm(t) === norm(token)) &&
    legacySurfaces.every(s => deriveObligated(b, editions, topicBasename).files.includes(s)));
}

// --- REAL-RUN invocation: manifest presence over the live surface tree -------
{
  const realResult = checkManifest({
    blocks: REQUIRED_BLOCKS,
    readSurface: rel => (exists(rel) ? fs.readFileSync(path.join(REPO, rel), 'utf8') : null),
    editions: MANIFEST_EDITIONS,
    topicBasename: TOPIC_BASENAME,
    foreignMarkers: FOREIGN_MARKERS,
  });
  for (const msg of realResult.failures) assert(false, `MANIFEST ${msg}`);
  assert(realResult.failures.length === 0,
    `MANIFEST: derived-universe presence check clean over ${realResult.obligatedCount} obligated file-checks`);
}

// --- #634: pr-metric-optimizer-card block sanity — the new block exists, obligates all 6
//     plan-run surfaces (both/both), and its distinctive tokens are not vacuous substrings of
//     its own marker (the #637 lesson applied PROACTIVELY, before any bug is ever observed). The
//     card file it points at must also exist. ------------------------------------------------
{
  const block = REQUIRED_BLOCKS.find(b => b.block_id === 'pr-metric-optimizer-card');
  assert(!!block, '#634: pr-metric-optimizer-card block must exist in the manifest');
  if (block) {
    const { error, files } = deriveObligated(block, MANIFEST_EDITIONS, TOPIC_BASENAME);
    assert(!error && files.length === 6,
      '#634: pr-metric-optimizer-card must obligate all 6 plan-run surfaces (both/both)');
    const marker = norm(block.content_tokens[0]);
    assert(block.content_tokens.slice(1).every(t => !marker.includes(norm(t))),
      '#634: pr-metric-optimizer-card distinctive tokens must not be substrings of its own marker');
  }
  assert(exists('docs/plan-run-cards/metric-optimizer.md'),
    '#634: docs/plan-run-cards/metric-optimizer.md card must exist');
}

// --- #645: nx-first-principles axiom-pointer block sanity — the shared-body reference line exists,
//     obligates all 6 next surfaces (both/both), and its distinctive tokens are not vacuous
//     substrings of its own marker (the #637 lesson applied to the new axiom block — a correctness
//     class the manifest presence-check alone does NOT cover). The canonical axioms file the pointer
//     names must also exist. --------------------------------------------------------------------
{
  const block = REQUIRED_BLOCKS.find(b => b.block_id === 'nx-first-principles');
  assert(!!block, '#645: nx-first-principles block must exist in the manifest');
  if (block) {
    const { error, files } = deriveObligated(block, MANIFEST_EDITIONS, TOPIC_BASENAME);
    assert(!error && files.length === 6,
      '#645: nx-first-principles must obligate all 6 next surfaces (both/both)');
    const marker = norm(block.content_tokens[0]);
    assert(block.content_tokens.slice(1).every(t => !marker.includes(norm(t))),
      '#645: nx-first-principles distinctive tokens must not be substrings of its own marker');
  }
  assert(exists('templates/axioms.md'),
    '#645: templates/axioms.md canonical First Principles source must exist');
}

// --- SUPERSET PROOF: every legacy in-scope T-pin token folds into a manifest
//     block (⊇ the legacy surface set) or is an accepted residual. Covers the
//     #624-fix gate flags + workflow_path:adaptive explicitly. --------------
{
  const dirs = MANIFEST_EDITIONS;
  const prCmd = dirs.command.map(d => `${d}/kaola-workflow-plan-run.md`);
  const prSkill = dirs.skill.map(d => `${d}/kaola-workflow-plan-run/SKILL.md`);
  const fnCmd = dirs.command.map(d => `${d}/kaola-workflow-finalize.md`);
  const fnSkill = dirs.skill.map(d => `${d}/kaola-workflow-finalize/SKILL.md`);
  const nxCmd = dirs.command.map(d => `${d}/workflow-next.md`);
  const nxSkill = dirs.skill.map(d => `${d}/kaola-workflow-next/SKILL.md`);
  const PR6 = [...prCmd, ...prSkill], FN6 = [...fnCmd, ...fnSkill], NX6 = [...nxCmd, ...nxSkill];

  const LEGACY_PAIRS = [
    // T5 / T8 / T9 / T15 / T12 — plan-run × 6 (both/both)
    { token: 'frontier unit', surfaces: PR6 },
    { token: '--write-overlap-consent', surfaces: PR6 },
    { token: '--speculative-consent', surfaces: PR6 },
    { token: 'KAOLA_GATE_WINDOW_FENCE=0', surfaces: PR6 },
    { token: 'Every spawn parameter comes from the dispatch card.', surfaces: PR6 },
    { token: '{node-id} → complete; opened: {next-id|—}', surfaces: PR6 },
    // T5b — plan-run skills × 3 (codex-live)
    { token: 'fork_turns: "none"', surfaces: prSkill },
    { token: 'dispatch.codex_profile_mode', surfaces: prSkill },
    { token: 'codex_tier_unresolved', surfaces: prSkill },
    { token: 'codex_profile_tier_mismatch', surfaces: prSkill },
    { token: 'codex_profile_runtime_mismatch', surfaces: prSkill },
    { token: 'profile pins for `gpt-5.6-sol` at `medium`', surfaces: prSkill },
    { token: 'profiles pin `gpt-5.6-sol` at `xhigh`', surfaces: prSkill },
    { token: 'Codex 0.144 durable-result override', surfaces: prSkill },
    { token: 'transport_error: encrypted_return', surfaces: prSkill },
    // T14 — plan-run commands × 3 (claude-live)
    { token: "spawn each node's role agent as a NAMED teammate", surfaces: prCmd },
    { token: 'send EXACTLY ONE request for the deliverable, then wait', surfaces: prCmd },
    // T6 / #624 gate flags / bundle / final-validation — finalize
    { token: 'closure-audit', surfaces: FN6 },
    { token: '--resume-check', surfaces: FN6 },
    { token: '--gate-verify', surfaces: FN6 },
    { token: '--barrier-check', surfaces: FN6 },
    { token: '--verdict-check', surfaces: FN6 },
    { token: 'workflow_path: adaptive', surfaces: FN6 },
    { token: '--issue-numbers', surfaces: FN6 },
    { token: 'issue_numbers', surfaces: FN6 },
    { token: 'fast_compliance_unresolved', surfaces: FN6 },
    { token: 'final-validation.md', surfaces: FN6 },
    // github command+skill-only finalize refusal — residual
    { token: 'final_validation_unverified', surfaces: [fnCmd[0], fnSkill[0]] },
    // T7-half / T4-half — next × 6 (both/both)
    { token: 'result: escalate', surfaces: NX6 },
    { token: 'kaola-workflow-plan-run', surfaces: NX6 },
    { token: 'auto-bundle', surfaces: NX6 },
    // T13-half — next skills × 3 (codex-live)
    { token: '--codex-dispatch-mode', surfaces: nxSkill },
    // router prose — next commands × 3 (claude-live)
    { token: 'thin router', surfaces: nxCmd },
    { token: 'active folders', surfaces: nxCmd },
    { token: '--target-issue', surfaces: nxCmd },
    { token: 'issue-scout', surfaces: nxCmd },
    { token: 'Skip this entire step when `KAOLA_PATH=adaptive`', surfaces: nxCmd },
    { token: 'path_not_installed', surfaces: nxCmd },
    // forge-renamed noun (gitlab: watch-mr) — residual
    { token: 'watch-pr', surfaces: nxCmd },
  ];

  for (const p of LEGACY_PAIRS) {
    const ok = foldsGeneric(p.token, p.surfaces, REQUIRED_BLOCKS, RESIDUAL_ALLOWLIST, MANIFEST_EDITIONS, TOPIC_BASENAME);
    assert(ok,
      `SUPERSET-PROOF: legacy token ${JSON.stringify(p.token)} must fold into a manifest block (⊇ its ${p.surfaces.length} legacy surface(s)) or be an accepted residual`);
  }
}

// --- RED-PROOF battery: by-construction self-tests over in-memory fixtures (NO
//     real-tree mutation). Each plants a defect and asserts the checker reds. -
{
  // 1-edition, 1-topic synthetic universe.
  const ED = { command: ['cmd'], skill: ['skl'] };
  const TB = { t: { command: 'foo', skill: 'foo' } };
  const mapSurface = surfaces => rel => (Object.prototype.hasOwnProperty.call(surfaces, rel) ? surfaces[rel] : null);

  function expectRed(label, { blocks, surfaces, editions = ED, topicBasename = TB, foreignMarkers = new Set() }) {
    const r = checkManifest({ blocks, readSurface: mapSurface(surfaces), editions, topicBasename, foreignMarkers });
    assert(r.failures.length > 0, `RED-PROOF ${label}: checkManifest must report >=1 failure on the planted defect`);
  }

  // (1) DROPPED — surface present, one content token removed from an obligated
  //     surface → missing-token red.
  expectRed('dropped-block', {
    blocks: [{ block_id: 'b1', topic: 't', runtime_tag: 'both', surface_type_tag: 'both',
      content_tokens: ['<!-- PIN: a -->', 'anchor-token'] }],
    surfaces: {
      'cmd/foo.md': '<!-- PIN: a --> anchor-token',
      'skl/foo/SKILL.md': '<!-- PIN: a -->', // anchor-token DROPPED here
    },
  });

  // (2) HOLLOWED — marker kept, the distinctive 2nd token gone from every
  //     obligated surface → red (proves bare markers are insufficient).
  expectRed('hollowed-block', {
    blocks: [{ block_id: 'b1', topic: 't', runtime_tag: 'both', surface_type_tag: 'both',
      content_tokens: ['<!-- PIN: a -->', 'deep-content'] }],
    surfaces: {
      'cmd/foo.md': 'prose <!-- PIN: a --> prose',
      'skl/foo/SKILL.md': 'prose <!-- PIN: a --> prose',
    },
  });

  // (3) NEW-SURFACE-MISSING — a 2nd synthetic edition y is auto-obligated by a
  //     both/both block; its file is absent → absent-surface red (proves the
  //     obligated set expands automatically, no hand-typed file list).
  expectRed('new-surface-missing', {
    blocks: [{ block_id: 'b1', topic: 't', runtime_tag: 'both', surface_type_tag: 'both',
      content_tokens: ['<!-- PIN: a -->', 'anchor-token'] }],
    editions: { command: ['x', 'y'], skill: ['sx'] },
    surfaces: {
      'x/foo.md': '<!-- PIN: a --> anchor-token',
      'sx/foo/SKILL.md': '<!-- PIN: a --> anchor-token',
      // y/foo.md deliberately absent
    },
  });

  // (4) ORPHAN-MANIFEST — an inconsistent tag pair (claude-live + skill) yields
  //     an empty/error derived set → orphan-manifest red.
  expectRed('orphan-manifest', {
    blocks: [{ block_id: 'b1', topic: 't', runtime_tag: 'claude-live', surface_type_tag: 'skill',
      content_tokens: ['<!-- PIN: a -->', 'anchor-token'] }],
    surfaces: { 'cmd/foo.md': '<!-- PIN: a --> anchor-token' },
  });

  // (5) ORPHAN-SURFACE — the forward pass is clean, but a rogue marker with no
  //     manifest block sits on a surface → reverse-sentinel red (catches R2
  //     self-disarm: a deleted manifest block whose marker survives on-surface).
  {
    const blocks = [{ block_id: 'b1', topic: 't', runtime_tag: 'both', surface_type_tag: 'both',
      content_tokens: ['<!-- PIN: a -->', 'anchor-token'] }];
    const surfaces = {
      'cmd/foo.md': '<!-- PIN: a --> anchor-token <!-- PIN: rogue -->',
      'skl/foo/SKILL.md': '<!-- PIN: a --> anchor-token',
    };
    const r = checkManifest({ blocks, readSurface: mapSurface(surfaces), editions: ED, topicBasename: TB, foreignMarkers: new Set() });
    assert(r.failures.length > 0 && r.failures.some(m => m.startsWith('orphan-surface')),
      'RED-PROOF orphan-surface: a rogue marker with no manifest block must red the reverse orphan-sentinel');
  }

  // (6) SUPERSET-PROOF — a legacy pin whose token no manifest block carries and
  //     which is not allow-listed must NOT fold → the superset proof reds.
  {
    const blocks = [{ block_id: 'b1', topic: 't', runtime_tag: 'both', surface_type_tag: 'both',
      content_tokens: ['<!-- PIN: a -->', 'anchor-token'] }];
    const folded = foldsGeneric('unfoldable-needle', ['cmd/foo.md'], blocks, new Set(), ED, TB);
    assert(folded === false,
      'RED-PROOF superset-proof: an unfolded, non-allow-listed legacy token must fail the superset proof');
  }

  // (7) CLOSURE-AUDIT VACUOUS-GUARD (#637) — the LIVE fn-closure-audit block
  //     (imported straight from the real manifest, not a synthetic stand-in) is
  //     exercised against a fixture where every real finalize surface's marker
  //     is PRESERVED but its interior prose is GUTTED. Pre-fix, the block's 2nd
  //     content_token ('closure-audit') is a bare SUBSTRING of its own marker
  //     ('<!-- PIN: closure-audit -->'), so a marker-only surface trivially
  //     satisfies it and the checker stays vacuous-green on the gut — this case
  //     must RED. (Confirmed pre-fix: this assertion fails, proving the bug is
  //     real; post-fix — a distinctive non-marker-substring token added to the
  //     manifest — it passes.)
  {
    const closureAuditBlock = REQUIRED_BLOCKS.find(b => b.block_id === 'fn-closure-audit');
    assert(!!closureAuditBlock,
      'RED-PROOF closure-audit-vacuous-guard: fn-closure-audit block must exist in the manifest');
    const obligated = deriveObligated(closureAuditBlock, MANIFEST_EDITIONS, TOPIC_BASENAME).files;
    const guttedSurfaces = {};
    for (const f of obligated) guttedSurfaces[f] = '<!-- PIN: closure-audit -->'; // marker kept, interior GUTTED
    const r = checkManifest({
      blocks: [closureAuditBlock],
      readSurface: mapSurface(guttedSurfaces),
      editions: MANIFEST_EDITIONS,
      topicBasename: TOPIC_BASENAME,
      foreignMarkers: FOREIGN_MARKERS,
    });
    assert(r.failures.length > 0,
      'RED-PROOF closure-audit-vacuous-guard: gutting the closure-audit interior while keeping the bare PIN marker must red the derived-universe checker (a content_token that is a substring of its own marker is vacuous)');
  }
}

if (failed) {
  console.error(`\nRoute-reachability test FAILED: ${failed} failure(s), ${passed} passed.`);
  process.exit(1);
}
console.log(`Route-reachability test passed (${passed} assertions).`);
