# Code Review — issue-155

## Findings

### [HIGH] GitHub `claimProject` reorders probe before the owned-folder check

**Files:** `scripts/kaola-workflow-claim.js:327-337`, `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (byte-identical)

**Issue:** The new `probeIssueState` block was placed where the old `issueIsClosed` block was — BEFORE the `existing` (active-folder) check. GitLab and Gitea moved the probe AFTER the `existing` check. Three forges now diverge.

**Failure scenario (GitHub only):** Re-running startup for an issue with an existing local folder while remote is unreachable:
1. Classifier detects owned folder, exits 2 → `classifyIssue` returns `{ verdict: 'owned' }`
2. `claimExplicitTarget` only short-circuits on blocked/red/target_unavailable; `owned` falls through to `claimProject`
3. GitHub `claimProject` runs probe FIRST → remote down → `target_unavailable`, exit 1
4. GitLab/Gitea: `existing` check runs first → returns `owned` exit 0

**Pre-fix behavior:** `issueIsClosed` failed open (returned false on error), so owned + remote-down returned `owned`. New ordering introduces a resume regression for GitHub.

**Test coverage gap:** Both new e2e tests stop at the classifier subprocess path; they never reach the `claimProject` probe block, so this regression and inter-forge divergence are uncovered.

**Fix:** Reorder GitHub `claimProject` to match GitLab/Gitea: `existing` check first, then probe block. Add test covering `claimProject` directly with owned folder + failing remote.

---

### [LOW] GitLab `probeIssueState` lacks explicit OFFLINE early-return

**File:** `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-active-folders.js`

GitHub and Gitea guard `if (OFFLINE || issueNumber == null)`. GitLab only guards null, relying on `glabExec` OFFLINE short-circuit. Works but is forge-inconsistent.

---

## Verified Clean

- OFFLINE early-returns preserved in all classifiers
- `e.status === 2 → owned` branch unchanged
- `claimExplicitTarget` sibling placed BEFORE `claimProject` call in all three forges
- `probeIssueState` imported in each `claim.js` destructure
- `probeIssueState` returns correct 3-state result
- `issueIsClosed` left untouched
- Classifier catch blocks all flipped to `target_unavailable`
- GitHub plugin copies byte-identical
- Exit-code mapping correct
- No debug statements, no commented-out code
- All functions under 50 lines, no file near 800-line limit
- Docs and CHANGELOG accurate
- Scope clean

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0     |
| HIGH     | 1     |
| MEDIUM   | 0     |
| LOW      | 1     |
