# impl-legacy-root Evidence — Fix 1 Option B

## Summary

Dropped `would_delete_branch` from `cmdLegacyWorktreeCleanup` dry-run output to align with actual execute behavior (never deletes branches).

---

## RED Output

The test `testLegacyWorktreeCleanupDryRun` was already failing before my edits. However, the failure was a crash (JSON parse error), not a clean assertion failure. This was because the repo was in a **partial pre-applied state**:

- **Edit 1 was already applied**: `dryBuckets` declaration at line 1239 in the main file already lacked `would_delete_branch`
- **Edit 2 was NOT yet applied**: line 1253 still called `dryBuckets.would_delete_branch.push(branch)`, pushing to an undefined property, causing a TypeError that produced empty stdout

Failure output before fix:
```
SyntaxError: Unexpected end of JSON input
    at JSON.parse (<anonymous>)
    at testLegacyWorktreeCleanupDryRun (.../simulate-workflow-walkthrough.js:7580:22)
    at main (.../simulate-workflow-walkthrough.js:8000:5)
```

The `would_delete_branch` assertion at lines 7586-7587 of the walkthrough was already present. No insertion was needed.

---

## Edits Applied

### scripts/kaola-workflow-claim.js — Edit 2 only (Edit 1 already applied)

**Context anchor** (LEGACY function, identified by `const buckets = { removed: [], skipped_dirty: [], ...}` without `deleted_branch`):

Deleted this line from the dry-run block inside `cmdLegacyWorktreeCleanup`:
```js
      if (branch && !args.keepBranch) dryBuckets.would_delete_branch.push(branch);
```

The `branch &&` form is the legacy-specific discriminator (the stale forms do NOT have `branch &&`).

### plugins/kaola-workflow/scripts/kaola-workflow-claim.js — Both Edit 1 and Edit 2

The plugin file was in the fully unmodified state. Applied both:

**Edit 1** — changed:
```js
  const dryBuckets = { would_remove: [], would_delete_branch: [], skipped_dirty: [] };
```
to:
```js
  const dryBuckets = { would_remove: [], skipped_dirty: [] };
```

**Edit 2** — deleted:
```js
      if (branch && !args.keepBranch) dryBuckets.would_delete_branch.push(branch);
```

---

## Stale-region Integrity Check

After edits, `grep -n "would_delete_branch"` on both files shows only the stale-region forms (unchanged):
- Line 958: declaration `const dryBuckets = { would_remove: [], would_delete_branch: [], skipped_dirty: [] };`
- Line 972: `if (!args.keepBranch) dryBuckets.would_delete_branch.push(branch);`
- Line 1018: `if (!dryBuckets.would_delete_branch.includes(branch)) dryBuckets.would_delete_branch.push(branch);`

The legacy region is clean (zero occurrences).

---

## GREEN Output

```
testLegacyWorktreeCleanupDryRun: PASSED
testLegacyWorktreeCleanupDirtySkip: PASSED
...
Workflow walkthrough simulation passed
```

---

## cmp Result

```
IDENTICAL
```

`cmp scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js` — no difference.

---

## Surprises

- The repo was in a **partial state**: Edit 1 was already applied to the main file, but not to the plugin. The task instructions assumed a clean start and described inserting the walkthrough assertion — both were already done.
- The RED manifested as a JSON-parse crash (undefined property TypeError before any output) rather than a clean assertion failure message. The assertion at line 7586 was never reached.
- This partial state did not block the fix — only the procedure needed adjusting (skip already-done parts, apply Edit 2 only to main, apply both edits to plugin).
