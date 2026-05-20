# Advisor Plan Gate — issue-121

## Verdict: APPROVED with one correction

The architect's blueprint is correct. Source-level verification confirmed:

1. `checkServerVersion(opts)` at line 229 accepts `opts` and passes `opts || {}` to `teaExec`. The `offline: true` + `offlineStdout` shortcut at `teaExec` line 15 fires correctly. Tests 1-4 using `{ offline: true, offlineStdout: ... }` are valid.

2. `runner(calls, responses)` pushes 2-element `[bin, args]` at line 9. Body extraction `calls[last][1].slice(-1)[0]` is correct for tests 5-6.

3. Line 87 stub key uses `delete_branch_after_merge:true` (not false) — correct because the existing line 122-127 test passes `removeSourceBranch: true`. The rename is only `merge_message_field` → `head_commit_id`.

4. Test 6 (squash + sha) requires stub for `'api /api/v1/repos/group/project'` returning `allow_squash_merge: true` — `checkRepoSquashEnabled` is called internally at line 253 when `options.squash` is true.

5. Throw message at line 237: `'Gitea server >= 1.17 required for auto-merge'`. Regex `/Gitea server >= 1\.17 required/` matches correctly.

## Correction

Architect's export patch shows `checkServerVersion` being added to the comma-separated list at line 289. The actual line 289 is:
```js
createPullRequest, viewPullRequest, listPullRequests, checkRepoSquashEnabled, mergePullRequest,
```
Insert `checkServerVersion,` before `checkRepoSquashEnabled` as specified.

## Build Sequence Confirmed

1. Source: Bug 1 (line 232) + Bug 2 (line 257) + export (line 289) — atomic, single edit
2. Test: Line 87 stub key rename
3. Test: Append tests 1-4 (checkServerVersion) before `console.log`
4. Test: Append tests 5-6 (mergePullRequest body) after tests 1-4

Steps 2-4 sequential, all depend on step 1.

## No Gaps or Missing Edge Cases

Blueprint is complete. Proceed to implementation.
