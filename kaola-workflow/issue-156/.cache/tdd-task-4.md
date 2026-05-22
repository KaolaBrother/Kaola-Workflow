# Task 4 - Fix README release checklist

## Agent
tdd-guide (sonnet)

## Modified Files
- `README.md`

## Change
Lines 424-444 — replaced release checklist:
- `git tag kaola-workflow-v<X.Y.Z>` → `git tag kaola-workflow--v<X.Y.Z> <release-commit>` (double-dash, explicit commit arg)
- `git push origin main --tags` → `git push origin kaola-workflow--v<X.Y.Z>` (single tag push by name)
- Added "Tag rules:" paragraph: commit-selection guidance, edition-tag policy (GitHub required, GitLab optional, Gitea none), prohibition on `--tags`

## RED Evidence
N/A — doc-only change; not covered by automated test assertions.

## GREEN Evidence
`node scripts/validate-workflow-contracts.js` → "Workflow contract validation passed" (exit 0)
README version rows (`Claude Code command install, GitHub edition: \`3.13.0\`` etc.) preserved intact.

## Deviations
None.
