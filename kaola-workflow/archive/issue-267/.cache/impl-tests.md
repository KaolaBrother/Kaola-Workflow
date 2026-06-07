# Node impl-tests — evidence (issue #267)

non_tdd_reason: additive characterization/coverage of already-shipped #263 select() primitives — the G1–G4 fixtures assert behavior that already exists (select(), parseNodeSelector, G-SEL-1..4, next-action n/a TERMINAL handling), so they pass on first run with NO failing-first (red) cycle. G5 was probe-then-pin (no production change). No grammar/validator code change made; lane = scripts/simulate-workflow-walkthrough.js only.

## What was added (279 insertions, single file)
- const nextActionScript (next-action.js path)
- helper validateSelectFixture(planPath, rows7col, labels)
- testAdaptiveSelectComposition()  — G1a select+fanout, G1b select+adversarial-verify, G1c select+loop, G1d valid + G1d negative (post-dominance refusal), G2 multi-group
- testAdaptiveSelectNaPropagation() — G3, real next-action, n/a arm absent + pending arm present
- testAdaptiveSelectResumeCheck()   — G4, plantFrozenPlan + ledger mutate + --resume-check ok + next-action readySet
- testAdaptiveSelectSelectorSourceFanoutMember() — G5, pinned in-grammar
- all four registered in the main run list (lines 8752-8755)

## Acceptance criteria
1. G1a-G1d in-grammar (+ G1d negative control refuses with "does not post-dominate") — PASS
2. G2 two distinct-name select groups in-grammar — PASS
3. G3 n/a arm absent from readySet (real kaola-workflow-next-action.js) — PASS
4. G4 --resume-check ok=true on partially-executed (frozen) select plan — PASS
5. G5 selector_source-as-fanout-member pinned in-grammar (clear behavior) — PASS
6. walkthrough exits 0 — PASS

## G4 hash finding
computePlanHash (plan-validator.js ~488-493) hashes ## Meta + ## Nodes ONLY; the mutable ## Node Ledger is EXCLUDED. Empirically confirmed: freeze all-pending → mutate ledger rows → --resume-check ok=true, hash unchanged. freeze-then-mutate is sound.

## G5 finding
A read-only code-explorer that is simultaneously a fanout(sweep) leg AND the selector_source of a select(fix) group validates in-grammar (decision auto-run). The grammar has no rule forbidding the dual role. Not an out-of-lane case; no validator change.

## Anti-vacuous discipline
- All four new functions registered AND their PASSED lines verified in output.
- Mutation checks (flip-then-revert) done for G3, G4, G5 — each flipped expectation fired its OWN specific assertion, then reverted; suite green again.

## regression-green (orchestrator independently re-ran)
$ node scripts/simulate-workflow-walkthrough.js
... testAdaptiveSelectComposition: PASSED
... testAdaptiveSelectNaPropagation: PASSED
... testAdaptiveSelectResumeCheck: PASSED
... testAdaptiveSelectSelectorSourceFanoutMember: PASSED
Workflow walkthrough simulation passed
EXIT=0

Lane compliance: git status shows only `M scripts/simulate-workflow-walkthrough.js` (the kaola-workflow/issue-267/ project folder is an exempt workflow artifact).
