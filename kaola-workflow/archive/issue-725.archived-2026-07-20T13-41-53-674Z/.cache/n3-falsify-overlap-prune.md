evidence-binding: n3-falsify-overlap-prune 2461bc5cfa1a
contract_version: 2
review_context_hash: 41276c02949c0a218d4b2475b5c2dbdc65196f2682edfe14676bf0fbfc6b0cfa
behavior_contract_hash: 0ad9331a05da66b2b18f4eb67facd1b686bd9dd3e8b5398399d4738cafed6e9b
resolved_profile_hash: 14c89a924b21c9291cf8a00759202b8846a5dac4e891bb8a3e625e85efc7b2ce
candidate_digest: 5ea56aeed36eb8b74a32bf40cc41da2f9fb502ac51974839c0840ccbf60f6ad5
domain_outcome: not_refuted
claim_outcome: not_refuted
gate_mode: change_gate
gate_claim: every assert pruned from test-adaptive-node.js or simulate-workflow-walkthrough.js has its invariant genuinely preserved at the OTHER altitude per the n1 dedup map (no coverage lost): the unit file retains all refusal seams, envelope shapes, and fault-injection cases, the walkthrough retains every end-to-end journey and cross-process behavior INCLUDING the kept bundle-lane journey, the remaining claude chain stays green, and the measured overlap band is cut at least 25 percent
gate_surface: the accumulated diff on test-adaptive-node.js and simulate-workflow-walkthrough.js vs run base 3907fb18, cross-checked against the n1 dedup map's invariant to other-altitude file:line citations and the recorded pre-prune overlap-band measurement
gate_aggregation: sequence

## Adversarial verdict — UPHELD (not_refuted); strong falsification on all 8 asserts, claim held
Change gate certifying n2-overlap-prune. Read-only. Ran the strongest counterexamples on every pruned assert; none broke the claim.

- Per-assert keepers spot-checked in test-adaptive-node.js (each genuinely covers the SAME invariant): A1 walkthrough:1632 -> :14953 (checkEvidenceShape RED/GREEN ok) + T6 block 3006+. A2 -> :14956 (near byte-identical, 'T611-AC5'). A3 -> :14959 (delegation handling is a SINGLE uniform closed-vocab check, adaptive-node.js:2249 DELEGATION_OUTCOME_VOCABULARY.includes, no per-token branch; returned_partial and interrupted_unresponsive traverse identical branch; enum validity also covered at 14945-14946). A4 -> :14962-14964 (unknown token -> ok===false && missingTokenClass==='delegation_outcome'). B1 -> :17811 + :17820-17822 (loads reviewer-conformance-fixtures.json, iterates requiredCoverage; STRONGER than pruned copy). B2 -> :17824-17834 + :18174-18175 (deriveGateMode + reduceReviewReceipts + resolvePlanContract/buildPlanView). B3 -> :17837-17841 (deriveGateMode over all gate_modes rows). B4 -> :18059-18064 (reduceReviewReceipts over fixture.reducers, investigation complete + gate_effect).
- Orphan-var zero-consumer: post-prune grep an611=0, jnBad=0, reviewer-conformance-fixtures=0; no dangling const fixture/change/node/investigation; kept AC2 waitBudgetMinutes assert untouched.
- test-adaptive-node.js UNTOUCHED: git diff 3907fb18 HEAD --stat = only simulate-workflow-walkthrough.js (44 lines) + test-bundle-state.js (5 lines, n4). 0 changes to the unit file.
- Kept bundle-lane E2E journey present: testBundleClaimCreatesOneFolder (17716), testBundleRefusalLeavesNoFolder (17789), testBundleDuplicateIssueBlocking (17841) defined + registered (16790-16792).
- Band cut >=25%: walkthrough removed EXACTLY 8 asserts, 0 added; n1 band before=32 -> n2 alone 8/32=25%, combined n2+n4=13/32=40.6%.
- Independent re-run (verifier's own captured exit): node scripts/simulate-workflow-walkthrough.js -> EXIT=0, "Workflow walkthrough simulation passed", 0 FAILED/Error/ReferenceError, 223 PASSED (incl. testReviewerContractV2Conformance: PASSED).
Confidence: high. No counterexample succeeded.
