# TDD Task C2 — Cases 17G-17J + LOW-3 fix

## Files Modified

- `scripts/simulate-workflow-walkthrough.js`: added Cases 17G-17J (~60 lines after 17K block); replaced `epic17Tmp + '.kw'` with `path.dirname(pick17a.worktree_path)` in finally block (LOW-3)

## Case Results

All four cases passed immediately on first run — no claim.js behavior mismatched.

- **17G**: `cmdResume` returns `{resumed:false, reason:'cannot determine project'}` on `main` branch with no `--project`. Passed.
- **17H**: `cmdWorktreeFinalize` asserts `fs.existsSync(worktreePath)` for issue-999 — throws. Passed.
- **17I**: Dirty-check catches staged file in `kaola-workflow/{project}/`, throws. Restore + cleanup correct. Passed.
- **17J**: `phase4-progress.md` copied from main-worktree to issue worktree, committed, HEAD changed. Passed.

## GREEN Evidence

```
Workflow walkthrough simulation passed (exit 0)
```

## Deviations

None.
