# explore — structural findings for issue #266 (code-explorer, read-only)

## 1. Edition tree layout (4 trees)
- claude → top-level `scripts/` (~40 files)
- codex → `plugins/kaola-workflow/scripts/` (22 files; base-named copies, e.g. `kaola-workflow-claim.js`)
- gitlab → `plugins/kaola-workflow-gitlab/scripts/` (26; EDITION-NAMED ports `kaola-gitlab-workflow-*.js`)
- gitea → `plugins/kaola-workflow-gitea/scripts/` (25; EDITION-NAMED `kaola-gitea-workflow-*.js`)
- Forge-neutral shared scripts (adaptive-schema, closure-contract, resolve-agent-model) keep the
  `kaola-workflow-` base name in ALL 4 trees and are byte-identical everywhere.

## 2. ⚠️ CRITICAL: COMMON_SCRIPTS vs BYTE_IDENTICAL_GROUPS (`scripts/validate-script-sync.js`)
- **COMMON_SCRIPTS** (lines ~39-60, 14 entries) compares ONLY 2 trees: `scripts/` (claude) ↔
  `plugins/kaola-workflow/scripts/` (codex). Lines 10-11 hardcode `claudeDir`/`codexDir`. It does
  NOT check gitlab/gitea.
- **BYTE_IDENTICAL_GROUPS** (lines ~62-119) is the N-tree check. Precedent: `adaptive-schema constant
  copies` group lists all 4 paths.
- ⇒ For a NEW script meant to be byte-identical across ALL 4 trees (`kaola-workflow-codex-preflight.js`,
  `kaola-workflow-task-mirror.js`): add to COMMON_SCRIPTS (2-tree guard) **AND** add a new
  BYTE_IDENTICAL_GROUPS entry listing all 4 paths. The plan note "add to COMMON_SCRIPTS" alone is
  INCOMPLETE — flag to architect. (`validate-script-sync.js` is in the `preflight` node write set.)

## 3. Contract-validator registration assertion pattern
- `scripts/validate-workflow-contracts.js` (claude) ~525-538: `assert(exists('scripts/<new>.js'), ...)`
  + `assertIncludes('install.sh', '<new>.js')` (+ gitlab/gitea edition-named variants).
- `scripts/validate-kaola-workflow-contracts.js` (codex-only) ~261-269 has a `sharedScripts` array +
  `exists()` loop; new shared scripts must be added there.
- gitlab `validate-kaola-workflow-gitlab-contracts.js` ~159-195 and gitea equivalent ~158-196 use
  `scriptFiles[]` + `installSupportScripts[]` arrays with `exists()` / `install.includes()` asserts.
- ⚠️ The "12→13 count bump" memory is for **AGENT PROFILE .toml files** (`agentFiles.length === 13`),
  NOT scripts. New SCRIPTS are array-enumerated → no numeric count bump needed. (Adding a new ROLE
  would bump 13→14; this issue adds no role.)

## 4. install.sh — three SUPPORT_SCRIPT_NAMES blocks
- github ~142-160 (base names), gitlab ~172-191 (`kaola-gitlab-workflow-*`), gitea ~203-222
  (`kaola-gitea-workflow-*`). Add base name to github block; edition-named variants to gitlab/gitea.
- Separate `SUPPORT_HOOK_NAMES` arrays follow each block (~161-165 / 193-197 / 223-227).

## 5. Compact-context hook pattern + ⚠️ Codex hook gap (AC-E/F)
- `scripts/kaola-workflow-compact-context.js` (claude), `plugins/kaola-workflow/scripts/…` (codex
  copy, EXCLUDED from COMMON_SCRIPTS — see sync comment ~22-30), gitlab/gitea EDITION-NAMED
  (`kaola-gitlab-…` / `kaola-gitea-…`). NOT byte-synced.
- Wired via `hooks/hooks.json` (claude) + `plugins/*/hooks/hooks.json` (gitlab/gitea), command
  references `$CLAUDE_PLUGIN_ROOT/scripts/…`. The `$CLAUDE_PLUGIN_ROOT` is in the WIRING (hooks.json),
  NOT inside the script body. The compact-context SCRIPTS themselves do NOT reference CLAUDE_PLUGIN_ROOT.
