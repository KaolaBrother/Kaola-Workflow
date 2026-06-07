# docs node evidence — issue #273

**Date:** 2026-06-07
**Node:** docs
**Write set:** `docs/api.md` only

## Changes Made

### Change 1 — Remove `would_delete_branch` from dry-run JSON block

**Location:** `docs/api.md` around L868–874 (legacy-worktree-cleanup JSON output section)

**Before:**
```json
{
  "dry_run": true,
  "would_remove": [],
  "would_delete_branch": [],
  "skipped_dirty": []
}
```

**After:**
```json
{
  "dry_run": true,
  "would_remove": [],
  "skipped_dirty": []
}
```

### Change 2 — Remove the advisory mismatch note

**Location:** `docs/api.md` around L877 (between the two JSON blocks)

**Before (removed entirely):**
```
Note: `would_delete_branch` is populated in dry-run output for each worktree that lacks `--keep-branch`, but the execute path removes only the worktree (via `git worktree remove`) and does not delete the branch ref. Branch refs are always preserved.
```

**After:** The line was deleted entirely. The mismatch no longer exists — dry-run output now matches execute behavior (Option B: drop `would_delete_branch` from dry-run). The normative statement "Branch refs are preserved" is already present in the L864 prose block and was not affected.

## Lines Not Changed

- **L864 prose:** "Branch refs are preserved (only the worktree registration and filesystem directory are removed)." — left intact, already accurate.
- **Execute JSON block (~L876–885 post-edit):** `"dry_run": false` block has no `deleted_branch` field — no change needed.
- **Fix 2 context (~L840):** `docs/api.md` already uses "repo-local `.kw/worktrees/`" wording — no change required.

## npm test Result

All test suites passed (exit 0):

- `test:kaola-workflow:claude` — all assertions passed including "Workflow walkthrough simulation passed"
- `test:kaola-workflow:codex` — "Kaola-Workflow walkthrough simulation passed"
- `test:kaola-workflow:gitlab` — all assertions passed

No test failures. Docs-only change does not affect any test.

## Files Touched

- `docs/api.md` — only file modified
- No other files were touched
