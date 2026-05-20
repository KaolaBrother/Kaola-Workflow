# Phase 6 Summary: issue-121

## Delivery

**GitHub Issue**: KaolaBrother/Kaola-Workflow#121
**Branch**: workflow/issue-121
**Sink**: merge

## Changes Shipped

### Production
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js`
  - Bug 1 (line 232): `checkServerVersion` now reads `version` field (Gitea API) with `server_version` as fallback; previously the guard was silently skipped because no field matched
  - Bug 2 (line 257): `mergePullRequest` now sets `head_commit_id` (not `merge_message_field`) in the merge body; `merge_message_field` was silently ignored by the Gitea API
  - Export: `checkServerVersion` exported for direct testability (mirrors `checkRepoSquashEnabled` pattern)

### Tests
- `plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js`
  - Stub key at line 87 updated: `merge_message_field` → `head_commit_id`
  - 4 new tests for `checkServerVersion`: version present+passing, server_version fallback, version too old (throws), version absent (permissive)
  - 2 new tests for `mergePullRequest` body shape: basic merge and squash+sha, both asserting exact serialized JSON via `calls` array inspection

## Final Validation

All tests passed: `Gitea forge helper tests passed` (exit 0)
All regression tests passed: `npm test` exit 0 — `Workflow walkthrough simulation passed`, `Kaola-Workflow walkthrough simulation passed`

## Final Validation: PASS
