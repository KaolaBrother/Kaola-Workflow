evidence-binding: n2-code-explorer a3801c3a512e

# Exploration Memo: Codex --with-fast/--with-full Partition (issue #543)

## HEADLINE (reframes the problem)
The Codex **runtime legality gate is ALREADY fully shipped and enforced across all editions**. Only the **install-time writer** of `installed_paths` is missing on Codex.
- `kaola-workflow-adaptive-schema.js:504,528-532` (4-tree byte-identical) defines `CONFIG_REL_PATH=['.config','kaola-workflow','config.json']` + `resolveInstalledPaths()`.
- `kaola-workflow-claim.js:849-863` is the SOLE path-legality gate → refuses named-but-not-installed path with `path_not_installed`, never silently substitutes adaptive. (claude↔codex byte-synced)
- Validators pin it: `validate-workflow-contracts.js:841-846`, `validate-kaola-workflow-contracts.js:488-491,559-560`.
- All 4 test suites seed `installed_paths` under hermetic HOME.
- Codex installer `install-codex-agent-profiles.js` NEVER reads/writes `installed_paths`, NEVER parses `--with-fast`/`--with-full`. `install-opencode.sh:156-190` already writes `installed_paths:[]` (defers parity :27,37) — the exact template to mirror.

## RECOMMENDED: Option A — Installer config-writer (mirror Claude install.sh D4)
Add `--with-fast`/`--with-full` arg parsing + UNION read-modify-write of `~/.config/kaola-workflow/config.json` `installed_paths` into `install-codex-agent-profiles.js` triplet.
- Touches: `install-codex-agent-profiles.js` ×3 (byte-identical triplet); test assertions in `simulate-kaola-workflow-walkthrough.js` + `test-{gitlab,gitea}-workflow-scripts.js` + `test-install-model-rendering.js`; README install prose.
- Preserves invariants: triplet byte-identical (same edit ×3); plugin.json untouched → `./skills/` assertion holds; no manifest version change → lockstep + release-surface-drift hold; runtime gate already reads this exact config — ZERO runtime/script change.
- Conditional-deploy (D2) does NOT map to Codex: `kaola-workflow-fast` SKILL.md is validator-mandatory (`validate-kaola-workflow-contracts.js:85,90-97`); the 15 agent profiles are ROLE profiles not path-specific. So the partition is R1+D4 (config-writer) only; the runtime gate does enforcement.

## Claude install.sh reference (mechanism to mirror) — install.sh:1-832
- Defaults :51-52 WITH_FAST=0/WITH_FULL=0. Arg parsing :104-109.
- R1 effective UNION :211-216: read existing installed_paths; EFFECTIVE = already-installed OR requested.
- D2 conditional copy :518-524,766-771 (fast.md iff EFFECTIVE_FAST; phase1-5 iff EFFECTIVE_FULL).
- D4 config UNION write :704-741: python3 read-modify-write of ~/.config/kaola-workflow/config.json; `paths=set(existing) if list else set()`; add fast/full; `config["installed_paths"]=[p for p in ("fast","full") if p in paths]` (canonical order, {fast,full} only, unknown dropped); pop enable_adaptive (migrate); WARN-first never throws.
- Net: UNION never removes; reinstall preserves; uninstall→reinstall resets to [].

## Byte-twin / triplet lockstep groups (validate-script-sync.js)
1. **Codex installer triplet** :205-211 — `plugins/kaola-workflow/scripts/install-codex-agent-profiles.js` ↔ -gitlab ↔ -gitea. NO root copy. PRIMARY touch point → edit replicated ×3 byte-for-byte.
2. Release twin :85 — `scripts/kaola-workflow-release.js` ↔ `plugins/kaola-workflow/scripts/`. (no edit needed)
3. validate-workflow-contracts.js root↔codex twin :52 (985 lines, byte-identical). (no logic edit needed)
4. Codex manifest version-lockstep triplet — 3 plugin.json version (release checkLockstep :214-238). DO NOT bump version.
5. adaptive-schema 4-tree :181-188 (read-only here).
6. codex-preflight 4-tree :193-200 — mirrors installer schema constants; a pure config-writer addition does NOT touch RETIRED_PROFILE_FILES/EFFORT_VALUES so NO preflight change.
7. agent-profile .toml triples :215-224 (not partition-relevant).

## Mechanism options verdict
- A (installer config-writer) ✅ RECOMMENDED — cheapest, invariant-preserving, Claude-parity, runtime already enforces.
- B (conditional-deploy D2) ⚠️ no natural file target on Codex (fast SKILL mandatory; profiles are role-based).
- C (manifest skills-subset) ❌ BREAKS `assert(pluginJson.skills==="./skills/")` in 3 validators + conflicts with Codex runtime skill discovery.
- D (plugin split) ❌ massively invasive (new marketplace.json, release/checkLockstep rewrite, version-lockstep surface) — disproportionate.
- E (docs-only config-gate) ❌ user-hostile (Codex-only users forced to hand-edit); A strictly better.

## Risk flags
1. plugin.json `skills` is load-bearing `"./skills/"` (asserted ×3) → A/E only.
2. fast SKILL.md validator-mandatory ×3 → partition must be config-gate, NOT file-removal.
3. Installer triplet byte-identity — codex chain runs validate-script-sync.js first.
4. codex-preflight schema-mirror lockstep (untouched by Option A).
5. Release-surface drift + lockstep — DO NOT bump manifest version; land under current 4.7.0.
6. README version lines validator-pinned (:528-533,550) — don't disturb.
7. Shared config path edition-agnostic — Codex writer must use IDENTICAL UNION/canonical-order logic or clobbers a Claude install's installed_paths. Mirror D4 byte-semantically.
8. install-opencode.sh already owns an installed_paths writer — match it so 3 writers are behaviorally identical.
9. Cross-edition #307 obligation — touching install-codex-agent-profiles.js (edition-port) requires ALL FOUR npm chains green sequentially; claude alone insufficient.
