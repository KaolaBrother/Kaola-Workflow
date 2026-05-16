#!/usr/bin/env bash
set -uo pipefail

GIT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
COORD_ROOT="$(git rev-parse --git-common-dir 2>/dev/null)" || COORD_ROOT=""
[ -n "$COORD_ROOT" ] && COORD_ROOT="$(cd "$GIT_ROOT" && realpath "$COORD_ROOT" 2>/dev/null)" || COORD_ROOT="$GIT_ROOT/.git"

export HOOK_INPUT
HOOK_INPUT="$(cat)"

# NOTE: do not name this INVOKED_CMD variable BASH_COMMAND — that name is a bash
# special variable that bash overwrites with the currently-executing command,
# which silently turns the case match below into a never-match.
INVOKED_CMD="$(node -e "
  try {
    const d = JSON.parse(process.env.HOOK_INPUT);
    process.stdout.write(d.tool_input && d.tool_input.command ? d.tool_input.command : '');
  } catch(e) { process.stdout.write(''); }
" 2>/dev/null)" || true

# If HOOK_INPUT was provided (Claude Code context), require it to be a git commit.
# If HOOK_INPUT is absent (direct git commit), fall through when KAOLA_SESSION_ID is set.
if [ -n "$HOOK_INPUT" ]; then
  case "$INVOKED_CMD" in
    *"git commit"*) ;;
    *) exit 0 ;;
  esac
fi

[ -z "${KAOLA_SESSION_ID:-}" ] && exit 0

STAGED="$(git -C "$GIT_ROOT" diff --cached --name-only 2>/dev/null)" || exit 0
[ -z "$STAGED" ] && exit 0

KW_PATHS="$(printf '%s\n' "$STAGED" \
  | grep '^kaola-workflow/' \
  | grep -v '^kaola-workflow/\.locks/' \
  | grep -v '^kaola-workflow/\.sessions/' \
  | grep -v '^kaola-workflow/archive/' \
  | grep -v '^kaola-workflow/\.roadmap/' \
  | grep -v '^kaola-workflow/ROADMAP\.md$')" || true

[ -z "$KW_PATHS" ] && exit 0

PROJECTS="$(printf '%s\n' "$KW_PATHS" \
  | awk -F'/' 'NF >= 3 { print $2 }' \
  | sort -u)" || true

PROJECT_COUNT="$(printf '%s\n' "$PROJECTS" | grep -c '.')" || PROJECT_COUNT=0

if [ "$PROJECT_COUNT" -gt 1 ]; then
  printf 'BLOCKED: split your commit — multiple kaola-workflow projects staged: %s\n' \
    "$(printf '%s\n' "$PROJECTS" | tr '\n' ' ')" >&2
  exit 2
fi

[ "$PROJECT_COUNT" -eq 0 ] && exit 0
PROJECT="$(printf '%s\n' "$PROJECTS" | head -1)"

LOCK_FILE="$COORD_ROOT/kaola-workflow/.locks/${PROJECT}.lock"
# Legacy fallback: if lock not found at COORD_ROOT path, try GIT_ROOT path
if [ ! -f "$LOCK_FILE" ]; then
  LOCK_FILE="$GIT_ROOT/kaola-workflow/.locks/${PROJECT}.lock"
fi
OWNER=""

if [ -f "$LOCK_FILE" ]; then
  OWNER="$(node -e "
    try {
      const d = JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));
      process.stdout.write(d.session_id || '');
    } catch(e) { process.stdout.write(''); }
  " "$LOCK_FILE" 2>/dev/null)" || true
fi

if [ -z "$OWNER" ]; then
  STATE_FILE="$GIT_ROOT/kaola-workflow/${PROJECT}/workflow-state.md"
  if [ -f "$STATE_FILE" ]; then
    OWNER="$(grep -m1 '^session_id:' "$STATE_FILE" | sed 's/^session_id:[[:space:]]*//')" || true
  fi
fi

[ -z "$OWNER" ] && exit 0

DERIVED_SID="$(node "$GIT_ROOT/scripts/kaola-workflow-claim.js" derive-session 2>/dev/null)" || DERIVED_SID=""
if [ -z "$DERIVED_SID" ]; then
  if [ "${KAOLA_ENFORCE_PLATFORM_SESSION:-}" = "1" ]; then
    printf 'BLOCKED: derive-session returned no identity under enforcement for project "%s". Cannot verify session ownership.\n' \
      "$PROJECT" >&2
    exit 2
  fi
  DERIVED_SID="${KAOLA_SESSION_ID:-}"
fi
if [ -n "$DERIVED_SID" ] && [ "$OWNER" != "$DERIVED_SID" ]; then
  printf 'BLOCKED: cross-session commit on project "%s". Lock held by %s; current session is %s (derived).\n' \
    "$PROJECT" "$OWNER" "$DERIVED_SID" >&2
  exit 2
fi

exit 0
