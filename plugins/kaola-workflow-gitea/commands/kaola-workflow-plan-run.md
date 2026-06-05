---
description: Kaola-Workflow Adaptive Executor. Runs a frozen workflow-plan.md by traversing its DAG + Node Ledger, dispatching one role node at a time with per-node checkpoints. Resume-safe.
argument-hint: <project name>
---

# Kaola-Workflow Adaptive Executor (plan-run)

Executes a frozen `workflow-plan.md` for an adaptive project (`workflow_path:
adaptive`). The plan — authored by `/kaola-workflow-adapt` and frozen by the
validator — is the spine: the executor traverses its DAG + `## Node Ledger`
instead of the fixed phaseN ladder, dispatching one role node at a time and
checkpointing between calls. This is the Branch-A substrate: the agent freely
designed the *shape*; the harness owns the lifecycle frame, the computed gates,
and the durable resume contract.

The executor never re-authors the plan. The plan is author-immutable after
freeze, guarded by `plan_hash` (stored inside `workflow-plan.md`, re-checked on
every load). Tampering or an unparseable plan is a **typed refusal**, not a
silent fallback to the phaseN ladder.

## Goal Contract

Drive every node in the frozen `workflow-plan.md` to `complete` or `n/a` in its
`## Node Ledger`, honoring the computed gates over the DAG, then hand off to
Phase 6 (which anchors on the all-complete ledger, not a phaseN artifact). Stop
and surface for approval on any consent-halt or typed refusal.

## Agent Model Badge

Every subagent dispatch below includes an explicit `model=` line. Always pass it
exactly as written — it is what makes Claude Code show the model badge on the
subagent card. The installer fills each `model="{...}"` placeholder with the
agent's frontmatter model. For a dynamically-dispatched node whose role is not
one of the placeholder examples below, resolve its model with
`scripts/kaola-workflow-resolve-agent-model.js <role>` and pass that exact value
on the `model=` line — never omit it.

## Resume Detection

On entry (and on every resume), the main session **summons the `contractor`** to re-orient: the
contractor runs the integrity + readiness scripts and reports the durable markers; the main session
reads that report and **judges** which resume branch applies. The main session never runs these
scripts itself — but the judgment is always its own.

You MUST pass `model="{CONTRACTOR_MODEL}"` in this Agent call exactly as shown — do not omit the
`model=` line.

```text
Agent(
  subagent_type="contractor",
  model="{CONTRACTOR_MODEL}",
  description="Adaptive orient {project}",
  prompt="Re-orient the frozen plan for {project}; run scripts + report markers, do NOT judge or clear anything. Run `kaola-gitea-workflow-plan-validator.js kaola-workflow/{project}/workflow-plan.md --resume-check --json` — re-check `plan_hash` + closed-library membership + structural grammar + hash integrity ONLY (NOT the full gate rubric — re-running it would brick an in-flight plan if the rubric tightened after freeze) — and `kaola-gitea-workflow-next-action.js kaola-workflow/{project}/workflow-plan.md --json` (ready set, next node with resolved `model`, `allDone`). Then read the `## Node Ledger` + `workflow-state.md` and REPORT VERBATIM: both JSON outputs in full; whether `escalated_to_full: consent` is in `workflow-state.md` OR `consent_halt: pending` is in the `## Node Ledger`; any node at `status: in_progress` and, for it, whether `.cache/{node-id}.md` is absent / partial / complete and whether its barrier has already run. Re-derive your own kaola_script. Capture real exit codes; never gate on a piped | tail. Do NOT judge, dispatch, or clear any marker."
)
```

The main session then **judges** the resume branch from the contractor's report:

- a consent-halt — signalled by EITHER `escalated_to_full: consent` in
  `workflow-state.md` OR `consent_halt: pending` in the plan's `## Node Ledger`
  (#234; the Ledger marker is non-hashed and survives a lost/regenerated state
  file) — means a provisional auto-run was **revoked at the barrier**; surface the
  pending approval for the user's explicit yes and do NOT re-dispatch the
  `in_progress` node. On the user's explicit approval, summon the contractor to REMOVE the
  `consent_halt: pending` line from the `## Node Ledger` AND clear
  `escalated_to_full: consent` from `workflow-state.md` in lockstep, then resume the
  ready set — never re-ask an authorization already granted.
