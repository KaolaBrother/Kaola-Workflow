# Architect: issue-115

## Files to Modify

### 1. `install.sh`
- Line 8: add `--forge=gitea` to curl|bash hint
- Line 11: update local clone comment to include `gitea`
- Line 44: usage() — update to `--forge=github|gitlab|gitea`
- Line 59: error message — update to `github or gitlab or gitea`
- Lines 103-129: add `gitea)` case before `*)`:
  - SUPPORT_DIR="$HOME/.claude/kaola-workflow-gitea"
  - SOURCE_COMMANDS_DIR="$SCRIPT_DIR/plugins/kaola-workflow-gitea/commands"
  - SOURCE_SCRIPTS_DIR="$SCRIPT_DIR/plugins/kaola-workflow-gitea/scripts"
  - SOURCE_HOOKS_DIR="$SCRIPT_DIR/plugins/kaola-workflow-gitea/hooks"
  - SUPPORT_SCRIPT_NAMES: 9 entries (kaola-gitea-forge.js + 8 workflow scripts)
  - SUPPORT_HOOK_NAMES: same shared hooks (kaola-workflow-pre-commit.sh, kaola-workflow-phantom-advisor.sh)
- Line 144: extend grep pattern to `kaola-workflow(-gitlab|-gitea)?@`
- Line 300-306: add `|| "$FORGE" = "gitea"` to skip-guard for empty commands dir
- Lines 464-469: add `|| "$FORGE" = "gitea"` to script skip-guard
- Lines 471-475: add `|| "$FORGE" = "gitea"` to hook skip-guard
- Line 483: add `|| "$FORGE" = "gitea"` to final message skip-guard

### 2. `plugins/kaola-workflow-gitea/.claude-plugin/plugin.json`
- Update version from "3.8.1" to "3.10.0"

## Build Sequence
1. Update .claude-plugin/plugin.json version (trivial)
2. Add gitea) case to install.sh
3. Update usage/error/skip-guards in install.sh

## Validation
- `bash -n install.sh` (syntax check)
- `node scripts/simulate-workflow-walkthrough.js` (regression check)
