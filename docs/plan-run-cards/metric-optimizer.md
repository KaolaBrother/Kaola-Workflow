# Card: Metric-Optimizer Ratchet Protocol

**When to read:** dispatching a `metric-optimizer` node. Its dispatch card carries
`dispatch.optimize` — the frozen `optimize(<node-id>)` metric contract parsed from the plan's
`## Meta` block — and may override `dispatch.wait_budget_minutes` from the contract's
`budget_wallclock_minutes`. This card covers the contract's fields, the bounded iteration loop
the role runs against it, its output contract, and its safety rule.

**Related:** the `metric-optimizer` agent profile; the five evidence tokens (`evidence-binding`,
`metric_baseline`, `metric_final`, `iterations_used`, `regression-green`); the plan-run
skeleton's card-split mechanism (this file is one of several rare-branch cards linked from the
skeleton).

---

## 1. The `optimize(<node-id>)` contract

A `metric-optimizer` node is always paired with exactly one `optimize(<node-id>)` block in the
plan's `## Meta` section, keyed by the node's own id:

```markdown
optimize(<node-id>):
  metric_command: <cmd>
  metric_paths: <comma list>
  direction: min|max
  budget_iterations: <int>
  budget_wallclock_minutes: <int>   # optional; default = tier wait budget
  regression_gate: <cmd>            # optional; default = Meta validation_command
  metric_repeats: <int>             # optional; default 1 (median-of-K)
  min_delta: <num>                  # optional; default 0 (absolute metric units)
  patience: <int>                   # optional; consecutive rejects before early stop
```

| Field | Meaning |
|---|---|
| `metric_command` | Prints the measured metric — see §2 output contract |
| `metric_paths` | The metric harness's own paths; must stay outside the node's declared write set (evaluation isolation) |
| `direction` | `min` or `max` — which way is "better" |
| `budget_iterations` | Hard cap on iterations, 1–50 |
| `budget_wallclock_minutes` | Optional hard cap on wall-clock minutes, 1–120; overrides the tier-derived `wait_budget_minutes` on the dispatch card when present |
| `regression_gate` | The command that must pass for an iteration to be eligible for acceptance at all; falls back to the plan's `## Meta` `validation_command` when omitted |
| `metric_repeats` | How many times to run `metric_command` per iteration and take the median (default 1) |
| `min_delta` | The minimum improvement (in absolute metric units) required to accept |
| `patience` | Optional: consecutive rejected iterations before an early stop |

The contract is `plan_hash`-covered — a field edit after freeze changes the hash like any other
`## Meta` content, so a tampered contract is caught by the usual `--resume-check` refusal.

The frozen plan is validated against six invariants at freeze time; a violation refuses with
`result: refuse, reason: plan_invalid` and a marker naming which one:

| Marker | Invariant |
|---|---|
| `OPT-1` | Exactly one `optimize(<id>)` block per `metric-optimizer` node, and every block keys a real `metric-optimizer` node |
| `OPT-2` | `metric_paths` is non-empty and disjoint from the node's declared write set |
| `OPT-3` | `budget_iterations` is 1–50; `budget_wallclock_minutes`, when present, is 1–120 |
| `OPT-4` | `direction` is `min` or `max`; `metric_repeats` ≥ 1; `min_delta` ≥ 0 |
| `OPT-5` | A change-gate `adversarial-verifier` post-dominates every `metric-optimizer` node — the measured claim is the node's entire deliverable, so it must be reproduced before finalize |
| `OPT-6` | A regression gate resolves — either the block's own `regression_gate`, or an inherited `## Meta` `validation_command` |

If you see a `plan_invalid` refusal citing one of these markers, the plan itself needs repair
(via the planner) before the node can be dispatched — this is not something the dispatched role
can resolve on its own.

---

## 2. The ratchet loop

Per iteration, the role:

1. **Proposes** the next change within its declared write set.
2. **Applies** it.
3. **Runs the regression gate.** A failing gate is an automatic reject — never an accepted
   change, regardless of metric improvement.
4. **Measures** the metric, running `metric_command` `metric_repeats` times and taking the
   median. `metric_command` prints `metric: <number>` at column 0; if it prints more than one
   such line, the LAST one wins (the harness may print progress metrics along the way).
5. **Accepts or rejects**, comparing the measured value to the current baseline by `direction`
   and `min_delta`:
   - **Accept** — commit with message `kw-opt(<node-id>) iter <k>: <old> -> <new>`; the
     accepted metric becomes the new baseline.
   - **Reject** — revert with a scoped `git restore --source=HEAD -- <write-set>` (touching only
     the node's declared write set) and keep the prior baseline.
6. **Logs** the iteration: `iter <k>: <metric> <accepted|rejected> <summary>` — for both
   accepted AND rejected iterations.

The loop stops when any bound is hit — `budget_iterations`, `patience` consecutive rejects, or
`budget_wallclock_minutes` — whichever fires first, and reports the final state honestly even if
no iteration was ever accepted.

---

## 3. Safety rule — scoped revert, never `git reset --hard`

A rejected iteration is rolled back with a scoped `git restore --source=HEAD -- <write-set>`,
touching only the node's own declared write set. **`git reset --hard` is FORBIDDEN** inside the
loop — it is not scoped to the node's write set and can silently destroy work belonging to a
concurrent node or the operator, not just the rejected iteration.

---

## 4. Output contract / evidence

The role self-writes its evidence (it is a WRITE-role agent, like `implementer`/`tdd-guide`) into
the seeded `.cache/{node-id}.md`, preserving the seeded `evidence-binding:` header verbatim. The
five required tokens:

| Token | Meaning |
|---|---|
| `evidence-binding` | seeded header, preserved verbatim |
| `metric_baseline` | the metric value measured before the first iteration |
| `metric_final` | the metric value after the last accepted iteration (equals `metric_baseline` if none accepted) |
| `iterations_used` | how many iterations ran before a stop condition fired, and which one fired |
| `regression-green` | the regression gate command + its passing output, confirmed for the final accepted state |

Plus the per-iteration log lines (`iter <k>: <metric> <accepted|rejected> <summary>`) for both
accepted and rejected iterations.

A change-gate `adversarial-verifier` always post-dominates a `metric-optimizer` node (OPT-5) —
its job is to reproduce the measured claim, not just review the diff; a clean ratchet run is a
floor, not a verdict.

---

## Quick reference

```
optimize(<node-id>) contract on the frozen plan
  |
  dispatch: dispatch.optimize = contract; dispatch.wait_budget_minutes overridden when
  budget_wallclock_minutes is set
  |
  per iteration: propose -> apply -> regression_gate
                   |                     |
                   |                  fail -> reject (scoped git restore, keep baseline)
                   |
                 pass -> measure (median of metric_repeats) -> compare to baseline
                              |
                       better by >= min_delta? --yes--> accept (commit kw-opt(...), new baseline)
                              |
                             no --> reject (scoped git restore, keep baseline)
  |
  log: iter <k>: <metric> <accepted|rejected> <summary>
  |
  stop when: budget_iterations reached, OR patience consecutive rejects, OR
  budget_wallclock_minutes elapsed
  |
  evidence: metric_baseline, metric_final, iterations_used, regression-green + per-iteration log
  |
  change-gate adversarial-verifier reproduces the claim before finalize (OPT-5)
```
