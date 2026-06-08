# Phase 6 - Summary: issue-287

## Delivered
Enforced planner-first entry on the adaptive path: once adaptive is selected and the target issue is known, the first issue-specific action must be dispatching `workflow-planner`; the main session may not pre-author the `## Nodes` DAG. New typed refusal `planner_control_boundary_violation` (agent-profile prose) with an unfrozen-plan validator-repair carve-out, task-list-timing tightening (only after `handoff_status: ready_to_run`), and contract-test pins of the boundary token across all editions.

## Files Changed
- agents/workflow-planner.md
- commands/kaola-workflow-adapt.md (+ gitlab/gitea mirrors)
- plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md
- scripts/validate-workflow-contracts.js (+ plugins/kaola-workflow/scripts/ byte-twin)
- scripts/validate-kaola-workflow-contracts.js
- docs/decisions/0006-planner-first-entry.md (new ADR)
- CHANGELOG.md

## Test Coverage
Hand-rolled assert harness (no coverage %). Contract pins added to 3 validators; `npm test` exercises all four editions' contract validators + walkthroughs.

## Final Validation Evidence
`npm test` (full, all four editions) — exit 0. Evidence: kaola-workflow/issue-287/.cache/final-validation.md. Adaptive barrier gates: resume=0 gate=0 barrier=pass verdict=ok.

## Documentation Docking
DOCKED — kaola-workflow/issue-287/.cache/doc-docking.md

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | — | — | — | — |

## Follow-Up Items
- R1 (non-blocking, out_of_scope/document from G1): gitlab/gitea adapt pins live in the Claude validator via the routedFixFiles cross-edition precedent — intentional, no action.

## Closure Decision
None needed — no deferred/conflict/partial/user-decision items. Issue #287 complete.

## Commit And Push
Pending final Git gate (sink: merge, branch workflow/issue-287).

## GitHub Issue
To be closed on sink-merge (#287).

## Roadmap
Closure regen on cmdFinalize.

## Archive
Pending cmdFinalize (kaola-workflow/archive/issue-287/).

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect (recon) | subagent-invoked | .cache/recon.md | |
| implementer (author-boundary/pin-contracts) | subagent-invoked | .cache/author-boundary.md, .cache/pin-contracts.md | |
| code-reviewer (G1) | subagent-invoked | .cache/code-review.md (verdict: pass) | |
| doc-updater (doc-sync) | subagent-invoked | .cache/doc-sync.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| closure advisor gate | N/A | closure scan (no decision items) | no deferred/conflict items |
| final-validation fix executors | N/A | — | validation passed first run |
| roadmap refresh | pending | cmdFinalize | |
| archive completed folder | pending | cmdFinalize | |
| final commit and push | ready | git status / branch workflow/issue-287 | final gate runs after this file is committed |

## Status
READY FOR FINAL GIT GATE
