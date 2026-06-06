# impl node evidence — issue #256

## What was added

1. `testWorktreeNativeSurfacesProvisionFailure()` — new test function at ~line 2743 in
   `scripts/simulate-workflow-walkthrough.js`. Plants a regular FILE at `kwRoot` (the
   `.kw` sibling dir) before the claim runs, causing `provisionWorktree`'s
   `fs.mkdirSync(path.dirname(wtPath), {recursive:true})` to throw EEXIST. Asserts:
   `claim === 'acquired'`, `worktree_path === ''`, and `/EEXIST/.test(worktree_error)`.
   Uses issue 507, `runClaimOnlineLastJson`, `initGitRepo`, `writeGhShimForStartup`.

2. Registered in the test runner immediately after `testWorktreeNativeOfflineWins()` (line ~6354).

3. Regression assert added to `testWorktreeNativeDefaultOff`: `result.worktree_error === undefined`
   (gate-off path must not surface the error field).

4. Regression assert added to `testWorktreeNativeOfflineWins`: `parsed.worktree_error === undefined`
   (offline path must not surface the error field).

---

## RED run (claim.js catch re-silenced: `catch (_) {}`)

Command: `node scripts/simulate-workflow-walkthrough.js`

Relevant output:

```
testClassifierDependsOnGate: PASSED
Error: worktree_error must match /EEXIST/ when provision fails due to file collision, got: undefined
    at assert (.../scripts/simulate-workflow-walkthrough.js:22:25)
    at testWorktreeNativeSurfacesProvisionFailure (.../scripts/simulate-workflow-walkthrough.js:2759:5)
    at main (.../scripts/simulate-workflow-walkthrough.js:6354:5)
```

EXIT_CODE: 1

---

## GREEN run (claim.js restored byte-for-byte via `git checkout -- scripts/kaola-workflow-claim.js`)

Command: `node scripts/simulate-workflow-walkthrough.js`

Final lines:

```
testAdaptiveCheapWinFixes: PASSED
testAdaptiveAuditCoverage: PASSED
Workflow walkthrough simulation passed
```

EXIT_CODE: 0

---

## git status confirmation

`git status --porcelain` output after restore:

```
A  kaola-workflow/.roadmap/issue-256.md
 M scripts/simulate-workflow-walkthrough.js
?? .cache/
?? kaola-workflow/archive/issue-244-stage-a/
?? kaola-workflow/archive/issue-244-stage-b/
?? kaola-workflow/archive/issue-244-stage-c1/
?? kaola-workflow/archive/issue-244-stage-c2/
?? kaola-workflow/archive/issue-246/
?? kaola-workflow/issue-256/
```

Only `scripts/simulate-workflow-walkthrough.js` is modified among tracked files.
`scripts/kaola-workflow-claim.js` shows clean (restored). Declared write-set satisfied.
