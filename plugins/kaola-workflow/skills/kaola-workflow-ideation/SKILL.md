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

## Mechanical Ideation Finalization (script-owned transaction)

The **Selected Approach** verdict (the chosen option + rationale + rejected
alternatives) is the current session's **judgment**: the session reads
`.cache/planner.md`, picks the recommended option, and decides the selection
(Step 5). This script never re-selects, never re-ranks or weighs approaches,
never judges risk, and never dispatches a role.

Once the approach is decided, the deterministic bookkeeping — authoring
`phase2-ideation.md` from the Phase File template (the **Selected Approach**
verdict, the Approaches Evaluated pros/cons/risk/complexity, the Out of Scope
list, and the `## Required Agent Compliance` rows) and advancing the
`workflow-state.md` pointer to `next_skill: kaola-workflow-plan {project}`
(preserving any existing `## Sink` block byte-for-byte) — is owned by the
full-path transaction script `kaola-workflow-full-advance.js` (ADR 0004), not a
subagent. The main session runs it directly, handing the decided content as a
JSON packet on stdin; the script renders the phase file (with a RESOLVED
`## Required Agent Compliance` table) and advances the state pointer in
crash-safe order (phase file first, state pointer last), idempotent on resume. It
copies the Selected Approach and rationale exactly as the session hands them — it
never re-selects, restates, softens, re-ranks, or judges the choice, never weighs
approaches or assesses risk, never invokes `planner` or any other role, never
routes, never acts as a gate, and never asks the user. The current session keeps
the `planner` dispatch and the selection judgment.

Resolve `$KAOLA_SCRIPTS` once, then run the transaction, piping the decided
Selected Approach (verbatim), the Approaches Evaluated and Out of Scope from
`.cache/planner.md`, and the compliance rows:

```bash
KAOLA_SCRIPTS="plugins/kaola-workflow/scripts"
if [ ! -f "$KAOLA_SCRIPTS/kaola-workflow-full-advance.js" ]; then
  KAOLA_SCRIPTS="$(dirname "$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow/*/scripts/kaola-workflow-full-advance.js' -print -quit 2>/dev/null)")"
fi

node "$KAOLA_SCRIPTS/kaola-workflow-full-advance.js" phase2-finalize \
  --project {project} --stdin --json <<'PACKET'
{
  "selected_approach": "<chosen option + reason + rejected alternatives, verbatim>",
  "approaches_evaluated": "<Approaches Evaluated body from .cache/planner.md>",
  "out_of_scope": "<Out of Scope list>",
  "compliance": [
    { "requirement": "planner", "status": "invoked", "evidence": ".cache/planner.md" }
  ]
}
PACKET
```

The script writes `kaola-workflow/{project}/phase2-ideation.md` from the Phase
File template above (rendered from the packet, with a RESOLVED
`## Required Agent Compliance` table) and updates `workflow-state.md`
(phase: 2 / step: complete / next_skill: kaola-workflow-plan {project}),
PRESERVING any existing `## Sink` block byte-for-byte.

The `compliance` rows are the orchestrator's hand-off and must be RESOLVED
(`invoked` with an evidence path, or `n/a` with a skip reason); if omitted the
script falls back to the resolved `planner | invoked | .cache/planner.md`
default. The script refuses a non-array `compliance` (typed refusal, zero
mutation) and does not re-select, weigh, route, or act as a gate.

Continue to Phase 3 once the script reports `result: ok`.
