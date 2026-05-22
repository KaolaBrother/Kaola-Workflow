# tdd-task-1 — Phase 4 command files: build-error-resolver block

## Files Modified
- commands/kaola-workflow-phase4.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase4.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-phase4.md

## Change
Inserted build-error-resolver Agent block in Validation Delegation Policy section after "for build/type/lint/tooling checks). Raw output goes to:" and before the validation-task-{n}.md cache fence.

## RED Evidence
N/A — text insertion task; absence of block confirmed by Phase 2 research.

## GREEN Evidence
node scripts/validate-workflow-contracts.js → "Workflow contract validation passed"

## Deviations
None.
