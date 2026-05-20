# Phase 3 - Plan: issue-121

## Blueprint

### Files to Create
None.

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js` | Bug 1 (line 232), Bug 2 (line 257), export (line 289) | Fix wrong field names; export for testability |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js` | Line 87 stub key rename; 6 new tests | Bring tests up to fixed behavior; add strong body assertions |

### Build Sequence
1. Source patch — Bug 1 + Bug 2 + export on `kaola-gitea-forge.js` (atomic, all three lines in one edit session). This is the dependency root.
2. Stub key rename — line 87 of `test-gitea-forge-helpers.js` (`merge_message_field` → `head_commit_id`).
3. New tests 1-4 — `checkServerVersion` offline-stub tests, appended before `console.log`.
4. New tests 5-6 — `mergePullRequest` body assertions using `calls` array, appended after tests 1-4.

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| A | Task 1 (source) | Only touches `kaola-gitea-forge.js` |
| B (sequential after A) | Tasks 2, 3, 4 | All touch `test-gitea-forge-helpers.js`; applied in order |

### External Dependencies
None — no new imports, no new packages.

## Task List

### Task 1: Source fix + export
- File: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js`
- Test File: `plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js`
- Write Set: `kaola-gitea-forge.js`
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Implement:
  - Line 232: `data.server_version || ''` → `data.version || data.server_version || ''`
  - Line 257: `mergeBody.merge_message_field = options.sha` → `mergeBody.head_commit_id = options.sha`
  - Line 289: add `checkServerVersion,` before `checkRepoSquashEnabled` in module.exports
- Mirror: `checkRepoSquashEnabled` export pattern at line 289
- Validate: `node plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js` (exit 0)

### Task 2: Stub key rename
- File: `plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js`
- Write Set: `test-gitea-forge-helpers.js` line 87
- Depends On: Task 1
- Parallel Group: B-serial
- Action: MODIFY
- Implement: Change stub key at line 87 from `merge_message_field` to `head_commit_id`. Keep `delete_branch_after_merge:true` (not false — existing test at 122-127 uses `removeSourceBranch: true`).
- Mirror: Existing stub object at lines 64-94
- Validate: same as Task 1

### Task 3: New tests 1-4 (checkServerVersion)
- File: `plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js`
- Write Set: `test-gitea-forge-helpers.js` (insertion before line 164)
- Depends On: Tasks 1, 2
- Parallel Group: B-serial
- Action: MODIFY
- Implement: Insert 4 tests using `offline: true, offlineStdout` pattern before `console.log('Gitea forge helper tests passed')`:
  1. `checkServerVersion({ offline: true, offlineStdout: JSON.stringify({ version: '1.21.0' }) })` → no throw
  2. `checkServerVersion({ offline: true, offlineStdout: JSON.stringify({ server_version: '1.21.0' }) })` → no throw (fallback)
  3. `assert.throws(() => forge.checkServerVersion({ offline: true, offlineStdout: JSON.stringify({ version: '1.16.0' }) }), /Gitea server >= 1\.17 required/)` → throws
  4. `checkServerVersion({ offline: true, offlineStdout: JSON.stringify({}) })` → no throw (permissive)
- Mirror: `checkRepoSquashEnabled` tests at lines 129-143 (throws pattern)
- Validate: same as Task 1

### Task 4: New tests 5-6 (mergePullRequest body)
- File: `plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js`
- Write Set: `test-gitea-forge-helpers.js` (insertion before line 164, after Task 3 insertions)
- Depends On: Tasks 1, 2, 3
- Parallel Group: B-serial
- Action: MODIFY
- Implement: Insert 2 block-scoped tests using `runner(calls, responses)` + `calls` array assertion:
  - Test 5 (basic merge, no sha): PR 7, no options → body `{"Do":"merge","delete_branch_after_merge":false}`
  - Test 6 (squash + sha): PR 7, `squash: true, sha: 'abc123'` → body `{"Do":"squash","delete_branch_after_merge":false,"head_commit_id":"abc123"}`. Requires stub for `'api /api/v1/repos/group/project'` returning `allow_squash_merge: true`.
  - Body extracted as: `calls[calls.length - 1][1].slice(-1)[0]`
  - Assert: `assert.strictEqual(bodyArg, expectedString)`
- Mirror: Lines 145-154 (`mergePullRequest` + `squash` + `throws` block) for structure
- Validate: same as Task 1

## Advisor Notes
Blueprint confirmed correct. Key verified facts:
- `checkServerVersion(opts)` accepts opts and passes to `teaExec` — `offline: true` + `offlineStdout` shortcut works.
- `runner` pushes 2-element `[bin, args]` — `calls[last][1].slice(-1)[0]` extracts body correctly.
- Line 87 stub `delete_branch_after_merge:true` is correct — keep it.
- Test 6 squash runner must include `'api /api/v1/repos/group/project'` stub.
- Throw message: `'Gitea server >= 1.17 required for auto-merge'`, regex `/Gitea server >= 1\.17 required/`.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | | Blueprint had no gaps; no revision needed |
