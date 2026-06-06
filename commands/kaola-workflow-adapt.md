---
description: Kaola-Workflow Adaptive Authoring. The agent freely composes a task-shaped DAG of role nodes into workflow-plan.md, then the validator proves it in-grammar and freezes it.
argument-hint: <issue number>
---

# Kaola-Workflow Adaptive Authoring (adapt)

Phase-0 of the adaptive path: a dedicated **`workflow-planner`** subagent (Opus) settles the
starting contract (claim + `workflow-state.md`, at repo-root — the adaptive path does NOT provision
a worktree; that is for the full/fast paths only, adaptive worktree support is tracked in #264) and
**freely authors** a task-shaped DAG for *this* issue —
which roles, how many, in what shape — into a `workflow-plan.md`. There is no template library and
no knob-binding ceremony: the workflow-planner writes the `## Nodes` table directly, and the
validator proves the result is in-grammar. The main session governs the risk decision and the
freeze; the contractor stamps the durable bookkeeping.

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
whether to fan out `tdd-guide` or `implementer` over disjoint sub-areas, where to insert extra
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
- **Choose the right implement role.** Default to `tdd-guide`; pick `implementer` ONLY
  for an enumerated non-test-first category — behavior-preserving refactor; scaffolding /
  boilerplate / wiring; config / IaC / scripts; UI / markup; migrations / fixtures;
  integration glue — and RECORD which one (`non_tdd_reason`). Asymmetric tie-breaker: if
  a meaningful failing unit test CAN be written for the work, use `tdd-guide`; when in
  doubt, use `tdd-guide`. "Hard to test" is NOT a valid `non_tdd_reason`; bug fixes are
  ALWAYS `tdd-guide`. A mixed node (some sub-tasks test-first, some not) should be split
  into separate nodes by lane, or routed to the stricter role (`tdd-guide`). Both
  `tdd-guide` and `implementer` require `code-reviewer` post-dominance (G1); `implementer`
  is equal-burden, different-shape — it swaps RED→GREEN for change-type-appropriate
  verification (regression-green / build-green / executable smoke-integration), NOT a
  lighter path.

## Front end: claim + author (the `workflow-planner` subagent)

The adaptive path opens with ONE enforced subagent dispatch. The **`workflow-planner`** (Opus)
settles the **starting contract** (claim + `workflow-state.md`, at repo-root — the adaptive path
does NOT provision a worktree, pending #264) and **authors** the
task-shaped DAG into `workflow-plan.md`. The main session never runs the claim or the authoring
write itself — that is the whole point of this path. The main session keeps every **judgment**:
git-freshness, the risk decision, the freeze, and the dispatch loop (a subagent can never dispatch
a subagent — the `workflow-planner` returns control to you).

The router enters this command with the agent-selected target issue for fresh adaptive work; use
`{issue}` for the front-end dispatch and the planner RETURNS the `{project}` you use after. **Re-entry
(resume of an unfrozen plan):** a *frozen* plan never reaches adapt (it resumes via
`/kaola-workflow-plan-run`), but an **authored-but-NOT-frozen** plan does — if `{project}`'s
`workflow-plan.md` already exists with **no `plan_hash`** (a prior governance refusal / declined
risk-ask / abort left it unfrozen), re-run the planner+handoff on it (the planner MAY overwrite an unfrozen invalid plan; never a frozen one), passing prior validator errors. Do NOT route to a separate freeze step — the handoff freezes mechanically. A pre-freeze
exit therefore leaves a **resumable** project, not an orphan; `kaola-workflow-claim.js discard
--project {project}` abandons it.

**Entry guard (main session, before the dispatch).** Confirm the adaptive switch is ON — the
**hard authoring guard** (#235). It is switch-only and needs no project, so it runs before the
claim. If it refuses, STOP; do not summon the planner. (Defense in depth: the planner's `startup`
re-checks the switch via `claimProject`, so a plan can never be authored under an OFF switch.)

```bash
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n" "./scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
node "$(kaola_script kaola-workflow-claim.js)" authoring-allowed
```

If the JSON `status` is `authoring_refused`, surface the typed refusal and STOP — fix the switch or
the path selection, never clamp around the gate.

**Git freshness (main session, BEFORE the claim).** If `authoring_allowed`, gate on a clean main
*before* summoning the planner: you are at the repo root and nothing is claimed yet — run the Startup
Step 1 git-freshness checks (`workflow-next.md`) against the MAIN repo. If local is behind,
`git pull --ff-only`; if it cannot resolve cleanly (dirty worktree, or a merge / rebase / stash /
reset is required), STOP and ask — do **not** summon the planner, so **no folder /
`workflow:in-progress` label is created until git is clean**. The adaptive path gates freshness here,
*before* the claim, because the front end claims at repo-root (the adaptive path does NOT provision a
worktree — that is for the full/fast paths only, pending #264) — the router's post-claim
freshness-block release no longer guards this path, and gating up front leaves nothing to orphan.

Once main is clean, **summon the `workflow-planner`** — it claims, authors `workflow-plan.md`, runs
the validator `--json` as a self-check, and RETURNS a structured summary; it never JUDGES risk or asks the user (decision:ask is recorded metadata); it RUNS the handoff, which freezes mechanically, and returns the packet; it never dispatches.

You MUST pass `model="{WORKFLOW_PLANNER_MODEL}"` in this Agent call exactly as shown — do not omit
the `model=` line.

```text
Agent(
  subagent_type="workflow-planner",
  model="{WORKFLOW_PLANNER_MODEL}",
  description="Adaptive front end {issue}",
  prompt="Settle the starting contract and design the adaptive workflow for issue {issue}, per your workflow-planner contract. (1) Run `kaola-workflow-claim.js startup --runtime claude --workflow-path adaptive --target-issue {issue}` — `--workflow-path adaptive` is REQUIRED (a subagent shell does not inherit KAOLA_PATH, so without it the project would be mis-stamped workflow_path:full). Add `--sink pr` ONLY if the user requested a PR sink (else omit; merge is the default). This creates the project folder + workflow-state.md at repo-root — the adaptive path does NOT provision a worktree (that is for the full/fast paths only, pending #264). (2) If that project already has a workflow-plan.md, do NOT overwrite it — STOP and return so the orchestrator routes to the executor. (3) Otherwise author via Write the `## Meta` labels line, the `## Nodes` DAG, and an empty `## Node Ledger` (one row per node, `status: pending`) into that project's workflow-plan.md. (4) Run plan-validator <plan> --json self-check, fix until in-grammar — do NOT run authoring-allowed. (5) Run kaola-workflow-adaptive-handoff.js --project {project} --json (freezes, resume-checks, opens node1, records baseline, stages roadmap, writes Planning Evidence; decision:ask is recorded metadata, not a gate). RETURN its handoff packet {handoff_status,checklist,first_node,decision,risk} on ready, or {handoff_status:'plan_invalid',result:'refuse',errors,validator_verdict} on validator refuse."
)
```

**Read the durable state, not the planner's prose.** The structured return is a thin pointer; the
files are authoritative.

- **Refusal — any `claim_verdict` that is NOT `acquired` or `owned`** (e.g. `workflow_path_refused`,
  `target_occupied`, `user_target_blocked`, `user_target_red`, `user_target_closed`,
  `target_unavailable`, `target_unverified`, or `claim: none`): NO `workflow-state.md` was written.
  Surface `claim_reasoning` and STOP (**fail closed** — treat any non-`acquired`/`owned` verdict as a
  refusal); do not blind-read a missing state file, and never retry a different issue.
- **Plan already existed** (`plan_path: null` on an `owned` claim): route to
  `/kaola-workflow-plan-run {project}` — never re-author over a frozen plan.
- **Success** (`acquired` | `owned`, plan authored): take `{project}` from the return, then re-read
  `kaola-workflow/{project}/workflow-state.md` (the `## Sink` block, `workflow_path: adaptive`) and
  `kaola-workflow/{project}/workflow-plan.md` (internalize the `## Nodes` DAG you will govern,
  dispatch, and freeze).

The claim (at repo-root — the adaptive path provisions no worktree, pending #264) was cut from a now-clean main (git-freshness ran *before* the claim, above), so proceed
straight to reading the handoff packet.

## Read the handoff packet

The planner RAN `kaola-workflow-adaptive-handoff.js` and returned a checklist-backed packet (plan already frozen, node1 baseline+ledger+Planning Evidence written). The handoff is mechanical; `decision:ask` is **audit metadata only** — it freezes-and-proceeds, NEVER pauses for approval.

- **`handoff_status: ready_to_dispatch_first_node`** (all checklist true) → dispatch `first_node.role` with `model="<first_node.model>"` scoped to `first_node.declared_write_set` IMMEDIATELY (even when `decision:ask`, no approval gate), then hand off to `/kaola-workflow-plan-run {project}`.

- **`handoff_status: plan_invalid`** (validator refused; plan never froze, NOTHING written) → bounded **repair loop**: re-dispatch the `workflow-planner` with the verbatim `errors`/`validator_verdict` so it overwrites the UNFROZEN plan with a corrected DAG and re-runs the handoff. Retry ~2x (the retry counter lives in the ORCHESTRATOR, never in the script). After repeated failure → a REAL decision: downgrade to full path / discard+restart (`kaola-workflow-claim.js discard --project {project}` then fresh adaptive start) / STOP + surface a concrete blocker with validator evidence. Never silently loop.

## Establish the task list, then hand off

After freeze the plan is author-immutable. **Establish the orchestrator's task list = the workflow
nodes** — one task per row of the frozen `## Nodes` table, labeled `id · role`, in `depends_on`
(topological) order. This task list is a **live mirror** of the `## Node Ledger`, which stays the
durable source of truth; the executor flips each task `in_progress` when the contractor's *advance*
bracket opens that node and `completed` after the *commit* bracket (`n/a` nodes → skipped). Then
hand off to the executor:

```text
/kaola-workflow-plan-run {project}
```
