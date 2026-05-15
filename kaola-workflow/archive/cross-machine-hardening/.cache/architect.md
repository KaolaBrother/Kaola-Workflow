# Code Architect: cross-machine-hardening

## Design Decisions

- **No new files**: `kaola-workflow-claim.js` stays monolithic. Adding ~200 LOC brings it from 470 to ~670, still under the 800-line ceiling. The YAGNI argument against extracting a `lib/gh-api.js` is strong: only two REST shapes exist and `ghExec` already handles the wrapper idiom uniformly.

- **`runTiebreakerCheck` extracted first (Task P0-C)**: Both `cmdClaim` (build phase 1) and `cmdTicker` tick-1 (build phase 2) must call the same tiebreaker logic. Extracting a standalone `runTiebreakerCheck(issueNum, sessionId, commentId, root)` function resolves the circular dependency. It becomes the innermost dependency.

- **nohup/disown committed approach, setsid noted as fallback**: The phase markdown invocation uses `nohup ... &` then `disown`. If a Claude Code subshell kills the background process on exit, the surviving SIGTERM handler unlinking the PID file is the safety net. `setsid` is documented as a fallback if `disown` is insufficient but not implemented by default.

- **`shouldSweep` kept + `isRemoteStale` added**: The existing `shouldSweep(lock)` is local-only and stays unchanged. New `isRemoteStale(lock)` adds the remote `updated_at` check as a second gate (only runs if `claim_comment_id` is present).

- **PID stale detection via `process.kill(pid, 0)`**: On entry to `cmdTicker`, read PID file, call `process.kill(parsedPid, 0)` — if throws `ESRCH`, unlink and continue. If succeeds, ticker is alive — exit 0 (idempotent).

- **Phase markdown files are truly parallel**: All six `commands/kaola-workflow-phase*.md` edits are disjoint; can be done in one parallel group.

- **claim.js edits are sequential within one task lane**: All four build phases modify the same file; must be done in dependency order.

- **Zero new npm packages**: `child_process`, `fs`, `os`, `crypto`, `path` cover all needs.

---

## Files to Create

| File | Purpose | Priority |
|------|---------|----------|
| (none) | No new source files — all logic added to existing scripts | — |

---

## Files to Modify

| File | Changes | Priority |
|------|---------|----------|
| `scripts/kaola-workflow-claim.js` | Regex bugfix (line 179); `runTiebreakerCheck` helper; `getRepoOwnerName` helper; `cmdTicker` subcommand; `cmdClaim` tiebreaker insert; `postReleaseComment` helper; `releaseSession` + `cmdSweep` assignee fix; `isRemoteStale` extension; dispatcher `main()` | 1 |
| `scripts/simulate-workflow-walkthrough.js` | Epic 9 block (tests 9A1, 9A2, 9A3, 9B1, 9B2, 9C1, 9C2, 9D) appended before line 1263 | 1 |
| `commands/kaola-workflow-phase1.md` | Replace one-shot heartbeat block (lines 26-31) with background ticker invocation | 2 |
| `commands/kaola-workflow-phase2.md` | Same replacement (lines ~30-35) | 2 |
| `commands/kaola-workflow-phase3.md` | Same replacement (lines ~28-33) | 2 |
| `commands/kaola-workflow-phase4.md` | Same replacement (lines ~18-23) | 2 |
| `commands/kaola-workflow-phase5.md` | Same replacement (lines ~32-37) | 2 |
| `commands/kaola-workflow-phase6.md` | Same replacement (lines ~33-38) | 2 |
| `.gitignore` | Append `kaola-workflow/.tickers/` | 3 |

---

## Data Flow

**Claim with tiebreaker**:
1. `cmdClaim` writes O_EXCL lock → calls `postGitHubClaim` → receives comment ID (correct via Phase 0 regex fix).
2. `cmdClaim` calls `runTiebreakerCheck(issueNum, sessionId, commentId, root)`.
3. `runTiebreakerCheck` fetches comments, filters by sentinel, sorts by integer `id` ASC, retries up to 3× at 0/250/750ms.
4. If our comment is not smallest: `releaseSession()` + `:yielded → {winner-sid}` + optional branch push → exit non-zero.
5. If our comment is smallest: re-write lock file with `claim_comment_id`.

