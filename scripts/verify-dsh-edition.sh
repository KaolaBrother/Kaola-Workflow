#!/usr/bin/env bash
# verify-dsh-edition.sh — human-facing smoke check for the Kaola-Workflow DSH edition.
#
# This script is READ-ONLY with respect to the user's DSH configuration. It NEVER writes
# ~/.dsh: the install half runs hermetically inside a throwaway HOME + DSH_HOME, so the
# shared global-contract transaction can only touch the throwaway tree. It checks:
#
#   1. `dsh` is on PATH and answers --version.
#   2. The shipped native surface (read-only) exposes the measured DSH tools: the
#      `subagent` / `subagent_fork` delegation tools plus the skill and agent-instructions
#      extensions. `--dump-default-config` composes and prints the tree WITHOUT booting a
#      session, so no model call is made.
#   3. A hermetic `install-dsh.sh --global` followed by `--check`, proving the edition
#      installs and verifies against source. The throwaway root is removed afterwards.
#   4. The user's own ~/.dsh `settings.yaml` / `.env` bytes (when present) are byte-identical
#      before and after — the edition writes only managed skills/`AGENTS.md`/support scripts.
#
# The rigorous automated acceptance suite is `node scripts/test-dsh-edition.js`; this script
# is the quick operator-facing gate, not a replacement for it.
#
# Usage:
#   ./scripts/verify-dsh-edition.sh [--forge=github|gitlab|gitea]
#
# To actually run the workflow under DSH after installing for real
# (`./install-dsh.sh --global --forge=github`), boot a session and invoke a skill:
#
#   dsh --profile headless "Use /workflow-next to continue the Kaola-Workflow mission."

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd -- "$SCRIPT_DIR/.." && pwd)"
FORGE="github"

for arg in "$@"; do
  case "$arg" in
    --forge=*) FORGE="${arg#*=}" ;;
    -h|--help)
      sed -n '2,30p' "${BASH_SOURCE[0]}"
      exit 0 ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

fail() { echo "verify-dsh-edition: FAIL — $*" >&2; exit 1; }

# --- 1. dsh on PATH ---------------------------------------------------------
command -v dsh >/dev/null 2>&1 || fail "'dsh' is not on PATH (install the DeepSeek Harness CLI)"
DSH_VERSION="$(dsh --version 2>/dev/null | head -n1 || true)"
[[ -n "$DSH_VERSION" ]] || fail "dsh --version produced no output"
echo "dsh on PATH: $(command -v dsh) (version ${DSH_VERSION})"

# --- 2. read-only native-surface probe -------------------------------------
DUMP="$(dsh --profile headless --dump-default-config 2>/dev/null || true)"
[[ -n "$DUMP" ]] || fail "dsh --profile headless --dump-default-config produced no output"
for needle in subagent subagent_fork skill agent-instructions; do
  printf '%s' "$DUMP" | grep -qi -- "$needle" \
    || fail "the shipped headless config no longer names the '$needle' surface"
done
echo "native surface: subagent, subagent_fork, skill, agent-instructions present (read-only dump)"

# --- 3. hermetic install + check (never touches ~/.dsh) --------------------
USER_DSH="${HOME}/.dsh"
user_hash() {
  [[ -f "$1" ]] || { printf 'absent'; return; }
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}';
  else cksum "$1" | awk '{print $1":"$2}'; fi
}
BEFORE_SETTINGS="$(user_hash "$USER_DSH/settings.yaml")"
BEFORE_ENV="$(user_hash "$USER_DSH/.env")"

STAGE="$(mktemp -d "${TMPDIR:-/tmp}/kw-dsh-verify.XXXXXX")"
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

HERMETIC_HOME="$STAGE/home"
mkdir -p "$HERMETIC_HOME"

env HOME="$HERMETIC_HOME" DSH_HOME="$HERMETIC_HOME/.dsh" \
  bash "$REPO/install-dsh.sh" --global --forge="$FORGE" >/dev/null \
  || fail "hermetic install-dsh.sh --global --forge=$FORGE returned non-zero"

env HOME="$HERMETIC_HOME" DSH_HOME="$HERMETIC_HOME/.dsh" \
  bash "$REPO/install-dsh.sh" --global --forge="$FORGE" --check >/dev/null \
  || fail "hermetic install-dsh.sh --check returned non-zero after install"

HOME_ROOT="$HERMETIC_HOME/.dsh"
for forbidden in settings.yaml .env .credentials.yaml hooks.json; do
  [[ ! -e "$HOME_ROOT/$forbidden" ]] || fail "edition wrote a user-owned surface: $forbidden"
done
[[ -f "$HOME_ROOT/AGENTS.md" ]] || fail "hermetic install did not write the managed AGENTS.md carrier"
for name in workflow-init workflow-next kaola-workflow-finalize; do
  [[ -f "$HOME_ROOT/skills/$name/SKILL.md" ]] || fail "hermetic install missing skill $name"
done
echo "hermetic install + check: skills, AGENTS.md carrier, support scripts verified under a throwaway DSH_HOME"

# --- 4. user DSH config untouched ------------------------------------------
AFTER_SETTINGS="$(user_hash "$USER_DSH/settings.yaml")"
AFTER_ENV="$(user_hash "$USER_DSH/.env")"
[[ "$BEFORE_SETTINGS" == "$AFTER_SETTINGS" ]] || fail "user ~/.dsh/settings.yaml changed"
[[ "$BEFORE_ENV" == "$AFTER_ENV" ]] || fail "user ~/.dsh/.env changed"
echo "user DSH config untouched: ~/.dsh/settings.yaml and ~/.dsh/.env unchanged"

echo "verify-dsh-edition: PASS"
echo "Next (real install + trigger):"
echo "  ./install-dsh.sh --global --forge=$FORGE"
echo "  dsh --profile headless \"Use /workflow-next to continue the Kaola-Workflow mission.\""
