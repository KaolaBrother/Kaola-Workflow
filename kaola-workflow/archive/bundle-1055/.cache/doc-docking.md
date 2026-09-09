# Documentation docking — bundle-1055 (candidate c0abadc9)

| file | checked | result |
|---|---|---|
| `CHANGELOG.md` | `[Unreleased]` above `[11.0.0]`: Changed (ownership relocation, shared generator helpers), Removed (every deleted symbol incl. the four dispatch constants and the gitlab/gitea `requiredArchiveFiles` wrapper), Added (300-comparison oracle, CRLF acceptance, migrated cursor pin) | fixed |
| `docs/api.md` | claim export list now states `defaultBranch` is defined in adaptive-schema and re-exported; sync-script CLI row notes the shared `runtime-edition-forge.js` helpers; grep for `computeLandableBlobEntries|scopeIsFresh|requiredArchiveFiles|lowerSet|ZERO_HASH|cursorModelPin` → no stale mention | fixed |
| `docs/architecture.md` | module-ownership paragraph: adaptive-schema owns the four root/branch helpers, sink-merge/sink-pr import from owners, closure/archive helpers stay in claim with the reason, shared generator helpers | fixed |
| `README.md` | does not enumerate exports or test suites by name | no impact |
| `docs/README.md` | index unchanged; no new doc file | no impact |
| ADR | no design change: ownership moves follow ADR 0017/0018's kernel/claim split; no new ADR | no impact |
| public-interface comments | `sink-merge.js`, `sink-pr.js`, `claim.js` import-site comments state the new owner; stale `scopeIsFresh` comments in the codex walkthrough and the stale `mainRootFromCoord` comment in sink-merge fixed | fixed |
| examples | `docs/api.md` commands unchanged; oracle usage (`--write-baseline`) documented in the test header and CHANGELOG | no impact |

Evidence: `kaola-workflow/bundle-1055/docs.md` (doc-updater report, every fact verified with `grep -n` against `8791ab55`), orchestrator follow-up edits landed in `c0abadc9`.

DOCKED
