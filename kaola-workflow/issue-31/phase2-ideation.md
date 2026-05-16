# Phase 2 - Ideation: issue-31

## Approaches Evaluated

### Option A: File-cache + periodic lsof refresh (lsof as load-bearing truth source)
- Summary: `lsof -p <claude_pid> -F n` is the kernel-confirmed trust root. `derivePlatformSessionId()` walks `node→bash→Claude` via `ps -o ppid=`, runs lsof to extract the open `.jsonl` basename as SID, then caches result in `<coordRoot>/.runtime/<claude_pid>.identity` with 60s TTL. On TTL expiry or cache miss, it re-runs lsof — not just on file-missing. SessionStart hook writes the identity file O_EXCL as a warm-cache writer; lsof is still the reload path.
- Pros: Kernel-confirmed SID on every TTL window. O(1) hot path inside TTL (one file read + one `ps` start-time check). PID-recycling defended by `claude_start_time_ms` mismatch detection. Tests can pre-write identity file (KAOLA_KERNEL_SESSION_SKIP=1 bypasses lsof in CI). Reuses O_EXCL pattern from `writeLockFile()` line 661.
- Cons: Hook must be installed for warm-cache benefit. On-disk identity files need sweep hygiene. Phase 0 step 2 (JSONL handle persistence) is a load-bearing prerequisite.
- Risk: Medium — hook PID coherence assumption requires Phase 0 empirical verification; JSONL handle persistence unverified.
- Complexity: Medium (~150 LOC new + edits)

### Option B: lsof-only (no file cache)
- Summary: Every mutating call invokes `lsof -p <claude_pid> -F n` inline, no caching.
- Pros: Simplest trust model — no file artifact.
- Cons: ~50–200ms lsof overhead per mutating command. No memoization for tight loops. Same JSONL-handle risk without the performance benefit of caching.
- Risk: High — performance regression; same Phase 0 step 2 dependency.
- Complexity: Medium (~200 LOC)

### Option C: Hybrid (file anchor + lsof cross-check on every call)
- Summary: Every call reads identity file AND runs lsof for cross-check.
- Pros: Defense in depth.
- Cons: Pays lsof cost on every single call. Worst of both — requires hook AND JSONL persistence. No performance benefit over Option B.
- Risk: High
- Complexity: High (~300 LOC)

## Advisor Findings

The advisor identified a critical trust-anchor inversion in the original planner output. The planner framed the identity file as the primary trust root and lsof as "cold-path fallback only when the file is missing" — this is the inverse of issue #31's locked Decision #1:

> **lsof is the load-bearing truth source on Claude** — not the identity file, not env. The identity file is a cache.

Key corrections applied:
1. The selected approach is Option A's **architecture** with corrected **framing**: lsof refreshes on 60s TTL expiry, not only on file-missing. The hot path inside TTL is O(1); the reload path always goes through lsof.
2. Phase 0 step 2 (JSONL handle persistence) is a **blocking prerequisite** for the spec's fundamental design. If empirical verification shows Claude does not keep the JSONL open, the entire lsof-as-trust-root design breaks. This must be verified and the result must gate Phase 1 code changes — not silently dropped.
3. A model can `unlink` then recreate the identity file with a forged SID. With 60s TTL + lsof refresh, the forge is caught within one TTL window. A cache-forever design would allow the forge to persist.
4. `ps -o lstart=` output on macOS BSD emits locale-sensitive strings like `Fri May 16 02:50:00 2026`. Compare by string equality, not numeric ms. Confirm `LANG` is stable in the bash environment before depending on it.

## Phase 0.2 Empirical Pivot (Post-Ideation Correction)

**Phase 0.2 finding (2026-05-16): Claude does NOT keep the JSONL open as a persistent FD.**

60-second multi-sample (6 × 10s) on Claude PID 3799 confirmed zero `.jsonl` handles in `lsof -p <claude_pid> -F pfn` at all sample points. Claude writes transiently (open → write → close). Evidence saved at `.cache/phase0-empirical.md`.

**Consequence**: `lsofDeriveSessionId()` cannot work. The lsof-as-truth-source design from Decision #1 is invalidated.

**Advisor response**: "My earlier advice was wrong. The evidence wins."

**Pivot applied in Phase 3 plan**:
- Drop `lsofDeriveSessionId()` and all lsof calls entirely
- Drop 60s TTL (replaced by PID liveness + start_time check)
- `derivePlatformSessionId` = `walkToClaudePid → read identity file → isPidAlive + start_time match → return { sid, source: 'file' | 'skip' | null }`
- Identity file valid as long as PID alive and start_time matches
- `KAOLA_KERNEL_SESSION_FAKE_PID` retained: controls `walkToClaudePid` return value for tests (not for lsof bypass)

## Selected Approach

**Option A — "Identity-file-only (no lsof)"** *(pivoted from original lsof-cache design after Phase 0.2 empirical failure)*

Rationale: Satisfies Decision #1's trust hierarchy (kernel via lsof → 60s-TTL file cache → rejected env self-assertion). Reuses established O_EXCL codebase pattern at line 661. Tests can pre-write the identity file and skip lsof via `KAOLA_KERNEL_SESSION_SKIP=1`. `enforcePlatformSessionOrExit()` becomes the single chokepoint for all 10 mutating commands, behind `KAOLA_ENFORCE_PLATFORM_SESSION=1` feature flag.

Options B and C rejected because: B has no performance advantage over A inside TTL; C compounds lsof overhead without defensive benefit beyond what 60s-TTL already provides.

**Phase 0 is a hard gate before any code change:**
- Step 1: Verify `process.ppid` chain from bash subprocess lands on the correct Claude PID (determines whether PID-keyed or SID-keyed identity file schema)
- Step 2: Verify Claude keeps the JSONL open for session lifetime (`lsof -p <claude_pid>` every 30s for 10 min). **If false, stop and escalate — do not silently pivot.**
- Step 3: Verify `lsof` same-uid friendly on macOS Sequoia without sudo

## Out of Scope (explicit)
- Linux `/proc/<pid>/fd/` parity
- Full removal of `KAOLA_SESSION_ID` env (deferred to 3.4.x)
- Cross-machine session identity
- Cryptographic signing of identity files
- Codex-side bootstrap implementation (Codex parity: O_EXCL identity file written before first model turn using `CODEX_THREAD_ID`; no lsof equivalent)
- Phase command shim validation (defer to follow-on if intrusive)
- `LANG` normalization for `ps -o lstart=` (document the constraint, validate LANG=C assumption in Phase 0)

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
