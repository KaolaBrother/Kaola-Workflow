#!/usr/bin/env bash
# Kaola-Workflow installer.
#
# Supports curl | bash and local execution.
#
# Usage (one-liner):
#   curl -fsSL https://raw.githubusercontent.com/KaolaBrother/Kaola-Workflow/main/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/KaolaBrother/Kaola-Workflow/main/install.sh | bash -s -- --forge=gitlab
#   curl -fsSL https://raw.githubusercontent.com/KaolaBrother/Kaola-Workflow/main/install.sh | bash -s -- --forge=gitea
#
# Usage (local clone):
#   git clone https://github.com/KaolaBrother/Kaola-Workflow.git && cd Kaola-Workflow && ./install.sh [--yes] [--forge=github|gitlab|gitea]

set -euo pipefail

# Detect curl|bash: BASH_SOURCE[0] is empty or not a real file when piped from curl.
# When detected, clone the repo to a temp dir and re-exec the local copy.
_SELF="${BASH_SOURCE[0]:-}"
if [[ -z "$_SELF" || "$_SELF" == "-" || ! -f "$_SELF" ]]; then
  if ! command -v git >/dev/null 2>&1; then
    echo "error: git is required but not found — install git and retry" >&2
    exit 1
  fi
  _TMPDIR="$(mktemp -d)"
  trap 'rm -rf "$_TMPDIR"' EXIT
  echo "Kaola-Workflow — cloning repository..."
  git clone --depth=1 https://github.com/KaolaBrother/Kaola-Workflow.git "$_TMPDIR/kaola-workflow" >/dev/null 2>&1
  bash "$_TMPDIR/kaola-workflow/install.sh" "$@"
  _EXIT=$?
  rm -rf "$_TMPDIR"
  exit $_EXIT
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
COMMANDS_DIR="$HOME/.claude/commands"
AGENTS_DIR="${KAOLA_AGENT_DIR:-$HOME/.claude/agents}"
SOURCE_AGENTS_DIR="$SCRIPT_DIR/agents"
AGENT_MANIFEST_FILE="$AGENTS_DIR/.kaola-workflow-agent-manifest"
MANAGED_AGENT_MARKER="kaola-workflow-managed-agent: true"
REQUIRED_AGENTS=("code-explorer" "knowledge-lookup" "planner" "code-architect" "tdd-guide" "implementer" "build-error-resolver" "code-reviewer" "security-reviewer" "doc-updater" "adversarial-verifier" "contractor" "workflow-planner" "issue-scout" "synthesizer" "metric-optimizer")
YES=0
FORGE=github
MERGE_SETTINGS=1
# Default profile is `higher` (Opus for code-architect/code-reviewer/security-reviewer).
# Pass --profile=common to install the Sonnet assignments for those three agents.
PROFILE=higher
# Adaptive is the unconditional default (#538): no on/off switch. Opt-in paths are installed
# by passing --with-fast (fast path) or --with-full (full 6-phase path). Re-install preserves
# (UNION) what is already installed. Reset = uninstall -> reinstall (back to adaptive-only).
# Config writes installed_paths:[] (default) into ~/.config/kaola-workflow/config.json.
WITH_FAST=0
WITH_FULL=0

usage() {
  echo "Usage: ./install.sh [--yes] [--forge=github|gitlab|gitea] [--no-settings-merge] [--profile=higher|common] [--with-fast] [--with-full]"
  echo "  --profile defaults to 'higher' (Opus reviewers); use --profile=common for Sonnet."
  echo "  --with-fast   install the fast path (opt-in; adaptive is always installed by default)."
  echo "  --with-full   install the full 6-phase path (opt-in; adaptive is always installed by default)."
}

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    -y|--yes)
      YES=1
      shift
      ;;
    --forge=*)
      FORGE="${1#--forge=}"
      shift
      ;;
    --forge)
      if [[ -z "${2:-}" ]]; then
        echo "--forge requires github, gitlab, or gitea" >&2
        usage >&2
        exit 2
      fi
      FORGE="$2"
      shift 2
      ;;
    --no-settings-merge)
      MERGE_SETTINGS=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --profile=*)
      PROFILE="${1#--profile=}"
      shift
      ;;
    --profile)
      if [[ -z "${2:-}" ]]; then
        echo "--profile requires common or higher" >&2
        usage >&2
        exit 2
      fi
      PROFILE="$2"
      shift 2
      ;;
    --enable-adaptive|--enable-adaptive=*)
      echo "warning: --enable-adaptive is retired (#538); adaptive is the unconditional default and is always installed. Ignoring." >&2
      shift ;;
    --with-fast)
      WITH_FAST=1
      shift ;;
    --with-full)
      WITH_FULL=1
      shift ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

case "$PROFILE" in
  common|higher) ;;
  *)
    echo "Unknown profile: $PROFILE (must be common or higher)" >&2
    usage >&2
    exit 2
    ;;
