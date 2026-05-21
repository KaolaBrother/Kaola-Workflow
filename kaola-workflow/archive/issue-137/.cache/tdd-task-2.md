# tdd-guide Task 2 Output: GitLab guard

## Task
Add `assertBranchPushedToUpstream` to `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`.

## Result: GREEN

## Files Modified
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`

## RED Evidence
N/A — implementation-only task; tests are in Task 5 write set.

## GREEN Evidence
Function inserted at lines 101–124 (after `assertNoLiveWorkflowFolder`, before `fastForwardMain`).
Call site inserted at line 333 in `runDirectMerge()` (after `assertNoLiveWorkflowFolder(mainRoot, args.project);`, before `// Step 2 — Merge-base skip-check`).

Verified:
- `grep -n "function assertBranchPushedToUpstream"` → line 101
- `grep -n "if (!OFFLINE) assertBranchPushedToUpstream"` → line 333

## Deviations
None.
