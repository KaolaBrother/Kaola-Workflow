# 2026-06-15 — #472 dispatch-fidelity live probe (read-axis)

**Closes the loop opened by [`2026-06-14-read-dispatch-dormant.md`](2026-06-14-read-dispatch-dormant.md).**

That forensic sweep proved the read-dispatch layer was **dormant**: across 21 archived runs the
executor never once ran two read nodes concurrently (`everConcurrent = false`, `mode1_serial` in every
run). #472 shipped the **dispatch-fidelity seam** — `open-next` diverts an authored independent ≥2
frontier to `enterBatch` instead of silently single-opening it; `open-ready` co-opens the whole
frontier and returns one `dispatch` descriptor per node; `deriveMaxSimultaneousOpen` derives
`everConcurrent` from the durable `opened`/`closed` telemetry; and `commands/kaola-workflow-plan-run.md`
makes one-message concurrent dispatch the **default**, not a voluntary side-card.

This document records the **live probe** that demonstrates the seam actually produces concurrent
dispatch through the real scripts — the proof #472's AC4 requires ("a test/run can prove
`everConcurrent = true` for an authored antichain of width N"). It is the read-axis analog of the
#463 2-leg worktree probe.

## Why a live probe, not just a unit test

`open-ready` co-opens a read frontier **unconditionally** (that is what `R1` in
`scripts/test-adaptive-node.js` already asserts). So a unit test that calls `open-ready` directly and
then reads the timing is **vacuous** — `everConcurrent = true` is guaranteed by construction and the
test cannot go RED against #472's actual defect, which is the *silent single-open in `open-next`*
(covered by `T472-DIVERT`). And no script test can reach the **dispatcher** — "nothing forces the N
`Agent` calls into one assistant message" was #472's root cause, and one-message dispatch is itself the
only thing that produces real concurrency. The honest proof is therefore a run that goes through the
real seam **and actually dispatches two agents in one message**, with the demonstrated concurrent
dispatch as the primary evidence and `everConcurrent` as corroboration.

## Method

A throwaway real git repo under `$TMPDIR` with a frozen plan carrying a **2-read antichain** — two
`code-explorer` nodes (`explore-a`, `explore-b`) both depending on a `seed`, neither depending on the
other (an authored independent read frontier of width 2), a `code-reviewer` gate on both, a `finalize`
sink. NATIVE posture (no recorded worktree) so the #466 authority-split guard does not fire. The plan
was frozen with the real `kaola-workflow-plan-validator.js --freeze` so `plan_hash` exists and
`open-ready`'s integrity `--resume-check` passes.

Every step below ran the **real** `scripts/kaola-workflow-adaptive-node.js` subcommands as
subprocesses rooted at the temp repo — no stubs, no injected git, no in-memory shim.

## Trace

### Step 1 — `open-next` diverts (AC1 / AC3)

```
$ adaptive-node.js open-next --project issue-472-probe --json
{"result":"ok","opened":null,"enterBatch":true,
 "frontier":[{"id":"explore-a","role":"code-explorer",...},
             {"id":"explore-b","role":"code-explorer",...}]}
```

`opened: null` — **zero** ledger rows flipped; no silent single-open. `enterBatch: true` + a
`frontier` carrying both authored nodes — the divert fired.

### Step 2 — `open-ready` co-opens both (AC1)

```
$ adaptive-node.js open-ready --project issue-472-probe --json
{"result":"ok","kind":"read",
 "opened":[{"id":"explore-a",...,"nonce":"710c22e270cd","dispatch":{...,"agent_type":"code-explorer"}},
           {"id":"explore-b",...,"nonce":"91eff9756e02","dispatch":{...,"agent_type":"code-explorer"}}],
 "runningSet":["explore-a","explore-b"]}
```

Both ledger rows → `in_progress`; one `dispatch` descriptor per node (the executor contract — the
orchestrator dispatches one agent per descriptor). `node-timings.jsonl` now holds two `opened` events
and zero `closed`.

### Step 3 — the dispatcher: two read agents in ONE message (the load-bearing piece)

Both agents were dispatched in a **single assistant message** (the harness runs them in parallel).
Each captured millisecond wall-clock timestamps (`node -e 'console.log(Date.now())'`) around a genuine
read task and wrote them, with its open-ready nonce, into its evidence file:

```
# .cache/explore-a.md
evidence-binding: explore-a 710c22e270cd
probe-start-ms: 1781489233268
probe-end-ms:   1781489239051
finding: ESCALATION_MARKERS = security, consent, test_thrash, merge_conflict

# .cache/explore-b.md
evidence-binding: explore-b 91eff9756e02
probe-start-ms: 1781489237292
probe-end-ms:   1781489241587
finding: DEFAULT_AGENT_MODELS.synthesizer = opus
```

