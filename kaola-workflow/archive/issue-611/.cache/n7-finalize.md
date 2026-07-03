evidence-binding: n7-finalize 330fc752c29f

compliance: main-session-direct
verdict: pass
findings_blocking: 0

Finalize sink (main-session-direct per plan-run contract):
- CHANGELOG/ADR/docs landed in n5 (before the n6 chain run) — receipt at 778bffa8 stays fresh; no post-receipt chain-asserted doc change.
- In-run gate story: n4 REFUTED the first AC3 implementation (fail-open on crashed barrier-check); n1 reopened, fixed to positive-confirmation fail-closed, n4 re-verified NOT-REFUTED. Recorded in D-611-01 + CHANGELOG.
- Barriers/gap-sweep/docking/summary recorded in finalization-summary.md; contractor + sink follow.
