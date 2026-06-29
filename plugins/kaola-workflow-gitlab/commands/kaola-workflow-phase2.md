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
You MUST pass `model="{PLANNER_MODEL}"` in the planner Agent call exactly as shown — do not omit the `model=` line.

## Resume Detection

If `phase2-ideation.md` exists and all `Required Agent Compliance` rows are
complete, route to:

```text
/kaola-workflow-phase3 {project}
```

Otherwise detect the step:

- `.cache/planner.md` missing -> `planner`
- selected approach missing -> `internal-selection`
- phase file missing -> `write-phase-file`

Update `workflow-state.md` before continuing.

## Hard Gates

- Do not invent facts missing from Phase 1.
- If a required fact is missing, stop and return to Phase 1 with a focused
  `code-explorer` or `knowledge-lookup` request.
- Use `planner` for deep approach analysis.
- Do not stop for routine strategy selection. After reviewing the planner output,
  choose the recommended approach internally, apply it, and record the rationale.
- Ask the user only when the choice is materially user-owned or you identify
  ambiguity that blocks a correct technical decision.

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

## Step 2 - Internal Selection

Choose the recommended option. Record the selected approach, rationale, and any
rejected alternatives in `phase2-ideation.md`. Do not ask the user to approve the
strategy unless the decision is materially user-owned.

## Step 3 - Mechanical Ideation Finalization (script-owned transaction)

The **Selected Approach** (the chosen option + rationale + rejected alternatives)
is the main session's **judgment**: Step 2 reads `.cache/planner.md`, picks the
recommended option, and DECIDES the selection. This script never re-selects, never
weighs approaches, and never judges risk — it only transcribes the selection the
main session hands it, verbatim.

The mechanical bookkeeping — authoring `phase2-ideation.md` from the orchestrator's
verbatim content and advancing the `workflow-state.md` pointer — is owned by the
full-path transaction script `kaola-gitlab-workflow-full-advance.js`, not
a subagent. The main session runs it directly, handing the decided content as a JSON
packet on stdin; the script renders the phase file (with a RESOLVED
`## Required Agent Compliance` table) and advances the state pointer in crash-safe
order (phase file first, state pointer last), idempotent on resume.

Resolve `$KAOLA_SCRIPTS` once, then run the transaction, piping the decided
Selected Approach (verbatim), the Approaches Evaluated and Out of Scope from
`.cache/planner.md`, and the compliance rows:

```bash
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./plugins/kaola-workflow-gitlab/scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitlab/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitlab/scripts/$_n" "./plugins/kaola-workflow-gitlab/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
KAOLA_SCRIPTS="$(dirname "$(kaola_script kaola-gitlab-workflow-full-advance.js)")"

node "$KAOLA_SCRIPTS/kaola-gitlab-workflow-full-advance.js" phase2-finalize \
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

The script writes `kaola-workflow/{project}/phase2-ideation.md` in this shape
(rendered from the packet) and updates `workflow-state.md` (phase: 2 / step:
complete / next_command: /kaola-workflow-phase3 {project} / next_skill:
kaola-workflow-plan {project}), PRESERVING any existing `## Sink` block
byte-for-byte:

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

## Selected Approach
[name + reason]

## Out of Scope (explicit)
[what will not be built]

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
```

The `compliance` rows are the orchestrator's hand-off and must be RESOLVED
(`invoked` with an evidence path, or `n/a` with a skip reason); if omitted the
script falls back to the resolved `planner | invoked | .cache/planner.md` default.
The script refuses a non-array `compliance` (typed refusal, zero mutation) and does
not re-select, weigh, route, or act as a gate.

Continue to Phase 3 once the script reports `result: ok`.
