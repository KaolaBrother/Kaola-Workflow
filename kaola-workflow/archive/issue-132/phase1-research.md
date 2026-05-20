# Phase 1 - Research / Discovery: issue-132

## Deliverable
Add missing `--keep-worktree` archive-commit logic to `cmdFinalize` in both GitLab and Gitea claim scripts, matching the GitHub baseline. Add regression tests in `test-gitlab-sinks.js` and `test-gitea-sinks.js`.

## Why
When `cmdFinalize --keep-worktree` is called from a linked worktree, the archive rename must be committed to the feature branch HEAD so the main worktree sees `kaola-workflow/archive/{project}/` instead of the live folder. GitHub's implementation already does this; GitLab and Gitea were missing the `else` block.

## Affected Area
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` — `cmdFinalize` else block
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` — `cmdFinalize` else block
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` — regression test
- `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` — regression test

## GitHub Issue
KaolaBrother/Kaola-Workflow#132

## Completeness Score
10/10

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | | internal patterns only |
