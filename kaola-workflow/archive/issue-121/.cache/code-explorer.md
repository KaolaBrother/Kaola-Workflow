# Code Explorer Output — issue-121

## Bug 1: checkServerVersion reads wrong field

File: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js:232`

```js
function checkServerVersion(opts) {
  const raw = teaExec(['api', '/api/v1/version'], opts || {});
  const data = parseJson(raw, {});
  const versionStr = data.server_version || '';   // BUG: Gitea API returns `version`, not `server_version`
  const match = versionStr.match(/(\d+)\.(\d+)/);
  if (match) {
    const minor = Number(match[2]);
    if (Number(match[1]) < 1 || (Number(match[1]) === 1 && minor < 17)) {
      throw new Error('Gitea server >= 1.17 required for auto-merge');
    }
  }
}
```

Fix: `data.version || data.server_version || ''` (defensive, reads actual field first, falls back to legacy name)

## Bug 2: mergePullRequest puts SHA in wrong field

File: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js:257`

```js
if (options.sha) mergeBody.merge_message_field = options.sha;   // BUG: should be head_commit_id
```

Fix: `if (options.sha) mergeBody.head_commit_id = options.sha;`

## Affected Test

File: `plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js:87`

```js
'api -X POST /api/v1/repos/group/project/pulls/9/merge -d {"Do":"squash","delete_branch_after_merge":true,"merge_message_field":"abc123"}': '{}'
```

This stub key must change to `head_commit_id` after the fix.

## Test Framework Pattern

- Hand-rolled assert (no framework)
- `runner(calls, responses)` function: returns mock `execFileSync` that matches `args.join(' ')` to canned responses
- Tests use `runner` for isolated unit testing of forge functions
- New tests appended before `console.log('Gitea forge helper tests passed')` at line 164
- `teaExec` supports `{ execFileSync }` option for injection AND `{ offlineStdout }` option for simple offline override

## New Tests Required

1. `checkServerVersion` with `version` field → no throw (correct Gitea API response)
2. `checkServerVersion` with `server_version` field → no throw (fallback compatibility)
3. `checkServerVersion` too-old version (< 1.17) → throws
4. `checkServerVersion` version string absent → no throw (permissive when missing)
5. `mergePullRequest` basic (no squash, no sha) → exact body `{"Do":"merge","delete_branch_after_merge":false}`
6. `mergePullRequest` with squash + sha → exact body `{"Do":"squash","delete_branch_after_merge":false,"head_commit_id":"SHA"}`
7. `mergePullRequest` with autoMerge → triggers version check, exact body assertion

## Out of Scope
- `checkServerVersion` export (it's an internal function called by `mergePullRequest`)
- GitLab or GitHub sink changes
- Auto-merge feature implementation beyond the server-version guard

## Completeness: 10/10
- Exact bug locations confirmed: lines 232, 257
- Exact fix confirmed: field names from Gitea OpenAPI schema
- Test stub key that must change: line 87
- Test pattern confirmed: runner + responses + assert
