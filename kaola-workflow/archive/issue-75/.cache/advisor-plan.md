# Advisor Plan Gate Output — issue-75

## Response Summary

The architect's blueprint is sound. Five notes:

### 1. Gap 2 doc: SINK_KIND must be read from main-repo path (CRITICAL)
`workflow-state.md` lives in `kaola-workflow/{project}/` in the main repo worktree, not in `$ACTIVE_WORKTREE_PATH`. The SINK_KIND capture must happen BEFORE the `(cd "$ACTIVE_WORKTREE_PATH" && ...)` subshell:

```bash
# Read from main repo — NOT from inside the worktree cd block
SINK_KIND=$(awk '/^## Sink/,0' "kaola-workflow/$KAOLA_PROJECT/workflow-state.md" | grep '^sink:' | awk '{print $2}')
SINK_KIND=${SINK_KIND:-merge}
```

Place this capture at the top of the Step 8b block, before any `cd` commands. Task 8 in the architect's plan must reflect this constraint.

### 2. Verify cmdStatus consumers
The plan asserts that the new `{ active, drift, count }` schema is a safe additive change. Before Task 6, grep for callers that parse cmdStatus JSON fields programmatically. Shell-doc callers (human instructions) are safe. Any code that does `status.active` or `status.count` needs verification it won't break on the new `drift` field.

Result (from grep): Only doc references found in `workflow-next.md:54` and `kaola-workflow-next/SKILL.md:34` — human-readable instructions, not programmatic parsers. Safe to add `drift` field.

### 3. Test B needs a positive case
Test B as specified only tests the guard path (archived project → `updated: false`). Add a positive case: seed an *active* folder (the directory must exist), call sink-fallback, assert `updated: true`. Without the positive case, Test B could pass with a broken implementation that always returns early.

### 4. Document merge→PR pivot trade-off
After the fix, the merge→PR pivot path (sink-merge exits 3, then sink-fallback fires) results in:
- `cmdSinkFallback` sees no active folder → returns `updated: false` instead of pivoting to PR sink
- The PR on GitHub remains open but no local folder tracks it

This is acceptable per the AC (which requires only that archived folders are not recreated). Document this trade-off explicitly in `phase3-plan.md` under a "Known Trade-offs" section.

### 5. Make mirror diff check explicit in Task 7
Task 7 says "apply identical edits" but must include the exact validation command:

```bash
diff scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js
```

Exit code must be 0. If non-zero, the mirror is diverged and must be fixed before continuing.
