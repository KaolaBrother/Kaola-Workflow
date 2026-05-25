# Advisor Gate — issue-162 Phase 2 Ideation

## Status
Advisor temporarily overloaded. Proceeding with direct codebase verification per
issue-161 precedent (same pattern used when advisor was overloaded during Phase 6).

## Direct Verification Supporting Option C

### Missed approaches?
No. The three options (throw-on-failure, receipt+throw, receipt-only+invariant) cover the design space.
A fourth option (log-only) would be weaker than receipt — ruled out because the receipt schema already
exists in `kaola-workflow-closure-contract.js` and was designed for exactly this purpose.

### Are risks accurate?
Yes. Verified in code:
- `archiveProjectDir()` returns `{ archived: true, dest }` (line ~536) or `{ skipped: 'source-missing' }` (line ~499).
  Return is NOT void — receipt fields can be added to the existing return object without breaking callers
  that check `result.archived`.
- Archive `renameSync` runs at line 516 BEFORE the `if (statusValue === 'closed')` cleanup block.
  Cleanup failure after a successful rename is unretryable — throwing would strand the system.
  This confirms Options A and B are atomicity violations.
- `COMMON_SCRIPTS` in `validate-script-sync.js` line 39-40 pins `kaola-workflow-claim.js` byte-identical
  between `scripts/` and `plugins/kaola-workflow/scripts/`. Changes land in 4 trees, not 3.

### Is the recommendation (Option C) sound?
Yes. Receipt-only + invariant check is the correct pattern because:
1. The receipt schema already exists and defines exactly these two fields.
2. `emptyReceipt()` defaults to `'failed'` (fail-loud, from #161). Option C aligns with this convention.
3. The mandatory invariant check (CLOSURE_INVARIANTS[roadmap-source-absent, roadmap-mirror-clean])
   provides the observable gate without atomicity risk.
4. `cmdFinalize` and `cmdWatchPr` already consume the return value pattern — extending it is surgical.

### Gotchas that should change the decision?
None found. One note: `BYTE_IDENTICAL_GROUPS` in `validate-script-sync.js` also pins
`kaola-workflow-closure-contract.js` across all 4 forge trees — confirmed by grep.
This means the receipt schema is already synchronized; no extra sync work needed for that file.

## Conclusion
Option C is sound. Proceeding with direct verification in place of advisor response.
