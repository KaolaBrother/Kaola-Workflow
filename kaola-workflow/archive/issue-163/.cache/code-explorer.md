# Code Explorer — issue-163

## `clearAdvisoryClaim()` — GitHub (scripts/kaola-workflow-claim.js lines 347–353)

```js
function clearAdvisoryClaim(issueNumber, reason) {
  if (OFFLINE || issueNumber == null) return;
  try { ghExec(['issue', 'edit', String(issueNumber), '--remove-label', CLAIM_LABEL]); } catch (_) {}
  if (reason) {
    try { ghExec(['issue', 'comment', String(issueNumber), '--body', 'Kaola-Workflow advisory claim cleared: ' + reason]); } catch (_) {}
  }
}
```
- **No return value** — status is never captured by any caller
- Silently no-ops when `issueNumber == null` (no error, no log)
- Swallows all API errors for both label removal and comment
- `CLAIM_LABEL = 'workflow:in-progress'` (line 20)

## `cmdFinalize` null-issue-number gap (scripts/kaola-workflow-claim.js lines 570–597)

`activeByProject(root, args.project)` can return null when the folder's linked GitHub issue is already closed (because `readActiveFolders` with default `excludeClosedIssues: true` filters it out). When this happens, `clearAdvisoryClaim(null, 'finalized')` is a no-op — label never removed.

**Call order**: `archiveProjectDir()` runs at line 575 BEFORE `clearAdvisoryClaim()` at line 593. So by the time cleanup runs, the folder is at `result.dest` (archive path). Fallback must read from `result.dest + '/workflow-state.md'`.

Fallback: `field()` from `kaola-workflow-active-folders.js` parses key: value from state file content. Can be used as:
```js
if (!issueNumber) {
  try {
    const stateContent = fs.readFileSync(path.join(result.dest, 'workflow-state.md'), 'utf8');
    issueNumber = parseInt(field(stateContent, 'issue_number'), 10) || null;
  } catch (_) {}
}
```

## GitLab/Gitea equivalent gaps

GitLab (`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` line 572):
- `clearAdvisoryClaim(folder && folder.issue_iid, 'finalized', ...)`
- Same null-folder gap; uses `issue_iid` not `issue_number`

Gitea (`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` line 557):
- Same pattern; also has `projectInfo.full_name` guard that silently skips if project info absent

## Receipt schema already defined (scripts/kaola-workflow-closure-contract.js line 27)

```js
claim_label_removed: ['removed', 'already_absent', 'skipped_offline', 'failed'],
```

`emptyReceipt()` defaults it to `'failed'`.

`CLOSURE_INVARIANTS[4]`:
```js
{ id: 'in-progress-label-removed', description: 'The remote issue does not have workflow:in-progress after closure.' }
```

**`checkClosureInvariants` does NOT check `in-progress-label-removed`** — only checks `roadmap-source-absent` and `roadmap-mirror-clean`.

## Sink-merge label removal (scripts/kaola-workflow-sink-merge.js lines 228–232)

```js
try { ghExec(['issue', 'close', ...]); } catch (_) {}
try { ghExec(['issue', 'edit', String(args.issue), '--remove-label', 'workflow:in-progress']); } catch (_) {}
```
- Best-effort; result not captured; no receipt field
- `ghExec` in sink-merge calls `execFileSync('gh', ...)` DIRECTLY — does NOT support `KAOLA_GH_MOCK_SCRIPT`. Sink-merge label tests must use `KAOLA_WORKFLOW_OFFLINE=1`.

GitLab sink-merge: two call sites (`closeLinkedIssue()` line 148 + `postMergeCleanup()` line 263).
Gitea sink-merge: two call sites (same structure, `updateIssueLabels`).

## Audit command pattern (stale-worktree-check/cleanup)

Existing pattern (`scripts/kaola-workflow-claim.js` lines 724-764):
- `cmdStaleWorktreeCheck()` — scan-only, emits JSON
- `cmdStaleWorktreeCleanup()` — uses `const dryRun = !args.execute` guard
- Both registered in `main()` (lines 910–911) and `module.exports` (line 927)
- Subcommand dispatch: flat `if (sub === 'X') return cmdX()` chain (lines 897–914)
- Usage assertion at line 899 lists all valid subcommands

Audit labels: `gh issue list --state closed --label workflow:in-progress --json number,title,url`

## Test patterns for label operations

- `writeShimFiles(shimPath, jsLines)` — writes `.js` shim
- `ghMockEnv(binDir)` — returns `{ KAOLA_GH_MOCK_SCRIPT: jsPath }`
- `runClaimOnline(args, cwd, binDir, extraEnv)` — injects env so `ghExec` routes through mock
- Shims can intercept `issue edit --remove-label` by checking `a.includes('issue edit') && a.includes('remove-label')`
- Sink-merge's `ghExec` does NOT support `KAOLA_GH_MOCK_SCRIPT` — sink-merge label removal tests must use OFFLINE mode or structural refactoring

## Key Files

| File | Role |
|------|------|
| `scripts/kaola-workflow-claim.js` | `clearAdvisoryClaim` L347, `cmdFinalize` L570, `cmdWatchPr` L833, `checkClosureInvariants` L549 |
| `scripts/kaola-workflow-active-folders.js` | `readActiveFolders`, `field()` helper, `issueIsClosed` |
| `scripts/kaola-workflow-closure-contract.js` | `claim_label_removed` enum, `in-progress-label-removed` invariant |
| `scripts/kaola-workflow-sink-merge.js` | `postMergeCleanup` L228, ghExec (no mock support) |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | `clearAdvisoryClaim` L297, `cmdFinalize` L572, watcher L824 |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | `clearAdvisoryClaim` L298, `cmdFinalize` L557, watcher L809 |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | Two label removal call sites L148, L263 |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` | Two label removal call sites L148, L263 |
| `scripts/simulate-workflow-walkthrough.js` | Test framework; no existing label-operation tests |
| `docs/api.md` | Already lists `claim_label_removed` enum; validators check for it |
