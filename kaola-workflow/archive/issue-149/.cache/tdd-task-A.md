# TDD Task A — GitHub Canonical Script

## Files Modified
- `scripts/kaola-workflow-claim.js` ONLY

## RED Evidence
N/A — test file updated separately in Task D.

## Changes Made

### 1. Added `WORKTREE_NATIVE` constant (line 18, after `OFFLINE`)

Before:
```js
const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';
const CLAIM_LABEL = 'workflow:in-progress';
```

After:
```js
const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';
const WORKTREE_NATIVE = process.env.KAOLA_WORKTREE_NATIVE === '1';
const CLAIM_LABEL = 'workflow:in-progress';
```

### 2. Updated provisioning gate (line 342)

Before:
```js
if (!OFFLINE && hasGitHistory(root)) {
```

After:
```js
if (!OFFLINE && WORKTREE_NATIVE && hasGitHistory(root)) {
```

## GREEN Evidence

```
WORKTREE_NATIVE const: true
Gate updated: true
Old gate removed: true
Task A GREEN
```

Smoke check exited 0.

## Deviations from Write Set
None. Only `scripts/kaola-workflow-claim.js` was modified.
