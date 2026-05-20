# Planner Output — issue-122

## Recommendation: Option A — Add readConfig() to Gitea and GitLab sink scripts

### Rationale
The GitHub baseline establishes the architecture: the sink reads config internally; dispatch stays unaware. Option A restores parity by following that exact pattern. Forge layer and dispatch are complete; only the config-read-and-trigger wiring is missing in the two sink scripts.

### Key Design Decision: `--merge` Priority
When both `args.merge` (CLI flag) and `config.pr_auto_merge` are set, `--merge` wins:
```js
if (args.merge && !OFFLINE) mergePullRequest(pr, project, args);
else if (!OFFLINE) maybeAutoMergeFromConfig(pr, project);
```
OFFLINE skips both.

### Implementation Steps
1. Gitea: add `os` require, `readConfig()`, `maybeAutoMergeFromConfig()` export, wire in `main()`
2. GitLab: same, key = `mr_auto_merge`, function calls `mergeMergeRequest(mr.mr_iid, ...)`
3. Tests for each: positive (config true → merge called), negative (false → not called), HOME-stub test

### Config
- Gitea key: `pr_auto_merge` (default false)
- GitLab key: `mr_auto_merge` (default false)
- Path: `~/.config/kaola-workflow/config.json`
- Hardcoded: `autoMerge: true, squash: true, removeSourceBranch: true` (matches GitHub baseline)

### Out of Scope
- Do NOT change phase6.md commands or SKILL.md files
- Do NOT modify forge layer
- Do NOT add new config keys or CLI flags
- Do NOT read config inside ensurePullRequest/ensureMergeRequest
