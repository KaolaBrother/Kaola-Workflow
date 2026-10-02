# Execution log

All paths below are under the canonical provider MAIN checkout. The source snapshot and fixture
outputs are retained beside this log. No test used `/tmp` for evidence custody.

## Source and issue inputs

- `git archive --format=tar --prefix=provider-fe7e4443a8c367cfc111c65755191ae6790e810e/ fe7e4443a8c367cfc111c65755191ae6790e810e > kaola-workflow/issue-1113/.cache/keepopen-independent-pins/provider-fe7e4443a8c367cfc111c65755191ae6790e810e.tar` — exit 0, verified by the embedded tar commit id and SHA-256.
- `tar -xf kaola-workflow/issue-1113/.cache/keepopen-independent-pins/provider-fe7e4443a8c367cfc111c65755191ae6790e810e.tar -C kaola-workflow/issue-1113/.cache/keepopen-independent-pins/frozen-source` — exit 0; extracted source made read-only.
- `git get-tar-commit-id < kaola-workflow/issue-1113/.cache/keepopen-independent-pins/provider-fe7e4443a8c367cfc111c65755191ae6790e810e.tar` — exit 0; output is retained in `archive-embedded-commit.txt` and equals the frozen commit.
- `chmod -R a-w /Users/ylmacstudio/Workspace/kaola-workflow/kaola-workflow/issue-1113/.cache/keepopen-independent-pins/frozen-source /Users/ylmacstudio/Workspace/kaola-workflow/kaola-workflow/issue-1113/.cache/keepopen-independent-pins/provider-fe7e4443a8c367cfc111c65755191ae6790e810e.tar /Users/ylmacstudio/Workspace/kaola-workflow/kaola-workflow/issue-1113/.cache/keepopen-independent-pins/provider-AGENTS.md /Users/ylmacstudio/Workspace/kaola-workflow/kaola-workflow/issue-1113/.cache/keepopen-independent-pins/accepted-astra-memo.md /Users/ylmacstudio/Workspace/kaola-workflow/kaola-workflow/issue-1113/.cache/keepopen-independent-pins/accepted-host-adoption.md /Users/ylmacstudio/Workspace/kaola-workflow/kaola-workflow/issue-1113/.cache/keepopen-independent-pins/provider-issue-1113-readback.json` — final exit 0; exit is in `source-freeze.exit`.
- `gh issue view 1113 --json title,state,body,comments,url` — exit 0; raw current response is `provider-issue-1113-readback.json`.
- Provider `AGENTS.md`, accepted Astra memo, and Host adoption were copied byte-for-byte into this cache. Their source-copy hashes are listed in `ARTIFACT-HASHES`.

The first archive wrapper used the zsh-reserved variable name `status`. The archive bytes were already
written before zsh emitted `read-only variable: status`; the wrapper stopped before recording its
exit. The archive was then hashed, identified by `git get-tar-commit-id`, extracted, and verified by a
separate successful command. This wrapper error did not alter source or fixture files. Its stderr is
retained as `archive-wrapper-first-attempt.stderr.raw`; the first wrapper's numeric exit was not
captured, so no exit value is inferred here.

## Baseline proof

- From CWD `/Users/ylmacstudio/Workspace/kaola-workflow`, `node kaola-workflow/issue-1113/.cache/keepopen-independent-pins/run-baseline.js` — outer harness exit 0 (expected baseline classification).
- Inner command recorded in `baseline-source-capabilities.json`: `node /Users/ylmacstudio/Workspace/kaola-workflow/kaola-workflow/issue-1113/.cache/keepopen-independent-pins/frozen-source/provider-fe7e4443a8c367cfc111c65755191ae6790e810e/scripts/kaola-workflow-sink-pr.js --project issue-143 --branch workflow/issue-143 --issue 143` — exit 1 with the exact `merge-sink-only` refusal in `baseline-cli.stderr.raw`.
- The inner command ran with `KAOLA_WORKFLOW_OFFLINE=1`, an isolated `os.homedir()` preloader, a fixture config with `pr_auto_merge: true`, and a logging `gh` stub. The spy recorded no calls. State/config SHA-256, fixture Git status, unborn HEAD, and absent index were unchanged.

No unsupported option was passed. The current parser was called directly with the existing
`--project`, `--branch`, and `--issue` arguments. Its exported body builder returned `Closes #143`.

## Test-only semantic controls

- From CWD `/Users/ylmacstudio/Workspace/kaola-workflow`, `KW_ISSUE_1113_KEEP_OPEN_TEST_ADAPTER=/Users/ylmacstudio/Workspace/kaola-workflow/kaola-workflow/issue-1113/.cache/keepopen-independent-pins/fixture-adapter.js node /Users/ylmacstudio/Workspace/kaola-workflow/kaola-workflow/issue-1113/.cache/keepopen-independent-pins/proposed-test/scripts/test-issue-1113-keepopen-pr.js` — exit 0; 42 normalized semantic fixture scenarios passed. Raw stdout/stderr and exit are `semantic-control-final.*`.
- From CWD `/Users/ylmacstudio/Workspace/kaola-workflow`, `node /Users/ylmacstudio/Workspace/kaola-workflow/kaola-workflow/issue-1113/.cache/keepopen-independent-pins/run-negative-controls.js` — final exit 0; all 19 deliberately unsafe adapter mutations exited 1 at the named acceptance assertion. Per-mutation stdout, stderr, and exit files are retained as `negative-final-*.raw` and `negative-final-*.exit`.
- From CWD `/Users/ylmacstudio/Workspace/kaola-workflow`, `node kaola-workflow/issue-1113/.cache/keepopen-independent-pins/build-test-patch.js` — final exit 0; the generated additive patch adds the suite plus an opt-in `test:issue-1113:keepopen-pr` npm command; it does not change default/full chains. The builder's two expected `git diff --no-index` subprocesses each exited 1 because each produced a diff.
- `git apply --check /Users/ylmacstudio/Workspace/kaola-workflow/kaola-workflow/issue-1113/.cache/keepopen-independent-pins/proposed-test-integration.patch` — exit 0 from canonical MAIN and exit 0 again with CWD `/Users/ylmacstudio/Workspace/kaola-workflow/kaola-workflow/issue-1113/.cache/keepopen-independent-pins/frozen-source/provider-fe7e4443a8c367cfc111c65755191ae6790e810e`. Separate stdout/stderr/exit files are `patch-check-final.*` and `patch-check-frozen-final.*`.

