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

## Adaptive Worktree

At the very start of plan-run — before the first contractor delegation — resolve the provisioned
worktree path and, when it differs from the current directory, mirror the project folder into the
worktree once so that all node dispatches operate with their working directory inside the worktree.

```bash
# Resolve linked worktree path from workflow-state.md (Codex: uses KAOLA_PROJECT env var)
ACTIVE_WORKTREE_PATH="$(node -e "try{const fs=require('fs');const s=fs.readFileSync('kaola-workflow/' + process.env.KAOLA_PROJECT + '/workflow-state.md','utf8');const m=s.match(/^worktree_path:\\s*(.+)$/m);process.stdout.write(m?m[1].trim():'');}catch(e){}" 2>/dev/null)" || true
[ -z "$ACTIVE_WORKTREE_PATH" ] && ACTIVE_WORKTREE_PATH="$(pwd)"
```

When `worktree_path` is absent or empty (e.g. `KAOLA_WORKTREE_NATIVE=0`, offline, no-git, or this
very issue's own adaptive run which has `worktree_path: ''`), the fallback sets
`ACTIVE_WORKTREE_PATH` to the repo root — the orchestrator behaves EXACTLY as before this change.
The mirror below is SKIPPED in that case.

```bash
# One-time main→worktree project-folder mirror (skipped when paths are equal / repo-root run)
if [ "$ACTIVE_WORKTREE_PATH" != "$(pwd)" ]; then
  mkdir -p "$ACTIVE_WORKTREE_PATH/kaola-workflow/${KAOLA_PROJECT}/"
  cp -R "kaola-workflow/${KAOLA_PROJECT}/." "$ACTIVE_WORKTREE_PATH/kaola-workflow/${KAOLA_PROJECT}/"
fi
```

This copies the project folder (workflow-plan.md + Node Ledger + `.cache/`) into the worktree once
at start. From this point pass `Working directory: ${ACTIVE_WORKTREE_PATH}` to EVERY contractor and
role delegation below. The relative plan paths remain relative (relative + cwd is the mechanism; do
NOT switch to absolute paths); with cwd == worktree they resolve to the worktree copy. When
`ACTIVE_WORKTREE_PATH == $(pwd)` (repo-root fallback), the `Working directory:` line is harmless
and the orchestrator behaves exactly as today.

## Resume Detection

On entry (and on every resume), **delegate the re-orientation to the mechanical `contractor`
Codex agent role when that subagent is available** — it runs the integrity + readiness scripts and
reports the durable markers; the current session **judges** which resume branch applies and never
runs these scripts itself. Pass `Working directory: ${ACTIVE_WORKTREE_PATH}` to the contractor.
The contractor runs `node "$KAOLA_SCRIPTS/kaola-workflow-plan-validator.js"
kaola-workflow/{project}/workflow-plan.md --resume-check --json` (re-check `plan_hash` + closed-library
membership + structural grammar + hash integrity ONLY — NOT the full gate rubric, which would brick an
in-flight plan if the rubric tightened after freeze) and `node "$KAOLA_SCRIPTS/kaola-workflow-next-action.js"
kaola-workflow/{project}/workflow-plan.md --json` (ready set, next node with resolved `model`, `allDone`),
then reports the `## Node Ledger` + `workflow-state.md` markers verbatim. It never judges, dispatches, or
clears a marker.

The current session then **judges** the resume branch:
- a consent-halt — EITHER `escalated_to_full: consent` in `workflow-state.md` OR
  `consent_halt: pending` in the plan's `## Node Ledger` (#234; non-hashed, survives a
  lost state file) → a provisional auto-run was **revoked at the barrier**; surface the
  pending approval for the user's explicit yes, do NOT re-dispatch. On approval, have the contractor
  REMOVE the Ledger marker AND clear `escalated_to_full: consent` in lockstep, then resume.
