# Review Fix 1 — HIGH: silent data loss on failed preserve

Date: 2026-05-22
Routed to: tdd-guide

## Finding addressed
HIGH: When stashWorktree or exportWorktreeDiff fails, code fell through to removeWorktree, discarding uncommitted work.

## Fix applied

### 1. All 4 claim files (GitHub, Codex mirror, GitLab, Gitea)

Added `failed_preserve: []` to execute-path buckets.

In state=dirty block with --archive or --export:
- On preservation failure: push to `failed_preserve`, `continue` (skip removeWorktree)
- On success: existing stashed/exported bucket behavior unchanged

Fixed MEDIUM finding (dishonest removed output) in same pass:
- Capture `removeWorktree` return value
- Only push to `buckets.removed` / `removedBranches.add` when `rmResult.removed === true`

### 2. Test sub-case 8 added (simulate-workflow-walkthrough.js + both plugin test files)

Execute-archive-fail: dirty worktree + `--execute --archive` with stash blocked by git lock file.
Asserts: `failed_preserve` includes wtPath, `removed` does NOT include wtPath, disk file still exists.

## Validation

- TDD RED confirmed before fix
- TDD GREEN confirmed after fix
- node scripts/validate-script-sync.js: 9 common scripts in sync
- npm test: all 4 suites pass (claude/codex/gitlab/gitea)
- test-gitlab-workflow-scripts.js: PASSED
- test-gitea-workflow-scripts.js: PASSED
