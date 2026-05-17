#!/bin/sh
# Blocks advisor citations in kaola-workflow files without a backing .cache/advisor-*.md

HOOK_INPUT="${HOOK_INPUT:-}"
[ -z "$HOOK_INPUT" ] && exit 0

FILE_PATH=$(printf '%s' "$HOOK_INPUT" | node -e \
  "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(d.join('')).file_path||'')}catch(e){}})" 2>/dev/null || true)
[ -z "$FILE_PATH" ] && exit 0

# Only check kaola-workflow project artifact paths
printf '%s\n' "$FILE_PATH" | grep -q 'kaola-workflow/[^/]*/[^/]' || exit 0

CONTENT=$(printf '%s' "$HOOK_INPUT" | node -e \
  "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(d.join('')).content||'')}catch(e){}})" 2>/dev/null || true)
[ -z "$CONTENT" ] && exit 0

ADVISOR_PATTERN='advisor (says|recommends|confirms|approved|noted)|per (the )?advisor|advisor gate (passed|approved)|\.cache\/advisor-'
printf '%s\n' "$CONTENT" | grep -qiE "$ADVISOR_PATTERN" || exit 0

# Has advisor citation — verify backing artifact exists
PROJECT_SEGMENT=$(printf '%s\n' "$FILE_PATH" | grep -oE 'kaola-workflow/[^/]+')
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
CACHE_DIR="${REPO_ROOT}/${PROJECT_SEGMENT}/.cache"

if ! ls "$CACHE_DIR"/advisor-*.md >/dev/null 2>&1; then
  echo "phantom-advisor: $FILE_PATH cites advisor but no .cache/advisor-*.md found in $CACHE_DIR" >&2
  exit 2
fi
exit 0
