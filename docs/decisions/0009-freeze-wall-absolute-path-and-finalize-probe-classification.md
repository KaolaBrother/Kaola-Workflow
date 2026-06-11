# 9. Freeze-wall absolute-path refusal and finalize probe-classification correction

Date: 2026-06-12
Status: Accepted
Issues: #415 (absolute-path write-set tokens), #416 (barrier_base_mismatch hint + skipped_offline classification)
Related: ADR 0005 (plan-run owns node lifecycle), `docs/api.md` § Adaptive Refusal / Emit Protocol

## Context

### #415 — absolute-path write-set tokens freeze successfully but fail at the barrier

The plan-validator's freeze wall validated write-set tokens against the three-shape
grammar (exact file, bare directory, `*` wildcard) but did not check whether the token
was a repo-relative path. Two absolute-path forms slipped through:

- POSIX absolute path: `/abs/path/to/file.ts`
- Windows drive-letter prefix: `C:src/app.js`

Both tokens pass the shape grammar (they are not bare-directory-shaped and do not
contain `..`), so `--freeze` accepted them without error. At run-time, however, the
per-node barrier (`--barrier-check`) resolves paths against the repo root and compares
relative paths only. An absolute token can never match a relative actual-write path, so
any node that declared an absolute token would fail `write_set_overflow` unconditionally
on its first write — a guaranteed mid-run failure with no obvious recovery path and no
connection back to the authoring mistake.

The freeze wall is the only place that can catch this class of error before the plan is
stamped with `plan_hash`, after which the hash must be preserved for the `--resume-check`
integrity gate.

### #416 Part A — `barrier_base_mismatch` recovery hint is non-converging

`--barrier-check` emits a `barrier_base_mismatch` typed refusal at two distinct sites:

1. The barrier base file exists but its SHA differs from the gc-anchored ref's SHA
   (spoof or corruption).
2. The anchored ref is missing while the base file is present (partial drop).

Both sites printed the hint: "re-run `--record-base`". This hint does not converge
because `--record-base` has an idempotent-reuse branch: if the base file is already
present it returns early without re-anchoring the ref. So a user following the hint on
a mismatched base would get a silent no-op, leaving the mismatch in place.

The correct recovery paths are:
- `--drop-base` (removes both the file and the ref) followed by `--record-base` (takes
  a fresh snapshot of the current tree).
- Ref-restore only, when the ref was accidentally deleted but the file is trusted.

An important caveat: re-recording after implementation work has been done launders
the crashed attempt — the new base would snapshot a tree that includes the node's
own changes, neutering the barrier that is supposed to diff those changes against the
declared write-set. The corrected hint includes this warning explicitly.

### #416 Part B — `skipped_offline` misclassified as `close_pending` in finalise

`cmdFinalize` probes each member's remote issue state before archiving. When the forge
was unreachable the probe threw, the `catch` branch recorded the outcome as
`'skipped_offline'`, and `closePendingFinalize` included that value in the
`close_pending` bucket.

The `remote-members-closed` invariant asserts that all members are either confirmed
closed or scheduled for deferred close (`close_pending`). By counting a skipped-offline
probe as `close_pending`, a forge outage silently satisfied the invariant — the receipt
looked like a normal deferred-close rather than a degraded probe. An operator following
up on a bundle that appeared finalized might find issues still open on the forge with no
indication that the close was never attempted.

## Decision

### #415 — Refuse absolute-path tokens at freeze with typed reason `absolute_path`

Add a pre-grammar check in the freeze path of `kaola-workflow-plan-validator.js` that
recognises the two absolute-path forms:

- Leading `/` (POSIX absolute)
- `[A-Za-z]:` drive-letter prefix (Windows)

When a write-set token matches either form, emit:

```json
{ "result": "refuse", "reason": "absolute_path" }
```

and halt with exit 1, writing no plan. The check runs before the three-shape grammar
validation so the error is surfaced at the earliest possible point. The typed reason
`absolute_path` is added to the established vocabulary of freeze-time refusals
(`model_invalid`, `traversal`, `directory_shaped`, `duplicate_sink`, etc.) and is
documented in `docs/api.md`.

The freeze wall is the correct enforcement site because:
- It runs before `plan_hash` is stamped, so no integrity-gate breakage.
- The validator already owns all token-shape checks; adding a path-class check is
  consistent with the established pattern.
- Surfacing the error at authoring time, rather than mid-run at the barrier, gives the
  planner a clear signal with a repair path (replace with the repo-relative form).

### #416 Part A — Correct both `barrier_base_mismatch` recovery hints

Replace the non-converging "re-run `--record-base`" hint at both `barrier_base_mismatch`
sites with:

```
Recovery: run --drop-base --node-id <id> then --record-base --node-id <id>.
For a ref-only loss (file trusted): restore the ref with git update-ref.
WARNING: re-recording after work is done launders the crashed attempt —
the new baseline will include this node's own writes and the barrier diff
will be empty, neutering overflow detection.
```

This change is prose-only inside the existing typed-refusal emission; no behavioural
or schema change.

### #416 Part B — Exclude `skipped_offline` from `closePendingFinalize`; surface `probe_degraded`

Two changes to `cmdFinalize` in `scripts/kaola-workflow-claim.js`:

1. `closePendingFinalize` no longer counts `'skipped_offline'` entries toward the
   `close_pending` bucket. A `skipped_offline` probe result is treated as a
   degraded/unknown outcome rather than a scheduled close.

2. The finalise receipt gains a boolean field `probe_degraded: true` whenever one or
   more probes returned `'skipped_offline'`. This field is absent (not emitted) on a
   clean run, keeping existing receipt consumers backward-compatible.

## Consequences

**#415:**
- Authors who accidentally write an absolute path in a write-set now get an immediate
  `refuse / absolute_path` at freeze time instead of a confusing `write_set_overflow`
  mid-run.
- Any existing frozen plans that contain absolute-path tokens are unaffected (the hash
  is already stamped; this check fires only on the freeze code-path). Such plans would
  still fail at the barrier, but no new ones can be created.
- The `absolute_path` reason code is a new surface in `docs/api.md`; callers parsing
  the refuse envelope may wish to present a dedicated message.

**#416 Part A:**
- Operators following the corrected hint will correctly converge: `--drop-base` removes
  the mismatched state, `--record-base` takes a clean snapshot, and the barrier can then
  run a legitimate diff.
- The laundering-warning makes explicit what was previously an implicit hazard; any
  operator who has been using the old (non-converging) advice will recognise the pattern.
- No behavioural change; existing passing barrier runs are unaffected.

**#416 Part B:**
- A forge outage during finalise is now observable: the receipt carries `probe_degraded:
  true` and the operator knows they must re-probe once the forge is available.
- The `remote-members-closed` invariant is no longer silently downgraded by an outage;
  the invariant correctly remains unresolved until a genuine close confirmation is
  obtained.
- Existing finalise receipts with no probe degradation are byte-identical (the field is
  absent when not needed).
- Scripts that gate on `close_pending` count (e.g. a re-run guard) will see a lower or
  zero count on a degraded probe run, which is the correct signal: the closes were not
  scheduled, they were not attempted.
