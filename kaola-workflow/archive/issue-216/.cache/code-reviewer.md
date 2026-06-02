# Code Review — issue-216: sink-merge archive-safety guard

## Summary: WARNING — 1 HIGH finding

## Findings

### [HIGH] Archived-path skips `git reset --hard origin/main`, leaving local `main` poisoned with no downstream recovery

**File**: `scripts/kaola-workflow-sink-merge.js:215-219` (and byte-identical plugins copy)

By the time the guard runs, `ffMergeLoop` has already FF-merged the feature branch onto local `main` (merge at line 180, HEAD on main from line 163). The non-archived exit-3 path runs `git reset --hard origin/main` (line 221) specifically to roll back that un-pushable local commit. The new archived branch returns at line 218 BEFORE that reset.

**Effect:** Local `main` is left 1 commit ahead of `origin/main` (empirically confirmed: `rev-list --count origin/main..main` = 1). The leftover commit is un-pushable by construction. The PR-sink fallback chain (`phase6:651-662`: `sink-fallback → sink-pr → exit`) contains no `git reset --hard` in any of `kaola-workflow-sink-pr.js` or `kaola-workflow-claim.js`. The poisoned local main is never reconciled. When `origin/main` advances (PR merged), the next `sink-merge` of ANY project runs `git pull --ff-only` at line 158 and exits 128 ("cannot fast-forward on divergent branch"), bricking sink-merges repo-wide.

**Note on reviewer's suggested fix:** Reviewer suggested a pre-merge early-exit after `assertNoLiveWorkflowFolder`. This was empirically tested during Phase 4 and confirmed to fire on EVERY normal finalize→sink-merge flow (the archive is always on disk post-checkout after finalize), breaking `testE2EGitHubMergeFullChain`. That approach is not viable.

**Candidate fix not evaluated by reviewer:** Replace `git checkout main` (no-op) with `git reset --mixed origin/main`. This would:
1. Move HEAD back to origin/main (restoring local main) 
2. Keep working tree changes (archive files stay on disk as untracked)
3. Satisfy test assertion: `fs.existsSync(archiveDir)` still true (files on disk)

### [LOW] `git checkout main` inside guard is a no-op

`postMergeCleanup` is only reachable after `ffMergeLoop` returns true, which only runs via `git merge --ff-only` while HEAD is on main (line 163). HEAD is always already on main at the catch. Harmless but redundant.

### [LOW] Pre-existing stale file in working tree

`kaola-workflow/archive/issue-219/phase6-summary.md` (pre-existing `M`) must not be included in the #216 commit.

## Notes (no action required)

- Security: CLEAN (no CRITICAL/HIGH/MEDIUM per security-reviewer)
- `!exists(live) && exists(archive)` AND logic: correct — matches canonical GitLab #108 pattern
- Naming, immutability, no debug statements: all clean
- `postMergeCleanup` is 81 lines (pre-existing overrun; 7-line guard does not materially change it)
- `archiveProjectDir` local var does not shadow the import from `claim.js` (not imported here)

## Verdict: WARNING — HIGH must be resolved before merge
