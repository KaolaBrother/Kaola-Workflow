# Task D Evidence — Rewrite step 5, GitLab command doc

## File
`plugins/kaola-workflow-gitlab/commands/workflow-next.md`

## Diff Applied
```diff
-5. If exactly one active folder is already present (startup will return `verdict: owned`), skip steps 1-4 and route to that project.
+5. If exactly one active folder is already present, read its issue number from `node "$CLAIM_JS" status` (`active[0].issue_number`) and set `KAOLA_TARGET_ISSUE` to that value before calling startup. The script will return `verdict: owned`; proceed to routing. Do not skip the startup call.
+
+   ```bash
+   STATUS_OUT="$(node "$CLAIM_JS" status 2>/dev/null)"
+   KAOLA_TARGET_ISSUE="$(node -e "try{const j=JSON.parse(process.argv[1]);process.stdout.write(j.count===1?String(j.active[0].issue_number):'')}catch(e){}" "$STATUS_OUT")"
+   ```
```

## Variable name
`$CLAIM_JS` — matches surrounding convention in this file (GitLab command doc uses CLAIM_JS).

## RED Evidence
N/A — doc edit; no executable test.

## GREEN Evidence
Diff review: old carve-out replaced, bash one-liner present verbatim, steps 1-7 intact, no other lines changed.

## Deviations
None.
