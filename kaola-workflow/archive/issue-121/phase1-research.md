# Phase 1 - Research / Discovery: issue-121

## Deliverable
Fix two field-name bugs in `kaola-gitea-forge.js` and add tests asserting exact merge request body for all key scenarios.

## Why
Gitea merge API calls use wrong field names: version check silently skips validation (reads absent field `server_version`), and SHA guard doesn't work (maps to `merge_message_field` instead of `head_commit_id`). This makes Gitea merge behavior less safe than GitHub/GitLab baseline.

## Affected Area
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js` — two one-line fixes (lines 232, 257)
- `plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js` — update stub at line 87; add new tests

## Key Patterns Found
1. Bug 1: `kaola-gitea-forge.js:232` — `data.server_version || ''` → fix: `data.version || data.server_version || ''`
2. Bug 2: `kaola-gitea-forge.js:257` — `mergeBody.merge_message_field = options.sha` → fix: `mergeBody.head_commit_id = options.sha`
3. Existing stub at `test-gitea-forge-helpers.js:87` must change: `merge_message_field` → `head_commit_id` in key string
4. Test runner pattern: `runner(calls, responses)` returns mock `execFileSync`; key = `args.join(' ')`; returns canned JSON
5. `teaExec` accepts `{ offlineStdout }` for simple offline stub (line 62 of test file)
6. Tests appended before `console.log('Gitea forge helper tests passed')` at line 164

## Test Patterns
- Framework: hand-rolled assert (no framework)
- Location: `plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js`
- Structure: unit tests using `runner(calls, responses)` stub, assert on return values and thrown errors

## Config & Env
- No new env vars needed
- `KAOLA_WORKFLOW_OFFLINE=1` not relevant to these tests (all are unit tests with injected `execFileSync`)

## External Docs
None — Gitea API field names (`version`, `head_commit_id`) confirmed from issue body and OpenAPI schema reference.

## GitHub Issue
KaolaBrother/Kaola-Workflow#121

## Completeness Score
10/10 — exact bug locations, exact fixes, exact test patterns, exact stub key change.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | .cache/docs-lookup.md | Internal patterns sufficient; field names from issue body |

## Notes / Future Considerations
None.
