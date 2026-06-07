# Phase 6 - Summary: issue-261

## Delivered
Closed the archive-pollution blind spot in the Phase-6 staging safety nets (#261, relates #231/#260). Three coordinated, defense-in-depth fixes so a stray cross-issue `kaola-workflow/archive/<other>/` can no longer reach `main` undetected:
- AC3 (headline): `--barrier-check` (`barrierCheck` in plan-validator.js) scopes the blanket `isWorkflowArtifact` exemption — a foreign-project `archive/<X>/` write is refused; the finalized project's own archive (incl. `.archived-<ts>`) stays exempt; project threaded from `projTag`; fail-closed when absent.
- AC2: `cmdFinalize` (claim.js) narrows the linked-worktree `git add -A kaola-workflow/` to explicit project-scoped staging (archive dest + rename deletion side + `.roadmap/` + `ROADMAP.md`).
- AC1: the Phase-6 Staging Guard (3 phase6.md editions) typed-blocks a staged foreign `archive/<other>/`, tolerant of the project's own `.archived-<ts>` suffix.

## Files Changed
- scripts/kaola-workflow-claim.js + plugins/kaola-workflow/scripts/kaola-workflow-claim.js (byte-identical pair)
- scripts/kaola-workflow-plan-validator.js + plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js (byte-identical pair)
- commands/kaola-workflow-phase6.md + plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase6.md + plugins/kaola-workflow-gitea/commands/kaola-workflow-phase6.md
- scripts/simulate-workflow-walkthrough.js, scripts/test-commit-node.js (regression coverage)
- docs/api.md, docs/architecture.md (contract docs)
- CHANGELOG.md ([Unreleased] ### Fixed)

## Test Coverage
Hand-rolled assertion suites (no coverage tool). New: testFinalizeNarrowStagingExcludesForeignArchive (simulate) + 4 foreign-archive assertions (test-commit-node). Full `npm test` green across all 4 editions.

## Final Validation Evidence
- Full `npm test` (claude+codex+gitlab+gitea) exit 0 — evidence: background task bqr22yam7 output; includes validate-script-sync byte-identity for both mirror pairs + gitlab/gitea contract validators.
- 4 adaptive barrier gates: resume=0 gate=0 barrier=0 verdict=0 (all pass).

## Documentation Docking
DOCKED — evidence: .cache/doc-docking.md

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | — | — | — | — |

## Follow-Up Items
- S1 (security, non-blocking): sanitize the render-time `{project}` token at its source so every phase6.md `{project}` interpolation is metachar-safe. Recorded in CHANGELOG; new issue pending user permission (.cache/advisor-closure.md).

## Closure Decision
Advisor consulted (.cache/advisor-closure.md): #261 closeable (AC met); S1 = recorded non-blocking follow-up, GitHub issue creation pending explicit user OK.

## Commit And Push
[pending final Git gate]

## GitHub Issue
pending close (#261, after merge)

## Roadmap
pending regen at cmdFinalize

## Archive
pending (kaola-workflow/archive/issue-261/)

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked | .cache/docs.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| closure advisor gate | invoked | .cache/advisor-closure.md | |
| final-validation fix executors | N/A | — | no final-validation failures |
| roadmap refresh | pending | kaola-workflow/ROADMAP.md | runs at cmdFinalize |
| archive completed folder | pending | | runs at cmdFinalize |
| final commit and push | ready | git status/diff/4-gate barrier | final gate runs after this file is committed |

## Status
READY FOR FINAL GIT GATE
