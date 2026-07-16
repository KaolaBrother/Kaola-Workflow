evidence-binding: n3-planner-control-plane 642a6c3f9b21

node: n3-planner-control-plane
role: tdd-guide
replay: bounded A3 handback

upstream_read: n1-epoch-architecture 2e20f56e4b04

## Scope

- Restore the validator-required `root cause or symptom mask` contract on the three n3-owned Claude adaptive command surfaces.
- Make each plugin `agents/workflow-planner.toml` top-level description exactly match its existing `config/agents.toml` registration without changing the planner's runtime-neutral re-plan authority instructions.
- Preserve all concurrent n1/n2/n4/n5 work and perform no detached review/fix loop.

## RED

RED: Pre-implementation contract validators all exited 1: root `validate-workflow-contracts.js` reported `commands/kaola-workflow-adapt.md must include: root cause or symptom mask`; Codex, GitLab, and Gitea validators each reported `agents/workflow-planner.toml: top-level 'description' does not match config/agents.toml`.

Commands and results:

- `node scripts/validate-workflow-contracts.js` -> exit 1, missing exact bug-flavor guardrail token.
- `node scripts/validate-kaola-workflow-contracts.js` -> exit 1, Codex planner description mismatch.
- `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` -> exit 1, GitLab planner description mismatch.
- `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` -> exit 1, Gitea planner description mismatch.

## Implementation

- Added the exact parenthetical `("root cause or symptom mask?")` after the reproduction criterion in the root, GitLab, and Gitea Claude adapt commands.
- Replaced only the top-level description line in each of the three planner TOMLs with the byte-identical description already registered by that edition's `config/agents.toml`.
- Left `config/agents.toml`, generated routing skeletons/outputs, runtime scripts, schemas, validators, and other owners' files untouched in this replay.

## GREEN

GREEN: The single post-implementation validation pass completed with all seven requested commands at exit 0: route reachability 1037 assertions, generated routing 141 assertions, all 12 generated surfaces byte-matched, and root/Codex/GitLab/Gitea contract validators each passed.

Commands and results:

- `node scripts/test-route-reachability.js` -> exit 0, `Route-reachability test passed (1037 assertions)`.
- `node scripts/test-generate-routing-surfaces.js` -> exit 0, `all 141 assertions passed`.
- `node scripts/generate-routing-surfaces.js --check` -> exit 0, `all 12 surfaces byte-match the skeleton`.
- `node scripts/validate-workflow-contracts.js` -> exit 0, `Workflow contract validation passed`.
- `node scripts/validate-kaola-workflow-contracts.js` -> exit 0, `Kaola-Workflow Codex contract validation passed`.
- `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` -> exit 0, `Kaola-Workflow GitLab contract validation passed`.
- `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` -> exit 0, `Kaola-Workflow Gitea contract validation passed`.

## Files changed by this handback

- `commands/kaola-workflow-adapt.md`
- `plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md`
- `plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md`
- `plugins/kaola-workflow/agents/workflow-planner.toml`
- `plugins/kaola-workflow-gitlab/agents/workflow-planner.toml`
- `plugins/kaola-workflow-gitea/agents/workflow-planner.toml`
- `kaola-workflow/issue-699/.cache/n3-planner-control-plane.md`

## Conclusion

conclusion: PASS
cross_owner_blockers: none observed in the specified validation pass
close_node: not run
