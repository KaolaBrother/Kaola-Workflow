# Planner — issue-174

## Recommendation: Approach A — Targeted Surgical Patch

### Approach A (Recommended)
- **Summary**: 7 targeted edits per SKILL.md file (14 total), then contract assertions in 2 validator files
- **Pros**: Surgical, forge-specific text preserved (glab/tea/MR), independently verifiable per gap, no false substitution risk
- **Cons**: 14 careful edits required
- **Risk**: Low
- **Complexity**: Medium

### Approach B (Rejected)
- **Summary**: Regenerate from GitHub baseline + forge-specific substitution pass
- **Risk**: Medium-High — `--runtime codex` vs `--runtime claude` mismatch risk; MR Intent section unique prose; missed substitution silently breaks forge
- **Complexity**: Medium

### Approach C (Rejected)
- **Summary**: Create template generator script
- **Risk**: High (scope creep, new infrastructure)
- **Complexity**: Very high — out of scope for this issue

## Gap 7 Decision: Align to Startup section (match GitHub)
Moving Co-active Folders Advisory to Startup section is semantically correct: agent reads it when the second active folder is discovered (during startup status check), not after routing.

## Contract Assertions (9 total for both validator files)
1. `assertNotIncludes` for `PICK_NEXT_PROJECT` in both forge SKILL.md files
2. `assertIncludes` for `KAOLA_VERDICT=` in both
3. `assertIncludes` for `KAOLA_REASONING=` in both
4. `assertIncludes` for `target_unverified` in both
5. `assertIncludes` for `Startup refusal: verdict=$KAOLA_VERDICT reasoning=$KAOLA_REASONING` in both
6. `assertIncludes` for `kaola-workflow/.roadmap/issue-$KAOLA_TARGET_ISSUE.md` in both
7. `assertBefore` for Co-active Folders Advisory before Routing section in both

## Out of Scope
- Claim scripts (already correct)
- Command docs (already at parity)
- GitHub SKILL.md (authoritative, unchanged)
- SKILL.md template generator
- simulate-workflow-walkthrough.js test changes
- CHANGELOG/README updates (Phase 6)

## Implementation Order
1. Gap 1: PICK_NEXT_PROJECT → KAOLA_PROJECT (lines 50, 120/118, 165/163)
2. Gap 2: Add KAOLA_VERDICT= and KAOLA_REASONING= extraction after KAOLA_WORKTREE_PATH
3. Gap 3: Add target_unverified to typed refusal list
4. Gap 4: Add Startup refusal diagnostics print block
5. Gap 5: Add target-existence validation step (glab/tea issue view + offline roadmap check)
6. Gap 6: Remove ff-only attempt from Git Freshness Block Recovery
7. Gap 7: Move Co-active Folders Advisory to Startup section
8. Both validator files: add 9 assertions
9. Verify: validate-workflow-contracts.js and simulate-workflow-walkthrough.js both exit 0
