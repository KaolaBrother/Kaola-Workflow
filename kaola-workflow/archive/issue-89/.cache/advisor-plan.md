# Advisor Plan Review — Issue #89

## Summary

The architect blueprint is sound. Three corrections must be applied before Phase 4.

---

## Correction 1 — `getCoordRoot` is genuinely not in module.exports (Task 1 confirmed)

**Evidence:** Reading the actual `module.exports` block (lines 607-620) of `kaola-gitlab-workflow-claim.js`:
```js
module.exports = {
  archiveProjectDir, buildBranchName, claimExplicitTarget, claimProject,
  listOpenIssues, partitionActiveAndDrift, projectNameForIssue,
  provisionWorktree, readActiveFolders, removeWorktree,
  watchMergeRequests, worktreePathFor
};
```
`getCoordRoot` is defined at line 373 but is NOT exported. Task 1 (add it to module.exports) is correct and necessary. Phase 1 research was slightly imprecise in claiming it was already exported at line 617 — it is only defined there, not exported.

---

## Correction 2 — Merge-base skip-check must use a try-catch (OFFLINE-safe)

The GitHub reference (lines 246-257) wraps the merge-base check in a try-catch:
```js
let alreadyUpToDate = false;
try {
  const mergeBase = execFileSync('git', ['-C', mainRoot, 'merge-base', 'HEAD', 'origin/main'], { encoding: 'utf8' }).trim();
  const originMain = execFileSync('git', ['-C', mainRoot, 'rev-parse', 'origin/main'], { encoding: 'utf8' }).trim();
  alreadyUpToDate = (mergeBase === originMain);
} catch (_) {
  // origin/main not resolvable — treat as up-to-date (no drift to rebase against)
  alreadyUpToDate = true;
}
```

This is essential: when `OFFLINE=1` and the test repo has no `origin` remote, `git rev-parse origin/main` throws. The catch sets `alreadyUpToDate = true`, which causes rebase and npm test to be skipped — the correct OFFLINE behavior. `setupRealRepo` does NOT need an origin remote. The architect's description omitted the try-catch.

**Action for Task 3**: Port the try-catch merge-base check exactly as shown above.

---

## Correction 3 — Worktree escape order: register exit hook BEFORE chdir and removeWorktree

The architect's description had the order wrong. The GitHub reference (lines 207-235) is:

```js
// a) Register process.on('exit') hook FIRST (so any subsequent throw still triggers cleanup)
process.on('exit', () => {
  try { process.chdir(mainRoot); } catch (_) {}
  if (process.env.KAOLA_WORKFLOW_DEBUG_CWD) { ... }
});
// b) Then chdir to tmpdir
try { process.chdir(os.tmpdir()); } catch (e) { stderr.write(...) }
// c) Then removeWorktree (swallowed)
const folder = readActiveFolders(mainRoot, { excludeClosedIssues: false })
  .find(item => item.project === args.project);
try { removeWorktree(mainRoot, args.project, folder); } catch (_) {}
```

The exit hook must be registered before any state mutation so that even if `chdir` or `removeWorktree` throws, the process.on('exit') cleanup still fires.

**Action for Task 3**: Port this exact ordering. The architect's Phase 2 description ("chdir + removeWorktree + register exit hook") has the register step last — that must be corrected to register first.

---

## Additional Verification — `removeWorktree` safety with undefined folder

`removeWorktree(root, project, folder)` at line 99 of claim.js:
```js
const wtPath = (folder && folder.worktree_path) || worktreePathFor(root, project);
```
When `folder` is undefined, falls back to `worktreePathFor(root, project)`. If that path doesn't exist, `git worktree remove` will throw, but the caller wraps in try-catch (swallowed). Safe for tests where no worktree was registered.

---

## Verdict

Blueprint is implementable with the three corrections above. No architect revision needed — the corrections are mechanical and do not change the selected approach or task boundaries. Proceed to write `phase3-plan.md` with corrections applied.
