# Code Review: issue-47 — Remove runBootstrapClaimFirstAvailable

## Files Reviewed
- `scripts/kaola-workflow-claim.js`
- `scripts/simulate-workflow-walkthrough.js`
- `scripts/validate-workflow-contracts.js`
- `scripts/validate-kaola-workflow-contracts.js`

## Findings

### [HIGH] Missing --target-issue positive-integer validation in cmdBootstrap

`cmdStartup` validates at L1333-1334:
```js
assert(!args.targetIssue || (Number.isFinite(args.targetIssue) && args.targetIssue > 0),
  '--target-issue must be a positive integer');
```
`cmdBootstrap` has no such guard. `parseArgs` uses `parseInt(argv[++i], 10)`, so `--target-issue -5` produces `-5`, which is truthy, bypasses the no-target guard (`if (!args.targetIssue)`), and passes `-5` into `claimExplicitTarget`. This is a contract divergence from the issue-44 pattern this change claims to mirror.

**Fix**: Add after `assertSafeSession` call in `cmdBootstrap`:
```js
assert(!args.targetIssue || (Number.isFinite(args.targetIssue) && args.targetIssue > 0),
  '--target-issue must be a positive integer');
```

### [MEDIUM] cmdBootstrap is 56 lines (guideline: <50)

Minor overage. Does not block. Defer to follow-up.

### [LOW] 8I-c: unguarded JSON.parse on stdout

`JSON.parse(r8ic.stdout.trim())` at line 2136 throws `SyntaxError` if stdout is empty. Not a correctness issue in current code since no-target guard always writes JSON. Improve diagnostics in follow-up.

## Confirmed Correct
- `runBootstrapClaimFirstAvailable` fully deleted (zero grep results)
- `process.exitCode = 1` used (not throw) for no-target and failed-claim paths
- Owned-path JSON includes `claim: 'owned'`
- `claimExplicitTarget` called with correct argument order
- `result.status !== 'acquired'` is correct failure check
- `result.verdict` (not `result.status`) used in success-path JSON
- sweep/watch-pr calls before ownedActiveProject check
- 8I-c uses fresh temp dir with cleanup in finally
- 13A spawns both processes before Promise.all (true concurrency)
- 13B uses explicit --target-issue 911/912
- Validator assertion strings verified in both claim scripts
- simulate-workflow-walkthrough.js exits 0

## Summary
| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 1 |
| MEDIUM | 1 |
| LOW | 1 |

Verdict: WARNING — HIGH must be fixed before merge.
