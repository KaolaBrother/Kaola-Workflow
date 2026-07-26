#!/usr/bin/env bash
# install-all.sh — one entrypoint that reinstalls/refreshes ALL FOUR runtime
# editions in sequence, with a per-runtime PASS/FAIL summary.
#
# This is a THIN ORCHESTRATOR, not a coupling: it CALLS each installer unchanged
# and never folds the additive editions (opencode/kimi) into install.sh,
# edition-sync.js, npm test, or the six routing surfaces. The additive-edition
# boundary (D-530-02) is preserved — the four editions stay independently
# installable and independently tested. The only thing this script adds is a
# single loud entrypoint so a runtime can never be silently dropped (the exact
# failure mode that repeatedly lost Kimi on "reinstall the runtimes" passes).
#
# PASS MEANS CONVERGED, NOT "EXITED 0". Codex is the one runtime whose install is
# genuinely two-part: agent profiles (install-codex-agent-profiles.js) PLUS the
# marketplace plugin that carries the skill packs. That plugin cache is
# VERSION-KEYED, so a tree bump keeps serving the previously-added version until
# the plugin is re-added — an installer exit 0 is not evidence the runtime is at
# HEAD. converge_codex_plugin() closes that gap: it compares the installed plugin
# version against the tree's .codex-plugin/plugin.json (NEVER package.json — the
# Codex plugin version is deliberately a different number from the repo version),
# refreshes on mismatch, and RE-READS afterwards so a refresh that did not take
# cannot report green. Absent tooling is not a failed convergence: a missing codex
# CLI or an unregistered marketplace degrades to PARTIAL-with-reason, never a
# bare PASS and never a wrapper failure.
#
# NOT using `set -e`: a failed installer must NOT abort the wrapper in the
# default continue-through mode — every runtime is attempted and reported.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# KAOLA_INSTALL_ALL_ROOT overrides the tree the installers are resolved from.
# Test seam ONLY (scripts/test-install-all.js points it at stub installers);
# production always resolves to this script's own directory.
ROOT="${KAOLA_INSTALL_ALL_ROOT:-$SCRIPT_DIR}"

# Ordered runtime list — the single source of truth this script iterates and the
# contract test (scripts/test-install-all.js) cross-checks against the tree.
RUNTIMES=(claude opencode codex kimi)

# Codex marketplace-plugin convergence inputs.
# KAOLA_CODEX_BIN is a test seam ONLY (scripts/test-install-all.js points it at a
# stub CLI so no chain result depends on a host-installed codex); production
# always resolves the `codex` on PATH.
CODEX_BIN="${KAOLA_CODEX_BIN:-codex}"
# The Codex plugin version + NAME source. It is the .codex-plugin manifest, NOT
# package.json: repo v7.0.0 ships Codex plugin 5.0.0, so package.json is the wrong
# number and would force a permanent false mismatch.
#
# BOTH the manifest path and the plugin name are DERIVED from the selected forge,
# never hardcoded: the gitlab/gitea manifests declare `kaola-workflow-gitlab` /
# `kaola-workflow-gitea`, so a hardcoded `kaola-workflow` matched no installed row
# on those editions and convergence silently found nothing to check. The
# marketplace half of the plugin id is still never derived here — it is read back
# from the installed row, so a user-chosen marketplace name still converges.
# Resolved after argument parsing (FORGE is not known yet at this point).
CODEX_PLUGIN_MANIFEST=""
CODEX_PLUGIN_NAME=""
# Wall-clock ceiling for the `codex plugin list --json` read. A hung CLI must not
# hang install-all.sh unbounded; the read is treated as unverifiable instead.
CODEX_LIST_TIMEOUT_SECS="${KAOLA_CODEX_LIST_TIMEOUT_SECS:-60}"
# Ceiling for the MUTATING plugin calls (remove/add). Generous — a real `add`
# fetches over the network — but still bounded.
CODEX_PLUGIN_OP_TIMEOUT_SECS="${KAOLA_CODEX_PLUGIN_OP_TIMEOUT_SECS:-900}"
# Set when marketplace-plugin convergence is NOT APPLICABLE (absent tooling) as
# opposed to UNVERIFIED (a real check that could not be completed).
CODEX_CONVERGENCE_NA=0
CODEX_CONVERGENCE_NA_REASON=""

