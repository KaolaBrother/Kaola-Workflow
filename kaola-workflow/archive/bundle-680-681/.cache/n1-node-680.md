evidence-binding: n1-node-680 66b13d954a8c

# n1-node-680 — REPAIR: torn-Phase-3 LIVE-group-baseline drop (adversarial R1, HIGH)

## Defect (empirically reproduced)
`runReconcileRunningSet`'s Part-B orphan-baseline sweep gave the GROUP baseline a SINGLE keep-source
(`running.lane_group.group_id`) added ONLY inside `if (running)`. A group_id has no ledger row, so the
in_progress-ledger keep never covers it. Torn Phase-3 (running-set.json truncated AFTER the ledger flip
to in_progress persisted) → `readRunningSet` null → the sweep kept members A,B but DROPPED the live
`barrier-base-lg-A-B` (file + ref) → A,B stranded in_progress against a `no_group_base` group barrier.

## Fix (correctness-first, fail-safe under-reap)
In the sweep drop loop, a `barrier-base-lg-*` candidate is skipped (KEPT) when `running` is null AND ≥1
in_progress ledger row exists — its group_id (`lg-<memberIds…>`) is unrecoverable, so its deadness is
unprovable. Drop a torn-running lg-* only when there are ZERO in_progress rows (genuine pre-journal
orphan). When `running` is non-null the live group_id is already in `keep`, so a reached lg-* is a real
orphan → dropped. Member (non-lg-*) baselines keep their existing logic. Edited CANONICAL
`scripts/kaola-workflow-adaptive-node.js` (~:6194 ledger `hasInProgressB`; ~:6212 drop-loop guard) +
`node scripts/edition-sync.js --write` propagated to all 3 editions (`--check` clean).

<!-- RED: paste RED here -->
RED: #680-B-repair (test-adaptive-node.js) reconcile-running-set with A,B in_progress + live barrier-base-lg-A-B + running-set.json absent (torn Phase-3) — AssertionError "the LIVE group baseline (file + ref) is KEPT ... got file=false ref=false"; rec.orphanBaselinesDropped === ["lg-A-B"] (live group baseline DROPPED pre-fix → no_group_base corruption).
<!-- GREEN: paste GREEN here -->
GREEN: #680-B-repair passes post-fix — live barrier-base-lg-A-B (file + ref) KEPT, not in orphanBaselinesDropped, member baselines A,B kept; full suite `node scripts/test-adaptive-node.js` passes (1843 assertions, exit 0); `node scripts/simulate-workflow-walkthrough.js` "Workflow walkthrough simulation passed" (exit 0); `node scripts/edition-sync.js --check` clean (all 4 editions in parity). #680 Part-A / Part-B positive (pre-journal orphan still dropped) / Part-B negative (false-positive guard) all still green.
