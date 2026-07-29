# Card: Codex Join Protocol (wait budgets, agent lifecycle, writer kill-safety, frontier discipline)

**When to read:** any time you dispatch a Codex agent via `spawn_agent` (or, on the Claude/forge
runtime, a teammate) and need to decide how long to wait, when to nudge it, or how to reclaim it
safely. This card is the detailed mechanics behind the "Codex Join Protocol" / "Wait budget,
escalation, and writer kill-safety" prose in the plan-run skeleton.

**Related:** `dispatch.wait_budget_minutes` on every dispatch card (`open-next` / `open-ready` /
`close-and-open-next`); the `delegation_outcome` node-evidence field; `reconcile-running-set`'s
writer-kill-safety verdicts; `docs/plan-run-cards/frontier-batch.md` (the running-set scheduler
this protocol layers on top of).

<!-- PIN: join-protocol -->

---

## 1. Wait budget — never interrupt a healthy `running` agent

Every dispatch card carries `wait_budget_minutes`, resolved from the node's effort tier:

| Tier | `wait_budget_minutes` | Source |
|---|---|---|
| `reasoning` (legacy `opus`) | 40 | `planner_model` |
| `standard` (legacy `sonnet`) | 20 | `planner_model` |
| absent/blank/unrecognized | 20 | `role_default` — always a concrete number, never null |

The frozen `## Nodes` table may add an optional `wait_budget_minutes` column. A blank cell, `-`,
`—`, or an absent column keeps the tier-derived value and source above byte-for-byte. A positive
override is authoritative on the dispatch card with `wait_budget_source: planner_override`; it may
extend, but never shorten, the effective role/model tier floor (20 minutes for standard, 40 for
reasoning) and is capped at 720 minutes.

Use an override only when concrete duration evidence — an issue requirement, command timing,
benchmark, or preflight result — supports the expected runtime. Put that evidence and expected
duration in the node brief. Difficulty alone is not duration evidence, and a larger value must not
be used to disguise a wedged agent. `finalize` and `main-session-gate` are nondelegable and cannot
declare an override. A `metric-optimizer` may use this general floor or its specialized
`optimize(<id>).budget_wallclock_minutes`, but declaring both is an ambiguous contract and is
refused.

The budget is the planner's ESTIMATE of how long the work takes, derived from the plan rather than
guessed, and every dispatch card carries one. It replaced an improvised patience ceiling (single-digit
minutes) that sat below the natural runtime of a substantive role node. A `running` agent interrupted
well inside its budget is usually just being interrupted.

It is an estimate, not a verdict: it is not a subprocess timeout, not a success signal, and never
permission to accept partial or missing evidence. Completion still requires the role's governed
deliverable and evidence contract however long it took.

---

## 2. Long-poll join loop — drain-all, no status probes

After dispatching a frontier (one member, or several under `enterBatch: true`):

1. Call `wait_agent` ONCE per iteration with a LONG timeout — minutes, at or near the host's
   `max_wait_timeout_ms` — passing every outstanding agent id where the tool accepts a multi-id
   wait ("pass multiple ids to wait for whichever finishes first").
2. On wake, call `list_agents` ONCE. Drain EVERY completed member found there before re-waiting:
   integrate its result, `record-evidence --stdin`, `close-node` (or the fused
   `close-and-open-next` for a serial node), and — where the tool surface exposes `close_agent` —
   call it as best-effort hygiene. Some sessions never expose `close_agent` at all, and some
   harnesses auto-reap completed agents without any close call; treat both as normal, not an
   error.
3. Re-enter step 1 with whatever agents remain outstanding.

A `send_message` "are you still there / status check" probe to a still-`running` agent buys nothing
as a liveness signal. A busy agent answers at its own turn boundary, at message boundaries, or after
its current tool call completes — never on demand — so silence and work look identical from outside,
and a probe that proves nothing reliably precedes a bad kill decision.

**Capacity is a reactive concern, not a proactive one.** Do not close a finished agent early "to
free a slot" — closure is hygiene, not the capacity remedy (see §5). Only react to an actual spawn
refusal.

---

## 3. Escalation — the order, not a gate

After the budget expires, escalation keeps its ORDER; the rungs are no longer gated on each other and
no fixed grace window is prescribed. Ask first, interrupt second, reclaim last:

| Move | Action |
|---|---|
| Ask | `followup_task` for the bounded deliverable now: "return your evidence and changed-file list." Reaches a running agent at its next message boundary or after its current tool call. |
| Interrupt | `interrupt_agent` (recoverable, not a kill — the agent remains available for messages/follow-ups), then a further `followup_task` asking the still-available agent for partial evidence and its changed-file list. |
| Reclaim | Reclaim the node. Reclaiming, and inline redo, are the expensive options — reach for them last. |

