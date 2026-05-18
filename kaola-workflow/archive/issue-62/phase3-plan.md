# Phase 3 - Plan: issue-62

## Blueprint

### Files to Create
None.

### Files to Modify

| File | Changes | Why |
|------|---------|-----|
| `scripts/kaola-workflow-claim.js` | Insert cleanup block in `archiveProjectDir` after `fs.renameSync(src, dest)` (line 432) | Atomic main-worktree cleanup; cwd-comparison gates the rm |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Byte-identical edit to the above | `validate-script-sync.js` enforces byte-identity |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | Port `getCoordRoot` + `mainRootFromCoord` helpers before `archiveProjectDir`; add identical cleanup block | GitLab edition has same bug; helpers absent |
| `scripts/simulate-workflow-walkthrough.js` | Add three new test functions: `testFinalizeFromLinkedWorktreeCleansMainCopy`, `testFinalizeFromMainRootNoSpuriousRemoval`, `testReleaseFromLinkedWorktreeCleansMainCopy`; register in `main()` | Regression coverage; AC #3 |
| `commands/kaola-workflow-phase6.md` | Add note in Step 8b explaining that `cmdFinalize` cleans main-worktree copy atomically (no separate cleanup step required) | AC #5 documentation |
| `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` | Same documentation note as phase6.md | Codex mirror |
| `plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md` | Same documentation note (GitLab variant) | GitLab mirror |

### Build Sequence

1. Verify baseline: `node scripts/simulate-workflow-walkthrough.js` (must exit 0 before any edits).
2. **Task 1 (GitHub pair)** — Edit `scripts/kaola-workflow-claim.js` + `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` to add the cleanup block. Must be byte-identical.
3. **Task 2 (GitLab variant)** — Port helpers; add cleanup block. Can run in parallel with Task 1.
4. **Task 3 (Regression tests)** — Add three tests + register in `main()`. Depends on Task 1.
5. **Task 4 (Documentation)** — Add Step 8b note to phase6.md and both skill mirrors. Can run in parallel with Tasks 1-3.
6. Run `node scripts/simulate-workflow-walkthrough.js` → must pass with 3 new tests.
7. Run `node scripts/validate-script-sync.js` → byte-identity must hold.
8. Run `node scripts/validate-workflow-contracts.js` and `node scripts/validate-kaola-workflow-contracts.js` → must pass.
9. Run `npm test` → both `:claude` and `:codex` test gates must pass.

### Parallelization Plan

| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| A | Task 1, Task 2, Task 4 | Disjoint write sets (GitHub pair, GitLab claim, doc files) |
| serial | Task 3 | Tests must reference the updated `archiveProjectDir` |

### External Dependencies

None.

## Task List

