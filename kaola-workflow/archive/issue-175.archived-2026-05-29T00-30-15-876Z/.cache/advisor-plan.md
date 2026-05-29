# Advisor Plan Gate: issue-175

## Verdict
Blueprint approved with one required addition and two confirmations.

## Required Addition (blocking)

### Add end-to-end startup IIFE to cover Site A (classifyIssue)
All 4 planned regression tests use `spawnSync(classifierScript, 'classify', '--issue', ...)` which exercises only Site B (`cmdClassify`). The Site A guard inside `classifyIssue()` — which is the **production path** (claim.js calls classifyIssue directly via module-import) — has no automated coverage.

Add a 5th IIFE for both GL and GT test files that calls:
```js
spawnSync(process.execPath, [claimScript, 'startup', '--runtime', 'test', '--target-issue', 'N'], ...)
```
with `KAOLA_WORKFLOW_OFFLINE=1` and no evidence, asserting:
- `result.status === 1` (exit code)
- `out.verdict === 'target_unverified'`
- `out.claim === 'none'`
- no `kaola-workflow/issue-N/` folder created

Model on the existing IIFE at GL:832-849 / GT:827-849 which tests the `user_target_blocked` startup path. This approach matches the existing test harness invocation pattern and covers the critical production path end-to-end.

## Confirmations

### R1 resolved
`writeState()` writes `issue_iid:` fields (GL test file line 57). `readActiveFolders` returns records with `issue_iid` keys (confirmed at lines 398-400 of GL test file). The fixture approach for `owned-routes` and `unrelated-active` tests is valid — no alternate fixture needed.

### Line numbers are approximate
Implementer must grep for `if (OFFLINE)` and `target_unavailable` at edit time. The architect correctly flagged this.

## Non-blocking Notes

- R2 (no `main()` runner in GL/GT test files): IIFE style is correct for this codebase. Confirmed.
- R3 (`issue_iid` not `issue_number`): Critical field-name check. Run `grep "issue_number" <new guard code>` — must return zero hits.
- R4 (CHANGELOG): Handle in Phase 6 doc-docking as usual.
- Build sequence G1→G2→G3 is dependency-safe. A developer can implement from this plan alone.

## Updated Test Count per Edition
- 1 IIFE replaced (wrong `verdict:'green'` → correct `verdict:'target_unverified'`)
- 4 new IIFE blocks added (roadmap-acquires, owned-routes, unrelated-active-folder, startup-end-to-end)
- Total new assertions: 5 IIFEs per edition
