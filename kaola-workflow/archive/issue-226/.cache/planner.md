# Fast Planner — issue-226 (test-coverage gaps)

## Decision: ROOT-ONLY placement (fast, 1 file)
All 3 tests land in scripts/simulate-workflow-walkthrough.js (already in npm test). The triage's "4 walkthroughs" is WRONG: the forge WALKTHROUGHS never exercise these surfaces; forge coverage lives in manual-only unit suites (test-*-workflow-scripts.js / test-*-sinks.js) NOT run by npm test, and the repo has NO CI. Full cross-edition parity would require wiring those suites into npm test (non-mechanical → full path) — out of scope. Byte-sync N/A (test files excluded; no production change). Residual: forge editions keep the same untested branches in their unrun suites — documented, not closed here.

## #27 — startup explicit-target RED refusal (write set: root walkthrough)
Gap: claimExplicitTarget red→user_target_red (claim.js:443-444) routed by cmdStartup (exit 1, before claimProject → no folder). Classifier-level red IS covered (testClassifierFolderOverlapRed :527-540) but no test drives `startup --target-issue` to assert user_target_red. Add testStartupExplicitTargetRedRefuses modeled on testClassifierFolderOverlapRed: plant active folder A (phase3 Files: scripts/kaola-workflow-claim.js) + roadmap fixture for B(71) overlapping the SAME file; `runNode(claimScript, ['startup','--target-issue','71'], tmp)` (runNode sets OFFLINE=1); assert status 1, parsed.verdict==='user_target_red', claim==='none', no kaola-workflow/issue-71 folder. RED-proof: neutralize `if (classified.verdict === 'red')` (claim.js:443) → test fails; revert.

## #28 — closure-audit --execute mid-loop timeout-break + labels_failed (root walkthrough)
Gap: only detection-timeout tested (testClosureAuditExecuteDetectionTimeoutPropagates :4295, labels_skipped_reason==='detection_timeout'). Mid-loop timeout break (labels_skipped_reason='timeout' + break) and labels_failed accumulation (closure-audit.js:266-275) untested. Add 2 fns modeled on testClosureAuditExecuteRepairsRoadmapAndLabels (:4082) + the detection-timeout test. Helpers: closureAuditShim(binDir, lines) writes a gh shim dispatching on argv; runClosureAudit(['--execute'], tmp, binDir, extraEnv). No roadmap fixtures (mid-loop iterates report.drift.stale_in_progress_labels = gh issue list JSON).
- testClosureAuditExecuteLabelRemovalTimeoutBreaks: shim returns ≥2 stale issues from `issue list`, HANGS on first `issue edit --remove-label` (setInterval); runClosureAudit with {KAOLA_GH_REMOTE_TIMEOUT_MS:'300'}; assert labels_skipped_reason==='timeout', labels_failed includes 91 AND length===1 (loop BROKE, never reached 92), labels_removed===[].
- testClosureAuditExecuteLabelRemovalNonTimeoutFails: shim returns ≥2 stale, exit 1 fast on every edit; runClosureAudit default; assert labels_failed includes BOTH 93 and 94 (no break), 'labels_skipped_reason' NOT in result.repaired, labels_removed===[].
RED-proof: neutralize the timeout-break (closure-audit.js ~:268-273) → timeout test fails; revert.

## #29 — cmdWorktreeFinalize no-diff skip-commit branch (root walkthrough — extend existing test)
Gap: cmdWorktreeFinalize (claim.js:967-981) `git diff --cached --quiet` exit0→skip commit; exit non0→commit. All 4 worktree-finalize calls (root walkthrough :2196,:2374,:2472,:2560) invoke once → always commit/catch. No-diff branch never hit. Extend testE2EGitHubMergeFullChain (~:2176): insert a SECOND worktree-finalize right after the first (before Step 4 finalize mutates state); capture `git rev-list --count HEAD` (cwd: wt850 — the linked worktree) before+after; assert wfResult2.finalized===true AND headCountAfter===headCountBefore (no commit). RED-proof: force commit-always (remove the no-diff skip) → headCount changes → assert fails; revert.

## Fast-eligibility
Single area (test suites), mechanical, no production change, one sensible harness per sub-item, no design choice (the parity decision resolved to root-only). 1 file. Fast.

## Acceptance
node scripts/simulate-workflow-walkthrough.js (exit 0, "Workflow walkthrough simulation passed"); npm test (full, no byte-sync/contract regression).

## Residual (documented, not closed)
Forge claim/closure-audit ports carry the identical gaps in test-*-workflow-scripts.js / test-*-sinks.js, which are not in npm test (no CI). Optional future parity if those suites are ever CI-wired.
