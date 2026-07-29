# 0016 — The substrate: bookkeeping over gates

- **Status:** Accepted
- **Date:** 2026-07-29
- **Supersedes:** the harness premise underlying ADR 0013 and the "Four Records, Two Gates"
  framing in `CLAUDE.md`. **Does not supersede** the four durable records themselves, which
  survive intact and are strengthened.

## The premise that expired

The workflow was built when coding agents were weak orchestrators. It therefore encoded
orchestration **as constraint** — hundreds of points where the system tells the agent no.

That premise no longer holds. An agent today plans, decomposes, dispatches, verifies, retries,
and self-corrects without any workflow at all. Owner ruling, 2026-07-29:

> "Even without our workflow, an agent can orchestrate itself and finish issues or batches.
> Adding the workflow is more like a burden. The workflow was started when an agent needed more
> harness and was less capable of acting as an orchestrator — that is why we put a lot of gates
> and refusals into it. Now the possibility is growing. So what is left is to give them more
> **choices and tools** — subagents, and a **bookkeeping system** that lets the agent resume, or
> know that it missed something in the middle. Small errors an agent might make, it will adapt
> and adjust along the way. That is not what we are trying to fix."

**Every gate justified by "the agent might get this wrong" is rent against a capability that
already exists.**

## The hinge

Adaptation requires **observability**. An agent routes around what it can see. The one thing it
cannot route around is a record that is **complete, coherent, and false** — because its only
substrate is telling it everything is fine.

- A **missing** record leaves a successor *correctly uncertain*. That is a routing problem it
  solves by going and getting the fact.
- A **lying** record leaves it no move at all.

**Therefore the bookkeeping's obligation is HONESTY, not completeness.**

## The governing rule for every change made under this ADR

> **Delete the verdict. Keep the measurement.**

The premise's claim that the agent adapts holds only over what the agent can still *see*, and the
tools determine what it can see. Deleting a gate is cheap and almost always correct. Deleting the
computation underneath it can be catastrophic, because the harm becomes *invisible* rather than
merely unenforced.

This rule was derived after observing three independent derivations violate it: all three cut the
post-dominance gate on the reasoning that "the agent authored the DAG and would hit the error at
runtime." It would not. A missing reviewer over a code-producing node produces no error, no red,
and no stall — **it produces a merge.** The correct cut deletes the refusal and keeps the
computation, emitting `unreviewed_code_nodes: [...]` as data.

Concretely: delete the classifier's green/yellow/red verdict, keep the overlap sets; delete the
lane's `stale` bucket, keep `claim_ts` and the holder probe; delete the barrier's refusal, keep the
path set it computes and currently discards.

## What may refuse — three tests, all of which must pass

