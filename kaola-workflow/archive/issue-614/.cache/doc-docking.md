# Documentation Docking — issue-614

## Changed code/config/test/workflow files reviewed
- CHANGELOG.md
- commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md

(7 files changed vs origin/main, 66 insertions / 33 deletions — matches the plan's declared write sets for n1-prose + n2-docs exactly; no scripts/ file touched.)

## Documents checked
- CHANGELOG.md — `[Unreleased] > Fixed` entry (n2-docs)
- README.md
- docs/api.md
- docs/architecture.md
- .env.example
- kaola-workflow/ROADMAP.md (issue #614 has no `.roadmap/issue-614.md` source file — filed directly via `gh issue create`, never entered the roadmap mirror as an open item; nothing to dock there)

Evidence: kaola-workflow/issue-614/.cache/doc-updater.md, kaola-workflow/issue-614/.cache/n1-prose.md, kaola-workflow/issue-614/.cache/n2-docs.md, kaola-workflow/issue-614/.cache/n3-review.md

## Gaps found and fixed
None. doc-updater assessed all six Documentation Update Checklist items; no gaps required a fix beyond the CHANGELOG entry already authored by n2-docs, which was independently verified accurate and non-duplicated.

## Explicit no-impact reasons
- **README.md**: no public feature, usage example, or env var described differently before/after — the old unconditional full-suite mandate was never asserted in README.md; it lived only in the agent-facing command/SKILL prose this issue corrects.
- **docs/api.md**: already accurately documents the dual-mode finalize gate (`docs/api.md:385-388`, the #475 self-host/consumer split) and the `validation_command` record-once discipline (`docs/api.md:342-344`) — confirms this fix targets agent-facing PROSE catching up to already-correct script behavior and already-correct docs, not a doc drift.
- **docs/architecture.md**: no structural/component change — no new script, no new node type, no DAG shape change.
- **.env.example**: no new `KAOLA_*` (or other) env var introduced — confirmed by grep across the full diff.
- **Inline comments**: not applicable — all 7 changed files are Markdown agent-prose, not source code.

## Final verdict: DOCKED
