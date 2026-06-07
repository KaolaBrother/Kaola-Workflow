# Documentation Docking — issue-274

## Changed files reviewed
- 6 code files (plan-validator ×4, validate-script-sync.js, simulate-workflow-walkthrough.js) + 2 docs (api.md, architecture.md) + CHANGELOG.md.

## Documents checked
- docs/api.md — UPDATED: new "Sync-group gap (#274)" refusal class added to the `kaola-workflow-plan-validator.js` Grammar paragraph; `--freeze` result-shape note that sync-group-gap refusals prevent `frozen:true` and the check runs on --freeze + default --json but not resume/gate-verify/barrier/verdict. Grounded in the shipped code.
- docs/architecture.md — UPDATED: static-floor section notes freeze now cross-checks byte-identity/sync-group obligations.
- CHANGELOG.md — UPDATED: [Unreleased] → ### Added entry for #274.
- README.md — no impact (no new install flag, env var, or user-facing command; the gate is internal validator behavior).
- docs/conventions.md, docs/workflow-state-contract.md, .env.example — no impact.
- docs/decisions/ — no ADR needed (behavior addition within the existing plan-validator contract, not a new architectural decision).

## Gaps found and fixed
None — doc-updater output verified against `git diff` and confirmed by `validate-workflow-contracts.js` (passed) + walkthrough (passed). No fabricated schema/API sections.

## Final verdict: DOCKED
