evidence-binding: doc-docking (main-session, no nonce required for this record)

# Documentation Docking — issue-624 (#624)

## Changed files reviewed
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md (adaptive four-gate block ported)
- plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md (adaptive four-gate block ported)
- commands/kaola-workflow-finalize.md (three->four gate-count fix)
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md (three->four gate-count fix)
- plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md (three->four gate-count fix)
- plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js (new #624 pin)
- plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js (new #624 pin)

## Documents checked
- CHANGELOG.md — [Unreleased] entry added (n3-finalize), tagged #624.
- docs/api.md — the four-gate barrier is already correctly documented there (this fix restores
  existing documented behavior on two runtime surfaces that weren't instructing it, no new API
  surface); no edit needed.
- docs/architecture.md — no structural change; no edit needed.
- README.md — no public feature/usage/env-var surface changed; no edit needed.
- .env.example — no new environment variables; no edit needed.
- No decision record needed: restoring dropped prose + adding a machine pin is not an
  architectural decision (per the plan's own Notes) — CHANGELOG + commit provenance suffice.

## Gaps found and fixed
None. n2-review found 0 blocking findings (APPROVE, verbatim port confirmed mechanically byte-
identical, all four chains green).

## Follow-ups filed
None — clean run, nothing deferred.

## Final verdict: DOCKED
