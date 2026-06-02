# Adaptive path: freely-composed, task-shaped orchestration on a governed lifecycle harness

**Date:** 2026-06-02
**Status:** Design — for review before filing as GitHub issues
**Relates to:** `docs/investigations/fast-path-widening-2026-05-30.md`,
`docs/investigations/parallel-session-design.md`,
`docs/investigations/classifier-fast-overlap-2026-05-31.md`

---

## Mission

Kaola-Workflow has exactly **two fixed macro-shapes**: the fast path
(single-pass plan+execute+review) and the full 6-phase path. Every step in
each is predefined. What we want is the *flexibility* of a Claude-Code-style
**dynamic orchestration** — an agent designing a task-shaped plan: which
roles, how many, in what shape (fan-out, loops, extra verification passes),
tuned to the specific issue. The third `adaptive` path exists to give the
agent **maximum design flexibility**: it freely designs how the workflow is
carried out for *this* task.

The hard constraint is the framing the whole design must honor:

> **FLEXIBILITY** (agent-designed, task-shaped composition)
> ⟷
> **HARNESS** (durable lifecycle infrastructure, non-removable computed gates)

The agent designs the **middle** of a run freely — but only inside a fixed
frame. The "systematic scope" the harness keeps is **not** a curated template
library (templates would defeat the purpose of free design). It is Kaola's
durable **lifecycle infrastructure**: the atomic claim + parallel-overlap
classifier, the branch/worktree provisioning, the nine sub-agent roles (their
models, the `resolve-agent-model` mechanism, the delegation contract — all
**untouched**), and the Phase-6 sink (close issue, archive, roadmap regen,
deferred/PR handling). The fixed frame is:

```text
   claim ──► branch / worktree ──► [ FREE DESIGN ] ──► Phase-6 sink
   (atomic, classifier-checked)      agent composes      (close, archive,
                                     the middle           roadmap regen)
```

This design lands on the **balanced point**: the agent gets to choose the
*topology and composition* of a run; the harness owns the *node alphabet, the
computed gates, the durable lifecycle, and the resume contract*. The honest
statement of the balance: **gates never trade off against flexibility** —
post-dominance holds over *any* topology (see Principle 1), so the validator
enforces the correctness floor for a freely-designed graph exactly as well as
for a templated one. Templates were never a correctness mechanism; they were
only a human-pre-vetting-of-*shape* shortcut for authorization. What *does*
grow with topology freedom is operational surface (resume, atomicity,
disjointness) and the authorization story — and **that** is exactly what the
staging (§"Issue decomposition") and the risk-based governance table (§5)
exist to manage.

This is an investigation + design document. It is **not** an implementation,
and it does **not** change any role profile.

## At a glance — the design in pictures

### A. Where the new path fits

Today there are two *fixed* shapes. The `adaptive` path is a third option
where the agent draws the shape itself — but only inside the fence.

```text
                         ISSUE
                           │
                           ▼
                  ┌──────────────────┐
                  │  PATH SELECTION  │   (agent judgment)
                  └──────────────────┘
                           │
        ┌──────────────────┼─────────────────────────────┐
        ▼                  ▼                              ▼
     ┌──────┐          ┌──────┐                    ┌────────────┐
     │ fast │          │ full │                    │  adaptive  │  ◄── NEW
     └──────┘          └──────┘                    └────────────┘
   plan→exec→review   P1→P2→P3→P4→P5→P6      agent composes a task-shaped
   ONE fixed shape    ONE fixed shape         graph from the 9 roles
                                              MANY shapes — but governed
```

### B. The balance = two separate layers

Flexibility and harness don't fight, because they live on different layers.
The agent only ever touches the **top** layer — and only the *middle* of the
run (the lifecycle frame around it is fixed).

```text
   ╔══════════════════════════ FLEXIBILITY ══════════════════════════╗
   ║  the agent FREELY designs the ORCHESTRATION (the middle):        ║
   ║    • how many explorers   • whether to fan out                   ║  ◄ agent designs this
   ║    • extra review passes  • ordering, branching, loops           ║
   ╚══════════════════════════════════════════════════════════════════╝
                              runs inside
   ╔════════════════════════════ HARNESS ════════════════════════════╗
   ║  LOCKED LIFECYCLE FRAME + COMPUTED GATES, agent can't touch:     ║
   ║    • atomic claim + classifier    • branch / worktree           ║  ◄ you own this
   ║    • the installed role library, fixed models (resolve-agent-model)║
   ║    • computed gates (post-dominance)  • caps   • disjointness    ║
   ║    • durable state + resume       • Phase-6 sink (close/archive) ║
   ╚══════════════════════════════════════════════════════════════════╝
```

The harness layer is the **durable lifecycle infrastructure** plus the
**computed gate floor** — not a curated catalog of shapes. The agent never
authors a node's model, never drops a gate, never skips the claim/sink frame;
it composes the orchestration *between* claim and sink.

### C. Why a gate can never be skipped (post-dominance, not reachability)

A naive check asks "is a reviewer *somewhere* downstream?" — leaky: the agent
can sneak code to the finish on a side branch. The real rule is
**post-dominance**: *every* path to the single sink must cross the gate.

```text
   ✗ NAIVE ("reviewer exists somewhere")        ✓ THE RULE ("post-dominance")

      tdd-guide ──► code-reviewer                  tdd-guide ─► code-reviewer ─► FINALIZE
          │                                                          ▲
          └────────► doc-updater ──► FINALIZE        every path to FINALIZE is forced
                          ▲                           through code-reviewer — no detour
                   unreviewed code                    exists, no matter how the agent
                   slips to the finish!               reshapes the graph
```

The same machinery forces `security-reviewer` onto every path **when the
change is sensitive** (auth, payments, user data, filesystem, external APIs,
secrets — re-checked from the files actually touched).

### D. A real `adaptive` run (fan-out the linear path can't express)

```text
                    ┌─► tdd-guide  (writes api/…) ─┐
                    │                              │
   code-explorer ─► ├─► tdd-guide  (writes cli/…) ─┤─► code-reviewer ─► FINALIZE
        │  plan     │                              │        │
   (agent chose     └─► tdd-guide  (writes ui/…)  ─┘   security-reviewer
    3-wide)              ▲                              (forced when sensitive —
                    disjoint write sets — enforced,     re-checked at the barrier
                    capped at FANOUT_CAP (default 4)    from files actually touched)
```

**This picture surfaces for approval before it runs.** Any WRITE-ROLE fan-out (N ≥ 2) is
blast-radius-risky by the governance rule (§5), so a concurrent plan like this
one is **never** a silent auto-run: the validator passes it, then it
**surfaces for the user's approval** (ExitPlanMode-style) and only freezes on
an explicit yes. Fan-out is a Tier-1 *capability* (real concurrency, day one),
not an auto-run *authorization*. Sensitivity is **not** decided once at design
time: it is **re-checked at the barrier** from the files each instance actually
wrote, and if a write turns out sensitive on a plan that was authorized as
benign, the barrier **halts for consent** as well as forcing
`security-reviewer` post-dominance (§5, §2).

### E. How much the harness trusts a plan (governance)

There is **one** governance gate: a plan that passes the validator runs
autonomously *unless it is risky*. Risk (not provenance) decides whether to
ask. "Curated vs novel" is gone — every in-grammar plan is treated the same,
because the gates are correctness properties that hold over any topology.

```text
   agent proposes a plan
            │
            ▼
      ┌───────────┐
      │ validator │   (runtime-closed role library, post-dominance gates,
      └───────────┘    caps, write-set disjointness, unique sink)
            │
   ┌────────┴───────────────────────────────┐
   │ in-grammar?                             │ out-of-grammar
   ▼ yes                                     ▼ (unknown role / gate routed around /
   is it RISKY?                                cap busted / non-disjoint fan-out)
   ├─ no  (declared write set provably    ╔═══════════════════╗
   │       outside all Phase-5 areas AND  ║  TYPED REFUSAL    ║  stop, never silently fix
   │       sequential, no write-role       ╚═══════════════════╝
   │       fan-out, under ceiling) ─► AUTO-RUN
   │                         (authorization is PROVISIONAL —
   │                          revoked at the barrier if a
   │                          runtime re-scan upgrades risk)
   └─ yes (sensitive-by-declaration OR any WRITE-ROLE fan-out OR SHARED_INFRA OR
           over file ceiling OR a loop OR risk UNCERTAIN) ─► ASK USER FIRST
                                   (ExitPlanMode-style;
                                    approve, then it freezes)
```

**Risky = fail-closed, and over-approximated pre-execution.** Because the
strongest sensitivity signal (a `.cache` semantic re-scan of the files
*actually* touched) does not exist until run time, the pre-execution check
**over-approximates**: *Sensitivity* (the same G2 signal) is risky if the
frozen issue labels **or** the **declared** write set touch any Phase-5
category — auth, payments, user data, filesystem access, external API calls,
secrets — **or** sensitivity is undetermined. *Blast-radius* is risky on **any WRITE-ROLE
fan-out (N ≥ 2)** (read-only verification/research fan-out is exempt), a touch of `SHARED_INFRA` (`scripts`/`hooks`/`plugins-
scripts`), a declared write set over the file ceiling, or a bounded loop
present. **If sensitivity or blast-radius cannot be determined, fail closed =
risky = ask.** And auto-run authorization is **provisional**: the moment the
barrier's runtime re-scan upgrades sensitivity (or detects overflow into a
sensitive / `SHARED_INFRA` area), the authorization is **revoked → halt for
consent** (§5), not merely "add a reviewer."

### F. The rollout (harness-first staging)

Flexibility-first: the rollout front-loads the hardest engineering (real
`tdd-guide` fan-out concurrency) into Tier 1, because the whole point of the
adaptive path is maximum design freedom — and freedom that excludes fan-out is
not the capability the user asked for. Tier 1 lands the substrate, the
validator, free composition **including fan-out**, lifecycle inheritance, and
risk-assessment governance together. (Fan-out is a day-one *capability*; it
still *surfaces for approval* before running, because any write concurrency is
blast-radius-risky — §5.)

```text
   Tier 1 ──────────────────────► Tier 2 ──────────► Tier 3 (research note)
   substrate + validator           novel non-fanout    headless-runtime
   + FREE COMPOSITION incl          sequence/linear     study (Branch B),
   tdd-guide FAN-OUT (disjoint      polish + more       NON-BINDING
   write sets, real concurrency,    governance cases
   surfaces for approval)
   + LIFECYCLE INHERITANCE
   + risk-assessment governance
   (auto-run / ask-if-risky)

   ●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━●
   harness + free design land TOGETHER          deferred convenience
   (Tier 1 is the real product)                 (templates / runtime study)
```

**One-sentence takeaway:** the agent freely designs the *shape* of the
workflow (D), but inside a locked lifecycle frame (B) where the gates are walls
every path must cross (C) — and the harness runs it autonomously unless the
plan is risky, in which case it asks first (E).

## What the current standard actually is (verified)

Three mechanisms define "the orchestration shape" today, and a fourth guards
parallelism. An adaptive path must replace or extend each without breaking it.

1. **Path selection is a fixed 2-way choice.** `commands/workflow-next.md`
   Step 0a-1 sets `KAOLA_PATH` by precedence (explicit env var > prompt
   keywords > issue rubric > default full). `kaola-workflow-claim.js`
   persists it to `workflow-state.md:workflow_path` (Fact 2). There are
   exactly two legal values today, `fast` and `full`, each hard-wired to a
   fixed command sequence.

2. **Resume is a fixed phase-artifact ladder.** `workflow-next.md` (the
   "Manual reconstruction order") and `kaola-workflow-repair-state.js`
   `reconstruct()` (Fact 1) branch **on which `phaseN` file exists**:
   `phase6-summary.md` → complete; `phase5-review.md` → Phase 6;
   `fast-summary.md` → fast finalize; `phase4-progress.md` → branch on the
   first open task parsed from the `## Tasks` markdown table; … down to
   `phase1-research.md` → Phase 2; nothing → Phase 1. `isFastWorkflowState`
   (`repair-state.js:90`, keyed on `phase: fast` / `workflow_path: fast`)
   is the one place a non-phaseN shape is already recognized, and
   `routeFast()` (`repair-state.js:408`) is an **additive sibling branch**
   ahead of the numbered ladder. **This is the precedent the adaptive path
   follows.**

3. **Compliance is a per-phase fixed role set.** Each phase artifact carries
   a `## Required Agent Compliance` markdown table (Requirement, Status,
   Evidence, Skip Reason). `repair-state.js` `unresolvedCompliance()` blocks
   crossing a phase boundary while rows are pending/missing or invoked
   without evidence; `delegationPolicyCompliance()` enforces the
   `delegation_policy` per controlled role (Fact 4). **Verified, load-bearing
   detail:** the controlled-role matcher
   `DELEGATION_CONTROLLED_REQUIREMENTS` (`repair-state.js:30-39`) mixes loose
   patterns (`/^tdd-guide\b/i`, `/executor/i`) with **exact-anchored** ones,
   including `/^code-reviewer$/i` and `/^security-reviewer$/i`. A row keyed
   `code-reviewer-gate-3` would **not** match the anchor — so naive per-node
   keying silently drops delegation enforcement on the two safety-critical
   gates. The schema rule in §"The design" closes this.

4. **Write-set disjointness is cross-folder only.** The classifier
   (`scanClaimedOverlap`, signature
   `(candidatePaths, candidateAreas, candidateAreaLabels, activeFolders, root)`)
   reads each *active folder's* write set off disk and compares one candidate
   against them. **Verified:** it has **no `module.exports`** and **no N-way
   pairwise primitive**; `SHARED_INFRA` (`classifier.js:215`:
   `scripts`, `hooks`, `plugins/kaola-workflow/scripts`) yields yellow, not
   red. There is **no within-issue** disjointness today: Phase 4 runs one
   `tdd-guide` at a time in a strictly sequential Per-Task Loop (Fact 3).

The caps that bound the existing shapes are also verified first-party and are
reused verbatim: file overflow = **declared write set + 1 file**, absolute
backstop **6 files** (`fast.md:63`); **`test_thrash` ≥ 3** consecutive
failing cycles on the same test (`fast.md:64`); the escalation trigger
vocabulary and its literal `" — "` parse delimiter (`fast.md:71`);
`code-reviewer` **always required** and `security-reviewer` required when
touched files involve **auth, payments, user data, filesystem access,
external API calls, or secrets** (`phase5.md:44-46`, `:214`).

## Design principles

1. **Flexibility is topology; harness is the lifecycle frame + computed
   gates.** The agent freely designs the *graph* (how many explorers, whether
   to fan out `tdd-guide`, where to add a review pass, the ordering, loops).
   The node *alphabet* (the installed role library), the *models* (`resolve-agent-model`), the
   *gates*, the *caps*, the *durable-state contract*, and the *lifecycle frame*
   (claim → branch/worktree → … → Phase-6 sink) are fixed. More nodes can never
   erode a gate, because gates are graph properties the validator computes, not
   flags the author sets.

2. **Compose the PATTERN, not the RUNTIME.** What the user wants is the
   composition pattern (task-shaped orchestration), which is independent of
   *where* it runs. We borrow the Workflow-tool grammar
   (`agent()`/`pipeline()`/`parallel()`, role-typed nodes) as a **design
   vocabulary**, and execute on the existing markdown-skill + `Agent()`
   substrate that already checkpoints. (See "The substrate fork", resolved
   below.)

3. **The frozen plan is the new spine.** Today the spine is the phaseN
   ladder. For an adaptive run the spine is a **frozen `workflow-plan.md`**
   (the DAG) plus a **per-node completion ledger**. Resume traverses the plan
   + ledger instead of testing for `phaseN.md` existence.

4. **The gates are correctness properties, not authorization shortcuts.** The
   validator's structural checks (closed library, post-dominance gates, caps,
   write-set disjointness, unique sink) are **post-dominance + structural
   properties that hold over ANY topology** — they enforce the correctness
   floor for a freely-designed graph exactly as well as for a templated one.
   Authorization is a *separate* question: an in-grammar plan auto-runs unless
   it is **risky** (sensitivity or blast-radius high/uncertain → ask), and an
   out-of-grammar plan is a typed refusal. Curation was never a correctness
   mechanism — only a human-pre-vetting-of-shape shortcut — so it is not a
   load-bearing principle here. This single rule (validator-pass → risk-gate →
   auto/ask) is the governance boundary made mechanical (§5).

