evidence-binding: n7-code-review 9048526cf76d
verdict: fail
findings_blocking: 0
finding: id=A5-699-01 scope=in_scope action=fix status=open severity=high fix_role=tdd-guide rationale=fresh-schema2-claims-cannot-archive-and-release-reports-false-success
finding: id=A5-699-02 scope=in_scope action=fix status=open severity=high fix_role=tdd-guide rationale=offline-claims-provision-worktrees-in-all-forge-editions
finding: id=N7-699-04 scope=in_scope action=fix status=open severity=high fix_role=tdd-guide rationale=child-and-snapshot-digests-are-not-cross-bound
finding: id=N7-699-05 scope=in_scope action=fix status=open severity=high fix_role=tdd-guide rationale=case-b-entry-and-evidence-contract-are-not-implemented
finding: id=N7-699-06 scope=in_scope action=fix status=open severity=high fix_role=tdd-guide rationale=durable-crash-prefix-and-cas-seam-proof-is-incomplete
finding: id=A5-699-03 scope=in_scope action=fix status=open severity=medium fix_role=build-error-resolver rationale=generated-forge-validators-contain-forbidden-cli-tokens

# Findings

## HIGH — A5-699-01: fresh schema-2 claims cannot archive, and non-finalize callers continue after refusal

- **Locations:** `scripts/kaola-workflow-claim.js:708-727`, `scripts/kaola-workflow-adaptive-handoff.js:543-561`, `scripts/kaola-workflow-replan.js:1724-1800`, `scripts/kaola-workflow-claim.js:2956-3008`, and `scripts/kaola-workflow-claim.js:3808-3828`.
- **Mechanism:** every fresh claim persists `plan_epoch: 1`, `active_plan_hash: none`, and no snapshot. Ordinary initial-plan handoff writes only the separate `## Planning Evidence plan_hash` field; it never updates the schema-2 epoch field. `verifyAllEpochSnapshots` nevertheless always reads `workflow-plan.md` for schema-2 state and requires its stored hash to equal `active_plan_hash`. A planless claim fails because the file is absent; a normally planned fresh claim fails because the live hash cannot equal `none`. `cmdFinalize` correctly stops on this verifier, but `cmdRelease` ignores `archived:false/archive_incomplete:true`, removes other claim resources, and emits `released:true`; the PR watcher likewise continues worktree/claim cleanup after a failed archive.
- **Reproduction:** `node scripts/simulate-workflow-walkthrough.js --only testClaimStatusRelease --only testReplanRuntimeFence699` exits 1 at `scripts/simulate-workflow-walkthrough.js:138` with `released folder should leave active set`. The state/handoff counterexample above shows the same refusal after an ordinary frozen first plan.
- **Violated criterion:** invariant 8 and acceptance criteria requiring scheduler/finalize/archive safety, crash-resumable state agreement, and preservation of the complete epoch chain. This also regresses the normal initial claim lifecycle before any re-plan exists.
- **Owner/slice:** n2 claim/state/archive transaction slice plus n4 initial-handoff/caller integration.
- **Acceptance condition:** planless epoch-1 claims with zero snapshots and normally handed-off epoch-1 plans must both have a mechanically valid active-plan representation; archive verification must succeed for those valid states, and every archive caller must stop and report failure without worktree/claim cleanup when archival is refused. The focused release and finalize/watch caller tests must cover both states.

## HIGH — A5-699-02: offline worktree suppression is broken in GitHub, GitLab, and Gitea

- **Locations:** `scripts/kaola-workflow-claim.js:1136` and `scripts/kaola-workflow-claim.js:1333`; `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js:912` and `:1070`; `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:916` and `:1072`; documented contract at `docs/api.md:182-194`.
- **Mechanism:** the candidate removed `!OFFLINE` from every single-issue and bundle worktree-provisioning guard. Offline mode with Git history now creates a real hidden worktree, contrary to the shipped API. The newly unconditional claim-root capture also makes the documented offline/NATIVE=0 or no-history repo-root shape unable to satisfy a feature-branch identity without a compatible anchor path, so simply restoring tests without reconciling anchor semantics is insufficient.
- **Reproduction:** all of the following exit 1 and observe a nonempty `.kw/worktrees/<project>` path where `''` is required: `node scripts/simulate-workflow-walkthrough.js --only testWorktreeNativeOfflineWins` (`scripts/simulate-workflow-walkthrough.js:6238`), `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` (`test-gitlab-workflow-scripts.js:2428`), and `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` (`test-gitea-workflow-scripts.js:1853`).
- **Violated criterion:** explicit v1/normal-startup compatibility, claim-shape preservation, all-edition behavior parity, and the acceptance requirement that local edition walkthroughs pass.
- **Owner/slice:** n2 claim-anchor/provision/rollback slice, mirrored by n4 edition integration.
- **Acceptance condition:** offline mode must retain its documented no-worktree/no-in-place-branch behavior in all three forge editions (single and bundle) while fresh claim-root anchors remain valid and fail-closed; the existing GitHub/GitLab/Gitea offline-precedence fixtures and an offline NATIVE=0/no-history claim fixture must pass.

