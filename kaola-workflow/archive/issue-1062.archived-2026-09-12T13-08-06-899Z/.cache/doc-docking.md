# Documentation docking — issue-1062

verdict: DOCKED
candidate: 04f660951cb8d186337642960f3c53de2e7073cd (branch `workflow/issue-1062`)

## Checked files

- `README.md` — updated (`7b52e20c`): seven roles; per-runtime subagent default binding table (Claude `sonnet`, Codex `gpt-5.6-luna`/`max`, Grok `grok-4.6`/`medium`, Cursor `grok-4.6[effort=medium]`); OpenCode/Kimi/ZCode/Devin install no Kaola role profiles; runtime table; 12.0.0 upgrade note (reinstall every machine, Cursor Cloud rebuild).
- `docs/api.md` — updated (`7b52e20c`, `04f66095`): `generate-agent-profiles.js` (7 `ROLES`, `BINDING_RUNTIMES`, `isBindingAdapter`, manifest `runtimes` + `native_only_runtimes`, 42-render success line), `runtime-capabilities.json` schema (`role_dispatch: named_profile|native_only`, `subagent_default {model, effort?, summary}`), kernel exports (`CODEX_PINNED_ROLES`, `CODEX_PINNED_MODEL`, `CODEX_PINNED_EFFORT`), `validateProfileText` present-and-equal semantics, sync scripts that render no agents, installer behavior.
- `docs/architecture.md`, `docs/agents-source.md`, `docs/runtime-capabilities.md`, `docs/conventions.md` — updated (`7b52e20c`): role inventory, provenance entries, adapter matrix in two classes, single Codex pin sentence; the "Two validation tiers" section (fast/full test chains) intentionally unchanged.
- `docs/{grok,cursor,opencode,kimi,zcode,devin}-edition.md` — updated (`8ec4c234`, `7b52e20c`, `04f66095`): Grok pins model+effort; Cursor records the official omit-`model`-means-inherit semantic and the Cloud rebuild; the four native_only docs state no Kaola profiles, vendor-native dispatch, and ownership-gated removal of the previously installed 14; Devin keeps the #1061 router measurement as the record of why Kaola has no lever.
- `CHANGELOG.md` `[Unreleased]` — updated (`7b52e20c`): major upgrade note (next 12.0.0), migration map, binding table, native_only, routing prose, ADR 0025 + status notes; `### Fixed` records the Kimi and ZCode sweep ownership gates. One pre-existing dead history link (`docs/plan-run-cards/reopen-complete-node.md`, retired directory) left as history.
- `docs/decisions/0025-lean-orchestrator-single-subagent-binding.md` — new (`7b52e20c`, §7 tightened in `04f66095`); `0019`, `0021`, `D-687-01` annotated as superseded; `docs/README.md` catalog entry and "forthcoming" wording replaced.
- `AGENTS.md`, `CLAUDE.md` — no-impact: source layout and commands unchanged; `.claude/agents/` still holds Claude's (now seven) native profiles.
- Public-interface comments — updated in `generate-agent-profiles.js`, `kaola-workflow-adaptive-schema.js`, `kaola-workflow-codex-preflight.js`, `kaola-workflow-resolve-agent-model.js` (+ byte-identical plugin copies), the six `sync-*-edition.js`, the four contract validators, and every installer header.

## Evidence

- Version numbers are not bumped in-run: `scripts/kaola-workflow-release.js --prepare --version 12.0.0` owns the lockstep bump at release; the changelog states the release is major.
- Live-doc grep for retired vocabulary (`intent_class`, `intent_mapping`, `Tier defaults`, `Role roster`, `standard/reasoning/heavy`, `CODEX_PINNED_(STANDARD|REASONING|HEAVY)_ROLES`, `KAOLA_OPENCODE_*_MODEL`, `rolesByIntent`, `BEHAVIOR_ROLES_BY_TIER`, `custody-bearing`, `model="opus"`) over `README.md` and `docs/` excluding `docs/decisions/` and `docs/investigations/`: zero hits at `04f66095`.
- Relative links in every touched document resolve (one-off check during handoff 5).
- Focused chain `npm run test:kaola-workflow:claude` exit 0 after the documentation commit; full chains recorded in `chain-receipt.json`.
