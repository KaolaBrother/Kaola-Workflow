# Phase 3 - Plan: issue-157

## Blueprint

### Files to Create
None.

### Files to Modify

| File | Changes | Why |
|------|---------|-----|
| `scripts/kaola-workflow-claim.js` | Refactor `collectStale(root)` out of `cmdStaleWorktreeCheck`; add `removeBranch`, `stashWorktree`, `exportWorktreeDiff`, `cmdStaleWorktreeCleanup`; extend `parseArgs` with `--execute`, `--archive`, `--export`, `--keep-branch`; add dispatch + usage entry; export `cmdStaleWorktreeCleanup`, `collectStale` | GitHub canonical claim script |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | `cp scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (no manual edit) | Codex mirror must be byte-identical; `validate-script-sync.js` enforces this |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | Port same `collectStale` refactor + all new helpers + `cmdStaleWorktreeCleanup`; preserve GitLab `for-each-ref` glob (`workflow/gitlab-issue-*`) and `extractIssueNumber` pattern | GitLab edition claim script |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | Same as GitLab; Gitea branch pattern `workflow/gitea-issue-N` | Gitea edition claim script |
| `scripts/simulate-workflow-walkthrough.js` | Add `testStaleWorktreeCleanup()`; invoke after existing `testStaleWorktreeCheck()` call | GitHub test suite |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | Add `testStaleWorktreeCleanup()`; invoke after existing `testStaleWorktreeCheck()` call (~line 1426) | GitLab test suite (runs via simulate wrapper in npm test — Phase 1 note about "NOT in npm test" was stale; confirmed simulate-gitlab-workflow-walkthrough.js calls `run('test-gitlab-workflow-scripts.js')`) |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | Same as GitLab | Gitea test suite (same wrapper pattern) |
| `scripts/validate-workflow-contracts.js` | Extend existing `assertConcept` block (lines 237-241) with `'testStaleWorktreeCleanup'` and `'dry_run'` terms | GitHub contract validator |
| `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` | Add NEW `assertConcept` block targeting `test-gitlab-workflow-scripts.js` with all 5 terms | GitLab contract validator (no existing stale-worktree assertConcept) |
| `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` | Same NEW block targeting `test-gitea-workflow-scripts.js` | Gitea contract validator |
| `README.md` | Add `stale-worktree-cleanup` row to subcommand table; update capability sentence | Documentation |

### Build Sequence

1. T1 — GitHub claim script: `collectStale` refactor + new helpers + `cmdStaleWorktreeCleanup` + dispatch
2. T2 — Codex sync: `cp` (depends on T1's final bytes)
3. T3a/T3b (parallel after T1) — GitLab + Gitea claim scripts: independent of each other
4. T4 (after T1) / T5a (after T3a) / T5b (after T3b) — parallel per dependency: GitHub + GitLab + Gitea tests
5. T6 (after T4+T5a+T5b) — All 3 validators
6. T7 — README
7. Final gate: `npm test`

### Parallelization Plan

| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| A | T1 (then T2 after) | T2 is a cp of T1; serial within group |
| B | T3a, T3b | Disjoint write sets (different claim scripts) |
| C | T4 (after T1), T5a (after T3a), T5b (after T3b) | Disjoint write sets; each waits for its own claim script |
| D | T6, T7 | Disjoint; both require T4+T5a+T5b to pass |

### External Dependencies
None. Uses only Node.js builtins (`fs`, `child_process`, `path`, `os`); reuses existing helpers from claim scripts.

---

## Task List

### Task 1: GitHub claim script — collectStale refactor + cmdStaleWorktreeCleanup

- File: `scripts/kaola-workflow-claim.js`
- Test File: `scripts/simulate-workflow-walkthrough.js` (run later in T4)
- Write Set: `scripts/kaola-workflow-claim.js`
- Depends On: none
- Parallel Group: A (then T2 immediately after)
- Action: MODIFY
- Implement:
  1. **Refactor `collectStale(root)`**: Extract the body of `cmdStaleWorktreeCheck` (lines 577-634) into `collectStale(root)`. It must return `{ stale_worktrees, stale_branches, active_worktrees }` exactly. `cmdStaleWorktreeCheck` becomes a thin wrapper calling `collectStale` then `output(...)`.
  2. **Add `stashWorktree(wtPath, issueNumber)`**: `git -C <wtPath> stash push -u -m "kaola-cleanup-issue-<issueNumber>"` via `execFileSync`; try/catch returns bool.
  3. **Add `exportWorktreeDiff(root, wtPath, issueNumber)`**: Ensure `kaola-workflow/archive/exports/` exists (`fs.mkdirSync({recursive:true})`); write `git -C <wtPath> diff HEAD` output to `kaola-workflow/archive/exports/issue-<N>-<ts>.patch` where `ts = new Date().toISOString().replace(/[:.]/g, '-')`; return patch path on success, null on failure.
  4. **Add `removeBranch(root, branch)`**: `git -C root branch -D <branch>` via `execFileSync`; try/catch returns bool. Caller verifies no registered worktree first.
  5. **Extend `parseArgs`**: Add alongside the existing `--force`/`--keep-worktree` parsing (lines 30-31):
     ```js
     if (key === '--execute') { args.execute = true; continue; }
     if (key === '--archive') { args.archive = true; continue; }
     if (key === '--export')  { args.export = true; continue; }
     if (key === '--keep-branch') { args.keepBranch = true; continue; }
     ```
  6. **Add `cmdStaleWorktreeCleanup()`** implementing the decision matrix (see Architect Notes below).
  7. **Extend dispatch in `main()`**: Add `if (sub === 'stale-worktree-cleanup') return cmdStaleWorktreeCleanup();`; append `|stale-worktree-cleanup` to usage string.
  8. **Extend `module.exports`**: Add `cmdStaleWorktreeCleanup`, `collectStale`.
- Mirror: `cmdStaleWorktreeCheck` pattern (same file, lines 577-634)
- Validate: (validation deferred to T4 after test file is written; T2 sync runs immediately after)

---

### Task 2: Codex mirror sync

- File: `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- Test File: N/A
- Write Set: `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- Depends On: Task 1 (must be complete and final)
- Parallel Group: A (serial after T1)
- Action: MODIFY (via cp)
- Implement: `cp scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
  No manual edit. This is the ONLY allowed modification method.
