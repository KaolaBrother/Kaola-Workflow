# TDD Task GL-2: GitLab Test File

## Result: COMPLETE (GREEN on all new tests; pre-existing failure noted)

File modified: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`

## Changes Made

1. Fixed existing `listOpenIssues()` no-arg call at line ~334 → `listOpenIssues(tempRoot('kw-gl-list-'))`.
2. Added 3 `readPriorityConfig` unit tests using `claim.readPriorityConfig(root)`.
   - Case a: missing config → `['P0','P1']` default
   - Case b: valid array in config.json → custom labels
   - Case c: non-array → default
   - Each case uses `fs.mkdirSync(path.join(root,'kaola-workflow'), {recursive:true})` before `writeFileSync`.
3. Added discriminating priority-sort test: 4 issues (labels ['P0'], ['critical'], [], ['P2']), config `{priority_top_tier_labels:['critical']}`, asserts `[3,5,1,9]` — differs from natural order `[1,3,5,9]`.

## RED Evidence
Before GL-2 changes: `AssertionError: Expected [] to deeply equal [7, 9]` (from no-arg listOpenIssues call).

## GREEN Evidence
```
readPriorityConfig missing config: PASS
readPriorityConfig valid array: PASS
readPriorityConfig non-array → default: PASS
listOpenIssues priority sort: PASS
```

## Pre-existing Failure
`testStaleWorktreeCheck` (line 1303) fails with `AssertionError: actual:false, expected:true` — requires live GitLab auth. Added in commit `93eb6d3` (issue #148). Our diff adds 0 lines containing "testStaleWorktreeCheck" (verified). Exit code: 1 (pre-existing, not our regression).

## Deviations
None.
