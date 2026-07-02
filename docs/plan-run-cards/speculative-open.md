# Card: Speculative Open (speculative_open_policy: consent)

**When to read:** `open-next` returns `result: refuse, reason: gate_not_complete` for a node
that is blocked only by a gate that is still running — and the plan `## Meta` sets
`speculative_open_policy: consent`. This card covers the speculative open flow, the consent
command, and the verdict:fail rollback.

**Related:** the speculative-open kernel design (gate-bet activation, now covering both
read-only and write-bearing nodes); the plan-run skeleton's card-split mechanism (this file is
one of several rare-branch cards linked from the skeleton).

---

## 1. What "speculative-eligible" means

A node is **speculative-eligible** when:

- Its only unsatisfied predecessor is an **open gate** (a node still `in_progress`, not yet
  `complete` or `n/a`).
- The plan `## Meta` block contains `speculative_open_policy: consent`.
- If the node is **read-only** (empty declared write set), it is eligible unconditionally.
- If the node **writes**, it is eligible only when its declared write set is exactly
  resolvable (no directory-shaped or glob entry), declares no protected file, and the node is
  not the plan's unique sink. `open-ready` additionally re-checks the declared set against
  every currently-live writer at open time — a write candidate that collides is excluded from
  that call, even if it stays eligible in principle.

When these conditions hold, `open-next` refuses with `reason: gate_not_complete` AND the
`operator_hint` names the speculative gate. The node is NOT opened serially — it is waiting
for your explicit consent.

---

## Authoring (planner)

The operator flow below only fires when the **plan** already carries
`speculative_open_policy: consent`. That key is the planner's call at authoring time, not the
operator's — see the "Speculative-open-eligible shaping" rubric in the workflow-planner agent
definition for the full authoring criteria. The planner sets the Meta key when a node's sole
unsatisfied predecessor is a single in-progress gate that is high-probability-pass (a review
over a small mechanical diff, a verification very likely to confirm) and the rework cost on a
`verdict: fail` is low/bounded. The planner never hand-adds a `speculative: true` annotation —
the Meta key is the only authoring control; eligibility itself stays validator/runtime-derived
(§1) for both read-only and write-bearing nodes.

**Worked-example topology (read-only):** a read-only `adversarial-verifier` (or
`code-explorer`) node that depends ONLY on a `code-reviewer` gate over a small mechanical
change. With `## Meta` `speculative_open_policy: consent` set, that read node opens
speculatively and overlaps the review (the operator flow below) instead of idling until the
gate closes.

**Worked-example topology (write-bearing):** a `tdd-guide` node that depends ONLY on an
upstream `code-reviewer` gate reviewing an earlier, unrelated change, with a declared write
set that is exactly resolvable and disjoint from that gate's own review surface. With the SAME
Meta key set, that write node opens speculatively WITH a provisioned leg (its own isolated
worktree) instead of idling — a size-1 lane group forms even for a lone speculative writer. If
the gate later fails, this write member is discard-only (§6); it never offers the keep option
a read-only member does (§5).

Without the key, either topology just waits — §2 covers the absent/`off` case.

---

## 2. Confirming the policy is set

Before using `open-ready --speculative-consent`, verify the plan `## Meta` carries the key:

```markdown
## Meta

...
speculative_open_policy: consent
```

If the key is absent or set to `off` (the default), the `speculativePending` set is omitted
from `next-action` output and `open-next` returns a plain `node_not_ready` refusal. There is
nothing to consent to — wait for the gate to close.

---

## 3. `open-ready --speculative-consent` — consent to the speculative open

When the policy authorizes it and the operator decides the bet is worth placing:

```bash
node "$KAOLA_SCRIPTS/kaola-workflow-adaptive-node.js" open-ready \
  --project {project} --speculative-consent --json
```

`open-ready --speculative-consent` opens all speculative-eligible nodes in the running-set
scheduler as `speculative: true` members. A read-only member opens against the shared parent
tree, exactly as before. A write-bearing member ALSO opens WITH a provisioned leg — its own
isolated worktree, surfaced in that member's own `dispatch.leg_path` / `dispatch.leg_branch`
— and is re-checked against every currently-live writer before it opens; a write candidate
that collides is excluded from this call (surfaced as `speculativeWriteExcluded`) while its
disjoint siblings still open, and a host with no leg capability excludes every write candidate.
Dispatch each member's role agent (into its own leg path when one is present) and record
evidence as usual.

