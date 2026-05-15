# Advisor Plan Gate: cross-machine-hardening

## Verdict: Proceed — no architect revisions needed

The blueprint produced by code-architect is implementation-ready. A developer can work from it without consulting any research docs. Specific findings below.

## Build Sequence: Dependency-Safe

The P0→P1→P2→P3 sequential lane for `claim.js` is correctly ordered:
- P0-C (`runTiebreakerCheck`) is extracted before P1 uses it from `cmdClaim` and P2 uses it from `cmdTicker` tick-1.
- P3-A (`releaseSession` assignee fix) can be done in the same edit pass as P3-B if desired.
- P4 (tests) correctly depends on all P0–P3 being complete. The note about writing test scaffolding in parallel with P2/P3 but only validating after P3 is sound.
- P5 (phase markdowns + `.gitignore`) is truly parallel — no dependency on claim.js compilation or state.

## Missing Integration Points

**1. `sleepMs` dependency for tiebreaker retry**: The blueprint says to mirror the bounded-retry pattern from `cmdClaim` lines 215-218, but the delays are 250ms and 750ms — confirm `sleepMs` helper exists in claim.js or plan to inline `setTimeout`-based async. If `sleepMs` is synchronous (`execFileSync`-based), it will block the process which is fine in a CLI context but document it.

**2. Ticker `--interval` parameter for tests**: Test 9A3 spawns ticker with `--interval 1` but the blueprint's `cmdTicker` spec only mentions `--session` flag. Add `--interval` (override in milliseconds) to `cmdTicker` signature to make it testable without waiting 15 minutes.

**3. `updateLeaseInPlace` vs direct write**: Ticker's "bump local lock" step mentions both `fs.writeFileSync(lockPath...)` AND `updateLeaseInPlace(stateFile, updated)`. These must update the same fields (`last_heartbeat`, `expires`) — confirm `updateLeaseInPlace` at phase commands is idempotent when called from an external process and that `stateFile` path is derivable from the lock data.

**4. `main()` OFFLINE guard**: `cmdTicker` should check `KAOLA_WORKFLOW_OFFLINE` and exit early (no-op), matching the pattern in `cmdHeartbeat`. Without this, tests that use `KAOLA_WORKFLOW_OFFLINE=1` will unexpectedly start a ticker that fails to reach the shim.

## Error Path Coverage

**Adequate**: All gh failures default to stay-claimed or skip-sweep (safe). `isRemoteStale` returns false on any error. `postReleaseComment` silently swallows errors (release already done; comment is best-effort).

**One gap**: Test 9A3 requires the ticker to self-terminate within 2 seconds of spawning. With `--interval 1` ms, this is achievable. But the test must also write a valid lock file and set `HOME` to the isolated temp so `getMachineId()` works — the test setup must include this. Add it to the P4 spec.

## Could A Developer Implement Without Research Docs?

**Yes**, with two small clarifications now baked into the blueprint:
1. Add `--interval` param to `cmdTicker`.
2. Ticker checks `KAOLA_WORKFLOW_OFFLINE` and exits early.

## Recommendation

No architect revision needed. Fold the two small clarifications into phase3-plan.md task specs and proceed to Phase 4.
