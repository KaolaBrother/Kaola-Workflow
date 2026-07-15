# Workflow Plan — issue 687 Codex session inheritance

<!-- plan_hash: 6748652aa5867fc9da585a7ba08d045c7ff035ecdf59aa188fea0322120e842e -->

## Meta

speculative_open_policy: off
labels: workflow:in-progress
validation_command: npm test
validation_test_consumes: README.md, docs/api.md, docs/architecture.md, docs/decisions/D-687-01.md, templates/routing/plan-run.skeleton.md, commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md

Move every Codex role profile to main-session model and reasoning-effort inheritance while preserving
the `reasoning`/`standard` tier vocabulary as declarative role metadata and the source of wait budgets.
Prove the unpinned-profile behavior against the current Codex runtime, migrate legacy pinned installs,
preserve the reasoning-floor refusal, and leave Claude Code and opencode routing unchanged.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-repository-surface-map | code-explorer | — | — | 1 | sequence | standard |
| n2-codex-inheritance-facts | knowledge-lookup | — | — | 1 | sequence | standard |
| n3-inheritance-architecture | code-architect | n1-repository-surface-map, n2-codex-inheritance-facts | — | 1 | sequence | reasoning |
| n4-inherit-runtime-and-profiles | tdd-guide | n3-inheritance-architecture | commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/agents/adversarial-verifier.toml, plugins/kaola-workflow/agents/build-error-resolver.toml, plugins/kaola-workflow/agents/code-architect.toml, plugins/kaola-workflow/agents/code-explorer.toml, plugins/kaola-workflow/agents/code-reviewer.toml, plugins/kaola-workflow/agents/contractor.toml, plugins/kaola-workflow/agents/doc-updater.toml, plugins/kaola-workflow/agents/implementer.toml, plugins/kaola-workflow/agents/issue-scout.toml, plugins/kaola-workflow/agents/knowledge-lookup.toml, plugins/kaola-workflow/agents/metric-optimizer.toml, plugins/kaola-workflow/agents/planner.toml, plugins/kaola-workflow/agents/security-reviewer.toml, plugins/kaola-workflow/agents/synthesizer.toml, plugins/kaola-workflow/agents/tdd-guide.toml, plugins/kaola-workflow/agents/workflow-planner.toml, plugins/kaola-workflow/scripts/install-codex-agent-profiles.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow/scripts/kaola-workflow-next-action.js, plugins/kaola-workflow/scripts/kaola-workflow-resolve-agent-model.js, plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js, plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/agents/adversarial-verifier.toml, plugins/kaola-workflow-gitlab/agents/build-error-resolver.toml, plugins/kaola-workflow-gitlab/agents/code-architect.toml, plugins/kaola-workflow-gitlab/agents/code-explorer.toml, plugins/kaola-workflow-gitlab/agents/code-reviewer.toml, plugins/kaola-workflow-gitlab/agents/contractor.toml, plugins/kaola-workflow-gitlab/agents/doc-updater.toml, plugins/kaola-workflow-gitlab/agents/implementer.toml, plugins/kaola-workflow-gitlab/agents/issue-scout.toml, plugins/kaola-workflow-gitlab/agents/knowledge-lookup.toml, plugins/kaola-workflow-gitlab/agents/metric-optimizer.toml, plugins/kaola-workflow-gitlab/agents/planner.toml, plugins/kaola-workflow-gitlab/agents/security-reviewer.toml, plugins/kaola-workflow-gitlab/agents/synthesizer.toml, plugins/kaola-workflow-gitlab/agents/tdd-guide.toml, plugins/kaola-workflow-gitlab/agents/workflow-planner.toml, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/scripts/install-codex-agent-profiles.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-next-action.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-resolve-agent-model.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/agents/adversarial-verifier.toml, plugins/kaola-workflow-gitea/agents/build-error-resolver.toml, plugins/kaola-workflow-gitea/agents/code-architect.toml, plugins/kaola-workflow-gitea/agents/code-explorer.toml, plugins/kaola-workflow-gitea/agents/code-reviewer.toml, plugins/kaola-workflow-gitea/agents/contractor.toml, plugins/kaola-workflow-gitea/agents/doc-updater.toml, plugins/kaola-workflow-gitea/agents/implementer.toml, plugins/kaola-workflow-gitea/agents/issue-scout.toml, plugins/kaola-workflow-gitea/agents/knowledge-lookup.toml, plugins/kaola-workflow-gitea/agents/metric-optimizer.toml, plugins/kaola-workflow-gitea/agents/planner.toml, plugins/kaola-workflow-gitea/agents/security-reviewer.toml, plugins/kaola-workflow-gitea/agents/synthesizer.toml, plugins/kaola-workflow-gitea/agents/tdd-guide.toml, plugins/kaola-workflow-gitea/agents/workflow-planner.toml, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/scripts/install-codex-agent-profiles.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-next-action.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-resolve-agent-model.js, plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js, plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md, scripts/kaola-workflow-adaptive-node.js, scripts/kaola-workflow-adaptive-schema.js, scripts/kaola-workflow-codex-preflight.js, scripts/kaola-workflow-next-action.js, scripts/kaola-workflow-resolve-agent-model.js, scripts/simulate-workflow-walkthrough.js, scripts/test-adaptive-handoff.js, scripts/test-adaptive-node.js, scripts/test-agent-model-resolver.js, scripts/test-agent-profile-parity.js, scripts/test-install-model-rendering.js, scripts/test-next-action.js, scripts/test-route-reachability.js, scripts/validate-kaola-workflow-contracts.js, templates/routing/plan-run.skeleton.md, templates/routing/required-blocks.js | 1 | sequence | standard |
| n5-code-review | code-reviewer | n4-inherit-runtime-and-profiles | — | 1 | sequence | reasoning |
| n6-live-child-inheritance-proof | main-session-gate | n5-code-review | — | 1 | sequence | — |
| n7-inheritance-falsifier | adversarial-verifier | n6-live-child-inheritance-proof | — | 1 | sequence | reasoning |
| n8-document-inheritance-contract | doc-updater | n7-inheritance-falsifier | README.md, docs/api.md, docs/architecture.md, docs/decisions/D-687-01.md | 1 | sequence | standard |
| n9-finalize | finalize | n8-document-inheritance-contract | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

