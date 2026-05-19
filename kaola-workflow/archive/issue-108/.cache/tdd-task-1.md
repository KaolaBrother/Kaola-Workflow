# TDD Task 1+2 — Write Failing Tests

## Files Modified
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` (worktree path)

## Task 1 (Block 2b) RED Evidence
```
AssertionError [ERR_ASSERTION]: updated should be false
true !== false
    at Object.<anonymous> (.../test-gitlab-sinks.js:310:12)
```
Diagnosis: cmdSinkFallback only checks !fs.existsSync(projectDir(...)) — live dir present → passes through → returns {updated:true}.

## Task 2 (Block 5) RED Evidence
```
AssertionError [ERR_ASSERTION]: exit-3-archived test: live dir must not be recreated
    at Object.<anonymous> (.../test-gitlab-sinks.js:474:3)
```
Diagnosis: postMergeCleanup writes sink-fallback.json unconditionally, recreating the live .cache/ dir.

## Pre-existing Tests (PASS baseline)
```
branch name security validation test passed
classifyMergeError unit tests passed
exit-2 subprocess test passed
exit-3 subprocess test passed
success-path subprocess test passed
GitLab sink tests passed
```
Exit 0 before new tests.

## Git Policy
No commits created.
