# Issue #1013 — TDD RED evidence

- Baseline SHA: `5d12821db236ce0601d6804e9d78df31a9576f65`
- Test command: `node scripts/test-cursor-edition.js`
- Exit: `1`
- Result: `cursor-edition test FAILED: 29 failure(s), 521 passed.`

Failure signature against the baseline:

- `G0-roster: renderAgent rejects an unsupported canonical model token (fail closed; no invented roster)` — the current generator accepts the synthetic `unsupported-class-token` instead of rejecting it.
- `G1[adversarial-verifier]` (and the other 13 canonical agents) — assertion `model line is exactly the unquoted canonical tier pin "grok-4.6[effort=high|medium]"`, got `model: inherit`.
- `G2-declaration: .cursor/agents/<role>.md carries the canonical unquoted frontmatter pin "grok-4.6[effort=high|medium]"` — all 14 generated agents still carry `model: inherit`.

The run also reported all three materialized Cursor trees in parity before
asserting, so the RED is from the missing #1013 behavior rather than drift.
