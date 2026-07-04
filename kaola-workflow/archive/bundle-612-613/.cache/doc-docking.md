evidence-binding: finalize doc-docking

## Changed files reviewed (full diff, baseline a993091d..HEAD 077341c2)

- CHANGELOG.md (docs — the fix itself)
- 4x kaola-workflow-adaptive-node.js (scripts/, plugins/kaola-workflow/, plugins/kaola-workflow-gitlab/, plugins/kaola-workflow-gitea/) — #612 fail-closed guard
- scripts/kaola-workflow-adaptive-schema.js and its 3 mirrors — confirmed ZERO diff (byte-identical anchor untouched)
- scripts/test-adaptive-node.js — #612 regression fixtures (T612-escape, T612-legit)
- scripts/simulate-workflow-walkthrough.js + gitea/gitlab test-*-workflow-scripts.js — #613 SIGTERM-shim fix

## Documents checked

- CHANGELOG.md — updated (n3-docs), confirmed present in diff above.
- README.md — no impact (see .cache/doc-updater.md rationale).
- docs/api.md, docs/architecture.md — no impact (internal defensive hardening + test-hygiene fix,
  no public API/schema/architecture surface change).
- .env.example — no impact (no new env vars).
- docs/decisions/ (ADRs) — no impact; both fixes are narrow corrections, not architecture decisions,
  per the frozen plan's own Docs scope note.
- kaola-workflow/ROADMAP.md — will be regenerated at archive time (Step 8b), not a docking concern here.

## Gaps found and fixed

None. The plan's own docs-scope reasoning (recorded at freeze time and re-confirmed after the
mid-run #612 scope widening) already correctly scoped documentation impact to CHANGELOG.md only,
and n3-docs executed exactly that.

## Explicit no-impact reasons for skipped document classes

- README/API/architecture/.env.example/ADR: no public behavior, interface, schema, environment
  variable, or architectural surface changed by either fix — both are internal, defensive/test-only
  corrections to existing private functions and test fixtures.

## Final verdict: DOCKED
