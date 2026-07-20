evidence-binding: n2-overlap-prune c5205c75b0d9
<!-- non_tdd_reason: paste non_tdd_reason here -->
non_tdd_reason: coverage-preserving refactor of a test file (removing duplicate asserts already covered at the test-adaptive-node.js altitude), no failing-test-first ceremony applies
<!-- regression-green|build-green|smoke-integration -->
regression-green: node scripts/simulate-workflow-walkthrough.js -> exit 0, "Workflow walkthrough simulation passed" (run in leg /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/legs/issue-725/n2-overlap-prune; captured EXIT=0 directly, not via piped tail; 0 FAILED lines / 223 PASSED test blocks, including testReviewerContractV2Conformance: PASSED)
<!-- OPEN n1-dedup-map's evidence file and append its line-1 binding nonce as the value below -->
upstream_read: n1-dedup-map b15c42d5d73d

## Asserts removed (8 of 8 from the n1 worklist)

Cluster A -- `simulate-workflow-walkthrough.js` #611 AC5 block (was lines ~1632-1640, inside the plan-hash/legacy-token test):
- A1 (was :1632-1633) -- `an611.checkEvidenceShape('tdd-guide', 'jn', 'RED: r\nGREEN: g').ok === true` (no delegation_outcome token defaults to completed). Confirmed content matched the map's invariant before removal. Covered by test-adaptive-node.js:3001+ (T6).
- A2 (was :1634-1635) -- `an611.checkEvidenceShape(..., 'delegation_outcome: completed\n...').ok === true`. Confirmed match. Covered by test-adaptive-node.js:14956.
- A3 (was :1636-1637) -- `an611.checkEvidenceShape('implementer', ..., 'delegation_outcome: interrupted_unresponsive\n...').ok === true`. Confirmed match. Covered by test-adaptive-node.js:14959.
- A4 (was :1638-1640) -- `jnBad = an611.checkEvidenceShape(..., 'delegation_outcome: made_up\n...')` + `assert(jnBad.ok === false && jnBad.missingTokenClass === 'delegation_outcome', ...)`. Confirmed match. Covered by test-adaptive-node.js:14962-14964.
  All 4 asserts under this AC5 comment were pruned together (the map's full worklist for this cluster), which also fully orphaned the `const an611 = require('./kaola-workflow-adaptive-node')` require and the `jnBad` intermediate -- both had zero other consumers in the file (verified via grep), so they were removed too to avoid leaving dead code. The AC2 `waitBudgetMinutes` assert immediately above (kept, not in the worklist) is untouched and still runs; its comment was trimmed to drop the now-inapplicable AC5 reference and now notes AC5 coverage lives in test-adaptive-node.js.

Cluster B -- `simulate-workflow-walkthrough.js` `testReviewerContractV2Conformance` R6 corpus-conformance header (was lines ~16017-16037, before the R5 cross-edition block which is a KEEP and untouched):
- B1 (was :16017-16021) -- `assert(fixture.gate_modes.length >= 3 && ... , 'review-v2 walkthrough loads a data-driven executable conformance corpus ...')`. Confirmed match. Covered by test-adaptive-node.js review-v2 block :17820-18190.
- B2 (was :16022-16026) -- `assert(typeof schema.deriveGateMode === 'function' && ... , 'review-v2 walkthrough reaches the shared classifier/reducer/version/plan-view APIs')`. Confirmed match. Covered by test-adaptive-node.js:17825-17827.
- B3 (was :16029-16030) -- `assert(schema.deriveGateMode(change.plan, node) === 'change_gate', 'review-v2 walkthrough preserves forward-reachability change-gate semantics')`. Confirmed match. Covered by test-adaptive-node.js:17839.
- B4 (was :16036-16037) -- `assert(investigation.complete === true && investigation.gate_effect === 'none', 'review-v2 walkthrough accepts a complete bound indeterminate investigation analytically')`. Confirmed match. Covered by test-adaptive-node.js:18060.
  All 4 asserts were pruned together (the map's full worklist for this cluster). Their only setup -- `const fixture = JSON.parse(fs.readFileSync(... 'reviewer-conformance-fixtures.json' ...))`, `const change = fixture.gate_modes[0]`, `const node = change.plan.nodes.find(...)`, `const investigation = schema.reduceReviewReceipts({...})` -- became fully orphaned (verified via grep across the whole file: no other reference to `fixture`, `change.`, or the fixture path outside this block) and was removed alongside the asserts. `schema` and `validator` (declared at the top of the function) remain heavily used by the kept R5 block below, so those requires were left untouched. Replaced with a one-line comment noting the R6 coverage moved to test-adaptive-node.js.

## Kept (0 of 8 restored for correctness)
None of the 8 required restoration -- all removals were confirmed safe (content matched the map's stated invariant at each guide location, and no other code in the file depended on the removed asserts or their orphaned setup variables) and the full walkthrough still passes green.

## Touched files
Only `scripts/simulate-workflow-walkthrough.js` inside the leg (`git status --porcelain` in the leg shows exactly ` M scripts/simulate-workflow-walkthrough.js`, nothing else). `scripts/test-adaptive-node.js` was read (to spot-check the "OTHER covers" line references cited by the map) but not modified.
