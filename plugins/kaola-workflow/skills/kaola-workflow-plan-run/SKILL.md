---
name: kaola-workflow-plan-run
description: Use when executing a frozen adaptive workflow-plan.md — traverse its DAG + Node Ledger, dispatching one frontier unit at a time with per-node checkpoints. Resume-safe. Mirror of commands/kaola-workflow-plan-run.md for Codex runtime.
---

# Skill: kaola-workflow-plan-run

Adaptive executor. Runs a frozen `workflow-plan.md` (`workflow_path: adaptive`) by
traversing its DAG + `## Node Ledger` instead of the fixed phaseN ladder, dispatching
one frontier unit at a time and checkpointing between calls. Mirror of
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

On entry (and on every resume), the current session runs the read-only `orient` transaction directly
— it is a deterministic script call with no judgment inside it; the session reads the typed
`resume_state` JSON it returns and **judges** which resume branch applies. Run from
`${ACTIVE_WORKTREE_PATH}`:

```bash
node "$KAOLA_SCRIPTS/kaola-workflow-adaptive-node.js" orient \
  --project {project} --json
```

`orient` is READ-ONLY: it shells `node "$KAOLA_SCRIPTS/kaola-workflow-plan-validator.js"
kaola-workflow/{project}/workflow-plan.md --resume-check --json` (re-check `plan_hash` + closed-library
membership + structural grammar + hash integrity ONLY — NOT the full gate rubric, which would brick an
in-flight plan if the rubric tightened after freeze) and `node "$KAOLA_SCRIPTS/kaola-workflow-next-action.js"
kaola-workflow/{project}/workflow-plan.md --json` (ready set, next node with resolved `model`, `allDone`),
scans `escalated_to_full` in `workflow-state.md`, `consent_halt: pending` in the `## Node Ledger`, any
`in_progress` node and its `.cache/{node-id}.md` state, and the `allDone` flag. It makes NO mutations.

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

The current session **owns the loop, runs the typed script transactions, and dispatches the role**
(a subagent cannot dispatch a subagent; the loop control flow stays with the current session). The
session runs `kaola-workflow-adaptive-node.js` transactions directly (deterministic — no contractor
subagent needed for mechanical transitions) and **judges** the governance decisions (ADR 0004/0005:
main session owns loop + dispatch + judgment; scripts own deterministic transitions).

**Task list = the workflow nodes.** The session keeps a task list with one item per `## Nodes` row
(`id · role`, in `depends_on` order) — established by `kaola-workflow-adapt` after freeze, or, on a
direct resume, reconstructed here from the `## Node Ledger`. Mark a node's task `in_progress` when
you dispatch its role (after `open-next`) and `completed` once `close-and-open-next` returns
`result: ok` (`n/a` → skipped). The task list is a live mirror; the durable `## Node Ledger` stays
the single source of truth, so reconcile to the ledger on every resume rather than trusting a stale list.

The commit of a node and the advance to the next are **fused into ONE `close-and-open-next` call**
(step 3), so the session makes one per-node lifecycle call, not two. A standalone `open-next` (step 1)
bootstraps the first node (handoff no longer pre-opens it) and, on resume, re-opens any orphaned node;
thereafter the loop cycles step 2 → 3 → 4 → 2.

Run all invocations from `${ACTIVE_WORKTREE_PATH}` using `node "$KAOLA_SCRIPTS/kaola-workflow-adaptive-node.js" <subcommand>`.

### Frontier unit / parallel batch

Each loop iteration advances one **frontier unit** — either a single node (legacy serial path,
unchanged) or a batch of ready siblings when `next-action`'s `readyPending.length >= 2`.

**Deciding the unit:** inspect `readyPending` from `next-action --json`. One or zero → single-node
path (steps 1–4, unchanged). Two or more eligible siblings → batch path.

**Batch path:**
- **(a) open-batch:** `node "$KAOLA_SCRIPTS/kaola-workflow-parallel-batch.js" open-batch --project {project} --json` — for a write-role batch, first checks isolated-worktree capability; when available, provisions one worktree per member then flips N ledger rows to `in_progress`, records N baselines, and writes `active-batch.json`. **Degraded mode:** when the host lacks isolated-worktree capability, returns `{result:'ok', degraded:true, reason:'worktree_unavailable', opened:[], allDone:false}` with ZERO mutation (no ledger flip, no baseline, no manifest; any worktrees provisioned mid-attempt are rolled back). On `degraded:true`, the orchestrator MUST NOT concurrent-dispatch — it `log()`s the degradation and falls back to the single-node `open-next` path, opening write-role siblings one at a time with the same per-node lifecycle (correctness preserved, wall-clock parallelism forgone — design §10.3). Read-only batches are unaffected (no worktrees ever provisioned, never degraded).
- **(b) Concurrent dispatch:** the current session issues **multiple `Agent()` calls in ONE message**, one per member. Write-role members get `Working directory: <isolated worktree>`; read-only members share `${ACTIVE_WORKTREE_PATH}`. **The script manages batch STATE; the orchestrator (current session) owns DISPATCH. `kaola-workflow-parallel-batch.js` NEVER spawns an agent — the only concurrency is the current session issuing multiple `Agent()` calls in one message.**
- **(c) record-evidence per member:** read-only siblings namespace evidence as `.cache/{role}-{claim-id}.md`.
- **(d) seal:** `node "$KAOLA_SCRIPTS/kaola-workflow-parallel-batch.js" seal --project {project} --json` — runs the unchanged per-node `commit-node` barrier for each member.
- **(e) join:** `node "$KAOLA_SCRIPTS/kaola-workflow-parallel-batch.js" join --project {project} --json` — no-op for read-only; path-scoped idempotent checkout merge for write-role. Orchestrator deletes manifest after join.
- **(f) re-enter next-action** — terminal batch members unblock downstream (existing readiness semantics, no new gate).

