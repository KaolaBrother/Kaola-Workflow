# Planner — issue-157

## Recommendation: Approach A (subcommand, dry-run default)

Approaches B (docs-only) and C (execute-default) are eliminated by AC:
- C: violates "dry-run by default" AC directly
- B: cannot satisfy "regression coverage for cleanup/dry-run behavior" AC

## Four Gaps in Approach A

### Gap 1/2 (BLOCKER): `--archive` does NOT salvage dirty git changes
`archiveProjectDir` (claim.js:440-481) only renames `kaola-workflow/{project}/` metadata folder. It never touches the worktree's working tree. `removeWorktree` (`:140`) then runs `git worktree remove --force` destroying uncommitted code.

**Decision required**: the "safe" dirty-worktree path needs a genuine code-salvage step.
- `--archive`: preserve workflow metadata only (honest but limited)
- `--export`: genuine salvage — `git -C <wt> diff > <export-dir>/issue-N.patch` or `git -C <wt> stash` before removal
- `--force`: remove and discard (honest destructive path)

### Gap 3: All 3 per-edition contract validators, not just GitHub
GitLab validator (`validate-kaola-workflow-gitlab-contracts.js:69`) uses assertConcept and references simulate-gitlab-workflow-walkthrough.js. Gitea has parallel. All three need extending with cleanup test terms.

### Gap 4: Decision on Codex simulate file
`plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` runs in `test:kaola-workflow:codex` npm test. Cleanup function is byte-identical via sync, but simulate file is separate. Must explicitly decide: add cleanup test there or document why GitHub suite covers it.

### Gap 5: Four usage:/dispatch table edits (easy to miss)
All four claim scripts (GitHub, Codex-mirror, GitLab, Gitea) need `stale-worktree-cleanup` in `usage:` string AND `main()` dispatch chain. Missing any = lying error message.

## Explicit NOT to build
- No execute-default (inverts dry-run AC)
- No live-git assertions in validate-workflow-contracts.js (contract guards via assertConcept only)
- No arbitrary `git branch -D` — only branches from cmdStaleWorktreeCheck stale classification, behind --execute
- No changes to standalone test-gitlab/gitea-workflow-scripts.js (not in npm test)

## Missing Facts to Resolve
1. `--export` semantics: what does "export" mean operationally? Recommended: `git diff` snapshot to known location before removal
2. Whether `--archive` should be renamed to avoid implying code salvage
3. `--execute` + dirty worktree interaction: does `--execute` alone skip dirty (printing message), requiring `--force`/`--archive`/`--export`?
