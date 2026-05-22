# Phase 1 - Research / Discovery: issue-156

## Deliverable

Three deliverables:
1. Publish `kaola-workflow--v3.13.0` (and `kaola-workflow-gitlab--v3.13.0`) on HEAD of main, which already carries all 3.13.0 metadata.
2. Fix the README release checklist to document the correct double-dash tag format (`kaola-workflow--v{version}` not `kaola-workflow-v{version}`).
3. Add a CHANGELOG drift guard to `scripts/validate-workflow-contracts.js` (and its byte-identical mirror) so `npm test` catches a missing `[X.Y.Z]` CHANGELOG entry.

## Why

package.json, CHANGELOG.md, README.md, and both plugin.json files all declare 3.13.0, but no matching git tag was pushed. Users or automation relying on tags for release discovery, install provenance, or rollback see stale release state. Also, the README documents the wrong tag format (single-dash), and there is no test guard preventing CHANGELOG/version drift.

## Affected Area

- `scripts/validate-workflow-contracts.js` — add CHANGELOG drift guard
- `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` — byte-identical mirror (required by script-sync contract)
- `README.md` lines ~424-431 — fix tag format from single-dash to double-dash
- Git tags (remote): publish `kaola-workflow--v3.13.0` and `kaola-workflow-gitlab--v3.13.0`

## Key Patterns Found

1. **Version drift guard pattern** — `scripts/validate-workflow-contracts.js`:263-281: `const rootVersion = parseJson('package.json').version; assert(readmeRows.match(rootVersion), ...)` — extend this with a CHANGELOG check using `new RegExp('^## \\[' + escapedVersion + '\\]', 'm').test(readFile('CHANGELOG.md'))`
2. **Script-sync enforcement** — `scripts/validate-script-sync.js`: all files in `scripts/` must be byte-identical to `plugins/kaola-workflow/scripts/`; any edit to `validate-workflow-contracts.js` requires `cp scripts/validate-workflow-contracts.js plugins/kaola-workflow/scripts/`
3. **Tag naming convention (actual)** — `git tag -l 'kaola-workflow*'` shows double-dash: `kaola-workflow--v3.12.0`, `kaola-workflow-gitlab--v3.8.1` — README line ~429 incorrectly documents single-dash format

## Test Patterns

- Framework: hand-rolled `assert()` in `scripts/simulate-workflow-walkthrough.js`
- Location: `scripts/simulate-workflow-walkthrough.js`
- Structure: top-level `async function test*()` functions, called sequentially at bottom; `node scripts/simulate-workflow-walkthrough.js` must exit 0
- The validate-workflow-contracts.js changes are themselves the tests (run via `npm test`); no new simulate-walkthrough test needed for the CHANGELOG guard

## Config & Env

- `KAOLA_WORKFLOW_OFFLINE=1` — disables live gh/glab/tea calls in simulate-walkthrough; a live `git tag` check in npm test would break offline CI
- No CI/CD files exist; `npm test` is the only automated gate

## External Docs

N/A — internal patterns sufficient.

## GitHub Issue

KaolaBrother/kaola-workflow#156

## Completeness Score

9/10 (minor: Gitea tags may or may not need to be published — no Gitea-specific tags exist historically, so the pattern suggests Gitea does not get separate tags; this is recorded as a clarification item)

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | .cache/docs-lookup.md | internal patterns sufficient |

## Notes / Future Considerations

- No Gitea-specific tags exist in git history — historical pattern suggests Gitea does not get a separate forge tag. AC2 ("clarify whether GitLab/Gitea tags should also be published") is answered: publish `kaola-workflow--v3.13.0` (main) and `kaola-workflow-gitlab--v3.13.0` (GitLab edition); no Gitea-specific tag.
- A live tag-existence check (confirming the tag was pushed) should NOT be added to `npm test` due to the offline CI contract; it belongs in the README release checklist.
- The README release checklist documents single-dash tag format (`kaola-workflow-v<X.Y.Z>`) which conflicts with all actual tags in the repository. This is a documentation bug that must be fixed as part of this issue.
