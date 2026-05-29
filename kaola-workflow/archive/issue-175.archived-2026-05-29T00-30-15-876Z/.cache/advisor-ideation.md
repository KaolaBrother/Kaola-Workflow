# Advisor Ideation Gate: issue-175

## Verdict
Option A confirmed. No missed approaches.

## Key Clarifications

### Blocking
Existing test (~line 819 GitLab, ~820 Gitea) asserts `verdict: 'green'` for the no-evidence case.
This wrong test must be REPLACED, not supplemented. Leaving it alongside a new target_unverified test
would create conflicting assertions for the same scenario.

### Confirm Two Call Sites
Both classifyIssue() AND cmdClassify() in each forge need the guard.
Use: grep -n "OFFLINE" plugins/kaola-workflow-{gitlab,gitea}/scripts/kaola-{gitlab,gitea}-workflow-classifier.js

### Test Harness Shape
New tests should use the same invocation pattern as the existing test at ~line 819/820
(subprocess vs. direct call). Don't introduce a new pattern.

### localRoadmapIssue()
Returns empty stub (not null) — use fs.existsSync(roadmapFile) guard verbatim from GitHub.
No re-checking needed.

## Selected Approach
Option A: Parallel Port