- **Runtime fact before design.** n1 and n2 are independent read-only frontier nodes: n1 maps the
  repository's complete current pin/proof/floor surface; n2 establishes current Codex CLI behavior and
  a reproducible child-session evidence procedure. n3 may not select “delete the keys” or another
  inherit representation until it has read both evidence files.
- **One semantic writer.** Profile inheritance, preflight/installer migration, dispatch descriptors,
  reasoning-floor enforcement, routing prose, and their tests are one invariant. n4 owns them as one
  cohesive node despite the large file set; splitting by edition or prose/code would permit one forge
  or one proof protocol to describe a different runtime contract.
- **Cross-edition mirrors are atomic.** n4 owns all 48 role-profile TOMLs (16 byte-identical triples),
  all four byte-identical adaptive-schema, resolver, and preflight copies, all three byte-identical
  installers, and both generated aggregator families (`kaola-workflow-{adaptive-node,next-action}.js`:
  canonical root, Codex twin, GitLab port, Gitea port). Run `npm run sync:editions` only after editing
  the canonical members; never hand-edit generated forge aggregator ports.
- **Routing generator is canonical.** Plan-run dispatch prose changes originate in
  `templates/routing/plan-run.skeleton.md`; n4 regenerates all six command/SKILL outputs and updates
  `templates/routing/required-blocks.js` plus route-reachability assertions. The three Codex adapt
  SKILLs remain byte-matched by intent and retain neutral tier vocabulary while describing session
  inheritance.
- **Installer test surface is indivisible.** n4 contains the three installer copies together with
  `scripts/test-install-model-rendering.js`, the GitHub-Codex walkthrough, and the GitLab/Gitea
  `test-*-workflow-scripts.js` assertion surfaces. A legacy profile carrying either top-level pin must
  be stale and autofixed to the chosen inherit posture at both project and global inspection scopes;
  the user-owned root `model_reasoning_effort` dispatch-posture warning contract is unchanged.
