# TDD Task 1 — Classifier Gaps 1-3

## Status: COMPLETE

## Modified Files
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js`
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` (appended)

## RED Evidence
```
AssertionError [ERR_ASSERTION]: readOrCreateConfig should create config.json on first run
    at Object.<anonymous> (test-gitlab-workflow-scripts.js:466:5)
exit 1
```

## GREEN Evidence
```
GitLab workflow script tests passed
exit 0
```

## Walkthrough regression
```
Workflow walkthrough simulation passed
exit 0
```

## Key Changes
- `const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1'` at module top (line 10)
- `field()` and `readOrCreateConfig()` helpers added (CONFIG_PATH computed inside function)
- `checkDependsOn()` updated with OFFLINE short-circuit
- `issueHasWorkflowInProgressLabel()` and `issueHasRemoteClaimNotes()` added
- `cmdClassify()` rewritten: parallel_mode bypass → owned check → OFFLINE branch → online branch with remote claim guard
- `module.exports` updated with new exports
- Test file: `classifierScript` constant added at line 19; 8 test blocks appended before line 451
