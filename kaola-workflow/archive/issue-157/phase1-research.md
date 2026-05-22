# Phase 1 - Research / Discovery: issue-157

## Deliverable

A `stale-worktree-cleanup` subcommand (dry-run by default) in all three forge-edition claim scripts, plus regression tests and a README/documentation surface, so users have a safe guided path to remove stale workflow worktrees and branches after `stale-worktree-check` detects them.

## Why

`stale-worktree-check` correctly detects stale state but leaves remediation manual and easy to get wrong — especially for dirty stale worktrees where uncommitted work can be silently destroyed.

## Affected Area

| File | Role |
|------|------|
| `scripts/kaola-workflow-claim.js` | GitHub edition — add `cmdStaleWorktreeCleanup`, `removeBranch` helper, flag parsing, dispatch |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Codex mirror — must be byte-identical to above (validate-script-sync.js enforced) |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | GitLab edition — parallel implementation, `workflow/gitlab-issue-N` branch pattern |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | Gitea edition — parallel implementation, `workflow/gitea-issue-N` branch pattern |
| `scripts/simulate-workflow-walkthrough.js` | GitHub test suite — add `testStaleWorktreeCleanup` |
| `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` | GitLab test suite — add cleanup test (currently no stale-worktree coverage in npm test) |
| `plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js` | Gitea test suite — add cleanup test (currently no stale-worktree coverage in npm test) |
| `scripts/validate-workflow-contracts.js` | Extend assertConcept block to require `testStaleWorktreeCleanup` and `dry_run` in simulate file |
| `README.md` | Document `stale-worktree-cleanup` subcommand and usage |

## Key Patterns Found

1. **Stale detection pattern** — `cmdStaleWorktreeCheck` at `scripts/kaola-workflow-claim.js:577`; returns `{ stale_worktrees, stale_branches }` with per-entry `state: 'clean'|'dirty'|'missing'`
2. **Safe worktree removal** — `removeWorktree(root, project, folder)` at `kaola-workflow-claim.js:140`; `git worktree remove --force`
3. **Dirty-worktree salvage** — `archiveProjectDir(root, project, statusValue, suffix)` at `kaola-workflow-claim.js:440`; renames to archive/; used by `cmdRelease` as the "preserve uncommitted work" path
4. **CWD safety guard** — `cwdInside(target)` at `kaola-workflow-claim.js:510`; refuses to operate on CWD; must be replicated in cleanup
5. **Flag parsing pattern** — `--force`, `--keep-worktree` boolean flags at `kaola-workflow-claim.js:31`; extend with `--execute`, `--archive`
6. **Exported helper for tests** — `partitionActiveAndDrift` pattern in GitLab:532, Gitea:517; export `cleanupStaleWorktrees` similarly

## Test Patterns

- Framework: hand-rolled assert, no test framework (Node.js only)
- Location: `scripts/simulate-workflow-walkthrough.js` (GitHub); `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` (GitLab); `plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js` (Gitea)
- Structure: `function testXxx(root, assert) { ... }` called from `runAll()` at end of file; sub-cases use `tmp` dirs created inline with `fs.mkdirSync`
- GitLab/Gitea standalone test files (`test-gitlab-workflow-scripts.js`, `test-gitea-workflow-scripts.js`) are NOT in npm test — cleanup tests must go in the simulate files

## Config & Env

- `KAOLA_WORKFLOW_OFFLINE=1` — disables `issueIsClosed()` calls; cleanup must respect this (same guard as `cmdStaleWorktreeCheck`)
- No other relevant flags

## External Docs

N/A — internal patterns sufficient; git commands (`git worktree remove`, `git branch -D`) have stable well-known interfaces.

## GitHub Issue

KaolaBrother/Kaola-Workflow#157

## Completeness Score

9/10

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | .cache/docs-lookup.md | internal patterns sufficient; git commands have stable well-known interfaces |

## Notes / Future Considerations

- Pre-existing gap: GitLab/Gitea `testStaleWorktreeCheck` tests exist in standalone test files not in npm test pipeline. Cleanup tests will be added to simulate files (fixing the gap). The standalone test files may be left as-is (not removing them is safe).
- Dry-run default design: output `{ would_remove, would_delete_branch, dry_run: true }` without `--execute`; act only with `--execute`. This is safer than an `--dry-run` flag (opt-in to execute is safer than opt-out of dry-run).
- Dirty worktree options: `--archive` (call `archiveProjectDir`) or `--force` (remove without archiving); without either, skip dirty worktrees with a message.
