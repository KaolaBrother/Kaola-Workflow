# TDD Task T1 — Over-cap test: GitHub walkthrough

## Status: RED confirmed

## Changes made
File: `scripts/simulate-workflow-walkthrough.js`
- Inserted `testClosureAuditTimeoutEnvOverCapFallsBack` function after line 3599 (now at line 3601)
- Registered `testClosureAuditTimeoutEnvOverCapFallsBack();` after line 3773 (now at line 3803)

## RED evidence
```
testClosureAuditTimeoutEnvInvalidFallsBack: PASSED
Error: over-cap KAOLA_GH_REMOTE_TIMEOUT_MS must be clamped and detect closed issue as closed_remote, got: []
    at assert (.../simulate-workflow-walkthrough.js:20:25)
    at testClosureAuditTimeoutEnvOverCapFallsBack (.../simulate-workflow-walkthrough.js:3620:5)
    at main (.../simulate-workflow-walkthrough.js:3803:5)
```

Probe throws ERR_OUT_OF_RANGE (timeout:1e21), sources=[], assert fails. Expected RED.
