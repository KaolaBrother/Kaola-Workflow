# next-action-core evidence — issue #281 (AC#1 / AC#5)

Node: `next-action-core`. Change: PURELY ADDITIVE two pure-subset fields
(`readyPending`, `active`) on `computeNextAction`'s ok-return. Legacy fields
(`readySet`, `nextNode`, `allDone`) and the stall/deadlock-refusal predicate are
BYTE-UNCHANGED.

## Write set (exactly 3 files)
1. `scripts/kaola-workflow-next-action.js`
2. `plugins/kaola-workflow/scripts/kaola-workflow-next-action.js` (byte-identical copy)
3. `scripts/test-next-action.js`

## RED (failing test first — field undefined)
Added test8 (AC#1: two sibling pending → both in readyPending, active empty),
test9 (AC#5: one in_progress → excluded from readyPending, included in active;
legacy readySet/nextNode/allDone byte-unchanged; fully-in_progress frontier is
ok, NOT a deadlock; active.length>1 signal), test10 (readyPending ⊆ readySet,
proper subset when a ready node is in_progress). THEN ran the suite:

```
FAIL: test8: readyPending is an array
/Users/ylpromax5/.../scripts/test-next-action.js:258
  assert(r.readyPending.length === 2, 'test8: readyPending has both siblings');
                        ^
TypeError: Cannot read properties of undefined (reading 'length')
    at Object.<anonymous> (.../scripts/test-next-action.js:258:25)
Node.js v24.14.0
EXIT=1
```

RED confirmed: `r.readyPending` is `undefined` before the implementation; exit 1.

## GREEN (after additive implementation)
Implemented `readyPending`/`active` AFTER the stall guard, right before the
return; appended both keys to the ok-return object. Re-ran the suite:

```
next-action tests passed (65 assertions)
EXIT=0
```

GREEN confirmed: 33 original back-compat assertions + 32 new = 65, exit 0. Every
pre-existing assertion passes UNCHANGED (back-compat proof).

## Byte-identical plugin copy — diff EMPTY
```
cp scripts/... plugins/kaola-workflow/scripts/...
diff scripts/kaola-workflow-next-action.js plugins/kaola-workflow/scripts/kaola-workflow-next-action.js
→ PLUGIN_DIFF_EMPTY_OK   (no output from diff; exit 0)
```

## Legacy fields BYTE-UNCHANGED (git diff is purely additive)
`git diff scripts/kaola-workflow-next-action.js` shows ONLY insertions
(`+` lines): an 8-line comment, `const readyPending = readySet.filter(...)`,
the `const active = nodes.filter(...).map(...)` block, and `readyPending,` +
`active,` appended to the return object. The readySet build (filter/map),
`allDone`, and the stall predicate (`if (readySet.length === 0 && !allDone)
return refuse`) do NOT appear in the diff — they are untouched. No `-` lines
on any legacy field. Confirmed: readySet/nextNode/allDone/stall-predicate are
byte-unchanged.

## Regression (executor consumes next-action — must stay green)
```
node scripts/simulate-workflow-walkthrough.js  → WALKTHROUGH_EXIT=0  ("Workflow walkthrough simulation passed")
node scripts/test-adaptive-node.js             → ADAPTIVE_NODE_EXIT=0 ("adaptive-node tests passed (104 assertions)")
node scripts/test-next-action.js               → NEXT_ACTION_EXIT=0   (65 assertions)
```

## Summary (3-5 lines)
`readyPending` = readySet members whose OWN ledger status is `pending` (the
openable batch frontier the scheduler may fan out). `active` = every node whose
own status is `in_progress` (mapped to the same descriptor shape as the other
fields via the file's real accessors: `node.role`, `node.dependsOn`,
`resolveModel(node.role)`, `node.writeSetRaw`, `node.shape.kind`).
`active.length > 1` is the AC#5 multi-in_progress signal. Because `readySet`
still includes `in_progress` nodes (only TERMINAL nodes are excluded),
`nextNode = readySet[0]` keeps working and a fully-in_progress frontier does NOT
trip the deadlock refusal — verified by test9's "both in_progress" sub-case
returning `result:'ok'`. Verified `in_progress` ∈ `LEDGER_STATUSES`
(`["pending","in_progress","complete","n/a"]`) so the AC#5 fixture is `ok`, not
a refuse. Scope held to §1/§D1 + the 3 declared files only.

## Doc-comment freshness (CLAUDE.md inline-comment checklist)
Updated the JSON-output-schema header comment in next-action.js to document the
two new ok-return keys (`readyPending`, `active`). Additive doc-only edit (no
code touched); plugin copy re-synced byte-identical (PLUGIN_DIFF_EMPTY_OK);
test-next-action (65) + test-adaptive-node (104) still exit 0 after the edit.
