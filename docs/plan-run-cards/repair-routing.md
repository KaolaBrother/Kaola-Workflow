# Card: Barrier Refusal / Route-Findings / Repair Dispatch

**When to read:** A `close-and-open-next` call returns `result: refuse`, `route-findings`
has produced a `findings-route.json` record, or you need to dispatch a fix agent and close the
repair loop.

**Related:** D-445-01 (`operator_hint` field), D-446-01 (`route-findings` companion record),
D-434-01 (sanctioned repair primitives), D-424-01 (`--drop-base` anti-laundering)

---

## Authoritative failed-review repair

**Authoritative failed-review repair protocol.** `review_failed` is a settled failed transaction.
Read the authoritative `review-attempts.json` attempt (`attempt_id`, `logical_gate`, `outcome`,
`reason`, `route_candidates`, `lifecycle_settled`, `repair`, and `consumed_by`), choose the
writer as an agent decision from the frozen DAG and canonical `ownership_candidates`, then invoke
`repair-node --attempt-id {attempt_id} --node-id {agent-selected-writer}`. The harness never selects
a repair owner and never rewrites the DAG. On retry or reconciliation, reread the journal and resume
the same attempt; treat `findings-route.json` only as a regenerable projection, never as authority.
`repair_requires_replan` is a zero-mutation refusal; an unresolved attempt makes `reopen-node`
refuse with `review_attempt_unresolved`. Five consumed repairs are allowed per canonical logical
gate; the sixth returns `repair_limit_reached`. Zero candidates and multiple candidates leave
`owning_node: null`; multiple owners never imply selection.

