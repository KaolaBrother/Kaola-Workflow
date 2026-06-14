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

The **Selected Approach** (the chosen option + rationale + rejected alternatives)
is the main session's **judgment**: the orchestrator reads `.cache/planner.md`,
reviews the options, and DECIDES the selection. The main session keeps the
`planner` dispatch and the internal selection — it hands the decided Selected
Approach text (name + reason + rejected alternatives) to the script, which
transcribes it verbatim. The script never re-selects, re-ranks, weighs approaches,
or assesses risk, never dispatches `planner`, and never judges.

The deterministic bookkeeping — authoring `phase2-ideation.md` (the Approaches
Evaluated, the **Selected Approach**, Out of Scope, and the Required Agent
Compliance rows, using the Phase File template above) from the orchestrator's
verbatim content, and the `workflow-state.md` checkpoint write — is owned by the
full-path transaction script `kaola-gitea-workflow-full-advance.js` (ADR 0004), not
a subagent. The main session runs it directly, handing the decided content as a
JSON packet on stdin; the script renders the phase file (with a RESOLVED
`## Required Agent Compliance` table) and advances the state pointer in crash-safe
order (phase file first, state pointer last), idempotent on resume.

Resolve `$KAOLA_SCRIPTS` once, then run the transaction, piping the decided
Selected Approach (verbatim), the Approaches Evaluated and Out of Scope from
`.cache/planner.md`, and the compliance rows:

```bash
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./plugins/kaola-workflow-gitea/scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n" "./plugins/kaola-workflow-gitea/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
KAOLA_SCRIPTS="$(dirname "$(kaola_script kaola-gitea-workflow-full-advance.js)")"

node "$KAOLA_SCRIPTS/kaola-gitea-workflow-full-advance.js" phase2-finalize \
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

The script writes `kaola-workflow/{project}/phase2-ideation.md` (rendered from the
packet, in the Phase File shape above) and updates `workflow-state.md` (phase: 2 /
step: complete / `next_skill: kaola-workflow-plan {project}`), PRESERVING any
existing `## Sink` block byte-for-byte. The `compliance` rows are the
orchestrator's hand-off and must be RESOLVED (a status with an evidence path, or
`n/a` with a skip reason); the script refuses a non-array `compliance` (typed
refusal, zero mutation) and does not re-select, weigh, route, or act as a gate.
Capture real exit codes from the call's typed JSON and never gate on a piped
`| tail`.

Continue to Phase 3 once the script reports `result: ok`.