FORGE="github"
SCOPE="global"        # global | project
PROJECT_DIR=""
YES=0
STRICT=0
CHECK=0
SKIP=()

usage() {
  cat <<'EOF'
Usage: ./install-all.sh [options]

Reinstall/refresh every Kaola-Workflow runtime edition in sequence:
  1. claude    Claude Code   (install.sh)
  2. opencode  opencode      (install-opencode.sh)
  3. codex     Codex         (install-codex-agent-profiles.js)
  4. kimi      Kimi Code     (install-kimi.sh)

Options:
  --forge=github|gitlab|gitea   Forge for every forge-aware runtime (default: github).
                                Threaded to Claude, opencode, and Kimi Code. Codex
                                selects its forge by marketplace plugin entry instead.
  --global                      Install opencode/Codex/Kimi into the global config root (default)
  --project[=DIR]               Install opencode/Codex/Kimi into a project dir (default: CWD)
  --yes                         Non-interactive; forward -y to every interactive installer
  --skip=RUNTIME[,RUNTIME...]   Skip named runtimes (claude,opencode,codex,kimi) — logged loudly
  --strict                      Fail-fast: stop at the first failing runtime
  --check                       Dry run: print HEAD + the command each runtime would run,
                                and report a pending Codex plugin upgrade; no changes
  -h, --help                    Show this help

The Claude installer (install.sh) has no global/project concept — it installs
its plugin regardless of scope; --global/--project apply to the other three.
The Codex installer accepts neither --yes nor --forge, so those are
not forwarded to it; Codex picks its forge by which marketplace plugin entry
you add (kaola-workflow, -gitlab, -gitea). Exit status is non-zero if ANY runtime failed
(continue-through by default; --strict aborts at the first failure).

Codex is installed in two parts: the agent profiles (the installer above) and the
marketplace plugin that carries the skill packs. The plugin cache is version-keyed,
so after the profiles land this wrapper compares the installed plugin version with
the tree's plugins/kaola-workflow/.codex-plugin/plugin.json and, on a mismatch,
refreshes the plugin (remove + add) and re-reads the version to prove it took.

Summary statuses:
  PASS     installer succeeded and (for codex) the marketplace plugin is at the tree
           version, OR that check does not apply here (no codex CLI installed) — an
           inapplicable check always prints its reason on the row, never a bare PASS
  FAIL     installer failed, or a codex plugin refresh was attempted and did not converge
  PARTIAL  installer succeeded but a check that DOES apply could not be completed
           (reason printed); never a bare PASS, never a wrapper failure
  SKIP     skipped via --skip
  PLAN     --check dry run
  NOT-RUN  not reached (--strict aborted earlier)

Absent tooling is NOT a detected mismatch: with no `codex` CLI on PATH there is no
marketplace plugin to converge, so the run reports NOT APPLICABLE and stays green
rather than reporting a permanently UNVERIFIED box. The `codex plugin list` read is
bounded by KAOLA_CODEX_LIST_TIMEOUT_SECS (default 60) so a hung CLI cannot hang
this wrapper.
EOF
}

