---
description: Kaola-Workflow Phase 2. Ideation and strategy selection grounded in Phase 1 facts.
argument-hint: <project name>
---

# Kaola-Workflow Phase 2 - Ideation

Phase 2 compares approaches and records the selected strategy. It does not write
implementation code or reopen broad research unless Phase 1 facts are missing.

## Prerequisite

`kaola-workflow/{project}/phase1-research.md` must exist. If missing, stop:

```text
Phase 1 is not complete. Run /kaola-workflow-phase1 first.
```

Read:

```text
kaola-workflow/{project}/workflow-state.md
kaola-workflow/{project}/phase1-research.md
kaola-workflow/{project}/.cache/code-explorer.md
kaola-workflow/{project}/.cache/knowledge-lookup.md
```

## Agent Model Badge

Every subagent dispatch below includes an explicit `model=` line. Always pass it
exactly as written — it is what makes Claude Code show the model badge on the
subagent card. The installer fills each `model="{...}"` placeholder with the
agent's frontmatter model (for example `model="sonnet"`); never omit the `model=` line.
You MUST pass `model="{CONTRACTOR_MODEL}"` in this Agent call exactly as shown — do not omit the `model=` line.

## Resume Detection

If `phase2-ideation.md` exists and all `Required Agent Compliance` rows are
complete, route to:

```text
/kaola-workflow-phase3 {project}
```

Otherwise detect the step:

- `.cache/planner.md` missing -> `planner`
- `.cache/advisor-ideation.md` missing -> `advisor-gate`
- selected approach missing -> `internal-selection`
- phase file missing -> `write-phase-file`

Update `workflow-state.md` before continuing.

## Hard Gates

- Do not invent facts missing from Phase 1.
- If a required fact is missing, stop and return to Phase 1 with a focused
  `code-explorer` or `knowledge-lookup` request.
- Use `planner` for deep approach analysis.
- Save advisor output to `.cache/advisor-ideation.md`; do not keep it only in
  conversation memory.
- Do not stop for routine strategy selection. After planner/advisor review,
  choose the recommended approach internally, apply it, and record the rationale.
- Ask the user only when the choice is materially user-owned or the advisor
  identifies ambiguity that blocks a correct technical decision.

## Step 1 - Planner

Update state:

```text
phase: 2
phase_name: Ideation
step: planner
next_command: /kaola-workflow-phase2 {project}
main_session_role: orchestrator
implementation_owner: N/A
fix_owner: planner for missing strategy analysis
inline_emergency_fallback_authorized: no
```

Invoke the Claude Code agent `planner` with relevant
Phase 1 excerpts only:

```text
Agent(
  subagent_type="planner",
  model="{PLANNER_MODEL}",
  description="Ideate {project}",
  prompt="..."
)
```

Ask for:

- 2-3 implementation approaches
- pros, cons, risks, complexity
- architectural fit
- recommended option with rationale
- explicit items not to build
- missing facts if any

Write raw output to:

```text
kaola-workflow/{project}/.cache/planner.md
```

## Step 2 - Advisor Gate

Consult the configured Claude Code advisor. If unavailable, stop and tell the
user to enable an Opus advisor before continuing.

Ask the advisor:

- Any missed approaches?
- Are risks accurate?
- Is the recommendation sound?
- Any gotchas that should change the decision?

Write the advisor response to:

```text
kaola-workflow/{project}/.cache/advisor-ideation.md
```

## Step 3 - Internal Selection

Choose the advisor-reviewed recommended option. Record the selected approach,
rationale, and any rejected alternatives in `phase2-ideation.md`. Do not ask the
user to approve the strategy unless the decision is materially user-owned.

## Step 4 - Mechanical Ideation Finalization (delegated to the contractor)

The **Selected Approach** (the chosen option + rationale + rejected alternatives)
is the main session's **judgment**: Step 3 reads `.cache/planner.md` and
`.cache/advisor-ideation.md`, picks the advisor-reviewed recommended option, and
DECIDES the selection. The contractor never re-selects, never weighs approaches,
and never judges risk — it only transcribes the selection the main session hands
it, verbatim.

Once the approach is decided, summon the contractor to author `phase2-ideation.md`
and advance the `workflow-state.md` pointer. Hand the decided **Selected Approach**
text (name + reason + rejected alternatives) into the prompt; the contractor writes
it exactly as given.

```text
Agent(
  subagent_type="contractor",
  model="{CONTRACTOR_MODEL}",
  description="Mechanical ideation finalize {project}",
  prompt="Run the mechanical ideation-finalization bookkeeping for {project}. Execute Step 4 below exactly as written in this command file: author kaola-workflow/{project}/phase2-ideation.md from the template, then update workflow-state.md (phase: 2 / step: complete / next_command: /kaola-workflow-phase3 {project}), PRESERVING any existing ## Sink block byte-for-byte. Write the Selected Approach EXACTLY as the orchestrator hands it to you — copy the selection and rationale verbatim into the ## Selected Approach section; do NOT re-select, re-rank, restate, soften, or judge it, and do NOT decide which approach wins. Transcribe the rest from the evidence the orchestrator names: the Approaches Evaluated (pros/cons/risk/complexity) and Out of Scope list from .cache/planner.md, the Advisor Findings from .cache/advisor-ideation.md, and the Required Agent Compliance rows. Return a compact bookkeeping summary; do NOT dispatch planner or any role, do NOT judge or assess risk, do NOT route, do NOT act as a gate, do NOT close the issue, and do NOT ask the user."
)
```

The contractor writes `kaola-workflow/{project}/phase2-ideation.md` from this
template exactly:

```markdown
# Phase 2 - Ideation: {project}

## Approaches Evaluated

### Option A: [Name]
- Summary: ...
- Pros: ...
- Cons: ...
- Risk: High/Medium/Low
- Complexity: Small/Medium/Large/XL

### Option B: [Name]
...

## Advisor Findings
[summary of .cache/advisor-ideation.md]

## Selected Approach
[name + reason]

## Out of Scope (explicit)
[what will not be built]

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
```

The contractor then updates `workflow-state.md` (preserving any existing `## Sink`
block byte-for-byte):

```text
phase: 2
step: complete
next_command: /kaola-workflow-phase3 {project}
```

Continue to Phase 3 once the contractor reports the phase file and compliance rows
are written.
