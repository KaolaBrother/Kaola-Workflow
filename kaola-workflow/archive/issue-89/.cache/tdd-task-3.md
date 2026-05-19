# TDD Task 3 — Implement new pipeline in sink-merge.js (issue-89)

## File Modified
`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`

## Changes
- Lines 1-11: Added `os` + claim-script requires
- Lines 13-14: Added module-level `OFFLINE` and `FORCE_FF_FAIL` env reads
- Lines 106-113: `mainRootFromCoord` helper
- Lines 115-124: `classifyMergeError` (reads FORCE_MERGE_IMPOSSIBLE at call time)
- Lines 126-183: `MAX_AUTOMERGE_RETRIES`, `doRebase`, `ffMergeLoop`, `postMergeCleanup`
- Lines 216-281: Expanded `runDirectMerge` with new pipeline + legacy skipGit branch
- Lines 283-289: Updated `main()` to propagate exitCode
- Lines 295-301: Updated `module.exports` to add `classifyMergeError`

## Deviation from spec
`permission_denied` check placed before `protected branch` in `classifyMergeError` to avoid "not allowed to push to protected branch" being matched by branch_protected before permission_denied. Correct per test assertions.

## GREEN Evidence
`node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` exits 0:
```
classifyMergeError unit tests passed
exit-2 subprocess test passed
exit-3 subprocess test passed
success-path subprocess test passed
GitLab sink tests passed
```
