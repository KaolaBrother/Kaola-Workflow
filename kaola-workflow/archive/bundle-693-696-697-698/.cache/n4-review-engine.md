evidence-binding: n4-review-engine 01af83fb4cdf
upstream_read: n1-architecture ea05782ab1d5
upstream_read: n2-profile-contracts ca71dbdf270d
upstream_read: n3-validation-runner 7eb9cc90efb9
RED: node scripts/test-adaptive-node.js -> exit 1; adaptive-node tests FAILED (15 failures, 2186 passed), with the reviewer-contract-v2 pure APIs and validator adapters absent.
GREEN: node scripts/test-adaptive-node.js -> exit 0; adaptive-node tests passed (2255 assertions).
RED: node scripts/test-adaptive-handoff.js -> exit 1; 2 new contract-version resolution failures (153 assertions passed).
GREEN: node scripts/test-adaptive-handoff.js -> exit 0; adaptive-handoff tests passed (155 assertions).
RED: node scripts/test-plan-run.js -> exit 1; 3 new shared reviewer API/export failures (20 assertions passed).
GREEN: node scripts/test-plan-run.js -> exit 0; all 23 assertions passed.
RED: node scripts/test-commit-node.js -> exit 1; 3 new plan-view/reducer/version fixtures failed (123 assertions passed).
GREEN: node scripts/test-commit-node.js -> exit 0; commit-node tests passed (126 assertions).
RED: node scripts/simulate-workflow-walkthrough.js --only testReviewerContractV2Conformance -> exit 1 before implementation because the shared classifier/reducer/version/plan-view APIs were absent.
GREEN: node scripts/simulate-workflow-walkthrough.js --only testReviewerContractV2Conformance -> exit 0; the focused scenario passed, including a real schema-2 freeze/open/close lifecycle.
RED: the real lifecycle initially refused raw `contract_version: 2` as `review_contract_version_mismatch`; the raw-text parser used `/^\\d+$/` and therefore left the version as a string even though object-only unit inputs passed.
GREEN: the raw-text parser now uses `/^\d+$/` in both identity parsers, all four editions are synced, stale candidate evidence refuses before finding/receipt/journal processing, and the real lifecycle completes discovery failure -> consumed baseline-preserving repair -> candidate-delta closure -> bound resolution -> strict-progress pass with two settled schema-2 attempts.
delegation_outcome: completed

role: tdd-guide
assigned_task: Implement the reviewer-contract-v2 schema, validator, runtime lifecycle, repair-state projection, four-edition distribution, focused RED-to-GREEN coverage, and durable n4 evidence without mutating the active frozen legacy-v1 plan or journal.
validation_verdict: focused-and-walkthrough-green

implemented_contract:
- Explicit plan schema resolution: verified field-absent frozen plans map to legacy v1; newly authored missing-version or explicit-v1 drafts refuse; explicit schema 2 selects reviewer contract and journal schema 2.
- One shared forward-reachability gate-mode classifier, runtime-neutral canonical review context, runtime-specific self-verified profile identity, exact candidate/context/profile/behavior binding, and mode-derived required evidence tokens.
- Canonical five-kind immutable finding anchors, proof-independent finding UIDs, collision checks, normalized finding sets, deterministic sequence/replicated-majority/partitioned-all reducers, validation-vector comparison, and strict review-progress/nonconvergence rules.
- Close-time anchor admission builds an authoritative Git candidate/base index, validates exact object format/mode/object/range/path membership, binds required-absence to the landable candidate, and binds evidence observations to real producer-receipt digests before a new UID is admitted.
- Schema-2 gate/G4 validation: complete gate metadata, logical common code/security certifiers, inherited virtual producers, group identity/aggregation constraints, and schema-2 validation-policy requirements.
- Open paths persist `.cache/review-contexts/<hash>.json` and carry exact contract/context/profile/candidate/gate identity in dispatch cards; close and verify recompute binding before parsing domain findings.
- Complete reviewers persist canonical normalized `.cache/review-receipts/<context>/<node>.json` sidecars. Change gates use schema-2 journal attempts and repair routing; investigation outcomes remain durable analytical receipts and never create product-repair attempts.
- Closure contexts derive the exact consumed repair delta from immutable candidate partitions. Prior UIDs cannot disappear, new blockers are admitted only through delta-bound primary/secondary anchors, unbound blockers emit durable `review_scope_expanded`, resolutions bind repair/current candidate, and replay-safe consecutive nonprogress reaches `review_nonconvergent` at two while retaining the five-repair cap.
- Schema-2 repair compares the existing declared/residue partition with the validation runner's authoritative landable digest, preserving the legacy anti-laundering baseline/rebind proof without cross-algorithm candidate mismatch.
- Every schema-2 journal read re-derives gate identity/mode, exact producer bindings, finding routes, receipt context/profile/surface identities, repair delta, reducer outcome, and progress counters from the frozen plan plus immutable receipts; self-consistent journal rewrites fail closed.
- Repair-state surfaces missing or stale schema-2 review receipts while retaining legacy verdict-gate wording for v1.
- Legacy-v1 journal validation and bytes remain unchanged; no in-place journal upgrade exists.

