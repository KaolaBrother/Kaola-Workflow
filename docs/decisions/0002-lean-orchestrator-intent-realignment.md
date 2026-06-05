# 2. Lean-orchestrator realigned to original intent (contractor at every seam)

Date: 2026-06-05
Status: Accepted
Issue: #242 (intent realignment; ships in v5.0.0)
Supersedes: `docs/investigations/lean-orchestrator-part-b-plan.md` Decisions 1 and 4

## Context

The #242 "lean-orchestrator" parent design
(`docs/investigations/lean-orchestrator-contractor-2026-06-04.md`) stated a categorical intent: the
6-phase, fast, and adaptive paths "run a large amount of *procedural* work (running scripts, parsing
output, writing ledger/state/roadmap/archive) in the **main session**", and the goal was to **move
that mechanical work to a single Sonnet `contractor` subagent** at every seam — including, verbatim,
the adaptive node→node handoff ("per node, contractor runs `commit-node`, verifies `.cache`, writes
ledger row + state pointer"). Boundary rule: *"Opus decides what and dispatches roles; contractor
does everything that is just running scripts and writing durable files."*

A later run-1 plan (`lean-orchestrator-part-b-plan.md`, authored by a `code-architect` adaptive
*node*) overrode this for v4.1.0:

- **Decision 1** made the adaptive per-node loop "aggregator-direct" — the main session ran
  `commit-node`/`next-action` itself (invoking the parent doc's "if round-trip cost too high, fall
  back" clause).
- **Decision 4** kept the orchestrator authoring the `## Nodes` plan table inline (flagged a
  deferred "run-2 evaluation item").
- The phases-2–5 "bracketing" (C4) was dropped entirely.

In real adaptive runs the owner observed the "starting contract" + connecting work executing inline
in the main Opus context instead of via subagents, which is exactly what the parent intent meant to
eliminate. An adversarially-verified audit
(`docs/investigations/2026-06-04-lean-orchestrator-intent-audit.md`) confirmed 26+ inline
script/bookkeeping sites across every path. The owner directed realigning **all paths** to the
original intent in one release.

## Decision

Reverse Decision 1, reframe Decision 4, and build the dropped C4. The **contractor** runs every
workflow script and writes every durable bookkeeping file, at **every** seam:

- **Router/startup** — deliberately **kept deterministic in the main session** (the bootstrap
  exception). It is the entry point that summons every subagent, so it has nothing to capture before a
  dispatch; offloading it would force prose-transcribing the startup JSON back into the shell for the
  downstream git-freshness/routing bash — trading determinism for fragility. The safe contractor
  pattern (phase1/phase6) captures data *before* a dispatch and never parses the contractor's prose
  back into bash; the router cannot follow it. (Evaluated and reverted during implementation.)
- **Adaptive authoring** — the **planner** *proposes* the decomposition; the main session authors +
  governs + `plan_hash`-freezes the `## Nodes` table (Decision 4 reframed, not simply reversed — see
  Constraints); the contractor runs the validator `--json` (governance input, returned verbatim),
  the `--freeze`, the planning-evidence checkpoint, and the per-issue roadmap `init-issue`.
- **Adaptive per-node loop** — each role dispatch is bracketed by two contractor calls: *advance*
  (`next-action` + `commit-node --start` + `in_progress`) and *commit* (`.cache` verify + barrier +
  `complete` + compliance row). The main session dispatches the role and **owns the consent-halt /
  escalation decision**; the contractor writes the markers on its instruction.
- **Phases 1–6** — the contractor owns the post-dispatch ledger/state/phase-file writes; the main
  session hands its verdict (Selected Approach, Review Status, etc.) into the contractor, which
  transcribes it verbatim.
- **Fast path** — the contractor runs the `.cache` mkdir, per-step state writes, the acceptance-check
  run, and authors `fast-summary.md` from the orchestrator's PASSED/ESCALATED verdict.

## Constraints (what the main session must keep)

A hard harness limit bounds the realignment: **subagents cannot dispatch subagents** (parent doc
"Governing constraints #1"). Therefore the main session **always** keeps:

- The **dispatch** of every subagent (role agents, planner, and the contractor itself) and the loop
  control flow.
- All **governance/judgment** (#44): issue selection, risk auto-run/ask, the consent-halt decision,
  RED/GREEN judgment, the phase verdicts, the git-freshness ask.
- The **sink** (merge/PR + `gh issue close` recheck) and the **branch cut** (worktree-HEAD semantics).
- The research synthesis (`phase1-research.md`) and the **`## Nodes` table authoring write** — the
  planner has no `Write` tool and the orchestrator must comprehend the DAG to govern + freeze it, so
  "planner does the planning" means *planner proposes, orchestrator authors+freezes*.

## Consequences

- **Cost:** a per-node contractor round-trip adds latency/tokens. This is the accepted trade for a
  lean Opus context (the parent doc flagged it; the owner chose lean-main over per-node latency). The
  aggregator scripts + a thin contractor prompt keep the per-call cost low.
- **Correctness:** unchanged. The scripts and the durable-state contract are the same; only the
  *writer* moved (main → contractor). The contract validators, the walkthrough, and the per-node
  resume contract are preserved; a new resume branch was added (`in_progress` + complete `.cache` →
  re-run the commit bracket, not the role).
- **Versions:** Claude/main `4.1.0 → 5.0.0`; Codex packs `2.1.0 → 3.0.0`.
