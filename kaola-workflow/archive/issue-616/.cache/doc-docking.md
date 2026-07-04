# Documentation Docking — issue-616

verdict: DOCKED

## Changed surfaces vs docs

- `scripts/kaola-workflow-adaptive-node.js` (+3 forge ports): new `serialDegradeReason` field on the `open-ready`/`open-next` response — documented in `docs/api.md` (n3-docs, matched the existing `speculativeWriteExcluded` entry's style/format).
- `scripts/test-adaptive-node.js`: test-only, no doc surface.
- `CHANGELOG.md`: `[Unreleased]` entry added (this node) under `### Fixed`, referencing #616 and #615, matching established format (cross-edition #307 note included).
- No README, architecture.md, .env.example, or roadmap impact — this is an additive response-field change with no setup/config/architecture-shape implication.

## No-impact reasons

- `docs/architecture.md`: unaffected — no structural change, same `runOpenReady` formation sites and control flow as #615 documented there; only a response field was added.
- `README.md`: unaffected — no user-facing setup/usage change.
- `.env.example`: unaffected — no new environment variable.
