---
description: Kaola-Workflow Fast Path. Single-pass Plan+Execute+Review for small, well-scoped issues. Writes fast-summary.md and gates Phase 6.
argument-hint: <project name>
---

# Kaola-Workflow Fast Path

Fast path executes Plan, Implement, and Review in a single pass for issues
where the scope is small and the approach is unambiguous. Outputs `fast-summary.md`
which Phase 6 reads when `workflow_path: fast`.

Mid-flight escalation to full workflow is mandatory if scope grows unexpectedly.

## Goal Contract

Complete a single-pass Plan+Execute+Review cycle for the named project and
write a `PASSED` `fast-summary.md` that Phase 6 accepts as a full-workflow
substitute. Stop if scope exceeds fast-path bounds.

## Agent Model Badge Contract

Before every Kaola subagent invocation, resolve the installed agent model and
pass it explicitly to Claude Code's `Agent` tool. This is what makes Claude Code
show the model badge on the subagent row/card.

```bash
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./scripts/$_n" "./plugins/kaola-workflow/scripts/$_n" "./plugins/kaola-workflow-gitlab/scripts/$_n" "./plugins/kaola-workflow-gitea/scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n" "$HOME/.claude/kaola-workflow-gitlab/scripts/$_n" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n" "$HOME/.claude/kaola-workflow-gitlab/scripts/$_n" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n" "./scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
KAOLA_AGENT_MODEL_JS="$(kaola_script kaola-workflow-resolve-agent-model.js)"
kaola_agent_model(){ node "$KAOLA_AGENT_MODEL_JS" "$1" --raw 2>/dev/null || true; }
```

The installer renders the placeholder model lines below into concrete literals such as `model="sonnet"`. When running from source, resolve the agent model manually and pass a literal `model=` value. If the resolved value is empty, omit `model=` so Claude Code inherits the orchestrator model.



## Resume Detection

If `fast-summary.md` exists with status `PASSED`, fast path is complete. Route to:

```text
/kaola-workflow-phase6 {project}
```

Otherwise detect step:

- `fast-summary.md` absent → `plan`
- `fast-summary.md` has status `IN_PROGRESS` → `execute`
- `fast-summary.md` has status `REVIEW` → `review`
- `fast-summary.md` has `escalated_to_full` → escalation already triggered; do not resume fast path

## Mid-Flight Escalation

Escalate to the full workflow immediately when any of the following is detected
during Plan, Execute, or Review:

- scope is larger than a single file change or two closely related files
- more than 3 consecutive failing test cycles on the same test (`test_thrash` threshold)
- a security, architecture, or breaking-change concern surfaces
- a dependency on another in-flight issue is discovered
- the implementation requires new external packages

On escalation:

1. Write `escalated_to_full: <trigger>` to `workflow-state.md`.
2. Write a brief escalation note to `fast-summary.md` with status `ESCALATED`.
3. Stop and tell the user to re-run `/workflow-next {project}` without `KAOLA_PATH=fast`.

Do not continue fast-path execution after writing the escalation field.

## Step 1 - Plan (planner)

Ensure cache dir exists:

```bash
mkdir -p kaola-workflow/{project}/.cache
```

Update `workflow-state.md`:

```text
phase: fast
phase_name: Fast
step: plan
workflow_path: fast
next_command: /kaola-workflow-fast {project}
main_session_role: orchestrator
implementation_owner: planner
inline_emergency_fallback_authorized: no
```

Resolve the model, then invoke the Claude Code agent `planner` with the linked
GitHub issue body and `phase1-research.md` / `phase2-ideation.md` excerpts if
they exist (otherwise issue body alone):

```bash
PLANNER_MODEL="$(kaola_agent_model planner)"
```

```text
Agent(
  subagent_type="planner",
  model="{PLANNER_MODEL}",
  description="Fast plan {project}",
  prompt="..."
)
```

If `PLANNER_MODEL` is empty, omit the `model=` line. Ask for:

- files to touch (must be ≤ 2 closely related files for fast path to apply)
- exact change per file
- acceptance check command
- explicit out-of-scope items

