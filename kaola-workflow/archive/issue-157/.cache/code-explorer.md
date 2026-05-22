# Code Explorer: issue-157

## Entry Points

- `stale-worktree-check` subcommand: `node scripts/kaola-workflow-claim.js stale-worktree-check`
- Dispatch at line 718 (GitHub), 739 (GitLab), 724 (Gitea) of respective claim scripts
- No command-file surface yet — script-only, not documented in commands/*.md or README.md

## Existing `cmdStaleWorktreeCheck` Flow

1. `readActiveFolders(root)` → active set
2. `listWorkflowWorktrees(root)` — parses `git worktree list --porcelain`, filters to `workflow/issue-N` branches (GitHub), `workflow/gitlab-issue-N` (GitLab), `workflow/gitea-issue-N` (Gitea)
3. For each: `extractIssueNumber`, `isArchived`, `isClosed`, `inActiveSet`
4. If (closed || archived) && !active → push to `stale_worktrees` with `state: worktreeDirtyState(path)` ('clean', 'dirty', 'missing')
5. Second pass: `git for-each-ref refs/heads/workflow/` → loose `stale_branches`
6. Output: `{ stale_worktrees, stale_branches, active_worktrees, count }` — detects only, no cleanup

## Key Helpers Already Available

| Helper | File:Line | What it does |
|--------|-----------|--------------|
| `worktreeDirtyState(wtPath)` | GitHub claim.js:129 | Returns 'clean'/'dirty'/'missing' |
| `removeWorktree(root, project, folder)` | GitHub claim.js:140 | `git worktree remove --force -- <path>`; swallows failure |
| `archiveProjectDir(root, project, statusValue, suffix)` | GitHub claim.js:440 | Renames folder to archive with status:abandoned — safe "preserve dirty work" path |
| `cwdInside(target)` | GitHub claim.js:510 | Safety guard refusing to operate on CWD |
| `partitionActiveAndDrift` export | GitLab:532, Gitea:517 | Exported helper pattern for in-process unit testing |

## Flag Parsing Precedents

- `--force`, `--keep-worktree`: boolean flags at line 31 GitHub claim.js

## Script Sync Constraint (CRITICAL)

`validate-script-sync.js` enforces byte-identity between:
- `scripts/kaola-workflow-claim.js` ↔ `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (Codex mirror)

GitLab (`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`) and Gitea (`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`) are NOT in the sync set — they are forge-divergent copies.

## Test Locations

| Test | File | Notes |
|------|------|-------|
| `testStaleWorktreeCheck` (GitHub) | `scripts/simulate-workflow-walkthrough.js:1050` | In npm test; 6 sub-cases |
| `testStaleWorktreeCheck` (GitLab) | `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js:1116` | NOT in npm test (pre-existing gap) |
| `testStaleWorktreeCheck` (Gitea) | `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js:1150` | NOT in npm test (pre-existing gap) |
| Framework | hand-rolled assert, no test framework | |

GitLab/Gitea cleanup tests must go in the simulate files (simulate-gitlab-workflow-walkthrough.js / simulate-gitea-workflow-walkthrough.js) to be in npm test.

## Contract Validator

`validate-workflow-contracts.js:237` has an assertConcept block requiring simulate-workflow-walkthrough.js to contain `testStaleWorktreeCheck`, `stale_worktrees`, `stale_branches`. Must extend with `testStaleWorktreeCleanup` and `dry_run`.

## What Must Be Built

1. `cmdStaleWorktreeCleanup` function in GitHub, GitLab, Gitea claim scripts
2. `removeBranch(root, branch)` helper: `git branch -D <branch>`
3. Dry-run mode (default — no `--execute` flag): output what would be deleted; act only when `--execute` passed
4. Dirty-worktree guard: refuse unless `--force` or `--archive`
5. `--execute` / `--force` / `--archive` flag additions to `parseArgs`
6. `main()` dispatch entry in all three editions
7. Documentation in README or commands/workflow-next.md
8. `assertConcept` extension in validate-workflow-contracts.js
9. Tests in simulate-workflow-walkthrough.js (GitHub) + simulate-gitlab/gitea files (GitLab/Gitea)
10. Byte-identical mirror to `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
