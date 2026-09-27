# #1098 review-round fix evidence (for the finalize summary)

Candidate under review: `79798456` — independent Claude review VERDICT: FAIL (F1–F8).
Fixed candidate (frozen): **`9a98f1cbecb2cfb3d71010d7873229fd6e1d274f`** on `workflow/issue-1098`.
Commit: `9a98f1cb` — "review round: retry refused archive pushes, fail closed on probe failure,
one kernel mechanism". Author = committer = `KaolaBrother <yanleichen@hotmail.com>`. Tree clean.
New commits only; no existing commit was rewritten.

## Reviewer repro (all pass on the fixed candidate)

| Script | Before | After |
|---|---|---|
| `repro.js push-fail-reentry` | RUN2 exited 0 `sink_pr: reused`, local tip != remote tip, `remote carries archive? false` | local tip == remote tip, `remote carries archive? true` |
| `repro.js probe-fail-open` | exit 0 `sink_pr: created`, `deleted remote branch resurrected? true` | exit 1, no create, `resurrected? false` |
| `repro.js reconcile-rewind` | `main_checkout: advanced`, `L still reachable from main? false` | `main_checkout: behind: main has unpushed commits that origin/main does not contain`, `L still reachable? true` |

## F1–F8

| # | Failing test (name / location) | RED evidence at `79798456` | Fix location | GREEN |
|---|---|---|---|---|
| F1 | `testSinkPrRePushesArchiveAfterRefusedPush` (`scripts/simulate-workflow-walkthrough.js`) + inverted assertions rewritten at `plugins/kaola-workflow-{gitlab,gitea}/scripts/test-{gitlab,gitea}-sinks.js:172` | "origin must carry the archive after re-entry, got: README.md, feat.txt" | `publishPathsOntoRequestBranch` (kernel) pushes whenever local tip != `origin/<branch>` | PASSED |
| F2 | `testSinkPrProbeFailureFailsClosed` (walkthrough); GitLab/Gitea suite cases | "a failed probe of a RECORDED PR must fail closed, got exit 0 / sink_pr: created" | record-present + probe-fail now `assert`s `pr_probe_failed` / `mr_probe_failed` in all three sinks | PASSED |
| F3 | `testWatchPrReconcileRefusesToRewindLocalDefault` (walkthrough) | "an unpushed local default must report behind, never advanced, got: advanced" | `advanceCheckedOutDefault` CAS arm gains `merge-base --is-ancestor` guard; all 4 kernel copies byte-identical | PASSED |
| F4 | GitLab/Gitea suite F2/F4 cases (`mergedauto`) | merge called on a merged request | `main()` returns before merge; emits `sink_mr:`/`sink_pr:` lane token | PASSED |
| F5 | — (structural) | three ~100-line copies | one kernel `publishPathsOntoRequestBranch`; `ignoredUntrackedUnder`/`repoWideIgnoredNames`/`worktreeCheckedOutBranch` reused; dead `findMergeRequestForBranch`/`findPullRequestForBranch` deleted | sync OK |
| F6 | `testSinkPrOfflineDoesNotCommitOnMain` (walkthrough) | "OFFLINE from a dev worktree must not move main HEAD" | OFFLINE commits only when the run branch lives in the main checkout | PASSED |
| F7 | `testWatchPrLocalOnlyRunIsBoundedAfterReconcile` (walkthrough) | n/a (new) | one memoized `fetch` per scan; archive on the local default branch also leaves the scan; residual all-remote-absent case documented as a known limit | PASSED |
| F8 | — (docs) | stale sentence, exit codes, `sink-pr.js:236` comment, GitLab/Gitea swallowed probe errors | `docs/api.md`, `CHANGELOG.md`, sink comments, `probeErrors` threaded into both forge reconciles | n/a |

## Full chain (fixed candidate `9a98f1cb`)

| Command | Exit |
|---|---|
| `npm test` (claude/codex/gitlab/gitea producer chains) | 0 |
| `node scripts/simulate-workflow-walkthrough.js` | 0 (198/198) |
| `npm run test:kaola-workflow:editions` | 0 (11/11) |
| `node scripts/validate-script-sync.js` | 0 (18 byte-identical + 5 export-superset families) |
| `node scripts/generate-routing-surfaces.js --check` | 0 (24 surfaces) |
| `node scripts/kaola-workflow-run-chains.js --output /tmp/kw1098-receipt2/chain-receipt.json` | 0 |
| `... --release-check --candidate HEAD --receipt <above>` | 0 (`release ok ... at 9a98f1cb...`) |

Chain receipt: `/tmp/kw1098-receipt2/chain-receipt.json` — `headSha=9a98f1cb...`,
`codeTreeHash=1139b55b4a07479b5775bc2272fc11dfc38ef39bc661e653d68ec9dd71076854`,
4 chains exit 0, unwaived.

## Measurement

`git diff --shortstat 04866c50..HEAD` = 29 files changed, 4473 insertions(+), 401 deletions(-).
Production code net lines excluding the `plugins/kaola-workflow/` mirror: **+1600**
(added 1859 / deleted 259). Of that, the review round itself (against `79798456`) is **+251**
(added 749 / deleted 498) — the consolidation in F5 is why the round is net-negative on the sinks.

## Environment note (not a candidate defect)

`npm run test:kaola-workflow:editions` initially failed on opencode/kimi/grok/zcode with
`PARITY FAILED … stale`. The same four fail on a clean `main` checkout and on the previous candidate
`79798456`: the gitignored `.opencode*` / `.kimi*` / `.grok*` / `.zcode*` trees are **locally
installed** artifacts that predate #1100's finalize-render change. Regenerating them with the
scripts' own prescribed `node scripts/sync-<edition>-edition.js --forge=<f> --write` made the lane
green (11/11). No tracked file changed.

## Not done (out of this turn's boundary)

Not finalized, not pushed, no issue opened or closed, not self-reviewed. Frozen candidate
`9a98f1cb` awaits independent re-review.
