evidence-binding: n8_finalize 74b8e211216d

## Four-chain gate (#307) — all green

- npm run test:kaola-workflow:claude  → EXIT 0
- npm run test:kaola-workflow:codex   → EXIT 0
- npm run test:kaola-workflow:gitlab  → EXIT 0
- npm run test:kaola-workflow:gitea   → EXIT 0

Cross-edition diff: scripts/kaola-workflow-sink-merge.js (COMMON_SCRIPT ×4) + kaola-workflow-adaptive-node.js (GENERATED_AGGREGATOR ×4) + validate-workflow-contracts.js (COMMON_SCRIPT ×2) + ×6 prose surfaces + contractor ×4. All four chains required; claude alone insufficient (#307). All four confirmed EXIT 0 (exit codes read directly, not via tail-mask).

## CHANGELOG

Added [Unreleased] entries under ### Added:
- #429: `kaola-workflow-sink-merge.js` `--sink` mode — script-owned resumable worktree-sink transaction
- #434: sanctioned repair primitives — `revert-overflow`, `repair-node`, `requires_redispatch`

## Commit scope

Staged: n_pins (validate-workflow-contracts.js ×2), n5_doc_planrun (×6 surfaces), n6_doc_finalize (×6 surfaces), n7_doc_contractor (contractor.md + 3 tomls), n_decisions (D-429-01.md, D-434-01.md), CHANGELOG.md, kaola-workflow/bundle-429-434/ (workflow state + evidence).
