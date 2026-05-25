# doc-updater raw output — issue-166 (model=haiku)

## Files changed
1. CHANGELOG.md — added `### Added` entry under `## [Unreleased]` for #166 (GitLab closure-audit parity port; forge-routed; unarchived_mr_folders lowercase MR state; listIssues labels opt + roadmapDir export; install.sh registration; tests; docs/api.md GitLab subsection; Gitea follow-up #167; closes #166).
2. README.md — updated the closure-audit scripts-table row (~line 494) to cover both editions: `kaola-workflow-closure-audit.js (GitHub) / kaola-gitlab-workflow-closure-audit.js (GitLab)`, noting GitLab uses `unarchived_mr_folders` with lowercase MR state.

## No-impact (recorded)
- docs/api.md — already updated in Phase 4 (Task 3); not re-edited.
- .env.example — no new env vars (only pre-existing KAOLA_WORKFLOW_OFFLINE).
- docs/architecture.md — no per-edition script enumeration; adding a parity script doesn't change the documented architecture/sink flow. No update.
- Inline comments — handled in code phase.

## Orchestrator verification
git diff confirms both edits are accurate, well-formed, and match the existing #165 entry style. CHANGELOG retains the `## [3.15.0]` heading (validate-workflow-contracts CHANGELOG-version guard unaffected). Minor wording "satisfies #161 AC5" carried from the #165 entry — defensible (GitLab now also satisfies the contract); left as-is.
