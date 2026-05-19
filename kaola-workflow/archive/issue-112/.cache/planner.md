# Planner Output — Issue 112

## Recommended Approach: B — Direct port with localized adaptation

Keep file structure 1:1 with GitLab (same exported function names, same control flow, same exit codes 0/2/3, same OFFLINE/FORCE_FF_FAIL/FORCE_MERGE_IMPOSSIBLE hooks). Adapt only what the Gitea API requires:

### Key Adaptations

1. **forge.js**: Add `checkRepoSquashEnabled(project, opts)` inside `mergePullRequest` when `options.squash`. Export the new function.
2. **sink-pr.js**: Port of `kaola-gitlab-workflow-sink-mr.js`. Adaptations:
   - `forge.listPullRequests` / `forge.createPullRequest` / filter by `source_branch`
   - Persist `full_name`, `project_html_url`, `pr_number`, `pr_url` to `## Sink` block
   - `forge.mergePullRequest(project, prNumber, opts)` wrapper
3. **sink-merge.js**: Port of `kaola-gitlab-workflow-sink-merge.js`. Adaptations:
   - `require('../../../scripts/kaola-workflow-claim')` for `getCoordRoot`, `readActiveFolders`, `removeWorktree`
   - `readProjectInfo(root, project)` reads `full_name`/`project_html_url` from state file
   - `forge.createIssueComment(projectInfo, issueNum, body)` replaces `createIssueNote`
   - All bug-fix blocks (archive guards, exit codes, FF retry, classifyMergeError) ported unchanged
4. **test-gitea-sinks.js**: Port of `test-gitlab-sinks.js`. Adaptations:
   - `withForge` stubs swap MR→PR function names and assert `project.full_name`
   - State/summary assertions check `sink: pr`, `pr_url`, `pr_number`
   - Two new blocks: squash-disabled error, server-version <1.17 error on auto-merge

## Out of Scope
- Do NOT create `kaola-gitea-workflow-claim.js` (issue #113)
- Do NOT modify base scripts/ or gitlab plugin
- Do NOT add speculative forge functions

## Task Order
1. `kaola-gitea-forge.js` (add `checkRepoSquashEnabled`)
2. `test-gitea-forge-helpers.js` (add squash-gate tests)  
3. `kaola-gitea-workflow-sink-pr.js` (new)
4. `kaola-gitea-workflow-sink-merge.js` (new)
5. `test-gitea-sinks.js` (new)
