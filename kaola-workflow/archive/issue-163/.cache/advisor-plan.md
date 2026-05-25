# Advisor Gate — issue-163 Phase 3 Plan

## Status: RESPONDED (advisor available this round)

## Advisor Confirmation
Blueprint is executable. Three pre-lock verifications required.

## Verification Results

### V1 — `runClaimOnline` OFFLINE=0 override (test 3 blocker)
CONFIRMED: L491 hardcodes `KAOLA_WORKFLOW_OFFLINE: '0'` AFTER `extraEnv` spread.
Resolution: Test 3 (offline finalize) must use direct `spawnSync` with `{ KAOLA_WORKFLOW_OFFLINE: '1' }` and no gh shim.
`runNode` (L22) also sets OFFLINE:'1' after extraEnv, returns raw spawnSync result — usable but requires manual JSON parse.
**Decision**: test 3 uses direct `spawnSync` pattern (same as L577–584).

### V2 — Existing watch-pr emit consumers
CONFIRMED safe: L661 checks `result.watched`, L1946 checks `wpResult.watched`, L2229-2232 checks `watchResult.warnings`.
None check for `cleanups` or use a closed-set test. Adding `cleanups[]` is additive.

### V3 — AC wording audit/execute
AC: "Add an audit command" + "Add an execute mode or documented repair command".
Two-command split (`audit-labels` + `repair-labels`) follows `stale-worktree-check`/`stale-worktree-cleanup` precedent.
AC does not require single-command form. Two-command split is confirmed.

## Advisory Notes
- Place `in-progress-label-removed` invariant check OUTSIDE the `issueNumber > 0` guard with a comment explaining why (offline-skip must resolve to no-violation even when issueNumber is null).
- After #163 lands, re-read #164 body fresh before starting — patterns from #163 anchor #164's receipt shape.