1. **Reach.** The harm persists for an agent that uses every tool correctly. ("Can the agent bypass
   the tool?" is useless — true of every candidate, and it resurrects the whole harness.)
2. **Locus.** The harm is located entirely in a *future reader's* epistemic state — structurally
   invisible to the actor, who holds full context and is proceeding correctly by its own lights.
3. **Witness.** Proceeding would destroy the evidence of the finding itself. A refusal freezes the
   world in the state that produced the finding; a report lets the agent continue, and continuing
   can consume the witness.

**Design consequence of test 3, and it governs every conversion below:** when a refusal becomes a
report, *the report must durably capture what the refusal was freezing.* A conversion that emits a
verdict and drops the state is not a conversion — it is a deletion.

## The three refusals that survive

**R1 — Unrecordable irreversible effect.** The record substrate has failed, retry has failed, *the
fallback location has failed*, and the next action would produce an effect outside the agent's own
reversible workspace. The observer and the victim are different entities: the agent sees the failed
write, but the harm lives entirely in an agent that does not exist yet. `reconcile` cannot help,
because reconcile finds unresolved *intents* and there was no substrate on which to record one.

> **Not armable today.** A genuine fallback record location does not exist and is a precondition —
> without it the refusal fires on the first failed write rather than the last.

**R2 — The run clearing a human fence it did not get answered.** A fence an agent may clear is not
a fence, so permitting self-clearance retroactively voids every consent decision the system has
ever recorded. This is issue #865.

> **Deliberately narrowed.** "Acting against a recorded decision" was rejected: an agent that reads
> DENIED and proceeds would route around a gate too. The obligation is that the denial be durable
> and visible; nothing needs to stand in the way. It also cannot evaluate its own trigger without a
> machine-readable scope language, which makes it advisory — and an advisory is not a refusal.

**R3 — Publication to mainline without a content-bound witness.** Owner ruling: the system keeps
merging to mainline itself, so this survives permanently. It would have dissolved entirely into a
tool had the terminal step become "open a PR and let a human merge"; full autonomy was chosen
instead. No tool can replace it, because *"produce a witness that does not exist"* is not something
a tool can do on the agent's behalf.

> **Scope it narrowly.** It refuses *unwitnessed or mis-bound* publication, never an unsatisfactory
> result. A red witness may be published if the record says so and a human decision covers it. That
> distinction is what keeps it an honesty property rather than a quality gate.
>
> **Standing risk, recorded not resolved:** the repo root is shared with live sibling agents, so
> the blast radius of a bad merge falls on parties who did not consent to this run's risk
> tolerance. A mandatory rescue ref on every merge would convert irreversible to reversible; it is
> offered and not adopted.

## Owner rulings, 2026-07-29 — settled, not open

| Question | Ruling |
|---|---|
| Merge to mainline, or stop at a PR? | **Keep merging.** R3 therefore survives permanently. |
| May an unattended run expire a consent fence? | **Never.** Silence is never consent. |
| Build a run-cost ledger? | **No.** See below. |

**On consent:** what changes is scope, not absoluteness. Today an unanswered fence halts *every*
mutating subcommand run-wide. It should park only the **dependent subgraph** while everything else
keeps running, with the answer delivered asynchronously to whoever is alive when it arrives.

**On cost — declined, with the risk recorded.** Every deleted mid-run refusal was incidentally a
*bound*. Removing them changes the failure mode from "stalls visibly" to "never stops quietly", and
runs have already consumed 7.7 and 12 hours. The ruling is nonetheless **not now**, and the
reasoning is sound: both long runs were diagnosed and fixed *at the cause*, not by a bound, and
building a limit against a failure already addressed at its root is precisely the harness-era move
this ADR retires. **Residual risk: if it recurs, it recurs silently and a human notices rather than
the system.** The cheapest future tripwire is a frontier-movement check (has anything advanced
across the last N successors) — a report, not a bound. Not being built.

## The obligations

Nine were derived independently by three unrelated lenses; three more come from a single lens with
no dissenter demoting them.

| | Obligation | State |
|---|---|---|
| U1 | Atomic visibility — never a blend of pre- and post-state | Built; runtime-observed and mutation-proven bidirectionally |
| U2 | External effects: intent-with-key durable *before* the act, outcome after, key resolvable by a stranger | **Absent** — outcome-after only |
| U3 | No silent lost update (CAS; conflict returned to the caller) | Exists as a refusal — convert |
| U4 | A verdict is inexpressible without a re-checkable witness bound to the world-state it judged | Built for validation and chains; two fabrication sites remain |
| U5 | Anything cited is immutable; revision mints a new identity and retains the old | Built |
| U6 | Zero-context resumability, with unknowns enumerated *as* unknowns | Built and SIGKILL-driven, not asserted |
| U7 | Absence must never render as a value | Partial — the two human-readable kernel records carry no vocabulary stamp |
| U8 | Human decisions durable, scoped, outliving the agent that received them | Record half built; the *question* channel is a run-wide halt |
| U9 | Work attributed by content identity, never by timestamp or path | **Absent per node** — the barrier computes the exact path set and discards it |
| L | Direction-aware torn-write ordering **as a primitive parameter** | Correct at one site by hand; nowhere a parameter |
| R | Mandate snapshot with drift detection | **Absent** — the plan is the only denominator, so under-planning is undetectable |
| E | Epistemic status on every entry | **Absent** |

**Caveat on the last one.** Schema-inexpressibility stops the *empty* lie, not the *filled-in* lie.
An `ASSUMED` labelled `OBSERVED` is worse than an absent field, because the schema now vouches for
it. The only form that genuinely works is **effect-triggered writes** — the field saying a thing
happened is written by the code path that observed it happening — and `epistemic_status` has no
effect to trigger on. Build it knowing that.

## The tools

Offered, never required. **A tool the agent is forced to use is a gate wearing a tool's name** —
test: can the agent decline it and still finish?

`resume` / derived handoff · holder lease with liveness evaluation · durable subagent result
channel · idempotency-keyed external-effect wrapper with `resolve(K)` · durable asynchronous human
mailbox · isolation registry surviving its creator · atomic content-addressed CAS record store ·
world-binding receipt minting as a shared protocol · cross-instance peer visibility.

**Seven tool→gate smells,** in order of likelihood: sole-path (a tool that is the only way to
achieve an effect makes all its internal checks gates) · non-zero exit on a finding · fails-closed
defaults · chained outputs (when A's receipt is a required input to B, B has silently gated on A) ·
question-tools that mutate · tests asserting a tool was called · prompt surfaces saying "you MUST
run X".

## What the work actually is

**Not building.** Nine obligations already exist as sound construction. Five more exist as
**measurements that are correct and then discarded** because a refusal was wrapped around them.
Three of the six genuine absences are **one field each** on a record that already exists.

**Conversion list** — the measurement is built; only the verdict and the exit code change:

- `kernel_cas_lost` — the payload schema is already exit-0 data and its renderer already ends
  "Nothing was mutated." **Per test 3, the payload must also carry the losing write's content.**
- `write_set_overflow` + the auto-revert verb — the barrier computes this node's path set *by
  content* from a ref-anchored real commit. That is U9's missing locator, computed and thrown away.
  Emit `actualPaths` + `declared` on the close record; delete the refusal and the revert verb.
- `kernel_lock_held` — what exists is a lock, not a lease. Report holder + liveness at exit 0; add
  a recorded steal.
- The five-refusal ring around the barrier baseline — two exist *only because the gate exists*, and
  their own comments say so. The read-only form (`--base-freshness`, "never refuses") is already
  built and left standing beside the refusing half.
- `kernel_evidence_missing` — an existence check on a file the checking agent wrote is a tautology.
  Keep the real discriminator: the evidence *binding* against the recorded baseline.
- `resume_ambiguous`, `already_finalized` — questions answered with a stop; the latter is not a
  failure at all and exits 1.
- The freeze chain and brief-shape refusals. Keep `plan_hash`.
- `halt_pending` — park the dependent subgraph, not the run.

**Genuine builds — three:** the run-debt register, a real lease, an asynchronous human mailbox.

**Plus one field each:** a path-set locator on the ledger row (from a diff already computed), a
mandate digest captured at claim, an epistemic-status column.

## The run-debt register must be observational, never mediating

A gate-framed design has a place for violations and a place for completions and **no place at all**
for *"I noticed something true, it is not this issue's scope, and I meant to come back."* The
register is that place. Append at **recognition**, not at scheduling — the lethal window is
recognize-to-schedule, where the predecessor held it in context and died.

**Its load-bearing half is the read side:** `resume` surfaces open items unprompted.

**But "debt cannot be created outside the register" is a sole-path gate and must not be built.**
Exhaustiveness is unattainable by construction — you can force every *dispatch* to write into the
register; you cannot force an agent to *recognize*. So exhaustiveness reduces to agent discipline,
the one justification this ADR forbids. Worse, this machinery already partly shipped as
`gap-sweep.js`, whose finalize gate refused four times over prose that abbreviated instead of
reproducing seeded text — four round-trips, zero product state changed.

**A register that presents itself as authoritative but is not exhaustive is strictly worse than no
register**, because it converts correct uncertainty into false confidence. It may report that it is
incomplete. It may never gate on being complete.

## Known gaps this ADR does not close

- **Non-termination.** Declined above; risk recorded.
- **The mandate can be false.** Drift detection catches a mandate *changing*, not one that was
  *wrong when written*. A successor inheriting a perfect, fully-witnessed implementation of a wrong
  requirement has no move. Owed: the premise measurement and any refutation of it, durable and
  bound to the mandate digest.
- **Claimant capability is never recorded.** A successor reading `verified by adversarial-verifier`
  cannot tell a top-tier reviewer at high effort from a cheap model that fabricated — and this repo
  has measured both a fabrication and an intended-versus-actual tier divergence.
- **The human is a zero-context reader too.** Routing consent to a mailbox is load-bearing for the
  whole design, and a question must carry enough bound context to be answerable by someone who was
  never there — the decision, its alternatives, the evidence, the reversibility, and what proceeds
  while it waits. Otherwise every consent route becomes a silent stall.

## Two fabrications sitting in shipped records

- **`computeGoalCheck()`** (`kaola-workflow-claim.js`) — a presence check rendered as a satisfaction
  verdict, written into the terminal closure receipt. Its enum is `['satisfied','unsatisfied','absent']`
  and its own comment says `'unsatisfied' is reserved for future use` — **the field can never say
  no.** Advisory today, which is what keeps it from being a defect.
- **`LANE_STALENESS_MS = 86400000`** — 24 hours rendered as the categorical `lane_bucket: stale`.
  Note the honest counter-argument: emitting raw fields and letting the agent conclude moves the
  guess from a named, documented constant to an un-recorded threshold invented per call. **The fix
  is to emit the fields *and* keep the constant as a labelled default** — not to delete the
  reasoning and call it honesty.

## A warning about the method that produced this

Two of the three blind derivations independently re-derived machinery that **already ships**, while
claiming it was structurally invisible to the framing that shipped it — the debt register is
`gap-sweep.js`, built under the gate framing in an earlier issue.

All three declared **material contamination**: `CLAUDE.md` was auto-injected into their context in
full, including the section they were told was the premise being overturned.

**So "convergence across unrelated lenses is evidence of necessity" is weaker than it appears.**
Independent derivations drawing on the same training data and the same injected context can agree
for reasons unrelated to necessity. Weight the agreements accordingly and **prefer the
disagreements** — those are where something was actually thought.

## Provenance

Derived by three blind agents from unrelated starting points (discontinuity / capability-delta /
tools-and-choices), attacked by a fourth adversary, and reconciled against a pre-registered
derivation by the orchestrator — of which all four predictions were wrong. Obligations verified
against executed paths and driven behaviour, never the condition census. The census counts
token-shaped literals and includes one only if it contains an underscore; measured, it sees 747 of
786 distinct tokens and 1,413 of 1,526 sites, and the 39 it drops in `scripts/` alone are
disproportionately the refusal vocabulary (`halt`, `ambiguous`, `inconclusive`, `missing`,
`unparseable`, `failed`, `refused`, `stale`, `timeout`). It is an index of emission sites, not a
population.
