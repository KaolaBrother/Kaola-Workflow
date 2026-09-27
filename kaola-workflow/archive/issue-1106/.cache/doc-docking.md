# Documentation docking — issue-1106

Candidate: `54d6ab2018cbc0b894c3ffd4d1a072620bf54f7d` (rebased onto `660a5a96`)
Changed paths outside `kaola-workflow/`: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js`,
`plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js`,
`plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`, `docs/api.md`, `CHANGELOG.md`.

## Checked

| Surface | Change | Action |
|---|---|---|
| `docs/api.md` — Global config (`pr_auto_merge`) | Gitea schedules the squash merge for when checks succeed (`merge_when_checks_succeed`, Gitea ≥ 1.17); #1099's GitHub merge-queue text kept, its "GitLab and Gitea are unchanged" clause restated as "take no queue probe" | **UPDATED** |
| `CHANGELOG.md` — `[Unreleased]` | New entry under the existing `### Fixed` (one heading per section: Added, Removed, Changed, Fixed) | **UPDATED** |
| `kaola-gitea-forge.js` — `mergePullRequest` | Inline comment states the autoMerge scheduling; the file has no header contract to update | **UPDATED** |
| `README.md` | Makes no Gitea-specific auto-merge promise | NO IMPACT |
| `docs/installation.md` | Mentions `pr_auto_merge` only as an example of a shared config block | NO IMPACT |
| `docs/decisions/*`, architecture docs, `docs/README.md` | No design, module-boundary, or index change | NO IMPACT |
| Environment/setup | No new env var, config key, installer change, or dependency | NO IMPACT |

## Signature check

The request body `{"Do":"squash","delete_branch_after_merge":true,"merge_when_checks_succeed":true}` is
transcribed from the shipped code and pinned by the forge-helpers and sinks suites. The receipt-bound
release-check reported `result: pass` for 4 unwaived chains at `54d6ab20`.

DOCKED
