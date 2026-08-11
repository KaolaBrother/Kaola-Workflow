# 0017 — The mission list: four fields where the DAG was

- **Status:** Accepted
- **Date:** 2026-07-31
- **Supersedes:** the **node/DAG executor** as the unit of execution — and with it the plan grammar,
  the role vocabulary, declared write sets, post-dominance gates, the disjointness proof, the
  serializer taxonomy, the freeze chain and the re-plan epoch machinery. **Does not supersede** ADR
  0016, which it completes, nor the four durable records, which survive as fields in one file.
- **Resolves:** ADR 0016's standing *"keep merging; R3 survives permanently"* ruling. R3 becomes a
  report; the orchestrator owns the sink's outcome. **The refusal count reaches zero.**

## What ADR 0016 started and this finishes

ADR 0016 retired the premise that the agent needs a harness, and converted refusals into reports:
*delete the verdict, keep the measurement*. But it left the **shape** of the plan untouched — a
frozen, machine-readable DAG of typed role nodes with declared write sets, executed by a scheduler.

That shape is the last artifact of the expired premise. A DAG is a schedule written for something
that cannot schedule itself. Owner ruling, 2026-07-31:

> "You just look at our current session history — we can work without the framework of the workflow
> very well, dispatching sub agents and coordinating them with the main orchestrator. Even without a
> bookkeeping system, we don't drift. We don't encounter any problems in terms of parallelism. I only
> gave a prompt indicating the role of main orchestrator and dispatching sub agents as demanded, and
> I gave you a goal. Usually that's enough. Now what I'm trying to do is the workflow based on our
> current methodology, and just adding a little bit of bookkeeping in. The tools are the things the
> main orchestrator exposed — sub agents and worktrees. **Do not over-complicate. We have already too
> many things in this project. We're now starting from the zero point to build up things.**"

## The existence proof, and the one thing it broke

This design is not derived from the current system minus parts. It is derived additively from an
**observed** configuration: a bare session, no workflow framework, no plan, no gates, no bookkeeping.
The entire input was a prompt naming the main-orchestrator role with subagents dispatchable on
demand, plus a goal.

That configuration decomposed the work, dispatched and coordinated **six concurrent subagents**
across disjoint files with no conflicts, found real defects — including one the shipped test corpus
could not see — and did not drift.

**One thing failed.** All six subagents were killed simultaneously by a usage limit and the
in-process task list was wiped. Content survived, because git already is the content record. What
did not survive was **what was in flight** and **what remained to do**; recovery cost a `git diff`
sweep plus re-running suites to rediscover results that had lived only in dead subagents' pending
returns.

That is the whole demonstrated gap, and this design is sized to it.

## The derivation

One sentence: **coordination state must live where content already lives — on disk.**

Everything else follows as fields. Note what the successor axiom does *not* derive: any check that
the records are *sufficient*. It derives that whatever was collected is readable and honest. Judging
sufficiency would be the system deciding what the agent needs, which is the move ADR 0016 deleted.

## The design

**One file per run. Four fields per item. Three write moments.**

| field | content | written |
|---|---|---|
| `item` | the mission — one line of prose, hints and facts | at creation |
| `status` | `todo` \| `in-flight` \| `done` | on change |
| `dispatched` | what went out and to whom, enough to decide re-dispatch vs. wait | at dispatch |
| `result` | where the outcome landed — a path, or a few lines inline | at close |

Plus a header line carrying the goal. **Marked as extrapolation:** the orchestrator held the goal in
context and never lost it, but the same usage limit that killed six subagents applies to the main
session, and the fix costs one line in a file that already exists.

`dispatched` is the field the wipe proves necessary — it is the only fact about a run that exists
nowhere else once the process dies. `result` is the field the recovery cost proves useful.

**No script is required.** A file convention suffices. An atomic-append helper is a convenience the
orchestrator may decline. Tools stay tools — subagents and worktrees — offered and declinable, per
ADR 0016's test: *can the agent decline it and still finish?*

