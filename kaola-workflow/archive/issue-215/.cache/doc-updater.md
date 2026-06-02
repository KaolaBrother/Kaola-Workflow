# doc-updater: issue-215

## README.md — SKIPPED
Internal bug fix; sectionBody/scanClaimedOverlap not mentioned in README; no public-facing feature/CLI/env change.

## API docs (docs/api.md) — SKIPPED
sectionBody is a private helper. No public API, schema, CLI output shape, or external contract changed.

## CHANGELOG.md — UPDATED
Added entry under [Unreleased] → ### Fixed. Describes h2-in-fence truncation bug, family-only fence tracking, mixed-marker rationale, and 3 new test functions. Content transcribed from actual source code.

## Architecture docs (docs/architecture.md) — SKIPPED
Architecture (call graph, data flow) unchanged. sectionBody change is contained within the function body.

## .env.example — SKIPPED
No new environment variables introduced.

## Inline comments — SATISFIED BY SOURCE
issue #215 comment present in all 4 classifier editions at lines 133/133/101/106. No new edits needed.