die_arg() { echo "install-all: $1" >&2; usage >&2; exit 2; }

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --forge=*) FORGE="${1#--forge=}"; shift ;;
    --forge) [[ -n "${2:-}" ]] || die_arg "--forge requires github, gitlab, or gitea"; FORGE="$2"; shift 2 ;;
    --global) SCOPE="global"; PROJECT_DIR=""; shift ;;
    --project) SCOPE="project"; PROJECT_DIR="$PWD"; shift ;;
    --project=*) SCOPE="project"; PROJECT_DIR="${1#--project=}"; shift ;;
    -y|--yes) YES=1; shift ;;
    --strict) STRICT=1; shift ;;
    --check) CHECK=1; shift ;;
    --skip=*) IFS=',' read -r -a _skip_parts <<< "${1#--skip=}"; [[ ${#_skip_parts[@]} -gt 0 ]] && SKIP+=("${_skip_parts[@]}"); shift ;;
    --skip) [[ -n "${2:-}" ]] || die_arg "--skip requires a runtime name"; IFS=',' read -r -a _skip_parts <<< "$2"; [[ ${#_skip_parts[@]} -gt 0 ]] && SKIP+=("${_skip_parts[@]}"); shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) die_arg "Unknown argument: $1" ;;
  esac
done

case "$FORGE" in github|gitlab|gitea) ;; *) die_arg "unknown forge: $FORGE (github, gitlab, gitea)" ;; esac

# Forge-derived Codex plugin manifest. The plugin NAME is read out of it below
# (codex_tree_plugin_name), never assumed from this path.
case "$FORGE" in
  github) CODEX_PLUGIN_DIR="plugins/kaola-workflow" ;;
  gitlab) CODEX_PLUGIN_DIR="plugins/kaola-workflow-gitlab" ;;
  gitea)  CODEX_PLUGIN_DIR="plugins/kaola-workflow-gitea" ;;
esac
CODEX_PLUGIN_MANIFEST="$ROOT/$CODEX_PLUGIN_DIR/.codex-plugin/plugin.json"

