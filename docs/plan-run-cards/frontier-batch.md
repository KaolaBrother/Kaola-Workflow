# Card: Parallel Frontier Fan-Out (running-set scheduler)

**When to read:** `orient` / `open-next` / `close-and-open-next` returns `enterBatch: true` with a
`frontier: [...]` of ≥2 nodes, indicating the next frontier is a set of disjoint-write (or
read-only) siblings that should be dispatched concurrently.

**Related:** the running-set scheduler — `open-ready` / `close-node` / `reconcile-running-set` in
`kaola-workflow-adaptive-node.js`.

<!-- PIN: frontier unit -->
frontier unit

---

## 1. The frontier unit concept

A **frontier unit** is the set of nodes that are simultaneously unblocked (all predecessors
complete) in the DAG. The running-set scheduler owns BOTH the state and the crash-safe manifest
(`kaola-workflow/{project}/.cache/running-set.json`) for a frontier unit; the plan-run skeleton
(main session) owns concurrent DISPATCH — the multiple `Agent()` calls in one message. When
`enterBatch: true` is returned, the frontier is fan-out eligible: run `open-ready`, then dispatch
the returned nodes' role agents concurrently.

There is no separate "batch" subsystem. Serial execution is simply the running-set scheduler
operating with a concurrency ceiling of one — `open-next` / `close-and-open-next` are the
`max_concurrent = 1` aliases that never write `running-set.json`; its absence on disk is itself
the serial witness.

---

## 2. Confirming fan-out eligibility

`orient` (and `open-next` / `close-and-open-next`) return:

```json
{
  "enterBatch": true,
  "frontier": [
    { "id": "n4", "role": "tdd-guide", "model": "sonnet", "declared_write_set": "api/" },
    { "id": "n5", "role": "tdd-guide", "model": "sonnet", "declared_write_set": "cli/" }
  ]
}
```

| Field | Meaning |
|---|---|
| `enterBatch: true` | The frontier is fan-out eligible — ≥2 delegable ready-pending siblings, nothing else `in_progress` |
| `frontier` | The sibling node descriptors that form this frontier |

