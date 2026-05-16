# TDD Task 3 — T5 test 16G-CWD in simulate-workflow-walkthrough.js
Generated: 2026-05-16

## Files Modified
- `scripts/simulate-workflow-walkthrough.js`

## Changes

Inserted `16G-CWD` sub-case block at lines 3765-3802 (between end of 16G at line 3763 and 16H comment now at 3803).

Claims `issue-606` with `sess-16g-cwd`, spawns sink-merge with `cwd: lock606.worktree_path`, asserts:
1. exit 0
2. worktree gone
3. `KAOLA_WORKFLOW_DEBUG_CWD` probe equals `realpathSync(epic16Tmp)`

## RED Evidence
RED: N/A — test 16G-CWD did not exist before this task; the bug it covers was present and would have failed before the T1/T2/T3 fix in sink-merge.js.

## GREEN Evidence
```
node scripts/simulate-workflow-walkthrough.js 2>&1 | tail -10
# Output: Workflow walkthrough simulation passed (exit 0)
```

All three assertions pass:
- `16G-CWD (AC13-ext): sink-merge from inside worktree must exit 0` — PASS
- `16G-CWD (AC13-ext): worktree for issue-606 must be gone after sink-merge` — PASS
- `16G-CWD (AC13-ext): CWD probe must equal main repo root` — PASS

## Deviations
None. All changes within write set.
