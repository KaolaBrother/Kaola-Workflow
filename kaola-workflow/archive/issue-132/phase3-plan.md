# Phase 3 - Plan: issue-132

## Blueprint

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | Add `else` block in `cmdFinalize` after `removeWorktree` path | Missing archive-commit for `--keep-worktree` |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | Same | Same |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` | Add regression test for `finalize --keep-worktree` commits archive rename | Prevent regression |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` | Same | Same |

### Build Sequence
1. Modify GitLab claim script (no deps)
2. Modify Gitea claim script (no deps, parallel with 1)
3. Add regression tests to both sink test files

## Task List

### Task 1: Add else block to GitLab and Gitea cmdFinalize
- Write Set: both claim scripts, both test files
- Depends On: none
- Validate: `npm test`

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | | plan clear on first pass |