**Ticker lifecycle**:
1. Phase markdown fires `nohup node ... ticker --session $KAOLA_SESSION_ID & disown`.
2. `cmdTicker` checks `.tickers/{session}.pid`: if alive → exit 0. If stale → unlink + continue.
3. Writes own PID via `fs.openSync(pidPath, 'wx')` (O_EXCL).
4. Registers `SIGTERM` handler to unlink PID file.
5. Each tick: re-reads lock; self-terminate if missing or wrong session_id; bumps `last_heartbeat` + `expires` (+2h); edits comment every 4th tick; runs tiebreaker on tick 1.

**Remote sweeper**:
1. `cmdSweep` per-lock: local `shouldSweep` check first (unchanged).
2. If passes AND `claim_comment_id` is numeric: `isRemoteStale(lock)` — fetch comment `updated_at`, return true if ≥24h old.
3. If stale: `releaseSession()` + `postReleaseComment(':released-stale')` + `--remove-assignee @me`.

---

## Build Sequence

### Sequential: claim.js lane (P0→P1→P2→P3)

**P0-A** — Regex bugfix at `claim.js:179`
- Change: `out.match(/comments\/(\d+)/)` → `out.match(/issuecomment-(\d+)/)`
- Dependency: none

**P0-B** — `getRepoOwnerName()` helper, insert after `ghExec` function (after line 29)
- Signature: `function getRepoOwnerName()`
- Returns: `{ owner: string, name: string }` or `null` when OFFLINE
- Dependency: P0-A

**P0-C** — `runTiebreakerCheck(issueNum, sessionId, commentId, root)` helper, insert after P0-B
- Retry loop 3× at delays `[0, 250, 750]ms`
- Filter sentinel `<!-- kw:claim sess={sessionId} -->`, sort by `id` ASC
- Returns `'stay'` or `{ yield: true, winnerId, winnerBody }`
- Dependency: P0-B

**P1** — Tiebreaker integration in cmdClaim
- `postReleaseComment(issueNum, sessionId, reason)` helper inserted after P0-C
- `postGitHubClaim` claim body gains sentinel: `🔒 Session claimed by {sessionId}\n<!-- kw:claim sess={sessionId} -->`
- `cmdClaim` tiebreaker insert between commentId receipt and final lock rewrite
- Adoption stub (≤10 lines): push existing branch if named `workflow/issue-{N}-*`
- Dependency: P0-C

**P2** — `cmdTicker` subcommand (~80 LOC), insert after `cmdHeartbeat` (after line 295)
- Ticker interval: `15 * 60 * 1000` ms (constant)
- `expires` set to `+2h` from `Date.now()` on every tick (not +30min like one-shot)
- Tick 1: calls `runTiebreakerCheck` for late-yield
- Every 4th tick: PATCH comment via `ghExec(['api', '--method', 'PATCH', ...])`
- Dependency: P1

**P3-A** — `releaseSession` assignee fix (line 251-255)
- Replace `--remove-label workflow:in-progress` call with combined `--remove-label ... --remove-assignee @me` in single `ghExec` invocation
- Dependency: P0-A (can proceed from P0 — no dependency on P1/P2)

**P3-B** — `isRemoteStale(lock)` helper + `cmdSweep` extension, insert before `cmdSweep`
- `isRemoteStale`: `ghExec(['api', 'repos/{O}/{R}/issues/comments/{claim_comment_id}'])`, parse `updated_at`, return `Date.now() - new Date(updatedAt) >= 24h`
- `cmdSweep`: add `if (!isRemoteStale(lock)) continue;` after `shouldSweep` guard; add `--remove-assignee @me` + `postReleaseComment` after release
- Dependency: P3-A (uses `postReleaseComment` from P1, `getRepoOwnerName` from P0-B)

**P3-C** — `main()` dispatcher update
- Add `if (sub === 'ticker') return cmdTicker();` between heartbeat and sweep
- Update usage string to include `ticker`
- Dependency: P2

### Parallel group P5: phase markdowns + .gitignore (concurrent after P2 is stable)

All 6 `commands/kaola-workflow-phase*.md` files + `.gitignore` — all disjoint write sets. Replace one-shot heartbeat:

