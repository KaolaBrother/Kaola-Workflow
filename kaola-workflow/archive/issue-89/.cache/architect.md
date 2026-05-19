# Code Architect Output — Issue #89

## Design Decisions

- **Option A for `getCoordRoot`**: The actual `module.exports` block in claim.js does not include `getCoordRoot`. A single-line addition is the principled fix — mirrors GitHub's import pattern, avoids copy-paste drift. This adds one row to Files to Modify.

- **Approach C branching**: `runDirectMerge` branches on `opts.skipGit`. When `true`, legacy path (current behavior). When not `true`, new pipeline runs. All existing tests exercise the legacy path and pass unchanged.

- **`finalValidationPassed` gate runs before the branch**: Fires for both legacy and new pipeline before `opts.skipGit` is checked.

- **`fastForwardMain` preserved as legacy-only**: New pipeline does not call it. Still called in `skipGit: true` branch.

- **Issue-close in `postMergeCleanup` calls forge directly**: Not `closeLinkedIssue`. Gated by `!OFFLINE && args.issue != null`.

- **GH006 pattern excluded**: Not a GitLab error string.

- **`mainRootFromCoord` defined locally**: Private one-liner helper.

- **TDD ordering**: Tests written before implementation.

---

## Files to Modify

| File | Changes | Priority |
|------|---------|----------|
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | Add `getCoordRoot` to `module.exports` block (single line) | 1 |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` | Add four new test blocks: classifyMergeError unit, exit-2 subprocess, exit-3 subprocess, success-path subprocess | 2 |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | Add new requires; add classifyMergeError, doRebase, ffMergeLoop, postMergeCleanup, mainRootFromCoord; expand runDirectMerge; update main(); expand module.exports | 3 |

---

## Data Flow

**Legacy path (skipGit: true — unchanged)**
```
runDirectMerge → finalValidationPassed → fastForwardMain (no-op) → closeLinkedIssue → {merged, close}
```

**New pipeline (skipGit falsy)**
```
runDirectMerge
  → finalValidationPassed (throws if not passed)
  → chdir(tmpdir) + removeWorktree(mainRoot, project, folder)
  → register process.on('exit'): chdir(mainRoot) + optional DEBUG_CWD write
  → if !OFFLINE: git fetch origin
  → git checkout branch
  → merge-base skip-check → alreadyUpToDate bool
  → doRebase(alreadyUpToDate): git rebase origin/main; npm test if !alreadyUpToDate && !OFFLINE
  → ffMergeLoop: [pull main, checkout branch, checkout main, merge --ff-only] × MAX_AUTOMERGE_RETRIES=3
       FORCE_FF_FAIL=N: skip git-merge for first N iterations
       returns false → return {exitCode: 2}
  → postMergeCleanup:
       git push origin main (or throw if FORCE_MERGE_IMPOSSIBLE)
       on push error: classifyMergeError → null=rethrow(exit1) | token=reset+receipt+{exitCode:3}
       on push success (if !OFFLINE && issue): forge.closeIssue + forge.createIssueNote
       git branch -d branch (swallowed)
       if !OFFLINE: git push origin --delete branch (swallowed)
  → main() checks result.exitCode, sets process.exitCode
