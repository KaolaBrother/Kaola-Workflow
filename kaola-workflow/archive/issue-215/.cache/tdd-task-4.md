# Task 4: Fix canonical classifier + cp to Codex

## Files Modified
- `scripts/kaola-workflow-classifier.js` (sectionBody lines 129-142 → 33-line fence-aware version)
- `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js` (cp from canonical)

## Change
Old 14-line sectionBody replaced with fence-aware version: fenceRe, inFence/fenceFamily tracking in both loops, family-only, toggle-before-boundary.

## Validation
- `node scripts/validate-script-sync.js` → "OK: 11 common scripts and 2 byte-identical file group in sync."
- `node scripts/simulate-workflow-walkthrough.js` → exit 0, "Workflow walkthrough simulation passed" (60/60 tests pass including 3 new #215 tests)

## Status
COMPLETE (GREEN)
