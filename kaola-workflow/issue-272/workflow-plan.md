# Workflow Plan — issue #272

<!-- plan_hash: 63a80312d775d7a939c16b82a9471b5d18efe167ad9af0d5c842dd0fbbdcc805 -->

## Meta
labels: enhancement, area:scripts, area:workflow-phases

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
|----|------|------------|--------------------|-------------|-------|
| plan | planner | — | — | 1 | sequence |
| impl-core | tdd-guide | plan | scripts/kaola-workflow-adaptive-node.js, scripts/test-adaptive-node.js, package.json | 1 | sequence |
| impl-handoff | tdd-guide | impl-core | scripts/kaola-workflow-adaptive-handoff.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-handoff.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-handoff.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-handoff.js, scripts/test-adaptive-handoff.js, scripts/simulate-workflow-walkthrough.js | 1 | sequence |
| impl-prose-claude | implementer | impl-handoff | commands/kaola-workflow-adapt.md, commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, agents/workflow-planner.md, plugins/kaola-workflow/agents/workflow-planner.toml | 1 | sequence |
| impl-prose-forge | implementer | impl-prose-claude | plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/agents/workflow-planner.toml, plugins/kaola-workflow-gitea/agents/workflow-planner.toml | 1 | sequence |
| impl-ports | implementer | impl-prose-forge | plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, install.sh, scripts/validate-script-sync.js | 1 | sequence |
| impl-validators | implementer | impl-ports | scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, scripts/validate-kaola-workflow-contracts.js | 1 | sequence |
| impl-docs | implementer | impl-validators | docs/decisions/0005-plan-run-owns-node-lifecycle.md, docs/architecture.md, CLAUDE.md, README.md | 1 | sequence |
| review | code-reviewer | impl-docs | — | 1 | sequence |
| finalize | finalize | review | CHANGELOG.md | 1 | sequence |

## Node Ledger

| id | status |
|----|--------|
| plan | complete |
| impl-core | complete |
| impl-handoff | complete |
| impl-prose-claude | complete |
| impl-prose-forge | complete |
| impl-ports | complete |
| impl-validators | complete |
| impl-docs | complete |
| review | complete |
| finalize | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner (plan) | subagent-invoked | .cache/plan.md (implementation blueprint for all 7 impl nodes + recursion-safety + token-rename map; read-only, 0 production writes; per-node barrier pass) | |
| tdd-guide (impl-core) | subagent-invoked | .cache/impl-core.md (RED→GREEN; test-adaptive-node.js 104 assertions; pure-composition adaptive-node.js [orient/open-next/record-evidence/close-and-open-next/write-halt] + package.json wiring; 5 frozen-core scripts untouched; per-node barrier pass, outOfAllow []) | |
| tdd-guide (impl-handoff) | subagent-invoked | .cache/impl-handoff.md (RED→GREEN; handoff drops node1-open+baseline, returns ready_to_run; 4 editions, codex byte-identical; test-adaptive-handoff 58 assertions + validate-script-sync + walkthrough green; per-node barrier pass) | |
| implementer (impl-prose-claude) | subagent-invoked | .cache/impl-prose-claude.md (non_tdd_reason: prose/contract docs; adapt/plan-run cmds + codex skills + workflow-planner.md/.toml → adaptive-node transactions + ready_to_run; build-green: validate-vendored-agents pass; validate-workflow-contracts token-repin deferred to impl-validators by design; per-node barrier pass) | |
| implementer (impl-prose-forge) | subagent-invoked | .cache/impl-prose-forge.md (non_tdd_reason: prose/contract docs parity; gitlab+gitea adapt/plan-run cmds + workflow-planner.toml → forge adaptive-node transactions + ready_to_run; build-green: gitlab+gitea contract validators + vendored-agents pass; per-node barrier pass) | |
| implementer (impl-ports) | subagent-invoked | .cache/impl-ports.md (non_tdd_reason: cross-edition ports + install/sync wiring; codex byte-identical copy + gitlab/gitea renamed ports of adaptive-node.js + install.sh ×3 + validate-script-sync COMMON_SCRIPTS; build-green: validate-script-sync 15 common scripts in sync + bash -n install.sh + node --check ports + forge ports load; per-node barrier pass) | |
| implementer (impl-validators) | subagent-invoked | .cache/impl-validators.md (non_tdd_reason: contract-validator token repin + install.sh assertions; ready_to_dispatch_first_node→ready_to_run in validate-workflow-contracts [+codex byte-mirror] + validate-kaola-workflow-contracts; +install.sh adaptive-node assertions +exists asserts; regression-green: all 4 validators + walkthrough green. NOTE cross-node union-legal fix: rejoined "halt for consent" line-break in plan-run.md [impl-prose-claude lane]; baseline re-recorded; per-node barrier outOfAllow []) | |
| implementer (impl-docs) | subagent-invoked | .cache/impl-docs.md (non_tdd_reason: documentation; NEW ADR 0005 [extends 0004] + docs/architecture.md adaptive section + CLAUDE.md Key Scripts + README adaptive narrative; build-green: validate-workflow-contracts pass; regression-green: walkthrough pass; 0 stale ready_to_dispatch_first_node tokens; per-node barrier pass) | |
| code-reviewer | subagent-invoked | review node (G1) — .cache/review.md verdict:pass findings_blocking:0; all 7 focus areas verified empirically (adaptive-node correctness, recursion-safety frozen-core untouched, handoff change, cross-edition parity, prose, tests, AC met); npm test green ×4 editions; 4 non-blocking nits noted; per-node barrier pass | |
| finalize (sink) | orchestrator (no finalize agent) | CHANGELOG.md [#272] written; whole-plan --barrier-check + --gate-verify + --verdict-check exit 0 (outOfAllow [], unsatisfied [], failures []); npm test green ×4 editions; commit/sink-merge to main + close #272 pending user confirmation (outward-facing) | |
