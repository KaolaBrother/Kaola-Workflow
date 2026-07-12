evidence-binding: n1-repair-fold 7c50240a9817

RED: Wrote the #664 test block in scripts/test-adaptive-node.js (repair-node MIXED-shape group
fold: writer `impl` complete → COMPLETED {av-a, av-b} adversarial-verifier fan-out group (round-1
stale votes) + singleton in_progress `review` code-reviewer, both downstream). Captured the
failure against the UNPATCHED runRepairNode by loading a verbatim pre-fix HEAD copy of
scripts/kaola-workflow-adaptive-node.js (git show HEAD:...) in an isolated harness and running the
same assertions (without ever touching the real worktree file). Result:
  result664 = {"result":"ok","gatesReset":["review"], ...}  // av-a/av-b MISSING from gatesReset
  FAIL: #664: repair-node folds the WHOLE completed adversarial-verifier fan-out group (BOTH
        av-a and av-b), got gatesReset=["review"]
  FAIL: #664: av-a ledger row reset to pending, got plan=...| av-a | complete |...
  FAIL: #664: av-b ledger row reset to pending, got plan=...| av-b | complete |...
  FAIL: #664: BOTH stale skeptic receipts purged — stale round-1 votes must no longer satisfy
        --verdict-check; got removed=["barrier-base-review"]
  4 FAILURE(S) — RED confirmed (exit code 1)
This reproduces #664 exactly: neither av-a nor av-b individually post-dominates the repaired
writer (a sibling member supplies an alternate path around either one), so the pre-fix gate-reset
loop leaves both `complete` with their stale round-1 votes intact and never purges their receipts
— a stale-vote gate-integrity hole on the repair path (the twin of #658, which fixed only
reopen-node).

GREEN: Mirrored reopen-node's (#658) group-aware collective fold into runRepairNode's
post-dominating-gate computation (scripts/kaola-workflow-adaptive-node.js, runRepairNode step 3):
when a descendant gate is an adversarial-verifier fan-out (shape.kind==='fanout',
cardinality==='1') that does not individually post-dominate, resolve its group via
resolveAdversarialFanoutGroup (imported exactly as reopen-node imports it) and, when every member
is a descendant of the repaired writer AND every member is already `complete` (fully voted — a
mid-vote member is deliberately left alone), fold the WHOLE group into gatesReset/gatesFolded as
one collective unit (all member ledger rows complete/in_progress → pending). Added a new step
(4c) that purges the group's own `.cache/<member-id>.md` receipts (canonical-node-id mode) or the
legacy `adversarial-verifier-*.md` siblings (single-legacy-group mode), exactly mirroring
reopen-node's evidence purge — so stale round-1 votes can no longer satisfy a later
--verdict-check. Left the existing `would_orphan_in_progress` refusal at (3b) structurally
UNCHANGED for a mid-vote group: since a non-complete member is never added to gatesReset, its
in_progress row is still caught as an orphan exactly as before this fix. A singleton
(non-fanout) gate's evidence (e.g. the flagging code-reviewer's `verdict: fail` body) is
deliberately RETAINED as the repair brief — unchanged pre-existing #434-b behavior; only fan-out
GROUP receipts are purged.

Re-ran the same #664 test block against the FIXED code (node scripts/test-adaptive-node.js):
  result664.gatesReset = ["av-a","av-b","review"]  (group + singleton MIXED-shape, BOTH fold)
  av-a and av-b ledger rows reset to pending; review also reset to pending; impl → in_progress
  removed664 includes "av-a.md" and "av-b.md" (both stale receipts purged)
  removed664 does NOT include "review.md" (singleton reviewer evidence retained as repair brief)
  removed664 does NOT include "barrier-base-impl" (anti-laundering invariant preserved)
  Mid-vote sub-case: av-a in_progress / av-b complete → runRepairNode still refuses
    result:'refuse', reason:'would_orphan_in_progress', inProgress:['av-a']  (UNCHANGED)
`node scripts/test-adaptive-node.js` → "adaptive-node tests passed (1744 assertions)" (exit 0).
`node scripts/simulate-workflow-walkthrough.js` → "Workflow walkthrough simulation passed" (exit 0).
simulate-workflow-walkthrough.js was left untouched (no repair-node-specific integration
scenario needed changing) — declared-but-not-written per the skip-reason allowance.

Edition sync: ran `npm run sync:editions` (regenerated the codex twin
plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js and both forge ports
plugins/kaola-workflow-{gitlab,gitea}/scripts/kaola-{gitlab,gitea}-workflow-adaptive-node.js),
then `node scripts/edition-sync.js --check` → clean (10 forge aggregator ports, 24
COMMON_SCRIPTS mirrors, 27 byte-identical groups in parity with canonical).

Cross-edition four-chain (this diff touches the edition trees, so all four required):
  npm run test:kaola-workflow:claude  → exit 0 (adaptive-node 1744 assertions; full walkthrough;
    generate-routing-surfaces --check: 12/12 surfaces match)
  npm run test:kaola-workflow:codex   → exit 0
  npm run test:kaola-workflow:gitlab  → exit 0
  npm run test:kaola-workflow:gitea   → exit 0
All four green, run sequentially (not short-circuited via `npm test`'s `&&` chain — each invoked
individually and its own exit code checked).

Write set touched: scripts/kaola-workflow-adaptive-node.js (canonical fix),
scripts/test-adaptive-node.js (RED test), plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js,
plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js,
plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js (all regenerated via
sync:editions). scripts/simulate-workflow-walkthrough.js untouched (skip-reason: no new
integration scenario needed; existing #349/#658-style coverage plus the new unit-level #664 test
in test-adaptive-node.js already exercise the fix end to end).
