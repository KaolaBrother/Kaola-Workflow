# Advisor — Plan Gate (issue-157)

## Verdict

Blueprint is largely sound but has ONE load-bearing claim that must be empirically verified before committing, plus two signature mismatches to confirm.

## Critical: wrapper-claim conflict (BLOCKS)

Phase 1 says: "GitLab/Gitea standalone test files are NOT in npm test — cleanup tests must go in the simulate files."
Architect says: simulate-*.js is "a 90-line wrapper that only calls `run('test-gitlab-workflow-scripts.js')`" — so put tests in the standalone file.

These can't both be right. Must verify before locking in T5a/T5b file placement:
```bash
head -100 plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js
grep -n "test-gitlab-workflow-scripts" plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js
grep -rn "simulate-gitlab-workflow-walkthrough\|test-gitlab-workflow-scripts" package.json
```

## Signature mismatches to confirm

1. `removeWorktree` call shape — Phase 1 says `(root, project, folder)` but architect calls it `(root, 'issue-N', { worktree_path: wt.path })`. Read `claim.js:140` to confirm actual signature before T1.

2. `wt.issue_number` field — confirm `collectStale` entries carry this field (or add it via `extractIssueNumber`).

## Lesser concerns (decide explicitly in phase3-plan.md)

3. `cwdInside` refuses entire run — acceptable (loud beats silent partial), but make explicit.
4. `state === 'missing'` — does `git worktree remove --force` succeed when path is gone? May need `git worktree prune`. Add note or test case.
5. README stash recoverability claim — tighten or omit "recoverable from any worktree."
6. Exports timestamp — match existing `archiveProjectDir` pattern for consistency.

## Process

Wrapper-claim must be resolved before writing phase3-plan.md. Verify first; if wrapper confirmed → proceed without architect revision. If wrapper wrong → architect revision for T5a/T5b.