- A node `in_progress` with **absent/partial** `.cache/{node-id}.md` → crash mid-node before the
  role finished; re-dispatch exactly that role node (mirrors phase4 `in_progress → delegate`). The
  advance bracket's `--record-base` is **idempotent** (#239) — the original node-start baseline is
  reused, not re-snapshotted, so a crashed attempt's writes stay visible to the barrier.
- A node `in_progress` with **complete** `.cache/{node-id}.md` but the barrier not yet run / the node
  not yet marked `complete` → crash AFTER the role finished but before the commit bracket: **re-run
  the commit bracket (step 3) only — do NOT re-dispatch the role**, which would redo the role's
  possibly-non-idempotent writes. The idempotent baseline still anchors the barrier diff.
- Otherwise the ready set from `next-action` (each node already carrying its resolved `model`) drives
  the loop: every node whose `status != complete` and all of whose `depends_on` are `complete`
  **with resolved compliance**.

## Governance — auto-run only when provably low-risk, else ask

The validator classifies the frozen plan once. Re-read its verdict
(`--json`); do not re-derive risk by hand.

- **in-grammar + provably low-risk → auto-run.** Sequential, no write-role
  fan-out, declared write set outside every Phase-5 area, no `SHARED_INFRA`,
  under the file ceiling, no loop. This authorization is **provisional**.
- **in-grammar + risky or uncertain → ask the user first** (ExitPlanMode-style:
  surface the DAG + validator report + risk findings; freeze only on an explicit
  yes). Risky = any sensitivity (frozen labels OR declared write set touch
  auth / payments / user data / filesystem / external-API / secrets), any
  WRITE-ROLE fan-out (N ≥ 2), a `SHARED_INFRA` touch, over the file ceiling, a
  bounded loop, or any uncertainty (**fail closed**). Read-only
  verification/research fan-out is zero-blast-radius and does **not** trigger ask.
- **out-of-grammar → typed refusal.** Unknown role, a gate routed around, a cap
  busted, or a non-disjoint write-role fan-out. Never silently clamp.

## Per-Node Loop

For each ready node, run the Phase-4-style loop, generalized from a phase ladder
to a plan DAG. The main session **owns the loop and dispatches the role** (a subagent cannot
dispatch a subagent, so the dispatch and the loop control flow stay with the orchestrator); it
**summons the `contractor`** for the mechanical brackets around the role dispatch — running the
scripts and writing the durable ledger/state — and **judges** the barrier outcome. The main
session never runs the loop scripts itself.

You MUST pass `model="{CONTRACTOR_MODEL}"` in the contractor Agent calls below exactly as shown.

