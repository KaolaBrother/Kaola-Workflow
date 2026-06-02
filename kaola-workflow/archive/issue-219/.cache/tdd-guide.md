## Changes Made

### What was added

A `REMOTE_TIMEOUT_MS` constant was added to 4 files, with its value read from `KAOLA_GH_REMOTE_TIMEOUT_MS` env var (default 30 seconds, capped at 600 seconds). The constant was then threaded into each file's `ghExec` function so that every `execFileSync` call to `gh` is bounded by that timeout.

### Files modified

**`scripts/kaola-workflow-sink-merge.js`**
- Added `REMOTE_TIMEOUT_MS` IIFE constant after the existing `FORCE_*` constants.
- Updated both branches of `ghExec(args, opts)` — mock branch and real `gh` branch — to include `timeout: REMOTE_TIMEOUT_MS` in the `Object.assign` defaults.

**`scripts/kaola-workflow-sink-pr.js`**
- Added `REMOTE_TIMEOUT_MS` IIFE constant after `CONFIG_PATH`.
- Updated the single-branch `ghExec(args)` to pass `{ encoding: 'utf8', timeout: REMOTE_TIMEOUT_MS }`. Signature left as `(args)` — no mock branch added.

**`plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`**
**`plugins/kaola-workflow/scripts/kaola-workflow-sink-pr.js`**
- Identical edits applied to the plugin copies. Both pairs confirmed byte-identical to their root siblings.

### Test output

`npm test` exited 0. All four test suites passed:
- `test:kaola-workflow:claude` — 61 walkthrough tests + sync/contract validators: PASSED
- `test:kaola-workflow:codex` — sync + contract + codex walkthrough: PASSED
- `test:kaola-workflow:gitlab` — contract + both gitlab walkthroughs: PASSED
- `test:kaola-workflow:gitea` — contract + both gitea walkthroughs: PASSED
