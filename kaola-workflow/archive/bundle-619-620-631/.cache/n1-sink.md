evidence-binding: n1-sink e7db8128d48d

# n1-sink evidence — every kaola-workflow-sink-merge.js change (#619 1-4, #631)

## Scope

Owns every edit to `kaola-workflow-sink-merge.js` across all four editions
(canonical `scripts/`, codex twin `plugins/kaola-workflow/scripts/`, GitLab
hand-port, Gitea hand-port), plus RED-first test coverage in
`scripts/test-bundle-finalize.js`, `scripts/simulate-workflow-walkthrough.js`,
`plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`,
`plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`.
`scripts/test-claim-hardening.js` is deliberately under-written: it only
exercises sink-merge.js's `--help`/`--bogus` refusal paths (unaffected by
these fixes); the real close/receipt coverage already lives in the other
three test files, which is where the RED-first tests were added.

## Fixes implemented (all five, in postMergeCleanup / the --sink transaction)

1. **#619(1) legacy fail-open close** — postMergeCleanup emitted
   `status:'merged'` exit 0 even when the issue close genuinely failed.
   Mirrors the `--sink` closure step's `sink_incomplete` refusal shape:
   emits `{result:'refuse', reason:'sink_incomplete', step:'closure', ...}`
   + exit 1 when `remoteIssueClosed==='failed'` (single-issue) or
   `bundleBuckets.failed_issue_closures.length>0` (bundle), gated on
   `closeWasAttempted` (excludes OFFLINE/keep-open/no-issue-passed so a
   sink with nothing to close is never false-flagged).