Record a typed outcome in the node's evidence for every delegation — column-0 `delegation_outcome:
<token>`, closed vocabulary, absent defaults to `completed`:

| Token | Meaning |
|---|---|
| `completed` (default) | The delegate finished and returned its deliverable normally. |
| `returned_partial` | Step 2 produced partial evidence/changed-file list before reclaim. |
| `interrupted_unresponsive` | The ladder ran to step 3 with no response at any rung. |
| `interrupted_obsolete` | The delegate was interrupted because its task became moot (e.g. a superseding plan-repair), not because it stalled. |

Never write a free-text "it stalled so I did it myself" in place of this token. An unrecognized value
does not stop the run: it is READ as `completed` and reported as a `delegation_outcome_normalized`
advisory on the emitted envelope, carrying the raw string you wrote so a reader still sees it.
Recording how a delegation ended is bookkeeping, and bookkeeping may report or normalize but may not
halt work that is already done and already evidenced.

`capability_gap` is the ONE exception, and it is excluded rather than normalized: it is not an outcome
of a delegation that ran, it is the role reporting it could not cover the brief at all. Reading it as
`completed` would write `complete` into the ledger for a node whose deliverable was withheld, so it
refuses at close and routes to `substitute-role` (see the role-capability coverage card).

---

## 4. Writer kill-safety — `reconcile-running-set`'s adopt/halt verdicts

An in-place writer (a node sharing the parent worktree) writes into the tree everything else is
reading, so interrupting one leaves whatever it had half-written in place with no owner — "it looked
idle" is the shortcut that produces exactly that. A writer that genuinely needs to be interruptible
belongs in an isolated `parallel_safe` leg instead (see
`docs/plan-run-cards/frontier-batch.md` §3): interrupting a leg writer discards that leg atomically
(worktree, branch, and leg-base ref torn down) — never a partial keep.

After reclaiming ANY in-place writer, run:

```bash
node kaola-workflow-adaptive-node.js reconcile-running-set --project {project} --json
```

Alongside its existing fields (`rolledForward`, `rolledBack`, `closedDropped`, `staleDropped`,
`state`), the response now also carries a per-writer verdict for every writer that left the live
set on this call:

```json
{
  "writerReconciliation": [
    { "node_id": "n4-impl", "verdict": "adopt", "reason": "in_write_set", "outOfWriteSet": [] },
    { "node_id": "n5-impl", "verdict": "halt", "reason": "write_set_overflow", "outOfWriteSet": ["scripts/unrelated.js"] }
  ],
  "writerHalt": true
}
```

- `verdict: adopt` — POSITIVE CONFIRMATION only: the barrier explicitly confirmed every changed
  path sits inside the writer's declared write set, OR the writer never recorded a baseline at all
  (it crashed before writing under tracking — nothing to reconcile). Safe to keep or re-dispatch.
- `verdict: halt` — the barrier found paths outside the declared write set (the leaked-stray-edit
  hazard), OR the barrier result was UNVERIFIABLE (a crashed/killed/non-JSON check, or an
  unrecognized result token). An unverifiable result is treated exactly like a confirmed overflow
  — never silently adopted.

**`writerHalt: true` NAMES the paths, in `outOfWriteSet`, that nothing accounted for.** Resolve them
here — `revert-overflow` to discard them, `repair-node` to fold them into a re-freeze, or a consent
halt if the resolution itself is a judgment call — and the halt is spent. Skipping straight to
`open-next` / `open-ready` re-anchors the node's baseline, which drops the stray paths underneath it
and stops that node's own barrier from seeing them; the node then re-dispatches over a worktree that
still carries the edit. What it does not do is make the edit disappear. The whole-plan barrier at the
sink diffs the entire claim against the union of every declared write set, so an unaccounted path
surfaces there — after the work is finished, named on a diff you then have to explain, rather than
here, where `outOfWriteSet` has already listed it for you.

`verdict: adopt` needs no further action — proceed with the normal `orient` → open flow.

---

## 5. Frontier dispatch discipline + slot awareness

On `enterBatch: true` (see `docs/plan-run-cards/frontier-batch.md`), issue every `spawn_agent`
call for the frontier back-to-back in the SAME turn, then run exactly ONE join loop (§2) that
covers the whole frontier — never a spawn-then-wait cycle repeated once per member (that
serializes an authored-parallel frontier one agent at a time).

**Width counts only RUNNING members.** A completed-but-unclosed agent does NOT hold a concurrency
seat — do not subtract it when deciding how many more to spawn.

**Reactive spawn-refusal fallback.** If a `spawn_agent` call is refused for a capacity reason (the
observed shape: a thread/agent-limit error), wait for or close one finished agent, then retry the
SAME spawn ONCE. This is the capacity remedy — proactive early closure "just in case" is not
required and is not a substitute for it. The effective concurrent-agent width and the host's wait
timeout bounds are host/config-dependent; consult the installed preflight/doctor report for the
values on this host rather than assuming a fixed number here.

---

## Quick reference — join lifecycle

```
spawn_agent(s) for the frontier, back-to-back in ONE turn
  |
  wait_agent (long timeout, multi-id where supported)
  |
  wake -> list_agents (once) -> drain EVERY completed member:
  |         integrate -> record-evidence -> close-node -> close_agent (best-effort)
  |
  still outstanding? -> re-wait (same long timeout) -- NO status-probe send_message
  |
  wait budget (dispatch.wait_budget_minutes) expires on a still-running member?
  |
  +-- followup_task (demand deliverable) -> grace window (~5 min)
  |     |
  |     no response -> interrupt_agent -> followup_task (ask for partial evidence)
  |           |
  |           nothing usable -> reclaim node (LAST resort) -> record delegation_outcome
  |
  reclaimed an in-place WRITER? -> reconcile-running-set -> verdict per writer
        |
        adopt -> proceed normally
        |
        halt  -> resolve outOfWriteSet (revert-overflow / repair-node / consent halt) BEFORE re-open

spawn_agent refused (capacity)? -> wait for / close ONE finished agent -> retry the SAME spawn ONCE
```
