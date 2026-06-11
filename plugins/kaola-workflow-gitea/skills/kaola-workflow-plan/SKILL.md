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

Use the `code-architect` Codex agent role for the blueprint step. Record status as `subagent-invoked` in the compliance ledger if delegation occurred, `local-fallback-explicit` if the user explicitly authorized local execution, or `local-fallback-tool-unavailable` if the subagent tooling was unavailable. Then review the blueprint yourself for completeness; if you find gaps, revise the blueprint before execution.

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

Plain `invoked` is intentional for non-Codex-role workflow gates; delegation
vocabulary applies only to Codex role rows like `code-architect`.

```markdown
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | subagent-invoked/local-fallback-explicit/local-fallback-tool-unavailable | .cache/code-architect.md | |
| blueprint revisions | invoked/N/A | .cache/architect-revision-*.md | reason if N/A |
```

The deterministic bookkeeping below — transcribing the `code-architect` blueprint and task list into `phase3-plan.md` (using the Blueprint Requirements and Task Template above) and the `workflow-state.md` checkpoint write (`next_skill: kaola-workflow-execute {project}`, preserving the `## Sink` block) — is delegated to the mechanical `contractor` Codex agent role when that subagent is available; it runs any scripts and authors the durable bookkeeping but never designs or re-plans, never dispatches `code-architect`, never judges, and never changes the selected approach. The main session keeps approach selection, the `code-architect` dispatch and the blueprint-complete judgment, and the revision decisions; it hands the judged-complete blueprint into the contractor, which transcribes the architect's evidence verbatim. This skill runs no `$KAOLA_SCRIPTS/...` script in the mechanical block — the work is pure file authoring — so re-derive a `kaola-gitea-workflow-*` script path only if one is actually needed; capture real exit codes and never gate on a piped `| tail`.

Update `workflow-state.md` with `next_skill: kaola-workflow-execute {project}` after the plan is complete. Do not ask the user to approve routine internal workflow execution.