The final 42-scenario run and 19 negative controls use only the source-independent fixture adapter.
They are semantic-control evidence, not a candidate PASS. During development the first 18-control
run let an `issue.reopen` mutation through because watcher assertions were not invoking the
no-close/no-reopen check. That failed run is retained in
`iterations/negative-control-found-reopen-gap/`; the watcher assertion was added and the final
19-control run rejects the mutation. Earlier 33-case and 42-case runs are retained in their named
iteration folders and superseded by the final matrix.

## Repository state

- From CWD `/Users/ylmacstudio/Workspace/kaola-workflow`, `git rev-parse HEAD` — exit 0; output `fe7e4443a8c367cfc111c65755191ae6790e810e` in `final-head.txt`.
- From the same CWD, `git status --short --branch` — exit 0; output `## main...origin/main` and `?? kaola-workflow/issue-1113/` in `final-worktree-status.raw`.
- From the same CWD, `git worktree list --porcelain` — exit 0; it lists canonical MAIN and the already-existing `issue-1113` worktree at the baseline HEAD in `final-worktrees.raw`. I created no worktree and did not inspect candidate contents.
- `shasum -a 256 kaola-workflow/issue-1113/workflow-state.md kaola-workflow/.ledger/issue-1113.jsonl` — exit 0; delivery hashes are in `final-claim-ledger-state.sha256`. The state hash is `2b448db32217d7f0eded88d31b19368a1936667c9dd615820077f5d2f6eca7b5`; the ledger hash is `49f67367b89311050cb5c6eac9843d354c8c0de3defc428931c042e21edc5526`.
- The only untracked top-level path is the pre-existing active issue directory, which includes owner/Host cache evidence and this task's cache. All provider-MAIN writes made for this delivery are under `kaola-workflow/issue-1113/.cache/keepopen-independent-pins/`; the only external write is the requested report mirror below.
- From CWD provider MAIN, the exact mirror command was `mkdir -p /Users/ylmacstudio/Workspace/vrpcadcore/kaola-workflow/issue-143/.cache/provider-1113-independent && cp /Users/ylmacstudio/Workspace/kaola-workflow/kaola-workflow/issue-1113/.cache/keepopen-independent-pins/REPORT.md /Users/ylmacstudio/Workspace/vrpcadcore/kaola-workflow/issue-143/.cache/provider-1113-independent/REPORT.md && cmp /Users/ylmacstudio/Workspace/kaola-workflow/kaola-workflow/issue-1113/.cache/keepopen-independent-pins/REPORT.md /Users/ylmacstudio/Workspace/vrpcadcore/kaola-workflow/issue-143/.cache/provider-1113-independent/REPORT.md > /Users/ylmacstudio/Workspace/vrpcadcore/kaola-workflow/issue-143/.cache/provider-1113-independent/REPORT-compare.stdout.raw 2> /Users/ylmacstudio/Workspace/vrpcadcore/kaola-workflow/issue-143/.cache/provider-1113-independent/REPORT-compare.stderr.raw; rc=$?; printf '%s\n' "$rc" > /Users/ylmacstudio/Workspace/vrpcadcore/kaola-workflow/issue-143/.cache/provider-1113-independent/REPORT-compare.exit; shasum -a 256 /Users/ylmacstudio/Workspace/vrpcadcore/kaola-workflow/issue-143/.cache/provider-1113-independent/REPORT.md > /Users/ylmacstudio/Workspace/vrpcadcore/kaola-workflow/issue-143/.cache/provider-1113-independent/REPORT.sha256; exit "$rc"` — exit 0. `REPORT-compare.exit` is 0 and `REPORT.sha256` records the mirrored bytes.
- From CWD `/Users/ylmacstudio/Workspace/kaola-workflow/kaola-workflow/issue-1113/.cache/keepopen-independent-pins`, `set -o pipefail; find . -type f ! -name ARTIFACT-HASHES ! -name ARTIFACT-HASHES.sha256 -print0 | xargs -0 shasum -a 256 | LC_ALL=C sort > ARTIFACT-HASHES` — exit 0.
- From the same CWD, `shasum -a 256 ARTIFACT-HASHES > ARTIFACT-HASHES.sha256 && shasum -a 256 -c ARTIFACT-HASHES > /dev/null && shasum -a 256 -c ARTIFACT-HASHES.sha256 > /dev/null` — exit 0; both the full artifact index and its manifest sidecar verify.
- No source/test/doc edits, Git commit, new worktree, install, claim/ledger write, provider write,
  finalize, push, merge, archive, release, or cleanup was performed.
