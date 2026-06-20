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
#
# PATH SELECTION (issues #538 / #543): opencode is adaptive-only-default at the ROUTER level
# — the generated .opencode/command/* flip adaptive to the unconditional default
# (sync-opencode-edition.js transformCommandBody strips the canonical "## Startup
# Step 0a-1 — Path Intent" section + the adapt "downgrade to full path" fallback at
# generation time; see docs/opencode-edition.md § Path selection). The install-time
# COMMAND-SET partition mirrors install.sh's #538 target:
#   - DEFAULT install deploys the ADAPTIVE-CORE command set only (6 files: adapt, auto,
#     finalize, plan-run, workflow-init, workflow-next). No fast, no phase1-5.
#   - --with-fast  adds kaola-workflow-fast.md.
#   - --with-full  adds kaola-workflow-phase1..5.md.
# The opt-in is recorded in the SHARED ~/.config/kaola-workflow/config.json installed_paths
# (the same file install.sh reads). Re-install is a UNION (never removes a prior opt-in):
# a bare re-install into the same dest/HOME preserves a previously-installed fast/full.
# #538 R1 mirrors install.sh:215-216 (EFFECTIVE_FAST/EFFECTIVE_FULL). --enable-adaptive is
# retired (#538) and accepted-but-ignored (adaptive is always installed).
#
# #544 (folded into #543): the generated commands + agents resolve support scripts via an
# OPENCODE-NATIVE path (${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}/kaola-workflow/scripts)
# — there is NO $CLAUDE_PLUGIN_ROOT and NO ~/.claude/kaola-workflow in the deployed tree.
# install_support_scripts deploys to that opencode-native dir (not ~/.claude/).

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
TARGET=""
GLOBAL=0
REGENERATE=0
YES=0
NO_SCRIPTS=0
# #538/#543 install-time opt-ins (mirror install.sh). 0 = not requested this run;
# EFFECTIVE_* (computed below) unions these with any prior installed_paths.
WITH_FAST=0
WITH_FULL=0

usage() {
  cat <<'EOF'
Usage: ./install-opencode.sh [--target DIR] [--global] [--regenerate] [--no-scripts] [--yes]
                            [--with-fast] [--with-full]
  --target DIR     deploy into DIR (default: current directory)
  --global         deploy agents+commands+plugin+hooks into ~/.config/opencode (all projects)
  --regenerate     refresh the in-repo .opencode/ tree from canonical, then exit
  --no-scripts     skip installing support scripts (see SUPPORT SCRIPTS below)
  --yes            non-interactive (accept the default deploy path)
  --with-fast      also deploy kaola-workflow-fast.md (recorded in installed_paths)
  --with-full      also deploy kaola-workflow-phase1..5.md (recorded in installed_paths)

PATH SELECTION: the default install deploys the ADAPTIVE-CORE commands only (adapt,
auto, finalize, plan-run, workflow-init, workflow-next). --with-fast / --with-full add
the fast / full-phase commands. Re-install is a UNION: a prior opt-in is never removed
(--with-fast once, then bare re-install, preserves the fast command + installed_paths).
The opt-in is recorded in the SHARED ~/.config/kaola-workflow/config.json (the same file
install.sh reads). --enable-adaptive is retired (#538) and accepted-but-ignored.

SUPPORT SCRIPTS: workflow commands locate scripts via kaola_script(), which searches
./scripts/ and ${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}/kaola-workflow/scripts/
(opencode-native, honoring $OPENCODE_CONFIG_DIR). For a CONSUMER project (not this repo)
the installer copies the support scripts there so the commands resolve. Self-dev in this
repo needs none of that (./scripts/ is used directly).
EOF
}

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --target) TARGET="${2:?--target requires a directory}"; shift 2 ;;
    --global) GLOBAL=1; shift ;;
    --regenerate) REGENERATE=1; shift ;;
    --no-scripts) NO_SCRIPTS=1; shift ;;
    --with-fast) WITH_FAST=1; shift ;;
    --with-full) WITH_FULL=1; shift ;;
    --enable-adaptive|--enable-adaptive=*)
      echo "warning: --enable-adaptive is retired (#538); adaptive is the unconditional default and is always installed. Ignoring." >&2
      shift ;;
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

