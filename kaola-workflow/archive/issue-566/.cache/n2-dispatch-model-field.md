evidence-binding: n2-dispatch-model-field c464e29e3976
<!-- RED: paste RED here -->
RED: $ node scripts/simulate-workflow-walkthrough.js --only testDispatchLogEmitsModelFields566
Error: #566: model_planned must be non-empty (resolver returns a tier for contractor), got: undefined
    at assert (scripts/simulate-workflow-walkthrough.js:47:25)
    at Object.testDispatchLogEmitsModelFields566 [as fn] (scripts/simulate-workflow-walkthrough.js:13920:5)
(pre-impl: hook emits neither model nor model_planned → parsed.model_planned undefined)
<!-- GREEN: paste GREEN here -->
GREEN: testDispatchLogEmitsModelFields566 passes; full suite exit 0 ("Workflow walkthrough simulation passed")
$ node scripts/simulate-workflow-walkthrough.js → testDispatchLogEmitsModelFields566: PASSED + testDispatchLogHookWorktreeAware338: PASSED (back-compat sibling) → "Workflow walkthrough simulation passed" (FULL SUITE EXIT=0)
$ node scripts/validate-script-sync.js → OK: 26 common scripts, 25 byte-identical groups (4 hook copies identical; EXIT=0)
$ node scripts/kaola-workflow-resolve-agent-model.js contractor --raw → sonnet
