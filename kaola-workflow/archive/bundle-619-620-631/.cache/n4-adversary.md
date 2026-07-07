evidence-binding: n4-adversary af769b9f68f1
verdict: pass
findings_blocking: 0

finding: id=R4 scope=out_of_scope action=document status=deferred severity=low fix_role=none rationale=a pushed-at-parity unmerged branch is deleted by the safe -d leg (git's own merged-into-upstream semantics) and lands in deleted_branch rather than skipped_unmerged; the work is NOT destroyed (proven reachable via refs/remotes/origin/<branch> and the remote itself), so no data loss — but an operator reading only the buckets could think the branch was merged; a doc note beside D-619-01 would make the -d semantics explicit

## Claim Under Test

"The #619/#620/#631 fixes in bundle-619-620-631 (fail-closed receipt-integrity in sink-merge.js/claim.js + the #620 stale-worktree-cleanup data-safety guard) are correct and complete — no fail-open path survives, and stale-worktree-cleanup can NEVER destroy unmerged work." Scoped surface: scripts/kaola-workflow-claim.js, scripts/kaola-workflow-sink-merge.js + codex twin + gitlab/gitea hand-ports.

## Disproof Attempt

5 independent reproduction drivers built FROM SCRATCH (real `git init -b`, real bare remotes, real commits, real subprocess CLI, hand-written mock forge CLI via KAOLA_GH_MOCK_SCRIPT — none reuse shipped tests). All exit 0, 68/68 checks PASS.

### #620 — attempted to destroy committed unmerged work via `stale-worktree-cleanup --execute`. FAILED on every input:
- A1 (core): closed-issue + clean worktree + committed-but-unmerged diverged branch → worktree removed, branch ref SURVIVES at exact tip, content intact, bucketed skipped_unmerged with tip SHA.
- A2: genuinely merged branch → still -D'd (deleted_branch), commit safe on main (no over-restriction).
- A3: default branch unresolvable (master repo, no main ref; merge-base --is-ancestor errors) → degrades to safe -d; unmerged survives (skipped_unmerged), merged-into-HEAD deleted. Never force-deletes on an errored ancestry probe.
- A5: FF-ahead branch → survives, skipped_unmerged.
- A8 (hardest): branch pushed -u, remote branch deleted + fetch --prune (local is ONLY copy; upstream config lingers) → `git branch -d` falls back to HEAD merge check, refuses → survives, skipped_unmerged.
- A4 (nuance, R4): pushed-at-parity unmerged branch IS deleted locally by -d (git deems it merged into upstream) — but tip stays reachable via refs/remotes/origin/<branch> AND on the remote; verified both. Not orphaning; matches git's safe-delete contract.
- A6: cmdRelease (consented discard) still unconditionally force-deletes unmerged branch (legitimate path not over-restricted). A7: dirty worktree → skipped_dirty.
- Structural: -D fires ONLY after merge-base --is-ancestor <branch> <defBranch> exits 0 (proves tip reachable from another live ref); fallback is git's own refuse-unless-merged -d. removeBranch (unconditional -D) reachable ONLY from cmdRelease in all four editions (canonical :2677/:2682, codex identical, gitlab :2430/:2435, gitea :2425/:2430). Forge removeBranchIfMerged + cmdStaleWorktreeCleanup byte-identical to canonical (pure git) → live results transfer.

### #619 — attempted to make a failed/false close look completed. FAILED on every path:
- B1 legacy: close exit 0 but issue OPEN → {refuse, sink_incomplete, step:closure, remote_issue_closed:failed} exit 1, NOT status:merged. B3: throw+open → same. E1 legacy bundle: member 61 exit-0-open → exit 1, failed_issue_closures:[61], closed_issues:[60].
- B4 --sink: exit-0-open → sink_incomplete step:closure exit 1, steps.closure!=='done', remote_issue_closed:'partial'. B4b: re-run after forge recovers → resumes, retries, status:sinked exit 0 (fail-closed AND retryable).
- B5 push_upstream REAL failure (no test hook, origin at nonexistent dir): typed sink_incomplete step:push_upstream push_upstream:failed exit 1, step NOT done.
- D matrix (claim.js closeIssueIdempotent memo trap): exit-0-open→failed; genuine success→closed (un-memoized probeIssueClosedLive re-checks live, not the stale pre-close 'open' memo — avoids the false-refusal regression); throw-but-closed→already_closed; throw-and-open→failed.
- No-false-refusal controls: B2 genuine close→status:merged exit 0; E2 keep-open→kept_open exit 0; E3 OFFLINE→skipped_offline exit 0. closeWasAttempted correctly excludes non-attempts.

### #631 — attempted to false-alarm a rebased sink or catch branch_head mutation. FAILED:
- C2 (real e2e): pushed feature + concurrent origin/main advance → --sink race-recovery rebases → exit 0 status:sinked; receipt published_head = fresh tip ancestor of main, branch_head === ORIGINAL pre-rebase SHA (untouched, NOT ancestor — pre-fix false-alarm trigger present in fixture).
- C2c: verify-sink vs that REAL receipt → ok:true exit 0, impl_commit=published_head. C2d (load-bearing): deleting only published_head reproduces the pre-fix false alarm (impl_commit_not_ancestor exit 1).
- C1 matrix: fresh/stale→green; legacy branch_head-only-published→green (fallback); legacy stale→still fails closed; bogus published_head + good branch_head→FAILS (preferred, never blindly trusted, no silent fallback-to-green).
- Structural: branch_head written ONLY at 2 receipt-init sites in all four editions (canonical :846/:871, codex identical, gitlab :931/:952, gitea :925/:946) — no mutation site; r.published_head || r.branch_head at canonical :3123, gitlab :3024, gitea :3015. Canonical↔codex diff -q byte-identical both files.

### Could NOT find
No input where committed work becomes unreachable under stale-worktree-cleanup --execute. No close outcome yielding merged/sinked+exit 0 on failure. No rebase shape false-alarming verify-sink or mutating branch_head. Did NOT re-run #635-flaky chain suites (waived by dispatch); edition coverage rests on byte-level diffs + implementers'/reviewer's live forge-suite runs.

## Verdict
NOT-REFUTED (confidence: high) — every attempted counterexample failed live. verdict: pass.
