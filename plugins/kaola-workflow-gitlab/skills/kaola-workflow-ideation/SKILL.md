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
6. Author `phase2-ideation.md` after internal selection (delegated below).

## Mechanical Ideation Finalization

The deterministic bookkeeping below — authoring `phase2-ideation.md` from the template and advancing the `workflow-state.md` pointer (`next_skill: kaola-workflow-plan {project}`, preserving any existing `## Sink` block byte-for-byte) — is delegated to the mechanical `contractor` Codex agent role when that subagent is available; it runs any needed script (re-deriving its own `node "$KAOLA_SCRIPTS/kaola-gitlab-workflow-claim.js"` path, capturing real exit codes and never gating on a piped `| tail`) and authors the durable bookkeeping but never dispatches `planner` or any role, never runs the advisor ideation gate, never weighs approaches, never assesses risk, never routes, never acts as a gate, never closes the issue, and never asks the user. The current session keeps the `planner` dispatch, the advisor ideation gate, and the **Selected Approach** verdict decision. Because the verdict is the current session's judgment, decide the selected approach (name + reason + rejected alternatives) first — reading `.cache/planner.md` and `.cache/advisor-ideation.md` and picking the advisor-reviewed recommended option — then hand it into the contractor so it transcribes the text verbatim into the `## Selected Approach` section; the contractor copies the selection as given and does not re-select, re-rank, restate, soften, or judge it, and transcribes the Approaches Evaluated, Advisor Findings, Out of Scope, and `## Required Agent Compliance` rows from the evidence the current session names.

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
