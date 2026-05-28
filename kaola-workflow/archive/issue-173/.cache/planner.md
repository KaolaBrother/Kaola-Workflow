# Planner Output — issue-173 fast path

## Files to Touch (2)
1. `docs/decisions/0001-legacy-session-lock-cleanup.md` — CREATE (new ADR)
2. `docs/README.md` — EDIT (add link to new ADR under decisions section)

## ADR Content
See plan below.

## Acceptance Check Commands
```bash
test -s docs/decisions/0001-legacy-session-lock-cleanup.md
grep -F "0001-legacy-session-lock-cleanup.md" docs/README.md
node scripts/validate-kaola-workflow-contracts.js
node scripts/simulate-workflow-walkthrough.js
```

## Out of Scope
- No changes to validator scripts
- No changes to docs/workflow-state-contract.md
- No cleanup script, audit script, or startup hook
- CHANGELOG: optional single bullet "docs: add ADR 0001 (legacy session/lock cleanup decision)"