**Semantic-owner admissibility (the graph-maximal-vs-owner bridge).** `repair-node` admits only a
graph-maximal executed producer, but a serial *tail* writer can be graph-maximal while owning none
of the attempt's blocking findings. `route_candidates` now carries real `ownership_candidates`
(schema-1 from the affected file, schema-2 from the finding's immutable primary-anchor path), so the
reopen is cross-checked against ownership. Two outcomes surface when the requested writer is not the
semantic owner (both zero-mutation):

- **`repair_writer_ownership_mismatch`** — the requested node *is* graph-maximal but owns NONE of the
  still-open blocking findings, so reopening it cannot repair the flagged code. The envelope names the
  `semantic_owner` (and `ownership_candidates`); re-run `repair-node --node-id {semantic_owner}`.
- **`repair_requires_replan` with `reason: dependent_producer_replay_required`** — the requested node
  IS the unique semantic owner but a NON-maximal upstream writer whose completed downstream writers
  (`blocking_descendants`) would have to be replayed to reopen it safely. The descendant-replay
  transaction is not performed in-plan; the envelope names `semantic_owner` + `blocking_descendants`
  so a replacement plan (`/kaola-workflow-adapt`) can re-derive from the owner (see #699).

When ownership is unresolvable — an anchor-less finding (e.g. an `evidence_observation` anchor carries
no path) or a legacy attempt whose rows still hold `ownership_candidates: []` — the bridge stays inert:
it never falsely accuses a maximal writer of a mismatch, and a non-maximal request simply degrades to
the generic `repair_requires_replan`.

## 1. Reading the refusal envelope

When `close-and-open-next` refuses, the output is a typed envelope:

```json
{
  "result": "refuse",
  "reason": "write_set_overflow",
  "operator_hint": "Node n4 wrote outside its declared set. Run: node scripts/kaola-workflow-adaptive-node.js revert-overflow --node-id n4",
  "nodeId": "n4"
}
```

The `operator_hint` field (D-445-01) gives you one sentence and the exact next command. Use it
to identify the recovery action without re-reading the full plan-run prose.

The `reason` field is the structural classifier. The full set of typed reasons and their
recoveries is below.

---

## 2. Reading `findings-route.json`

When `route-findings` runs (D-446-01), it writes a `findings-route.json` record alongside the
refusal envelope. Read it:

```bash
cat kaola-workflow/{project}/.cache/findings-route.json
```

Key fields:

| Field | Meaning |
|---|---|
| `owning_node` | The node whose write set covers the offending path |
| `fix_role` | The role to dispatch for the repair (e.g., `"implementer"`) |
| `owning_node: null` | No node owns the path — this is a PLAN-REPAIR signal |
| `proposed_repair.kind` | The machine-readable repair primitive (`revert-overflow`, `repair-node`, etc.) |
| `operator_hint` | One-sentence human pointer (same vocabulary as the envelope) |

---

## 3. `write_set_overflow` — use `revert-overflow`, NEVER `drop-base`

`reason: write_set_overflow` means a node wrote files outside its declared write set. The
canonical recovery is `revert-overflow` (D-434-01 §1):

```bash
node scripts/kaola-workflow-adaptive-node.js revert-overflow \
  --node-id {nodeId} \
  --plan kaola-workflow/{project}/workflow-plan.md \
  --ledger kaola-workflow/{project}/workflow-ledger.md
```

`revert-overflow` reverts the out-of-set writes while keeping the in-set writes intact.

**NEVER use `--drop-base`.** `--drop-base` drops the barrier baseline, laundering the node's
accumulated work. This is explicitly banned by D-424-01. The `operator_hint` vocabulary
enforces this — no hint in any aggregator's registry references `drop-base`.

Subtypes that also use `revert-overflow`:
- `write_set_granularity` — a write landed at a coarser path than declared
- `lockfile_write` — a lock file (e.g., `package-lock.json`) was written without declaration
- `mirror_write` — a generated mirror file was written outside the set
- `count_bump` — a version-count file was bumped without declaration

---

## 4. `sensitive_write_unreviewed` — add a security-reviewer gate

`reason: sensitive_write_unreviewed` means a node wrote a file classified as security-sensitive
without a preceding security-reviewer gate node in the plan.

Recovery options:
- **Add a security-reviewer gate** — plan-repair (via `--freeze`) to insert a gate node
  immediately before the offending node. Re-freeze the plan (see [governance card](governance.md)).
- **Remove the sensitive write** — if the write is not necessary, remove it from the node's
  implementation and re-dispatch.

---

## 5. `unattributed_write` — add the file to a node's write set

`reason: unattributed_write` means a file was written but no node in the plan declares it in
its write set. The barrier has no owner for the write.

Resolution:
1. Check `findings-route.json` for `owning_node: null` — this confirms no node claims the path.
2. Plan-repair via `--freeze`: add the file to the appropriate node's write set.
3. Re-freeze the plan (the `plan_hash` changes; re-run `--freeze-checked` → `--freeze`).
4. Re-run the node that should own the write.

---

## 6. Crash-repair: use `repair-node` (keeps original baseline)

When a node needs to be re-run after a crash or mid-run failure, use `repair-node`:

```bash
node scripts/kaola-workflow-adaptive-node.js repair-node \
  --node-id {nodeId} \
  --plan kaola-workflow/{project}/workflow-plan.md \
  --ledger kaola-workflow/{project}/workflow-ledger.md
```

`repair-node` keeps the original baseline (`baselineReused: true`). This is the anti-laundering
primitive — it ensures the barrier's diff is computed against the same snapshot it used at open
time, not a fresh one. See the [reopen-complete-node card](reopen-complete-node.md) for the
full repair-vs-reopen decision tree.

---

## 7. The `operator_hint` field — exact command pointer

Every typed envelope from the three aggregators (`adaptive-node.js`, `commit-node.js`,
`plan-validator.js`) carries an `operator_hint` string. It is:

- **Top-level** — sibling of `result`/`reason`, not nested inside `triage` or `proposed_repair`
- **Present on `refuse`/`halt`/`warn`** — the three actionable outcomes
- **Absent on success** — a missing `operator_hint` means no action required
- **Forge-neutral** — names `node scripts/...` commands only, never `gh`/`glab`/`tea`

Read it first. It points at the exact recovery command for the specific `reason`.

---

## 8. Plan-repair via `--freeze` when write-set widening is needed

When the repair requires adding a file to a node's write set (e.g., `unattributed_write` or
`sensitive_write_unreviewed`), the plan itself must change. Plan-repair procedure:

1. Edit `workflow-plan.md` to add the file to the appropriate node's `write_set` array.
2. Re-freeze:
   ```bash
   node scripts/kaola-workflow-adaptive-handoff.js --freeze-checked --json \
     --plan kaola-workflow/{project}/workflow-plan.md
   # capture the new plan_hash, then:
   node scripts/kaola-workflow-adaptive-handoff.js --freeze --governance-ack <hash> --json \
     --plan kaola-workflow/{project}/workflow-plan.md
   ```
3. After re-freeze, delete the stale barrier baseline for the affected node:
   ```bash
   rm kaola-workflow/{project}/.cache/barrier-base-{nodeId}
   ```
4. Re-open the node with `open-next` (it will record a fresh baseline).

---

## 9. Dispatching a fix agent and closing the repair loop

After the repair action (revert-overflow, plan-repair, etc.):

1. Dispatch a fix agent (same role as the original node, or `implementer` for write repairs).
2. The fix agent writes within the corrected write set.
3. Record the fix agent's evidence:
   ```bash
   node scripts/kaola-workflow-adaptive-node.js record-evidence \
     --node-id {nodeId} --evidence-file kaola-workflow/{project}/.cache/{nodeId}.md \
     --plan kaola-workflow/{project}/workflow-plan.md \
     --ledger kaola-workflow/{project}/workflow-ledger.md
   ```
4. Run `close-and-open-next` again. If the barrier passes, the loop advances normally.

---

## 10. `merge_conflict` — the write-overlap escalation (#463)

`reason: merge_conflict` is **not a first-detection refusal** — it is the **terminal escalation** a
write-leg level reaches after `MERGE_CONFLICT_REPAIR_LIMIT` (**K=3**) bounded repairs of its
*first-detection* refusal fail. The chain (AC10):

1. **First detection** — the level's last-member `close-node` refuses with the *specific* reason:
   - `member_vacuity` — a leg produced **no changes** (the no-op-leg producer; caught at the member's
     own close, where its evidence / a `no_op:<reason>` declaration is visible).
   - `write_set_overflow` — a leg wrote **outside** its declared set (§3 / §6).
   - the synthesizer's **octopus bail** — a real **same-file** conflict (the deferred overlapping tier;
     a same-file overlap cannot co-open in a frozen plan, so this is a defensive catch).
