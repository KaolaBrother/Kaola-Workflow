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

# #566 / #567: model_planned — the frozen-plan tier for this role, resolved fail-open across every
# edition layout. The plugin editions keep scripts/ a sibling of hooks/ ("$_KW_ROOT/scripts"); the
# opencode edition deploys support scripts to an opencode-native dir
# ("${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}/kaola-workflow/scripts") with the hook one level
# up, so the sibling path does not resolve there. Search the known layouts in order; a missing or
# unresolvable resolver never breaks dispatch logging (empty on failure).
_KW_ROOT="$(dirname "$(dirname "$0")")"
_KW_OC_SCRIPTS="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}/kaola-workflow/scripts"
MODEL_PLANNED=""
for _KW_SDIR in "$_KW_ROOT/scripts" "$_KW_ROOT/kaola-workflow/scripts" "$_KW_OC_SCRIPTS"; do
  _KW_RESOLVER="$_KW_SDIR/kaola-workflow-resolve-agent-model.js"
  if [ -f "$_KW_RESOLVER" ]; then
    MODEL_PLANNED=$(node "$_KW_RESOLVER" "$AGENT_TYPE" --raw 2>/dev/null || printf '')
    break
  fi
done

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

# #338/#568: append under EVERY active-project root reachable from this dispatch, each AT MOST ONCE.
# Primary roots are the hook's own repo (HOOK_ROOT) and the dispatched agent's repo (AGENT_ROOT).
# #568: ALSO scan the linked WORKTREES of the resolved repo. Under opencode worktree posture the role
# agent runs in the MAIN repo (AGENT_ROOT == HOOK_ROOT == main) while the active workflow-state.md is
# worktree-resident — so neither primary root finds it. #338 covered the inverse (agent cwd == the
# worktree); enumerating worktrees covers this case edition-neutrally and fail-open. append_once
# dedupes by root path, so an in-place run still logs EXACTLY once and the #338 worktree case (agent
# cwd == worktree) stays single-log.
_KW_DONE=""
append_once() {
  _KW_R="$1"
  [ -n "$_KW_R" ] || return 0
  case "|$_KW_DONE|" in
    *"|$_KW_R|"*) return 0 ;;
  esac
  _KW_DONE="$_KW_DONE|$_KW_R"
  append_for_root "$_KW_R"
}
append_once "$HOOK_ROOT"
append_once "$AGENT_ROOT"
# Enumerate worktrees from one primary root (HOOK_ROOT and AGENT_ROOT share the repo, hence the same
# worktree set); fail-open. Split on newlines only so a worktree path containing spaces survives.
_KW_ENUM_ROOT="$HOOK_ROOT"
[ -n "$_KW_ENUM_ROOT" ] || _KW_ENUM_ROOT="$AGENT_ROOT"
if [ -n "$_KW_ENUM_ROOT" ]; then
  _KW_WORKTREES=$(git -C "$_KW_ENUM_ROOT" worktree list --porcelain 2>/dev/null | sed -n 's/^worktree //p') || _KW_WORKTREES=""
  _KW_OLDIFS="$IFS"
  IFS='
'
  for _KW_WT in $_KW_WORKTREES; do
    append_once "$_KW_WT"
  done
  IFS="$_KW_OLDIFS"
fi

exit 0
