# tdd-guide Task 5 Output: Tests

## Task
Add `initGitRepoWithBareRemote`, `testSinkMergeBlocksUnpushedCommits`, and `testSinkMergeOfflineSkipsPublishGuard` to `scripts/simulate-workflow-walkthrough.js`.

## Result: GREEN

## Files Modified
- `scripts/simulate-workflow-walkthrough.js`

## RED Evidence
N/A — tests were written against already-implemented guard (sequential dependency; RED would require removing the implementation first which is not the task pattern here).

## GREEN Evidence
Full test suite run: `node scripts/simulate-workflow-walkthrough.js`
```
testSinkMergeRefusesLiveFolder: PASSED
testSinkMergeBlocksUnpushedCommits: PASSED
testSinkMergeOfflineSkipsPublishGuard: PASSED
testFastE2EMergeFullChain: PASSED
testE2EGitHubPrFullChain: PASSED
testParallelIssueIndependence: PASSED
Workflow walkthrough simulation passed
```

Added:
- `initGitRepoWithBareRemote(tmp)` helper (near line 396)
- `testSinkMergeBlocksUnpushedCommits` (around line 1127): verifies exit non-zero + "workflow/issue-911" + "unpushed" in stderr; main unchanged
- `testSinkMergeOfflineSkipsPublishGuard` (around line 1155): verifies OFFLINE=1 skips guard entirely even with no upstream tracking ref; main advances
- Both registered in `main()` after `testSinkMergeRefusesLiveFolder()`

## Deviations
None.
