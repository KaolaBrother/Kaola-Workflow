# Documentation Docking — issue-579

## Changed code/config/test/workflow files reviewed
- Engine: kaola-workflow-{adaptive-schema,active-folders,classifier,claim,sink-merge,adaptive-node}.js (canonical + codex twin + 2 forge ports each).
- Tests: test-claim-hardening.js, test-adaptive-node.js, simulate-workflow-walkthrough.js + forge/codex walkthroughs + test-{gitlab,gitea}-workflow-scripts.js.
- Prose: issue-scout (md + 3 tomls); adapt/finalize command + skill surfaces (16 files).

## Documents checked
- docs/workflow-state-contract.md — NEW `main_root`/`session_marker`/`claim_ts` fields documented (claim-time-only) + LANE_STALENESS_MS + four-bucket lane_bucket table. Contract-validator-parsed (in `validation_test_consumes`); landed at n4 before the chain gate.
- docs/conventions.md — co-tenant lane convention + clean-check selectivity rule.
- docs/architecture.md — single main-root authority + four-bucket lane-classification model + precedence ladder.
- docs/decisions/D-579-01.md — new ADR (three moves, minimal-seatbelt decision, classifier, resolver home, retired-field-collision avoidance).
- CHANGELOG.md — [Unreleased] entry for #579 (written by the finalize node, chain-asserted, before the receipt chains).

## Gaps found and fixed
None. Every public behavior change (new state fields, lane classifier, clean-check selectivity, single main-root authority, recorded-root readback) is reflected in the appropriate document.

## No-impact reasons for skipped document classes
- README.md — no install/usage/env-var surface change (internal engine hardening); no update needed.
- docs/api.md — no external API/event/schema contract change beyond the workflow-state fields (covered in workflow-state-contract.md).
- .env.example — no new environment variables (KAOLA_SESSION_MARKER / KAOLA_COTENANT are runtime signals documented inline + in conventions, not config-file env).

## Final verdict
DOCKED