5. **Asymmetric failure, inherited from the fast-path work, on both axes.** A
   gate composed away is a *correctness* failure — unreviewed or unsecured code
   reaches finalize. The validator must therefore fail **closed** on
   correctness: when a structural gate property is unprovable (e.g. sensitivity
   is uncertain), it *requires* the gate. **Authorization fails closed the same
   way**: pre-execution risk is *over-approximated* (labels OR the declared
   write set touching a Phase-5 area → ask; any write-role fan-out → ask; uncertain →
   ask), and auto-run authorization is **provisional** — revoked at the barrier
   the instant a runtime re-scan upgrades risk, halting for consent. Both axes
   accept false-positive ceremony exactly as the fast path biases to full.

6. **Flexibility-first, lifecycle-anchored staging.** Front-load the hardest
   engineering — free composition **including** within-issue `tdd-guide`
   fan-out with real write concurrency — into Tier 1, alongside the
   plan/ledger/resume substrate and the inherited lifecycle frame. Freedom that
   excludes fan-out is not the capability the user asked for, so it is not
   deferred. Per-instance write isolation is **post-run diff-vs-declared-
   allowlist on the single shared worktree** (no per-node worktrees), so the
   lifecycle's worktree provisioning is inherited unchanged. Curated templates
   are a **non-binding future convenience**, not a staging prerequisite
   (§"Out of scope"). This is flexibility-first, and the honest engineering
   cost (real concurrency on day one) is named, not hidden.

## The substrate fork (resolved)

The deliverable must resolve, not dodge, **where an adaptive run executes**.

- **Branch A — compose on the existing substrate.** The agent authors the
  plan, then executes it via the normal markdown-skill + `Agent(subagent_type=, model=)`
  loop, checkpointing `workflow-state.md` + the node ledger + `.cache/`
  evidence **between** role calls — exactly the Phase 4 Per-Task Loop
  (update-state → `Agent()` → verify → validate → update-progress),
  generalized from a phase ladder to a plan DAG.

- **Branch B — literal headless Workflow runtime.** The agent emits a
  Workflow JS script (`agent()`/`pipeline()`/`parallel()`, `opts.agentType`
  dispatching Kaola roles) run headless in the background, returning once at
  the end.

**Recommendation: Branch A, decisively.** Fact 6 is the reason and it is
load-bearing: a headless run does **not** naturally checkpoint
`workflow-state.md`, write per-node artifacts, or update compliance ledgers
mid-run; on a mid-run crash `repair-state` has nothing to traverse and would
restart from Phase 1 — forfeiting invariant #1 (durable state + resume) and
#3 (compliance ledgers with evidence) on the first interruption.
`parallel()`/`pipeline()` also create concurrent writers to the single-writer
ledger.

We verified there is currently **no Workflow-tool integration anywhere** in
`scripts/`, `plugins/`, or `commands/` — so Branch B is not "wire up an
existing runtime," it is "bolt an entirely new execution substrate onto the
full parity surface" for a capability Branch A already provides.

