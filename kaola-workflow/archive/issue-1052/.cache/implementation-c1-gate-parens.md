# Implementation — Issue #1052 C1 host-gate parentheses

role: implementer (production only)
worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`
did_not_edit: tests, `kaola-workflow/bundle-1051`, rendered Cursor mirrors
did_not_run: `npm test`, `scripts/simulate-workflow-walkthrough.js`

## task

Fix generated Cursor Next host-gate grouping so bash left-associativity no longer turns a documented `CURSOR_PRODUCT=cli` + `CURSOR_HOST=local` pair (KAOLA twins unset) into the else-arm.

Required meaning: `(A&&B)||(C&&D)` where
- A/B = `CURSOR_PRODUCT=cli` and `CURSOR_HOST=local`
- C/D = `KAOLA_CURSOR_PRODUCT=cli` and `KAOLA_CURSOR_HOST=local`

App-unset still takes else. KAOLA-twins-only still takes then. Four-var `cli-four` path unchanged.

## verification tier

`tests-green`

## files changed

- `scripts/sync-cursor-edition.js` — `cursorCliHostGateOpen()` only. No other emitter of the same `if`. Mirrors not hand-edited; consumers regenerate via `sync-cursor-edition.js --write`.

Before:

```
if [ "${CURSOR_PRODUCT:-}" = cli ] && [ "${CURSOR_HOST:-}" = local ]
  || [ "${KAOLA_CURSOR_PRODUCT:-}" = cli ] && [ "${KAOLA_CURSOR_HOST:-}" = local ]; then
```

bash parse: `((A&&B)||C)&&D` — CURSOR pair only fell through to else.

After:

```
if { [ "${CURSOR_PRODUCT:-}" = cli ] && [ "${CURSOR_HOST:-}" = local ]; }
  || { [ "${KAOLA_CURSOR_PRODUCT:-}" = cli ] && [ "${KAOLA_CURSOR_HOST:-}" = local ]; }; then
```

bash parse: `(A&&B)||(C&&D)`.

## verification commands

cwd = worktree

```
node scripts/test-cursor-edition.js --cli-materialization-oracle
node scripts/test-issue-1052-cursor-cli-startup-prep.js
```

## before

baseline `282238bb` / worktree pre-edit:

- `node scripts/test-cursor-edition.js --cli-materialization-oracle` → exit 0
  `CLI-MATERIALIZATION-ORACLE GREEN: Next CLI identity vs App/Cloud shared-file, --cursor-workspace operator argv, named claim.js flags, locator, and Finalize pre-dispatch ensure`
- `node scripts/test-issue-1052-cursor-cli-startup-prep.js` → exit 1
  `issue-1052 cursor CLI startup/resume prep FAILED: 7 failure(s), 245 passed.`
  spawn-census: `{"suite":"test-issue-1052-cursor-cli-startup-prep","spawns":615}`
  Failures matched RED: CURSOR-pair-only first Resume / concatenate fences (github, gitlab, gitea) plus GitHub `cursor_prep` materialize.

## after

- `node scripts/test-cursor-edition.js --cli-materialization-oracle` → exit 0
  `CLI-MATERIALIZATION-ORACLE GREEN: Next CLI identity vs App/Cloud shared-file, --cursor-workspace operator argv, named claim.js flags, locator, and Finalize pre-dispatch ensure`
- `node scripts/test-issue-1052-cursor-cli-startup-prep.js` → exit 0
  `issue-1052 cursor CLI startup/resume prep passed (252 assertions).`
  spawn-census: `{"suite":"test-issue-1052-cursor-cli-startup-prep","spawns":615}`
