---
description: Kaola-Workflow Adaptive Authoring. The agent freely composes a task-shaped DAG of role nodes into workflow-plan.md, then the validator proves it in-grammar and freezes it.
argument-hint: <issue number>
---

# Kaola-Workflow Adaptive Authoring (adapt)

Phase-0 of the adaptive path: a dedicated **`workflow-planner`** subagent (Opus) settles the
starting contract (claim + `workflow-state.md`, at repo-root — the adaptive claim now provisions a
repo-local hidden worktree at `<repo-root>/.kw/worktrees/<project>/`, the same as full/fast paths;
the `workflow-planner` authors and freezes the plan at repo-root and does NOT itself cd into the
worktree) and **freely authors** a task-shaped DAG for *this* issue —
which roles, how many, in what shape — into a `workflow-plan.md`. There is no template library and
no knob-binding ceremony: the workflow-planner writes the `## Nodes` table directly, and the
validator proves the result is in-grammar. The main session governs the risk decision and the
freeze; the contractor stamps the durable bookkeeping.

Reachable only when the adaptive switch is ON; adaptive is the default under an ON
switch and `fast`/`full` are explicit path-naming escapes (see `workflow-next.md`
Step 0a-1). The middle of the run is free; the lifecycle frame around it
(claim → branch/worktree → [this plan] → Finalization sink) is fixed.

The full claim + author + handoff procedure (grammar, caps, example plan, shaping
guidance, and `kaola-gitea-workflow-claim.js startup …` / `Write` / `kaola-gitea-workflow-adaptive-handoff.js`
literals) lives exclusively in `agents/workflow-planner.md` — the workflow-planner
reads it there. This command holds only the dispatch handle, the entry guard, and
the handoff-packet routing.

## Goal Contract

Author a `workflow-plan.md` whose `## Nodes` table passes
`kaola-gitea-workflow-plan-validator.js`, freeze it (the script stamps `plan_hash`),
record the governance decision (`auto-run` vs `ask` is audit metadata, NOT an
approval gate — freeze and hand off either way), and hand off to
`/kaola-workflow-plan-run`. If the plan is out of grammar, the validator returns
a **typed refusal** — fix the plan, never clamp around the gate.

## Agent Model Badge

Every subagent dispatch below includes an explicit `model=` line. Always pass it
exactly as written — it is what makes Claude Code show the model badge on the
subagent card. The installer fills each `model="{...}"` placeholder with the
agent's frontmatter model; never omit the `model=` line.

## Front end: claim + author (the `workflow-planner` subagent)

The adaptive path opens with ONE enforced subagent dispatch. The **`workflow-planner`** (Opus)
settles the **starting contract** and **authors** the task-shaped DAG into `workflow-plan.md`. The
main session never runs the claim or the authoring write itself — that is the whole point of this
path. The main session keeps every **judgment**: git-freshness, the risk decision, the freeze, and
the dispatch loop (a subagent can never dispatch a subagent — the `workflow-planner` returns control
to you).

The router enters this command with the agent-selected target issue for fresh adaptive work; use
`{issue}` for the front-end dispatch and the planner RETURNS the `{project}` you use after. **Re-entry
(resume of an unfrozen plan):** a *frozen* plan never reaches adapt (it resumes via
`/kaola-workflow-plan-run`), but an **authored-but-NOT-frozen** plan does — if `{project}`'s
`workflow-plan.md` already exists with **no `plan_hash`** (a prior governance refusal / declined
risk-ask / abort left it unfrozen), re-run the planner+handoff on it (the planner MAY overwrite an unfrozen invalid plan; never a frozen one), passing prior validator errors. Do NOT route to a separate freeze step — the handoff freezes mechanically. A pre-freeze
exit therefore leaves a **resumable** project, not an orphan; `kaola-gitea-workflow-claim.js discard
--project {project}` abandons it.