- **Tier vocabulary remains behaviorally meaningful.** `reasoning`/`standard` and legacy aliases stay
  accepted in plans, role defaults, cards, displays, and wait-budget derivation. They do not select a
  Codex child model/effort. Claude Code tier-to-model and opencode tier-to-effort routing remain
  byte-compatible. `codex_tier_unresolved` must distinguish unresolved declarative metadata from the
  valid, explicit session-inheritance posture.
- **Reasoning floor remains fail-closed.** The architect must define an explicit Codex session-proof
  input for `REASONING_FLOOR_ROLES`: a proven reasoning-class main posture satisfies the floor; absent,
  stale, or sub-floor proof refuses. Inheritance itself is never treated as automatic floor evidence.
- **Non-delegable acceptance gate.** n6 is required because only the main session can launch and
  inspect a real child-session inheritance probe. It is read-only in the repository. It may use an
  out-of-repo temporary Codex home/workspace to load the candidate unpinned profile and capture parent
  and child JSONL; no in-worktree probe fixture is needed or permitted. This is ephemeral external
  scratch, not a committed instrument, and it must be deleted after evidence is recorded.
- **Live proof before prose.** n6 post-dominates the sole code writer and follows code review. n7 then
  tries to refute the live result and the migration/floor contracts. Public docs are written only from
  the proven behavior. Speculation is off because current unpinned named-profile inheritance and the
  child-probe mechanics are genuinely uncertain.
- **Decision numbering.** No `D-687-*` record exists at authoring time, so `D-687-01.md` is the next
  free decision record. Keep issue provenance out of agent, command, and SKILL prose; it belongs only
  in this ADR, CHANGELOG, and commit history.
- **Validation record once.** Focused RED/GREEN commands belong in n4 evidence. n9 runs the Meta
  `npm test` command, which executes all four edition chains sequentially; no external pipeline is a
  gate. Every changed GitLab/Gitea plugin prose file must also pass its edition's standalone
  `validate-kaola-workflow-{gitlab,gitea}-contracts.js --forbidden-only <changed-files...>` check.

## Node Briefs

### n1-repository-surface-map

Map the complete current implementation without editing. Trace the source-of-truth profile schema,
the installer/preflight stale-and-autofix path, dispatch-card model/effort/profile fields, the
`REASONING_FLOOR_ROLES` production enforcement seam, child-session proof prose, generated routing
surfaces, mirror groups, and every focused assertion that pins the old Sol/medium versus Sol/xhigh
contract. Confirm the declared n4 write set contains each unavoidable co-moving file and report any
missing or unnecessary path. Explicitly trace `model`, `model_reasoning_effort`, `gpt-5.6-sol`,
`codex_profile_*`, `codex_tier_unresolved`, `codex_profile_runtime_mismatch`, and
`REASONING_FLOOR_ROLES` across root scripts, all plugin editions, commands/SKILLs, tests, and docs.

### n2-codex-inheritance-facts

Establish current Codex behavior from official/current documentation, installed CLI source or help,
and a bounded read-only experiment where possible. Determine whether omitting top-level `model` and
`model_reasoning_effort` from a named role profile inherits both values, whether a documented explicit
inherit form exists, when named profiles are loaded relative to spawn overrides, and exactly where
parent and child `turn_context.model`/`turn_context.effort` appear in session JSONL. Deliver a
reproducible main-session gate procedure that can load the candidate profile from out-of-repo scratch,
spawn one representative role by identity, and compare parent and child values without writing the
worktree. State negative evidence and version bounds; do not infer behavior from config text alone.

### n3-inheritance-architecture