# #538 R1 (mirror install.sh:214-216): compute the EFFECTIVE opt-in set ONCE, up front.
# EFFECTIVE_* = path already in installed_paths OR explicitly requested this run. This makes a
# bare re-install preserve + refresh a previously-installed path's files (UNION never removes).
# Reads the SHARED ~/.config/kaola-workflow/config.json (the same file install.sh writes), so an
# opencode install and a Claude/Codex install reach identical opt-in parity on that machine.
EXISTING_PATHS="$(node -e 'try{const c=require(process.env.HOME+"/.config/kaola-workflow/config.json");const p=Array.isArray(c.installed_paths)?c.installed_paths:[];process.stdout.write(p.join(" "))}catch(e){}' 2>/dev/null || true)"
case " $EXISTING_PATHS " in *" fast "*) EFFECTIVE_FAST=1 ;; *) EFFECTIVE_FAST=$WITH_FAST ;; esac
case " $EXISTING_PATHS " in *" full "*) EFFECTIVE_FULL=1 ;; *) EFFECTIVE_FULL=$WITH_FULL ;; esac

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
  cp "$SCRIPT_DIR/.opencode/plugins/"*.js "$dest_root/.opencode/plugins/" 2>/dev/null || true
  # #538/#543 D2 (mirror install.sh:518-524): the COMMAND deploy is PARTITIONED. Adaptive-core
  # commands ALWAYS copy; kaola-workflow-fast.md copies iff EFFECTIVE_FAST; the phase1..5 commands
  # copy iff EFFECTIVE_FULL. Agents/plugins/hooks are NOT partitioned (always fully deployed).
  local command_file
  for command_file in "$SCRIPT_DIR/.opencode/command/"*.md; do
    [[ -f "$command_file" ]] || continue
    case "$(basename "$command_file")" in
      kaola-workflow-fast.md)
        [[ "$EFFECTIVE_FAST" -eq 1 ]] || continue ;;
      kaola-workflow-phase[1-5].md)
        [[ "$EFFECTIVE_FULL" -eq 1 ]] || continue ;;
    esac
    cp "$command_file" "$dest_root/.opencode/command/$(basename "$command_file")"
  done
  cp "$SCRIPT_DIR/.opencode/hooks/"*.sh "$dest_root/.opencode/hooks/" 2>/dev/null || true
  chmod +x "$dest_root/.opencode/hooks/"*.sh 2>/dev/null || true
  echo "Installed workflow agents+commands+plugin+hooks → $dest_root/.opencode/"
}

# Install the support scripts the workflow commands invoke (kaola_script() search path includes
# ${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}/kaola-workflow/scripts/ — opencode-native, #544).
# Reuses the single-source install manifest; only meaningful for consumer projects.
install_support_scripts() {
  if [[ "$NO_SCRIPTS" -eq 1 ]]; then
    echo "Support scripts skipped (--no-scripts)."
    return
  fi
  local manifest="$SCRIPT_DIR/scripts/kaola-workflow-install-manifest.js"
  [[ -f "$manifest" ]] || { echo "warning: install manifest not found; skipping support scripts." >&2; return; }
  local dest="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}/kaola-workflow/scripts"
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
  # opencode.json "model"): reasoning tier → the contract's TOP variant, standard tier
  # → its SECOND variant. The effort KNOB is CONTRACT-KEYED (mapTier + CONTRACT_EFFORT_TABLE
  # + contractForProvider in kaola-workflow-adaptive-schema.js): GLM-5.2/z.ai → Anthropic
  # contract (thinking budget), OpenAI → reasoningEffort, Google → reasoningEffort. An
  # UNRECOGNIZED provider gets the safe default contract (reasoningEffort high/medium — a
  # real top/second split, no de-tier). A falsy/absent model still renders the neutral
  # template (both tiers inherit your opencode default).
  node "$SCRIPT_DIR/scripts/sync-opencode-edition.js" --write-config-to "$cfg" --adapt
  echo "Seeded $cfg — effort tiers adapted to your inherited model (contract-keyed)."
  echo "  GLM-5.2/z.ai → Anthropic contract (thinking budget); OpenAI → reasoningEffort;"
  echo "  Google → reasoningEffort; unknown → safe default (no de-tier)."
  echo "  ⚠ Switched your opencode model? Re-run with KAOLA_OPENCODE_INHERIT_MODEL=<provider>/<model>"
  echo "  to regenerate the variant definitions (the dispatch path re-resolves regardless)."
  echo "  Override the inherited model via KAOLA_OPENCODE_INHERIT_MODEL, or pin a tier via"
  echo "  KAOLA_OPENCODE_STANDARD_MODEL / _REASONING_MODEL env."
}

