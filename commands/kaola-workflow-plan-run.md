---
description: Kaola-Workflow Adaptive Executor. Executes a frozen workflow-plan.md via a running-set scheduler; each frontier unit dispatched when its dependencies complete. Resume-safe.
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
Finalization (which anchors on the all-complete ledger, not a phaseN artifact). Stop
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
# Resolve the scripts dir for every adaptive lifecycle call below (#344). $KAOLA_SCRIPTS is
# referenced by every node transaction but was never defined in any edition — in a consumer
# plugin install there is no local scripts/ dir, so the calls would depend on the LLM guessing
# the plugin-cache path. Define it ONCE here, before the first use, via the same kaola_script()
# resolver class as kaola-workflow-adapt.md / kaola-workflow-finalize.md. Carry both variables
# across the node transactions below (exactly as ACTIVE_WORKTREE_PATH is carried).
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n" "./scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
KAOLA_SCRIPTS="$(dirname "$(kaola_script kaola-workflow-adaptive-node.js)")"
```

When `worktree_path` is absent or empty (e.g. `KAOLA_WORKTREE_NATIVE=0`, offline, no-git, or this
very issue's own adaptive run which has `worktree_path: ''`), the resolver yields an empty string
and the fallback sets `ACTIVE_WORKTREE_PATH` to the repo root — the orchestrator behaves EXACTLY as
before this change. The mirror below is SKIPPED in that case. If `worktree_path` is recorded but the
directory no longer exists (e.g. it was pruned), the `-d` guard falls back to `$(pwd)` for safety.

```bash
# Mechanical main→worktree project-folder mirror (#335) — atomic + plan_hash-verified.
# Idempotent: mirrors once at first entry, NEVER overwrites an existing worktree copy (on
# resume the worktree copy is authoritative). Run it from anywhere — it resolves the MAIN
# checkout via git-common-dir and the worktree from workflow-state.md. Do NOT hand-`cp`.
node "$KAOLA_SCRIPTS/kaola-workflow-adaptive-node.js" mirror-project \
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
node "$KAOLA_SCRIPTS/kaola-workflow-adaptive-node.js" orient \
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
  `in_progress` node. On the user's explicit approval, run the adaptive-node **`clear-halt
  --project {project} --reason consent`** subcommand (#360) — ONE typed transaction that removes
  the `consent_halt: pending` line from the `## Node Ledger` AND clears `escalated_to_full:
  consent` (plus the coupled `escalated_to_full: security`) from `workflow-state.md`, replacing
  the prior contractor lockstep (ADR 0004/0005). It refuses typed `no_halt_present` (zero
  mutation) if there is no durable halt. Then resume the ready set — never re-ask an authorization already granted.
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

## Governance — a frozen in-grammar plan RUNS; `decision:ask` is audit metadata, not an approval gate

The plan reaching plan-run is **already frozen** (the `workflow-planner` + adaptive handoff froze
it). The validator's `decision` (`auto-run` vs `ask`) is **recorded audit metadata** — plan-run
proceeds **either way, with no user-approval gate**. Re-read the verdict (`--json`); do not re-derive
risk by hand, and **do not pause to ask the user** before running an in-grammar frozen plan.

- **in-grammar (`decision:auto-run` OR `decision:ask`) → run.** `decision:ask` records that the
  validator flagged sensitivity (frozen labels OR a declared write set touching auth / payments /
  user data / filesystem / external-API / secrets), a WRITE-ROLE fan-out (N ≥ 2), a `SHARED_INFRA`
  touch, the file ceiling, a bounded loop, or uncertainty (fail-closed). That flag is surfaced in the
  Planning Evidence / handoff packet for the audit trail; it does **not** stop the run. Read-only
  verification/research fan-out is zero-blast-radius.
- **run authorization is `provisional`:** running the frozen plan does not pre-authorize any write —
  each node's per-node barrier re-checks ACTUAL writes at commit time and can still refuse.
- **plan-run HALTS only on a real signal:** a typed refusal (resume-check / barrier finds the plan
  out-of-grammar or tampered after freeze), a per-node barrier failure (an out-of-allowlist write, or
  a sensitive write with no security-reviewer), or a durable consent-halt / test-thrash escalation the
  node loop writes. None of these is a discretionary "ask the user first."
- **out-of-grammar → typed refusal.** Unknown role, a gate routed around, a cap busted, or a
  non-disjoint write-role fan-out. Never silently clamp.

## Per-Node Loop

For each ready node, run the Phase-4-style loop, generalized from a phase ladder
to a plan DAG. The main session **owns the loop, runs the typed script transactions, and dispatches
the role** (a subagent cannot dispatch a subagent, so the loop control flow stays with the
orchestrator). The main session runs the `kaola-workflow-adaptive-node.js` transactions directly
(deterministic, no contractor subagent needed for mechanical transitions) and **judges** the
governance decisions (ADR 0004/0005: main session owns loop + dispatch + judgment; scripts own
deterministic transitions).

**Task list = the workflow nodes.** The main session keeps a task list (use **TodoWrite**) with one
item per `## Nodes` row (`id · role`, in `depends_on` order) — established by `/kaola-workflow-adapt`
after freeze, or, on a direct resume, reconstructed here from the `## Node Ledger`.