esac

case "$FORGE" in
  github)
    SUPPORT_DIR="$HOME/.claude/kaola-workflow"
    SOURCE_COMMANDS_DIR="$SCRIPT_DIR/commands"
    SOURCE_SCRIPTS_DIR="$SCRIPT_DIR/scripts"
    SOURCE_HOOKS_DIR="$SCRIPT_DIR/hooks"
    ;;
  gitlab)
    SUPPORT_DIR="$HOME/.claude/kaola-workflow-gitlab"
    SOURCE_COMMANDS_DIR="$SCRIPT_DIR/plugins/kaola-workflow-gitlab/commands"
    SOURCE_SCRIPTS_DIR="$SCRIPT_DIR/plugins/kaola-workflow-gitlab/scripts"
    SOURCE_HOOKS_DIR="$SCRIPT_DIR/plugins/kaola-workflow-gitlab/hooks"
    ;;
  gitea)
    SUPPORT_DIR="$HOME/.claude/kaola-workflow-gitea"
    SOURCE_COMMANDS_DIR="$SCRIPT_DIR/plugins/kaola-workflow-gitea/commands"
    SOURCE_SCRIPTS_DIR="$SCRIPT_DIR/plugins/kaola-workflow-gitea/scripts"
    SOURCE_HOOKS_DIR="$SCRIPT_DIR/plugins/kaola-workflow-gitea/hooks"
    ;;
  *)
    echo "Unknown forge: $FORGE" >&2
    usage >&2
    exit 2
    ;;
esac

# #407 (#365 deferred half): SINGLE-SOURCE the per-forge SUPPORT_SCRIPT_NAMES / SUPPORT_HOOK_NAMES
# from scripts/kaola-workflow-install-manifest.js (was 3 hand-maintained case-block arrays). The
# manifest derives every forge's set from one canonical list + a rename-IFF-ported transform, so a
# new shared support script is now registered in ≤2 places (the manifest, + a rename override only
# if its forge port is content-renamed). Consumed via a PORTABLE `while read` loop (NOT mapfile —
# the install target may run macOS bash 3.2; matches the #363 node shell-out pattern below). The
# manifest exits non-zero (writing nothing) on an empty/invalid emission; the empty-array guard below
# then fails LOUDLY (a process-substitution exit code can't reach the `while`, so we guard the result).
# KAOLA_INSTALL_MANIFEST lets a test point at a temp manifest copy without mutating the in-repo one
# (keeps the #363 planted-typo fail-closed test non-destructive); defaults to the repo manifest.
INSTALL_MANIFEST="${KAOLA_INSTALL_MANIFEST:-$SCRIPT_DIR/scripts/kaola-workflow-install-manifest.js}"
SUPPORT_SCRIPT_NAMES=()
while IFS= read -r name || [[ -n "$name" ]]; do
  [[ -n "$name" ]] && SUPPORT_SCRIPT_NAMES+=("$name")
done < <(node "$INSTALL_MANIFEST" --forge="$FORGE" --scripts)
SUPPORT_HOOK_NAMES=()
while IFS= read -r name || [[ -n "$name" ]]; do
  [[ -n "$name" ]] && SUPPORT_HOOK_NAMES+=("$name")
