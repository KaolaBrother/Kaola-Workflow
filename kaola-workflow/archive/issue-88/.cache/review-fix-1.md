# Review Fix 1 — Issue #88 (HIGH 1 + HIGH 2 + MEDIUM 1)

## Status: COMPLETE

## Fixes Applied

### Fix 1 (HIGH): Exit code regression in repair-state main()
`kaola-gitlab-workflow-repair-state.js:405`
Changed: `if (!result.repaired && !result.complete) process.exitCode = 1;`
To: `if (!result.repaired && !result.complete && !result.valid) process.exitCode = 1;`
Test added: CLI subprocess test confirms valid+current exits 0.

### Fix 2 (HIGH): classifyIssue bypasses guards
`kaola-gitlab-workflow-classifier.js`
Added `readOrCreateConfig()` parallel_mode bypass + `issueHasWorkflowInProgressLabel` + `issueHasRemoteClaimNotes` guard to `classifyIssue()`.
Stale test at line 272 updated: `'green'` → `'blocked'` (old behavior, pre-Gap-3).
Stale test at line 307: `labels: [forge.CLAIM_LABEL]` → `labels: []` (acquisition happy-path had pre-set claim label).
Two new tests added: Fix 2a (parallel_mode bypass subprocess), Fix 2b (label-blocked via withForge).

### Fix 3 (MEDIUM): readOrCreateConfig silent overwrite on malformed JSON
`kaola-gitlab-workflow-classifier.js:38`
Changed catch block to `if (err.code !== 'ENOENT') throw err;` before overwriting.

## RED Evidence
- Fix 1: CLI subprocess test asserting exit 0 failed with status 1.
- Fix 2b: `classifyIssue(92)` returned `{verdict: 'green'}` instead of `'blocked'`.

## GREEN Evidence
```
GitLab workflow script tests passed   EXIT: 0
Workflow walkthrough simulation passed   EXIT: 0
```
