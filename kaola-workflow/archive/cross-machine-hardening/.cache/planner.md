# Planner: cross-machine-hardening

## Overview

Four deliverables + one prerequisite bugfix across `claim.js`, `simulate-workflow-walkthrough.js`, and six phase command markdown files.

## Phase 0 — Prerequisite Bugfix (NON-NEGOTIABLE)

Fix regex at `claim.js:179`: `/comments\/(\d+)/` → `/issuecomment-(\d+)/`.
`gh issue comment` stdout is `#issuecomment-NNN` format. Without this, `claim_comment_id` is always null. Deliverables 1 and 3 depend on it. Ship as own commit.

---

## Deliverable 1: Claim Race Tiebreaker

### Option 1A: Smallest comment ID via REST + hidden sentinel (RECOMMENDED)

**Summary**: After `postGitHubClaim` returns (between `claim.js:222-232`), list issue comments via `gh api repos/{owner}/{repo}/issues/{N}/comments`, filter by sentinel `<!-- kw:claim sess={sessionId} -->` in body, sort by integer `id` ascending. If our comment is not smallest, call `releaseSession()` and exit non-zero.

Add sentinel to claim body:
```
🔒 Session claimed by {sessionId}
<!-- kw:claim sess={sessionId} -->
```

Bounded retry: 3 reads at 0ms / 250ms / 750ms to handle GitHub read-after-write lag. List failure = stay claimed (log warning), not release.

- Pros: Deterministic (integer comparison, immune to clock skew); reuses `releaseSession`; sentinel is robust re-find key
- Cons: Adds ~50 LOC + new helper for REST JSON parsing
- Risk: Low — network error defaults to safe (stay claimed)
- Complexity: Medium

### Option 1B: Earliest `created_at` wins

- Cons: Sub-second ties require ID fallback anyway; adds complexity
- Verdict: Reject

### Option 1C: Server-side label-based lock

- Cons: No atomic conditional label-add in GitHub API; much more complex
- Verdict: Reject

**Recommendation: 1A**

---

## Deliverable 2: In-Phase Heartbeat Ticker

### Option 2A: New `claim.js ticker` subcommand, detached Node process (RECOMMENDED)

**Summary**: `cmdTicker(--session, --interval)` — writes PID to `kaola-workflow/.tickers/{session}.pid` (O_EXCL, idempotent). `setTimeout` self-loop. Each tick: re-read lock, self-terminate if lock missing. Every 4th tick (~hourly): `PATCH /repos/{O}/{R}/issues/comments/{id}` to update claim comment body with `<!-- kw:hb ts=ISO -->` (keeps `updated_at` fresh for sweeper check). SIGTERM handler unlinks PID file.

Phase markdown files:
```bash
[ -n "${KAOLA_SESSION_ID:-}" ] && \
  nohup node "${CLAUDE_PLUGIN_ROOT:-./}/scripts/kaola-workflow-claim.js" ticker \
    --session "$KAOLA_SESSION_ID" >/dev/null 2>&1 &
  disown
```

At phase start: check PID file — if alive, skip; if stale, unlink and respawn.

- Pros: Single language, testable with `--interval 1`, PID file enables clean reap
- Cons: Long-running process; 6 markdown files to update
- Risk: Orphaned ticker — mitigated by stale-PID check + lock-existence self-check
- Complexity: Medium-high (~80 LOC + 6 files)

### Option 2B: Bash `while true; do sleep 900; done &`

- Cons: Lifecycle messy across phase transitions, cross-platform issues
- Verdict: Reject

### Option 2C: Keep one-shot, extend expires to 2h

- Cons: Does not solve long-phase expiry; only documents the fallback
- Verdict: Document as fallback only, not the solution

**Recommendation: 2A** — must also edit claim comment hourly or sweeper's `updated_at` check is dead code.

---

## Deliverable 3: Remote Sweeper Extension

### Option 3A: Per-lock REST fetch + comment-age guard (RECOMMENDED)

**Summary**: Extend `cmdSweep` and `releaseSession`:
1. Both post a release comment (`🧹 Session released by sweeper (stale)` or `🧹 Session released by {sessionId}`)
2. Both call `--remove-assignee @me` (currently missing from both)
3. `cmdSweep` adds comment-age guard: for each lock with `claim_comment_id`, fetch `GET /repos/{owner}/{repo}/issues/comments/{id}` via `ghExec`, parse `updated_at`. Skip if < 24h old (another machine is alive).
4. Extract `postReleaseComment(issueNum, sessionId, reason)` helper shared by sweep + release

Lands jointly with Deliverable 2 (ticker must edit comment for `updated_at` to be load-bearing).

- Pros: One REST call per lock; reuses `releaseSession`; cross-machine awareness
- Risk: Low — comment-age check fails gracefully (if fetch fails, skip sweep)
- Complexity: Medium (~40 LOC)

### Option 3B: Batch via `gh issue list --json`

- Cons: Comments not available at list level; still needs per-issue call
- Verdict: Reject

### Option 3C: Skip `updated_at` check; rely on local heartbeat only

- Cons: Defeats cross-machine purpose
- Verdict: Reject

**Recommendation: 3A**

---

## Deliverable 4: Adoption Protocol

### Option 4A: Defer to follow-up issue (RECOMMENDED)

Issue marks this "optional polish." Ship Deliverables 0+1+2+3 first, observe real behavior, then design adoption from real signals. Include design sketch in PR body.

### Option 4B: Minimal force-claim subcommand only

- Cons: Already achievable via release + re-claim; no added protocol value without orphan detection
- Verdict: Reject

### Option 4C: Full adoption protocol now

- Cons: Triples test matrix; high design-churn risk
- Verdict: Reject

**Recommendation: 4A (defer)**

---

## Out of Scope (Explicit)

- Distributed lock services, consensus protocols
- Cron/launchd/systemd integration
- Cross-repo coordination
- Automatic retry of failed claims
- CLI TUI dashboard
- Configurable sweep-age threshold
- Editing issue body
- Per-tick comment edits (rate-limit risk — cap at hourly)
- Adoption protocol (deferred)

---

## Suggested Implementation Order

1. Phase 0: regex bugfix + PATH-shim test
2. Phase 1: sentinel + tiebreaker logic + test epic 9A
3. Phase 2: ticker subcommand + runHeartbeat refactor + 6 phase markdown updates + test epic 9B
4. Phase 3: sweeper REST + release comment + remove-assignee + test epic 9C
5. Phase 4: PR-body adoption sketch; follow-up issue

Each phase = one commit. PR mergeable after all four.

---

## Missing Facts (planner-identified)

1. Heartbeat-edit cadence — every 4th tick (~hourly) recommended; confirm acceptable
2. Ticker lifecycle — PID check + reap at phase start (recommend)
3. PATH shim for Epic 9 — confirmed exists in Epic 6/7 patterns; Epic 9 ships its own
4. Sentinel format — `<!-- kw:claim sess=<uuid> -->` — no existing convention; confirm acceptable
