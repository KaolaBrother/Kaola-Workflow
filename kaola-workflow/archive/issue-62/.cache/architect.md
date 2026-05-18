# Phase 3 - Architect Output (issue-62)

## Design Decisions

- Inline cleanup inside `archiveProjectDir` after `fs.renameSync` succeeds. No new function, no new export, no signature change.
- Cheap-but-verified policy: main-worktree copy is removed only when `realpathSync(mainRoot) !== realpathSync(linkedRoot)`.
- Both sides of comparison go through `fs.realpathSync` to neutralize macOS `/tmp` → `/private/tmp` and `/var/folders` symlink aliasing.
- GitLab mirror lacks both `getCoordRoot` and `mainRootFromCoord` — both ported verbatim before `archiveProjectDir`. Do NOT modify `worktreePathFor`.
- GitHub pair (`scripts/kaola-workflow-claim.js` + `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`) must remain byte-identical (validator enforces).
- Three regression tests: finalize-from-linked, finalize-from-main-root (no-op proof), release-from-linked.
- Test fixtures plant the project folder in BOTH main worktree and linked worktree (otherwise `src` is missing in linked worktree and `archiveProjectDir` returns early, making the test vacuous).
- Test-3 cwd must be the linked worktree ROOT, not the project subdir inside it, to avoid `cwdInside(folder.project_dir)` tripping in `cmdRelease`.

## Files to Modify

1. `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/scripts/kaola-workflow-claim.js` (lines 414-434)
2. `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (byte-identical mirror)
3. `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` (lines ~370-392; helpers ported before)
4. `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/scripts/simulate-workflow-walkthrough.js` (three new tests + registrations)

## Change Spec — `archiveProjectDir`

After `fs.renameSync(src, dest);` (line 432) and before `return { archived: true, dest };` (line 433), insert:

```js
  try {
    const mainRoot = fs.realpathSync(mainRootFromCoord(getCoordRoot(root)));
    const linkedRoot = fs.realpathSync(root);
    if (mainRoot !== linkedRoot) {
      const mainLive = path.join(mainRoot, 'kaola-workflow', project);
      if (fs.existsSync(mainLive)) fs.rmSync(mainLive, { recursive: true, force: true });
    }
  } catch (_) {}
```

The `try/catch` follows the existing defensive pattern (see `try { removeWorktree(...) } catch (_) {}` in `cmdFinalize` line 443 and `cmdRelease` line 462).

## Change Spec — GitLab Helpers Port

Add before `archiveProjectDir` (around line 370):

```js
function getCoordRoot(root) {
  try {
    const raw = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd: root || getRoot(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    return path.resolve(root || getRoot(), raw);
  } catch (_) {
    return path.join(root || getRoot(), '.git');
  }
}

function mainRootFromCoord(coordRoot) {
  return path.basename(coordRoot) === '.git' ? path.dirname(coordRoot) : coordRoot;
}
```

Then the same 5-line cleanup block in `archiveProjectDir`.

## Test Plan

### Test 1: `testFinalizeFromLinkedWorktreeCleansMainCopy`
- Setup: `tmp` + linked worktree at `tmp.kw/issue-701/`; plant `tmp/kaola-workflow/issue-701/workflow-state.md` AND `tmp.kw/issue-701/kaola-workflow/issue-701/workflow-state.md`; `initGitRepo(tmp)`.
- Invoke: `node claim.js finalize --project issue-701` with `cwd = tmp.kw/issue-701/`.
- Assert: main copy gone; archive exists in linked worktree.

### Test 2: `testFinalizeFromMainRootNoSpuriousRemoval`
- Setup: `tmp` only; plant `tmp/kaola-workflow/issue-702/`. No linked worktree, no git repo (OFFLINE).
- Invoke: `node claim.js finalize --project issue-702` with `cwd = tmp`.
- Assert: live folder removed via rename; `tmp/kaola-workflow/archive/issue-702/` exists (no spurious erasure of archive).

### Test 3: `testReleaseFromLinkedWorktreeCleansMainCopy`
- Setup: identical to Test 1 with issue-703.
- Invoke: `node claim.js release --project issue-703 --reason test` with `cwd = tmp.kw/issue-703/` (the worktree ROOT, NOT the project subdir).
- Assert: main copy gone; archive entry under `tmp.kw/issue-703/kaola-workflow/archive/issue-703.discarded-*` exists.

## Task List

### Task 1: GitHub pair — `archiveProjectDir` cleanup
- File: `scripts/kaola-workflow-claim.js` + `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- Test File: `scripts/simulate-workflow-walkthrough.js` (Task 3 covers)
- Write Set: both GitHub claim.js files
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Implement: 5-line cleanup block after `fs.renameSync(src, dest)`
- Mirror: byte-identical between the two
- Validate: `node scripts/validate-workflow-contracts.js` and `node scripts/validate-kaola-workflow-contracts.js`

### Task 2: GitLab variant — port helpers + cleanup
- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- Test File: none (no walkthrough for GitLab in current contract)
- Write Set: GitLab claim.js
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Implement: Port `getCoordRoot` + `mainRootFromCoord` before `archiveProjectDir`; add same 5-line cleanup block
- Mirror: Same pattern as GitHub variant; do NOT touch `worktreePathFor`
- Validate: `node scripts/validate-workflow-contracts.js` (also validates GitLab parity)

### Task 3: Regression tests
- File: `scripts/simulate-workflow-walkthrough.js`
- Test File: self
- Write Set: simulator only
- Depends On: Tasks 1 and 2 complete
- Parallel Group: serial (after A)
- Action: MODIFY
- Implement: three test functions + register in `main()` before `testStatusShowsClosedIssueDrift`
- Mirror: existing test style (hand-rolled assert, `fs.mkdtempSync` setup, `spawnSync` invocation)
- Validate: `node scripts/simulate-workflow-walkthrough.js`

## Parallelization Plan

- Group A (parallel): Tasks 1 and 2 — disjoint files.
- Serial: Task 3 — depends on both.

## External Dependencies

None.

## Risk Callouts

1. **macOS realpath aliasing** — both sides go through `fs.realpathSync`, mitigated.
2. **`getCoordRoot` from non-git OFFLINE tests** — `try/catch` absorbs failures, follows existing pattern.
3. **GitLab `worktreePathFor` scope creep** — leave it alone; only the ported helpers are used in the new block.
4. **Test vacuousness** — fixtures must plant in BOTH worktrees (main + linked).
5. **Test-3 `cwdInside` guard** — cwd must be linked worktree ROOT, not project subdir.
6. **Byte-identical constraint** — Task 1 must update both files identically or validator fails.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | pending | | |
| architect revisions | N/A | | none needed if advisor gate passes |
