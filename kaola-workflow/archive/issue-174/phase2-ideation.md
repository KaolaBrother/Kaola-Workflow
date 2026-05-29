# Phase 2 - Ideation: issue-174

## Approaches Evaluated

### Option A: Targeted Surgical Patch (Selected)
- Summary: 7 targeted edits per SKILL.md (14 total), then contract assertions in the 2 forge-specific validators
- Pros: Surgical, preserves forge-specific text (glab/tea CLI, MR vs PR, plugin paths), each gap independently verifiable, no substitution risk
- Cons: 14 precise edits required
- Risk: Low
- Complexity: Medium

### Option B: Full Regeneration from GitHub Baseline
- Summary: Copy GitHub SKILL.md + forge-substitution pass
- Pros: Complete structural alignment
- Cons: `--runtime codex` vs `--runtime claude` mismatch risk; MR Intent section unique prose; missed substitution silently breaks forge; harder to verify
- Risk: Medium-High
- Complexity: Medium

### Option C: Template Generator Script
- Summary: New `scripts/generate-forge-skill.js` to produce all three variants
- Pros: Prevents future drift permanently
- Cons: Out of scope, new infrastructure, doesn't satisfy AC directly
- Risk: High (scope creep)
- Complexity: Very high

## Advisor Findings
Two corrections to the planner recommendation:

1. **Gap 6 direction was wrong**: The planner recommended removing `git pull --ff-only` from Git Freshness Block Recovery. The forge command docs (the correct parity target per AC) DO include ff-only recovery. Gap 6 is not a real gap — the only fix needed there is `PICK_NEXT_PROJECT → KAOLA_PROJECT` in the release command, already covered by Gap 1.

2. **Validator targets corrected**: New assertions belong in the forge-specific validators (`validate-kaola-workflow-gitlab-contracts.js` and `validate-kaola-workflow-gitea-contracts.js`), not the root validator files. These are what `npm test` actually runs for the GitLab/Gitea suites.

## Selected Approach
**Option A — Targeted Surgical Patch**, with Gap 6 reduced to a rename-only fix.

6 real content gaps to fix in each SKILL.md (Gap 1-5, Gap 7); Gap 6 fully covered by Gap 1:
1. Gap 1: `PICK_NEXT_PROJECT → KAOLA_PROJECT` (3 occurrences per file: Delegation patch, startup extraction, recovery release)
2. Gap 2: Add `KAOLA_VERDICT=` and `KAOLA_REASONING=` extraction to startup bash block
3. Gap 3: Add `target_unverified` to typed refusal list
4. Gap 4: Add startup refusal diagnostics print block (`Startup refusal: verdict=$KAOLA_VERDICT reasoning=$KAOLA_REASONING`)
5. Gap 5: Add target-existence validation step in Agent Issue Selection (glab/tea issue view + offline roadmap file check)
6. Gap 7: Move Co-active Folders Advisory from Routing section to Startup section (matches both GitHub SKILL.md and command doc structure)

Contract assertions (9 total per forge) go in:
- `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`
- `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`

Assertions cover: `!PICK_NEXT_PROJECT`, `KAOLA_VERDICT=`, `KAOLA_REASONING=`, `target_unverified`, `Startup refusal: verdict=$KAOLA_VERDICT reasoning=$KAOLA_REASONING`, `kaola-workflow/.roadmap/issue-$KAOLA_TARGET_ISSUE.md`, and `assertBefore(Co-active Folders Advisory, ## Routing)`.

## Out of Scope (explicit)
- Claim scripts — already correct, no changes
- Command docs (`commands/workflow-next.md`) — already at parity
- GitHub SKILL.md — authoritative, unchanged
- SKILL.md template generator — separate future issue
- Changes to `simulate-workflow-walkthrough.js` tests
- Root `scripts/validate-workflow-contracts.js` or `scripts/validate-kaola-workflow-contracts.js` — these cover the GitHub plugin, not GitLab/Gitea

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
