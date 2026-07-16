# Card: Barrier Refusal / Route-Findings / Repair Dispatch

**When to read:** A `close-and-open-next` call returns `result: refuse`, `route-findings`
has produced a `findings-route.json` record, or you need to dispatch a fix agent and close the
repair loop.

**Related:** D-445-01 (`operator_hint` field), D-446-01 (`route-findings` companion record),
D-434-01 (sanctioned repair primitives), D-424-01 (`--drop-base` anti-laundering),
D-699-01 (planner-owned claim-preserving re-plan epochs)

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

### Planner-owned epoch transition after `repair_requires_replan`

`repair_requires_replan` means the frozen DAG cannot prove one safe direct-repair owner. It does
**not** authorize editing/re-freezing the frozen parent, dropping its barrier history, or discarding
the live claim/candidate. The `repair-node` transaction must already have mechanically written the
schema-2 `.cache/replan-source.json` outcome before returning this refusal. Verify that file exists;
never create or repair it manually. Then prepare the claim-scoped transition from the same settled
attempt:

```bash
node scripts/kaola-workflow-replan.js prepare \
  --project {project} --source-attempt {attempt_id} \
  --reason review_repair_requires_replan --json

node scripts/kaola-workflow-replan.js resume --project {project} --json
```

The first `resume` normally returns `replan_planner_dispatch_required` with the exact packet path,
empty `workflow-plan.next.md` seed, transaction id, dispatch nonce, and planner profile identity.
The packet also carries `snapshot_authority_projection` and its digest, which were derived from
stable parent/source/entry-CAS authority before planner dispatch. A missing projection is a fixture
or transaction-shape defect, not a value for the operator to invent.
Dispatch `workflow-planner` with that packet and no proposed nodes/roles/dependencies/write sets;
the planner exclusively authors and attests the child. Then repeat the same `resume` command until
it commits or returns a typed refusal.

The frozen parent remains byte-immutable and authoritative through `parent_archived`. The issue
claim/label, branch, worktree, claim-root base, and candidate survive. Four CAS seams bind the
candidate/root/frontier; `replan_candidate_changed` advances neither epoch nor counter and requires
a new planner child. Activation is a six-prefix journaled multi-file roll-forward, not one
filesystem-atomic swap. Every parent epoch snapshot — including the authoritative review journal
and complete per-attempt rebind ledger — stays in the final archive. Inherited code/security work
keeps its G4 certifier obligations in the child. The schema-2 child's historically named
`parent_snapshot_manifest_digest` binds the projection digest; the later full manifest separately
seals the exact child, attestation, file index, self-digest, and exact manifest bytes.

Two automatic review-driven replacements are allowed at claim scope. A further automatic attempt
durably consent-halts before planner dispatch; one audited user action may run `extend-consent` to
add exactly one ceiling slot. The one-shot diagnosis-to-build exemption applies only to its frozen,
typed proof contract and never to a review-driven reason. A verified v1 parent stays byte-immutable
and may enter v2 only through the explicit compatibility transaction; never rewrite it in place.

#### Multi-writer gate findings — the resumable exit, NOT a hand-edited journal

A post-dominating gate can fail on a finding that spans **two or more upstream writers** whose union
is not one graph-maximal producer (e.g. a serial docs chain where `n8` is maximal but the defect lives
in `n3` + `n5`). `repair-node` correctly refuses `repair_requires_replan`: no single routable writer
owns the finding. **This is not a dead end, and it is never a reason to edit `review-attempts.json` by
hand.** The sanctioned exit is one epoch transition:

1. The planner authors a child that **inserts a repair-writer node** (write set = exactly the defective
   files) upstream of the failed gate and re-points the gate's `depends_on` at it. The old writers'
   committed work persists in the worktree; only the fix and the re-review are new.
2. `prepare`/`resume` (above) freeze and activate that child. The child receives a fresh epoch-local
   review journal that **imports the immutable parent journal** through a digest-bound `legacy_import`
   pointer: the failed attempt (and its fail evidence) is preserved with ordinal continuity, and it is
   marked **consumed** by the transition so it does not re-block.
3. On the activated child, `open-next` **resumes**: it opens the inserted repair-writer instead of
   dead-ending on `review_attempt_unresolved`. Run the child's normal frontier (writer → gate) to a
   passing verdict, then finalize. Never re-stamp the parent journal's `plan_hash`, transaction keys,
   gate identity, or `producer_bindings` — those mismatches are the framework telling you the in-place
   `--freeze --repair` path is the wrong one; the epoch migrates all of it atomically.

#### Mid-diagnosis `reconcile-running-set` preserves the repair's recovery baselines

While a settled-fail attempt is still unresolved (`consumed_by: null`), `reconcile-running-set` **keeps**
the barrier baselines of every COMPLETE producer that attempt references in its `producer_bindings` —
they are the `repair-node` non-discard recovery refs (the `.cache/barrier-base-<writer>` files), not
orphans. A genuinely-orphaned baseline (no live owner, referenced by no attempt) still sweeps. So a
`reconcile-running-set` run mid-diagnosis (even one that reports `no_running_set`) no longer deletes the
files the repair needs — the recovery above stays available.

### Diagnosis-to-build is a separate no-review source

Do not relabel a failed review as Case B. `diagnosis_to_build` is considered only when both
`review-attempts.json` and `replan-source.json` are absent. The completed schema-2 parent must bind
the exact terminal `diagnosis_root_cause`, `falsified_alternatives`, `acceptance_contract`, and
`recommendation` artifacts; every writer must be limited to those four artifact paths; and the child
must cite the proof and recommendation digests. Presence of review authority returns
`case_b_review_authority_present`. The first valid transition costs zero and consumes the one-shot
exemption; untyped, repeated, writer-bearing, or citation-missing variants count or refuse.
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
- **Remove the sensitive write** — if the write is not necessary, remove it from the node's
  implementation and re-dispatch.
