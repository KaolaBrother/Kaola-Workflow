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
# (sync-opencode-edition.js transformCommandBody strips the canonical Path Intent section,
# keyed to its stable title; post-#538 canonical adapt is itself adaptive-only — "NEVER
# downgrade to fast/full" — so no adapt-fallback strip is needed; see docs/opencode-edition.md
# § Path selection). The install-time COMMAND-SET partition mirrors install.sh's #538 target:
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
#
# DEPLOY LAYOUT (scope-dependent — opencode resolves agents/commands/plugins differently by scope):
#   - PROJECT (--target/$PWD): agents/commands/plugins/hooks live under <project>/.opencode/{...}
#     (the project-local .opencode dir opencode scans).
#   - GLOBAL (--global): they live DIRECTLY under the config root ${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}/{...}
#     (NOT a nested .opencode/ — the config dir IS opencode's global ".opencode equivalent"; a nested
#     ~/.config/opencode/.opencode/ is never scanned). copy_tree takes a `layout_root` arg for exactly this.
#   - opencode.json always lands at the config/project root (dest_root), never under the layout subtree.
#
# REINSTALL IS SELF-HEALING (#538 adaptive-only goal): copy_tree PRUNES kaola-owned command files not in
# the EFFECTIVE opt-in set before re-copying, so a narrowed reinstall converges to adaptive-only on disk
# (it is no longer additive-only). --uninstall removes the full deployed surface; see uninstall_edition.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
TARGET=""
GLOBAL=0
REGENERATE=0
UNINSTALL=0
YES=0
NO_SCRIPTS=0
# #538/#543 install-time opt-ins (mirror install.sh). 0 = not requested this run;
# EFFECTIVE_* (computed below) unions these with any prior installed_paths.
WITH_FAST=0
WITH_FULL=0

usage() {
  cat <<'EOF'
Usage: ./install-opencode.sh [--target DIR] [--global] [--regenerate] [--uninstall]
                            [--no-scripts] [--yes] [--with-fast] [--with-full]
  --target DIR     deploy into DIR (default: current directory)
  --global         deploy agents+commands+plugin+hooks into ~/.config/opencode (all projects)
  --regenerate     refresh the in-repo .opencode/ tree from canonical, then exit
  --uninstall      remove the kaola-deployed opencode edition from the resolved scope
                   (honors --target/--global), then exit (see UNINSTALL below)
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

UNINSTALL: --uninstall removes ONLY kaola-deployed artifacts from the resolved scope
(project DEST_ROOT via --target/$PWD, or --global ${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}):
the deployed agents/commands/plugin/hooks (by source-tree filename — never a blind rm of a
dir), the opencode-native support scripts, and a surgical reset of installed_paths:[] in the
SHARED ~/.config/kaola-workflow/config.json (parallel_mode + the file are kept for any
co-installed Claude/Codex edition). Your own opencode.json (model/permission config) is
PRESERVED. A subsequent bare install then deploys the adaptive-only default.
EOF
}

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --target) TARGET="${2:?--target requires a directory}"; shift 2 ;;
    --global) GLOBAL=1; shift ;;
    --regenerate) REGENERATE=1; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
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

# Always ensure the in-repo generated tree is fresh before copying from it (install only — an
# uninstall removes by source filename and must not regenerate the repo tree).
if [[ "$UNINSTALL" -ne 1 ]]; then
  echo "Kaola-Workflow · opencode edition — refreshing generated tree..."
  node "$SCRIPT_DIR/scripts/sync-opencode-edition.js" --check >/dev/null 2>&1 \
    || node "$SCRIPT_DIR/scripts/sync-opencode-edition.js" --write >/dev/null
fi

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

