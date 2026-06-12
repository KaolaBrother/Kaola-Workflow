evidence-binding: n11-docs fe3a409a4a6d

non_tdd_reason: documentation update — no natural failing unit test for prose changes
regression-green: node scripts/simulate-workflow-walkthrough.js → EXIT 0

## Summary of changes

### README.md
- Added `kaola-workflow-run-chains.js` row to the Operational scripts table (Finalization, chain-receipt gate, `--accept-known-red` waiver).
- Added "Evidence seeding (#433)" paragraph after the `adversarial-verifier` paragraph in the adaptive workflow section.

### docs/architecture.md
- Added `.md allowband — narrow, not blanket (#424)` paragraph: allowband definition, consequence for pre-#424 frozen plans.
- Added `Barrier attribution sweep and new finalize-check refusals (#424)` paragraph: `unattributed_change`, `drop_base_window_open`, `root_mismatch`.
- Added `Evidence seeding lifecycle (#433)` paragraph: `ROLE_TOKEN_REGISTRY`, open-time seeding, close-gate binding check, reopen re-seed.
- Added `Provenance log (.cache/provenance-log.jsonl)` paragraph: append-only audit artifact.
- Added `Chain receipt (.cache/chain-receipt.json, #432)` paragraph: script, JSON schema, Finalization gate refusals, contractor Step 8c, waiver flag.

### docs/api.md
- Added three finalize-check typed refusals (`drop_base_window_open`, `unattributed_change`, `root_mismatch`) and three chain-receipt refusals (`chains_unverified`, `chains_stale`, `chains_red`) after the `barrierCheck` reason codes table.
- Added `Script: kaola-workflow-run-chains.js (issue #432)` section: CLI, `--accept-known-red`, output artifact, chain-receipt JSON schema.
- Added `Export: ROLE_TOKEN_REGISTRY (issue #433)` section: module path, type shape, consuming usage.

### docs/conventions.md
- Added `.md files as production surfaces (#424)` section: allowband definition, pre-#424 blanket-exemption removal, `write_set_overflow` consequence.
- Added `Chain receipt is the only valid greenness evidence (#432)` section: three-step contractor protocol, blocking finalize-check refusals, waiver requirement.
