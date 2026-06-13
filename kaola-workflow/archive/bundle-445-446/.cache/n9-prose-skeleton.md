evidence-binding: n9-prose-skeleton b7503aee8a0f

non_tdd_reason: plan-run prose rewrite — no natural failing unit test; the route-reachability test verifies the pin after the rewrite

regression-green: route-reachability + walkthrough pass; T5 frontier-unit-pin now fully blocking on all 6 surfaces

surfaces rewritten: 6 (commands/kaola-workflow-plan-run.md + 5 plugin editions)
route-reachability: PASSED (44 assertions, up from 32; T5 pin verified on all 6 surfaces)
walkthrough: PASSED (exit 0, all ~175 tests including testPlanRunWiredForWorktree)

before_route_reachability: 32 assertions, T5 non-blocking (warning: "n9-prose-skeleton pending")
after_route_reachability: 44 assertions, T5 fully blocking (12 new assertions: 6 surfaces x PIN check + literal check)

contract_validators:
  validate-workflow-contracts.js: PASSED
  validate-kaola-workflow-contracts.js: PASSED
  validate-kaola-workflow-gitlab-contracts.js: PASSED
  validate-kaola-workflow-gitea-contracts.js: PASSED

write_set:
  - commands/kaola-workflow-plan-run.md (159 lines, was ~968)
  - plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md (150 lines, was ~717)
  - plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md (153 lines, was ~968)
  - plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md (153 lines, was ~968)
  - plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md (150 lines, was ~717)
  - plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md (150 lines, was ~717)

skeleton_contract_verified:
  - <!-- PIN: frontier unit --> immediately before frontier unit literal: YES, all 6 surfaces
  - frontier unit literal verbatim: YES, all 6 surfaces
  - --summary mode reference: YES, all 6 surfaces
  - <!-- CARD: resume -->: YES, all 6 surfaces
  - <!-- CARD: governance -->: YES, all 6 surfaces
  - <!-- CARD: repair-routing -->: YES, all 6 surfaces
  - <!-- CARD: reopen-complete-node -->: YES, all 6 surfaces
  - <!-- CARD: frontier-batch -->: YES, all 6 surfaces
  - All assertConcept tokens (## Node Ledger, plan_hash, post-dominate, auto-run, provisional,
    halt for consent, escalated_to_full: consent, typed refusal, quorum, tally-fn,
    validateNodeOutput, test_thrash, FANOUT_CAP, read-only, top-up, reconcile, opening,
    mirror-project): YES, commands/kaola-workflow-plan-run.md verified
  - All assertIncludes tokens (main-session-direct, clear-halt, kaola_script(){,
    KAOLA_SCRIPTS="$(dirname "$(kaola_script kaola-workflow-adaptive-node.js)")",
    --forbidden-only, full accumulated root diff, main-session-gate, frontier unit,
    workflow-state.md, ## Agent Model Badge, You MUST pass `model=, model="{,
    Working directory:): YES, verified by contract validators

verification_commands:
  node scripts/test-route-reachability.js   # exit 0, 44 assertions
  node scripts/simulate-workflow-walkthrough.js  # exit 0, Workflow walkthrough simulation passed
  node scripts/validate-workflow-contracts.js  # exit 0
  node scripts/validate-kaola-workflow-contracts.js  # exit 0
  node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js  # exit 0
  node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js  # exit 0
