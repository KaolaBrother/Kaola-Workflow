evidence-binding: n2-claim 685b3e6aebed

# n2-claim evidence — every kaola-workflow-claim.js change (#619 close-helper, #620, #631)

## Scope

Owns every edit to `kaola-workflow-claim.js` across all four editions (canonical
`scripts/`, codex twin `plugins/kaola-workflow/scripts/`, GitLab hand-port, Gitea
hand-port), plus RED-first test coverage in `scripts/test-claim-hardening.js`,
`plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`, and
`plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`. Depended on n1-sink
(consumed the additive `published_head` field n1 stamps at the closure gate).
Does NOT touch `sink-merge.js` (n1's file).

## Fixes implemented (all three, in the three disjoint regions named in the plan)

1. **#619 close-helper success-path post-probe** — `closeIssueIdempotent`
   trusted a `gh issue close` (or forge `closeIssue`) exit 0 unconditionally on
   the success path; only the catch branch re-probed. Added a NEW, un-memoized
   live probe (`probeIssueClosedLive` in canonical/GitLab/Gitea, mirroring
   sink-merge.js's own `probeIssueClosed`) called on BOTH the success path and
   the catch path. This was load-bearing, not cosmetic: `probeIssueState`
   (imported from active-folders.js) memoizes per-process, and the pre-close
   probe at the top of `closeIssueIdempotent` already primes that memo with
   the pre-close 'open' verdict — reusing it for a post-close re-check would
   ALWAYS replay the stale pre-close state, which would have made every
   genuine successful close register as `failed` (a severe regression, not
   just missing coverage) and made the pre-existing catch-branch "probe" a
   permanent no-op. The live probe fixes both branches correctly:
   - success + still-open (live probe) -> `failed`
   - success + confirmed-closed (live probe) -> `closed` (no regression)
   - throw + confirmed-closed (live probe) -> `already_closed` (was silently
     broken before this fix, since the reused memo always said 'open')
   - throw + still-open (live probe) -> `failed` (baseline, unchanged)

2. **#620 stale-cleanup unconditional `-D`** — `cmdStaleWorktreeCleanup`'s
   branch-deletion loop called `removeBranch()` (unconditional `git branch
   -D`) on every candidate branch once its issue closed on the forge.
   `collectStale` treats a closed-issue branch as stale regardless of merge
   status, and `worktreeDirtyState` only checks *uncommitted* changes (`git
   status --porcelain`), so a branch carrying committed-but-unmerged work
   read 'clean' and got force-deleted — permanently orphaning the only copy
   of that work (the exact #617 data-loss end-state this tool exists to
   remedy). Fix: added `removeBranchIfMerged(root, branch, defBranch)` — a
   NEW, distinct helper (mirroring sink-merge.js's post-merge branch teardown
   at its own is-ancestor gate) that proves `git merge-base --is-ancestor
   <branch> <defBranch>` before `-D`; otherwise falls back to the SAFE `git
   branch -d` (git itself refuses unmerged work) and on refusal returns
   `skipped_unmerged` with the branch's tip SHA — never destroys. `removeBranch()`
   itself is left UNTOUCHED and still used by `cmdRelease` (a user-consented
   discard/abandon that legitimately needs unconditional force-delete) — this
   is a deliberate, minimal-blast-radius design choice, not an oversight.
   `cmdStaleWorktreeCleanup`'s `buckets` gained a `skipped_unmerged: []` array.

3. **#631 cmdVerifySink stale branch_head** — `cmdVerifySink` resolved
   `implRef` from `receipt.branch_head` only. `branch_head` is stamped once
   at receipt init, BEFORE `doRebase` runs, so a mid-flight rebase orphans
   that SHA even though the (rebased) content genuinely landed — a clean
   rebased sink false-alarmed `impl_commit_not_ancestor`. Fix: prefer the
   additive `receipt.published_head` (n1-sink's fresh, post-rebase stamp)
   when present, falling back to `branch_head` only for legacy receipts that
   predate the field (`r.published_head || r.branch_head`).

All three fixes were reimplemented in each of the four editions: canonical
`scripts/kaola-workflow-claim.js` edited first, then verbatim-copied (`cp`) to
the codex twin `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
(byte-identical, confirmed by `validate-script-sync.js`); GitLab/Gitea
hand-ported into their `glab`/`tea` forge-CLI bodies (`forge.viewIssue` /
`forge.closeIssue` / `forge.updateIssue` in place of `ghExec`), matching each
port's existing structure. `removeBranchIfMerged` needed no forge-specific
body (pure `git` calls) and was copied verbatim into both hand-ports.
`closeIssueIdempotent` and `removeBranchIfMerged` were added to
`module.exports` in all four editions (the `validate-script-sync.js`
forge-export-superset guard requires every non-`canonicalOnly` canonical
export to also exist in the GitLab/Gitea ports — it caught the omission on
the first run and was fixed by adding both names to all four export lists).

## RED -> GREEN (all reproduced live via `node scripts/test-claim-hardening.js`, not asserted from memory)

RED (pre-fix, full failing run — 9 failures, 160 passed):
```
FAIL: #619: gh issue close exit-0 but a LIVE post-close probe shows the issue still OPEN must bucket failed, got closed
FAIL: #619: a close attempt that THROWS but a live post-probe confirms the issue is actually closed must return already_closed, got failed
FAIL: #620: the unmerged branch workflow/issue-96201 must SURVIVE cleanup --execute (never -D unproven work), got cleanup output: {"dry_run":false,"removed":["...T/kw-620-repo-YLayzd.kw/issue-96201"],"deleted_branch":["workflow/issue-96201"],"skipped_dirty":[],"stashed":[],"exported":[],"failed_preserve":[]}
FAIL: #620: deleted_branch must NOT include the unmerged branch, got ["workflow/issue-96201"]
FAIL: #620: skipped_unmerged must record the unmerged branch (fail LOUD, not silent), got undefined
FAIL: #631: cmdVerifySink must resolve impl_commit from published_head (99944ff54a8d9ebd19954c29ef3890686e83d67f), got {"active_folder":"gone","archive_folder":"present","worktree":"absent","branch":"absent","impl_commit":"da4bf6a69c7de7c896425c379f63977f8de08817","sink_target":"main","merged_into_sink_target":"not_ancestor"}
FAIL: #631: a rebased-but-genuinely-published sink must verify (not false-alarm), got {"active_folder":"gone","archive_folder":"present","worktree":"absent","branch":"absent","impl_commit":"da4bf6a69c7de7c896425c379f63977f8de08817","sink_target":"main","merged_into_sink_target":"not_ancestor"}
FAIL: #631: reasons must NOT include impl_commit_not_ancestor for a genuinely published (rebased) sink, got ["impl_commit_not_ancestor"]
FAIL: #631: verify-sink must exit 0 for a genuinely published rebased sink, got 1 full: {"project":"issue-96311","ok":false,"checks":{...,"merged_into_sink_target":"not_ancestor"},"reasons":["impl_commit_not_ancestor"]}
claim-hardening tests FAILED (9 failures, 160 passed)
```
(The two control assertions for #619 — genuine success stays `closed`; throw+still-open
stays `failed` — already passed pre-fix by coincidence of the old code's shape, confirming
the test correctly isolates the bug rather than trivially failing everything.)

GREEN (post-fix):
```
claim-hardening tests passed (169 assertions)
```
169 = 160 pre-existing + 9 new #619/#620/#631 assertions (2 controls that were already-passing
plus 7 that flipped RED->GREEN, but the full new block adds more granular assertions than the
raw failure count — every new assertion, including the 2 controls, is now green).

## Forge-side RED coverage (test-gitlab-sinks.js / test-gitea-sinks.js)

Added the same three fixture families (in-process `withForge` stubbing for #619's
close-helper; subprocess `stale-worktree-cleanup --execute` for #620; subprocess
`verify-sink` for #631) to both forge test files, appended after n1-sink's existing
additions (did not clobber). Both run clean post-fix:
```
GitLab #619 claim.js close-helper post-probe tests passed
GitLab #620 stale-worktree-cleanup unmerged-branch survives test passed
GitLab #631 verify-sink published_head preference test passed
GitLab sink tests passed

Gitea #619 claim.js close-helper post-probe tests passed
Gitea #620 stale-worktree-cleanup unmerged-branch survives test passed
Gitea #631 verify-sink published_head preference test passed
Gitea sink tests passed
```

## Full validation run (this session, all commands actually executed)

- `node -c scripts/kaola-workflow-claim.js`, `node -c plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`, `node -c plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`: syntax OK
- `node scripts/validate-script-sync.js`: OK (24 common scripts, 25 byte-identical groups, 7 forge export-superset families in sync — including claim.js's new `closeIssueIdempotent`/`removeBranchIfMerged` exports)
- `node scripts/test-claim-hardening.js`: 169 assertions passed
- `node scripts/simulate-workflow-walkthrough.js`: full suite green ("Workflow walkthrough simulation passed"), all pre-existing `stale-worktree-cleanup`/`verify-sink` scenarios (11 sub-cases + #631's own sink-merge-side test) unaffected — every pre-existing fixture branch is trivially self-ancestor (created at HEAD with no divergent commits), so `removeBranchIfMerged`'s is-ancestor proof passes for all of them and `deleted_branch` output is unchanged
- `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`: PASSED (new #619/#620/#631 blocks + all pre-existing n1-sink tests)
- `node plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`: PASSED (same)
- `npm run test:kaola-workflow:codex`: PASSED (exit 0), full chain including `simulate-kaola-workflow-walkthrough.js` and `test-active-folders-field-parity.js`
- `npm run test:kaola-workflow:claude`: every step through `test-phase4-advance.js` passes; `test-run-chains.js` fails non-deterministically (confirmed: two consecutive re-runs produced DIFFERENT failing T-numbers — run1={T1,T3,T5,T14,T15,T16,T17,T19,T20,T22,T25,T26,T28}, run2={T1,T2,T5,T7,T15,T17,T19,T22,T25,T27,T28} — and `grep -n "workflow-claim" scripts/test-run-chains.js` returns ZERO matches). Confirmed via `git stash` that the identical non-deterministic pattern reproduces on the pre-my-change tree. Pre-existing, documented (#635), out of scope. The chain steps AFTER it (`simulate-workflow-walkthrough.js`, `test-active-folders-field-parity.js`) were verified green by running them standalone (see above; `test-active-folders-field-parity.js`: 61 assertions passed).
- `npm run test:kaola-workflow:gitlab`: every step through `test-gitlab-sinks.js` (including my new blocks) passes; the next step, `test-gitlab-run-chains.js`, fails non-deterministically (run1: only G2; run2: G2+G3 — different subset) — confirmed via `git stash` the identical pattern reproduces on the pre-my-change tree; zero references to claim.js in that file. The remaining chain steps (`simulate-gitlab-codex-workflow-walkthrough.js`, `test-active-folders-field-parity.js`) verified green standalone.
- `npm run test:kaola-workflow:gitea`: same shape — every step through `test-gitea-sinks.js` passes; `test-gitea-run-chains.js` fails non-deterministically (run1: G3 only; run2: G2 only — different subset), zero claim.js references, confirmed pre-existing via the same flake family. `simulate-gitea-codex-workflow-walkthrough.js` verified green standalone.

No other test in any of the four chains regressed. The only failures across all
four full-chain runs are the pre-existing `test-{run,gitlab-run,gitea-run}-chains.js`
signal/receipt-timing flake family (#635), confirmed non-deterministic and confirmed
(via stash-based A/B on the identical commit) to reproduce identically on the
untouched tree — never referencing claim.js.
