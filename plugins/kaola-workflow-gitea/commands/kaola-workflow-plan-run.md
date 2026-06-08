---
description: Kaola-Workflow Adaptive Executor. Runs a frozen workflow-plan.md by traversing its DAG + Node Ledger, dispatching one frontier unit at a time with per-node checkpoints. Resume-safe.
argument-hint: <project name>
---

# Kaola-Workflow Adaptive Executor (plan-run)

Executes a frozen `workflow-plan.md` for an adaptive project (`workflow_path:
adaptive`). The plan — authored by `/kaola-workflow-adapt` and frozen by the
validator — is the spine: the executor traverses its DAG + `## Node Ledger`
instead of the fixed phaseN ladder, dispatching one frontier unit at a time and
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

On entry (and on every resume), the main session runs the read-only `orient` transaction directly —
it is a deterministic script call with no judgment inside it; the main session reads the typed
`resume_state` JSON it returns and **judges** which resume branch applies. The judgment is always the
main session's own.

Run from `${ACTIVE_WORKTREE_PATH}` so the relative plan path resolves inside the worktree:

```bash
node "$KAOLA_SCRIPTS/kaola-gitea-workflow-adaptive-node.js" orient \
  --project {project} --json
```

`orient` is READ-ONLY: it shells the validator `--resume-check --json`, shells `next-action --json`,
scans `escalated_to_full` in `workflow-state.md`, `consent_halt: pending` in the `## Node Ledger`,
any `in_progress` node and its `.cache/{node-id}.md` state (`absent`/`present`), and the `allDone`
flag from `next-action`. It emits a typed `resume_state` JSON and makes **no mutations**.

The main session then **judges** the resume branch from the typed `resume_state`:

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
to a plan DAG. The main session **owns the loop, runs the typed script transactions, and dispatches
the role** (a subagent cannot dispatch a subagent, so the loop control flow stays with the
orchestrator). The main session runs the `kaola-gitea-workflow-adaptive-node.js` transactions directly
(deterministic, no contractor subagent needed for mechanical transitions) and **judges** the
governance decisions (ADR 0004/0005: main session owns loop + dispatch + judgment; scripts own
deterministic transitions).

**Task list = the workflow nodes.** The main session keeps a task list with one item per `## Nodes`
row (`id · role`, in `depends_on` order) — established by `/kaola-workflow-adapt` after freeze, or,
on a direct resume, reconstructed here from the `## Node Ledger`. Mark a node's task `in_progress`
when you dispatch its role (after `open-next`) and `completed` once `close-and-open-next` returns
`result: ok` (`n/a` → skipped). This task list is a **live mirror** for visibility; the durable
`## Node Ledger` stays the single source of truth, so reconcile the task list to the ledger on every
resume rather than trusting a stale in-session list.

