# Code Architect Output: issue-137

## Design Decisions

- `assertBranchPushedToUpstream(mainRoot, branch)` does NOT check `OFFLINE` internally — mirrors `assertCleanWorktree`/`assertNoLiveWorkflowFolder` pattern (pure throwers). OFFLINE skip lives at the call site via `if (!OFFLINE) assertBranchPushedToUpstream(...)`.
- Use `execFileSync` from `child_process` (NOT `spawnSync`) — all three sink scripts already use `execFileSync` exclusively.
- Function body is byte-identical across all three forge files — uses only `execFileSync`, `mainRoot`, and `branch`; no forge-specific symbols.
- Guard fires before `doRebase` — natural placement after checkout, before merge-base check.

## Files to Create

None. No new files. No new external dependencies.

## Files to Modify

| File | Changes | Priority |
|------|---------|----------|
| `scripts/kaola-workflow-sink-merge.js` | (a) Add `assertBranchPushedToUpstream` after `assertNoLiveWorkflowFolder`; (b) Add call `if (!OFFLINE) assertBranchPushedToUpstream(mainRoot, args.branch);` in `main()` after `assertNoLiveWorkflowFolder(mainRoot, args.project);` | P0 primary |
| `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` | Sync: copy from primary (byte-identical) | P1 after primary |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | Same function + call in `runDirectMerge()` after line 307, before line 309 | P0 parallel |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` | Same function + call in `runDirectMerge()` after line 306, before line 308 | P0 parallel |
| `scripts/simulate-workflow-walkthrough.js` | Add `initGitRepoWithBareRemote(tmp)` helper + two tests + registration in `main()` | P2 after forge edits |
| `CHANGELOG.md` | Add entry under [Unreleased] | P2 parallel |

## Function Implementation (identical in all three forge files)

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

## Build Sequence

1. **Group A (parallel):** T1 (primary), T2 (GitLab), T3 (Gitea) — disjoint files
2. **Group B (after T1):** T4 (plugin sync — copy primary verbatim; verify diff is empty)
3. **Group C (after A, can overlap B):** T5 (tests), T6 (CHANGELOG)
4. **Validate:** `node scripts/simulate-workflow-walkthrough.js` exits 0

## Task List

### Task 1: Primary guard (scripts/kaola-workflow-sink-merge.js)
- File: `scripts/kaola-workflow-sink-merge.js`
- Test File: `scripts/simulate-workflow-walkthrough.js`
- Write Set: `scripts/kaola-workflow-sink-merge.js`
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Implement: Add `assertBranchPushedToUpstream` function after `assertNoLiveWorkflowFolder` definition. Add call `if (!OFFLINE) assertBranchPushedToUpstream(mainRoot, args.branch);` in `main()` after `assertNoLiveWorkflowFolder(mainRoot, args.project);` call.
- Mirror: `assertCleanWorktree` / `assertNoLiveWorkflowFolder` pattern at lines 64-78
- Validate: `node scripts/simulate-workflow-walkthrough.js` exits 0

### Task 2: GitLab guard
- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`
- Test File: `scripts/simulate-workflow-walkthrough.js`
- Write Set: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Implement: Add identical `assertBranchPushedToUpstream` function after `assertNoLiveWorkflowFolder` definition (after line ~99). Add call in `runDirectMerge()` after `assertNoLiveWorkflowFolder(mainRoot, args.project);` (after line 307, before line 309).
- Mirror: same guard pattern at lines 75-90 in this file
- Validate: `node scripts/simulate-workflow-walkthrough.js` exits 0 (tests cover only primary; GitLab integration verified by code review)

### Task 3: Gitea guard
- File: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js`
- Test File: `scripts/simulate-workflow-walkthrough.js`
- Write Set: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js`
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Implement: Add identical `assertBranchPushedToUpstream` function after `assertNoLiveWorkflowFolder` definition (after line ~99). Add call in `runDirectMerge()` after `assertNoLiveWorkflowFolder(mainRoot, args.project);` (after line 306, before line 308).
- Mirror: same guard pattern at lines 75-90 in this file
- Validate: `node scripts/simulate-workflow-walkthrough.js` exits 0 (tests cover only primary)

### Task 4: Plugin sync (Codex copy)
- File: `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`
- Test File: N/A
- Write Set: `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`
- Depends On: Task 1
- Parallel Group: B (after A)
- Action: MODIFY (overwrite with T1 output)
- Implement: Copy `scripts/kaola-workflow-sink-merge.js` to `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`. Verify: `diff scripts/kaola-workflow-sink-merge.js plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` must report no differences.
- Validate: diff reports empty

### Task 5: Tests
- File: `scripts/simulate-workflow-walkthrough.js`
- Test File: same
- Write Set: `scripts/simulate-workflow-walkthrough.js`
- Depends On: Tasks 1, 2, 3, 4 (tests exercise T1 at runtime)
- Parallel Group: C
- Action: MODIFY
- Implement:
  1. Add `initGitRepoWithBareRemote(tmp)` helper near `initGitRepo` (line 387): create bare repo at `tmp + '.git-remote'`; run `initGitRepo(tmp)`; add remote; push -u origin main.
  2. Add `testSinkMergeBlocksUnpushedCommits`: setup with bare remote; checkout feature branch; push to set tracking ref; make local commit without pushing; run sink-merge; assert exit != 0, stderr contains branch name and "unpushed".
  3. Add `testSinkMergeOfflineSkipsPublishGuard`: setup `initGitRepo` (no remote); checkout feature branch (no `git push -u`, so NO upstream tracking ref); make local commit; run sink-merge with `KAOLA_WORKFLOW_OFFLINE=1`; assert exit 0 and `main` advanced.
  4. Register both in `main()` after `testSinkMergeRefusesLiveFolder()` call.
- Validate: `node scripts/simulate-workflow-walkthrough.js` exits 0

### Task 6: CHANGELOG
- File: `CHANGELOG.md`
- Test File: N/A
- Write Set: `CHANGELOG.md`
- Depends On: none
- Parallel Group: C
- Action: MODIFY
- Implement: Add entry under [Unreleased] describing the new publish guard.
- Validate: manual review

## Parallelization Plan

| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| A | 1, 2, 3 | Disjoint files |
| B | 4 | After T1; disjoint from T2/T3 |
| C | 5, 6 | Disjoint files; T5 runs validation after T4 complete |

## External Dependencies

None. Node.js built-ins only: `fs`, `path`, `child_process.execFileSync` (already imported in all target files).

## Key Risks

1. GitLab/Gitea call sites go in `runDirectMerge()`, not `main()` — the function structure differs from the primary script.
2. In the block-path test: branch must be `alreadyUpToDate` relative to `origin/main` (branch off origin/main, only add commits without advancing main) to prevent reaching `doRebase`/`npm test` path.
3. OFFLINE-skip test must use a branch with **no upstream tracking ref** — this gives the test teeth: if someone removes `if (!OFFLINE)`, the guard's `rev-parse @{u}` would throw and the test would fail.

## Out of Scope

- `sink-pr.js`, `sink-mr.js` (PR-path sinks)
- Shared module extraction (YAGNI)
- Remote-side state checks (no network round-trip added)
- README / docs/architecture / docs/api edits (no public interface changes)
- Version bump
