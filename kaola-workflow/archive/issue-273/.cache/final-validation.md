# Final Validation — issue-273
Date: 2026-06-07

## Summary

| Command | Exit Code | Result |
|---------|-----------|--------|
| `node scripts/simulate-workflow-walkthrough.js` | 0 | PASSED |
| `npm test` | 0 | PASSED |

---

## Command 1: node scripts/simulate-workflow-walkthrough.js

Exit code: 0

### Output (last 100 lines — full output was ~115 lines)

```
testClassifierFastScopeOverlapRed: PASSED
testClassifierFastScopeDisjointGreen: PASSED
testClassifierDotPathOverlapRed: PASSED
testClassifierRootPathProseNoOverlap: PASSED
testClassifierDotAreaOverlapRed: PASSED
testClassifierCuratedRootOverlapYellow: PASSED
testClassifierCuratedRootProseClaimedYellow: PASSED
testClassifierCuratedRootProseNoOverlapGreen: PASSED
testClassifierCuratedRootStructuredLowercaseYellow: PASSED
testClassifierFastScopeSectionIsolationGreen: PASSED
testClassifierFastScopeFenceCommentRed: PASSED
testClassifierFastScopeFenceHeadingRed: PASSED
testClassifierFastScopeFenceMixedMarkerRed: PASSED
testClassifierFastScopeFenceInFencePathRed: PASSED
testClassifierFastScopePreSectionUnclosedFenceRed: PASSED
testClassifierDependsOnGate: PASSED
testStartupJsonAndHiddenLocalWorktrees: PASSED
testWorktreeAdaptiveProvisioned: PASSED
testFinalizeRoadmapCleanupFailureReceipt: PASSED
testWatchPrRoadmapCleanupWarning: PASSED
testStaleWorktreeCheck: PASSED
testStaleWorktreeCleanup: PASSED
testReadPriorityConfig: PASSED
testE2EGitHubMergeFullChain: PASSED
testSinkMergeRefusesLiveFolder: PASSED
testSinkMergeBlocksUnpushedCommits: PASSED
testSinkMergeOfflineSkipsPublishGuard: PASSED
testFastE2EMergeFullChain: PASSED
testE2EGitHubPrFullChain: PASSED
testParallelIssueIndependence: PASSED
testClassifierFailClosedOnRemoteError: PASSED
testClassifierOfflineUnverifiedNoLocalEvidence: PASSED
testClassifierOfflineVerifiedRoadmapAcquires: PASSED
testClassifierOfflineVerifiedOwnedFolderRoutes: PASSED
testClassifierOfflineUnverifiedWithUnrelatedActiveFolder: PASSED
testStartupExplicitTargetRedRefuses: PASSED
testClassifierTopLevelIssueFlag: PASSED
testClaimProjectOwnedFolderFailingRemote: PASSED
testFinalizeRemovesClaimLabel: PASSED
testFinalizeNullFolderFallbackReadsArchive: PASSED
testFinalizeOfflineSkipsLabelInvariant: PASSED
testWatchPrEmitsClaimLabelReceipt: PASSED
testAuditAndRepairLabels: PASSED
testFinalizeClaimLabelFailedTriggersInvariant: PASSED
testSinkMergeEmitsClosureReceipt: PASSED
testWatchPrMergedClosureReceipt: PASSED
testFinalizeOfflineClosureReceiptSkipped: PASSED
testSinkMergeMockabilityAndReceipt: PASSED
testSinkMergeCloseFailureWarning: PASSED
testSinkMergeSkipsArchivedProjectPhantom: PASSED
testClosureAuditOfflineRemoteClassesSkipped: PASSED
testClosureAuditClosedRemoteRoadmapSource: PASSED
testClosureAuditArchiveClosedDrift: PASSED
testClosureAuditDedupRoadmapAndArchive: PASSED
testClosureAuditArchiveOnlyNotProbed: PASSED
testClosureAuditMirrorListsClosedIssues: PASSED
testClosureAuditStaleInProgressLabels: PASSED
testClosureAuditActiveFolderForClosedIssueReportsDirty: PASSED
testClosureAuditUnarchivedPrFolderMerged: PASSED
testClosureAuditExecuteRepairsRoadmapAndLabels: PASSED
testClosureAuditExecuteNeverTouchesActiveFolders: PASSED
testClosureAuditDryRunNeverCallsRemoveLabel: PASSED
testClosureAuditStaleLabelsTimeout: PASSED
testClosureAuditUnresolvedClosedState: PASSED
testClosureAuditProbeFailureUnresolved: PASSED
testClosureAuditTimeoutEnvInvalidFallsBack: PASSED
testClosureAuditTimeoutEnvOverCapFallsBack: PASSED
testClosureAuditExecuteDetectionTimeoutPropagates: PASSED
testClosureAuditExecuteLabelRemovalTimeoutBreaks: PASSED
testClosureAuditExecuteLabelRemovalNonTimeoutFails: PASSED
testClosureAuditPrFolderTimeout: PASSED
testContractValidatorOfflineSkip: PASSED
testContractValidatorMissingTag: PASSED
testWatchPrAbandonedClosureInvariantsClean: PASSED
testClaimReclaimsStatelessOrphanDir: PASSED
testPatchBranchGuards: PASSED
testAdaptiveOffStartupRefusal: PASSED
testAdaptiveOffClaimRefusal: PASSED
testAdaptiveOffPreservesTwoWay: PASSED
testAdaptiveOnStartupAcquires: PASSED
testAdaptiveResumeFromFrozenPlan: PASSED
testAdaptiveResumeTamperedTypedRefusal: PASSED
testAdaptiveResumeUnparseableTypedRefusal: PASSED
testAdaptiveResumeAfterFlipOff: PASSED
testAdaptiveConsentHaltSurfaces: PASSED
testAdaptiveValidatorGovernance: PASSED
testAdaptiveFanoutGroupScoping: PASSED
testAdaptiveReadySetDisjointness: PASSED
testAdaptiveGateBarrierEnforcement: PASSED
testAdaptivePerInstanceBarrier: PASSED
testAdaptivePerInstanceBarrierHardening: PASSED
testAdaptiveResumeReconcilesNextCommand: PASSED
testAdaptiveDurableConsentHalt: PASSED
testAdaptiveAuthoringEntryGuard: PASSED
testAdaptiveTier2Composition: PASSED
testAdaptiveAuditFixes: PASSED
testAdaptiveResumeHashDeletedTypedRefusal: PASSED
testAdaptiveValidatorNodeCap: PASSED
testAdaptiveCheapWinFixes: PASSED
testAdaptiveAuditCoverage: PASSED
testAdaptiveVerdictCheck: PASSED
testAdaptivePatternLibrary: PASSED
testAdaptiveHandoffInGrammarReady: PASSED
testAdaptiveHandoffAskFreezesNotApproval: PASSED
testAdaptiveHandoffRefuseNoMutation: PASSED
testAdaptiveHandoffIdempotentReRun: PASSED
testAdaptiveHandoffProjectFlagResolvesRepoRoot: PASSED
testGitignoreCoversKw: PASSED
testWorktreeHiddenLocalPath: PASSED
testLegacyWorktreeCleanupDryRun: PASSED
testLegacyWorktreeCleanupDirtySkip: PASSED
testAdaptiveWorktreeProvisionedE2E: PASSED
testSinkRefusesWorkflowOnlyBranch: PASSED
testSinkAllowsMixedBranch: PASSED
testPlanRunWiredForWorktree: PASSED
Workflow walkthrough simulation passed
```

