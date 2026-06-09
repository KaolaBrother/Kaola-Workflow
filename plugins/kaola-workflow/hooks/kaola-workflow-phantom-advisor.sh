#!/bin/sh
# Blocks advisor citations in kaola-workflow files without a backing .cache/advisor-*.md

# The Claude Code PostToolUse hook delivers its JSON payload on STDIN (not as an
# env var) and nests the tool arguments under `tool_input` — mirror the sibling
# pre-commit hook. Reading the wrong source/shape silently disabled this guard.
HOOK_INPUT="$(cat)"
[ -z "$HOOK_INPUT" ] && exit 0

FILE_PATH=$(printf '%s' "$HOOK_INPUT" | node -e \
  "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>{try{const t=JSON.parse(d.join('')).tool_input||{};process.stdout.write(t.file_path||'')}catch(e){}})" 2>/dev/null || true)
[ -z "$FILE_PATH" ] && exit 0

# Only check kaola-workflow project artifact paths
printf '%s\n' "$FILE_PATH" | grep -q 'kaola-workflow/[^/]*/[^/]' || exit 0

# Write carries `content`; Edit carries `new_string` (no `content`) — scan the
# union so an advisor citation injected via either tool is caught.
CONTENT=$(printf '%s' "$HOOK_INPUT" | node -e \
  "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>{try{const t=JSON.parse(d.join('')).tool_input||{};process.stdout.write([t.content,t.new_string].filter(Boolean).join('\n'))}catch(e){}})" 2>/dev/null || true)
[ -z "$CONTENT" ] && exit 0

ADVISOR_PATTERN='advisor (says|recommends|confirms|approved|noted)|per (the )?advisor|advisor gate (passed|approved)|\.cache\/advisor-'
printf '%s\n' "$CONTENT" | grep -qiE "$ADVISOR_PATTERN" || exit 0

# Has advisor citation — verify backing artifact exists.
# Fail open (exit 0) when not inside a git repo, mirroring the pre-commit hook.
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
[ -z "$REPO_ROOT" ] && exit 0
# Extract the kaola-workflow/<project> segment from the LAST such occurrence in
# the path (greedy `.*/`), then resolve the cache under the canonical repo root.
# Anchoring on the last occurrence handles a repo directory itself named
# 'kaola-workflow', and rebuilding under $REPO_ROOT avoids prefix-mismatch bugs
# when FILE_PATH and the resolved repo root differ (e.g. /tmp vs /private/tmp).
PROJECT_SEGMENT=$(printf '%s\n' "$FILE_PATH" | sed -E 's#(^|.*/)(kaola-workflow/[^/]+)/.*#\2#')
CACHE_DIR="${REPO_ROOT}/${PROJECT_SEGMENT}/.cache"

if ! ls "$CACHE_DIR"/advisor-*.md >/dev/null 2>&1; then
  echo "phantom-advisor: $FILE_PATH cites advisor but no .cache/advisor-*.md found in $CACHE_DIR" >&2
  exit 2
fi
exit 0
