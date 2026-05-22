# Phase 4 - Progress: issue-153

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

## Execution grouping (plan tasks → TDD cycles)
Plan T1+T2 are one RED/GREEN cycle (T2 is the test for T1's install behavior) → Exec Task 1.
Plan T3+T4+T5 are the same block-scoped F3 guard across 3 validators + 1 byte-identical mirror → Exec Task 2.

## Tasks
| # | Name | Status | Files Modified | Notes |
|---|------|--------|----------------|-------|
| 1 | install.sh inherit-rewrite + F2 test (plan T1+T2) | complete | install.sh, scripts/test-install-model-rendering.js | RED→GREEN proven; bash -n + simulate pass; .cache/tdd-task-1.md |
| 2 | F3 block drop-guard ×3 validators + mirror (plan T3+T4+T5) | complete | scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js | negative-test proven; 4 validators + script-sync pass; incidentally fixed pre-existing #152 mirror drift (see decisions D3); .cache/tdd-task-2.md |

## Build Status
clean — all task-level validations pass (F2 test GREEN, bash -n OK, 4 contract validators + script-sync pass, simulate exit 0)

## Failure Routing Ledger
| Task | Failing Command | Classification | Routed To | Evidence | Status |
|------|-----------------|----------------|-----------|----------|--------|

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide executor task 1 | invoked | .cache/tdd-task-1.md | |
| tdd-guide executor task 2 | invoked | .cache/tdd-task-2.md | |

## Last Updated
2026-05-22T02:30:00Z
