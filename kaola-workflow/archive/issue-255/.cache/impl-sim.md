# impl-sim evidence — issue #255 handoff integration tests

## Cases added

1. `testAdaptiveHandoffInGrammarReady`
2. `testAdaptiveHandoffAskFreezesNotApproval`
3. `testAdaptiveHandoffRefuseNoMutation`
4. `testAdaptiveHandoffIdempotentReRun`

Registered at `scripts/simulate-workflow-walkthrough.js` ~line 7185 (before `console.log('Workflow walkthrough simulation passed')`).
`handoffScript` constant added at line 18, next to `planValidatorScript`.

## Deviation from blueprint E

Blueprint E says "Run handoff --project" but `--project` resolves paths from the script's own `__dirname`
(the real repo root), not `cwd`. Using `--project` with a tmp fixture dir causes the handoff to look in
the wrong location. All 4 tests use `--plan <absolute-path>` instead, which resolves from the explicit
absolute path and derives the sibling state file correctly.

## RED output (flipped assertion — proves teeth)

The assertion in `testAdaptiveHandoffAskFreezesNotApproval` was temporarily flipped to the OLD wrong
expectation (`result.handoff_status === 'needs_user_approval'`). Running with the flip produced:

```
...
testAdaptivePatternLibrary: PASSED
testAdaptiveHandoffInGrammarReady: PASSED
Error: REGRESSION: decision:ask must still be ready_to_dispatch_first_node (NOT needs_user_approval), got: {"handoff_status":"ready_to_dispatch_first_node","checklist":{"claim_acquired":true,"plan_in_grammar":true,"plan_frozen":true,"resume_check_ok":true,"first_node_opened":true,"baseline_recorded":true,"roadmap_staged":true},"first_node":{"id":"explore","role":"code-explorer","model":"sonnet","declared_write_set":"—"},"decision":"ask","risk":{"sensitivity":false,"blastRadius":true,"uncertain":false,"reasons":["write-role fan-out (N>=2)"]}}
    at assert (.../simulate-workflow-walkthrough.js:23:25)
    at testAdaptiveHandoffAskFreezesNotApproval (.../simulate-workflow-walkthrough.js:6851:5)
    at main (.../simulate-workflow-walkthrough.js:7185:5)
```

The test correctly detected the regression: `handoff_status` is `ready_to_dispatch_first_node` (correct
2-state behavior), not `needs_user_approval` (stale, removed). RED confirmed.

## GREEN output (correct assertion — full suite passes)

After reverting to the correct assertion (`result.handoff_status === 'ready_to_dispatch_first_node'`):

```
testAdaptivePatternLibrary: PASSED
testAdaptiveHandoffInGrammarReady: PASSED
testAdaptiveHandoffAskFreezesNotApproval: PASSED
testAdaptiveHandoffRefuseNoMutation: PASSED
testAdaptiveHandoffIdempotentReRun: PASSED
Workflow walkthrough simulation passed
EXIT CODE: 0
```

All existing cases remain green. Suite end log: `Workflow walkthrough simulation passed`. Exit code: 0.
