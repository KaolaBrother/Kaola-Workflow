# tdd-guide — R1 isolated-drive pins (G10-cli)

role: tdd-guide
tests only: `scripts/test-cursor-edition.js` in worktree
`.kw/worktrees/issue-1016`. Production not written.
`scripts/kaola-workflow-ensure-cursor-catalog.js` not touched.

baseline SHA (worktree HEAD): `f3642cb0b4fdffdd6b9d248d709bb734aef7b566`

## Pins added

File: `.kw/worktrees/issue-1016/scripts/test-cursor-edition.js`

After G10-cli isolated `require()` `typeof ensureCursorCatalog === 'function'`:

1. Isolated `listCanonAgents()` (exported) roster length and names match tracked `canonAgents` (14).
2. Isolated `ensureCursorCatalog` on dest empty-of-canon, `$cursorHome/agents` has all `canonAgents` plus stray `user-agent.md` → status `copied`; dest has every `canonAgents` name; dest does not receive `user-agent.md`.
3. Isolated lone dest `implementer.md` matching global, global has all `canonAgents` → status `copied` (not `already-present`); dest then has all `canonAgents` names.

G10-hook: kept dest `implementer.md` assert; after driving the hook, dest also has every `canonAgents` name.

## Current tree (fixed) — suite GREEN

Command: `node scripts/test-cursor-edition.js` from worktree.

```
exit: 0
cursor-edition test passed (778 assertions).
```

The new isolated-drive pins pass against the inlined 14-name roster (no sibling-prefer).

## Mutation that proves they bite (`/tmp` only)

Copy: `/tmp/kw-1016-r1-tdd-iso/kaola-workflow-ensure-cursor-catalog.js`
No `sync-cursor-edition.js` beside it.
Mutation: `CANON_AGENT_NAMES = Object.freeze(['implementer'])`.
Worktree ensure JS left unmutated (`CANON_AGENT_NAMES` still the 14-name freeze; `listCanonAgents()` returns `CANON_AGENT_NAMES.slice()`).

Replay of the new isolated-drive asserts on that copy:

```
typeof ensureCursorCatalog: function   (old G10-cli typeof pin would stay green)
mutated listCanonAgents(): ["implementer"]
canonAgents.length: 14
FAIL_COUNT: 18
```

Failure signature (lone-implementer / dest stays 1 file — the R1 class):

```
RED: G10-cli[isolated-drive]: isolated listCanonAgents() roster length equals canonAgents (14)
     — got ["implementer"]
RED: G10-cli[isolated-drive]: lone matching dest implementer.md → copied, not already-present
     — got {"status":"already-present"} destFiles=1
RED: G10-cli[isolated-drive]: dest after isolated lone-implementer copy has all canonAgents
     — got ["implementer"]
```

baseline: `f3642cb0b4fdffdd6b9d248d709bb734aef7b566`

Shrinking the isolated roster still keeps `typeof === 'function'`. The new drive asserts fail: dest empty-of-canon copies only `implementer.md`; lone matching dest `implementer.md` is `already-present` and dest stays one file.
