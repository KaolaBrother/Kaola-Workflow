# TDD Task C4 — Validator hardening (dispatch-route + parity checks)

## Files Modified

- `scripts/validate-workflow-contracts.js`: replaced 3 bare-string checks with exact dispatcher strings; added plugin mirror parity block

## Changes

- Lines 323-325: `'pick-next'` → `"if (sub === 'pick-next')"` etc.
- Lines 326-336 (inserted): plugin mirror parity block checking 7 needles in both claim.js files

## GREEN Evidence

- `node scripts/validate-workflow-contracts.js` → `Workflow contract validation passed` (exit 0) after C4-A and after C4-B
- C4-A passed immediately — dispatcher strings present in claim.js after C3

## Deviations

None.
