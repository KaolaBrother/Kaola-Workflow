# Advisor Ideation Gate: cross-machine-hardening

## Adoption Protocol (correction to earlier advice)

Earlier guidance to include adoption protocol was wrong. Tiebreaker fires at `claim.js:222-232`, **before** any feature branch is cut. No branch exists at yield time. Planner deferral (Option 4A) is correct.

**Resolution**: add defensive code — if a branch named `workflow/issue-{N}-*` exists at yield time, push it and include the name in the `:yielded` comment. Harmless when no branch; checks the AC box if branch-cut moves earlier later. ≤10 lines.

## Planner Validation

Phase 0 regex fix, Option 1A (smallest comment ID tiebreaker), Option 2A (ticker), Option 3A (sweeper) all confirmed sound.

Smallest comment ID over `created_at` is **better** — integer-monotonic per GitHub, immune to clock-second ties. Locked in.

## Risks Missed / Underweighted

**1. GitHub read-after-write eventual consistency**: Bounded retry (0/250/750ms) doesn't eliminate the race where each machine sees only its own comment. Mitigation: ticker re-runs tiebreaker check on first tick (~15 min after eventual consistency converges). If our comment is no longer smallest → late-yield. ~10 lines in ticker loop.

**2. Ticker process lifecycle**: `nohup ... & disown` may not survive Claude Code's subshell reaping. Verify with `ps -ef | grep ticker` after phase exit. Fallback: `setsid` or per-phase one-shot at 15-min wallclock.

**3. `.tickers/` not gitignored**: Must add to `.gitignore` in same commit as PID file.

**4. Local lock heartbeat cadence**: Local lock `last_heartbeat` and `expires` (+2h) must be bumped every ticker tick (15 min). Comment body edited every 4th tick (~hourly) to avoid rate limits. Otherwise local sweeper kicks in mid-phase.

**5. Ticker self-terminate condition**: Self-terminate if `lock.session_id !== our session_id` (defensive; covers lock rewrite by another process).

## Test Matrix

- (9A1) Both comments visible: smaller-ID wins, larger yields, comment edited to `:yielded → {winner-sid}`
- (9A2) Bounded-retry exhausted (mock only-own-comment ×3): stay claimed
- (9A3) Ticker late-tiebreak: ticker fires, both comments now visible, ours is larger → `releaseSession` + exit
- (9B1) Ticker idempotency: spawn twice, second is no-op (PID file alive)
- (9B2) Ticker reap: kill -9, respawn → stale PID removed, new ticker starts
- (9C1) Sweep skip-active: `updated_at` < 24h → no action
- (9C2) Sweep stale-release: `updated_at` > 24h + `expires` > 24h ago → release + `:released-stale` comment
- (9D) `cmdRelease` + `cmdSweep` both call `--remove-assignee @me`

## Revised Implementation Order

Phase 0 → **2 (ticker first)** → 1 (tiebreaker) → 3 (sweeper). Ticker is higher integration risk (process lifecycle). De-risk before building tiebreaker that depends on ticker for late-yield.

## Decision

Proceed. No user-owned questions remain. Fold risk mitigations into Phase 3 plan.
