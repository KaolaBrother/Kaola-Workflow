# finalization evidence — issue #328

## RED

`node scripts/test-bundle-finalize.js` run before implementation:

```
Test (1): bundle finalize closes all 3 members, removes all roadmap sources, archives one folder
FAIL: roadmap source issue-47.md was removed
FAIL: roadmap source issue-53.md was removed
FAIL: receipt has closed_issues array
FAIL: receipt has failed_issue_closures array
FAIL: receipt has roadmap_sources_removed array
FAIL: receipt has issue_numbers
FAIL: label removed for member 47
FAIL: label removed for member 53
Test (2): warning-first — issue view fails for member 47, recorded in failed_issue_closures, closure still completes
FAIL: receipt has failed_issue_closures
FAIL: receipt has closed_issues
Test (3): single-issue finalize — one issue closed, one roadmap source removed, receipt has NO bundle fields
Test (4): checkClosureInvariants per-issue — violation when bundle member source still present
FAIL: invariants fail when member 47 source still present
FAIL: roadmap-source-absent violation fired for bundle; violations: []

test-bundle-finalize: 12 test(s) FAILED, 31 passed
EXIT_CODE=1
```

Genuine RED: single-issue tests (3) passed, bundle tests (1), (2), (4) failed as expected because the implementation was absent.

## GREEN

After implementation (archiveProjectDir plural removal, cmdFinalize per-member probe/label/receipt, checkClosureInvariants per-issue loop):

```
Test (1): bundle finalize closes all 3 members, removes all roadmap sources, archives one folder
Test (2): warning-first — issue view fails for member 47, recorded in failed_issue_closures, closure still completes
Test (3): single-issue finalize — one issue closed, one roadmap source removed, receipt has NO bundle fields
Test (4): checkClosureInvariants per-issue — violation when bundle member source still present

test-bundle-finalize: all 57 tests passed
EXIT_CODE=0
```

## Four Exit-0 Confirmations

1. `node scripts/test-bundle-finalize.js` → EXIT 0 (57 tests passed)
2. `node scripts/test-bundle-claim.js` → EXIT 0 (63 tests passed)
3. `node scripts/test-bundle-state.js` → EXIT 0 (25 tests passed)
4. `node scripts/simulate-workflow-walkthrough.js` → EXIT 0 ("Workflow walkthrough simulation passed")
5. `node scripts/validate-script-sync.js` → EXIT 0 ("OK: 18 common scripts and 7 byte-identical file group in sync.")

## Byte-Diff Confirmations

```
diff scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js
(no output — byte-identical)
CLAIM_DIFF_EXIT=0

diff scripts/kaola-workflow-roadmap.js plugins/kaola-workflow/scripts/kaola-workflow-roadmap.js
(no output — byte-identical)
ROADMAP_DIFF_EXIT=0
```

## Implementation Summary

### scripts/kaola-workflow-claim.js (+ byte-identical plugin copy)

**archiveProjectDir** (~L1104):
- Read `issue_numbers` raw string early (before `renameSync`) alongside `archiveIssueNumber`.
- In the `statusValue === 'closed'` block: parse `archiveIssueNumbers` from the pre-read raw string; loop the per-issue roadmap removal (including the #297 MAIN-repo staged-source reconcile) over each member; accumulate removed sources into `removedSources` string array.
- `regenerateRoadmap(root)` called ONCE after the loop.
- Return gains `roadmap_sources_removed: removedSources` alongside scalar `roadmap_source_removed`.

**checkClosureInvariants** (~L1251):
- Compute `memberNumbers` from `receipt.issue_numbers` when present, else fall back to scalar `receipt.issue_number` (AC#1 unchanged).
- Loop both `roadmap-source-absent` and `roadmap-mirror-clean` checks over each member N; violation description names the offending issue when bundle (length > 1).
- `in-progress-label-removed` is intentionally kept as a single primary check (per design.md Decision-5 §checkClosureInvariants: "single-label primary check stays — the per-issue label clearing is verified by the warn-first receipt + per-issue clearAdvisoryClaim return values; AC#13 warning-first means a single failed remote close does NOT hard-block"). The task's "per issue" language refers to roadmap-source-absent + roadmap-mirror-clean only; design.md is explicit that in-progress-label is primary-scoped.

**cmdFinalize** (~L1357):
- Read `issueNumbers` from folder (live) or archive dest state (null-folder fallback).
- Per-member `clearAdvisoryClaim` loop when bundle; primary's status feeds `claim_label_removed`.
- Per-member remote close probe using `probeIssueState` (warning-first: `unavailable` → `failedIssueClosures`, `closed` → `closedIssues`, `open` → neither).
- Attach bundle receipt fields AFTER `buildClosureReceipt` call (filter bypass, per Decision-5 trap): `issue_numbers`, `closed_issues`, `failed_issue_closures`, `roadmap_sources_removed`.

**cmdRelease / cmdWatchPr**:
- Additive per-member `clearAdvisoryClaim` loop guarded on `folder.issue_numbers` presence; single-issue scalar call unchanged.
- `roadmap_sources_removed` from `archiveProjectDir` return attached to bundle folder receipt in `cmdWatchPr`.

### scripts/kaola-workflow-roadmap.js (+ byte-identical plugin copy)

No changes required (confirmed zero diff); file is in write set only to verify no incidental touch occurred.

### scripts/test-bundle-finalize.js (new, root-only)

Four tests: bundle-finalize-happy-path, warning-first-probe-failure, single-issue-regression (AC#1), checkClosureInvariants-per-issue-direct. OFFLINE-safe via KAOLA_GH_MOCK_SCRIPT. Drives finalize as subprocess for receipt assertions (the bundle fields are attached in cmdFinalize, not exported via buildClosureReceipt). Uses direct `checkClosureInvariants` call for Test (4) to prove the invariant loop is not vacuous.
