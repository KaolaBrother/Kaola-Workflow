# Code Explorer Output: issue-138

## Entry Points

- `kaola-workflow-claim.js worktree-status` (line 545): Lists registered `workflow/issue-*` worktrees via `git worktree list --porcelain` — no closedness check
- `cmdStatus` (line 501): Detects "drift" folders (active folders whose issue is closed) — doesn't check git worktree registry or local branches
- No stale cleanup/check command exists — gap is exactly what this issue requests

## Worktree Lifecycle

1. **Provision**: `claimProject` → `provisionWorktree` (line 163) → `git worktree add` (line 170/175). Path: `worktreePathFor(root, project)` = `path.join(path.dirname(mainRoot), path.basename(mainRoot) + '.kw', project)`.
2. **Check registered**: `worktreeRegistered(root, wtPath)` (line 154) — scans `git worktree list --porcelain`.
3. **Remove**: `removeWorktree(root, project, folder)` (line 122) — `git worktree remove --force`. Called from cmdFinalize, cmdRelease, cmdWatchPr, sink-merge Step 0.
4. **`worktree-status`** (line 545): outputs `listWorkflowWorktrees(root)` result — registered `workflow/issue-*` worktrees.
5. **`worktree-finalize`** (line 560): copies active folder into linked worktree — does NOT remove.

## Key Functions

| Function | File | Lines | Purpose |
|----------|------|--------|---------|
| `worktreePathFor(root, project)` | claim.js | 117–120 | Computes canonical `.kw` sibling path |
| `removeWorktree(root, project, folder)` | claim.js | 122–134 | git worktree remove --force |
| `worktreeRegistered(root, wtPath)` | claim.js | 154–161 | Checks git worktree list |
| `provisionWorktree(root, project, branch)` | claim.js | 163–181 | Creates worktree |
| `listWorkflowWorktrees(root)` | claim.js | 528–543 | Lists workflow/issue-* from porcelain |
| `cmdWorktreeStatus()` | claim.js | 545–548 | Outputs registered workflow worktrees |
| `cmdFinalize()` | claim.js | 456–481 | Archives; removes worktree unless --keep-worktree |
| `cmdStatus()` drift | claim.js | 501–514 | Splits active folders into active vs drift |
| `issueIsClosed(issueNumber)` | active-folders.js | 38–47 | GitHub API, OFFLINE-safe |
| `main()` dispatch | claim.js | 619–635 | Add new subcommand here |

## New Subcommand Location

Add `cmdStaleWorktreeCheck` in `scripts/kaola-workflow-claim.js`, registered in `main()` after the `worktree-finalize` check at line 632. Also in usage string at line 621.

Mirror `cmdStatus` drift pattern: call `listWorkflowWorktrees(root)` + `git branch --list 'workflow/issue-*'` + `issueIsClosed` per issue number.

Dirty worktree detection: `git -C <wt-path> status --porcelain` per worktree path.

OFFLINE behavior: return `{ skipped: 'offline' }` (same as `validate-remote` in roadmap.js).

## Plugin Sync Requirement

Changes to `scripts/kaola-workflow-claim.js` must be mirrored to `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` — validated by `validate-workflow-contracts.js` line 193.

## Test Patterns

- `testFinalizeReleaseCleansWorktree` (line 590) — worktree cleanup via finalize
- `testSinkMergeFromLinkedWorktree` (line 765) — linked worktree setup pattern
- `testStatusShowsClosedIssueDrift` (line 899) — drift detection (most relevant)
- `initGitRepo`, `writeGhShimForStartup`, `runClaimOnline` — test helpers
- `plantActiveFolder` — helper for creating active folder state
- New test name: `testStaleWorktreeCheck`
- Register in `validate-workflow-contracts.js` under `assertConcept` for `simulate-workflow-walkthrough.js`

## Dependency Chain

- `kaola-workflow-active-folders.js` → `issueIsClosed`, `readActiveFolders`
- `kaola-workflow-claim.js` → imports from active-folders.js for status/drift
