# Parallel Read-Only Nodes Run Serially — the Scheduler Shipped, the Dispatcher Never Did

**Date:** 2026-06-14
**Status:** Investigation (findings, empirical)
**Relates to:**
- Issue #419 (parallelism v3 design-of-record) + `docs/decisions/D-419-01.md` / `D-419-02.md`
- Issues #303 / #375 / #377 / #438 / #439 (the read-axis stack — all CLOSED)
- Issue #374 (background member dispatch — CLOSED, shipped docs-only)
- Issue #463 (OPEN, in-flight: parallel **write** fan-out via `.kw` per-leg worktrees + synthesizer barrier)
- `docs/investigations/2026-06-12-parallelism-v3-design.md` (design predecessor; this doc supplies the runtime ground-truth that design assumed)

---

## 0. Summary

User observation: the planner authorizes parallel read-only nodes (`code-explorer` / `code-architect`),
but they execute serially.

Verified three independent ways — telemetry forensics across all 21 traced archived runs, an
adversarial refutation of the root-cause claim, and a backlog/#463 scope audit — cross-checked against
direct reads of the scheduler and the issue states.

**Finding: read-axis parallelism is capability-complete at the SCRIPT layer but structurally DORMANT
at the DISPATCH layer. It has never once executed.** Across every archived run with a durable
open/close trace, `everConcurrent = false`: strictly one node `in_progress` at a time. The read-axis
issues are all CLOSED, yet no run has ever overlapped two reads — because what shipped was a
**scheduler** (it marks N rows `in_progress`), not a **dispatcher** (nothing converts that into N
concurrent agents).

This is not a regression. It is the steady state, and it is the precondition gap under #463.

---

## 1. Empirical ground-truth (telemetry forensics)

Method: examined all 21 archived adaptive runs carrying `.cache/node-timings.jsonl` (12 also carry
`provenance-log.jsonl` with per-open nonces). Reconstructed the `opened`/`closed` event sequence per
run; computed the **max number of distinct node-ids simultaneously open** (set semantics on node-id —
an idempotent resume re-open emits a second `opened` with the *same* nonce and must not be counted as
a second unit). Cross-referenced every node-id to the `## Nodes` table to label read-only
(`declared_write_set` empty/`—`) vs write.

| Result | Count | Notes |
|---|---|---|
| `maxSimultaneousInProgress = 1` | 16 runs | strictly serial `open → close → open` |
| `maxSimultaneousInProgress = 2` | 5 runs | **all non-concurrency** (see below) |
| True read antichain ever overlapped | **0 runs** | `everConcurrent = false`, `mode1_serial` |

