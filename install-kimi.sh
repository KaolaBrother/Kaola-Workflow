#!/usr/bin/env bash
# install-kimi.sh — deploy the Kaola-Workflow kimi edition into a project (or globally).
#
# Additive standalone installer (does NOT modify install.sh, install-opencode.sh, or the
# claude/codex/gitlab/gitea/opencode editions). Kimi Code is a runtime (like opencode), not
# a git forge, so it is delivered the kimi-native way: SKILL.md skills under a skills/ dir +
# a managed [[hooks]] block in the kimi config.toml.
#
# Usage:
#   ./install-kimi.sh                         # deploy into the current directory
#   ./install-kimi.sh --target /path/to/repo  # deploy into a specific project
#   ./install-kimi.sh --global                # deploy skills to ${KIMI_CODE_HOME:-~/.kimi-code}/skills
#   ./install-kimi.sh --regenerate            # refresh .kimi/ from canonical here
#
# PATH SELECTION mirrors install-opencode.sh (issues #538/#543): the install-time
# COMMAND-skill partition is identical —
#   - DEFAULT install deploys the ADAPTIVE-CORE command skills only (5: kaola-workflow-adapt,
#     kaola-workflow-finalize, kaola-workflow-plan-run, workflow-init, workflow-next).
#     No fast, no phase1-5.
#   - --with-fast  adds kaola-workflow-fast.
#   - --with-full  adds kaola-workflow-phase1..5.
#   - all 16 kaola-role-* skills are ALWAYS installed.
# The opt-in is recorded in the SHARED ~/.config/kaola-workflow/config.json installed_paths
# (the same file install.sh / install-opencode.sh read). Re-install is a UNION (never removes
# a prior opt-in): a bare re-install into the same dest/HOME preserves a previously-installed
# fast/full. --enable-adaptive is retired (#538) and accepted-but-ignored.
#
# DEPLOY LAYOUT (scope-dependent):
#   - PROJECT (--target/$PWD): skills land under <project>/.kimi-code/skills/<name>/SKILL.md.
#   - GLOBAL (--global): skills land DIRECTLY under ${KIMI_CODE_HOME:-$HOME/.kimi-code}/skills/.
#   - Support scripts + hook scripts ALWAYS land under the kimi home (user-level, shared by
#     every project): ${KIMI_CODE_HOME:-$HOME/.kimi-code}/kaola-workflow/{scripts,hooks}.
#   - The hooks fragment (.kimi/hooks/kimi-hooks.toml, __KIMI_HOME__ substituted with the
#     resolved kimi home) is merged into ${KIMI_CODE_HOME:-$HOME/.kimi-code}/config.toml as a
#     MANAGED block between the "# >>> kaola-workflow kimi hooks" /
#     "# <<< kaola-workflow kimi hooks" markers. Re-install strips + re-appends the block:
#     idempotent, exactly one managed block. Post-merge the config is validated with
#     `kimi doctor config` when a kimi binary is on PATH; a validation failure restores the
#     pre-merge config and aborts non-zero. The hooks config is global regardless of install
#     scope — it is merged on every install unless --no-scripts.
#
# REINSTALL IS SELF-HEALING (#538 adaptive-only goal): copy_skills PRUNES kaola-owned skill
# dirs not in the EFFECTIVE opt-in set before re-copying, so a narrowed reinstall converges
# to adaptive-only on disk (it is no longer additive-only). --uninstall removes the full
# deployed surface; see uninstall_edition.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
TARGET=""
GLOBAL=0
REGENERATE=0
UNINSTALL=0
YES=0
NO_SCRIPTS=0
# #538/#543 install-time opt-ins (mirror install.sh / install-opencode.sh). 0 = not requested
# this run; EFFECTIVE_* (computed below) unions these with any prior installed_paths.
WITH_FAST=0
WITH_FULL=0

