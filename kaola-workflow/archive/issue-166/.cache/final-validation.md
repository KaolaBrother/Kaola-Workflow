# final-validation — issue-166 (Phase 6)

## Command (authoritative final gate)
`npm test` — runs all four editions + validators:
- test:kaola-workflow:claude — validate-script-sync, validate-vendored-agents, bash -n install/uninstall, package.json parse, agent-model-resolver, install-model-rendering, install-upgrade-rewrite, validate-workflow-contracts, simulate-workflow-walkthrough
- test:kaola-workflow:codex — validate-script-sync, validate-kaola-workflow-contracts, simulate-kaola-workflow-walkthrough
- test:kaola-workflow:gitlab — validate-vendored-agents, validate-kaola-workflow-gitlab-contracts, simulate-gitlab-workflow-walkthrough, simulate-gitlab-codex-workflow-walkthrough
- test:kaola-workflow:gitea — validate-vendored-agents, validate-kaola-workflow-gitea-contracts, simulate-gitea-workflow-walkthrough, simulate-gitea-codex-workflow-walkthrough

## Result: PASS (exit 0)
- validate-script-sync: "OK: 10 common scripts and 2 byte-identical file group in sync." (new GitLab script has no sync obligation — confirmed)
- Claude/GitHub walkthrough passed (incl. all closure-audit GitHub tests — no regression from shared install.sh edit)
- Codex contract + walkthrough passed
- GitLab contract validation passed + both GitLab walkthroughs passed (incl. 11 new closure-audit tests via test-gitlab-workflow-scripts.js dispatched by the walkthrough)
- Gitea contract + both walkthroughs passed (no impact — #167 not yet implemented)

## Classification: all green; no routing needed.
Covers Phase 4 + Phase 5 targeted commands (dedup) — no files changed since the Task 3 comment-reword fix.
