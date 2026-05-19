# TDD Task 2: Add regression assertions to validate-kaola-workflow-contracts.js

## Status: GREEN

## Modified Files
1. `scripts/validate-kaola-workflow-contracts.js` (feature worktree) — 4 new assertions at lines 90-93
2. `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (feature worktree) — synced from canonical (pre-existing miss from issue-108)
3. `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` (feature worktree) — synced from canonical (pre-existing miss from issue-108)

## RED Evidence
N/A — assertions against pre-existing text; documentation-config scenario.

## GREEN Evidence
```
npm run test:kaola-workflow:codex
→ OK: 8 common scripts in sync.
→ Kaola-Workflow Codex contract validation passed
→ Kaola-Workflow walkthrough simulation passed

npm test
→ All suites passed (claude + codex paths)
```

## Notes
Script sync failure (`kaola-workflow-claim.js`, `kaola-workflow-sink-merge.js` out of sync in plugins/) was pre-existing on `main` — missed from issue-108. Fixing it here is a mechanical copy with no behavior change. The sync fix is what unblocked `validate-kaola-workflow-contracts.js` from running, which is the primary validation target for this task.

## Deviations
Two additional plugin files synced (pre-existing issue, mechanical fix, no write-set violation per Trivial Inline Edit Exception analog).