Both agents did **real, independent work** against the live repo (and, as a bonus, their findings
cross-check this session's #463 step-2 `merge_conflict` marker and step-3 `synthesizer = opus` model).

> **Agent-type note.** The `open-ready` `dispatch` descriptors declare `agent_type: code-explorer`,
> but the probe dispatched `general-purpose` agents. The reason is purely instrumentation:
> `code-explorer` is read-only (Read/Grep/Glob) and cannot run `node -e` or `Write`, so it cannot
> self-record millisecond timestamps or its own evidence file. `general-purpose` agents were used as
> *measurement vehicles*. The mechanism under test — **one-message concurrent dispatch** — is
> agent-type-independent: a real run dispatches `code-explorer` agents through the identical seam
> (the same `dispatch` descriptors, the same single assistant message). The agent type changes only
> *who can hold a stopwatch*, not whether two agents run at once.

**Wall-clock overlap (PRIMARY proof of dispatch fidelity):**

```
explore-a : [1781489233268, 1781489239051]
explore-b : [1781489237292, 1781489241587]
overlap   = min(end) − max(start) = 1781489239051 − 1781489237292 = 1759 ms   →  concurrent: true
```

`explore-b` started **1759 ms before** `explore-a` finished — the two agents were executing
**simultaneously**. This is literal wall-clock concurrency, measured by the agents themselves, not
inferred from the ledger.

### Step 4 — close cycle + final telemetry (AC4 corroboration)

`close-node` for each leg (with its open-ready nonce) succeeded; closing `explore-b` correctly
advanced the DAG (`review` became `newlyReady`), proving the antichain rejoined its dependent. The
complete durable trace:

```
{"node":"explore-a","event":"opened","ts":"2026-06-15T02:06:01.308Z"}
{"node":"explore-b","event":"opened","ts":"2026-06-15T02:06:01.449Z"}
{"node":"explore-a","event":"closed","ts":"2026-06-15T02:08:21.732Z"}
{"node":"explore-b","event":"closed","ts":"2026-06-15T02:08:22.115Z"}

deriveMaxSimultaneousOpen → {"maxSimultaneousOpen":2,"everConcurrent":true}
```

Both `opened` precede both `closed` → `everConcurrent = true` on the **real** scheduler-produced
telemetry (not the synthetic strings of `T472-TELEMETRY`).

## What each proof does and does not show

- **Wall-clock overlap (1759 ms)** is the real proof of *dispatch fidelity*: two agents, one message,
  running at the same time. This is the capability #472's whole forensic sweep found had never once
  occurred.
- **`everConcurrent = true`** is corroboration. Note its honest limit: it measures **ledger-open-span**
  overlap — both rows `in_progress` between the second `opened` and the first `closed` — which the
  co-open guarantees once the divert fires. It is *consistent with* but does not by itself *prove*
  agent wall-clock concurrency; the timestamp overlap is what proves that. The two together close the
  gap the dormancy sweep identified ("asserted capability without a concurrency trace"): here there is
  both a concurrency trace **and** a wall-clock measurement.

## Acceptance-criteria mapping

| AC | Evidence |
| --- | --- |
| Independent read frontier of width N → all N dispatched concurrently (one message), by default | `open-next` divert (Step 1) + `plan-run.md` one-message-default prose + the 1759 ms wall-clock overlap (Step 3) |
| Width 1 / dependency chain → serial; no forced minimum width | `T472-SERIAL` (`open-next` single-opens a width-1 frontier, no `enterBatch`) |
| `open-next` does not silently single-open an authored-independent frontier | `open-next` returned `opened: null` (Step 1) + `T472-DIVERT` |
| Durable telemetry records simultaneous-open; a test/run proves `everConcurrent = true` for an antichain of width N | this probe (Step 4): real `node-timings.jsonl` → `everConcurrent: true`; `T472-TELEMETRY` covers the derivation math |
| Sequenced after #463; cross-edition (4 chains) green | #463 CLOSED 2026-06-14; the seam shipped with all four chains green |

## Reproduction

The probe used disposable `$TMPDIR` fixtures (removed after the run). To reproduce: build a frozen plan
with a 2-`code-explorer` antichain, run `open-next` (observe `enterBatch`), `open-ready` (observe two
`dispatch` descriptors), dispatch the two agents in one message with millisecond timestamp markers,
`close-node` each, then run `deriveMaxSimultaneousOpen` over `.cache/node-timings.jsonl`.
