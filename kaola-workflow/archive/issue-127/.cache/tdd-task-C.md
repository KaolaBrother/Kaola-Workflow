# TDD Task C — Gitea label removal + test

## Task
Add `workflow:in-progress` label removal at both close paths in Gitea sink-merge. Add test assertion.

## RED Evidence
Exit code 1, AssertionError: forge.updateIssueLabels should have been called.

## Changes Made
1. `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`:
   - Added `let updateIssueLabelsCalled = null;` before Test 6 withForge block
   - Added `updateIssueLabels` stub that captures args
   - Added 3 assertions verifying `issueNum === 71` and `opts.remove` contains `forge.CLAIM_LABEL`

2. `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js`:
   - Site 1: inside `closeLinkedIssue` after `forge.closeIssue(issueIid, options)`: `try { forge.updateIssueLabels(projectInfo, issueIid, { remove: [forge.CLAIM_LABEL] }); } catch (_) {}`
   - Site 2: inside Step 8 block after `forge.closeIssue(args.issue)`: `try { forge.updateIssueLabels(readProjectInfo(root, args.project), args.issue, { remove: [forge.CLAIM_LABEL] }); } catch (_) {}`

## GREEN Evidence
Exit 0 — all tests pass including 20 existing tests. Walkthrough simulation also exits 0 with no regressions.
