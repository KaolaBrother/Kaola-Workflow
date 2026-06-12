5ca0042ec2ad
evidence-binding: n_planrun_cosmetic 5ca0042ec2ad

## n_planrun_cosmetic — doc-updater evidence

All 6 plan-run surfaces updated:

- `commands/kaola-workflow-plan-run.md` — frontmatter description updated to running-set scheduler wording; `(current Claude Code)` removed from (b′) background dispatch paragraph
- `plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md` — same two edits (codex/claude plugin)
- `plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md` — same two edits (gitlab command)
- `plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md` — same two edits (gitlab SKILL)
- `plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md` — same two edits (gitea command)
- `plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md` — same two edits (gitea SKILL)

The literal `frontier unit` is preserved in all six surfaces. The `description:` frontmatter now reads "running-set scheduler; each frontier unit dispatched when its dependencies complete" across all six. The `(current Claude Code)` / `run_in_background: true` forge-specific parenthetical is replaced with the runtime-neutral "background subagent dispatch".

docs: complete
