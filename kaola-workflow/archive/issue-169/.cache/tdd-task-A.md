# tdd-task-A — T1+T2+T6 Combined TDD Cycle

## Files Modified
1. `scripts/kaola-workflow-classifier.js` — T1 (OFFLINE guard + cmdClassify(argv) refactor + printHelp + main() dispatch)
2. `scripts/kaola-workflow-claim.js` — T2 (target_unverified branch in claimExplicitTarget())
3. `scripts/simulate-workflow-walkthrough.js` — T6 (rename + 4 new tests + register) + 4 setup-precondition fixes

## RED Evidence (pre-implementation)
Test runner halted on first failure:
```
Error: startup must exit 1 when target unverified, got 0
stdout: {"verdict":"green","claim":"acquired","selected_project":"issue-156","selected_issue":156,...}
    at testClassifierOfflineUnverifiedNoLocalEvidence (simulate-workflow-walkthrough.js:2346:5)
```
Classifier returned `verdict: green` / `claim: acquired` instead of `target_unverified` / `none` — confirming RED.

## GREEN Evidence (post-implementation)
Final run exited 0 with "Workflow walkthrough simulation passed". All target tests pass:
- testClassifierOfflineUnverifiedNoLocalEvidence: PASSED
- testClassifierOfflineVerifiedRoadmapAcquires: PASSED
- testClassifierOfflineVerifiedOwnedFolderRoutes: PASSED
- testClassifierOfflineUnverifiedWithUnrelatedActiveFolder: PASSED
- testClassifierTopLevelIssueFlag: PASSED

## Setup-Precondition Fixes (under follow-up authorization)
4 pre-existing tests inadvertently exercised the bug #169 fixes (offline startup with no local evidence acquiring silently). Added `plantRoadmapIssue(tmp, N, '')` before each `startup --target-issue N`:
1. `testClaimStatusRelease` — issue 63
2. `testFinalize` — issue 164
3. `testWorktreeNativeOfflineWins` — issue 506
4. `testFastStartupState` — issue 503

No additional offline-startup-on-empty-tmp tests surfaced during GREEN run.

## Deviations
None. All T1.a/T1.b/T1.c/T2/T6.F1/T6.F2/T6.F3 specs implemented verbatim.

## Not Touched
- `plugins/kaola-workflow/scripts/*` — reserved for Task D mirror
- No git commit created (Phase 6 owns commits)
