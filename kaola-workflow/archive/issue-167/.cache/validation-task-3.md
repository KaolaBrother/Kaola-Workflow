# validation-task-3 — Wiring (C1 install.sh, C4 contract-validator arrays, A3 docs)

## C1 install.sh
- Added `kaola-gitea-workflow-closure-audit.js` to Gitea SUPPORT_SCRIPT_NAMES after classifier (line 165).
- `bash -n install.sh` → syntax OK. `grep -n kaola-gitea-workflow-closure-audit.js install.sh` → 165.

## C4 contract-validator arrays
- Added `kaola-gitea-workflow-closure-audit.js` to BOTH scriptFiles (after classifier 150) and installSupportScripts (after classifier 168).
- `node validate-kaola-workflow-gitea-contracts.js` → "Kaola-Workflow Gitea contract validation passed" (now asserts the new script exists + is in install.sh; forbidden-token loop re-scanned, 0 glab).

## A3 docs/api.md (4 edits)
- 627: heading → "...; Gitea port #167".
- 733: new "#### Gitea edition (issue #167)" subsection (keeps unarchived_pr_folders/pr_url/pr_state, lowercase PR state, viewPullRequest takes number, forge.updateIssueLabels(project,n,{remove})).
- 768: flow-map row → "Gitea port shipped (#167, kaola-gitea-workflow-closure-audit.js, keeps unarchived_pr_folders)"; Follow-up cell → ~~#166~~ ~~#167~~.
- 778: #165 follow-up bullet → "Gitea port shipped (#167) ... Cross-forge closure-audit coverage is now complete."

## Task gate
`npm run test:kaola-workflow:gitea` → PASS: vendored agents, Gitea contract validation, Gitea workflow walkthrough, Gitea Codex walkthrough all passed. Exit 0.
(Full cross-edition npm test + GitHub regression run in Phase 6.)
