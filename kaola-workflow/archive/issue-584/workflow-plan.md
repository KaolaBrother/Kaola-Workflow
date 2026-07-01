# Workflow Plan — issue #584

<!-- plan_hash: e8d66677dcc7b5f403afbaceb77fbb3e55fd86f352aa87ff9b149e78f5198fda -->

## Meta
labels: bug, workflow:queued
validation_command: node scripts/test-install-model-rendering.js && node scripts/validate-script-sync.js && node scripts/validate-kaola-workflow-contracts.js && node scripts/validate-workflow-contracts.js && npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea

## Plan Notes

Goal: make Codex install/preflight guidance prove V2 effort-safe subagent readiness without silently mutating user-owned global Codex config.

The current session cannot use Codex subagents because the project-local `.codex/agents/kaola-workflow/` profile directory is absent. The run will keep `delegation_policy: delegate` and record `local-fallback-tool-unavailable` compliance rows with the absent-path evidence for every delegated role.

Implementation scope:
- replace the whole-file `multi_agent_v2 = true` regex with a narrow table-aware detector that recognizes boolean, inline-object, and table-form V2 feature config only under `[features]` / `[features.multi_agent_v2]`;
- keep fail-closed behavior for missing, false, malformed, duplicate, or ambiguous settings, and keep warning suppression independent from V2 detection;
- add regression coverage for V1/V2 config shapes and doctor output across the maintained Codex preflight surfaces;
- update Codex install/init guidance to perform an agent-guided, read-only config audit, show the minimum required config posture, and require explicit user authorization before applying global config changes;
- document the design boundary and preserve the live effort-proof requirement from the existing runtime decision record without editing existing decision records.

Cross-edition rule: the preflight script is byte-identical across all four trees, and Codex init guidance is mirrored across GitHub/GitLab/Gitea command and skill surfaces. Synchronize the copies before validation.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model | non_tdd_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| n1-preflight-detector | tdd-guide | — | scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js, scripts/test-install-model-rendering.js, plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js, plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js | 8 | sequence | sonnet | — |
| n2-review | code-reviewer | n1-preflight-detector | — | 1 | sequence | opus | — |
| n3-install-guidance | doc-updater | n2-review | README.md, commands/workflow-init.md, plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md, plugins/kaola-workflow-gitlab/commands/workflow-init.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md, plugins/kaola-workflow-gitea/commands/workflow-init.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md, docs/decisions/D-584-01.md | 8 | sequence | sonnet | — |
| n4-finalize | finalize | n3-install-guidance | CHANGELOG.md | 1 | sequence | — | — |

## Node Ledger

| id | status |
| --- | --- |
| n1-preflight-detector | complete |
| n2-review | complete |
| n3-install-guidance | complete |
| n4-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-preflight-detector) | subagent-invoked | evidence-binding: n1-preflight-detector e37a4f2538e0 | |
| code-reviewer | subagent-invoked | evidence-binding: n2-review 0f094d089cc7 | |
| doc-updater (n3-install-guidance) | subagent-invoked | evidence-binding: n3-install-guidance 7ebac628acc9 | |
| finalize (n4-finalize) | main-session-direct | evidence-binding: n4-finalize 87a9b18673df | |
