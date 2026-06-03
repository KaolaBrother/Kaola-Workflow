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

Load `workflow-plan.md`, re-check `plan_hash`, and re-validate **only**
closed-library membership + structural grammar + hash integrity (NOT the full
gate rubric — re-running it would brick an in-flight plan if the rubric tightened
after freeze):

```text
node scripts/kaola-gitlab-workflow-plan-validator.js kaola-workflow/{project}/workflow-plan.md --resume-check --json
```

Then parse the `## Node Ledger` and `workflow-state.md`:

- `escalated_to_full: consent` present → a provisional auto-run was **revoked at
  the barrier**; surface the pending approval for the user's explicit yes. Do not
  re-dispatch the `in_progress` node.
- A node `in_progress` with absent/partial `.cache/{node-id}.md` → crash mid-node;
  re-dispatch exactly that node (mirrors phase4 `in_progress → delegate`).
- Otherwise compute the **ready set**: every node whose `status != complete` and
  all of whose `depends_on` are `complete` **with resolved compliance**.

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
to a plan DAG:

1. **update-ledger** — mark the node `in_progress`.
2. **dispatch** the node's role. An implement node:

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
3. **verify** — read the node's `.cache/{node-id}.md` evidence. A `tdd-guide`
   node cannot transition to `complete` without both RED and GREEN evidence (or an
   explicit `n/a` skip reason). Count `test_thrash`: ≥ 3 consecutive same-test
   RED→RED cycles writes `escalated_to_full: test_thrash` and stops.
4. **barrier (commit order: `.cache` evidence → Node Ledger row → `workflow-state.md`
   pointer LAST).** Re-scan the files this node actually wrote. If a write turns
   out sensitive (a Phase-5 category) or overflows into a sensitive / `SHARED_INFRA`
   area on a plan that auto-ran, the provisional authorization was granted on a
   now-false premise: **revoke and halt for consent** — write `escalated_to_full:
   consent` AND force `security-reviewer` post-dominance (`escalated_to_full:
   security`). These co-occur — one barrier moment, two consequences. Diff each
   write-role fan-out instance's actual writes against its declared allowlist on
   the single shared worktree; an overflow outside the declared set fails the node.
5. **update-ledger** — mark `complete` (or `n/a`), emit the node's one
   `## Required Agent Compliance` row. For a `code-reviewer` / `security-reviewer`
   gate or skeptic row, key it with the **bare role string** (`code-reviewer`,
   `security-reviewer`); per-instance disambiguation goes in the Evidence column only
   (the canonical compliance-row format the full-path `delegationPolicyCompliance()`
   matcher expects). Never mark a gate row `n/a` while a node it post-dominates reached
   `complete` — a gate row must record a node that actually ran and produced a passing
   verdict.

> **Enforcement boundary (accepted limitation).** The validator enforces gate
> *presence* statically at freeze (post-dominance over the unique sink). Gate
> *execution* at runtime — the review actually running, the barrier re-scan +
> consent/security escalation, the actual-writes-vs-declared-allowlist diff, and the
> quorum tally — is **agent discipline on the adaptive path, not script-enforced**:
> `routeAdaptive` resumes without running the delegation matcher, and Phase 6 re-checks
> only structure + `plan_hash`. The steps above are therefore obligations, not
> guarantees — perform them. (Documented as a known limitation in the architecture docs.)

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
no `phase5-review.md`), then runs the unchanged sink (merge/MR, archive, close,
roadmap regen).
