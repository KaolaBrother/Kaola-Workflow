# Code Review — issue-38 Phase 4

## Verdict: APPROVE

0 CRITICAL, 0 HIGH findings. Both test suites pass.

## Correctness of Extracted Helpers

All 6 helpers (buildClaimedBranchSet, fetchOpenIssues, findMainWorktree, detectCurrentProject, scanPhaseArtifacts, commitWorktreeArtifacts) are correct verbatim lifts. No logic changes.

commitWorktreeArtifacts: `findMainWorktree() || root` fallback is sound.

## Case Correctness

- 17K: `awk substr($0,10)` correct (1-indexed, "worktree " is 9 chars). `fs.realpathSync` comparison handles macOS symlinks. Green on macOS.
- 17G-17J: state setup and cleanup correct.
- LOW-3 fix: `path.dirname(pick17a.worktree_path)` is correct and more robust.

## Findings

### CRITICAL
none

### HIGH
none

### MEDIUM
- MEDIUM-1 (info): `findMainWorktree()` inside `commitWorktreeArtifacts` has implicit cwd dependency — no explicit `cwd` passed to execFileSync. Not a current bug (cwd is always repo root at call time), but fragile for future callers. Future hardening: pass `cwd: root` to the git call inside findMainWorktree, or accept a root parameter.

### LOW
- LOW-1: `scanPhaseArtifacts` phase-6 ternary in nextCommand is redundant (PHASE_ARTIFACTS entry already has `next: 'complete'`).
- LOW-2: parity loop in validate-workflow-contracts.js checks `claimContent` redundantly (already checked by assertIncludes above it).
- LOW-3: MEDIUM-3 (issue field now integer) is a JSON output change that could silently break any external consumer doing string comparison on `resume.issue`. Acceptable given issue #38 AC explicitly requires integer, but worth documenting.

## Line Count Verification

- cmdPickNext: 52L (2 over target due to MEDIUM-2 stderr line — acceptable)
- cmdResume: 38L ✓
- cmdWorktreeFinalize: 27L ✓
