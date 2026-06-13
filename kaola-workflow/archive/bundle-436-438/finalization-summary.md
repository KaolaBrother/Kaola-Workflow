# Finalization - Summary: bundle-436-438

## Delivered

**#436 (D-419 P1):** `max_concurrent` optional integer field added to `running-set.json`, set at OPEN time as `min(cap, --max || cap)` — never at freeze time, never hashed. Absence implies 1 (fail-closed). `runReconcileRunningSet` caps roll-forward re-opens at `ceiling − liveStable`. `runCloseNode` and `runCloseAndOpenNext` empty-set fallbacks fixed to spread `...running` so unknown top-level fields survive. Three new tests: D419-INV2 (byte-identity: open-next never writes running-set.json), D419-INV7 (crash-resume: reconcile honors the ceiling), D419-CLOSE-FIELDSURVIVAL (field survival in empty-set fallback).

**#438 (D-419 P3):** Scheduler-default-posture prose propagated to all six plan-run surfaces (3 Claude commands/SKILL + 3 Codex SKILL packs, #400 ×6 contract). New `Scheduler-default posture (D-419 P3)` and `Planner rubric (D-419 P3)` blocks added. D-419 planner rubric paragraph added to `agents/workflow-planner.md` + 3 `.toml` twins: rewards wide independent frontiers, names serial as the degraded fallback, prohibits hand-authoring `parallel_safe` ([INV-17]).

## Files Changed

- scripts/kaola-workflow-adaptive-node.js ×4 editions
- scripts/test-adaptive-node.js
- docs/architecture.md
- commands/kaola-workflow-plan-run.md + 5 plugin plan-run surfaces
- agents/workflow-planner.md + 3 workflow-planner.toml twins
- CHANGELOG.md
- docs/workflow-state-contract.md (running-set.json schema updated)

## Test Coverage

503/503 test-adaptive-node.js assertions pass. All four chains green.

## Final Validation Evidence

- npm run test:kaola-workflow:claude → exit 0
- npm run test:kaola-workflow:codex  → exit 0
- npm run test:kaola-workflow:gitlab → exit 0
- npm run test:kaola-workflow:gitea  → exit 0
- --resume-check / --gate-verify / --barrier-check / --verdict-check → all exit 0
- Evidence: .cache/final-validation.md

Reuse boundary: n5 code-reviewer ran 4-chain verification through n4; the finalize-node CHANGELOG/docs-contract edit is docs-only and outside the rerun trigger. All four chains re-verified at finalization.

## Documentation Docking

DOCKED — .cache/doc-docking.md. One gap found and fixed (docs/workflow-state-contract.md running-set.json schema missing max_concurrent? field).

## Final Validation Failure Ledger

| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| N/A — all validation passed | | | | |

## Follow-Up Items

None. All ACs fully satisfied. No deferred items.

## Closure Decision

No deferred items, partial implementation, or unresolved conflicts. Both #436 and #438 fully implemented per D-419-01 spec. Close both issues.

## Commit And Push

Pending final Git gate.

## GitHub Issue

To be closed: #436 and #438 (bundle all-or-nothing closure).

## Roadmap

To be updated after closure.

## Archive

Pending contractor Step 8b.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked | .cache/doc-updater.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| final-validation fix executors | N/A | .cache/final-validation.md | No failures |
| roadmap refresh | pending | kaola-workflow/ROADMAP.md | runs in contractor Step 8b |
| archive completed folder | pending | | runs in contractor Step 8b |
| final commit and push | ready | all four chains green | final gate runs after this file is committed |

## Status
ARCHIVED AFTER FINAL GIT GATE
