evidence-binding: n_pins 0e0e0c8e1ce3

non_tdd_reason: mechanical contract-pin — the pin IS the test; no natural failing unit test

## Task

Pin new tokens from n2_impl_sink (`--sink` mode in kaola-workflow-sink-merge.js) and
n3_impl_repair (`revert-overflow`, `repair-node`, `requires_redispatch`, `baselineReused` in
kaola-workflow-adaptive-node.js) into both editions of validate-workflow-contracts.js, then
make the plugin copy byte-identical to the root copy.

## Files changed

- `scripts/validate-workflow-contracts.js`
- `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` (byte-identical copy)

## Pins added

### Adaptive-node pins (#434) — inserted after the existing `clear-halt` block

```
// #434: revert-overflow + repair-node subcommands + their output tokens (anti-laundering signal +
// orient requires_redispatch field for absent-evidence detection).
assertIncludes('scripts/kaola-workflow-adaptive-node.js', "subcommand === 'revert-overflow'");
assertIncludes('scripts/kaola-workflow-adaptive-node.js', "subcommand === 'repair-node'");
assertIncludes('scripts/kaola-workflow-adaptive-node.js', 'requires_redispatch');
assertIncludes('scripts/kaola-workflow-adaptive-node.js', 'baselineReused');
```

### Sink-merge pins (#429) — inserted after the existing `#369` bundle-closure block

```
// #429: resumable --sink transaction — step-receipt based pipeline, structured sink_blocked refusal.
assertIncludes('scripts/kaola-workflow-sink-merge.js', 'isSinkMode');
assertIncludes('scripts/kaola-workflow-sink-merge.js', 'sink-receipt.json');
assertIncludes('scripts/kaola-workflow-sink-merge.js', 'sink_blocked');
```

## Token verification (confirmed in source files before pinning)

- `isSinkMode` — line 1069 of kaola-workflow-sink-merge.js: `const isSinkMode = rawArgv.includes('--sink');`
- `sink-receipt.json` — lines 625/628/636/638/639/1016 of kaola-workflow-sink-merge.js
- `sink_blocked` — lines 687/773/843 of kaola-workflow-sink-merge.js
- `subcommand === 'revert-overflow'` — line 3919 of kaola-workflow-adaptive-node.js
- `subcommand === 'repair-node'` — line 3927 of kaola-workflow-adaptive-node.js
- `requires_redispatch` — lines 1161/1165/1170/1175/1198 of kaola-workflow-adaptive-node.js
- `baselineReused` — lines 1448/2351/2360/2528/2536 of kaola-workflow-adaptive-node.js

## Verification commands

Before: `node scripts/validate-workflow-contracts.js` — passed (baseline unmodified validator)
After adding pins + syncing plugin:

```
node scripts/validate-script-sync.js
# OK: 21 common scripts, 30 byte-identical groups... in sync.

node scripts/validate-workflow-contracts.js
# Workflow contract validation passed

npm run test:kaola-workflow:claude
# exit code 0
```

regression-green: npm run test:kaola-workflow:claude passed (exit code 0)
