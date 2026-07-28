# 0013 — The Successor Test and the Two-Gate Target Architecture

Status: Accepted
Date: 2026-07-28
Sharpens: [0011](0011-oracle-test-and-kernel-extraction.md) (the Oracle Test decides *what*
stays mechanical; this decision adds *where* a mechanical answer may refuse, and with what
verb). Same seam as [0002](0002-lean-orchestrator-intent-realignment.md) →
[0004](0004-script-owned-mechanical-transitions.md) → 0011, re-derived from axioms.
Motivated by the subtraction campaign (#808, #816–#818, #833–#837) and the 2026-07-28
post-release audit (#838–#841).

## Context — the evidence that forced this

Five independent measurements, all current at HEAD `7a5f8212`:

1. **The refusal census.** A grep census (2026-07-28) counts ~474 distinct typed reason
   strings across the workflow scripts, ~176 in `kaola-workflow-adaptive-node.js` alone.
2. **The marginal gate is defective on arrival.** All four day-one defects found by the
   post-release audit are defects *in* gate machinery — an unreachable authority (#838), a
   permanent mid-run wedge (#839), a verb whose precondition its own sibling destroys
   (#840), a recovery whose last step is inference-from-prose (#841). None is a catch of a
   product defect; all four block legitimate progress. Two are faithful to their own design
   sentences — the interaction graph has outgrown design review.
3. **One principle already fixes all four.** Each filed fix direction is an instance of
   *record the fact when it exists; trust the record later* — the #834 subtraction,
   generalized. The cure pattern for the new defects is the subtraction campaign's thesis.
4. **Measured waste of form-refusals.** In the issue-1051 run: four refusal round-trips
   changed zero product state (a wrapped `tests-green:` value, a bare `findings_none`, two
   paraphrased gap samples); the finalize refusal ladder cost 19.3 minutes across four
   successive refusals whose ordering was structurally unsatisfiable on the first pass; a
   re-asked consent cost 33 minutes of dead wall-clock.
5. **Refusals are mispriced.** In an agent system a retry is not free. A refusal (a)
   voids the agent's in-context plan state, (b) forces triage that pages in tooling source
   orthogonal to the task, (c) often costs a full re-dispatch — a cold-start agent re-paying
   context the previous agent already paid — and (d) forces reconstruction of a half-converged
   judgment that does not resurrect identically. Expected value of a refusal:

   > EV = P(true positive) × rework avoided − P(false positive) × (triage + re-context + re-dispatch)

   For form-refusals the true-positive rate is ~0 (issue-1051: 4/4 were semantically false
   positives), so their EV is strictly negative — and ladders make the cost superlinear.
   The design texts already name the taxed resource: *"the orchestrator's context is the
   run's scarcest resource … inline residue taxes every later decision."* Refusal triage is
   exactly such residue, and it is rule exegesis, not task information.

The conclusion is not "fewer rules"; it is that the ruleset must be **re-derived** from
axioms, so that every retained mechanism carries its own justification and everything
else is deletable on sight.

## Axioms

- **A1 — Successor.** At any interruption, a fresh agent with zero conversational context
  must be able to pick the run up from durable state alone.
- **A2 — Outcome.** Correct means the issue is genuinely done right, at the best
  achievable balance of wall-clock, human attention, and tokens. Formal compliance is not
  part of the definition of correct.
- **A3 — Values.** Irreversible or value-laden calls route to a human (First Principle 4).
  Not derivable from A1/A2; retained as an axiom.

Everything else in the runtime must be derived from these three or is a candidate for
deletion.

## Derivation

**T1 (from A1) — The durable kernel is exactly four records.** A successor must answer
four questions and no others: *what are we doing* (the plan: goal, decomposition,
per-unit write sets and dependencies), *where are we* (the position: per-unit status),
*what is already done and why should I believe it* (the evidence: per step, what was
produced, how it was verified, where it lives), and *what has already reached the outside
world* (the forge chain: branch, commits, merge/PR state, issue state). Any other durable
artifact is either derivable from these four or a preference the successor is free to
re-decide.

**T2 (from A1) — Kernel writes are atomic.** Half a plan is worse than no plan for a
successor. `writeFileAtomicReplace` survives — scoped to the kernel.

**T3 (from A1) — Kernel records must be cheaply trustworthy**, or resume = redo and A1 is
vacuous. **T3a:** the forge layer named in T1 already *is* a tamper-evident journal — git
commits are atomic, SHA-chained, and conflict-detecting. Journaling kernel writes as
commits makes integrity native. A hand-rolled ledger hash chain (#777) re-implements
git's DAG over markdown, and inherits holes git does not have (#777's own known
limitation — `## Expansion Records` outside both integrity layers — closes for free when
the journal is the commit history).

**T4 (from A2) — "Done right" needs mechanical oracles, and exactly three operationalize
it:** tests green under separate custody; the diff fully attributed to declared write
sets; adversarial review settled. These *are* the result. Everything else in the runtime
is scaffolding around them.

**T5 (from A2) — Whatever protects an oracle's independence is outcome-relevant, not
ceremony.** Test custody stays: an implementer-authored oracle corrupts A2 itself.

**T6 (from A2, the efficiency clause) — Verification distributes to step boundaries as
steering.** If all checking collapses to the end, an early wrong turn is discovered at
maximum rework — violating A2. Boundary checks (tests at close, attribution at close) are
instruments the agent reads to steer, not police that arrest it.

**T7 (from A1+A2) — Oracles are tools; refusal is legitimate at exactly two loci.** The
computations are kept because agents derive them wrong — the premature-frontier defect
shows direct-dependency reasoning is a *different function* from transitive-ancestor
closure, divergent exactly after a repair reset. But no axiom derives "on mismatch, wedge
the run." Tool verbs are: **answer, advise, normalize, remedy, report-all**. Refusal
remains at:

- **L1 — kernel-write integrity.** The write didn't take: atomic replace failed, forge
  operation failed, CAS lost. Factual, not normative.
- **L2 — the sink.** Before anything reaches mainline / forge permanence: red tests,
  unattributed diff, unsettled review, missing consent for an irreversible act.

Relation to 0011: *"resumability is not legitimacy"* stands. This design relocates
legitimacy from mid-run process compliance to **sink-time oracle verdicts over recorded
evidence** — the successor does not trust that the path was followed; it cheaply
re-checks the result.

**T8 (from A3) — The consent valve is a legitimate interrupt** — by design the only
mid-run one.

**T9 (from A2, the efficiency clause) — Parallel by default; serial carries the burden
of proof.** Makespan at fixed correctness is minimized by running every
genuinely-independent frontier concurrently, so concurrency is the standing default and
holding work serial is a positive claim requiring present-tense, checkable evidence for a
named serializer (a consumed artifact, a shared irreversible resource, a failed
environment probe). The asymmetry that fixes the burden of proof: wrong-parallel costs
one bounded, *visible* synthesis pass at the join; wrong-serial costs *invisible*
wall-clock on every frontier. Width itself is governed by faithful decomposition — fan
out exactly as wide as the task decomposes, no wider (over-fanning fragments context and
adds synthesis overhead, itself a cost under A2), no narrower. **T9a — isolation, not
prevention:** parallel write legs run in worktrees; conflicts surface at merge; a real
conflict reconciles by intent. The mechanism is git-native; no preventive refusal layer
is derivable from any axiom.

**T10 (from A2) — Standing refusal economics.** Every proposed refusal is priced by the
EV formula above. Interruption cost is superlinear (ladders; re-dispatch cold starts), so
checks belong at zero-plan-state boundaries — freeze, close, finalize — never mid-flight.
The freeze-time dischargeability walls (#830) are the correct form not because they are
early but because the agent's plan state at freeze is empty: interruption there costs
nearly nothing.

**T11 (from A1+A2) — The guidance layer is part of the runtime and obeys the same
razor.** The successor of A1 reads two things cold: the kernel *and the prompts* (the
routing surfaces, role definitions, skills). Prose taxes the same scarcest resource as
refusal triage — a surface too long to hold while working is context residue by T10. And
every refusal carries a shadow cost in prose: the choreography that teaches agents to
avoid or recover from it. Therefore instructions are admitted by the same test as
refusals: an instruction is justified iff it states a kernel obligation, points at a tool
and the question it answers, states one of the two gates, or gives explicitly
non-normative judgment guidance. A procedure whose only purpose is navigating a refusal
is deleted *with* that refusal.

## The design

**Layer 0 — Durable Kernel.** The four records of T1, written atomically (T2), journaled
as commits (T3a, subject to M4 evaluation).

| Record | Must contain | Consumer |
|---|---|---|
| Plan | goal, decomposition, per-unit write sets + dependencies, epoch lineage | successor, scheduler tool, sink |
| Position | per-unit status, open/closed, halts | successor, readiness tool |
| Evidence | per step: what was produced, how verified, where it lives | successor, sink |
| Forge chain | branch, commits, merge/PR state, issue state | successor, sink |

**Layer 1 — Oracle Toolbox.** The existing computations, re-verbed. `next-action`
answers "what can open now" (transitive closure). The plan validator lints and records.
Attribution reports which changes map to which write sets. `run-chains` measures.
`finalize --check` reports **all** unmet preconditions in one pass. `record-evidence`
canonicalizes tokens on write (writer-normalization). Tools never refuse
conforming-intent input: they normalize it, remedy it, or answer with advice and a
recommended next step.

**Layer 2 — Two hard gates.** A small, enumerated refusal set at L1 and L2 — nothing
else refuses. The taxonomy is by **family, not incident**: single-digit code counts per
locus (L1: kernel write failed / CAS lost / integrity broken / lock held; L2: one
composite sink verdict whose payload enumerates ALL its findings in one pass — red
tests, unattributed paths, unsettled review, missing consent — the report-all shape),
with specificity carried in the payload, never by minting a new code. The enumerated
vocabulary is part of this ADR: adding a code means amending the ADR — deliberately
heavy, the anti-growth ratchet. Target: the vocabulary collapses to family granularity
and is located 100% at the two loci.

**The enumeration, machine-readable.** The ratchet is only real if a build step can read
it, so the vocabulary is carried here as a parseable block rather than as English. This
fenced list is the single left-hand side of the three-way equality invariant: the
registry's key set, the vocabulary constant, and this block must be equal, and a code
present in any two but not the third fails the build. The sweep's **cell** set is a
different set and is deliberately NOT part of this equality — cells are derived off the
payload schema, so a family that gains a discriminator value gains its cells automatically.
Deriving them is what makes the sweep meaningful: walking seven codes would prove almost
nothing.

**The derivation has two halves, and quoting only the first understates it** (see
`deriveCells()` in `scripts/test-refusal-route-sweep.js`). The base is one cell per
(code x declared discriminator value) — **49 on HEAD**, the sum of the seven families'
`REFUSAL_PAYLOAD_SCHEMAS[...].values` enums (4 + 11 + 10 + 3 + 3 + 12 + 6). On top of that,
a family that declares a **second payload field selecting a different route or hint ARM under
the same primary value** splits its cells again — three do, and each declares it differently,
which is exactly why the short formula misses them: `kernel_write_failed` record x {retry,
environment}, where the arm is selected by the presence of an `errno` from the schema's own
`enums.errno` (+4, one environment arm per record value, probed with `ENOSPC`);
`kernel_lock_held` kind x {live, stale}, the one family carrying an explicit
`secondary_discriminator: 'stale'` (+3); and `sink_verdict`'s `unattributed_paths` kind x the
8 values of its nested `enums.subtype` (+8). That is **15 secondary-arm cells, for 64 in
total** — the number the sweep reports and walks. The WHY slot
is keyed on the primary pair alone, which is why it reports 49 live cells against 64 walked;
the secondary split belongs to the FACT, not the WHY. A re-derivation from the base half
alone would build 49 cells and silently drop the environment, stale-lock and subtype arms —
the arms whose whole point is that the same code exits differently — while the "7 codes"
check still agreed.

Three columns: the code, its locus, and whether it is auto-remediable. A row's
`auto_remediable` is `no` exactly when repairing the deviation would launder the evidence
(R4) or when the call is a human's to make (A3).

The third column is the **family DEFAULT**, and the family is not always the right grain
(see amendment 11): a composite family can hold cells that answer R4 differently. The
default is refined per cell by `R4_NON_REMEDIABLE_CELLS`, read through
`resolveAutoRemediable(code, payload)`, and that refinement is **tighten-only** — it may
turn a `yes` family into `no` for a named cell and never the reverse. The column above is
untouched by it and remains the single left-hand side of the three-way equality.

```kernel-refusal-vocabulary
kernel_write_failed        L1  yes
kernel_cas_lost            L1  yes
kernel_integrity_broken    L1  no
kernel_lock_held           L1  yes
kernel_evidence_missing    L1  yes
sink_verdict               L2  yes
consent_required           A3  no
```

This block is **normative and closed**: adding a row is an amendment to this ADR, which is
the anti-growth ratchet in its literal form. `scripts/test-refusal-route-sweep.js` parses
it and asserts it equals `Object.keys(KERNEL_REFUSAL_REGISTRY)` and
`KERNEL_REFUSAL_VOCABULARY` exactly, in both directions — so the registry has no
independent content to drift with.

**Exactly what that buys, stated narrowly, because the guarantee is easy to overclaim.**
Three minting paths and only three fail the build: (a) a code added to any ONE or TWO of the
fence / `KERNEL_REFUSAL_REGISTRY` / `KERNEL_REFUSAL_VOCABULARY` — the three-way equality; (b)
a discriminator value declared without a route, or a route keyed on an undeclared value —
the bidirectional key parity below; (c) re-using one of the seven FAMILY names as a legacy
`condition` literal anywhere in `scripts/kaola-workflow-*.js`, which the census forbids so
the two namespaces cannot collide. A payload passed to the kernel emitters carrying an
unenumerated code is rejected by `validateRefusalPayload` at **RUNTIME**, not at build time.
And a **brand-new reason string emitted directly in a script's own refusal envelope fails
nothing at all** — that is how every legacy condition is emitted today (the sweep's census
measures 734 distinct condition values on HEAD), and the census neither ratchets nor caps
them: `unclassified` is a PRINTED METRIC (374 of those 734), with no assertion behind it. So the ratchet binds the *enumerated
vocabulary*, not the codebase's ability to mint a string; closing that second gap is what
demoting the legacy census to zero is for, and until then it is a review obligation.

Specificity is carried in the payload. Each family declares its discriminator enum in
`REFUSAL_PAYLOAD_SCHEMAS`, and its route table is keyed by that same enum — the sweep
proves the two key sets equal in both directions, so a discriminator value with no route
and a route for an undeclared value are both build failures.

Two clarifications the prose above left implicit. First, **the A3 consent valve is a
third refusing locus** — `consent_required` is a refusal by every mechanical definition,
and P2's "located 100% at L1/L2" is read as "L1/L2 plus the A3 family", which T8 already
establishes as the one legitimate mid-run interrupt. Second, **`kernel_evidence_missing`
is a fifth L1 family**, ratified rather than folded: the drawn machine's
`edge open -> done … evidence recorded (L1)` row already requires it, and folding it into
`kernel_write_failed` would make "the write did not take" also mean "the write was never
attempted", conflating a failed atomic replace with an absent record and weakening the
very diagnostic the route resolver keys on.

**Layer 3 — Free orchestration.** Scheduling, fan-out width, ordering, speculation, halt
handling: agent judgment guided by skill prose. No typed refusal shapes any of it.

### The kernel state machine, drawn

The design change is visible as a state-machine change, so the machine is drawn here —
once, as a **parseable fenced block** rather than as a markdown table, for the reason
amendment 9 settled for the refusal vocabulary: an info-string is a contract, a heading is
a rendering choice, and a long ADR holds many pipe tables a table regex can wander into.
`scripts/test-kernel-state-machine.js` parses this fence and asserts it against what the
code actually reaches, in both directions.

**Unit states** are carried by the `## Node Ledger` status column, whose enum is the
schema's `LEDGER_STATUSES`; the drawn names are the design names and the fence records the
mapping, so a status added to the enum without a drawn state fails the build, and a drawn
state naming no status is a phantom and fails too. **`n/a`** — a unit the plan declares
will not run (a conditional arm not taken, a gate with nothing to certify) — is terminal
and load-bearing today: it gates `--gate-verify` and maps to a completed row in the task
mirror. **`halted`** is not a ledger status at all: it is the durable `consent_halt:
pending` marker overlaying an *open* unit, and the halted row deliberately stays
`in_progress`. **Run states** are carried by `workflow-state.md`'s `status:` field where
one exists, by a named durable field where one exists, and are otherwise marked
`derived:` — flagged rather than implied, because a state with no durable witness is
exactly the kind this decision refuses to leave unnamed.

The fence's grammar is two row shapes:

```
state <name> | <scope> | <carrier> | terminal|live
edge  <from> -> <to> | <actor> | <verbs> | <evidence> | <guard and its verb>
```

`scope` is `unit` or `run`. `carrier` is `ledger:<status>`, `marker:<token>`,
`state:<status-value>`, `field:<durable-field>`, `derived:<why>` (no single durable
witness — the honest label), or `none:<why>` (an initial state: the record does not exist
yet). `verbs` are `<script>:<verb>` tokens that must resolve in that script's own
argv dispatch — the #840 dead-verb class, caught at build time. `evidence` names *which
mechanical check backs the row*: `ledger-splice` (a `spliceLedgerNode` call site with a
matching `allowFrom` → status pair), `ledger-append` (rows created mid-run), `plan-freeze`,
`halt-marker`, `state-stamp`, `epoch-snapshot`, `forge`.

```kernel-state-machine
state absent      | unit | none:no ledger row exists yet                        | live
state pending     | unit | ledger:pending                                       | live
state open        | unit | ledger:in_progress                                   | live
state done        | unit | ledger:complete                                      | live
state n/a         | unit | ledger:n/a                                           | terminal
state halted      | unit | marker:consent_halt                                  | live
state unclaimed   | run  | none:no project folder exists yet                    | live
state planning    | run  | state:active                                         | live
state executing   | run  | derived:status active, frozen plan, ledger advancing | live
state replanning  | run  | field:replan_status                                  | live
state sinking     | run  | derived:status active, sink transaction open         | live
state archived    | run  | state:closed                                         | terminal
state discarded   | run  | state:abandoned                                      | terminal
edge absent -> pending | planner | plan-validator:--freeze | plan-freeze | grammar lint (advise); kernel write (L1) — the frozen plan authors the ## Node Ledger rows
edge absent -> pending | agent | adaptive-node:amend-surface, adaptive-node:expand-open, adaptive-node:reexpand-open | ledger-append | units enter the machine AFTER freeze too: expansion appends pending unit rows mid-run
edge pending -> open | agent | adaptive-node:amend-surface, adaptive-node:close-and-open-next, adaptive-node:expand-open, adaptive-node:open-next, adaptive-node:open-ready, adaptive-node:reconcile-running-set, adaptive-node:reexpand-open, adaptive-node:reopen-node, adaptive-node:repair-node | ledger-splice | readiness closure (answer, whole frontier); worktree isolation (T9a)
edge pending -> done | agent | adaptive-node:expand-close | ledger-splice | an expansion point discharges without ever being opened as work of its own
edge pending -> n/a | agent | adaptive-node:close-and-open-next, adaptive-node:close-node | ledger-splice | selector resolution folds the arms not taken (answer)
edge open -> done | agent | adaptive-node:close-node, adaptive-node:close-and-open-next, adaptive-node:expand-close | ledger-splice | evidence recorded (L1); steering instruments (advise, T6)
edge open -> pending | agent | adaptive-node:amend-surface, adaptive-node:close-and-open-next, adaptive-node:close-node, adaptive-node:discard-speculative, adaptive-node:reconcile-running-set, adaptive-node:reexpand-open, adaptive-node:reopen-node, adaptive-node:repair-node | ledger-splice | a review fold, a speculative discard, a crashed open rolled back, or a repair reset
edge open -> n/a | agent | adaptive-node:close-and-open-next, adaptive-node:close-node | ledger-splice | selector resolution folds an arm that was already open
edge done -> pending | agent | adaptive-node:amend-surface, adaptive-node:close-and-open-next, adaptive-node:close-node, adaptive-node:reexpand-open, adaptive-node:reopen-node, adaptive-node:repair-node | ledger-splice | repair / re-expansion re-opens a settled unit and its post-dominating gates
edge open -> halted | agent | adaptive-node:write-halt | halt-marker | consent (A3) — the durable consent_halt marker; the ledger row stays in_progress
edge halted -> open | agent | adaptive-node:clear-halt | halt-marker | the human's answer clears the marker; only reason consent|security clears
edge halted -> discarded | orchestrator | claim:discard, claim:release | state-stamp | a TERMINAL halt (test_thrash, integrity) has no in-run clearance — clear-halt accepts only consent|security — so its one named exit is discarding the run (A3)
edge unclaimed -> planning | orchestrator | claim:startup, claim:pick-next | state-stamp | explicit --target-issue plus a validated selection record, else refuse with zero side effects; kernel write (L1)
edge planning -> executing | planner | plan-validator:--freeze | plan-freeze | grammar lint (advise); kernel write (L1)
edge executing -> replanning | planner | replan:prepare, replan:shape-refutation | epoch-snapshot | a settled typed review outcome; parent snapshot (L1)
edge replanning -> executing | planner | replan:resume | epoch-snapshot | candidate / claim-root / frontier CAS seams verified (L1)
edge replanning -> executing | agent | replan:abort | epoch-snapshot | abortable ONLY before the parent snapshot; past that the exit is resume or a claim-level discard
edge replanning -> discarded | orchestrator | claim:discard, claim:release | state-stamp | the past-snapshot exit when neither resume nor abort applies (A3)
edge executing -> sinking | agent | claim:finalize | forge | tests + attribution + review + consent (refuse, L2)
edge sinking -> archived | agent | claim:finalize, sink-merge:--sink | state-stamp | forge chain settled (L1)
edge planning -> discarded | orchestrator | claim:discard, claim:release | state-stamp | the claim is released and the folder archived; no forge side effect (A3)
edge executing -> discarded | orchestrator | claim:discard, claim:release | state-stamp | the same exit mid-run (A3)
```

Contrast with today: the ~474 typed refusals are, structurally, **hundreds of undeclared
states** — each "run in condition X, refused" (stale, mismatched, wedged, unroutable) is
a state the drawn machine does not name, and several have no legal exit at all (#839's
permanent wedge, #840's dead verb are literally reachable states with no drawn
transition out). A state machine that cannot be drawn is not a state machine. The fence
above is required to stay **exhaustive**: every reachable condition has a named
transition out, and a proposed mechanism that would create a condition without one is
rejected by construction (it would violate P3). That requirement is now mechanical rather
than editorial — every `live` state must carry at least one outgoing edge and every
`terminal` state exactly none, and both halves are cross-checked against the code's own
splice sites. This also answers the standing question "is a state machine enough?": *as
the durable contract, yes — this one; as police, no machine is needed at all.*

### Every refusal names its exit — the route contract

A refusal that fires without telling the agent the way out is a wedge with a label. The
current state does not guarantee an exit: three per-script `OPERATOR_HINT_REGISTRY`
tables coexist with five CLIs that decorate nothing, exactly one typed `route:` field
exists in the codebase, and one shipped hint is circular (it names a precondition its
own sibling mechanism destroyed). Three mechanisms make "every refusal has a way
through" structural rather than prose discipline:

1. **A typed `route` on every refusal envelope.** Each L1/L2 refusal carries
   `route: {verb, args-template}` from a **closed vocabulary**: an in-grammar verb (the
   next legal subcommand with its arguments), `consent` (the A3 valve — a human
   decides), or `environment` (the blocker is outside the runtime: disk, forge,
   network). Prose `operator_hint` remains as commentary; the route is the
   machine-readable exit. R4 refusals route to investigation/discard verbs, never to an
   auto-repair — the signal must not be laundered.
2. **One registry.** The three per-script hint tables unify into a single kernel table
   keyed by reason code: `{route, hint}`. This is feasible *only after* the census
   shrinks to ~L1+L2 size — at 459 codes a unified table would be one more hand-kept
   compliance mirror of the kind #833 subtracts.
3. **The registry sweep — R2 generalized.** A suite walks every registered code:
   provoke the refusal, follow its recorded route, arrive green. A route that dead-ends
   fails the sweep, so the #840 class (route to a dead verb) and the circular-hint class
   become build-time failures instead of post-release audit findings. Enforcement is
   default-on with an exempt list carrying a one-line reason per entry — never an
   opt-in allowlist.

### Amendment A1 — the enumerated vocabulary

**The enumeration lives in ONE place: the fenced `kernel-refusal-vocabulary` block in
§ Layer 2 above.** It carries the code, the locus and `auto_remediable`, and it is what
`scripts/test-refusal-route-sweep.js` parses.

A second copy of the table stood here until the merge that landed the registry. Two
enumerations of a vocabulary whose defining property is having ONE left-hand side is a
contradiction that git will merge cleanly and silently, so it is recorded rather than
quietly dropped — see amendment 9.

`kernel_evidence_missing` is a **deliberate +1** to the four L1 families named in Layer 2
above, and is flagged as such rather than absorbed silently. Its justification is this
ADR's own drawn machine — `edge open -> done … evidence recorded (L1)` — plus the #825
verdict on the claim boundary, which rules in the same language that a lost selection
rationale is an irreversible kernel-record loss. `kernel_write_failed` means *the write
did not take*; this means *the write was never made and the content no longer exists to
make it*: a different actor (the agent, not the substrate) and a different route class
(an in-grammar verb, never `environment`). The alternative — folding it into
`kernel_write_failed` with `record: 'evidence', defect: 'absent'` — remains open to the
owner; the ratchet exists precisely to make this choice expensive, so it is recorded here
in the open rather than absorbed by an implementer.

### The parallel structure, retained — and mechanically strengthened (T9)

"Parallel by default; serial requires evidence" is not carried over as a custom — it is
T9, a theorem of A2 — and each of its working parts has a named home in the four layers:

- **Kernel (Layer 0):** the plan record carries per-unit write sets and dependencies
  (T1), which is exactly the data that makes disjointness *provable* at plan time. The
  planner's `parallel_safe` antichains are a kernel fact, not ceremony.
- **Toolbox (Layer 1):** the readiness tool answers with the **whole ready frontier**
  (transitive closure) — the answer itself invites co-opening. The frontier is the
  authority; any single-node field is an explicitly-labelled convenience projection of
  it (`readySet[0]`), never an independent answer, and the single-node open verb is the
  one-member case of the frontier open verb, never a separate serial door. Critical-path
  ordering is an **emitted tool answer** — an `order` field on the frontier — not skill
  prose, so the advice travels with the data it ranks.
- **Isolation (T9a):** co-opened write legs get worktrees; the join reconciles
  mechanically when disjoint and by intent (synthesizer) on real conflict.
- **Sink (Layer 2):** attribution over the union of declared write sets is where
  wrong-parallel is caught — once, visibly, at the join — which is what makes the
  parallel default safe to hold.
- **Guidance (Layer 3 / T11):** the surfaces state the default and the serializer
  evidence rule (named artifact / shared irreversible resource / failed probe) as
  judgment guidance; uncertainty is never a serializer — uncertain writes co-open and
  reconcile.

The two-gate design then *increases* effective parallelism, for a reason the refusal
economics already named: mid-run refusals are themselves serializers. A wedge stalls
every unit behind it (#839 fenced #829's whole repair surface); a refusal ladder
serializes the orchestrator's attention even when the DAG is wide; and a re-dispatch
cold-start occupies a concurrency slot doing re-context instead of work. Deleting
mid-run hard gates removes a class of *workflow-created* serializers — exactly the kind
the standing rule already says must be repaired before dispatch, never scheduled around.

### The guidance layer — the prompt surfaces re-derived (T11)

The runtime speaks to agents through prompt surfaces: the six routing surfaces (3 Claude
commands + 3 Codex SKILL packs), the role/agent definitions, the additive-runtime
mirrors (opencode, kimi), and the consumer-facing templates. Today those surfaces are
dominated by refusal choreography — "call X; when it refuses with Y, do Z" — prose that
exists only because the corresponding refusal exists, pinned by needle assertions in the
contract validators (the prompt-layer analog of refusal codes).

Under this design, each surface converges to five parts and nothing else:

1. the **goal** of the phase;
2. the **kernel obligations** — keep the four records current, atomically;
3. the **toolbox** — each tool named with the question it answers, not the procedure it
   enforces;
4. the **two gates** — what the sink and kernel-integrity refusals mean when they fire;
5. **judgment guidance** — heuristics and worked examples, explicitly non-normative.

Consequences, both mechanical: (a) when M3 demotes a refusal, its recovery choreography
is deleted from **all six surfaces in the same diff** — the regulating clause already
makes the surface set part of any prompt diff, and one-rule-one-wording continues to
govern what remains; (b) the needle-pin census in the contract validators shrinks in
proportion to the refusal census, because a deleted rule needs no pin. The
route-reachability contract stays, machine-enforcing that what *does* remain reaches all
six surfaces.

### The process boundary obeys the same razor

Test-time process spawns are priced like refusals: a real child process adds evidence
only where the property under test lives **at the process boundary**. Five classes
qualify: the **CLI shell contract** (argv → handler → envelope → exit code — proven
once per subcommand, not once per scenario); **U-ground concurrency** observables
(multi-process lock and atomic-write contention); **I-ground crash** semantics (kill
mid-write, restart, recover — the P1 kill test); **environment/install** probes; and
the **cross-process durable handoff** — one process writes a kernel record and EXITS,
the next re-reads it from disk with no shared heap. That last class is the successor
test (A1) executed rather than asserted, and it is added by amendment 8; see there for
why it is not optional.
Every other assertion is function behavior plus file state, reachable in-process
through the `module.exports` APIs all eight CLIs already publish — the pattern the
three newest suites prove (`test-adaptive-handoff`: 0 spawn sites;
`test-oracle-kernel`: 0; `test-replan`: 11), while the three pre-pattern heavyweights
hold ~1,100 static spawn sites (785 / 197 / 126) — exactly the suites behind the fast
gate's rotating slice, each spawn paying node startup plus a 7–17k-line parse for no
added evidence. **Two claims in the preceding sentences were refuted by measurement and
are retracted by amendment 8: the per-spawn startup cost, and the parallelization
premise below.** **The four spawn-site counts in the preceding sentence are stale and are
retracted by amendment 11, which carries the re-measured values; `scripts/test-spawn-ratchet.js`
is the instrument of record and no number here is authoritative against it.** The
necessary set is larger than the ~10% first estimated here, because
the fifth class is populous. Production composition is already in-process (aggregators `require` their
siblings' pure functions); the residual production subprocess cost — 56 `git` execs in
the node lifecycle plus the validator shell in barrier choreography — is a bounded,
separate lever, not part of this claim.

## Standing admission rules (in force from acceptance, before any migration)

- **R1 — Locus and severity.** A new refusal must sit at L1, L2, or A3, **and** be crucial
  there: proceeding would irreversibly corrupt or lose a kernel record, let
  unverified / unreviewed / unconsented content reach mainline, or override a human
  values call. A condition recoverable in place ships as an advisory even at those loci;
  a mid-run refusal proposal other than the A3 valve ships as an advisory or a tool.
- **R2 — Green arc, bidirectional.** Adding *or removing* a refusal requires a pinned
  green traversal — the legal path through, not only the refusing path. Three of the four
  2026-07-28 defects shipped with refusal pins only; the #778 physical dedup broke the
  same day for the symmetric reason (an untested legal path: fresh-clone install).
- **R3 — Missing-tool test.** If the agent's next step after a refusal is a
  deterministic transformation, the script performs that transformation
  (normalize/remedy) and the refusal retires. A refusal whose remedy is mechanical is a
  missing tool wearing a uniform.
- **R4 — Meaning-vs-form discriminator.** Auto-remedy applies only to *non-canonical
  form of correct content*. A deviation that is itself evidence — hash mismatch,
  unattributed diff, chain break — must never be auto-repaired; that would launder the
  signal. (This bounds R3: R3 never overrides R4.)

## Migration — staged, each stage independently valuable, no big-bang

- **M1.** Land #833–#837 (already convergent: derive-at-read, trust-records,
  writer-normalize, report-all, consent classes). Point-fix only live defects first:
  #839 (which names itself the bounded fix pending #834) and #832 (the one pure L1
  kernel-write-integrity defect on the open list — archive-time kernel writes silently
  fail and report `done`, destroying two of T1's four records; P1 cannot be authored as
  a suite scenario until it is fixed).
- **M2.** Refusal telemetry: each refusal event records (code, triage wall-clock,
  re-dispatch?, phase). Yields the real frequency × interruption-cost ranking; the
  campaign becomes data-driven instead of audit-anecdote-driven.
- **M3.** Batch re-location: walk the census top-down; each code resolves to L1 / L2 /
  advisory / tool / delete per R1–R4, with telemetry before/after per batch. Each
  demoted code deletes its recovery choreography from all six prompt surfaces and its
  needle pins from the contract validators **in the same diff** (T11); the surface set is
  part of the diff.
- **M4.** Kernel journaling as commits; evaluate retiring the hand-rolled chain (#777).
  Evaluate-first: commit noise and worktree interplay are real costs; adopt only if the
  integrity story is strictly better.
- **M5.** Re-triage #838/#840/#841 after M3 — their host machinery may have shrunk or
  vanished; re-derive what remains.

## Explicitly unchanged

The consent valve (A3); test custody (T5); adversarial review as an oracle; the sink's
fail-closed posture; **parallel-by-default with serial-requires-evidence** (upgraded from
a design principle to theorem T9 — retained *because derivable*, and mechanically
strengthened by removing workflow-created serializers); CI/CD-is-not-a-gate;
one-rule-one-wording; the single adaptive path.

## Acceptance — falsifiable predictions

- **P1 — Kill test.** Interrupt a live run at arbitrary points (mid-node, mid-merge,
  mid-finalize); a fresh session given only the kernel resumes to completion. This
  becomes a suite scenario, not a hope. **If P1 fails on the kernel alone, T1 is wrong
  and the kernel spec must grow — grow the kernel, never the police.**
- **P2 — Census.** The enumerated refusal vocabulary collapses to family granularity —
  on the order of a dozen codes, not fifty — located 100% at L1/L2 (plus the A3 consent
  family), every one carrying a route. Specific conditions appear as payload findings,
  never as new codes.
- **P3 — Wedge extinction.** Permanent mid-run stuck states (the #839 class) are
  impossible by construction: nothing mid-run refuses hard.
- **P4 — Economics.** Tokens and wall-clock per equivalent issue drop, measured by M2
  telemetry before/after. The test-side companion is the **spawn census**: per-suite
  real process counts are reported, the necessary set is ~10% of today's, and a
  tighten-only ratchet (no growth in unclassified spawn sites) holds the line while
  conversion proceeds. **Ordering is load-bearing:** the minimal outcome recorder and an
  economics baseline must land with the registry batch, not with the reporter — a
  before/after whose "before" is captured after the deletions it measures is not a
  measurement. M2's reporter may follow M3; M2's *recorder* may not.
- **P5 — Prose census.** The six routing surfaces' line count and the contract
  validators' needle-pin count drop in proportion to the refusal census (T11). If the
  prompts do **not** shrink as refusals demote, choreography is surviving its refusal —
  a violation of T11 to be hunted, not tolerated.
- **P6 — Drawn-machine exhaustiveness.** Every reachable run condition appears in the
  drawn machine with a named exit; `scripts/test-kernel-state-machine.js` parses the
  `kernel-state-machine` fence and asserts no reachable condition lacks one (the
  mechanical form of "no undeclared states"), in both directions — a state or transition
  the code reaches and the fence omits is red, and so is a drawn state or transition the
  code cannot reach, since a machine with phantom states is as undeclared as one with
  missing states. The route contract's registry sweep is its per-refusal refinement:
  every surviving reason code is walked refusal → route → green, so an exit-less refusal
  cannot ship.

## Risks

- **Advisories may be ignored.** This is already the shipped reality: interception was
  retired (#372/#725) and every gate is entered voluntarily. The change is honest
  labeling plus a real net at the only place that matters (L2).
- **Drift discovered late** (sink-only hardness). Mitigated by T6 instruments at every
  boundary; a steering signal ignored N times is itself visible in M2 telemetry.
- **Git-as-journal costs.** M4 is explicitly evaluate-first.

## Amendment log

Amendments are recorded here rather than applied silently: the enumerated vocabulary is
part of this decision, so changing it is itself a decision.

### 2026-07-28 — five amendments, from the coverage audit of the migration plan

A four-source audit of the migration plan against this decision checked 186 commitments
and found 91 gaps or partials, concentrated at Layer 0 and in the acceptance predicates.
Five findings were defects **in this text**, not in the plan, and are fixed above.

1. **The enumeration was not machine-readable** (§ Layer 2). The anti-growth ratchet is a
   three-way equality between this decision, the registry, and the sweep — and this side
   of it was English prose in a parenthetical, so the guard could not be built. Added the
   fenced `kernel-refusal-vocabulary` block.
2. **`kernel_evidence_missing` ratified as a fifth L1 family.** The prose enumerated four
   L1 families while the derived registry needed five; the transition table's
   `close(unit) → evidence recorded (L1)` row already required the fifth. Folding it into
   `kernel_write_failed` would conflate a failed write with an absent record.
3. **The A3 consent valve named as a third refusing locus.** P2's "100% at L1/L2" is read
   as "L1/L2 plus the A3 family". T8 already establishes it as the one legitimate mid-run
   interrupt; leaving it unnamed made P2 unsatisfiable by construction.
4. **`n/a` added to the unit states** (§ the kernel state machine, drawn). It is reachable
   and load-bearing today. An unnamed reachable state is precisely the "undeclared state"
   this decision levels at the 474 refusals; P6 cannot be asserted over a table that omits
   one.
5. **T9's readiness sentence amended to the achievable form** (§ the parallel structure).
   "Never a single next node" read as a prohibition on a surface that is load-bearing
   today. The *purpose* — the answer invites co-opening — is preserved by making the
   frontier authoritative and any single-node field an explicitly-labelled projection of
   it, and by promoting critical-path ordering from skill prose to an emitted `order`
   field. Honoring the literal text would have required deleting a working capability and
   migrating every caller mid-campaign.

6. **The three-way equality corrected: it is over CODE SETS, not the cell set.** Amendment 1
   as first written named "the registry's key set, the sweep's cell set, and this block" as
   the three equal sets. That is false against the shipped sweep, which compares the ADR
   list, `Object.keys(KERNEL_REFUSAL_REGISTRY)` and `KERNEL_REFUSAL_VOCABULARY` — three code
   sets — and derives cells separately as (code x declared discriminator value). Measured:
   7 codes, 64 cells. They could not be equal, and asserting they must be would have made
   the invariant either unsatisfiable or meaningless depending on which reading a later
   implementer picked. Found by an adversarial re-verification that traced the claim to
   source instead of inheriting it from this document — which is the failure mode worth
   naming: **an imported claim carries no evidence with it, so importing is exactly where
   the check is most needed.**
7. **R1's own locus set aligned with amendment 3.** R1 still read "must sit at L1 or L2"
   after A3 was named a third locus, and banned mid-run refusal proposals without excepting
   the valve T8 retains — so the standing rule contradicted the amendment two sections
   above it. One rule, one wording.

8. **A fifth spawn class: the cross-process durable handoff. Two cost claims retracted.**
   § *The process boundary obeys the same razor* named four qualifying classes and
   mandated in-process conversion of everything else. Applied to the node-CLI spawn
   sites, that mandate collided head-on with **`D-523-01` (Accepted, 2026-06-18,
   measured and still live)**, which found those exact spawns irreducible. Two live
   records, same sites, opposite verdicts.

   The collision resolves against this ADR on all three counts, and the evidence is
   measured, not argued:

   - **The cost premise is refuted, twice, independently.** "Each spawn paying node
     startup … for no added evidence" — startup is ~30 ms of a ~935 ms adaptive-node CLI
     call, about **3%**. D-523-01's H1 measured the per-spawn tax at 0.02–0.05 s, below
     its own refute threshold, in June. Re-measured 2026-07-28 on today's tree: same
     answer.
   - **The parallelization premise is refuted on today's code.** "Conversion also removes
     the material basis of the 'suite cannot be parallelized' constraint (spawn
     contention)" is false: conversion removes CALL SITES, not PROCESSES. Measured across
     a 58% call-site reduction — walkthrough 3,755 spawns before and after,
     `test-adaptive-node` 3,986 before and after, wall clock 437 s → 436 s. The suite's
     actual serializer is its 15-member `sharedTmp` isolation group, which sharding
     already splits; fixture repos are per-scenario `mkdtemp` and never touch the real
     `.git/index`.
   - **The coverage cost is real.** D-523-01's H3, CONFIRMED: the cross-process on-disk
     state handoff — one process writes ledger + baseline and exits, the next re-reads
     it — **IS the property under test**. Collapsing it re-introduces the in-process
     false-green class the #292 discipline exists to prevent.

   So the mandate proposed trading measured coverage for a measured non-improvement,
   which axiom 1 forbids outright. The deeper error is that the four-class vocabulary had
   **no home for "writes and exits, then re-reads"** — an omission in this ADR, not a
   licence to override a measured decision. Naming the fifth class is what makes the
   exemption *declared* rather than silent, and it is not a carve-out: it is **A1, the
   successor test, executed instead of asserted.** A fresh process resuming from durable
   state alone is this document's founding axiom; a test that spawns a second process to
   re-read what the first one wrote is that axiom under measurement. Deleting those
   spawns would delete the only place A1 is empirically checked.

   `D-523-01` therefore stands, unsuperseded. What this ADR keeps is the razor itself —
   a spawn must be justified by a property living at the process boundary; the fifth
   class is such a property. The already-landed call-site reduction (2,056 → 872 sites,
   −58%, entirely in git *arrangement* code where nothing is asserted) is unaffected and
   retained. **This amendment was authored by the orchestrator on the evidence above and
   is open to reversal by the repo owner.**

9. **One fence, one source: the duplicate vocabulary table is deleted.** The branch that
   built the registry was cut before amendment 1 and carried its own enumeration — a
   `### Amendment A1` heading with a markdown pipe table (code, locus, `auto_remediable`)
   — while main carried the fenced block. **Git merged both cleanly**, leaving a
   vocabulary whose defining property is having ONE left-hand side with two of them, and
   the sweep parsing the copy that was about to be deleted.

   Resolved in favor of the **fenced block**, which now carries the third column so
   nothing measured is lost. The reason is not aesthetic: a fenced block is keyed by its
   info-string, which is a contract, whereas a parser that locates a table by an exact
   heading literal returns `null` the moment anyone rewords the heading — and a long ADR
   holds many pipe tables a table regex can wander into. `parseAdrVocabulary` was
   repointed at the fence and mutation-proved against this file: flipping an
   `auto_remediable` value or dropping a row turns the sweep red, and a markdown table no
   longer parses at all, so the collision cannot silently recur.

   The generalizable part is why this was nearly missed. **A clean merge is not evidence
   of a coherent result.** Both sides were individually correct; the defect existed only
   in their union, which is precisely the class no per-branch check can see. It was
   caught by an adversarial re-verification that diffed the two ADR versions against each
   other rather than reviewing either alone.

10. **The drawn machine was not exhaustive, and now it is checked instead of claimed.**
    Amendment 4 added `n/a` to the unit states after it was found reachable and unnamed.
    That was one instance, repaired by hand; P6 asserts the *property*, and a property
    re-established by hand each time it is violated is not a property. Enumerating the
    ledger's own `spliceLedgerNode` call sites — 25 of them, yielding 7 distinct
    `allowFrom → status` pairs — against the seven-row table found the omission was
    systematic, not incidental:

    - **The claim/select transition was absent entirely.** The table began at `freeze`, so
      the run's *first* kernel write had no row: `claim startup` / `pick-next` creates the
      project folder and `workflow-state.md`, refuses without an explicit `--target-issue`
      and a validated selection record, and stamps `status: active`. That is a kernel
      write with an L1 guard and an A3-adjacent commitment, and it was undrawn. Now
      `edge unclaimed -> planning`.
    - **Every backward edge was absent.** The table drew `pending → open → done` with
      `done` implicitly terminal, while the code moves `complete → pending` from six
      subcommands (`reopen-node`, `repair-node`, `reexpand-open`, `amend-surface`, and the
      review fold inside both close verbs) and `in_progress → pending` from eight. Repair
      and re-expansion — the whole recovery surface — were literally undrawn state
      transitions, which is the #839/#840 diagnosis applied to this document.
    - **`pending → done` and `open → n/a` were absent.** `expand-close` discharges an
      expansion point that was never opened; selector resolution folds an arm that was
      *already open*, not only a pending one. The prose said "reachable from `pending` …
      at selector resolution" and the code's `allowFrom` is `['pending', 'in_progress']`.
    - **Mid-run row creation was absent.** `expand-open` appends `pending` rows to a frozen
      ledger, so units enter the machine after freeze. The table's only entry point was
      `freeze`, which quietly asserted a fixed unit set.
    - **Verbs were absent from the rows, and the omission hid live routes.** A transition is
      not fully drawn by its endpoints: `amend-surface` reaches `runReExpandOpen`, and
      `reconcile-running-set` reaches the expansion frontier's `runOpenReady` through the
      same `openExpansionFrontier` helper `expand-open` uses, so both perform ledger moves
      the reader would attribute only to the recovery verbs. Naming the verb on each row is
      what makes the drawing usable as a route, and the check derives that column from the
      call graph rather than trusting it.
    - **One phantom: `abandoned` was drawn as a unit state and is not one.** Nothing in the
      lifecycle ever stamps a unit `abandoned`; `abandoned` is a *run* `status:` value
      written by `claim discard` / `claim release`. The two mechanisms the prose cited for
      it do something else — speculative discard resets the row `in_progress → pending`,
      and epoch supersession freezes the parent epoch under `.cache/epochs/{ordinal}/`
      without touching any row status. Reclassified as the run state `discarded`. A
      phantom state is the same defect as a missing one — it makes the drawing and the
      system disagree — and it is the half a hand audit reliably misses, because nothing
      ever fails on account of a state that never occurs.
    - **`halted` had no honest exit.** `write-halt` accepts five reasons; `clear-halt`
      accepts two. A `test_thrash` or `integrity` halt therefore cannot be cleared by the
      runtime that raised it — deliberately, since auto-clearing an integrity halt would
      launder the signal (R4). But that makes `halted` a reachable state whose drawn exit
      does not apply to it, which is the #839 wedge shape. The exit exists and is now
      drawn: `edge halted -> discarded`, a claim-level discard, an A3 call.

    The table is replaced by a fenced `kernel-state-machine` block, for amendment 9's
    reason and not for a new one: the vocabulary it settled has exactly one left-hand side
    because a fence is keyed by an info-string, and the machine now needs the same property
    for the same purpose. `scripts/test-kernel-state-machine.js` parses it and checks the
    claim mechanically — every code-reachable `(from → to)` pair must appear as a
    `ledger-splice` edge and every `ledger-splice` edge must be code-reachable; every
    ledger status must map to exactly one drawn state and back; every `terminal` state must
    have zero outgoing edges *and* zero outgoing splice pairs in the code; every `live`
    state must have at least one outgoing edge; every verb named must resolve in its
    script's own argv dispatch; and every subcommand that reaches a ledger write must be
    named on the edge it produces. The parser and the checks are mutation-proved against
    this file itself: deleting a row turns the suite red naming the row, and adding a row
    for a transition the code cannot reach turns it red naming the phantom.

    Why it mattered enough to be worth mechanizing: this section is the one place the
    decision claims a *complete* description of the runtime, and every other claim in the
    document leans on it. P3 ("wedge extinction … impossible by construction") is only
    meaningful over a table that names every condition; R1 ("a new refusal must sit at L1,
    L2 or A3") is only checkable if the loci are the whole space. An incomplete drawing
    does not merely under-describe — it makes the decision's own guarantees unfalsifiable,
    which is precisely the charge this ADR levels at the 474 refusals it replaces.

11. **The § process-boundary spawn measurements are stale, and are retracted rather than
    quietly rewritten.** They were present-tense claims about a tree the campaign then
    changed under them, and no amendment had said so — the exact failure mode amendment 6
    named (an imported claim carries no evidence with it). Re-measured on HEAD with the
    instrument of record, `node scripts/test-spawn-ratchet.js` (banner) and its
    `measure()` export (per file):

    - **`test-adaptive-handoff`: "0 spawn sites" is FALSE — it holds 2** (both unclassified,
      baseline row 2). `test-oracle-kernel`'s 0 still holds.
    - **`test-replan`: "11" is still the total, but the number no longer means what the
      sentence uses it for** — 11 sites, of which 5 are now CLASSIFIED (2 `cli-contract`,
      3 `durable-handoff`) and 6 unclassified. Quoted as "sites the pattern left behind" it
      now overstates by ~2x.
    - **"the three pre-pattern heavyweights hold ~1,100 static spawn sites (785 / 197 / 126)"
      is stale on both halves.** The sentence also conflates two different triples: the
      suites behind the fast gate's rotating `--shard auto/12` slice are
      `simulate-workflow-walkthrough` / `test-adaptive-node` / `test-replan` (**140 / 87 /
      11 = 238 sites today**), while the 785 / 197 / 126 parenthetical tracks
      `simulate-workflow-walkthrough` / `test-adaptive-node` / `test-claim-hardening`
      (**140 / 87 / 83 = 310 today**), and `test-claim-hardening` is not in the fast chain
      at all. Neither triple is anywhere near ~1,100.
    - **Amendment 8's own "already-landed call-site reduction (2,056 → 872 sites)" must not
      be re-quoted as a live number.** It was a correct point-in-time total; the same
      instrument reported 880 at `6548f76c` and 883 at `efdab963`, and reports **885 total
      sites across 55 files — 265 classified, 620 unclassified** today. The reduction it
      records happened; the residue is what moved.

    The durable rule this leaves behind: **this document does not carry live spawn counts.**
    `scripts/test-spawn-ratchet.js` plus `scripts/spawn-ratchet-baseline.json` are the
    measurement of record, they are tighten-only and default-on, and any figure quoted here
    is a dated observation — cite the command, not the number.

12. **Amendment 6's own measured formula was half-wrong, and the missing half is the
    load-bearing one.** It corrected the false three-way equality (§ Layer 2, cells are NOT
    part of it — that part stands) but then stated the derivation as "(code x declared
    discriminator value). Measured: 7 codes, 64 cells". Those two halves disagree against
    the shipped `deriveCells()`: (code x declared discriminator value) is **49** on HEAD, and
    the sweep's **64** adds **15 SECONDARY-ARM cells** — `kernel_write_failed` record x
    {retry, environment} (+4), `kernel_lock_held` kind x {live, stale} (+3), and
    `sink_verdict`'s `unattributed_paths` x its 8 declared subtypes (+8). The full derivation
    is now written out in § Layer 2. This matters in exactly one direction and it is the
    dangerous one: an implementer re-deriving the cell set from the stated formula would
    build 49 cells, silently drop every secondary arm — the arms that exist *because* the
    same code exits differently on the same primary discriminator — and still pass the "7
    codes" check, so the sweep would weaken with nothing turning red. The sweep's own
    `live_cells=49 / 64 walked` banner is the reconciliation: the WHY slot keys on the
    primary pair, the FACT keys on the arm.

13. **§ Layer 2's minting claim was overbroad; the true guarantee is narrower and is now
    stated as such.** The text read "a code minted in a script (including one built by string
    concatenation at runtime) fails the build". Verified against the sweep: what fails the
    build is a code out of sync across the fence / registry / vocabulary, a discriminator
    value without a route (or a route for an undeclared value), and re-use of one of the
    seven family names as a legacy `condition` literal. An unenumerated code handed to the
    kernel emitters is rejected by `validateRefusalPayload` at **runtime**. A brand-new
    reason string emitted directly in a script's own envelope — the way every legacy
    condition is emitted today — fails **nothing**: the census counts 734 distinct condition
    values and prints `unclassified=374` as a METRIC with no assertion behind it. The
    overclaim is not cosmetic; read literally it says the anti-growth ratchet already binds
    the whole codebase, which would retire the demotion batches that are the only thing that
    can actually make it true.

14. **One refusal, one exit — and `auto_remediable` refined to the CELL.** Auditing the
    route contract against the #826 final-fix wall found the contract making its central
    promise twice, differently. An actionable envelope is stamped by two seams: `route`,
    the bare verb token derived from the per-finding table, and `refusal_route`, the
    structured route resolved by the family. Nothing checked that they rendered the *same*
    exit, and measured on the shipped code **all eight** reasons carrying a bare token
    resolved `claim:finalize` structurally — the `sink_verdict` family's fixed re-read
    verb. For `final_fix_production_surface` that second answer is not merely different, it
    is unclearable: every refusal in that ladder is zero-write, so there is no verdict on
    disk for a re-read to report.

    Three changes, all in the direction of *one* answer. (a) The family's top-level route
    is now payload-aware: the read-all-again verb is the COMPOSITE's exit and only the
    composite's, and a payload naming exactly one finding resolves that finding's own
    remedy route. A single finding whose cure the kernel deliberately does not name keeps
    the re-read verb, which is a promise to *report* again — one re-reading can keep — not
    a promise to accept a fix. (b) `final_fix_production_surface` classifies to its own
    declared finding kind instead of being folded into `unreviewed_change`; the fold read
    the same verb by coincidence while putting the two renderings in two different registry
    cells, either changeable without the other. Both now come off ONE frozen entry
    (`legacy_token` and `.route`). (c) `auto_remediable` gained a per-cell tightening,
    because the family flag could not discriminate: `sink_verdict` is auto-remediable and
    correctly so — a red chain is re-run — while the cell inside it that R4 exists to name
    is precisely not. The flag was therefore silently saying "repair it" about the one
    deviation this ADR says must be reported and never repaired.

    The generalizable part: **a contract that states the same promise in two places has not
    stated it twice, it has stated two contracts.** The sweep now walks the derived table
    and proves both renderings name one verb, in both directions, so a reason cannot gain a
    bare token without the structured route agreeing.

    *Left open, deliberately.* The sweep's R4 route check (`checkR4`) is still gated on the
    FAMILY flag, so the newly-tightened cell's route is not yet R4-checked. Closing that
    gate requires deciding whether `replan shape-refutation` belongs in
    `INVESTIGATION_OR_DISCARD` — it discards the *shape* rather than repairing the
    deviation, which reads as investigation/discard, but that set is a fail-closed anchor
    and widening it is an owner call, not an implementer's.

Also sharpened, not amended: **P4 now states that M2's ordering is load-bearing.** The
recorder must land with the registry batch; only the reporter may follow M3. A before/after
whose "before" is captured after the deletions it measures is not a measurement.