**Current** (all 6 files):
```bash
[ -n "${KAOLA_SESSION_ID:-}" ] && \
  node "${CLAUDE_PLUGIN_ROOT:-./}/scripts/kaola-workflow-claim.js" heartbeat --session "$KAOLA_SESSION_ID"
```

**Replacement**:
```bash
[ -n "${KAOLA_SESSION_ID:-}" ] && {
  _TICKER_PID_FILE="$(git rev-parse --show-toplevel)/kaola-workflow/.tickers/${KAOLA_SESSION_ID}.pid"
  if [ ! -f "$_TICKER_PID_FILE" ]; then
    nohup node "${CLAUDE_PLUGIN_ROOT:-./}/scripts/kaola-workflow-claim.js" ticker \
      --session "$KAOLA_SESSION_ID" >/dev/null 2>&1 &
    disown
  fi
}
```

`.gitignore`: append `kaola-workflow/.tickers/`

### Sequential: P4 — Epic 9 tests in walkthrough.js (after all claim.js done)

Insert before `console.log('Workflow walkthrough simulation passed')` (line 1263).

**Shared setup**: `mkdtempSync`, git scaffold, ghShimDir, `baseEnv9` with no `KAOLA_WORKFLOW_OFFLINE`.

**Test 9A1**: Both comments visible, smaller-ID wins. Run claim for the loser session. Expect exit code 1. Assert lock removed. Assert `:yielded →` in comment body.

**Test 9A2**: Retry exhausted (only own comment returned ×3). Run claim. Expect exit code 0. Assert lock with `claim_comment_id`.

**Test 9A3**: Ticker late-tiebreak. Spawn ticker with `--interval 1`. Mock returns loser comment on tick 1. Assert ticker exits + lock gone within 2s.

**Test 9B1**: Ticker idempotency. Spawn twice. Assert second spawn exits 0, one PID file.

**Test 9B2**: Stale PID reap. Write PID `99999999`. Spawn ticker. Assert new PID file created.

**Test 9C1**: Sweep skip active (`updated_at` fresh). Assert lock survives sweep.

**Test 9C2**: Sweep stale release. Assert lock removed, `--remove-assignee @me` in gh log, `:released-stale` comment posted.

**Test 9D**: Both `cmdRelease` and `cmdSweep` call `--remove-assignee @me`. Assert via gh call log.

Pattern mirror: Epic 8 (`walkthrough.js:1055-1261`) for spawnSync exit-code capture; Epic 7 (`walkthrough.js:806-1053`) for git scaffold + gh shim.

---

## Parallelization Plan

| Group | Tasks | Why Safe In Parallel |
|-------|-------|---------------------|
| P0 | P0-A → P0-B → P0-C | Sequential within group (same file, ordered) |
| P1 | P1 | Sequential after P0 (same file) |
| P2 | P2 | Sequential after P1 (same file) |
| P3 | P3-A → P3-B, then P3-C | P3-A and P3-B same-pass edits; P3-C after P2 |
| P5 | 6× phase .md + .gitignore | Fully disjoint — all 7 files different |
| P4 | Epic 9 tests | `walkthrough.js` only — independent file |

Only P5 has genuine parallelism. `claim.js` is one sequential lane.

---

## External Dependencies

Zero new npm packages. Built-in modules only:
- `fs`, `child_process`, `os`, `path` — already imported in claim.js
- `process.kill(pid, 0)` — built-in signal 0 probe

---

## Explicit Out-of-Scope

- Distributed lock services or consensus protocols
- cron/launchd/systemd integration for the ticker
- Cross-repo coordination
- Automatic retry of failed claims
- CLI TUI/dashboard
- Configurable sweep-age threshold (hardcoded 24h)
- Editing GitHub issue body
- Per-tick comment edits (capped at every 4th tick ~hourly)
- Full adoption protocol (only ≤10-line defensive branch-push stub)
- Extracting `cmdTicker` into a separate script file
- New npm dependencies
- `commands/workflow-next.md` changes

---

## Validation Command

```bash
node scripts/simulate-workflow-walkthrough.js
```

Expected: exits 0, prints `Workflow walkthrough simulation passed`. All 9x subtests must pass.