Read n1 and n2 evidence before starting. Choose the smallest proven inherit representation and define
one end-to-end invariant spanning source profiles, installed profiles, preflight diagnosis/autofix,
dispatch descriptors, child proof, and reasoning-floor enforcement. Specify the exact card fields and
typed refusals under inheritance while keeping tier/alias parsing and tier-derived wait budgets stable.
Define how a main-session model/effort proof reaches the Codex reasoning-floor check without weakening
Claude or opencode behavior. Include a RED/GREEN matrix for legacy pinned profiles, malformed partial
pins, all 48 source profiles, global/project scopes, both old tier classes, absent/stale runtime proof,
sub-floor session posture, legacy plan aliases, and non-Codex controls. Record the out-of-repo live
probe procedure n6 must execute.

### n4-inherit-runtime-and-profiles

Read n3's architecture evidence. Implement test-first. RED must first demonstrate at least: an
unpinned profile is rejected by the old schema; a legacy pinned profile is not migrated; standard and
reasoning cards still claim different Codex child pairs; the old per-tier runtime-proof prose remains;
and a Codex floor role can reach dispatch without the required session-posture proof. Preserve those
RED results in evidence before changing implementation.

Then make every one of the 48 profile sources adopt the proven inherit posture while preserving each
role's forge-neutral developer instructions and declarative tier identity. The three plugin TOML
copies for a role must remain byte-identical, and no profile may name a forge CLI or brand. Update the
three installers and four preflight copies so missing/legacy/partial pins are diagnosed and autofixed
toward inheritance, without touching the root-level user-owned dispatch-posture setting. Update the
four schema/resolver copies and both generated aggregator families so cards retain neutral tier,
display, alias, and wait-budget metadata but never represent a tier-selected Codex child strength.
Keep the reasoning-floor contract explicit and fail-closed on absent, stale, or sub-floor session
proof. Claude and opencode mappings must remain unchanged.

Update the canonical plan-run routing skeleton and regenerate all six outputs. The Codex SKILL region
must require one fresh parent-equals-child inheritance proof, not one proof per tier; both dispatch
modes still omit transient model/effort overrides, use the named role, and use `fork_turns: "none"`.
Update all three adapt SKILLs consistently. Keep provenance out of every profile/command/SKILL.

GREEN must cover the resolver, next-action floor, adaptive card/handoff displays, installer rendering
and migration, agent-profile parity, GitHub-Codex walkthrough, both forge installer tests,
route-reachability, routing generation check, edition sync, and all three Codex contract validators.
Run `npm run sync:editions` and `node scripts/generate-routing-surfaces.js --write` only after canonical
edits, then prove their check modes clean. For changed forge plugin prose, run the standalone
`--forbidden-only` validator immediately. Cite the Meta full suite; n9 owns its final execution.

### n5-code-review

Review the complete n4 diff and its RED/GREEN evidence. Verify that all profile pins are gone (or use
the exact documented inherit form proved by n2), all 16 role triples remain byte-identical, the
installer/preflight migration is safe and idempotent, and no root-level user setting is rewritten.
Trace every dispatch path: tiers and legacy aliases remain valid metadata; wait budgets remain tier
derived; Codex spawn strength is session-inherited; Claude and opencode behavior is unchanged. Confirm
the floor cannot pass on inheritance alone and requires fresh reasoning-class session evidence.
Inspect generated aggregator headers/parity, the routing skeleton and all six generated outputs, the
three adapt SKILLs, the four installer assertion surfaces, contract pins, and forge-neutral prose.
Reject config-text-only “proof,” silent floor weakening, or any per-role Codex pin that survives.

### n6-live-child-inheritance-proof

Read n2, n3, n4, and n5 evidence. Execute the architect's live current-Codex procedure as a
main-session-only acceptance gate. Use external temporary scratch to install/load one candidate
unpinned Kaola role profile; do not write anywhere in the repository or its worktree. Capture the
probe parent session's actual JSONL `turn_context.model` and `turn_context.effort`, spawn the child by
role identity with no transient pair overrides, and capture the child's actual fields. Pass only when
both child values exactly equal the parent values and the trace proves the candidate profile—not a
stale globally installed profile—was loaded. Also record Codex version, profile path, session IDs, and
the mechanical all-48-profiles-unpinned/parity check from n4. Delete external scratch after retaining
bounded evidence. A missing field, inability to bind the candidate profile, spawn refusal, or mismatch
is `verdict: fail`; config inspection or parent descriptors cannot substitute for the live result.

