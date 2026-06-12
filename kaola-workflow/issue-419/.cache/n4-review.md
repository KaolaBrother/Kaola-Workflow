b8c032274328
evidence-binding: n4-review b8c032274328

# n4-review — Gate review of issue #419 parallelism v3 design

Node: n4-review (BLOCKING GATE). Reviewed three authored design documents
adversarially against the 7 blocking gate criteria + advisory items. Every
runtime/structural claim was cross-checked against the live scripts in the
worktree (not taken on faith from the prose).

## Method

- Read all three docs in full: D-419-01.md, D-419-02.md, the investigation.
- Grepped the runtime to confirm survey claims (parallel_safe absent,
  write_node_exclusive at adaptive-node L2155, resolveLaneContainment default
  FALSE in adaptive-schema.js, max_concurrent not yet present, no
  gate_not_complete / speculative_open_policy yet).
- Verified cited docs exist: ADR 0008 (+#386 addendum), ADR 0005, v2
  predecessor investigation 2026-06-10-parallelism-redesign.md.
- Confirmed D-419-01 / D-419-02 are newly created (only commit b8c0322).
- Read validator antichain classification (L1018-1057), verifyGateExecution
  (L408-456), commit-node per-node vs whole-plan gate-verify semantics
  (L104-142), the serialLive derivation (adaptive-node L1965), the guard
  matrices (open-next excl:[scheduler,batch] L1006; open-ready
  integrity+excl:[serial,batch] L2127), --drop-base (L1785/L2467), and the
  open-next baseline shell (commit-node --node-id <id> --start, L1057).

## Gate criterion verdicts (all BLOCKING criteria PASS)

**[GATE 1] Every invariant is preserved and consistent — PASS.**
INV-1..INV-25 are all present exactly once (verified by enumeration: 25 distinct,
no gaps, no duplicates). Clean partition: D-419-01 defines INV-1..7 + INV-15..18;
D-419-02 defines INV-8..14 + INV-19..25. No invariant contradicts another. The
two records cross-reference each other's invariants correctly (D-419-02's
cross-cutting summary cites INV-2/4/5/6 from D-419-01). Each invariant is stated
precisely enough for a downstream implementer to verify compliance (each names a
concrete on-disk witness, env var, reason code, or code path).

