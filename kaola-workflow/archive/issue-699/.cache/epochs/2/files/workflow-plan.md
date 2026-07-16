# Workflow Plan — issue #699 — epoch 2

<!-- plan_hash: 356e9948105a500db2dc3061b9fe3dc7c8dcdcf9e117df5c2c7eb23906d1f938 -->

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
plan_epoch: 2
parent_plan_hash: b9072d7c90fc11b0abb94eb50780818e5606ce8d0ef66429ff6c73b2ed22f37b
parent_snapshot_manifest_digest: pending
claim_root_base_digest: 8440f268326ae12436c161c47e5408639624458dba125f8d764524a37e538aae
inherited_frontier_digest: 42b1b3321089d2e423e359b2b5afb51496e7e26548a52986f8a01f875275583c
inherited_frontier_classes: code,security
transition_reason: review_repair_requires_replan
source_evidence_digest: 0528248946e1499b7f6178bb106aa3bc743b13d644faf4573ef0b0a42aff2f7b
planner_binding: 6df4e10baa38
code_certifier: r6-code-review
security_certifier: r7-security-review

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model | wait_budget_minutes | gate_claim | gate_surface | gate_aggregation | certifies |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| r1-repair-blueprint | code-architect | — | — | 1 | sequence | reasoning | — | — | — | — | — |
| r2-lifecycle-transport-repair | tdd-guide | r1-repair-blueprint | scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js, scripts/kaola-workflow-closure-contract.js, plugins/kaola-workflow/scripts/kaola-workflow-closure-contract.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-closure-contract.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-closure-contract.js, scripts/kaola-workflow-adaptive-handoff.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-handoff.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-handoff.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-handoff.js, scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/test-replan.js, scripts/test-adaptive-handoff.js, scripts/test-adaptive-node.js, scripts/test-claim-hardening.js, scripts/test-bundle-finalize.js, scripts/simulate-workflow-walkthrough.js | 1 | sequence | reasoning | 240 | — | — | — | — |
| r3-lineage-proof-repair | tdd-guide | r2-lifecycle-transport-repair | scripts/kaola-workflow-replan.js, plugins/kaola-workflow/scripts/kaola-workflow-replan.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-replan.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-replan.js, scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js, scripts/test-replan.js, scripts/test-adaptive-handoff.js, scripts/test-adaptive-node.js, scripts/test-plan-run.js | 1 | sequence | reasoning | 240 | — | — | — | — |
| r4-forge-contract-repair | build-error-resolver | r3-lineage-proof-repair | scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js | 1 | sequence | standard | — | — | — | — | — |
| r5-documentation-correction | doc-updater | r4-forge-contract-repair | README.md, CHANGELOG.md, docs/api.md, docs/architecture.md, docs/workflow-state-contract.md, docs/conventions.md, docs/plan-run-cards/repair-routing.md, docs/decisions/D-699-01.md | 1 | sequence | standard | — | — | — | — | — |
| r6-code-review | code-reviewer | r5-documentation-correction | — | 1 | sequence | reasoning | — | repaired candidate satisfies all seven source requirements without regression or provenance gaps | complete epoch-2 code, tests, generated mirrors, and documentation | sequence | — |
| r7-security-review | security-reviewer | r6-code-review | — | 1 | sequence | reasoning | — | repaired candidate preserves claim, snapshot, child, source-outcome, and CAS authority under adversarial interruption | complete persistence and provenance security boundary | sequence | — |
| r8-falsify-lifecycle-transport | adversarial-verifier | r7-security-review | — | 1 | sequence | reasoning | — | fresh and offline claims plus review-to-replan transport survive refusal and crash without false success | claim, archive, offline, and source-outcome boundary | sequence | r2-lifecycle-transport-repair |
| r9-falsify-binding-caseb | adversarial-verifier | r7-security-review | — | 1 | sequence | reasoning | — | child-snapshot binding and Case-B authority reject every placeholder, substitution, and untyped shortcut | child binding, immutable snapshot, and diagnosis-to-build boundary | sequence | r3-lineage-proof-repair, r4-forge-contract-repair |
| r10-falsify-crash-editions | adversarial-verifier | r7-security-review | — | 1 | sequence | reasoning | — | every durable prefix and CAS seam converges or refuses with no epoch advance while every edition remains forge-neutral | crash matrix, four CAS seams, generated mirrors, and forbidden-token contracts | sequence | r2-lifecycle-transport-repair, r3-lineage-proof-repair, r4-forge-contract-repair |
| r11-finalize | finalize | r8-falsify-lifecycle-transport, r9-falsify-binding-caseb, r10-falsify-crash-editions | — | 1 | sequence | — | — | — | — | — | — |

## Plan Notes

This child preserves claim `issue-699`, branch `workflow/issue-699`, the worktree, claim root, parent
plan hash, and epoch-lineage identity from the attested re-plan packet. The frozen epoch-1 plan is an
immutable parent and is never a write target. The seven source requirements are the six open findings
from `n7-code-review:1` (`A5-699-01`, `A5-699-02`, `N7-699-04`, `N7-699-05`, `N7-699-06`, and
`A5-699-03`) plus the live review-to-prepare bootstrap-transport gap recorded in the issue comment.

