# Node `impl-claim` evidence — issue #264

## RED → GREEN probe

**BEFORE edits:**
```
node -e "console.log(typeof require('./scripts/kaola-workflow-claim.js').legacySiblingWorktreePathFor)"
→ undefined
```

**AFTER edits:**
```
node -e "console.log(typeof require('./scripts/kaola-workflow-claim.js').legacySiblingWorktreePathFor)"
→ function
```

## Byte-identity confirmation

```
diff scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js
→ (empty — BYTE-IDENTICAL)
```

## The four changes implemented

### Change 1: `worktreePathFor` split (§C)
- `worktreePathFor` now returns `path.join(mainRoot, '.kw', 'worktrees', project)` (new hidden-local path, AC1)
- New `legacySiblingWorktreePathFor` added with the OLD formula `path.join(path.dirname(mainRoot), path.basename(mainRoot) + '.kw', project)` (AC3)
- AC5 no-nesting preserved: `mainRootFromCoord(getCoordRoot(root))` normalizes from inside any linked worktree to the MAIN repo root

### Change 2: Export `legacySiblingWorktreePathFor`
- Added to `module.exports` in all 4 claim.js files
- This is the `claimSignal()` activation key in the walkthrough

### Change 3: Suppression drop (§E suppression gate)
- Removed `requestedPath !== adaptiveSchema.ADAPTIVE_PATH` term from worktree-provisioning gate
- New condition: `if (!OFFLINE && WORKTREE_NATIVE && hasGitHistory(root))`
- Updated stale comment block to state "adaptive now provisions per #264"

### Change 4: `cmdLegacyWorktreeCleanup` + dispatch (§E)
- New function discovers worktrees registered under the legacy sibling container
- Dry-run default (real removal only with `--execute`)
- Dirty-skip reusing `worktreeDirtyState`/`stashWorktree`/`exportWorktreeDiff`/`removeWorktree`
- Empty-container removal via `fs.rmdirSync` (refuses if non-empty)
- Dispatched as `legacy-worktree-cleanup` subcommand
- Key design: uses `git worktree list --porcelain` directly (not `listWorkflowWorktrees`) to enumerate ALL registered worktrees without branch-name filtering — necessary because forge test branches like `workflow/gitlab-issue-264-legacy` don't match `/workflow\/issue-(\d+)/`

## D5 absorb-pattern fixture fixes applied

Three pre-existing test fixtures predated the path change and needed mechanical updates:

1. **`testWorktreeNativeSurfacesProvisionFailure`** (simulate-workflow-walkthrough.js ~2744):
   - Planted file at OLD sibling path `tmp + '.kw'` to trigger EEXIST
   - Fixed: plant at NEW hidden-local path `path.join(tmp, '.kw')` so `mkdirSync(.kw/worktrees, {recursive})` fails
   - Also updated error regex: `/EEXIST|ENOTDIR/` (macOS gives ENOTDIR for mkdir inside a file-as-directory)

2. **`testSinkMergeFromLinkedWorktree`** (simulate-workflow-walkthrough.js ~3123):
   - Created worktree at old `<tmp>.kw/issue-941`; sink-merge's `removeWorktree` fallback now uses NEW path
   - Fixed: create worktree at `path.join(tmp, '.kw', 'worktrees', 'issue-941')`

3. **`testSinkMergeEmitsClosureReceipt`** (simulate-workflow-walkthrough.js ~5122):
   - Same issue as above — worktree created at old path
   - Fixed: create worktree at `path.join(tmp, '.kw', 'worktrees', 'issue-164r')`

4. **Issue #100 sibling test** (test-gitlab-workflow-scripts.js ~1669):
   - Asserted OLD path `path.join(kwRoot, 'issue-6')` as expected worktree_path
   - Fixed: create linked worktree at new path, assert NEW path `path.join(tmp, '.kw', 'worktrees', 'issue-6')`

5. **Issue #100 sibling test** (test-gitea-workflow-scripts.js ~1677):
   - Same as gitlab — fixed identically

All other tests using `kwRoot = tmp + '.kw'` for stale-worktree-check/cleanup are unaffected (they use `listWorkflowWorktrees` which filters by git registration path, not computed paths).

## Suite tails — all three exits 0

### Main walkthrough:
```
testWorktreeAdaptiveProvisioned: PASSED
testAdaptiveWorktreeProvisionedE2E: PASSED
testSinkRefusesWorkflowOnlyBranch: PASSED
testSinkAllowsMixedBranch: PASSED
testPlanRunWiredForWorktree: PASSED
Workflow walkthrough simulation passed
```

### GitLab walkthrough:
```
testGitlabAdaptive: PASSED
testGitlab237DotPathExtraction: PASSED
GitLab workflow walkthrough simulation passed
```

### Gitea walkthrough:
```
testGiteaAdaptive: PASSED
testGitea237DotPathExtraction: PASSED
Gitea workflow walkthrough simulation passed
```

## Now-activated tests (all PASSED)

### Main walkthrough:
- `testStartupJsonAndHiddenLocalWorktrees` — inverted from old sibling path, now asserts `<root>/.kw/worktrees/`
- `testWorktreeAdaptiveProvisioned` — inverted from adaptive-suppressed; adaptive now provisions
- `testWorktreeHiddenLocalPath` — new; full/fast claim produces hidden-local path + dir exists
- `testLegacyWorktreeCleanupDryRun` — new; legacy-worktree-cleanup dry-run default
- `testLegacyWorktreeCleanupDirtySkip` — new; dirty worktree AC4 skip + force-remove
- `testAdaptiveWorktreeProvisionedE2E` — new; end-to-end adaptive claim→impl→sink chain

### GitLab edition tests:
- `testGitlabWorktreePathForHiddenLocal: PASSED (hasNewApi=true)` — asserts new hidden-local path
- `testGitlabLegacyWorktreeCleanupDryRun: PASSED` — dry-run reports legacy path

### Gitea edition tests:
- `testGiteaWorktreePathForHiddenLocal: PASSED (hasNewApi=true)` — asserts new hidden-local path
- `testGiteaLegacyWorktreeCleanupDryRun: PASSED` — dry-run reports legacy path
