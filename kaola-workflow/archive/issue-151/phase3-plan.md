# Phase 3 - Plan: issue-151

## Blueprint

### Files to Create
None.

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `README.md` | Edits 1-11: forge triads on 3 script-table rows, forge-neutral prose on 8 sites | GitHub-specific language in shared docs |
| `plugins/kaola-workflow-gitea/commands/workflow-next.md` | Edit 12: "MRs" → "PRs" on line 154 | Gitea uses PRs not MRs |

### Build Sequence
1. Task 1: README.md (Edits 1-11) — independent
2. Task 2: Gitea workflow-next.md (Edit 12) — independent
3. Validate both (single run after both tasks)

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| A | Task 1, Task 2 | Disjoint files, no shared content |

### External Dependencies
None — documentation only.

## Task List

### Task 1: README Forge-Neutral Edits
- File: `README.md`
- Test File: `scripts/validate-workflow-contracts.js` (existing)
- Write Set: `README.md`
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Validate: `node scripts/validate-workflow-contracts.js && node scripts/simulate-workflow-walkthrough.js`

**CRITICAL GUARDS — these exact strings must survive verbatim:**
- `"No lease/session layer remains."` (validator line 208, README line 482)
- `"Active folder coordination"` (validator line 206, README line 480 heading)
- `"Parallel active work"` (validator line 207, README line 702 heading)

**Edit 1 (line 461, claim row):**
- old: `` | `kaola-workflow-claim.js` | Active-folder coordination: claim, release/discard, status, watch-pr, bootstrap/startup, finalize, pick-next, resume, worktree-status, worktree-finalize, stale-worktree-check. Provisions a per-issue Git worktree when `KAOLA_WORKTREE_NATIVE=1`. | All phases | ``
- new name cell: `` `kaola-workflow-claim.js` (GitHub) / `kaola-gitlab-workflow-claim.js` (GitLab) / `kaola-gitea-workflow-claim.js` (Gitea) ``
- description change: `watch-pr,` → `watch-pr (watch-mr on GitLab),` in the subcommand list

**Edit 2 (line 466, merge-sink row):**
- old name cell: `` `kaola-workflow-sink-merge.js` ``
- new name cell: `` `kaola-workflow-sink-merge.js` (GitHub) / `kaola-gitlab-workflow-sink-merge.js` (GitLab) / `kaola-gitea-workflow-sink-merge.js` (Gitea) ``
- Description unchanged.

**Edit 3 (line 467, PR-sink row):**
- old name cell: `` `kaola-workflow-sink-pr.js` ``
- new name cell: `` `kaola-workflow-sink-pr.js` (GitHub) / `kaola-gitlab-workflow-sink-mr.js` (GitLab) / `kaola-gitea-workflow-sink-pr.js` (Gitea) ``
- description: replace `open a GitHub PR via \`gh pr create\`` with `open a PR via \`gh pr create\` (GitHub), \`glab mr create\` (GitLab), or \`tea pr create\` (Gitea)`

**Edit 4 (line 482):**
- old: `plus GitHub issue/PR state as the durable coordination contract. No lease/session layer remains.`
- new: `plus the configured forge's issue and PR/MR state as the durable coordination contract. No lease/session layer remains.`

**Edit 5 (line 502):**
- old: `clears advisory GitHub labels when online`
- new: `clears advisory forge labels when online`

**Edit 6 (line 504):**
- old: `Archives PR-backed folders when GitHub reports MERGED or CLOSED`
- new: ``Archives PR-backed folders when the forge reports MERGED or CLOSED. GitLab edition uses `watch-mr` (`kaola-gitlab-workflow-claim.js watch-mr`) instead.``

**Edit 7 (line 559):**
- old: `2. Fetch open GitHub issues`
- new: `2. Fetch open forge issues`

**Edit 8 (line 583):**
- Keep ALL quoted keyword literals verbatim: `"open a PR"`, `"create a PR"`, `"pull request"`, `"sink=pr"`, `"KAOLA_SINK=pr"`, `"PR sink"`
- old tail: ``Phase 6 dispatches to `kaola-workflow-sink-pr.js`.``
- new tail: ``Phase 6 dispatches to `kaola-workflow-sink-pr.js` (GitHub), `kaola-gitlab-workflow-sink-mr.js` (GitLab), or `kaola-gitea-workflow-sink-pr.js` (Gitea).``

**Edit 9a (line 598):**
- old: ``**`watch-pr` subcommand** (`kaola-workflow-claim.js watch-pr`):``
- new: ``**`watch-pr` subcommand** (`kaola-workflow-claim.js watch-pr`) (GitHub: `kaola-workflow-claim.js`; GitLab: `kaola-gitlab-workflow-claim.js watch-mr`; Gitea: `kaola-gitea-workflow-claim.js`):``

**Edit 9b (line 601):**
- old: `` - `MERGED`: archives the folder as closed and clears advisory GitHub labels``
- new: `` - `MERGED`: archives the folder as closed and clears advisory forge labels``

**Edit 9c (line 602):**
- old: `` - `CLOSED` (no merge): archives the folder as abandoned and clears advisory GitHub labels``
- new: `` - `CLOSED` (no merge): archives the folder as abandoned and clears advisory forge labels``

**Edit 10a (line 611):**
- old: `## GitHub roadmap cycle`
- new: `## Roadmap cycle`

**Edit 10b (line 613):**
- old phrase 1: `create or refine GitHub issues`
- new phrase 1: `create or refine forge issues`
- old phrase 2: `it fetches open GitHub issues`
- new phrase 2: `it fetches open forge issues`

**Edit 11 (line 704):**
- old: ``with GitHub issue state used to reject closed issues and PR state used by `watch-pr`.``
- new: ``with the configured forge's issue state used to reject closed issues and PR/MR state used by `watch-pr` (or `watch-mr` on GitLab).``

**Mirror:** `docs/api.md` triad pattern (`(GitHub) / (GitLab) / (Gitea)`)

### Task 2: Gitea workflow-next.md Fix
- File: `plugins/kaola-workflow-gitea/commands/workflow-next.md`
- Test File: none (doc change; validator covers)
- Write Set: `plugins/kaola-workflow-gitea/commands/workflow-next.md`
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Validate: `node scripts/validate-workflow-contracts.js`

**Edit 12 (line 154):**
- old: `folders for merged or closed MRs before selecting new work.`
- new: `folders for merged or closed PRs before selecting new work.`
- One word change only.

**Do NOT touch:** `plugins/kaola-workflow-gitlab/commands/workflow-next.md`

## Advisor Notes
- Original architect grouped GitHub/Gitea script names together (`(GitHub/Gitea)`) in Edits 3, 8, 9a — factually wrong since the two forges have distinct script files. Corrected to three-entry triads in revision-1.
- Retired-tokens list (session/lease/ticker/heartbeat) does not conflict with new wording.
- Edits 9b/9c duplicate-substring hazard handled by including the `MERGED:` / `CLOSED (no merge):` prefix in old_string.
- Post-edit verification: `grep -c "No lease/session layer remains." README.md` must return ≥ 1.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | invoked | .cache/architect-revision-1.md | Advisor found script-name grouping error |
