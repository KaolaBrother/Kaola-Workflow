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

## Step 1 - Plan (Single-Pass)

Read `phase1-research.md` and `phase2-ideation.md` if they exist. If both are
absent, derive scope directly from the GitLab issue body.

Produce a focused implementation plan:

- files to touch (must be ≤ 2 closely related files for fast path to apply)
- exact change per file
- acceptance check command

If files to touch exceed the fast-path bound, escalate per Mid-Flight Escalation above.

Update `workflow-state.md`:

```text
phase: fast
phase_name: Fast
step: execute
workflow_path: fast
next_command: /kaola-workflow-fast {project}
```

Write a `fast-summary.md` stub with status `IN_PROGRESS`.

## Step 2 - Execute

Apply the plan changes directly. No ECC implementation agent is spawned for
fast-path; the main session implements inline.

Inline implementation constraints:

- no new external package dependencies
- no changes to public APIs, schemas, or shared infrastructure
- tests must be updated or added alongside the implementation change

After implementation, run the acceptance check command from Step 1.

If `test_thrash` threshold is hit (≥ 3 consecutive RED→RED cycles on the same
test), escalate per Mid-Flight Escalation above.

Update `fast-summary.md` status to `REVIEW`.

## Step 3 - Review

Run a lightweight self-review:

- all acceptance check commands pass
- no new CRITICAL or HIGH security concerns
- no debug statements or hardcoded credentials
- implementation matches the plan from Step 1

If any concern fails the review, escalate per Mid-Flight Escalation above
unless it qualifies as a Trivial Inline Edit (one-line mechanical fix).

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

## Escalation
[escalated_to_full: <trigger> or N/A]
```

## Continue to Phase 6

After `fast-summary.md` is `PASSED`, continue:

```text
/kaola-workflow-phase6 {project}
```
