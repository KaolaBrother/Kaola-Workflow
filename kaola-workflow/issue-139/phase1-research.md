# Phase 1 - Research / Discovery: issue-139

## Deliverable
Update `docs/api.md:37` and `docs/architecture.md:40` to mention `tea pr create` (Gitea) alongside `gh pr create` (GitHub) and `glab mr create` (GitLab) in the PR Sink contract description.

## Why
The docs claim Gitea forge support throughout (`docs/api.md:35` says "GitHub, GitLab, and Gitea"), but the PR/MR creation step omits `tea pr create`. Developers setting up a Gitea-based workflow will see incomplete instructions.

## Affected Area
- `docs/api.md` line 37 — PR Sink Contract description
- `docs/architecture.md` line 40 — PR Sink flow diagram step

## Key Patterns Found
1. `docs/api.md:37`: `create PR/MR via \`gh pr create\` or \`glab mr create\`` — needs `, or \`tea pr create\``
2. `docs/architecture.md:40`: `Create PR via gh pr create / glab mr create` — needs `/ tea pr create`
3. Gitea sink script: `kaola-gitea-workflow-sink-pr.js` — confirms Gitea uses `tea pr create` CLI tool

## Test Patterns
- Framework: hand-rolled assert (simulate-workflow-walkthrough.js)
- No test changes needed — docs-only

## Config & Env
None relevant.

## External Docs
None required — internal doc consistency fix only.

## GitHub Issue
KaolaBrother/Kaola-Workflow#139

## Completeness Score
10/10

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | N/A | | Documentation-only task; no codebase behavior facts needed |
| docs-lookup | N/A | | Internal consistency fix; no external library/API behavior needed |

## Notes / Future Considerations
None.