---

## Command 2: npm test

Exit code: 0

### Output (full — 171 lines)

```
> kaola-workflow@5.4.1 test
> npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea


> kaola-workflow@5.4.1 test:kaola-workflow:claude
> node scripts/validate-script-sync.js && node scripts/validate-vendored-agents.js && bash -n install.sh uninstall.sh && node -e "JSON.parse(require('fs').readFileSync('package.json', 'utf8'))" && node scripts/test-agent-model-resolver.js && node scripts/test-install-model-rendering.js && node scripts/test-install-upgrade-rewrite.js && node scripts/test-install-adaptive-config.js && node scripts/test-next-action.js && node scripts/test-commit-node.js && node scripts/test-adaptive-handoff.js && node scripts/test-release-surface-drift.js && node scripts/validate-workflow-contracts.js && node scripts/test-fast-audit.js && node scripts/simulate-workflow-walkthrough.js

OK: 14 common scripts and 5 byte-identical file group in sync.
Vendored agent validation passed for 13 agents at 922d2d8f8b64f4e50936e24465cb3bcac81ac0e1
Agent model resolver tests passed
Install model rendering tests passed
Install upgrade rewrite tests passed
Install adaptive-config tests passed
next-action tests passed (33 assertions)
commit-node tests passed (27 assertions)
adaptive-handoff tests passed (61 assertions)
Release-surface drift regression passed (4 assertions)
Workflow contract validation passed
Fast-audit regression passed (45 assertions)
[... 115 walkthrough tests all PASSED ...]
Workflow walkthrough simulation passed

> kaola-workflow@5.4.1 test:kaola-workflow:codex
> node scripts/validate-script-sync.js && node scripts/validate-kaola-workflow-contracts.js && node plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js

OK: 14 common scripts and 5 byte-identical file group in sync.
Kaola-Workflow Codex contract validation passed
Codex adaptive #238/#239 coverage: PASSED
Kaola-Workflow walkthrough simulation passed

> kaola-workflow@5.4.1 test:kaola-workflow:gitlab
> node scripts/validate-vendored-agents.js && node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js && node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js && node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js

Vendored agent validation passed for 13 agents at 922d2d8f8b64f4e50936e24465cb3bcac81ac0e1
Kaola-Workflow GitLab contract validation passed
testFallbackGuardsAfterArchive: PASSED
testAuditAndRepairLabels: PASSED
testRepairFastEscalation: PASSED
testGitlabAdaptive: PASSED
testGitlab237DotPathExtraction: PASSED
GitLab workflow walkthrough simulation passed
GitLab Codex workflow walkthrough simulation passed

> kaola-workflow@5.4.1 test:kaola-workflow:gitea
> node scripts/validate-vendored-agents.js && node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js && node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js && node plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js

Vendored agent validation passed for 13 agents at 922d2d8f8b64f4e50936e24465cb3bcac81ac0e1
Kaola-Workflow Gitea contract validation passed
testFallbackGuardsAfterArchive: PASSED
testAuditAndRepairLabels: PASSED
testRepairFastEscalation: PASSED
testGiteaAdaptive: PASSED
testGitea237DotPathExtraction: PASSED
Gitea workflow walkthrough simulation passed
Gitea Codex workflow walkthrough simulation passed
```