done < <(node "$INSTALL_MANIFEST" --forge="$FORGE" --hooks)
# A process-substitution exit code does not reach the `while`, so guard on the RESULT: the manifest
# exits non-zero (writing nothing) on any error, leaving an empty array — fail LOUDLY on either empty
# list rather than silently copying zero support files (the 5.4.0 silent-empty regression class).
if [[ ${#SUPPORT_SCRIPT_NAMES[@]} -eq 0 || ${#SUPPORT_HOOK_NAMES[@]} -eq 0 ]]; then
  echo "Install error: install manifest emitted an empty support list for forge $FORGE (node $INSTALL_MANIFEST --forge=$FORGE)" >&2
  exit 1
fi

SUPPORT_SCRIPTS_DIR="$SUPPORT_DIR/scripts"
SUPPORT_HOOKS_DIR="$SUPPORT_DIR/hooks"

echo "Kaola-Workflow — installer"
echo "Forge: $FORGE"
echo ""

# Refuse to install if kaola-workflow is already registered via the Claude Code
# plugin runtime. Running both produces a parallel install: plugin-managed hooks
# fire from ~/.claude/plugins/data/... while these manual commands shadow plugin
# commands. The user must uninstall the plugin first.
if command -v claude >/dev/null 2>&1; then
  PLUGIN_LIST="$(claude plugin list 2>/dev/null || true)"
  if printf '%s\n' "$PLUGIN_LIST" | grep -qE 'kaola-workflow(-gitlab|-gitea)?@'; then
    echo "error: kaola-workflow is currently installed via the Claude Code plugin runtime." >&2
    echo "" >&2
    echo "Running install.sh on top of a plugin install creates a parallel installation:" >&2
    echo "manual commands shadow plugin commands, and plugin hooks still fire from" >&2
    echo "~/.claude/plugins/data/. Remove the plugin install first, then retry:" >&2
    echo "" >&2
    echo "  claude plugin uninstall kaola-workflow@kaolabrother-kaola-workflow" >&2
    echo "  claude plugin uninstall kaola-workflow-gitlab@kaolabrother-kaola-workflow  # if installed" >&2
    echo "  claude plugin uninstall kaola-workflow-gitea@kaolabrother-kaola-workflow  # if installed" >&2
    echo "  claude plugin marketplace remove kaolabrother-kaola-workflow" >&2
    echo "" >&2
    echo "Then re-run install.sh." >&2
    exit 1
  fi
fi


# #538 R1: Compute the effective opt-in set ONCE, up front (before the stale loop and before
# D4 writes the config). EFFECTIVE_* = path already installed OR explicitly requested this run.
# This ensures a bare reinstall spares AND refreshes a previously-installed path's files.
EXISTING_PATHS="$(node -e 'try{const c=require(process.env.HOME+"/.config/kaola-workflow/config.json");const p=Array.isArray(c.installed_paths)?c.installed_paths:[];process.stdout.write(p.join(" "))}catch(e){}' 2>/dev/null || true)"
case " $EXISTING_PATHS " in *" fast "*) EFFECTIVE_FAST=1 ;; *) EFFECTIVE_FAST=$WITH_FAST ;; esac
case " $EXISTING_PATHS " in *" full "*) EFFECTIVE_FULL=1 ;; *) EFFECTIVE_FULL=$WITH_FULL ;; esac

# Remove stale kaola-workflow command files before installing fresh ones.
# Outdated user-level commands in ~/.claude/commands/ take precedence over
# everything else and will shadow updated installs if not cleaned up.
if [[ -d "$COMMANDS_DIR" ]]; then
  for pattern in "kaola-workflow-*.md" "workflow-init.md" "workflow-next.md" "workflow-goal.md" "workflow-next-pr.md"; do
    for stale_file in "$COMMANDS_DIR"/$pattern; do
      [[ -f "$stale_file" ]] || continue
      rm -f "$stale_file"
      echo "Removed stale command: $stale_file"
    done
  done
fi

# Remove stale support scripts that no longer exist in source.
if [[ -d "$SUPPORT_SCRIPTS_DIR" ]]; then
  for stale_file in "$SUPPORT_SCRIPTS_DIR"/*.js; do
    [[ -f "$stale_file" ]] || continue
    stale_name="$(basename "$stale_file")"
    is_current=0
    for name in "${SUPPORT_SCRIPT_NAMES[@]}"; do
      [[ "$name" == "$stale_name" ]] && is_current=1 && break
    done
    if [[ "$is_current" -eq 0 ]]; then
      rm -f "$stale_file"
      echo "Removed stale script: $stale_file"
    fi
  done
fi

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

manifest_lookup() {
  local file_name="$1"
  [[ -f "$AGENT_MANIFEST_FILE" ]] || return 0
  awk -F '\t' -v name="$file_name" '$1 == name { value = $2 } END { if (value) print value }' "$AGENT_MANIFEST_FILE"
}

agent_source_file() {
  local agent="$1"; local file_name="$agent.md"
  local source_file="$SOURCE_AGENTS_DIR/$file_name"
  if [[ "$PROFILE" == "higher" && -f "$SOURCE_AGENTS_DIR/profiles/higher/$file_name" ]]; then
    source_file="$SOURCE_AGENTS_DIR/profiles/higher/$file_name"
  fi
  printf '%s\n' "$source_file"
}

install_managed_agent() {
  local source="$1"; local dest="$2"
  cp "$source" "$dest"
  local tmp; tmp="$(mktemp)"
  awk '
    BEGIN { in_fm=0; closed=0; replaced=0 }
    NR==1 && $0=="---" { in_fm=1; print; next }
    in_fm && !closed && $0=="---" { closed=1; in_fm=0; print; next }
    in_fm && !closed && !replaced && $0 ~ /^[[:space:]]*model[[:space:]]*:/ {
      match($0, /^[[:space:]]*model[[:space:]]*:[[:space:]]*/)
      print substr($0,1,RLENGTH) "inherit"; replaced=1; next
    }
    { print }
  ' "$dest" > "$tmp" && mv "$tmp" "$dest" || { rm -f "$tmp"; echo "Failed to rewrite frontmatter: $dest" >&2; exit 1; }
}

