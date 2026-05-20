# Architect Blueprint — issue-121

## Files to Modify

| File | Changes | Priority |
|------|---------|----------|
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js` | Bug 1 (line 232), Bug 2 (line 257), export patch (line 289) | 1 — source dependency |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js` | Line 87 stub key rename; 6 new tests before final console.log | 2 — depends on source |

## Files to Create
None.

## Exact Changes — Source File

**Path:** `plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js` (worktree)

**Bug 1 — line 232:**
```js
// before
const versionStr = data.server_version || '';
// after
const versionStr = data.version || data.server_version || '';
```

**Bug 2 — line 257:**
```js
// before
if (options.sha) mergeBody.merge_message_field = options.sha;
// after
if (options.sha) mergeBody.head_commit_id = options.sha;
```

**Export patch — line 289:**
```js
// before
createPullRequest, viewPullRequest, listPullRequests, checkRepoSquashEnabled, mergePullRequest,
// after
createPullRequest, viewPullRequest, listPullRequests, checkServerVersion, checkRepoSquashEnabled, mergePullRequest,
```

## Exact Changes — Test File

**Path:** `plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js` (worktree)

**Line 87 — stub key rename:**
```js
// before
'api -X POST /api/v1/repos/group/project/pulls/9/merge -d {"Do":"squash","delete_branch_after_merge":true,"merge_message_field":"abc123"}': '{}',
// after
'api -X POST /api/v1/repos/group/project/pulls/9/merge -d {"Do":"squash","delete_branch_after_merge":true,"head_commit_id":"abc123"}': '{}',
```

**6 new tests — append before `console.log('Gitea forge helper tests passed')`:**

Tests 1-4 (checkServerVersion, using offline stub):
```js
// Test: version field present and sufficient → no throw
forge.checkServerVersion({ offline: true, offlineStdout: JSON.stringify({ version: '1.21.0' }) });

// Test: server_version fallback field → no throw
forge.checkServerVersion({ offline: true, offlineStdout: JSON.stringify({ server_version: '1.21.0' }) });

// Test: version present but too old → throws
assert.throws(
  () => forge.checkServerVersion({ offline: true, offlineStdout: JSON.stringify({ version: '1.16.0' }) }),
  /Gitea server >= 1\.17 required/
);

// Test: absent version fields → permissive (no throw)
forge.checkServerVersion({ offline: true, offlineStdout: JSON.stringify({}) });
```

Tests 5-6 (mergePullRequest body shape, assertions on calls array):
```js
// Test: basic merge (no sha) → exact body string
{
  const mergeCalls = [];
  const mergeExec = runner(mergeCalls, {
    'api -X POST /api/v1/repos/group/project/pulls/7/merge -d {"Do":"merge","delete_branch_after_merge":false}': '{}'
  });
  forge.mergePullRequest(project, 7, { execFileSync: mergeExec });
  const bodyArg = mergeCalls[mergeCalls.length - 1][1].slice(-1)[0];
  assert.strictEqual(bodyArg, '{"Do":"merge","delete_branch_after_merge":false}');
}

// Test: squash + sha → exact body string including head_commit_id
{
  const squashCalls = [];
  const squashExec = runner(squashCalls, {
    'api /api/v1/repos/group/project': JSON.stringify({ allow_squash_merge: true }),
    'api -X POST /api/v1/repos/group/project/pulls/7/merge -d {"Do":"squash","delete_branch_after_merge":false,"head_commit_id":"abc123"}': '{}'
  });
  forge.mergePullRequest(project, 7, { execFileSync: squashExec, squash: true, sha: 'abc123' });
  const bodyArg = squashCalls[squashCalls.length - 1][1].slice(-1)[0];
  assert.strictEqual(bodyArg, '{"Do":"squash","delete_branch_after_merge":false,"head_commit_id":"abc123"}');
}
```

## Implementation Notes

- `offline: true` + `offlineStdout` short-circuits `teaExec` to return the canned string directly (line 15 of source). Correct for tests 1-4.
- `runner(calls, responses)` used for tests 5-6; body is extracted as `calls[last][1].slice(-1)[0]`.
- Test 6 must stub `'api /api/v1/repos/group/project'` returning `allow_squash_merge: true` — `checkRepoSquashEnabled` is called internally before merging with squash.
- `project` fixture (full_name: 'group/project') is defined at lines 51-60 of the test file — no new fixture needed.

## Build Sequence

1. Apply Bug 1 + Bug 2 + export patch to `kaola-gitea-forge.js` (atomic)
2. Rename stub key at line 87 of `test-gitea-forge-helpers.js`
3. Append tests 1-4 (checkServerVersion) before `console.log`
4. Append tests 5-6 (mergePullRequest body) after tests 1-4

Steps 2-4 are sequential (same file, ordering matters for final log position).
Step 1 is a prerequisite for all test steps.

## Parallelization

| Group | Steps | Why Safe |
|-------|-------|----------|
| A | 1 | Only touches source file |
| B (after A) | 2, 3, 4 | Sequential edits to test file |

## External Dependencies
None — no new imports required in either file.

## Validation Command

Primary:
```
node /Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow.kw/issue-121/plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js
```
Expected: `Gitea forge helper tests passed`, exit 0.

Secondary (regression check):
```
node /Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/scripts/simulate-workflow-walkthrough.js
```
Expected: `Workflow walkthrough simulation passed`, exit 0.