- ⚠️ **Codex has NO hooks.json.** `plugins/kaola-workflow/` has only `hooks/kaola-workflow-pre-commit.sh`;
  `.codex-plugin/plugin.json` has NO `hooks` key (only `skills`/`interface`). There is NO existing
  Codex lifecycle-hook mechanism. The compact/resume hook REGISTRATION SURFACE is net-new — architect
  must decide (plugin-bundled vs workflow-init managed-block vs `.codex/config.toml`). The script can
  exist as 3 edition copies regardless; AC-F (no CLAUDE_PLUGIN_ROOT / no Claude settings schema) is
  satisfied by keeping the script self-contained like compact-context.

## 6. AC-A Claude `Agent(...)` leak census → stays ONE node
- `kaola-workflow-init/SKILL.md` ×3 editions, **line ~66**: bullet references `Agent(...)` call +
  `~/.claude/agents` (Claude-specific). IN SCOPE — replace whole bullet with Codex-native dispatch
  description (role + prompt + cwd + expected_cache + declared_write_set + model packet).
- `plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md` **line ~106**: parenthetical
  "In Claude Code dispatch it via the Agent tool (`subagent_type="workflow-planner"`); in Codex
  delegate to the `workflow-planner` agent role" — Codex clause ALREADY present; surgical fix =
  remove the Claude parenthetical only. (No gitlab/gitea adapt SKILL.md exists — codex only.)
- `kaola-workflow-finalize/SKILL.md` ×3: NO `Agent(`/`subagent_type=`. "MUST delegate" is legit
  enforcement prose — NOT in AC-A scope. ⇒ AC-A does NOT split.
- Note: adapt SKILL.md line ~124 `kaola_script()` shell fn uses CLAUDE_PLUGIN_ROOT inside a code
  fence — separate from the line-106 prose leak; treat per architect call.

## 7. Role-profile / config freshness (AC-B preflight)
- Profiles: `plugins/kaola-workflow/agents/*.toml` (13 files). Installed by
  `plugins/kaola-workflow/scripts/install-codex-agent-profiles.js` into
  `{projectRoot}/.codex/agents/kaola-workflow/*.toml`.
- Managed block markers (install-codex-agent-profiles.js ~12-13):
  `# BEGIN kaola-workflow agents` … `# END kaola-workflow agents`; content from
  `plugins/kaola-workflow/config/agents.toml` (`managedBlock()` ~58-64), one `[agents.{role}]` per role.
- AC-B preflight must verify: (a) `.codex/agents/kaola-workflow/` exists w/ expected .toml set;
  (b) `.codex/config.toml` contains the managed block; (c) block roles match current template set;
  on missing/stale → auto-run installer when safe OR typed repair refusal; NEVER silent continue.

## 8. Ledger/Nodes parsing helpers (AC-C task-mirror)
- `scripts/kaola-workflow-plan-validator.js`: `parseNodes(content)` (~122-149),
  `parseLedger(content)` → `Map<id,status>` (~159-175), `readStoredHash(content)` (~494-497) matches
  `<!-- plan_hash: <64hex> -->`. Already reused by `kaola-workflow-next-action.js` (`require(...)`).
- ⇒ `kaola-workflow-task-mirror.js` should reuse parseNodes + parseLedger + readStoredHash; map
  `n/a` ledger status → output `status:"completed"` + `ledger_status:"n/a"`. Source file:
  `kaola-workflow/{project}/workflow-plan.md`.

## Downstream implications
- preflight + task-mirror: need BOTH COMMON_SCRIPTS and a BYTE_IDENTICAL_GROUPS entry (architect to
  confirm + sequencing: both new scripts must exist in all 4 trees before validate-script-sync.js
  passes; the per-node barrier does NOT run npm test, so end-state consistency at Phase-6 is what matters).
- script-registration node already lists install.sh + the 4 contract validators (claude + codex copy
  + codex-only + gitlab + gitea) — covers Q3/Q4. Verify the codex `validate-workflow-contracts.js`
  copy stays byte-identical with root.
- Codex compact/resume hook registration surface is the biggest open design question → architect.
