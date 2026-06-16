evidence-binding: n2-docs f83e3e7890da

## Work completed

Verified `resolveTimeoutMs(env)` in `scripts/kaola-workflow-run-chains.js` (lines 324-327):
- Default: `900000` (15 min), used when value is non-numeric, zero, or negative
- Parse: `parseInt(env.KAOLA_RUN_CHAINS_TIMEOUT_MS || '', 10)`; fallback condition: `!(Number.isFinite(v) && v > 0)`
- No upper clamp (confirmed: only the `> 0` lower guard; no max check)
- Consumed at `:272` `spawnSync` `timeout:` field

Four files edited:

1. **`docs/api.md`** — Added `KAOLA_RUN_CHAINS_TIMEOUT_MS` bullet in the `### Timeout Control` env-var section (after `KAOLA_GH_REMOTE_TIMEOUT_MS`). Also added a `**Configurable kill ceiling (#512).**` note in the `### Script: kaola-workflow-run-chains.js` section after the receipt description paragraph.

2. **`README.md`** — Added a table row `| KAOLA_RUN_CHAINS_TIMEOUT_MS | 900000 | ... (issue #512) |` immediately after the `KAOLA_GH_REMOTE_TIMEOUT_MS` row.

3. **`.env.example`** — Added a commented stanza `# KAOLA_RUN_CHAINS_TIMEOUT_MS=900000` with a one-line comment, mirroring the existing `KAOLA_GH_REMOTE_TIMEOUT_MS` block.

4. **`docs/decisions/D-512-01.md`** — Created new decision record. Chosen fix: parameterize via `KAOLA_RUN_CHAINS_TIMEOUT_MS` (default 900000). Deferred: speed-up track (root cause unknown). Receipt schema unchanged. Cross-edition via `validate-script-sync.js`.
