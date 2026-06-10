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

# Determine whether the invoked command is a git-commit and extract any -C <path>.
# Strategy:
#   1. Fast-path substring: if the command contains the literal text "git commit"
#      (e.g. compound shell expression `cd x && git commit`) treat it as a commit
#      and inspect the hook's cwd (no -C path to extract from a substring match).
#   2. Tokenize: skip git global flags (-C <path>, -c <kv>, --long-flag[=val])
#      before the subcommand token.  When -C <path> is present use that path as
#      the repo root for the staged-files inspection.
#
# Fail-open: any unrecognised / unparseable input exits 0 (no false blocks).
IS_GIT_COMMIT=0
DASH_C_PATH=""

if [ -n "$HOOK_INPUT" ]; then
  case "$INVOKED_CMD" in
    *"git commit"*)
      # Fast-path: literal "git commit" substring present (e.g. cd x && git commit).
      IS_GIT_COMMIT=1
      ;;
    *)
      # Tokenize via node to catch `git -C <path> commit`, `git -c k=v commit`, etc.
      # The node script outputs one of: "0" (not a commit), "1" (commit, use cwd),
      # or "2:<path>" (commit with explicit -C path).
      # We pass INVOKED_CMD via env to avoid any shell-quoting entanglement.
      export INVOKED_CMD
      _TOKENIZER_OUT="$(node -e '
        try {
          var cmd = process.env.INVOKED_CMD || "";
          var tokens = cmd.trim().split(/\s+/);
          var i = 0;
          // Find the "git" token (may be /usr/bin/git etc).
          while (i < tokens.length && !/(?:^|\/)git$/.test(tokens[i])) { i++; }
          if (i >= tokens.length) { process.stdout.write("0"); process.exit(0); }
          i++; // skip "git"
          var dashCPath = "";
          // Skip global option flags before the subcommand.
          while (i < tokens.length) {
            var t = tokens[i];
            if (t === "-C") {
              if (i + 1 < tokens.length) { dashCPath = tokens[i + 1]; }
              i += 2;
            } else if (t === "-c") {
              i += 2;
            } else if (/^--/.test(t)) {
              i++;
            } else {
              break;
            }
          }
          if (i < tokens.length && tokens[i] === "commit") {
            process.stdout.write(dashCPath ? "2:" + dashCPath : "1");
          } else {
            process.stdout.write("0");
          }
        } catch (e) { process.stdout.write("0"); }
      ' 2>/dev/null)" || _TOKENIZER_OUT="0"
      case "$_TOKENIZER_OUT" in
        2:*) DASH_C_PATH="${_TOKENIZER_OUT#2:}"; IS_GIT_COMMIT=1 ;;
        1)   IS_GIT_COMMIT=1 ;;
        *)   IS_GIT_COMMIT=0 ;;
      esac
      ;;
  esac

  [ "$IS_GIT_COMMIT" -eq 0 ] && exit 0
fi

# Choose which repo to inspect for staged files.
INSPECT_ROOT="${DASH_C_PATH:-$GIT_ROOT}"

STAGED="$(git -C "$INSPECT_ROOT" diff --cached --name-only 2>/dev/null)" || exit 0
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
