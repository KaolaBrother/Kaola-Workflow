# Planner Output: issue-175

## Recommendation
Option A: Parallel Port (single PR, both forges together)

## Options Evaluated
- Option A: Parallel port (single PR) — LOW risk, LOW complexity
- Option B: Sequential forge-by-forge — LOW-MED risk (drift window), DOUBLE overhead
- Option C: Shared guard module — POOR architectural fit (plugin install isolation)

## Rationale for Option A
- Mechanical symmetric change; 6 files well within a single PR scope
- Atomic: no window where one edition is fixed but the other isn't
- Side-by-side diff in one PR is the cheapest asymmetry catch
- Matches existing copy-evolved per-edition pattern — no new abstractions

## Key Implementation Notes
- Two OFFLINE call sites per classifier: classifyIssue() AND cmdClassify() — BOTH need the guard
- Field name: `issue_iid` (not `issue_number`) in GitLab/Gitea active folder predicate
- Reasoning string: copy verbatim from GitHub classifier:339
- Guard placed inside existing `if (OFFLINE)` block, before `return classify(localRoadmapIssue(...))`

## What Must NOT Be Built
- No shared module extraction (Option C)
- No changes to GitHub edition (it's the reference)
- No new exit codes or output channels
- No refactoring of classifyIssue() signature

## Files
1. plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js (~lines 248, 288)
2. plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js (~line 414)
3. plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js (~lines 253, 293)
4. plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js (~line 403)
5. plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js (4 new assertions)
6. plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js (4 new assertions)

## Acceptance Check
npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea && npm test