1. **advance (contractor bracket)** — the contractor opens the next ready node:
   ```text
   Agent(
     subagent_type="contractor",
     model="{CONTRACTOR_MODEL}",
     description="Adaptive advance {project}",
     prompt="Open the next ready node for {project}; run scripts + write the in_progress row, do NOT dispatch/judge/run the barrier. Run `kaola-gitea-workflow-next-action.js kaola-workflow/{project}/workflow-plan.md --json` and report its full JSON (ready set, next node, each node's resolved `model`, `allDone`). For the next ready node, mark it `in_progress` in the `## Node Ledger` and record its per-instance write baseline by running `kaola-gitea-workflow-commit-node.js kaola-workflow/{project}/workflow-plan.md --node-id {node-id} --start --json` — record-base runs ONLY at node start and is **idempotent** (#239); an end-time baseline would neuter the barrier. Re-derive your own kaola_script. Capture real exit codes; never gate on a piped | tail. Return the next-action JSON + the node you opened."
   )
   ```
   If the contractor reports `allDone` (every ledger row `complete`/`n/a`), route to Phase 6
   (Completion below) — there is no node to dispatch.
2. **dispatch** the node's role (main session — see above). Use the `model` the contractor resolved
   for the node. An implement node:

You MUST pass `model="{TDD_GUIDE_MODEL}"` in this Agent call exactly as shown —
do not omit the `model=` line.

```text
Agent(
  subagent_type="tdd-guide",
  model="{TDD_GUIDE_MODEL}",
  description="Adaptive node {node-id} {project}",
  prompt="Implement node {node-id}. Declared write set: {declared_write_set}. RED→GREEN required."
)
```

   A review gate node:

You MUST pass `model="{CODE_REVIEWER_MODEL}"` in this Agent call exactly as shown.

```text
Agent(
  subagent_type="code-reviewer",
  model="{CODE_REVIEWER_MODEL}",
  description="Adaptive review {project}",
  prompt="Review the changes produced by the implement nodes this gate post-dominates."
)
```

   A routed fix (a failing gate, a thrashing test):

You MUST pass `model="{BUILD_ERROR_RESOLVER_MODEL}"` in this Agent call exactly as shown.

```text
Agent(
  subagent_type="build-error-resolver",
  model="{BUILD_ERROR_RESOLVER_MODEL}",
  description="Adaptive fix {project}",
  prompt="Resolve the failure recorded in the ledger for node {node-id}."
)
```

   A read-only fan-out instance (e.g. an `adversarial-verifier` skeptic, or any
   other read-only role) is dispatched the same way, one instance at a time, with
   `subagent_type` set to the node's role and `model=` resolved via
   `scripts/kaola-workflow-resolve-agent-model.js`. Per-instance evidence is
   namespaced `.cache/{role}-{claim-id}.md` so siblings never collide.
3. **commit (contractor bracket)** — after the role returns, the contractor verifies the evidence,
   runs the barrier (commit order: `.cache` evidence → Node Ledger row → `workflow-state.md` pointer
   LAST), and **only on a clean barrier** closes the node:
   ```text
   Agent(
     subagent_type="contractor",
     model="{CONTRACTOR_MODEL}",
     description="Adaptive commit {project}",
     prompt="Close node {node-id} for {project} in commit order (`.cache` evidence → `## Node Ledger` row → `workflow-state.md` pointer LAST); run scripts + write the durable rows, do NOT judge sufficiency or write any escalation marker. (a) Read `.cache/{node-id}.md` and report whether BOTH RED and GREEN evidence are present (a `tdd-guide` node cannot transition to `complete` without both, or an explicit `n/a` skip reason) and the `test_thrash` count (consecutive same-test RED→RED cycles). (b) Run the PER-INSTANCE barrier `kaola-gitea-workflow-commit-node.js kaola-workflow/{project}/workflow-plan.md --node-id {node-id} --json` and report its exit code — the re-scan of the files this node actually wrote is **script-enforced** (#231), not prose; with `--node-id` it diffs against the node's step-1 recorded base (exactly THIS node's writes, #239) and checks them against the node's OWN declared write set, so a fan-out instance that overflows into a SIBLING's lane is refused (the whole-plan barrier in Phase 6 remains the union-level floor). (c) ONLY IF the barrier exits 0 AND RED+GREEN evidence is present (or a valid `n/a`): mark the node `complete` (or `n/a`) and emit its one `## Required Agent Compliance` row — for a `code-reviewer`/`security-reviewer` gate or skeptic row, key it with the **bare role string** (`code-reviewer`, `security-reviewer`); per-instance disambiguation goes in the Evidence column only (the canonical compliance-row format the full-path `delegationPolicyCompliance()` matcher expects). Never mark a gate row `n/a` while a node it post-dominates reached `complete` — a gate row must record a node that actually ran and produced a passing verdict. If the barrier exits 1, or `test_thrash` ≥ 3, or evidence is missing: do NOT mark the node `complete` — report the condition and stop. Re-derive your own kaola_script. Capture real exit codes; never gate on a piped | tail. Do NOT dispatch a role, judge sufficiency, write any `escalated_to_full`/`consent_halt` marker, or ask the user."
   )
   ```
4. **judge the barrier (main session — governance).** Read the contractor's commit report:
   - barrier exit 0 + RED+GREEN evidence (or valid `n/a`) → the node is `complete`; continue the
     loop (back to step 1). Do not treat a node as `complete` until the barrier exits 0.
   - barrier exit 1 (a write turned out sensitive — a Phase-5 category — on a plan with no
     `security-reviewer` node, or overflowed outside the declared allowlist): the **provisional**
     authorization was granted on a now-false premise. **Revoke and halt for consent** — this
     **decision** is yours (the contractor is never a gate); summon the contractor to write
     `escalated_to_full: consent` AND force `security-reviewer` post-dominance
     (`escalated_to_full: security`) into `workflow-state.md`, AND write the durable line
     `consent_halt: pending` into the plan's `## Node Ledger` (#234: a non-hashed section, so the
     halt survives a lost/regenerated `workflow-state.md`; never write into `## Meta` / `## Nodes`)
     — then surface the pending approval. You decide; the contractor transcribes the consequence.
   - `test_thrash` ≥ 3 consecutive same-test RED→RED cycles → escalate the same way
     (`escalated_to_full: test_thrash`) and stop.

