# Advisor Gate — Issue #34 Plan

## Verdict

Blueprint (architect.md) is structurally sound. Two gaps require a revision:
1. GC threshold: 24h → 30 minutes
2. Sweep second pass must add a phase-artifacts-empty safety guard

Design A (linked-worktree finalize at Step 8b) is confirmed viable.

## Item 1 — Design A Invocation Site (CONFIRMED VIABLE)

**Evidence collected:**
- `commands/kaola-workflow-phase6.md` lines 555-577: Step 8 commits via `git -C "$ACTIVE_WORKTREE_PATH"` (linked worktree)
- Step 9 dispatches `sink-merge.js`
- `scripts/kaola-workflow-sink-merge.js` line 62: `git rebase origin/main` before ff-only merge
- After rebase, the linked worktree's Step 8 commit (rename issue-34/ → archive/issue-34/) sits on top of latest main commits → ff-only merge succeeds
- Rename detection works: Step 8a copies latest content (high similarity), Step 8b renames — git detects rename during rebase replay

**Resolution:** Design A is correct. The architect's blueprint placing cmdFinalize between Step 8a and Step 8 (in linked worktree) is valid. No invocation-site change required.

Note: `e37ace0` (chore: archive issue-33 workflow folder) was a manual cleanup on main BEFORE cmdFinalize existed — it is not a design template.

## Item 2 — GC Threshold (CHANGE REQUIRED)

**Architect blueprint:** 24h cutoff for sweep second pass GC
**Issue #34 body:** "expired more than N minutes ago (default 30?)" — concrete example: issue #2 expired 10h+ ago
**Recommendation:** Use 30 minutes (matching issue specification)

**Resolution:** Change `24 * 60 * 60 * 1000` to `30 * 60 * 1000` in the sweep second pass cutoff.

## Item 3 — Phase-Artifacts-Empty Safety Guard (CHANGE REQUIRED)

**Architect blueprint:** GC predicate = `status: active` + no lock file + `expires:` > threshold
**Issue #34 body:** GC should trigger only when "phase artifacts are empty (only workflow-state.md exists)"
**Risk without guard:** Sweep could GC an in-progress project whose heartbeat missed a tick — real work lost

**Resolution:** Add to sweep second pass predicate: skip if any `phase*.md` file exists in the dir. This limits GC to "claimed and died before Phase 1 began" cases, matching the issue's concrete Bug 3 example (issue #2: only workflow-state.md, no artifacts).

## Item 4 — coordRoot vs root Separation in Plugin Copy (NO CHANGE)

Plugin's `getCoordRoot()` (line 91) uses `git rev-parse --git-common-dir` — correct for all worktrees. Plugin lacks `KAOLA_COORD_ROOT` env override but that override is only needed for test isolation (main-only feature). No backfill required.

`cmdFinalize` called as `(cd "$ACTIVE_WORKTREE_PATH" && node "$CLAIM_JS" finalize ...)`:
- `getRoot()` returns linked worktree root → `archiveProjectDir` operates on linked worktree's kaola-workflow/
- `getCoordRoot()` returns shared .git dir → lock check finds the correct lock file

Both plugin and main copies work correctly.

## Item 5 — Idempotent Re-entry (CONFIRMED)

Architect correctly specifies `{skipped: 'source-missing'}` when srcDir is absent. cmdFinalize must treat this as exit-0 success (resume safety). No change to blueprint needed — verify in implementation.

## Summary of Required Architect Revision

| Change | Priority | Scope |
|--------|----------|-------|
| GC threshold: 24h → 30 minutes | HIGH | cmdSweep second pass in both claim.js files |
| Add phase-artifacts-empty guard | HIGH | cmdSweep second pass in both claim.js files |
| No invocation-site change | N/A | Design A confirmed correct |
| No coordRoot backfill | N/A | Plugin copy works as-is |
