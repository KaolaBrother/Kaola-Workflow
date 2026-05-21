# TDD Task 1 — GL-1: GitLab claim script

## Result: COMPLETE

## RED Evidence
Command: `KAOLA_WORKFLOW_OFFLINE=1 node plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js stale-worktree-check`
Output: `unknown subcommand: stale-worktree-check` (exit 1)

## Changes Made
File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- Lines 133-136: `extractIssueNumber(branch)` helper added (regex: `/^workflow\/gitlab-issue-(\d+)$/`)
- Lines 138-147: `worktreeDirtyState(wtPath)` helper added
- Lines 549-619: `cmdStaleWorktreeCheck()` function added after `cmdWorktreeStatus`
- Line 695: Usage string updated — appended `|stale-worktree-check`
- Line 708: Dispatch added — `if (sub === 'stale-worktree-check') return cmdStaleWorktreeCheck();`
- `module.exports`: not modified

## GREEN Evidence
Command: `KAOLA_WORKFLOW_OFFLINE=1 node plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js stale-worktree-check`
Output: `{"stale_worktrees":[],"stale_branches":[],"active_worktrees":[],"count":0}` (exit 0)

Main session smoke check: PASS

## Deviations
None.
