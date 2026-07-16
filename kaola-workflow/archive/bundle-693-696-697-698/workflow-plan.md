# Workflow Plan — bundle #693, #696, #697, #698

<!-- plan_hash: d2f4efb603e4952a861c2387d979a2df2d2f317de3e48d273a80aeba5ce40f05 -->

## Meta
project: bundle-693-696-697-698
labels: bug, enhancement, workflow:in-progress, area:scripts, area:workflow-phases
speculative_open_policy: auto
validation_command: npm test && node scripts/test-opencode-edition.js

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-architecture | code-architect | — | — | 1 | sequence | reasoning |
| n2-profile-contracts | tdd-guide | n1-architecture | templates/reviewers/behavior-contracts.json, templates/reviewers/runtime-adapters.json, scripts/generate-reviewer-profiles.js, scripts/test-agent-profile-parity.js, scripts/test-opencode-edition.js, agents/code-reviewer.md, agents/profiles/higher/code-reviewer.md, agents/adversarial-verifier.md, plugins/kaola-workflow/agents/code-reviewer.toml, plugins/kaola-workflow/agents/adversarial-verifier.toml, plugins/kaola-workflow-gitlab/agents/code-reviewer.toml, plugins/kaola-workflow-gitlab/agents/adversarial-verifier.toml, plugins/kaola-workflow-gitea/agents/code-reviewer.toml, plugins/kaola-workflow-gitea/agents/adversarial-verifier.toml | 14 | sequence | standard |
| n3-validation-runner | tdd-guide | n1-architecture | scripts/kaola-workflow-validation-runner.js, plugins/kaola-workflow/scripts/kaola-workflow-validation-runner.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-validation-runner.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-validation-runner.js, scripts/test-validation-runner.js, scripts/validate-script-sync.js, scripts/test-validate-script-sync.js, scripts/kaola-workflow-install-manifest.js, plugins/kaola-workflow/scripts/kaola-workflow-install-manifest.js, scripts/test-install-manifest-single-source.js, package.json | 11 | sequence | standard |
| n4-review-engine | tdd-guide | n2-profile-contracts, n3-validation-runner | scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js, scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js, scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/kaola-workflow-repair-state.js, plugins/kaola-workflow/scripts/kaola-workflow-repair-state.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-repair-state.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-repair-state.js, scripts/reviewer-conformance-fixtures.json, scripts/test-adaptive-node.js, scripts/test-adaptive-handoff.js, scripts/test-plan-run.js, scripts/test-commit-node.js, scripts/simulate-workflow-walkthrough.js | 22 | sequence | standard |
| n5-runtime-guidance | tdd-guide | n4-review-engine | templates/routing/plan-run.skeleton.md, templates/routing/slots.js, templates/routing/required-blocks.js, commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md, commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md, plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md, commands/kaola-workflow-finalize.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md, plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md, agents/workflow-planner.md, plugins/kaola-workflow/agents/workflow-planner.toml, plugins/kaola-workflow-gitlab/agents/workflow-planner.toml, plugins/kaola-workflow-gitea/agents/workflow-planner.toml, scripts/test-route-reachability.js, scripts/test-generate-routing-surfaces.js | 27 | sequence | standard |
| n6-installed-contract-proof | tdd-guide | n2-profile-contracts, n3-validation-runner, n4-review-engine, n5-runtime-guidance | install.sh, plugins/kaola-workflow/config/agents.toml, plugins/kaola-workflow-gitlab/config/agents.toml, plugins/kaola-workflow-gitea/config/agents.toml, scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow/scripts/install-codex-agent-profiles.js, plugins/kaola-workflow-gitlab/scripts/install-codex-agent-profiles.js, plugins/kaola-workflow-gitea/scripts/install-codex-agent-profiles.js, scripts/test-install-model-rendering.js, plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js, plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js, scripts/validate-vendored-agents.js, scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js | 21 | sequence | standard |
| n7-documentation | doc-updater | n6-installed-contract-proof | README.md, CHANGELOG.md, docs/api.md, docs/architecture.md, docs/workflow-state-contract.md, docs/agents-source.md, docs/conventions.md, docs/opencode-edition.md, docs/decisions/D-693-01.md, docs/decisions/D-696-01.md, docs/decisions/D-697-01.md, docs/decisions/D-698-01.md | 12 | sequence | standard |
| n8-code-review | code-reviewer | n7-documentation | — | 1 | sequence | reasoning |
| n9-security-review | security-reviewer | n8-code-review | — | 1 | sequence | reasoning |
| n10-falsify-lifecycle | adversarial-verifier | n9-security-review | — | 1 | sequence | reasoning |
| n11-falsify-profiles | adversarial-verifier | n9-security-review | — | 1 | sequence | reasoning |
| n12-falsify-validation | adversarial-verifier | n9-security-review | — | 1 | sequence | reasoning |
| n13-finalize | finalize | n10-falsify-lifecycle, n11-falsify-profiles, n12-falsify-validation | — | 1 | sequence | — |

