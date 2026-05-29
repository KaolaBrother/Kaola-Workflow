# Phase 1 - Research / Discovery: issue-196

## Deliverable
Fix `KAOLA_WORKFLOW_OFFLINE=1 npm test` to be fully green by adding the missing `KAOLA_WORKFLOW_OFFLINE: '0'` subprocess env override to the GitLab walkthrough's `testAuditAndRepairLabels` function (3 `spawnSync` calls). Verify Gitea is already fixed.

## Why
`KAOLA_WORKFLOW_OFFLINE=1` is documented as "Skip GitHub/GitLab/Gitea calls for local tests or air-gapped usage", implying a clean local test run. The GitLab edition currently fails under this mode, breaking that contract.

## Affected Area
- `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` — lines 84–151, `testAuditAndRepairLabels` (3 inline `spawnSync` env objects missing `KAOLA_WORKFLOW_OFFLINE: '0'`) — **primary bug**
- `plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js` — lines 107–120, `_runClaimOnline` already has override at line 112; verify empirically
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` — OFFLINE short-circuit at line 1053 (`cmdAuditLabels`) and line 1061 (`cmdRepairLabels`)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-forge.js` — second OFFLINE gate at `glabExec` line 20

## Key Patterns Found
1. GitHub edition: `KAOLA_WORKFLOW_OFFLINE: '0'` in `runClaimOnline` env — `scripts/simulate-workflow-walkthrough.js:546`
2. Gitea edition: same override in `_runClaimOnline` — `plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js:112`
3. GitLab edition: 3 inline `spawnSync` calls (no helper) with `Object.assign({}, process.env, { KAOLA_GLAB_MOCK_SCRIPT: mockScript })` — no OFFLINE override — `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js:111,123,137`

## Test Patterns
- Framework: hand-rolled assert (`assert()` function, no test framework)
- Location: `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js`, `plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js`, `scripts/simulate-workflow-walkthrough.js`
- Structure: sequential named test functions called directly; `spawnSync` for subprocess, `assert(actual, expected, msg)` helper

## Config & Env
- `KAOLA_WORKFLOW_OFFLINE=1` — skips all forge CLI calls; must be overridden to `'0'` in mock-online subprocess env
- `KAOLA_GLAB_MOCK_SCRIPT` — points to mock glab binary for GitLab
- `KAOLA_TEA_MOCK_SCRIPT` — points to mock tea binary for Gitea
- `KAOLA_GH_MOCK_SCRIPT` — GitHub equivalent

## External Docs
None — internal Node.js subprocess env pattern only.

## GitHub Issue
KaolaBrother/Kaola-Workflow#196

## Completeness Score
10/10

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | .cache/docs-lookup.md | pure internal subprocess env pattern, no external library |

## Notes / Future Considerations
- The GitLab walkthrough inlines 3 separate `spawnSync` calls rather than using a helper like Gitea's `_runClaimOnline`. The minimal fix adds `KAOLA_WORKFLOW_OFFLINE: '0'` to each of the 3 env objects. A refactor to a `_runClaimOnline` helper would be cleaner but is out of scope for this bug fix.
- Gitea must be verified empirically with `KAOLA_WORKFLOW_OFFLINE=1 npm run test:kaola-workflow:gitea` before and after to confirm no regression.
- The AC says "decide the contract" but the code already makes the intent clear: GitHub and Gitea pass with mock-online override, so the contract is "full suite passes under OFFLINE=1". No documentation change is needed — just fix the GitLab gap.