- Mirror: validate-script-sync.js enforces byte-identity
- Validate: `node scripts/validate-script-sync.js`

---

### Task 3a: GitLab claim script

- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- Test File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` (run in T5a)
- Write Set: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- Depends On: Task 1 (for pattern reference)
- Parallel Group: B (parallel with T3b)
- Action: MODIFY
- Implement: Port all of Task 1 items (collectStale refactor, all helpers, cmdStaleWorktreeCleanup, parseArgs extension, dispatch, usage, exports) to the GitLab edition. GitLab-specific details:
  - `for-each-ref` glob inside `collectStale`: keep existing glob `refs/heads/workflow/gitlab-issue-*` (from GitLab `cmdStaleWorktreeCheck` at line 580)
  - `extractIssueNumber` for GitLab branch pattern: `workflow/gitlab-issue-N` — use existing helper at the matching line
  - Stash message uses issue_number (no forge prefix in stash message: `"kaola-cleanup-issue-N"`)
  - Export path: `kaola-workflow/archive/exports/issue-N-<ts>.patch` (same as GitHub)
- Mirror: Task 1 implementation (GitHub)
- Validate: (validation deferred to T5a)

---

### Task 3b: Gitea claim script

- File: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`
- Test File: `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` (run in T5b)
- Write Set: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`
- Depends On: Task 1 (for pattern reference)
- Parallel Group: B (parallel with T3a)
- Action: MODIFY
- Implement: Same as T3a but for Gitea. Gitea-specific: `for-each-ref` glob `refs/heads/workflow/gitea-issue-*`; branch pattern `workflow/gitea-issue-N`; `extractIssueNumber` uses Gitea helper at matching line.
- Mirror: Task 1 implementation (GitHub)
- Validate: (validation deferred to T5b)

---

### Task 4: GitHub test — testStaleWorktreeCleanup

- File: `scripts/simulate-workflow-walkthrough.js`
- Test File: (this is the test file)
- Write Set: `scripts/simulate-workflow-walkthrough.js`
- Depends On: Task 1
- Parallel Group: C (parallel with T5a, T5b, each after their own claim)
- Action: MODIFY
- Implement: Add `function testStaleWorktreeCleanup()` with 7 sub-cases. Pattern: same helpers as existing `testStaleWorktreeCheck` in this file (lines 1050-1213: `initGitRepo`, `writeGhShimForStale`, `plantActiveFolder`, `runClaimOnline`). Each sub-case: `mkdtempSync`, init git repo, `git worktree add -b workflow/issue-200 -- <wtPath> HEAD` (use closed issue 200 so shim reports `isClosed=true`), run via `runNode([...args], tmp, binDir)`, assert on parsed JSON, cleanup in `finally`.
  - Sub-case 1 **dry-run**: no flags. Assert `out.dry_run === true`, `out.would_remove` contains wtPath, `out.would_delete_branch` contains `'workflow/issue-200'`, worktree still exists on disk.
  - Sub-case 2 **execute-clean**: `--execute`. Assert `out.dry_run === false`, `out.removed` contains wtPath, `out.deleted_branch` contains branch, `!fs.existsSync(wtPath)`.
  - Sub-case 3 **execute-dirty-no-flag**: dirty (`fs.writeFileSync(path.join(wtPath, 'dirty.txt'), 'x')`) + `--execute`. Assert `out.skipped_dirty` contains wtPath, worktree still exists.
  - Sub-case 4 **execute-dirty-archive**: dirty + `--execute --archive`. Assert `out.stashed` contains wtPath, `out.removed` contains wtPath, worktree gone, `git -C tmp stash list` contains `kaola-cleanup-issue-200`.
  - Sub-case 5 **execute-dirty-export**: dirty + `--execute --export`. Assert `out.exported` has one entry matching `kaola-workflow/archive/exports/issue-200-*.patch`, that file exists and non-empty, worktree gone.
  - Sub-case 6 **execute-dirty-force**: dirty + `--execute --force`. Assert `out.removed` contains wtPath, `out.stashed` empty, worktree gone.
  - Sub-case 7 **keep-branch**: clean + `--execute --keep-branch`. Assert `out.removed` contains wtPath, `out.deleted_branch` empty, branch still exists (verify via `git -C tmp rev-parse --verify refs/heads/workflow/issue-200`).
  - End with `console.log('testStaleWorktreeCleanup: PASSED');`
  - Call `testStaleWorktreeCleanup()` from `main()` after the existing `testStaleWorktreeCheck()` invocation.
- Mirror: `testStaleWorktreeCheck` pattern in this file (lines 1050-1213)
- Validate: `node scripts/simulate-workflow-walkthrough.js`

---

### Task 5a: GitLab test — testStaleWorktreeCleanup

- File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- Test File: (this is the test file)
- Write Set: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- Depends On: Task 3a
- Parallel Group: C (parallel with T4, T5b)
- Action: MODIFY
- Implement: Same 7 sub-cases as T4 adapted for GitLab patterns. Use `runClaimOnline`/`runNode` helpers from this file (matching patterns around existing `testStaleWorktreeCheck` at lines 1116-1259). GitLab-specific: branch `workflow/gitlab-issue-200`, `extractIssueNumber` for GitLab pattern. Close-detection: use glab shim returning `state: closed` for issue 200 OR `KAOLA_WORKFLOW_OFFLINE=1` + `mkdir kaola-workflow/archive/issue-200`. Invoke `testStaleWorktreeCleanup()` after existing `testStaleWorktreeCheck()` invocation (~line 1426).
- Mirror: `testStaleWorktreeCheck` in this file (lines 1116-1259)
- Validate: `node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js`

---

### Task 5b: Gitea test — testStaleWorktreeCleanup

- File: `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- Test File: (this is the test file)
- Write Set: `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- Depends On: Task 3b
- Parallel Group: C (parallel with T4, T5a)
- Action: MODIFY
- Implement: Same as T5a but for Gitea. Branch `workflow/gitea-issue-200`. Use Gitea shim for close detection or OFFLINE+archive approach.
- Mirror: `testStaleWorktreeCheck` in this file
- Validate: `node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js`

---

### Task 6: All 3 contract validators

- File: `scripts/validate-workflow-contracts.js`, `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`, `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`
- Test File: N/A (these are validators)
- Write Set: all 3 validator files
- Depends On: T4, T5a, T5b (test terms must exist before validators enforce them)
- Parallel Group: D (parallel with T7)
- Action: MODIFY
- Implement:
  - **GitHub** — extend existing block at lines 237-241:
    ```js
    assertConcept('scripts/simulate-workflow-walkthrough.js', 'stale worktree validation', [
      'testStaleWorktreeCheck',
      'testStaleWorktreeCleanup',   // ADD
      'stale_worktrees',
      'stale_branches',
      'dry_run'                     // ADD
    ]);
    ```
  - **GitLab** — add NEW block (near other GitLab assertConcept calls):
    ```js
    assertConcept(`${pluginRoot}/scripts/test-gitlab-workflow-scripts.js`, 'GitLab stale worktree validation', [
      'testStaleWorktreeCheck',
      'testStaleWorktreeCleanup',
      'stale_worktrees',
      'stale_branches',
      'dry_run'
    ]);
    ```
  - **Gitea** — same NEW block targeting `test-gitea-workflow-scripts.js` with concept string `'Gitea stale worktree validation'`
- Mirror: existing GitHub assertConcept block structure (lines 237-241)
- Validate: `npm test`

---

### Task 7: README documentation

- File: `README.md`
- Test File: N/A
- Write Set: `README.md`
- Depends On: T1 (to confirm flag names and output shape)
- Parallel Group: D (parallel with T6)
- Action: MODIFY
- Implement:
  1. Add `stale-worktree-cleanup` row to the subcommand table after line 533 (after `stale-worktree-check` row):
     ```
     | `stale-worktree-cleanup` | `node scripts/kaola-workflow-claim.js stale-worktree-cleanup [--execute] [--archive|--export|--force] [--keep-branch]` | Removes stale worktrees and branches found by `stale-worktree-check`. Dry-run by default; `--execute` performs removal. For dirty worktrees: `--archive` stashes changes first (recoverable via `git stash list`), `--export` writes a patch to `kaola-workflow/archive/exports/`, `--force` discards. `--keep-branch` removes the worktree but keeps the branch (for open PRs). |
     ```
  2. Update the `kaola-workflow-claim.js` capability sentence at line 489 to include `stale-worktree-cleanup`.
- Mirror: `stale-worktree-check` row pattern for table entry
- Validate: `npm test` (GitHub validator asserts README terms)

---

## Advisor Notes

From `.cache/advisor-plan.md`:

1. **Wrapper-claim conflict resolved**: Phase 1 note "GitLab/Gitea standalone test files NOT in npm test" was stale. Empirically confirmed: `simulate-gitlab-workflow-walkthrough.js` calls `run('test-gitlab-workflow-scripts.js')`, so tests in standalone files DO run via `npm test`. T5a/T5b target the standalone files correctly.
2. **`removeWorktree` signature**: Third arg can be object `{ worktree_path }` (confirmed line 141). Architect's call shape `removeWorktree(root, 'issue-N', { worktree_path: wt.path })` is valid.
3. **`wt.issue_number`**: Present in stale entries (confirmed lines 602, 629). No need to add `extractIssueNumber` call inside `collectStale`.
4. **`cwdInside` refuses entire run**: Explicit decision — this is intentional. If user is inside any target worktree, abort the whole run with a typed error. Loud failure beats silent partial cleanup.
5. **`state === 'missing'`**: `removeWorktree` at line 142 returns `{ removed: false, reason: 'missing' }` when path doesn't exist — it does NOT call `git worktree remove`. For missing-path entries, we need to call `git worktree prune` instead of `removeWorktree`. The cleanup command must handle missing state explicitly: call `git -C root worktree prune` for missing-state entries rather than `removeWorktree`.
6. **Timestamp format**: `archiveProjectDir` uses `new Date().toISOString().replace(/[:.]/g, '-')` (line 459). Architect's spec matches exactly.
7. **README stash recoverability**: Phrase as "recoverable via `git stash list`" without claiming any-worktree recovery — avoids the edge case.

**Note on `state === 'missing'` handling (item 5 above)**: Task 1 implementation must account for missing-path worktrees. When `wt.state === 'missing'`: call `execFileSync('git', ['-C', root, 'worktree', 'prune'])` (or equivalent) rather than `removeWorktree`. This cleans up the stale git worktree registration without expecting the path to exist.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | | Wrapper-claim verified empirically; no blueprint gap requiring revision; all signature concerns resolved via code read |