## Plan Notes

This bundle implements the four mutually dependent work packages without absorbing #699's separate
claim-preserving re-plan transaction. #693 supplies the graph-derived investigation/change-gate split;
#696 supplies generated behavioral contracts and profile identities; #697 supplies deterministic local
validation vectors; #698 composes those into schema-2 candidate-bound review, immutable findings,
convergence, group reduction, and the common-certifier wall. A typed `replan_required` outcome and its
durable handoff data are in scope; activating a child epoch while preserving the claim remains owned by
#699.

The scheduler starts with one reasoning design producer, then opens the exact-file-disjoint
`{n2-profile-contracts, n3-validation-runner}` sequence-shaped antichain as one ready frontier.
The siblings share coarse `scripts/` and `plugins/` areas but no exact paths, and the common downstream
code-review wall retains the parallel-write relaxation safety net. They are not a named fan-out because
the legacy fan-out grammar still rejects their coarse-area overlap before applying the antichain
relaxation. All later writers are serialized only where they consume generated identities, schema/runtime
interfaces, or assertion surfaces. Never hand-author `parallel_safe`.

All delegated Codex nodes inherit the parent session's xhigh-or-higher model/effort proof. The `model`
cells remain the required role-static planning tiers; they are not spawn overrides. The executor must
refuse any dispatch card whose fresh parent-session proof resolves below xhigh instead of silently lowering
the user's requested effort.

Cross-edition files move atomically. The adaptive schema is a four-file byte-identical group. The plan
validator and adaptive node are GENERATED_AGGREGATOR families; `n4-review-engine` edits each canonical root
file once, then regenerates the codex twin and both forge ports. Their canonical specification is the full
accumulated root diff from the run base (`git diff <base>..HEAD -- <root-file>`), mirrored in every hunk
modulo forge nouns. Repair-state stays a manually mirrored root/codex/forge family. The new validation
runner is forge-neutral and byte-identical across four editions, registered once through the install
manifest and sync-group metadata. Plugin agent TOMLs remain byte-identical across the three plugin editions
and use only forge-neutral wording.

The recorded validation command runs the four edition chains sequentially through `npm test`, followed by
the additive opencode suite. Nodes run only focused RED/GREEN checks while producing; Finalization records
the full command once over the final post-documentation tree. `CHANGELOG.md`, `README.md`, `docs/api.md`,
`docs/workflow-state-contract.md`, and `docs/agents-source.md` are already test-consumed freshness surfaces,
so `n7-documentation` deliberately precedes the common code certifier. The finalize sink has no tracked
write and cannot stale its own certification receipt.

Decision-record numbering was checked before freeze: no `D-693-*`, `D-696-*`, `D-697-*`, or `D-698-*`
record or mention exists, so each `-01` path is next-free. `D-697-01` must explicitly amend or supersede the
schema-2 use of the existing `validation_command` semantics from D-547-01 (existing) while preserving legacy frozen
plans.

## Node Briefs

### n1-architecture

