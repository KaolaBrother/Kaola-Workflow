# Advisor — Ideation Gate (issue-157)

## Verdict

Approach A is correct. Gap 2 (--archive doesn't salvage uncommitted code) is the load-bearing decision.

## Guidance

### 1. --archive/--export semantics (MUST resolve in Phase 3)

Recommended design:
- `--archive`: `git -C <wt> stash push -u -m "kaola-cleanup-issue-N"` BEFORE `archiveProjectDir` + `removeWorktree`. Stash stays in repo, recoverable via `git stash list`.
- `--export`: `git -C <wt> diff HEAD > kaola-workflow/archive/exports/issue-N-<ts>.patch` (cached diff saved to file).
- `--force`: discards both, removes immediately.

Alternative: rename `--archive` to `--archive-metadata` (clearly limited), make `--export` do the stash. Less ergonomic but more honest.

Either way: AC says "safe cleanup of dirty worktrees." `--archive` must either stash first or be renamed to not promise code salvage.

### 2. Gap 3 (all 3 per-edition validators): extend symmetrically — confirmed.

### 3. Gap 4 (Codex simulate): don't duplicate coverage. Cleanup function is byte-identical via sync; codex simulate tests the codex runtime, not cleanup logic. Document explicitly in phase3-plan.md.

### 4. Gap 5 (4 usage strings + 4 dispatch tables): put on architect's checklist as discrete sub-items.

### 5. Additional items (planner didn't flag)

- `--keep-branch` option: user may want to remove worktree but keep branch (PR under review). Without it, --execute always deletes both.
- Branch deletion safety: only branches from cmdStaleWorktreeCheck's stale_branches set OR branches whose worktree was removed in this run. Sanity-check: no registered worktree before `git branch -D`.

### 6. Implementation order

GitHub canonical → cp to Codex mirror (sync gate) → GitLab independent → Gitea independent → tests in each simulate file → contract validator extension in each edition → README. ~10 files; inherent cost of multi-forge architecture.

### 7. Out of scope

- No refactor to extract shared cleanup module
- No fix to pre-existing GitLab/Gitea stale-worktree-check standalone test gap (cleanup tests in simulate files will close it as a side effect)
- No new live-git assertions in validate-workflow-contracts.js
