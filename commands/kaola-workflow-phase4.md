---
description: Kaola-Workflow Phase 4. Subagent-executed TDD implementation with strict failure routing.
argument-hint: <project name>
---

# Kaola-Workflow Phase 4 - Execute

NO INLINE PHASE 4 FIXES except the Trivial Inline Edit Exception below, or
explicit user authorization.

Phase 4 is subagent-executed. The main session is the orchestrator: it updates
state, starts task agents, verifies results, classifies validation failures,
runs small targeted validation when useful, delegates noisy validation, and
routes fixes. It does not own implementation or test code.

## Worktree Discovery

Resolve the active worktree path before running any git commands in this phase:

```bash
if [ "${KAOLA_WORKTREE_NATIVE:-0}" = "1" ]; then
  COORD_ROOT="$(git worktree list --porcelain | awk '/^worktree /{print substr($0,10); exit}')"
  ACTIVE_WORKTREE_PATH="${COORD_ROOT%/}.kw/{project}"
else
  ACTIVE_WORKTREE_PATH="$(pwd)"
fi
export ACTIVE_WORKTREE_PATH
```

All subsequent `git -C`, `cp`, and path operations in Phase 4 use `$ACTIVE_WORKTREE_PATH` as the working root for issue-branch changes. When `KAOLA_WORKTREE_NATIVE=0` (default), `ACTIVE_WORKTREE_PATH` is the current directory, preserving existing behavior.

## Prerequisite

`phase3-plan.md` must exist. If missing, stop:

```text
Phase 3 is not complete. Run /kaola-workflow-phase3 first.
```

Read:

```text
kaola-workflow/{project}/workflow-state.md
kaola-workflow/{project}/phase1-research.md
kaola-workflow/{project}/phase3-plan.md
kaola-workflow/{project}/phase4-progress.md
```

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
- write implementation fixes inline except under the Trivial Inline Edit
  Exception
- write or rewrite tests inline except under the Trivial Inline Edit Exception
- mark a task complete while validation fails
- silently bypass `tdd-guide`
- run broad/noisy validation in-session when it can be delegated and summarized

Failure routing:
- behavior/test failure -> `tdd-guide`
- missing acceptance behavior -> `tdd-guide`
- build/type/lint/tooling failure -> `build-error-resolver`
- scope/write-set violation -> stop and ask unless reverting the agent's own
  obvious deviation
- emergency inline fallback -> only with explicit user authorization recorded as
  `inline_emergency_fallback_authorized: yes`

Default state must include:

```text
main_session_role: orchestrator
implementation_owner: tdd-guide
fix_owner: tdd-guide or build-error-resolver
inline_emergency_fallback_authorized: no
```

## Agent Model Badge

Every subagent dispatch below includes an explicit `model=` line. Always pass it
exactly as written — it is what makes Claude Code show the model badge on the
subagent card. The installer fills each `model="{...}"` placeholder with the
agent's frontmatter model (for example `model="sonnet"`); never omit the `model=` line.
You MUST pass `model="{CONTRACTOR_MODEL}"` in this Agent call exactly as shown — do not omit the `model=` line.

## Validation Delegation Policy

The main session is the validation/classification owner, not the long-output
test runner.

Main session may run small targeted commands by default:

- one focused test file or test case
- one package/typecheck command scoped to affected files or package
- one lint/format command scoped to changed files
- a quick smoke check needed to classify a failure

Main session must delegate expensive or noisy validation by default:

- full `cargo test`, full monorepo test suites, or full build pipelines
- broad lint/typecheck commands across unrelated packages
- commands expected to produce long logs
- repeated failure reproduction after the classification is already clear

Delegated validation should use a fresh validation subagent when available, or
the relevant fix agent (`tdd-guide` for behavior checks, `build-error-resolver`
for build/type/lint/tooling checks). Raw output goes to:

Route build/type/lint/tooling fixes to the Claude Code agent
`build-error-resolver`:

```text
Agent(
  subagent_type="build-error-resolver",
  model="{BUILD_ERROR_RESOLVER_MODEL}",
  description="Routed fix: task {n}",
  prompt="..."
)
```

```text
kaola-workflow/{project}/.cache/validation-task-{n}.md
```

The main session records only the command, pass/fail result, short failure
summary, classification, evidence path, and next route.

## Validation De-Duplication

Avoid redundant validation runs.

- Phase 4 validates affected task scope, not the full project, unless the task
  plan explicitly requires a full command or the touched surface is high risk.
- If the same command already passed against the same relevant file set and no
  relevant files changed afterward, cite the prior evidence path instead of
  rerunning it.