**Entry guard (main session, before the dispatch).** Confirm the adaptive switch is ON — the
**hard authoring guard** (#235). It is switch-only and needs no project, so it runs before the
claim. If it refuses, STOP; do not summon the planner. (Defense in depth: the planner's `startup`
re-checks the switch via `claimProject`, so a plan can never be authored under an OFF switch.)

```bash
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./plugins/kaola-workflow-gitea/scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n" "./plugins/kaola-workflow-gitea/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
node "$(kaola_script kaola-gitea-workflow-claim.js)" authoring-allowed
```

If the JSON `status` is `authoring_refused`, surface the typed refusal and STOP — fix the switch or
the path selection, never clamp around the gate.

**Git freshness (main session, BEFORE the claim).** If `authoring_allowed`, gate on a clean main
*before* summoning the planner: you are at the repo root and nothing is claimed yet — run the Startup
Step 1 git-freshness checks (`workflow-next.md`) against the MAIN repo. If local is behind,
`git pull --ff-only`; if it cannot resolve cleanly (dirty worktree, or a merge / rebase / stash /
reset is required), STOP and ask — do **not** summon the planner, so **no folder /
`workflow:in-progress` label is created until git is clean**. The adaptive path gates freshness here,
*before* the claim, because the front end claims at repo-root — the router's post-claim
freshness-block release no longer guards this path, and gating up front leaves nothing to orphan.

Once main is clean, **summon the `workflow-planner`** — it claims, authors `workflow-plan.md`, runs
the validator `--json` as a self-check, and RETURNS a structured summary; it never JUDGES risk or asks the user (decision:ask is recorded metadata); it RUNS the handoff, which freezes mechanically, and returns the packet; it never dispatches.

**Planner-first control boundary (issue #287).** The main session performs ONLY the allowed non-design preflight above (read repo/session rules, confirm target issue, authoring-allowed switch check, git freshness, non-design target availability), then dispatches `workflow-planner` immediately as the first issue-specific action. The main session MUST NOT pre-author the `## Nodes` DAG, choose role sequence/deps/shapes/write-sets, or pass a mandatory full DAG / `AUTHOR EXACTLY` / `do not redesign` prompt to the planner — the adaptive front-end design is the planner's to own, not the main session's. Doing so earns a typed refusal: `planner_control_boundary_violation`. The ONLY exception is in the bounded unfrozen-plan validator-repair loop (after `handoff_status: plan_invalid` on an UNFROZEN plan): the orchestrator MAY re-dispatch the planner with the verbatim validator errors + the prior plan as repair context, because the planner already owns that unfrozen draft.

You MUST pass `model="{WORKFLOW_PLANNER_MODEL}"` in this Agent call exactly as shown — do not omit
the `model=` line.

```text
Agent(
  subagent_type="workflow-planner",
  model="{WORKFLOW_PLANNER_MODEL}",
  description="Adaptive front end {issue}",
  prompt="Settle the starting contract and design the adaptive workflow for issue {issue}, per your workflow-planner contract. Follow the Method in your agent profile (agents/workflow-planner.md). The full procedure — startup, Write of ## Nodes, adaptive-handoff.js — lives there as the sole home."
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

The claim (at repo-root — the adaptive claim provisions a worktree at `<repo-root>/.kw/worktrees/<project>/`; the planner authors + freezes at repo-root) was cut from a now-clean main (git-freshness ran *before* the claim, above), so proceed
straight to reading the handoff packet.

## Read the handoff packet

The planner RAN `kaola-gitea-workflow-adaptive-handoff.js` and returned a checklist-backed packet (plan already frozen, Planning Evidence written; the handoff does NOT open node1 or record the node1 baseline — plan-run owns the full node lifecycle including the first node). The handoff is mechanical; `decision:ask` is **audit metadata only** — it freezes-and-proceeds, NEVER pauses for approval.

- **`handoff_status: ready_to_run`** (all checklist true) → hand off DIRECTLY to `/kaola-workflow-plan-run {project}` (even when `decision:ask`, no approval gate). `/kaola-workflow-plan-run` owns the complete node lifecycle — it opens and dispatches every node including the first, via `kaola-gitea-workflow-adaptive-node.js`.

- **`handoff_status: plan_invalid`** (validator refused; plan never froze, NOTHING written) → bounded **repair loop**: re-dispatch the `workflow-planner` with the verbatim `errors`/`validator_verdict` so it overwrites the UNFROZEN plan with a corrected DAG and re-runs the handoff. Retry ~2x (the retry counter lives in the ORCHESTRATOR, never in the script). After repeated failure → a REAL decision: downgrade to full path / discard+restart (`kaola-gitea-workflow-claim.js discard --project {project}` then fresh adaptive start) / STOP + surface a concrete blocker with validator evidence. Never silently loop.

## Establish the task list, then hand off

After `handoff_status: ready_to_run` (and ONLY then), re-read `kaola-workflow/{project}/workflow-plan.md` to internalize the frozen `## Nodes` table, then create the orchestrator's task list. **The task list MUST NOT be created before `handoff_status: ready_to_run` is confirmed and the frozen plan has been read** — the planner owns the design; the task list is a mechanical reflection of the frozen result, not a pre-planned outline.

**Establish the orchestrator's task list = the workflow nodes** — one task per row of the frozen `## Nodes` table, labeled `id · role`, in `depends_on`
(topological) order. This task list is a **live mirror** of the `## Node Ledger`, which stays the
durable source of truth; the executor (`/kaola-workflow-plan-run`) flips each task `in_progress`
when it dispatches that node's role (after `open-next`) and `completed` after the
commit step closes it (`n/a` nodes → skipped). Then hand off to the executor:

```text
/kaola-workflow-plan-run {project}
```