**Important:** the speculative node(s) run while the gate is still `in_progress`. Their work
is valid work — if the gate passes, the results stand. If the gate fails: a read-only member's
evidence may still be valid (the operator decides whether to keep or discard it, §5); a
write-bearing member is ALWAYS discarded (§6) — there is no keep option for a write built on a
refuted premise.

---

## 4. Normal path: gate closes with `verdict: pass`

When the gate closes successfully (`close-and-open-next` or `close-node` with `verdict: pass`
in the gate's evidence), speculative members that bet on it are unblocked. Close each
speculative node normally via `close-and-open-next` once its evidence is recorded. The
`speculativeCloseGuard` ensures a speculative node cannot commit to `complete` until its gate
is `complete` — this is enforced automatically; no manual check needed. A write-bearing
member closes through the SAME per-leg barrier → (for a size-1 group) group barrier → merge
path any co-opened write member uses — no separate procedure.

---

## 5. Failure path: gate closes with `verdict: fail` → `speculative_review_required`

When the gate closes with `verdict: fail`, `close-and-open-next` returns a
`speculative_review_required` object alongside the `result: ok` close of the gate itself:

```json
{
  "speculative_review_required": {
    "gate": "n3-review",
    "gate_verdict": "fail",
    "speculative": ["n4-explorer", "n5-knowledge"]
  }
}
```

For each named speculative node, first check whether it is read-only or write-bearing (its
`kind` in the running set / `laneGroup.members`) — the two branches are NOT symmetric:

| Node kind | Decision | Action |
|---|---|---|
| read-only | Evidence still valid (gate failure unrelated to this node's scope) | Close the node normally via `close-and-open-next` |
| read-only | Evidence invalid (the bet did not pay off) | Discard via `discard-speculative` (§6) |
| write-bearing | (always — no keep option) | Discard via `discard-speculative` (§6) |

---

## 6. `discard-speculative` — roll back a speculative node

When a speculative node's evidence is no longer valid after a gate failure:

```bash
node "$KAOLA_SCRIPTS/kaola-workflow-adaptive-node.js" discard-speculative \
  --project {project} --node-id {speculative-node-id} --json
```

`discard-speculative`:
- Resets the node's ledger status from `in_progress` back to `pending`.
- Drops its baseline so the node re-opens cleanly when it is next scheduled.
- Removes it from the running-set.

For a **write-bearing** speculative member it additionally (mandatory — a write member is
ALWAYS discarded on gate failure, never kept):
- Tears down its leg — worktree, branch, and leg-base ref — leaving the parent worktree
  byte-identical to before the speculative open; the leg's uncommitted work is gone. This is
  the discard-only asymmetry: there is no keep path for a leg built on a refuted bet, since the
  work never touched the parent tree in the first place.
- Purges its stale evidence file so a future re-open reseeds cleanly.
- If it was the last live member of its lane group, clears the group entry and its group
  baseline too.

After discarding, re-run `orient` — the node will appear in the ready set once a replacement
gate (or the same gate rerun) completes.

---

## 7. When `discard-speculative` is refused

`discard-speculative` refuses if:

- `reason: not_in_running_set` — the node is not a live running-set member (already closed or
  never opened speculatively). Close it normally or run `reconcile-running-set` if the set is
  inconsistent.
- `reason: not_speculative` — the node is a live member but was NOT marked `speculative: true`.
  Close it normally via `close-and-open-next`.

---

## Quick decision tree

```
open-next → gate_not_complete
  |
  +-- speculative_open_policy absent/off ---> wait for gate to close, then re-run open-next
  |
  +-- speculative_open_policy: consent -----> open-ready --speculative-consent
        |
        dispatch speculative role agents (write members: into their own leg); record evidence
        |
        gate closes: verdict:pass -----> close speculative node normally (close-and-open-next)
        |                                 (write member: same per-leg barrier -> merge path)
        |
        gate closes: verdict:fail -----> speculative_review_required returned
              |
              +-- read-only member, evidence still valid ---> close normally (close-and-open-next)
              |
              +-- read-only member, evidence invalid --------> discard-speculative --node-id {id}
              |                                                 -> orient -> re-enter loop
              |
              +-- write-bearing member (always) --------------> discard-speculative --node-id {id}
                                                                  -> orient -> re-enter loop
```
