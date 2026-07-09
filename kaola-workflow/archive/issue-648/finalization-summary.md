# Finalization - Summary: issue-648

## Delivered

- Additive self-host `chains_stale` diagnostic fields and walkthrough coverage.
- Stamp-last finalization prose and consumer final-validation citation prose across routing surfaces.
- Documentation updates in `docs/api.md` and `docs/decisions/D-648-01.md`.
- CHANGELOG update and roadmap refresh recorded by n7-finalize.

## Final Validation Evidence

- `node scripts/kaola-workflow-plan-validator.js kaola-workflow/issue-648/workflow-plan.md --finalize-check --json` -> `{"result":"pass","mode":"chain-receipt","checkedChanges":54,"chains":[{"name":"claude","exitCode":0,"accepted_red":false},{"name":"codex","exitCode":0,"accepted_red":false},{"name":"gitlab","exitCode":0,"accepted_red":false},{"name":"gitea","exitCode":0,"accepted_red":false}]}`
- Archived evidence path: `kaola-workflow/archive/issue-648/.cache/chain-receipt.json`.

## Documentation Docking

- `docs_updated: docs/api.md; docs/decisions/D-648-01.md` per `kaola-workflow/archive/issue-648/.cache/n5-docs.md`.
- `changelog_updated: CHANGELOG.md` and `roadmap_refresh: node scripts/kaola-workflow-roadmap.js generate -> up-to-date; node scripts/kaola-workflow-roadmap.js validate -> ok` per `kaola-workflow/archive/issue-648/.cache/n7-finalize.md`.

## Run gaps

- in_run_repair (n2-stale-culprits): noise: resolved in-run per n4-review R1 and n7-finalize run_gap_status.
- in_run_repair (n4-review): noise: resolved in-run per n4-review R1 and n7-finalize run_gap_status.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer (n1-explore) | subagent-invoked | evidence-binding: n1-explore 51876192226e | |
| tdd-guide (n2-stale-culprits) | subagent-invoked | group_passed | |
| implementer (n3-runtime-prose) | subagent-invoked | deferred_to_group | |
| code-reviewer | subagent-invoked | evidence-binding: n4-review 2da7266a4a5c | |
| doc-updater (n5-docs) | subagent-invoked | evidence-binding: n5-docs 0ed5bca52ad1 | |
| adversarial-verifier (n6-adversarial) | subagent-invoked | evidence-binding: n6-adversarial c35a0f74e153 | |
| finalize (n7-finalize) | main-session-direct | evidence-binding: n7-finalize 846d7b8aab38 | |
| finalization contractor | subagent-invoked | closure receipt `finalize_contractor_attested: attested` | |
