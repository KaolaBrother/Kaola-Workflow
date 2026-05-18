---
name: kaola-workflow-fast
description: Use when executing a single-pass Plan+Execute+Review fast path for a small, well-scoped kaola-workflow issue. Writes fast-summary.md and gates Phase 6.
---

# Skill: kaola-workflow-fast

Single-pass Plan+Execute+Review for small, well-scoped issues. Writes
`fast-summary.md` and gates Phase 6. Mirror of `commands/kaola-workflow-fast.md`
for Codex runtime. Reads and updates `kaola-workflow/{project}/workflow-state.md`
throughout.

## Goal Contract

Complete a single-pass Plan+Execute+Review cycle for the named project and
write a `PASSED` `fast-summary.md` that Phase 6 accepts as a full-workflow
substitute. Stop if scope exceeds fast-path bounds.



Write `fast-summary.md` stub with status `IN_PROGRESS`.

## Step 2 - Execute

Apply changes inline (no ECC implementation agent). Constraints:

- no new external package dependencies
- no public API, schema, or shared infrastructure changes
- tests updated or added alongside implementation

Run acceptance check after implementation. Escalate on `test_thrash` threshold.

Update `fast-summary.md` status to `REVIEW`.

## Step 3 - Review

Self-review checklist:

- acceptance check commands pass
- no new CRITICAL or HIGH security concerns
- no debug statements or hardcoded credentials
- implementation matches the plan

On failure (unless Trivial Inline Edit), escalate.

Update `fast-summary.md` status to `PASSED`.

## fast-summary.md Format

```markdown
# Fast Summary: {project}

## Status
PASSED | IN_PROGRESS | REVIEW | ESCALATED

## Scope
[files changed, acceptance criteria]

## Plan
[brief description]

## Implementation Evidence
[commands run, test output summary]

## Review
[self-review result]

## Escalation
[escalated_to_full: <trigger> or N/A]
```

## Continue

After `PASSED`, route to `/kaola-workflow-phase6 {project}`.
