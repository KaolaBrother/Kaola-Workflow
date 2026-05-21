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

## Agent Model Badge Contract

Before every Kaola subagent invocation, resolve the installed agent model and
pass it explicitly to Claude Code's `Agent` tool. This is what makes Claude Code
show the model badge on the subagent row/card.

```bash
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./plugins/kaola-workflow-gitea/scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n" "./plugins/kaola-workflow-gitea/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
KAOLA_AGENT_MODEL_JS="$(kaola_script kaola-workflow-resolve-agent-model.js)"
kaola_agent_model(){ node "$KAOLA_AGENT_MODEL_JS" "$1" --raw 2>/dev/null || true; }
```

For each `Agent(...)` call below, set `AGENT_MODEL="$(kaola_agent_model
AGENT_NAME)"` and include `model="{AGENT_MODEL}"` when non-empty. If the value
is empty, omit `model=` so Claude Code inherits the orchestrator model.

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

If `phase4-progress.md` is missing, create it from `phase3-plan.md`.

If present:

- first task with `pending` -> `task-pending`
- first task with `in_progress` and no `.cache/tdd-task-N.md` -> `delegate-task`
- cache exists but RED/GREEN evidence missing -> `verify-agent-result`
- cache exists and evidence valid but validation not run -> `validate-task`
- validation failed and no routing ledger row -> `route-failure`
- validation passed but progress not updated -> `update-progress`
- all tasks complete -> route to `/kaola-workflow-phase5 {project}`

If ambiguous, stop and ask. Do not guess.

## Progress File Template

Create `kaola-workflow/{project}/phase4-progress.md`:

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

Before invoking the agent, update:

```text
phase: 4
phase_name: Execute
step: delegate-task
task: {n}
next_command: /kaola-workflow-phase4 {project}
inline_emergency_fallback_authorized: no
```

Resolve the model, then invoke the Claude Code agent `tdd-guide` for the task:

```bash
TDD_GUIDE_MODEL="$(kaola_agent_model tdd-guide)"
```

```text
Agent(
  subagent_type="tdd-guide",
  model="{TDD_GUIDE_MODEL}",
  description="Task {n}: {name}",
  prompt="..."
)
```

If `TDD_GUIDE_MODEL` is empty, omit the `model=` line.

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

Mark the compliance row `invoked` with that evidence path.

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

If validation fails, add a row to `Failure Routing Ledger` before invoking the
fix agent.

Routing:
- build/type/lint/dependency/tooling -> `build-error-resolver`
- behavior/regression/coverage/acceptance -> `tdd-guide`
- scope/write-set -> stop and ask, unless reverting the agent's own deviation

For every routed fix or delegated validation agent, resolve that agent's model
with `kaola_agent_model` and include the explicit `model=` parameter in the
`Agent(...)` call. Omit `model=` only when the resolved value is empty.

Record each routed fix in:

```text
kaola-workflow/{project}/.cache/tdd-task-{n}-fix-{m}.md
```

Re-run validation after the routed fix. Keep the task `in_progress` until
validation passes.

### Step 4 - Update Progress

Only after validation passes:

- mark task `complete`
- record modified files
- update build status
- update `Last Updated`
- update `workflow-state.md` to next task or Phase 5

## Completion

When all tasks are complete and compliance rows are resolved, route to:

```text
/kaola-workflow-phase5 {project}
```
