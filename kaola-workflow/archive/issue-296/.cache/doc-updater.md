## doc-updater evidence (n4)

n4 doc-updater ran during the plan-run (node n4). Changes made:
- agents/contractor.md: Added "Crash recovery." paragraph in Step 8b after the cmdFinalize atomicity description.
- commands/kaola-workflow-finalize.md: Added ## Crash Recovery section (detect + recover) before ## Step 9 - Sink.
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md: Same crash recovery section, same position.
- plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md: Same crash recovery section, same position.

Documentation Update Checklist review:
- README.md: no user-facing feature change, no new env vars — skip
- API docs: no API changes — skip
- CHANGELOG.md: updated by n5 node (## [Unreleased] ### Fixed entry)
- Architecture docs: no structural change — skip
- .env.example: no new vars — skip
- Inline comments: no public interface changes — skip

Validation: node scripts/simulate-workflow-walkthrough.js: Workflow walkthrough simulation passed
