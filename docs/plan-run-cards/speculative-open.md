# Card: Speculative Open (speculative_open_policy: auto | consent)

**When to read:** `open-next` returns `result: refuse, reason: gate_not_complete` for a node
that is blocked only by a gate that is still running — and the plan `## Meta` sets
`speculative_open_policy: auto` (the freeze-time default) or `speculative_open_policy:
consent`. This card covers the two tiers' activation semantics, the speculative open flow, the
consent command, the verdict:fail rollback, and two operational gotchas surfaced by live use.

**Related:** the speculative-open kernel design (gate-bet activation, covering both read-only
and write-bearing nodes, at both the `auto` and `consent` tiers); the plan-run skeleton's
card-split mechanism (this file is one of several rare-branch cards linked from the skeleton).

---

## 1. What "speculative-eligible" means

A node is **speculative-eligible** when:

- Its only unsatisfied predecessor is an **open gate** (a node still `in_progress`, not yet
  `complete` or `n/a`).
- The plan `## Meta` block sets `speculative_open_policy: auto` or `speculative_open_policy:
  consent`. `auto` is the freeze-time DEFAULT — a fresh freeze that omits the field
  materializes an explicit `speculative_open_policy: auto` line into `## Meta`, hash-covered,
  so a frozen plan is always self-describing. A plan frozen BEFORE this default existed (an
  absent field parses as `off`) resumes with `off` semantics — the default flip never applies
  retroactively to an already-frozen plan.
- If the node is **read-only** (empty declared write set), it is eligible unconditionally.
- If the node **writes**, it is eligible only when its declared write set is exactly
  resolvable (no directory-shaped or glob entry), declares no protected file, and the node is
  not the plan's unique sink. `open-ready` additionally re-checks the declared set against
  every currently-live writer at open time — a write candidate that collides is excluded from
  that call, even if it stays eligible in principle.

When these conditions hold, `open-next` refuses with `reason: gate_not_complete` (naming the
speculative gate). The node is NOT opened serially via `open-next` at either tier — it is
admitted only through `open-ready`, the running-set scheduler's open path. This holds regardless of
how the gate itself was opened: a serially-opened gate (via `open-next` or the fused advance) is
recorded into the running set, so `open-ready` admits its speculative descendants (see §8.1).

**The two tiers differ ONLY in ceremony, never in eligibility or safety:**

| Tier | Activation | Per-run consent |
|---|---|---|
| `auto` (default) | `open-ready` opens every speculative-eligible member automatically | none — `--speculative-consent` is accepted as a no-op |
| `consent` | `open-ready` opens the speculative-eligible set ONLY when the operator passes `--speculative-consent` | required, captured at the existing `decision:ask` checkpoint |
| `off` | no speculation (`speculativePending` omitted from `next-action` output) | n/a — wait for the gate to close |

Every eligibility and safety condition above — disjointness, PROTECTED, resolvability,
non-sink, leg capability, fan-out caps, and the close fence (§4) — holds IDENTICALLY at `auto`
and `consent`. `auto` relaxes the operator ceremony only; it never relaxes a safety condition.

---

## Authoring (planner)

`speculative_open_policy` is a Meta-level plan posture, not a per-edge annotation — the planner
never hand-adds a `speculative: true` marker on a node; eligibility itself stays
validator/runtime-derived (§1) for both read-only and write-bearing nodes, at every tier. Since
`auto` is the freeze-time default, a plan speculates on every eligible gate unless the planner
explicitly authors an override: `speculative_open_policy: off` (suppress speculation entirely)
or `speculative_open_policy: consent` (require a per-run operator grant instead of automatic
activation). See the "Speculative-open-eligible shaping" rubric in the workflow-planner agent
definition for when an override is warranted (e.g. `consent` for a bet the planner wants a
human sanity check on; `off` when no eligible gate exists in the topology).

**Worked-example topology (read-only):** a read-only `adversarial-verifier` (or
`code-explorer`) node that depends ONLY on a `code-reviewer` gate over a small mechanical
change. Under the default `speculative_open_policy: auto`, that read node opens speculatively
the moment `open-ready` runs and overlaps the review — no operator action needed.

**Worked-example topology (write-bearing):** a `tdd-guide` node that depends ONLY on an
upstream `code-reviewer` gate reviewing an earlier, unrelated change, with a declared write
set that is exactly resolvable and disjoint from that gate's own review surface. Under the SAME
default, that write node opens speculatively WITH a provisioned leg (its own isolated
worktree) — a size-1 lane group forms even for a lone speculative writer. If the gate later
fails, this write member is discard-only (§6); it never offers the keep option a read-only
member does (§5).

The rest of this card describes what `open-ready` does when it admits a speculative frontier,
and how to review/roll back a bet that did not pay off — mechanically identical whichever tier
authorized the open.

---

## 2. Confirming the policy in effect

Check the plan `## Meta`:

```markdown
## Meta

...
speculative_open_policy: auto
```

- **`auto`** (the default — always explicit on a plan frozen under this posture) — speculation
  activates automatically the next time `open-ready` runs; no operator action needed. Skip to
  §3 (the open happens without the `--speculative-consent` flag).
