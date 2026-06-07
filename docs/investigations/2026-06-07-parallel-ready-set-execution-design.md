# Parallel Ready-Set Execution — Design Reference

**Date:** 2026-06-07
**Status:** Design (issue #281)
**Relates to:**
- `kaola-workflow/issue-281/.cache/design-blueprint.md` (architect blueprint, authoritative source)
- `docs/investigations/dynamic-workflow-composition-2026-06-02.md` (adaptive grammar catalogue)
- `docs/investigations/2026-06-06-six-workflow-patterns.md` (Fanout-And-Synthesize, Adversarial Verification)
- Issue #281

---

## Why this document exists

The adaptive executor has always been able to compute a ready frontier of multiple eligible sibling nodes — `kaola-workflow-next-action.js` already returns a `readySet` that can contain N members. But the plan-run SKILL/command opens and dispatches exactly one node at a time, so multi-node frontiers are only a topological/validation feature, not wall-clock parallel execution.

Issue #281 implements true parallel ready-set execution: a new `kaola-workflow-parallel-batch.js` aggregator that manages batch lifecycle STATE for a group of eligible frontier siblings. The plan-run SKILL (running in the main session) then uses that state machinery to issue multiple concurrent `Agent()` calls in one message.

This document is the design reference for nodes 3–9 of the issue #281 plan. It translates the architect blueprint into implementation-ready prose, maps every acceptance criterion, and records honest partial status for the constraints that are real but bounded.

---

## 1. The load-bearing constraint — STATE vs. DISPATCH

**The harness's only real concurrency is the MAIN SESSION issuing multiple `Agent()` calls in ONE message. A script cannot spawn agents. A subagent cannot dispatch a subagent.**

This is not a gap to close — it is the architecture the whole harness rests on. Every aggregator script (next-action, commit-node, adaptive-node, adaptive-handoff) is a pure state machine over files; none of them spawn agents. The new `parallel-batch.js` follows the same contract.

The design therefore splits responsibility at a hard boundary:

| Who | Owns | Does NOT own |
|-----|------|-------------|
| `kaola-workflow-parallel-batch.js` | Batch STATE (ledger flips, baselines, manifest, sealing, joining) | Dispatching. Never spawns an agent. |
| plan-run SKILL / main session | Concurrent DISPATCH (multiple `Agent()` in one message, one per batch member) | Modifying the ledger or manifest directly. |

`parallel-batch.js` is pure composition over `next-action.js`, `commit-node.js`, and `plan-validator.js`, mirroring the pattern `adaptive-node.js` uses: it shells sibling scripts via `execFileSync` (see `adaptive-node.js:66-75`) and never `require()`-and-mutates them.

**A green plan-run is NOT evidence of wall-clock parallelism.** Unit tests on `parallel-batch.js` prove STATE correctness. The only observable concurrency is at host runtime when the main session issues the concurrent `Agent()` calls.

---

## 2. `kaola-workflow-parallel-batch.js` subcommands

The CLI mirrors `adaptive-node.js:11-20`: `<subcommand> --project P --json`.

Path resolution follows `adaptive-node.js:40-49, 774-778`:
```
planPath = path.join(repoRoot, 'kaola-workflow', project, 'workflow-plan.md')
statePath = path.join(repoRoot, 'kaola-workflow', project, 'workflow-state.md')
cacheDir  = path.join(repoRoot, 'kaola-workflow', project, '.cache')
manifestPath = path.join(cacheDir, 'active-batch.json')
```

Sibling-script filename constants (the ONLY lines the forge forks rename):
```js
const NEXT_ACTION  = 'kaola-workflow-next-action.js';
const COMMIT_NODE  = 'kaola-workflow-commit-node.js';
const VALIDATOR    = 'kaola-workflow-plan-validator.js';
```

### 2.1 `open-batch --project P [--max N] --json`

1. Shell `next-action` → read `readyPending` (the openable frontier).
2. If `readyPending` is empty: return `{result:'ok', allDone, opened:[]}` — defer to the legacy single-node loop or Phase-6.
3. **Eligibility classification:**
   - All-read-only (empty write sets): eligible, no isolation required.
   - All-write-role over pairwise-disjoint declared write sets: eligible (re-confirm disjointness via validator, fail-closed on overlap).
   - Mixed read-only + write-role: open the read-only subset first; never mix in one batch.
4. Cap to `min(readyPending.length, FANOUT_CAP, --max)`. `FANOUT_CAP` defaults to 4, overridden by `KAOLA_FANOUT_CAP` env (see `adaptive-schema.js:44`).
5. For each selected member: flip ledger row `pending → in_progress` (allowFrom: `['pending']`); write plan once after all flips.
6. For each selected member: shell `commit-node --node-id <id> --start --json` to record the idempotent per-member baseline (`validator:1003-1017`, mirrors `runOpenNext:442-453`).
7. Write `active-batch.json` with state `'open'`.

**Output:**
```json
{
  "result": "ok",
  "batchId": "<uuid>",
  "state": "open",
  "members": [
    {
      "id": "node-a",
      "role": "code-explorer",
      "model": "<resolved>",
      "declared_write_set": [],
      "kind": "read_only",
      "baseline": "<sha>",
      "worktreePath": null
    }
  ],
  "allDone": false
}
```

**Refuse shapes:** `next_action_failed` / `not_disjoint` / `baseline_failed` / `node_not_in_ledger`

### 2.2 `seal-member --project P --node-id N --json`

1. Shell `commit-node --node-id N --json` — the unchanged per-node barrier (`validator:1028-1048`, identical to `runCloseAndOpenNext` step b in `adaptive-node:528`).
2. On `ok`: flip ledger row `in_progress → complete` (allowFrom: `['in_progress', 'n/a']`); append compliance row (`adaptive-node:550-565`); apply selector routing if applicable (`adaptive-node:567-590`); set `manifest.members[N].sealed = true`.
3. Does NOT advance to the next node. Does NOT delete the manifest.
4. Refuse on barrier failure — no close, no ledger mutation.

**Output:** `{result, nodeId, state:'sealed'|'failed', ...}`

### 2.3 `seal --project P --json`

Loops `seal-member` over every still-open (unsealed) member in document order. Sets `manifest.state = 'sealed'` only when ALL members are in a terminal-or-complete state.

**Output:** `{result, state, sealed:[], pending:[], failures:[]}`

### 2.4 `join --project P --json`

- Precondition: `manifest.state === 'sealed'`; else refuse `not_all_sealed`.
- **Read-only batch:** no-op for joining (no writes to merge). Delete manifest; return `{result:'ok', state:'joined', joined:[], skipped_read_only:[<ids>]}`.
- **Write-role batch:** for each member with a `worktreePath`, run path-scoped idempotent merge:
  ```sh
  git -C <parent> checkout <member-ref> -- <each declared path>
  ```
  Because write sets are pairwise-disjoint (proven at `open-batch`), checkouts cannot conflict. IDEMPOTENT: re-checking out identical content is a no-op.
  - Set `manifest.state = 'joining'` before starting; record `joined: true` per member as it completes.
  - If the host lacks isolated worktree support, the write-role frontier degrades to serialized execution (see §10 Honest Partials).
  - On full success: `manifest.state = 'joined'`; orchestrator deletes manifest and re-enters `next-action`.

**Output:** `{result:'ok', state:'joined', joined:[], skipped_read_only:[]}`

### 2.5 `status --project P --json`

Read-only. Returns the parsed manifest (or `{active:false}` if none), cross-checked against ledger statuses and `.cache` evidence/baseline presence. Never mutates.

---

## 3. The batch manifest — `active-batch.json`

**Location:** `kaola-workflow/{project}/.cache/active-batch.json`

This is a NON-HASHED runtime artifact. The `plan_hash` covers only `## Meta` and `## Nodes` (`validator:70-73`). The manifest lives in the `.cache` lane beside `barrier-base-{nodeId}` SHA files (`validator:986`) and `.cache/{node-id}.md` evidence files. It survives a lost or regenerated `workflow-state.md`.

**Manifest shape:**
```json
{
  "batchId": "<uuid>",
  "state": "open",
  "kind": "read_only",
  "members": [
    {
      "id": "node-a",
      "role": "code-explorer",
      "declared_write_set": [],
      "baseline": "<sha>",
      "worktreePath": null,
      "sealed": false,
      "joined": false
    }
  ],
  "createdAt": "<iso-timestamp>"
}
```

### 3.1 Why `BATCH_STATES` lives in `parallel-batch.js`, not `adaptive-schema.js`

`adaptive-schema.js` is byte-identical across all four editions and is registered in `COMMON_SCRIPTS`. **No node in the frozen plan declares any `*adaptive-schema.js` path in its write set**, so the per-node barrier would refuse any write to that file. Adding `BATCH_STATES` there is blocked by the frozen plan's write-set containment check.

Additionally, the batch lifecycle states are aggregator-local vocabulary — they have no meaning outside `parallel-batch.js`. Keeping them in the aggregator that owns the manifest follows the same locality principle as the selector vocabulary in `commit-node.js`.

Definition:
```js
const BATCH_STATES = Object.freeze(['open', 'dispatched', 'sealed', 'joining', 'joined']);
```

---

## 4. Five batch lifecycle states — crash/resume

**Rule (AC#5):** Multiple `in_progress` ledger rows are LEGAL ONLY when a valid `active-batch.json` exists whose `members` set exactly matches the `in_progress` set. Any other configuration is a typed refusal (`orphan_multi_in_progress`) — a repair-state concern, never silently tolerated.

The `orient` subcommand (`adaptive-node:341-371`) today finds the FIRST `in_progress` node and breaks (`adaptive-node:357`). Under parallel batches, `orient` enumerates ALL `in_progress` rows, reads the manifest via `parallel-batch status`, and applies the legality gate:

- `≤1 in_progress AND no manifest` → legacy path; keep existing `inProgressNode`/`cacheState` fields.
- `≥1 in_progress AND manifest present AND member-set equals in_progress set` → valid batch; return new `batch:{state, members:[{id, cacheState, sealed}]}` field alongside `inProgressNodes:[...]`.
- `>1 in_progress AND no manifest / mismatch` → typed refuse `orphan_multi_in_progress`.

`consentHalt`, `escalatedToFull`, and `allDone` are unchanged.

| State | Durable artifact(s) | How orient/resume reconstructs |
|-------|---------------------|-------------------------------|
| `open` | Manifest `state:'open'`; N ledger rows `in_progress`; N baseline SHA files; NO member `.cache/*.md` evidence | Re-dispatch all members (baselines are idempotent — `--start` is safe to re-run) |
| `dispatched` | Manifest `state:'open'` or `'dispatched'`; some members have `.cache/{id}.md` | Per-member: absent evidence → re-dispatch; evidence present but ledger still `in_progress` → run `seal-member` only (do not re-dispatch) |
| `sealed` | Manifest `state:'sealed'`; all member rows `complete`/`n/a` | Write-role: run `join`; read-only: delete manifest, re-enter `next-action` |
| `joining` | Manifest `state:'joining'`; per-member `joined` flags | Re-run `join` — already-merged members are no-ops (idempotent checkout) |
| `joined` | Manifest `state:'joined'` (transient) | Delete manifest; re-enter `next-action` |

---

## 5. `next-action.js` additive change (AC#1 / AC#5)

The existing `readySet`, `nextNode`, `allDone`, and the deadlock-stall predicate at `next-action.js:62, 65-91, 96` are BYTE-UNCHANGED. This is a hard requirement for back-compat: `test-next-action.js` existing assertions must pass without modification.

**Additions** (inserted after the existing `readySet`/`allDone` block):

```js
const readyPending = readySet.filter(n => st(n.id) === 'pending');
const active = nodes.filter(n => st(n.id) === 'in_progress').map(n => ({
  id: n.id,
  role: n.role,
  dependsOn: n.dependsOn,
  model: resolveModel(n.role),
  declared_write_set: n.writeSetRaw,
  shape: n.shape.kind
}));
```

**Return:** `{ result:'ok', readySet, nextNode: readySet[0]||null, allDone, readyPending, active }`

- `readyPending`: members of `readySet` whose own ledger status is `'pending'` — these are the nodes that `open-batch` can open. A node that is already `in_progress` stays in `readySet` (it is not TERMINAL, so next-action's deadlock refusal at line 86 does not fire for a fully-in-progress frontier), but it drops out of `readyPending`.
- `active`: all currently `in_progress` nodes; `active.length > 1` is the AC#5 multi-in_progress signal that indicates a live batch.

The `readyPending` vs `active` distinction lets the plan-run SKILL make the correct dispatch decision:
- `readyPending.length >= 2` → batch path.
- `readyPending.length == 1` → single-node legacy path.
- `readyPending.length == 0` AND `active.length >= 1` → resume in-progress batch (orient + crash-resume logic).

The byte-identical claude-plugin pair and the two renamed forge forks carry the same addition.

---

## 6. Ordered capability — read-only first, write-role second (AC#2 / AC#3)

This is an ORDERED capability, not a scope reduction. Read-only batches ship first and are fully supported. Write-role batches are the fuller capability and require isolated node worktrees.

### 6.1 Read-only batches (AC#2 — ships complete)

- Empty write sets → no filesystem isolation required.
- `open-batch` flips `in_progress` + records empty-diff baselines.
- The SKILL dispatches all N members in one message, each with `subagent_type = member role` and `Working directory = ${ACTIVE_WORKTREE_PATH}` (shared worktree, no isolation needed).
- Per-member evidence lands at `.cache/{role}-{claim-id}.md`.
- `seal-member` barriers each (empty declared set → empty diff → trivially passes the per-node barrier).
- Downstream unblocks once all members are `complete`/`n/a` — automatic via `next-action` readiness (all `depends_on` must be TERMINAL, `next-action:70`).
- Use cases: Fanout-And-Synthesize research legs, Adversarial Verification skeptic fan-outs, quorum reviews, multi-modal sweeps.

### 6.2 Write-role batches (AC#3 — ordered/partial, see §10)

- All members must have pairwise-disjoint declared write sets (proven at validator freeze time, re-confirmed in `open-batch`).
- Each member gets an isolated node worktree keyed by `(projTag, node-id)` (`validator:987-991`) so N concurrent members never clobber each other's baselines.
- `seal-member` barriers each member against its own worktree/baseline — the existing per-node barrier catches lane overflow (a member writing outside its declared set fails the barrier, even under concurrency).
- `join` merges disjoint paths idempotently into the parent worktree. No attribution ambiguity: each path belongs to exactly one member (proven at `open-batch`).
- Where the host lacks isolated-worktree support, write-role batches degrade to serialized execution (§10).

### 6.3 Downstream stays closed automatically

Downstream nodes depend on batch members via `depends_on`. `next-action` requires all `depends_on` targets to be TERMINAL before a node enters `readyPending`. Because TERMINAL = `{complete, n/a}`, no downstream node can open until every required batch member is done. No new gate is needed — this is the existing readiness semantics, applied unchanged.

---

## 7. plan-run protocol — "one frontier unit at a time"

The current plan-run protocol is "one role node at a time." After this feature, it becomes **"one FRONTIER UNIT at a time."** The legacy single-node path is preserved with zero change; the batch path is additive.

**Frontier unit:** either a single node (legacy) or a batch (when `readyPending` has ≥2 eligible siblings).

### 7.1 Single-node unit (unchanged)

`open-next → dispatch → record-evidence → close-and-open-next`. No change to any aggregator.

### 7.2 Batch unit (new path)

1. **Orient** — batch-aware orient reads ALL `in_progress` rows and checks the manifest.
2. **Decide unit** — if `readyPending.length >= 2` and members are eligible: batch path. Else: single-node.
3. **open-batch** — `parallel-batch open-batch --project P --json`. Flips N ledger rows to `in_progress`, records N baselines, writes manifest `state:'open'`.
4. **Concurrent dispatch** — MAIN SESSION issues multiple `Agent()` calls in ONE message:
   - One per batch member.
   - Each carries `subagent_type = member role`, `model = member model`.
   - Write-role members: `Working directory = <member isolated worktree>`.
   - Read-only members: `Working directory = ${ACTIVE_WORKTREE_PATH}` (shared).
   - **The script never dispatches. This step is in the SKILL, not in `parallel-batch.js`.**
5. **record-evidence per member** — each subagent writes `.cache/{id}.md` evidence.
6. **seal** — `parallel-batch seal --project P --json`. Barriers each member through unchanged `commit-node`.
7. **join** — `parallel-batch join --project P --json`. No-op for read-only; path-scoped checkout for write-role.
8. **Delete manifest** — orchestrator deletes `active-batch.json`.
9. **Re-enter next-action** — terminal members unblock downstream.

---

## 8. Gate, verdict, and Phase-6 compatibility (AC#7)

**Batches add ZERO new barrier or gate surface.** There is no new machinery — only N invocations of the existing per-node machinery.

| Existing check | Batch behavior |
|----------------|---------------|
| Per-node `commit-node --node-id N` barrier (`validator:1028-1048`) | Called once per batch member via `seal-member`. Unchanged code path. |
| `--gate-verify` over `## Node Ledger` (`validator:980-984`) | A batch produces normal `complete` rows in the ledger; no new column or format. |
| `--verdict-check` per-node (`commit-node:107-120`) | Read-only skeptic batch is exactly the quorum case (issues #251, #279); unchanged machinery. |
| Phase-6 whole-plan `--barrier-check` union floor (`validator:1049-1058`) | After `join`, all member writes are in the parent tree and covered by the write-set union allowlist. |

A `code-reviewer` post-dominating a fanout group post-dominates ALL members individually (graph structure is unchanged; the validator computes post-dominance over the frozen graph as always). Write-role members whose paths overlap the gate's implied allowlist are no different from sequential write-role nodes.

---

## 9. Four-edition parity (AC#8)

| Surface | Action |
|---------|--------|
| `scripts/kaola-workflow-parallel-batch.js` | New file; root + `plugins/kaola-workflow/scripts/` copy are BYTE-IDENTICAL. Add to `COMMON_SCRIPTS` in `validate-script-sync.js:39-65`; compare loop `147-155` enforces byte-identity. |
| `scripts/kaola-workflow-next-action.js` | Already in `COMMON_SCRIPTS:54`. Root + claude copy receive the same additive change; byte-identity auto-verified. |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-parallel-batch.js` | Renamed fork — only `NEXT_ACTION`, `COMMIT_NODE`, `VALIDATOR` constants and the `spliceLedger` `require` path differ. |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-parallel-batch.js` | Same as gitlab fork. |
| Renamed next-action forks (gitlab, gitea) | Same additive change as root, same one-line rename discipline. |
| `install.sh` | Add base name to github/codex `SUPPORT_SCRIPT_NAMES` block (~line 142); `kaola-gitlab-workflow-parallel-batch.js` to gitlab block (~line 174); `kaola-gitea-workflow-parallel-batch.js` to gitea block (~line 208). Three arrays. |
| `package.json` | Add `node scripts/test-parallel-batch.js` to the claude test chain (~line 36). |
| `validate-workflow-contracts.js` (root + claude) | Assert `parallel-batch.js` exists; assert `install.sh` includes the names. Byte-identical pair. |
| `validate-kaola-workflow-contracts.js` | Assert the `plugins/kaola-workflow/scripts/` copy exists. |
| `validate-kaola-workflow-{gitlab,gitea}-contracts.js` | Add forge-named script to the script-name enumeration. |
| `adaptive-schema.js` | NOT TOUCHED. `BATCH_STATES` lives in `parallel-batch.js` (see §3.1). |
| Forge test files (`test-{gitlab,gitea}-workflow-scripts.js`) | NOT TOUCHED — these do not enumerate aggregator scripts today (verified: `grep -c = 0`); adding a count-bump there would be spurious. |

---

## 10. Honest infeasibility and honest partials

These are design realities to be stated plainly, not silent drops.

### 10.1 Wall-clock parallelism is not demonstrable by `parallel-batch.js` or its unit tests

A script cannot dispatch agents. `test-parallel-batch.js` proves STATE correctness (manifest transitions, ledger flips, disjointness enforcement, crash-resume paths). It does not and cannot prove that two agents ran simultaneously — the only observable concurrency is at host runtime when the main session issues multiple `Agent()` calls. Claim parallelism only at host runtime, never in the unit test suite.

### 10.2 The BUILD of this feature uses zero concurrency

The plan for issue #281 is a sequential DAG, executed by the installed one-node-at-a-time executor. Editing `scripts/parallel-batch.js` during the build does not break the running loop (the executor shells it fresh each time), but `fanout(...)` would add blast radius and trip governance. The FEATURE supports write-role fanout; the BUILD of it does not use it. This is consistent, not contradictory.

### 10.3 Write-role join is the genuine hard edge (honest partial for AC#3)

- Read-only batches (AC#2) ship complete and fully supported.
- Write-role batches (AC#3) require isolated node worktrees with per-member `(projTag, node-id)` keyed baselines. The design handles the hard edges:
  - Disjointness is proven at validator freeze time and re-confirmed at `open-batch` (fail-closed on overlap).
  - Each member seals against its own worktree/baseline (existing per-node barrier catches lane overflow).
  - The `join` step is path-scoped and idempotent (re-checkout of identical content is a no-op; partial/crashed join recovers by re-running only unmerged members).
- **Where the host lacks isolated-worktree support, write-role batch members degrade to serialized execution** — opened one at a time, same per-node lifecycle, correctness preserved, wall-clock parallelism forgone. This is an intentional degradation path, not a failure mode.

---

## 11. Implementation file and anchor map

| Component | File | Key anchors |
|-----------|------|-------------|
| New aggregator | `scripts/kaola-workflow-parallel-batch.js` | `BATCH_STATES`, `open-batch`, `seal-member`, `seal`, `join`, `status` subcommands |
| Claude-plugin copy (byte-identical) | `plugins/kaola-workflow/scripts/kaola-workflow-parallel-batch.js` | Same |
| Gitlab fork | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-parallel-batch.js` | Renamed `NEXT_ACTION`/`COMMIT_NODE`/`VALIDATOR` consts only |
| Gitea fork | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-parallel-batch.js` | Same as gitlab |
| next-action change | `scripts/kaola-workflow-next-action.js` | Add `readyPending`, `active` after `readySet`/`allDone` block; `readySet[0]` unchanged |
| next-action unit tests | `scripts/test-next-action.js` | Add assertions for `readyPending` / `active`; existing assertions unchanged |
| Batch unit tests | `scripts/test-parallel-batch.js` | State-machine tests; no concurrency testing |
| Script sync | `scripts/validate-script-sync.js` | Add `parallel-batch.js` to `COMMON_SCRIPTS` (lines 39-65) |
| Install registration | `install.sh` | Three `SUPPORT_SCRIPT_NAMES` blocks (~lines 142, 174, 208) |
| Package test chain | `package.json` | Add `node scripts/test-parallel-batch.js` (~line 36) |
| Contracts (root+claude) | `scripts/validate-workflow-contracts.js` | `assert(exists('parallel-batch.js'))` + `assertIncludes(install.sh, names)` |
| Contracts (plugin root) | `scripts/validate-kaola-workflow-contracts.js` | Assert plugin copy exists (~lines 283-288) |
| Contracts (forge) | `validate-kaola-workflow-{gitlab,gitea}-contracts.js` | Add fork name to script-name enumeration |
| plan-run semantics | `commands/kaola-workflow-plan-run.md` + forge copies + SKILL | Change "one role node at a time" → "one FRONTIER UNIT at a time" |
| Planner profile | `agents/workflow-planner.md` + 3 forge `.toml` files | Add efficient-DAG instruction (canonical string, byte-identical ×4) |
| orient change | `scripts/kaola-workflow-adaptive-node.js:341-371` | Enumerate ALL `in_progress` rows; add legality gate; add `inProgressNodes[]` + `batch` field |
| spliceLedger | `scripts/kaola-workflow-adaptive-node.js:834-843` | EXPORTED pure splicer; `parallel-batch.js` imports it for ledger flips |
| Manifest | `kaola-workflow/{project}/.cache/active-batch.json` | Runtime artifact; not in `plan_hash` |

### Workflow-planner efficient-DAG instruction (canonical string — byte-identical ×4, contracts assert inclusion)

```
Author EFFICIENT DAGs, not merely valid DAGs. Minimize the safe critical path; expose
independent work as siblings (a shared ready frontier) so the executor can open them as one batch;
serialize only for true dependencies, shared file lanes, selectors, loops, or gates. Read-only
verification/research siblings are zero-blast-radius — prefer fanning them out. Write-role siblings
must declare disjoint write sets to be batch-eligible.
```

---

## 12. Acceptance-criteria coverage map

| AC | Summary | Design section | Honest status |
|----|---------|---------------|---------------|
| AC#1 | `next-action` (or batch scheduler) distinguishes ready-pending from active in-progress | §5 — `readyPending` + `active` as pure-subset additions; `readySet`/`nextNode` byte-unchanged | Complete |
| AC#2 | Multiple read-only fanout nodes can be opened as one batch, dispatched concurrently, sealed, joined, and used to unblock downstream | §6.1 — read-only batches: no isolation, empty-diff baselines, trivial seal, downstream closes automatically | Ships complete |
| AC#3 | Multiple write-role `fanout(...)` nodes over disjoint write sets can run in isolated worktrees and join without attribution ambiguity | §6.2, §10.3 — write-role batches: isolated worktrees, disjoint proven at freeze + re-confirmed in `open-batch`, idempotent path-scoped join; degrades to serialized where host lacks worktree support | Honest partial — correctness preserved, parallelism conditional on host support |
| AC#4 | Downstream dependencies do not open until every required batch member is `complete` or `n/a` | §6.3 — downstream closure is automatic via existing `next-action` readiness semantics; no new gate | Complete |
| AC#5 | Multiple `in_progress` ledger rows are legal only with a valid active batch manifest; otherwise typed refusal/repair-state | §4 — legality gate in `orient`; `orphan_multi_in_progress` typed refusal | Complete |
| AC#6 | Crash/resume is covered for open, dispatched, sealed, joining, and joined batch states | §4 — lifecycle table with durable artifact and reconstruction per state | Complete |
| AC#7 | Per-node barrier, gate execution, verdict checks, and Phase 6 merge gates continue to pass | §8 — zero new gate surface; N invocations of existing per-node machinery | Complete |
| AC#8 | Four-edition parity is maintained | §9 — byte-identical root+claude pair; renamed gitlab/gitea forks; `adaptive-schema.js` not touched | Complete |
