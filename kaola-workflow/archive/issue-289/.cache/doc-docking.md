# Documentation Docking — issue-289

## Changed files reviewed (git diff vs origin/main)
- scripts/kaola-workflow-adaptive-schema.js — parseNodeFindings value-lowercasing (4 copies, byte-identical)
- plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js
- scripts/simulate-workflow-walkthrough.js — #289 regression case
- CHANGELOG.md — [Unreleased] Fixed entry (#289)

## Documents checked
- CHANGELOG.md — UPDATED (Fixed entry under [Unreleased]).
- docs/api.md — no change. The #279 findings contract (parseNodeFindings / unresolvedInScopeFixes /
  --verdict-check / scope·action·status·fix_role vocabularies, lowercase) is already documented; the
  fix makes the parser HONOR that already-documented contract regardless of input casing — no schema,
  signature, CLI-output, or contract change.
- docs/architecture.md — no change (no structural/data-flow change; one internal parser line).
- README.md / .env.example / docs/conventions.md — no change (no feature, env var, or convention change).
- Inline comments — UPDATED in-code: parseNodeFindings doc comment now states gate-relevant values
  are lowercased (mirrors parseNodeVerdict). Covered within the schema diff.

## Gaps found and fixed
- None. CHANGELOG is the only doc requiring a new entry; added.

## No-impact reasons for skipped document classes
- API/schema/architecture/README/env: this is an internal case-normalization bug fix to an existing
  parser. No public behavior changes for a CONTRACT-COMPLIANT (lowercase) reviewer; only the
  previously fail-open mis-cased path is now correctly blocked, which is the intended #279 behavior
  already documented. doc-updater SKIPPED with this explicit no-impact reason (avoids a drift-prone
  duplicate per project convention).

## Final verdict: DOCKED
