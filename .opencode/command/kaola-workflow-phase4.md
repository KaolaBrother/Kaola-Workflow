---
description: Kaola-Workflow Phase 4. Subagent-executed TDD implementation with strict failure routing.
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
ACTIVE_WORKTREE_PATH="$(node -e "try{const fs=require('fs');const s=fs.readFileSync('kaola-workflow/{project}/workflow-state.md','utf8');const m=s.match(/^worktree_path:\\s*(.+)$/m);process.stdout.write(m?m[1].trim():'');}catch(e){}" 2>/dev/null)" || true
[ -z "$ACTIVE_WORKTREE_PATH" ] && ACTIVE_WORKTREE_PATH="$(pwd)"
export ACTIVE_WORKTREE_PATH
```

All subsequent `git -C`, `cp`, and path operations in Phase 4 use `$ACTIVE_WORKTREE_PATH` as the working root for issue-branch changes. It is read from the `worktree_path` the claim recorded in `workflow-state.md` (the same source Finalization uses), so it honors whatever the claim actually provisioned. When the claim recorded no worktree — `KAOLA_WORKTREE_NATIVE=0`, an offline run, or no git history — `worktree_path` is empty and `ACTIVE_WORKTREE_PATH` falls back to the current directory (a repo-root run).

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

## Effort Variant Resolution

opencode resolves each subagent effort centrally from `opencode.json` (the two Kaola
tiers as reasoning-EFFORT VARIANTS of the inherited model): reasoning-tier roles run the
model's TOP effort variant, standard-tier roles its SECOND (e.g. max / high on GLM-5.2).
Dispatch a role with the `task` tool using `subagent_type: "<role>"`; do NOT pass a
per-call `model=` argument — the role's configured variant already selects the effort.
`mapTier(tier, provider)` resolves the variant: the reasoning tier → the TOP effort variant, the standard tier → its SECOND.

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

Route build/type/lint/tooling fixes to the subagent
`build-error-resolver`:

```text
task(
  subagent_type="build-error-resolver",
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
- Reserve full-suite validation for Finalization unless Phase 3 lists it as the
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

If `phase4-progress.md` is missing, the main session stamps it from
`phase3-plan.md` via the transaction script (see Progress File Initialization
below). The resume branch the file selects is the main session's judgment.

If present:

- first task with `pending` -> `task-pending`
- first task with `in_progress` and no `.cache/tdd-task-N.md` -> `delegate-task`
- cache exists but RED/GREEN evidence missing -> `verify-agent-result`
- cache exists and evidence valid but validation not run -> `validate-task`
- validation failed and no routing ledger row -> `route-failure`
- validation passed but progress not updated -> `update-progress`
- all tasks complete -> route to `/kaola-workflow-phase5 {project}`

If ambiguous, stop and ask. Do not guess.

## Progress File Initialization (script-owned transaction)

Authoring `phase4-progress.md` is mechanical bookkeeping owned by the full-path
Phase 4 transaction script `kaola-workflow-phase4-advance.js` (ADR 0004), not a
subagent: it stamps the template from `phase3-plan.md` (one `## Tasks` row and one
`## Required Agent Compliance` `tdd-guide executor task N` row per Phase 3
`### Task N:` block, all status `pending`; Build Status `clean`; empty Failure
Routing Ledger). The main session owns no judgment here. Run this once, when
Resume Detection finds the file missing; it is create-only (idempotent — it skips
if the file already exists).

Resolve `$KAOLA_SCRIPTS` once per command invocation, then run the transaction:

```bash
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n" "./scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
KAOLA_SCRIPTS="$(dirname "$(kaola_script kaola-workflow-phase4-advance.js)")"

node "$KAOLA_SCRIPTS/kaola-workflow-phase4-advance.js" init-progress \
  --project {project} --json
```

The script stamps this template:

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

Before invoking the role agent, the main session runs the open-the-task state
write directly via the transaction script (a mechanical `workflow-state.md`
pointer move — no judgment), then keeps the `tdd-guide` dispatch itself (a subagent
cannot dispatch a subagent). Resolve `$KAOLA_SCRIPTS` once per command invocation
(the resolver is shown in Progress File Initialization above), then:

```bash
node "$KAOLA_SCRIPTS/kaola-workflow-phase4-advance.js" open-task \
  --task {n} --project {project} --json
```

The pointer the script writes (PRESERVING any existing `## Sink` block byte-for-byte):

```text
phase: 4
phase_name: Execute
step: delegate-task
task: {n}
next_command: /kaola-workflow-phase4 {project}
inline_emergency_fallback_authorized: no
```

Then the main session invokes the subagent `tdd-guide` for the task:

```text
task(
  subagent_type="tdd-guide",
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

The `tdd-guide executor task {n}` compliance row is flipped to a resolved status
with that evidence path by the `close-task` transaction in Step 4 — the main
session writes no durable progress rows itself.

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
the route, then records the mechanical `Failure Routing Ledger` row directly via
the transaction script before invoking the fix agent. The classification and
routing decision are the main session's; the script only transcribes the row
(verbatim — `failing_command` / `classification` / `routed_to` are required; the
row is deduped on re-run):

```bash
echo '{"failing_command":"<cmd>","classification":"<class>","routed_to":"<agent>","evidence":"<path>","status":"open"}' | \
  node "$KAOLA_SCRIPTS/kaola-workflow-phase4-advance.js" record-failure \
  --task {n} --project {project} --stdin --json
```

Routing (the main session's decision):
- build/type/lint/dependency/tooling -> `build-error-resolver`
- behavior/regression/coverage/acceptance -> `tdd-guide`
- scope/write-set -> stop and ask, unless reverting the agent's own deviation

The main session dispatches the routed fix agent (`build-error-resolver` /
`tdd-guide`) itself, using the Agent block documented under Validation Delegation
Policy above. Dispatch each such role via `subagent_type`; its effort variant resolves centrally from `opencode.json` (reasoning-tier roles use the model's TOP effort, standard-tier its SECOND). Never pass a per-call `model=`.

Record each routed fix in:

```text
kaola-workflow/{project}/.cache/tdd-task-{n}-fix-{m}.md
```

Re-run validation after the routed fix. Keep the task `in_progress` until
validation passes.

### Step 4 - Update Progress (script-owned transaction)

Only after the main session has **judged** that validation passed for the task,
it records the per-task post-dispatch bookkeeping directly via the transaction
script. The "validation passed" verdict is the main session's; the script only
transcribes the completion — it marks the task `complete`, fills its Files
Modified column, flips its `## Required Agent Compliance` `tdd-guide executor task
{n}` row to a RESOLVED status (delegation-policy-aware: `subagent-invoked` under
`delegate`, `local-fallback-explicit` under `local-authorized`, etc., else
`invoked`) with the evidence path, sets Build Status and `Last Updated`, and moves
the `workflow-state.md` pointer to the next task or Phase 5, PRESERVING any
existing `## Sink` block byte-for-byte. When closing the LAST task it
self-validates the whole compliance table against the real phase 4→5 boundary gate
and refuses (`unresolved_compliance`, zero mutation) rather than advance into a
crossing the resume/finalize router would reject.

Pass the verified task result on stdin: the modified-file list (from the verified
`tdd-guide` evidence), the build status (`clean`, or the failure detail), and
optionally the evidence path (defaults to `.cache/tdd-task-{n}.md`):

```bash
echo '{"files_modified":["<path>"],"build_status":"clean","evidence":".cache/tdd-task-{n}.md"}' | \
  node "$KAOLA_SCRIPTS/kaola-workflow-phase4-advance.js" close-task \
  --task {n} --project {project} --stdin --json
```

## Completion

When all tasks are complete and compliance rows are resolved, route to:

```text
/kaola-workflow-phase5 {project}
```
