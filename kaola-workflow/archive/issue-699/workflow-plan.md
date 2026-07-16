# Workflow Plan — issue #699 — epoch 3

<!-- plan_hash: f696f5a02b2d9a2b1f8822b75b26fa479d650e18346a779f75a571425420d9d0 -->

## Meta

project: issue-699
labels: enhancement, workflow:in-progress, area:scripts, area:workflow-phases
speculative_open_policy: auto
validation_command: npm test
validation_test_consumes: docs/plan-run-cards/repair-routing.md
plan_schema_version: 2
contract_version: 2
epoch_schema_version: 2
epoch_lineage_id: 013e796d486ea0426548c2b1448a20d92cd95e62e4a0ee3b601048f8ebf1e4f7
plan_epoch: 3
parent_plan_hash: 356e9948105a500db2dc3061b9fe3dc7c8dcdcf9e117df5c2c7eb23906d1f938
parent_snapshot_manifest_digest: 89452fd7aa601e64ca3822b35928c9611a0044075ceaf96a3bae50124d3d3f27
claim_root_base_digest: 8440f268326ae12436c161c47e5408639624458dba125f8d764524a37e538aae
inherited_frontier_digest: fc32477ed00caeb691c5b828d230d6830fb3a717f0ba7f4e8ac8d5d2f3252233
inherited_frontier_classes: code,security
transition_reason: review_repair_requires_replan
source_evidence_digest: e182633aeb3fabecb276698f9bfad72d01b0f94f53e7e62c2fe02fb1135bcef5
planner_binding: 603d6569570a
code_certifier: e6-code-review
security_certifier: e7-security-review

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model | wait_budget_minutes | gate_claim | gate_surface | gate_aggregation | certifies |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| e1-epoch3-authority-blueprint | code-architect | — | — | 1 | sequence | reasoning | — | — | — | — | — |
| e2-versioned-epoch-repair | tdd-guide | e1-epoch3-authority-blueprint | scripts/kaola-workflow-replan.js, plugins/kaola-workflow/scripts/kaola-workflow-replan.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-replan.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-replan.js, scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js, scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js, scripts/replan-conformance-fixtures.json, scripts/test-replan.js | 1 | sequence | reasoning | 300 | — | — | — | — |
| e3-lifecycle-publication-repair | tdd-guide | e2-versioned-epoch-repair | scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js, scripts/kaola-workflow-closure-contract.js, plugins/kaola-workflow/scripts/kaola-workflow-closure-contract.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-closure-contract.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-closure-contract.js, scripts/kaola-workflow-adaptive-handoff.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-handoff.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-handoff.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-handoff.js, scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/test-adaptive-handoff.js, scripts/test-adaptive-node.js, scripts/test-claim-hardening.js, scripts/test-bundle-finalize.js, scripts/simulate-workflow-walkthrough.js | 1 | sequence | reasoning | 240 | — | — | — | — |
| e4-packaged-fixture-repair | build-error-resolver | e3-lifecycle-publication-repair | scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js, plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js | 1 | sequence | standard | — | — | — | — | — |
| e5-documentation-correction | doc-updater | e4-packaged-fixture-repair | README.md, CHANGELOG.md, docs/api.md, docs/architecture.md, docs/workflow-state-contract.md, docs/conventions.md, docs/plan-run-cards/repair-routing.md, docs/decisions/D-699-01.md | 1 | sequence | standard | — | — | — | — | — |
| e6-code-review | code-reviewer | e5-documentation-correction | — | 1 | sequence | reasoning | — | all epoch-3 repairs satisfy R6-699-01 through R6-699-04 and the two-transition self-host contract without weakening historical compatibility | complete epoch-3 code, tests, generated editions, package fixtures, and documentation | sequence | — |
| e7-security-review | security-reviewer | e6-code-review | — | 1 | sequence | reasoning | — | versioned receipts, committed-transaction rotation, source rotation, child publication, and the exhausted review budget remain fail-closed under replay, substitution, and crash | complete claim-scoped epoch authority and archive boundary | sequence | — |
| e8-falsify-two-transition-budget | adversarial-verifier | e7-security-review | — | 1 | sequence | reasoning | — | two real automatic transitions preserve every committed predecessor, tolerate legal runtime progress, and make the next failed review consent-halt at count two | live two-transition path, rotation receipts, source lifecycle, and claim budget | sequence | e2-versioned-epoch-repair, e3-lifecycle-publication-repair |
| e9-falsify-history-and-archive | adversarial-verifier | e7-security-review | — | 1 | sequence | reasoning | — | historical receipt and authored-plan tampering refuse while a valid planless epoch-one project archives and cleans up successfully | versioned snapshot history, planless archive, caller cleanup, and author-versus-runtime integrity | sequence | e2-versioned-epoch-repair, e3-lifecycle-publication-repair |
| e10-falsify-publication-and-editions | adversarial-verifier | e7-security-review | — | 1 | sequence | reasoning | — | the committed child publishes its own first node, finalize-check accepts the valid projection-bound child, and every packaged edition enforces the same semantic safety contract | first-node state, finalization, package fixtures, sync, and forge-neutral contracts | sequence | e2-versioned-epoch-repair, e3-lifecycle-publication-repair, e4-packaged-fixture-repair |
| e11-finalize | finalize | e8-falsify-two-transition-budget, e9-falsify-history-and-archive, e10-falsify-publication-and-editions | — | 1 | sequence | — | — | — | — | — | — |