usage() {
  cat <<'EOF'
Usage: ./install-kimi.sh [--target DIR] [--global] [--regenerate] [--uninstall]
                         [--no-scripts] [--yes] [--with-fast] [--with-full]
  --target DIR     deploy skills into DIR/.kimi-code/skills (default: current directory)
  --global         deploy skills into ${KIMI_CODE_HOME:-~/.kimi-code}/skills (all projects)
  --regenerate     refresh the in-repo .kimi/ tree from canonical, then exit
  --uninstall      remove the kaola-deployed kimi edition from the resolved scope
                   (honors --target/--global), then exit (see UNINSTALL below)
  --no-scripts     skip support scripts, hook scripts, and the config.toml hooks merge
  --yes            non-interactive (skip the confirmation prompt)
  --with-fast      also deploy the kaola-workflow-fast skill (recorded in installed_paths)
  --with-full      also deploy the kaola-workflow-phase1..5 skills (recorded in installed_paths)

PATH SELECTION: the default install deploys the ADAPTIVE-CORE command skills only (adapt,
finalize, plan-run, workflow-init, workflow-next). --with-fast / --with-full add the fast /
full-phase command skills. All 16 kaola-role-* skills always install. Re-install is a UNION:
a prior opt-in is never removed (--with-fast once, then bare re-install, preserves the fast
skill + installed_paths). The opt-in is recorded in the SHARED
~/.config/kaola-workflow/config.json (the same file install.sh reads). --enable-adaptive is
retired (#538) and accepted-but-ignored.

SUPPORT SCRIPTS + HOOKS: workflow skills resolve support scripts via
${KIMI_CODE_HOME:-$HOME/.kimi-code}/kaola-workflow/scripts (the list comes from
scripts/kaola-workflow-install-manifest.js); the 3 kimi hook scripts land in
${KIMI_CODE_HOME:-$HOME/.kimi-code}/kaola-workflow/hooks and are wired into
${KIMI_CODE_HOME:-$HOME/.kimi-code}/config.toml as a managed [[hooks]] block (idempotent;
validated with `kimi doctor config` when a kimi binary is on PATH).

UNINSTALL: --uninstall removes ONLY kaola-deployed artifacts from the resolved scope
(project DEST_ROOT via --target/$PWD, or --global ${KIMI_CODE_HOME:-$HOME/.kimi-code}):
the deployed skills (by source-tree directory name — never a blind rm of a dir), the
support scripts + hook scripts under the kimi home, the managed hooks block in config.toml
(the rest of the file is preserved), and a surgical reset of installed_paths:[] in the
SHARED ~/.config/kaola-workflow/config.json (parallel_mode + the file are kept for any
co-installed Claude/Codex/opencode edition). A subsequent bare install then deploys the
adaptive-only default.
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

# The resolved kimi home honors $KIMI_CODE_HOME (the same override the kimi CLI itself uses).
kimi_home() { printf '%s\n' "${KIMI_CODE_HOME:-$HOME/.kimi-code}"; }

# Always ensure the in-repo generated tree is fresh before copying from it (install only — an
# uninstall removes by source-tree name and must not regenerate the repo tree).
if [[ "$UNINSTALL" -ne 1 ]]; then
  echo "Kaola-Workflow · kimi edition — refreshing generated tree..."
  node "$SCRIPT_DIR/scripts/sync-kimi-edition.js" --check >/dev/null 2>&1 \
    || node "$SCRIPT_DIR/scripts/sync-kimi-edition.js" --write >/dev/null
fi

if [[ "$REGENERATE" -eq 1 ]]; then
  echo "Regenerated .kimi/ from canonical. Done."
  exit 0
fi

# #538 R1 (mirror install-opencode.sh): compute the EFFECTIVE opt-in set ONCE, up front.
# EFFECTIVE_* = path already in installed_paths OR explicitly requested this run. This makes a
# bare re-install preserve + refresh a previously-installed path's files (UNION never removes).
# Reads the SHARED ~/.config/kaola-workflow/config.json (the same file install.sh writes), so a
# kimi install and a Claude/Codex/opencode install reach identical opt-in parity on that machine.
EXISTING_PATHS="$(node -e 'try{const c=require(process.env.HOME+"/.config/kaola-workflow/config.json");const p=Array.isArray(c.installed_paths)?c.installed_paths:[];process.stdout.write(p.join(" "))}catch(e){}' 2>/dev/null || true)"
case " $EXISTING_PATHS " in *" fast "*) EFFECTIVE_FAST=1 ;; *) EFFECTIVE_FAST=$WITH_FAST ;; esac
case " $EXISTING_PATHS " in *" full "*) EFFECTIVE_FULL=1 ;; *) EFFECTIVE_FULL=$WITH_FULL ;; esac

