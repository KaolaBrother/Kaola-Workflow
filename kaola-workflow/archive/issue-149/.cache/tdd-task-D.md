# TDD Task D — GitHub Tests

## Files Modified

- `scripts/simulate-workflow-walkthrough.js` ONLY

## Changes Made

### Step 1 & 3 — Injected KAOLA_WORKTREE_NATIVE: '1' into helpers

Both `runClaimOnline` and `runClaimOnlineLastJson` now have `KAOLA_WORKTREE_NATIVE: '1'` as the first key after `...process.env,`, before `...(extraEnv || {})`. This means all existing tests that rely on worktree provisioning now get the flag by default. Tests can override it by passing `{ KAOLA_WORKTREE_NATIVE: '0' }` in extraEnv (since extraEnv is spread after, and KAOLA_WORKFLOW_OFFLINE: '0' only overrides the offline flag, not NATIVE).

Env block shape in both helpers after edit:
```js
env: {
  ...process.env,
  KAOLA_WORKTREE_NATIVE: '1',    // default ON for all online tests
  ...(extraEnv || {}),            // extraEnv can override WORKTREE_NATIVE
  KAOLA_WORKFLOW_OFFLINE: '0',   // hardcoded last (cannot be overridden by extraEnv)
  PATH: ...
}
```

### Step 4 — Raw bypass sites

`grep -n "env: process.env"` returned no results. There were no raw bypass sites to fix.

### Step 5 — Added testWorktreeNativeDefaultOff()

Uses `runClaimOnlineLastJson` with `{ KAOLA_WORKTREE_NATIVE: '0' }` in extraEnv. Asserts `worktree_path === ''`. Placed immediately after `testStartupJsonAndSiblingWorktrees`.

### Step 6 — Added testWorktreeNativeOfflineWins()

Uses a raw `spawnSync` (not `runClaimOnline`, which hardcodes OFFLINE=0) with both `KAOLA_WORKTREE_NATIVE: '1'` and `KAOLA_WORKFLOW_OFFLINE: '1'`. Asserts `worktree_path === ''`. Also placed after `testStartupJsonAndSiblingWorktrees`.

Both functions are registered in `main()`.

## RED Evidence

Before injecting into the helpers, the test suite failed:

```
Error: first worktree should be canonical sibling path
    at assert (.../simulate-workflow-walkthrough.js:18:25)
    at testStartupJsonAndSiblingWorktrees (.../simulate-workflow-walkthrough.js:453:5)
    at main (.../simulate-workflow-walkthrough.js:1716:5)
```

This confirms RED state: existing worktree assertions failed because `KAOLA_WORKTREE_NATIVE` was not set, resulting in `worktree_path === ''`.

## GREEN Evidence

After all edits, the full test suite passes:

```
testStaleWorktreeCheck: PASSED
testReadPriorityConfig: PASSED
testE2EGitHubMergeFullChain: PASSED
testSinkMergeRefusesLiveFolder: PASSED
testSinkMergeBlocksUnpushedCommits: PASSED
testSinkMergeOfflineSkipsPublishGuard: PASSED
testFastE2EMergeFullChain: PASSED
testE2EGitHubPrFullChain: PASSED
testParallelIssueIndependence: PASSED
Workflow walkthrough simulation passed
```

Exit code: 0.

## Deviations from Write Set

None. Only `scripts/simulate-workflow-walkthrough.js` was modified.

## Notes

- `assert.strictEqual` is not available (assert is a custom function). Used `assert(x === '', '..., got: ' + JSON.stringify(x))` instead.
- The OFFLINE-wins test must use raw spawnSync because `runClaimOnline` hardcodes `KAOLA_WORKFLOW_OFFLINE: '0'` after extraEnv (extraEnv cannot override it).
- Issue numbers 505 and 506 were chosen to not conflict with existing fixture issue numbers (501-504 are already used).
