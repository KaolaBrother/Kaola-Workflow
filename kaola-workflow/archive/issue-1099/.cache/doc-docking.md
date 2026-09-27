# Documentation docking — issue-1099

Candidate: `fd9d673adf1786368a5fcb1289a6301ad57c4e3e` (rebased onto `77a384ad`)
Changed paths outside `kaola-workflow/`: `scripts/kaola-workflow-sink-pr.js`,
`plugins/kaola-workflow/scripts/kaola-workflow-sink-pr.js`, `scripts/simulate-workflow-walkthrough.js`,
`README.md`, `docs/api.md`, `CHANGELOG.md`.

## Checked

| Surface | Change | Action |
|---|---|---|
| `docs/api.md` — Global config (`pr_auto_merge`) | Queue-branch behavior, one-shot probe, no new key, GitLab/Gitea unchanged | **UPDATED** |
| `docs/api.md` — PR/MR request sink output contract | New `pr_auto_merge: merge_queue \| direct \| failed` line, its position before the final `sink_pr:` line, and the three lanes | **UPDATED** |
| `README.md` — request-sink lifecycle paragraph | GitHub queue honoring, queue lane argv, other forges/branches unchanged | **UPDATED** |
| `CHANGELOG.md` — `[Unreleased]` | New entry under `### Added`, carrying the D-mq1 correction | **UPDATED** |
| `scripts/kaola-workflow-sink-pr.js` — file header | Public-interface comment now states the added line and its three lanes | **UPDATED** |
| `docs/installation.md` — config key list | No new config key was added, so this file is unchanged | NO IMPACT |
| `docs/decisions/*` | No design change: one branch added to an existing option (the issue explicitly declined a new ADR) | NO IMPACT |
| `docs/README.md` (documentation index) | No new document or renamed link | NO IMPACT |
| Architecture docs | No module boundary, posture, or entrypoint changed | NO IMPACT |
| Environment/setup | No new env var, installer change, or dependency | NO IMPACT |

## Signature check

The documented argv strings (`gh pr merge <url> --auto`; `pr merge <url> --auto --squash
--delete-branch`) and the GraphQL field name `PullRequest.isMergeQueueEnabled` are transcribed from
the shipped code, not invented. The receipt-bound release-check reported
`release ok (4 chains green, unwaived, at fd9d673a)`.

DOCKED
