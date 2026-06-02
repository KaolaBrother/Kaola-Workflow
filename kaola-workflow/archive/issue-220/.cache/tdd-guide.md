# Fast Executor (tdd-guide) — issue-220

## Diff applied (scripts/validate-script-sync.js only)
- Edit B: removed `'kaola-workflow-resolve-agent-model.js',` from COMMON_SCRIPTS (11 → 10).
- Edit A: added 3rd BYTE_IDENTICAL_GROUP 'resolve-agent-model module copies' with the 4 copies (root reference first).

## RED→GREEN proof
- Baseline after fix: `OK: 10 common scripts and 3 byte-identical file group in sync.` exit 0
- GitLab copy perturbed → exit 1: "resolve-agent-model module copies: plugins/kaola-workflow-gitlab/scripts/kaola-workflow-resolve-agent-model.js differs from scripts/..."
- GitLab reverted → exit 0
- Gitea copy perturbed → exit 1 (analogous gitea drift line)
- Gitea reverted → exit 0

## Chain regression
- npm run test:kaola-workflow:claude → exit 0
- npm run test:kaola-workflow:codex → exit 0

## Tree
Only scripts/validate-script-sync.js modified (plus pre-existing untracked design doc + the issue-220 workflow folder).
