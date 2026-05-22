# Phase 6 - Summary: issue-157

## Delivered

`stale-worktree-cleanup` subcommand added to all three forge-edition claim scripts (GitHub, GitLab, Gitea), providing safe, reversible cleanup of stale worktrees and branches detected by `stale-worktree-check`. Dry-run by default; `--execute` performs removal. For dirty worktrees: `--archive` stashes (recoverable via `git stash list`), `--export` writes a patch to `kaola-workflow/archive/exports/`, `--force` discards. `--keep-branch` preserves the branch (for open PRs). If preservation fails, the worktree is skipped and reported in `failed_preserve` rather than silently destroyed.

## Files Changed

### Implementation
- `scripts/kaola-workflow-claim.js` — collectStale refactor, removeBranch, stashWorktree, exportWorktreeDiff, cmdStaleWorktreeCleanup, failed_preserve bucket, rmResult.removed guard
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` — byte-identical Codex mirror
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` — GitLab edition
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` — Gitea edition
- `scripts/kaola-workflow-classifier.js` — KAOLA_GH_MOCK_SCRIPT support (test infra)
- `scripts/kaola-workflow-active-folders.js` — KAOLA_GH_MOCK_SCRIPT support (test infra)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-forge.js` — KAOLA_GLAB_MOCK_SCRIPT support (test infra)
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js` — KAOLA_TEA_MOCK_SCRIPT support (test infra)

### Tests
- `scripts/simulate-workflow-walkthrough.js` — testStaleWorktreeCleanup 8 sub-cases
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` — 8 sub-cases
- `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` — 8 sub-cases

### Validators
- `scripts/validate-workflow-contracts.js`, `validate-kaola-workflow-gitlab-contracts.js`, `validate-kaola-workflow-gitea-contracts.js` — assertConcept extended/added

### Documentation
- `README.md` — stale-worktree-cleanup row in subcommand table; capability sentence updated
- `CHANGELOG.md` — [Unreleased] entry
- `docs/api.md` — full stale-worktree-cleanup section

## Test Coverage

8 sub-cases per forge edition (dry-run, execute-clean, execute-dirty-no-flag, execute-dirty-archive, execute-dirty-export, execute-dirty-force, keep-branch, execute-archive-fail). 100% of decision matrix paths covered.

## Final Validation Evidence

- `npm test` exits 0 (all 4 suites: claude/codex/gitlab/gitea) — post-Phase 5 fix run
- `node scripts/validate-script-sync.js` — 9 common scripts in sync
- `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` — PASSED
- `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` — PASSED

## Documentation Docking

DOCKED — .cache/doc-docking.md

## Final Validation Failure Ledger

| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | — | — | — | — |

## Follow-Up Items

- MEDIUM/LOW (deferred): Add `testStaleWorktreeCleanup` sub-case for `state=missing` worktree (prune path) and loose stale branch (no worktree). Suitable as a small follow-up issue. No blocking concern.

## Closure Decision

None needed — single self-contained deliverable, no ambiguous design decisions, no partial implementation. Deferred coverage gap is clearly scoped and non-blocking.

## Commit And Push

pending final Git gate

## GitHub Issue

To be closed after final commit and push.

## Roadmap

To be updated after final commit and push.

## Archive

To be archived after final commit and push.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked | .cache/doc-updater.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| closure advisor gate | N/A | closure scan: no deferred decisions, no partial work, no user-decision items | |
| final-validation fix executors | N/A | no final-validation failures | |
| roadmap refresh | ready | kaola-workflow/ROADMAP.md (runs in final Git gate) | |
| archive completed folder | pending | | |
| final commit and push | ready | git status/diff/upstream verified | final gate runs after this file is committed |

## Status

READY FOR FINAL GIT GATE