The 5 "maxOpen=2" runs (issue-435/442/443, bundle-424-432-433) are **not** read fan-out: every
overlap moment is exactly one `code-reviewer` lingering `open` in the log while an **upstream WRITE**
node is *reopened* to fix a review finding (the serial review→repair loop, #308/#443). The reviewer
transitively `depends_on` the reopened node, so they are not an antichain (read-only count never = 2).
bundle-429-434's apparent read+read pairing is a truncated/resume orphaned-open artifact in the timing
log; the authoritative provenance log proves the two reads never overlapped.

### 1.1 The frontier is almost never even authored

Across **all ~240 archived plans**, a read antichain (≥2 mutually-independent read-only rows) was
authored **exactly once** — issue-242 (`review || partb-arch`), which predates #424 telemetry and ran
in the serial era with no overlap trace.

Shape census across all plans: **518 `sequence`, 2 `fanout` (both write/implementer), 0 read / map /
parallel shapes ever.** The dominant real pattern is a single `design`/`explore` root, or
`code-explorer → code-architect` **chained** (`architect depends_on explorer`, e.g. issue-249) — which
is *correct serial-by-DAG*: the architect consumes the explorer's findings. A large fraction of the
reported "parallel-allowed but serialized" is a dependency edge the planner authored deliberately, not
a scheduler failure.

---

## 2. Root cause

Two compounding layers.

### 2.1 Authoring — the parallel read frontier is rarely created (§1.1)

Even though the planner profile (post-#438 / D-419-01) explicitly instructs *"author parallel
read-only analysis nodes … prefer fanning them out,"* issues seldom decompose into ≥2 genuinely
independent read tasks, and the planner conservatively chains explorer→architect.

### 2.2 Dispatch — concurrency is structurally advisory; nothing forces it (**the crucial gap**)

The adversarial probe searched for any mechanism that forces concurrent dispatch and found **none**.

- **Scripts never dispatch agents.** They only flip ledger rows to `in_progress` and write baselines.
  Every actual dispatch is a tool call the *orchestrating model* chooses to emit.
- **The default Loop Skeleton is serial:** `orient → open-next (ONE) → dispatch ONE →
  close-and-open-next`. `runOpenNext` (`scripts/kaola-workflow-adaptive-node.js:1626`) unconditionally
  opens `nextAction.nextNode` (= `readySet[0]`) at a ≥2 frontier — **no `enterBatch` check, no
  diversion to `open-ready`, no refusal.** Its guard prologue refuses only against an *already-live*
  scheduler/batch or a halt fence, never on a fresh ≥2 frontier.
- **`enterBatch:true` is read by no script.** `orient` (`:1407`) and the fused advance (`:2035`)
  compute and return it, but it is purely advisory — gated behind a *voluntary* card pointer in the
  command prose. The card (`docs/plan-run-cards/frontier-batch.md`) even states *"When in doubt, use
  serial … parallel is an optimization, not a requirement."*
- **No single-message enforcement.** Even when `open-ready` marks N reads `in_progress` (cap 8,
  `KAOLA_FANOUT_CAP_READONLY`), nothing forces the orchestrator to emit the N `Agent` calls **in one
  assistant message** — and one-message batching is the *only* thing that yields real concurrency.
  This is the "**one-message dispatch is itself a barrier**."
- **#374** — the issue titled *"make rolling top-up actually roll"* — **closed as a docs-only commit**
  (`36142628`). The current tree has **zero** `run_in_background` / background-dispatch wiring. The
  barrier was never mechanically removed.

Net: even a perfect plan with a genuine read antichain serializes by default, because the executor has
no primitive that converts scheduler state (`enterBatch` / `open-ready`) into concurrent dispatches.
It is left to model discretion against a skeleton that models serial iteration — and telemetry shows
the model picks serial 100% of the time.

---

## 3. Why "the issues are CLOSED" and "it never ran" are both true

The read-axis stack (#303 end-to-end fanout, #375 read cap 8, #377 running-set scheduler single→multi
open, #438 scheduler-default prose ×6, #439 speculative read overlap) shipped the **scheduler** — the
machinery that *can* mark N reads ready and `in_progress`. It is real and code-confirmed
(`runOpenReady`, `:3403`, opens `readOnly.slice(0, slots)`). What none of them shipped is a
**dispatcher** — the seam that turns N-`in_progress` into N concurrent agents. That seam is the
load-bearing missing piece, and it is the gap this investigation isolates.

---

## 4. Relationship to #463 (the crucial coordination point)

#463 (the only OPEN issue; actively in-flight in a second session) is purely the **write axis**:
runtime-neutral per-leg `.kw/legs/<project>/<node>` worktree isolation + a `synthesizer` commit
barrier + validator PREVENT→DETECT relaxation (`write_overlap_policy`). It does **not** touch the
dispatch gap.

The risk: **#463 builds elaborate parallel-*write* machinery on top of the same dispatch layer that
has produced 0% real concurrency in 21 runs.** If the orchestrator dispatches the write legs serially
(as it always has), #463's worktree isolation and synthesizer barrier execute correctly but the legs
**never actually overlap** — paying all the isolation complexity for the same serial makespan. The
**dispatch primitive is the shared prerequisite both axes need** to deliver measured wall-clock
speedup, and it is #463's measurement precondition.

Collision note: a read-axis dispatch fix shares files with #463 — `adaptive-node.js`
(`open-ready`/`close-node`/`reconcile-running-set`), the six plan-run prose surfaces, and
`adaptive-schema.js` (the cross-edition byte-identical anchor). There is **no disjoint lane**. Per the
project's parallel-safety convention, any such fix must be **deferred behind #463's merge**, never run
concurrently with it.

---

## 5. Recommendation

1. **Do not attempt a read-axis code fix now** — it collides with in-flight #463 on shared files with
   no disjoint lane.
2. **Track the dispatch primitive as the shared dependency** of both the read and write axes (and as
   #463's measured-speedup precondition): an executor-side seam that converts `enterBatch` /
   `open-ready` N-`in_progress` state into a single-message concurrent dispatch (e.g. an
   `open-ready` → "dispatch these N now, in one message" contract the skeleton makes the **default**
   at a ≥2 frontier, or background `run_in_background` dispatch with a join barrier — the #374 intent,
   actually wired this time).
3. **Add runtime telemetry that records wall-clock overlap** so "parallel works" is provable, not
   assumed — every prior closure asserted capability without a concurrency trace.

This is a wiring + default-posture-enforcement gap, not a rewrite: the scheduler already exists; what
is missing is the one seam that makes its output actually dispatch concurrently.
