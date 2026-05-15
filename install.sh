#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
COMMANDS_DIR="$HOME/.claude/commands"
SUPPORT_DIR="$HOME/.claude/kaola-workflow"
SUPPORT_SCRIPTS_DIR="$SUPPORT_DIR/scripts"
SOURCE_COMMANDS_DIR="$SCRIPT_DIR/commands"
SOURCE_SCRIPTS_DIR="$SCRIPT_DIR/scripts"
SUPPORT_HOOKS_DIR="$SUPPORT_DIR/hooks"
SOURCE_HOOKS_DIR="$SCRIPT_DIR/hooks"
SUPPORT_SCRIPT_NAMES=(
  kaola-workflow-repair-state.js
  kaola-workflow-claim.js
  kaola-workflow-session-env.js
  kaola-workflow-sink-merge.js
  kaola-workflow-sink-pr.js
  kaola-workflow-roadmap.js
  kaola-workflow-classifier.js
)
SUPPORT_HOOK_NAMES=(
  kaola-workflow-pre-commit.sh
)
YES=0

for arg in "$@"; do
  case "$arg" in
    -y|--yes)
      YES=1
      ;;
    -h|--help)
      echo "Usage: ./install.sh [--yes]"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: ./install.sh [--yes]" >&2
      exit 2
      ;;
  esac
done

echo "Kaola-Workflow — installer"
echo ""

# Check ECC is installed
ECC_AGENTS_DIR="$HOME/.claude/agents"
REQUIRED_AGENTS=("code-explorer" "docs-lookup" "planner" "code-architect" "tdd-guide" "build-error-resolver" "code-reviewer" "security-reviewer" "doc-updater")
MISSING=()
FILE_MISSING=()
AGENTS_LIST=""

for agent in "${REQUIRED_AGENTS[@]}"; do
  if [[ -f "$ECC_AGENTS_DIR/$agent.md" ]]; then
    continue
  fi

  FILE_MISSING+=("$agent")
done

if [[ ${#FILE_MISSING[@]} -gt 0 ]]; then
  if command -v claude >/dev/null 2>&1; then
    AGENTS_LIST="$(claude agents 2>/dev/null || true)"
  fi

  for agent in "${FILE_MISSING[@]}"; do
    if [[ "$AGENTS_LIST" == *" $agent "* || "$AGENTS_LIST" == *" $agent ·"* || "$AGENTS_LIST" == *"everything-claude-code:$agent"* ]]; then
      continue
    fi

    if [[ "$AGENTS_LIST" == *"$agent ·"* ]]; then
      continue
    fi

    if [[ "$AGENTS_LIST" != *"$agent"* ]]; then
      MISSING+=("$agent")
    fi
  done
fi

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "WARNING: The following ECC agents were not found in $ECC_AGENTS_DIR:"
  for m in "${MISSING[@]}"; do
    echo "  - $m"
  done
  echo ""
  echo "This workflow requires Everything Claude Code (ECC) agents."
  echo "Recommended install inside Claude Code:"
  echo "  /plugin marketplace add https://github.com/affaan-m/everything-claude-code"
  echo "  /plugin install everything-claude-code@everything-claude-code"
  echo ""
  if [[ "$YES" -ne 1 ]]; then
    read -r -p "Continue installation anyway? [y/N] " confirm
    [[ "$confirm" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }
  fi
  echo ""
fi

# Install commands
if [[ ! -d "$SOURCE_COMMANDS_DIR" ]]; then
  echo "Commands directory not found: $SOURCE_COMMANDS_DIR" >&2
  exit 1
fi

mkdir -p "$COMMANDS_DIR"

installed=0
for command_file in "$SOURCE_COMMANDS_DIR"/*.md; do
  if [[ ! -f "$command_file" ]]; then
    continue
  fi

  dest="$COMMANDS_DIR/$(basename "$command_file")"
  cp "$command_file" "$dest"
  echo "Installed: $dest"
  installed=$((installed + 1))
done

if [[ "$installed" -eq 0 ]]; then
  echo "No command files found in: $SOURCE_COMMANDS_DIR" >&2
  exit 1
fi

mkdir -p "$SUPPORT_SCRIPTS_DIR"
for script_name in "${SUPPORT_SCRIPT_NAMES[@]}"; do
  script_file="$SOURCE_SCRIPTS_DIR/$script_name"
  if [[ -f "$script_file" ]]; then
    cp "$script_file" "$SUPPORT_SCRIPTS_DIR/$script_name"
    chmod +x "$SUPPORT_SCRIPTS_DIR/$script_name"
    echo "Installed support script: $SUPPORT_SCRIPTS_DIR/$script_name"
  fi
done

mkdir -p "$SUPPORT_HOOKS_DIR"
for hook_name in "${SUPPORT_HOOK_NAMES[@]}"; do
  hook_file="$SOURCE_HOOKS_DIR/$hook_name"
  if [[ -f "$hook_file" ]]; then
    cp "$hook_file" "$SUPPORT_HOOKS_DIR/$hook_name"
    chmod +x "$SUPPORT_HOOKS_DIR/$hook_name"
    echo "Installed support hook: $SUPPORT_HOOKS_DIR/$hook_name"
  fi
done

verify_installed_file() {
  local path="$1"
  local label="$2"
  if [[ ! -f "$path" ]]; then
    echo "Install verification failed: missing $label: $path" >&2
    return 1
  fi
}

verify_executable_file() {
  local path="$1"
  local label="$2"
  verify_installed_file "$path" "$label" || return 1
  if [[ ! -x "$path" ]]; then
    echo "Install verification failed: not executable $label: $path" >&2
    return 1
  fi
}

verification_failed=0
for command_file in "$SOURCE_COMMANDS_DIR"/*.md; do
  [[ -f "$command_file" ]] || continue
  verify_installed_file "$COMMANDS_DIR/$(basename "$command_file")" "command" || verification_failed=1
done

for script_name in "${SUPPORT_SCRIPT_NAMES[@]}"; do
  verify_executable_file "$SUPPORT_SCRIPTS_DIR/$script_name" "support script" || verification_failed=1
done

for hook_name in "${SUPPORT_HOOK_NAMES[@]}"; do
  verify_executable_file "$SUPPORT_HOOKS_DIR/$hook_name" "support hook" || verification_failed=1
done

if [[ "$verification_failed" -ne 0 ]]; then
  exit 1
fi

echo "Verified Kaola-Workflow install files."

echo ""
echo "Open any Claude Code session and run:  /workflow-init"
echo "Then run implementation cycles with:  /workflow-next"
echo ""
echo "Note: plugin installs load hooks/hooks.json automatically in Claude Code v2.1+."
echo "Manual command install copies slash commands only; use plugin install for the compaction resume hook."
echo ""
echo "For advisor gates, ensure your ~/.claude/settings.json includes:"
echo '  "advisorModel": "opus"'
