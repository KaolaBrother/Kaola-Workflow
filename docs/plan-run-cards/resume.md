# Card: Resume After Crash or Interrupt

**When to read:** The plan-run was interrupted (agent crash, session timeout, manual abort) and
you need to re-enter the run loop without losing work or corrupting the ledger.

**Related:** D-445-01 (skeleton/card split), D-434-01 (repair primitives)

---

## 1. Re-run `orient` first

Always start recovery with a read-only `orient` call. This is safe to run at any point — it
does not mutate the ledger or running-set, and it tells you exactly where the plan-run left off.

```bash
node "$KAOLA_SCRIPTS/kaola-workflow-adaptive-node.js" orient \
  --project {project} --json
```

Key fields in the output:

| Field | Meaning |
|---|---|
| `result` | `"ok"` (orient succeeded) or `"refuse"` (running-set crash, see §5) |
| `resumeCheck.ok` | `true` if the frozen plan_hash is intact; `false` means tamper or unfrozen (see §6) |
| `resumeCheck.reasonCode` | `"plan_not_frozen"` (never frozen) or `"plan_hash_mismatch"` (tampered) when `resumeCheck.ok` is false |
| `inProgressNode` | The node id that is currently open, or `null` if no node is open |
| `cacheState` | `"present"` or `"absent"` — whether `.cache/{inProgressNode}.md` evidence exists (only present when `inProgressNode` is non-null) |
| `requires_redispatch` | `true` when the in-progress node's evidence file is absent or missing the `evidence-binding` token — meaning the role agent did not finish. Omitted when not needed. |
| `allDone` | `true` when all nodes are terminal — run chains and finalize |
| `consentHalt` | `true` when a durable `consent_halt: pending` marker is set |

---

## 2. Interpreting the orient output

### No in-progress node (`inProgressNode: null`)

The run may have completed normally, or it may have crashed before opening the first node.
Check `allDone`:
- `allDone: true` — run is complete; proceed to chains + finalize.
- `allDone: false` — re-run `open-next` to advance to the next node.

### Node is open (`inProgressNode` is set)

Check `cacheState` and `requires_redispatch`:
- **`cacheState: "absent"` or `requires_redispatch: true`** — the role agent did not finish.
  Re-dispatch the role agent (§3).
- **`cacheState: "present"` and `requires_redispatch` absent** — evidence is recorded but the
  barrier has not yet run. Skip re-dispatch, run the commit bracket only (§4).

### Running-set crash (`result: "refuse"`)

Orient returns `result: "refuse"` with a `reason` of `running_set_opening_incomplete`,
`running_set_close_incomplete`, `running_set_stale_member`, `batch_topup_incomplete`, or
`orphan_multi_in_progress`. Run `reconcile-running-set` (§5), then re-run `orient`.

---

## 3. Re-dispatch the role agent (`requires_redispatch: true`)

When `requires_redispatch` is `true`, the role agent did not complete. Re-dispatch it with the
same node-id and write-set as the original dispatch. The node's baseline is already recorded
(it was set at `open-next` time); the re-dispatched agent will write into the same window.

**Re-hydrating the dispatch context.** The in-progress node's `goal_line` (its `## Node Briefs`
entry, when authored) and `upstream_evidence` (its upstream producers' `.cache` evidence
pointers) are NOT held anywhere in the resuming session's memory — they are re-derived from the
cached `.cache/<op>-envelope.json` (`open-next-envelope.json` / `open-ready-envelope.json` /
`close-and-open-next-envelope.json`, whichever opened the node). Read that file's
`result.opened.dispatch` (or the matching member of `result.opened[]` for a batch open) and carry
its `goal_line`/`upstream_evidence` verbatim into the re-dispatch — disk is authoritative; never
reconstruct the brief or the upstream pointers from a prior turn's transcript.

After the agent completes, record its evidence:

```bash
node "$KAOLA_SCRIPTS/kaola-workflow-adaptive-node.js" record-evidence \
  --project {project} --node-id {inProgressNode} --stdin --json
```

Then run the commit bracket to close (§4).

---

## 4. Complete evidence, barrier not yet run — commit bracket only

When evidence is present but the barrier has not yet run, you do NOT need to re-dispatch the
role agent. Run `close-and-open-next` directly:

```bash
node "$KAOLA_SCRIPTS/kaola-workflow-adaptive-node.js" close-and-open-next \
  --project {project} --node-id {inProgressNode} --json
```

The commit bracket (`barrier-check` + `gate-verify` + ledger close) runs inside
`close-and-open-next`. If the barrier produces a `result: refuse`, read the
[repair-routing card](repair-routing.md).

---

## 5. `reconcile-running-set` — crash repair for the running-set

If `orient` returns `result: "refuse"` with a running-set reason (see §2 above):

```bash
node "$KAOLA_SCRIPTS/kaola-workflow-adaptive-node.js" reconcile-running-set \
  --project {project} --json
```

`reconcile-running-set` inspects the manifest and ledger, removes stale `opening` markers, and
brings the running-set back to a consistent state. After reconciliation, re-run `orient` to
confirm `result` is `"ok"`.

---

## 6. Unfrozen or tampered plan — route to `/kaola-workflow-adapt`

If `orient` returns with `resumeCheck.ok: false`, check `resumeCheck.reasonCode`:
- `"plan_not_frozen"` — the plan was never frozen; route to `/kaola-workflow-adapt` to run
  the planner freeze/governance-ack handshake, then re-enter the plan-run.
- `"plan_hash_mismatch"` — the plan was modified after freeze; route to `/kaola-workflow-adapt`
  to re-freeze.

See the [governance card](governance.md) for the handshake procedure.

---

## 7. `--resume-check` — verify plan integrity before re-entering

Before re-entering the run loop after any recovery, verify the plan has not been tampered with:

```bash
node "$KAOLA_SCRIPTS/kaola-workflow-plan-validator.js" \
  --resume-check \
  kaola-workflow/{project}/workflow-plan.md \
  --json
```

A `result: pass` (with `ok: true`) confirms the frozen plan is intact. A `result: refuse` with
`reasonCode: plan_hash_mismatch` means the plan was modified after freeze — route to
`/kaola-workflow-adapt` to re-freeze. Note: `open-next` now also carries the integrity layer
(#499), so a tampered plan is refused at `open-next` time even if you skip this manual check.

---

## 8. The `repair-node` subcommand for crash-safe re-open

If the interrupted node needs to be fully re-run (not just have its evidence recorded), use
`repair-node`, not `reopen-node`. `repair-node` keeps the original baseline
(`baselineReused: true`), preventing baseline laundering.

```bash
node "$KAOLA_SCRIPTS/kaola-workflow-adaptive-node.js" repair-node \
  --project {project} --node-id {inProgressNode} --json
```

See the [reopen-complete-node card](reopen-complete-node.md) for the full repair-vs-reopen
decision tree.

---

## Quick decision tree

```
orient
  |
  +-- result: "refuse" (running-set crash) --> reconcile-running-set -> orient again
  |
  +-- resumeCheck.ok: false
  |     +-- reasonCode: "plan_not_frozen" --> [governance card] -> freeze -> re-enter
  |     +-- reasonCode: "plan_hash_mismatch" -> [governance card] -> re-freeze -> re-enter
  |
  +-- allDone: true -----------------------> chains + finalize
  |
  +-- inProgressNode: null ----------------> open-next
  |
  +-- inProgressNode set
        |
        +-- requires_redispatch: true -----> re-dispatch role -> record-evidence -> close-and-open-next
        |
        +-- cacheState: "present", no requires_redispatch --> close-and-open-next directly
```
