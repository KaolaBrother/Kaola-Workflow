# final-validation — issue-218

## Command
`npm test` (full suite: test:kaola-workflow:claude && :codex && :gitlab && :gitea)

## Result: PASS (all four editions)
- claude: `Workflow walkthrough simulation passed` (incl. validate-workflow-contracts, test-fast-audit, model resolver, install rendering/upgrade, release-surface-drift).
- codex: `OK: 11 common scripts and 2 byte-identical file group in sync.` + `Kaola-Workflow Codex contract validation passed` + `Kaola-Workflow walkthrough simulation passed`.
- gitlab: `Vendored agent validation passed for 9 agents` + `Kaola-Workflow GitLab contract validation passed` + `GitLab workflow walkthrough simulation passed` + `GitLab Codex workflow walkthrough simulation passed`. (The gitlab walkthrough runs test-gitlab-workflow-scripts.js → the new probe tests.)
- gitea: vendored agents + `Kaola-Workflow Gitea contract validation passed` + `Gitea workflow walkthrough simulation passed` + `Gitea Codex workflow walkthrough simulation passed`. (Runs test-gitea-workflow-scripts.js → the new probe tests.)

The `&&` chain printing the final gitea banner proves every prior step exited 0. (zsh `${PIPESTATUS[0]}` after a `| tail` pipe rendered blank — display quirk, not a failure; the success banners are definitive.)

## Targeted port runs (also confirmed directly, Phase 4 + Phase 5)
- `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` → "GitLab workflow script tests passed" (3 new tests).
- `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` → "Gitea workflow script tests passed" (3 new tests).
- both contract validators → passed.

## Coverage
No coverage instrumentation exists in this repo (CLAUDE.md: "Node scripts only, no formal pipeline"; tests are hand-rolled assertion suites). Coverage % unavailable — justified by project convention. The change is fully covered by the 6 new assertion-based tests (empty + non-JSON exit-0 per port, plus residual-branch withForge per port) plus regression via the full walkthrough suite.

## Classification
No failures. No fix routing needed.
