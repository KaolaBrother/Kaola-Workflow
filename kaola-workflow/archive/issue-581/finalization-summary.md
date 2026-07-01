# Finalization - Summary: issue-581

## Delivered

Issue #581 implements a Codex-aware global dispatch/profile contract:

- standalone Codex role TOMLs now carry `name`, `description`, `nickname_candidates`, and
  `developer_instructions`;
- installer and preflight schema checks derive expected metadata from `config/agents.toml`;
- preflight/doctor output reports `v1-thread-id` versus `v2-task-name` dispatch mode;
- adaptive dispatch descriptors carry `codex_dispatch_mode`, `codex_task_name`, and direct
  `codex_reasoning_effort`;
- plan-run command/skill guidance dispatches v2 with `task_name`, v1 with an identity prompt header,
  and passes per-spawn `reasoning_effort` directly when present;
- stale current effort prose was removed from plan-run guidance, README, `docs/api.md`, and
  `docs/architecture.md`.

## Files Changed

- `scripts/kaola-workflow-adaptive-node.js`
- `scripts/kaola-workflow-codex-preflight.js`
- `scripts/test-adaptive-node.js`
- `scripts/test-install-model-rendering.js`
- `scripts/validate-kaola-workflow-contracts.js`
- `plugins/kaola-workflow*/agents/*.toml`
- `plugins/kaola-workflow*/scripts/install-codex-agent-profiles.js`
- `plugins/kaola-workflow*/scripts/*workflow-adaptive-node.js`
- `plugins/kaola-workflow*/scripts/kaola-workflow-codex-preflight.js`
- `plugins/kaola-workflow-{gitlab,gitea}/scripts/validate-kaola-workflow-*-contracts.js`
- `commands/kaola-workflow-plan-run.md`
- `plugins/kaola-workflow*/commands/kaola-workflow-plan-run.md`
- `plugins/kaola-workflow*/skills/kaola-workflow-plan-run/SKILL.md`
- `README.md`
- `docs/api.md`
- `docs/architecture.md`
- `docs/decisions/D-581-01.md`
- `CHANGELOG.md`

## Acceptance Check

- Global install profile metadata: satisfied by source TOMLs, installer validation, and
  `scripts/test-install-model-rendering.js`.
- Preflight/doctor dispatch-mode reporting: satisfied by preflight output fields and v1/v2 fixtures in
  `scripts/test-install-model-rendering.js`.
- v2 stable task names: satisfied by `codex_task_name` sanitizer/descriptor tests and plan-run
  v2 dispatch instructions.
- v1 honest fallback: satisfied by plan-run guidance that omits `task_name` and uses prompt/evidence
  identity while acknowledging possible thread-id rows.
- Opus direct per-spawn effort: satisfied by dispatch descriptor tests and plan-run guidance passing
  `reasoning_effort` directly.
- Stale 0.139 plan-run guidance removed: satisfied by command/skill stale-prose scan and updated
  README/docs docking.
- No project-local profile copy required: satisfied by installer/preflight global-profile validation
  and no new project-local profile dependency.

## Final Validation Evidence

Self-host npm repo -> machine-gated on the chain receipt. All four edition chains passed:

- `claude`: exit 0
- `codex`: exit 0
- `gitlab`: exit 0
- `gitea`: exit 0

Evidence: `.cache/chain-receipt.json` and `.cache/final-validation.md`.

## Documentation Docking

DOCKED - `.cache/doc-docking.md`.

## Run gaps

Sweep was empty (`run-gaps.json` -> `sweptClasses: []`). No in-run defect, deferred red chain, or
manual gap needs a follow-up issue.

## Closure Decision

Acceptance criteria are met, the adaptive ledger is complete, final validation is green, and there
are no deferred items requiring the issue to stay open. Close #581 at the merge sink.

## Commit And Push

Pending at sink finalization. The branch is `workflow/issue-581`; final commit will be created after
`cmdFinalize` archives the active folder.

## GitHub Issue

#581 - pending close at the merge sink.

## Roadmap

No keep-open action is required. `cmdFinalize` regenerates `kaola-workflow/ROADMAP.md` at archive.

## Archive

Pending - `cmdFinalize` archives `kaola-workflow/issue-581/` atomically.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| adaptive tdd-guide node | local-fallback-tool-unavailable | `.cache/n1-codex-dispatch-contract.md` | `.codex/agents/kaola-workflow/` absent; session policy did not allow delegation |
| adaptive code-reviewer node | local-fallback-tool-unavailable | `.cache/n2-review.md` | `.codex/agents/kaola-workflow/` absent; session policy did not allow delegation |
| adaptive doc-updater node | local-fallback-tool-unavailable | `.cache/n3-docs.md` + `.cache/doc-updater.md` | `.codex/agents/kaola-workflow/` absent; session policy did not allow delegation |
| adaptive finalize node | main-session-direct | `.cache/n4-finalize.md` | |
| final validation | invoked | `.cache/final-validation.md` | |
| documentation docking | invoked | `.cache/doc-docking.md` | |
| chain-receipt gate | invoked | `.cache/chain-receipt.json` | |
| run-gap sweep | invoked | `.cache/run-gaps.json` | |
| mechanical finalization contractor | local-fallback-tool-unavailable | `.cache/contractor-finalization.md` | subagent delegation unavailable |
| roadmap refresh | pending | `kaola-workflow/ROADMAP.md` | cmdFinalize regenerates once at archive |
| archive completed folder | pending | `kaola-workflow/archive/issue-581` | cmdFinalize Step 8b |
| final commit and push | pending | branch `workflow/issue-581` | merge sink runs after final commit |

## Status

READY FOR CMD_FINALIZE
