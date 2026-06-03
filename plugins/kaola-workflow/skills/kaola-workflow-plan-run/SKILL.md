---
name: kaola-workflow-plan-run
description: Use when executing a frozen adaptive workflow-plan.md — traverse its DAG + Node Ledger, dispatching one role node at a time with per-node checkpoints. Resume-safe. Mirror of commands/kaola-workflow-plan-run.md for Codex runtime.
---

# Skill: kaola-workflow-plan-run

Adaptive executor. Runs a frozen `workflow-plan.md` (`workflow_path: adaptive`) by
traversing its DAG + `## Node Ledger` instead of the fixed phaseN ladder, dispatching
one role node at a time and checkpointing between calls. Mirror of
`commands/kaola-workflow-plan-run.md` for the Codex runtime. Reads and updates
`kaola-workflow/{project}/workflow-state.md` throughout.

The plan is author-immutable after freeze, guarded by `plan_hash` (stored inside
`workflow-plan.md`, re-checked every load). A tampered or unparseable plan is a **typed
refusal**, never a silent fallback to the phaseN ladder.

## Resume Detection

Load `workflow-plan.md`, re-check `plan_hash`, and re-validate **only** closed-library
membership + structural grammar + hash integrity (NOT the full gate rubric — re-running
it would brick an in-flight plan if the rubric tightened after freeze):

```bash
node "$KAOLA_SCRIPTS/kaola-workflow-plan-validator.js" kaola-workflow/{project}/workflow-plan.md --resume-check --json
```

Then parse the `## Node Ledger` and `workflow-state.md`:
- a consent-halt — EITHER `escalated_to_full: consent` in `workflow-state.md` OR
  `consent_halt: pending` in the plan's `## Node Ledger` (#234; non-hashed, survives a
  lost state file) → a provisional auto-run was **revoked at the barrier**; surface the
  pending approval for the user's explicit yes, do NOT re-dispatch. On approval, REMOVE
  the Ledger marker AND clear `escalated_to_full: consent` in lockstep, then resume.
- a node `in_progress` with absent/partial `.cache/{node-id}.md` → crash mid-node;
  re-dispatch exactly that node.
- otherwise compute the **ready set**: nodes whose `status != complete` and all of whose
  `depends_on` are `complete` with resolved compliance.

## Governance — auto-run only when provably low-risk, else ask

Re-read the validator verdict (`--json`); do not re-derive risk by hand.
- **in-grammar + provably low-risk → auto-run** (sequential, no write-role fan-out,
  declared write set outside every Phase-5 area, no `SHARED_INFRA`, under the file
  ceiling, no loop). This authorization is **provisional**.
- **in-grammar + risky or uncertain → ask the user first** (surface the DAG + validator
  report + risk findings). Risky = any sensitivity (labels OR declared write set touch
  auth / payments / user data / filesystem / external-API / secrets), any WRITE-ROLE
  fan-out (N ≥ 2), `SHARED_INFRA`, over the file ceiling, a bounded loop, or any
  uncertainty (**fail closed**). Read-only verification/research fan-out is
  zero-blast-radius and does **not** trigger ask.
- **out-of-grammar → typed refusal** (unknown role, a gate routed around, a cap busted,
  a non-disjoint write-role fan-out).

## Per-Node Loop

For each ready node: update-ledger (`in_progress`) → dispatch the node's role (Codex
delegates to the matching agent profile; resolve its model via
`kaola-workflow-resolve-agent-model.js`) → verify `.cache/{node-id}.md` (a `tdd-guide`
node needs RED then GREEN; count `test_thrash` ≥ 3 same-test cycles → escalate) →
**barrier (commit order `.cache` → Node Ledger row → `workflow-state.md` pointer LAST)**
→ update-ledger (`complete`/`n/a`, emit one `## Required Agent Compliance` row).

At node START (with the `in_progress` mark) record this node's per-instance write baseline (#239),
so the barrier diffs exactly THIS node's writes (nodes run one at a time):

```bash
node "$KAOLA_SCRIPTS/kaola-workflow-plan-validator.js" kaola-workflow/{project}/workflow-plan.md --record-base --node-id {node-id}
```

At the barrier, re-scan the files the node actually wrote — **script-enforced** (#231/#239). With
`--node-id` this is the PER-INSTANCE barrier: it diffs against the recorded base and checks the node's
OWN declared lane, so a fan-out instance overflowing into a SIBLING's lane is refused (Phase 6's
whole-plan barrier stays the union-level floor):

```bash
node "$KAOLA_SCRIPTS/kaola-workflow-plan-validator.js" kaola-workflow/{project}/workflow-plan.md --barrier-check --node-id {node-id} --json; BC=$?
```

On exit 1 (a write turned out sensitive — a Phase-5 category — on a plan with no
`security-reviewer` node, or overflowed outside the declared allowlist) the provisional
authorization was granted on a now-false premise: **revoke and halt for consent** — write
`escalated_to_full: consent` AND force a `security-reviewer` to post-dominate every
remaining sensitive node (`escalated_to_full: security`), into `workflow-state.md`, AND
write the durable line `consent_halt: pending` into the plan's `## Node Ledger` (#234: a
non-hashed section, so the halt survives a lost/regenerated `workflow-state.md`). These
co-occur. (A `code-reviewer` must already post-dominate every implement node, and
`security-reviewer` every sensitive node — the validator computes these from the topology;
the executor never drops them.)

**Gate compliance rows for `code-reviewer`/`security-reviewer` use the bare role string**
(the canonical compliance-row format the full-path anchored delegation matcher expects);
per-instance disambiguation goes in the Evidence column only. Never mark a gate row `n/a`
while a node it post-dominates reached `complete`.

> **Enforcement boundary (#231 — now script-enforced).** Gate *presence* is proven
> statically at freeze (post-dominance over the unique sink). Gate *execution* is proven by
> `--gate-verify` (a **completed** reviewer must post-dominate every completed code/sensitive
> node in the `## Node Ledger` — closes the G1/H5 leak where a reviewer is marked `n/a`),
> wired into `routeAdaptive` (surfaced as `pendingGates`, non-blocking on resume) and enforced
> as a hard merge gate in finalize; the actual-writes re-scan + sensitive/allowlist refusal is
> `--barrier-check`. Only the quorum tally and `validateNodeOutput` remain agent discipline —
> perform those; gate execution and the write barrier are guaranteed by the validator.

## Quorum / decision nodes (read-only fan-out)

After a read-only fan-out (e.g. adversarial-verify with `adversarial-verifier` skeptics),
an orchestrator **quorum/decision** node tallies N schema-validated child verdicts
against a *static* threshold (`tally-fn` ∈ {`majority-refute`, `argmax-score`}) and emits
one accept/kill (or winner) decision, derived solely from the durable per-child ledger
rows (recomputed on resume), each gated by a `validateNodeOutput()` schema checkpoint. A
failed quorum routes to a bounded self-repair loop or surfaces as a RISKY escalation — it
never drops a wall. `loop-until-dry` terminates on a `dry_streak` convergence cap under
the mandatory static `LOOP_CAP`.

## Caps

`FANOUT_CAP` (default 4, env `KAOLA_FANOUT_CAP`), `test_thrash` ≥ 3, file overflow
declared+1 / absolute backstop of 6, the static loop bound — enforced per node at the barrier.

## Completion

When every ledger row is `complete` or `n/a`, route to `kaola-workflow-finalize {project}`
(adaptive runs have no `phase5-review.md`; finalize anchors on the all-complete plan).