# #2 / #538 / #543 D4: seed ~/.config/kaola-workflow/config.json via UNION read-modify-write — the
# install.sh:712 mirror (byte-identical semantics), so an opencode install reaches install-time
# parity (parallel_mode:'auto' default-ON + installed_paths). installed_paths records the EFFECTIVE
# opt-in set (R1 UNION with any prior opt-ins — never removes). python3-guarded with the same
# fallback warning. This config is the SHARED global file the classifiers + claim read (the SAME
# file install.sh writes — edition-agnostic, never clobbered); it is SEPARATE from opencode.json.
seed_kaola_config() {
  local kaola_config_dir="$HOME/.config/kaola-workflow"
  local kaola_config_file="$kaola_config_dir/config.json"
  if command -v python3 >/dev/null 2>&1; then
    mkdir -p "$kaola_config_dir"
    if python3 - "$kaola_config_file" "$EFFECTIVE_FAST" "$EFFECTIVE_FULL" <<'PY'; then
import json, os, sys
path = sys.argv[1]
with_fast = sys.argv[2] == '1'
with_full = sys.argv[3] == '1'
config = {}
if os.path.exists(path):
    try:
        with open(path) as f: config = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        print(f"warning: {path} is not valid JSON ({e}); leaving it untouched.", file=sys.stderr); sys.exit(2)
    if not isinstance(config, dict):
        print(f"warning: {path} is not a JSON object; leaving it untouched.", file=sys.stderr); sys.exit(2)
config.setdefault("parallel_mode", "auto")
existing = config.get("installed_paths")
paths = set(existing) if isinstance(existing, list) else set()
if with_fast: paths.add("fast")
if with_full: paths.add("full")
config["installed_paths"] = [p for p in ("fast", "full") if p in paths]   # canonical order, {fast,full} only
config.pop("enable_adaptive", None)   # migrate away the retired field on any touched config
with open(path, "w") as f: json.dump(config, f, indent=2); f.write("\n")
print(f"Installed paths (adaptive always; opt-ins: {config['installed_paths']}) in: {path}")
PY
      :
    else
      echo "warning: failed to write $kaola_config_file; set installed_paths by hand: {\"parallel_mode\":\"auto\",\"installed_paths\":[]}" >&2
    fi
  else
    echo "warning: python3 not found; cannot write $kaola_config_file. Add installed_paths:[] by hand." >&2
  fi
}

if [[ "$GLOBAL" -eq 1 ]]; then
  DEST_ROOT="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"
  echo "Deploying globally → $DEST_ROOT"
  copy_tree "$DEST_ROOT"
  seed_config "$DEST_ROOT"
  seed_kaola_config
  install_support_scripts
else
  DEST_ROOT="${TARGET:-$PWD}"
  echo "Deploying into project → $DEST_ROOT"
  copy_tree "$DEST_ROOT"
  seed_config "$DEST_ROOT"
  seed_kaola_config
  install_support_scripts
fi

echo ""
echo "Next: open the project in opencode and run a workflow command, e.g.:"
echo "  /workflow-init"
echo "Models resolve from opencode.json; both tiers inherit your opencode default unless you pin them."
# #2 / D-542-01: planner-proven-disjoint parallel write frontiers are default-ON (no operator
# toggle). Per-leg worktree isolation + the mandatory synthesizer reconcile are the correctness net.
echo "Disjoint parallel writes are default-ON (set KAOLA_PARALLEL_WRITES=0 to force serial)."
