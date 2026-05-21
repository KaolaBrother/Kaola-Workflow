# TDD Task E — GitLab Tests

## Files Modified

- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` (ONLY)

## Changes Made

### Step 2 — Injected `KAOLA_WORKTREE_NATIVE: '1'` into `runClaimOnline` helper

Added `extraEnv` parameter and inserted `KAOLA_WORKTREE_NATIVE: '1'` as first key after `...process.env,`, before `...(extraEnv || {})` spread. `KAOLA_WORKFLOW_OFFLINE: '0'` remains last so it always wins over extraEnv.

### Step 3 — Fixed raw bypass site at line ~919-921 (sibling worktree test)

Changed `env: process.env` to `env: { ...process.env, KAOLA_WORKTREE_NATIVE: '1' }` in the sibling worktree test that exercises worktree provisioning.

### Step 4 — Added Test 1: default-OFF

Added test using `initGitRepo` + raw `spawnSync` with `KAOLA_WORKFLOW_OFFLINE: '0'` and `KAOLA_WORKTREE_NATIVE: '0'`. Asserts exit 0 and `worktree_path === ''`.

### Step 5 — Added Test 2: OFFLINE wins over NATIVE

Added test using `initGitRepo` + raw `spawnSync` with `KAOLA_WORKFLOW_OFFLINE: '1'` and `KAOLA_WORKTREE_NATIVE: '1'`. Asserts exit 0 and `worktree_path === ''`.

## RED Evidence

Before injecting `KAOLA_WORKTREE_NATIVE: '1'` into the sibling worktree test, the test suite failed with:

```
AssertionError [ERR_ASSERTION]: startup from linked worktree must produce sibling path, not nested: got 
+ actual - expected

+ ''
- '/private/var/folders/8s/y93yqng93xb4__nl4jlh_g9c0000gn/T/kw-gl-sibling-AuEvAo.kw/issue-6'
```

This confirmed RED — Task B's gate change (`if (!OFFLINE && WORKTREE_NATIVE && hasGitHistory(root))`) made `worktree_path` empty when `KAOLA_WORKTREE_NATIVE` was not set.

## GREEN Evidence

After all edits:

```
$ node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js 2>/dev/null; echo "EXIT: $?"
testStaleWorktreeCheck: PASSED
GitLab workflow script tests passed
EXIT: 0
```

## Deviations from Write Set

None. Only `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` was modified.
