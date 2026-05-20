# Phase 1 - Research / Discovery: issue-122

## Deliverable
Add `readConfig()` to the Gitea and GitLab PR/MR sink scripts so that `pr_auto_merge: true` / `mr_auto_merge: true` in `~/.config/kaola-workflow/config.json` activates auto-merge after PR/MR creation, matching the documented behavior and the GitHub baseline.

## Why
Gitea and GitLab Phase 6 docs promise config-driven auto-merge, but the dispatch only passes `--branch`, `--issue`, `--project` — the config is never consulted. Users who set `pr_auto_merge: true` or `mr_auto_merge: true` get no auto-merge request. This is a parity gap vs. GitHub.

## Affected Area
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-pr.js` — add `readConfig()` + auto-merge trigger
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-mr.js` — same
- `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` — add tests
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` — add tests

## Key Patterns Found

1. **GitHub baseline** — `scripts/kaola-workflow-sink-pr.js:34-47`: `readConfig()` reads `~/.config/kaola-workflow/config.json`, defaults `{ pr_auto_merge: false }`, merges with file contents. Called once before PR creation. Auto-merge trigger at lines 190-197: `if (config.pr_auto_merge === true) { try { ghExec(...) } catch (e) { warn } }`.

2. **Gitea sink gap** — `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-pr.js`: accepts `--auto-merge` flag (line 41) but dispatch never sends it; no `readConfig()` exists; auto-merge is dead code.

3. **GitLab sink gap** — `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-mr.js`: same structure, same gap.

4. **Dispatch is correct** — phase6.md commands and skills pass only `--branch`, `--issue`, `--project`. The config-internal pattern means dispatch stays unchanged.

5. **Forge layer works** — `kaola-gitea-forge.js:mergePullRequest(project, prNumber, opts)` and `kaola-gitlab-forge.js:mergeMergeRequest(mrIid, opts)` already accept `{ autoMerge, squash, removeSourceBranch }` — no forge changes needed.

6. **`withForge()`** test helper in test-gitea-sinks.js and test-gitlab-sinks.js is the scaffold for new tests.

## Test Patterns
- Framework: hand-rolled assert (no framework)
- Location: `test-gitea-sinks.js`, `test-gitlab-sinks.js`
- Structure: `withForge(stubbedForge, callback)` — replaces forge module in-process; new tests stub HOME via `process.env.HOME` and write config JSON to temp dir; assert merge called/not called

## Config & Env
- Config path: `~/.config/kaola-workflow/config.json`
- Gitea key: `pr_auto_merge` (bool, default false)
- GitLab key: `mr_auto_merge` (bool, default false)
- No new env vars

## External Docs
None.

## GitHub Issue
KaolaBrother/Kaola-Workflow#122

## Completeness Score
10/10

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | .cache/docs-lookup.md | Internal patterns sufficient |

## Notes / Future Considerations
- The `--auto-merge`, `--squash`, `--remove-source-branch` CLI flags in the sink scripts remain (they're part of the script API for programmatic use), but the config path is the documented activation mechanism.
