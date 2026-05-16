# Planner Output — Issue #31: Session Identity Binding

## Three Approaches (Trust-Anchor Axis)

### Option A — Cache-first (hook is the trust anchor, lsof as cold-path fallback)

**Mechanism:** The SessionStart hook writes `<coordRoot>/.runtime/<claude_pid>.identity` via O_EXCL (`fs.openSync(path, 'wx', 0o600)`) with `{sid, claude_pid, claude_start_time_ms, runtime, written_at}`. `derivePlatformSessionId(coordRoot)` walks process ancestors (node→bash→Claude via `ps -o ppid= -p`), reads the identity file, validates `claude_start_time_ms` against live `ps -o lstart=`, returns the SID. `lsof -p <claude_pid> -F n` is a slow-path fallback only when the file is missing (pre-hook-install sessions).

- Pros: O(1) hot path (one PID walk + one file read + one ps call ~5–15ms). Testable without live Claude. Codebase-native O_EXCL pattern. PID-recycling defended by start-time check.
- Cons: Hook must be installed. Adds new on-disk artifacts requiring sweep hygiene.
- Risk: Medium — hook PID coherence assumption must be empirically verified before committing to schema.
- Complexity: Medium (~150 LOC new + edits)

### Option B — lsof-first (kernel is the trust anchor, file memoizes)

**Mechanism:** Every mutating call walks to the ancestor Claude PID and runs `lsof -p <pid> -F n`, finds the open `.jsonl` under `~/.claude/projects/`, extracts SID from basename. Memoizes in `.runtime/<pid>.identity` for 60s TTL.

- Pros: Strongest trust anchor — kernel-confirmed open file handle. No dependency on hook installation.
- Cons: ~50–200ms lsof per mutating command. Load-bearing on unverified assumption that Claude keeps JSONL open for session lifetime. Tests require synthetic-handle harness.
- Risk: High — JSONL handle persistence is unverified. Performance regression for tight loops.
- Complexity: High (~250 LOC new + custom test harness)

### Option C — Hybrid (file is anchor, lsof cross-checks every call)

- Pros: Defense in depth.
- Cons: Worst of both — pays lsof cost on every call AND requires hook installation. Empirical JSONL-handle risk still load-bearing.
- Risk: High
- Complexity: High (~300 LOC new)

## Architectural Fit

Approach A is the natural extension of existing infrastructure:
- `writeLockFile()` (line 661) — O_EXCL `'wx'` pattern is the direct template
- `kaola-workflow-session-env.js:36` — already reads hook's `session_id` payload; adding O_EXCL identity write is ~10 lines
- `claudeProjectDirForRoot()` (line 1281) / `claudeSessionPathForRoot()` (line 1289) — reusable for lsof cold-path
- Epic Case 8K (line 1720) and 8M (line 1881) — simpler test pattern than B's synthetic-handle harness

## Recommended Option: **Approach A (Cache-first)**

Rationale: Hook payload is the cleanest trust anchor with no env intermediary. O(1) hot path. Tests can pre-write identity file without a live Claude process. Reuses established O_EXCL codebase pattern. lsof fallback is opt-in only (cold-path for pre-hook-install sessions).

## Implementation Phases

**Phase 0 (BLOCKER — no code changes, empirical verification only):**
1. Verify hook PID coherence — confirm `process.ppid` chain from a bash subprocess lands on the same PID the hook wrote the identity file for. If mismatch, switch to SID-keyed (`.runtime/<sid>.identity`) schema.
2. Verify JSONL open-handle persistence — `lsof -p <claude_pid>` every 30s for 10min; confirms lsof fallback viability.
3. Verify `lsof` same-uid friendly on macOS Sequoia without sudo.

**Phase 1 — Identity Infrastructure (observability only, no enforcement):**
- Extend SessionStart hook to write O_EXCL identity file
- Add `derivePlatformSessionId(coordRoot, options)` to claim script
- Add `derive-session` subcommand for observability

**Phase 2 — Read-only callers switch (AC2, AC4, AC5):**
- Refactor `cmdSession()` to use derived SID; exits 4 if no Claude ancestor
- Refactor `cmdVerifyStartup()` to enforce caller identity check

**Phase 3 — Mutating enforcement chokepoint (behind `KAOLA_ENFORCE_PLATFORM_SESSION=1`):**
- Add `enforcePlatformSessionOrExit(args, options)` single function
- Add `--platform-override` / `--platform-override` to `parseArgs()`
- Wire into all 10 mutating commands

**Phase 4 — Pre-commit hook + `owner_session_id` in workflow-state.md:**
- Pre-commit: replace `KAOLA_SESSION_ID` env comparison with derived SID via Node helper
- Claim script: write `owner_session_id` to `## Lease` block in workflow-state.md

**Phase 5 — Ticker parent-alive + sweep cache hygiene:**
- Ticker: check parent Claude PID start-time each tick; exit gracefully on disappearance (2-retry tolerance)
- Sweep: prune stale `.runtime/<pid>.identity` files for dead PIDs

**Phase 6 — Epic Case 8N test coverage (AC1–AC15, 15 sub-blocks):**
- Each AC gets a named sub-block in `simulate-workflow-walkthrough.js` after Epic Case 8M (line 1914)

**Phase 7 (future 3.4.x) — Remove `KAOLA_SESSION_ID` env fallback**

## Explicit Out-of-Scope
- Linux `/proc/<pid>/fd/` parity
- Full removal of `KAOLA_SESSION_ID` env (3.4.x)
- Cross-machine session identity
- Cryptographic signing of identity files
- Codex-side bootstrap implementation
- Phase command shim validation (defer to follow-on if intrusive)

## Missing Facts That Could Block
1. Hook PID coherence (Phase 0 step 1) — must verify before committing to PID-keyed schema
2. JSONL handle persistence (Phase 0 step 2) — if false, drop lsof fallback
3. `ps -o lstart=` output format portability (macOS BSD vs GNU ps)
4. Phase shim inventory under `/commands/` needing `owner_session_id` check
5. `cmdSweep`/`cmdWatchPr` cron usage — confirm `--platform-override` is acceptable for those contexts
