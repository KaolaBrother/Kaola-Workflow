# Phase 5 - Review: issue-44

## Code Review Findings

### CRITICAL
none

### HIGH
- **Receipt overwrite on target_mismatch invalidates owned project authorization** — `writeStartupReceipt` was called on the mismatch path, overwriting the session's persisted receipt. Fix applied: emit refusal JSON to stdout only without persisting it.

### MEDIUM/LOW
- Dead function `runStartupClaimFirstAvailable` — removed.
- Non-numeric/negative `--target-issue` silently degrades to no_target — added `Number.isFinite && > 0` assertion in both `cmdStartup` and `cmdPickNext`.
- Wasted `fetchOpenIssueRecords` call in `cmdPickNext` on explicit-target path — removed; set `issue_sync: 'skipped'` inline.
- Inconsistent exit codes in `cmdPickNext` refusals — fixed; all refusal paths now set `process.exitCode = 1`.
- `target_occupied` project name reconstruction (LOW, no security risk) — accepted as-is; the classifier-path branches use `candidate.project` which is correct for the actionable path.
- TOCTOU comment (LOW security) — accepted; the O_EXCL lock guard is the real atomic boundary; adding prose comment would be noise.

## Security Review

Ran: yes — `scripts/kaola-workflow-claim.js` performs filesystem operations, subprocess spawning, and lock management.

### Findings
- MEDIUM: `--target-issue` accepted negative integers. Fixed with positive-integer assertion.
- LOW: TOCTOU window is mitigated by O_EXCL in `writeLockFile`. Accepted.
- LOW: `projectNameForIssue` reads filesystem before integer validation. Fixed indirectly by the positive-integer assertion.
- All `execFileSync` calls use explicit argument arrays — no shell injection risk.
- No hardcoded secrets, credentials, or debug statements.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-reviewer | invoked | .cache/code-reviewer.md | |
| security-reviewer | invoked | .cache/security-reviewer.md | security-sensitive file (filesystem, subprocess, locks) |
| review-fix executors | N/A | fixes applied inline per Trivial Inline Edit Exception | all fixes mechanical/one-line |
| advisor critical gate | N/A | no CRITICAL findings | |

## Fixes Applied

1. HIGH: Removed `writeStartupReceipt` call from `target_mismatch` path in `cmdStartup`; now emits refusal to stdout only.
2. MEDIUM: Added `assert(!args.targetIssue || (Number.isFinite(args.targetIssue) && args.targetIssue > 0), '--target-issue must be a positive integer')` in both `cmdStartup` and `cmdPickNext`.
3. MEDIUM: Removed dead `runStartupClaimFirstAvailable` function (6 lines).
4. MEDIUM: Replaced `fetchOpenIssueRecords(root)` with inline `issue_sync: 'skipped'` in `cmdPickNext` explicit-target path.
5. LOW: Added `process.exitCode = 1` to `target_mismatch`, `no_target`, and typed-refusal paths in `cmdPickNext`.

## Validation Evidence

- `node scripts/simulate-workflow-walkthrough.js` → **PASSED** (exit 0) after review fixes
- `node scripts/validate-kaola-workflow-contracts.js` → **PASSED** (exit 0)
- `node scripts/validate-script-sync.js` → **OK: 7 common scripts in sync.** (exit 0)

## Follow-Up Items

- LOW: Consider adding an upper-bound check on `--target-issue` (e.g., `> 1000000`). Not a security risk; deferred to a future cleanup.

## Review Status
PASSED
