#!/usr/bin/env bash
# install-opencode.sh — deploy the Kaola-Workflow opencode edition into a project.
#
# Additive standalone installer (does NOT modify install.sh or the
# claude/codex/gitlab/gitea editions). opencode is a runtime (like Codex), not a
# git forge, so it is delivered the opencode-native way: opencode.json + .opencode/.
#
# Usage:
#   ./install-opencode.sh                         # deploy into the current directory
#   ./install-opencode.sh --target /path/to/repo  # deploy into a specific project
#   ./install-opencode.sh --global                # deploy agents+commands to ~/.config/opencode
#   ./install-opencode.sh --regenerate            # refresh .opencode/ from canonical here
#
# Models: the default install seeds opencode.json with the two Kaola tiers as
# reasoning-EFFORT VARIANTS of your inherited model (no model is pinned — both tiers
# inherit the model you are already using in opencode): the reasoning tier gets the
# model's TOP effort variant, the standard tier its SECOND (e.g. max/high on GLM-5.2).
# This installer seeds it only if absent, so re-running never clobbers your choices.
# Override the inherited model via KAOLA_OPENCODE_INHERIT_MODEL, or pin a tier to a
# different model via KAOLA_OPENCODE_STANDARD_MODEL / _REASONING_MODEL.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
TARGET=""
GLOBAL=0
REGENERATE=0
YES=0
NO_SCRIPTS=0

usage() {
  cat <<'EOF'
Usage: ./install-opencode.sh [--target DIR] [--global] [--regenerate] [--no-scripts] [--yes]
  --target DIR     deploy into DIR (default: current directory)
  --global         deploy agents+commands+plugin+hooks into ~/.config/opencode (all projects)
  --regenerate     refresh the in-repo .opencode/ tree from canonical, then exit
  --no-scripts     skip installing support scripts (see SUPPORT SCRIPTS below)
  --yes            non-interactive (accept the default deploy path)

SUPPORT SCRIPTS: workflow commands locate scripts via kaola_script(), which
searches ./scripts/, $CLAUDE_PLUGIN_ROOT/scripts/, and ~/.claude/kaola-workflow/
scripts/. For a CONSUMER project (not this repo) the installer copies the support
scripts to ~/.claude/kaola-workflow/scripts/ so the commands resolve. Self-dev in
this repo needs none of that (./scripts/ is used directly).
EOF
}

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --target) TARGET="${2:?--target requires a directory}"; shift 2 ;;
    --global) GLOBAL=1; shift ;;
    --regenerate) REGENERATE=1; shift ;;
    --no-scripts) NO_SCRIPTS=1; shift ;;
    -y|--yes) YES=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

# Always ensure the in-repo generated tree is fresh before copying from it.
echo "Kaola-Workflow · opencode edition — refreshing generated tree..."
node "$SCRIPT_DIR/scripts/sync-opencode-edition.js" --check >/dev/null 2>&1 \
  || node "$SCRIPT_DIR/scripts/sync-opencode-edition.js" --write >/dev/null

if [[ "$REGENERATE" -eq 1 ]]; then
  echo "Regenerated .opencode/ from canonical. Done."
  exit 0
fi

copy_tree() {
  local dest_root="$1"   # directory that will hold .opencode/ and opencode.json
  mkdir -p "$dest_root/.opencode/agent" "$dest_root/.opencode/command" \
           "$dest_root/.opencode/plugins" "$dest_root/.opencode/hooks"
  # Self-dev guard: deploying the edition into its OWN source repo means the
  # canonical .opencode and the destination .opencode are the same directory, so
  # `cp` would refuse ("X and X are identical") and trip `set -e`. In that case
  # the generated tree already IS the live one — skip the (no-op) copy.
  if [[ "$SCRIPT_DIR/.opencode" -ef "$dest_root/.opencode" ]]; then
    echo "Self-dev deploy (source .opencode is already the live tree) → copy skipped."
    return
  fi
  cp "$SCRIPT_DIR/.opencode/agent/"*.md "$dest_root/.opencode/agent/"
  cp "$SCRIPT_DIR/.opencode/command/"*.md "$dest_root/.opencode/command/"
  cp "$SCRIPT_DIR/.opencode/plugins/"*.js "$dest_root/.opencode/plugins/" 2>/dev/null || true
  cp "$SCRIPT_DIR/.opencode/hooks/"*.sh "$dest_root/.opencode/hooks/" 2>/dev/null || true
  chmod +x "$dest_root/.opencode/hooks/"*.sh 2>/dev/null || true
  echo "Installed workflow agents+commands+plugin+hooks → $dest_root/.opencode/"
}

# Install the support scripts the workflow commands invoke (kaola_script() search
# path includes ~/.claude/kaola-workflow/scripts/). Reuses the single-source
# install manifest; only meaningful for consumer projects.
install_support_scripts() {
  if [[ "$NO_SCRIPTS" -eq 1 ]]; then
    echo "Support scripts skipped (--no-scripts)."
    return
  fi
  local manifest="$SCRIPT_DIR/scripts/kaola-workflow-install-manifest.js"
  [[ -f "$manifest" ]] || { echo "warning: install manifest not found; skipping support scripts." >&2; return; }
  local dest="$HOME/.claude/kaola-workflow/scripts"
  mkdir -p "$dest"
  local name
  while IFS= read -r name || [[ -n "$name" ]]; do
    [[ -n "$name" ]] || continue
    if [[ -f "$SCRIPT_DIR/scripts/$name" ]]; then
      cp "$SCRIPT_DIR/scripts/$name" "$dest/$name"
      chmod +x "$dest/$name"
    fi
  done < <(node "$manifest" --forge=github --scripts 2>/dev/null)
  echo "Installed support scripts → $dest (kaola_script() search path)"
}

seed_config() {
  local dest_root="$1"
  local cfg="$dest_root/opencode.json"
  if [[ -f "$cfg" ]]; then
    echo "Preserved existing $cfg (your model choices are kept)."
    return
  fi
  # Generate via the sync renderer. With --adapt it emits the two-tier EFFORT-VARIANT
  # config for your inherited model (KAOLA_OPENCODE_INHERIT_MODEL env, else the global
  # opencode.json "model"): reasoning tier → the model's top effort variant, standard
  # tier → its second variant (e.g. max/high on GLM-5.2). If no model is detected it
  # degrades to the neutral template (both tiers inherit your opencode default).
  node "$SCRIPT_DIR/scripts/sync-opencode-edition.js" --write-config-to "$cfg" --adapt
  echo "Seeded $cfg — effort tiers adapted to your inherited model (neutral if undetected)."
  echo "  Override the inherited model via KAOLA_OPENCODE_INHERIT_MODEL, or pin a tier via"
  echo "  KAOLA_OPENCODE_STANDARD_MODEL / _REASONING_MODEL env."
}

if [[ "$GLOBAL" -eq 1 ]]; then
  DEST_ROOT="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"
  echo "Deploying globally → $DEST_ROOT"
  copy_tree "$DEST_ROOT"
  seed_config "$DEST_ROOT"
  install_support_scripts
else
  DEST_ROOT="${TARGET:-$PWD}"
  echo "Deploying into project → $DEST_ROOT"
  copy_tree "$DEST_ROOT"
  seed_config "$DEST_ROOT"
  install_support_scripts
fi

echo ""
echo "Next: open the project in opencode and run a workflow command, e.g.:"
echo "  /workflow-init"
echo "Models resolve from opencode.json; both tiers inherit your opencode default unless you pin them."