**Legality rule:** multiple `in_progress` ledger rows are legal ONLY with a valid `active-batch.json`
whose `members` set exactly matches the `in_progress` set; otherwise a typed refusal
(`orphan_multi_in_progress`). Batch lifecycle states: `open → dispatched → sealed → joining → joined`.

**Crash/resume:** `open` → re-dispatch all (baselines idempotent). `dispatched` → per-member recovery
(absent evidence → re-dispatch; present + `in_progress` → `seal-member` only). `sealed` → run `join`.
`joining` → re-run `join` (idempotent). `joined` → delete manifest, re-enter `next-action`.

1. **open-next — open the next ready node when none is `in_progress`** — run this to open the first
   node (the handoff no longer pre-opens it), and on resume to open the next ready node **whenever no
   node is `in_progress`** (first node never opened, or one orphaned by a crash between a node's commit
   and its fused advance); every later open is fused into step 3, so do not re-run it while a node is
   already `in_progress`.

   ```bash
   node "$KAOLA_SCRIPTS/kaola-workflow-adaptive-node.js" open-next \
     --project {project} --json
   ```

   `open-next` shells `next-action --json`, picks the next ready node (or validates a supplied
   `--node-id`), splices the ledger row to `in_progress`, and shells `commit-node --node-id N
   --start --json` to record the per-instance write baseline (idempotent, #239). Returns
   `{opened:{id,role,model,declared_write_set}, baselineRecorded:true}`, or `{allDone:true}`.
   On `allDone`, route to finalize.

2. **dispatch** the node's role (current session — Codex delegates to the matching agent profile;
   resolve its model via `node "$KAOLA_SCRIPTS/kaola-workflow-resolve-agent-model.js" <role>`). Pass
   `Working directory: ${ACTIVE_WORKTREE_PATH}` to every role delegation so the relative plan path
   resolves inside the worktree. **After the role returns, record durable evidence immediately**
   before step 3 — `close-and-open-next` refuses (`evidence_missing`) if `.cache/{node-id}.md` is
   absent when it runs:

   ```bash
   echo "<role-returned-evidence>" | \
     node "$KAOLA_SCRIPTS/kaola-workflow-adaptive-node.js" record-evidence \
       --project {project} --node-id {node-id} --stdin --json
   ```

