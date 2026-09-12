#!/bin/bash
set -euo pipefail
cd /tmp/kw-adaptive-subagent-probe
OUT=out/run
mkdir -p "$OUT"
devin -p --model adaptive --respect-workspace-trust false --permission-mode auto --export "$OUT/parent.export.json" "$(cat prompt.txt)" >"$OUT/parent.stdout.txt" 2>"$OUT/parent.stderr.txt"
echo "parent session export saved to $OUT/parent.export.json"
grep -oE '[a-z]+-[a-z]+' "$OUT/parent.stdout.txt" | head -1 >"$OUT/session.id" || true
