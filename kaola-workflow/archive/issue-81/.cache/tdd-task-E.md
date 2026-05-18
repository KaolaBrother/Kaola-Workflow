# Task E Evidence — Rewrite step 5, GitHub SKILL.md

## File
`plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md`

## Diff Applied
Old line 66:
```
5. If exactly one active folder is already present (startup returns `verdict: owned`), skip steps 1-4.
```
Replaced with:
```
5. If exactly one active folder is already present, read its issue number from `node "$claim_script" status` (`active[0].issue_number`) and set `KAOLA_TARGET_ISSUE` to that value before calling startup. The script will return `verdict: owned`; proceed to routing. Do not skip the startup call.

   ```bash
   STATUS_OUT="$(node "$claim_script" status 2>/dev/null)"
   KAOLA_TARGET_ISSUE="$(node -e "try{const j=JSON.parse(process.argv[1]);process.stdout.write(j.count===1?String(j.active[0].issue_number):'')}catch(e){}" "$STATUS_OUT")"
   ```
```

## Variable name
`$claim_script` — matches surrounding convention.

## Co-active Folders Advisory
Still coherent: Advisory addresses two concurrent active folders (disjoint write sets); new step 5 addresses exactly-one-active resume. Orthogonal — no conflict.

## RED Evidence
N/A — doc edit; no executable test.

## GREEN Evidence
Diff review: old carve-out replaced, bash one-liner present verbatim with $claim_script, no other lines changed.

## Deviations
None.