tests_changed:
- scripts/test-adaptive-node.js
- scripts/test-adaptive-handoff.js
- scripts/test-plan-run.js
- scripts/test-commit-node.js
- scripts/simulate-workflow-walkthrough.js
- scripts/reviewer-conformance-fixtures.json (new shared data-driven matrix)

implementation_files_changed:
- scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js
- scripts/kaola-workflow-plan-validator.js
- plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js
- scripts/kaola-workflow-adaptive-node.js
- plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js
- scripts/kaola-workflow-repair-state.js
- plugins/kaola-workflow/scripts/kaola-workflow-repair-state.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-repair-state.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-repair-state.js

commands_results:
- node scripts/test-adaptive-node.js -> exit 0; adaptive-node tests passed (2255 assertions). Expected fault-injection stderr remained: corrupt index and nonexistent gitdir probes.
- node scripts/test-adaptive-handoff.js -> exit 0; 155 assertions passed.
- node scripts/test-plan-run.js -> exit 0; 23 assertions passed.
- node scripts/test-commit-node.js -> exit 0; 126 assertions passed.
- node scripts/simulate-workflow-walkthrough.js --only testReviewerContractV2Conformance -> exit 0; focused schema-2 API plus stateful discovery/failure/repair/closure lifecycle passed.
- node scripts/simulate-workflow-walkthrough.js -> exit 0; Workflow walkthrough simulation passed.
- node scripts/edition-sync.js --check -> exit 0; 10 forge aggregator ports, 24 common-script mirrors, and 28 byte-identical groups are in parity.
- node scripts/test-edition-sync.js -> exit 0; 41 assertions passed.
- node scripts/validate-script-sync.js -> exit 0; 24 common scripts, 28 byte-identical groups, 8 rename-normalized families, 2 hooks.json families, and 7 forge export-superset families in sync.
- node scripts/test-validate-script-sync.js -> exit 0; 48 assertions passed.
- node scripts/test-opencode-edition.js -> exit 0; 525 assertions passed.
- node --check on all 16 owned implementation editions plus scripts/simulate-workflow-walkthrough.js -> exit 0.
- git diff --check -> exit 0.

preservation_proof:
- Active workflow-plan whole-file SHA-256 remained exactly `9d9ae37bf98adf96b91f36ed017814398b3aa58b21eb871ab27d8b80008af158`, matching the session-start value.
- `node scripts/kaola-workflow-plan-validator.js kaola-workflow/bundle-693-696-697-698/workflow-plan.md --resume-check --json` -> exit 0 with `ok:true`, `planHash:d2f4efb603e4952a861c2387d979a2df2d2f317de3e48d273a80aeba5ce40f05`, `plan_schema_version:1`, and `contract_version:1`.
- No active `kaola-workflow/bundle-693-696-697-698/.cache/review-attempts.json` was created.

invariants:
- Context bytes exclude runtime, profile hash, model/tool, timestamp, evidence transport, and absolute path identity.
- Evidence identity is validated against current plan, context, behavior, profile, and landable candidate before finding normalization.
- A new finding is normalized structurally only after identity binding, then its anchors are revalidated against exact Git candidate/base entries or real producer evidence; prior immutable anchors remain valid across move/delete closure under their original UID.
- Harness-owned execution status and gate effect are reserved and rejected when model-authored.
- Logical-gate reducers operate over exact member/surface sets; investigation results cannot trigger repair; change-gate failure cannot advance.
- Schema-2 receipt and journal data are canonical and version-exact; v1 and v2 never silently cross-read or upgrade one another.
- All root/Codex/GitLab/Gitea owned script families are edition-synced, including forge-specific repair-state exports.

residual_risks:
- `.cache/validation-vectors/*.json` is the deterministic runtime ingestion convention implemented here; downstream n5 guidance must tell executors to place runner receipts there when inherited validation obligations are present.
- A deliberately injected test adapter that supplies only a bare digest and no declared-path candidate partition remains fail-closed for rebind; production schema-2 open/repair paths always compute the complete partition.
- The n2 evidence records an out-of-scope generated-profile/config description mismatch; n4 did not edit or waive those config catalogs.
- Full package/four-edition release validation remains assigned to downstream validation/finalization nodes; n4 completed its focused suites, sync guards, and full walkthrough only.