# Adaptive-core command set (#538): ALWAYS deployed. fast/full are EFFECTIVE-gated opt-ins; any
# OTHER command fails CLOSED (skipped + warned) so a future canonical command cannot silently widen
# the default install. Single source of truth for the partition (used by copy_tree).
ADAPTIVE_CORE_COMMANDS=(
  kaola-workflow-adapt.md kaola-workflow-finalize.md
  kaola-workflow-plan-run.md workflow-init.md workflow-next.md
)
in_array() { local needle="$1"; shift; local x; for x in "$@"; do [[ "$x" == "$needle" ]] && return 0; done; return 1; }

copy_tree() {
  local dest_root="$1"    # holds opencode.json (config/project root)
  # layout_root: the dir that DIRECTLY holds agent/command/plugins/hooks. Project → $dest_root/.opencode;
  # Global → $dest_root (the config root itself; opencode never scans a nested .opencode/ there).
  local layout_root="${2:-$dest_root/.opencode}"
  mkdir -p "$layout_root/agent" "$layout_root/command" \
           "$layout_root/plugins" "$layout_root/hooks"
  # Deploy the hooks adapter plugin from the TRACKED template source (templates/opencode/plugins/).
  # This is NOT the self-referential .opencode/plugins/ copy — the tracked template is the canonical
  # source and is always present. A missing plugin is a LOUD install error (no 2>/dev/null || true).
  # Run BEFORE the self-dev guard because even in self-dev mode the destination
  # ($layout_root/plugins/) is distinct from the source (templates/opencode/plugins/).
  cp "$SCRIPT_DIR/templates/opencode/plugins/"*.js "$layout_root/plugins/"
  # Self-dev guard: deploying the edition into its OWN source repo means the canonical .opencode and
  # the destination layout are the same directory, so `cp` would refuse ("X and X are identical") and
  # trip `set -e`. In that case the generated tree already IS the live one — skip the (no-op) copy.
  if [[ "$SCRIPT_DIR/.opencode" -ef "$layout_root" ]]; then
    echo "Self-dev deploy (source .opencode is already the live tree) → copy skipped."
    return
  fi
  cp "$SCRIPT_DIR/.opencode/agent/"*.md "$layout_root/agent/"
  # #538/#543 D2: the COMMAND deploy is PARTITIONED + SELF-HEALING. First PRUNE every kaola-owned
  # command file from the dest (mirror install.sh:218-229 blanket-then-recopy) so a narrowed opt-in set
  # converges to adaptive-only on a bare reinstall — copy_tree was additive-only before, leaving stale
  # fast/phase orphans. Then re-copy the EFFECTIVE set via a fail-CLOSED ALLOWLIST: adaptive-core
  # ALWAYS, kaola-workflow-fast.md iff EFFECTIVE_FAST, phase1..5 iff EFFECTIVE_FULL, anything else skipped.
  # Agents/plugins/hooks are NOT partitioned (always fully deployed).
  local stale_pattern stale_file
  for stale_pattern in "kaola-workflow-*.md" "workflow-init.md" "workflow-next.md"; do
    for stale_file in "$layout_root/command/"$stale_pattern; do
      [[ -f "$stale_file" ]] || continue
      rm -f "$stale_file"
    done
  done
  local command_file base
  for command_file in "$SCRIPT_DIR/.opencode/command/"*.md; do
    [[ -f "$command_file" ]] || continue
    base="$(basename "$command_file")"
    if in_array "$base" "${ADAPTIVE_CORE_COMMANDS[@]}"; then
      :   # adaptive-core: always
    else
      case "$base" in
        kaola-workflow-fast.md)        [[ "$EFFECTIVE_FAST" -eq 1 ]] || continue ;;
        kaola-workflow-phase[1-5].md)  [[ "$EFFECTIVE_FULL" -eq 1 ]] || continue ;;
        *) echo "warning: skipping unrecognized command not in the adaptive-core/fast/full partition: $base" >&2; continue ;;
      esac
    fi
    cp "$command_file" "$layout_root/command/$base"
  done
  cp "$SCRIPT_DIR/.opencode/hooks/"*.sh "$layout_root/hooks/" 2>/dev/null || true
  chmod +x "$layout_root/hooks/"*.sh 2>/dev/null || true
  echo "Installed workflow agents+commands+plugin+hooks → $layout_root/"
}