## Plan Notes

This child preserves claim `issue-699`, branch `workflow/issue-699`, the claimed worktree, claim-root
digest, and epoch-lineage identity from the sealed planner packet. The frozen epoch-2 plan is an
immutable parent and is never a write target. The source obligations are `R6-699-01` through
`R6-699-04` plus the four independently recorded self-host defects: legal plan/task progress was
mistaken for authoring tamper, historical receipts were reinterpreted by mutable current code, the
last committed transaction and the settled source lacked mechanical rotation, and promotion retained
the parent first-node fields. This transition consumes the second and final automatic review-replan
slot; successful activation must publish `automatic_review_replans: 2` and
`authorized_epoch_ceiling: 2`, and any later failed review must return `replan_consent_required`
without advancing epoch or count.

`e1` is a fresh reasoning boundary because the repair must distinguish immutable authored authority
from legally mutable execution state while preserving already-sealed version-1 history. `e2` is the
sole writer of the transaction, schema, and plan-validator generated families and owns the executable
two-transition/tamper corpus. `e3` consumes that authority model and is the sole writer of lifecycle,
publication-consumer, and archive-caller families. `e4` owns only the three drifted package fixture
surfaces identified by code review. The two TDD writers are serialized because their state-machine
contracts meet at source settlement, promotion, and archive cleanup. The three final falsifiers are
read-only siblings and may open together after the named code and security certifiers.

The cross-runtime requirement is a runtime-neutral semantic safety contract: exact claim/epoch/CAS
authority, versioned historical verification, digest-proven rotations, correct child publication,
budget exhaustion, and typed refusals. Claude, Codex, GitLab, and Gitea may use runtime-specific names,
adapters, or fixture realization; behavioral narration parity is not an objective. For every generated
family touched by `e2` or `e3`, the canonical root specification is its full accumulated diff from the
claim base `d59b191c925c634a36a74592ac9a9d21dfc93982`; every declared edition port must mirror every
semantic hunk modulo forge nouns. No generated root family has more than one writer in this child.

The `300` minute override on `e2` reflects the integrated multi-version transaction work and the
standalone re-plan corpus, whose prior run took about 252 seconds after a prior epoch writer itself ran
about 66 minutes. The `240` minute override on `e3` reflects the archive, handoff, adaptive-node, and
walkthrough integration surface; the prior lifecycle writer ran about 33 minutes. These bounds give
the reasoning nodes room for RED/GREEN evidence and edition regeneration without replacing normal
wedge detection. `D-699-01` already exists; `e5` corrects that decision rather than allocating a new id.

## Node Briefs

### e1-epoch3-authority-blueprint

Read the sealed packet, `.cache/r6-code-review.md`, `.cache/run-gaps-manual.md`, comments
`4988106312`, `4988116327`, `4988126462`, and `4988131425`, the current transaction/schema writers,
the epoch-1 and epoch-2 snapshots, and the preserved committed transaction before proposing edits.
Produce one dependency-safe blueprint covering all four R6 findings and all self-host defects. Define
the immutable authored-plan surface separately from legal Node Ledger, compliance, task-mirror, and
state progress; define a version discriminator and exact verification rules for old and new receipts;
define crash-safe, digest-proven source and committed-transaction rotation; and define the state value
published for the new child first node. Include the planless epoch-1 representation, finalization
consumer, budget transition, RED tests, tamper matrix, crash ordering, and exact downstream file
ownership. Preserve historical version-1 meaning rather than recomputing it with current writers.

