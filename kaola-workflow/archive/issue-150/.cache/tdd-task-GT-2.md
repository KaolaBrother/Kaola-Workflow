# TDD Task GT-2: Gitea Test File

## Result: COMPLETE (GREEN on all new tests; pre-existing failure noted)

File modified: `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`

## Changes Made

1. Fixed existing `listOpenIssues()` no-arg call at line ~341 → wrapped in try/finally with `claim.listOpenIssues(tempRoot('kw-gt-list-'))` + cleanup.
2. Added 3 `readPriorityConfig` unit tests using `claim.readPriorityConfig(root)`.
   - Same 3-case structure as GL-2.
   - Each case uses `fs.mkdirSync` before `writeFileSync`.
3. Added discriminating priority-sort test: same 4-issue stub as GL-2, asserts `[3,5,1,9]`.

## RED Evidence
Before GT-2 changes: `AssertionError: Expected [] to deeply equal [7, 9]` (from no-arg listOpenIssues call).

## GREEN Evidence
```
readPriorityConfig missing config: PASS
readPriorityConfig valid array: PASS
readPriorityConfig non-array → default: PASS
listOpenIssues priority sort: PASS
```
GT-2 agent confirmed pre-existing failure via git stash baseline run (same SIGTERM from HEAD before any edits).

## Pre-existing Failure
`testStaleWorktreeCheck` (line 1298) — same issue as GitLab. Added in commit `93eb6d3` (issue #148). Our diff adds 0 lines containing "testStaleWorktreeCheck". Exit code: 1 (pre-existing, not our regression).

## Deviations
GT-2 agent added try/finally cleanup around the existing-call fix (consistent with file style, harmless).
