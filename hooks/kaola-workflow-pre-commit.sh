#!/usr/bin/env bash
set -uo pipefail

GIT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0

export HOOK_INPUT
HOOK_INPUT="$(cat)"

BASH_COMMAND="$(node -e "
  try {
    const d = JSON.parse(process.env.HOOK_INPUT);
    process.stdout.write(d.tool_input && d.tool_input.command ? d.tool_input.command : '');
  } catch(e) { process.stdout.write(''); }
" 2>/dev/null)" || true

case "$BASH_COMMAND" in
  *"git commit"*) ;;
  *) exit 0 ;;
esac

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

LOCK_FILE="$GIT_ROOT/kaola-workflow/.locks/${PROJECT}.lock"
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

if [ "$OWNER" != "$KAOLA_SESSION_ID" ]; then
  printf 'BLOCKED: cross-session commit on project "%s". Lock held by %s; current session is %s.\n' \
    "$PROJECT" "$OWNER" "$KAOLA_SESSION_ID" >&2
  exit 2
fi

exit 0
