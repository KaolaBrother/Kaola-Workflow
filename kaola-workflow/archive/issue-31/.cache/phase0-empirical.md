# Phase 0 Empirical Verification Results — Issue #31

## Summary

Phase 0 was required as a hard gate before any implementation. Phase 0.2 produced a **critical finding** that invalidated the lsof-as-truth-source design from Decision #1 in phase2-ideation.md.

## Phase 0.1 — PID Coherence ✅ PASSED

Verified that the process tree `claude → bash → node` is consistent and walkable via `ps -o ppid=`. The two-hop walk from `process.ppid` (bash) to Claude PID works correctly in the kaola-workflow environment.

`comm` string observed from `ps -o comm= -p <claude_pid>`: contains `claude` substring — confirmed `walkToClaudePid` heuristic works.

## Phase 0.2 — JSONL Handle Persistence ❌ CRITICAL FAILURE

**Finding: Claude does NOT keep the JSONL transcript file open as a persistent file descriptor.**

Evidence (60-second multi-sample, 6 × 10s intervals):
- All 6 samples returned empty — zero `.jsonl` entries in `lsof -p <claude_pid> -F pfn`
- Claude PID 3799: only 26 open files total, zero `.jsonl` at any sample point
- `lsof <jsonl_path>` confirmed: no process holds the JSONL open
- JSONL file exists at `/Users/ylminiserver/.claude/projects/-Volumes-WorkspaceA-ylminiserver-workspace-kaola-workflow/5072da62-d50e-4ff9-91e5-3b2108965bd6.jsonl`
- Conclusion: Claude writes transiently (open → write → close), does not hold the FD open for session lifetime

**Impact**: The `lsofDeriveSessionId()` function and the entire lsof-as-trust-source design cannot work. `lsof -p <claude_pid>` will always return no JSONL handles during normal operation.

## Phase 0.3 — lsof Same-UID ✅ PASSED (moot)

`lsof -p <claude_pid>` without sudo succeeds and returns file handles — but since Phase 0.2 shows the JSONL is never among them, this result is moot for the design.

## Design Pivot Approved by Advisor

Based on Phase 0.2 finding, the advisor recommended a full design pivot:

**Drop**: `lsofDeriveSessionId()`, 60s TTL, `KAOLA_KERNEL_SESSION_FAKE_PID` test hook, all lsof calls.

**New design — identity-file-only**:
- `SessionStart` hook writes `<coordRoot>/kaola-workflow/.runtime/<claude_pid>.identity` O_EXCL at session start
- `derivePlatformSessionId(coordRoot, options)` = `walkToClaudePid() → read identity file → verify isPidAlive(claudePid) AND claude_start_time_ms matches ps -o lstart= → return { sid, source: 'file' | 'skip' | null }`
- No lsof anywhere
- No TTL — file is valid as long as PID alive + start_time matches
- Compromise: identity file forgeable by a compromised model with shell access (documented known limitation; not addressed in this issue)
- PID recycling still defended by start_time mismatch detection

**Advisor quote**: "My earlier advice was wrong. The evidence wins."

## Threat Model Gap (Documented)

A compromised model with shell access can forge `<coordRoot>/kaola-workflow/.runtime/<claude_pid>.identity`. This is a known limitation. The design still closes the primary threat (env-variable impersonation). Future issue can revisit cryptographic signing.

## Date
2026-05-16
