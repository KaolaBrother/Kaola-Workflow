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

**Layer 3 — Free orchestration.** Scheduling, fan-out width, ordering, speculation, halt
handling: agent judgment guided by skill prose. No typed refusal shapes any of it.

### The kernel state machine, drawn

The design change is visible as a state-machine change. **Unit states:** `pending → open
→ done`, plus `halted` (the A3 valve) and `abandoned` (speculative discard / epoch
supersession). **Run states:** `planning → executing → sinking → archived`, with
`replanning` as an epoch fork that rejoins `executing`. The full transition table:

| Transition | Actor | Guard and its verb |
|---|---|---|
| freeze (plan → kernel) | planner | grammar lint (**advise**); kernel write (**L1**) |
| open(unit) | agent | readiness closure (**answer**, whole frontier); worktree isolation (T9a) |
| close(unit) | agent | evidence recorded (**L1**); steering instruments (**advise**, T6) |
| halt / clear-halt | agent ↔ human | consent (**A3**) |
| replan (epoch fork) | planner | parent snapshot (**L1**) |
| sink | agent | tests + attribution + review + consent (**refuse, L2**) |
| archive | agent | forge chain settled (**L1**) |

Contrast with today: the ~474 typed refusals are, structurally, **hundreds of undeclared
states** — each "run in condition X, refused" (stale, mismatched, wedged, unroutable) is
a state the drawn machine does not name, and several have no legal exit at all (#839's
permanent wedge, #840's dead verb are literally reachable states with no drawn
transition out). A state machine that cannot be drawn is not a state machine. The table
above is required to stay **exhaustive**: every reachable condition has a named
transition out, and a proposed mechanism that would create a condition without one is
rejected by construction (it would violate P3). This also answers the standing question
"is a state machine enough?": *as the durable contract, yes — this one; as police, no
machine is needed at all.*

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

This is the enumerated list Layer 2 refers to. It is **normative and closed**: adding a
row is an amendment to this ADR, which is the anti-growth ratchet in its literal form.
`scripts/test-refusal-route-sweep.js` parses this table and asserts it equals
`Object.keys(KERNEL_REFUSAL_REGISTRY)` and `KERNEL_REFUSAL_VOCABULARY` exactly, in both
directions — so the registry has no independent content to drift with, and a code minted
in a script (including one built by string concatenation at runtime) fails the build.

| Code | Locus | auto_remediable |
|---|---|---|
| `kernel_write_failed` | L1 | yes |
| `kernel_cas_lost` | L1 | yes |
| `kernel_integrity_broken` | L1 | **no** (R4) |
| `kernel_lock_held` | L1 | yes |
| `kernel_evidence_missing` | L1 | yes |
| `sink_verdict` | L2 | yes |
| `consent_required` | A3 | **no** (values call) |

Specificity is carried in the payload. Each family declares its discriminator enum in
`REFUSAL_PAYLOAD_SCHEMAS`, and its route table is keyed by that same enum — the sweep
proves the two key sets equal in both directions, so a discriminator value with no route
and a route for an undeclared value are both build failures.

`kernel_evidence_missing` is a **deliberate +1** to the four L1 families named in Layer 2
above, and is flagged as such rather than absorbed silently. Its justification is this
ADR's own transition table — `close(unit) | evidence recorded (**L1**)` — plus the #825
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
  (transitive closure), never a single next node — the answer itself invites co-opening.
  Critical-path-first ordering and tier right-sizing remain scheduling *advice* from the
  same tool.
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
only where the property under test lives **at the process boundary**. Four classes
qualify: the **CLI shell contract** (argv → handler → envelope → exit code — proven
once per subcommand, not once per scenario); **U-ground concurrency** observables
(multi-process lock and atomic-write contention); **I-ground crash** semantics (kill
mid-write, restart, recover — the P1 kill test); and **environment/install** probes.
Every other assertion is function behavior plus file state, reachable in-process
through the `module.exports` APIs all eight CLIs already publish — the pattern the
three newest suites prove (`test-adaptive-handoff`: 0 spawn sites;
`test-oracle-kernel`: 0; `test-replan`: 11), while the three pre-pattern heavyweights
hold ~1,100 static spawn sites (785 / 197 / 126) — exactly the suites behind the fast
gate's rotating slice, each spawn paying node startup plus a 7–17k-line parse for no
added evidence. The necessary set is ~10% of the current census; conversion also
removes the material basis of the "suite cannot be parallelized" constraint (spawn
contention). Production composition is already in-process (aggregators `require` their
siblings' pure functions); the residual production subprocess cost — 56 `git` execs in
the node lifecycle plus the validator shell in barrier choreography — is a bounded,
separate lever, not part of this claim.

## Standing admission rules (in force from acceptance, before any migration)

- **R1 — Locus and severity.** A new refusal must sit at L1 or L2, **and** be crucial
  there: proceeding would irreversibly corrupt or lose a kernel record, let
  unverified / unreviewed / unconsented content reach mainline, or override a human
  values call. A condition recoverable in place ships as an advisory even at the two
  loci; a mid-run refusal proposal ships as an advisory or a tool.
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
  conversion proceeds.
- **P5 — Prose census.** The six routing surfaces' line count and the contract
  validators' needle-pin count drop in proportion to the refusal census (T11). If the
  prompts do **not** shrink as refusals demote, choreography is surviving its refusal —
  a violation of T11 to be hunted, not tolerated.
- **P6 — Drawn-machine exhaustiveness.** Every reachable run condition appears in the
  transition table with a named exit; a walkthrough scenario asserts no reachable
  condition lacks one (the mechanical form of "no undeclared states"). The route
  contract's registry sweep is its per-refusal refinement: every surviving reason code
  is walked refusal → route → green, so an exit-less refusal cannot ship.

## Risks

- **Advisories may be ignored.** This is already the shipped reality: interception was
  retired (#372/#725) and every gate is entered voluntarily. The change is honest
  labeling plus a real net at the only place that matters (L2).
- **Drift discovered late** (sink-only hardness). Mitigated by T6 instruments at every
  boundary; a steering signal ignored N times is itself visible in M2 telemetry.
- **Git-as-journal costs.** M4 is explicitly evaluate-first.
