# tdd-task-1 — GitLab port fail-closed probe (model: sonnet)

## Write set (respected — only these changed)
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-active-folders.js
- plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js

## Source diff (probeIssueState)
```diff
-    return { state: issue.state === 'closed' ? 'closed' : 'open', reason: 'ok' };
+    if (issue.state === 'closed') return { state: 'closed', reason: 'ok' };
+    if (issue.state === 'open') return { state: 'open', reason: 'ok' };
+    return { state: 'unavailable', reason: 'glab issue state unverified' };
```
OFFLINE guard + catch block unchanged.

## Tests added
- Case 4 withForge block (`viewIssue → {state:'unknown'}`) → asserts unavailable + reason (supplementary branch proof), after probe Case 3 (~:441).
- testGitlabProbeResidualEmptyExit0 (shim `process.exit(0)`, empty stdout exit 0) → KAOLA_GLAB_MOCK_SCRIPT → in-process probeIssueState(42) → assert unavailable + `glab issue state unverified`.
- testGitlabProbeResidualNonJsonExit0 (shim writes `rate limit exceeded\n`, exit 0) → probeIssueState(43) → same asserts.
- Registered both named fns in bottom sequential block next to testGitlabProbeIssueStateOfflineGuard().

## RED evidence (pre-fix — non-vacuous)
```
testGitlabProbeResidualEmptyExit0 pre-fix result: state=open reason=ok   (RED confirmed)
testGitlabProbeResidualNonJsonExit0 pre-fix result: state=open reason=ok  (RED confirmed)
```
Pipeline non-vacuous: glabExec('')→''→parseJson→{}→normalizeIssue({}).state='unknown'→old ternary→'open'. Non-JSON same. (Pre-fix failure shows `open`, NOT `unavailable` → shim correctly drives the real pipeline.)

## GREEN evidence (orchestrator-verified)
`node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` → all tests PASS incl. the 3 new; banner "GitLab workflow script tests passed".
`node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` → "Kaola-Workflow GitLab contract validation passed" (reason string contract-safe).
`git diff --name-only` → only the 2 write-set files.

## Deviations
None. No git commits created.
