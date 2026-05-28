# Planner Output — issue-172

## Files to Touch (exactly 2)
1. plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md — 3 renames: lines 50, 120, 152
2. scripts/validate-kaola-workflow-contracts.js — 3 assertion flips: lines 91-93

## Exact Changes

### File 1: SKILL.md
- Line 50: `${PICK_NEXT_PROJECT}` → `${KAOLA_PROJECT}`
- Line 120: `PICK_NEXT_PROJECT=` → `KAOLA_PROJECT=`
- Line 152: `$PICK_NEXT_PROJECT` (x2) → `$KAOLA_PROJECT`

### File 2: validate-kaola-workflow-contracts.js
- Line 91: assertIncludes `$PICK_NEXT_PROJECT` → `$KAOLA_PROJECT`
- Line 92: assertIncludes `"$PICK_NEXT_PROJECT"` → `"$KAOLA_PROJECT"`
- Line 93: flip assertNotIncludes: was forbidding `$KAOLA_PROJECT`, now forbids `$PICK_NEXT_PROJECT`

## Acceptance Check Commands
1. grep -n 'PICK_NEXT_PROJECT' plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md  # expect empty
2. node scripts/validate-kaola-workflow-contracts.js  # expect exit 0
3. node scripts/simulate-workflow-walkthrough.js  # expect exit 0
4. npm test  # expect exit 0

## Out of Scope
- GitLab/Gitea editions (existing pre-existing state, separate issue needed)
- CHANGELOG.md historical prose
- Archived phase artifacts
