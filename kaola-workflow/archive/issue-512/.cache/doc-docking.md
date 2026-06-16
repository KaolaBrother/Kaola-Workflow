# Documentation Docking — issue-512

## Changed code/config/test files reviewed
- scripts/kaola-workflow-run-chains.js (+ 3 edition copies) — new `resolveTimeoutMs(env)`, wired into `:272` spawnSync timeout
- scripts/test-run-chains.js — new T12 unit coverage for `resolveTimeoutMs`

## Documents checked & updated (n2-docs, doc-updater)
- docs/api.md — `KAOLA_RUN_CHAINS_TIMEOUT_MS` env entry + run-chains § note (default 900000, no clamp, receipt unchanged)
- README.md — Environment Variables table row
- .env.example — commented stanza
- docs/decisions/D-512-01.md — decision record (chosen fix + deferred speed-up rationale)
- CHANGELOG.md — `[Unreleased] ### Fixed` entry (#512), written at the n4-finalize sink

## Verified against ground truth
All documented claims (default 900000, parse-or-default fallback, no upper clamp, receipt schema unchanged) match the actual `resolveTimeoutMs` implementation and were re-verified by the n3-review opus gate (verdict: pass).

## Gaps found and fixed
None — docs and implementation are aligned; n3-review confirmed no fabricated values.

## Skipped document classes (no-impact)
- Architecture docs — no structural change (a single env-var knob on an existing script).

## Final verdict
DOCKED
