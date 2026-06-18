evidence-binding: n6-finalize 106063406bbe

# n6-finalize — docs/state-only sink (main-session-direct)

Disposition: FORK B (docs-only D-528-01). The `finalize` sink is non-delegable; the main session wrote the two declared-write-set files directly.

## Files written (== declared write set, no overflow)
1. `docs/decisions/D-528-01.md` (NEW) — the decision record: C1 four-chain parallelism is NOT finalizable on an 18-core host → serial `npm test` stays, no code ships; full A-KILL-1..5 evidence, host-validity reasoning, two-part reopen condition. Next-free id in the D-528 series (confirmed no existing D-528-* via ls).
2. `CHANGELOG.md` (MODIFIED) — added a fresh `## [Unreleased]` block above `## [6.6.2]` with one `### Changed` entry for #528 (scoped to the local four-chain `npm test` gate; no CI/CD mention per #501).

## What this run established
- C1 on the FOUR-chain frame is NOT futile the way single-chain C1 was (ideal-core win ~460-860s; attribution structurally clean — 0/5000-trial mismatches via KNOWN_CHAINS.indexOf re-sort; no cross-chain race observed).
- BUT the make-or-break ≤4-core contended-host win is UN-MEASURABLE on this 18-core host (macOS has no hard core-cap) → under inverted burden (precedence #1) the ship-it verdict is REFUTED/not-finalizable → fork B.

## No code, no #307 obligation
Only `docs/decisions/D-528-01.md` + `CHANGELOG.md` touched — neither is an edition-tree script, so there is NO cross-edition diff and the four-chain #307 build gate does not apply (A-KILL-5 unexercised by design). No concurrent-dispatch build authored (freeze-once; authored later only if the reopen flip-premise is met).

## Reopen flip-premise (recorded in D-528-01)
A benchmark on a contended ≤4-core host (real CI runner / constrained cloud VM / cores-disabled box — NOT 18-core) showing a median four-chain win decisively exceeding 2× the serial-Σ jitter band (~232s/~395s) while preserving deterministic ordered chain-level attribution.
