# Workflow Plan — issue #655

<!-- plan_hash: 7ea7dad9bb394a916b78d483c51c77e4cecb0c3aed14d77729831ca282895a65 -->

## Meta
speculative_open_policy: auto
labels: enhancement, workflow:in-progress, area:scripts, area:workflow-phases
validation_command: npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea
validation_test_consumes: templates/routing/plan-run.skeleton.md, commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md, agents/workflow-planner.md, plugins/kaola-workflow/agents/workflow-planner.toml, plugins/kaola-workflow-gitlab/agents/workflow-planner.toml, plugins/kaola-workflow-gitea/agents/workflow-planner.toml

Add one optional, hash-covered `wait_budget_minutes` node field that lets a planner extend the
Join Protocol's no-interrupt floor for work whose expected duration is grounded in issue, command,
benchmark, or preflight evidence. Preserve every legacy/no-override dispatch byte-for-byte, forbid
shortening tier floors or combining the general override with the metric optimizer's specialized
wall-clock budget, and preserve the frozen value through every opener and crash reconciliation.

The issue supplies a settled grammar and dispatch design, and the current code exposes the single
validator parser, next-action descriptor bridge, and single `buildDispatch` convergence point, so the detailed implementation
direction is frozen in the two TDD briefs instead of adding a serial design node. The core runtime
lane and planner/routing contract lane form an independent ready antichain; their focused tests do not
require the sibling diff, while the runtime may serialize them under its coarse shared-plugin-area
containment fallback. Independent review convergence follows both, then two
adversarial acceptance probes and documentation docking share the post-review frontier.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-core-frozen-wait-budget | tdd-guide | — | scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js, scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js, scripts/kaola-workflow-next-action.js, plugins/kaola-workflow/scripts/kaola-workflow-next-action.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-next-action.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-next-action.js, scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/test-adaptive-node.js, scripts/simulate-workflow-walkthrough.js | 18 | sequence | standard |
| n2-planner-routing-contract | tdd-guide | — | agents/workflow-planner.md, plugins/kaola-workflow/agents/workflow-planner.toml, plugins/kaola-workflow-gitlab/agents/workflow-planner.toml, plugins/kaola-workflow-gitea/agents/workflow-planner.toml, templates/routing/plan-run.skeleton.md, templates/routing/required-blocks.js, commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md, scripts/test-route-reachability.js, scripts/test-agent-profile-parity.js, scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js | 19 | sequence | standard |
| n3-review | code-reviewer | n1-core-frozen-wait-budget, n2-planner-routing-contract | — | 1 | sequence | reasoning |
| n4-adversarial-freeze-compat | adversarial-verifier | n3-review | — | 1 | fanout(wait-budget-verification) | reasoning |
| n5-adversarial-open-reconcile | adversarial-verifier | n3-review | — | 1 | fanout(wait-budget-verification) | reasoning |
| n6-document-contract | doc-updater | n3-review | docs/plan-run-cards/join-protocol.md, docs/api.md, docs/workflow-state-contract.md, docs/conventions.md | 4 | sequence | standard |
| n7-finalize | finalize | n3-review, n4-adversarial-freeze-compat, n5-adversarial-open-reconcile, n6-document-contract | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

- Cross-edition symbol scoping searched `wait_budget_minutes`, `wait_budget_source`,
  `WAIT_BUDGET_MINUTES`, `budget_wallclock_minutes`, and the proposed `planner_override` across root
  scripts, every plugin script tree, all command/SKILL editions, role profiles, docs, and routing
  templates. The complete moving surface is the four schema anchors, four plan-validator editions,
  four next-action editions, four adaptive-node editions, all six generated plan-run surfaces, all
  four workflow-planner profiles, the Join Protocol/API/state/conventions docs, and their focused
  assertion surfaces.
- `scripts/kaola-workflow-plan-validator.js`, `scripts/kaola-workflow-next-action.js`, and
  `scripts/kaola-workflow-adaptive-node.js` are `GENERATED_AGGREGATORS`. Node n1 owns each canonical
  root script, its Codex twin, and both renamed forge ports in one atomic write set. Edit the canonical
  roots and run `npm run sync:editions` to generate the coupled ports; never hand-edit a generated
  forge port. The four adaptive-schema files are a byte-identical sync group and likewise move
  atomically in n1.