install_agent_files() {
  if [[ ! -d "$SOURCE_AGENTS_DIR" ]]; then
    echo "Agents directory not found: $SOURCE_AGENTS_DIR" >&2
    exit 1
  fi

  mkdir -p "$AGENTS_DIR"

  local manifest_tmp
  manifest_tmp="$(mktemp)"
  local installed=0
  local skipped=0

  for agent in "${REQUIRED_AGENTS[@]}"; do
    local file_name="$agent.md"
    local source_file="$SOURCE_AGENTS_DIR/$file_name"
    if [[ "$PROFILE" == "higher" && -f "$SOURCE_AGENTS_DIR/profiles/higher/$file_name" ]]; then
      source_file="$SOURCE_AGENTS_DIR/profiles/higher/$file_name"
    fi
    local dest="$AGENTS_DIR/$file_name"

    if [[ ! -f "$source_file" ]]; then
      echo "Required agent source not found: $source_file" >&2
      rm -f "$manifest_tmp"
      exit 1
    fi

    if [[ -f "$dest" ]]; then
      local recorded_hash
      local current_hash
      recorded_hash="$(manifest_lookup "$file_name")"
      current_hash="$(sha256_file "$dest")"

      # Safe to (re)write when dest is provably pristine (byte-identical to the
      # current source) or recorded as an unmodified managed file. cmp against the
      # source alone is not "already in desired state": the installed form is the
      # inherit-rewritten frontmatter, so byte-equal-to-source must still rewrite.
      if cmp -s "$source_file" "$dest" ||
         { [[ -n "$recorded_hash" ]] &&
           [[ "$current_hash" == "$recorded_hash" ]] &&
           grep -Fq "$MANAGED_AGENT_MARKER" "$dest"; }; then
        install_managed_agent "$source_file" "$dest"
        echo "Updated managed agent: $dest"
      else
        echo "Skipped agent with existing user-owned or modified file: $dest"
        skipped=$((skipped + 1))
        continue
      fi
    else
      install_managed_agent "$source_file" "$dest"
      echo "Installed agent: $dest"
    fi

    if ! grep -Fq "$MANAGED_AGENT_MARKER" "$dest"; then
      echo "Install verification failed: missing managed marker in agent: $dest" >&2
      rm -f "$manifest_tmp"
      exit 1
    fi

    printf '%s\t%s\n' "$file_name" "$(sha256_file "$dest")" >> "$manifest_tmp"
    installed=$((installed + 1))
  done

  if [[ -s "$manifest_tmp" ]]; then
    mv "$manifest_tmp" "$AGENT_MANIFEST_FILE"
  else
    rm -f "$manifest_tmp"
  fi

  if [[ "$skipped" -gt 0 ]]; then
    echo "Skipped $skipped agent file(s). Existing files were left untouched."
  fi
  if [[ "$installed" -gt 0 ]]; then
    echo "Verified managed Kaola-Workflow agents."
  fi
}

install_agent_files

default_agent_model() {
  case "$1" in
    code-explorer|knowledge-lookup|code-architect|tdd-guide|implementer|build-error-resolver|code-reviewer|security-reviewer|adversarial-verifier|contractor|issue-scout)
      printf '%s\n' "sonnet"
      ;;
    planner|workflow-planner)
      printf '%s\n' "opus"
      ;;
    doc-updater)
      printf '%s\n' "sonnet"
      ;;
  esac
}

extract_agent_model() {
  local agent_file="$1"
  [[ -f "$agent_file" ]] || return 0
  awk '
    NR == 1 && $0 == "---" { in_frontmatter = 1; next }
    in_frontmatter && $0 == "---" { exit }
    in_frontmatter && $0 ~ /^[[:space:]]*model[[:space:]]*:/ {
      sub(/^[[:space:]]*model[[:space:]]*:[[:space:]]*/, "", $0)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", $0)
      if (substr($0, 1, 1) == "\"" && substr($0, length($0), 1) == "\"") {
        $0 = substr($0, 2, length($0) - 2)
      }
      print
      exit
    }
  ' "$agent_file"
}

resolve_agent_model_for_install() {
  local agent="$1"
  local model
  model="$(extract_agent_model "$(agent_source_file "$agent")")"
  if [[ -z "$model" ]]; then
    model="$(default_agent_model "$agent")"
  fi
  if [[ "$(printf '%s' "$model" | tr '[:upper:]' '[:lower:]')" == "inherit" ]]; then
    return 0
  fi
  printf '%s\n' "$model"
}

