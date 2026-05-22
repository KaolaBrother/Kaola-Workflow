# tdd-task-3 — Add sc11 to simulate-workflow-walkthrough.js

## Status: GREEN

## Modified File
`scripts/simulate-workflow-walkthrough.js`

## Insertion Point
Before line 1513 (now shifted to 1543 after insertion). sc11 occupies lines 1513-1541.

## RED Evidence
N/A — coverage for existing correct behavior; code already implements archive > export > force precedence.

## GREEN Evidence
`node scripts/simulate-workflow-walkthrough.js` → printed `Workflow walkthrough simulation passed`, exited 0.
`testStaleWorktreeCleanup: PASSED` confirmed in output.
All 5 sc11 assertions held: stashed contains wtPath, exported is empty, failed_preserve empty, removed contains wtPath, wtPath no longer exists on disk.

## Deviations
None. Issue 200 used as specified.
