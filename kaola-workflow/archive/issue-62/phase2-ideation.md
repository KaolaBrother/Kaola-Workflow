# Phase 2 - Ideation: issue-62

## Approaches Evaluated

### Option A: Cleanup inside `archiveProjectDir`
- Summary: After successful `fs.renameSync(src, dest)` in the linked worktree, compute `mainRoot = mainRootFromCoord(getCoordRoot(root))`. If `realpathSync(mainRoot) !== realpathSync(root)` AND main copy exists, `fs.rmSync` it.
- Pros: Atomic with rename; covers all 4 archive call sites (`cmdFinalize`, `cmdRelease`, `cmdWatchPr` MERGED, `cmdWatchPr` CLOSED) through one helper; `cmdWatchPr` becomes a natural no-op (`mainRoot === root`); reuses existing `mainRootFromCoord`+`getCoordRoot` plumbing.
- Cons: Slightly wider blast radius than touching `cmdFinalize` only; verify-then-delete policy must be defined precisely.
- Risk: Low-Medium (the path comparison + realpath handling is the risk surface).
- Complexity: Small — ~15 lines added to `archiveProjectDir`, plus mirror ports.

### Option B: Cleanup only in `cmdFinalize`
- Summary: After `archiveProjectDir(root, args.project, 'closed')` returns, `cmdFinalize` does its own `mainRootFromCoord` lookup and cleans the main-repo copy.
- Pros: Narrowest blast radius; literal match for Part A wording.
- Cons: Doesn't help `cmdRelease` (same bug shape — discard from linked worktree leaks too); non-atomic (rename + cleanup are two operations); doesn't address the cwd-locality class of bug for future callers.
- Risk: Medium (recurrence risk — solves symptom, leaves class).
- Complexity: Similar to A.

### Option C: Cleanup in `scripts/kaola-workflow-sink-merge.js` post-merge
- Summary: After `postMergeCleanup` succeeds in sink-merge, walk the main repo and remove `kaola-workflow/{project}/`.
- Pros: Naturally aligned with "main absorbs work" narrative.
- Cons: Wrong layer — bug is "archive is the only canonical copy," not "merge cleans up live state"; archive happens BEFORE sink-merge in standard Phase 6 ordering, so leak already poisoned the classifier; doesn't help `cmdRelease` or sink-fallback (no merge involved).
- Risk: Medium (touches the most fragile script in the system for a symptom it doesn't fully address).
- Complexity: Medium.

## Advisor Findings

The advisor confirmed Option A and locked the cheap-but-verified policy:

- Phase 6 Step 8a (artifact mirror) runs BEFORE Step 8b (`cmdFinalize`), so `linked ⊇ main` is an invariant at archive time. Defensive sentinel directory is solving a different bug.
- Discard means discard — `cmdRelease` should `rmSync`, not preserve.
- `cmdWatchPr` is a natural no-op because it already runs from main root.

Watchpoints for Phase 3:
1. Use `fs.realpathSync` on both sides of the `mainRoot === root` comparison (handles macOS `/tmp` → `/private/tmp` and `/var/folders` symlinks).
2. Verify `getCoordRoot` return shape from main worktree once with a throwaway trace before locking the comparison.
3. Do not add a `main_repo_cleanup` return field to `archiveProjectDir` — keep the return shape stable.
4. Regression test must cover three cases (not two): finalize-from-linked, main-root-caller (KAOLA_WORKTREE_NATIVE=0 equivalent), and **release-from-linked** (the test that proves Option A vs Option B — without it, the test passes for either).
5. Plugin GitLab mirror needs `mainRootFromCoord` ported first.

## Selected Approach

**Option A — cleanup inside `archiveProjectDir`, cheap-but-verified policy, three-case regression test.**

Rationale: atomicity with the rename is the discriminating constraint. Option A folds main-repo cleanup into the active-state transition itself, so every archive caller (current and future) gets the same guarantee. Phase 6 Step 8a's mirror invariant makes the cheap policy safe; the defensive sentinel solves a different (mirror-breakage) bug that should be fixed elsewhere if it ever appears.

## Out of Scope (explicit)

- No changes to `cmdWatchPr` — already runs from main root; behavior is correct.
- No changes to `scripts/kaola-workflow-sink-merge.js` — orthogonal concern.
- No new env flag — runtime path comparison is the source of truth.
- No signature or return-shape change to `archiveProjectDir`.
- No defensive `mainleak` sentinel directory.
- One-time sweep script for existing stale duplicates (AC #4 in the reopen comment) — Phase 1 research did not find any current stale duplicates in this repo (`ls kaola-workflow/` shows only `archive/` and `ROADMAP.md`). Defer to a follow-up issue if the user discovers drift elsewhere.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
