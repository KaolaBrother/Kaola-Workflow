# ADR 0028 — The merge sink merges outside the shared checkout

Status: Accepted · Date: 2026-09-26 · Issue: #1097

## Context

The `--sink` transaction used to merge by mutating the shared main checkout in place: it checked the
feature branch out there, rebased it, ran the validation chains over the result, fast-forwarded the
default branch, and force-removed the linked development worktree on the way. Because the shared
checkout is shared, every foreign byte in it was a hazard to that sequence:

- A checkout or a rebase replays commits onto the working copy, so any tracked local edit, or any
  untracked path sitting where a replayed commit writes, could be overwritten or could abort the
  replay with no typed envelope.
- The work had to be classified and refused up front. `#429`/`#893`/`#1096` grew a preflight that
  bucketed tracked edits, untracked conflicts, sibling run folders, sibling sink receipts, and
  registered worktree paths — a growing exemption list that each round of field evidence extended.
  Every exemption was a place two runs could disagree about who owned a path.
- Even fully classified, the merge still switched the operator's checkout, and the fast-forward loop
  raced other sinks against the same default branch.
- Force-removing the development worktree at merge time destroyed work written between the merge
  decision and the removal.

## Decision

1. **The merge happens in a private integration worktree, `W`.** `W` lives at
   `.kw/integrate/<project>`, is a fresh linked worktree checked out on the candidate with no
   untracked files, and carries the rebase, the validation-chain run, and the archive commit. The
   shared checkout's working copy is never switched or rebased by the merge, so foreign content there
   can no longer collide with it. The archive commit is assembled from the main checkout's untracked
   bytes through a private index rather than a working-tree `git add`.

2. **Publication is a short-scope compare-and-swap.** `acquirePublishLock` serializes concurrent
   sinks for one repository — one lock in the git common dir, shared across worktrees
   (`publish_busy` names a live holder; the wait is bounded by
   `KAOLA_WORKFLOW_PUBLISH_LOCK_WAIT_MS`). The lock is held only for the base check and the push
   itself: the re-rebase and the re-taken chains run outside it, so a concurrent lane is only ever
   blocked for seconds. The candidate is pushed as an ordinary, non-forced update
   — the server's fast-forward check is the CAS; `--force` is never used. When the base advances, the
   affected PASS evidence is recorded in `invalidated_evidence` and re-acquired by rebasing `W` again
   and re-running the chains, bounded by `MAX_AUTOMERGE_RETRIES`.

3. **Foreign content is spared by git, not by classification.** The single post-publish
   fast-forward of the shared checkout (`advanceCheckedOutDefault`) advances only when git can do it
   without touching local modifications; otherwise the checkout stays where it was and the envelope
   reports it as `cleanup.main_checkout: behind`. `#1096`'s unified untracked-conflict rule and the
   tracked-dirt refusal it sat beside are eliminated by construction, along with the
   `untrackedPathConflictsWithCandidateFolder` helper and the `#715`/`#1075`/`#562` exemptions it
   subsumed.

4. **What still refuses, and what teardown does.** Only two conditions stop the transaction at
   preflight with zero mutation: a dirty or unprobeable development worktree (`#562`, retained — a
   protected user-work boundary) and this run's own archive present in the main checkout at bytes
   that diverge from the branch copy (`#893`). The development worktree is no longer removed at merge
   time; at teardown it is re-probed and removed **non-force**, so a worktree the caller cannot prove
   clean is kept and reported `kept_dirty`. `cleanup` reports `integration_worktree`, `worktree`,
   `remote_branch`, `local_branch`, and `main_checkout` (see `docs/api.md`).

## Consequences

- The shared checkout is never mutating work the merge can destroy; concurrency is serialized on one
  short-scope lock rather than on the whole merge.
- A run's resume state gains `integration_worktree`, `candidate_head`, and `candidate_base`, so a
  resumed `--sink` re-materializes the same `W`.
- The preflight shrinks to two facts. Documentation and tests that described the retired conflict rule
  are updated to the measured W-model contract.
