evidence-binding: n3-prose 29495cc8fa31
<!-- non_tdd_reason: paste non_tdd_reason here -->
non_tdd_reason: prose-floor + machine pin; verified by the route-reachability pin going green and the build chain staying green. Category: glue/wiring — adding contract prose to existing entry surfaces with no new behavioral logic, plus a fail-closed pin assertion that characterizes observed state.
<!-- regression-green|build-green|smoke-integration -->
build-green: test-route-reachability.js exit 0, 170 assertions (was 146); simulate-workflow-walkthrough.js exit 0; gitlab + gitea contract validators exit 0.

## Surfaces edited (12)

FAST entry (6):
- commands/kaola-workflow-fast.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-fast.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-fast.md
- plugins/kaola-workflow/skills/kaola-workflow-fast/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-fast/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-fast/SKILL.md

FULL entry (6):
- commands/kaola-workflow-phase1.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase1.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-phase1.md
- plugins/kaola-workflow/skills/kaola-workflow-research/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-research/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-research/SKILL.md

## T11 block added

File: scripts/test-route-reachability.js (before `if (failed)` at end of file)
Block asserts: for each of the 12 surfaces above, two unconditional assert() calls:
  1. content.includes('<!-- PIN: adaptive-default-contract -->')
  2. content.includes('path_requires_explicit_opt_in')
Labels: T11: ... (n3-adaptive-default-contract, #515)

## Verification commands and exit codes

Before change:
  node scripts/test-route-reachability.js  -> EXIT 0  (146 assertions)

After change:
  node scripts/test-route-reachability.js  -> EXIT 0  (170 assertions, +24 new T11 asserts)
  node scripts/simulate-workflow-walkthrough.js  -> EXIT 0  ("Workflow walkthrough simulation passed")
  node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js  -> EXIT 0  ("Kaola-Workflow GitLab contract validation passed")
  node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js  -> EXIT 0  ("Kaola-Workflow Gitea contract validation passed")

## Cross-edition note

This diff touches the gitlab/gitea plugin trees. The orchestrator must run all four npm chains (claude + codex + gitlab + gitea) at finalize.
