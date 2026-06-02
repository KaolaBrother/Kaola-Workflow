---
name: kaola-workflow-adapt
description: Use when authoring an adaptive workflow-plan.md — freely compose a task-shaped DAG of role nodes, then the validator proves it in-grammar and freezes it. Mirror of commands/kaola-workflow-adapt.md for Codex runtime.
---

# Skill: kaola-workflow-adapt

Phase-0 of the adaptive path: the agent **freely authors** a task-shaped DAG for *this*
issue — which roles, how many, in what shape — into a `workflow-plan.md`. There is no
template library and no knob-binding ceremony. Mirror of `commands/kaola-workflow-adapt.md`
for the Codex runtime. Reads and updates `kaola-workflow/{project}/workflow-state.md`.

Reachable only when the adaptive switch is ON *and* the structure question in the
`kaola-workflow-next` Startup Step 0a-1 was affirmatively confirmed.

## The grammar (the closed envelope)

Each node is one row of the `## Nodes` table:
`| id | role | depends_on | declared_write_set | cardinality | shape |`.
- **role** must be in the installed library (the nine canonical roles + any
  maintainer-installed role such as `adversarial-verifier`). The validator hard-rejects
  an unknown role. The author **never** sets a model — it comes only from
  `resolve-agent-model`.
- **shape** is exactly one of three productions: `sequence`, `fanout(<group>)` (N
  instances of one role over pairwise-disjoint declared write sets, N ≤ `FANOUT_CAP`),
  or `loop(<cap>)` (one role re-invoked up to a static cap; loops do not fan out).
- A single unique `finalize` sink is mandatory — it makes the gate checks decidable.
- A gate is a wall the validator finds in the graph: `code-reviewer` must
  **post-dominate** every implement node; `security-reviewer` must post-dominate every
  sensitive node. Not a flag the author can set.

Capture the **frozen issue labels** into a `## Meta` `labels:` line (a non-author field)
so the validator can derive sensitivity.

## Validate + freeze

```bash
node "$KAOLA_SCRIPTS/kaola-workflow-plan-validator.js" kaola-workflow/{project}/workflow-plan.md --json
```
- **out-of-grammar → typed refusal** (unknown role, gate routed around, cap busted,
  non-disjoint write-role fan-out). Fix the plan; never clamp around the gate.
- **in-grammar, provably low-risk → auto-run.** Freeze immediately.
- **in-grammar, risky or uncertain → ask the user first** (show the DAG + validator
  report + risk findings). Freeze only on an explicit yes.

Freeze once authorized (the script computes and writes `plan_hash` into the plan), then
hand off to `kaola-workflow-plan-run {project}`:
```bash
node "$KAOLA_SCRIPTS/kaola-workflow-plan-validator.js" kaola-workflow/{project}/workflow-plan.md --freeze
```
