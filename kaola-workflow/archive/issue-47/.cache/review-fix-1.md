# Review Fix 1: HIGH — Add --target-issue validation in cmdBootstrap

## Finding
Missing positive-integer validation for `--target-issue` in `cmdBootstrap` (contract divergence from `cmdStartup`).

## Fix Applied
Added at L1227 in `scripts/kaola-workflow-claim.js` (immediately after `assertSafeSession`):
```javascript
assert(!args.targetIssue || (Number.isFinite(args.targetIssue) && args.targetIssue > 0), '--target-issue must be a positive integer');
```

Identical to pattern in `cmdStartup` (L1333) and `cmdPickNext` (L2407).

## Validation
- `node scripts/validate-script-sync.js` → `OK: 7 common scripts in sync.`
- `node scripts/simulate-workflow-walkthrough.js` → `Workflow walkthrough simulation passed`