- `templates/routing/plan-run.skeleton.md` is the canonical source for all six plan-run command/SKILL
  surfaces. Node n2 edits that skeleton and the required-block manifest, runs
  `node scripts/generate-routing-surfaces.js --write`, and treats the six emitted files as generated
  outputs. The full accumulated skeleton diff is the canonical specification for every emitted
  surface, modulo generator-owned runtime/forge nouns; no generated output is hand-authored.
- The three plugin `workflow-planner.toml` files remain byte-identical, forge-neutral mirrors. The
  root Markdown profile carries the same authoring rule in its native format. This changes an
  existing profile, not the agent set, so no agent-registration addition/removal surface is in scope.
  The planner rule must say that only concrete duration evidence justifies an override, the evidence
  and expected runtime belong in the node brief, difficulty alone is not evidence, and an override
  never disguises a wedged agent.
- The root/Codex `validate-workflow-contracts.js` pair is byte-identical and moves atomically in n2;
  the Codex and two forge contract validators remain edition-specific but semantically coupled in the
  same node. Changed plugin prose must remain forge-neutral and n2 immediately runs each forge
  validator's `--forbidden-only` check on its changed plugin files before the full edition chains.
- No node in this plan declares the new optional column: the issue and current repository evidence
  establish the feature's motivating multi-hour external run, but do not establish that either
  implementation node in this repository exceeds its current 20-minute standard-tier floor. The
  omission intentionally exercises legacy plan behavior and follows the new planner evidence rule.
- The Meta validation command is the only full consumer command. Nodes n1 and n2 run focused RED/GREEN
  checks in their scoped lanes; n3 runs or verifies one sequential four-edition receipt only after
  both legs converge, including `node scripts/simulate-workflow-walkthrough.js`, route reachability,
  profile parity, generator check, edition sync, and the relevant standalone contract validators.
- The current n3 review evidence records a pre-existing acceptance blocker outside this issue's write
  sets: the fresh sequential Meta command reached an unstubbed GitLab remote-note probe, returned
  `target_indeterminate`, and short-circuited before Gitea; a standalone Gitea diagnostic passed. Node
  n1 must not absorb the unrelated GitLab test/classifier files. After the in-scope repair, n3 re-probes
  the exact sequential Meta command and records the external blocker separately if it persists; the
  incomplete receipt remains a finalization blocker rather than an implicit scope expansion.
- Evidence for every dispatched node belongs under
  `kaola-workflow/issue-655/.cache/<node-id>.md`; no node writes a bare worktree-root `.cache` path.

## Node Briefs

### n1-core-frozen-wait-budget

Implement the frozen grammar and dispatch lifecycle test-first. Start with focused RED assertions in
`scripts/simulate-workflow-walkthrough.js` for plans whose `## Nodes` table omits the optional column,
uses blank/`-`/`—`, carries valid standard and reasoning values at the tier floor and at 720, and
freezes a 180-minute standard implementer value with the plan hash covering the cell. Refuse non-base-
10 integers, values below the resolved tier floor, values above 720, values on `finalize` or
`main-session-gate`, and a `metric-optimizer` that also has
`optimize(<id>).budget_wallclock_minutes`; assert typed reasons, including
`wait_budget_conflict` for the optimizer ambiguity. Legacy plans and absent values must preserve their
current validator result and hash normalization behavior.

GREEN by extending the header-indexed `parseNodes` once: normalize absent/blank/dash to no override,
otherwise retain enough raw shape for precise validation and expose one validated numeric
`wait_budget_minutes` field on the validator-shaped node consumed by next-action/adaptive-node. Put
the tier floors and 720 cap in the canonical schema and validate the floor from the same effective
role/model resolution used by dispatch, including when the model cell is omitted; do not treat an
absent raw model as an automatic 20-minute tier. Cover omitted-model standard and reasoning roles,
explicit neutral and legacy aliases, role/default resolution, and the exact 20- and 40-minute floors.
Keep the general override distinct from `budget_wallclock_minutes`. Do not add a second Markdown
parser in adaptive-node or next-action.

