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

FORGE="github"
PROFILE="higher"
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
  --forge=github|gitlab|gitea   Forge for the Claude installer (default: github)
  --profile=higher|common       Agent profile for the Claude installer (default: higher)
  --global                      Install opencode/Codex/Kimi into the global config root (default)
  --project[=DIR]               Install opencode/Codex/Kimi into a project dir (default: CWD)
  --yes                         Non-interactive; forward -y to every interactive installer
  --skip=RUNTIME[,RUNTIME...]   Skip named runtimes (claude,opencode,codex,kimi) — logged loudly
  --strict                      Fail-fast: stop at the first failing runtime
  --check                       Dry run: print HEAD + the command each runtime would run; no changes
  -h, --help                    Show this help

The Claude installer (install.sh) has no global/project concept — it installs
its plugin regardless of scope; --global/--project apply to the other three.
The Codex installer accepts neither --yes nor --forge/--profile, so those are
not forwarded to it. Exit status is non-zero if ANY runtime failed
(continue-through by default; --strict aborts at the first failure).
EOF
}

die_arg() { echo "install-all: $1" >&2; usage >&2; exit 2; }

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --forge=*) FORGE="${1#--forge=}"; shift ;;
    --forge) [[ -n "${2:-}" ]] || die_arg "--forge requires github, gitlab, or gitea"; FORGE="$2"; shift 2 ;;
    --profile=*) PROFILE="${1#--profile=}"; shift ;;
    --profile) [[ -n "${2:-}" ]] || die_arg "--profile requires common or higher"; PROFILE="$2"; shift 2 ;;
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
case "$PROFILE" in higher|common) ;; *) die_arg "unknown profile: $PROFILE (higher, common)" ;; esac

is_skipped() {
  local name="$1" s
  if [[ ${#SKIP[@]} -gt 0 ]]; then
    for s in "${SKIP[@]}"; do [[ "$s" == "$name" ]] && return 0; done
  fi
  return 1
}

# Result accumulators, indexed in RUNTIMES order.
R_STATUS=()
R_CODE=()

HEAD_SHA="$( (cd "$ROOT" && git rev-parse --short HEAD) 2>/dev/null || echo unknown )"

print_summary() {
  local i n st code any_fail=0
  echo ""
  echo "================ install-all summary ($HEAD_SHA) ================"
  for i in "${!RUNTIMES[@]}"; do
    n="${RUNTIMES[$i]}"
    st="${R_STATUS[$i]:-NOT-RUN}"
    code="${R_CODE[$i]:--}"
    printf '  %-10s %-8s (exit %s)\n' "$n" "$st" "$code"
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
    R_STATUS+=("SKIP"); R_CODE+=("-")
    return 0
  fi
  echo ""
  echo ">>> [$name] $*"
  if [[ "$CHECK" == "1" ]]; then
    R_STATUS+=("PLAN"); R_CODE+=("-")
    return 0
  fi
  local logf rc
  logf="$(mktemp "${TMPDIR:-/tmp}/kaola-install-all-$name.XXXXXX")"
  "$@" 2>&1 | tee "$logf"
  rc=${PIPESTATUS[0]}
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

echo "install-all: reinstalling Kaola-Workflow runtimes from $HEAD_SHA"
echo "install-all: root=$ROOT scope=$SCOPE forge=$FORGE profile=$PROFILE$( [[ "$YES" == "1" ]] && echo ' yes' )$( [[ "$CHECK" == "1" ]] && echo ' (dry-run)' )"

# Per-runtime scope flags for the three additive runtimes (install.sh has no
# global/project concept, so it never receives them).
if [[ "$SCOPE" == "global" ]]; then
  OC_SCOPE=(--global);            KIMI_SCOPE=(--global);            CODEX_SCOPE=(--global)
else
  OC_SCOPE=(--target "$PROJECT_DIR"); KIMI_SCOPE=(--target "$PROJECT_DIR"); CODEX_SCOPE=("$PROJECT_DIR")
fi

# Build each runtime's command as a non-empty array (bash-3.2 set -u safe:
# optional flags are appended conditionally, never expanded from an empty array).
CLAUDE_CMD=(bash "$ROOT/install.sh" --forge="$FORGE" --profile="$PROFILE")
[[ "$YES" == "1" ]] && CLAUDE_CMD+=(--yes)

OPENCODE_CMD=(bash "$ROOT/install-opencode.sh" "${OC_SCOPE[@]}")
[[ "$YES" == "1" ]] && OPENCODE_CMD+=(--yes)

# Codex installer accepts neither --yes nor --forge/--profile (unknown args are
# ignored there, but we keep the invocation to its documented flag set).
CODEX_CMD=(node "$ROOT/plugins/kaola-workflow/scripts/install-codex-agent-profiles.js" "${CODEX_SCOPE[@]}")

KIMI_CMD=(bash "$ROOT/install-kimi.sh" "${KIMI_SCOPE[@]}")
[[ "$YES" == "1" ]] && KIMI_CMD+=(--yes)

run_one claude   "${CLAUDE_CMD[@]}"
run_one opencode "${OPENCODE_CMD[@]}"
run_one codex    "${CODEX_CMD[@]}"
run_one kimi     "${KIMI_CMD[@]}"

print_summary
overall=$?
if [[ "$overall" -ne 0 ]]; then
  echo "install-all: one or more runtimes FAILED (see summary above)" >&2
  exit 1
fi
if [[ "$CHECK" == "1" ]]; then
  echo "install-all: dry-run complete — no changes made"
else
  echo "install-all: all runtimes OK"
fi
exit 0
