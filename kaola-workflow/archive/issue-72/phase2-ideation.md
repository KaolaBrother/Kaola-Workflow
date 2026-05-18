# Phase 2 - Ideation: issue-72

## Options Considered

| Option | Fit | Decision |
|--------|-----|----------|
| Shared forge adapter used by both GitHub and GitLab | Too broad for #72; violates no shared adapter boundary | rejected |
| Thin `glab` wrappers only | Meets command boundary but leaves normalization risks uncovered | rejected |
| GitLab-local primitives with explicit normalizers and offline test runner injection | Matches scope and enables deterministic tests | selected |

## Selected Strategy

Create `kaola-gitlab-forge.js` with local helpers for command execution, project discovery normalization, issue helpers, note helpers, merge request helpers, and label preservation.

## Boundaries

- Keep all new code under `plugins/kaola-workflow-gitlab/scripts/`.
- Do not import or execute anything from `plugins/kaola-workflow/` or root `scripts/`.
- Do not call `gh`.
- Do not wire these primitives into workflow startup, classifier, finalize, sink, command, skill, or hook behavior in this issue.

