# Fast Summary: issue-230

## Status
PASSED

## Scope
- Write Set: plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js, plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js
- Acceptance: npm run test:kaola-workflow:gitlab && :gitea && npm test — 8 new tests assert classifyIssue + cmdClassify return target_unavailable on degraded exit-0 (empty / non-JSON); closed→red and open unchanged

## Plan
Mirror #218's fail-closed three-way into the GitLab/Gitea classifiers at 4 sites (classifyIssue + cmdClassify × 2 forges): after forge.viewIssue/catch and before the closed-check, a residual non-open/closed state returns the byte-identical catch-arm target_unavailable object. Root/Codex untouched (already fail-closed via direct JSON.parse). See .cache/planner.md.

## Implementation Evidence
- 4 guards inserted (gitlab classifyIssue :307-310 + cmdClassify :363-367; gitea :312-315 + :368-372), each byte-identical to its catch arm, excluding both 'open' and 'closed'.
- 8 tests written FIRST: RED before guards ("...must return target_unavailable, got: green") on both forges; GREEN after (all 8 PASSED).
- Independent re-run: node test-gitlab-workflow-scripts.js exit 0, test-gitea-workflow-scripts.js exit 0; npm run test:kaola-workflow:gitlab/:gitea exit 0.
- git diff --stat: 4 files (+284). No regression (closed→red, open→normal preserved).

## Review
PASS (code-reviewer, opus) — 0 CRITICAL/HIGH/MEDIUM, 1 LOW cosmetic (redundant state recompute, left as-is to minimize diff). Correctness traced through the forge parseJson({}) vector; no validator risk; RED-proven tests cover both functions × both degradation modes × both forges.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| tdd-guide | invoked | .cache/tdd-guide.md | |
| code-reviewer | invoked | .cache/code-reviewer.md | |

## Escalation
N/A
