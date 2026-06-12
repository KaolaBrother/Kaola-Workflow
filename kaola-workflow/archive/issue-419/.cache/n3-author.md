24667cd377de
evidence-binding: n3-author 24667cd377de

# Evidence: Parallelism v3 documentation authored — issue-419 n3-author

Authored the three documentation files for the settled parallelism v3 design (issue #419),
directly from the n2-architect settled design and grounded in the n1-survey runtime evidence.

## Files written (my declared write set — these four ONLY)

1. **`docs/decisions/D-419-01.md`** — ADR covering **Parts 1 + 3** (one coordination kernel:
   serial = running-set `max_concurrent = 1`, by subsumption not deletion; + scheduler-default
   posture). Follows the D-422-01.md format (Date / Status: Accepted / Issue: #419 / Related;
   Context / Decision / Consequences). Enumerates **[INV-1]..[INV-7]** (kernel model, byte-identity,
   crash-resume, write-alone fallback, #293 cross-consistency) and **[INV-15]..[INV-18]**
   (six-surface propagation, four-chain green, validator-derived stamp not authored, flag default
   unchanged). Records open questions OQ-P1-a/b and OQ-P3-a/b WITHOUT resolving them. Includes the
   cross-part dependency table + build sequence.

2. **`docs/decisions/D-419-02.md`** — ADR covering **Parts 2 + 4** (lane-attributed disjoint write
   parallelism = the #376 graduation; + optional consent-gated speculative gate overlap). Same ADR
   format. Enumerates **[INV-8]..[INV-14]** (derived stamp, recompute-on-open, all-pairs disjointness,
   #283 seal-vacuity carried forward, barrier = ground truth / hook = ergonomics, scheduler-arm
   precondition) and **[INV-19]..[INV-25]** (per-run consent, baseline roll-back discard, speculative
   = in_progress never complete, post-dominance preserved at the complete boundary, scheduler `max>1`
   precondition + P2-independence, blast-radius double-gating, whole-frontier roll-back). Records the
   discard path (5 ordered steps), the two layered out-of-lane failure modes (hook exit 2 / barrier
   `barrier_failed` — NO new `unattributed_write` reason), and OQ-P2-a/b + OQ-P4-a/b/c. Cross-references
   [INV-2]/[INV-4]/[INV-5]/[INV-6]/[INV-16] as cross-cutting binders. Includes the same dependency
   table + build sequence so the record is self-contained.

3. **`docs/investigations/2026-06-12-parallelism-v3-design.md`** — runtime-grounded analysis following
   the 2026-06-10-parallelism-redesign.md format (§0 Summary, then numbered sections). Explains WHY v3
   is needed (current-state gaps), WHAT blocks each of the four parts today, and WHY this approach vs
   alternatives. Cites actual script locations from the survey: `adaptive-node.js` `runOpenReady`
   (~L2109), `runCloseNode` (~L2269), `mutationGuardPrologue` (~L2058), the `serialLive` derivation;
   `plan-validator.js` antichain disjointness (L1028-1056); `classifier.js` `disjointWriteSets`
   (~L327); the dormant `KAOLA_LANE_CONTAINMENT` / `hooks/kaola-workflow-write-lane.sh`. Includes a v2
   (2026-06-10) → v3 comparison table noting the key DIVERGENCE: v3 does NOT adopt v2's D6
   detect-and-repair/3-way-merge — v3 keeps PREVENT (disjoint-only co-open, zero-conflict by
   construction). The decision records hold the invariant lists; the investigation focuses on
   analysis, rationale, and alternatives, avoiding repetition.

4. **`kaola-workflow/issue-419/.cache/n3-author.md`** — this evidence file.

## Ships in v3 vs DESIGNED-but-DEFERRED (kept explicit in the records)

- SHIPS: P1 kernel model + `max_concurrent` field; P2 derived `parallel_safe` stamp + lane-checked
  `open-ready` write co-open (behind `KAOLA_LANE_CONTAINMENT`, OFF by default); P3 six-surface prose +
  planner rubric (no flag change, reads fan out by default); P4 `speculative_open_policy` Meta field +
  `gate_not_complete` close-refusal + baseline roll-back discard, SHIPPING speculative READ overlap.
- DEFERRED / OUT OF SCOPE: P1.3 `open-next` → `open-ready --max 1` wrapper collapse; aligning
  `open-next` pick order to critical-path (OQ-P1-a); P4 speculative WRITE overlap; `speculative_open_policy:
  auto` (named, refused at freeze).

## Verification performed

- All 25 invariants [INV-1]..[INV-25] confirmed present across the two decision records (contiguous
  union; each in its primary record, with cross-cutting binders cross-referenced).
- Did NOT modify any script, CHANGELOG, README, or any file outside the declared four-file write set.

docs: complete
