# TDD Task 1: Fix SKILL.md — KAOLA_CLAIM extraction and release guard

## Status: GREEN

## Modified File
`plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` (feature worktree)

## RED Evidence
N/A — SKILL.md is a text configuration/documentation file, not a code module.

## GREEN Evidence
```
118:  KAOLA_CLAIM="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).claim||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true
140:[ "$KAOLA_CLAIM" = "acquired" ] && [ -n "$PICK_NEXT_PROJECT" ] && node "$claim_script" release --project "$PICK_NEXT_PROJECT" --reason git-freshness-block
```

- `KAOLA_CLAIM` appears exactly twice (extraction + guard)
- `KAOLA_PROJECT` appears zero times — old buggy reference fully replaced

## Deviations
None. Only the specified file was modified.
