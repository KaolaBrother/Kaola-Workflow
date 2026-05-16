# Advisor Review — Issue #31 Ideation

## Critical Finding: Planner Inverted the Spec's Trust Anchor

Issue #31 locks Decision #1:
> **`lsof` is the load-bearing truth source on Claude** — not the identity file, not env. The identity file is a cache.

The planner's "Approach A — Cache-first" framed `lsof` as *"cold-path fallback only when the file is missing."* That is the inverse of the spec. The correct design is:
- Identity file = 60s-TTL **cache** (with `claude_start_time_ms` invalidation for PID recycling)
- lsof refresh on cache miss/expiry = **trust root** (kernel-confirmed)

This matters for one specific threat the spec names explicitly:
> "It can overwrite the identity file, but lsof cross-check on the next derivation rebuilds it from kernel truth."

A model can `unlink` then recreate the identity file with a forged SID (and a copied `start_time_ms` it can read independently). With the planner's cache-forever design, the forge persists. With 60s TTL + lsof refresh, it's caught within one TTL window.

The planner's dismissal of Approach C — "O_EXCL + start-time validation already addresses file tampering" — is incorrect. O_EXCL prevents racy first-writes; it does not prevent `unlink` + recreate.

## Corrections Required Before phase2-ideation.md

1. **Rename the selected approach**: "File-cache + periodic lsof refresh per locked Decision #1" (same code surface, correct framing).
2. **Hot path must include 60s TTL**: `derivePlatformSessionId()` refreshes via `lsof` after 60s TTL, not just on file-missing.
3. **Phase 0 step 2 is load-bearing, not fallback hygiene**: If empirical verification shows Claude doesn't keep the JSONL open, the spec's fundamental design breaks — escalate, don't silently drop lsof.

## What Is Sound and Should Stay

- Phases 0→6 structure, each independently mergeable
- `enforcePlatformSessionOrExit()` single chokepoint for AC3/AC6
- `KAOLA_ENFORCE_PLATFORM_SESSION=1` feature flag + 3.3.x env-fallback compat
- Codex parity via identity-file-with-O_EXCL (Decision #2 — Codex has no lsof equivalent)
- `--platform-override` audited via `.audit/identity-override.log` (Decision #5)
- Phase 0 step 1 (hook PID coherence) — right empirical question for cache-key schema
- Epic Case 8N sub-block structure mirroring 8K/8M

## One Additional Verification Note

`ps -o lstart=` on macOS BSD emits strings like `Fri May 16 02:50:00 2026`. Compare by string equality across multiple calls within one boot — do not parse to numeric ms or do TZ math. The string is locale/LANG-sensitive; confirm `LANG` is stable in the bash environment before relying on it. If numeric start-time is needed, investigate BSD-specific alternatives.

## Net Recommendation

Proceed with `phase2-ideation.md` using Approach A's architecture but with corrected framing: "file-cache + periodic lsof refresh." Document that Phase 0 step 2 (JSONL handle persistence) is a load-bearing gate, not just fallback robustness. If Phase 0 step 2 fails, stop and escalate — do not silently pivot.
