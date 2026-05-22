# tdd-task-2 — Phase 5 command files: tdd-guide + build-error-resolver blocks

## Files Modified
- commands/kaola-workflow-phase5.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase5.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-phase5.md

## Change
Inserted tdd-guide and build-error-resolver Agent blocks in Validation Delegation Policy section after "`build-error-resolver` for build/type/lint/tooling findings). Raw output goes\nto:" (note line wrap) and before the review-validation-{n}.md cache fence.

## RED Evidence
N/A — text insertion task; absence of blocks confirmed by Phase 2 research.

## GREEN Evidence
node scripts/validate-workflow-contracts.js → "Workflow contract validation passed"

## Deviations
None.