Produce one dependency-safe blueprint for all four issues and persist it as this node's evidence. Read the
four issue bodies, their audit/design-refinement comments, parent #695, and sibling #699. The deliverable
must define: (1) a single pure graph-reachability `deriveGateMode` contract reused at every lifecycle seam;
(2) the three independent execution/domain/gate-effect axes; (3) canonical reviewer-source schema,
rendering rules, and hash boundaries; (4) schema-2 plan/context/receipt/journal data with explicit v1
migration; (5) finding-anchor canonicalization and UID/progress rules; (6) runner command/environment/
toolchain identity and reduction; (7) replicated-majority, partitioned-all, and degenerate sequence
semantics; (8) G4 including inherited-frontier virtual producers; and (9) exact module ownership across the
declared write sets. Resolve the #697 `validation_command` collision by extending D-547-01 (existing) for schema 2 with
an explicit legacy mapping unless a namespaced alternative is demonstrably safer. State falsification
tests for every major invariant. Downstream nodes must read this evidence before editing.

### n2-profile-contracts

Read `n1-architecture` evidence first. RED first in `test-agent-profile-parity.js`: a one-byte generated
profile mutation, a free-form adapter field, an omitted edition output, a contradictory description, or a
Codex `model`/`model_reasoning_effort` pin must fail. Add versioned canonical reviewer behavior and closed
runtime adapters under `templates/reviewers/`, then one deterministic generator for the complete
`code-reviewer` and `adversarial-verifier` prose. Render the Claude base/higher outputs and all three
forge-neutral byte-identical Codex TOML editions. Carry `behavior_contract_version`, a shared normalized
`behavior_contract_hash`, and per-render `resolved_profile_hash`; keep evidence transport and tool/model
policy as closed adapter data, never free-form judgment prose. Preserve #687 inherit-by-omission: Codex
outputs emit no model pins. Make the current code-reviewer confidence/proof/scope/zero-finding/false-
positive policy and adversarial investigation/change-gate policy identical in the normalized core. Extend
the opencode parity test so its generated agent retains the same normalized behavior identity without
claiming stochastic output identity. Agent-facing output must contain no issue/ADR provenance.

### n3-validation-runner

Read `n1-architecture` evidence first. RED first in the new runner test. Implement a forge-neutral,
byte-identical `kaola-workflow-validation-runner.js` family with a scrubbed environment, explicit
platform-minimum variables plus allowlisted keys, secret-safe effective-value digests, executable realpath
and version/output identity, relevant lock/toolchain identity, bounded repetitions/timeouts, pre/post
candidate digest checks, normalized failure signatures, and deterministic `pass|fail|inconclusive`
reduction. Mixed results, signal/timeout, candidate mutation, or incomparable execution are never pass.
Content-address the complete vector. Provide the opt-in local Claude/Codex qualification subcommand using
mockable process adapters; it records identities/invariant classes and never asserts identical natural-
language findings. Register the new script in the single-source support manifest and four-file byte sync
group, with exact create-on-missing tests. Add its focused test to the existing package test chain without
changing the sequential four-edition order.

### n4-review-engine

Read `n1-architecture`, `n2-profile-contracts`, and `n3-validation-runner` evidence first. This is the
cohesive central state-machine node; do not split a generated aggregator across nodes. RED first across the
focused adaptive-node/handoff/plan-run/commit/walkthrough fixtures.

Implement one exported pure `deriveGateMode(plan,node)` using the existing `advVerifierIsChangeGate`
forward-reachability criterion, not strict post-dominance, and reuse it for required-token seeding,
dispatch context, evidence binding, both close paths, journal creation, aggregation, repair-state,
`--verdict-check`, and Finalization. Investigation AV completion accepts bound
`refuted|not_refuted|indeterminate` analytical outcomes with `gate_effect:none` and no product-repair
journal; malformed/stale/failed execution remains a bounded role failure. Change-gate AV maps
`not_refuted` to pass and `refuted|indeterminate` to fail.

Add explicit `plan_schema_version: 2`/dispatch `contract_version: 2` for newly frozen plans while mapping a
verified legacy frozen plan explicitly to v1; missing, unknown, or mismatched values refuse before spawn.
At gate open persist a runtime-neutral, candidate-bound context carrying contract/behavior/plan/epoch/
scope/aggregation/validation identities and prior finding frontier. Bind the runtime-specific resolved
profile hash in the dispatch envelope. Close recomputes every binding before normalizing model output.

