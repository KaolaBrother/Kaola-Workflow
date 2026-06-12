evidence-binding: n10-tests-walkthrough 8398b76c81b6
non_tdd_reason: cross-edition walkthrough scenario authoring over finished restructured script behavior; no single natural failing-unit-test authored first
regression-green

## Task

Author cross-edition walkthrough integration scenario tests (A/B/C/D) covering the 4 bug fixes from bundle-426-427-428-430: #426 archiveProjectDir copy-then-verify-then-delete, #427 cmdFinalize closure_receipt.closure roll-up with skipped_offline, #428 dual-root roadmap cleanup with roadmap_removed_by_root, #430 bundle_state_incoherent orient refusal. Tests added to all 6 declared-write-set walkthrough files.

## Verification Commands + Results

- `npm run test:kaola-workflow:claude` → exit 0 — "Workflow walkthrough simulation passed"
- `npm run test:kaola-workflow:codex` → exit 0 — "Kaola-Workflow walkthrough simulation passed"
- `npm run test:kaola-workflow:gitlab` → exit 0 — "GitLab workflow walkthrough simulation passed"
- `npm run test:kaola-workflow:gitea` → exit 0 — "Gitea Codex workflow walkthrough simulation passed"

All four chains green. 24 new test executions (4 scenarios × 6 walkthrough files) all passed.

## Test scenarios added

- Test A: `testFinalizeArchiveVerifiesBeforeDelete` — archive copy-then-verify-then-delete ordering (#426)
- Test B: `testFinalizeClosesIssueBundleMembers` — closure_receipt.closure roll-up with skipped_offline in OFFLINE mode (#427)
- Test C: `testFinalizeRoadmapResidueDetection` — roadmap_removed_by_root field present in reconcileRoadmapForClosure result (#428)
- Test D: `testBundleStateIncoherent` — orient subcommand refuses with bundle_state_incoherent when bundle_id set but issue_numbers absent (#430)

Note: Test D re-scoped from target_set_mismatch (unreachable via external invocation post-claim) to bundle_state_incoherent via orient — covers the #430 state-coherence requirement end-to-end.