### An item is a mission, not a specification

An item carries no role, no write set, no dependency edge, no model, no cardinality, no shape. When
the orchestrator reaches an item it decides **then** whether to dispatch subagents or do the work
itself, and at what width.

This is the existing control boundary applied one level up. The planner brief already refuses a
pre-authored `## Nodes` or an `AUTHOR EXACTLY` because *briefs carry evidence, never prescriptions*.
When author and dispatcher are the same agent, that boundary is not violated — it is moot, and the
prescriptive half of the plan record goes with it.

### Concurrency carries no machinery at all

Owner ruling, 2026-07-31: *"For the disjointness — this is up to the agent too. We don't put any
regulations or any inspections even. From what I'm observing, the current agent's ability allows it
to decide whether or not to parallel. It can easily distinguish the work. Any form of regulation or
structure is limiting."*

So there is no antichain sweep, no disjointness check, no serializer taxonomy, no evidence line, and
no cap. The frontier is not computed: under a list it is *list minus closed minus in-flight*, visible
by construction. **"Parallel by Default; Serial Requires Evidence" is retired as a rule** and
survives only as a description of how a competent orchestrator already behaves.

## What is retired

Roles and the role manifest · `depends_on` · declared write sets · the four-shape grammar and
`select(<group>)` · post-dominance gates G1–G4 · the antichain / `parallel_safe` sweep · the S1/S2/S3
serializer taxonomy **and its evidence-line existence check** · fan-out caps · expansion and
re-expansion · the freeze chain · `plan_hash` · epochs and the re-plan CAS machinery · the mandatory
planner and its control-boundary refusal · `ROLE_TOKEN_REGISTRY` · `upstream_read` consumed-proof ·
the hollow-seed refusal.

Estimated scale: a few hundred lines replacing ~35k canonical lines of node-execution core, and well
over 100k across the four editions, plus the walkthrough's node-lifecycle pins. Much of the
four-edition duplication problem dissolves with the machinery that carried it.

**Named accepted losses**, so they are not discovered later as surprises: the `upstream_read`
consumed-proof has no list-form analogue that is not a role/edge system in disguise — nothing will
detect an item that ignored its predecessor's findings. Per-role evidence richness goes with
`ROLE_TOKEN_REGISTRY`. Early scope-violation detection goes with declared write sets; a violation is
now noticed when a reader looks, not one node later.

## The watch list — derived, never observed, therefore not built

Earlier subtractive passes derived mechanisms for failure classes that **have never been observed in
this methodology**. They are recorded here rather than built, so that if one is ever seen the design
is a lookup rather than a campaign.

**This table is the register of record, and the only one.** A backlog issue once mirrored it so the
analysis was discoverable from the issue list rather than only from a doc nobody opens; that pointer
is closed, because a permanently-open issue that is explicitly not work is a standing invitation to
schedule it. Every row therefore carries its own recovery information inline — a row whose mechanism
was built and later removed names the symbols and the commit to recover them from, so consulting the
table never requires reading a closed issue or a deleted roadmap entry.

