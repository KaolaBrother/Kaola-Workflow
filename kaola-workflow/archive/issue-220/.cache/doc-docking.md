# Documentation Docking — issue-220

## Changed files reviewed
- scripts/validate-script-sync.js (added 'resolve-agent-model module copies' BYTE_IDENTICAL_GROUP; removed the entry from COMMON_SCRIPTS)

## Documents checked
- CHANGELOG.md — UPDATED: added `### Fixed` bullet under `## [Unreleased]` describing the guard, the COMMON_SCRIPTS→group move, strict-superset rationale, and the out-of-scope npm-chain note.
- README.md — no impact (no user-facing feature/usage/env change; internal dev-tooling validator only).
- docs/api.md — no impact (no API/schema/CLI-output/exit-code change; validator behavior on success unchanged, only coverage broadened).
- docs/architecture.md — no impact (no structural change).
- .env.example — no impact (no new env vars).
- Inline comments — no impact (no public interface change).
- Roadmap — no .roadmap/issue-220.md source file exists; ROADMAP regen is a no-op ("No active work").

## Gaps found and fixed
- None beyond the CHANGELOG entry (added).

## Verdict
DOCKED