# Adaptive-core command-skill set (#538): ALWAYS deployed. fast/full are EFFECTIVE-gated
# opt-ins; all kaola-role-* skills always deploy; any OTHER skill fails CLOSED (skipped +
# warned) so a future canonical command cannot silently widen the default install. Single
# source of truth for the partition (used by copy_skills).
ADAPTIVE_CORE_COMMANDS=(
  kaola-workflow-adapt kaola-workflow-finalize
  kaola-workflow-plan-run workflow-init workflow-next
)
in_array() { local needle="$1"; shift; local x; for x in "$@"; do [[ "$x" == "$needle" ]] && return 0; done; return 1; }

copy_skills() {
  local skills_dest="$1"   # project → <dest_root>/.kimi-code/skills; global → <kimi_home>/skills
  mkdir -p "$skills_dest"
  # Self-dev guard: deploying the edition into its OWN source tree means the canonical
  # .kimi/skills and the destination are the same directory — skip the (no-op) copy.
  if [[ "$SCRIPT_DIR/.kimi/skills" -ef "$skills_dest" ]]; then
    echo "Self-dev deploy (source .kimi/skills is already the live tree) → copy skipped."
    return
  fi
  # #538/#543 D2 (mirror install-opencode.sh): the COMMAND-skill deploy is PARTITIONED +
  # SELF-HEALING. First PRUNE every kaola-owned skill dir from the dest (blanket-then-recopy)
  # so a narrowed opt-in set converges to adaptive-only on a bare reinstall. Then re-copy the
  # EFFECTIVE set via a fail-CLOSED ALLOWLIST: adaptive-core ALWAYS, kaola-role-* ALWAYS,
  # kaola-workflow-fast iff EFFECTIVE_FAST, phase1..5 iff EFFECTIVE_FULL, anything else skipped.
  local stale
  for stale in "$skills_dest/"kaola-workflow-* "$skills_dest/"kaola-role-* \
               "$skills_dest/workflow-init" "$skills_dest/workflow-next"; do
    [[ -d "$stale" ]] || continue
    rm -rf "$stale"
  done
  local src_dir base
  for src_dir in "$SCRIPT_DIR/.kimi/skills/"*/; do
    [[ -d "$src_dir" ]] || continue
    base="$(basename "$src_dir")"
    if in_array "$base" "${ADAPTIVE_CORE_COMMANDS[@]}"; then
      :   # adaptive-core: always
    else
      case "$base" in
        kaola-role-*)             : ;;   # role skills: always
        kaola-workflow-fast)      [[ "$EFFECTIVE_FAST" -eq 1 ]] || continue ;;
        kaola-workflow-phase[1-5]) [[ "$EFFECTIVE_FULL" -eq 1 ]] || continue ;;
        *) echo "warning: skipping unrecognized skill not in the adaptive-core/fast/full/role partition: $base" >&2; continue ;;
      esac
    fi
    cp -R "${src_dir%/}" "$skills_dest/$base"
  done
  echo "Installed workflow skills → $skills_dest/"
}