### Task 1: GitHub pair — `archiveProjectDir` cleanup
- **File**: `scripts/kaola-workflow-claim.js` AND `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- **Test File**: `scripts/simulate-workflow-walkthrough.js` (Task 3)
- **Write Set**: both GitHub claim.js files
- **Depends On**: none
- **Parallel Group**: A
- **Action**: MODIFY
- **Implement**: After `fs.renameSync(src, dest);` (line 432) and before `return { archived: true, dest };` (line 433), insert:
  ```js
  let mainRoot, linkedRoot;
  try {
    mainRoot = fs.realpathSync(mainRootFromCoord(getCoordRoot(root)));
    linkedRoot = fs.realpathSync(root);
  } catch (_) { mainRoot = null; }
  if (mainRoot && mainRoot !== linkedRoot) {
    const mainLive = path.join(mainRoot, 'kaola-workflow', project);
    if (fs.existsSync(mainLive)) fs.rmSync(mainLive, { recursive: true, force: true });
  }
  ```
- **Mirror**: byte-identical between the two files (enforced by `validate-script-sync.js`)
- **Validate**: `node scripts/validate-script-sync.js` + `node scripts/validate-workflow-contracts.js`

### Task 2: GitLab variant — port helpers + cleanup
- **File**: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- **Test File**: none (deferred — no existing archive test in GitLab tree; outside default `npm test`)
- **Write Set**: GitLab claim.js
- **Depends On**: none
- **Parallel Group**: A
- **Action**: MODIFY
- **Implement**:
  1. Before `archiveProjectDir` (around line 370), insert verbatim from GitHub variant:
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
  2. In `archiveProjectDir`, insert the same cleanup block as Task 1 between `fs.renameSync` and `return`.
- **Mirror**: Same pattern as GitHub. DO NOT touch `worktreePathFor` (line 55) — it uses a different model.
- **Validate**: `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`

### Task 3: Regression tests
- **File**: `scripts/simulate-workflow-walkthrough.js`
- **Test File**: self
- **Write Set**: simulator only
- **Depends On**: Task 1 complete
- **Parallel Group**: serial (after A)
- **Action**: MODIFY
- **Implement**:

  **Test 1: `testFinalizeFromLinkedWorktreeCleansMainCopy`**
  - Setup: `tmp = fs.mkdtempSync(...)`; `kwRoot = realpath(tmp) + '.kw'`; `initGitRepo(tmp)`; `writeGhShimForStartup(binDir)`.
  - Plant `tmp/kaola-workflow/issue-701/workflow-state.md` (via `plantActiveFolder` helper).
  - Plant `kwRoot/issue-701/kaola-workflow/issue-701/workflow-state.md` (identical content — required so `archiveProjectDir`'s `src` exists in the linked worktree).
  - Invoke: `spawnSync(node, [claim, 'finalize', '--project', 'issue-701'], { cwd: path.join(kwRoot, 'issue-701'), env: { ...OFFLINE } })`.
  - Assert: result.status === 0; `!fs.existsSync(tmp/kaola-workflow/issue-701)`; `fs.existsSync(kwRoot/issue-701/kaola-workflow/archive)`.

  **Test 2: `testFinalizeFromMainRootNoSpuriousRemoval`**
  - Setup: `tmp = fs.mkdtempSync(...)`; no linked worktree, no git repo (OFFLINE).
  - Plant `tmp/kaola-workflow/issue-702/workflow-state.md`.
  - Invoke: `runNode(claim, ['finalize', '--project', 'issue-702'], tmp)`.
  - Assert: result.status === 0; `!fs.existsSync(tmp/kaola-workflow/issue-702)` (renamed); `fs.existsSync(tmp/kaola-workflow/archive/issue-702)`.

  **Test 3: `testReleaseFromLinkedWorktreeCleansMainCopy`**
  - Setup: identical to Test 1 with issue-703.
  - Invoke: `spawnSync(node, [claim, 'release', '--project', 'issue-703', '--reason', 'test'], { cwd: path.join(kwRoot, 'issue-703') })`. **CRITICAL**: `cwd` is the linked worktree ROOT, NOT the project subdir inside it — `cwdInside(folder.project_dir)` would trip otherwise.
  - Assert: result.status === 0; `!fs.existsSync(tmp/kaola-workflow/issue-703)`; entry under `kwRoot/issue-703/kaola-workflow/archive/issue-703.discarded-*` exists.

  Register in `main()` before `testStatusShowsClosedIssueDrift()`.
- **Mirror**: existing test style (hand-rolled assert, `fs.mkdtempSync` setup, `spawnSync` invocation)
- **Validate**: `node scripts/simulate-workflow-walkthrough.js`

### Task 4: Documentation
- **File**: `commands/kaola-workflow-phase6.md` + `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` + `plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md`
- **Test File**: none
- **Write Set**: 3 doc files
- **Depends On**: none
- **Parallel Group**: A
- **Action**: MODIFY
- **Implement**: Add a paragraph in or near Step 8b explaining:
  > `cmdFinalize` is cwd-local: `archiveProjectDir`'s `fs.renameSync` only renames within the caller's worktree. When run from a linked worktree (`KAOLA_WORKTREE_NATIVE=1`), it ALSO removes the main-repo's `kaola-workflow/{project}/` copy after the rename succeeds. The comparison uses `fs.realpathSync` on both sides to handle symlinked tmpdirs. When `cmdFinalize` runs from the main repo (KAOLA_WORKTREE_NATIVE=0), the cleanup is a no-op because main root === caller root.
- **Mirror**: same wording across all three files (adapt project-name placeholders to match each file's style)
- **Validate**: `node scripts/validate-workflow-contracts.js` (asserts certain Phase 6 patterns) — must continue to pass

## Advisor Notes

- **AC #5 added as Task 4** — was missed by initial architect output.
- **try/catch scope narrowed** — only wraps path-resolution layer (`realpathSync`/`getCoordRoot`); `rmSync` errors propagate (with `force: true`, ENOENT is silenced anyway, so a real throw is genuinely abnormal).
- **GitLab regression test deferred** — GitLab tests are not in default `npm test`; GitLab tree has no existing archive test pattern; the fix is byte-identical to GitHub which IS tested.
- **AC #4 one-time sweep script deferred** — Phase 1 research found no current stale duplicates in this repo (`ls kaola-workflow/` shows only `archive/` and `ROADMAP.md`). Defer to a follow-up issue if drift surfaces in other repos.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | | gaps addressed inline via Task 4 + try/catch narrowing |
