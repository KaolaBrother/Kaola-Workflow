# doc-updater evidence — issue-249

## Changes applied (by node)

### n16 (doc-updater node)
- `README.md`: 6 occurrences of `docs-lookup` → `knowledge-lookup`
- `docs/api.md`: 1 occurrence of `docs-lookup` → `knowledge-lookup` (line 453, Phase 1/research research-dispatch desc)

### n17 (finalize node)
- `CHANGELOG.md`: added `#249` entry under `[Unreleased] → ### Added`

## Checklist status

- [x] README.md — updated (role name, agent table, badge section, model-table, phases table)
- [x] API docs (docs/api.md) — updated (Phase 1 research-dispatch description)
- [x] CHANGELOG.md — entry added under [Unreleased]
- [ ] Architecture docs — no structural change; role rename + capability broadening does not alter data flow, system structure, or script architecture. No update required.
- [ ] .env.example — no new env vars introduced
- [ ] Inline comments — no public interface changed; rename is config/prompt files only
