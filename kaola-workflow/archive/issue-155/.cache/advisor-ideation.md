# Advisor — issue-155 Phase 2 Ideation Gate

## Verdict: Proceed with Approach A

Recommendation is sound. Planner correctly identified dual-path problem (classifier route + `cmdClaim` bypass), correctly scoped `issueIsClosed` narrowly, surgical-change rationale is correct. Options B and C correctly dismissed.

## Key Change: Use `target_unavailable` (not `user_target_remote_unavailable`)

The router doc (`commands/kaola-workflow-next.md`) already enumerates expected typed refusals:
> `target_occupied`, `user_target_blocked`, `user_target_red`, `target_mismatch`, `target_unavailable`

The issue body explicitly proposes `target_unavailable` / `remote_validation_unavailable` / `classifier_unavailable`. Neither references `user_target_remote_unavailable`.

**Decision: Use `target_unavailable` for both verdict (classifier output) and status (claim return).**

Rationale: matches shipped router doc (no doc drift), matches issue proposal, removes the verdict→status mapping layer.

## Gotchas for Phase 3/4

1. **GitLab/Gitea `cmdClaim` symmetry** — Phase 3 plan must include "read GitLab `cmdClaim` and Gitea `cmdClaim`" before deciding whether the `claimProject` guard mirror is a no-op. Do not assume structural symmetry.

2. **Keep distinct reasoning strings on 3 GitHub wrapper leaks:**
   - Leak 1: "classifier unavailable" (file missing) = packaging bug
   - Leak 2: "classifier returned empty output" = contract bug
   - Leak 3: "classifier failed (subprocess error)" = most likely remote failure
   These have different remediation signals; do not collapse them.

3. **Router doc Parallel-decision line** — `workflow-next.md` lists `{green|yellow|red|blocked|skipped}` for the Parallel decision printout. Adding `target_unavailable` to that enumeration is part of the deliverable.

4. **Phase 4 delta check** — Verify no existing test asserts `verdict: 'green'` from bootstrap/pick-next with a failing-fetch in online mode. OFFLINE tests stay green (early-return preserved). Online tests that assert green on failing fetch are asserting the bug and need updating; flag as a delta, not silently overwritten.

## Not a Concern

- `cmdStartup` auto-mapping verified live — no mapper changes needed
- `issueIsClosed` 4 safe callers untouched — correct read of AC #3
- OFFLINE existing tests must still pass — well-flagged as AC #5
