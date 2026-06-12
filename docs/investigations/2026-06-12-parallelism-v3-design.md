# Parallelism v3 — Consolidate, Activate, Document: One Kernel + Lane-Attributed Writes + Speculative Overlap

**Date:** 2026-06-12
**Status:** Design (investigation)
**Relates to:**
- Issue #419 (parallelism v3 design)
- `docs/decisions/D-419-01.md` (Parts 1 + 3: the coordination kernel + scheduler-default posture)
- `docs/decisions/D-419-02.md` (Parts 2 + 4: disjoint-write parallelism + speculative gate overlap)
- `docs/decisions/0008-excise-write-role-batch-isolation.md` (ADR 0008 — the write-role batch excise
  + its #386 addendum; this design satisfies part of its recorded reintroduction condition)
- `docs/investigations/2026-06-10-parallelism-redesign.md` (the v2 predecessor; §2 below compares)
- The issue-419 n1-survey (the runtime evidence this analysis is grounded in)

---

## 0. Summary

After v2 (#364/#376/#377) the runtime ALREADY has the parts: a per-node running-set scheduler with
crash-safe two-phase opens and critical-path-first ordering, a `PreToolUse(Write|Edit)`
lane-containment hook, a validator that computes write-set disjointness at freeze. What it does NOT
have is the SEAM that turns these latent parts into a wide, default-on executor:

- The scheduler hard-gates ALL write nodes to `write_node_exclusive` — disjoint writes can never
  co-open, so the only realized parallelism is read-only fan-out.
- The validator computes the disjointness verdict and throws it away — there is no `parallel_safe`
  stamp anywhere in the codebase.
- The lane-containment flag (`KAOLA_LANE_CONTAINMENT`) is read only by the hook script, never by the
  Node aggregators; it defaults FALSE and is effectively inert.
- The six plan-run surfaces and the planner rubric document the executor as "one frontier unit at a
  time," biasing plan authors toward long serial chains even where the runtime could fan out.
- A gate node and its post-dominated descendant always run strictly sequentially — there is no way to
  overlap a gate with discardable downstream work.

The v3 verdict: this is a **consolidation + activation + documentation** design, not a rewrite. The
repo contains every mechanism; v3 supplies the wiring + one derived stamp + the prose. The four parts:

1. **P1 — One coordination kernel.** Name serial as the scheduler with `max_concurrent = 1`
   (subsumption, not deletion). Add an optional runtime `max_concurrent` field. Keep `open-next`
   byte-identical.
2. **P2 — Lane-attributed disjoint write parallelism.** Stamp the disjointness the validator already
   computes; let `open-ready` co-open disjoint writes behind `KAOLA_LANE_CONTAINMENT`.
3. **P3 — Scheduler-default posture.** Document the scheduler (not the serial loop) as the default
   executor; reward wide independent frontiers in the planner rubric. Prose change; no flag change.
4. **P4 — Consent-gated speculative gate overlap.** Let a descendant open speculatively while its gate
   runs, discardable on gate failure. Ship read-overlap; defer write-overlap.

Every part degrades to today's exact behavior under its OFF condition, and the byte-identical serial
fallback (the hard invariant of the whole adaptive path) is never touched.

---

## 1. Current state — three coordination surfaces, one of them inert by default

All three live in `scripts/kaola-workflow-adaptive-node.js` and
`scripts/kaola-workflow-parallel-batch.js`.

### 1.1 The serial loop (`open-next` / `close-and-open-next`)

The default and dominant path. `open-next` flips one pending ledger row to `in_progress`
(`spliceLedgerNode` with `allowFrom:['pending']`) then records a per-node baseline via
`commit-node --start`. `close-and-open-next` is the fused commit + advance: evidence-shape check →
barrier (`commit-node --barrier-check` + `--gate-verify`) → ledger close + compliance row →
running-set removal (the #411 BUG B fix) → selector routing → next-action fused advance. It produces
exactly one `in_progress` row at a time. Under the serial fallback (no `running-set.json`, no active
batch, ≤1 `in_progress` row) every guard-prologue layer is vacuously-pass and the path is
byte-identical to pre-#383 behavior.

### 1.2 The running-set scheduler (`open-ready` / `close-node` / `reconcile-running-set`, #377)

The per-node event-driven fan-out. It tracks individual concurrent nodes in `.cache/running-set.json`
(`{ state:'opening'|'open', nodes:[{id, role, kind, baseline, opening?, model?, openedAt?}],
updatedAt }`) with a two-phase crash-safe write: Phase 1 writes `state:'opening'` → Phase 2 records
baselines + flips rows → Phase 3 promotes to `state:'open'`. `runOpenReady` (~L2109) classifies the
frontier: read-only nodes fan out up to `fanoutCapReadonly` (default 8, env
`KAOLA_FANOUT_CAP_READONLY`) minus already-live nodes; a write node opens alone only when the running
set is empty. **If ANY live node is a write node, `open-ready` returns `{reason:'write_node_exclusive'}`
— this is the single hard gate v3 Part 2 relaxes.** Priority-orders the openable frontier by
`longestPathToSink` (critical-path-first list scheduling), excluding `main-session-gate` nodes.
`runCloseNode` (~L2269) closes one node: evidence-shape + nonce binding → barrier → ledger
`complete` + compliance row → selector routing → remove from running-set → next-action returns the
newly-ready frontier. `reconcile-running-set` (~L2401) is the crash-recovery for open-direction,
close-direction, and stale-member crashes, dropping per-node baselines via `--drop-base`.

### 1.3 The batch scheduler (`parallel-batch.js`)

Treats a whole ready-pending frontier as a single unit (`opening → open → sealed → joined`; the
`joining` state was removed in #364). Read-only fan-out only today — write-role frontiers
serial-degrade unconditionally (`{degraded:true, reason:'cwd_unenforceable'}`) since ADR 0008 excised
the member-worktree isolation. Two caps: `FANOUT_CAP` (default 4, effectively unused since write-role
batches degrade) and `FANOUT_CAP_READONLY` (default 8, the active read-only cap). A subtle gap: the
batch path uses `deriveReadyPending(nextAction.readySet, ...)` over the UNSORTED `readySet`, so it does
NOT open critical-path-first the way `open-ready` does — only the running-set scheduler consumes the
`longestPathToSink`-sorted `readyPending`.

### 1.4 The #383 guard prologue keeps the three surfaces mutually exclusive

`mutationGuardPrologue` (~L2058) runs three layers before every mutating subcommand: INTEGRITY (#387,
shell `--resume-check`) → HALT FENCE (#391b, durable `consent_halt`) → LIVE-COORDINATION (#383,
`probeCoordination` → typed refusal per the per-command exclusion set). The three coordination refusal
arms — `serial_node_live`, `scheduler_active`, `batch_active` — are DISTINCT typed reasons with
DIFFERENT repair pointers, which is why v3 keeps them three-armed rather than merging them (see §3
under Part 1). The derived `serialLive` predicate is exactly:

```
serialLive = inProgressIds.length === 1 && !runningSetLive && !batchLive
             && !runningSetOpening && !batchOpening
```

This predicate IS the latent kernel model — "serial is the degenerate scheduler" — already computed by
the runtime but neither named nor exploited.

### 1.5 What the survey confirmed is NOT present today

- No `parallel_safe` string anywhere in the codebase. The validator computes disjointness at freeze
  but does not stamp it.
- No freeze-time `write_node_exclusive` annotation. The string appears ONLY as a runtime return reason
  from `runOpenReady` (~L2155), never as a plan stamp.
- `KAOLA_LANE_CONTAINMENT` (`resolveLaneContainment`, default FALSE) is read by
  `hooks/kaola-workflow-write-lane.sh` and is mentioned in the aggregators ONLY in comments as the
  "reintroduction condition." Lane-containment enforcement is dormant by default.

---

## 2. Why v3 now — what each part unblocks, and what blocks it today

### 2.1 P1 — the kernel is half-built but un-named

The runtime already treats serial as a degenerate scheduler (`serialLive`, §1.4), but nothing names
it, so:

- Parts 2 and 4 each need a coherent "the scheduler with N > 1" arm to layer on. Without a settled
  kernel model, each would have to re-derive the serial-vs-scheduler relationship.
- A `reconcile-running-set` roll-forward has no way to remember the concurrency a crashed run was using
  — there is no persisted cap.

**What blocks the obvious "just collapse `open-next` into `open-ready --max 1`" move:** the serial path
deliberately has a DIFFERENT guard matrix (`open-next`: `excl:['scheduler','batch']`, no integrity
layer because `orient` already ran `--resume-check`; `open-ready`: `integrity:true,
excl:['serial','batch']`) and a DIFFERENT on-disk footprint (it writes NO `running-set.json`). The
byte-identity invariant ([INV-2]) depends on `open-next` writing no manifest. So P1 unifies the MODEL
and the optional `max_concurrent` field, and explicitly DEFERS the wrapper collapse (OQ-P1-b) — a
rewrite would have to re-prove byte-identity under the four-chain gate.

### 2.2 P2 — the validator computes disjointness and discards it

At freeze the validator classifies every antichain write pair (`plan-validator.js` L1028-1056):
EXACT-file overlap ⟹ RED refuse; coarse / shared-infra overlap with a shared ancestor ⟹ ASK
(`concurrentAmbiguousOverlap`); truly disjoint ⟹ silently pass. The THIRD outcome is exactly the
information `open-ready` would need to co-open two write nodes — and it is thrown away. Meanwhile the
runtime gate (`write_node_exclusive` for ANY live write node) is unconditional.

**What blocks write parallelism today:** (a) the discarded disjointness verdict — there is no stamp to
read; (b) the unconditional `write_node_exclusive` gate; (c) `KAOLA_LANE_CONTAINMENT` being inert (read
only by the hook). P2 supplies the stamp (derived, recomputed-on-open, out of `plan_hash`), the
lane-checked `open-ready` variant, and the activation of the flag — reusing the SINGLE
`disjointWriteSets` engine (`classifier.js` ~L327) that freeze, the fan-out group check, and the
concurrent-sibling check already share, so there is never a second disjointness implementation.

**Why behind a flag, and why the barrier is still the boundary:** ADR 0008's excise proved the harness
cannot force a subagent CWD, so write nodes still run in the PARENT worktree. The containment story is
therefore TWO layers: the write-lane hook (fast-fail, `Write|Edit` only, Bash-bypassable) and the
per-node barrier (ground truth, tree-diffs ACTUAL writes against the declared lane at close). The hook
is the ergonomics boundary; the barrier is the security boundary ([INV-13]). This is why P2 ships
behind `KAOLA_LANE_CONTAINMENT` default-OFF: the flag gates the hook + co-open, but the barrier
enforces lanes regardless, so an OFF run is byte-identical to today and an ON run cannot be silently
defeated by routing a write through Bash.

### 2.3 P3 — the documented posture lags the runtime capability

The runtime supports background dispatch + rolling top-up + critical-path-first ordering (`open-ready`
consumes the `longestPathToSink`-sorted `readyPending`). But the six plan-run surfaces and the planner
rubric still describe "one frontier unit at a time," so plan authors serialize independent work for
ordering simplicity. **Nothing blocks P3 technically — it is a pure prose + rubric change.** The cost
of NOT doing it is a posture regression: every serialized independent node adds its full duration to
the makespan, and the planner is never told that an overlapped node hides behind the critical path for
free. P3's only hard constraint is propagation: the prose must reach all SIX surfaces ([INV-15], the
#400 contract) and the change must pass all four chains ([INV-16]). P3 carefully does NOT change the
OFF default of `KAOLA_LANE_CONTAINMENT` ([INV-18]) — "scheduler-default" means reads fan out by
default, NOT that write parallelism is on by default.

### 2.4 P4 — gates and descendants always serialize

A `code-reviewer` gate and its post-dominated `implement` descendant run strictly in sequence even
when the descendant could begin speculatively while the gate runs. There is no overlap mechanism.

**What blocks speculative overlap today (and why it is the riskiest part):** overlapping a gate with a
descendant means TWO nodes are `in_progress` at once — which requires the running-set scheduler
(`max>1` arm, [INV-23]) and cannot work on the serial surface. The risk is a speculative write building
on code the gate will reject. P4's containment is conservative-correct: the descendant is `in_progress`
NEVER `complete` while the gate runs ([INV-21], the load-bearing invariant); the gate's `complete` +
passing verdict is the strict prerequisite for the descendant's close (new `gate_not_complete`
refusal); a failing gate rolls back the ENTIRE speculative frontier to baseline ([INV-20]/[INV-25]). A
speculative WRITE descendant is double-gated behind BOTH `speculative_open_policy: consent` AND
`KAOLA_LANE_CONTAINMENT=true` — which is why v3 SHIPS read-overlap (near-zero blast radius) and DEFERS
write-overlap to a follow-up with its own adversarial gate.

---

## 3. How v3 compares to the v2 design (2026-06-10)

The v2 investigation (`2026-06-10-parallelism-redesign.md`) designed the per-node primitives that v3
now consolidates. The relationship is cumulative, not a replacement:

| Concern | v2 (2026-06-10) | v3 (this design) |
|---|---|---|
| Telemetry | D1: `node-timings.jsonl` wall-clock | shipped; v3 assumes it for makespan claims |
| Background dispatch | D2: `run_in_background` member dispatch | shipped in the scheduler; v3 makes it the DOCUMENTED default (P3) |
| Split caps | D3: `FANOUT_CAP_READONLY` (8) vs write cap | shipped; v3 persists the resolved cap as `max_concurrent` (P1) |
| Write-lane hook | D4: `KAOLA_LANE_CONTAINMENT` PreToolUse hook | shipped + #386 self-exempt; v3 ACTIVATES it for write co-open (P2) |
| Running-set scheduler | D5: `open-ready`/`close-node` core | shipped (#377); v3 names it the `max>1` kernel arm + relaxes `write_node_exclusive` (P1+P2) |
| Optimistic lane concurrency | D6: detect-and-repair, 3-way merge | NOT adopted — v3 keeps PREVENT (disjoint-only co-open), no merge-on-join |
| `map(<group>)` dynamic fan-out | D7: runtime-width shape | OUT OF SCOPE for v3 (separate grammar work) |
| Speculative gate overlap | not in v2 | NEW in v3 (P4) |

The key DIVERGENCE from v2: v3 does NOT adopt D6's "relax plan-time serialization from prevent to
detect-and-repair with a 3-way merge-on-join." v3 keeps the PREVENT posture — only validator-stamped
DISJOINT write nodes co-open, and the join is still per-declared-path checkout (no `merge_conflict`
escalation, no `git merge-file`). This is deliberately conservative: v3's write parallelism is
zero-conflict-by-construction (disjoint sets cannot collide), so it does not need the merge machinery
or the new escalation vocabulary D6 proposed. Optimistic overlap (overlapping sets, detect-and-repair)
remains a future direction, not a v3 commitment.

---

## 4. Why this approach versus alternatives

**Why subsumption (P1), not deletion of `open-next`?** A full collapse of `open-next` into
`open-ready --max 1` is the tempting "one true path" move, but it threatens [INV-2] byte-identity: the
serial path writes no `running-set.json` and runs a different guard matrix, both of which adversarial
fixtures pin. The cost of a regression here is the entire adaptive path's fallback guarantee. v3
unifies the MODEL (one invariant defines "serial") and persists one optional field, leaving the two
code paths as the kernel's `max=1` and `max=N` entry points. The wrapper collapse is recorded as a
future consolidation contingent on re-proving byte-identity (OQ-P1-b).

**Why a DERIVED stamp (P2), not a planner-authored `parallel_safe`?** A hand-authored concurrency flag
is a security hole: a planner (or a tampered plan) could stamp `parallel_safe: true` on overlapping
write sets and grant illegal concurrency. The validator already computes the truth from declared write
sets; v3 stamps the COMPUTED verdict, recomputes it on every read ([INV-9]), and ignores any
author-supplied value ([INV-8]). The planner authors only TOPOLOGY and DISJOINT write sets; the
validator derives safety. This also keeps the stamp out of `plan_hash` (it is a projection of
already-hashed data) so a re-run at a different concurrency does not spuriously fail resume-check.

**Why keep three refusal arms (P1), not merge `serial_node_live` into `scheduler_active`?** The
emit-envelope contract (#406) requires callers to classify failures by a stable `reason` code, never by
string-match. The two refusals carry DIFFERENT repair pointers (`close-and-open-next` vs `close-node` /
`reconcile-running-set`). Merging them degrades the repair guidance and breaks downstream
`reason`-matching tests for no structural benefit — the `serialLive` predicate is already a derived
view, so the model is unified without flattening the taxonomy.

**Why a hash-covered Meta field for P4 consent, but runtime fields for P1/P2?** This is a deliberate
ASYMMETRY. `max_concurrent` (P1) and `parallel_safe` (P2) are runtime resource limits / derived
projections — they do not change the LEGAL execution shape, so they stay out of `plan_hash` (and a
re-run at a different concurrency must not fail resume-check). `speculative_open_policy` (P4) DOES change
the legal execution shape (it permits a descendant to be `in_progress` ahead of its gate's `complete`),
so it MUST be tamper-evident and frozen — it is the one new field that enters the hash. Per-run consent
stays non-persisted because it gates ACTIVATION, not eligibility ([INV-19]).

**Why ship read-overlap but defer write-overlap (P4)?** A speculative READ descendant has near-zero
blast radius (no writes to revert; evidence discard only). A speculative WRITE descendant can build on
code a gate will reject, widening the gate failure's blast radius. The write case is double-gated
([INV-24], both `consent` AND `KAOLA_LANE_CONTAINMENT`) and needs a tested baseline roll-back of actual
on-disk writes — enough additional risk that it earns its own adversarial gate in a follow-up. v3
records it as DESIGNED-but-DEFERRED so the schema is forward-compatible without shipping the risk.

---

## 5. What does NOT change

The post-dominance gate grammar, the unique `finalize` sink, `plan_hash` freeze semantics, the per-node
barrier + evidence discipline, the consent/security/test_thrash escalation contract, the four ledger
states ([INV-4]), the running-set `opening` crash state + reconcile ([INV-5]), the serial write-alone
fallback under the OFF default ([INV-6]), and the validator's fail-closed refusal style. Every v3 part
changes WHEN nodes run (or whether the runtime documents itself accurately), never WHAT must be proven.
The barrier remains the ground truth ([INV-12]); stamps and hooks are derived / fast-fail conveniences,
never security controls ([INV-9]/[INV-13]).

---

## 6. Verification policy (carried forward, still binding)

- A green walkthrough proves STATE correctness only. Claim wall-clock parallelism only from the v2 D1
  `node-timings.jsonl` telemetry on a real harness run, never from the unit suite.
- The P2 write-lane activation requires a live dispatched-subagent denial probe as recorded evidence
  (the walkthrough cannot simulate hook firing).
- Everything ships ×4 editions; `adaptive-schema.js` stays byte-identical (the cross-edition drift
  anchor); the P3 prose must reach all SIX plan-run surfaces ([INV-15]) and all four
  `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains must be green, run sequentially,
  before finalization ([INV-16]). A green claude chain alone is insufficient evidence.
- New close-refusal reasons (`gate_not_complete`, P4) join the emit-envelope precedence family
  (OQ-P4-b); no string-matched classification.
