# Workflow Plan — issue #656

<!-- plan_hash: 1e380b43aab4137ec5145bae17a553d15eff47d9bdaa6ee7d6e1aad22903318c -->

## Meta
speculative_open_policy: auto
labels: bug, workflow:in-progress, area:workflow-phases, area:workflow-router
validation_command: npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea
validation_test_consumes: templates/routing/next.skeleton.md, commands/workflow-next.md, plugins/kaola-workflow-gitlab/commands/workflow-next.md, plugins/kaola-workflow-gitea/commands/workflow-next.md, plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md, commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md, plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md

Pin one control-plane dispatch contract across the router's issue-scout and the adaptive front end's
workflow-planner: every runtime receives an isolated, self-contained brief and never the full parent
conversation; Codex maps that invariant to literal `fork_turns: "none"`, stable v2 task names, named
profiles without transient model/effort overrides, and a same-role corrected retry for malformed
argument shape. The existing v1 identity/header convention remains the isolated fallback.

This is a settled bug fix with a broad but cohesive generated/prose assertion surface. The full
implementation direction is frozen in the TDD brief, so a separate design node would add a serial
round trip without changing the known shape. Review and two adversarial checks form an independent
read-only frontier after the mandatory code-review wall.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-pin-control-plane-spawn | tdd-guide | — | templates/routing/next.skeleton.md, templates/routing/required-blocks.js, commands/workflow-next.md, plugins/kaola-workflow-gitlab/commands/workflow-next.md, plugins/kaola-workflow-gitea/commands/workflow-next.md, plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md, commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md, plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md, scripts/test-route-reachability.js, scripts/test-install-model-rendering.js, scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js, scripts/simulate-workflow-walkthrough.js, plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js | 25 | sequence | standard |
| n2-review-contract | code-reviewer | n1-pin-control-plane-spawn | — | 1 | sequence | reasoning |
| n3-adversarial-v2 | adversarial-verifier | n2-review-contract | — | 1 | fanout(control-plane-adversarial) | reasoning |
| n4-adversarial-v1-retry | adversarial-verifier | n2-review-contract | — | 1 | fanout(control-plane-adversarial) | reasoning |
| n5-finalize | finalize | n2-review-contract, n3-adversarial-v2, n4-adversarial-v1-retry | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

- Cross-edition symbol scoping searched `issue-scout`, `workflow-planner`, `fork_turns`,
  `v2-task-name`, `full-history`, and `local-fallback-tool-unavailable` across root scripts,
  every plugin script tree, and the command/SKILL editions. The issue-scoped routing surface is the
  six generated `next` outputs plus their canonical skeleton and the six manually maintained
  `adapt` surfaces. Existing plan-run `fork_turns: "none"` dispatch prose and role profiles are
  deliberately out of scope; this issue extends that settled invariant to out-of-ledger
  control-plane dispatches.
- `templates/routing/next.skeleton.md` is the canonical source for all six `next` command/SKILL
  editions. Edit it, update the required-block manifest, and run
  `node scripts/generate-routing-surfaces.js --write`; do not hand-author divergent generated
  outputs. All six semantically coupled `adapt` mirrors stay in the same node and must use one
  canonical specification, with forge nouns changed only where the existing editions require it.
- The shared invariant is runtime-neutral and belongs on all twelve control-plane routing surfaces:
  issue-scout/workflow-planner receives an isolated, bounded, self-contained brief and never inherits
  the full main-session conversation. Codex-only tool syntax belongs only in the three SKILL editions;
  the three Claude commands preserve native `Agent(...)` syntax and model-placeholder rendering.
- No agent profile is added, removed, or changed, so the agent-registration surface does not move.
  No generated JavaScript aggregator changes, no installer implementation change, and no forge CLI
  token is authorized. Plugin command/SKILL prose must remain forge-neutral except for established
  route nouns; run each forge validator's `--forbidden-only` mode on its changed plugin files before
  the full chains.
- `scripts/validate-workflow-contracts.js` and
  `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` are a byte-identical common-script
  pair and move atomically. The route generator's six emitted next files, the required-block
  manifest, reachability test, four edition contract validators, install-rendering assertion, and
  Codex walkthroughs are companions of the prose contract, not collateral.
- The Meta validation command is the consumer suite and must run sequentially. Focused RED/GREEN
  work should first exercise route reachability, install rendering, the root/Codex/forge contract
  validators, the affected walkthroughs, `node scripts/generate-routing-surfaces.js --check`, and
  edition synchronization checks, then reuse the recorded four-chain command once.
- Evidence for every dispatched node belongs under
  `kaola-workflow/issue-656/.cache/<node-id>.md`; no node writes a bare worktree-root `.cache` path.

## Node Briefs

### n1-pin-control-plane-spawn

Implement the complete contract test-first. RED before prose changes: add content/reachability,
required-block, installation-rendering, contract-validator, and walkthrough assertions proving both
control-plane roles are adjacent to literal `fork_turns: "none"` on every Codex SKILL edition; no
control-plane surface recommends `fork_turns: "all"`; v2 uses the direct `agents.spawn_agent` tool
with explicit `agent_type`, stable valid task names (`issue_scout` and a sanitized
`workflow_planner_<issue-or-project>`), and no transient `model` or `reasoning_effort`; v1 keeps
`fork_turns: "none"`, the established identity/header convention, and the same self-contained brief.