Implement immutable finding anchors (`candidate_range`, `deleted_base_range`, `tree_entry_change`,
`required_absence`, `evidence_observation`), canonical JSON UIDs, collision refusal, discovery-once then
closure, repair-delta admission, `review_scope_expanded`, resolution proof, strict progress, inherited
validation-vector comparison, two-nonprogress `review_nonconvergent`, and the existing five-repair cap.
Implement sequence, replicated-majority, and partitioned-all reducers with blocker veto rules. Add schema-2
gate metadata and code/security/AV certifier validation, including the non-vacuous inherited-frontier
virtual producer and final digest staleness. Consume runner vectors without letting metrics select writers
or rewrite a DAG. The conformance fixture must cover the issue matrices, v1/v2 split, malformed/mismatched
identities, investigation completion, change-gate failure, finding anchors/collisions/progress, reducers,
G4, and validation pass/fail/inconclusive/drift. Preserve this currently frozen v1 plan and all legacy
journal bytes.

### n5-runtime-guidance

Read `n1-architecture` and `n4-review-engine` evidence first. Write failing route/generation assertions,
then update every runtime/forge authoring, execution, and finalization surface needed to consume the new
machine fields. The six plan-run surfaces are generated: edit the canonical skeleton/slots/required-blocks
and run the generator, never hand-diverge an output. Keep the six adapt surfaces semantically equivalent and
teach the four workflow-planner profiles to author schema-2 plan version, validation policy, gate claim/
surface/aggregation, and certifier metadata while preserving compact-plan/exact-write-set rules. Teach
plan-run to pass the complete context/profile/version envelope, run inherited validation obligations, and
route typed convergence outcomes without selecting a writer or DAG. Teach finalization to verify bound
certifier and validation-vector freshness. Maintain explicit legacy-v1 behavior. All plugin prose is
forge-neutral; agent-facing prose states rules only and contains no issue/decision provenance. Prove the
six-surface propagation and generated byte identity with route-reachability and generator tests.

### n6-installed-contract-proof

Read all upstream evidence. This node owns the cohesive installer/preflight/assertion surface required by
the Codex-installer test contract. RED first: stale or modified repository/global/project/plugin-cache
profiles, behavior/profile hash mismatch, foreign adapter fields, explicit v1/v2 mismatch, and missing
version must fail with exact repair instructions. Update the three byte-identical Codex installers, the
four byte-identical preflight copies, and Claude `install.sh` proof without claiming proprietary prompt-load
attestation. Keep the github-Codex walkthrough, Claude installer test, and both forge workflow-script tests
in this same node. Reconcile the code-reviewer and adversarial-verifier descriptions in all three
`config/agents.toml` catalogs with the generated runtime-neutral source profiles before running installer
validation. Update the root/codex/forge contract validators once for the accumulated runner,
generated-profile, engine, and routing surfaces; do not split semantically coupled pins across editions.
Run each changed plugin file through both forge forbidden-token checks immediately. Preserve Codex
inherit-by-omission and verify exact source/installed bytes and hashes at every supported scope.

### n7-documentation

Read upstream implementation evidence and document the final contracts before certification. Update the
public overview, API/schema/refusal vocabulary, architecture/state-machine flow, workflow-state and
authoring contracts, reviewer-source provenance description, conventions, opencode derivation, and
`[Unreleased]` changelog. Create next-free decisions `D-693-01`, `D-696-01`, `D-697-01`, and `D-698-01`.
`D-697-01` must explicitly preserve legacy D-547-01 (existing) `validation_command` behavior and document the chosen
schema-2 extension/namespace. Distinguish deterministic contract equivalence from stochastic reviewer
output, installed-byte proof from proprietary prompt-load proof, and typed re-plan handoff from #699's
out-of-scope epoch activation. Do not introduce a hosted-CI requirement.

### n8-code-review

Review the complete post-documentation candidate. Verify every declared acceptance criterion against the
diff, surrounding callers, tests, and the recorded validation command without re-running the full suite at
this node. Pay special attention to graph-mode reuse at every seam, fail-closed version migration,
candidate/context/profile binding, anchor canonicalization, progress idempotency, reducer vetoes, inherited
G4, environment scrubbing, generated profile exactness, installer scope proof, cross-edition mirrors, and
the #699 scope boundary. Zero findings is valid; admit only concrete candidate-caused defects with exact
trigger and proof.

