---
name: kaola-workflow-execute
description: Use when Phase 3 plan exists and Kaola-Workflow for Codex, also called kaola-workflow, needs TDD implementation, scoped validation, and failure routing.
---

# Kaola-Workflow Execute

Phase 4 implements the plan. Prefer the `tdd-guide` Codex agent role for assigned implementation tasks when subagents are available. Use the current Codex session as the fallback executor when session policy, availability, or user direction prevents delegation.


## Goal Contract

Continue until all Phase 3 tasks are complete, validation evidence is recorded
for each task, failure routing is resolved, and `workflow-state.md` points to
`next_skill: kaola-workflow-review {project}`. Stop only for true external
authorization, materially user-owned choices, or ambiguity that blocks
correctness.


## Guardrails

- Stay inside the active task write set.
- Use RED -> GREEN -> REFACTOR for behavior changes.
- Do not mark a task complete while validation fails.
- Route behavior/test failures to `tdd-guide`.
- Route build/type/lint/tooling failures to `build-error-resolver`.
- Record every command, result, and evidence path.

## Progress File

Create or update `kaola-workflow/{project}/phase4-progress.md`:

```markdown
# Phase 4 - Progress: {project}

## Tasks
| # | Name | Status | Files Modified | Notes |
|---|------|--------|----------------|-------|
| 1 | name | pending | | |

## Failure Routing Ledger
| Task | Failing Command | Classification | Routed To | Evidence | Status |
|------|-----------------|----------------|-----------|----------|--------|

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide executor task 1 | pending | | |
```

## Per-Task Loop

1. Update `workflow-state.md`: `phase: 4`, `step: red`, `task: N`, `next_skill: kaola-workflow-execute {project}`.
2. RED: write or update the focused test first, then run it and capture the expected failure.
3. GREEN: implement the minimal change and run the same test until it passes.
4. REFACTOR: clean only within scope while tests stay green.
5. Run the exact validation command from `phase3-plan.md`.
6. Save raw evidence to `.cache/tdd-task-{n}.md`.
7. Mark the task complete only after validation passes.

If validation fails after GREEN or REFACTOR, classify the failure in the Failure
Routing Ledger:

- behavior, regression, coverage, or acceptance failure -> `tdd-guide`
- build, type, lint, dependency, formatting, or tooling failure -> `build-error-resolver`

When all tasks are complete, set `next_skill: kaola-workflow-review {project}`.
