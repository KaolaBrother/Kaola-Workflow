# Doc Updater — issue-155

## Checklist Results

| Item | Status | Action |
|------|--------|--------|
| CHANGELOG.md | done | Already present under [Unreleased] |
| .env.example | skipped | KAOLA_WORKFLOW_OFFLINE already documented; no new vars |
| README.md | updated | Clarified KAOLA_WORKFLOW_OFFLINE behavior (line 498): added note about target_unavailable refusal when offline and remote fails |
| docs/api.md | updated | Added "Startup Classifier and Remote Validation" section documenting target_unavailable verdict |
| docs/architecture.md | skipped | Only Phase 6 sink flow documented; startup/classification changes don't affect architecture structure |
| Inline comments | skipped | No public interfaces changed in a way that needs comment |

## Files Updated
- `README.md` — KAOLA_WORKFLOW_OFFLINE env var table row clarified
- `docs/api.md` — New section: Startup Classifier and Remote Validation
