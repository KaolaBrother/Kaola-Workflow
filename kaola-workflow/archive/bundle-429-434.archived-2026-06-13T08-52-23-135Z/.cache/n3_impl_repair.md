evidence-binding: n3_impl_repair afd4bf8a4acf

## Summary

TDD implementation of three new `adaptive-node` subcommands for Issue #434 (sanctioned repair primitives). All fixtures RED before implementation, GREEN after. All four chains passed.

## RED

Three fixtures were added to `scripts/test-adaptive-node.js` before any implementation. Running `node scripts/test-adaptive-node.js` immediately threw:

```
RED: #434-a — TypeError: runRevertOverflow is not a function (pre-impl, test-adaptive-node.js:5163)
```

The test crashed at the destructuring import because `runRevertOverflow` and `runRepairNode` were not yet exported. This failure signature proves fixtures (a), (b), and (c) all failed before implementation.

RED: test_#434_fixtures_all — TypeError: runRevertOverflow is not a function (pre-impl, scripts/test-adaptive-node.js:5163, all three fixtures blocked by missing export)

## GREEN

After implementing `runRevertOverflow`, `runRepairNode`, and the `requires_redispatch` field in `runOrient`, and exporting all new functions:

GREEN: #434-a/#434-b/#434-c all pass; 641/641 adaptive-node assertions green (up from 623)

Specific fixture results:
- `#434-a` (revert-overflow): `revert-overflow returns ok`, `outOfAllow path scripts/b.js reverted`, `barrierClearedAfterRevert true` — all assertions pass.
- `#434-b` (repair-node): `repair-node returns ok`, `baselineReused === true`, `impl reopened to in_progress`, `review gate reset to pending`, `barrier-base-impl NOT removed`, `commit-node NOT shelled` — all assertions pass. Refuse on complete (no active reviewer) also passes.
- `#434-c` (requires_redispatch): `orient emits requires_redispatch=true when evidence absent`, `orient does NOT set requires_redispatch when evidence present` — both assertions pass.

## Implementation Details

### `runRevertOverflow` (new subcommand)
- Shells `commit-node --barrier-check --json` to read `outOfAllow` paths
- Calls injectable `gitCheckout(barrierRoot, baseSha, filePaths)` seam (falls back to real `execFileSync git checkout`)
- Appends provenance log entry for the revert
- Re-runs barrier check to confirm cleared
- Returns `{ result: 'ok', revertedPaths, barrierClearedAfterRevert }`

### `runRepairNode` (new subcommand)
- Requires writer to be `complete` AND at least one downstream gate-role node to be `in_progress` (safe-point check)
- Does NOT call `commitNodePath` (commit-node is never shelled)
- Does NOT delete `barrier-base-{nodeId}` (the original baseline is KEPT — anti-laundering invariant)
- Deletes only downstream gate baselines (`barrier-base-{gateId}`)
- Returns `{ result: 'ok', baselineReused: true, deletedDownstreamBaselines: [...] }`

### `requires_redispatch` in `runOrient`
- Added after the `enterBatch` computation, before the final `return`
- Checks: `inProgressNode` is set AND evidence file either absent OR does not contain `evidence-binding`
- Added as additive field using spread: `...(requires_redispatch ? { requires_redispatch: true } : {})`

### Anti-laundering invariant confirmed
`repair-node` test fixture explicitly asserts `!shelled.includes('kaola-workflow-commit-node.js')` — commit-node is never shelled, so no re-snapshot occurs. The original `barrier-base-impl` is preserved unchanged.

The existing `reopen-node` subcommand is untouched — it still calls `shell(commitNodePath, [..., '--start', '--json'])` to record a fresh baseline (the key distinction: reopen = fresh baseline; repair = reuse original baseline).

## Edition Sync

```
edition-sync: write complete (3 file(s) updated).
edition-sync: 12 forge aggregator ports in rename-normalized parity with canonical.
```

Three edition ports regenerated from canonical:
- `plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js` (codex byte-copy)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js`

## Four-Chain Results

- claude: PASSED (validate-script-sync, validate-workflow-contracts, test-adaptive-node (641 assertions), simulate-workflow-walkthrough, full npm run test:kaola-workflow:claude exit 0)
- codex: PASSED (validate-script-sync, validate-kaola-workflow-contracts, simulate-kaola-workflow-walkthrough exit 0)
- gitlab: PASSED (edition-sync --check, validate-kaola-workflow-gitlab-contracts, simulate-gitlab-workflow-walkthrough, simulate-gitlab-codex-workflow-walkthrough exit 0)
- gitea: PASSED (edition-sync --check, validate-kaola-workflow-gitea-contracts, simulate-gitea-workflow-walkthrough, simulate-gitea-codex-workflow-walkthrough exit 0)

## baselineReused: true anti-laundering invariant

Confirmed passing in `#434-b` fixture: `repair-node` asserts `result.baselineReused === true` AND `!shelled.includes('kaola-workflow-commit-node.js')` AND `!removedBaselines.includes('barrier-base-impl')`. All three pass. The original barrier-base is reused, not re-snapshotted.
