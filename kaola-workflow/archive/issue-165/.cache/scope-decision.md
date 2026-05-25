# Essential decisions (advisor-directed) — issue-165

## D1. Edition scope: GitHub-canonical now; gitlab/gitea as follow-ups
Implement `closure-audit` in the GitHub canonical edition only this cycle
(`scripts/kaola-workflow-claim.js` + byte-identical `plugins/kaola-workflow/scripts/` copy).
Rationale (advisor): AC says "tests ... where applicable" (admits per-edition scope);
matches #161's decompose-into-sub-issues pattern; `audit-labels`/`repair-labels`
precedent is GitHub-only. File `Port closure-audit to GitLab edition` and
`Port closure-audit to Gitea edition` as follow-ups linked to #161 after #165 closes.

## D2. JSON output shape (locked before coding)
Dry-run default (mirrors cmdStaleWorktreeCheck/cmdRepairLabels):
```
{ dry_run:true, offline:false,
  drift:{ stale_roadmap_sources:[{issue_number,file,reason}],
          mirror_lists_closed_issues:[N],
          stale_in_progress_labels:[{number,title,url}] | "skipped_offline",
          active_folder_for_closed_issue:[{project,issue_number,dirty}],
          unarchived_pr_folders:[{project,issue_number,pr_url,pr_state}] | "skipped_offline" },
  counts:{ stale_roadmap_sources, stale_in_progress_labels, active_folder_for_closed_issue, unarchived_pr_folders } }
```
--execute:
```
{ dry_run:false, offline:false,
  repaired:{ roadmap_sources_removed:[N], roadmap_regenerated:bool, labels_removed:[N], labels_failed:[N] },
  reported_not_repaired:{ active_folder_for_closed_issue:[...], unarchived_pr_folders:[...] } }
```
- Remote-dependent classes use the `"skipped_offline"` string sentinel when OFFLINE.
- `reported_not_repaired` stays a top-level key even on --execute (one shape for "needs human attention").

## D3. Safe-repair boundary
--execute touches ONLY: stale .roadmap sources + regenerate ROADMAP.md + remove
in-progress labels on closed issues. NEVER deletes active folders/worktrees
(that surface = stale-worktree-check/cleanup). Document the distinction in docs/api.md.

## D4. Implementation by Opus (Sonnet quota exhausted this session)
code-explorer + phase4 TDD-dispatch agents (model=sonnet) will fail. Orchestrator
(Opus) implements directly, TDD spirit: add failing test fns to
simulate-workflow-walkthrough.js first, then cmdClosureAudit, then green.
Phase artifacts still written so phase6 closure invariants pass.

## D5. Closure reminder
When closing #165/#161 via sink-merge: parse closure_receipt; if
remote_issue_closed != closed, manually `gh issue close N` (known mid-merge gap).
