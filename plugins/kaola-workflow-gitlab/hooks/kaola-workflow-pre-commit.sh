#!/usr/bin/env bash
set -uo pipefail

GIT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
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
# If HOOK_INPUT is absent (direct git commit), run the same staged-project check.
if [ -n "$HOOK_INPUT" ]; then
  case "$INVOKED_CMD" in
    *"git commit"*) ;;
    *) exit 0 ;;
  esac
fi

STAGED="$(git -C "$GIT_ROOT" diff --cached --name-only 2>/dev/null)" || exit 0
[ -z "$STAGED" ] && exit 0

KW_PATHS="$(printf '%s\n' "$STAGED" \
  | grep '^kaola-workflow/' \
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

exit 0