`r1-repair-blueprint` is a new reasoning boundary because the review exposed authority-model defects,
not merely missing assertions. The two TDD writers are serialized because their semantically distinct
repairs meet at the review transaction but have disjoint generated-family ownership. `r2` owns
fresh/offline claim lifecycle and durable review-outcome transport. `r3` is the sole writer of the
re-plan and adaptive-schema families for child/snapshot binding, Case-B entry/evidence, and exhaustive
crash/CAS proof. `r4` is the sole writer of the plan-validator family, consuming `r3`'s RED fixtures to
finish schema-2 binding enforcement while also resolving the forge forbidden-token failure. The three
final falsifiers are read-only siblings and may open together after the named code and security
certifiers.

Every generated aggregator and byte-identical family is declared atomically in each writer that touches
it. When a canonical root script is edited by more than one child node, the downstream node treats the
canonical specification as the full accumulated root diff from the run base
(`git diff d59b191c925c634a36a74592ac9a9d21dfc93982..HEAD -- <root-file>`) and mirrors every hunk modulo
forge nouns; it never ports only its local concern. Plugin and generated prose remains forge-neutral.
`D-699-01` is an existing decision record; `r5` corrects that record rather than allocating a new id.

The `240` minute overrides on `r2` and `r3` are based on this claim's prior durable timings: the parent
transaction writer ran about 114 minutes and the runtime-integration writer about 215 minutes. The
overrides give each high-risk repair boundary a bounded window above the reasoning-tier floor; they are
not a substitute for executor wedge handling. All other nodes use role/tier defaults.

## Node Briefs

### r1-repair-blueprint

Read the immutable packet, `n7-code-review:1`, the epoch-1 architecture and writer evidence, the live
bootstrap-transport issue comment, and the cited code paths before proposing edits. Record a repair
blueprint that resolves all seven requirements with one authority model. It must settle the non-circular
parent-snapshot/child binding and the legacy self-host transition, the valid epoch-1 planless/planned
active-state representations, fail-closed archive callers, offline claim-root semantics, mechanically
persisted review outcome, typed Case-B source/citation rules, and a complete durable-prefix/four-CAS
matrix. Include exact RED tests, phase ordering, compatibility boundaries, and which downstream writer
owns each file. The blueprint must preserve the frozen parent and must not accept an operator-authored
JSON bootstrap as the product contract.

### r2-lifecycle-transport-repair

Read `r1-repair-blueprint` evidence before editing. RED first for `A5-699-01`, `A5-699-02`, and the live
bootstrap-transport defect. Make planless epoch-1 claims and normally handed-off epoch-1 plans carry a
mechanically valid active-plan representation; make release, finalize, PR-watch, and every archive
caller stop before claim/worktree cleanup on archival refusal. Restore documented offline no-worktree
and no-in-place-branch behavior for single and bundle claims in all forge editions while retaining a
valid fail-closed claim-root anchor, including offline `NATIVE=0` and no-history cases.

Persist the settled `repair_requires_replan` envelope and source attempt under project authority before
`prepare` consumes it. Crash/retry must not lose, duplicate, substitute, or mismatch the outcome, and a
real `review_failed -> repair_requires_replan -> prepare -> planner_pending` executable case must need no
operator-authored JSON. Update focused tests and mirror each touched generated/byte-identical family in
full. Run the existing failing release/offline probes plus the focused re-plan/adaptive-node suites;
reuse the Meta validation command rather than running the full suite here.

### r3-lineage-proof-repair

Read `r1` and `r2` evidence first. RED first for `N7-699-04`, `N7-699-05`, and `N7-699-06`. A committed
child must be mechanically cross-bound to the actual immutable parent-snapshot authority and the
snapshot child row must equal the attested/transaction child identity. Refuse placeholders, arbitrary
digests, live-child substitution, and manifest-child mismatch before activation, and keep recursive
archive verification capable of detecting later corruption. Resolve the binding without mutating the
frozen parent or introducing an unverified self-host exception.

Implement the genuine diagnosis-complete, no-failed-review, cost-zero Case-B entry end to end. Validate
typed `diagnosis_complete` and recommended-shape authority, require the child citation, and ensure
untyped/repeated/writer-bearing/review-driven variants count or refuse. Add a persisted-prefix table and
deterministic injection immediately after every durable write, including all four CAS receipts. For
prepare, pre-freeze, pre-snapshot, and pre-activation, independently mutate candidate/root/frontier and
assert `replan_candidate_changed` with zero epoch and counter advance; prove one resume converges from
every valid prefix without duplicate dispatch, snapshot, count, or activation effects. Because `r2`
already edits the re-plan/schema roots, mirror the full accumulated base-to-HEAD diff into every declared
edition port. Run focused re-plan/handoff/node/plan-run tests only.