# Install the support scripts + hook scripts the workflow skills invoke. Scripts land in
# ${KIMI_CODE_HOME:-$HOME/.kimi-code}/kaola-workflow/scripts (list from the single-source
# install manifest, same as install-opencode.sh); the 3 kimi hook .sh scripts land in
# .../kaola-workflow/hooks (chmod 755).
install_support_scripts() {
  if [[ "$NO_SCRIPTS" -eq 1 ]]; then
    echo "Support scripts skipped (--no-scripts)."
    return
  fi
  local home; home="$(kimi_home)"
  local manifest="$SCRIPT_DIR/scripts/kaola-workflow-install-manifest.js"
  [[ -f "$manifest" ]] || { echo "warning: install manifest not found; skipping support scripts." >&2; return; }
  local dest="$home/kaola-workflow/scripts"
  mkdir -p "$dest"
  local name
  while IFS= read -r name || [[ -n "$name" ]]; do
    [[ -n "$name" ]] || continue
    if [[ -f "$SCRIPT_DIR/scripts/$name" ]]; then
      cp "$SCRIPT_DIR/scripts/$name" "$dest/$name"
      chmod +x "$dest/$name"
    fi
  done < <(node "$manifest" --forge=github --scripts 2>/dev/null)
  echo "Installed support scripts → $dest"
  local hooks_dest="$home/kaola-workflow/hooks"
  mkdir -p "$hooks_dest"
  local hook hook_base
  for hook in "$SCRIPT_DIR/.kimi/hooks/"*.sh; do
    [[ -f "$hook" ]] || continue
    hook_base="$(basename "$hook")"
    cp "$hook" "$hooks_dest/$hook_base"
    chmod 755 "$hooks_dest/$hook_base"
  done
  echo "Installed hook scripts → $hooks_dest"
}

# Merge the generated hooks fragment (.kimi/hooks/kimi-hooks.toml, __KIMI_HOME__ resolved)
# into <kimi_home>/config.toml as a MANAGED block (marker comments included). Idempotent:
# any prior managed block is stripped (markers inclusive) and the fresh fragment appended at
# EOF with exactly one preceding blank line. The hooks config is global — merged on every
# install (project or --global) unless --no-scripts. Post-merge, `kimi doctor config`
# validates the result when a kimi binary is on PATH; a failure restores the pre-merge file
# and aborts non-zero.
merge_hooks_config() {
  if [[ "$NO_SCRIPTS" -eq 1 ]]; then
    echo "Hooks config merge skipped (--no-scripts)."
    return
  fi
  local home cfg fragment backup=""
  home="$(kimi_home)"
  cfg="$home/config.toml"
  fragment="$SCRIPT_DIR/.kimi/hooks/kimi-hooks.toml"
  mkdir -p "$home"
  if [[ -f "$cfg" ]]; then
    backup="$(mktemp -t kaola-kimi-hooks)"
    cp "$cfg" "$backup"
  fi
  KIMI_HOOKS_CFG="$cfg" KIMI_HOOKS_FRAGMENT="$fragment" KIMI_HOME_RESOLVED="$home" node -e '
    const fs = require("fs");
    const cfg = process.env.KIMI_HOOKS_CFG;
    const home = process.env.KIMI_HOME_RESOLVED;
    const START = "# >>> kaola-workflow kimi hooks";
    const END = "# <<< kaola-workflow kimi hooks";
    const frag = fs.readFileSync(process.env.KIMI_HOOKS_FRAGMENT, "utf8")
      .split("__KIMI_HOME__").join(home).replace(/\s+$/, "");
    let body = "";
    if (fs.existsSync(cfg)) body = fs.readFileSync(cfg, "utf8");
    const kept = [];
    let inBlock = false;
    for (const line of body.split("\n")) {
      if (line.trim() === START) { inBlock = true; continue; }
      if (line.trim() === END) { inBlock = false; continue; }
      if (!inBlock) kept.push(line);
    }
    const stripped = kept.join("\n").replace(/\s+$/, "");
    fs.writeFileSync(cfg, (stripped ? stripped + "\n\n" : "") + frag + "\n");
  '
  if command -v kimi >/dev/null 2>&1; then
    local doctor_out
    if ! doctor_out="$(kimi doctor config "$cfg" 2>&1)"; then
      if [[ -n "$backup" ]]; then cp "$backup" "$cfg"; else rm -f "$cfg"; fi
      if [[ -n "$backup" ]]; then rm -f "$backup"; fi
      echo "error: 'kimi doctor config' rejected $cfg after merging the kaola-workflow hooks block:" >&2
      echo "$doctor_out" >&2
      echo "Restored the pre-merge config; aborting. The generated fragment may be stale — check scripts/sync-kimi-edition.js." >&2
      exit 1
    fi
    echo "Validated merged config via 'kimi doctor config'."
  fi
  if [[ -n "$backup" ]]; then rm -f "$backup"; fi
  echo "Merged kaola-workflow hooks → $cfg (managed block; idempotent re-merge)."
}

