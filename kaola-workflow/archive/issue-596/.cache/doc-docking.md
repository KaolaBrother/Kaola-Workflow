# Documentation Docking — issue-596

## Changed files reviewed (impl commit 1b8f0392, 19 files)
- Code: next-action.js ×4, adaptive-node.js ×4, plan-validator.js ×4 (GENERATED_AGGREGATORS; validator = one helper export only)
- Tests: test-next-action.js (97→103), test-adaptive-node.js (1248→1310)
- Prose: docs/architecture.md, docs/api.md, docs/plan-run-cards/speculative-open.md, CHANGELOG.md, docs/decisions/D-596-01.md (new)

## Documents checked
- CHANGELOG.md — ### Added entry under [Unreleased] for #596 (consent-gated default-off, four-edition scope, test counts, D-596-01 ref). Verified accurate.
- docs/architecture.md — speculative-open story extended to the write half (leg-contained, discard-only on fail, deferral premise obsolete post-leg-isolation).
- docs/api.md — speculative-open kernel section: speculative_write_excluded reason + speculativeWriteExcluded field (no_leg_capability / overlaps_live_writer), write-axis eligibility, write-member mechanics incl. legTornDown/evidenceDiscarded/groupCleared envelope fields — transcribed from code (anti-fabrication verified by n4 against the actual emissions).
- docs/plan-run-cards/speculative-open.md — card rewritten for write members; provenance-free (grep zero hits) + forge-neutral; pinned tokens preserved (contract validators green ×4).
- docs/decisions/D-596-01.md — ADR follows D-593-01/D-595-01 structure; records the discard-only asymmetry + consent-gated default-off + auto-tier deferral.
- agents/workflow-planner.md — NOT updated by design: the plan defers the write-speculation authoring rubric to the companion default-flip issue (the .toml twins are code-producing per isDocsPath; touching them on a docs node would break G1). The rubric's read-only framing is the documented conservative interim default. No-impact reason recorded.
- README.md — no impact: no install/usage surface change (consent-gated internal scheduler capability).
- .env.example — no impact: no new env var.
- kaola-workflow/ROADMAP.md — regenerated at closure by cmdFinalize.

## Gaps found
None requiring action this run. The planner-rubric staleness is a deliberate, plan-documented deferral to the companion issue.

final verdict: DOCKED
