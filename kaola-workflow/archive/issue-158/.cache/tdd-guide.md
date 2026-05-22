# TDD-Guide Output: issue-158

## Change Applied
File: `scripts/simulate-workflow-walkthrough.js`
Function: `testClaimProjectOwnedFolderFailingRemote`

Added `...ghMockEnv(binDir),` immediately before the `PATH` key inside the
`Object.assign` trailing object of the `spawnSync` env construction.

Before:
```js
env: Object.assign({}, process.env, {
  KAOLA_WORKFLOW_OFFLINE: '0',
  PATH: binDir + path.delimiter + ...
})
```

After:
```js
env: Object.assign({}, process.env, {
  KAOLA_WORKFLOW_OFFLINE: '0',
  ...ghMockEnv(binDir),
  PATH: binDir + path.delimiter + ...
})
```

## Test Output
```
testClaimProjectOwnedFolderFailingRemote: PASSED
Workflow walkthrough simulation passed
```

Exit code: 0. Full suite passes. No other files modified.