3. **close-and-open-next (SCRIPT-ENFORCED typed transaction)** — run from `${ACTIVE_WORKTREE_PATH}`:

   ```bash
   node "$KAOLA_SCRIPTS/kaola-workflow-adaptive-node.js" close-and-open-next \
     --project {project} --node-id {node-id} --json
   ```

   Enforces the full commit+advance chain (crash-safe write order: `.cache` evidence → `## Node
   Ledger` row → `workflow-state.md` pointer LAST):

   **(a)** Evidence-shape PRESENCE check by role — `tdd-guide` needs BOTH `RED` AND `GREEN` tokens
   (or `n/a`); `implementer` needs `non_tdd_reason` AND one of `regression-green`/`build-green`/
   `smoke-integration` (or `n/a`); other roles: non-empty file (or `n/a`). Missing → typed refuse,
   NO mutation. Sufficiency is the session's judgment, not the script's.

   **(b)** Per-node barrier: shells `node "$KAOLA_SCRIPTS/kaola-workflow-commit-node.js" ... --node-id
   {node-id} --json` (re-scans the files the node actually wrote — **script-enforced** #231/#239 —
   diffing the recorded baseline against the node's OWN declared lane; a fan-out instance overflowing
   into a sibling's lane is refused; Phase 6's whole-plan barrier stays the union-level floor).
   Barrier fail → typed refuse, NO close, NO advance.

   **(c)** Close + compliance: ONLY IF barrier exit 0 AND evidence present — splices ledger row to
   `complete`/`n/a`, emits one `## Required Agent Compliance` row. Gate rows for
   `code-reviewer`/`security-reviewer` use the **bare role string** (the canonical format the
   full-path `delegationPolicyCompliance()` matcher expects); per-instance disambiguation in the
   Evidence column only. Never mark a gate row `n/a` while a node it post-dominates reached `complete`.

   **(e)** Selector routing BEFORE fused advance: if `selectorCheck.isSelector === true` &&
   `selectorCheck.ok === true` — reads `selectorCheck.armsToNa`, writes each arm's ledger row to
   `n/a` with note `selected: <selected> (not this arm)` BEFORE the advance so `next-action` sees
   them as TERMINAL. If `selectorCheck.ok === false` → typed refuse, no advance. Non-selector nodes:
   no action.

   **(d)** Fused advance: ONLY IF barrier exit 0 and node now terminal — shells `next-action --json`;
   if a next ready node exists, opens it (`in_progress` + `commit-node --start`, idempotent #239).
   Returns `{closed:{node-id}, opened:{id,role,model,...}|null, allDone}`. On failed barrier /
   missing evidence / selector_invalid → typed refuse, NO advance. `test_thrash` ≥ 3 tally and
   consent escalation DECISION stay session-owned; the script only transcribes via `write-halt`.

4. **judge the barrier (current session — governance).** On `result: ok` + `opened:{...}` the node
   is `complete` and the next ready node is already open — dispatch it (back to step 2), or route to
   finalize on `allDone`. On `result: refuse, reason: barrier_failed` (sensitive write without a
   `security-reviewer` node, or lane overflow) the provisional authorization was granted on a
   now-false premise: **revoke and halt for consent** — this **decision** is the session's (the
   script is never a gate):

   ```bash
   node "$KAOLA_SCRIPTS/kaola-workflow-adaptive-node.js" write-halt \
     --project {project} --node-id {node-id} --reason consent --json
   ```

   `write-halt --reason consent` writes BOTH `escalated_to_full: consent` AND
   `escalated_to_full: security` into `workflow-state.md`, AND the durable line `consent_halt:
   pending` into the plan's `## Node Ledger` (#234: non-hashed, survives a lost state file).
   `test_thrash` ≥ 3 escalates the same way with `--reason test_thrash` (writes
   `escalated_to_full: test_thrash` + `consent_halt: pending`). Idempotent.

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

## Repair routing (in-scope review findings — #279)

A gate/skeptic role (`code-reviewer`, `security-reviewer`, `adversarial-verifier`) emits its machine
verdict AND zero or more **structured findings** into its `.cache/{node-id}.md` evidence, per the
**Machine-Readable Findings** contract that now lives in each reviewer's own agent definition (the
reviewer owns the emission format — the closed vocabulary and the column-0 `finding:` line shape are
documented there). The orchestrator owns what happens next:

`--verdict-check` (#251, hardened by #279) now FAILS a gate — even on `verdict: pass` /
`findings_blocking: 0` — when any finding is `scope: in_scope, action: fix` whose `status` is not
`resolved`/`deferred` (a missing `status` reads as `open`, fail-closed). It is informational per-node
and BLOCKING whole-plan in Phase 6, so an unresolved in-scope actionable defect can never silently
become a follow-up. The offending finding ids surface in the verdict-check JSON `unresolvedFixes[]`.

When `--verdict-check` reports `unresolvedFixes`, the orchestrator does NOT route to finalize. It
enters a **bounded repair controller** (static `LOOP_CAP`):

1. **Route** each unresolved finding to its `fix_role`, dispatching one fix at a time: behavior /
   test / code → `tdd-guide`; no-natural-test / refactor / config / docs glue → `implementer`; build
   / type / lint / tooling → `build-error-resolver`; a security-sensitive correction → the applicable
   fix role, then **re-run `security-reviewer`**; an adversarial refute → the applicable fix role,
   then **re-run the verifier/quorum**.
2. **Stay inside the repair envelope** = the original implementation write set ∪ tests ∪
   docs/changelog ∪ required byte-identical mirrors. The per-node barrier (`commit-node`) enforces
   this mechanically — a write outside the envelope is refused. If a fix genuinely needs a file
   outside the envelope, **halt/replan/ask** via `write-halt` — never silently defer.
3. **Re-review**: after the fix lands, the reviewer re-emits its evidence with the finding's
   `status: resolved` (or is re-dispatched), and `--verdict-check` runs again. Repeat until no
   `unresolvedFixes` remain or `LOOP_CAP` is reached.
4. **Cap exhaustion** → halt as blocked/escalated via `write-halt` (`--reason consent` / `test_thrash`),
   the same revoke-and-surface path the barrier uses. Do NOT convert an unresolved in-scope fix into a
   follow-up.

Findings marked `out_of_scope`, `pre_existing`, or `needs_user_decision` (or `action: follow_up` /
`document`) do not block — but they MUST be recorded as **explicit, machine-readable** follow-ups /
escalations (they remain in the evidence and surface at finalize), never silently dropped.

## Caps

`FANOUT_CAP` (default 4, env `KAOLA_FANOUT_CAP`), `test_thrash` ≥ 3, file overflow
declared+1 / absolute backstop of 6, the static loop bound — enforced per node at the barrier.

## Completion

When every ledger row is `complete` or `n/a`, route to `kaola-workflow-finalize {project}`
(adaptive runs have no `phase5-review.md`; finalize anchors on the all-complete plan).