Use the observed rejection text as a regression fixture: full-history fork plus explicit role/model/
effort is an argument-shape refusal, not a capacity or tooling-unavailable refusal. The instructions
must correct the arguments and retry the same `issue-scout` or `workflow-planner` role exactly once;
they must not route to inline issue selection/DAG authoring and must reserve
`local-fallback-tool-unavailable` for genuinely unavailable agent tooling. Assert the corrected retry
keeps the original role, task identity, isolated brief, and bounded durable return contract.

GREEN by adding one runtime-neutral isolated/self-contained-control-plane invariant to every `next`
and `adapt` command/SKILL edition. In the three Codex `next` SKILLs, provide a literal direct v2
issue-scout spawn example with `task_name: "issue_scout"`, `agent_type: "issue-scout"`, and
`fork_turns: "none"`. In the three Codex `adapt` SKILLs, provide the corresponding workflow-planner
example with the stable sanitized `workflow_planner_<issue-or-project>` identity. Both prompts must
be self-contained and bounded with repository root, selected issue or issue set/project, the required
skill/profile contract, and expected durable return. Omit transient model/effort in both examples and
state the same-role one-retry correction rule. Preserve v1's isolated prompt and identity/header
convention rather than compensating for UUID display with inherited history.

Keep Codex syntax out of the Claude commands: retain their native `Agent(...)` examples and governed
install-time model placeholders while strengthening the prompt to carry the same repository/target/
contract/return context. Update the canonical next skeleton and required-block manifest, regenerate
all six next outputs, and keep all six adapt surfaces semantically identical modulo runtime/forge
nouns. Run the focused RED/GREEN surfaces, generator check, sync checks, and then the Meta validation
command. Record exact commands and outcomes in the node evidence.

### n2-review-contract

Review the complete cross-edition diff independently. Confirm the shared invariant is present on all
six Claude/Codex routing pairs, Codex examples use only direct `agents.spawn_agent`, both roles carry
literal `fork_turns: "none"`, v2 task names are stable and valid, and transient model/effort fields are
absent. Check that each prompt is actually self-contained with repo/target/contract/return context,
that v1 stays isolated, and that malformed shape retries the same role once without falling into
`local-fallback-tool-unavailable` or inline control-plane work. Verify generated next surfaces match
the skeleton, adapt mirrors do not drift, the common validator pair is byte-identical, forge prose is
neutral, and the focused plus sequential four-chain receipts are green.

### n3-adversarial-v2

Try to refute first-attempt v2 correctness from the committed prose and tests. For issue-scout and
workflow-planner separately, reconstruct the literal spawn argument object and verify it is accepted
by the installed direct-tool schema: explicit named role, `fork_turns: "none"`, valid stable task name,
self-contained bounded message, and no transient model/effort. Probe single issue, bundle, and project
name sanitization examples; look for any nearby contradictory `fork_turns: "all"`, inherited-history,
reserved namespace, or inline fallback guidance. Return a read-only verdict with concrete surface and
fixture evidence.

### n4-adversarial-v1-retry

Try to refute the fallback and refusal classifier. Use the observed full-history-plus-explicit-role
rejection fixture and verify every Codex control-plane surface routes it to one corrected same-role
retry with isolated context, never to capacity handling, inline selection/authoring, a default role,
or `local-fallback-tool-unavailable`. Verify v1 retains its established identity/header convention,
literal `fork_turns: "none"`, and enough repository/target/contract/return context to work without the
parent transcript. Also ensure the shared invariant is expressed in all Claude command editions
without leaking Codex tool vocabulary. This node is read-only.

### n5-finalize

Finalize only after code review and both adversarial gates pass. Add a concise `CHANGELOG.md` entry
under Unreleased describing isolated, self-contained issue-scout/workflow-planner control-plane
dispatch, pinned Codex `fork_turns: "none"`, stable v2 task identity, and corrected same-role retry for
malformed spawn shape. Reuse the Meta four-chain validation receipt and preserve changelog formatting.

## Node Ledger

| id | status |
| --- | --- |
| n1-pin-control-plane-spawn | complete |
| n2-review-contract | complete |
| n3-adversarial-v2 | complete |
| n4-adversarial-v1-retry | complete |
| n5-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-pin-control-plane-spawn) | subagent-invoked | evidence-binding: n1-pin-control-plane-spawn 398397900bc8 | |
| code-reviewer | subagent-invoked | evidence-binding: n2-review-contract 1db232e9e21e | |
| adversarial-verifier (n4-adversarial-v1-retry) | subagent-invoked | evidence-binding: n4-adversarial-v1-retry e4d1cd8be086 | |
| adversarial-verifier (n3-adversarial-v2) | subagent-invoked | evidence-binding: n3-adversarial-v2 321410e6ff2d | |
| finalize (n5-finalize) | main-session-direct | evidence-binding: n5-finalize 916a1a10edd2 | |
