# Fast Executor (tdd-guide) — issue-226

## Single file modified: scripts/simulate-workflow-walkthrough.js

## #27 testStartupExplicitTargetRedRefuses
plantActiveFolder(tmp,'active-project-k',70,'# Phase 3\nFiles: scripts/kaola-workflow-claim.js') + plantRoadmapIssue(tmp,71,'...also touches scripts/kaola-workflow-claim.js') → classifier red. runNode(claimScript,['startup','--target-issue','71'],tmp) (OFFLINE=1). Assert status 1, verdict==='user_target_red', claim==='none', no issue-71 folder. RED probe: claim.js:443 'red'→never-match → "startup must exit 1 for red target, got 0".

## #28a testClosureAuditExecuteLabelRemovalTimeoutBreaks
shim issue list→[91,92]; issue edit --remove-label hangs (setInterval). env KAOLA_GH_REMOTE_TIMEOUT_MS=300 (verified closure-audit.js:43). Assert labels_skipped_reason==='timeout', labels_failed.length===1 (broke before 92), labels_removed.length===0. RED probe: neutralize the killed/SIGTERM/ETIMEDOUT branch (closure-audit.js:270) → "labels_skipped_reason ... got undefined".

## #28b testClosureAuditExecuteLabelRemovalNonTimeoutFails
shim issue list→[93,94]; issue edit --remove-label exit 1 fast. default timeout. Assert labels_failed includes 93 AND 94 (no break), 'labels_skipped_reason' NOT in result.repaired (omitted when null, closure-audit.js:284), labels_removed.length===0.

## #29 testE2EGitHubMergeFullChain extension
After the first worktree-finalize (issue-850) + its assertions, before Step 4: capture git rev-list --count HEAD (cwd: worktree path); call worktree-finalize a 2nd time; assert wfResult2.finalized===true AND HEAD count unchanged (no-diff branch skips commit). RED probe: append always-commit in cmdWorktreeFinalize → "HEAD count was 4, now 5".

## Final
All production probes reverted. git diff --name-only → scripts/simulate-workflow-walkthrough.js only. node scripts/simulate-workflow-walkthrough.js exit 0 "Workflow walkthrough simulation passed".
