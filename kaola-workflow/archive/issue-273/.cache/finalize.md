# finalize — issue #273 evidence

## Files modified

- `CHANGELOG.md` only. No other files were touched.

## What was added to CHANGELOG.md

A new `### Fixed` entry was inserted in the `[Unreleased]` section, immediately after the existing G-SEL-1b (#268) entry and before the `### Wire the adaptive path into worktrees` (#264) block:

```
- **#273** — follow-up(#264): two deferred fixes:
  - **Fix 1**: `legacy-worktree-cleanup` dry-run no longer advertises `would_delete_branch`; the execute path already preserved branch refs intentionally (#264 "safe direction") — the dry-run bucket was the misleading artifact. Tests updated in all 4 editions.
  - **Fix 2**: `workflow-init` worktree-note parity — 6 `<!-- KW-CLAUDE-TEMPLATE-START/END -->` files updated from the old sibling-worktree path (`<repo>.kw/<project>/`) to the #264-canonical repo-local path (`<repo-root>/.kw/worktrees/<project>/`).
```

## What changed regarding the #264 follow-up note

The "Known minor follow-ups (deferred, not blocking)" sentence at the end of the #264 block (previously spanning both deferred items) was replaced with:

```
Both deferred items from #264 are resolved in #273.
```

The two deferred items described in that sentence — (1) `workflow-init` worktree-note parity and (2) `legacy-worktree-cleanup` dry-run `would_delete_branch` advisory mismatch — are now superseded by the #273 entry above.

## Confirmation

Only `CHANGELOG.md` was modified. No source code, scripts, tests, or other documentation files were touched.
