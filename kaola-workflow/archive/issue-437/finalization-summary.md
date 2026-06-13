# Finalization - Summary: issue-437

## Delivered
Lane-attributed disjoint write co-open behind `KAOLA_LANE_CONTAINMENT` with a GROUP-scoped close barrier (D-419 Part 2). Fixes the ADR's broken close-side story by deferring the diff barrier to the last group member, using the union of member write sets as the allowlist. All four settlements shipped: (1) lane group in running-set.json, (2) member close deferred barrier, (3) --parallel-safe pairwise-disjointness stamp, (4) group barrier on last-member close. Flag-OFF invariant (INV-6) upheld — serial path byte-identical when KAOLA_LANE_CONTAINMENT is OFF.

## Files Changed
- scripts/kaola-workflow-plan-validator.js (+ plugins byte-pair + 2 forge ports) — --parallel-safe, --group-barrier, barrierCheck opts.groupMembers
- scripts/kaola-workflow-adaptive-node.js (+ plugins byte-pair + 2 forge ports) — tryFormLaneGroup, runOpenReady co-open path, closeGroupMember, runCloseNode group detection
- scripts/kaola-workflow-parallel-batch.js (+ plugins byte-pair + 2 forge ports) — runStatus laneGroup surface
- scripts/test-commit-node.js — 85 assertions (T-PS-1..5, T-GB-1..6 + mutation bite check)
- scripts/test-adaptive-node.js — 623 assertions (8 D437-LANE-GROUP cases)
- scripts/test-parallel-batch.js — 214 assertions (LG1/LG2/LG3)
- docs/decisions/D-437-01.md (NEW)
- docs/architecture.md, docs/api.md, docs/workflow-state-contract.md, CHANGELOG.md

## Test Coverage
All four chains green: claude=0, codex=0, gitlab=0, gitea=0. test-commit-node 85 assertions, test-adaptive-node 623 assertions, test-parallel-batch 214 assertions.

## Final Validation Evidence
- All 4 adaptive barrier gates passed (resume=0, gate=0, barrier=0, verdict=0)
- npm run test:kaola-workflow:{claude,codex,gitlab,gitea} all exit 0
- Evidence: kaola-workflow/issue-437/.cache/final-validation.md
- Reuse boundary: covers code/test impact through n8-finalize; n7-docs CHANGELOG/docs are docs-only, outside re-run trigger

## Documentation Docking
DOCKED — kaola-workflow/issue-437/.cache/doc-docking.md

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | — | — | — | — |

## Follow-Up Items
- R1 (advisory, non-blocking): `open-ready` `Math.max(2,groupCeiling)` floors a lane group to 2 even when `--max 1` is passed under containment. Documented in D-437-01.md. No safety violation. Filed for future cleanup.

## Closure Decision
No blocking deferred items. R1 advisory documented. Issue #437 eligible to close.

## Commit And Push
Pending final Git gate.

## GitHub Issue
To be closed (#437).

## Roadmap
To be updated (kaola-workflow/.roadmap/issue-437.md to be removed, ROADMAP.md regenerated).

## Archive
Pending (kaola-workflow/archive/issue-437.archived-*).

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked (n7-docs node) | .cache/doc-updater.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| final-validation fix executors | N/A | | No final validation failures |
| roadmap refresh | pending | kaola-workflow/ROADMAP.md | performed by contractor Step 8b |
| archive completed folder | pending | | performed by contractor Step 8b |
| final commit and push | ready | all four chains green, git status clean | final gate runs after this file |

## Status
ARCHIVED AFTER FINAL GIT GATE
