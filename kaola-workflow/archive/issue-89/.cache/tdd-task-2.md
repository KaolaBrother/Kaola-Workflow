# TDD Task 2 — Write failing tests (issue-89)

## File Modified
`plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`

## Changes
- Line 8: Added `execFileSync` to existing `child_process` destructure
- Lines 32-49: New `setupRealRepo(name, project)` helper
- Lines 332-431: Four new test blocks (classifyMergeError unit, exit-2, exit-3, success-path)

## RED Evidence
`node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` — exits with AssertionError at line 342 (new block 1):
```
AssertionError: classifyMergeError: expected 'branch_protected' for protected branch, got 'null'
```
Pre-existing blocks (lines 144-220): all PASS — failure occurs after them at line 342.
New blocks 2-4 would also fail for their respective reasons.

## GREEN Evidence
N/A — implementation not yet written (Task 3 is next).

## Deviations
- FORCE_MERGE_IMPOSSIBLE test fixed to call classify() while env var is set
- spawnSync/execFileSync use top-level destructure rather than inline requires
