# claim-startup node evidence — issue #328

Node: claim-startup (tdd-guide)
Write set: scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, scripts/test-bundle-claim.js (new)
Scope: AC#2, AC#3, AC#7 — multi-target bundle CLAIM path (Phase-2 claim/startup)

---

## RED

Test file written BEFORE implementation. Run output:

```
Test (1): successful bundle claim [42,47,53]
FAIL: bundle startup exits 0, got 1
stdout: {"verdict":"no_target","claim":"none","project":null,"issue":null}

FAIL: claim is acquired, got "none"
FAIL: status is acquired, got undefined
FAIL: bundle_id is bundle-42-47-53, got undefined
FAIL: result has issue_numbers array
FAIL: state file was created at bundle-42-47-53/workflow-state.md
FAIL: state has issue_number: 42 (primary)
FAIL: state has issue_numbers: 42,47,53
FAIL: state has bundle_id: bundle-42-47-53
FAIL: state has closure_policy: all_or_nothing
FAIL: state has workflow_path: adaptive
FAIL: label added for member 42
FAIL: label added for member 47
FAIL: label added for member 53
FAIL: comment posted for member 42
FAIL: comment posted for member 47
FAIL: comment posted for member 53
Test (2): refused bundle — closed member #47 leaves no active folder, no label
FAIL: status is target_set_has_closed_issue, got undefined
FAIL: refused on issue 47, got null
Test (3): target_ambiguity when both --target-issue and --target-issues set
FAIL: target_ambiguity exits 1, got 0
FAIL: status/verdict is target_ambiguity, got: {"verdict":"green","claim":"acquired",...}
Test (4): target_set_too_large when more than 4 issues (default cap)
FAIL: status is target_set_too_large, got undefined
Test (5): AC#1 regression — single-issue --target-issue N works unchanged
Test (6): target_set_empty when startup called without --target-issue or --target-issues
Test (7): target_set_not_adaptive when --workflow-path is not adaptive
FAIL: status is target_set_not_adaptive, got undefined
Test (8): rollback — add-label fails for member 47, member-42 label torn down, no folder remains
FAIL: rollback claim exits 1 (multiple failures — implementation absent)
Test (8b): target_set_label_rollback_failed — teardown remove-label also fails
FAIL: status is target_set_label_rollback_failed (implementation absent)
Test (9): bundle_id is sorted ascending — 53,42,47 -> bundle-42-47-53
FAIL: sorted bundle claim exits 0, got 1
FAIL: sorted bundle acquired
FAIL: bundle_id sorted: expected bundle-42-47-53, got undefined
FAIL: primary (lowest) is 42, got undefined
Test (10): KAOLA_TARGET_ISSUES env var triggers bundle claim
FAIL: env var bundle claim exits 0, got 1
FAIL: env var bundle acquired
FAIL: bundle_id from env: expected bundle-10-20, got undefined

test-bundle-claim: FAILED
EXIT:1
```

---

## GREEN

Implementation added to `scripts/kaola-workflow-claim.js` (and byte-identical copy to `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`):

