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
4. Consult the strongest available expert model/profile for the session or perform the same advisor gate locally: check for missing approaches, hidden risks, and overbuilt scope. Save it to `.cache/advisor-ideation.md`.
5. Select the advisor-reviewed recommended approach internally and record the rationale. Do not ask the user to approve routine technical strategy selection.
6. Write `phase2-ideation.md` after internal selection.

## Phase File

```markdown
# Phase 2 - Ideation: {project}

## Approaches Evaluated
### Option A: ...

## Advisor Findings
summary of .cache/advisor-ideation.md

## Selected Approach
...

## Out of Scope
...

## Required Agent Compliance
Plain `invoked` is intentional for non-Codex-role workflow gates such as
advisor review; delegation vocabulary applies only to Codex role rows like
`planner`.

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | subagent-invoked/local-fallback-explicit/local-fallback-tool-unavailable | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
```

Update `workflow-state.md` with `next_skill: kaola-workflow-plan {project}`.
