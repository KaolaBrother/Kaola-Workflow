# Documentation Docking — bundle-677-678-679

## Changed files reviewed
- `scripts/kaola-workflow-claim.js` (+ codex/gitlab/gitea editions) — `worktreeDirtyState` fail-close (internal)
- `scripts/kaola-workflow-adaptive-node.js` (+ 3 editions) — `dropGroupBaseline` on Phase-1 aborts (internal)
- `scripts/kaola-workflow-gap-sweep.js` (+ 3 editions) — new `foreign_run_gaps_output` typed refusal
- `scripts/test-{claim-hardening,adaptive-node,gap-sweep}.js` — regressions
- `CHANGELOG.md` — #677/#678/#679 entries

## Documents checked
- `CHANGELOG.md` — UPDATED (three `[Unreleased]` entries).
- `README.md` — no impact (no feature/usage/env change).
- `docs/api.md` — no impact. The new `foreign_run_gaps_output` typed refusal follows the same not-enumerated-at-api-level convention as the #675 `project_archived` sibling (gap-sweep refusal reasons are described at the architecture/decision level — `docs/architecture.md` §Run-gap sweep gate, `docs/decisions/D-435-01.md` — not as an exhaustive api.md reason table). `'unprobeable'` is #672's already-shipped state (api.md already references it for `assertWorktreeClean`). The group-baseline abort-drop is an internal correctness detail of the already-documented group-baseline lifecycle (D-437-01, workflow-state-contract).
- `docs/architecture.md` / `docs/workflow-state-contract.md` — no structural change (existing group-baseline lifecycle unchanged in contract; only its abort-path cleanup completed).
- `.env.example` — no new env vars.
- Inline comments — updated at each fix site (all three canonical scripts carry #677/#678/#679 rationale comments).

## Gaps found and fixed
None. CHANGELOG was the only doc requiring update; done inline.

## No-impact reasons (skipped document classes)
- README / api / architecture / env / roadmap: internal fail-close + guard hardening with no public behavior, API surface, setup, or schema change.

## Final verdict
DOCKED