Thread the already-validated field through every `kaola-workflow-next-action.js` projection that can
feed execution or recovery: ready/ready-pending, active/in-progress, speculative pending/eligible,
`nextNode`, and any descriptor copied into a durable running-set member. The canonical next-action
source and its Codex/GitLab/Gitea generated ports move together. Preserve conditional omission when no
override exists so legacy descriptor/envelope shapes remain byte-compatible.

In `scripts/test-adaptive-node.js` and the owned walkthrough surface, RED all lifecycle paths before
runtime changes. Build authored plans containing the optional column and drive them through the real
validator and next-action projection; a direct `buildDispatch` call with a manually injected field is
only a unit control and is not acceptance evidence. Prove `open-next`, `open-ready`, and fused
`close-and-open-next` expose the frozen number with `wait_budget_source: 'planner_override'` through
their existing single builder; running-set members persist the override and source before dispatch;
top-up copies it; and `reconcile-running-set` redispatches the same values after simulated opening and
survivor-write crashes. Exercise serial open-next, read fan-out, isolated write-leg fan-out/rolling
top-up, fused advance, speculative/active descriptor controls, and crash reconcile. Prove a
no-override standard/reasoning/role-default card and descriptor stay deeply/byte compatible with
today's shape and source, and the optimizer path still emits `optimize_budget` only from its
specialized contract. The value is a join-loop no-interrupt floor, never a subprocess timeout,
success verdict, or permission to accept incomplete work.

After GREEN, regenerate all coupled schema/validator/next-action/adaptive-node editions from their
canonical sources, verify byte/sync and forge-renaming parity, run the focused validator,
next-action-through-lifecycle, adaptive-node, and walkthrough tests, and record exact commands/results.
Re-probe the Meta chains but do not modify unrelated GitLab fixture/classifier files if the recorded
pre-existing remote-probe failure persists. Do not change routing prose, planner profiles, or docs
owned by the sibling node and downstream doc node.

### n2-planner-routing-contract

Implement the author/executor prose contract test-first, independently of n1's JavaScript files.
Start with RED route-reachability, profile-parity, required-block, and all four edition contract
assertions that require every workflow-planner profile to explain the optional hash-covered column,
the tier-floor-through-720 rule, nondelegable and optimizer-conflict refusals, and the evidence-based
authoring rule. Pin `wait_budget_minutes`, `planner_override`, and the no-inflation/no-wedge semantics
across the root profile and all three byte-identical plugin profiles without adding issue/decision
provenance or forge-specific CLI names to agent-facing prose.

Update the canonical plan-run skeleton so all six generated executor surfaces say the dispatch card's
frozen value/source is authoritative, a planner override extends but never shortens the existing
no-interrupt floor, and the join loop must not interrupt/re-nudge before that floor while still
requiring a complete governed deliverable afterward. Preserve the specialized
`optimize_budget` explanation and make the two sources unambiguous. Update the required-block manifest,
regenerate the six command/SKILL outputs through `generate-routing-surfaces.js --write`, and extend
route/contract tests to fail if any edition drops the rule. Do not hand-edit generated outputs.

Run profile parity, route reachability, generator `--check`, the root/Codex/forge contract validators,
the byte-identical common-script check, and each forge `--forbidden-only` check on changed plugin
prose. Record exact results for n3. Do not modify core runtime/test files, docs, or CHANGELOG.

### n3-review

Review the converged implementation and contract diff independently. Confirm there is exactly one
header-indexed parse into the validator-shaped node and no adaptive-node reparse; validation accepts
only base-10 integers from the tier floor through 720, rejects nondelegable roles and optimizer dual
budgets with typed reasons, and hash coverage follows the existing full Nodes section. Trace the
validated field through next-action, all three opener envelopes, running-set persistence/top-up, and
crash reconcile to the single `buildDispatch` source `planner_override`. Compare representative
no-override envelopes to the pre-change fixtures for exact compatibility and ensure optimizer
precedence was replaced by explicit conflict, not silently reordered.

Check that generated aggregators and schema mirrors are synchronized, the routing generator owns all
six plan-run surfaces, planner TOMLs are byte-identical and forge-neutral, and tests cover freeze,
dispatch, fused advance, reconcile, routes, profiles, and walkthrough behavior. Run or verify the
focused checks and one fresh sequential Meta validation command after both implementation legs merge;
block on any omitted edition, stale generated output, incomplete receipt, or semantics that turn the
floor into a timeout/completion waiver.