model_for_placeholder() {
  case "$1" in
    CODE_EXPLORER_MODEL) resolve_agent_model_for_install code-explorer ;;
    KNOWLEDGE_LOOKUP_MODEL) resolve_agent_model_for_install knowledge-lookup ;;
    PLANNER_MODEL) resolve_agent_model_for_install planner ;;
    CODE_ARCHITECT_MODEL) resolve_agent_model_for_install code-architect ;;
    TDD_GUIDE_MODEL) resolve_agent_model_for_install tdd-guide ;;
    IMPLEMENTER_MODEL) resolve_agent_model_for_install implementer ;;
    BUILD_ERROR_RESOLVER_MODEL) resolve_agent_model_for_install build-error-resolver ;;
    CODE_REVIEWER_MODEL) resolve_agent_model_for_install code-reviewer ;;
    ISSUE_SCOUT_MODEL) resolve_agent_model_for_install issue-scout ;;
    SECURITY_REVIEWER_MODEL) resolve_agent_model_for_install security-reviewer ;;
    DOC_UPDATER_MODEL) resolve_agent_model_for_install doc-updater ;;
    CONTRACTOR_MODEL) resolve_agent_model_for_install contractor ;;
    WORKFLOW_PLANNER_MODEL) resolve_agent_model_for_install workflow-planner ;;
  esac
}

# Emit .kaola-agent-models.json so the adaptive resolver can look up
# profile-aware models without parsing agent frontmatter at runtime.
# Agents that resolve to empty or 'inherit' are omitted (they fall through
# to the resolver's next precedence step).
emit_agent_model_manifest() {
  local manifest_file="$AGENTS_DIR/.kaola-agent-models.json"
  local pairs=()
  for agent in "${REQUIRED_AGENTS[@]}"; do
    local model
    model="$(resolve_agent_model_for_install "$agent")"
    if [[ -z "$model" ]]; then
      continue
    fi
    pairs+=("$agent" "$model")
  done
  # #363: encode the manifest via node (guaranteed present — the product is node scripts) so a
  # model value containing a quote or backslash yields VALID JSON. The prior string-concat builder
  # had no escaping, so such a value corrupted ~/.claude/agents/.kaola-agent-models.json (consumed
  # by the runtime resolve-agent-model chain).
  if [[ "${#pairs[@]}" -eq 0 ]]; then
    # All agents resolved to inherit/empty — write empty object.
    printf '{}\n' > "$manifest_file"
  else
    node -e 'const fs=require("fs");const out=process.argv[1];const a=process.argv.slice(2);const o={};for(let i=0;i<a.length;i+=2)o[a[i]]=a[i+1];fs.writeFileSync(out,JSON.stringify(o,null,2)+"\n");' "$manifest_file" "${pairs[@]}"
  fi
  echo "Installed agent model manifest: $manifest_file"
}

emit_agent_model_manifest

render_command_file() {
  local source_file="$1"
  local dest_file="$2"
  local line rendered placeholder model skip_line
  local placeholders=(
    CODE_EXPLORER_MODEL
    KNOWLEDGE_LOOKUP_MODEL
    PLANNER_MODEL
    CODE_ARCHITECT_MODEL
    TDD_GUIDE_MODEL
    IMPLEMENTER_MODEL
    BUILD_ERROR_RESOLVER_MODEL
    CODE_REVIEWER_MODEL
    ISSUE_SCOUT_MODEL
    SECURITY_REVIEWER_MODEL
    DOC_UPDATER_MODEL
    CONTRACTOR_MODEL
    WORKFLOW_PLANNER_MODEL
  )

  : > "$dest_file"
  while IFS= read -r line || [[ -n "$line" ]]; do
    rendered="$line"
    skip_line=0
    for placeholder in "${placeholders[@]}"; do
      if [[ "$rendered" == *"{$placeholder}"* ]]; then
        model="$(model_for_placeholder "$placeholder")"
        if [[ -z "$model" ]]; then
          if [[ "$rendered" == *"model=\"{$placeholder}\""* ]]; then
            # inherit/empty model in the frontmatter model="{X}" context → drop the line (intended).
            skip_line=1
            break
          fi
          # #363: an inherit/empty model in ANY OTHER context would silently empty the placeholder
          # and corrupt prose. Fail loudly instead of producing a corrupted command file.
          echo "Install error: placeholder {$placeholder} resolved to empty (inherit) in a non-model context in $(basename "$source_file"):" >&2
          echo "  $line" >&2
          exit 1
        fi
        rendered="${rendered//\{$placeholder\}/$model}"
      fi
    done
    if [[ "$skip_line" -eq 0 ]]; then
      printf '%s\n' "$rendered" >> "$dest_file"
    fi
  done < "$source_file"
}

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

  # #538 D2: gate fast/full files on the effective opt-in set; adaptive files always install.
  case "$(basename "$command_file")" in
    kaola-workflow-fast.md)
      [[ "$EFFECTIVE_FAST" -eq 1 ]] || continue ;;
    kaola-workflow-phase[1-5].md)
      [[ "$EFFECTIVE_FULL" -eq 1 ]] || continue ;;
  esac

  dest="$COMMANDS_DIR/$(basename "$command_file")"
  render_command_file "$command_file" "$dest"
  echo "Installed: $dest"
  installed=$((installed + 1))
