evidence-binding: n7-docs 04b9d2106559

## Files changed

- `README.md` — rewrote four passages: (1) profiles+config install globally into `~/.codex` by default, project-local is optional override; (2) update-flow installer line changed to `--global`; (3) doctor scope guidance: `user`/global scope authoritative for profiles, `project` optional, gate accepts EITHER, fails closed when neither; (4) managed-setup prose reframed to `~/.codex/agents/kaola-workflow/` and `~/.codex/config.toml`. Pinned role-list fenced block (L535-543) left untouched.
- `docs/architecture.md` — added #571 global-first short-circuit text to the preflight gate bullet (gate accepts global OR project scope, fails closed when neither; autofix remains project-local); rewrote the compact/resume hook bullet's trailing agent-profiles sentence from project-local to global-default with project-local as override.
- `docs/api.md` — added Global-first short-circuit paragraph before Behavior step 1; added `scope` additive field note to JSON ok output; added `--global` flag documentation block to installer description; rewrote the hooks managed-entry contract's agent-profiles sentence from project-local to global-default.
- `docs/decisions/D-571-01.md` — NEW file; ADR body verbatim from spec §8 (Context / Decision / Consequences / Alternatives considered).
