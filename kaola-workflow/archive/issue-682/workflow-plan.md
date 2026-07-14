# Workflow Plan — issue-682 routing integration recovery

<!-- plan_hash: dc42ce24b7ca586a7c318f51c751f8028489c2ef81db84879c4c1e8ded9a878c -->

## Meta
speculative_open_policy: off
labels: workflow:in-progress
validation_command: npm test
validation_test_consumes: templates/routing/plan-run.skeleton.md, agents/workflow-planner.md, plugins/kaola-workflow/agents/workflow-planner.toml, plugins/kaola-workflow-gitlab/agents/workflow-planner.toml, plugins/kaola-workflow-gitea/agents/workflow-planner.toml, docs/plan-run-cards/repair-routing.md, commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md

Recover the complete reviewed issue-682 candidate from commit `07f1532a` onto its exact parent
`5d749661`, move the approved repair protocol into the canonical plan-run routing skeleton, and prove
all six generated surfaces are exact renderer output. Independently review and validate the entire
carried candidate. Preserve agent-owned workflow and repair choice; no scheduler state, automatic
owner selection, or second state machine may be introduced.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-routing-integration | tdd-guide | — | CHANGELOG.md, README.md, agents/workflow-planner.md, commands/kaola-workflow-plan-run.md, docs/api.md, docs/architecture.md, docs/decisions/D-682-01.md, docs/plan-run-cards/repair-routing.md, docs/workflow-state-contract.md, plugins/kaola-workflow-gitea/agents/workflow-planner.toml, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/agents/workflow-planner.toml, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow/agents/workflow-planner.toml, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, scripts/kaola-workflow-adaptive-node.js, scripts/kaola-workflow-adaptive-schema.js, scripts/simulate-workflow-walkthrough.js, scripts/test-adaptive-node.js, scripts/test-agent-profile-parity.js, scripts/test-route-reachability.js, scripts/validate-kaola-workflow-contracts.js, scripts/validate-workflow-contracts.js, templates/routing/plan-run.skeleton.md, kaola-workflow/issue-682/.cache/run-gaps-manual.md, kaola-workflow/issue-682/.cache/n1-routing-integration.md | 1 | sequence | standard |
| n2-full-integration-review | code-reviewer | n1-routing-integration | — | 1 | sequence | reasoning |
| n3-full-candidate-falsifier | adversarial-verifier | n2-full-integration-review | — | 1 | sequence | reasoning |
| n4-finalize-without-duplication | finalize | n3-full-candidate-falsifier | — | 1 | sequence | — |

## Plan Notes

- **Carry forward, never inherit approval.** `07f1532a` is a direct child of the run base and the
  abandoned run's evidence is immutable at `kw-issue-682-replan3-chain-drift-evidence`. n1 may replay
  that commit, but n2 and n3 must inspect and validate the full base-to-HEAD candidate anew.
- **Canonical generator ownership.** The repair-protocol symbols `review_failed`,
  `repair-node --attempt-id`, `findings-route.json`, `repair_requires_replan`, and
  `repair_limit_reached` occur in the six plan-run outputs but not the base skeleton. n1 owns the
  canonical `templates/routing/plan-run.skeleton.md`, all six generated plan-run surfaces, and their
  reachability/profile tests as one semantic unit. Outputs are rendered from the skeleton, never
  maintained as six independent prose copies.
- **Whole candidate stays atomic.** Replaying `07f1532a` writes 34 reviewed code, test, profile,
  routing, documentation, decision-record, and changelog paths. They remain in n1's single cohesive
  write set together with the newly required skeleton. The generated adaptive-node root/Codex/GitLab/
  Gitea family, four byte-identical schema copies, four planner profiles, and six plan-run surfaces
  therefore cannot split across recovery nodes.
- **Durable gap classification.** n1 writes the exact manual seed
  `gap: routing-surface-generator-drift — plan-run repair protocol outputs drifted because templates/routing/plan-run.skeleton.md omitted the canonical repair section`
  to `.cache/run-gaps-manual.md`. Finalization maps the resulting exact tuple as
  `manual:routing-surface-generator-drift` filed to issue `#682`; this makes the run-discovered chain
  gap visible to both forward and reverse containment checks instead of leaving an unseeded summary.
- **No duplicate public prose.** The carried README, API, architecture, state-contract, D-682-01, and
  CHANGELOG text already passed dedicated review. The integration changes only the canonical routing
  source needed to reproduce the approved six outputs. n4 is deliberately write-free and verifies
  those approved public files remain byte-identical to `07f1532a`.
- **Strict critical path.** The generator integration is followed by full review and then independent
  adversarial validation. Speculation is off because a previously red four-chain integration gate is
  genuinely uncertain. The unique finalize sink cannot run before both gates pass.
- **Validation record once.** `npm test` is the content-addressed consumer command and runs all four
  edition chains sequentially. The skeleton is explicitly test-consumed so its freshness participates
  in the receipt hash. Focused checks run before the shared full-chain receipt is recorded.
- **R17 remains out of scope.** Parent-directory fsync after atomic rename is pre-existing, and this
  focused routing integration does not touch that durability primitive or claim it resolved.

## Node Briefs

### n1-routing-integration

Start from `5d749661`. Read the abandoned run's chain receipt and completed node evidence from tag
`kw-issue-682-replan3-chain-drift-evidence`, but use them only to reconstruct the failure. Recover the
exact 34-file candidate from `07f1532a` (whose parent is the run base), and first verify every carried
path matches that commit.

