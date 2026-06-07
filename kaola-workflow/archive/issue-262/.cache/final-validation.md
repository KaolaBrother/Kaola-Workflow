# Final Validation — issue-262

## Command
`npm test` (claude → codex → gitlab → gitea) from worktree on branch workflow/issue-262"

## Output (tail)
```
testSinkRefusesWorkflowOnlyBranch: PASSED
testSinkAllowsMixedBranch: PASSED
testPlanRunWiredForWorktree: PASSED
Workflow walkthrough simulation passed

> kaola-workflow@5.6.0 test:kaola-workflow:codex
> node scripts/validate-script-sync.js && node scripts/validate-kaola-workflow-contracts.js && node plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js

OK: 15 common scripts and 6 byte-identical file group in sync.
Kaola-Workflow Codex contract validation passed
Codex adaptive #238/#239 coverage: PASSED
Kaola-Workflow walkthrough simulation passed

> kaola-workflow@5.6.0 test:kaola-workflow:gitlab
> node scripts/validate-vendored-agents.js && node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js && node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js && node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js

Vendored agent validation passed for 13 agents at 922d2d8f8b64f4e50936e24465cb3bcac81ac0e1
Kaola-Workflow GitLab contract validation passed
testFallbackGuardsAfterArchive: PASSED
testAuditAndRepairLabels: PASSED
testRepairFastEscalation: PASSED
testGitlabAdaptive: PASSED
testGitlab237DotPathExtraction: PASSED
testGitlabDispatchHookExists: PASSED
GitLab workflow walkthrough simulation passed
GitLab Codex workflow walkthrough simulation passed

> kaola-workflow@5.6.0 test:kaola-workflow:gitea
> node scripts/validate-vendored-agents.js && node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js && node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js && node plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js

Vendored agent validation passed for 13 agents at 922d2d8f8b64f4e50936e24465cb3bcac81ac0e1
Kaola-Workflow Gitea contract validation passed
testFallbackGuardsAfterArchive: PASSED
testAuditAndRepairLabels: PASSED
testRepairFastEscalation: PASSED
testGiteaAdaptive: PASSED
testGitea237DotPathExtraction: PASSED
testGiteaDispatchHookExists: PASSED
Gitea workflow walkthrough simulation passed
Gitea Codex workflow walkthrough simulation passed
```

## Result
npm test exit code: 0
