# Node routing — #279 findings contract + repair-routing prose (implementer)
non_tdd_reason: prose/dispatch-contract docs only — the machine-readable findings-emission contract (flat col-0 finding: lines + closed vocab) + the bounded repair-routing controller (fix_role map, repair envelope enforced by commit-node barrier, LOOP_CAP, write-halt on cap exhaustion, explicit machine-readable out_of_scope follow-ups) added as one new "## Repair routing" section across the 4 plan-run executor docs (github skill + github/gitlab/gitea commands). No code path -> no natural failing unit test.
build-green:
- node scripts/validate-workflow-contracts.js -> "Workflow contract validation passed" exit 0 (concept tokens in commands/kaola-workflow-plan-run.md intact; section additive)
- node scripts/simulate-workflow-walkthrough.js -> "Workflow walkthrough simulation passed" exit 0 (no code touched)
- section present once in all 4 docs; ordering Quorum(341) -> Repair routing(357) -> Caps(399) in commands/kaola-workflow-plan-run.md
write-set: plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md + commands/kaola-workflow-plan-run.md + plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md + plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md
