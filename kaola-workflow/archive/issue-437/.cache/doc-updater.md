# doc-updater — issue-437

Delegated as node n7-docs (doc-updater role, sonnet). All documentation updates were performed inline by the n7-docs node with the declared write set.

## Documents updated
- `docs/decisions/D-437-01.md` — NEW: decision record for D-419 P2 group-scoped close barrier settlements
- `docs/architecture.md` — added lane-group co-open section under running-set scheduler
- `docs/api.md` — added lane_group schema, --parallel-safe, --group-barrier, open-ready/close-node response extensions
- `docs/workflow-state-contract.md` — extended running-set.json with lane_group durability contract
- `CHANGELOG.md` — [Unreleased]/### Added entry for #437

Anti-fabrication compliance: all structured sections (JSON schemas, CLI flags, function signatures) transcribed from actual source code reads (scripts/kaola-workflow-adaptive-node.js, scripts/kaola-workflow-plan-validator.js).
