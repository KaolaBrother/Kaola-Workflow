# Advisor Response — issue-148 Phase 3 Plan

## Verdict
Blueprint is ready. Proceed to Phase 4 after the pre-flight checks below.

## On the `withForge` → PATH-shim pivot
The architect's deviation from Phase 2's `withForge` recommendation is **correct**, and overrides Phase 2 strengthening point #4.

Reasoning:
- `cmdStaleWorktreeCheck` is unexported → only reachable by spawning claim script as subprocess.
- `withForge` mutates the **parent's** in-process `forge` singleton; the subprocess `require()`s its own copy.
- The GitHub reference uses `writeGhShimForStale` + PATH-prepended `runClaimOnline` for exactly this reason.

This is empirical, not aesthetic. Document the deviation explicitly in `phase3-plan.md` with rationale: "unexported cmd → subprocess only → in-process stubs don't cross process boundary."

## Pre-flight checks (completed before writing phase file)

```bash
grep -nE '(^|[^a-zA-Z_])function output\b|^const OFFLINE\b|execFileSync' \
  plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js \
  plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js
```

Results (verified):
- `output` function: ✓ GL:314, GT:316
- `OFFLINE` constant: ✓ GL:19, GT:19
- `execFileSync`: ✓ GL:6, GT:6

```bash
grep -n 'runClaimOnline\|writeGlabShimForStale\|writeTeaShimForStale' \
  plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js \
  plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js
```

Results: No collisions. Both helpers are absent and need to be added.

`wt.HEAD` field: Verified correct — `git worktree list --porcelain` uses `HEAD <hash>` which parses to `entry.HEAD`. ✓

`writeState` in GL test: writes `issue_number: N` in Sink block with `status: active`. Sub-case 3 works as designed. ✓

## Recommendation: Add 6th OFFLINE sub-case
The Phase 2 cap was 5 to skip the GitHub-specific `gh` shim case, NOT to skip the OFFLINE path. The `OFFLINE ? false : issueIsClosed(...)` ternary branch goes untested with only 5 cases — if inverted, tests stay green.

**Recommend adding sub-case 6**: create archived folder (no worktree, no registered branch), run with `KAOLA_WORKFLOW_OFFLINE=1` (inline env via spawnSync), assert the archived folder does NOT appear in stale results (since OFFLINE sets `isClosed=false` and the archive check alone doesn't apply to loose branches — or if the test plants an archived worktree, assert it IS stale via archive path). This closes the OFFLINE branch of `cmdStaleWorktreeCheck`. ~10 lines.

Simplest form: plant an archived worktree (sub-case 2 approach), run OFFLINE, assert it shows as stale (archive→stale path, no API call).

## Summary

| Item | Status |
|------|--------|
| `withForge` → PATH-shim pivot | Approved, supersedes Phase 2 withForge suggestion |
| Forge-specific regex + `for-each-ref` | Correct |
| `refs/heads/` strip on worktree branch | Correct |
| Symbol availability (`output`, `OFFLINE`, `execFileSync`) | Verified present |
| Helper/test-name collisions | Verified none |
| Drop to 5 sub-cases | Recommend adding 6th OFFLINE sub-case |
| Phase 2 → Phase 3 deviation audit trail | Add explicit note in `phase3-plan.md` |

No blocking concerns. Blueprint is ready for Phase 4 after adding OFFLINE sub-case to task specifications.
