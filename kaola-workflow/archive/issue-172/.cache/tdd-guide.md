# TDD-Guide Output — issue-172

## Changes Made

### File 1: plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md
- Line 50: ${PICK_NEXT_PROJECT} → ${KAOLA_PROJECT}
- Line 120: PICK_NEXT_PROJECT= → KAOLA_PROJECT=
- Line 152: "$PICK_NEXT_PROJECT" (x2) → "$KAOLA_PROJECT"

### File 2: scripts/validate-kaola-workflow-contracts.js
- Line 91: assertIncludes check updated to use KAOLA_PROJECT
- Line 92: assertIncludes check updated to use KAOLA_PROJECT
- Line 93: assertNotIncludes now forbids PICK_NEXT_PROJECT (old name)

## Verification Results
- grep PICK_NEXT_PROJECT SKILL.md → empty (clean)
- grep KAOLA_PROJECT SKILL.md → 3 matches at lines 50, 120, 152
- node scripts/validate-kaola-workflow-contracts.js → "Kaola-Workflow Codex contract validation passed" (exit 0)
- node scripts/simulate-workflow-walkthrough.js → 42 tests passed, "Workflow walkthrough simulation passed" (exit 0)
- npm test Codex walkthrough → pre-existing failure unrelated to this change (confirmed by stash-test)
