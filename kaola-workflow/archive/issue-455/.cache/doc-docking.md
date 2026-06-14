# Documentation Docking — issue #455

## Changed code/config/test/workflow files reviewed
- scripts/kaola-workflow-release.js + 3 forge ports (codex byte copy + gitlab/gitea rename-normalized)
- scripts/test-release.js (RED tests + fixture + crash-resume regression)

## Documents checked
- CHANGELOG.md — `[Unreleased] → ### Fixed` has the #455 entry (verified accurate vs source; no duplicate). UPDATED.
- docs/conventions.md — release-cut section updated with #455 behavior (codex own-series derivation, `--codex-version` override, `codex_version_underivable`/`non_monotonic_codex_version` refusals, `codex_resolution` receipt step, claude-plugin bump, README split, `codex_version`/`codex_version_source` envelope fields). UPDATED, verified vs source.
- docs/decisions/D-442-01.md — `## Amendment (#455)` subsection added (historical decision text preserved). UPDATED.
- docs/api.md — no `--cut`/codex-manifest/release-envelope reference. NO-IMPACT.
- docs/architecture.md — no kaola-workflow-release.js / --cut reference. NO-IMPACT.
- README.md — version lines unchanged (live versions untouched: 5.16.0 / 3.16.0); no release-cut API prose. NO-IMPACT.
- .env.example / inline comments — no new env vars; public CLI surface documented above. NO-IMPACT.

## Gaps found and fixed
- conventions.md + D-442-01.md described the pre-#455 (buggy) cut behavior → updated/amended. No remaining gaps.

## Anti-fabrication
doc-updater transcribed flag/refusal/field names from the actual worktree source (`scripts/kaola-workflow-release.js`); no invented identifiers.

## Final verdict: DOCKED
