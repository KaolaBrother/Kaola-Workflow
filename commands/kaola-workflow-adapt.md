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
`workflow-next.md` Step 0a-1 was affirmatively confirmed. This is now
**script-enforced** at the authoring entry by `kaola-workflow-claim.js
authoring-allowed` (#235), not prose alone. The middle of the run is free; the
lifecycle frame around it (claim → branch/worktree → [this plan] → Phase-6 sink)
is fixed.

## Goal Contract

Author a `workflow-plan.md` whose `## Nodes` table passes
`kaola-workflow-plan-validator.js`, freeze it (the script stamps `plan_hash`),
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
- **cardinality** is a **reserved / advisory** column: the validator parses it but
  does not validate or use it (fan-out width is the row count in a `fanout(<group>)`,
  not this column). Keep a plain count (e.g. `1`); its text still feeds `plan_hash`
  as part of `## Nodes`, so keep the column present and stable.
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

## Caps and the sink (fixed by the harness)

- **`FANOUT_CAP`** — max instances in one `fanout(<group>)`; default **4** (env
  `KAOLA_FANOUT_CAP`). Width is the number of rows sharing the group token.
- **`LOOP_CAP`** — max `loop(<cap>)` bound: **5**. A loop must run at least once —
  `loop(0)` is a typed refusal.
- **`FILE_CEILING`** — max paths in any one node's `declared_write_set`: **6**.
  Root-level (`Dockerfile`) and dot-leading (`.config/ci.yml`) paths count too.
- **Unique `finalize` sink** — exactly one terminal node, role **`finalize`**. It
  may only write docs/state bookkeeping (e.g. `CHANGELOG.md`); any non-docs write
  declared on the sink is treated as unreviewed code and trips the `code-reviewer` gate.

## A complete example (`workflow-plan.md`)

A minimal in-grammar plan to copy and adapt: `code-explorer` explores, two `tdd-guide`
nodes implement in parallel over **disjoint top-level directories** (`exporter/` vs
`renderer/`), `code-reviewer` post-dominates both, and the unique `finalize` sink closes
the DAG. It validates in-grammar and freezes; because it is a write-role fan-out it routes
to **ask** (surface for approval) — expected, not an error.

```markdown
# Workflow Plan — issue #142

## Meta
labels: enhancement

## Nodes

| id        | role          | depends_on          | declared_write_set | cardinality | shape        |
|-----------|---------------|---------------------|--------------------|-------------|--------------|
| explore   | code-explorer | —                   | —                  | 1           | sequence     |
| impl-csv  | tdd-guide     | explore             | exporter/csv.js    | 1           | fanout(impl) |
| impl-html | tdd-guide     | explore             | renderer/html.js   | 1           | fanout(impl) |
| review    | code-reviewer | impl-csv, impl-html | —                  | 1           | sequence     |
| finalize  | finalize      | review              | CHANGELOG.md       | 1           | sequence     |

## Node Ledger

| id        | status  |
|-----------|---------|
| explore   | pending |
| impl-csv  | pending |
| impl-html | pending |
| review    | pending |
| finalize  | pending |
```

Disjointness is checked at **top-level-directory** granularity (`exporter/` vs `renderer/`,
not exact path), so fan-out siblings must live under different top-level directories. To turn
a refusal into a fix, read the typed refusal and correct the plan — never clamp around the gate.

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

First confirm the adaptive switch is ON — the **hard authoring guard** (#235). If it
refuses, STOP: do not author or freeze a plan. This mirrors the `claimProject` selection
guard and closes the prose-only gate (audit D8). The validator itself stays
toggle-agnostic; the switch is read only here, at the authoring entry.

```bash
node scripts/kaola-workflow-claim.js authoring-allowed --project {project}
```

If the JSON `status` is `authoring_refused`, surface the typed refusal and STOP — fix the
switch or the path selection, never clamp around the gate. If `authoring_allowed`, proceed:

```text
node scripts/kaola-workflow-plan-validator.js kaola-workflow/{project}/workflow-plan.md --json
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
node scripts/kaola-workflow-plan-validator.js kaola-workflow/{project}/workflow-plan.md --freeze
```

After freeze the plan is author-immutable. Hand off to the executor:

```text
/kaola-workflow-plan-run {project}
```
