# Documentation Docking — issue-571

Verdict: **DOCKED**

## Changed code/config/test/workflow files reviewed (git diff vs origin/main)
- Preflight ×4: `scripts/kaola-workflow-codex-preflight.js` + 3 plugin copies (global-scope acceptance + fail-closed predicate).
- Installer ×3: `plugins/kaola-workflow{,-gitlab,-gitea}/scripts/install-codex-agent-profiles.js` (`--global` flag).
- Tests: codex `simulate-kaola-workflow-walkthrough.js`, forge `test-{gitlab,gitea}-workflow-scripts.js` (new #571 tests + hermetic-HOME retrofit), `scripts/test-install-model-rendering.js` (narrative flip).
- Init surface ×6: `commands/workflow-init.md` ×3 + `skills/kaola-workflow-init/SKILL.md` ×3 (scaffolding-only, `--global`).
- Contract validators ×3: `scripts/validate-kaola-workflow-contracts.js` + 2 forge (additive regression locks).

## Documents checked + result
- `README.md` — DOCKED (n7): project-local→global default; doctor scope guidance; update-flow `--global`; role-catalog pinned block untouched.
- `docs/architecture.md` — DOCKED (n7): preflight gate either-scope + fail-closed; profiles global-default.
- `docs/api.md` — DOCKED (n7): preflight global-first short-circuit + `scope` field; installer `--global` documented; project-local override.
- `docs/decisions/D-571-01.md` — DOCKED (n7): new ADR (Context/Decision/Consequences/Alternatives).
- `CHANGELOG.md` — DOCKED (n8): `[Unreleased]` entry under #571.
- `.env.example` — N/A: no new environment variables.
- Inline comments — DOCKED: `#571`-referenced comments added in preflight + installer (verified by n6 review).

## Gaps found and fixed
None. Every public-behavior change (the `--global` flag, the preflight either-scope acceptance, the init scaffolding-only default) is reflected in README + architecture + api + CHANGELOG + the ADR.

## No-impact reasons for skipped doc classes
- `.env.example`: no new env vars introduced (the gate reads the ambient `HOME`/`~/.codex`, which is pre-existing OS state, not a project env var).
- Doc-updater re-dispatch skipped: the n7-docs node already executed the doc-updater role and produced these docs (evidence `kaola-workflow/issue-571/.cache/n7-docs.md`); re-invoking would be redundant (validation de-duplication).
