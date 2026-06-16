# Card: Speculative Open (speculative_open_policy: consent)

**When to read:** `open-next` returns `result: refuse, reason: gate_not_complete` for a node
that is blocked only by a gate that is still running — and the plan `## Meta` sets
`speculative_open_policy: consent`. This card covers the speculative open flow, the consent
command, and the verdict:fail rollback.

**Related:** #439, D-419 Part 4 (speculative-read kernel), D-445-01 (skeleton/card split)

---

## 1. What "speculative-eligible" means

A node is **speculative-eligible** when:

- Its only unsatisfied predecessor is an **open gate** (a node still `in_progress`, not yet
  `complete` or `n/a`).
- The node's own declared write set is **read-only** (empty) — speculative open is never
  permitted for write nodes.
- The plan `## Meta` block contains `speculative_open_policy: consent`.

When these conditions hold, `open-next` refuses with `reason: gate_not_complete` AND the
`operator_hint` names the speculative gate. The node is NOT opened serially — it is waiting
for your explicit consent.

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
scheduler as `speculative: true` members. Dispatch their role agents and record evidence
as usual.

**Important:** the speculative node(s) run while the gate is still `in_progress`. Their work
is valid work — if the gate passes, the results stand; if the gate fails, the operator decides
whether to keep or discard each speculative node's output.

---

## 4. Normal path: gate closes with `verdict: pass`

When the gate closes successfully (`close-and-open-next` or `close-node` with `verdict: pass`
in the gate's evidence), speculative members that bet on it are unblocked. Close each
speculative node normally via `close-and-open-next` once its evidence is recorded. The
`speculativeCloseGuard` ensures a speculative node cannot commit to `complete` until its gate
is `complete` — this is enforced automatically; no manual check needed.

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

For each named speculative node, the operator decides:

| Decision | Action |
|---|---|
| Evidence still valid (gate failure unrelated to this node's scope) | Close the node normally via `close-and-open-next` |
| Evidence invalid (the bet did not pay off) | Discard via `discard-speculative` (§6) |

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
        dispatch speculative role agents; record evidence
        |
        gate closes: verdict:pass -----> close speculative node normally (close-and-open-next)
        |
        gate closes: verdict:fail -----> speculative_review_required returned
              |
              +-- evidence still valid -----> close normally (close-and-open-next)
              |
              +-- evidence invalid ---------> discard-speculative --node-id {id}
                                              -> orient -> re-enter loop
```
