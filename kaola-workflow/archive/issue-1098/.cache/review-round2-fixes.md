# #1098 repair round 2 evidence (for the finalize summary)

Round-2 review VERDICT: FAIL on `9a98f1cb`; round-1 fixes F1–F4/F6 confirmed fixed by the reviewer's
own reproduction and kept intact. Repair committed as **`b1f91c40`** on top of `088d3ea5`
(rebased onto `origin/main = 209be26f`). Frozen candidate = **`b1f91c40189aba69a32277e30c7038e9f39d3940`**.
Author = committer = `KaolaBrother <yanleichen@hotmail.com>`, no trailer, explicit pathspecs,
new commit only. Worktree clean; `0 behind / 7 ahead` of `origin/main`.

## BLOCKING

### B1 — a LIVE run folder was published onto the request branch (regression from round 1)
- **Test**: `testSinkPrLiveFolderIsNeverPushed` (`scripts/simulate-workflow-walkthrough.js`).
- **RED on the base implementation** (`088d3ea5`, new test file copied onto the base source):
  `#1098 B1: the live run folder must never reach the request branch, found
  kaola-workflow/issue-43/workflow-state.md`; branch tree carried `.cache/sink-pr-result.json`,
  `finalization-summary.md`, `workflow-state.md`.
- **Reviewer's own live-folder case** (`/tmp/kw1098-livecase.js`, linked posture, live folder, online):
  - on `088d3ea5`: `VERDICT: FAIL (live folder leaked)` — 3 `kaola-workflow/issue-9/…` paths.
  - on `b1f91c40`: `VERDICT: PASS (live folder not published)` — `[]` paths, exit 0 `sink_pr: created`.
- **Fix** (one kernel function): `publishPathsOntoRequestBranch` now derives
  `kaola-workflow/archive/<project>/` from the caller's project folder and publishes ONLY that. A live
  project has no archive band, so nothing is published. All four kernel copies byte-identical
  (`validate-script-sync` reports "4 Oracle Kernel copies identical").

### B2 — the F4 fix had no test that failed on the broken code
- **Tests**: CLI-level, in `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` and
  `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`. They drive the real sink processes
  (forge reached through `KAOLA_GLAB_MOCK_SCRIPT` / `KAOLA_TEA_MOCK_SCRIPT`, which records every call)
  on an already-merged request, in both the explicit `--merge` lane and the config
  `mr_auto_merge` / `pr_auto_merge` lane, and assert the merge API is never invoked.
- **RED** (early-return removed from `main()`):
  - GitLab: `#1098 B2: --merge must NOT call \`glab mr merge\` on an already-merged MR`.
  - Gitea: `#1098 B2: --merge must NOT call the merge API on an already-merged PR`.
  - Both proven with revert → run → restore inside a single shell command, so no interruption could
    leave the fix reverted.
- **GREEN**: both suites pass with the fix (`sink_mr: already_merged` / `sink_pr: already_merged`,
  exit 0, zero merge calls).
- **`:172` assertion REMOVED** in both forge suites: it could never fail, because the kernel performs
  the publish push via `spawnSync` and an injected `gitExec` cannot observe it. "Reuse does not take
  the create path" remains pinned by the `createMergeRequest` / `createPullRequest` stubs that throw.
  Push-on-reuse is pinned end to end by `testSinkPrRePushesArchiveAfterRefusedPush`.

## Non-blocking

- **N1** DONE — `firstLine` now receives `r.stderr || r.stdout` on the commit / ff / CAS / push
  refusal paths, so refusals report git's own reason instead of `[object Object]`.
- **N2** DONE — chose to **fix the condition** (not the docs). OFFLINE now commits only in the
  non-linked posture (`getRoot() === root`: the checkout the sink runs in IS the main root). Before,
  it committed whenever the run branch was not held by another worktree, so an OFFLINE run whose
  branch existed nowhere still wrote a metadata commit onto the shared main checkout. All three sinks
  use the same `runToplevel === root` rule; `docs/api.md` states it precisely.
- **N3** DONE — `forcePush` renamed to `skipPush` (it skips the push; this helper never forces one),
  and the unused `project` option dropped.
- **N4** DONE — `docs/api.md` and `CHANGELOG.md` no longer claim GitLab/Gitea keep their old stdout;
  all three sinks print a `sink_mr:` / `sink_pr:` lane line above their existing URL lines.
- **N5** REPORT-ONLY, not implemented — sink-merge still carries its own
  `ignoredUntrackedUnder` / `repoWideIgnoredNames` copies in all three editions even though the kernel
  now exports them.

## Validation on `b1f91c40` (isolated HOME)

| Command | Exit |
|---|---|
| `npm test` (claude/codex/gitlab/gitea producer chains) | 0 |
| `node scripts/simulate-workflow-walkthrough.js` | 0 (199/199) |
| `node scripts/validate-script-sync.js` | 0 (18 byte-identical + 5 export-superset families) |
| `node scripts/generate-routing-surfaces.js --check` | 0 (24 surfaces) |
| `test-gitlab-sinks.js` / `test-gitlab-workflow-scripts.js` | 0 / 0 |
| `test-gitea-sinks.js` / `test-gitea-workflow-scripts.js` | 0 / 0 |
| `npm run test:kaola-workflow:editions` | 0 (11/11, no D0 drift) |
| `scripts/test-kernel-conformance.js` / `scripts/test-claim-hardening.js` | 0 / 0 (875 assertions) |
| `run-chains --output /tmp/kw1098-receipt4/chain-receipt.json` | 0 |
| `run-chains --release-check --candidate HEAD --receipt <above>` | 0 |

Chain receipt: `/tmp/kw1098-receipt4/chain-receipt.json` — `headSha=b1f91c40…`,
`codeTreeHash=bdaddb7bc6b5125729391bdcb9550595106683e29764e3a828e62fe22fab26f5`,
4 chains exit 0, unwaived.

Reviewer repro on `b1f91c40`: F1 local tip == remote tip and origin carries the archive; F2 exit 1,
branch not resurrected; F3 `main_checkout: behind: main has unpushed commits…` with L still reachable.

## Notes

- One transient flake: `test-gitlab-sinks.js` failed once under parallel load with the #1097 AC2
  rendezvous timeout (`both integration worktrees must exist during the overlap; done markers at
  1,0`); it passes when run alone and in `npm test`. Unrelated to this change.
- `git diff --shortstat origin/main..HEAD` = 29 files changed, 4699 insertions(+), 401 deletions(-).

## Not done (out of this turn's boundary)

Not finalized, not pushed, no issue opened or closed, not self-reviewed.
