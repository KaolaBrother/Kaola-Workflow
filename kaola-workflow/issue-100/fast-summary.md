# Fast Summary: issue-100

## Status
PASSED

## Scope
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`: add `getCoordRoot`/`mainRootFromCoord` helpers, update `worktreePathFor` and `provisionWorktree` to use main worktree root
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`: add sibling-worktree regression test

## Plan
`worktreePathFor` derived the `.kw` sibling directory from the cwd `root`, which could be a linked worktree, causing nesting. Fix: mirror the GitHub script pattern — use `git rev-parse --git-common-dir` to get the coord root, derive main root from it, and use that as the base for `.kw` path computation. Also fix `provisionWorktree` to run git operations against `mainRoot` and suppress stdio to avoid bleed-through into startup JSON output.

## Implementation Evidence
- Added `getCoordRoot(root)` and `mainRootFromCoord(coordRoot)` helpers (lines 55-71 of claim script)
- Updated `worktreePathFor` to use `mainRootFromCoord(getCoordRoot(root))` (line 73-76)
- Updated `provisionWorktree` to compute `mainRoot`, use it for all git ops, change `stdio: 'inherit'` to `['ignore','ignore','ignore']`
- Added sibling-worktree regression test: creates a real git repo, adds linked worktree, runs startup from it, asserts result path is sibling not nested
- `npm run test:kaola-workflow:gitlab`: PASSED
- `node scripts/simulate-workflow-walkthrough.js`: PASSED
- `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`: PASSED

## Review
- No new packages
- No API/schema/behavior changes beyond the bug fix
- No debug statements
- Test added alongside implementation
- Matches GitHub implementation pattern

## Escalation
N/A
