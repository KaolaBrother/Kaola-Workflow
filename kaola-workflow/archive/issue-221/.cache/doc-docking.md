# Documentation Docking — issue-221

## Changed files reviewed
- plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js (new close-failure regression block)
- plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js (new close-failure regression block)

## Documents checked
- CHANGELOG.md — UPDATED: `### Fixed` bullet under `[Unreleased]` describing the new forge close-failure coverage, the subprocess-vs-withForge correction, and the no-production-change scope.
- README.md — no impact (test-only; no user-facing feature/usage/env change).
- docs/api.md — no impact (no API/schema/exit-code change; the close-failure behavior already existed and is documented; this only adds tests).
- docs/architecture.md — no impact.
- .env.example — no impact (the KAOLA_*_MOCK_SCRIPT envs are pre-existing test hooks already used by the cloned success block).
- Inline comments — covered by the in-test comments on each new block.
- Roadmap — no .roadmap/issue-221.md source; regen no-op.

## Gaps found and fixed
- None beyond the CHANGELOG entry (added).

## Verdict
DOCKED
