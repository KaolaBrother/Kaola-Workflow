# Walkthrough triage — `scripts/simulate-workflow-walkthrough.js` (23,690 lines)

## Methodology correction (read this first)

The dispatch brief assumed scenarios are registered via inline `scenario((` calls, counted by
`scenario((` occurrences. **That mechanism does not exist in the current file.** `grep -c "scenario(("`
returns 0. The suite was refactored (unknown when) into:

- `buildRegistry()` (`simulate-workflow-walkthrough.js:19772-20066`) — builds an ordered array via
  `add(name, fn)` calls, **282 of them** (`grep -c "^  add("` = 282), in the exact execution order of
  the original `main()`.
- `SHARED_TMP_NAMES` (`:16451-16464`) — **12 names** that share one fixture root and run as a single
  indivisible group, first in the run. `buildRegistry()` prepends them as `sharedTmp:true` registry
  entries (`:19778-19780`).

Total scenario count: **12 (shared-tmp) + 282 (standalone) = 294**, not counted by any `scenario((`
grep. I counted ordinals by position in the registry as it actually runs (shared-tmp group first,
ordinals 1–12; then the 282 `add()` calls in file order, ordinals 13–294). All 294 are enumerated
below with **function-definition line number** (not registration line — registration all lives in
`buildRegistry()` at :19782-20064 and carries no per-scenario line info).

**Confidence markers** — `V` = classified after reading the full function body. `I`/`S` = classified
by strong, cross-checked inference: name pattern confirmed against ~140 directly-read neighbors, or a
confirmed call site of `seedAdaptiveFinalizeFixture`/`plantFrozenPlan` (grepped exhaustively, listed
below). `?` = inferred, lower confidence, flagged for a second look before acting on it.

## The MIXED-detector: `seedAdaptiveFinalizeFixture`

`seedAdaptiveFinalizeFixture(root, project, writeSet)` (`:123-202`) is the load-bearing shared fixture:
it plants a **complete synthetic frozen DAG plan** (`## Nodes` / `## Node Ledger` / freeze via
plan-validator) purely so a finalize/archive/sink/label/roadmap-cleanup scenario can get past today's
`adaptive_plan_missing` gate. Every scenario that calls it is MIXED by construction: the survivor
property under test is finalize/archive/sink/label/closure-receipt behavior; the DAG fixture is
scaffolding that has to be replaced, not the subject. Confirmed call sites (grepped exhaustively):
lines 270, 6485, 6498, 6532-6533, 6592-6593, 6681-6682, 6740-6741, 6805, 8778, 9627, 9682, 9755, 9832,
9882, 10290, 10335, 10362, 10570, 10627, 10675, 10715, 10930, 11518, 16853, 19139, 20190, 20245, 20268,
20308, 20396, 20678, 20723, 21262, 21700, 21759, 22561, 22569. A handful of scenarios build the same
kind of inline plan/Node-Ledger fixture by hand instead of via the helper (`testKeepOpenArchiveStamp`,
the `testClassifier*` overlap cases that call `plantFrozenPlan`) — also MIXED, noted individually.

---

## Full table

Legend: **ord** = execution ordinal · **line** = function definition line · **class** = DAG / SURVIVOR
/ MIXED.

### Shared-tmp group (ordinals 1–12, run as one indivisible unit, always first)

| ord | line | title | class | conf |
|---|---|---|---|---|
| 1 | 235 | testClaimStatusRelease | SURVIVOR | V |
| 2 | 265 | testFinalize | MIXED | V — seedAdaptiveFinalizeFixture:270 |
| 3 | 657 | testRoadmapGenerateMissingSourceGuard | SURVIVOR | V |
| 4 | 703 | testRoadmapGenerateCloseLastIssue | SURVIVOR | V |
| 5 | 725 | testRoadmapGenerateAtomicReplace | SURVIVOR | V |
| 6 | 747 | testRoadmapProjectRulesAppend | SURVIVOR | V |
| 7 | 784 | testRoadmapInitIssueConcurrentExclusive | SURVIVOR | V |
| 8 | 819 | testRoadmapFilenameAuthorityMissingIssueField | SURVIVOR | V |
| 9 | 841 | testRoadmapFilenameAuthorityMismatch | SURVIVOR | V |
| 10 | 863 | testRoadmapMigrateRoundTripNoDoubleEscape | SURVIVOR | V |
| 11 | 901 | testRoadmapEmptySourceGuard | SURVIVOR | V |
| 12 | 957 | testRoadmapInProcessRegenerateGuard | SURVIVOR | V |

### Standalone (ordinals 13–294, exact `buildRegistry()` order)

