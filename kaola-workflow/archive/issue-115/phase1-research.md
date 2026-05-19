# Phase 1 - Research / Discovery: issue-115

## Deliverable
Plugin manifests for kaola-workflow-gitea (`.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`), marketplace entry in `.agents/plugins/marketplace.json`, and `install.sh --forge=gitea` branch.

## Why
Wires the Gitea plugin into the install path and marketplace so users can install with `./install.sh --forge=gitea`.

## Affected Area
- `plugins/kaola-workflow-gitea/.claude-plugin/plugin.json` — exists, needs version bump to 3.10.0
- `plugins/kaola-workflow-gitea/.codex-plugin/plugin.json` — exists and correct
- `.agents/plugins/marketplace.json` — already has Gitea entry (no change needed)
- `install.sh` — needs gitea) case + usage/error/skip-guard updates

## Key Patterns Found
1. GitLab case in install.sh (lines 103-123): `SUPPORT_DIR`, `SOURCE_COMMANDS_DIR`, `SOURCE_SCRIPTS_DIR`, `SOURCE_HOOKS_DIR`, 9 `SUPPORT_SCRIPT_NAMES`, shared `SUPPORT_HOOK_NAMES`
2. Skip-guards pattern: `[[ "$FORGE" = "gitlab" && ...condition... ]]` at lines 300, 465, 471, 483
3. Plugin list grep pattern at line 144: `kaola-workflow(-gitlab)?@` (needs gitea added)
4. `.claude-plugin/plugin.json` version should match package.json (3.10.0)

## Test Patterns
- Framework: node (hand-rolled assert)
- Location: `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- Structure: per-function assert blocks

## Config & Env
No new env vars. GITEA_SERVER_URL and GITEA_TOKEN are forge-level, not install.sh concerns.

## External Docs
docs-lookup: N/A — internal patterns sufficient

## GitHub Issue
KaolaBrother/Kaola-Workflow#115

## Completeness Score
9/10

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | internal patterns sufficient | no external library/API usage |

## Notes / Future Considerations
- `.codex-plugin/plugin.json` version is 1.5.0 — separate versioning from .claude-plugin; keep as-is
