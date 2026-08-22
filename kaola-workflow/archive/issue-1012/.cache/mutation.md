# Issue #1012 — declaration mutation proof

The mutation was performed in this isolated temporary copy; the shared issue worktree was never
edited by the mutation:

```text
/var/folders/j6/8368yp9j35597_g9_f148lz00000gn/T/kaola-grok-mutation.XXXXXX.RavAlrtUi3
```

Copy command:

```text
rsync -a --exclude='.git' --exclude='.kw' ./ "/var/folders/j6/8368yp9j35597_g9_f148lz00000gn/T/kaola-grok-mutation.XXXXXX.RavAlrtUi3/"
```

Mutation: in the temporary copy only, deleted the `tiered_effort_pin` property and its string from
`GROK_RUNTIME_NATIVE`, leaving `Object.freeze({})`.

Mutated command (working directory set to the temporary copy):

```text
node scripts/test-grok-edition.js
```

Exit code: `1`

Intended assertion evidence:

```text
FAIL: G2-declaration: GROK_RUNTIME_NATIVE must declare "tiered_effort_pin" with a one-line reason
FAIL: G2-declaration: the "tiered_effort_pin" reason must state standard/reasoning medium/high effort pins
grok-edition test FAILED: 2 failure(s), 541 passed.
```

The unmutated shared worktree was then run with the exact command `node scripts/test-grok-edition.js`;
it exited `0` and reported `grok-edition test passed (543 assertions).`

Cleanup used a path guard plus `find` deletion for the exact temporary directory. Result:
`cleanup verified: absent`. The shared worktree status after cleanup still contains only the other
agents' issue changes plus the test artifact; no mutation copy or temporary path remains.
