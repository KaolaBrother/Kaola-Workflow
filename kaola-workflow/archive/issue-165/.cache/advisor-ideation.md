# Advisor — Phase 2 ideation gate

## Verdict: confirm Option B (dedicated scripts/kaola-workflow-closure-audit.js)
Agrees with planner. sink-merge.js precedent is exact: a read-mostly aggregator
that pulls helpers from claim.js and lives in COMMON_SCRIPTS. Cleaner than bloating
the 1097-line claim.js.

## Refinement 1 — reimplement the label query, don't reuse cmdAuditLabels
cmdAuditLabels/cmdRepairLabels are command functions: they call output() (writes JSON
+ may set exit code) and exit. Calling them from closure-audit would emit two JSON
blobs. closure-audit needs the underlying DATA: `gh issue list --state closed
--label workflow:in-progress --json number,title,url` as a ~6-line helper using ghExec.
Do NOT extract a shared helper from cmdAuditLabels (the refactor the planner forbade).

## Refinement 2 — verify the helper-import pattern before widening claim.js exports
parseArgs/output are tiny; inlining may beat widening claim.js's export surface.
ghExec is the only non-trivial one (OFFLINE + mock routing). Check what sink-merge does.

## VERIFIED against scripts/kaola-workflow-sink-merge.js (orchestrator finding)
sink-merge INLINES its own ghExec (:20), parseArgs (:54), assert, isSafeName, getRoot,
mainRootFromCoord — and imports ONLY domain helpers from claim.js
(getCoordRoot, readActiveFolders, removeWorktree, buildClosureReceipt, checkClosureInvariants).
sink-merge is invoked DIRECTLY (`node scripts/kaola-workflow-sink-merge.js`), NOT as a claim.js subcommand.

=> DECISION REFINEMENT: closure-audit.js will INLINE ghExec/parseArgs/output/assert/isSafeName
and import domain helpers from the active-folders + roadmap modules
(readActiveFolders, issueIsClosed, field, getRoot; regenerateRoadmap, readRoadmapIssues, roadmapDir).
Result: ZERO changes to claim.js — no new exports, no byte-sync risk on the critical file.
Invoked directly: `node scripts/kaola-workflow-closure-audit.js [--execute]`.
The issue's "claim.js closure-audit" form was a *suggested* shape; the issue explicitly
blesses "a dedicated roadmap/closure script if that is cleaner."

## Ceremony warning
Don't burn Opus turns on phase artifacts. Phase 3 brief; Phase 4 (tests-first then
implement then green) is the real work; Phase 5 self-review vs locked JSON + AC;
Phase 6 docs + run audit on this repo + commit + sink-merge + file 2 follow-ups + close #161.

## Closure sequence (Phase 6) — flagged, does not block now
sink-merge of #165 closes ONLY #165 (the --issue arg). Then file 2 gitlab/gitea
follow-ups, then explicitly `gh issue close 161` with AC1-AC5 summary. Parse closure_receipt;
if remote_issue_closed != closed, manual `gh issue close` (known mid-merge gap).
