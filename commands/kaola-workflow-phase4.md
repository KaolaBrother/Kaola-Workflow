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

## Session Heartbeat

If a claim session is active or recoverable, ensure the background heartbeat ticker is running:

```bash
kaola_script(){ _n="$1"; for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n" "./scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; return 1; }
_CLAIM_JS="$(kaola_script kaola-workflow-claim.js)"
if [ -f "$_CLAIM_JS" ] && [ -z "${KAOLA_SESSION_ID:-}" ]; then
  KAOLA_SESSION_ID="$(node "$_CLAIM_JS" session 2>/dev/null || true)"
  [ -n "$KAOLA_SESSION_ID" ] && export KAOLA_SESSION_ID
fi
if [ -f "$_CLAIM_JS" ] && [ -n "${KAOLA_SESSION_ID:-}" ]; then
  node "$_CLAIM_JS" session --project "{project}" --session "$KAOLA_SESSION_ID" >/dev/null || {
    echo "Kaola-Workflow: {project} is owned by another session; use explicit recovery/handoff to continue it."
    exit 1
  }
fi
if [ -n "${KAOLA_SESSION_ID:-}" ] && [ -f "$_CLAIM_JS" ]; then
  _TICKER_PID_FILE="$(git rev-parse --show-toplevel)/kaola-workflow/.tickers/${KAOLA_SESSION_ID}.pid"
  if [ ! -f "$_TICKER_PID_FILE" ] || ! kill -0 "$(cat "$_TICKER_PID_FILE" 2>/dev/null)" 2>/dev/null; then
    nohup node "$_CLAIM_JS" ticker \
      --session "$KAOLA_SESSION_ID" >/dev/null 2>&1 &
    disown
  fi
fi
```

## Startup Receipt Guard

For issue-backed work, verify that `kaola-workflow/.sessions/${KAOLA_SESSION_ID}.startup.json`
exists and authorizes this exact project with `claim: "owned"` or
`claim: "acquired"` before doing phase work. Run the script-level verifier and
stop on failure:

```bash
node "$_CLAIM_JS" verify-startup --session "$KAOLA_SESSION_ID" --project "{project}" >/dev/null || {
  echo "Kaola-Workflow: startup receipt does not authorize {project}; run startup or explicit recovery instead."
  exit 1
}
```

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

Invoke ECC `tdd-guide` for the task.

Provide:
- the full task definition from `phase3-plan.md`
- `Test File`, `Write Set`, dependencies, and validation command
- relevant Phase 1 test patterns
- explicit Git policy for this workflow: do not create checkpoint commits unless
  the user or project convention explicitly requires them

Agent task:
- Execute using ECC `tdd-workflow`
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
