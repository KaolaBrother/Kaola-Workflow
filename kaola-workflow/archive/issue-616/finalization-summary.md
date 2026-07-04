# Finalization - Summary: issue-616

## Delivered
Follow-up to #615. The non-speculative co-open serial-degrade path in `runOpenReady`
(`scripts/kaola-workflow-adaptive-node.js`) now threads a `serialDegradeReason: 'parent_dirty'`
field onto its SUCCESSFUL-open return, mirroring the existing `speculativeWriteExcluded:
{ reason: 'parent_dirty', ... }` field on the speculative-write sibling path. The field is set
only when `parentCarriesProductionDirt()` actually caused the degrade; the fence result is
captured once and reused for both the group-formation gate and the label (no double
fence-subprocess spawn). The pre-existing single-write-node / `!legCoupled` / `groupCeiling < 2`
/ `!grp.ok` degrade causes remain byte-identical (field absent).

## Files Changed
- `scripts/kaola-workflow-adaptive-node.js` (canonical fix)
- `scripts/test-adaptive-node.js` (RED→GREEN: `#616-SERIAL-DEGRADE-TELEMETRY` extension to
  `#615-MIXED-SERIAL-LANE-DEGRADE`, plus negative-space `#616-PLAIN-SERIAL-DEGRADE`)
- `plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js` (regenerated, codex byte-twin)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js` (regenerated)
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js` (regenerated)
- `docs/api.md` (n3-docs — documented the new `serialDegradeReason` field)
- `CHANGELOG.md` (this node)

## Test Coverage
Hermetic RED→GREEN unit test added (real git repos, real `open-ready` subprocesses), plus a
negative-space companion proving the ordinary kill-switch serial degrade never carries
`parent_dirty`. `node scripts/test-adaptive-node.js`: 1416 assertions passed.
`node scripts/simulate-workflow-walkthrough.js`: passed.

## Final Validation Evidence
Self-host (npm) chain-receipt gate. `node scripts/kaola-workflow-run-chains.js --project issue-616`
run by the orchestrator against the final candidate state — all four chains green:
- `npm run test:kaola-workflow:claude` — exit 0
- `npm run test:kaola-workflow:codex` — exit 0
- `npm run test:kaola-workflow:gitlab` — exit 0
- `npm run test:kaola-workflow:gitea` — exit 0

`.cache/chain-receipt.json` codeTreeHash matches the current worktree state (includes the
`docs/api.md` and `CHANGELOG.md` finalize-node edits, both barrier-exempt/invisible doc paths
except `docs/api.md` which is test-consumed — chains were run AFTER that edit landed, so no
staleness).

## Documentation Docking
DOCKED. Evidence: `.cache/doc-docking.md`. No gaps found — `docs/api.md` and `CHANGELOG.md`
cover the sole public-surface change (an additive response field); README, architecture.md, and
.env.example are explicitly no-impact.

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | — | — | — | — |

## Follow-Up Items
(none)

## Run gaps
Clean run — `kaola-workflow-gap-sweep.js --project issue-616 --json` returned
`sweptClasses: []` (no `in_run_repair`, `deferred_red_chain`, or `manual:` gap classes to
capture); `--check` confirms `result: pass`. n2-review recorded one non-blocking LOW note
(negative-space test asserts `!== 'parent_dirty'` rather than strict field absence) explicitly
marked `action=none status=deferred` in its own evidence — not a swept gap class, no follow-up
needed.

## Closure Decision
None needed — no unresolved conflicts, partial implementation, or user-decision items. The
`decision: ask` recorded in the plan's Planning Evidence (declared write set touches
SHARED_INFRA) is audit metadata per project convention, not an approval gate.

## Commit And Push
pending final Git gate

## GitHub Issue
#616 — to be closed (acceptance criteria met: `serialDegradeReason` field added at the
non-speculative co-open site, RED→GREEN tested with a negative-space companion, code-reviewed
to a clean pass with 0 blocking findings, four-chain cross-edition green, documentation docked)

## Roadmap
updated: yes (via cmdFinalize archive step)

## Archive
pending (via cmdFinalize)

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|--------------|
| tdd-guide (plan node n1-telemetry) | invoked | .cache/n1-telemetry.md | |
| code-reviewer (plan node n2-review) | invoked | .cache/n2-review.md | |
| doc-updater (plan node n3-docs) | invoked | .cache/n3-docs.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| final-validation fix executors | N/A | | no final-validation failures occurred |
| roadmap refresh | invoked | kaola-workflow/ROADMAP.md | |
| archive completed folder | pending | | |
| final commit and push | ready | git status/git diff/upstream check | final gate runs after this file is committed |

## Status
ARCHIVED AFTER FINAL GIT GATE
