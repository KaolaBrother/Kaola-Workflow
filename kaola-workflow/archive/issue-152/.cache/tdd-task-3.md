# tdd-task-3 — Phase 6 command files: tdd-guide + build-error-resolver blocks

## Files Modified
- commands/kaola-workflow-phase6.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase6.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-phase6.md

## Change
Inserted tdd-guide and build-error-resolver Agent blocks in Validation Delegation Policy section after "`build-error-resolver` for build/type/lint/tooling checks). Raw output goes to:" and before the final-validation.md cache fence. Anchor used full path to avoid final-validation vs final-validation-fix-{n} substring collision.

## RED Evidence
N/A — text insertion task; absence of blocks confirmed by Phase 2 research.

## GREEN Evidence
node scripts/validate-workflow-contracts.js → "Workflow contract validation passed"

## Deviations
None.
