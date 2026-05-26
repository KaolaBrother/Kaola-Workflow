# Code Explorer: issue-168 — sink-merge stale CWD fix

## Entry Points

Four sink-merge scripts — all structurally parallel:

| File | Edition |
|------|---------|
| `scripts/kaola-workflow-sink-merge.js` | GitHub canonical |
| `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` | GitHub plugin copy (byte-identical) |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | GitLab |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` | Gitea |

## Root Cause (confirmed)

`process.chdir(os.tmpdir())` is called at Step 0 (~line 299 GitHub edition) before worktree removal. All subsequent `git` calls pass `-C mainRoot` or `{ cwd: mainRoot }` — but the forge CLI calls (`ghExec`, `forge.closeIssue`) do NOT pass a `cwd`, so they inherit `os.tmpdir()`. Since `gh`/`glab`/`tea` auto-detect the repo from CWD, they fail to find the repo and silently skip the issue close.

## Post-merge issue-close code (Step 8 in each edition)

**GitHub** (`scripts/kaola-workflow-sink-merge.js` ~lines 236-239):
```js
if (!OFFLINE && args.issue != null) {
  try { ghExec(['issue', 'close', String(args.issue), '--comment', 'Merged via sink-merge.']); remoteIssueClosed = 'closed'; }
  catch (_) { remoteIssueClosed = 'failed'; }
  try { ghExec(['issue', 'edit', String(args.issue), '--remove-label', 'workflow:in-progress']); claimLabelRemoved = 'removed'; } catch (_) { claimLabelRemoved = 'failed'; }
}
```
`ghExec` (lines 20-25) passes opts to `execFileSync` with no `cwd` set.

**GitLab** (`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` ~line 268):
```js
try { forge.closeIssue(args.issue); remoteIssueClosed = 'closed'; } catch (_) { ... }
```
`forge.closeIssue` calls `glabExec` in `kaola-gitlab-forge.js` (line 10-18) with no `cwd` override.

**Gitea** (`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` ~line 268):
```js
try { forge.closeIssue(args.issue); remoteIssueClosed = 'closed'; } catch (_) { ... }
```
`forge.closeIssue` calls `teaExec` in `kaola-gitea-forge.js` (line 18) with no `cwd` override.

## CWD Management

- `process.chdir(os.tmpdir())` set at Step 0 (GitHub: line 299, GitLab/Gitea: line 339).
- A `process.on('exit', ...)` guard restores `mainRoot` on process exit — but this fires AFTER Step 8, so it doesn't help.
- All git calls after Step 0 use `-C mainRoot` arg or `{ cwd: mainRoot }` exec option.
- Forge calls do NOT use `cwd: mainRoot`.

## Fix Approach

Pass `{ cwd: mainRoot }` to `ghExec` in the GitHub edition.
For GitLab/Gitea, pass `{ execOptions: { cwd: mainRoot } }` to `forge.closeIssue`/`forge.updateIssue`/`forge.createIssueNote` — the forge layers support `options.execOptions` passthrough.

## Closure Receipt Pattern

`buildClosureReceipt` (`scripts/kaola-workflow-claim.js` lines 1036-1051) defaults all fields to 'failed'.
- `remote_issue_closed` initialized to `'skipped_offline'` if OFFLINE, else `'failed'`.
- Set to `'closed'` only if forge call succeeds without throwing.
- `catch (_) {}` at call site leaves it at `'failed'`.
- `checkClosureInvariants` does NOT check `remote_issue_closed` — only checks `branch_removed` and `worktree_removed`.

## Error Handling Patterns

- Step 8 (issue close, label removal) uses fully-swallowed `catch (_) {}` — "best-effort cleanup" pattern.
- Step 7 (push) propagates errors unless classified by `classifyMergeError()`.
- No logging of forge errors in Step 8.

## Test Locations

**GitHub**: `scripts/simulate-workflow-walkthrough.js`
- `testSinkMergeMockabilityAndReceipt` (line 2927) — uses `KAOLA_GH_MOCK_SCRIPT` for online-mode forge mock; uses `initGitRepoWithBareRemote`. This is the right test to extend for the CWD regression.
- Most other sink-merge tests use `KAOLA_WORKFLOW_OFFLINE: '1'`.

**GitLab**: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` — uses `withForge(stubs, fn)` in-process stubbing; calls `sinkMerge.runDirectMerge(args, opts)` with `options.root` set to temp repo.

**Gitea**: `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` — same pattern as GitLab.

Mock env vars:
- GitHub: `KAOLA_GH_MOCK_SCRIPT`
- GitLab: `KAOLA_GLAB_MOCK_SCRIPT` (checked in `kaola-gitlab-forge.js`)
- Gitea: `KAOLA_TEA_MOCK_SCRIPT` (checked in `kaola-gitea-forge.js`)

## Shared Code

No shared forge module. Each edition is independent:
- GitHub: `ghExec` inline in sink-merge and in claim.js (lines 49-54)
- GitLab: `require('./kaola-gitlab-forge')` — `glabExec` is internal dispatcher
- Gitea: `require('./kaola-gitea-forge')` — `teaExec` is internal dispatcher
- `buildClosureReceipt`, `checkClosureInvariants` shared from `scripts/kaola-workflow-claim.js`

## Key Files

| File | Role |
|------|------|
| `scripts/kaola-workflow-sink-merge.js` | GitHub canonical; `ghExec` at ~lines 237-239 |
| `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` | Plugin copy; byte-identical — same fix needed |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | GitLab; `forge.closeIssue` at ~line 268 |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` | Gitea; `forge.closeIssue` at ~line 268 |
| `scripts/kaola-workflow-claim.js` | `ghExec` (lines 49-54), `buildClosureReceipt` (lines 1036-1051) |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-forge.js` | `glabExec` with `options.execOptions` passthrough |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js` | `teaExec` with `options.execOptions` passthrough |
| `scripts/simulate-workflow-walkthrough.js` | Main test; `testSinkMergeMockabilityAndReceipt` at line 2927 |
| `scripts/kaola-workflow-closure-contract.js` | Receipt schema |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` | GitLab in-process tests |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` | Gitea in-process tests |