done

if [[ "$installed" -eq 0 ]]; then
  if [[ "$FORGE" = "gitlab" || "$FORGE" = "gitea" ]]; then
    echo "${FORGE^} edition skeleton: no command files found yet in $SOURCE_COMMANDS_DIR."
  else
    echo "No command files found in: $SOURCE_COMMANDS_DIR" >&2
    exit 1
  fi
fi

mkdir -p "$SUPPORT_SCRIPTS_DIR"
for script_name in "${SUPPORT_SCRIPT_NAMES[@]}"; do
  script_file="$SOURCE_SCRIPTS_DIR/$script_name"
  # #363: fail CLOSED — an allowlisted name missing from source is a bug (the 5.4.0 incident class),
  # not something to silently skip (which previously installed nothing yet verified green on forges).
  if [[ ! -f "$script_file" ]]; then
    echo "Install error: allowlisted support script missing from source: $script_file" >&2
    exit 1
  fi
  cp "$script_file" "$SUPPORT_SCRIPTS_DIR/$script_name"
  chmod +x "$SUPPORT_SCRIPTS_DIR/$script_name"
  echo "Installed support script: $SUPPORT_SCRIPTS_DIR/$script_name"
done

mkdir -p "$SUPPORT_HOOKS_DIR"
# #372: delete the stale installed phantom-advisor hook on upgrade (it was retired with the advisor
# gates; it is no longer in SUPPORT_HOOK_NAMES, so a prior install's copy would otherwise linger).
rm -f "$SUPPORT_HOOKS_DIR/kaola-workflow-phantom-advisor.sh"
for hook_name in "${SUPPORT_HOOK_NAMES[@]}"; do
  hook_file="$SOURCE_HOOKS_DIR/$hook_name"
  # #363: fail CLOSED on a missing allowlisted hook source (same rationale as the support scripts).
  if [[ ! -f "$hook_file" ]]; then
    echo "Install error: allowlisted support hook missing from source: $hook_file" >&2
    exit 1
  fi
  cp "$hook_file" "$SUPPORT_HOOKS_DIR/$hook_name"
  chmod +x "$SUPPORT_HOOKS_DIR/$hook_name"
  echo "Installed support hook: $SUPPORT_HOOKS_DIR/$hook_name"
done

# Install hooks.json with $CLAUDE_PLUGIN_ROOT rewritten to absolute install path.
# Manual install does not set CLAUDE_PLUGIN_ROOT, so the placeholder is replaced
# with $SUPPORT_DIR (e.g. ~/.claude/kaola-workflow) at install time.
if [[ -f "$SOURCE_HOOKS_DIR/hooks.json" ]]; then
  # #363: rewrite via node (guaranteed present) and FAIL LOUDLY. The prior python3 heredoc swallowed
  # all errors (2>/dev/null) and fell back to a raw `sed` substitution that mangled JSON when
  # $SUPPORT_DIR contained sed-special chars (| or &). node does proper JSON parse + string replace
  # and exits non-zero on any failure (no silent corruption, no sed-metachar breakage).
  node -e '
    const fs = require("fs");
    const [src, dst, root] = process.argv.slice(1);
    const rewrite = (o) =>
      Array.isArray(o) ? o.map(rewrite)
      : (o && typeof o === "object") ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, rewrite(v)]))
      : (typeof o === "string") ? o.split("${CLAUDE_PLUGIN_ROOT}").join(root).split("$CLAUDE_PLUGIN_ROOT").join(root)
      : o;
    fs.writeFileSync(dst, JSON.stringify(rewrite(JSON.parse(fs.readFileSync(src, "utf8"))), null, 2) + "\n");
  ' "$SOURCE_HOOKS_DIR/hooks.json" "$SUPPORT_HOOKS_DIR/hooks.json" "$SUPPORT_DIR" || {
    echo "Install error: failed to render $SUPPORT_HOOKS_DIR/hooks.json (node rewrite failed)" >&2
    exit 1
  }
  echo "Installed hooks config: $SUPPORT_HOOKS_DIR/hooks.json"
fi

# Auto-merge Kaola-Workflow hook entries into ~/.claude/settings.json so the
# user does not have to hand-edit settings. Identifies managed entries by id
# prefix ("kaola-workflow:") or by inner-hook command path containing
# "kaola-workflow", so re-runs replace cleanly and hand-merged entries from
# earlier installs get upgraded with proper id/description metadata.
SETTINGS_MERGE_RESULT=skipped
if [[ "$MERGE_SETTINGS" -eq 1 && -f "$SUPPORT_HOOKS_DIR/hooks.json" ]]; then
  SETTINGS_FILE="$HOME/.claude/settings.json"
  SETTINGS_BACKUP_DIR="$HOME/.claude/backups"
  if command -v python3 >/dev/null 2>&1; then
    mkdir -p "$HOME/.claude"
    if python3 - "$SETTINGS_FILE" "$SUPPORT_HOOKS_DIR/hooks.json" "$SETTINGS_BACKUP_DIR" <<'PY'; then
