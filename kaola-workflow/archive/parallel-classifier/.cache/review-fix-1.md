# Review Fix 1: Split classify() function (HIGH-1)

## File
`scripts/kaola-workflow-classifier.js`

## Fix Applied
Extracted lock-scanning loop into `scanClaimedOverlap(candidateAreas, candidateAreaLabels, claimedLocks, root)`:
- `scanClaimedOverlap()`: 43 lines (lines 130-172)
- `classify()`: 40 lines (lines 189-228)
- Additional `checkDependsOn(depN)` helper: 14 lines (lines 174-187)
- `anyClaimedAtPhaseLeTwo` included in return value (needed by classify() red-conservative rule)

## Validation
- `node scripts/kaola-workflow-classifier.js 2>&1 | grep "usage:"`: PASS
- `node scripts/simulate-workflow-walkthrough.js`: PASS
- `node scripts/validate-workflow-contracts.js`: PASS