### r4-forge-contract-repair

Read `r3` evidence and its RED fixtures. Own the plan-validator half of `N7-699-04`: enforce the
non-placeholder parent-snapshot/child authority selected by `r1` and implemented by `r3`, including
transaction-bound committed validation and recursive detection, without rejecting a legitimate
pre-commit authoring phase. Also resolve `A5-699-03` by removing forge-specific CLI tokens from the
canonical comment without weakening either forbidden-token scanner. Regenerate the full four-file
plan-validator family from the accumulated root diff, then run the focused re-plan tests, both
standalone `--forbidden-only` checks against every changed plugin validator, edition sync checks, and
the focused GitLab/Gitea workflow-script tests. This is a validator/build repair over already failing
probes; do not invent a second snapshot authority.

### r5-documentation-correction

Read all writer evidence. Correct the public and architectural contract to the actual repaired
mechanics: initial active-plan state, offline claim behavior, durable repair-outcome transport,
non-placeholder child/snapshot authority, typed one-shot Case-B, exhaustive durable-prefix/CAS proof,
and fail-closed archive callers. Update `D-699-01 (existing)` and `[Unreleased]`; do not create a second
decision id. Keep issue/decision provenance in docs and changelog only, and do not present hosted CI/CD
as a gate.

### r6-code-review

Act as the named schema-2 code certifier. Review the complete candidate against all seven source
requirements, the `r1` blueprint, focused RED/GREEN evidence, cross-edition generation, and the exact
parent/child/claim lineage. Reproduce the original release/offline/forbidden-token failures and inspect
the new live review-to-planner transition, child/snapshot counterexamples, Case-B end-to-end path, and
every durable-prefix/CAS case. Reject partial assertions, compatibility laundering, manual bootstrap
requirements, frozen-plan mutation, or archive cleanup after refusal.

### r7-security-review

Act as the named schema-2 security certifier after code review. Treat claim identity, source outcome,
planner dispatch, child bytes, snapshot manifest, CAS tuples, counters, and archive lineage as security
boundaries. Attempt path/symlink/hardlink substitution, stale or replayed dispatch/outcome evidence,
candidate TOCTOU at every seam, crash-window double effects, and cleanup after verification failure.
Require fail-closed results and stable parent authority until committed activation.

### r8-falsify-lifecycle-transport

Independently try to refute `r2` by running the release/finalize/watch refusal cases, single/bundle
offline precedence including `NATIVE=0` and no-history, and the real failed-review-to-planner-pending
path without a manually seeded source file. Check crash/retry for lost, duplicate, substituted, or
mismatched source outcomes. Record a gate verdict, not implementation advice.

### r9-falsify-binding-caseb

Independently try to refute `r3` with pending/arbitrary snapshot bindings, live child replacement,
manifest-child mismatch, archive corruption, and a diagnosis-complete Case-B parent with no review
journal. Also attempt untyped evidence, absent child citation, repeated exemption, and product/config/test
writers. Record whether the claimed non-circular authority and one-shot exemption actually hold.

### r10-falsify-crash-editions

Independently execute every durable failpoint and mutate candidate/root/frontier at each of the four CAS
seams, checking zero unintended epoch/count/dispatch/snapshot effects and one-resume convergence. Then
run edition sync and both forge forbidden-only probes plus focused packaged edition tests. Try to refute
the full accumulated-diff mirror claim and record a gate verdict bound to `r2`, `r3`, and `r4`.

### r11-finalize

Finalize only after every named certifier and falsifier passes. Reuse the Meta `npm test` command once on
the final documented candidate, preserve every epoch and review/rebind receipt, and close issue #699 only
when the complete claim-preserving archive and lineage proof are durable.

## Node Ledger

| id | status |
| --- | --- |
| r1-repair-blueprint | complete |
| r2-lifecycle-transport-repair | complete |
| r3-lineage-proof-repair | complete |
| r4-forge-contract-repair | complete |
| r5-documentation-correction | complete |
| r6-code-review | pending |
| r7-security-review | pending |
| r8-falsify-lifecycle-transport | pending |
| r9-falsify-binding-caseb | pending |
| r10-falsify-crash-editions | pending |
| r11-finalize | pending |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect (r1-repair-blueprint) | subagent-invoked | evidence-binding: r1-repair-blueprint e5345fa3e0ad | |
| tdd-guide (r2-lifecycle-transport-repair) | subagent-invoked | evidence-binding: r2-lifecycle-transport-repair 2bc084fad42a | |
| tdd-guide (r3-lineage-proof-repair) | subagent-invoked | evidence-binding: r3-lineage-proof-repair ef637b74db4b | |
| build-error-resolver (r4-forge-contract-repair) | subagent-invoked | evidence-binding: r4-forge-contract-repair 9667df96675c | |
| doc-updater (r5-documentation-correction) | subagent-invoked | evidence-binding: r5-documentation-correction 7dbb4753c89a | |
