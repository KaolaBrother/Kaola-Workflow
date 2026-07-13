evidence-binding: n1-node-680 4d78506adc22

#680 — open-ready lane-group baseline crash-window family. Part A (Phase-2 non-drop) SHIPPED; Part B
(pre-journal SIGKILL window) SHIPPED via the ADDITIVE orphan-baseline reconcile sweep (the preferred
option — NO hot-path reorder). RED-first: 9 new #680 assertions failed pre-fix for the claimed reasons;
all pass post-fix. Scope: canonical scripts/kaola-workflow-adaptive-node.js + scripts/test-adaptive-node.js;
codex twin + gitlab + gitea ports regenerated via edition-sync --write (--check clean).

RED: pre-fix (`git stash` canonical, `node scripts/test-adaptive-node.js` EXIT=1) — #680-A the forced
Phase-2 baseline_failed abort fired correctly, but "drops the shared GROUP baseline FILE (was stranded
pre-fix), got exists=true" + the group REF + BOTH member baseline FILES + REFS all FAILED (stranded);
#680-B "reconcile reports the orphan baseline dropped, got undefined" + orphan FILE + REF survive;
#680-B-neg "only the orphan is dropped ... got undefined" + "co-present orphan baseline is dropped"
FAILED (sweep inactive), while the two LIVE-baseline survives-checks PASSED pre-fix (no over-reap
possible without a sweep) — the false-positive guard holds pre- AND post-fix.

GREEN: post-fix (`node scripts/test-adaptive-node.js` EXIT=0) — "adaptive-node tests passed (1836
assertions)", 0 FAIL lines — all 14 new #680 assertions green (Part A: group file+ref + member file+ref
dropped at the Phase-2 baseline_failed abort, ledger stays pending; Part B positive: reconcile's
orphan-baseline sweep drops the no-journal orphan file+ref and reports it in orphanBaselinesDropped; Part
B negative/false-positive-guard: live in_progress member baseline + live lane_group group baseline KEPT
while the co-present orphan is dropped). Gates: `node scripts/simulate-workflow-walkthrough.js` EXIT=0
("Workflow walkthrough simulation passed"); `node scripts/edition-sync.js --check` clean (10 ports + 24
COMMON mirrors + 27 byte-identical groups in parity). Four npm chains deferred to the finalize node.

Part-B approach: ADDITIVE orphan-sweep (option 1, preferred) — hoisted above reconcile's !running early-
return (mirrors the orphan-leg sweep), gated by a KEEP-set false-positive guard (in_progress ledger row |
running-set node | live lane_group member/group_id; sanitizer collisions only ADD to keep ⇒ fail-safe
under-reap), runs only inside reconcile-running-set (holds the SPLIT_GUARDED scheduler lock ⇒ no live
open-ready mid-Phase-1). No hot-path crash-recovery reorder was needed; Part B is NOT deferred.