- After any routed fix or Trivial Inline Edit Exception edit, rerun only the
  affected command unless the fix changes shared infrastructure.
- Reserve full-suite validation for Phase 6 unless Phase 3 lists it as the
  task-level validation command.

## Trivial Inline Edit Exception

The main session may make a trivial inline edit without emergency fallback only
when all conditions are true:

- the edit is one line or mechanically obvious
- no behavior, API, architecture, test intent, or design judgment is required
- it fixes orchestration friction, formatting, an unused import, a typo, import
  ordering, or an obvious generated path/name mistake
- it stays inside the task write set
- it is recorded in `phase4-progress.md` or `workflow-state.md`
- affected validation is rerun or prior valid evidence is cited under
  Validation De-Duplication

Anything else is routed to `tdd-guide` or `build-error-resolver`.

## Resume Detection

If `phase4-progress.md` is missing, the main session delegates its creation from
`phase3-plan.md` to the contractor (see Progress File Initialization below). The
resume branch the file selects is the main session's judgment.

If present:

- first task with `pending` -> `task-pending`
- first task with `in_progress` and no `.cache/tdd-task-N.md` -> `delegate-task`
- cache exists but RED/GREEN evidence missing -> `verify-agent-result`
- cache exists and evidence valid but validation not run -> `validate-task`
- validation failed and no routing ledger row -> `route-failure`
- validation passed but progress not updated -> `update-progress`
- all tasks complete -> route to `/kaola-workflow-phase5 {project}`

If ambiguous, stop and ask. Do not guess.

## Progress File Initialization (delegated to the contractor)

Authoring `phase4-progress.md` is mechanical bookkeeping: the contractor stamps
the template from `phase3-plan.md` (one `## Tasks` / `## Required Agent Compliance`
row per Phase 3 task). The main session owns no judgment here — it only confirms
the file exists before the per-task loop. Run this once, when Resume Detection
finds the file missing.

```text
Agent(
  subagent_type="contractor",
  model="{CONTRACTOR_MODEL}",
  description="Init phase4 progress {project}",
  prompt="Create kaola-workflow/{project}/phase4-progress.md for {project} from kaola-workflow/{project}/phase3-plan.md, using the Progress File template exactly as written below in this command file. Emit one ## Tasks row and one ## Required Agent Compliance `tdd-guide executor task N` row per Phase 3 task, all status `pending`; set Build Status `clean`, an empty Failure Routing Ledger, and Last Updated to the current ISO-8601 UTC timestamp. Do NOT dispatch a role, classify failures, judge, or run any task. Return a compact bookkeeping summary."
)
```

The template the contractor stamps:

```markdown
# Phase 4 - Progress: {project}

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
| 1 | [name] | pending | | |

## Build Status
clean

## Failure Routing Ledger
| Task | Failing Command | Classification | Routed To | Evidence | Status |
|------|-----------------|----------------|-----------|----------|--------|

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide executor task 1 | pending | | |

## Last Updated
[ISO-8601 UTC]
```

## Per-Task Loop

### Step 1 - Delegate Task

Before invoking the role agent, the main session delegates the open-the-task
state write to the contractor (a mechanical `workflow-state.md` pointer move — no
judgment). The main session keeps the `tdd-guide` dispatch itself, since a
subagent cannot dispatch a subagent.

```text
Agent(
  subagent_type="contractor",
  model="{CONTRACTOR_MODEL}",
  description="Open task {n} {project}",
  prompt="Open task {n} for {project}. Update kaola-workflow/{project}/workflow-state.md to phase: 4 / phase_name: Execute / step: delegate-task / task: {n} / next_command: /kaola-workflow-phase4 {project} / inline_emergency_fallback_authorized: no, PRESERVING any existing ## Sink block byte-for-byte. Do NOT dispatch tdd-guide or any role, classify, judge, or run the task. Return a compact bookkeeping summary."
)
```

The pointer the contractor writes:

```text
phase: 4
phase_name: Execute
step: delegate-task
task: {n}
next_command: /kaola-workflow-phase4 {project}
inline_emergency_fallback_authorized: no
```

Then the main session invokes the Claude Code agent `tdd-guide` for the task:

```text
Agent(
  subagent_type="tdd-guide",
  model="{TDD_GUIDE_MODEL}",
  description="Task {n}: {name}",
  prompt="..."
)
```

Provide:
- the full task definition from `phase3-plan.md`
- `Test File`, `Write Set`, dependencies, and validation command
- relevant Phase 1 test patterns
- explicit Git policy for this workflow: do not create checkpoint commits unless
  the user or project convention explicitly requires them

