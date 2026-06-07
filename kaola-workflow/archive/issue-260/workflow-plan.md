# Workflow Plan — issue #260

<!-- plan_hash: cea557e6e7cef6191a13909505f70584b67f7f410ce3df515b3ad819dac48374 -->

## Meta
labels: bug, area:scripts, area:workflow-phases

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
|----|------|------------|--------------------|-------------|-------|
| plan | planner | — | — | 1 | sequence |
| impl-core | tdd-guide | plan | scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, scripts/simulate-workflow-walkthrough.js | 1 | sequence |
| impl-forge | implementer | impl-core | plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js, plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js | 1 | sequence |
| impl-docs | implementer | impl-forge | docs/api.md, docs/architecture.md | 1 | sequence |
| review | code-reviewer | impl-docs | — | 1 | sequence |
| finalize | finalize | review | CHANGELOG.md | 1 | sequence |

## Node Ledger

| id | status |
|----|--------|
| plan | complete |
| impl-core | complete |
| impl-forge | complete |
| impl-docs | complete |
| review | complete |
| finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner (plan) | subagent-invoked | # Implementation Plan: NATIVE=0 in-place feature-branch creation (issue #260, Op | |
| tdd-guide (impl-core) | subagent-invoked | # Node impl-core (tdd-guide) — evidence | |
| implementer (impl-forge) | subagent-invoked | # Node impl-forge (implementer) — evidence | |
| implementer (impl-docs) | subagent-invoked | # Node impl-docs (implementer) — evidence | |
| code-reviewer | subagent-invoked | # Node review (code-reviewer, G1) — evidence | |
| finalize (finalize) | subagent-invoked | # Node finalize (sink) — evidence | |
