---
name: kaola-workflow-ideation
description: Use when Phase 1 facts exist and Kaola-Workflow for Codex, also called kaola-workflow, needs approach comparison and autonomous strategy selection.
---

# Kaola-Workflow Ideation

Phase 2 compares strategies. It does not write implementation code or reopen broad research unless Phase 1 has a specific gap.


## Goal Contract

Continue until Phase 2 has compared approaches, completed expert review,
selected the recommended strategy internally, written `phase2-ideation.md`, and
updated `workflow-state.md` with `next_skill: kaola-workflow-plan {project}`.
Stop only for true external authorization, materially user-owned choices, or
ambiguity that blocks correctness.

## Prerequisite


Read:

```text
kaola-workflow/{project}/workflow-state.md
kaola-workflow/{project}/phase1-research.md
kaola-workflow/{project}/.cache/code-explorer.md
```

## Steps

1. Use the `planner` Codex agent role for this step. Record status as `subagent-invoked` in the compliance ledger if delegation occurred, `local-fallback-explicit` if the user explicitly authorized local execution, or `local-fallback-tool-unavailable` if the subagent tooling was unavailable.
2. Evaluate 2-3 grounded approaches from Phase 1 facts.
3. For each option, record summary, pros, cons, risk, complexity, and what not to build.
4. Review the options yourself for missing approaches, hidden risks, and overbuilt scope; revise the set before selecting.
5. Select the recommended approach internally and record the rationale. Do not ask the user to approve routine technical strategy selection.
6. Write `phase2-ideation.md` after internal selection.

## Phase File

```markdown
# Phase 2 - Ideation: {project}

## Approaches Evaluated
### Option A: ...

## Selected Approach
...

## Out of Scope
...

## Required Agent Compliance
Plain `invoked` is intentional for non-Codex-role workflow gates; delegation
vocabulary applies only to Codex role rows like `planner`.

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | subagent-invoked/local-fallback-explicit/local-fallback-tool-unavailable | .cache/planner.md | |
```

The deterministic bookkeeping below — authoring `phase2-ideation.md` (the Approaches Evaluated, the **Selected Approach**, Out of Scope, and the Required Agent Compliance rows, using the Phase File template above) and the `workflow-state.md` checkpoint write (`next_skill: kaola-workflow-plan {project}`, preserving the `## Sink` block) — is delegated to the mechanical `contractor` Codex agent role when that subagent is available; it runs any scripts and authors the durable bookkeeping but never re-selects, re-ranks, weighs approaches, or assesses risk, never dispatches `planner`, and never judges. The main session keeps the `planner` dispatch and the internal selection (the **Selected Approach** decision); it hands the decided Selected Approach text (name + reason + rejected alternatives) into the contractor, which transcribes it verbatim. This skill runs no `$KAOLA_SCRIPTS/...` script in the mechanical block — the work is pure file authoring — so re-derive a `kaola-gitea-workflow-*` script path only if one is actually needed; capture real exit codes and never gate on a piped `| tail`.

Update `workflow-state.md` with `next_skill: kaola-workflow-plan {project}`.
