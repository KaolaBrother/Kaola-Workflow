# Acceptance RED — Issue #1052 comment 5561551896 (identity + spaced locator)

role: tdd-guide (test custody only)
baseline: `ba368eabb3385bfd5e389432603a116b52524298` plus uncommitted ancestor walk
`git rev-parse HEAD`: `ba368eabb3385bfd5e389432603a116b52524298`
worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`
suite: `scripts/test-issue-1052-cursor-cli-startup-prep.js`
command: `node scripts/test-issue-1052-cursor-cli-startup-prep.js` (cwd = worktree)
optional: `node scripts/test-cursor-edition.js --cli-materialization-oracle`
did_not_run: `npm test`, `test:kaola-workflow:claude:full`, `scripts/simulate-workflow-walkthrough.js`
did_not_touch: production `claim.js` (any of the four trees), `kaola-workflow/bundle-1051`, mission-list done rows
did_not_weaken: App `--worker-dir` without `--workspace`, unknown without `--workspace`, first-fence CLI-positive living `…/YYYY.MM.DD-hash/index.js --workspace <opened> --model …` (no exec-replace), collision/readonly/fail-closed, R1, C3 cold `CLAIM_JS`, C4 README presence regex
did_not_invent: `CURSOR_PRODUCT` / `KAOLA_CURSOR_*` / `CURSOR_WORKSPACE` as CLI-positive skip-proof
did_not_substitute: `claim.js --product app` for generated-route C1

comments: 5561551896 (later-wins) / 5560806842 / 5561181849

## Counts

- failures: **11**
- passed: **230**
- spawn-census: `{"suite":"test-issue-1052-cursor-cli-startup-prep","spawns":680}`
- exit: 1
- footer: `issue-1052 cursor CLI startup/resume prep FAILED: 11 failure(s), 230 passed.`

Living-parent CLI-positive / App `--worker-dir` / unknown / C2 worktree vs main / one-claim / C3 remain among the 230. Those **do not** prove generic `--workspace` identity or Darwin spaced-path locators.

## Measured Darwin `ps args=` (non-secret)

Disposable living child: `node <sleeper> --workspace '/tmp/kaola workspace with spaces'`.

```
MEASURED Darwin ps -ww -p PID -o args=: /Users/ylpromax5/.local/node-v24.14.0-darwin-arm64/bin/node /var/folders/j6/8368yp9j35597_g9_f148lz00000gn/T/kw-1052-PR5PyD/ps-sleeper.js --workspace /tmp/kaola workspace with spaces
MEASURED tokenizePsCommandLine+parseDemonstratedCursorParentArgv workspace=: /tmp/kaola
```

Host `ps -ww -p PID -o args=` did **not** insert quotes. Whitespace tokenize of that line returns `/tmp/kaola`.

Same unquoted split on the living CLI-shaped parent used as grandchild ancestor (github example):

```
MEASURED [github] CLI parent ps args=: /Users/ylpromax5/.local/node-v24.14.0-darwin-arm64/bin/node /var/folders/j6/8368yp9j35597_g9_f148lz00000gn/T/kw-1052-PR5PyD/fake-cursor-cli/2026.09.02-c22c1a3/index.js --workspace /private/var/folders/j6/8368yp9j35597_g9_f148lz00000gn/T/kw-1052-PR5PyD/kaola workspace with spaces-github --model cursor-grok-4.6-xhigh
MEASURED [github] naive workspace=: /private/var/folders/j6/8368yp9j35597_g9_f148lz00000gn/T/kw-1052-PR5PyD/kaola
```

## RED (comment 5561551896 — complete resolver, not a parent named fake-cursor-cli)

Subject: generated first fence `startup --runtime cursor --target-issues …` (no invented env) as grandchild of a **living** parent. Production `readProcessCmdlineTokens` → `tokenizePsCommandLine` → `parseDemonstratedCursorParentArgv` → `inspectDemonstratedCursorParent`.

```
RED: #1052-generated[codex-github]-c1-generic-workspace-not-cli
  living parent argv is unrelated-tool plus --workspace <consumer>
  expected unknown/App/Cloud non-writing (no cursor_prep, no project agents)
  got cursor_prep.status=materialized on the consumer

RED: #1052-generated[codex-github]-c1-workspace-and-worker-dir
  living CLI-shaped parent has both --workspace and --worker-dir
  expected must not take the workspace branch first as CLI
  got cursor_prep.status=materialized

RED: #1052-generated[codex-github]-c2-spaced-workspace-full
  expected prep target = full opened dir with spaces
  got acquired with cursor_prep absent (silent skip); naive parse was the truncated prefix
  existing truncated prefix did not receive agents (the skip path, not the prefix-select path)

RED: #1052-generated[gitlab]-c1-generic-workspace-not-cli
  same generic --workspace materialize

RED: #1052-generated[gitlab]-c1-workspace-and-worker-dir
  same both-flags materialize

RED: #1052-generated[gitlab]-c2-spaced-workspace-full
  same silent skip; no full-path cursor_prep.target

RED: #1052-generated[gitea]-c1-generic-workspace-not-cli
  same generic --workspace materialize

RED: #1052-generated[gitea]-c1-workspace-and-worker-dir
  same both-flags materialize

RED: #1052-generated[gitea]-c2-spaced-workspace-full
  same silent skip; no full-path cursor_prep.target
```

## Dirty-tree C4 (uncommitted README vs kept C4 regex)

Not part of 5561551896 identity/locator; C4 pin was not relaxed. Uncommitted README replaced the gated-env / “App/Cloud do not inherit” wording, so HEAD `ba368eab` README would still match C4 and the dirty file does not:

```
FAIL: #1052-c4-readme-prep
FAIL: #1052-c4-readme-app-cloud
```

## Isolated oracle retarget

`scripts/test-cursor-edition.js` no longer treats residual generated `--product cli --host local` as the CLI-positive skip-proof. Default first executable startup must not forge CLI identity; G2 mutant now stamps that first fence instead of requiring the leftover gated stamp.

`node scripts/test-cursor-edition.js --cli-materialization-oracle` → GREEN (first fence is already unstamped). That GREEN does **not** prove the nine resolver cases above and does not lock the defective stamp.

Comment for repair: retire the obsolete second gated startup when repairing normal entry. Residual gated second fence is leftover generated text, not the CLI-positive skip-proof.
