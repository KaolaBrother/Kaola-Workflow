# Phase 1 - Research / Discovery: issue-223

## Deliverable
Three grouped lifecycle fixes in `kaola-workflow-claim.js` (all four editions), each confined to one function, plus regression tests:
- **#13** `checkClosureInvariants` skips the two roadmap invariants (`roadmap-source-absent`, `roadmap-mirror-clean`) when `receipt.archive === 'abandoned'`.
- **#14** `claimProject` reclaims an orphaned stateless project dir (empty dir, no `workflow-state.md`, left by a crash between `mkdirSync` and `writeState`) instead of returning `target_occupied` forever.
- **#15** `cmdPatchBranch` asserts `isSafeName(args.project)` and an existing active folder before `updateState`, preventing a phantom active folder and a path-traversal write.

## Why
- #13: watch-pr's CLOSED (abandoned) branch sets `receipt.archive='abandoned'` (source intentionally preserved, mirror keeps `#N`), then `checkClosureInvariants` asserts `roadmap-source-absent` + `roadmap-mirror-clean` — both fire as false positives (`closure_invariants.ok:false`), misleading a direct receipt consumer. The `archive-state-closed` invariant was made abandonment-aware; these two were not.
- #14: `claimProject` does `fs.mkdirSync(dir)` before `writeState`; a crash in that window leaves an empty dir with no state file. `readActiveFolders` skips it (invisible to status/release/discard) yet re-claim throws EEXIST → `target_occupied` forever. Only `finalize` clears it (mislabeling a never-started orphan as a completed closure).
- #15: `cmdPatchBranch` asserts only project/branch then calls `updateState()` (mkdir + write a state file with no `status:` line → `readActiveFolders` counts it active, status `unknown`), and lacks the `isSafeName` guard that `cmdClaim`/`cmdSinkFallback` have (a traversal name writes outside `kaola-workflow/`).

## Affected Area (verified; line numbers corrected from stale issue text)
- `scripts/kaola-workflow-claim.js` (root, CANONICAL):
  - `checkClosureInvariants` :574-628 (roadmap invariants :577-591; archive-state-closed :615 already abandonment-aware)
  - `claimProject` EEXIST branch :404-409 (mkdir window :402-409; writeState :416; `stateFile` helper :262)
  - `cmdPatchBranch` :734-744 (project/branch asserts :737-738; `isSafeName` imported :10; `activeByProject` :382)
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (Codex) — byte-identical to root (COMMON_SCRIPTS, validate-script-sync gate); restored via `cp`.
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`, `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` — forge-adapted (glab/tea, `issue_iid`, MR); same logical edits hand-applied; NOT in validate-script-sync scope → need own forge tests.
- `scripts/kaola-workflow-closure-contract.js` (+3 copies) — **NOT modified**. It holds only the `CLOSURE_INVARIANTS` data array; `checkClosureInvariants` lives in claim.js. (Corrects the issue's file reference.)
- Tests: `scripts/simulate-workflow-walkthrough.js` (root + Codex coverage via byte-identity); `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` + gitea equivalent (forge patch-branch/claim-orphan currently untested).

## Linked issue
GitHub #223 (grouped tracker for audit findings #13/#14/#15). Acceptance: all 3 sub-fixes done, byte-sync intact, full suite green.
