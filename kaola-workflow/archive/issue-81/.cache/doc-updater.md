# Doc Updater — issue-81

## Files Updated
1. `CHANGELOG.md` — Added entry under [Unreleased] for startup contract change (issue #81)
2. `README.md` — Expanded no-target paragraph to clarify sole-active behavior and include bash one-liner
3. `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` — Plugin mirror synced with main script fix (same 6-line change)

## Checklist Results
- README.md: updated — sole-active no-target contract clarified with one-liner
- API docs (docs/api.md): N/A — file contains no startup/no_target documentation; no update needed
- CHANGELOG.md: updated — comprehensive entry added
- Architecture docs: N/A — no structural system change
- .env.example: N/A — no new env vars
- Inline comments: N/A — changes are self-explanatory

## Validation
`node scripts/simulate-workflow-walkthrough.js` — PASSED (exit 0)
