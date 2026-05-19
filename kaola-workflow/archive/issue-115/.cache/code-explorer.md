# Code Explorer: issue-115

## Files Inspected

- `install.sh` (518 lines): forge dispatch at lines 82-129, skip-guards at 300, 465-472, 483
- `plugins/kaola-workflow-gitlab/` — mirror template
- `plugins/kaola-workflow-gitea/.claude-plugin/plugin.json` — EXISTS, version 3.8.1 (needs 3.10.0)
- `plugins/kaola-workflow-gitea/.codex-plugin/plugin.json` — EXISTS, Gitea wording, version 1.5.0
- `.agents/plugins/marketplace.json` — Gitea entry ALREADY PRESENT
- `plugins/kaola-workflow-gitea/scripts/` — 9 workflow scripts confirmed present

## install.sh Key Lines

- Line 8: curl|bash hint (github/gitlab only)
- Line 11: local clone comment (github|gitlab only)
- Line 44: usage() function (github|gitlab)
- Line 59: --forge error message (github or gitlab)
- Lines 82-129: case "$FORGE" with github) and gitlab) branches; `*)` error catch
- Line 144: plugin list grep pattern `kaola-workflow(-gitlab)?@` (does not cover gitea)
- Lines 300-306: commands install skip-guard (only gitlab)
- Lines 464-469: script verification skip-guard (only gitlab)
- Lines 471-475: hook verification skip-guard (only gitlab)
- Line 483: final message skip-guard (only gitlab)

## Key Patterns

- GitLab branch uses `SOURCE_HOOKS_DIR="$SCRIPT_DIR/plugins/kaola-workflow-gitlab/hooks"`
- 9 script names listed for gitlab
- Same hook names (shared) for gitlab
- Skip-guards pattern: `[[ "$FORGE" = "gitlab" && ...condition... ]]`
- manifest version in .claude-plugin: should match package.json (3.10.0)
