# Code Review: issue-150 — Priority-label sorting for GitLab and Gitea listOpenIssues

## Verdict: APPROVE

0 CRITICAL, 0 HIGH, 0 MEDIUM, 1 LOW

## Verification Performed

- Parity with GitHub reference (`scripts/kaola-workflow-claim.js:65-102`) confirmed
- Intentional omissions (no `.map(labelName)`, no OFFLINE guard, per-forge state values, `priorityTier` not exported) verified correct
- Caller safety: repo-wide grep confirms no production callers of `listOpenIssues` — only definition, exports, and tests
- Tests pass: 4 new tests PASS in both suites
- Discriminating test verified non-trivial: `[3,5,1,9]` differs from `[1,3,5,9]`
- Pre-existing failure confirmed out of scope: `testStaleWorktreeCheck` SIGTERM at line 1303/1298 from issue #148

## Findings

### CRITICAL
None.

### HIGH
None.

### MEDIUM
None.

### LOW

**[LOW] GitLab test leaks an empty temp directory; inconsistent with Gitea port**
File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js:334`

The existing-call fix inlines `tempRoot('kw-gl-list-')` directly into the assertion with no cleanup:
```js
assert.deepStrictEqual(claim.listOpenIssues(tempRoot('kw-gl-list-')).map(issue => issue.issue_iid), [7, 9]);
```
`tempRoot()` physically creates a directory. Each test run leaks one empty dir. The Gitea port (line 339-345) correctly wraps in `try/finally` with `fs.rmSync`. Impact is negligible; optional fix for parity. Does not block merge.

## Notes (not findings)

- `priority_label` returned by `priorityTier` but only `.tier` consumed — faithful to GitHub reference
- Test files are 1312/1307 lines (over 800 guideline) but pre-existing baseline; test files are documented exception

## Review Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | 0 |
| LOW | 1 |

Status: APPROVED
