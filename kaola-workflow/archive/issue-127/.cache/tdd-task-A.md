# TDD Task A — GitHub label removal

## Task
Add `workflow:in-progress` label removal inside Step 8 of GitHub sink-merge.

## RED
N/A — no unit test feasible for GitHub ghExec label call (OFFLINE=1 in walkthrough skips Step 8).

## Changes Made
File: `scripts/kaola-workflow-sink-merge.js`
Inside `if (!OFFLINE && args.issue != null)` block (after line 205), added:
```js
    try { ghExec(['issue', 'edit', String(args.issue), '--remove-label', 'workflow:in-progress']); } catch (_) {}
```

## GREEN Evidence
`node scripts/simulate-workflow-walkthrough.js` — all 6 tests pass, exit 0.
