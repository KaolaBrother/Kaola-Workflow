#!/usr/bin/env bash
# Creates the #1060 probe fixture repository at /tmp/kw-fusion-probe.
# Idempotent: removes and recreates the fixture. Never touches ~/.config/devin.
set -euo pipefail
P=/tmp/kw-fusion-probe
rm -rf "$P"
mkdir -p "$P/.devin/agents" "$P/out"
cd "$P"
git init -q
printf '# kw-fusion-probe\nProbe fixture for Kaola-Workflow #1060. Disposable.\n' > README.md
printf 'KW-PROBE-PROJECT-AGENTS-MARKER-1060\n' > AGENTS.md

# Child prompt shared by every custom profile: report identity and surface, no tool calls.
body() {
cat <<EOF

Reply with exactly these lines and nothing else. Do not call any tool.
TOKEN=$1
TOOLS=<comma-separated exact names of every tool you have>
PROFILES=<comma-separated subagent profile names you could dispatch, or NONE>
SIDEKICK=<YES if you have a tool named sidekick, else NO>
AGENTS_MARKER=<the number of times the string KW-PROBE-PROJECT-AGENTS-MARKER-1060 appears in your context>
RECOVERY_MARKER=<the number of times the string KW-COMPACT-RECOVERY-V2 appears in your context>
EOF
}

prof() { # name, model-line-or-empty, tools...
  local n="$1" m="$2"; shift 2
  { printf -- '---\nname: %s\ndescription: kw-1060 probe %s\n' "$n" "$n"
    [ -n "$m" ] && printf 'model: %s\n' "$m"
    printf 'allowed-tools:\n'; for t in "$@"; do printf '  - %s\n' "$t"; done
    printf -- '---\n'; body "$n"; } > ".devin/agents/$n.md"
}

RO=(read grep glob)
prof kwp-unpinned      ""                                                   "${RO[@]}"
prof kwp-fable         fable                                                "${RO[@]}"
prof kwp-fable-full    claude-fable-5-1-high                                "${RO[@]}"
prof kwp-swe           swe                                                  "${RO[@]}"
prof kwp-swe-full      swe-2-medium                                         "${RO[@]}"
prof kwp-fusion        fusion                                               "${RO[@]}"
prof kwp-fusion-full   fusion-claude-fable-5-1-high-sidekick-swe-2-medium   "${RO[@]}"
prof kwp-astra         astra                                                "${RO[@]}"
prof kwp-gpt           gpt                                                  "${RO[@]}"
prof kwp-astra-full    gpt-6-astra-high                                     "${RO[@]}"
prof kwp-adaptive      adaptive                                             "${RO[@]}"
prof kwp-writer        ""                                                   read grep glob write exec

# Project hooks: log every UserPromptSubmit and every tool call's name to out/hooks.log so F20
# can tell whether hooks fire for sidekick turns and which tool names the parent actually calls.
cat > .devin/hooks.v1.json <<'EOF'
{
  "UserPromptSubmit": [{"matcher": "", "hooks": [{"type": "command",
    "command": "cat | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{require(\"fs\").appendFileSync(\"/tmp/kw-fusion-probe/out/hooks.log\",\"UPS \"+Date.now()+\" \"+s.replace(/\\n/g,\" \")+\"\\n\");console.log(JSON.stringify({hookSpecificOutput:{hookEventName:\"UserPromptSubmit\",additionalContext:\"KW-PROBE-UPS-MARKER-1060\"}}))})'"}]}],
  "PreToolUse": [{"matcher": "", "hooks": [{"type": "command",
    "command": "cat | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{let j={};try{j=JSON.parse(s)}catch(e){};require(\"fs\").appendFileSync(\"/tmp/kw-fusion-probe/out/hooks.log\",\"PRE \"+Date.now()+\" tool=\"+(j.tool_name||\"?\")+\" agent=\"+(j.agent_id||j.subagent_id||\"-\")+\"\\n\")})'"}]}]
}
EOF

git add -A && git -c user.email=kw@probe -c user.name=kw-probe commit -qm "probe fixture 1060"
echo "fixture ready at $P"; ls .devin/agents
