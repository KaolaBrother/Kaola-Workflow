# Advisor — issue-216 Plan Gate (revision, post-Task-2)

## Functional fix is sound

`archiveProjectDir` calls `fs.renameSync(live, archive)` (claim.js:542), removing the live dir before sink-merge runs. `assertNoLiveWorkflowFolder` (sink-merge.js:77) checks committed state, not filesystem — throws if live is committed on HEAD, passes otherwise. So `!exists(live) && exists(archive)` at the `postMergeCleanup` catch is correct for both finalize variants.

PR-fallback concern closed: the receipt-skip is the issue's explicit intent. For an archived project, `cmdSinkFallback` (claim.js:981) was already going to return `{ updated: false, reason: 'project archived' }` — the old receipt-write just defeated that guard via the resurrecting mkdir (the bug). Skipping the receipt removes the bug, not a feature.

## What must be updated before Task 3 / Phase 5

Design docs still describe a two-layer fix with Layer 1 as "the operative fix." The shipped fix is a single guard in the `postMergeCleanup` catch, placed BEFORE the `git reset --hard` — a third position no doc describes.

**Why Layer 1 (post-checkout in `main()`) was not viable:** After `git checkout feature-branch`, the archive is already on disk (from finalize's rename OR from the committed archive on the branch). So `!exists(live) && exists(archive)` is true during EVERY normal finalize→sink-merge flow, not just phantom scenarios. Layer 1 at that position fires unconditionally, breaking `testE2EGitHubMergeFullChain`.

**Why the pre-reset position in `postMergeCleanup` IS operative:** The catch block only runs on push failure. The guard fires only when: (a) a push error is classified AND (b) live is gone AND archive is present. In the normal success path, the catch is never entered. In the non-archived push failure, `exists(live)` is true → guard doesn't fire. This structural isolation is what makes it correct.

**Why forge's Layer 1 (pre-checkout) works but root's (post-checkout) didn't:** Forge's Layer 1 runs BEFORE `git checkout feature-branch` — on the main branch, where the archive may already be on disk from a prior finalize. Root's attempted Layer 1 ran POST-checkout, where the archive is always on disk after any finalize. Root's pre-reset guard is operative where forge's post-reset Layer 2 (GitLab lines 241–246) is NOT — reset wipes the archive before that guard runs.

**Root's fix is more correct than a literal forge-parity port, not less.**

## Document updates required before Task 3

1. Update `phase3-plan.md` to describe the actual single-guard design
2. Record Layer-1-deletion rationale + test-scoping in `phase4-progress.md` deviations
3. Drop forge-parity language; replace with "operative where forge's Layer 2 isn't"

## Minor notes (non-blocking)

- `git checkout main` inside the guard (line 217) is a no-op: ffMergeLoop already leaves HEAD on main. Harmless; leave it.
- Test covers committed-archive (keep-worktree) path. Standard-finalize (untracked-archive) path is covered by assertNoLiveWorkflowFolder + cmdSinkFallback's guard — state in deviation note, don't add a second test.
