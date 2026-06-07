# Node impl-core (tdd-guide) — evidence

## RED
`testWorktreeNativeDefaultOff` (Case A extension) failed before impl:
```
Error: NATIVE=0 must checkout in-place branch workflow/issue-505, got: main
    at testWorktreeNativeDefaultOff (simulate-workflow-walkthrough.js:2729:5)
```
Cases B/C/D/F structurally RED (no in-place block / no cmdRelease branch-restore existed).

## GREEN
- `node scripts/simulate-workflow-walkthrough.js` → `Workflow walkthrough simulation passed`
- FULL `npm test` green across all four suites:
  - validate-script-sync: `OK: 15 common scripts and 5 byte-identical file group in sync`
  - codex: `Kaola-Workflow walkthrough simulation passed`
  - gitlab: `GitLab workflow walkthrough simulation passed`
  - gitea: `Gitea workflow walkthrough simulation passed`
(gitlab/gitea pass because the existing forge #149 tests still only assert worktree_path==='' — forge in-place logic + extended assertions are node impl-forge's job.)

## Files / functions changed (3 declared)
1. `scripts/kaola-workflow-claim.js`:
   - NEW internal helpers `inPlaceHead(root)`, `treeDirty(root)`, `defaultBranch(root)` near hasGitHistory/branchExists.
   - `claimProject`: hoisted `buildBranchName` above mkdir; dirty-tree refusal gate (`status:'dirty_tree_refused'`, no folder/branch) after existing-early-return+probe, before mkdir; standalone in-place checkout block gated `!OFFLINE && hasGitHistory && !WORKTREE_NATIVE && headBranch!=='HEAD'` (branchExists→checkout idempotent, else checkout -b); `baseBranch` trap guard `(cur && cur!=='HEAD' && cur!==branch)?cur:''`; never crash/refuse on detached/no-history/error (surfaces inPlaceNote, still acquires); threads base_branch+inPlaceNote into writeState + returned object. Existing worktree block UNCHANGED.
   - `writeState`: `if (data.base_branch) lines.push('base_branch: ' + data.base_branch);` in ## Sink.
   - `cmdRelease`: reads `savedBaseBranch` via `field(fs.readFileSync(folder.state_file))` BEFORE archiveProjectDir (ordering fix); feature-branch-delete algorithm with cur===featureBranch guard (checkout base/default before delete), dirty check, removeBranch; only deletes folder.branch. active-folders.js NOT touched.
2. `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`: BYTE-IDENTICAL to #1 (`diff` empty; validate-script-sync OK).
3. `scripts/simulate-workflow-walkthrough.js`: extended Case A; added Case B (idempotent re-claim, folder-absent-branch-present), C (dirty refusal), D (detached record-only), F (discard restores base+deletes branch, run from outside folder), + a non-default-base discriminating test (claim from `develop`, discard restores to develop not main — proves base_branch is read, not just defaultBranch fallback). All 6 registered in the run block.

## non_tdd / flags for review
- BEHAVIOR CHANGE: `cmdRelease` now deletes the feature branch in NATIVE=1 worktree mode too (ungated by mode) — previously kept. Arguably better discard cleanup; no existing test asserted survival. Flag for reviewer.
- Out of scope (plan-flagged): worktree-provision-failure no-branch gap (unchanged); watch-pr CLOSED/abandoned removeWorktree paths have no base-restore (symmetric follow-up); forge ports → impl-forge; docs → impl-docs.
