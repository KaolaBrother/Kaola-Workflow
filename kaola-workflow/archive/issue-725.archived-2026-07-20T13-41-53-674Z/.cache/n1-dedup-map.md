evidence-binding: n1-dedup-map b15c42d5d73d
findings: Overlap band before=32 asserts (3 clusters); prunable duplicate copies=13 (~40%, exceeds AC-E >=25%). n2=8 prunes (all in simulate-workflow-walkthrough.js; 0 in test-adaptive-node.js). n4=5 prunes (all in test-bundle-state.js VALUE re-asserts; 0 in test-claim-hardening.js). KEEP-list (test-plan-run.js, test-barrier-base-integrity.js, walkthrough bundle E2E journey) respected.

## Structural finding
The two 19K files barely overlap by subject. test-adaptive-node.js = adaptive-node.js exports + schema conformance + fault-injection. Walkthrough adaptive blocks are mostly (a) subprocess E2E journeys, (b) cross-edition byte-identity, (c) plan-VALIDATOR/schema-grammar coverage (parseNodeVerdict, optimize/select grammar, pattern-library, validator governance) that test-adaptive-node.js does NOT own (lives in excluded test-plan-run.js). The walkthrough calls an adaptive-NODE export in-process in exactly ONE spot (an611.checkEvidenceShape :1632-1638). test-adaptive-node's 3 "End-to-end: real subprocess" blocks (:2583/:2709/:2912) are fence-parity fault-injection = its keeper class -> 0 prunes from test-adaptive-node.js.

## (1) Overlap-band measure -- before=32; prunable=13 (~40%; AC-E needs >=25%)
Band = asserts whose invariant is covered at BOTH altitudes, 3 confirmed clusters (all copies counted). Recompute:
| Cluster | grep (recompute) | copies |
|---|---|---|
| A checkEvidenceShape/delegation | `grep -nc "checkEvidenceShape(" simulate-workflow-walkthrough.js` in :1631-1639 =4; keeper `grep -n "T611-AC5\|parseDelegationOutcome" test-adaptive-node.js` ~5 | 9 |
| B review-v2 pure conformance | `grep -nE "'review-v2 walkthrough (loads\|reaches\|preserves forward-reachability\|accepts a complete)" simulate-workflow-walkthrough.js` =4; keeper subset of `grep -c "'review-v2" test-adaptive-node.js` (=52) ~8 | 12 |
| C bundle state field-VALUES | `grep -nE "folder\.(issue_numbers\[\|bundle_id ===\|closure_policy ===)" test-bundle-state.js` =5; keepers test-bundle-claim.js:272-274 + walkthrough:17794-17799 ~6 | 11 |
Post-prune band = 32 - 13 = 19 -> 40.6% reduction of the band.

## (2) Prune worklist
### n2 -- prune from simulate-workflow-walkthrough.js ONLY (test-adaptive-node.js keeps all):
| # | file:line | invariant | KEEP-altitude | OTHER covers | conf |
|---|---|---|---|---|---|
| A1 | walkthrough:1632 | checkEvidenceShape RED/GREEN ok | test-adaptive-node | test-adaptive-node.js:3001+(T6) | HIGH |
| A2 | walkthrough:1634 | delegation_outcome:completed ok | test-adaptive-node | test-adaptive-node.js:14956 | HIGH |
| A3 | walkthrough:1636 | valid delegation+implementer tokens ok | test-adaptive-node | test-adaptive-node.js:14959 | HIGH |
| A4 | walkthrough:1638 | unknown delegation_outcome -> refuse | test-adaptive-node | test-adaptive-node.js:14962-14964 | HIGH |
| B1 | walkthrough:16021 | corpus data-driven executable | test-adaptive-node | test-adaptive-node.js review-v2 blk :17820-18190 | MED |
| B2 | walkthrough:16026 | reaches classifier/reducer/plan-view APIs | test-adaptive-node | test-adaptive-node.js:17825-17827 | MED |
| B3 | walkthrough:16030 | deriveGateMode->change_gate | test-adaptive-node | test-adaptive-node.js:17839 | MED |
| B4 | walkthrough:16037 | reduceReviewReceipts investigation | test-adaptive-node | test-adaptive-node.js:18060 | MED |

### n4 -- prune from test-bundle-state.js ONLY (test-claim-hardening.js keeps all):
| # | file:line | invariant | KEEP-altitude | OTHER covers | conf |
|---|---|---|---|---|---|
| C1 | test-bundle-state.js:151 | issue_numbers[0]===42 VALUE | test-bundle-claim + walkthrough journey | test-bundle-claim.js:264; walkthrough:17794 | MED |
| C2 | test-bundle-state.js:152 | issue_numbers[1]===47 VALUE | keepers | test-bundle-claim.js:264; walkthrough:17794 | MED |
| C3 | test-bundle-state.js:153 | issue_numbers[2]===53 VALUE | keepers | test-bundle-claim.js:264; walkthrough:17794 | MED |
| C4 | test-bundle-state.js:154 | bundle_id VALUE | keepers | test-bundle-claim.js:273; walkthrough:17796 | MED |
| C5 | test-bundle-state.js:155 | closure_policy VALUE | keepers | test-bundle-claim.js:274; walkthrough:17798 | MED |
n4 constraint: prune ONLY the VALUE re-asserts; KEEP the active-folders reader-shape asserts (:143,:144,:147,:148,:149,:150) -- sole coverage of the active-folders projection.

## (3) Prune counts + KEEP-list
- n2 = 8 (walkthrough :1632,:1634,:1636,:1638,:16021,:16026,:16030,:16037). 0 from test-adaptive-node.js.
- n4 = 5 (test-bundle-state.js :151-155). 0 from test-claim-hardening.js.
- KEEP-list respected: test-plan-run.js / test-barrier-base-integrity.js untouched; walkthrough bundle E2E journey (testBundleClaimCreatesOneFolder:17748, RefusalLeavesNoFolder:17821, DuplicateIssueBlocking:17873, :17926/:17986/:18106 -- the ~:17727 anchor region) KEEP, no row targets it.

## Conservative KEEPs (do NOT prune -- coverage loss)
walkthrough parseNodeVerdict/parseNodeSelector :12526-12570 (sole home -- test-adaptive-node tests only checkVerdictParse wrapper :6841); testReviewerContractV2Conformance R5 cross-edition :16039-16388 + subprocess review journey :16388-16572; testMetricOptimizerContract:2011 / testAdaptiveSelectComposition:13427 / testAdaptivePatternLibrary:13070 / testAdaptiveValidatorGovernance (validator subject); test-claim-hardening #495(b/c-bundle) :492-558 (escalate/refuse tested ONLY on bundle path); test-bundle-state classifier-block :204 + orient bundle_state_incoherent :287-340 (distinct subjects).
