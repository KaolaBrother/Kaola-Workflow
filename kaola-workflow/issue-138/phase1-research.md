# Phase 1 - Research / Discovery: issue-138

## Deliverable

A `stale-worktree-check` subcommand in `scripts/kaola-workflow-claim.js` that reports stale workflow worktrees and local `workflow/issue-*` branches whose issues are closed or archived. The command distinguishes clean removable worktrees from dirty worktrees with untracked or modified files. Skipped (returns `{ skipped: 'offline' }`) when `KAOLA_WORKFLOW_OFFLINE=1`.

## Why

Completed workflow worktrees and branches remain registered after issue closure, making it harder to tell what work is active and risking accidental edits in abandoned trees. A safe check command gives operators a clean list of what can be removed, with per-worktree dirty/clean status.

## Affected Area

- `scripts/kaola-workflow-claim.js` — add `cmdStaleWorktreeCheck()` function and register in `main()` dispatch + usage string
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` — plugin sync copy (must remain byte-identical per validate-workflow-contracts.js line 193)
- `scripts/simulate-workflow-walkthrough.js` — test coverage (`testStaleWorktreeCheck`)
- `scripts/validate-workflow-contracts.js` — register new test name under `assertConcept`

## Key Patterns Found

1. **Drift detection**: `cmdStatus()` at `claim.js:501–514` — calls `issueIsClosed` per folder, splits results into `active` vs `drift`. Mirror this pattern for worktrees.
2. **Worktree enumeration**: `listWorkflowWorktrees(root)` at `claim.js:528–543` — parses `git worktree list --porcelain`, returns objects with `{path, head, branch}`.
3. **Dirty check pattern**: `assertCleanWorktree` in `sink-merge.js:64` — `git -C <path> status --porcelain`. Per-worktree dirty check: run same command per worktree path.
4. **OFFLINE pattern**: `const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1'`. When offline, return `{ skipped: 'offline' }` — same as `validate-remote` in `kaola-workflow-roadmap.js`.
5. **Plugin sync**: `validate-workflow-contracts.js:193` asserts `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` is byte-identical to `scripts/kaola-workflow-claim.js`. Copy required after every edit.
6. **Test pattern**: `testStatusShowsClosedIssueDrift` at `simulate-workflow-walkthrough.js:899` — most relevant test to mirror. Uses `writeGhShimForStartup` + `runClaimOnline` + `plantActiveFolder`.

## Test Patterns

- Framework: hand-rolled `assert` in `simulate-workflow-walkthrough.js`
- Location: `scripts/simulate-workflow-walkthrough.js`
- Structure: `initGitRepo` + `writeGhShimForStartup` (with `state: closed` for stale issues) + `runClaimOnline` + assert output JSON
- New test name: `testStaleWorktreeCheck`
- Register in: `validate-workflow-contracts.js` `assertConcept` for `simulate-workflow-walkthrough.js`

## Config & Env

- `KAOLA_WORKFLOW_OFFLINE=1` — skip all GitHub API calls; return `{ skipped: 'offline' }`
- No new env vars needed

## External Docs

None required — all git primitives and GitHub CLI are already well-known in this codebase.

## GitHub Issue

KaolaBrother/Kaola-Workflow#138

## Completeness Score

10/10

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | | Internal scripts only; no external library/API behavior needed |

## Notes / Future Considerations

- The AC mentions "documents [check] as a required post-close hygiene step" — if full automation is too complex, documenting it in CHANGELOG/docs satisfies this AC item
- Optional: `--fix` flag to actually remove clean stale worktrees (but AC says "check command" so reporting is the primary deliverable)
- The issue mentions non-git `.kw` directories (e.g. `issue-63.kw`) — these are outside the `git worktree list` registry so are filesystem-only artifacts; the check can optionally scan for those too
