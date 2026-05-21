# TDD Task GL-1: GitLab Claim Script

## Result: COMPLETE (RED as expected)

File modified: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`

## Changes Made

1. Inserted `readPriorityConfig(root)` and `priorityTier(issue, topTierLabels)` immediately above `listOpenIssues` (at line 265).
2. Replaced `function listOpenIssues()` with `function listOpenIssues(root)` with priority sort; kept `state: 'opened'`, `.filter`, `issue_iid || number` tiebreaker; omitted OFFLINE guard and labelName.
3. Added `readPriorityConfig,` to module.exports at line 748.

## RED Evidence

`node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` exits code 1:
```
AssertionError: Expected [] to deeply equal [7, 9]
```
The existing test calls `claim.listOpenIssues()` with no args. `readPriorityConfig(undefined)` throws (path.join), caught by outer try/catch, returns []. Expected RED. GL-2 will fix.

## GREEN Evidence
N/A — GL-2 produces GREEN.

## Deviations
None.
