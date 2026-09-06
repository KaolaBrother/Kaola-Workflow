# Acceptance fixture retarget — Issue #1052 demonstrated CLI parent

role: tdd-guide (test custody only)
worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`
`git rev-parse HEAD`: `ba368eabb3385bfd5e389432603a116b52524298` (dirty: production ancestor-argv walk already present; this pass edited only the demonstrated-parent fixture)
suite: `scripts/test-issue-1052-cursor-cli-startup-prep.js`
command: `node scripts/test-issue-1052-cursor-cli-startup-prep.js` (cwd = worktree)
did_not_run: `npm test`, `test:kaola-workflow:claude:full`, `scripts/simulate-workflow-walkthrough.js`
did_not_touch: production `claim.js` (any of the four trees), `kaola-workflow/bundle-1051`, the 9 assertion bodies/meanings, invented `CURSOR_PRODUCT` / `CURSOR_WORKSPACE` skip-proof, `claim.js --product app` as C1 substitute

comments: 5560806842 / 5561181849

## Fixture defect (independent review)

`writeDemonstratedCursorParent` previously wrote:

```
#!/bin/sh
exec bash --noprofile --norc -c "$KAOLA_FENCE"
```

`exec` replaced the fake `index.js --workspace <opened>` / `--worker-dir` process. Grandchild `claim.js` then saw bash / the test node, not living ancestor argv. Real Cursor CLI `2026.09.02-c22c1a3` keeps `index.js --workspace <dir>` alive as an ancestor of the tool bash.

That was not a production-walk excuse after implementer added ancestor-argv inspection; the fixture did not demonstrate the reviewed CLI process tree.

## Retarget (fixture only)

`writeDemonstratedCursorParent` now writes a living Node `index.js` that `spawnSync`s `bash --noprofile --norc -c "$KAOLA_FENCE"` with `stdio: inherit` and **does not** `exec`-replace itself. Spawn remains `demonstratedParent` + `cliWorkspaceArgv` / `appWorkerArgv`. Grandchild `claim.js` can observe `--workspace` / `--worker-dir` on a living ancestor.

Meaning of the 9 pins unchanged:

- first generated fence + demonstrated `--workspace` must prep **before that single claim**
- App `--worker-dir` without `--workspace` must not
- worktree `--workspace` vs main `--workspace` with other-worktree cwd

## Run

cwd = worktree

```
spawn-census: {"suite":"test-issue-1052-cursor-cli-startup-prep","spawns":591}
issue-1052 cursor CLI startup/resume prep passed (225 assertions).
```

exit: 0
passed: **225**
failures: **0**

Prior RED on the `exec` fixture: 9 failed / 216 passed (216+9=225). Those 9 are now GREEN against the living-ancestor fixture plus the production ancestor walk already in claim.js. This is **not** a remaining production gap for this oracle. It is also **not** a verdict from invented gate env.

The nine that flipped (names unchanged):

```
#1052-generated[codex-github]-c1-first-claim-cli-prep
#1052-generated[codex-github]-c2-cli-opened-worktree
#1052-generated[codex-github]-c2-main-cli-other-cwd
#1052-generated[gitlab]-c1-first-claim-cli-prep
#1052-generated[gitlab]-c2-cli-opened-worktree
#1052-generated[gitlab]-c2-main-cli-other-cwd
#1052-generated[gitea]-c1-first-claim-cli-prep
#1052-generated[gitea]-c2-cli-opened-worktree
#1052-generated[gitea]-c2-main-cli-other-cwd
```

App `--worker-dir` / unknown (no `--workspace`) first-claim negatives, C3 cold `CLAIM_JS`, C4 README, R1 named flags, collision/readonly remain in the 225.

Unexecuted: live Cursor CLI named dispatch; full producer chains; walkthrough.
