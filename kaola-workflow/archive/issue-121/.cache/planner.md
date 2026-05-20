# Planner Output — issue-121

## Recommendation: Approach A — Fix + export checkServerVersion + explicit body assertions

## Field Name Resolution (Task 0 completed)
- `head_commit_id` confirmed correct from Gitea SDK v0.17 (auto-generated from Gitea official OpenAPI)
- Issue-111 docs-lookup (`head_commit_sha`) was incorrect
- Issue-121 issue body (`head_commit_id`) was correct

## Key Implementation Notes

1. **Bug 1 fix**: `kaola-gitea-forge.js:232` — `data.server_version || ''` → `data.version || data.server_version || ''`
2. **Bug 2 fix**: `kaola-gitea-forge.js:257` — `mergeBody.merge_message_field = options.sha` → `mergeBody.head_commit_id = options.sha`
3. **Export checkServerVersion**: Add to `module.exports` for direct testability (matches existing `checkRepoSquashEnabled` precedent)
4. **Update existing stub**: `test-gitea-forge-helpers.js:87` — change `merge_message_field` to `head_commit_id` in key string
5. **New tests**: Use `calls` array inspection for exact body assertions (not weak stub-key matching)
6. **JSON key order**: `Do`, then `delete_branch_after_merge`, then conditional `head_commit_id` — must preserve for serialized assertions

## New Tests Required
1. `checkServerVersion` with `{version: "1.21.0"}` → no throw
2. `checkServerVersion` with `{server_version: "1.21.0"}` (fallback) → no throw
3. `checkServerVersion` with `{version: "1.16.0"}` → throws
4. `checkServerVersion` with `{}` (absent) → no throw (permissive)
5. `mergePullRequest` basic → body exactly `{"Do":"merge","delete_branch_after_merge":false}`
6. `mergePullRequest` squash + sha → body exactly `{"Do":"squash","delete_branch_after_merge":false,"head_commit_id":"abc123"}`

## Explicitly Out of Scope
- GitHub/GitLab changes
- merge_when_checks_succeed implementation
- auto-merge feature (just the existing guard fix)
- merge_message_field / merge_title_field handling (they stay unused; we stop misusing them for SHA)