is_skipped() {
  local name="$1" s
  if [[ ${#SKIP[@]} -gt 0 ]]; then
    for s in "${SKIP[@]}"; do [[ "$s" == "$name" ]] && return 0; done
  fi
  return 1
}

# Result accumulators, indexed in RUNTIMES order. R_NOTE carries a per-runtime
# reason string so a non-PASS status is never silent (and a PASS can carry the
# converged plugin version).
R_STATUS=()
R_CODE=()
R_NOTE=()

HEAD_SHA="$( (cd "$ROOT" && git rev-parse --short HEAD) 2>/dev/null || echo unknown )"

runtime_index() {
  local want="$1" i
  for i in "${!RUNTIMES[@]}"; do
    if [[ "${RUNTIMES[$i]}" == "$want" ]]; then printf '%s\n' "$i"; return 0; fi
  done
  return 1
}

print_summary() {
  local i n st code note any_fail=0
  echo ""
  echo "================ install-all summary ($HEAD_SHA) ================"
  for i in "${!RUNTIMES[@]}"; do
    n="${RUNTIMES[$i]}"
    st="${R_STATUS[$i]:-NOT-RUN}"
    code="${R_CODE[$i]:--}"
    note="${R_NOTE[$i]:-}"
    if [[ -n "$note" ]]; then
      printf '  %-10s %-8s (exit %s)  — %s\n' "$n" "$st" "$code" "$note"
    else
      printf '  %-10s %-8s (exit %s)\n' "$n" "$st" "$code"
    fi
    [[ "$st" == "FAIL" ]] && any_fail=1
  done
  echo "================================================================"
  return "$any_fail"
}

run_one() {
  local name="$1"; shift
  if is_skipped "$name"; then
    echo ""
    echo ">>> [$name] SKIPPED (--skip=$name)"
    R_STATUS+=("SKIP"); R_CODE+=("-"); R_NOTE+=("")
    return 0
  fi
  echo ""
  echo ">>> [$name] $*"
  if [[ "$CHECK" == "1" ]]; then
    R_STATUS+=("PLAN"); R_CODE+=("-"); R_NOTE+=("")
    return 0
  fi
  local logf rc
  logf="$(mktemp "${TMPDIR:-/tmp}/kaola-install-all-$name.XXXXXX")"
  "$@" 2>&1 | tee "$logf"
  rc=${PIPESTATUS[0]}
  R_NOTE+=("")
  if [[ "$rc" -eq 0 ]]; then
    R_STATUS+=("PASS"); R_CODE+=("$rc")
  else
    R_STATUS+=("FAIL"); R_CODE+=("$rc")
    echo "" >&2
    echo "!!! [$name] FAILED with exit code $rc" >&2
    echo "--- last output ($name) ---" >&2
    tail -n 20 "$logf" >&2
    echo "---------------------------" >&2
    if [[ "$STRICT" == "1" ]]; then
      rm -f "$logf"
      print_summary
      echo "install-all: --strict abort after '$name' failed (exit $rc)" >&2
      exit 1
    fi
  fi
  rm -f "$logf"
}

# ---------------------------------------------------------------------------
# Codex marketplace-plugin convergence.
#
# install-codex-agent-profiles.js deploys AGENT PROFILES only. The skill packs
# ship through the local marketplace plugin, whose cache is keyed by version
# (~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/), so a tree bump keeps
# serving the previously-added version forever. The wrapper — not the profile
# installer — owns the "is this runtime at HEAD" question, so the check lives here
# and install-codex-agent-profiles.js stays a pure agent-profile installer.
# ---------------------------------------------------------------------------

# Print one string field declared by the TREE plugin manifest (.codex-plugin/plugin.json).
# Exits non-zero (printing nothing) when the manifest is missing or the field is absent.
codex_plugin_manifest_field() {
  local field="$1"
  [[ -f "$CODEX_PLUGIN_MANIFEST" ]] || return 1
  node -e '
    const fs = require("fs");
    let v;
    try { v = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))[process.argv[2]]; } catch (e) { process.exit(1); }
    if (typeof v !== "string" || !v) process.exit(1);
    process.stdout.write(v);
  ' "$CODEX_PLUGIN_MANIFEST" "$field" 2>/dev/null
}

codex_tree_plugin_version() { codex_plugin_manifest_field version; }
# The plugin NAME the tree declares. Derived, never hardcoded — the forge editions
# declare kaola-workflow-gitlab / kaola-workflow-gitea.
codex_tree_plugin_name() { codex_plugin_manifest_field name; }

# Run "$@" under a hard wall-clock ceiling. Returns the command's own exit status,
# or 124 (the conventional timeout status) when the ceiling fired. No `timeout(1)`
# dependency: that is GNU coreutils and absent on a stock macOS box.
#
# Job control (`set -m`) is enabled around the launches so each background job is
# its OWN process group and the watchdog can signal the whole group. A plain
# `kill <pid>` reaches only the wrapper process, and a CLI blocked in a child (the
# common wrapper-script shape) would outlive the ceiling entirely. The watchdog's
# stdout is closed off so it can never hold a caller's capture open.
run_bounded() {
  local secs="$1"; shift
  local flagdir flag cmd_pid watch_pid rc=0 restore_monitor=0
  flagdir="$(mktemp -d)"
  flag="$flagdir/timed-out"
  case "$-" in *m*) ;; *) set -m; restore_monitor=1 ;; esac
  "$@" &
  cmd_pid=$!
  (
    sleep "$secs"
    if kill -0 "$cmd_pid" 2>/dev/null; then
      : > "$flag"
      kill -TERM -"$cmd_pid" 2>/dev/null || kill -TERM "$cmd_pid" 2>/dev/null
      sleep 2
      kill -KILL -"$cmd_pid" 2>/dev/null || kill -KILL "$cmd_pid" 2>/dev/null
    fi
  ) >/dev/null 2>&1 &
  watch_pid=$!
  [[ "$restore_monitor" -eq 0 ]] || set +m
  wait "$cmd_pid" 2>/dev/null || rc=$?
  kill -TERM -"$watch_pid" 2>/dev/null || kill -TERM "$watch_pid" 2>/dev/null
  wait "$watch_pid" 2>/dev/null || true
  if [[ -e "$flag" ]]; then rc=124; fi
  rm -rf "$flagdir"
  return "$rc"
}

