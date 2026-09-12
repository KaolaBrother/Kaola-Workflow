#!/bin/bash
set -euo pipefail
cd /tmp/kw-reject-probe
OUT=out/run
mkdir -p "$OUT"
PROMPT="$(cat prompt.txt)"
devin -p "$PROMPT" --model adaptive --respect-workspace-trust false --permission-mode auto --export "$OUT/parent.export.json" >"$OUT/parent.stdout.txt" 2>"$OUT/parent.stderr.txt"
echo "done"
