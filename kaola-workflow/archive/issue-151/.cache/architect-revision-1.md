# Architect (revision-1) — issue-151: Forge-neutral README and Gitea workflow wording fix

> Revision note: identical to the original blueprint except Edits 3, 8, and 9a, which previously grouped GitHub and Gitea under a `(GitHub/Gitea)` form for **script file names**. That grouping is factually wrong — GitHub and Gitea have distinct script files (e.g. `kaola-workflow-sink-pr.js` vs `kaola-gitea-workflow-sink-pr.js`, `kaola-workflow-claim.js` vs `kaola-gitea-workflow-claim.js`). Rule: **script names always get three-entry triads**; the `(GitHub/Gitea)` form is valid only when the *subcommand name itself* matches across forges (e.g. `watch-pr`), never for script file names. All other edits are unchanged from the original.

## Summary
Documentation-only change. Two disjoint files. No scripts, schemas, or behavior.

## Design Principles
- Forge-neutral wording where behavior is identical across forges
- Forge-specific qualifiers where naming/terminology genuinely diverges (script triads, watch-pr/watch-mr, PR/MR)
- Preserve three contract-guarded substrings verbatim: "Active folder coordination", "Parallel active work", "No lease/session layer remains."

## Files to Create
None.

## Files to Modify

| File | Changes | Why |
|------|---------|-----|
| `README.md` | Edits 1-11: forge triads on 3 script-table rows, forge-neutral prose on 8 sites | GitHub-specific language in shared docs |
| `plugins/kaola-workflow-gitea/commands/workflow-next.md` | Edit 12: "MRs" -> "PRs" on line 154 | Gitea uses PRs not MRs |

## Build Sequence
1. Task A: README.md (Edits 1-11)
2. Task B: Gitea workflow-next.md (Edit 12)
3. Validate both (single run)

Files are disjoint — may run in parallel.

## Parallelization Plan

| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| A | Task A, Task B | Disjoint files, no shared content |

## External Dependencies
None.

## Task A — README.md

Write Set: `README.md`
Test File: `scripts/validate-workflow-contracts.js` (existing)
Validate: `node scripts/validate-workflow-contracts.js && node scripts/simulate-workflow-walkthrough.js`

### Edit 1 (line 461, claim row script-name cell)
old: `` `kaola-workflow-claim.js` | Active-folder coordination: claim, release/discard, status, watch-pr, ``
new name cell: `` `kaola-workflow-claim.js` (GitHub) / `kaola-gitlab-workflow-claim.js` (GitLab) / `kaola-gitea-workflow-claim.js` (Gitea) ``
description change: `watch-pr` -> `watch-pr (watch-mr on GitLab)` in the subcommand list

### Edit 2 (line 466, merge-sink row)
old name cell: `` `kaola-workflow-sink-merge.js` ``
new: `` `kaola-workflow-sink-merge.js` (GitHub) / `kaola-gitlab-workflow-sink-merge.js` (GitLab) / `kaola-gitea-workflow-sink-merge.js` (Gitea) ``
Description unchanged.

### Edit 3 (line 467, PR-sink row)
old name cell: `` `kaola-workflow-sink-pr.js` ``
new: `` `kaola-workflow-sink-pr.js` (GitHub) / `kaola-gitlab-workflow-sink-mr.js` (GitLab) / `kaola-gitea-workflow-sink-pr.js` (Gitea) ``
description: replace "open a GitHub PR via `gh pr create`" with "open a PR via `gh pr create` (GitHub), `glab mr create` (GitLab), or `tea pr create` (Gitea)"

### Edit 4 (line 482)
old: `plus GitHub issue/PR state as the durable coordination contract. No lease/session layer remains.`
new: `plus the configured forge's issue and PR/MR state as the durable coordination contract. No lease/session layer remains.`
GUARD: "No lease/session layer remains." must survive verbatim.

### Edit 5 (line 502)
old: `clears advisory GitHub labels when online`
new: `clears advisory forge labels when online`

### Edit 6 (line 504)
old: `Archives PR-backed folders when GitHub reports MERGED or CLOSED`
new: `Archives PR-backed folders when the forge reports MERGED or CLOSED. GitLab edition uses \`watch-mr\` (\`kaola-gitlab-workflow-claim.js watch-mr\`) instead.`

### Edit 7 (line 559)
old: `2. Fetch open GitHub issues`
new: `2. Fetch open forge issues`

### Edit 8 (line 583)
Keep ALL quoted keyword literals verbatim ("open a PR", "create a PR", "pull request", "sink=pr", "KAOLA_SINK=pr", "PR sink").
old tail: `Phase 6 dispatches to \`kaola-workflow-sink-pr.js\`.`
new tail: `Phase 6 dispatches to \`kaola-workflow-sink-pr.js\` (GitHub), \`kaola-gitlab-workflow-sink-mr.js\` (GitLab), or \`kaola-gitea-workflow-sink-pr.js\` (Gitea).`

### Edit 9a (line 598)
old: `` **`watch-pr` subcommand** (`kaola-workflow-claim.js watch-pr`): ``
new: `` **`watch-pr` subcommand** (`kaola-workflow-claim.js watch-pr`) (GitHub: `kaola-workflow-claim.js`; GitLab: `kaola-gitlab-workflow-claim.js watch-mr`; Gitea: `kaola-gitea-workflow-claim.js`): ``

### Edit 9b (line 601)
old: `` - `MERGED`: archives the folder as closed and clears advisory GitHub labels ``
new: `` - `MERGED`: archives the folder as closed and clears advisory forge labels ``

### Edit 9c (line 602)
old: `` - `CLOSED` (no merge): archives the folder as abandoned and clears advisory GitHub labels ``
new: `` - `CLOSED` (no merge): archives the folder as abandoned and clears advisory forge labels ``

### Edit 10a (line 611)
old: `## GitHub roadmap cycle`
new: `## Roadmap cycle`

### Edit 10b (line 613)
old: `create or refine GitHub issues`; `it fetches open GitHub issues`
new: `create or refine forge issues`; `it fetches open forge issues`

### Edit 11 (line 704)
old: `with GitHub issue state used to reject closed issues and PR state used by \`watch-pr\`.`
new: `with the configured forge's issue state used to reject closed issues and PR/MR state used by \`watch-pr\` (or \`watch-mr\` on GitLab).`

## Task B — Gitea workflow-next.md

Write Set: `plugins/kaola-workflow-gitea/commands/workflow-next.md`
Validate: `node scripts/validate-workflow-contracts.js`

### Edit 12 (line 154)
old: `folders for merged or closed MRs before selecting new work.`
new: `folders for merged or closed PRs before selecting new work.`
One word change only.

## Open Item
Resolved in this revision. Edits 1, 2, and 3 are now consistent three-entry script-name triads (GitHub / GitLab / Gitea). No remaining inconsistency.
