# TDD Task F — Gitea Tests

## Files Modified

- `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` (only)

## RED Evidence

Before edits, running the test suite produced:

```
AssertionError [ERR_ASSERTION]: startup from linked worktree must produce sibling path, not nested: got 
+ actual - expected

+ ''
- '/private/var/folders/8s/y93yqng93xb4__nl4jlh_g9c0000gn/T/kw-gt-sibling-AOoDMS.kw/issue-6'

    at .../test-gitea-workflow-scripts.js:922:12
```

The sibling worktree test (Issue #100, line ~916) was passing `env: process.env` without `KAOLA_WORKTREE_NATIVE: '1'`, so `worktreePath` was `''` instead of the expected sibling path.

## Changes Made

### Step 2 — `runClaimOnline` helper env block (line ~103)

Inserted `KAOLA_WORKTREE_NATIVE: '1'` as the first key after `...process.env,`, before the existing env spread:

```js
env: {
  ...process.env,
  KAOLA_WORKTREE_NATIVE: '1',    // inserted here
  KAOLA_WORKFLOW_OFFLINE: '0',
  PATH: binDir + path.delimiter + ...
}
```

### Step 3 — Raw bypass site at line ~917 (sibling worktree test, Issue #100)

Changed `env: process.env` to `env: { ...process.env, KAOLA_WORKTREE_NATIVE: '1' }` for the site that exercises worktree provisioning (asserts `out.worktree_path === expectedSibling`).

The other raw bypass sites (lines ~793, ~856, ~873, ~890) were not patched because:
- Line ~793: calls `kaola-gitea-workflow-repair-state.js`, not the claim script
- Lines ~856, ~873: test `no_target` paths (startup/pick-next without `--target-issue`) — these return before reaching worktree provisioning
- Line ~890: tests `owned` path (folder already exists) — returns early before provisioning

### Step 4 — Test 1: Default-OFF (Issue #149)

Added test that calls startup with `KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_WORKTREE_NATIVE: '0'` and asserts `exit 0` and `worktree_path === ''`.

### Step 5 — Test 2: OFFLINE wins over NATIVE (Issue #149)

Added test that calls startup with `KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_WORKTREE_NATIVE: '1'` and asserts `exit 0` and `worktree_path === ''`.

## GREEN Evidence

```
testStaleWorktreeCheck: PASSED
Gitea workflow script tests passed
```

Exit code: 0.

## Deviations from Write Set

None. Only `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` was modified.
