# TDD Guide Output — issue-189

## TDD Sequence
1. Added `testClassifierDependsOnGate()` and registered — suite failed with "dep CLOSED: expected verdict not blocked (regression for #189), got blocked" (RED)
2. Applied one-line fix in `scripts/kaola-workflow-classifier.js` at line 258: `depState = String(JSON.parse(raw).state || 'open').toLowerCase()`
3. Updated 5 mock sites in `scripts/simulate-workflow-walkthrough.js` to real-gh uppercase (`"CLOSED"` / `"OPEN"`)
4. Full suite re-run — all tests pass (GREEN)

## Files Changed
- `scripts/kaola-workflow-classifier.js` — line 258 normalize depState on read
- `scripts/simulate-workflow-walkthrough.js` — new testClassifierDependsOnGate(), runner registration, 5 mock sites updated

## Acceptance Check Output
```
Workflow walkthrough simulation passed
```
Exit 0.
