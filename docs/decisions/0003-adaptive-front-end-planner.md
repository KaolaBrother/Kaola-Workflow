# 3. Adaptive front-end: a `workflow-planner` subagent owns claim + design

Date: 2026-06-05
Status: Accepted
Issue: adaptive front-end (ships in v5.1.0)
Supersedes: the **adaptive-authoring** and **bootstrap-exception** portions of
`docs/decisions/0002-lean-orchestrator-intent-realignment.md` (0002 stays the contractor-realignment
record for the linear/fast paths and the per-node loop).

## Context

v5.0.0 (ADR 0002) moved all mechanical script-running + durable bookkeeping to the Sonnet
`contractor` at every seam **but the router bootstrap**, and kept the adaptive `## Nodes` authoring
in the main session (the `planner` only *proposed*). Two seams therefore still ran in the main Opus
context on the adaptive path:

1. **The starting contract (claim).** ADR 0002 deliberately kept the router/startup deterministic in
   the main session (the "bootstrap exception"), arguing that delegating it would force a fragile
   prose→bash round-trip.
2. **The DAG design (authoring).** ADR 0002 kept the orchestrator authoring the `## Nodes` table,
   arguing it "must comprehend the DAG to govern + freeze it."

In live testing the owner observed both running inline when the adaptive **skill** drove the run —
and a root-cause audit found the skill mirror (`skills/kaola-workflow-adapt/SKILL.md`) carried
**zero** enforced subagent dispatches (advisory prose: "consult…", "when that subagent is
available…", "it runs node…"), while the **command** carried three enforced `Agent(...)` blocks. A
skill-driven adaptive run therefore did the claim + authoring inline. The owner also judged ADR
0002's "must author to comprehend" rationale weak: the executor (`plan-run`) already traverses a
*frozen* `workflow-plan.md` it did not author, so the orchestrator can govern a plan it reads from a
durable file just as well.

## Decision

Introduce a NEW locally-authored **`workflow-planner`** agent (Opus; tools
`Read/Write/Bash/Grep/Glob`), dispatched **once** by the main session at the start of the adaptive
path. It is DISTINCT from the vendored read-only `planner` agent, which stays a read-only in-plan
node role.

- **The front end owns claim + design.** `workflow-planner` runs `claim.js startup
  --workflow-path adaptive` (creating the worktree + `workflow-state.md`), **authors** the `## Meta`
  + `## Nodes` DAG + an empty `## Node Ledger` into `workflow-plan.md` via `Write`, runs the
  validator `--json` as a self-check, and **returns** a structured summary. It never freezes, judges
  risk, asks the user, or dispatches.
- **Main keeps every judgment.** The orchestrator reads the durable files (never the planner's
  prose), runs git-freshness, **governs** the risk decision (auto-run / ask / typed-refusal), and
  the **contractor** stamps the freeze (`--freeze`) + planning-evidence checkpoint + per-issue
  roadmap. Then main **establishes a task list = the workflow nodes** (one task per `## Nodes` row,
  a live mirror of the `## Node Ledger`) and hands to `plan-run`, whose loop flips each task
  `in_progress`/`completed`.
- **Enforced in both surfaces, all editions.** The dispatch is an enforced `Agent(subagent_type=
  "workflow-planner", model="{WORKFLOW_PLANNER_MODEL}")` block in the github/gitlab/gitea **commands**
  and a strong "MUST delegate to the `workflow-planner`" instruction in the **skill** (skills carry no
  model token — the badge resolves at runtime via `resolve-agent-model.js`). Codex packs ship a
  matching `workflow-planner.toml` profile. Contract validators now lock both surfaces so the skill
  cannot silently drift back to advisory prose.
- **Router bootstrap exception narrowed.** The router still runs Step 0 (issue selection +
  validation) deterministically, but for `KAOLA_PATH=adaptive` it **skips the inline startup
  (Step 0b)** and routes to `/kaola-workflow-adapt <issue>`, where the `workflow-planner` claims.
  The router stays dispatch-free (it routes to a command; the command dispatches the agent).
  Resume wins: an existing frozen `workflow-plan.md` routes to `/kaola-workflow-plan-run`, never
  re-authored.

## Constraints (unchanged from ADR 0002)

A subagent cannot dispatch a subagent (governing harness constraint). `workflow-planner` is a
*front-end* subagent: it returns control to main, which owns the entire dispatch loop, the freeze,
and all governance. The fast and full paths, and the per-node execution loop, are unchanged from
ADR 0002.

## Notes on the durable handoff

`scripts/kaola-workflow-claim.js` needs **no code change**. The `--workflow-path adaptive` flag the
planner passes is parsed by `parseArgs`' generic kebab→camel handler (verified in all three forge
ports), so the project is stamped `workflow_path: adaptive` even though a subagent shell does not
inherit the orchestrator's `KAOLA_PATH`. On success every value main needs is durable
(`workflow-state.md` Sink block + `workflow-plan.md`); on a claim refusal no state file is written,
so the structured return is the sole carrier of `claim_verdict` + `claim_reasoning` and main branches
on the absence of the state file rather than blind-reading it.

## Consequences

- **Cost:** one extra Opus front-end dispatch per fresh adaptive run; negligible against the run.
- **Correctness:** the same scripts and durable-state contract; only the *writer* of the claim +
  authoring moved (main → `workflow-planner`). Freeze-integrity is preserved because governance
  **re-runs** the validator on the durable plan (the planner's self-check `--json` is orientation
  only). Resume is hardened: the front end refuses-and-returns if a plan already exists.
- **Versions:** Claude/main `5.0.0 → 5.1.0`; Codex packs `3.0.0 → 3.1.0`.
