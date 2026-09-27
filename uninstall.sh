#!/usr/bin/env bash
set -euo pipefail

FORGE=""
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# Where earlier releases installed subagent profiles, and their ownership record (#1101).
AGENTS_DIR="${KAOLA_AGENT_DIR:-$HOME/.claude/agents}"
AGENT_MANIFEST_FILE="$AGENTS_DIR/.kaola-workflow-agent-manifest"

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

# Retire the subagent profiles earlier releases installed, with the same proof install.sh uses
# (#1101): a file the manifest records, still carrying the managed marker and still hashing to the
# recorded digest, is removed; an edited or unrecorded Kaola-named file is preserved and reported;
# the manifest is retired once read. Never through a symlinked or non-directory carrier.
if command -v node >/dev/null 2>&1 && [[ -f "$SCRIPT_DIR/scripts/kaola-workflow-retired-agents.js" ]]; then
  if agent_out="$(node "$SCRIPT_DIR/scripts/kaola-workflow-retired-agents.js" retire --runtime claude \
      --dir "$AGENTS_DIR" --record "$AGENT_MANIFEST_FILE" 2>&1)"; then
    if [[ -n "$agent_out" ]]; then
      printf "%s\n" "$agent_out"
      removed=$((removed + $(printf "%s\n" "$agent_out" | grep -c "^Removed retired" || true)))
    fi
  else
    printf "%s\n" "$agent_out" >&2
    echo "warning: retired Claude agent sweep failed; $AGENTS_DIR left in place." >&2
  fi
else
  echo "warning: node unavailable; retired Claude agents in $AGENTS_DIR left in place." >&2
fi

# The agent model manifest older installs wrote for the retired resolver path.
AGENT_MODEL_MANIFEST="$AGENTS_DIR/.kaola-agent-models.json"
if [[ -d "$AGENTS_DIR" && ! -L "$AGENTS_DIR" && -f "$AGENT_MODEL_MANIFEST" && ! -L "$AGENT_MODEL_MANIFEST" ]]; then
  rm -f "$AGENT_MODEL_MANIFEST"
  echo "Removed agent model manifest: $AGENT_MODEL_MANIFEST"
  removed=$((removed + 1))
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

# Strip Kaola-Workflow-managed hook entries and the managed subagent
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

# #1087 (#1086 F1/F2): this uninstaller owns only what install.sh wrote under ~/.claude. Codex's
# global hooks, hook home and profiles belong to `install-codex-agent-profiles.js --uninstall`.
# The runtime-neutral ~/.config/kaola-workflow/config.json is a shared block: once no Claude
# edition remains, release the claude reference; the registry removes the block only when that
# was the last reference any runtime held.
SHARED_REFS="$SCRIPT_DIR/scripts/kaola-workflow-shared-refs.js"
claude_editions_left=0
for edition in kaola-workflow kaola-workflow-gitlab kaola-workflow-gitea; do
  if [[ -d "$HOME/.claude/$edition" ]]; then claude_editions_left=1; fi
done
if [[ "$claude_editions_left" -eq 0 ]]; then
  if [[ -f "$SHARED_REFS" ]] && command -v node >/dev/null 2>&1; then
    # #1087 (#1086 F3): strip Claude's OWN global-contract carrier through its own per-target
    # record first; a carrier the owner edited since install is refused and left in place.
    carrier_rc=0
    carrier_out="$(node "$SCRIPT_DIR/scripts/kaola-workflow-global-contract.js" uninstall --runtime claude --json 2>&1)" || carrier_rc=$?
    if [[ "$carrier_rc" -eq 0 ]]; then
      echo "Claude global contract carrier: $(node -e 'try { console.log(JSON.parse(process.argv[1]).status || "UNKNOWN"); } catch (_) { console.log("UNKNOWN"); }' "$carrier_out")"
    else
      echo "warning: Claude global contract carrier left in place (exit $carrier_rc)" >&2
      printf '%s\n' "$carrier_out" >&2
    fi
    if deregistered="$(node "$SHARED_REFS" deregister --runtime claude)"; then
      echo "Released shared config reference (claude): $deregistered"
    else
      echo "warning: shared config reference not released ($deregistered); ~/.config/kaola-workflow left in place." >&2
    fi
  else
    echo "warning: node or $SHARED_REFS unavailable; shared config reference not released." >&2
  fi
fi

if [[ "$removed" -eq 0 ]]; then
  echo "Not installed — nothing to remove."
fi