### n7-inheritance-falsifier

Read all upstream evidence, especially n6's raw parent/child comparison. Try to refute the claim that
every Codex role inherits by finding a remaining profile pin, edition drift, role-class branch,
transient override, alternate v1/v2 path, stale installed-profile acceptance, or card/prose instruction
that restores tier-selected strength. In out-of-repo scratch, perturb a legacy installed profile with
model-only, effort-only, standard-pair, and reasoning-pair pins; prove preflight marks each stale and
autofix removes it idempotently. Exercise reasoning-floor controls for proven reasoning posture,
sub-floor posture, and missing/stale proof. Re-run focused resolver/card/profile/installer/routing and
contract tests, plus edition and routing check modes. Confirm Claude/opencode control results remain
unchanged and that wait budgets still differ by tier. Return `verdict: pass` only if no counterexample
survives; otherwise return `verdict: fail` with the exact reproduction.

### n8-document-inheritance-contract

Read n7 evidence and document only the behavior that survived review, live proof, and falsification.
Update README Codex install/config guidance, `docs/architecture.md` profile/preflight/dispatch design,
and `docs/api.md` card, proof, installer, typed-refusal, and reasoning-floor contracts. Create
`docs/decisions/D-687-01.md` recording why session inheritance replaces per-role pins, why tier tokens
and wait budgets remain, how the live child proof works, and how a reasoning-class session proof keeps
the floor fail-closed. Clearly distinguish per-profile inherited fields from the unchanged user-owned
root `model_reasoning_effort` dispatch-posture setting. Do not claim Claude/opencode changes or cite
the issue in agent-facing surfaces.

### n9-finalize

Add one concise `[Unreleased]` CHANGELOG entry for Codex main-session model/effort inheritance,
legacy-profile migration, the single live inheritance proof, and the explicit reasoning-floor rule.
Run the recorded `npm test` command so the Claude, Codex, GitLab, and Gitea chains execute sequentially
after every test-consumed prose file has landed. Require fresh green evidence, the n6 live-probe pass,
and n7 falsification pass before repository finalization and sink merge.

## Node Ledger

| id | status |
| --- | --- |
| n1-repository-surface-map | complete |
| n2-codex-inheritance-facts | complete |
| n3-inheritance-architecture | complete |
| n4-inherit-runtime-and-profiles | complete |
| n5-code-review | complete |
| n6-live-child-inheritance-proof | complete |
| n7-inheritance-falsifier | complete |
| n8-document-inheritance-contract | complete |
| n9-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer (n1-repository-surface-map) | subagent-invoked | evidence-binding: n1-repository-surface-map 434a01548541 | |
| knowledge-lookup (n2-codex-inheritance-facts) | subagent-invoked | evidence-binding: n2-codex-inheritance-facts b2d4e33f1541 | |
| code-architect (n3-inheritance-architecture) | subagent-invoked | evidence-binding: n3-inheritance-architecture eddc1eb7ce1e | |
| tdd-guide (n4-inherit-runtime-and-profiles) | subagent-invoked | evidence-binding: n4-inherit-runtime-and-profiles 6e72dfeafd7e | |
| code-reviewer | subagent-invoked | evidence-binding: n5-code-review 5b2d537a2a9b | |
| main-session-gate (n6-live-child-inheritance-proof) | subagent-invoked | evidence-binding: n6-live-child-inheritance-proof 12c1b2a20bad | |
| adversarial-verifier (n7-inheritance-falsifier) | subagent-invoked | evidence-binding: n7-inheritance-falsifier bc14f1f75cd9 | |
| doc-updater (n8-document-inheritance-contract) | subagent-invoked | evidence-binding: n8-document-inheritance-contract 7fd1bd4cbfde | |
| finalize (n9-finalize) | main-session-direct | evidence-binding: n9-finalize ac49f75f56a8 | |
