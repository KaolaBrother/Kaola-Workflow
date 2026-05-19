# Code Explorer: issue-109

## Entry Points

- `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` — GitHub Codex skill; primary fix target
- `commands/workflow-next.md` — Claude command equivalent; correct Pattern A reference
- `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md` — GitLab Codex skill; correct Pattern B reference
- `scripts/validate-kaola-workflow-contracts.js` — contract test file; regression target
- `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` — runtime simulation; secondary test

---

## Current Bug State (GitHub Codex SKILL.md)

**Startup extraction block (lines ~113–119):**
```bash
STARTUP_OUT=$(node "$claim_script" startup --runtime codex $KAOLA_SINK_FLAG $KAOLA_TARGET_FLAG 2>/dev/null) || true
PICK_NEXT_PROJECT="$(node -e "try{...JSON.parse(process.argv[1]).project...}" "$STARTUP_OUT")" || true
KAOLA_WORKTREE_PATH="$(node -e "try{...JSON.parse(process.argv[1]).worktree_path...}" "$STARTUP_OUT")" || true
```
Only `PICK_NEXT_PROJECT` and `KAOLA_WORKTREE_PATH` are extracted. `KAOLA_PROJECT` and `KAOLA_CLAIM` are NOT extracted.

**Git Freshness Block Recovery (line ~139):**
```bash
node "$claim_script" release --project "$KAOLA_PROJECT" --reason git-freshness-block
```
Two bugs: (1) `$KAOLA_PROJECT` is unset, (2) no `claim == acquired` guard.

---

## Correct Patterns

### Pattern A — Claude command (`commands/workflow-next.md` lines ~132–143)
```bash
KAOLA_PROJECT="$(node -e "...JSON.parse(process.argv[1]).project..." "$STARTUP_OUT")" || true
KAOLA_CLAIM="$(node -e "...JSON.parse(process.argv[1]).claim..." "$STARTUP_OUT")" || true
# ...
[ "$KAOLA_CLAIM" = "acquired" ] && [ -n "$KAOLA_PROJECT" ] && node "$CLAIM_JS" release --project "$KAOLA_PROJECT" --reason git-freshness-block
```
Uses `KAOLA_PROJECT` (not `PICK_NEXT_PROJECT`). Would leave duplicate project variables in SKILL.md.

### Pattern B — GitLab Codex skill (`plugins/kaola-workflow-gitlab/skills/.../SKILL.md` lines ~120–122)
```bash
PICK_NEXT_PROJECT="$(node -e "...JSON.parse(process.argv[1]).project..." "$STARTUP_OUT")" || true
KAOLA_CLAIM="$(node -e "...JSON.parse(process.argv[1]).claim..." "$STARTUP_OUT")" || true
KAOLA_WORKTREE_PATH="$(node -e "...JSON.parse(process.argv[1]).worktree_path..." "$STARTUP_OUT")" || true
# ...
[ "$KAOLA_CLAIM" = "acquired" ] && [ -n "$PICK_NEXT_PROJECT" ] && node "$claim_script" release --project "$PICK_NEXT_PROJECT" --reason git-freshness-block
```
Keeps `PICK_NEXT_PROJECT`, adds only `KAOLA_CLAIM`. No duplicate. Preferred.

---

## Test Location

`npm run test:kaola-workflow:codex` (package.json line 37) runs:
1. `scripts/validate-kaola-workflow-contracts.js` — string-assertion contract validator
2. `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` — runtime simulation

Existing assertions for SKILL.md in `validate-kaola-workflow-contracts.js` (lines 86–89):
```js
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'active folders');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, '--target-issue');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'watch-pr');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'extract and reassign `delegation_policy:` alongside `phase` and `next_skill`');
```

New assertions needed:
- `assertIncludes(file, 'KAOLA_CLAIM')` — extraction present
- `assertIncludes(file, '[ "$KAOLA_CLAIM" = "acquired" ]')` — guard present

---

## Variable Naming

| Context | Project var | Claim var | Script var |
|---------|------------|-----------|-----------|
| GitHub Claude command | `KAOLA_PROJECT` | `KAOLA_CLAIM` | `CLAIM_JS` |
| GitHub Codex skill (buggy) | `PICK_NEXT_PROJECT` | absent | `claim_script` |
| GitLab Codex skill (correct) | `PICK_NEXT_PROJECT` | `KAOLA_CLAIM` | `claim_script` |

Startup JSON output: `.project` → project name; `.claim` → `"acquired"` | `"owned"` | `"none"`

---

## Recommendation
Use Pattern B: add `KAOLA_CLAIM` extraction after `PICK_NEXT_PROJECT`, update recovery to `[ "$KAOLA_CLAIM" = "acquired" ] && [ -n "$PICK_NEXT_PROJECT" ] && node "$claim_script" release --project "$PICK_NEXT_PROJECT" --reason git-freshness-block`.

Add regression assertions in `scripts/validate-kaola-workflow-contracts.js` lines ~89 (after existing block).
