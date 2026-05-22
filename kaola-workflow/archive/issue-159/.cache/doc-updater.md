# Doc Updater — issue-159

## File Changed
`CHANGELOG.md` — Added entry under `## [Unreleased]` → `### Fixed`:

> **Preserve untracked files in `stale-worktree-cleanup --export`** (issue #159): `exportWorktreeDiff()` previously used `git diff HEAD` (tracked changes only), silently losing untracked files when a worktree was dirty solely from untracked files. The function now enumerates untracked files via `git ls-files -z --others --exclude-standard` and copies them to a sibling `issue-N-{timestamp}-untracked/` sidecar directory alongside the patch file. Symlinks are skipped to prevent secret leakage into the tracked exports directory. Return type changed from `string` to `string[]`; callers spread with `push(...p)`. Applied to all four editions. Regression tests (sc9, sc10) added to all three forge test suites.

## Documentation Update Checklist

- [x] README.md — no changes needed (stale-worktree-cleanup already documented; --export behavior is internal fix)
- [x] API docs — already updated in Phase 4 (docs/api.md lines 328+340)
- [x] CHANGELOG.md — entry added under [Unreleased] → Fixed
- [x] Architecture docs — no structural change
- [x] .env.example — no new env vars
- [x] Inline comments — no public interface changes needed