```

---

## Build Sequence

1. Export `getCoordRoot` from `kaola-gitlab-workflow-claim.js` — unblocks all subsequent requires
2. Write failing tests in `test-gitlab-sinks.js` — four new blocks at the end of the file
3. Add new requires to `kaola-gitlab-workflow-sink-merge.js`: `os`, `{ getCoordRoot, readActiveFolders, removeWorktree }` from claim.js
4. Add module-level env-var reads: `OFFLINE`, `FORCE_FF_FAIL`, `FORCE_MERGE_IMPOSSIBLE`
5. Add `mainRootFromCoord` (private local helper, no export)
6. Add `classifyMergeError` — GitLab-specific patterns, no GH006
7. Add `doRebase` — rebase + npm test, with multi-line remediation on failure
8. Add `ffMergeLoop` — MAX_AUTOMERGE_RETRIES=3, FORCE_FF_FAIL counter, returns false when exhausted
9. Add `postMergeCleanup` — push, classifyMergeError gate, receipt write, forge close, branch delete
10. Expand `runDirectMerge` — legacy branch on `skipGit`, new pipeline otherwise
11. Update `main()` — propagate `result.exitCode` to `process.exitCode`
12. Update `module.exports` — add `classifyMergeError`
13. Run tests — `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`

---

## Task List

### Task 1 — Export `getCoordRoot` from claim.js

- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- Test File: n/a (tested transitively by Task 2 subprocess tests)
- Write Set: Add `getCoordRoot,` inside the `module.exports` block
- Depends On: nothing
- Parallel Group: 1 (serial)
- Action: MODIFY
- What to implement: Single-line addition: `getCoordRoot,` in module.exports
- Pattern: GitHub `kaola-workflow-claim.js` exports `getCoordRoot`
- Validate: `node -e "const {getCoordRoot} = require('./plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js'); console.log(typeof getCoordRoot)"` → `function`

### Task 2 — Write new tests in test-gitlab-sinks.js (TDD)

- File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`
- Test File: self
- Write Set: Four new test blocks appended before the final `console.log`; `setupRealRepo(name, project)` helper added near existing helpers
- Depends On: Task 1
- Parallel Group: 2
- Action: MODIFY
- What to implement:
  - `setupRealRepo(name, project)` helper: `git init -b main`, set `user.name`/`user.email`, create initial commit on `main`, create feature branch with one extra commit, write `workflow-state.md` + `phase6-summary.md` into `kaola-workflow/{project}/`; return `{ root, branch: 'workflow/{project}' }`
  - (a) `classifyMergeError` unit block — direct `require`, each pattern asserted
  - (b) exit-2 subprocess block — `setupRealRepo`, `spawnSync` with `KAOLA_WORKFLOW_FORCE_FF_FAIL=3` + `KAOLA_WORKFLOW_OFFLINE=1`; assert `result.status === 2`
  - (c) exit-3 subprocess block — `spawnSync` with `KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE=branch_protected` + `KAOLA_WORKFLOW_OFFLINE=1`; assert `result.status === 3` + parse `sink-fallback.json` receipt
  - (d) success-path subprocess block — `spawnSync` with `KAOLA_WORKFLOW_OFFLINE=1`; assert `result.status === 0`, feature branch deleted locally, `KAOLA_WORKFLOW_DEBUG_CWD` file contains mainRoot path
- Pattern: Existing subprocess test patterns; direct module call style for unit block
- Validate: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` — pre-existing blocks pass; new blocks fail RED (implementation not yet written)

### Task 3 — Implement new pipeline in sink-merge.js

- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`
- Test File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`
- Write Set: All changes in build sequence steps 3–12
- Depends On: Task 1, Task 2
- Parallel Group: 3 (serial)
- Action: MODIFY
- What to implement: (see Data Flow above)
  1. New requires: `os`, `{ getCoordRoot, readActiveFolders, removeWorktree }` from claim.js
  2. Module-level env reads: `OFFLINE`, `FORCE_FF_FAIL`, `FORCE_MERGE_IMPOSSIBLE`
  3. `mainRootFromCoord(coordRoot)` — private helper
  4. `classifyMergeError(e)` — GitLab-specific patterns, FORCE_MERGE_IMPOSSIBLE override
  5. `doRebase(args, alreadyUpToDate, mainRoot)` — git rebase + npm test
  6. `ffMergeLoop(args, mainRoot)` — MAX_AUTOMERGE_RETRIES=3, FORCE_FF_FAIL counter
  7. `postMergeCleanup(args, mainRoot)` — push + classify + receipt + close + branch delete
  8. `runDirectMerge` expansion — legacy branch + new pipeline
  9. `main()` — propagate exitCode
  10. `module.exports` — add `classifyMergeError`
- Pattern: `scripts/kaola-workflow-sink-merge.js` lines 40-275
- Validate: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` → exits 0, prints "GitLab sink tests passed"

---

## External Dependencies (new requires)

| Require | Source | Already in file? |
|---------|--------|-----------------|
| `os` | Node built-in | No — add |
| `getCoordRoot` | `./kaola-gitlab-workflow-claim` | No — add (requires Task 1 export) |
| `readActiveFolders` | `./kaola-gitlab-workflow-claim` | No — add |
| `removeWorktree` | `./kaola-gitlab-workflow-claim` | No — add |

---

## Out-of-Scope Items (explicit)

- GH006 pattern in classifyMergeError
- MR-creation path inside sink-merge
- gh/glab CLI calls for issue close (use forge API only)
- Forge wrapper for branch-delete (use git directly via execFileSync)
- Removing or modifying finalValidationPassed
- Modifying closeLinkedIssue
- Modifying fastForwardMain
- Modifying assertCleanWorktree
- Any changes to kaola-gitlab-workflow-active-folders.js
