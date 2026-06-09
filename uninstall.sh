#!/usr/bin/env bash
set -euo pipefail

FORGE=""
AGENTS_DIR="${KAOLA_AGENT_DIR:-$HOME/.claude/agents}"
AGENT_MANIFEST_FILE="$AGENTS_DIR/.kaola-workflow-agent-manifest"
MANAGED_AGENT_MARKER="kaola-workflow-managed-agent: true"
REQUIRED_AGENTS=("code-explorer" "knowledge-lookup" "planner" "code-architect" "tdd-guide" "implementer" "build-error-resolver" "code-reviewer" "security-reviewer" "doc-updater" "adversarial-verifier" "contractor" "workflow-planner")

usage() {
  echo "Usage: ./uninstall.sh [--forge=github|gitlab|gitea|all]"
}

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --forge=*)
      FORGE="${1#--forge=}"
      shift
      ;;
    --forge)
      if [[ -z "${2:-}" ]]; then
        echo "--forge requires github, gitlab, gitea, or all" >&2
        usage >&2
        exit 2
      fi
      FORGE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

# Bare uninstall with no --forge removes every installed edition.
if [[ -z "$FORGE" ]]; then
  FORGE=all
fi

case "$FORGE" in
  github|gitlab|gitea|all) ;;
  *)
    echo "Unknown forge: $FORGE" >&2
    usage >&2
    exit 2
    ;;
esac

removed=0

shopt -s nullglob

for agent in "${REQUIRED_AGENTS[@]}"; do
  dest="$AGENTS_DIR/$agent.md"
  if [[ -f "$dest" ]] && grep -Fq "$MANAGED_AGENT_MARKER" "$dest"; then
    rm "$dest"
    echo "Removed managed agent: $dest"
    removed=$((removed + 1))
  fi
done

if [[ -f "$AGENT_MANIFEST_FILE" ]]; then
  managed_remaining=0
  for agent in "${REQUIRED_AGENTS[@]}"; do
    dest="$AGENTS_DIR/$agent.md"
    if [[ -f "$dest" ]] && grep -Fq "$MANAGED_AGENT_MARKER" "$dest"; then
      managed_remaining=1
      break
    fi
  done
  if [[ "$managed_remaining" -eq 0 ]]; then
    rm "$AGENT_MANIFEST_FILE"
    echo "Removed managed agent manifest: $AGENT_MANIFEST_FILE"
    removed=$((removed + 1))
  fi
fi

# Remove the agent model manifest written by install.sh for the adaptive resolver.
AGENT_MODEL_MANIFEST="$AGENTS_DIR/.kaola-agent-models.json"
if rm -f "$AGENT_MODEL_MANIFEST" 2>/dev/null; then
  echo "Removed agent model manifest: $AGENT_MODEL_MANIFEST"
fi

COMMANDS=(
  "$HOME/.claude/commands/workflow-next"*.md
  "$HOME/.claude/commands/kaola-workflow.md"
  "$HOME/.claude/commands/kaola-workflow"*.md
  "$HOME/.claude/commands/claude-workflow.md"
  "$HOME/.claude/commands/claude-workflow"*.md
  "$HOME/.claude/commands/workflow-init.md"
)

for dest in "${COMMANDS[@]}"; do
  if [[ -f "$dest" ]]; then
    rm "$dest"
    echo "Removed: $dest"
    removed=$((removed + 1))
  fi
done

remove_dir() {
  local dir="$1"
  if [[ -d "$dir" ]]; then
    rm -rf "$dir"
    echo "Removed: $dir"
    removed=$((removed + 1))
  fi
}

if [[ "$FORGE" = "github" || "$FORGE" = "all" ]]; then
  remove_dir "$HOME/.claude/kaola-workflow"
  remove_dir "$HOME/.claude/claude-workflow"
fi

if [[ "$FORGE" = "gitlab" || "$FORGE" = "all" ]]; then
  remove_dir "$HOME/.claude/kaola-workflow-gitlab"
fi

if [[ "$FORGE" = "gitea" || "$FORGE" = "all" ]]; then
  remove_dir "$HOME/.claude/kaola-workflow-gitea"
fi

# Strip Kaola-Workflow-managed hook entries and the legacy managed subagent
# status line entry from
# ~/.claude/settings.json. Uses the same identification rules as install.sh
# (id prefix "kaola-workflow:" or command path containing "kaola-workflow") so
# we only touch entries we own.
SETTINGS_FILE="$HOME/.claude/settings.json"
if [[ -f "$SETTINGS_FILE" ]] && command -v python3 >/dev/null 2>&1; then
  SETTINGS_BACKUP_DIR="$HOME/.claude/backups"
  if python3 - "$SETTINGS_FILE" "$SETTINGS_BACKUP_DIR" <<'PY'; then
import json, os, sys, time
settings_path, backup_dir = sys.argv[1], sys.argv[2]

try:
    with open(settings_path) as f:
        settings = json.load(f)
except json.JSONDecodeError:
    print(f"warning: {settings_path} is not valid JSON; leaving hooks in place.", file=sys.stderr)
    sys.exit(0)

def is_managed(entry):
    if not isinstance(entry, dict):
        return False
    eid = entry.get("id", "")
    if isinstance(eid, str) and eid.startswith("kaola-workflow:"):
        return True
    for inner in entry.get("hooks", []) or []:
        if isinstance(inner, dict):
            cmd = inner.get("command", "")
            if isinstance(cmd, str) and "kaola-workflow" in cmd:
                return True
    return False

def is_managed_subagent_statusline(entry):
    if not isinstance(entry, dict):
        return False
    cmd = entry.get("command", "")
    return isinstance(cmd, str) and "kaola-workflow-subagent-statusline.js" in cmd

changed = False
hooks = settings.get("hooks")
if isinstance(hooks, dict):
    for event, entries in list(hooks.items()):
        if not isinstance(entries, list):
            continue
        cleaned = [e for e in entries if not is_managed(e)]
        if len(cleaned) != len(entries):
            changed = True
            if cleaned:
                hooks[event] = cleaned
            else:
                del hooks[event]

    if not hooks:
        settings.pop("hooks", None)

if is_managed_subagent_statusline(settings.get("subagentStatusLine")):
    settings.pop("subagentStatusLine", None)
    changed = True

if changed:
    os.makedirs(backup_dir, exist_ok=True)
    ts = time.strftime("%Y%m%d-%H%M%S")
    backup_path = os.path.join(backup_dir, f"settings.json.kaola-workflow.{ts}.bak")
    with open(settings_path, "rb") as src, open(backup_path, "wb") as dst:
        dst.write(src.read())
    with open(settings_path, "w") as f:
        json.dump(settings, f, indent=2)
        f.write("\n")
    print(f"Removed Kaola-Workflow settings entries from {settings_path}")
    print(f"Backup: {backup_path}", file=sys.stderr)
PY
    :
  fi
fi

if [[ "$removed" -eq 0 ]]; then
  echo "Not installed — nothing to remove."
fi
