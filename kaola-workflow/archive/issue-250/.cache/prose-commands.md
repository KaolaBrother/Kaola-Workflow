# Node `prose-commands` evidence — issue #250

## Files changed

1. `commands/kaola-workflow-adapt.md`
   - Updated "Free (the flexibility)" enumeration line: "fan out `tdd-guide`" → "fan out `tdd-guide` or `implementer`"
   - Added "Choose the right implement role" bullet to `## Shaping guidance`: default tdd-guide; implementer only for enumerated non-test-first categories + record non_tdd_reason; asymmetric tie-breaker; "hard to test" NOT a reason; bug fixes always tdd-guide; mixed node → split/stricter; both require code-reviewer post-dominance; implementer is equal-burden/different-shape (not lighter)

2. `commands/kaola-workflow-plan-run.md`
   - Added `implementer` dispatch block (with "You MUST pass `model="{IMPLEMENTER_MODEL}"`" sentence + Agent block with subagent_type="implementer" and prompt noting change-type-appropriate verification + non_tdd_reason) after the tdd-guide dispatch block
   - Extended contractor commit-bracket evidence check (step 3a) to add: an implementer node requires recorded non_tdd_reason + passing change-type-appropriate check (regression-green / build-green / executable smoke-integration) in place of RED→GREEN
   - Extended step 4 judge-the-barrier sentence to include implementer's evidence requirements alongside tdd-guide's RED+GREEN

3. `plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md`
   - Added identical "Choose the right implement role" shaping guidance bullet (same substance as adapt.md; skill files have no "Free" enumeration line so only the bullet was added; no Agent block / placeholder — skill idiom is prose only)

4. `plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md`
   - Extended step 3 contractor sentence: added implementer needs non_tdd_reason + change-type-appropriate check in place of RED→GREEN, alongside the existing tdd-guide RED→GREEN requirement
   - Extended "ONLY IF the barrier exits 0 with RED+GREEN evidence" condition to add implementer's evidence requirements

## Gate exit codes

- `node scripts/validate-workflow-contracts.js` → exit 0
- `node scripts/test-install-model-rendering.js` → exit 0
- `node scripts/simulate-workflow-walkthrough.js` → exit 0

## Change-type note

This node is prose (documentation/command text edits); no failing unit test applies. Proof is contracts-green + rendering-green (IMPLEMENTER_MODEL placeholder renders to "sonnet" with no leftover {…_MODEL} in the installed output) + regression walkthrough green — change-type-appropriate verification for a prose/documentation node.
