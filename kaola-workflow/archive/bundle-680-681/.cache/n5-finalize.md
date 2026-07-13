evidence-binding: n5-finalize 6e539f13cbfd

# n5-finalize — terminal sink (main-session-direct)

Bundle-680-681: two disjoint-file fixes, parallel-safe antichain, octopus-merged (`6dbb104b`) + an in-run adversarial repair on #680 Part B.

In-run repair: n4-adversary REFUTED the orphan-baseline sweep (live group-baseline drop on a torn Phase-3 running-set). reopen-node reopened n1-node-680; the fix now keeps `lg-*` group baselines when the running-set is torn AND members are in_progress. Re-review PASS + re-adversary NOT-REFUTED.

Finalize bookkeeping (main session):
- CHANGELOG.md — #680/#681 entries under [Unreleased].
- finalization-summary.md — Delivered/Files/Coverage/Run gaps/Compliance.
- Run gaps: 3 in_run_repair tuples (n1-node-680, n3-review, n4-adversary) → noise (the R1 refutation was repaired + re-verified in-run, not deferred).
- doc-docking.md — DOCKED (CHANGELOG only; no api/architecture-contract/env impact).

Four-chain receipt + four adaptive barrier gates run after this node's close; sink via `sink-merge --sink` from the main root closes #680/#681 (all-or-nothing). This is the final backlog-clearing run before the release cut.