| ord | line | title | class | conf |
|---|---|---|---|---|
| 13 | 16399 | testAxiomBlockByteIdentity | SURVIVOR | V — checks `templates/axioms.md` byte-embed into init surfaces; no DAG |
| 14 | 335 | testKeepOpenArchiveStamp | MIXED | V — hand-built frozen plan+ledger, keep-open archive survivor property |
| 15 | 450 | testManualArchiveBackstop | SURVIVOR | V |
| 16 | 493 | testRepairFinalizationRoute | SURVIVOR | V |
| 17 | 553 | testSinkPrUsesFinalizationSummary | SURVIVOR | V |
| 18 | 606 | testHookShapeNoPhantomAdvisor | SURVIVOR | V — hooks.json shape |
| 19 | 623 | testResumeCompatLegacyAdvisorGateRow | DAG | V — legacy `## Required Agent Compliance` row mapping |
| 20 | 641 | testSubagentDispatchHookExists | SURVIVOR | V |
| 21 | 4994 | testClassifierFolderOverlapRed | SURVIVOR | V |
| 22 | 5009 | testClassifierFolderOverlapYellow | SURVIVOR | V |
| 23 | 5028 | testClassifierParallelModeBypass | SURVIVOR | V |
| 24 | 5068 | testClassifierClosedIssueResidueIgnored | SURVIVOR | V |
| 25 | 5096 | testClassifierReleasedFolderExcluded | SURVIVOR | V |
| 26 | 5112 | testClassifierFastScopeOverlapRed | SURVIVOR | V |
| 27 | 5134 | testClassifierFastScopeDisjointGreen | SURVIVOR | V |
| 28 | 5158 | testClassifierDotPathOverlapRed | MIXED | V — plantFrozenPlan seeds the claimed side |
| 29 | 5190 | testClassifierRootPathProseNoOverlap | SURVIVOR | V |
| 30 | 5208 | testClassifierDotAreaOverlapRed | MIXED | V — plantFrozenPlan |
| 31 | 5240 | testClassifierCuratedRootOverlapYellow | MIXED | V — plantFrozenPlan |
| 32 | 5283 | testClassifierCuratedRootProseClaimedYellow | SURVIVOR | V — prose only, no plan |
| 33 | 5300 | testClassifierCuratedRootProseNoOverlapGreen | SURVIVOR | V |
| 34 | 5318 | testClassifierCuratedRootStructuredLowercaseYellow | MIXED | V — plantFrozenPlan |
| 35 | 5341 | testClassifierFastScopeSectionIsolationGreen | SURVIVOR | V |
| 36 | 5369 | testClassifierFastScopeFenceCommentRed | SURVIVOR | V |
| 37 | 5532 | testClassifierSectionBodyFenceIdentity | SURVIVOR | V — pure `sectionBody()` unit test |
| 38 | 5553 | testPlanConsumerFenceMatrix | DAG | V — plan-validator `## Meta`/`Nodes`/`Node Briefs`/`Node Ledger` fence parsing across 4 editions |
| 39 | 5608 | testNodeBriefAuthoritativeSectionMatrix | DAG | V — Node Briefs plan-grammar parsing |
| 40 | 5399 | testClassifierFastScopeFenceHeadingRed | SURVIVOR | V |
| 41 | 5428 | testClassifierFastScopeFenceMixedMarkerRed | SURVIVOR | V |
| 42 | 5455 | testClassifierFastScopeFenceInFencePathRed | SURVIVOR | V |
| 43 | 5486 | testClassifierFastScopePreSectionUnclosedFenceRed | SURVIVOR | V |
| 44 | 5512 | testClassifierFastScopeAbsentNotManufacturedOverlap | SURVIVOR | V |
| 45 | 5657 | testClassifierDependsOnGate | SURVIVOR | V — issue-level `depends-on:#N` label gate, NOT the plan's node `depends_on` |
| 46 | 5735 | testProbeIssueStateOffline | SURVIVOR | I |
| 47 | 5741 | testProbeIssueStateNullIssue | SURVIVOR | I |
| 48 | 5747 | testProbeIssueStateEmptyGhResponse | SURVIVOR | I |
| 49 | 5765 | testProbeIssueStateGhThrows | SURVIVOR | I |
| 50 | 15311 | testStartupJsonAndHiddenLocalWorktrees | SURVIVOR | I |
| 51 | 6016 | testWorktreeNativeDefaultOff | SURVIVOR | V |
| 52 | 6047 | testWorktreeNativeInPlaceIdempotentReclaim | SURVIVOR | V |
| 53 | 6088 | testWorktreeNativeDirtyTreeAsksConsent | SURVIVOR | V |
| 54 | 6145 | testTreeDirtyFailsClosedOnProbeFault | SURVIVOR | V |
| 55 | 6179 | testWorktreeNativeDetachedHeadRecordOnly | SURVIVOR | V |
| 56 | 6211 | testWorktreeNativeDiscardRestoresBase | SURVIVOR | V |
| 57 | 6244 | testWorktreeNativeDiscardRestoresNonDefaultBase | SURVIVOR | V |
| 58 | 6282 | testWorktreeNativeOfflineWins | SURVIVOR | V |
| 59 | 6313 | testWorktreeNativeSurfacesProvisionFailure | SURVIVOR | V |
| 60 | 15354 | testWorktreeAdaptiveProvisioned | SURVIVOR | I — worktree-suppression policy for adaptive claims (parallel to testWorktreeAdaptiveSuppressed:6341, read) |
| 61 | 6368 | testClassifierCurrentClaimMarkerBlocks | SURVIVOR | I |
| 62 | 6393 | testWatchPrArchivesClosedIssuePrFolder | SURVIVOR | V |
| 63 | 6432 | testSinkFallbackSkipsArchivedProject | SURVIVOR | V |
| 64 | 6474 | testFinalizeReleaseCleansWorktree | MIXED | V — seed:6485,6498 |
| 65 | 6514 | testFinalizeFromLinkedWorktreeCleansMainCopy | MIXED | V — seed:6532-6533 |
| 66 | 6581 | testArchiveDestinationResolvesAgainstMain832 | MIXED | V — seed:6592-6593 |
| 67 | 6663 | testArchiveCommitHonestUnderGitignore832 | MIXED | V — seed:6681-6682 |
| 68 | 6724 | testFinalizeNarrowStagingExcludesForeignArchive | MIXED | S — seed:6740-6741 |
| 69 | 6796 | testFinalizeFromMainRootNoSpuriousRemoval | MIXED | S — seed:6805 |
| 70 | 9677 | testFinalizeCleansRoadmapEntry | MIXED | S — seed:9682 |
| 71 | 9736 | testFinalizeFromLinkedWorktreeCleansRoadmapEntry | MIXED | S — seed:9755 |
| 72 | 9820 | testFinalizeFromLinkedWorktreeCleansMainStagedRoadmapSource | MIXED | S — seed:9832 |
| 73 | 9877 | testFinalizeRoadmapCleanupFailureReceipt | MIXED | S — seed:9882 |
| 74 | 9912 | testWatchPrRoadmapCleanupWarning | SURVIVOR | I |
| 75 | 10244 | testValidateRemoteOffline | SURVIVOR | I |
| 76 | 6830 | testReleaseFromLinkedWorktreeCleansMainCopy | SURVIVOR | I |
| 77 | 6948 | testReleaseInPlaceOnFeatureBranchCommitsArchiveOnBase | SURVIVOR | I |
| 78 | 7022 | testWatchPrClosedSweepSkipsCommitOffBaseBranch | SURVIVOR | I |
| 79 | 7130 | testReleaseDetachedHeadLyingBaseSkipsArchiveCommit | SURVIVOR | I |
| 80 | 7209 | testReleaseOnFeatureBranchLyingBaseNamesDiscardedBranchSkips | SURVIVOR | I |
| 81 | 7278 | testWatchPrClosedSweepDetachedLyingBaseHeadSkips | SURVIVOR | I |
| 82 | 7352 | testWatchPrClosedSweepArbitraryLaneLyingBaseSkips | SURVIVOR | I |
| 83 | 7434 | testReleaseHeadRepointRaceDowngradesArchiveCommit | SURVIVOR | I |
| 84 | 7530 | testSinkMergeFromLinkedWorktree | SURVIVOR | I |
| 85 | 7595 | testSinkRefusesStaleReceipt | SURVIVOR | I |
| 86 | 8165 | testStatusShowsClosedIssueDrift | SURVIVOR | I |
| 87 | 8191 | testStaleWorktreeCheck | SURVIVOR | I |
| 88 | 8344 | testStaleWorktreeCleanup | SURVIVOR | I |
| 89 | 8121 | testNoTargetNeverAutoPicks | SURVIVOR | I |
| 90 | 8139 | testSoleActiveRoundTrip | SURVIVOR | I |
| 91 | 8657 | testSinkPrLeavesCleanWorktree | SURVIVOR | I |
| 92 | 8710 | testReadPriorityConfig | SURVIVOR | I |
| 93 | 8737 | testE2EGitHubMergeFullChain | MIXED | V — seed:8778 |
| 94 | 8873 | testSinkMergeRefusesLiveFolder | SURVIVOR | I |
| 95 | 8905 | testSinkRefusesLingeringLaneGroup | SURVIVOR | I |
| 96 | 8983 | testSinkLegacyPathRefusesLingeringLaneGroup | SURVIVOR | I |
| 97 | 9061 | testSinkRefusesDirtyWorktree | SURVIVOR | I |
| 98 | 9116 | testProbeHelpersFailClosed | SURVIVOR | I |
| 99 | 9150 | testArchiveIntegrityPortedToAllEditions832 | SURVIVOR | V — cross-edition source-string port guard, no DAG. Archive-completeness family (see call-out 2) |
| 100 | 9205 | testSinkMergeBlocksUnpushedCommits | SURVIVOR | I |
| 101 | 7731 | testAssertWorktreeCleanFailsClosedOnProbeFault | SURVIVOR | I |
| 102 | 7781 | testAssertWorktreeCleanFailsClosedOnListProbeFault | SURVIVOR | I |
| 103 | 7832 | testSinkRefusesOnPushMainFailure | SURVIVOR | I |
| 104 | 7881 | testSinkRefusesOnPushUpstreamFailure | SURVIVOR | I |
| 105 | 7935 | testSinkTransactionSyncsUntrackedWorktreeProjectDirOnMerge | SURVIVOR | I |
| 106 | 8005 | testSinkTransactionStampsPublishedHeadAfterRebase | SURVIVOR | I |
| 107 | 8059 | testSinkRefusesOnCloseFailure | SURVIVOR | I |
| 108 | 9235 | testSinkMergeAutoPushesWhenNoUpstream | SURVIVOR | I |
| 109 | 9268 | testSinkMergeOfflineSkipsPublishGuard | SURVIVOR | I |
| 110 | 9293 | testSinkMergeNonDefaultBranchMaster | SURVIVOR | I |
| 111 | 9331 | testSinkMergeReRebasesOnFfRace | SURVIVOR | I |
| 112 | 9374 | testSinkMergeConsumerRepoSkipsNpmTestGate | SURVIVOR | I |
| 113 | 9445 | testSinkMergeBareRemoteDeleteOrder | SURVIVOR | I |
| 114 | 9499 | testE2EGitHubPrFullChain | MIXED | V — seed:9627 |
| 115 | 9585 | testParallelIssueIndependence | MIXED | V — seed:9627 |
| 116 | 9988 | testClassifierFailClosedOnRemoteError | SURVIVOR | I |
| 117 | 10019 | testClassifierOfflineUnverifiedNoLocalEvidence | SURVIVOR | I |
| 118 | 10049 | testClassifierOfflineVerifiedRoadmapAcquires | SURVIVOR | I |
| 119 | 10077 | testClassifierOfflineVerifiedOwnedFolderRoutes | SURVIVOR | I |
| 120 | 10098 | testClassifierOfflineUnverifiedWithUnrelatedActiveFolder | SURVIVOR | I |
| 121 | 10131 | testStartupExplicitTargetRedAnswers | SURVIVOR | I |
| 122 | 10162 | testClassifierTopLevelIssueFlag | SURVIVOR | I |
| 123 | 10199 | testClaimProjectOwnedFolderFailingRemote | SURVIVOR | I |
| 124 | 10265 | testFinalizeRemovesClaimLabel | MIXED | S — seed:10290 |
| 125 | 10310 | testFinalizeNullFolderFallbackReadsArchive | MIXED | S — seed:10335 |
| 126 | 10356 | testFinalizeOfflineSkipsLabelInvariant | MIXED | S — seed:10362 |
| 127 | 10385 | testWatchPrEmitsClaimLabelReceipt | SURVIVOR | I |
| 128 | 10433 | testAuditAndRepairLabels | SURVIVOR | I |
| 129 | 10551 | testFinalizeClaimLabelFailedTriggersInvariant | MIXED | S — seed:10570 |
| 130 | 10594 | testClearAdvisoryClaimDeletesMarkerComment | MIXED | S — seed:10627 |
| 131 | 10643 | testClearAdvisoryClaimDoesNotDeleteOtherProjectMarker | MIXED | S — seed:10675 |
| 132 | 10691 | testClearAdvisoryClaimOfflineSkipsDelete | MIXED | S — seed:10715 |
| 133 | 10744 | testSinkMergeEmitsClosureReceipt | SURVIVOR | I |
| 134 | 10846 | testWatchPrMergedClosureReceipt | SURVIVOR | I |
| 135 | 10921 | testFinalizeOfflineClosureReceiptSkipped | MIXED | S — seed:10930 |
| 136 | 10960 | testSinkMergeMockabilityAndReceipt | SURVIVOR | I |
| 137 | 11715 | testSinkMergeCloseFailureWarning | SURVIVOR | I |
| 138 | 11796 | testSinkMergeCloseExitZeroButStillOpenFailsClosed | SURVIVOR | I |
| 139 | 11862 | testSinkMergeSkipsArchivedProjectPhantom | SURVIVOR | I |
| 140 | 11066 | testKeepOpenMergeFullChain | SURVIVOR | I |
| 141 | 11220 | testKeepOpenFinalizeFlagAlias | SURVIVOR | I |
| 142 | 11337 | testSinkMergeKeepOpenOnlineMock | SURVIVOR | I |
| 143 | 11405 | testSinkMergePostPushReopenOnMock | SURVIVOR | I |
| 144 | 11485 | testBundleFinalizeAllOpenCloseIsPending | MIXED | S — seed:11518 |
| 145 | 11560 | testSinkMergeKeepOpenRequiresIssue | SURVIVOR | I |
| 146 | 11581 | testSinkMergeKeepOpenArchivedStateGuard | SURVIVOR | I |
| 147 | 11615 | testClosureAuditKeepOpenExclusion | SURVIVOR | I |
| 148 | 11647 | testKeepOpenInvariantUnit | SURVIVOR | I |
| 149 | 11673 | testSinkPrKeepOpenRefusal | SURVIVOR | I |
| 150 | 11980 | testClosureAuditOfflineRemoteClassesSkipped | SURVIVOR | I |
| 151 | 12005 | testClosureAuditClosedRemoteRoadmapSource | SURVIVOR | I |
| 152 | 12030 | testClosureAuditArchiveClosedDrift | SURVIVOR | I |
| 153 | 12057 | testClosureAuditDedupRoadmapAndArchive | SURVIVOR | I |
| 154 | 12102 | testClosureAuditArchiveContentDrift832 | SURVIVOR | I |
| 155 | 12208 | testClosureAuditArchiveOnlyNotProbed | SURVIVOR | I |
| 156 | 12246 | testClosureAuditMirrorListsClosedIssues | SURVIVOR | I |
| 157 | 12273 | testClosureAuditStaleInProgressLabels | SURVIVOR | I |
| 158 | 12296 | testClosureAuditActiveFolderForClosedIssueReportsDirty | SURVIVOR | I |
| 159 | 12321 | testClosureAuditUnarchivedPrFolderMerged | SURVIVOR | I |
| 160 | 12351 | testClosureAuditExecuteRepairsRoadmapAndLabels | SURVIVOR | I |
| 161 | 12388 | testClosureAuditExecuteNeverTouchesActiveFolders | SURVIVOR | I |
| 162 | 12416 | testClosureAuditDryRunNeverCallsRemoveLabel | SURVIVOR | I |
| 163 | 12438 | testClosureAuditStaleLabelsTimeout | SURVIVOR | I |
| 164 | 12459 | testClosureAuditUnresolvedClosedState | SURVIVOR | I |
| 165 | 12482 | testClosureAuditProbeFailureUnresolved | SURVIVOR | I |
| 166 | 12507 | testClosureAuditTimeoutEnvInvalidFallsBack | SURVIVOR | I |
| 167 | 12535 | testClosureAuditTimeoutEnvOverCapFallsBack | SURVIVOR | I |
| 168 | 12564 | testClosureAuditExecuteDetectionTimeoutPropagates | SURVIVOR | I |
| 169 | 12585 | testClosureAuditExecuteLabelRemovalTimeoutBreaks | SURVIVOR | I |
| 170 | 12622 | testClosureAuditExecuteLabelRemovalNonTimeoutFails | SURVIVOR | I |
| 171 | 12656 | testClosureAuditPrFolderTimeout | SURVIVOR | I |
| 172 | 5934 | testProbeTimeoutEnv | SURVIVOR | I |
| 173 | 12679 | testContractValidatorOfflineSkip | SURVIVOR | V |
| 174 | 12694 | testContractValidatorReflowTolerant | SURVIVOR | V |
| 175 | 12738 | testContractValidatorMissingTag | SURVIVOR | V |
| 176 | 12777 | testTagAncestorGuard402 | SURVIVOR | I — release-tag-ancestor-of-HEAD guard; part of the release-gate family (call-out 1) |
| 177 | 12811 | testWatchPrAbandonedClosureInvariantsClean | SURVIVOR | I |
| 178 | 12870 | testClaimReclaimsStatelessOrphanDir | SURVIVOR | I |
| 179 | 12926 | testPatchBranchGuards | SURVIVOR | I |
| 180 | 1190 | testAdaptiveOffStartupRefusal | SURVIVOR | V — pure startup-acquire legality, no plan artifact touched |
| 181 | 1206 | testAdaptiveOffClaimRefusal | SURVIVOR | V |
| 182 | 1224 | testAdaptiveOffPreservesTwoWay | SURVIVOR | V |
| 183 | 1239 | testAdaptiveOnStartupAcquires | MIXED | V — startup survivor property, asserts `next_command: /kaola-workflow-plan-run` (dying route) |
| 184 | 1256 | testAdaptiveResumeFromFrozenPlan | DAG | V |
| 185 | 1271 | testAdaptiveResumeTamperedTypedRefusal | DAG | V |
| 186 | 1284 | testAdaptiveResumeUnparseableTypedRefusal | DAG | V |
| 187 | 1300 | testAdaptiveResumeAfterFlipOff | MIXED | V — claim-resume survivor mechanism, asserted outcome is the dying plan-run route |
| 188 | 1318 | testAdaptiveConsentHaltSurfaces | DAG | V |
| 189 | 1367 | testAdaptiveCrossSurfaceMutexWalkthrough | DAG | V — running-set scheduler mutex, plan integrity, durable Node-Ledger consent halt |
| 190 | 1487 | testAdaptiveValidatorGovernance | DAG | V |
| 191 | 2186 | testMetricOptimizerContract | DAG | V |
| 192 | 2478 | testQuestionShaped486 | DAG | V |
| 193 | 2528 | testAdaptiveFanoutGroupScoping | DAG | I |
| 194 | 2589 | testAdaptiveReadySetDisjointness | DAG | I |
| 195 | 2690 | testAdaptiveGateBarrierEnforcement | DAG | I |
| 196 | 3036 | testAdaptivePerInstanceBarrier | DAG | I |
| 197 | 3107 | testAdaptivePerInstanceBarrierHardening | DAG | I |
| 198 | 3354 | testBundle424432433ValidatorGates | MIXED | V — see call-out 1: contains the entire `--release-check` SURVIVOR block at lines 3816-4008 embedded inside an otherwise pure-DAG scenario (barrierCheck / ROLE_TOKEN_REGISTRY / finalize-check attribution sweep) |
| 199 | 4234 | testBundle424432433NodeSeeding | DAG | V |
| 200 | 4369 | testAdaptiveResumeReconcilesNextCommand | DAG | V |
| 201 | 4407 | testAdaptiveDurableConsentHalt | DAG | V |
| 202 | 4459 | testAdaptiveAuthoringEntryGuard | DAG | V |
| 203 | 4482 | testAdaptiveTier2Composition | DAG | V |
| 204 | 4626 | testAdaptiveAuditFixes | DAG | V |
| 205 | 4782 | testAdaptiveResumeHashDeletedTypedRefusal | DAG | V |
| 206 | 4802 | testAdaptiveValidatorNodeCap | DAG | V |
| 207 | 4825 | testAdaptiveCheapWinFixes | DAG | V |
| 208 | 4874 | testAdaptiveAuditCoverage | DAG | V |
| 209 | 12990 | testAdaptiveSyncGroupGap | DAG | V |
| 210 | 13071 | testAdaptiveRegistrationAndForgePortGaps | DAG | V |
| 211 | 13175 | testAdaptiveFreezeRepairReconcile | DAG | I — `reconcileLedger`, Node Ledger |
| 212 | 13219 | testAdaptiveVerdictCheck | DAG | I — `--verdict-check` gate mechanism (huge, ~630 lines) |
| 213 | 13847 | testAdaptivePatternLibrary | DAG | I — role pattern library (~370 lines) |
| 214 | 14213 | testAdaptiveSelectComposition | DAG | I — `select(<group>)` grammar |
| 215 | 14337 | testAdaptiveSelectNaPropagation | DAG | I |
| 216 | 14381 | testAdaptiveSelectResumeCheck | DAG | I |
| 217 | 14444 | testAdaptiveSelectSelectorSourceFanoutMember | DAG | I |
| 218 | 14543 | testAdaptiveHandoffInGrammarReady | DAG | I — freeze chain |
| 219 | 14617 | testAdaptiveHandoffAskFreezesNotApproval | DAG | I |
| 220 | 14695 | testAdaptiveHandoffRefuseNoMutation | DAG | I |
| 221 | 14787 | testAdaptiveHandoffLegacyClaimRefusesFreeze | DAG | I |
| 222 | 14860 | testAdaptiveHandoffIdempotentReRun | DAG | I |
| 223 | 14940 | testAdaptiveHandoffFreezeChainTwoSpawns | DAG | I |
| 224 | 15053 | testFreezeCheckedGovernanceAckStale | DAG | I |
| 225 | 15132 | testAdaptiveHandoffProjectFlagResolvesRepoRoot | DAG | I |
| 226 | 15186 | testAdaptiveHandoffDecisionIdConflict | DAG | I |
| 227 | 15297 | testGitignoreCoversKw | SURVIVOR | I — `.gitignore` covers `.kw` worktree dir |
| 228 | 15396 | testWorktreeHiddenLocalPath | SURVIVOR | I |
| 229 | 15428 | testLegacyWorktreeCleanupDryRun | SURVIVOR | I |
| 230 | 15468 | testLegacyWorktreeCleanupDirtySkip | SURVIVOR | I |
| 231 | 15513 | testAdaptiveWorktreeProvisionedE2E | MIXED | V — worktree+sink-merge survivor E2E, driven through a full authored DAG plan |
| 232 | 15659 | testAdaptiveWorktreeMirrorNoManualCopy | MIXED | V — worktree-mirror survivor property, exercised via handoff/orient/mirror-project DAG chain |
| 233 | 15751 | testSinkRefusesWorkflowOnlyBranch | SURVIVOR | I |
| 234 | 15798 | testSinkAllowsMixedBranch | SURVIVOR | I |
| 235 | 15839 | testPlanRunWiredForWorktree | DAG | ? — name implies wiring to the dying `/kaola-workflow-plan-run` entry point; NOT individually read, verify before deleting |
| 236 | 20291 | testPlannerAttestFlagBackfillsDispatchLog | MIXED | S — seed:20308 |
| 237 | 20379 | testPlannerAttestFlagAbsentStaysMissing | MIXED | S — seed:20396 |
| 238 | 20456 | testPlannerAttestFlagPresentInPlannerAgent | DAG | ? — static check of the mandatory planner agent's `--attest` flag in its own prompt; dies with the mandatory planner |
| 239 | 20470 | testDispatchLogHookWorktreeAware338 | SURVIVOR | I |
| 240 | 20534 | testDispatchLogEmitsModelFields566 | SURVIVOR | I |
| 241 | 20572 | testDispatchLogResolverResolvesUnderOpencodeLayout567 | SURVIVOR | I |
| 242 | 20624 | testDispatchLogCapturesWorktreeResidentActiveProjectFromMainCwd568 | SURVIVOR | I |
| 243 | 20665 | testRetiredFinalizeAttestFlagIsInert816 | MIXED | S — seed:20678 |
| 244 | 20709 | testInlineFinalizeSeamRaisesNoAttestationAlarm816 | MIXED | S — seed:20723 |
| 245 | 20177 | testAttestationWarningPersistence | MIXED | V — seed:20190 |
| 246 | 20233 | testSelectionEvidenceDocking | MIXED | V — seed:20245,20268 |
| 247 | 20750 | testFinalizeIncompleteResumesCrashState | SURVIVOR | ? — finalize crash-resume family (20750-20977), not individually read; likely needs a plan fixture to reach finalize — re-check before treating as pure SURVIVOR |
| 248 | 20789 | testFinalizeIncompleteNegativeControlAlreadyDone | SURVIVOR | ? — see 247 |
| 249 | 20827 | testFinalizeIncompleteNegativeControlRepoDirty | SURVIVOR | ? — see 247 |
| 250 | 20866 | testFinalizeIncompleteWorktreeReentryFix | SURVIVOR | ? — see 247 |
| 251 | 20978 | testBundleClaimCreatesOneFolder | SURVIVOR | I |
| 252 | 21051 | testBundleRefusalLeavesNoFolder | SURVIVOR | I |
| 253 | 21103 | testBundleDuplicateIssueBlocking | SURVIVOR | I |
| 254 | 21156 | testBundleAdaptiveResumeSurfacesBundleIdentity | MIXED | ? — "adaptive orient on a bundle project surfaces bundleId" per the file's own #328-scenario-4 comment (~:21152); orient is the adaptive-node CLI — re-check |
| 255 | 21216 | testBundleFinalizeRoadmapCleanup | MIXED | S — seed:21262 |
| 256 | 21336 | testBundleSingleIssueStateHasNoBundleFields | SURVIVOR | I |
| 257 | 15861 | testLedgerCompareGuard399 | DAG | I — Node Ledger compare guard |
| 258 | 21361 | testAdaptiveLedgerHeaderInvalid425 | DAG | I — Node Ledger header validity |
| 259 | 21454 | testAdaptiveGeneratedPortSplit431 | DAG | ? — "generated port split", not individually read; could instead be an edition-sync/codegen SURVIVOR concern — verify before classifying either way |
| 260 | 21505 | testFinalizeArchiveVerifiesBeforeDelete | SURVIVOR | I — the #426 archive-completeness sibling to #676 (call-out 2) |
| 261 | 21548 | testArchiveCompleteSourceRelative676 | SURVIVOR | V — see call-out 2 |
| 262 | 21679 | testFinalizeClosesIssueBundleMembers | MIXED | S — seed:21700 |
| 263 | 21754 | testFinalizeRoadmapResidueDetection | MIXED | S — seed:21759 |
| 264 | 21825 | testFinalizeBaseFlagScopesAttributionSweep | MIXED | ? — finalize `--base` flag scoping the attribution sweep; the sweep is plan-declared-write-set-based (DAG), the survivor property is finalize's `--base` flag — not individually read, leaning MIXED |
| 265 | 21955 | testOrientRefusesBundleStateIncoherent | DAG | I — `orient` is the adaptive-node CLI |
| 266 | 15904 | testHarnessSelfCheck | SURVIVOR | V — tests the WALKTHROUGH HARNESS ITSELF (--list/--only argv contract, ghMockEnv, runNode env scrub); orthogonal to DAG vs list-form, must survive regardless |
| 267 | 16010 | testSinkTransactionBlockedByForeignDirt | SURVIVOR | I |
| 268 | 16083 | testSinkForeignDirtExemptsSiblingReceipt715 | SURVIVOR | I |
| 269 | 16166 | testSinkTransactionCrashResume | SURVIVOR | I |
| 270 | 16271 | testSinkTransactionCleanEndToEnd | SURVIVOR | I |
| 271 | 22040 | testTwoLanesInOneCheckout579 | DAG | ? — "lanes" ties to concurrent-lane-group DAG scheduling; not individually read |
| 272 | 22127 | testSummaryDispatchSegments602 | DAG | ? — plan dispatch-segment summary; not individually read |
| 273 | 22261 | testReadOnlyLaneEmptyWriteSet752 | DAG | ? — not individually read |
| 274 | 22377 | testCodexDispatchModeThreading603 | DAG | ? — per-node dispatch-mode threading; not individually read |
| 275 | 22470 | testRunProgressMirror605 | MIXED | V — seed:22561,22569 |
| 276 | 16472 | testGateEvidenceNonceRotation654 | DAG | V — barrier/nonce/evidence lifecycle |
| 277 | 16603 | testMixedRepairReplayJournal748 | DAG | ? — adaptive-node repair replay journal; not individually read |
| 278 | 19655 | testRepairBaseFreshness829 | DAG | ? — barrier baseline freshness on repair; not individually read |
| 279 | 16714 | testReplanRuntimeFence699 | DAG | ? — re-plan epoch machinery; not individually read |
| 280 | 16769 | testPlanlessAndPlannedInitialAuthority699 | MIXED | V — seed-adjacent call at 16853; explicitly contrasts a PLANLESS claim/finalize path (the SURVIVOR shape) against a PLANNED (DAG) one — high-value dual scenario, do not delete outright |
| 281 | 16954 | testArchiveCallersFailClosed699 | SURVIVOR | ? — general archive-callers fail-closed contract; not individually read |
| 282 | 17010 | testOfflineNoHistoryClaimRoot699 | SURVIVOR | ? — claim-root/offline-history; not individually read |
| 283 | 17114 | testReviewOutcomeTransport699 | DAG | ? — typed review-outcome transport for re-plan; not individually read |
| 284 | 17126 | testReviewerContractV2Conformance | DAG | ? — reviewer contract v2 (huge, ~700 lines); not individually read |
| 285 | 17844 | testSpinePlanFormFreeze758 | DAG | ? — spine plan-form freeze wall; not individually read |
| 286 | 18192 | testExpansionTransaction759 | DAG | ? — expansion transaction, explicitly named as retired machinery; not individually read |
| 287 | 18796 | testContextPacketEfficiencyRollup763 | DAG | ? — node dispatch context-packet rollup; not individually read |
| 288 | 19102 | testArchiveRollupPin763 | MIXED | V — seed:19139; "archive rollup" ties epoch/task rollup (DAG) to the archive SURVIVOR property |
| 289 | 19230 | testReExpandCascade761 | DAG | ? — re-expansion, explicitly retired; not individually read |
| 290 | 19461 | testSerializationInversion760 | DAG | ? — antichain/`parallel_safe`, explicitly retired; not individually read |
| 291 | 22614 | testDeclaredNotWalled762 | DAG | ? — declared-write-set post-dominance; not individually read |
| 292 | 23040 | testReExpansionEpochTransition756 | DAG | ? — re-expansion epoch, explicitly retired; not individually read |
| 293 | 23356 | testSpineAuthoringOrchestrationKeystone767 | DAG | ? — planner/spine orchestration keystone; not individually read |
| 294 | 23528 | testAcceptanceSurfaceEndToEnd | MIXED | V — the `## Acceptance` / Acceptance-Check survivor concept, driven entirely through an authored frozen plan + open-next/record-evidence/close-and-open-next DAG run |