Agent task:
- Execute using `tdd-workflow`
- write/update tests first and verify RED
- implement minimum code for GREEN
- refactor only while tests stay green
- keep edits inside the write set unless escalating
- return modified files, commands run, RED evidence, GREEN evidence, deviations

Write raw output to:

```text
kaola-workflow/{project}/.cache/tdd-task-{n}.md
```

The `tdd-guide executor task {n}` compliance row is flipped to `invoked` with
that evidence path by the contractor in the Step 4 close-the-task bracket — the
main session writes no durable progress rows itself.

### Step 2 - Verify Agent Result

The main session reviews the returned diff and evidence:

- changed files are in the write set, or deviation is justified
- RED evidence exists, or RED is explicitly `N/A` for no-testable-change work
- GREEN evidence exists for the same test target
- implementation follows Phase 3 and Phase 1 patterns

If this verification fails, send the task back to `tdd-guide` with the specific
failure. Do not repair implementation inline.

### Step 3 - Validate Task

Run or delegate the exact affected validation command from `phase3-plan.md`,
plus any required type/lint command for affected files. Keep small targeted
commands in-session when they are useful for classification. Delegate expensive
or noisy validation and save raw output to:

```text
kaola-workflow/{project}/.cache/validation-task-{n}.md
```

If validation fails, the main session **classifies** the failure and **decides**
the route, then delegates the mechanical `Failure Routing Ledger` row write to the
contractor before invoking the fix agent. The classification and routing decision
are the main session's; only the row transcription is the contractor's.

```text
Agent(
  subagent_type="contractor",
  model="{CONTRACTOR_MODEL}",
  description="Ledger row task {n} {project}",
  prompt="Append one row to the ## Failure Routing Ledger in kaola-workflow/{project}/phase4-progress.md for task {n}, transcribing verbatim the values the orchestrator hands you: Failing Command, Classification, Routed To, Evidence path, Status (open). Do NOT classify, choose the route, dispatch the fix agent, judge, or alter any other row. Return a compact bookkeeping summary."
)
```

Routing (the main session's decision):
- build/type/lint/dependency/tooling -> `build-error-resolver`
- behavior/regression/coverage/acceptance -> `tdd-guide`
- scope/write-set -> stop and ask, unless reverting the agent's own deviation

The main session dispatches the routed fix agent (`build-error-resolver` /
`tdd-guide`) itself, using the Agent block documented under Validation Delegation
Policy above. For every routed fix or delegated validation agent, include the
explicit `model=` parameter in the `Agent(...)` call exactly as documented above —
never omit it.

Record each routed fix in:

```text
kaola-workflow/{project}/.cache/tdd-task-{n}-fix-{m}.md
```

Re-run validation after the routed fix. Keep the task `in_progress` until
validation passes.

### Step 4 - Update Progress (delegated to the contractor)

Only after the main session has **judged** that validation passed for the task,
it delegates the per-task post-dispatch bookkeeping to the contractor. The
"validation passed" verdict is the main session's and is handed into the prompt;
the contractor only transcribes the completion rows. It marks the task `complete`,
records modified files, updates Build Status, `Last Updated`, and moves the
`workflow-state.md` pointer to the next task or Phase 5.

Capture the task result before delegating (shell variables do not cross the
subagent boundary): the task number `{n}`, the modified-file list (from the
verified `tdd-guide` evidence), the `tdd-task-{n}.md` evidence path, and the
build status (`clean`, or the failure detail if the build surfaced one).

```text
Agent(
  subagent_type="contractor",
  model="{CONTRACTOR_MODEL}",
  description="Close task {n} {project}",
  prompt="Record the completion of task {n} for {project}; the orchestrator has already judged validation PASSED — transcribe, do not re-judge. In kaola-workflow/{project}/phase4-progress.md: mark task {n} `complete` in ## Tasks and fill its Files Modified column from the file list the orchestrator hands you; flip its ## Required Agent Compliance `tdd-guide executor task {n}` row to `invoked` with Evidence `.cache/tdd-task-{n}.md`; set Build Status to the value handed you (default `clean`); set Last Updated to the current ISO-8601 UTC timestamp. Then update kaola-workflow/{project}/workflow-state.md to point at the next task (or step: complete / next_command: /kaola-workflow-phase5 {project} when this was the last task), PRESERVING any existing ## Sink block byte-for-byte. Do NOT dispatch a role, classify, judge sufficiency, run validation, or close the issue. Return a compact bookkeeping summary."
)
```

## Completion

When all tasks are complete and compliance rows are resolved, route to:

```text
/kaola-workflow-phase5 {project}
```
