---
description: Kaola-Workflow Adaptive Authoring. The agent freely composes a task-shaped DAG of role nodes into workflow-plan.md, then the validator proves it in-grammar and freezes it.
argument-hint: <project name>
---

# Kaola-Workflow Adaptive Authoring (adapt)

Phase-0 of the adaptive path: the agent **freely authors** a task-shaped DAG for
*this* issue — which roles, how many, in what shape — into a `workflow-plan.md`.
There is no template library and no knob-binding ceremony: the agent writes the
`## Nodes` table directly, and the validator proves the result is in-grammar.

Reachable only when the adaptive switch is ON *and* the structure question in
`workflow-next.md` Step 0a-1 was affirmatively confirmed. The middle of the run
is free; the lifecycle frame around it (claim → branch/worktree → [this plan] →
Phase-6 sink) is fixed.

## Goal Contract

Author a `workflow-plan.md` whose `## Nodes` table passes
`kaola-gitea-workflow-plan-validator.js`, freeze it (the script stamps `plan_hash`),
record the governance decision, and hand off to `/kaola-workflow-plan-run`. If
the plan is risky or uncertain, surface it for approval before freezing; if it is
out of grammar, the validator returns a **typed refusal** — fix the plan, never
clamp around the gate.

## Agent Model Badge

Every subagent dispatch below includes an explicit `model=` line. Always pass it
exactly as written — it is what makes Claude Code show the model badge on the
subagent card. The installer fills each `model="{...}"` placeholder with the
agent's frontmatter model; never omit the `model=` line.

## The grammar (the closed envelope)

Each node is `{ id, role, depends_on[], declared_write_set, cardinality, shape }`,
written as one row of the `## Nodes` markdown table:

```text
| id | role | depends_on | declared_write_set | cardinality | shape |
```

- **role** must be in the **installed library** (the nine canonical roles plus
  any maintainer-installed role such as `adversarial-verifier`). The validator
  hard-rejects an unknown role. The author **never** sets a model — the model
  comes only from `resolve-agent-model`.
- **shape** is exactly one of three grammar productions: `sequence`,
  `fanout(<group>)` (N instances of one role over pairwise-disjoint declared
  write sets, N ≤ `FANOUT_CAP`), or `loop(<cap>)` (one role re-invoked up to a
  static cap; loops do not fan out).
- A single unique `finalize` sink is mandatory — it makes the gate checks
  decidable.

**Free (the flexibility):** how many `code-explorer` / `docs-lookup` nodes,
whether to fan out `tdd-guide` over disjoint sub-areas, where to insert extra
review passes, the DAG branching and ordering.

**Fixed (the harness):** the role alphabet, the model resolution, the three
shapes, the unique sink, the computed gates, the caps. A gate is a wall the
validator finds in the graph — `code-reviewer` must **post-dominate** every
implement node; `security-reviewer` must post-dominate every sensitive node —
not a flag the author can set.

Capture the **frozen issue labels** into a `## Meta` `labels:` line (a non-author
field) so the validator can derive sensitivity.

## Authoring

Optionally consult `planner` to shape the decomposition (it does not author the
table — you do):

You MUST pass `model="{PLANNER_MODEL}"` in this Agent call exactly as shown —
do not omit the `model=` line.

```text
Agent(
  subagent_type="planner",
  model="{PLANNER_MODEL}",
  description="Adaptive decomposition {project}",
  prompt="Propose disjoint sub-areas / parallel research / extra verification for issue {issue}; do NOT author the plan table."
)
```

Write `kaola-workflow/{project}/workflow-plan.md` with `## Meta`, the `## Nodes`
table, and an empty `## Node Ledger` (one row per node, `status: pending`). Then
record the planning evidence in `workflow-state.md`.

## Validate + freeze

```text
node scripts/kaola-gitea-workflow-plan-validator.js kaola-workflow/{project}/workflow-plan.md --json
```

- **out-of-grammar → typed refusal** (unknown role, a gate routed around, a cap
  busted, a non-disjoint write-role fan-out). Stop and surface; fix the plan.
- **in-grammar, provably low-risk → auto-run.** Freeze immediately.
- **in-grammar, risky or uncertain → ask the user first** (ExitPlanMode-style:
  show the DAG + validator report + risk findings). Freeze only on an explicit
  yes. Any sensitivity, any write-role fan-out, `SHARED_INFRA`, over-ceiling, a
  loop, or any uncertainty is risky (fail closed).

Freeze once authorized — the script computes and writes `plan_hash` into the plan:

```text
node scripts/kaola-gitea-workflow-plan-validator.js kaola-workflow/{project}/workflow-plan.md --freeze
```

After freeze the plan is author-immutable. Hand off to the executor:

```text
/kaola-workflow-plan-run {project}
```
