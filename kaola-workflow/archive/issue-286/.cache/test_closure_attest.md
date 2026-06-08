node: test_closure_attest (tdd-guide) — Fix 2 closure attestation on all receipt paths

RED→GREEN:
RED: added assertions in testWatchPrMergedClosureReceipt (scripts/simulate-workflow-walkthrough.js) — receipt.claim_planner_attested === 'missing' and receipt.finalize_contractor_attested === 'missing' on the watch-pr MERGED closure receipt. Pre-fix FAILED: "got: failed" (the stale emptyReceipt default — checkDispatchAttestations never ran on the watch-pr receipt).
GREEN: after wiring checkDispatchAttestations into both watch-pr buildClosureReceipt callers, the assertions pass — "Workflow walkthrough simulation passed".

Fix (3-line block after each buildClosureReceipt in the watch-pr loop, MERGED ~:1326 and CLOSED ~:1347 branches, before checkClosureInvariants), mirroring cmdFinalize :963-965:
  const liveCacheDir = path.join(root, 'kaola-workflow', folder.project, '.cache');
  const archiveCacheDir = archiveResult && archiveResult.dest ? path.join(archiveResult.dest, '.cache') : null;
  checkDispatchAttestations([archiveCacheDir, liveCacheDir], folderReceipt);

Applied across 4 claim.js editions:
  - scripts/kaola-workflow-claim.js (github root) — now 3 checkDispatchAttestations calls (cmdFinalize + 2 watch-pr)
  - plugins/kaola-workflow/scripts/kaola-workflow-claim.js (Codex) — BYTE-IDENTICAL to github root (verified)
  - plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js — same logical fix (state 'merged'/'closed', folder.issue_iid)
  - plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js — same logical fix (issue_iid)

regression-green: npm test exit 0 — 10 suite pass lines across all 4 editions (claude/codex/gitlab/gitea), 145 PASSED, zero failures, including validate-script-sync byte-identity of the github claim.js pair. Worktree-verified: edits in worktree, repo-root unpolluted.
