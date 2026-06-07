# Adaptive Workflow Plan — issue-275

<!-- plan_hash: 4e4dee16a9354598ffc20609659af9454e1f4b1287b82fc42c555cf9ae036f27 -->

bug(adaptive): `discard|release` leaves the `<!-- kw:claim project=N -->` marker comment, so
`issueHasRemoteClaimComment` blocks re-claim of the same issue for 24h. Preferred fix (a):
`clearAdvisoryClaim` deletes the marker comment at source (list issue comments, match
`<!-- kw:claim project=<project> -->`, `gh api -X DELETE .../issues/comments/{id}`), while still
posting the human-readable "cleared" comment. Test-first: assert the DELETE is invoked on the
matched marker after discard/release; a genuinely active claim from another live session still
blocks; offline mode unchanged.

## Meta

labels: bug, area:scripts

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
| --- | --- | --- | --- | --- | --- |
| n1 | tdd-guide | — | scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, scripts/simulate-workflow-walkthrough.js | 1 | sequence |
| n2 | code-reviewer | n1 | — | 1 | sequence |
| n3 | finalize | n2 | CHANGELOG.md | 1 | sequence |

non_tdd_reason: n/a — n1 is tdd-guide; the marker-deletion behavior has a natural failing unit
test (assert `gh api -X DELETE .../issues/comments/{id}` is invoked on the matched marker after
`clearAdvisoryClaim`, with the project-scoped match, the active-other-session block, and the
offline skip as explicit cases).

## Node Ledger

| id | status |
| --- | --- |
| n1 | complete |
| n2 | complete |
| n3 | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1) | subagent-invoked | # n1 · tdd-guide — clearAdvisoryClaim deletes the project-scoped kw:claim marker | |
| code-reviewer | subagent-invoked | # n2 · code-reviewer — G1 review gate (#275) | |
| finalize (n3) | subagent-invoked | # n3 · finalize — docs/state sink (#275) | |
