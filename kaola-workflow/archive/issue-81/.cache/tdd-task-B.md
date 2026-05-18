# Task B Evidence — Add four regression tests

## File
`scripts/simulate-workflow-walkthrough.js`

## Changes
Four new test functions added before `testStatusShowsClosedIssueDrift`:
- `testNoTargetZeroActive` — no active folders → startup → exit 1, verdict: no_target
- `testNoTargetOneActive` — one active folder → startup → exit 1, verdict: no_target
- `testNoTargetMultipleActive` — two active folders → startup → exit 1, verdict: no_target
- `testSoleActiveRoundTrip` — plant issue-603 → status → derive issue_number → startup --target-issue 603 → verdict: owned, worktree_path non-empty

All four wired into `main()` after `testStatusShowsClosedIssueDrift()`.

## RED Evidence
N/A — Task A was already applied before Task B ran. These tests are regression guards that would have failed against the old sole-active branch code.

## GREEN Evidence
```
Workflow walkthrough simulation passed
```
Exit code: 0.

## Deviations
None. Used existing `plantActiveFolder` helper (line 257). All changes confined to write set.
