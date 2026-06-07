# Doc-Updater Report — Issue #273

**Date:** 2026-06-07
**Scope:** Documentation update check for issue #273 (follow-up to #264): Fix 1 (legacy-worktree-cleanup dry-run/execute mismatch) + Fix 2 (workflow-init worktree-note parity)

---

## Checklist Results

### 1. README.md — verified-no-change-needed

Searched README for `legacy-worktree-cleanup`, `would_delete_branch`, `worktree`, and `.kw/worktrees`.

Findings:
- Line 904: `repo-local worktree at <repo-root>/.kw/worktrees/<project>/` — correct post-#264 path
- Line 929: `Worktrees live at <repo-root>/.kw/worktrees/<project>/` — correct
- Lines 948–952: `legacy-worktree-cleanup` description is accurate (dry-run by default, `--execute` to perform, branch refs preserved) — consistent with Fix 1

No changes needed.

### 2. API docs (`docs/api.md`) — verified-no-change-needed (already updated by docs node)

Verified the `legacy-worktree-cleanup` section (lines 838–885):
- Dry-run JSON block (lines 868–873): contains only `dry_run`, `would_remove`, `skipped_dirty` — `would_delete_branch` is absent. Correct.
- Execute JSON block (lines 876–885): contains `dry_run: false`, `removed`, `skipped_dirty`, `stashed`, `exported`, `failed_preserve` — no `deleted_branch` field. Correct (branch refs are preserved).
- Line 864 prose: "Branch refs are preserved (only the worktree registration and filesystem directory are removed)." Consistent with Fix 1.

Note: `would_delete_branch` at line 790 is in the adjacent `stale-worktree-cleanup` section (line 731 header) — that command legitimately deletes branches and the field is correct there. Not touched.

No additional changes needed.

### 3. CHANGELOG.md — verified-no-change-needed (already updated by finalize node)

Verified `[Unreleased]` section contains the #273 entry:
- Lines 15–17: Fix 1 (dry-run `would_delete_branch` removal) and Fix 2 (6 workflow-init files updated) both recorded.
- Line 29: "Both deferred items from #264 are resolved in #273."

No changes needed.

### 4. Architecture docs (`docs/architecture.md`) — verified-no-change-needed

Searched for `legacy-worktree-cleanup`, `would_delete_branch`, sibling worktree description, and old path patterns.

Line 605 (key scripts table): `legacy-worktree-cleanup` listed with accurate description. No stale sibling path or `would_delete_branch` reference found.

No changes needed.

### 5. `.env.example` — UPDATED (additional stale reference found beyond Fix 2 enumeration)

The `.env.example` `KAOLA_WORKTREE_NATIVE` comment (line 27) still described the worktree as "per-issue sibling worktree" — stale after #264 which moved worktrees to the repo-local `.kw/worktrees/` path.

This was not in the Fix 2 enumeration of 6 files (which covered `commands/workflow-init.md` and `plugins/*/skills/kaola-workflow-init/SKILL.md` + `plugins/*/commands/workflow-init.md`), but it is in scope for Fix 2's theme: correcting prose that describes current default behavior using the old sibling path.

A repo-wide grep confirmed this was the only remaining production file with a stale `sibling worktree` description (excluding: CHANGELOG history, `legacySiblingWorktreePathFor()` helper names, test assertion comments referencing legacy-path tests, `docs/investigations/` historical document, and `kaola-workflow/issue-273/.cache/` work-in-progress evidence files).

Change made:
```
Before: # Worktree-native mode: ON by default — issue claims provision a per-issue sibling worktree. Set to 0 to disable (opt out).
After:  # Worktree-native mode: ON by default — issue claims provision a per-issue repo-local worktree at `<repo-root>/.kw/worktrees/<project>/`. Set to 0 to disable (opt out).
```

File: `/Users/ylpromax5/Workspace/Kaola-Workflow/.env.example`, line 27.

### 6. Inline comments — skipped (no public interface changes)

Fix 1 is a dry-run output field removal (behavioral fix, already captured in docs/api.md and test assertions). Fix 2 is a path string update in CLAUDE.md template files. Neither introduces new public interfaces or changes function signatures.

---

## Summary of changes made in this run

| File | Change |
|------|--------|
| `/Users/ylpromax5/Workspace/Kaola-Workflow/.env.example` | Updated `KAOLA_WORKTREE_NATIVE` comment: "sibling worktree" → "repo-local worktree at `<repo-root>/.kw/worktrees/<project>/`" |

---

## Final Verdict: COMPLETE

All checklist items verified. One additional stale reference found and corrected beyond the pre-enumerated Fix 2 files. No fabricated content — all findings sourced from direct file reads.
