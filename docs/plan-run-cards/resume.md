# Card: Resume After Crash or Interrupt

**When to read:** The plan-run was interrupted (agent crash, session timeout, manual abort) and
you need to re-enter the run loop without losing work or corrupting the ledger.

**Related:** D-445-01 (skeleton/card split), D-434-01 (repair primitives)

---

## 1. Re-run `orient` first

Always start recovery with a read-only `orient` call. This is safe to run at any point — it
does not mutate the ledger or running-set, and it tells you exactly where the plan-run left off.

```bash
node scripts/kaola-workflow-adaptive-node.js orient \
  --plan kaola-workflow/{project}/workflow-plan.md \
  --ledger kaola-workflow/{project}/workflow-ledger.md
```

Read the output fields:

| Field | Meaning |
|---|---|
| `resume_state` | `"clean"`, `"mid_node"`, or `"crashed"` |
| `active_node` | The node that was open when the crash occurred |
| `requires_redispatch` | `true` if the node's role agent did not finish |
| `plan_frozen` | Must be `true`; if `false`, see §6 below |

---

## 2. Interpreting `resume_state`

### `resume_state: "clean"`

No in-progress node. The run may have completed normally, or it may have crashed before opening
the first node. Re-run `open-next` to advance (or verify `allDone`).

### `resume_state: "mid_node"`

A node is open. Check whether evidence was recorded:

```bash
ls kaola-workflow/{project}/.cache/{active_node}.md
```

- **Evidence absent** and `requires_redispatch: true` — re-dispatch the role agent (§3).
- **Evidence present** and barrier not yet run — skip re-dispatch, run the commit bracket only (§4).

### `resume_state: "crashed"`

The running-set is inconsistent (a member was partially opened or sealed). Run
`reconcile-running-set` before continuing (§5).

---

## 3. Re-dispatch the role agent (`requires_redispatch: true`)

When `requires_redispatch` is `true`, the role agent did not complete. Re-dispatch it with the
same node-id and write-set as the original dispatch. The node's baseline is already recorded
(it was set at `open-next` time); the re-dispatched agent will write into the same window.

After the agent completes, record its evidence:

```bash
node scripts/kaola-workflow-adaptive-node.js record-evidence \
  --node-id {active_node} \
  --evidence-file kaola-workflow/{project}/.cache/{active_node}.md \
  --plan kaola-workflow/{project}/workflow-plan.md \
  --ledger kaola-workflow/{project}/workflow-ledger.md
```

Then run the commit bracket to close (§4).

---

## 4. Complete evidence, barrier not yet run — commit bracket only

When evidence is present but the barrier has not yet run, you do NOT need to re-dispatch the
role agent. Run `close-and-open-next` directly:

```bash
node scripts/kaola-workflow-adaptive-node.js close-and-open-next \
  --node-id {active_node} \
  --plan kaola-workflow/{project}/workflow-plan.md \
  --ledger kaola-workflow/{project}/workflow-ledger.md
```

The commit bracket (`barrier-check` + `gate-verify` + ledger close) runs inside
`close-and-open-next`. If the barrier produces a `result: refuse`, read the
[repair-routing card](repair-routing.md).

---

## 5. `reconcile-running-set` — crash repair for the running-set

If `resume_state: "crashed"` or the running-set manifest is inconsistent:

```bash
node scripts/kaola-workflow-adaptive-node.js reconcile-running-set \
  --plan kaola-workflow/{project}/workflow-plan.md \
  --ledger kaola-workflow/{project}/workflow-ledger.md
```

`reconcile-running-set` inspects the manifest and ledger, removes stale `opening` markers, and
brings the running-set back to a consistent state. After reconciliation, re-run `orient` to
confirm `resume_state` is no longer `"crashed"`.

---

## 6. Unfrozen plan — route to `/kaola-workflow-adapt`

If `orient` returns `plan_frozen: false`, the plan-run cannot continue — the plan must be frozen
before any node can be opened or closed. Route to `/kaola-workflow-adapt` to run the planner
freeze/governance-ack handshake, then re-enter the plan-run.

See the [governance card](governance.md) for the handshake procedure.

---

## 7. `--resume-check` — verify plan integrity before re-entering

Before re-entering the run loop after any recovery, verify the plan has not been tampered with:

```bash
node scripts/kaola-workflow-plan-validator.js \
  --resume-check \
  --plan kaola-workflow/{project}/workflow-plan.md \
  --json
```

A `result: ok` confirms the frozen plan is intact. A `result: refuse` with `reason:
plan_hash_mismatch` means the plan was modified after freeze — route to `/kaola-workflow-adapt`
to re-freeze.

---

## 8. The `repair-node` subcommand for crash-safe re-open

If the interrupted node needs to be fully re-run (not just have its evidence recorded), use
`repair-node`, not `reopen-node`. `repair-node` keeps the original baseline
(`baselineReused: true`), preventing baseline laundering.

```bash
node scripts/kaola-workflow-adaptive-node.js repair-node \
  --node-id {active_node} \
  --plan kaola-workflow/{project}/workflow-plan.md \
  --ledger kaola-workflow/{project}/workflow-ledger.md
```

See the [reopen-complete-node card](reopen-complete-node.md) for the full repair-vs-reopen
decision tree.

---

## Quick decision tree

```
orient
  |
  +-- plan_frozen: false ---------> [governance card] -> re-freeze -> re-enter
  |
  +-- resume_state: "crashed" ----> reconcile-running-set -> orient again
  |
  +-- resume_state: "clean" ------> open-next (or verify allDone)
  |
  +-- resume_state: "mid_node"
        |
        +-- requires_redispatch: true -----> re-dispatch role -> record-evidence -> close-and-open-next
        |
        +-- evidence present, no barrier --> close-and-open-next directly
```
