verdict: DOCKED

# Documentation Docking - issue-584

The changed behavior is docked in the maintained documentation surfaces that
users and installed Codex profiles consume.

Docked surfaces:

- `README.md` covers the Codex config audit, accepted V2 settings, warning
  suppression boundary, no-silent-global-edit rule, and runtime effort proof.
- `commands/workflow-init.md` and the GitLab/Gitea command mirrors carry the
  same operational install guidance.
- `plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md` and the
  GitLab/Gitea skill mirrors carry the same operational install guidance.
- `docs/decisions/D-584-01.md` records the design decision.
- `CHANGELOG.md` records the fix under the current release section.

Not applicable:

- API docs: no public API schema or command output schema changed.
- Architecture docs: no architecture-level component changed.
- `.env.example`: no environment variable changed.
- Roadmap: finalization owns the issue source removal and generated roadmap
  refresh during archive/sink.
