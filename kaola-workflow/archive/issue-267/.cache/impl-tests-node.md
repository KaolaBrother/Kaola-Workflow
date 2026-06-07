# Node: impl-tests (issue #267)

## task
Add purely additive characterization tests for the already-shipped #263 Classify-And-Act
`select()` primitives covering G1–G5 acceptance criteria.

## non_tdd_reason
Additive characterization coverage — the behavior (select() grammar, n/a propagation,
resume-check hash exclusion) is already shipped; these tests lock in observed behavior
with no failing-first cycle. Category: **glue / wiring** (new runtime checks of existing
script behavior) + **characterization test** (passes immediately, records observed outcome).

## write_set
- `scripts/simulate-workflow-walkthrough.js` (ONLY file touched)

## verification_commands
```
node scripts/simulate-workflow-walkthrough.js
```
Exit code: 0

## before_result
Baseline run (before edits): exit 0, "Workflow walkthrough simulation passed"

## after_result
After edits: exit 0, "Workflow walkthrough simulation passed"
New PASSED lines:
  testAdaptiveSelectComposition: PASSED
  testAdaptiveSelectNaPropagation: PASSED
  testAdaptiveSelectResumeCheck: PASSED
  testAdaptiveSelectSelectorSourceFanoutMember: PASSED

## G1a correction (post-review)
G1a fixture originally used `code-reviewer` as the synth classifier (a gate role, not a
read-only role). AC G1a requires a "read-only synth/classifier node" as the selector_source.
Fixed: `synth` role changed from `code-reviewer` to `planner` (read-only). Probed fixture
returns `{"result":"in-grammar","decision":"ask"}` (write-role fanout => blast radius => ask).

## G4 hash-canonicalization finding
**Ledger EXCLUDED from hash: YES.**

Evidence — `kaola-workflow-plan-validator.js` lines 483-493:
  The comment explicitly states: "The mutable `## Node Ledger` (statuses update during the
  run) and the plan_hash comment itself are excluded."
  `computePlanHash` hashes `norm('Meta') + '---NODES---' + norm(NODES_HEADING)` only.
  
Empirical probe: freeze all-pending plan → hash = a4563a1ef065...; mutate ledger
(classify=complete, arm-a=n/a) → --resume-check --json → `{"ok":true,"planHash":"a4563a1ef065..."}`.
Hash unchanged. --resume-check passes.

## G5 actual behavior pinned
**Result: in-grammar.** Exit 0. `{"result":"in-grammar","decision":"auto-run",...}`.
The validator has no rule forbidding a read-only node from simultaneously being a
`fanout(sweep)` leg and the `selector_source` for a `select()` group. Pinned as
`assert(v.result === 'in-grammar', ...)` in `testAdaptiveSelectSelectorSourceFanoutMember`.

## New/edited test function names
- `validateSelectFixture(planPath, nodesRows7col, labels)` — helper (added inline in file)
- `testAdaptiveSelectComposition()` — G1a/G1b/G1c/G1d/G2 validator fixtures
- `testAdaptiveSelectNaPropagation()` — G3 runtime n/a propagation
- `testAdaptiveSelectResumeCheck()` — G4 runtime resume-check
- `testAdaptiveSelectSelectorSourceFanoutMember()` — G5 probe-then-pin

Run-list insertion (after testAdaptivePatternLibrary()):
```js
    testAdaptiveSelectComposition();
    testAdaptiveSelectNaPropagation();
    testAdaptiveSelectResumeCheck();
    testAdaptiveSelectSelectorSourceFanoutMember();
```

## Mutation checks (G3/G4/G5 — all reverted)
- G3: flipped `!json.readySet.some(n => n.id === 'arm-a')` to `json.readySet.some(...)` →
  Error: "G3: n/a arm (arm-a) must be ABSENT from readySet" fired. Reverted.
- G4: flipped `rcJson.ok === true` to `rcJson.ok === false` →
  Error: "G4: --resume-check must return ok=true" fired. Reverted.
- G5: flipped `v.result === 'in-grammar'` to `v.result === 'refuse'` →
  Error: "G5: selector_source that is also a fanout member (read-only) must be in-grammar" fired. Reverted.

All three mutations triggered the specific intended assertion (not a different one).
