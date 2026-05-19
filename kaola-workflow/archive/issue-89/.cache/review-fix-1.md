# Review Fix 1 — Branch name security validation (issue-89)

## Finding
HIGH: `args.branch` missing leading-hyphen guard in `runDirectMerge`.

## Files Modified
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` — extended branch assert to block leading hyphens, null bytes, `.`, `..`
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` — added security test block for `--orphan` rejection

## RED Evidence
AssertionError: branch `--orphan` was only stopped by `finalValidationPassed` check, not the branch guard.

## GREEN Evidence
`node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` exits 0:
```
branch name security validation test passed
classifyMergeError unit tests passed
exit-2 subprocess test passed
exit-3 subprocess test passed
success-path subprocess test passed
GitLab sink tests passed
```
