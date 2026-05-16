# Advisor Ideation Cache — issue-33
Generated: 2026-05-16

## Advisor Input

Reviewed Phase 1 research and planner output for issue-33. Planner proposed three approaches (A: Node-only, B: Shell-only, C: Two-track). Asked for: missed approaches, risk accuracy, recommendation soundness, and gotchas.

## Advisor Response Summary

### Recommendation Confirmed: Approach C (Two-Track)

Approach C is the right call. Node-only (A) ships a half-fix that passes tests but leaves the user-visible symptom; Shell-only (B) fixes the headline but leaves the script vulnerable to crash on its own `git` calls when launched from inside a deleted directory.

### Risks Are Accurate

- Approach A risk of false confidence is real — the test suite runs sink-merge as a child process so the host CWD is never affected, meaning test 16G would pass even without the fix.
- Approach B leaving the script-level CWD bug latent is also real — if the script makes any `git` call after worktree removal and before the shell-side `cd`, it will operate from a deleted path.
- Both risks are correctly characterized as Medium/Low in Approach C.

### Critical Gap Flagged

The advisor flagged that `scripts/kaola-workflow-claim.js` has two additional `removeWorktree` calls at lines 1971 and 1977 (not in the planner output). The issue body mentions "sink-pr on PR MERGED calls removeWorktree" — these may be in `cmdWatchPr`. If `watch-pr` invokes `removeWorktree` from inside a worktree, those paths need the same Node-side chdir treatment.

**Resolution (verified post-advisor):** Lines 1971/1977 are in `cmdWatchPr`. `watch-pr` is always invoked via `runBootstrapWatchPr` (line 1082) with `cwd` explicitly set to the repo root — it never runs from inside a worktree. `removeWorktree()` in `cmdWatchPr` will not hit the deferred path; the subprocess CWD is always valid. No `process.chdir()` needed in `cmdWatchPr`.

### No Missed Approaches

Two-track is complete. No additional approaches are viable — a generic `restoreCwd()` helper is YAGNI at 2 call sites, and a `removeWorktree()` return-shape refactor is unnecessary scope.

### Gotchas That Could Change the Decision

1. **`getRoot()` is CWD-dependent**: `getRoot()` calls `git rev-parse --show-toplevel` from `process.cwd()`. After worktree deletion, `process.cwd()` is a deleted path and `git` will fail. Therefore the Node-side fix must derive main root from `coordRoot` (already captured before removal), NOT by calling `getRoot()` again after removal. The `mainRootFromCoord(coordRoot)` pattern is correct.

2. **Shell-side must capture root BEFORE dispatch**: The shell `_MAIN_ROOT` capture must happen before the `case "$SINK_KIND"` dispatch — after sink-merge runs and removes the worktree, `git rev-parse --show-toplevel` from the now-deleted path will fail. Capturing before is the correct order.

3. **Test probe design**: The `KAOLA_WORKFLOW_DEBUG_CWD` probe must be written by the script itself (before `process.chdir()` mutates CWD) and read after the child process exits. The probe file must be in a path that exists independently of the worktree (e.g., in `epic16Tmp` or `/tmp`).

### Out-of-Scope Confirmed

- `drainPendingRemovals()` chdir: only called from sweep subprocess, independent CWD
- `cmdWatchPr` removeWorktree calls (lines 1971/1977): always run from repo root
- Generic `restoreCwd()` helper: YAGNI
- `sink-pr.js` JS changes: no `removeWorktree` call
- `removeWorktree()` return-shape refactor: out of scope
