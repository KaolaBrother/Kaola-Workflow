# TDD Task T3 — Over-cap test: Gitea

## Status: RED confirmed

## Changes made
File: `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- Inserted `testClosureAuditTimeoutEnvOverCapFallsBack` function after line 2244 (now at line 2246)
- Registered `testClosureAuditTimeoutEnvOverCapFallsBack();` after line 2353 (now at line 2381)
- Gitea plural verbs `issues view` / `issues list` correctly used

## RED evidence
```
testClosureAuditTimeoutEnvInvalidFallsBack: PASSED
AssertionError [ERR_ASSERTION]: over-cap KAOLA_GH_REMOTE_TIMEOUT_MS must be clamped and detect
  closed issue as closed_remote, got: []
    at testClosureAuditTimeoutEnvOverCapFallsBack (…test-gitea-workflow-scripts.js:2263:5)
```

Probe throws ERR_OUT_OF_RANGE, sources=[], assert fails. Expected RED.