import json, os, sys, time
settings_path, hooks_src, backup_dir = sys.argv[1], sys.argv[2], sys.argv[3]

with open(hooks_src) as f:
    incoming_settings = json.load(f)
incoming = incoming_settings.get("hooks", {})
if not isinstance(incoming, dict) or not incoming:
    print("No hooks block found in source; skipping settings merge.", file=sys.stderr)
    sys.exit(0)

if os.path.exists(settings_path):
    try:
        with open(settings_path) as f:
            settings = json.load(f)
    except json.JSONDecodeError as e:
        print(f"warning: {settings_path} is not valid JSON ({e}); skipping auto-merge.", file=sys.stderr)
        print("Fix the file and re-run install.sh, or merge the hooks block by hand.", file=sys.stderr)
        sys.exit(2)
    os.makedirs(backup_dir, exist_ok=True)
    ts = time.strftime("%Y%m%d-%H%M%S")
    backup_path = os.path.join(backup_dir, f"settings.json.kaola-workflow.{ts}.bak")
    with open(settings_path, "rb") as src, open(backup_path, "wb") as dst:
        dst.write(src.read())
    print(f"Backed up existing settings to: {backup_path}", file=sys.stderr)
else:
    settings = {}

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

hooks = settings.setdefault("hooks", {})
if not isinstance(hooks, dict):
    print("warning: settings.json 'hooks' field is not an object; skipping auto-merge.", file=sys.stderr)
    sys.exit(2)

for event, new_entries in incoming.items():
    if not isinstance(new_entries, list):
        continue
    existing = hooks.get(event, [])
    if not isinstance(existing, list):
        existing = []
    cleaned = [e for e in existing if not is_managed(e)]
    cleaned.extend(new_entries)
    hooks[event] = cleaned

# #372: de-register stale managed Kaola hook entries from events the installer NO LONGER ships
# (e.g. the retired PostToolUse phantom-advisor). The merge loop above only visits events present
# in `incoming`; without this sweep a dropped event keeps its stale managed entry forever (AC7).
for event in list(hooks.keys()):
    if event in incoming:
        continue
    entries = hooks.get(event) or []
    if not isinstance(entries, list):
        continue
    remaining = [e for e in entries if not is_managed(e)]
    if len(remaining) != len(entries):
        if remaining:
            hooks[event] = remaining
        else:
            hooks.pop(event, None)
        print(f"De-registered stale Kaola-Workflow managed hook(s) under {event}.", file=sys.stderr)

if is_managed_subagent_statusline(settings.get("subagentStatusLine")):
    settings.pop("subagentStatusLine", None)
    print("Removed legacy Kaola subagentStatusLine; model badges now use explicit Agent model dispatch.", file=sys.stderr)

with open(settings_path, "w") as f:
    json.dump(settings, f, indent=2)
    f.write("\n")
print(f"Merged Kaola-Workflow settings into: {settings_path}")
PY
      SETTINGS_MERGE_RESULT=merged
    else
      SETTINGS_MERGE_RESULT=failed
    fi
  else
    echo "warning: python3 not found; skipping ~/.claude/settings.json auto-merge." >&2
    SETTINGS_MERGE_RESULT=no_python
  fi
fi

# #538 D4: write installed_paths into ~/.config/kaola-workflow/config.json via UNION read-modify-write.
# Adaptive is the unconditional default (implicit-always, never in installed_paths).
# Re-install unions existing installed_paths with the newly-requested opt-ins (never removes).
# Migrates away any stale enable_adaptive field from old installs.
KAOLA_CONFIG_DIR="$HOME/.config/kaola-workflow"
KAOLA_CONFIG_FILE="$KAOLA_CONFIG_DIR/config.json"
if command -v python3 >/dev/null 2>&1; then
  mkdir -p "$KAOLA_CONFIG_DIR"
  if python3 - "$KAOLA_CONFIG_FILE" "$EFFECTIVE_FAST" "$EFFECTIVE_FULL" <<'PY'; then
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
    echo "warning: failed to write $KAOLA_CONFIG_FILE; set installed_paths by hand: {\"parallel_mode\":\"auto\",\"installed_paths\":[]}" >&2
  fi
else
  echo "warning: python3 not found; cannot write $KAOLA_CONFIG_FILE. Add installed_paths:[] by hand." >&2
fi

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

