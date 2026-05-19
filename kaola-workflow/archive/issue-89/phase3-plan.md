# Phase 3 - Plan: issue-89

## Blueprint

### Files to Create
None.

### Files to Modify

| File | Changes | Why |
|------|---------|-----|
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | Add `getCoordRoot` to `module.exports` block | Required for import in sink-merge.js; it is defined but not exported |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` | Add `setupRealRepo` helper + four new test blocks (classifyMergeError unit, exit-2, exit-3, success-path) | TDD: write failing tests first |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | Add new requires, env reads, 5 new functions, expand `runDirectMerge`, update `main()`, expand `module.exports` | Implementation of GitHub failure/fallback contract |

### Build Sequence

1. Export `getCoordRoot` from claim.js — unblocks import; single-line change; no tests to write (tested transitively)
2. Write failing tests in test-gitlab-sinks.js — four new test blocks + `setupRealRepo` helper; existing tests must still pass; new blocks will be RED
3. Implement new pipeline in sink-merge.js — all five helpers + expanded runDirectMerge + main() update; GREEN on test run

### Parallelization Plan

| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| serial | 1 → 2 → 3 | Task 2 requires Task 1 export; Task 3 requires both |

### External Dependencies

All are Node.js built-ins or already-present local modules — no npm installs needed.

| Require | Source | Already in sink-merge.js? |
|---------|--------|--------------------------|
| `os` | Node built-in | No — add |
| `getCoordRoot` | `./kaola-gitlab-workflow-claim` | No — add (after Task 1 export fix) |
| `readActiveFolders` | `./kaola-gitlab-workflow-claim` | No — add |
| `removeWorktree` | `./kaola-gitlab-workflow-claim` | No — add |

---

## Task List

### Task 1: Export `getCoordRoot` from claim.js

- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- Test File: n/a (tested transitively by Task 2 subprocess tests)
- Write Set: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` — add `getCoordRoot,` in `module.exports` block
- Depends On: none
- Parallel Group: serial (step 1)
- Action: MODIFY
- Implement: Inside the `module.exports` block (around line 607), add `getCoordRoot,` in alphabetical order between `claimProject` and `listOpenIssues`. `getCoordRoot` is defined at line 373 but absent from exports.
- Mirror: GitHub `scripts/kaola-workflow-claim.js` which exports `getCoordRoot`
- Validate: `node -e "const {getCoordRoot} = require('./plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js'); console.log(typeof getCoordRoot)"` → must print `function`

### Task 2: Write failing tests in test-gitlab-sinks.js

- File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`
- Test File: self
- Write Set: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` — add `setupRealRepo` helper + four new test blocks
- Depends On: Task 1
- Parallel Group: serial (step 2)
- Action: MODIFY
- Implement:
  1. **`setupRealRepo(name, project)` helper** — add near existing helpers (around line 50):
     - `const root = fs.mkdtempSync(path.join(os.tmpdir(), name + '-'))`;
     - `git init -b main` in root, set `user.name`/`user.email` in git config
     - Create initial commit on `main` branch: write `README.md`, `git add`, `git commit`
     - Create feature branch `workflow/${project}` with one extra commit (write `feature.md`, `git add`, `git commit`)
     - Write `kaola-workflow/${project}/workflow-state.md` + `kaola-workflow/${project}/phase6-summary.md` (use `writeWorkflow` helper)
     - Return `{ root, branch: 'workflow/' + project }`
  2. **classifyMergeError unit block** — direct `require(sinkScript)`, assert each pattern:
     - `'protected branch error'` → `'branch_protected'`
     - `'pre-receive hook declined'` → `'branch_protected'`
     - `'rejected non-fast-forward push'` → `'non_fast_forward'`
     - `'conflicts with target branch'` → `'non_fast_forward'`
     - `'Permission denied 403 not authorized'` → `'permission_denied'`
     - `'not allowed to push to protected'` → `'permission_denied'`
     - `'not allowed to merge this MR'` → `'permission_denied'`
     - `'random unclassified error'` → `null`
     - with `KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE=my_token` set on process.env → `'my_token'` (restore env after)
  3. **exit-2 subprocess block** — `setupRealRepo('exit2-test', 'test-proj')`, `spawnSync(process.execPath, [sinkScript, '--branch', branch, '--project', 'test-proj', '--root', root], { cwd: root, env: { ...process.env, KAOLA_WORKFLOW_FORCE_FF_FAIL: '3', KAOLA_WORKFLOW_OFFLINE: '1' } })`; assert `result.status === 2`
  4. **exit-3 subprocess block** — `setupRealRepo`, `spawnSync` with `KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE=branch_protected` + `KAOLA_WORKFLOW_OFFLINE=1`; assert `result.status === 3`; read `sink-fallback.json` receipt, assert `reason === 'branch_protected'`, `project === 'test-proj'`, `branch` field set, `timestamp` field set
  5. **success-path subprocess block** — `setupRealRepo`, create a tmpfile path for DEBUG_CWD; `spawnSync` with `KAOLA_WORKFLOW_OFFLINE=1` + `KAOLA_WORKFLOW_DEBUG_CWD=tmpfile`; assert `result.status === 0`; assert feature branch not present (`git branch --list workflow/test-proj` returns empty); assert DEBUG_CWD file exists and contains mainRoot path