`enterBatch` / `frontier` are advisory signals — `open-ready` (below) is the transaction that
actually opens the set and is authoritative on which nodes it selects (priority-ordered by
`next-action`'s longest-path-to-sink, bounded by the fan-out cap).

---

## 3. `open-ready` — open the frontier

```bash
node kaola-workflow-adaptive-node.js open-ready \
  --project {project} --json \
  [--max N] [--speculative-consent] [--write-overlap-consent]
```

Opens as many ready-pending nodes as the cap and running-set state allow, in ONE two-phase
crash-safe transaction:

- **Read-only frontier** (`code-explorer`, `knowledge-lookup`, `adversarial-verifier`, …): fans
  out up to `KAOLA_FANOUT_CAP_READONLY` (default 8) minus the count already live, further capped
  by `--max`.
- **Write frontier, ≥2 planner-proven-disjoint (`parallel_safe`) siblings**: co-opens as a **lane
  group** BY DEFAULT — no operator toggle — up to `KAOLA_FANOUT_CAP` (default 4), further capped
  by `--max`. Each member is provisioned an isolated `.kw/legs/<project>/<node-id>` worktree
  (containment, not construction — the Agent tool has no cwd parameter, so dispatch each member
  with its OWN `dispatch.leg_path` / `dispatch.leg_branch` (below), `cd "<dispatch.leg_path>" &&`
  on every Bash call). `KAOLA_PARALLEL_WRITES=0` forces the byte-identical single-write serial
  open — no lane group, no legs, and `dispatch.leg_path`/`dispatch.leg_branch` stay absent.
- **A single write node** (no lane group formed — an overlapping/uncertain frontier, the
  `KAOLA_PARALLEL_WRITES=0` opt-out, or a host without worktree support): opens alone; the running
  set must be empty first — a write node never runs concurrently with anything else.
- **Overlapping (non-disjoint, `write_overlap_policy: coarse`) writes**: require
  `--write-overlap-consent` to co-open at all; without it the frontier serial-degrades to one
  write node at a time.
- **Speculative read fallback** (`speculative_open_policy: consent` in `## Meta`): when the normal
  frontier is empty because only an open gate blocks progress, `--speculative-consent` fans out
  the gate's speculative-eligible descendants, each stamped `speculative: true` in
  `running-set.json` — see `docs/plan-run-cards/speculative-open.md`.

`open-ready` returns
`{result:'ok', kind:'read'|'write', opened:[{id,role,model,declared_write_set,nonce,evidence_file,required_tokens,dispatch}], runningSet:[ids], laneGroup?:{group_id,members,write_union,legs?}}`
— dispatch every entry in `opened` **in one assistant message**.

**Per-member leg fields on `dispatch`.** When a write lane group co-opens, each opened member's
own `dispatch` object carries `dispatch.leg_path` (the absolute path to that member's provisioned
`.kw/legs/<project>/<node-id>` worktree) and `dispatch.leg_branch` (that leg's branch). Dispatch
each leg directly from its own member's `dispatch.leg_path`/`dispatch.leg_branch` — no need to
cross-reference the separate top-level `laneGroup.legs` descriptor, which remains present for
observability only. Both keys are conditionally attached (like `dispatch.goal_line`): absent/`null`
on the serial or read-only path, so `dispatch` there stays byte-identical to before this field
existed. A non-error `ok` that opens
nothing carries a `reason`: `write_node_exclusive` (a write node is already live),
`write_awaits_drain` (only writes are ready but read-only members are still live), or
`cap_reached`. A crash-safe precondition refuses `reconcile_first` when a prior `open-ready` left
`running-set.json` mid-transaction (`state: 'opening'` or any member `opening: true`) — run
`reconcile-running-set` first.

**Scheduler lock contention (issue #585).** `open-ready`, `close-node`, and
`reconcile-running-set` (every subcommand on this card) each acquire a project-scoped O_EXCL lock
(`.cache/scheduler.lock`) before running — only one scheduler invocation may drive a project at a
time. Two typed refusals cover contention:

| reason | condition | repair |
|---|---|---|
| `scheduler_locked` | another invocation holds the lock and its holder is LIVE | wait for the in-flight command to finish, then retry |
| `scheduler_lock_stale` | the holder is DEAD/crashed (a dead same-host PID, or an old/corrupt cross-host payload) | verify no other orchestrator session is recovering this project, then `rm` the lockfile from ONE session only (the `operator_hint` names the exact path), and re-run |

The lock is never auto-removed on either arm — see `docs/decisions/D-585-01.md` for why an
earlier auto-takeover design was rejected. Zero-contention serial invocation (the normal
single-orchestrator loop) is unaffected.

---

## 4. `close-node` — close one member

```bash
node kaola-workflow-adaptive-node.js close-node \
  --project {project} --node-id {node-id} --json
```

Runs the same evidence-shape check → barrier → ledger-complete → compliance → selector-arm
contract as the serial `close-and-open-next`, then removes the node from `running-set.json` and
returns the newly-ready frontier (`{closed, allDone, newlyReady, taskTransitions}`). It does
**not** auto-open the next frontier — the loop calls `open-ready` again.

**Lane-group members close differently.** A node stamped with a live `group_id` in
`running-set.json` takes the GROUP-scoped close path instead of the plain per-node barrier:

- **Non-last member**: runs only the per-member in-lane vacuity check (its declared write set must
  show changes, or the evidence must declare `no_op: <reason>`), closes its ledger row, and
  DEFERS the diff barrier — the response carries `barrier: 'deferred_to_group'` and the compliance
  row records the same literal marker.
- **Last member**: the `synthesizer` step runs first — a parent-clean fence, then a mechanical
  octopus-merge of the disjoint legs into the feature branch (commit `M`, no agent) — then the
  plan-validator's `--group-barrier --group-id <id> --merge-commit M --project P` diffs the group
  baseline against the UNION of every member's declared write set. Pass closes the row, records
  `barrier: 'group_passed'`, clears `lane_group`, tears down every leg, and drops the group
  baseline. A real same-file conflict the octopus merge cannot resolve bails with
  `reason: 'merge_conflict'` — legs and the group baseline are retained (durable, recoverable); see
  the plan-run skeleton's `merge_conflict` repair note (bounded `MERGE_CONFLICT_REPAIR_LIMIT`
  repairs, then `write-halt --reason merge_conflict`).

A speculative member cannot close to `complete` until the gate it bet on resolves; a gate that
closes `verdict: fail` surfaces its speculative dependents (`speculative_review_required`) for
`discard-speculative`.

---

## 5. `reconcile-running-set` — crash repair

```bash
node kaola-workflow-adaptive-node.js reconcile-running-set \
  --project {project} --json
```

`running-set.json` is written in `state: 'opening'` with the FULL intended node set, each member
stamped `opening: true`, BEFORE any ledger row flips — a crash between the manifest write and the
ledger flip is always reconcilable, never an orphan. `reconcile-running-set` repairs every anomaly
class in one call:

- **Interrupted open** (`state: 'opening'`, or any `opening: true` member): a member whose ledger
  row DID flip to `in_progress` is kept (rolled forward, `opening` flag cleared, capped at the
  recorded `max_concurrent`); a member still `pending` did not open and is rolled back — dropped
  from the set, its baseline removed.
- **Interrupted close** (a ledger-terminal `complete`/`n/a` node still listed in an already-`open`
  set — the ledger write landed but the running-set removal crashed): dropped
  (`closedDropped`).
- **Stale member** (a non-opening member of an `open` set whose ledger row is neither `in_progress`
  nor terminal — a different serial node is the real live one): dropped (`staleDropped`).
- **Lane-group survival**: a `lane_group` survives iff ≥1 of its members survives; a fully-dropped
  group tears down every leg and drops the group baseline. A surviving group tears down only the
  departing members' legs — a departing member's own leg is retained if it already closed (its
  committed work still needs the eventual synthesizer merge) — and self-heals `closed_members`
  against the authoritative ledger.
- **Orphan legs**: `.kw/legs/<project>/*` worktrees with no matching live manifest entry are swept
  on every reconcile call (gated on `KAOLA_PARALLEL_WRITES` staying default-on).

Promotes the manifest to `state: 'open'` (or deletes it once the surviving set is empty) and
returns `{reconciled, rolledForward, rolledBack, closedDropped, staleDropped, state:'open'}`. A
set with no opening transaction, no closed member, and no stale member is a no-op
(`reconciled: false, reason: 'not_opening'`). After reconciling, re-run `orient` to resume.

---

## 6. Fan-out caps

| Cap | Env | Default | Applies to |
|---|---|---|---|
| `FANOUT_CAP` | `KAOLA_FANOUT_CAP` | 4 | Write-role co-open (lane groups) and single serial writes |
| `FANOUT_CAP_READONLY` | `KAOLA_FANOUT_CAP_READONLY` | 8 | Read-only fan-out |

`--max N` further bounds either cap for a single `open-ready` call; a logical frontier MAY be
wider than the cap — the cap bounds runtime concurrency, not plan validity. `open-ready` opens the
remainder on the next call as members close.

---

## 7. Parallel vs serial — when each applies

| Condition | Approach |
|---|---|
| Read-only frontier | Fan out up to `FANOUT_CAP_READONLY` — the default, no toggle |
| Disjoint (`parallel_safe`) write frontier, worktree-capable host | Co-open as an isolated-leg lane group — the DEFAULT (`open-ready`, no consent flag needed) |
| Overlapping / non-disjoint write frontier | Serial degrade, UNLESS `--write-overlap-consent` + `write_overlap_policy: coarse` |
| Host without worktree support, or `KAOLA_PARALLEL_WRITES=0` opt-out | Serial degrade — one write node at a time via `open-ready` |
| Speculative read fallback | Only with `--speculative-consent` AND `speculative_open_policy: consent` in `## Meta` |

**Dispatch fidelity: run the frontier at its AUTHORED width.** When the planner authored an
independent ≥2 frontier (`enterBatch: true`), dispatch it concurrently — that is the default, not
an optional optimization, and for a disjoint write frontier the isolated legs ARE the default too.
The serial fallback is for the *degraded* cases only (the rows above), never a "when in doubt,
serialize" default — silently serializing an authored-parallel frontier is the dispatch-fidelity
defect this contract fixes. Width itself stays the planner's scope-driven call: a width-1 frontier
simply never sets `enterBatch`.

---

## Quick reference — frontier lifecycle

```
enterBatch: true (orient / open-next / close-and-open-next)
  |
  open-ready --project P --json [--max N] [--write-overlap-consent] [--speculative-consent]
  |
  +-- reconcile_first (refuse) -> reconcile-running-set first, then retry
  |
  +-- ok, reason: write_node_exclusive / write_awaits_drain / cap_reached -> nothing opened this call
  |
  +-- ok, opened: [...] -> dispatch every entry in ONE assistant message
        |
        for each member as its role agent returns:
          record-evidence --stdin  ->  close-node --node-id <id>
        |
        write-role lane-group member: close-node defers the barrier (non-last member) or
        runs the synthesizer + group barrier once (last member)
        |
        newlyReady frontier -> open-ready again
        |
        crash at any point -> reconcile-running-set -> orient -> resume
```