## HIGH — N7-699-04: the promoted child and immutable snapshot are not mechanically cross-bound

- **Locations:** `scripts/kaola-workflow-plan-validator.js:1181-1193`, `scripts/kaola-workflow-replan.js:1360-1387`, `scripts/kaola-workflow-plan-validator.js:2028-2056`, `scripts/kaola-workflow-replan.js:1556-1624`, `scripts/kaola-workflow-replan.js:1667-1714`, and `scripts/kaola-workflow-replan.js:2275-2287`; confirming test fixture at `scripts/test-replan.js:163-191`.
- **Mechanism:** schema-2 validation explicitly accepts `parent_snapshot_manifest_digest: pending`; child validation requires only a truthy value; committed binding validation never compares it with `transaction.snapshot.manifest_digest`. The passing happy path therefore promotes an unbound placeholder. Separately, after `child_frozen`, resume verifies only transaction-stored child bytes. Because the project folder is excluded from candidate CAS, replacing live `workflow-plan.next.md` before resume does not trip CAS. `buildSnapshot` copies those replaced live bytes, writes `manifest.child.digest` from the different transaction-stored child, and `verifySnapshotManifest` checks file rows only—it never requires the `workflow-plan.next.md` row to equal `manifest.child.digest`. Activation then promotes the transaction child while the immutable parent snapshot contains a different child artifact.
- **Reproduction/counterexample:** `node scripts/test-replan.js` passes all 496 assertions while its child factory writes literal `pending` at `scripts/test-replan.js:175`, proving the placeholder is accepted through commit. For the second seam: stop at the existing `after_child_frozen` failpoint, replace `workflow-plan.next.md` with any regular file, and resume. Lines 2280-2287 validate the stored child but snapshot the live replacement; lines 1619-1623 and 1667-1714 leave the mismatch accepted.
- **Violated criterion:** frozen parent/child path-and-digest authority, planner-only child authorship, complete immutable snapshot/rebind lineage, and the architecture requirement at `kaola-workflow/issue-699/.cache/n1-epoch-architecture.md:493` that the child carry `parent_snapshot_manifest_digest` and the validator recompute every binding.
- **Owner/slice:** n2 transaction/snapshot authority plus n4 child validator/handoff integration.
- **Acceptance condition:** a committed child must carry a non-placeholder, mechanically verified binding to its actual immutable parent snapshot authority, and the snapshot's child file row must be identical to the attested/transaction child identity. Placeholder, arbitrary digest, live-child substitution, and manifest-child mismatch cases must refuse before activation and remain detectable by recursive archive verification.

## HIGH — N7-699-05: the one-shot diagnosis-to-build Case B cannot enter legitimately and does not enforce its evidence contract

- **Locations:** `scripts/kaola-workflow-replan.js:473-547`, `scripts/kaola-workflow-replan.js:565-644`, `scripts/kaola-workflow-replan.js:960-990`, `scripts/kaola-workflow-replan.js:1367-1393`, and `scripts/test-replan.js:1179-1221`.
- **Mechanism:** every `prepare` first calls `readSource`, which requires a settled failed review attempt plus `replan-source.json.result: repair_requires_replan`. A valid diagnosis-only parent with terminal `diagnosis_complete` evidence and no unresolved review attempt therefore cannot start Case B at all. Conversely, when a synthetic failed-review source is supplied, `verifyCaseBProof` hashes arbitrary regular artifact bytes but never validates typed `diagnosis_complete` content or a bound recommended-shape contract, and child validation never requires the child to cite the diagnosis artifact. The test uses generic `{terminal:true}` JSON and tests only the helper, not a real cost-0 prepare/commit.
- **Reproduction/counterexample:** a schema-2 parent satisfying `planned_transition: diagnosis_to_build`, completed investigation writers, the four digest-bound terminal artifacts, and no review journal reaches `readSource` and returns `replan_source_journal_missing`/`replan_source_outcome_missing` before Case-B proof. In the opposite direction, the existing fixture at `scripts/test-replan.js:1194-1215` demonstrates untyped generic JSON is accepted as Case-B proof.
- **Violated criterion:** issue #699 section 7 and acceptance criterion “Valid one-shot Case-B handoff is exempt”; specifically the required `diagnosis_complete` source, no unresolved review, typed recommended-shape evidence, child citation, one-shot cost zero, and review-driven reasons costing one.
- **Owner/slice:** n2 Case-B source, accounting, packet, and child-binding slice.
- **Acceptance condition:** a genuine diagnosis-complete parent with no failed review must complete one end-to-end cost-0 prepare/planner/commit path; the exact typed diagnosis and recommended-shape authority must be validated and cited by the child. Untyped artifacts, review-driven sources, missing citation, product/config/test writers, repeats, and unresolved review must use cost 1 or refuse as specified.

## HIGH — N7-699-06: deterministic crash-prefix and four-CAS seam proof is incomplete