### e2-versioned-epoch-repair

Read `e1` evidence first. RED first for `R6-699-01` and `R6-699-02`, then for every self-host defect.
Introduce a mechanically distinguishable new receipt/transaction contract while continuing to verify
already-sealed version-1 history by its own canonical rules or exact sealed bytes. A projection-bound
committed child must pass `--finalize-check`; malformed or cross-version reinterpretations must refuse.
`verifyAllEpochSnapshots` must accept a genuine zero-snapshot planless epoch-one state only when its
active-plan authority explicitly says none, require and verify the plan for planned states, and refuse
every missing/hash-mismatched hybrid.

Exercise two genuine prepare → planner handoff → resume → commit transitions. Between them, advance the
first child through legal Node Ledger, compliance, workflow-task, and state progress and prove that the
next prepare accepts that progress while author-hash or semantic-node tampering still refuses. Before
the successor transaction becomes active, durably preserve the final committed predecessor under a
transaction-id-bound historical receipt; include and verify it through the next snapshot. Rotate a
settled prior `replan-source.json` only when its exact expected digest is proven, with mismatch and
crash refusing before replacement. Publish the committed child plan's actual first node and role, not
the parent's stale fields. End the second transition at count `2` and ceiling `2`; prove the next
failed-review transition returns `replan_consent_required` with no epoch/count/source/snapshot side
effects.

Tamper the historical receipt, preserved committed transaction, final live state receipt, source,
authored Meta/Nodes, task mirror, and child first-node binding independently and require typed refusal.
Keep every earlier crash/CAS and legacy-v1 assertion. Run the full standalone `scripts/test-replan.js`
corpus, retaining all 888 baseline assertions plus the new regressions, focused plan-validator
finalize/resume checks, and edition sync for all three generated families. Regenerate all four members
of each family from the full accumulated canonical root diff.

### e3-lifecycle-publication-repair

Read `e1` and `e2` evidence first. Complete the caller and producer side of `R6-699-02`: a valid
planless epoch-one project must archive, preserve its lineage proof, and allow normal caller cleanup;
planned/missing/mismatched authority must stop finalize, release, watch, and bundle cleanup before the
live project, branch, worktree, label, or receipt is falsely removed. Ensure review outcome settlement
and successor prepare use the digest-proven source rotation contract from `e2`, and ensure handoff/node
consumers report the promoted child's actual first node without overwriting the transaction's authority.

Resolve `R6-699-04` without masking subprocess failure: remove the undersized nested full-suite timeout
or replace it with a bounded focused transport scenario, surface stderr/stdout on failure, and prove
that focused walkthrough independently from the standalone full re-plan corpus. RED/GREEN the positive
planless archive and all destructive-caller refusals, the real outcome-to-fresh-source path, and
first-node publication. Run focused adaptive-handoff, adaptive-node, claim-hardening, bundle-finalize,
and walkthrough scenarios. Mirror each touched production family across all four editions from its full
canonical root diff; runtime-specific adapters are allowed only when the safety outcomes remain exact.

### e4-packaged-fixture-repair

Read `e2` and `e3` evidence. Resolve `R6-699-03` by constructing valid snapshot-authority projections
and digests in the Codex contract fixture and the GitLab/Gitea packaged workflow-script fixtures. Keep
explicit negative cases for missing, malformed, and tampered authority and do not weaken packet or
transaction validation to make fixtures pass. Run the Codex package contract validator, both packaged
forge workflow-script suites, edition-sync and script-sync checks, and each changed forge validator's
forbidden-token check. Packaging proves the runtime-neutral safety contract; it does not require
identical runtime narration or CLI spelling.

### e5-documentation-correction

Read all writer evidence. Correct the public and architectural contract to the implemented mechanics:
versioned historical receipts, legal execution progress versus immutable authoring authority, durable
committed-transaction preservation, hash-proven source rotation, correct child first-node publication,
planless epoch-one archive semantics, and the exhausted two-transition budget. Update existing
`D-699-01` and `[Unreleased]`; do not create a second decision id. Describe common semantic safety
outcomes and runtime-specific realizations accurately, and do not present hosted CI/CD as a gate.

### e6-code-review

