# Advisor Gate: issue-168 Plan

## Verdict: Blueprint is execution-ready. Proceed to Phase 4.

## Blueprint Assessment

The architect blueprint in `.cache/architect.md` is dependency-safe, complete, and implementable without additional context.

### Build Sequence — Dependency Safe
- T1 (GitHub canonical) gates T2 (plugin copy via `cp`) — correct ordering
- T3, T4 (GitLab, Gitea) are independent and can run in parallel with T1
- T5 (test) depends only on T1 being complete — correct
- `npm test` as final gate — authoritative

### Files and Integration Points — Complete
- 3 source files + 1 plugin copy sync (enforced by `validate-script-sync.js`)
- Test function + registration in `simulate-workflow-walkthrough.js`
- No missing integration points; plugin copy uses `cp` not hand-edit per sync contract

### Implementability — Yes
The exact `old` and `new` strings for each catch block are specified verbatim. The test shim discriminates `issue close` (exit 1) from `issue edit` (exit 0) to isolate the close-path assertion. Four assertions specified: exit 0, stderr warning, `remote_issue_closed === 'failed'`, negative control `claim_label_removed === 'removed'`.

### Edge Cases and Error Paths — Covered
- Warning is only at `closeIssue` catch; label-removal and merge-note catches stay `catch (_)` (silent) — correctly scoped
- Exit code stays 0 (merge already succeeded) — correct
- Negative control test assertion proves label removal is NOT silently broken by the shim

### Confirmed Out of Scope
- CWD fix — already applied in all editions (commit fa609dd and subsequent)
- `testSinkMergeMockabilityAndReceipt` — already complete; do not modify
- Exit codes — must stay 0

## Decision

Proceed to Phase 4. No architect revision needed.
