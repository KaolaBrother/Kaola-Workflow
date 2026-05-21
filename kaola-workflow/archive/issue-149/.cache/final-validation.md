# Final Validation — Issue 149

**Date:** 2026-05-21
**Exit code:** 0
**Verdict:** PASS

## Last 50 Lines of Output

```
> kaola-workflow@3.12.0 test
> npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea

> kaola-workflow@3.12.0 test:kaola-workflow:claude
> node scripts/validate-script-sync.js && node scripts/validate-vendored-agents.js && bash -n install.sh uninstall.sh && node -e "JSON.parse(require('fs').readFileSync('package.json', 'utf8'))" && node scripts/test-agent-model-resolver.js && node scripts/test-install-model-rendering.js && node scripts/validate-workflow-contracts.js && node scripts/simulate-workflow-walkthrough.js

OK: 9 common scripts in sync.
Vendored agent validation passed for 9 agents at 922d2d8f8b64f4e50936e24465cb3bcac81ac0e1
Agent model resolver tests passed
Install model rendering tests passed
Workflow contract validation passed
testStaleWorktreeCheck: PASSED
testReadPriorityConfig: PASSED
testE2EGitHubMergeFullChain: PASSED
testSinkMergeRefusesLiveFolder: PASSED
testSinkMergeBlocksUnpushedCommits: PASSED
testSinkMergeOfflineSkipsPublishGuard: PASSED
testFastE2EMergeFullChain: PASSED
testE2EGitHubPrFullChain: PASSED
testParallelIssueIndependence: PASSED
Workflow walkthrough simulation passed

> kaola-workflow@3.12.0 test:kaola-workflow:codex
> node scripts/validate-script-sync.js && node scripts/validate-kaola-workflow-contracts.js && node plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js

OK: 9 common scripts in sync.
Kaola-Workflow Codex contract validation passed
Kaola-Workflow walkthrough simulation passed

> kaola-workflow@3.12.0 test:kaola-workflow:gitlab
> node scripts/validate-vendored-agents.js && node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js && node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js && node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js

Vendored agent validation passed for 9 agents at 922d2d8f8b64f4e50936e24465cb3bcac81ac0e1
Kaola-Workflow GitLab contract validation passed
testFallbackGuardsAfterArchive: PASSED
GitLab workflow walkthrough simulation passed
GitLab Codex workflow walkthrough simulation passed

> kaola-workflow@3.12.0 test:kaola-workflow:gitea
> node scripts/validate-vendored-agents.js && node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js && node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js && node plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js

Vendored agent validation passed for 9 agents at 922d2d8f8b64f4e50936e24465cb3bcac81ac0e1
Kaola-Workflow Gitea contract validation passed
testFallbackGuardsAfterArchive: PASSED
Gitea workflow walkthrough simulation passed
Gitea Codex workflow walkthrough simulation passed
```

## Suite Results

| Suite | Result |
|---|---|
| test:kaola-workflow:claude | PASSED |
| test:kaola-workflow:codex | PASSED |
| test:kaola-workflow:gitlab | PASSED |
| test:kaola-workflow:gitea | PASSED |

## Notable Output

- No warnings.
- No skipped tests.
- All 9 vendored agents validated at commit `922d2d8f8b64f4e50936e24465cb3bcac81ac0e1`.
- All 9 workflow walkthrough simulation tests passed (Claude suite).
- `testFallbackGuardsAfterArchive` passed in both GitLab and Gitea suites.