**Apply the returned `taskTransitions` after EVERY successful ledger-mutating script call (#317).**
Every mutating command — `open-next`, `close-and-open-next`, `write-halt`, `reopen-node`, and the
batch commands `open-batch`/`top-up`/`seal-member`/`seal`/`reconcile` — returns a machine-readable
`taskTransitions` array (`{id, status, ledger_status, reason, note?}`) plus a `taskMirror` field. **Do
not infer** which nodes changed: apply each transition's `status` to its task verbatim. The fused
`close-and-open-next` returns BOTH the committed node (`completed`) AND the newly-opened node
(`in_progress`) — apply both. After `open-batch` returns, mark **every** returned member `in_progress`
**before** dispatching its subagent (the #284 inference failure was leaving batch members `pending`
while their subagents ran). A node committed `n/a` arrives as `status: completed`. A halt transition
arrives with `status: in_progress` + a `note` (e.g. `HALTED: <reason>`) — keep it `in_progress`, never
`completed`. The script also refreshes the durable `workflow-tasks.json` mirror on each mutation
(reported in `taskMirror`); a `taskMirror.status: failed` is non-fatal (the ledger transition still
held — fail-open). This task list is a **live mirror** for visibility; the durable `## Node Ledger`
stays the single source of truth, so reconcile the task list to the ledger on every resume rather than
trusting a stale in-session list.

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

**Logical width vs runtime concurrency (#303):** the planner authors the best logical DAG — a
`fanout(<group>)` may be **wider than `FANOUT_CAP`** when the subtasks are genuinely independent.
`FANOUT_CAP` is a **runtime concurrency limit** (max concurrently-running subagents), NOT a planning
validity cap. `open-batch` opens at most `FANOUT_CAP` members of an over-cap frontier and leaves the
rest **queued** (ready-but-pending); `top-up` drains the queue by **rolling bounded dispatch** —
starting the next queued sibling as each running one finishes.

**Deciding the unit:** read `readyPending` from `orient`/`close-and-open-next`:
- The scheduler is **batch-aware**: `orient` signals `enterBatch:true` when the START frontier has
  ≥2 own-pending siblings (a plan that *starts* with a fan-out), and `close-and-open-next` returns
  `enterBatch:true` (instead of single-opening) when closing a node exposes a ≥2-wide frontier — so
  a downstream fan-out is **never serialized** behind one member.
- `enterBatch:true` (or `readyPending.length >= 2`) → **batch path** (below).
- otherwise → **single-node path**: run steps 1–4 below as today, with zero change.
- The frontier and `enterBatch` are computed over **delegable** nodes only — a
  `main-session-gate` (#334) is never a batch member (the main session cannot run concurrently
  with itself) and always runs on the single-node path.

**Batch eligibility rules** (checked by `open-batch`, which first runs a `--resume-check` integrity
gate and refuses `plan_integrity_failed` on a tampered/unfrozen plan — zero mutation):
- All-read-only (empty declared write sets): eligible; no worktree isolation required.
- Any write-role frontier (#364): serial-degrades — `open-batch` returns `degraded:true` with zero
  mutation and the orchestrator opens the write siblings one at a time via `open-next` (the
  member-worktree isolation path was excised; the harness cannot force a subagent's CWD).
- Mixed read-only + write-role: open the read-only subset first (the write members serial-degrade).
- An existing live `active-batch.json` blocks a fresh open (`active_batch_exists`); an `opening`
  manifest must be repaired first (`reconcile_first`). Re-opening the SAME live frontier is idempotent.

**Batch path — steps:**

**(a)** `parallel-batch open-batch`:
```bash
node "$KAOLA_SCRIPTS/kaola-workflow-parallel-batch.js" open-batch \
  --project {project} --json
```
`open-batch` opens at most `FANOUT_CAP` members of a **read-only** frontier (a wider frontier leaves
the rest **queued** for `top-up`). It records N baselines (idempotent, #239), then performs the
**crash-safe two-phase commit**: it writes `kaola-workflow/{project}/.cache/active-batch.json` with
`state: 'opening'` (the intended member set) **before** flipping the N ledger rows
`pending → in_progress`, then promotes the manifest to `state: 'open'`. It returns
`{result:'ok', batchId, state:'open', members:[{id, role, model, declared_write_set, kind, baseline}], allDone:false}`.
A crash between the two file writes leaves an `opening` manifest that `status`/`orient` flag as
**reconcilable** (not an orphan) — run `parallel-batch reconcile` (roll-forward) or
`reconcile --abort` (roll-back) to repair it.

**Write-role frontiers serial-degrade (#364):** the member-worktree isolation path was excised — this
harness cannot FORCE a dispatched subagent's working directory (the `Working directory:` line below is
advisory prose), so a write-role batch would leak its edits into the parent worktree. `open-batch` (and
`top-up`) therefore serial-degrade a write-role frontier UNCONDITIONALLY, returning
`{result:'ok', degraded:true, reason:'cwd_unenforceable', opened:[], allDone:false}` with ZERO
mutation. On `degraded:true`, the orchestrator `log()`s the degradation (so the forgone parallelism is
visible, never silent) and opens the write siblings one at a time via `open-next` — same per-node
lifecycle as today, correctness preserved. This is also why a frozen coarse-area-overlapping write
antichain (in-grammar/ask at freeze) never hits a runtime refusal — the serial degrade fires. The
reintroduction condition (a real cwd/lane-enforcement primitive) is tracked by #376/#377; see
`docs/decisions/0008-excise-write-role-batch-isolation.md`. Read-only batches are unaffected.

**(b)** **Concurrent dispatch — the ONLY real concurrency:** the main session issues **MULTIPLE
`Agent()` calls in ONE message**, one per batch member. Each call carries `subagent_type` = member
role, `model` = per-member model, and `Working directory: ${ACTIVE_WORKTREE_PATH}` (the shared
worktree — batch members are always read-only post-#364; write-role nodes run serially via `open-next`).

**The script manages batch STATE; the orchestrator (main session) owns DISPATCH.
`kaola-workflow-parallel-batch.js` NEVER spawns an agent — the only concurrency is the main
session issuing multiple `Agent()` calls in one message.**

**(b′)** **Background dispatch (#374, design D2) — make rolling `top-up` actually roll:** when the harness supports background subagent dispatch with completion notifications, dispatch each opened member with `run_in_background: true` instead of blocking on one multi-call message. On EACH member's completion notification, immediately run `record-evidence` → `seal-member` → `top-up` (only while `parallel-batch status --json` reports `nextRoute:'top-up'`, per #322) and dispatch the newly opened sibling — so a finished member's slot is refilled while the rest keep running (the rolling bounded dispatch #303 designed, finally reachable). The gang form in (b) — all `Agent()` calls in ONE message — remains the documented FALLBACK for harnesses without background dispatch (correct, but realizes wave not rolling concurrency). No script changes: the aggregators are pure state machines and `top-up` was built for exactly this loop. Honesty: state-level tests never claim wall-clock overlap — verify it on a real run via node-timings.jsonl (#373).

**(c)** `record-evidence` per member — the **orchestrator** records each member's evidence
PARENT-side, with one canonical path `.cache/{node-id}.md` (the same path the serial node uses, and
the same path `seal`'s evidence-shape gate reads). Pipe the returned evidence through
`record-evidence --project {project}` so it always lands in the parent `.cache`. The only documented
exception is the adversarial-verifier fan-out, whose per-skeptic `.cache/adversarial-verifier-*.md`
files feed the validator's quorum check.

**(c′) Rolling top-up — drain an over-cap frontier:** when a member completes, `record-evidence` +
`seal-member` it, then run `top-up` to start the next queued sibling while the others keep running:
```bash
node "$KAOLA_SCRIPTS/kaola-workflow-parallel-batch.js" top-up \
  --project {project} --json
```
`top-up` opens up to (`FANOUT_CAP` − running) more **same-frontier** read-only siblings (never a
downstream node that merely became ready), records their baselines, and appends them to the manifest.
It returns `reason:'at_capacity'` when no slot is free and `reason:'frontier_drained'` once the queue
is empty. Repeat dispatch → seal-member → top-up until drained. (At the **state** level this proves
rolling bounded dispatch; wall-clock overlap depends on whether the harness can run subagents
concurrently / in the background — the script never spawns agents, so it never overclaims.)

**(d)** `parallel-batch seal` — finalize all still-running members:
```bash
node "$KAOLA_SCRIPTS/kaola-workflow-parallel-batch.js" seal \
  --project {project} --json
```
For each member, `seal` applies the SAME gates as the serial path before closing it: the role-shaped
**evidence-shape** check (#319: refuse `evidence_absent` when `.cache/{node-id}.md` is missing, or
`evidence_shape_failed` — with the `missingTokenClass` naming the missing class, e.g. `change-type` —
when present-but-malformed for the role), then the per-node `commit-node` barrier (run against the
parent plan). Manifest transitions to `state: 'sealed'` only when ALL members pass.

**(e)** `parallel-batch join` — transitions a fully-sealed manifest to `joined`:
```bash
node "$KAOLA_SCRIPTS/kaola-workflow-parallel-batch.js" join \
  --project {project} --json
```
Batches are always read-only (#364), so `join` has nothing to merge — every member's evidence already
lives parent-side. It just transitions `sealed → joined` (idempotent) so the `seal → join → advance`
choreography terminates cleanly. After join, the orchestrator deletes the manifest (`active-batch.json`).

**(f)** Re-enter `next-action` — the now-terminal batch members unblock downstream nodes
(existing readiness semantics: `next-action` requires all `depends_on` to be TERMINAL before a
node enters `readyPending`; no new gate needed).

**Drain/termination:** the batch is exhausted when `top-up` reports `frontier_drained` AND every
manifest member is sealed; then `seal → join → advance`. Until then, keep dispatching + topping up.

**Routing — never `top-up` without an active manifest (#322):** decide the next batch command from
`parallel-batch status --json`'s `nextRoute` field, not from a free-form loop. Call `top-up` ONLY
while `nextRoute === 'top-up'` (manifest `open` + valid batch with queued same-frontier siblings).
Once `join` clears the manifest, `status` returns `active:false` / `nextRoute:'orient'` — route to
`adaptive-node orient` → `open-batch` (≥2 frontier) or `open-next` (single), NEVER `top-up` (which
would refuse `no_active_batch`). `nextRoute:'reconcile'` → run `reconcile`; `nextRoute:'join'` → run
`join`.

**Legality rule:** multiple `in_progress` ledger rows are legal ONLY when a valid `active-batch.json`
exists whose UNSEALED `members` set matches the `in_progress` set, **or** (#377) a valid
`running-set.json` exists whose node set matches it. Any other configuration is a typed
refusal (`orphan_multi_in_progress`). The batch lifecycle states are:
`opening → open → sealed → joined` (the dead `dispatched` state was removed in #303; the crash-safe
`opening` transaction marker replaces it; `joining` was removed in #364 with the write-role merge path).

### Per-node running-set scheduler (#377) — event-driven cross-frontier parallelism

The batch path above advances **one whole frontier at a time**: `top-up` only opens same-frontier
siblings, so a downstream node waits for its entire frontier to drain. The **running-set scheduler**
is the post-#364 per-node successor: it opens and closes **individual** nodes against
`kaola-workflow/{project}/.cache/running-set.json`, so a downstream node unblocks the moment ITS deps
close — even while a disjoint sibling is still `in_progress`. It is **additive and opt-in**: the
single-node and batch paths above are unchanged, and the serial behavior is **byte-identical** when
`KAOLA_LANE_CONTAINMENT` is off (the default). Prefer it when the harness supports `run_in_background`
dispatch (#374) and the plan has independent lanes that would otherwise serialize behind a frontier.

- **`open-ready [--max N]`** — flips up to N ready nodes (priority-ordered by `next-action`'s
  `longestPathToSink`, so the critical path opens first), records per-node baselines, and two-phase
  writes the manifest (`opening` → flip ledger → `open`). With containment **off**, it fans out
  **read-only** nodes concurrently (they share the parent tree and never write) but opens a **write**
  node ALONE (one at a time, never alongside a read or another write) — today's serial behavior, the
  permanent fallback. Returns `{opened:[{id,role,kind,model,nonce}], runningSet:[...ids]}`; each
  opened member carries its OWN per-open evidence-binding **`nonce`** (#392, the barrier-base SHA
  prefix recorded for THAT node) — pass each member's `nonce` to ITS dispatch so the role echoes
  `evidence-binding: <id> <nonce>` and `close-node` can verify it. `opened:[]` with
  `reason:'write_node_exclusive'`/`'write_awaits_drain'` means a write node must run alone — wait.
  ```bash
  node "$KAOLA_SCRIPTS/kaola-workflow-adaptive-node.js" open-ready \
    --project {project} --json
  ```
- **dispatch** every opened node `run_in_background:true` (#374), one `Agent()` per node (`subagent_type`
  = role, `model` from the returned descriptor, `Working directory: ${ACTIVE_WORKTREE_PATH}`).
- on **each** completion notification: `record-evidence --project {project} --node-id {id}` (parent-side,
  one canonical `.cache/{id}.md` — the evidence's FIRST line is that member's
  `evidence-binding: <id> <nonce>` header), then **`close-node --node-id {id}`** — same evidence-shape →
  `--barrier-check` → ledger-complete → compliance → selector-arm contract as the serial close (it
  verifies the binding nonce against the on-disk baseline, refusing `evidence_unbound`/`evidence_stale`),
  then it removes the node from the running set and returns `{closed, newlyReady:[...], allDone}`. Then run
  `open-ready` again to fill the freed slot and dispatch the newly-ready nodes. Loop until `allDone`.
  ```bash
  node "$KAOLA_SCRIPTS/kaola-workflow-adaptive-node.js" close-node \
    --project {project} --node-id {id} --json
  ```
- **Drain points unchanged:** a `main-session-gate` (#334) is never an `open-ready` member (it opens on
  the single-node path); consent/security/test_thrash halts and plan-repair stop new dispatch, drain the
  running set, then proceed.
- **Crash/resume:** a crash mid-`open-ready` leaves `running-set.json` in `state:'opening'`. `orient`
  (and `parallel-batch status`) flag it **reconcilable** (`running_set_opening_incomplete`), never an
  orphan — run **`reconcile-running-set`** to roll forward the rows that flipped to `in_progress` and
  roll back those still `pending`, promoting the set to `open`. `orient` reconstructs the live set from
  `running-set.json` on every resume.
  ```bash
  node "$KAOLA_SCRIPTS/kaola-workflow-adaptive-node.js" reconcile-running-set \
    --project {project} --json
  ```
- **Honesty:** state-level transitions are all that the test suite proves. Wall-clock overlap depends on
  real background dispatch — verify it on a real run via `node-timings.jsonl` (#373); the scripts never
  spawn agents, so they never overclaim concurrency. The cross-lane **write+read** overlap the design
  envisions requires the #376 lane-containment worktree primitive and stays **dormant** until
  `KAOLA_LANE_CONTAINMENT` is enabled.

**Crash/resume:** the batch state is fully recoverable from durable artifacts. `opening` → run
`reconcile` (roll-forward to `open`) or `reconcile --abort` (roll-back). `open` → re-dispatch any
member whose evidence is absent (baselines idempotent); a member with present evidence but an
`in_progress` ledger row → run `seal-member` only; if the frontier is not yet drained → `top-up`.
`sealed` → run `join` (idempotent). `joined` → delete manifest, re-enter `next-action`.

1. **open-next — open the next ready node when none is `in_progress`** — run this to open the
   first node (handoff no longer pre-opens it), and on resume to open the next ready node
   **whenever no node is `in_progress`** (first node never opened, OR a node orphaned by a crash
   between a prior node's commit and its fused advance — see step 3). In steady state the fused
   advance inside step 3 opens the next node, so do not re-run this while a node is already
   `in_progress`. Run from `${ACTIVE_WORKTREE_PATH}`:

   ```bash
   node "$KAOLA_SCRIPTS/kaola-workflow-adaptive-node.js" open-next \
     --project {project} --json
   ```

   `open-next` shells `next-action --json`, picks the next ready node (or validates a supplied
   `--node-id`), splices the ledger row to `in_progress`, and shells `commit-node --node-id N
   --start --json` to record the per-instance write baseline (idempotent, #239 — an end-time
   baseline would neuter the barrier). Returns `{opened:{id,role,model,declared_write_set},
   baselineRecorded:true, nonce:"<12-char>"}`, or `{allDone:true}` when every ledger row is
   `complete`/`n/a`. The **`nonce`** (#392) is the per-open evidence-binding token (the barrier-base
   SHA prefix) — pass it to the dispatch in step 2 so the role echoes it in its evidence header; the
   close gate verifies it (anti-copy / anti-replay), refusing `evidence_unbound` / `evidence_stale`.

   On `allDone`, route to Finalization (Completion below) — there is no node to dispatch.
   `allDone` is valid only after the mandatory `finalize` sink node itself has been closed.
   If `open-next` opens a node whose `role` is `finalize`, stay in the per-node loop and use
   the finalize sink contract below instead of routing to Finalization.
2. **dispatch** the node's role (main session — see above). **Pass the returned `model` on the
   `Agent(... model=…)` call for EVERY dispatch** — serial `open-next`, each `open-ready` member, and
   each batch member — exactly as returned; never omit it. The returned `model` already encodes the
   #382 precedence (the plan's per-node `model` tier beats the install profile: `node.model` →
   manifest → role default), so a planner-assigned `opus`/`sonnet` tier reaches the subagent
   automatically (or resolved via `scripts/kaola-workflow-resolve-agent-model.js <role>` on resume).
   **Pass the per-open `nonce` (#392) too** — from `open-next` (serial), each `open-ready` opened
   member, or the fused `close-and-open-next` `opened` payload — and instruct the role to make the
   FIRST line of its evidence the verbatim header `evidence-binding: <node-id> <nonce>`. The close
   gate binds the evidence to THIS dispatch: it refuses `evidence_unbound` (header names another node
   — evidence copied across nodes) or `evidence_stale` (nonce from a prior open — replayed/copied
   evidence). On crash-resume, `open-next --node-id <id>` is idempotent and returns the reused nonce
   for the already-open node — pass that reused nonce to the re-dispatch.
   **Special case — `role: finalize` sink:** `finalize` is the mandatory DAG sink, not a
   dispatchable subagent role. It is expected that
   `scripts/kaola-workflow-resolve-agent-model.js finalize` returns an empty model. When the opened
   node role is `finalize`, do not call `Agent()`. The main session performs the node's declared
   docs/state bookkeeping directly within the validator-allowed finalize write set, then records
   evidence for the `finalize` node:

   ```bash
   echo "<finalize-bookkeeping-evidence>" | \
     node "$KAOLA_SCRIPTS/kaola-workflow-adaptive-node.js" record-evidence \
       --project {project} --node-id {node-id} --stdin --json
   ```

   Then run `close-and-open-next` for that same node. Only after that command returns
   `{allDone:true}` is the DAG complete and ready to route to Finalization. If the close
   refuses, stay in the per-node loop and fix or refuse as with any other node.

   Because the sink runs main-session-direct by design, `close-and-open-next` records its
   Required Agent Compliance row as `main-session-direct` — never `subagent-invoked`, which
   would falsely certify a dispatch that the sink contract forbids. This row covers ONLY the
   in-plan sink bookkeeping; the Finalization phase's mechanical bookkeeping
   (`/kaola-workflow-finalize`) is still delegated to the `contractor` and is attested
   separately (`finalize_contractor_attested`).

   **Special case — `role: main-session-gate` (#334, non-delegable):** like the `finalize`
   sink, this role is never a dispatchable subagent — `resolve-agent-model main-session-gate`
   returns an empty model and you do **not** call `Agent()`. The MAIN session performs the
   node's acceptance procedure itself (the check the plan authored this gate for — e.g. a GPU /
   visual true-black comparison, a device-in-hand verification, an explicit human sign-off).
   When the check needs the user's eyes, surface the artifacts and WAIT for the user's explicit
   confirmation — never infer a pass. Then record verdict evidence (column-0, lowercase):

   ```bash
   printf 'verdict: pass\nfindings_blocking: 0\n<one-line what-was-checked summary>\n' | \
     node "$KAOLA_SCRIPTS/kaola-workflow-adaptive-node.js" record-evidence \
       --project {project} --node-id {node-id} --stdin --json
   ```

   then `close-and-open-next` as for any node. The close REFUSES (`evidence_shape_failed`,
   `missingTokenClass: verdict`) without a parseable `verdict: pass|fail` line, and an `n/a`
   self-skip is refused for this role. Record an honest `verdict: fail` and close — blocking
   happens at Finalization's `--verdict-check`/`--gate-verify` (G3); route the repair via the
   bounded #279 controller / `reopen-node`, after which the gate re-runs (it is reset with the
   reviewer gates). A `main-session-gate` node never joins a parallel batch — when it appears
   in a ready frontier, run it on the single-node path.

   **For non-finalize roles, after the role returns, capture durable evidence immediately** — the
   step-3 close refuses
   (`evidence_absent` if `.cache/{node-id}.md` is absent, `evidence_shape_failed` if present-but-malformed) when it runs.
   The evidence's FIRST line MUST be the `evidence-binding: <node-id> <nonce>` header (#392, the
   `<nonce>` this open returned) so the close gate can verify the evidence is bound to THIS dispatch:

   ```bash
   printf 'evidence-binding: {node-id} {nonce}\n%s\n' "<role-returned-evidence>" | \
     node "$KAOLA_SCRIPTS/kaola-workflow-adaptive-node.js" record-evidence \
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

   **Forge-port mirror nodes (#340):** when the node's declared write set contains a gitlab/gitea
   edition-named port (`plugins/kaola-workflow-{gitlab,gitea}/scripts/kaola-{gitlab,gitea}-workflow-<x>.js`)
   of a root script edited earlier in this run, the dispatch prompt MUST state the canonical spec as
   the **full accumulated root diff** — append to the prompt:
   `Canonical spec: run git diff <run-base>..HEAD -- scripts/kaola-workflow-<x>.js and mirror EVERY
   hunk modulo forge nouns. Do NOT work from a summary of individual upstream nodes.`
   A per-concern enumeration is how the #328 run shipped half a mirror with all four chains green.

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
   **Evidence path (#303 — one canonical contract):** every node writes
   `.cache/{node-id}.md`. The **only** exception is the `adversarial-verifier` fan-out, whose
   per-skeptic files are namespaced `.cache/adversarial-verifier-{claim-id}.md` because the
   validator's quorum check globs `.cache/adversarial-verifier-*.md` — a mechanically-supported
   exception, not free-form drift.

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
3. **close-and-open-next (SCRIPT-ENFORCED typed transaction)** — after the role returns and
   evidence is recorded (step 2), run the fused close+advance from `${ACTIVE_WORKTREE_PATH}`:

   ```bash
   node "$KAOLA_SCRIPTS/kaola-workflow-adaptive-node.js" close-and-open-next \
     --project {project} --node-id {node-id} --json
   ```

   The script enforces the full commit+advance chain in a fixed order (crash-safe write order:
   `.cache` evidence → `## Node Ledger` row → `workflow-state.md` pointer LAST):

   **(a) Evidence-shape PRESENCE check (by role) — BLOCKING gate before the barrier:**
   - `tdd-guide`: `.cache/{node-id}.md` must contain BOTH `RED` AND `GREEN` tokens (or start with
     `n/a` + explicit skip reason). Absent → `{result:'refuse', reason:'evidence_absent'}`;
     present-but-malformed → `{result:'refuse', reason:'evidence_shape_failed', missingTokenClass:'RED'|'GREEN'}`. NO
     mutation.
   - `implementer`: must contain `non_tdd_reason` AND one of `regression-green` / `build-green` /
     `smoke-integration`. Missing → typed refuse, NO mutation.
   - Other write/gate roles: evidence file must be present and non-empty (or `n/a`).
   Sufficiency of the evidence is the main session's judgment; the script only checks presence/shape.

   **(b) Per-node barrier — script-enforced (#231/#239):** shells `commit-node --node-id {node-id}
   --json`. Re-scans the files the node actually wrote against the node's OWN declared write set
   (diffs the recorded baseline — exact THIS node's writes, #239); a fan-out instance overflowing
   into a sibling's lane is refused. The whole-plan barrier in Finalization remains the union-level floor.
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
   `{closed:{node-id}, opened:{id,role,model,declared_write_set,nonce}|null, allDone:true|false}`.
   The `nonce` in the `opened` payload is the per-open evidence-binding token for the newly-opened
   node — pass it to the next dispatch exactly as you would the `nonce` from a standalone `open-next`.

   On barrier fail / missing evidence / selector_invalid → typed refuse, NO advance, NO close. The
   `test_thrash` ≥ 3 tally and the consent escalation DECISION remain main-session–owned; the script
   only transcribes them via `write-halt` (step 4).
4. **judge the barrier (main session — governance).** Read the `close-and-open-next` result:
   - `result: ok` + `opened: {...}` → the node is `complete` AND, per the fused advance, the next
     ready node is **already open**. Dispatch the freshly-opened node (back to step 2) — do not
     re-run a standalone `open-next`. On `allDone: true` → route to Finalization (Completion below). Do
     not treat a node as `complete` until the script returns `result: ok` (barrier exit 0).
   - `result: refuse, reason: barrier_failed` — a write turned out sensitive (a Phase-5 category)
     on a plan with no `security-reviewer` node, or overflowed outside the node's declared allowlist:
     the **provisional** authorization was granted on a now-false premise.
     **Revoke and halt for consent** — this **decision** is yours (the script is never a gate). Run:
     ```bash
     node "$KAOLA_SCRIPTS/kaola-workflow-adaptive-node.js" write-halt \
       --project {project} --node-id {node-id} --reason consent --json
     ```
     `write-halt --reason consent` writes BOTH `escalated_to_full: consent` AND
     `escalated_to_full: security` into `workflow-state.md`, AND writes the durable line
     `consent_halt: pending` into the plan's `## Node Ledger` (#234: a non-hashed section that
     survives a lost/regenerated state file; never write into `## Meta` / `## Nodes`). Then surface
     the pending approval. You decide; the script transcribes the consequence. Idempotent.

     **Surface a PER-REASON actionable message** (#404/#406). Read the TYPED reason at
     `barrierOut.barrierCheck.reason` (the validator classifies the refusal structurally — never
     English-substring the `errors`) so the operator knows exactly what to fix instead of one opaque
     ~45-min escalation. The five typed reasons (with `barrierOut.barrierCheck.{outOfAllow,
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
     - **`foreign_archive`** (a write into another project's archive band): revoke/escalate,
       surfacing `foreignArchiveHits` — a stray `archive/<other>/` must not be swept onto this branch.
     - **`unattributed_write`** (a production write declared only by a non-complete node):
       revoke/escalate, surfacing `unattributed` — the producer claims it did not run, so the write
       is unreviewed.

     In every case the `write-halt --reason consent` transaction is identical; only the surfaced
     message differs. `write_set_granularity` / `write_set_overflow` are a one-line re-author +
     re-freeze; the other three are genuine security/attribution escalations.
   - `test_thrash` ≥ 3 consecutive same-test RED→RED cycles → you escalate the same way:
     ```bash
     node "$KAOLA_SCRIPTS/kaola-workflow-adaptive-node.js" write-halt \
       --project {project} --node-id {node-id} --reason test_thrash --json
     ```
     Writes `escalated_to_full: test_thrash` + `consent_halt: pending`, then stop.

> **Enforcement boundary (#231 — now script-enforced).** Gate *presence* is proven
> statically at freeze (post-dominance over the unique sink). Gate *execution* is now
> proven by `--gate-verify`: a **completed** reviewer must post-dominate every
> completed code/sensitive node in the `## Node Ledger` (closes the G1/H5 leak where a
> reviewer is marked `n/a` at runtime). It is wired into `routeAdaptive` (surfaced as
> `pendingGates`, non-blocking on resume) and enforced as a **hard merge gate** in
> Finalization. The actual-writes re-scan + sensitive/allowlist refusal is `--barrier-check`
> (per-node in the commit bracket, step 3 above, and whole-plan in Finalization). --verdict-check (#251) now script-enforces the reviewer/skeptic verdict (informational
> per-node, BLOCKING in Finalization). What remains agent-discipline is the quorum tally count
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
node "$KAOLA_SCRIPTS/kaola-workflow-adaptive-node.js" reopen-node --project {project} --node-id N --json
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
`kaola-workflow-plan-validator.js --freeze --repair` reconciles `## Node Ledger` to `## Nodes` — adding a
`pending` row per missing node, never dropping a status — and does not move `plan_hash`.

## Caps

`FANOUT_CAP` (default 4, env `KAOLA_FANOUT_CAP`) is a **runtime concurrency limit** (#303): the
executor runs at most `FANOUT_CAP` subagents at once and drains a wider fan-out via rolling
`top-up`. It is NOT a planning width cap — the validator accepts a fan-out wider than `FANOUT_CAP`
(write-role members must still be pairwise-disjoint). `test_thrash` ≥ 3, file overflow declared+1 /
absolute backstop of 6 files, and the static loop bound are enforced per node at the barrier.

`KAOLA_FANOUT_CAP_READONLY` (default 8) is the **read-only** batch cap, separate from the write-side `FANOUT_CAP`: read-only members (verification/research fan-outs) are zero-blast-radius — no worktrees, no writes, evidence recorded parent-side — so `open-batch` and `top-up` pick the cap by batch kind and the cheap half of the system is not throttled to the conservative write cap. Write-role frontiers keep `FANOUT_CAP` (and serial-degrade today).

## Completion

Completion begins only after the `finalize` sink row has been closed and `close-and-open-next`
returns `{allDone:true}`. At that point every ledger row is `complete` or `n/a`; route to Finalization:

```text
/kaola-workflow-finalize {project}
```

Finalization anchors on the frozen plan + all-complete ledger (adaptive projects have
no `phase5-review.md`), then runs the unchanged sink (merge/PR, archive, close,
roadmap regen).
