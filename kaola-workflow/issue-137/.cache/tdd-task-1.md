# tdd-guide Task 1 Output: Primary guard

## Task
Add `assertBranchPushedToUpstream` to `scripts/kaola-workflow-sink-merge.js`.

## Result: GREEN

## Files Modified
- `scripts/kaola-workflow-sink-merge.js`

## RED Evidence
N/A — implementation-only task; tests are in Task 5 write set.

## GREEN Evidence
Function inserted at lines 92–115 (after `assertNoLiveWorkflowFolder`).
Call site inserted at line 292 in `main()` (after `assertNoLiveWorkflowFolder(mainRoot, args.project);`, before `// Step 2 — Merge-base skip-check`).

Verified:
- `grep -n "function assertBranchPushedToUpstream"` → line 92
- `grep -n "if (!OFFLINE) assertBranchPushedToUpstream"` → line 292

## Deviations
None.
