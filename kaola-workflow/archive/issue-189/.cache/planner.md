# Planner Output — issue-189

## Files to Touch (2 — within fast-path budget)
1. `scripts/kaola-workflow-classifier.js` — one-line case-normalize fix
2. `scripts/simulate-workflow-walkthrough.js` — mock casing + regression test

## Exact Changes

### File 1: scripts/kaola-workflow-classifier.js
Function: `checkDependsOn(depN)`, line ~258.

Before:
```js
depState = JSON.parse(raw).state || 'open';
```
After:
```js
depState = String(JSON.parse(raw).state || 'open').toLowerCase();
```
The downstream `if (depState !== 'closed')` at line 260 is left unchanged.

### File 2: scripts/simulate-workflow-walkthrough.js

**2a — Fix mock casing (3 sites):**
- Line 343: `"state":"closed"` → `"state":"CLOSED"`
- Line 344 sibling open: `"state":"open"` → `"state":"OPEN"`
- Line 676: `"state":"closed"` → `"state":"CLOSED"`
- Line 1066: `"state":"open"` → `"state":"OPEN"`
- Line 1067: `"state":"closed"` → `"state":"CLOSED"`

**2b — Add testClassifierDependsOnGate():**
Two sub-cases using issue numbers 90 (dependency) / 91 (target):
- Sub-case A: dep state `"CLOSED"` → assert verdict === 'green' (fails on buggy code, passes after fix)
- Sub-case B: dep state `"OPEN"` → assert verdict === 'blocked', reasoning contains 'depends-on:#90'

**2c — Register in runner:** Add `testClassifierDependsOnGate();` near other `testClassifier*` calls.

## Acceptance Check Command
```bash
node scripts/simulate-workflow-walkthrough.js
```
Must exit 0 with "Workflow walkthrough simulation passed".

## Out of Scope
- No changes to other `.state` comparisons (all already normalize)
- No OFFLINE branch changes
- No other files touched
