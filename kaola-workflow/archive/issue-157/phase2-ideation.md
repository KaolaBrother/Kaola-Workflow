# Phase 2 - Ideation: issue-157

## Approaches Evaluated

### Option A: Subcommand with dry-run default
- Summary: Add `stale-worktree-cleanup` subcommand to all 3 forge editions. Dry-run by default; `--execute` opts in to actual destructive action. Dirty worktrees require an explicit flag (`--archive`, `--export`, or `--force`) to proceed.
- Pros: Satisfies all ACs; safe by default; extensible; natural complement to existing `stale-worktree-check`; tests can cover dry-run and execute paths independently
- Cons: ~10 files to touch across 4 claim scripts + 3 simulate files + 3 validators + README; Codex mirror adds a cp step
- Risk: Low
- Complexity: Medium

### Option B: Docs/README only
- Summary: Document manual cleanup steps in README; no code changes.
- Pros: Zero code risk; trivially fast
- Cons: Fails AC "regression coverage for cleanup/dry-run behavior"; cannot satisfy "safe guided path" AC; manual steps still silently destroy dirty worktrees
- Risk: High (AC non-compliance)
- Complexity: Small

### Option C: Execute-default with --dry-run opt-out
- Summary: Execute cleanup by default; add `--dry-run` flag to preview.
- Pros: Fewer flags
- Cons: Directly violates "dry-run by default" AC; destructive default unacceptable for cleanup of potentially dirty worktrees
- Risk: High (AC violation)
- Complexity: Small

## Advisor Findings

Approach A confirmed. Key advisor-resolved decisions:

### --archive / --export / --force flag semantics (Gap 2 resolved)

`archiveProjectDir` only renames the `kaola-workflow/{project}/` metadata folder; it never touches the worktree working tree. `removeWorktree` calls `git worktree remove --force`, destroying uncommitted code. Therefore the "safe dirty-worktree path" requires a genuine code-salvage step:

- `--archive`: `git -C <wt> stash push -u -m "kaola-cleanup-issue-N"` BEFORE `archiveProjectDir` + `removeWorktree`. Stash stays in repo; recoverable via `git stash list`. This is the true preserve-and-remove path.
- `--export`: `git -C <wt> diff HEAD > kaola-workflow/archive/exports/issue-N-<ts>.patch` (cached diff saved to file), then `removeWorktree`. Patch is a lightweight snapshot.
- `--force`: discard both stash and metadata, remove worktree immediately. Honest destructive path.
- Without `--archive`, `--export`, or `--force`: skip dirty worktrees entirely (print message), remove only clean/missing ones.

### Additional flags

- `--execute`: required to actually act; dry-run default without it.
- `--keep-branch`: remove worktree but keep branch (for PRs under review or branches with upstream tracking). Without this flag, `--execute` removes both worktree and branch.

### Branch deletion safety

Only delete branches from `cmdStaleWorktreeCheck`'s `stale_branches` set OR branches whose worktree was removed in the current run. Sanity-check: verify no registered worktree exists before `git branch -D`.

### Codex simulate (Gap 4 resolved)

`plugins/kaola-workflow/scripts/kaola-workflow-claim.js` is byte-identical via sync (`validate-script-sync.js` enforced). Cleanup function in the Codex simulate file would test the same logic already covered by GitHub simulate. Do NOT add a duplicate cleanup test in Codex simulate; document this explicitly in phase3-plan.md.

### All 3 per-edition validators (Gap 3)

Extend all three: `scripts/validate-workflow-contracts.js`, `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`, and `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` with `assertConcept` terms for `testStaleWorktreeCleanup` and `dry_run`.

### Usage strings and dispatch tables (Gap 5)

All four claim scripts need `stale-worktree-cleanup` in `usage:` string AND `main()` dispatch chain. Missing any = lying error message.

## Selected Approach

**Option A: Subcommand with dry-run default**

Rationale: Only approach that satisfies all ACs. The advisor confirmed the design with explicit flag semantics. The `--archive` stash-first pattern is the critical safety decision — without it, `--archive` would silently destroy uncommitted code.

## Out of Scope (explicit)

- No refactor to extract a shared cleanup module across forge editions
- No fix to pre-existing GitLab/Gitea stale-worktree-check gap in standalone test files (cleanup tests in simulate files close the gap as a side effect)
- No live-git assertions in `validate-workflow-contracts.js` (assertConcept only)
- No execute-default behavior
- No arbitrary `git branch -D` — only branches from `cmdStaleWorktreeCheck` stale classification, behind `--execute`

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
