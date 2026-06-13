# Card: Reopening a Complete Writer Node

**When to read:** A node with `status: complete` needs to be re-run — either because its
output was found to be incorrect, because a barrier refusal requires repair of an already-closed
node, or because a downstream review node determined the writer's work was insufficient.

**Related:** D-445-01 (skeleton/card split), D-434-01 (sanctioned repair primitives),
D-424-01 (`--drop-base` anti-laundering model)

---

## 1. `repair-node` vs `reopen-node` — the anti-laundering distinction

Two subcommands can re-open a complete node. They differ in how they treat the barrier baseline:

| Subcommand | Baseline behaviour | When to use |
|---|---|---|
| `repair-node` | Keeps original baseline (`baselineReused: true`) | Overflow recovery, crash repair, any re-run where the barrier must measure the SAME diff as the original window |
| `reopen-node` | Takes a fresh baseline snapshot | **DO NOT use for overflow recovery.** A fresh baseline launders the node's accumulated writes: the barrier measures only the NEW diff, hiding what was already written. |

**The rule:** Use `repair-node` for any re-run that follows a barrier refusal or a repair
dispatch. `reopen-node` is only valid when the node's prior window is fully clean and a
genuinely fresh start is warranted — which is rare and must be explicitly justified.

`--drop-base` (which drops the baseline entirely) is banned by D-424-01. No `operator_hint`
string in any aggregator registry references it.

---

## 2. Running `repair-node`

```bash
node scripts/kaola-workflow-adaptive-node.js repair-node \
  --node-id {nodeId} \
  --plan kaola-workflow/{project}/workflow-plan.md \
  --ledger kaola-workflow/{project}/workflow-ledger.md
```

Confirm the output shows `baselineReused: true`. This confirms the original baseline was kept
and the barrier will measure the full diff from the original window open.

After `repair-node`, dispatch the fix agent with the same write set as the original node. The
fix agent replaces or corrects the files within the declared set. Then:

```bash
node scripts/kaola-workflow-adaptive-node.js record-evidence \
  --node-id {nodeId} \
  --evidence-file kaola-workflow/{project}/.cache/{nodeId}.md \
  --plan kaola-workflow/{project}/workflow-plan.md \
  --ledger kaola-workflow/{project}/workflow-ledger.md

node scripts/kaola-workflow-adaptive-node.js close-and-open-next \
  --node-id {nodeId} \
  --plan kaola-workflow/{project}/workflow-plan.md \
  --ledger kaola-workflow/{project}/workflow-ledger.md
```

---

## 3. The reopen-needs-allDone trap

The most common mistake when reopening a complete node is forgetting about the node that came
AFTER the reopened node in the plan.

**Scenario:** Node n3 is `complete`. You reopen n3 via `repair-node`. But n4 (which came after
n3 and is also `complete`) is now in an inconsistent state — its predecessor changed.

**What happens:** When you try to close-and-open-next on n3 again, the selector may attempt to
advance to n4. But n4 is already `complete`, so `close-and-open-next` may fail or produce an
unexpected state.

**Resolution:**
1. Let the current node (n3's reopen) run to `allDone` — do not try to manually patch n4.
2. After `allDone`, reopen n4 using `repair-node` as well.
3. Re-dispatch n4's role agent.
4. Close n4 normally.

The selector's advancement logic handles `allDone` gracefully. Only attempt to reopen a
successor AFTER the predecessor has fully closed.

---

## 4. `baselineReused: true` — confirming original baseline retention

After `repair-node`, always verify the output:

```json
{
  "result": "ok",
  "nodeId": "n3",
  "baselineReused": true,
  "baselineTimestamp": "2026-06-13T..."
}
```

If `baselineReused` is `false` or absent, the original baseline was NOT kept. Stop immediately:
do not dispatch the fix agent until you understand why the baseline was reset. A missing
baseline causes the barrier to compare against the wrong snapshot.

---

## 5. After re-dispatch — run the commit bracket to close

Once the fix agent has written its corrections and evidence is recorded, close the node normally:

```bash
node scripts/kaola-workflow-adaptive-node.js close-and-open-next \
  --node-id {nodeId} \
  --plan kaola-workflow/{project}/workflow-plan.md \
  --ledger kaola-workflow/{project}/workflow-ledger.md
```

If the barrier passes (`result: ok`), the ledger updates to `complete` and the selector advances
to the next node. If the barrier refuses again, read the [repair-routing card](repair-routing.md).

---

## 6. Stale gate baseline — when to delete it

If a node was reset from `complete` to `pending` and then re-opened via `repair-node`, there
may be a stale gate-baseline file in `.cache/`:

```bash
ls kaola-workflow/{project}/.cache/barrier-base-{nodeId}
```

**If you used `repair-node`:** The script manages the baseline reuse internally — do NOT delete
the baseline file before running `repair-node`. The script reads it to keep it.

**If you are doing a full reset** (complete → pending via ledger edit, then re-opening with a
genuinely fresh baseline): delete the stale baseline BEFORE running `open-next`:

```bash
rm kaola-workflow/{project}/.cache/barrier-base-{nodeId}
```

Failing to delete a stale baseline in the full-reset case causes `open-next` to record a new
baseline while `barrier-check` still reads the old one — producing a diff that is incorrect.

---

## Decision tree

```
Need to re-run a complete node?
  |
  +-- Overflow recovery / repair dispatch -----> repair-node (baselineReused: true required)
  |
  +-- Genuinely fresh re-run (justified) ------> reopen-node (rare; not for overflow)
  |
  +-- DO NOT use --drop-base (banned, D-424-01)

After repair-node:
  dispatch fix agent -> record-evidence -> close-and-open-next
    |
    +-- barrier pass -> advance normally
    |
    +-- barrier refuse -> [repair-routing card]
    |
    +-- successor already complete -> let run to allDone, then repair-node the successor
```
