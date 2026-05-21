# TDD Task GT-1: Gitea Claim Script

## Result: COMPLETE (RED as expected)

File modified: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`

## Changes Made

1. Inserted `readPriorityConfig(root)` and `priorityTier(issue, topTierLabels)` immediately above `listOpenIssues` (at line 268).
2. Replaced `function listOpenIssues()` with `function listOpenIssues(root)` with priority sort; kept `state: 'open'` (Gitea-specific), `.filter`, `issue_iid || number` tiebreaker; omitted OFFLINE guard and labelName.
3. Added `readPriorityConfig,` to module.exports at line 733.
4. No imports added — fs and path already present at lines 4-5.

## RED Evidence

`node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` exits code 1:
```
AssertionError: Expected [] to deeply equal [7, 9]
```
Same expected failure as GL-1. GT-2 will fix.

## GREEN Evidence
N/A — GT-2 produces GREEN.

## Deviations
None.
