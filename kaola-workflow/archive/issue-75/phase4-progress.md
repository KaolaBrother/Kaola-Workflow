# Phase 4 - Progress: issue-75

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
| 1 | Gap 1 — cmdWatchPr excludeClosedIssues | complete | scripts/kaola-workflow-claim.js | line ~559 |
| 2 | Gap 3 — cmdFinalize removeWorktree | complete | scripts/kaola-workflow-claim.js | line ~441 |
| 3 | Gap 3 — cmdRelease removeWorktree | complete | scripts/kaola-workflow-claim.js | line ~459 |
| 4 | Gap 3 — cmdWatchPr both branches removeWorktree | complete | scripts/kaola-workflow-claim.js | lines ~570,574 |
| 5 | Gap 2 code — cmdSinkFallback archived-folder guard | complete | scripts/kaola-workflow-claim.js | lines ~543-546 |
| 6 | Gap 4 — cmdStatus drift partition | complete | scripts/kaola-workflow-claim.js | lines ~466-476 |
| 7 | Mirror — copy claim.js edits to plugin | complete | plugins/kaola-workflow/scripts/kaola-workflow-claim.js | diff exits 0 |
| 8 | Gap 2 doc — phase6.md Step 8b conditional | complete | commands/kaola-workflow-phase6.md | SINK_KIND guard added |
| 9 | Gap 2 doc mirror — kaola-workflow-finalize SKILL.md | complete | plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md | |
| 10 | Gaps 5+6 doc — workflow-next.md | complete | commands/workflow-next.md | freshness recovery + co-active advisory |
| 11 | Gaps 5+6 doc mirror — kaola-workflow-next SKILL.md | complete | plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md | |
| 12 | Regression tests | complete | scripts/simulate-workflow-walkthrough.js | 4 new tests, all pass |

## Build Status
green — node scripts/simulate-workflow-walkthrough.js exits 0, all 13 tests pass

## Failure Routing Ledger
| Task | Failing Command | Classification | Routed To | Evidence | Status |
|------|-----------------|----------------|-----------|----------|--------|

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide executor tasks 1-6,12 | invoked | .cache/tdd-task-1.md | RED→GREEN validated |
| mirror task 7 | complete | diff exits 0 | Trivial copy — orchestrator applied |
| doc task 8 | complete | commands/kaola-workflow-phase6.md | Orchestrator applied per plan |
| doc task 9 | complete | plugins/.../kaola-workflow-finalize/SKILL.md | Orchestrator applied per plan |
| doc task 10 | complete | commands/workflow-next.md | Orchestrator applied per plan |
| doc task 11 | complete | plugins/.../kaola-workflow-next/SKILL.md | Orchestrator applied per plan |

## Last Updated
2026-05-18T09:20:00.000Z
