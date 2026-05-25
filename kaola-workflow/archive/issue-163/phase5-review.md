# Phase 5 - Review: issue-163

## Code Review Findings

### CRITICAL
none

### HIGH
1. **Missing failure-path test for `in-progress-label-removed` invariant** — No test drove `clearAdvisoryClaim` to return `'failed'` and asserted `closure_invariants.ok === false`. Fixed by adding `testFinalizeClaimLabelFailedTriggersInvariant()`.

### MEDIUM/LOW
2. (LOW) Dead `const root = getRoot()` in `cmdAuditLabels` and `cmdRepairLabels` — removed via Trivial Inline Edit Exception; Codex plugin re-synced.
3. (LOW) `already_absent` defined in schema but never produced — intentional; deferred to future probe-first optimization (documented in planner.md and phase1-research.md). No action needed.

## Security Review
Ran: no — no auth/payments/user-data/secrets/filesystem paths from user input touched. The `gh` CLI is existing usage throughout the codebase. All `ghExec` calls use fixed string arrays (no injection surface). External input (issue list JSON from gh) is parsed via `JSON.parse` and only `it.number` is used as `String(it.number)` in subsequent commands — numeric coercion prevents injection.

### Findings
N/A

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-reviewer | invoked | .cache/code-reviewer.md | |
| security-reviewer | N/A | .cache/code-reviewer.md file-risk scan: no auth/payments/user-data/secrets | no security-sensitive files touched |
| review-fix executors | invoked | .cache/review-fix-1.md | |
| advisor critical gate | N/A | no CRITICAL findings | |

## Fixes Applied
1. Added `testFinalizeClaimLabelFailedTriggersInvariant()` — failure-path test for `in-progress-label-removed` invariant (HIGH finding)
2. Removed dead `const root = getRoot()` from `cmdAuditLabels` and `cmdRepairLabels` (LOW #2, Trivial Inline Edit Exception)
3. Re-synced Codex plugin byte-identical copy

## Validation Evidence
- `node scripts/simulate-workflow-walkthrough.js` exits 0 after review fixes
- All 6 new #163 tests PASSED: `testFinalizeRemovesClaimLabel`, `testFinalizeNullFolderFallbackReadsArchive`, `testFinalizeOfflineSkipsLabelInvariant`, `testWatchPrEmitsClaimLabelReceipt`, `testAuditAndRepairLabels`, `testFinalizeClaimLabelFailedTriggersInvariant`
- `node scripts/validate-script-sync.js` exits 0: "OK: 9 common scripts and 2 byte-identical file group in sync."

## Follow-Up Items
- (LOW) `already_absent` receipt value is in schema and acceptance check but never produced by any forge implementation. Deferred to future work (probe-first `gh issue view` check before removal). Not blocking.

## Review Status
PASSED
