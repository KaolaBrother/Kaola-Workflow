# tdd-task-2 — Gitea workflow-next.md fix

## Result: GREEN

## Files Modified
- `plugins/kaola-workflow-gitea/commands/workflow-next.md`

## RED Evidence
N/A — documentation-only change; no unit tests to write

## GREEN Evidence
- `node scripts/validate-workflow-contracts.js` → `Workflow contract validation passed`
- Line 154 now reads "folders for merged or closed PRs before selecting new work."

## Edit Applied (Edit 12)
Line 154: "MRs" → "PRs". One word change only.

## Deviations
None.
