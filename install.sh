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
for script_file in \
  "$SOURCE_SCRIPTS_DIR"/kaola-workflow-repair-state.js \
  "$SOURCE_SCRIPTS_DIR"/kaola-workflow-claim.js \
  "$SOURCE_SCRIPTS_DIR"/kaola-workflow-sink-merge.js \
  "$SOURCE_SCRIPTS_DIR"/kaola-workflow-roadmap.js \
  "$SOURCE_SCRIPTS_DIR"/kaola-workflow-classifier.js; do
  if [[ -f "$script_file" ]]; then
    cp "$script_file" "$SUPPORT_SCRIPTS_DIR/$(basename "$script_file")"
    chmod +x "$SUPPORT_SCRIPTS_DIR/$(basename "$script_file")"
    echo "Installed support script: $SUPPORT_SCRIPTS_DIR/$(basename "$script_file")"
  fi
done

mkdir -p "$SUPPORT_HOOKS_DIR"
for hook_file in "$SOURCE_HOOKS_DIR"/kaola-workflow-pre-commit.sh; do
  if [[ -f "$hook_file" ]]; then
    cp "$hook_file" "$SUPPORT_HOOKS_DIR/$(basename "$hook_file")"
    chmod +x "$SUPPORT_HOOKS_DIR/$(basename "$hook_file")"
    echo "Installed support hook: $SUPPORT_HOOKS_DIR/$(basename "$hook_file")"
  fi
done

echo ""
echo "Open any Claude Code session and run:  /workflow-init"
echo "Then run implementation cycles with:  /workflow-next"
echo ""
echo "Note: plugin installs load hooks/hooks.json automatically in Claude Code v2.1+."
echo "Manual command install copies slash commands only; use plugin install for the compaction resume hook."
echo ""
echo "For advisor gates, ensure your ~/.claude/settings.json includes:"
echo '  "advisorModel": "opus"'
