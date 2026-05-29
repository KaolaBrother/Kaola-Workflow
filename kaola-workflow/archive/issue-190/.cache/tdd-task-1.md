# TDD Task 1: T-M1a — Add Contract Assertions (RED guard)

## Result: RED CONFIRMED ✓

## Edits Made
Added 4 assertIncludes per edition after existing nextSkill assertion blocks:

- `scripts/validate-kaola-workflow-contracts.js` — after line 93
- `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` — after assertBefore line (~255)
- `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` — after assertBefore line (~262)

Assertions added (all 4 per edition):
- `'Startup Step 0a-1'`
- `'Branch: {branch from Sink block'`
- `'Workflow path: {fast|full'`
- `'Parallel decision: {green|yellow|red'`

## RED State Per Edition
| Validator | Exit | First failure |
|-----------|------|---------------|
| scripts/validate-kaola-workflow-contracts.js | 1 | must include: Startup Step 0a-1 |
| plugins/kaola-workflow-gitlab/.../validate-kaola-workflow-gitlab-contracts.js | 1 | must include: Startup Step 0a-1 |
| plugins/kaola-workflow-gitea/.../validate-kaola-workflow-gitea-contracts.js | 1 | must include: Startup Step 0a-1 |