### n9-security-review

Read the architect, implementation, documentation, and code-review evidence. Threat-model the frozen shell
command runner, cwd/path normalization, executable resolution, environment allowlist and secret digests,
context/profile/candidate hashing, symlink/tree-mode anchors, cache/journal atomicity, and dispatch evidence
binding. Run focused adversarial inputs. A pass requires no admitted security blocker; do not treat hosted
CI or proprietary runtime internals as an authority.

### n10-falsify-lifecycle

Try to refute the lifecycle claim by running the strongest focused reproductions: a read-only investigation
AV returns each domain outcome and closes without a repair journal; the same topology on a code-to-sink
path is a change gate; sequence and group paths share one classifier; malformed/stale evidence cannot close;
anchor collision/move/deletion/absence/mode cases cannot churn identity; non-progress is crash-idempotent;
late unbound blockers route re-plan; reducer and G4 counterexamples fail closed; an inherited unapproved
frontier with zero child writers still requires certification. This is a standalone change gate: return
pass only if no counterexample survives.

### n11-falsify-profiles

Try to refute behavioral parity and installed identity. Mutate one generated byte, add a free-form adapter
field, omit an edition output, introduce a contradictory description, inject a Codex model pin, stale each
installed scope, and mismatch contract/context/profile versions. Confirm all fail while clean exact
generation, Claude/Codex/OpenCode normalized cores, and explicit v1/v2 fixtures pass. Do not compare
stochastic prose/findings. This is a standalone change gate: return pass only if no counterexample survives.

### n12-falsify-validation

Try to refute deterministic validation. Vary unallowlisted environment, allowed secret values, executable
realpaths/versions, lock identity, cwd, repetitions, timeouts/signals, output ordering, candidate mutation,
and inherited command obligations. Confirm fixed inputs reproduce one identity/vector, every run must pass,
mixed/timeout/signal/mutation is inconclusive, stable nonzero signatures fail, changed/dropped inherited
obligations cannot progress, and the live qualification path remains opt-in/non-authoritative. Run the real
conformance corpus through the shared normalizer/reducer. This is a standalone change gate: return pass only
if no counterexample survives.

### n13-finalize

Unique sink. Run the Meta `validation_command` once over the final post-documentation tree, require all four
edition chains sequentially green plus the opencode suite, record the content-addressed receipt, verify all
three standalone adversarial gates and certifier/profile/validation freshness, then close issues
693,696,697,698 together under the bundle's all-or-nothing policy. Write no tracked file from this node.

## Node Ledger

| id | status |
| --- | --- |
| n1-architecture | complete |
| n2-profile-contracts | complete |
| n3-validation-runner | complete |
| n4-review-engine | complete |
| n5-runtime-guidance | complete |
| n6-installed-contract-proof | complete |
| n7-documentation | complete |
| n8-code-review | pending |
| n9-security-review | pending |
| n10-falsify-lifecycle | pending |
| n11-falsify-profiles | pending |
| n12-falsify-validation | pending |
| n13-finalize | pending |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect (n1-architecture) | subagent-invoked | evidence-binding: n1-architecture ea05782ab1d5 | |
| tdd-guide (n2-profile-contracts) | subagent-invoked | evidence-binding: n2-profile-contracts ca71dbdf270d | |
| tdd-guide (n3-validation-runner) | subagent-invoked | evidence-binding: n3-validation-runner 7eb9cc90efb9 | |
| tdd-guide (n4-review-engine) | subagent-invoked | evidence-binding: n4-review-engine 01af83fb4cdf | |
| tdd-guide (n5-runtime-guidance) | subagent-invoked | evidence-binding: n5-runtime-guidance 68ac15fe7117 | |
| tdd-guide (n6-installed-contract-proof) | subagent-invoked | evidence-binding: n6-installed-contract-proof e4f670abbcf7 | |
| doc-updater (n7-documentation) | subagent-invoked | evidence-binding: n7-documentation c5f11e42db9c | |
