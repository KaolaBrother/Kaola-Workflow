# Phase 3 - Plan: issue-72

## Tasks

| # | Name | Files | Validation |
|---|------|-------|------------|
| 1 | Add GitLab forge primitives | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-forge.js` | `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-forge-helpers.js` |
| 2 | Add focused helper tests | `plugins/kaola-workflow-gitlab/scripts/test-gitlab-forge-helpers.js` | same focused test |
| 3 | Run acceptance/static/full validation | phase evidence only | static `rg`, `npm run test:kaola-workflow:gitlab`, `npm test`, `bash -n install.sh uninstall.sh` |

## Acceptance Mapping

- Helper modules exist under GitLab plugin scripts: task 1 and task 2.
- No imports/requires/shell/path fallback into root or GitHub plugin: task 3 static guard.
- Helpers never execute `gh`: task 3 static guard and focused test runner assertion.
- Issue normalization preserves `number` from GitLab `iid` and `issue_iid`: task 2.
- MR normalization preserves `mr_iid`, `mr_url`/`web_url`, and normalized state: task 2.
- Durable note helper tests use API-returned IDs: task 2.
- Workflow labels preserved exactly: task 1 and task 2.
- Focused tests cover normalizers and offline helper behavior: task 2.
- Full `npm test` passes: task 3.