# Print "<installed-version>\t<pluginId>" for the single installed kaola-workflow
# plugin row. Non-zero (printing nothing) when the CLI errors, hangs past the
# ceiling (124), the output is not parseable (3), the plugin is not installed (4),
# or more than one marketplace serves it (5).
codex_installed_plugin_row() {
  local listing rc=0 outfile
  # The listing is captured through a temp FILE, not a command substitution: a
  # `$(...)` around a bounded call stays open until every descendant that inherited
  # the pipe exits, so a CLI that forks a stuck child would defeat the ceiling.
  outfile="$(mktemp)"
  run_bounded "$CODEX_LIST_TIMEOUT_SECS" "$CODEX_BIN" plugin list --json >"$outfile" 2>/dev/null || rc=$?
  listing="$(cat "$outfile")"
  rm -f "$outfile"
  if [[ "$rc" -ne 0 ]]; then
    if [[ "$rc" -eq 124 ]]; then return 124; fi
    return 1
  fi
  printf '%s' "$listing" | node -e '
    const chunks = [];
    process.stdin.on("data", d => chunks.push(d));
    process.stdin.on("end", () => {
      let doc;
      try { doc = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch (e) { process.exit(3); }
      const want = process.argv[1];
      const rows = (doc && Array.isArray(doc.installed) ? doc.installed : [])
        .filter(r => r && r.name === want && r.installed !== false);
      if (rows.length === 0) process.exit(4);
      if (rows.length > 1) process.exit(5);
      const row = rows[0];
      const id = row.pluginId || (row.name + "@" + (row.marketplaceName || ""));
      process.stdout.write(String(row.version || "") + "\t" + id);
    });
  ' "$CODEX_PLUGIN_NAME"
}

# Record an UNVERIFIED outcome: a check that genuinely applies here but could not be
# completed (the CLI is present but errored/hung, the listing was unparseable, the
# plugin is not installed, or the tree manifest is unreadable). Under --check the row
# stays PLAN (a dry run states, never grades); otherwise the row drops from PASS to
# PARTIAL so an unverifiable runtime can never read as a bare PASS.
codex_degrade() {
  local idx="$1" reason="$2"
  R_NOTE[$idx]="$reason"
  if [[ "$CHECK" != "1" ]]; then
    R_STATUS[$idx]="PARTIAL"
  fi
}

# Record a NOT-APPLICABLE outcome — distinct from UNVERIFIED. Absent tooling is not
# a detected mismatch: with no `codex` CLI on PATH there is no marketplace plugin to
# converge, so there is nothing this wrapper could check and nothing degraded. The
# row keeps its installer verdict (the agent profiles DID install) and carries the
# reason so it is never a BARE pass, but the box is not reported as permanently
# degraded the way a standing PARTIAL/UNVERIFIED did.
codex_not_applicable() {
  local idx="$1" reason="$2"
  R_NOTE[$idx]="$reason"
  if [[ "$CHECK" != "1" ]]; then
    CODEX_CONVERGENCE_NA=1
    CODEX_CONVERGENCE_NA_REASON="$reason"
  fi
}

converge_codex_plugin() {
  local idx tree row installed plugin_id after
  idx="$(runtime_index codex)" || return 0
  if is_skipped codex; then return 0; fi
  if [[ "${R_STATUS[$idx]:-}" == "FAIL" ]]; then
    R_NOTE[$idx]="plugin convergence not attempted (agent-profile installer failed)"
    return 0
  fi

  if ! tree="$(codex_tree_plugin_version)"; then
    echo ""
    echo ">>> [codex] plugin convergence SKIPPED: no readable version in $CODEX_PLUGIN_MANIFEST"
    codex_degrade "$idx" "plugin convergence skipped: unreadable .codex-plugin/plugin.json"
    return 0
  fi

  if ! CODEX_PLUGIN_NAME="$(codex_tree_plugin_name)"; then
    echo ""
    echo ">>> [codex] plugin convergence SKIPPED: no readable plugin name in $CODEX_PLUGIN_MANIFEST"
    codex_degrade "$idx" "plugin convergence skipped: unreadable plugin name in .codex-plugin/plugin.json"
    return 0
  fi

  # ABSENT TOOLING, not a detected mismatch. A box with no codex CLI has no
  # marketplace plugin at all, so there is nothing to converge — reporting it as
  # permanently UNVERIFIED was noise, not a signal.
  if ! command -v "$CODEX_BIN" >/dev/null 2>&1; then
    echo ""
    echo ">>> [codex] marketplace-plugin convergence NOT APPLICABLE: '$CODEX_BIN' CLI not found (tree plugin $tree)"
    codex_not_applicable "$idx" "marketplace-plugin convergence N/A: codex CLI not found (tree $tree)"
    return 0
  fi

  local rowrc=0
  row="$(codex_installed_plugin_row)" || rowrc=$?
  if [[ "$rowrc" -ne 0 ]]; then
    local why
    case "$rowrc" in
      124) why="'$CODEX_BIN plugin list' timed out after ${CODEX_LIST_TIMEOUT_SECS}s" ;;
      4)   why="plugin not installed from a codex marketplace" ;;
      5)   why="more than one marketplace serves '$CODEX_PLUGIN_NAME'" ;;
      *)   why="could not read the installed plugin list" ;;
    esac
    echo ""
    echo ">>> [codex] plugin convergence SKIPPED: $why — no single installed '$CODEX_PLUGIN_NAME' marketplace plugin (tree plugin $tree)"
    codex_degrade "$idx" "plugin convergence skipped: $why (tree $tree)"
    return 0
  fi
  installed="${row%%$'\t'*}"
  plugin_id="${row#*$'\t'}"

  if [[ "$installed" == "$tree" ]]; then
    echo ""
    echo ">>> [codex] marketplace plugin already at $tree ($plugin_id)"
    R_NOTE[$idx]="plugin $tree"
    return 0
  fi

  if [[ "$CHECK" == "1" ]]; then
    echo ""
    echo ">>> [codex] PENDING marketplace plugin upgrade: $installed -> $tree ($plugin_id)"
    R_NOTE[$idx]="plugin upgrade pending: $installed -> $tree"
    return 0
  fi

  echo ""
  echo ">>> [codex] marketplace plugin STALE: $installed -> $tree — refreshing $plugin_id"
  # `remove` is best-effort: `add` is the step that must succeed, and a remove that
  # fails on an already-absent entry must not mask the real outcome. Both are
  # bounded too — generously, since a real `add` fetches over the network — so no
  # codex invocation this wrapper makes can hang it indefinitely.
  run_bounded "$CODEX_PLUGIN_OP_TIMEOUT_SECS" "$CODEX_BIN" plugin remove "$plugin_id" || true
  if ! run_bounded "$CODEX_PLUGIN_OP_TIMEOUT_SECS" "$CODEX_BIN" plugin add "$plugin_id"; then
    echo "!!! [codex] 'codex plugin add $plugin_id' failed — plugin still at $installed (tree $tree)" >&2
    R_STATUS[$idx]="FAIL"
    R_NOTE[$idx]="plugin convergence FAILED: still $installed, tree $tree"
    return 1
  fi
  # RE-READ: a refresh that exits 0 without moving the version is exactly the false
  # green this whole step exists to prevent, so convergence is proven, not assumed.
  if ! row="$(codex_installed_plugin_row)"; then
    echo "!!! [codex] plugin absent after re-add — cannot confirm convergence to $tree" >&2
    R_STATUS[$idx]="FAIL"
    R_NOTE[$idx]="plugin convergence FAILED: plugin absent after re-add (tree $tree)"
    return 1
  fi
  after="${row%%$'\t'*}"
  if [[ "$after" != "$tree" ]]; then
    echo "!!! [codex] plugin still reports $after after refresh (tree $tree) — NOT converged" >&2
    R_STATUS[$idx]="FAIL"
    R_NOTE[$idx]="plugin convergence FAILED: still $after, tree $tree"
    return 1
  fi
  echo ">>> [codex] marketplace plugin converged: $installed -> $after"
  R_NOTE[$idx]="plugin $installed -> $after"
  return 0
}