- **`consent`** — speculation requires the operator to pass `--speculative-consent` to
  `open-ready`; without it, `open-next` still returns `gate_not_complete` and the caller waits.
- **`off`**, or the field is absent on a plan frozen before this default existed — the
  `speculativePending` set is omitted from `next-action` output entirely and `open-next`
  returns a plain `node_not_ready` refusal. There is nothing to consent to — wait for the gate
  to close.

---

## 3. `open-ready` — activating the speculative open

At `auto`, simply run `open-ready` as usual — nothing extra to pass:

```bash
node "$KAOLA_SCRIPTS/kaola-workflow-adaptive-node.js" open-ready \
  --project {project} --json
```

At `consent`, the operator must additionally decide the bet is worth placing and pass the flag:

```bash
node "$KAOLA_SCRIPTS/kaola-workflow-adaptive-node.js" open-ready \
  --project {project} --speculative-consent --json
```

(`--speculative-consent` is also accepted at `auto`, as a documented no-op — a caller that
always passes it does not need tier-branching logic.)

Either way, `open-ready` opens all speculative-eligible nodes in the running-set scheduler as
`speculative: true` members. A read-only member opens against the shared parent tree, exactly as
before. A write-bearing member ALSO opens WITH a provisioned leg — its own isolated worktree,
surfaced in that member's own `dispatch.leg_path` / `dispatch.leg_branch` — and is re-checked
against every currently-live writer before it opens; a write candidate that collides is excluded
from this call (surfaced as `speculativeWriteExcluded`) while its disjoint siblings still open,
and a host with no leg capability excludes every write candidate. Dispatch each member's role
agent (into its own leg path when one is present) and record evidence as usual.

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
is `complete` — this is enforced automatically at either tier; no manual check needed. A
write-bearing member closes through the SAME per-leg barrier → (for a size-1 group) group
barrier → merge path any co-opened write member uses — no separate procedure.

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
- Records discard telemetry — the node id, its role, and the gate it bet on — into the run's
  durable provenance log, for BOTH a read and a write discard. This is what makes the economics
  of `auto` observable per run: even though no operator had to grant the bet in the first
  place, nothing about a lost bet is silent.

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

## 8. Operational gotchas (learned from live use)

### 8.1 A gate opened via the fused serial advance now admits speculation

A gate (review gate or `main-session-gate`) is opened serially — through `open-next` or the fused
serial advance `close-and-open-next` auto-continues into — and is recorded into the running set as
a `kind: gate` member at open time. Because a live gate is now a running-set member, `open-ready`
sees `runningSetLive` (not `serialLive`) and admits the gate's eligible speculative descendants
under `speculative_open_policy: auto` (or `consent`) without any extra step. The gate node carries
no write set and is not a fan-out slot occupant, so it never consumes a speculative read slot and
never trips the write-exclusivity fences.

Historically this refused with `reason: serial_node_live`: a serially-opened gate was invisible to
the running set, so the live-coordination layer read exactly one `in_progress` row with no live
running set and treated the gate and the scheduler as mutually exclusive. The manual recovery
(re-open the gate through `open-ready` first) is no longer needed — the gate's own serial open now
records it.

For the operator-directed path, `open-next --node-id {descendant}` on a gate-blocked read node
still refuses `gate_not_complete` (naming the open gate) so the speculative open is routed through
`open-ready`; this stays the more-specific refusal even though the gate is now a live running-set
member.

### 8.2 Do not land parent-branch commits while a speculative leg is open

A speculative WRITE member's leg is anchored to a specific parent commit at provision time
(the leg-base). If a commit lands on the parent branch between provisioning the leg and closing
it — e.g. an unrelated node finishing and committing — the anchored leg-base is no longer an
ancestor of the leg's own history, and the close-time barrier refuses `leg_base_unreachable`
(surfacing as a union-barrier overflow on merge). This is correctly fail-closed: the barrier
will not merge a leg whose base it cannot verify sits in that leg's own ancestry.

**Recovery:** reset the parent branch back to the interim commit, rebase the speculative leg
onto it, then re-run the close (per-leg barrier → merge). Once the leg's base is re-anchored to
an ancestor of its own HEAD, the close proceeds normally.

**Practical guidance:** while a speculative leg is open, avoid landing further commits on the
parent branch until the speculative member either closes (pass-merge) or is discarded (leg torn
down).

---

## Quick decision tree

```
open-next -> gate_not_complete
  |
  +-- speculative_open_policy absent/off ---> wait for gate to close, then re-run open-next
  |
  +-- speculative_open_policy: auto (default) --> open-ready   (no flag; activates automatically)
  |
  +-- speculative_open_policy: consent ---------> open-ready --speculative-consent
        |
        (either tier) dispatch speculative role agents (write members: into their own leg);
        record evidence
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

Gotchas: gate opened via the fused serial advance -> open-ready ADMITS its speculation (§8.1).
         parent commit lands while a leg is open   -> close refuses leg_base_unreachable (§8.2).
```
