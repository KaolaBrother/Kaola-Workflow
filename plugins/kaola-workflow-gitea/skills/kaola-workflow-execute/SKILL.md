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

## Mechanical Bookkeeping (delegated to the contractor)

The per-task **judgment** stays with the current session: it dispatches the
`tdd-guide` role agent (a subagent cannot dispatch a subagent), reviews the
returned diff and RED/GREEN evidence, runs or delegates the validation command,
**classifies** any failure, and **decides** the route (`tdd-guide` vs
`build-error-resolver`) and whether validation PASSED. Once those decisions are
made, the deterministic bookkeeping around them — stamping
`kaola-workflow/{project}/phase4-progress.md` from `phase3-plan.md` (one `## Tasks`
row and one `## Required Agent Compliance` `tdd-guide executor task N` row per
Phase 3 task, all `pending`); moving the `workflow-state.md` pointer to open each
task (`step: red`, `task: N`, preserving any `## Sink` block byte-for-byte);
transcribing the orchestrator-decided Failing Command / Classification / Routed To
/ Evidence / Status into a `## Failure Routing Ledger` row; and, only after the
current session has judged validation PASSED, marking the task `complete`,
recording Files Modified, flipping its compliance row to the delegation status the
session recorded, and advancing `workflow-state.md` — is delegated to the
mechanical `contractor` Codex agent role when that subagent is available. The
contractor runs the scripts and authors the durable bookkeeping but never
dispatches `tdd-guide`/`build-error-resolver` or any role, never classifies a
failure, never chooses a route, never judges whether validation passed, and never
asks the user; it transcribes the verdicts and lists the session hands it verbatim.
Capture the task result (task number, modified-file list, evidence path, validation
verdict) in THIS session before delegating — shell state does not cross the
delegation boundary. Re-derive any needed forge script as
`$KAOLA_SCRIPTS/kaola-gitea-workflow-*.js`, capture real exit codes, and never gate
on a piped `| tail`.

When all tasks are complete, set `next_skill: kaola-workflow-review {project}`.
