# API

Document public APIs, endpoints, schemas, events, and integration contracts.

## Sink API

The Phase 6 sink is responsible for delivering completed work to the repository and updating GitHub/GitLab metadata.

### Merge Sink

- **Script**: `kaola-workflow-sink-merge.js` (GitHub) / `kaola-gitlab-workflow-sink-merge.js` (GitLab)
- **Invocation**: Called from Phase 6 Step 9 when `sink: merge` is configured
- **Contract**: Atomic fetch, rebase onto `origin/main`, fast-forward merge with race-condition retry (MAX_AUTOMERGE_RETRIES=3), branch deletion, and GitHub issue closure
- **Exit codes**:
  - `0`: merge succeeded, branch pushed, issue closed
  - `1`: merge failed (non-recoverable)
  - `2`: push/close failed (partial success)
  - `3`: merge-impossible error (branch protected, non-fast-forward, permission denied); auto-fallback to PR sink
- **Offline support**: `KAOLA_WORKFLOW_OFFLINE=1` skips all GitHub calls

### PR Sink

- **Script**: `kaola-workflow-sink-pr.js` (GitHub) / `kaola-gitlab-workflow-sink-mr.js` (GitLab)
- **Invocation**: Called from Phase 6 Step 9 when `sink: pr` is configured, or auto-fallback from merge sink exit 3
- **Contract**: Push branch, create PR/MR via `gh pr create` or `glab mr create`, record PR URL and number in workflow-state.md `## Sink` block, then create deliberate metadata follow-up commit (`chore: record PR metadata for {project}`) to leave worktree clean
- **Exit codes**:
  - `0`: PR/MR created successfully, metadata commit written, worktree clean
  - `1`: branch push or PR/MR creation failed
- **Metadata commit**: Automatic follow-up commit written by sink script after PR creation; not a user action
- **Offline support**: `KAOLA_WORKFLOW_OFFLINE=1` writes `OFFLINE_PLACEHOLDER` commit instead of real PR metadata
- **Config**: `pr_auto_merge` key in `~/.config/kaola-workflow/config.json` enables `gh pr merge --auto --squash --delete-branch` (GitHub only, non-fatal if disabled by branch protection rules)
