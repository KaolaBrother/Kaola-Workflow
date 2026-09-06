# Issue #1052 implementation call chain (C1–C3)

worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`  
production custody only. Did not edit tests. Did not touch `kaola-workflow/bundle-1051`, sessionStart / `--global` dual-write, Runner, or mission-list done rows. Did not run `npm test`, `test:kaola-workflow:claude:full`, or `scripts/simulate-workflow-walkthrough.js`. Did not restore CLI-from-sibling-`agent` inference. Did not hand-edit rendered mirrors. Did not change COMMON_SCRIPTS claim.js (`npm run sync:editions` not run). C4 README left for doc-updater.

## task

Make generated/installed Cursor `workflow-next.md` (github/gitlab/gitea via the same `transformCommandBody`) emit two executable claim.js classes on one shared file: unstamped App/Cloud `startup|resume --runtime cursor` (omit product/host so ensure is skipped) plus standalone CLI lines with `--product cli --host local --cursor-workspace "$CURSOR_WORKSPACE"`. Put a self-contained Cursor `kaola_script` / `CLAIM_JS="$(kaola_script …claim.js)"` CLI resume fence first under `## Resume` so cold recovery with `CLAIM_JS` unset or `""` invokes named forge claim.js.

## verification tier

`tests-green` for the assigned oracle and C1–C3 of the 1052 suite. C4 README remains RED by design of this mission.

## files changed

- `scripts/sync-cursor-edition.js` — stop replacing the shared startup/resume with a single cli/local stamp; keep the unstamped `--runtime cursor` lines; add CLI-identity operator fences; first `## Resume` fence inlines `cursorKaolaScript` + named `kaola_script <forge-claim.js>` then `node "$CLAIM_JS" resume … --cursor-workspace "$CURSOR_WORKSPACE"`. Empty `--cursor-workspace` already falls through in existing `resolveCursorCliEnsureTarget` (claim.js not modified).

Generated `.cursor*/commands/workflow-next.md` trees are gitignored. Isolated `--write --tree-root` in the suites is the consumer of this generator. A mistaken `--refresh-present` from the worktree briefly wrote the main checkout's ignored `.cursor*` trees; those were regenerated again from the **main** checkout's generator so main ignored trees match main sources.

## verification commands

```
node scripts/test-cursor-edition.js --cli-materialization-oracle
# exit 0
# CLI-MATERIALIZATION-ORACLE GREEN: Next CLI identity vs App/Cloud shared-file, --cursor-workspace operator argv, named claim.js flags, locator, and Finalize pre-dispatch ensure

node scripts/test-issue-1052-cursor-cli-startup-prep.js
# exit 1
# FAIL: #1052-c4-readme-prep: README must state the user-visible Cursor CLI/local startup/resume Repo prep
# FAIL: #1052-c4-readme-app-cloud: README must state App/Cloud do not inherit the CLI ensure
# issue-1052 cursor CLI startup/resume prep FAILED: 2 failure(s), 201 passed.
```

Oracle exit 0. 1052 suite: C1–C3 green; only C4 README fails (2 failures). 173 passed + 28 prior generated-consumer REDs → 201 passed.

## before

Baseline SHA `2cae8caa` (recorded in `acceptance-red-call-chain.md`):

- `node scripts/test-issue-1052-cursor-cli-startup-prep.js` — exit 1, 28 failed / 173 passed
- `node scripts/test-cursor-edition.js --cli-materialization-oracle` — exit 1, 12 RED errors (github/gitlab/gitea × 4 Next findings)

## after

- `node scripts/test-cursor-edition.js --cli-materialization-oracle` — exit 0, GREEN
- `node scripts/test-issue-1052-cursor-cli-startup-prep.js` — exit 1, **2 failed / 201 passed**, failures only `#1052-c4-readme-prep` and `#1052-c4-readme-app-cloud`

C1: shared file keeps unstamped App/Cloud `node "$CLAIM_JS" startup|resume --runtime cursor` and adds CLI `--product cli --host local`. Emitted unstamped argv through named claim.js does not run `ensureCursorCliLocalPrep`.  
C2: CLI operator argv includes `--cursor-workspace "$CURSOR_WORKSPACE"`; unset/empty locator falls through to `getRoot()`; write-worktree resume with `CURSOR_WORKSPACE` set preps the worktree.  
C3: first bash fence under generated `## Resume` inlines Cursor `kaola_script` and named forge claim.js; `CLAIM_JS` unset / `CLAIM_JS=""` invoke `kaola-*-workflow-claim.js resume`.
