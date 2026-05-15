# Phase 2 - Ideation: cross-machine-hardening

## Approaches Evaluated

### Phase 0 — Prerequisite Regex Bugfix

**Required, non-negotiable.** `claim.js:179` regex `/comments\/(\d+)/` must be
`/issuecomment-(\d+)/`. `gh issue comment` stdout is `#issuecomment-NNN` format.
Without this, `claim_comment_id` is always null, breaking deliverables 1 and 3.

---

### Deliverable 1: Claim Race Tiebreaker

#### Option 1A: Smallest comment ID via REST + hidden sentinel (SELECTED)
- **Summary**: After `postGitHubClaim`, list comments via `gh api repos/{O}/{R}/issues/{N}/comments`. Filter by sentinel `<!-- kw:claim sess={sessionId} -->`. Sort by integer `id` ASC. If our comment is not smallest, call `releaseSession()` and exit non-zero.
- **Sentinel body**: `🔒 Session claimed by {sessionId}\n<!-- kw:claim sess={sessionId} -->`
- **Bounded retry**: 3 reads at 0/250/750ms to handle GitHub read-after-write lag. If list fails, stay claimed (safe default).
- Pros: Deterministic (integer comparison, immune to clock skew); reuses `releaseSession`; sentinel is robust re-find key
- Cons: ~50 LOC + new REST JSON-parsing helper
- Risk: Low — network errors default to stay claimed
- Complexity: Medium

#### Option 1B: Earliest `created_at` wins
- Cons: Sub-second ties require ID fallback anyway; adds complexity
- Verdict: Rejected

#### Option 1C: Server-side label-based lock
- Cons: No atomic conditional label-add in GitHub API; far more complex
- Verdict: Rejected

---

### Deliverable 2: In-Phase Heartbeat Ticker

#### Option 2A: New `claim.js ticker` subcommand, detached Node process (SELECTED)
- **Summary**: `cmdTicker(--session, --interval)` — writes PID to `kaola-workflow/.tickers/{session}.pid` (O_EXCL, idempotent). `setTimeout` self-loop at 15-min interval. Each tick:
  - Re-read lock; self-terminate if lock missing or `lock.session_id !== our session_id`
  - Bump local lock `last_heartbeat` + `expires` (+2h) every tick
  - Edit GitHub claim comment body every 4th tick (~hourly) to keep `updated_at` fresh for sweeper
  - On tick 1: re-run tiebreaker check (late-yield mitigation for eventual consistency gap)
- **Phase markdown invocation**:
  ```bash
  [ -n "${KAOLA_SESSION_ID:-}" ] && \
    nohup node "${CLAUDE_PLUGIN_ROOT:-./}/scripts/kaola-workflow-claim.js" ticker \
      --session "$KAOLA_SESSION_ID" >/dev/null 2>&1 &
    disown
  ```
- **PID lifecycle**: at phase start, check PID file — if alive skip; if stale, unlink and respawn
- **`.tickers/` must be added to `.gitignore`**
- Pros: Single language, testable with `--interval 1`, PID file enables clean reap
- Cons: Long-running process; 6 markdown files to update; process lifecycle risk in Claude Code subshells
- Risk: Medium — orphaned ticker mitigated by stale-PID check + lock-existence self-check; verify `nohup & disown` survives Claude Code tool exits
- Complexity: Medium-high (~80 LOC + 6 files)

#### Option 2B: Bash `while true; do sleep 900; done &`
- Cons: Lifecycle messy across phase transitions, cross-platform
- Verdict: Rejected

#### Option 2C: One-shot only, extend `expires` to 2h
- Cons: Does not solve long-phase expiry; documents only the fallback
- Verdict: Retain as documented fallback only

---

### Deliverable 3: Remote Sweeper Extension

#### Option 3A: Per-lock REST fetch + comment-age guard (SELECTED)
- **Summary**:
  1. `cmdRelease` and `cmdSweep` both add `--remove-assignee @me` (currently missing)
  2. Both post a release comment via new `postReleaseComment(issueNum, sessionId, reason)` helper
  3. `cmdSweep` per-lock: fetch `GET /repos/{O}/{R}/issues/comments/{claim_comment_id}`, parse `updated_at`. Skip if < 24h old. Release + post `:released-stale` if ≥ 24h old AND `lock.expires` expired
- Pros: One REST call per lock; reuses `releaseSession`; cross-machine awareness
- Risk: Low — fetch failure → skip (fail safe)
- Complexity: Medium (~40 LOC)

#### Option 3B: Batch via `gh issue list --json`
- Cons: Comments not available at list level; still needs per-issue calls
- Verdict: Rejected

#### Option 3C: Skip `updated_at` check; rely on local heartbeat only
- Cons: Defeats cross-machine purpose
- Verdict: Rejected

---

### Deliverable 4: Adoption Protocol

#### Option 4A: Defer to follow-up issue (SELECTED)
- **Reason**: Tiebreaker fires at `claim.js:222-232`, before any feature branch is cut. No branch exists at yield time in the current design.
- **AC check**: Add defensive code (≤10 lines) — if a branch named `workflow/issue-{N}-*` exists at yield time, push it and list the name in the `:yielded` comment. Harmless when no branch present; checks the acceptance-criteria box.
- Full adoption protocol deferred; design sketch in PR body.

#### Option 4B: Minimal force-claim subcommand only
- Verdict: Rejected — achievable already via release + re-claim

#### Option 4C: Full adoption protocol now
- Verdict: Rejected — triples test matrix; high design-churn risk

---

## Advisor Findings

- Planner selections confirmed sound by advisor.
- Smallest comment ID tiebreaker preferred over `created_at` — integer-monotonic, immune to clock-second ties.
- **Risk 1**: GitHub read-after-write eventual consistency → ticker re-runs tiebreaker on tick 1.
- **Risk 2**: Ticker lifecycle in Claude Code subshells → verify with `ps` after phase exit; fallback to `setsid`.
- **Risk 3**: `.tickers/` must be added to `.gitignore`.
- **Risk 4**: Local lock `expires` must be bumped +2h every tick (not just every 4th); comment edited hourly only.
- **Risk 5**: Ticker self-terminate if `lock.session_id` !== our session.
- Adoption protocol deferral confirmed correct (no branch at yield point).
- Implementation order revised: **Phase 0 → 2 (ticker first) → 1 (tiebreaker) → 3 (sweeper)** to de-risk ticker lifecycle early.

## Selected Approach

**Phase 0 → 2A → 1A → 3A → 4A (defer + defensive stub)**

1. Fix `claim.js:179` regex → ensures `claim_comment_id` is populated (prerequisite)
2. `cmdTicker` subcommand + 6 phase markdown updates → de-risks process lifecycle first
3. Sentinel + tiebreaker + late-yield via ticker tick-1 → cross-machine safety
4. Sweeper remote extension + `--remove-assignee` fix → stale-lease cleanup

## Out of Scope (Explicit)

- Distributed lock services, consensus protocols
- Cron/launchd/systemd integration
- Cross-repo coordination
- Automatic retry of failed claims
- CLI TUI dashboard
- Configurable sweep-age threshold
- Editing issue body
- Per-tick comment edits (cap at hourly — rate-limit risk)
- Full adoption protocol (deferred)

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
