# Workflow Plan — issue-300

<!-- plan_hash: 55ff4c17becdfdba2c90851a36165e499e184ca0507854239d9984a0df1f55ee -->

Port `checkDispatchAttestations` into the GitLab and Gitea `sink-merge.js` closure-receipt
paths so a forge-edition sink-merge close populates the documented `claim_planner_attested` /
`finalize_contractor_attested` fields (yielding `missing`/`attested`) instead of retaining the
stale `emptyReceipt` `failed` default — matching the github call count. Mirrors #286 R2.

The fix is a behavior-preserving-shaped forge port that CHANGES the closure-receipt output
(AC2). A meaningful failing-first test exists: `test-{forge}-sinks.js` already parses
`closure_receipt` fields, so a RED assertion (attestation field == `missing`, not `failed`)
fails before the port and passes after — hence `tdd-guide` (test-first), per AC3's explicit
"parity with #286's github watch-pr RED test".

The two forge ports cannot run concurrently: `areaForPath` collapses both
`plugins/kaola-workflow-gitlab/...` and `plugins/kaola-workflow-gitea/...` to coarse-area
`plugins` (only `plugins/kaola-workflow/` — the Codex tree — is special-cased), and `plugins`
is not in `SHARED_INFRA`, so any two write-nodes touching them are disjointness-RED. The
sequence (gitlab → gitea) is therefore the only legal shape, not a clamp.

No `doc-updater`: the `closure_receipt` schema/enums in `docs/api.md` are unchanged (the field
is already documented); this populates an already-documented field on the forge runtime path.
CHANGELOG via the finalize sink covers the user-visible parity fix.

## Meta
labels: enhancement, area:scripts

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
| --- | --- | --- | --- | --- | --- |
| port-gitlab | tdd-guide | — | plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js | 1 | sequence |
| port-gitea | tdd-guide | port-gitlab | plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js, plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js | 1 | sequence |
| review | code-reviewer | port-gitea | — | 1 | sequence |
| finalize | finalize | review | CHANGELOG.md | 1 | sequence |

## Node Ledger

| id | status | notes |
| --- | --- | --- |
| port-gitlab | complete | |
| port-gitea | complete | |
| review | complete | |
| finalize | complete | |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (port-gitlab) | subagent-invoked | ## port-gitlab evidence | |
| tdd-guide (port-gitea) | subagent-invoked | ## port-gitea evidence | |
| code-reviewer | subagent-invoked | verdict: pass | |
| finalize (finalize) | subagent-invoked | ## finalize evidence | |
