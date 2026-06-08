verdict: pass
findings_blocking: 0

finding: R1
scope: in_scope
action: fix
status: resolved
description: REGRESSION on the normal worktree-finalize path. The original #297 block ran `git -C <mainRoot> rm --cached --force --ignore-unmatch <relpath>` UNCONDITIONALLY whenever mainRoot != linkedRoot at closed-status. `git rm --cached` diverges by whether the path is on MAIN HEAD: (a) staged-ADD-not-on-HEAD (#297 orphan) -> path becomes untracked -> status -uno clean (intended fix); (b) committed-on-HEAD (the NORMAL worktree-finalize case) -> stages a `D` -> `git status --porcelain --untracked-files=no` shows `D  kaola-workflow/.roadmap/issue-N.md` -> STILL trips sink-merge.js:73, swapping one sink blocker for another. RESOLVED by the repair: an `onHead` gate (`git cat-file -e HEAD:<relpath>`) now SKIPS the entire reconcile block when the file is on MAIN HEAD; the rm --cached + unlink fire only for the staged-ADD-only orphan. Gate mirrored across all 4 claim ports (byte-identical). A MAIN `git status --porcelain --untracked-files=no` clean assertion was added to BOTH the new staged-A test AND the existing committed-on-HEAD test so fix and no-regression are each locked.
fix_role: tdd-guide

# G1 Code Review (re-review after repair) — Issue #297

## Scope re-reviewed
worktree-finalize MAIN-repo staged `.roadmap/issue-N.md` orphan reconcile in
`archiveProjectDir`, mirrored across 4 claim ports + walkthrough tests. The repair
gates the previously-unconditional `git rm --cached` on an `onHead` check and adds
MAIN-status clean assertions to both the new and the existing worktree-finalize tests.

## Files
- /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-297/scripts/kaola-workflow-claim.js (root, #297 block :822-848)
- /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-297/plugins/kaola-workflow/scripts/kaola-workflow-claim.js (base-plugin, byte-identical to root)
- /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-297/plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js (#297 block :784-810)
- /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-297/plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js (#297 block :770-796)
- /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-297/scripts/simulate-workflow-walkthrough.js (existing test :4687-4757 now MAIN-status-locked; new test :4765-4828; both wired into main())

## R1 verification (RESOLVED)

### The gate is correct — proven empirically (not pattern-matched)
The repair replaces the unconditional rm --cached with:
```
git -C <mainRoot> cat-file -e HEAD:<relpath>   ->  exit 0  => onHead=true  => block SKIPPED
                                                    exit !=0 => onHead=false => rm --cached + unlink FIRE
```
Scratch-repo reproduction in a fresh git repo (mirrors both MAIN states exactly):
- committed-on-HEAD: `cat-file -e HEAD:issue-911.md` -> exit 0 -> block SKIPPED ->
  `git status --porcelain --untracked-files=no` EMPTY (clean). The `D`-regression is gone.
- staged-ADD-only orphan: `cat-file -e HEAD:issue-921.md` -> exit 128 -> block FIRES ->
  after rm --cached + unlink, status -uno EMPTY (clean). The #297 fix still works.
Both branches resolve to a clean MAIN index — exactly the sink-merge.js:73 invariant.

### All 4 ports carry the gate, character-identical
`grep "#297"` hits all four claim ports; the extracted blocks are byte-for-byte the
same gated logic. `mainRoot && mainRoot !== linkedRoot` outer guard preserved (in-place
path unchanged).

### root == base-plugin byte-identical
`diff scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
-> empty. `validate-script-sync.js` -> "18 common scripts and 7 byte-identical file group in sync".

### Both tests now lock both branches
- New `testFinalizeFromLinkedWorktreeCleansMainStagedRoadmapSource` (#297, staged-A path):
  forks the worktree FIRST (so the roadmap source is NOT on HEAD), then `git add`s it in
  MAIN without committing; asserts PRE-FIX status non-empty (staged A) and POST-FINALIZE
  status -uno EMPTY — the exact sink-merge.js:73 check. PASSED.
- Existing `testFinalizeFromLinkedWorktreeCleansRoadmapEntry` (committed-on-HEAD path):
  setup corrected so the active folder is NOT committed to MAIN before the fork (production
  pattern — committing it would make `mainLive` an rmSync target and dirty MAIN with a `D`,
  which the new assertion would catch). Now commits ONLY the roadmap source onto HEAD, forks
  from it, finalizes, asserts the worktree archive-commit `D` is preserved (original purpose)
  AND adds the MAIN `git status --porcelain --untracked-files=no` clean assertion (regression
  lock). With the gate, rm --cached is skipped and MAIN stays clean. PASSED.

## Other parts of the change (re-confirmed correct)
- Git index op for the staged-A case: rm --cached -> untracked -> clean; `--ignore-unmatch`
  safe no-op.
- Crash safety: outer best-effort try/catch matches closure style; inner ENOENT-guarded
  unlink re-throws non-ENOENT into the outer catch. `roadmap_source_removed` enum and
  `checkClosureInvariants` untouched.
- In-place (non-worktree) path: guarded by `mainRoot !== linkedRoot`; unchanged.

## Verification run (all confirmed exit 0)
- `node scripts/simulate-workflow-walkthrough.js` -> exit 0, sentinel
  "Workflow walkthrough simulation passed", new test
  "testFinalizeFromLinkedWorktreeCleansMainStagedRoadmapSource: PASSED".
- `npm test` across all 4 editions:
  - claude: validate-script-sync ("7 byte-identical file group in sync"), vendored-agents,
    all unit tests, workflow contracts, new #297 test PASSED, full walkthrough passed.
  - codex: contract validation passed + walkthrough passed.
  - gitlab: contracts passed, regular walkthrough passed, codex walkthrough passed (exit 0).
  - gitea: contracts passed, regular walkthrough passed, codex walkthrough passed (exit 0).
  Both edition codex walkthroughs and both edition contract validators reconfirmed
  exit 0 directly:
  GITEA_CODEX_EXIT=0, GITLAB_CODEX_EXIT=0, GITEA_CONTRACT_EXIT=0, GITLAB_CONTRACT_EXIT=0.

## Verdict
APPROVE (pass). The R1 regression is resolved: the rm --cached is now gated on an
`onHead` check so the normal committed-on-HEAD worktree-finalize path skips the block
entirely (MAIN stays clean, deletion flows via the feature-branch archive commit), while
the staged-ADD-only #297 orphan still gets reconciled to a clean MAIN index. The gate is
mirrored byte-identically across all 4 claim ports, and MAIN-status clean assertions lock
both branches in both tests. No CRITICAL or HIGH issues remain. 0 blocking findings.
