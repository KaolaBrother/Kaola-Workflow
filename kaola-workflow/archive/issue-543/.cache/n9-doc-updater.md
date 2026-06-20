evidence-binding: n9-doc-updater da48b4551b5a

## Changes

### `docs/decisions/D-543-01.md` (NEW)
Authored a new decision record (mirroring the project's ADR format from D-544-01 / D-538-01 /
D-542-01) documenting both mechanisms shipped this run: **Part A** — the Codex install-time
`--with-fast`/`--with-full` opt-in partition via a pure-JS `seedKaolaConfig` UNION writer added to
the byte-identical `install-codex-agent-profiles.js` triplet (Option A: installer config-writer; the
runtime legality gate was already enforced, so only the writer was missing); and **Part B** — the
folded #544 opencode standalone fix (`scripts/sync-opencode-edition.js` `rewriteClaudeScriptPaths`
rewriting the `kaola_script()` resolver + agent prose to opencode-native paths;
`install-opencode.sh` gaining the same partition + deploying support scripts under
`${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}/kaola-workflow/scripts`). Covers context, decision,
alternatives rejected (plugin split / manifest skills-subset / Codex conditional-deploy D2 /
docs-only config-gate), consequences, and the verification receipts (four #307 chains green;
opencode suite 363 assertions green; n7 + n8 reviews PASS, 0 blocking).

### `README.md` (UPDATED — descriptive prose only; pinned version lines untouched)
Updated the **Runtimes and forges** section to state the behavioral-parity-across-editions posture:
adaptive is the unconditional default on Claude Code, Codex, AND opencode; `fast`/`full` are
install-time opt-ins (`--with-fast`/`--with-full`) on every edition, recorded by UNION into the
shared `~/.config/kaola-workflow/config.json` `installed_paths` field (canonical order, never
removes), enforced by the runtime `path_not_installed` gate (no silent fallback). Also reflected
that the opencode edition is now fully standalone (resolves scripts under opencode-native paths,
never touches `~/.claude/`). Added the `--with-fast`/`--with-full` opt-in examples to the opencode
install command block to mirror the existing Claude Code section. No restructuring; the
validator-pinned version lines (README:1106-1111) were not disturbed.

## Verify exit codes
- `node scripts/validate-workflow-contracts.js` → **exit 0** ("Workflow contract validation passed")
- `node scripts/simulate-workflow-walkthrough.js` → **exit 0** ("Workflow walkthrough simulation passed")
