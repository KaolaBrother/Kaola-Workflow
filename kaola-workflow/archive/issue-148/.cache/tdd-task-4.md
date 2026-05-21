# TDD Task 4 — GT-2: Gitea tests

## Result: COMPLETE

## RED Evidence
Baseline exits 0 with "Gitea workflow script tests passed". `testStaleWorktreeCheck` was absent.
GT-1 implementation confirmed present at lines 534 and 693.

## Changes Made
File: `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- Lines 100-129: Added `runClaimOnline()` and `writeTeaShimForStale()` helpers (tea shim includes `--version` gate)
- Lines 993-1133: Added `testStaleWorktreeCheck()` with 6 sub-cases (gitea-issue- prefix)
- Line 1191: Added `testStaleWorktreeCheck();` call

## GREEN Evidence
```
testStaleWorktreeCheck: PASSED
Gitea workflow script tests passed
```
Exit 0. Main session validation: PASS.

## Deviations
None. `writeState` in GT test file writes `branch: workflow/gitea-issue-N` and `issue_number: N` as expected.
