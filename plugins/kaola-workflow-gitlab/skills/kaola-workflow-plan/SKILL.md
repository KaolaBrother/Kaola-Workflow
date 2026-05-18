---
name: kaola-workflow-plan
description: Use when Kaola-Workflow for Codex, also called kaola-workflow, has selected an approach and needs an executable implementation blueprint.
---

# Kaola-Workflow Plan

Phase 3 turns the selected strategy into a dependency-safe plan. Do not edit product code in this phase.


## Goal Contract

Continue until Phase 3 has a dependency-safe blueprint, expert review evidence,
any required revisions, `phase3-plan.md`, and `workflow-state.md` pointing to
`next_skill: kaola-workflow-execute {project}`. Stop only for true external
authorization, materially user-owned choices, or ambiguity that blocks
correctness.

## Prerequisite


Read `workflow-state.md`, `phase1-research.md`, and `phase2-ideation.md`.

## Blueprint Requirements

Write `kaola-workflow/{project}/phase3-plan.md` with:

- files to create or modify
- purpose and key interfaces
- ordered build sequence with dependency reasons
- per-task write set
- test file locations
- exact validation commands
- safe parallel groups only when write sets are disjoint
- explicit out-of-scope items

Use the `code-architect` Codex agent role when subagents are available; otherwise produce the same blueprint in the current session. Consult the strongest available expert model/profile for the session or perform the same plan self-review locally, then save it to `.cache/advisor-plan.md`. If gaps are found, revise the blueprint before execution.

## Task Template

```markdown
### Task 1: Name
- File: path/to/file
- Test File: path/to/test
- Write Set: path/to/file, path/to/test
- Depends On: none
- Parallel Group: serial
- Action: CREATE | MODIFY
- Implement: exact behavior
- Mirror: pattern from phase1-research.md
- Validate: exact command
```

## Required Agent Compliance

```markdown
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| blueprint revisions | invoked/N/A | .cache/architect-revision-*.md | reason if N/A |
```

Update `workflow-state.md` with `next_skill: kaola-workflow-execute {project}` after the advisor-reviewed plan is complete. Do not ask the user to approve routine internal workflow execution.
