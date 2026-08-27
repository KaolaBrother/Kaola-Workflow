# Path B acceptance-test repair — Issue #1036 / PR #1038

candidate / baseline: `febc1411772d08132316a969d2d0d3bda625cce2`

The repair is confined to `scripts/test-cursor-edition.js`. It parses the
built-in-only `omit-model` relation in the generated `workflow-next` and
`kaola-workflow-finalize` consumers, and its fixture reverses the actual Cursor
`dispatch_carrier` value in `templates/agents/runtime-capabilities.json` in a
throwaway source tree before regenerating those consumers.

## Baseline escape

Using the pre-repair test from candidate `febc1411772d08132316a969d2d0d3bda625cce2`,
the adapter mutation

`omit-model is the parent, not a profile pin` → `omit-model is the profile pin, not the parent`

was regenerated into both consumers and then passed the focused suite:

```text
node scripts/sync-cursor-edition.js --write
node scripts/test-cursor-edition.js
cursor-edition test passed (847 assertions)
baseline mutation suite exit=0
```

This is the recorded baseline escape: the contradictory generated consumers
were accepted on baseline `febc1411772d08132316a969d2d0d3bda625cce2`.

## Repaired mutation RED

The same adapter reversal, generated in an isolated source copy, was checked by
the new generated-consumer oracle:

```text
node scripts/sync-cursor-edition.js --write
node scripts/test-cursor-edition.js --path-b-oracle
PATH-B-ORACLE RED: workflow-next:20: expected omit-model → parent and not → profile pin; got omit-model → "profile pin" and not → "parent"
PATH-B-ORACLE RED: kaola-workflow-finalize:20: expected omit-model → parent and not → profile pin; got omit-model → "profile pin" and not → "parent"
new mutation RED exit=1
```

RED: `PATH-B-ORACLE RED` for both generated consumers — expected parent/not-profile, got profile-pin/not-parent.

baseline: `febc1411772d08132316a969d2d0d3bda625cce2`

## Final unmutated validation

```text
node --check scripts/test-cursor-edition.js
node scripts/sync-cursor-edition.js --write && node scripts/test-cursor-edition.js
cursor-edition test passed (854 assertions)
```

## Changed test files

- `scripts/test-cursor-edition.js`

The concurrent `scripts/test-install-model-rendering.js` changes were preserved
and were not edited by this repair.