**[GATE 2] Part 1 is correctly the precondition for Parts 2-4 — PASS.**
D-419-01 P1 establishes the kernel model as the foundation ("precondition for
2-4" in the dependency table). D-419-02 [INV-14] states P2's dependency as "P1
kernel MODEL + max_concurrent field, NOT the P1.3 wrapper collapse" — correct and
precise. P3 (D-419-01) correctly distinguishes read-fan-out (P1 only, "reads fan
out today") from write-parallelism (P1+P2) in both the dependency table and
[INV-18]. P4 [INV-23] correctly requires "P1 (the scheduler / max>1 arm)" and is
explicitly INDEPENDENT of P2 for the read case. The dependency tables in both
records are row-identical (verified by diff; only the self-reference sentence
differs, intentionally).

**[GATE 3] Part 4 stays consent-gated and discardable — PASS.**
[INV-21] is stated as the load-bearing invariant: speculative = in_progress NEVER
complete while the gate is in_progress, and the gate's complete+passing-verdict
remains the strict prerequisite for the descendant's own close. The 5-step discard
path (D-419-02 L206-218) is complete and correctly ordered: (1) ledger reset
in_progress→pending reusing the existing reopen transition (no new state, honors
INV-4), (2) baseline drop via commit-node --drop-base (confirmed real, used by
reconcile L2467), (3) running-set removal mirroring close-node, (4) evidence
discard to avoid evidence_stale, (5) on-disk git revert to the commit-node --start
baseline snapshot. Speculative WRITE overlap is correctly flagged
DESIGNED-but-DEFERRED (Consequences + OQ-P4-c + recommendation L220-224). The new
gate_not_complete close-refusal is named in [INV-21] and OQ-P4-b (and confirmed
not yet present in the codebase).

**[GATE 4] The #283 seal-vacuity guard is present — PASS.**
[INV-11] appears and is correctly stated: write nodes still run in the PARENT
worktree per ADR 0008 (verified — ADR 0008 L96-114 states the harness cannot force
CWD and the barrier is ground truth). The guard takes its post-#364 form: barrier
own-lane allowlist (no out-of-lane write lands) + the write-lane hook (flag ON).
[INV-11] EXPLICITLY states the seal-time `git status --porcelain non-empty AND
in-lane` worktree form is SUBSUMED by the per-node barrier and that there is no
member worktree to porcelain-check — i.e., it correctly describes the guard as NOT
using the worktree-porcelain form. Two parent-side layers, both already present.

**[GATE 5] Record numbering correct and non-conflicting — PASS.**
No prior D-419-01/D-419-02 existed (git log shows only the authoring commit
b8c0322; ls shows only these two). Records numbered correctly. Related: sections
cite real existing docs: ADR 0005 (0005-plan-run-owns-node-lifecycle.md present),
ADR 0008 (present, with the #386 addendum present at L94), the v2 predecessor
(2026-06-10-parallelism-redesign.md present), and the sibling investigation
(present). Issue cross-refs (#283/#293/#364/#376/#377/#383/#386/#400/#406/#411)
are coherent with the runtime.

**[GATE 6] No design mis-states an invariant — PASS.**
- parallel_safe is correctly DERIVED not authored ([INV-8]: validator computes,
  author value ignored/overwritten) and correctly placed OUT of plan_hash
  ([INV-9]; "a projection of already-hashed data must not re-enter the hash").
  Confirmed no parallel_safe exists today, so this is a clean addition.
- The barrier is correctly the ground truth ([INV-12]/[INV-13]); the hook is the
  ergonomics/fast-fail boundary. Verbatim-consistent with the write-lane hook
  header "Hook = fast-fail containment; barrier = ground truth" (hooks file L17)
  and ADR 0008's "barrier guard is the ground truth."
- [INV-2] byte-identity is clearly the HARD invariant prohibiting open-next from
  writing running-set.json ("open-next MUST NOT begin writing a running-set.json").
  Confirmed open-next today writes no manifest and runs excl:[scheduler,batch].
- The reads-already-work vs writes-need-P2 distinction is made explicitly and
  repeatedly ([INV-18], the dependency table P3-reads vs P3-writes rows, and the
  investigation §2.3).

**[GATE 7] No internal contradiction between D-419-01 and D-419-02 — PASS.**
Checked every shared mechanism: the kernel model, max_concurrent out-of-hash
(D-419-01 P1.2) vs parallel_safe out-of-hash (D-419-02 P2.1) vs
speculative_open_policy IN-hash (D-419-02 P4) — the asymmetry is stated
identically in both records and in the investigation §4 (runtime caps/derived
projections stay out; eligibility that changes legal execution shape goes in). The
three-armed refusal taxonomy, the write-alone fallback (INV-6), the four ledger
states (INV-4), and the dependency tables all agree across records. No
contradiction found.

## Advisory findings (NON-BLOCKING)

**[A1] (advisory) [INV-22] vs per-node gate-verify informational status —
NOT a defect, complementary by design.** commit-node tags --gate-verify as
INFORMATIONAL at the per-node level (L110-124, to avoid the
downstream-reviewer-still-pending deadlock) and blocking only at whole-plan
(L130-138). [INV-22] calls --gate-verify "the enforcement point" for
post-dominance over the complete-set. This is internally consistent: --gate-verify
(verifyGateExecution, validator L408-456) IS the global enforcement that no node
reaches complete without a completed post-dominating gate, enforced at
whole-plan/finalize; and [INV-21] correctly adds a NEW per-node close-time
gate_not_complete refusal precisely BECAUSE the per-node gate-verify is
informational and cannot itself block a speculative descendant's close. The two
invariants are complementary, not contradictory. Downstream implementers should
note the per-node-vs-whole-plan distinction when wiring gate_not_complete so they
do not assume per-node gate-verify already blocks.

**[A2] (advisory) decision:ask consent-capture leans on a checkpoint that today
freezes-and-proceeds.** D-419-02 [INV-19] / the consent model says under
speculative_open_policy: consent the user grants consent "at the existing
decision:ask checkpoint — which here becomes the consent capture point." Today
decision:ask is explicitly NON-gating audit metadata (adaptive-handoff.js L29-30:
"freezes-and-proceeds — NO needs_user_approval, NO --authorized"). The design
correctly frames this as decision:ask BECOMING a consent point (a proposed change,
not a mis-statement), and OQ-P4-a leaves the consent-capture mechanism open. This
is sound, but downstream P4 implementation must define the actual consent
handshake since the existing checkpoint performs no approval today.

**[A3] (advisory) approximate line citations are reasonable.** Spot-checked
anchors are accurate or close: write_node_exclusive at adaptive-node L2155 (doc
says "~L2155" — exact); serialLive derivation (doc "L1947/L1965" — readCoordination
at L1947, serialLive assignment at L1965 — exact); validator antichain classify
(doc "L1028-1056" — actual loop body L1018-1057, the per-pair loop L1028-1056 —
exact); runOpenReady "~L2109"/runCloseNode "~L2269"/reconcile "~L2401" are
approximate-but-plausible and flagged with "~". No citation is materially wrong.

**[A4] (advisory) investigation is well-grounded and does not over-claim.** §1.5
("what the survey confirmed is NOT present") matches the grep evidence exactly
(no parallel_safe, write_node_exclusive only as a runtime reason, lane-containment
inert). §6 correctly bounds claims ("a green walkthrough proves STATE correctness
only; claim wall-clock only from the D1 telemetry"). The investigation introduces
no invariant or mechanism absent from the decision records; every INV reference
resolves to a record-defined invariant.

## Conclusion

All 7 BLOCKING gate criteria PASS. The three documents are mutually consistent,
the 25 invariants are complete/non-conflicting/verifiable, every runtime claim
checked is accurate against the live scripts, and the highest-risk part (P4
speculative overlap) is correctly consent-gated, discardable, and ships only the
read-overlap with write-overlap DESIGNED-but-DEFERRED. The four advisory findings
are clarifications for downstream implementers, not design defects, and none
blocks the gate.

verdict: pass
findings_blocking: 0

finding: id=A1 scope=in_scope action=document status=open severity=low fix_role=none rationale=INV-22 whole-plan enforcement vs per-node informational gate-verify is complementary not contradictory; downstream P4 must wire gate_not_complete per-node
finding: id=A2 scope=in_scope action=document status=open severity=low fix_role=none rationale=decision:ask is non-gating audit metadata today; P4 consent-capture mechanism left open in OQ-P4-a and must be defined downstream
finding: id=A3 scope=in_scope action=none status=open severity=low fix_role=none rationale=approximate line citations are accurate or plausibly-near and flagged with ~
finding: id=A4 scope=in_scope action=none status=open severity=low fix_role=none rationale=investigation is grounded in the survey and introduces no record-absent claims

review: complete
