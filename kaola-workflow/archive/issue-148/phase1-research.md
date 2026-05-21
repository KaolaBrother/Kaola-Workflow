# Phase 1 - Research / Discovery: issue-148

## Deliverable
Either (a) implement `stale-worktree-check` subcommand for the GitLab and Gitea claim scripts with forge-appropriate branch patterns and `issueIsClosed` usage, or (b) narrow `docs/api.md` to document `stale-worktree-check` as GitHub-only. Option (a) must include tests covering stale worktrees, stale branches, and offline mode.

## Why
GitLab and Gitea users have no equivalent command for detecting stale workflow worktrees/branches. The API docs incorrectly claim all three forges support this. Fixing the gap ensures either feature parity or accurate documentation.

## Affected Area
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` — add cmdStaleWorktreeCheck + dispatch + usage string
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` — same
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` — add stale-worktree-check tests
- `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` — add stale-worktree-check tests
- `docs/api.md` — update stale detection docs (either add GL/GT invocation or narrow to GitHub-only)

(If doc-only, only `docs/api.md` is affected.)

## Key Patterns Found
1. GitHub `cmdStaleWorktreeCheck` at `scripts/kaola-workflow-claim.js:566-623` — reference implementation; uses `listWorkflowWorktrees`, `issueIsClosed`, `worktreeDirtyState`, `git for-each-ref`
2. GitLab branch prefix: `workflow/gitlab-issue-(\d+)` — `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js:523`
3. Gitea branch prefix: `workflow/gitea-issue-(\d+)` — `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:508`
4. `issueIsClosed` already imported in both GL/GT claim scripts (from their active-folders modules, which use forge-specific `viewIssue` instead of `gh` CLI) — no additional forge API needed
5. New subcommand pattern: define `cmdXxx()`, add dispatch `if (sub === 'stale-worktree-check') return cmdStaleWorktreeCheck();`, update usage string — `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js:615-631`
6. Docs overstatement: `docs/api.md:198-202` and `265-272` claim GitHub/GitLab/Gitea support; invocation example only shows GitHub script

## Test Patterns
- Framework: hand-rolled assert (no test framework)
- Location: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`, `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- Structure: direct `require()` of claim module + `withForge(stubs, fn)` for forge stubs; `tempRoot()` for temp dirs; run validation with `node <scriptPath> stale-worktree-check` via `spawnSync`
- GitHub test reference: `scripts/simulate-workflow-walkthrough.js:927-1091` — 6 sub-cases; forge-specific tests would use `withForge` stub for `viewIssue` instead of a `gh` shim

## Config & Env
- `KAOLA_WORKFLOW_OFFLINE=1` — skips API calls; stale detection falls back to archive-only check
- No new env vars needed

## External Docs
None.

## GitHub Issue
KaolaBrother/Kaola-Workflow#148

## Completeness Score
10/10

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | .cache/docs-lookup.md | all internal patterns |

## Notes / Future Considerations
- The implementation option (a) is structurally similar to issue #147 (adding parity between GitHub and the two plugin editions) — the same parallelization pattern applies (GL-1/GT-1 roadmap modules, etc. → here GL-1/GT-1 claim scripts + GL-2/GT-2 tests)
- Doc-only option (b) is lower risk but does not close the feature gap
- Issue text says "If implemented, tests should cover stale worktrees and stale local branches for the GitLab/Gitea branch patterns, including offline archive-only detection" — strongly implies implementation is preferred
