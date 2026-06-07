# Adaptive Workflow Plan — issue-278

<!-- plan_hash: 1c9d5a6aeaa42730d7bfd3e8bbe4be68c86ab98f2dda5a313f52080c8f4e8afc -->

bug(forge-parity): the GitLab/Gitea claim ports leak the `<!-- kw:claim project=<slug> -->`
marker comment on discard/release/finalize (same defect #275 fixed in the GitHub edition).
`clearAdvisoryClaim` in both ports removes the CLAIM_LABEL and posts a human-readable "cleared"
note but NEVER deletes the marker note, so the classifier's remote-claim detector
(`/<!--\s*kw:claim\s+(project|sess)=/`) keeps blocking re-claim of the same issue.

CHOSEN MARKER-DELETION CONTRACT (explicit; IDENTICAL across both editions — the implementer has
no latitude to diverge): mirror GitHub #275 exactly. `clearAdvisoryClaim` lists the issue
notes/comments and DELETEs the project-scoped marker `<!-- kw:claim project=<slug> -->` when the
kaola project slug (`folder.project`) is known, falling back to the generic regex
`/<!--\s*kw:claim\s+project=/` when the slug is null. This requires threading the project slug
into `clearAdvisoryClaim`; budget the signature change across ALL of its call sites (GitLab:
finalize, discard, MR merged, MR closed — and the Gitea equivalents), all of which live inside
the claim file already in each lane's write-set, so no extra files are pulled in. New forge
helpers — GitLab `deleteIssueNote(project, issueIid, noteId, opts)`
(DELETE /projects/:id/issues/:iid/notes/:note_id) and Gitea
`deleteIssueComment(project, issueNum, commentId, opts)`
(DELETE /api/v1/repos/<full_name>/issues/comments/<id>) — must be ADDED and EXPORTED in each
forge module (each already has create/list/update but no delete). Test-first: assert the DELETE
is invoked on the matched marker after discard/release, the project-scoped match is preferred
with the generic regex as fallback, a genuinely active claim from another live session still
blocks, and offline mode is unchanged.

VERIFICATION: the gate and finalize verification MUST run the full `npm test` (NOT only
`node scripts/simulate-workflow-walkthrough.js`) — the gitlab/gitea contract validators and the
port test files (test-gitlab-forge-helpers.js / test-gitea-forge-helpers.js) run ONLY under
`npm test`.

## Meta

labels: bug, area:scripts

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
| --- | --- | --- | --- | --- | --- |
| n1 | tdd-guide | — | plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-forge.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-forge-helpers.js | 1 | sequence |
| n2 | tdd-guide | n1 | plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js | 1 | sequence |
| n3 | code-reviewer | n2 | — | 1 | sequence |
| n4 | finalize | n3 | CHANGELOG.md | 1 | sequence |

non_tdd_reason: n/a — n1 and n2 are both tdd-guide; the marker-deletion behavior has a natural
failing unit test in each edition (assert the forge DELETE helper is invoked on the matched
`<!-- kw:claim project=<slug> -->` marker after `clearAdvisoryClaim`, with the project-scoped
match preferred, the generic-regex fallback, the active-other-session block, and the offline skip
as explicit cases). n1 and n2 are SEQUENCED (n2 depends_on n1) so they are not an antichain pair
— both lanes write under coarse area `plugins` (areaForPath only special-cases the vendored
`plugins/kaola-workflow/` GitHub edition; both port editions fall through to `plugins`), so
sequencing keeps them out of the #232 concurrent-sibling overlap check.

## Node Ledger

| id | status |
| --- | --- |
| n1 | complete |
| n2 | complete |
| n3 | complete |
| n4 | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1) | subagent-invoked | ## Evidence — Node n1 (GitLab lane) — Issue #278 | |
| tdd-guide (n2) | subagent-invoked | ## Evidence — Node n2 (Gitea lane) — Issue #278 (mirror of n1) | |
| code-reviewer | subagent-invoked | verdict: pass | |
| finalize (n4) | subagent-invoked | ## Evidence — Node n4 (finalize sink) — Issue #278 | |