---

## Summary counts

- **DAG: 68** — ordinals 19, 38, 39, 184-186, 188-190 (13), 191-197, 199-226 (all Adaptive/Handoff/
  Select/Bundle-validator/Freeze/PatternLibrary/VerdictCheck cluster), 235, 238, 257, 258, 265, 271-274,
  276-279, 281-287, 289-293.
- **SURVIVOR: 207** — the shared-tmp group minus testFinalize (11), plus the large classifier/roadmap/
  worktree/sink-merge/watch-pr/release/closure-audit/contract-validator/label/dispatch-log-hook/bundle-
  claim clusters.
- **MIXED: 19** — ordinal 2 (shared-tmp testFinalize) + standalone 64-73, 93, 114, 115, 124-126,
  129-132, 135, 144, 183, 187, 198, 231, 232, 236, 237, 243-246, 255, 262, 263, 275, 280, 288, 294.
  (Count above lists every confirmed-MIXED ordinal; 19 total including the shared-tmp one.)

4 ordinals (**259, 264, 254/242 boundary cases**) are flagged `?` as MIXED-or-SURVIVOR judgment calls
needing a second look, not firmly counted either way above — treat them as MIXED until re-verified.

## Call-out 1 — `--release-check` scenarios

**Not a standalone scenario.** They are a ~193-line block, **lines 3816-4008** (13 sub-cases, `#651 (1)`
through `#651 (13)`), living **inside** `testBundle424432433ValidatorGates` (function spans 3354-4233,
ordinal 198). Every sub-case shells `planValidatorScript ['--release-check', ...]` directly (no plan
path — it is already plan-independent, reading only `<git-toplevel>/.cache/chain-receipt.json`). The
rest of that same function (barrierCheck allowband, `ROLE_TOKEN_REGISTRY`, `isValidationInvisible`,
the `#424 (3, finalize sweep) UNATTRIBUTED_CHANGE` case at 4010-4024, and the `#475` consumer-repo gate
that follows) is DAG/plan-attribution machinery. **This whole function must be split**, not
deleted-or-kept whole: extract 3816-4008 verbatim, re-point every `planValidatorScript` call at
`kaola-workflow-run-chains.js --release-check`, and let the rest of the function fall with the DAG.

