# Implementation — Issue #1056: `defaultBranch` env contract

Worktree `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-1056`,
branch `workflow/bundle-1056`, baseline `e72407b8`. Nothing committed.

## Contract sentence (placed in the comment above `defaultBranch` in
`scripts/kaola-workflow-adaptive-schema.js`)

> #1056: OFFLINE/REMOTE_TIMEOUT_MS are read per call via offlineNow()/remoteTimeoutMsNow(), not
> captured at module load — see the comment above those functions.

And above `offlineNow()`/`remoteTimeoutMsNow()`:

> #1056: offlineNow()/remoteTimeoutMsNow() replace the #1055 module-level OFFLINE/REMOTE_TIMEOUT_MS
> constants — those captured process.env at module *load* time, so a caller who set the env after
> this module (or claim.js) had already loaded saw the pre-set value forever. Reading process.env
> inside defaultBranch, at each call, is the only contract that does not depend on load order.

## A. `scripts/kaola-workflow-adaptive-schema.js` (~lines 831-867)

- Deleted the module-level `const OFFLINE = ...` and `const REMOTE_TIMEOUT_MS = (() => {...})();`
  (grepped: their only consumers in this file were inside `defaultBranch`, so nothing else in
  adaptive-schema.js still needed the stale capture — both were removed, not kept alongside).
- Added two small pure functions next to where the constants were: `function offlineNow()` (reads
  `process.env.KAOLA_WORKFLOW_OFFLINE === '1'`) and `function remoteTimeoutMsNow()` (same parse +
  clamp rule as before: `parseInt(... || '30000', 10)`, `Number.isInteger(n) && n > 0 ? Math.min(n,
  600000) : 30000`).
- `defaultBranch(root)` now calls `offlineNow()` at the offline short-circuit and
  `remoteTimeoutMsNow()` at both `timeout:` option sites (stage 2 `remote show origin`, stage 3
  `ls-remote --symref`), evaluated at call time instead of read from closed-over constants.
- Unchanged: probe order (symbolic-ref → remote show → ls-remote → `'main'`), every swallowed-error
  fallback, the `timeout:` option's placement inside each `execFileSync` options object, and every
  other function in the file.
- Net: 23 lines changed (14 insertions after removing the 8-line constants block, net +... see
  `git diff --stat`: 23 lines touched, file grew by roughly one function-signature's worth of
  comment/wrapper lines around the same logic).

## B. gitlab/gitea claim hand-ports

`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` (was line 349) and
`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` (was line 350):

- Deleted the local ~19-line `function defaultBranch(root) { ... }` body (each port's private copy
  of the same probe chain, hard-coded 30000ms timeouts, using the port's own load-time-captured
  `OFFLINE`).
- Replaced with a single line at the same site: `const defaultBranch = adaptiveSchema.defaultBranch;`
  preceded by a one-line `#1056` comment mirroring canonical's.
- `module.exports` in both ports already referenced the bare `defaultBranch` identifier
  (`kaola-gitlab-workflow-claim.js:6549`, `kaola-gitea-workflow-claim.js:6542`) — unchanged, and
  still resolves to a function after the swap (`typeof === 'function'` verified below).
- Grepped both ports' `OFFLINE` constant (`kaola-*-workflow-claim.js:32`): each has ~20+ other
  consumers throughout the file (claim/finalize/sink/watch logic), so the constant was left in
  place — only the `defaultBranch`-local usage of it was removed by deleting the whole local
  function.
- Nothing else in either port was touched: the port sinks
  (`kaola-gitlab-workflow-sink-merge.js`, `-sink-mr.js`, `kaola-gitea-workflow-sink-merge.js`,
  `-sink-pr.js`) were not opened and still import from their own port, unchanged.
- Net per port file: 22-23 lines changed (19-line function body deleted, 1-line delegation +
  1-line comment added — a net subtraction of ~17 lines each).

## C. Regeneration

- `npm run sync:editions` → `edition-sync: write complete (3 file(s) updated)`, exit 0. Updated the
  three byte-identical mirrors: `plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js`,
  `plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js`,
  `plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js`.
- `node scripts/validate-script-sync.js` → `OK: 14 common scripts, 25 byte-identical groups, 0
  rename-normalized families, 2 hooks.json families (config + hooks dir), and 5 forge
  export-superset families in sync. committed kernel parity: 4 Oracle Kernel copies identical at
  HEAD.` Exit 0.
- `git status --short` after regeneration showed exactly: `scripts/kaola-workflow-adaptive-schema.js`,
  the two hand-port claim files, the three plugin adaptive-schema mirrors, plus the pre-existing
  dirt named in the brief (`CHANGELOG.md`, `docs/api.md`, `package.json`,
  `kaola-workflow/archive/bundle-1055/*`, `scripts/test-issue-1056-*`, `kaola-workflow/bundle-1056/`)
  — matches scope exactly, verified below.

## D. Verification — every command run, exit code echoed directly (never after a pipe)

| Command | Result | Exit |
|---|---|---|
| `node scripts/test-issue-1056-default-branch-env-contract.js` | `31 passed, 0 failed` | 0 |
| `node scripts/test-claim-hardening.js` | `claim-hardening tests passed (838 assertions)` | 0 |
| `node scripts/test-sink-merge.js` | `Sink-merge ... test suite passed: 1063 assertions.` | 0 |
| `node scripts/test-forge-claim-rollback-scoping.js` | `32 passed, 0 failed` | 0 |
| `node scripts/test-forge-archive-scoping.js` | `180 passed, 0 failed` | 0 |
| `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` | `GitLab sink tests passed` | 0 |
| `node plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` | `Gitea sink tests passed` | 0 |
| `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | `GitLab workflow script tests passed` | 0 |
| `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | `Gitea workflow script tests passed` | 0 |
| `node scripts/test-issue-1055-render-subtraction-oracle.js` | `passed (5 assertions, 300 render comparisons hashed ...)` | 0 |
| `node scripts/validate-workflow-contracts.js` | `Workflow contract validation passed` | 0 |
| `node scripts/test-spawn-classification.js` | `passed (10 mutation assertions; 725 spawn sites ...)` | 0 |

Some gitlab/gitea suite output lines showed expected `gh`/`glab`/network-timeout noise from
unrelated fixtures probing real forge auth (`error connecting to api.github.com`, `Could not
determine base repository`) — these are pre-existing fixture behaviour unrelated to this change;
every suite still reported its final `passed` line and exit 0.

### Identity proofs (`node -e`)

```
kernel identity: true   // require('./scripts/kaola-workflow-claim.js').defaultBranch ===
                         // require('./scripts/kaola-workflow-adaptive-schema.js').defaultBranch
gitlab identity: true   // gitlab claim's defaultBranch === gitlab's local adaptive-schema's defaultBranch
gitea identity:  true   // gitea claim's defaultBranch === gitea's local adaptive-schema's defaultBranch
```
Exit 0.

## What was not done

- `npm test` was not run (per instructions).
- No other function in `kaola-workflow-adaptive-schema.js`, `kaola-workflow-claim.js`, or either
  port's claim.js was touched — grep confirmed `OFFLINE`/`REMOTE_TIMEOUT_MS` in canonical claim.js
  and the ports' `OFFLINE` are still used elsewhere and were left in place.
- Port sink scripts (`*-sink-merge.js`, `*-sink-mr.js`, `*-sink-pr.js`) were not opened; they were
  out of scope and their own suites (D above) confirm they still pass.
