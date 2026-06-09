# regression-tests node — evidence

**Issue:** #328 (bundle lane)
**Node:** regression-tests (tdd-guide)
**Date:** 2026-06-10
**Write-set file:** `scripts/simulate-workflow-walkthrough.js`

---

## What was added

Six new E2E integration test functions were appended to
`scripts/simulate-workflow-walkthrough.js` and registered in `main()` after the
`testFinalizeIncompleteWorktreeReentryFix` call:

| Function | Scenario | ACs guarded |
|---|---|---|
| `testBundleClaimCreatesOneFolder` | `--target-issues 42,47,53` creates ONE active folder + branch; state has `issue_numbers`/`bundle_id`/`closure_policy`; labels applied per member | AC#2, AC#3 |
| `testBundleRefusalLeavesNoFolder` | Closed member #47 → `target_set_has_closed_issue`; no bundle folder; gh log has zero label-added lines | AC#5, AC#6 |
| `testBundleDuplicateIssueBlocking` | Live bundle `[42,47,53]` → direct claim of member 47 returns `owned` (bundle-aware reuse); overlapping bundle `[47,77]` → `target_set_conflicts_active_work` | AC#8 |
| `testBundleAdaptiveResumeSurfacesBundleIdentity` | `adaptive-node orient --json --project bundle-42-47-53` surfaces `bundleId`, `issueNumbers`, `primaryIssue`, `closurePolicy` in JSON | AC#14 orient surface |
| `testBundleFinalizeRoadmapCleanup` | Finalize removes all three `.roadmap/issue-N.md` files, regenerates ROADMAP once (`roadmap_regenerated: 'regenerated'`), archives ONE folder, receipt has `closed_issues`/`failed_issue_closures`/`roadmap_sources_removed` | AC#11, AC#12, AC#13 |
| `testBundleSingleIssueStateHasNoBundleFields` | Single-issue claim state has NO `issue_numbers:` / `bundle_id:` / `closure_policy:` lines (AC#1 byte-identical guard) | AC#1 |

Additional infrastructure added:
- `writeBundleGhMockScript(binDir, opts)` helper (inline gh mock; records `label-added:N` in logFile)
- `const adaptiveNodeScript` constant at top of file (line 20)

Total new assertions: approximately 55 (across all six functions, including branch, labels, and roadmap_regenerated checks).

---

## RED

Temporary mutation: changed the expected `bundle_id` in `testBundleClaimCreatesOneFolder`
from `'bundle-42-47-53'` to `'bundle-WRONG-99'`.

Command run:
```
node scripts/simulate-workflow-walkthrough.js
```

Output (tail):
```
testFinalizeIncompleteWorktreeReentryFix: PASSED
Error: #328 claim: bundle_id must be bundle-42-47-53, got "bundle-42-47-53"
    at assert (.../simulate-workflow-walkthrough.js:25:25)
    at testBundleClaimCreatesOneFolder (.../simulate-workflow-walkthrough.js:9784:5)
    at main (.../simulate-workflow-walkthrough.js:9343:5)
```

The suite aborted on the first failing assertion in `testBundleClaimCreatesOneFolder`.
The error message confirms the real implementation returns `bundle_id: "bundle-42-47-53"` and
the wrong expected value `'bundle-WRONG-99'` caused the failure — proving the assertion has
teeth and is not a vacuous true.

---

## GREEN

Mutation reverted: restored `'bundle-42-47-53'` as expected value.

Command run:
```
node scripts/simulate-workflow-walkthrough.js
```

Output (tail):
```
testFinalizeIncompleteWorktreeReentryFix: PASSED
testBundleClaimCreatesOneFolder: PASSED
testBundleRefusalLeavesNoFolder: PASSED
testBundleDuplicateIssueBlocking: PASSED
testBundleAdaptiveResumeSurfacesBundleIdentity: PASSED
testBundleFinalizeRoadmapCleanup: PASSED
testBundleSingleIssueStateHasNoBundleFields: PASSED
Workflow walkthrough simulation passed
```

Exit code: 0

---

## Companion test files still pass

```
node scripts/test-bundle-state.js
→ test-bundle-state: all 25 tests passed

node scripts/test-bundle-claim.js
→ test-bundle-claim: all 63 tests passed

node scripts/test-bundle-finalize.js
→ test-bundle-finalize: all 57 tests passed
```

All three companion test files are unmodified (outside write-set) and pass unchanged.

---

## Design contract coverage

Assertions were derived directly from the contracts in
`kaola-workflow/issue-328/.cache/design.md`:

- **Decision 3 (state format):** `issue_number:` scalar + `issue_numbers:` CSV +
  `bundle_id:` + `closure_policy: all_or_nothing` + `branch: workflow/bundle-42-47-53`
  asserted in `testBundleClaimCreatesOneFolder` and negated in
  `testBundleSingleIssueStateHasNoBundleFields`.
- **Naming (§Naming):** `bundle-42-47-53` (sorted ascending) asserted in claim and finalize tests.
- **Rollback (§Rollback):** pre-mutation validation exercised via closed-member path in
  `testBundleRefusalLeavesNoFolder` (no folder created, gh log has zero `label-added:` lines —
  labels live after validation in `claimBundle`, so a pre-mutation refusal must produce none).
- **Finalization receipt (Decision 5):** `closed_issues`, `failed_issue_closures`,
  `roadmap_sources_removed` (3 entries), `roadmap_regenerated: 'regenerated'`
  asserted in `testBundleFinalizeRoadmapCleanup`.
- **runOrient fields (#328 AC14):** `bundleId`, `issueNumbers`, `primaryIssue`, `closurePolicy`
  asserted in `testBundleAdaptiveResumeSurfacesBundleIdentity`.
- **AC#1 byte-identity:** absence of bundle fields in single-issue state asserted in
  `testBundleSingleIssueStateHasNoBundleFields`.

verdict: pass
findings_blocking: 0