# Remove the managed hooks block from <kimi_home>/config.toml (uninstall). The rest of the
# file is preserved; if the file held ONLY the managed block it is removed entirely.
strip_hooks_config() {
  local home cfg
  home="$(kimi_home)"
  cfg="$home/config.toml"
  if [[ ! -f "$cfg" ]]; then return 0; fi
  local had_block=0
  if grep -q '^# >>> kaola-workflow kimi hooks' "$cfg"; then had_block=1; fi
  KIMI_HOOKS_CFG="$cfg" node -e '
    const fs = require("fs");
    const cfg = process.env.KIMI_HOOKS_CFG;
    const START = "# >>> kaola-workflow kimi hooks";
    const END = "# <<< kaola-workflow kimi hooks";
    const body = fs.readFileSync(cfg, "utf8");
    const kept = [];
    let inBlock = false;
    for (const line of body.split("\n")) {
      if (line.trim() === START) { inBlock = true; continue; }
      if (line.trim() === END) { inBlock = false; continue; }
      if (!inBlock) kept.push(line);
    }
    const stripped = kept.join("\n").replace(/\s+$/, "");
    if (stripped) fs.writeFileSync(cfg, stripped + "\n");
    else if (body.includes(START)) fs.unlinkSync(cfg);
  '
  if [[ "$had_block" -eq 1 ]]; then
    if [[ -f "$cfg" ]]; then
      echo "Removed managed hooks block from $cfg (rest of the file preserved)."
    else
      echo "Removed managed hooks block; $cfg held only kaola content and was removed."
    fi
  fi
}

# Remove ONLY kaola-deployed artifacts from the resolved scope, by source-tree directory name
# (never a blind rm of a dir the user may share). Strips the managed hooks block from
# config.toml (preserving the rest) and surgically resets the SHARED installed_paths to []
# (keeps parallel_mode + the file for any co-installed Claude/Codex/opencode edition).
uninstall_edition() {
  local home skills_dest
  home="$(kimi_home)"
  if [[ "$GLOBAL" -eq 1 ]]; then
    skills_dest="$home/skills"
  else
    skills_dest="${TARGET:-$PWD}/.kimi-code/skills"
  fi
  echo "Uninstalling Kaola-Workflow · kimi edition from → $skills_dest"
  if [[ -d "$skills_dest" && "$SCRIPT_DIR/.kimi/skills" -ef "$skills_dest" ]]; then
    echo "Refusing to uninstall the edition's OWN source tree ($skills_dest). No-op." >&2
    return
  fi
  local src_dir
  for src_dir in "$SCRIPT_DIR/.kimi/skills/"*/; do
    [[ -d "$src_dir" ]] || continue
    rm -rf "$skills_dest/$(basename "$src_dir")"
  done
  rmdir "$skills_dest" 2>/dev/null || true
  if [[ "$GLOBAL" -ne 1 ]]; then rmdir "${TARGET:-$PWD}/.kimi-code" 2>/dev/null || true; fi
  echo "Removed deployed skills."
  # Support scripts + hook scripts (kimi-home dir; honors $KIMI_CODE_HOME). Removed by name;
  # the kaola-workflow dirs are rmdir'd only once empty.
  local scripts_dir="$home/kaola-workflow/scripts"
  local hooks_dir="$home/kaola-workflow/hooks"
  local manifest="$SCRIPT_DIR/scripts/kaola-workflow-install-manifest.js"
  if [[ -f "$manifest" && -d "$scripts_dir" ]]; then
    local name
    while IFS= read -r name || [[ -n "$name" ]]; do
      [[ -n "$name" ]] || continue
      rm -f "$scripts_dir/$name"
    done < <(node "$manifest" --forge=github --scripts 2>/dev/null)
  fi
  if [[ -d "$hooks_dir" ]]; then
    local hook
    for hook in "$SCRIPT_DIR/.kimi/hooks/"*.sh; do
      [[ -f "$hook" ]] || continue
      rm -f "$hooks_dir/$(basename "$hook")"
    done
  fi
  rmdir "$scripts_dir" 2>/dev/null || true
  rmdir "$hooks_dir" 2>/dev/null || true
  rmdir "$home/kaola-workflow" 2>/dev/null || true
  echo "Removed deployed support scripts + hook scripts."
  strip_hooks_config
  # Surgical reset of the SHARED config (node — already a hard dependency): installed_paths:[] only.
  local shared="$HOME/.config/kaola-workflow/config.json"
  if [[ -f "$shared" ]]; then
    node -e 'const fs=require("fs"),p=process.argv[1];try{const c=JSON.parse(fs.readFileSync(p,"utf8"));if(c&&typeof c==="object"&&!Array.isArray(c)){c.installed_paths=[];fs.writeFileSync(p,JSON.stringify(c,null,2)+"\n");}}catch(e){}' "$shared" 2>/dev/null || true
    echo "Reset installed_paths:[] in $shared (adaptive-only; other editions unaffected)."
  fi
  echo "Uninstall complete. A fresh ./install-kimi.sh now deploys the adaptive-only default."
}

