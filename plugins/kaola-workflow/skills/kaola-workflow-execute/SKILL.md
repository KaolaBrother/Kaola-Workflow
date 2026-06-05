---
name: kaola-workflow-execute
description: Use when Phase 3 plan exists and Kaola-Workflow for Codex, also called kaola-workflow, needs TDD implementation, scoped validation, and failure routing.
---

# Kaola-Workflow Execute

Phase 4 implements the plan. Use the `tdd-guide` Codex agent role for assigned implementation tasks. Record status as `subagent-invoked` in the compliance ledger if delegation occurred, `local-fallback-explicit` if the user explicitly authorized local execution, or `local-fallback-tool-unavailable` if the subagent tooling was unavailable.


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

The mechanical bookkeeping below — creating or updating
`kaola-workflow/{project}/phase4-progress.md` from the template (the `## Tasks`,
`## Failure Routing Ledger`, and `## Required Agent Compliance` rows), the
per-task `workflow-state.md` pointer moves (preserving any existing `## Sink`
block byte-for-byte), the Failure Routing Ledger row transcriptions, and the
task-completion rows that mark a task complete and advance `workflow-state.md`
to `next_skill: kaola-workflow-review {project}` — is delegated to the
mechanical `contractor` Codex agent role when that subagent is available; it
writes the durable bookkeeping files but copies the classification, route,
and validation verdict exactly as the session hands them — it never classifies
a failure, chooses a route, judges that validation passed, dispatches
`tdd-guide`, `build-error-resolver`, or any other role, acts as a gate, or asks
the user. It re-derives its own `$KAOLA_SCRIPTS` path if any script is needed,
captures real exit codes, and never gates on a piped `| tail`. The current
session keeps the `tdd-guide` and `build-error-resolver` dispatches, the
failure classification and routing decision, and the validation-passed verdict.

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
