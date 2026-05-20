# Advisor Ideation Gate — issue-121

## Verdict: APPROVED

Approach A endorsed. Field-name resolution (`head_commit_id`) confirmed correct.

## Key Execution Note

The existing line-122 test will pass with either the old or new stub key because runner returns `''` for unmatched keys → `parseJson` returns `{}` → no error. Stub-key matching is a weak oracle for body shape. New tests MUST assert against captured `calls` array, e.g.:

```js
const lastCall = calls[calls.length - 1];
assert.strictEqual(lastCall[1][lastCall[1].length - 1], '{"Do":"squash","delete_branch_after_merge":false,"head_commit_id":"abc123"}');
```

## JSON Key Order Warning

Build order is `Do`, `delete_branch_after_merge`, then conditional `head_commit_id` — V8 preserves insertion order. Assertions compare serialized JSON strings. Do not reorder body construction.

## Out of Scope Confirmed

- `merge_when_checks_succeed` — not adding
- Auto-merge body fields — just fixing the server-version guard
- `merge_message_field` / `merge_title_field` — leaving untouched

## Summary

The fix is two production lines + test updates. Proceed to implementation.
