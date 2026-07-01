# Workflow Plan - issue #582

<!-- plan_hash: 10511f2ba1e3a2554d8aa096935ba6fef392238b68ea17cc86f65884023c16f1 -->

## Meta
labels: bug, area:scripts, area:workflow-phases
goal: restore fail-closed Codex tiered dispatch after local V2 effort proof refuted high override
validation_command: node scripts/validate-workflow-contracts.js && node scripts/validate-kaola-workflow-contracts.js && node scripts/test-route-reachability.js && npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea

## Plan Notes

Post-merge installed-runtime validation refuted the assumed V2 effort override path:
the `high` probe used `fork_turns: "none"` and `reasoning_effort: "high"`, but the
child session JSONL recorded `turn_context.effort: "xhigh"`. The repo-side fix is
therefore fail-closed guidance and pinned validation: no tiered Codex dispatch may
claim effort safety from V2/config/descriptor text alone.

Implementation scope:
- update all six plan-run command/skill surfaces so V2 and V1 tiered Codex
  dispatch both require a fresh child-session proof for the requested effort;
- keep absent/blank tiers as the only intentional inheritance path;
- pin the new proof requirement in the route-reachability and contract validators;
- add a decision record for the local refutation and update the API contract;
- update the changelog.

The current session will execute locally and record local fallback evidence because
the active policy does not allow workflow-role subagent delegation for this fix.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model | non_tdd_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| n1-fail-closed-contract | tdd-guide | - | commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md, scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, scripts/validate-kaola-workflow-contracts.js, scripts/test-route-reachability.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js | 12 | sequence | sonnet | - |
| n2-doc-runtime-proof | doc-updater | n1-fail-closed-contract | docs/api.md, docs/decisions/D-582-02.md | 2 | sequence | sonnet | - |
| n3-review | code-reviewer | n2-doc-runtime-proof | - | 1 | sequence | opus | - |
| n4-finalize | finalize | n3-review | CHANGELOG.md | 1 | sequence | - | - |

## Node Ledger

| id | status |
| --- | --- |
| n1-fail-closed-contract | complete |
| n2-doc-runtime-proof | complete |
| n3-review | complete |
| n4-finalize | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-fail-closed-contract) | local-fallback-tool-unavailable | .cache/n1-fail-closed-contract.md | Active session policy disallowed workflow-role subagent delegation; work executed inline with RED/GREEN evidence. |
| doc-updater (n2-doc-runtime-proof) | local-fallback-tool-unavailable | .cache/n2-doc-runtime-proof.md | Active session policy disallowed workflow-role subagent delegation; docs updated inline from verified source and live JSONL evidence. |
| code-reviewer | local-fallback-tool-unavailable | .cache/n3-review.md | Active session policy disallowed workflow-role subagent delegation; detached review executed inline with pass verdict. |
| finalize (n4-finalize) | main-session-direct | .cache/n4-finalize.md | |
