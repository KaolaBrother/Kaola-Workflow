# Planner Output: issue-158

## Root Cause
`testClaimProjectOwnedFolderFailingRemote` builds its subprocess env via
`Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '0', PATH: ... })`
without spreading `ghMockEnv(binDir)`, so `KAOLA_GH_MOCK_SCRIPT` is never set.
`ghExec` falls through to the real `gh` CLI, reads live issue #157 state
(closed), and returns `user_target_closed` instead of `owned`.

## Files to Touch (1 file)
- `scripts/simulate-workflow-walkthrough.js`

## Exact Change
In `testClaimProjectOwnedFolderFailingRemote`, inside the `spawnSync` env
`Object.assign` trailing object, add `...ghMockEnv(binDir),` before the `PATH`
key:

```js
// Before:
env: Object.assign({}, process.env, {
  KAOLA_WORKFLOW_OFFLINE: '0',
  PATH: binDir + path.delimiter + ...
})

// After:
env: Object.assign({}, process.env, {
  KAOLA_WORKFLOW_OFFLINE: '0',
  ...ghMockEnv(binDir),
  PATH: binDir + path.delimiter + ...
})
```

## Acceptance Check
```bash
node scripts/simulate-workflow-walkthrough.js 2>&1 | grep -E "testClaimProjectOwnedFolderFailingRemote: PASSED|Workflow walkthrough simulation passed"
```
Must print both lines. Also: `node scripts/simulate-workflow-walkthrough.js` exits 0.

## Out of Scope
- `writeGhShimFailingIssueView` — correct as-is
- Sibling tests that already pass
- `scripts/kaola-workflow-claim.js` — production code is correct
- No conversion of `Object.assign` form to spread elsewhere
- No docs/CHANGELOG changes needed (internal test fix)
