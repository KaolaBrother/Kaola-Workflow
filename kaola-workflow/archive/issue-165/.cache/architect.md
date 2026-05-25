# Code-architect blueprint (model=opus) — closure-audit.js

## Design decisions
- collectClosedSet: ONE issueIsClosed(N) per unique N (union of .roadmap filenames +
  archive issue_number + active-folder issue_number). All detectors read the set.
  OFFLINE -> empty set, collapsing (a)/(b)/(e) to empty with no special-casing.
- (a)/(d) reason precedence: stale_roadmap_sources has ONE reason. "closed_remote" if N in
  remote-closed set; "archive_closed" ONLY for issues NOT in that set but whose archive
  workflow-state.md says status:closed. Dedupe by issue_number; closed_remote wins.
- Detect once, repair from report: --execute runs detection, then executeRepairs(root, report)
  consumes it. No double gh round.
- Non-offline gh failure != skipped_offline: (c)/(f) emit "skipped_offline" ONLY when OFFLINE.
  Online gh failure -> empty array + stderr warning.

## Files to create
- scripts/kaola-workflow-closure-audit.js (inlines ghExec/parseArgs/assert/isSafeName/getRoot;
  imports domain helpers only).
- plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js (byte-identical copy).

## Files to modify
- scripts/validate-script-sync.js: add `  'kaola-workflow-closure-audit.js',` immediately
  after `  'kaola-workflow-classifier.js',` in COMMON_SCRIPTS.
- scripts/simulate-workflow-walkthrough.js: add closureAuditScript const + runClosureAudit
  (+offline variant) near line 482; add test fns; register in main() (~line 2974).

## Function decomposition (closure-audit.js)
- assert/isSafeName/getRoot/ghExec/parseArgs — inlined, mirror sink-merge:12-62. parseArgs only needs --execute boolean.
- collectClosedSet(root) -> Set<number>  [DEDUPE POINT]
- roadmapSourceFiles(root) -> [{issue_number, file}]  (read roadmapDir, list issue-N.md)
- archiveClosedIssues(root) -> Set<number>  (scan kaola-workflow/archive/*/workflow-state.md; status==='closed')
- detectStaleRoadmapSources(srcFiles, closedSet, archiveClosed) -> [...]  (a)/(d) precedence + dedupe
- detectMirrorClosed(roadmapIssues, closedSet) -> [N]  (b)
- detectStaleLabels() -> [...] | "skipped_offline"  (c): gh issue list --state closed --label workflow:in-progress --json number,title,url
- detectActiveClosedFolders(folders, closedSet) -> [...]  (e) REPORT ONLY; attach dirty
- isDirty({project_dir, worktree_path}) -> bool  (git -C <dir> status --porcelain --untracked-files=no; any failure->false)
- detectUnarchivedPrFolders(folders) -> [...] | "skipped_offline"  (f) REPORT ONLY: sink==='pr' && pr_url; gh pr view <pr_url> --json state MERGED/CLOSED
- buildAuditReport(root) -> report  (orchestrate detectors once; locked dry-run shape + counts)
- executeRepairs(root, report) -> repaired  (unlink stale roadmap sources, regenerateRoadmap, gh issue edit N --remove-label; split removed/failed; carry reported_not_repaired)
- main()  (parseArgs; build report; --execute -> repairs+execute-shape else dry-run; JSON.stringify(...,null,2))

## Edge cases
- empty/missing .roadmap -> []; missing archive/ -> empty set (fs.existsSync guard).
- malformed workflow-state.md -> skip (try/catch, mirrors readActiveFolders:103).
- issue_number null -> not a candidate; issueIsClosed(null) false anyway.
- online gh failure -> empty + stderr warning, NOT skipped_offline.
- dirty detection w/ no .git / missing worktree -> false.
- regenerateRoadmap returns 'generated'|'up-to-date'.
- no stale sources -> still call regenerateRoadmap (idempotent); roadmap_sources_removed:[].

## Build sequence
1. Write closure-audit.js. 2. Manual run dry + --execute on tmp fixture. 3. Add tests + register.
4. node scripts/simulate-workflow-walkthrough.js -> "Workflow walkthrough simulation passed".
5. Byte-copy to plugin tree. 6. Edit COMMON_SCRIPTS; run validate-script-sync.js.

## Test plan (10 fns) — see phase3-plan.md table. +1 advisor-added (see advisor-plan.md).

## Out of scope
- Zero edits/exports in claim.js. No auto-archive/worktree-removal/branch-deletion/PR state edits.
- (e)/(f) REPORT-ONLY in both modes. No direct ROADMAP.md edits (only regenerateRoadmap).
- No GitLab/Gitea variants. No CLI flags beyond --execute.
