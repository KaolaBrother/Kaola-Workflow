# Adaptive Workflow Plan — issue-296

<!-- plan_hash: e98be63d5aada3b67139a1e515fa1c5aa9a34939c7a8d3ef476404f0bb262453 -->

bug(adaptive/finalize): worktree finalize is not crash-resumable — cmdFinalize commits
the archive before the implementation commit.

## Meta

labels: bug, area:scripts, area:workflow-phases

The finalize terminal routine makes two commits — `cmdFinalize`'s `chore: archive {project}`
(claim.js cmdFinalize) then the contractor's implementation commit (`chore: finalize {project}`).
A crash BETWEEN them leaves the active folder archived-and-committed but the entire
implementation still uncommitted, and the standard resume path cannot re-enter (it assumes an
active, non-archived `kaola-workflow/{project}/` folder). The per-node loop is crash-resumable;
the terminal routine is not. The fix space (architect's runtime call): (A) commit implementation
first then archive last; (B) make finalize idempotent/resumable when already archived; (C) one
atomic finalize commit covering archive + implementation. All three options land on `cmdFinalize`
in `claim.js` (×4 editions: root `scripts/`, github plugin mirror, edition-named gitlab/gitea
ports). The order-bearing procedure prose lives in `agents/contractor.md` and
`commands/kaola-workflow-finalize.md` (×3 editions) and is updated AFTER code review so it reflects
the reviewed, final commit ordering. The codex `contractor.toml` order prose is deliberately OUT of
this frozen plan — whether it needs editing is contingent on the chosen option (only option A moves
the external procedure); the code-reviewer gate over the code node is the safety net and
plan-repair-via-`--freeze` is the mechanism if option A is selected (#304 precedent that `.toml`
prose-consistency is deferrable without breaking acceptance criteria).

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
|----|------|------------|--------------------|-------------|-------|
| n1 | code-architect | — | — | 1 | sequence |
| n2 | tdd-guide | n1 | scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js, scripts/simulate-workflow-walkthrough.js | 1 | sequence |
| n3 | code-reviewer | n2 | — | 1 | sequence |
| n4 | doc-updater | n3 | agents/contractor.md, commands/kaola-workflow-finalize.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md | 1 | sequence |
| n5 | finalize | n4 | CHANGELOG.md, kaola-workflow/issue-296/workflow-state.md | 1 | sequence |

## Node Ledger

| id | role | status |
|----|------|--------|
| n1 | code-architect | complete |
| n2 | tdd-guide | complete |
| n3 | code-reviewer | complete |
| n4 | doc-updater | complete |
| n5 | finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect (n1) | subagent-invoked | ## n1 code-architect evidence | |
| tdd-guide (n2) | subagent-invoked | ## n2 tdd-guide evidence | |
| tdd-guide (n2) | subagent-invoked | ## n2 tdd-guide evidence | |
| code-reviewer | subagent-invoked | verdict: pass | |
| doc-updater (n4) | subagent-invoked | ## n4 doc-updater evidence | |
| finalize (n5) | subagent-invoked | ## n5 finalize evidence | |
