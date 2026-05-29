# TDD Task 1 — Patch 3 env objects in testAuditAndRepairLabels

## Files Modified
`plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js`

## Edit Applied
`replace_all: true` on:
```
old: env: Object.assign({}, process.env, { KAOLA_GLAB_MOCK_SCRIPT: mockScript })
new: env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_GLAB_MOCK_SCRIPT: mockScript })
```
Exactly 3 occurrences replaced (lines 111, 123, 137 — sub-cases A/B/C).

## RED Evidence (pre-fix)
Command: `KAOLA_WORKFLOW_OFFLINE=1 node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js`
Exit: 1
Output:
```
testFallbackGuardsAfterArchive: PASSED
AssertionError [ERR_ASSERTION]: audit-labels must return stale.length===1, got: []
0 !== 1
```

## GREEN Evidence (post-fix)
Command: `KAOLA_WORKFLOW_OFFLINE=1 node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js`
Exit: 0
Output:
```
testFallbackGuardsAfterArchive: PASSED
testAuditAndRepairLabels: PASSED
GitLab workflow walkthrough simulation passed
```

## Deviations
None. Strictly confined to the 3 env object literals in `testAuditAndRepairLabels`.
