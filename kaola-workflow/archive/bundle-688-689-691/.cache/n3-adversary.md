evidence-binding: n3-adversary 38744c1d6cb7
verdict: pass
findings_blocking: 0
upstream_read: n1-harden f9a8f0a8faa9

finding: id=R2 scope=in_scope action=document status=deferred severity=low fix_role=none rationale=cosmetic: the isCanonicalBlobMap refusal prose at adaptive-schema.js:804 still says "with sorted keys" — stale wording after the order-insensitive change, zero behavior impact; tidy opportunistically, not worth a repair round
finding: id=R1 scope=in_scope action=none status=resolved severity=low fix_role=none rationale=#691 stat→read micro-TOCTOU (n2's R1) — unreachable via shipped atomic-rename writes; concur resolved

# n3-adversary — bundle #688/#689/#691 (real-flow reachability, executed surfaces 1-6)

## 1. #688.1 fail-closed absent ledger — no reachable break
proveRebindAdmissible has ONE call site (runRepairNode STEP 13 :4937), always threaded proofLedger=
readLedgerStatuses(initialPlan) (returns an object on every path, {} never null). DECISIVE upstream fence
(executed V8): with a {} ledger, uniqueMaximalReviewProducer returns history_valid:false → readReviewJournal's
identity check (:2212-2223) refuses review_journal_repair_identity_mismatch for any attempt with producer_bindings/
repair.selected_writer; runRepairNode returns on !ok at :4825 BEFORE STEP 13. Since repairWriters is non-empty
only when another attempt has repair.selected_writer, every state the new refusal could fire in is already fenced.
Only route past = a hand-tampered plan (ledger deleted; plan_hash excludes the ledger, revalidateForResume never
checks it) — and there the OLD behavior was the admit-all bug the issue targets. Crash-resume/fast-path never
touch the predicate. Probes V1-V4: {}/null/corrupt/case-variant refuse, no crash.

## 2. #688.2 n/a exclusion — no reachable legitimate co-repair breaks
foldSelectorArms (:1854) is the ONLY spliceLedgerNode(...,'n/a'); arms fold to n/a at selector close before any
arm opens, so a repair-owning gate at n/a is unconstructible via CLI (repair/reopen fold to pending only). The
exotic reopened-selector corner: even there the new refusal is SOUND (a pruned gate never re-reviews → old
attribution waived review). Killer probe V5 (uncovered by shipped tests): a MULTI-member owner gate with one n/a
+ one pending STILL attributes via .some — partially-pruned fan-out not over-tightened. V6 complete+in_progress
attributes; V7 all-complete refuses (preserved). Predicate byte-identical ×4.

## 3. #688.4 no lost invariant
candidate_declared enumeration order is used NOWHERE: transaction_key hashes {plan_hash,gate,candidate_digest,
generations} (not the map); candidate digest hashes the SORTED ls-tree lines; every consumer is per-key; no
whole-map JSON.stringify comparison exists (grep). Real-repo drive: production computeReviewCandidateDigest emits
declared enumerating ["10","2024",".env","a.js"] — the OLD check REJECTED production's own output (P2). A canonical
integer-keyed journal attempt validates green after a byte round-trip (P3b), double round-trip byte-stable (P5b) —
even a hypothetical stored-vs-recomputed whole-map compare would agree (both hoist integer keys identically).
Shape checks not weakened: 39-hex/5-digit-mode/empty-key/array still refused (P7-P10). New check accepts a strict
superset differing only in enumeration order. Cosmetic: :804 prose stale (R2).

## 4. #689 fail-soft — 27/27 fault-injection probes ×3 scripts, airtight
Per script: T1 success order fsync(tmp)→close→rename→open(dir)→fsync(dirFd)→close(dirFd), zero fd leaked; T2
idempotent same-content → false, never opens dir; T3 dir-open EACCES swallowed → true durable; T4 dir-fsync
ENOTSUP swallowed → true, dir fd STILL closed (fsync-failure leak check); T5 dir-close EBADF swallowed; T6 rename
ENOSPC STILL propagates, tmp unlinked, block never entered; T7 tmp-fsync ENOSPC still propagates. dirFd!==undefined
guard correct even for fd 0. Blocks byte-identical ×3, strictly after the rethrowing rename catch.

## 5. #691 — kept/reaped correct, no new swallow (real CLI)
5 real barrier refs, real barrier-ref-sweep: chmod-000 PROJECT DIR (live state inside) → KEPT; no-folder → reaped;
clean-ENOENT (folder, no state) → reaped; state-file-is-a-directory EISDIR → KEPT; normal live → KEPT (unchanged).
The single catch keeps on any non-ENOENT — swallow direction is always KEEP (fail-closed), never reap. Only
reap-divergence is the R1 TOCTOU (resolved). keep-pass (c) byte-identical ×4.

## 6. #688.3 + cross-fix regression
#688.3: 12 Object.prototype ids refused at validatePlan; reserved-substring ids (proto-review/constructor-gate/
toString2/my__proto__x) still freeze; a legacy frozen plan with node id `constructor` (even mid-run in_progress)
still passes revalidateForResume (no stranded plans). Motivation confirmed: readLedgerStatuses drops a __proto__
row; a missing toString row reads as the inherited function — full-reserved-set breadth justified.
Regression: adaptive-node 2166 (incl #683 seven-step N11 + 32 #664-fold refs); claim-hardening 251 (#685 ×14 +
#686 ×61 + #691 ×8); fast 136 / full 78 / phase4 57. ALL FOUR CHAINS run by me → FOUR_CHAIN_EXIT=0, 6 walkthroughs
passed, 12 surfaces byte-match. Schema md5 a250d3a8 ×4; edition-sync + validate-script-sync green. Test diffs purely
additive.

## Verdict
NOT-REFUTED (high) — all six fixes correct, strictly tightening, regression-free under executed probes on surfaces
1-6. Residuals cosmetic (R2 stale prose; R1 resolved TOCTOU). No repo file modified.
