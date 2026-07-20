evidence-binding: n4-bundle-claim-consolidate 6859243b6b47
<!-- non_tdd_reason: paste non_tdd_reason here -->
non_tdd_reason: coverage-preserving refactor removing duplicate entrypoint asserts, no failing-test-first ceremony applies
<!-- regression-green|build-green|smoke-integration -->
regression-green: node scripts/test-bundle-state.js -> exit 0 (32 tests passed) (+ test-bundle-claim.js keeper still green, 79 tests passed), run in leg
<!-- OPEN n1-dedup-map's evidence file and append its line-1 binding nonce as the value below -->
upstream_read: n1-dedup-map b15c42d5d73d

## Dropped asserts (5 of 5 targeted)

All 5 dropped from `scripts/test-bundle-state.js` testBundleStateParsing() block (were :151-155,
now removed as a contiguous block after the issue_numbers.length===3 shape assert):

- C1 — `issue_numbers[0] === 42` VALUE re-assert. Content matched n1 map exactly.
  Keeper: test-bundle-claim.js:264 ("Test (1): successful bundle claim [42,47,53]" asserts the
  same VALUE at the claim entrypoint); also walkthrough:17794 bundle E2E journey. Confirmed both
  keepers still exercise the invariant (test-bundle-claim.js Test (1) passed post-prune).
- C2 — `issue_numbers[1] === 47` VALUE re-assert. Content matched. Same keepers as C1.
- C3 — `issue_numbers[2] === 53` VALUE re-assert. Content matched. Same keepers as C1.
- C4 — `bundle_id === 'bundle-42-47-53'` VALUE re-assert. Content matched. Keeper:
  test-bundle-claim.js:273 (Test (9): "bundle_id is sorted ascending -- 53,42,47 ->
  bundle-42-47-53" — same VALUE, plus the ordering property); also walkthrough:17796.
- C5 — `closure_policy === 'all_or_nothing'` VALUE re-assert. Content matched. Keeper:
  test-bundle-claim.js:274; also walkthrough:17798.

Count removed: 5 (target 5, matches n1 worklist and n2/n4 total of 5 in the "n4" row).

## KEEP confirmation

Active-folders reader-shape asserts around :143,:144,:147,:148,:149,:150 (now :143-148 after the
5-line deletion) were left untouched — they are test-bundle-state.js's SOLE coverage of the
active-folders projection (Array.isArray(folders), folders.length===1, folder.project match,
folder.issue_number primary===42, Array.isArray(folder.issue_numbers), issue_numbers.length===3).
Verified via post-edit read of the file: all 6 shape asserts still present, immediately followed
by the (now-collapsed) end of the try block.

Also confirmed untouched (per n1's Conservative-KEEP + n4-constraint list, not part of this
node's worklist): the classifier block (~:204, now shifted -5 lines) and the orient
`bundle_state_incoherent` blocks (~:287-340, now shifted -5 lines) — distinct subjects from the
pruned VALUE re-asserts, no rows in the n1 worklist target them.

## Write-set discipline

`git status --porcelain` in the leg shows exactly one modified file:
`scripts/test-bundle-state.js` (5 deletions, 0 insertions). `test-claim-hardening.js` untouched
(0 changes, matching the n1 map's "0 in test-claim-hardening.js").
