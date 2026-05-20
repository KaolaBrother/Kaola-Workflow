# Phase 6 - Summary: issue-122

## Issue
KaolaBrother/Kaola-Workflow#122 — Config-driven auto-merge for Gitea and GitLab sinks

## Deliverable
Added `readConfig()` and `maybeAutoMergeFromConfig()` to the Gitea and GitLab PR/MR sink scripts so that `pr_auto_merge: true` (Gitea) or `mr_auto_merge: true` (GitLab) in `~/.config/kaola-workflow/config.json` activates auto-merge after PR/MR creation, matching the GitHub baseline and documented behavior.

## Changes
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-pr.js` — added `os` require, `readConfig()`, `maybeAutoMergeFromConfig(pr, project, configOverride)`, updated `main()` with if/else if, added to exports
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-mr.js` — same pattern with `mr_auto_merge` key and no project param
- `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` — 3 new tests (config-true trigger, config-false skip, HOME-stub) with strong oracle
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` — mirror of Gitea tests
- `docs/api.md` — updated `pr_auto_merge` doc to say GitHub + Gitea; added `mr_auto_merge` doc for GitLab
- `CHANGELOG.md` — added Fixed entry for issue #122

## Final Validation

- `node plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`: PASS (3 new auto-merge tests + all existing)
- `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`: PASS (3 new auto-merge tests + all existing)
- `node scripts/simulate-workflow-walkthrough.js`: PASS
- `npm test`: PASS

## Design
- `--merge` CLI flag takes priority over config; OFFLINE skips both paths
- Config read internally in sink (dispatch unchanged)
- `configOverride` optional third param enables unit tests without HOME-stubbing
- `readConfig()` is read-only (no disk writes) — intentional divergence from GitHub baseline