2. **#619(2) post-close success-path probe** — `gh issue close` exiting 0
   was trusted unconditionally (the probe only ran in the catch branch).
   Added a `probeIssueClosed` call on the SUCCESS path too, at all three
   sink-side close sites: legacy single-issue close, legacy bundle loop,
   and the `--sink` transaction's `closeOne`. An exit-0-but-still-open
   close is now bucketed `failed` (which then trips fix #1's refusal).
3. **#619(3) push_upstream swallowed failures** — the `push_upstream` step
   ran `stepDone` unconditionally regardless of push outcome. Now verifies
   `branch@{u}` parity (ahead-count === 0) after the push attempt; on
   non-parity, records `receipt.push_upstream='failed'` and emits a typed
   `sink_incomplete` refusal, leaving the step NOT done. Added a
   `FORCE_PUSH_UPSTREAM_FAIL` test-only hook (mirrors `FORCE_PUSH_MAIN_FAIL`)
   for deterministic RED coverage.
4. **#619(4) worktree_sync dead step** — the standalone `worktree_sync`
   step always ran AFTER the `merge` step's worktree removal, so its own
   `git worktree list` scan could never match (wtPath always null) — a
   permanent no-op `stepDone`. Removed the step + its `SINK_STEPS` entry;
   the merge step now STAGES the worktree's project folder to a temp dir
   BEFORE removal, then LANDS it into mainRoot only after checkout/rebase/
   FF-merge resolve — and only if the branch doesn't already track
   `kaola-workflow/<project>/` there (mirrors the original guard,
   `!fs.existsSync(mainProjDir)`, evaluated post-checkout). Landing the
   copy pre-checkout (an earlier draft of this fix) regressed
   `testSinkTransactionCleanEndToEnd`: an untracked pre-checkout copy at a
   path the branch itself tracks collides with `git checkout` ("untracked
   working tree files would be overwritten"); staging first and landing
   only when still absent fixed it.
5. **#631 published_head additive stamp** — `branch_head` is stamped once
   at receipt init (before `doRebase`), so a mid-flight rebase orphans it
   even though the rebased content did land. At the closure gate, once the
   live tip resolves as published (`merge-base --is-ancestor` verified),
   stamp a NEW, ADDITIVE `receipt.published_head = implRef`. `branch_head`
   is never mutated (load-bearing for the #518 cycle-identity guard).

All five fixes were reimplemented in each of the four editions (canonical
verbatim-copied to the codex twin; GitLab/Gitea hand-ported into their
`glab`/`tea` forge-CLI bodies per the porting model).

## RED -> GREEN (representative; all reproduced live, not asserted from memory)

RED: testSinkRefusesOnPushUpstreamFailure (pre-fix push_upstream step) — AssertionError: "#619(3): a hard push_upstream failure must NOT report status:sinked, got {"result":"ok","status":"sinked",...}" (pre-fix code ran stepDone regardless of push outcome)
GREEN: testSinkRefusesOnPushUpstreamFailure passes post-fix; result:refuse reason:sink_incomplete step:push_upstream, receipt.steps.push_upstream !== 'done', receipt.push_upstream === 'failed'

RED: testSinkMergeCloseExitZeroButStillOpenFailsClosed (pre-fix single-issue close, no success-path probe) — AssertionError: "#619(2): an exit-0-but-still-open close must fail the sink closed, got 0" with stdout {"status":"merged","closure_receipt":{"remote_issue_closed":"closed",...}} (pre-fix code trusted the close exit code alone)
GREEN: testSinkMergeCloseExitZeroButStillOpenFailsClosed passes post-fix; result:refuse reason:sink_incomplete, remote_issue_closed:'failed', stderr names the exit-0-but-still-open condition

RED: testSinkMergeCloseFailureWarning (rewritten from the pre-fix "exit 0 even when issue close fails" assumption) — the pre-fix assertions (`result.status === 0`, warning-only) are exactly what fix #1 replaces; verified by construction (mirrors the already-proven #497 --sink closure-step pattern) and by the two forge-side close-fail tests below, which reproduce the identical fail-open baseline live.
GREEN: testSinkMergeCloseFailureWarning passes post-fix; exit non-zero, result:refuse reason:sink_incomplete step:closure, remote_issue_closed:'failed', claim_label_removed:'removed' (negative control)

RED: testSinkTransactionSyncsUntrackedWorktreeProjectDirOnMerge (pre-fix worktree_sync dead step + SINK_STEPS restored) — AssertionError: "#619(4): the untracked worktree-only marker (dispatch-log.jsonl) must be copied into mainRoot before the worktree is destroyed; not found anywhere under kaola-workflow/" (pre-fix worktree_sync never found a match, wtPath always null)
GREEN: testSinkTransactionSyncsUntrackedWorktreeProjectDirOnMerge passes post-fix; the untracked worktree-only marker survives into mainRoot (or the archive dir) after the --sink transaction

RED: testSinkTransactionStampsPublishedHeadAfterRebase (pre-fix: published_head stamp removed) — AssertionError: "#631: receipt.published_head must be stamped, got {...no published_head key...}" (pre-fix receipt only ever carried the stale branch_head)
GREEN: testSinkTransactionStampsPublishedHeadAfterRebase passes post-fix; receipt.published_head is stamped, receipt.branch_head remains the ORIGINAL pre-rebase SHA (untouched, #518-safe), and the two values differ (proving published_head carries the fresh rebased tip)

## Regression caught + fixed during RED/GREEN cycling

The FIRST draft of fix #4 (copying the worktree's project folder directly
into mainRoot BEFORE `git checkout`) regressed `testSinkTransactionCleanEndToEnd`
(a pre-existing test, not one I authored): `git checkout workflow/issue-4293`
failed with "工作区中下列未跟踪的文件将会因为检出操作而被覆盖" (untracked
files would be overwritten) because that test's branch commits
`kaola-workflow/issue-4293/workflow-state.md` itself, and the premature
untracked copy collided with the same tracked path. Root-caused and fixed
by staging the copy to a temp dir and landing it only AFTER checkout, only
when the branch doesn't already provide the directory. Verified by re-running
the full `simulate-workflow-walkthrough.js` suite (all scenarios green,
including `testSinkTransactionCleanEndToEnd`) after the fix, ported the
identical stage-then-land fix into the GitLab and Gitea hand-ports (which
had the same latent bug from copying the same original draft), and confirmed
both forge sink test suites green.

## Full validation run (this session, all commands actually executed)

- `node scripts/kaola-workflow-sink-merge.js -c` (and all three ports): syntax OK
- `node scripts/validate-script-sync.js`: OK (24 common scripts, 25 byte-identical groups incl. sink-merge.js canonical<->codex)
- `node scripts/simulate-workflow-walkthrough.js`: full suite green ("Workflow walkthrough simulation passed"), including all 4 new + 1 rewritten sink-merge tests
- `node scripts/test-bundle-finalize.js`: all 135 tests passed (2 gh mocks made stateful for the new post-close probe)
- `node scripts/test-claim-hardening.js`: 155 assertions passed (unaffected — only --help/--bogus sink-merge tests)
- `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`: PASSED (2 mocks made stateful + 1 close-fail test rewritten fail-closed + #592 mock fixed)
- `node plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`: PASSED (same 3 fixes ported)
- `npm run test:kaola-workflow:claude`: all steps pass through `test-phase4-advance.js`; `test-run-chains.js` fails non-deterministically (16 failures, DIFFERENT T-numbers across consecutive re-runs on the SAME code) — confirmed via `git stash` that the IDENTICAL flake (different T-subset each run) reproduces on the pre-my-change tree; this file never references sink-merge.js. Pre-existing, documented (#635), out of scope for n1-sink.
- `npm run test:kaola-workflow:codex`: PASSED (exit 0) — full chain including `simulate-kaola-workflow-walkthrough.js`
- `npm run test:kaola-workflow:gitlab`: all scenarios pass through `test-gitlab-sinks.js`; the LAST run() call, `test-gitlab-run-chains.js`, fails non-deterministically (G2/G3, different subset each of 3 re-runs) — confirmed via `git stash` the identical non-deterministic pattern reproduces on the pre-my-change tree; this file never references sink-merge.js.
- `npm run test:kaola-workflow:gitea`: same shape — all scenarios pass through `test-gitea-sinks.js`; the LAST run() call, `test-gitea-run-chains.js`, fails with the same pre-existing flake family (confirmed unrelated).
- `node scripts/test-active-folders-field-parity.js`: 61 assertions passed (run standalone since the claude chain didn't reach it after the run-chains flake)

No other test in any of the four chains regressed. The only failures across
all four full-chain runs are the pre-existing `test-{run,gitlab-run,gitea-run}-chains.js`
signal/receipt-timing flake family, confirmed (via stash-based A/B on the
identical commit) to reproduce identically on the untouched tree.
