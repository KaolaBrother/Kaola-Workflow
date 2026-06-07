# Documentation Docking — issue #247

## Changed files reviewed (git diff)
- commands/kaola-workflow-adapt.md (prose: in_progress flip trigger → dispatch)
- plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md (prose: pinned vague trigger to dispatch)
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md (prose)
- plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md (prose)
- plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md (prose: passive→active)
- CHANGELOG.md ([Unreleased] → ### Fixed entry for #247)

## Documents checked
- CHANGELOG.md — entry ADDED under [Unreleased] → ### Fixed. ✓
- README.md — no impact (no feature/usage/env-var change; this is internal command/skill prose).
- docs/api.md, docs/architecture.md — no impact (neither documents the task-list-mirror flip-trigger wording; that prose lives only in the adapt/plan-run command+skill surfaces themselves).
- .env.example — no impact (no env vars).
- docs/workflow-state-contract.md — no impact (the task list is a cosmetic, ledger-derived mirror; contract unchanged).

## doc-updater
SKIPPED with explicit reason: the deliverable IS documentation/prose normalization of the workflow's own command+skill surfaces; there is no public behavior, API, setup, architecture, env, or docs/ impact beyond the required CHANGELOG entry (added). Running doc-updater would risk edits outside the frozen scope for zero docking gain.

## Gaps found / fixed
None.

## Final verdict: DOCKED
