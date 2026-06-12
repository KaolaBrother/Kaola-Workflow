evidence-binding: n5-planner-prose 2d6f9d260ed3
non_tdd_reason: Prose/template additions to agent markdown and toml mirrors — no behavioral logic, no natural failing unit test; cross-edition parity is asserted by the contract validators.
verification_tier: regression-green
write_set:
  - agents/workflow-planner.md
  - plugins/kaola-workflow/agents/workflow-planner.toml
  - plugins/kaola-workflow-gitlab/agents/workflow-planner.toml
  - plugins/kaola-workflow-gitea/agents/workflow-planner.toml
verification_commands:
  - node scripts/simulate-workflow-walkthrough.js (exit 0 — baseline before change)
  - node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js --forbidden-only plugins/kaola-workflow-gitlab/agents/workflow-planner.toml (exit 0)
  - node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js --forbidden-only plugins/kaola-workflow-gitea/agents/workflow-planner.toml (exit 0)
  - node scripts/simulate-workflow-walkthrough.js (exit 0 — after change)
before_result: Workflow walkthrough simulation passed (exit 0)
after_result: Workflow walkthrough simulation passed (exit 0)
byte_parity: all three toml files diff-identical confirmed
