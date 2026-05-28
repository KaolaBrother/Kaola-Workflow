# Advisor Plan Gate: issue-178

## Verdict
Blueprint is sound. Two items to lock before Phase 4 fans out:

1. **`executeRepairs` per-label `gh issue edit` timeout**: The architect blueprint covers `detectStaleLabels` returning `'skipped_timeout'` and `labels_skipped_reason` on the repair object, but doesn't specify what happens when an individual `gh issue edit` call *during* `executeRepairs` times out. Three options:
   - (a) break on first timeout, push timed-out label to `labels_failed`, set `labels_skipped_reason: 'timeout'` top-level on `repaired`
   - (b) count failures and continue, recording a partial repair
   - (c) let it propagate as an uncaught timeout
   **Decision before Task 4**: Option (a) — break on first `gh issue edit` timeout, push timed-out label to `labels_failed`, set top-level `labels_skipped_reason: 'timeout'` on `repaired` object, break loop. Recorded as **D11**.

2. **`tea --version` probe bypass ordering**: Architect notes `KAOLA_TEA_MOCK_SCRIPT` check (line 22) runs BEFORE `tea --version` probe (line 25). Verified by reading `kaola-gitea-forge.js` lines 1-50: mock path returns early at line 22 before reaching line 25 probe. Test suite is safe. Decision: confirmed no additional test scaffolding needed for the probe bypass.

## Resolved Decisions Added to Blueprint
- **D11**: `executeRepairs` per-label `gh issue edit` timeout → break on first timeout, push label to `labels_failed`, set `labels_skipped_reason: 'timeout'` top-level on `repaired`, break loop
- **D8 confirmed**: `tea --version` probe at line 25 needs explicit timeout in production code; mock bypass at line 22 confirmed safe so test suite does not need additional shim

## Overall Assessment
Proceed to Phase 4. Task dependencies (G1 → G2 → G3 → G4) are sound. Byte-identical sync pairs (F1a/F1b, F2a/F2b) must be edited together and validated with `validate-script-sync.js`. All 10 tasks are fully specified.
