# TDD Task 1 — Write failing regression test (RED gate)

## Result: RED CONFIRMED

**File modified:** `scripts/simulate-workflow-walkthrough.js`
**Test function:** `testSinkMergeSkipsArchivedProjectPhantom()`
**Placement:** After `testSinkMergeCloseFailureWarning` function body, registered in run list after `testSinkMergeCloseFailureWarning()` call (~line 4388 post-insert).

## RED Evidence

```
Error: phantom folder must NOT exist after merge-impossible on archived project, but got: /private/tmp/claude-501/kw-sm-phantom-uSyUJ9/kaola-workflow/issue-850
    at assert (scripts/simulate-workflow-walkthrough.js:21:25)
    at testSinkMergeSkipsArchivedProjectPhantom (scripts/simulate-workflow-walkthrough.js:3711:5)
```

Fails on `!fs.existsSync(liveDir)` — the primary phantom-folder discriminator. Exit status 3 was confirmed before the failing assertion (exit code 3 is not the discriminator, as required).

## Test structure

1. `initGitRepoWithBareRemote(tmp)` — real git repo with origin/main
2. Feature branch `workflow/issue-850` created; archive committed on it directly (no live folder created on main/origin)
3. Hard gates verified: `git cat-file -e workflow/issue-850:kaola-workflow/archive/issue-850/...` succeeds; live path absent
4. Returned to `main`; origin/main is pre-archive
5. `spawnSync` sink-merge with `OFFLINE: '0'` + `FORCE_MERGE_IMPOSSIBLE: 'branch_protected'`
6. Assertions: status 3, !exists(liveDir), !exists(receipt), exists(archive), HEAD==main, stderr includes "project archived"

## Deviation from plan

Created archive directly on feature branch (no live folder committed to main first). This is the plan's "fall back to direct git commands" option and avoids the untracked-file false-RED trap.

## Validation output

`node scripts/simulate-workflow-walkthrough.js` → FAILS at `testSinkMergeSkipsArchivedProjectPhantom` with phantom-folder assertion. All prior tests PASS.
