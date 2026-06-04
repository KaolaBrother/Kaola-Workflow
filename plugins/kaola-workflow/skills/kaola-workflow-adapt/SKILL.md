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
- **cardinality** is a **reserved / advisory** column: parsed but not validated or used
  (fan-out width is the row count in a `fanout(<group>)`); its text still feeds `plan_hash`
  as part of `## Nodes`, so keep the column present and stable.
- A single unique `finalize` sink is mandatory — it makes the gate checks decidable.
- A gate is a wall the validator finds in the graph: `code-reviewer` must
  **post-dominate** every implement node; `security-reviewer` must post-dominate every
  sensitive node. Not a flag the author can set.

Capture the **frozen issue labels** into a `## Meta` `labels:` line (a non-author field)
so the validator can derive sensitivity.

## Caps and the sink (fixed by the harness)

`FANOUT_CAP` (max fan-out width, default **4**; width is the row count in a `fanout(<group>)`),
`LOOP_CAP` (**5**; a loop must run at least once — `loop(0)` is a typed refusal), `FILE_CEILING`
(**6** paths per node's write set; root-level + dot-leading paths count). The unique **`finalize`**
sink may only write docs/state (e.g. `CHANGELOG.md`); a non-docs write on the sink trips `code-reviewer`.

## A complete example (`workflow-plan.md`)

Minimal in-grammar plan to copy and adapt — explore, a `planner` node that shapes and
dominates the implements, two parallel `tdd-guide` implements over **disjoint top-level
directories**, a `code-reviewer` that post-dominates both, a `doc-updater` for the changed
docs, and the unique `finalize` sink. Being a write-role fan-out it routes to **ask**.

```markdown
# Workflow Plan — issue #142

## Meta
labels: enhancement

## Nodes

| id        | role          | depends_on          | declared_write_set | cardinality | shape        |
|-----------|---------------|---------------------|--------------------|-------------|--------------|
| explore   | code-explorer | —                   | —                  | 1           | sequence     |
| plan      | planner       | explore             | —                  | 1           | sequence     |
| impl-csv  | tdd-guide     | plan                | exporter/csv.js    | 1           | fanout(impl) |
| impl-html | tdd-guide     | plan                | renderer/html.js   | 1           | fanout(impl) |
| review    | code-reviewer | impl-csv, impl-html | —                  | 1           | sequence     |
| docs      | doc-updater   | review              | docs/api.md        | 1           | sequence     |
| finalize  | finalize      | review, docs        | CHANGELOG.md       | 1           | sequence     |
```

Disjointness is checked at **top-level-directory** granularity, so fan-out siblings must live
under different top-level directories.

## Shaping guidance (recommendations, not gates)

The validator enforces only the **walls** — the unique `finalize` sink, G1
(`code-reviewer` post-dominates code-producing nodes), G2 (`security-reviewer` post-dominates
sensitive nodes). Everything below is author judgment the grammar will **not** refuse;
the example above models both.

- **Plan before you build.** For a non-trivial implement, consider a `planner` (or
  `code-architect`) **node** that precedes — and so dominates — the implement nodes (the
  forward-reasoning roles). One `planner` above a fan-out's shared parent covers every leg
  (not one per leg). Trivial or mechanical work can skip it, or use the fast path.
- **Update the docs you changed.** When the change touches README / API docs /
  architecture / a public interface, consider a `doc-updater` node before `finalize` — the
  sink only does CHANGELOG / state bookkeeping.

## Validate + freeze

First confirm the adaptive switch is ON — the **hard authoring guard** (#235). If it refuses,
STOP: do not author or freeze a plan (mirrors the `claimProject` selection guard; closes audit
D8). The validator stays toggle-agnostic; the switch is read only here.

```bash
node "$KAOLA_SCRIPTS/kaola-workflow-claim.js" authoring-allowed --project {project}
```

If the JSON `status` is `authoring_refused`, surface the typed refusal and STOP. If
`authoring_allowed`, proceed:

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
