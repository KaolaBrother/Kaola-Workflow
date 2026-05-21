# Phase 1 - Research / Discovery: issue-150

## Deliverable

Add `readPriorityConfig(root)` and `priorityTier` helpers to GitLab and Gitea claim scripts. Update `listOpenIssues` in both to accept `root`, read config, and sort by priority tier then issue number — matching GitHub's behavior. Export `readPriorityConfig` from both. Add `readPriorityConfig` unit tests and a `listOpenIssues` priority sort test (including a non-P top-tier label case) to each forge test suite.

## Why

Priority label sorting is documented as cross-forge in README (lines 548-552) and in GitLab/Gitea init docs (workflow-init.md:135-136), but only GitHub implements it. GitLab/Gitea users who configure `priority_top_tier_labels` still get number-based ordering from `listOpenIssues`, making the feature silent for two of three forge editions.

## Affected Area

Implementation:
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` — add helpers + update listOpenIssues (lines 265-273)
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` — add helpers + update listOpenIssues (lines 268-276)

Reference (do not modify):
- `scripts/kaola-workflow-claim.js:65-102` — GitHub reference implementation

Tests:
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` — existing listOpenIssues test at line 325; add priority tests
- `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` — existing listOpenIssues test at line 332; add priority tests

## Key Patterns Found

1. `readPriorityConfig(root)` at `scripts/kaola-workflow-claim.js:65-73` — reads `<root>/kaola-workflow/config.json`, returns `priority_top_tier_labels` array or defaults to `['P0', 'P1']`. Exported at line 727.
2. `priorityTier(issue, topTierLabels)` at `scripts/kaola-workflow-claim.js:79-86` — P-number labels get numeric tier; custom top-tier labels get tier 1; else tier 99.
3. `withForge(stubs, fn)` pattern in GitLab/Gitea test files — monkey-patches forge module; use to stub `listIssues()` with label-bearing issue objects.
4. `normalizeIssue()` in `kaola-gitlab-forge.js:86` and `kaola-gitea-forge.js:113` — already coerces labels to `string[]` before `listOpenIssues` sees them, so `labelName()` normalization helper is NOT needed in GitLab/Gitea port.
5. `testReadPriorityConfig` at `scripts/simulate-workflow-walkthrough.js:1195-1220` — template for GitLab/Gitea equivalent unit tests.

## Test Patterns

- Framework: Node built-in `assert` module (no Jest/Mocha)
- Location: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`, `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- Structure: top-to-bottom synchronous execution; `withForge({listIssues() {...}}, fn)` stubs forge for isolated tests
- Existing listOpenIssues tests: GitLab line 325, Gitea line 332 — stub 3 issues (one closed), assert open subset in number order

## Config & Env

- `kaola-workflow/config.json` — repo-local, optional. Key: `priority_top_tier_labels: string[]`. Falls back to `['P0', 'P1']` when absent or non-array.
- No env vars relevant to this change.
- Do NOT use `readConfig()` from sink-mr/sink-pr scripts — those read `~/.config/kaola-workflow/config.json` for a different purpose.

## External Docs

N/A — internal patterns sufficient. No external library behavior needed.

## GitHub Issue

KaolaBrother/Kaola-Workflow#150

## Completeness Score

10/10

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | | All internal patterns; no external library/API/framework behavior needed |

## Notes / Future Considerations

- The issue explicitly allows documenting GitHub-only as an alternative. The research confirms the fix is mechanical (copy pattern, adapt for string[] labels) so implementation is preferred over docs-only.
- `listOpenIssues` priority sort tests don't exist even for GitHub — could add them there too, but that's out of scope for this issue.
- `readPriorityConfig` callers in GitLab/Gitea need `root` passed through. All adjacent claim functions already receive `root`; the wiring is straightforward.
