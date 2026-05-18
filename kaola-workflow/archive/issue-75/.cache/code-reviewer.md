# Code Review: issue-75 — Lifecycle Cleanup Gaps

## Files Reviewed
- `scripts/kaola-workflow-claim.js`
- `scripts/simulate-workflow-walkthrough.js`

## Findings

### [MEDIUM] cmdRelease cannot operate on drift folders surfaced by cmdStatus

**File:** `scripts/kaola-workflow-claim.js`, lines 452–461 and 297–299

`cmdStatus` now partitions folders into `active` and `drift` (closed-issue folders with `status: active` on disk). A user who sees a drift entry and tries to clean it up via `release --project <name>` will be silently blocked. The call chain is:

```
cmdRelease → activeByProject(root, args.project)
           → readActiveFolders(root)          // default: excludeClosedIssues: true
           → skips the drift folder
           → returns null
           → output({ released: false, reason: '...' }, 1)
```

The `cmdStatus` output now advertises drift folders but offers no corresponding remediation surface. Whether fixing this is in scope for issue #75 should be confirmed against the acceptance criteria.

**Disposition**: OUT OF SCOPE per phase2-ideation.md "Do NOT add a drift cleanup command." Track as follow-up.

---

### [LOW] Outer try/catch around removeWorktree is unreachable dead code

**File:** `scripts/kaola-workflow-claim.js`, lines 441, 459, 570, 574

`removeWorktree` catches its own errors internally and never throws. The four `try { ... } catch (_) {}` wrappers are dead code. They are harmless and match the reference pattern from `sink-merge.js:227` (per phase3-plan.md).

**Disposition**: Intentional pattern match. Not blocking.

---

### [LOW] count field semantics changed — note for changelog

**File:** `scripts/kaola-workflow-claim.js`, line 476

`count` now equals `active.length` only (excludes drift). Any external consumer parsing `count` as total-of-all folders would silently get the wrong value. Note in PR description.

**Disposition**: Acceptable additive schema change per plan. Not blocking.

---

### [LOW] testWatchPrArchivesClosedIssuePrFolder does not verify worktree removal

**File:** `scripts/simulate-workflow-walkthrough.js`

The planted folder has no real git worktree, so `removeWorktree` exits via early `!fs.existsSync(wtPath)` guard. The `testFinalizeReleaseCleansWorktree` covers real-worktree teardown. Acceptable coverage gap.

**Disposition**: Not blocking.

---

## Checklist

- Logic correctness: All 6 fixes are correct
- Security: No new attack surface
- File size: Both files within 800-line limit
- Debug artifacts: None in production code paths
- Test quality: All 4 new tests have meaningful assertions, proper cleanup

## Review Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH     | 0 |
| MEDIUM   | 1 (out of scope) |
| LOW      | 3 (non-blocking) |

**Verdict: APPROVE with notes**
