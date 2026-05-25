# Phase 4 - Progress: issue-161

## Operational Guardrails

Phase 4 is subagent-executed.

Main session may:
- inspect diffs
- run small targeted validation commands
- delegate expensive or noisy validation
- classify failures
- update progress/evidence files
- delegate follow-up fixes
- apply the Trivial Inline Edit Exception

Main session must not:
- write implementation fixes inline except under the Trivial Inline Edit Exception
- write or rewrite tests inline except under the Trivial Inline Edit Exception
- mark a task complete while validation fails

Failure routing:
- behavior/test failure -> tdd-guide
- build/type/lint/tooling failure -> build-error-resolver
- scope/write-set violation -> stop or escalate
- emergency inline fallback -> only with explicit user authorization

## Tasks
| # | Name | Status | Files Modified | Notes |
|---|------|--------|----------------|-------|
| 1 | Create canonical closure-contract module | complete | scripts/kaola-workflow-closure-contract.js | require() pass |
| 2 | Copy to plugins/kaola-workflow/scripts/ | complete | plugins/kaola-workflow/scripts/kaola-workflow-closure-contract.js | diff clean |
| 3 | Copy to plugins/kaola-workflow-gitlab/scripts/ | complete | plugins/kaola-workflow-gitlab/scripts/kaola-workflow-closure-contract.js | diff clean |
| 4 | Copy to plugins/kaola-workflow-gitea/scripts/ | complete | plugins/kaola-workflow-gitea/scripts/kaola-workflow-closure-contract.js | diff clean |
| 5 | Append Closure Contract to docs/api.md | complete | docs/api.md | 22 fences (even), grep pass |
| 6 | Add cross-ref to docs/workflow-state-contract.md | complete | docs/workflow-state-contract.md | grep pass |
| 7 | Add BYTE_IDENTICAL_GROUPS entry to validate-script-sync.js | complete | scripts/validate-script-sync.js | "2 byte-identical file groups in sync" |
| 8 | Add assertConcept guard to validate-workflow-contracts.js + sync Codex copy | complete | scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js | validation pass, diff clean |
| 9 | Add assertConcept guard to validate-kaola-workflow-contracts.js | complete | scripts/validate-kaola-workflow-contracts.js | "Kaola-Workflow Codex contract validation passed" |
| 10 | Full validation gate | complete | — | All 5 commands pass |

## Build Status
clean

## Failure Routing Ledger
| Task | Failing Command | Classification | Routed To | Evidence | Status |

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide executor task 1-4 | complete | .cache/tdd-task-1-4.md | |
| tdd-guide executor task 5-6 | complete | .cache/tdd-task-5-6.md | |
| tdd-guide executor task 7 | complete | .cache/tdd-task-7.md | |
| tdd-guide executor task 8 | complete | .cache/tdd-task-8.md | |
| tdd-guide executor task 9 | complete | .cache/tdd-task-9.md | |

## Last Updated
2026-05-25T09:16:00.000Z