- a node `in_progress` with **absent/partial** `.cache/{node-id}.md` → crash mid-node before the role
  finished; re-dispatch exactly that role node. The advance bracket's `--record-base` is **idempotent**
  (#239) — the original baseline is reused, so a crashed attempt's writes stay visible to the barrier.
- a node `in_progress` with **complete** `.cache/{node-id}.md` but the barrier not yet run / the node not
  yet marked `complete` → crash AFTER the role finished but before the commit bracket: **re-run the commit
  bracket only — do NOT re-dispatch the role** (which would redo non-idempotent writes).
- the plan is authored but NOT frozen (`--resume-check` refused with `plan_hash missing` — a prior
  `kaola-workflow-adapt` exited before freezing): do NOT run the loop; route to `kaola-workflow-adapt
  {project}` to complete Govern + freeze (adapt re-enters at freeze), then resume here once frozen.
- otherwise the ready set from `next-action` (each node carrying its resolved `model`) drives the loop:
  nodes whose `status != complete` and all of whose `depends_on` are `complete` with resolved compliance.
  When no node is `in_progress` (e.g. a crash between a node's commit and its fused advance left the next
  node unopened), **re-enter at step 1** to open the next ready node.

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

The current session **owns the loop and dispatches the role** (a subagent cannot dispatch a
subagent); it **delegates the mechanical brackets around each role dispatch to the `contractor`
Codex agent role when that subagent is available** — running the scripts and writing the durable
ledger/state — and **judges** the barrier outcome. It never runs the loop scripts itself.

**Task list = the workflow nodes.** The session keeps a task list with one item per `## Nodes` row
(`id · role`, in `depends_on` order) — established by `kaola-workflow-adapt` after freeze, or, on a
direct resume, reconstructed here from the `## Node Ledger`. Mark a node's task `in_progress` when
its role is dispatched (after the advance bracket) and `completed` once its barrier passes in the
commit step (`n/a` → skipped). The task list is a live mirror; the durable `## Node Ledger` stays the
single source of truth, so reconcile to the ledger on every resume rather than trusting a stale list.

The commit of a node and the advance to the next are **fused into ONE contractor call** (step 3) so the
contractor is summoned **once** per node transition, not twice. Step 1 only bootstraps the first node;
thereafter the loop cycles step 2 → 3 → 4 → 2.

1. **advance — open the next ready node when none is `in_progress` (contractor)** — run this to
   bootstrap the first node, and on resume to open the next ready node **whenever no node is
   `in_progress`** (a never-opened first node, or one orphaned by a crash between a node's commit and
   its fused advance); every later advance is fused into step 3, so do not re-run it while a node is
   already `in_progress`. Pass `Working directory: ${ACTIVE_WORKTREE_PATH}` to the contractor. The
   contractor runs `node "$KAOLA_SCRIPTS/kaola-workflow-next-action.js"
   kaola-workflow/{project}/workflow-plan.md --json` (reports ready set / next node / resolved `model` /
   `allDone`), then for the next ready node marks it `in_progress` in the `## Node Ledger` and records its
   per-instance write baseline with `node "$KAOLA_SCRIPTS/kaola-workflow-commit-node.js"
   kaola-workflow/{project}/workflow-plan.md --node-id {node-id} --start --json` (record-base ONLY at node
   start — **idempotent** #239; an end-time baseline would neuter the barrier). If `allDone`, route to finalize.
2. **dispatch** the node's role (current session — Codex delegates to the matching agent profile; resolve
   its model via `kaola-workflow-resolve-agent-model.js`). Pass `Working directory:
   ${ACTIVE_WORKTREE_PATH}` to every role delegation (tdd-guide, code-reviewer, build-error-resolver,
   read-only fan-out, or any dynamically-resolved role) so the relative plan path resolves inside the
   worktree. When `ACTIVE_WORKTREE_PATH == $(pwd)` (repo-root fallback), the line is harmless.
3. **commit + advance (contractor)** — after the role returns, pass `Working directory:
   ${ACTIVE_WORKTREE_PATH}` to the contractor. The contractor reads `.cache/{node-id}.md` (a
   `tdd-guide` node needs RED then GREEN; an `implementer` node needs a recorded `non_tdd_reason` and a
   passing change-type-appropriate check — regression-green / build-green / executable smoke-integration —
   in place of RED→GREEN; counts `test_thrash` ≥ 3 same-test cycles), runs the PER-INSTANCE
   barrier `node "$KAOLA_SCRIPTS/kaola-workflow-commit-node.js" kaola-workflow/{project}/workflow-plan.md
   --node-id {node-id} --json` (re-scans the files the node actually wrote — **script-enforced** #231/#239 —
   diffing the recorded base against the node's OWN declared lane, so a fan-out instance overflowing into a
   SIBLING's lane is refused; Phase 6's whole-plan barrier stays the union-level floor), and ONLY IF the
   barrier exits 0 with RED+GREEN evidence for a `tdd-guide` node (or recorded `non_tdd_reason` + passing
   change-type-appropriate check for an `implementer` node, or a valid `n/a`) marks the node `complete`/`n/a`
   and emits one **`## Required Agent Compliance`** row. Gate compliance rows for `code-reviewer`/`security-reviewer` use
   the **bare role string** (the canonical compliance-row format the full-path anchored delegation matcher
   expects); per-instance disambiguation goes in the Evidence column only. Never mark a gate row `n/a` while
   a node it post-dominates reached `complete`. **Selector routing (ONLY when `selectorCheck.isSelector === true` and `selectorCheck.ok === true`):** read `selectorCheck.armsToNa` from the barrier JSON. For each arm-id in that list, write its `## Node Ledger` row to `n/a` with note `selected: <selectorCheck.selected> (not this arm)`. These writes MUST precede the fused advance so `next-action` sees them as TERMINAL. If `selectorCheck.ok === false` (missing/foreign selector), do NOT mark any arm — report and stop (the orchestrator owns the halt). Non-selector nodes (`selectorCheck.isSelector === false`) require no action. **Then, ONLY IF the barrier exited 0** (the node is now
   `complete`/`n/a`), the contractor FUSES the next advance in the SAME call — re-runs `node
   "$KAOLA_SCRIPTS/kaola-workflow-next-action.js" kaola-workflow/{project}/workflow-plan.md --json` and, if
   a next ready node exists, opens it (`in_progress` + `kaola-workflow-commit-node.js --node-id {next}
   --start --json`, idempotent #239), reporting the node opened or `allDone`. On a failed barrier /
   `test_thrash` ≥ 3 / missing evidence it does NOT advance. The contractor never judges sufficiency or
   writes an escalation marker.
4. **judge the barrier (current session — governance).** On barrier exit 0 the node is `complete` and, per
   the fused advance, the next ready node is already open — dispatch it (back to step 2), or route to
   finalize on `allDone`. On barrier exit 1 (a write turned out sensitive —
   a Phase-5 category — on a plan with no `security-reviewer` node, or overflowed outside the declared
   allowlist) the provisional authorization was granted on a now-false premise:
   **revoke and halt for consent** — this **decision** is the session's (the contractor is never a gate);
   have the contractor write
   `escalated_to_full: consent` AND force a `security-reviewer` to post-dominate every remaining sensitive
   node (`escalated_to_full: security`) into `workflow-state.md`, AND write the durable line
   `consent_halt: pending` into the plan's `## Node Ledger` (#234: a non-hashed section, so the halt survives
   a lost/regenerated `workflow-state.md`). `test_thrash` ≥ 3 escalates the same way. (A `code-reviewer` must
   already post-dominate every implement node, and `security-reviewer` every sensitive node — the validator
   computes these from the topology; the executor never drops them.)

> **Enforcement boundary (#231 — now script-enforced).** Gate *presence* is proven
> statically at freeze (post-dominance over the unique sink). Gate *execution* is proven by
> `--gate-verify` (a **completed** reviewer must post-dominate every completed code/sensitive
> node in the `## Node Ledger` — closes the G1/H5 leak where a reviewer is marked `n/a`),
> wired into `routeAdaptive` (surfaced as `pendingGates`, non-blocking on resume) and enforced
> as a hard merge gate in finalize; the actual-writes re-scan + sensitive/allowlist refusal is
> `--barrier-check`. --verdict-check (#251) now script-enforces the reviewer/skeptic verdict
> (informational per-node, BLOCKING in finalize); what remains agent-discipline is the quorum
> tally count and dry_streak counting; gate presence, execution, barrier, and verdict are all script-guaranteed.

## Quorum / decision nodes (read-only fan-out)

After a read-only fan-out (e.g. adversarial-verify with `adversarial-verifier` skeptics),
an orchestrator **quorum/decision** node tallies N schema-validated child verdicts
against a *static* threshold (`tally-fn` ∈ {`majority-refute`, `argmax-score`}) and emits
one accept/kill (or winner) decision, derived solely from the durable per-child ledger
rows (recomputed on resume), each a `verdict: pass|fail` block in `.cache` mechanically
checked by --verdict-check (#251) — there is no `validateNodeOutput()` script; that schema
checkpoint was never script-enforced. The tally arithmetic is prose, not a script. A
failed quorum routes to a bounded self-repair loop or surfaces as a RISKY escalation — it
never drops a wall. `loop-until-dry` terminates on static LOOP_CAP (script-enforced)
plus an agent-tracked dry_streak (orchestrator counts no-change cycles; only LOOP_CAP is validator-enforced).

## Caps

`FANOUT_CAP` (default 4, env `KAOLA_FANOUT_CAP`), `test_thrash` ≥ 3, file overflow
declared+1 / absolute backstop of 6, the static loop bound — enforced per node at the barrier.

## Completion

When every ledger row is `complete` or `n/a`, route to `kaola-workflow-finalize {project}`
(adaptive runs have no `phase5-review.md`; finalize anchors on the all-complete plan).
