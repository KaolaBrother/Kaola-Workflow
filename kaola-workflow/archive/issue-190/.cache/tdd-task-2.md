# TDD Task 2: T-M1b — Port Step 0a-1 to Codex SKILLs (GREEN)

## Result: GREEN ✓ (all 3 validators pass)

## Edits Made Per Edition

### Edit 1: Inserted ## Startup Step 0a-1 — Path Intent
- Between ## Startup Step 0a and ## Startup in each SKILL.md
- Ported from each edition's own command file (gh/glab/tea variants)
- Applied only adaptation #3: "Before Step 0b" → "Before the Startup transaction" (2 occurrences each)
- Cross-reference to commands/kaola-workflow-fast.md kept verbatim (no adaptation #2 per plan)

### Edit 2: Added 3 lines to ## Required Output fenced block
Between `Pending gates:` and `Next skill:`:
- `Branch: {branch from Sink block in workflow-state.md, or TBD if not yet claimed}`
- `Workflow path: {fast|full — from KAOLA_PATH or Step 0a-1 judgment}`
- `Parallel decision: {green|yellow|red|blocked|target_unavailable|target_unverified|skipped — classifier verdict or "skipped" if offline/unavailable}`

## Validator Output (GREEN)
- scripts/validate-kaola-workflow-contracts.js → "Kaola-Workflow Codex contract validation passed" (exit 0)
- plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js → "Kaola-Workflow GitLab contract validation passed" (exit 0)
- plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js → "Kaola-Workflow Gitea contract validation passed" (exit 0)

## Deviations
None.
