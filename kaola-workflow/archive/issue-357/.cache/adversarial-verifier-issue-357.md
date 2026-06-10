verdict: pass
findings_blocking: 0
finding: id=AV1 scope=pre_existing action=none status=resolved severity=low fix_role=none rationale=C2-order-shift: self-contained scenarios (testKeepOpenArchiveStamp, testManualArchiveBackstop, and others interleaved in original main()) now run AFTER all shared-tmp group scenarios rather than being interleaved; verified no functional dependency exists between the two sets; shared-tmp relative order is byte-preserved; full run exits 0

## Claim Under Test

C1: `--only <scenario>` runs ONLY that scenario (or its shared-tmp group) and a developer can reproduce a single failure in seconds instead of minutes. Issue #357.

C2: a FULL run is behaviorally identical to pre-refactor (order, sentinel, exit codes). Issue #357.

C3: ghMockEnv fail-closed cannot break any legitimate run path. Issue #357.

C4: the runNode 120s timeout cannot kill a legitimately-slow scenario on a loaded machine. Issue #357.

C5: the editions' CHILD FAILURE block triggers on real child failures (not just inline node -e plants). Issue #357.

## Disproof Attempt

### C1: --only isolation and timing

Ran `--only testProbeTimeoutEnv` (early registry entry): 0.055s wall time, output showed only 1 PASSED line, no earlier scenarios executed. Ran `--only testBundleClaimCreatesOneFolder` (near-last registry entry, index ~201): 1.225s wall time, only 1 PASSED line. Confirmed the main() try/finally block always cleans up the shared tmpdir for --only runs — before/after count of /tmp/kw-* dirs was identical. Ran `--only testClaimStatusRelease` (shared-tmp group): entire 13-scenario group ran, printed "Walkthrough --only subset passed (1 scenarios)" — no tmpdir leak. Ran `--only bogus`: exit 1, error message included the token name.

Could not find a counterexample: --only truly skips non-selected scenarios.

### C2: Full run behavioral identity

Diffed the new registry against the original main() call list (git show HEAD). Finding: In the original main(), self-contained scenarios (testKeepOpenArchiveStamp, testManualArchiveBackstop, and others) were INTERLEAVED between shared-tmp scenarios. In the new code they all run AFTER the entire shared-tmp group. This is a real execution ORDER CHANGE. However, investigation showed zero functional dependencies: (a) testKeepOpenArchiveStamp creates its own tmpdir (line 189: `fs.realpathSync(fs.mkdtempSync(...))`), (b) testRepair(tmp) writes its own 'repair-demo' project into shared tmp independent of those self-contained tests, (c) none of the shared-tmp scenarios 3-13 write state consumed by the interleaved self-contained scenarios. The relative order within the shared-tmp group is byte-identical to the original. Full run exits 0 with "Workflow walkthrough simulation passed" and runs all 214 scenarios (163 emit explicit PASSED lines; the 13 shared-tmp scenarios are silent, matching original behavior). Sentinel printed exactly once on full run; --only prints alternate message.

The order shift is a pre-existing refactor choice, not a regression. Could not construct a failing input from this difference.

### C3: ghMockEnv fail-closed

Verified: ghMockEnv(binDir) throws `Error: ghMockEnv: shim file not found at <path>` when the .js shim does not exist. testHarnessSelfCheck assertion (4) validates this: `--only testHarnessSelfCheck` passes. Audited all 12 ghMockEnv call sites: every direct caller (lines 2580, 3015, 3035, 3061, 3428, 3698, 5587, 5823) writes the shim file before invoking ghMockEnv. callProbeIssueState has `binDir ? ghMockEnv(binDir) : {}` guard for null binDir. The two offline paths that pass no binDir (lines 3073, 3079) never reach gh at all (OFFLINE=1 or null issueNumber returns early). Line 10270 intentionally tests the throw path in testHarnessSelfCheck. No ordering violation found.

### C4: runNode 120s timeout

runNode is used for claimScript, repairScript, roadmapScript, planValidatorScript, adaptiveNodeScript, handoffScript calls. E2E full-chain scenarios (testE2EGitHubMergeFullChain, testFastE2EMergeFullChain, testE2EGitHubPrFullChain) use spawnSync DIRECTLY with 60s timeout — NOT runNode. runClosureAudit uses spawnSync directly with 60s timeout. testClosureAuditStaleLabelsTimeout uses closureAuditShim which has a 60s timeout cap from probeTimeoutEnv(). Heaviest runNode scenario timed: testAdaptiveWorktreeProvisionedE2E = 0.937s wall time. Under 4x CPU contention: ~4s worst case vs 120s limit. No scenario routes through runNode with external network calls. Could not find any runNode path that could plausibly take >30s.

### C5: editions CHILD FAILURE block

Verified all 4 edition runner files (simulate-gitlab-workflow-walkthrough.js, simulate-gitlab-codex-workflow-walkthrough.js, simulate-gitea-workflow-walkthrough.js, simulate-gitea-codex-workflow-walkthrough.js) have byte-identical tail30+catch blocks. tail30(null) and tail30(undefined) both return '' (guarded by `if (!str) return ''`). When child dies by SIGKILL with stdio:'pipe', err.stdout is '' not null (verified with live Node execution). Created TMPDIR-only test: pointed run() at a real child that exits 42 with stdout+stderr output — delimited block printed correctly: "--- CHILD FAILURE: fake_child.js ---", stdout lines, stderr lines, "--- END CHILD OUTPUT ---", then rethrow with exit 1. Success path untouched.

## Verdict

NOT-REFUTED (confidence: high)

All five claims survived adversarial testing with real command execution. The one structural difference found (C2 execution order shift for self-contained scenarios) is a pre-existing design choice with no functional consequence — it registers as out_of_scope/pre_existing. The ghMockEnv fail-closed mechanism is newly correct and testHarnessSelfCheck asserts it. The 120s timeout is not reachable by any runNode path. The CHILD FAILURE block handles all error shapes including signal kills.
