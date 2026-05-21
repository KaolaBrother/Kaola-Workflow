# Phase 3 - Plan: issue-137

## Blueprint

### Files to Create
None. No new files, no new external dependencies.

### Files to Modify

| File | Changes | Why |
|------|---------|-----|
| `scripts/kaola-workflow-sink-merge.js` | Add `assertBranchPushedToUpstream` function after `assertNoLiveWorkflowFolder`; add call in `main()` after `assertNoLiveWorkflowFolder(mainRoot, args.project);` with `if (!OFFLINE)` wrap | Primary: blocks sink-merge when branch is ahead of upstream |
| `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` | Sync: overwrite byte-for-byte from primary | validate-script-sync.js requires byte-identical |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | Identical function + call in `runDirectMerge()` after `assertNoLiveWorkflowFolder` call (line 307) | GitLab forge parity |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` | Identical function + call in `runDirectMerge()` after `assertNoLiveWorkflowFolder` call (line 306) | Gitea forge parity |
| `scripts/simulate-workflow-walkthrough.js` | Add `initGitRepoWithBareRemote` helper; add `testSinkMergeBlocksUnpushedCommits` + `testSinkMergeOfflineSkipsPublishGuard`; register in `main()` | Test coverage for new guard |
| `CHANGELOG.md` | Add entry under [Unreleased] | Docs checklist |

### Build Sequence

1. **Group A (parallel):** T1 (primary script), T2 (GitLab script), T3 (Gitea script) — disjoint files
2. **Group B (after T1):** T4 (plugin sync — copy primary verbatim; verify `diff` is empty)
3. **Group C (after A+B):** T5 (tests) + T6 (CHANGELOG) — disjoint, T5 exercises T1–T4 at runtime

### Parallelization Plan

| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| A | T1, T2, T3 | Disjoint files; identical function body |
| B | T4 | Depends on T1 only; disjoint from T2/T3 |
| C | T5, T6 | Disjoint files; T5 validation runs after T4 complete |

### External Dependencies

None. Node.js built-ins only (`child_process.execFileSync`, `fs`, `path`), already imported in all target files.

## Task List

### Task 1: Primary guard — `scripts/kaola-workflow-sink-merge.js`
- File: `scripts/kaola-workflow-sink-merge.js`
- Test File: `scripts/simulate-workflow-walkthrough.js`
- Write Set: `scripts/kaola-workflow-sink-merge.js`
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Implement:
  1. Add `assertBranchPushedToUpstream(mainRoot, branch)` immediately after the `assertNoLiveWorkflowFolder` function definition (before the next non-guard helper). Implementation:
     ```js
     function assertBranchPushedToUpstream(mainRoot, branch) {
       let upstream;
       try {
         upstream = execFileSync('git', ['-C', mainRoot, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', branch + '@{u}'],
           { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
       } catch (_) {
         throw new Error(
           "Branch '" + branch + "' has no upstream tracking ref.\n" +
           'Push and set upstream before merging: git push -u origin ' + branch
         );
       }
       const ahead = parseInt(
         execFileSync('git', ['-C', mainRoot, 'rev-list', '--count', upstream + '..' + branch], { encoding: 'utf8' }).trim(),
         10
       );
       if (!ahead) return;
       const commits = execFileSync('git', ['-C', mainRoot, 'log', '--format=%h %s', '-n', '5', upstream + '..' + branch],
         { encoding: 'utf8' }).trim();
       throw new Error(
         "Branch '" + branch + "' has " + ahead + " unpushed commit(s) ahead of '" + upstream + "'.\n" +
         'Push before merging: git push origin ' + branch + '\n\n' +
         'Unpushed commits:\n  ' + commits.split('\n').join('\n  ')
       );
     }
     ```
  2. In `main()`, add `if (!OFFLINE) assertBranchPushedToUpstream(mainRoot, args.branch);` immediately after `assertNoLiveWorkflowFolder(mainRoot, args.project);` (after line 266, before the merge-base skip-check comment).
- Mirror: `assertCleanWorktree` / `assertNoLiveWorkflowFolder` at `scripts/kaola-workflow-sink-merge.js:64-78`
- Validate: `node scripts/simulate-workflow-walkthrough.js` exits 0 with all prior tests passing

### Task 2: GitLab guard
- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`
- Test File: `scripts/simulate-workflow-walkthrough.js`
- Write Set: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Implement:
  1. Add identical `assertBranchPushedToUpstream(mainRoot, branch)` function immediately after `assertNoLiveWorkflowFolder` definition (after line ~99, before `fastForwardMain`).
  2. In `runDirectMerge()`, add `if (!OFFLINE) assertBranchPushedToUpstream(mainRoot, args.branch);` immediately after `assertNoLiveWorkflowFolder(mainRoot, args.project);` (after line 307, before the merge-base skip-check at line 309). Note: call site is in `runDirectMerge()`, not `main()` — structure differs from primary.
- Mirror: `assertCleanWorktree` / `assertNoLiveWorkflowFolder` at lines 75-90 in this file
- Validate: visual inspection that insertion is structurally correct; full test suite covers via T5

### Task 3: Gitea guard
- File: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js`
- Test File: `scripts/simulate-workflow-walkthrough.js`
- Write Set: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js`
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Implement:
  1. Add identical `assertBranchPushedToUpstream(mainRoot, branch)` function immediately after `assertNoLiveWorkflowFolder` definition (after line ~99, before `fastForwardMain`).
  2. In `runDirectMerge()`, add `if (!OFFLINE) assertBranchPushedToUpstream(mainRoot, args.branch);` immediately after `assertNoLiveWorkflowFolder(mainRoot, args.project);` (after line 306, before the merge-base skip-check at line 308).
- Mirror: identical to T2 — same guard pattern
- Validate: visual inspection; full test suite covers via T5

### Task 4: Plugin sync (Codex copy)
- File: `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`
- Test File: N/A
- Write Set: `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`
- Depends On: Task 1
- Parallel Group: B
- Action: MODIFY (overwrite)
- Implement: `cp scripts/kaola-workflow-sink-merge.js plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`
- Mirror: validate-script-sync.js byte-identical requirement
- Validate: `diff scripts/kaola-workflow-sink-merge.js plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` reports no differences

### Task 5: Tests
- File: `scripts/simulate-workflow-walkthrough.js`
- Test File: same
- Write Set: `scripts/simulate-workflow-walkthrough.js`
- Depends On: Tasks 1, 2, 3, 4
- Parallel Group: C
- Action: MODIFY
- Implement:
  1. **`initGitRepoWithBareRemote(tmp)`** (near line 387, after `initGitRepo`):
     - Create bare repo at `tmp + '-remote'` via `git init --bare`
     - Call `initGitRepo(tmp)` for the working clone
     - `git remote add origin <bare-path>`
     - `git push -u origin main` (establishes tracking ref for `main`)
     - Return bare path so caller can clean it in `finally`
  2. **`testSinkMergeBlocksUnpushedCommits`** (block path, `OFFLINE=0`):
     - `initGitRepoWithBareRemote(tmp)`
     - `git checkout -b workflow/issue-911`
     - `git push -u origin workflow/issue-911` (establish tracking ref so branch has upstream)
     - Make local commit (e.g., write a file, `git add`, `git commit`) WITHOUT pushing — branch is now 1 ahead
     - Run `sinkMergeScript --project issue-911 --branch workflow/issue-911` with `KAOLA_WORKFLOW_OFFLINE: '1'`... wait, actually the new test for the block path needs `OFFLINE: '0'` (or no OFFLINE). But the test framework requires the sink to NOT go online. Actually the guard fires before any network calls, so this is safe. Use `KAOLA_WORKFLOW_OFFLINE: '0'` with a `gh` shim (like `writeGhShimForStartup`) to satisfy downstream steps IF the guard doesn't throw first. Since the guard throws before any `gh` call, a minimal shim is fine.
     - Assert: `result.status !== 0`; `result.stderr` includes `workflow/issue-911` and `unpushed`
     - Assert: `git rev-parse main` is unchanged (no merge happened)
     - Cleanup: `fs.rmSync(tmp, { recursive: true, force: true })` + `fs.rmSync(remotePath, ...)`
  3. **`testSinkMergeOfflineSkipsPublishGuard`** (OFFLINE regression discriminator):
     - `initGitRepo(tmp)` only (NO bare remote, NO tracking ref)
     - `git checkout -b workflow/issue-912`
     - Make local commit WITHOUT `git push -u` (branch has no upstream)
     - Run `sinkMergeScript --project issue-912 --branch workflow/issue-912` with `KAOLA_WORKFLOW_OFFLINE: '1'`
     - Assert: `result.status === 0` and `main` advanced to feature HEAD
     - Rationale: if someone removes `if (!OFFLINE)`, the guard's `rev-parse @{u}` throws (no upstream) and the test fails — that's the regression signal
     - Cleanup: `fs.rmSync(tmp, { recursive: true, force: true })`
  4. Register both in `main()` of the test file, after the existing `testSinkMergeRefusesLiveFolder()` call.
- Validate: `node scripts/simulate-workflow-walkthrough.js` exits 0 — ALL prior tests must still pass (not just the two new ones)

### Task 6: CHANGELOG
- File: `CHANGELOG.md`
- Test File: N/A
- Write Set: `CHANGELOG.md`
- Depends On: none
- Parallel Group: C
- Action: MODIFY
- Implement: Add under `[Unreleased]`:
  ```
  ### Added
  - `assertBranchPushedToUpstream` guard in `sink-merge` scripts (GitHub, GitLab, Gitea): blocks the merge sink when the feature branch has unpushed commits ahead of its upstream tracking ref. Reports branch name, upstream ref, ahead count, and up to 5 representative commit titles. Skipped when `KAOLA_WORKFLOW_OFFLINE=1`.
  ```
- Validate: manual review

## Advisor Notes

1. Every existing sink-merge test in `simulate-workflow-walkthrough.js` uses `KAOLA_WORKFLOW_OFFLINE: '1'` — confirmed by grep. The new guard's `if (!OFFLINE)` call site protects all existing tests from breakage.
2. GitLab/Gitea call sites go in `runDirectMerge()`, not `main()` — verified by reading the file structure.
3. `args.branch` is in scope in `runDirectMerge()` — confirmed: both gitlab/gitea scripts parse `args` at the top level and pass to `runDirectMerge`.
4. Use `execFileSync` (not `spawnSync`) — all three forge scripts use `execFileSync`.
5. T5 validation must cover ALL prior tests passing, not just the two new ones.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | | Advisor approved plan as-is; no blueprint gaps requiring architect revision |