- **Replace the DAG through the epoch transaction** — when the sensitive write is required and the
  frozen plan lacks the needed certifier reachability, route the settled attempt through
  `kaola-workflow-replan.js prepare`/`resume`. `workflow-planner` authors the child; main does not
  insert the gate into the frozen parent.

---

## 5. `unattributed_write` — add the file to a node's write set

`reason: unattributed_write` means a file was written but no node in the plan declares it in
its write set. The barrier has no owner for the write.

Resolution:
1. Check `findings-route.json` for `owning_node: null` — this confirms no node claims the path.
2. Let the authoritative attempt settle as `repair_requires_replan`; do not assign ownership by
   editing the frozen plan.
3. Prepare/resume the planner-owned epoch transaction from that attempt.
4. The child planner decides the replacement ownership/write set, inherits the candidate frontier,
   and supplies the required review/certifier path before activation.

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

## 8. Planner-owned re-plan when the frozen DAG must change

Once a plan is frozen, write-set widening, a new reviewer/certifier path, multiple plausible owners,
or a genuinely different topology is an epoch transition — never an in-place `--freeze` repair.

1. Read the settled authoritative attempt and confirm its `attempt_id`, source reason, candidate,
   routing, `lifecycle_settled`, and unconsumed status.
2. Confirm the completed `repair-node` call persisted a schema-2 `repair_outcome` envelope whose
   `attempt_id` matches. If it is absent, re-run the same repair transaction; do not hand-author JSON.
3. Run `kaola-workflow-replan.js prepare --project {project} --source-attempt {attempt_id}`.
4. Run `resume`. On `replan_planner_dispatch_required`, read the named packet and dispatch
   `workflow-planner`; pass evidence/reason only, not an exact DAG or ownership choice.
5. The planner writes only the seeded `workflow-plan.next.md` and the digest-bound attestation. Its
   `parent_snapshot_manifest_digest` must equal the packet's snapshot-authority digest.
6. Run `resume` again. It validates the attested schema-2 child, preserves the inherited frontier
   and G4 obligations, snapshots the parent, and rolls activation forward under the fence.
7. If any CAS seam returns `replan_candidate_changed`, do not patch the child. Resume the recorded
   re-authoring path so the planner authors against the newly observed candidate.
8. If `replan_consent_required` fires, stop. Only a user-authorized `extend-consent` call may add one
   slot; an agent cannot self-clear or rewrite the ceiling.

Do not delete barrier bases or epoch evidence manually. The transaction snapshots the parent proof
first and removes only manifest-listed, digest-unchanged epoch-local caches during its journaled
activation. A verified legacy v1 parent follows the same explicit compatibility entry when moving to
v2; its exact frozen bytes are snapshotted rather than rewritten. A historical committed schema-1
child whose binding field remains `pending` is acceptable only when recursive verification reports
`legacy_external_binding`; `legacy_snapshot_binding_unsealed` is a stop, not a repair hint.

---

## 9. Dispatching a fix agent and closing the repair loop

After an admissible in-place repair action (`revert-overflow`, attempt-bound `repair-node`, etc.):

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

After a planner-owned epoch transition, do not close the old node. Activation installs an
all-pending child Ledger and regenerates `workflow-tasks.json`; resume through the child plan's normal
frontier instead.

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
| `sensitive_write_unreviewed` | Remove the sensitive write OR planner-owned re-plan with a real security certifier path |
| `unattributed_write` | `owning_node: null` in route-findings → settle attempt → planner-owned re-plan |
| `barrier_failed` | Read `findings-route.json` → dispatch fix agent → close repair loop |
| `repair_requires_replan` | `kaola-workflow-replan.js prepare` from the settled attempt, then `resume`; never edit the frozen parent |
| `replan_source_outcome_missing` / `replan_source_journal_missing` | Re-run/inspect the exact direct-repair transaction; never create `.cache/replan-source.json` manually |
| `case_b_review_authority_present` | Do not use Case B; settle/consume the review-driven authority through its typed route |
| `replan_candidate_changed` | No epoch/counter advance; resume planner re-authoring against the current candidate |
| `replan_in_progress` | Run only `kaola-workflow-replan.js resume --project {project}` |
| `replan_consent_required` | Stop for a user-authorized one-slot `extend-consent`; agent cannot self-clear |
| `legacy_snapshot_binding_unsealed` | Stop; historical `pending` is compatible only when recursive verification proves every external seal |
| `member_vacuity` | No-op leg → re-dispatch the leg's role (or declare `no_op:` in evidence) |
| `merge_conflict` | Terminal escalation after K=3 repairs → `write-halt --reason merge_conflict` (RESUMABLE) |
| crash / mid-run failure | `repair-node` (keeps original baseline) |
| `plan_hash_mismatch` | Frozen authority tampered → restore/prove the recorded parent bytes or stop; never re-stamp the tampered parent |
| `repair_writer_ownership_mismatch` | Maximal writer owns no blocking finding → `repair-node --node-id {semantic_owner}` |
| `dependent_producer_replay_required` | Non-maximal owner with completed downstream writers → replan from `semantic_owner` (`/kaola-workflow-adapt`, #699) |
| `plan_hash_mismatch` | Plan tampered → re-run `--freeze-checked` → `--freeze` |
