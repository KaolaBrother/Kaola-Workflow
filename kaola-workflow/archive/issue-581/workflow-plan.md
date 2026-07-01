# Workflow Plan — issue #581

<!-- plan_hash: 9f4c974139aa140e05e5e047f983edf151a0c27427bce825261701d5f7249bdc -->

## Meta
labels: enhancement, area:scripts, area:workflow-phases
validation_command: node scripts/simulate-workflow-walkthrough.js && npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea

## Plan Notes

Goal: ship a Codex-aware global dispatch/profile contract for the open issue. The work is coupled because the Codex profile installer, preflight schema, adaptive node dispatch descriptor, plan-run instructions, and profile TOMLs must agree across all maintained Codex/forge surfaces.

This session cannot spawn subagents under the active session policy, and the project-local `.codex/agents/kaola-workflow/` profile directory is absent. The executor will run the role work inline and record `local-fallback-tool-unavailable` compliance rows with that evidence rather than claiming delegated subagent execution.

Implementation scope:
- render `description` and `nickname_candidates` from `config/agents.toml` into every standalone role TOML installed under `agents/kaola-workflow`;
- validate those fields in installer and preflight schema checks;
- expose Codex dispatch mode metadata and a stable v2 task-name sanitizer from adaptive-node dispatch descriptors;
- update plan-run command/skill guidance to use v2 task names when available and direct per-spawn reasoning effort in both v1 and v2;
- remove stale current-guidance prose that says Codex lacks a per-spawn effort override;
- add focused unit/schema tests and keep generated edition surfaces synchronized.

Cross-edition rule: changes to generated aggregators and byte-identical groups must be propagated with `npm run sync:editions`, then proved by the four edition chains.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model | non_tdd_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| n1-codex-dispatch-contract | tdd-guide | — | scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow/scripts/install-codex-agent-profiles.js, plugins/kaola-workflow-gitlab/scripts/install-codex-agent-profiles.js, plugins/kaola-workflow-gitea/scripts/install-codex-agent-profiles.js, plugins/kaola-workflow/agents/adversarial-verifier.toml, plugins/kaola-workflow/agents/build-error-resolver.toml, plugins/kaola-workflow/agents/code-architect.toml, plugins/kaola-workflow/agents/code-explorer.toml, plugins/kaola-workflow/agents/code-reviewer.toml, plugins/kaola-workflow/agents/contractor.toml, plugins/kaola-workflow/agents/doc-updater.toml, plugins/kaola-workflow/agents/implementer.toml, plugins/kaola-workflow/agents/issue-scout.toml, plugins/kaola-workflow/agents/knowledge-lookup.toml, plugins/kaola-workflow/agents/planner.toml, plugins/kaola-workflow/agents/security-reviewer.toml, plugins/kaola-workflow/agents/synthesizer.toml, plugins/kaola-workflow/agents/tdd-guide.toml, plugins/kaola-workflow/agents/workflow-planner.toml, plugins/kaola-workflow-gitlab/agents/adversarial-verifier.toml, plugins/kaola-workflow-gitlab/agents/build-error-resolver.toml, plugins/kaola-workflow-gitlab/agents/code-architect.toml, plugins/kaola-workflow-gitlab/agents/code-explorer.toml, plugins/kaola-workflow-gitlab/agents/code-reviewer.toml, plugins/kaola-workflow-gitlab/agents/contractor.toml, plugins/kaola-workflow-gitlab/agents/doc-updater.toml, plugins/kaola-workflow-gitlab/agents/implementer.toml, plugins/kaola-workflow-gitlab/agents/issue-scout.toml, plugins/kaola-workflow-gitlab/agents/knowledge-lookup.toml, plugins/kaola-workflow-gitlab/agents/planner.toml, plugins/kaola-workflow-gitlab/agents/security-reviewer.toml, plugins/kaola-workflow-gitlab/agents/synthesizer.toml, plugins/kaola-workflow-gitlab/agents/tdd-guide.toml, plugins/kaola-workflow-gitlab/agents/workflow-planner.toml, plugins/kaola-workflow-gitea/agents/adversarial-verifier.toml, plugins/kaola-workflow-gitea/agents/build-error-resolver.toml, plugins/kaola-workflow-gitea/agents/code-architect.toml, plugins/kaola-workflow-gitea/agents/code-explorer.toml, plugins/kaola-workflow-gitea/agents/code-reviewer.toml, plugins/kaola-workflow-gitea/agents/contractor.toml, plugins/kaola-workflow-gitea/agents/doc-updater.toml, plugins/kaola-workflow-gitea/agents/implementer.toml, plugins/kaola-workflow-gitea/agents/issue-scout.toml, plugins/kaola-workflow-gitea/agents/knowledge-lookup.toml, plugins/kaola-workflow-gitea/agents/planner.toml, plugins/kaola-workflow-gitea/agents/security-reviewer.toml, plugins/kaola-workflow-gitea/agents/synthesizer.toml, plugins/kaola-workflow-gitea/agents/tdd-guide.toml, plugins/kaola-workflow-gitea/agents/workflow-planner.toml, scripts/test-adaptive-node.js, scripts/test-install-model-rendering.js, scripts/test-agent-profile-parity.js, scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js, commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md | 80 | sequence | sonnet | — |
| n2-review | code-reviewer | n1-codex-dispatch-contract | — | 1 | sequence | opus | — |
| n3-docs | doc-updater | n2-review | README.md, docs/decisions/D-581-01.md | 2 | sequence | sonnet | — |
| n4-finalize | finalize | n3-docs | CHANGELOG.md | 1 | sequence | — | — |

## Node Ledger

| id | status |
| --- | --- |
| n1-codex-dispatch-contract | complete |
| n2-review | complete |
| n3-docs | complete |
| n4-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-codex-dispatch-contract) | local-fallback-tool-unavailable | .codex/agents/kaola-workflow/ absent; evidence-binding: n1-codex-dispatch-contract ad3df7e596e4 | |
| code-reviewer | local-fallback-tool-unavailable | .codex/agents/kaola-workflow/ absent; evidence-binding: n2-review ead8160606e5 | |
| doc-updater (n3-docs) | local-fallback-tool-unavailable | .codex/agents/kaola-workflow/ absent; evidence-binding: n3-docs 5cc85310323b | |
| finalize (n4-finalize) | main-session-direct | evidence-binding: n4-finalize d03bcee9a811 | |
