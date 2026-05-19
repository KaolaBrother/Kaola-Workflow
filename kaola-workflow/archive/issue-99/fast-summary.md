# Fast Summary: issue-99

## Status
PASSED

## Scope
Files changed:
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` — remove no-target auto-claim paths, add worktree_path to owned response
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` — add regression tests

Acceptance: `npm run test:kaola-workflow:gitlab` exits 0

## Plan
1. `cmdStartup()`: remove sole-active-folder shortcut (lines ~305-309), always return `no_target` when no `--target-issue`
2. `cmdStartup()`: add top-level `worktree_path` to explicit owned response (mirror GitHub line 381 pattern)
3. `cmdPickNext()`: remove sole-active-folder path and auto-pick-first-issue path; always return `no_target` without `--target-issue`
4. Add 3 regression tests mirroring GitHub: no-target startup, explicit-target owned, pick-next no-target

## Implementation Evidence
- `npm run test:kaola-workflow:gitlab` — exit 0
- `node scripts/simulate-workflow-walkthrough.js` — exit 0
- `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` — exit 0 ("GitLab workflow script tests passed")
- 3 new regression tests added and passing

## Review
PASSED — no debug statements, no security concerns, changes confined to stated write set. All 3 AC verified.

## Escalation
N/A
