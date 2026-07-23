# Card: Spine Expansion Lifecycle (progressive elaboration)

**When to read:** `orient` / `next-action` returns a non-empty `expansionPending[]` — the plan was
frozen `plan_form: spine` (see `agents/workflow-planner.md` § progressive elaboration) and one or
more `expansion-point` milestone nodes are ready to have their interior frontier composed at run
time. (Issues #758/#759/#763/#767.)

**Related:** `expand-open` / `expand-close` / `reconcile-running-set` in
`kaola-workflow-adaptive-node.js`; the running-set scheduler card
(`docs/plan-run-cards/frontier-batch.md`); `expansionPending[]` in `kaola-workflow-next-action.js`.

---

## 1. What an expansion point is

A `plan_form: spine` plan declares an ordered milestone spine plus the unique `finalize` sink. A
spine node is either a concrete single-role node (unchanged legacy semantics) or a typed
`expansion-point` whose frontier is **composed at open time, not at freeze** — for milestones whose
interior writers/reviewers depend on findings not yet available when the plan is frozen.

An expansion point carries NO work of its own. `next-action` excludes it from `readyPending` (it has
no agent profile to dispatch) and instead surfaces it on `expansionPending[]`, one entry per ready
point, each carrying:

| directive | meaning |
|---|---|
| `readyToExpand: true` | no record yet, or every prior record is POSITIVELY settled — compose + `expand-open` |
| `readyToDischarge: true` | ≥1 record exists and all are settled — `expand-close` |
| `openIncomplete` (non-empty) | a record was appended but its frontier open never proved (crash) — `reconcile-running-set` first |

A spine whose ready expansion points are never driven opens nothing, returns `frontier_blocked`, and
stalls at stop+ask. Driving them is an obligation, not an option.

---

## 2. `expand-open` — compose + record + open, in one transaction

```bash
node kaola-workflow-adaptive-node.js expand-open \
  --project {project} --node-id {point-id} --stdin --json
```

stdin is the executor's composition, decomposed from the milestone's `expansion(<point-id>)`
contract by the SAME faithful-decomposition + evidence-backed-serialization rules as any frontier:

```json
{
  "derivation": { "grain": "…", "path": "…", "join": "…", "probe": "…", "serializer": "none present — co-open" },
  "units": [
    { "name": "u1", "role": "code-explorer", "model": "standard", "write_set": "", "mode": "co_open" },
    { "name": "u2", "role": "tdd-guide",     "model": "standard", "write_set": "lib/a.js", "mode": "co_open" }
  ]
}
```

- **`derivation`** — five lines (`grain` / `path` / `join` / `probe` / `serializer`) recorded
  verbatim and checked only for PRESENCE (audit-only evidence, never re-decided by the script).
- **`units`** — `mode: co_open` by DEFAULT; `mode: serial` ONLY on a NAMED S1/S2/S3 serializer
  (name the consumed artifact / the shared resource / a failed worktree probe — never a guess).
  `write_set` is empty for a read unit, exact file paths for a write unit.
- **Never a gate role.** `code-reviewer` / `security-reviewer` / `adversarial-verifier` /
  `main-session-gate` are refused `expansion_unit_role_gate_unsupported` with zero mutation — the
  milestone is reviewed by the spine's own concrete review wall (the node carrying the contract's
  `review_class`), never by a composed unit.

`expand-open` is three crash-safe phases: (1) ONE atomic plan write of the `record(<point>#<n>)`
block + the unit ledger rows; (2) the frontier open through the running-set scheduler (a read
fan-out, or co-open isolated legs for a disjoint write frontier — exactly like a frozen frontier);
(3) ONE atomic plan write of the `open(<point>#<n>)` proof block. Then dispatch each composed unit's
role agent and `close-node` it like any frontier member.

The `## Expansion Records` channel lives OUTSIDE the `plan_hash` body, so appending a record never
perturbs the frozen spine identity — the review-journal binding is `(spine plan_hash, record id)`,
which is what lets a later re-expansion never orphan a completed journal.

---

## 3. Re-expansion — a second record on the same point

A follow-up record on the SAME point is the SAME command, once every prior unit is settled
(`readyToExpand` stays true after a record fully closes). Records are numbered monotonically per
point (`m1#1`, `m1#2`, …). A re-expansion over a still-live frontier refuses `expansion_not_settled`.

---

## 4. `expand-close` — discharge the milestone

```bash
node kaola-workflow-adaptive-node.js expand-close \
  --project {project} --node-id {point-id} --json
```

Legal once `readyToDischarge` is true (≥1 record, all settled). It flips the milestone row and
appends the `discharge(<point>)` block plus ONE per-expansion efficiency evidence line to the
point's own `.cache/<point>.md`:

```
expansion <point>: width=<total units> mode=<co_open|serial|mixed> serializer=<none|S1|S2|S3> rework=<records-1>
```

The spine then advances to its next node — through the concrete review wall (opened + closed via the
normal `open-next` / `close-and-open-next` gate lifecycle) to the `finalize` sink. Discharging a
point with no record refuses `expansion_never_composed`.

---

## 5. Crash resume — the three reconcile arms

A crash anywhere between `expand-open` phase 1 and phase 3 leaves a record with no `open()` proof.
`reconcile-running-set` rolls it forward (idempotently) — the crash window spans three running-set
shapes, and every one reaches the roll-forward:

| crash point | running-set shape | reconcile arm |
|---|---|---|
| before phase 2 | no manifest at all | `no_running_set` → roll forward |
| during phase 2 | `state: 'opening'` manifest | reconciled arm — repair the open FIRST, then roll forward |
| between phase 2 and 3 | settled `open` manifest, units already `in_progress` | `not_opening` arm — roll forward anyway |

Run `reconcile-running-set` whenever `openIncomplete` is non-empty, BEFORE any further `expand-open`
/ `expand-close`. A fully-proven, stable plan is a no-op (`reconciled: false, reason: 'not_opening'`).

---

## Quick reference — expansion lifecycle

```
expansionPending[{ readyToExpand, readyToDischarge, openIncomplete }]
  |
  openIncomplete non-empty -> reconcile-running-set (roll forward) -> re-orient
  |
  readyToExpand -> compose from expansion(<point>) contract (co_open default; serial only on named S1/S2/S3)
                -> expand-open --node-id <point> --stdin
                -> dispatch each unit; record-evidence; close-node per unit
                -> (settled) readyToExpand again for a re-expansion, or:
  |
  readyToDischarge -> expand-close --node-id <point>
                   -> spine advances -> concrete review wall (open-next / close-and-open-next) -> finalize sink
```