| failure class | observation that would arm it | mechanism already sized |
|---|---|---|
| stale / replayed / cross-copied evidence | a result that does not correspond to the work claimed | provenance stamps: open, baseline ref, author, time |
| two honest live writers on one file | a successor resuming beside a crashed-but-alive predecessor | CAS with the conflict returned as data; lease with liveness probe — built once as `acquireProjectLock` / `probeLockLiveness`, removed in `c4caa8d3`, recoverable from git history at `b3bc7acf` |
| co-open items sharing a working tree | per-item results that cannot be told apart | label the blend as a blend — a joint result, honestly named |
| an unrecoverable merge | a sink outcome the orchestrator could not repair after the fact | a rescue ref per merge, recording pre-merge state |
| a value call taken by the agent | an irreversible choice a human should have made | the consent valve — built once as the halt marker, its two journals and `consentScopeDigest`, removed in `c4caa8d3`, recoverable from git history at `b3bc7acf` |
| a typed envelope code documented asymmetrically across runtimes | any typed `reason:` code appearing on a runtime surface **at all** — the enforcement domain becoming non-zero. Today it is 0 of 62 | `scripts/test-runtime-lexicon-parity.js`, deleted 2026-08-01, recoverable from git history at `b3bc7acf` |
| retired vocabulary entering an additive edition through its own transform | a retired token on an `.opencode/` or `.kimi/` surface that is **not** present in the canonical source it renders from — i.e. one introduced by the sync transform itself | the scan already applied to the other two render families: import `RETIRED_VOCABULARY_BAN` and run it over the rendered edition tree, as `test-generate-routing-surfaces.js` does |
| a claim-marker delete that matches every project at once | a production call reaching `clearAdvisoryClaim` with a **falsy** `project`, whose generic-regex arm then clears other runs' live markers. All 11 production sites pass a provably non-empty slug, so the arm has no producer today | narrow the falsy arm to match nothing. Note it is **not** dead code: `test-gitlab-forge-helpers.js:214` and `test-gitea-forge-helpers.js:281` pass `null` deliberately and assert match-everything by name, so arming this deletes those two pins with the mechanism |
| a claim marker the detector sees but the deleter cannot clear | a marker blocking a re-claim that no workflow command can remove — the deleter is an exact, case-sensitive, `project=`-only substring while the detector (`classifier.js:215`) is `/<!--\s*kw:claim\s+(project\|sess)=/`. No `sess=` producer exists, so only a hand-written comment reaches the gap | widen the deleter's predicate to the detector's regex, scoped to the run's own project |
| a stranded marker on an issue left open | a `kw:claim` marker outliving its run on an **open** issue with no live folder. `closure-audit.js` repairs stale *labels* and only on `--state closed`; `kw:claim` appears nowhere in it, and the 24h expiry (`classifier.js:216-217`) is the only thing that clears one — a marker with no `updated_at` blocks indefinitely | a marker equivalent to `detectStaleLabels`. Sized as larger than it looks: the artifacts cannot be told from another session's **live** claim without a project-scoped active-folder cross-check |
| an edition-sync mismatch class shipped without a remedy | a `mismatches.push` site in `sync-opencode-edition.js` reaching `remediationLines` with no `remedy` field. `remedies` is a `Set` built by `mismatches.map(m => m.remedy)`, so `undefined` is neither a flag nor a source edit and falls out of **both** branches — the class prints no advice at all, silently reintroducing what #941 closed. Probe-measured on a mirror by adding a fifteenth class; all 14 real classes carry a remedy today, so the arm has no producer | assert at the constructor sites that every pushed mismatch carries a known `remedy`. Note A30's `CLASSES` table is hand-maintained (3 of 14) and structurally cannot notice, so the assertion belongs over the push sites, not in that table |
| an opencode `--check` report that advises a command without scoping out what that command cannot fix | a shipped report naming a `Fix:` invocation while silently omitting the file no flag clears. Mutation-measured 2026-08-11 (#951): dropping the source-edit footer conditionally (`flag ? [] : …`) **or** unconditionally (`sourceEdits = []`) leaves `test-opencode-edition.js` green at 563/563, exit 0, the suite's own output byte-identical to baseline under **both** legs. No assertion in that suite observes the line: A30 quantifies over `ADVICE_RE` runnable invocations and the footer is prose, so it never enters `advised`. A second, independent copy sits on a **prose** surface — `docs/opencode-edition.md:362` carries the line verbatim and its rule at `:349-353`, and no script consumes that doc, so code and documentation can diverge with every suite green. Severity is bounded for the conditional form only: the line reappears on the re-check once the advised command runs. Under the unconditional form it never appears at all | two, neither built. **(1)** A non-wording discriminator: assert the flag-irreducible path is named at least twice wherever `flagProof` is non-empty — +3 assertions (563→566) across those 3 of 6 scenarios, catching the conditional form on 2 of 3 (it survives the scenario that advises no flag) and the unconditional on 3 of 3, and invariant to rewording. Scope it to the flag-advised scenarios instead and it sizes to +2, still catching both forms but losing the flag-free scenario — the pure flag-irreducible case — so the unconditional form reds on 2 of 3 sites rather than 3 of 3. **(2)** The kimi twin's shape: `K12` (`test-kimi-edition.js:1324-1414`) pins that edition's remediation as an **outcome** and reds twice when its line is deleted (521 / exit 0 → 2 failures / 518 passed). So **opencode is the edition missing a guard its sibling already has** — the sharpest fact that would arm this row, and still not an observed failure. A prose-sentence pin is refused outright: A30's header derives against it, and it would be the file's first, though a *token*-level output pin has precedent at `:2818` |

The additive-edition row was derived by symmetry, and symmetry is exactly the argument this list
exists to refuse. Both other render families now carry the scan — the twelve reviewer surfaces since
the retired-vocabulary cleanup, the eighteen routing surfaces since #887 — and each was armed by an
observed failure: `node-id` reaching twelve surfaces through a generator's own render, and retired
node/DAG wording reaching the plugin manifests a user reads before installing. **No token has ever
entered through an opencode or kimi transform.** Their surfaces render from canonical, which is now
scanned on both sides, so the only uncovered path is a token the transform *introduces* — which is
the observation named in the row, and until it happens the row is a lookup, not a task.

The lexicon row is the only one whose mechanism was **built first and removed after**, so it carries
the measurement that retired it. The guard compared two vocabularies that live in different families
by design: the engine emits an **envelope** vocabulary — the machine-readable `reason:` field of a
JSON receipt — while the runtime trees carry an **interface** vocabulary of dispatch field names, env
vars, config knobs and contract field names. Their intersection was 0 of 62 derived codes across all
102 runtime documents, and not one occurrence of `reason:` exists in `commands/`, `agents/` or any
`SKILL.md`. 33 of the 62 are documented, runtime-neutrally, under `docs/`; the other 29 nowhere.
`docs/conventions.md` legalizes the empty state outright — a typed code "must be documented on
**every** runtime or on none" — and 62/62 satisfy it by being on none. The guard was therefore always
green, always vacuous, and its headline ("0 asymmetric across 6 runtimes") read as a clean sweep over
a domain that was empty.

**Do not resurrect this by widening the derivation.** Five candidate derivations were measured —
object-literal keys, quoted string keys, dot-field reads, any snake_case in the engine, and deriving
from the surfaces themselves. Every one that makes the domain non-empty pulls in Codex-only config
knobs (`max_threads`, `model_reasoning_effort`, `dispatch_posture`, …), forge-native tokens
(`issue_iid`), and prose noise (`node_modules`), each needing its own hand-typed exemption — up to 22
for the surface-derived variant. That is re-authoring the guard as a different guard, not repairing
it. The arming observation above is the cheap one: watch the intersection, not the pattern.

The consent valve deserves one note. In the observed configuration it was not absent — it was the
orchestrator **asking the user**, which happened and worked. A durable valve is only needed once a
question must outlive the process that asked it; until that is observed, conversation is the
mechanism.

## R3: the sink reports, and the orchestrator owns the outcome

ADR 0016's standing ruling was *"keep merging; R3 survives permanently"* — a refusal at the
publication door. **That does not port.** Owner ruling, 2026-07-31:

> "It's not refusing. We should tell the agent that the sinking is somehow problematic if anything
> occurs, and let the main orchestrator solve the syncing and make sure they're correctly merged,
> resynchronized, or a PR filed. And clean up after the sink."

So the sink is the last mechanism to lose its verdict, and it loses it the same way every other one
did: **the measurement stays, the verdict goes, and the agent acts on what it is told.** The sink
reports what it found — content on the branch that no record describes, a witness bound to different
bytes, a merge that did not fast-forward — and the orchestrator resolves it.

**This is not "merge anyway and report."** Resolution is the orchestrator's *responsibility*, and it
owns the full outcome: get the merge correct, resynchronize, or **file a PR instead** — a PR being a
perfectly good resolution precisely because it stages content for review rather than publishing it —
and then clean up after the sink. The distinction that matters is not refuse-versus-proceed; it is
**who is accountable for the branch ending up right.** Under a refusal the answer was "nobody, the
door said no"; here it is the orchestrator, which is the only party with the context to fix it.

No rescue ref is mandated. It remains available as a tool for an orchestrator that wants pre-merge
state recorded, and it sits on the watch list against the day an unrecoverable merge is actually
observed.

**Consequence for the refusal count: it reaches zero.** The consent valve is conversation with the
user, R1 was never armable for want of a fallback record location, and R3 is now a report. Nothing in
the mission-list design refuses.

## Two evidentiary corrections, kept because other work leans on them

1. **#854 row 9's *"every traced run silently serialized"* is not a capability datum.**
   `kaola-workflow-adaptive-node.js:7892-7900` attributes it to a dispatch-fidelity defect —
   `open-next` single-opened `readySet[0]`, serializing a frontier **the planner had authored as
   parallel**. The agent never saw the frontier. A tooling defect is an argument for deleting the
   tooling, not for keeping a check on the agent.
2. **ADR 0016's keystone anecdote is an untraced capability claim.** *"A missing reviewer over a
   code-producing node produces no error, no red, and no stall — it produces a merge"* asserts what a
   runtime agent would not notice, with no trace cited. It is pessimistic rather than optimistic, but
   it is inadmissible by the same standard that retired correction 1. Several #871 conversions lean
   on it; whoever executes them should know its status.

## Build sequence

**The ordering principle is the design's own: build the replacement and observe it working BEFORE
deleting anything.** Deleting first would make every intermediate state unshippable and would remove
the machinery whose behaviour the new file still has to reproduce.

1. **Write the file format and the four fields.** The whole mechanism; no script. Deliverable: a
   written convention plus one real file. Nothing is deleted in this step.
2. **Run a real session on it, end to end** — decompose, dispatch, close, resume after an interrupted
   dispatch. **This step gates every deletion below it.** Additive discipline applies to the migration
   itself: the DAG stays until the replacement is observed carrying a run.
3. **Extract what is load-bearing for something other than node execution**, before the host dies —
   the finalize door currently runs through the plan-validator's whole-plan attribution sweep and must
   be re-pointed at the recorded per-item locators; the guard prologue is where the consent path
   physically lives; nonce minting sits inside the node-open choreography; and `adaptive-schema.js` is
   the cross-edition drift anchor, so surviving constants must keep living in that one byte-identical
   file.
4. **Delete the node executor and let its tests fall out** — see *What is retired*. Tests are deleted
   with their mechanism, never repaired ahead of it.
5. **Propagate to the four editions and the runtime surfaces.** The DAG is described in prompt
   surfaces, not only in code, including `agents/*.md` and its three hand-maintained
   `plugins/*/agents/*.toml` twins, which no generator owns.
6. **Documentation last.** Rewrite `CLAUDE.md` to describe what ships and **remove its ADR 0017
   banner** — the banner exists only while the decision and the code disagree.

## Method note: derive additively, because subtraction preserves

Three separate passes of this discussion produced a design that kept a mechanism, each time with a
different justification — sufficiency checking, then reconciliation, then a coverage computation.
Each was reason **(b)** *"removal makes the system harder to reason about"* wearing reason **(a)**
*"removal permits an irreversible harm"* clothing. `CLAUDE.md` already warns that this is what
happens, and it happened anyway, to both participants, repeatedly.

The correction that worked was not more discipline. It was **changing the direction of the
derivation**: start from an orchestrator with a goal and no records at all, and add only what an
observed failure demands. Subtractive derivation asks "may I remove this?", and there is always an
answer that keeps it. Additive derivation asks "what forced this to exist?", and silence is an answer.
