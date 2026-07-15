status: local-fallback-explicit
execution_mode: main-session-inline-user-directed
verdict: docs-updated

The user explicitly required no further subagent dispatch, so the main session performed the
documentation update inline after the live proof and adversarial gate passed.

Ground truth transcribed from the candidate implementation and verified evidence:

- all 48 Codex role-profile sources omit top-level `model` and `model_reasoning_effort`;
- exact legacy Sol/medium and Sol/xhigh managed pairs are migratable stale profiles, while partial
  or foreign explicit pairs are malformed;
- dispatch cards use `codex_profile_mode:'inherit'`, `parent_session` runtime sources, and retain
  standard/reasoning metadata with 20/40-minute wait budgets;
- Codex 0.144.3 persisted equal `gpt-5.6-sol`/`xhigh` parent and child turn contexts for the
  representative unpinned named-role probe; and
- reasoning-floor dispatch remains fail-closed on absent, stale, below-floor, or unclassified
  parent proof.

Updated: `README.md`, `docs/api.md`, `docs/architecture.md`, and
`docs/decisions/D-687-01.md`. The `[Unreleased]` entry in `CHANGELOG.md` docks the release-facing
summary. No undocumented schema key, enum, or CLI output was invented.
