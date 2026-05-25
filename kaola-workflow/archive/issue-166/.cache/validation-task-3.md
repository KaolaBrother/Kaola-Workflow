# validation-task-3 — Wiring + docs (C1 install.sh, A3 docs/api.md) + final gate

## C1 install.sh
- Added `kaola-gitlab-workflow-closure-audit.js` to GitLab SUPPORT_SCRIPT_NAMES (alphabetical, after classifier, before compact-context).
- `bash -n install.sh` → syntax OK.
- `grep -n closure-audit install.sh` → 116 (GitHub, pre-existing), 139 (GitLab, new).

## A3 docs/api.md (4 edits)
- 627: heading → "Closure audit and repair (issue #165; GitLab port #166)".
- 713: new "#### GitLab edition (issue #166)" subsection (MR substitutions, lowercase state, forge-routed, offline/boundary identical).
- 747: flow-map row trailing text → "GitLab port shipped (#166, unarchived_mr_folders); Gitea deferred (#167)."; Follow-up col → #166.
- 757: #165 follow-up bullet → "GitLab port shipped (#166) ...; Gitea port remains as follow-up #167."

## Final gate
`npm run test:kaola-workflow:gitlab`:
- INITIAL FAIL: validate-kaola-workflow-gitlab-contracts.js — "test-gitlab-workflow-scripts.js must not execute or mention gh" (rule `/\bgh\b/` at validator:350). Cause: a comment at test:155 contained the literal token `gh`.
- FIX: Trivial Inline Edit — reworded comment "(not `gh`)" → "(GitLab CLI)".
- RE-RUN GREEN:
  - Vendored agent validation passed for 9 agents
  - Kaola-Workflow GitLab contract validation passed
  - GitLab workflow walkthrough simulation passed
  - GitLab Codex workflow walkthrough simulation passed

## GitHub regression check (shared install.sh touched)
`node scripts/simulate-workflow-walkthrough.js` → "Workflow walkthrough simulation passed" (all closure-audit GitHub tests still pass).
