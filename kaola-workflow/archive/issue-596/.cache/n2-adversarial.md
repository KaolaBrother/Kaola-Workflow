evidence-binding: n2-adversarial bf77cf161668
## n2-adversarial — change-gate adversarial verification (opus, read-only)

Claim: the #596 speculative-write-legs implementation is correct, complete, and regression-free.

Baseline: test-next-action 103, test-adaptive-node 1310, test-commit-node 123, walkthrough passed; edition-sync --check 10 ports in parity; validate-script-sync 24 scripts / 25 byte-identical groups; all ports carry isWriteEligible/hasUnresolvableEntry/selectSpeculativeWriteGroup/specWriteGateRollback.

All eight attacks executed with real-git repros; ALL WITHSTOOD:
(1) AC4 parent purity incl. the untested multi-member else branch: 2-disjoint-sibling co-open, discard one -> that leg torn down, survivor leg + group baseline survive, lane_group reduced, ledger reset; survivor closes group_passed+synthesized; discarded file absent from HEAD; parent byte-identical.
(2) AC7 crash windows: multi-member rollback (gate FAIL, both opening) -> both rolled back/purged/group cleared; reconcile #2 idempotent no-op. Roll-forward (gate PASS) -> kept/opened; #2 no-op. Leg-before-running-set-write window backstopped by default-on sweepOrphanLegs (shared verbatim with shipped co-open — not a #596 regression). n.opening scoping load-bearing and correct.
(3) Close-fence bypass: speculativeCloseGuard blocks close while gate incomplete. Sharp edge investigated hard: after a gate closes verdict:fail, close-node on the writer succeeds and merges the leg — NOT a new hole: dependency satisfaction is ledger-complete (next-action.js:34 TERMINAL) so the normal non-speculative flow behaves identically; the fail verdict blocks at finalize --verdict-check; the writer's own G1 downstream reviewer still reviews the merged code; reconcile roll-forward DOES enforce verdict:pass. Discard-only-on-fail is a conservative rework preference surfaced via speculative_review_required, matching the read half.
(4) Disjointness at open-time: case-collision refused at freeze, flagged by --parallel-safe, excluded by selectSpeculativeWriteGroup; re-verification genuinely invoked at open (validator subprocess), case-folded.
(5) Cap accounting: 5 disjoint speculative siblings -> exactly 4 open (WRITE cap 4, not read cap 8), max_concurrent=4 recorded, 5th pending; no overflow/double-count.
(6) Read-speculation regression: HEAD-vs-WORK read-discard lifecycle byte-identical; read evidence KEPT; isWriteMember gate isolates all new code from the read path.
(7) Off-inertness: next-action JSON byte-identical HEAD-vs-WORK at off / consent-read-only / explicit-off; open-ready + running-set.json byte-identical on a normal open; no speculativeWriteExcluded leak.
(8) Static refusals: 7 fixtures — protected (basename + schema), dir-shape, glob, mixed-protected, sink all block; clean file eligible; the sink block is load-bearing.

NOT-REFUTED (confidence: high). The one sharp edge (close-after-gate-fail merges) is orchestration-gated, matches normal-flow semantics, gated by finalize verdict-check + downstream G1.

verdict: pass
findings_blocking: 0
