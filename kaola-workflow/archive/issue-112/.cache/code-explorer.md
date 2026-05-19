# Code Explorer Output — Issue 112

## Primary Model Files

### `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-mr.js` (184 lines)
- Requires `./kaola-gitlab-forge` (forge adapter).
- `updateStateSinkBlock(stateFile, mrUrl, mrIid)` — writes `sink: mr`, `mr_url`, `mr_iid` into workflow-state.md `## Sink` block.
- `appendSummary(summaryFile, mrUrl, mrIid)` — appends `MR URL:` and `MR IID:` to phase6-summary.md; returns false if parent dir missing (archive guard).
- `findMergeRequestForBranch(branch)` — `forge.listMergeRequests({ state: 'opened' })`, match on `source_branch`.
- `ensureMergeRequest(args, opts)` — git push, find-or-create MR, update state+summary, optional metadata commit+push.
- `mergeMergeRequest(mrIid, args)` — delegates to `forge.mergeMergeRequest(mrIid, opts)`.
- `module.exports`: `appendSummary`, `ensureMergeRequest`, `findMergeRequestForBranch`, `mergeMergeRequest`, `routeMergeRequestState`, `updateStateSinkBlock`.

### `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` (325 lines)
- Requires `./kaola-gitlab-forge`, `./kaola-gitlab-workflow-claim` (for `getCoordRoot`, `readActiveFolders`, `removeWorktree`).
- Env vars: `KAOLA_WORKFLOW_OFFLINE`, `KAOLA_WORKFLOW_FORCE_FF_FAIL`, `KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE`, `KAOLA_WORKFLOW_DEBUG_CWD`.
- `finalValidationPassed(root, project)` — reads `phase6-summary.md` with archive fallback path.
- `resolveProjectFile(root, project, basename)` — live path first, falls back to `kaola-workflow/archive/{project}/{basename}`.
- `closeLinkedIssue(root, project, issueIid, opts)` — `forge.createIssueNote` + `forge.closeIssue`; requires final validation passed first.
- `runDirectMerge(args, opts)` — exit 0=success, 2=FF exhausted, 3=merge-impossible/archived (with `sink-fallback.json`).
- `module.exports`: `classifyMergeError`, `closeLinkedIssue`, `fastForwardMain`, `finalValidationPassed`, `runDirectMerge`.

### `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` (482 lines)
- Framework: Node.js built-in `assert` (no external deps).
- `withForge(stubs, fn)` — monkey-patches live forge module, restores in `finally`.
- 20 test cases: MR reuse, MR create, merge delegation, state routing, archive fallbacks, subprocess exit-2/3/0.

### `plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js` (283 lines)
- Exports: `createPullRequest(opts)`, `listPullRequests(opts)`, `mergePullRequest(project, prNumber, opts)`, `closeIssue(issueNum, opts)`, `createIssueComment(project, issueNum, body, opts)`, `discoverProject()`, `normalizeState`, `normalizePullRequest`, etc.
- `mergePullRequest` signature: TAKES project as first arg (unlike GitLab `mergeMergeRequest(mrIid, opts)`).
- `createIssueComment`: requires project object with `.full_name`.
- No `createIssueNote` — use `createIssueComment`.

## Critical Naming Differences GitLab → Gitea

| GitLab | Gitea |
|--------|-------|
| `mr_iid` | `pr_number` |
| `mr_url`/`web_url` | `pr_url`/`web_url` |
| `createMergeRequest(opts)` | `createPullRequest(opts)` |
| `listMergeRequests(opts)` | `listPullRequests(opts)` |
| `mergeMergeRequest(mrIid, opts)` | `mergePullRequest(project, prNumber, opts)` |
| `forge.createIssueNote(proj, iid, body)` | `forge.createIssueComment(project, issueNum, body, opts)` |
| `sink: mr`, `mr_url`, `mr_iid` | `sink: pr`, `pr_url`, `pr_number` |
| `MR URL:`, `MR IID:` | `PR URL:`, `PR number:` |

## Worktree Helpers

`kaola-gitlab-workflow-sink-merge.js` requires `./kaola-gitlab-workflow-claim` for `getCoordRoot`, `readActiveFolders`, `removeWorktree`. No Gitea claim script exists yet. Issue #112 should require from `../../../scripts/kaola-workflow-claim.js` (GitHub base, forge-agnostic for worktree operations).

## Env Vars

- `KAOLA_WORKFLOW_OFFLINE=1` — skip all network/git calls
- `KAOLA_WORKFLOW_FORCE_FF_FAIL=N` — force N FF failures (test exit-2)
- `KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE=<token>` — force exit-3 path
- `KAOLA_WORKFLOW_DEBUG_CWD=<path>` — write CWD to file on exit
