evidence-binding: n6-planrun-prose ee4dc715f8f2
non_tdd_reason: Prose/documentation additions to command and SKILL files — no behavioral logic changed, no natural failing unit test exists for documentation content.
regression-green: node scripts/simulate-workflow-walkthrough.js exited 0 before and after the change ("Workflow walkthrough simulation passed")

task: Add "Generated-aggregator forge ports in the diff (#431)" prose section to commands/kaola-workflow-plan-run.md and mirror to all three Codex SKILL packs, explaining why forge ports appear in the diff when a node edits a GENERATED_AGGREGATOR canonical script.

verification_tier: regression-green

write_set:
- commands/kaola-workflow-plan-run.md
- plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md

verification_commands:
- node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js --forbidden-only plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md  (exit 0)
- node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js --forbidden-only plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md  (exit 0)
- node scripts/simulate-workflow-walkthrough.js  (exit 0, "Workflow walkthrough simulation passed")

before_result: Workflow walkthrough simulation passed (exit 0)
after_result: Workflow walkthrough simulation passed (exit 0)

prose_placement: Inserted as a new bold paragraph "Generated-aggregator forge ports in the diff (#431)" immediately after the existing "Forge-touching node guard (#341)" block (after the --forbidden-only verification snippet), before step 3 "close-and-open-next". All four files receive identical prose (forge-neutral — no forge CLI names used).

content_summary:
- When a node's declared write set includes scripts/<base> where <base> is a GENERATED_AGGREGATOR, edition-sync generates forge ports deterministically.
- Plans reaching plan-run have already passed the generated_port_split freeze-wall (all four edition files declared in one write set).
- Running node scripts/edition-sync.js --write during the node regenerates the codex twin and both forge ports.
- The code-reviewer gate should expect the forge ports in the diff — they are the expected result of edition-sync, not unexpected writes.
- A write_set_overflow barrier refusal here is a plan authoring error; the repair is to add the ports to the write set and re-freeze.
