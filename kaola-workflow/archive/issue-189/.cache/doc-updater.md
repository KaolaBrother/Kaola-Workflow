# Doc Updater Output — issue-189

## Result: COMPLETED

## Updated
- `CHANGELOG.md` — Added [Unreleased] → ### Fixed entry documenting the case-normalization bug fix and regression test addition.

## Skipped (with reasons)
- README.md: no new features, API changes, or env vars. Fix restores already-documented correct behavior.
- docs/api.md: classifier is internal infrastructure, no contract or signature changes.
- Architecture docs: no structural changes; one-line fix in existing internal function.
- .env.example: no new environment variables.
- Inline comments: no public function signatures or interfaces changed; checkDependsOn was already private.