# Remove ONLY kaola-deployed artifacts from the resolved scope, by source-tree filename (never a blind
# rm of a dir the user may share). Preserves the user-owned opencode.json; surgically resets the SHARED
# installed_paths to [] (keeps parallel_mode + the file for any co-installed Claude/Codex edition).
uninstall_edition() {
  local dest_root layout_root
  if [[ "$GLOBAL" -eq 1 ]]; then
    dest_root="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"
    layout_root="$dest_root"
  else
    dest_root="${TARGET:-$PWD}"
    layout_root="$dest_root/.opencode"
  fi
  echo "Uninstalling Kaola-Workflow · opencode edition from → $layout_root"
  if [[ "$SCRIPT_DIR/.opencode" -ef "$layout_root" ]]; then
    echo "Refusing to uninstall the edition's OWN source tree ($layout_root). No-op." >&2
    return
  fi
  local f base sub
  for f in "$SCRIPT_DIR/.opencode/agent/"*.md;               do [[ -f "$f" ]] || continue; rm -f "$layout_root/agent/$(basename "$f")"; done
  for f in "$SCRIPT_DIR/.opencode/command/"*.md;             do [[ -f "$f" ]] || continue; rm -f "$layout_root/command/$(basename "$f")"; done
  for f in "$SCRIPT_DIR/templates/opencode/plugins/"*.js;    do [[ -f "$f" ]] || continue; rm -f "$layout_root/plugins/$(basename "$f")"; done
  for f in "$SCRIPT_DIR/.opencode/hooks/"*.sh;               do [[ -f "$f" ]] || continue; rm -f "$layout_root/hooks/$(basename "$f")"; done
  for sub in command agent plugins hooks; do rmdir "$layout_root/$sub" 2>/dev/null || true; done
  [[ "$GLOBAL" -eq 1 ]] || rmdir "$layout_root" 2>/dev/null || true
  echo "Removed deployed agents/commands/plugin/hooks."
  # Support scripts (opencode-native dir; honors $OPENCODE_CONFIG_DIR).
  local scripts_dir="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}/kaola-workflow/scripts"
  local manifest="$SCRIPT_DIR/scripts/kaola-workflow-install-manifest.js"
  if [[ -f "$manifest" && -d "$scripts_dir" ]]; then
    local name
    while IFS= read -r name || [[ -n "$name" ]]; do
      [[ -n "$name" ]] || continue
      rm -f "$scripts_dir/$name"
    done < <(node "$manifest" --forge=github --scripts 2>/dev/null)
    rmdir "$scripts_dir" 2>/dev/null || true
    rmdir "${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}/kaola-workflow" 2>/dev/null || true
    echo "Removed deployed support scripts."
  fi
  if [[ -f "$dest_root/opencode.json" ]]; then
    echo "Preserved $dest_root/opencode.json (user-owned model/permission config)."
  fi
  # Surgical reset of the SHARED config (node — already a hard dependency): installed_paths:[] only.
  local shared="$HOME/.config/kaola-workflow/config.json"
  if [[ -f "$shared" ]]; then
    node -e 'const fs=require("fs"),p=process.argv[1];try{const c=JSON.parse(fs.readFileSync(p,"utf8"));if(c&&typeof c==="object"&&!Array.isArray(c)){c.installed_paths=[];fs.writeFileSync(p,JSON.stringify(c,null,2)+"\n");}}catch(e){}' "$shared" 2>/dev/null || true
    echo "Reset installed_paths:[] in $shared (adaptive-only; other editions unaffected)."
  fi
  echo "Uninstall complete. A fresh ./install-opencode.sh now deploys the adaptive-only default."
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

# #2 / #538 / #543 D4: seed ~/.config/kaola-workflow/config.json via UNION read-modify-write so an
# opencode install reaches install-time parity (parallel_mode:'auto' default-ON + installed_paths)
# with what install.sh writes. installed_paths records the EFFECTIVE opt-in set (R1 UNION with any
# prior opt-ins — never removes). This config is the SHARED global file the classifiers + claim read
# (edition-agnostic, never clobbered); it is SEPARATE from opencode.json.
# #F9: implemented in NODE (already a hard dependency above) rather than python3 — this removes the
# python3-absent failure mode entirely (which previously left opt-in files on disk while installed_paths
# went unrecorded → config/disk divergence). Fail-closed on a corrupt/non-object config: leave it
# untouched and warn, naming the deployed opt-in so any divergence is visible.
seed_kaola_config() {
  local kaola_config_dir="$HOME/.config/kaola-workflow"
  local kaola_config_file="$kaola_config_dir/config.json"
  mkdir -p "$kaola_config_dir"
  if ! KAOLA_SEED_FILE="$kaola_config_file" KAOLA_SEED_FAST="$EFFECTIVE_FAST" KAOLA_SEED_FULL="$EFFECTIVE_FULL" node -e '
    const fs = require("fs");
    const file = process.env.KAOLA_SEED_FILE;
    const withFast = process.env.KAOLA_SEED_FAST === "1";
    const withFull = process.env.KAOLA_SEED_FULL === "1";
    let config = {};
    if (fs.existsSync(file)) {
      let raw;
      try { raw = fs.readFileSync(file, "utf8"); }
      catch (e) { console.error("warning: cannot read " + file + " (" + e.message + "); leaving it untouched."); process.exit(2); }
      try { config = JSON.parse(raw); }
      catch (e) { console.error("warning: " + file + " is not valid JSON (" + e.message + "); leaving it untouched."); process.exit(2); }
      if (config === null || typeof config !== "object" || Array.isArray(config)) {
        console.error("warning: " + file + " is not a JSON object; leaving it untouched."); process.exit(2);
      }
    }
    if (config.parallel_mode === undefined) config.parallel_mode = "auto";
    const existing = Array.isArray(config.installed_paths) ? config.installed_paths : [];
    const set = new Set(existing);
    if (withFast) set.add("fast");
    if (withFull) set.add("full");
    config.installed_paths = ["fast", "full"].filter(p => set.has(p));   // canonical order, {fast,full} only
    delete config.enable_adaptive;                                       // migrate away the retired field
    fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
    console.log("Installed paths (adaptive always; opt-ins: " + JSON.stringify(config.installed_paths) + ") in: " + file);
  '; then
    echo "warning: failed to record installed_paths in $kaola_config_file." >&2
    if [[ "$EFFECTIVE_FAST" -eq 1 || "$EFFECTIVE_FULL" -eq 1 ]]; then
      echo "warning: opt-in command files WERE deployed but the opt-in could not be recorded; set installed_paths by hand (include \"fast\" and/or \"full\" as deployed)." >&2
    fi
  fi
}

# --uninstall short-circuits the install entirely (functions are defined above).
if [[ "$UNINSTALL" -eq 1 ]]; then
  uninstall_edition
  exit 0
fi

if [[ "$GLOBAL" -eq 1 ]]; then
  DEST_ROOT="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"
  echo "Deploying globally → $DEST_ROOT"
  # GLOBAL: opencode scans the config root DIRECTLY (agents/commands/plugins under ~/.config/opencode/,
  # NOT a nested .opencode/). layout_root = the config root itself.
  copy_tree "$DEST_ROOT" "$DEST_ROOT"
  seed_config "$DEST_ROOT"
  seed_kaola_config
  install_support_scripts
else
  DEST_ROOT="${TARGET:-$PWD}"
  echo "Deploying into project → $DEST_ROOT"
  # PROJECT: opencode scans <project>/.opencode/. layout_root = $DEST_ROOT/.opencode (copy_tree default).
  copy_tree "$DEST_ROOT" "$DEST_ROOT/.opencode"
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
