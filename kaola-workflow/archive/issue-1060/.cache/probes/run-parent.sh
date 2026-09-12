#!/usr/bin/env bash
# F15/F16/F23/F24/F25: one fresh non-interactive parent session per model.
# usage: run-parent.sh <model-id-or-alias> <tag> [prompt-file]
# Output: /tmp/kw-fusion-probe/out/<tag>.export.json, <tag>.stdout.txt, <tag>.session
set -uo pipefail
MODEL="$1"; TAG="$2"; PROMPT_FILE="${3:-}"
P=/tmp/kw-fusion-probe; OUT="$P/out"; cd "$P"
if [ -z "$PROMPT_FILE" ]; then
  PROMPT=$(cat <<'EOF'
Do not call any tool. Reply with exactly these lines:
MODEL=<the complete "You are powered by ..." sentence from your system prompt, verbatim>
TOOLS=<comma-separated exact names of every tool you have>
SIDEKICK=<YES if you have a tool named sidekick, else NO>
PROFILES=<comma-separated subagent profile names available to run_subagent, or NONE>
AGENTS_MARKER=<count of KW-PROBE-PROJECT-AGENTS-MARKER-1060 in your context>
UPS_MARKER=<count of KW-PROBE-UPS-MARKER-1060 in your context>
RECOVERY_MARKER=<count of KW-COMPACT-RECOVERY-V2 in your context>
EOF
)
else PROMPT="$(cat "$PROMPT_FILE")"; fi
BEFORE=$(sqlite3 ~/.local/share/devin/cli/sessions.db "select max(created_at) from sessions")
devin -p "$PROMPT" --model "$MODEL" --respect-workspace-trust false --permission-mode auto \
  --export "$OUT/$TAG.export.json" > "$OUT/$TAG.stdout.txt" 2> "$OUT/$TAG.stderr.txt"
echo "exit=$?" >> "$OUT/$TAG.stdout.txt"
sqlite3 ~/.local/share/devin/cli/sessions.db \
  "select id||' model='||model||' cwd='||working_directory from sessions where created_at>$BEFORE order by created_at desc limit 1" > "$OUT/$TAG.session"
echo "== $TAG ($MODEL)"; cat "$OUT/$TAG.stdout.txt"; cat "$OUT/$TAG.session"
