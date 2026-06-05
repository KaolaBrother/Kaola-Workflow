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

A minimal in-grammar plan to copy and adapt: `code-explorer` explores, a `planner` node
shapes and dominates the implements, two `tdd-guide` nodes implement in parallel over
**disjoint top-level directories** (`exporter/` vs `renderer/`), `code-reviewer`
post-dominates both, a `doc-updater` node updates the changed docs, and the unique
`finalize` sink closes the DAG. It validates in-grammar and freezes; because it is a
write-role fan-out it routes to **ask** (surface for approval) — expected, not an error.

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

## Node Ledger

| id        | status  |
|-----------|---------|
| explore   | pending |
| plan      | pending |
| impl-csv  | pending |
| impl-html | pending |
| review    | pending |
| docs      | pending |
| finalize  | pending |
```

Disjointness is checked at **top-level-directory** granularity (`exporter/` vs `renderer/`,
not exact path), so fan-out siblings must live under different top-level directories. To turn
a refusal into a fix, read the typed refusal and correct the plan — never clamp around the gate.

## Shaping guidance (recommendations, not gates)

The validator enforces only the **walls** — the unique `finalize` sink, G1
(`code-reviewer` post-dominates every code-producing node), and G2 (`security-reviewer`
post-dominates every sensitive node). Everything below is an author judgment call the
grammar will **not** refuse; the example above models both.

- **Plan before you build.** For a non-trivial implement, consider a `planner` (or
  `code-architect`) **node** that precedes — and so dominates — the implement nodes:
  these are the forward-reasoning roles. One `planner` upstream of a fan-out's shared
  parent covers every leg (not one per leg). Trivial or mechanical work can skip it, or
  use the fast path.
- **Update the docs you changed.** When the change touches README / API docs /
  architecture / a public interface, consider a `doc-updater` node before `finalize` —
  the sink only does CHANGELOG / state bookkeeping, not the docs themselves.

## Authoring

**Consult `planner` to propose the decomposition** — the planner is the planning subagent: it
*proposes* the disjoint sub-areas / parallel research / extra verification, and the main session
comprehends, **authors**, governs, and freezes the table (the planner has only `Read/Grep/Glob` —
no `Write` — and the main session must internalize the DAG to dispatch + `plan_hash`-freeze it, so
the authoring write is the orchestrator's, #44 + freeze-integrity):

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

Then **the main session writes** `kaola-workflow/{project}/workflow-plan.md` with `## Meta`, the
`## Nodes` table, and an empty `## Node Ledger` (one row per node, `status: pending`) — this
authoring write is the orchestrator's, not the contractor's. The planning-evidence
`workflow-state.md` checkpoint is mechanical and is written by the contractor at freeze (below).

## Validate + freeze

First confirm the adaptive switch is ON — the **hard authoring guard** (#235). If it
refuses, STOP: do not author or freeze a plan (mirrors the `claimProject` selection guard;
closes audit D8). The validator stays toggle-agnostic; the switch is read only here. This entry
guard is the main session's — it gates whether the contractor is summoned at all.

```bash
node scripts/kaola-gitea-workflow-claim.js authoring-allowed --project {project}
```

If the JSON `status` is `authoring_refused`, surface the typed refusal and STOP. If
`authoring_allowed`, **summon the contractor to classify** the plan — it runs the validator and
returns the verdict verbatim (a governance input, not a compact summary):

You MUST pass `model="{CONTRACTOR_MODEL}"` in this Agent call exactly as shown — do not omit the
`model=` line.

```text
Agent(
  subagent_type="contractor",
  model="{CONTRACTOR_MODEL}",
  description="Adaptive classify {project}",
  prompt="Run `kaola-gitea-workflow-plan-validator.js kaola-workflow/{project}/workflow-plan.md --json` and return its FULL verdict JSON verbatim (a governance input for the orchestrator, not a compact summary). Re-derive your own kaola_script. Capture the real exit code; never gate on a piped | tail. Do NOT freeze, judge, or write anything."
)
```

The main session reads the verdict and **governs** (the contractor never judges risk):

- **out-of-grammar → typed refusal** (unknown role, a gate routed around, a cap
  busted, a non-disjoint write-role fan-out). Stop and surface; fix the plan.
- **in-grammar, provably low-risk → auto-run.** Freeze immediately.
- **in-grammar, risky or uncertain → ask the user first** (ExitPlanMode-style:
  show the DAG + validator report + risk findings). Freeze only on an explicit
  yes. Any sensitivity, any write-role fan-out, `SHARED_INFRA`, over-ceiling, a
  loop, or any uncertainty is risky (fail closed).

Once authorized, **summon the contractor to freeze + checkpoint** — it stamps `plan_hash`, records
the planning evidence, and stages the per-issue roadmap; the main session keeps only the freeze
**decision** above:

```text
Agent(
  subagent_type="contractor",
  model="{CONTRACTOR_MODEL}",
  description="Adaptive freeze {project}",
  prompt="Freeze the authorized plan for {project} and write the durable bookkeeping; do NOT judge or re-classify. (1) Run `kaola-gitea-workflow-plan-validator.js kaola-workflow/{project}/workflow-plan.md --freeze` — it computes and writes `plan_hash` into the plan (after this the plan is author-immutable). (2) Record the planning evidence in `workflow-state.md`, PRESERVING any existing `## Sink` block byte-for-byte. (3) If a Gitea issue number N is linked (read `issue_number` from `workflow-state.md`), stage the per-issue roadmap: resolve the title, run `kaola-gitea-workflow-roadmap.js init-issue --issue N --title \"TITLE\" --status open --workflow-project \"{project}\" --next-step adaptive`, then `git add kaola-workflow/.roadmap/issue-N.md` (skip if init-issue printed `skip:`). Re-derive your own kaola_script/ROADMAP_JS. Capture real exit codes; never gate on a piped | tail. Return a compact bookkeeping summary (scripts run + exit codes + files written)."
)
```

After freeze the plan is author-immutable. Hand off to the executor:

```text
/kaola-workflow-plan-run {project}
```
