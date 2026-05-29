# Doc-Updater: issue-177

## Files Updated
1. `README.md` — added note after release checklist (line ~433) that `npm test` now enforces local tag existence (KAOLA_WORKFLOW_OFFLINE=1 exception noted); updated `validate-workflow-contracts.js` row in validation scripts table to document the new tag-existence check with exact mechanism and skip conditions.

## Files Confirmed No Update Needed
- `docs/conventions.md` — already has `## Release` section with tag contract from Phase 4 implementation
- `CHANGELOG.md` — already has [Unreleased] entry with issue #177 attribution (applied in Phase 5)
- `docs/architecture.md` — high-level structural doc; validator tooling details not tracked here; no update needed
- `docs/api.md` — public APIs and external contracts; test-time validation script internals not tracked here; no update needed
- `.env.example` — no new env vars (KAOLA_WORKFLOW_OFFLINE was already documented)
