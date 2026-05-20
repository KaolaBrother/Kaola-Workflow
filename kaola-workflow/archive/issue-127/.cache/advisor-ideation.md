# Advisor Ideation Gate — Issue #127

## Query
Reviewed Option A (inline label removal), Option B (export clearAdvisoryClaim), Option C (shared helper).

Questions asked:
- Any missed approaches?
- Are risks accurate?
- Is the recommendation sound?
- Any gotchas that should change the decision?

## Advisor Response

**Option A confirmed. Proceed.**

### Validation of Risk Assessment
- Option A risks are accurately characterized: label literal repeated across 3 files is the only downside, and it matches existing conventions (CLAIM_LABEL already duplicated across forge adapters by design).
- Option B risks are accurately characterized: `clearAdvisoryClaim` posts a comment when `reason` is truthy, which would produce a duplicate comment in sink-merge context. Cross-forge signature incompatibility is real — GitHub uses `ghExec` not forge adapter, so the function couldn't be shared anyway.
- Option C risks are accurately characterized: three forges have fundamentally different label APIs; a shared helper would require a new abstraction layer with no clear home.

### No Missed Approaches
No viable fourth approach identified. The three options cover the realistic design space for this change.

### Gotchas

1. **CHANGELOG entry**: The advisor recommends including a `### Fixed` CHANGELOG entry for this issue. This should be a dedicated Phase 3 task (Task E), not folded into an implementation task, because it is a distinct file with no test coverage requirement.

2. **One-time cleanup timing**: The 14 closed issues (#126, #125, #119, etc.) should be cleaned up in Phase 6 Step 7, not as Phase 4 code. The list should be re-queried at Phase 6 time since additional issues may merge before then. Do NOT commit a cleanup script.

3. **Worktree constraint**: All Phase 4 agents (tdd-guide) must be given `Working directory: /Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow.kw/issue-127/` explicitly. The main repo and worktree are different paths; agents without the working directory context may edit the wrong copy.

4. **Pre-flight string verification**: Before writing `phase3-plan.md`, verify the exact line numbers in the three sink-merge files from the worktree (not the main repo). Line numbers in `.cache/code-explorer.md` and `.cache/planner.md` were derived from code-explorer reads which may be from the main repo before branching.

5. **Test assertion style**: New test assertions must use `forge.CLAIM_LABEL` (the exported constant) rather than the literal string `'workflow:in-progress'`. This keeps tests aligned with the production code constant and fails if the constant changes.

6. **Future consideration**: The root cause of why `cmdFinalize`'s `clearAdvisoryClaim` (called at claim.js:464 on finalize) did not prevent the 14 stale labels is unknown. Possible explanations: finalize path may not have been the close path for those issues, or those issues were closed via sink-merge before clearAdvisoryClaim was added to finalize. This is worth a follow-up issue but is out of scope for #127.

## Decision
**Proceed with Option A as recommended by the planner. No changes to the selected approach.**
