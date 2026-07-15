verdict: DOCKED
execution_mode: main-session-inline-user-directed

- README: installation and runtime-integrity guidance now distinguishes per-profile omission from
  the user-owned root dispatch-posture setting.
- API: dispatch fields, summary rendering, parent/child proof, typed floor failures, profile
  migration, and contractor profile behavior match the candidate implementation.
- Architecture: role-profile schema, preflight migration, declarative tier metadata, runtime proof,
  and fail-closed reasoning-floor design are current.
- Decision record: D-687-01 records the chosen inheritance representation, live-proof boundary,
  migration behavior, R13 file-race closure, and preserved non-Codex behavior.
- CHANGELOG: exactly one concise #687 entry exists under `[Unreleased]`.
- Environment/setup: no dependency or `.env.example` change is required; root user-owned Codex
  settings remain explicitly outside profile migration.
- Roadmap/issue: #687 is complete and has no residual or user-decision item; normal close is the
  appropriate merge-sink disposition.

No documentation docking gap remains.
