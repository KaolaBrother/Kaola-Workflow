---
name: kaola-workflow-plan-run
description: Use when executing a frozen adaptive workflow-plan.md — executes via a running-set scheduler; each frontier unit dispatched concurrently up to the fan-out cap (critical-path-first), with serial as the degraded fallback for write nodes or when lane containment is off. Resume-safe. Mirror of commands/kaola-workflow-plan-run.md for Codex runtime.
---

# Skill: kaola-workflow-plan-run

Adaptive executor. Runs a frozen `workflow-plan.md` (`workflow_path: adaptive`) by
traversing its DAG + `## Node Ledger` instead of the fixed phaseN ladder, dispatching
the ready frontier unit concurrently up to the fan-out cap, topping up as nodes close,
and checkpointing between calls; serial when a write node is live or lane containment
is off. Mirror of
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
# Resolve the scripts dir for every adaptive lifecycle call below (#344). $KAOLA_SCRIPTS is
# referenced by every node transaction but was never defined — outside this repo there is no
# local plugins/ tree, so resolve via the Codex plugin-cache fallback (same probe pattern as the
# finalize SKILL's $validator_script). Define it ONCE here, before the first use, and carry it.
KAOLA_SCRIPTS="plugins/kaola-workflow-gitea/scripts"
if [ ! -f "$KAOLA_SCRIPTS/kaola-gitea-workflow-adaptive-node.js" ]; then
  KAOLA_SCRIPTS="$(dirname "$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow-gitea/*/scripts/kaola-gitea-workflow-adaptive-node.js' -print -quit 2>/dev/null)")"
fi
```

When `worktree_path` is absent or empty (e.g. `KAOLA_WORKTREE_NATIVE=0`, offline, no-git, or this
very issue's own adaptive run which has `worktree_path: ''`), the fallback sets
`ACTIVE_WORKTREE_PATH` to the repo root — the orchestrator behaves EXACTLY as before this change.
The mirror below is SKIPPED in that case.

```bash
# Mechanical main→worktree project-folder mirror (#335) — atomic + plan_hash-verified.
# Idempotent: mirrors once at first entry, NEVER overwrites an existing worktree copy (on
# resume the worktree copy is authoritative). Run it from anywhere — it resolves the MAIN
# checkout via git-common-dir and the worktree from workflow-state.md. Do NOT hand-`cp`.
node "$KAOLA_SCRIPTS/kaola-gitea-workflow-adaptive-node.js" mirror-project \
  --project {project} --json
```

Read the typed result and branch:
- `status: mirrored | exists | skipped` → proceed to `orient`.
- `result: refuse` → STOP and surface the typed refusal verbatim. `mirror_verify_failed` means
  the copied plan failed `plan_hash` re-verification — do NOT hand-copy around it; investigate the
  main-checkout plan. `source_plan_missing` → route to `/kaola-workflow-adapt {project}`.
- If a later `orient` refuses `plan_not_mirrored`, run `mirror-project` again and re-run `orient` —
  never hand-`cp`.

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
node "$KAOLA_SCRIPTS/kaola-gitea-workflow-adaptive-node.js" orient \
  --project {project} --json
```

`orient` is READ-ONLY: it shells `node "$KAOLA_SCRIPTS/kaola-gitea-workflow-plan-validator.js"
kaola-workflow/{project}/workflow-plan.md --resume-check --json` (re-check `plan_hash` + closed-library
membership + structural grammar + hash integrity ONLY — NOT the full gate rubric, which would brick an
in-flight plan if the rubric tightened after freeze) and `node "$KAOLA_SCRIPTS/kaola-gitea-workflow-next-action.js"
kaola-workflow/{project}/workflow-plan.md --json` (ready set, next node with resolved `model`, `allDone`),
scans `escalated_to_full` in `workflow-state.md`, `consent_halt: pending` in the `## Node Ledger`, any
`in_progress` node and its `.cache/{node-id}.md` state, and the `allDone` flag. It makes NO mutations.

The current session then **judges** the resume branch:
- a consent-halt — EITHER `escalated_to_full: consent` in `workflow-state.md` OR
  `consent_halt: pending` in the plan's `## Node Ledger` (#234; non-hashed, survives a
  lost state file) → a provisional auto-run was **revoked at the barrier**; surface the
  pending approval for the user's explicit yes, do NOT re-dispatch. On approval, run the adaptive-node
  `clear-halt --project {project} --reason consent` subcommand (#360) — ONE typed transaction that
  removes the Ledger `consent_halt: pending` marker AND clears `escalated_to_full: consent` (plus the
  coupled `escalated_to_full: security`) from `workflow-state.md`, replacing the contractor lockstep
  (refuses typed `no_halt_present`, zero mutation, when no halt is present), then resume.
- a node `in_progress` with **absent/partial** `.cache/{node-id}.md` AND `orient` returns
  **`requires_redispatch: true`** → the role did not complete evidence (absent or incomplete); this
  is the canonical crash-before-finish signal. Re-dispatch exactly that role node. This is distinct
  from the complete-evidence crash path below: `requires_redispatch` fires when evidence is
  **absent/incomplete**; the complete-evidence path fires when `.cache/{node-id}.md` is present
  and fully formed but the commit bracket did not yet run. The advance bracket's `--record-base` is
  **idempotent** (#239) — the original baseline is reused, so a crashed attempt's writes stay visible
  to the barrier.
- a node `in_progress` with **absent/partial** `.cache/{node-id}.md` without `requires_redispatch`
  set → same path: re-dispatch the role node; the idempotent baseline anchors the barrier diff.
- a node `in_progress` with **complete** `.cache/{node-id}.md` but the barrier not yet run / the node not
  yet marked `complete` → crash AFTER the role finished but before the commit bracket: **re-run the commit
  bracket only — do NOT re-dispatch the role** (which would redo non-idempotent writes).
- the plan is authored but NOT frozen (`--resume-check` refused with `plan_hash missing` — a prior
  `kaola-workflow-adapt` exited before freezing): do NOT run the loop; route to `kaola-workflow-adapt
  {project}` to complete Govern + freeze (adapt re-enters at freeze), then resume here once frozen.
- otherwise the ready set from `next-action` (each node carrying its resolved `model`) drives the loop:
  nodes whose `status != complete` and all of whose `depends_on` are `complete` with resolved compliance.
  The resolved `model` reflects the #382 precedence — the plan's per-node `model` tier ({opus|sonnet})
  beats the install profile. On Codex (#405) the tier maps to a reasoning-effort variant profile: a
  node with `model: opus` on an OPUS_ELIGIBLE_ROLE (planner, code-architect, tdd-guide, code-reviewer,
  security-reviewer, adversarial-verifier) dispatches the committed `<role>-max` xhigh effort variant;
  `model: sonnet`/absent — or `opus` on a non-eligible role with no `-max` profile — stays on the base
  profile (a missing variant degrades gracefully with a visible `model_variant_missing: <role>-max →
  base` note). The tier never breaks dispatch.
  When no node is `in_progress` (e.g. a crash between a node's commit and its fused advance left the next
  node unopened), **re-enter at step 1** to open the next ready node.

**Barrier-overflow recovery (#434):** When a barrier refusal is `write_set_overflow` or
`write_set_granularity` and the node wrote files outside its declared allowlist, run
`revert-overflow` instead of dropping and re-recording evidence from scratch:

```bash
node "$KAOLA_SCRIPTS/kaola-gitea-workflow-adaptive-node.js" revert-overflow \
  --project {project} --node-id {id} --json
```

`revert-overflow` reads the barrier's `outOfAllow` list, runs `git checkout <baseline> -- <exact
paths>` for each overflow path (reverting them to their baseline state), logs the revert to
provenance, and re-runs the barrier. After a clean barrier, re-run the commit bracket (step 3) to
close the node — do NOT re-dispatch the role (the role's writes inside the allowlist are intact).

**Repair-node recovery (#434):** When a complete node needs to be re-run because its evidence is
absent or incomplete after a crash and the baseline must be preserved, use `repair-node`:

```bash
node "$KAOLA_SCRIPTS/kaola-gitea-workflow-adaptive-node.js" repair-node \
  --project {project} --node-id {id} --json
```

`repair-node` transitions the writer node back to `in_progress` using the ORIGINAL `barrier-base`
(no re-snapshot). It also deletes downstream baselines so downstream nodes re-baseline cleanly after
the repair. Re-dispatch the role after this call.

**Anti-laundering invariant (#434):** Never use `reopen-node` to recover from a barrier overflow.
`reopen-node` re-snapshots the baseline at the current merged state, which launders the overflow
writes into the new baseline — the barrier will then pass vacuously on a diff that includes the
overflow. Use `revert-overflow` instead: it clears the overflow while keeping the original baseline
intact, so the barrier diffs against the true node-start state.

## Governance — a frozen in-grammar plan RUNS; `decision:ask` is audit metadata, not an approval gate

The plan is **already frozen** (the `workflow-planner` + handoff froze it). The validator's
`decision` (`auto-run` vs `ask`) is **recorded audit metadata** — plan-run proceeds **either way,
with no user-approval gate**. Re-read the verdict (`--json`); do not re-derive risk by hand, and
**do not pause to ask the user** before running an in-grammar frozen plan.
- **in-grammar (`decision:auto-run` OR `decision:ask`) → run.** `decision:ask` records that the
  validator flagged sensitivity (labels OR declared write set touch auth / payments / user data /
  filesystem / external-API / secrets), a WRITE-ROLE fan-out (N ≥ 2), `SHARED_INFRA`, the file
  ceiling, a bounded loop, or uncertainty (fail-closed) — surfaced in the handoff packet for the
  audit trail; it does **not** stop the run. Read-only fan-out is zero-blast-radius.
- **run authorization is `provisional`:** each node's per-node barrier re-checks ACTUAL writes at
  commit time and can still refuse.
- **plan-run HALTS only on:** a typed refusal (resume-check/barrier finds the plan out-of-grammar or
  tampered), a per-node barrier failure, or a durable consent-halt / test-thrash escalation. None is
  a discretionary "ask the user first."
- **out-of-grammar → typed refusal** (unknown role, a gate routed around, a cap busted,
  a non-disjoint write-role fan-out).

## Per-Node Loop

The current session **owns the loop, runs the typed script transactions, and dispatches the role**
(a subagent cannot dispatch a subagent; the loop control flow stays with the current session). The
session runs `kaola-gitea-workflow-adaptive-node.js` transactions directly (deterministic — no contractor
subagent needed for mechanical transitions) and **judges** the governance decisions (ADR 0004/0005:
main session owns loop + dispatch + judgment; scripts own deterministic transitions).

**Task list = the workflow nodes.** The session keeps a task list (use the runtime task surface) with
one item per `## Nodes` row (`id · role`, in `depends_on` order) — established by `kaola-workflow-adapt`
after freeze, or, on a direct resume, reconstructed here from the `## Node Ledger`.

**Apply the returned `taskTransitions` after EVERY successful ledger-mutating script call (#317).**
Every mutating command (`open-next`, `close-and-open-next`, `write-halt`, `reopen-node`, and the batch
commands `open-batch`/`top-up`/`seal-member`/`seal`/`reconcile`) returns a machine-readable
`taskTransitions` array (`{id, status, ledger_status, reason, note?}`) plus a `taskMirror` field. **Do
not infer** — apply each transition's `status` verbatim. The fused `close-and-open-next` returns BOTH
the committed node (`completed`) AND the newly-opened node (`in_progress`); after `open-batch`, mark
**every** returned member `in_progress` **before** dispatching its subagent (the #284 inference failure
was leaving members `pending` while their subagents ran). `n/a` arrives as `completed`; a halt arrives
as `in_progress` + a `note`. The script also refreshes the durable `workflow-tasks.json` on each
mutation (reported in `taskMirror`); `taskMirror.status: failed` is non-fatal (fail-open — the ledger
transition still held). The task list is a live mirror; the durable `## Node Ledger` stays the single
source of truth, so reconcile to the ledger on every resume rather than trusting a stale list.

The commit of a node and the advance to the next are **fused into ONE `close-and-open-next` call**
(step 3), so the session makes one per-node lifecycle call, not two. A standalone `open-next` (step 1)
bootstraps the first node (handoff no longer pre-opens it) and, on resume, re-opens any orphaned node;
thereafter the loop cycles step 2 → 3 → 4 → 2.

Run all invocations from `${ACTIVE_WORKTREE_PATH}` using `node "$KAOLA_SCRIPTS/kaola-gitea-workflow-adaptive-node.js" <subcommand>`.

### Frontier unit / parallel batch

Each loop iteration advances one **frontier unit** — either a single node (legacy serial path,
unchanged) or a batch of ready siblings when `next-action`'s `readyPending.length >= 2`.

**Logical width vs runtime concurrency (#303):** a `fanout(<group>)` may be **wider than `FANOUT_CAP`**
when the subtasks are genuinely independent. `FANOUT_CAP` is a **runtime concurrency limit** (max
concurrently-running subagents), NOT a planning validity cap. `open-batch` opens at most `FANOUT_CAP`
members and leaves the rest **queued**; `top-up` drains the queue by rolling bounded dispatch.

**Scheduler-default posture (D-419 P3).** The running-set scheduler is the
**documented default executor**: the planner authors the best logical DAG; the
scheduler dispatches the ready frontier unit concurrently up to the fan-out cap,
critical-path-first (highest `longestPathToSink` first), and tops up as nodes
close. **Serial** (`max_concurrent = 1`) is the **degraded mode**, active in ANY
of these cases: a write node is live AND lane containment is off
(`KAOLA_LANE_CONTAINMENT != true`, the permanent default); a write node's write
set OVERLAPS a candidate's even with containment on (`parallel_safe: false`);
`KAOLA_LANE_CONTAINMENT` is off generally; a `main-session-gate` node; a
frontier with only one ready node (degenerate); or any guard-prologue trip
(STOP, never silent degrade). "Scheduler-default" means reads fan out by
default; WRITE parallelism requires `KAOLA_LANE_CONTAINMENT=true` AND
validator-stamped `parallel_safe` write sets — it is OFF by default.

**Planner rubric (D-419 P3 — rewards overlap, never instructs `parallel_safe`):**
Prefer a WIDE ready frontier over a long serial chain when nodes are independent:
author parallel read-only analysis/review nodes (they fan out to the read cap) and
parallel write nodes with DISJOINT declared write sets (they co-schedule under lane
containment). The scheduler opens highest `longest-path-to-sink` nodes first
(critical-path-first list scheduling), so place the longest dependency chain on the
critical path and let short independent branches overlap it. Do NOT serialize
independent work behind a single chain merely for ordering simplicity — every
serialized independent node adds its full duration to the makespan; every overlapped
node hides behind the critical path for free. The `parallel_safe` annotation is
VALIDATOR-DERIVED (stamped at freeze from declared write sets); the planner authors
TOPOLOGY (dep edges) and DISJOINT write sets — never hand-stamps `parallel_safe`.

**Deciding the unit:** the scheduler is **batch-aware** — `orient` signals `enterBatch:true` on a ≥2
START frontier, and `close-and-open-next` returns `enterBatch:true` on a ≥2-wide downstream frontier
so a fan-out is **never serialized**. `enterBatch:true` (or `readyPending.length >= 2`) → batch path;
otherwise single-node path (steps 1–4, unchanged). The frontier and `enterBatch` are computed over
**delegable** nodes only — a `main-session-gate` (#334) is never a batch member and always runs on
the single-node path.

**Batch path:**
- **(a) open-batch:** `node "$KAOLA_SCRIPTS/kaola-gitea-workflow-parallel-batch.js" open-batch --project {project} --json` — first runs a `--resume-check` integrity gate (refuse `plan_integrity_failed`, zero mutation); refuses a fresh open while a live `active-batch.json` exists (`active_batch_exists`) or an `opening` manifest needs repair (`reconcile_first`). Opens at most `FANOUT_CAP` members of a **read-only** frontier (the rest stay **queued** for `top-up`), records N baselines, then performs a **crash-safe two-phase commit** — writes `active-batch.json` with `state:'opening'` BEFORE flipping the N ledger rows to `in_progress`, then promotes to `state:'open'`. **Write-role frontiers serial-degrade (#364):** the member-worktree isolation path was excised — this harness cannot FORCE a subagent's CWD (the `Working directory:` line is advisory), so a write-role batch would leak edits to the parent worktree. `open-batch` (and `top-up`) therefore serial-degrade a write-role frontier UNCONDITIONALLY, returning `{result:'ok', degraded:true, reason:'cwd_unenforceable', opened:[], allDone:false}` with ZERO mutation. On `degraded:true`, the orchestrator `log()`s the degradation and opens the write siblings one at a time via the single-node `open-next` path (correctness preserved, wall-clock parallelism forgone). This is also why a frozen coarse-area-overlapping write antichain never hits a runtime refusal (the serial degrade fires). Reintroduction tracked by #376/#377; see `docs/decisions/0008-excise-write-role-batch-isolation.md`. Read-only batches are unaffected.
- **(b) Concurrent dispatch:** the current session issues **multiple `Agent()` calls in ONE message**, one per member, each `Working directory: ${ACTIVE_WORKTREE_PATH}` (batch members are always read-only post-#364; write-role nodes run serially via `open-next`). **The script manages batch STATE; the orchestrator (current session) owns DISPATCH. `kaola-gitea-workflow-parallel-batch.js` NEVER spawns an agent — the only concurrency is the current session issuing multiple `Agent()` calls in one message.**
- **(b′) Background dispatch (#374, D2):** when the harness supports background subagent dispatch, dispatch each member in the background and, on each completion notification, run `record-evidence` → `seal-member` → `top-up` (while `status --json` says `nextRoute:'top-up'`), dispatching the newly opened sibling — rolling bounded dispatch. Gang dispatch (all calls in one message) is the documented fallback. No script changes; verify wall-clock via node-timings.jsonl (#373).
- **(c) record-evidence per member:** the **orchestrator** records each member PARENT-side at ONE canonical path `.cache/{node-id}.md` (members do NOT self-write into their worktree). The ONLY exception is the adversarial-verifier fan-out, whose per-skeptic `.cache/adversarial-verifier-*.md` files feed the validator's quorum glob.
- **(c′) top-up:** `node "$KAOLA_SCRIPTS/kaola-gitea-workflow-parallel-batch.js" top-up --project {project} --json` — after a member completes, `record-evidence` + `seal-member` it, then `top-up` opens up to (`FANOUT_CAP` − running) more **same-frontier** read-only siblings (never a downstream node), records their baselines, appends them to the manifest. Returns `reason:'at_capacity'` (no slot) / `reason:'frontier_drained'` (queue empty). Repeat until drained. (State-level rolling bounded dispatch; the script never spawns agents, so it never overclaims wall-clock parallelism.)
- **(d) seal:** `node "$KAOLA_SCRIPTS/kaola-gitea-workflow-parallel-batch.js" seal --project {project} --json` — for each member applies the serial gates before close: **evidence-shape** (#319: `evidence_absent` when absent, or `evidence_shape_failed` + `missingTokenClass` when present-but-malformed) + the per-node `commit-node` barrier (run against the parent plan). Manifest → `sealed` only when ALL pass.
- **(e) join:** `node "$KAOLA_SCRIPTS/kaola-gitea-workflow-parallel-batch.js" join --project {project} --json` — batches are always read-only (#364), so join has nothing to merge (evidence is parent-side); it just transitions `sealed → joined` (idempotent) so `seal → join → advance` terminates. Orchestrator deletes manifest after join.
- **(f) re-enter next-action** — terminal batch members unblock downstream (existing readiness semantics, no new gate).

**Drain/termination:** exhausted when `top-up` reports `frontier_drained` AND every manifest member is
sealed → `seal → join → advance`. Until then, keep dispatching + topping up.

**Routing — never `top-up` without an active manifest (#322):** branch on `parallel-batch status --json`'s
`nextRoute`. Call `top-up` ONLY while `nextRoute === 'top-up'` (open + valid batch). After `join` clears
the manifest, `status` returns `active:false` / `nextRoute:'orient'` → route to `adaptive-node orient` →
`open-batch`/`open-next`, NEVER `top-up` (which refuses `no_active_batch`). `reconcile`/`join` routes
likewise follow `nextRoute`.

**Legality rule:** multiple `in_progress` ledger rows are legal ONLY with a valid `active-batch.json`
whose UNSEALED `members` set matches the `in_progress` set, **or** (#377) a valid `running-set.json`
whose node set matches it; otherwise a typed refusal
(`orphan_multi_in_progress`). Batch lifecycle states: `opening → open → sealed → joined`
(the dead `dispatched` state was removed in #303; the crash-safe `opening` marker replaces it;
`joining` was removed in #364 with the write-role merge path).

**Per-node running-set scheduler (#377):** the post-#364 per-node successor to the batch path —
opens/closes INDIVIDUAL nodes against `.cache/running-set.json` so a downstream node unblocks the
moment ITS deps close (not per whole frontier). Additive + opt-in; serial behavior is byte-identical
when `KAOLA_LANE_CONTAINMENT` is off (default). Loop: **`open-ready [--max N]`**
(`node "$KAOLA_SCRIPTS/kaola-gitea-workflow-adaptive-node.js" open-ready --project {project} --json`) flips up
to N ready nodes (priority-ordered by `longestPathToSink`), records per-node baselines, two-phase writes
the manifest (`opening` → flip ledger → `open`) — read-only nodes fan out, a write node opens ALONE (the
permanent serial fallback; `reason:'write_node_exclusive'`/`'write_awaits_drain'` means wait); dispatch
each opened node `run_in_background` (#374); on each completion `record-evidence` → **`close-node
--node-id {id}`** (same evidence-shape → `--barrier-check` → complete → compliance → selector-arm
contract, removes the node, returns `newlyReady`) → `open-ready` again. A `main-session-gate` is never an
`open-ready` member. Crash → `running-set.json` `state:'opening'` is **reconcilable**
(`running_set_opening_incomplete`, never orphan) → **`reconcile-running-set`** rolls forward flipped rows
/ back pending rows; `orient` reconstructs the live set from it. Honesty: state-level only — verify
wall-clock via node-timings.jsonl (#373); the cross-lane write+read overlap stays dormant until
`KAOLA_LANE_CONTAINMENT` is on (#376).

**Crash/resume:** `opening` → run `reconcile` (roll-forward) or `reconcile --abort` (roll-back).
`open` → re-dispatch any member whose evidence is absent (baselines idempotent); present evidence but
`in_progress` ledger → `seal-member` only; frontier not yet drained → `top-up`. `sealed` → run `join`
(idempotent). `joined` → delete manifest, re-enter `next-action`.

1. **open-next — open the next ready node when none is `in_progress`** — run this to open the first
   node (the handoff no longer pre-opens it), and on resume to open the next ready node **whenever no
   node is `in_progress`** (first node never opened, or one orphaned by a crash between a node's commit
   and its fused advance); every later open is fused into step 3, so do not re-run it while a node is
   already `in_progress`.

   ```bash
   node "$KAOLA_SCRIPTS/kaola-gitea-workflow-adaptive-node.js" open-next \
     --project {project} --json
   ```

   `open-next` shells `next-action --json`, picks the next ready node (or validates a supplied
   `--node-id`), splices the ledger row to `in_progress`, and shells `commit-node --node-id N
   --start --json` to record the per-instance write baseline (idempotent, #239). Returns
   `{opened:{id,role,model,declared_write_set}, baselineRecorded:true, nonce:"<12-char>"}`, or
   `{allDone:true}`. The **`nonce`** (#392) is the per-open evidence-binding token (the barrier-base
   SHA prefix) — capture it and pass it to the dispatch in step 2 so the role can echo it in its
   evidence header; the close gate verifies it (anti-copy / anti-replay). On `allDone`, route to
   finalize. `allDone` is valid only after the mandatory `finalize` sink node itself has been closed.
   If `open-next` opens a node whose `role` is `finalize`, stay in the per-node loop and use the
   finalize sink contract below instead.

2. **dispatch** the node's role (current session — Codex delegates to the matching agent profile by
   role name; the role's `model_reasoning_effort` tier in its `agents/<role>.toml` profile is the
   model signal). **Tier → profile selection (#405):** when the opened node's resolved `model` is
   `opus` AND the role is an OPUS_ELIGIBLE_ROLE (planner, code-architect, tdd-guide, code-reviewer,
   security-reviewer, adversarial-verifier), delegate to the `<role>-max` profile (the xhigh
   effort variant) instead of the base `<role>` profile. When `model` is `sonnet`/absent, delegate to
   the base `<role>` profile. If `model: opus` resolves for a role with no committed `<role>-max`
   profile (a non-eligible role), delegate to the base profile and surface a visible
   `model_variant_missing: <role>-max → base` note in the run log — degrade gracefully, never block.
   Pass
   `Working directory: ${ACTIVE_WORKTREE_PATH}` to every role delegation so the relative plan path
   resolves inside the worktree.

   **Evidence-binding nonce (#392):** pass the `nonce` from step 1's `open-next`, the `nonce`
   `open-ready` surfaces per opened member, or the `nonce` in the fused `close-and-open-next`
   `opened` payload into every role dispatch, and instruct the role to make the FIRST line of its
   evidence file the header `evidence-binding: <node-id> <nonce>` (verbatim). The close gate
   (`close-and-open-next` / `close-node`) reads the per-open nonce from disk and refuses
   `evidence_unbound` (the header names a different node — evidence copied across nodes) or
   `evidence_stale` (the nonce is from a prior open — replayed/copied evidence). This binds the
   evidence to THIS dispatch; a node closed without a fresh binding header is rejected. On
   crash-resume, `open-next --node-id <id>` is idempotent and returns the reused nonce for the
   already-open node — pass that reused nonce to the re-dispatch.

   **Open-time evidence seeding (#433):** `open-next` also seeds the evidence skeleton at open time.
   The `opened` payload carries `evidence_file` (`.cache/{node-id}.md` — the seeded path) and
   `required_tokens` (the token classes this role must supply). The seeded file's FIRST line is the
   `evidence-binding:` header (framework-written at open); subsequent lines are stub placeholders
   for each required token, with HTML-comment hints. When dispatching a role agent, pass the
   `evidence_file` path and instruct the agent to:
   - Read the seeded `.cache/{node-id}.md` to see the expected tokens (the binding header + per-role stubs).
   - Fill in the token stubs with real evidence from its work.
   - NEVER modify the `evidence-binding:` header line — it is set by the framework at open time; editing it breaks the barrier binding.
   - Append any additional findings or notes AFTER the required tokens (the gate checks for token PRESENCE; trailing prose is allowed).

   **Script-emitted `dispatch` descriptor (#444):** The `open-next` (and `open-ready`, `close-and-open-next`) response now includes a script-emitted `dispatch` sub-object within the `opened` payload. Pass this `dispatch` object verbatim to the role agent — it contains: `node_id`, `role`, `model`, `working_dir`, `declared_write_set`, `evidence_file`, `nonce`, `required_tokens`, `forge_rider`, `guards`. The `nonce` from `dispatch.nonce` is still the evidence-binding token to pass to the role; the `dispatch` object supersedes per-field manual assembly.

   **Special case — `role: finalize` sink:** `finalize` is the mandatory DAG sink, not a
   dispatchable subagent role. It is expected that
   `kaola-workflow-resolve-agent-model.js finalize` returns an empty model. When the opened node role
   is `finalize`, do not delegate to an agent profile. The main session performs the node's declared
   docs/state bookkeeping directly within the validator-allowed finalize write set, then records
   evidence for the `finalize` node:

   ```bash
   echo "<finalize-bookkeeping-evidence>" | \
     node "$KAOLA_SCRIPTS/kaola-gitea-workflow-adaptive-node.js" record-evidence \
       --project {project} --node-id {node-id} --stdin --json
   ```

   Then run `close-and-open-next` for that same node. Only after that command returns
   `{allDone:true}` is the DAG complete and ready to route to Finalization. If the close refuses,
   stay in the per-node loop and fix or refuse as with any other node.

   Because the sink runs main-session-direct by design, `close-and-open-next` records its Required
   Agent Compliance row as `main-session-direct` — never `subagent-invoked`, which would falsely
   certify a dispatch the sink contract forbids. This row covers ONLY the in-plan sink bookkeeping;
   the Finalization phase's mechanical bookkeeping (`/kaola-workflow-finalize`) is still delegated to
   the `contractor` and is attested separately (`finalize_contractor_attested`).

   **Special case — `role: main-session-gate` (#334, non-delegable):** like the `finalize`
   sink, this role is never a dispatchable subagent — `kaola-workflow-resolve-agent-model.js
   main-session-gate` returns an empty model and you do **not** delegate to an agent profile.
   The MAIN session performs the node's acceptance procedure itself (the check the plan authored
   this gate for — e.g. a GPU / visual true-black comparison, a device-in-hand verification, an
   explicit human sign-off). When the check needs the user's eyes, surface the artifacts and WAIT
   for the user's explicit confirmation — never infer a pass. Then record verdict evidence
   (column-0, lowercase):

   ```bash
   printf 'verdict: pass\nfindings_blocking: 0\n<one-line what-was-checked summary>\n' | \
     node "$KAOLA_SCRIPTS/kaola-gitea-workflow-adaptive-node.js" record-evidence \
       --project {project} --node-id {node-id} --stdin --json
   ```

   then `close-and-open-next` as for any node. The close REFUSES (`evidence_shape_failed`,
   `missingTokenClass: verdict`) without a parseable `verdict: pass|fail` line, and an `n/a`
   self-skip is refused for this role. Record an honest `verdict: fail` and close — blocking
   happens at Finalization's `--verdict-check`/`--gate-verify` (G3); route the repair via the
   bounded #279 controller / `reopen-node`, after which the gate re-runs (it is reset with the
   reviewer gates). A `main-session-gate` node never joins a parallel batch — when it appears in a
   ready frontier, run it on the single-node path.

   **For non-finalize roles, after the role returns, record durable evidence immediately** before
   step 3 — `close-and-open-next` refuses (`evidence_absent` if absent, `evidence_shape_failed` if malformed) when `.cache/{node-id}.md` is absent/malformed
   when it runs. The evidence's FIRST line MUST be the `evidence-binding: <node-id> <nonce>` header
   (#392; `<nonce>` is the value `open-next`, `open-ready`, or `close-and-open-next` returned for
   this open) so the close gate can verify the evidence was produced by THIS dispatch:

   ```bash
   printf 'evidence-binding: {node-id} {nonce}\n%s\n' "<role-returned-evidence>" | \
     node "$KAOLA_SCRIPTS/kaola-gitea-workflow-adaptive-node.js" record-evidence \
       --project {project} --node-id {node-id} --stdin --json
   ```

   **Forge-port mirror nodes (#340):** when the dispatched node's declared write set contains a
   gitlab/gitea edition-named port (`plugins/kaola-workflow-{gitlab,gitea}/scripts/kaola-{gitlab,gitea}-workflow-<x>.js`)
   of a root script edited earlier in this run, the role delegation MUST state the canonical spec as
   the **full accumulated root diff** — instruct the role: run `git diff <run-base>..HEAD --
   scripts/kaola-workflow-<x>.js` and mirror EVERY hunk modulo forge nouns; do NOT work from a
   summary of individual upstream nodes. A per-concern enumeration is how the #328 run shipped half a
   mirror with all four chains green.

   **Forge-touching node guard (#341):** when the opened node's declared write set touches the
   edition plugin trees (`plugins/kaola-workflow*/` — i.e. the workspace is the Kaola-Workflow
   repo itself), pin BOTH halves in the dispatch prompt: (a) plugin agent/command/skill prose
   must stay **forge-neutral** — never name a forge-specific CLI binary or forge brand (no
   CLI-example parentheticals copied from an issue spec; write "the forge CLI") — and the plugin
   role-agent profiles (`plugins/*/agents/*.toml`) are byte-identical mirrors across the three
   plugin editions; (b) the node verifies every changed edition file BEFORE `record-evidence`
   with the standalone, count-independent forbidden-token check:

   ```bash
   node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js \
     --forbidden-only <changed-file>...
   node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js \
     --forbidden-only <changed-file>...
   ```

   This catches a forge-CLI leak at the node that wrote it, even while the edition
   agent/command counts are transiently stale mid-run (the full chains may legitimately be red
   during a count bump — the #328 latent defect).

   **Generated-aggregator forge ports in the diff (#431):** when the opened node's declared
   write set includes `scripts/<base>` where `<base>` is a GENERATED_AGGREGATOR (e.g.
   `kaola-workflow-adaptive-node.js`, `kaola-workflow-plan-validator.js`), the edition-sync
   process generates the forge ports deterministically from canonical. Plans reaching plan-run
   have **already passed the `generated_port_split` freeze-wall** — the freeze validator
   enforces that the canonical-editing node declared all four edition files (canonical +
   codex twin + both forge ports) in a single write set, so the atomic edit is locked in
   before the run begins. During the node's execution, running
   `node scripts/edition-sync.js --write` regenerates the codex twin (byte-identical) and
   both forge ports (rename-normalized). The code-reviewer gate **should expect** the forge
   ports in the diff — they are NOT unexpected writes; they are the expected result of the
   edition-sync from the declared canonical edit. A `write_set_overflow` barrier refusal at
   this node is a plan authoring error (the ports were not declared alongside canonical);
   the repair is to add them to the write set and re-freeze, not to suppress the sync.

3. **close-and-open-next (SCRIPT-ENFORCED typed transaction)** — run from `${ACTIVE_WORKTREE_PATH}`:

   ```bash
   node "$KAOLA_SCRIPTS/kaola-gitea-workflow-adaptive-node.js" close-and-open-next \
     --project {project} --node-id {node-id} --json
   ```

   Enforces the full commit+advance chain (crash-safe write order: `.cache` evidence → `## Node
   Ledger` row → `workflow-state.md` pointer LAST):

   **(a)** Evidence-shape PRESENCE check by role — `tdd-guide` needs BOTH `RED` AND `GREEN` tokens
   (or `n/a`); `implementer` needs `non_tdd_reason` AND one of `regression-green`/`build-green`/
   `smoke-integration` (or `n/a`); other roles: non-empty file (or `n/a`). Missing → typed refuse,
   NO mutation. Sufficiency is the session's judgment, not the script's.

   **(b)** Per-node barrier: shells `node "$KAOLA_SCRIPTS/kaola-gitea-workflow-commit-node.js" ... --node-id
   {node-id} --json` (re-scans the files the node actually wrote — **script-enforced** #231/#239 —
   diffing the recorded baseline against the node's OWN declared lane; a fan-out instance overflowing
   into a sibling's lane is refused; Finalization's whole-plan barrier stays the union-level floor).
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
   Returns `{closed:{node-id}, opened:{id,role,model,declared_write_set,nonce}|null, allDone}`. The
   `nonce` in the `opened` payload is the per-open evidence-binding token for the newly-opened node —
   pass it to the next dispatch exactly as you would the `nonce` from a standalone `open-next`. On
   failed barrier / missing evidence / selector_invalid → typed refuse, NO advance. `test_thrash` ≥ 3
   tally and consent escalation DECISION stay session-owned; the script only transcribes via
   `write-halt`.

4. **judge the barrier (current session — governance).** On `result: ok` + `opened:{...}` the node
   is `complete` and the next ready node is already open — dispatch it (back to step 2), or route to
   finalize on `allDone`. On `result: refuse, reason: barrier_failed` (sensitive write without a
   `security-reviewer` node, or lane overflow) the provisional authorization was granted on a
   now-false premise: **revoke and halt for consent** — this **decision** is the session's (the
   script is never a gate):

   ```bash
   node "$KAOLA_SCRIPTS/kaola-gitea-workflow-adaptive-node.js" write-halt \
     --project {project} --node-id {node-id} --reason consent --json
   ```

   `write-halt --reason consent` writes BOTH `escalated_to_full: consent` AND
   `escalated_to_full: security` into `workflow-state.md`, AND the durable line `consent_halt:
   pending` into the plan's `## Node Ledger` (#234: non-hashed, survives a lost state file).
   `test_thrash` ≥ 3 escalates the same way with `--reason test_thrash` (writes
   `escalated_to_full: test_thrash` + `consent_halt: pending`). Idempotent.

   **Surface a PER-REASON actionable halt message** (#404/#406). Read the TYPED reason at
   `barrierOut.barrierCheck.reason` (the validator classifies the refusal structurally — never
   English-substring the `errors`) and tell the operator exactly what to fix, instead of one opaque
   ~45-min escalation. The five typed reasons (`barrierOut.barrierCheck.{reason, outOfAllow,
   sensitiveHits, foreignArchiveHits, unattributed}`):
   - **`write_set_granularity`** (a #404 mechanical artifact — every out-of-allow file is a strict
     subtree of one of THIS node's OWN bare directory tokens): *"node {node-id} declared the bare
     directory '{tok}' but wrote {outOfAllow files}; re-author the write set to the exact files
     (X/a.js, X/b.js, …) and re-freeze."* The human does the one-line edit; the run does **NOT**
     auto-repair (the auto-repair lane was proven unbuildable-safe — freeze is the only legitimacy
     oracle and cannot re-check a plan it just re-stamped — and is permanently deferred).
   - **`write_set_overflow`** (non-granularity residual — a glob/case token never matched, or a
     foreign write is present): *"declared token(s) never matched the real writes {outOfAllow};
     declare exact in-repo file paths and re-freeze."*
   - **`sensitive_write_unreviewed`** (a Phase-5 sensitive production write with no
     `security-reviewer` node): keep the revoke/escalate semantics, surfacing the typed reason +
     `sensitiveHits` — add a security-reviewer to the plan and re-freeze, or revoke.
   - **`foreign_archive`** (a write into another project's archive band): revoke/escalate, surfacing
     `foreignArchiveHits` — a stray `archive/<other>/` must not be swept onto this branch.
   - **`unattributed_write`** (a production write declared only by a non-complete node):
     revoke/escalate, surfacing `unattributed` — the producer claims it did not run, so the write is
     unreviewed.

   In every case the `write-halt --reason consent` transaction is the same; only the message differs.
   `write_set_granularity` / `write_set_overflow` are a one-line re-author + re-freeze; the other
   three are genuine security/attribution escalations.

   **Halt-triage operator touchpoints (#440).** When `close-and-open-next` returns
   `result: refuse, reason: barrier_failed` AND you call `write-halt`, the returned payload
   carries a `triage` object alongside the halt markers. Read it to understand the subtype and
   the computed repair hint before surfacing the halt to the operator:

   ```json
   {
     "class": "lockfile_write | mirror_write | count_bump | write_set_overflow | unclassified",
     "testDelta": "<optional: RED/GREEN summary from chain-receipt or node evidence>",
     "proposed_repair": {
       "kind": "write_set_swap | add_to_write_set | revert_overflow",
       "node": "<node-id>",
       "paths": ["<overflow-path>", "..."]
     }
   }
   ```

   The three subtype classes:
   - **`lockfile_write`** — the overflow path is a dependency lockfile
     (`package-lock.json`, `yarn.lock`, `go.sum`, etc.) auto-generated by a package manager
     during the node's work. The `proposed_repair.kind` is `add_to_write_set`: declare the
     lockfile explicitly in this node's write set and re-freeze. The node's writes are otherwise
     correct; no revert is needed.
   - **`mirror_write`** — the overflow path is a byte-identical cross-edition mirror file
     (e.g. `kaola-workflow-adaptive-schema.js`). The `proposed_repair.kind` is `add_to_write_set`:
     the mirror file belongs in this node's write set alongside the canonical. Re-freeze after
     adding it.
   - **`count_bump`** — the overflow paths are contract-validator or test-script files that track
     a count of scripts/commands/agents. These files MUST be edited atomically with the files
     being counted. The `proposed_repair.kind` is `write_set_swap`: move the count-bump files
     INTO this node's write set (or add a separate node that declares them) and re-freeze.

   The `proposed_repair` object is **computed, never applied automatically**. The operator
   reviews it and performs the plan edit manually, then re-freezes. The `testDelta` field
   (when present) summarises recent RED/GREEN test state from `chain-receipt.json` or the
   node's evidence file — it is informational context for the operator, not a repair directive.

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
and BLOCKING whole-plan in Finalization, so an unresolved in-scope actionable defect can never silently
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

### Re-opening an already-complete node (frozen-plan repair — #308, mid-gate #343)

The bounded controller above repairs a finding on the node that is *currently* `in_progress`. When
a repair must reach a node already marked `complete` — a Finalization-surfaced barrier/verdict
failure attributed to an upstream node, or a finding whose `fix_role` work belongs to a node the
loop has already closed — do NOT hand-edit `workflow-plan.md`. Run the first-class repair
transaction:

```
node "$KAOLA_SCRIPTS/kaola-gitea-workflow-adaptive-node.js" reopen-node --project {project} --node-id N --json
```

`reopen-node` resets node N and its **post-dominating** gate node(s) (`code-reviewer` /
`security-reviewer` / `adversarial-verifier`) from `complete → pending`, removes their stale
`.cache/barrier-base-<id>` baselines, reopens N to `in_progress`, and re-records a fresh node-start
baseline at the current merged state — so the re-run is barrier-clean and the gate MUST re-approve.
It **refuses** over a live parallel batch / interrupted top-up (`member.opening: true`), over a
target node that is not `complete`, and — typed `would_orphan_in_progress` — when any
`in_progress` row is NOT a post-dominating gate of N (close or quiesce that node first). A
post-dominating gate that is itself still **`in_progress`** is NOT a refusal: it folds back to
`pending` in the same transaction (#343), with its stale baseline removed. Readiness is
**transitive** (#308): a downstream sink whose own direct deps are still `complete` is correctly
withheld until the reopened gate re-passes, so the plan cannot race ahead of the repair.

**Mid-gate repair (#343).** When a gate that is currently `in_progress` emits a blocking finding
whose fix belongs to an already-`complete` upstream node N, do NOT close the failed gate and do
NOT advance the DAG toward allDone on the known-broken tree. Run `reopen-node N` directly: the
`in_progress` gate folds back to `pending`, N reopens with a fresh baseline, and after the repair
lands `close-and-open-next N` re-opens the gate for a fresh re-review. (The previous workaround —
close the failed gate and run the remaining nodes to allDone before reopening — worked only
because the per-node `--verdict-check` is **informational**; the **blocking** verdict enforcement
is at Finalization. That distinction still holds, but the allDone detour is no longer required.)

After it returns, re-enter the per-node loop at the
reopened node and reflect BOTH ledger transitions in the task list (N and its reset gate). If the
ledger is missing a row for any node (a hand-authored or externally-edited plan),
`kaola-gitea-workflow-plan-validator.js --freeze --repair` reconciles `## Node Ledger` to `## Nodes` — adding a
`pending` row per missing node, never dropping a status — and does not move `plan_hash`.

## Caps

`FANOUT_CAP` (default 4, env `KAOLA_FANOUT_CAP`) is a **runtime concurrency limit** (#303), NOT a
planning width cap — the validator accepts a fan-out wider than `FANOUT_CAP` (write-role members must
still be pairwise-disjoint); the executor runs at most `FANOUT_CAP` at once and drains the rest via
`top-up`. `test_thrash` ≥ 3, file overflow declared+1 / absolute backstop of 6, the static loop
bound — enforced per node at the barrier.

`KAOLA_FANOUT_CAP_READONLY` (default 8) is the **read-only** batch cap, separate from the write-side `FANOUT_CAP`: read-only members (verification/research fan-outs) are zero-blast-radius — no worktrees, no writes, evidence recorded parent-side — so `open-batch` and `top-up` pick the cap by batch kind and the cheap half of the system is not throttled to the conservative write cap. Write-role frontiers keep `FANOUT_CAP` (and serial-degrade today).

## Completion

Completion begins only after the `finalize` sink row has been closed and `close-and-open-next`
returns `{allDone:true}`. At that point every ledger row is `complete` or `n/a`.

**Chain-receipt verification (#432):** Before routing to Finalization, when all code-producing nodes
are complete, run `kaola-gitea-workflow-run-chains.js` to produce `.cache/chain-receipt.json`. This
receipt is required by the finalize gate — absent, stale, or red receipts produce typed refusals
(`chains_unverified`, `chains_stale`, `chains_red`). Run it as the LAST step before entering
finalization so the receipt's `headSha` matches the current HEAD commit:

```bash
node $KAOLA_SCRIPTS/kaola-gitea-workflow-run-chains.js
```

If any chain is known-failing with an open issue, use `--accept-known-red <name>:<issue-number>`
(e.g. `--accept-known-red codex:234`). The receipt must be current (`headSha` matches HEAD) when
you enter finalization — running chains before a subsequent commit yields `chains_stale`.

Route to `kaola-workflow-finalize {project}` (adaptive runs have no `phase5-review.md`; finalize anchors on
the all-complete plan).
