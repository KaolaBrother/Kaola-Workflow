# TDD Task 2 — GT-1: Gitea claim script

## Result: COMPLETE

## RED Evidence
Command: `KAOLA_WORKFLOW_OFFLINE=1 node plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js stale-worktree-check`
Output: `unknown subcommand: stale-worktree-check` (exit 1)

## Changes Made
File: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`
- Lines 133-148: `extractIssueNumber(branch)` and `worktreeDirtyState(wtPath)` helpers added (regex: `/^workflow\/gitea-issue-(\d+)$/`)
- Lines 530-592: `cmdStaleWorktreeCheck()` function added after `cmdWorktreeStatus`
- Line 680: Usage string updated — appended `|stale-worktree-check`
- Line 693: Dispatch added — `if (sub === 'stale-worktree-check') return cmdStaleWorktreeCheck();`
- `module.exports`: not modified

## GREEN Evidence
Command: `KAOLA_WORKFLOW_OFFLINE=1 node plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js stale-worktree-check`
Output: `{"stale_worktrees":[],"stale_branches":[],"active_worktrees":[],"count":0}` (exit 0)

Main session smoke check: PASS

## Deviations
None.
