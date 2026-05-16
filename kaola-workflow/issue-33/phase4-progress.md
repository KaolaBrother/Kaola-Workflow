# Phase 4 - Progress: issue-33

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
| 1 | mainRootFromCoord helper + coordRoot hoist + pre-chdir + exit handler (T1/T2/T3) | complete | scripts/kaola-workflow-sink-merge.js | Single agent for all three sequential sink-merge tasks |
| 2 | Shell-side CWD restoration in phase6.md (T4) | complete | commands/kaola-workflow-phase6.md | Independent of task 1 |
| 3 | Test 16G-CWD sub-case (T5) | complete | scripts/simulate-workflow-walkthrough.js | Depends on task 1 |

## Build Status
clean

## Failure Routing Ledger
| Task | Failing Command | Classification | Routed To | Evidence | Status |
|------|-----------------|----------------|-----------|----------|--------|

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide executor task 1 | invoked | .cache/tdd-task-1.md | |
| tdd-guide executor task 2 | invoked | .cache/tdd-task-2.md | |
| tdd-guide executor task 3 | invoked | .cache/tdd-task-3.md | |

## Last Updated
2026-05-16T00:00:00.000Z