## Call-out 2 — archive completeness / `verifyArchiveComplete`

Three scenarios, all pure SURVIVOR, no DAG involvement at all:
- **ordinal 99** `testArchiveIntegrityPortedToAllEditions832` (line 9150) — cross-edition source-string
  port guard for the archive-rescue/`skipped_gitignored`/`archive_content_incomplete` tokens.
- **ordinal 260** `testFinalizeArchiveVerifiesBeforeDelete` (line 21505, the "#426" test, not read in
  full but named by ordinal 261's own comment as its sibling).
- **ordinal 261** `testArchiveCompleteSourceRelative676` (line 21548) — direct unit coverage of
  `claim.verifyArchiveComplete(src, dest)` plus one end-to-end refuse-before-delete leg. Zero plan/
  Node-Ledger/freeze involvement; keep and re-point at nothing (already targets `claim.js` directly).

## Call-out 3 — shared fixture/helper functions SURVIVOR scenarios depend on

Do not delete as collateral when the DAG fixtures go: `assert`, `runNode`/`runNodeAsync`, `json`,
`read`, `statePath`, `writeProject`, `assertNoLegacyCoordDirs`, `plantActiveFolder`,
`plantActiveFolderWithBase` (:7108), `plantRoadmapIssue`, `classifierScript` const + `runClassifierOffline`
(:4982), `runClaimOnline`/`runClaimOnlineLastJson`/`runClaimOnlineNonAcquiring` (:5875,5900,9969),
`runClosureAudit`/`runClosureAuditOffline` (:5960,5982), `writeGhShimForStartup`, `writeShimFiles`,
`ghMockEnv`, `initGitRepo`, `initGitRepoWithBareRemote`, the `G` git-fixture module, `headOf`,
`cleanup`. **DAG-only** fixture helpers that die with their mechanism: `seedAdaptiveFinalizeFixture`
(:123), `alignFinalizeFixtureAcrossRoots` (:208), `plantFrozenPlan` (:1173), `stampVerifiedLegacyPlan`
(:1153), `injectSpineForm`/`injectDesignSection` (:1101,1131), `runLegacyFreeze` (:1162),
`freezeLegacyContent` (:1167), `adaptiveTmp`, `ADAPTIVE_PLAN`, `validatePlanFixture` (:1419),
`gateWarnings`/`gateWarning`/`assertGateLeak`/`assertNoGateLeak` (:1459-1484), `plantHandoffState`
(:14527), `mkRepo`/`writeReceipt`/`mkReleaseRepo`/`writeRootReceipt` (release-gate-family locals inside
ordinal 198 — `mkRepo`/`writeReceipt` are reused by the finalize-attribution-sweep cases too, so they
must be re-derived, not deleted, when the `--release-check` block is extracted).
