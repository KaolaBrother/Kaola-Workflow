# Finalization Summary — issue-1102

## Delivered

- **The stale-worktree sweep's lane pin resolves the run that OWNS the worktree instead of deriving
  `issue-<N>`.** `laneReceiptDirs(root, branch, projectName)` in all four claim copies reads the
  main checkout's live and archive `workflow-state.md` records whose `branch` is the worktree's
  branch, with three outcomes:
  - **current run resolved:** a single live record, unless an archived record carries a strictly
    newer `claim_ts` (M10), with every folder carrying its `claim_ts` read live first; with no live
    record, the strictly newest `claim_ts` (the sink's `readCurrentClaimTs` rule). Only that run's
    folders' receipts are read.
  - **ambiguous** (two live records, a newer archived claim beside the live one, a tie, an unstamped
    record among several): no record's receipt is read.
  - **no record names the branch:** the base's derived read (live, then archive `issue-<N>`), unchanged.
- **Unclaimed derived folders** (`issue-<N>` live and plain archive that are not records: missing,
  unreadable or branchless state, or this branch without a safe name — X3) keep their base pin in the
  first two outcomes, except a receipt whose `claim_ts || started_at` predates the resolved run's
  `claim_ts`, which is dated out exactly as the sink's #694 cross-run check (X1). A derived folder
  whose state names another branch is never read (D5 guard).
- **The integration arm is unchanged** (byte-for-byte the base): `.kw/integrate/<project>` already
  names the true project, and it keeps the live + `archive/<project>/.cache` read (#1097).

## Files Changed

9 files against origin/main 20a2b369 at the rebased candidate: the four claim copies
(+89/−6 each), `scripts/test-claim-hardening.js`, the GitLab and Gitea workflow-scripts suites,
`docs/api.md` and `CHANGELOG.md`. The list is in `## Changed Paths`, which the transaction writes.

## Test Coverage

- `scripts/test-claim-hardening.js` (918 assertions): Cases A–G, R1–R5, N1/N2/N4/N5/N8, M1/M5/M6/M7/
  M9/M11, N7, unstamped-among-several, newest-tie-several, X1, M10, X2, X3, K1, K2, D5.
- GitLab and Gitea workflow-scripts suites: sc2e, sc2f, sc2g with the same R/N/M/X/K/D cases on the
  forge branch prefixes.
- Every case that fixed a finding was proven RED on the preceding candidate for its stated reason
  (forge suites case by case through soft-assert scratch copies); D5 was proven by the reviewer's
  mutation (the only failure in all three suites).
- Independent review repros at the rebased HEAD: repro.js 7/7, repro2.js 15/15, repro3.js 10/10 ok;
  repro4.js X2/X4 and repro5.js D1/D6 differ from the probes' own expectations by Host decision and
  the round-5 review's accepted classification (X2 base behavior, X4 no change, D1 unreachable
  skew, D6 the documented undatable exception).

## Validation

classification: chains_green
green: true
mode: chain-receipt

4 chain(s) green over this tree

## Changed Paths

Files this branch changed outside the kaola-workflow/ run-state band:

- CHANGELOG.md
- docs/api.md
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js
- plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js
- plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
- plugins/kaola-workflow/scripts/kaola-workflow-claim.js
- scripts/kaola-workflow-claim.js
- scripts/test-claim-hardening.js

## Documentation Docking

`.cache/doc-docking.md`: docs/api.md and CHANGELOG [Unreleased] Fixed updated; README, architecture,
workflow-state contract, ADRs and the docs index checked with no impact. DOCKED.

## Acceptance against the issue statement

- "a run whose project folder is NOT named `issue-<N>` is never pinned" — fixed for the lane arm:
  Case A / C2 (bundle live), N7 (bundle archived), Case B (suffixed archive copy).
- "resolve the owning project from the run state … failing a resolution keep today's behavior" —
  refined by review: no record → the base derived read (N2, C1), ambiguous → unpinned (N8, M9),
  and identity safety (Case C/D, R1, R2, N4, X1).
- "apply the same resolution to the integration arm" — measured correction: the integration arm
  already used its `.kw/integrate/<project>` directory name, so it needs no resolution (Case F, N1).
  Posted on the issue as a correction.

## Follow-Up Items

- #1103 (open, separate run) owns the remaining acceptance: the `.archived-<ts>` collision rename
  and multiple archives of one issue.
- No new defect filed by this run.

## Readiness

Ready: rebased on origin/main 20a2b369 with one doc-ordering conflict (CHANGELOG) resolved; the
fresh four-chain receipt binds the rebased HEAD; independent review PASSED at round 5.

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-1102/.cache/chain-receipt.json
- kaola-workflow/archive/issue-1102/.cache/doc-docking.md
- kaola-workflow/archive/issue-1102/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-1102/finalization-summary.md
- kaola-workflow/archive/issue-1102/mission-ledger.jsonl
- kaola-workflow/archive/issue-1102/workflow-state.md
