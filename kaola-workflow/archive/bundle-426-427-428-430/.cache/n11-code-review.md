verdict: pass
findings_blocking: 0
evidence-binding: n11-code-review e684bbc18e70

finding: id=R1 scope=in_scope action=none status=resolved severity=low fix_role=none rationale=walkthrough-scenario-name-testStartupRefusesTargetSetMismatch-actually-exercises-adaptive-node-orient-coherence-guard-not-cmdStartup-mismatch-refusal-cosmetic-only
finding: id=R2 scope=out_of_scope action=none status=open severity=info fix_role=none rationale=verifyArchiveComplete-checks-only-workflow-state.md-not-all-files-acceptable-since-copyDir-throws-on-any-copyFileSync-failure-before-verify

## Summary
APPROVE. The bundle implements four bug fixes (#426 destructive-finalize, #427 close+idempotency,
#428 dual-root roadmap cleanup, #430 bundle-claim coherence) across claim.js, sink-merge.js,
closure-contract.js, adaptive-handoff.js, adaptive-node.js and walkthroughs, in all four editions.
All five core byte-pairs (root <-> codex twin) are byte-identical. Forge ports (gitlab/gitea) carry
every new symbol with correct forge abstraction. All four edition test chains green
(claude=0 codex=0 gitlab=0 gitea=0), bundle-state (37) + bundle-finalize (102) tests pass,
route-reachability passes (32 assertions). No CRITICAL or HIGH findings. Two LOW/INFO non-blocking
notes recorded.

## Findings

### Correctness — PASS
- #426 archive-before-delete ordering is data-loss-safe. In archiveProjectDir linked-run branch:
  copyDir (synchronous, throws on any copyFileSync failure) -> verifyArchiveComplete -> early
  `return {archive_incomplete:true}` WITHOUT deleting if verify fails -> only then fs.rmSync(src)
  and the guarded mainLive removal. No path deletes the live source before a verified copy exists.
  The mainLive removal is additionally guarded by `fs.realpathSync(mainLive) !== dest` (in-place
  collision protection). copyDir errors propagate (no swallowing wrapper), so a partial copy fails
  closed before reaching the delete.
- #427 closeIssueIdempotent is genuinely idempotent: probe-before-close returns 'already_closed'
  without a second close; on a close throw it re-probes and returns 'already_closed' if the issue
  is now closed (handles the probe->close race), else 'failed'. Label removal is wrapped in its own
  try/catch and does NOT affect the return — a label-removal failure after a successful close still
  returns 'closed' (the durable op succeeded; the advisory claim label is best-effort). Verified.
- #427 bundle close-token recompute (lines 2034-2038) produces correct tokens: all-closed->closed,
  some-failed->partial, all-failed->failed (verified by direct simulation of the branch logic).
- #427 sink-merge probe-before-close guard correctly skips the redundant close when cmdFinalize
  already closed the issue, while preserving the #396.5 already-closed-on-exit-1 fallback inside
  the else branch.
- #430 coherence checks (handoff + adaptive-node orient) refuse on bundle_id-present-but-
  issue_numbers-absent and on bundle_id<->issue_numbers mismatch. The expectedId format
  ('bundle-' + numeric-sorted-join) exactly matches how claim.js constructs bundle_id (project =
  'bundle-' + numeric-sorted targets at line 1160). Edge cases verified by simulation: issue_numbers
  missing / empty-string / "0" all refuse; scalar (no bundle_id) skips the check; out-of-order or
  wrong-value members are caught.

### Security — PASS
No external input parsing beyond existing patterns, no crypto, no user-data handling, no shell
interpolation (all forge calls use execFileSync argv arrays / forge abstraction). No concerns.

### Idempotency — PASS (see #427 above)

### Edge cases — PASS (issue_numbers empty/missing/"0" all handled; see #430 above)

### Test coverage — PASS
Four new claude walkthrough scenarios are real subprocess/direct-call tests, not shallow asserts:
testFinalizeArchiveVerifiesBeforeDelete (linked-worktree archiveProjectDir direct call, asserts
source survives + archive_incomplete), testFinalizeClosesIssueBundleMembers (real finalize CLI,
asserts closure.skipped_offline rollup), testFinalizeRoadmapResidueDetection (real finalize, asserts
roadmap_removed + on-disk removal), testStartupRefusesTargetSetMismatch (real adaptive-node orient
CLI, asserts refuse/bundle_state_incoherent for absent + mismatched cases). The codex twin carries
parallel testCodex* scenarios for all four issues. bundle-state.js (37) and bundle-finalize.js (102)
also pass.

### Non-blocking notes
- R1 (LOW): walkthrough fn name `testStartupRefusesTargetSetMismatch` actually exercises the
  adaptive-node orient coherence guard (#430), not the cmdStartup target_set_mismatch refusal. The
  test is valid; only the name is slightly misleading. Cosmetic — not worth a repair cycle.
- R2 (INFO): verifyArchiveComplete checks only workflow-state.md presence, not every copied file or
  content integrity. Acceptable: copyDir is synchronous and throws on any copyFileSync failure
  before verify is ever reached, so a silent partial copy that drops a non-state file is not a
  reachable failure mode; the verify is a secondary net on the load-bearing terminal-state file.

## Byte-pair checks
Root <-> codex twin (plugins/kaola-workflow/scripts/...), all IDENTICAL:
- kaola-workflow-claim.js: IDENTICAL
- kaola-workflow-sink-merge.js: IDENTICAL
- kaola-workflow-closure-contract.js: IDENTICAL (also identical to gitlab + gitea copies — shared file)
- kaola-workflow-adaptive-handoff.js: IDENTICAL
- kaola-workflow-adaptive-node.js: IDENTICAL
Forge ports (gitlab/gitea) correctly DIFFER (forge-named files) and carry every new symbol
(closeIssueIdempotent, verifyArchiveComplete, target_set_mismatch, roadmap_removed_by_root,
anchored_root, bundle_state_incoherent) with forge-correct abstraction (gitlab forge.closeIssue/
forge.updateIssue + issueIid; gitea issueNumber). The codex-twin walkthrough is a distinct smaller
smoke harness (historically not a byte-pair of the claude walkthrough) and adds parallel testCodex*
scenarios.

## Validation evidence
- node scripts/test-bundle-state.js: 37 tests passed (exit 0)
- node scripts/test-bundle-finalize.js: 102 tests passed (exit 0)
- node scripts/simulate-workflow-walkthrough.js: passed (exit 0), incl. all four new scenarios
- node scripts/test-route-reachability.js: passed, 32 assertions (exit 0)
- npm run test:kaola-workflow:{claude,codex,gitlab,gitea}: claude=0 codex=0 gitlab=0 gitea=0
  (cross-edition diff -> all four chains green, run sequentially)