# #2 / #538 / #543 D4 (mirror install-opencode.sh): seed ~/.config/kaola-workflow/config.json
# via UNION read-modify-write so a kimi install reaches install-time parity
# (parallel_mode:'auto' default-ON + installed_paths) with what install.sh writes.
# installed_paths records the EFFECTIVE opt-in set (R1 UNION with any prior opt-ins — never
# removes). This config is the SHARED global file the classifiers + claim read
# (edition-agnostic, never clobbered); it is SEPARATE from the kimi config.toml.
# Implemented in NODE (already a hard dependency above). Fail-closed on a corrupt/non-object
# config: leave it untouched and warn, naming the deployed opt-in so any divergence is visible.
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
      echo "warning: opt-in skill dirs WERE deployed but the opt-in could not be recorded; set installed_paths by hand (include \"fast\" and/or \"full\" as deployed)." >&2
    fi
  fi
}

# Interactive confirmation. --yes skips it; non-interactive stdin proceeds without prompting
# (mirrors install-opencode.sh, which accepts --yes and never blocks on a pipe).
confirm_install() {
  if [[ "$YES" -eq 1 ]]; then return 0; fi
  if [[ ! -t 0 ]]; then return 0; fi
  cat <<EOF
About to install the Kaola-Workflow kimi edition:
  skills              → $SKILLS_DEST
  support scripts     → $(kimi_home)/kaola-workflow/scripts
  hook scripts        → $(kimi_home)/kaola-workflow/hooks
  hooks config block  → $(kimi_home)/config.toml (managed block)
EOF
  local reply=""
  read -r -p "Proceed? [Y/n] " reply || reply="n"
  case "$reply" in
    n|N|no|No|NO) echo "Aborted."; exit 0 ;;
  esac
}

# --uninstall short-circuits the install entirely (functions are defined above).
if [[ "$UNINSTALL" -eq 1 ]]; then
  uninstall_edition
  exit 0
fi

if [[ "$GLOBAL" -eq 1 ]]; then
  DEST_ROOT="$(kimi_home)"
  SKILLS_DEST="$DEST_ROOT/skills"
  echo "Deploying globally → $DEST_ROOT"
else
  DEST_ROOT="${TARGET:-$PWD}"
  SKILLS_DEST="$DEST_ROOT/.kimi-code/skills"
  echo "Deploying into project → $DEST_ROOT"
fi

confirm_install
copy_skills "$SKILLS_DEST"
seed_kaola_config
install_support_scripts
merge_hooks_config

echo ""
echo "Next: open the project in Kimi Code and run a workflow command, e.g.:"
echo "  /workflow-init"
# #2 / D-542-01: planner-proven-disjoint parallel write frontiers are default-ON (no operator
# toggle). Per-leg worktree isolation + the mandatory synthesizer reconcile are the correctness net.
echo "Disjoint parallel writes are default-ON (set KAOLA_PARALLEL_WRITES=0 to force serial)."