2. **Bounded repair (K=3)** — repair each by its *own* recovery, re-running `close-node`:
   - no-op leg → **re-dispatch** the leg's role so it writes its declared file;
   - overflow → `revert-overflow` (NEVER `drop-base`);
   - real conflict → dispatch a reasoning-class **Opus**-floor `synthesizer` agent to resolve **by
     intent** (a non-reasoning tier is a dispatch refusal, never a silent downgrade; a clean agentic
     merge is a weak signal — the union barrier on M is the landing gate, not the merge succeeding).
3. **Escalate** — on the K-th failure: `write-halt --project {project} --node-id {nodeId} --reason
   merge_conflict`. This is a **RESUMABLE** consent-style halt (unlike `test_thrash`'s one-way
   escalation): resolve the cause, then `clear-halt --reason consent` to resume adaptively.

**Routed exactly like `test_thrash`** — the cap is a schema constant the orchestrator applies; there is
**no script counter** on the adaptive path. This is safe because the **COMMIT-based union barrier on the
merge commit M** (`--group-barrier --merge-commit M`), *not* the attempt counter, is the fail-closed
gate: an unmergeable / unverified / out-of-union result can never land, so a resumed run that re-counts
attempts from zero only re-does work — it never lands bad work. No producer leaves a bad M on HEAD: the
octopus bails **clean** (`merge --abort`, HEAD unchanged) before any advance, and `member_vacuity` /
`write_set_overflow` fire **before** the merge.

---

## Quick reference: reason → recovery

| `reason` | Recovery |
|---|---|
| `write_set_overflow` (+ subtypes) | `revert-overflow` (NEVER `drop-base`) |
| `sensitive_write_unreviewed` | Add reviewer gate to plan OR remove sensitive write |
| `unattributed_write` | `owning_node: null` in route-findings → plan-repair (add to write set) |
| `barrier_failed` | Read `findings-route.json` → dispatch fix agent → close repair loop |
| `member_vacuity` | No-op leg → re-dispatch the leg's role (or declare `no_op:` in evidence) |
| `merge_conflict` | Terminal escalation after K=3 repairs → `write-halt --reason merge_conflict` (RESUMABLE) |
| crash / mid-run failure | `repair-node` (keeps original baseline) |
| `repair_writer_ownership_mismatch` | Maximal writer owns no blocking finding → `repair-node --node-id {semantic_owner}` |
| `dependent_producer_replay_required` | Non-maximal owner with completed downstream writers → replan from `semantic_owner` (`/kaola-workflow-adapt`, #699) |
| `plan_hash_mismatch` | Plan tampered → re-run `--freeze-checked` → `--freeze` |
