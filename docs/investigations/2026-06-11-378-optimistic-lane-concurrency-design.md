# Design: optimistic lane concurrency — demote coarse-area/shared-infra write serialization to `ask` + merge-based join

**Date:** 2026-06-11
**Status:** Design (design-first deliverable for issue #378)
**Builds on:** `docs/investigations/2026-06-10-parallelism-redesign.md` §D6; the per-node
running-set scheduler #377 (§D5) and its join-on-close; the write-lane containment hook #376; the
#232 antichain check; the #303 governance-row work.
**Sequencing:** implementation lands **after #377 ships and has ≥1 telemetry-verified parallel
run** (#373). This document is the design phase the issue asks for; no validator code ships here.

---

## 0. Thesis

Write-fan-out disjointness is checked at **top-level-directory** granularity
(`classifier.areaForPath` / `disjointWriteSets`), and `SHARED_INFRA = {scripts, hooks,
plugins/kaola-workflow/scripts}` can never be fanned over at all — the refusal literally says
"must serialize, not fan out" (`plan-validator.js:746`). Almost all of this repo's own code lives
in `scripts/`, so the grammar makes write-parallelism structurally impossible for the project's
bread-and-butter work.

That was the right call **when parallel lanes shared one worktree** (a coarse-area touch by two
concurrent siblings was a guaranteed clobber risk). With #377's **per-node isolation + per-node
anchored baselines + join-on-close**, plan-time *PREVENT* can safely relax to runtime
*DETECT-AND-REPAIR*: let coarse/shared-infra siblings run in their own trees, then **merge** on
close, and only escalate on a real textual conflict.

## 1. Exact verdict matrix (before → after)

`classifier.disjointWriteSets` returns `green` / `yellow` / `red`:
- `green` — areas pairwise disjoint at file granularity.
- `yellow` — coarse-area / SHARED_INFRA overlap (different files, same top-level dir or shared
  infra dir). NON-exact.
- `red` — exact-path overlap (the same file in two sets).

Three placement contexts consume it. The matrix:

| Context | Verdict | **Today** | **After #378** |
|---|---|---|---|
| **Declared fan-out group** (same-label members), validator:744-746 | `red` (exact overlap) | refuse | **refuse** (unchanged — guaranteed clobber) |
| | `yellow` (coarse/shared-infra) | **refuse** ("must serialize, not fan out") | **`ask`** (governance row; runtime merge-join) |
| | `green` | auto/ask per blast-radius | unchanged |
| **Antichain** (unordered write-bearing pair w/ shared ancestor), validator:853-875 | `red`/exact | refuse (:861) | **refuse** (unchanged) |
| | `yellow` (coarse/shared-infra, shared ancestor) | `ask` via `concurrentAmbiguousOverlap` (:874, #232) | **`ask`** (unchanged — already optimistic; this is the alignment target) |
| | no shared ancestor | skip (independent branches) | unchanged |
| **`select` arms** (mutually exclusive — only one arm ever runs) | any | n/a (arms never concurrent) | unchanged |

**Net change: exactly one cell moves** — declared-group `yellow` goes **refuse → ask**, aligning
it with the antichain `yellow` cell that #232 already routes to `ask`. This is the "moves one
verdict between two *existing* governance classes" the redesign doc (§4) promised. Exact-path
`red` stays a refusal in **both** declared-group and antichain contexts (no safe authoring
exists; the fix is a dep edge). `select` is untouched (arms are never concurrent).

### Validator code shape
At `validator:744-746`, the `if (dj.verdict === 'yellow')` branch that today pushes an
`errors.push(... must serialize ...)` instead sets `sharedInfraTouch = true` (already a tracked
blast-radius reason at :1028) and records a diagnostic — it no longer pushes to `errors`. The
governance assembler (:1024-1034) already turns `sharedInfraTouch`/`writeRoleFanout` into
`decision: 'ask'`. So the change is: **stop erroring on declared-group `yellow`; let it fall
through to the existing `ask` governance.** `red` still `errors.push`.

## 2. Merge algorithm + baseline-ref reuse

`join-on-close` (#377 §D5) today is a **path checkout/rm** from the node worktree into the parent
(the #292 per-path join). #378 upgrades it to a **3-way merge per overlapping path**:

- **The three inputs** per overlapping path P:
  - **base** = the node's anchored baseline tree at `refs/kaola-workflow/barrier/<projTag>/<id>`
    (already created by `--record-base`, gc-safe, `plan-validator.js:1153-1185`, and
    cross-checked against the `.cache/barrier-base-<id>` file by #368) — `git show <baseRef>:P`.
  - **ours** = the parent worktree's current P (other lanes may have already joined).
  - **theirs** = the closing node's worktree P.
- **Algorithm:** `git merge-file --stdout <ours> <base> <theirs>` (line-level 3-way), OR
  `git merge-tree --write-tree <base> <ours-tree> <theirs-tree>` for a whole-tree merge. **Lean:
  `merge-file` per overlapping path** — overlapping paths are few (the whole point is they are
  mostly disjoint), it needs no temp index, and its conflict exit code (1) is the trigger. A
  path in only ONE lane is a plain checkout (today's behavior, no merge needed).
- **Baseline-ref reuse** is the crux: because each node's baseline is the **same** `origin`-rooted
  tree the run started from (per-node `--record-base` snapshots the tree at open), the base for a
  3-way merge between two sibling lanes is well-defined and already persisted as a ref — **no new
  artifact**. The merge is "apply lane A's diff-from-base and lane B's diff-from-base onto the
  parent"; clean iff their hunks don't overlap.
- **Clean merge → write the merged content to parent P, proceed.** The barrier (#368/#377) then
  diffs the parent against each node's lane as today — the merged result is in-lane for both.

## 3. `merge_conflict` routing + bounded-repair cap

- A `merge-file` conflict (exit 1, conflict markers) on close raises a new typed escalation
  **`merge_conflict`** added to the `adaptive-schema.js` HALT vocabulary beside `consent`,
  `security`, `test_thrash`.
- **Routing mirrors `test_thrash`** (memory: test_thrash → bounded repair via
  `build-error-resolver`, else consent-halt):
  1. Surface the conflicting path(s) + both lane ids in the escalation payload.
  2. Bounded auto-repair: dispatch **`build-error-resolver`** (the existing repair role) on the
     conflicted parent path to resolve markers, capped at **`MERGE_CONFLICT_REPAIR_CAP`** (new
     `adaptive-schema.js` const, **default 1** — one repair attempt; a second conflict on the
     same join is a hard halt, not a thrash loop). The cap reuses the `test_thrash` cap shape.
  3. On repair success → re-run the join merge → proceed. On cap exhaustion → **consent-halt**
     (`write-halt --reason merge_conflict`), draining the running set, surfacing to the user.
- **Fail-closed guarantee:** an unmergeable path **never lands silently** — it is either
  cleanly merged, repaired-then-merged, or it halts. There is no "last writer wins" path. This
  is the load-bearing safety property that lets the plan-time refusal relax.

## 4. Contract-validator token pins that move

- The four contract validators pin the refusal phrase `must serialize, not fan out`
  (declared-group `yellow`). That pin is **removed** (the phrase no longer emits) and **replaced**
  with a retired-token *ban* (`assertNotIncludes`, the #372 pattern) so it cannot silently return.
- Add emission pins for the new `merge_conflict` HALT token (adaptive-schema HALT vocabulary
  list) and the `MERGE_CONFLICT_REPAIR_CAP` const name — the adaptive-schema byte-identity group
  carries them ×4 automatically; the per-forge contract validators pin presence.
- The governance-row pin set (the `ask`/`auto-run` decision vocabulary) is **unchanged** — #378
  adds no new decision class, it re-routes one input into the existing `ask`.

## 5. Risk note — is governance `ask` sufficient for optimistic shared-infra width?

**The #303 Gap 9 finding:** governance `decision: 'ask'` is **audit metadata only** — it is
recorded in the freeze receipt and surfaced, but nothing *blocks* on it; the planner/orchestrator
is trusted to honor it. For the **antichain `yellow`** case this has been the accepted posture
since #232.

**Assessment for the declared-group `yellow` → `ask` move:**

- **Why `ask`-as-metadata is sufficient here:** the *real* safety net is no longer plan-time —
  it is the **fail-closed runtime join** (§3). Even if the `ask` is ignored, an actual conflict
  halts. The plan-time signal degrading from refuse→ask does not weaken the guarantee that
  unmergeable work cannot land; it only moves the decision from "forbidden at authoring" to
  "detected at integration." Given #376 containment + #377 per-node baselines, the worktree
  clobber that justified the original refuse cannot occur.
- **Residual risk:** shared-infra files (e.g. two nodes both editing different regions of
  `scripts/kaola-workflow-claim.js`) merge cleanly far more often than they conflict, but a
  *semantic* conflict (both edits parse + merge textually but interact wrongly) is invisible to a
  3-way text merge. The barrier catches **write-set** violations, not semantic ones; the
  downstream gate (code-reviewer / test chain) is the semantic backstop — and post-dominance
  already guarantees one exists on every write-bearing path.
- **Recommendation:** ship the move to `ask` **with the runtime merge-join as the gate**, AND
  add an *optional* stronger consent surface for the narrowest case — **SHARED_INFRA width ≥ 2**
  (not mere coarse-area) — as a `write-halt --reason consent` style **opt-in** prompt the
  orchestrator MAY raise when fanning shared-infra, behind a schema flag
  `KAOLA_SHARED_INFRA_CONSENT` (fail-closed default false, i.e. off → today's trust model). This
  keeps the default path frictionless while giving cautious operators a real gate for the
  highest-blast-radius width. The implementation issue decides whether to ship the flag or defer
  it; the **merge-join fail-closed guarantee is non-negotiable and ships regardless.**

## 6. What does NOT change

Exact-path overlap stays a refusal (both contexts). `select` arms untouched. Post-dominance,
unique sink, `plan_hash` freeze, per-node barrier/evidence/baseline semantics: all unchanged.
#378 changes exactly **one validator verdict cell** and **one join operation** (checkout → 3-way
merge), plus **one new HALT token** with `test_thrash`-shaped routing.

## 7. Acceptance-of-design checklist (issue #378)

- [x] Exact verdict matrix before/after (red/yellow × declared-group/antichain/select) — §1.
- [x] Merge algorithm choice (`git merge-file` per overlapping path) + baseline-ref reuse — §2.
- [x] `merge_conflict` routing + bounded-repair cap (`MERGE_CONFLICT_REPAIR_CAP`, default 1) — §3.
- [x] Which contract-validator token pins move (`must serialize, not fan out` removed→banned;
      `merge_conflict` + cap pinned) — §4.
- [x] Risk note on `ask`-as-audit-metadata sufficiency + stronger-gate proposal
      (`KAOLA_SHARED_INFRA_CONSENT`, opt-in) — §5.
