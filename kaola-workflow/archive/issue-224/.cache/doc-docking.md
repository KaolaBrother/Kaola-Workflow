# Documentation Docking — issue-224

## Changed files reviewed
- 4 roadmap.js editions (#16+#17; root+Codex also #18), scripts/simulate-workflow-walkthrough.js, gitlab/gitea test-*-workflow-scripts.js

## Documents checked
- CHANGELOG.md — UPDATED: `### Fixed` bullet detailing #16+#17 filename authority, #18 unescape (root+Codex only), and the no-claim.js-edit clarification.
- README.md — no impact (internal roadmap-generation correctness; no user-facing feature/usage/env).
- docs/api.md — no impact (no new CLI/exit-code/schema; ROADMAP.md format unchanged for the common field==filename case).
- docs/architecture.md — no impact.
- docs/workflow-state-contract.md — checked: the durable-state contract is unaffected; this is a generated-mirror parsing fix. The contract already states ROADMAP.md is generated from .roadmap/issue-*.md (filename authority aligns docs with behavior — no doc change needed, but consistent).
- .env.example — no impact.
- Roadmap — no .roadmap/issue-224.md; regen no-op.

## Gaps found and fixed
- None beyond the CHANGELOG entry.

## Verdict
DOCKED
