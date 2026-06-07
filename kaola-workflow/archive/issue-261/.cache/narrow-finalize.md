# narrow-finalize (tdd-guide) — AC2: cmdFinalize stages only finalized project's archive+rename+roadmap

RED: new test testFinalizeNarrowStagingExcludesForeignArchive (modeled on testFinalizeFromLinkedWorktreeCleansMainCopy, the only path reaching claim.js:915 via linked worktree + --keep-worktree). Created stray UNTRACKED kaola-workflow/archive/issue-999/x.md in worktree before finalize. Pre-fix `git add -A kaola-workflow/` swept it into the archive commit:
  committed HEAD included kaola-workflow/archive/issue-999/x.md  <-- the bug, test FAILED.

GREEN: narrowed the staging in BOTH claim.js copies (byte-identical mirror pair) at cmdFinalize ~:915. Replaced `git add -A kaola-workflow/` with:
  - git rm -r --cached --ignore-unmatch -- kaola-workflow/<project>   (stages live-folder deletion side of the rename)
  - git add -A -- <relDest(result.dest)> kaola-workflow/.roadmap kaola-workflow/ROADMAP.md  (existsSync-guarded; relDest handles .archived-<ts> suffix)
After fix: testFinalizeNarrowStagingExcludesForeignArchive PASSED — staged set includes archive/issue-701 + ROADMAP.md + issue-701 deletion, EXCLUDES archive/issue-999. Full suite: 129 tests, "Workflow walkthrough simulation passed". Regression guard testFinalizeFromLinkedWorktreeCleansRoadmapEntry still green (roadmap mirror still staged).

Byte-identity: diff scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js => empty (BYTE-IDENTICAL).

Files (within declared write set): scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, scripts/simulate-workflow-walkthrough.js (new fn after :3277, wired into run() at :8784).

Note: implementation uses git rm --cached + guarded git add (more robust than blueprint's single add -A -- list) — handles nonexistent live-folder path + absent roadmap; functionally equivalent narrowing.
