# Kernel ledger — issue-1016 PART F `copyFileSync`

## Ledger object added

In `scripts/test-kernel-conformance.js` `NON_ATOMIC_EXEMPT`, after the `kaola-workflow-sink-merge.js` `copyFileSync` row:

```js
{
  file: 'kaola-workflow-ensure-cursor-catalog.js',
  api: 'copyFileSync',
  klass: 'mirror-copy',
  why: 'copies the 14 canonical agent files into <cwd>/.cursor/agents, a consumer workspace catalog rather than a kernel record; a torn dest is re-derived by re-running the idempotent copy',
}
```

`klass` is the existing `EXEMPT_CLASSES` value `mirror-copy`. No new class.

## RED (baseline, no ledger row)

- command: `node scripts/test-kernel-conformance.js`
- cwd: worktree `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1016`
- **baseline SHA:** `67e86616d4e08415301b3a82885c790dbfd33469`
- exit: 1 (PART F, before vehicles)
- **failure signature:** `partF` — `AssertionError: every non-atomic write API in a production script is accounted for in the exempt ledger with a stated reason — an unledgered one is a writer nobody has ruled on`
- actual: `[ 'kaola-workflow-ensure-cursor-catalog.js copyFileSync' ]`
- expected: `[]`

```
RED: partF unledgered copyFileSync — AssertionError: every non-atomic write API in a production script is accounted for in the exempt ledger with a stated reason
actual: ['kaola-workflow-ensure-cursor-catalog.js copyFileSync']
expected: []
baseline: 67e86616d4e08415301b3a82885c790dbfd33469
```

## GREEN (after the row)

- command: `node scripts/test-kernel-conformance.js`
- cwd: same worktree
- exit: 0
- stdout: `kernel conformance tests passed (252 assertions)`
- elapsed: ~213s

```
GREEN: node scripts/test-kernel-conformance.js
exit: 0
assertions: 252
```
