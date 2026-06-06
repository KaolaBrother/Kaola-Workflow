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

## Adaptive Worktree

At the very start of plan-run — before the first contractor dispatch — resolve the provisioned
worktree path and, when it differs from the current directory, mirror the project folder into the
worktree once so that all node dispatches operate with their working directory inside the worktree.

```bash
# Resolve linked worktree path from workflow-state.md
ACTIVE_WORKTREE_PATH="$(node -e "try{const fs=require('fs');const s=fs.readFileSync('kaola-workflow/{project}/workflow-state.md','utf8');const m=s.match(/^worktree_path:\\s*(.+)$/m);process.stdout.write(m?m[1].trim():'');}catch(e){}" 2>/dev/null)" || true
[ -z "$ACTIVE_WORKTREE_PATH" ] || [ ! -d "$ACTIVE_WORKTREE_PATH" ] && ACTIVE_WORKTREE_PATH="$(pwd)"
```

When `worktree_path` is absent or empty (e.g. `KAOLA_WORKTREE_NATIVE=0`, offline, no-git, or this
very issue's own adaptive run which has `worktree_path: ''`), the resolver yields an empty string
and the fallback sets `ACTIVE_WORKTREE_PATH` to the repo root — the orchestrator behaves EXACTLY as
before this change. The mirror below is SKIPPED in that case. If `worktree_path` is recorded but the
directory no longer exists (e.g. it was pruned), the `-d` guard falls back to `$(pwd)` for safety.

```bash
# One-time main→worktree project-folder mirror (mirror once at first entry; on resume the worktree copy is authoritative)
if [ "$ACTIVE_WORKTREE_PATH" != "$(pwd)" ] && [ ! -f "$ACTIVE_WORKTREE_PATH/kaola-workflow/{project}/workflow-plan.md" ]; then
  mkdir -p "$ACTIVE_WORKTREE_PATH/kaola-workflow/{project}/"
  cp -R "kaola-workflow/{project}/." "$ACTIVE_WORKTREE_PATH/kaola-workflow/{project}/"
fi
```

This copies the project folder (workflow-plan.md + Node Ledger + `.cache/`) into the worktree once
at start. From this point the orchestrator dispatches EVERY Agent() call below — all contractor
brackets and all role dispatches — with `Working directory: ${ACTIVE_WORKTREE_PATH}`. The relative
plan paths in every script invocation remain relative (relative + cwd is the mechanism; do NOT
switch to absolute paths); with cwd == worktree they resolve to the worktree copy, the per-node
barrier diffs the worktree's working tree, and the impl lands on `workflow/issue-N`. When
`ACTIVE_WORKTREE_PATH == $(pwd)` (repo-root fallback), the `Working directory:` line is harmless
and the orchestrator behaves exactly as today.

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
  prompt="Working directory: ${ACTIVE_WORKTREE_PATH} — run all scripts and resolve every relative path from this directory (it is the provisioned worktree for adaptive; when it equals the repo root, behavior is unchanged). Re-orient the frozen plan for {project}; run scripts + report markers, do NOT judge or clear anything. Run `kaola-gitlab-workflow-plan-validator.js kaola-workflow/{project}/workflow-plan.md --resume-check --json` — re-check `plan_hash` + closed-library membership + structural grammar + hash integrity ONLY (NOT the full gate rubric — re-running it would brick an in-flight plan if the rubric tightened after freeze) — and `kaola-gitlab-workflow-next-action.js kaola-workflow/{project}/workflow-plan.md --json` (ready set, next node with resolved `model`, `allDone`). Then read the `## Node Ledger` + `workflow-state.md` and REPORT VERBATIM: both JSON outputs in full; whether `escalated_to_full: consent` is in `workflow-state.md` OR `consent_halt: pending` is in the `## Node Ledger`; any node at `status: in_progress` and, for it, whether `.cache/{node-id}.md` is absent / partial / complete and whether its barrier has already run. Do NOT judge, dispatch, or clear any marker."
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
- The plan is **authored but NOT frozen** (the orient's `--resume-check` refused with `plan_hash
  missing`) → a prior `/kaola-workflow-adapt` exited before freezing (governance refusal / declined
  risk-ask / abort). Do NOT run the loop on an unfrozen plan; route to `/kaola-workflow-adapt
  {project}` to complete **Govern + freeze** (adapt re-enters at freeze on the existing plan), then
  resume here once it is frozen.
- Otherwise the ready set from `next-action` (each node already carrying its resolved `model`) drives
  the loop: every node whose `status != complete` and all of whose `depends_on` are `complete`
  **with resolved compliance**. When no node is `in_progress` (e.g. a crash between a node's commit
  and its fused advance left the next node unopened), **re-enter at step 1** to open the next ready node.

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

**Task list = the workflow nodes.** The main session keeps a task list with one item per `## Nodes`
row (`id · role`, in `depends_on` order) — established by `/kaola-workflow-adapt` after freeze, or,
on a direct resume, reconstructed here from the `## Node Ledger`. Mark a node's task `in_progress`
when you dispatch its role (after the advance bracket) and `completed` once its barrier passes in the
commit step (`n/a` → skipped). This task list is a **live mirror** for visibility; the durable
`## Node Ledger` stays the single source of truth, so reconcile the task list to the ledger on every
resume rather than trusting a stale in-session list.

You MUST pass `model="{CONTRACTOR_MODEL}"` in the contractor Agent calls below exactly as shown.

The commit of a node and the advance to the next node are **fused into ONE contractor dispatch**
(step 3) so the contractor is summoned **once** per node transition, not twice. A standalone advance
(step 1) only bootstraps the FIRST node (and, on resume, re-opens the `in_progress` node); thereafter
the loop cycles step 2 → 3 → 4 → 2.

1. **advance — open the next ready node when none is `in_progress` (contractor bracket)** — run this
   to bootstrap the first node, and on resume to open the next ready node **whenever no node is
   `in_progress`** (a never-opened first node, OR a node orphaned by a crash between a prior node's
   commit and its fused advance — see step 3). In steady state the fused advance (step 3) opens the
   next node, so do not re-run this while a node is already `in_progress`. The contractor opens the node:
   ```text
   Agent(
     subagent_type="contractor",
     model="{CONTRACTOR_MODEL}",
     description="Adaptive advance {project}",
     prompt="Working directory: ${ACTIVE_WORKTREE_PATH} — run all scripts and resolve every relative path from this directory (it is the provisioned worktree for adaptive; when it equals the repo root, behavior is unchanged). Open the next ready node for {project}; run scripts + write the in_progress row, do NOT dispatch/judge/run the barrier. Run `kaola-gitlab-workflow-next-action.js kaola-workflow/{project}/workflow-plan.md --json` and report its full JSON (ready set, next node, each node's resolved `model`, `allDone`). For the next ready node, mark it `in_progress` in the `## Node Ledger` and record its per-instance write baseline by running `kaola-gitlab-workflow-commit-node.js kaola-workflow/{project}/workflow-plan.md --node-id {node-id} --start --json` — record-base runs ONLY at node start and is **idempotent** (#239); an end-time baseline would neuter the barrier. Return the next-action JSON + the node you opened."
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
  prompt="Working directory: ${ACTIVE_WORKTREE_PATH} — run all scripts and resolve every relative path from this directory (it is the provisioned worktree for adaptive; when it equals the repo root, behavior is unchanged). Implement node {node-id}. Declared write set: {declared_write_set}. RED→GREEN required."
)
```

   An `implementer` node (non-test-first category; `non_tdd_reason` must be recorded):

You MUST pass `model="{IMPLEMENTER_MODEL}"` in this Agent call exactly as shown —
do not omit the `model=` line.

```text
Agent(
  subagent_type="implementer",
  model="{IMPLEMENTER_MODEL}",
  description="Adaptive node {node-id} {project}",
  prompt="Implement node {node-id}. Declared write set: {declared_write_set}. Change-type-appropriate verification required (record non_tdd_reason)."
)
```

   A review gate node:

You MUST pass `model="{CODE_REVIEWER_MODEL}"` in this Agent call exactly as shown.

```text
Agent(
  subagent_type="code-reviewer",
  model="{CODE_REVIEWER_MODEL}",
  description="Adaptive review {project}",
  prompt="Working directory: ${ACTIVE_WORKTREE_PATH} — run all scripts and resolve every relative path from this directory (it is the provisioned worktree for adaptive; when it equals the repo root, behavior is unchanged). Review the changes produced by the implement nodes this gate post-dominates."
)
```

   A routed fix (a failing gate, a thrashing test):

You MUST pass `model="{BUILD_ERROR_RESOLVER_MODEL}"` in this Agent call exactly as shown.

```text
Agent(
  subagent_type="build-error-resolver",
  model="{BUILD_ERROR_RESOLVER_MODEL}",
  description="Adaptive fix {project}",
  prompt="Working directory: ${ACTIVE_WORKTREE_PATH} — run all scripts and resolve every relative path from this directory (it is the provisioned worktree for adaptive; when it equals the repo root, behavior is unchanged). Resolve the failure recorded in the ledger for node {node-id}."
)
```

   A read-only fan-out instance (e.g. an `adversarial-verifier` skeptic, or any
   other read-only role) is dispatched the same way, one instance at a time, with
   `subagent_type` set to the node's role, `model=` resolved via
   `scripts/kaola-workflow-resolve-agent-model.js`, and `Working directory:
   ${ACTIVE_WORKTREE_PATH}` so the relative plan path resolves in the worktree.
   Per-instance evidence is namespaced `.cache/{role}-{claim-id}.md` so siblings never collide.
3. **commit + advance (contractor bracket)** — after the role returns, the contractor verifies the
   evidence, runs the barrier (commit order: `.cache` evidence → Node Ledger row → `workflow-state.md`
   pointer LAST), **only on a clean barrier** closes the node, AND — in the SAME dispatch — opens the
   next ready node (the fused advance; this is what removes the second contractor summons):
   ```text
   Agent(
     subagent_type="contractor",
     model="{CONTRACTOR_MODEL}",
     description="Adaptive commit+advance {project}",
     prompt="Working directory: ${ACTIVE_WORKTREE_PATH} — run all scripts and resolve every relative path from this directory (it is the provisioned worktree for adaptive; when it equals the repo root, behavior is unchanged). Close node {node-id} for {project} in commit order (`.cache` evidence → `## Node Ledger` row → `workflow-state.md` pointer LAST); run scripts + write the durable rows, do NOT judge sufficiency or write any escalation marker. (a) Read `.cache/{node-id}.md` and report whether BOTH RED and GREEN evidence are present (a `tdd-guide` node cannot transition to `complete` without both, or an explicit `n/a` skip reason); for an `implementer` node, report whether a recorded `non_tdd_reason` AND a passing change-type-appropriate check (regression-green / build-green / executable smoke-integration) are present in place of RED→GREEN — an `implementer` node cannot transition to `complete` without both; and the `test_thrash` count (consecutive same-test RED→RED cycles). (b) Run the PER-INSTANCE barrier `kaola-gitlab-workflow-commit-node.js kaola-workflow/{project}/workflow-plan.md --node-id {node-id} --json` and report its exit code — the re-scan of the files this node actually wrote is **script-enforced** (#231), not prose; with `--node-id` it diffs against the node's step-1 recorded base (exactly THIS node's writes, #239) and checks them against the node's OWN declared write set, so a fan-out instance that overflows into a SIBLING's lane is refused (the whole-plan barrier in Phase 6 remains the union-level floor). (c) ONLY IF the barrier exits 0 AND RED+GREEN evidence is present (or a valid `n/a`): mark the node `complete` (or `n/a`) and emit its one `## Required Agent Compliance` row — for a `code-reviewer`/`security-reviewer` gate or skeptic row, key it with the **bare role string** (`code-reviewer`, `security-reviewer`); per-instance disambiguation goes in the Evidence column only (the canonical compliance-row format the full-path `delegationPolicyCompliance()` matcher expects). Never mark a gate row `n/a` while a node it post-dominates reached `complete` — a gate row must record a node that actually ran and produced a passing verdict. (d) FUSED ADVANCE — ONLY IF the barrier exited 0 and the node is now `complete`/`n/a`: in this SAME call, open the next node — run `kaola-gitlab-workflow-next-action.js kaola-workflow/{project}/workflow-plan.md --json` and, if it reports a next ready node, mark that node `in_progress` and record its baseline with `kaola-gitlab-workflow-commit-node.js kaola-workflow/{project}/workflow-plan.md --node-id {next-node-id} --start --json` (record-base runs only at node start and is **idempotent**, #239); report the next-action JSON + the node you opened, or `allDone`. If the barrier exits 1, or `test_thrash` ≥ 3, or evidence is missing: do NOT mark the node `complete` AND do NOT run the fused advance — report the condition and stop (the orchestrator owns the halt). (e) SELECTOR ROUTING — ONLY IF `selectorCheck.isSelector === true` AND `selectorCheck.ok === true` (barrier already exited 0 above): read `selectorCheck.armsToNa` from the barrier JSON. For each arm-id in `armsToNa`, write its `## Node Ledger` row to `n/a` with note `selected: <selectorCheck.selected> (not this arm)`. These writes MUST happen BEFORE the fused advance in (d) so `next-action` sees the n/a rows as TERMINAL when computing the new ready set. If `selectorCheck.ok === false` (missing/foreign selector), do NOT mark any arm n/a — report the condition and stop (the orchestrator owns the halt). Non-selector nodes (`selectorCheck.isSelector === false`) require no action. Do NOT dispatch a role, judge sufficiency, write any `escalated_to_full`/`consent_halt` marker, or ask the user."
   )
   ```
4. **judge the barrier (main session — governance).** Read the contractor's commit+advance report:
   - barrier exit 0 + RED+GREEN evidence (or valid `n/a`) for a `tdd-guide` node, OR barrier exit 0 + recorded `non_tdd_reason` + passing change-type-appropriate check (or valid `n/a`) for an `implementer` node → the node is `complete` AND, per the fused
     advance, the next ready node is **already open** (or the contractor reported `allDone` → route to
     Phase 6, Completion below). Dispatch the freshly-opened node (back to step 2) — do not re-run a
     standalone advance. Do not treat a node as `complete` until the barrier exits 0.
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
> (per-node in step 4 above, and whole-plan in Phase 6). --verdict-check (#251) now script-enforces the reviewer/skeptic verdict (informational
> per-node, BLOCKING in Phase 6). What remains agent-discipline is the quorum tally count
> and dry_streak counting; gate presence, execution, barrier, and verdict are all script-guaranteed.

## Quorum / decision nodes (read-only fan-out)

After a read-only fan-out (e.g. adversarial-verify), an orchestrator
**quorum/decision** node tallies the N schema-validated child verdicts against a
*static* threshold (`tally-fn` ∈ {`majority-refute`, `argmax-score`}) and emits
exactly one accept/kill (or winner) decision. The count is derived **solely** from
the durable per-child ledger rows (recomputed on resume — never an in-memory
counter). Each child verdict is a `verdict: pass|fail` block in `.cache`,
mechanically checked by `--verdict-check` (#251) — there is no `validateNodeOutput()`
script; that schema checkpoint was never script-enforced. The orchestrator tallies
recorded verdicts — the tally arithmetic is prose, not a script. A failed quorum (majority refute) routes the claim into a
bounded self-repair loop or surfaces as a RISKY escalation — it never drops a wall
and never auto-approves. A `loop-until-dry` body terminates on static LOOP_CAP
(script-enforced) plus an agent-tracked dry_streak (orchestrator counts no-change
cycles; only LOOP_CAP is validator-enforced).

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
