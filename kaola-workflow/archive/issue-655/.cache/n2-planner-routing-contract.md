evidence-binding: n2-planner-routing-contract dc01b8400c01
Assigned task: final restore of n2-planner-routing-contract after the narrow n1 R6 repair; preserve the closed final n1 code and restore only n2's original planner/routing write set.

Plan: frozen hash `7ea7dad9bb394a916b78d483c51c77e4cecb0c3aed14d77729831ca282895a65`.

Write set: agents/workflow-planner.md; plugins/kaola-workflow/agents/workflow-planner.toml; plugins/kaola-workflow-gitlab/agents/workflow-planner.toml; plugins/kaola-workflow-gitea/agents/workflow-planner.toml; templates/routing/plan-run.skeleton.md; templates/routing/required-blocks.js; commands/kaola-workflow-plan-run.md; plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md; plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md; plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md; plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md; plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md; scripts/test-route-reachability.js; scripts/test-agent-profile-parity.js; scripts/validate-workflow-contracts.js; plugins/kaola-workflow/scripts/validate-workflow-contracts.js; scripts/validate-kaola-workflow-contracts.js; plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js; plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js; this evidence file.

Tests changed: profile parity, route reachability, byte-identical common contract validators, and root Codex/GitLab/Gitea edition contract validators.

Implementation files changed: root planner profile; three byte-identical forge-neutral planner TOMLs; canonical plan-run skeleton; required-block manifest; six generator-emitted plan-run command/SKILL surfaces.

RED: Fresh final-recovery run of `TMPDIR="${TMPDIR:-/tmp}" node scripts/test-agent-profile-parity.js; TMPDIR="${TMPDIR:-/tmp}" node scripts/test-route-reachability.js; TMPDIR="${TMPDIR:-/tmp}" node scripts/validate-workflow-contracts.js` failed before product restoration with 28 missing planner-profile tokens, the missing `pr-planner-wait-budget` manifest block, and the missing emitted-surface authoritative frozen wait-budget assertion.

GREEN: After restoring the reviewed profile/skeleton/manifest prose and regenerating, profile parity passed 73 assertions; route reachability passed 459 assertions; common and all edition contract validators passed; generator, common-validator, and planner-profile byte parity passed; both forge forbidden-only checks passed. The mandatory four edition chains exited 0 on the final R6+n2 state; adaptive-node passed 1709 assertions and all root/Codex/forge walkthroughs passed.

Validation commands:
- `node scripts/generate-routing-surfaces.js --write` — PASS, rendered 12 managed surfaces; no emitted surface hand-edited.
- Focused profile parity + route reachability + common/root-Codex/GitLab/Gitea validators — PASS.
- `node scripts/generate-routing-surfaces.js --check` — PASS, all 12 surfaces byte-match the skeleton.
- Common validator `cmp` and canonical planner TOML vs GitLab/Gitea TOML `cmp` — PASS.
- GitLab and Gitea `--forbidden-only` over each forge's changed planner TOML, command, and SKILL — PASS (3 files each).
- `npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea` — PASS, exit 0.

Generated parity: all 12 routing surfaces byte-match canonical templates; three plugin planner profiles and two common validators are byte-identical.

Scope preservation: final n1 core runtime/tests were present before restoration and were not edited or reverted. No docs, CHANGELOG, plan/state/ledger, commit, push, merge, or issue mutation occurred.

Residual risk: prose remains agent-interpreted, but machine pins cover optional hash-covered wait budgets, evidence-grounded duration, tier floor through 720, nondelegable/optimizer conflicts, difficulty/no-wedge rules, authoritative frozen source, extension-only planner overrides, no early interrupt/re-nudge, governed completion, and `optimize_budget` separation across all profiles and six executor surfaces.