### n4-adversarial-freeze-compat

Try to refute the grammar and compatibility guarantees using temporary plans and the real validator.
Probe absent header, reordered optional header, blank and both dash spellings, leading plus/minus,
decimal/exponent/whitespace/zero-padded inputs, tier aliases/defaults, exact floors, 720/721, finalize,
main-session-gate, metric-optimizer with and without its specialized wall-clock field, duplicate or
decoy content, freeze/hash tampering, and resume-check. Require stable typed reasons and prove a valid
180-minute standard implementer plan freezes without changing its model tier. Compare legacy/no-
override outputs and hashes against known fixtures; report any parser divergence or accidental
contract expansion. This node is read-only.

### n5-adversarial-open-reconcile

Try to refute end-to-end persistence with the real adaptive-node harness and hermetic temporary
projects. Open an overridden node through `open-next`, `open-ready`, and fused advance; inspect each
dispatch envelope and running-set member; simulate a crash at the opening/top-up/reconcile boundaries;
and prove redispatch keeps the exact frozen number and `planner_override` source. Exercise serial,
read fan-out, isolated write legs, rolling top-up, and an optimizer control. Then run no-override
controls for standard, reasoning, and role-default nodes and compare the complete dispatch objects to
pre-change fixtures. Finally inspect all six plan-run surfaces and the Join Protocol behavior to prove
the number is only a no-interrupt floor: healthy work is not escalated early, but expiry still enters
the existing bounded escalation ladder and never converts partial work to success. This node is
read-only.

### n6-document-contract

Read n1, n2, and n3 evidence before updating documentation. In
`docs/plan-run-cards/join-protocol.md`, document the tier-derived defaults, optional planner override,
`planner_override` source, evidence rule, floor-through-720 bounds, optimizer conflict, nondelegable
restriction, and no-interrupt-floor/non-timeout semantics. In `docs/api.md`, update the optional Nodes
schema, validation/refusal contract, validator-shaped node, dispatch object/source union, opener and
running-set/reconcile persistence, and byte-compatible absence behavior. In
`docs/workflow-state-contract.md`, document how frozen plans and durable running-set state preserve the
value across resume/reconcile. In `docs/conventions.md`, record planner evidence discipline,
cross-edition generation, focused tests, and the sequential four-chain acceptance rule. Keep prose
forge-neutral and consistent with reviewed behavior; do not add provenance to agent-facing surfaces.

### n7-finalize

Finalize only after review, both adversarial probes, and documentation docking pass. Add one concise
Unreleased `CHANGELOG.md` entry describing optional frozen per-node wait-budget extensions, tier-floor
and 720 bounds, explicit optimizer conflict, `planner_override` dispatch/reconcile persistence, and
legacy no-override compatibility. Reuse the fresh Meta validation receipt, preserve changelog format,
and do not broaden implementation or documentation scope.

## Node Ledger

| id | status |
| --- | --- |
| n1-core-frozen-wait-budget | complete |
| n2-planner-routing-contract | complete |
| n3-review | complete |
| n4-adversarial-freeze-compat | complete |
| n5-adversarial-open-reconcile | complete |
| n6-document-contract | complete |
| n7-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-core-frozen-wait-budget) | subagent-invoked | evidence-binding: n1-core-frozen-wait-budget e74630e15a42 | |
| tdd-guide (n2-planner-routing-contract) | subagent-invoked | evidence-binding: n2-planner-routing-contract c57e46f1da86 | |
| code-reviewer | subagent-invoked | evidence-binding: n3-review 8e6bc0eaddbe | |
| adversarial-verifier (n4-adversarial-freeze-compat) | subagent-invoked | evidence-binding: n4-adversarial-freeze-compat c3d428dc415f | |
| adversarial-verifier (n5-adversarial-open-reconcile) | subagent-invoked | evidence-binding: n5-adversarial-open-reconcile d7b05c235dea | |
| doc-updater (n6-document-contract) | subagent-invoked | evidence-binding: n6-document-contract db7134d657cb | |
| finalize (n7-finalize) | main-session-direct | evidence-binding: n7-finalize 6d3122a73df2 | |