echo "install-all: reinstalling Kaola-Workflow runtimes from $HEAD_SHA"
echo "install-all: root=$ROOT scope=$SCOPE forge=$FORGE$( [[ "$YES" == "1" ]] && echo ' yes' )$( [[ "$CHECK" == "1" ]] && echo ' (dry-run)' )"

# Per-runtime scope flags for the three additive runtimes (install.sh has no
# global/project concept, so it never receives them).
if [[ "$SCOPE" == "global" ]]; then
  OC_SCOPE=(--global);            KIMI_SCOPE=(--global);            CODEX_SCOPE=(--global)
else
  OC_SCOPE=(--target "$PROJECT_DIR"); KIMI_SCOPE=(--target "$PROJECT_DIR"); CODEX_SCOPE=("$PROJECT_DIR")
fi

# Build each runtime's command as a non-empty array (bash-3.2 set -u safe:
# optional flags are appended conditionally, never expanded from an empty array).
CLAUDE_CMD=(bash "$ROOT/install.sh" --forge="$FORGE")
[[ "$YES" == "1" ]] && CLAUDE_CMD+=(--yes)

OPENCODE_CMD=(bash "$ROOT/install-opencode.sh" --forge="$FORGE" "${OC_SCOPE[@]}")
[[ "$YES" == "1" ]] && OPENCODE_CMD+=(--yes)