> **Enforcement boundary (#231 — now script-enforced).** Gate *presence* is proven
> statically at freeze (post-dominance over the unique sink). Gate *execution* is now
> proven by `--gate-verify`: a **completed** reviewer must post-dominate every
> completed code/sensitive node in the `## Node Ledger` (closes the G1/H5 leak where a
> reviewer is marked `n/a` at runtime). It is wired into `routeAdaptive` (surfaced as
> `pendingGates`, non-blocking on resume) and enforced as a **hard merge gate** in
> Phase 6. The actual-writes re-scan + sensitive/allowlist refusal is `--barrier-check`
> (per-node in step 4 above, and whole-plan in Phase 6). Only the quorum tally and the
> `validateNodeOutput` schema checkpoints remain agent-discipline prose — perform those;
> the gate execution and the write barrier are guaranteed by the validator scripts.

## Quorum / decision nodes (read-only fan-out)

After a read-only fan-out (e.g. adversarial-verify), an orchestrator
**quorum/decision** node tallies the N schema-validated child verdicts against a
*static* threshold (`tally-fn` ∈ {`majority-refute`, `argmax-score`}) and emits
exactly one accept/kill (or winner) decision. The count is derived **solely** from
the durable per-child ledger rows (recomputed on resume — never an in-memory
counter), and each child verdict passes a `validateNodeOutput()` schema checkpoint
before it is tallied. A failed quorum (majority refute) routes the claim into a
bounded self-repair loop or surfaces as a RISKY escalation — it never drops a wall
and never auto-approves. A `loop-until-dry` body terminates on a script-decidable
`dry_streak` convergence cap layered under the mandatory static `LOOP_CAP`.

## Caps

`FANOUT_CAP` (default 4, env `KAOLA_FANOUT_CAP`) bounds fan-out width; for
write-role fan-out, additionally ≤ the number of declared disjoint groups.
`test_thrash` ≥ 3, file overflow declared+1 / absolute backstop of 6 files, and
the static loop bound are enforced per node at the barrier.

## Completion

When every ledger row is `complete` or `n/a`, route to Phase 6:

```text
/kaola-workflow-phase6 {project}
```

Phase 6 anchors on the frozen plan + all-complete ledger (adaptive projects have
no `phase5-review.md`), then runs the unchanged sink (merge/PR, archive, close,
roadmap regen).
