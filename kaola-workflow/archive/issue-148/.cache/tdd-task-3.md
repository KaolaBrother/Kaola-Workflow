# TDD Task 3 — GL-2: GitLab tests

## Result: COMPLETE

## RED Evidence
Baseline exits 0 with "GitLab workflow script tests passed". `testStaleWorktreeCheck` was absent.

## Changes Made
File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- Lines 95-127: Added `runClaimOnline()` and `writeGlabShimForStale()` helpers
- Lines 996-1138: Added `testStaleWorktreeCheck()` with 6 sub-cases
- Line 1196: Added `testStaleWorktreeCheck();` call

## GREEN Evidence
```
testStaleWorktreeCheck: PASSED
GitLab workflow script tests passed
```
Exit 0. Main session validation: PASS.

## Deviations
None.
