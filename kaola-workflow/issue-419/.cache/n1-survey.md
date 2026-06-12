89f266aae9e5
evidence-binding: n1-survey 89f266aae9e5

## Survey: Parallelism Machinery — issue-419 n1-survey

### 1. Three Coordination Machines

#### 1a. Serial Loop (`open-next` / `close-and-open-next` in `adaptive-node.js`)

The serial loop is the original and still-dominant execution path. Lifecycle:

1. `orient` — reads the plan, shells `--resume-check` + `next-action`, reads the batch manifest and running-set (both read-only), and returns the live-coordination state, `inProgressNode`, `cacheState`, and (since #303) `enterBatch` / `frontier` signals. Read-only on plan/ledger/state.

2. `open-next` — flips one pending node's ledger row to `in_progress` (`spliceLedgerNode` with `allowFrom:['pending']`), then shells `commit-node --start` to record the per-node baseline. Guard prologue: `halt:true, excl:['scheduler','batch']`. No `integrity` layer (orient on the documented resume path already runs `--resume-check`).

3. Role agent runs; records evidence to `.cache/{node-id}.md`.

4. `close-and-open-next` — commit + fused-advance step. Order: (a) evidence-shape check → (b) barrier (shells `commit-node --barrier-check + --gate-verify`) → (c) ledger close (`in_progress → complete`) + compliance row append → (d) running-set removal (#411 BUG B fix) → (e) selector routing → (f) next-action fused advance. Returns `opened` with the next node's `nonce`. Guard prologue: `halt:true, excl:['batch']`.

The serial loop produces exactly one `in_progress` row at a time. Under the serial fallback (no running-set, no active-batch, ≤1 in_progress), every guard prologue layer is vacuously-pass: serial path is byte-identical to pre-#383 behavior.

Key file: `scripts/kaola-workflow-adaptive-node.js`

#### 1b. `#377` Running-Set Scheduler (`open-ready` / `close-node` / `reconcile-running-set`)

The running-set scheduler is the per-node event-driven fan-out introduced in #377. It tracks individual concurrent nodes in `.cache/running-set.json`.

**Running-set structure:** `{ state:'opening'|'open', nodes:[{id, role, kind, baseline, opening?, model?, openedAt?}], updatedAt }`. Two-phase crash-safe write; crash recoverable via `reconcile-running-set`.

**`open-ready` flow:**
- Guard prologue: `integrity:true, halt:true, excl:['serial','batch']`. Does NOT exclude the scheduler surface itself.
- If any live node is a write node, returns `{reason:'write_node_exclusive'}`.
- Classifies frontier: read-only nodes fan out up to `fanoutCapReadonly` (default 8, env `KAOLA_FANOUT_CAP_READONLY`) minus already-live nodes; write node opens alone only when running set is empty; if write nodes ready but reads live, returns `{reason:'write_awaits_drain'}`.
- Priority-orders openable frontier by `longestPathToSink`, excluding `main-session-gate` nodes.
- Two-phase write: Phase 1 writes running-set in `state:'opening'` → Phase 2 records baselines + flips rows → Phase 3 promotes to `state:'open'`.

**`close-node` flow:**
- Guard prologue: `integrity:true, halt:true` — NO coordination exclusion (closing one of its own live members must not refuse over other live members).
- Steps: evidence-shape + nonce binding → barrier → ledger `in_progress → complete` + compliance row → selector routing → remove closed node from running-set → shell `next-action` to return newly-ready frontier.
- Does NOT auto-open the next node; orchestrator calls `open-ready` again.

**`reconcile-running-set` (crash recovery):** Handles open-direction crash (`state:'opening'` or `opening:true` nodes), close-direction crash (completed node still in running set), and stale-member direction (non-live member in open set). Drops per-node baseline via `--drop-base` for every dropped member.

Key file: `scripts/kaola-workflow-adaptive-node.js` — functions `runOpenReady` (~line 2109), `runCloseNode` (~line 2269), `runReconcileRunningSet` (~line 2401).

#### 1c. `parallel-batch.js` — Batch-as-a-Unit Scheduler

The parallel-batch scheduler treats a frontier as a single unit. Active state lives in `.cache/active-batch.json`.

**Manifest structure:** `{ batchId, state:'opening'|'open'|'sealed'|'joined', kind:'read_only'|'write_role', members:[{id, role, model, declared_write_set, kind, baseline, sealed, opening?}], createdAt }`. Note `'joining'` was removed in #364 (write-role path excised); lifecycle is now `opening → open → sealed → joined`.

**FANOUT_CAP:** Two caps:
- `FANOUT_CAP` (default 4, env `KAOLA_FANOUT_CAP`): write-side cap, effectively unused since write-role batches serial-degrade.
- `FANOUT_CAP_READONLY` (default 8, env `KAOLA_FANOUT_CAP_READONLY`): the active read-only batch cap. A **runtime concurrency limit**, NOT a planning width cap.

**`open-batch` flow:**
1. Integrity gate (`--resume-check`).
2. Coordination guard: `excl:['serial','scheduler']`.
3. Active-manifest precondition: refuses if live non-joined manifest exists (unless idempotent re-open of same live batch).
4. Classifies frontier: write-role returns `{degraded:true, reason:'cwd_unenforceable'}` — serial-degrade unconditionally.
5. Caps with `capMembers(members, {fanoutCap: effectiveCap, max})`.
6. BASELINES-FIRST ordering (record baselines before any ledger mutation).
7. Two-phase write: manifest `state:'opening'` → flip all member ledger rows → promote to `state:'open'`.

**`top-up` flow:** Drains remaining same-frontier siblings when worker slots free up (`capacity = kindCap - runningCount`). Coordination guard: `excl:['scheduler']` only.

**`seal` / `seal-member` flow:** `sealOne` per unsealed member: evidence-shape check → barrier (against PARENT planPath since all batch members are read-only post-#364) → ledger `in_progress → complete` + compliance row → member `sealed:true`. Manifest transitions to `state:'sealed'` only when ALL members terminal.

**`join` flow:** Since all batches are read-only post-#364, `join` just transitions `sealed → joined` (idempotent). `joining` state removed along with write-role members.

Key file: `scripts/kaola-workflow-parallel-batch.js`

---

### 2. Pairwise Exclusion Matrix — `#383` Guard Prologue and `#411` Close-Side Holes

#### The `#383` guard prologue: `mutationGuardPrologue`

Located at ~line 2058–2106 in `adaptive-node.js`. Three layers:

```
// Layer 1 INTEGRITY (#387): shell validator --resume-check; refuse plan_integrity_failed.
// Layer 2 HALT FENCE (#391b): durable consent_halt → refuse halt_pending.
// Layer 3 LIVE-COORDINATION (#383): probeCoordination → refuse serial_node_live | scheduler_active | batch_active per per-command exclusion set.
```

Per-command exclusion matrix:

| Subcommand | integrity | halt | excl-serial | excl-scheduler | excl-batch |
|---|---|---|---|---|---|
| `open-next` | no | yes | no (is serial) | yes | yes |
| `open-ready` | yes | yes | yes | no (owns scheduler) | yes |
| `close-and-open-next` | no | yes | no (is serial) | no (gap, #411) | yes |
| `close-node` | yes | yes | no (owns members) | no (owns members) | no (owns members) |
| `reopen-node` | no | no | — | yes (via direct guard) | yes (via direct guard) |
| `open-batch` | yes (via batchCoordGuard) | yes | yes | yes | no (handles itself) |
| `top-up` | yes (via batchCoordGuard) | yes | no | yes | no (handles itself) |

Three `coordinationRefusal` arms build typed refusals:
- `serial_node_live`: one `in_progress` row, no running-set, no batch
- `scheduler_active`: running-set live or opening
- `batch_active`: batch manifest live or opening

`readCoordinationState`:
```javascript
const serialLive = inProgressIds.length === 1 && !runningSetLive && !batchLive && !runningSetOpening && !batchOpening;
```

#### `#411` Close-Side Matrix Holes

**BUG A (fused-advance nonce):** `close-and-open-next` did not surface the evidence-binding `nonce` for the newly-opened node in its return value. The nonce was read from `baselineResult.base` instead of `baselineResult.recordBase.base`. Fix: read `baselineResult.recordBase.base` and slice to 12 chars — same derivation `runOpenNext` and `runOpenReady` use.

```javascript
// #411 BUG A fix present in HEAD:
nonce: (baselineResult.recordBase && baselineResult.recordBase.base)
  ? String(baselineResult.recordBase.base).slice(0, 12) : null,
```

**BUG B (running-set-blind close):** `close-and-open-next` closed a node without removing it from `running-set.json`. Next `orient` saw `in_progress`-ledger-complete mismatch → `reconcile-running-set` returned `not_opening` (no-op) — permanent wedge loop. Fix: add step (d) after close: remove closed node from running set (delete if empty), mirroring `runCloseNode`. Guard prologue updated to include `excl:['batch']`.

```javascript
// #411 BUG B fix present in HEAD:
const running = readRunningSet(runningSetPath, cacheExists, readFile);
if (running) {
  const remaining = (running.nodes || []).filter(n => n.id !== nodeId);
  // ... write or delete running set
}
```

**Both fixes confirmed present in the worktree HEAD (v5.15.0, commit 8444a7f)** — the `#411` comment text says "was running-set-blind" (past tense) and the code that follows IS the fix.

---

### 3. ADR 0008 + `#386` Addendum

**ADR 0008** (`docs/decisions/0008-excise-write-role-batch-isolation.md`): Status Accepted, issue #364, date 2026-06-11.

**Context:** Write-role batch member-worktree isolation was:
1. Unreachable by default since #320 (defaulted false, serial-degraded before provisioning).
2. Non-functional if force-enabled (harness cannot force dispatched subagent CWD; members wrote to parent worktree, seal refused `empty_member`).

**Decision:** Excise it. Write-role frontiers serial-degrade unconditionally. `join` is now manifest-only `sealed → joined`. `joining` state removed. `KAOLA_BATCH_CWD_ENFORCED` / `resolveBatchCwdEnforced` retired.

**Stated reintroduction condition (verbatim from ADR §"Reintroduction condition"):**
> Reintroduce per-member write isolation **only** when the harness gains a real working-directory / write-lane enforcement primitive:
> - **#376** — a `PreToolUse` `Write|Edit` containment hook (`KAOLA_LANE_CONTAINMENT`, fail-closed default false) that denies out-of-lane writes at write time.
> - **#377** — a per-node running-set scheduler (`.cache/running-set.json`) that provisions one worktree per *node* (not per batch-as-a-unit) only when lane containment resolves true, with serial as the permanent fallback.

**`#386` Addendum (write-lane hook self-exempt + Bash-bypass posture):**

The `#376` write-lane PreToolUse hook (`hooks/kaola-workflow-write-lane.sh`) blocked writes matching an open node's declared lane — including the open write node writing its own lane. Resolution chosen: **architecture (ii)** — rule (b) self-exempts the open write node's own lane:
```
if (nodes[j].kind === "write") process.exit(0)  // self-exempt
```

**Bash-bypass posture:** The hook intercepts `Write|Edit` ONLY. Bash-mediated writes (`echo >`, `sed -i`) bypass it. This is intentional layering: hook is fast-fail containment; per-node `--barrier-check` allowlist + seal vacuity guard is the ground truth.

**`KAOLA_LANE_CONTAINMENT` — dormant status:**

In `scripts/kaola-workflow-adaptive-schema.js`:
```javascript
const LANE_CONTAINMENT_ENV = 'KAOLA_LANE_CONTAINMENT';
function resolveLaneContainment(env) {
  const raw = (env || {})[LANE_CONTAINMENT_ENV];
  return raw === '1' || raw === 'true' || raw === 'yes';
}
```
Defaults to FALSE. Defined, exported, tested — but:
- The aggregators (`adaptive-node.js`, `parallel-batch.js`) mention it ONLY in comments as the "reintroduction condition".
- It is read by the PreToolUse hook script (`hooks/kaola-workflow-write-lane.sh`), not by the Node.js aggregators.
- **Lane containment enforcement is dormant by default.**

---

### 4. Freeze Stamps: `parallel_safe` and `write_node_exclusive`

A search for both strings in `scripts/kaola-workflow-plan-validator.js` returned **no matches**.

- `write_node_exclusive` appears in `adaptive-node.js` (~line 2155) ONLY as a runtime return reason from `runOpenReady` when a write node is live — not a freeze-time annotation.
- `parallel_safe` does not appear anywhere in the codebase.

**Conclusion: The freeze step does NOT currently stamp `parallel_safe` or `write_node_exclusive` annotations on plan nodes. These are proposed Part 2 additions per the #419 plan notes. They do not exist today.**

---

### 5. `longestPathToSink` in `next-action.js`

File: `scripts/kaola-workflow-next-action.js`

**Computation (~lines 148–165):**

```javascript
const children = new Map(nodes.map(n => [n.id, []]));
for (const n of nodes) for (const d of n.dependsOn) {
  if (children.has(d)) children.get(d).push(n.id);
}
const lpMemo = new Map();
const longestPathToSink = id => {
  if (lpMemo.has(id)) return lpMemo.get(id);
  lpMemo.set(id, 0); // provisional (cycle guard)
  let best = 0;
  for (const c of (children.get(id) || [])) best = Math.max(best, 1 + longestPathToSink(c));
  lpMemo.set(id, best);
  return best;
};
```

Standard longest-path-in-DAG by depth-first memoization. Sink scores 0; one step before sink scores 1; etc.

**How it affects dispatch priority:**

`readyPending` is annotated with `longestPathToSink` values and sorted descending (longest path first), with document order as stable tiebreak:

```javascript
const readyPending = readySet
  .filter(n => st(n.id) === 'pending')
  .map(n => Object.assign({}, n, { longestPathToSink: longestPathToSink(n.id) }))
  .sort((a, b) => (b.longestPathToSink - a.longestPathToSink) || (docIndex.get(a.id) - docIndex.get(b.id)));
```

`open-ready` consumes this sorted `readyPending` directly → critical-path nodes open first (standard list scheduling for minimizing makespan).

**Gap — batch path does not use it:** `parallel-batch.js` uses `deriveReadyPending(nextAction.readySet || [], ledger)` which filters `readySet` (not `readyPending`). The `readySet` array is NOT sorted by `longestPathToSink`. So the batch path does NOT open critical-path-first. This is a subtle ordering gap.

---

### 6. "One frontier unit at a time" — Six Plan-Run Surfaces

All six surfaces confirmed. The description frontmatter line is identical across all six:

**Claude command + GitLab command + Gitea command (3 surfaces):**
```
description: Kaola-Workflow Adaptive Executor. Executes a frozen workflow-plan.md via a running-set scheduler; each frontier unit dispatched when its dependencies complete. Resume-safe.
```

**Claude Codex SKILL + GitLab Codex SKILL + Gitea Codex SKILL (3 surfaces):**
```
description: Use when executing a frozen adaptive workflow-plan.md — executes via a running-set scheduler; each frontier unit dispatched when its dependencies complete. Resume-safe. Mirror of commands/kaola-workflow-plan-run.md for Codex runtime.
```

Body prose across all six: "dispatching one frontier unit at a time and checkpointing between calls."

All six surfaces also document the batch and running-set scheduler paths within the "frontier unit" framing. No surface uses the word "serially" in the description.

---

## Summary

The parallelism machinery today has three layered coordination surfaces: (1) **serial loop** (`open-next` / `close-and-open-next`): the default and serial-fallback path — exactly one `in_progress` row, vacuously-pass guard prologue, byte-identical to pre-#383 under fallback conditions; (2) **batch scheduler** (`parallel-batch.js`): treats a ready-pending frontier as a unit (`opening → open → sealed → joined`), reads-only fan-out only today because write-role batches unconditionally serial-degrade since #364 excised the member-worktree isolation path; (3) **running-set scheduler** (`open-ready` / `close-node`, #377): tracks individual concurrent nodes in `running-set.json` — reads fan out up to `FANOUT_CAP_READONLY` (default 8), write nodes open alone (permanent serial fallback).

The `#383` guard prologue is the single layered mutual-exclusion gate in front of every mutating subcommand; it prevents co-scheduling across surfaces. Two `#411` bugs in `close-and-open-next` (missing nonce in fused-advance output; running-set-blind close) are fixed in the current worktree HEAD (v5.15.0). `KAOLA_LANE_CONTAINMENT` defaults to FALSE — the PreToolUse write-lane hook (#376) is dormant. The freeze step stamps NO `parallel_safe` or `write_node_exclusive` annotations today; these are proposed Part 2 additions. `longestPathToSink` is computed by `next-action.js` and used by `open-ready` for critical-path-first priority, but the `parallel-batch` path does not consume it (subtle ordering gap). All six plan-run surfaces consistently use "each frontier unit dispatched when its dependencies complete" in frontmatter and "dispatching one frontier unit at a time" in body prose.

docs: complete
