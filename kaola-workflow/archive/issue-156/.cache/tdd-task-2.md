# Task 2 - Add CHANGELOG drift guard

## Agent
tdd-guide (sonnet)

## Modified Files
- `scripts/validate-workflow-contracts.js`

## Change
Inserted after line 281 (closing `}` of forge loop), before `assertIncludes('scripts/simulate-workflow-walkthrough.js'...)`:

```js
assert(
  read('CHANGELOG.md').includes('## [' + rootVersion + ']'),
  'CHANGELOG.md must contain "## [' + rootVersion + ']" heading matching package.json version (' + rootVersion + ')'
);
```

## RED Evidence
N/A — guard is a regression guard; passes immediately on live repo (CHANGELOG.md already contains `## [3.13.0]`).

## GREEN Evidence
`node scripts/validate-workflow-contracts.js` → "Workflow contract validation passed" (exit 0)

## Deviations
None.
