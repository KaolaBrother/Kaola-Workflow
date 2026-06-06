# impl-commit-node evidence — issue #263 Classify-And-Act selective execution

## RED evidence

Before the changes, `selectorCheck` was completely absent from all four commit-node editions.
Confirmed via grep returning no output:

```
grep -n 'selectorCheck' scripts/kaola-workflow-commit-node.js
# (no output — field absent)
```

The `combineResults` function destructured only `{ recordBase, barrierCheck, gateVerify, verdictCheck }` and
the return object had no `selectorCheck` field. The `per-node` branch's `overallOk` was set to `barrierPass` alone.

## Changes made

### Three edits applied identically to all four editions

**Edit 1 — `let selectorCheck = null;` declaration in `main()`**
Added next to `let verdictCheck = null;` (L185 in original). Initializes to null for all modes;
per-node-start and whole-plan branches leave it null.

**Edit 2 — shell call in the per-node branch only (after verdictCheck)**
```js
// #263: selector-check ID --json. BLOCKING per-node (checks the COMPLETING node's OWN
// .cache, like barrier-check — no deadlock risk, so NOT informational). A non-selector
// node returns isSelector:false/ok:true (never false-blocks). A selector_source with a
// missing/foreign selector returns ok:false/exit 1 => fails the commit (fail-closed).
// NEVER mutates the ledger: on success it RETURNS armsToNa for the contractor to transcribe.
selectorCheck = shellValidator(validatorPath, planPath, ['--selector-check', '--node-id', nodeIdValue, '--json']);
```
Also updated the `combineResults(...)` call to pass `selectorCheck` as the 5th field:
```js
const out = combineResults({ recordBase, barrierCheck, gateVerify, verdictCheck, selectorCheck }, { mode, nodeId: nodeIdValue });
```

**Edit 3 — `combineResults` update (blocking, backward-compatible)**
- Updated the docstring to name `selectorCheck` in the `steps` parameter
- Added `selectorCheck` to the destructure
- In the `per-node` branch: computed `selectorPass` and threaded it into `overallOk`:
  ```js
  const selectorPass = (selectorCheck == null) ? true
    : (selectorCheck.exitCode === 0 && selectorCheck.ok === true);
  overallOk = barrierPass && selectorPass;
  ```
  `(selectorCheck == null)` catches both `null` and `undefined` — back-compat with existing callers
  that pass no `selectorCheck` field (e.g., `scripts/test-commit-node.js` pure-case calls).
- Added `selectorCheck` to the return object (NOT tagged `informational` — it is blocking):
  ```js
  selectorCheck: (selectorCheck !== undefined) ? selectorCheck : null,
  ```

The whole-plan branch does NOT shell `--selector-check` (no `--node-id` available there); it remains `null`.

## GREEN evidence

### Four-edition parity

**Root vs Codex byte-identical:**
```
diff scripts/kaola-workflow-commit-node.js plugins/kaola-workflow/scripts/kaola-workflow-commit-node.js
# empty — BYTE-IDENTICAL
```

**Gitea and gitlab structural presence (12 occurrences each):**
```
grep -c 'selectorCheck\|selector-check\|selectorPass' plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-commit-node.js
# 12

grep -c 'selectorCheck\|selector-check\|selectorPass' plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-commit-node.js
# 12
```

### Module loads without error
```
node -e "const cn = require('./scripts/kaola-workflow-commit-node.js'); console.log(typeof cn);"
# object
# MODULE_LOADS_OK
```

### Backward compatibility: test-commit-node.js passes
```
node scripts/test-commit-node.js
# commit-node tests passed (27 assertions)
```
Existing pure-case tests that call `combineResults` without `selectorCheck` all pass. The
`(selectorCheck == null) ? true` guard handles both null and undefined correctly.

### Walkthrough exits at same G-SEL-1 tripwire (not a new error)
```
node scripts/simulate-workflow-walkthrough.js
# ... (26 prior tests PASS) ...
# Error: TRIPWIRE: select() refusal must name the invalid shape, got:
# {"result":"refuse","errors":["select group \"fix\" arms declare no selector_source"],...}
```
The error is `select group "fix" arms declare no selector_source` (G-SEL-1 from impl-validator),
identical to the tripwire impl-validator left behind. No new error was introduced by this node's changes.
The commit-node changes are additive; they do not touch the plan-validator or the walkthrough fixture.

### No-ledger-mutation invariant preserved
The commit-node still writes nothing to `workflow-plan.md` or the ledger. It surfaces
`selectorCheck.armsToNa` in its JSON output; the contractor agent transcribes those rows via Edit.
There is no `fs.writeFileSync` or `appendFileSync` to any plan file in the updated code.
