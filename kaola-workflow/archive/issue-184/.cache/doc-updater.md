# doc-updater output — issue #184

Applied per Phase 6 doc gate (changed files vs CLAUDE.md Documentation Update Checklist).

## docs/api.md
- `unresolved_closed_state` wording broadened from "times out" → "times out OR fails (e.g. auth/rate-limit/network error)" at 3 sites (Forge-call timeout bullet L34; output-schema table row ~L685; "Timeout behavior" paragraph ~L737, the last via orchestrator Trivial Inline Edit for consistency).
- `labels_skipped_reason` enum: added `"detection_timeout"` (stale-label DETECTION phase timed out, repair loop never ran; #184) distinct from repair-phase `"timeout"` — at the Label-repair bullet (~L35) and the Field-notes bullet (~L715).
- `KAOLA_GH_REMOTE_TIMEOUT_MS` env doc (~L94): appended "Non-numeric, zero, or negative values fall back to the 30000ms default (issue #184)."

## CHANGELOG.md
- Added `### Fixed` entry under `## [Unreleased]` for #184 (collectClosedSet surfaces any unverifiable probe; timeout-var validation; detection_timeout; GitLab OFFLINE guard; all four editions).

## Not touched (explicit no-impact)
- `.env.example` — env var already documented, no new var.
- README.md — no feature/usage/install change.
- architecture/conventions/workflow-state-contract docs — no structural/contract change.

Checklist verdict: docs updated where the output schema and env-var semantics changed; all other classes have no-impact reasons. See `.cache/doc-docking.md` → DOCKED.
