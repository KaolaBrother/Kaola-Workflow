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

## Front end: claim + author (the `workflow-planner` agent role)

The adaptive path opens by delegating to ONE subagent. **You MUST delegate the starting contract
and the DAG authoring to the `workflow-planner` agent role** (Opus) — do NOT run the claim or author
the `## Nodes` table inline in this session. In Claude Code dispatch it via the Agent tool
(`subagent_type="workflow-planner"`); in Codex delegate to the `workflow-planner` agent role when its
profile is present at `.codex/agents/kaola-workflow/`. Only if the agent tool is genuinely
unavailable (`local-fallback-tool-unavailable`) may this session run the claim + author inline, and that fallback MUST be recorded as `local-fallback-tool-unavailable` in the compliance ledger. The
planner never freezes, judges risk, asks the user, or dispatches further — it returns control here.

The router enters with the agent-selected target issue for fresh adaptive work; the planner RETURNS
the `{project}` used after. **Re-entry (unfrozen plan):** an *authored-but-NOT-frozen* plan (a prior
governance refusal / declined ask / abort — no `plan_hash`) routes back here; SKIP the freshness gate
+ planner delegation and re-run the planner+handoff on the existing plan (the planner MAY overwrite an unfrozen plan; never a frozen one); the handoff freezes mechanically. A pre-freeze exit
leaves a **resumable** project; `kaola-workflow-claim.js discard --project
{project}` abandons it.

**Entry guard (this session, before the delegation).** Confirm the adaptive switch is ON — the
**hard authoring guard** (#235). It is switch-only and needs no project. If it refuses, STOP; do
not summon the planner (the planner's `startup` re-checks the switch via `claimProject`, so a plan
can never be authored under an OFF switch):

```bash
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n" "./scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
node "$(kaola_script kaola-workflow-claim.js)" authoring-allowed
```

If the JSON `status` is `authoring_refused`, surface the typed refusal and STOP.

**Git freshness (BEFORE the claim).** If `authoring_allowed`, gate on a clean main *before*
delegating: nothing is claimed yet — run the Startup git-freshness checks against the MAIN repo
(`git pull --ff-only` if behind). If it cannot resolve cleanly (dirty, or a merge / rebase / stash /
reset is needed), STOP and ask — do NOT delegate, so **no folder / `workflow:in-progress`
label is created until git is clean** (the front end claims here at repo-root — the adaptive claim provisions a repo-local hidden worktree at `<repo-root>/.kw/worktrees/<project>/`, the same as full/fast paths; the planner authors + freezes at repo-root and does NOT itself cd into the worktree — so the router's post-claim freshness-block release no longer guards this path).

Once main is clean, **delegate to the `workflow-planner`**: it runs `kaola-workflow-claim.js startup --runtime <runtime> --workflow-path adaptive
--target-issue <issue>` (`--workflow-path adaptive` is REQUIRED — a subagent shell does not inherit
KAOLA_PATH; add `--sink pr` only for a requested PR sink), authors the `## Meta` + `## Nodes` DAG +
empty `## Node Ledger` into the project's `workflow-plan.md` via Write, runs the validator `--json`
as a self-check (NOT `--freeze`, NOT `authoring-allowed`), then RUNS `kaola-workflow-adaptive-handoff.js --project {project} --json` (freezes, resume-checks, stages roadmap, writes Planning Evidence; does NOT open node1 or record the node1 baseline — `kaola-workflow-plan-run` owns the full node lifecycle including the first node; decision:ask is recorded metadata, not a gate), and RETURNS the handoff packet. It never JUDGES risk or asks the user (decision:ask is recorded metadata); it RUNS the handoff, which freezes mechanically, and returns the packet; it never dispatches. If the project already has a
`workflow-plan.md` it refuses-and-returns (never overwrite a frozen plan). On a claim refusal — any
`claim_verdict` that is NOT `acquired`/`owned` — no `workflow-state.md` is written; surface
`claim_reasoning` and STOP (**fail closed** — do not blind-read a missing state file), never retry a
different issue.

**Read the durable state, not the planner's prose.** On success take `{project}` from the return,
re-read `kaola-workflow/{project}/workflow-state.md` (the `## Sink` block, `workflow_path: adaptive`)
and `kaola-workflow/{project}/workflow-plan.md` (internalize the `## Nodes` DAG you govern, dispatch,
and freeze). The claim (at repo-root — the adaptive claim provisions a worktree at `<repo-root>/.kw/worktrees/<project>/`; the planner authors + freezes at repo-root) was cut from a now-clean main (git-freshness ran before the claim, above).

**Read the handoff packet.** The planner RAN `kaola-workflow-adaptive-handoff.js` and returned a checklist-backed packet (plan already frozen, Planning Evidence written; the handoff does NOT open node1 or record the node1 baseline — `kaola-workflow-plan-run` owns the full node lifecycle including the first node). The handoff is mechanical; `decision:ask` is audit metadata only — it freezes-and-proceeds, NEVER pauses for approval.

- **`handoff_status: ready_to_run`** (all checklist true) → hand off DIRECTLY to `kaola-workflow-plan-run {project}` (even when `decision:ask`, no approval gate). `kaola-workflow-plan-run` owns the complete node lifecycle — it opens and dispatches every node including the first, via `kaola-workflow-adaptive-node.js`.

- **`handoff_status: plan_invalid`** (validator refused; plan never froze, NOTHING written) → bounded **repair loop**: re-dispatch the `workflow-planner` with the verbatim `errors`/`validator_verdict` so it overwrites the UNFROZEN plan with a corrected DAG and re-runs the handoff. Retry ~2x (counter in the orchestrator, never in the script). After repeated failure → real decision: downgrade to full path / discard+restart (`kaola-workflow-claim.js discard --project {project}` then fresh adaptive start) / STOP + surface concrete blocker with validator evidence. Never silently loop.

**Establish the task list = the workflow nodes** — one task per row of the frozen `## Nodes` table,
labeled `id · role`, in `depends_on` order; a live mirror of the `## Node Ledger` (the durable
source of truth) that the executor flips `in_progress`/`completed` per node. Then hand off to
`kaola-workflow-plan-run {project}`.
