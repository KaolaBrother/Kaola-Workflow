# tdd-task-4 — validate-workflow-contracts.js: routed-fix assertions

## Files Modified
- scripts/validate-workflow-contracts.js

## Change
Added 9-file routedFixFiles array and two assertion loops after the existing phaseCommands loop (after line 76):
- 9 files × 2 assertions (BUILD_ERROR_RESOLVER_MODEL + subagent_type="build-error-resolver") = 18 calls
- 6 phase5/6 files × 1 assertion (TDD_GUIDE_MODEL) = 6 calls
Total: 24 new assertion calls

## RED Evidence
N/A — assertions added after Wave 1 edits were already in place; confirmed passing immediately.

## GREEN Evidence
node scripts/validate-workflow-contracts.js → "Workflow contract validation passed"

## Deviations
None.
