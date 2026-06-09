#!/bin/sh
# Records subagent spawns to .cache/dispatch-log.jsonl for closure attestation.
# SubagentStart delivers a JSON payload on STDIN; exit 0 always (fail-open).

HOOK_INPUT="$(cat)"
[ -z "$HOOK_INPUT" ] && exit 0

# Parse agent_type, agent_id, cwd from the JSON payload
AGENT_TYPE=$(printf '%s' "$HOOK_INPUT" | node -e \
  "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>{try{const p=JSON.parse(d.join(''));process.stdout.write(p.agent_type||'')}catch(e){}})" 2>/dev/null || true)
[ -z "$AGENT_TYPE" ] && exit 0

AGENT_ID=$(printf '%s' "$HOOK_INPUT" | node -e \
  "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>{try{const p=JSON.parse(d.join(''));process.stdout.write(p.agent_id||'')}catch(e){}})" 2>/dev/null || true)

AGENT_CWD=$(printf '%s' "$HOOK_INPUT" | node -e \
  "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>{try{const p=JSON.parse(d.join(''));process.stdout.write(p.cwd||'')}catch(e){}})" 2>/dev/null || true)

# Resolve repo root; fail-open if not in a git repo
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
[ -z "$REPO_ROOT" ] && exit 0

# Build ISO8601 timestamp (portable BSD + Linux)
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Export so node -e subshell can read via process.env
export TS AGENT_TYPE AGENT_ID AGENT_CWD

# For each active project, append one JSONL line to .cache/dispatch-log.jsonl
for STATE_FILE in "$REPO_ROOT"/kaola-workflow/*/workflow-state.md; do
  [ -f "$STATE_FILE" ] || continue
  grep -q "^status: active" "$STATE_FILE" || continue
  PROJECT_DIR=$(dirname "$STATE_FILE")
  CACHE_DIR="$PROJECT_DIR/.cache"
  mkdir -p "$CACHE_DIR"
  # Build JSON line using node -e for correct escaping
  LINE=$(node -e "
    const ts = process.env.TS;
    const at = process.env.AGENT_TYPE;
    const ai = process.env.AGENT_ID;
    const cw = process.env.AGENT_CWD;
    process.stdout.write(JSON.stringify({ts: ts, agent_type: at, agent_id: ai, cwd: cw}));
  " 2>/dev/null) || continue
  printf '%s\n' "$LINE" >> "$CACHE_DIR/dispatch-log.jsonl"
done

exit 0
