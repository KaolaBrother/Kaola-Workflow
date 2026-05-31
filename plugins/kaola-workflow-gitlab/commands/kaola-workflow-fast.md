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

## Agent Model Badge

Every subagent dispatch below includes an explicit `model=` line. Always pass it
exactly as written — it is what makes Claude Code show the model badge on the
subagent card. The installer fills each `model="{...}"` placeholder with the
agent's frontmatter model (for example `model="sonnet"`); never omit the `model=` line.

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

## Fast Eligibility

Fast path applies only when the approach is **unambiguous and mechanical** —
exactly one sensible way to do it. Mechanical examples: rename or move a symbol
across files; thread an existing field or param through a known call path; a
behavior-preserving refactor; repetitive parallel edits; a bug fix whose root
cause is already located. All of these must also hold: single area; no new
external deps; no public API/schema/migration change; no security/auth/encryption
concern; no `depends-on:#N`; no breaking-change or architecture concern; and the
write set is **≤ 5** files within that single area.

Anything with **≥ 2 materially-different viable approaches** stays on full,
regardless of size — that is a design choice, where full-workflow ideation earns
its keep. File count alone no longer disqualifies; ambiguity does.

## Mid-Flight Escalation

Escalate to the full workflow immediately when any of the following is detected
during Plan, Execute, or Review:

- the planner reports ≥ 2 materially-different viable approaches (`approach_ambiguity`) — exactly one sensible approach is required for fast path
- scope exceeds the planner's declared write set by more than 1 file (`file_overflow`), or exceeds the absolute backstop of 6 files (whichever comes first)
- more than 3 consecutive failing test cycles on the same test (`test_thrash` threshold)
- a security, architecture, or breaking-change concern surfaces
- a dependency on another in-flight issue is discovered
- the implementation requires new external packages

On escalation:

1. Write `escalated_to_full: <trigger> — <detail>` to `workflow-state.md`, where `<trigger>` is one of `approach_ambiguity`, `file_overflow`, `test_thrash`, `security`, `architecture`, `breaking_change`, `dependency`, `new_package`. Use the literal " — " (em-dash with spaces) before the detail so the fast-path audit parses the trigger cleanly.
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

Invoke the Claude Code agent `planner` with the linked
GitLab issue body and `phase1-research.md` / `phase2-ideation.md` excerpts if
they exist (otherwise issue body alone):

You MUST pass `model="{PLANNER_MODEL}"` in this Agent call exactly as shown —
do not omit the `model=` line.

```text
Agent(
  subagent_type="planner",
  model="{PLANNER_MODEL}",
  description="Fast plan {project}",
  prompt="..."
)
```

Ask for:

- files to touch (the declared write set — must be ≤ 5 files in a single area for fast path to apply)
- explicitly: is there exactly one sensible approach, or ≥ 2 materially-different ones?
- exact change per file
- acceptance check command
- explicit out-of-scope items

Write raw output to:

```text
kaola-workflow/{project}/.cache/planner.md
```

If the planner reports the change exceeds ≤ 5 files, or reports ≥ 2
materially-different viable approaches, escalate per Mid-Flight Escalation above.

The orchestrator (main session) captures the planner's plan into the
`fast-summary.md` stub with status `IN_PROGRESS`, recording the declared write
set as the `## Scope` `- Write Set:` line with real repository paths (so the
parallel-overlap classifier can see this fast project's in-flight files). The
`planner` agent does not write files itself (Read/Grep/Glob tools only).

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

Invoke the Claude Code agent `tdd-guide` with the
planner-produced plan and explicit constraints:

You MUST pass `model="{TDD_GUIDE_MODEL}"` in this Agent call exactly as shown —
do not omit the `model=` line.

```text
Agent(
  subagent_type="tdd-guide",
  model="{TDD_GUIDE_MODEL}",
  description="Fast execute {project}",
  prompt="..."
)
```

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

Delegated `code-reviewer` is mandatory whenever the change touches **> 1 file**
or any production-path file (anything outside `docs/`, `*.md`, `tests/`).
Self-review is allowed ONLY for the trivial band — a single docs, comment, or
markdown edit. The Trivial Inline Edit exemption below (applying a one-line
reviewer fix) is unchanged.

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

Invoke the Claude Code agent `code-reviewer` on the
modified files from Step 2:

You MUST pass `model="{CODE_REVIEWER_MODEL}"` in this Agent call exactly as shown —
do not omit the `model=` line.

```text
Agent(
  subagent_type="code-reviewer",
  model="{CODE_REVIEWER_MODEL}",
  description="Fast review {project}",
  prompt="..."
)
```

Ask it to check:

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
- Write Set: path/to/file, path/to/test-file
- Acceptance: <acceptance check command>

## Plan
[brief description of what was done]

## Implementation Evidence
[commands run, test output summary]

## Review
[review result]

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