# Codex installer accepts neither --yes nor --forge (unknown args are
# ignored there, but we keep the invocation to its documented flag set).
CODEX_CMD=(node "$ROOT/plugins/kaola-workflow/scripts/install-codex-agent-profiles.js" "${CODEX_SCOPE[@]}")

KIMI_CMD=(bash "$ROOT/install-kimi.sh" --forge="$FORGE" "${KIMI_SCOPE[@]}")
[[ "$YES" == "1" ]] && KIMI_CMD+=(--yes)

run_one claude   "${CLAUDE_CMD[@]}"
run_one opencode "${OPENCODE_CMD[@]}"
run_one codex    "${CODEX_CMD[@]}"
if ! converge_codex_plugin && [[ "$STRICT" == "1" ]]; then
  print_summary
  echo "install-all: --strict abort after codex marketplace-plugin convergence failed" >&2
  exit 1
fi
run_one kimi     "${KIMI_CMD[@]}"

print_summary
overall=$?
if [[ "$overall" -ne 0 ]]; then
  echo "install-all: one or more runtimes FAILED (see summary above)" >&2
  exit 1
fi
any_partial=0
for _i in "${!RUNTIMES[@]}"; do
  [[ "${R_STATUS[$_i]:-}" == "PARTIAL" ]] && any_partial=1
done
if [[ "$CHECK" == "1" ]]; then
  echo "install-all: dry-run complete — no changes made"
elif [[ "$any_partial" -eq 1 ]]; then
  # Never print the all-clear over a runtime whose convergence could not be
  # verified: an unverified runtime is the false green this wrapper must not emit.
  echo "install-all: installers OK, but convergence is UNVERIFIED for one or more runtimes (see PARTIAL rows above)"
elif [[ "$CODEX_CONVERGENCE_NA" -eq 1 ]]; then
  # NOT APPLICABLE is not UNVERIFIED. Nothing was checkable and nothing is degraded,
  # so this is the all-clear — with the reason named so it is never a bare green.
  echo "install-all: all runtimes OK — $CODEX_CONVERGENCE_NA_REASON (NOT APPLICABLE, not a detected mismatch)"
else
  echo "install-all: all runtimes OK"
fi
exit 0
