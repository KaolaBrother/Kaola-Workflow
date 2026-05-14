# TDD Task 4: MODIFY validate-workflow-contracts.js

## Status: COMPLETE

## Files Modified
- `scripts/validate-workflow-contracts.js`

## Changes
- Line 151: cap raised 220→235
- Added `assert(exists('scripts/kaola-workflow-classifier.js'), ...)`
- Added `assertIncludes('install.sh', 'kaola-workflow-classifier.js')`
- Added `assertIncludes('commands/workflow-next.md', 'kaola-workflow-classifier.js')`
- Added `assertIncludes('commands/workflow-next.md', 'Sweep, Classify, And Claim')`
- Added `assertIncludes('commands/workflow-next.md', 'Parallel decision:')`

## Validation Output
`Workflow contract validation passed`

## Deviations
None.
