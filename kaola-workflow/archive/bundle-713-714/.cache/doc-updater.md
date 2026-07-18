# doc-updater record — bundle-713-714

doc-updater ran as plan node n2-documentation (role dispatch, subagent-invoked). Full evidence: kaola-workflow/bundle-713-714/.cache/n2-documentation.md.

## Checklist disposition (root CLAUDE.md Documentation Update Checklist)

- [x] README.md — no impact: internal repair-lifecycle/compliance-emission producer fixes; no feature list, usage, or env-var surface change
- [x] API docs — docs/api.md no impact (no runtime/preflight contract change); the operator-facing doc surface is the plan-run card: docs/plan-run-cards/reopen-complete-node.md gained section 7 "Folded review gates — the fold-boundary marker and its sanctioned recovery (#713)" (marker shape, delta synthesis, tamper fail-closedness, verbatim `review_repair_delta_unavailable` detail + both sanctioned recoveries) and a decision-tree branch for that refusal
- [x] CHANGELOG.md — one [Unreleased] ### Fixed bullet covering #713 and #714 (bundle closes together)
- [x] Architecture docs — no impact: no structure/data-flow change
- [x] .env.example — no impact: no new environment variables (KAOLA_RUN_CHAINS_TIMEOUT_MS pre-existing)
- [x] Inline comments — updated at the edit sites (fold-marker recording in runRepairNodeCore; canonical `role (node-id)` emission in addCloseCompliance; boundary normalization in spliceComplianceSection)

Anti-fabrication: every structured claim in the docs delta was checked against the shipped code by n2 (refusal detail byte-for-byte vs scripts/kaola-workflow-adaptive-schema.js deriveRepairDelta; marker shape vs scripts/kaola-workflow-adaptive-node.js runRepairNodeCore; both recovery primitives verified to exist) and independently re-verified by the n3 certifier and the n4 adversarial gate.
