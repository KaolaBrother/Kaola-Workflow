# Phase 6 - Summary: issue-62

## Delivered

`archiveProjectDir` (in all 3 forge variants) now atomically removes the main repo's `kaola-workflow/{project}/` copy after the linked-worktree rename succeeds, gated by a `realpathSync`-based comparison so the operation is a no-op when running from the main repo. Closes the regression of issue #62 (Phase β assumed removing the heartbeat ticker would eliminate the duplicate-folder bug shape; main-session phase artifact writes were a second mechanism still active).

## Files Changed

Implementation:
- `scripts/kaola-workflow-claim.js` — 9-line cleanup block in `archiveProjectDir`
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` — byte-identical mirror
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` — ported `getCoordRoot` + `mainRootFromCoord` helpers; same cleanup block

Tests:
- `scripts/simulate-workflow-walkthrough.js` — 3 new regression tests (`testFinalizeFromLinkedWorktreeCleansMainCopy`, `testFinalizeFromMainRootNoSpuriousRemoval`, `testReleaseFromLinkedWorktreeCleansMainCopy`)

Documentation:
- `commands/kaola-workflow-phase6.md` — Step 8b note explaining cleanup mechanism + cwd-precise no-op clarification
- `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` — same note (Codex mirror)
- `plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md` — same note (GitLab mirror)
- `CHANGELOG.md` — new "Fixed" entry under `[Unreleased]`

Diff stat: 8 files changed, 197 insertions(+).

## Test Coverage

3 new regression tests in `scripts/simulate-workflow-walkthrough.js`:
- T1 (smoking gun): finalize from linked worktree → main copy cleaned
- T2 (no-op guard): finalize from main root → no spurious removal of archive
- T3 (Option A discriminator): release from linked worktree → main copy cleaned (proves cleanup is in `archiveProjectDir`, not `cmdFinalize`-only)

RED proven during Phase 4 (commented out the cleanup block → T1 fails on `main worktree copy of issue-701 must be cleaned up after finalize from linked worktree`).

GREEN verified after restoring the cleanup block + on the full `npm test` and `npm run test:kaola-workflow:gitlab` matrices.

## Final Validation Evidence

Commands run (Step 1):
- `npm test` → both `:claude` and `:codex` packs pass
- `npm run test:kaola-workflow:gitlab` → GitLab pack passes
- Implicitly covered: `validate-script-sync`, `validate-vendored-agents`, `validate-workflow-contracts`, `validate-kaola-workflow-contracts`, `validate-kaola-workflow-gitlab-contracts`, 4 simulators

Raw output: `kaola-workflow/issue-62/.cache/final-validation.md`.

## Documentation Docking

DOCKED — see `kaola-workflow/issue-62/.cache/doc-docking.md`.

## Final Validation Failure Ledger

| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | | | | |

## Follow-Up Items

From Phase 5 review (deferred LOW):
- LOW-1: Add explicit real-repo no-op test (`initGitRepo` + finalize from main, assert archive intact). Implicit coverage from `testFinalizeReleaseCleansWorktree` is adequate.
- LOW-2: GitLab `worktreePathFor` coord-aware refactor (not blocking; out of scope per Phase 2).

From Phase 2 ideation (deferred):
- AC #4: One-time sweep script for existing stale duplicates in other repos. Phase 1 found no current stale duplicates in this repo, but live evidence of `kaola-workflow/issue-87/` exists (predates this fix; will not be cleaned by this fix retroactively). Could become a follow-up if needed.

Phase 6 sweep observed two pre-existing orphan folders in this main repo that this fix does NOT retroactively clean:
- `kaola-workflow/issue-87/` (phase 5 review state)
- `kaola-workflow/archive/issue-920.discarded-...` (already archived, OK)

These pre-date the fix; AC #4 (sweep script) would address them. Deferred.

## Closure Decision

No deferred items requiring user authorization. Phase 6 closure gate scan:
- No partial implementation
- No unresolved conflicts
- No CRITICAL/HIGH review findings outstanding
- MEDIUM finding fixed inline; LOWs explicitly deferred and recorded above

Advisor consulted at Phase 2 and Phase 3 gates (entries under `.cache/advisor-*.md`). No advisor closure gate required for this finalize.

## Commit And Push

Pending final Git gate (Step 8 → Step 9 → final merge & push). Final hash will be appended to the comment on issue #62 only after push.

## GitHub Issue

Will close issue #62 after acceptance criteria pass and the merge lands on `main`. AC checklist from the reopen comment:

- [x] `cmdFinalize` removes the main-worktree live folder atomically alongside the linked-worktree rename (verify-then-delete safety)
- [x] Scope: `KAOLA_WORKTREE_NATIVE=1` + merge sink; PR sink untouched (no `cmdWatchPr` changes; runs from main root, no-op condition)
- [x] `simulate-workflow-walkthrough.js` adds regression assertion (3 new tests)
- [ ] One-time sweep for existing stale duplicates (DEFERRED — see Follow-Up Items)
- [x] Mechanism documented in `commands/kaola-workflow-phase6.md` (+ 2 SKILL.md mirrors)

5 of 6 AC items satisfied; #4 (one-time sweep) explicitly deferred with rationale.

## Roadmap

Will be updated by `kaola-workflow-roadmap.js generate` in Step 7. `kaola-workflow/.roadmap/issue-62.md` (per-issue source) deleted; `kaola-workflow/ROADMAP.md` regenerated to reflect closure.

## Archive

Pending: `cmdFinalize --keep-worktree` runs in Step 8b from the linked worktree at `kaola-workflow.kw/issue-62`. This will:
1. Rename `kaola-workflow.kw/issue-62/kaola-workflow/issue-62/` → `kaola-workflow.kw/issue-62/kaola-workflow/archive/issue-62/`
2. **NEW (the fix being validated)**: also remove `kaola-workflow/issue-62/` from the main repo at `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/`

This is the live self-test: Phase 6 of issue #62 validates the fix on its own folder.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked | `.cache/doc-updater.md` (agent a9b8f68f4ab31bfd5) | |
| documentation docking | invoked | `.cache/doc-docking.md` | |
| closure advisor gate | N/A | no closure-decision items requiring user input | No deferred AC items requiring authorization beyond the documented Follow-Up section |
| final-validation fix executors | N/A | all final validation passed without fixes | |
| roadmap refresh | pending | scheduled for Step 7 | |
| archive completed folder | pending | scheduled for Step 8b | |
| final commit and push | ready | git status / git diff verified; upstream tracked | final gate runs after this file is committed |

## Status

READY FOR FINAL GIT GATE
