# Issue #1052 acceptance RED — generated consumer call chain (C1–C4)

baseline SHA actually run: `2cae8caa13ef00bd5aef6d5b5f534b3a3ab8352b`  
worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`  
`git rev-parse HEAD` in that worktree matched the SHA above.

TEST CUSTODY ONLY. No production edits. Did not rewrite mission-list done rows. Did not touch `kaola-workflow/bundle-1051`. Did not run `npm test`, `test:kaola-workflow:claude:full`, or `scripts/simulate-workflow-walkthrough.js`.

## Test paths

- `scripts/test-issue-1052-cursor-cli-startup-prep.js` — extended. Existing claim.js App/readonly/fail-closed/host-identity negatives are unchanged (still drive **claim.js** with explicit `--product app` as claim.js pins; they do **not** substitute for C1). New pins generate Next (`sync-cursor-edition.js --write --tree-root`) and GitHub `install-cursor.sh --target`, then drive **emitted** startup/resume argv through named claim.js. Cold Resume executes the generated `## Resume` bash fence under `bash --noprofile --norc` with `CLAIM_JS` unset / `CLAIM_JS=""`. README is asserted as the user-visible surface.
- `scripts/test-cursor-edition.js` — retargeted `--cli-materialization-oracle` / `cursorCliMaterializationVerdict(..., 'next')`. GREEN can no longer be “every `$CLAIM_JS` startup/resume line on the **shared** Next file stamps `--product cli --host local`”. Standalone CLI operator lines must still present explicit cli/local. Shared-file forge (no App/Cloud executable path that omits that pair) is now RED. CLI operator argv must include `--cursor-workspace`. G2 mutation now strips cli/local from the CLI operator path rather than appending an omitted-identity line (which would look like a valid App path).

Forbidden substitute not used as C1 proof: no `claim.js startup --product app` as the generated-consumer oracle.

## Counts

### `node scripts/test-issue-1052-cursor-cli-startup-prep.js`

exit 1 — **28 failed / 173 passed**.

Prior helper/claim.js path on this tree was 141 GREEN; those collision/App/readonly/fail-closed/host-identity negatives still pass inside the 173. The 28 failures are the new generated-consumer / README pins.

### `node scripts/test-cursor-edition.js --cli-materialization-oracle`

exit 1 — **12 RED errors** (github/gitlab/gitea × 4 Next findings). Finalize isolated render produced no errors on this run.

## RED signatures (call-chain suite)

C4 README:

- `#1052-c4-readme-prep: README must state the user-visible Cursor CLI/local startup/resume Repo prep`
- `#1052-c4-readme-app-cloud: README must state App/Cloud do not inherit the CLI ensure`

C1 shared-file forge (generated Next; GitHub also installed `.cursor/commands/workflow-next.md`):

- `#1052-generated[codex-github]-generated-c1-app-startup` / `-generated-c1-app-resume`
- `#1052-generated[codex-github]-installed-c1-app-startup` / `-installed-c1-app-resume`
- `#1052-generated[gitlab]-generated-c1-app-startup` / `-generated-c1-app-resume`
- `#1052-generated[gitea]-generated-c1-app-startup` / `-generated-c1-app-resume`

C1 drive of **emitted** argv (not `--product app`): GitHub installed/generated startup line is `startup --runtime cursor --product cli --host local --target-issues 12521`. Driving that through named `kaola-workflow-claim.js`:

- `#1052-generated[codex-github]-c1-app-drive` — acquired with `cursor_prep.status=materialized` (ensureCursorCliLocalPrep ran).

C2 unused `--cursor-workspace` (prose is not a gate):

- `#1052-generated[*]-*-c2-startup-flag` / `-c2-resume-flag` (github generated+installed, gitlab/gitea generated)
- `#1052-generated[codex-github]-c2-nested-argv` — nested-cwd drive argv `["startup","--runtime","cursor","--product","cli","--host","local","--target-issues","12521","--json"]` has no `--cursor-workspace`
- `#1052-generated[codex-github]-c2-worktree-flag` — resume argv `["resume","--runtime","cursor","--product","cli","--host","local","--json"]` has no `--cursor-workspace`
- `#1052-generated[codex-github]-c2-worktree-open` — Cursor-opened write-worktree did not receive Repo prep (recorded `main_root` path in the assertion)

C3 cold Resume (`bash --noprofile --norc`, intake resolver not re-run). Node argv log is ` resume --runtime cursor --product cli --host local` (empty script path); `node ""` exits 0; named claim.js not invoked:

- `#1052-generated[codex-github]-c3-cold-unset` / `-c3-cold-empty` (`kaola-workflow-claim.js`)
- `#1052-generated[gitlab]-c3-cold-unset` / `-c3-cold-empty` (`kaola-gitlab-workflow-claim.js`)
- `#1052-generated[gitea]-c3-cold-unset` / `-c3-cold-empty` (`kaola-gitea-workflow-claim.js`)

## RED signatures (edition oracle)

```
CLI-MATERIALIZATION-ORACLE RED: [github] workflow-next: shared generated Next forges --product cli --host local for App/Cloud consumers of the same command file
CLI-MATERIALIZATION-ORACLE RED: [github] workflow-next: generated Next CLI startup omits --cursor-workspace on the operator argv
CLI-MATERIALIZATION-ORACLE RED: [github] workflow-next: shared generated Next forges --product cli --host local on resume for App/Cloud consumers of the same command file
CLI-MATERIALIZATION-ORACLE RED: [github] workflow-next: generated Next CLI resume omits --cursor-workspace on the operator argv
```

Same four errors for `[gitlab]` and `[gitea]`.

Standalone CLI explicit `--product cli --host local` on the CLI operator lines still holds on this baseline (those assertions passed). The previous oracle that **required** that pair on every shared-file executable line is what C1 falsifies.

## Passing pins kept (not the skip-proof)

claim.js `--product app` / omitted identity / incomplete pair / readonly status/list-open / collision / symlink / missing+stale authority / Mission List resume bytes — still GREEN. GitHub generated Next still emits CLI cli/local (C1 CLI-path requirement). Isolated `--target` still writes `workflow-next.md`. CLI generated startup argv still acquires and materializes the opened workspace via getRoot() when `--cursor-workspace` is absent.

## Unexecuted

- Live Cursor App local / App Cloud sessions (C1 is pinned by generated argv + named claim.js, not a live App UI).
- `npm test` / `test:kaola-workflow:claude:full` / walkthrough (forbidden for this mission).
- Full `test-cursor-edition.js` G2/G7 loops (isolated `--cli-materialization-oracle` only).
