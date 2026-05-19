# Phase 1 - Research / Discovery: issue-112

## Deliverable
Three scripts in `plugins/kaola-workflow-gitea/scripts/`:
1. `kaola-gitea-workflow-sink-pr.js` — creates/finds Gitea PRs, updates workflow state
2. `kaola-gitea-workflow-sink-merge.js` — watches PR merge, closes issue, cleans up worktree
3. `test-gitea-sinks.js` — offline test suite for both scripts

## Why
Completes the sink layer for the Gitea forge edition. Without these scripts, Gitea-backed workflows cannot create PRs or auto-close issues after merge.

## Affected Area
`plugins/kaola-workflow-gitea/scripts/` (adding 3 files). Also consumes `../../../scripts/kaola-workflow-claim.js` for forge-agnostic worktree helpers.

## Key Patterns Found
1. GitLab model: `kaola-gitlab-workflow-sink-mr.js` + `kaola-gitlab-workflow-sink-merge.js` — primary mirror templates
2. `withForge(stubs, fn)` test shim: `test-gitlab-sinks.js:L1-L15` — monkey-patches live forge module for offline tests
3. Archive fallback: `resolveProjectFile()` in `kaola-gitlab-workflow-sink-merge.js:L85` — live path first, then `kaola-workflow/archive/{project}/`
4. Exit code contract: `kaola-gitlab-workflow-sink-merge.js` — 0=success, 2=FF exhausted, 3=merge-impossible (+ `sink-fallback.json`)
5. `mergePullRequest` signature: `kaola-gitea-forge.js:mergePullRequest(project, prNumber, opts)` — takes project object as first arg (unlike GitLab `mergeMergeRequest(mrIid, opts)`)
6. `createIssueComment(project, issueNum, body, opts)` — Gitea forge function (not `createIssueNote`)

## Test Patterns
- Framework: Node.js built-in `assert` (no external deps)
- Location: `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`
- Structure: mirror `test-gitlab-sinks.js` — sequential assertions, `withForge` shim, subprocess tests via `spawnSync`
- Coverage target: PR creation happy path, auto-merge gating, fallback merge, issue close, archive-guard cases (all from AC)

## Config & Env
- `KAOLA_WORKFLOW_OFFLINE=1` — skip all network/git/tea calls
- `KAOLA_WORKFLOW_FORCE_FF_FAIL=N` — force N FF failures for exit-2 test
- `KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE=<token>` — force exit-3 for test
- `KAOLA_WORKFLOW_DEBUG_CWD=<path>` — write CWD to file for subprocess test verification
- `pr_auto_merge` config flag (from `~/.config/kaola-workflow/config.json`) — not needed; forge.mergePullRequest handles auto-merge gating internally

## External Docs
None — all patterns from existing codebase. Gitea REST API already abstracted by `kaola-gitea-forge.js`.

## GitHub Issue
KaolaBrother/Kaola-Workflow#112

## Completeness Score
10/10

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | .cache/code-explorer.md | all patterns internal; Gitea REST already abstracted by forge adapter |

## Notes / Future Considerations
- Worktree helpers (`getCoordRoot`, `readActiveFolders`, `removeWorktree`) from `../../../scripts/kaola-workflow-claim.js` — issue #113 will create a Gitea claim script, but issue #112 must not wait; the helpers are forge-agnostic.
- `mr_auto_merge` MEDIUM follow-up from issue #114 is resolved here: use `pr_auto_merge` or check `forge.mergePullRequest` opts directly — the phase6.md command file can be updated in issue #112 or #115.