The commit of a node and the advance to the next node are **fused into ONE `close-and-open-next`
call** (step 3) so the main session makes **one** per-node lifecycle call, not two. A standalone
`open-next` (step 1) opens the FIRST node (and, on resume, any node orphaned by a crash between a
node's commit and its fused advance); thereafter the loop cycles step 2 → 3 → 4 → 2.

The main session owns and runs these script transactions **directly** from `${ACTIVE_WORKTREE_PATH}`.
The script owns the deterministic mechanics (ledger writes, baseline records, compliance rows,
selector routing); the main session owns the dispatch and the governance judgment.

### Frontier unit / parallel batch

Each iteration of the loop advances exactly one **frontier unit**. A frontier unit is either a
single node (the legacy serial path, unchanged) or a batch of ready siblings when `next-action`'s
`readyPending` contains ≥2 eligible nodes.

**Deciding the unit:** after `orient`, read `next-action --json` and inspect `readyPending`:
- `readyPending.length == 1` (or 0 with a node already `in_progress`) → **single-node path**: run
  steps 1–4 below as today, with zero change.
- `readyPending.length >= 2` and members are eligible → **batch path** (see below).

**Batch eligibility rules** (checked by `open-batch`):
- All-read-only (empty declared write sets): eligible; no worktree isolation required.
- All-write-role over pairwise-disjoint declared write sets: eligible (disjointness re-confirmed at
  `open-batch`, fail-closed on overlap).
- Mixed read-only + write-role: open the read-only subset first; never mix in one batch.

**Batch path — steps:**

**(a)** `parallel-batch open-batch`:
```bash
node "$KAOLA_SCRIPTS/kaola-gitea-workflow-parallel-batch.js" open-batch \
  --project {project} --json
```
For a write-role batch, `kaola-gitea-workflow-parallel-batch.js` first checks whether the host
supports isolated git worktrees (required to give each write-role member its own working tree). When
isolation is available, it provisions one worktree per member, then flips N ledger rows
`pending → in_progress`, records N baselines (idempotent, #239), and writes
`kaola-workflow/{project}/.cache/active-batch.json` with `state: 'open'`, returning
`{result:'ok', batchId, state:'open', members:[{id, role, model, declared_write_set, kind, baseline, worktreePath}], allDone:false}`.

**Degraded mode (worktrees unavailable):** when the host lacks isolated-worktree capability,
`open-batch` returns `{result:'ok', degraded:true, reason:'worktree_unavailable', opened:[], allDone:false}`
with ZERO mutation — no ledger flip, no baseline, no manifest written; any worktrees provisioned
mid-attempt are rolled back. On `degraded:true`, the orchestrator MUST NOT attempt concurrent batch
dispatch. It `log()`s the degradation (so the forgone parallelism is visible, never silent) and falls
back to the single-node legacy path — opening the write-role siblings one at a time via `open-next`,
same per-node lifecycle as today, correctness preserved, wall-clock parallelism forgone (the
intentional degradation of design §10.3). Read-only batches are unaffected — they never provision
worktrees and are never degraded.

**(b)** **Concurrent dispatch — the ONLY real concurrency:** the main session issues **MULTIPLE
`Agent()` calls in ONE message**, one per batch member. Each call carries `subagent_type` = member
role, `model` = per-member model, and:
- Write-role members: `Working directory: <member isolated worktree>`.
- Read-only members: `Working directory: ${ACTIVE_WORKTREE_PATH}` (shared worktree).

**The script manages batch STATE; the orchestrator (main session) owns DISPATCH.
`kaola-gitea-workflow-parallel-batch.js` NEVER spawns an agent — the only concurrency is the main
session issuing multiple `Agent()` calls in one message.**

**(c)** `record-evidence` per member — each subagent writes its evidence. Read-only siblings use
namespaced paths `.cache/{role}-{claim-id}.md` so members never collide.

**(d)** `parallel-batch seal`:
```bash
node "$KAOLA_SCRIPTS/kaola-gitea-workflow-parallel-batch.js" seal \
  --project {project} --json
```
Runs the unchanged per-node `commit-node` barrier for each member (same barrier as the single-node
path, called N times). Manifest transitions to `state: 'sealed'` only when all members pass.

**(e)** `parallel-batch join` (no-op for read-only; path-scoped merge for write-role):
```bash
node "$KAOLA_SCRIPTS/kaola-gitea-workflow-parallel-batch.js" join \
  --project {project} --json
```
For write-role batches: runs path-scoped `git -C <parent> checkout <member-ref> -- <each declared
path>` for each member (disjoint sets → conflict-free; idempotent). For read-only batches: no-op.
After join, the orchestrator deletes the manifest (`active-batch.json`).

**(f)** Re-enter `next-action` — the now-terminal batch members unblock downstream nodes
(existing readiness semantics: `next-action` requires all `depends_on` to be TERMINAL before a
node enters `readyPending`; no new gate needed).

**Legality rule:** multiple `in_progress` ledger rows are legal ONLY when a valid
`active-batch.json` exists whose `members` set exactly matches the `in_progress` set. Any other
configuration is a typed refusal (`orphan_multi_in_progress`). The batch lifecycle states are:
`open → dispatched → sealed → joining → joined`.

**Crash/resume:** the batch state is fully recoverable from durable artifacts. `open` → re-dispatch
all members (baselines idempotent). `dispatched` → per-member: absent evidence re-dispatch; present
evidence but `in_progress` ledger → run `seal-member` only. `sealed` → run `join`. `joining` →
re-run `join` (idempotent on already-merged members). `joined` → delete manifest, re-enter
`next-action`.

1. **open-next — open the next ready node when none is `in_progress`** — run this to open the
   first node (handoff no longer pre-opens it), and on resume to open the next ready node
   **whenever no node is `in_progress`** (first node never opened, OR a node orphaned by a crash
   between a prior node's commit and its fused advance — see step 3). In steady state the fused
   advance inside step 3 opens the next node, so do not re-run this while a node is already
   `in_progress`. Run from `${ACTIVE_WORKTREE_PATH}`:

   ```bash
   node "$KAOLA_SCRIPTS/kaola-gitea-workflow-adaptive-node.js" open-next \
     --project {project} --json
   ```

   `open-next` shells `next-action --json`, picks the next ready node (or validates a supplied
   `--node-id`), splices the ledger row to `in_progress`, and shells `commit-node --node-id N
   --start --json` to record the per-instance write baseline (idempotent, #239 — an end-time
   baseline would neuter the barrier). Returns `{opened:{id,role,model,declared_write_set},
   baselineRecorded:true}`, or `{allDone:true}` when every ledger row is `complete`/`n/a`.

   On `allDone`, route to Phase 6 (Completion below) — there is no node to dispatch.
   `allDone` is valid only after the mandatory `finalize` sink node itself has been closed.
   If `open-next` opens a node whose `role` is `finalize`, stay in the per-node loop and use
   the finalize sink contract below instead of routing to Phase 6.
2. **dispatch** the node's role (main session — see above). Use the `model` returned by `open-next`
   for the node (or resolved via `scripts/kaola-workflow-resolve-agent-model.js <role>` on resume).
   **Special case — `role: finalize` sink:** `finalize` is the mandatory DAG sink, not a
   dispatchable subagent role. It is expected that
   `scripts/kaola-workflow-resolve-agent-model.js finalize` returns an empty model. When the opened
   node role is `finalize`, do not call `Agent()`. The main session performs the node's declared
   docs/state bookkeeping directly within the validator-allowed finalize write set, then records
   evidence for the `finalize` node:

   ```bash
   echo "<finalize-bookkeeping-evidence>" | \
     node "$KAOLA_SCRIPTS/kaola-gitea-workflow-adaptive-node.js" record-evidence \
       --project {project} --node-id {node-id} --stdin --json
   ```

   Then run `close-and-open-next` for that same node. Only after that command returns
   `{allDone:true}` is the DAG complete and ready to route to Phase 6 / Finalization. If the close
   refuses, stay in the per-node loop and fix or refuse as with any other node.

   **For non-finalize roles, after the role returns, capture durable evidence immediately** — the
   step-3 close refuses
   (`evidence_missing`) if `.cache/{node-id}.md` is absent when it runs:

   ```bash
   echo "<role-returned-evidence>" | \
     node "$KAOLA_SCRIPTS/kaola-gitea-workflow-adaptive-node.js" record-evidence \
       --project {project} --node-id {node-id} --stdin --json
   ```

   `record-evidence --stdin` reads stdin and writes verbatim to `.cache/{node-id}.md` (mkdir -p).
   This fixes the chat-only brittleness where evidence lived only in session memory. An implement node:

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
3. **close-and-open-next (SCRIPT-ENFORCED typed transaction)** — after the role returns and
   evidence is recorded (step 2), run the fused close+advance from `${ACTIVE_WORKTREE_PATH}`:

   ```bash
   node "$KAOLA_SCRIPTS/kaola-gitea-workflow-adaptive-node.js" close-and-open-next \
     --project {project} --node-id {node-id} --json
   ```

   The script enforces the full commit+advance chain in a fixed order (crash-safe write order:
   `.cache` evidence → `## Node Ledger` row → `workflow-state.md` pointer LAST):

   **(a) Evidence-shape PRESENCE check (by role) — BLOCKING gate before the barrier:**
   - `tdd-guide`: `.cache/{node-id}.md` must contain BOTH `RED` AND `GREEN` tokens (or start with
     `n/a` + explicit skip reason). Missing → `{result:'refuse', reason:'evidence_missing'}`, NO
     mutation.
   - `implementer`: must contain `non_tdd_reason` AND one of `regression-green` / `build-green` /
     `smoke-integration`. Missing → typed refuse, NO mutation.
   - Other write/gate roles: evidence file must be present and non-empty (or `n/a`).
   Sufficiency of the evidence is the main session's judgment; the script only checks presence/shape.

   **(b) Per-node barrier — script-enforced (#231/#239):** shells `commit-node --node-id {node-id}
   --json`. Re-scans the files the node actually wrote against the node's OWN declared write set
   (diffs the recorded baseline — exact THIS node's writes, #239); a fan-out instance overflowing
   into a sibling's lane is refused. The whole-plan barrier in Phase 6 remains the union-level floor.
   Barrier fail → typed refuse, NO close, NO advance.

   **(c) Close + compliance row — ONLY IF barrier exit 0 AND evidence present:** splices the ledger
   row to `complete` (or `n/a` via allowFrom), then appends one `## Required Agent Compliance` row.
   For `code-reviewer`/`security-reviewer` the Requirement cell is the **bare role string** (the
   canonical format the full-path `delegationPolicyCompliance()` matcher expects); per-instance
   disambiguation goes in the Evidence column only. Never mark a gate row `n/a` while a node it
   post-dominates reached `complete`.

   **(e) Selector routing — BEFORE fused advance:** if `selectorCheck.isSelector === true` AND
   `selectorCheck.ok === true` (barrier already exit 0): reads `selectorCheck.armsToNa`; for each
   arm-id writes its `## Node Ledger` row to `n/a` with note `selected: <selected> (not this arm)`.
   These writes happen BEFORE the fused advance so `next-action` sees them as TERMINAL when computing
   the new ready set. If `selectorCheck.ok === false` (missing/foreign selector) → typed refuse, no
   advance.

   **(d) Fused advance — ONLY IF barrier exit 0 and node now terminal:** shells `next-action --json`;
   if a next ready node exists, splices it to `in_progress` and records its baseline with
   `commit-node --node-id {next} --start --json` (idempotent, #239). Returns
   `{closed:{node-id}, opened:{id,role,model,...}|null, allDone:true|false}`.

   On barrier fail / missing evidence / selector_invalid → typed refuse, NO advance, NO close. The
   `test_thrash` ≥ 3 tally and the consent escalation DECISION remain main-session–owned; the script
   only transcribes them via `write-halt` (step 4).
4. **judge the barrier (main session — governance).** Read the `close-and-open-next` result:
   - `result: ok` + `opened: {...}` → the node is `complete` AND, per the fused advance, the next
     ready node is **already open**. Dispatch the freshly-opened node (back to step 2) — do not
     re-run a standalone `open-next`. On `allDone: true` → route to Phase 6 (Completion below). Do
     not treat a node as `complete` until the script returns `result: ok` (barrier exit 0).
   - `result: refuse, reason: barrier_failed` — a write turned out sensitive (a Phase-5 category)
     on a plan with no `security-reviewer` node, or overflowed outside the node's declared allowlist:
     the **provisional** authorization was granted on a now-false premise. **Revoke and halt for consent** — this **decision** is yours (the script is never a gate). Run:
     ```bash
     node "$KAOLA_SCRIPTS/kaola-gitea-workflow-adaptive-node.js" write-halt \
       --project {project} --node-id {node-id} --reason consent --json
     ```
     `write-halt --reason consent` writes BOTH `escalated_to_full: consent` AND
     `escalated_to_full: security` into `workflow-state.md`, AND writes the durable line
     `consent_halt: pending` into the plan's `## Node Ledger` (#234: a non-hashed section that
     survives a lost/regenerated state file; never write into `## Meta` / `## Nodes`). Then surface
     the pending approval. You decide; the script transcribes the consequence. Idempotent.
   - `test_thrash` ≥ 3 consecutive same-test RED→RED cycles → you escalate the same way:
     ```bash
     node "$KAOLA_SCRIPTS/kaola-gitea-workflow-adaptive-node.js" write-halt \
       --project {project} --node-id {node-id} --reason test_thrash --json
     ```
     Writes `escalated_to_full: test_thrash` + `consent_halt: pending`, then stop.

> **Enforcement boundary (#231 — now script-enforced).** Gate *presence* is proven
> statically at freeze (post-dominance over the unique sink). Gate *execution* is now
> proven by `--gate-verify`: a **completed** reviewer must post-dominate every
> completed code/sensitive node in the `## Node Ledger` (closes the G1/H5 leak where a
> reviewer is marked `n/a` at runtime). It is wired into `routeAdaptive` (surfaced as
> `pendingGates`, non-blocking on resume) and enforced as a **hard merge gate** in
> Phase 6. The actual-writes re-scan + sensitive/allowlist refusal is `--barrier-check`
> (per-node in step 3 above, and whole-plan in Phase 6). --verdict-check (#251) now script-enforces the reviewer/skeptic verdict (informational
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

`FANOUT_CAP` (default 4, env `KAOLA_FANOUT_CAP`) bounds fan-out width; for
write-role fan-out, additionally ≤ the number of declared disjoint groups.
`test_thrash` ≥ 3, file overflow declared+1 / absolute backstop of 6 files, and
the static loop bound are enforced per node at the barrier.

## Completion

Completion begins only after the `finalize` sink row has been closed and `close-and-open-next`
returns `{allDone:true}`. At that point every ledger row is `complete` or `n/a`; route to Phase 6:

```text
/kaola-workflow-phase6 {project}
```

Phase 6 anchors on the frozen plan + all-complete ledger (adaptive projects have
no `phase5-review.md`), then runs the unchanged sink (merge/PR, archive, close,
roadmap regen).
