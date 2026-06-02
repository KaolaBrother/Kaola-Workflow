# Tier 3 (non-binding research note): does a barrier-checkpointed headless runtime ever earn its resume risk?

**Date:** 2026-06-03
**Status:** Research note — a deferred *study only*. **Nothing in Tiers 1–2 depends on this.**
**Relates to:** `docs/investigations/dynamic-workflow-composition-2026-06-02.md`
(the adaptive-path design-of-record — see *The substrate fork (resolved)* and *Out of scope*).
**Tracks:** issue #229.

---

## Why this is a note, not an implementation

The adaptive path shipped in Tier 1 (#227) executes on **Branch A**: the agent
authors `workflow-plan.md`, then the `kaola-workflow-plan-run` executor walks the
DAG + Node Ledger dispatching one role at a time, checkpointing
`workflow-state.md` + the ledger + `.cache/` evidence **between** role calls. The
design-of-record evaluated and **rejected Branch B** (a literal headless
Workflow-tool runtime: `agent()`/`pipeline()`/`parallel()` run to completion in
the background) *as a runtime of record*, while **adopting its grammar + static
validator insight** on the Branch-A substrate.

This note exists only to record **what a future study would have to measure** if
anyone ever revisits Branch B, and to file the deferred "curated-template
convenience" as an explicit opt-in that is never on the critical path. It commits
to nothing. The shipped Tier-1 behavior is unaffected by anything written here.

## The question, stated precisely

> Can a **barrier-checkpointed** headless runtime preserve Kaola's durable-state,
> resume, and compliance invariants — and if so, at what cost relative to the
> Branch-A markdown + `Agent()` substrate already shipped?

The adjective **barrier-checkpointed** is load-bearing. A naive headless run
returns once, at the end. The design-of-record's decisive observation:

> The moment you add the per-node checkpoint barrier required to survive resume,
> "one headless run" decomposes into per-node returns — which *is* Branch A's
> cadence in Workflow's clothes. The barrier that buys durability collapses
> Branch B's only advantage.

So the study is really asking whether there is *any* point on the spectrum
between "one headless run" (max concurrency, zero durability) and "per-node
checkpointed" (Branch A) that strictly dominates Branch A. The prior is that
there is not — but the prior is not a measurement.

## What a study would have to measure (acceptance for a *future* tier, not now)

1. **Crash-resume fidelity.** Inject a crash at each of: mid-node, between two
   fan-out instances, mid-quorum-tally, and at the barrier. For each, does the
   headless runtime leave enough durable state for `repair-state` to re-dispatch
   exactly the unfinished work without double-applying a completed node? Branch A
   already passes these (walkthrough: crash-resume, consent-halt, tamper). The bar
   is **parity, not improvement** — a headless runtime that loses any of these on
   the first interruption is strictly worse.
2. **Single-writer ledger integrity under concurrency.** `parallel()`/`pipeline()`
   create concurrent writers to the single-authoritative Node Ledger. Measure
   whether a barrier serialization that preserves ledger integrity leaves any
   *wall-clock* win over Branch A's sequential-with-checkpoints dispatch. (Branch A
   already states fan-out is *logical/topological*, dispatched sequentially — the
   benefit is assurance, not wall-clock.)
3. **Compliance-ledger-with-evidence preservation.** Every executable node must
   still emit one `## Required Agent Compliance` row with evidence, and the
   anchored `delegationPolicyCompliance()` matcher must still fire on the bare
   `code-reviewer`/`security-reviewer` keys. Measure whether a headless runtime
   can write these mid-run (it does not naturally).
4. **Parity-surface cost.** Branch B is a *new execution substrate* bolted onto
   the full four-edition parity surface (Claude/Codex + the renamed GitLab/Gitea
   forks), for a capability Branch A already provides. Measure the added
   maintenance + drift surface honestly against the (likely zero) capability gain.

A future tier would adopt Branch B **only** if it demonstrably *dominates* Branch A
on at least one of these without regressing the others. The standing expectation,
unchanged from the design-of-record, is that it cannot — the barrier required for
(1)/(3) collapses the concurrency that is its only theoretical advantage (2).

## Curated-template convenience (opt-in, non-binding)

The design-of-record removed a curated template library from the load-bearing
path: templates were never a correctness mechanism (the post-dominance gates hold
over *any* topology), only a human-pre-vetting-of-*shape* shortcut for
authorization. A small library of human-authored starting plans the agent *may*
begin from is **permissible as a future convenience** but is filed here, with this
study, as strictly opt-in:

- It would never be a prerequisite to free authoring (the agent still composes the
  `## Nodes` table directly).
- It changes nothing about correctness — every started-from-template plan still
  passes the same validator and the same risk gate.
- It is therefore a convenience-only add, never a staging dependency for Tiers 1–2.

## Conclusion

This note records the study framing and the opt-in convenience. It **builds
nothing** and changes no shipped behavior. The adaptive path's runtime of record
remains Branch A; Branch B remains rejected-as-runtime, available only as a future
measurement that must clear the parity bar above before it could ever be adopted.
