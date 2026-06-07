# Workflow Plan — issue #267 (test(adaptive): select() composition and runtime coverage)

<!-- plan_hash: 8de9445a2dd388fcc3975863b83dc7fbc31d922ebb82f5412b9c303e74db9c4b -->

Purely additive test coverage in `scripts/simulate-workflow-walkthrough.js`
(`testAdaptivePatternLibrary` or a new test block) for the Classify-And-Act
primitives shipped in #263. The fixtures characterize ALREADY-SHIPPED behavior:
G1 composition (select+fanout, select+adversarial-verify, select+loop,
gate-post-dominates-select), G2 multi-group, G3 next-action n/a propagation
(against the REAL `kaola-workflow-next-action.js`, not mocked), G4 `--resume-check`
on a partially-executed select plan, and G5 selector_source-as-fanout-member
(in-grammar OR a typed refusal with a clear message). Per the issue Notes, NO
grammar/validator code change is anticipated; the implement lane is scoped to the
single test file. If G5 reveals an unhandled validator case (a true out-of-lane
finding), the executor surfaces it for a re-plan — the validator's own sync-group
gate (#274) refuses pre-reserving `kaola-workflow-plan-validator.js` here because it
would force its 4 byte-identical edition peers into this lane for a write nobody
expects.

## Meta
labels: enhancement, area:scripts, area:workflow-phases

## Nodes

| id         | role          | depends_on  | declared_write_set                         | cardinality | shape    |
|------------|---------------|-------------|--------------------------------------------|-------------|----------|
| impl-tests | implementer   | —           | scripts/simulate-workflow-walkthrough.js   | 1           | sequence |
| review     | code-reviewer | impl-tests  | —                                          | 1           | sequence |
| finalize   | finalize      | review      | CHANGELOG.md                               | 1           | sequence |

non_tdd_reason (impl-tests): additive characterization/coverage — the G1–G4 fixtures
assert behavior already shipped in #263 (`select()`, `parseNodeSelector`, G-SEL-1..4,
`--selector-check`, next-action n/a TERMINAL handling), so they pass on first run with
NO failing-first (red) cycle. There is no meaningful failing unit test to drive new
production code; this is coverage that locks in shipped primitives. G5 alone has any
red-green character, and only if it reveals an unhandled validator case.

## Node Ledger

| id         | status  |
|------------|---------|
| impl-tests | complete |
| review     | complete |
| finalize   | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| implementer (impl-tests) | subagent-invoked | # Node impl-tests — evidence (issue #267) | |
| code-reviewer | subagent-invoked | # Node review (code-reviewer) — evidence (issue #267) | |
| finalize (finalize) | subagent-invoked | ## Evidence — Node finalize (sink) — Issue #267 | |
