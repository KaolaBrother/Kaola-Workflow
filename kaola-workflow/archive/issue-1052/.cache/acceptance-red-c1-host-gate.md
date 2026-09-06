# Issue #1052 acceptance RED — C1 executable host gate

baseline SHA actually run: `8fbd756a6ffd3681c9270261a654d667fadd205f`
worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`
`git rev-parse HEAD` in that worktree matched the SHA above.

TEST CUSTODY ONLY. No production edits. Did not rewrite mission-list done rows. Did not touch `kaola-workflow/bundle-1051`. Did not run `npm test`, `test:kaola-workflow:claude:full`, or `scripts/simulate-workflow-walkthrough.js`. Did not weaken C2 `--cursor-workspace`, C3 cold `CLAIM_JS` unset/empty named claim.js, C4 README, or claim.js `--product app` negatives.

Two argv classes on generated Next are necessary and were already GREEN. That is not C1. Compact recovery still executes the first `## Resume` fence; that fence is the unguarded CLI stamp, so App/Cloud-like default resume forges `--product cli --host local` and materializes Repo prep. Host-negative prose after `KW-COMPACT-RECOVERY-END` is not a gate. Sibling `agent` on PATH is not treated as CLI.

## Test paths

- `scripts/test-issue-1052-cursor-cli-startup-prep.js` — extended. Generates Next (`sync-cursor-edition.js --write --tree-root`). Static pin: every CLI-stamped startup/resume bash fence must contain an executable `if`/`elif`/`case` on product/host. Execution: first `## Resume` fence under `bash --noprofile --norc` with `CLAIM_JS` unset; App/Cloud-like env does not set CLI product/host and does not pass `--product app`; sibling `agent` remains on PATH. CLI env sets `CURSOR_PRODUCT=cli` / `CURSOR_HOST=local` (and `KAOLA_CURSOR_*` twins) and must still emit `--product cli --host local` plus `--cursor-workspace`; GitHub fence must materialize. App concatenation of every startup/resume bash fence must not invoke the cli/local identity.
- `scripts/test-cursor-edition.js` — `cursorCliMaterializationVerdict(..., 'next')` now fails when a CLI-stamped operator fence has no executable host/product `if`/`case`. G2 mutation: appending an unguarded CLI fence is rejected.

Forbidden substitutes not used as C1 proof: no `claim.js --product app`; no inferring CLI from a sibling `agent` binary.

## Counts

### `node scripts/test-issue-1052-cursor-cli-startup-prep.js`

exit 1 — **10 failed / 216 passed**.

Prior C2/C3/C4 and claim.js App/readonly/fail-closed/host-identity negatives stay inside the 216. New passing pins are the CLI-not-skippable-by-omission path (argv on all three forges; GitHub materialized prep) plus seeds. The 10 failures are C1 host-gate only.

### `node scripts/test-cursor-edition.js --cli-materialization-oracle`

exit 1 — **3 RED errors** (github/gitlab/gitea × Next host-gate). Finalize isolated render produced no host-gate errors on this run. Prior C2 `--cursor-workspace` and two-class App/Cloud line-presence checks did not re-fire.

## RED signatures (1052 suite)

Static (two classes exist; no executable gate):

- `#1052-generated[codex-github]-generated-c1-host-gate`
- `#1052-generated[codex-github]-installed-c1-host-gate`
- `#1052-generated[gitlab]-generated-c1-host-gate`
- `#1052-generated[gitea]-generated-c1-host-gate`

Pin 1 — first `## Resume` fence, App/Cloud-like env (`CLAIM_JS` unset, no CLI product/host):

- `#1052-generated[codex-github]-c1-host-gate-first-resume` — named `kaola-workflow-claim.js resume --runtime cursor --product cli --host local --cursor-workspace `; `cursor_prep.status=materialized`
- `#1052-generated[gitlab]-c1-host-gate-first-resume` — named `kaola-gitlab-workflow-claim.js` same cli/local argv
- `#1052-generated[gitea]-c1-host-gate-first-resume` — named `kaola-gitea-workflow-claim.js` same cli/local argv

Pin 3 — App runs every startup/resume bash fence:

- `#1052-generated[codex-github]-c1-host-gate-every-fence` — second invocation is `startup --runtime cursor --product cli --host local --cursor-workspace …`
- `#1052-generated[gitlab]-c1-host-gate-every-fence` — same unguarded CLI startup class
- `#1052-generated[gitea]-c1-host-gate-every-fence` — same unguarded CLI startup class

## RED signatures (edition oracle)

```
CLI-MATERIALIZATION-ORACLE RED: [github] workflow-next: generated Next CLI startup/resume fence has no executable host/product if/case gate; host-negative prose is not a gate and App/Cloud compact-recovery still forges --product cli --host local
CLI-MATERIALIZATION-ORACLE RED: [gitlab] workflow-next: generated Next CLI startup/resume fence has no executable host/product if/case gate; host-negative prose is not a gate and App/Cloud compact-recovery still forges --product cli --host local
CLI-MATERIALIZATION-ORACLE RED: [gitea] workflow-next: generated Next CLI startup/resume fence has no executable host/product if/case gate; host-negative prose is not a gate and App/Cloud compact-recovery still forges --product cli --host local
```

```
RED: #1052-generated[codex-github]-c1-host-gate-first-resume — named claim.js resume --product cli --host local; cursor_prep.status=materialized
baseline: 8fbd756a6ffd3681c9270261a654d667fadd205f
```

## Passing pins kept (not the skip-proof)

C2 generated CLI `--cursor-workspace` on operator argv; C3 cold first Resume fence with `CLAIM_JS` unset/`""` still invokes named claim.js; C4 README prep + App/Cloud non-inheritance; claim.js `--product app` / omitted / incomplete pair negatives. Pin 2 CLI env still stamps `--product cli --host local` and `--cursor-workspace` on the first Resume fence (unguarded stamp); GitHub that path still materializes. Those are keep-CLI pins, not C1 PASS.

## Unexecuted

- Live Cursor App local / App Cloud sessions.
- `npm test` / `test:kaola-workflow:claude:full` / walkthrough (forbidden).
- Full `test-cursor-edition.js` G2/G7 loops (isolated `--cli-materialization-oracle` only).
