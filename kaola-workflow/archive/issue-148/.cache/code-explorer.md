# Code Explorer — issue-148

## GitHub Reference Implementation

`cmdStaleWorktreeCheck()` at `scripts/kaola-workflow-claim.js:566-623`:
1. Builds `activeSet` from `readActiveFolders` (issue_number values)
2. Calls `listWorkflowWorktrees(root)` which filters `git worktree list --porcelain` for `workflow/issue-` prefix
3. For each worktree entry: checks `isArchived` (archive folder exists), calls `issueIsClosed(issueNumber)` (uses `gh issue view <N> --json state`), applies `worktreeDirtyState` 
4. Runs `git for-each-ref refs/heads/workflow/` for loose branches without worktrees
5. Returns JSON `{ stale_worktrees, stale_branches, active_worktrees, count }`

Dispatch at `scripts/kaola-workflow-claim.js:707`: `if (sub === 'stale-worktree-check') return cmdStaleWorktreeCheck();`
Usage string updated at line 696.
NOT exported.

## GitLab/Gitea Command Lists (stale-worktree-check ABSENT)

**GitLab** `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js:617`:
`claim|release|status|patch-branch|bootstrap|startup|finalize|pick-next|resume|worktree-status|worktree-finalize|sink-fallback|watch-mr`
No `stale-worktree-check`.

**Gitea** `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:602`:
`claim|release|status|patch-branch|bootstrap|startup|finalize|pick-next|resume|worktree-status|worktree-finalize|sink-fallback|watch-pr`
No `stale-worktree-check`.

## Docs Claims (overstated)

`docs/api.md:198-202`: Section "Stale Worktree Detection" says stale check uses "GitHub/GitLab/Gitea API". Invocation example only shows `node scripts/kaola-workflow-claim.js stale-worktree-check`.

`docs/api.md:265-272`: Steps 4 and offline mode both say "GitHub/GitLab/Gitea API calls".

Docs unambiguously claim all three forges support stale detection, but only GitHub implements it.

## Forge API for Implementation

**GitLab** — `kaola-gitlab-forge.js` exports `viewIssue` (state field). `issueIsClosed` in `kaola-gitlab-workflow-active-folders.js` already uses it. Already imported by claim script.
**Gitea** — `kaola-gitea-forge.js` exports `viewIssue`. `issueIsClosed` in `kaola-gitea-workflow-active-folders.js` already uses it. Already imported by claim script.

No additional forge API needed for either edition.

## Key Difference: Branch Name Prefixes

- GitHub: `workflow/issue-(\d+)` — `listWorkflowWorktrees` filter at `scripts/kaola-workflow-claim.js:544-558`
- **GitLab: `workflow/gitlab-issue-(\d+)`** — filter at `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js:523`
- **Gitea: `workflow/gitea-issue-(\d+)`** — filter at `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:508`

Any implementation must use these forge-specific patterns for both `listWorkflowWorktrees` and the loose-branch `git for-each-ref` scan.

## Test Patterns

`testStaleWorktreeCheck()` at `scripts/simulate-workflow-walkthrough.js:927-1091`. GitHub only.

Helpers:
- `writeGhShimForStale(binDir)` (line 929-944): writes a `binDir/gh` shim mapping issue numbers 100-500 to open/closed/open/closed/open
- `plantActiveFolder(root, project, issueNumber)` (line 258-276): writes minimal `workflow-state.md` with `issue_number: N`
- `initGitRepo(tmp)` (line 387-394): `git init -b main` + initial commit
- `runClaimOnline(args, cwd, binDir)` (line 405-420): spawns claim script with custom PATH for `gh` shim
- `runNode(claimScript, args, cwd)` (line 21-29): spawns with OFFLINE=1

6 sub-cases: closed worktree stale, archived worktree stale, open+active not stale, deleted-dir state:missing, loose branch stale, offline+archive stale.

GitLab/Gitea tests would use `runNode([claimScript, 'stale-worktree-check'], root)` (no `gh` shim needed — forge-specific `issueIsClosed` uses the forge API or OFFLINE path, not `gh`). The `forgeStub` pattern from `withForge(...)` in the test files can substitute `viewIssue`.

## New Subcommand Convention

1. Define `cmdStaleWorktreeCheck()` after last `cmd*` function (around line 561 for GitLab, line 547 for Gitea)
2. Add dispatch: `if (sub === 'stale-worktree-check') return cmdStaleWorktreeCheck();`
3. Update usage string to include `stale-worktree-check`
