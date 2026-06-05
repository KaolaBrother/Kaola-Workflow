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

## Mechanical Bookkeeping

The deterministic bookkeeping in the per-task loop — stamping `phase4-progress.md`
from the template above when it is missing, moving the `workflow-state.md` pointer
to open each task (`phase: 4`, `step: red`, `task: N`, `next_skill: kaola-workflow-execute {project}`),
transcribing a Failure Routing Ledger row, and on a passed task marking it
`complete`, recording Files Modified / Build Status / Last Updated and advancing
the pointer to the next task or `next_skill: kaola-workflow-review {project}`
(preserving any `## Sink` block byte-for-byte) — is delegated to the mechanical
`contractor` Codex agent role when that subagent is available; it runs any needed
script (re-deriving its own `node "$KAOLA_SCRIPTS/kaola-gitlab-workflow-claim.js"`
path, capturing real exit codes and never gating on a piped `| tail`) and authors
the durable bookkeeping but never dispatches `tdd-guide`, `build-error-resolver`,
or any role, never classifies a failure, never chooses or runs the fix route,
never judges whether validation passed, and never asks the user. The current
session keeps the `tdd-guide` and `build-error-resolver` dispatches, the failure
classification, the route choice, and the "validation passed" verdict. Because the
classification, the route, and the verdict are the current session's judgment,
decide them first — pick `tdd-guide` for behavior/regression/coverage/acceptance
failures and `build-error-resolver` for build/type/lint/dependency/tooling
failures, and judge the task complete only after validation passes — then hand the
exact values (Failing Command, Classification, Routed To, Evidence path, Status;
or the Files Modified list and Build Status) into the contractor so it transcribes
them verbatim into the Failure Routing Ledger and the `## Required Agent Compliance`
rows; the contractor copies what it is given and does not restate, soften, upgrade,
or re-grade it. Because a subagent runs in its own shell, capture those values in
THIS session before delegating — they do not cross the delegation boundary.
