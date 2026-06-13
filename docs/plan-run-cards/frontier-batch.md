# Card: Parallel Frontier Fan-Out (open-batch / top-up / seal)

**When to read:** `orient` or `close-and-open-next` returns `enterBatch: true`, indicating the
next frontier is a parallel batch of disjoint-write siblings that should be dispatched
concurrently.

**Related:** D-445-01 (skeleton/card split), D-434-01 (repair primitives)

<!-- PIN: frontier unit -->
frontier unit

---

## 1. The frontier unit concept

A **frontier unit** is the set of nodes that are simultaneously unblocked (all predecessors
complete) in the DAG. When the frontier unit contains multiple nodes with disjoint write sets,
they can be dispatched as a parallel batch.

The plan-run's running-set scheduler (`kaola-workflow-parallel-batch.js`) manages the batch
lifecycle. When `enterBatch: true` is returned, the scheduler has determined the frontier is
batch-eligible; you open the batch and dispatch the siblings concurrently.

---

## 2. Confirming batch eligibility

Before opening a batch, check the orient output:

```json
{
  "enterBatch": true,
  "batchNodes": ["n4", "n5", "n6"],
  "degraded": false
}
```

| Field | Meaning |
|---|---|
| `enterBatch: true` | The frontier is batch-eligible |
| `batchNodes` | The sibling node-ids that form this batch |
| `degraded: false` | Lane containment is ON; parallel dispatch is safe |
| `degraded: true` | Lane containment is OFF; use serial fallback (§4) |

---

## 3. `open-batch` — open the parallel batch

```bash
node scripts/kaola-workflow-parallel-batch.js open-batch \
  --batch-id {batchId} \
  --nodes n4,n5,n6 \
  --plan kaola-workflow/{project}/workflow-plan.md \
  --ledger kaola-workflow/{project}/workflow-ledger.md
```

`open-batch` creates the crash-safe two-phase manifest and records the `opening` marker for each
member. It returns the batch manifest, including each member's `write_set` and assigned lane.

After `open-batch`, dispatch the role agents for each sibling concurrently. Each agent receives
its node-id and write-set; they run in parallel within their declared lane.

---

## 4. Serial fallback when `degraded: true`

When `open-batch` returns `degraded: true`, lane containment is OFF (write-role frontiers always
degrade per the schema). In this case, fall back to serial execution:

1. Do NOT proceed with parallel dispatch.
2. Use `open-next` to open one sibling at a time (normal per-node lifecycle).
3. Advance through the frontier sequentially, one node per `close-and-open-next` cycle.

`degraded: true` is not an error — it is the scheduler's intentional safe mode for situations
where parallel lane isolation cannot be guaranteed.

---

## 5. `top-up` — rolling drain as members complete

`top-up` starts the next queued sibling as one finishes, maintaining concurrency up to the
fan-out cap:

```bash
node scripts/kaola-workflow-parallel-batch.js top-up \
  --batch-id {batchId} \
  --plan kaola-workflow/{project}/workflow-plan.md \
  --ledger kaola-workflow/{project}/workflow-ledger.md
```

Use `top-up` when the batch has more members than the concurrency limit allows to run at once.
The `top-up` command respects the `depends-on-member` guard — it will not start a sibling that
depends on another sibling that is still running.

---

## 6. `seal-member` — close one batch member's evidence

When a single batch member's role agent completes and its evidence is recorded:

```bash
node scripts/kaola-workflow-parallel-batch.js seal-member \
  --batch-id {batchId} \
  --node-id n4 \
  --evidence-file kaola-workflow/{project}/.cache/n4.md \
  --plan kaola-workflow/{project}/workflow-plan.md \
  --ledger kaola-workflow/{project}/workflow-ledger.md
```

`seal-member` verifies the evidence is non-empty and that the member's writes are contained
within its declared lane (vacuity guard — an empty member worktree does NOT pass seal). After
sealing, the member's status transitions to `sealed` in the manifest.

---

## 7. `seal` — close the entire batch

Once all members are `sealed`:

```bash
node scripts/kaola-workflow-parallel-batch.js seal \
  --batch-id {batchId} \
  --plan kaola-workflow/{project}/workflow-plan.md \
  --ledger kaola-workflow/{project}/workflow-ledger.md
```

`seal` runs the tree-aware join (handling deletes and renames across lanes) and updates the
ledger to mark all batch members `complete`. After a successful `seal`, the scheduler returns
to the per-node lifecycle for the next frontier.

---

## 8. `reconcile` — crash repair for running-set

If the batch crashes mid-flight (e.g., a member agent dies, the manifest is partially written):

```bash
node scripts/kaola-workflow-parallel-batch.js reconcile \
  --batch-id {batchId} \
  --plan kaola-workflow/{project}/workflow-plan.md \
  --ledger kaola-workflow/{project}/workflow-ledger.md
```

`reconcile` inspects the manifest, removes stale `opening` markers, and returns each member to
a consistent state. After reconciliation, re-run `orient` to determine whether to re-dispatch
crashed members or proceed to `seal` if all members are already `sealed`.

---

## 9. In-lane write validation before `seal-member`

Before sealing a member, confirm the member's writes are contained within its lane:

```bash
git -C <member-worktree> status --porcelain
```

The output must be non-empty (the member made writes) AND all paths must be within the member's
declared `write_set`. An empty status means the member made no writes — seal would pass
vacuously, which is invalid. A path outside the declared set means the member leaked a write
to the parent worktree, which must be caught before the join contaminates shared state.

---

## 10. Parallel vs serial — when to use each

| Condition | Approach |
|---|---|
| Disjoint write sets + lane containment ON | Parallel batch (`open-batch` → dispatch → `seal-member` → `seal`) |
| Write-role frontier | Serial degrade (`degraded: true` → `open-next` per node) |
| Overlapping or unknown write sets | Serial (treat as write-role frontier) |
| `depends-on-member` relationship | Serial within the dependency chain; parallel across independent chains |

When in doubt, use serial. The plan-run is correct with serial execution; parallel is an
optimization for disjoint frontiers, not a requirement.

---

## Quick reference — batch lifecycle

```
enterBatch: true
  |
  +-- degraded: true -----> serial fallback: open-next per node
  |
  +-- degraded: false ----> open-batch
        |
        dispatch siblings concurrently (one per lane)
        |
        for each member as it completes:
          record-evidence -> seal-member (verify non-empty in-lane writes)
        |
        +-- top-up (if more members queued) -> dispatch next sibling
        |
        all members sealed -> seal (tree-aware join)
        |
        back to per-node lifecycle for next frontier
        |
        crash at any point -> reconcile -> orient -> resume
```
