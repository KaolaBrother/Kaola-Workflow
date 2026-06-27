# Documentation Docking — issue-572

## Changed code/config/test files reviewed
- commands/workflow-init.md, plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md, plugins/kaola-workflow-gitlab/commands/workflow-init.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md, plugins/kaola-workflow-gitea/commands/workflow-init.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md — 6 injected-template surfaces re-grounded phase-free on the adaptive DAG-of-roles model.
- scripts/validate-kaola-workflow-contracts.js — phase-number/phase-file ban over all 6 initFiles + cross-forge content parity; needle move.
- scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js (#274 byte-mirror), plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js — init durable-state needle moves.
- scripts/test-opencode-edition.js — opencode phase-ban + parity (A24).

## Documents checked
- CHANGELOG.md — UPDATED ([Unreleased] ### Fixed, #572 entry). ✓
- docs/decisions/D-572-01.md — CREATED (new ADR). ✓
- README.md — no impact: install/feature surface unchanged (the change is to the injected consumer template + contract validators, not to install or any user-facing CLI).
- docs/api.md — no impact: no public API/schema/event/external contract added; the new validator assertions are internal test contracts, not an external API. The ADR documents them.
- docs/architecture.md — no impact for #572: it describes the system's paths (full = 6-phase ladder; adaptive = default). #572 changes the injected CONSUMER template, not the architecture's own path descriptions. (Observed: arch.md:11 "full — … the default" is itself stale 6-phase-as-default framing post-#538, but it is pre-existing, out of #572's frozen write set, and not the injected template — captured as a follow-up; see ## Run gaps.)
- docs/opencode-edition.md — no impact: describes the opencode edition generally; the phase-ban/parity enforcement lives in test-opencode-edition.js and is covered by the ADR.
- docs/conventions.md — no impact: no current section documents the injected-template phase vocabulary; the ADR is the home for the new contract.
- .env.example — no impact: no new env vars.
- Inline comments — the new validator assertions carry their own #572 explanatory comments (part of n1).

## Gaps found and fixed
None blocking. Doc impact is exactly CHANGELOG.md + the new ADR (both in the n3 declared write set, authored main-session-direct).

## Final verdict
DOCKED