Before fixing anything, run `node scripts/generate-routing-surfaces.js --check` as the integration
RED. It must report exactly the six plan-run command/skill surfaces drifted because the committed
outputs contain the authoritative failed-review repair protocol while
`templates/routing/plan-run.skeleton.md` does not. Preserve the diagnostic as RED evidence; do not
erase it by regenerating first.

Add the already approved repair-protocol block to the canonical plan-run skeleton in the correct
shared region. Preserve forge-neutral wording and all command/skill and forge-specific directives.
Then run `node scripts/generate-routing-surfaces.js --write`; the resulting six plan-run surfaces must
be renderer-produced and byte-identical to their approved `07f1532a` versions, while the six `next`
surfaces remain byte-identical to the run base. GREEN requires `--check`,
`scripts/test-generate-routing-surfaces.js`, `scripts/test-route-reachability.js`, profile parity,
edition sync, contract validators, and focused workflow tests to pass. Confirm the final tracked diff
against `07f1532a` contains only the canonical skeleton; do not rewrite approved code, docs, ADR, or
CHANGELOG text.

Immediately seed `kaola-workflow/issue-682/.cache/run-gaps-manual.md` with this exact line:

`gap: routing-surface-generator-drift — plan-run repair protocol outputs drifted because templates/routing/plan-run.skeleton.md omitted the canonical repair section`

Keep the repair contract unchanged: the agent selects the writer and workflow response, while the
journal supplies authoritative history, mechanical proofs, crash recovery, and the gate-local bound.
Do not add a scheduler state or implement the unrelated R17 directory-fsync advisory. Cite, rather
than duplicate, the Meta full-suite command after focused GREEN.

### n2-full-integration-review

Review the complete run-base-to-HEAD candidate, not only the new skeleton. Treat the prior code,
prose, docs, and changelog approvals as leads rather than proof. Verify the skeleton is now the single
canonical source for the repair protocol and that renderer output exactly reproduces all six approved
plan-run surfaces across command/skill and GitHub/GitLab/Gitea contexts. Confirm no hand-authored
surface divergence, directive loss, forge-specific token leak, or change to any `next` surface.

Re-audit the carried issue-682 behavior: fail-closed sequence/fan-out settlement, immutable journal
history and ordinals, canonical routing, agent-selected unique-maximal writer proof, candidate and
barrier binding, crash-idempotent cleanup, opener fences, and independent five-repair gate lineages.
Inspect the full 34-file carry-forward for generated-port parity, schema byte identity, meaningful
tests, and accurate public documentation. Require the `--check` RED to be genuine and every focused
GREEN to pass. Verify the manual gap seed is exact and the approved README/docs/ADR/CHANGELOG blobs
remain byte-identical to `07f1532a`. Reject any second state machine or automatic repair strategy.

### n3-full-candidate-falsifier

After n2 passes, independently try to refute both the generator fix and the entire candidate. Run
`node scripts/generate-routing-surfaces.js --check`, the generator self-test, route-reachability,
profile parity, edition sync, contract checks, adaptive-node tests, and the recorded `npm test` four-
chain command. In out-of-repo scratch, perturb a rendered plan-run output and separately remove a
repair token from the skeleton; prove the check/tests fail and regeneration restores the exact six
approved outputs without changing `next` surfaces.

Inspect and exercise the carried review journal, fan-out, repair proof, ordinal cleanup, crash seams,
opener fences, simultaneous failures, and breaker lineages rather than assuming run 3 validated them.
Confirm the public docs and changelog contain one approved issue-682 account, not duplicated recovery
text. Verify `.cache/run-gaps-manual.md` yields the exact swept tuple
`manual:routing-surface-generator-drift` with the exact sample from n1, so finalization can map it as
`filed: #682`. Return pass only if every four-chain result is green and no counterexample survives.

### n4-finalize-without-duplication

This sink is intentionally write-free. Read n2 and n3 evidence and verify the final tracked candidate
equals `07f1532a` plus only the canonical plan-run skeleton change. Do not append or rewrite README,
API, architecture, state-contract, D-682-01, repair-routing card, or CHANGELOG text: their approved
issue-682 content is already present once. Reuse the fresh all-green chain receipt rather than the red
tagged receipt.

Before handing off to repository finalization, require the durable manual gap seed and direct the
finalization summary's `## Run gaps` section to include this exact mapping:

`- manual:routing-surface-generator-drift (plan-run repair protocol outputs drifted because templates/routing/plan-run.skeleton.md omitted the canonical repair section): filed: #682`

The eventual gap-sweep check must pass both containment directions. Do not claim R17 or any additional
workflow behavior beyond the reviewed candidate.

## Node Ledger

| id | status |
| --- | --- |
| n1-routing-integration | complete |
| n2-full-integration-review | complete |
| n3-full-candidate-falsifier | complete |
| n4-finalize-without-duplication | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-routing-integration) | subagent-invoked | evidence-binding: n1-routing-integration cd37ab2c55e3 | |
| code-reviewer | subagent-invoked | evidence-binding: n2-full-integration-review 5d73c678366d | |
| adversarial-verifier (n3-full-candidate-falsifier) | subagent-invoked | evidence-binding: n3-full-candidate-falsifier 0ecc2ee22756 | |
| finalize (n4-finalize-without-duplication) | main-session-direct | evidence-binding: n4-finalize-without-duplication 8e056feb02f5 | |