The one genuine thing Branch B offers is that `opts.agentType` is a clean,
**machine-checkable** closed-node-library enforcement point. But that is the
*same* check a markdown plan's Role column gives a validator — the classifier
already parses markdown sections off disk. So we **adopt the grammar and the
static validator** (Branch B's real win) and **keep the plan as
`workflow-plan.md`** executed on Branch A. Branch B as a *runtime of record*
is rejected; it remains a deferred Tier-3 research note only.

> **Decisive note on "barrier-checkpointed Workflow":** the moment you add
> the per-node checkpoint barrier required to survive resume, "one headless
> run" decomposes into per-node returns — which *is* Branch A's cadence in
> Workflow's clothes. The barrier that buys durability collapses Branch B's
> only advantage. There is no version of Branch B that both keeps durability
> and stays headless.

## The fixed frame: lifecycle inheritance

The adaptive path is **not** a parallel universe; it inherits Kaola's durable
lifecycle infrastructure wholesale and only frees the **middle** of a run. The
fixed frame is:

```text
   claim ──► branch / worktree ──► [ FREE DESIGN ] ──► Phase-6 sink
   (atomic, classifier-checked)      agent composes      (close, archive,
                                     the orchestration    roadmap regen)
```

The agent designs everything between the branch cut and the sink; the harness
owns both ends and the gate floor. This is what "systematic scope" means under
the flexibility-first reframe: **lifecycle infrastructure + computed gates**,
not a curated catalog of shapes.

### Inherited as-is (no changes required)

These seven categories work **identically for `fast`, `full`, or `adaptive`**;
no modifications are required. Each is cited at its exact site so nothing is
hidden:

1. **Claim / release / startup cycle.** `claimProject` (`claim.js:386`) writes
   `workflow_path: adaptive` to state, which round-trips unchanged;
   `claimExplicitTarget` (`claim.js:430`) feeds both `cmdClaim` and
   `cmdStartup` (`claim.js:469`); `cmdRelease` needs no adaptive awareness.
2. **Worktree provisioning & status.** `provisionWorktree` (`claim.js:238`),
   `worktreePathFor` (`claim.js:126`), and `removeWorktree` (`claim.js:197`)
   are path-agnostic; `KAOLA_WORKTREE_NATIVE` gates creation uniformly for all
   paths; `cmdWorktreeStatus` reads `worktree_path` from the state artifact
   with no adaptive branch. **Fan-out write isolation is post-run diff-vs-
   declared-allowlist on this single shared worktree — no per-node worktrees —
   so even real fan-out concurrency requires no adaptive-aware provisioning
   change here.**
3. **Branch cut (Phase 1 Step 6).** `kaola-workflow-phase1.md` Step 6 (lines
   272–339) is post-claim, pre-implementation and works for any
   `workflow_path`; the `patch-branch` TBD → resolved backfill is the same
   mechanism for adaptive projects.
4. **Worktree finalization.** `cmdWorktreeFinalize` copies
   `kaola-workflow/{project}/` from main into the worktree before the
   finalization commit; `removeWorktree` (`claim.js:197`) is project-agnostic —
   no adaptive awareness needed.
5. **Phase-6 sink (merge or PR).** `kaola-workflow-sink-merge.js` and
   `kaola-workflow-sink-pr.js` read issue/project/branch from args and
   execute merge/force-push or PR creation independent of `workflow_path`;
   `buildClosureReceipt` (`claim.js:1056`) and `archiveProjectDir`
   (`claim.js:522`) are unaware of workflow type.
6. **Close issue & roadmap regen.** `gh issue close` (in `sink-merge.js`) and
   `regenerateRoadmap` (called from `claim.js:565`) are state-agnostic; archive
   to `.../archive/` and roadmap source removal happen identically.
7. **The 9 subagent roles & `resolve-agent-model.js`.** Explicitly out of
   scope (invariant #2): unchanged, canonical, used uniformly across all
   workflow paths.

**These work identically for fast, full, or adaptive; no modifications
required.**

### Needs adaptive-aware touch (small, surgical edits)

These six categories are the **only** places the lifecycle frame must learn
about `adaptive`. Each is a small additive edit mirroring an existing
precedent — **no architectural rework**:

1. **`repair-state.js` — router / resume entry point.** Add
   `isAdaptiveWorkflowState(content)` (keyed on `workflow_path: adaptive`,
   symmetric to `isFastWorkflowState` at `repair-state.js:90`),
   `projectHasAdaptivePlan(projectDir)`, and `routeAdaptive(...)` placed
   **ahead of** the numbered phaseN ladder (parallel to `routeFast` at
   `repair-state.js:408`). The phaseN ladder must not run for an adaptive
   project; the frozen plan + ledger are the new source of truth. A
   consent-halted plan (`escalated_to_full: consent`) is surfaced for approval,
   not blindly re-dispatched.
2. **`claim.js` — two resume surfaces (toggle-agnostic).**
   `writeState` next_command default (`claim.js:287`) currently emits
   `isFast ? /kaola-workflow-fast : /kaola-workflow-phase1`; add the
   `adaptive` case emitting `/kaola-workflow-plan-run {project}`.
   `resumeFallbackCommand` (`claim.js:496-503`, regex at `claim.js:500` matches
   only `fast`) must likewise recognize `adaptive` and emit
   `/kaola-workflow-plan-run {project}`, never `/kaola-workflow-phase{N}`. Both
   ignore the ON/OFF switch — an already-frozen plan must finish.
3. **`classifier.js` — write-set export + intra-issue disjointness.** Add
   `module.exports` (currently absent), exposing `extractFilePaths()`, the
   area-bucketing helpers, and the `SHARED_INFRA` constant
   (`classifier.js:215`); add `readPlanNodes()` (reads the `## Nodes` table
   from a `workflow-plan.md`) and `disjointWriteSets(nodeWriteSets[])` (the
   N-way pairwise verdict — exact-path-RED / coarse-area-RED /
   `SHARED_INFRA`-yellow — applied **within** the issue). An adaptive project
   is **not** an empty write set to other projects' cross-issue checks.
4. **Phase 6 prerequisite check.** `commands/kaola-workflow-phase6.md`
   Prerequisite section (lines 12–25): add a third case for
   `workflow_path: adaptive` — read `workflow-plan.md` + `## Node Ledger`,
   verify the plan is frozen (hash match) and every node is `complete` or
   `n/a`; on corruption or an incomplete ledger, emit a **typed refusal**
   rather than proceed. Adaptive runs skip phaseN artifacts, so Phase 6 anchors
   on the plan's completion state.
5. **Parallel/overlap classifier — runtime call site.** In the existing
   `scanClaimedOverlap()`, after classifying active folders' write sets, also
   read any active folder's `workflow-plan.md`, parse its `## Nodes`, and
   include those declared write sets in the intra-fold pairwise checks. A
   adaptive project's footprint is unknown until the plan is frozen.
6. **`claim.js` — toggle guard (selection-only, one site).** `claimProject`
   (`claim.js:422`) is the single shared guard covering both `cmdClaim` and
   `cmdStartup`: if the switch is OFF and `workflowPath === 'adaptive'`, emit a
   **typed refusal** (#44) — never a silent downgrade to `full`. Whitelist:
   `{fast, full}` when OFF, `{fast, full, adaptive}` when ON.

**These are small, surgical edits; no architectural rework.**

### Consequence: the Phase-6 sink stays unchanged

The sink machinery (`sink-merge.js`, `sink-pr.js`, `archiveProjectDir`,
closure-receipt, roadmap regen) **does not name `workflow_path`**. It reads
branch/issue/project from args, merges or creates a PR, archives the folder,
closes the issue, and regenerates the roadmap — identically for fast, full, or
adaptive. **The only place Phase 6 touches `workflow_path` is the prerequisite
check** (adaptive projects have no `phase5-review.md`, so the check routes on
`workflow_path: adaptive` → plan + ledger instead).

### Parity risk (unguarded manual port on the renamed forks)

The edits to `repair-state.js`, `claim.js` (both resume surfaces + toggle
guard), and `classifier.js` (`module.exports` + `disjointWriteSets`) are
byte-synced only between `scripts/kaola-workflow-*.js` (Claude) and
`plugins/kaola-workflow/scripts/kaola-workflow-*.js` (Codex). **GitLab and Gitea
are renamed forks** (`kaola-gitlab-*`, `kaola-gitea-*`), **not byte-synced** — a
**structural/region check** (a shared schema constant or a region-marker
assertion) is required to catch drift, or the adaptive path ships correct on
Claude/Codex and silently broken on GitLab/Gitea (lines 772–774, 829).

## The design

A third path, `KAOLA_PATH=adaptive`, sits alongside `fast` and `full`. Fast
and full remain as their existing literal command files (backward
compatible); `adaptive` is the general case.

### 1. The plan grammar (the closed envelope)

An adaptive run is defined by a frozen **`workflow-plan.md`** containing a
machine-readable `## Nodes` section. Each node is:

```
{ id, role, depends_on[], declared_write_set, cardinality, shape }
```

- **`role`** must be in the **installed library** — initially the nine canonical roles
  (`code-explorer`, `docs-lookup`, `planner`, `code-architect`, `tdd-guide`,
  `build-error-resolver`, `code-reviewer`, `security-reviewer`,
  `doc-updater`), plus any maintainer-installed roles — the set `resolve-agent-model.js` authorizes. The validator
  hard-rejects any role not in the installed library. **The author may never set a model**; the
  model comes only from `resolve-agent-model`.
- **Allowed shapes are exactly three** grammar productions, nothing else:
  - **SEQUENCE** — `depends_on` chains.
  - **FAN-OUT** — N instances of one role over **pairwise-disjoint** declared
    write sets, N ≤ `FANOUT_CAP`.
  - **BOUNDED LOOP** — one role re-invoked sequentially up to a static cap
    (review-fix / test cycle). Loops do **not** fan out.
- **Mandatory grammar invariant: a single unique `finalize` sink.** Every
  node reaches exactly one terminal node. This is what makes the gate checks
  (below) decidable.

**Free (the flexibility):** how many `code-explorer`/`docs-lookup` nodes,
whether to fan out `tdd-guide` over disjoint sub-areas, where to insert extra
`code-reviewer` verification passes, the DAG branching and ordering, which
roles to include for *this* task.

**Fixed (the harness):** the role alphabet, the model resolution, the three
shapes, the unique sink, the gate set, the caps.

### 2. Non-removable gates (post-dominance, not reachability)

This is the most important correction over a naive design. A gate must be
**impossible to route around**, not merely "present somewhere downstream."

Reachability ("a `code-reviewer` node is a transitive successor of every
`tdd-guide`") is **composable-away**: a plan
`tdd-guide → code-reviewer` *plus* `tdd-guide → doc-updater → finalize`
passes a reachability check while shipping unreviewed code down the
`doc-updater` branch to the sink. The validator must instead compute
**post-dominance over the unique sink**:

- **G1 — review-above-trivial.** Reject any plan where some path from a
  `tdd-guide` (implement) node to the sink does **not** traverse a
  `code-reviewer` node — i.e. `code-reviewer` must **post-dominate** every
  implement node. (Exemption: a plan the validator classifies *trivial* by
  the fast-path rubric — single docs/markdown edit — may skip it, identical
  to today's self-review carve-out.)
- **G2 — security-when-sensitive.** If the run is sensitive, a
  `security-reviewer` node must **post-dominate** every sensitive node.
  Sensitivity is **not** an author flag and **not** a static path regex; it
  is re-derived by the harness from two signals: (a) the **frozen issue
  labels** (a `security`/`auth` label, captured into `workflow-plan.md` as a
  non-author field at design time, or fetched by the validator), and (b) a
  **semantic re-scan of actual touched files** recorded in `.cache/`,
  applying Phase 5's exact categories — auth, payments, **user data**,
  **filesystem access**, **external API calls**, secrets (`phase5.md:45-46`,
  `:214`). Because file contents are only known at run time, G2 is enforced
  at **two** points: statically at freeze (label + declared write set) and at
  the barrier (semantic scan of what was actually written). If a sensitive
  write occurs with no post-dominating `security-reviewer`, the barrier
  halts and writes `escalated_to_full: security`. **Fail closed** when the
  label fetch or scan is unavailable.
- **G3 — TDD RED→GREEN.** Every `tdd-guide` node inherits the Phase 4 Step 2
  gate verbatim: its ledger row cannot transition to `complete` without both
  red and green evidence paths, or an explicit `N/A` skip reason.
- **G4 — no-inline-implementation-fixes.** The grammar has **no**
  "main-session-implements" node type. Implementation edges terminate only at
  `tdd-guide` or `build-error-resolver`. The Trivial Inline Edit Exception is
  carried over verbatim and bounded identically.
- **G5 — compliance ledger with evidence.** Every executable node emits
  exactly one `## Required Agent Compliance` row.

> **Verified schema rule that makes G5 actually enforce.** Because
> `DELEGATION_CONTROLLED_REQUIREMENTS` anchors `/^code-reviewer$/i` and
> `/^security-reviewer$/i` **exactly**, gate compliance rows for those two
> roles **must use the bare role string** (`code-reviewer`,
> `security-reviewer`) — node-id disambiguation goes in the Evidence column,
> never the Requirement key. Otherwise `delegationPolicyCompliance()`
> silently skips them and the delegate-vs-local-fallback discipline is lost
> on the two safety-critical gates. The validator asserts gate rows obey this
> rule. (Other roles whose patterns are loose — `tdd-guide`, `executor` — may
> carry per-instance keys like `tdd-guide executor task 3`, as the archived
> Phase 4 artifacts already do.)

### 3. Agent freedom + validator gates (the Tier-1 flexibility)

The agent's flexibility is **free authorship of any valid in-grammar DAG** —
no template selection, no knob-binding ceremony, no pre-curated shape library
on the critical path. The agent writes the `## Nodes` table directly for *this*
task: which roles, how many, in what shape (sequence / fan-out / bounded loop),
with what dependencies and declared write sets. This is the maximum-design-
flexibility thesis: the agent designs how the workflow is carried out, and the
validator proves the result is in-grammar.

**The grammar floor (fixed, the harness):**

- **Runtime-closed role library** — every node's `role` must be in the
  installed library (§1, initially the nine canonical roles, maintainer-extensible);
  any role not in the installed library is a hard reject.
- **Exactly three shapes** — SEQUENCE, FAN-OUT (N ≤ `FANOUT_CAP` over
  pairwise-disjoint declared write sets), BOUNDED LOOP (static cap; loops do
  **not** fan out).
- **A single unique `finalize` sink** — what makes the gate checks
  decidable.
- **The computed gates (§2)** — `code-reviewer` post-dominates every
  implement node (non-trivial); `security-reviewer` post-dominates every
  sensitive node; TDD RED→GREEN; no inline implementation; compliance ledger
  with evidence. These are **post-dominance + structural properties the
  validator computes over the topology** — they hold over *any* shape, so they
  are not a function of how the plan was authored.
- **The caps (§4)** — `FANOUT_CAP` (default 4), `test_thrash` ≥ 3, file
  overflow declared+1 / absolute 6, the loop bounds.

The agent composes **freely within** this floor. Because every gate is computed
from topology and every cap is asserted statically, **every legal DAG is
provably ≥ the gate floor and ≤ the caps** — strictly safer-or-equal to the
baseline, regardless of how the agent shaped it. There is no knob that turns a
gate off because there is no gate flag to turn off: a gate is a wall the
validator finds in the graph, not a node setting.

`fast` and `full` are **expressible** as two degenerate DAGs in this grammar
(their existing command files stay as the literal executors for backward
compatibility). This is a **backward-compatibility proof** that the design
*generalizes* the harness rather than bolting beside it — not a template
library to curate. No "select template + bind knobs" step exists on the load-
bearing path; the agent authors the DAG, and authorization is decided by
risk-assessment (§5), not by whether a human pre-vetted the shape.

### 4. Caps and intra-issue write-set disjointness

- **Fan-out width** ≤ `FANOUT_CAP` (default 4, env `KAOLA_FANOUT_CAP`). For
  **write-role fan-out**, additionally ≤ the number of declared disjoint groups —
  you cannot fan wider than you have disjoint write sets. **Read-only fan-out
  carve-out:** empty / role-namespaced write sets are trivially disjoint by
  construction; read-only fan-out width is bounded by `FANOUT_CAP` alone,
  `disjointWriteSets()` returns PASS on empty declarations, and no per-node
  worktrees are needed.
- **Loops** inherit verbatim: `test_thrash` ≥ 3 (`fast.md:64`), review-fix
  bound, file overflow declared+1 / absolute 6 (`fast.md:63`), applied
  per-node. `test_thrash` is a **runtime-observed** counter — the validator
  asserts only the *static* caps; the barrier enforces `test_thrash` by
  counting consecutive same-test RED→RED cycles and writing
  `escalated_to_full: test_thrash`.
- **Intra-issue disjointness (invariant #4) is NEW code, not reuse.** As
  verified, `scanClaimedOverlap` is candidate-vs-active-folders and exports
  nothing. The design requires:
  1. Add `module.exports` to `kaola-workflow-classifier.js` exposing the
     pure path/area helpers (`extractFilePaths`, area-bucketing,
     `SHARED_INFRA` membership).
  2. A **new pairwise helper** `disjointWriteSets(nodeWriteSets[])` that takes
     the N in-memory sibling declared write sets and returns the same
     exact-path-RED / coarse-area-RED / `SHARED_INFRA`-yellow verdicts the
     cross-folder scanner produces — applied **within** the issue.
  3. **Runtime, not just declared, enforcement.** The file-overflow backstop
     exists precisely because runtime write sets exceed declarations. So a
     fan-out node that touches a file outside its declared set **or**
     intersecting a live sibling's set **fails at the barrier**. Declared
     disjointness is necessary but not sufficient; per-instance write
     isolation is **post-run diff-vs-declared-allowlist** (each instance's
     actual writes are diffed against its declared allowlist on the single
     shared worktree — no per-node worktrees, so the lifecycle's worktree
     provisioning is inherited unchanged), and it is the **gating
     precondition** for fan-out, not an aside. A `SHARED_INFRA` fan-out yields
     yellow → serialized, never parallel.

### 5. Governance boundary (resolved: auto-run on validator-pass, ask if risky)

A freely-designed plan that **passes the validator** executes
**autonomously** — but only when it is provably low-risk. It **auto-surfaces
for the user's approval** (ExitPlanMode-style) **whenever the plan is risky**.
Out-of-grammar plans get a **typed refusal** (#44), never a silent fix.
Provenance ("curated vs novel") plays no role — every in-grammar plan is judged
the same way, because the gates are correctness properties that hold over any
topology and were never an authorization mechanism.

| Plan class | Validation | Risk assessment (over-approximated, fail-closed) | Authorization |
|---|---|---|---|
| **In-grammar** (any provenance) | closed library + post-dominance gates + caps + write-set disjointness + unique sink | **Sensitivity** — risky if frozen labels OR the *declared* write set touch a Phase-5 category (auth / payments / user data / filesystem / external-API / secrets), or sensitivity is undetermined. **Blast-radius** — risky on **any WRITE-ROLE fan-out (N ≥ 2)** (read-only verification/research fan-out is exempt — zero blast radius, bounded by `FANOUT_CAP` alone), a `SHARED_INFRA` touch, a declared write set over the file ceiling, or a bounded loop present. | **Low-risk → auto-run** (PROVISIONAL — revoked at the barrier on a runtime risk upgrade). **High or UNCERTAIN risk → ask** (surface DAG + validator report + risk findings; explicit yes/no; then freeze). |
| **Out of grammar** (unknown role, gate routed around, cap exceeded, non-disjoint fan-out) | — | — | **Typed refusal (#44).** Never silently clamp; stop and surface. |

So the **auto-run envelope is narrow and provable at freeze**: sequential,
single-instance, declared write set provably outside every Phase-5 area, no
`SHARED_INFRA` touch, under the file ceiling, no loop. Everything else asks.

**The key safety insight, stated explicitly.** The correctness gates
(review post-dominance, security-on-sensitivity, TDD RED→GREEN, no-inline,
caps, disjointness) are **post-dominance + structural properties** that hold
over **any** topology. The validator enforces them for freely-designed graphs
*exactly* as well as for templated ones. **Templates were never a correctness
mechanism — only a human-pre-vetting-of-*shape* shortcut for authorization.**
Dropping the curated path therefore costs **nothing on correctness**; it only
changes the authorization story from "human-vetted-template → auto" to
"risk-assessment-on-any-topology → auto-or-ask."

**Why the sensitivity gate fails closed at TWO points (the timing hole,
named).** The strongest sensitivity signal is a `.cache` **semantic re-scan of
the files actually touched** — which does not exist until run time. A plan that
is benign-by-declaration but sensitive-in-fact must therefore not be allowed to
auto-run risky writes to consent silently. Two defenses, matching G2's two
enforcement points (§2):

- **(a) Pre-execution over-approximation.** The freeze-time check uses labels +
  the **declared** write set and **over-approximates**: if either touches any
  Phase-5-adjacent area, or sensitivity is undetermined, the plan is risky →
  **ask before freeze**. (This closes the "confident false-negative" by
  widening the trigger, not by relying on fail-closed-on-uncertain alone.)
- **(b) Runtime provisional authorization.** Auto-run authorization is
  **provisional**. The instant the barrier's `.cache` re-scan upgrades
  sensitivity (or detects overflow into a sensitive / `SHARED_INFRA` area) on a
  plan that auto-ran, the authorization was granted on a now-false premise and
  is **revoked → HALT FOR CONSENT** — *in addition to* G2 forcing
  `security-reviewer` post-dominance. At that one barrier moment, **two things
  co-occur**: the *correctness* escalation (§2: write `escalated_to_full:
  security`, force the reviewer onto every remaining path) **and** the
  *authorization* halt (§5: `escalated_to_full: consent`, stop for the user's
  explicit yes before any further writes). They are one moment with two
  consequences, not two contradictory halts.

**Defining "risky" concretely, and failing closed.** Two markers, both
re-derived by the harness (never author flags):

- **Sensitivity** — the same G2 signal: the plan touches a Phase-5 category
  (auth, payments, **user data**, **filesystem access**, **external API
  calls**, secrets). Derived from (a) frozen issue labels, (b) the declared
  write set (over-approximated pre-execution), and (c) a `.cache` semantic
  re-scan of actual touched files at the barrier
  (`phase5.md:45-46`, `:214`).
- **Blast-radius** — **any WRITE-ROLE fan-out (N ≥ 2)** (concurrent writers are the
  highest-blast-radius case — the entire disjointness/isolation machinery
  exists *because* of that, so write-role fan-out is presence-based-risky (read-only fan-out is zero-blast-radius and NOT risky), symmetric with
  the loop-presence rule), a touch of `SHARED_INFRA` (`scripts` / `hooks` /
  `plugins/kaola-workflow/scripts`, `classifier.js:215`), a declared write set
  over the file ceiling, or a bounded loop present.

**Fail closed.** If sensitivity or blast-radius cannot be determined, treat the
plan as risky and **ask** — the same asymmetric-failure bias the fast path uses
when it defaults to full (Principle 5).

**We explicitly reject a blanket auto-approval bypass for any plan.** A
script-level env bypass of approval for a materially-user-owned, *risky* choice
contradicts #44 ("scripts validate, never auto-pick"). A future opt-in for a
narrower low-risk subset (e.g. sensitivity=none + blast-radius=small) is
*permissible* but out-of-scope here; it would never auto-approve a risky plan.

### 6. Resume / repair-state (first-class)

This is load-bearing; hand-waving it = the design fails. The fixed phaseN
ladder is replaced, for adaptive runs only, by **traversal of a frozen plan +
ledger**.

**New durable source of truth:**

1. **`workflow-plan.md`** — the frozen DAG, author-immutable after
   validator-pass.
2. **`## Node Ledger`** — a single authoritative table inside the plan
   artifact: `| node-id | role | status | depends_on | write_set | evidence |`
   with `status ∈ {pending, in_progress, complete, n/a}`. **One writer, one
   source** (resolves Fact 1's "dispersed ledger" risk). This is the dynamic
   analogue of the Phase 4 `## Tasks` table.
3. **`plan_hash`** — a content hash that detects tampering. **It lives
   *inside* `workflow-plan.md`** (or a durable sidecar that survives
   `workflow-state.md` loss), **not** in `workflow-state.md` — because
   `repair-state` runs precisely when `workflow-state.md` is missing or
   stale, so a hash stored there is gone exactly when it is needed. The
   **script** (validator/claim), never the agent, computes and writes it, and
   re-checks it on every load. This makes "frozen" enforced, not honor-system
   (#44 atomicity).

**Router / repair-state changes (additive, mirroring the fast precedent):**

- `isAdaptiveWorkflowState(content)` — keyed on `workflow_path: adaptive`,
  symmetric to `isFastWorkflowState` (`repair-state.js:90`), checked at the
  **top** of `stateLooksValid` / `projectHasActiveState`.
- `projectHasAdaptivePlan(projectDir)` — added to active-project discovery,
  parallel to the fast-summary discovery.
- `routeAdaptive(root, workflowDir, project)` — a new branch in
  `reconstruct()` placed **ahead of** the numbered phaseN ladder (parallel to
  `routeFast` at `repair-state.js:408`). If `workflow-plan.md` exists, the
  phaseN file-existence tree is **not used at all**. Its emitted
  `next_command` points at the adaptive executor skill
  (`kaola-workflow-plan-run`).

**Resume entry-point algorithm** (replaces the binary file-existence branch):

1. Load `workflow-plan.md`; re-check `plan_hash`.
2. **Re-validate only closed-library membership + structural grammar + hash
   integrity — NOT the full gate rubric.** Re-running the full gate rubric
   would *brick* an in-flight, already-frozen plan if the rubric tightened
   after freeze. Structure and library membership are stable; gate adequacy
   was proven at freeze.
3. Parse the Node Ledger.
4. **Ready nodes** = every node whose `status != complete` and all of whose
   `depends_on` are `complete` **with resolved compliance**
   (`unresolvedCompliance()` applied per upstream node). This is the
   topological "next-unblocked" set replacing the sequential ladder.
5. Refine the intra-node step exactly as Phase 4 does today, via
   `.cache/{node-id}.md` presence
   (`delegate-node` / `verify` / `validate` / `route-failure` /
   `update-ledger`).
6. **DAG "boundary" definition** (Fact 1's open risk, resolved): a node's
   incoming boundary is crossable iff **all incoming edges are complete AND no
   upstream compliance row is unresolved**. This is the dynamic analogue of
   today's phase-boundary block.

**Consent-halt is durable and surfaces on resume.** When the barrier revokes a
provisional auto-run authorization (§5b: `escalated_to_full: consent`), it
writes that marker durably (analogous to `escalated_to_full: security`), so
`routeAdaptive` **surfaces the pending approval** rather than blindly
re-dispatching the `in_progress` node. Resume of a consent-halted plan is an
ask, not a silent continuation.

**Barrier commit order (atomicity).** Multi-file FS writes are not OS-atomic.
The barrier writes in a defined order so any crash is recoverable: **`.cache`
evidence first → Node Ledger row second → `workflow-state.md` pointer LAST**
as the commit point. A crash mid-node therefore leaves the node observed as
`in_progress` with absent/partial `.cache` — and `repair-state` re-dispatches
exactly that node, mirroring `phase4.md`'s `in_progress → delegate`.

**Corrupt / missing plan → typed refusal, no auto-pick.** `routeAdaptive()`
returns a typed reason (`workflow-plan.md unparseable`) and stops for user
repair, rather than silently falling back to the phaseN ladder (#44).

**The one honest loss from dropping templates (named, not hidden).** On a
corrupt *ledger* only (plan intact), a deterministic
`(template, knobs) → nodes` re-expansion could once reconstruct the expected
node set and flag the divergence. Free composition forgoes that one tool: with
no template to re-expand, that specific ledger-corruption repair is foregone.
This is a **minor robustness loss**, and it is acceptable because — and only
because:

- (a) the **frozen plan + `plan_hash`** still anchor STRUCTURE: tampering is
  detected, and the expected node *set* is read straight off the frozen plan,
  not re-derived from a template;
- (b) the **per-node `.cache`** is the source of run truth, so `repair-state`
  rebuilds PROGRESS by re-scanning `.cache` evidence regardless of ledger
  state; and
- (c) a truly corrupt ledger with an intact plan is **rare** (one writer, one
  source, defined barrier commit order).

The trade is deliberate: maximum design flexibility costs one minor robustness
tool for ledger corruption. We name it rather than hide it.

**Backward compatibility.** Archived/active projects with no
`workflow-plan.md` never enter `routeAdaptive` — `isAdaptiveWorkflowState`
returns false, the fast/full reconstruction is untouched.

### 7. Conflict-of-record rule

If `workflow-plan.md` and the Node Ledger ever disagree: the **plan is
structure-of-record** (the frozen DAG, guarded by `plan_hash`); the **ledger
is progress-of-record**. A stale ledger row referencing a node absent from
the plan is discarded.

### 8. Install-time switch — enabling or disabling the adaptive path

Some users do not want an agent designing its own topology, however well fenced. The adaptive path is therefore **opt-in at install time**, gated by a single switch that, when off, makes the system behave **exactly as today** — only `fast` and `full` exist and the agent never proposes `adaptive`.

**Flag + default — `--enable-adaptive`, default `no` (OFF).**

```
./install.sh --forge=github                       # adaptive OFF (today's behavior, unchanged)
./install.sh --forge=github --enable-adaptive=yes # adaptive available; agent may propose it
```

The default is **OFF**, because the user-facing reason is decisive: *some users do not want this freedom*, so the protected (today's) behavior must be what you get without asking. Three structural arguments make OFF the *clean* engineering default, not merely the cautious one:

- **Absent reads as OFF.** A fresh or pre-existing `config.json` with no `enable_adaptive` key resolves to disabled — "behaves exactly as today" falls straight out of the absence, no migration needed.
- **Upgrade/reinstall never silently grants the freedom.** Default-ON would mean a routine `git pull && ./install.sh` could silently switch on agent-designed topology for a repo whose owner never asked. Default-OFF requires the explicit, recorded `--enable-adaptive=yes` — the harness-first, #44 instinct.
- **Drift-safe on the renamed forks.** A GitLab/Gitea fork that has not yet ported the adaptive machinery reads absent → OFF → safe. Default-ON would have such a fork *believe* adaptive is enabled while none of the substrate exists.

> **Reconciliation with "adaptive is the general case."** §"The design" calls `adaptive` the architectural general case (fast/full are degenerate DAGs in one grammar). That is a statement about the *grammar*, not the *install default*. Granting the agent topology freedom is opt-in: architecturally general, operationally gated. The two are not in tension.

**Storage — one shared global config field.** The switch lives in the existing global store `~/.config/kaola-workflow/config.json` (the same file that already holds `parallel_mode`), as a boolean `enable_adaptive`:

```json
{ "parallel_mode": "auto", "enable_adaptive": true }
```

**This is a single shared field across all 4 trees.** Verified: `scripts/kaola-workflow-classifier.js`, `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js`, and `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js` all resolve `CONFIG_PATH` to the **identical** `~/.config/kaola-workflow/config.json` (no `-gitlab`/`-gitea` namespace). There is exactly one toggle, not one per forge.

**install.sh gains a config-write step (new behavior).** Verified: install.sh today writes *no* config — it only renders templates and installs files. The switch adds the only place install.sh touches `config.json`: a small **read-modify-write** merge that, **only** when `--enable-adaptive=yes` is passed, sets `enable_adaptive: true` while preserving `parallel_mode`. The default path writes nothing → field stays absent → OFF. install.sh is a single file selected by `--forge`, so this is **one edit, not four**.

**Runtime read path — both surfaces, all four trees.** The switch must be legible to Node scripts *and* to markdown skills, which cannot call `require()`:

| Reader | How it learns the switch |
|---|---|
| **Node scripts** (`claim.js`) | The on-test is the strict `config.enable_adaptive === true` (truthy-only). **Absent FIELD → falsy → OFF**, with no reliance on the defaults object. |
| **Markdown skills** (`workflow-next.md` Step 0a-1 + 3 forge mirrors) | A skill cannot read the JSON natively, so the switch reaches prose through the env mirror **`KAOLA_ENABLE_ADAPTIVE`** (`1`/`0`). Step 0b's startup transaction echoes the resolved value into the environment; precedence is **env `KAOLA_ENABLE_ADAPTIVE` > config `enable_adaptive` > default OFF**. When unset/`0`, the router's Step 0a-1 never lists `adaptive` as a candidate. |

> **On the defaults object.** `readOrCreateConfig` returns the parsed JSON **as-is** when the file exists, and only writes/returns its defaults when the file is **absent**. So for every existing user (file present, no `enable_adaptive` key) the defaults object is never consulted — the OFF guarantee rests **solely** on the strict `=== true` on-test, never on `!== false`, and never on the defaults edit. Adding `enable_adaptive: false` to the defaults object is a **freshly-created-file cosmetic** only; it does not provide the OFF default for existing configs.

The env mirror also gives testing an explicit handle (`KAOLA_ENABLE_ADAPTIVE=1` for walkthrough cases) without writing the global config.

**The toggle gates SELECTION, never RESUME — read in exactly two logical sites.**

- **Router prose (Step 0a-1, ×4 forges):** when OFF, the agent does not *propose* `adaptive`; the menu is fast/full, identical to today.
- **`claim.js` `claimProject` (the single shared unvalidated write, `claim.js:422`):** refuses a **new** `workflow_path: adaptive` claim when OFF, with a **typed refusal** (#44) — never a silent downgrade to `full`. Because **both** `cmdClaim → claimProject` and `cmdStartup → claimExplicitTarget → claimProject` flow through this one site, the guard placed here covers `kaola-workflow-claim.js claim --workflowPath adaptive` *and* the startup path. The guard **whitelists** the persisted value: `{fast, full}` when OFF, `{fast, full, adaptive}` when ON — closing the latent "any workflow_path string is accepted unvalidated" gap. Explicit `KAOLA_PATH=adaptive` under an OFF install is a typed refusal here, not a quiet rewrite.

Deliberately **toggle-agnostic** (this directly answers "how do repair-state / the validator learn the switch": *they do not, by design*):

- **`repair-state.js` / `routeAdaptive`** must resume an already-frozen plan regardless of the switch (see edge case below).
- **`kaola-workflow-plan-validator.js`** judges whether a plan is *well-formed*; well-formedness is independent of whether new adaptive runs are currently offerable.
- **The parallel/overlap classifier verdict** is *not* a gate site. That classifier emits the green/yellow/red "Parallel decision," not the path — gating the path there is a category error. Its only involvement is carrying the `enable_adaptive` field in `readOrCreateConfig`.

Keeping the read surface to two sites is also the **smallest cross-fork footprint**, which is this design's top stated risk.

**OFF behavior (precise).** With the switch off: Step 0a-1 is the exact 2-way fast/full decision in use today; `claimProject` accepts only `fast`/`full`; no `adaptive` artifacts are ever authored; `workflow_path` only ever takes `fast`/`full`. The system is byte-for-byte today's behavior — the adaptive machinery is dormant code, not an active path.

**Edge case — toggle flipped OFF while an adaptive project is in flight: finish-in-flight, refuse-new.** This is forced by the same principle that governs resume (§6): re-running availability checks on an already-frozen plan would **brick** legitimate in-flight work. So:

- An already-claimed adaptive project (a frozen `workflow-plan.md` exists) **always resumes to completion**, even after the switch flips OFF. `isAdaptiveWorkflowState` / `routeAdaptive` ignore the switch entirely.
- **The two resume surfaces inside `claim.js` must also be taught `adaptive`, toggle-agnostically** — this is the non-obvious part the parity delta makes explicit. Today both branch fast-vs-everything-else and would misroute an adaptive project into the phaseN ladder, orphaning the frozen plan:
  - `writeState` next_command default (`claim.js:287`) emits `isFast ? /kaola-workflow-fast : /kaola-workflow-phase1`. It must recognize `workflow_path: adaptive` and emit the adaptive executor `/kaola-workflow-plan-run {project}`.
  - `resumeFallbackCommand` (`claim.js:496`, regex `claim.js:500` matches **only** `fast`) feeds `cmdResume` (`claim.js:505`). It must likewise recognize `adaptive` and emit `/kaola-workflow-plan-run {project}`, not `/kaola-workflow-phase{N}`.
  - Both edits are **toggle-agnostic** (resume ignores the switch, like `routeAdaptive`). Note `writeState` already round-trips the literal `adaptive` string at `claim.js:284`, so state is never corrupted — the only brick is the *emitted next_command*, which these two edits fix.
- The switch only blocks **new** `adaptive` *selection/claim*. The in-flight selection already happened legitimately while ON; finishing it is not auto-picking (#44), it is honoring durable state + resume (#1).

This cleanly resolves the apparent contradiction in the legwork ("check only in classifier" vs "also check in repair-state and claim"): gating *resume* would brick in-flight projects, so the switch check lives in **selection** (router + `claimProject`), never in **resume** (`repair-state` + the two `claim.js` resume surfaces) or **well-formedness** (validator).

**Reinstall / upgrade behavior.** Because the state lives in `config.json`, not in a rendered template, **toggling never requires a re-render**: flip the switch by re-running install with the other flag, hand-edit `config.json`, or set `KAOLA_ENABLE_ADAPTIVE` for one session. A reinstall that omits `--enable-adaptive=yes` does **not** clobber an existing `enable_adaptive: true` (the merge is read-modify-write — it only *adds* on `=yes`, never deletes on absence), so an upgrade never silently revokes a switch a user deliberately set. Conversely, a user who never opted in stays OFF across every upgrade.

**Precedence (toggle first):**

```text
  KAOLA_ENABLE_ADAPTIVE env  >  config.json enable_adaptive  >  default OFF
           │                            │                          │
           ▼                            ▼                          ▼
        1 / 0                  (=== true) true / false       (absent ⇒ OFF)
           └─────────────► resolved switch ◄────────────────────────┘
                                  │
                  OFF ────────────┴──────────── ON
            fast / full only           fast / full / adaptive
          (exactly today's 2-way)       (agent may propose adaptive)
```

## Borrowed orchestration patterns: the agent's composable toolkit

The three shapes (SEQUENCE, FAN-OUT, BOUNDED LOOP) are a *grammar*, not a menu of phases. The interesting question is what an agent can **build** out of them. Surveying the field's verification/orchestration patterns against this grammar produces a useful catalogue — and one enabling insight that makes the quality patterns cheap.

**The enabling insight — read-only fan-out is contention-free.** Six of the nine roles are **read-only**: `code-explorer`, `docs-lookup`, `planner`, `code-architect`, `code-reviewer`, and `security-reviewer` (the last review-only *by governance posture*, not by tool manifest — see below). Their tool lists exclude `Write`/`Edit`; they emit only role-namespaced `.cache` evidence and touch **zero** repo files. So N instances of a read-only role over the *same* target have empty, identical, non-overlapping write sets — there is nothing to contend for. The expensive precondition that gates write-role fan-out — pairwise-disjoint declared write sets + per-instance worktree isolation + the runtime diff-vs-allowlist backstop (§4) — is **unnecessary for read-only fan-out**, because the property it enforces (no two siblings touch the same file) is satisfied by construction. Only **write-role** fan-out (`tdd-guide` over `api/`/`cli/`/`ui/`) needs `disjointWriteSets()`. This is what makes the verification and research patterns below *cheap and safe*: they are embarrassingly parallel at the topology level (logically — see the substrate honesty caveat).

> **Honest grammar caveat.** "Contention-free" is a property of the *roles*, not yet a property the *validator* grants. The fan-out cap rule (§4) clamps width to "≤ the number of declared disjoint groups," which pins N read-only nodes (empty/identical write sets) at **1** and makes read-only fan-out inexpressible; `disjointWriteSets()` on empty sets is *undefined*, not vacuously true. Legalising read-only fan-out therefore needs **one small cap-rule refinement** — a read-only carve-out (below), *not* a fourth grammar shape. At the shape level, everything stays inside {sequence, fan-out, bounded-loop}.

### The catalogue

| Pattern | Adopt / Adapt / Reject | How the agent composes it (roles + shape) | Already expressible? / new primitive | Harness note |
|---|---|---|---|---|
| **adversarial-verify** | **Adopt** (user-mandated) | Read-only FAN-OUT of N `adversarial-verifier` skeptics (`code-reviewer` as fallback when not installed; or `security-reviewer`, review-only) over **one** ledger claim, each prompted to REFUTE → orchestrator quorum/decision → accept/kill | **No.** Needs (a) read-only fan-out carve-out + (b) the **quorum/decision** step | Add-only above the gate floor; cannot raise the risky trigger. When the `code-reviewer` fallback is used, its N skeptic rows must use the **bare** `code-reviewer` key (G5) |
| **perspective-diverse-verify** | **Adopt** | Distinct review *roles* as separate SEQUENCE-family branches (`code-reviewer` + conditional `security-reviewer` + repro) each `depends_on` the target, converging on the post-dominating sink; OR-of-lenses (not a vote) | **Yes**, as DAG branching — *not* a heterogeneous fan-out (fan-out is one role) | This is Phase 5 (always-review + conditional-security + re-review) generalised |
| **multi-modal-sweep** | **Adopt** | Read-only FAN-OUT of `code-explorer` (`docs-lookup` for libraries), one instance per discovery *modality* (container / content / entity / time), each blind, → SEQUENCE merge by `planner` → sink | **No.** Needs the read-only fan-out carve-out (+ per-instance `.cache`/ledger namespacing); merge node is plain SEQUENCE | The canonical safe use of read-only fan-out; powers `audit-sweep` |
| **judge-panel** | **Adapt** (read-only/design form only) | FAN-OUT of N angled `planner` attempts → FAN-OUT of M `code-reviewer` judges → SEQUENCE synthesis → `tdd-guide` implements downstream under G1 | **No.** Read-only fan-out carve-out + an **argmax/tally** decision (same family as the quorum step) | Write-role judge-panel (N competing implementations) is **rejected** — see below |
| **loop-until-dry** | **Adapt** | BOUNDED LOOP whose body is a read-only sweep; orchestrator diffs round-n findings vs the union; exit on `dry_streak ≥ K` **or** static `LOOP_CAP` | **No.** Needs a **convergence cap** (script-decidable set-diff early-exit) atop the mandatory static cap | Static cap stays the halting guarantee; predicate may only *shorten* |
| **completeness-critic** | **Adapt** | SEQUENCE critic node post-dominating the work (`code-reviewer` for code runs — **mandatory** to satisfy G1) + BOUNDED LOOP critic → pre-declared rework role → critic | **Yes** for the adapted form — bounded-loop already early-exits on a runtime verdict (the review-fix loop) | Cannot discover-and-spawn an *unplanned* role; a missing modality escalates to `full`, never mutates the frozen DAG |
| **self-repair-loop** | **Adapt** | BOUNDED LOOP: WRITE role produces → `code-reviewer`/`security-reviewer` gate validates → orchestrator routes fix on FAIL → re-validate, to the static cap | **Yes.** It *is* the design's named "review-fix / test cycle"; heterogeneous fix routing is existing runtime ledger routing, not a new primitive | Strengthens, not weakens, G1/G2 — the validator still computes post-dominance |
| **staged-escalation** | **Adopt** | SEQUENCE with an **always-present** gate node whose *body* is trigger-gated (records `N/A` with scan evidence when the trigger does not fire); escalated branch may be a bounded fix-loop | **Yes** — expressed as always-present-gate-with-gated-body, so ordinary post-dominance applies | The trigger must be a static, durable-state predicate; escalation is **additive-only** above the floor (G2's security escalation is the shipped instance) |
| **pipeline-vs-barrier** | **Adapt** (keep the dependency half, drop concurrency) | Barrier = FAN-OUT → join at a post-dominator (native: the unique sink *is* a barrier). Pipeline = the per-task SEQUENCE walked one item at a time | **Yes.** `depends_on[]` already encodes needs-all vs stream — **no** join-policy annotation needed | True streaming overlap is rejected on Branch A; the terminal is *always* a barrier (unique sink) |
| **structured-output** | **Adapt** | Orthogonal node-output contract: each role emits a schema-typed result; the orchestrator validates between calls; gates read enums (`verdict===BLOCK`, `red_proof`) not prose | **No.** Needs **one** new primitive: a `validateNodeOutput(role, result)` checkpoint (re-emit-on-failure is part of *that* primitive, not the grammar loop) | The enabler for the tally patterns above; raises *signal integrity*, does not lower the governance bar |

### adversarial-verify (first-class)

The user-mandated pattern. A claim already in the Node Ledger — a `code-reviewer` finding, a TDD GREEN assertion, a `planner` conclusion — is re-tested by spawning N independent skeptics, each prompted to **refute** it, and accepting the claim only if a majority fail to overturn it.

```
              claim already in Node Ledger
                          │
        ┌─────────────────┼─────────────────┐   read-only FAN-OUT, N ≤ FANOUT_CAP
        ▼                 ▼                 ▼    (N odd, to avoid ties)
  ┌───────────┐     ┌───────────┐     ┌───────────┐
  │ skeptic 1 │     │ skeptic 2 │ ... │ skeptic N │   role = adversarial-verifier
  │ "REFUTE"  │     │ "REFUTE"  │     │ "REFUTE"  │   (security-reviewer for
  └─────┬─────┘     └─────┬─────┘     └─────┬─────┘    security claims, review-only)
        │ {refute,reason, │ evidence_ref}   │
        └──────────┬──────┴─────────────────┘    each verdict checkpointed to
                   ▼                              the ledger before next dispatch
         ┌───────────────────────┐
         │ orchestrator QUORUM    │   accept iff refute_count < ⌈N/2⌉
         │ tally vs static thresh │   (deterministic, recomputed from
         └───────────┬───────────┘    durable ledger rows on resume)
              ┌──────┴──────┐
              ▼             ▼
          ACCEPT          KILL → bounded self-repair loop
        (confidence ↑)         OR surface as RISKY escalation
```

Each skeptic is a **read-only** `adversarial-verifier` (`code-reviewer` fallback when not installed; `[Read, Grep, Glob, Bash]`, no `Write`/`Edit`), so the fan-out is contention-free and needs no `disjointWriteSets()` — once the read-only carve-out legalises it. The skeptics dispatch **sequentially with checkpoints between calls** (Branch A has no in-process concurrency); the benefit is *assurance*, not wall-clock. The only genuinely new piece is the orchestrator's **quorum/decision** step: tally N schema-validated verdicts against a static majority threshold and emit one accept/kill decision node, derived **solely** from the durable per-skeptic ledger rows so a crash mid-tally recomputes rather than double-counts.

**It is ADD-ONLY above the gate floor.** Adversarial-verify is an *extra verification pass over a claim already recorded* — it inserts read-only nodes that write nothing to the repo. It cannot relax post-dominance (`code-reviewer` still post-dominates every `tdd-guide`), TDD RED→GREEN, or no-inline-implementation; it removes no gate. With zero blast radius it **cannot, by itself, trip the risky trigger** — so more verification only *lowers* the residual risk of the verified claim. A failed quorum (majority refute) is itself a principled `ask-if-risky` escalation: it converts a silent weak claim into an explicit kill/route decision.

> **G5 collision to respect.** `DELEGATION_CONTROLLED_REQUIREMENTS` anchors `/^code-reviewer$/i` and `/^security-reviewer$/i` **exactly** (§2). When the `code-reviewer` fallback body is used, each skeptic's `## Required Agent Compliance` row must therefore use the **bare role string** `code-reviewer`; per-instance disambiguation (`skeptic 3`) goes in the **Evidence** column only. A key like `code-reviewer skeptic 3` is silently skipped by `delegationPolicyCompliance()` — the same trap the gate rows already guard against.

> **Adversarial review is never a gate — by design.** The mandatory walls stay the
> *conservative* `code-reviewer` / `security-reviewer`: a gate must **minimize false
> positives** or it blocks routine work and gets routed around. Adversarial review rides
> *above* that floor — it **maximizes** false positives (refute-if-uncertain), which is
> right for confidence-raising and wrong for a gate. The two axes never merge: a skeptic
> quorum can never *be* a gate, or a “not-refuted” vote would spoof the mandatory reviewer
> (a non-gate role satisfying a gate — exactly what post-dominance forbids). A failed
> quorum is an `ask-if-risky` escalation or a route into the bounded self-repair loop; it
> **never drops a wall.**


### security-reviewer: review-only by governance, not by manifest

Three patterns above reach for `security-reviewer` as a read-only verifier. Be precise: its **tool manifest** (`security-reviewer.md:4`) lists `[Read, Write, Edit, Bash, Grep, Glob]` — by manifest it is a **WRITE** role. It is review-only solely by **governance posture** (its `.toml` `developer_instructions` say "Do not edit files", and it occupies the G2 post-dominator slot). The validator and `disjointWriteSets()` key off the **tool manifest**, not the prose. Consequence: the **canonical adversarial-verify skeptic is `adversarial-verifier`** (dedicated, write-free; `code-reviewer` is the genuinely-write-free fallback); a `security-reviewer` skeptic fan-out is a write-role fan-out unless the carve-out is applied to it specifically (pin it review-only / strip `Write`/`Edit` in that position), or it serialises. Remediation is always routed to `tdd-guide`/`build-error-resolver`, preserving G4.

### What does NOT translate to the sequential-checkpointing substrate

Branch A dispatches subagents one at a time and checkpoints markdown between calls; it is **not** a headless concurrent runtime (§"The substrate fork"). So:

- **True streaming `pipeline()`** — item-n-stage-2 overlapping item-(n+1)-stage-1 — is **rejected**. There is no in-process concurrency; "fan-out" is *logical/topological*, dispatched sequentially. We keep the *data-dependency* half (`depends_on[]` already encodes needs-all vs stream; the terminal sink is always a barrier) and drop the concurrency half. **No** per-edge join-policy annotation is needed — it would be inert on this substrate and would redundantly duplicate `depends_on[]`.
- **`loop-until-budget`** (scale loop depth to a token ceiling) is **rejected**. Branch A has **no token/context-window telemetry** — the orchestrator cannot introspect its own consumption (the only `TOKEN` in `.env.example` is `GITEA_TOKEN`, an auth credential), and a token count is not reconstructable from durable markdown, so it would break resume. The *count* arm (loop to a target, capped) translates; the *budget* arm does not.
- **Write-role judge-panel** (N competing *implementations*, score, pick a winner) is **rejected**. N `tdd-guide` attempts at the same task have **maximally-overlapping** write sets — the exact opposite of disjoint — and the 3-shape grammar has no throwaway-worktree race / winner-merge / loser-discard mechanism over the single-writer ledger. Only the **read-only design/plan** form (attempts = plans, judges = reviewers, synthesis = a plan one downstream `tdd-guide` implements) is feasible.

### The only new grammar primitives

Everything else is already expressible in {sequence, fan-out, bounded-loop} + post-dominance gates + `depends_on[]` + the per-node checkpoint loop. The genuinely new surface is **three small adds, all inside the three shapes** (none is a fourth production):

1. **Read-only fan-out carve-out** in the cap rule (§4): empty / role-namespaced write sets count as trivially disjoint, so read-only fan-out width is bounded by `FANOUT_CAP` **alone**, with a defined `disjointWriteSets()` verdict (PASS) on empty declarations and per-instance `.cache`/ledger namespacing for read-only siblings. (Enables adversarial-verify, multi-modal-sweep, read-only judge-panel.) Worktrees are **not** needed.
2. **Orchestrator quorum/decision step** — after a read-only fan-out, tally N schema-validated child verdicts against a *static* threshold and emit one accept/kill (or argmax-winner) decision node to the ledger, recomputed from durable rows on resume. Parameterised `tally-fn ∈ {majority-refute, argmax-score}` so adversarial-verify and judge-panel share it. Hard-depends on `structured-output`.
3. **Convergence cap** for loop-until-dry — a script-decidable, evidence-only early-exit (set-diff over normalised finding IDs reaching a dry streak) layered on the **mandatory** static `LOOP_CAP`. It can only *shorten* a loop, never extend it; an agent-judged "looks dry to me" predicate is out-of-grammar → typed refusal.

`structured-output`'s `validateNodeOutput()` checkpoint is a fourth add but is the *enabler* for (2) — without schema-validated verdicts the tally is undefined.

### Governance

More verification **lowers** the residual risk profile and **never triggers `ask-if-risky` by itself.** Every adopted verification/research pattern above is read-only — zero repo writes, zero blast radius — so it cannot touch a sensitive area or raise the high-blast-radius trigger on its own merits; it only improves the evidentiary basis of what the existing gates consume. The risk it adds is downstream: if a finding *routes work* into a sensitive area, the existing write/security gates (G1/G2) fire on those *write* nodes, unchanged.

> **Verification strength does not move the auto-run gate.** Auto-run is governed solely by the risk gate (§5): a validator-passing plan runs autonomously unless it is *risky* (sensitive area or write-role blast radius). Read-only verification adds **zero** blast radius, so adding skeptics never flips a benign plan into approval-required, nor a risky one into auto-run. These patterns make a claim *more trustworthy*; they do not move the governance gate. A failed quorum is the natural, principled `ask-if-risky` escalation. Net: the auto-run gate evidentiary basis strengthens, the approval surface is unchanged, and no safety gate is relaxed.

## Extending the role library (maintainer-extensible, runtime-closed)

The role alphabet is **no longer a fixed nine**. The earlier framing — a *closed 9-role alphabet* the validator hard-rejects everything outside of — was conflating two different closures into one. There are two, and they live on different layers:

- **Maintain-time closure (open, reviewed):** the role library is **maintainer-extensible**. A new sub-agent role enters exactly like a new skill — through a reviewed, parity-mirrored profile across all four trees (`agents/<role>.md` + the `.toml` twins + each `config/agents.toml` block + a `resolve-agent-model.js` default + the forge validators). Adding a role is an explicit maintainer pull request, never an in-run capability.
- **Plan-time closure (runtime-closed over the *installed* set):** the validator still hard-rejects any node whose `role` is **not present in the installed library**. The closure constant moves from "the literal 9" to "whatever the installed library currently is." So the agent **cannot invent a role mid-run** — it can only compose roles that a maintainer has already parity-installed (#44 preserved: role selection stays a vetted maintainer decision, never a hidden in-run one).

The honest one-liner: **maintainer-extensible, runtime-closed.** The library grows by review; the validator is closed over the installed set at plan time.

```text
   MAINTAINER (reviewed PR)            INSTALLED LIBRARY            VALIDATOR (plan time)            AGENT (run time)
   ┌───────────────────────┐          ┌──────────────────┐         ┌──────────────────────┐         ┌──────────────────┐
   │ adds a parity-mirrored │  ───►   │  the 9 existing  │  ───►   │ closed OVER the       │  ───►   │ composes a DAG   │
   │ profile (md+toml+      │         │  + any added     │         │ INSTALLED set:        │         │ from INSTALLED   │
   │ config + model default │         │  roles           │         │ role ∉ library ⇒      │         │ roles only —     │
   │ + forge twins)         │         │                  │         │ HARD REJECT           │         │ cannot invent    │
   └───────────────────────┘          └──────────────────┘         └──────────────────────┘         └──────────────────┘
        open, by review                 grows by review              closed over installed             closed at plan time (#44)
```

Two invariants bound what may be added:

- **The existing nine are frozen.** `code-explorer`, `docs-lookup`, `planner`, `code-architect`, `tdd-guide`, `build-error-resolver`, `code-reviewer`, `security-reviewer`, `doc-updater` are **not retuned, re-modelled, or removed** by this relaxation. Extension is **ADD-ONLY**; the floor never moves.
- **New roles are preferentially READ-ONLY and CANNOT be a gate.** The correctness gates (§2) are post-dominance properties keyed to the **designated** roles only — `code-reviewer` over every implement node, `security-reviewer` over every sensitive node, `tdd-guide` carrying RED→GREEN. A new role is **invisible** to those post-dominance checks: it can neither satisfy nor substitute for a gate, and no number of new-role nodes lets the agent route a gate around them. The preferred shape is the read-only verification/analysis tier — emits `(node_id, instance)`-namespaced `.cache` evidence, touches **zero** repo files — so the additive **write surface stays limited to `tdd-guide`/`build-error-resolver`/`doc-updater`** and a new role can never raise the risk profile.

## Proposed new roles

| Role | Introduce / Reuse | Read / Write | Model | Patterns served | Why it beats reuse | Gate relationship |
|---|---|---|---|---|---|---|
| **`adversarial-verifier`** | **Introduce** | **read-only** (`[Read, Grep, Glob, Bash]`, no `Write`/`Edit`) | `sonnet` default (parity with both reviewer gates; the fan-out multiplier argues against default-opus). `opus` is an **opt-in** per-install escalation via the `model:` frontmatter line the resolver reads *before* `DEFAULT_AGENT_MODELS` — not a resolver-default change | adversarial-verify (read-only FAN-OUT of refuters → orchestrator QUORUM/decision); perspective-diverse-verify (a *falsification* branch distinct from quality/threat); read-only judge-panel (adversarial judges feeding synthesis); completeness-critic / loop-until-dry (refute-if-uncertain pass inside a convergence-capped loop) | **It genuinely beats reuse.** `agents/code-reviewer.md` is a profile structurally tuned to **under-report** — "Only report issues you are confident about (>80% sure)," a Pre-Report Gate that drops uncertain findings, "It Is Acceptable And Expected To Return Zero Findings." Bolting a *refuted-if-uncertain* prompt onto that is an internally contradictory instruction (drop-uncertain **vs** uncertainty-counts-against), and a baked profile beats a transient prompt on ties — so reuse yields a **half-strength skeptic that keeps approving**. Retuning `code-reviewer.md` is forbidden (the 9 are frozen). A dedicated profile inverts the burden of proof **coherently** | **ADDITIVE; gate-SAFER than reuse.** Not a designated gate, invisible to post-dominance, cannot satisfy/substitute `code-reviewer`/`security-reviewer`/`tdd-guide`. A valid plan must *still* have a real `code-reviewer` post-dominating every implement node. It is *safer* than the reuse baseline, which conflates the mandatory sink gate with a fan-out skeptic (the skeptics ARE `code-reviewer` instances today); a dedicated refuter definitionally cannot be the gate, keeping the post-dominator independent and un-spoofable |
| **`judge-scorer`** | **Reuse-existing** | read-only | inherits host (`code-reviewer`=sonnet for code/findings, `planner`=opus for competing approaches) | judge-panel scoring layer; quorum tally input; perspective-diverse-verify branch scoring; multi-modal-sweep ranking | **It doesn't.** Zero capability gap: per-candidate scoring **is** a reviewer/`planner` carrying an explicit rubric, structure is the `validateNodeOutput()` checkpoint, and aggregation/ranking/**winner-selection must stay in the checkpointed orchestrator quorum/tally** where the validator auto-runs and risky calls surface. The discriminating test ("name one thing it does that those can't") has no answer. ("Judging" is a legitimate read-only category — declined on **redundancy**, not safety) | Sits **upstream** of implement nodes (compares approaches/findings), so it never post-dominates one; can neither satisfy nor substitute a gate. Note the hinge: a winner-*picking* variant that pulled the decision into an opaque subagent would be harness-unsafe — keep tally in the orchestrator |
| **`synthesizer`** | **Reuse-existing** (host = `planner`) | read-only | inherits `planner`=opus (the synthesis-grade role) | judge-panel synthesis; multi-modal-sweep merge; perspective-diverse-verify consolidation | **It doesn't.** `planner` is already the synthesis/merge node in every adopted pattern — its `planner.toml` contract ("compare value/complexity/risk/reversibility/test burden; recommend one; explain why it fits the evidence; save `.cache/planner.md`") already **is** winner-selection-plus-rationale. Grafting runner-up strengths is a richer recommendation inside the *same* contract — no new output contract, no new primitive — so a dedicated role is a node label with zero capability gap | Read-only, additive. Gate-safe **only conditionally**: it sits at the unique merge/sink point where a gate would naturally sit, so it is barred from being keyed as a post-dominator **and** the plan must independently keep `code-reviewer` post-dominating every implement node (security-reviewer over sensitive). It merges judgments but is **never** the gate |
| **`completeness-critic`** | **Reuse-existing** (hosts = `code-explorer` / `planner`) | read-only | inherits host (`code-explorer`=sonnet; `planner`=opus for the blocking-gap judgment) | multi-modal-sweep loop-exit oracle; loop-until-dry / self-repair convergence signal; deep-research claim/source verification | **It doesn't.** Every distinguishing slice has a clean read-only host: `code-explorer`'s contract ("separate facts from assumptions," "call out unknowns that block a reliable plan") **is** omission-enumeration; `planner`'s ("identify hidden risks and assumptions," "list constraints") **is** the blocking-gap judgment; the installed deep-research skill already does adversarial claim/source verification. `code-reviewer` is correctly disqualified as host (its anti-speculative contract forbids omission-hunting) — but that disqualifies one host, not the pattern. A dedicated role buys a persona and a tidy `.cache` filename — cosmetics | Read-only, emits only non-certifying coverage/convergence evidence; cannot certify correctness/security/test-pass. Gate-safe **only if** loop-exit wiring keeps the correctness gates firing **independently** of the critic's DRY verdict — a plan wiring "critic-dry" as the sink-gate is **out-of-grammar → typed refusal** |

### `adversarial-verifier` (role profile)

The one candidate where a **dedicated** new role clearly beats reuse. Its entire profile is to **DISPROVE** the implementation's central claim ("this change is correct / complete / regression-free for issue N"), with the burden of proof **inverted: refuted-if-uncertain**. It is a distinct *mindset axis* — `code-reviewer` is precision/quality, `security-reviewer` is threat-model, this is **falsification**.

- **Powers `adversarial-verify`.** It is the dedicated skeptic body of that pattern — the fan-out → quorum → accept/refuted flow is diagrammed under §“Borrowed orchestration patterns”, not repeated here. One role-specific refinement: each refuter is scoped to its **own disjoint claim/surface** and must not vote outside its slice, so the quorum aggregates *independent* slices, not N copies of one shared blind spot; per-instance output is `.cache/adversarial-verifier-{claim-id}.md` (the read-only-fan-out `(node_id, instance)` namespacing — a single fixed path would be a fan-out write-set collision).

- **Refute-by-default profile.** Output contract: (1) restate the exact claim under test; (2) the strongest disproof attempt — a concrete failing input/state/path with `file:line`, or the specific evidence it could **not** find; (3) verdict `REFUTED | NOT-REFUTED` with explicit confidence, **defaulting to `REFUTED` when confirmation is incomplete**; (4) save to `.cache/adversarial-verifier-{claim-id}.md`. Do-nots: do not edit any repo file; do not soften to "looks fine" — a non-refutation must be **earned** with evidence; here uncertainty counts **against** the claim, the exact opposite of `code-reviewer`'s >80% rule.

- **Tools.** `[Read, Grep, Glob, Bash]` mirrors the `code-reviewer` gate analog exactly — `Bash` is **required** (falsification needs to execute the change/tests to find counterexamples), and "read-only" here is the behavioral term-of-art (touches zero repo files, emits `.cache` evidence), not a literal tool strip.

- **Additive and gate-safe.** An `adversarial-verifier` node is invisible to post-dominance — it can never satisfy or substitute the `code-reviewer`/`security-reviewer`/`tdd-guide` gates (a valid plan still needs a real `code-reviewer` post-dominating every implement node). It is in fact *gate-safer* than reusing `code-reviewer` instances as skeptics, which conflates the mandatory sink gate with a fan-out branch (see the table above and §adversarial-verify).

> **Verified — why reuse degrades here, not vibe.** `agents/code-reviewer.md` is structurally engineered to under-report: "Only report issues you are confident about (>80% sure)," a Pre-Report Gate ("If any answer is no or unsure, downgrade severity or drop the finding"), "demote to MEDIUM or drop," "It Is Acceptable And Expected To Return Zero Findings." A `refuted-if-uncertain` prompt on that baked profile is internally contradictory, and a baked profile wins ties against a per-call prompt. Reuse therefore yields a skeptic that keeps approving; the task forbids retuning the frozen 9. A dedicated profile is the only way to invert the burden of proof coherently.

### One role, many claim-scoped lenses (why the roster stops at one)

`adversarial-verifier` is the **only** new role — and it stays one role no matter how many
adversarial *angles* a task needs. The unit of scale is **one role × N read-only instances,
each scoped to its own disjoint claim**, not one role per domain. The lenses differ by the
*claim and its evidence source*, not by capability: identical tools (`Read`/`Grep`/`Glob`/`Bash`),
identical refute-by-default posture, the shared orchestrator quorum. **A lens is a
prompt+claim binding, not a new profile.**

| Lens | Refutable claim | Verdict | How |
|---|---|---|---|
| **correctness-refute** | “this change is correct / regression-free” | **the role** | N skeptics scoped to disjoint surfaces → quorum |
| **security-red-team** | “secure against [threat model]” | **wire, don’t add a role** | an `adversarial-verifier` instance scoped to the security *claim*, loading the security-review skill for OWASP/SSRF/crypto depth. **Do NOT name a `security`-flavoured sibling** — it blurs the G2 bright line and invites a future maintainer to treat its pass as satisfying the gate. The conservative `security-reviewer` still post-dominates every sensitive node, unchanged. |
| **plan-red-team** | “this plan is sound / complete / addresses constraints” | **wire, don’t add a role** | an instance on the *frozen plan*; `planner` is constructive and cannot self-refute, so the claim routes to the refuter, not back to `planner`. |
| **test/edge-case** | “tests adequately cover the feature” | **defer** | `code-reviewer` already flags missing tests at the floor; add `adversarial-tester` later only if confidence-escalation proves load-bearing. |

**Why exactly one, not three** (verified, not stylistic): the “reuse degrades because the
baked posture fights a refute prompt” argument holds **only** for `code-reviewer` — its
profile is engineered to *under-report* (“>80% sure,” “drop the finding,” “zero findings is
acceptable”), which directly contradicts refute-if-uncertain. `security-reviewer.md` carries
the opposite posture (“paranoid, proactive, fail securely”), so it does **not** contradict a
refute prompt — a security adversary is a *claim binding* on the one refuter, not a second
profile. `judge-scorer` / `synthesizer` / `completeness-critic` stay **reuse** (served by
`planner` / `code-explorer` / reviewer).


## The flexibility ⟷ harness balance (where this lands)

The design sits at the **midpoint** and is balanced because the two pulls act
on **different axes**. The midpoint is **free design + lifecycle harness** —
not a curated template catalog. The agent freely composes the orchestration
*between* `claim` and the Phase-6 sink; the harness owns the frame and the
computed gates.

- **Flexibility gained (real, task-shaped):** the agent freely designs the
  *shape* of the orchestration for *this* task — explorer/docs count,
  `tdd-guide` fan-out over disjoint sub-areas, extra review passes, DAG
  branching and loops — the Claude-Code dynamic-orchestration capability,
  replacing two fixed macro-shapes with free composition.
- **Harness kept (the durable lifecycle frame + computed gates):** the atomic
  claim + parallel-overlap classifier, the branch/worktree provisioning, the
  runtime-closed role library (nine canonical roles + maintainer-installed extensions, fixed models per role), **post-dominance-enforced**
  non-removable gates, per-node disjointness + fan-out/loop caps, a frozen
  `plan_hash`-guarded plan, the same per-node checkpointing that makes today's
  phases resumable, the **Phase-6 sink** (close issue, archive, roadmap
  regen, deferred/PR handling), and **risk-based governance** (auto-run on
  validator-pass when provably low-risk, ask if risky).

**Why dropping templates costs nothing on correctness.** The gates are
**post-dominance properties the validator computes** over the topology — they
hold over *any* shape. Templates were never a correctness mechanism, only a
human-pre-vetting-of-*shape* shortcut for *authorization*. So removing the
curated path from the load-bearing surface leaves the correctness floor
untouched; it only moves authorization from "human-vetted-template → auto" to
"risk-assessment-on-any-topology → auto-or-ask."

**Branch A is reaffirmed — the lifecycle requires it.** Keeping
branches/worktrees/claim/finalize *forces* Branch A (compose on the existing
markdown + `Agent()` checkpointing substrate). A literal headless Workflow
runtime (Branch B) would forfeit exactly those: it does not naturally
checkpoint `workflow-state.md`, write per-node artifacts, or update compliance
ledgers mid-run, and `parallel()`/`pipeline()` create concurrent writers to the
single-writer ledger. The free-design middle runs *on* the inherited lifecycle
frame precisely because that frame is what makes resume, atomicity, and the
Phase-6 sink work.

Two endpoints we **considered and rejected** frame the midpoint:

- **Knob-only over a curated template library (no free DAG).**
  Harness-heaviest, trivially governed — but the flexibility *ceiling* is too
  low: the agent can widen and toggle a pre-vetted shape but never freely
  reorder, insert a role mid-stream, or compose a genuinely different
  verification topology. The validator's **structural checks** (inherited from
  that mechanism) apply uniformly across all topologies, so we keep the checks
  — but free authorship, not template selection, is the load-bearing
  flexibility. Curated templates are demoted to a non-binding future
  convenience (§"Out of scope").
- **Headless Workflow runtime (Branch B).** Maximally flexible authoring — but
  forfeits durable-state/resume on the first crash and bolts a whole new
  substrate onto the parity surface for no capability Branch A lacks.
  **Rejected as a runtime**; its grammar/validator insight is adopted on the
  Branch-A substrate.

## Choosing the path: fast / full / adaptive

Path selection stays **agent judgment** (#44 — scripts validate, never auto-pick). The choice is now three-way, but the third option only exists when the install switch is ON, and the bias toward `full` when unsure is unchanged. The discriminators sit on **two different axes** — keep them distinct:

- **`fast` — the *uncertainty* axis (unchanged).** Choose `fast` when the change is **unambiguous + mechanical + small**: exactly one sensible approach (not ≥ 2 materially-different viable ones), ≤ 5 files in a single area, no new external deps, no public API/schema/migration, no security/auth concern, no `depends-on:#N` label. This is the verified rubric in `commands/kaola-workflow-fast.md`, untouched.
- **`full` — the *default, single-coherent-change* path.** Choose `full` for a design-medium change that is one coherent **linear** progression (research → strategy → plan → implement → review → finalize). **`full` is the default whenever in doubt** — including every adaptive-vs-full tie.
- **`adaptive` — the *structure* axis (new, switch-gated).** Choose `adaptive` only when the task has **structure that a custom topology serves materially better than the linear path**, *and* the switch is ON. Concretely, at least one of:
  - **multiple disjoint sub-areas that fan out** (e.g. `api/`, `cli/`, `ui/` each implemented over a disjoint write set), or
  - **several subsystems to research in parallel** (multiple `code-explorer`/`docs-lookup` nodes that don't depend on each other), or
  - **a non-standard verification shape** (an extra review pass, a bounded review-fix loop) the fixed phase ladder cannot express.

  If the task is *one coherent linear change* — even a large or careful one — that is **`full`, not `adaptive`**. A custom graph must earn itself; a linear job in a DAG is just `full` with overhead.

**Full precedence (toggle short-circuits first), first-match wins. These are exactly the five levels the diagram enumerates, in the same order:**

1. **Switch gate (first).** If the adaptive switch is OFF, `adaptive` is **removed from the menu entirely** — evaluate only fast vs full, exactly as today. `adaptive` can never fire when the switch is off.
2. **Explicit env var.** Honor an already-exported `KAOLA_PATH` (`fast` | `full` | `adaptive`). An explicit `KAOLA_PATH=full` or `=fast` is honored verbatim and the rubric is **not** re-derived. `KAOLA_PATH=adaptive` under an OFF switch is a **typed refusal** (`claimProject`), never a silent downgrade.
3. **Prompt keywords.** fast triggers ("quick fix", "trivial", "rename", "typo", …) and full triggers ("thorough", "carefully", "all phases", …) are **decisive**. Adaptive triggers ("fan out", "in parallel", "orchestrate", "compose", "multiple subsystems") are **necessary-but-not-sufficient**: an adaptive keyword only *flags* `adaptive` as a candidate — it never selects it. The structure rubric in level 4 must then confirm. Tie, both match, or keyword-only-with-no-structure → prefer `full`.
4. **Issue rubric.** Apply the fast rubric first (uncertainty axis). If not fast, ask the structure question (disjoint sub-areas / parallel subsystems / non-standard verification). Structure confirmed (≥ 1 holds) **and** switch ON → `adaptive`. Otherwise — including a flagged-but-unconfirmed adaptive candidate — → `full`.
5. **Default `full`.** On fetch failure, offline, or any ambiguity — including adaptive-vs-full unclear — choose `full`.

Because `fast` requires a *single area* and `adaptive` requires *multiple disjoint areas*, fast and adaptive are mutually exclusive — so testing fast first is safe and keeps the high bar. Because an adaptive keyword can never select `adaptive` without structural confirmation, **a loosely-worded prompt ("orchestrate the cleanup", "compose a fix") cannot route into the autonomous adaptive executor on keyword alone** — when adaptive-vs-full is unclear, the answer is `full`.

**Decision tree (toggle is the first branch; five precedence levels top-to-bottom). Once `adaptive` is selected and the plan is authored, the validator + risk-gate decides auto-run vs ask:**

```text
  ┌──────────────────────────────────────────────────────────────────────┐
  │ 1. Adaptive switch ON?  (KAOLA_ENABLE_ADAPTIVE env / enable_adaptive)  │ ◄ install gate, FIRST
  └──────────────────────────────────────────────────────────────────────┘
        │ NO                                              │ YES
        ▼                                                 ▼
  ┌───────────────────────────────┐         ┌────────────────────────────────┐
  │ 2-way (exactly today)         │         │ 2. KAOLA_PATH exported?         │
  │                               │         └────────────────────────────────┘
  │  KAOLA_PATH=adaptive ──► TYPED │           │ yes: fast/full ──► honor verbatim
  │      REFUSAL (claim.js),       │           │ yes: adaptive   ──► honor
  │      never downgrade           │           │ no  ▼
  │  KAOLA_PATH=fast/full ─► honor │         ┌────────────────────────────────┐
  │  else ▼                        │         │ 3. Prompt keyword decisive?     │
  │  ┌──────────────┐              │         │    fast / full keyword ─► honor │
  │  │ fast rubric? │              │         │    adaptive keyword = FLAG only │
  │  └──────────────┘              │         │    (must be confirmed below)    │
  │     │ yes ──► FAST             │         └────────────────────────────────┘
  │     │ no  ──► FULL             │           │ undecided ▼
  └───────────────────────────────┘         ┌────────────────────────────────┐
                                            │ 4a. fast rubric?                 │
                                            │  unambiguous+mechanical+small,   │
                                            │  ≤5 files single area, no deps,  │
                                            │  no API/schema, no security      │
                                            └────────────────────────────────┘
                                              │ YES ──► FAST
                                              │ NO  ▼
                                            ┌────────────────────────────────┐
                                            │ 4b. STRUCTURE a custom graph     │
                                            │  serves materially better?       │
                                            │   • disjoint sub-areas fan out   │
                                            │   • parallel subsystems          │
                                            │   • non-standard verify shape    │
                                            └────────────────────────────────┘
                                              │ NO / unsure ──► FULL  (default)
                                              │ YES (confirmed) ▼
                                            ┌────────────────────────────────┐
                                            │ 5. Validator pass, then RISKY?   │
                                            │  sensitivity (labels OR declared │
                                            │  write set touch Phase-5; else   │
                                            │  undetermined) + blast-radius    │
                                            │  (WRITE-ROLE fan-out/SHARED_INFRA │
                                            │  file ceiling / loop). Uncertain │
                                            │  ⇒ risky. (auto-run is provisional│
                                            │  → revoked at barrier on upgrade) │
                                            └────────────────────────────────┘
                                              │ out-of-grammar ──► TYPED REFUSAL
                                              │ in-grammar, NOT risky ──► AUTO-RUN
                                              │ in-grammar, RISKY/uncertain ──► ASK USER FIRST
                                                        (approve the DAG, then freeze)
```

**Reading the leaves:**
- **FAST** — one fixed shape: plan → execute → review → `fast-summary.md`.
- **FULL** — one fixed shape: P1 → P2 → P3 → P4 → P5 → P6. The default, and the answer to every doubt.
- **ADAPTIVE** — the agent freely draws the shape within the grammar floor (closed library, post-dominance gates, caps, disjointness, unique sink). Once authored: a plan that **passes the validator** **auto-runs only when provably low-risk** (sequential, no write-role fan-out, declared write set outside every Phase-5 area, no `SHARED_INFRA`, under the file ceiling, no loop) — and that auto-run authorization is **provisional**, revoked at the barrier if a runtime re-scan upgrades risk (halt for consent). Otherwise — any write-role fan-out, any sensitivity, any uncertainty — it **surfaces for approval** (ExitPlanMode-style, then freeze). **Out-of-grammar** plans (unknown role, gate routed around, cap busted, non-disjoint fan-out) get a **typed refusal** — never a silent fix. Reachable only when the switch is ON *and* the structure question (4b) was affirmatively confirmed.

## Parity / validator surface (real cost)

A new path is a large but mechanical footprint, roughly the shape of adding
the fast path. **Get the counts right — this is real cost.**

- **New skill/command — `kaola-workflow-adapt` (the Phase-0 / plan-authoring
  step) + `kaola-workflow-plan-run` (the executor):** a command file in
  `commands/` **+ GitLab `commands/` + Gitea `commands/`**, and a `SKILL.md`
  in `plugins/kaola-workflow/skills/` **only** (Codex skills are
  GitHub-plugin-only; there are no GitLab/Gitea skill variants).
- **New script — `kaola-workflow-plan-validator.js`** (closed-library +
  post-dominance gates + caps + disjointness static checks, **plus the
  risk-assessment marker scan** — sensitivity over-approximated from labels +
  the declared write set, blast-radius from any write-role fan-out / `SHARED_INFRA` /
  file ceiling / loop presence — that drives the auto-run-vs-ask decision).
  Plus the new `disjointWriteSets()` helper and the classifier `module.exports`.
  **Byte-identity covers only `scripts/` ↔ `plugins/kaola-workflow/scripts/`**
  (Claude ↔ Codex) via `validate-script-sync.js` `COMMON_SCRIPTS`.
  **GitLab/Gitea are forge-RENAMED forks** (`kaola-gitlab-*`,
  `kaola-gitea-*`), **not byte-synced** — so the new script, plus
  `routeAdaptive`/`isAdaptiveWorkflowState`/`disjointWriteSets` edits to
  `repair-state` and `claim`, are an **unguarded manual port on 2 of the 4
  trees**. A **new structural/region check** (a shared schema constant or a
  region-marker assertion) is required to catch drift on the renamed forks,
  or the path ships correct on Claude/Codex and silently broken on
  GitLab/Gitea.
- **Modified scripts (each tree):** `repair-state.js`
  (adaptive recognition + plan/ledger reconstruction branch + consent-halt
  surfacing), `classifier.js` (`module.exports` + the pairwise helper + a
  `## Nodes` reader so adaptive projects are **not** an empty write set to
  other projects' cross-issue checks), `claim.js`
  (persist `workflow_path: adaptive`).
- **Modified prose:** `workflow-next.md` Step 0a-1 (third path value) +
  Manual reconstruction order (new top branch) + Required Output;
  `kaola-workflow-fast.md` / `phase6.md` (recognize the adaptive prerequisite)
  — each ×3 forges.
- **Validators — there are FOUR, not two:** `validate-workflow-contracts.js`,
  `validate-kaola-workflow-contracts.js`, **and the GitLab and Gitea
  contract twins.** All four enumerate the adaptive path, the new artifacts
  (`workflow-plan.md`, Node Ledger), the gate/cap assertions, **and the
  risk-assessment governance contract** (in-grammar + provably-low-risk →
  provisional auto-run; in-grammar + risky/uncertain → ask; runtime risk
  upgrade → revoke + halt-for-consent; out-of-grammar → typed refusal); the
  Agent-model-badge contract must cover the new command's `Agent()` blocks;
  the cross-forge Delegation Contract lock (#211) extends to any new shared
  prose. `validate-script-sync.js` enrolls the new byte-identical script.
- **Walkthrough — `simulate-workflow-walkthrough.js`** (verified to exercise
  **no** fan-out/loops today): gains adaptive-path cases —
  **`tdd-guide` fan-out (real concurrency, Tier 1) that surfaces for approval
  before running**, bounded loop, resume-from-ledger, mid-batch-crash resume, a
  **sequential, non-sensitive low-risk plan that auto-runs**, a **plan clean-by-
  declaration that auto-runs, then writes to `auth/` at the barrier → revoked →
  halt-for-consent**, a **risky plan that surfaces for approval**, a **risk-
  uncertain plan that fails closed to ask**, a typed-refusal on an out-of-
  grammar plan, and a non-disjoint fan-out demotion.
- **Docs:** `docs/workflow-state-contract.md` (plan + ledger schema,
  `plan_hash`, current-node, the bare-role-string gate rule),
  `docs/architecture.md`, CLAUDE.md Key Scripts, CHANGELOG.md, `.env.example`
  (`KAOLA_FANOUT_CAP`).

- **install.sh (one file, `--forge`-selected):** `--enable-adaptive=yes|no` flag parsing + usage line + value whitelist (mirror the existing `--profile` case/shift/validate pattern), plus the new read-modify-write merge into `config.json` (the *first* time install.sh writes config; only on `=yes`).
- **`readOrCreateConfig` (3 classifier copies — `scripts/kaola-workflow-classifier.js` + the `kaola-gitlab-`/`kaola-gitea-` renamed forks):** add `enable_adaptive: false` to the defaults object **for the freshly-created-file case only** (cosmetic; the OFF default for existing files comes from the `=== true` on-test, not this). Verify and assert all three resolve the **identical** `~/.config/kaola-workflow/config.json` — one shared path, no per-forge namespace.
- **`claim.js` (×4 trees — Claude/Codex byte-synced, GitLab/Gitea manual port):**
  - **`claimProject` (`claim.js:422`)** — single shared guard site covering both `cmdClaim` and `cmdStartup`: read the switch (env > config > OFF), whitelist `{fast,full}` OFF / `{fast,full,adaptive}` ON, emit a **typed refusal** on a `adaptive` claim when OFF.
  - **`writeState` next_command default (`claim.js:287`)** — make adaptive-aware (emit `/kaola-workflow-plan-run {project}`), **toggle-agnostic**.
  - **`resumeFallbackCommand` (`claim.js:496`, regex `claim.js:500`)** feeding `cmdResume` — make adaptive-aware (emit `/kaola-workflow-plan-run {project}`, not `/kaola-workflow-phase{N}`), **toggle-agnostic**.
  - Do **not** add the switch read to `repair-state.js` or the plan-validator.
- **Router prose (`workflow-next.md` Step 0a-1 ×4 forges):** the switch is the **first** precedence branch; the diagram enumerates all five levels (switch → explicit env → keywords → fast rubric/structure → default full); adaptive keyword is flag-only; when OFF, omit `adaptive` from the menu and the Required Output (`Workflow path: {fast|full}` vs `{fast|full|adaptive}`).
- **`.env.example`:** add `KAOLA_ENABLE_ADAPTIVE=1` with a comment that it overrides the install default (default OFF; set `1` to enable for a session).
- **Contract validators (all four trees):** assert the OFF-default contract and typed-refusal-on-OFF behavior in `claimProject`; assert the shared-config-path invariant across the three classifier copies; assert **both `claim.js` resume surfaces emit `/kaola-workflow-plan-run` for `workflow_path: adaptive`** (so a renamed fork cannot silently regress to phaseN-misrouting an adaptive resume); assert the switch is **absent** from `repair-state`/`routeAdaptive` and the plan-validator (a structural/region check so renamed forks cannot drift into gating resume); assert the **risk-assessment governance contract** (provably-low-risk → provisional auto-run, risky/uncertain → ask, runtime risk upgrade → revoke + halt-for-consent, out-of-grammar → typed refusal) is present and identical across forges.
- **`docs/workflow-state-contract.md`:** document `enable_adaptive` (location, default OFF, env mirror, selection-only semantics, finish-in-flight rule, the two resume surfaces being toggle-agnostic).

**Out of scope of the parity surface (untouched):** the **9 role TOML
profiles** and **`resolve-agent-model.js`** (invariant #2) — see "Out of
scope" below.

- The plan-validator (×4 trees) asserts the **read-only fan-out carve-out**: read-only fan-out width is bounded by `FANOUT_CAP` only; `disjointWriteSets()` is exercised on empty/role-namespaced write sets and returns PASS; a write-role fan-out (including `security-reviewer` by manifest) still requires pairwise-disjoint declared sets + isolation.
- The validator rejects (typed refusal) a **heterogeneous fan-out** (N distinct roles in one fan-out node) and a fan-out node whose children share a non-empty write set — distinguishing it from legal multi-role **DAG branching** (`perspective-diverse-verify`).
- The validator asserts the **quorum/decision node schema** (static threshold; verdict source = durable ledger rows; no independent in-memory counter) and rejects any token-budget / dynamic-budget loop predicate as out-of-grammar.
- `simulate-workflow-walkthrough.js` gains cases: **read-only fan-out** (N `adversarial-verifier` skeptics, `code-reviewer` fallback, no disjointness) → **quorum accept** and **quorum kill**; **crash mid-fan-out** → resume re-dispatches only missing skeptics, tally recomputes idempotently; **loop-until-dry** early-exit on `dry_streak` and cap-without-convergence stop-and-ask; **bare-role-string** assertion across N skeptic rows; a **heterogeneous-fan-out typed refusal**.
- The four contract validators enumerate the quorum/decision node type and the read-only-fan-out carve-out; the structural/region check on the renamed GitLab/Gitea forks covers the new carve-out and decision-node assertions so they cannot drift.

- `agents/<role>.md` (frontmatter `model:` + `tools:`) **and** a **locally-authored-agent carve-out in `validate-vendored-agents.js`** — verified blocker: `requiredAgents` (line 9) + the exact-set map (line 42) demand upstream provenance (URL + 40-hex blob-sha + 64-hex sha256 + MIT/copyright pinned to the vendored commit). A locally-authored role has **no upstream blob and fails outright**, so the validator must first grow a provenance-exempt-but-name-pinned class before any new role installs.
- `.toml` twin in each of the four agent trees: `.codex/agents/kaola-workflow/<role>.toml`, `plugins/kaola-workflow/agents/<role>.toml`, `plugins/kaola-workflow-gitlab/agents/<role>.toml`, `plugins/kaola-workflow-gitea/agents/<role>.toml` (sets `model_reasoning_effort` + `developer_instructions`).
- `[agents.<role>]` block in each plugin `config/agents.toml` (×3: kaola-workflow, -gitlab, -gitea) — description + `config_file` + `nickname_candidates`.
- `'<role>': '<model>'` in `DEFAULT_AGENT_MODELS` across **all four** resolver copies (`scripts/` + the three `plugins/*/scripts/kaola-workflow-resolve-agent-model.js`); the resolver is precedence-based (frontmatter `model:` **then** the default map), so an `opus` opt-in rides the frontmatter line with **no** resolver-default change and no allowlist edit.
- **Count-assertion bumps (verified on disk):** `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` line **138** (`agentFiles.length === 9`) and `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` line **139** (`=== 9`) → **10**. The github root `scripts/validate-workflow-contracts.js` carries **no** agent count assertion, so there is nothing to bump there; the sibling command/skill counts move independently and are unaffected by adding an *agent*.
- Resolver/parity test coverage: extend `scripts/test-agent-model-resolver.js` (new role resolves to its default) and `validate-script-sync.js` (the new role stays cross-tree-synced); keep `simulate-workflow-walkthrough.js` green.
- Docs touch-up per the project checklist (README / CHANGELOG / `docs/architecture.md` / `docs/agents-source.md`) wherever the role library is enumerated.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Gate routed around by a parallel branch (the reachability trap) | **Post-dominance over a unique sink**, not reachability; the validator computes it from topology, not author flags — and it holds over **any** freely-designed shape, not just pre-vetted ones |
| Delegation policy silently unenforced on `code-reviewer`/`security-reviewer` because of node-id keying | Hard schema rule: gate compliance rows use the **bare role string** so the anchored `DELEGATION_CONTROLLED_REQUIREMENTS` regexes still fire; node-id goes in Evidence |
| Sensitivity misclassified → security review never fires (correctness) | G2 re-derived from frozen labels **and** a semantic `.cache` re-scan of *actual* touched files (Phase 5 categories); fail closed; barrier escalates `security` (forces `security-reviewer` post-dominance) if a sensitive write has no post-dominating reviewer |
| **Benign-by-declaration plan AUTO-RUNS, then writes auth/secrets/filesystem without consent (authorization timing hole)** | **Two-point fail-closed authorization:** (a) pre-execution **over-approximation** — labels OR the *declared* write set touching any Phase-5 area, or undetermined sensitivity, → risky → **ask before freeze**; (b) auto-run authorization is **provisional** — the barrier's runtime re-scan upgrading sensitivity (or overflow into a sensitive/`SHARED_INFRA` area) **revokes it → halt for consent** (`escalated_to_full: consent`), not merely "add a reviewer." Co-occurs with the §2 correctness escalation at the same barrier |
| `plan_hash` gone exactly when needed | Hash lives **inside `workflow-plan.md`** (survives `workflow-state.md` loss), script-computed, re-checked every load |
| In-flight frozen plan bricked when the rubric later tightens | Resume re-validates **only** library + structure + hash, never the full gate rubric |
| "Reuse `scanClaimedOverlap`" for intra-issue disjointness (it can't) | Budget as **new code**: classifier `module.exports` + a pairwise `disjointWriteSets()` helper over in-memory sibling write sets |
| Concurrent fan-out overflows into a shared file undetected | Per-instance write isolation = **post-run diff-vs-declared-allowlist** on the single shared worktree (no per-node worktrees) is the **gating precondition** for fan-out; declared disjointness alone is insufficient (the overflow backstop proves runtime exceeds declarations) |
| Adaptive project invisible to other projects' cross-issue overlap check | Classifier reads the plan's `## Nodes` write sets the instant `workflow-plan.md` can exist (Tier 1), not deferred |
| Crash mid-node desyncs resume pointer | Barrier commit order `.cache → ledger row → state-pointer LAST`; crash → recoverable `in_progress` → re-dispatch; a consent-halt writes a durable marker so resume surfaces the approval rather than re-dispatching |
| GitLab/Gitea forks drift silently (not byte-synced) | New structural/region check on the renamed forks + walkthrough cases exercising the adaptive path on those forges |
| A freely-designed plan auto-runs a risky, materially-user-owned change | Governance is **risk-assessment, not curation**: validator-pass auto-runs **only** when provably low-risk (sequential, declared write set outside every Phase-5 area, no write-role fan-out, no `SHARED_INFRA`, under ceiling, no loop); **any write-role fan-out, any sensitivity-by-declaration, or any uncertainty → fail closed → ask** (ExitPlanMode); auto-run is provisional and revoked on a runtime upgrade; no blanket auto-approve bypass |
| Dropping curated templates loses deterministic ledger-corruption repair | **Named, not hidden** (§6): the frozen plan + `plan_hash` still anchor STRUCTURE and `.cache` rebuilds PROGRESS; only the `(template,knobs)→nodes` re-expansion is foregone — a minor robustness loss, acceptable because the plan anchors the node set, `.cache` is run truth, and corrupt-ledger-with-intact-plan is rare |
| Valid-but-mis-executed plan (agent skips a node over arbitrary topology) | Residual: gate **presence** is plan-time-checked but gate **execution** is agent discipline over variable graphs the walkthrough can't exhaustively cover — documented, not eliminated |

## Acceptance criteria (whole effort)

- [ ] `KAOLA_PATH=adaptive` is a third path value: selected in
  `workflow-next.md` Step 0a-1, persisted to `workflow-state.md:workflow_path`
  by `claim.js`, recognized by `isAdaptiveWorkflowState`.
- [ ] The adaptive path inherits the Kaola lifecycle frame
  (claim → branch/worktree → [free design] → Phase-6 sink) with **no changes
  to** claim/release/startup, worktree provisioning/status, the Phase-1 Step 6
  branch cut, or the Phase-6 sink (merge/PR/archive/close/roadmap-regen); only
  the adaptive-aware touches listed in §"The fixed frame" are made.
- [ ] The agent **freely authors** any in-grammar DAG (no template selection /
  knob-binding ceremony on the load-bearing path).
  `kaola-workflow-plan-validator.js` rejects: any role not in the installed library; any
  author-set model; any plan whose `code-reviewer` does **not** post-dominate
  every `tdd-guide` (non-trivial); any sensitive plan whose
  `security-reviewer` does not post-dominate every sensitive node; any
  fan-out whose declared write sets are not pairwise disjoint; any cap
  exceeded; any plan without a unique sink. Exits non-zero on reject.
- [ ] Gate compliance rows for `code-reviewer`/`security-reviewer` use the
  bare role string; a validator asserts it; `delegationPolicyCompliance()`
  is shown to fire on them.
- [ ] `workflow-plan.md` + `## Node Ledger` + `plan_hash` (stored in the plan
  artifact) are the resume source of truth; `routeAdaptive()` reconstructs by
  traversal ahead of the phaseN ladder; archived projects are untouched.
- [ ] Resume re-validates only library + structure + hash; the barrier commit
  order is `.cache → ledger → state-pointer`; a mid-node crash resumes by
  re-dispatching the `in_progress` node; a consent-halt writes a durable marker
  so resume **surfaces the approval** instead of re-dispatching. The corrupt-
  ledger robustness loss is documented (not hidden): plan + `plan_hash` anchor
  structure, `.cache` rebuilds progress.
- [ ] **Within-issue `tdd-guide` fan-out is a Tier-1 capability:**
  `disjointWriteSets()` helper exists (new code), the classifier exports its
  primitives and reads the plan `## Nodes`, an adaptive project is **not** an
  empty write set to other projects, and per-instance write isolation
  (**post-run diff-vs-declared-allowlist on the single shared worktree, no
  per-node worktrees**) gates real fan-out concurrency. Fan-out is a
  capability, not an auto-run authorization: any write-role fan-out **surfaces for
  approval** before running (next bullet).
- [ ] Governance is **risk-assessment, not curation**: a validator-passing
  in-grammar plan **auto-runs only when provably low-risk** (sequential,
  no write-role fan-out, declared write set outside every Phase-5 area, no
  `SHARED_INFRA`, under the file ceiling, no loop); **sensitivity-by-declaration
  OR any WRITE-ROLE fan-out OR `SHARED_INFRA` OR over-ceiling OR a loop OR any uncertainty
  → fail closed → ask** the user (read-only verification/research fan-out is zero-blast-radius and does NOT trigger ask); **out-of-grammar → typed refusal**; **no
  blanket auto-approve**.
- [ ] **Provisional auto-run authorization is revoked at the barrier:** a plan
  clean-by-declaration that auto-runs and whose runtime `.cache` re-scan
  upgrades sensitivity (or detects overflow into a sensitive/`SHARED_INFRA`
  area) **halts for consent** (`escalated_to_full: consent`) — not merely adds
  a `security-reviewer` — co-occurring with the §2 correctness escalation.
- [ ] Caps enforced: `FANOUT_CAP` (default 4), `test_thrash` ≥ 3 at the
  barrier, file overflow declared+1 / absolute 6 per node.
- [ ] All four contract validators + `validate-script-sync.js` pass across
  Claude/Codex/GitLab/Gitea; a structural/region check guards the renamed
  forks; the risk-assessment governance contract is asserted identical across
  forges; `node scripts/simulate-workflow-walkthrough.js` exits 0 with new
  adaptive-path cases (fan-out-surfaces-for-approval, loop, resume-from-ledger,
  crash-resume, sequential-low-risk-auto-run, runtime-sensitivity-upgrade-halt-
  for-consent, risky-ask, risk-uncertain-fail-closed-ask, typed-refusal,
  non-disjoint demotion).
- [ ] The 9 role TOML profiles and `resolve-agent-model.js` are **unchanged**.
- [ ] `docs/workflow-state-contract.md`, `docs/architecture.md`, CLAUDE.md,
  CHANGELOG.md, `.env.example` updated.
- [ ] `--enable-adaptive=yes|no` exists on `install.sh` (single file, all forges) and **defaults to `no` (OFF)**; `=yes` is the *only* thing that writes `enable_adaptive: true` into `~/.config/kaola-workflow/config.json` (read-modify-write, preserving `parallel_mode`); the default path writes nothing.
- [ ] **Absent `enable_adaptive` reads as OFF**; the OFF guarantee rests on the strict `config.enable_adaptive === true` on-test (never `!== false`), not on any `readOrCreateConfig` defaults edit; precedence is env `KAOLA_ENABLE_ADAPTIVE` > config `enable_adaptive` > default OFF.
- [ ] With the switch **OFF the system behaves exactly as today**: Step 0a-1 is the 2-way fast/full decision, `adaptive` is never proposed, `claimProject` accepts only `fast`/`full`, no adaptive artifacts are authored.
- [ ] Explicit `KAOLA_PATH=adaptive` (startup) **and** `claim --workflowPath adaptive` (cmdClaim) under an **OFF** switch each produce a **typed refusal** in `claimProject` — never a silent downgrade to `full` (#44).
- [ ] `claimProject` whitelists the persisted `workflow_path`: `{fast, full}` when OFF, `{fast, full, adaptive}` when ON — any other string is a typed refusal.
- [ ] A **adaptive prompt keyword alone never selects `adaptive`**: keyword-flagged adaptive without the §4b structure confirmation resolves to `full`; ties prefer `full`.
- [ ] The toggle gates **selection only**: an already-claimed adaptive project (frozen `workflow-plan.md`) **resumes to completion after the switch is flipped OFF**; `repair-state.js`/`routeAdaptive`, the two `claim.js` resume surfaces, and `kaola-workflow-plan-validator.js` all ignore the switch.
- [ ] Both `claim.js` resume surfaces emit the adaptive executor for an adaptive project: `resumeFallbackCommand`/`cmdResume` and the `writeState` next_command default emit `/kaola-workflow-plan-run {project}`, **not** `/kaola-workflow-phase{N}`.
- [ ] Reinstall/upgrade without `--enable-adaptive=yes` does **not** clobber an existing `enable_adaptive: true`, and never silently *grants* the freedom.
- [ ] `simulate-workflow-walkthrough.js` adds a toggle suite: OFF → adaptive never offered + 2-way preserved; OFF + `KAOLA_PATH=adaptive` startup → typed refusal; OFF + `claim --workflowPath adaptive` → typed refusal; ON → adaptive selectable; keyword-only adaptive without structure → resolves full; in-flight adaptive project **resumes via `claim.js resume`** after a mid-run flip to OFF and emits `/kaola-workflow-plan-run`, not `/kaola-workflow-phaseN`.

- [ ] **Read-only fan-out carve-out exists and is bounded by `FANOUT_CAP` alone.** `disjointWriteSets()` returns a defined PASS verdict on empty / role-namespaced write sets; read-only fan-out (`code-explorer`/`docs-lookup`/`planner`/`code-architect`/`code-reviewer`, and `security-reviewer` only when pinned review-only) is **not** clamped to 1 by the disjoint-group count; per-instance `.cache` and Node-Ledger rows are namespaced by `(node_id, instance)`. Worktree isolation is **not** required for read-only fan-out.
- [ ] **Orchestrator quorum/decision node** (`tally-fn ∈ {majority-refute, argmax-score}`): after a read-only fan-out, tallies N **schema-validated** child verdicts against a *static* threshold and emits exactly one accept/kill (or winner) decision node, deriving the count **solely** from durable per-child ledger rows so a crash mid-tally recomputes and never double-counts. Hard-depends on the `validateNodeOutput()` schema checkpoint.
- [ ] **adversarial-verify is add-only above the gate floor:** an adversarial-verify sub-graph relaxes no gate (G1–G5 unchanged), writes nothing to the repo, and cannot raise the risky trigger by itself; a **failed quorum** routes to a bounded self-repair loop or surfaces as a RISKY escalation.
- [ ] **N skeptic compliance rows obey the bare-role-string rule:** every `code-reviewer` (fallback) / `security-reviewer` skeptic instance keys its `## Required Agent Compliance` row with the **bare** role string (the anchored `DELEGATION_CONTROLLED_REQUIREMENTS` roles; `adversarial-verifier` is unanchored and unaffected); per-instance disambiguation in Evidence only; a validator asserts `delegationPolicyCompliance()` still fires on all N.
- [ ] **loop-until-dry convergence cap:** a script-decidable, evidence-only early-exit (normalised-finding-ID set-diff reaching a `dry_streak ≥ K`) terminates the loop at `min(K-dry, LOOP_CAP)`; the static `LOOP_CAP` remains mandatory; an agent-judged convergence predicate is a typed refusal.
- [ ] **Canonical adversarial-verify skeptic is `adversarial-verifier`** (dedicated, refute-by-default, write-free by manifest); `code-reviewer` is the fallback when `adversarial-verifier` is not installed; a `security-reviewer` skeptic fan-out is treated as a **write-role** fan-out (subject to `disjointWriteSets()`) **unless** pinned review-only in the post-dominator slot.

- [ ] **New sub-agent roles are installable** via a reviewed, parity-mirrored profile (`agents/<role>.md` + `.toml` twin per tree + `config/agents.toml` entry ×3 + a `resolve-agent-model.js` default ×4 copies), exactly like adding a skill — never an in-run agent action.
- [ ] **The validator is runtime-closed over the INSTALLED library**, not the literal nine: `kaola-workflow-plan-validator.js` rejects any node whose `role` is **not in the installed library** (consistent with the hard-reject criterion above). The agent cannot invent a role mid-run (#44).
- [ ] **A new role cannot satisfy or substitute for a gate:** post-dominance stays keyed only to `code-reviewer`/`security-reviewer`/`tdd-guide`; a new role is invisible to the post-dominance checks; no number of new-role nodes lets the agent route a gate around them. New roles are preferentially read-only (emit `.cache` evidence, zero repo writes) so the additive write surface stays limited to `tdd-guide`/`build-error-resolver`/`doc-updater`.
- [ ] **The existing nine are unchanged:** their profiles, models, and `resolve-agent-model` entries are not retuned or re-modelled (invariant #2 narrows to "the existing nine," not "exactly nine roles forever").

## Issue decomposition (proposed, staged)

The staging is **flexibility-first**: Tier 1 front-loads the hardest
engineering — free composition **including** within-issue `tdd-guide` fan-out
with real write concurrency — alongside the durable plan/ledger/resume
substrate, the inherited lifecycle frame, and risk-assessment governance.
Freedom that excludes fan-out is not the capability the user asked for, so it
is **not** deferred. (Fan-out is a Tier-1 *capability*; it still *surfaces for
approval* before running, because any write concurrency is blast-radius-risky — §5.)
Curated templates are **off the critical path** entirely — a non-binding future
convenience (§"Out of scope"), never a staging prerequisite.

| # | Title | Scope | Depends on | Labels |
|---|---|---|---|---|
| 1 | Plan/ledger substrate + validator + free composition incl `tdd-guide` fan-out + lifecycle inheritance + risk governance | `workflow-plan.md` + `## Node Ledger` + `plan_hash` schema; `kaola-workflow-plan-validator.js` (closed-library + **post-dominance** gates + caps + **disjointness** + the **risk-assessment marker scan**, sensitivity over-approximated from labels + declared write set, blast-radius from any write-role fan-out / `SHARED_INFRA` / file ceiling / loop); `isAdaptiveWorkflowState`/`projectHasAdaptivePlan`/`routeAdaptive` (traversal resume, ahead of phaseN ladder; consent-halt surfacing); `KAOLA_PATH=adaptive` in claim/router; bare-role-string gate rule; **free DAG authoring** (no template library); **within-issue `tdd-guide` fan-out** — `disjointWriteSets()` (new code) + **runtime** diff-vs-declared-allowlist on the single shared worktree + provisional auto-run revoked-at-barrier (the only genuine concurrency); classifier `module.exports` + `## Nodes` cross-issue read; **lifecycle inheritance** (claim/branch/worktree/Phase-6 sink as-is, only the adaptive-aware touches); **risk-assessment governance** (validator-pass → provably-low-risk provisional auto-run; any write-role fan-out/sensitivity/uncertainty → ask; runtime upgrade → revoke + halt-for-consent; out-of-grammar → typed refusal); full 4-tree parity + structural drift check on renamed forks; walkthrough fan-out-surfaces-for-approval / resume / crash / sequential-low-risk-auto / runtime-sensitivity-upgrade-halt / risky-ask / risk-uncertain-ask / typed-refusal / non-disjoint-demotion cases. | — | `enhancement`, `area:workflow-router`, `area:workflow-phases`, `area:scripts` |
| 2 | Novel sequence/linear composition polish + governance edge cases | Broaden free composition of `code-explorer`/`docs-lookup`/verification nodes (sequence/branch refinements); harden the risk-assessment edge cases (fail-closed-on-uncertain paths, provisional-authorization revocation corners); additional governance walkthrough cases. | 1 | `enhancement`, `area:workflow-router` |
| 3 | Headless-runtime research note (non-binding) | A deferred *study* only — measure whether a barrier-checkpointed headless runtime (Branch B) ever earns its resume risk; nothing in Tiers 1–2 depends on it. Curated-template convenience, if ever wanted, is filed here as opt-in, never on the critical path. | 1 | `enhancement`, `area:scripts` |

- **Tier 1 owns the toggle, the 3-way selection, AND real fan-out concurrency.**
  Tier 1 is the first (and only) tier that introduces `KAOLA_PATH=adaptive`
  into `claimProject`/router, so the switch must exist the moment `adaptive`
  becomes selectable — they cannot ship apart. Add to Tier 1 scope:
  `--enable-adaptive` flag + config field + `readOrCreateConfig` cosmetic
  default + 3-way Step 0a-1 (with keyword-flag-only rule) + the `claimProject`
  typed-refusal-when-OFF guard + value whitelist + **both adaptive-aware resume
  surfaces** (`writeState:287`, `resumeFallbackCommand:496`) + the
  OFF/refusal/keyword-conservatism/in-flight-resume walkthrough cases. Because
  flexibility is front-loaded, the hardest engineering (post-run diff-vs-
  allowlist write isolation for real fan-out concurrency) lands first, honestly
  — this is the deliberate flexibility-first cost.

## Out of scope (explicitly)

- **The nine canonical sub-agent role profiles, their models, the `resolve-agent-model`
  mechanism, and the delegation contract.** The existing nine are **unchanged** by this
  design — that is invariant #2 and a hard user constraint. The adaptive path
  *composes* the installed roles; the existing nine are neither retuned, re-modelled,
  nor removed. New roles MAY be added by maintainers via reviewed, parity-mirrored
  profiles (§"Extending the role library") — exactly like adding a skill, never an
  in-run agent action.
- **A curated template library.** Removed from the load-bearing path: a
  pre-vetted shape catalog defeats the purpose of free design and was never a
  correctness mechanism (only a human-pre-vetting-of-*shape* shortcut for
  authorization). A future opt-in convenience — a small library of
  human-authored plans the agent *may* start from — is permissible but
  **non-binding and out-of-scope here**; it would never be a prerequisite to
  free authoring, and it changes nothing about correctness, only convenience.
- **The literal headless Workflow-tool runtime as a runtime of record.**
  Rejected (Branch B); only its grammar/validator insight is adopted, on the
  Branch-A substrate. Keeping branches/worktrees/claim/finalize *requires*
  Branch A. A future tier may *measure* whether a headless runtime ever earns
  its resume risk, but nothing here depends on it.
- **A blanket auto-approval bypass for any plan.** Rejected as contradicting
  #44; governance is **risk-assessment only** (provisional auto-run on
  validator-pass + provably-low-risk, ask if risky/uncertain, revoke on a
  runtime upgrade). A future opt-in for a narrower low-risk subset (e.g.
  sensitivity=none + blast-radius=small) is permissible but out-of-scope here,
  and would never auto-approve a risky plan.
- **Nested `parallel`-within-`parallel`, arbitrary cyclic DAGs, and
  fan-out of loop nodes.** Not in the three-production grammar.
- **Cross-issue parallelism changes.** The existing worktree + classifier
  cross-folder model is unchanged; this design adds *within-issue*
  composition only (`docs/investigations/parallel-session-design.md` owns the
  cross-issue surface).
- **Retiring the fast/full command files.** They remain the literal
  executors for backward compatibility; `adaptive` is the general case beside
  them, not a replacement.
- **A per-repo or per-tier adaptive toggle.** The switch is **global and all-or-nothing** for the whole adaptive path (parallel to `parallel_mode`). A per-repo override (e.g. an optional field in `kaola-workflow/config.json`) and *gradual* per-tier enablement are explicitly out of scope; if ever needed, a per-repo override would *narrow* the global switch, never widen it.
- **True streaming `pipeline()` (in-process stage overlap), `loop-until-budget` (token/context-budget-scaled loop depth), and write-role judge-panel (N competing `tdd-guide` implementations raced and merged).** Rejected on **substrate** grounds, not grammar grounds: Branch A is sequential checkpointed dispatch with no in-process concurrency, **no token/context telemetry** (only `GITEA_TOKEN` exists; counts are not reconstructable from durable markdown, breaking resume), and no throwaway-worktree race / winner-merge / loser-discard mechanism over the single-writer ledger. Their *logical* halves translate (data-dependency ordering via `depends_on[]`; the loop *count* arm; the read-only design-form judge-panel); their concurrency/budget halves do not and must not be approximated. No per-edge join-policy annotation is added — `depends_on[]` already encodes needs-all vs stream and the annotation would be inert here.
