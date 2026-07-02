# Documentation Docking — bundle-593-594-595

## Changed files reviewed (impl commit cf0d33db, 29 files)
- Code: adaptive-schema.js ×4 (byte-anchor), adaptive-node.js ×4, plan-validator.js ×4 (GENERATED_AGGREGATORS regen'd via edition-sync)
- Tests: test-adaptive-node.js (1248 assertions), test-commit-node.js (123, T463 floors re-pinned)
- Prose: six plan-run routing surfaces (3 commands + 3 SKILLs), docs/conventions.md, docs/plan-run-cards/frontier-batch.md, docs/api.md, docs/architecture.md, docs/workflow-state-contract.md, CHANGELOG.md, D-593-01/D-594-01/D-595-01 (new)

## Documents checked
- CHANGELOG.md — three entries under [Unreleased]: ### Fixed #595, ### Removed #594, ### Changed #593, each citing its ADR. Verified by n5 gate.
- Six routing surfaces — stale coarse-consent claim replaced in lockstep; PIN needles preserved (route-reachability 185 assertions green ×2 runs); forge-neutral + provenance-free (PROVENANCE_BAN scan zero hits).
- docs/api.md — batch_active reason entry removed; co-open relaxation spec matches writeOverlapRelaxable/hasUnresolvableEntry code; refusal payload shapes match (no batchState).
- docs/architecture.md — 5 stale spots fixed (co-open story now exact-path under the retained net; batch guard references corrected).
- docs/conventions.md — new exact-path-granularity + hidden-shared-surfaces planner guidance.
- docs/plan-run-cards/frontier-batch.md — default-relax reason-code coverage updated.
- docs/workflow-state-contract.md — active-batch.json bullet rewritten to the post-removal truth (follow-up fix inside n4's widened window).
- docs/decisions/ — D-593-01, D-594-01 (incl. the orient-read KEPT boundary), D-595-01 (no-takeover argument); D-580/D-578 structure followed.
- README.md — no impact: no install/usage surface change.
- .env.example / env vars — no impact: no new env var (KAOLA_PARALLEL_WRITES pre-existing).
- kaola-workflow/ROADMAP.md — regenerated at closure by cmdFinalize.

## Gaps found and fixed
- workflow-state-contract.md stale batch_active claim — caught by n4's own out-of-set sweep, fixed after write-set widening (documented in n4 evidence).

## Explicit no-impact reasons for skipped classes
- docs/investigations/2026-06-12-parallelism-v3-design.md — dated historical investigation record; deliberately not retrofitted.
- docs/api.md:752 "the batch path" — pre-existing pre-#586 straggler unrelated to the #594 diff (re-verified by n4).

final verdict: DOCKED
