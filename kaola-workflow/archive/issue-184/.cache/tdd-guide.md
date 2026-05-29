# TDD Guide Working Notes — issue #184

## Approach deviations from plan

### Fix #2 test: fail-fast shim that returns "closed" (not hang shim, not exit-1 shim)
First iteration: used exit-1 shim. Advisor caught that this was vacuous: `NaN` timeout throws `ERR_OUT_OF_RANGE` but is caught by `probeIssueState`'s try/catch → `unavailable` → unresolved (same as the fix #1 test). Test passed with or without fix #2.

Second iteration: redesigned to a "closed" success-returning shim. With invalid env (no fallback):
- NaN → `execFileSync` throws `ERR_OUT_OF_RANGE` → caught → `unavailable` → fix #1 routes to `unresolved` → NOT `closed_remote` → stale_roadmap_sources is `[]` → assert fails (correct RED).
With fix #2 (fallback 30000):
- 30000 → shim returns `{"state":"closed"}` → `closed` → `closed_remote` detected → sources includes 941 → assert passes (correct GREEN).

Empirically confirmed RED: reverted both root `active-folders.js` and `closure-audit.js` fix #2 simultaneously (the `probeIssueState` and `ghExec` that matters is in `active-folders.js`, not `closure-audit.js`). Confirmed GREEN with both restored.

## RED→GREEN per fix

### Fix #1 — collectClosedSet keys on state not reason
RED: `testClosureAuditProbeFailureUnresolved` — `issue view` exit(1) → `probeIssueState` returns `{state:'unavailable', reason:'gh issue fetch failed'}` — old code keyed on `probe.reason === 'timeout'` (false) → issue NOT added to unresolved → `unresolved_closed_state: undefined`. Assert fails: "must include 940 when issue view exits non-zero, got: undefined"
GREEN after: `probe.state === 'unavailable'` is a superset — catches both timeout and fetch-failed.

Regression preserved: `testClosureAuditUnresolvedClosedState` (hang shim → kills → SIGTERM → state:'unavailable') and `testClosureAuditStaleLabelsTimeout` still pass because `unavailable` still excludes OFFLINE's `state:'open'`.

### Fix #2 — validate KAOLA_GH_REMOTE_TIMEOUT_MS
RED: `testClosureAuditTimeoutEnvInvalidFallsBack` with `KAOLA_GH_REMOTE_TIMEOUT_MS:'not-a-number'` — old code: `parseInt('not-a-number', 10)` → NaN → `execFileSync(..., {timeout: NaN})` → Node throws `ERR_OUT_OF_RANGE` on first remote call → audit exits non-zero. Assert fails: "closure-audit should exit 0" (runClosureAudit asserts exit 0).
GREEN after: IIFE validates NaN → returns 30000 → no ERR_OUT_OF_RANGE. Shim answers instantly.

Applied to: root/Codex `closure-audit.js` line 42, root/Codex `active-folders.js` line 9. GitLab/Gitea forge use `remoteTimeoutMs()` helper (per-call, as directed — not module-top const).

### Fix #3 — GitLab probeIssueState OFFLINE guard
RED: `testGitlabProbeIssueStateOfflineGuard` — subprocess with `KAOLA_WORKFLOW_OFFLINE=1` calling `probeIssueState(42)` — old code: only guarded `if (issueIid == null)`, not OFFLINE → attempted `forge.viewIssue(42)` → glab not in PATH → throws → returns `{state:'unavailable', reason:'glab issue fetch failed'}`. Assert fails: expected `state:'open', reason:'offline-or-null'`.
GREEN after: `if (OFFLINE || issueIid == null)` guard added; OFFLINE const added at module top after forge require.

### Fix #4 — propagate detection-phase skipped_timeout into --execute
RED: `testClosureAuditExecuteDetectionTimeoutPropagates` — hang shim + `--execute` + 300ms timeout → `detectStaleLabels()` returns `'skipped_timeout'` → old code: `if (Array.isArray(labels))` (false for string) → `labelsSkippedReason` stays null → `repairedObj` has no `labels_skipped_reason`. Assert fails: "expected detection_timeout, got: undefined".
GREEN after: `if (labels === 'skipped_timeout') { labelsSkippedReason = 'detection_timeout'; }` branch added before Array check. Distinct from repair-phase 'timeout' sentinel (which fires when `forge.updateIssue` itself times out).

## Byte-sync
- Validated baseline: `node scripts/validate-script-sync.js` → OK before edits
- Applied all root edits to closure-audit.js and active-folders.js
- Ran `cp scripts/kaola-workflow-closure-audit.js plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js`
- Ran `cp scripts/kaola-workflow-active-folders.js plugins/kaola-workflow/scripts/kaola-workflow-active-folders.js`
- Re-validated: `node scripts/validate-script-sync.js` → OK

## Acceptance command output (full)
```
OK: 10 common scripts and 2 byte-identical file group in sync.
Workflow contract validation passed
Kaola-Workflow Codex contract validation passed
[npm test → all 4 suites pass, exit 0]
```

Suites:
- test:kaola-workflow:claude → Workflow walkthrough simulation passed
- test:kaola-workflow:codex → Kaola-Workflow walkthrough simulation passed  
- test:kaola-workflow:gitlab → GitLab workflow walkthrough simulation passed + GitLab Codex workflow walkthrough simulation passed
- test:kaola-workflow:gitea → Gitea workflow walkthrough simulation passed + Gitea Codex workflow walkthrough simulation passed
