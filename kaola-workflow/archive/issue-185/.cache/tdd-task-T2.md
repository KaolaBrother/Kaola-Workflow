# TDD Task T2 — Over-cap test: GitLab

## Status: RED confirmed

## Changes made
File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- Inserted `testClosureAuditTimeoutEnvOverCapFallsBack` function after line 2317 (now at line 2319)
- Registered `testClosureAuditTimeoutEnvOverCapFallsBack();` after line 2394 (now at line 2421)

## RED evidence
```
testClosureAuditTimeoutEnvInvalidFallsBack: PASSED
AssertionError [ERR_ASSERTION]: over-cap KAOLA_GH_REMOTE_TIMEOUT_MS must be clamped and detect
  closed issue as closed_remote, got: []
    at testClosureAuditTimeoutEnvOverCapFallsBack (…:2335:5)
```

Probe throws ERR_OUT_OF_RANGE, sources=[], assert fails. Expected RED.
