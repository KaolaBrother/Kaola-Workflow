# Code Review — issue-163

## Verdict: WARNING (1 HIGH finding, 2 LOW)

## HIGH Findings
1. **Missing failure-path test for `in-progress-label-removed` invariant** — No test drives `clearAdvisoryClaim` to return `'failed'` and asserts `closure_invariants.ok === false`. Failure scenario: gh shim exits non-zero on `--remove-label`. Recommend adding one test: shim throws on `--remove-label`, assert `claim_label_removed === 'failed'` and `closure_invariants.ok === false` with `in-progress-label-removed` in violations.

## LOW Findings
2. **Dead `const root = getRoot()` in `cmdAuditLabels` and `cmdRepairLabels`** — `root` assigned but never used. `getRoot()` has no side-effects. Safe to delete both lines.
3. **`already_absent` defined in schema but never produced** — Intentional: planner.md and phase1-research.md explicitly defer probe-first detection. Not a bug. The contract enum is preserved for future use (noted in docs).

## Compliance
| Requirement | Status | Evidence |
|-------------|--------|----------|
| code-reviewer | invoked | this file |
| security-reviewer | N/A | no auth/payments/user-data/secrets touched; gh CLI is existing usage |