Write raw output to:

```text
kaola-workflow/{project}/.cache/planner.md
```

If the planner reports the change exceeds ≤ 2 files, escalate per Mid-Flight
Escalation above.

The orchestrator (main session) captures the planner's plan into the
`fast-summary.md` stub with status `IN_PROGRESS`. The `planner` agent does
not write files itself (Read/Grep/Glob tools only).

## Step 2 - Execute (tdd-guide)

Update `workflow-state.md`:

```text
phase: fast
phase_name: Fast
step: execute
workflow_path: fast
next_command: /kaola-workflow-fast {project}
main_session_role: orchestrator
implementation_owner: tdd-guide
inline_emergency_fallback_authorized: no
```

Resolve the model, then invoke the Claude Code agent `tdd-guide` with the
planner-produced plan and explicit constraints:

```bash
TDD_GUIDE_MODEL="$(kaola_agent_model tdd-guide)"
```

```text
Agent(
  subagent_type="tdd-guide",
  model="{TDD_GUIDE_MODEL}",
  description="Fast execute {project}",
  prompt="..."
)
```

If `TDD_GUIDE_MODEL` is empty, omit the `model=` line.

- no new external package dependencies
- no changes to public APIs, schemas, or shared infrastructure
- write tests first (RED → GREEN → refactor while green)
- keep edits inside the planner's write set

Write raw output to:

```text
kaola-workflow/{project}/.cache/tdd-guide.md
```

After the agent returns, the orchestrator runs the acceptance check
command from Step 1.

If `test_thrash` threshold is hit (≥ 3 consecutive RED→RED cycles on the
same test), the orchestrator writes the escalation field and updates
`fast-summary.md` status to `ESCALATED` (the in-flight subagent cannot
write workflow-state.md itself).

Update `fast-summary.md` status to `REVIEW`.

## Step 3 - Review (code-reviewer)

Update `workflow-state.md`:

```text
phase: fast
phase_name: Fast
step: review
workflow_path: fast
next_command: /kaola-workflow-fast {project}
main_session_role: orchestrator
implementation_owner: code-reviewer
inline_emergency_fallback_authorized: no
```

Resolve the model, then invoke the Claude Code agent `code-reviewer` on the
modified files from Step 2:

```bash
CODE_REVIEWER_MODEL="$(kaola_agent_model code-reviewer)"
```

```text
Agent(
  subagent_type="code-reviewer",
  model="{CODE_REVIEWER_MODEL}",
  description="Fast review {project}",
  prompt="..."
)
```

If `CODE_REVIEWER_MODEL` is empty, omit the `model=` line. Ask it to check:

- all acceptance check commands pass
- no new CRITICAL or HIGH security concerns
- no debug statements or hardcoded credentials
- implementation matches the plan from Step 1

Write raw output to:

```text
kaola-workflow/{project}/.cache/code-reviewer.md
```

If the reviewer returns BLOCK or any CRITICAL/HIGH finding, escalate per
Mid-Flight Escalation above unless it qualifies as a Trivial Inline Edit
(one-line mechanical fix). In that exempted case, the orchestrator (not
code-reviewer, which has Read-only tools) applies the fix, re-runs the
acceptance check, and records `implementation_owner: orchestrator-trivial-fix`
in workflow-state.md for that touch.

Update `fast-summary.md` status to `PASSED`.

## Write fast-summary.md

```markdown
# Fast Summary: {project}

## Status
PASSED | IN_PROGRESS | REVIEW | ESCALATED

## Scope
[files changed, acceptance criteria]

## Plan
[brief description of what was done]

## Implementation Evidence
[commands run, test output summary]

## Review
[self-review result]

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| tdd-guide | invoked | .cache/tdd-guide.md | |
| code-reviewer | invoked | .cache/code-reviewer.md | |

## Escalation
[escalated_to_full: <trigger> or N/A]
```

## Continue to Phase 6

After `fast-summary.md` is `PASSED`, continue:

```text
/kaola-workflow-phase6 {project}
```
