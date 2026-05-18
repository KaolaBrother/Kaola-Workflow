# TDD Task 1-6+12 Evidence — issue-75

## Tasks Covered
Tasks 1–6 (all code changes to scripts/kaola-workflow-claim.js) and Task 12 (regression tests in scripts/simulate-workflow-walkthrough.js).

## RED Evidence

After adding 4 regression tests to simulate-workflow-walkthrough.js and before applying any fixes, running `node scripts/simulate-workflow-walkthrough.js` produced:

```
Error: watch-pr should watch the pr-sink folder, got: {"watched":0}
    at assert (...simulate-workflow-walkthrough.js:16:25)
    at testWatchPrArchivesClosedIssuePrFolder (...)
    at main (...)
```

Root cause: `cmdWatchPr` called `readActiveFolders(root)` with default `excludeClosedIssues: true`, filtering out the folder for issue 200 (closed). Remaining 3 tests would also fail:
- Test B: no archived-folder guard in cmdSinkFallback
- Test C: no removeWorktree calls in cmdFinalize/cmdRelease
- Test D: cmdStatus returned `{ active, count }` without `drift` field

## GREEN Evidence

After applying all 6 fixes:
```
Workflow walkthrough simulation passed
```
Exit code: 0. All 13 tests pass.

## Files Modified

- `scripts/kaola-workflow-claim.js`: 6 surgical edits (Tasks 1–6)
- `scripts/simulate-workflow-walkthrough.js`: 4 new test functions + 4 main() calls (Task 12)

## Deviations

None.
