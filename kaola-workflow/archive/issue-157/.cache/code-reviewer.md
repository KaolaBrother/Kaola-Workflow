# Code Review — Issue #157: stale-worktree-cleanup subcommand

Date: 2026-05-22

## Summary

All 4 test suites pass. 0 CRITICAL, 1 HIGH, 2 MEDIUM findings.

## Findings

### [HIGH] Silent data loss when --archive/--export preservation fails

Files: scripts/kaola-workflow-claim.js:716-734 (and 3 mirrors)

When stashWorktree or exportWorktreeDiff returns false/null (e.g., git failure, locked index, detached HEAD), control falls through to removeWorktree(..., --force), discarding uncommitted work that the user's flag was meant to save.

Suggested fix: on failed --archive/--export, skip the worktree and report it in a `failed_preserve` bucket rather than proceeding to force removal.

### [MEDIUM] Output reports `removed` even when removeWorktree failed

Files: scripts/kaola-workflow-claim.js:731-735 (and 3 mirrors)

removeWorktree return value is discarded; wt.path pushed into buckets.removed unconditionally even when removal failed. Dishonest output contract. (Note: downstream `stillRegistered` guard prevents incorrect branch deletion.)

### [MEDIUM] Cleanup-side missing-state prune and loose-branch deletion paths are untested

Files: simulate-workflow-walkthrough.js, test-gitlab-workflow-scripts.js, test-gitea-workflow-scripts.js

The 7 sub-cases all use registered on-disk worktrees. The `state === 'missing'` → git worktree prune path and the loose stale_branches deletion path lack direct test coverage. collectStale covers them indirectly via testStaleWorktreeCheck.

## Notes (no action required)

- Codex mirror is byte-identical to scripts/kaola-workflow-claim.js (verified via diff)
- removeBranch uses branch -D — correct for closed/archived stale issues; --keep-branch is the opt-out for open-PR branches
- cwdInside + fs.existsSync guard combination is correct
- The KAOLA_*_MOCK_SCRIPT shim env vars are test-only — confirmed not reachable in production
- Cross-edition consistency (GitHub/GitLab/Gitea) verified

## Status

HIGH finding must be fixed before Phase 6.