- Mirror: Existing `withForge(stubs, fn)` + `spawnSync` subprocess patterns in test-gitlab-sinks.js; GitHub test patterns for exit-2/3
- Validate: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` — all pre-existing blocks (lines 144-220) pass; new blocks fail RED (implementation not yet written)

### Task 3: Implement new pipeline in sink-merge.js

- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`
- Test File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`
- Write Set: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`
- Depends On: Task 1, Task 2
- Parallel Group: serial (step 3)
- Action: MODIFY
- Implement:
  1. **New requires at top**: `const os = require('os');` + `const { getCoordRoot, readActiveFolders, removeWorktree } = require('./kaola-gitlab-workflow-claim');`
  2. **Module-level env reads**: `const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';` + `const FORCE_FF_FAIL = parseInt(process.env.KAOLA_WORKFLOW_FORCE_FF_FAIL || '0', 10);`
  3. **`mainRootFromCoord(coordRoot)`** — private helper: `const base = path.basename(coordRoot); return base === '.git' ? path.dirname(coordRoot) : coordRoot;`
  4. **`classifyMergeError(e)`**:
     ```js
     function classifyMergeError(e) {
       const token = process.env.KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE;
       if (token) return token;
       const msg = (e.stderr || e.message || '');
       if (/protected branch|pre-receive hook declined/i.test(msg)) return 'branch_protected';
       if (/rejected/.test(msg) && /non-fast-forward/.test(msg)) return 'non_fast_forward';
       if (/conflicts with target/i.test(msg)) return 'non_fast_forward';
       if (/permission denied|403|not authorized|not allowed to push|not allowed to merge/i.test(msg)) return 'permission_denied';
       return null;
     }
     ```
  5. **`doRebase(args, alreadyUpToDate, mainRoot)`**: If `!alreadyUpToDate`: `git rebase origin/main -C mainRoot`; on failure: swallow `git rebase --abort`, throw multi-line remediation error. If `!alreadyUpToDate && !OFFLINE`: run `npm test` in `mainRoot` (execFileSync).
  6. **`ffMergeLoop(args, mainRoot)`**: `MAX_AUTOMERGE_RETRIES=3`. Loop up to MAX: if `!OFFLINE`: checkout main, `git pull --ff-only`, checkout branch; checkout main; if `forcedFailCount < FORCE_FF_FAIL`: increment forcedFailCount, checkout branch, increment retries, continue; else try `git merge --ff-only -- branch`; on success return true; on failure: checkout branch, increment retries; after loop return false.
  7. **`postMergeCleanup(args, mainRoot)`**: Try `git push origin main` (skip if OFFLINE; if `KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE` is set, throw synthetic push error). On push error: `classifyMergeError(e)` → null → rethrow; token → `git reset --hard origin/main` + write receipt JSON to `{mainRoot}/kaola-workflow/{args.project}/.cache/sink-fallback.json` + return `{exitCode:3}`. On push success (or OFFLINE skip): if `!OFFLINE && args.issue != null`: `forge.createIssueNote(args.project, args.issue, 'Merged via sink-merge.')` (swallowed) + `forge.closeIssue(args.issue)` (swallowed). `git branch -d -- {branch}` (swallowed). If `!OFFLINE`: `git push origin --delete -- {branch}` (swallowed). Return `{merged:true}`.
  8. **`runDirectMerge` expansion**: Keep current arg validation + `finalValidationPassed` check. Then branch: if `opts.skipGit === true` → existing legacy path (fastForwardMain + closeLinkedIssue). Else: resolve `root = opts.root || getRoot()`, `mainRoot = mainRootFromCoord(getCoordRoot(root))`; **register `process.on('exit')`** (chdir back + DEBUG_CWD write) FIRST; then `process.chdir(os.tmpdir())`; find folder via `readActiveFolders`; `try { removeWorktree(mainRoot, args.project, folder); } catch (_) {}`; if `!OFFLINE` fetch; `git checkout branch`; **merge-base skip-check** (with try-catch → `alreadyUpToDate = true` on error); `doRebase(args, alreadyUpToDate, mainRoot)`; `ffMergeLoop` → if false return `{exitCode:2}`; `postMergeCleanup` → propagate if `{exitCode:3}`; return `{merged:true}`.
  9. **`main()`**: after `runDirectMerge`, if `result.exitCode` is set: `process.exitCode = result.exitCode`.
  10. **`module.exports`**: add `classifyMergeError` to the exports object.
- Mirror: `scripts/kaola-workflow-sink-merge.js` lines 40-275 for all function implementations; GitHub merge-base try-catch (lines 246-257); exit hook order (lines 207-235)
- Validate: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` → exits 0, prints "GitLab sink tests passed"

---

## Advisor Notes

Three corrections applied from `.cache/advisor-plan.md`:

1. **Task 1 confirmed**: `getCoordRoot` is genuinely missing from claim.js `module.exports` — it's defined but not exported. Task 1 is required.

2. **Merge-base skip-check must have try-catch**: GitHub lines 246-257 wrap in try-catch; on error (e.g., no `origin/main` ref in OFFLINE tests), set `alreadyUpToDate = true`. This makes OFFLINE tests work without needing a real origin remote. Applied in Task 3 implementation spec.

3. **Exit hook registration order**: `process.on('exit')` must be registered BEFORE `process.chdir(os.tmpdir())` and BEFORE `removeWorktree`. GitHub lines 207-235 confirm: register hook → chdir → removeWorktree. Applied in Task 3 implementation spec.

4. **`removeWorktree` safety**: When `folder` is undefined, falls back to `worktreePathFor`; if that path doesn't exist, `git worktree remove` throws but the call is in try-catch — safe for tests with no registered worktree.

---

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | — | Advisor corrections were mechanical (no approach change, no task boundary change); synthesized directly into phase3-plan.md |
