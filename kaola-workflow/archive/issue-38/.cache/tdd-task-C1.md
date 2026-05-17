# TDD Task C1 — Bug fix + Case 17K + phase4 contract check

## Files Modified

- `commands/kaola-workflow-phase4.md` line 63: replaced `git rev-parse --show-toplevel` with `git worktree list --porcelain | awk '/^worktree /{print substr($0,10); exit}'`
- `scripts/validate-workflow-contracts.js` line 329: added `assertIncludes('commands/kaola-workflow-phase4.md', "git worktree list --porcelain");`
- `scripts/simulate-workflow-walkthrough.js` lines 4804-4809: added Case 17K block with `fs.realpathSync(epic17Tmp)` comparison

## RED Evidence

After C1-C (validator check added) but before C1-A (phase4.md fix):
```
Error: commands/kaola-workflow-phase4.md must include: git worktree list --porcelain
```
`node scripts/validate-workflow-contracts.js` exited 1.

## GREEN Evidence

After all 3 edits applied in order (C1-C → C1-A → C1-B):
- `node scripts/validate-workflow-contracts.js` → `Workflow contract validation passed` (exit 0)
- `node scripts/simulate-workflow-walkthrough.js` → `Workflow walkthrough simulation passed` (exit 0)

Both confirmed independently by main-session validation run.

## Deviations

None.
