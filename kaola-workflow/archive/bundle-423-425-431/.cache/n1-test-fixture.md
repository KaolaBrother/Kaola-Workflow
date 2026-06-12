evidence-binding: n1-test-fixture 99638b5bb723
RED: A: Step-8a block exits 0 — AssertionError: FAIL (pre-impl): ledger-compare exited 1 because --source kaola-workflow/issue-700/workflow-plan.md did not exist in the fixture; also RED: A (#361): renamed file mirrored by NEW path failed (block exited 1 before reaching the mirror loop). 2/14 assertions failing.
GREEN: A: Step-8a block exits 0 passes; A (#361): renamed file mirrored by NEW path passes; new D (#423): Step-8a exits 0 with no workflow-plan.md present (hermetic HOME) passes; new D (#423): rename mirrored even when no plan present passes. 17/17 assertions green.

## What was fixed

### Test A fixture (scenario-A): add workflow-plan.md with ## Node Ledger

The `kaola-workflow-ledger-compare.js` guard in the Step-8a bash block calls:
```
node "$LEDGER_COMPARE_JS" --source "kaola-workflow/{project}/workflow-plan.md" ...
```

It exits 1 (usage/env error) when `--source` is unreadable. The fixture only created `workflow-state.md`, not `workflow-plan.md`, so the guard exited 1 → the bash block printed "REFUSED" and exited 1.

Fix: write a minimal `workflow-plan.md` with a `## Node Ledger` section (one `pending` row) to the fixture BEFORE the git commit. `sourceComplete=0`, `destComplete=0` → `compareLedgers` returns `safe:true` → guard passes → block exits 0.

File: `scripts/test-bash-block-guards.js`, lines 65-69 (new fixture write).

### New Test D: no-plan / no-ledger-compare scenario

Added a new test block that:
1. Creates a fresh fixture WITHOUT `workflow-plan.md` (simulates full/fast-path project).
2. Runs the bash block with `HOME` set to a hermetic empty tmpdir and `CLAUDE_PLUGIN_ROOT=''`, so `kaola_script` cannot locate `kaola-workflow-ledger-compare.js`.
3. With `LEDGER_COMPARE_JS` empty, the `[ -n "$LEDGER_COMPARE_JS" ]` guard short-circuits — no refusal, block proceeds.
4. Asserts exit 0 and that the staged rename is still mirrored to the worktree.

This documents the fail-open / skip behavior for environments (or workflow paths) that have no ledger-compare script installed.

## Verification

```
node scripts/test-bash-block-guards.js
# test-bash-block-guards: all 17 assertions passed (#361 bash-block execution)

node scripts/simulate-workflow-walkthrough.js
# Workflow walkthrough simulation passed
```
