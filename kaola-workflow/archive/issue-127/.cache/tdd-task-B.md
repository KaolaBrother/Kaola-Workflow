# TDD Task B — GitLab label removal + test

## Task
Add `workflow:in-progress` label removal at both close paths in GitLab sink-merge. Add test assertion.

## RED Evidence
Exit code 1, AssertionError: forge.updateIssue should have been called at line 217.

## Changes Made
1. `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`:
   - Added `let updateIssueCalled = null;` before withForge block
   - Added `updateIssue` stub that captures args
   - Added 3 assertions verifying `issueIid === 71` and `opts.unlabels` contains `forge.CLAIM_LABEL`

2. `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`:
   - Site 1: inside `closeLinkedIssue` after `forge.closeIssue(issueIid)`: `try { forge.updateIssue(issueIid, { unlabels: [forge.CLAIM_LABEL] }); } catch (_) {}`
   - Site 2: inside Step 8 block after `forge.closeIssue(args.issue)`: `try { forge.updateIssue(args.issue, { unlabels: [forge.CLAIM_LABEL] }); } catch (_) {}`

## GREEN Evidence
Exit 0, "GitLab sink tests passed" — all sub-tests passing.
