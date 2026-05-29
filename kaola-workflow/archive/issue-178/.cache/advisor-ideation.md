# Advisor Ideation Gate: issue-178

## Verdict
Approach is sound. Four tightening items to lock down before Phase 3 fans out:

1. **Shared-wrapper blast radius**: `active-folders.js:ghExec` is also called by `claim.js`. Adding a default timeout there changes claim.js `gh issue view` behavior too — intentional improvement, but must be named and documented honestly, not look accidental.

2. **Env var name vs scope**: `KAOLA_CLOSURE_AUDIT_TIMEOUT_MS` in `active-folders.js` is wrong if that module isn't closure-audit-specific. Use `KAOLA_GH_REMOTE_TIMEOUT_MS` across all four exec wrappers (or separate per-script vars). Resolved: use `KAOLA_GH_REMOTE_TIMEOUT_MS` as single env var for all four wrappers (ghExec×2, glabExec, teaExec) defaulting to 30000.

3. **Forge re-throw fidelity (GL/GT)**: Verify `glabExec`/`teaExec` do `throw err` (not `throw new Error(err.message)`) so `.killed`/`.signal` survive to closure-audit catch. Must be confirmed in Phase 3 architect before writing GL/GT catches.

4. **`probeIssueState` export and shape**: Confirm it's exported from `active-folders.js` and returns `{state, reason}` today before committing to `collectClosedSet` rewrite.

5. Non-blocking: `executeRepairs` timeout → `labels_failed` keeps timed-out label, `labels_skipped_reason: 'timeout'` is top-level on the repair result. Confirm `KAOLA_TEA_MOCK_SCRIPT` still bypasses `tea --version` probe after Step 11.

## Resolved Decisions (recorded for Phase 3)
- **Env var**: `KAOLA_GH_REMOTE_TIMEOUT_MS` (default 30000) used in all four exec wrappers; document in CHANGELOG that this affects active-folders calls from claim.js (strict improvement)
- **`labels_skipped_reason`**: top-level on the `repaired` object, not per-label
- **`unresolved_closed_state`**: omit-when-empty (field absent from output when array is empty)
- **Hang tests**: use `KAOLA_GH_REMOTE_TIMEOUT_MS=300` to limit test duration; shim loops `while(true){}` — terminates at 300ms, well within outer 60000ms test timeout
