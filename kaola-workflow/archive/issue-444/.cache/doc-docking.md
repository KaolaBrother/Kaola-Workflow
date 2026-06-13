# Documentation Docking — issue-444

## Changed files reviewed
- `scripts/kaola-workflow-adaptive-node.js` — `buildDispatch()`, `deriveGuards()`, `runVerifyEvidence()` added
- `plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js` — codex twin (generated)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js` — gitlab port (generated)
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js` — gitea port (generated)
- `scripts/test-adaptive-node.js` — 5 new D444 assertions
- `docs/decisions/D-444-01.md` — new decision record (untracked, staged by contractor)
- `commands/kaola-workflow-plan-run.md` + 5 plugin plan-run surfaces — dispatch descriptor prose
- `CHANGELOG.md` — #444 entry added
- `docs/api.md` — dispatch sub-object schema + --verify documented (n4 + doc-updater)
- `docs/architecture.md` — dispatch descriptor single-builder paragraph added (doc-updater)

## Documents checked
| Document | Status | Notes |
|----------|--------|-------|
| CHANGELOG.md | UPDATED | #444 entry under [Unreleased] ### Added |
| docs/api.md | UPDATED | dispatch sub-object (10 fields) + record-evidence --verify documented from real code |
| docs/architecture.md | UPDATED | Dispatch descriptor single-builder paragraph added |
| commands/kaola-workflow-plan-run.md | UPDATED | dispatch descriptor prose (n4) |
| plugins/*/skills/kaola-workflow-plan-run/SKILL.md ×3 | UPDATED | dispatch descriptor prose (n4) |
| plugins/*/commands/kaola-workflow-plan-run.md ×2 | UPDATED | dispatch descriptor prose (n4) |
| docs/decisions/D-444-01.md | CREATED | Decision record (n2) |
| README.md | SKIPPED | No user-visible workflow feature change; internal adaptive-path improvement |
| .env.example | SKIPPED | No new environment variables |
| docs/workflow-state-contract.md | SKIPPED | No change to running-set.json or workflow-state schema |

## Gaps found and fixed
None. All code/test changes are reflected in docs:
- `buildDispatch()` field set: documented in `docs/api.md` § opened payload dispatch sub-object
- `deriveGuards()` guard vocabulary: documented in same section
- `record-evidence --verify`: documented in `docs/api.md` § record-evidence --verify
- ×6 prose surfaces updated to reference script-emitted descriptor
- Architecture note added

## Explicit no-impact reasons for skipped classes
- README.md: internal adaptive-node plumbing; no new CLI command, no user-facing config change
- .env.example: no new env vars
- docs/workflow-state-contract.md: no schema change (running-set.json unchanged, workflow-state unchanged)

## Final verdict: DOCKED
