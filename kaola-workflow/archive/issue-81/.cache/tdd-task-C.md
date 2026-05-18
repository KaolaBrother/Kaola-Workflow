# Task C Evidence — Rewrite step 5, GitHub command doc

## File
`commands/workflow-next.md`

## Diff Applied
```diff
@@ -53,7 +53,12 @@
-5. If exactly one active folder is already present (startup will return `verdict: owned`), skip steps 1-4 and route to that project.
+5. If exactly one active folder is already present, read its issue number from `node "$CLAIM_JS" status` (`active[0].issue_number`) and set `KAOLA_TARGET_ISSUE` to that value before calling startup. The script will return `verdict: owned`; proceed to routing. Do not skip the startup call.
+
+   ```bash
+   STATUS_OUT="$(node "$CLAIM_JS" status 2>/dev/null)"
+   KAOLA_TARGET_ISSUE="$(node -e "try{const j=JSON.parse(process.argv[1]);process.stdout.write(j.count===1?String(j.active[0].issue_number):'')}catch(e){}" "$STATUS_OUT")"
+   ```
 6. If `$ARGUMENTS` names a specific issue number or project, use that as the explicit target.
```

## RED Evidence
N/A — doc edit; no executable test.

## GREEN Evidence
Diff review: old carve-out replaced, bash one-liner present verbatim, no other lines changed.

## Deviations
None.
