# Doc-Updater Output: issue-217

## Changed
- CHANGELOG.md — added bug fix entry under [Unreleased] / ### Fixed for issue #217:
  finalize --keep-worktree is now idempotent (exit 0 on clean index instead of crash).
  All four editions noted. Regression coverage assertion noted.

## Skipped with Reasons
- README.md: no new feature/flag/env var; --keep-worktree semantics unchanged.
- docs/api.md: no public API/subcommand/schema/exit-code contract changed.
- docs/architecture.md: no structural change.
- .env.example: no new env vars.
- Inline comments: no public interface changed.