# Report-only Claude dispatch-posture detection (agent teams vs. classic subagents). Mirrors the
# Codex installer's dispatch-posture report: NEVER fatal (always exits 0 into the caller), and
# NEVER writes any settings file — it only reads. A live session's CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
# is itself often sourced from a settings "env" block, so an explicit env var is authoritative
# when present; only when it is absent do we fall back to scanning the settings files' "env"
# blocks for the same flag (user settings, then project settings, then project-local settings).
detect_claude_dispatch_posture() {
  if [[ "${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-}" == "1" ]]; then
    echo "teams"
    return 0
  fi
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$HOME/.claude/settings.json" "$PWD/.claude/settings.json" "$PWD/.claude/settings.local.json" <<'PY'
import json, sys

for settings_path in sys.argv[1:]:
    try:
        with open(settings_path) as f:
            settings = json.load(f)
    except (OSError, json.JSONDecodeError):
        continue
    if not isinstance(settings, dict):
        continue
    env = settings.get("env")
    if isinstance(env, dict) and str(env.get("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS", "")) == "1":
        print("teams")
        sys.exit(0)
print("classic")
PY
    return 0
  fi
  echo "classic"
}

verification_failed=0
for command_file in "$SOURCE_COMMANDS_DIR"/*.md; do
  [[ -f "$command_file" ]] || continue
  # #538 D2: skip verification of fast/full files unless the effective opt-in is set.
  case "$(basename "$command_file")" in
    kaola-workflow-fast.md)
      [[ "$EFFECTIVE_FAST" -eq 1 ]] || continue ;;
    kaola-workflow-phase[1-5].md)
      [[ "$EFFECTIVE_FULL" -eq 1 ]] || continue ;;
  esac
  verify_installed_file "$COMMANDS_DIR/$(basename "$command_file")" "command" || verification_failed=1
done

for agent in "${REQUIRED_AGENTS[@]}"; do
  verify_installed_file "$AGENTS_DIR/$agent.md" "agent" || verification_failed=1
done

# #363: verify fails CLOSED for ALL forges. The prior `continue` skipped verification for
# gitlab/gitea when the SOURCE file was absent, so a typo'd allowlist entry installed nothing yet
# verified green (only github failed closed). The copy loops above now error on a missing source,
# so by here every allowlisted name must be present + executable on every forge.
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
if [[ ( "$FORGE" = "gitlab" || "$FORGE" = "gitea" ) && "$installed" -eq 0 ]]; then
  echo "${FORGE^} edition skeleton installed; runtime commands arrive in follow-up issues."
fi

echo ""
echo "Open any Claude Code session and run:  /workflow-init"
echo "Then run implementation cycles with:  /workflow-next"
echo ""
# #2 / D-542-01: planner-proven-disjoint parallel write frontiers are default-ON (no operator
# toggle). Per-leg worktree isolation + the mandatory synthesizer reconcile are the correctness net.
echo "Disjoint parallel writes are default-ON (set KAOLA_PARALLEL_WRITES=0 to force serial)."
echo ""

CLAUDE_DISPATCH_POSTURE="$(detect_claude_dispatch_posture)"
echo "Kaola-Workflow Claude dispatch posture:"
echo "  claude_dispatch_posture: $CLAUDE_DISPATCH_POSTURE"
if [[ "$CLAUDE_DISPATCH_POSTURE" = "teams" ]]; then
  echo "  Agent teams (experimental) is enabled — teammate-mode orchestration is available."
else
  echo "  Classic subagents (the Task tool) are always available — this needs no setup."
  echo "  Agent teams is an experimental Claude Code capability; to enable teammate-mode"
  echo "  orchestration, set CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 in your shell environment,"
  echo "  or in a settings \"env\" block (~/.claude/settings.json, project .claude/settings.json,"
  echo "  or .claude/settings.local.json)."
fi
echo ""
if [[ -f "$SUPPORT_HOOKS_DIR/hooks.json" ]]; then
  echo "Hooks installed to: $SUPPORT_HOOKS_DIR/hooks.json"
  case "$SETTINGS_MERGE_RESULT" in
    merged)
      echo "Kaola-Workflow hooks (compaction resume, pre-commit, subagent-dispatch-log)"
      echo "are now enabled in ~/.claude/settings.json."
      ;;
    skipped)
      echo "Auto-merge skipped (--no-settings-merge). To enable hooks, merge the block"
      echo "into your ~/.claude/settings.json by hand. Quick view:"
      echo "  cat $SUPPORT_HOOKS_DIR/hooks.json"
      ;;
    no_python)
      echo "python3 was not found, so settings were not auto-merged. To enable them,"
      echo "install python3 and re-run install.sh, or merge the block by hand:"
      echo "  cat $SUPPORT_HOOKS_DIR/hooks.json"
      ;;
    failed)
      echo "Auto-merge failed (see warning above). The settings were not added to"
      echo "~/.claude/settings.json. Fix the issue and re-run, or merge by hand:"
      echo "  cat $SUPPORT_HOOKS_DIR/hooks.json"
      ;;
  esac
  echo ""
fi
