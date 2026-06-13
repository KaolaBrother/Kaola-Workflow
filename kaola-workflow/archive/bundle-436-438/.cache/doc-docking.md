# Documentation Docking — bundle-436-438

## Changed files reviewed
- scripts/kaola-workflow-adaptive-node.js ×4 editions — max_concurrent field, empty-set fallback fix
- scripts/test-adaptive-node.js — D419-INV2, D419-INV7, D419-CLOSE-FIELDSURVIVAL tests
- docs/architecture.md — coordination kernel subsection (n2)
- commands/kaola-workflow-plan-run.md + 5 plugin copies — scheduler-default-posture prose (n3)
- agents/workflow-planner.md + 3 toml twins — D-419 planner rubric (n4)
- CHANGELOG.md — entries for #436 and #438 (n6)
- docs/workflow-state-contract.md — running-set.json schema updated (doc-updater fix)

## Documents checked
- README.md — no user-facing feature/install/env change; no update needed
- docs/api.md — max_concurrent is internal manifest field, not an API contract; no update needed
- docs/architecture.md — kernel-model subsection present and accurate
- docs/workflow-state-contract.md — updated with max_concurrent? field (gap found by doc-updater, fixed)
- CHANGELOG.md — both #436 and #438 entries present; ×6 surfaces explicitly named (not ×4)
- Six plan-run surfaces — all contain D-419 P3 prose blocks with frontier unit retained
- Four planner agent profiles — all contain D-419 planner rubric paragraph

## Gaps found and fixed
- docs/workflow-state-contract.md: running-set.json schema lacked max_concurrent? field → fixed by doc-updater

## No-impact reasons for skipped document classes
- README.md: no new CLI flags, install steps, or user-visible features
- docs/api.md: max_concurrent is an internal running-set.json field, not an API contract
- .env.example: no new environment variables (max_concurrent set at runtime, not env)

## Acceptance criteria coverage
- #436 AC: max_concurrent field exists in all 4 editions, tests green, field-survival fixed ✓
- #438 AC: all 6 plan-run surfaces updated, frontier unit preserved, parallel_safe prohibition explicit ✓

## Final verdict: DOCKED
