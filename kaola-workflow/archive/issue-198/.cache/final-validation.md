# Final Validation — issue-198 (post-review-fixes)

Command: npm test
```

> kaola-workflow@3.16.3 test
> npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea


> kaola-workflow@3.16.3 test:kaola-workflow:claude
> node scripts/validate-script-sync.js && node scripts/validate-vendored-agents.js && bash -n install.sh uninstall.sh && node -e "JSON.parse(require('fs').readFileSync('package.json', 'utf8'))" && node scripts/test-agent-model-resolver.js && node scripts/test-install-model-rendering.js && node scripts/test-install-upgrade-rewrite.js && node scripts/test-release-surface-drift.js && node scripts/validate-workflow-contracts.js && node scripts/test-fast-audit.js && node scripts/simulate-workflow-walkthrough.js

OK: 11 common scripts and 2 byte-identical file group in sync.
Vendored agent validation passed for 9 agents at 922d2d8f8b64f4e50936e24465cb3bcac81ac0e1
Agent model resolver tests passed
Install model rendering tests passed
Install upgrade rewrite tests passed
Release-surface drift regression passed (4 assertions)
Workflow contract validation passed
Fast-audit regression passed (40 assertions)
testClassifierDependsOnGate: PASSED
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
testClosureAuditPrFolderTimeout: PASSED
testContractValidatorOfflineSkip: PASSED
testContractValidatorMissingTag: PASSED
Workflow walkthrough simulation passed

> kaola-workflow@3.16.3 test:kaola-workflow:codex
> node scripts/validate-script-sync.js && node scripts/validate-kaola-workflow-contracts.js && node plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js

OK: 11 common scripts and 2 byte-identical file group in sync.
Kaola-Workflow Codex contract validation passed
Kaola-Workflow walkthrough simulation passed

> kaola-workflow@3.16.3 test:kaola-workflow:gitlab
> node scripts/validate-vendored-agents.js && node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js && node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js && node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js

Vendored agent validation passed for 9 agents at 922d2d8f8b64f4e50936e24465cb3bcac81ac0e1
Kaola-Workflow GitLab contract validation passed
testFallbackGuardsAfterArchive: PASSED
testAuditAndRepairLabels: PASSED
GitLab workflow walkthrough simulation passed
GitLab Codex workflow walkthrough simulation passed

> kaola-workflow@3.16.3 test:kaola-workflow:gitea
> node scripts/validate-vendored-agents.js && node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js && node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js && node plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js

Vendored agent validation passed for 9 agents at 922d2d8f8b64f4e50936e24465cb3bcac81ac0e1
Kaola-Workflow Gitea contract validation passed
testFallbackGuardsAfterArchive: PASSED
testAuditAndRepairLabels: PASSED
Gitea workflow walkthrough simulation passed
Gitea Codex workflow walkthrough simulation passed
```
Exit: 0
