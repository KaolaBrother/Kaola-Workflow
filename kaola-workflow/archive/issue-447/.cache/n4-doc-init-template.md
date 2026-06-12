evidence-binding: n4-doc-init-template 06bd61fcc351

# n4-doc-init-template (doc-updater) — global-hooks prose in the workflow-init template group (AC6)

Added to all 3 editions:
- SKILL.md (after the installer-description paragraph, OUTSIDE the KW-CLAUDE-TEMPLATE region): a
  paragraph stating Codex lifecycle hooks install globally into ~/.codex (not the project); the
  `install-codex-agent-profiles.js "$PWD"` step installs project-local profiles AND refreshes the
  global hooks in one pass; re-running force-refreshes hooks without re-initing; trust once via
  /hooks; remove an older project-local .codex/hooks.json (or run uninstall.sh) to avoid double-fire.
- commands/workflow-init.md (after KW-CLAUDE-TEMPLATE-END): a condensed "Codex hooks note:" blockquote
  with the same content.

Constraints satisfied:
- Forge-neutral prose (no forge CLI binary / brand names). Semantic mirror across editions.
- Byte-pairing (#301): new prose added OUTSIDE the KW-CLAUDE-TEMPLATE region in both halves of each
  pair → template regions remain BYTE-IDENTICAL within each edition (github/gitlab/gitea all verified
  via sed-extract diff).

Verification:
- node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js --forbidden-only <2 files> → passed
- node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js --forbidden-only <2 files> → passed

Files: plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md, commands/workflow-init.md,
plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md, plugins/kaola-workflow-gitlab/commands/workflow-init.md,
plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md, plugins/kaola-workflow-gitea/commands/workflow-init.md
