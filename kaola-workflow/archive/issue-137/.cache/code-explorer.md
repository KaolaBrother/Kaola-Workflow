# Code Explorer Output: issue-137

## 1. Finalization Flow

**cmdFinalize** — `scripts/kaola-workflow-claim.js:456–481`
- Calls `archiveProjectDir(root, args.project, 'closed')` — purely filesystem, no push
- Does NOT push anything; finalize is local-only

**Sink-merge path** — `scripts/kaola-workflow-sink-merge.js`
- `main()` at line 216 is the full merge flow
- Guards at lines 264 (`assertCleanWorktree`) and 266 (`assertNoLiveWorkflowFolder`)
- Guard insertion point: between lines 266 and 283 (after `assertNoLiveWorkflowFolder`, before `doRebase`)

## 2. Push Locations

- Main merge push: `kaola-workflow-sink-merge.js:173` — `git push origin main`
- Feature branch delete push: `kaola-workflow-sink-merge.js:211` — `git push origin --delete -- <branch>`
- Sink-PR branch push: `kaola-workflow-sink-pr.js:137` — `git push origin <branch>`

## 3. Existing Git Commands Used

No `rev-list --left-right`, `ahead`, `behind`, or `@{u}` in any script.
Only relevant: `simulate-workflow-walkthrough.js:964` uses `rev-list --count HEAD` (test-only, not upstream check).

## 4. Existing Guard Pattern (assert* in sink-merge.js)

```js
function assertCleanWorktree(mainRoot) { ... }     // line 64
function assertNoLiveWorkflowFolder(mainRoot, project) { ... }  // line 71
```
Both throw `new Error(message)`. Main try/catch writes to stderr + sets exitCode=1.

New guard name: `assertBranchFullyPushed(mainRoot, branch)` — follows the pattern.
Skip when `OFFLINE` is true (consistent with lines 125, 172, 203, 210).

## 5. Test Patterns

- `testSinkMergeRefusesLiveFolder` at line 1089 — skeleton for blocking guard test
  - `initGitRepo(tmp)` → make commits → run guard via spawnSync → assert exit != 0 + stderr message
- `testSinkMergeFromLinkedWorktree` at line 756 — how to set up a feature branch with commits

## 6. Naming Conventions

- Guard functions: `assert*` prefix in `sink-merge.js`
- Helper functions in `claim.js`: camelCase nouns (`branchExists`, `hasGitHistory`, `archiveProjectDir`)

## 7. output() and assert()

- `output(obj, code)` at `claim.js:357` — writes JSON to stdout
- `assert(cond, msg)` at both `claim.js:20` and `sink-merge.js:12` — throws Error
- Errors bubble to try/catch at script entry, written to stderr + exit 1

## Key Implementation Insight

The publish guard must go in `kaola-workflow-sink-merge.js` (where the actual git push happens), NOT in `cmdFinalize` (which never pushes). The guard should:
- Resolve upstream via `git rev-parse --abbrev-ref <branch>@{u}` or fall back to `origin/<branch>`
- Use `git rev-list --count <upstream>..<branch>` for ahead count
- Use `git log --oneline -5 <upstream>..<branch>` for representative commits
- Throw with branch name, upstream, ahead count, and sample SHAs
- Skip when `OFFLINE === true`
