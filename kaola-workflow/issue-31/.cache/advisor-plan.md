# Advisor Review — Issue #31 Phase 3 Blueprint

The blueprint is largely sound — it preserves the corrected trust hierarchy from Phase 2 (lsof = truth source, file = 60s cache) and the Phase 0 empirical gate is properly framed as blocking. However, there are specific gaps that will cause real bugs or mask them if implementation proceeds as written.

## Blocking Issues (fix before Phase 4)

### 1. Internal path inconsistency for runtime dir

The architect's spec is self-contradictory:
- Data-flow diagram: `<coordRoot>/.runtime/<claude_pid>.identity`
- derivePlatformSessionId pseudo-code: `path.join(coordRoot, 'kaola-workflow', '.runtime', ...)`
- Sweep Task 5.2 pseudo-code: `path.join(coordRoot, 'kaola-workflow', '.runtime')`
- Phase 1 research §Config & Env: `<coordRoot>/.runtime/<claude-pid>.identity` (no `kaola-workflow/`)

Recall `getCoordRoot()` returns `git-common-dir` (typically `.git/`). Existing `.tickers/` lives at `<coordRoot>/kaola-workflow/.tickers/`. **Lock consistency: `<coordRoot>/kaola-workflow/.runtime/`** and `<coordRoot>/kaola-workflow/.audit/`. Update data-flow diagram.

### 2. AC9 and AC11 tests don't actually exercise what they claim

- AC9 (cache hit): test uses `KAOLA_KERNEL_SESSION_SKIP=1` — bypasses cache entirely. Will pass even if cache-hit code is absent.
- AC11 (PID recycling): same problem — SKIP=1 bypasses start-time-ms comparison.

Fix: add `KAOLA_KERNEL_SESSION_FAKE_PID=<pid>` test hook. When set, `walkToClaudePid()` returns that PID as the Claude ancestor (without running `ps`). This lets tests plant an identity file for a known PID and exercise the cache/recycle-detection path without a real Claude ancestor.

### 3. cmdVerifyStartup SKIP semantics contradiction

Architect Task 2.2 step 2: "If KAOLA_KERNEL_SESSION_SKIP=1: use args.session (test path)." But derivePlatformSessionId under SKIP returns `envSessionId()`, not `args.session`. If implementer follows spec literally, AC4 fails (derived == args.session always → no mismatch). **Delete step 2** — call `derivePlatformSessionId(coordRoot)` uniformly; SKIP routes through envSessionId.

## Non-Blocking Flags for phase3-plan.md

### 4. walkToClaudePid `comm` heuristic requires Phase 0.1 validation

`comm` on macOS may be truncated or show `node`. Phase 0.1 must document the actual `comm` string and confirm substring match `claude` works. Fallback: scan ancestors for the one holding an open JSONL.

### 5. Sweep ticker-exemption solves a non-problem

Ticker doesn't call sweep. Non-Claude sweep callers (cron, bootstrap) should use `--platform-override`. Drop ticker-exemption logic entirely.

### 6. Bootstrap/startup enforcement conflict

Under `KAOLA_ENFORCE_PLATFORM_SESSION=1`, bootstrap/startup with randomUUID-generated sessions will exit 3 because derived SID ≠ generated SID. **Decision: exempt bootstrap/startup from enforcement** when `KAOLA_KERNEL_SESSION_SKIP=1` or when `args.session` was not user-supplied (Codex context). Document that enforcement-on is incompatible with Codex-runtime bootstrap.

### 7. owner_session_id migration

Existing lease blocks lack `owner_session_id`. Treat absence as "legacy lease" — pre-commit hook must not BLOCK on missing field. Backfill `unverified` only on new claims, not retroactively.

### 8. Drop standalone kaola-workflow-derive-session.js

Pre-commit hook calls `node scripts/kaola-workflow-claim.js derive-session` directly. No new file needed.

## Net Recommendation

Proceed to write `phase3-plan.md` applying corrections inline. The architecture is correct — corrections are surgical. No architect revision loop needed.
