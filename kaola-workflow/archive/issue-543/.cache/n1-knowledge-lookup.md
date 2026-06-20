evidence-binding: n1-knowledge-lookup c27b6f5af027

# Research: Codex CLI Plugin Model (issue #543 opt-in partition)

Sources: OpenAI Codex docs — Plugins (developers.openai.com/codex/plugins), Build plugins (/plugins/build), Agent Skills (/skills); + local plugin packaging.

## Answers
1. **Plugin install model — CONFIRMED.** Codex has a documented plugin/marketplace system. Entry: `/plugins` UI or `codex plugin marketplace add owner/repo`. On-disk cache: `~/.codex/plugins/cache/$MARKETPLACE/$PLUGIN/$VERSION/`. Manifest `.codex-plugin/plugin.json` is required; `skills` is a single path string `"./skills/"`. No `codex plugin add <name>` verb — verbs are `marketplace add/list/upgrade/remove`; enable/install via `/plugins` UI or `policy.installation`.
2. **Post-install opt-in mechanism — PARTIAL/HARD CAVEAT.** Lifecycle hooks exist (`hooks/hooks.json`, `SessionStart`; env `PLUGIN_ROOT` + `PLUGIN_DATA`). BUT plugin-bundled hooks are non-managed → Codex SKIPS them until user reviews+trusts them; no documented install-lifecycle (`PostInstall`) event. So no silent install-time transform. `policy.installation: AVAILABLE|INSTALLED_BY_DEFAULT|NOT_AVAILABLE` is a native per-plugin (NOT per-skill) opt-in knob.
3. **Skills pruning — config-based CONFIRMED; on-disk deletion inferred/non-durable.** `~/.codex/config.toml` `[[skills.config]] path=... enabled=false` disables a skill without deleting. `agents/openai.yaml policy.allow_implicit_invocation:false` blocks implicit (still allows `$skill`). Deleting `skills/` subdir works but is undocumented + non-durable (reinstall repopulates).
4. **Plugin split — CONFIRMED viable.** One `marketplace.json` (`.agents/plugins/marketplace.json` repo-scoped or `~/.agents/plugins/marketplace.json`) holds a `plugins[]` array, each with `source.path`/`policy.installation`. LOCAL GAP: this repo ships NO `marketplace.json` today (glob empty) → split requires authoring one.
5. **`installed_paths` mapping — INFERRED (no native equivalent).** No Codex-native UNION list. Map: per-skill `[[skills.config]] enabled` or a plugin-scoped JSON in `PLUGIN_DATA` (documented writable dir). Claude `install.sh:704-733` confirmed UNION semantics (adaptive never in list; reinstall unions; canonical {fast,full}; written to `~/.config/kaola-workflow/config.json`).

## Recommended mechanism
Hybrid: (a) plugin split + (d) config-gated. Split into 3 marketplace plugins (core=INSTALLED_BY_DEFAULT, fast/full=AVAILABLE). Trade-offs: splitting cost (shared agents/hooks/config factor across 3); UNION-state gap (Codex has none; would need trusted SessionStart hook → interactive); marketplace authoring required.

## unknowns
- PostInstall hook event beyond SessionStart (unconfirmed).
- Exact config.toml schema for [[skills.config]] vs [plugins."…"] precedence.
- Whether INSTALLED_BY_DEFAULT auto-installs on `marketplace add` without opening `/plugins`.
- Whether the official curated Plugin Directory (current `kaola-workflow@4.6.2` route) supports publishing 3 sibling plugins with mixed installation policies.
- PLUGIN_DATA exact path + persistence across version upgrades.

NOTE: n2's local exploration REFRAMES this — the runtime legality gate (claim.js path_not_installed) is already shipped; the plugin-split (a) is massively invasive and unnecessary. Combined recommendation converges on n2's Option A (installer config-writer) as the cheapest sufficient mechanism; a marketplace split is documented-viable but disproportionate.
