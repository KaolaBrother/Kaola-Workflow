# Review Fix 1 — issue-163

## Finding Addressed
HIGH: Missing failure-path test for `in-progress-label-removed` invariant.

## Fix Applied
Added `testFinalizeClaimLabelFailedTriggersInvariant()` to `scripts/simulate-workflow-walkthrough.js`.
- Gh shim exits 1 on `issue edit ... --remove-label`
- Asserts `result.claim_label_removed === 'failed'`
- Asserts `result.closure_invariants.ok === false`
- Asserts `result.closure_invariants.violations` contains entry with `id === 'in-progress-label-removed'`

Also fixed LOW #2 (dead `const root = getRoot()`) via Trivial Inline Edit Exception:
- Removed unused `const root = getRoot()` from `cmdAuditLabels` and `cmdRepairLabels`
- Re-synced Codex plugin: `cp scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- `node scripts/validate-script-sync.js` exits 0: "OK: 9 common scripts and 2 byte-identical file group in sync."

## Validation
`node scripts/simulate-workflow-walkthrough.js` exits 0.
`testFinalizeClaimLabelFailedTriggersInvariant: PASSED` in output.
All 6 new #163 tests PASSED.
