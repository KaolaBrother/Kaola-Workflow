# tdd-task-2 — Gitea script (B1) + behavior tests (C2)

> tdd-guide dispatched with model=opus (Sonnet rate-limited).

## Modified files (exactly 2 in write set)
1. plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-closure-audit.js (CREATE)
2. plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js (helpers runClosureAudit/Offline/closureAuditShim(tea)/plantClosureRoadmapSource/makePrSinkFolder + 11 tests, registered after testGiteaOfflineBypassesFailClosed() before async tail)

## RED
11 tests added, script not created → MODULE_NOT_FOUND; testClosureAuditOfflineRemoteClassesSkipped fails (offline exit 1). All pre-existing tests still passed.

## GREEN (orchestrator re-verified)
`node test-gitea-workflow-scripts.js`: all 11 testClosureAudit* PASSED + full suite → "Gitea workflow script tests passed" exit 0.
`node validate-kaola-workflow-gitea-contracts.js` → "Kaola-Workflow Gitea contract validation passed" (forbidden-token loop scanned new script + edited test; zero glab).

## Offline smoke (fresh git tmp)
dry_run true, offline true; stale_in_progress_labels "skipped_offline", unarchived_pr_folders "skipped_offline"; exit 0.

## Orchestrator verification of Gitea pitfalls (read script)
- glab token count in script = 0 (and test file). ✓
- D4 (91): parseInt(field('issue_iid')||field('issue_number'),10). ✓
- prNumberFromFolder (169) → viewPullRequest(prNumber) NUMBER (187). ✓
- Lowercase `state === 'merged' || state === 'closed'` (189), NO toUpperCase. ✓
- unarchived_pr_folders key in drift(218)/counts(225 Array.isArray guard)/reported_not_repaired(267). ✓
- updateIssueLabels(null, it.number, {remove:[CLAIM_LABEL]}) (253). ✓
- KEEP issue_number in items; KEEP PR naming. ✓

## Deviations
None. Note: C4 (add script to validator's two hardcoded arrays) deferred to Task 3 — validator currently passes without it (arrays only forward-assert listed scripts); C4 adds contract coverage for the new script and MUST land with C1 (install.sh) so installSupportScripts assertion holds.
