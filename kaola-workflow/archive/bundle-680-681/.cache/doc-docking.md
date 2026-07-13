# Documentation Docking — bundle-680-681

## Changed files reviewed
- `scripts/kaola-workflow-adaptive-node.js` (+ 3 editions) — Phase-2 baseline drop + orphan-baseline reconcile sweep (internal crash-recovery)
- `scripts/kaola-workflow-gap-sweep.js` (+ 3 editions) — `foreign_run_gaps_output` guard tightening (dropped existsSync precondition)
- `scripts/test-{adaptive-node,gap-sweep}.js` — regressions
- `CHANGELOG.md` — #680/#681 entries

## Documents checked
- `CHANGELOG.md` — UPDATED (#680, #681 under [Unreleased]).
- `README.md` — no impact.
- `docs/api.md` — no impact (no new public reason enumerated at api level; `foreign_run_gaps_output` already existed from #679 and is not enumerated there — same convention as `project_archived`).
- `docs/architecture.md` — the orphan-baseline sweep extends the already-documented `reconcile-running-set` crash-repair behavior (§ running-set reconcile); it is an additive internal correctness pass, no structural/contract change.
- `docs/workflow-state-contract.md` — group-baseline lifecycle contract unchanged; only its crash-window cleanup completed.
- `.env.example` — no new env vars.
- Inline comments — updated at each fix site (Part A drop rationale, Part B sweep + the #680 REPAIR keep guard, #681 guard detail).

## Gaps found and fixed
None. CHANGELOG was the only doc requiring update; done inline.

## No-impact reasons (skipped document classes)
- README / api / architecture-contract / env / roadmap: internal crash-recovery correctness + a fail-closed guard tightening; no public behavior, API surface, setup, or schema change.

## Final verdict
DOCKED