Act as the named schema-2 code certifier. Review the complete epoch-3 candidate against
`R6-699-01` through `R6-699-04`, every manual run-gap comment, the `e1` authority model, focused
RED/GREEN evidence, generated-family ownership, and the exact claim/parent/child lineage. Reproduce a
real two-transition run with intervening legal ledger/task progress, the projection-bound
`--finalize-check`, planless archive and cleanup, source and committed-transaction rotation, first-node
publication, packaged fixture suites, and the third-transition consent halt. Reject compatibility
laundering, current-code reinterpretation of old receipts, manual source deletion, missing historical
transaction authority, silent subprocess timeout, frozen-parent mutation, or narration-parity work
that displaces the semantic safety contract.

### e7-security-review

Act as the named schema-2 security certifier after code review. Treat authored Meta/Nodes, mutable
ledger/task/state progress, historical receipt versions, preserved committed transactions, source
outcomes, snapshot manifests, planner attestations, CAS tuples, counters, and archive cleanup as
separate authority boundaries. Attempt symlink/hardlink/path substitution, old-version confusion,
receipt replay, source replacement after rotation intent, crash at every preserve/rotate/activate
write, stale first-node publication, and a forged ceiling or third automatic transition. Require typed,
side-effect-free refusal and recursive re-verification of both historical epochs.

### e8-falsify-two-transition-budget

Independently try to refute `e2` and `e3` with one fresh fixture that performs two complete automatic
review transitions. Progress the first child legally before the second prepare, verify both historical
snapshots and the preserved committed transaction, and inject crashes around transaction/source
rotation. Then issue a third failed review and prove consent halt with epoch three, count two, ceiling
two, and no new dispatch, source consumption, snapshot, or activation. Record a gate verdict, not
implementation advice.

### e9-falsify-history-and-archive

Independently mutate each versioned receipt, historical transaction, manifest link, source digest,
authored plan surface, live task mirror, and final state authority. Prove legal ledger/compliance/task
progress remains accepted while every authority mutation refuses. Separately archive a valid planless
epoch-one project through a real cleanup caller, then try planned/missing/hash-mismatched hybrids and
verify the live project and cleanup authorities remain intact on refusal. Record a gate verdict.

### e10-falsify-publication-and-editions

Independently prove that the promoted epoch-3 state names `e1-epoch3-authority-blueprint` with role
`code-architect`, and that a stale parent first node or child mismatch refuses. Run the valid committed
projection-bound `--finalize-check`, the focused walkthrough transport scenario, the standalone full
re-plan corpus, Codex package contracts, GitLab/Gitea package suites, edition sync, script sync, and
forge forbidden-token probes. Try missing and tampered snapshot-authority fixtures. Judge common
semantic safety outcomes while allowing runtime-specific realization, then record a gate verdict.

### e11-finalize

Finalize only after both named certifiers and all three falsifiers pass. Run the Meta `npm test`
command once on the final documented candidate, preserve the epoch-1, epoch-2, and epoch-3 authority
chain plus every versioned transaction/source/review receipt, and close issue #699 only when the
claim-preserving archive and remote-visible finalization are durable.

## Node Ledger

| id | status |
| --- | --- |
| e1-epoch3-authority-blueprint | complete |
| e2-versioned-epoch-repair | complete |
| e3-lifecycle-publication-repair | in_progress |
| e4-packaged-fixture-repair | pending |
| e5-documentation-correction | pending |
| e6-code-review | pending |
| e7-security-review | pending |
| e8-falsify-two-transition-budget | pending |
| e9-falsify-history-and-archive | pending |
| e10-falsify-publication-and-editions | pending |
| e11-finalize | pending |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect (e1-epoch3-authority-blueprint) | subagent-invoked | evidence-binding: e1-epoch3-authority-blueprint a224da30381a | |
| tdd-guide (e2-versioned-epoch-repair) | subagent-invoked | evidence-binding: e2-versioned-epoch-repair 5558d54a8213 | |
| tdd-guide (e3-lifecycle-publication-repair) | pending | | |
| build-error-resolver (e4-packaged-fixture-repair) | pending | | |
| doc-updater (e5-documentation-correction) | pending | | |
| code-reviewer (e6-code-review) | pending | | |
| security-reviewer (e7-security-review) | pending | | |
| adversarial-verifier (e8-falsify-two-transition-budget) | pending | | |
| adversarial-verifier (e9-falsify-history-and-archive) | pending | | |
| adversarial-verifier (e10-falsify-publication-and-editions) | pending | | |
| finalize (e11-finalize) | pending | | |
