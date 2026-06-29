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

## Boundary: the session decides, the script mutates

The deterministic Phase 4 bookkeeping — stamping `phase4-progress.md` from the
template below when it is missing, moving the `workflow-state.md` pointer to open
each task, transcribing a Failure Routing Ledger row, and on a passed task marking
it `complete`, recording Files Modified / Build Status / Last Updated and advancing
the pointer to the next task or `next_skill: kaola-workflow-review {project}`
(preserving any `## Sink` block byte-for-byte) — is owned by the full-path Phase 4
transaction script `kaola-gitlab-workflow-phase4-advance.js`, not a
subagent. The script captures real exit codes, never gates on a piped `| tail`,
and copies the classification, route, and validation verdict exactly as the session
hands them — it never dispatches `tdd-guide`, `build-error-resolver`, or any role,
never classifies a failure, never chooses or runs the fix route, never judges
whether validation passed, and never asks the user. The current session keeps the
`tdd-guide` and `build-error-resolver` dispatches, the failure classification, the
route choice, and the "validation passed" verdict. Because the classification, the
route, and the verdict are the current session's judgment, decide them first — pick
`tdd-guide` for behavior/regression/coverage/acceptance failures and
`build-error-resolver` for build/type/lint/dependency/tooling failures, and judge
the task complete only after validation passes — then hand the exact values
(Failing Command, Classification, Routed To, Evidence path, Status; or the Files
Modified list and Build Status) into the transaction on stdin so it transcribes
them verbatim into the Failure Routing Ledger and the `## Required Agent Compliance`
rows; the script copies what it is given and does not restate, soften, upgrade, or
re-grade it.

## Setup

Resolve `$KAOLA_SCRIPTS` before the first transaction call:

```bash
KAOLA_SCRIPTS="plugins/kaola-workflow-gitlab/scripts"
if [ ! -f "$KAOLA_SCRIPTS/kaola-gitlab-workflow-phase4-advance.js" ]; then
  KAOLA_SCRIPTS="$(dirname "$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow-gitlab/*/scripts/kaola-gitlab-workflow-phase4-advance.js' -print -quit 2>/dev/null)")"
fi
```

## Progress File (script-owned transaction)

Authoring `phase4-progress.md` is mechanical bookkeeping owned by the transaction
script: it stamps the template below from `phase3-plan.md` (one `## Tasks` row and
one `## Required Agent Compliance` `tdd-guide executor task N` row per Phase 3
`### Task N:` block, all status `pending`; empty Failure Routing Ledger). The
session owns no judgment here. Run this once, when the file is missing; it is
create-only (idempotent — it skips if the file already exists):

```bash
node "$KAOLA_SCRIPTS/kaola-gitlab-workflow-phase4-advance.js" init-progress \
  --project {project} --json
```

The script stamps this template:

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

1. Open the task. The mechanical `workflow-state.md` pointer move (`phase: 4`,
   `phase_name: Execute`, `step: delegate-task`, `task: N`, `next_command:
   /kaola-workflow-phase4 {project}`, preserving any existing `## Sink` block
   byte-for-byte) is owned by the transaction script — no judgment:

   ```bash
   node "$KAOLA_SCRIPTS/kaola-gitlab-workflow-phase4-advance.js" open-task \
     --task {n} --project {project} --json
   ```

2. RED: write or update the focused test first, then run it and capture the expected failure.
3. GREEN: implement the minimal change and run the same test until it passes.
4. REFACTOR: clean only within scope while tests stay green.
5. Run the exact validation command from `phase3-plan.md`.
6. Save raw evidence to `.cache/tdd-task-{n}.md`.
7. Mark the task complete only after the session judges validation passed.

If validation fails after GREEN or REFACTOR, the session **classifies** the failure
and **decides** the route, then hands the mechanical Failure Routing Ledger row to
the transaction script before dispatching the fix agent. The classification and
routing decision are the session's; the script only transcribes the row verbatim
(`failing_command` / `classification` / `routed_to` are required; the row is deduped
on re-run):

- behavior, regression, coverage, or acceptance failure -> `tdd-guide`
- build, type, lint, dependency, formatting, or tooling failure -> `build-error-resolver`

```bash
echo '{"failing_command":"<cmd>","classification":"<class>","routed_to":"<agent>","evidence":"<path>","status":"open"}' | \
  node "$KAOLA_SCRIPTS/kaola-gitlab-workflow-phase4-advance.js" record-failure \
  --task {n} --project {project} --stdin --json
```

The session dispatches the routed fix agent (`tdd-guide` / `build-error-resolver`)
itself — a subagent cannot dispatch a subagent. Re-run validation after the fix and
keep the task `in_progress` until validation passes.

Only after the session has **judged** that validation passed does it hand the
per-task completion to the transaction script. The "validation passed" verdict is
the session's; the script only transcribes the completion — it marks the task
`complete`, fills its Files Modified column, flips its `## Required Agent Compliance`
`tdd-guide executor task {n}` row to a RESOLVED status (`subagent-invoked` when the
role was delegated to the Codex subagent, `local-fallback-explicit` under explicit
user authorization, `local-fallback-tool-unavailable` when subagent tooling was
unavailable) with the evidence path, sets Build Status and `Last Updated`, and moves
the `workflow-state.md` pointer to the next task or `next_skill: kaola-workflow-review {project}`,
preserving any existing `## Sink` block byte-for-byte. Pass the verified task result
on stdin: the modified-file list (from the verified `tdd-guide` evidence), the build
status (`clean`, or the failure detail), and optionally the evidence path (defaults
to `.cache/tdd-task-{n}.md`):

```bash
echo '{"files_modified":["<path>"],"build_status":"clean","evidence":".cache/tdd-task-{n}.md","compliance_status":"subagent-invoked"}' | \
  node "$KAOLA_SCRIPTS/kaola-gitlab-workflow-phase4-advance.js" close-task \
  --task {n} --project {project} --stdin --json
```

When all tasks are complete and compliance rows are resolved, the script has set
`next_skill: kaola-workflow-review {project}`.
