# Doc-Updater — issue-216

## Updated files

- **CHANGELOG.md**: Added `### Fixed` bullet under `[Unreleased]` for issue #216 — `wasArchived` guard in `postMergeCleanup`, both files, regression test name, no version bump.
- **scripts/kaola-workflow-sink-merge.js** (line 212 comment): Updated `// Classified merge-impossible: reset local main, write receipt, signal exit 3` → `// Classified merge-impossible: reset local main, write receipt (skipped when project was already archived), signal exit 3`
- **plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js**: Identical comment update; byte-sync validator confirmed still byte-identical (SHA `677de466`).
- **docs/api.md**: Updated stale sentence about exit-3 receipt to describe the #216 guard (receipt skipped for archived projects).
- **README.md**: Appended one sentence noting receipt write is skipped for already-archived projects (issue #216).

## Skipped (with reason)
- `.env.example`: No new environment variables
- Architecture docs: High-level exit-code/pivot description still accurate; archived-project guard is internal detail
- `docs/conventions.md`, `docs/workflow-state-contract.md`: No references to changed path

## Anti-fabrication compliance
All updates based on ground truth from code. No invented field names or values.
