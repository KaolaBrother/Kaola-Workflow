evidence-binding: n5-falsify-bundle-consolidate 7be9cef9d217
contract_version: 2
review_context_hash: 51f9d2c4e14cd2084500b860281de34caa94eccc3624a6e81424354beabfb762
behavior_contract_hash: 0ad9331a05da66b2b18f4eb67facd1b686bd9dd3e8b5398399d4738cafed6e9b
resolved_profile_hash: 14c89a924b21c9291cf8a00759202b8846a5dac4e891bb8a3e625e85efc7b2ce
candidate_digest: 5ea56aeed36eb8b74a32bf40cc41da2f9fb502ac51974839c0840ccbf60f6ad5
domain_outcome: not_refuted
claim_outcome: not_refuted
gate_mode: change_gate
gate_claim: every bundle-claim entrypoint assert dropped from test-bundle-state.js and test-claim-hardening.js is still covered by test-bundle-claim.js and the retained walkthrough bundle-lane journey (no bundle-claim coverage lost), and no non-bundle-claim assertion in either file was disturbed
gate_surface: the accumulated diff on test-bundle-state.js and test-claim-hardening.js vs run base 3907fb18, cross-checked against test-bundle-claim.js and the walkthrough bundle-lane journey retained as the single keeper
gate_aggregation: sequence

## Adversarial verdict — UPHELD (not_refuted); strong falsification attempted, claim held
Change gate certifying n4-bundle-claim-consolidate. Read-only. Presumed the claim false; ran strongest counterexamples; none broke it.

- Diff scope: `git diff 3907fb18 HEAD` numstat = `0 5 scripts/test-bundle-state.js` (5 deletions, 0 insertions, one file). Deletions-only, exactly the 5 VALUE asserts from testBundleStateParsing (former :151-155). test-claim-hardening.js diff EMPTY (dropped-set vacuously satisfied).
- Per-dropped-assert keepers (spot-checked, specific lines): C1 issue_numbers[0]===42 -> test-bundle-claim.js:265 + state regex :272 (/^issue_numbers:\s*42,47,53\s*$/m); walkthrough :17762. C2 [1]===47 / C3 [2]===53 -> state regex :272 literal 42,47,53; walkthrough :17762. C4 bundle_id==='bundle-42-47-53' -> test-bundle-claim.js:259 + :273 + Test(9) sort-order keeper (ran green); walkthrough :17747/:17764. C5 closure_policy==='all_or_nothing' -> test-bundle-claim.js:274; walkthrough :17766.
- Kept active-folders reader-shape asserts CONFIRMED PRESENT at test-bundle-state.js:143-150 (Array.isArray folders, length===1, project, issue_number===42, Array.isArray issue_numbers, length===3) — sole active-folders projection coverage, intact.
- No collateral disturbance: classifier Test(c) :191-204 and orient bundle_state_incoherent Tests(d)/(e) :260-339 intact and passed on re-run.
- Independent re-run (verifier's own captured exits): STATE_EXIT=0 ("test-bundle-state: all 32 tests passed"); CLAIM_EXIT=0 ("test-bundle-claim: all 79 tests passed").
- Disclosed NON-BLOCKING nuance: post-prune, the active-folders READER's projection of a POPULATED closure_policy is no longer directly asserted (a pre-existing reader-projection quality gap, NOT a bundle-claim VALUE coverage loss — the dropped values all survive in real claim-entrypoint keepers). Recorded for the finalize run-gap sweep as an analytical observation.
Confidence: high.