1. `parseArgs`: added `--target-issues` / `KAOLA_TARGET_ISSUES` parsing (sorted, deduped int array).
2. `writeState`: additive `issue_numbers` / `bundle_id` / `closure_policy` push block (AC#1: single-issue path byte-identical).
3. `activeByIssue`: bundle-aware — also checks `folder.issue_numbers.includes(issueNumber)`.
4. `addBundleLabel(issueNumber, project)`: NEW bundle-local hard add-label helper; throws on add-label failure (unlike `postAdvisoryClaim` which swallows), enabling the all-or-nothing rollback catch to fire.
5. `removeBundleLabel(issueNumber, project)`: NEW bundle-local hard remove-label helper; throws on remove-label failure, enabling `rollbackOk=false` for `target_set_label_rollback_failed`.
6. `claimBundle(root, opts)`: all-or-nothing provision with catch-block rollback; uses `addBundleLabel` (hard, throws) for the forward add step and `removeBundleLabel` (hard, throws) in the rollback teardown loop. Rollback is genuinely exercisable — not dead code.
7. `claimExplicitBundle(root, args)`: per-member validation with `probeIssueState` (closed check) BEFORE `classifyIssue` (step 4b before 4c) so `target_set_has_closed_issue` fires for closed members instead of being shadowed by `target_set_red`. Refusal codes: `target_set_empty`, `target_set_too_large`, `target_set_not_adaptive`, `workflow_path_refused`, `target_set_conflicts_active_work`, `target_set_has_closed_issue`, `target_set_red`, `target_set_unavailable`, `target_set_unverified`, `target_set_label_rollback_failed`.
8. `cmdStartup`: `target_ambiguity` gate + bundle routing branch.
9. `cmdPickNext`: delegates to `cmdStartup` when `args.targetIssues` set.
10. `module.exports`: added `claimBundle` and `claimExplicitBundle`.

### test-bundle-claim.js GREEN output

```
Test (1): successful bundle claim [42,47,53]
Test (2): refused bundle — closed member #47 leaves no active folder, no label
Test (3): target_ambiguity when both --target-issue and --target-issues set
Test (4): target_set_too_large when more than 4 issues (default cap)
Test (5): AC#1 regression — single-issue --target-issue N works unchanged
Test (6): target_set_empty when startup called without --target-issue or --target-issues
Test (7): target_set_not_adaptive when --workflow-path is not adaptive
Test (8): rollback — add-label fails for member 47, member-42 label torn down, no folder remains
Test (8b): target_set_label_rollback_failed — teardown remove-label also fails
Test (9): bundle_id is sorted ascending — 53,42,47 -> bundle-42-47-53
Test (10): KAOLA_TARGET_ISSUES env var triggers bundle claim

test-bundle-claim: all 63 tests passed
EXIT:0
```

### test-bundle-state.js (prior node, still passing)

```
Test (a): parseStateFile reads issue_numbers into an array
Test (b): single-issue state file yields issue_numbers: [] (AC#1 regression)
Test (c): classifier blocks issue #47 (member of live bundle [42,47,53])
Test (d): classifier does NOT block issue #77 (non-member)

test-bundle-state: all 25 tests passed
EXIT:0
```

### simulate-workflow-walkthrough.js (single-issue regression)

```
Workflow walkthrough simulation passed
EXIT:0
```

### validate-script-sync.js (byte-pair confirmation)

```
OK: 18 common scripts and 7 byte-identical file group in sync.
EXIT:0
```

### Byte-diff confirmation

```
diff scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js
(no output — files are byte-identical)
DIFF_EXIT:0
```

---

## Design contract compliance

- AC#1: single-issue path byte-identical — `writeState` only pushes `issue_numbers`/`bundle_id`/`closure_policy` when `Array.isArray(data.issue_numbers) && data.issue_numbers.length` (guarded push). Verified by test (5).
- AC#2: `--target-issues A,B,C` / `KAOLA_TARGET_ISSUES` parsed in `parseArgs`; sorted+deduped; bundle claim path wired in `cmdStartup`. Verified by tests (1), (9), (10).
- AC#3: all-or-nothing claim: refusals before mutation leave no folder/label (tests 2,3,4,6,7); mid-provision failure (add-label throws) tears down applied labels in reverse order (test 8); teardown failure returns `target_set_label_rollback_failed` with partial evidence (test 8b).
- AC#7: typed refusal codes match design.md v1 set exactly. `target_set_has_closed_issue` is now fireable (probe runs before classifier). `target_set_label_rollback_failed` is now fireable (removeBundleLabel throws on failure). All 10 v1 codes verified.
- Byte-lock: `diff` confirmed identical; `validate-script-sync.js` exits 0.
- Execution-order: claim-startup edits only `parseArgs`, `writeState`, `activeByIssue`, new `addBundleLabel`/`removeBundleLabel`/`claimBundle`/`claimExplicitBundle`, `cmdStartup`, `cmdPickNext`, `module.exports`. `cmdFinalize`/`archiveProjectDir`/`checkClosureInvariants`/watch-pr/discard untouched (finalization node's scope).

## Advisor-review fixes applied (post-initial-GREEN)

**Fix 1 — `target_set_has_closed_issue` reachability**: Moved `probeIssueState` closed check to run BEFORE `classifyIssue` in `claimExplicitBundle`'s per-member loop. Previously the classifier returned `verdict:'red'` for closed issues, causing `target_set_red` to fire first and making `target_set_has_closed_issue` unreachable. Now probe runs at step 4b (before classifier at 4c), so a closed member gets the dedicated code. Test (2) updated to assert `target_set_has_closed_issue` specifically.

**Fix 2 — rollback is real**: Added `addBundleLabel` (throws on add-label failure) and `removeBundleLabel` (throws on remove-label failure) as bundle-local hard helpers. `claimBundle`'s forward step now uses `addBundleLabel` instead of `postAdvisoryClaim`; the rollback teardown loop uses `removeBundleLabel` instead of `clearAdvisoryClaim`. Both helpers propagate gh errors so the catch block can detect failures and set `rollbackOk=false`. Test (8) now exercises real mid-provision rollback (label-added:42 logged, then label-removed:42 after member-47 throws). Test (8b) now exercises `target_set_label_rollback_failed` (teardown remove-label also throws). The mock updated to support `throwOnRemoveLabel` option.
