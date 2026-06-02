# tdd-task-2 — Gitea port fail-closed probe (model: sonnet)

Note: first attempt crashed (network socket error) BEFORE any edits — verified zero
Gitea changes on disk, re-dispatched fresh. Second attempt succeeded.

## Write set (respected — only these changed)
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-active-folders.js
- plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js

## Source diff (probeIssueState)
```diff
-    const state = issue.state === 'closed' ? 'closed' : 'open';
-    return { state, reason: 'ok' };
+    if (issue.state === 'closed') return { state: 'closed', reason: 'ok' };
+    if (issue.state === 'open') return { state: 'open', reason: 'ok' };
+    return { state: 'unavailable', reason: 'tea issue state unverified' };
```
OFFLINE guard + catch block unchanged. Symmetric to GitLab — differs only in param (`issueNumber`) and token (`tea`).

## Tests added
- Supplementary withForge block (`viewIssue → {state:'unknown'}`) → unavailable + `tea issue state unverified`, near probe blocks (~:444).
- testGiteaProbeResidualEmptyExit0 (shim `process.exit(0)`) → KAOLA_TEA_MOCK_SCRIPT → probeIssueState(42) → unavailable + reason.
- testGiteaProbeResidualNonJsonExit0 (shim writes `rate limit exceeded\n`) → probeIssueState(43) → same.
- Registered both named fns in bottom sequential block (before testGiteaRoadmapInitIssueExclusiveAndUpdate).

## RED evidence (pre-fix — non-vacuous)
```
RED testGiteaProbeResidualEmptyExit0: got open (ok)   (+ 'open' - 'unavailable')
RED testGiteaProbeResidualNonJsonExit0: got open (ok)
```
Both pre-fix show state='open' → shim drives the real pipeline (parseJson({})→normalizeIssue→'unknown'→old ternary→'open').

## GREEN evidence (orchestrator-verified)
`node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` → all PASS incl. 2 new; banner "Gitea workflow script tests passed".
`node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` → "Kaola-Workflow Gitea contract validation passed".
`git diff --name-only` → exactly 4 files (2 GitLab Task 1 + 2 Gitea Task 2), no out-of-scope changes.

## Deviations
None. No git commits created. Symmetry with GitLab confirmed.