- **Locations:** durable prefixes in `scripts/kaola-workflow-replan.js:1002-1006`, `:2197-2207`, `:2231-2248`, `:2282-2287`, `:2317-2322`, and `:2431-2437`; crash tests at `scripts/test-replan.js:808-938`; CAS mutation test at `scripts/test-replan.js:773-805`.
- **Mechanism:** the crash tests cover the handoff-to-child journal gap, reauthoring, and activation/cleanup prefixes, but do not inject the existing preparation, state-fence, planner-packet, child-seed, pre-freeze-CAS, snapshot-rename, parent-archived, dynamic fence, or consent-ledger failpoints. More importantly, the durable `pre_snapshot` and `pre_activation` CAS transaction writes have no deterministic post-write failpoint at all. Candidate mutation is exercised only at pre-freeze; the suite merely observes that all four successful receipts exist, rather than proving mutation/refusal/no-counter-advance independently at every seam.
- **Reproduction:** comparing `fireFailpoint` sites in `scripts/kaola-workflow-replan.js` with the literal failpoint targets in `scripts/test-replan.js:808-938` shows the omitted prefixes; lines 2282-2287 and 2317-2322 show the two durable CAS writes with no post-write hook. `node scripts/test-replan.js` passing 496 assertions therefore does not establish the issue's exhaustive crash/CAS acceptance claim.
- **Violated criterion:** invariant 8 and acceptance criteria “Crash after every durable write rolls forward idempotently via one resume command” and “Candidate mutation at each CAS seam yields replan_candidate_changed with no epoch advance.”
- **Owner/slice:** n2 transaction engine and focused test matrix, with n4 caller/fence integration coverage.
- **Acceptance condition:** maintain an executable persisted-prefix table with deterministic injection immediately after every durable write (including all four CAS receipts), and prove from every prefix that one resume converges without duplicate epoch/count/dispatch/snapshot effects. Independently mutate candidate/root/frontier at prepare, pre-freeze, pre-snapshot, and pre-activation and assert the typed mismatch plus zero epoch/counter advance.

## MEDIUM — A5-699-03: generated forge validators fail their own forbidden-token contract

- **Locations:** `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js:65-68`, `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js:65-68`; scanner contracts at `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js:45-58` and `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js:45-57`.
- **Mechanism:** a generated comment says `no gh/glab/tea tokens`. GitLab's standalone scanner forbids `gh`; Gitea's forbids `glab`. Byte/rename parity correctly propagates the canonical comment, so each installed forge validator fails its own native contract before behavioral proof.
- **Reproduction:** `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js --forbidden-only plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js` exits 1 on `/\bgh\b/`; the equivalent Gitea command exits 1 on `/\bglab\b/`.
- **Violated criterion:** all-edition generated/install contract proof and the required local four-edition validation chain.
- **Owner/slice:** n4 canonical validator/generation and edition contract slice.
- **Acceptance condition:** the canonical/generated source must remain genuinely forge-neutral without weakening the established forbidden-token scanners; both standalone probes, edition parity, and packaged forge validation must pass.

# Verdict

**BLOCK.** Five HIGH in-scope defects and one MEDIUM in-scope edition defect remain open. `findings_blocking: 0` reflects that no finding was classified CRITICAL; the six column-0 `scope=in_scope action=fix status=open` records independently block the mechanical verdict gate.

# Review coverage and evidence

- Reviewed the full candidate against base `d59b191c925c634a36a74592ac9a9d21dfc93982`, issue #699 and comments, frozen plan/node brief, n1-n6 evidence, canonical transaction/schema/claim/handoff/validator/caller paths, the copied live `bundle-693-696-697-698` conformance fixture, and all generated/install/routing families.
- `node scripts/test-replan.js` — PASS, 496 assertions, including the copied live legacy-bundle transaction. It does not cover the blockers above and positively demonstrates the accepted `pending` snapshot placeholder.
- `node scripts/simulate-workflow-walkthrough.js --only testClaimStatusRelease --only testReplanRuntimeFence699` — FAIL at `testClaimStatusRelease` (`released folder should leave active set`).
- `node scripts/simulate-workflow-walkthrough.js --only testWorktreeNativeOfflineWins` — FAIL; offline GitHub claim returns a real worktree path.
- GitLab and Gitea packaged workflow-script suites — FAIL at their offline-wins fixtures before reaching the new re-plan smoke.
- GitLab/Gitea standalone `--forbidden-only` plan-validator probes — FAIL on `gh`/`glab` respectively.
- `node scripts/edition-sync.js --check` — PASS (12 generated aggregators, 25 common mirrors, 27 byte-identical groups); `node scripts/validate-script-sync.js` — PASS; `node scripts/generate-routing-surfaces.js --check` — PASS; install-manifest single-source test — PASS; route reachability — PASS (1037 assertions).
- `git diff --check d59b191c925c634a36a74592ac9a9d21dfc93982` and the frozen plan `--resume-check` — PASS.
- Per the node brief, the recorded full `npm test` chain was not rerun during this read-only review.
