# Workflow Plan — issue #274

<!-- plan_hash: 9f1bd2eb75d6e36597c4fad944f3eb452167aede109f455dc99825bd7f773c60 -->

## Meta
labels: enhancement, area:scripts, area:workflow-phases

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
|----|------|------------|--------------------|-------------|-------|
| explore | code-explorer | — | — | 1 | sequence |
| design | planner | explore | — | 1 | sequence |
| impl | tdd-guide | design | scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js, scripts/validate-script-sync.js, scripts/simulate-workflow-walkthrough.js | 1 | sequence |
| review | code-reviewer | impl | — | 1 | sequence |
| docs | doc-updater | review | docs/api.md, docs/architecture.md | 1 | sequence |
| finalize | finalize | review, docs | CHANGELOG.md | 1 | sequence |

## Node Ledger

| id | status |
|----|--------|
| explore | complete |
| design | complete |
| impl | complete |
| review | complete |
| docs | complete |
| finalize | in_progress |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer (explore) | subagent-invoked | # Node `explore` evidence — issue #274 (sync-group write-set gap at freeze) | |
| planner (design) | subagent-invoked | # Implementation Blueprint — Issue #274 (sync-group write-set gap at freeze) | |
| tdd-guide (impl) | subagent-invoked | # Node `impl` evidence — issue #274 (tdd-guide RED→GREEN) | |
| code-reviewer | subagent-invoked | # Node `review` evidence — issue #274 (code-reviewer gate, post-dominates impl) | |
| doc-updater (docs) | subagent-invoked | # Node `docs` evidence — issue #274 (doc-updater) | |
