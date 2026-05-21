# TDD Task C — Gitea Script

## Files Modified

- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`

## RED Evidence

N/A — test file updated separately in Task F.

## Changes Made

1. Inserted `const WORKTREE_NATIVE = process.env.KAOLA_WORKTREE_NATIVE === '1';` immediately after the `OFFLINE` const declaration (line 20).
2. Changed `if (hasGitHistory(root))` to `if (!OFFLINE && WORKTREE_NATIVE && hasGitHistory(root))` at the provisioning gate (line 299).

## GREEN Evidence

```
WORKTREE_NATIVE const: true
Gate updated: true
Old bare gate removed: true
Task C GREEN
Exit code: 0
```

## Deviations from Write Set

None. Only `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` was modified.
