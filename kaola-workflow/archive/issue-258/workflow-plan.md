# Workflow Plan — issue-258

<!-- plan_hash: 2d941e9aa6bb0182df8be4fe935c215db809c9142bc19877dd88970c72d49634 -->

## Meta
labels: enhancement

## Nodes
| id       | role          | depends_on | declared_write_set | cardinality | shape    |
|----------|---------------|------------|--------------------|-------------|----------|
| explore  | code-explorer | —          | —                  | 1           | sequence |
| impl     | tdd-guide     | explore    | scripts/kaola-workflow-repair-state.js, plugins/kaola-workflow/scripts/kaola-workflow-repair-state.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-repair-state.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-repair-state.js, scripts/simulate-workflow-walkthrough.js | 1 | sequence |
| review   | code-reviewer | impl       | —                  | 1           | sequence |
| finalize | finalize      | review     | CHANGELOG.md       | 1           | sequence |

## Node Ledger
| id       | status  |
|----------|---------|
| explore  | complete |
| impl     | complete |
| review   | complete |
| finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer (explore) | subagent-invoked | # Node explore — change map for #258 (verdict-check resume surface) | |
| tdd-guide (impl) | subagent-invoked | # Node impl — #258 verdict-check resume surface (tdd-guide) | |
| code-reviewer | subagent-invoked | # Node review — G1 gate for #258 (code-reviewer) | |
| finalize (finalize) | subagent-invoked | # Node finalize — sink for #258 | |
