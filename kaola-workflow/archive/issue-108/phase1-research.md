# Phase 1 - Research / Discovery: issue-108

## Deliverable
Fix the GitLab sink-merge fallback so it does not recreate `kaola-workflow/{project}` after Phase 6 has archived the folder. Two-part fix: (1) guard the receipt write in `kaola-gitlab-workflow-sink-merge.js` against already-archived projects, (2) add archive-path check to `cmdSinkFallback` in `kaola-gitlab-workflow-claim.js`. Add regression coverage for merge-impossible exit 3 after archive.

## Why
Prevents archive corruption: the merge-impossible exit-3 path can resurrect an archived active folder, write an empty `workflow-state.md`, and corrupt the workflow-state lifecycle — confusing subsequent status, resume, watch-mr, and archive handling.

## Affected Area
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` (lines 192–201: receipt write in `postMergeCleanup`)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` (lines 571–585: `cmdSinkFallback`, lines 392–420: `archiveProjectDir`, lines 131–133: `projectDir`)
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` (new regression test)
- `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` (new integration guard)

## Key Patterns Found
1. **Receipt write path construction** — `sink-merge.js:192`: `path.join(mainRoot, 'kaola-workflow', args.project, '.cache', 'sink-fallback.json')` — always uses the live path, no archive awareness
2. **cmdSinkFallback archive check** — `claim.js:576`: `if (!fs.existsSync(projectDir(root, args.project)))` — only checks live path, not `kaola-workflow/archive/{project}/`
3. **resolveProjectFile archive-aware pattern** — `sink-merge.js:49–55`: checks live path first, falls back to archive path for reads — pattern to mirror for the archive guard
4. **archiveProjectDir** — `claim.js:392–420`: renames `kaola-workflow/{project}/` → `kaola-workflow/archive/{project}/`; archive path is `path.join(root, 'kaola-workflow', 'archive', project)`
5. **updateState empty-content behavior** — `claim.js:203–208`: when `workflow-state.md` is missing, `content = ''`; both `.replace()` calls no-op → empty file written

## Test Patterns
- Framework: Hand-rolled `assert` (Node built-in), sequential scripts
- Location: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` (sink unit/subprocess tests), `simulate-gitlab-workflow-walkthrough.js` (integration)
- Structure: `fs.mkdtempSync` temp dir per test, `spawnSync` for subprocess tests, `finally` cleanup; existing Block 3 (lines 392–410) uses `KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE=branch_protected KAOLA_WORKFLOW_OFFLINE=1` env vars; existing `testFallbackGuardsAfterArchive` (lines 24–73) is the model for the new integration test

## Config & Env
- `KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE=branch_protected` — forces sink-merge to exit 3 in tests
- `KAOLA_WORKFLOW_OFFLINE=1` — skips network calls in tests
- `KAOLA_WORKFLOW_ROOT` / `getRoot()` — resolves the kaola-workflow root directory

## External Docs
None — all internal Node.js built-ins and kaola-workflow conventions.

## GitHub Issue
KaolaBrother/Kaola-Workflow#108

## Completeness Score
10/10

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | .cache/docs-lookup.md | internal patterns sufficient |

## Notes / Future Considerations
- The same `cmdSinkFallback` archive-blindness exists in `scripts/kaola-workflow-claim.js` (GitHub path, lines 561–575), but the GitHub path has no companion receipt-write script so the live recreation bug is GitLab-specific. The archive-path guard can be added to the GitHub version too as a low-risk hardening, but the issue AC does not require it.
- The `resolveProjectFile` pattern in `sink-merge.js` lines 49–55 is a clean model for extracting a shared `isArchived(root, project)` helper — worthwhile if more callers need it, but a simple inline check is sufficient for this fix scope.
