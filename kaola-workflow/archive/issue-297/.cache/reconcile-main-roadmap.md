## reconcile-main-roadmap evidence

role: tdd-guide
node-id: reconcile-main-roadmap
status: complete

### RED phase
Added new test `testFinalizeFromLinkedWorktreeCleansMainStagedRoadmapSource` to scripts/simulate-workflow-walkthrough.js. Test reproduces the exact bug scenario: worktree forked from HEAD without the roadmap file, then file created+staged in MAIN only (no commit). Asserted PRE-FIX that git status --porcelain --untracked-files=no was NON-EMPTY (staged A present). Test failed on pre-fix code.

### GREEN phase
Implemented symmetric main-side reconciliation in archiveProjectDir across all 4 claim ports:
- scripts/kaola-workflow-claim.js (root)
- plugins/kaola-workflow/scripts/kaola-workflow-claim.js (byte-identical copy of root)
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js (hand-ported)
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js (hand-ported)

Fix: when statusValue === 'closed' AND mainRoot && mainRoot !== linkedRoot, runs:
1. git -C <mainRoot> rm --cached --force --ignore-unmatch <relpath> — drops staged ADD from MAIN index
2. fs.unlinkSync guarded for ENOENT — removes working-tree file if present

After fix: node scripts/simulate-workflow-walkthrough.js exits 0 with 'Workflow walkthrough simulation passed'. npm test passes.

### Assertions
- Pre-fix test FAILED on today's code (genuine RED)
- Post-fix test PASSES (genuine GREEN)
- simulate-workflow-walkthrough.js: PASS
- npm test: PASS ×4 editions
- byte-identical sync group (root + base-plugin) maintained
