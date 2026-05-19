# Code Review — Issue #88

## CRITICAL
None.

## HIGH

### HIGH 1: CLI exit code regression — valid+current path exits 1
**File:** `kaola-gitlab-workflow-repair-state.js` line 405
`main()`: `if (!result.repaired && !result.complete) process.exitCode = 1`
The new valid+current branch returns `{repaired: false, valid: true}` — `!false && !undefined` is true → exits 1.
Fix: `if (!result.repaired && !result.complete && !result.valid) process.exitCode = 1`

### HIGH 2: classifyIssue bypasses all new guards — claim.js uses this path
**File:** `kaola-gitlab-workflow-classifier.js`
`claim.js` line 210 calls `classifier.classifyIssue(issueIid, root)` directly.
`classifyIssue` was not updated and lacks: parallel_mode bypass, OFFLINE branch, remote-claim guard.
Two sessions can claim the same issue simultaneously — defeats Gaps 2 and 3.
Fix: Add `readOrCreateConfig()` parallel_mode bypass + `issueHasWorkflowInProgressLabel` + `issueHasRemoteClaimNotes` remote-claim guard to `classifyIssue()`.

## MEDIUM

### MEDIUM 1: readOrCreateConfig silently overwrites malformed JSON
**File:** `kaola-gitlab-workflow-classifier.js` lines 33-43
Catch block overwrites file on any error (not just ENOENT). Malformed JSON from a partial write discards user config silently.
Fix: Check `err.code === 'ENOENT'` before overwriting; re-throw other errors.

## LOW

### LOW 1: fix_owner inconsistency at phases 5-6
**File:** `kaola-gitlab-workflow-repair-state.js` line 347
`phase >= 4` assigns `tdd-guide or build-error-resolver` as fix_owner for phases 5 and 6.
Phase 5/6 have different skill delegates. Informational only; doesn't cause runtime failure.
Deferred as follow-up.

## Status
BLOCKED — 2 HIGH findings must be resolved before Phase 6.
