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

# #566: opportunistic model — the runtime-supplied model (codex CLI only; empty for Claude Code
# SubagentStart and opencode). Emitted unconditionally; empty when the runtime omits it.
MODEL=$(printf '%s' "$HOOK_INPUT" | node -e \
  "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>{try{const p=JSON.parse(d.join(''));process.stdout.write(p.model||'')}catch(e){}})" 2>/dev/null || true)

# #566: model_planned — the frozen-plan tier for this role, resolved fail-open. A missing or
# unresolvable resolver never breaks dispatch logging (empty on failure).
_KW_ROOT="$(dirname "$(dirname "$0")")"
MODEL_PLANNED=$(node "$_KW_ROOT/scripts/kaola-workflow-resolve-agent-model.js" "$AGENT_TYPE" --raw 2>/dev/null || printf '')

# Resolve candidate repo roots: the hook's own cwd AND the dispatched agent's cwd.
# #338: a subagent dispatched into a linked worktree must be logged where the worktree's
# consumers (cmdFinalize / sink-merge attestation) read .cache/dispatch-log.jsonl. The hook
# process cwd is the MAIN session's repo; AGENT_CWD is the dispatched agent's cwd, which for a
# worktree run is the linked worktree toplevel that the hook-cwd scan never reaches.
HOOK_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || HOOK_ROOT=""
AGENT_ROOT=""
if [ -n "$AGENT_CWD" ] && [ -d "$AGENT_CWD" ]; then
  AGENT_ROOT=$(git -C "$AGENT_CWD" rev-parse --show-toplevel 2>/dev/null) || AGENT_ROOT=""
fi
[ -z "$HOOK_ROOT" ] && [ -z "$AGENT_ROOT" ] && exit 0

# Build ISO8601 timestamp (portable BSD + Linux)
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Export so node -e subshell can read via process.env
export TS AGENT_TYPE AGENT_ID AGENT_CWD MODEL MODEL_PLANNED

# For each active project under a root, append one JSONL line to .cache/dispatch-log.jsonl
append_for_root() {
  ROOT="$1"
  [ -n "$ROOT" ] || return 0
  for STATE_FILE in "$ROOT"/kaola-workflow/*/workflow-state.md; do
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
      const md = process.env.MODEL;
      const mp = process.env.MODEL_PLANNED;
      process.stdout.write(JSON.stringify({ts: ts, agent_type: at, agent_id: ai, cwd: cw, model: md, model_planned: mp}));
    " 2>/dev/null) || continue
    printf '%s\n' "$LINE" >> "$CACHE_DIR/dispatch-log.jsonl"
  done
}

# In-place runs: AGENT_ROOT == HOOK_ROOT — single pass, byte-equivalent to prior behavior.
# Worktree runs: also append under the worktree's active project .cache/.
append_for_root "$HOOK_ROOT"
if [ -n "$AGENT_ROOT" ] && [ "$AGENT_ROOT" != "$HOOK_ROOT" ]; then
  append_for_root "$AGENT_ROOT"
fi

exit 0
